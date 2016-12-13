import {
  GraphQLString,
} from 'graphql';

import Answer from 'graphql/models/Answer';

export default {
  type: Answer,
  args: {
    id: { type: GraphQLString },
  },
  resolve: async (rootValue, { id }, { loaders }) =>
    loaders.docLoader.load(`/answers/basic/${id}`),
};
