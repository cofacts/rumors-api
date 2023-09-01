import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/ListAIResponses';
// import { getCursor } from 'graphql/util';

describe('ListAIResponses', () => {
  beforeAll(() => loadFixtures(fixtures));
  afterAll(() => unloadFixtures(fixtures));

  it('lists all AI responses', async () => {
    expect(
      await gql`
        {
          ListAIResponses {
            totalCount
            edges {
              node {
                id
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
          ListAIResponses(orderBy: [{ createdAt: DESC }]) {
            edges {
              node {
                id
                createdAt
              }
            }
          }
        }
      `()
    ).toMatchSnapshot('by createdAt DESC');
  });

  it('filters by common filters', async () => {
    expect(
      await gql`
        {
          ListAIResponses(
            filter: { createdAt: { LTE: "2020-01-03T00:00:00.000Z" } }
          ) {
            edges {
              node {
                id
                createdAt
              }
            }
          }
        }
      `()
    ).toMatchSnapshot('createdAt <= 2020/01/03');
  });

  it('filters by AI response specific filters', async () => {
    expect(
      await gql`
        {
          ListAIResponses(filter: { statuses: [ERROR, SUCCESS] }) {
            edges {
              node {
                id
                status
              }
            }
          }
        }
      `()
    ).toMatchSnapshot('only error and success');
    expect(
      await gql`
        {
          ListAIResponses(
            filter: { updatedAt: { LTE: "2020-01-02T00:00:10.000Z" } }
          ) {
            edges {
              node {
                id
                updatedAt
              }
            }
          }
        }
      `()
    ).toMatchSnapshot('updatedAt <= 2020/1/2 00:00:10');
    expect(
      await gql`
        {
          ListAIResponses(filter: { types: [TRANSCRIPT] }) {
            edges {
              node {
                id
                status
              }
            }
          }
        }
      `()
    ).toMatchSnapshot('only transcripts');
  });
});
