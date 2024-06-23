import { GraphQLEnumType } from 'graphql';
import { AvatarTypes } from 'util/user';

export default new GraphQLEnumType({
  name: 'AvatarTypeEnum',
  values: Object.fromEntries(
    Object.keys(AvatarTypes).map((k) => [k, { value: k }])
  ),
});
