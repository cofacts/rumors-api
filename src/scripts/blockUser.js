import 'dotenv/config';
import yargs from 'yargs';
// import { SingleBar } from 'cli-progress';
import client from 'util/client';

/**
 * Given userId & block reason, blocks the user and marks all their existing ArticleReply,
 * ArticleReplyFeedback, ReplyRequest, ArticleCategory, ArticleCategoryFeedback as BLOCKED.
 *
 * @param {object} args
 */
async function main({ userId, blockedReason } = {}) {
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
    throw new Error(`Cannot set user ${userId}'s blocked reason'`);
  }
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
