/* MediaManager related integration tests */
import path from 'path';
import http from 'http';
import handler from 'serve-handler';

import gql from 'util/GraphQL';
import delayForMs from 'util/delayForMs';

if (process.env.GCS_CREDENTIALS && process.env.GCS_BUCKET_NAME) {
  // File server serving test input file in ./fixtures
  //
  const server = http.createServer((req, res) =>
    handler(req, res, {
      public: path.join(__dirname, '../__fixtures__/media-integration'),
    })
  );
  server.on('error', console.error);
  let serverUrl = '';

  beforeAll(async () => {
    // Start up file server
    serverUrl = await new Promise((resolve, reject) => {
      server.listen(() => {
        const addr = server.address();
        if (typeof addr === 'string' || addr === null) {
          return reject(`server.listen return wrong address: ${addr}`);
        }
        resolve(`http://localhost:${addr.port}`);
      });
    });

    console.info(`[Media Integration] file server listening at ${serverUrl}`);
  });
  afterAll(async () => {
    // File server teardown
    await new Promise(resolve => server.close(resolve));
    console.info(`[Media Integration] file server closed.`);
  });

  it('creates media article and can get signed URL', async () => {
    // Simulates user login
    const context = {
      user: { id: 'foo', appId: 'WEBSITE' },
    };

    const createMediaArticleResult = await gql`
      mutation($mediaUrl: String!) {
        CreateMediaArticle(
          mediaUrl: $mediaUrl
          articleType: IMAGE
          reference: { type: LINE }
        ) {
          id
        }
      }
    `(
      {
        mediaUrl: `${serverUrl}/small.jpg`,
      },
      context
    );

    expect(createMediaArticleResult.errors).toBeUndefined();
    const articleId = createMediaArticleResult.data.CreateMediaArticle.id;

    await delayForMs(1000); // Wait until upload complete

    const getArticleResult = await gql`
      query($articleId: String!) {
        GetArticle(id: $articleId) {
          attachmentHash
          originalUrl: attachmentUrl(variant: ORIGINAL)
          previewUrl: attachmentUrl(variant: PREVIEW)
          thumbnailUrl: attachmentUrl(variant: THUMBNAIL)
        }
      }
    `({ articleId }, context);

    expect(getArticleResult.errors).toBeUndefined();
    console.log('getArticleResult', getArticleResult);
  });
}