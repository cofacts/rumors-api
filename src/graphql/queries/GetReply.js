import { GraphQLString } from 'graphql';

import Reply from 'graphql/models/Reply';

export default {
  type: Reply,
  args: {
    id: { type: GraphQLString },
  },
  resolve: async (rootValue, { id }, { loaders }) =>
    loaders.docLoader.load({ index: 'replies', id }),
};
