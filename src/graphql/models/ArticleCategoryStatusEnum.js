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
      description: 'Created by a blocked user violating terms of use.',
    },
  },
});
