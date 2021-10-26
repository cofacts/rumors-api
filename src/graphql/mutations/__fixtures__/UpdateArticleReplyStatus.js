export default {
  '/articles/doc/others': {
    articleReplies: [
      {
        replyId: 'others',
        status: 'NORMAL',
        userId: 'not you',
        appId: 'not this app',
      },
    ],
  },
  '/articles/doc/normal': {
    articleReplies: [
      {
        replyId: 'reply',
        userId: 'foo',
        appId: 'test',
        status: 'NORMAL',
        updatedAt: 0,
      },
    ],
  },
  '/articles/doc/deleted': {
    articleReplies: [
      {
        replyId: 'reply',
        userId: 'foo',
        appId: 'test',
        status: 'DELETED',
        updatedAt: 0,
      },
    ],
  },
  '/articles/doc/blocked': {
    articleReplies: [
      {
        replyId: 'reply',
        userId: 'iAmBlocked',
        appId: 'test',
        status: 'DELETED',
        updatedAt: 0,
      },
    ],
  },
};
