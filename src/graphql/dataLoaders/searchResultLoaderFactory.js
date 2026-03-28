import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';
import getIn from 'util/getInFactory';

export default () =>
  new DataLoader(
    async (searchContexts) => {
      const searches = [];
      searchContexts.forEach(({ body, index, ...otherContext }) => {
        searches.push({ index });
        searches.push({
          ...otherContext,
          ...body,
        });
      });

      return (await client.msearch({ searches })).responses.map((resp) => {
        if (resp.error) throw new Error(JSON.stringify(resp.error));
        return getIn(resp)(['hits', 'hits'], []).map(processMeta);
      });
    },
    {
      cacheKeyFn: JSON.stringify,
    }
  );
