import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLNonNull,
} from 'graphql';
import crypto from 'crypto';
import {
  adjectives,
  names,
  towns,
  separators,
  decorators,
} from 'util/pseudonymDict';
import {
  accessories,
  faces,
  facialHairStyles,
  hairStyles,
  bustPoses,
} from 'util/openPeepsOptions';
import { sample, random } from 'lodash';

/**
 * Generates a pseudonym.
 */
export const generatePseudonym = () => {
  const [adj, name, place, separator, decorator] = [
    adjectives,
    names,
    towns,
    separators,
    decorators,
  ].map(ary => sample(ary));
  return decorator(separator({ adj, name, place }));
};

export const AvatarTypes = {
  OpenPeeps: 'OpenPeeps',
};

export const isBackendApp = appId =>
  appId !== 'WEBSITE' && appId !== 'DEVELOPMENT_FRONTEND';

/**
 * Generates data for open peeps avatar.
 */
export const generateOpenPeepsAvatar = () => {
  const accessory = random() ? sample(accessories) : 'None';
  const facialHair = random() ? sample(facialHairStyles) : 'None';
  const flip = !!random();
  const backgroundColorIndex = random(0, 1, true);

  const face = sample(faces);
  const hair = sample(hairStyles);
  const body = sample(bustPoses);

  return {
    accessory,
    body,
    face,
    hair,
    facialHair,
    backgroundColorIndex,
    flip,
  };
};

export const encodeAppId = appId =>
  crypto
    .createHash('md5')
    .update(appId)
    .digest('base64')
    .replace(/[+/]/g, '')
    .substr(0, 5);

export const sha256 = value =>
  crypto
    .createHash('sha256')
    .update(value)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * @param {string} appUserId - user ID given by an backend app
 * @param {string} appId - app ID
 * @returns {string} the id used to index `user` in db
 */
export const convertAppUserIdToUserId = ({ appId, appUserId }) => {
  return `${encodeAppId(appId)}_${sha256(appUserId)}`;
};

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
    email: currentUserOnlyField(GraphQLString),
    name: { type: GraphQLString },
    avatarUrl: avatarResolver(),
    //    avatarData: { type: GraphQLString },

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
    //    lastActiveAt: { type: GraphQLString },
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
  if (!isBackendApp(appId))
    return await loaders.docLoader.load({ index: 'users', id: userId });

  /*
  if (userId && userId.substr(0, 6) === `${encodeAppId(appId)}_`) {
    return await loaders.docLoader.load({ index: 'users', id: userId });
  }
  

  const user = await loaders.docLoader.load({ index: 'users', id: convertAppUserIdToUserId({ appId, appUserId: userId }) });
  if (user) return user;
  */

  // Todo: some unit tests are depending on this code block, need to clean up those tests and then remove the following lines.
  // If the user comes from the same client as the root document, return the user id.
  //
  if (context.appId === appId) return { id: userId };

  // If not, this client is not allowed to see user.
  //
  return null;
};
