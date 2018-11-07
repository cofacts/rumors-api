import { GraphQLInt, GraphQLString, GraphQLInputObjectType } from 'graphql';
import client from 'util/client';

import {
  createFilterType,
  createSortType,
  getSortArgs,
  pagingArgs,
  getArithmeticExpressionType,
  getOperatorAndOperand,
} from 'graphql/util';
import scrapUrls from 'util/scrapUrls';

import { ArticleConnection } from 'graphql/models/Article';

export default {
  args: {
    filter: {
      type: createFilterType('ListArticleFilter', {
        replyCount: {
          type: getArithmeticExpressionType(
            'ListArticleReplyCountExpr',
            GraphQLInt
          ),
          description:
            'List only the articles whose number of replies matches the criteria.',
        },
        moreLikeThis: {
          type: new GraphQLInputObjectType({
            name: 'ListArticleMoreLikeThisInput',
            fields: {
              like: {
                type: GraphQLString,
                description: 'The text string to query.',
              },
              minimumShouldMatch: { type: GraphQLString },
            },
          }),
          description: 'List all articles related to a given string.',
        },
        replyRequestCount: {
          type: getArithmeticExpressionType(
            'ListArticleReplyRequestCountExpr',
            GraphQLInt
          ),
          description:
            'List only the articles whose number of replies matches the criteria.',
        },
        appId: {
          type: GraphQLString,
          description:
            'Use with userId to show only articles from a specific user.',
        },
        userId: {
          type: GraphQLString,
          description:
            'Use with appId to show only articles from a specific user.',
        },
        fromUserOfArticleId: {
          type: GraphQLString,
          description: `
            Specify an articleId here to show only articles from the sender of that specified article.
            When specified, it overrides the settings of appId and userId.
          `,
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
      ]),
    },
    ...pagingArgs,
  },
  async resolve(
    rootValue,
    { filter = {}, orderBy = [], ...otherParams },
    { loaders }
  ) {
    const body = {
      sort: getSortArgs(orderBy, {
        replyCount: o => ({ normalArticleReplyCount: { order: o } }),
      }),
      track_scores: true, // for _score sorting
    };

    // Collecting queries that will be used in bool queries later
    const shouldQueries = []; // Affects scores
    const filterQueries = []; // Not affects scores

    if (filter.fromUserOfArticleId) {
      let specifiedArticle;
      try {
        specifiedArticle = (await client.get({
          index: 'articles',
          type: 'doc',
          id: filter.fromUserOfArticleId,
          _source: ['userId', 'appId'],
        }))._source;
      } catch (e) {
        if (e.statusCode && e.statusCode === 404) {
          throw new Error(
            'fromUserOfArticleId does not match any existing articles'
          );
        }

        // Re-throw unknown error
        throw e;
      }

      // Overriding filter's userId and appId, as indicated in the description
      //
      filter.userId = specifiedArticle.userId;
      filter.appId = specifiedArticle.appId;
    }

    if (filter.appId && filter.userId) {
      filterQueries.push(
        { term: { appId: filter.appId } },
        { term: { userId: filter.userId } }
      );
    } else if (filter.appId || filter.userId) {
      throw new Error('Both appId and userId must be specified at once');
    }

    if (filter.moreLikeThis) {
      const scrapResults = await scrapUrls(filter.moreLikeThis.like, {
        client,
        cacheLoader: loaders.urlLoader,
      });

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
          },
        }
      );

      // Additionally, match the scrapped URLs with other article's scrapped urls
      if (scrapResults.length > 0) {
        shouldQueries.push({
          nested: {
            path: 'hyperlinks',
            score_mode: 'sum',
            query: {
              terms: {
                'hyperlinks.url': [
                  ...scrapResults.map(({ url }) => url),
                  ...scrapResults.map(({ canonical }) => canonical),
                ],
              },
            },
          },
        });
      }
    }

    if (filter.replyCount) {
      const { operator, operand } = getOperatorAndOperand(filter.replyCount);
      filterQueries.push({
        script: {
          script: {
            source: `doc['normalArticleReplyCount'].value ${operator} params.operand`,
            params: {
              operand,
            },
          },
        },
      });
    }

    if (filter.replyRequestCount) {
      const { operator, operand } = getOperatorAndOperand(
        filter.replyRequestCount
      );
      filterQueries.push({
        script: {
          script: {
            source: `doc['replyRequestCount'].value ${operator} params.operand`,
            params: {
              operand,
            },
          },
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

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'articles',
      type: 'doc',
      body,
      ...otherParams,
    };
  },
  type: ArticleConnection,
};
