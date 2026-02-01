import DataLoader from 'dataloader';
import client, { getTotalCount } from 'util/client';

export default () =>
  new DataLoader(
    /**
     * @param {string[]} userIds - list of userIds
     * @returns {Promise<number[]>} - number of article replies the specified user has voted
     */
    async (userIds) => {
      const body = userIds.reduce(
        (commands, userId) =>
          commands.concat(
            {
              index: 'articlereplyfeedbacks',
            },
            {
              size: 0,
              query: { term: { userId } },
            }
          ),
        []
      );

      return (await client.msearch({ body })).responses.map(
        ({ hits: { total } }) => getTotalCount(total)
      );
    }
  );
