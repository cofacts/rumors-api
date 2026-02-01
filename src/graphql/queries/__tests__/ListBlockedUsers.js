import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/ListBlockedUsers';

describe('ListBlockedUsers', () => {
  beforeAll(() => loadFixtures(fixtures));

  const getCursor = async (id) => {
    const {
      data: {
        ListBlockedUsers: { edges },
      },
    } = await gql`
      {
        ListBlockedUsers {
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

  it('lists all blocked users', async () => {
    expect(
      await gql`
        {
          ListBlockedUsers {
            totalCount
            edges {
              node {
                id
                blockedReason
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

  it('filters by createdAt', async () => {
    expect(
      await gql`
        {
          ListBlockedUsers(
            filter: { createdAt: { GTE: "2017-01-04T00:00:00.000Z" } }
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
    ).toMatchSnapshot();
  });

  it('sorts', async () => {
    expect(
      await gql`
        {
          ListBlockedUsers(orderBy: [{ createdAt: DESC }]) {
            edges {
              node {
                id
                createdAt
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

  it('supports after', async () => {
    expect(
      await gql`
        query ($cursor: String) {
          ListBlockedUsers(after: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `({ cursor: await getCursor('blockedUser2') })
    ).toMatchSnapshot();
  });

  it('supports before', async () => {
    expect(
      await gql`
        query ($cursor: String) {
          ListBlockedUsers(before: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `({ cursor: await getCursor('blockedUser2') })
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
