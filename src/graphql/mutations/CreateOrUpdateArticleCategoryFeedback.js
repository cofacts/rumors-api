import { GraphQLString, GraphQLNonNull } from 'graphql';

import { assertUser } from 'graphql/util';
import FeedbackVote from 'graphql/models/FeedbackVote';
import ArticleCategory from 'graphql/models/ArticleCategory';

export function getArticleCategoryFeedbackId({
  articleId,
  categoryId,
  userId,
  appId,
}) {
  return `${articleId}__${categoryId}__${userId}__${appId}`;
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
  async resolve(rootValue, { articleId, categoryId }, { appId, userId }) {
    assertUser({ appId, userId });

    const now = new Date().toISOString();

    // TODO: Perform elasticsearch operations here.
    // Please refer to CreateOrUpdateArticleReplyFeedback.
    //
    return {
      articleId,
      aiModel: 'Model1',
      aiConfidence: 0.8,
      positiveFeedbackCount: 2,
      negativeFeedbackCount: 1,
      categoryId,
      status: 'NORMAL',
      createdAt: '2020-02-06T05:34:45.862Z',
      updatedAt: now,
    };
  },
};
