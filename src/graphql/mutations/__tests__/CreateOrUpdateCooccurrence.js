import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import { getCooccurrenceId } from '../CreateOrUpdateCooccurrence';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateOrUpdateCooccurrence';

describe('CreateOrUpdateCooccurrence', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('creates cooccurrence', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'test';
    const articleIds = ['a1', 'a2'];

    const { data, errors } = await gql`
      mutation($articleIds: [String!]) {
        CreateOrUpdateCooccurrence(
          articleIds: $articleIds
        ) {
          articles {
            text
          }
          articleIds
          userId
          appId
        }
      }
    `(
      {
        articleIds,
      },
      {
        user: { id: userId, appId },
      }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data.CreateOrUpdateCooccurrence).toMatchSnapshot();

    const id = getCooccurrenceId({
      articleIds,
      userId,
      appId,
    });

    const { body: conn } = await client.get({
      index: 'cooccurrences',
      type: 'doc',
      id,
    });
    expect(conn._source).toMatchInlineSnapshot(`
      Object {
        "appId": "test",
        "articleIds": Array [
          "a1",
          "a2",
        ],
        "createdAt": "2017-01-28T08:45:57.011Z",
        "updatedAt": "2017-01-28T08:45:57.011Z",
        "userId": "test",
      }
    `);

    // Cleanup
    await client.delete({
      index: 'cooccurrences',
      type: 'doc',
      id,
    });
  });

  afterAll(() => unloadFixtures(fixtures));
});
