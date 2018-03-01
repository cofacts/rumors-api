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
} from 'graphql/util';

import ArticleReference from 'graphql/models/ArticleReference';
import User, { userFieldResolver } from 'graphql/models/User';
import ArticleReplyStatusEnum from './ArticleReplyStatusEnum';
import ArticleReply from './ArticleReply';
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
      args: {
        status: {
          type: ArticleReplyStatusEnum,
          description:
            'When specified, returns only article replies with the specified status',
        },
      },
      resolve: async ({ id, articleReplies = [] }, { status }) =>
        filterArticleRepliesByStatus(
          // Inject articleId to each articleReply
          articleReplies.map(articleReply => {
            articleReply.articleId = id;
            return articleReply;
          }),
          status
        ),
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
                    inline: `doc['normalArticleReplyCount'].value ${operator} params.operand`,
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
  }),
});

export const ArticleConnection = createConnectionType(
  'ArticleConnection',
  Article
);

export default Article;
