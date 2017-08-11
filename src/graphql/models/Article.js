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
} from 'graphql/util';

import ArticleReference from 'graphql/models/ArticleReference';
import User, { userFieldResolver } from 'graphql/models/User';
import ReplyConnectionStatusEnum from './ReplyConnectionStatusEnum';
import ReplyConnection from './ReplyConnection';

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
      resolve: ({ replyConnectionIds = [] }) => replyConnectionIds.length,
    },
    replyConnections: {
      type: new GraphQLList(ReplyConnection),
      args: {
        status: {
          type: ReplyConnectionStatusEnum,
          description: 'When specified, returns only reply connections with the specified status',
        },
      },
      resolve: async ({ replyConnectionIds = [] }, { status }, { loaders }) => {
        const replyConnections = await loaders.docLoader.loadMany(
          replyConnectionIds.map(id => ({ index: 'replyconnections', id }))
        );

        if (!status) return replyConnections;
        return replyConnections.filter(conn => conn.status === status);
      },
    },
    replyRequestCount: {
      type: GraphQLInt,
      resolve: ({ replyRequestIds = [] }) => replyRequestIds.length,
    },
    requestedForReply: {
      type: GraphQLBoolean,
      description: 'If the current user has requested for reply for this article',
      resolve: async (
        { replyRequestIds = [] },
        args,
        { loaders, userId, from }
      ) => {
        assertUser({ userId, from });
        const requests = await loaders.docLoader.loadMany(
          replyRequestIds.map(id => ({ index: 'replyrequests', id }))
        );
        return !!requests.find(r => r.userId === userId && r.from === from);
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
              like: [{ _index: 'articles', _type: 'basic', _id: id }],
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
                    inline: `doc['replyConnectionIds'].length ${operator} params.operand`,
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
          type: 'basic',
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
