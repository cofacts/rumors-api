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
          description:
            'List only the articles whose number of replies matches the criteria.',
        },
        moreLikeThis: {
          type: new GraphQLInputObjectType({
            name: 'ListArticleMoreLikeThisInput',
            fields: {
              like: {
                type: GraphQLString,
                description: 'The text string to query.',
              },
              minimumShouldMatch: { type: GraphQLString },
            },
          }),
          description: 'List all articles related to a given string.',
        },
        replyRequestCount: {
          type: getArithmeticExpressionType(
            'ListArticleReplyRequestCountExpr',
            GraphQLInt
          ),
          description:
            'List only the articles whose number of replies matches the criteria.',
        },
      }),
    },
    orderBy: {
      type: createSortType('ListArticleOrderBy', [
        '_score',
        'updatedAt',
        'createdAt',
        'replyRequestCount',
        'replyCount',
        'lastRequestedAt',
      ]),
    },
    ...pagingArgs,
  },
  async resolve(rootValue, { filter = {}, orderBy = [], ...otherParams }) {
    const body = {
      sort: getSortArgs(orderBy, {
        replyCount: o => ({ normalArticleReplyCount: { order: o } }),
      }),
      track_scores: true, // for _score sorting
    };

    // Collecting queries that will be used in bool queries later
    const mustQueries = []; // Affects scores
    const filterQueries = []; // Not affects scores

    if (filter.moreLikeThis) {
      mustQueries.push({
        // Ref: http://stackoverflow.com/a/8831494/1582110
        //
        more_like_this: {
          fields: ['text'],
          like: filter.moreLikeThis.like,
          min_term_freq: 1,
          min_doc_freq: 1,
          minimum_should_match:
            filter.moreLikeThis.minimumShouldMatch || '10<70%',
        },
      });
    }

    if (filter.replyCount) {
      const { operator, operand } = getOperatorAndOperand(filter.replyCount);
      filterQueries.push({
        script: {
          script: {
            inline: `doc['normalArticleReplyCount'].value ${operator} params.operand`,
            params: {
              operand,
            },
          },
        },
      });
    }

    if (filter.replyRequestCount) {
      const { operator, operand } = getOperatorAndOperand(
        filter.replyRequestCount
      );
      filterQueries.push({
        script: {
          script: {
            inline: `doc['replyRequestCount'].value ${operator} params.operand`,
            params: {
              operand,
            },
          },
        },
      });
    }

    body.query = {
      bool: {
        must: mustQueries.length === 0 ? { match_all: {} } : mustQueries,
        filter: filterQueries,
      },
    };

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'articles',
      type: 'doc',
      body,
      ...otherParams,
    };
  },
  type: ArticleConnection,
};
