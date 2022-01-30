export default {
  '/users/doc/user-to-block': {
    name: 'Naughty spammer',
  },

  '/users/doc/already-blocked': {
    name: 'Blocked spammer',
    blockedReason: 'Some announcement',
  },

  '/replyrequests/doc/already-blocked': {
    articleId: 'some-article',
    userId: 'user-to-block',
    status: 'BLOCKED',
    createdAt: '2021-11-11T00:00:00.000Z',
  },

  // Article with already-blocked contents
  '/articles/doc/some-article': {
    replyRequestCount: 1,
    normalArticleReplyCount: 0,
    lastRequestedAt: '2021-01-01T00:00.000Z',
    articleReplies: [
      {
        replyId: 'some-reply',
        userId: 'already-blocked',
        appId: 'APP_ID',
        status: 'BLOCKED',
        updatedAt: '2021-11-11T00:00:00.000Z',
      },
    ],
  },

  '/replyrequests/doc/replyrequest-to-block': {
    articleId: 'modified-article',
    userId: 'user-to-block',
    status: 'NORMAL',
    createdAt: '2021-11-11T11:00:00.000Z',
  },

  '/replyrequests/doc/valid-reply-request': {
    articleId: 'modified-article',
    userId: 'valid-user',
    status: 'NORMAL',
    createdAt: '2021-10-10T00:00:00.000Z',
  },

  // Article with normal contents to block
  '/articles/doc/modified-article': {
    replyRequestCount: 2,
    normalArticleReplyCount: 2,
    lastRequestedAt: '2021-01-01T00:00:01.000Z',

    articleReplies: [
      {
        replyId: 'valid-reply',
        userId: 'valid-user',
        appId: 'APP_ID',
        status: 'NORMAL',
        updatedAt: '2021-11-11T00:00:00.000Z',
      },
      {
        replyId: 'some-reply',
        userId: 'user-to-block',
        appId: 'APP_ID',
        status: 'NORMAL',
        updatedAt: '2021-11-11T00:00:00.000Z',
      },
    ],
  },
};
