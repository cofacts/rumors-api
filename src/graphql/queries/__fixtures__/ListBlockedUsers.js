export default {
  '/users/doc/normalUser': {
    name: 'normal user',
    createdAt: '2017-01-01T00:00:00.000Z',
  },

  '/users/doc/unblockedUser': {
    name: 'unblocked user',
    createdAt: '2017-01-06T00:00:00.000Z',
    blockedReason: null,
  },

  '/users/doc/blockedUser1': {
    name: 'Blocked spammer 1',
    blockedReason: 'Some announcement',
    createdAt: '2017-01-05T00:00:00.000Z',
  },

  '/users/doc/blockedUser2': {
    name: 'Blocked spammer 2',
    blockedReason: 'Some announcement',
    createdAt: '2017-01-04T00:00:00.000Z',
  },
  '/users/doc/blockedUser3': {
    name: 'Blocked spammer 3',
    blockedReason: 'Some announcement',
    createdAt: '2017-01-03T00:00:00.000Z',
  },
};
