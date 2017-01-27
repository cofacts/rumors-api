// Create or update a rumor
//

import {
  GraphQLString,
  GraphQLList,
} from 'graphql';

import Article from 'graphql/models/Article';

export default {
  type: Article,
  description: 'Create or update a rumor',
  args: {
    id: { type: GraphQLString }, // If no id is given, generate one.
    text: { type: GraphQLString },
    answerIds: { type: new GraphQLList(GraphQLString) },
  },
  async resolve(rootValue, { id, text, answerIds }, { loaders }) {
    // TODO: If ID does not exist (i.e. creating new rumor) but text is empty,
    // throw an error.
    //

    // TODO: If exists a rumor that has same ID or text, just merge the change of answerIds.
    // Otherwise, create a new rumor document.
    const rumor = loaders.docLoader.load(`/rumors/basic/${id}`);

    return rumor;
  },
};
