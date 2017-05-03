import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';
import getIn from 'util/getInFactory';

export default () =>
  new DataLoader(
    async searchContexts => {
      const mSearchBody = [];
      searchContexts.forEach(({ body, ...otherContext }) => {
        mSearchBody.push(otherContext);
        mSearchBody.push(body);
      });

      return (await client.msearch({ body: mSearchBody })).responses.map(resp =>
        getIn(resp)(['hits', 'hits'], []).map(processMeta)
      );
    },
    {
      cacheKeyFn: JSON.stringify,
    }
  );
