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

const SAVE_URL = 'https://web.archive.org/save';

type UserStatus = {
  processing: number;
  available: number;
  daily_captures: number;
  daily_captures_limit: number;
};

const FREE_STATUS: UserStatus = {
  processing: 0,
  available: 3,
  daily_captures: 0,
  daily_captures_limit: 30000,
};

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
  const ENV_KEYS = [
    'INTERNET_ARCHIVE_S3_ACCESS_KEY',
    'INTERNET_ARCHIVE_S3_SECRET_KEY',
    'ARCHIVE_RETRY_BASE_MS',
    'ARCHIVE_STATUS_POLL_MS',
    'ARCHIVE_STATUS_MAX_POLLS',
  ];
  let realEnvs: { [key: string]: string | undefined };
  let mockedFetch: jest.Spied<typeof fetch>;

  /**
   * Route fetch by URL: `/save/status/user` is answered by `status`, POST
   * `/save` by `save`.
   */
  function mockSPN({
    save,
    status = () => jsonResponse(FREE_STATUS),
  }: {
    save: (reqInit?: RequestInit) => Response | Promise<Response>;
    status?: () => Response | Promise<Response>;
  }) {
    mockedFetch.mockImplementation(async (url, reqInit) => {
      // Make Tyepscript happy
      if (typeof url !== 'string')
        throw new Error(
          'Fetch with non-string URL is not implemented in unit test'
        );
      if (url.startsWith('https://web.archive.org/save/status/user')) {
        return status();
      }
      if (url === SAVE_URL) return save(reqInit);
      throw new Error(`Unexpected fetch ${url}`);
    });
  }

  const saveCalls = () =>
    mockedFetch.mock.calls.filter(([url]) => url === SAVE_URL);
  const statusCalls = () =>
    mockedFetch.mock.calls.filter(
      ([url]) =>
        typeof url === 'string' &&
        url.startsWith('https://web.archive.org/save/status/user')
    );

  beforeAll(() => {
    // Spy on and mock the global fetch function
    mockedFetch = jest.spyOn(global, 'fetch');

    realEnvs = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

    process.env.INTERNET_ARCHIVE_S3_ACCESS_KEY = 'test-access-key';
    process.env.INTERNET_ARCHIVE_S3_SECRET_KEY = 'test-secret';
    process.env.ARCHIVE_RETRY_BASE_MS = '1'; // Don't wait in tests
    process.env.ARCHIVE_STATUS_POLL_MS = '1';
  });

  beforeEach(() => {
    mockedFetch.mockReset();
    delete process.env.ARCHIVE_STATUS_MAX_POLLS;
  });

  afterAll(() => {
    jest.restoreAllMocks();
    ENV_KEYS.forEach((k) => {
      if (realEnvs[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = realEnvs[k];
      }
    });
  });

  it('expect URL in text are archived', async () => {
    mockSPN({
      // Extract URL to archive from fetched URL
      save: (reqInit) =>
        jsonResponse({ job_id: '123', url: getArchivedUrl(reqInit) }),
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
    const calls = saveCalls().map((call) => {
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
    mockSPN({
      save: () =>
        jsonResponse(
          { message: 'You need to be logged in to use Save Page Now.' },
          401
        ),
    });

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
    mockSPN({
      save: (reqInit) => {
        calls += 1;
        if (calls < 3) {
          return jsonResponse({
            status: 'error',
            status_ext: 'error:user-session-limit',
            message:
              'You have already reached the limit of active Save Page Now sessions.',
          });
        }
        return jsonResponse({
          job_id: 'spn2-ok',
          url: getArchivedUrl(reqInit),
        });
      },
    });

    const results = await archiveUrlsFromText('See https://retry.example.com');
    expect(saveCalls()).toHaveLength(3);
    expect(results).toEqual([
      { job_id: 'spn2-ok', url: 'https://retry.example.com/' },
    ]);
  });

  it('does not retry final errors and gives up after max attempts', async () => {
    mockSPN({
      save: () =>
        jsonResponse({ status: 'error', status_ext: 'error:blocked-url' }),
    });
    await archiveUrlsFromText('See https://blocked.example.com');
    expect(saveCalls()).toHaveLength(1);

    mockedFetch.mockClear();
    mockSPN({
      save: () =>
        jsonResponse({
          status: 'error',
          status_ext: 'error:user-session-limit',
        }),
    });
    const [result] = await archiveUrlsFromText('See https://busy.example.com');
    expect(saveCalls()).toHaveLength(5);
    expect(result.status_ext).toBe('error:user-session-limit');
  });

  it('handles non-JSON responses and network errors without throwing', async () => {
    let calls = 0;
    mockSPN({
      save: (reqInit) => {
        calls += 1;
        if (calls === 1)
          return new Response('<html>Bad gateway</html>', { status: 502 });
        if (calls === 2) throw new TypeError('fetch failed');
        return jsonResponse({
          job_id: 'spn2-ok',
          url: getArchivedUrl(reqInit),
        });
      },
    });

    const results = await archiveUrlsFromText('See https://flaky.example.com');
    expect(saveCalls()).toHaveLength(3);
    expect(results[0].job_id).toBe('spn2-ok');
  });

  it('submits URLs one at a time, across calls, without duplicates', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mockSPN({
      save: async (reqInit) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return jsonResponse({
          job_id: 'spn2-ok',
          url: getArchivedUrl(reqInit),
        });
      },
    });

    await Promise.all([
      archiveUrlsFromText('https://a.example.com https://b.example.com'),
      archiveUrlsFromText('https://c.example.com https://a.example.com'),
    ]);

    expect(maxInFlight).toBe(1);
    const archived = saveCalls().map(([, init]) => getArchivedUrl(init));
    expect(archived.sort()).toEqual([
      'https://a.example.com/',
      'https://b.example.com/',
      'https://c.example.com/',
    ]);
  });

  describe('checks /save/status/user before submitting', () => {
    it('checks status with auth header before each submission', async () => {
      mockSPN({
        save: (reqInit) =>
          jsonResponse({ job_id: 'spn2-ok', url: getArchivedUrl(reqInit) }),
      });

      await archiveUrlsFromText('https://a.example.com https://b.example.com');

      expect(statusCalls()).toHaveLength(2);
      expect(statusCalls()[0][1]).toMatchObject({
        headers: { Authorization: 'LOW test-access-key:test-secret' },
      });
    });

    it('waits while no slot is available, then submits', async () => {
      const slots = [0, 0, 1];
      const order: string[] = [];
      mockSPN({
        status: () => {
          order.push('status');
          return jsonResponse({
            ...FREE_STATUS,
            processing: 3,
            available: slots.shift() ?? 1,
          });
        },
        save: (reqInit) => {
          order.push('save');
          return jsonResponse({
            job_id: 'spn2-ok',
            url: getArchivedUrl(reqInit),
          });
        },
      });

      const [result] = await archiveUrlsFromText(
        'See https://wait.example.com'
      );

      expect(order).toEqual(['status', 'status', 'status', 'save']);
      expect(result.job_id).toBe('spn2-ok');
    });

    it('submits anyway after waiting too long for a slot', async () => {
      process.env.ARCHIVE_STATUS_MAX_POLLS = '2';
      mockSPN({
        status: () =>
          jsonResponse({ ...FREE_STATUS, processing: 3, available: 0 }),
        save: (reqInit) =>
          jsonResponse({ job_id: 'spn2-ok', url: getArchivedUrl(reqInit) }),
      });

      const [result] = await archiveUrlsFromText(
        'See https://stuck.example.com'
      );

      expect(statusCalls()).toHaveLength(2);
      expect(saveCalls()).toHaveLength(1);
      expect(result.job_id).toBe('spn2-ok');
    });

    it('stops submitting when daily_captures_limit is reached, without retrying', async () => {
      mockSPN({
        status: () =>
          jsonResponse({
            ...FREE_STATUS,
            daily_captures: 30000,
            daily_captures_limit: 30000,
          }),
        save: () => {
          throw new Error('should not submit');
        },
      });

      const [result] = await archiveUrlsFromText(
        'See https://limit.example.com'
      );

      expect(saveCalls()).toHaveLength(0);
      expect(statusCalls()).toHaveLength(1);
      expect(result.status_ext).toBe('error:daily-limit-reached');
    });

    it.each([
      ['an error response', () => jsonResponse({ message: 'nope' }, 401)],
      ['non-JSON', () => new Response('<html>oops</html>', { status: 200 })],
      [
        'a response without the expected fields',
        () => jsonResponse({ hello: 'world' }),
      ],
    ])('submits anyway when the status check returns %s', async (_, status) => {
      mockSPN({
        status,
        save: (reqInit) =>
          jsonResponse({ job_id: 'spn2-ok', url: getArchivedUrl(reqInit) }),
      });

      const [result] = await archiveUrlsFromText(
        'See https://nostatus.example.com'
      );

      expect(saveCalls()).toHaveLength(1);
      expect(result.job_id).toBe('spn2-ok');
    });

    it('submits anyway when the status check throws', async () => {
      mockSPN({
        status: () => {
          throw new TypeError('fetch failed');
        },
        save: (reqInit) =>
          jsonResponse({ job_id: 'spn2-ok', url: getArchivedUrl(reqInit) }),
      });

      const [result] = await archiveUrlsFromText(
        'See https://down.example.com'
      );

      expect(saveCalls()).toHaveLength(1);
      expect(result.job_id).toBe('spn2-ok');
    });
  });
});
