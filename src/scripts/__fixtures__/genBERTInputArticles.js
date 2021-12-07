import { convertAppUserIdToUserId } from 'util/user';
import { getArticleCategoryFeedbackId } from 'graphql/mutations/CreateOrUpdateArticleCategoryFeedback';

export const reviewerUserId = convertAppUserIdToUserId({
  appUserId: 'category-reviewer',
  appId: 'RUMORS_AI',
});

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
        // Previously reviewer gives negative feedback
        negativeFeedbackCount: 1,
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
  '/articles/doc/a2': {
    text: 'The exported article',
    normalArticleCategoryCount: 2,
    createdAt: '2020-11-01T00:00:00.000Z',
    articleCategories: [
      // Not included by getDocToExport() due to score sum = 0
      {
        categoryId: 'c1',
        userId: 'one-user',
        appId: 'WEBSITE',
        positiveFeedbackCount: 1,
        negativeFeedbackCount: 1,
        createdAt: '2021-01-01T00:00:00.000Z',
        status: 'NORMAL',
      },
      // Included by getDocToExport() due to positive > negative
      {
        categoryId: 'c2',
        userId: 'an-user',
        appId: 'WEBSITE',
        positiveFeedbackCount: 2,
        negativeFeedbackCount: 1,
        createdAt: '2021-01-01T00:00:00.000Z',
        status: 'NORMAL',
      },
      // Not included by getDocToExport() because it is deleted
      {
        categoryId: 'c3',
        userId: 'some-user',
        appId: 'WEBSITE',
        positiveFeedbackCount: 1,
        negativeFeedbackCount: 0,
        createdAt: '2021-01-01T00:00:00.000Z',
        status: 'DELETED',
      },
    ],
  },
  [`/articlecategoryfeedbacks/doc/${getArticleCategoryFeedbackId({
    articleId: 'a1',
    categoryId: 'c1',
    userId: reviewerUserId,
    appId: 'RUMORS_AI',
  })}`]: {
    articleId: 'a1',
    categoryId: 'c1',
    appId: 'RUMORS_AI',
    userId: reviewerUserId,
    score: -1,
    comment: 'Previous deny reason',
    status: 'NORMAL',
    createdAt: '2019-01-01T00:00:00.000Z',
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
