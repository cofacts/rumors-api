import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'ReplyRequestStatusEnum',
  values: {
    NORMAL: {
      value: 'NORMAL',
    },
    BLOCKED: {
      value: 'BLOCKED',
      description: 'Created by a blocked user violating terms of use.',
    },
  },
});
