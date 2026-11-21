import {
  jest,
  describe,
  beforeAll,
  beforeEach,
  afterAll,
  it,
  expect,
} from '@jest/globals';
import MockDate from 'mockdate';

import { loadFixtures, unloadFixtures } from 'util/fixtures';
import archiveMissingUrls, {
  exitCodeOf,
  hasSnapshotSince,
  toWaybackTimestamp,
} from '../archiveMissingUrls';
import fixtures, {
  NOW,
  manyUrlsFixtures,
  lagFixtures,
} from '../__fixtures__/archiveMissingUrls';

const CDX = 'https://web.archive.org/cdx/search/cdx';
const SAVE = 'https://web.archive.org/save';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('archiveMissingUrls', () => {
  let mockedFetch: jest.Spied<typeof fetch>;
  const ENV_KEYS = [
    'INTERNET_ARCHIVE_S3_ACCESS_KEY',
    'INTERNET_ARCHIVE_S3_SECRET_KEY',
    'ARCHIVE_RETRY_BASE_MS',
    'ARCHIVE_STATUS_POLL_MS',
  ];
  let realEnvs: Record<string, string | undefined>;

  /** URL -> CDX answer; anything not listed has no snapshot */
  let cdxAnswers: Record<string, () => Response>;

  const cdxCalls = () =>
    mockedFetch.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith(CDX))
      .map((url) => new URL(url).searchParams);
  const savedUrls = () =>
    mockedFetch.mock.calls
      .filter(([url]) => url === SAVE)
      .map(([, init]) => (init?.body as FormData).get('url'));

  beforeAll(async () => {
    realEnvs = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    process.env.INTERNET_ARCHIVE_S3_ACCESS_KEY = 'test-access-key';
    process.env.INTERNET_ARCHIVE_S3_SECRET_KEY = 'test-secret';
    process.env.ARCHIVE_RETRY_BASE_MS = '1';
    process.env.ARCHIVE_STATUS_POLL_MS = '1';

    MockDate.set(NOW);
    await loadFixtures(fixtures);
    mockedFetch = jest.spyOn(global, 'fetch');
  });

  beforeEach(() => {
    cdxAnswers = {
      'https://has-snapshot.example.com/a': () =>
        jsonResponse([['timestamp'], ['20310227000000']]),
      'https://cdx-error.example.com/d': () =>
        new Response('Service Unavailable', { status: 503 }),
    };

    mockedFetch.mockReset();
    mockedFetch.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.startsWith(CDX)) {
        const target = new URL(u).searchParams.get('url') ?? '';
        return (cdxAnswers[target] ?? (() => jsonResponse([])))();
      }
      if (u.startsWith('https://web.archive.org/save/status/user')) {
        return jsonResponse({
          processing: 0,
          available: 3,
          daily_captures: 0,
          daily_captures_limit: 30000,
        });
      }
      if (u === SAVE) {
        return jsonResponse({
          url: (init?.body as FormData).get('url'),
          job_id: 'spn2-test',
        });
      }
      throw new Error(`Unexpected fetch ${u}`);
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    MockDate.reset();
    await unloadFixtures(fixtures);
    ENV_KEYS.forEach((k) => {
      if (realEnvs[k] === undefined) delete process.env[k];
      else process.env[k] = realEnvs[k];
    });
  });

  it('finds URLs without a snapshot in the window, without submitting in dry run', async () => {
    const summary = await archiveMissingUrls({ dryRun: true, cdxDelayMs: 0 });

    expect(summary.docs).toBe(4);
    expect(summary.urls).toBe(4);
    expect(summary.withSnapshot).toBe(1);
    expect(summary.unknown).toBe(1);
    expect(summary.abortedLookups).toBe(false);
    // fbclid is removed, and the reply's reference is included
    expect(summary.missing.sort()).toEqual([
      'https://missing.example.com/b',
      'https://reference.example.com/c',
    ]);
    expect(savedUrls()).toEqual([]);

    // Only URLs from docs in the window are looked up
    const looked = cdxCalls().map((p) => p.get('url'));
    expect(looked).not.toContain('https://too-new.example.com/');
    expect(looked).not.toContain('https://too-old.example.com/');
    // Articles from blocked users are skipped
    expect(looked).not.toContain('https://blocked-spam.example.com/x');

    // A URL in several docs is looked up once, from the earliest creation time
    const missingLookups = cdxCalls().filter(
      (p) => p.get('url') === 'https://missing.example.com/b'
    );
    expect(missingLookups).toHaveLength(1);
    // ... minus SPN2's 1-hour window for reusing a recent capture
    expect(missingLookups[0].get('from')).toBe(
      toWaybackTimestamp(
        new Date(
          new Date(
            fixtures['/replies/doc/archiveMissingUrls-r1'].createdAt
          ).getTime() - 3600_000
        )
      )
    );
  });

  it('re-submits only the URLs without a snapshot', async () => {
    const summary = await archiveMissingUrls({ cdxDelayMs: 0 });

    expect(savedUrls().sort()).toEqual([
      'https://missing.example.com/b',
      'https://reference.example.com/c',
    ]);
    expect(summary.resubmitted).toEqual({ job_id: 2 });
  });

  it('stops looking up after 5 failed CDX lookups in a row, and submits nothing it could not check', async () => {
    await loadFixtures(manyUrlsFixtures);
    try {
      mockedFetch.mockImplementation(async (url) => {
        if (String(url).startsWith(CDX)) {
          return new Response('<html>429</html>', { status: 429 });
        }
        throw new Error(`Unexpected fetch ${url}`);
      });

      const summary = await archiveMissingUrls({ cdxDelayMs: 0 });

      expect(summary.urls).toBe(7);
      expect(cdxCalls()).toHaveLength(5);
      expect(summary.unknown).toBe(5);
      expect(summary.abortedLookups).toBe(true);
      expect(summary.missing).toEqual([]);
      expect(savedUrls()).toEqual([]);
    } finally {
      await unloadFixtures(manyUrlsFixtures);
    }
  });

  it('re-submits nothing when none of 10+ checked URLs has a snapshot, unless forced', async () => {
    await loadFixtures(lagFixtures);
    try {
      // Captures not visible in CDX yet: every lookup says "no snapshot"
      cdxAnswers = {};

      const summary = await archiveMissingUrls({ cdxDelayMs: 0 });
      expect(summary.withSnapshot).toBe(0);
      expect(summary.missing.length).toBeGreaterThanOrEqual(10);
      expect(summary.skippedLikelyLag).toBe(true);
      expect(savedUrls()).toEqual([]);

      mockedFetch.mockClear();
      const forced = await archiveMissingUrls({ cdxDelayMs: 0, force: true });
      expect(forced.skippedLikelyLag).toBe(false);
      expect(savedUrls()).toHaveLength(forced.missing.length);
    } finally {
      await unloadFixtures(lagFixtures);
    }
  });

  it('still re-submits when only a few URLs were checked and none has a snapshot', async () => {
    // 3 checked URLs without snapshot; the 4th lookup fails
    cdxAnswers = {
      'https://cdx-error.example.com/d': () =>
        new Response('Service Unavailable', { status: 503 }),
    };
    const summary = await archiveMissingUrls({ cdxDelayMs: 0 });
    expect(summary.skippedLikelyLag).toBe(false);
    expect(savedUrls()).toHaveLength(3);
  });

  it('rejects a cdxDelayMs that would disable pacing', async () => {
    await expect(archiveMissingUrls({ cdxDelayMs: NaN })).rejects.toThrow();
    await expect(archiveMissingUrls({ cdxDelayMs: -1 })).rejects.toThrow();
  });

  it('leaves one SPN2 slot free for the API server when re-submitting', async () => {
    // SPN2 reports 1 free slot twice, then 2: the script waits for 2
    const available = [1, 1, 2, 2, 2, 2];
    const order: string[] = [];
    const base = mockedFetch.getMockImplementation();
    mockedFetch.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.startsWith('https://web.archive.org/save/status/user')) {
        order.push(`status:${available[0]}`);
        return jsonResponse({
          processing: 3 - (available[0] ?? 2),
          available: available.shift() ?? 2,
          daily_captures: 0,
          daily_captures_limit: 30000,
        });
      }
      if (u === SAVE) order.push('save');
      if (!base) throw new Error('no base fetch mock');
      return base(url, init);
    });

    await archiveMissingUrls({ cdxDelayMs: 0 });
    expect(order.slice(0, 4)).toEqual([
      'status:1',
      'status:1',
      'status:2',
      'save',
    ]);
  });

  it('rejects an empty or inverted window', async () => {
    await expect(
      archiveMissingUrls({ fromHours: 24, toHours: 24 })
    ).rejects.toThrow();
    await expect(
      archiveMissingUrls({ fromHours: 24, toHours: 48 })
    ).rejects.toThrow();
  });
});

describe('hasSnapshotSince', () => {
  let mockedFetch: jest.Spied<typeof fetch>;
  beforeAll(() => {
    mockedFetch = jest.spyOn(global, 'fetch');
  });
  afterAll(() => {
    mockedFetch.mockRestore();
  });

  it.each([
    [
      'a capture',
      () => jsonResponse([['timestamp'], ['20310227000000']]),
      true,
    ],
    ['no capture', () => jsonResponse([]), false],
    ['an HTTP error', () => new Response('nope', { status: 503 }), null],
    ['non-JSON', () => new Response('<html>', { status: 200 }), null],
    ['unexpected JSON', () => jsonResponse({ hello: 'world' }), null],
  ])('handles %s', async (_, response, expected) => {
    mockedFetch.mockImplementation(async () => response());
    expect(
      await hasSnapshotSince(
        'https://example.com/',
        new Date('2031-01-02T03:04:05Z')
      )
    ).toBe(expected);
  });

  it('returns null when the request fails', async () => {
    mockedFetch.mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });
    expect(
      await hasSnapshotSince('https://example.com/', new Date())
    ).toBeNull();
  });

  it('asks CDX for captures from the given time', async () => {
    mockedFetch.mockImplementation(async () => jsonResponse([]));
    await hasSnapshotSince(
      'https://example.com/?a=1&b=2',
      new Date('2031-01-02T03:04:05Z')
    );
    const params = new URL(String(mockedFetch.mock.calls.at(-1)?.[0]))
      .searchParams;
    expect(params.get('url')).toBe('https://example.com/?a=1&b=2');
    expect(params.get('from')).toBe('20310102030405');
    expect(params.get('limit')).toBe('1');
  });
});

describe('toWaybackTimestamp', () => {
  it('formats UTC time as YYYYMMDDhhmmss', () => {
    expect(toWaybackTimestamp(new Date('2031-01-02T03:04:05.678Z'))).toBe(
      '20310102030405'
    );
  });
});

describe('exitCodeOf', () => {
  const base = {
    docs: 1,
    urls: 1,
    withSnapshot: 1,
    missing: [],
    unknown: 0,
    abortedLookups: false,
    skippedLikelyLag: false,
    resubmitted: {},
  };
  it('is 0 for a normal run, 2 when the run could not do its job', () => {
    expect(exitCodeOf(base)).toBe(0);
    expect(exitCodeOf({ ...base, abortedLookups: true })).toBe(2);
    expect(exitCodeOf({ ...base, skippedLikelyLag: true })).toBe(2);
  });
});
