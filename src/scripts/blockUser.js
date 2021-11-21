/**
 * Given userId & block reason, blocks the user and marks all their existing ArticleReply,
 * ArticleReplyFeedback, ReplyRequest, ArticleCategory, ArticleCategoryFeedback as BLOCKED.
 */

import 'dotenv/config';
import yargs from 'yargs';
import client from 'util/client';
import getAllDocs from 'util/getAllDocs';

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

  for (let i = 0; i < articleIdsWithNormalReplyRequests.length; i += 1) {
    const articleId = articleIdsWithNormalReplyRequests[i];

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
// async function processArticleReplies(/* userId */) {}

/**
 * @param {object} args
 */
async function main({ userId, blockedReason } = {}) {
  await writeBlockedReasonToUser(userId, blockedReason);
  await processReplyRequests(userId);
  // await processArticleReplies(userId);
}

export default main;

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
