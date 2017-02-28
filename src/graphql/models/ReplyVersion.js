import {
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';

import ReplyTypeEnum from './ReplyTypeEnum';
import User, { userFieldResolver } from './User';

export default new GraphQLObjectType({
  name: 'ReplyVersion',
  fields: () => ({
    user: {
      type: User,
      description: 'The user submitted this reply version',
      resolve: userFieldResolver,
    },
    createdAt: { type: GraphQLString },
    text: { type: GraphQLString },
    type: { type: ReplyTypeEnum },
    reference: { type: GraphQLString },
  }),
});
