import { GraphQLString, GraphQLNonNull } from 'graphql';
import { assertUser, getContentDefaultStatus } from 'util/user';
import Article from '../models/Article';

import client, { processMeta } from 'util/client';

/**
 * @typedef {Object} ReplyRequestParam
 * @property {string} articleId - The article to add reply request to
 * @property {string} userId - The user that submits this request
 * @property {string} appId - The app that the user logged in to
 * @property {string} reason - The reason why the user want to submit this article
 */

/**
 * @param {ReplyRequestParam} params
 * @returns {string} the reply request ID for the givne params
 */
export function getReplyRequestId({ articleId, userId, appId }) {
  return `${articleId}__${userId}__${appId}`;
}

/**
 * @typedef {Object} CreateOrUpdateReplyRequestResult
 * @property {Object} article - The update article instance
 * @property {boolean} isCreated - If the reply request is created
 */

/**
 * Indexes a reply request and increments the replyRequestCount for article
 *
 * @param {ReplyRequestParam} param
 * @returns {CreateReplyRequstResult}
 */
export async function createOrUpdateReplyRequest({
  articleId,
  user,
  reason = '',
}) {
  assertUser(user);

  const now = new Date().toISOString();
  const id = getReplyRequestId({
    articleId,
    userId: user.id,
    appId: user.appId,
  });
  const updatedDoc = {
    updatedAt: now,
  };

  // Update reason if there is new one
  if (reason) {
    updatedDoc.reason = reason;
  }

  const replyRequestStatus = getContentDefaultStatus(user);

  const {
    body: { result },
  } = await client.update({
    index: 'replyrequests',
    type: 'doc',
    id,
    body: {
      doc: updatedDoc,
      upsert: {
        articleId,
        userId: user.id,
        appId: user.appId,
        reason,
        feedbacks: [],
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
        createdAt: now,
        updatedAt: now,
        status: replyRequestStatus,
      },
    },
    refresh: 'true',
  });

  const isCreated = result === 'created';

  // Update article for normal reply requests
  //
  const article = await (async () => {
    if (replyRequestStatus !== 'NORMAL') {
      return (await client.get({
        index: 'users',
        type: 'doc',
        id: articleId,
      })).body;
    }

    const { body: articleUpdateResult } = await client.update({
      index: 'articles',
      type: 'doc',
      id: articleId,
      body: {
        script: {
          source: `
            ${isCreated ? 'ctx._source.replyRequestCount += 1;' : ''}
            ctx._source.lastRequestedAt = params.now;
          `,
          params: { now },
        },
      },
      _source: true,
    });
    if (articleUpdateResult.result !== 'updated') {
      throw new Error(`Cannot update article ${articleId}`);
    }

    return articleUpdateResult.get;
  })();

  return {
    article: processMeta({ ...article, _id: articleId }),
    isCreated,
  };
}

export default {
  description: 'Create or update a reply request for the given article',
  type: Article,
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    reason: {
      type: GraphQLString,
      description: 'The reason why the user want to submit this article',
    },
  },
  async resolve(rootValue, { articleId, reason }, { user }) {
    const { article } = await createOrUpdateReplyRequest({
      articleId,
      user,
      reason,
    });
    return article;
  },
};
