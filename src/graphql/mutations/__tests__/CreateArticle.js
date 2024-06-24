import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures, { fixture1Text } from '../__fixtures__/CreateArticle';
import { getReplyRequestId } from '../CreateOrUpdateReplyRequest';
import { getArticleId } from 'graphql/mutations/CreateArticle';

describe('creation', () => {
  beforeEach(() => loadFixtures(fixtures));
  afterEach(() => unloadFixtures(fixtures));

  it('creates articles and a reply request and fills in URLs', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'foo';

    const { data, errors } = await gql`
      mutation ($text: String!, $reference: ArticleReferenceInput!) {
        CreateArticle(
          text: $text
          reference: $reference
          reason: "気になります"
        ) {
          id
        }
      }
    `(
      {
        text: 'FOO FOO http://foo.com/article/1',
        reference: { type: 'LINE' },
      },
      { user: { id: userId, appId } }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();

    const {
      body: { _source: article },
    } = await client.get({
      index: 'articles',
      type: 'doc',
      id: data.CreateArticle.id,
    });

    expect(article.replyRequestCount).toBe(1);
    expect(article).toMatchSnapshot();

    const replyRequestId = getReplyRequestId({
      articleId: data.CreateArticle.id,
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

    expect(replyRequest).toMatchInlineSnapshot(`
      Object {
        "appId": "foo",
        "articleId": "y0iq3fr2pqgi",
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
      index: 'articles',
      type: 'doc',
      id: data.CreateArticle.id,
    });

    await client.delete({
      index: 'replyrequests',
      type: 'doc',
      id: replyRequestId,
    });
  });

  it('avoids creating duplicated articles and adds replyRequests automatically', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'foo';
    const articleId = getArticleId(fixture1Text);

    const { data, errors } = await gql`
      mutation ($text: String!, $reference: ArticleReferenceInput!) {
        CreateArticle(
          text: $text
          reference: $reference
          reason: "気になります"
        ) {
          id
        }
      }
    `(
      {
        text: fixture1Text,
        reference: { type: 'LINE' },
      },
      { user: { id: userId, appId } }
    );
    MockDate.reset();
    expect(errors).toBeUndefined();

    // Expects no new article is created,
    // and it returns the existing ID
    expect(data.CreateArticle.id).toBe(articleId);

    const {
      body: { _source: article },
    } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });

    // Expects lastRequestedAt, references are updated
    expect(article).toMatchSnapshot();

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
        "articleId": "20xz7y20qzyt6",
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

  it('sets status to blocked when author is blocked', async () => {
    MockDate.set(1485593157011);

    const userId = 'iAmBlocked';
    const appId = 'foo';
    const { data } = await gql`
      mutation ($text: String!, $reference: ArticleReferenceInput!) {
        CreateArticle(text: $text, reference: $reference, reason: "") {
          id
        }
      }
    `(
      {
        text: 'This is a scam (and I am actually scam too)',
        reference: { type: 'LINE' },
      },
      {
        user: {
          id: userId,
          appId,
          blockedReason: 'Announcement url',
        },
      }
    );
    MockDate.reset();

    const {
      body: { _source: article },
    } = await client.get({
      index: 'articles',
      type: 'doc',
      id: data.CreateArticle.id,
    });

    expect(article).toHaveProperty('status', 'BLOCKED');

    const replyRequestId = getReplyRequestId({
      articleId: data.CreateArticle.id,
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

    expect(replyRequest).toHaveProperty('status', 'BLOCKED');

    // Cleanup
    await client.delete({
      index: 'articles',
      type: 'doc',
      id: data.CreateArticle.id,
    });

    await client.delete({
      index: 'replyrequests',
      type: 'doc',
      id: replyRequestId,
    });
  });
});

const testId = async (userId, appId) => {
  MockDate.set(1485593157011);
  const { errors } = await gql`
    mutation ($text: String!, $reference: ArticleReferenceInput!) {
      CreateArticle(
        text: $text
        reference: $reference
        reason: "気になります"
      ) {
        id
      }
    }
  `(
    {
      text: 'FOO FOO',
      reference: { type: 'LINE' },
    },
    { user: { id: userId, appId } }
  );
  MockDate.reset();
  expect(errors).toMatchSnapshot();
};

it('fails with an invalid user id', () => testId('', ''));
it('fails with an invalid app id', () => testId('test', ''));
