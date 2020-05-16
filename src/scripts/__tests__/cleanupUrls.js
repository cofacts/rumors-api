import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client, { processMeta } from 'util/client';
import cleanupUrls, { FLAG_FIELD } from '../cleanupUrls';
import fixtures from '../__fixtures__/cleanupUrls';

it('should clean up urls', async () => {
  await loadFixtures(fixtures);

  await cleanupUrls();

  const urlsResult = (await client.search({
    index: 'urls',
    body: {
      query: {
        match_all: {},
      },
      _source: [FLAG_FIELD],
    },
  })).body.hits.hits.map(processMeta);

  expect(urlsResult).toMatchSnapshot();

  await unloadFixtures(fixtures);
});
