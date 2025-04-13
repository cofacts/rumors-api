import { HTTPError } from 'fets';
import replaceMediaScript from 'scripts/replaceMedia';
import client from 'util/client'; // Moved to top

type ReplaceMediaParams = {
  articleId: string;
  url: string;
  force?: boolean;
};

async function replaceMediaHandler({
  articleId,
  url,
  force = false,
}: ReplaceMediaParams): Promise<{ attachmentHash: string }> {
  try {
    // The original script logs the new hash but doesn't return it.
    // We'll run the script and then fetch the article again to get the updated hash.
    await replaceMediaScript({ articleId, url, force });

    const {
      body: { _source: updatedArticle },
    } = await client.get({ index: 'articles', type: 'doc', id: articleId });

    if (!updatedArticle) {
      // This case might happen if the article was deleted between the script run and the fetch
      throw new HTTPError(
        404,
        `Article ${articleId} not found after update attempt.`
      );
    }

    return { attachmentHash: updatedArticle.attachmentHash };
  } catch (e: any) {
    // Handle known errors from the script or client
    if (e.message.includes('not found')) {
      // Could be article not found initially, or after update attempt
      throw new HTTPError(404, e.message);
    }
    if (e.message.includes('has no corresponding media entry') && !force) {
      // Error from replaceMediaScript if old media entry is missing and force=false
      throw new HTTPError(400, e.message);
    }
    // Re-throw unknown errors after logging
    console.error('[replaceMediaHandler] Unexpected error:', e);
    throw new HTTPError(
      500,
      `Error replacing media for article ${articleId}: ${
        e.message || 'Unknown error'
      }`
    );
  }
}

export default replaceMediaHandler;
