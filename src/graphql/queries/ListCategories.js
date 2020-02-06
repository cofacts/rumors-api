import { createSortType, createConnectionType, pagingArgs } from 'graphql/util';
import Category from 'graphql/models/Category';

import MOCK_CATEGORY_DATA from '../mockCategories';

function getMockCursor(category) {
  return category.id;
}

export default {
  args: {
    orderBy: {
      type: createSortType('ListCategoryOrderBy', ['createdAt']),
    },
    ...pagingArgs,
  },
  async resolve(rootValue, { first = 10, after, before }) {
    // TODO: Remove mockdata
    let firstIdx = 0;
    if (after) {
      firstIdx =
        MOCK_CATEGORY_DATA.findIndex(
          category => getMockCursor(category) === after
        ) + 1;
    } else if (before) {
      const lastIdx = MOCK_CATEGORY_DATA.findIndex(
        category => getMockCursor(category) === before
      );
      firstIdx = lastIdx - first;
    }
    return MOCK_CATEGORY_DATA.slice(Math.max(0, firstIdx), firstIdx + first);
  },
  type: createConnectionType('ListCategoryConnection', Category, {
    // TODO: When we fetch data from Elasticsearch, createConnectionType()'s default resolvers should
    // do its job, and we won't need any of the following mock resolvers below.
    //
    resolveEdges: function mockResolveEdges(mockData) {
      return mockData.map(category => ({
        node: category,
        cursor: getMockCursor(category),
      }));
    },
    resolveTotalCount: function mockResolveTotalCount() {
      return MOCK_CATEGORY_DATA.length;
    },
    resolveLastCursor: function mockResolveLastCursor() {
      return getMockCursor(MOCK_CATEGORY_DATA[MOCK_CATEGORY_DATA.length - 1]);
    },
    resolveFirstCursor: function mockResolveFirstCursor() {
      return getMockCursor(MOCK_CATEGORY_DATA[0]);
    },
  }),
};
