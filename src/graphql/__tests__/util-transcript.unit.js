/**
 * Mocked unit tests for the transcription / media-upload helpers in graphql/util.
 * The integration counterparts (util.js `createTranscript` describe) hit real
 * GCS/Vision/Gemini and only run in the integration workflow; here we mock those
 * SDKs so the branching logic is covered on every CI run with no API cost.
 *
 * The airesponses cache writes go to the real test ES (same as production code),
 * so each test cleans up the doc it creates.
 */
import client from 'util/client';
import mediaManager from 'util/mediaManager';

// --- Mocks for paid / external SDKs ---------------------------------------

// util.js constructs `new ImageAnnotatorClient()` at module-load time, which is
// before this file's top-level consts initialize (imports are hoisted). So the
// mock fn must live inside the factory; we retrieve it from the constructed
// instance below.
jest.mock('@google-cloud/vision', () => {
  const documentTextDetection = jest.fn();
  return {
    ImageAnnotatorClient: jest.fn(() => ({ documentTextDetection })),
  };
});

const mockGenerateContent = jest.fn();
jest.mock('util/genai', () => ({
  createGenAI: jest.fn(async () => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

// Only HEAD requests go out now (content-type sniffing); Vertex fetches the
// media itself from the URI we hand it.
jest.mock('node-fetch', () =>
  jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'video/mp4' },
  })
);

jest.mock('util/mediaManager', () => ({
  __esModule: true,
  default: { insert: jest.fn(), get: jest.fn() },
}));

// Imported after mocks are declared (jest hoists jest.mock above imports).
import { uploadMedia, createTranscript } from 'graphql/util';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import fetch from 'node-fetch'; // the jest.fn() mock declared above

// The single instance util.js constructed at load; grab its mocked method.
const mockDocumentTextDetection =
  ImageAnnotatorClient.mock.results[0].value.documentTextDetection;

const user = { id: 'user-id', appId: 'app-id' };

afterAll(async () => {
  // Drop any TRANSCRIPT airesponses created by these tests.
  await client.indices.refresh({ index: 'airesponses' });
  await client.deleteByQuery({
    index: 'airesponses',
    query: { term: { type: 'TRANSCRIPT' } },
    refresh: true,
  });
});

describe('uploadMedia (unit)', () => {
  beforeEach(() => mediaManager.insert.mockReset());

  it('builds image variant settings and applies metadata on upload stop', async () => {
    let capturedOpts;
    const setMetadata = jest.fn();
    const fakeMediaEntry = {
      variants: ['original', 'thumbnail'],
      getFile: jest.fn(() => ({ setMetadata })),
    };
    mediaManager.insert.mockImplementation(async (opts) => {
      capturedOpts = opts;
      // image type returns the 3 image variants (original + thumbnail + preview)
      const variantSettings = opts.getVariantSettings({
        type: 'image',
        contentType: 'image/jpeg',
      });
      expect(variantSettings).toHaveLength(3);
      return fakeMediaEntry;
    });

    const userOnUploadStop = jest.fn();
    const result = await uploadMedia({
      mediaUrl: 'http://example.com/a.jpg',
      articleType: 'IMAGE',
      onUploadStop: userOnUploadStop,
    });

    expect(result).toBe(fakeMediaEntry);
    expect(capturedOpts.url).toBe('http://example.com/a.jpg');

    // Simulate media-manager signalling a successful upload.
    capturedOpts.onUploadStop(null);
    expect(setMetadata).toHaveBeenCalledTimes(fakeMediaEntry.variants.length);
    expect(userOnUploadStop).toHaveBeenCalledWith(null);
  });

  it('falls back to default variant settings for non-image types', async () => {
    mediaManager.insert.mockImplementation(async (opts) => {
      const settings = opts.getVariantSettings({
        type: 'audio',
        contentType: 'audio/mpeg',
      });
      expect(Array.isArray(settings)).toBe(true);
      return { variants: [], getFile: jest.fn() };
    });
    await uploadMedia({ mediaUrl: 'http://x/a.mp3', articleType: 'AUDIO' });
  });

  it('throws when articleType does not match the media file type', async () => {
    mediaManager.insert.mockImplementation(async (opts) => {
      // Article says IMAGE but the file is an audio -> should throw
      expect(() =>
        opts.getVariantSettings({ type: 'audio', contentType: 'audio/mpeg' })
      ).toThrow(/article type is "IMAGE", but the media file is a audio/);
      return { variants: [], getFile: jest.fn() };
    });
    await uploadMedia({ mediaUrl: 'http://x/a.jpg', articleType: 'IMAGE' });
  });
});

describe('createTranscript (unit)', () => {
  beforeEach(() => {
    mockDocumentTextDetection.mockReset();
    mockGenerateContent.mockReset();
    mediaManager.insert.mockReset();
  });

  it('returns ERROR for unsupported types', async () => {
    const { id, ...res } = await createTranscript(
      { id: 'unit-unsupported', type: 'file' },
      'https://some-url',
      user
    );
    expect(res).toMatchObject({
      status: 'ERROR',
      text: 'Error: Type file not supported',
    });
    await client.delete({ index: 'airesponses', id });
  });

  describe('image OCR', () => {
    it('extracts confident paragraphs and honors break types', async () => {
      mockDocumentTextDetection.mockResolvedValue([
        {
          fullTextAnnotation: {
            pages: [
              {
                blocks: [
                  {
                    paragraphs: [
                      {
                        confidence: 0.9,
                        words: [
                          {
                            symbols: [
                              { text: '排', property: null },
                              {
                                text: '汗',
                                property: {
                                  detectedBreak: { type: 'LINE_BREAK' },
                                },
                              },
                              {
                                text: 'x',
                                property: {
                                  detectedBreak: { type: 'SPACE' },
                                },
                              },
                              {
                                text: 'y',
                                property: {
                                  detectedBreak: {
                                    type: 'LINE_BREAK',
                                    isPrefix: true,
                                  },
                                },
                              },
                            ],
                          },
                        ],
                      },
                      // Below confidence threshold -> filtered out entirely
                      {
                        confidence: 0.5,
                        words: [
                          { symbols: [{ text: 'NOPE', property: null }] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ]);

      const { id, text, ...res } = await createTranscript(
        { id: 'unit-ocr', type: 'image' },
        'gs://bucket/img.jpg',
        user
      );

      expect(res).toMatchObject({ status: 'SUCCESS' });
      expect(text).toBe('排汗\nx \ny');
      expect(text).not.toMatch('NOPE');
      expect(mockDocumentTextDetection).toHaveBeenCalledWith(
        'gs://bucket/img.jpg'
      );
      await client.delete({ index: 'airesponses', id });
    });

    it('returns empty text when there is no annotation', async () => {
      mockDocumentTextDetection.mockResolvedValue([
        { fullTextAnnotation: null },
      ]);
      const { id, text, ...res } = await createTranscript(
        { id: 'unit-ocr-empty', type: 'image' },
        'gs://bucket/blank.jpg',
        user
      );
      expect(res).toMatchObject({ status: 'SUCCESS' });
      expect(text).toBe('');
      await client.delete({ index: 'airesponses', id });
    });

    it('returns ERROR when Vision reports an error', async () => {
      mockDocumentTextDetection.mockResolvedValue([
        { error: { message: 'quota exceeded' } },
      ]);
      const { id, ...res } = await createTranscript(
        { id: 'unit-ocr-err', type: 'image' },
        'gs://bucket/bad.jpg',
        user
      );
      expect(res).toMatchObject({ status: 'ERROR', text: 'quota exceeded' });
      await client.delete({ index: 'airesponses', id });
    });

    it('reads the image URI from a MediaEntry object', async () => {
      mockDocumentTextDetection.mockResolvedValue([
        { fullTextAnnotation: null },
      ]);
      const mediaEntry = {
        getFile: () => ({
          cloudStorageURI: { href: 'gs://bucket/from-entry.jpg' },
        }),
      };
      const { id } = await createTranscript(
        { id: 'unit-ocr-entry', type: 'image' },
        mediaEntry,
        user
      );
      expect(mockDocumentTextDetection).toHaveBeenCalledWith(
        'gs://bucket/from-entry.jpg'
      );
      await client.delete({ index: 'airesponses', id });
    });
  });

  describe('audio / video transcript', () => {
    // A media entry already on GCS: Vertex reads its `gs://` URI directly, so
    // nothing is copied and nothing needs cleaning up.
    const mediaEntry = {
      getFile: () => ({
        getMetadata: async () => [{ contentType: 'video/mp4' }],
        cloudStorageURI: { href: 'gs://bucket/entry.mp4' },
      }),
    };

    it('transcribes via Gemini and returns text + usage', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'spoken words' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      });

      const { id, text, usage, ...res } = await createTranscript(
        { id: 'unit-av', type: 'video' },
        mediaEntry,
        user
      );

      expect(res).toMatchObject({ status: 'SUCCESS' });
      expect(text).toBe('spoken words');
      expect(usage).toMatchObject({ totalTokens: 30 });
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent.mock.calls[0][0].contents[0].parts[0]).toEqual(
        {
          fileData: {
            fileUri: 'gs://bucket/entry.mp4',
            mimeType: 'video/mp4',
          },
        }
      );
      await client.delete({ index: 'airesponses', id });
    });

    it('falls back to the next model on 429 RESOURCE_EXHAUSTED', async () => {
      mockGenerateContent
        .mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED'))
        .mockResolvedValueOnce({
          candidates: [{ content: { parts: [{ text: 'second model' }] } }],
          usageMetadata: {},
        });

      const { id, text, ...res } = await createTranscript(
        { id: 'unit-av-fallback', type: 'audio' },
        mediaEntry,
        user
      );

      expect(res).toMatchObject({ status: 'SUCCESS' });
      expect(text).toBe('second model');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      await client.delete({ index: 'airesponses', id });
    });

    it('returns ERROR on non-quota Gemini errors', async () => {
      mockGenerateContent.mockRejectedValue(new Error('bad request'));
      const { id, ...res } = await createTranscript(
        { id: 'unit-av-err', type: 'video' },
        mediaEntry,
        user
      );
      expect(res).toMatchObject({ status: 'ERROR' });
      await client.delete({ index: 'airesponses', id });
    });

    it('passes a string URL straight to Vertex, without creating a media entry', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'video/mp4' },
      });
      mockGenerateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'from url' }] } }],
        usageMetadata: {},
      });

      const { id, text, ...res } = await createTranscript(
        { id: 'unit-av-upload', type: 'video' },
        'https://media/remote.mp4',
        user
      );

      // Nothing is stored or copied: no media entry, and only a HEAD goes out —
      // Vertex fetches the (public) URL itself.
      expect(mediaManager.insert).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith('https://media/remote.mp4', {
        method: 'HEAD',
      });
      expect(
        mockGenerateContent.mock.calls[0][0].contents[0].parts[0].fileData
      ).toEqual({
        fileUri: 'https://media/remote.mp4',
        mimeType: 'video/mp4',
      });
      expect(res).toMatchObject({ status: 'SUCCESS' });
      expect(text).toBe('from url');
      await client.delete({ index: 'airesponses', id });
    });

    it('falls back to a default mimeType when the media metadata lacks contentType', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        usageMetadata: {},
      });
      const entry = {
        getFile: () => ({
          getMetadata: async () => [{}], // no contentType -> default per type
          cloudStorageURI: { href: 'gs://bucket/entry.mp3' },
        }),
      };
      const { id, ...res } = await createTranscript(
        { id: 'unit-av-headfail', type: 'audio' },
        entry,
        user
      );
      expect(res).toMatchObject({ status: 'SUCCESS' });
      // audio default mimeType is what reaches the model.
      expect(
        mockGenerateContent.mock.calls[0][0].contents[0].parts[0].fileData
          .mimeType
      ).toBe('audio/mpeg');
      await client.delete({ index: 'airesponses', id });
    });

    it('returns ERROR when all models hit quota limits', async () => {
      mockGenerateContent.mockRejectedValue(
        new Error('429 RESOURCE_EXHAUSTED')
      );
      const { id, ...res } = await createTranscript(
        { id: 'unit-av-allquota', type: 'video' },
        mediaEntry,
        user
      );
      expect(res).toMatchObject({
        status: 'ERROR',
        // The last error is surfaced rather than assuming a cause.
        text: expect.stringContaining('429 RESOURCE_EXHAUSTED'),
      });
      // Both TRANSCRIPT_MODELS attempted before giving up
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      await client.delete({ index: 'airesponses', id });
    });

    it('falls back to the next model on 404 NOT_FOUND (model retired)', async () => {
      mockGenerateContent
        .mockRejectedValueOnce(new Error('404 NOT_FOUND'))
        .mockResolvedValueOnce({
          candidates: [{ content: { parts: [{ text: 'after retirement' }] } }],
          usageMetadata: {},
        });

      const { id, text, ...res } = await createTranscript(
        { id: 'unit-av-404', type: 'video' },
        mediaEntry,
        user
      );

      expect(res).toMatchObject({ status: 'SUCCESS' });
      expect(text).toBe('after retirement');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      await client.delete({ index: 'airesponses', id });
    });
  });
});
