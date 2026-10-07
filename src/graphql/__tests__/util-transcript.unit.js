/**
 * Mocked unit tests for the media-upload / transcription helpers in graphql/util.
 *
 * Their integration counterparts (media-integration.js, genAITranscript.js) hit
 * real GCS / Vision / Vertex and only run in the integration workflow, so with
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

// Mocking our own `createGenAI` seam covers @google/genai and the ADC lookup in
// google-auth-library at once, so no credentials are needed. The `mock` prefix
// is what lets jest's hoisting allow the reference from inside the factory.
const mockGenerateContent = jest.fn();
jest.mock('util/genai', () => ({
  createGenAI: jest.fn(async () => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

jest.mock('util/mediaManager', () => ({
  __esModule: true,
  default: { insert: jest.fn(), get: jest.fn() },
  IMAGE_PREVIEW: 'webp600w',
  IMAGE_THUMBNAIL: 'jpg240h',
}));

// Imported after the mocks are declared (jest hoists jest.mock above imports).
import mediaManager from 'util/mediaManager';
import {
  uploadMedia,
  uploadMediaAndWait,
  getOrUploadMedia,
  createTranscript,
} from 'graphql/util';
import { ImageAnnotatorClient } from '@google-cloud/vision';

const mockDocumentTextDetection = new ImageAnnotatorClient()
  .documentTextDetection;

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

describe('uploadMediaAndWait (unit)', () => {
  beforeEach(() => mediaManager.insert.mockReset());

  const fakeMediaEntry = { variants: [], getFile: jest.fn() };

  it('resolves only after the upload stops', async () => {
    let stopUpload;
    mediaManager.insert.mockImplementation(async (opts) => {
      stopUpload = () => opts.onUploadStop(null);
      return fakeMediaEntry;
    });

    const resolved = jest.fn();
    const promise = uploadMediaAndWait({
      mediaUrl: 'http://x/a.mp4',
      articleType: 'VIDEO',
      user,
    }).then(resolved);

    // insert() has returned the entry, but the file is still uploading.
    await new Promise((resolve) => setImmediate(resolve));
    expect(resolved).not.toHaveBeenCalled();

    stopUpload();
    await promise;
    expect(resolved).toHaveBeenCalledWith(fakeMediaEntry);
  });

  it('resolves when the file already exists, which stops the upload before insert() returns', async () => {
    // Silence the expected error log from uploadMedia's onUploadStop.
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mediaManager.insert.mockImplementation(async (opts) => {
      opts.onUploadStop(new Error('File already exists'));
      return fakeMediaEntry;
    });

    await expect(
      uploadMediaAndWait({
        mediaUrl: 'http://x/a.mp4',
        articleType: 'VIDEO',
        user,
      })
    ).resolves.toBe(fakeMediaEntry);
    consoleError.mockRestore();
  });

  it('uploads nothing without a logged-in user', async () => {
    await expect(
      uploadMediaAndWait({ mediaUrl: 'http://x/a.mp4', articleType: 'VIDEO' })
    ).rejects.toThrow('userId is not set via query string.');
    expect(mediaManager.insert).not.toHaveBeenCalled();
  });

  it('rejects when the media cannot be inserted', async () => {
    mediaManager.insert.mockRejectedValue(new Error('No content type header'));

    await expect(
      uploadMediaAndWait({
        mediaUrl: 'http://x/a',
        articleType: 'VIDEO',
        user,
      })
    ).rejects.toThrow('No content type header');
  });
});

describe('getOrUploadMedia (unit)', () => {
  beforeEach(() => mediaManager.insert.mockReset());

  const queryInfo = { id: 'video.hash', type: 'video' };

  it('returns the stored media entry without uploading', async () => {
    const storedEntry = { id: 'video.hash', variants: ['original'] };

    await expect(
      getOrUploadMedia({
        mediaUrl: 'http://x/a.mp4',
        queryResult: {
          queryInfo,
          hits: [{ similarity: 1, entry: storedEntry }],
        },
        user,
      })
    ).resolves.toBe(storedEntry);
    expect(mediaManager.insert).not.toHaveBeenCalled();
  });

  it('uploads when media manager only has other media', async () => {
    const uploadedEntry = { variants: [], getFile: jest.fn() };
    mediaManager.insert.mockImplementation(async (opts) => {
      setImmediate(() => opts.onUploadStop(null));
      return uploadedEntry;
    });

    await expect(
      getOrUploadMedia({
        mediaUrl: 'http://x/a.mp4',
        queryResult: {
          queryInfo,
          // A similar image, or an entry whose original file is not there yet
          hits: [
            { similarity: 0.9, entry: { id: 'video.other', variants: [] } },
            { similarity: 1, entry: { id: 'video.hash', variants: [] } },
          ],
        },
        user,
      })
    ).resolves.toBe(uploadedEntry);
    expect(mediaManager.insert.mock.calls[0][0].url).toBe('http://x/a.mp4');
  });

  it('requires a logged-in user to upload', async () => {
    await expect(
      getOrUploadMedia({
        mediaUrl: 'http://x/a.mp4',
        queryResult: { queryInfo, hits: [] },
      })
    ).rejects.toThrow('userId is not set via query string.');
    expect(mediaManager.insert).not.toHaveBeenCalled();
  });
});

describe('createTranscript (unit)', () => {
  /** An image media entry on GCS */
  const imageEntry = (href) => ({
    getFile: () => ({ cloudStorageURI: { href } }),
  });

  beforeEach(() => {
    mockDocumentTextDetection.mockReset();
    mockGenerateContent.mockReset();
    mediaManager.insert.mockReset();
  });

  it('throws when no user is given', async () => {
    await expect(
      createTranscript(
        { id: 'unit-nouser', type: 'image' },
        imageEntry('gs://b/a.jpg')
      )
    ).rejects.toThrow('[createTranscript] user is required');
  });

  it('returns the transcript made before, without generating', async () => {
    mockDocumentTextDetection.mockResolvedValue([{ fullTextAnnotation: null }]);
    const first = await transcribe(
      { id: 'unit-existing', type: 'image' },
      imageEntry('gs://bucket/existing.jpg'),
      user
    );
    // createAIResponse does not refresh the index; make it searchable.
    await client.indices.refresh({ index: 'airesponses' });
    mockDocumentTextDetection.mockClear();

    const second = await createTranscript(
      { id: 'unit-existing', type: 'image' },
      // Not even read: no file is needed for a transcript made before
      null,
      user
    );

    expect(second.id).toBe(first.id);
    expect(mockDocumentTextDetection).not.toHaveBeenCalled();
  });

  it('generates again when forced', async () => {
    mockDocumentTextDetection.mockResolvedValue([{ fullTextAnnotation: null }]);
    const first = await transcribe(
      { id: 'unit-forced', type: 'image' },
      imageEntry('gs://bucket/forced.jpg'),
      user
    );
    await client.indices.refresh({ index: 'airesponses' });

    const second = await transcribe(
      { id: 'unit-forced', type: 'image' },
      imageEntry('gs://bucket/forced.jpg'),
      user,
      { force: true }
    );

    expect(second.id).not.toBe(first.id);
    expect(mockDocumentTextDetection).toHaveBeenCalledTimes(2);
  });

  it('returns ERROR for unsupported types', async () => {
    const { status, text } = await transcribe(
      { id: 'unit-unsupported', type: 'file' },
      null,
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
        imageEntry('gs://bucket/img.jpg'),
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
        imageEntry('gs://bucket/blank.jpg'),
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
        imageEntry('gs://bucket/nopages.jpg'),
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
        imageEntry('gs://bucket/bad.jpg'),
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
        imageEntry('gs://bucket/bad2.jpg'),
        user
      );
      expect({ status, text }).toEqual({
        status: 'ERROR',
        text: 'Vision API error',
      });
    });
  });

  describe('audio / video transcript', () => {
    /** A media entry already on GCS; Vertex reads its gs:// URI directly. */
    const entryWith = (metadata) => ({
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

    it('reads the contentType from GCS metadata', async () => {
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

    it('falls back to a type default when the GCS metadata lacks a contentType', async () => {
      mockGenerateContent.mockResolvedValue(geminiReplies('ok'));

      await transcribe(
        { id: 'unit-av-nometadata', type: 'audio' },
        entryWith({}),
        user
      );

      expect(
        mockGenerateContent.mock.calls[0][0].contents[0].parts[0].fileData
          .mimeType
      ).toBe('audio/mpeg');
    });

    it('returns ERROR, without calling Vertex, when the file cannot be read', async () => {
      const { status, text } = await transcribe(
        { id: 'unit-av-nofile', type: 'video' },
        {
          getFile: () => ({
            getMetadata: async () => {
              throw new Error('No such object');
            },
            cloudStorageURI: { href: 'gs://bucket/missing.mp4' },
          }),
        },
        user
      );

      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(status).toBe('ERROR');
      expect(text).toContain('No such object');
    });

    it('falls back to the next model on 429 RESOURCE_EXHAUSTED', async () => {
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

    it('falls back to the next model on 404 NOT_FOUND (model retired)', async () => {
      mockGenerateContent
        .mockRejectedValueOnce(new Error('404 NOT_FOUND'))
        .mockResolvedValueOnce(geminiReplies('after retirement'));

      const { status, text } = await transcribe(
        { id: 'unit-av-404', type: 'video' },
        mediaEntry,
        user
      );

      expect({ status, text }).toEqual({
        status: 'SUCCESS',
        text: 'after retirement',
      });
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('returns ERROR without retrying on non-quota Gemini errors', async () => {
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
