export default {
  '/articles/doc/a1': {
    text: 'Article 1',
    articleReplies: [{ replyId: 'r1' }, { replyId: 'r2' }],
  },
  '/articles/doc/a2': {
    text: 'Article 2',
    articleReplies: [{ replyId: 'r2' }],
  },
  '/replies/doc/r1': {
    text: 'Reply 1',
  },
  '/replies/doc/r2': {
    text: 'Reply 2',
  },
  '/users/doc/user1': {
    name: 'User 1',
  },
  '/users/doc/user2': {
    name: 'User 2',
  },
  '/articlereplyfeedbacks/doc/f1': {
    userId: 'user1',
    appId: 'app1',
    articleId: 'a1',
    replyId: 'r1',
    score: 1,
    status: 'NORMAL',
    createdAt: '2020-03-06T00:00:00.000Z',
    updatedAt: '2020-04-06T00:00:00.000Z',
  },
  '/articlereplyfeedbacks/doc/f2': {
    userId: 'user1',
    appId: 'app2',
    articleId: 'a1',
    replyId: 'r2',
    score: -1,
    status: 'NORMAL',
    comment: '武漢肺炎',
    createdAt: '2020-02-06T00:00:00.000Z',
    updatedAt: '2020-05-06T00:00:00.000Z',
  },
  '/articlereplyfeedbacks/doc/f3': {
    userId: 'user2',
    appId: 'app2',
    articleId: 'a2',
    replyId: 'r2',
    score: 1,
    status: 'NORMAL',
    comment: 'Thank you for info regarding COVID19.',
    createdAt: '2020-04-06T00:00:00.000Z',
    updatedAt: '2020-06-06T00:00:00.000Z',
  },
};
