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
import ListReplyRequests from './queries/ListReplyRequests';
import ListBlockedUsers from './queries/ListBlockedUsers';
import ValidateSlug from './queries/ValidateSlug';

// Set individual objects
import CreateArticle from './mutations/CreateArticle';
import CreateMediaArticle from './mutations/CreateMediaArticle';
import CreateReply from './mutations/CreateReply';
import CreateArticleReply from './mutations/CreateArticleReply';
import CreateCategory from './mutations/CreateCategory';
import CreateArticleCategory from './mutations/CreateArticleCategory';
import CreateOrUpdateArticleReplyFeedback from './mutations/CreateOrUpdateArticleReplyFeedback';
import CreateOrUpdateReplyRequestFeedback from './mutations/CreateOrUpdateReplyRequestFeedback';
import CreateOrUpdateArticleCategoryFeedback from './mutations/CreateOrUpdateArticleCategoryFeedback';
import CreateOrUpdateReplyRequest from './mutations/CreateOrUpdateReplyRequest';
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
      ListReplyRequests,
      ListBlockedUsers,
      ValidateSlug,
    },
  }),
  mutation: new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      CreateArticle,
      CreateMediaArticle,
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
      UpdateArticleReplyStatus,
      UpdateArticleCategoryStatus,
      UpdateUser,
    },
  }),
});
