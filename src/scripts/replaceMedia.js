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
async function replaceMedia({ articleId, url, force = false } = {}) {
  const {
    body: { _source: article },
  } = await client.get({ index: 'articles', type: 'doc', id: articleId });

  /* istanbul ignore if */
  if (!article) throw new Error(`Article ${articleId} is not found`);

  const oldMediaEntry = await mediaManager.get(article.attachmentHash);

  /* istanbul ignore if */
  if (!force && !oldMediaEntry)
    throw new Error(
      `Article ${articleId}'s attachment hash "${
        article.attachmentHash
      }" has no corresponding media entry`
    );

  // Delete old media first, so that new one can be written without worring overwriting existing files
  //
  if (oldMediaEntry) {
    await Promise.all(
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

  const newMediaEntry = await uploadMedia({
    mediaUrl: url,
    articleType: article.articleType,
  });

  console.info(
    `Article ${articleId} attachment hash: ${oldMediaEntry?.id ??
      article.attachmentHash} --> ${newMediaEntry.id}`
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
      force: {
        alias: 'f',
        description: 'Skip old media entry check',
        type: 'boolean',
      },
    })
    .help('help').argv;

  replaceMedia(argv).catch(console.error);
}
