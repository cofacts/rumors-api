import { loadFixtures, unloadFixtures } from 'util/fixtures';
import DataLoaders from '../index';
import fixtures from '../__fixtures__/contributionsLoaderFactory';
import MockDate from 'mockdate';

const loader = new DataLoaders();
MockDate.set(1609430400000); // 2021-01-01T00:00:00.000+08:00

describe('contributionsLoaderFactory', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('should load last year of data for given userId', async () => {
    const res = await loader.contributionsLoader.load({
      userId: 'user1',
    });
    expect(res).toMatchSnapshot();
  });

  it('should load data for the date range specified', async () => {
    expect(
      await loader.contributionsLoader.load({
        userId: 'user1',
        dateRange: {
          gte: '2020-02-01T00:00:00.000Z',
          lte: '2020-03-01T00:00:00.000Z',
        },
      })
    ).toMatchSnapshot();
  });

  it('should throw error if userId is not present', async () => {
    let error;
    try {
      await loader.contributionsLoader.load({});
    } catch (e) {
      error = e.message;
    }
    expect(error).toBe('userId is required');
  });

  afterAll(() => unloadFixtures(fixtures));
});
