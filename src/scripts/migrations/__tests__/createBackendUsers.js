import { loadFixtures, clearIndices, saveStateForIndices } from 'util/fixtures';
import client from 'util/client';
import CreateBackendUsers from '../createBackendUsers';
import fixtures from '../__fixtures__/createBackendUsers';
import { sortBy } from 'lodash';
jest.setTimeout(120000);

const checkAllDocsForIndex = async index => {
  let res = {};
  const {
    body: {
      hits: { hits: docs },
    },
  } = await client.search({
    index,
    body: {
      query: {
        match_all: {},
      },
      size: 10000,
      sort: [{ _id: 'asc' }],
    },
  });

  docs.forEach(doc => (res[`/${index}/${doc._type}/${doc._id}`] = doc._source));

  const expected = fixtures.expectedResults[index];
  expect(sortBy(Object.keys(res))).toStrictEqual(sortBy(Object.keys(expected)));

  expect(res).toMatchObject(expected);
};

const indices = [
  'users',
  'articlecategoryfeedbacks',
  'articlereplyfeedbacks',
  'articles',
  'replies',
  'replyrequests',
  'analytics',
];

let dbStates = {};
describe('createBackendUsers', () => {
  beforeAll(async () => {
    try {
      console.log('in beforeAll');
      dbStates = await saveStateForIndices(indices);
      console.log('state loaded');
      console.log(JSON.stringify(dbStates, null, 2));
      await clearIndices(indices);
      console.log('indices cleared');
      await loadFixtures(fixtures.fixturesToLoad);
      console.log('fixture loaded');

      await new CreateBackendUsers({
        batchSize: 50,
        aggBatchSize: 10,
        analyticsBatchSize: 100,
      }).execute();
      console.log('script executed');

      for (const index of indices) {
        await client.indices.refresh({ index });
      }
      console.log('indices refreshed');
    } catch (e) {
      console.log(e);
    }
  });
  afterAll(async () => {
    await clearIndices(indices);

    await loadFixtures(dbStates);
  });

  for (const index of indices) {
    it(`All ${index} docs have been created/updated accordingly`, async () => {
      console.log('testing ' + index);

      await checkAllDocsForIndex(index);
    });
  }
});
