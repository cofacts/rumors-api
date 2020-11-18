import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';

export default () =>
  new DataLoader(
    async slugs => {
      const body = [];

      slugs.forEach(({ slug }) => {
        body.push({ index: 'users', type: 'doc' });

        body.push({
          query: {
            term: { slug },
          },
          size: 1,
        });
      });

      return (await client.msearch({
        body,
      })).body.responses.map(({ hits }) => {
        if (!hits || !hits.hits || hits.hits.length == 0) return null;
        return processMeta(hits.hits[0]);
      });
    },
    {
      cacheKeyFn: ({ slug }) => `/user/slug/${slug}`,
    }
  );
