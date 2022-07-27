import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'AnalyticsDocTypeEnum',
  values: {
    ARTICLE: 'article',
    REPLY: 'reply',
  },
});
