import {
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';

import Answer from './Answer';

export default new GraphQLObjectType({
  name: 'Rumor',
  fields: () => ({
    id: { type: GraphQLString },
    text: { type: GraphQLString },
    answers: {
      type: Answer,
      resolve: ({ answerIds }, args, { loaders }) =>
        loaders.answerLoader.loadMany(answerIds),
    },
  }),
});
