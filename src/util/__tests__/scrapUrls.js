import Koa from 'koa';
import path from 'path';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/scrapUrls';
import koaStatic from 'koa-static';
import scrapUrls from '../scrapUrls';
import DataLoaders from 'graphql/dataLoaders';
const PORT = 57319;

describe('scrapping', () => {
  let server;
  beforeAll(
    async () =>
      new Promise(resolve => {
        const app = new Koa();
        app.use(koaStatic(path.join(__dirname, '../__fixtures__/server/')));
        server = app.listen(PORT, resolve);
      })
  );

  afterAll(() => server.close());

  it('scraps from Internet and handles error', async () => {
    const [
      { html, ...foundResult },
      notFoundResult,
      invalidUrlResult,
    ] = await scrapUrls([
      `http://localhost:${PORT}/index.html`,
      `http://localhost:${PORT}/not-found`,
      'this is invalid URL',
    ]);

    expect(html.slice(0, 100)).toMatchSnapshot('foundResult html'); // Too long, just sample first 100 chars
    expect(foundResult).toMatchSnapshot('foundResult');
    expect(notFoundResult).toMatchSnapshot('notFoundResult');
    expect(invalidUrlResult).toBeNull();
  });
});

describe('caching', () => {
  beforeAll(() => loadFixtures(fixtures));
  afterAll(() => unloadFixtures(fixtures));

  it('fetches latest fetch from urls', async () => {
    const loaders = new DataLoaders();
    expect(
      await scrapUrls(
        [
          'http://example.com/article/1111-aaaaa-bbb-ccc', // full URL
          'http://example.com/article/1111', // canonical URL
        ],
        {
          cacheLoader: loaders.urlLoader,
          noFetch: true,
        }
      )
    ).toMatchSnapshot();
  });
});
