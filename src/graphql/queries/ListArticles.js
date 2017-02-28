import {
  GraphQLInt,
} from 'graphql';

import {
  createFilterType,
  createSortType,
  getSortArgs,
  pagingArgs,
  getArithmeticExpressionType,
  getOperatorAndOperand,
} from 'graphql/util';


import { ArticleConnection } from 'graphql/models/Article';

export default {
  args: {
    filter: {
      type: createFilterType('ListArticleFilter', {
        replyCount: { type: getArithmeticExpressionType('ListArticleReplyCountExpr', GraphQLInt) },
      }),
    },
    orderBy: {
      type: createSortType('ListArticleOrderBy', [
        'updatedAt',
        'createdAt',
        'replyRequestCount',
      ]),
    },
    ...pagingArgs,
  },
  async resolve(rootValue, { filter = {}, orderBy = [], ...otherParams }) {
    const body = {
      query: {
        // Ref: http://stackoverflow.com/a/8831494/1582110
        //
        match_all: {},
      },
      sort: getSortArgs(orderBy, {
        replyRequestCount(order) {
          return {
            _script: {
              type: 'number',
              script: { inline: "doc['replyRequestIds'].values.size()" },
              order,
            },
          };
        },
      }),
    };

    if (filter.replyCount) {
      // Switch to bool query so that we can filter match_all results
      //
      const { operator, operand } = getOperatorAndOperand(filter.replyCount);
      body.query = {
        bool: {
          must: body.query,
          filter: { script: { script: {
            inline: `doc['replyConnectionIds'].length ${operator} params.operand`,
            params: {
              operand,
            },
          } } },
        },
      };
    }

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'articles',
      type: 'basic',
      body,
      ...otherParams,
    };
  },
  type: ArticleConnection,
};
