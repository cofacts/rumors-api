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
import ListAnalytics from './queries/ListAnalytics';
import ListAIResponses from './queries/ListAIResponses';
import ListCooccurrences from './queries/ListCooccurrences';
import ValidateSlug from './queries/ValidateSlug';

// Set individual objects
import CreateArticle from './mutations/CreateArticle';
import CreateMediaArticle from './mutations/CreateMediaArticle';
import CreateReply from './mutations/CreateReply';
import CreateAIReply from './mutations/CreateAIReply';
import CreateArticleReply from './mutations/CreateArticleReply';
import CreateCategory from './mutations/CreateCategory';
import CreateArticleCategory from './mutations/CreateArticleCategory';
import CreateOrUpdateArticleReplyFeedback from './mutations/CreateOrUpdateArticleReplyFeedback';
import CreateOrUpdateReplyRequestFeedback from './mutations/CreateOrUpdateReplyRequestFeedback';
import CreateOrUpdateArticleCategoryFeedback from './mutations/CreateOrUpdateArticleCategoryFeedback';
import CreateOrUpdateReplyRequest from './mutations/CreateOrUpdateReplyRequest';
import CreateOrUpdateCooccurrence from './mutations/CreateOrUpdateCooccurrence';
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
      ListAnalytics,
      ListAIResponses,
      ListCooccurrences,
      ValidateSlug,
    },
  }),
  mutation: new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      CreateArticle,
      CreateMediaArticle,
      CreateReply,
      CreateAIReply,
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
      CreateOrUpdateCooccurrence,
      UpdateArticleReplyStatus,
      UpdateArticleCategoryStatus,
      UpdateUser,
    },
  }),
});
