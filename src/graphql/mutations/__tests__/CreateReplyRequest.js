import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateReplyRequest';

describe('CreateReplyRequest', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('attaches a reply request to an article', async () => {
    MockDate.set(1485593157011);
    const { data, errors } = await gql`
      mutation(
        $articleId: String!
      ) {
        CreateReplyRequest(
          articleId: $articleId
        ) {
          replyCount
        }
      }
    `({
      articleId: 'createReplyRequestTest1',
    }, { userId: 'test', from: 'test' });
    MockDate.reset();

    const id = 'createReplyRequestTest1__test__test';
    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const conn = await client.get({ index: 'replyrequests', type: 'basic', id });
    expect(conn._source).toMatchSnapshot();

    const article = await client.get({ index: 'articles', type: 'basic', id: 'createReplyRequestTest1' });
    expect(article._source.replyRequestIds[0]).toBe(id);

    // Cleanup
    await client.delete({ index: 'replyrequests', type: 'basic', id });
    await client.update({
      index: 'articles',
      type: 'basic',
      id: 'createReplyRequestTest1',
      body: {
        doc: fixtures['/articles/basic/createReplyRequestTest1'],
      },
    });
  });

  it('cannot attach a reply request to an article twice', async () => {
    await gql`
      mutation( $articleId: String! ) {
        CreateReplyRequest( articleId: $articleId ) { replyCount }
      }
    `({ articleId: 'createReplyRequestTest1' }, { userId: 'test', from: 'test' });

    const { errors } = await gql`
      mutation( $articleId: String! ) {
        CreateReplyRequest( articleId: $articleId ) { replyCount }
      }
    `({ articleId: 'createReplyRequestTest1' }, { userId: 'test', from: 'test' });

    expect(errors[0]).toEqual(expect.stringMatching(/document already exists/));

    // Cleanup
    await client.delete({ index: 'replyrequests', type: 'basic', id: 'createReplyRequestTest1__test__test' });
  });

  afterAll(() => unloadFixtures(fixtures));
});
