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
  Object.keys(fixtureMap).forEach((key) => {
    const [, _index, _type, _id] = key.split('/');
    body.push({ index: { _index, _type, _id } });
    body.push(fixtureMap[key]);
    indexes.add(_index);
  });

  await client.bulk({ body });

  // refresh() should be invoked after bulk insert, or re-index happens every 1 seconds
  //
  // ref: https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-update-settings.html#bulk
  //      https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-refresh.html
  //
  await client.indices.refresh({ index: Array.from(indexes) });
}

export function unloadFixtures(fixtureMap) {
  return client.bulk({ body: Object.keys(fixtureMap).map((key) => {
    const [, _index, _type, _id] = key.split('/');
    return { delete: { _index, _type, _id } };
  }) });
}
