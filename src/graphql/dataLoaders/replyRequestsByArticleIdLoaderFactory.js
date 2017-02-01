import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';

export default () => new DataLoader(async (articleIds) => {
  const body = [];

  articleIds.forEach((id) => {
    body.push({ index: 'replyrequests', type: 'basic' });

    // https://www.elastic.co/guide/en/elasticsearch/guide/current/_finding_exact_values.html
    //
    body.push({
      query: {
        constant_score: {
          filter: {
            term: {
              articleId: id,
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
