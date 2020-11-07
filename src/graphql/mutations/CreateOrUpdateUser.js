import { assertUser } from 'graphql/util';
import {
  generatePseudonym,
  generateOpenPeepsAvatar,
  AvatarTypes,
  getUserId,
  isBackendApp,
} from 'graphql/models/User';
import client, { processMeta } from 'util/client';

import rollbar from 'rollbarInstance';

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
  const dbUserId = getUserId({ appId, userId });

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
