import {
  GraphQLString,
  GraphQLNonNull,
} from 'graphql';

import Reply from 'graphql/models/Reply';
import ReplyTypeEnum from 'graphql/models/ReplyTypeEnum';

export default {
  type: Reply,
  description: 'Create a reply',
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    text: { type: new GraphQLNonNull(GraphQLString) },
    type: { type: new GraphQLNonNull(ReplyTypeEnum) },
    reference: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(rootValue, { id, text }, { loaders }) {
    const reply = loaders.docLoader.load(`/replies/basic/${id}`);

    return reply;
  },
};
