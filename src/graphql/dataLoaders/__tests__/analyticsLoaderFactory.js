import { loadFixtures, unloadFixtures } from 'util/fixtures';
import DataLoaders from '../index';
import fixtures from '../__fixtures__/analyticsLoaderFactory';
import MockDate from 'mockdate';

const loader = new DataLoaders();
MockDate.set(1578614400000);
const invalidDatePairs = [
  [undefined, '2020-01-01'],
  ['2020-01-01', undefined],
  ['2020-01-02', '2020-01-01'],
  ['2020-01-02', '3020-01-01'],
  ['2020-01-01', '2020-05-35'],
  ['20200101', '2020-01-05'],
];

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
        startDate: '2020-01-02',
        endDate: '2020-01-04',
      })
    ).toMatchSnapshot();
  });

  for (const [startDate, endDate] of invalidDatePairs) {
    it('should throw error if date range is invalid', async () => {
      let error;
      try {
        await loader.analyticsLoader.load({
          docId: 'article0',
          docType: 'article',
          startDate,
          endDate,
        });
      } catch (e) {
        error = e;
      }
      expect(error).toMatchSnapshot();
    });
  }

  afterAll(async () => await unloadFixtures(fixtures));
});
