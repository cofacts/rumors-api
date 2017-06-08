import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';

export default () =>
  new DataLoader(async replyIds => {
    const body = [];

    replyIds.forEach(id => {
      body.push({ index: 'data', type: 'replyconnections' });

      body.push({
        query: {
          term: {
            replyId: id,
          },
        },
      });
    });

    return (await client.msearch({
      body,
    })).responses.map(({ hits }) => {
      if (!hits || !hits.hits) return [];
      return hits.hits.map(processMeta);
    });
  });
