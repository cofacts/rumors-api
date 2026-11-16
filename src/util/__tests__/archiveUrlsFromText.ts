import {
  jest,
  describe,
  beforeAll,
  beforeEach,
  afterAll,
  it,
  expect,
} from '@jest/globals';
import archiveUrlsFromText from '../archiveUrlsFromText';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getArchivedUrl(reqInit?: RequestInit) {
  return (reqInit?.body as FormData).get('url') as string;
}

describe('archiveUrlsFromText', () => {
  let realEnvs: { [key: string]: string | undefined };
  let mockedFetch: jest.Spied<typeof fetch>;
  beforeAll(() => {
    // Spy on and mock the global fetch function
    mockedFetch = jest.spyOn(global, 'fetch');

    realEnvs = {
      INTERNET_ARCHIVE_S3_ACCESS_KEY:
        process.env.INTERNET_ARCHIVE_S3_ACCESS_KEY,
      INTERNET_ARCHIVE_S3_SECRET_KEY:
        process.env.INTERNET_ARCHIVE_S3_SECRET_KEY,
      ARCHIVE_RETRY_BASE_MS: process.env.ARCHIVE_RETRY_BASE_MS,
    };

    process.env.INTERNET_ARCHIVE_S3_ACCESS_KEY = 'test-access-key';
    process.env.INTERNET_ARCHIVE_S3_SECRET_KEY = 'test-secret';
    process.env.ARCHIVE_RETRY_BASE_MS = '1'; // Don't wait in tests
  });

  beforeEach(() => {
    mockedFetch.mockClear();
  });

  afterAll(() => {
    jest.restoreAllMocks();
    process.env.INTERNET_ARCHIVE_S3_ACCESS_KEY =
      realEnvs.INTERNET_ARCHIVE_S3_ACCESS_KEY;
    process.env.INTERNET_ARCHIVE_S3_SECRET_KEY =
      realEnvs.INTERNET_ARCHIVE_S3_SECRET_KEY;
    if (realEnvs.ARCHIVE_RETRY_BASE_MS === undefined) {
      delete process.env.ARCHIVE_RETRY_BASE_MS;
    } else {
      process.env.ARCHIVE_RETRY_BASE_MS = realEnvs.ARCHIVE_RETRY_BASE_MS;
    }
  });

  it('expect URL in text are archived', async () => {
    mockedFetch.mockImplementation(async (url, reqInit) => {
      // Make Tyepscript happy
      if (typeof url !== 'string')
        throw new Error(
          'Fetch with non-string URL is not implemented in unit test'
        );

      // Extract URL to archive from fetched URL
      const urlToArchive = (reqInit?.body as FormData).get('url');

      return jsonResponse({ job_id: '123', url: urlToArchive });
    });

    const text =
      'Please check https://example.com and https://example2.com?foo=bar&fbclid=123';
    const results = await archiveUrlsFromText(text);

    // Check if job_id is attached and fbclid is removed
    //
    expect(results).toMatchInlineSnapshot(`
      Array [
        Object {
          "job_id": "123",
          "url": "https://example.com/",
        },
        Object {
          "job_id": "123",
          "url": "https://example2.com/?foo=bar",
        },
      ]
    `);

    // Check if https://web.archive.org/save is called with expected params and headers
    //
    const calls = mockedFetch.mock.calls.map((call) => {
      const [url, init] = call;
      const body = init?.body as FormData;
      const bodyEntries: Record<string, unknown> = {};
      if (body && typeof body.forEach === 'function') {
        body.forEach((value, key) => {
          bodyEntries[key] = value;
        });
      }
      return [
        url,
        {
          ...init,
          body: bodyEntries,
        },
      ];
    });

    expect(calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "https://web.archive.org/save",
          Object {
            "body": Object {
              "capture_screenshot": "1",
              "delay_wb_availability": "1",
              "skip_first_archive": "1",
              "url": "https://example.com/",
            },
            "headers": Object {
              "Accept": "application/json",
              "Authorization": "LOW test-access-key:test-secret",
            },
            "method": "POST",
          },
        ],
        Array [
          "https://web.archive.org/save",
          Object {
            "body": Object {
              "capture_screenshot": "1",
              "delay_wb_availability": "1",
              "skip_first_archive": "1",
              "url": "https://example2.com/?foo=bar",
            },
            "headers": Object {
              "Accept": "application/json",
              "Authorization": "LOW test-access-key:test-secret",
            },
            "method": "POST",
          },
        ],
      ]
    `);
  });

  it('expect errors can be handled', async () => {
    mockedFetch.mockImplementation(async () =>
      jsonResponse(
        { message: 'You need to be logged in to use Save Page Now.' },
        401
      )
    );

    const text =
      'Please check https://example.com and https://example2.com?foo=bar&fbclid=123';
    const results = await archiveUrlsFromText(text);

    // Check if result is passed
    //
    expect(results).toMatchInlineSnapshot(`
      Array [
        Object {
          "message": "You need to be logged in to use Save Page Now.",
        },
        Object {
          "message": "You need to be logged in to use Save Page Now.",
        },
      ]
    `);
  });

  it('do nothing if no URL in text', async () => {
    const text = 'No URL here';
    const results = await archiveUrlsFromText(text);
    expect(results).toEqual([]);
    expect(mockedFetch).not.toBeCalled();
  });
  it('retries when SPN2 session limit is reached', async () => {
    let calls = 0;
    mockedFetch.mockImplementation(async (_, reqInit) => {
      calls += 1;
      if (calls < 3) {
        return jsonResponse({
          status: 'error',
          status_ext: 'error:user-session-limit',
          message:
            'You have already reached the limit of active Save Page Now sessions.',
        });
      }
      return jsonResponse({ job_id: 'spn2-ok', url: getArchivedUrl(reqInit) });
    });

    const results = await archiveUrlsFromText('See https://retry.example.com');
    expect(mockedFetch).toHaveBeenCalledTimes(3);
    expect(results).toEqual([
      { job_id: 'spn2-ok', url: 'https://retry.example.com/' },
    ]);
  });

  it('does not retry final errors and gives up after max attempts', async () => {
    mockedFetch.mockImplementation(async () =>
      jsonResponse({ status: 'error', status_ext: 'error:blocked-url' })
    );
    await archiveUrlsFromText('See https://blocked.example.com');
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    mockedFetch.mockClear();
    mockedFetch.mockImplementation(async () =>
      jsonResponse({ status: 'error', status_ext: 'error:user-session-limit' })
    );
    const [result] = await archiveUrlsFromText('See https://busy.example.com');
    expect(mockedFetch).toHaveBeenCalledTimes(5);
    expect(result.status_ext).toBe('error:user-session-limit');
  });

  it('handles non-JSON responses and network errors without throwing', async () => {
    let calls = 0;
    mockedFetch.mockImplementation(async (_, reqInit) => {
      calls += 1;
      if (calls === 1)
        return new Response('<html>Bad gateway</html>', { status: 502 });
      if (calls === 2) throw new TypeError('fetch failed');
      return jsonResponse({ job_id: 'spn2-ok', url: getArchivedUrl(reqInit) });
    });

    const results = await archiveUrlsFromText('See https://flaky.example.com');
    expect(mockedFetch).toHaveBeenCalledTimes(3);
    expect(results[0].job_id).toBe('spn2-ok');
  });

  it('submits URLs one at a time, across calls, without duplicates', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mockedFetch.mockImplementation(async (_, reqInit) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return jsonResponse({ job_id: 'spn2-ok', url: getArchivedUrl(reqInit) });
    });

    await Promise.all([
      archiveUrlsFromText('https://a.example.com https://b.example.com'),
      archiveUrlsFromText('https://c.example.com https://a.example.com'),
    ]);

    expect(maxInFlight).toBe(1);
    const archived = mockedFetch.mock.calls.map(([, init]) =>
      getArchivedUrl(init)
    );
    expect(archived.sort()).toEqual([
      'https://a.example.com/',
      'https://b.example.com/',
      'https://c.example.com/',
    ]);
  });
});
