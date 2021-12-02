import { GraphQLNonNull } from 'graphql';
import {
  createFilterType,
  createSortType,
  getSortArgs,
  pagingArgs,
  timeRangeInput,
  getRangeFieldParamFromArithmeticExpression,
} from 'graphql/util';

import { UserConnection } from 'graphql/models/User';

export default {
  args: {
    filter: {
      type: createFilterType('ListBlockedUsersFilter', {
        createdAt: {
          type: timeRangeInput,
          description:
            'List only the blocked users that were registered between the specific time range.',
        },
      }),
    },
    orderBy: {
      type: createSortType('ListBlockedUsersOrderBy', ['createdAt']),
    },
    ...pagingArgs,
  },
  type: new GraphQLNonNull(UserConnection),
  async resolve(rootValue, { filter = {}, orderBy = [], ...otherParams }) {
    const body = {
      sort: getSortArgs(orderBy),
      query: {
        bool: {
          must: [
            {
              exists: {
                field: 'blockedReason',
              },
            },
          ],
          filter: [],
        },
      },
    };

    if (filter.createdAt) {
      body.query.bool.filter.push({
        range: {
          createdAt: getRangeFieldParamFromArithmeticExpression(
            filter.createdAt
          ),
        },
      });
    }

    return {
      index: 'users',
      type: 'doc',
      body,
      ...otherParams,
    };
  },
};
