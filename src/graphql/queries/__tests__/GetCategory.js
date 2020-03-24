import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/GetCategory';

describe('GetCategory', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('Get specified category and articleCategories with NORMAL status', async () => {
    expect(
      await gql`
        {
          GetCategory(id: "c1") {
            title
            articleCategories(status: NORMAL) {
              totalCount
              edges {
                node {
                  articleId
                  category {
                    id
                    title
                  }
                  status
                }
                cursor
                score
              }
              pageInfo {
                firstCursor
                lastCursor
              }
            }
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('Get specified category and articleCategories with DELETED status', async () => {
    expect(
      await gql`
        {
          GetCategory(id: "c1") {
            title
            articleCategories(status: DELETED) {
              totalCount
              edges {
                node {
                  articleId
                  category {
                    id
                    title
                  }
                  status
                }
                cursor
                score
              }
              pageInfo {
                firstCursor
                lastCursor
              }
            }
          }
        }
      `()
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
