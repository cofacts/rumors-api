import DataLoader from 'dataloader';
import client, { processMeta } from 'util/client';

export default () =>
  new DataLoader(
    async articleAndReplyIds => {
      const body = [];

      articleAndReplyIds.forEach(({ articleId, replyId }) => {
        body.push({ index: 'articlereplyfeedbacks', type: 'doc' });

        body.push({
          query: {
            bool: {
              must: [{ term: { articleId } }, { term: { replyId } }],
            },
          },
          size: 10000,
        });
      });

      return (await client.msearch({
        body,
      })).responses.map(({ hits }) => {
        if (!hits || !hits.hits) return [];

        return hits.hits.map(processMeta);
      });
    },
    {
      cacheKeyFn: ({ articleId, replyId }) => `${articleId}__${replyId}`,
    }
  );
