import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/ListCooccurrences';

describe('ListCooccurrences', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('lists all cooccurrences', async () => {
    expect(
      await gql`
        {
          ListCooccurrences {
            totalCount
            edges {
              node {
                id
              }
              cursor
            }
            pageInfo {
              firstCursor
              lastCursor
            }
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('sorts', async () => {
    expect(
      await gql`
        {
          ListCooccurrences(orderBy: [{ updatedAt: DESC }]) {
            edges {
              node {
                id
                updatedAt
              }
            }
            totalCount
            pageInfo {
              firstCursor
              lastCursor
            }
          }
        }
      `()
    ).toMatchSnapshot('by updatedAt DESC');
  });

  it('filters', async () => {
    expect(
      await gql`
        {
          ListCooccurrences(
            filter: { updatedAt: { GT: "2020-02-03T00:01:05.000Z" } }
          ) {
            edges {
              node {
                id
                updatedAt
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "ListCooccurrences": Object {
            "edges": Array [
              Object {
                "node": Object {
                  "id": "listCooccurrenceTest2",
                  "updatedAt": "2020-02-03T00:02:00.000Z",
                },
              },
            ],
            "totalCount": 1,
          },
        },
      }
    `);
  });

  afterAll(() => unloadFixtures(fixtures));
});
