import { BigQuery } from '@google-cloud/bigquery';
import path from 'path';
// import MockDate from 'mockdate';

// import { loadFixtures, unloadFixtures } from 'util/fixtures';
// import client from 'util/client';

// import fixtures from '../__fixtures__/fetchStatsFromGA';
// import { fetchStatsFromGA } from '../fetchStatsFromGA';

const bigquery = new BigQuery();

// The test will run on a fake dataset specified by TEST_DATASET env.
// Please ensure that application default credential has

if (process.env.TEST_DATASET) {
  beforeAll(async () => {
    // Populate TEST_DATASET
    await bigquery
      .dataset(process.env.TEST_DATASET)
      .table('hello_world')
      .load(path.join(__dirname, '../__fixtures__/fetchStatsFromGA.jsonl'), {
        sourceFormat: 'NEWLINE_DELIMITED_JSON',
        autodetect: true,
        writeDisposition: 'WRITE_TRUNCATE',
      });
  }, 30000);

  it.only('works', async () => {
    const [table] = await bigquery
      .dataset(process.env.TEST_DATASET)
      .table('hello_world')
      .get();
    console.log(table.metadata.numRows);
  });
}
