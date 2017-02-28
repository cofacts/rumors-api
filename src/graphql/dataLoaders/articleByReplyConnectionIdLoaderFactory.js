import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';

export default () => new DataLoader(async (replyConnectionIds) => {
  const body = [];

  replyConnectionIds.forEach((id) => {
    body.push({ index: 'articles', type: 'basic' });

    // https://www.elastic.co/guide/en/elasticsearch/guide/current/_finding_multiple_exact_values.html
    //
    body.push({
      query: {
        constant_score: {
          filter: {
            term: {
              replyConnectionIds: id,
            },
          },
        },
      },
    });
  });

  return (await client.msearch({
    body,
  })).responses.map(({ hits }) => {
    if (!hits || !hits.hits) return null;
    return processMeta(hits.hits[0]);
  });
});
