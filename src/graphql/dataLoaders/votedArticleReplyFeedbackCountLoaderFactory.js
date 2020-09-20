import DataLoader from 'dataloader';
import client from 'util/client';

export default () =>
  new DataLoader(
    /**
     * @param {string[]} userIds - list of userIds
     * @returns {Promise<number[]>} - number of article reply feedbacks the specified user has voted
     */
    async userIds => {
      const body = userIds.reduce(
        (commands, userId) =>
          commands.concat(
            {
              index: 'articlereplyfeedbacks',
              type: 'doc',
            },
            {
              size: 0,
              query: { term: { userId } },
            }
          ),
        []
      );

      return (await client.msearch({ body })).body.responses.map(
        ({ hits: { total } }) => total
      );
    }
  );
