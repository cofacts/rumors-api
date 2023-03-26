import DataLoader from 'dataloader';

/**
 * Given AI response docId and type, return the list of related aiResponses (up to 10 AI Responses)
 */
export default dataLoaders =>
  new DataLoader(
    async args =>
      dataLoaders.searchResultLoader.loadMany(
        args.map(({ type, docId }) => ({
          index: 'airesponses',
          type: 'doc',
          body: {
            query: {
              bool: {
                must: [{ term: { type } }, { term: { docId } }],
              },
            },
            sort: {
              createdAt: 'desc',
            },
            size: 10,
          },
        }))
      ),
    {
      cacheKeyFn: ({ type, docId }) => `/${type}/${docId}`,
    }
  );
