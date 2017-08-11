import {
  GraphQLObjectType,
  GraphQLList,
  GraphQLInt,
  GraphQLString,
  GraphQLBoolean,
} from 'graphql';

import Article from './Article';
import User, { userFieldResolver } from './User';
import Reply from './Reply';
import ReplyConnectionFeedback from './ReplyConnectionFeedback';
import ReplyConnectionStatusEnum from './ReplyConnectionStatusEnum';

export const auth = {
  canUpdateStatus(currentUserId, replyConnectionUserId) {
    return replyConnectionUserId === currentUserId;
  },
};

export default new GraphQLObjectType({
  name: 'ReplyConnection',
  description: 'The linkage between an Article and a Reply',
  fields: () => ({
    reply: {
      type: Reply,
      resolve: ({ replyId }, args, { loaders }) =>
        loaders.docLoader.load({ index: 'replies', id: replyId }),
    },
    article: {
      type: Article,
      resolve: ({ id }, args, { loaders }) =>
        loaders.articleByReplyConnectionIdLoader.load(id),
    },

    id: {
      type: GraphQLString,
    },

    user: {
      type: User,
      description: 'The user who conencted this reply and this article.',
      resolve: userFieldResolver,
    },

    canUpdateStatus: {
      type: GraphQLBoolean,
      resolve: ({ userId }, args, { userId: currentUserId }) => {
        return auth.canUpdateStatus(currentUserId, userId);
      },
    },

    feedbackCount: {
      type: GraphQLInt,
      resolve: ({ feedbackIds = [] }) => feedbackIds.length,
    },

    feedbacks: {
      type: new GraphQLList(ReplyConnectionFeedback),
      resolve: ({ feedbackIds = [] }, args, { loaders }) =>
        loaders.docLoader.loadMany(
          feedbackIds.map(id => ({ index: 'replyconnectionfeedbacks', id }))
        ),
    },

    status: {
      type: ReplyConnectionStatusEnum,
      resolve: ({ status }) => (status === undefined ? 'NORMAL' : status),
    },

    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  }),
});
