import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLNonNull,
  GraphQLID,
} from 'graphql';
import Article from './Article';
import Node from '../interfaces/Node';

const Cooccurrence = new GraphQLObjectType({
  name: 'Cooccurrence',
  interfaces: [Node],
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },
    userId: { type: GraphQLNonNull(GraphQLString) },
    appId: { type: GraphQLNonNull(GraphQLString) },
    articles: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Article))),
      resolve: async ({ articleIds }, args, { loaders }) =>
        loaders.searchResultLoader.load({
          index: 'articles',
          type: 'doc',
          body: {
            query: {
              ids: {
                values: articleIds,
              },
            },
          },
        }),
    },
    articleIds: {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(GraphQLString))
      ),
    },
    createdAt: { type: new GraphQLNonNull(GraphQLString) },
    updatedAt: { type: new GraphQLNonNull(GraphQLString) },
  }),
});

export default Cooccurrence;
