import {
  createFilterType,
  createSortType,
  createConnectionType,
  timeRangeInput,
  pagingArgs,
  getSortArgs,
  getRangeFieldParamFromArithmeticExpression,
} from 'graphql/util';
import Cooccurrence from 'graphql/models/Cooccurrence';

export default {
  args: {
    filter: {
      type: createFilterType('ListCooccurrenceFilter', {
        updatedAt: {
          type: timeRangeInput,
          description:
            'List only the cooccurrence that were last updated within the specific time range.',
        },
      }),
    },
    orderBy: {
      type: createSortType('ListCooccurrenceOrderBy', [
        'createdAt',
        'updatedAt',
      ]),
    },
    ...pagingArgs,
  },
  async resolve(rootValue, { orderBy = [], filter = {}, ...otherParams }) {
    const body = {
      sort: getSortArgs(orderBy, {
        vote: (o) => ({ score: { order: o } }),
      }),
      track_scores: true, // for _score sorting
    };

    const filterQueries = [];

    if (filter.updatedAt) {
      filterQueries.push({
        range: {
          updatedAt: getRangeFieldParamFromArithmeticExpression(
            filter.updatedAt
          ),
        },
      });
    }

    body.query = {
      bool: {
        filter: filterQueries,
        minimum_should_match: 1, // At least 1 "should" query should present
      },
    };

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'cooccurrences',
      type: 'doc',
      body,
      ...otherParams,
    };
  },
  type: createConnectionType('ListCooccurrenceConnection', Cooccurrence),
};
