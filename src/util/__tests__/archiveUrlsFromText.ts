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

describe('archiveUrlsFromText', () => {
  let realEnvs: { [key: string]: string | undefined };
  let mockedFetch: jest.Spied<typeof fetch>;
  beforeAll(() => {
    // Spy on and mock the global fetch function
    mockedFetch = jest.spyOn(global, 'fetch');
    mockedFetch.mockImplementation(async (url) => {
      // Make Tyepscript happy
      if (typeof url !== 'string')
        throw new Error(
          'Fetch with non-string URL is not implemented in unit test'
        );

      // Extract URL to archive from fetched URL
      const params = new URL(url).searchParams;
      const urlToArchive = params.get('url');

      return {
        json: async () => ({ job_id: '123', url: urlToArchive }),
      } as Response;
    });

    realEnvs = {
      INTERNET_ARCHIVE_S3_ACCESS_KEY:
        process.env.INTERNET_ARCHIVE_S3_ACCESS_KEY,
      INTERNET_ARCHIVE_S3_SECRET_KEY:
        process.env.INTERNET_ARCHIVE_S3_SECRET_KEY,
    };

    process.env.INTERNET_ARCHIVE_S3_ACCESS_KEY = 'test-access-key';
    process.env.INTERNET_ARCHIVE_S3_SECRET_KEY = 'test-secret';
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
  });

  it('expect URL in text are archived', async () => {
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
    expect(mockedFetch.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "https://web.archive.org/save?url=https%3A%2F%2Fexample.com%2F&capture_screenshot=1&skip_first_archive=1&delay_wb_availability=1",
          Object {
            "headers": Object {
              "Accept": "application/json",
              "Authorization": "LOW test-access-key:test-secret",
            },
            "method": "POST",
          },
        ],
        Array [
          "https://web.archive.org/save?url=https%3A%2F%2Fexample2.com%2F%3Ffoo%3Dbar&capture_screenshot=1&skip_first_archive=1&delay_wb_availability=1",
          Object {
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

  it('do nothing if no URL in text', async () => {
    const text = 'No URL here';
    const results = await archiveUrlsFromText(text);
    expect(results).toEqual([]);
    expect(mockedFetch).not.toBeCalled();
  });
});
