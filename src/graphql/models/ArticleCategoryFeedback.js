import { GraphQLObjectType, GraphQLString } from 'graphql';
import FeedbackVote from './FeedbackVote';

import User, { userFieldResolver } from './User';

export default new GraphQLObjectType({
  name: 'ArticleCategoryFeedback',
  description: 'User feedback to an ArticleCategory',
  fields: () => ({
    id: { type: GraphQLString },

    user: {
      type: User,
      resolve: userFieldResolver,
    },

    comment: { type: GraphQLString },

    vote: {
      description: "User's vote on the articleCategory",
      type: FeedbackVote,
      resolve: ({ score }) => score,
    },

    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  }),
});
