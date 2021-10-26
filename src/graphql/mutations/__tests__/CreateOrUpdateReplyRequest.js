import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import { getReplyRequestId } from '../CreateOrUpdateReplyRequest';
import fixtures from '../__fixtures__/CreateOrUpdateReplyRequest';

describe('CreateOrUpdateReplyRequest', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('attaches a reply request to an article', async () => {
    MockDate.set(1485593157011);
    const articleId = 'createReplyRequestTest1';
    const userId = 'test';
    const appId = 'test';

    const { data, errors } = await gql`
      mutation($articleId: String!) {
        CreateOrUpdateReplyRequest(
          articleId: $articleId
          reason: "気になります"
        ) {
          id
          replyRequestCount
          replyRequests {
            userId
            reason
          }
          requestedForReply
        }
      }
    `(
      {
        articleId,
      },
      { user: { id: userId, appId } }
    );
    MockDate.reset();
    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const id = getReplyRequestId({ articleId, userId, appId });
    const { body: request } = await client.get({
      index: 'replyrequests',
      type: 'doc',
      id,
    });
    expect(request._source).toMatchInlineSnapshot(`
      Object {
        "appId": "test",
        "articleId": "createReplyRequestTest1",
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

    const { body: article } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(article._source).toMatchInlineSnapshot(`
      Object {
        "lastRequestedAt": "2017-01-28T08:45:57.011Z",
        "replyRequestCount": 2,
        "text": "foofoo",
      }
    `);

    // Cleanup
    await client.delete({ index: 'replyrequests', type: 'doc', id });
    await resetFrom(fixtures, `/articles/doc/${articleId}`);
  });

  it('can update reason of a previously submitted reply request', async () => {
    MockDate.set(1485593157011);
    const articleId = 'createReplyRequestTest1';
    const userId = 'test';
    const appId = 'test';

    await gql`
      mutation($articleId: String!) {
        CreateOrUpdateReplyRequest(articleId: $articleId) {
          replyRequestCount
        }
      }
    `({ articleId }, { user: { id: userId, appId } });

    MockDate.set(1485593257011);

    const { data, errors } = await gql`
      mutation($articleId: String!) {
        CreateOrUpdateReplyRequest(
          articleId: $articleId
          reason: "New reason"
        ) {
          id
          replyRequestCount
          replyRequests {
            userId
            reason
          }
          requestedForReply
        }
      }
    `({ articleId }, { user: { id: userId, appId } });

    MockDate.reset();

    const id = getReplyRequestId({ articleId, userId, appId });
    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const { body: conn } = await client.get({
      index: 'replyrequests',
      type: 'doc',
      id,
    });
    expect(conn._source).toMatchInlineSnapshot(`
      Object {
        "appId": "test",
        "articleId": "createReplyRequestTest1",
        "createdAt": "2017-01-28T08:45:57.011Z",
        "feedbacks": Array [],
        "negativeFeedbackCount": 0,
        "positiveFeedbackCount": 0,
        "reason": "New reason",
        "status": "NORMAL",
        "updatedAt": "2017-01-28T08:47:37.011Z",
        "userId": "test",
      }
    `);

    const { body: article } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(article._source).toMatchInlineSnapshot(`
      Object {
        "lastRequestedAt": "2017-01-28T08:47:37.011Z",
        "replyRequestCount": 2,
        "text": "foofoo",
      }
    `);

    // Cleanup
    await client.delete({ index: 'replyrequests', type: 'doc', id });
    await resetFrom(fixtures, `/articles/doc/${articleId}`);
  });

  it('inserts blocked reply request without updating article count', async () => {
    MockDate.set(1485593157011);
    const articleId = 'createReplyRequestTest1';
    const userId = 'iAmBlocked';
    const appId = 'test';

    const { data, errors } = await gql`
      mutation($articleId: String!) {
        CreateOrUpdateReplyRequest(
          articleId: $articleId
          reason: "Some unwelcomed ads here"
        ) {
          id
          replyRequestCount
          replyRequests {
            userId
            reason
          }
          requestedForReply
        }
      }
    `(
      {
        articleId,
      },
      {
        user: {
          id: userId,
          appId,
          blockedReason: 'announcement-url',
        },
      }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const id = getReplyRequestId({ articleId, userId, appId });
    const { body: request } = await client.get({
      index: 'replyrequests',
      type: 'doc',
      id,
    });

    // Expect a reply request with status being BLOCKED
    expect(request._source).toMatchInlineSnapshot(`
      Object {
        "appId": "test",
        "articleId": "createReplyRequestTest1",
        "createdAt": "2017-01-28T08:45:57.011Z",
        "feedbacks": Array [],
        "negativeFeedbackCount": 0,
        "positiveFeedbackCount": 0,
        "reason": "Some unwelcomed ads here",
        "status": "BLOCKED",
        "updatedAt": "2017-01-28T08:45:57.011Z",
        "userId": "iAmBlocked",
      }
    `);

    const { body: article } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });

    // Expect reply reqeust count remains 1
    expect(article._source).toMatchInlineSnapshot(`
      Object {
        "lastRequestedAt": "1970-01-01T00:00:00.000Z",
        "replyRequestCount": 1,
        "text": "foofoo",
      }
    `);

    // Cleanup
    await client.delete({ index: 'replyrequests', type: 'doc', id });
    await resetFrom(fixtures, `/articles/doc/${articleId}`);
  });

  afterAll(() => unloadFixtures(fixtures));
});
