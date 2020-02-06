import { GraphQLObjectType, GraphQLString, GraphQLInt } from 'graphql';
import FeedbackVote from './FeedbackVote';

import User, { userFieldResolver } from './User';

export default new GraphQLObjectType({
  name: 'ArticleReplyFeedback',
  description: 'User feedback to an ArticleReply',
  fields: () => ({
    id: { type: GraphQLString },

    user: {
      type: User,
      resolve: userFieldResolver,
    },

    comment: { type: GraphQLString },

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
  }),
});
