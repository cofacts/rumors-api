import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateArticle';

describe('CreateArticle', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('creates articles and a reply request', async () => {
    MockDate.set(1485593157011);
    const { data, errors } = await gql`
      mutation(
        $text: String!
        $reference: ArticleReferenceInput!
      ) {
        CreateArticle(
          text: $text
          reference: $reference
        ) {
          id
        }
      }
    `(
      {
        text: 'FOO FOO',
        reference: { type: 'LINE' },
      },
      { userId: 'test', from: 'foo' }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();

    const { _source: article } = await client.get({
      index: 'articles',
      type: 'basic',
      id: data.CreateArticle.id,
    });
    expect(article.replyRequestIds).toHaveLength(1);

    // delete auto-generated id from being snapshot
    delete article.replyRequestIds;

    expect(article).toMatchSnapshot();

    // Cleanup
    await client.delete({
      index: 'articles',
      type: 'basic',
      id: data.CreateArticle.id,
    });
  });

  it('avoids creating duplicated articles and adds replyRequests automatically', async () => {
    MockDate.set(1485593157011);
    const existingArticle = fixtures['/articles/basic/existing'];
    const userId = 'test';

    const { data, errors } = await gql`
      mutation(
        $text: String!
        $reference: ArticleReferenceInput!
      ) {
        CreateArticle(
          text: $text
          reference: $reference
        ) {
          id
        }
      }
    `(
      {
        text: existingArticle.text,
        reference: existingArticle.references[0],
      },
      { userId, from: 'foo' }
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
