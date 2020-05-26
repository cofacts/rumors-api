import { GraphQLString, GraphQLList } from 'graphql';
import {
  createFilterType,
  createSortType,
  createConnectionType,
  timeRangeInput,
  moreLikeThisInput,
  pagingArgs,
  getSortArgs,
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
        moreLikeThis: {
          type: moreLikeThisInput,
          description: 'Search for comment using more_like_this query',
        },
        score: {
          type: new GraphQLList(FeedbackVote),
          description:
            'When specified, list only article reply feedbacks with specified score',
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
        'score',
      ]),
    },
    ...pagingArgs,
  },
  async resolve(rootValue, { orderBy = [], ...otherParams }) {
    const body = {
      sort: getSortArgs(orderBy),
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
