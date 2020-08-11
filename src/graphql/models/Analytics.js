import { GraphQLInt, GraphQLObjectType, GraphQLString } from 'graphql';

export default new GraphQLObjectType({
  name: 'Analytics',
  fields: () => ({
    date: { type: GraphQLString },
    lineUser: { type: GraphQLInt },
    lineVisit: { type: GraphQLInt },
    webUser: { type: GraphQLInt },
    webVisit: { type: GraphQLInt },
  }),
});
