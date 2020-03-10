import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import { getCursor } from 'graphql/util';
import fixtures from '../__fixtures__/ListReplies';

describe('ListReplies', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('lists all replies', async () => {
    expect(
      await gql`
        {
          ListReplies {
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
          ListReplies(orderBy: [{ createdAt: DESC }]) {
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
    ).toMatchSnapshot();
  });

  it('filters', async () => {
    expect(
      await gql`
        {
          ListReplies(
            filter: { moreLikeThis: { like: "foo", minimumShouldMatch: "5%" } }
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
    ).toMatchSnapshot();

    expect(
      await gql`
        {
          ListReplies(filter: { selfOnly: true }) {
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
      `(
        {},
        {
          userId: 'foo',
          appId: 'test',
        }
      )
    ).toMatchSnapshot();

    expect(
      await gql`
        {
          ListReplies(filter: { type: RUMOR }) {
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
    ).toMatchSnapshot();
  });

  it('filters by moreLikeThis and given text, find replies containing hyperlinks with the said text', async () => {
    expect(
      await gql`
        {
          ListReplies(
            filter: { moreLikeThis: { like: "「長鋏歸來乎！食無魚。」" } }
          ) {
            edges {
              node {
                id
              }
            }
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it("filters by moreLikeThis and given text, find replies with the said URL's content", async () => {
    expect(
      await gql`
        {
          ListReplies(
            filter: {
              moreLikeThis: {
                like: "請看 http://foo.com"
                minimumShouldMatch: "5%"
              }
            }
          ) {
            edges {
              node {
                id
              }
            }
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('filters by time range', async () => {
    expect(
      await gql`
        {
          ListReplies(
            filter: { createdAt: { GT: "2020-02-06T00:00:00.000Z" } }
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
    expect(
      await gql`
        {
          ListReplies(
            filter: { createdAt: { LTE: "2020-02-06T00:00:00.000Z" } }
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
    expect(
      await gql`
        {
          ListReplies(
            filter: {
              createdAt: {
                GTE: "2020-02-04T00:00:00.000Z"
                LTE: "2020-02-06T00:00:00.000Z"
              }
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

  it('filters by mixed query', async () => {
    // Mixes 'should' and 'filter' query. At least 1 'should' must match.
    // Therefore, this query should only match 2 results instead of all that satisfies type = NOT_ARTICLE

    expect(
      await gql`
        {
          ListReplies(
            filter: { type: NOT_ARTICLE, moreLikeThis: { like: "foo" } }
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
          ListReplies(after: $cursor) {
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
      `({ cursor: getCursor(['moreLikeThis2']) })
    ).toMatchSnapshot();
  });

  it('supports before', async () => {
    expect(
      await gql`
        query($cursor: String) {
          ListReplies(before: $cursor) {
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
      `({ cursor: getCursor(['moreLikeThis1']) })
    ).toMatchSnapshot();
  });

  it('handles selfOnly filter properly if not logged in', async () => {
    expect(
      await gql`
        {
          ListReplies(filter: { selfOnly: true }) {
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
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
