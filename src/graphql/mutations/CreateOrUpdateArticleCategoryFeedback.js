import { GraphQLString, GraphQLNonNull } from 'graphql';

import { assertUser, getContentDefaultStatus } from 'util/user';
import FeedbackVote from 'graphql/models/FeedbackVote';
import ArticleCategory from 'graphql/models/ArticleCategory';
import DataLoaders from 'graphql/dataLoaders';

import client from 'util/client';

export function getArticleCategoryFeedbackId({
  articleId,
  categoryId,
  userId,
  appId,
}) {
  return `${articleId}__${categoryId}__${userId}__${appId}`;
}

/**
 * @returns {ArticleCategory} The updated article category
 */
export async function createOrUpdateArticleCategoryFeedback({
  articleId,
  categoryId,
  vote,
  comment,
  user,

  // Use new instance of dataLoader if not provided
  loaders = new DataLoaders(),
}) {
  const now = new Date().toISOString();

  // (articleId, categoryId, userId, appId) should be unique
  // but user can update
  const id = getArticleCategoryFeedbackId({
    articleId,
    categoryId,
    userId: user.id,
    appId: user.appId,
  });

  await client.update({
    index: 'articlecategoryfeedbacks',
    type: 'doc',
    id,
    body: {
      doc: {
        score: vote,
        comment: comment,
        updatedAt: now,
      },
      upsert: {
        articleId,
        categoryId,
        userId: user.id,
        appId: user.appId,
        score: vote,
        createdAt: now,
        updatedAt: now,
        comment: comment,
        status: getContentDefaultStatus(user),
      },
    },
    refresh: 'true', // We are searching for articlecategoryfeedbacks immediately
  });

  const feedbacks = await loaders.articleCategoryFeedbacksLoader.load({
    articleId,
    categoryId,
  });

  const [positiveFeedbackCount, negativeFeedbackCount] = feedbacks
    .filter(({ status }) => status === 'NORMAL')
    .reduce(
      (agg, { score }) => {
        if (score === 1) {
          agg[0] += 1;
        } else if (score === -1) {
          agg[1] += 1;
        }
        return agg;
      },
      [0, 0]
    );

  const { body: articleCategoryUpdateResult } = await client.update({
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
              if( articleCategory.get('categoryId').equals(params.categoryId) ) {
                break;
              }
            }

            if( idx === categoryCount ) {
              ctx.op = 'none';
            } else {
              ctx._source.articleCategories.get(idx).put(
                'positiveFeedbackCount', params.positiveFeedbackCount);
              ctx._source.articleCategories.get(idx).put(
                'negativeFeedbackCount', params.negativeFeedbackCount);
            }
          `,
        params: {
          categoryId,
          positiveFeedbackCount,
          negativeFeedbackCount,
        },
      },
    },
    _source: true,
  });

  /* istanbul ignore if */
  if (articleCategoryUpdateResult.result !== 'updated') {
    throw new Error(
      `Cannot article ${articleId}'s feedback count for feedback ID = ${id}`
    );
  }

  return articleCategoryUpdateResult.get._source.articleCategories.find(
    (articleCategory) => articleCategory.categoryId === categoryId
  );
}

export default {
  description: 'Create or update a feedback on an article-category connection',
  type: ArticleCategory,
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    categoryId: { type: new GraphQLNonNull(GraphQLString) },
    vote: { type: new GraphQLNonNull(FeedbackVote) },
    comment: { type: GraphQLString },
  },

  async resolve(
    rootValue,
    { articleId, categoryId, vote, comment },
    { user, loaders }
  ) {
    assertUser(user);

    const updatedArticleCategory = await createOrUpdateArticleCategoryFeedback({
      articleId,
      categoryId,
      vote,
      comment,
      user,
      loaders,
    });

    /* istanbul ignore if */
    if (!updatedArticleCategory) {
      throw new Error(
        `Cannot get updated article category with article ID = ${articleId} and category ID = ${categoryId}`
      );
    }

    return { articleId, ...updatedArticleCategory };
  },
};
