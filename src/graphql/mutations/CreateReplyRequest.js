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
 * @typedef {Object} CreateReplyRequestResult
 * @property {Object} article - The update article instance
 * @property {boolean} isCreated - If the reply request is created
 */

/**
 * Indexes a reply request and increments the replyRequestCount for article
 *
 * @param {Object} opt
 * @param {string} opt.articleId - The article to add reply request to
 * @param {string} opt.userId - The user that submits this request
 * @param {string} opt.appId - The app that the user logged in to
 * @returns {CreateReplyRequstResult}
 */
export async function createReplyRequest({ articleId, userId, appId }) {
  assertUser({ appId, userId });

  const now = new Date().toISOString();
  const id = `${articleId}__${userId}__${appId}`;

  const { result } = await client.index({
    index: 'replyrequests',
    type: 'doc',
    id,
    body: {
      appId,
      userId,
      createdAt: now,
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
  },
  async resolve(rootValue, { articleId }, { appId, userId }) {
    const { article, isCreated } = await createReplyRequest({
      articleId,
      appId,
      userId,
    });
    return {
      replyRequestCount: article.replyRequestCount,
      status: isCreated ? 'SUCCESS' : 'DUPLICATE',
    };
  },
};
