import { GraphQLNonNull, GraphQLID } from 'graphql';
import {
  createFilterType,
  createSortType,
  getSortArgs,
  pagingArgs,
  timeRangeInput,
  getRangeFieldParamFromArithmeticExpression,
} from 'graphql/util';

import { AnalyticsConnection } from 'graphql/models/Analytics';
import AnalyticsDocTypeEnum from 'graphql/models/AnalyticsDocTypeEnum';

export default {
  args: {
    filter: {
      type: createFilterType('ListAnalyticsFilter', {
        date: {
          type: timeRangeInput,
          description:
            'List only the activities between the specific time range.',
        },
        type: { type: AnalyticsDocTypeEnum },
        docId: { type: GraphQLID },
        docUserId: { type: GraphQLID },
        docAppId: { type: GraphQLID },
      }),
    },
    orderBy: {
      type: createSortType('ListAnalyticsOrderBy', ['date']),
    },
    ...pagingArgs,
  },
  type: new GraphQLNonNull(AnalyticsConnection),
  async resolve(rootValue, { filter = {}, orderBy = [], ...otherParams }) {
    const body = {
      sort: getSortArgs(orderBy),
      query: {
        bool: {
          filter: [],
        },
      },
    };

    if (filter.date) {
      body.query.bool.filter.push({
        range: {
          date: getRangeFieldParamFromArithmeticExpression(filter.date),
        },
      });
    }

    ['type', 'docId', 'docUserId', 'docAppId'].forEach((field) => {
      if (!filter[field]) return;
      body.query.bool.filter.push({ term: { [`${field}`]: filter[field] } });
    });

    return {
      index: 'analytics',
      type: 'doc',
      body,
      ...otherParams,
    };
  },
};
