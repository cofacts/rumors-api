import { GraphQLObjectType, GraphQLSchema } from 'graphql';

// Get individual objects
import GetArticle from './queries/GetArticle';
import GetReply from './queries/GetReply';
import GetUser from './queries/GetUser';
import ListArticles from './queries/ListArticles';
import ListReplies from './queries/ListReplies';
import SearchArticles from './queries/SearchArticles';
import SearchReplies from './queries/SearchReplies';
import SearchCrawledDocs from './queries/SearchCrawledDocs';

// Set individual objects
import CreateArticle from './mutations/CreateArticle';
import CreateReply from './mutations/CreateReply';
import CreateReplyConnection from './mutations/CreateReplyConnection';
import CreateOrUpdateReplyConnectionFeedback
  from './mutations/CreateOrUpdateReplyConnectionFeedback';
import CreateReplyRequest from './mutations/CreateReplyRequest';
import UpdateReplyConnectionStatus
  from './mutations/UpdateReplyConnectionStatus';

export default new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      GetArticle,
      GetReply,
      GetUser,
      ListArticles,
      ListReplies,
      SearchArticles,
      SearchReplies,
      SearchCrawledDocs,
    },
  }),
  mutation: new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      CreateArticle,
      CreateReply,
      CreateReplyConnection,
      CreateReplyRequest,
      CreateOrUpdateReplyConnectionFeedback,
      UpdateReplyConnectionStatus,
    },
  }),
});
