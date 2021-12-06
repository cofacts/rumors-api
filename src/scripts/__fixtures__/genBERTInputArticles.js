export default {
  '/articles/doc/a1': {
    text: 'The article content',
    normalArticleCategoryCount: 3,
    articleCategories: [
      {
        categoryId: 'c1',
        userId: 'one-user',
        appId: 'WEBSITE',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
        createdAt: '2021-01-01T00:00:00.000Z',
        status: 'NORMAL',
      },
      {
        categoryId: 'c2',
        userId: 'an-user',
        appId: 'WEBSITE',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
        createdAt: '2021-01-01T00:00:00.000Z',
        status: 'NORMAL',
      },
      {
        categoryId: 'c3',
        userId: 'some-user',
        appId: 'WEBSITE',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
        createdAt: '2021-01-01T00:00:00.000Z',
        status: 'NORMAL',
      },
    ],
  },
  '/categories/doc/c1': {
    title: 'Category 1',
    description: 'Description for category 1',
  },
  '/categories/doc/c2': {
    title: 'Category 2',
    description: 'Description for category 2',
  },
  '/categories/doc/c3': {
    title: 'Category 3',
    description: 'Description for category 3',
  },
};
