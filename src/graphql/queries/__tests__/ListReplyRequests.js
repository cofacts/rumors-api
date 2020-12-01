import { loadFixtures, unloadFixtures } from 'util/fixtures';
import gql from 'util/GraphQL';
import { getCursor } from 'graphql/util';
import fixtures from '../__fixtures__/ListReplyRequests';

describe('ListReplyRequests', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('lists all RelyRequests', async () => {
    expect(
      await gql`
        {
          ListReplyRequests {
            totalCount
            edges {
              node {
                id
                user {
                  id
                  name
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
    ).toMatchSnapshot();
  });

  it('sorts', async () => {
    expect(
      await gql`
        {
          ListReplyRequests(orderBy: [{ createdAt: DESC }]) {
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
    ).toMatchSnapshot('by createdAt');

    expect(
      await gql`
        {
          ListReplyRequests(orderBy: [{ vote: ASC }]) {
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
    ).toMatchSnapshot('by vote');
  });

  it('filters', async () => {
    expect(
      await gql`
        {
          ListReplyRequests(filter: { userId: "user1" }) {
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
    ).toMatchSnapshot('by userId');

    expect(
      await gql`
        {
          ListReplyRequests(filter: { articleId: "article1" }) {
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
    ).toMatchSnapshot('by articleId');

    expect(
      await gql`
        {
          ListReplyRequests(
            filter: { createdAt: { LTE: "2020-02-02T00:00:00.000Z" } }
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
    ).toMatchSnapshot('by createdAt');
  });

  it('filters by mixed query', async () => {
    expect(
      await gql`
        {
          ListReplyRequests(
            filter: {
              userId: "user1"
              createdAt: { GT: "2020-01-02T00:00:00.000Z" }
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
    ).toMatchSnapshot();
  });

  it('supports after', async () => {
    expect(
      await gql`
        query($cursor: String) {
          ListReplyRequests(after: $cursor) {
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
      `({ cursor: getCursor(['replyrequests2']) })
    ).toMatchSnapshot();
  });

  it('supports before', async () => {
    expect(
      await gql`
        query($cursor: String) {
          ListReplyRequests(before: $cursor) {
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
      `({ cursor: getCursor(['replyrequests2']) })
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
