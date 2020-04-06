import {
  GraphQLInt,
  GraphQLString,
  GraphQLInputObjectType,
  GraphQLList,
} from 'graphql';
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
        categoryCount: {
          type: getArithmeticExpressionType(
            'ListArticleCategoryCountExpr',
            GraphQLInt
          ),
          description:
            'List only the articles whose number of categories match the criteria.',
        },
        categoryIds: {
          type: new GraphQLList(GraphQLString),
          description:
            'Articles with more matching categories will come to front',
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
        createdAt: {
          type: getArithmeticExpressionType(
            'ListArticleCreatedAtExpr',
            GraphQLString
          ),
          description: `
            List only the articles that were created between the specific time range.
            The time range value is in elasticsearch date format (https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-date-format.html)
          `,
        },
        repliedAt: {
          type: getArithmeticExpressionType(
            'ListArticleRepliedAtExpr',
            GraphQLString
          ),
          description: `
            List only the articles that were replied between the specific time range.
            The time range value is in elasticsearch date format (https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-date-format.html)
          `,
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
        'lastRepliedAt',
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
        lastRepliedAt: o => ({
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
      // eslint-disable-next-line require-atomic-updates
      filter.userId = specifiedArticle.userId;
      // eslint-disable-next-line require-atomic-updates
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
      const scrapResults = (await scrapUrls(filter.moreLikeThis.like, {
        client,
        cacheLoader: loaders.urlLoader,
      })).filter(r => r);

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

    if (filter.createdAt) {
      // @todo: handle invalid type error?
      const q = Object.fromEntries(
        Object.entries(filter.createdAt)
          .filter(([key]) => ['GT', 'GTE', 'LT', 'LTE'].includes(key))
          .map(([key, value]) => [key.toLowerCase(), value])
      );

      filterQueries.push({
        range: { createdAt: q },
      });
    }

    if (filter.repliedAt) {
      // @todo: handle invalid type error?
      // @todo: extract repetitive logic
      const q = Object.fromEntries(
        Object.entries(filter.repliedAt)
          .filter(([key]) => ['GT', 'GTE', 'LT', 'LTE'].includes(key))
          .map(([key, value]) => [key.toLowerCase(), value])
      );

      filterQueries.push({
        nested: {
          path: 'articleReplies',
          query: {
            bool: {
              must: [
                { match: { 'articleReplies.status': 'NORMAL' } },
                { range: { 'articleReplies.createdAt': q } },
              ],
            },
          },
        },
      });
    }

    if (filter.categoryIds && filter.categoryIds.length) {
      shouldQueries.push({
        bool: {
          should: filter.categoryIds.map(categoryId => ({
            nested: {
              path: 'articleCategories',
              query: {
                term: {
                  'articleCategories.categoryId': categoryId,
                },
              },
            },
          })),
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
