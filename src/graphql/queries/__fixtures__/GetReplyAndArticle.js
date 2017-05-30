export default {
  '/data/articles/foo': {
    text: 'Lorum ipsum',
    replyConnectionIds: ['foo-bar'],
    references: [{ type: 'LINE' }],
    replyRequestIds: ['articleTest1'],
  },
  '/data/articles/foo2': {
    text: 'Lorum ipsum Lorum ipsum',
    replyConnectionIds: ['foo2-bar2'],
    references: [{ type: 'LINE' }],
  },
  '/data/articles/foo3': {
    text: 'Lorum ipsum Lorum ipsum Lorum ipsum',
    replyConnectionIds: ['foo3-fofo', 'foo3-bar2'],
    references: [{ type: 'LINE' }],
  },
  '/data/replyconnections/foo-bar': {
    replyId: 'bar',
  },
  '/data/replyconnections/foo2-bar2': {
    replyId: 'bar2',
  },
  '/data/replyconnections/foo3-fofo': {
    replyId: 'fofo',
  },
  '/data/replyconnections/foo3-bar2': {
    replyId: 'bar2',
  },
  '/replies/basic/bar': {
    versions: [{ text: 'bar', reference: 'barbar', type: 'NOT_ARTICLE' }],
  },
  '/data/replyrequests/articleTest1': {
    userId: 'fakeUser',
    from: 'LINE',
  },
};
