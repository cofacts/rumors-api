import { Storage } from '@google-cloud/storage';
import MockDate from 'mockdate';
import path from 'path';

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
    const FIXTURES = ['ocr-test.jpg', 'audio-test.mp4'];
    let FIXTURES_URLS = {};

    // Upload file to public GCS bucket so that APIs can access them
    beforeAll(async () => {
      FIXTURES_URLS = (await Promise.all(
        FIXTURES.map(async filename =>
          bucket
            .upload(path.join(__dirname, '../__fixtures__/util/', filename), {
              destination: `transcript-test/${filename}`,
              public: true,
            })
            .then(([file]) => file.publicUrl())
        )
      )).reduce((map, publicUrl, i) => {
        map[FIXTURES[i]] = publicUrl;
        return map;
      }, {});
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
    it(
      'does transcript for audio',
      async () => {
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
            type: 'audio',
          },
          FIXTURES_URLS['audio-test.mp4'],
          { id: 'user-id', appId: 'app-id' }
        );

        expect(aiResponse).toMatchInlineSnapshot(`
          Object {
            "appId": "app-id",
            "docId": "foo",
            "status": "SUCCESS",
            "type": "TRANSCRIPT",
            "userId": "user-id",
          }
        `);

        // Expect some keywords are identified.
        // The whole text are not always 100% identical, but these keywords should be always included.
        expect(text).toMatch(/^各位鄉親/);
        expect(text).toMatch(/安平地區/);
        expect(text).toMatch(/110/);
        expect(text).toMatch(/165/);

        // Cleanup
        await client.delete({
          index: 'airesponses',
          type: 'doc',
          id: aiResponseId,
        });
      },
      30000
    );
    // it('does transcript for video files')
  });
}
