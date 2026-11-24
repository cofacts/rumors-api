jest.mock('../grpc');

import MockDate from 'mockdate';

import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/scrapUrls';
import scrapUrls, { removeFBCLIDIfExist } from '../scrapUrls';
import DataLoaders from 'graphql/dataLoaders';
import client from 'util/client';
import resolveUrl from '../grpc';

describe('scrapping & storage', () => {
  afterAll(async () => {
    await client.deleteByQuery({
      index: 'urls',
      query: {
        match_all: {},
      },
    });
  });

  it('scraps from Internet and handles error', async () => {
    MockDate.set(1485593157011);

    resolveUrl.__addMockResponse([
      // Mimics the out-of-order nature of gRPC
      {
        url: 'http://example.com/not-found',
        canonical: 'http://example.com/not-found',
        title: '',
        summary: 'Not Found',
        topImageUrl: '',
        html: '<html><head></head><body>Not Found</body></html>',
        status: 404,
      },
      {
        url: 'http://example.com/index.html',
        canonical: 'http://example.com/index.html',
        title: 'Some title',
        summary: 'Some text as summary',
        topImageUrl: '',
        html: '<html><head></head><body>Hello world</body></html>',
        status: 200,
      },
    ]);

    const [foundResult, notFoundResult] = await scrapUrls(
      `
          This should work: http://example.com/index.html
          This should be not found: http://example.com/not-found
          This should not match: http://malformedUrl:100000
        `,
      { client }
    );
    MockDate.reset();

    expect(resolveUrl.__getRequests()).toMatchSnapshot('GraphQL requests');
    resolveUrl.__reset();

    expect(foundResult).toMatchSnapshot('foundResult');
    expect(notFoundResult).toMatchSnapshot('notFoundResult');

    // scrapUrls() don't wait until refresh, thus refresh on our own
    await client.indices.refresh({ index: 'urls' });

    const {
      hits: { hits: urls },
    } = await client.search({
      index: 'urls',
      query: {
        match_all: {},
      },
    });

    expect(urls.map(({ _source }) => _source)).toMatchSnapshot(
      'Docs stored to urls index'
    );
  }, 30000);

  it('clears login wall title and summary before returning and storing', async () => {
    const fbUrl = 'https://www.facebook.com/somepage/posts/123';
    resolveUrl.__addMockResponse([
      {
        url: fbUrl,
        canonical: fbUrl,
        title: '登入 Facebook',
        summary: '登入 Facebook，與好友、家人和你認識的人分享和保持聯繫。',
        topImageUrl: '',
        html: '<html></html>',
        status: 200,
      },
    ]);

    const [result] = await scrapUrls(fbUrl, { client });
    resolveUrl.__reset();
    expect(result.title).toBe('');
    expect(result.summary).toBe('');

    await client.indices.refresh({ index: 'urls' });
    const {
      hits: { hits },
    } = await client.search({
      index: 'urls',
      query: { term: { url: fbUrl } },
    });
    expect(
      hits.map(({ _source: { title, summary } }) => ({ title, summary }))
    ).toEqual([{ title: '', summary: '' }]);
  });
});

describe('caching', () => {
  beforeAll(() => loadFixtures(fixtures));
  afterAll(() => unloadFixtures(fixtures));

  it('fetches latest fetch from urls', async () => {
    const loaders = new DataLoaders();
    expect(
      await scrapUrls(
        `
          http://example.com/article/1111-aaaaa-bbb-ccc // full URL
          http://example.com/article/1111 // canonical URL
        `,
        {
          cacheLoader: loaders.urlLoader,
          noFetch: true,
        }
      )
    ).toMatchSnapshot();
  });
});

describe('remove fbclid', () => {
  it('removeFBCLID', async () => {
    const url =
      'https://www.youtube.com/playlist?list=PLdwQWxpS513DrHuUQ356zK6pLoJ8NcVP2&fbclid=IwAR2Yiso_SArcTCmCEKKnUuIpTS-y_fyPbl_X19OG0eaAhVxdJxGh8AMicwE';

    expect(removeFBCLIDIfExist([url])).toEqual([
      'https://www.youtube.com/playlist?list=PLdwQWxpS513DrHuUQ356zK6pLoJ8NcVP2',
    ]);
  });
  it('keep origin url if fbclid is not existed', async () => {
    const url =
      'https://www.youtube.com/playlist?list=PLdwQWxpS513DrHuUQ356zK6pLoJ8NcVP2';
    expect(removeFBCLIDIfExist([url])).toEqual([
      'https://www.youtube.com/playlist?list=PLdwQWxpS513DrHuUQ356zK6pLoJ8NcVP2',
    ]);
  });
});
