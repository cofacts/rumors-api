export default {
  '/articles/basic/foo': {
    text: 'foofoo', replyIds: ['bar'],
  },
  '/replies/basic/bar': {
    versions: [{ text: 'bar', reference: 'barbar', type: 'NOT_ARTICLE' }],
  },
};
