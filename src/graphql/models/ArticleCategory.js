import {
  GraphQLObjectType,
  GraphQLList,
  GraphQLInt,
  GraphQLString,
  GraphQLBoolean,
} from 'graphql';

import Article from './Article';
import User, { userFieldResolver } from './User';
import Category from './Category';
import ArticleCategoryFeedback from './ArticleCategoryFeedback';
import ArticleCategoryStatusEnum from './ArticleCategoryStatusEnum';
import FeedbackVote from './FeedbackVote';
import { createConnectionType } from 'graphql/util';

import MOCK_CATEGORY_DATA from '../mockCategories';

const ArticleCategory = new GraphQLObjectType({
  name: 'ArticleCategory',
  description: 'The linkage between an Article and a Category',
  fields: () => ({
    categoryId: { type: GraphQLString },

    category: {
      type: Category,
      resolve: ({ categoryId }, args, { loaders }) =>
        loaders.docLoader.load({ index: 'categories', id: categoryId }),
    },

    articleId: { type: GraphQLString },

    article: {
      type: Article,
      resolve: ({ articleId }, args, { loaders }) =>
        loaders.docLoader.load({ index: 'articles', id: articleId }),
    },

    user: {
      type: User,
      description: 'The user who updated this category with this article.',
      resolve: userFieldResolver,
    },

    canUpdateStatus: {
      type: GraphQLBoolean,
      resolve: (
        { userId, appId },
        args,
        { userId: currentUserId, appId: currentAppId }
      ) => {
        return userId === currentUserId && appId === currentAppId;
      },
    },

    feedbackCount: {
      type: GraphQLInt,
      resolve: ({ positiveFeedbackCount = 0, negativeFeedbackCount = 0 }) =>
        positiveFeedbackCount + negativeFeedbackCount,
    },

    positiveFeedbackCount: { type: GraphQLInt },
    negativeFeedbackCount: { type: GraphQLInt },

    feedbacks: {
      type: new GraphQLList(ArticleCategoryFeedback),
      resolve: ({ articleId, categoryId }, args, { loaders }) =>
        loaders.articleCategoryFeedbacksLoader.load({ articleId, categoryId }),
    },

    ownVote: {
      type: FeedbackVote,
      description:
        'The feedback of current user. null when not logged in or not voted yet.',
      resolve: async (
        { articleId, categoryId },
        args,
        { userId, appId, loaders }
      ) => {
        if (!userId || !appId) return null;
        const feedbacks = await loaders.articleCategoryFeedbacksLoader.load({
          articleId,
          categoryId,
        });

        const ownFeedback = feedbacks.find(
          feedback => feedback.userId === userId && feedback.appId === appId
        );
        if (!ownFeedback) return null;
        return ownFeedback.score;
      },
    },

    status: {
      type: ArticleCategoryStatusEnum,
      resolve: ({ status }) => (status === undefined ? 'NORMAL' : status),
    },

    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  }),
});

function getMockCursor(articleCategory) {
  return `${articleCategory.articleId}_${articleCategory.categoryId}`;
}

export const ArticleCategoryConnection = createConnectionType(
  'ArticleCategoryConnection',
  ArticleCategory,
  {
    // TODO: When we fetch data from Elasticsearch, createConnectionType()'s default resolvers should
    // do its job, and we won't need any of the following mock resolvers below.
    //
    resolveEdges: function mockResolveEdges(mockData) {
      return mockData.map(articleCategory => ({
        node: articleCategory,
        cursor: getMockCursor(articleCategory),
      }));
    },
    resolveTotalCount: function mockResolveTotalCount() {
      return MOCK_CATEGORY_DATA.length;
    },
    resolveLastCursor: function mockResolveLastCursor() {
      return getMockCursor(MOCK_CATEGORY_DATA[MOCK_CATEGORY_DATA.length - 1]);
    },
    resolveFirstCursor: function mockResolveFirstCursor() {
      return getMockCursor(MOCK_CATEGORY_DATA[0]);
    },
  }
);

export default ArticleCategory;
