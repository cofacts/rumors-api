import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/ListArticles';

describe('ListArticles', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('lists all articles', async () => {
    expect(await gql`{
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
    }`()).toMatchSnapshot();

    // sort
    expect(await gql`{
      ListArticles(orderBy: [{field: updatedAt}]) {
        edges {
          node {
            id
          }
        }
      }
    }`()).toMatchSnapshot();

    // filter
    expect(await gql`{
      ListArticles(filter: {replyCount: {GT: 1}}) {
        edges {
          node {
            id
          }
        }
      }
    }`()).toMatchSnapshot();

    // after
    expect(await gql`query($cursor: String) {
      ListArticles(after: $cursor) {
        edges {
          node {
            id
          }
        }
      }
    }`(
      { cursor: Buffer.from(JSON.stringify(['basic#listArticleTest2'])).toString('base64') },
    )).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
