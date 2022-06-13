import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/GetReplyAndArticle';

describe('GetReplyAndGetArticle', () => {
  beforeAll(() => loadFixtures(fixtures));

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

    it('relatedArticles should work', async () => {
      // No param
      //
      expect(
        await gql`
          {
            GetArticle(id: "foo") {
              relatedArticles {
                edges {
                  cursor
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
                  score
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
                  cursor
                  node {
                    id
                    text
                  }
                  score
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
                  cursor
                  node {
                    id
                    text
                  }
                  score
                }
              }
            }
          }
        `()
      ).toMatchSnapshot('relatedArticle sorting test');
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
                  cursor
                  node {
                    id
                  }
                  score
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
                  cursor
                  node {
                    id
                  }
                  score
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
  });

  afterAll(() => unloadFixtures(fixtures));
});
