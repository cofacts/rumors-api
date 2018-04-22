export default {
  '/urls/doc/someUrl': {
    url: 'http://example.com/article/1111-aaaaa-bbb-ccc',
    canonical: 'http://example.com/article/1111',
    title: 'Example title',
    summary: 'Extracted summary',
    fetchedAt: new Date('2017-01-01'),
  },
  '/urls/doc/someUrl-2nd-fetch': {
    url: 'http://example.com/article/1111-aaaaa-bbb-ccc',
    canonical: 'http://example.com/article/1111',
    title: 'Changed title',
    summary: 'Changed summary',
    fetchedAt: new Date('2017-02-01'),
  },
};
