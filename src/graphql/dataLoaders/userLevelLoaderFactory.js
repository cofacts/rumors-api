import DataLoader from 'dataloader';
import client from 'util/client';
import { getPointsRequired, getLevel } from 'util/level';

/**
 * @typedef LevelInfo
 * @property {number} level - the current level
 * @property {number} totalPoints - points the current user has earned
 * @property {number} currentLevelPoints - points required for the current level
 * @property {number} nextLevelPoints - points required for the next level
 */

export default () =>
  new DataLoader(
    /**
     *
     * @param {string[]} userIds - list of userIds
     * @returns {Promise<LevelInfo[]>} - LevelInfo of each user
     */
    async userIds => {
      // Currently "point" is defined as number of authored article replies.
      const body = userIds.reduce(
        (commands, userId) =>
          commands.concat(
            {
              index: 'articles',
              type: 'doc',
            },
            {
              size: 0,
              aggs: {
                articleReplies: {
                  nested: {
                    path: 'articleReplies',
                  },
                  aggs: {
                    authored: {
                      filter: {
                        bool: {
                          must: [
                            {
                              term: {
                                'articleReplies.userId': userId,
                              },
                            },
                            {
                              term: {
                                'articleReplies.appId': 'WEBSITE',
                              },
                            },
                            {
                              term: {
                                'articleReplies.status': 'NORMAL',
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            }
          ),
        []
      );

      return (await client.msearch({ body })).responses.map(
        ({
          aggregations: {
            articleReplies: {
              authored: { doc_count: totalPoints },
            },
          },
        }) => {
          const level = getLevel(totalPoints);
          return {
            level,
            totalPoints,
            currentLevelPoints: getPointsRequired(level),
            nextLevelPoints: getPointsRequired(level + 1),
          };
        }
      );
    }
  );
