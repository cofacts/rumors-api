import { GraphQLObjectType, GraphQLString } from 'graphql';

export default new GraphQLObjectType({
  name: 'YdocVersion',
  fields: () => ({
    createdAt: { type: GraphQLString },
    snapshot: {
      type: GraphQLString,
      // https://www.elastic.co/guide/en/elasticsearch/reference/current/binary.html
      description: 'Binary that stores as base64 encoded string',
    },
  }),
});
