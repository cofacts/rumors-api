import client from 'util/client';

// fixtureMap:
// {
//   '/articles/basic/1': { ... body of article 1 ... },
//   '/replies/basic/2': { ... body of reply 2 ... },
// }
//

export async function loadFixtures(fixtureMap) {
  const body = [];
  Object.keys(fixtureMap).forEach(key => {
    const [, _index, _type, _id] = key.split('/');
    body.push({ index: { _index, _type, _id } });
    body.push(fixtureMap[key]);
  });

  // refresh() should be invoked after bulk insert, or re-index happens every 1 seconds
  //
  // ref: https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-update-settings.html#bulk
  //      https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-refresh.html
  //
  const { body: result } = await client.bulk({ body, refresh: 'true' });

  /* istanbul ignore if */
  if (result.errors) {
    throw new Error(
      `Fixture load failed : ${JSON.stringify(result, null, '  ')}`
    );
  }
}

export async function unloadFixtures(fixtureMap) {
  const body = Object.keys(fixtureMap).map(key => {
    const [, _index, _type, _id] = key.split('/');
    return { delete: { _index, _type, _id } };
  });

  const { body: result } = await client.bulk({ body, refresh: 'true' });

  /* istanbul ignore if */
  if (result.errors) {
    throw new Error(
      `Fixture unload failed : ${JSON.stringify(result, null, '  ')}`
    );
  }
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
