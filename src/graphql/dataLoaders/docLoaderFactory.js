import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';

// Given document URLs like ['/answers/basic/1', '/rumors/basic/2'],
// returns all documents.
//
export default () => new DataLoader(async (urls) => {
  const docs = urls.map((url) => {
    const [index, type, id] = url.slice(1).split('/');
    if (!index || !type || !id) throw new Error('docLoader should be invoked with URL patterns `/index/type/id`');
    return {
      _index: index, _id: id, _type: type,
    };
  });

  return (await client.mget({
    body: { docs },
  })).docs.map(processMeta);
});
