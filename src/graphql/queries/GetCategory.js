import { GraphQLString } from 'graphql';

import Category from 'graphql/models/Category';

export default {
  type: Category,
  args: {
    id: { type: GraphQLString },
  },
  resolve: async (rootValue, { id }, { loaders }) =>
    loaders.docLoader.load({ index: 'categories', id }),
};
