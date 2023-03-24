import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'AIResponseDocTypeEnum',
  values: {
    ARTICLE: { value: 'article' },
  },
});
