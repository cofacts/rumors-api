import { GraphQLObjectType, GraphQLString, GraphQLInt } from 'graphql';

import User, { userFieldResolver } from './User';

export default new GraphQLObjectType({
  name: 'ReplyConnectionFeedback',
  description: 'User feedback to a ReplyConnection',
  fields: () => ({
    user: {
      type: User,
      resolve: userFieldResolver,
    },

    comment: { type: GraphQLString },
    score: {
      description: 'One of 1, 0 and -1. Representing upvote, neutral and downvote, respectively',
      type: GraphQLInt,
    },
  }),
});
