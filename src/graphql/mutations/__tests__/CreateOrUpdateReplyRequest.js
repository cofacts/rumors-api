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
      { userId, appId }
    );
    MockDate.reset();

    const id = getReplyRequestId({ articleId, userId, appId });
    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const request = await client.get({
      index: 'replyrequests',
      type: 'doc',
      id,
    });
    expect(request._source).toMatchSnapshot();

    const article = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(article._source).toMatchSnapshot();

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
    `({ articleId }, { userId, appId });

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
    `({ articleId }, { userId, appId });

    MockDate.reset();

    const id = getReplyRequestId({ articleId, userId, appId });
    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const conn = await client.get({
      index: 'replyrequests',
      type: 'doc',
      id,
    });
    expect(conn._source).toMatchSnapshot();

    const article = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(article._source).toMatchSnapshot();

    // Cleanup
    await client.delete({ index: 'replyrequests', type: 'doc', id });
    await resetFrom(fixtures, `/articles/doc/${articleId}`);
  });

  afterAll(() => unloadFixtures(fixtures));
});
