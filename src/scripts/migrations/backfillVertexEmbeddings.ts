/*
  Backfill `embeddings` field for existing articles / replies that were created
  before the hybrid-search rollout (or before their AUDIO/VIDEO duration was
  known). Walks each index via the scroll API filtering for docs without an
  `embeddings` field, generates embeddings via createEmbedding (which caches
  to airesponses), and writes them back via the bulk update API.

  Usage:
    node build/scripts/migrations/backfillVertexEmbeddings.js \
      [--index articles|replies|both] [--limit N] [--concurrency 5] \
      [--batch-size 100] [--from 2026-01-01T00:00:00Z] [--dry-run]

  Notes:
  - IMAGE/AUDIO/VIDEO articles embed from their uploaded media file. Audio/video
    are capped to a single vector by createEmbedding (EMBEDDING_MEDIA_MAX_SEC),
    so no duration source is needed.
  - On 429 / RESOURCE_EXHAUSTED, retries up to 3 times with exponential backoff.
*/

import 'dotenv/config';
import 'util/catchUnhandledRejection';

import yargs from 'yargs';
import { SingleBar } from 'cli-progress';
import { errors } from '@elastic/elasticsearch';

import client from 'util/client';
import getAllDocs from 'util/getAllDocs';
import mediaManager from 'util/mediaManager';
import {
  createEmbedding,
  getReplyEmbeddingCacheId,
  EmbeddingChunk,
} from 'util/embedding';

const SYSTEM_USER = { id: 'embedding-backfill', appId: 'RUMORS_AI' };

// Maps a media articleType to the createEmbedding content type. TEXT is absent
// (it embeds from `text`, not a media file).
const MEDIA_EMBEDDING_TYPE: Record<string, 'image' | 'audio' | 'video'> = {
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video',
};

// Fallback mime type per media articleType when GCS metadata lacks contentType.
const DEFAULT_MEDIA_MIME_TYPE: Record<string, string> = {
  IMAGE: 'image/jpeg',
  AUDIO: 'audio/mpeg',
  VIDEO: 'video/mp4',
};

type IndexChoice = 'articles' | 'replies' | 'both';

export type BackfillOptions = {
  index: IndexChoice;
  limit?: number;
  concurrency: number;
  batchSize: number;
  from?: string;
  dryRun: boolean;
};

type ArticleSource = {
  text?: string;
  articleType?: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO';
  attachmentHash?: string;
};

type ReplySource = {
  text?: string;
  reference?: string | null;
};

type BulkOp =
  | { update: { _index: string; _id: string } }
  | { doc: { embeddings: EmbeddingChunk[] } };

const QUOTA_REGEX = /429|RESOURCE_EXHAUSTED/i;

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  max = 3
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= max - 1 || !QUOTA_REGEX.test(msg)) throw e;
      const delay = 1000 * Math.pow(2, attempt);
      console.warn(
        `[backfill] quota on ${label}, retry ${attempt + 1}/${
          max - 1
        } in ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function processArticle(doc: {
  _id: string;
  _source: ArticleSource;
}): Promise<EmbeddingChunk[] | null> {
  const { _id, _source } = doc;
  const articleType = _source.articleType ?? 'TEXT';

  if (articleType === 'TEXT') {
    if (!_source.text) return null;
    return createEmbedding(
      { id: _id, type: 'text' },
      [{ text: _source.text }],
      SYSTEM_USER
    );
  }

  // IMAGE/AUDIO/VIDEO all embed from the uploaded media file. Audio/video are
  // capped to a single vector by createEmbedding (EMBEDDING_MEDIA_MAX_SEC), so
  // no duration source is needed.
  const mediaType = MEDIA_EMBEDDING_TYPE[articleType];
  if (mediaType) {
    if (!_source.attachmentHash) return null;
    const mediaEntry = await mediaManager.get(_source.attachmentHash);
    if (!mediaEntry) {
      console.warn(
        `[backfill] no media entry for ${articleType} article ${_id}`
      );
      return null;
    }
    const file = mediaEntry.getFile();
    const [metadata] = await file.getMetadata();
    const mimeType =
      metadata.contentType || DEFAULT_MEDIA_MIME_TYPE[articleType];
    // `gs://` URI so Vertex reads the object directly (no download/upload here).
    const fileUri = file.cloudStorageURI.href;
    return createEmbedding(
      { id: mediaEntry.id, type: mediaType },
      [{ mimeType, fileUri }],
      SYSTEM_USER
    );
  }

  return null;
}

async function processReply(doc: {
  _id: string;
  _source: ReplySource;
}): Promise<EmbeddingChunk[] | null> {
  const { _source } = doc;
  if (!_source.text) return null;
  return createEmbedding(
    {
      id: getReplyEmbeddingCacheId(_source.text, _source.reference),
      type: 'text',
    },
    [{ text: `${_source.text}\n${_source.reference || ''}`.trim() }],
    SYSTEM_USER
  );
}

export async function flushBulk(ops: BulkOp[], dryRun: boolean): Promise<void> {
  if (ops.length === 0) return;
  if (dryRun) {
    console.info(
      `[backfill] dry-run: would bulk-update ${ops.length / 2} docs`
    );
    return;
  }
  const result = await client.bulk({ operations: ops });
  if (result.errors) {
    const failed = result.items.filter((it) => it.update?.error);
    console.error(
      `[backfill] bulk failures: ${failed.length}/${result.items.length}`,
      failed.slice(0, 3)
    );
  }
}

async function backfillIndex(
  indexName: 'articles' | 'replies',
  opts: BackfillOptions
): Promise<void> {
  const filterClauses: Array<Record<string, unknown>> = [];
  if (opts.from) {
    filterClauses.push({ range: { updatedAt: { gte: opts.from } } });
  }
  const query = {
    bool: {
      must_not: [{ exists: { field: 'embeddings' } }],
      ...(filterClauses.length ? { filter: filterClauses } : {}),
    },
  };

  const { count: total } = await client.count({ index: indexName, query });
  const target = opts.limit ? Math.min(total, opts.limit) : total;
  console.info(
    `[backfill] ${indexName}: ${target} doc(s) to process (without embeddings: ${total})`
  );

  const bar = new SingleBar({ stopOnComplete: true });
  bar.start(target, 0);

  const ops: BulkOp[] = [];
  // Tracks in-flight tasks so we can throttle the scan loop without growing
  // the array unbounded for very large indices.
  const pending = new Set<Promise<unknown>>();
  let processed = 0;
  let skipped = 0;
  let errored = 0;

  const handler:
    | ((d: {
        _id: string;
        _source: ArticleSource;
      }) => Promise<EmbeddingChunk[] | null>)
    | ((d: {
        _id: string;
        _source: ReplySource;
      }) => Promise<EmbeddingChunk[] | null>) =
    indexName === 'articles' ? processArticle : processReply;

  for await (const doc of getAllDocs<ArticleSource & ReplySource>(
    indexName,
    query
  )) {
    if (opts.limit && processed + pending.size >= opts.limit) break;

    if (pending.size >= opts.concurrency) {
      await Promise.race(pending);
    }

    const task = (async () => {
      try {
        const embeddings = await withRetry(
          () =>
            (handler as (d: typeof doc) => Promise<EmbeddingChunk[] | null>)(
              doc
            ),
          `${indexName}/${doc._id}`
        );
        if (embeddings && embeddings.length > 0) {
          ops.push({ update: { _index: indexName, _id: doc._id } });
          ops.push({ doc: { embeddings } });
        } else {
          skipped++;
        }
      } catch (e) {
        errored++;
        console.error(
          `[backfill] ${indexName}/${doc._id} failed:`,
          e instanceof errors.ResponseError ? e.meta : e
        );
      } finally {
        processed++;
        bar.update(processed);
        if (ops.length >= opts.batchSize * 2) {
          const slice = ops.splice(0, opts.batchSize * 2);
          await flushBulk(slice, opts.dryRun);
        }
      }
    })();
    pending.add(task);
    task.finally(() => pending.delete(task));
  }

  await Promise.all(pending);
  await flushBulk(ops, opts.dryRun);
  bar.stop();
  console.info(
    `[backfill] ${indexName} done. processed=${processed}, skipped=${skipped}, errored=${errored}`
  );
}

export default async function main(opts: BackfillOptions): Promise<void> {
  if (opts.index === 'articles' || opts.index === 'both') {
    await backfillIndex('articles', opts);
  }
  if (opts.index === 'replies' || opts.index === 'both') {
    await backfillIndex('replies', opts);
  }
}

/* istanbul ignore if */
if (require.main === module) {
  const argv = yargs
    .options({
      index: {
        choices: ['articles', 'replies', 'both'] as const,
        default: 'both' as const,
        description: 'Which index to backfill.',
      },
      limit: {
        type: 'number',
        description: 'Max docs to process per index.',
      },
      concurrency: { type: 'number', default: 5 },
      'batch-size': { type: 'number', default: 100 },
      from: {
        type: 'string',
        description: 'Only process docs with updatedAt >= this ISO timestamp.',
      },
      'dry-run': { type: 'boolean', default: false },
    })
    .help('help')
    .parseSync();

  main({
    index: argv.index as IndexChoice,
    limit: argv.limit,
    concurrency: argv.concurrency,
    batchSize: argv['batch-size'],
    from: argv.from,
    dryRun: argv['dry-run'],
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
