import {
  GraphQLObjectType,
  GraphQLList,
  GraphQLInt,
  GraphQLString,
  GraphQLBoolean,
  GraphQLNonNull,
} from 'graphql';

import Article from './Article';
import User, { userFieldResolver } from './User';
import Reply from './Reply';
import ReplyTypeEnum from './ReplyTypeEnum';
import ArticleReplyFeedback from './ArticleReplyFeedback';
import ArticleReplyStatusEnum from './ArticleReplyStatusEnum';
import FeedbackVote from './FeedbackVote';
import ArticleReplyFeedbackStatusEnum from './ArticleReplyFeedbackStatusEnum';

import {
  DEFAULT_ARTICLE_REPLY_FEEDBACK_STATUSES,
  filterByStatuses,
} from 'graphql/util';

export default new GraphQLObjectType({
  name: 'ArticleReply',
  description: 'The linkage between an Article and a Reply',
  fields: () => ({
    replyId: { type: new GraphQLNonNull(GraphQLString) },

    reply: {
      type: Reply,
      resolve: ({ replyId }, args, { loaders }) =>
        loaders.docLoader.load({ index: 'replies', id: replyId }),
    },

    replyType: {
      type: ReplyTypeEnum,
      description: 'Cached reply type value stored in ArticleReply',
    },

    articleId: { type: new GraphQLNonNull(GraphQLString) },

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

    userId: { type: GraphQLNonNull(GraphQLString) },
    appId: { type: GraphQLNonNull(GraphQLString) },

    canUpdateStatus: {
      type: new GraphQLNonNull(GraphQLBoolean),
      resolve: ({ userId, appId }, args, { user }) => {
        return !!user && userId === user.id && appId === user.appId;
      },
    },

    feedbackCount: {
      type: new GraphQLNonNull(GraphQLInt),
      resolve: ({ positiveFeedbackCount = 0, negativeFeedbackCount = 0 }) =>
        positiveFeedbackCount + negativeFeedbackCount,
    },

    positiveFeedbackCount: {
      type: new GraphQLNonNull(GraphQLInt),
      resolve({ positiveFeedbackCount }) {
        return positiveFeedbackCount ?? 0;
      },
    },
    negativeFeedbackCount: {
      type: new GraphQLNonNull(GraphQLInt),
      resolve({ negativeFeedbackCount }) {
        return negativeFeedbackCount ?? 0;
      },
    },

    feedbacks: {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(ArticleReplyFeedback))
      ),
      args: {
        statuses: {
          type: new GraphQLList(
            new GraphQLNonNull(ArticleReplyFeedbackStatusEnum)
          ),
          defaultValue: DEFAULT_ARTICLE_REPLY_FEEDBACK_STATUSES,
          description:
            'Returns only aricle reply feedbacks with the specified statuses',
        },
      },
      resolve: async (
        { articleId, replyId },
        { statuses = DEFAULT_ARTICLE_REPLY_FEEDBACK_STATUSES },
        { loaders }
      ) =>
        filterByStatuses(
          await loaders.articleReplyFeedbacksLoader.load({
            articleId,
            replyId,
          }),
          statuses
        ),
    },

    ownVote: {
      type: FeedbackVote,
      description:
        'The feedback of current user. null when not logged in or not voted yet.',
      resolve: async ({ articleId, replyId }, args, { user, loaders }) => {
        if (!user) return null;
        const feedbacks = await loaders.articleReplyFeedbacksLoader.load({
          articleId,
          replyId,
        });

        const ownFeedback = feedbacks.find(
          feedback =>
            feedback.userId === user.id && feedback.appId === user.appId
        );
        if (!ownFeedback) return null;
        return ownFeedback.score;
      },
    },

    status: {
      type: new GraphQLNonNull(ArticleReplyStatusEnum),
      resolve: ({ status }) => (status === undefined ? 'NORMAL' : status),
    },

    createdAt: {
      type: GraphQLString,
      description: 'May be null for legacy articles',
    },
    updatedAt: { type: GraphQLString },
  }),
});
