import {
  GraphQLString,
  GraphQLList,
  GraphQLBoolean,
  GraphQLInputObjectType,
  GraphQLNonNull,
} from 'graphql';
import client from 'util/client';
import mediaManager from 'util/mediaManager';

import {
  createFilterType,
  createSortType,
  getSortArgs,
  pagingArgs,
  intRangeInput,
  timeRangeInput,
  moreLikeThisInput,
  getRangeFieldParamFromArithmeticExpression,
  createCommonListFilter,
  attachCommonListFilter,
  DEFAULT_ARTICLE_STATUSES,
  DEFAULT_ARTICLE_REPLY_STATUSES,
  getAIResponse,
  createTranscript,
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
          type: new GraphQLInputObjectType({
            name: 'UserAndExistInput',
            fields: {
              userId: {
                type: new GraphQLNonNull(GraphQLString),
              },
              exists: {
                type: GraphQLBoolean,
                defaultValue: true,
                description: `
                  When true (or not specified), return only entries with the specified user's involvement.
                  When false, return only entries that the specified user did not involve.
                `,
              },
            },
          }),
        },
        articleContributesFrom: {
          description:
            'Show only articles with article transcript contributed by specified user',
          type: new GraphQLInputObjectType({
            name: 'ArticleContributeInput',
            fields: {
              userId: {
                type: new GraphQLNonNull(GraphQLString),
              },
            },
          }),
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
          description: 'Show the media article similar to the input url',
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
                defaultValue: false,
                description:
                  'Only used when `filter.mediaUrl` is provided. Generates transcript if provided `filter.mediaUrl` is not transcribed previously.',
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
        lastMatchingArticleReplyCreatedAt: o => ({
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

      filterQueries.push(
        { term: { userId: specifiedArticle.userId } },
        { term: { appId: specifiedArticle.appId } }
      );
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
      filterQueries.push({
        bool: {
          should: filter.categoryIds.map(categoryId => ({
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
                          source:
                            "doc['articleCategories.positiveFeedbackCount'].value >= doc['articleCategories.negativeFeedbackCount'].value",
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

    if (filter.articleContributesFrom) {
      filterQueries.push({
        nested: {
          path: 'contributors',
          query: {
            bool: {
              must: [
                {
                  term: {
                    'contributors.userId': filter.articleContributesFrom.userId,
                  },
                },
              ],
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

    if (filter.mediaUrl) {
      const queryResult = await mediaManager.query({ url: filter.mediaUrl });
      const similarityMap = queryResult.hits.reduce((map, hit) => {
        map[hit.entry.id] = hit.similarity;
        return map;
      }, {});

      body.script_fields.mediaSimilarity = {
        script: {
          lang: 'painless',
          // Note: params.similarityMap.get(doc['attachmentHash'].value) may be null if no attahmentHash, or when attahmentHash not in similarityMap.
          source: `doc.containsKey('attachmentHash') ? params.similarityMap.get(doc['attachmentHash'].value) : null`,
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
              attachmentHash: queryResult.hits.map(hit => hit.entry.id),
            },
          },
          script_score: {
            script: {
              lang: 'painless',
              // Every hit in this query is inside similarityMap, no need for null handling.
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
        const similarArticles = (await loaders.searchResultLoader.loadMany(
          queryResult.hits.map(hit => ({
            index: 'articles',
            type: 'doc',
            body: { query: { term: { attachmentHash: hit.entry.id } } },
          }))
        )).flat();

        transcript = similarArticles.reduce(
          (t, article) => (t ? t : article.text),
          ''
        );
      }

      // When no transcript found from similar articles, try getting it from AI responses.
      //
      if (!transcript) {
        let aiResponse = await getAIResponse({
          type: 'TRANSCRIPT',
          docId: queryResult.queryInfo.id,
        });

        if (!aiResponse && filter.transcript?.shouldCreate) {
          aiResponse = await createTranscript(
            queryResult.queryInfo,
            filter.mediaUrl,
            user
          );
        }

        if (aiResponse && aiResponse.status === 'SUCCESS') {
          // Note: it is possible for `aiResponses.text` to be '';
          // it means that the media doesn't have detectable text.
          transcript = aiResponse.text;
        }
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
