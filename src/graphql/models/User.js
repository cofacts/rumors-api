import { GraphQLObjectType, GraphQLString, GraphQLInt } from 'graphql';
import client from 'util/client';

/**
 * Field config helper for current user only field.
 * Resolves to null if root object is not current user. Otherwise, invoke provided resolver.
 *
 * @param {GraphQLScalarType | GraphQLObjectType} type
 * @param {function?} resolver - Use default resolver if not given.
 */
const currentUserOnlyField = (type, resolver) => ({
  type,
  description: 'Returns only for current user. Returns `null` otherwise.',
  resolve(user, arg, context, info) {
    if (user.id !== context.user.id) return null;

    return resolver ? resolver(user, arg, context, info) : user[info.fieldName];
  },
});

const User = new GraphQLObjectType({
  name: 'User',
  fields: () => ({
    id: { type: GraphQLString },
    email: currentUserOnlyField(GraphQLString),
    name: { type: GraphQLString },
    avatarUrl: { type: GraphQLString },

    facebookId: currentUserOnlyField(GraphQLString),
    githubId: currentUserOnlyField(GraphQLString),
    twitterId: currentUserOnlyField(GraphQLString),
    repliedArticleCount: currentUserOnlyField(GraphQLInt, async user => {
      const { count } = await client.count({
        index: 'articles',
        type: 'doc',
        body: {
          query: {
            nested: {
              path: 'articleReplies',
              query: {
                bool: {
                  must: [
                    {
                      term: {
                        'articleReplies.userId': user.id,
                      },
                    },
                    {
                      term: {
                        'articleReplies.appId': 'WEBSITE',
                      },
                    },
                    {
                      term: {
                        'articleReplies.status': 'NORMAL',
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      });

      return count;
    }),

    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  }),
});

export default User;

export const userFieldResolver = (
  { userId, appId },
  args,
  { loaders, ...context }
) => {
  // If the root document is created by website users, we can resolve user from userId.
  //
  if (appId === 'WEBSITE')
    return loaders.docLoader.load({ index: 'users', id: userId });

  // If the user comes from the same client as the root document, return the user id.
  //
  if (context.appId === appId) return { id: userId };

  // If not, this client is not allowed to see user.
  //
  return null;
};
