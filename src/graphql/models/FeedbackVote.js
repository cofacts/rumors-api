import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'FeedbackVote',
  values: {
    UPVOTE: { value: 1 },
    NEUTRAL: { value: 0 },
    DOWNVOTE: { value: -1 },
  },
});
