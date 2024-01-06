// eslint-disable no-console
/*
  A script that deletes an article reply
*/

import client from 'util/client';
import { updateArticleReplyStatus } from 'graphql/mutations/UpdateArticleReplyStatus';
import yargs from 'yargs';

async function main({ articleId, replyId, userId, replacedText } = {}) {
  if (!articleId || !replyId || !userId)
    throw new Error('Please provide all of articleId, replyId and userId');

  if (replacedText) {
    const replyBody = {
      text: replacedText,
    };

    await client.update({
      index: 'replies',
      type: 'doc',
      body: replyBody,
    });
  }
  return updateArticleReplyStatus({
    articleId,
    replyId,
    userId,
    appId: 'WEBSITE',
    status: 'DELETED',
  });
}

export default main;

/* istanbul ignore if */
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
      replacedText: {
        alias: 'rt',
        description: 'Replaced text for spammer reply',
        type: 'string',
        demandOption: false,
      },
    })
    .help('help').argv;

  main(argv).catch(console.error);
}
