export default {
  '/users/doc/test-user': {
    id: 'test-user',
    name: 'test user',
    email: 'secret@secret.com',
  },
  '/users/doc/current-user': {
    id: 'current-user',
    name: 'current user',
    email: 'hi@me.com',
  },
  '/users/doc/test-email-user': {
    id: 'test-email-user',
    name: 'test email user',
    email: 'cofacts.tw@gmail.com',
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
};
