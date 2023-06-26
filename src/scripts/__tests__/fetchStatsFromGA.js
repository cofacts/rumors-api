import { BigQuery } from '@google-cloud/bigquery';
import path from 'path';
import fs from 'fs/promises';

import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import delayForMs from 'util/delayForMs';

import {
  fetchStatsFromGA,
  getTodayYYYYMMDD,
  getId,
  createBatchTransform,
} from '../fetchStatsFromGA';
import fixtures, {
  GA4_SCHEMA,
  events_20230601,
  events_20230602,
  events,
  events_today,
} from '../__fixtures__/fetchStatsFromGA';
import { pipeline } from 'stream/promises';

// The test will run on a fake dataset specified by TEST_DATASET env.
// Please ensure that application default credential has the [permission to modify the dataset](https://cloud.google.com/bigquery/docs/batch-loading-data?hl=en#permissions-load-data-into-bigquery).

const bigquery = new BigQuery();

const COMMON_FETCHSTAT_PARAMS = {
  timezone: 'Asia/Taipei',
  lineBotEventDataset: process.env.TEST_DATASET,
  ga4Dataset: process.env.TEST_DATASET,
  webStreamId: 'website',
  liffStreamId: 'liff',
};

/** YYYYMMDD */
const today = getTodayYYYYMMDD(COMMON_FETCHSTAT_PARAMS.timezone);

/**
 * Writes rows into build/${table}.jsonl and load it to BigQuery
 *
 * @param {string} table
 * @param {string} jsonlFileName
 * @returns {Promise<JobMetadataResponse>}
 */
async function loadBqTable(table, rows, schema) {
  const file = path.join(__dirname, '../../../build/', `${table}.jsonl`);
  await fs.writeFile(file, rows.map(row => JSON.stringify(row)).join('\n'));

  return bigquery
    .dataset(process.env.TEST_DATASET)
    .table(table)
    .load(file, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      autodetect: !schema,
      schema,
      writeDisposition: 'WRITE_TRUNCATE',
    });
}

describe('fetchStatsFromGA', () => {
  it('rejects wrong startDate & endDate settings', async () => {
    await expect(
      fetchStatsFromGA({ startDate: '20230601', ...COMMON_FETCHSTAT_PARAMS })
    ).rejects.toThrow('Please provide both startDate and endDate');
    await expect(
      fetchStatsFromGA({
        startDate: 'haha',
        endDate: 'haha',
        ...COMMON_FETCHSTAT_PARAMS,
      })
    ).rejects.toThrow('startDate must be in YYYYMMDD format');
    await expect(
      fetchStatsFromGA({
        startDate: '20240601',
        endDate: 'haha',
        ...COMMON_FETCHSTAT_PARAMS,
      })
    ).rejects.toThrow('endDate must be in YYYYMMDD format');

    await expect(
      fetchStatsFromGA({
        startDate: '20770801',
        endDate: '20770802',
        ...COMMON_FETCHSTAT_PARAMS,
      })
    ).rejects.toThrow(`startDate must be earlier than ${today}`);
    await expect(
      fetchStatsFromGA({
        startDate: '20230601',
        endDate: '20770801',
        ...COMMON_FETCHSTAT_PARAMS,
      })
    ).rejects.toThrow(`endDate must be earlier than ${today}`);
  });

  if (process.env.TEST_DATASET) {
    beforeAll(async () => {
      await Promise.all([
        loadFixtures(fixtures),

        // Populate TEST_DATASET
        //
        // GA4 daily event tables
        loadBqTable('events_20230601', events_20230601, GA4_SCHEMA),
        loadBqTable('events_20230602', events_20230602, GA4_SCHEMA),
        loadBqTable(`events_intraday_${today}`, events_today, GA4_SCHEMA),

        // LINE event table
        loadBqTable('events', events),

        // Cleanup analytics index
        client.deleteByQuery({
          index: 'analytics',
          body: {
            query: {
              match_all: {},
            },
          },
          refresh: 'true',
        }),
      ]);

      // Wait for BQ & ES data to be indexed
      //
      await delayForMs(5000);
    }, 30000);

    afterAll(async () => {
      await unloadFixtures(fixtures);
    });

    it('works on startDate & endDate', async () => {
      // Fetch GA stats from BQ and write to analytics
      await fetchStatsFromGA({
        startDate: '20230601',
        endDate: '20230602',
        ...COMMON_FETCHSTAT_PARAMS,
      });

      // Expect line & web stats are both collected.
      // Also checks if `date`, `docId` etc are correctly filled in.
      //
      // eslint-disable-next-line no-unused-vars
      const { fetchedAt: dontcare, ...article1At0601 } = (await client.get({
        index: 'analytics',
        type: 'doc',
        id: 'article_article1_2023-06-01',
      })).body._source;
      expect(article1At0601).toMatchInlineSnapshot(`
        Object {
          "date": "2023-06-01T00:00:00.000+08:00",
          "docAppId": "articleAuthorApp",
          "docId": "article1",
          "docUserId": "articleAuthorId",
          "stat": Object {
            "liff": Array [],
            "lineUser": 1,
            "lineVisit": 1,
            "webUser": 1,
            "webVisit": 1,
          },
          "type": "article",
        }
      `);

      // Expect 1 user see reply1 twice on web on 6/1.
      //
      expect(
        (await client.get({
          index: 'analytics',
          type: 'doc',
          id: 'reply_reply1_2023-06-01',
        })).body._source.stat
      ).toMatchInlineSnapshot(`
        Object {
          "liff": Array [],
          "lineUser": null,
          "lineVisit": null,
          "webUser": 1,
          "webVisit": 2,
        }
      `);

      // Expect article counts from different sources are aggregated in LIFF
      //
      expect(
        (await client.get({
          index: 'analytics',
          type: 'doc',
          id: 'article_article1_2023-06-02',
        })).body._source.stat
      ).toMatchInlineSnapshot(`
        Object {
          "liff": Array [
            Object {
              "source": "downstream-bot-1",
              "user": 1,
              "visit": 1,
            },
            Object {
              "source": "downstream-bot-2",
              "user": 1,
              "visit": 1,
            },
          ],
          "lineUser": null,
          "lineVisit": null,
          "webUser": null,
          "webVisit": null,
        }
      `);

      // Expect existing stats are overwritten with correct stats
      //
      expect(
        (await client.get({
          index: 'analytics',
          type: 'doc',
          id: 'article_article2_2023-06-01',
        })).body._source.stat
      ).toMatchInlineSnapshot(`
        Object {
          "liff": Array [],
          "lineUser": null,
          "lineVisit": null,
          "webUser": 1,
          "webVisit": 1,
        }
      `);

      // Cleanup
      for (const id of [
        // Enumerate newly created article / reply ids in 6/1, 6/2
        'reply_reply1_2023-06-01',
        'reply_reply1_2023-06-02',
        'article_article1_2023-06-01',
        'article_article1_2023-06-02',
      ]) {
        await client.delete({ index: 'analytics', type: 'doc', id });
      }
    });

    it('works without startDate and endDate', async () => {
      // Fetch GA stats from BQ and write to analytics
      await fetchStatsFromGA({
        ...COMMON_FETCHSTAT_PARAMS,
      });

      const articleAnalyticsTodayId = getId({
        dateStr: today,
        type: 'article',
        docId: 'article1',
      });

      // Expect both web stream and LIFF stream visits are read from the intra table
      //
      expect(
        (await client.get({
          index: 'analytics',
          type: 'doc',
          id: articleAnalyticsTodayId,
        })).body._source.stat
      ).toMatchInlineSnapshot(`
        Object {
          "liff": Array [
            Object {
              "source": "downstream-bot-1",
              "user": 1,
              "visit": 1,
            },
          ],
          "lineUser": null,
          "lineVisit": null,
          "webUser": 1,
          "webVisit": 1,
        }
      `);

      // Cleanup
      await client.delete({
        index: 'analytics',
        type: 'doc',
        id: articleAnalyticsTodayId,
      });
    });
  }
});

describe('createBatchTransform', () => {
  it('groups evenly divisible objects into batches', async () => {
    const receivedBatches = [];
    await pipeline(
      // Generates 1, 2, 3, 4, 5, 6
      async function*() {
        for (let i = 1; i <= 6; i += 1) {
          yield i;
        }
      },

      // Group objects by 3
      createBatchTransform(3),

      // Push to receivedBatches
      async function(batches) {
        for await (const batch of batches) {
          receivedBatches.push(batch);
        }
      }
    );

    expect(receivedBatches).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it('handles not-evenly-divisible batches', async () => {
    const receivedBatches = [];
    await pipeline(
      // Generates 1, 2, 3, 4
      async function*() {
        for (let i = 1; i <= 4; i += 1) {
          yield i;
        }
      },

      // Group objects by 3
      createBatchTransform(3),

      // Push to receivedBatches
      async function(batches) {
        for await (const batch of batches) {
          receivedBatches.push(batch);
        }
      }
    );

    expect(receivedBatches).toEqual([[1, 2, 3], [4]]);
  });
});
