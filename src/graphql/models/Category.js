import { GraphQLObjectType, GraphQLString } from 'graphql';

import {
  filterArticleCategoriesByStatus,
  createSortType,
  createFilterType,
  pagingArgs,
} from 'graphql/util';

import { ArticleCategoryConnection } from './ArticleCategory';
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
      type: ArticleCategoryConnection,
      args: {
        filter: {
          type: createFilterType('CategoryArticleCategoriesFilter', {
            status: {
              type: ArticleCategoryStatusEnum,
              description:
                'When specified, returns only article categories with the specified status',
            },
          }),
        },
        orderBy: {
          type: createSortType('CategoryArticleCategoriesOrderBy', [
            'createdAt',
          ]),
        },
        ...pagingArgs,
      },
      resolve: async ({ id }, { status }, { loaders }) => {
        const articleCategories = await loaders.articleCategoriesByCategoryIdLoader.load(
          id
        );
        return filterArticleCategoriesByStatus(articleCategories, status);
      },
    },
  }),
});

export default Category;
