/**
 * Given userId & award badge (Id and metadata).
 *
 */
import { HTTPError } from 'fets';

import client from 'util/client';

/**
 * Update user to write badgeId. Throws if user does not exist.
 *
 * @param userId
 * @param badgeId
 * @param badgeMetaData
 */
async function appendBadgeToList(
  userId: string,
  badgeId: string,
  badgeMetaData: string
) {
  const now = new Date().toISOString();

  try {
    const {
      body: { result: setbadgeIdResult },
    } = await client.update({
      index: 'users',
      type: 'doc',
      id: userId,
      body: {
        script: {
          source: `
            if (ctx._source.badges == null) {
              ctx._source.badges = [];
            }
            ctx._source.badges.add(params.badge);
          `,
          params: {
            badge: {
              badgeId: badgeId,
              badgeMetaData: badgeMetaData,
              createdAt: now,
              isDisplayed: true,
              updatedAt: now,
            },
          },
        },
      },
    });

    /* istanbul ignore if */
    if (setbadgeIdResult === 'noop') {
      console.log(`Info: user ID ${userId} already has set the same badgeId.`);
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
 * Verify if the badge exists and if the current user is authorized to issue it
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
        `User ${requestUserId} is not authorized to issue badge ${badgeId}`
      );
    }
  } catch (e) {
    if (e instanceof HTTPError) throw e;
    throw new HTTPError(404, `Badge with ID=${badgeId} does not exist`);
  }
}

type awardBadgeReturnValue = {
  badgeId: string;
  badgeMetaData: string;
};

async function main({
  userId,
  badgeId,
  badgeMetaData,
  request,
}: {
  userId: string;
  badgeId: string;
  badgeMetaData: string;
  request: { userId: string };
}): Promise<awardBadgeReturnValue> {
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

  // Verify if the current user/service is authorized to issue this badge
  await verifyBadgeIssuer(badgeId, request.userId);

  await appendBadgeToList(userId, badgeId, badgeMetaData);

  return {
    badgeId,
    badgeMetaData,
  };
}

export default main;
