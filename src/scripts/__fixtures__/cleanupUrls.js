import { FLAG_FIELD } from '../cleanupUrls';

export default {
  '/articles/doc/a1': {
    userId: 'user1',
    appId: 'app1',
    hyperlinks: [{ url: 'foo.com' }],
  },
  '/replies/doc/r1': {
    userId: 'user1',
    appId: 'app1',
    hyperlinks: [{ url: 'bar.com' }],
  },
  '/urls/doc/url-to-delete': {
    url: 'm.not-exist.com',
    canonical: 'not-exist.com',
    fetchedAt: '2018-01-01T00:00:00Z', // more than 1 day ago
  },
  '/urls/doc/new-url': {
    url: 'm.not-exist-yet.com',
    canonical: 'not-exist-yet.com',
    fetchedAt: new Date().toISOString(), // most recent
  },
  '/urls/doc/url-processed': {
    url: 'processed.com',
    canonical: 'processed.com',
    [FLAG_FIELD]: true,
    fetchedAt: '2018-01-01T00:00:00Z', // more than 1 day ago
  },
  '/urls/doc/url-foo': {
    url: 'foo.com',
    canonical: 'foo2.com',
    fetchedAt: '2018-01-01T00:00:00Z', // more than 1 day ago
  },
  '/urls/doc/curl-foo': {
    url: 'foo2.com',
    canonical: 'foo.com',
    fetchedAt: '2018-01-01T00:00:00Z', // more than 1 day ago
  },
  '/urls/doc/url-bar': {
    url: 'bar.com',
    canonical: 'bar2.com',
    fetchedAt: '2018-01-01T00:00:00Z', // more than 1 day ago
  },
  '/urls/doc/curl-bar': {
    url: 'bar2.com',
    canonical: 'bar.com',
    fetchedAt: '2018-01-01T00:00:00Z', // more than 1 day ago
  },
};
