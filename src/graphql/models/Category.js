import { GraphQLObjectType, GraphQLString } from 'graphql';

import { createSortType, pagingArgs, getSortArgs } from 'graphql/util';

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
        status: {
          type: ArticleCategoryStatusEnum,
          description:
            'When specified, returns only article categories with the specified status',
        },
        orderBy: {
          type: createSortType('CategoryArticleCategoriesOrderBy', [
            'createdAt',
          ]),
        },
        ...pagingArgs,
      },
      resolve: async (
        { id },
        { status = 'NORMAL', orderBy = [], ...otherParams }
      ) => {
        const body = {
          sort: getSortArgs(orderBy),
          query: {
            nested: {
              path: 'articleCategories',
              query: [
                {
                  term: { 'articleCategories.categoryId': id },
                },
                {
                  term: { 'articleCategories.status': status },
                },
              ],
            },
          },
        };

        return {
          index: 'articles',
          type: 'doc',
          body,
          ...otherParams,
        };
      },
    },
  }),
});

export default Category;
