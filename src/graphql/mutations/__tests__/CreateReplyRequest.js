import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateReplyRequest';

describe('CreateReplyRequest', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('attaches a reply request to an article', async () => {
    MockDate.set(1485593157011);
    const { data, errors } = await gql`
      mutation($articleId: String!) {
        CreateReplyRequest(articleId: $articleId) {
          replyRequestCount
          status
        }
      }
    `(
      {
        articleId: 'createReplyRequestTest1',
      },
      { userId: 'test', appId: 'test' }
    );
    MockDate.reset();

    const id = 'createReplyRequestTest1__test__test';
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
      id: 'createReplyRequestTest1',
    });
    expect(article._source).toMatchSnapshot();

    // Cleanup
    await client.delete({ index: 'replyrequests', type: 'doc', id });
    await resetFrom(fixtures, '/articles/doc/createReplyRequestTest1');
  });

  it('cannot attach a reply request to an article twice', async () => {
    MockDate.set(1485593157011);
    await gql`
      mutation($articleId: String!) {
        CreateReplyRequest(articleId: $articleId) {
          replyRequestCount
        }
      }
    `(
      { articleId: 'createReplyRequestTest1' },
      { userId: 'test', appId: 'test' }
    );

    const { data, errors } = await gql`
      mutation($articleId: String!) {
        CreateReplyRequest(articleId: $articleId) {
          replyRequestCount
          status
        }
      }
    `(
      { articleId: 'createReplyRequestTest1' },
      { userId: 'test', appId: 'test' }
    );

    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const article = await client.get({
      index: 'articles',
      type: 'doc',
      id: 'createReplyRequestTest1',
    });
    expect(article._source).toMatchSnapshot();

    // Cleanup
    await client.delete({
      index: 'replyrequests',
      type: 'doc',
      id: 'createReplyRequestTest1__test__test',
    });
    await resetFrom(fixtures, '/articles/doc/createReplyRequestTest1');
  });

  afterAll(() => unloadFixtures(fixtures));
});
