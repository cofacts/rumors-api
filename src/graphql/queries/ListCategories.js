import {
  createSortType,
  createConnectionType,
  pagingArgs,
  getSortArgs,
} from 'graphql/util';
import Category from 'graphql/models/Category';

export default {
  args: {
    orderBy: {
      type: createSortType('ListCategoryOrderBy', ['createdAt']),
    },
    ...pagingArgs,
  },
  async resolve(rootValue, { orderBy = [], ...otherParams }) {
    const body = {
      sort: getSortArgs(orderBy),
    };

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'categories',
      type: 'doc',
      body,
      ...otherParams,
    };
  },
  type: createConnectionType('ListCategoryConnection', Category),
};
