import {
  GraphQLString,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLObjectType,
} from 'graphql';
import {
  assertUser,
} from 'graphql/util';

import client from 'util/client';

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
    assertUser({ from, userId });

    const now = (new Date()).toISOString();

    // (articleId, userId, from) should be unique
    const id = `${articleId}__${userId}__${from}`;

    const { created } = await client.index({
      index: 'replyrequests',
      type: 'basic',
      id,
      body: {
        from,
        userId,
        createdAt: now,
        updatedAt: now,
      },
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

    return { replyCount: articleUpdateResult.get._source.replyRequestIds.length };
  },
};
