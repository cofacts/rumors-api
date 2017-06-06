import { GraphQLInt, GraphQLString, GraphQLInputObjectType } from 'graphql';

import {
  createFilterType,
  createSortType,
  getSortArgs,
  pagingArgs,
  getArithmeticExpressionType,
  getOperatorAndOperand,
  hasSortParam,
} from 'graphql/util';

import { ArticleConnection } from 'graphql/models/Article';

export default {
  args: {
    filter: {
      type: createFilterType('ListArticleFilter', {
        replyCount: {
          type: getArithmeticExpressionType(
            'ListArticleReplyCountExpr',
            GraphQLInt
          ),
        },
        moreLikeThis: {
          type: new GraphQLInputObjectType({
            name: 'ListArticleMoreLikeThisInput',
            fields: {
              like: { type: GraphQLString },
              minimumShouldMatch: { type: GraphQLString },
            },
          }),
        },
      }),
    },
    orderBy: {
      type: createSortType('ListArticleOrderBy', [
        '_score',
        'updatedAt',
        'createdAt',
        'replyRequestCount',
      ]),
    },
    ...pagingArgs,
  },
  async resolve(rootValue, { filter = {}, orderBy = [], ...otherParams }) {
    const body = {
      sort: getSortArgs(orderBy, {
        replyRequestCount(order) {
          return { _score: { order } };
        },
      }),
      query: {
        bool: {
          must: [{ match_all: {} }],
          should: [],
          filter: [],
        },
      },
      track_scores: true, // for _score sorting
    };

    if (filter.moreLikeThis) {
      const mlt = {
        // More-like-this should affect score sorting
        // Ref: http://stackoverflow.com/a/8831494/1582110
        //
        more_like_this: {
          fields: ['text'],
          like: filter.moreLikeThis.like,
          min_term_freq: 1,
          min_doc_freq: 1,
          minimum_should_match: filter.moreLikeThis.minimumShouldMatch ||
            '10<70%',
        },
      };

      if (hasSortParam(orderBy, '_score')) {
        // MLT query score should be taken into account
        //
        body.query.bool.must.push(mlt);
      } else {
        // MLT query should act as filter only
        //
        body.query.bool.filter.push(mlt);
      }
    }

    if (filter.replyCount) {
      const { operator, operand } = getOperatorAndOperand(filter.replyCount);
      const hasChildFilter = {
        type: 'replyconnections',
        query: { match_all: {} },
      };
      switch (operator) {
        case '==':
          hasChildFilter.max_children = +operand;
          hasChildFilter.min_children = +operand;
          break;
        case '>':
          hasChildFilter.min_children = +operand + 1;
          break;
        case '<':
          hasChildFilter.max_children = +operand - 1;
          break;
      }

      // replyCount filter do not affect score
      //
      body.query.bool.filter.push({
        has_child: hasChildFilter,
      });
    }

    if (hasSortParam(orderBy, 'replyRequestCount')) {
      // When sort using replyRequestCount,
      // number of reply requests should be taken into account in score.
      //
      body.query.bool.should.push({
        has_child: {
          type: 'replyrequests',
          score_mode: 'sum',
          query: { match_all: {} },
        },
      });
    }

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'data',
      type: 'articles',
      body,
      ...otherParams,
    };
  },
  type: ArticleConnection,
};
