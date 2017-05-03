import { GraphQLObjectType, GraphQLString } from 'graphql';

export default new GraphQLObjectType({
  name: 'MutationResult',
  fields: () => ({
    id: { type: GraphQLString },
  }),
});
