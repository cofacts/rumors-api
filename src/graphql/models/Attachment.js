import { GraphQLObjectType, GraphQLString } from 'graphql';

export default new GraphQLObjectType({
  name: 'Attachment',
  fields: () => ({
    mediaUrl: { type: GraphQLString },
    hash: { type: GraphQLString },
  }),
});
