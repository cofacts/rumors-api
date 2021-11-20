import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/getAllDocs';
import getAllDocs from '../getAllDocs';

beforeAll(async () => {
  await loadFixtures(fixtures);
});

afterAll(() => unloadFixtures(fixtures));

it('fetches all docs in the index by default', async () => {
  const ids = [];
  for await (const { _id } of getAllDocs('myindex')) {
    ids.push(_id);
  }

  expect(ids).toEqual(expect.arrayContaining(['bardoc1', 'bardoc2', 'notbar']));
});

it('fetches only the doc that matches the query', async () => {
  const ids = [];
  for await (const { _id } of getAllDocs('myindex', {
    term: { foo: 'bar' },
  })) {
    ids.push(_id);
  }

  expect(ids).toEqual(expect.arrayContaining(['bardoc1', 'bardoc2']));
  expect(ids).not.toEqual(expect.arrayContaining(['notbar']));
});
