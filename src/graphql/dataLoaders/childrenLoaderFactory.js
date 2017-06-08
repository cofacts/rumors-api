import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';
import getIn from 'util/getInFactory';

// Given {childType, parentId}
// returns all childrens of that parentId.
//
export default () =>
  new DataLoader(
    async inputs => {
      const body = [];
      inputs.forEach(({ index = 'data', childType, parentId }) => {
        body.push({ index });
        body.push({ query: { parent_id: { type: childType, id: parentId } } });
      });


      return (await client.msearch({ body })).responses.map(resp =>
        getIn(resp)(['hits', 'hits'], []).map(processMeta)
      );
    },
    {
      cacheKeyFn: ({
        index = 'data',
        childType,
        parentId,
      }) => `/${index}/${childType}?parent=${parentId}`,
    }
  );
