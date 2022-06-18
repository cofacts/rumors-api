import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLID,
  GraphQLNonNull,
} from 'graphql';

import Node from '../interfaces/Node';
import FeedbackVote from './FeedbackVote';
import User, { userFieldResolver } from './User';
import Article from './Article';
import Reply from './Reply';
import ArticleReply from './ArticleReply';
import ArticleReplyFeedbackStatusEnum from './ArticleReplyFeedbackStatusEnum';

export default new GraphQLObjectType({
  name: 'ArticleReplyFeedback',
  description: 'User feedback to an ArticleReply',
  interfaces: [Node],
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },

    user: {
      type: User,
      resolve: userFieldResolver,
    },

    userId: { type: GraphQLString },
    appId: { type: GraphQLString },

    replyUserId: {
      description: "User ID of the reply's author",
      type: new GraphQLNonNull(GraphQLString),
    },
    articleReplyUserId: {
      description: "User ID of the article-reply's author",
      type: new GraphQLNonNull(GraphQLString),
    },

    comment: { type: GraphQLString },

    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },

    status: {
      type: new GraphQLNonNull(ArticleReplyFeedbackStatusEnum),
    },

    vote: {
      description: "User's vote on the articleReply",
      type: FeedbackVote,
      resolve: ({ score }) => score,
    },

    score: {
      deprecationReason: 'Use vote instead',
      description:
        'One of 1, 0 and -1. Representing upvote, neutral and downvote, respectively',
      type: GraphQLInt,
    },

    article: {
      type: Article,
      description: "The scored article-reply's article",
      resolve: ({ articleId }, args, { loaders }) =>
        loaders.docLoader.load({ index: 'articles', id: articleId }),
    },

    reply: {
      type: Reply,
      description: "The scored article-reply's reply",
      resolve: ({ replyId }, args, { loaders }) =>
        loaders.docLoader.load({ index: 'replies', id: replyId }),
    },

    articleReply: {
      type: ArticleReply,
      description: 'The scored article-reply',
      resolve: async ({ articleId, replyId }, args, { loaders }) => {
        const { articleReplies } = await loaders.docLoader.load({
          index: 'articles',
          id: articleId,
        });
        const articleReply = articleReplies.find(ar => ar.replyId === replyId);
        return {
          ...articleReply,
          articleId,
        };
      },
    },
  }),
});
