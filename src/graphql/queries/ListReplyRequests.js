import { GraphQLList, GraphQLNonNull, GraphQLString } from 'graphql';
import {
  createFilterType,
  createSortType,
  createConnectionType,
  createCommonListFilter,
  attachCommonListFilter,
  pagingArgs,
  getSortArgs,
  DEFAULT_REPLY_REQUEST_STATUSES,
} from 'graphql/util';
import ReplyRequest from 'graphql/models/ReplyRequest';
import ReplyRequestStatusEnum from 'graphql/models/ReplyRequestStatusEnum';

export default {
  args: {
    filter: {
      type: createFilterType('ListReplyRequestFilter', {
        ...createCommonListFilter('reply requests'),
        articleId: {
          type: GraphQLString,
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
  async resolve(
    rootValue,
    { orderBy = [], filter = {}, ...otherParams },
    { userId, appId }
  ) {
    const filterQueries = [
      {
        terms: {
          status: filter.statuses || DEFAULT_REPLY_REQUEST_STATUSES,
        },
      },
    ];

    attachCommonListFilter(filterQueries, filter, userId, appId);

    if (filter.articleId) {
      filterQueries.push({ term: { articleId: filter.articleId } });
    }

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
