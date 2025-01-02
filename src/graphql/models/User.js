import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLList,
  GraphQLID,
} from 'graphql';
import {
  AvatarTypes,
  getAvailableAvatarTypes,
  getUserId,
  avatarUrlResolver,
} from 'util/user';
import AvatarTypeEnum from './AvatarTypeEnum';
import Contribution from './Contribution';
import Node from '../interfaces/Node';
import { timeRangeInput, createConnectionType } from 'graphql/util';
import Badge from './UserAwardedBadge';

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

const User = new GraphQLObjectType({
  name: 'User',
  interfaces: [Node],
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },
    slug: { type: GraphQLString },
    email: currentUserOnlyField(GraphQLString),
    name: { type: GraphQLString },
    bio: { type: GraphQLString },

    avatarUrl: {
      type: GraphQLString,
      description: 'returns avatar url from facebook, github or gravatar',
      resolve: avatarUrlResolver(),
    },
    avatarData: {
      type: GraphQLString,
      description:
        'return avatar data as JSON string, currently only used when avatarType is OpenPeeps',
    },
    avatarType: {
      type: AvatarTypeEnum,
      resolver(user) {
        return user?.avatarType ?? AvatarTypes.Gravatar;
      },
    },

    availableAvatarTypes: currentUserOnlyField(
      new GraphQLList(GraphQLString),
      (user) => getAvailableAvatarTypes(user)
    ),

    appId: { type: GraphQLString },
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
          .then((num) => num || 0),
    },
    votedArticleReplyCount: {
      type: GraphQLNonNull(GraphQLInt),
      description: 'Number of article replies this user has given feedbacks',
      resolve: (user, args, context) =>
        context.loaders.votedArticleReplyCountLoader
          .load(user.id)
          .then((num) => num || 0),
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

    contributions: {
      type: new GraphQLList(Contribution),
      description: 'List of contributions made by the user',
      args: {
        dateRange: {
          type: timeRangeInput,
          description:
            'List only the contributions between the specific time range.',
        },
      },
      resolve: async ({ id }, { dateRange }, { loaders }) => {
        return await loaders.contributionsLoader.load({
          userId: id,
          dateRange,
        });
      },
    },

    blockedReason: {
      description:
        'If not null, the user is blocked with the announcement in this string.',
      type: GraphQLString,
    },

    badges: {
      type: new GraphQLList(Badge),
      description: 'User awarded badges',
    },

    majorBadgeUrl: {
      type: GraphQLString,
      description: 'returns badge background image url',
      resolve: async (user, atgs, { loaders }) => {
        const displayItem = user.badges.find({ isDisplay: true });
        if (displayItem == null) {
          return null;
        }
        const badgeId = displayItem.id;
        const badgeInfo = loaders.docLoader.load({
          index: 'badges',
          id: badgeId,
        });
        return badgeInfo.borderImage;
      },
    },

    majorBadgeName: {
      type: GraphQLString,
      description: 'returns badge background image url',
      resolve: async (user, atgs, { loaders }) => {
        const displayItem = user.badges.find({ isDisplay: true });
        if (displayItem == null) {
          return null;
        }
        const badgeId = displayItem.id;
        const badgeInfo = loaders.docLoader.load({
          index: 'badges',
          id: badgeId,
        });
        return badgeInfo.name;
      },
    },
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

export const UserConnection = createConnectionType('UserConnection', User);
