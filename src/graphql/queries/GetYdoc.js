import { GraphQLString, GraphQLNonNull } from 'graphql';

import Ydoc from 'graphql/models/Ydoc';

export default {
  type: Ydoc,
  args: {
    id: { type: new GraphQLNonNull(GraphQLString) },
  },
  resolve: async (rootValue, { id }, { loaders }) =>
    loaders.docLoader.load({ index: 'ydocs', id }),
};
