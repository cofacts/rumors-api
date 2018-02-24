import {
  GraphQLString,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLObjectType,
  GraphQLEnumType,
} from 'graphql';
import { assertUser } from 'graphql/util';

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
 * @typedef {Object} CreateReplyRequestResult
 * @property {Object} article - The update article instance
 * @property {boolean} isCreated - If the reply request is created
 */

/**
 * Indexes a reply request and increments the replyRequestCount for article
 *
 * @param {ReplyRequestParam} param
 * @returns {CreateReplyRequstResult}
 */
export async function createReplyRequest({
  articleId,
  userId,
  appId,
  reason = '',
}) {
  assertUser({ appId, userId });

  const now = new Date().toISOString();
  const id = getReplyRequestId({ articleId, userId, appId });

  const { result } = await client.update({
    index: 'replyrequests',
    type: 'doc',
    id,
    body: {
      doc: {
        updatedAt: now,
      },
      upsert: {
        articleId,
        userId,
        appId,
        reason,
        feedbacks: [],
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    },
  });

  const isCreated = result === 'created';

  const articleUpdateResult = await client.update({
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

  return {
    article: processMeta({ ...articleUpdateResult.get, _id: id }),
    isCreated,
  };
}

export default {
  description: 'Create a reply request for the given article',
  type: new GraphQLObjectType({
    name: 'CreateReplyRequestResult',
    fields: {
      replyRequestCount: {
        type: GraphQLInt,
        description:
          'Reply request count for the given article after creating the reply request',
      },
      status: {
        type: new GraphQLEnumType({
          name: 'CreateReplyRequstResultStatus',
          values: {
            SUCCESS: {
              value: 'SUCCESS',
              description: 'Successfully inserted a new reply request',
            },
            DUPLICATE: {
              value: 'DUPLICATE',
              description:
                'The user has already requested reply for this article',
            },
          },
        }),
      },
    },
  }),
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    reason: {
      type: GraphQLString,
      description: 'The reason why the user want to submit this article',
    },
  },
  async resolve(rootValue, { articleId, reason }, { appId, userId }) {
    const { article, isCreated } = await createReplyRequest({
      articleId,
      appId,
      userId,
      reason,
    });
    return {
      replyRequestCount: article.replyRequestCount,
      status: isCreated ? 'SUCCESS' : 'DUPLICATE',
    };
  },
};
