import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
} from 'graphql';

import Answer from './Answer';

export default new GraphQLObjectType({
  name: 'Rumor',
  fields: () => ({
    id: { type: GraphQLString },
    text: { type: GraphQLString },
    answers: {
      type: new GraphQLList(Answer),
      resolve: async ({ answerIds }, args, { loaders }) =>
        (await loaders.docLoader.loadMany(answerIds))
          .map(r => r._source),
    },
  }),
});
