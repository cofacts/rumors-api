import { GraphQLString, GraphQLNonNull } from 'graphql';

import { assertUser } from 'util/user';
import FeedbackVote from 'graphql/models/FeedbackVote';
import ReplyRequest from 'graphql/models/ReplyRequest';

import client from 'util/client';

export default {
  description: 'Create or update a feedback on a reply request reason',
  type: ReplyRequest,
  args: {
    replyRequestId: { type: new GraphQLNonNull(GraphQLString) },
    vote: { type: new GraphQLNonNull(FeedbackVote) },
  },
  async resolve(rootValue, { replyRequestId, vote }, { appId, userId }) {
    assertUser({ appId, userId });

    const now = new Date().toISOString();

    const {
      body: {
        get: { _source },
      },
    } = await client.update({
      index: 'replyrequests',
      type: 'doc',
      id: replyRequestId,
      body: {
        script: {
          source: `
            int idx = 0;
            int feedbackCount = ctx._source.feedbacks.size();
            for(; idx < feedbackCount; idx += 1) {
              HashMap feedback = ctx._source.feedbacks.get(idx);
              if(
                feedback.get('userId').equals(params.userId) &&
                feedback.get('appId').equals(params.appId)
              ) {
                break;
              }
            }

            if( idx === feedbackCount ) {
              HashMap newFeedback = new HashMap();

              newFeedback.put('userId', params.userId);
              newFeedback.put('appId', params.appId);
              newFeedback.put('score', params.score);
              newFeedback.put('createdAt', params.now);
              newFeedback.put('updatedAt', params.now);

              ctx._source.feedbacks.add(newFeedback);
            } else {
              ctx._source.feedbacks.get(idx).put('score', params.score);
              ctx._source.feedbacks.get(idx).put('updatedAt', params.now);
            }

            ctx._source.positiveFeedbackCount = ctx._source.feedbacks.stream().filter(
              ar -> ar.get('score').equals(1)
            ).count();
            ctx._source.negativeFeedbackCount = ctx._source.feedbacks.stream().filter(
              ar -> ar.get('score').equals(-1)
            ).count();
          `,
          params: {
            userId,
            appId,
            score: vote,
            now,
          },
          lang: 'painless',
        },
      },
      _source: true,
    });

    return { ..._source, id: replyRequestId };
  },
};
