import gql from 'util/GraphQL';
import client from 'util/client';

import MockDate from 'mockdate';

describe('CreateArticle', () => {
  it('creates articles', async () => {
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
});
