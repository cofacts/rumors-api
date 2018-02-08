import {
  GraphQLString,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLObjectType,
  GraphQLEnumType,
} from 'graphql';

import { assertUser } from 'graphql/util';

import client from 'util/client';
import getIn from 'util/getInFactory';

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
      feedbackCount: { type: GraphQLInt },
      positiveFeedbackCount: { type: GraphQLInt },
      negativeFeedbackCount: { type: GraphQLInt },
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

    await client.update({
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
      refresh: true, // We are searching for articlereplyfeedbacks immediately
    });

    const feedbacks = getIn(
      await client.search({
        index: 'articlereplyfeedbacks',
        type: 'doc',
        body: {
          query: {
            bool: {
              must: [{ term: { articleId } }, { term: { replyId } }],
            },
          },
        },
        _source: ['score'],
      })
    )(['hits', 'hits'], []);

    const [positiveFeedbackCount, negativeFeedbackCount] = feedbacks.reduce(
      (agg, { _source: { score } }) => {
        if (score === 1) {
          agg[0] += 1;
        } else if (score === -1) {
          agg[1] += 1;
        }
        return agg;
      },
      [0, 0]
    );

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
              ctx._source.articleReplies.get(idx).put(
                'positiveFeedbackCount', params.positiveFeedbackCount);
              ctx._source.articleReplies.get(idx).put(
                'negativeFeedbackCount', params.negativeFeedbackCount);
            }
          `,
          params: {
            replyId,
            positiveFeedbackCount,
            negativeFeedbackCount,
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

    return {
      feedbackCount: feedbacks.length,
      negativeFeedbackCount,
      positiveFeedbackCount,
    };
  },
};
