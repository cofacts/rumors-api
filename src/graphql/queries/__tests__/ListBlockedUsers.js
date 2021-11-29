import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import { getCursor } from 'graphql/util';
import fixtures from '../__fixtures__/ListBlockedUsers';

describe('ListBlockedUsers', () => {
  beforeAll(() => loadFixtures(fixtures));

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
        query($cursor: String) {
          ListBlockedUsers(after: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `({ cursor: getCursor(['blockedUser2']) })
    ).toMatchSnapshot();
  });

  it('supports before', async () => {
    expect(
      await gql`
        query($cursor: String) {
          ListBlockedUsers(before: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `({ cursor: getCursor(['blockedUser2']) })
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
