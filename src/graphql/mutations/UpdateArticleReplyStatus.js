import { GraphQLString, GraphQLNonNull, GraphQLList } from 'graphql';
import client from 'util/client';
import ArticleReply from 'graphql/models/ArticleReply';
import ArticleReplyStatusEnum from 'graphql/models/ArticleReplyStatusEnum';
import { getContentDefaultStatus } from 'util/user';

/**
 * @param {object} arg
 * @param {string} arg.articleId
 * @param {string} arg.replyId
 * @param {string} arg.userId
 * @param {string} arg.appId
 * @param {string} arg.status
 *
 * @returns {ArticleReply[]} list of article replies after delete
 */
export async function updateArticleReplyStatus({
  articleId,
  replyId,
  userId,
  appId,
  status,
}) {
  const {
    body: {
      result,
      get: { _source },
    },
  } = await client.update({
    index: 'articles',
    type: 'doc',
    id: articleId,
    body: {
      script: {
        source: `
          int idx = 0;
          int replyCount = ctx._source.articleReplies.size();
          for(; idx < replyCount; idx += 1) {
            HashMap articleReply = ctx._source.articleReplies.get(idx);
            if(
              articleReply.get('replyId').equals(params.replyId) &&
              articleReply.get('userId').equals(params.userId) &&
              articleReply.get('appId').equals(params.appId)
            ) {
              break;
            }
          }

          if( idx === replyCount ) {
            ctx.op = 'none';
          } else {
            ctx._source.articleReplies.get(idx).put('status', params.status);
            ctx._source.articleReplies.get(idx).put('updatedAt', params.updatedAt);
            ctx._source.normalArticleReplyCount = ctx._source.articleReplies.stream().filter(
              ar -> ar.get('status').equals('NORMAL')
            ).count();
          }
        `,
        params: {
          replyId,
          userId,
          appId,
          status,
          updatedAt: new Date().toISOString(),
        },
        lang: 'painless',
      },
      _source: ['articleReplies.*'],
    },
  });

  if (result === 'noop') {
    throw new Error(
      `Cannot change status for articleReply(articleId=${articleId}, replyId=${replyId})`
    );
  }

  return _source.articleReplies;
}

export default {
  type: new GraphQLList(ArticleReply),
  description: 'Change status of specified articleReplies',
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    replyId: { type: new GraphQLNonNull(GraphQLString) },
    status: {
      type: new GraphQLNonNull(ArticleReplyStatusEnum),
    },
  },
  async resolve(rootValue, { articleId, replyId, status }, { user }) {
    // If user want to change status to "NORMAL", use the "default" content state for the user instead
    const targetStatus =
      status === 'NORMAL' ? getContentDefaultStatus(user) : status;

    const articleReplies = await updateArticleReplyStatus({
      articleId,
      replyId,
      userId: user.id,
      appId: user.appId,
      status: targetStatus,
    });

    // When returning, insert articleId so that ArticleReply object type can resolve article.
    return articleReplies.map(ar => ({ ...ar, articleId }));
  },
};
