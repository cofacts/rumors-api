import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
} from 'graphql';

import { filterArticleRepliesByStatus } from 'graphql/util';
import ReplyTypeEnum from './ReplyTypeEnum';
import ArticleReplyStatusEnum from './ArticleReplyStatusEnum';
import ArticleReply from './ArticleReply';
import ReplyVersion from './ReplyVersion';
import User, { userFieldResolver } from './User';

const Reply = new GraphQLObjectType({
  name: 'Reply',
  fields: () => ({
    id: { type: GraphQLString },
    user: {
      type: User,
      description: 'The user submitted this reply version',
      resolve: userFieldResolver,
    },
    createdAt: { type: GraphQLString },
    text: { type: GraphQLString },
    type: { type: ReplyTypeEnum },
    reference: { type: GraphQLString },
    versions: {
      deprecationReason: "Don't need 'versions' wrapper now.",
      args: {
        limit: { type: GraphQLInt },
      },
      type: new GraphQLList(ReplyVersion),
      resolve: reply => [reply],
    },
    replyConnections: {
      type: new GraphQLList(ArticleReply),
      deprecationReason: 'Use articleReplies instead',
      args: {
        status: {
          type: ArticleReplyStatusEnum,
          description:
            'When specified, returns only reply connections with the specified status',
        },
      },
      resolve: async ({ id }, { status }, { loaders }) => {
        const articleReplies = await loaders.articleRepliesByReplyIdLoader.load(
          id
        );
        return filterArticleRepliesByStatus(articleReplies, status);
      },
    },
    articleReplies: {
      type: new GraphQLList(ArticleReply),
      args: {
        status: {
          type: ArticleReplyStatusEnum,
          description:
            'When specified, returns only reply connections with the specified status',
        },
      },
      resolve: async ({ id }, { status }, { loaders }) => {
        const articleReplies = await loaders.articleRepliesByReplyIdLoader.load(
          id
        );
        return filterArticleRepliesByStatus(articleReplies, status);
      },
    },
  }),
});

export default Reply;
