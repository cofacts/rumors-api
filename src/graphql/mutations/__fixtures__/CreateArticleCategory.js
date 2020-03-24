export default {
  '/articles/doc/createArticleCategory1': {
    text: 'foofoo',
    articleCategories: [],
    references: [{ type: 'LINE' }],
  },
  '/categories/doc/createArticleCategory2': {
    title: 'bar',
    description: 'RUMOR',
  },
  '/articles/doc/articleHasDeletedArticleCategory': {
    text: 'foofoo',
    articleCategories: [
      {
        appId: 'test',
        userId: 'test',
        categoryId: 'createArticleCategory2',
        negativeFeedbackCount: 0,
        positiveFeedbackCount: 0,
        status: 'DELETED',
      },
    ],
    references: [{ type: 'LINE' }],
  },
};
