import { GraphQLObjectType, GraphQLString, GraphQLInt } from 'graphql';

export default new GraphQLObjectType({
  name: 'ReplyRequest',
  fields: () => ({
    id: { type: GraphQLString },
    userId: { type: GraphQLString },
    appId: { type: GraphQLString },
    reason: { type: GraphQLString },
    feedbackCount: {
      type: GraphQLInt,
      resolve({ feedbacks }) {
        return feedbacks.length;
      },
    },
    positiveFeedbackCount: {
      type: GraphQLInt,
      resolve({ feedbacks }) {
        return feedbacks.filter(fb => fb.score === 1).length;
      },
    },
    negativeFeedbackCount: {
      type: GraphQLInt,
      resolve({ feedbacks }) {
        return feedbacks.filter(fb => fb.score === -1).length;
      },
    },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  }),
});
