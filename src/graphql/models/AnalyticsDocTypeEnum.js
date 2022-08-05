import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'AnalyticsDocTypeEnum',
  values: {
    ARTICLE: { value: 'article' },
    REPLY: { value: 'reply' },
  },
});
