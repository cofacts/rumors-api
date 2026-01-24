import client from 'util/client';
import mediaManager from 'util/mediaManager';
import { createTranscript, getAIResponse } from 'graphql/util';
import { writeAITranscript } from 'graphql/mutations/CreateMediaArticle';
import type { Article } from 'rumors-db/schema/articles';

const SYSTEM_USER = {
  id: 'admin-script',
  appId: 'RUMORS_ADMIN',
};

type GenAITranscriptParams = {
  articleIds: string[];
  force?: boolean;
};

type GenAITranscriptResult = {
  id: string;
  status: 'SUCCESS' | 'ERROR' | 'SKIPPED';
  reason?: string;
};

async function genAITranscript({
  articleIds,
  force = false,
}: GenAITranscriptParams) {
  if (!articleIds || articleIds.length === 0) {
    return { count: 0, results: [] };
  }

  // Fetch articles
  const {
    body: { docs },
  } = await client.mget({
    index: 'articles',
    type: 'doc',
    body: {
      ids: articleIds,
    },
    _source: ['text', 'attachmentHash', 'articleType'],
  });

  const results: GenAITranscriptResult[] = await Promise.all(
    docs.map(
      async (doc: {
        _id: string;
        found: boolean;
        _source: Article;
      }): Promise<GenAITranscriptResult> => {
        const articleId = doc._id;

        if (!doc.found) {
          return {
            id: articleId,
            status: 'SKIPPED',
            reason: 'Article not found',
          };
        }

        const article: Article = doc._source;

        if (!article.attachmentHash) {
          return {
            id: articleId,
            status: 'SKIPPED',
            reason: 'Not a media article',
          };
        }

        if (!force) {
          // If article already has text, skip
          if (article.text && article.text.trim().length > 0) {
            return {
              id: articleId,
              status: 'SKIPPED',
              reason: 'Article already has text',
            };
          }

          // If article has successful AI transcript, skip
          const existingResponse = await getAIResponse({
            type: 'TRANSCRIPT',
            docId: article.attachmentHash,
          });

          if (existingResponse && existingResponse.status === 'SUCCESS') {
            return {
              id: articleId,
              status: 'SKIPPED',
              reason: 'Existing AI transcript found',
            };
          }
        }

        try {
          const mediaEntry = await mediaManager.get(article.attachmentHash);
          if (!mediaEntry) {
            return {
              id: articleId,
              status: 'SKIPPED',
              reason: 'Media entry not found',
            };
          }

          const transcriptResponse = await createTranscript(
            {
              id: article.attachmentHash,
              type: article.articleType.toLowerCase(),
            },
            mediaEntry,
            SYSTEM_USER
          );

          if (transcriptResponse.status === 'SUCCESS') {
            if (transcriptResponse.text) {
              await writeAITranscript(articleId, transcriptResponse.text);
            }
            return { id: articleId, status: 'SUCCESS' };
          } else {
            return {
              id: articleId,
              status: 'ERROR',
              reason: transcriptResponse.text || 'Transcription failed',
            };
          }
        } catch (e) {
          console.error(`[genAITranscript] Error processing ${articleId}:`, e);
          return {
            id: articleId,
            status: 'ERROR',
            reason: e instanceof Error ? e.message : String(e),
          };
        }
      }
    )
  );

  const successCount = results.filter((r) => r.status === 'SUCCESS').length;

  return {
    count: successCount,
    results,
  };
}

export default genAITranscript;
