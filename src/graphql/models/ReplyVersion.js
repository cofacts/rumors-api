import {
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';

export default new GraphQLObjectType({
  name: 'ReplyVersion',
  fields: () => ({
    createdAt: { type: GraphQLString },
    text: { type: GraphQLString },
    type: { type: GraphQLString },
    reference: { type: GraphQLString },
  }),
});
