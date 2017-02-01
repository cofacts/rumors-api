import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/ListArticles';

function purifyResult(result) {
  // Other test's fixture would get in... Orz
  //
  return result.data.ListArticles.filter(({ id }) => id.startsWith('listArticleTest'));
}

describe('Search', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('lists all articles', async () => {
    expect(purifyResult(await gql`{
      ListArticles {
        id
      }
    }`())).toMatchSnapshot();

    // sort
    expect(purifyResult(await gql`{
      ListArticles(orderBy: [{field: updatedAt}]) {
        id
      }
    }`())).toMatchSnapshot();

    // filter
    expect(purifyResult(await gql`{
      ListArticles(filter: {replyCount: {GT: 1}}) {
        id
      }
    }`())).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
