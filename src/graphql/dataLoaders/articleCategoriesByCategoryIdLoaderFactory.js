import DataLoader from 'dataloader';
import client from 'util/client';

export default () =>
  new DataLoader(
    async (categoryQueries) => {
      const body = [];

      categoryQueries.forEach(({ id, first, before, after }) => {
        // TODO error independently?
        if (before && after) {
          throw new Error('Use of before & after is prohibited.');
        }

        body.push({ index: 'articles', type: 'doc' });

        body.push({
          query: {
            nested: {
              path: 'articleCategories',
              query: {
                term: {
                  'articleCategories.categoryId': id,
                },
              },
            },
          },
          size: first ? first : 10,
          sort: before ? [{ updatedAt: 'desc' }] : [{ updatedAt: 'asc' }],
          search_after: before || after ? before || after : undefined,
        });
      });

      return (
        await client.msearch({
          body,
        })
      ).body.responses.map(({ hits }, idx) => {
        if (!hits || !hits.hits) return [];

        const categoryId = categoryQueries[idx].id;
        return hits.hits.map(({ _id, _source: { articleCategories } }) => {
          // Find corresponding articleCategory and insert articleId
          //
          const articleCategory = articleCategories.find(
            (articleCategory) => articleCategory.categoryId === categoryId
          );
          articleCategory.articleId = _id;
          return articleCategory;
        });
      });
    },
    {
      cacheKeyFn: ({ id, first, before, after }) =>
        `/${id}/${first}/${before}/${after}`,
    }
  );
