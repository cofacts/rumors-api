import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
  GraphQLBoolean,
} from 'graphql';

import {
  pagingArgs,
  getArithmeticExpressionType,
  getSortArgs,
  getOperatorAndOperand,
  createFilterType,
  createSortType,
  createConnectionType,
  assertUser,
  filterArticleRepliesByStatus,
  filterArticleCategoriesByStatus,
} from 'graphql/util';

import ArticleReference from 'graphql/models/ArticleReference';
import User, { userFieldResolver } from 'graphql/models/User';
import ArticleReplyStatusEnum from './ArticleReplyStatusEnum';
import ArticleReply from './ArticleReply';
import ArticleCategoryStatusEnum from './ArticleCategoryStatusEnum';
import ArticleCategory from './ArticleCategory';
import Hyperlink from './Hyperlink';
import ReplyRequest from './ReplyRequest';

const Article = new GraphQLObjectType({
  name: 'Article',
  fields: () => ({
    id: { type: GraphQLString },
    text: { type: GraphQLString },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
    references: { type: new GraphQLList(ArticleReference) },
    replyCount: {
      type: GraphQLInt,
      description: 'Number of normal article replies',
      resolve: ({ normalArticleReplyCount }) => normalArticleReplyCount,
    },
    articleReplies: {
      type: new GraphQLList(ArticleReply),
      description:
        'Connections between this article and replies. Sorted by the logic described in https://github.com/cofacts/rumors-line-bot/issues/78.',
      args: {
        status: {
          type: ArticleReplyStatusEnum,
          description:
            'When specified, returns only article replies with the specified status',
        },
      },
      resolve: async ({ id, articleReplies = [] }, { status }) => {
        // Sort by usefulness (= positive - negative feedbacks)
        // then use latest first
        const sortedArticleReplies = filterArticleRepliesByStatus(
          // Inject articleId to each articleReply
          articleReplies.map(articleReply => {
            articleReply.articleId = id;
            return articleReply;
          }),
          status
        ).sort((a, b) => {
          const usefulnessDiff =
            b.positiveFeedbackCount -
            b.negativeFeedbackCount -
            (a.positiveFeedbackCount - a.negativeFeedbackCount);

          if (usefulnessDiff !== 0) return usefulnessDiff;

          return +new Date(b.createdAt) - +new Date(a.createdAt);
        });

        if (sortedArticleReplies.length === 0) return [];

        let latestIdx;
        let latestCreatedAt = ''; // Any iso timestring should be larger than ''
        sortedArticleReplies.forEach(({ createdAt }, idx) => {
          if (createdAt > latestCreatedAt) {
            latestIdx = idx;
            latestCreatedAt = createdAt;
          }
        });

        const [latestArticleReply] = sortedArticleReplies.splice(latestIdx, 1);

        return [latestArticleReply, ...sortedArticleReplies];
      },
    },

    articleCategories: {
      type: new GraphQLList(ArticleCategory),

      args: {
        status: {
          type: ArticleCategoryStatusEnum,
          description:
            'When specified, returns only article categories with the specified status',
        },
      },

      resolve: async ({ id, articleCategories = [] }, { status }) => {
        // sort by created
        const sortedArticleCategories = filterArticleCategoriesByStatus(
          // Inject articleId to each articleCategory
          articleCategories.map(articleCategory => {
            articleCategory.articleId = id;
            return articleCategory;
          }),
          status
        ).sort((a, b) => {
          return +new Date(b.createdAt) - +new Date(a.createdAt);
        });

        if (sortedArticleCategories.length === 0) return [];
        return sortedArticleCategories;
      },
    },

    categoryCount: {
      type: GraphQLInt,
      description: 'Number of normal article categories',
      resolve: ({ normalArticleCategoryCount }) => normalArticleCategoryCount,
    },

    replyRequests: {
      type: new GraphQLList(ReplyRequest),
      resolve: async ({ id }, args, { loaders }) =>
        loaders.searchResultLoader.load({
          index: 'replyrequests',
          body: { query: { term: { articleId: id } } },
        }),
    },
    replyRequestCount: { type: GraphQLInt },
    lastRequestedAt: { type: GraphQLString },
    requestedForReply: {
      type: GraphQLBoolean,
      description:
        'If the current user has requested for reply for this article',
      resolve: async ({ id }, args, { userId, appId, loaders }) => {
        assertUser({ userId, appId });

        const userReplyRequests = await loaders.searchResultLoader.load({
          index: 'replyrequests',
          body: {
            query: {
              bool: {
                must: [{ term: { userId } }, { term: { articleId: id } }],
              },
            },
          },
        });

        return userReplyRequests && userReplyRequests.length > 0;
      },
    },
    user: {
      type: User,
      description: 'The user submitted this article',
      resolve: userFieldResolver,
    },
    relatedArticles: {
      args: {
        filter: {
          type: createFilterType('RelatedArticleFilter', {
            replyCount: {
              type: getArithmeticExpressionType('ReplyCountExpr', GraphQLInt),
            },
          }),
        },
        orderBy: {
          type: createSortType('RelatedArticleOrderBy', [
            '_score',
            'updatedAt',
          ]),
        },
        ...pagingArgs,
      },
      async resolve({ id }, { filter = {}, orderBy = [], ...otherParams }) {
        const body = {
          query: {
            more_like_this: {
              fields: ['text'],
              like: [{ _index: 'articles', _type: 'doc', _id: id }],
              min_term_freq: 1,
              min_doc_freq: 1,
            },
          },
          sort: getSortArgs(orderBy),
          track_scores: true, // required to always populate score
        };

        if (filter.replyCount) {
          // Switch to bool query so that we can filter more_like_this results
          //
          const { operator, operand } = getOperatorAndOperand(
            filter.replyCount
          );
          body.query = {
            bool: {
              must: body.query,
              filter: {
                script: {
                  script: {
                    source: `doc['normalArticleReplyCount'].value ${operator} params.operand`,
                    params: {
                      operand,
                    },
                  },
                },
              },
            },
          };
        }

        return {
          index: 'articles',
          type: 'doc',
          body,
          ...otherParams,
        };
      },

      // eslint-disable-next-line no-use-before-define
      type: ArticleConnection,
    },
    hyperlinks: {
      type: new GraphQLList(Hyperlink),
      description: 'Hyperlinks in article text',
    },
  }),
});

export const ArticleConnection = createConnectionType(
  'ArticleConnection',
  Article
);

export default Article;
