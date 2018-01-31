import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateArticle';
import { getReplyRequestId } from '../CreateReplyRequest';

describe('CreateArticle', () => {
  beforeAll(() => loadFixtures(fixtures));

  fit('creates articles and a reply request', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'foo';

    const { data, errors } = await gql`
      mutation($text: String!, $reference: ArticleReferenceInput!) {
        CreateArticle(text: $text, reference: $reference) {
          id
        }
      }
    `(
      {
        text: 'FOO FOO',
        reference: { type: 'LINE' },
      },
      { userId, appId }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();

    const { _source: article } = await client.get({
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

    const { _source: replyRequest } = await client.get({
      index: 'replyrequests',
      type: 'doc',
      id: replyRequestId,
    });

    expect(replyRequest).toMatchSnapshot();

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
    const existingArticle = fixtures['/articles/basic/existing'];
    const userId = 'test';

    const { data, errors } = await gql`
      mutation($text: String!, $reference: ArticleReferenceInput!) {
        CreateArticle(text: $text, reference: $reference) {
          id
        }
      }
    `(
      {
        text: existingArticle.text,
        reference: existingArticle.references[0],
      },
      { userId, appId: 'foo' }
    );
    MockDate.reset();
    expect(errors).toBeUndefined();

    // Expects no new article is created,
    // and it returns the existing ID
    expect(data.CreateArticle.id).toBe('existing');

    const { _source: article } = await client.get({
      index: 'articles',
      type: 'basic',
      id: 'existing',
    });

    // Expects new replyRequestId is created
    expect(article.replyRequestIds).toHaveLength(1);

    const { _source: replyRequest } = await client.get({
      index: 'replyrequests',
      type: 'basic',
      id: article.replyRequestIds[0],
    });

    expect(replyRequest.userId).toBe(userId);

    // Cleanup
    await client.delete({
      index: 'replyrequests',
      type: 'basic',
      id: article.replyRequestIds[0],
    });
  });

  afterAll(() => unloadFixtures(fixtures));
});
