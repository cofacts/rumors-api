import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';

// Given document {index, type, id}
// returns the specified documents.
//
export default () => new DataLoader(async (indexTypeIds) => {
  const docs = indexTypeIds.map(({ index, type = 'basic', id }) => ({
    _index: index, _id: id, _type: type,
  }));

  return (await client.mget({
    body: { docs },
  })).docs.map(processMeta);
}, {
  cacheKeyFn: ({ index, type = 'basic', id }) => `/${index}/${type}/${id}`,
});
