import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/GetArticle';

describe('GetCategory', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('Get specified article and articleCategories with NORMAL status', async () => {
    expect(
      await gql`
        {
          GetArticle(id: "GetArticle1") {
            text
            articleCategories(status: NORMAL) {
              categoryId
              category {
                id
                title
                description
              }
            }
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('Get specified article and articleCategories with DELETED status', async () => {
    expect(
      await gql`
        {
          GetArticle(id: "GetArticle1") {
            text
            articleCategories(status: DELETED) {
              categoryId
              category {
                id
                title
                description
              }
            }
          }
        }
      `()
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
