import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
} from 'graphql';

import {
  scoredDocFactory,
} from 'graphql/util';

import Article from './Article';
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
    articles: {
      type: new GraphQLList(Article),
      resolve: ({ id }, args, { loaders }) =>
        loaders.articlesByReplyIdLoader.load(id),
    },
  }),
});

export const ScoredReply = scoredDocFactory('ScoredReply', Reply);

export default Reply;
