export default {
  '/articles/doc/others': {
    articleCategories: [
      {
        categoryId: 'others',
        status: 'NORMAL',
        userId: 'not you',
        appId: 'not this app',
      },
    ],
  },
  '/articles/doc/normal': {
    articleCategories: [
      {
        categoryId: 'category',
        userId: 'foo',
        appId: 'test',
        status: 'NORMAL',
      },
    ],
  },
  '/articles/doc/deleted': {
    articleCategories: [
      {
        categoryId: 'category',
        userId: 'foo',
        appId: 'test',
        status: 'DELETED',
      },
    ],
  },
};
