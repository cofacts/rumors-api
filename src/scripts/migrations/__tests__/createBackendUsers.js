import { loadFixtures } from 'util/fixtures';
import client from 'util/client';
import CreateBackendUsers from '../createBackendUsers';
import fixtures from '../__fixtures__/createBackendUsers';
import { sortBy } from 'lodash';

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

describe('createBackendUsers', () => {
  beforeAll(async () => {
    await loadFixtures(fixtures.fixturesToLoad);

    await new CreateBackendUsers({
      batchSize: 50,
      aggBatchSize: 10,
      analyticsBatchSize: 100,
    }).execute();

    // refreshing all indices to ensure test consistency
    for (const index of indices) {
      await client.indices.refresh({ index });
    }
  });

  afterAll(async () => {
    /*for (const index of indices) {
      await client.deleteByQuery({
        index,
        body: {
          query: {
            match_all: {},
          },
        },
        refresh: 'true',
      });
    }*/
  });

  for (const index of indices) {
    it(`All ${index} docs have been created/updated accordingly`, async () => {
      await checkAllDocsForIndex(index);
    });
  }
});
