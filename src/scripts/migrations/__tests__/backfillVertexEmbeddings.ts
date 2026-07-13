import { jest, describe, beforeEach, it, expect } from '@jest/globals';

const mockBulk = jest
  .fn<
    (params: { operations: object[] }) => Promise<{
      errors: boolean;
      items: object[];
    }>
  >()
  .mockResolvedValue({ errors: false, items: [] });
const mockCount = jest
  .fn<(params: object) => Promise<{ count: number }>>()
  .mockResolvedValue({ count: 0 });

const mockCreateEmbedding = jest.fn() as jest.Mock<
  (...args: unknown[]) => Promise<unknown>
>;
const mockGetAllDocs = jest.fn() as jest.Mock<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (...args: unknown[]) => AsyncGenerator<any>
>;
const mockMediaManagerGet = jest.fn() as jest.Mock<
  (id: string) => Promise<unknown>
>;

// Wrapped through indirection: jest.mock factories are hoisted above the
// `const mock*` declarations, so referencing them directly inside the factory
// would throw a TDZ ReferenceError. Calling them at request time (when the
// factory's returned object is actually used) is safe.
jest.mock('util/client', () => ({
  __esModule: true,
  default: {
    bulk: (...args: unknown[]) => mockBulk(...(args as [never])),
    count: (...args: unknown[]) => mockCount(...(args as [never])),
  },
}));

jest.mock('util/getAllDocs', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockGetAllDocs(...args),
}));

jest.mock('util/embedding', () => ({
  createEmbedding: (...args: unknown[]) => mockCreateEmbedding(...args),
  getReplyEmbeddingCacheId: (text: string, ref?: string | null) =>
    `reply:${text}:${ref ?? ''}`,
  getQueryEmbeddingCacheId: (text: string) => `query-text:${text}`,
}));

jest.mock('util/mediaManager', () => ({
  __esModule: true,
  default: { get: (...args: [string]) => mockMediaManagerGet(...args) },
}));

// cli-progress writes to stdout — silence it under jest to keep test output clean.
jest.mock('cli-progress', () => ({
  SingleBar: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    update: jest.fn(),
    stop: jest.fn(),
  })),
}));

import main from '../backfillVertexEmbeddings';

async function* docsGen<T>(docs: T[]): AsyncGenerator<T> {
  for (const d of docs) yield d;
}

describe('backfillVertexEmbeddings', () => {
  beforeEach(() => {
    mockBulk.mockClear();
    mockCount.mockReset();
    mockCreateEmbedding.mockReset();
    mockGetAllDocs.mockReset();
    mockMediaManagerGet.mockReset();

    // Default: count returns 0 unless overridden — keeps progress bar happy.
    mockCount.mockResolvedValue({ count: 0 });
  });

  it('builds correct bulk update ops for TEXT articles', async () => {
    mockCount.mockResolvedValueOnce({ count: 2 });
    mockCount.mockResolvedValueOnce({ count: 0 });
    mockGetAllDocs
      .mockReturnValueOnce(
        docsGen([
          { _id: 'art1', _source: { text: 'foo', articleType: 'TEXT' } },
          { _id: 'art2', _source: { text: 'bar' } }, // articleType missing → defaults to TEXT
        ])
      )
      .mockReturnValueOnce(docsGen([])); // replies pass yields nothing
    mockCreateEmbedding.mockResolvedValue([{ vector: [0.1, 0.2, 0.3] }]);

    await main({
      index: 'both',
      concurrency: 1,
      batchSize: 100,
      dryRun: false,
    });

    expect(mockBulk).toHaveBeenCalledTimes(1);
    const ops = mockBulk.mock.calls[0][0].operations;
    expect(ops).toEqual([
      { update: { _index: 'articles', _id: 'art1' } },
      { doc: { embeddings: [{ vector: [0.1, 0.2, 0.3] }] } },
      { update: { _index: 'articles', _id: 'art2' } },
      { doc: { embeddings: [{ vector: [0.1, 0.2, 0.3] }] } },
    ]);

    expect(mockCreateEmbedding).toHaveBeenCalledTimes(2);
    expect(mockCreateEmbedding.mock.calls[0][0]).toEqual({
      id: 'art1',
      type: 'text',
    });
    expect(mockCreateEmbedding.mock.calls[1][0]).toEqual({
      id: 'art2',
      type: 'text',
    });
  });

  it('embeds AUDIO/VIDEO articles via the media entry file URI', async () => {
    mockCount.mockResolvedValueOnce({ count: 2 });
    mockGetAllDocs.mockReturnValueOnce(
      docsGen([
        {
          _id: 'aud1',
          _source: { articleType: 'AUDIO', attachmentHash: 'ha' },
        },
        {
          _id: 'vid1',
          _source: { articleType: 'VIDEO', attachmentHash: 'hv' },
        },
      ])
    );
    mockMediaManagerGet.mockImplementation(async (hash: string) => ({
      id: hash,
      getFile: () => ({
        cloudStorageURI: { href: `gs://bucket/${hash}` },
        // No contentType → falls back to the per-type default mime.
        getMetadata: async () => [{}],
      }),
    }));
    mockCreateEmbedding.mockResolvedValue([{ vector: [0.3] }]);

    await main({
      index: 'articles',
      concurrency: 1,
      batchSize: 100,
      dryRun: false,
    });

    const callsByType = Object.fromEntries(
      mockCreateEmbedding.mock.calls.map((call) => {
        const info = call[0] as { id: string; type: string };
        const parts = call[1] as Array<{ mimeType: string; fileUri: string }>;
        return [info.type, { info, part: parts[0] }];
      })
    );

    expect(callsByType.audio.info).toEqual({ id: 'ha', type: 'audio' });
    expect(callsByType.audio.part.mimeType).toBe('audio/mpeg');
    expect(callsByType.audio.part.fileUri).toBe('gs://bucket/ha');
    expect(callsByType.video.info).toEqual({ id: 'hv', type: 'video' });
    expect(callsByType.video.part.mimeType).toBe('video/mp4');
    expect(callsByType.video.part.fileUri).toBe('gs://bucket/hv');
    expect(mockBulk).toHaveBeenCalledTimes(1);
  });

  it('uses reply cache key for replies', async () => {
    mockCount.mockResolvedValueOnce({ count: 1 });
    mockGetAllDocs.mockReturnValueOnce(
      docsGen([
        { _id: 'rep1', _source: { text: 'r-text', reference: 'http://x' } },
      ])
    );
    mockCreateEmbedding.mockResolvedValue([{ vector: [0.4, 0.5] }]);

    await main({
      index: 'replies',
      concurrency: 1,
      batchSize: 100,
      dryRun: false,
    });

    expect(mockCreateEmbedding).toHaveBeenCalledTimes(1);
    expect((mockCreateEmbedding.mock.calls[0][0] as { id: string }).id).toBe(
      'reply:r-text:http://x'
    );

    const ops = mockBulk.mock.calls[0][0].operations;
    expect(ops[0]).toEqual({ update: { _index: 'replies', _id: 'rep1' } });
    expect(ops[1]).toEqual({ doc: { embeddings: [{ vector: [0.4, 0.5] }] } });
  });

  it('dry-run does not call bulk', async () => {
    mockCount.mockResolvedValueOnce({ count: 1 });
    mockGetAllDocs.mockReturnValueOnce(
      docsGen([{ _id: 'art1', _source: { text: 'foo' } }])
    );
    mockCreateEmbedding.mockResolvedValue([{ vector: [0.1] }]);

    await main({
      index: 'articles',
      concurrency: 1,
      batchSize: 100,
      dryRun: true,
    });

    expect(mockCreateEmbedding).toHaveBeenCalled();
    expect(mockBulk).not.toHaveBeenCalled();
  });

  it('skips IMAGE articles when media entry is missing', async () => {
    mockCount.mockResolvedValueOnce({ count: 1 });
    mockGetAllDocs.mockReturnValueOnce(
      docsGen([
        {
          _id: 'img1',
          _source: { articleType: 'IMAGE', attachmentHash: 'gone' },
        },
      ])
    );
    mockMediaManagerGet.mockResolvedValue(null);

    await main({
      index: 'articles',
      concurrency: 1,
      batchSize: 100,
      dryRun: false,
    });

    expect(mockMediaManagerGet).toHaveBeenCalledWith('gone');
    expect(mockCreateEmbedding).not.toHaveBeenCalled();
    expect(mockBulk).not.toHaveBeenCalled();
  });

  it('embeds IMAGE articles via the media entry file URI', async () => {
    mockCount.mockResolvedValueOnce({ count: 1 });
    mockGetAllDocs.mockReturnValueOnce(
      docsGen([
        {
          _id: 'img1',
          _source: { articleType: 'IMAGE', attachmentHash: 'h1' },
        },
      ])
    );
    mockMediaManagerGet.mockResolvedValue({
      id: 'h1',
      getFile: () => ({
        cloudStorageURI: { href: 'gs://bucket/h1' },
        getMetadata: async () => [{ contentType: 'image/png' }],
      }),
    });
    mockCreateEmbedding.mockResolvedValue([{ vector: [0.9] }]);

    await main({
      index: 'articles',
      concurrency: 1,
      batchSize: 100,
      dryRun: false,
    });

    expect(mockCreateEmbedding.mock.calls[0][0]).toEqual({
      id: 'h1',
      type: 'image',
    });
    const imagePart = (
      mockCreateEmbedding.mock.calls[0][1] as Array<{
        mimeType: string;
        fileUri: string;
      }>
    )[0];
    expect(imagePart.mimeType).toBe('image/png');
    expect(imagePart.fileUri).toBe('gs://bucket/h1');
    expect(mockBulk).toHaveBeenCalledTimes(1);
  });

  it('applies the --from range filter and logs bulk failures', async () => {
    mockCount.mockResolvedValueOnce({ count: 1 });
    mockGetAllDocs.mockReturnValueOnce(
      docsGen([{ _id: 'art1', _source: { text: 'foo' } }])
    );
    mockCreateEmbedding.mockResolvedValue([{ vector: [0.1] }]);
    mockBulk.mockResolvedValueOnce({
      errors: true,
      items: [{ update: { error: { type: 'mapper_parsing_exception' } } }],
    });

    await main({
      index: 'articles',
      concurrency: 1,
      batchSize: 100,
      from: '2026-01-01T00:00:00Z',
      dryRun: false,
    });

    const query = mockGetAllDocs.mock.calls[0][1] as {
      bool: { filter?: unknown[] };
    };
    expect(query.bool.filter).toEqual([
      { range: { updatedAt: { gte: '2026-01-01T00:00:00Z' } } },
    ]);
    expect(mockBulk).toHaveBeenCalledTimes(1);
  });

  it('counts errors and skips bulk when embedding generation throws', async () => {
    mockCount.mockResolvedValueOnce({ count: 1 });
    mockGetAllDocs.mockReturnValueOnce(
      docsGen([{ _id: 'art1', _source: { text: 'foo' } }])
    );
    mockCreateEmbedding.mockRejectedValue(new Error('non-quota failure'));

    await main({
      index: 'articles',
      concurrency: 1,
      batchSize: 100,
      dryRun: false,
    });

    expect(mockBulk).not.toHaveBeenCalled();
  });
});
