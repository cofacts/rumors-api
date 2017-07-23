import { GraphQLString, GraphQLNonNull } from 'graphql';

import client from 'util/client';
import MutationResult from 'graphql/models/MutationResult';

export default {
  type: MutationResult,
  description: 'Remove sspecified reply from specified article.',
  args: {
    replyConnectionId: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(rootValue, { replyConnectionId }, { userId }) {
    const { _source: { userId: replyConnectionUserId } } = await client.get({
      index: 'replyconnections',
      type: 'basic',
      id: replyConnectionId,
      _sourceInclude: ['userId'],
    });

    if (replyConnectionUserId !== userId) {
      throw new Error("You cannot delete other's ReplyConnection");
    }

    const { result } = await client.update({
      index: 'replyconnections',
      type: 'basic',
      id: replyConnectionId,
      body: {
        doc: {
          status: 'DELETED',
          updatedAt: new Date(),
        },
      },
    });

    if (result !== 'updated' && result !== 'noop') {
      throw new Error(`Cannot delete reply connection: ${result}`);
    }

    return { id: replyConnectionId };
  },
};
