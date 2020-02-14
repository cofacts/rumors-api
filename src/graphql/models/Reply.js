import { GraphQLObjectType, GraphQLString, GraphQLList } from 'graphql';

import { filterArticleRepliesByStatus } from 'graphql/util';
import ReplyTypeEnum from './ReplyTypeEnum';
import ArticleReplyStatusEnum from './ArticleReplyStatusEnum';
import ArticleReply from './ArticleReply';
import User, { userFieldResolver } from './User';
import Hyperlink from './Hyperlink';

const Reply = new GraphQLObjectType({
  name: 'Reply',
  fields: () => ({
    id: { type: GraphQLString },
    user: {
      type: User,
      description: 'The user submitted this reply version',
      resolve: userFieldResolver,
    },
    createdAt: { type: GraphQLString },
    text: { type: GraphQLString },
    type: { type: ReplyTypeEnum },
    reference: { type: GraphQLString },
    articleReplies: {
      type: new GraphQLList(ArticleReply),
      args: {
        status: {
          type: ArticleReplyStatusEnum,
          description:
            'When specified, returns only reply connections with the specified status',
        },
      },
      resolve: async ({ id }, { status }, { loaders }) => {
        const articleReplies = await loaders.articleRepliesByReplyIdLoader.load(
          id
        );
        return filterArticleRepliesByStatus(articleReplies, status);
      },
    },
    hyperlinks: {
      type: new GraphQLList(Hyperlink),
      description:
        'Hyperlinks in reply text or reference. May be empty array if no URLs are included. `null` when hyperlinks are still fetching.',
    },
  }),
});

export default Reply;
