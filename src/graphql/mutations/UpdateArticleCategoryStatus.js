import { GraphQLString, GraphQLNonNull, GraphQLList } from 'graphql';
import ArticleCategory from 'graphql/models/ArticleCategory';
import ArticleCategoryStatusEnum from 'graphql/models/ArticleCategoryStatusEnum';

export default {
  type: new GraphQLList(ArticleCategory),
  description: 'Change status of specified articleCategory',
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    categoryId: { type: new GraphQLNonNull(GraphQLString) },
    status: {
      type: new GraphQLNonNull(ArticleCategoryStatusEnum),
    },
  },
  async resolve(
    rootValue,
    { articleId, categoryId, status },
    { userId, appId }
  ) {
    // TODO: refer to UpdateArticleReplyStatus for real implementation

    return [
      {
        articleId,
        aiModel: 'Model1',
        aiConfidence: 0.8,
        positiveFeedbackCount: 2,
        negativeFeedbackCount: 1,
        categoryId: 'c2',
        status: 'NORMAL',
        createdAt: '2020-02-06T05:34:45.862Z',
        updatedAt: '2020-02-06T05:34:46.862Z',
      },
      {
        // Simulate category that is added by current user
        articleId,
        userId,
        appId,
        positiveFeedbackCount: 2,
        negativeFeedbackCount: 1,
        categoryId,
        status,
        createdAt: '2020-02-06T05:34:45.862Z',
        updatedAt: '2020-02-06T05:34:46.862Z',
      },
    ];
  },
};
