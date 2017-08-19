import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
} from 'graphql';

import { filterReplyConnectionsByStatus } from 'graphql/util';
import ReplyConnectionStatusEnum from './ReplyConnectionStatusEnum';
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
      args: {
        status: {
          type: ReplyConnectionStatusEnum,
          description: 'When specified, returns only reply connections with the specified status',
        },
      },
      resolve: async ({ id }, { status }, { loaders }) => {
        const replyConnections = await loaders.replyConnectionsByReplyIdLoader.load(
          id
        );
        return filterReplyConnectionsByStatus(replyConnections, status);
      },
    },
  }),
});

export default Reply;
