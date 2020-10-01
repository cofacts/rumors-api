import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import CreateBackendUsers from '../createBackendUsers';
import fixtures from '../__fixtures__/createBackendUsers';

jest.setTimeout(8000);

const checkAllDocsForIndex = async (index) => {
  let res = {};
  try {
    console.log(`checking ${index}`);
    const { body: { hits: { hits: docs } } } = await client.search({
      index,
      body: {
        query: {
          match_all: {}
        },
        size: 10000,
        sort: [{ _id: 'asc' }],
      },
    });
    docs.forEach(doc => res[`/${doc._index}/${doc._type}/${doc._id}`] = doc._source)
  }
  catch (e) {
    console.log(e);
  }
  const expected = fixtures.expectedResults[index];
  expect(
    res
  ).toMatchObject(expected);

  expect(
    Object.keys(res).length
  ).toBe(Object.keys(expected).length);
}

const indices = ['users', 'articlecategoryfeedbacks', 'articlereplyfeedbacks', 'articles', 'replies', 'replyrequests'];

describe('createBackendUsers', () => {
  beforeAll(async () => {
    await loadFixtures(fixtures.fixturesToLoad);
    await new CreateBackendUsers({
      batchSize: 20,
      aggBatchSize: 5
    }).execute();
  })
  afterAll(async () => {
    for (const index of indices) {
      await unloadFixtures(fixtures.expectedResults[index]);
    }
  });
  for (const index of indices) {
    it(`All ${index} docs have been created/updated accordingly`, async () => {
      await checkAllDocsForIndex(index);
    });
  }
})
