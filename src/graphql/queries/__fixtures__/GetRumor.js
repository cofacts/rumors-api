export default [
  { index: { _index: 'rumors', _type: 'basic', _id: 'foo' } },
  { text: 'foofoo', answerIds: ['bar'] },
  { index: { _index: 'answers', _type: 'basic', _id: 'bar' } },
  { versions: [{ text: 'bar', reference: 'barbar' }] },
];
