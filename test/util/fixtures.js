import client from 'util/client';

function parseFixtureKey(keyStr) {
  const [, _index, _type, _id, _parent] = keyStr.match(
    /^\/([^/]+)\/([^/]+)\/([^?]+)(?:\?parent=(.+))?$/
  );
  return { _index, _type, _id, _parent };
}

// fixtureMap:
// {
//   '/articles/basic/1': { ... body of article 1 ... },
//   '/replies/basic/2': { ... body of reply 2 ... },
// }
//

export async function loadFixtures(fixtureMap) {
  const body = [];
  Object.keys(fixtureMap).forEach(key => {
    const indexParams = parseFixtureKey(key);
    body.push({ index: indexParams });
    body.push(fixtureMap[key]);
  });

  // refresh() should be invoked after bulk insert, or re-index happens every 1 seconds
  //
  // ref: https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-update-settings.html#bulk
  //      https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-refresh.html
  //
  await client.bulk({ body, refresh: 'true' });
}

export async function unloadFixtures(fixtureMap) {
  const body = Object.keys(fixtureMap).map(key => {
    const indexParams = parseFixtureKey(key);
    return { delete: indexParams };
  });

  await client.bulk({ body, refresh: 'true' });
}

// Reset a document to fixture
//
export async function resetFrom(fixtureMap, key) {
  const indexParams = key.split('/');
  await client.update({
    ...indexParams,
    body: {
      doc: fixtureMap[key],
    },
    refresh: true,
  });
}
