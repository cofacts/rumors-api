import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
} from 'graphql';

import Rumor from './Rumor';
import AnswerVersion from './AnswerVersion';

export default new GraphQLObjectType({
  name: 'Answer',
  fields: () => ({
    id: { type: GraphQLString },
    versions: {
      args: {
        limit: { type: GraphQLInt },
      },
      type: new GraphQLList(AnswerVersion),
      resolve: ({ versions }, { limit = Infinity }) => versions.slice(-limit),
    },
    rumors: {
      type: Rumor,
      resolve: async ({ id }, args, { loaders }) =>
        (await loaders.rumorsByAnswerIdLoader.load(id))
          .map(r => r._source),
    },
  }),
});
