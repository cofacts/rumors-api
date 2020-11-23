import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLID,
  GraphQLNonNull,
} from 'graphql';
import FeedbackVote from './FeedbackVote';
import Node from '../interfaces/Node';

export default new GraphQLObjectType({
  name: 'ReplyRequest',
  interfaces: [Node],
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },
    userId: { type: GraphQLString },
    appId: { type: GraphQLString },
    reason: { type: GraphQLString },
    feedbackCount: {
      type: GraphQLInt,
      resolve({ feedbacks = [] }) {
        return feedbacks.length;
      },
    },
    positiveFeedbackCount: {
      type: GraphQLInt,
      resolve({ feedbacks = [] }) {
        return feedbacks.filter(fb => fb.score === 1).length;
      },
    },
    negativeFeedbackCount: {
      type: GraphQLInt,
      resolve({ feedbacks = [] }) {
        return feedbacks.filter(fb => fb.score === -1).length;
      },
    },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
    ownVote: {
      type: FeedbackVote,
      description:
        'The feedback of current user. null when not logged in or not voted yet.',
      resolve({ feedbacks = [] }, args, { userId, appId }) {
        if (!userId || !appId) return null;
        const ownFeedback = feedbacks.find(
          feedback => feedback.userId === userId && feedback.appId === appId
        );
        if (!ownFeedback) return null;
        return ownFeedback.score;
      },
    },
  }),
});
