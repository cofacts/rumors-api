import { GraphQLString, GraphQLNonNull } from 'graphql';
import client from 'util/client';
import MutationResult from 'graphql/models/MutationResult';
import { auth } from 'graphql/models/ArticleReply';
import ArticleReplyStatusEnum from 'graphql/models/ArticleReplyStatusEnum';

export default {
  type: MutationResult,
  description: 'Remove specified reply from specified article.',
  args: {
    replyConnectionId: { type: new GraphQLNonNull(GraphQLString) },
    status: {
      type: new GraphQLNonNull(ArticleReplyStatusEnum),
    },
  },
  async resolve(rootValue, { replyConnectionId, status }, { userId }) {
    const { _source: { userId: replyConnectionUserId } } = await client.get({
      index: 'replyconnections',
      type: 'basic',
      id: replyConnectionId,
      _sourceInclude: ['userId'],
    });

    if (!auth.canUpdateStatus(userId, replyConnectionUserId)) {
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
