// eslint-disable no-console
/*
  A script that generates AI reply for an article
*/

import yargs from 'yargs';

import client from 'util/client';
import { createNewAIReply } from 'graphql/mutations/CreateAIReply';
import { createOrUpdateUser } from 'util/user';

// The identify we use to generate AI reply
const GENERATOR_APP_ID = 'RUMORS_AI';
export const GENERATOR_USER_ID = 'ai-reply-reviewer';

async function main({ articleId, temperature } = {}) {
  if (!articleId) throw new Error('Please specify articleId');

  const {
    body: { _source: article },
  } = await client.get({
    index: 'articles',
    type: 'doc',
    id: articleId,
  });

  const { user } = await createOrUpdateUser({
    userId: GENERATOR_USER_ID,
    appId: GENERATOR_APP_ID,
  });

  return createNewAIReply({
    article: {
      ...article,
      id: articleId,
    },
    user,
    completionOptions: {
      temperature,
    },
  });
}

export default main;

/* istanbul ignore if */
if (require.main === module) {
  const argv = yargs
    .options({
      articleId: {
        alias: 'a',
        description: 'Article ID to generate AI reply',
        type: 'string',
        demandOption: true,
      },
      temperature: {
        description: 'Open AI chat completion param',
        type: 'number',
        demandOption: false,
      },
    })
    .help('help').argv;

  main(argv).catch(console.error);
}
