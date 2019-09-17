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
import ArticleReplyFeedback from './ArticleReplyFeedback';
import ArticleReplyStatusEnum from './ArticleReplyStatusEnum';
import FeedbackVote from './FeedbackVote';

export default new GraphQLObjectType({
  name: 'ArticleReply',
  description: 'The linkage between an Article and a Reply',
  fields: () => ({
    replyId: { type: GraphQLString },

    reply: {
      type: Reply,
      resolve: ({ replyId }, args, { loaders }) =>
        loaders.docLoader.load({ index: 'replies', id: replyId }),
    },

    articleId: { type: GraphQLString },

    article: {
      type: Article,
      resolve: ({ articleId }, args, { loaders }) =>
        loaders.docLoader.load({ index: 'articles', id: articleId }),
    },

    user: {
      type: User,
      description: 'The user who conencted this reply and this article.',
      resolve: userFieldResolver,
    },

    canUpdateStatus: {
      type: GraphQLBoolean,
      resolve: (
        { userId, appId },
        args,
        { userId: currentUserId, appId: currentAppId }
      ) => {
        return userId === currentUserId && appId === currentAppId;
      },
    },

    feedbackCount: {
      type: GraphQLInt,
      resolve: ({ positiveFeedbackCount = 0, negativeFeedbackCount = 0 }) =>
        positiveFeedbackCount + negativeFeedbackCount,
    },

    positiveFeedbackCount: { type: GraphQLInt },
    negativeFeedbackCount: { type: GraphQLInt },

    feedbacks: {
      type: new GraphQLList(ArticleReplyFeedback),
      resolve: ({ articleId, replyId }, args, { loaders }) =>
        loaders.articleReplyFeedbacksLoader.load({ articleId, replyId }),
    },

    ownVote: {
      type: FeedbackVote,
      description:
        'The feedback of current user. null when not logged in or not voted yet.',
      resolve: async (
        { articleId, replyId },
        args,
        { userId, appId, loaders }
      ) => {
        if (!userId || !appId) return null;
        const feedbacks = await loaders.articleReplyFeedbacksLoader.load({
          articleId,
          replyId,
        });

        const ownFeedback = feedbacks.find(
          feedback => feedback.userId === userId && feedback.appId === appId
        );
        if (!ownFeedback) return null;
        return ownFeedback.score;
      },
    },

    status: {
      type: ArticleReplyStatusEnum,
      resolve: ({ status }) => (status === undefined ? 'NORMAL' : status),
    },

    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  }),
});
