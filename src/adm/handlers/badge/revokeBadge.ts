/**
 * Given userId & badgeId, revoke the badge from the user.
 *
 */
import { HTTPError } from 'fets';
import { errors } from '@elastic/elasticsearch';

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
    const removeBadgeResult = await client.update({
      index: 'users',
      id: userId,
      script: {
        source: `
          if (ctx._source.badges == null) {
            ctx.op = 'noop';
          } else {
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
            } else {
              // Set operation to noop if badge doesn't exist
              ctx.op = 'noop';
            }
          }
        `,
        params: {
          badgeId: badgeId,
          now: now,
        },
      },
    });

    /* istanbul ignore if */
    if (removeBadgeResult.result === 'noop') {
      console.log(
        `Info: user ID ${userId} does not have badge with ID ${badgeId}.`
      );
    }
  } catch (e) {
    console.log(e);
    /* istanbul ignore else */
    if (
      e instanceof errors.ResponseError &&
      e.body?.error?.type === 'document_missing_exception'
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
    const { _source: badge } = await client.get<{ issuers?: string[] }>({
      index: 'badges',
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
  // Verify if the current user/service is authorized to revoke this badge
  await verifyBadgeIssuer(badgeId, request.userId);

  await removeBadgeFromList(userId, badgeId);

  return {
    badgeId,
    success: true,
  };
}

export default main;
