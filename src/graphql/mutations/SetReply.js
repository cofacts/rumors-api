import {
  GraphQLString,
  GraphQLNonNull,
} from 'graphql';

import Reply from 'graphql/models/Reply';

export default {
  type: Reply,
  description: 'Create or update a reply',
  args: {
    id: { type: GraphQLString },
    text: { type: new GraphQLNonNull(GraphQLString) },
    reference: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(rootValue, { id, text }, { loaders }) {
    const reply = loaders.docLoader.load(`/replies/basic/${id}`);

    // TODO: When reply does not exist, create a new  with reply1 AnswerVersion.
    // else, append text & reference to the existing reply's versions.

    return reply;
  },
};
