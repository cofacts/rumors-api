import DataLoader from 'dataloader';
import client, { getTotalCount } from 'util/client';

export default () =>
  new DataLoader(
    /**
     * @param {string[]} userIds - list of userIds
     * @returns {Promise<number[]>} - replied article count for the specified user
     */
    async (userIds) => {
      const searches = [];
      userIds.forEach((userId) => {
        searches.push({ index: 'articles' });
        searches.push({
          size: 0,
          query: {
            nested: {
              path: 'articleReplies',
              query: {
                bool: {
                  must: [
                    { term: { 'articleReplies.userId': userId } },
                    { term: { 'articleReplies.appId': 'WEBSITE' } },
                    { term: { 'articleReplies.status': 'NORMAL' } },
                  ],
                },
              },
            },
          },
        });
      });

      return (await client.msearch({ searches })).responses.map(
        ({ hits: { total } }) => getTotalCount(total)
      );
    }
  );
