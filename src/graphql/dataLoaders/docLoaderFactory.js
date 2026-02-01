import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';

// Given document {index, id}
// returns the specified documents.
//
export default () =>
  new DataLoader(
    async (indexTypeIds) => {
      const docs = indexTypeIds.map(({ index, id }) => ({
        _index: index,
        _id: id,
      }));

      return (
        await client.mget({
          body: { docs },
        })
      ).docs.map(processMeta);
    },
    {
      cacheKeyFn: ({ index, id }) => `/${index}/${id}`,
    }
  );
