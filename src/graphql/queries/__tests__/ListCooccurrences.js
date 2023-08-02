import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
// import { getCursor } from 'graphql/util';
import fixtures from '../__fixtures__/ListCooccurrences';
// import mediaManager from 'util/mediaManager';

// jest.mock('util/mediaManager');

describe('ListArticles', () => {
  beforeAll(() => loadFixtures(fixtures));
  // beforeEach(() => {
  //   mediaManager.insert.mockClear();
  // });

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

  afterAll(() => unloadFixtures(fixtures));
});
