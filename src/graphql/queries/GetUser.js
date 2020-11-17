import { GraphQLString } from 'graphql';

import User from 'graphql/models/User';

export default {
  type: User,
  description: `
    Gets specified user. If id is not given, returns the currently logged-in user.
    Note that some fields like email is not visible to other users.
  `,
  args: {
    id: { type: GraphQLString },
    slug: { type: GraphQLString },
  },
  resolve(rootValue, { id, slug }, { user = null, loaders }) {
    if (!id && !slug) return user;
    if (id && slug) throw new Error('cannot search by both id and slug');

    if (id) return loaders.docLoader.load({ index: 'users', id });
    else return loaders.userLoader.load({ slug });
  },
};
