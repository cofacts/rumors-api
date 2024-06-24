import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../../dataLoaders/__fixtures__/analyticsLoaderFactory';
import { getCursor } from 'graphql/util';

describe('ListAnalytics', () => {
  beforeAll(() => loadFixtures(fixtures));
  afterAll(() => unloadFixtures(fixtures));

  it('lists all analytics', async () => {
    expect(
      await gql`
        {
          ListAnalytics {
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
          ListAnalytics(orderBy: [{ date: ASC }]) {
            edges {
              node {
                id
                date
              }
            }
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('filters by date', async () => {
    expect(
      await gql`
        query ($filter: ListAnalyticsFilter) {
          ListAnalytics(filter: $filter) {
            edges {
              node {
                id
                date
              }
            }
          }
        }
      `({
        filter: {
          date: {
            GTE: '2020-01-01T00:00:00.000+08:00',
            LT: '2020-01-03T00:00:00.000+08:00',
          },
        },
      })
    ).toMatchSnapshot('2020/1/1 <= date < 2020/1/3');
  });

  it('filters by type, docId, docUserId and docAppId', async () => {
    expect(
      await gql`
        query ($filter: ListAnalyticsFilter) {
          ListAnalytics(filter: $filter) {
            edges {
              node {
                id
                type
                docId
                docUserId
                docAppId
                liffUser
                liffVisit
                liff {
                  source
                  user
                  visit
                }
              }
            }
          }
        }
      `({
        filter: {
          type: 'ARTICLE',
          docId: 'articleId1',
          docUserId: 'user1',
          docAppId: 'app1',
        },
      })
    ).toMatchSnapshot('ARTICLE, articleId1, userId, app1');
  });

  it('supports after, before and first', async () => {
    expect(
      await gql`
        query ($cursor: String) {
          ListAnalytics(after: $cursor, first: 2) {
            edges {
              node {
                id
                date
              }
            }
          }
        }
      `({ cursor: getCursor(['article_articleId1_2020-01-05']) })
    ).toMatchSnapshot('after article_articleId1_2020-01-05');

    expect(
      await gql`
        query ($cursor: String) {
          ListAnalytics(before: $cursor, first: 2) {
            edges {
              node {
                id
                date
              }
            }
          }
        }
      `({ cursor: getCursor(['article_articleId1_2020-01-05']) })
    ).toMatchSnapshot('before article_articleId1_2020-01-05');
  });
});
