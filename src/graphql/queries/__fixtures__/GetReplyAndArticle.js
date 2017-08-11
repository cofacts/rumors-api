export default {
  '/articles/basic/foo': {
    text: 'Lorum ipsum',
    replyConnectionIds: ['foo-bar'],
    references: [{ type: 'LINE' }],
    replyRequestIds: ['articleTest1'],
  },
  '/articles/basic/foo2': {
    text: 'Lorum ipsum Lorum ipsum',
    replyConnectionIds: ['foo2-bar2'],
    references: [{ type: 'LINE' }],
  },
  '/articles/basic/foo3': {
    text: 'Lorum ipsum Lorum ipsum Lorum ipsum',
    replyConnectionIds: ['foo3-fofo', 'foo3-bar2'],
    references: [{ type: 'LINE' }],
  },
  '/replyconnections/basic/foo-bar': {
    replyId: 'bar',
    createdAt: '2015-01-01T12:10:30Z',
    updatedAt: '2015-01-02T12:10:30Z',
  },
  '/replyconnections/basic/foo2-bar2': {
    replyId: 'bar2',
  },
  '/replyconnections/basic/foo3-fofo': {
    replyId: 'fofo',
    status: 'NORMAL',
  },
  '/replyconnections/basic/foo3-bar2': {
    replyId: 'bar2',
    status: 'DELETED',
  },
  '/replies/basic/bar': {
    versions: [{ text: 'bar', reference: 'barbar', type: 'NOT_ARTICLE' }],
  },
  '/replyrequests/basic/articleTest1': {
    userId: 'fakeUser',
    from: 'LINE',
  },
};
