import { GraphQLString, GraphQLNonNull } from 'graphql';

import client from 'util/client';
import { assertUser } from 'graphql/util';
import MutationResult from 'graphql/models/MutationResult';

export async function createReplyConnection({
  articleId,
  replyId,
  userId,
  from,
}) {
  assertUser({ userId, from });
  if (!articleId || !replyId) {
    throw new Error(
      'articleId and replyId are mandatory when creating replyConnections.'
    );
  }

  const now = new Date().toISOString();

  const replyConnection = {
    id: `${articleId}__${replyId}`,
    replyId,
    userId,
    from,
    feedbackIds: [],
    createdAt: now,
    updatedAt: now,
  };

  const { id, ...body } = replyConnection;

  const { created } = await client.index({
    index: 'replyconnections',
    type: 'basic',
    id,
    body,
    opType: 'create',
  });

  if (!created) {
    throw new Error(
      `Cannot create replyConnection: ${JSON.stringify(replyConnection)}`
    );
  }

  const { result: articleResult } = await client.update({
    index: 'articles',
    type: 'basic',
    id: articleId,
    body: {
      script: {
        inline: 'if(!ctx._source.replyConnectionIds.contains(params.id)) {ctx._source.replyConnectionIds.add(params.id)}',
        params: { id },
      },
    },
  });

  if (articleResult !== 'updated') {
    throw new Error(
      `Cannot append replyConnection ${JSON.stringify(replyConnection)} to article ${articleId}`
    );
  }

  return replyConnection;
}

export default {
  type: MutationResult,
  description: 'Connects specified reply and specified article.',
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    replyId: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(rootValue, { articleId, replyId }, { userId, from }) {
    const { id } = await createReplyConnection({
      articleId,
      replyId,
      userId,
      from,
    });
    return { id };
  },
};
