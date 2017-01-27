import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
} from 'graphql';

import Reply from './Reply';

export default new GraphQLObjectType({
  name: 'Article',
  fields: () => ({
    id: { type: GraphQLString },
    text: { type: GraphQLString },
    replies: {
      type: new GraphQLList(Reply),
      resolve: ({ replyIds }, args, { loaders }) =>
        loaders.docLoader.loadMany(replyIds.map(id => `/replies/basic/${id}`)),
    },
  }),
});
