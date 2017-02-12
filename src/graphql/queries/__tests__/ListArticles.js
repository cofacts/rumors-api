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
  });

  it('sorts', async () => {
    expect(await gql`{
      ListArticles(orderBy: [{updatedAt: DESC}]) {
        edges {
          node {
            id
          }
        }
      }
    }`()).toMatchSnapshot();

    expect(await gql`{
      ListArticles(orderBy: [{replyRequestCount: DESC}]) {
        edges {
          node {
            id
          }
        }
      }
    }`()).toMatchSnapshot();
  });

  it('filters', async () => {
    expect(await gql`{
      ListArticles(filter: {replyCount: {GT: 1}}) {
        edges {
          node {
            id
          }
        }
      }
    }`()).toMatchSnapshot();
  });

  it('supports after', async () => {
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
