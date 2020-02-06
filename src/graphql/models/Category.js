import { GraphQLObjectType, GraphQLString } from 'graphql';

const Category = new GraphQLObjectType({
  name: 'Category',
  description: 'Category label for specific topic',
  fields: {
    id: { type: GraphQLString },
    title: { type: GraphQLString },
    description: { type: GraphQLString },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  },
});

export default Category;
