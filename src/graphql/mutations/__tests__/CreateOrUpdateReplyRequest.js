import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import {
  getReplyRequestId,
  createOrUpdateReplyRequest,
} from '../CreateOrUpdateReplyRequest';
import fixtures from '../__fixtures__/CreateOrUpdateReplyRequest';

/** Drops the reply requests of an article and zeroes its counter. */
async function cleanUpConcurrentTest(articleId) {
  await client.deleteByQuery({
    index: 'replyrequests',
    query: { term: { articleId } },
    refresh: true,
  });
  await client.update({
    index: 'articles',
    id: articleId,
    doc: { replyRequestCount: 0 },
    refresh: 'true',
  });
}

describe('CreateOrUpdateReplyRequest', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('attaches a reply request to an article', async () => {
    MockDate.set(1485593157011);
    const articleId = 'createReplyRequestTest1';
    const userId = 'test';
    const appId = 'test';

    const { data, errors } = await gql`
      mutation ($articleId: String!) {
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
    const request = await client.get({
      index: 'replyrequests',
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

    const article = await client.get({
      index: 'articles',
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
    await client.delete({ index: 'replyrequests', id });
    await resetFrom(fixtures, `/articles/doc/${articleId}`);
  });

  it('can update reason of a previously submitted reply request', async () => {
    MockDate.set(1485593157011);
    const articleId = 'createReplyRequestTest1';
    const userId = 'test';
    const appId = 'test';

    await gql`
      mutation ($articleId: String!) {
        CreateOrUpdateReplyRequest(articleId: $articleId) {
          replyRequestCount
        }
      }
    `({ articleId }, { user: { id: userId, appId } });

    MockDate.set(1485593257011);

    const { data, errors } = await gql`
      mutation ($articleId: String!) {
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

    const conn = await client.get({
      index: 'replyrequests',
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

    const article = await client.get({
      index: 'articles',
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
    await client.delete({ index: 'replyrequests', id });
    await resetFrom(fixtures, `/articles/doc/${articleId}`);
  });

  it('increments replyRequestCount exactly once per concurrent requester', async () => {
    // The article update is a script update, and CreateMediaArticle fires
    // `writeAITranscript` against the same article in the same tick. Without
    // `retry_on_conflict`, concurrent updates collide on _seq_no and ES raises
    // version_conflict_engine_exception -- which is unhandled here, so it
    // surfaces as a failed mutation. Ten distinct users is enough to make the
    // collision reliable rather than occasional.
    const articleId = 'createReplyRequestConcurrent';
    const users = Array.from({ length: 10 }, (_, i) => ({
      id: `concurrent-user-${i}`,
      appId: 'test',
    }));

    // Only a first-time requester increments the counter, so start from a
    // clean slate -- otherwise a previous failed run leaves reply requests
    // behind and this passes vacuously.
    await cleanUpConcurrentTest(articleId);

    const results = await Promise.all(
      users.map((user) => createOrUpdateReplyRequest({ articleId, user }))
    );

    // Every call created a new reply request, so every call must have counted.
    expect(results.every(({ isCreated }) => isCreated)).toBe(true);

    const { _source } = await client.get({ index: 'articles', id: articleId });
    expect(_source.replyRequestCount).toBe(users.length);

    await cleanUpConcurrentTest(articleId);
  });

  it('inserts blocked reply request without updating article count', async () => {
    MockDate.set(1485593157011);
    const articleId = 'createReplyRequestTest1';
    const userId = 'iAmBlocked';
    const appId = 'test';

    const { data, errors } = await gql`
      mutation ($articleId: String!) {
        CreateOrUpdateReplyRequest(
          articleId: $articleId
          reason: "Some unwelcomed ads here"
        ) {
          id
          replyRequestCount
          replyRequests(statuses: [BLOCKED, NORMAL]) {
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
    const request = await client.get({
      index: 'replyrequests',
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

    const article = await client.get({
      index: 'articles',
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
    await client.delete({ index: 'replyrequests', id });
    await resetFrom(fixtures, `/articles/doc/${articleId}`);
  });

  afterAll(() => unloadFixtures(fixtures));
});
