import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'ArticleTypeEnum',
  values: {
    TEXT: {
      value: 'TEXT',
    },
    IMAGE: {
      value: 'IMAGE',
    },
    VIDEO: {
      value: 'VIDEO',
    },
    AUDIO: {
      value: 'AUDIO',
    },
  },
});
