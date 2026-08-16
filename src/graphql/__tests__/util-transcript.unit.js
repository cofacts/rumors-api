/**
 * Mocked unit tests for the media-upload / transcription helpers in graphql/util.
 *
 * Their integration counterparts (media-integration.js, genAITranscript.js) hit
 * real GCS / Vision / Gemini and only run in the integration workflow, so with
 * the CI split these branches were no longer covered on a normal PR run. Here we
 * mock the paid SDKs so the branching logic is exercised on every CI run at no
 * API cost.
 *
 * `createAIResponse` writes to the real test ES (same as production code), so
 * every doc created below is recorded and removed in afterAll.
 */
import client from 'util/client';

// --- Mocks for paid / external SDKs ---------------------------------------

// util.js constructs `new ImageAnnotatorClient()` at module-load time, which is
// before this file's top-level consts initialize (imports are hoisted). Keeping
// the jest.fn inside the factory closure sidesteps the TDZ; we retrieve it via a
// throwaway instance below, since every instance shares the same closure fn.
jest.mock('@google-cloud/vision', () => {
  const documentTextDetection = jest.fn();
  return {
    ImageAnnotatorClient: jest.fn(() => ({ documentTextDetection })),
  };
});

// transcribeAV constructs GoogleGenAI per call, so the shared closure fn is the
// only stable handle on it.
jest.mock('@google/genai', () => {
  const generateContent = jest.fn();
  return {
    GoogleGenAI: jest.fn(() => ({ models: { generateContent } })),
  };
});

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn(() => ({
    getProjectId: jest.fn().mockResolvedValue('test-project'),
  })),
}));

// Only used for the HEAD content-type sniff.
jest.mock('node-fetch', () => jest.fn());

jest.mock('util/mediaManager', () => ({
  __esModule: true,
  default: { insert: jest.fn(), get: jest.fn() },
  IMAGE_PREVIEW: 'webp600w',
  IMAGE_THUMBNAIL: 'jpg240h',
}));

// Imported after the mocks are declared (jest hoists jest.mock above imports).
import mediaManager from 'util/mediaManager';
import { uploadMedia, createTranscript } from 'graphql/util';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { GoogleGenAI } from '@google/genai';
import fetch from 'node-fetch';

const mockDocumentTextDetection = new ImageAnnotatorClient()
  .documentTextDetection;
const mockGenerateContent = new GoogleGenAI().models.generateContent;

const user = { id: 'user-id', appId: 'app-id' };

// Every airesponses doc these tests create, so we can clean up exactly what we
// made rather than deleting by type (which would clobber other suites' fixtures).
const createdIds = [];

/** createTranscript + record the airesponses doc it created */
async function transcribe(...args) {
  const result = await createTranscript(...args);
  if (result && result.id) createdIds.push(result.id);
  return result;
}

afterAll(async () => {
  // Delete by id rather than deleteByQuery: these docs were just indexed and are
  // not searchable until a refresh, but a delete by id is realtime.
  await Promise.all(
    createdIds.map((id) =>
      client.delete({ index: 'airesponses', id, refresh: true })
    )
  );
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
      // image type yields original + thumbnail + preview
      const variantSettings = opts.getVariantSettings({
        type: 'image',
        contentType: 'image/jpeg',
      });
      expect(variantSettings).toHaveLength(3);
      expect(variantSettings.map(({ name }) => name)).toEqual(
        expect.arrayContaining(['jpg240h', 'webp600w'])
      );
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
      // Article says IMAGE but the file is audio -> should throw
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
    fetch.mockReset();
  });

  it('throws when no user is given', async () => {
    await expect(
      createTranscript({ id: 'unit-nouser', type: 'image' }, 'gs://b/a.jpg')
    ).rejects.toThrow('[createTranscript] user is required');
  });

  it('returns ERROR for unsupported types', async () => {
    const { status, text } = await transcribe(
      { id: 'unit-unsupported', type: 'file' },
      'https://some-url',
      user
    );
    expect({ status, text }).toEqual({
      status: 'ERROR',
      text: 'Error: Type file not supported',
    });
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
                      // Below OCR_CONFIDENCE_THRESHOLD -> filtered out entirely
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

      const { status, text } = await transcribe(
        { id: 'unit-ocr', type: 'image' },
        'gs://bucket/img.jpg',
        user
      );

      expect(status).toBe('SUCCESS');
      expect(text).toBe('排汗\nx \ny');
      expect(text).not.toMatch('NOPE');
      expect(mockDocumentTextDetection).toHaveBeenCalledWith(
        'gs://bucket/img.jpg'
      );
    });

    it('returns empty text when there is no annotation', async () => {
      mockDocumentTextDetection.mockResolvedValue([
        { fullTextAnnotation: null },
      ]);
      const { status, text } = await transcribe(
        { id: 'unit-ocr-empty', type: 'image' },
        'gs://bucket/blank.jpg',
        user
      );
      expect({ status, text }).toEqual({ status: 'SUCCESS', text: '' });
    });

    it('returns empty text when the annotation has no pages', async () => {
      mockDocumentTextDetection.mockResolvedValue([
        { fullTextAnnotation: { pages: [] } },
      ]);
      const { status, text } = await transcribe(
        { id: 'unit-ocr-nopages', type: 'image' },
        'gs://bucket/nopages.jpg',
        user
      );
      expect({ status, text }).toEqual({ status: 'SUCCESS', text: '' });
    });

    it('returns ERROR when Vision reports an error', async () => {
      mockDocumentTextDetection.mockResolvedValue([
        { error: { message: 'quota exceeded' } },
      ]);
      const { status, text } = await transcribe(
        { id: 'unit-ocr-err', type: 'image' },
        'gs://bucket/bad.jpg',
        user
      );
      expect({ status, text }).toEqual({
        status: 'ERROR',
        text: 'quota exceeded',
      });
    });

    it('falls back to a generic message when the Vision error has none', async () => {
      mockDocumentTextDetection.mockResolvedValue([{ error: {} }]);
      const { status, text } = await transcribe(
        { id: 'unit-ocr-err-nomsg', type: 'image' },
        'gs://bucket/bad2.jpg',
        user
      );
      expect({ status, text }).toEqual({
        status: 'ERROR',
        text: 'Vision API error',
      });
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
      await transcribe(
        { id: 'unit-ocr-entry', type: 'image' },
        mediaEntry,
        user
      );
      expect(mockDocumentTextDetection).toHaveBeenCalledWith(
        'gs://bucket/from-entry.jpg'
      );
    });
  });

  describe('audio / video transcript', () => {
    /** A media entry already on GCS; Vertex reads its gs:// URI directly. */
    const entryWith = (metadata) => ({
      // used for the HEAD content-type sniff
      getUrl: () => 'https://cdn/entry.mp4',
      getFile: () => ({
        getMetadata: async () => [metadata],
        cloudStorageURI: { href: 'gs://bucket/entry.mp4' },
      }),
    });
    const mediaEntry = entryWith({ contentType: 'video/mp4' });

    const geminiReplies = (text, usageMetadata = {}) => ({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata,
    });

    it('transcribes via Gemini and returns text + usage', async () => {
      fetch.mockResolvedValue({ headers: { get: () => 'video/mp4' } });
      mockGenerateContent.mockResolvedValue(
        geminiReplies('spoken words', {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
        })
      );

      const { status, text, usage } = await transcribe(
        { id: 'unit-av', type: 'video' },
        mediaEntry,
        user
      );

      expect(status).toBe('SUCCESS');
      expect(text).toBe('spoken words');
      expect(usage).toMatchObject({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent.mock.calls[0][0].contents[0].parts[0]).toEqual(
        {
          fileData: {
            fileUri: 'gs://bucket/entry.mp4',
            mimeType: 'video/mp4',
          },
        }
      );
    });

    it('prefers the GCS metadata contentType over the HEAD sniff', async () => {
      fetch.mockResolvedValue({ headers: { get: () => 'video/webm' } });
      mockGenerateContent.mockResolvedValue(geminiReplies('ok'));

      await transcribe(
        { id: 'unit-av-metadata', type: 'video' },
        entryWith({ contentType: 'video/quicktime' }),
        user
      );

      expect(
        mockGenerateContent.mock.calls[0][0].contents[0].parts[0].fileData
          .mimeType
      ).toBe('video/quicktime');
    });

    it('falls back to the HEAD content-type when metadata lacks one', async () => {
      fetch.mockResolvedValue({ headers: { get: () => 'audio/ogg' } });
      mockGenerateContent.mockResolvedValue(geminiReplies('ok'));

      await transcribe(
        { id: 'unit-av-head', type: 'audio' },
        entryWith({}),
        user
      );

      expect(
        mockGenerateContent.mock.calls[0][0].contents[0].parts[0].fileData
          .mimeType
      ).toBe('audio/ogg');
    });

    it('falls back to a type default when both metadata and HEAD fail', async () => {
      fetch.mockRejectedValue(new Error('network down'));
      mockGenerateContent.mockResolvedValue(geminiReplies('ok'));

      await transcribe(
        { id: 'unit-av-headfail', type: 'audio' },
        entryWith({}),
        user
      );

      expect(
        mockGenerateContent.mock.calls[0][0].contents[0].parts[0].fileData
          .mimeType
      ).toBe('audio/mpeg');
    });

    it('uploads to GCS first when given a plain URL', async () => {
      fetch.mockResolvedValue({ headers: { get: () => 'video/mp4' } });
      mockGenerateContent.mockResolvedValue(geminiReplies('from url'));

      const uploaded = {
        variants: [],
        getFile: () => ({
          getMetadata: async () => [{ contentType: 'video/mp4' }],
          cloudStorageURI: { href: 'gs://bucket/uploaded.mp4' },
        }),
      };
      mediaManager.insert.mockImplementation(async (opts) => {
        // media-manager signals the upload finished only after insert resolves
        setTimeout(() => opts.onUploadStop(null), 0);
        return uploaded;
      });

      const { status, text } = await transcribe(
        { id: 'unit-av-upload', type: 'video' },
        'https://media/remote.mp4',
        user
      );

      expect(mediaManager.insert).toHaveBeenCalledTimes(1);
      expect(mediaManager.insert.mock.calls[0][0].url).toBe(
        'https://media/remote.mp4'
      );
      expect(fetch).toHaveBeenCalledWith('https://media/remote.mp4', {
        method: 'HEAD',
      });
      // Gemini reads the uploaded gs:// URI, not the original URL
      expect(
        mockGenerateContent.mock.calls[0][0].contents[0].parts[0].fileData
          .fileUri
      ).toBe('gs://bucket/uploaded.mp4');
      expect({ status, text }).toEqual({ status: 'SUCCESS', text: 'from url' });
    });

    it('falls back to the next model on 429 RESOURCE_EXHAUSTED', async () => {
      fetch.mockResolvedValue({ headers: { get: () => 'audio/mpeg' } });
      mockGenerateContent
        .mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED'))
        .mockResolvedValueOnce(geminiReplies('second model'));

      const { status, text } = await transcribe(
        { id: 'unit-av-fallback', type: 'audio' },
        mediaEntry,
        user
      );

      expect({ status, text }).toEqual({
        status: 'SUCCESS',
        text: 'second model',
      });
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('returns ERROR without retrying on non-quota Gemini errors', async () => {
      fetch.mockResolvedValue({ headers: { get: () => 'video/mp4' } });
      mockGenerateContent.mockRejectedValue(new Error('bad request'));

      const { status, text } = await transcribe(
        { id: 'unit-av-err', type: 'video' },
        mediaEntry,
        user
      );

      expect(status).toBe('ERROR');
      expect(text).toEqual(expect.stringContaining('bad request'));
      // Non-quota errors are re-thrown immediately, so no second model is tried
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('returns ERROR when every model hits its quota', async () => {
      fetch.mockResolvedValue({ headers: { get: () => 'video/mp4' } });
      mockGenerateContent.mockRejectedValue(
        new Error('429 RESOURCE_EXHAUSTED')
      );

      const { status, text } = await transcribe(
        { id: 'unit-av-allquota', type: 'video' },
        mediaEntry,
        user
      );

      expect(status).toBe('ERROR');
      // Match on the prefix only: the exact wording tracks whichever fallbacks
      // TRANSCRIPT_MODELS currently has. What must hold is that every model was
      // attempted and the exhaustion surfaced as ERROR.
      expect(text).toMatch(/^All models failed/);
      expect(mockGenerateContent.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
