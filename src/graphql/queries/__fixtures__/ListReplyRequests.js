export default {
  '/replyrequests/doc/replyrequests1': {
    articleId: 'article1',
    userId: 'user1',
    appId: 'WEBSITE',
    reason: 'blahblah',
    feedbacks: [
      {
        userId: 'user2',
        appId: 'WEBSITE',
        score: 1,
      },
      {
        userId: 'user3',
        appId: 'WEBSITE',
        score: -1,
      },
      {
        userId: 'user4',
        appId: 'WEBSITE',
        score: 1,
      },
      {
        userId: 'user5',
        appId: 'WEBSITE',
        score: 1,
      },
    ],
    status: 'NORMAL',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  },
  '/replyrequests/doc/replyrequests2': {
    articleId: 'article2',
    userId: 'user1',
    appId: 'WEBSITE',
    reason: 'blahblah',
    feedbacks: [
      {
        userId: 'user2',
        appId: 'WEBSITE',
        score: -1,
      },
      {
        userId: 'user3',
        appId: 'WEBSITE',
        score: -1,
      },
      {
        userId: 'user4',
        appId: 'WEBSITE',
        score: -1,
      },
      {
        userId: 'user5',
        appId: 'WEBSITE',
        score: -1,
      },
    ],
    status: 'NORMAL',
    createdAt: '2020-02-03T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  },
  '/replyrequests/doc/replyrequests3': {
    articleId: 'article1',
    userId: 'user1',
    appId: 'WEBSITE',
    reason: 'blahblah',
    feedbacks: [
      {
        userId: 'user2',
        appId: 'WEBSITE',
        score: 1,
      },
    ],
    status: 'NORMAL',
    createdAt: '2020-02-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  },
  '/replyrequests/doc/replyrequests4': {
    articleId: 'article2',
    userId: 'user2',
    appId: 'WEBSITE',
    reason: 'blahblah',
    feedbacks: [
      {
        userId: 'user1',
        appId: 'WEBSITE',
        score: -1,
      },
    ],
    status: 'NORMAL',
    createdAt: '2020-02-02T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  },
  '/users/doc/user1': {
    appId: 'WEBSITE',
    name: 'user 1',
  },
  '/users/doc/user2': {
    appId: 'WEBSITE',
    name: 'user 2',
  },
};
