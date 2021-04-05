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
import client, { processMeta } from 'util/client';
import rollbar from 'rollbarInstance';
import crypto from 'crypto';

export const AUTH_ERROR_MSG = 'userId is not set via query string.';

/**
 * @param {object} param
 * @param {string} param.userId
 * @param {string} param.appId
 */
export function assertUser({ userId, appId }) {
  if (!userId) {
    throw new Error(AUTH_ERROR_MSG);
  }

  if (userId && !appId) {
    throw new Error(
      'userId is set, but x-app-id or x-app-secret is not set accordingly.'
    );
  }
}

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
  Gravatar: 'Gravatar',
  Facebook: 'Facebook',
  Github: 'Github',
};

/**
 * Returns avatar url based on avatarType.
 */
export const avatarUrlResolver = (
  s = 100,
  d = 'identicon',
  r = 'g'
) => user => {
  switch (user.avatarType) {
    case AvatarTypes.OpenPeeps:
      return null;
    case AvatarTypes.Facebook:
      return `https://graph.facebook.com/v9.0/${
        user.facebookId
      }/picture?height=${s}`;
    case AvatarTypes.Github:
      return `https://avatars2.githubusercontent.com/u/${user.githubId}?s=${s}`;
    case AvatarTypes.Gravatar:
    default: {
      // return hash based on user email for gravatar url
      const GRAVATAR_URL = 'https://www.gravatar.com/avatar/';
      if (user.email) {
        const hash = crypto
          .createHash('md5')
          .update(user.email.trim().toLocaleLowerCase())
          .digest('hex');
        const params = `?s=${s}&d=${d}&r=${r}`;
        return `${GRAVATAR_URL}${hash}${params}`;
      }
      return `${GRAVATAR_URL}?s=${s}&d=mp`;
    }
  }
};

/**
 * Returns a list of avatar type options based on information available for a user.
 */
export const getAvailableAvatarTypes = user => {
  let types = [AvatarTypes.OpenPeeps];
  if (user?.email) types.push(AvatarTypes.Gravatar);
  if (user?.facebookId) types.push(AvatarTypes.Facebook);
  if (user?.githubId) types.push(AvatarTypes.Github);
  return types;
};

export const isBackendApp = appId =>
  appId !== 'WEBSITE' && appId !== 'DEVELOPMENT_FRONTEND';

// 6 for appId prefix and 43 for 256bit hashed userId with base64 encoding.
const BACKEND_USER_ID_LEN = 6 + 43;

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

/**
 * Given appId, userId pair, where userId could be appUserId or dbUserID, returns the id of corresponding user in db.
 */
export const getUserId = ({ appId, userId }) => {
  if (!appId || !isBackendApp(appId) || isDBUserId({ appId, userId }))
    return userId;
  else return convertAppUserIdToUserId({ appId, appUserId: userId });
};

/**
 * Check if the userId for a backend user is the user id in db or it is the app user Id.
 */
export const isDBUserId = ({ appId, userId }) =>
  appId &&
  userId &&
  userId.length === BACKEND_USER_ID_LEN &&
  userId.substr(0, 6) === `${encodeAppId(appId)}_`;

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
 * Index backend user if not existed, and record the last active time as now.
 *
 * @param {string} userID    - either appUserID given by an backend app or userId for frontend users
 * @param {string} appId     - app ID
 *
 * @returns {user: User, isCreated: boolean}
 */

export async function createOrUpdateUser({ userId, appId }) {
  assertUser({ appId, userId });
  const now = new Date().toISOString();
  const dbUserId = exports.getUserId({ appId, userId });
  const {
    body: { result, get: userFound },
  } = await client.update({
    index: 'users',
    type: 'doc',
    id: dbUserId,
    body: {
      doc: {
        lastActiveAt: now,
      },
      upsert: {
        name: exports.generatePseudonym(),
        avatarType: AvatarTypes.OpenPeeps,
        avatarData: JSON.stringify(exports.generateOpenPeepsAvatar()),
        appId,
        appUserId: userId,
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      },
      _source: true,
    },
  });

  const isCreated = result === 'created';
  const user = processMeta({ ...userFound, _id: dbUserId });

  // checking for collision
  if (
    !isCreated &&
    isBackendApp(appId) &&
    (user.appId !== appId || user.appUserId !== userId)
  ) {
    const errorMessage = `collision found! ${
      user.appUserId
    } and ${userId} both hash to ${dbUserId}`;
    console.log(errorMessage);
    rollbar.error(`createBackendUserError: ${errorMessage}`);
  }

  return {
    user,
    isCreated,
  };
}
