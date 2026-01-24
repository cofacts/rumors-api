import { Storage } from '@google-cloud/storage';
import path from 'path';
import langfuse from 'util/langfuse';
import client from 'util/client';
import { uploadMedia } from 'graphql/util';
import genAITranscript from '../genAITranscript';

// Integration tests - uses real Google APIs
if (process.env.GCS_BUCKET_NAME) {
  describe('genAITranscript integration', () => {
    const storage = new Storage();
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    const FIXTURES = ['ocr-test.jpg', 'audio-test.m4a'];
    let FIXTURES_URLS = {};
    const createdArticleIds = [];
    const createdAiResponseIds = [];
    const uploadedGcsPaths = [];

    // Upload fixtures to GCS
    beforeAll(async () => {
      FIXTURES_URLS = (
        await Promise.all(
          FIXTURES.map(async (filename) =>
            bucket
              .upload(
                path.join(
                  __dirname,
                  '../../../../graphql/__fixtures__/util/',
                  filename
                ),
                {
                  destination: `genai-transcript-test/${filename}`,
                }
              )
              .then(([file]) => {
                uploadedGcsPaths.push(file.name);
                return file.publicUrl();
              })
          )
        )
      ).reduce((map, publicUrl, i) => {
        map[FIXTURES[i]] = publicUrl;
        return map;
      }, {});
    }, 40 * 1000);

    afterAll(async () => {
      // Cleanup all created articles, their ydocs and airesponses
      for (const id of createdArticleIds) {
        await client
          .delete({ index: 'articles', type: 'doc', id })
          .catch(() => {});
        await client
          .delete({ index: 'ydocs', type: 'doc', id })
          .catch(() => {});
      }

      for (const id of createdAiResponseIds) {
        await client
          .delete({ index: 'airesponses', type: 'doc', id })
          .catch(() => {});
      }

      // Cleanup GCS files
      await Promise.all(
        uploadedGcsPaths.map((path) =>
          bucket
            .file(path)
            .delete()
            .catch(() => {})
        )
      );

      await langfuse.shutdownAsync();
    });

    it('skips empty articleIds', async () => {
      const result = await genAITranscript({ articleIds: [] });
      expect(result.count).toBe(0);
    });

    it('handles article not found', async () => {
      const result = await genAITranscript({ articleIds: ['not-exists'] });
      expect(result.results[0]).toEqual({
        id: 'not-exists',
        status: 'SKIPPED',
        reason: 'Article not found',
      });
    });

    it('processes image with real OCR', async () => {
      // 1. Upload image to GCS and get mediaEntry
      const mediaEntry = await new Promise((resolve) => {
        let isUploadStopped = false;
        let mediaEntryToResolve = undefined;
        uploadMedia({
          mediaUrl: FIXTURES_URLS['ocr-test.jpg'],
          articleType: 'IMAGE',
          onUploadStop: () => {
            isUploadStopped = true;
            if (mediaEntryToResolve) resolve(mediaEntryToResolve);
          },
        }).then((entry) => {
          if (isUploadStopped) {
            resolve(entry);
          } else {
            mediaEntryToResolve = entry;
          }
        });
      });

      // 2. Create article in Elasticsearch
      const articleId = 'test-image-ocr-integration';
      createdArticleIds.push(articleId);
      await client.index({
        index: 'articles',
        type: 'doc',
        id: articleId,
        body: {
          attachmentHash: mediaEntry.id,
          text: '',
          articleType: 'IMAGE',
          createdAt: new Date(),
          updatedAt: new Date(),
          references: [],
          hyperlinks: [],
          appId: 'RUMORS_ADMIN',
          userId: 'admin-script',
        },
      });

      // Wait for indexing
      await client.indices.refresh({ index: 'articles' });

      // 3. Execute genAITranscript
      const result = await genAITranscript({ articleIds: [articleId] });

      // Wait for indexing
      await client.indices.refresh({ index: 'airesponses' });

      // Track created aiResponseId for cleanup
      const {
        body: { hits },
      } = await client.search({
        index: 'airesponses',
        type: 'doc',
        body: { query: { term: { docId: mediaEntry.id } } },
      });
      hits.hits.forEach((hit) => createdAiResponseIds.push(hit._id));

      // 4. Verify results
      expect(result.count).toBe(1);
      expect(result.results[0]).toEqual({
        id: articleId,
        status: 'SUCCESS',
      });

      // 5. Verify article text was updated
      const {
        body: { _source: updatedArticle },
      } = await client.get({
        index: 'articles',
        type: 'doc',
        id: articleId,
      });

      expect(updatedArticle.text).toMatch(/排/);
      expect(updatedArticle.text).toMatch(/德國醫學博士/);
    }, 60000);

    it('processes audio with real transcript', async () => {
      // 1. Upload audio to GCS and get mediaEntry
      const mediaEntry = await new Promise((resolve) => {
        let isUploadStopped = false;
        let mediaEntryToResolve = undefined;
        uploadMedia({
          mediaUrl: FIXTURES_URLS['audio-test.m4a'],
          articleType: 'AUDIO',
          onUploadStop: () => {
            isUploadStopped = true;
            if (mediaEntryToResolve) resolve(mediaEntryToResolve);
          },
        }).then((entry) => {
          if (isUploadStopped) {
            resolve(entry);
          } else {
            mediaEntryToResolve = entry;
          }
        });
      });

      // 2. Create article in Elasticsearch
      const articleId = 'test-audio-transcript-integration';
      createdArticleIds.push(articleId);
      await client.index({
        index: 'articles',
        type: 'doc',
        id: articleId,
        body: {
          attachmentHash: mediaEntry.id,
          text: '',
          articleType: 'AUDIO',
          createdAt: new Date(),
          updatedAt: new Date(),
          references: [],
          hyperlinks: [],
          appId: 'RUMORS_ADMIN',
          userId: 'admin-script',
        },
      });

      // Wait for indexing
      await client.indices.refresh({ index: 'articles' });

      // 3. Execute genAITranscript
      const result = await genAITranscript({ articleIds: [articleId] });

      // Wait for indexing
      await client.indices.refresh({ index: 'airesponses' });

      // Track created aiResponseId for cleanup
      const {
        body: { hits },
      } = await client.search({
        index: 'airesponses',
        type: 'doc',
        body: { query: { term: { docId: mediaEntry.id } } },
      });
      hits.hits.forEach((hit) => createdAiResponseIds.push(hit._id));

      // 4. Verify results
      expect(result.count).toBe(1);
      expect(result.results[0]).toEqual({
        id: articleId,
        status: 'SUCCESS',
      });

      // 5. Verify article text was updated
      const {
        body: { _source: updatedArticle },
      } = await client.get({
        index: 'articles',
        type: 'doc',
        id: articleId,
      });

      expect(updatedArticle.text).toMatch(
        /幫我捧場一組我兼職|帮我捧场一组我兼职/
      );
      expect(updatedArticle.text).toMatch(/葉黃[素樹]軟糖|叶黄[素树]软糖/);
    }, 120000);
  });
}
