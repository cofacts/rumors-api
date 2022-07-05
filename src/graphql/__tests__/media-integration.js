/* MediaManager related integration tests */
import path from 'path';
import http from 'http';
import handler from 'serve-handler';

import gql from 'util/GraphQL';

const GCS_PREFIX = `cofacts-api-integration-`;

if (process.env.GCS_CREDENTIALS && process.env.GCS_BUCKET_NAME) {
  const originalPrefix = process.env.GCS_MEDIA_FOLDER;
  // Generates the prefix for this run
  const prefix = `${GCS_PREFIX}${new Date().toISOString().replace(/:/g, '_')}/`;

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
    // Overwrite GCS_MEDIA_FOLDER env and reload modules (including util/mediaManager)
    process.env.GCS_MEDIA_FOLDER = prefix;
    jest.resetModules();

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
    // Restore rewritten env
    process.env.GCS_MEDIA_FOLDER = originalPrefix;
    jest.resetModules();

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

    const getArticleResult = await gql`
      query($id: String!) {
        GetArticle(id: $id) {
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
