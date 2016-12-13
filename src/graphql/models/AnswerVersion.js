import {
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';

export default new GraphQLObjectType({
  name: 'AnswerVersion',
  fields: () => ({
    createdAt: { type: GraphQLString },
    text: { type: GraphQLString },
    reference: { type: GraphQLString },
  }),
});
