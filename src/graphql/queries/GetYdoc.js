import { GraphQLString } from 'graphql';

import Ydoc from 'graphql/models/Ydoc';

export default {
  type: Ydoc,
  args: {
    id: { type: GraphQLString },
  },
  resolve: async (rootValue, { id }, { loaders }) =>
    loaders.docLoader.load({ index: 'ydocs', id }),
};
