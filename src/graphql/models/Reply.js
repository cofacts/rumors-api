import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
} from 'graphql';

import {
  scoredDocFactory,
} from 'graphql/util';

import ReplyConnection from './ReplyConnection';
import ReplyVersion from './ReplyVersion';

const Reply = new GraphQLObjectType({
  name: 'Reply',
  fields: () => ({
    id: { type: GraphQLString },
    versions: {
      args: {
        limit: { type: GraphQLInt },
      },
      type: new GraphQLList(ReplyVersion),
      resolve: ({ versions }, { limit = Infinity }) => versions.slice(-limit),
    },
    replyConnections: {
      type: new GraphQLList(ReplyConnection),
      resolve: ({ id }, args, { loaders }) =>
        loaders.replyConnectionsByReplyIdLoader.load(id),
    },
  }),
});

export const ScoredReply = scoredDocFactory('ScoredReply', Reply);

export default Reply;
