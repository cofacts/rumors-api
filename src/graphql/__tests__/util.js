import { Storage } from '@google-cloud/storage';

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
    const FIXTURES = ['ocr-testing.jpg'];
    let FIXTURES_URLS = {};

    // Upload file to public GCS bucket so that APIs can access them
    beforeAll(async () => {
      FIXTURES_URLS = (await Promise.all(
        FIXTURES.map(async filename =>
          bucket
            .upload(`../__fixtures__/util/${filename}`, {
              destination: `transcript-test/${filename}`,
            })
            .then(([file]) => file.publicUrl())
        )
      )).reduce((map, publicUrl, i) => {
        map[FIXTURES[i]] = publicUrl;
        return map;
      }, {});
    });

    it('creates error when file format is not supported', async () => {
      const aiResponse = await createTranscript(
        {
          id: 'foo',
          type: 'file',
        },
        'https://some-url',
        { id: 'foo', appId: 'WEBSITE' }
      );
      expect(aiResponse).toMatchInlineSnapshot();

      // Cleanup
      await client.delete({
        index: 'airesponses',
        type: 'doc',
        id: aiResponse.id,
      });
    });

    it('does OCR', async () => {
      const aiResponse = await createTranscript(
        {
          id: 'foo',
          type: 'file',
        },
        FIXTURES_URLS['ocr-testing.jpg'],
        { id: 'foo', appId: 'WEBSITE' }
      );

      expect(aiResponse).toMatchInlineSnapshot();
      // Cleanup
      await client.delete({
        index: 'airesponses',
        type: 'doc',
        id: aiResponse.id,
      });
    });
    // it('does transcript for small files')
    // it('does transcript for large files')
  });
}
