import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/ListArticles';

function purifyResult(result) {
  expect(result.errors).toBeUndefined();
  // Other test's fixture would get in... Orz
  //
  result.data.ListArticles.edges =
    result.data.ListArticles.edges.filter(({ node: { id } }) => id.startsWith('listArticleTest'));
  return result;
}

describe('Search', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('lists all articles', async () => {
    expect(purifyResult(await gql`{
      ListArticles {
        totalCount
        edges {
          node {
            id
          }
          cursor
        }
        pageInfo {
          lastCursor
        }
      }
    }`())).toMatchSnapshot();

    // sort
    expect(purifyResult(await gql`{
      ListArticles(orderBy: [{field: updatedAt}]) {
        edges {
          node {
            id
          }
        }
      }
    }`())).toMatchSnapshot();

    // filter
    expect(purifyResult(await gql`{
      ListArticles(filter: {replyCount: {GT: 1}}) {
        edges {
          node {
            id
          }
        }
      }
    }`())).toMatchSnapshot();

    // after
    expect(purifyResult(await gql`query($cursor: String) {
      ListArticles(after: $cursor) {
        edges {
          node {
            id
          }
        }
      }
    }`(
      { cursor: Buffer.from(JSON.stringify(['basic#listArticleTest2'])).toString('base64') },
    ))).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
