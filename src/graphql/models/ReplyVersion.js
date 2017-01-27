import {
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';

import ReplyTypeEnum from './ReplyTypeEnum';

export default new GraphQLObjectType({
  name: 'ReplyVersion',
  fields: () => ({
    createdAt: { type: GraphQLString },
    text: { type: GraphQLString },
    type: { type: ReplyTypeEnum },
    reference: { type: GraphQLString },
  }),
});
