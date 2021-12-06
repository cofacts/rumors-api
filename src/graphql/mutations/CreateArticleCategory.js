import {
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLFloat,
} from 'graphql';

import client from 'util/client';
import { assertUser, getContentDefaultStatus } from 'util/user';
import ArticleCategory from 'graphql/models/ArticleCategory';

/**
 *
 * @param {object} param
 * @param {object} param.articleId - The articleId to attach category to
 * @param {object} param.categoryId - The categoryId to attach to article
 * @param {string} param.user - The user adding this article-reply connection
 * @returns {ArticleCategory[]} The article categories after creation
 */
export async function createArticleCategory({
  articleId,
  categoryId,
  user,
  aiModel,
  aiConfidence,
}) {
  assertUser(user);
  if (!articleId || !categoryId) {
    throw new Error(
      'articleId and categoryId are mandatory when creating ArticleCategory.'
    );
  }

  const now = new Date().toISOString();
  const defaultStatus = getContentDefaultStatus(user);

  const articleCategory = {
    userId: user.id,
    appId: user.appId,
    aiModel,
    aiConfidence,
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    categoryId,
    status: defaultStatus,
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
    id: articleId,
    body: {
      script: {
        /**
         * Check if the category is already connected in the article.
         * If connected with not default status, then set to default status.
         * If connected with NORMAL status, then do nothing.
         * Otherwise, do update.
         */
        source: `
          def found = ctx._source.articleCategories.stream()
            .filter(ar -> ar.get('categoryId').equals(params.articleCategory.get('categoryId')))
            .findFirst();

          if (found.isPresent()) {
            HashMap ar = found.get();
            if (ar.get('status').equals(params.defaultStatus)) {
              ctx.op = 'none';
            } else {
              ar.put('status', params.defaultStatus);
              ar.put('userId', params.articleCategory.get('userId'));
              ar.put('appId', params.articleCategory.get('appId'));
              ar.put('updatedAt', params.articleCategory.get('updatedAt'));
            }
          } else {
            ctx._source.articleCategories.add(params.articleCategory);
            ctx._source.normalArticleCategoryCount = ctx._source.articleCategories.stream().filter(
              ar -> ar.get('status').equals('NORMAL')
            ).count();
          }
        `,
        lang: 'painless',
        params: { articleCategory, defaultStatus },
      },
      _source: ['articleCategories.*'],
    },
  });

  if (articleResult === 'noop') {
    throw new Error(
      `Cannot add articleCategory ${JSON.stringify(
        articleCategory
      )} to article ${articleId}`
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
    { user }
  ) {
    const articleCategories = await createArticleCategory({
      articleId,
      categoryId,
      user,
      aiModel,
      aiConfidence,
    });

    // When returning, insert articleId so that ArticleReply object type can resolve article.
    return articleCategories.map(ac => ({ ...ac, articleId }));
  },
};
