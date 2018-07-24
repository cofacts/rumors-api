import DataLoader from 'dataloader';

/**
 * Given list of urls, return their latest fetch respectively
 */
export default dataLoaders =>
  new DataLoader(
    async urls => {
      const data = await dataLoaders.searchResultLoader.loadMany(
        urls.map(url => ({
          index: 'urls',
          type: 'doc',
          body: {
            query: {
              bool: {
                should: [{ term: { url } }, { term: { canonical: url } }],
              },
            },
            sort: {
              fetchedAt: 'desc',
            },
            size: 1,
          },
        }))
      );

      return data.map(result => (result && result.length ? result[0] : null));
    },
    {
      cacheKeyFn: JSON.stringify,
    }
  );
