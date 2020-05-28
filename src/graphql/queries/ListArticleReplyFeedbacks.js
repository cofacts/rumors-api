import { GraphQLString, GraphQLList } from 'graphql';
import {
  createFilterType,
  createSortType,
  createConnectionType,
  timeRangeInput,
  moreLikeThisInput,
  pagingArgs,
  getSortArgs,
  getRangeFieldParamFromArithmeticExpression,
} from 'graphql/util';
import ArticleReplyFeedback from 'graphql/models/ArticleReplyFeedback';
import FeedbackVote from 'graphql/models/FeedbackVote';

export default {
  args: {
    filter: {
      type: createFilterType('ListArticleReplyFeedbackFilter', {
        userId: {
          type: GraphQLString,
        },
        appId: {
          type: GraphQLString,
        },
        articleId: {
          type: GraphQLString,
        },
        replyId: {
          type: GraphQLString,
        },
        moreLikeThis: {
          type: moreLikeThisInput,
          description: 'Search for comment field using more_like_this query',
        },
        vote: {
          type: new GraphQLList(FeedbackVote),
          description:
            'When specified, list only article reply feedbacks with specified vote',
        },
        createdAt: {
          type: timeRangeInput,
          description:
            'List only the article reply feedbacks that were created within the specific time range.',
        },
        updatedAt: {
          type: timeRangeInput,
          description:
            'List only the article reply feedbacks that were last updated within the specific time range.',
        },
      }),
    },
    orderBy: {
      type: createSortType('ListArticleReplyFeedbackOrderBy', [
        'createdAt',
        'updatedAt',
        'vote',
        {
          name: '_score',
          description: 'Full text relevance for comment field queries',
        },
      ]),
    },
    ...pagingArgs,
  },
  async resolve(rootValue, { orderBy = [], filter = {}, ...otherParams }) {
    const body = {
      sort: getSortArgs(orderBy, {
        vote: o => ({ score: { order: o } }),
      }),
      track_scores: true, // for _score sorting
    };

    const shouldQueries = []; // Affects scores
    const filterQueries = []; // Not affects scores

    ['userId', 'appId', 'articleId', 'replyId'].forEach(field => {
      if (!filter[field]) return;
      shouldQueries.push({ term: { [field]: filter[field] } });
    });

    if (filter.moreLikeThis) {
      shouldQueries.push({
        more_like_this: {
          fields: ['comment'],
          like: filter.moreLikeThis.like,
          min_term_freq: 1,
          min_doc_freq: 1,
          minimum_should_match:
            filter.moreLikeThis.minimumShouldMatch || '10<70%',
        },
      });
    }

    if (filter.vote) {
      shouldQueries.push({
        terms: {
          score: filter.vote,
        },
      });
    }

    ['createdAt', 'updatedAt'].forEach(field => {
      if (!filter[field]) return;
      shouldQueries.push({
        range: {
          [field]: getRangeFieldParamFromArithmeticExpression(filter[field]),
        },
      });
    });

    body.query = {
      bool: {
        should:
          shouldQueries.length === 0 ? [{ match_all: {} }] : shouldQueries,
        filter: filterQueries,
        minimum_should_match: 1, // At least 1 "should" query should present
      },
    };

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'articlereplyfeedbacks',
      type: 'doc',
      body,
      ...otherParams,
    };
  },
  type: createConnectionType(
    'ListArticleReplyFeedbackConnection',
    ArticleReplyFeedback
  ),
};
