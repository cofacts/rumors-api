import {
  jest,
  describe,
  beforeAll,
  beforeEach,
  afterAll,
  it,
  expect,
} from '@jest/globals';
import archiveUrlsFromText, { archiveUrls } from '../archiveUrlsFromText';

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
    'ARCHIVE_URL_BUDGET_MS',
    'ARCHIVE_REQUEST_TIMEOUT_MS',
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
    process.env.ARCHIVE_RETRY_BASE_MS = '1';
    delete process.env.ARCHIVE_STATUS_MAX_POLLS;
    delete process.env.ARCHIVE_URL_BUDGET_MS;
    delete process.env.ARCHIVE_REQUEST_TIMEOUT_MS;
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
      const [url, { signal, ...init } = {}] = call;
      expect(signal).toBeInstanceOf(AbortSignal);
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

    it('waits for minAvailableSlots free slots when asked', async () => {
      const slots = [1, 1, 2];
      const order: string[] = [];
      mockSPN({
        status: () => {
          order.push('status');
          return jsonResponse({
            ...FREE_STATUS,
            processing: 3 - (slots[0] ?? 2),
            available: slots.shift() ?? 2,
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

      const [result] = await archiveUrls(['https://min-slots.example.com/'], {
        minAvailableSlots: 2,
      });

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
  describe('robustness', () => {
    it('does not throw when the response body is JSON null', async () => {
      mockSPN({ save: () => new Response('null', { status: 200 }) });
      const [result] = await archiveUrlsFromText(
        'See https://null.example.com'
      );
      expect(result.status).toBe('error');
      expect(result.job_id).toBeUndefined();
    });

    it('treats a failure while reading the response body as a retryable network error', async () => {
      let calls = 0;
      mockSPN({
        save: (reqInit) => {
          calls += 1;
          if (calls === 1) {
            const body = new ReadableStream({
              start(controller) {
                controller.error(new TypeError('terminated'));
              },
            });
            return new Response(body, { status: 200 });
          }
          return jsonResponse({
            job_id: 'spn2-ok',
            url: getArchivedUrl(reqInit),
          });
        },
      });

      const [result] = await archiveUrlsFromText(
        'See https://reset.example.com'
      );
      expect(saveCalls()).toHaveLength(2);
      expect(result.job_id).toBe('spn2-ok');
    });

    it('retries non-JSON 429/408 responses but not other non-JSON 4xx', async () => {
      let calls = 0;
      mockSPN({
        save: (reqInit) => {
          calls += 1;
          if (calls === 1)
            return new Response('<html>slow down</html>', { status: 429 });
          if (calls === 2)
            return new Response('<html>timeout</html>', { status: 408 });
          return jsonResponse({
            job_id: 'spn2-ok',
            url: getArchivedUrl(reqInit),
          });
        },
      });
      const [retried] = await archiveUrlsFromText(
        'See https://html429.example.com'
      );
      expect(saveCalls()).toHaveLength(3);
      expect(retried.job_id).toBe('spn2-ok');

      mockedFetch.mockClear();
      mockSPN({
        save: () => new Response('<html>denied</html>', { status: 403 }),
      });
      const [final] = await archiveUrlsFromText(
        'See https://html403.example.com'
      );
      expect(saveCalls()).toHaveLength(1);
      expect(final.status_ext).toBe('error:non-json');
    });

    it.each([[''], ['abc'], ['0'], ['-3']])(
      'falls back to defaults when ARCHIVE_STATUS_MAX_POLLS is %p',
      async (value) => {
        process.env.ARCHIVE_STATUS_MAX_POLLS = value;
        mockSPN({
          save: (reqInit) =>
            jsonResponse({ job_id: 'spn2-ok', url: getArchivedUrl(reqInit) }),
        });
        await archiveUrlsFromText(`See https://env${value.length}.example.com`);
        // Status check must not be silently skipped
        expect(statusCalls().length).toBeGreaterThan(0);
      }
    );

    it('gives up on a URL after the per-URL time budget so it cannot block the queue for long', async () => {
      const realBudget = process.env.ARCHIVE_URL_BUDGET_MS;
      const realBase = process.env.ARCHIVE_RETRY_BASE_MS;
      process.env.ARCHIVE_URL_BUDGET_MS = '60';
      process.env.ARCHIVE_RETRY_BASE_MS = '40'; // 40, 80, ... > 60 budget
      try {
        mockSPN({
          save: () =>
            jsonResponse({
              status: 'error',
              status_ext: 'error:user-session-limit',
            }),
        });
        const [result] = await archiveUrlsFromText(
          'See https://budget.example.com'
        );
        expect(saveCalls().length).toBeGreaterThanOrEqual(1);
        expect(saveCalls().length).toBeLessThan(5);
        expect(result.status_ext).toBe('error:user-session-limit');
      } finally {
        if (realBudget === undefined) delete process.env.ARCHIVE_URL_BUDGET_MS;
        else process.env.ARCHIVE_URL_BUDGET_MS = realBudget;
        process.env.ARCHIVE_RETRY_BASE_MS = realBase;
      }
    });

    it('stops waiting for a free slot once the per-URL time budget is used up', async () => {
      const realBudget = process.env.ARCHIVE_URL_BUDGET_MS;
      const realPoll = process.env.ARCHIVE_STATUS_POLL_MS;
      process.env.ARCHIVE_URL_BUDGET_MS = '60';
      process.env.ARCHIVE_STATUS_POLL_MS = '20';
      try {
        mockSPN({
          status: () =>
            jsonResponse({ ...FREE_STATUS, processing: 3, available: 0 }),
          save: (reqInit) =>
            jsonResponse({ job_id: 'spn2-ok', url: getArchivedUrl(reqInit) }),
        });
        const [result] = await archiveUrlsFromText(
          'See https://slots.example.com'
        );
        // Default would poll 24 times; budget allows only a few
        expect(statusCalls().length).toBeLessThan(10);
        expect(result.job_id).toBe('spn2-ok');
      } finally {
        if (realBudget === undefined) delete process.env.ARCHIVE_URL_BUDGET_MS;
        else process.env.ARCHIVE_URL_BUDGET_MS = realBudget;
        process.env.ARCHIVE_STATUS_POLL_MS = realPoll;
      }
    });
  });
  describe('request timeout', () => {
    /** A fetch that never answers, but honors the abort signal like real fetch */
    const hang = (reqInit?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        reqInit?.signal?.addEventListener('abort', () =>
          reject(reqInit.signal?.reason)
        );
      });

    it('aborts a hung POST and retries it as a network error', async () => {
      process.env.ARCHIVE_REQUEST_TIMEOUT_MS = '20';
      let calls = 0;
      mockedFetch.mockImplementation(async (url, reqInit) => {
        if (
          String(url).startsWith('https://web.archive.org/save/status/user')
        ) {
          return jsonResponse(FREE_STATUS);
        }
        calls += 1;
        if (calls < 3) return hang(reqInit);
        return jsonResponse({
          job_id: 'spn2-ok',
          url: getArchivedUrl(reqInit),
        });
      });

      const [result] = await archiveUrlsFromText(
        'See https://hang.example.com'
      );
      expect(saveCalls()).toHaveLength(3);
      expect(result.job_id).toBe('spn2-ok');
    });

    it('gives up with a network error when every attempt hangs', async () => {
      process.env.ARCHIVE_REQUEST_TIMEOUT_MS = '10';
      mockedFetch.mockImplementation(async (url, reqInit) => {
        if (
          String(url).startsWith('https://web.archive.org/save/status/user')
        ) {
          return jsonResponse(FREE_STATUS);
        }
        return hang(reqInit);
      });

      const [result] = await archiveUrlsFromText(
        'See https://hang2.example.com'
      );
      expect(saveCalls()).toHaveLength(5);
      expect(result.status_ext).toBe('error:network');
    });

    it('submits anyway when the status check hangs', async () => {
      process.env.ARCHIVE_REQUEST_TIMEOUT_MS = '20';
      mockedFetch.mockImplementation(async (url, reqInit) => {
        if (
          String(url).startsWith('https://web.archive.org/save/status/user')
        ) {
          return hang(reqInit);
        }
        return jsonResponse({
          job_id: 'spn2-ok',
          url: getArchivedUrl(reqInit),
        });
      });

      const [result] = await archiveUrlsFromText(
        'See https://hang3.example.com'
      );
      expect(saveCalls()).toHaveLength(1);
      expect(result.job_id).toBe('spn2-ok');
    });

    it.each([
      [''],
      ['abc'],
      ['0'],
      ['-1'],
      ['1.5'],
      ['0.5'],
      ['1e10'],
      ['Infinity'],
    ])(
      'does not break requests when ARCHIVE_REQUEST_TIMEOUT_MS is %p',
      async (value) => {
        process.env.ARCHIVE_REQUEST_TIMEOUT_MS = value;
        mockSPN({
          save: (reqInit) =>
            jsonResponse({ job_id: 'spn2-ok', url: getArchivedUrl(reqInit) }),
        });
        const [result] = await archiveUrlsFromText(
          `See https://timeout${value.length}.example.com`
        );
        expect(result.job_id).toBe('spn2-ok');
        // The status check must not be silently skipped, and the POST must be sent with a signal
        expect(statusCalls().length).toBeGreaterThan(0);
        expect(saveCalls()[0][1]?.signal).toBeInstanceOf(AbortSignal);
      }
    );
  });
  describe('retries of JSON error responses without status_ext', () => {
    it.each([[502], [503], [429], [408]])(
      'retries HTTP %p with a message-only JSON body',
      async (httpStatus) => {
        let calls = 0;
        mockSPN({
          save: (reqInit) => {
            calls += 1;
            if (calls === 1) {
              return jsonResponse({ message: 'Bad Gateway' }, httpStatus);
            }
            return jsonResponse({
              job_id: 'spn2-ok',
              url: getArchivedUrl(reqInit),
            });
          },
        });
        const [result] = await archiveUrlsFromText(
          `See https://json${httpStatus}.example.com`
        );
        expect(saveCalls()).toHaveLength(2);
        expect(result.job_id).toBe('spn2-ok');
      }
    );

    it('keeps the status_ext SPN2 sent, even on a 5xx', async () => {
      mockSPN({
        save: () =>
          jsonResponse(
            { status: 'error', status_ext: 'error:blocked-url' },
            503
          ),
      });
      const [result] = await archiveUrlsFromText(
        'See https://own-ext.example.com'
      );
      expect(saveCalls()).toHaveLength(1);
      expect(result.status_ext).toBe('error:blocked-url');
    });
  });

  describe('retry budget', () => {
    it('with the default backoff-to-budget ratio, makes 4 attempts (the 5th would exceed the budget)', async () => {
      // Same ratio as the defaults: base 15 : budget 180 -> attempts at 0, 15, 45, 105;
      // the next delay (120) would end at 225 > 180.
      process.env.ARCHIVE_RETRY_BASE_MS = '15';
      process.env.ARCHIVE_URL_BUDGET_MS = '180';
      mockSPN({
        save: () =>
          jsonResponse({
            status: 'error',
            status_ext: 'error:user-session-limit',
          }),
      });
      await archiveUrlsFromText('See https://ratio.example.com');
      expect(saveCalls()).toHaveLength(4);
    });
  });
});
