import { h64 } from 'xxhashjs';

import { createAIResponse, getAIResponse } from 'graphql/util';
import { createGenAI } from 'util/genai';

const xxhash64 = h64();

/**
 * Cache key for a reply doc's embedding. Hash of (text, reference) so
 * resubmissions of the same content hit the airesponses cache. Prefixed to
 * avoid collisions with article doc IDs (= text hashes without prefix).
 */
export function getReplyEmbeddingCacheId(
  text: string,
  reference?: string | null
): string {
  return (
    'reply:' +
    xxhash64
      .update(`${text}\n${reference || ''}`)
      .digest()
      .toString(36)
  );
}

/**
 * Cache key for a search-query embedding (read path). Different namespace
 * from doc-side cache keys so query-time embeddings don't collide.
 */
export function getQueryEmbeddingCacheId(text: string): string {
  return 'query-text:' + xxhash64.update(text).digest().toString(36);
}

/**
 * Audio/video are embedded as a single vector capped at this many seconds.
 * Gemini Embedding 2 caps media input at ~80s (audio hard limit; video ~81s
 * once the audio track is extracted) within its 8192-token window, silently
 * truncating the rest. We pass this as an explicit `endOffset` so the bound is
 * intentional and no duration probe is needed — content past this point is not
 * represented in the vector (the full text is still covered by transcript BM25).
 */
export const EMBEDDING_MEDIA_MAX_SEC = 80;

/**
 * Output dimensionality. Uses Matryoshka Representation Learning (MRL) to
 * truncate the model's native 3072 dims — trades a small amount of retrieval
 * quality for substantially smaller HNSW graphs and lower per-doc storage.
 */
export const EMBEDDING_DIMS = 768;

const EMBEDDING_MODEL = 'gemini-embedding-2';

/**
 * `gemini-embedding-2` is served **only** from the `global` endpoint — a
 * regional one (`us-central1`, `asia-east1`, …) 404s. Not configurable on
 * purpose; there is no other location to point at.
 */
const EMBEDDING_LOCATION = 'global';

export type EmbeddingTextPart = { text: string };

/**
 * A media part. `fileUri` is anything Vertex can read on its own: a `gs://` URI
 * (doc-side, our own bucket) or a publicly-readable https URL (query-side, e.g.
 * the LINE bot's getcontent URL). Vertex fetches it directly — we never move the
 * bytes ourselves.
 */
export type EmbeddingMediaPart = { mimeType: string; fileUri: string };
export type EmbeddingPart = EmbeddingTextPart | EmbeddingMediaPart;

export type EmbeddingChunk = {
  vector: number[];
  startOffsetSec?: number;
  endOffsetSec?: number;
};

type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export type CreateEmbeddingQueryInfo = {
  /** Used as `docId` for the airesponses cache record. */
  id: string;
  /**
   * text/image -> embed the content as-is. audio/video -> a single vector over
   * the first EMBEDDING_MEDIA_MAX_SEC seconds of the file (see the constant).
   */
  type: 'text' | 'image' | 'audio' | 'video';
};

export type CreateEmbeddingOptions = {
  /** Defaults to RETRIEVAL_DOCUMENT (write path). Pass RETRIEVAL_QUERY for search queries. */
  taskType?: EmbeddingTaskType;
};

type User = { id: string; appId: string };

function isMediaPart(part: EmbeddingPart): part is EmbeddingMediaPart {
  return 'fileUri' in part;
}

/**
 * Generate (or load from cache) embedding chunks for the given content.
 *
 * Cache layer: airesponses doc keyed by (type=EMBEDDING, docId=queryInfo.id).
 * Same get-or-create + LOADING-wait semantics as createTranscript, so concurrent
 * callers for the same docId share work.
 */
export async function createEmbedding(
  queryInfo: CreateEmbeddingQueryInfo,
  parts: EmbeddingPart[],
  user?: User | null,
  options: CreateEmbeddingOptions = {}
): Promise<EmbeddingChunk[]> {
  const cached = await getAIResponse({
    type: 'EMBEDDING',
    docId: queryInfo.id,
  });
  if (
    cached &&
    cached.status === 'SUCCESS' &&
    Array.isArray(cached.embeddings) &&
    cached.embeddings.length > 0
  ) {
    return cached.embeddings as EmbeddingChunk[];
  }

  const { update } = createAIResponse({
    user,
    type: 'EMBEDDING',
    docId: queryInfo.id,
  });

  try {
    const genAI = await createGenAI(EMBEDDING_LOCATION);
    const taskType: EmbeddingTaskType =
      options.taskType ?? 'RETRIEVAL_DOCUMENT';

    // Audio/video are embedded as a single vector capped at the first
    // EMBEDDING_MEDIA_MAX_SEC seconds via an explicit `endOffset` — Gemini can't
    // embed longer media in one call, and this avoids needing a duration probe.
    // Text/image embed the whole content as-is.
    const isTimedMedia =
      queryInfo.type === 'audio' || queryInfo.type === 'video';

    const partsForCall = parts.map((p) => {
      if (!isMediaPart(p)) return { text: p.text };

      return {
        fileData: { fileUri: p.fileUri, mimeType: p.mimeType },
        ...(isTimedMedia
          ? {
              videoMetadata: {
                startOffset: '0s',
                endOffset: `${EMBEDDING_MEDIA_MAX_SEC}s`,
              },
            }
          : {}),
      };
    });

    // `gemini-embedding-2` only exposes `:embedContent` — the legacy
    // `:predict` endpoint (what `PredictionServiceClient` and older
    // text-embedding models use) is not served for this model, and the model
    // card doesn't call that out. `models.embedContent` maps to the right one.
    const response = await genAI.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [{ role: 'user', parts: partsForCall }],
      config: {
        outputDimensionality: EMBEDDING_DIMS,
        taskType,
      },
    });

    const vector = response.embeddings?.[0]?.values;
    if (!vector || vector.length === 0) {
      throw new Error('[createEmbedding] Empty vector returned');
    }
    const chunks: EmbeddingChunk[] = [{ vector }];

    await update({ status: 'SUCCESS', embeddings: chunks });
    return chunks;
  } catch (e) {
    console.error('[createEmbedding]', e);
    await update({
      status: 'ERROR',
      text: e instanceof Error ? e.toString() : String(e),
    });
    throw e;
  }
}
