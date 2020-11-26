// eslint-disable no-console
/*
  A script that deletes an article reply
*/

import { updateArticleReplyStatus } from 'graphql/mutations/UpdateArticleReplyStatus';
import yargs from 'yargs';

async function main({ articleId, replyId, userId } = {}) {
  if (!articleId || !replyId || !userId)
    throw new Error('Please provide all of articleId, replyId and userId');

  return updateArticleReplyStatus({
    articleId,
    replyId,
    userId,
    appId: 'WEBSITE',
    status: 'DELETED',
  });
}

export default main;

if (require.main === module) {
  const argv = yargs
    .options({
      userId: {
        alias: 'u',
        description: 'User ID of the reply.',
        type: 'string',
        demandOption: true,
      },
      articleId: {
        alias: 'a',
        description: 'Article ID of the articleReply',
        type: 'string',
        demandOption: true,
      },
      replyId: {
        alias: 'r',
        description: 'Reply ID of the articleReply',
        type: 'string',
        demandOption: true,
      },
    })
    .help('help').argv;

  main(argv).catch(console.error);
}
