import {
  GraphQLString,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLObjectType,
  GraphQLEnumType,
} from 'graphql';

import { assertUser } from 'graphql/util';

import client from 'util/client';

export function getArticleReplyFeedbackId({
  articleId,
  replyId,
  userId,
  appId,
}) {
  return `${articleId}__${replyId}__${userId}__${appId}`;
}

export default {
  description: 'Create or update a feedback on an article-reply connection',
  type: new GraphQLObjectType({
    name: 'CreateOrUpdateArticleReplyFeedbackResult',
    fields: {
      feedbackCount: {
        type: GraphQLInt,
      },
    },
  }),
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    replyId: { type: new GraphQLNonNull(GraphQLString) },
    vote: {
      type: new GraphQLNonNull(
        new GraphQLEnumType({
          name: 'FeedbackVote',
          values: {
            UPVOTE: { value: 1 },
            NEUTRAL: { value: 0 },
            DOWNVOTE: { value: -1 },
          },
        })
      ),
    },
  },
  async resolve(rootValue, { articleId, replyId, vote }, { appId, userId }) {
    assertUser({ appId, userId });

    const now = new Date().toISOString();

    // (replyConnectionId, userId, from) should be unique
    // but user can update
    const id = getArticleReplyFeedbackId({
      articleId,
      replyId,
      userId,
      appId,
    });

    const { result } = await client.update({
      index: 'articlereplyfeedbacks',
      type: 'doc',
      id,
      body: {
        doc: {
          score: vote,
          updatedAt: now,
        },
        upsert: {
          articleId,
          replyId,
          userId,
          appId,
          score: vote,
          createdAt: now,
          updatedAt: now,
        },
      },
    });

    const isCreated = result === 'created';

    if (isCreated && vote !== 0) {
      const articleReplyUpdateResult = await client.update({
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
                if( articleReply.get('replyId').equals(params.replyId) ) {
                  break;
                }
              }

              if( idx === replyCount ) {
                ctx.op = 'none';
              } else {
                int count = ctx._source.articleReplies.get(idx).get(params.fieldName);
                ctx._source.articleReplies.get(idx).put(params.fieldName, count + 1);
              }
            `,
            params: {
              fieldName:
                vote === 1 ? 'positiveFeedbackCount' : 'negativeFeedbackCount',
            },
          },
        },
        _source: true,
      });
      if (articleReplyUpdateResult.result !== 'updated') {
        throw new Error(
          `Cannot article ${articleId}'s feedback count for feedback ID = ${id}`
        );
      }
    }

    const { count: feedbackCount } = await client.count({
      index: 'articlereplyfeedbacks',
      type: 'doc',
      body: {
        query: {
          term: {
            articleId,
            replyId,
          },
        },
      },
    });

    return { feedbackCount };
  },
};
