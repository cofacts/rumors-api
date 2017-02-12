export default {
  '/articles/basic/foo': {
    text: 'Lorum ipsum',
    replyIds: ['bar'],
    references: [{ type: 'LINE' }],
    replyRequestIds: ['articleTest1'],
  },
  '/articles/basic/foo2': {
    text: 'Lorum ipsum Lorum ipsum', replyIds: ['bar2'], references: [{ type: 'LINE' }],
  },
  '/articles/basic/foo3': {
    text: 'Lorum ipsum Lorum ipsum Lorum ipsum', replyIds: ['fofo', 'bar2'], references: [{ type: 'LINE' }],
  },
  '/replies/basic/bar': {
    versions: [{ text: 'bar', reference: 'barbar', type: 'NOT_ARTICLE' }],
  },
  '/replyrequests/basic/articleTest1': {
    userId: 'fakeUser', from: 'LINE',
  },
};
