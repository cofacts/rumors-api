import {
  createFilterType,
  createSortType,
  createConnectionType,
  pagingArgs,
  getSortArgs,
} from 'graphql/util';
import ArticleReplyFeedback from 'graphql/models/ArticleReplyFeedback';

export default {
  args: {
    filter: {
      type: createFilterType('ListArticleReplyFeedbackFilter', {
        replyCount: {
          type: getArithmeticExpressionType(
            'ListArticleReplyCountExpr',
            GraphQLInt
          ),
          description:
            'List only the articles whose number of replies matches the criteria.',
        },
        createdAt: {
          type: getArithmeticExpressionType(
            'ListArticleCreatedAtExpr',
            GraphQLString
          ),
          description: `
            List only the articles reply feedbacks that were created between the specific time range.
            The time range value is in elasticsearch date format (https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-date-format.html)
          `,
        },
      }
    },
    orderBy: {
      type: createSortType('ListArticleReplyFeedbackOrderBy', ['createdAt', 'updatedAt', 'score']),
    },
    ...pagingArgs,
  },
  async resolve(rootValue, { orderBy = [], ...otherParams }) {
    const body = {
      sort: getSortArgs(orderBy),
    };

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'categories',
      type: 'doc',
      body,
      ...otherParams,
    };
  },
  type: createConnectionType('ListCategoryConnection', Category),
};
