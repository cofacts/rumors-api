export default {
  '/users/doc/test-user': {
    slug: 'abc123',
    name: 'test user',
    email: 'secret@secret.com',
    avatarType: 'Facebook',
    facebookId: 123456,
  },
  '/users/doc/current-user': {
    slug: 'def456',
    name: 'current user',
    email: 'hi@me.com',
    avatarType: 'Github',
    githubId: 654321,
  },
  '/users/doc/test-email-user': {
    slug: 'ghi789',
    name: 'test email user',
    email: 'cofacts.tw@gmail.com',
  },
  '/users/doc/another-user': {
    name: 'open peeps user',
    email: 'user@example.com',
    avatarType: 'OpenPeeps',
    avatarData: '{"key":"value"}',
  },
  '/articles/doc/some-doc': {
    articleReplies: [
      // replies to the same doc only count as 1 for repliedArticleCount
      { status: 'NORMAL', appId: 'WEBSITE', userId: 'current-user' },
      { status: 'NORMAL', appId: 'WEBSITE', userId: 'current-user' },
      { status: 'NORMAL', appId: 'WEBSITE', userId: 'other-user' },
    ],
  },
  '/articles/doc/another-doc': {
    articleReplies: [
      { status: 'NORMAL', appId: 'WEBSITE', userId: 'current-user' },
      { status: 'NORMAL', appId: 'WEBSITE', userId: 'other-user' },
    ],
  },
  '/articles/doc/not-this-doc': {
    articleReplies: [
      { status: 'DELETED', appId: 'WEBSITE', userId: 'current-user' },
      { status: 'NORMAL', appId: 'WEBSITE', userId: 'other-user' },
    ],
  },
  '/articlereplyfeedbacks/doc/f1': {
    userId: 'current-user',
    appId: 'app1',
    articleId: 'a1',
    replyId: 'r1',
    score: 1,
    createdAt: '2020-03-06T00:00:00.000Z',
    updatedAt: '2020-04-06T00:00:00.000Z',
  },

  '/replyrequests/doc/replyrequest1': {
    userId: 'current-user',
    createdAt: '2020-02-01T00:00:00.000+08:00',
  },
  '/replyrequests/doc/replyrequest2': {
    userId: 'current-user',
    createdAt: '2020-02-02T00:00:00.000+08:00',
  },

  '/replies/doc/reply1': {
    userId: 'current-user',
    createdAt: '2020-02-02T00:00:00.000+08:00',
  },
  '/replies/doc/reply2': {
    userId: 'current-user',
    createdAt: '2020-02-04T00:00:00.000+08:00',
  },

  '/articlereplyfeedbacks/doc/f2': {
    userId: 'current-user',
    createdAt: '2020-02-03T00:00:00.000+08:00',
  },
  '/articlereplyfeedbacks/doc/f3': {
    userId: 'current-user',
    createdAt: '2020-02-01T00:00:00.000+08:00',
  },
};
