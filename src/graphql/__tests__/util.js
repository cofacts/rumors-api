import { Storage } from '@google-cloud/storage';
import MockDate from 'mockdate';
import path from 'path';
import langfuse from 'util/langfuse';
import client from 'util/client';

import {
  createTranscript,
  getRangeFieldParamFromArithmeticExpression,
} from '../util';

describe('getRangeFieldParamFromArithmeticExpression', () => {
  it('processes complex range queries', () => {
    expect(
      getRangeFieldParamFromArithmeticExpression({
        GT: 3,
        LT: 4,
        LTE: 5,
        GTE: 6,
      })
    ).toMatchInlineSnapshot(`
      Object {
        "gt": 3,
        "gte": 6,
        "lt": 4,
        "lte": 5,
      }
    `);
  });
  it('processes dates', () => {
    expect(
      getRangeFieldParamFromArithmeticExpression({
        GTE: 'now-1d/d',
        LT: 'now/d',
      })
    ).toMatchInlineSnapshot(`
      Object {
        "gte": "now-1d/d",
        "lt": "now/d",
      }
    `);
  });
  it('EQ overrides all', () => {
    expect(
      getRangeFieldParamFromArithmeticExpression({
        EQ: 0, // This should override others
        GT: 3,
        LTE: 4,
      })
    ).toMatchInlineSnapshot(`
      Object {
        "gte": 0,
        "lte": 0,
      }
    `);
  });
});

if (process.env.GCS_BUCKET_NAME) {
  describe('createTranscript', () => {
    const storage = new Storage();
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    const FIXTURES = [
      'ocr-test.jpg',
      'audio-test.m4a',
      'video-subtitles-only.mp4',
      'video-complex.mp4',
    ];
    let FIXTURES_URLS = {};

    // Upload file to public GCS bucket so that APIs can access them
    beforeAll(async () => {
      FIXTURES_URLS = (
        await Promise.all(
          FIXTURES.map(async (filename) =>
            bucket
              .upload(path.join(__dirname, '../__fixtures__/util/', filename), {
                destination: `transcript-test/${filename}`,
                public: true,
              })
              .then(([file]) => file.publicUrl())
          )
        )
      ).reduce((map, publicUrl, i) => {
        map[FIXTURES[i]] = publicUrl;
        return map;
      }, {});
    }, 40 * 1000);

    afterAll(async () => {
      await langfuse.shutdownAsync();
    });

    it('creates error when file format is not supported', async () => {
      MockDate.set(1602288000000);
      const { id: aiResponseId, ...aiResponse } = await createTranscript(
        {
          id: 'foo',
          type: 'file',
        },
        'https://some-url',
        { id: 'foo', appId: 'WEBSITE' }
      );
      MockDate.reset();

      expect(aiResponse).toMatchInlineSnapshot(`
        Object {
          "appId": "WEBSITE",
          "createdAt": "2020-10-10T00:00:00.000Z",
          "docId": "foo",
          "status": "ERROR",
          "text": "Error: Type file not supported",
          "type": "TRANSCRIPT",
          "updatedAt": "2020-10-10T00:00:00.000Z",
          "userId": "foo",
        }
      `);

      // Cleanup
      await client.delete({
        index: 'airesponses',
        type: 'doc',
        id: aiResponseId,
      });
    });

    it('does OCR', async () => {
      const {
        id: aiResponseId,
        // eslint-disable-next-line no-unused-vars
        createdAt,
        // eslint-disable-next-line no-unused-vars
        updatedAt,
        text,
        ...aiResponse
      } = await createTranscript(
        {
          id: 'foo',
          type: 'image',
        },
        FIXTURES_URLS['ocr-test.jpg'],
        { id: 'user-id', appId: 'app-id' }
      );

      // Expect some keywords are identified.
      // The whole text are not always 100% identical, but these keywords should be always included.
      expect(text).toMatch(/^排/);
      expect(text).toMatch(/德國醫學博士艾倫斯特發現/);
      expect(text).toMatch(/汗也具有調節體溫的重要作用/);
      expect(aiResponse).toMatchInlineSnapshot(`
        Object {
          "appId": "app-id",
          "docId": "foo",
          "status": "SUCCESS",
          "type": "TRANSCRIPT",
          "userId": "user-id",
        }
      `);

      // Cleanup
      await client.delete({
        index: 'airesponses',
        type: 'doc',
        id: aiResponseId,
      });
    });

    it('does transcript for audio', async () => {
      const {
        id: aiResponseId,
        // eslint-disable-next-line no-unused-vars
        createdAt,
        // eslint-disable-next-line no-unused-vars
        updatedAt,
        text,
        usage,
        ...aiResponse
      } = await createTranscript(
        {
          id: 'direct-sales',
          type: 'audio',
        },
        FIXTURES_URLS['audio-test.m4a'],
        { id: 'user-id', appId: 'app-id' }
      );

      expect(aiResponse).toMatchInlineSnapshot(`
        Object {
          "appId": "app-id",
          "docId": "direct-sales",
          "status": "SUCCESS",
          "type": "TRANSCRIPT",
          "userId": "user-id",
        }
      `);

      expect(usage).not.toBe(undefined);

      // Expect some keywords are identified.
      // The whole text are not always 100% identical, but these keywords should be always included.
      expect(text).toMatch(/幫我捧場一組我兼職/);
      expect(text).toMatch(/賣的葉黃素軟糖/);
      expect(text).toMatch(/含運費是1280/);
      expect(text).toMatch(/達到就會有額外的獎金/);
      expect(text).toMatch(/你能夠幫我一組就好了/);

      // Cleanup
      await client.delete({
        index: 'airesponses',
        type: 'doc',
        id: aiResponseId,
      });
    }, 60000);

    it('does transcript for text-only video', async () => {
      const {
        id: aiResponseId,
        // eslint-disable-next-line no-unused-vars
        createdAt,
        // eslint-disable-next-line no-unused-vars
        updatedAt,
        // eslint-disable-next-line no-unused-vars
        usage,
        text,
        ...aiResponse
      } = await createTranscript(
        {
          id: 'ginger',
          type: 'video',
        },
        FIXTURES_URLS['video-subtitles-only.mp4'],
        { id: 'user-id', appId: 'app-id' }
      );

      expect(aiResponse).toMatchInlineSnapshot(`
        Object {
          "appId": "app-id",
          "docId": "ginger",
          "status": "SUCCESS",
          "type": "TRANSCRIPT",
          "userId": "user-id",
        }
      `);

      // Expect some keywords are identified.
      // The whole text are not always 100% identical, but these keywords should be always included.
      expect(text).toMatch(/薑是體內最佳除濕機/);
      expect(text).toMatch(/鳳梨切塊/);
      expect(text).toMatch(/6周減緩40%疼痛/);
      expect(text).toMatch(/好口味雙倍照顧關節/);

      // Cleanup
      await client.delete({
        index: 'airesponses',
        type: 'doc',
        id: aiResponseId,
      });
    }, 120000);

    it('does transcript for complex video', async () => {
      const {
        id: aiResponseId,
        // eslint-disable-next-line no-unused-vars
        createdAt,
        // eslint-disable-next-line no-unused-vars
        updatedAt,
        // eslint-disable-next-line no-unused-vars
        usage,
        text,
        ...aiResponse
      } = await createTranscript(
        {
          id: 'tiktok',
          type: 'video',
        },
        FIXTURES_URLS['video-complex.mp4'],
        { id: 'user-id', appId: 'app-id' }
      );

      expect(aiResponse).toMatchInlineSnapshot(`
        Object {
          "appId": "app-id",
          "docId": "tiktok",
          "status": "SUCCESS",
          "type": "TRANSCRIPT",
          "userId": "user-id",
        }
      `);

      // Traditional / Simplified Chinese is not stable
      expect(text).toMatch(/一招教你秒变失踪人口|一招教你秒變失踪人口/);
      expect(text).toMatch(/就会变成空号|就會變成空號/);
      expect(text).toMatch(/你学会了吗|你學會了嗎/);

      // Cleanup
      await client.delete({
        index: 'airesponses',
        type: 'doc',
        id: aiResponseId,
      });
    }, 120000);
  });
}
