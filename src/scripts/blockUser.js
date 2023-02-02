/**
 * Given userId & block reason, blocks the user and marks all their existing ArticleReply,
 * ArticleReplyFeedback, ReplyRequest, ArticleCategory, ArticleCategoryFeedback as BLOCKED.
 */

import 'dotenv/config';
import yargs from 'yargs';
import { SingleBar } from 'cli-progress';
import client from 'util/client';
import getAllDocs from 'util/getAllDocs';
import { updateArticleReplyStatus } from 'graphql/mutations/UpdateArticleReplyStatus';
import { updateArticleReplyByFeedbacks } from 'graphql/mutations/CreateOrUpdateArticleReplyFeedback';

/**
 * Update user to write blockedReason. Throws if user does not exist.
 *
 * @param {string} userId
 * @param {string} blockedReason
 */
async function writeBlockedReasonToUser(userId, blockedReason) {
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
    if (e.message === 'document_missing_exception') {
      throw new Error(`User with ID=${userId} does not exist`);
    }

    throw e;
  }
}

/**
 * Convert all reply requests with NORMAL status by the user to BLOCKED status.
 *
 * @param {userId} userId
 */
async function processReplyRequests(userId) {
  const NORMAL_REPLY_REQUEST_QUERY = {
    bool: {
      must: [{ term: { status: 'NORMAL' } }, { term: { userId } }],
    },
  };

  const articleIdsWithNormalReplyRequests = [];

  for await (const {
    _source: { articleId },
  } of getAllDocs('replyrequests', NORMAL_REPLY_REQUEST_QUERY)) {
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
}

/**
 * Convert all article replies with NORMAL status by the user to BLOCKED status.
 *
 * @param {userId} userId
 */
async function processArticleReplies(userId) {
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

  const articleRepliesToProcess = [];
  for await (const {
    _id,
    _source: { articleReplies },
  } of getAllDocs('articles', NORMAL_ARTICLE_REPLY_QUERY)) {
    articleRepliesToProcess.push(
      ...articleReplies
        .filter(ar => {
          // All articleReplies of the matching article is included,
          // here we should only process the article replies to block.
          return ar.userId === userId;
        })
        .map(ar => ({
          ...ar,

          // Insert articleId for updateArticleReplyStatus() in the following for-loop
          articleId: _id,
        }))
    );
  }

  console.log('Updating article replies...');
  const bar = new SingleBar({ stopOnComplete: true });
  bar.start(articleRepliesToProcess.length, 0);
  for (const { articleId, replyId, userId, appId } of articleRepliesToProcess) {
    await updateArticleReplyStatus({
      articleId,
      replyId,
      userId,
      appId,
      status: 'BLOCKED',
    });
    bar.increment();
  }
  bar.stop();
}

/**
 * Convert all article reply feedbacks with NORMAL status by the user to BLOCKED status.
 *
 * @param {userId} userId
 */
async function processArticleReplyFeedbacks(userId) {
  const NORMAL_FEEDBACK_QUERY = {
    bool: {
      must: [{ term: { status: 'NORMAL' } }, { term: { userId } }],
    },
  };

  /* Array of {articleId, replyId} */
  const articleReplyIdsWithNormalFeedbacks = [];

  for await (const {
    _source: { articleId, replyId },
  } of getAllDocs('articlereplyfeedbacks', NORMAL_FEEDBACK_QUERY)) {
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
    const feedbacks = [];
    for await (const { _source: feedback } of getAllDocs(
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

    const {
      positiveFeedbackCount,
      negativeFeedbackCount,
    } = await updateArticleReplyByFeedbacks(articleId, replyId, feedbacks);

    console.log(
      `[${i + 1}/${
        articleReplyIdsWithNormalFeedbacks.length
      }] article=${articleId} reply=${replyId}: score changed to +${positiveFeedbackCount}, -${negativeFeedbackCount}`
    );
  }
}

/**
 * Convert all articles with NORMAL status by the user to BLOCKED status.
 *
 * @param {string} userId
 */
async function processArticles(userId) {
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
}

/**
 * @param {object} args
 */
async function main({ userId, blockedReason } = {}) {
  await writeBlockedReasonToUser(userId, blockedReason);
  await processArticles(userId);
  await processReplyRequests(userId);
  await processArticleReplies(userId);
  await processArticleReplyFeedbacks(userId);
}

export default main;

/* istanbul ignore if */
if (require.main === module) {
  const argv = yargs
    .options({
      userId: {
        alias: 'u',
        description: 'The user ID to block',
        type: 'string',
        demandOption: true,
      },
      blockedReason: {
        alias: 'r',
        description: 'The URL to the annoucement that blocks this user',
        type: 'string',
        demandOption: true,
      },
    })
    .help('help').argv;

  main(argv).catch(console.error);
}
