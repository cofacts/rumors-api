import { GraphQLString } from 'graphql';
import Badge from '../models/Badge';

export default {
  type: Badge,
  args: {
    id: { type: GraphQLString },
  },
  resolve: async (rootValue, { id }, { loaders }) => {
    const result = await loaders.docLoader.load({
      index: 'badges',
      id,
    });
    return result;
  },
};
