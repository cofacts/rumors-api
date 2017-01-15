import {
  GraphQLString,
  GraphQLNonNull,
} from 'graphql';

import Answer from 'graphql/models/Answer';

export default {
  type: Answer,
  description: 'Create or update an answer',
  args: {
    id: { type: GraphQLString },
    text: { type: new GraphQLNonNull(GraphQLString) },
    reference: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(rootValue, { id, text }, { loaders }) {
    const answer = loaders.docLoader.load(`/answers/basic/${id}`);

    // TODO: When answer does not exist, create a new answer with 1 AnswerVersion.
    // else, append text & reference to the existing answer's versions.

    return answer;
  },
};
