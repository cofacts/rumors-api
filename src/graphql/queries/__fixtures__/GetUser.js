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
  '/articles/doc/some-doc': {
    articleReplies: [
      { status: 'NORMAL', appId: 'WEBSITE', userId: 'current-user' },
      { status: 'NORMAL', appId: 'WEBSITE', userId: 'current-user' },
    ],
  },
  '/articles/doc/another-doc': {
    articleReplies: [
      { status: 'NORMAL', appId: 'WEBSITE', userId: 'current-user' },
    ],
  },
  '/articles/doc/not-this-doc': {
    articleReplies: [
      { status: 'DELETED', appId: 'WEBSITE', userId: 'current-user' },
    ],
  },
};
