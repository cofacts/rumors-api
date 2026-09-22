import {
  jest,
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
} from '@jest/globals';
import MockDate from 'mockdate';
import { GoogleGenAI } from '@google/genai';

import client from 'util/client';
import { loadFixtures, unloadFixtures } from 'util/fixtures';

// Variables prefixed with `mock` are exempt from jest.mock factory hoisting checks.
const mockEmbedContent = jest.fn() as jest.Mock<
  (params: unknown) => Promise<{ embeddings: { values: number[] }[] }>
>;
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { embedContent: mockEmbedContent },
  })),
}));

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getProjectId: () => Promise.resolve('test-project'),
  })),
}));

import {
  createEmbedding,
  getReplyEmbeddingCacheId,
  getQueryEmbeddingCacheId,
} from '../embedding';

const user = { id: 'test-user', appId: 'WEBSITE' };

describe('embedding cache ids', () => {
  it('namespaces and deterministically hashes reply/query ids', () => {
    const a = getReplyEmbeddingCacheId('hello', 'ref1');
    expect(a).toMatch(/^reply:/);
    expect(getReplyEmbeddingCacheId('hello', 'ref1')).toBe(a); // deterministic
    expect(getReplyEmbeddingCacheId('hello', 'ref2')).not.toBe(a); // ref matters
    expect(getReplyEmbeddingCacheId('hello')).toMatch(/^reply:/); // ref optional

    const q = getQueryEmbeddingCacheId('hello');
    expect(q).toMatch(/^query-text:/);
    expect(getQueryEmbeddingCacheId('hello')).toBe(q);
    expect(q).not.toBe(a); // different namespace than the doc-side id
  });
});

describe('createEmbedding', () => {
  beforeEach(() => {
    mockEmbedContent.mockReset();
  });

  afterEach(async () => {
    // Clean up any EMBEDDING airesponses created by the SUT or fixtures.
    // Refresh first so docs indexed during the test are visible to
    // deleteByQuery — postTest's leak audit is unforgiving.
    await client.indices.refresh({ index: 'airesponses' });
    await client.deleteByQuery({
      index: 'airesponses',
      query: { term: { type: 'EMBEDDING' } },
      refresh: true,
    });
  });

  it('returns cached embeddings without calling Vertex AI', async () => {
    const cachedChunks = [
      { vector: [0.1, 0.2, 0.3], startOffsetSec: 0, endOffsetSec: 120 },
    ];

    await loadFixtures({
      '/airesponses/doc/cached-doc': {
        type: 'EMBEDDING',
        docId: 'cached-doc',
        status: 'SUCCESS',
        userId: 'foo',
        appId: 'WEBSITE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        embeddings: cachedChunks,
      },
    });

    const result = await createEmbedding(
      { id: 'cached-doc', type: 'text' },
      [{ text: 'irrelevant' }],
      user
    );

    expect(result).toEqual(cachedChunks);
    expect(mockEmbedContent).not.toHaveBeenCalled();

    await unloadFixtures({ '/airesponses/doc/cached-doc': {} });
  });

  it('calls Vertex AI on cache miss and persists embeddings to airesponses', async () => {
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.7, 0.8, 0.9] }],
    });

    MockDate.set('2026-05-05T00:00:00.000Z');
    const result = await createEmbedding(
      { id: 'fresh-doc', type: 'text' },
      [{ text: 'hello world' }],
      user
    );
    MockDate.reset();

    expect(mockEmbedContent).toHaveBeenCalledTimes(1);
    const callArg = mockEmbedContent.mock.calls[0][0] as {
      model: string;
      contents: { parts: { text: string }[] }[];
      config: { outputDimensionality: number; taskType: string };
    };
    expect(callArg.model).toBe('gemini-embedding-2');
    expect(callArg.contents[0].parts[0]).toEqual({ text: 'hello world' });

    // gemini-embedding-2 is global-only; a regional endpoint 404s.
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({ vertexai: true, location: 'global' })
    );
    expect(callArg.config).toEqual({
      outputDimensionality: 768,
      taskType: 'RETRIEVAL_DOCUMENT',
    });

    expect(result).toEqual([{ vector: [0.7, 0.8, 0.9] }]);

    // ES should have a SUCCESS airesponse for this docId
    await client.indices.refresh({ index: 'airesponses' });
    const {
      hits: { hits },
    } = await client.search<{
      type: string;
      docId: string;
      status: string;
      embeddings: { vector: number[] }[];
    }>({
      index: 'airesponses',
      query: {
        bool: {
          must: [
            { term: { type: 'EMBEDDING' } },
            { term: { docId: 'fresh-doc' } },
          ],
        },
      },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]._source?.status).toBe('SUCCESS');
    expect(hits[0]._source?.embeddings).toEqual([{ vector: [0.7, 0.8, 0.9] }]);
  });

  it('embeds a gs:// media part as a single capped vector', async () => {
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.5, 0.5] }],
    });

    const result = await createEmbedding(
      { id: 'media-doc', type: 'video' },
      [{ mimeType: 'video/mp4', fileUri: 'gs://test-bucket/media/vid' }],
      user
    );

    // Passed through untouched, bounded by an explicit endOffset.
    expect(mockEmbedContent).toHaveBeenCalledTimes(1);
    const params = mockEmbedContent.mock.calls[0][0] as {
      contents: {
        parts: {
          fileData?: { fileUri: string; mimeType: string };
          videoMetadata?: { startOffset: string; endOffset: string };
        }[];
      }[];
    };
    const part = params.contents[0].parts[0];
    expect(part.fileData).toEqual({
      fileUri: 'gs://test-bucket/media/vid',
      mimeType: 'video/mp4',
    });
    expect(part.videoMetadata).toEqual({
      startOffset: '0s',
      endOffset: '80s',
    });
    // One whole-file vector, no per-chunk offsets stored.
    expect(result).toEqual([{ vector: [0.5, 0.5] }]);
  });

  it('embeds a public https media part as-is', async () => {
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.3, 0.3] }],
    });

    // Query-side shape: the caller's own public URL, e.g. rumors-line-bot's
    // getcontent URL. Vertex fetches it itself; we never touch the bytes.
    const result = await createEmbedding(
      { id: 'media-url-doc', type: 'image' },
      [{ mimeType: 'image/jpeg', fileUri: 'https://public.example/x.jpg' }],
      user
    );

    const params = mockEmbedContent.mock.calls[0][0] as {
      contents: { parts: { fileData?: { fileUri: string } }[] }[];
    };
    expect(params.contents[0].parts[0].fileData).toEqual({
      fileUri: 'https://public.example/x.jpg',
      mimeType: 'image/jpeg',
    });
    expect(result).toEqual([{ vector: [0.3, 0.3] }]);
  });

  it('omits userId/appId on the cache record when called without a user', async () => {
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.4, 0.5, 0.6] }],
    });

    const result = await createEmbedding(
      { id: 'anon-doc', type: 'text' },
      [{ text: 'anonymous query' }],
      null,
      { taskType: 'RETRIEVAL_QUERY' }
    );

    expect(result).toEqual([{ vector: [0.4, 0.5, 0.6] }]);

    await client.indices.refresh({ index: 'airesponses' });
    const {
      hits: { hits },
    } = await client.search<{
      userId?: string;
      appId?: string;
      status: string;
    }>({
      index: 'airesponses',
      query: {
        bool: {
          must: [
            { term: { type: 'EMBEDDING' } },
            { term: { docId: 'anon-doc' } },
          ],
        },
      },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]._source?.status).toBe('SUCCESS');
    expect(hits[0]._source?.userId).toBeUndefined();
    expect(hits[0]._source?.appId).toBeUndefined();
  });

  it('marks the cache record ERROR and rethrows when Vertex returns an empty vector', async () => {
    mockEmbedContent.mockResolvedValue({ embeddings: [{ values: [] }] });

    await expect(
      createEmbedding(
        { id: 'unit-empty-vec', type: 'text' },
        [{ text: 'x' }],
        user
      )
    ).rejects.toThrow(/Empty vector/);

    // The catch block should have persisted an ERROR airesponses record.
    await client.indices.refresh({ index: 'airesponses' });
    const {
      hits: { hits },
    } = await client.search<{ status: string }>({
      index: 'airesponses',
      query: {
        bool: {
          must: [
            { term: { type: 'EMBEDDING' } },
            { term: { docId: 'unit-empty-vec' } },
          ],
        },
      },
    });
    expect(hits[0]?._source?.status).toBe('ERROR');
    // afterEach removes the EMBEDDING doc.
  });
});
