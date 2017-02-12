import {
  GraphQLString,
  GraphQLInt,
} from 'graphql';

import {
  getFilterableType,
  getSortableType,
  getSortArgs,
  getPagedType,
  getCursor,
  getSearchAfterFromCursor,
  pagingArgs,
  getArithmeticExpressionType,
  getOperatorAndOperand,
} from 'graphql/util';

import getIn from 'util/getInFactory';
import client, { processScoredDoc } from 'util/client';
import Article from 'graphql/models/Article';

export default {
  args: {
    text: { type: GraphQLString },
    filter: {
      type: getFilterableType('SearchArticleFilter', {
        replyCount: { type: getArithmeticExpressionType('SearchArticleReplyCountExpr', GraphQLInt) },
      }),
    },
    orderBy: {
      type: getSortableType('SearchArticleOrderBy', [
        '_score',
        'updatedAt',
        'createdAt',
      ]),
    },
    ...pagingArgs,
  },

  async resolve(rootValue, { text, filter = {}, orderBy = [], first, after }) {
    const body = {
      query: {
        // Ref: http://stackoverflow.com/a/8831494/1582110
        //
        more_like_this: {
          fields: ['text'],
          like: text,
          min_term_freq: 1,
          min_doc_freq: 1,
          minimum_should_match: '10<70%',
        },
      },
    };

    if (after) {
      body.search_after = getSearchAfterFromCursor(after);
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

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'articles',
      type: 'basic',
      body,
      sort: getSortArgs(orderBy),
      size: first,
    };
  },

  type: getPagedType('SearchArticleResult', Article, { // eslint-disable-line
    async resolveEdges(searchContext) {
      const nodes = getIn(await client.search(searchContext))(['hits', 'hits'], []).map(processScoredDoc);
      return nodes.map(({ score, doc }) => ({
        node: doc,
        cursor: getCursor(doc),
        score,
      }));
    },
  }),
};
