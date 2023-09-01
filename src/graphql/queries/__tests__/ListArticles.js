import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import { getCursor, createTranscript } from 'graphql/util';
import fixtures from '../__fixtures__/ListArticles';
import mediaManager from 'util/mediaManager';

jest.mock('util/mediaManager');

// Just mock createTranscript, keep others normal
// Ref: https://jestjs.io/docs/mock-functions#mocking-partials
jest.mock('graphql/util', () => {
  const originalGrapQLUtil = jest.requireActual('../../util');
  return {
    __esModule: true,
    ...originalGrapQLUtil,
    createTranscript: jest.fn(),
  };
});

describe('ListArticles', () => {
  beforeAll(() => loadFixtures(fixtures));
  beforeEach(() => {
    mediaManager.insert.mockClear();
    createTranscript.mockClear();
  });

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

    // Should be identical to 'by lastRepliedAt DESC' snapshot,
    // but excludes articles without any article replies
    expect(
      (await gql`
        {
          ListArticles(
            filter: { articleReply: { statuses: [NORMAL] } }
            orderBy: [{ lastMatchingArticleReplyCreatedAt: DESC }]
          ) {
            edges {
              node {
                id
                articleReplies {
                  createdAt
                }
              }
            }
          }
        }
      `()).data.ListArticles
    ).toMatchInlineSnapshot(`
      Object {
        "edges": Array [
          Object {
            "node": Object {
              "articleReplies": Array [
                Object {
                  "createdAt": "2020-02-11T15:11:04.472Z",
                },
                Object {
                  "createdAt": "2020-02-09T15:11:04.472Z",
                },
                Object {
                  "createdAt": "2020-02-10T15:11:04.472Z",
                },
              ],
              "id": "listArticleTest4",
            },
          },
          Object {
            "node": Object {
              "articleReplies": Array [
                Object {
                  "createdAt": "2020-02-09T15:11:04.472Z",
                },
              ],
              "id": "listArticleTest2",
            },
          },
          Object {
            "node": Object {
              "articleReplies": Array [
                Object {
                  "createdAt": "2020-02-08T15:11:04.472Z",
                },
                Object {
                  "createdAt": "2020-02-05T14:41:19.044Z",
                },
              ],
              "id": "listArticleTest1",
            },
          },
        ],
      }
    `);
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

  it('filters by articleReplies filter', async () => {
    // This should be identical to "earlier or equal to 2020-02-06" snapshot
    expect(
      (await gql`
        {
          ListArticles(
            filter: {
              articleReply: { createdAt: { GT: "2020-02-06T00:00:00.000Z" } }
            }
          ) {
            edges {
              node {
                id
                articleReplies {
                  createdAt
                }
              }
            }
          }
        }
      `()).data.ListArticles
    ).toMatchInlineSnapshot(`
      Object {
        "edges": Array [
          Object {
            "node": Object {
              "articleReplies": Array [
                Object {
                  "createdAt": "2020-02-11T15:11:04.472Z",
                },
                Object {
                  "createdAt": "2020-02-09T15:11:04.472Z",
                },
                Object {
                  "createdAt": "2020-02-10T15:11:04.472Z",
                },
              ],
              "id": "listArticleTest4",
            },
          },
          Object {
            "node": Object {
              "articleReplies": Array [
                Object {
                  "createdAt": "2020-02-09T15:11:04.472Z",
                },
              ],
              "id": "listArticleTest2",
            },
          },
          Object {
            "node": Object {
              "articleReplies": Array [
                Object {
                  "createdAt": "2020-02-08T15:11:04.472Z",
                },
                Object {
                  "createdAt": "2020-02-05T14:41:19.044Z",
                },
              ],
              "id": "listArticleTest1",
            },
          },
        ],
      }
    `);

    // Should be identical to replied with NOT_RUMOR and OPINIONATED snapshot
    expect(
      (await gql`
        {
          ListArticles(
            filter: { articleReply: { replyTypes: [NOT_RUMOR, OPINIONATED] } }
          ) {
            edges {
              node {
                id
                articleReplies {
                  replyType
                }
              }
            }
          }
        }
      `()).data.ListArticles
    ).toMatchInlineSnapshot(`
      Object {
        "edges": Array [
          Object {
            "node": Object {
              "articleReplies": Array [
                Object {
                  "replyType": "OPINIONATED",
                },
                Object {
                  "replyType": "NOT_ARTICLE",
                },
                Object {
                  "replyType": "NOT_ARTICLE",
                },
              ],
              "id": "listArticleTest4",
            },
          },
          Object {
            "node": Object {
              "articleReplies": Array [
                Object {
                  "replyType": "NOT_RUMOR",
                },
                Object {
                  "replyType": "NOT_ARTICLE",
                },
              ],
              "id": "listArticleTest1",
            },
          },
        ],
      }
    `);
  });

  it('filters by status', async () => {
    expect(
      await gql`
        {
          ListArticles(filter: { statuses: [BLOCKED] }) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "ListArticles": Object {
            "edges": Array [
              Object {
                "node": Object {
                  "id": "blockedArticle",
                },
              },
            ],
            "totalCount": 1,
          },
        },
      }
    `);
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

  it('filters by mediaUrl with mediaManager hits and matching hashes', async () => {
    const MOCK_HITS = [
      // Deliberately swap similarity to see if Elasticsearch sorts by similairty
      {
        similarity: 0.5,
        entry: {
          id: fixtures['/articles/doc/listArticleTest6'].attachmentHash,
          type: 'image',
          url: 'http://foo/image2.jpeg',
        },
      },
      {
        similarity: 1,
        entry: {
          id: fixtures['/articles/doc/listArticleTest5'].attachmentHash,
          type: 'image',
          url: 'http://foo/image.jpeg',
        },
      },
    ];

    mediaManager.query.mockImplementationOnce(async () => ({
      queryInfo: {
        type: 'image',
        id: fixtures['/articles/doc/listArticleTest5'].attachmentHash,
      },
      hits: MOCK_HITS,
    }));

    // Expect matching articles with similar attachment hashes,
    // as well as including similar transcripts.
    //
    // It will match:
    // 1st - attachment hash 100% similarity
    // 2nd - attachment hash 50% similarity, but has transcript (adopted in full-text search, raising its score)
    // 3rd - full text search w/ transcript of the 2nd
    //
    expect(
      await gql`
        {
          ListArticles(
            orderBy: [{ _score: DESC }]
            filter: { mediaUrl: "http://foo.com/input_image.jpeg" }
          ) {
            edges {
              score
              node {
                id
                articleType
                attachmentUrl # Original but not logged in, expects null
                attachmentHash
              }
            }
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "ListArticles": Object {
            "edges": Array [
              Object {
                "node": Object {
                  "articleType": "IMAGE",
                  "attachmentHash": "ffff8000",
                  "attachmentUrl": null,
                  "id": "listArticleTest5",
                },
                "score": 100,
              },
              Object {
                "node": Object {
                  "articleType": "IMAGE",
                  "attachmentHash": "ffff8001",
                  "attachmentUrl": null,
                  "id": "listArticleTest6",
                },
                "score": 60.03248,
              },
              Object {
                "node": Object {
                  "articleType": "TEXT",
                  "attachmentHash": "",
                  "attachmentUrl": null,
                  "id": "listArticleTest1",
                },
                "score": 5.419564,
              },
            ],
          },
        },
      }
    `);

    // Transcript already fetched from articles, no transcript is generated
    //
    expect(createTranscript).toHaveBeenCalledTimes(0);
  });

  it('lists all articles with cooccurrences', async () => {
    expect(
      await gql`
        {
          ListArticles(
            filter: { ids: ["listArticleTest1", "listArticleTest2"] }
          ) {
            totalCount
            edges {
              node {
                id
                cooccurrences {
                  id
                }
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
    ).toMatchSnapshot('articles with cooccurrences');
  });

  it('filters by mediaUrl with no media manager hits and no transcripts', async () => {
    // Assume no hits
    mediaManager.query.mockImplementationOnce(async () => ({
      queryInfo: {
        type: 'image',
        id: fixtures['/articles/doc/listArticleTest5'].attachmentHash,
      },
      hits: [],
    }));

    // Expect to return nothing
    expect(
      await gql`
        {
          ListArticles(
            orderBy: [{ _score: DESC }]
            filter: { mediaUrl: "http://foo.com/input_image.jpeg" }
          ) {
            edges {
              score
              node {
                id
                articleType
                attachmentHash
              }
            }
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "ListArticles": Object {
            "edges": Array [],
          },
        },
      }
    `);
  });

  it('filters by mediaUrl with no media manager but creates transcripts', async () => {
    // Assume no hits
    mediaManager.query.mockImplementationOnce(async () => ({
      queryInfo: {
        type: 'image',
        id: fixtures['/articles/doc/listArticleTest5'].attachmentHash,
      },
      hits: [],
    }));

    createTranscript.mockImplementationOnce(async () => ({
      id: 'transcript-id',
      status: 'SUCCESS',
      text: '憶昔封書與君夜，金鑾殿後欲明天。微之，微之！此夕此心，君知之乎！',
    }));

    // Expect to return according to created transcript
    expect(
      await gql`
        {
          ListArticles(
            orderBy: [{ _score: DESC }]
            filter: {
              mediaUrl: "http://foo.com/input_image.jpeg"
              transcript: { shouldCreate: true }
            }
          ) {
            edges {
              score
              node {
                id
                articleType
                attachmentHash
              }
              highlight {
                text
              }
            }
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "ListArticles": Object {
            "edges": Array [
              Object {
                "highlight": Object {
                  "text": "
            <HIGHLIGHT>憶昔封書與君夜</HIGHLIGHT>，<HIGHLIGHT>金鑾殿後欲明天</HIGHLIGHT>。今夜<HIGHLIGHT>封書</HIGHLIGHT>在何處？廬山庵裏曉燈前。籠鳥檻猿俱未死，人間相見是何年？

            <HIGHLIGHT>微之</HIGHLIGHT>，<HIGHLIGHT>微之</HIGHLIGHT>！<HIGHLIGHT>此夕此心</HIGHLIGHT>，<HIGHLIGHT>君知之乎</HIGHLIGHT>！
          ",
                },
                "node": Object {
                  "articleType": "TEXT",
                  "attachmentHash": "",
                  "id": "listArticleTest1",
                },
                "score": 18.921206,
              },
            ],
          },
        },
      }
    `);

    expect(createTranscript).toHaveBeenCalledTimes(1);
  });

  afterAll(() => unloadFixtures(fixtures));
});
