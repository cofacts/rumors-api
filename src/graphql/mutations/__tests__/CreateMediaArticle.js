import Y from 'yjs';
import MockDate from 'mockdate';

import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import fixtures from '../__fixtures__/CreateMediaArticle';
import { getReplyRequestId } from '../CreateOrUpdateReplyRequest';
import mediaManager from 'util/mediaManager';
import archiveUrlsFromText from 'util/archiveUrlsFromText';
import { createMediaEmbedding } from 'util/embedding';
import { createTranscript } from 'graphql/util';

jest.mock('util/mediaManager');
jest.mock('util/archiveUrlsFromText', () => jest.fn(() => []));

// Just mock createTranscript, keep others normal
jest.mock('graphql/util', () => ({
  __esModule: true,
  ...jest.requireActual('../../util'),
  createTranscript: jest.fn(),
}));
jest.mock('util/embedding', () => ({
  createMediaEmbedding: jest
    .fn()
    .mockResolvedValue([{ vector: new Array(768).fill(0.01) }]),
  getReplyEmbeddingCacheId: (text, ref) => `reply:${text}:${ref || ''}`,
  getQueryEmbeddingCacheId: (text) => `query-text:${text}`,
}));

// Minimal MediaEntry shape for tests. CreateMediaArticle only passes it on to
// transcript and embedding, and does not read its file by itself.
const mockMediaEntry = ({ id, url, type }) => ({
  id,
  url,
  type,
  variants: [],
  getFile: jest.fn(),
});

/** Makes the next mediaManager.query() report whether the media is stored */
function mockQuery(mediaEntry, { isStored }) {
  mediaManager.query.mockResolvedValueOnce({
    queryInfo: { id: mediaEntry.id, type: mediaEntry.type },
    hits: isStored
      ? [
          {
            similarity: 1,
            entry: { ...mediaEntry, variants: ['original'] },
          },
        ]
      : [],
  });
}

/**
 * Media manager does not have the media yet: the next mediaManager.insert()
 * resolves to the media entry, and reports that its upload has completed
 * afterwards.
 */
function mockInsert(mediaEntry) {
  mockQuery(mediaEntry, { isStored: false });
  mediaManager.insert.mockImplementationOnce(async ({ onUploadStop }) => {
    setImmediate(() => onUploadStop(null));
    return mediaEntry;
  });
  return mediaEntry;
}

describe('creation', () => {
  beforeAll(() => loadFixtures(fixtures));
  beforeEach(() => {
    mediaManager.insert.mockReset();
    mediaManager.query.mockReset();
    archiveUrlsFromText.mockClear();
    createMediaEmbedding.mockClear();
    createTranscript.mockReset();
  });
  afterAll(() => unloadFixtures(fixtures));

  it('creates a media article, a reply request, a ydoc and fills in OCR result', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'foo';

    // The real one: returns the transcript made when the media was searched
    // (see fixtures), without generating.
    createTranscript.mockImplementationOnce(
      jest.requireActual('../../util').createTranscript
    );
    mockInsert(
      mockMediaEntry({
        id: 'mock_image_hash',
        url: 'http://foo.com/output_image.jpeg',
        type: 'image',
      })
    );

    const { data, errors } = await gql`
      mutation (
        $mediaUrl: String!
        $articleType: ArticleTypeEnum!
        $reference: ArticleReferenceInput!
      ) {
        CreateMediaArticle(
          mediaUrl: $mediaUrl
          articleType: $articleType
          reference: $reference
          reason: "気になります"
        ) {
          id
        }
      }
    `(
      {
        mediaUrl: 'http://foo.com/input_image.jpeg',
        articleType: 'IMAGE',
        reference: { type: 'LINE' },
      },
      { user: { id: userId, appId } }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();

    // Expect calls to insert() to match snapshot
    expect(mediaManager.insert.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          Object {
            "getVariantSettings": [Function],
            "onUploadStop": [Function],
            "url": "http://foo.com/input_image.jpeg",
          },
        ],
      ]
    `);

    // Expect archiveUrlsFromText is called with OCR result
    expect(archiveUrlsFromText.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "OCR result of output image",
        ],
      ]
    `);

    const { _source: article } = await client.get({
      index: 'articles',
      id: data.CreateMediaArticle.id,
    });

    expect(article.replyRequestCount).toBe(1);
    expect(article).toMatchInlineSnapshot(`
      Object {
        "appId": "foo",
        "articleCategories": Array [],
        "articleReplies": Array [],
        "articleType": "IMAGE",
        "attachmentHash": "mock_image_hash",
        "contributors": Array [],
        "createdAt": "2017-01-28T08:45:57.011Z",
        "hyperlinks": Array [],
        "lastRequestedAt": "2017-01-28T08:45:57.011Z",
        "normalArticleCategoryCount": 0,
        "normalArticleReplyCount": 0,
        "references": Array [
          Object {
            "appId": "foo",
            "createdAt": "2017-01-28T08:45:57.011Z",
            "type": "LINE",
            "userId": "test",
          },
        ],
        "replyRequestCount": 1,
        "status": "NORMAL",
        "text": "OCR result of output image",
        "updatedAt": "2017-01-28T08:45:57.011Z",
        "userId": "test",
      }
    `);

    // Embeddings excluded from default _source in ES 9; verify via includes.
    const { _source: withEmb } = await client.get({
      index: 'articles',
      id: data.CreateMediaArticle.id,
      _source_includes: ['embeddings'],
    });
    expect(withEmb.embeddings?.[0]?.vector?.length).toBe(768);

    const replyRequestId = getReplyRequestId({
      articleId: data.CreateMediaArticle.id,
      userId,
      appId,
    });

    const { _source: replyRequest } = await client.get({
      index: 'replyrequests',
      id: replyRequestId,
    });

    delete replyRequest.articleId; // articleId is random
    expect(replyRequest).toMatchInlineSnapshot(`
      Object {
        "appId": "foo",
        "createdAt": "2017-01-28T08:45:57.011Z",
        "feedbacks": Array [],
        "negativeFeedbackCount": 0,
        "positiveFeedbackCount": 0,
        "reason": "気になります",
        "status": "NORMAL",
        "updatedAt": "2017-01-28T08:45:57.011Z",
        "userId": "test",
      }
    `);

    const {
      _source: { ydoc: encodedYdoc, versions },
    } = await client.get({
      index: 'ydocs',
      id: data.CreateMediaArticle.id,
    });

    // Expect ydoc in Elasticsearch to contain prosemirror, user and snapshot versions
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, Buffer.from(encodedYdoc, 'base64'));
    expect(ydoc.getXmlFragment('prosemirror')).toMatchInlineSnapshot(
      `"<paragraph>OCR result of output image</paragraph>"`
    );
    expect(Object.keys(ydoc.getMap('users').toJSON())).toMatchInlineSnapshot(`
      Array [
        "{\\"id\\":\\"ai-transcript\\",\\"appId\\":\\"RUMORS_AI\\",\\"name\\":\\"AI Transcript\\"}",
      ]
    `);
    expect(versions[0].createdAt).toMatchInlineSnapshot(
      `"2017-01-28T08:45:57.011Z"`
    );

    // Cleanup
    await client.delete({
      index: 'articles',
      id: data.CreateMediaArticle.id,
    });

    await client.delete({
      index: 'replyrequests',
      id: replyRequestId,
    });

    await client.delete({
      index: 'ydocs',
      id: data.CreateMediaArticle.id,
    });
  });

  it('embeds AUDIO articles from the uploaded media entry', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'foo';

    const mediaEntry = mockInsert(
      mockMediaEntry({
        id: 'mock_audio_hash',
        url: 'http://foo.com/output_audio.mp3',
        type: 'audio',
      })
    );

    const { data, errors } = await gql`
      mutation (
        $mediaUrl: String!
        $articleType: ArticleTypeEnum!
        $reference: ArticleReferenceInput!
      ) {
        CreateMediaArticle(
          mediaUrl: $mediaUrl
          articleType: $articleType
          reference: $reference
        ) {
          id
        }
      }
    `(
      {
        mediaUrl: 'http://foo.com/input_audio.mp3',
        articleType: 'AUDIO',
        reference: { type: 'LINE' },
      },
      { user: { id: userId, appId } }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();

    expect(createMediaEmbedding).toHaveBeenCalledTimes(1);
    expect(createMediaEmbedding).toHaveBeenCalledWith(
      { id: 'mock_audio_hash', type: 'audio' },
      mediaEntry,
      { id: userId, appId }
    );

    // The resulting vector is stored on the article.
    const { _source: withEmb } = await client.get({
      index: 'articles',
      id: data.CreateMediaArticle.id,
      _source_includes: ['embeddings'],
    });
    expect(withEmb.embeddings?.[0]?.vector?.length).toBe(768);

    const replyRequestId = getReplyRequestId({
      articleId: data.CreateMediaArticle.id,
      userId,
      appId,
    });

    // Cleanup
    await client.delete({
      index: 'articles',
      id: data.CreateMediaArticle.id,
    });
    await client.delete({
      index: 'replyrequests',
      id: replyRequestId,
    });
  });

  it('waits for the upload, then generates the transcript and embedding of a new media', async () => {
    const userId = 'test';
    const appId = 'foo';

    const mediaEntry = mockMediaEntry({
      id: 'mock_video_hash',
      url: 'http://foo.com/output_video.mp4',
      type: 'video',
    });
    let isUploaded = false;
    mockQuery(mediaEntry, { isStored: false });
    mediaManager.insert.mockImplementationOnce(async ({ onUploadStop }) => {
      setTimeout(() => {
        isUploaded = true;
        onUploadStop(null);
      }, 50);
      return mediaEntry;
    });

    // Both read the file, thus must not start before the upload completes.
    createTranscript.mockImplementationOnce(async () => {
      expect(isUploaded).toBe(true);
      return { id: 'new-transcript', status: 'SUCCESS', text: 'spoken words' };
    });
    createMediaEmbedding.mockImplementationOnce(async () => {
      expect(isUploaded).toBe(true);
      return [{ vector: new Array(768).fill(0.02) }];
    });

    const { data, errors } = await gql`
      mutation (
        $mediaUrl: String!
        $articleType: ArticleTypeEnum!
        $reference: ArticleReferenceInput!
      ) {
        CreateMediaArticle(
          mediaUrl: $mediaUrl
          articleType: $articleType
          reference: $reference
        ) {
          id
        }
      }
    `(
      {
        mediaUrl: 'http://foo.com/input_video.mp4',
        articleType: 'VIDEO',
        reference: { type: 'LINE' },
      },
      { user: { id: userId, appId } }
    );

    expect(errors).toBeUndefined();

    // Both get the same media entry.
    expect(createTranscript).toHaveBeenCalledTimes(1);
    expect(createTranscript).toHaveBeenCalledWith(
      { id: 'mock_video_hash', type: 'video' },
      mediaEntry,
      { id: userId, appId }
    );
    expect(createMediaEmbedding).toHaveBeenCalledTimes(1);
    expect(createMediaEmbedding).toHaveBeenCalledWith(
      { id: 'mock_video_hash', type: 'video' },
      mediaEntry,
      { id: userId, appId }
    );

    const articleId = data.CreateMediaArticle.id;
    const { _source: article } = await client.get({
      index: 'articles',
      id: articleId,
      _source_includes: ['text', 'embeddings'],
    });
    expect(article.text).toBe('spoken words');
    expect(article.embeddings?.[0]?.vector?.length).toBe(768);

    // Cleanup
    await client.delete({ index: 'articles', id: articleId });
    await client.delete({ index: 'ydocs', id: articleId });
    await client.delete({
      index: 'replyrequests',
      id: getReplyRequestId({ articleId, userId, appId }),
    });
  });

  it('uploads nothing when media manager already has the file', async () => {
    const userId = 'test';
    const appId = 'foo';

    // E.g. the media has been searched before submission.
    mockQuery(
      mockMediaEntry({
        id: 'mock_stored_audio_hash',
        url: 'http://foo.com/stored_audio.mp3',
        type: 'audio',
      }),
      { isStored: true }
    );
    createTranscript.mockResolvedValueOnce({
      id: 'new-transcript',
      status: 'SUCCESS',
      text: 'stored words',
    });

    const { data, errors } = await gql`
      mutation (
        $mediaUrl: String!
        $articleType: ArticleTypeEnum!
        $reference: ArticleReferenceInput!
      ) {
        CreateMediaArticle(
          mediaUrl: $mediaUrl
          articleType: $articleType
          reference: $reference
        ) {
          id
        }
      }
    `(
      {
        mediaUrl: 'http://foo.com/input_audio.mp3',
        articleType: 'AUDIO',
        reference: { type: 'LINE' },
      },
      { user: { id: userId, appId } }
    );

    expect(errors).toBeUndefined();
    expect(mediaManager.insert).not.toHaveBeenCalled();

    // Transcript and embedding get the stored media entry.
    expect(createTranscript.mock.calls[0][1].id).toBe('mock_stored_audio_hash');
    expect(createMediaEmbedding.mock.calls[0][1].id).toBe(
      'mock_stored_audio_hash'
    );

    const articleId = data.CreateMediaArticle.id;
    const { _source: article } = await client.get({
      index: 'articles',
      id: articleId,
      _source_includes: ['text', 'attachmentHash', 'embeddings'],
    });
    expect(article.attachmentHash).toBe('mock_stored_audio_hash');
    expect(article.text).toBe('stored words');
    expect(article.embeddings?.[0]?.vector?.length).toBe(768);

    // Cleanup
    await client.delete({ index: 'articles', id: articleId });
    await client.delete({ index: 'ydocs', id: articleId });
    await client.delete({
      index: 'replyrequests',
      id: getReplyRequestId({ articleId, userId, appId }),
    });
  });

  it('rejects when the article type does not match the media file', async () => {
    const userId = 'test';
    const appId = 'foo';

    mockQuery({ id: 'mock_audio_hash_2', type: 'audio' }, { isStored: true });

    const { errors } = await gql`
      mutation (
        $mediaUrl: String!
        $articleType: ArticleTypeEnum!
        $reference: ArticleReferenceInput!
      ) {
        CreateMediaArticle(
          mediaUrl: $mediaUrl
          articleType: $articleType
          reference: $reference
        ) {
          id
        }
      }
    `(
      {
        mediaUrl: 'http://foo.com/input_audio.mp3',
        articleType: 'IMAGE',
        reference: { type: 'LINE' },
      },
      { user: { id: userId, appId } }
    );

    expect(errors).toMatchInlineSnapshot(`
      Array [
        [GraphQLError: Specified article type is "IMAGE", but the media file is a audio.],
      ]
    `);
    expect(mediaManager.insert).not.toHaveBeenCalled();
  });

  it('creates the article without text when the transcript fails', async () => {
    const userId = 'test';
    const appId = 'foo';

    mockInsert(
      mockMediaEntry({
        id: 'mock_image_hash_no_transcript',
        url: 'http://foo.com/output_image2.jpeg',
        type: 'image',
      })
    );
    createTranscript.mockResolvedValueOnce({
      id: 'failed-transcript',
      status: 'ERROR',
      text: 'Error: Vision API error',
    });

    const { data, errors } = await gql`
      mutation (
        $mediaUrl: String!
        $articleType: ArticleTypeEnum!
        $reference: ArticleReferenceInput!
      ) {
        CreateMediaArticle(
          mediaUrl: $mediaUrl
          articleType: $articleType
          reference: $reference
        ) {
          id
        }
      }
    `(
      {
        mediaUrl: 'http://foo.com/input_image2.jpeg',
        articleType: 'IMAGE',
        reference: { type: 'LINE' },
      },
      { user: { id: userId, appId } }
    );

    expect(errors).toBeUndefined();
    expect(createTranscript).toHaveBeenCalledTimes(1);

    const articleId = data.CreateMediaArticle.id;
    const { _source: article } = await client.get({
      index: 'articles',
      id: articleId,
    });
    // The error message must not end up as the article text.
    expect(article.text).toBe('');
    expect(archiveUrlsFromText).not.toHaveBeenCalled();

    // Cleanup
    await client.delete({ index: 'articles', id: articleId });
    await client.delete({
      index: 'replyrequests',
      id: getReplyRequestId({ articleId, userId, appId }),
    });
  });

  it('avoids creating duplicated media articles and adds replyRequests automatically', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'foo';

    mockInsert(
      mockMediaEntry({
        // Duplicate hash
        id: fixtures['/articles/doc/image1'].attachmentHash,
        url: fixtures['/articles/doc/image1'].attachmentUrl,
        type: 'image',
      })
    );

    const { data, errors } = await gql`
      mutation (
        $mediaUrl: String!
        $articleType: ArticleTypeEnum!
        $reference: ArticleReferenceInput!
      ) {
        CreateMediaArticle(
          mediaUrl: $mediaUrl
          articleType: $articleType
          reference: $reference
          reason: "気になります"
        ) {
          id
        }
      }
    `(
      {
        mediaUrl: 'http://foo.com/input_image.jpeg',
        articleType: 'IMAGE',
        reference: { type: 'LINE' },
      },
      { user: { id: userId, appId } }
    );
    MockDate.reset();
    expect(errors).toBeUndefined();

    // Expects no new article is created,
    // and it returns the existing ID
    expect(data.CreateMediaArticle.id).toBe('image1');

    // An existing article is neither transcribed nor embedded again.
    expect(createTranscript).not.toHaveBeenCalled();
    expect(createMediaEmbedding).not.toHaveBeenCalled();

    const articleId = data.CreateMediaArticle.id;
    const { _source: article } = await client.get({
      index: 'articles',
      id: articleId,
    });

    // Expects lastRequestedAt, references are updated
    expect(article).toMatchInlineSnapshot(`
      Object {
        "attachmentHash": "ffff8000",
        "attachmentUrl": "http://foo/image.jpeg",
        "lastRequestedAt": "2017-01-28T08:45:57.011Z",
        "references": Array [
          Object {
            "type": "LINE",
          },
        ],
        "replyRequestCount": 2,
        "text": "",
      }
    `);

    // Expects new replyRequest is generated
    const replyRequestId = getReplyRequestId({ articleId, appId, userId });
    const { _source: replyRequest } = await client.get({
      index: 'replyrequests',
      id: replyRequestId,
    });

    expect(replyRequest).toMatchInlineSnapshot(`
      Object {
        "appId": "foo",
        "articleId": "image1",
        "createdAt": "2017-01-28T08:45:57.011Z",
        "feedbacks": Array [],
        "negativeFeedbackCount": 0,
        "positiveFeedbackCount": 0,
        "reason": "気になります",
        "status": "NORMAL",
        "updatedAt": "2017-01-28T08:45:57.011Z",
        "userId": "test",
      }
    `);

    // Cleanup
    await client.delete({
      index: 'replyrequests',
      id: replyRequestId,
    });
  });

  it('shows mediaManager error', async () => {
    const userId = 'test';
    const appId = 'foo';

    mockQuery({ id: 'mock_image_hash', type: 'image' }, { isStored: false });
    mediaManager.insert.mockImplementationOnce(async () => {
      throw new Error('Some MediaManager error');
    });

    const { errors } = await gql`
      mutation (
        $mediaUrl: String!
        $articleType: ArticleTypeEnum!
        $reference: ArticleReferenceInput!
      ) {
        CreateMediaArticle(
          mediaUrl: $mediaUrl
          articleType: $articleType
          reference: $reference
          reason: "気になります"
        ) {
          id
        }
      }
    `(
      {
        mediaUrl: 'http://foo.com/input_image.jpeg',
        articleType: 'IMAGE',
        reference: { type: 'LINE' },
      },
      { user: { id: userId, appId } }
    );

    expect(errors).toMatchInlineSnapshot(`
      Array [
        [GraphQLError: Some MediaManager error],
      ]
    `);
  });

  it('sets status to blocked when author is blocked', async () => {
    MockDate.set(1485593157011);
    const userId = 'iAmSpammer';
    const appId = 'foo';

    mockInsert(
      mockMediaEntry({
        id: 'mock_image_hash_spam',
        url: 'http://foo.com/output_image_spam.jpeg',
        type: 'image',
      })
    );

    const { data } = await gql`
      mutation (
        $mediaUrl: String!
        $articleType: ArticleTypeEnum!
        $reference: ArticleReferenceInput!
      ) {
        CreateMediaArticle(
          mediaUrl: $mediaUrl
          articleType: $articleType
          reference: $reference
          reason: ""
        ) {
          id
        }
      }
    `(
      {
        mediaUrl: 'http://foo.com/input_image_spam.jpeg',
        articleType: 'IMAGE',
        reference: { type: 'LINE' },
      },
      { user: { id: userId, appId, blockedReason: 'announcement-url' } }
    );
    MockDate.reset();

    const { _source: article } = await client.get({
      index: 'articles',
      id: data.CreateMediaArticle.id,
    });

    expect(article).toHaveProperty('status', 'BLOCKED');

    const replyRequestId = getReplyRequestId({
      articleId: data.CreateMediaArticle.id,
      userId,
      appId,
    });

    const { _source: replyRequest } = await client.get({
      index: 'replyrequests',
      id: replyRequestId,
    });

    expect(replyRequest).toHaveProperty('status', 'BLOCKED');

    // // Cleanup
    await client.delete({
      index: 'articles',
      id: data.CreateMediaArticle.id,
    });

    await client.delete({
      index: 'replyrequests',
      id: replyRequestId,
    });
  });
});
