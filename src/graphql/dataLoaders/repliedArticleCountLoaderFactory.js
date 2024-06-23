import DataLoader from 'dataloader';
import client from 'util/client';

export default () =>
  new DataLoader(
    /**
     * @param {string[]} userIds - list of userIds
     * @returns {Promise<number[]>} - replied article count for the specified user
     */
    async (userIds) => {
      const body = userIds.reduce(
        (commands, userId) =>
          commands.concat(
            {
              index: 'articles',
              type: 'doc',
            },
            {
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
            }
          ),
        []
      );

      return (await client.msearch({ body })).body.responses.map(
        ({ hits: { total } }) => total
      );
    }
  );
