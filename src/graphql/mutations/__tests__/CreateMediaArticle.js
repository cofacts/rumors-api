import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateMediaArticle';
import { getReplyRequestId } from '../CreateOrUpdateReplyRequest';
import mediaManager from 'util/mediaManager';

jest.mock('util/mediaManager');

describe('creation', () => {
  beforeAll(() => loadFixtures(fixtures));
  beforeEach(() => {
    mediaManager.insert.mockClear();
  });
  // beforeEach(() => {
  //   fetch.mockImplementation(() =>
  //     Promise.resolve({
  //       status: 200,
  //       body: {},
  //       buffer: jest.fn(),
  //     })
  //   );
  //   imageHash.mockImplementation((file, bits, method, callback) =>
  //     callback(undefined, 'mock_image_hash')
  //   );
  //   uploadToGCS.mockImplementation(() =>
  //     Promise.resolve('http://foo.com/output_image.jpeg')
  //   );
  // });
  afterAll(() => unloadFixtures(fixtures));

  it('creates a media article and a reply request', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'foo';

    mediaManager.insert.mockImplementationOnce(async () => ({
      id: 'mock_image_hash',
      url: 'http://foo.com/output_image.jpeg',
      type: 'image',
    }));

    const { data, errors } = await gql`
      mutation(
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
            "url": "http://foo.com/input_image.jpeg",
          },
        ],
      ]
    `);

    const {
      body: { _source: article },
    } = await client.get({
      index: 'articles',
      type: 'doc',
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
        "tags": Array [],
        "text": "",
        "updatedAt": "2017-01-28T08:45:57.011Z",
        "userId": "test",
      }
    `);

    const replyRequestId = getReplyRequestId({
      articleId: data.CreateMediaArticle.id,
      userId,
      appId,
    });

    const {
      body: { _source: replyRequest },
    } = await client.get({
      index: 'replyrequests',
      type: 'doc',
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

    // // Cleanup
    await client.delete({
      index: 'articles',
      type: 'doc',
      id: data.CreateMediaArticle.id,
    });

    await client.delete({
      index: 'replyrequests',
      type: 'doc',
      id: replyRequestId,
    });
  });

  it('avoids creating duplicated media articles and adds replyRequests automatically', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'foo';

    mediaManager.insert.mockImplementationOnce(async () => ({
      // Duplicate hash
      id: fixtures['/articles/doc/image1'].attachmentHash,
      url: fixtures['/articles/doc/image1'].attachmentUrl,
      type: 'image',
    }));

    const { data, errors } = await gql`
      mutation(
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

    const articleId = data.CreateMediaArticle.id;
    const {
      body: { _source: article },
    } = await client.get({
      index: 'articles',
      type: 'doc',
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
    const {
      body: { _source: replyRequest },
    } = await client.get({
      index: 'replyrequests',
      type: 'doc',
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
      type: 'doc',
      id: replyRequestId,
    });
  });
});

describe('error', () => {
  beforeEach(() => {
    fetch.mockImplementation(() =>
      Promise.resolve({
        status: 200,
        body: {},
        buffer: jest.fn(),
      })
    );
    imageHash.mockImplementation((file, bits, method, callback) =>
      callback(undefined, 'mock_image_hash')
    );
    uploadToGCS.mockImplementation(() =>
      Promise.resolve('http://foo.com/output_image.jpeg')
    );
  });

  it('throws type error', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'foo';

    const { errors } = await gql`
      mutation(
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
        articleType: 'AUDIO',
        reference: { type: 'LINE' },
      },
      { user: { id: userId, appId } }
    );
    MockDate.reset();

    expect(errors).toMatchInlineSnapshot(`
      Array [
        [GraphQLError: Type AUDIO is not yet supported.],
      ]
    `);
  });

  it('throws imageHash error', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'foo';
    imageHash.mockImplementation((file, bits, method, callback) =>
      callback('ImageHash error', 'mock_image_hash')
    );

    const { errors } = await gql`
      mutation(
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

    expect(errors).toMatchInlineSnapshot(`
      Array [
        [GraphQLError: Unexpected error value: "ImageHash error"],
      ]
    `);
  });

  it('throws uploadToGCS error', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'foo';
    uploadToGCS.mockImplementation(() => Promise.reject('UploadToGCS error'));

    const { errors } = await gql`
      mutation(
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

    expect(errors).toMatchInlineSnapshot(`
      Array [
        [GraphQLError: Unexpected error value: "UploadToGCS error"],
      ]
    `);
  });
});
