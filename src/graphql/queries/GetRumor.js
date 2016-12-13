import {
  GraphQLString,
} from 'graphql';

import Rumor from 'graphql/models/Rumor';

export default {
  type: Rumor,
  args: {
    id: { type: GraphQLString },
  },
  resolve: async (rootValue, { id }, { loaders }) =>
    loaders.docLoader.load(`/rumors/basic/${id}`),
};
