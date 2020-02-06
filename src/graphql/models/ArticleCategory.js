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

import MOCK_CATEGORY_DATA from '../mockCategories';

export default new GraphQLObjectType({
  name: 'ArticleCategory',
  description: 'The linkage between an Article and a Category',
  fields: () => ({
    categoryId: { type: GraphQLString },

    category: {
      type: Category,
      resolve: ({ categoryId }) =>
        MOCK_CATEGORY_DATA.find(({ id }) => id === categoryId),
    },

    articleId: { type: GraphQLString },

    article: {
      type: Article,
      resolve: ({ articleId }, args, { loaders }) =>
        loaders.docLoader.load({ index: 'articles', id: articleId }),
    },

    user: {
      type: User,
      description: 'The user who conencted this reply and this article.',
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
      resolve: ({ articleId, categoryId }) => {
        // TODO: Mock
        return [
          {
            articleId,
            categoryId,
            userId: '1',
            appId: 'test',
            score: 1,
            createdAt: '2020-02-06T09:08:45.775Z',
            updatedAt: '2020-02-06T09:08:45.775Z',
          },
          {
            articleId,
            categoryId,
            userId: '2',
            appId: 'test',
            score: -1,
            comment: 'Test comment',
            createdAt: '2020-02-06T09:09:45.775Z',
            updatedAt: '2020-02-06T09:09:45.775Z',
          },
          {
            articleId,
            categoryId,
            userId: '3',
            appId: 'test',
            score: 1,
            createdAt: '2020-02-06T09:10:45.775Z',
            updatedAt: '2020-02-06T09:10:45.775Z',
          },
        ];
      },
    },

    ownVote: {
      type: FeedbackVote,
      description:
        'The feedback of current user. null when not logged in or not voted yet.',
      resolve: () => {
        // TODO: implement this
        return null;
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
