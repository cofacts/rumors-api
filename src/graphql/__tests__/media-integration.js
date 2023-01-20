/* MediaManager related integration tests */
import path from 'path';
import http from 'http';
import handler from 'serve-handler';
import fetch from 'node-fetch';

import gql from 'util/GraphQL';
import client from 'util/client';
import delayForMs from 'util/delayForMs';
import { getReplyRequestId } from 'graphql/mutations/CreateOrUpdateReplyRequest';
import replaceMedia from 'scripts/replaceMedia';

if (process.env.GCS_CREDENTIALS && process.env.GCS_BUCKET_NAME) {
  // File server serving test input file in __fixtures__/media-integration
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

  it('blocks mismatched articleType', async () => {
    // Simulates user login
    const context = {
      user: { id: 'foo', appId: 'WEBSITE' },
    };

    const createMediaArticleResult = await gql`
      mutation($mediaUrl: String!) {
        CreateMediaArticle(
          mediaUrl: $mediaUrl
          articleType: VIDEO
          reference: { type: LINE }
        ) {
          id
        }
      }
    `(
      {
        mediaUrl: `${serverUrl}/small.jpg`, // An image, does not match VIDEO articleType
      },
      context
    );

    expect(createMediaArticleResult.errors).toMatchInlineSnapshot(`
      Array [
        [GraphQLError: Specified article type is "VIDEO", but the media file is a image.],
      ]
    `);
  });

  it(
    'creates image article and can get signed URL',
    async () => {
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
      expect(
        getArticleResult.data.GetArticle.attachmentHash
      ).toMatchInlineSnapshot(
        `"image.vDph4g.__-AD6SDgAebG8cbwifBB-Dj0yPjo8ETgAOAA4P_8_8"`
      );
      expect(typeof getArticleResult.data.GetArticle.originalUrl).toBe(
        'string'
      );

      // Test can fetch thumbnail meta data
      let resp;
      while (
        !resp ||
        resp.headers.get('Content-Type').startsWith('application/xml') // GCS returns XML for error
      ) {
        resp = await fetch(getArticleResult.data.GetArticle.thumbnailUrl);
        await delayForMs(1000); // Wait for upload to finish
      }

      expect(resp.headers.get('Content-Type')).toMatchInlineSnapshot(
        `"image/jpeg"`
      );
      expect(resp.headers.get('Content-Length')).toMatchInlineSnapshot(
        `"8214"`
      );

      await delayForMs(1000); // Wait for setMetadata operation to finish

      // Expect metadata being set
      resp = await fetch(getArticleResult.data.GetArticle.thumbnailUrl); // Fetch again for latest header
      expect(resp.headers.get('Cache-Control')).toMatchInlineSnapshot(
        `"public, max-age=31536000, immutable"`
      );

      // Cleanup
      await client.delete({
        index: 'articles',
        type: 'doc',
        id: articleId,
      });

      await client.delete({
        index: 'replyrequests',
        type: 'doc',
        id: getReplyRequestId({
          articleId,
          userId: context.user.id,
          appId: context.user.appId,
        }),
      });
    },
    15000
  );

  it(
    'can replace media for article',
    async () => {
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

      const articleId = createMediaArticleResult.data.CreateMediaArticle.id;

      const articleBeforeReplace = await gql`
        query($articleId: String!) {
          GetArticle(id: $articleId) {
            thumbnailUrl: attachmentUrl(variant: THUMBNAIL)
          }
        }
      `({ articleId }, context);

      // Wait until thumbnail is fully uploaded
      {
        let resp;
        while (
          !resp ||
          resp.headers.get('Content-Type').startsWith('application/xml') // GCS returns XML for error
        ) {
          resp = await fetch(articleBeforeReplace.data.GetArticle.thumbnailUrl);
          await delayForMs(1000); // Wait for upload to finish
        }
      }

      await replaceMedia({ articleId, url: `${serverUrl}/replaced.jpg` });

      const resp = await fetch(
        articleBeforeReplace.data.GetArticle.thumbnailUrl
      );
      expect(resp.status).toBe(404);

      const articleAfterReplace = await gql`
        query($articleId: String!) {
          GetArticle(id: $articleId) {
            attachmentHash
          }
        }
      `({ articleId }, context);

      expect(
        articleAfterReplace.data.GetArticle.attachmentHash
      ).toMatchInlineSnapshot(
        `"image.vDjh4g.__-AD6SDgAeTEcED___AA_Ej8y_Dg8EDgAOAA4P_8_8"`
      );

      // Cleanup
      await client.delete({
        index: 'articles',
        type: 'doc',
        id: articleId,
      });

      await client.delete({
        index: 'replyrequests',
        type: 'doc',
        id: getReplyRequestId({
          articleId,
          userId: context.user.id,
          appId: context.user.appId,
        }),
      });
    },
    15000
  );
}
