import { assertUser } from 'graphql/util';
import {
  generatePseudonym,
  generateOpenPeepsAvatar,
  AvatarTypes,
  getUserId,
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
export async function createOrUpdateUser({ appUserId, appId }) {
  assertUser({ appId, userId: appUserId });
  const now = new Date().toISOString();
  const userId = getUserId({ appId, appUserId });

  const {
    body: { result, get: userFound },
  } = await client.update({
    index: 'users',
    type: 'doc',
    id: userId,
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
  const user = processMeta({ ...userFound, _id: userId });

  if (!isCreated && (user.appId !== appId || user.appUserId !== appUserId)) {
    const errorMessage = `collision found! ${
      user.appUserId
    } and ${appUserId} both hash to ${userId}`;
    console.log(errorMessage);
    rollbar.error(`createBackendUserError: ${errorMessage}`);
  }
  return {
    user,
    isCreated,
  };
}
