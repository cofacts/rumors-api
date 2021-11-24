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

  '/articles/doc/some-article': {
    replyRequestCount: 1,
    lastRequestedAt: '2021-01-01T00:00.000Z',
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

  '/articles/doc/modified-article': {
    replyRequestCount: 2,
    lastRequestedAt: '2021-01-01T00:00:01.000Z',
  },
};
