export default {
  '/data/articles/foo': {
    text: 'Lorum ipsum',
    references: [{ type: 'LINE' }],
  },
  '/data/articles/foo2': {
    text: 'Lorum ipsum Lorum ipsum',
    references: [{ type: 'LINE' }],
  },
  '/data/articles/foo3': {
    text: 'Lorum ipsum Lorum ipsum Lorum ipsum',
    references: [{ type: 'LINE' }],
  },
  '/data/replyconnections/foo-bar?parent=foo': {
    replyId: 'bar',
  },
  '/data/replyconnections/foo2-bar2?parent=foo2': {
    replyId: 'bar2',
  },
  '/data/replyconnections/foo3-fofo?parent=foo3': {
    replyId: 'fofo',
  },
  '/data/replyconnections/foo3-bar2?parent=foo3': {
    replyId: 'bar2',
  },
  '/replies/basic/bar': {
    versions: [{ text: 'bar', reference: 'barbar', type: 'NOT_ARTICLE' }],
  },
  '/data/replyrequests/articleTest1?parent=foo': {
    userId: 'fakeUser',
    from: 'LINE',
  },
};
