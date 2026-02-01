import { loadFixtures, unloadFixtures } from 'util/fixtures';
import gql from 'util/GraphQL';
import fixtures from '../__fixtures__/ListReplyRequests';

describe('ListReplyRequests', () => {
  beforeAll(() => loadFixtures(fixtures));

  const getCursor = async (id) => {
    const {
      data: {
        ListReplyRequests: { edges },
      },
    } = await gql`
      {
        ListReplyRequests {
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
          }
        }
      `()
    ).toMatchSnapshot('by createdAt');

    expect(
      await gql`
        {
          ListReplyRequests(
            filter: { ids: ["replyrequests2", "replyrequests4"] }
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
    ).toMatchSnapshot('by ids');
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
        query ($cursor: String) {
          ListReplyRequests(after: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `({ cursor: await getCursor('replyrequests2') })
    ).toMatchSnapshot();
  });

  it('supports before', async () => {
    expect(
      await gql`
        query ($cursor: String) {
          ListReplyRequests(before: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `({ cursor: await getCursor('replyrequests2') })
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
