import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures, {
  knnRelatedFixtures,
} from '../__fixtures__/GetReplyAndArticle';
import mediaManager from 'util/mediaManager';

jest.mock('util/mediaManager');

describe('GetReplyAndGetArticle', () => {
  beforeAll(() => loadFixtures(fixtures));
  beforeEach(() => {
    mediaManager.insert.mockClear();
  });

  describe('GetArticle', () => {
    it('should get the specified article & associated replies from ID', async () => {
      expect(
        await gql`
          {
            GetArticle(id: "foo") {
              text
              references {
                type
              }
              replyCount
              articleReplies(status: NORMAL) {
                status
                canUpdateStatus
                createdAt
                updatedAt
                articleId
                article {
                  id
                }
                replyId
                reply {
                  id
                  text
                  type
                  reference
                }
              }
              replyRequestCount
              replyRequests {
                reason
                feedbackCount
                positiveFeedbackCount
                negativeFeedbackCount
                article {
                  id
                }
              }
              requestedForReply
              attachmentHash
              attachmentUrl

              aiReplies {
                text
                status
              }
            }
          }
        `({}, { user: { id: 'fakeUser', appId: 'LINE' } })
      ).toMatchSnapshot();
    });

    it('fetches more than 10 reply requests', async () => {
      expect(
        await gql`
          {
            GetArticle(id: "manyRequests") {
              text
              replyRequestCount
              replyRequests {
                reason
              }
            }
          }
        `({}, { userId: 'fakeUser', appId: 'LINE' })
      ).toMatchSnapshot();
    });

    it('should allow filtering article replies', async () => {
      expect(
        await gql`
          {
            GetArticle(id: "foo3") {
              articleReplies {
                replyId
                reply {
                  id
                }
                status
              }
              normalReplies: articleReplies(status: NORMAL) {
                replyId
                reply {
                  id
                }
                status
              }
              deletedReplies: articleReplies(status: DELETED) {
                replyId
                reply {
                  id
                }
                status
              }
            }
          }
        `({}, { userId: 'fakeUser', appId: 'LINE' })
      ).toMatchSnapshot();

      // Test articleReplies's common filters
      expect(
        await gql`
          {
            GetArticle(id: "foo") {
              user1Replies: articleReplies(
                statuses: [NORMAL, DELETED]
                userId: "user1"
              ) {
                replyId
                userId
                appId
              }
              app1Replies: articleReplies(
                statuses: [NORMAL, DELETED]
                appId: "app1"
              ) {
                replyId
                userId
                appId
              }
              selfOnlyReplies: articleReplies(
                statuses: [NORMAL, DELETED]
                selfOnly: true
              ) {
                replyId
                userId
                appId
              }
            }
          }
        `({}, { userId: 'user2', appId: 'app2' })
      ).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "GetArticle": Object {
              "app1Replies": Array [
                Object {
                  "appId": "app1",
                  "replyId": "bar2",
                  "userId": "user2",
                },
                Object {
                  "appId": "app1",
                  "replyId": "bar",
                  "userId": "user1",
                },
              ],
              "selfOnlyReplies": Array [
                Object {
                  "appId": "app2",
                  "replyId": "bar3",
                  "userId": "user2",
                },
              ],
              "user1Replies": Array [
                Object {
                  "appId": "app2",
                  "replyId": "bar4",
                  "userId": "user1",
                },
                Object {
                  "appId": "app1",
                  "replyId": "bar",
                  "userId": "user1",
                },
              ],
            },
          },
        }
      `);
    });

    it('should return empty articleReply when there is none', async () => {
      expect(
        await gql`
          {
            GetArticle(id: "foo2") {
              articleReplies(status: DELETED) {
                replyId
                status
              }
            }
          }
        `({}, { userId: 'fakeUser', appId: 'LINE' })
      ).toMatchSnapshot();
    });

    it('relatedArticles should work for text articles', async () => {
      // No param
      //
      expect(
        await gql`
          {
            GetArticle(id: "foo") {
              relatedArticles {
                edges {
                  node {
                    id
                  }
                  highlight {
                    text
                    reference
                    hyperlinks {
                      title
                      summary
                    }
                  }
                }
              }
            }
          }
        `()
      ).toMatchSnapshot('relatedArticle no-param test');

      // filter
      //
      expect(
        await gql`
          {
            GetArticle(id: "foo") {
              relatedArticles(filter: { replyCount: { GT: 0 } }) {
                edges {
                  node {
                    id
                    text
                  }
                }
              }
            }
          }
        `()
      ).toMatchSnapshot('relatedArticle filter test');

      // sort
      //
      expect(
        await gql`
          {
            GetArticle(id: "foo") {
              relatedArticles(orderBy: [{ _score: ASC }]) {
                edges {
                  node {
                    id
                    text
                  }
                }
              }
            }
          }
        `()
      ).toMatchSnapshot('relatedArticle sorting test');
    });

    it('realtedArticles should work for media articles', async () => {
      mediaManager.query.mockImplementationOnce(async () => ({
        queryInfo: {
          type: 'image',
          id: fixtures['/articles/doc/mediaArticle'].attachmentHash,
        },
        hits: [
          {
            similarity: 1,
            entry: {
              id: fixtures['/articles/doc/mediaArticle'].attachmentHash,
            },
          },
          {
            // Simulate the case when Google drive has a media entry,
            // but no article is in Elasticsearch has that attachmentHash
            similarity: 0.9,
            entry: { id: 'exist-on-google-drive-but-not-in-db' },
          },
          {
            similarity: 0.75,
            entry: {
              id: fixtures['/articles/doc/similarMediaArticle'].attachmentHash,
            },
          },
        ],
      }));

      expect(
        await gql`
          {
            GetArticle(id: "mediaArticle") {
              relatedArticles {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }
        `()
      ).toMatchSnapshot();

      // Expect called exactly once with {id: ...}
      //
      expect(mediaManager.query.mock.calls).toMatchInlineSnapshot(`
        Array [
          Array [
            Object {
              "id": "hash-for-media-article",
            },
          ],
        ]
      `);
    });

    it('relatedArticle of blocked article can include both normal and blocked articles', async () => {
      expect(
        await gql`
          {
            GetArticle(id: "blockedArticle1") {
              relatedArticles {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }
        `()
      ).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "GetArticle": Object {
              "relatedArticles": Object {
                "edges": Array [
                  Object {
                    "node": Object {
                      "id": "foo3",
                    },
                  },
                  Object {
                    "node": Object {
                      "id": "blockedArticle2",
                    },
                  },
                  Object {
                    "node": Object {
                      "id": "foo2",
                    },
                  },
                  Object {
                    "node": Object {
                      "id": "mediaArticle",
                    },
                  },
                  Object {
                    "node": Object {
                      "id": "foo",
                    },
                  },
                ],
              },
            },
          },
        }
      `);
    });

    it('feedbacks should work', async () => {
      expect(
        await gql`
          {
            GetArticle(id: "foo") {
              articleReplies {
                feedbacks {
                  id
                  vote
                }
                positiveFeedbackCount
                negativeFeedbackCount
                feedbackCount
                createdAt
              }
            }
          }
        `()
      ).toMatchSnapshot('feedback loading test');
    });

    it('get specified article and articleCategories with NORMAL status', async () => {
      expect(
        await gql`
          {
            GetArticle(id: "foo") {
              text
              categoryCount
              articleCategories {
                id
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

    it('get specified article and articleCategories with DELETED status', async () => {
      expect(
        await gql`
          {
            GetArticle(id: "foo") {
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

    it('authenticated fields returns null for non-logged users', async () => {
      expect(
        await gql`
          {
            GetArticle(id: "foo") {
              requestedForReply
            }
          }
        `({}, { appId: 'LINE' })
      ).toMatchSnapshot();
    });

    it('can list AI Transcripts', async () => {
      expect(
        await gql`
          {
            GetArticle(id: "mediaArticle") {
              id
              aiTranscripts {
                text
                status
              }
            }
          }
        `()
      ).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "GetArticle": Object {
              "aiTranscripts": Array [
                Object {
                  "status": "SUCCESS",
                  "text": "Lorum ipsum",
                },
              ],
              "id": "mediaArticle",
            },
          },
        }
      `);
    });
  });

  describe('GetReply', () => {
    it('should get the specified reply & associated articles from ID', async () => {
      expect(
        await gql`
          {
            GetReply(id: "bar") {
              text
              type
              reference
              articleReplies {
                canUpdateStatus
                articleId
                article {
                  text
                }
              }
              status
            }
          }
        `()
      ).toMatchSnapshot();
    });

    it('should allow filtering article replies', async () => {
      expect(
        await gql`
          {
            GetReply(id: "bar2") {
              articleReplies {
                articleId
                article {
                  id
                }
                status
              }
              normalReplies: articleReplies(status: NORMAL) {
                articleId
                article {
                  id
                }
                status
              }
              deletedReplies: articleReplies(status: DELETED) {
                articleId
                article {
                  id
                }
                status
              }
            }
          }
        `()
      ).toMatchSnapshot();
    });
    it('similarReplies should work', async () => {
      // No param
      //
      expect(
        await gql`
          {
            GetReply(id: "bar") {
              similarReplies {
                edges {
                  node {
                    id
                  }
                  highlight {
                    text
                    reference
                    hyperlinks {
                      title
                      summary
                    }
                  }
                }
              }
            }
          }
        `()
      ).toMatchSnapshot('similarReply no-param test');

      // sort
      //
      expect(
        await gql`
          {
            GetReply(id: "bar") {
              similarReplies(orderBy: [{ _score: ASC }]) {
                edges {
                  node {
                    id
                  }
                  highlight {
                    text
                    reference
                    hyperlinks {
                      title
                      summary
                    }
                  }
                }
              }
            }
          }
        `()
      ).toMatchSnapshot('similarReply sorting test');
    });

    it('sets status to BLOCKED when the author is blocked', async () => {
      expect(
        await gql`
          {
            GetReply(id: "bar5") {
              status
            }
          }
        `()
      ).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "GetReply": Object {
              "status": "BLOCKED",
            },
          },
        }
      `);
    });
  });

  afterAll(() => unloadFixtures(fixtures));
});

describe('GetArticle relatedArticles with kNN', () => {
  beforeAll(() => loadFixtures(knnRelatedFixtures));
  afterAll(() => unloadFixtures(knnRelatedFixtures));

  const query = gql`
    query ($id: String!, $embedding: ArticleEmbeddingFilter) {
      GetArticle(id: $id) {
        relatedArticles(filter: { embedding: $embedding }) {
          edges {
            node {
              id
            }
            highlight {
              text
            }
          }
        }
      }
    }
  `;
  const ids = ({ data }) =>
    data.GetArticle.relatedArticles.edges.map(({ node }) => node.id);

  it('finds the neighbors of the stored embeddings, at the default threshold of a video', async () => {
    // knnRelNear 0.9 passes video -> VIDEO 0.85; knnRelFar 0.8 does not.
    const result = await query({ id: 'knnRelSelf', embedding: {} });
    expect(result.errors).toBeUndefined();
    expect(ids(result)).toEqual(['knnRelNear']);
  });

  it('takes the threshold given', async () => {
    const result = await query({
      id: 'knnRelSelf',
      embedding: { videoDocSimilarity: 0.75 },
    });
    expect(result.errors).toBeUndefined();
    expect(ids(result).sort()).toEqual(['knnRelFar', 'knnRelNear']);
  });

  it('does not search doc types without a default threshold for the query type', async () => {
    // knnRelTextNear (TEXT, 0.95) is close, but video -> TEXT has no default.
    const result = await query({ id: 'knnRelSelf', embedding: {} });
    expect(ids(result)).not.toContain('knnRelTextNear');

    const given = await query({
      id: 'knnRelSelf',
      embedding: { textDocSimilarity: 0.9 },
    });
    expect(ids(given)).toContain('knnRelTextNear');
  });

  it('treats an article without articleType as text', async () => {
    // knnRelTextNear (TEXT, 0.95 to the query vector) passes text -> TEXT.
    const result = await query({ id: 'knnRelLegacy', embedding: {} });
    expect(result.errors).toBeUndefined();
    expect(ids(result)).toContain('knnRelTextNear');
    expect(ids(result)).not.toContain('knnRelLegacy');
  });

  it('takes k nearest', async () => {
    // knnRelNear 0.9 and knnRelFar 0.8 both pass 0.75; k = 1 keeps the nearer.
    const result = await query({
      id: 'knnRelSelf',
      embedding: { videoDocSimilarity: 0.75, k: 1 },
    });
    expect(result.errors).toBeUndefined();
    expect(ids(result)).toEqual(['knnRelNear']);
  });

  it('runs no kNN when RELATED_ARTICLES_KNN is off', async () => {
    process.env.RELATED_ARTICLES_KNN = 'off';
    try {
      const result = await query({ id: 'knnRelSelf', embedding: {} });
      expect(result.errors).toBeUndefined();
      expect(ids(result)).toEqual([]);
    } finally {
      delete process.env.RELATED_ARTICLES_KNN;
    }
  });

  it('relates nothing by vector without embedding', async () => {
    const result = await query({ id: 'knnRelSelf' });
    expect(result.errors).toBeUndefined();
    expect(ids(result)).toEqual([]);
  });

  it('falls back to text similarity for an article without embeddings', async () => {
    // knnRelNoEmbeddingTwin shares words with knnRelNoEmbedding.
    const result = await query({ id: 'knnRelNoEmbedding', embedding: {} });
    expect(result.errors).toBeUndefined();
    expect(ids(result)).toEqual(['knnRelNoEmbeddingTwin']);
  });
});
