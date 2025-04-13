import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLID,
  GraphQLList,
} from 'graphql';

export default new GraphQLObjectType({
  name: 'Badge',
  fields: {
    id: {
      type: GraphQLID,
    },
    name: { type: GraphQLString },
    displayName: { type: GraphQLString },
    description: { type: GraphQLString },
    link: { type: GraphQLString },
    icon: { type: GraphQLString },
    borderImage: { type: GraphQLString },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
    issuers: {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(GraphQLString))
      ),
    },
  },
});
