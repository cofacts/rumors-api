import { GraphQLList } from 'graphql';
import client from 'util/client';

import {
  createFilterType,
  createCommonListFilter,
  attachCommonListFilter,
  createSortType,
  getSortArgs,
  getSearchOrderBy,
  pagingArgs,
  moreLikeThisInput,
  buildKnnQuery,
  ReplyEmbeddingFilterInput,
  DEFAULT_DOC_SIMILARITY,
} from 'graphql/util';
import scrapUrls from 'util/scrapUrls';
import { createEmbedding, getQueryEmbeddingCacheId } from 'util/embedding';

import { ReplyConnection } from 'graphql/models/Reply';
import ReplyTypeEnum from 'graphql/models/ReplyTypeEnum';

export default {
  args: {
    filter: {
      type: createFilterType('ListReplyFilter', {
        ...createCommonListFilter('replies'),
        moreLikeThis: {
          type: moreLikeThisInput,
        },
        embedding: {
          type: ReplyEmbeddingFilterInput,
          description:
            'Opt-in hybrid search with `moreLikeThis`; pass `{}` for the default threshold. ' +
            'The query text embedding is only created when logged in. Omit for BM25-only (default).',
        },
        type: {
          type: ReplyTypeEnum,
          // FIXME: No deprecationReason for input object types yet
          // https://github.com/graphql/graphql-spec/pull/525
          description: '[Deprecated] use types instead.',
        },
        types: {
          type: new GraphQLList(ReplyTypeEnum),
          description: 'List the replies of certain types',
        },
      }),
    },
    orderBy: {
      type: createSortType('ListReplyOrderBy', ['_score', 'createdAt']),
      description:
        'Defaults to `_score` descending when `filter.moreLikeThis` is given.',
    },
    ...pagingArgs,
  },
  async resolve(
    rootValue,
    { filter = {}, orderBy = [], ...otherParams },
    { userId, appId, loaders, user }
  ) {
    const body = {
      sort: getSortArgs(getSearchOrderBy(orderBy, !!filter.moreLikeThis)),
      track_scores: true, // for _score sorting
    };

    // Collecting queries that will be used in bool queries later
    const shouldQueries = []; // Affects scores
    const filterQueries = []; // Not affects scores

    attachCommonListFilter(filterQueries, filter, userId, appId);

    if (filter.moreLikeThis) {
      const scrapResults = (
        await scrapUrls(filter.moreLikeThis.like, {
          client,
          cacheLoader: loaders.urlLoader,
        })
      ).filter((r) => r);

      const likeQuery = [
        filter.moreLikeThis.like,
        ...scrapResults.map(({ title, summary }) => `${title} ${summary}`),
      ];

      shouldQueries.push(
        {
          more_like_this: {
            fields: ['text'],
            like: likeQuery,
            min_term_freq: 1,
            min_doc_freq: 1,
            minimum_should_match:
              filter.moreLikeThis.minimumShouldMatch || '10<70%',
          },
        },
        {
          more_like_this: {
            fields: ['reference'],
            like: likeQuery,
            min_term_freq: 1,
            min_doc_freq: 1,
            minimum_should_match:
              filter.moreLikeThis.minimumShouldMatch || '10<70%',
          },
        },
        {
          nested: {
            path: 'hyperlinks',
            score_mode: 'sum',
            query: {
              more_like_this: {
                fields: ['hyperlinks.title', 'hyperlinks.summary'],
                like: likeQuery,
                min_term_freq: 1,
                min_doc_freq: 1,
                minimum_should_match:
                  filter.moreLikeThis.minimumShouldMatch || '10<70%',
              },
            },
            inner_hits: {
              highlight: {
                order: 'score',
                fields: {
                  'hyperlinks.title': {
                    number_of_fragments: 1, // Return only 1 piece highlight text
                    fragment_size: 200, // word count of highlighted fragment
                    type: 'plain',
                  },
                  'hyperlinks.summary': {
                    number_of_fragments: 1, // Return only 1 piece highlight text
                    fragment_size: 200, // word count of highlighted fragment
                    type: 'plain',
                  },
                },
                require_field_match: false,
                pre_tags: ['<HIGHLIGHT>'],
                post_tags: ['</HIGHLIGHT>'],
              },
            },
          },
        }
      );

      // Additionally, match the scrapped URLs with other reply's scrapped urls
      //
      const urls = scrapResults.reduce((urls, result) => {
        if (!result) return urls;

        if (result.url) urls.push(result.url);
        if (result.canonical) urls.push(result.canonical);
        return urls;
      }, []);

      if (urls.length > 0) {
        shouldQueries.push({
          nested: {
            path: 'hyperlinks',
            score_mode: 'sum',
            query: {
              terms: {
                'hyperlinks.url': urls,
              },
            },
          },
        });
      }
    }

    /* deprecated */
    if (filter.type) {
      filterQueries.push({ term: { type: filter.type } });
    }

    if (filter.types && filter.types.length > 0) {
      filterQueries.push({
        terms: {
          type: filter.types,
        },
      });
    }

    body.query = {
      bool: {
        should:
          shouldQueries.length === 0 ? [{ match_all: {} }] : shouldQueries,
        filter: filterQueries,
        minimum_should_match: 1, // At least 1 "should" query should present
      },
    };

    // Hybrid of BM25 and kNN. Opt in by passing `filter.embedding` (`{}` for the
    // default threshold, the one of text -> TEXT in DEFAULT_DOC_SIMILARITY): the
    // nearest neighbors are retrieved in addition to what the BM25
    // should-queries match. Omit for BM25-only.
    // Set when a kNN clause is added: the highlighter cannot walk one.
    let highlightQuery;

    // Given (even as null, which skips kNN) takes precedence over the default.
    const similarity =
      filter.embedding && 'textDocSimilarity' in filter.embedding
        ? filter.embedding.textDocSimilarity
        : DEFAULT_DOC_SIMILARITY.text.TEXT;
    if (filter.embedding && similarity != null && filter.moreLikeThis?.like) {
      try {
        const queryChunks = await createEmbedding(
          {
            id: getQueryEmbeddingCacheId(filter.moreLikeThis.like),
            type: 'text',
          },
          [{ text: filter.moreLikeThis.like }],
          user,
          { role: 'query' }
        );
        const queryVectors = queryChunks.map((c) => c.vector);

        if (queryVectors.length > 0) {
          // kNN is one more should-query, so a reply is returned when either
          // side finds it; as a filter it would drop the replies that have no
          // embedding yet. Scores add up: the kNN score is at most 1 while BM25
          // is unbounded, so replies only kNN finds come after the BM25 matches.
          // Keep minimumShouldMatch strict for that reason (see ListArticles).
          highlightQuery = {
            bool: { ...body.query.bool, should: [...body.query.bool.should] },
          };
          body.query.bool.should.push(
            buildKnnQuery({
              queryVectors,
              similarity,
              // ES does not push the outer bool.filter into a nested knn; these
              // are all top-level filters.
              filter: { bool: { filter: [...filterQueries] } },
            })
          );
        }
      } catch (e) {
        console.warn('[ListReplies] kNN embedding failed:', e);
      }
    }

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'replies',
      body,
      highlightQuery,
      ...otherParams,
    };
  },
  type: ReplyConnection,
};
