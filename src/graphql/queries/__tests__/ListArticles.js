import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import { createTranscript } from 'graphql/util';
import { createEmbedding, createMediaEmbedding } from 'util/embedding';
import ListArticles from '../ListArticles';
import fixtures, {
  knnRetrieverFixtures,
  knnHighlightFixtures,
  knnPageFixtures,
} from '../__fixtures__/ListArticles';
import { queryVector } from 'util/vectors';
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

/**
 * Makes mediaManager.insert() act like an upload that has completed.
 *
 * @returns {object} the media entry that insert() resolves to
 */
function mockUploadedMedia() {
  const mediaEntry = { variants: [], getFile: jest.fn() };
  mediaManager.insert.mockImplementationOnce(async ({ onUploadStop }) => {
    setImmediate(() => onUploadStop(null));
    return mediaEntry;
  });
  return mediaEntry;
}

jest.mock('util/embedding', () => ({
  createEmbedding: jest.fn(),
  createMediaEmbedding: jest.fn(),
  getQueryEmbeddingCacheId: (text) => `query-text:${text}`,
  getReplyEmbeddingCacheId: (text, ref) => `reply:${text}:${ref || ''}`,
}));

describe('ListArticles', () => {
  beforeAll(() => loadFixtures(fixtures));
  beforeEach(() => {
    mediaManager.insert.mockClear();
    createTranscript.mockClear();
  });

  const getCursor = async (id) => {
    const {
      data: {
        ListArticles: { edges },
      },
    } = await gql`
      {
        ListArticles {
          edges {
            node {
              id
            }
            cursor
          }
        }
      }
    `();
    return edges.find(({ node }) => node.id === id).cursor;
  };

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
      (
        await gql`
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
        `()
      ).data.ListArticles
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

  const testReplyCount = async (expression) => {
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
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('filters by moreLikeThis and given text, find articles containing hyperlinks with the said text', async () => {
    expect(
      await gql`
        query ($like: String) {
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
        query ($like: String) {
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
      (
        await gql`
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
        `()
      ).data.ListArticles
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
      (
        await gql`
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
        `()
      ).data.ListArticles
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
        query ($cursor: String) {
          ListArticles(after: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `({ cursor: await getCursor('listArticleTest2') })
    ).toMatchSnapshot();
  });

  it('supports before', async () => {
    expect(
      await gql`
        query ($cursor: String) {
          ListArticles(before: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `({ cursor: await getCursor('listArticleTest2') })
    ).toMatchSnapshot();
  });

  it('should fail if before and after both exist', async () => {
    expect(
      await gql`
        query ($cursor: String) {
          ListArticles(before: $cursor, after: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `({ cursor: await getCursor('listArticleTest2') })
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

  it('filters via transcribedBy', async () => {
    expect(
      await gql`
        {
          ListArticles(filter: { transcribedBy: { userId: "user1" } }) {
            edges {
              node {
                id
                contributors {
                  user {
                    id
                  }
                }
                transcribedAt
              }
            }
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchSnapshot('transcribedBy user1');

    expect(
      await gql`
        {
          ListArticles(
            filter: { transcribedBy: { userId: "user1", exists: false } }
          ) {
            edges {
              node {
                id
                contributors {
                  user {
                    id
                  }
                }
                transcribedAt
              }
            }
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchSnapshot('is not transcribedBy user1');
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
              mediaSimilarity
              node {
                id
                articleType
                attachmentHash
              }
            }
          }
        }
      `({}, { user: { id: 'user-id', appId: 'WEBSITE' } })
    ).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "ListArticles": Object {
            "edges": Array [
              Object {
                "mediaSimilarity": 1,
                "node": Object {
                  "articleType": "IMAGE",
                  "attachmentHash": "ffff8000",
                  "id": "listArticleTest5",
                },
              },
              Object {
                "mediaSimilarity": 0.5,
                "node": Object {
                  "articleType": "IMAGE",
                  "attachmentHash": "ffff8001",
                  "id": "listArticleTest6",
                },
              },
              Object {
                "mediaSimilarity": 0,
                "node": Object {
                  "articleType": "TEXT",
                  "attachmentHash": "",
                  "id": "listArticleTest1",
                },
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

    // The transcript is created, but the media has no detectable text.
    mockUploadedMedia();
    createTranscript.mockImplementationOnce(async () => ({
      id: 'transcript-id',
      status: 'SUCCESS',
      text: '',
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
              node {
                id
                articleType
                attachmentHash
              }
            }
          }
        }
      `({}, { user: { id: 'user-id', appId: 'WEBSITE' } })
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

  it('filters by mediaUrl with no media manager hits but creates transcripts', async () => {
    // Assume no hits
    mediaManager.query.mockImplementationOnce(async () => ({
      queryInfo: {
        type: 'image',
        id: fixtures['/articles/doc/listArticleTest5'].attachmentHash,
      },
      hits: [],
    }));

    const mediaEntry = mockUploadedMedia();
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
            filter: { mediaUrl: "http://foo.com/input_image.jpeg" }
          ) {
            edges {
              mediaSimilarity
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
      `({}, { user: { id: 'user-id', appId: 'WEBSITE' } })
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
                "mediaSimilarity": 0,
                "node": Object {
                  "articleType": "TEXT",
                  "attachmentHash": "",
                  "id": "listArticleTest1",
                },
              },
            ],
          },
        },
      }
    `);

    // The media is uploaded as a media entry, which the transcript reads from.
    expect(mediaManager.insert).toHaveBeenCalledTimes(1);
    expect(mediaManager.insert.mock.calls[0][0].url).toBe(
      'http://foo.com/input_image.jpeg'
    );
    expect(createTranscript).toHaveBeenCalledTimes(1);
    expect(createTranscript.mock.calls[0][1]).toBe(mediaEntry);
  });

  afterAll(() => unloadFixtures(fixtures));
});

describe('ListArticles kNN retriever', () => {
  // These tests bypass `gql` and call ListArticles.resolve directly to inspect
  // the search-request body it produces — no ES roundtrip, no fixtures needed.
  const baseContext = {
    loaders: { urlLoader: { load: jest.fn().mockResolvedValue(null) } },
    userId: 'u',
    appId: 'a',
    user: { id: 'u', appId: 'a' },
  };

  beforeAll(() => loadFixtures(knnRetrieverFixtures));
  beforeEach(() => {
    createEmbedding.mockReset();
    createMediaEmbedding.mockReset();
    createTranscript.mockReset();
    mediaManager.query.mockReset();
    mediaManager.insert.mockReset();
  });
  afterAll(() => unloadFixtures(knnRetrieverFixtures));

  it('runs plain BM25 when embedding is omitted', async () => {
    const result = await ListArticles.resolve(
      {},
      { filter: { moreLikeThis: { like: 'covid vaccine' } } },
      baseContext
    );

    expect(result.body.query).toBeDefined();
    // BM25 path: no nested-knn filter, minimum_should_match stays at 1.
    expect(result.body.query.bool.minimum_should_match).toBe(1);
    expect(
      result.body.query.bool.filter.some((clause) => clause?.bool?.should)
    ).toBe(false);
    expect(createEmbedding).not.toHaveBeenCalled();
  });

  it('adds kNN as a candidate filter and ranks by BM25 when embedding is a similarity', async () => {
    createEmbedding.mockResolvedValue([{ vector: [0.11, 0.22, 0.33] }]);

    const result = await ListArticles.resolve(
      {},
      {
        filter: {
          moreLikeThis: { like: 'covid vaccine' },
          embedding: 0.7,
        },
      },
      baseContext
    );

    // Cache key + RETRIEVAL_QUERY taskType
    expect(createEmbedding).toHaveBeenCalledTimes(1);
    const [queryInfo, parts, , options] = createEmbedding.mock.calls[0];
    expect(queryInfo.type).toBe('text');
    expect(queryInfo.id).toMatch(/^query-text:/);
    expect(parts).toEqual([{ text: 'covid vaccine' }]);
    expect(options).toEqual({ taskType: 'RETRIEVAL_QUERY' });

    // BM25 should-queries stay in place for ranking; retrieval is restricted by
    // a nested-kNN filter, and minimum_should_match drops to 0.
    expect(result.body.retriever).toBeUndefined();
    expect(result.body.query.bool.should[0].nested).toBeUndefined();
    expect(result.body.query.bool.minimum_should_match).toBe(0);

    const knnFilter = result.body.query.bool.filter.find(
      (clause) => clause?.bool?.should?.[0]?.nested
    );
    const nestedKnn = knnFilter.bool.should[0].nested;
    expect(nestedKnn.path).toBe('embeddings');
    expect(nestedKnn.score_mode).toBe('max');
    expect(nestedKnn.query.knn).toMatchObject({
      field: 'embeddings.vector',
      query_vector: [0.11, 0.22, 0.33],
      k: 100,
      num_candidates: 100,
      similarity: 0.7,
    });
  });

  it('falls through to BM25 when createEmbedding throws', async () => {
    createEmbedding.mockRejectedValue(new Error('vertex offline'));

    const result = await ListArticles.resolve(
      {},
      {
        filter: {
          moreLikeThis: { like: 'covid' },
          embedding: 0.6,
        },
      },
      baseContext
    );

    expect(result.body.query).toBeDefined();
    expect(result.body.query.bool.should[0].nested).toBeUndefined();
    expect(result.body.retriever).toBeUndefined();
  });

  /** The nested-kNN filter clause of a search request body, if any */
  const getKnn = (result) =>
    result.body.query.bool.filter.find((c) => c?.bool?.should?.[0]?.nested)
      ?.bool.should[0].nested.query.knn;

  it('uploads the media that media manager does not have, then adds kNN', async () => {
    const queryInfo = { id: 'media-hash-miss', type: 'image' };
    mediaManager.query.mockResolvedValueOnce({ queryInfo, hits: [] });
    const mediaEntry = mockUploadedMedia();
    createMediaEmbedding.mockResolvedValueOnce([{ vector: [0.1, 0.2] }]);

    const result = await ListArticles.resolve(
      {},
      { filter: { mediaUrl: 'https://example.com/y.jpg', embedding: 0.6 } },
      baseContext
    );

    expect(mediaManager.insert).toHaveBeenCalledTimes(1);
    expect(mediaManager.insert.mock.calls[0][0].url).toBe(
      'https://example.com/y.jpg'
    );
    // The transcript is made from the same media entry.
    expect(createTranscript).toHaveBeenCalledWith(
      queryInfo,
      mediaEntry,
      baseContext.user
    );

    // Embedding only gets the media entry; it knows nothing about the upload.
    expect(createMediaEmbedding).toHaveBeenCalledTimes(1);
    expect(createMediaEmbedding).toHaveBeenCalledWith(
      queryInfo,
      mediaEntry,
      baseContext.user
    );

    expect(result.body.query.bool.minimum_should_match).toBe(0);
    expect(getKnn(result)).toMatchObject({
      query_vector: [0.1, 0.2],
      similarity: 0.6,
    });
  });

  it('uploads nothing when media manager already has the file', async () => {
    const queryInfo = { id: 'media-hash-stored', type: 'image' };
    const storedEntry = {
      ...queryInfo,
      variants: ['original'],
      getFile: jest.fn(),
    };
    mediaManager.query.mockResolvedValueOnce({
      queryInfo,
      hits: [{ similarity: 1, entry: storedEntry }],
    });
    createMediaEmbedding.mockResolvedValueOnce([{ vector: [0.7, 0.8] }]);

    const result = await ListArticles.resolve(
      {},
      { filter: { mediaUrl: 'https://example.com/y.jpg', embedding: 0.6 } },
      {
        ...baseContext,
        loaders: {
          ...baseContext.loaders,
          searchResultLoader: { loadMany: jest.fn().mockResolvedValue([[]]) },
        },
      }
    );

    expect(mediaManager.insert).not.toHaveBeenCalled();
    expect(createMediaEmbedding).toHaveBeenCalledWith(
      queryInfo,
      storedEntry,
      baseContext.user
    );
    expect(getKnn(result)).toMatchObject({ query_vector: [0.7, 0.8] });
  });

  it('shares one media entry between transcript and embedding', async () => {
    const queryInfo = { id: 'media-hash-both', type: 'video' };
    mediaManager.query.mockResolvedValueOnce({ queryInfo, hits: [] });
    const mediaEntry = mockUploadedMedia();
    createTranscript.mockResolvedValueOnce({
      status: 'SUCCESS',
      text: 'spoken words',
    });
    createMediaEmbedding.mockResolvedValueOnce([{ vector: [0.3, 0.4] }]);

    const result = await ListArticles.resolve(
      {},
      {
        filter: {
          mediaUrl: 'https://example.com/z.mp4',
          embedding: 0.6,
        },
      },
      baseContext
    );

    expect(mediaManager.insert).toHaveBeenCalledTimes(1);
    expect(createTranscript).toHaveBeenCalledWith(
      queryInfo,
      mediaEntry,
      baseContext.user
    );
    expect(createMediaEmbedding).toHaveBeenCalledWith(
      queryInfo,
      mediaEntry,
      baseContext.user
    );

    // Transcript ranks by BM25, embedding restricts the candidates.
    expect(
      result.body.query.bool.should.some((clause) => clause.more_like_this)
    ).toBe(true);
    expect(getKnn(result)).toMatchObject({ query_vector: [0.3, 0.4] });
  });

  it('keeps the transcript when only the embedding fails', async () => {
    mediaManager.query.mockResolvedValueOnce({
      queryInfo: { id: 'media-hash-embed-fail', type: 'audio' },
      hits: [],
    });
    mockUploadedMedia();
    createTranscript.mockResolvedValueOnce({
      status: 'SUCCESS',
      text: 'spoken words',
    });
    createMediaEmbedding.mockRejectedValueOnce(new Error('vertex offline'));

    const result = await ListArticles.resolve(
      {},
      {
        filter: {
          mediaUrl: 'https://example.com/z.mp3',
          embedding: 0.6,
        },
      },
      baseContext
    );

    expect(
      result.body.query.bool.should.some((clause) => clause.more_like_this)
    ).toBe(true);
    // No kNN: plain BM25.
    expect(result.body.query.bool.minimum_should_match).toBe(1);
    expect(getKnn(result)).toBeUndefined();
  });

  it('searches without creating anything when the media cannot be uploaded', async () => {
    mediaManager.query.mockResolvedValueOnce({
      queryInfo: { id: 'media-hash-upload-fail', type: 'video' },
      hits: [],
    });
    mediaManager.insert.mockRejectedValueOnce(new Error('upload failed'));

    const result = await ListArticles.resolve(
      {},
      {
        filter: {
          mediaUrl: 'https://example.com/z.mp4',
          embedding: 0.6,
        },
      },
      baseContext
    );

    expect(createTranscript).not.toHaveBeenCalled();
    expect(createMediaEmbedding).not.toHaveBeenCalled();
    expect(result.body.query.bool.minimum_should_match).toBe(1);
  });

  it('reads the embedding made before when the media cannot be uploaded', async () => {
    mediaManager.query.mockResolvedValueOnce({
      queryInfo: { id: 'media-hash-reuse', type: 'image' },
      hits: [],
    });
    mediaManager.insert.mockRejectedValueOnce(new Error('upload failed'));

    const result = await ListArticles.resolve(
      {},
      { filter: { mediaUrl: 'https://example.com/x.jpg', embedding: 0.75 } },
      baseContext
    );

    expect(createMediaEmbedding).not.toHaveBeenCalled();

    expect(result.body.query.bool.minimum_should_match).toBe(0);
    expect(getKnn(result)).toMatchObject({
      query_vector: [0.9, 0.8, 0.7],
      similarity: 0.75,
    });
  });

  it('only reads the transcript and embedding made before when not logged in', async () => {
    mediaManager.query.mockResolvedValueOnce({
      queryInfo: { id: 'media-hash-anonymous', type: 'image' },
      hits: [],
    });

    const result = await ListArticles.resolve(
      {},
      { filter: { mediaUrl: 'https://example.com/y.jpg', embedding: 0.75 } },
      { ...baseContext, userId: undefined, user: undefined }
    );

    // The media is still looked up, but nothing is uploaded nor generated.
    expect(mediaManager.query).toHaveBeenCalledTimes(1);
    expect(mediaManager.insert).not.toHaveBeenCalled();
    expect(createTranscript).not.toHaveBeenCalled();
    expect(createMediaEmbedding).not.toHaveBeenCalled();

    expect(getKnn(result)).toMatchObject({
      query_vector: [0.1, 0.2, 0.3],
      similarity: 0.75,
    });
  });

  it('uses the media embedding even when a text query is given along with it', async () => {
    const queryInfo = { id: 'media-hash-media-first', type: 'image' };
    mediaManager.query.mockResolvedValueOnce({ queryInfo, hits: [] });
    const mediaEntry = mockUploadedMedia();
    createMediaEmbedding.mockResolvedValueOnce([{ vector: [0.5, 0.6] }]);

    const result = await ListArticles.resolve(
      {},
      {
        filter: {
          moreLikeThis: { like: 'covid' },
          mediaUrl: 'https://example.com/y.jpg',
          embedding: 0.6,
        },
      },
      baseContext
    );

    expect(createMediaEmbedding).toHaveBeenCalledWith(
      queryInfo,
      mediaEntry,
      baseContext.user
    );
    // The text is not vectorized; it only ranks by BM25.
    expect(createEmbedding).not.toHaveBeenCalled();
    expect(
      result.body.query.bool.should.some((clause) => clause.more_like_this)
    ).toBe(true);
    expect(getKnn(result)).toMatchObject({ query_vector: [0.5, 0.6] });
  });

  it('falls back to the text embedding when the media has none', async () => {
    mediaManager.query.mockResolvedValueOnce({
      queryInfo: { id: 'media-hash-text-fallback', type: 'image' },
      hits: [],
    });
    mockUploadedMedia();
    createMediaEmbedding.mockRejectedValueOnce(new Error('vertex offline'));
    createEmbedding.mockResolvedValueOnce([{ vector: [0.5] }]);

    const result = await ListArticles.resolve(
      {},
      {
        filter: {
          moreLikeThis: { like: 'covid' },
          mediaUrl: 'https://example.com/y.jpg',
          embedding: 0.6,
        },
      },
      baseContext
    );

    expect(createEmbedding).toHaveBeenCalledTimes(1);
    expect(createEmbedding.mock.calls[0][0].type).toBe('text');
    expect(getKnn(result)).toMatchObject({ query_vector: [0.5] });
  });
});

describe('ListArticles kNN search with highlight', () => {
  // Unlike the kNN retriever tests above, these go through `gql` and hit ES, so
  // that the highlight on the kNN search request is exercised too.

  beforeAll(() => loadFixtures(knnHighlightFixtures));
  beforeEach(() => {
    createEmbedding.mockReset();
    createEmbedding.mockResolvedValue([{ vector: queryVector }]);
  });
  afterAll(() => unloadFixtures(knnHighlightFixtures));

  const query = gql`
    query ($embedding: Float) {
      ListArticles(
        filter: {
          moreLikeThis: { like: "kiwifruit smoothie recipe" }
          embedding: $embedding
        }
        orderBy: [{ _score: DESC }]
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
            }
          }
        }
      }
    }
  `;

  it('returns the BM25 highlights when kNN is applied', async () => {
    const { data, errors } = await query({ embedding: 0.8 });
    expect(errors).toBeUndefined();
    expect(createEmbedding).toHaveBeenCalledTimes(1);

    const { edges } = data.ListArticles;
    expect(edges.map(({ node }) => node.id)).toEqual([
      'knnHighlightBoth',
      'knnHighlightSemantic',
    ]);

    // Highlights are the same as the ones without kNN
    const {
      data: {
        ListArticles: { edges: bm25Edges },
      },
    } = await query();
    const bm25Highlight = bm25Edges.find(
      ({ node }) => node.id === 'knnHighlightBoth'
    ).highlight;
    expect(bm25Highlight.text).toMatch('<HIGHLIGHT>kiwifruit</HIGHLIGHT>');
    expect(bm25Highlight.hyperlinks[0].title).toMatch(
      '<HIGHLIGHT>kiwifruit</HIGHLIGHT>'
    );
    expect(edges[0].highlight).toEqual(bm25Highlight);

    // No BM25 match, no highlight
    expect(edges[1].highlight).toMatchObject({ text: null });
  });
});

describe('ListArticles kNN pagination', () => {
  // Goes through `gql` and hits ES, to check that the kNN candidates are not
  // capped at the page size (`first`): totalCount and the next page must see
  // all kNN matches.

  beforeAll(() => loadFixtures(knnPageFixtures));
  beforeEach(() => {
    createEmbedding.mockReset();
    createEmbedding.mockResolvedValue([{ vector: queryVector }]);
  });
  afterAll(() => unloadFixtures(knnPageFixtures));

  const query = gql`
    query ($after: String) {
      ListArticles(
        filter: { moreLikeThis: { like: "fruit drink" }, embedding: 0.8 }
        orderBy: [{ createdAt: DESC }]
        first: 2
        after: $after
      ) {
        totalCount
        edges {
          node {
            id
          }
          cursor
        }
      }
    }
  `;

  it('paginates through and counts all kNN matches', async () => {
    const page1 = await query();
    expect(page1.errors).toBeUndefined();
    expect(page1.data.ListArticles.totalCount).toBe(3);
    const page1Edges = page1.data.ListArticles.edges;
    expect(page1Edges.map(({ node }) => node.id)).toEqual([
      'knnPage1',
      'knnPage2',
    ]);

    const page2 = await query({
      after: page1Edges[page1Edges.length - 1].cursor,
    });
    expect(page2.errors).toBeUndefined();
    expect(page2.data.ListArticles.totalCount).toBe(3);
    expect(page2.data.ListArticles.edges.map(({ node }) => node.id)).toEqual([
      'knnPage3',
    ]);
  });
});
