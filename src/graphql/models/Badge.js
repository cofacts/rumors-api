import { GraphQLBoolean, GraphQLObjectType, GraphQLString } from 'graphql';

export default new GraphQLObjectType({
  name: 'Badge',
  fields: () => ({
    name: { type: GraphQLString },
    displayName: { type: GraphQLString },
    description: { type: GraphQLString },
    link: { type: GraphQLString },
    icon: { type: GraphQLString },
    borderImage: { type: GraphQLString },
    issuers: { type: GraphQLString },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  }),
});
