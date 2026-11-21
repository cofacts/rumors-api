/** Fixed "now" for the tests; far in the future so no other fixture falls in the window */
export const NOW = new Date('2031-03-01T00:00:00Z');

const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3600_000).toISOString();

export default {
  // In the default window (360h–168h ago)
  '/articles/doc/archiveMissingUrls-a1': {
    userId: 'user1',
    appId: 'app1',
    text: 'See https://has-snapshot.example.com/a and https://missing.example.com/b?fbclid=abc',
    createdAt: hoursAgo(200),
  },
  '/replies/doc/archiveMissingUrls-r1': {
    userId: 'user1',
    appId: 'app1',
    type: 'RUMOR',
    // Same URL as in a1 (after fbclid removal), but created earlier
    text: 'Same as https://missing.example.com/b',
    reference: 'https://reference.example.com/c',
    createdAt: hoursAgo(220),
  },
  '/replies/doc/archiveMissingUrls-r2': {
    userId: 'user1',
    appId: 'app1',
    type: 'NOT_ARTICLE',
    text: 'No URL here, and no reference',
    createdAt: hoursAgo(250),
  },
  '/articles/doc/archiveMissingUrls-a2': {
    userId: 'user1',
    appId: 'app1',
    text: 'CDX fails for https://cdx-error.example.com/d',
    createdAt: hoursAgo(300),
  },

  // Outside the window
  '/articles/doc/archiveMissingUrls-too-new': {
    userId: 'user1',
    appId: 'app1',
    text: 'https://too-new.example.com',
    createdAt: hoursAgo(100),
  },
  '/articles/doc/archiveMissingUrls-too-old': {
    userId: 'user1',
    appId: 'app1',
    text: 'https://too-old.example.com',
    createdAt: hoursAgo(400),
  },
};

/** Extra docs so that more than 5 URLs are looked up */
export const manyUrlsFixtures = {
  '/articles/doc/archiveMissingUrls-many': {
    userId: 'user1',
    appId: 'app1',
    text: 'https://many1.example.com https://many2.example.com https://many3.example.com',
    createdAt: hoursAgo(260),
  },
};

/** 10 more URLs in the window, for the "nothing has a snapshot" guard */
export const lagFixtures = {
  '/articles/doc/archiveMissingUrls-lag': {
    userId: 'user1',
    appId: 'app1',
    text: Array.from(
      { length: 10 },
      (_, i) => `https://lag${i}.example.com/page`
    ).join(' '),
    createdAt: hoursAgo(280),
  },
};
