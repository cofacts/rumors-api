import { GraphQLInt, GraphQLString, GraphQLInputObjectType } from 'graphql';

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
          return {
            _script: {
              type: 'number',
              script: { inline: "doc['replyRequestIds'].values.size()" },
              order,
            },
          };
        },
      }),
      track_scores: true, // for _score sorting
    };

    if (filter.moreLikeThis) {
      body.query = {
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
    } else {
      body.query = {
        // Ref: http://stackoverflow.com/a/8831494/1582110
        //
        match_all: {},
      };
    }

    if (filter.replyCount) {
      // Switch to bool query so that we can filter match_all results
      //
      const { operator, operand } = getOperatorAndOperand(filter.replyCount);
      body.query = {
        bool: {
          must: body.query,
          filter: {
            script: {
              script: {
                inline: `doc['replyConnectionIds'].length ${operator} params.operand`,
                params: {
                  operand,
                },
              },
            },
          },
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
