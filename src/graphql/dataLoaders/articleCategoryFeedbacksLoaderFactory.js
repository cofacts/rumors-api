import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';

export default () =>
  new DataLoader(
    async (articleAndCategoryIds) => {
      const searches = [];

      articleAndCategoryIds.forEach(({ articleId, categoryId }) => {
        searches.push({ index: 'articlecategoryfeedbacks' });
        searches.push({
          query: {
            bool: {
              must: [{ term: { articleId } }, { term: { categoryId } }],
            },
          },
          size: 10000,
        });
      });

      return (
        await client.msearch({
          searches,
        })
      ).responses.map(({ hits }) => {
        if (!hits || !hits.hits) return [];

        return hits.hits.map(processMeta);
      });
    },
    {
      cacheKeyFn: ({ articleId, categoryId }) => `${articleId}__${categoryId}`,
    }
  );
