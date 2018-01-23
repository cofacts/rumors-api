import {
  GraphQLString,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLObjectType,
  GraphQLEnumType,
} from 'graphql';
import { assertUser } from 'graphql/util';

import client, { processMeta } from 'util/client';

export class DuplicatedReplyRequestError extends Error {
  constructor({ userId, appId, articleId } = {}) {
    super(
      `User ${userId} in app ${appId} already have requested replies to article ${articleId}`
    );
    Object.assign(this, { userId, appId, articleId });
  }
}

/**
 * Indexes a reply request and increments the replyRequestCount for article
 *
 * @param {Object} opt
 * @param {String} opt.articleId - The article to add reply request to
 * @param {String} opt.userId - The user that submits this request
 * @param {String} opt.appId - The app that the user logged in to
 * @returns {Object<article>} The updated article instance
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
      updatedAt: now,
    },
  });

  if (result !== 'created') {
    throw new DuplicatedReplyRequestError({ articleId, userId, appId });
  }

  const articleUpdateResult = await client.update({
    index: 'articles',
    type: 'doc',
    id: articleId,
    body: {
      script: {
        inline: 'ctx._source.replyRequestCount += 1',
      },
    },
    _source: true,
  });

  if (articleUpdateResult.result !== 'updated') {
    throw new Error(`Cannot append replyRequest ${id} to article ${articleId}`);
  }

  return {
    article: processMeta({ ...articleUpdateResult.get, _id: id }),
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
  async resolve(rootValue, { articleId }, { appId, userId, loaders }) {
    try {
      const { article } = await createReplyRequest({
        articleId,
        appId,
        userId,
      });
      return {
        replyRequestCount: article.replyRequestCount,
        status: 'SUCCESS',
      };
    } catch (err) {
      if (!(err instanceof DuplicatedReplyRequestError)) {
        throw err;
      }

      const article = await loaders.docLoader.load({
        index: 'articles',
        id: articleId,
      });

      return {
        replyRequestCount: article.replyRequestCount,
        status: 'DUPLICATE',
      };
    }
  },
};
