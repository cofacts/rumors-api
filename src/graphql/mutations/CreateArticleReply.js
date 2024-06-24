import { GraphQLString, GraphQLNonNull, GraphQLList } from 'graphql';

import client from 'util/client';
import { assertUser, getContentDefaultStatus } from 'util/user';
import ArticleReply from 'graphql/models/ArticleReply';

/**
 *
 * @param {object} param
 * @param {object} param.article - The article instance to attach reply to
 * @param {object} param.reply - The reply instance to attach to article
 * @param {object} user - The user adding this article-reply connection
 * @returns {[ArticleReply]} The article replies after creation
 */
export async function createArticleReply({ article, reply, user }) {
  assertUser(user);
  if (!article || !reply) {
    throw new Error(
      'articleId and replyId are mandatory when creating ArticleReplies.'
    );
  }

  const now = new Date().toISOString();

  const articleReply = {
    userId: user.id,
    appId: user.appId,
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    replyId: reply.id,
    replyType: reply.type,
    status: getContentDefaultStatus(user),
    createdAt: now,
    updatedAt: now,
  };

  const {
    body: {
      result: articleResult,
      get: { _source },
    },
  } = await client.update({
    index: 'articles',
    type: 'doc',
    id: article.id,
    body: {
      script: {
        /**
         * Check if the reply is already connected in the article.
         * If so, do nothing;
         * otherwise, do update.
         */
        source: `
          if(
            ctx._source.articleReplies.stream().anyMatch(
              ar -> ar.get('replyId').equals(params.articleReply.get('replyId'))
            )
          ) {
            ctx.op = 'none';
          } else {
            ctx._source.articleReplies.add(params.articleReply);
            ctx._source.normalArticleReplyCount = ctx._source.articleReplies.stream().filter(
              ar -> ar.get('status').equals('NORMAL')
            ).count();
          }
        `,
        lang: 'painless',
        params: { articleReply },
      },
      _source: ['articleReplies.*'],
    },
  });

  if (articleResult === 'noop') {
    throw new Error(
      `Cannot add articleReply ${JSON.stringify(articleReply)} to article ${
        article.id
      }`
    );
  }

  return _source.articleReplies;
}

export default {
  type: new GraphQLList(ArticleReply),
  description: 'Connects specified reply and specified article.',
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    replyId: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(rootValue, { articleId, replyId }, { user, loaders }) {
    const [article, reply] = await loaders.docLoader.loadMany([
      { index: 'articles', id: articleId },
      { index: 'replies', id: replyId },
    ]);

    const articleReplies = await createArticleReply({
      article,
      reply,
      user,
    });

    // When returning, insert articleId so that ArticleReply object type can resolve article.
    return articleReplies.map((ar) => ({ ...ar, articleId }));
  },
};
