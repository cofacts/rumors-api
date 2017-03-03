import {
  GraphQLString,
  GraphQLNonNull,
} from 'graphql';

import {
  assertUser,
} from 'graphql/util';

import client from 'util/client';

import ReplyTypeEnum from 'graphql/models/ReplyTypeEnum';
import MutationResult from 'graphql/models/MutationResult';
import { createReplyConnection } from './CreateReplyConnection';

export default {
  type: MutationResult,
  description: 'Create a reply that replies to the specified article.' +
    '`ReplyConnections` and `ReplyVersions` are created automatically.',
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    text: { type: new GraphQLNonNull(GraphQLString) },
    type: { type: new GraphQLNonNull(ReplyTypeEnum) },
    reference: { type: GraphQLString },
  },
  async resolve(rootValue, { articleId, text, type, reference }, { userId, from }) {
    assertUser({ userId, from });

    if (type !== 'NOT_ARTICLE' && !reference) {
      throw new Error('reference is required for type !== NOT_ARTICLE');
    }

    const { created, _id: replyId, result } = await client.index({
      index: 'replies',
      type: 'basic',
      body: {
        versions: [{
          userId,
          from,
          type,
          text,
          reference,
          createdAt: new Date(),
        }],
        createdAt: new Date(),
      },
    });

    if (!created) {
      throw new Error(`Cannot create reply: ${result}`);
    }

    await createReplyConnection({ articleId, replyId, userId, from });

    return { id: replyId };
  },
};
