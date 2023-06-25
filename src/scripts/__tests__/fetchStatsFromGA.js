import { BigQuery } from '@google-cloud/bigquery';
import path from 'path';
import MockDate from 'mockdate';

// import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import delayForMs from 'util/delayForMs';

// import fixtures from '../__fixtures__/fetchStatsFromGA';
import { fetchStatsFromGA } from '../fetchStatsFromGA';

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

const GA4_SCHEMA = {
  fields: [
    { name: 'event_name', type: 'STRING' },
    { name: 'event_date', type: 'STRING' },
    { name: 'event_timestamp', type: 'INTEGER' },
    { name: 'user_pseudo_id', type: 'STRING' },
    { name: 'stream_id', type: 'STRING' },
    {
      name: 'items',
      type: 'RECORD',
      mode: 'REPEATED',
      fields: [
        { name: 'item_id', type: 'STRING' },
        { name: 'item_category', type: 'STRING' },
      ],
    },
    {
      name: 'collected_traffic_source',
      type: 'RECORD',
      fields: [{ name: 'manual_source', type: 'STRING' }],
    },
  ],
};

/**
 * @param {string} table
 * @param {string} jsonlFileName
 * @returns {Promise<JobMetadataResponse>}
 */
function loadBqTable(table, jsonlFileName, schema) {
  return bigquery
    .dataset(process.env.TEST_DATASET)
    .table(table)
    .load(path.join(__dirname, '../__fixtures__/', jsonlFileName), {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      autodetect: !schema,
      schema,
      writeDisposition: 'WRITE_TRUNCATE',
    });
}

if (process.env.TEST_DATASET) {
  beforeAll(async () => {
    // Populate TEST_DATASET
    //
    await Promise.all([
      // GA4 intraday table (Today = 20230604)
      loadBqTable(
        'events_intraday_20230604',
        'fetchStatsFromGA-ga4-events_intraday.jsonl',
        GA4_SCHEMA
      ),

      // GA4 daily event tables
      loadBqTable(
        'events_20230601',
        'fetchStatsFromGA-ga4-events_20230601.jsonl',
        GA4_SCHEMA
      ),
      loadBqTable(
        'events_20230602',
        'fetchStatsFromGA-ga4-events_20230602.jsonl',
        GA4_SCHEMA
      ),

      // LINE event table
      loadBqTable('events', 'fetchStatsFromGA-line-events.jsonl'),

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

    // MockDate.set(1685877545000); // 20230604
  }, 30000);

  afterAll(() => {
    MockDate.reset();
  });

  it('rejects wrong startDate & endDate settings', async () => {
    await expect(fetchStatsFromGA({ startDate: '20230601' })).rejects.toThrow(
      'Please provide both startDate and endDate'
    );
    await expect(
      fetchStatsFromGA({ startDate: 'haha', endDate: 'haha' })
    ).rejects.toThrow('startDate must be in YYYYMMDD format');
    await expect(
      fetchStatsFromGA({ startDate: '20240601', endDate: 'haha' })
    ).rejects.toThrow('endDate must be in YYYYMMDD format');
    await expect(
      fetchStatsFromGA({ startDate: '20770801', endDate: '20770802' })
    ).rejects.toThrow('startDate must be earlier than 20230604');
    await expect(
      fetchStatsFromGA({ startDate: '20230601', endDate: '20770801' })
    ).rejects.toThrow('endDate must be earlier than 20230604');
  });

  it.only('works on startDate & endDate', async () => {
    // Fetch GA stats from BQ and write to analytics
    await fetchStatsFromGA({
      startDate: '20230601',
      endDate: '20230602',
      ...COMMON_FETCHSTAT_PARAMS,
    });
  });

  // it('works without startDate and endDate', async () => {});
}
