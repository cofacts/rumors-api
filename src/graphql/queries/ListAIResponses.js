import { GraphQLNonNull, GraphQLID, GraphQLList } from 'graphql';
import {
  createFilterType,
  createSortType,
  getSortArgs,
  pagingArgs,
  createCommonListFilter,
  attachCommonListFilter,
  getRangeFieldParamFromArithmeticExpression,
  timeRangeInput,
} from 'graphql/util';

import { AIResponseConnection } from 'graphql/models/AIResponse';
import AIResponseTypeEnum from 'graphql/models/AIResponseTypeEnum';
import AIResponseStatusEnum from 'graphql/models/AIResponseStatusEnum';

export default {
  args: {
    filter: {
      type: createFilterType('ListAIResponsesFilter', {
        ...createCommonListFilter('AI responses'),
        types: {
          description:
            'If specified, only return AI repsonses with the specified types.',
          type: new GraphQLList(new GraphQLNonNull(AIResponseTypeEnum)),
        },
        docIds: {
          description:
            'If specified, only return AI repsonses under the specified doc IDs.',
          type: new GraphQLList(new GraphQLNonNull(GraphQLID)),
        },
        statuses: {
          description:
            'If specified, only return AI repsonses under the specified statuses.',
          type: new GraphQLList(new GraphQLNonNull(AIResponseStatusEnum)),
        },
        updatedAt: {
          type: timeRangeInput,
          description:
            'List only the AI responses updated within the specific time range.',
        },
      }),
    },
    orderBy: {
      type: createSortType('ListAIResponsesOrderBy', [
        'createdAt',
        'updatedAt',
      ]),
    },
    ...pagingArgs,
  },
  type: new GraphQLNonNull(AIResponseConnection),
  async resolve(
    rootValue,
    { filter = {}, orderBy = [], ...otherParams },
    { userId, appId }
  ) {
    const body = {
      sort: getSortArgs(orderBy),
      query: {
        bool: {
          filter: [],
        },
      },
    };

    attachCommonListFilter(body.query.bool.filter, filter, userId, appId);

    if (filter.updatedAt) {
      body.query.bool.filter.push({
        range: {
          updatedAt: getRangeFieldParamFromArithmeticExpression(
            filter.updatedAt
          ),
        },
      });
    }

    [
      ['types', 'type'],
      ['docIds', 'docId'],
      ['statuses', 'status'],
    ].forEach(([filterField, docField]) => {
      if (!filter[filterField]) return;
      body.query.bool.filter.push({
        terms: { [`${docField}`]: filter[filterField] },
      });
    });

    return {
      index: 'airesponses',
      type: 'doc',
      body,
      ...otherParams,
    };
  },
};
