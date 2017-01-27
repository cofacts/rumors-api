import client from 'util/client';

// fixtureMap:
// {
//   '/articles/basic/1': { ... body of article 1 ... },
//   '/replies/basic/2': { ... body of reply 2 ... },
// }
//

export function loadFixtures(fixtureMap) {
  const body = [];
  Object.keys(fixtureMap).forEach((key) => {
    const [, _index, _type, _id] = key.split('/');
    body.push({ index: { _index, _type, _id } });
    body.push(fixtureMap[key]);
  });
  return client.bulk({ body });
}

export function unloadFixtures(fixtureMap) {
  return client.bulk({ body: Object.keys(fixtureMap).map((key) => {
    const [, _index, _type, _id] = key.split('/');
    return { delete: { _index, _type, _id } };
  }) });
}
