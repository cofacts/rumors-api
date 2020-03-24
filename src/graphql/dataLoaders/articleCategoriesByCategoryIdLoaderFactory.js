import DataLoader from 'dataloader';
import client from 'util/client';

export default () =>
  new DataLoader(async categoryIds => {
    const body = [];

    categoryIds.forEach(id => {
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
      });
    });

    return (await client.msearch({
      body,
    })).responses.map(({ hits }, idx) => {
      if (!hits || !hits.hits) return [];

      const categoryId = categoryIds[idx];
      return hits.hits.map(({ _id, _source: { articleCategories } }) => {
        // Find corresponding articleCategory and insert articleId
        //
        const articleCategory = articleCategories.find(
          articleCategory => articleCategory.categoryId === categoryId
        );
        articleCategory.articleId = _id;
        return articleCategory;
      });
    });
  });
