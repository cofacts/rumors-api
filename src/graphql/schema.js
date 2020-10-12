import { GraphQLObjectType, GraphQLSchema } from 'graphql';

// Get individual objects
import GetArticle from './queries/GetArticle';
import GetReply from './queries/GetReply';
import GetUser from './queries/GetUser';
import GetCategory from './queries/GetCategory';
import ListArticles from './queries/ListArticles';
import ListReplies from './queries/ListReplies';
import ListCategories from './queries/ListCategories';
import ListArticleReplyFeedbacks from './queries/ListArticleReplyFeedbacks';

// Set individual objects
import CreateArticle from './mutations/CreateArticle';
import CreateReply from './mutations/CreateReply';
import CreateArticleReply from './mutations/CreateArticleReply';
import CreateCategory from './mutations/CreateCategory';
import CreateArticleCategory from './mutations/CreateArticleCategory';
import CreateOrUpdateArticleReplyFeedback from './mutations/CreateOrUpdateArticleReplyFeedback';
import CreateOrUpdateReplyRequestFeedback from './mutations/CreateOrUpdateReplyRequestFeedback';
import CreateOrUpdateArticleCategoryFeedback from './mutations/CreateOrUpdateArticleCategoryFeedback';
import CreateOrUpdateReplyRequest from './mutations/CreateOrUpdateReplyRequest';
import CreateOrUpdateUser from './mutations/CreateOrUpdateUser';
import UpdateArticleReplyStatus from './mutations/UpdateArticleReplyStatus';
import UpdateArticleCategoryStatus from './mutations/UpdateArticleCategoryStatus';
import UpdateUser from './mutations/UpdateUser';

export default new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      GetArticle,
      GetReply,
      GetUser,
      GetCategory,
      ListArticles,
      ListReplies,
      ListCategories,
      ListArticleReplyFeedbacks,
    },
  }),
  mutation: new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      CreateArticle,
      CreateReply,
      CreateArticleReply,
      CreateCategory,
      CreateArticleCategory,
      CreateReplyRequest: {
        ...CreateOrUpdateReplyRequest,
        deprecationReason: 'Use CreateOrUpdateReplyRequest instead',
      },
      CreateOrUpdateReplyRequest,
      CreateOrUpdateArticleReplyFeedback,
      CreateOrUpdateArticleCategoryFeedback,
      CreateOrUpdateReplyRequestFeedback,
      CreateOrUpdateUser,
      UpdateArticleReplyStatus,
      UpdateArticleCategoryStatus,
      UpdateUser,
    },
  }),
});
