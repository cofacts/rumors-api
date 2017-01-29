import {
  GraphQLInt,
  GraphQLList,
} from 'graphql';

import {
  getFilterableType,
  getSortableType,
  getSortArgs,
  pagingArgs,
  getArithmeticExpressionType,
  getOperatorAndOperand,
} from 'graphql/util';

import getIn from 'util/getInFactory';

import client, { processMeta } from 'util/client';
import Article from 'graphql/models/Article';

export default {
  type: new GraphQLList(Article),
  args: {
    filter: {
      type: getFilterableType('ListArticleFilter', {
        replyCount: { type: getArithmeticExpressionType('ListArticleReplyCountExpr', GraphQLInt) },
      }),
    },
    orderBy: {
      type: getSortableType('ListArticleOrderBy', ['_score', 'updatedAt', 'createdAt']),
    },
    ...pagingArgs,
  },
  async resolve(rootValue, { filter = {}, orderBy = [], first, skip }) {
    // Ref: http://stackoverflow.com/a/8831494/1582110
    //
    const body = {
      query: {
        match_all: {},
      },
    };

    if (orderBy.length) {
      body.sort = getSortArgs(orderBy);
    }

    if (filter.replyCount) {
      // Switch to bool query so that we can filter more_like_this results
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

    return getIn(await client.search({
      index: 'articles',
      type: 'basic',
      body,
      from: skip,
      size: first,
    }))(['hits', 'hits'], []).map(processMeta);
  },
};
