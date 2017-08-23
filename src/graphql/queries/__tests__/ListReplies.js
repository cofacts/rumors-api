import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import { getCursor } from 'graphql/util';
import fixtures from '../__fixtures__/ListReplies';

describe('ListReplies', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('lists all replies', async () => {
    expect(
      await gql`{
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
      }`()
    ).toMatchSnapshot();
  });

  it('sorts', async () => {
    expect(
      await gql`{
        ListReplies(orderBy: [{createdAt: DESC}]) {
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
      }`()
    ).toMatchSnapshot();
  });

  it('filters', async () => {
    expect(
      await gql`{
        ListReplies(filter: {moreLikeThis: {like: "foo", minimumShouldMatch: "5%"}}) {
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
      }`()
    ).toMatchSnapshot();

    expect(
      await gql`{
        ListReplies(filter: {selfOnly: true}) {
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
      }`(
        {},
        {
          userId: 'foo',
          from: 'test',
        }
      )
    ).toMatchSnapshot();

    expect(
      await gql`{
        ListReplies(filter: {type: RUMOR}) {
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
      }`()
    ).toMatchSnapshot();
  });

  it('supports after', async () => {
    expect(
      await gql`query($cursor: String) {
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
    }`({ cursor: getCursor(['basic#moreLikeThis2']) })
    ).toMatchSnapshot();
  });

  it('supports before', async () => {
    expect(
      await gql`query($cursor: String) {
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
      }`({ cursor: getCursor(['basic#moreLikeThis1']) })
    ).toMatchSnapshot();
  });

  it('handles selfOnly filter properly if not logged in', async () => {
    expect(
      await gql`{
        ListReplies(filter: {selfOnly: true}) {
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
      }`()
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
