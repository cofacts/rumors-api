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
                  versions {
                    text
                    type
                    reference
                  }
                }
              }
              replyRequestCount
              requestedForReply
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
                    text
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
              articleReplies(status: NORMAL) {
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
  });

  afterAll(() => unloadFixtures(fixtures));
});
