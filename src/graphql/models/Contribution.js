import { GraphQLInt, GraphQLObjectType, GraphQLString } from 'graphql';

export default new GraphQLObjectType({
  name: 'Contribution',
  fields: () => ({
    date: { type: GraphQLString },
    count: { type: GraphQLInt },
  }),
});
