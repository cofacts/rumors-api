import {
  GraphQLString,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLObjectType,
} from 'graphql';
import {
  assertUser,
} from 'graphql/util';

import client, { processMeta } from 'util/client';

export async function createReplyRequest({ articleId, userId, from }) {
  assertUser({ from, userId });

  const now = (new Date()).toISOString();

  const replyRequest = {
    // (articleId, userId, from) should be unique
    id: `${articleId}__${userId}__${from}`,
    from,
    userId,
    createdAt: now,
    updatedAt: now,
  };
  const { id, ...body } = replyRequest;

  const { created } = await client.index({
    index: 'replyrequests',
    type: 'basic',
    id,
    body,
    opType: 'create',
  });

  if (!created) {
    throw new Error(`Cannot create reply request ${id}`);
  }

  const articleUpdateResult = await client.update({
    index: 'articles',
    type: 'basic',
    id: articleId,
    body: {
      script: {
        inline: 'ctx._source.replyRequestIds.add(params.id)',
        params: { id },
      },
    },
    _source: true,
  });

  if (articleUpdateResult.result !== 'updated') {
    throw new Error(`Cannot append replyRequest ${id} to article ${articleId}`);
  }

  return { replyRequest, article: processMeta({ ...articleUpdateResult.get, _id: id }) };
}

export default {
  description: 'Create a reply request for the given article',
  type: new GraphQLObjectType({
    name: 'CreateReplyRequestResult',
    fields: {
      replyRequestCount: {
        type: GraphQLInt,
      },
    },
  }),
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(rootValue, { articleId }, { from, userId }) {
    const { article } = await createReplyRequest({ articleId, from, userId });

    return { replyRequestCount: article.replyRequestIds.length };
  },
};
