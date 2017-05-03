import { GraphQLObjectType, GraphQLString } from 'graphql';

const currentUserOnlyField = (key, type) => ({
  type,
  description: 'Returns only for current user. Returns `null` otherwise.',
  resolve(user, arg, context) {
    return user.id === context.user.id ? user[key] : null;
  },
});

const User = new GraphQLObjectType({
  name: 'User',
  fields: () => ({
    id: { type: GraphQLString },
    email: currentUserOnlyField('email', GraphQLString),
    name: { type: GraphQLString },
    avatarUrl: { type: GraphQLString },

    facebookId: currentUserOnlyField('facebookId', GraphQLString),
    githubId: currentUserOnlyField('githubId', GraphQLString),
    twitterId: currentUserOnlyField('twitterId', GraphQLString),

    createdAt: { type: GraphQLString },
  }),
});

export default User;

export const userFieldResolver = (
  { userId, from },
  args,
  { loaders, ...context }
) => {
  // If the root document is created by website users, we can resolve user from userId.
  //
  if (from === 'WEBSITE')
    return loaders.docLoader.load({ index: 'users', id: userId });

  // If the user comes from the same client as the root document, return the user id.
  //
  if (context.from === from) return { id: userId };

  // If not, this client is not allowed to see user.
  //
  return null;
};
