import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import { getCursor } from 'graphql/util';
import fixtures from '../__fixtures__/ListArticles';

describe('ListArticles', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('lists all articles', async () => {
    expect(
      await gql`
        {
          ListArticles {
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
          ListArticles(orderBy: [{ updatedAt: DESC }]) {
            edges {
              node {
                id
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
    ).toMatchSnapshot();

    expect(
      await gql`
        {
          ListArticles(orderBy: [{ replyRequestCount: DESC }]) {
            edges {
              node {
                id
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
    ).toMatchSnapshot();
  });

  const testReplyCount = async expression => {
    // Lists only articles with more than one reply.
    const pair = expression ? `${expression}: 1` : expression;
    expect(
      await gql`
        {
          ListArticles(filter: { replyCount: {${pair}} }) {
            edges {
              node {
                id
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
    ).toMatchSnapshot();
  };

  it('filters by replyCount EQ', () => testReplyCount('EQ'));
  it('filters by replyCount LT', () => testReplyCount('LT'));
  it('filters by replyCount GT', () => testReplyCount('GT'));
  it('filters by invalid operator', () => testReplyCount('INVALID'));
  it('filters by null operator', () => testReplyCount(''));

  it('filters by moreLikeThis', async () => {
    // moreLikeThis query
    expect(
      await gql`
        {
          ListArticles(
            filter: {
              moreLikeThis: {
                like: "人間相見是何年？牽攣乖隔，各欲白首。"
                minimumShouldMatch: "5%"
              }
            }
          ) {
            edges {
              node {
                id
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
    ).toMatchSnapshot();
  });

  it('filters by moreLikeThis and handles URLs', async () => {
    // moreLikeThis query
    // 1, given text, find articles containing hyperlinks with the said text
    // 2. given URL, find articles with content the said URL's content
    expect(
      await gql`
        query($like: String) {
          ListArticles(
            filter: { moreLikeThis: { like: $like, minimumShouldMatch: "5%" } }
          ) {
            edges {
              node {
                id
                hyperlinks {
                  summary
                  topImageUrl
                }
              }
            }
          }
        }
      `({
        like: `
          1. text -> ariticles linked to the content
          居有頃，倚柱彈其劍，歌曰：「長鋏歸來乎！食無魚！」左右以告。孟嘗君曰：「食之
          ，比門下之客。」居有頃，復彈其鋏，歌曰：「長鋏歸來乎！出無車！」

          2. URL -> article with given URL's content
          http://出師表.com
        `,
      })
    ).toMatchSnapshot();
  });

  it('filters by replyRequestCount', async () => {
    // Lists only articles with more than 1 reply requests
    expect(
      await gql`
        {
          ListArticles(filter: { replyRequestCount: { GT: 1 } }) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('filters by userId, appId and fromUserOfArticleId', async () => {
    // Lists only articles by userId & appId
    expect(
      await gql`
        {
          ListArticles(filter: { userId: "user1", appId: "app1" }) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot();

    // Lists only articles by fromUserOfArticleId
    expect(
      await gql`
        {
          ListArticles(filter: { fromUserOfArticleId: "listArticleTest1" }) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('throws error when author filter is not set correctly', async () => {
    const { errors: noUserIdError } = await gql`
      {
        ListArticles(filter: { appId: "specified-but-no-user-id" }) {
          edges {
            node {
              id
            }
          }
          totalCount
        }
      }
    `();
    expect(noUserIdError).toMatchSnapshot();

    const { errors: notExistError } = await gql`
      {
        ListArticles(filter: { fromUserOfArticleId: "not-exist" }) {
          edges {
            node {
              id
            }
          }
          totalCount
        }
      }
    `();
    expect(notExistError).toMatchSnapshot();
  });

  it('supports after', async () => {
    expect(
      await gql`
        query($cursor: String) {
          ListArticles(after: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
            pageInfo {
              firstCursor
              lastCursor
            }
          }
        }
      `({ cursor: getCursor(['listArticleTest2']) })
    ).toMatchSnapshot();
  });

  it('supports before', async () => {
    expect(
      await gql`
        query($cursor: String) {
          ListArticles(before: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
            pageInfo {
              firstCursor
              lastCursor
            }
          }
        }
      `({ cursor: getCursor(['listArticleTest2']) })
    ).toMatchSnapshot();
  });

  it('should fail if before and after both exist', async () => {
    expect(
      await gql`
        query($cursor: String) {
          ListArticles(before: $cursor, after: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
            pageInfo {
              firstCursor
              lastCursor
            }
          }
        }
      `({ cursor: getCursor(['listArticleTest2']) })
    ).toMatchSnapshot();
  });

  it('correctly handles empty lists without errors', async () => {
    expect(
      await gql`
        {
          ListArticles(
            filter: { moreLikeThis: { like: "ThisShouldNotExist" } }
          ) {
            edges {
              node {
                id
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
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
