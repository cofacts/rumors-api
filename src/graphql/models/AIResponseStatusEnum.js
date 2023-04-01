import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'AIResponseStatusEnum',
  values: {
    LOADING: { value: 'LOADING' },
    SUCCESS: { value: 'SUCCESS' },
    ERROR: { value: 'ERROR' },
  },
});
