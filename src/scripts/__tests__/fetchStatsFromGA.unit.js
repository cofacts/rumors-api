/**
 * Mocked unit tests for fetchStatsFromGA. The integration counterpart
 * (fetchStatsFromGA.js, guarded by TEST_DATASET) loads/queries a real BigQuery
 * dataset; here we mock BigQuery so the streaming -> batch -> ES-bulk pipeline
 * and the input validation are covered on every CI run with no BQ cost.
 *
 * Elasticsearch is real (analytics index + author lookup), so we clean up.
 */
import { Readable } from 'stream';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';

jest.mock('@google-cloud/bigquery', () => {
  const createQueryJob = jest.fn();
  return { BigQuery: jest.fn(() => ({ createQueryJob })) };
});

import { BigQuery } from '@google-cloud/bigquery';
import { fetchStatsFromGA, getId, getTodayYYYYMMDD } from '../fetchStatsFromGA';

// fetchStatsFromGA.js constructed `new BigQuery()` at load; grab its mock.
const mockCreateQueryJob = BigQuery.mock.results[0].value.createQueryJob;

const PARAMS = {
  timezone: 'Asia/Taipei',
  lineBotEventDataset: 'unit_line',
  ga4Dataset: 'unit_ga4',
  webStreamId: 'web',
  liffStreamId: 'liff',
};

const fixtures = {
  '/articles/doc/fsga-article-1': { userId: 'author-1', appId: 'WEBSITE' },
  '/replies/doc/fsga-reply-1': { userId: 'author-2', appId: 'LINE' },
};

const makeJob = (rows) => [
  {
    id: 'unit-job',
    getQueryResultsStream: () => Readable.from(rows, { objectMode: true }),
  },
];

/**
 * analytics doc ids written by the script under test. Recorded before the run
 * so cleanup happens whether the test passes, fails mid-assertion, or the
 * script throws halfway through the stream.
 */
const createdIds = [];

describe('fetchStatsFromGA (unit)', () => {
  beforeAll(() => loadFixtures(fixtures));
  afterAll(async () => {
    try {
      if (createdIds.length) {
        await client.deleteByQuery({
          index: 'analytics',
          query: { ids: { values: createdIds } },
          refresh: true,
        });
      }
    } finally {
      await unloadFixtures(fixtures);
    }
  });
  beforeEach(() => mockCreateQueryJob.mockReset());

  it('getId / getTodayYYYYMMDD format helpers', () => {
    expect(getId({ dateStr: '20230601', type: 'article', docId: 'a1' })).toBe(
      'article_a1_2023-06-01'
    );
    // Exercise the helper; its exact output is locale-runtime dependent.
    expect(typeof getTodayYYYYMMDD('Asia/Taipei')).toBe('string');
  });

  it('rejects malformed startDate / endDate', async () => {
    await expect(
      fetchStatsFromGA({ startDate: 'haha', ...PARAMS })
    ).rejects.toThrow('startDate must be in YYYYMMDD format');
    await expect(
      fetchStatsFromGA({ endDate: 'haha', ...PARAMS })
    ).rejects.toThrow('endDate must be in YYYYMMDD format');
    expect(mockCreateQueryJob).not.toHaveBeenCalled();
  });

  it('rejects when endDate is earlier than startDate', async () => {
    await expect(
      fetchStatsFromGA({
        startDate: '20770802',
        endDate: '20200101',
        ...PARAMS,
      })
    ).rejects.toThrow(
      'endDate (20200101) should not be earlier than startDate (20770802)'
    );
    expect(mockCreateQueryJob).not.toHaveBeenCalled();
  });

  it('streams BQ rows into the analytics index with resolved authors', async () => {
    const rows = [
      {
        dateStr: '20230601',
        date: '2023-06-01T00:00:00.000+08:00',
        type: 'article',
        docId: 'fsga-article-1',
        stats: { lineUser: 1, lineVisit: 2, webUser: 3, webVisit: 4, liff: [] },
      },
      {
        dateStr: '20230601',
        date: '2023-06-01T00:00:00.000+08:00',
        type: 'reply',
        docId: 'fsga-reply-1',
        stats: { lineUser: 0, lineVisit: 0, webUser: 5, webVisit: 6, liff: [] },
      },
      {
        // Author not found -> docUserId/docAppId simply absent
        dateStr: '20230601',
        date: '2023-06-01T00:00:00.000+08:00',
        type: 'article',
        docId: 'fsga-missing',
        stats: { lineUser: 0, lineVisit: 0, webUser: 1, webVisit: 1, liff: [] },
      },
    ];
    mockCreateQueryJob.mockResolvedValue(makeJob(rows));

    const ids = rows.map(getId);
    createdIds.push(...ids);

    await fetchStatsFromGA({
      startDate: '20230601',
      endDate: '20230601',
      ...PARAMS,
    });

    expect(mockCreateQueryJob).toHaveBeenCalledTimes(1);
    await client.indices.refresh({ index: 'analytics' });

    const { docs } = await client.mget({ index: 'analytics', ids });
    const byId = Object.fromEntries(docs.map((d) => [d._id, d]));

    expect(byId[ids[0]]._source).toMatchObject({
      type: 'article',
      docId: 'fsga-article-1',
      docUserId: 'author-1',
      docAppId: 'WEBSITE',
      stats: { webVisit: 4 },
    });
    expect(byId[ids[1]]._source).toMatchObject({
      docUserId: 'author-2',
      docAppId: 'LINE',
    });
    // Missing author -> no docUserId field
    expect(byId[ids[2]]._source.docUserId).toBeUndefined();
    expect(byId[ids[2]]._source.docId).toBe('fsga-missing');
  });
});
