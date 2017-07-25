export default {
  '/replies/basic/moreLikeThis1': {
    versions: [{ text: 'foo foo', reference: 'bar bar', type: 'NOT_ARTICLE' }],
    createdAt: 3,
  },
  '/replies/basic/moreLikeThis2': {
    versions: [
      { text: 'foo foo foo', reference: 'barbar', type: 'NOT_ARTICLE' },
    ],
    createdAt: 2,
  },
  '/replies/basic/userFoo': {
    versions: [
      {
        text: 'bar',
        reference: 'barbar',
        type: 'NOT_ARTICLE',
        userId: 'foo',
        from: 'test',
      },
    ],
    createdAt: 4,
  },
  '/replies/basic/rumor': {
    versions: [{ text: 'bar', reference: 'barbar', type: 'RUMOR' }],
    createdAt: 1,
  },
};
