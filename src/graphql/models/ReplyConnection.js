import {
  GraphQLObjectType,
  GraphQLList,
  GraphQLInt,
  GraphQLString,
} from 'graphql';

import Article from './Article';
import User, { userFieldResolver } from './User';
import Reply from './Reply';
import ReplyConnectionFeedback from './ReplyConnectionFeedback';

export default new GraphQLObjectType({
  name: 'ReplyConnection',
  description: 'The linkage between an Article and a Reply',
  fields: () => ({
    reply: {
      type: Reply,
      resolve: ({ replyId }, args, { loaders }) =>
        loaders.docLoader.load({ index: 'replies', id: replyId }),
    },
    article: {
      type: Article,
      resolve: ({ _parent }, args, { loaders }) =>
        loaders.docLoader.load({
          index: 'data',
          type: 'articles',
          id: _parent,
        }),
    },

    id: {
      type: GraphQLString,
    },

    user: {
      type: User,
      description: 'The user who conencted this reply and this article.',
      resolve: userFieldResolver,
    },

    feedbackCount: {
      type: GraphQLInt,
      resolve: ({ feedbackIds = [] }) => feedbackIds.length,
    },

    feedbacks: {
      type: new GraphQLList(ReplyConnectionFeedback),
      resolve: ({ feedbackIds = [] }, args, { loaders }) =>
        loaders.docLoader.loadMany(
          feedbackIds.map(id => ({ index: 'replyconnectionfeedbacks', id }))
        ),
    },
  }),
});
