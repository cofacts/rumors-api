import { HTTPError } from 'fets';
import genAIReplyScript from 'scripts/genAIReply';
type GenAIReplyParams = {
  articleId: string;
  temperature?: number;
};

/**
 * Calls the genAIReply script to generate a new AI reply for the specified article.
 * Returns { success: true } if the script runs without throwing an error.
 */
async function genAIReplyHandler({
  articleId,
  temperature,
}: GenAIReplyParams): Promise<{ success: boolean }> {
  try {
    // The script handles fetching the article and user creation internally.
    // It returns the AI response doc or null if content is insufficient.
    // We only care if it throws an error or not.
    await genAIReplyScript({ articleId, temperature });

    // If the script completes without error, consider it a success.
    return { success: true };
  } catch (e: any) {
    // Handle known errors, e.g., article not found by the script
    if (e.message.includes('Please specify articleId')) {
      // This specific error is unlikely if articleId is required by schema, but good practice
      throw new HTTPError(400, e.message);
    }
    if (
      e.message.includes('document_missing_exception') ||
      e.message.includes('not found')
    ) {
      // Error from client.get inside the script if article doesn't exist
      throw new HTTPError(404, `Article with ID=${articleId} not found.`);
    }

    // Log and re-throw unknown errors
    console.error('[genAIReplyHandler] Unexpected error:', e);
    throw new HTTPError(
      500,
      `Error generating AI reply for article ${articleId}: ${
        e.message || 'Unknown error'
      }`
    );
  }
}

export default genAIReplyHandler;
