/**
 * Given userId & block reason, blocks the user and marks all their existing ArticleReply,
 * ArticleReplyFeedback, ReplyRequest, ArticleCategory, ArticleCategoryFeedback as BLOCKED.
 *
 * Please announce that the user will be blocked openly with a URL first.
 */
import { HTTPError } from 'fets';

import client from 'util/client';
import getAllDocs from 'util/getAllDocs';
import { updateArticleReplyStatus } from 'graphql/mutations/UpdateArticleReplyStatus';
import { updateArticleReplyByFeedbacks } from 'graphql/mutations/CreateOrUpdateArticleReplyFeedback';

import type { ReplyRequest } from 'rumors-db/schema/replyrequests';
import type { Article } from 'rumors-db/schema/articles';
import type { ArticleReplyFeedback } from 'rumors-db/schema/articlereplyfeedbacks';

/**
 * Update user to write blockedReason. Throws if user does not exist.
 *
 * @param userId
 * @param blockedReason
 */
async function writeBlockedReasonToUser(userId: string, blockedReason: string) {
  try {
    const {
      body: { result: setBlockedReasonResult },
    } = await client.update({
      index: 'users',
      type: 'doc',
      id: userId,
      body: {
        doc: { blockedReason },
      },
    });

    /* istanbul ignore if */
    if (setBlockedReasonResult === 'noop') {
      console.log(
        `Info: user ID ${userId} already has set the same blocked reason.`
      );
    }
  } catch (e) {
    /* istanbul ignore else */
    if (
      e &&
      typeof e === 'object' &&
      'message' in e &&
      e.message === 'document_missing_exception'
    ) {
      throw new HTTPError(400, `User with ID=${userId} does not exist`);
    }

    throw e;
  }
}

/**
 * Convert all reply requests with NORMAL status by the user to BLOCKED status.
 *
 * @param userId
 */
async function processReplyRequests(userId: string) {
  const NORMAL_REPLY_REQUEST_QUERY = {
    bool: {
      must: [{ term: { status: 'NORMAL' } }, { term: { userId } }],
    },
  };

  const articleIdsWithNormalReplyRequests: string[] = [];

  for await (const {
    _source: { articleId },
  } of getAllDocs<ReplyRequest>('replyrequests', NORMAL_REPLY_REQUEST_QUERY)) {
    articleIdsWithNormalReplyRequests.push(articleId);
  }

  /* Bulk update reply reqeuests status */
  const { body: updateByQueryResult } = await client.updateByQuery({
    index: 'replyrequests',
    type: 'doc',
    body: {
      query: NORMAL_REPLY_REQUEST_QUERY,
      script: {
        lang: 'painless',
        source: `ctx._source.status = 'BLOCKED';`,
      },
    },
    refresh: true,
  });

  console.log('Reply request status update result', updateByQueryResult);

  /* Bulk update articles' replyRequestCount & lastRequestedAt */
  console.log(
    `Updating ${articleIdsWithNormalReplyRequests.length} articles...`
  );

  for (const [i, articleId] of articleIdsWithNormalReplyRequests.entries()) {
    const {
      body: {
        hits: { total },
        aggregations: {
          lastRequestedAt: { value_as_string: lastRequestedAt },
        },
      },
    } = await client.search({
      index: 'replyrequests',
      size: 0,
      body: {
        query: {
          bool: {
            must: [{ term: { status: 'NORMAL' } }, { term: { articleId } }],
          },
        },
        aggs: {
          lastRequestedAt: { max: { field: 'createdAt' } },
        },
      },
    });

    await client.update({
      index: 'articles',
      type: 'doc',
      id: articleId,
      body: {
        doc: {
          lastRequestedAt,
          replyRequestCount: total,
        },
      },
    });

    console.log(
      `[${i + 1}/${
        articleIdsWithNormalReplyRequests.length
      }] article ${articleId}: changed to ${total} reply requests, last requested at ${lastRequestedAt}`
    );
  }

  return updateByQueryResult;
}

/**
 * Convert all article replies with NORMAL status by the user to BLOCKED status.
 *
 * @param userId
 */
async function processArticleReplies(userId: string) {
  const NORMAL_ARTICLE_REPLY_QUERY = {
    nested: {
      path: 'articleReplies',
      query: {
        bool: {
          must: [
            {
              term: {
                'articleReplies.status': 'NORMAL',
              },
            },
            {
              term: {
                'articleReplies.userId': userId,
              },
            },
          ],
        },
      },
    },
  };

  const articleRepliesToProcess: Array<
    Article['articleReplies'][0] & { articleId: string }
  > = [];
  for await (const {
    _id,
    _source: { articleReplies },
  } of getAllDocs<Article>('articles', NORMAL_ARTICLE_REPLY_QUERY)) {
    articleRepliesToProcess.push(
      ...articleReplies
        .filter((ar) => {
          // All articleReplies of the matching article is included,
          // here we should only process the article replies to block.
          return ar.userId === userId;
        })
        .map((ar) => ({
          ...ar,

          // Insert articleId for updateArticleReplyStatus() in the following for-loop
          articleId: _id,
        }))
    );
  }

  console.log('Updating article replies...');
  for (const { articleId, replyId, userId, appId } of articleRepliesToProcess) {
    await updateArticleReplyStatus({
      articleId,
      replyId,
      userId,
      appId,
      status: 'BLOCKED',
    });
  }

  return articleRepliesToProcess.length;
}

/**
 * Convert all article reply feedbacks with NORMAL status by the user to BLOCKED status.
 *
 * @param userId
 */
async function processArticleReplyFeedbacks(userId: string) {
  const NORMAL_FEEDBACK_QUERY = {
    bool: {
      must: [{ term: { status: 'NORMAL' } }, { term: { userId } }],
    },
  };

  /* Array of {articleId, replyId} */
  const articleReplyIdsWithNormalFeedbacks = [];

  for await (const {
    _source: { articleId, replyId },
  } of getAllDocs<ArticleReplyFeedback>(
    'articlereplyfeedbacks',
    NORMAL_FEEDBACK_QUERY
  )) {
    articleReplyIdsWithNormalFeedbacks.push({ articleId, replyId });
  }

  /* Bulk update feedback status */
  const { body: updateByQueryResult } = await client.updateByQuery({
    index: 'articlereplyfeedbacks',
    type: 'doc',
    body: {
      query: NORMAL_FEEDBACK_QUERY,
      script: {
        lang: 'painless',
        source: `ctx._source.status = 'BLOCKED';`,
      },
    },
    refresh: true,
  });

  console.log(
    'Article reply feedback status update result',
    updateByQueryResult
  );

  /* Bulk update articleReply's feedback counts */
  console.log(
    `Updating ${articleReplyIdsWithNormalFeedbacks.length} article-replies...`
  );

  for (const [
    i,
    { articleId, replyId },
  ] of articleReplyIdsWithNormalFeedbacks.entries()) {
    const feedbacks: ArticleReplyFeedback[] = [];
    for await (const { _source: feedback } of getAllDocs<ArticleReplyFeedback>(
      'articlereplyfeedbacks',
      {
        bool: {
          must: [
            { term: { status: 'NORMAL' } },
            { term: { articleId } },
            { term: { replyId } },
          ],
        },
      }
    )) {
      feedbacks.push(feedback);
    }

    const { positiveFeedbackCount, negativeFeedbackCount } =
      await updateArticleReplyByFeedbacks(articleId, replyId, feedbacks);

    console.log(
      `[${i + 1}/${
        articleReplyIdsWithNormalFeedbacks.length
      }] article=${articleId} reply=${replyId}: score changed to +${positiveFeedbackCount}, -${negativeFeedbackCount}`
    );
  }

  return updateByQueryResult;
}

/**
 * Convert all articles with NORMAL status by the user to BLOCKED status.
 *
 * @param {string} userId
 */
async function processArticles(userId: string) {
  const NORMAL_ARTICLE_QUERY = {
    bool: {
      must: [{ term: { status: 'NORMAL' } }, { term: { userId } }],
    },
  };

  /* Bulk update reply reqeuests status */
  const { body: updateByQueryResult } = await client.updateByQuery({
    index: 'articles',
    type: 'doc',
    body: {
      query: NORMAL_ARTICLE_QUERY,
      script: {
        lang: 'painless',
        source: `ctx._source.status = 'BLOCKED';`,
      },
    },
    refresh: true,
  });

  console.log('Article status update result', updateByQueryResult);
  return updateByQueryResult;
}

type BlockUserReturnValue = {
  updatedArticles: number;
  updatedReplyRequests: number;
  updatedArticleReplies: number;
  updateArticleReplyFeedbacks: number;
};

async function main({
  userId,
  blockedReason,
}: {
  userId: string;
  blockedReason: string;
}): Promise<BlockUserReturnValue> {
  await writeBlockedReasonToUser(userId, blockedReason);
  const { updated: updatedArticles } = await processArticles(userId);
  const { updated: updatedReplyRequests } = await processReplyRequests(userId);
  const updatedArticleReplies = await processArticleReplies(userId);
  const { updated: updateArticleReplyFeedbacks } =
    await processArticleReplyFeedbacks(userId);

  return {
    updatedArticles,
    updatedReplyRequests,
    updatedArticleReplies,
    updateArticleReplyFeedbacks,
  };
}

export default main;
