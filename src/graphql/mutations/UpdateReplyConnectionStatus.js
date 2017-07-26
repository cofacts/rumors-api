import { GraphQLString, GraphQLNonNull, GraphQLEnumType } from 'graphql';

import client from 'util/client';
import MutationResult from 'graphql/models/MutationResult';

export default {
  type: MutationResult,
  description: 'Remove sspecified reply from specified article.',
  args: {
    replyConnectionId: { type: new GraphQLNonNull(GraphQLString) },
    status: {
      type: new GraphQLNonNull(
        new GraphQLEnumType({
          name: 'ReplyConnectionStatusEnum',
          values: {
            NORMAL: {
              value: 'NORMAL',
            },
            DELETED: {
              value: 'DELETED',
            },
          },
        })
      ),
    },
  },
  async resolve(rootValue, { replyConnectionId, status }, { userId }) {
    const { _source: { userId: replyConnectionUserId } } = await client.get({
      index: 'replyconnections',
      type: 'basic',
      id: replyConnectionId,
      _sourceInclude: ['userId'],
    });

    if (replyConnectionUserId !== userId) {
      throw new Error("You cannot change other's ReplyConnection's status");
    }

    const { result } = await client.update({
      index: 'replyconnections',
      type: 'basic',
      id: replyConnectionId,
      body: {
        doc: {
          status,
          updatedAt: new Date(),
        },
      },
    });

    if (result !== 'updated' && result !== 'noop') {
      throw new Error(`Cannot change status for reply connection: ${result}`);
    }

    return { id: replyConnectionId };
  },
};
