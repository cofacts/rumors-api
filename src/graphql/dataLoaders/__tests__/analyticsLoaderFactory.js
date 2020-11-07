import { loadFixtures, unloadFixtures } from 'util/fixtures';
import DataLoaders from '../index';
import fixtures from '../__fixtures__/analyticsLoaderFactory';
import MockDate from 'mockdate';

const loader = new DataLoaders();
MockDate.set(1578589200000); // 2020-01-10T01:00:00.000+08:00

describe('analyticsLoaderFactory', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('should load last 31 days of data for given id', async () => {
    const res = await loader.analyticsLoader.load({
      docId: 'article0',
      docType: 'article',
    });
    expect(res).toMatchSnapshot();
    expect(res.length).toBe(31);
  });

  it('should load data for id with date range (start of day)', async () => {
    expect(
      await loader.analyticsLoader.load({
        docId: 'article0',
        docType: 'article',
        dateRange: {
          gte: '2020-01-01T00:00:00.000Z',
          lte: '2020-01-04T00:00:00.000Z',
        },
      })
    ).toMatchSnapshot();
  });

  it('should load data for id with date range (not start of day)', async () => {
    expect(
      await loader.analyticsLoader.load({
        docId: 'article0',
        docType: 'article',
        dateRange: {
          gte: '2020-01-01T08:00:00.000+08:00',
          lte: '2020-01-04T08:00:00.000+08:00',
        },
      })
    ).toMatchSnapshot();
  });

  it('should throw error if docId is not present', async () => {
    let error;
    try {
      await loader.analyticsLoader.load({ docType: 'article' });
    } catch (e) {
      error = e.message;
    }
    expect(error).toBe('docId is required');
  });

  it('should throw error if docType is not present', async () => {
    let error;
    try {
      await loader.analyticsLoader.load({ docId: 'article0' });
    } catch (e) {
      error = e.message;
    }
    expect(error).toBe('docType is required');
  });

  afterAll(() => unloadFixtures(fixtures));
});
