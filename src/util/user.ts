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
import { User } from 'rumors-db/schema/users';

type UserInContext = User & {
  id: string;
  /** Filled by createOrUpdateUsear */
  appId: string;
};

type UserAppIdPair = {
  userId: string;
  appId: string;
};

export const AUTH_ERROR_MSG = 'userId is not set via query string.';

/**
 * @param userOrIds - user in GraphQL context, or {userId, appId} pair
 */
export function assertUser(
  userOrIds:
    | UserInContext /* For user instance */
    | UserAppIdPair /* for legacy {userId, appId} pair */
    | null
): asserts userOrIds is UserInContext {
  if (userOrIds === null || typeof userOrIds !== 'object') {
    throw new Error(AUTH_ERROR_MSG);
  }

  const userId =
    'id' in userOrIds ? userOrIds.id /* For user instance */ : userOrIds.userId;

  if (!userId) {
    throw new Error(AUTH_ERROR_MSG);
  }

  if (userId && !userOrIds.appId) {
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
  ].map((ary) => sample(ary));
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
export const avatarUrlResolver =
  (s = 100, d = 'identicon', r = 'g') =>
  (user: User) => {
    switch (user.avatarType) {
      case AvatarTypes.OpenPeeps:
        return null;
      case AvatarTypes.Facebook:
        return 'facebookId' in user
          ? `https://graph.facebook.com/v9.0/${user.facebookId}/picture?height=${s}`
          : null;
      case AvatarTypes.Github:
        return 'githubId' in user
          ? `https://avatars2.githubusercontent.com/u/${user.githubId}?s=${s}`
          : null;
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
export const getAvailableAvatarTypes = (user: User | undefined) => {
  const types = [AvatarTypes.OpenPeeps];
  if (user?.email) types.push(AvatarTypes.Gravatar);
  if (user && 'facebookId' in user && user.facebookId)
    types.push(AvatarTypes.Facebook);
  if (user && 'githubId' in user && user.githubId)
    types.push(AvatarTypes.Github);
  return types;
};

export const isBackendApp = (appId: UserAppIdPair['appId']) =>
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
export const getUserId = ({ appId, userId }: UserAppIdPair) => {
  if (!appId || !isBackendApp(appId) || isDBUserId({ appId, userId }))
    return userId;
  else return convertAppUserIdToUserId({ appId, appUserId: userId });
};

/**
 * Check if the userId for a backend user is the user id in db or it is the app user Id.
 */
export const isDBUserId = ({ appId, userId }: UserAppIdPair) =>
  appId &&
  userId &&
  userId.length === BACKEND_USER_ID_LEN &&
  userId.substr(0, 6) === `${encodeAppId(appId)}_`;

export const encodeAppId = (appId: UserAppIdPair['appId']) =>
  crypto
    .createHash('md5')
    .update(appId)
    .digest('base64')
    .replace(/[+/]/g, '')
    .substr(0, 5);

export const sha256 = (value: string) =>
  crypto
    .createHash('sha256')
    .update(value)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * @param appUserId - user ID given by an backend app
 * @param appId - app ID
 * @returns the id used to index `user` in db
 */
export const convertAppUserIdToUserId = ({
  appId,
  appUserId,
}: {
  appId: UserAppIdPair['appId'];
  appUserId: string;
}) => {
  return `${encodeAppId(appId)}_${sha256(appUserId)}`;
};

/**
 * Index backend user if not existed, and record the last active time as now.
 *
 * @param userId - either appUserID given by an backend app or userId for frontend users
 * @param appId - app ID
 *
 * @returns { user: User, isCreated: boolean }
 */
export async function createOrUpdateUser({
  userId,
  appId,
}: UserAppIdPair): Promise<{
  user: UserInContext;
  isCreated: boolean;
}> {
  assertUser({ appId, userId });
  const now = new Date().toISOString();
  const dbUserId = exports.getUserId({ appId, userId }); // For unit test mocking
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
  const user = processMeta<User>({ ...userFound, _id: dbUserId });

  // Make Typescript happy
  if (!user) throw new Error('[createOrUpdateUser] Cannot process user');

  // checking for collision
  if (
    !isCreated &&
    isBackendApp(appId) &&
    'appUserId' in user /* Backend user */ &&
    (user.appId !== appId || user.appUserId !== userId)
  ) {
    const errorMessage = `collision found! ${user.appUserId} and ${userId} both hash to ${dbUserId}`;
    console.log(errorMessage);
    rollbar.error(`createBackendUserError: ${errorMessage}`);
  }

  return {
    user: { appId /* fill in appId for website users */, ...user },
    isCreated,
  };
}

/**
 * @param user
 * @returns If the user is blocked (cannot create visible content)
 */
export function isUserBlocked(user: User) {
  return !!user.blockedReason;
}

/**
 * @param user
 * @returns Default status value for the content generated by the specified user
 */
export function getContentDefaultStatus(user: User) {
  return isUserBlocked(user) ? 'BLOCKED' : 'NORMAL';
}
