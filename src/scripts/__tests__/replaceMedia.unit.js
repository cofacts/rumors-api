/**
 * Mocked unit test for replaceMedia. The media layer (GCS via mediaManager and
 * uploadMedia) is mocked so the article-rewrite flow is covered with no API
 * cost; Elasticsearch is real.
 */
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import mediaManager from 'util/mediaManager';
import { uploadMedia } from 'graphql/util';
import replaceMedia from '../replaceMedia';

jest.mock('util/mediaManager', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock('graphql/util', () => ({ uploadMedia: jest.fn() }));

const fixtures = {
  '/articles/doc/replace-media-1': {
    attachmentHash: 'old-hash',
    articleType: 'IMAGE',
  },
};

describe('replaceMedia (unit)', () => {
  beforeEach(async () => {
    await loadFixtures(fixtures);
    mediaManager.get.mockReset();
    uploadMedia.mockReset();
  });
  afterEach(() => unloadFixtures(fixtures));

  it('deletes old variants, uploads new media, and updates the article hash', async () => {
    const del = jest.fn().mockResolvedValue(undefined);
    mediaManager.get.mockResolvedValue({
      id: 'old-hash',
      variants: ['original', 'thumbnail'],
      getFile: () => ({ delete: del }),
    });
    uploadMedia.mockResolvedValue({ id: 'new-hash' });

    await replaceMedia({
      articleId: 'replace-media-1',
      url: 'http://x/new.jpg',
    });

    // Old variants deleted
    expect(del).toHaveBeenCalledTimes(2);
    // New media uploaded with the article's type
    expect(uploadMedia).toHaveBeenCalledWith({
      mediaUrl: 'http://x/new.jpg',
      articleType: 'IMAGE',
    });

    await client.indices.refresh({ index: 'articles' });
    const { _source } = await client.get({
      index: 'articles',
      id: 'replace-media-1',
    });
    expect(_source.attachmentHash).toBe('new-hash');
  });

  it('still uploads when force is set and there is no old media entry', async () => {
    mediaManager.get.mockResolvedValue(null);
    uploadMedia.mockResolvedValue({ id: 'forced-hash' });

    await replaceMedia({
      articleId: 'replace-media-1',
      url: 'http://x/new.jpg',
      force: true,
    });

    expect(uploadMedia).toHaveBeenCalled();
    await client.indices.refresh({ index: 'articles' });
    const { _source } = await client.get({
      index: 'articles',
      id: 'replace-media-1',
    });
    expect(_source.attachmentHash).toBe('forced-hash');
  });
});
