import { BigQuery } from '@google-cloud/bigquery';
import path from 'path';
import MockDate from 'mockdate';

// import { loadFixtures, unloadFixtures } from 'util/fixtures';
// import client from 'util/client';

// import fixtures from '../__fixtures__/fetchStatsFromGA';
import { fetchStatsFromGA } from '../fetchStatsFromGA';

const bigquery = new BigQuery();

// The test will run on a fake dataset specified by TEST_DATASET env.
// Please ensure that application default credential has the [permission to modify the dataset](https://cloud.google.com/bigquery/docs/batch-loading-data?hl=en#permissions-load-data-into-bigquery).

/**
 * @param {string} table
 * @param {string} jsonlFileName
 * @returns {Promise<JobMetadataResponse>}
 */
function loadBqTable(table, jsonlFileName) {
  return bigquery
    .dataset(process.env.TEST_DATASET)
    .table(table)
    .load(path.join(__dirname, '../__fixtures__/', jsonlFileName), {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      autodetect: true,
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
        'fetchStatsFromGA-ga4-events_intraday.jsonl'
      ),

      // GA4 daily event tables
      loadBqTable(
        'events_20230601',
        'fetchStatsFromGA-ga4-events_20230601.jsonl'
      ),
      loadBqTable(
        'events_20230602',
        'fetchStatsFromGA-ga4-events_20230602.jsonl'
      ),

      // LINE event table
      loadBqTable('events', 'fetchStatsFromGA-line-events.jsonl'),
    ]);

    MockDate.set(1685877545000); // 20230604
  }, 30000);

  afterAll(() => {
    MockDate.reset();
  });

  it('rejects wrong startDate & endDate settings', async () => {
    await expect(fetchStatsFromGA({ startDate: '20230601' })).rejects.toThrow(
      'Please provide both startDate and endDate'
    );
  });

  // it('works on startDate & endDate', async () => {});

  // it('works without startDate and endDate', async () => {});
}
