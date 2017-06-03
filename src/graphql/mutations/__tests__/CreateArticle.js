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
    `(
      {
        text: 'FOO FOO',
        reference: { type: 'LINE' },
      },
      { userId: 'test', from: 'foo' }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();

    const doc = await client.get({
      index: 'data',
      type: 'articles',
      id: data.CreateArticle.id,
    });

    delete doc._id; // delete auto-generated id from being snapshot

    expect(doc).toMatchSnapshot();

    // Assert replyrequest is created
    //
    const replyRequestResult = await client.search({
      index: 'data',
      body: {
        query: {
          parent_id: {
            type: 'replyrequests',
            id: data.CreateArticle.id,
          },
        },
      },
    });
    expect(replyRequestResult).toHaveProperty('hits.total', 1);
    const replyRequest = replyRequestResult.hits.hits[0];
    expect(replyRequest._source).toMatchSnapshot();

    // Cleanup
    await client.delete({
      index: 'data',
      type: 'articles',
      id: data.CreateArticle.id,
    });
    await client.delete({
      index: 'data',
      type: 'replyrequests',
      id: replyRequest._id,
    });
  });
});
