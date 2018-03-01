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
        replyId: 'bar3',
        createdAt: '2015-01-01T12:10:30Z',
        updatedAt: '2015-01-02T12:10:30Z',
        status: 'DELETED',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
      },
    ],
    normalArticleReplyCount: 1,
    references: [{ type: 'LINE' }],
    replyRequestCount: 1,
  },
  '/articles/doc/foo2': {
    text: 'Lorum ipsum Lorum ipsum',
    articleReplies: [
      {
        replyId: 'bar2',
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
};
