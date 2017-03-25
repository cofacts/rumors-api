import {
  GraphQLString,
  GraphQLNonNull,
} from 'graphql';
import {
  assertUser,
} from 'graphql/util';
import client from 'util/client';

import { ArticleReferenceInput } from 'graphql/models/ArticleReference';
import MutationResult from 'graphql/models/MutationResult';
import { createReplyRequest } from './CreateReplyRequest';

export default {
  type: MutationResult,
  description: 'Create an article',
  args: {
    text: { type: new GraphQLNonNull(GraphQLString) },
    reference: { type: new GraphQLNonNull(ArticleReferenceInput) },
  },
  async resolve(rootValue, { text, reference }, { from, userId }) {
    assertUser({ from, userId });

    const now = (new Date()).toISOString();
    reference.createdAt = now;

    const { created, _id: newId, result } = await client.index({
      index: 'articles',
      type: 'basic',
      body: {
        replyConnectionIds: [],
        replyRequestIds: [],
        text,
        createdAt: now,
        updatedAt: now,
        userId,
        from,
        references: [reference],
      },
      refresh: true, // Make sure the data is indexed when re create ReplyRequest
    });

    if (!created) {
      throw new Error(`Cannot create article: ${result}`);
    }

    await createReplyRequest({ articleId: newId, userId, from });

    return { id: newId };
  },
};
