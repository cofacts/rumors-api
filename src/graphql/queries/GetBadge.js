import { GraphQLString, GraphQLNonNull } from 'graphql';

import Badge from 'graphql/models/Badge';

export default {
  type: Badge,
  args: {
    id: { type: new GraphQLNonNull(GraphQLString) },
  },
  resolve: async (rootValue, { id }, { loaders }) =>
    loaders.docLoader.load({ index: 'badge', id }),
};
