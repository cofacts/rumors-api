import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';

export default () =>
  new DataLoader(
    async (slugs) => {
      const searches = [];

      slugs.forEach(({ slug }) => {
        searches.push({ index: 'users' });
        searches.push({
          query: {
            term: { slug },
          },
          size: 1,
        });
      });

      return (
        await client.msearch({
          searches,
        })
      ).responses.map(({ hits }) => {
        if (!hits || !hits.hits || hits.hits.length == 0) return null;
        return processMeta(hits.hits[0]);
      });
    },
    {
      cacheKeyFn: ({ slug }) => `/user/slug/${slug}`,
    }
  );
