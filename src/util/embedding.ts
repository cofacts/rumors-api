import { h64 } from 'xxhashjs';
import urlRegex from 'url-regex-safe';

import {
  createAIResponse,
  getAIResponse,
  DEFAULT_MEDIA_MIME_TYPE,
} from 'graphql/util';
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
 * Video is embedded as a single vector capped at this many seconds (audio is
 * not embedded; see EMBEDDED_MEDIA_TYPES).
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
 * How the input is laid out before it is sent to the model. Bump the one that
 * changes; vectors made under another layout are not comparable to new ones.
 *
 * Text is versioned per role (see TEXT_PREFIX), so that changing the query
 * prefix only expires the query vectors, not every doc vector in the indices.
 */
const TEXT_FORMAT: Record<EmbeddingRole, string> = {
  document: 'similarity-prefix-v1',
  query: 'query-similarity-prefix-v1',
};
const MEDIA_FORMAT = 'raw-v1';

/**
 * `gemini-embedding-2` is served **only** from the `global` endpoint — a
 * regional one (`us-central1`, `asia-east1`, …) 404s. Not configurable on
 * purpose; there is no other location to point at.
 */
const EMBEDDING_LOCATION = 'global';

export type EmbeddingTextPart = { text: string };

/**
 * A media part. `fileUri` is the `gs://` URI of a media entry in our own bucket,
 * which Vertex reads directly. Query-side media is uploaded as a media entry
 * first (see `uploadMediaAndWait`).
 */
export type EmbeddingMediaPart = { mimeType: string; fileUri: string };
export type EmbeddingPart = EmbeddingTextPart | EmbeddingMediaPart;

export type EmbeddingChunk = {
  vector: number[];
  startOffsetSec?: number;
  endOffsetSec?: number;
};

/**
 * What the embedded text is used as. `gemini-embedding-2` ignores the
 * `taskType` config (the vectors come out bit-identical); the task goes in a
 * text prefix instead.
 * https://ai.google.dev/gemini-api/docs/embeddings
 */
export type EmbeddingRole = 'document' | 'query';

/**
 * Both sides take the symmetric `sentence similarity` task rather than the
 * asymmetric `search result` one (`title: none | text: ` for documents). Our
 * queries are mostly a forwarded message or a short claim, the same kind of
 * text as the articles. In a local eval over 233k text articles, it tied on
 * whole forwarded messages and found more for short typed queries (hybrid
 * Hit@10 60.7% vs 55.7%). The cost is a lower image-to-text similarity, which
 * barely passes the 0.7 threshold either way.
 */
const TEXT_PREFIX: Record<EmbeddingRole, string> = {
  document: 'task: sentence similarity | query: ',
  query: 'task: sentence similarity | query: ',
};

export type CreateEmbeddingQueryInfo = {
  /** Used as `docId` for the airesponses cache record. */
  id: string;
  /**
   * text/image -> embed the content as-is. video -> a single vector over the
   * first EMBEDDING_MEDIA_MAX_SEC seconds of the file (see the constant).
   * Audio is not embedded (see EMBEDDED_MEDIA_TYPES).
   */
  type: 'text' | EmbeddedMediaType;
};

/**
 * Media types that are embedded. Audio is left out on purpose
 * (cofacts/rumors-api#418): Vertex rejects audio longer than about 3 minutes,
 * and embedding the transcript instead would go stale once the transcript is
 * edited, as nothing re-embeds it then. Audio is still found by its
 * transcript through full-text search.
 */
export const EMBEDDED_MEDIA_TYPES = ['image', 'video'] as const;
export type EmbeddedMediaType = (typeof EMBEDDED_MEDIA_TYPES)[number];

export function isEmbeddedMediaType(type: unknown): type is EmbeddedMediaType {
  return (EMBEDDED_MEDIA_TYPES as readonly unknown[]).includes(type);
}

export type CreateEmbeddingOptions = {
  /**
   * Defaults to `document` (write path). Pass `query` for search queries.
   * Only text is prefixed; media is embedded as-is on both sides.
   */
  role?: EmbeddingRole;
};

type User = { id: string; appId: string };

/** The part of a media-manager MediaEntry that embedding reads. */
type EmbeddableMediaEntry = {
  getFile: () => {
    getMetadata: () => Promise<[{ contentType?: string }, ...unknown[]]>;
    cloudStorageURI: { href: string };
  };
};

function isMediaPart(part: EmbeddingPart): part is EmbeddingMediaPart {
  return 'fileUri' in part;
}

/**
 * Identifies the model, dimensions and input layout a vector is made with.
 * Part of the cache key (see {@link getEmbeddingCacheDocId}), so that a record
 * made under other settings is not served as if it were current.
 */
export function getEmbeddingVersion(
  type: CreateEmbeddingQueryInfo['type'],
  role: EmbeddingRole = 'document'
): string {
  return [
    EMBEDDING_MODEL,
    EMBEDDING_DIMS,
    type === 'text' ? TEXT_FORMAT[role] : MEDIA_FORMAT,
  ].join('/');
}

/**
 * The `docId` of the airesponses cache record: the content id plus the
 * settings version, so that the same content under the same settings maps to
 * one record. Keeping the version in the key (rather than checking it after
 * reading) lets concurrent callers wait on a LOADING record of the current
 * settings, instead of each calling Vertex AI while an older SUCCESS exists.
 */
export function getEmbeddingCacheDocId(
  queryInfo: CreateEmbeddingQueryInfo,
  role: EmbeddingRole = 'document'
): string {
  return `${queryInfo.id}@${getEmbeddingVersion(queryInfo.type, role)}`;
}

/**
 * Read the embedding chunks made before for the given content, if they are
 * made with the current settings (see {@link getEmbeddingCacheDocId}).
 */
export async function getCachedEmbedding(
  queryInfo: CreateEmbeddingQueryInfo,
  options: CreateEmbeddingOptions = {}
): Promise<EmbeddingChunk[] | null> {
  const cached = await getAIResponse({
    type: 'EMBEDDING',
    docId: getEmbeddingCacheDocId(queryInfo, options.role),
  });

  if (
    cached &&
    cached.status === 'SUCCESS' &&
    Array.isArray(cached.embeddings) &&
    cached.embeddings.length > 0
  ) {
    return cached.embeddings as EmbeddingChunk[];
  }

  return null;
}

/**
 * Generate (or load from cache) embedding chunks for the given content.
 *
 * Cache layer: airesponses doc keyed by type=EMBEDDING and a docId made of
 * queryInfo.id and the current settings (see {@link getEmbeddingCacheDocId}).
 * Same get-or-create + LOADING-wait semantics as createTranscript, so concurrent
 * callers for the same docId share work.
 *
 * A cache hit is returned to anyone. Creating one takes a user: without it this
 * rejects before calling Vertex AI or writing to airesponses.
 */
export async function createEmbedding(
  queryInfo: CreateEmbeddingQueryInfo,
  parts: EmbeddingPart[],
  user: User,
  options: CreateEmbeddingOptions = {}
): Promise<EmbeddingChunk[]> {
  // The type rules out audio, but JS callers pass media types straight from
  // media manager. Refuse before reading or writing the cache, and before any
  // Vertex call, so a type we decided not to embed costs nothing.
  if (queryInfo.type !== 'text' && !isEmbeddedMediaType(queryInfo.type)) {
    throw new Error(`[createEmbedding] ${queryInfo.type} is not embedded`);
  }

  const cached = await getCachedEmbedding(queryInfo, options);
  if (cached) return cached;

  const { update } = createAIResponse({
    user,
    type: 'EMBEDDING',
    docId: getEmbeddingCacheDocId(queryInfo, options.role),
    // For the record; the version is already in docId.
    request: getEmbeddingVersion(queryInfo.type, options.role),
  });

  try {
    const genAI = await createGenAI(EMBEDDING_LOCATION);
    const textPrefix =
      queryInfo.type === 'text' ? TEXT_PREFIX[options.role ?? 'document'] : '';

    // Video is embedded as a single vector capped at the first
    // EMBEDDING_MEDIA_MAX_SEC seconds via an explicit `endOffset` — Gemini can't
    // embed longer media in one call, and this avoids needing a duration probe.
    // Text/image embed the whole content as-is.
    const isTimedMedia = queryInfo.type === 'video';

    const partsForCall = parts.map((p) => {
      if (!isMediaPart(p)) return { text: textPrefix + p.text };

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

/**
 * Embed a media that is in media manager, under its content hash, so that the
 * vector is shared by every place that sees the same media (search, article
 * creation, backfill).
 *
 * Whether the file is there is media manager's business: the caller hands over
 * a media entry whose file is readable, and this only turns it into vectors
 * (cached like any other embedding, see {@link createEmbedding}).
 *
 * @param queryInfo - type and media entry ID of the media
 * @param mediaEntry - the image or video to embed (see EMBEDDED_MEDIA_TYPES)
 * @param user - the user who requested the embedding
 */
export async function createMediaEmbedding(
  queryInfo: { id: string; type: EmbeddedMediaType },
  mediaEntry: EmbeddableMediaEntry,
  user: User
): Promise<EmbeddingChunk[]> {
  // Callers check isEmbeddedMediaType first; this keeps a JS caller that
  // forgets from reading the file of a type we decided not to embed.
  // (createEmbedding refuses it too.)
  if (!isEmbeddedMediaType(queryInfo.type)) {
    throw new Error(`[createMediaEmbedding] ${queryInfo.type} is not embedded`);
  }

  const file = mediaEntry.getFile();
  const [metadata] = await file.getMetadata();

  return createEmbedding(
    queryInfo,
    [
      {
        mimeType:
          metadata.contentType || DEFAULT_MEDIA_MIME_TYPE[queryInfo.type],
        // Vertex reads the object by its own `gs://` URI.
        fileUri: file.cloudStorageURI.href,
      },
    ],
    user
  );
}

/**
 * Below this many letters and digits left after removing URLs, a text is
 * treated as URL-only. Covers a bare link plus a word or two such as "轉傳" or
 * "這是真的嗎".
 */
const URL_ONLY_MAX_REMAINING_CHARS = 10;

/**
 * Whether the text is (almost) nothing but URLs.
 *
 * The embedding of such a text is the embedding of the URL string: links of the
 * same shape (YouTube, FB reels) score 0.98+ against each other whatever they
 * link to, so kNN on it finds unrelated links. Searches skip kNN for these and
 * rely on BM25, which also matches the hyperlinks' titles and summaries.
 * Ref: the 2026-10-08 staging report of #388 (observation 2).
 */
export function isUrlOnlyText(text: string | null | undefined): boolean {
  if (!text) return false;
  const urls = text.match(urlRegex({ strict: true })) || [];
  if (urls.length === 0) return false;

  const remaining = urls.reduce((t, u) => t.split(u).join(' '), text);
  const meaningful = remaining.match(/[\p{L}\p{N}]/gu) || [];
  return meaningful.length < URL_ONLY_MAX_REMAINING_CHARS;
}
