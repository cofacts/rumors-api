import { GraphQLString, GraphQLNonNull, GraphQLList } from 'graphql';
import client from 'util/client';
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

    const {
      result,
      get: { _source },
    } = await client.update({
      index: 'articles',
      type: 'doc',
      id: articleId,
      body: {
        script: {
          source: `
            int idx = 0;
            int categoryCount = ctx._source.articleCategories.size();
            for(; idx < categoryCount; idx += 1) {
              HashMap articleCategory = ctx._source.articleCategories.get(idx);
              if(
                articleCategory.get('categoryId').equals(params.categoryId) &&
                articleCategory.get('userId').equals(params.userId) &&
                articleCategory.get('appId').equals(params.appId)
              ) {
                break;
              }
            }

            if( idx === categoryCount ) {
              ctx.op = 'none';
            } else {
              ctx._source.articleCategories.get(idx).put('status', params.status);
              ctx._source.articleCategories.get(idx).put('updatedAt', params.updatedAt);
              ctx._source.normalArticleCategoryCount = ctx._source.articleCategories.stream().filter(
                ar -> ar.get('status').equals('NORMAL')
              ).count();
            }
          `,
          params: {
            categoryId,
            userId,
            appId,
            status,
            updatedAt: new Date().toISOString(),
          },
          lang: 'painless',
        },
        _source: ['articleCategories.*'],
      },
    });

    if (result === 'noop') {
      throw new Error(
        `Cannot change status for articleCategory(articleId=${articleId}, categoryId=${categoryId})`
      );
    }

    // When returning, insert articleId so that ArticleCategory object type can resolve article.
    return _source.articleCategories.map(ar => ({ ...ar, articleId }));
  },
};
