import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/ListArticleReplyFeedbacks';

describe('ListArticleReplyFeedbacks', () => {
  beforeAll(() => loadFixtures(fixtures));
  afterAll(() => unloadFixtures(fixtures));

  it('lists all articleReplyFeedbacks', async () => {
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks {
            edges {
              node {
                id
                articleReply {
                  articleId
                  replyId
                }
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('sorts all articleReplyFeedbacks', async () => {
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(orderBy: [{ createdAt: DESC }]) {
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
    ).toMatchSnapshot('by createdAt DESC');

    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(
            orderBy: [{ vote: ASC }, { updatedAt: DESC }]
          ) {
            edges {
              node {
                id
                score
                updatedAt
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('by score ASC, then updatedAt DESC');
  });

  it('filters by DB fields xxId', async () => {
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(filter: { userId: "user1" }) {
            edges {
              node {
                id
                userId
              }
            }
            totalCount
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchSnapshot('by userId: user1');
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(filter: { appId: "app2" }) {
            edges {
              node {
                id
                appId
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('by appId: app2');
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(filter: { articleId: "a1" }) {
            edges {
              node {
                id
                article {
                  id
                  text
                }
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('by articleId: a1');
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(filter: { replyId: "r2" }) {
            edges {
              node {
                id
                reply {
                  id
                  text
                }
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('by replyId: r2');
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(filter: { replyUserId: "user2" }) {
            edges {
              node {
                id
                replyUserId
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('by replyUserId: user2');
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(filter: { articleReplyUserId: "user3" }) {
            edges {
              node {
                id
                articleReplyUserId
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('by articleReplyUserId: user3');

    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(filter: { authorId: "user2" }) {
            edges {
              node {
                id
                replyUserId
                articleReplyUserId
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('by replyUserId=user2 OR articleReplyUserId=user2');
  });

  it('filters by moreLikeThis', async () => {
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(
            filter: { moreLikeThis: { like: "COVID19" } }
          ) {
            edges {
              node {
                id
                comment
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('search for: COVID19');
  });

  it('filters by vote', async () => {
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(filter: { vote: [UPVOTE] }) {
            edges {
              node {
                id
                vote
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('UPVOTE only');
  });

  it('filters by dates', async () => {
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(
            filter: { createdAt: { LT: "2020-03-15T00:00:00Z" } }
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
    ).toMatchSnapshot('created before 2020-03-15');
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(
            filter: { updatedAt: { GT: "2020-04-15T00:00:00Z" } }
          ) {
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
    ).toMatchSnapshot('updated after 2020-04-15');
  });

  it('filters by date, vote and userId alltogether', async () => {
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(
            filter: {
              updatedAt: { GT: "2020-04-15T00:00:00Z" }
              vote: UPVOTE
              userId: "user2"
            }
          ) {
            edges {
              node {
                id
                updatedAt
                vote
                userId
              }
            }
            totalCount
          }
        }
      `({}, { appId: 'WEBSITE' })
    ).toMatchSnapshot('updated by user2 after 2020/4/15, UPVOTE');

    // Empty
    expect(
      await gql`
        {
          ListArticleReplyFeedbacks(
            filter: {
              updatedAt: { GT: "2020-04-15T00:00:00Z" }
              vote: UPVOTE
              userId: "user1"
            }
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
    ).toMatchSnapshot('should be empty');
  });
});
