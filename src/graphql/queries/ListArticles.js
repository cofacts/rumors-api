import {
  GraphQLInt,
} from 'graphql';

import {
  createFilterType,
  createSortType,
  getSortArgs,
  getSearchAfterFromCursor,
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
  async resolve(rootValue, { filter = {}, orderBy = [], first, after }) {
    const body = {
      query: {
        // Ref: http://stackoverflow.com/a/8831494/1582110
        //
        match_all: {},
      },
      size: first,
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

    if (after) {
      body.search_after = getSearchAfterFromCursor(after);
    }

    if (filter.replyCount) {
      // Switch to bool query so that we can filter match_all results
      //
      const { operator, operand } = getOperatorAndOperand(filter.replyCount);
      body.query = {
        bool: {
          must: body.query,
          filter: { script: { script: {
            inline: `doc['replyIds'].length ${operator} params.operand`,
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
    };
  },
  type: ArticleConnection,
};
