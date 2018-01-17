export default {
  '/articles/doc/foo': {
    text: 'Lorum ipsum',
    articleReplies: [
      {
        replyId: 'bar',
        createdAt: '2015-01-01T12:10:30Z',
        updatedAt: '2015-01-02T12:10:30Z',
      },
    ],
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
    from: 'LINE',
  },
};
