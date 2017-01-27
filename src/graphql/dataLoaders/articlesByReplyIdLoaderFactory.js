import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';

export default () => new DataLoader(async (replyIds) => {
  const body = [];

  replyIds.forEach((id) => {
    body.push({ index: 'articles', type: 'basic' });

    // https://www.elastic.co/guide/en/elasticsearch/guide/current/_finding_multiple_exact_values.html
    //
    body.push({
      query: {
        constant_score: {
          filter: {
            term: {
              replyIds: id,
            },
          },
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
