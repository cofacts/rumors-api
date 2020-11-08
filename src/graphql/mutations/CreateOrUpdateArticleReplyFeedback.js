import { GraphQLString, GraphQLNonNull } from 'graphql';

import { assertUser } from 'util/user';
import FeedbackVote from 'graphql/models/FeedbackVote';
import ArticleReply from 'graphql/models/ArticleReply';

import client from 'util/client';

export function getArticleReplyFeedbackId({
  articleId,
  replyId,
  userId,
  appId,
}) {
  return `${articleId}__${replyId}__${userId}__${appId}`;
}

export default {
  description: 'Create or update a feedback on an article-reply connection',
  type: ArticleReply,
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    replyId: { type: new GraphQLNonNull(GraphQLString) },
    vote: { type: new GraphQLNonNull(FeedbackVote) },
    comment: { type: GraphQLString },
  },
  async resolve(
    rootValue,
    { articleId, replyId, vote, comment },
    { appId, userId, loaders }
  ) {
    assertUser({ appId, userId });

    const now = new Date().toISOString();

    // (articleId, replyId, userId, appId) should be unique
    // but user can update
    const id = getArticleReplyFeedbackId({
      articleId,
      replyId,
      userId,
      appId,
    });

    await client.update({
      index: 'articlereplyfeedbacks',
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
          replyId,
          userId,
          appId,
          score: vote,
          createdAt: now,
          updatedAt: now,
          comment: comment,
        },
      },
      refresh: 'true', // We are searching for articlereplyfeedbacks immediately
    });

    const feedbacks = await loaders.articleReplyFeedbacksLoader.load({
      articleId,
      replyId,
    });

    const [positiveFeedbackCount, negativeFeedbackCount] = feedbacks.reduce(
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

    const { body: articleReplyUpdateResult } = await client.update({
      index: 'articles',
      type: 'doc',
      id: articleId,
      body: {
        script: {
          source: `
            int idx = 0;
            int replyCount = ctx._source.articleReplies.size();
            for(; idx < replyCount; idx += 1) {
              HashMap articleReply = ctx._source.articleReplies.get(idx);
              if( articleReply.get('replyId').equals(params.replyId) ) {
                break;
              }
            }

            if( idx === replyCount ) {
              ctx.op = 'none';
            } else {
              ctx._source.articleReplies.get(idx).put(
                'positiveFeedbackCount', params.positiveFeedbackCount);
              ctx._source.articleReplies.get(idx).put(
                'negativeFeedbackCount', params.negativeFeedbackCount);
            }
          `,
          params: {
            replyId,
            positiveFeedbackCount,
            negativeFeedbackCount,
          },
        },
      },
      _source: true,
    });

    /* istanbul ignore if */
    if (articleReplyUpdateResult.result !== 'updated') {
      throw new Error(
        `Cannot article ${articleId}'s feedback count for feedback ID = ${id}`
      );
    }

    const updatedArticleReply = articleReplyUpdateResult.get._source.articleReplies.find(
      articleReply => articleReply.replyId === replyId
    );

    /* istanbul ignore if */
    if (!updatedArticleReply) {
      throw new Error(
        `Cannot get updated article reply with article ID = ${articleId} and reply ID = ${replyId}`
      );
    }

    return { articleId, ...updatedArticleReply };
  },
};
