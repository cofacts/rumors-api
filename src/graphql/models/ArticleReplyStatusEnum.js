import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'ArticleReplyStatusEnum',
  values: {
    NORMAL: {
      value: 'NORMAL',
    },
    DELETED: {
      value: 'DELETED',
    },
  },
});
