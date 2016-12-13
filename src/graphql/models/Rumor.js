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
      resolve: ({ answerIds }, args, { loaders }) =>
        loaders.docLoader.loadMany(answerIds.map(id => `/answers/basic/${id}`)),
    },
  }),
});
