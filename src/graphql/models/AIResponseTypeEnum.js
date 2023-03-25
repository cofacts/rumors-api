import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'AIResponseTypeEnum',
  values: {
    AI_REPLY: {
      description:
        'The AI Response is an automated analysis / reply of an article.',
      value: 'AI_REPLY',
    },
    // TBA: speach-to-text result, OCR result, reply review response, etc
  },
});
