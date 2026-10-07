import {
  GraphQLString,
  GraphQLList,
  GraphQLBoolean,
  GraphQLInputObjectType,
  GraphQLFloat,
  GraphQLNonNull,
} from 'graphql';
import client from 'util/client';
import mediaManager from 'util/mediaManager';
import {
  createEmbedding,
  createMediaEmbedding,
  getQueryEmbeddingCacheId,
} from 'util/embedding';

import {
  createFilterType,
  createSortType,
  getSortArgs,
  pagingArgs,
  intRangeInput,
  timeRangeInput,
  moreLikeThisInput,
  userAndExistInput,
  getRangeFieldParamFromArithmeticExpression,
  createCommonListFilter,
  attachCommonListFilter,
  buildKnnQuery,
  DEFAULT_ARTICLE_STATUSES,
  DEFAULT_ARTICLE_REPLY_STATUSES,
  getAIResponse,
  createTranscript,
  getOrUploadMedia,
  VALID_ARTICLE_TYPE_TO_MEDIA_TYPE,
} from 'graphql/util';
import scrapUrls from 'util/scrapUrls';
import ArticleStatusEnum from 'graphql/models/ArticleStatusEnum';
import ReplyTypeEnum from 'graphql/models/ReplyTypeEnum';
import ArticleTypeEnum from 'graphql/models/ArticleTypeEnum';
import ArticleReplyStatusEnum from 'graphql/models/ArticleReplyStatusEnum';

import { ArticleConnection } from 'graphql/models/Article';

const {
  ids: dontcare, // eslint-disable-line no-unused-vars
  ...articleReplyCommonFilterArgs
} = createCommonListFilter('articleReplies');

// The media types that can be transcribed and embedded (media-manager also has
// a `file` type).
const SUPPORTED_MEDIA_TYPES = Object.values(VALID_ARTICLE_TYPE_TO_MEDIA_TYPE);

/**
 * Create more_like_this query for article index
 *
 * @param {string | string[]} like - text(s) to like
 * @param {string} minimumShouldMatch
 * @returns {object[]} more_like_this queries
 */
function createMoreLikeThisQuery(like, minimumShouldMatch) {
  return [
    {
      more_like_this: {
        fields: ['text'],
        like,
        min_term_freq: 1,
        min_doc_freq: 1,
        minimum_should_match: minimumShouldMatch || '10<70%',
      },
    },
    {
      nested: {
        path: 'hyperlinks',
        score_mode: 'sum',
        query: {
          more_like_this: {
            fields: ['hyperlinks.title', 'hyperlinks.summary'],
            like,
            min_term_freq: 1,
            min_doc_freq: 1,
            minimum_should_match: minimumShouldMatch || '10<70%',
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
    },
  ];
}

export default {
  args: {
    filter: {
      type: createFilterType('ListArticleFilter', {
        ...createCommonListFilter('articles'),
        replyCount: {
          type: intRangeInput,
          description:
            'List only the articles whose number of replies matches the criteria.',
        },
        categoryCount: {
          type: intRangeInput,
          description:
            'List only the articles whose number of categories match the criteria.',
        },
        categoryIds: {
          type: new GraphQLList(GraphQLString),
          description:
            'List only articles that match any of the specified categories.' +
            'ArticleCategories that are deleted or has more negative feedbacks than positive ones are not taken into account.',
        },
        moreLikeThis: {
          type: moreLikeThisInput,
          description: 'List all articles related to a given string.',
        },
        replyRequestCount: {
          type: intRangeInput,
          description:
            'List only the articles whose number of replies matches the criteria.',
        },
        repliedAt: {
          type: timeRangeInput,
          description:
            '[Deprecated] use articleReply filter instead. List only the articles that were replied between the specific time range.',
        },
        fromUserOfArticleId: {
          type: GraphQLString,
          description:
            'Specify an articleId here to show only articles from the sender of that specified article.',
        },
        articleRepliesFrom: {
          description:
            'Show only articles with(out) article replies created by specified user',
          type: userAndExistInput,
        },
        transcribedBy: {
          description:
            'Show only articles with(out) article transcript contributed by specified user',
          type: userAndExistInput,
        },
        hasArticleReplyWithMorePositiveFeedback: {
          type: GraphQLBoolean,
          description: `
            When true, return only articles with any article replies that has more positive feedback than negative.
            When false, return articles with none of its article replies that has more positive feedback, including those with no replies yet.
            In both scenario, deleted article replies are not taken into account.
          `,
        },
        replyTypes: {
          type: new GraphQLList(ReplyTypeEnum),
          description:
            '[Deprecated] use articleReply filter instead. List the articles with replies of certain types',
        },
        articleTypes: {
          type: new GraphQLList(ArticleTypeEnum),
          description: 'List the articles with certain types',
        },
        mediaUrl: {
          type: GraphQLString,
          description:
            'Show the media article similar to the input url. The transcript and embedding of the media are only created when logged in; otherwise only the ones made before are used.',
        },
        embedding: {
          type: GraphQLFloat,
          description:
            'Opt-in hybrid search. Provide the minimum cosine similarity (e.g. `0.7`) ' +
            'to retrieve candidates via kNN and rank them by BM25. Omit for BM25-only (default).',
        },
        transcript: {
          description:
            'Specifies how the transcript of `mediaUrl` can be used to search. Can only specify `transcript` when `mediaUrl` is specified.',
          type: new GraphQLInputObjectType({
            name: 'TranscriptFilter',
            fields: {
              minimumShouldMatch: {
                type: GraphQLString,
                description:
                  'more_like_this query\'s "minimum_should_match" query param for the transcript of `mediaUrl`\n' +
                  'See https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-minimum-should-match.html for possible values.',
              },
              shouldCreate: {
                type: GraphQLBoolean,
                // FIXME: No deprecationReason for input object types yet
                description:
                  '[Deprecated] No longer read. The transcript is always generated when `filter.mediaUrl` is not transcribed previously.',
              },
            },
          }),
        },
        articleReply: {
          description:
            'Show articles with article replies matching this criteria',
          type: new GraphQLInputObjectType({
            name: 'ArticleReplyFilterInput',
            fields: {
              ...articleReplyCommonFilterArgs,
              statuses: {
                type: new GraphQLList(
                  new GraphQLNonNull(ArticleReplyStatusEnum)
                ),
                defaultValue: DEFAULT_ARTICLE_REPLY_STATUSES,
              },

              replyTypes: {
                type: new GraphQLList(ReplyTypeEnum),
              },
            },
          }),
        },
        statuses: {
          type: new GraphQLList(new GraphQLNonNull(ArticleStatusEnum)),
          defaultValue: DEFAULT_ARTICLE_STATUSES,
          description: 'Returns only articles with the specified statuses',
        },
      }),
    },
    orderBy: {
      type: createSortType('ListArticleOrderBy', [
        '_score',
        'updatedAt',
        'createdAt',
        'replyRequestCount',
        'replyCount',
        'lastRequestedAt',
        'lastRepliedAt',
        'lastMatchingArticleReplyCreatedAt',
      ]),
    },
    ...pagingArgs,
  },
  async resolve(
    rootValue,
    { filter = {}, orderBy = [], ...otherParams },
    { loaders, userId, appId, user }
  ) {
    if (filter.transcript && !filter.mediaUrl) {
      throw new Error(
        '`filter.mediaUrl` must be provided when `filter.transcript` is true'
      );
    }

    // Collecting queries that will be used in bool queries later
    const shouldQueries = []; // Affects scores
    const filterQueries = [
      {
        terms: {
          status: filter.statuses || DEFAULT_ARTICLE_STATUSES,
        },
      },
    ]; // Not affects scores
    const mustNotQueries = [];

    // Setup article reply filter, which may be used in sort
    //
    const articleReplyFilterQueries = [];
    if (filter.articleReply) {
      articleReplyFilterQueries.push({
        terms: {
          'articleReplies.status':
            filter.articleReply.statuses || DEFAULT_ARTICLE_REPLY_STATUSES,
        },
      });

      attachCommonListFilter(
        articleReplyFilterQueries,
        filter.articleReply,
        userId,
        appId,
        'articleReplies.'
      );

      if (filter.articleReply.replyTypes) {
        articleReplyFilterQueries.push({
          terms: {
            'articleReplies.replyType': filter.articleReply.replyTypes,
          },
        });
      }

      filterQueries.push({
        nested: {
          path: 'articleReplies',
          query: {
            bool: {
              must: articleReplyFilterQueries,
            },
          },
        },
      });
    }

    const body = {
      // Source fields are disabled when `script_fields` presets.
      // Ref: https://www.elastic.co/guide/en/elasticsearch/reference/6.8/search-request-source-filtering.html
      //      https://discuss.elastic.co/t/script-field-along-with-all-the-other-fields-using-painless/296384/2
      // We need to turn _source back on.
      //
      _source: true,
      script_fields: {},

      sort: getSortArgs(orderBy, {
        replyCount: (o) => ({ normalArticleReplyCount: { order: o } }),
        lastRepliedAt: (o) => ({
          'articleReplies.createdAt': {
            order: o,
            mode: 'max',
            nested: {
              path: 'articleReplies',
              filter: {
                term: {
                  'articleReplies.status': 'NORMAL',
                },
              },
            },
          },
        }),
        lastMatchingArticleReplyCreatedAt: (o) => ({
          'articleReplies.createdAt': {
            order: o,
            mode: 'max',
            nested: {
              path: 'articleReplies',
              filter: {
                bool: {
                  must: articleReplyFilterQueries,
                },
              },
            },
          },
        }),
      }),
      track_scores: true, // for _score sorting
    };

    attachCommonListFilter(filterQueries, filter, userId, appId);

    if (filter.fromUserOfArticleId) {
      let specifiedArticle;
      try {
        specifiedArticle = (
          await client.get({
            index: 'articles',
            id: filter.fromUserOfArticleId,
            _source: ['userId', 'appId'],
          })
        )._source;
      } catch (e) {
        if (e.statusCode && e.statusCode === 404) {
          throw new Error(
            'fromUserOfArticleId does not match any existing articles'
          );
        }

        // Re-throw unknown error
        throw e;
      }

      filterQueries.push(
        { term: { userId: specifiedArticle.userId } },
        { term: { appId: specifiedArticle.appId } }
      );
    }

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
        ...createMoreLikeThisQuery(
          likeQuery,
          filter.moreLikeThis.minimumShouldMatch
        )
      );

      // Additionally, match the scrapped URLs with other article's scrapped urls
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

    if (filter.replyCount) {
      filterQueries.push({
        range: {
          normalArticleReplyCount: getRangeFieldParamFromArithmeticExpression(
            filter.replyCount
          ),
        },
      });
    }

    if (filter.replyRequestCount) {
      filterQueries.push({
        range: {
          replyRequestCount: getRangeFieldParamFromArithmeticExpression(
            filter.replyRequestCount
          ),
        },
      });
    }

    if (filter.repliedAt) {
      filterQueries.push({
        nested: {
          path: 'articleReplies',
          query: {
            bool: {
              must: [
                { match: { 'articleReplies.status': 'NORMAL' } },
                {
                  range: {
                    'articleReplies.createdAt':
                      getRangeFieldParamFromArithmeticExpression(
                        filter.repliedAt
                      ),
                  },
                },
              ],
            },
          },
        },
      });
    }

    if (filter.categoryIds && filter.categoryIds.length) {
      filterQueries.push({
        bool: {
          should: filter.categoryIds.map((categoryId) => ({
            nested: {
              path: 'articleCategories',
              query: {
                bool: {
                  must: [
                    {
                      term: {
                        'articleCategories.categoryId': categoryId,
                      },
                    },
                    {
                      term: {
                        'articleCategories.status': 'NORMAL',
                      },
                    },
                    {
                      script: {
                        script: {
                          source: `
                            (!doc['articleCategories.positiveFeedbackCount'].isEmpty() ? doc['articleCategories.positiveFeedbackCount'].value : 0) >=
                            (!doc['articleCategories.negativeFeedbackCount'].isEmpty() ? doc['articleCategories.negativeFeedbackCount'].value : 0)
                          `,
                          lang: 'painless',
                        },
                      },
                    },
                  ],
                },
              },
            },
          })),
        },
      });
    }

    if (typeof filter.hasArticleReplyWithMorePositiveFeedback === 'boolean') {
      (filter.hasArticleReplyWithMorePositiveFeedback
        ? filterQueries
        : mustNotQueries
      ).push({
        nested: {
          path: 'articleReplies',
          query: {
            bool: {
              must: [
                {
                  term: {
                    'articleReplies.status': 'NORMAL',
                  },
                },
                {
                  script: {
                    script: {
                      source: `
                        (!doc['articleReplies.positiveFeedbackCount'].isEmpty() ? doc['articleReplies.positiveFeedbackCount'].value : 0) > 
                        (!doc['articleReplies.negativeFeedbackCount'].isEmpty() ? doc['articleReplies.negativeFeedbackCount'].value : 0)
                      `,
                      lang: 'painless',
                    },
                  },
                },
              ],
            },
          },
        },
      });
    }

    if (filter.articleRepliesFrom) {
      (filter.articleRepliesFrom.exists === false
        ? mustNotQueries
        : filterQueries
      ).push({
        nested: {
          path: 'articleReplies',
          query: {
            bool: {
              must: [
                {
                  term: {
                    'articleReplies.status': 'NORMAL',
                  },
                },
                {
                  term: {
                    'articleReplies.userId': filter.articleRepliesFrom.userId,
                  },
                },
              ],
            },
          },
        },
      });
    }

    if (filter.transcribedBy) {
      (filter.transcribedBy.exists === false
        ? mustNotQueries
        : filterQueries
      ).push({
        nested: {
          path: 'contributors',
          query: {
            term: {
              'contributors.userId': filter.transcribedBy.userId,
            },
          },
        },
      });
    }

    if (filter.replyTypes) {
      filterQueries.push({
        nested: {
          path: 'articleReplies',
          query: {
            bool: {
              must: [
                {
                  term: {
                    'articleReplies.status': 'NORMAL',
                  },
                },
                {
                  terms: {
                    'articleReplies.replyType': filter.replyTypes,
                  },
                },
              ],
            },
          },
        },
      });
    }

    // FIXME: Remove else statement after implementing media article on rumor-site
    if (filter.articleTypes) {
      filterQueries.push({
        terms: {
          articleType: filter.articleTypes,
        },
      });
    }

    // Hoisted so the kNN block below can use the vectors of the queried media.
    let mediaQueryVectors = [];
    if (filter.mediaUrl) {
      const queryResult = await mediaManager.query({ url: filter.mediaUrl });
      const similarityMap = queryResult.hits.reduce((map, hit) => {
        map[hit.entry.id] = hit.similarity;
        return map;
      }, {});

      body.script_fields.mediaSimilarity = {
        script: {
          lang: 'painless',
          // Returns null when the doc has no attachmentHash value, or when its attachmentHash is not in similarityMap.
          //
          // `doc.containsKey()` only checks the field exists in the mapping; documents without a value
          // (e.g. legacy text articles hit by transcript full-text search) must be guarded with `.size()`,
          // otherwise `.value` throws and fails the whole search.
          source: `doc.containsKey('attachmentHash') && !doc['attachmentHash'].isEmpty() ? params.similarityMap.get(doc['attachmentHash'].value) : null`,
          params: { similarityMap },
        },
      };

      // Make media search dominant text search
      const MULTIPLIER = 100;

      // Match search result returned by mediaManager.query,
      // with their score being the similarity returend by mediaManager
      //
      shouldQueries.push({
        function_score: {
          query: {
            terms: {
              attachmentHash: queryResult.hits.map((hit) => hit.entry.id),
            },
          },
          script_score: {
            script: {
              lang: 'painless',
              // script_score only runs on docs matched by the `terms` query above, so attachmentHash
              // always has a value that is a key of similarityMap; no null handling needed.
              // (Unlike script_fields.mediaSimilarity, which runs on every hit, including text-only matches.)
              //
              // `mediaSimilarity` cannot be used here because it only exists after search complete.
              //
              source: `${MULTIPLIER} * params.similarityMap.get(doc['attachmentHash'].value)`,
              params: { similarityMap },
            },
          },
        },
      });

      let transcript = '';
      if (queryResult.hits.length > 0) {
        // Get the text from most similar article (if there is one)
        //
        const similarArticles = (
          await loaders.searchResultLoader.loadMany(
            queryResult.hits.map((hit) => ({
              index: 'articles',
              body: { query: { term: { attachmentHash: hit.entry.id } } },
            }))
          )
        ).flat();

        transcript = similarArticles.reduce(
          (t, article) => (t ? t : article.text),
          ''
        );
      }

      const { queryInfo } = queryResult;
      const isSupportedMedia = SUPPORTED_MEDIA_TYPES.includes(queryInfo.type);

      // What this query needs from the media itself.
      // - Transcript: when no transcript is found from similar articles. The
      //   one made before is used, or it is made right away.
      // - Embedding: for kNN. The media takes precedence over a text query
      //   (see the kNN block below).
      //
      const needsTranscript = !transcript;
      const needsEmbedding = filter.embedding != null && isSupportedMedia;

      // Media manager is the one that knows whether the file is there: get the
      // stored media entry, or upload the media when there is none. Transcript
      // and embedding below then share that file, and deal with nothing but
      // their own text / vectors (including whether they are made before).
      //
      // The file is stored permanently and is what CreateMediaArticle uses if
      // the media is submitted afterwards, thus it takes a logged-in user.
      // When not logged in or the media cannot be uploaded, the transcript and
      // embedding made before can still be read.
      //
      let mediaEntry = null;
      if (user && isSupportedMedia && (needsTranscript || needsEmbedding)) {
        try {
          mediaEntry = await getOrUploadMedia({
            mediaUrl: filter.mediaUrl,
            queryResult,
            user,
          });
        } catch (e) {
          // Must never break the search; go on with what is made before.
          console.warn('[ListArticles] cannot upload media:', e);
        }
      }

      const [aiResponse, embeddingChunks] = await Promise.all([
        !needsTranscript
          ? null
          : mediaEntry
          ? createTranscript(queryInfo, mediaEntry, user)
          : getAIResponse({ type: 'TRANSCRIPT', docId: queryInfo.id }),

        !needsEmbedding
          ? null
          : (mediaEntry
              ? createMediaEmbedding(queryInfo, mediaEntry, user)
              : getAIResponse({ type: 'EMBEDDING', docId: queryInfo.id }).then(
                  (existing) => existing?.embeddings
                )
            ).catch((e) => {
              // kNN must never break BM25 — go on without kNN.
              console.warn('[ListArticles] kNN embedding failed:', e);
              return null;
            }),
      ]);
      mediaQueryVectors = (embeddingChunks ?? []).map((c) => c.vector);

      if (aiResponse && aiResponse.status === 'SUCCESS') {
        // Note: it is possible for `aiResponses.text` to be '';
        // it means that the media doesn't have detectable text.
        transcript = aiResponse.text;
      }

      // Add transcript to query
      //
      if (transcript) {
        shouldQueries.push(
          ...createMoreLikeThisQuery(
            transcript,
            filter.transcript?.minimumShouldMatch
          )
        );
      }
    }

    body.query = {
      bool: {
        should:
          shouldQueries.length === 0 ? [{ match_all: {} }] : shouldQueries,
        filter: filterQueries,
        must_not: mustNotQueries,
        minimum_should_match: 1, // At least 1 "should" query should present
      },
    };

    // kNN-retrieval + BM25 ranking. Opt in by passing `filter.embedding` as the
    // minimum cosine similarity: kNN narrows the candidate set, then the existing
    // should-queries rank them — text `moreLikeThis`, or for a media search the
    // perceptual-hash function_score + transcript moreLikeThis. Omit for BM25-only.
    if (filter.embedding != null) {
      try {
        // Media query: resolved along with the transcript above. It takes
        // precedence over a text query given along with it.
        let queryVectors = mediaQueryVectors;

        if (queryVectors.length === 0 && filter.moreLikeThis?.like) {
          // Text query: vectorize the query text (RETRIEVAL_QUERY, cached).
          const queryChunks = await createEmbedding(
            {
              id: getQueryEmbeddingCacheId(filter.moreLikeThis.like),
              type: 'text',
            },
            [{ text: filter.moreLikeThis.like }],
            user,
            { taskType: 'RETRIEVAL_QUERY' }
          );
          queryVectors = queryChunks.map((c) => c.vector);
        }

        if (queryVectors.length > 0) {
          // Add kNN as a candidate-retrieval filter so only semantically-near
          // docs survive; the `should` scoring then decides the ordering.
          body.query.bool.filter.push(
            buildKnnQuery({ queryVectors, similarity: filter.embedding })
          );
          // Ranking is driven by the should-queries, but retrieval is driven by
          // kNN — don't require a should match, or we'd intersect the two result
          // sets instead of ranking the kNN candidates (some score 0 on BM25).
          body.query.bool.minimum_should_match = 0;
        }
      } catch (e) {
        // kNN must never break BM25 — log and fall through to the BM25 body.query.
        console.warn('[ListArticles] kNN embedding failed:', e);
      }
    }

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'articles',
      body,
      ...otherParams,
    };
  },
  type: ArticleConnection,
};
