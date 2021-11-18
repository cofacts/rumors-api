/**
 * Given userId & block reason, blocks the user and marks all their existing ArticleReply,
 * ArticleReplyFeedback, ReplyRequest, ArticleCategory, ArticleCategoryFeedback as BLOCKED.
 */

import 'dotenv/config';
import yargs from 'yargs';
// import { SingleBar } from 'cli-progress';
import client from 'util/client';

/**
 * Update user to write blockedReason. Throws if user does not exist.
 *
 * @param {string} userId
 * @param {string} blockedReason
 */
async function writeBlockedReasonToUser(userId, blockedReason) {
  try {
    const {
      body: { result: setBlockedReasonResult },
    } = await client.update({
      index: 'users',
      type: 'doc',
      id: userId,
      body: {
        doc: { blockedReason },
      },
    });

    /* istanbul ignore if */
    if (setBlockedReasonResult === 'noop') {
      console.log(
        `Info: user ID ${userId} already has set the same blocked reason.`
      );
    }
  } catch (e) {
    if (e.message === 'document_missing_exception') {
      throw new Error(`User with ID=${userId} does not exist`);
    }

    throw e;
  }
}

/**
 * Convert all article replies with NORMAL status by the user to BLOCKED status.
 *
 * @param {userId} userId
 */
async function processArticleReplies(/* userId */) {}

/**
 * @param {object} args
 */
async function main({ userId, blockedReason } = {}) {
  await writeBlockedReasonToUser(userId, blockedReason);
  await processArticleReplies(userId);
}

export default main;

if (require.main === module) {
  const argv = yargs
    .options({
      userId: {
        alias: 'u',
        description: 'The user ID to block',
        type: 'string',
        demandOption: true,
      },
      blockedReason: {
        alias: 'r',
        description: 'The URL to the annoucement that blocks this user',
        type: 'string',
        demandOption: true,
      },
    })
    .help('help').argv;

  main(argv).catch(console.error);
}
