import DataLoader from 'dataloader';
import client from 'util/client';

// Given {childType, parentId}
// returns the children count of that parentId.
//
export default () =>
  new DataLoader(
    async inputs => {
      const body = [];
      inputs.forEach(({ index = 'data', childType, parentId }) => {
        body.push({ index });
        body.push({ query: { parent_id: { type: childType, id: parentId } } });
      });

      return (await client.msearch({
        body,
        filterPath: '*.hits.total',
      })).responses.map(resp => resp.hits.total);
    },
    {
      cacheKeyFn: ({
        index = 'data',
        childType,
        parentId,
      }) => `/${index}/${childType}?parent=${parentId}`,
    }
  );
