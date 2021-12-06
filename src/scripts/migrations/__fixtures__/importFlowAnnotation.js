import { convertAppUserIdToUserId } from 'util/user';
import { getArticleCategoryFeedbackId } from 'graphql/mutations/CreateOrUpdateArticleCategoryFeedback';

const reviewerUserId = convertAppUserIdToUserId({
  appUserId: 'category-reviewer',
  appId: 'RUMORS_AI',
});

export default {
  '/articles/doc/a1': {
    text: 'Article text',
    normalArticleCategoryCount: 2,
    articleCategories: [
      // Already existed, not commented
      {
        categoryId: 'kj287XEBrIRcahlYvQoS',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
        status: 'NORMAL',
      },

      // Already existed and commented previously
      {
        categoryId: 'kz3c7XEBrIRcahlYxAp6',
        positiveFeedbackCount: 1,
        negativeFeedbackCount: 1,
        status: 'NORMAL',
      },

      // Previously tagged and then deleted
      {
        categoryId: 'lD3h7XEBrIRcahlYeQqS',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
        status: 'DELETED',
      },
    ],
  },
  [`/articlecategoryfeedbacks/doc/${getArticleCategoryFeedbackId({
    articleId: 'a1',
    categoryId: 'kz3c7XEBrIRcahlYxAp6',
    userId: 'non-reviewer',
    appId: 'WEBSITE',
  })}`]: {
    articleId: 'a1',
    categoryId: 'kz3c7XEBrIRcahlYxAp6',
    appId: 'WEBSITE',
    userId: 'non-reviewer',
    score: 1,
    status: 'NORMAL',
  },
  [`/articlecategoryfeedbacks/doc/${getArticleCategoryFeedbackId({
    articleId: 'a1',
    categoryId: 'kz3c7XEBrIRcahlYxAp6',
    userId: reviewerUserId,
    appId: 'RUMORS_AI',
  })}`]: {
    articleId: 'a1',
    categoryId: 'kz3c7XEBrIRcahlYxAp6',
    appId: 'RUMORS_AI',
    userId: reviewerUserId,
    score: -1,
    status: 'NORMAL',
  },
  '/categories/doc/kj287XEBrIRcahlYvQoS': {
    title: 'Category 1',
    description: 'Description for category 1',
  },
  '/categories/doc/kz3c7XEBrIRcahlYxAp6': {
    title: 'Category 2',
    description: 'Description for category 2',
  },
  '/categories/doc/lD3h7XEBrIRcahlYeQqS': {
    title: 'Category 3',
    description: 'Description for category 3',
  },
  '/categories/doc/lT3h7XEBrIRcahlYugqq': {
    title: 'Category 4',
    description: 'Description for category 4',
  },
};
