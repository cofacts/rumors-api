import { GraphQLString, GraphQLNonNull, GraphQLList } from 'graphql';

import { assertUser } from 'graphql/util';
import ArticleCategory from 'graphql/models/ArticleCategory';

/**
 *
 * @param {object} param
 * @param {object} param.article - The article instance to attach category to
 * @param {object} param.categoryId - The categoryId to attach to article
 * @param {string} param.userId - The user adding this article-reply connection
 * @param {string} param.appId
 * @returns {ArticleCategory[]} The article categories after creation
 */
export async function createArticleCategory({
  article,
  categoryId,
  userId,
  appId,
}) {
  assertUser({ userId, appId });
  if (!article || !categoryId) {
    throw new Error(
      'articleId and categoryId are mandatory when creating ArticleCategory.'
    );
  }

  const now = new Date().toISOString();

  const articleCategory = {
    userId,
    appId,
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    categoryId,
    status: 'NORMAL',
    createdAt: now,
    updatedAt: now,
  };

  // TODO: Insert articleCategory to articles in Elasticsearch, and return insertion results from DB.
  // Implementation can refer to createArticleReply() in CreateArticleReply.js
  //
  return (article.articleCategories || []).concat(articleCategory); // MOCK
}

export default {
  type: new GraphQLList(ArticleCategory),
  description: 'Adds specified category to specified article.',
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    categoryId: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(
    rootValue,
    { articleId, categoryId },
    { userId, appId, loaders }
  ) {
    const article = await loaders.docLoader.load({
      index: 'articles',
      id: articleId,
    });

    const articleCategories = await createArticleCategory({
      article,
      categoryId,
      userId,
      appId,
    });

    // When returning, insert articleId so that ArticleReply object type can resolve article.
    return articleCategories.map(ac => ({ ...ac, articleId }));
  },
};
