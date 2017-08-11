import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'ReplyConnectionStatusEnum',
  values: {
    NORMAL: {
      value: 'NORMAL',
    },
    DELETED: {
      value: 'DELETED',
    },
  },
});
