import { GraphQLEnumType } from 'graphql';

export const errors = {
  EMPTY: 'EMPTY',
  NOT_TRIMMED: 'NOT_TRIMMED',
  HAS_URI_COMPONENT: 'HAS_URI_COMPONENT',
  TAKEN: 'TAKEN',
};

export default new GraphQLEnumType({
  name: 'SlugErrorEnum',
  description: 'Slug of canot',
  values: {
    [errors.EMPTY]: {
      value: errors.EMPTY,
      description: 'Slug is empty',
    },
    [errors.NOT_TRIMMED]: {
      value: errors.NOT_TRIMMED,
      description: 'Slug have leading or trailing spaces or line ends',
    },
    [errors.HAS_URI_COMPONENT]: {
      value: errors.HAS_URI_COMPONENT,
      description:
        'Slug has URI component inside, which can be misleading to browsers',
    },
    [errors.TAKEN]: {
      value: errors.TAKEN,
      description: 'Slug has already been taken by someone else',
    },
  },
});
