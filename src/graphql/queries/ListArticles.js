import { GraphQLString, GraphQLList, GraphQLBoolean } from 'graphql';
import client from 'util/client';

import {
  createFilterType,
  createSortType,
  getSortArgs,
  pagingArgs,
  intRangeInput,
  timeRangeInput,
  moreLikeThisInput,
  getRangeFieldParamFromArithmeticExpression,
} from 'graphql/util';
import scrapUrls from 'util/scrapUrls';

import { ArticleConnection } from 'graphql/models/Article';

export default {
  args: {
    filter: {
      type: createFilterType('ListArticleFilter', {
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
            'Articles with more matching categories will come to front',
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
        createdAt: {
          type: timeRangeInput,
          description:
            'List only the articles that were created between the specific time range.',
        },
        repliedAt: {
          type: timeRangeInput,
          description:
            'List only the articles that were replied between the specific time range.',
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
        hasArticleReplyWithMorePositiveFeedback: {
          type: GraphQLBoolean,
          description: `
            When true, return only articles with any article replies that has more positive feedback than negative.
            When false, return articles with none of its article replies that has more positive feedback, including those with no replies yet.
            In both scenario, deleted article replies are not taken into account.
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
    const mustNotQueries = [];

    if (filter.fromUserOfArticleId) {
      let specifiedArticle;
      try {
        specifiedArticle = (await client.get({
          index: 'articles',
          type: 'doc',
          id: filter.fromUserOfArticleId,
          _source: ['userId', 'appId'],
        })).body._source;
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

    if (filter.createdAt) {
      filterQueries.push({
        range: {
          createdAt: getRangeFieldParamFromArithmeticExpression(
            filter.createdAt
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
                    'articleReplies.createdAt': getRangeFieldParamFromArithmeticExpression(
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

    if (typeof filter.hasArticleReplyWithMorePositiveFeedback === 'boolean') {
      (filter.hasArticleReplyWithMorePositiveFeedback
        ? shouldQueries
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
                      source:
                        "doc['articleReplies.positiveFeedbackCount'].value > doc['articleReplies.negativeFeedbackCount'].value",
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

    body.query = {
      bool: {
        should:
          shouldQueries.length === 0 ? [{ match_all: {} }] : shouldQueries,
        filter: filterQueries,
        must_not: mustNotQueries,
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
