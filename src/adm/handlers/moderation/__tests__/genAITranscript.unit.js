/**
 * Mocked unit tests for genAITranscript. Unlike genAITranscript.js (which hits
 * real GCS/Vision/Gemini and only runs in the integration workflow), this file
 * mocks the media + transcription layer so the handler's orchestration logic
 * (skip/error/success branches) is covered on every CI run with no API cost.
 */
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import mediaManager from 'util/mediaManager';
import { createTranscript, getAIResponse } from 'graphql/util';
import { writeAITranscript } from 'graphql/mutations/CreateMediaArticle';
import genAITranscript from '../genAITranscript';

jest.mock('util/mediaManager', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock('graphql/util', () => ({
  createTranscript: jest.fn(),
  getAIResponse: jest.fn(),
}));
jest.mock('graphql/mutations/CreateMediaArticle', () => ({
  writeAITranscript: jest.fn(),
}));

const fixtures = {
  '/articles/doc/media-no-text': {
    text: '',
    attachmentHash: 'hash-no-text',
    articleType: 'IMAGE',
  },
  '/articles/doc/media-with-text': {
    text: 'already transcribed',
    attachmentHash: 'hash-with-text',
    articleType: 'IMAGE',
  },
  '/articles/doc/text-only': {
    text: 'a plain text article',
    articleType: 'TEXT',
  },
};

describe('genAITranscript (unit)', () => {
  beforeAll(async () => {
    await loadFixtures(fixtures);
  });
  afterAll(async () => {
    await unloadFixtures(fixtures);
  });
  beforeEach(() => {
    mediaManager.get.mockReset();
    createTranscript.mockReset();
    getAIResponse.mockReset();
    writeAITranscript.mockReset();
  });

  it('returns empty result for empty articleIds', async () => {
    expect(await genAITranscript({ articleIds: [] })).toEqual({
      count: 0,
      results: [],
    });
    expect(await genAITranscript({ articleIds: undefined })).toEqual({
      count: 0,
      results: [],
    });
    expect(mediaManager.get).not.toHaveBeenCalled();
  });

  it('skips articles that are not found', async () => {
    const { count, results } = await genAITranscript({
      articleIds: ['does-not-exist'],
    });
    expect(count).toBe(0);
    expect(results[0]).toMatchObject({
      id: 'does-not-exist',
      status: 'SKIPPED',
      reason: 'Article not found',
    });
  });

  it('skips non-media articles', async () => {
    const { results } = await genAITranscript({ articleIds: ['text-only'] });
    expect(results[0]).toMatchObject({
      status: 'SKIPPED',
      reason: 'Not a media article',
    });
  });

  it('skips media articles that already have text', async () => {
    const { results } = await genAITranscript({
      articleIds: ['media-with-text'],
    });
    expect(results[0]).toMatchObject({
      status: 'SKIPPED',
      reason: 'Article already has text',
    });
    expect(createTranscript).not.toHaveBeenCalled();
  });

  it('skips when a successful AI transcript already exists', async () => {
    getAIResponse.mockResolvedValue({ status: 'SUCCESS', text: 'cached' });
    const { results } = await genAITranscript({
      articleIds: ['media-no-text'],
    });
    expect(getAIResponse).toHaveBeenCalledWith({
      type: 'TRANSCRIPT',
      docId: 'hash-no-text',
    });
    expect(results[0]).toMatchObject({
      status: 'SKIPPED',
      reason: 'Existing AI transcript found',
    });
  });

  it('skips when the media entry is missing', async () => {
    getAIResponse.mockResolvedValue(null);
    mediaManager.get.mockResolvedValue(null);
    const { results } = await genAITranscript({
      articleIds: ['media-no-text'],
    });
    expect(results[0]).toMatchObject({
      status: 'SKIPPED',
      reason: 'Media entry not found',
    });
  });

  it('transcribes and writes back on success', async () => {
    getAIResponse.mockResolvedValue(null);
    mediaManager.get.mockResolvedValue({ id: 'hash-no-text' });
    createTranscript.mockResolvedValue({ status: 'SUCCESS', text: 'hello' });

    const { count, results } = await genAITranscript({
      articleIds: ['media-no-text'],
    });

    expect(createTranscript).toHaveBeenCalledWith(
      { id: 'hash-no-text', type: 'image' },
      { id: 'hash-no-text' },
      expect.objectContaining({ appId: 'RUMORS_ADMIN' })
    );
    expect(writeAITranscript).toHaveBeenCalledWith('media-no-text', 'hello');
    expect(count).toBe(1);
    expect(results[0]).toEqual({ id: 'media-no-text', status: 'SUCCESS' });
  });

  it('reports ERROR when transcription fails', async () => {
    getAIResponse.mockResolvedValue(null);
    mediaManager.get.mockResolvedValue({ id: 'hash-no-text' });
    createTranscript.mockResolvedValue({ status: 'ERROR', text: 'boom' });

    const { count, results } = await genAITranscript({
      articleIds: ['media-no-text'],
    });
    expect(count).toBe(0);
    expect(results[0]).toMatchObject({ status: 'ERROR', reason: 'boom' });
    expect(writeAITranscript).not.toHaveBeenCalled();
  });

  it('reports ERROR when an exception is thrown', async () => {
    getAIResponse.mockResolvedValue(null);
    mediaManager.get.mockRejectedValue(new Error('network down'));

    const { results } = await genAITranscript({
      articleIds: ['media-no-text'],
    });
    expect(results[0]).toMatchObject({
      status: 'ERROR',
      reason: 'network down',
    });
  });

  it('bypasses skip checks when force is set', async () => {
    mediaManager.get.mockResolvedValue({ id: 'hash-with-text' });
    createTranscript.mockResolvedValue({ status: 'SUCCESS', text: 'forced' });

    const { results } = await genAITranscript({
      articleIds: ['media-with-text'],
      force: true,
    });

    expect(getAIResponse).not.toHaveBeenCalled();
    expect(results[0]).toEqual({ id: 'media-with-text', status: 'SUCCESS' });
    expect(writeAITranscript).toHaveBeenCalledWith('media-with-text', 'forced');
  });
});
