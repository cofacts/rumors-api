import { GraphQLList, GraphQLNonNull, GraphQLString } from 'graphql';
import {
  createFilterType,
  createSortType,
  createConnectionType,
  timeRangeInput,
  pagingArgs,
  getSortArgs,
  getRangeFieldParamFromArithmeticExpression,
  DEFAULT_REPLY_REQUEST_STATUSES,
} from 'graphql/util';
import ReplyRequest from 'graphql/models/ReplyRequest';
import ReplyRequestStatusEnum from 'graphql/models/ReplyRequestStatusEnum';

export default {
  args: {
    filter: {
      type: createFilterType('ListReplyRequestFilter', {
        userId: {
          type: GraphQLString,
        },
        appId: {
          type: GraphQLString,
        },
        articleId: {
          type: GraphQLString,
        },
        createdAt: {
          type: timeRangeInput,
        },
        statuses: {
          type: new GraphQLList(new GraphQLNonNull(ReplyRequestStatusEnum)),
          defaultValue: DEFAULT_REPLY_REQUEST_STATUSES,
          description: 'List only reply requests with specified statuses',
        },
      }),
    },
    orderBy: {
      type: createSortType('ListReplyRequestOrderBy', ['createdAt', 'vote']),
    },
    ...pagingArgs,
  },
  async resolve(rootValue, { orderBy = [], filter = {}, ...otherParams }) {
    const filterQueries = [
      {
        terms: {
          status: filter.statuses || DEFAULT_REPLY_REQUEST_STATUSES,
        },
      },
    ];

    ['userId', 'appId', 'articleId'].forEach(field => {
      if (!filter[field]) return;
      filterQueries.push({ term: { [field]: filter[field] } });
    });

    if (filter.createdAt)
      filterQueries.push({
        range: {
          createdAt: getRangeFieldParamFromArithmeticExpression(
            filter.createdAt
          ),
        },
      });

    const body = {
      sort: getSortArgs(orderBy, {
        vote: o => ({
          'feedbacks.score': {
            order: o,
            mode: 'sum',
            nested: {
              path: 'feedbacks',
            },
          },
        }),
      }),
      query: {
        bool: {
          filter: filterQueries,
        },
      },
    };

    return {
      index: 'replyrequests',
      type: 'doc',
      body,
      ...otherParams,
    };
  },
  type: createConnectionType('ListReplyRequestConnection', ReplyRequest),
};
