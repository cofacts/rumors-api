import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import { getCursor } from 'graphql/util';
import fixtures from '../__fixtures__/ListArticles';
import fetch from 'node-fetch';
import { imageHash } from 'image-hash';

jest.mock('node-fetch');
jest.mock('image-hash', () => ({
  __esModule: true,
  imageHash: jest.fn(),
}));

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

    expect(
      await gql`
        {
          ListArticles(orderBy: [{ replyRequestCount: DESC }]) {
            edges {
              node {
                id
                replyRequestCount
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
    ).toMatchSnapshot('by replyRequestCount DESC');

    expect(
      await gql`
        {
          ListArticles(orderBy: [{ lastRepliedAt: DESC }]) {
            edges {
              node {
                id
                articleReplies(status: NORMAL) {
                  createdAt
                }
              }
            }
          }
        }
      `()
    ).toMatchSnapshot('by lastRepliedAt DESC');
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
                replyCount
              }
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
              highlight {
                text
                hyperlinks {
                  url
                  title
                  summary
                }
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

  it('filters by moreLikeThis and given text, find articles containing hyperlinks with the said text', async () => {
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
              highlight {
                text
                hyperlinks {
                  url
                  title
                  summary
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
        `,
      })
    ).toMatchSnapshot();
  });

  it("filters by moreLikeThis and given URL, find articles with the said URL's content", async () => {
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
              highlight {
                text
                hyperlinks {
                  url
                  title
                  summary
                }
              }
            }
          }
        }
      `({
        like: `
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
    ).toMatchSnapshot('userId = user1, appId = app1');

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
    ).toMatchSnapshot('author of listArticleTest1');
  });

  it('filters by time range', async () => {
    expect(
      await gql`
        {
          ListArticles(
            filter: { createdAt: { GT: "2020-02-06T00:00:00.000Z" } }
          ) {
            edges {
              node {
                id
                createdAt
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('later than 2020-02-06');
    expect(
      await gql`
        {
          ListArticles(
            filter: { createdAt: { LTE: "2020-02-06T00:00:00.000Z" } }
          ) {
            edges {
              node {
                id
                createdAt
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('earlier or equal to 2020-02-06');
    expect(
      await gql`
        {
          ListArticles(
            filter: {
              createdAt: {
                GTE: "2020-02-04T00:00:00.000Z"
                LTE: "2020-02-06T00:00:00.000Z"
              }
            }
          ) {
            edges {
              node {
                id
                createdAt
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('between 2020-02-04 and 2020-02-06');
  });

  it('filters by replies time range', async () => {
    expect(
      await gql`
        {
          ListArticles(
            filter: { repliedAt: { GT: "2020-02-06T00:00:00.000Z" } }
          ) {
            edges {
              node {
                id
                articleReplies(status: NORMAL) {
                  createdAt
                }
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('later than 2020-02-06');
    expect(
      await gql`
        {
          ListArticles(
            filter: { repliedAt: { LTE: "2020-02-06T00:00:00.000Z" } }
          ) {
            edges {
              node {
                id
                articleReplies(status: NORMAL) {
                  createdAt
                }
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('earlier or equal to 2020-02-06');
    expect(
      await gql`
        {
          ListArticles(
            filter: {
              repliedAt: {
                GTE: "2020-02-04T00:00:00.000Z"
                LTE: "2020-02-06T00:00:00.000Z"
              }
            }
          ) {
            edges {
              node {
                id
                articleReplies(status: NORMAL) {
                  createdAt
                }
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('between 2020-02-04 and 2020-02-06');
  });

  it('filters by mixed query', async () => {
    // Mixes 'should' and 'filter' query. At least 1 'should' must match.
    // Therefore, this query should only match 1 result instead of all that satisfies replyRequestCount: { GT: 0 }
    expect(
      await gql`
        {
          ListArticles(
            filter: {
              moreLikeThis: {
                like: "憶昔封書與君夜，金鑾殿後欲明天。今夜封書在何處？廬山庵裏曉燈前。籠鳥檻猿俱未死，人間相見是何年？"
              }
              replyRequestCount: { GT: 0 }
            }
          ) {
            edges {
              node {
                id
              }
              highlight {
                text
                hyperlinks {
                  url
                  title
                  summary
                }
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('throws error when author filter is not set correctly', async () => {
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
              highlight {
                text
                hyperlinks {
                  url
                  title
                  summary
                }
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

  it('use filter categoryIds to list articles', async () => {
    expect(
      await gql`
        {
          ListArticles(
            orderBy: [{ _score: DESC }]
            filter: { categoryIds: ["category1", "category-author-1"] }
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

  it('filters via article reply feedback count', async () => {
    expect(
      await gql`
        {
          ListArticles(
            filter: { hasArticleReplyWithMorePositiveFeedback: true }
          ) {
            edges {
              node {
                id
                articleReplies(status: NORMAL) {
                  positiveFeedbackCount
                  negativeFeedbackCount
                }
              }
            }
          }
        }
      `()
    ).toMatchSnapshot('hasArticleReplyWithMorePositiveFeedback = true');

    expect(
      await gql`
        {
          ListArticles(
            filter: { hasArticleReplyWithMorePositiveFeedback: false }
          ) {
            edges {
              node {
                id
                articleReplies(status: NORMAL) {
                  positiveFeedbackCount
                  negativeFeedbackCount
                }
              }
            }
          }
        }
      `()
    ).toMatchSnapshot('hasArticleReplyWithMorePositiveFeedback = false');
  });

  it('filters via articleRepliesFrom', async () => {
    expect(
      await gql`
        {
          ListArticles(filter: { articleRepliesFrom: { userId: "user1" } }) {
            edges {
              node {
                id
                articleReplies(status: NORMAL) {
                  user {
                    id
                  }
                }
              }
            }
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchSnapshot('has articleReply from user1');

    expect(
      await gql`
        {
          ListArticles(
            filter: { articleRepliesFrom: { userId: "user1", exists: false } }
          ) {
            edges {
              node {
                id
                articleReplies(status: NORMAL) {
                  user {
                    id
                  }
                }
              }
            }
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchSnapshot('do not have articleReply from user1');
  });

  it('filters by reply types', async () => {
    expect(
      await gql`
        {
          ListArticles(filter: { replyTypes: [NOT_RUMOR, OPINIONATED] }) {
            edges {
              node {
                id
                articleReplies(status: NORMAL) {
                  replyType
                }
              }
            }
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchSnapshot('replied with NOT_RUMOR and OPINIONATED');
  });

  it('returns activities stats', async () => {
    expect(
      await gql`
        {
          ListArticles {
            edges {
              node {
                id
                stats(dateRange: { GTE: "2020-01-03", LTE: "2020-01-05" }) {
                  date
                  webUser
                  webVisit
                  lineUser
                  lineVisit
                }
              }
            }
          }
        }
      `()
    ).toMatchSnapshot('articles with stats');
  });

  it('filters by article types', async () => {
    expect(
      await gql`
        {
          ListArticles(filter: { articleTypes: [IMAGE, AUDIO] }) {
            edges {
              node {
                id
                articleType
              }
            }
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchSnapshot('IMAGE and AUDIO articles');
  });

  it('filters by mediaUrl, without MEDIA_ARTICLE_SUPPORT env', async () => {
    fetch.mockImplementation(() =>
      Promise.resolve({
        status: 200,
        body: {},
        buffer: jest.fn(),
      })
    );
    imageHash.mockImplementation((file, bits, method, callback) =>
      callback(undefined, 'ffff8000')
    );

    expect(
      await gql`
        {
          ListArticles(
            filter: { mediaUrl: "http://foo.com/input_image.jpeg" }
          ) {
            edges {
              node {
                id
                articleType
                attachmentUrl
                attachmentHash
              }
            }
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchSnapshot('should return empty');
  });

  it('filters by mediaUrl with MEDIA_ARTICLE_SUPPORT env', async () => {
    process.env.MEDIA_ARTICLE_SUPPORT = true;
    fetch.mockImplementation(() =>
      Promise.resolve({
        status: 200,
        body: {},
        buffer: jest.fn(),
      })
    );
    imageHash.mockImplementation((file, bits, method, callback) =>
      callback(undefined, 'ffff8000')
    );

    expect(
      await gql`
        {
          ListArticles(
            filter: { mediaUrl: "http://foo.com/input_image.jpeg" }
          ) {
            edges {
              node {
                id
                articleType
                attachmentUrl
                attachmentHash
              }
            }
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchSnapshot('attachmentHash should be ffff8000');
    delete process.env.MEDIA_ARTICLE_SUPPORT;
  });

  afterAll(() => unloadFixtures(fixtures));
});
