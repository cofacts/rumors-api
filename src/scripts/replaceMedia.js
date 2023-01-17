/**
 * Given articleId and URL, replace the media with the content the URL points to.
 */

import 'dotenv/config';
import yargs from 'yargs';
import client from 'util/client';
import mediaManager from 'util/mediaManager';
import { uploadMedia } from 'graphql/mutations/CreateMediaArticle';

/**
 * @param {object} args
 */
async function replaceMedia({ articleId, url } = {}) {
  const {
    body: { _source: article },
  } = await client.get({ index: 'articles', type: 'doc', id: articleId });

  /* istanbul ignore if */
  if (!article) throw new Error(`Article ${articleId} is not found`);

  const oldMediaEntry = await mediaManager.get(article.attachmentHash);

  /* istanbul ignore if */
  if (!oldMediaEntry)
    throw new Error(
      `Article ${articleId}'s attachment hash "${
        article.attachmentHash
      }" has no corresponding media entry`
    );

  const newMediaEntry = await uploadMedia({
    mediaUrl: url,
    articleType: article.articleType,
  });

  console.info(
    `Article ${articleId} attachment hash: ${oldMediaEntry.id} --> ${
      newMediaEntry.id
    }`
  );
  await client.update({
    index: 'articles',
    type: 'doc',
    id: articleId,
    body: {
      doc: {
        attachmentHash: newMediaEntry.id,
      },
    },
  });

  return Promise.all(
    oldMediaEntry.variants.map(variant =>
      oldMediaEntry
        .getFile(variant)
        .delete()
        .then(() => {
          console.info(`Old media entry variant=${variant} deleted`);
        })
    )
  );
}

export default replaceMedia;

/* istanbul ignore if */
if (require.main === module) {
  const argv = yargs
    .options({
      articleId: {
        alias: 'a',
        description: 'The article ID',
        type: 'string',
        demandOption: true,
      },
      url: {
        alias: 'u',
        description: 'The URL to the content to replace',
        type: 'string',
        demandOption: true,
      },
    })
    .help('help').argv;

  replaceMedia(argv).catch(console.error);
}
