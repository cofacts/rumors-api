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
        userId: 'user1',
        appId: 'app1',
      },
      {
        replyId: 'bar2',
        createdAt: '2015-01-01T12:10:31Z',
        updatedAt: '2015-01-02T12:10:30Z',
        status: 'DELETED',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
        userId: 'user2',
        appId: 'app1',
      },
      {
        replyId: 'bar4',
        createdAt: '2015-01-01T12:10:32Z',
        updatedAt: '2015-01-02T12:10:30Z',
        status: 'DELETED',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
        userId: 'user1',
        appId: 'app2',
      },
      {
        replyId: 'bar3',
        createdAt: '2015-01-01T12:10:33Z',
        updatedAt: '2015-01-02T12:10:30Z',
        status: 'DELETED',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 1,
        userId: 'user2',
        appId: 'app2',
      },
      {
        replyId: 'bar5',
        createdAt: '2015-01-01T12:10:33Z',
        updatedAt: '2015-01-02T12:10:30Z',
        status: 'BLOCKED',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 1,
        userId: 'blocked-user',
        appId: 'WEBSITE',
      },
    ],
    normalArticleReplyCount: 1,
    references: [{ type: 'LINE' }],
    replyRequestCount: 2,
    articleCategories: [
      {
        categoryId: 'c1',
        status: 'NORMAL',
        createdAt: '2015-01-01T12:10:33Z',
      },
      {
        categoryId: 'c2',
        status: 'DELETED',
        createdAt: '2015-01-01T12:11:33Z',
      },
      {
        categoryId: 'c3',
        status: 'BLOCKED',
        createdAt: '2015-01-03T12:11:33Z',
      },
    ],
    normalArticleCategoryCount: 1,
    hyperlinks: [
      {
        title: 'title',
        summary: 'summary summary',
      },
    ],
    status: 'NORMAL',
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
    status: 'NORMAL',
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
    hyperlinks: [
      {
        title: 'title title',
        summary: 'summary',
      },
    ],
    status: 'NORMAL',
  },
  // These should not appear in the related article of normal articles
  //
  '/articles/doc/blockedArticle1': {
    text: 'Lorum ipsum ipsum',
    articleReplies: [],
    normalArticleReplyCount: 1,
    references: [{ type: 'LINE' }],
    hyperlinks: [],
    status: 'BLOCKED',
  },
  '/articles/doc/blockedArticle2': {
    text: 'Lorum lorum ipsum ipsum',
    articleReplies: [],
    normalArticleReplyCount: 1,
    references: [{ type: 'LINE' }],
    hyperlinks: [],
    status: 'BLOCKED',
  },
  '/articles/doc/manyRequests': {
    text: 'Popular',
    replyRequestCount: 11,
    status: 'NORMAL',
  },
  '/articles/doc/mediaArticle': {
    text: 'Lorum ipsum', // Transcript
    attachmentHash: 'hash-for-media-article',
    status: 'NORMAL',
  },
  '/articles/doc/similarMediaArticle': {
    attachmentHash: 'hash-for-similar-media-article',
    status: 'NORMAL',
  },
  '/replies/doc/bar': {
    text: 'bar',
    reference: 'barbar',
    type: 'NOT_ARTICLE',
    hyperlinks: [
      {
        title: 'GG',
        summary: 'Lorem Ipsum',
      },
    ],
  },
  '/replies/doc/bar2': {
    text: 'bar2',
    reference: 'barbar2',
    type: 'NOT_ARTICLE',
  },
  '/replies/doc/bar5': {
    text: 'spam content',
    type: 'NOT_ARTICLE',
    userId: 'blocked-user',
    appId: 'WEBSITE',
  },
  '/replies/doc/fofo': {
    text: 'fofo',
    reference: 'barfofo',
    type: 'NOT_ARTICLE',
  },
  '/replies/doc/similar-to-bar': {
    text: 'bar bar',
    reference: 'barbar',
    type: 'NOT_ARTICLE',
    createdAt: '2015-01-01T12:10:30Z',
  },
  '/replies/doc/similar-to-bar2': {
    text: 'GG',
    reference: 'GGG',
    type: 'NOT_ARTICLE',
    createdAt: '2015-01-02T12:10:30Z',
    hyperlinks: [
      {
        title: 'GG G',
        summary: 'Lorem Ipsum Ipsum',
      },
    ],
  },
  '/replyrequests/doc/articleTest1': {
    articleId: 'foo',
    userId: 'fakeUser',
    appId: 'LINE',
    reason: 'Reason foo',
    feedbacks: [{ score: 1 }, { score: -1 }],
    status: 'NORMAL',
  },
  '/replyrequests/doc/articleTest2': {
    // Legacy reply request that has no feedbacks[] nor reason.
    articleId: 'foo',
    userId: 'fakeUser',
    appId: 'LINE',
    status: 'NORMAL',
  },
  '/replyrequests/doc/spammerAds': {
    articleId: 'foo',
    userId: 'spammer',
    appId: 'RUMORS_SITE',
    status: 'BLOCKED',
    reason: 'Some spam content',
    feedbacks: [],
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
    status: 'NORMAL',
  },
  [`/articlereplyfeedbacks/doc/${getArticleReplyFeedbackId({
    articleId: 'foo',
    replyId: 'bar',
    userId: 'spammer',
    appId: 'test-app',
  })}`]: {
    articleId: 'foo',
    replyId: 'bar',
    userId: 'test-user',
    appId: 'test-app',
    comment: 'Spam ad content here',
    score: 1,
    status: 'BLOCKED',
  },
  '/categories/doc/c1': {
    title: '性少數與愛滋病',
    description: '對同性婚姻的恐懼、愛滋病的誤解與的防疫相關釋疑。',
  },
  '/categories/doc/c2': {
    title: '免費訊息詐騙',
    description: '詐騙貼圖、假行銷手法。',
  },
  '/users/doc/blocked-user': {
    appId: 'WEBSITE',
    blockedReason: 'https://announcement.url',
  },

  ...Array.from(new Array(11)).reduce((mockMap, _, i) => {
    mockMap[`/replyrequests/doc/popular${i}`] = {
      articleId: 'manyRequests',
      userId: `fakeUser ${i}`,
      appId: 'LINE',
      reason: `Reason ${i}`,
      status: 'NORMAL',
    };
    return mockMap;
  }, {}),

  '/airesponses/doc/aireply-for-foo': {
    docId: 'foo',
    type: 'AI_REPLY',
    status: 'SUCCESS',
    text: 'AI says we should be careful of this message',
  },
  // LOADING ai replies are not shown
  '/airesponses/doc/aireply-for-foo-loading': {
    docId: 'foo',
    type: 'AI_REPLY',
    status: 'LOADING',
  },

  '/airesponses/doc/transcript-for-mediaArticle': {
    docId: 'hash-for-media-article',
    type: 'TRANSCRIPT',
    status: 'SUCCESS',
    text: 'Lorum ipsum',
  },
};
