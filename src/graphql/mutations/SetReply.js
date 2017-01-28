import {
  GraphQLString,
  GraphQLNonNull,
} from 'graphql';
import client from 'util/client';

import ReplyTypeEnum from 'graphql/models/ReplyTypeEnum';
import MutationResult from 'graphql/models/MutationResult';

export default {
  type: MutationResult,
  description: 'Create a reply',
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    text: { type: new GraphQLNonNull(GraphQLString) },
    type: { type: new GraphQLNonNull(ReplyTypeEnum) },
    reference: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(rootValue, { articleId, text, type, reference }) {
    const { created, _id: replyId, result } = await client.index({
      index: 'replies',
      type: 'basic',
      body: {
        versions: [{
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

    const { result: articleResult } = await client.update({
      index: 'articles',
      type: 'basic',
      id: articleId,
      body: {
        script: 'ctx._source.replyIds.add(params.replyId)',
        params: { replyId },
      },
    });

    if (articleResult !== 'updated') {
      throw new Error(`Cannot append reply to article: ${articleResult}`);
    }

    return { id: replyId };
  },
};
