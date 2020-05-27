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
  });
});
