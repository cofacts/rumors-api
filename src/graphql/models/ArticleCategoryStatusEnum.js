import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'ArticleCategoryStatusEnum',
  values: {
    NORMAL: {
      value: 'NORMAL',
    },
    DELETED: {
      value: 'DELETED',
    },
    BLOCKED: {
      value: 'BLOCKED',
    },
  },
});
