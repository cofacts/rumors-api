import gql from 'util/GraphQL';
import client from 'util/client';

import MockDate from 'mockdate';

describe('CreateArticle', () => {
  it('creates articles', async () => {
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
    `({
      text: 'FOO FOO', reference: { type: 'LINE' },
    }, { userId: 'test', from: 'foo' });
    MockDate.reset();

    expect(errors).toBeUndefined();

    const doc = await client.get({ index: 'articles', type: 'basic', id: data.CreateArticle.id });
    delete doc._id; // delete auto-generated id from being snapshot

    expect(doc).toMatchSnapshot();

    // Cleanup
    await client.delete({ index: 'articles', type: 'basic', id: data.CreateArticle.id });
  });
});
