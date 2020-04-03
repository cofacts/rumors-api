import { getArticleReplyFeedbackId } from 'graphql/mutations/CreateOrUpdateArticleReplyFeedback';

export default {
  '/articles/doc/foo': {
    text: 'Lorum ipsum',
    articleReplies: [
      {
        replyId: 'bar',
        createdAt: '2015-01-01T12:10:30Z',
        updatedAt: '2015-01-02T12:10:30Z',
        status: 'NORMAL',
        positiveFeedbackCount: 1,
        negativeFeedbackCount: 0,
      },
      {
        replyId: 'bar2',
        createdAt: '2015-01-01T12:10:31Z',
        updatedAt: '2015-01-02T12:10:30Z',
        status: 'DELETED',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
      },
      {
        replyId: 'bar4',
        createdAt: '2015-01-01T12:10:32Z',
        updatedAt: '2015-01-02T12:10:30Z',
        status: 'DELETED',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
      },
      {
        replyId: 'bar3',
        createdAt: '2015-01-01T12:10:33Z',
        updatedAt: '2015-01-02T12:10:30Z',
        status: 'DELETED',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 1,
      },
    ],
    normalArticleReplyCount: 1,
    references: [{ type: 'LINE' }],
    replyRequestCount: 1,

    /**
     * Added for tests:
     * 'get specified article and articleCategories with NORMAL status'
     * 'get specified article and articleCategories with DELETED status'
     */
    articleCategories: [
      {
        categoryId: 'c1',
        status: 'NORMAL',
      },
      {
        categoryId: 'c2',
        status: 'DELETED',
      },
    ],
    normalArticleCategoryCount: 1,
  },
  '/articles/doc/foo2': {
    text: 'Lorum ipsum Lorum ipsum',
    articleReplies: [
      {
        replyId: 'bar2',
        status: 'NORMAL',
      },
    ],
    normalArticleReplyCount: 1,
    references: [{ type: 'LINE' }],
  },
  '/articles/doc/foo3': {
    text: 'Lorum ipsum Lorum ipsum Lorum ipsum',
    articleReplies: [
      {
        replyId: 'fofo',
        status: 'NORMAL',
      },
      {
        replyId: 'bar2',
        status: 'DELETED',
      },
    ],
    normalArticleReplyCount: 1,
    references: [{ type: 'LINE' }],
  },
  '/replies/doc/bar': {
    text: 'bar',
    reference: 'barbar',
    type: 'NOT_ARTICLE',
  },
  '/replies/doc/bar2': {
    text: 'bar2',
    reference: 'barbar2',
    type: 'NOT_ARTICLE',
  },
  '/replies/doc/fofo': {
    text: 'fofo',
    reference: 'barfofo',
    type: 'NOT_ARTICLE',
  },
  '/replyrequests/doc/articleTest1': {
    articleId: 'foo',
    userId: 'fakeUser',
    appId: 'LINE',
    reason: 'Reason foo',
    feedbacks: [{ score: 1 }, { score: -1 }],
  },
  '/replyrequests/doc/articleTest2': {
    // Legacy reply request that has no feedbacks[] nor reason.
    articleId: 'foo',
    userId: 'fakeUser',
    appId: 'LINE',
  },
  [`/articlereplyfeedbacks/doc/${getArticleReplyFeedbackId({
    articleId: 'foo',
    replyId: 'bar',
    userId: 'test-user',
    appId: 'test-app',
  })}`]: {
    articleId: 'foo',
    replyId: 'bar',
    userId: 'test-user',
    appId: 'test-app',
    score: 1,
  },
  '/categories/doc/c1': {
    title: '性少數與愛滋病',
    description: '對同性婚姻的恐懼、愛滋病的誤解與的防疫相關釋疑。',
  },
  '/categories/doc/c2': {
    title: '免費訊息詐騙',
    description: '詐騙貼圖、假行銷手法。',
  },
};
