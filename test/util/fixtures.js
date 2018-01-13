import client from 'util/client';

// fixtureMap:
// {
//   '/articles/basic/1': { ... body of article 1 ... },
//   '/replies/basic/2': { ... body of reply 2 ... },
// }
//

export async function loadFixtures(fixtureMap) {
  const body = [];
  const indexes = new Set();
  Object.keys(fixtureMap).forEach(key => {
    const [, _index, _type, _id] = key.split('/');
    body.push({ index: { _index, _type, _id } });
    body.push(fixtureMap[key]);
    indexes.add(_index);
  });

  // refresh() should be invoked after bulk insert, or re-index happens every 1 seconds
  //
  // ref: https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-update-settings.html#bulk
  //      https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-refresh.html
  //
  const result = await client.bulk({ body, refresh: 'true' });
  console.error('RRRRRRRRRRRRRRRR', result);
}

export async function unloadFixtures(fixtureMap) {
  const indexes = new Set();
  const body = Object.keys(fixtureMap).map(key => {
    const [, _index, _type, _id] = key.split('/');
    indexes.add(_index);
    return { delete: { _index, _type, _id } };
  });

  await client.bulk({ body, refresh: 'true' });
}

// Reset a document to fixture
//
export async function resetFrom(fixtureMap, key) {
  const [, index, type, id] = key.split('/');
  await client.update({
    index,
    type,
    id,
    body: {
      doc: fixtureMap[key],
    },
    refresh: true,
  });
}
