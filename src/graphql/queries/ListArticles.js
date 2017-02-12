import {
  GraphQLInt,
} from 'graphql';

import {
  getFilterableType,
  getSortableType,
  getSortArgs,
  getPagedType,
  getSearchAfterFromCursor,
  pagingArgs,
  getArithmeticExpressionType,
  getOperatorAndOperand,
} from 'graphql/util';


import Article from 'graphql/models/Article';

export default {
  args: {
    filter: {
      type: getFilterableType('ListArticleFilter', {
        replyCount: { type: getArithmeticExpressionType('ListArticleReplyCountExpr', GraphQLInt) },
      }),
    },
    orderBy: {
      type: getSortableType('ListArticleOrderBy', [
        'updatedAt',
        'createdAt',
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

    body.sort = getSortArgs(orderBy);

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'articles',
      type: 'basic',
      body,
      size: first,
    };
  },
  type: getPagedType('ArticleResult', Article),
};
