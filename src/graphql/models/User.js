import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLNonNull,
} from 'graphql';
import crypto from 'crypto';
import { getUserId } from 'util/user';

/**
 * Field config helper for current user only field.
 * Resolves to null if root object is not current user. Otherwise, invoke provided resolver.
 *
 * @param {GraphQLScalarType | GraphQLObjectType} type
 * @param {function?} resolver - Use default resolver if not given.
 */
export const currentUserOnlyField = (type, resolver) => ({
  type,
  description: 'Returns only for current user. Returns `null` otherwise.',
  resolve(user, arg, context, info) {
    if (!context.user || user.id !== context.user.id) return null;

    return resolver ? resolver(user, arg, context, info) : user[info.fieldName];
  },
});

/**
 * Use Gravatar as avatar provider.
 */
const avatarResolver = (s = 80, d = 'identicon', r = 'g') => ({
  type: GraphQLString,
  description: 'return hash based on user email for gravatar url',
  resolve(user) {
    const GRAVATAR_URL = 'https://www.gravatar.com/avatar/';
    const hash = crypto
      .createHash('md5')
      .update((user.email || user.id).trim().toLocaleLowerCase())
      .digest('hex');
    const params = `?s=${s}&d=${d}&r=${r}`;
    return `${GRAVATAR_URL}${hash}${params}`;
  },
});

const User = new GraphQLObjectType({
  name: 'User',
  fields: () => ({
    id: { type: GraphQLString },
    slug: { type: GraphQLString },
    email: currentUserOnlyField(GraphQLString),
    name: { type: GraphQLString },
    avatarUrl: avatarResolver(),
    avatarData: { type: GraphQLString },

    // TODO: also enable these two fields for requests from the same app?
    appId: currentUserOnlyField(GraphQLString),
    appUserId: currentUserOnlyField(GraphQLString),

    facebookId: currentUserOnlyField(GraphQLString),
    githubId: currentUserOnlyField(GraphQLString),
    twitterId: currentUserOnlyField(GraphQLString),
    repliedArticleCount: {
      type: GraphQLNonNull(GraphQLInt),
      description: 'Number of articles this user has replied to',
      resolve: (user, args, context) =>
        context.loaders.repliedArticleCountLoader
          .load(user.id)
          .then(num => num || 0),
    },
    votedArticleReplyCount: {
      type: GraphQLNonNull(GraphQLInt),
      description: 'Number of article replies this user has given feedbacks',
      resolve: (user, args, context) =>
        context.loaders.votedArticleReplyCountLoader
          .load(user.id)
          .then(num => num || 0),
    },

    level: {
      type: new GraphQLNonNull(GraphQLInt),
      async resolve(user, arg, context) {
        const { level } =
          (await context.loaders.userLevelLoader.load(user.id)) || {};
        return level || 0;
      },
    },
    points: {
      type: new GraphQLNonNull(
        new GraphQLObjectType({
          name: 'PointInfo',
          description:
            "Information of a user's point. Only available for current user.",
          fields: {
            total: {
              type: new GraphQLNonNull(GraphQLInt),
              description: 'Points earned by the current user',
            },
            currentLevel: {
              type: new GraphQLNonNull(GraphQLInt),
              description: 'Points required for current level',
            },
            nextLevel: {
              type: new GraphQLNonNull(GraphQLInt),
              description:
                'Points required for next level. null when there is no next level.',
            },
          },
        })
      ),
      resolve: async (user, arg, context) => {
        const { totalPoints, currentLevelPoints, nextLevelPoints } =
          (await context.loaders.userLevelLoader.load(user.id)) || {};

        return {
          total: totalPoints || 0,
          currentLevel: currentLevelPoints || 0,
          nextLevel: nextLevelPoints || 1,
        };
      },
    },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
    lastActiveAt: { type: GraphQLString },
  }),
});

export default User;

export const userFieldResolver = async (
  { userId, appId },
  args,
  { loaders, ...context }
) => {
  // If the root document is created by website users or if the userId is already converted to db userId,
  // we can resolve user from userId.
  //
  if (userId && appId) {
    const id = getUserId({ appId, userId });
    const user = await loaders.docLoader.load({ index: 'users', id });
    if (user) return user;
  }

  /* TODO: some unit tests are depending on this code block, need to clean up those tests and then 
     remove the following lines, and the corresponding unit test. */

  // If the user comes from the same client as the root document, return the user id.
  //
  if (context.appId && context.appId === appId) return { id: userId };

  // If not, this client is not allowed to see user.
  //
  return null;
};
