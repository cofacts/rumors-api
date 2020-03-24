import {
  GraphQLObjectType,
  GraphQLList,
  GraphQLInt,
  GraphQLFloat,
  GraphQLString,
  GraphQLBoolean,
} from 'graphql';

import Article from './Article';
import User, { userFieldResolver } from './User';
import Category from './Category';
import ArticleCategoryFeedback from './ArticleCategoryFeedback';
import ArticleCategoryStatusEnum from './ArticleCategoryStatusEnum';
import FeedbackVote from './FeedbackVote';
import { createConnectionType, defaultResolveEdges } from 'graphql/util';

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

    aiModel: { type: GraphQLString },
    aiConfidence: { type: GraphQLFloat },

    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  }),
});

function getCategoryIdFromParams(params) {
  return params[0].body.query.nested.query.bool.must[0].term[
    'articleCategories.categoryId'
  ];
}

async function articleCategoryResolveEdges(...params) {
  const categoryId = getCategoryIdFromParams(params);
  const edges = await defaultResolveEdges(...params);
  return edges.map(({ node: { articleCategories, id }, ...rest }) => {
    const articleCategory = articleCategories.find(
      articleCategory => articleCategory.categoryId === categoryId
    );
    articleCategory.articleId = id;

    return { ...rest, node: articleCategory };
  });
}

export const ArticleCategoryConnection = createConnectionType(
  'ArticleCategoryConnection',
  ArticleCategory,
  { resolveEdges: articleCategoryResolveEdges }
);

export default ArticleCategory;
