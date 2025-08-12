jest.mock('../geminiUrlScraper');

import MockDate from 'mockdate';

import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/scrapUrls';
import scrapUrls, { removeFBCLIDIfExist } from '../scrapUrls';
import DataLoaders from 'graphql/dataLoaders';
import client from 'util/client';
import scrapeUrlsWithGemini from '../geminiUrlScraper';

describe('scrapping & storage', () => {
  afterAll(async () => {
    await client.deleteByQuery({
      index: 'urls',
      body: {
        query: {
          match_all: {},
        },
      },
    });
  });

  it('scraps from Internet and handles error', async () => {
    MockDate.set(1485593157011);

    scrapeUrlsWithGemini.mockResolvedValue([
      {
        url: 'http://example.com/index.html',
        canonical: 'http://example.com/index.html',
        title: 'Some title',
        summary: 'Some text as summary',
        topImageUrl: '',
        html: '',
        status: 'SUCCESS',
      },
      {
        url: 'http://example.com/not-found',
        canonical: 'http://example.com/not-found',
        title: '',
        summary: 'Not Found',
        topImageUrl: '',
        html: '',
        status: 'ERROR',
        error: 'Not Found',
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
      body: {
        hits: { hits: urls },
      },
    } = await client.search({
      index: 'urls',
      body: {
        query: {
          match_all: {},
        },
      },
    });

    expect(urls.map(({ _source }) => _source)).toMatchSnapshot(
      'Docs stored to urls index'
    );
  }, 30000);
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
