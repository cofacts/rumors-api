import {
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLFloat,
} from 'graphql';

import client from 'util/client';
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
  aiModel,
  aiConfidence,
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
    aiModel,
    aiConfidence,
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    categoryId,
    status: 'NORMAL',
    createdAt: now,
    updatedAt: now,
  };

  const {
    body: {
      result: articleResult,
      get: { _source },
    },
  } = await client.update({
    index: 'articles',
    type: 'doc',
    id: article.id,
    body: {
      script: {
        /**
         * Check if the category is already connected in the article.
         * If connected with DELETED status, then set to NORMAL.
         * If connected with NORMAL status, then do nothing.
         * Otherwise, do update.
         */
        source: `
          def found = ctx._source.articleCategories.stream()
            .filter(ar -> ar.get('categoryId').equals(params.articleCategory.get('categoryId')))
            .findFirst();

          if (found.isPresent()) {
            HashMap ar = found.get();
            if (ar.get('status').equals('DELETED')) {
              ar.put('status', 'NORMAL');
              ar.put('userId', '${userId}');
              ar.put('appId', '${appId}');
              ar.put('updatedAt', '${now}');
            } else {
              ctx.op = 'none';
            }
          } else {
            ctx._source.articleCategories.add(params.articleCategory);
            ctx._source.normalArticleCategoryCount = ctx._source.articleCategories.stream().filter(
              ar -> ar.get('status').equals('NORMAL')
            ).count();
          }
        `,
        lang: 'painless',
        params: { articleCategory },
      },
      _source: ['articleCategories.*'],
    },
  });

  if (articleResult === 'noop') {
    throw new Error(
      `Cannot add articleCategory ${JSON.stringify(
        articleCategory
      )} to article ${article.id}`
    );
  }

  return _source.articleCategories;
}

export default {
  type: new GraphQLList(ArticleCategory),
  description: 'Adds specified category to specified article.',
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    categoryId: { type: new GraphQLNonNull(GraphQLString) },
    aiModel: { type: GraphQLString },
    aiConfidence: { type: GraphQLFloat },
  },
  async resolve(
    rootValue,
    { articleId, categoryId, aiModel, aiConfidence },
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
      aiModel,
      aiConfidence,
    });

    // When returning, insert articleId so that ArticleReply object type can resolve article.
    return articleCategories.map(ac => ({ ...ac, articleId }));
  },
};
