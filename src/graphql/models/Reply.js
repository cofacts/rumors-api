import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
} from 'graphql';

import Article from './Article';
import ReplyVersion from './ReplyVersion';

export default new GraphQLObjectType({
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
