/** Extract URLs from text and send to Internet Archive Wayback Machine */

import urlRegex from 'url-regex-safe';
import { removeFBCLIDIfExist } from './scrapUrls';

/**
 * SPN2 response. Successful requests return `job_id`; errors return
 * `status: 'error'` with `status_ext`, or just a `message` (e.g. auth errors).
 * @see https://docs.google.com/document/d/1Nsv52MvSjbLb2PCpHlat0gkzw0EvtSgpKHu4mk0MnrA/edit
 */
export type SPNResult = {
  url?: string;
  job_id?: string;
  status?: string;
  status_ext?: string;
  message?: string;
};

/**
 * SPN2 limits each account to a few captures in progress at the same time
 * (3 for our account). A slot is held until IA finishes capturing the page, not
 * until the POST returns, so limiting concurrent POSTs alone cannot avoid
 * `error:user-session-limit`.
 *
 * Following IA's recommendation, we:
 * 1. submit URLs one at a time through a single queue;
 * 2. before each submission, ask `/save/status/user` how many slots are
 *    `available`, wait while there are none, and stop for the day once
 *    `daily_captures_limit` is reached;
 * 3. still retry with exponential backoff when SPN2 reports a temporary error
 *    (session limit, overload, 5xx / 408 / 429 responses that are not JSON,
 *    network errors), as the status check can be stale or fail;
 * 4. time out each request to SPN2 (30 seconds by default), and give up on a
 *    URL after a time budget (3 minutes by default), so one URL
 *    that keeps failing cannot hold up every URL queued behind it.
 *
 * The queue lives in memory; pending URLs are lost on restart.
 */
const MAX_ATTEMPTS = 5;

/** Errors worth retrying later. Others (blocked URL, auth, etc) are final. */
const RETRYABLE_STATUS_EXT = new Set([
  'error:user-session-limit',
  'error:too-many-requests',
  'error:host-crawling-paused',
  'error:cannot-fetch',
  'error:celery',
  'error:internal-server-error',
  'error:no-browsers-available',
  'error:network',
]);

/**
 * Read a positive number from env.
 * Empty, non-numeric, zero or negative values fall back to the default; a bad
 * value must not silently turn off throttling or backoff.
 */
function positiveNumberFromEnv(name: string, defaultValue: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

/** Base delay for retries; doubles each attempt (15s, 30s, 60s, 120s by default) */
function getRetryBaseMs() {
  return positiveNumberFromEnv('ARCHIVE_RETRY_BASE_MS', 15_000);
}

/**
 * Timeout for each request to SPN2. A POST normally returns in about a second
 * because SPN2 only queues the capture; without a timeout a hung connection
 * would stall the serial queue and the time budget below would not help.
 */
function getRequestTimeoutMs() {
  return positiveNumberFromEnv('ARCHIVE_REQUEST_TIMEOUT_MS', 30_000);
}

/** Total time one URL may spend in the queue (waiting for slots + retrying) */
function getUrlBudgetMs() {
  return positiveNumberFromEnv('ARCHIVE_URL_BUDGET_MS', 180_000);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How often to re-check `/save/status/user` while no slot is available */
function getStatusPollMs() {
  return positiveNumberFromEnv('ARCHIVE_STATUS_POLL_MS', 5_000);
}

/** Give up waiting for a slot after this many checks and let the POST decide */
function getStatusMaxPolls() {
  return positiveNumberFromEnv('ARCHIVE_STATUS_MAX_POLLS', 24);
}

type UserStatus = {
  processing: number;
  available: number;
  daily_captures: number;
  daily_captures_limit: number;
};

const SPN_AUTH_HEADER = () =>
  `LOW ${process.env.INTERNET_ARCHIVE_S3_ACCESS_KEY}:${process.env.INTERNET_ARCHIVE_S3_SECRET_KEY}`;

/** @returns null if the status cannot be determined */
async function getUserStatus(): Promise<UserStatus | null> {
  try {
    const resp = await fetch(
      // Query string avoids stale cached response, see SPN2 docs
      `https://web.archive.org/save/status/user?_t=${Date.now()}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: SPN_AUTH_HEADER(),
        },
        signal: AbortSignal.timeout(getRequestTimeoutMs()),
      }
    );
    if (!resp.ok) return null;
    const status = await resp.json();
    if (
      typeof status?.available !== 'number' ||
      typeof status?.daily_captures !== 'number' ||
      typeof status?.daily_captures_limit !== 'number'
    ) {
      return null;
    }
    return status;
  } catch {
    return null;
  }
}

/**
 * Wait until SPN2 has a free slot.
 * If the status is unavailable, no slot frees up in time, or the URL's time
 * budget (`deadline`, epoch ms) is used up, proceed anyway; the POST and its
 * retry will handle it.
 */
async function waitForSlot(deadline: number): Promise<'ok' | 'daily-limit'> {
  for (let i = 0; i < getStatusMaxPolls(); i += 1) {
    const status = await getUserStatus();
    if (!status) return 'ok';
    if (status.daily_captures >= status.daily_captures_limit) {
      return 'daily-limit';
    }
    if (status.available > 0) return 'ok';
    if (Date.now() + getStatusPollMs() > deadline) return 'ok';
    await sleep(getStatusPollMs());
  }
  return 'ok';
}

async function submitOnce(url: string): Promise<SPNResult> {
  const formData = new FormData();
  formData.append('url', url);
  formData.append('capture_screenshot', '1');
  formData.append('skip_first_archive', '1');
  formData.append('delay_wb_availability', '1'); // Help reduce load on IA servers

  let resp: Response;
  try {
    resp = await fetch('https://web.archive.org/save', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: SPN_AUTH_HEADER(),
      },
      body: formData,
      // Also covers reading the response body below
      signal: AbortSignal.timeout(getRequestTimeoutMs()),
    });
  } catch (e) {
    return {
      status: 'error',
      status_ext: 'error:network',
      message: e instanceof Error ? e.message : String(e),
    };
  }

  let body: string;
  try {
    body = await resp.text();
  } catch (e) {
    // Connection dropped while reading the response
    return {
      status: 'error',
      status_ext: 'error:network',
      message: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const parsed = JSON.parse(body);
    // `null`, numbers, strings and arrays are valid JSON but not SPN2 results
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fall through to the non-JSON handling below
  }

  // Not JSON, e.g. an HTML error page from a proxy. Only temporary conditions
  // are worth retrying.
  let statusExt = 'error:non-json';
  if (resp.status >= 500) statusExt = 'error:internal-server-error';
  else if (resp.status === 408 || resp.status === 429) {
    statusExt = 'error:too-many-requests';
  }
  return {
    status: 'error',
    status_ext: statusExt,
    message: `HTTP ${resp.status}: ${body.slice(0, 200)}`,
  };
}

async function submitWithRetry(url: string): Promise<SPNResult> {
  let result: SPNResult = {};
  const deadline = Date.now() + getUrlBudgetMs();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if ((await waitForSlot(deadline)) === 'daily-limit') {
      result = {
        status: 'error',
        status_ext: 'error:daily-limit-reached',
        message: 'daily_captures_limit reached; will not submit until tomorrow',
      };
      break;
    }

    result = await submitOnce(url);
    const retryable =
      !result.job_id && RETRYABLE_STATUS_EXT.has(result.status_ext ?? '');
    if (!retryable || attempt === MAX_ATTEMPTS) break;

    const delay = getRetryBaseMs() * 2 ** (attempt - 1);
    if (Date.now() + delay > deadline) break; // Out of time budget
    await sleep(delay);
  }

  if (result.job_id) {
    console.info(`[archiveUrlsFromText] [ ${url} ]: ${result.job_id}`);
  } else {
    console.error(
      `[archiveUrlsFromText] [ ${url} ]: ${JSON.stringify(result)}`
    );
  }
  return result;
}

/** Tail of the queue; each submission starts after the previous one settles. */
let queueTail: Promise<unknown> = Promise.resolve();

/** URL -> pending result, so the same URL is not queued twice */
const pending = new Map<string, Promise<SPNResult>>();

function enqueue(url: string): Promise<SPNResult> {
  const existing = pending.get(url);
  if (existing) return existing;

  const job = queueTail.then(() => submitWithRetry(url));
  queueTail = job.catch(() => undefined);
  pending.set(url, job);
  job.finally(() => pending.delete(url)).catch(() => undefined);
  return job;
}

export default async function archiveUrlsFromText(
  text: string
): Promise<SPNResult[]> {
  const originalUrls = text.match(urlRegex({ strict: true })) || [];
  if (originalUrls.length === 0) return [];

  // Normalize URLs before sending to cache or scrapper to increase cache hit
  //
  const normalizedUrls = removeFBCLIDIfExist(originalUrls);

  console.info(`[archiveUrlsFromText] Archiving ${normalizedUrls.length} URLs`);
  return Promise.all(normalizedUrls.map(enqueue));
}
