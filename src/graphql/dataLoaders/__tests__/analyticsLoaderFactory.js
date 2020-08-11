import { loadFixtures, unloadFixtures } from 'util/fixtures';
import DataLoaders from '../index';
import fixtures from '../__fixtures__/analyticsLoaderFactory';
import MockDate from 'mockdate';

const loader = new DataLoaders();
MockDate.set(1578614400000);

describe('analyticsLoaderFactory', () => {
  beforeAll(async () => await loadFixtures(fixtures));

  it('should load data for given id', async () => {
    expect(
      await loader.analyticsLoader.load({
        docId: 'article0',
        docType: 'article',
      })
    ).toMatchSnapshot();
  });

  it('should load data for id with date range', async () => {
    expect(
      await loader.analyticsLoader.load({
        docId: 'article0',
        docType: 'article',
        dateRange: { gte: '2020-01-02', lte: '2020-01-04' },
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

  afterAll(async () => await unloadFixtures(fixtures));
});
