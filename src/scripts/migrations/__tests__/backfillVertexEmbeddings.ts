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
const mockCreateMediaEmbedding = jest.fn() as jest.Mock<
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
  createMediaEmbedding: (...args: unknown[]) =>
    mockCreateMediaEmbedding(...args),
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
    mockCreateMediaEmbedding.mockReset();
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

  it('embeds AUDIO/VIDEO articles from their media entry', async () => {
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
    const mediaEntries: Record<string, { id: string }> = {
      ha: { id: 'ha' },
      hv: { id: 'hv' },
    };
    mockMediaManagerGet.mockImplementation(
      async (hash: string) => mediaEntries[hash]
    );
    mockCreateMediaEmbedding.mockResolvedValue([{ vector: [0.3] }]);

    await main({
      index: 'articles',
      concurrency: 1,
      batchSize: 100,
    });

    expect(mockCreateMediaEmbedding).toHaveBeenCalledTimes(2);
    expect(mockCreateMediaEmbedding).toHaveBeenCalledWith(
      { id: 'ha', type: 'audio' },
      mediaEntries.ha,
      expect.objectContaining({ appId: 'RUMORS_AI' })
    );
    expect(mockCreateMediaEmbedding).toHaveBeenCalledWith(
      { id: 'hv', type: 'video' },
      mediaEntries.hv,
      expect.objectContaining({ appId: 'RUMORS_AI' })
    );
    expect(mockCreateEmbedding).not.toHaveBeenCalled();
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
    });

    expect(mockCreateEmbedding).toHaveBeenCalledTimes(1);
    expect((mockCreateEmbedding.mock.calls[0][0] as { id: string }).id).toBe(
      'reply:r-text:http://x'
    );

    const ops = mockBulk.mock.calls[0][0].operations;
    expect(ops[0]).toEqual({ update: { _index: 'replies', _id: 'rep1' } });
    expect(ops[1]).toEqual({ doc: { embeddings: [{ vector: [0.4, 0.5] }] } });
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
    });

    expect(mockMediaManagerGet).toHaveBeenCalledWith('gone');
    expect(mockCreateMediaEmbedding).not.toHaveBeenCalled();
    expect(mockBulk).not.toHaveBeenCalled();
  });

  it('embeds IMAGE articles from their media entry', async () => {
    mockCount.mockResolvedValueOnce({ count: 1 });
    mockGetAllDocs.mockReturnValueOnce(
      docsGen([
        {
          _id: 'img1',
          _source: { articleType: 'IMAGE', attachmentHash: 'h1' },
        },
      ])
    );
    const mediaEntry = { id: 'h1' };
    mockMediaManagerGet.mockResolvedValue(mediaEntry);
    mockCreateMediaEmbedding.mockResolvedValue([{ vector: [0.9] }]);

    await main({
      index: 'articles',
      concurrency: 1,
      batchSize: 100,
    });

    expect(mockCreateMediaEmbedding).toHaveBeenCalledTimes(1);
    expect(mockCreateMediaEmbedding).toHaveBeenCalledWith(
      { id: 'h1', type: 'image' },
      mediaEntry,
      expect.objectContaining({ appId: 'RUMORS_AI' })
    );
    expect(mockBulk.mock.calls[0][0].operations[1]).toEqual({
      doc: { embeddings: [{ vector: [0.9] }] },
    });
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
    });

    const query = mockGetAllDocs.mock.calls[0][1] as {
      bool: { must_not: unknown[]; filter?: unknown[] };
    };
    // `embeddings` is nested, so the "already embedded" exclusion must be a
    // nested query; a top-level `exists` would exclude nothing.
    expect(query.bool.must_not).toEqual([
      {
        nested: {
          path: 'embeddings',
          query: { match_all: {} },
        },
      },
    ]);
    expect(mockCount.mock.calls[0][0]).toEqual({ index: 'articles', query });
    // Small pages + long keep-alive: the loop waits on Vertex per doc.
    expect(mockGetAllDocs.mock.calls[0][2]).toEqual({
      size: 100,
      scroll: '10m',
    });
    expect(query.bool.filter).toEqual([
      { range: { createdAt: { gte: '2026-01-01T00:00:00Z' } } },
    ]);
    expect(mockBulk).toHaveBeenCalledTimes(1);
  });

  it('filters replies by createdAt for --from, as replies have no updatedAt', async () => {
    mockGetAllDocs.mockReturnValueOnce(docsGen([]));

    await main({
      index: 'replies',
      concurrency: 1,
      batchSize: 100,
      from: '2026-01-01T00:00:00Z',
    });

    expect(mockGetAllDocs.mock.calls[0][0]).toBe('replies');
    const query = mockGetAllDocs.mock.calls[0][1] as {
      bool: { filter?: unknown[] };
    };
    expect(query.bool.filter).toEqual([
      { range: { createdAt: { gte: '2026-01-01T00:00:00Z' } } },
    ]);
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
    });

    expect(mockBulk).not.toHaveBeenCalled();
  });
});
