import { getArticleCategoryFeedbackId } from '../CreateOrUpdateArticleCategoryFeedback';

function generateEntry(data) {
  return {
    [`/articlecategoryfeedbacks/doc/${getArticleCategoryFeedbackId(data)}`]:
      data,
  };
}

export default {
  '/articles/doc/article1': {
    articleCategories: [
      {
        categoryId: 'category1',
        positiveFeedbackCount: 11,
        negativeFeedbackCount: 0,
      },
    ],
  },
  ...generateEntry({
    score: 1,
    articleId: 'article1',
    categoryId: 'category1',
    appId: 'testClient',
    userId: 'testUser',
    createdAt: '2017-01-01T00:00:00.000Z',
    status: 'NORMAL',
  }),
  ...generateEntry({
    score: 1,
    articleId: 'article1',
    categoryId: 'category1',
    appId: 'testClient',
    userId: 'testUser2',
    createdAt: '2017-01-01T00:00:00.000Z',
    status: 'NORMAL',
  }),
  ...generateEntry({
    score: 1,
    articleId: 'article1',
    categoryId: 'category1',
    appId: 'testClient',
    userId: 'testUser3',
    createdAt: '2017-01-01T00:00:00.000Z',
    status: 'NORMAL',
  }),
  ...generateEntry({
    score: 1,
    articleId: 'article1',
    categoryId: 'category1',
    appId: 'testClient',
    userId: 'testUser4',
    createdAt: '2017-01-01T00:00:00.000Z',
    status: 'NORMAL',
  }),
  ...generateEntry({
    score: 1,
    articleId: 'article1',
    categoryId: 'category1',
    appId: 'testClient',
    userId: 'testUser5',
    createdAt: '2017-01-01T00:00:00.000Z',
    status: 'NORMAL',
  }),
  ...generateEntry({
    score: 1,
    articleId: 'article1',
    categoryId: 'category1',
    appId: 'testClient',
    userId: 'testUser6',
    createdAt: '2017-01-01T00:00:00.000Z',
    status: 'NORMAL',
  }),
  ...generateEntry({
    score: 1,
    articleId: 'article1',
    categoryId: 'category1',
    appId: 'testClient',
    userId: 'testUser7',
    createdAt: '2017-01-01T00:00:00.000Z',
    status: 'NORMAL',
  }),
  ...generateEntry({
    score: 1,
    articleId: 'article1',
    categoryId: 'category1',
    appId: 'testClient',
    userId: 'testUser8',
    createdAt: '2017-01-01T00:00:00.000Z',
    status: 'NORMAL',
  }),
  ...generateEntry({
    score: 1,
    articleId: 'article1',
    categoryId: 'category1',
    appId: 'testClient',
    userId: 'testUser9',
    createdAt: '2017-01-01T00:00:00.000Z',
    status: 'NORMAL',
  }),
  ...generateEntry({
    score: 1,
    articleId: 'article1',
    categoryId: 'category1',
    appId: 'testClient',
    userId: 'testUser10',
    createdAt: '2017-01-01T00:00:00.000Z',
    status: 'NORMAL',
  }),
  ...generateEntry({
    score: 1,
    articleId: 'article1',
    categoryId: 'category1',
    appId: 'testClient',
    userId: 'testUser11',
    createdAt: '2017-01-01T00:00:00.000Z',
    status: 'NORMAL',
  }),
};
