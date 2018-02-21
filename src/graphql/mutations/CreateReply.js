import { GraphQLString, GraphQLNonNull } from 'graphql';

import { assertUser } from 'graphql/util';

import client from 'util/client';

import ReplyTypeEnum from 'graphql/models/ReplyTypeEnum';
import MutationResult from 'graphql/models/MutationResult';
import { createArticleReply } from './CreateArticleReply';

export default {
  type: MutationResult,
  description: 'Create a reply that replies to the specified article.',
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    text: { type: new GraphQLNonNull(GraphQLString) },
    type: { type: new GraphQLNonNull(ReplyTypeEnum) },
    reference: { type: GraphQLString },
  },
  async resolve(
    rootValue,
    { articleId, text, type, reference },
    { userId, appId, loaders }
  ) {
    assertUser({ userId, appId });

    if (type !== 'NOT_ARTICLE' && !reference) {
      throw new Error('reference is required for type !== NOT_ARTICLE');
    }

    const replyBody = {
      userId,
      appId,
      type,
      text,
      reference,
      createdAt: new Date(),
    };

    const { _id: replyId, result } = await client.index({
      index: 'replies',
      type: 'doc',
      body: replyBody,
    });

    if (result !== 'created') {
      throw new Error(`Cannot create reply: ${result}`);
    }

    await createArticleReply({
      article: await loaders.docLoader.load({
        index: 'articles',
        id: articleId,
      }),
      reply: { ...replyBody, id: replyId },
      userId,
      appId,
    });

    return { id: replyId };
  },
};
