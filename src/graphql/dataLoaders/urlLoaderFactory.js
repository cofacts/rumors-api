import DataLoader from 'dataloader';

/**
 * Given list of urls, return their latest fetch respectively
 */
export default dataLoaders =>
  new DataLoader(
    async urls => {
      const result = await dataLoaders.searchResultLoader.loadMany(
        urls.map(url => ({
          index: 'urls',
          type: 'doc',
          body: {
            query: {
              bool: {
                should: [{ term: { url } }, { term: { canonical: url } }],
              },
            },
          },
          sort: {
            fetchedAt: 'desc',
          },
        }))
      );

      return result && result.length ? result[0] : null;
    },
    {
      cacheKeyFn: JSON.stringify,
    }
  );
