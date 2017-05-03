import { GraphQLString } from 'graphql';

import User from 'graphql/models/User';

export default {
  type: User,
  description: 'Gets specified user. If id is not given, returns the currently logged-in user. ' +
    'Note that some fields like email is not visible to other users.',
  args: {
    id: { type: GraphQLString },
  },
  resolve(rootValue, { id }, { user = null, loaders }) {
    if (!id) return user;

    return loaders.docLoader.load({ index: 'users', id });
  },
};
