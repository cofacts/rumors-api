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

  const badges: any[] = [];

  try {
    const {
      body: { result: setbadgeIdResult },
    } = await client.update({
      index: 'users',
      type: 'doc',
      id: userId,
      body: {
        doc: { badges },
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

type awardBadgeReturnValue = {
  badgeId: string;
  badgeMetaData: string;
};

async function main({
  userId,
  badgeId,
  badgeMetaData,
}: {
  userId: string;
  badgeId: string;
  badgeMetaData: string;
}): Promise<awardBadgeReturnValue> {
  await appendBadgeToList(userId, badgeId, badgeMetaData);

  return {
    badgeId,
    badgeMetaData,
  };
}

export default main;
