import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/ListCooccurrences';

describe('ListArticles', () => {
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

  afterAll(() => unloadFixtures(fixtures));
});
