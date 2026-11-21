/**
 * Re-submit URLs that should have been archived but have no Wayback snapshot.
 *
 * rumors-api archives the URLs in new articles and replies when they are
 * created (see util/archiveUrlsFromText). That can still miss URLs: the API
 * restarts while URLs are queued in memory, Save Page Now is down for a while,
 * or SPN2 accepts a capture that later fails.
 *
 * This script looks at articles and replies created in a past time window, asks
 * the Wayback CDX API whether each URL has a snapshot taken after the document
 * was created, and re-submits the URLs that do not.
 *
 * Captures are made with `delay_wb_availability=1`, so they show up in the
 * Wayback Machine (and CDX) only later. The SPN2 docs say about 12 hours, but in
 * 2026-11 it took about 4 days: of production captures accepted 29–87 hours
 * earlier, 0 of 22 were in CDX, while most accepted 94–126 hours earlier were.
 * The default window therefore covers documents created 15 to 7 days ago, and
 * the script is meant to run weekly; the extra day overlaps the previous run in
 * case a run is missed. A URL that keeps failing is re-submitted about once a
 * week while it stays in the window, so at most twice.
 *
 * Meant to run weekly from cron, e.g.
 *   docker compose exec -T api node build/scripts/archiveMissingUrls.js
 */
import 'dotenv/config';
import 'util/catchUnhandledRejection';

import yargs from 'yargs';

import getAllDocs from 'util/getAllDocs';
import delayForMs from 'util/delayForMs';
import {
  extractArchivableUrls,
  archiveUrls,
  type SPNResult,
} from 'util/archiveUrlsFromText';

const CDX_ENDPOINT = 'https://web.archive.org/cdx/search/cdx';
const CDX_TIMEOUT_MS = 30_000;

/**
 * Stop asking CDX after this many failed lookups in a row; it is most likely
 * rate limiting us, and continuing would make it worse.
 */
const MAX_CONSECUTIVE_CDX_FAILURES = 5;

/**
 * If at least this many URLs were checked and none has a snapshot, assume the
 * captures are not visible in CDX yet rather than missing, and re-submit
 * nothing. With `delay_wb_availability=1`, captures have taken about 4 days to
 * show up in CDX (observed 2026-11-21), not the ~12 hours the SPN2 docs state.
 * In normal operation some URLs in the window (news sites, government pages)
 * always have snapshots.
 */
const MIN_CHECKED_FOR_LAG_GUARD = 10;

/** Fields that rumors-api passes to archiveUrlsFromText, per index */
const SOURCES = [
  { index: 'articles', fields: ['text'] },
  { index: 'replies', fields: ['text', 'reference'] },
] as const;

type Options = {
  /** Start of the window, in hours before now */
  fromHours?: number;
  /** End of the window, in hours before now */
  toHours?: number;
  /** Only report the URLs that would be re-submitted */
  dryRun?: boolean;
  /** Pause between CDX lookups, to be polite to the Wayback Machine */
  cdxDelayMs?: number;
  /** Re-submit even when no URL in the window has a snapshot */
  force?: boolean;
};

type Summary = {
  docs: number;
  urls: number;
  withSnapshot: number;
  missing: string[];
  /** URLs whose CDX lookup failed; not re-submitted */
  unknown: number;
  /** Set when lookups stopped early because CDX kept failing */
  abortedLookups: boolean;
  /** Set when nothing was re-submitted because no URL had a snapshot */
  skippedLikelyLag: boolean;
  /** Outcome of each re-submission (job_id or status_ext), unless dryRun */
  resubmitted: Record<string, number>;
};

/** Wayback timestamp: YYYYMMDDhhmmss in UTC */
export function toWaybackTimestamp(date: Date) {
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/**
 * Whether the Wayback Machine has a capture of `url` taken at or after `since`.
 *
 * @returns null when the lookup fails, so the caller can tell "no snapshot"
 *   apart from "could not check".
 */
export async function hasSnapshotSince(
  url: string,
  since: Date
): Promise<boolean | null> {
  const params = new URLSearchParams({
    url,
    from: toWaybackTimestamp(since),
    limit: '1',
    output: 'json',
    fl: 'timestamp',
  });

  try {
    const resp = await fetch(`${CDX_ENDPOINT}?${params}`, {
      signal: AbortSignal.timeout(CDX_TIMEOUT_MS),
    });
    if (!resp.ok) return null;

    // `[]` when there is no capture; otherwise a header row and data rows,
    // e.g. [["timestamp"], ["20261106051832"]]
    const rows = await resp.json();
    if (!Array.isArray(rows)) return null;
    return rows.length > 1;
  } catch {
    return null;
  }
}

/**
 * URLs in documents created in the window, mapped to the earliest creation
 * time of a document that contains them.
 */
async function collectUrls(from: Date, to: Date) {
  const urlSince = new Map<string, Date>();
  let docs = 0;

  for (const { index, fields } of SOURCES) {
    const query = {
      range: {
        createdAt: { gte: from.toISOString(), lt: to.toISOString() },
      },
    };

    for await (const { _source } of getAllDocs<Record<string, unknown>>(
      index,
      query,
      { size: 100 }
    )) {
      docs += 1;
      const createdAt = new Date(_source.createdAt as string);

      for (const field of fields) {
        const value = _source[field];
        if (typeof value !== 'string') continue;

        for (const url of extractArchivableUrls(value)) {
          const since = urlSince.get(url);
          if (!since || createdAt < since) urlSince.set(url, createdAt);
        }
      }
    }
  }

  return { docs, urlSince };
}

async function archiveMissingUrls({
  fromHours = 360,
  toHours = 168,
  dryRun = false,
  cdxDelayMs = 3000,
  force = false,
}: Options = {}): Promise<Summary> {
  if (!(fromHours > toHours && toHours >= 0)) {
    throw new Error('fromHours must be greater than toHours, and toHours >= 0');
  }

  const now = Date.now();
  const from = new Date(now - fromHours * 3600_000);
  const to = new Date(now - toHours * 3600_000);
  const { docs, urlSince } = await collectUrls(from, to);

  console.info(
    `[archiveMissingUrls] ${
      urlSince.size
    } URLs in ${docs} articles and replies created ${from.toISOString()} – ${to.toISOString()}`
  );

  const missing: string[] = [];
  let withSnapshot = 0;
  let unknown = 0;
  let consecutiveFailures = 0;
  let abortedLookups = false;
  let lookups = 0;

  for (const [url, since] of urlSince) {
    if (lookups > 0) await delayForMs(cdxDelayMs);
    lookups += 1;

    const hasSnapshot = await hasSnapshotSince(url, since);
    if (hasSnapshot === null) {
      unknown += 1;
      consecutiveFailures += 1;
      console.error(`[archiveMissingUrls] CDX lookup failed: ${url}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_CDX_FAILURES) {
        console.error(
          `[archiveMissingUrls] ${consecutiveFailures} CDX lookups failed in a row; stopping lookups`
        );
        abortedLookups = true;
        break;
      }
      continue;
    }

    consecutiveFailures = 0;
    if (hasSnapshot) withSnapshot += 1;
    else missing.push(url);
  }

  console.info(
    `[archiveMissingUrls] with snapshot: ${withSnapshot}, missing: ${
      missing.length
    }, lookup failed: ${unknown}${
      abortedLookups
        ? ` (stopped early, ${urlSince.size - lookups} not checked)`
        : ''
    }`
  );

  // Nothing in the window has a snapshot: captures are most likely not visible
  // in CDX yet. Re-submitting everything would only create duplicate captures.
  const checked = withSnapshot + missing.length;
  const skippedLikelyLag =
    !force && checked >= MIN_CHECKED_FOR_LAG_GUARD && withSnapshot === 0;
  if (skippedLikelyLag) {
    console.error(
      `[archiveMissingUrls] none of the ${checked} checked URLs has a snapshot; captures are probably not visible in CDX yet. Not re-submitting (use --force to override, or move the window further back).`
    );
  }

  const resubmitted: Record<string, number> = {};
  if (dryRun || skippedLikelyLag) {
    missing.forEach((url) =>
      console.info(`[archiveMissingUrls] missing: ${url}`)
    );
  } else {
    const results: SPNResult[] = await archiveUrls(missing);
    results.forEach((result) => {
      const key = result.job_id
        ? 'job_id'
        : result.status_ext || result.message || 'unknown';
      resubmitted[key] = (resubmitted[key] || 0) + 1;
    });
    console.info(
      `[archiveMissingUrls] re-submitted: ${JSON.stringify(resubmitted)}`
    );
  }

  return {
    docs,
    urls: urlSince.size,
    withSnapshot,
    missing,
    unknown,
    abortedLookups,
    skippedLikelyLag,
    resubmitted,
  };
}

export default archiveMissingUrls;

/* istanbul ignore if */
if (require.main === module) {
  const argv = yargs
    .options({
      fromHours: {
        description: 'Start of the window, in hours before now',
        type: 'number',
        default: 360,
      },
      toHours: {
        description:
          'End of the window, in hours before now. Delayed captures took ~4 days to appear in CDX in 2026-11.',
        type: 'number',
        default: 168,
      },
      dryRun: {
        description: 'Only list the URLs that would be re-submitted',
        type: 'boolean',
        default: false,
      },
      cdxDelayMs: {
        description: 'Pause between CDX lookups, in milliseconds',
        type: 'number',
        default: 3000,
      },
      force: {
        description:
          'Re-submit even when no URL in the window has a snapshot (normally a sign that captures are not visible in CDX yet)',
        type: 'boolean',
        default: false,
      },
    })
    .help('help')
    .parseSync();

  archiveMissingUrls(argv)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
