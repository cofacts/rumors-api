export default {
  '/articles/basic/foo': {
    text: 'foofoo', replyIds: ['bar'], references: [{ type: 'LINE' }],
  },
  '/replies/basic/bar': {
    versions: [{ text: 'bar', reference: 'barbar', type: 'NOT_ARTICLE' }],
  },
};
