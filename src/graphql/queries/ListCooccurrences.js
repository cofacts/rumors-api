import {
  createFilterType,
  createCommonListFilter,
  attachCommonListFilter,
  createSortType,
  createConnectionType,
  timeRangeInput,
  pagingArgs,
  getSortArgs,
  getRangeFieldParamFromArithmeticExpression,
  DEFAULT_ARTICLE_REPLY_FEEDBACK_STATUSES,
} from 'graphql/util';
import Cooccurrence from 'graphql/models/Cooccurrence';
import { GraphQLID } from 'graphql';

export default {
  args: {
    filter: {
      type: createFilterType('ListCooccurrenceFilter', {
        // ...createCommonListFilter('cooccurrences'),
        updatedAt: {
          type: timeRangeInput,
          description:
            'List only the cooccurrence that were last updated within the specific time range.',
        },
        // userId: { type: GraphQLID },
        // appId: { type: GraphQLID },
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
  async resolve(
    rootValue,
    { orderBy = [], filter = {}, ...otherParams },
    { userId, appId }
  ) {
    const body = {
      sort: getSortArgs(orderBy, {
        vote: o => ({ score: { order: o } }),
      }),
      track_scores: true, // for _score sorting
    };

    const shouldQueries = []; // Affects scores
    const filterQueries = [];
    //   {
    //     terms: {
    //       status: filter.statuses || DEFAULT_ARTICLE_REPLY_FEEDBACK_STATUSES,
    //     },
    //   },
    // ]; // Not affects scores

    // attachCommonListFilter(filter, userId, appId);

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
        should:
          shouldQueries.length === 0 ? [{ match_all: {} }] : shouldQueries,
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
  type: createConnectionType(
    'ListCooccurrenceConnection',
    Cooccurrence
  ),
};
