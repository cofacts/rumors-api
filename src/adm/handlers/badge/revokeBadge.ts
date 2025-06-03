/**
 * Given userId & badgeId, revoke the badge from the user.
 *
 */
import { HTTPError } from 'fets';

import client from 'util/client';

/**
 * Remove badge from user's badge list. Throws if user does not exist.
 *
 * @param userId
 * @param badgeId
 */
async function removeBadgeFromList(userId: string, badgeId: string) {
  const now = new Date().toISOString();

  try {
    const {
      body: { result: removeBadgeResult },
    } = await client.update({
      index: 'users',
      type: 'doc',
      id: userId,
      body: {
        script: {
          source: `
            if (ctx._source.badges == null) {
              return "noop";
            }
            
            // Find the badge with the given ID
            int badgeIndex = -1;
            for (int i = 0; i < ctx._source.badges.length; i++) {
              if (ctx._source.badges[i].badgeId == params.badgeId) {
                badgeIndex = i;
                break;
              }
            }
            
            // Remove the badge if found
            if (badgeIndex >= 0) {
              ctx._source.badges.remove(badgeIndex);
              return "updated";
            } else {
              // Return noop if badge doesn't exist
              return "noop";
            }
          `,
          params: {
            badgeId: badgeId,
            now: now,
          },
        },
      },
    });

    /* istanbul ignore if */
    if (removeBadgeResult === 'noop') {
      console.log(`Info: user ID ${userId} does not have badge with ID ${badgeId}.`);
    }
  } catch (e) {
    console.log(e);
    /* istanbul ignore else */
    if (
      e &&
      typeof e === 'object' &&
      'message' in e &&
      e.message === 'document_missing_exception'
    ) {
      throw new HTTPError(400, `User with ID=${userId} does not exist`);
    }

    throw e;
  }
}

/**
 * Verify if the badge exists and if the current user is authorized to revoke it
 *
 * @param badgeId - ID of the badge to verify
 * @param requestUserId - ID of the user making the request
 * @throws {HTTPError} if badge doesn't exist or user is not authorized
 */
async function verifyBadgeIssuer(badgeId: string, requestUserId: string) {
  try {
    const {
      body: { _source: badge },
    } = await client.get({
      index: 'badges',
      type: 'doc',
      id: badgeId,
    });

    if (!badge) {
      throw new HTTPError(404, `Badge with ID=${badgeId} does not exist`);
    }

    if (!badge.issuers?.includes(requestUserId)) {
      throw new HTTPError(
        403,
        `User ${requestUserId} is not authorized to revoke badge ${badgeId}`
      );
    }
  } catch (e) {
    if (e instanceof HTTPError) throw e;
    throw new HTTPError(404, `Badge with ID=${badgeId} does not exist`);
  }
}

type revokeBadgeReturnValue = {
  badgeId: string;
  success: boolean;
};

async function main({
  userId,
  badgeId,
  request,
}: {
  userId: string;
  badgeId: string;
  request: { userId: string };
}): Promise<revokeBadgeReturnValue> {
  // Check if user exists first
  try {
    const { body } = await client.get({
      index: 'users',
      type: 'doc',
      id: userId,
    });
    if (!body._source) {
      throw new HTTPError(400, `User with ID=${userId} does not exist`);
    }
  } catch (e) {
    if (e instanceof HTTPError) throw e;
    throw new HTTPError(400, `User with ID=${userId} does not exist`);
  }

  // Verify if the current user/service is authorized to revoke this badge
  await verifyBadgeIssuer(badgeId, request.userId);

  await removeBadgeFromList(userId, badgeId);

  return {
    badgeId,
    success: true,
  };
}

export default main;
