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

// The google-auth-library mock above also replaces the copy that
// @google-cloud/storage uses, so keep the real MediaManager out of this test.
jest.mock('util/mediaManager', () => ({
  __esModule: true,
  default: { insert: jest.fn(), get: jest.fn() },
  IMAGE_PREVIEW: 'webp600w',
  IMAGE_THUMBNAIL: 'jpg240h',
}));

import {
  createEmbedding,
  createMediaEmbedding,
  getReplyEmbeddingCacheId,
  getQueryEmbeddingCacheId,
  getEmbeddingVersion,
  getEmbeddingCacheDocId,
  getCachedEmbedding,
  isUrlOnlyText,
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
        docId: getEmbeddingCacheDocId({ id: 'cached-doc', type: 'text' }),
        status: 'SUCCESS',
        userId: 'foo',
        appId: 'WEBSITE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        request: getEmbeddingVersion('text'),
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

  it('does not reuse embeddings made under other settings', async () => {
    const staleRecord = {
      type: 'EMBEDDING',
      status: 'SUCCESS',
      userId: 'foo',
      appId: 'WEBSITE',
      createdAt: '2026-01-01T00:00:00.000Z',
      embeddings: [{ vector: [0.1, 0.2, 0.3] }],
    };
    await loadFixtures({
      // Made before the settings were in the key
      '/airesponses/doc/stale-doc-1': { ...staleRecord, docId: 'stale-doc' },
      // Made with another input layout
      '/airesponses/doc/stale-doc-2': {
        ...staleRecord,
        docId: 'stale-doc@gemini-embedding-2/768/some-older-layout',
      },
    });
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.4, 0.5, 0.6] }],
    });

    const queryInfo = { id: 'stale-doc', type: 'text' } as const;
    expect(await getCachedEmbedding(queryInfo)).toBeNull();

    expect(
      await createEmbedding(queryInfo, [{ text: 'some text' }], user)
    ).toEqual([{ vector: [0.4, 0.5, 0.6] }]);
    expect(mockEmbedContent).toHaveBeenCalledTimes(1);

    // The new record carries the current settings, and is the one served from
    // now on.
    await client.indices.refresh({ index: 'airesponses' });
    expect(await getCachedEmbedding(queryInfo)).toEqual([
      { vector: [0.4, 0.5, 0.6] },
    ]);
    await createEmbedding(queryInfo, [{ text: 'some text' }], user);
    expect(mockEmbedContent).toHaveBeenCalledTimes(1);

    // Text and media settings are versioned apart.
    expect(
      await getCachedEmbedding({ id: 'stale-doc', type: 'image' })
    ).toBeNull();

    await unloadFixtures({
      '/airesponses/doc/stale-doc-1': {},
      '/airesponses/doc/stale-doc-2': {},
    });
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
      config: { outputDimensionality: number };
    };
    expect(callArg.model).toBe('gemini-embedding-2');
    // The task goes in a text prefix; the write path embeds a document.
    expect(callArg.contents[0].parts[0]).toEqual({
      text: 'task: sentence similarity | query: hello world',
    });

    // gemini-embedding-2 is global-only; a regional endpoint 404s.
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({ vertexai: true, location: 'global' })
    );
    // No `taskType`: gemini-embedding-2 ignores it.
    expect(callArg.config).toEqual({ outputDimensionality: 768 });

    expect(result).toEqual([{ vector: [0.7, 0.8, 0.9] }]);

    // ES should have a SUCCESS airesponse for this docId
    await client.indices.refresh({ index: 'airesponses' });
    const {
      hits: { hits },
    } = await client.search<{
      type: string;
      docId: string;
      status: string;
      request: string;
      embeddings: { vector: number[] }[];
    }>({
      index: 'airesponses',
      query: {
        bool: {
          must: [
            { term: { type: 'EMBEDDING' } },
            {
              term: {
                docId: 'fresh-doc@gemini-embedding-2/768/similarity-prefix-v1',
              },
            },
          ],
        },
      },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]._source?.status).toBe('SUCCESS');
    expect(hits[0]._source?.embeddings).toEqual([{ vector: [0.7, 0.8, 0.9] }]);
    expect(hits[0]._source?.request).toBe(
      'gemini-embedding-2/768/similarity-prefix-v1'
    );
  });

  it('prefixes a search query with the same task as documents', async () => {
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.1, 0.1] }],
    });

    await createEmbedding(
      { id: 'query-doc', type: 'text' },
      [{ text: 'hello world' }],
      user,
      { role: 'query' }
    );

    const params = mockEmbedContent.mock.calls[0][0] as {
      contents: { parts: { text: string }[] }[];
    };
    expect(params.contents[0].parts[0]).toEqual({
      text: 'task: sentence similarity | query: hello world',
    });
  });

  it('versions query and document text apart', async () => {
    expect(getEmbeddingVersion('text', 'query')).not.toBe(
      getEmbeddingVersion('text', 'document')
    );
    expect(getEmbeddingVersion('text')).toBe(
      getEmbeddingVersion('text', 'document')
    );

    // A vector made as a document is not served as a query, and vice versa.
    await loadFixtures({
      '/airesponses/doc/role-doc': {
        type: 'EMBEDDING',
        docId: getEmbeddingCacheDocId({ id: 'role-doc', type: 'text' }),
        status: 'SUCCESS',
        userId: 'foo',
        appId: 'WEBSITE',
        createdAt: '2026-01-01T00:00:00.000Z',
        request: getEmbeddingVersion('text', 'document'),
        embeddings: [{ vector: [0.1, 0.2, 0.3] }],
      },
    });
    const queryInfo = { id: 'role-doc', type: 'text' } as const;
    expect(await getCachedEmbedding(queryInfo)).toEqual([
      { vector: [0.1, 0.2, 0.3] },
    ]);
    expect(await getCachedEmbedding(queryInfo, { role: 'query' })).toBeNull();

    await unloadFixtures({ '/airesponses/doc/role-doc': {} });
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
    // Media is embedded as-is: no text prefix is added along with it.
    expect(params.contents[0].parts).toHaveLength(1);
    expect(part).not.toHaveProperty('text');
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

  it('rejects without calling Vertex or writing a cache record when called without a user', async () => {
    await expect(
      createEmbedding(
        { id: 'anon-doc', type: 'text' },
        [{ text: 'anonymous query' }],
        // JS callers (ListArticles / ListReplies) pass null when not logged in
        null as unknown as typeof user,
        { role: 'query' }
      )
    ).rejects.toThrow('user is required');

    expect(mockEmbedContent).not.toHaveBeenCalled();

    await client.indices.refresh({ index: 'airesponses' });
    const {
      hits: { hits },
    } = await client.search({
      index: 'airesponses',
      query: {
        bool: {
          must: [
            { term: { type: 'EMBEDDING' } },
            { prefix: { docId: 'anon-doc' } },
          ],
        },
      },
    });
    expect(hits).toHaveLength(0);
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
            {
              term: {
                docId: getEmbeddingCacheDocId({
                  id: 'unit-empty-vec',
                  type: 'text',
                }),
              },
            },
          ],
        },
      },
    });
    expect(hits[0]?._source?.status).toBe('ERROR');
    // afterEach removes the EMBEDDING doc.
  });
});

describe('createMediaEmbedding', () => {
  beforeEach(() => {
    mockEmbedContent.mockReset();
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.5, 0.6] }],
    });
  });

  afterEach(async () => {
    await client.indices.refresh({ index: 'airesponses' });
    await client.deleteByQuery({
      index: 'airesponses',
      query: { term: { type: 'EMBEDDING' } },
      refresh: true,
    });
  });

  const entryWith = (metadata: { contentType?: string }) => ({
    getFile: () => ({
      getMetadata: async (): Promise<[{ contentType?: string }]> => [metadata],
      cloudStorageURI: { href: 'gs://bucket/video/hash/original' },
    }),
  });

  /** The media part sent to Vertex AI */
  const getSentFileData = () =>
    (
      mockEmbedContent.mock.calls[0][0] as {
        contents: { parts: { fileData: object }[] }[];
      }
    ).contents[0].parts[0].fileData;

  it('embeds the media entry by its gs:// URI and GCS content type', async () => {
    const chunks = await createMediaEmbedding(
      { id: 'media-embedding-1', type: 'video' },
      entryWith({ contentType: 'video/quicktime' }),
      user
    );

    expect(chunks).toEqual([{ vector: [0.5, 0.6] }]);
    expect(getSentFileData()).toEqual({
      fileUri: 'gs://bucket/video/hash/original',
      mimeType: 'video/quicktime',
    });
  });

  it('falls back to a type default when GCS metadata lacks a contentType', async () => {
    await createMediaEmbedding(
      { id: 'media-embedding-2', type: 'video' },
      entryWith({}),
      user
    );

    expect(getSentFileData()).toMatchObject({ mimeType: 'video/mp4' });
  });

  it('refuses audio without calling Vertex AI', async () => {
    await expect(
      createMediaEmbedding(
        // A JS caller can still pass audio; the type does not allow it.
        { id: 'media-embedding-3', type: 'audio' as 'video' },
        entryWith({ contentType: 'audio/mpeg' }),
        user
      )
    ).rejects.toThrow('audio is not embedded');
    expect(mockEmbedContent).not.toHaveBeenCalled();
  });

  it('refuses audio in createEmbedding too, before the cache', async () => {
    await expect(
      createEmbedding(
        // A JS caller can still pass audio; the type does not allow it.
        { id: 'media-embedding-4', type: 'audio' as 'video' },
        [{ mimeType: 'audio/mpeg', fileUri: 'gs://bucket/audio/x' }],
        user
      )
    ).rejects.toThrow('audio is not embedded');
    expect(mockEmbedContent).not.toHaveBeenCalled();
    await client.indices.refresh({ index: 'airesponses' });
    const { count } = await client.count({
      index: 'airesponses',
      query: { prefix: { docId: 'media-embedding-4' } },
    });
    expect(count).toBe(0);
  });
});

describe('isUrlOnlyText', () => {
  it('is true for bare links and links with a word or two', () => {
    expect(
      isUrlOnlyText('https://youtu.be/QoJeDjBfVFE?si=0waZA-_y1Ew2po-e')
    ).toBe(true);
    expect(
      isUrlOnlyText(
        'https://www.facebook.com/share/r/1ZmxzxF11i/?mibextid=wwXIfr\nhttps://youtu.be/abc'
      )
    ).toBe(true);
    expect(isUrlOnlyText('轉傳 https://youtu.be/abc 這是真的嗎？')).toBe(true);
  });

  it('is false for text without links, or with enough text besides them', () => {
    expect(isUrlOnlyText('')).toBe(false);
    expect(isUrlOnlyText(null)).toBe(false);
    expect(isUrlOnlyText('開票')).toBe(false);
    expect(
      isUrlOnlyText(
        '切記！6月1號開始取締行人違規！只要不走斑馬線，一律開罰 https://example.com/a'
      )
    ).toBe(false);
  });
});
