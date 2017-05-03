import {
  GraphQLString,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLObjectType,
  GraphQLEnumType,
} from 'graphql';

import { assertUser } from 'graphql/util';

import client from 'util/client';

export default {
  description: 'Create or update a feedback on an article-reply connection',
  type: new GraphQLObjectType({
    name: 'CreateOrUpdateReplyConnectionFeedbackResult',
    fields: {
      feedbackCount: {
        type: GraphQLInt,
      },
    },
  }),
  args: {
    replyConnectionId: { type: new GraphQLNonNull(GraphQLString) },
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
    comment: {
      type: GraphQLString,
      description: 'Optional text comment explaining why vote like this',
    },
  },
  async resolve(
    rootValue,
    { replyConnectionId, vote, comment },
    { from, userId }
  ) {
    assertUser({ from, userId });

    const now = new Date().toISOString();

    // (replyConnectionId, userId, from) should be unique
    // but user can update
    const id = `${replyConnectionId}__${userId}__${from}`;

    const { created } = await client.index({
      index: 'replyconnectionfeedbacks',
      type: 'basic',
      id,
      body: {
        score: vote,
        userId,
        from,
        comment,
        createdAt: now,
        updatedAt: now,
      },
    });

    let feedbackCount;

    if (created) {
      const connectionUpdateResult = await client.update({
        index: 'replyconnections',
        type: 'basic',
        id: replyConnectionId,
        body: {
          script: {
            inline: 'if(!ctx._source.feedbackIds.contains(params.id)) {ctx._source.feedbackIds.add(params.id)}',
            params: { id },
          },
        },
        _source: true,
      });
      if (connectionUpdateResult.result !== 'updated') {
        throw new Error(
          `Cannot append feedback ${id} to replyConnection ${replyConnectionId}`
        );
      }
      feedbackCount = connectionUpdateResult.get._source.feedbackIds.length;
    } else {
      // No feedback is newly created, it is just updated.
      //
      const connectionGetResult = await client.get({
        index: 'replyconnections',
        type: 'basic',
        id: replyConnectionId,
      });
      feedbackCount = connectionGetResult._source.feedbackIds.length;
    }

    return { feedbackCount };
  },
};
