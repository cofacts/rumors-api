import { GraphQLObjectType, GraphQLString, GraphQLNonNull } from 'graphql';
import User, { userFieldResolver } from './User';

export default new GraphQLObjectType({
  name: 'Contributor',
  fields: () => ({
    user: {
      type: User,
      description: 'The user who contributed to this article.',
      resolve: userFieldResolver,
    },
    userId: { type: GraphQLNonNull(GraphQLString) },
    appId: { type: GraphQLNonNull(GraphQLString) },
    updatedAt: { type: GraphQLString },
  }),
});
