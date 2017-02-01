import {
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';


export default new GraphQLObjectType({
  name: 'ReplyRequest',
  fields: () => ({
    id: { type: GraphQLString },
    userId: { type: GraphQLString },
    from: { type: GraphQLString },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  }),
});
