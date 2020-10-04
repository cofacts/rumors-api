jest.mock('util/grpc');

import gql from 'util/GraphQL';
import {
  loadFixtures,
  unloadFixtures,
  resetFrom
} from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateReply';
import resolveUrl from 'util/grpc';
import delayForMs from 'util/delayForMs';

describe('CreateReply', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('creates replies and associates itself with specified article', async () => {
    MockDate.set(1485593157011);
    const REF_URL = 'http://shouldscrap.com/';
    const articleId = 'setReplyTest1';
    resolveUrl.__setDelay(500); // Scrap result delay for 500ms
    resolveUrl.__addMockResponse([
      {
        url: REF_URL,
        title: 'scrapped title',
      },
    ]);

    const { data, errors } = await gql`
      mutation(
        $articleId: String!
        $text: String!
        $type: ReplyTypeEnum!
        $reference: String!
      ) {
        CreateReply(
          articleId: $articleId
          text: $text
          type: $type
          reference: $reference
        ) {
          id
        }
      }
    `(
      {
        articleId,
        text: 'FOO FOO',
        type: 'RUMOR',
        reference: REF_URL,
      },
      { userId: 'test', appId: 'test' }
    );

    expect(errors).toBeUndefined();

    const replyId = data.CreateReply.id;
    const { body: reply } = await client.get({
      index: 'replies',
      type: 'doc',
      id: replyId,
    });
    expect(reply._source).toMatchSnapshot('reply without hyperlinks');

    const { body: article } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(article._source.articleReplies[0].replyId).toBe(replyId);

    // Wait until urls are resolved
    await delayForMs(1000);
    MockDate.reset();
    resolveUrl.__reset();

    // Check replies and hyperlinks
    const { body: replyAfterFetch } = await client.get({
      index: 'replies',
      type: 'doc',
      id: replyId,
    });
    expect(replyAfterFetch._source.hyperlinks).toMatchSnapshot(
      'hyperlinks after fetch'
    );

    // Cleanup
    await client.delete({ index: 'replies', type: 'doc', id: replyId });

    // refresh must be invoked before deleteByQuery, or the query may find nothing and delete nothing
    await client.indices.refresh({ index: 'urls' });
    await client.deleteByQuery({
      index: 'urls',
      type: 'doc',
      body: { query: { term: { url: REF_URL } } },
      refresh: 'true',
    });
    await resetFrom(fixtures, `/articles/doc/${articleId}`);
  });

  it('should support waitForHyperlinks', async () => {
    MockDate.set(1485593157011);
    const articleId = 'setReplyTest1';

    const { data, errors } = await gql`
      mutation(
        $articleId: String!
        $text: String!
        $type: ReplyTypeEnum!
        $reference: String!
      ) {
        CreateReply(
          articleId: $articleId
          text: $text
          type: $type
          reference: $reference
          waitForHyperlinks: true
        ) {
          id
        }
      }
    `(
      {
        articleId,
        text: 'Bar Bar',
        type: 'RUMOR',
        reference: 'http://google.com',
      },
      { userId: 'test', appId: 'test' }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();

    const replyId = data.CreateReply.id;
    const { body: reply } = await client.get({
      index: 'replies',
      type: 'doc',
      id: replyId,
    });
    expect(reply._source).toMatchSnapshot();
  });

  it('should throw error since a reference is required for type !== NOT_ARTICLE', async () => {
    MockDate.set(1485593157011);
    const articleId = 'setReplyTest1';

    const { errors } = await gql`
      mutation($articleId: String!, $text: String!, $type: ReplyTypeEnum!) {
        CreateReply(articleId: $articleId, text: $text, type: $type) {
          id
        }
      }
    `(
      {
        articleId,
        text: 'FOO FOO',
        type: 'RUMOR',
      },
      { userId: 'test', appId: 'test' }
    );
    MockDate.reset();

    expect(errors).toMatchSnapshot();

    // Cleanup
    await resetFrom(fixtures, `/articles/doc/${articleId}`);
  });

  afterAll(() => unloadFixtures(fixtures));
});
