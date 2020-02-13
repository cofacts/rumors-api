import { GraphQLObjectType, GraphQLString, GraphQLList } from 'graphql';
import ArticleCategory from './ArticleCategory';
import ArticleCategoryStatusEnum from './ArticleCategoryStatusEnum';

const Category = new GraphQLObjectType({
  name: 'Category',
  description: 'Category label for specific topic',
  fields: () => ({
    id: { type: GraphQLString },
    title: { type: GraphQLString },
    description: { type: GraphQLString },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },

    articleCategories: {
      type: new GraphQLList(ArticleCategory),
      args: {
        status: {
          type: ArticleCategoryStatusEnum,
          description:
            'When specified, returns only article categories with the specified status',
        },
      },
      resolve({ id }, args, { userId, appId }) {
        // TODO: Mock data, needs implementation
        return [
          {
            aiModel: 'Model1',
            aiConfidence: 0.8,
            positiveFeedbackCount: 2,
            negativeFeedbackCount: 1,
            categoryId: id,
            articleId: 'AVrwb4-OtKp96s659CvV',
            status: 'NORMAL',
            createdAt: '2020-02-06T05:34:45.862Z',
            updatedAt: '2020-02-06T05:34:46.862Z',
          },
          {
            // Simulate category that is added by current user
            userId,
            appId,
            positiveFeedbackCount: 2,
            negativeFeedbackCount: 1,
            categoryId: id,
            articleId: 'AWDuGBU6yCdS-nWhum2u',
            status: 'NORMAL',
            createdAt: '2020-02-06T05:34:45.862Z',
            updatedAt: '2020-02-06T05:34:46.862Z',
          },
        ];
      },
    },
  }),
});

export default Category;
