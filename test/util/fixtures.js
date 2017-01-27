import client from 'util/client';

// fixtureMap:
// {
//   '/articles/basic/1': { ... body of article 1 ... },
//   '/replies/basic/2': { ... body of reply 2 ... },
// }
//

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function loadFixtures(fixtureMap) {
  const body = [];
  Object.keys(fixtureMap).forEach((key) => {
    const [, _index, _type, _id] = key.split('/');
    body.push({ index: { _index, _type, _id } });
    body.push(fixtureMap[key]);
  });

  // After bulk operation, wait for 1sec for ElasticSearch to index.
  return client.bulk({ body }).then(() => wait(1000));
}

export function unloadFixtures(fixtureMap) {
  return client.bulk({ body: Object.keys(fixtureMap).map((key) => {
    const [, _index, _type, _id] = key.split('/');
    return { delete: { _index, _type, _id } };
  }) });
}
