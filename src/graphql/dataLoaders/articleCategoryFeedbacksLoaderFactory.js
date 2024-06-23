import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';

export default () =>
  new DataLoader(
    async (articleAndCategoryIds) => {
      const body = [];

      articleAndCategoryIds.forEach(({ articleId, categoryId }) => {
        body.push({ index: 'articlecategoryfeedbacks', type: 'doc' });

        body.push({
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
          body,
        })
      ).body.responses.map(({ hits }) => {
        if (!hits || !hits.hits) return [];

        return hits.hits.map(processMeta);
      });
    },
    {
      cacheKeyFn: ({ articleId, categoryId }) => `${articleId}__${categoryId}`,
    }
  );
