import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'AIResponseTypeEnum',
  values: {
    AI_REPLY: {
      description:
        'The AI Response is an automated analysis / reply of an article.',
      value: 'AI_REPLY',
    },

    TRANSCRIPT: {
      description: 'AI transcribed text of the specified article.',
      value: 'TRANSCRIPT',
    },
  },
});
