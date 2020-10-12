import { assertUser } from 'graphql/util';
import User, {
  generatePseudonym,
  generateOpenPeepsAvatar,
  AvatarTypes,
  isBackendApp,
  convertAppUserIdToUserId,
} from 'graphql/models/User';
import client, { processMeta } from 'util/client';

import rollbar from 'rollbarInstance';

/**
 * Index backend user if not existed, and record the last active time as now.
 *
 * @param {string} appUserId - user ID given by an backend app
 * @param {string} appId     - app ID
 *
 * @returns {user: User, isCreated: boolean}
 */
export async function createOrUpdateBackendUser({ appUserId, appId }) {
  assertUser({ appId, userId: appUserId });
  if (!isBackendApp(appId)) return { user: {}, isCreated: false };

  const now = new Date().toISOString();
  const dbUserId = convertAppUserIdToUserId({ appId, appUserId });

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
        name: generatePseudonym(),
        avatarType: AvatarTypes.OpenPeeps,
        avatarData: JSON.stringify(generateOpenPeepsAvatar()),
        appId,
        appUserId,
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      },
      _source: true,
    },
  });

  const isCreated = result === 'created';
  const user = processMeta({ ...userFound, _id: dbUserId });
  if (!isCreated && (user.appId !== appId || user.appUserId !== appUserId)) {
    const errorMessage = `collision found! ${
      user.appUserId
    } and ${appUserId} both hash to ${dbUserId}`;
    console.log(errorMessage);
    rollbar.error(`createBackendUserError: ${errorMessage}`);
  }
  return {
    user,
    isCreated,
  };
}

export default {
  description: 'Create or update a user for the given appId, appUserId pair',
  type: User,
  args: {},

  async resolve(rootValue, _, { appId, userId }) {
    const { user } = await createOrUpdateBackendUser({
      appId,
      appUserId: userId,
    });
    return user;
  },
};
