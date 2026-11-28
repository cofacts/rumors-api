/**
 * Clears login walls, error pages, etc. in title / summary of `urls` and
 * `hyperlinks` of articles & replies, batch by batch (cofacts/rumors-api#415).
 *
 * Rules are in cleanupPollutedTextRules.json, collected from fixed texts that appear on many
 * distinct URLs in the 2026-11-15 production snapshot.
 *
 * Each batch contains the changes matched by the same rule alternative (i.e. the same fixed text),
 * so that reviewing a few samples covers the whole batch. Workflow:
 *
 * 1. `plan`: scans DB, writes all candidate changes and a batch list to `--dir`.
 * 2. `apply --batch <id> --limit <n> --dry-run`: writes the changes to be made, without writing DB.
 * 3. `apply --batch <id> --limit <n>`: saves original values as backup, writes DB, then reads back
 *    to record which changes are done. Changes already attempted in previous runs are skipped,
 *    so running it repeatedly with growing limit gradually processes the whole batch.
 * 4. `restore --batch <id>`: writes the original values back for changes done by `apply`.
 *
 * Writes are conditional: a field is only changed if its current value equals what we expect,
 * so that docs updated by others after `plan` are left untouched.
 *
 * Usage (babel-node takes short options like -b, -l itself, so use long options only):
 *   node_modules/.bin/babel-node --extensions .ts,.js src/scripts/migrations/cleanupPollutedText.js plan
 *   node_modules/.bin/babel-node --extensions .ts,.js src/scripts/migrations/cleanupPollutedText.js \
 *     apply --batch <batch> --limit 20 --dry-run
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import yargs from 'yargs';

import client from 'util/client';
import getAllDocs from 'util/getAllDocs';
import delayForMs from 'util/delayForMs';
import { navPrefix, rules } from './cleanupPollutedTextRules.json';

const FIELDS = ['title', 'summary'];

const NAV_RE = new RegExp(navPrefix);

/**
 * Splits a regex source by top-level `|`, so that each alternative can be matched on its own.
 */
function splitAlternatives(pattern) {
  const alternatives = [];
  let depth = 0,
    inClass = false,
    start = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '\\') {
      i += 1;
    } else if (inClass) {
      if (ch === ']') inClass = false;
    } else if (ch === '[') {
      inClass = true;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
    } else if (ch === '|' && depth === 0) {
      alternatives.push(pattern.slice(start, i));
      start = i + 1;
    }
  }
  alternatives.push(pattern.slice(start));
  return alternatives;
}

const ALTERNATIVES = rules.flatMap(({ category, pattern, fields }) =>
  splitAlternatives(pattern).map((alternative) => ({
    category,
    fields,
    pattern: alternative,
    // Sticky flag anchors the match at start of field: fixed texts always lead the field
    re: new RegExp(alternative, 'y'),
  }))
);

/**
 * Login walls with real page content appended (e.g. FB page intro) are longer than this
 * and are kept for human / LLM review instead of being cleared.
 */
const LOGIN_WALL_MAX_LENGTH = 400;

/**
 * @param {string} text - title or summary of a scrapped URL
 * @param {'title'|'summary'} field - some rules (e.g. site names) only apply to specific fields
 * @returns {{category: string, pattern: string}|null} the matched rule alternative, if text is a known fixed text
 */
export function matchPollutedText(text, field) {
  const t = (text || '').trim().replace(NAV_RE, '');
  if (!t) return null;

  for (const { category, fields, pattern, re } of ALTERNATIVES) {
    if (fields && !fields.includes(field)) continue;
    re.lastIndex = 0;
    if (!re.test(t)) continue;

    if (
      category === 'login_wall' &&
      t.length > LOGIN_WALL_MAX_LENGTH &&
      !t.startsWith('See what')
    )
      return null;
    return { category, pattern };
  }
  return null;
}

// Lower-risk categories first
const CATEGORY_ORDER = [
  'error_page',
  'bot_block',
  'login_wall',
  'cookie_consent',
  'site_boilerplate',
  'site_name',
];

const URLS_SCRIPT = `
  boolean changed = false;
  for (def c : params.changes) {
    if (ctx._source[c.field] == c.from) { ctx._source[c.field] = c.to; changed = true; }
  }
  if (!changed) { ctx.op = 'noop'; }
`;

const HYPERLINKS_SCRIPT = `
  boolean changed = false;
  if (ctx._source.hyperlinks != null) {
    for (def h : ctx._source.hyperlinks) {
      for (def c : params.changes) {
        if (h.url == c.url && h[c.field] == c.from) { h[c.field] = c.to; changed = true; }
      }
    }
  }
  if (!changed) { ctx.op = 'noop'; }
`;

/**
 * Batch ID is stable across plans as long as the rule alternative is not changed.
 */
function getBatchId(category, pattern) {
  const hash = crypto
    .createHash('md5')
    .update(pattern)
    .digest('hex')
    .slice(0, 8);
  return `${category}-${hash}`;
}

function changeKey({ index, id, url, field }) {
  return `${index}/${id}/${url}/${field}`;
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJsonl(file, items) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, items.map((i) => JSON.stringify(i) + '\n').join(''));
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^(www|m|mobile|web)\./, '');
  } catch (e) {
    return '?';
  }
}

function* getCandidates(index, id, url, doc) {
  for (const field of FIELDS) {
    const value = doc[field];
    const match = matchPollutedText(value, field);
    if (!match) continue;
    yield {
      batch: getBatchId(match.category, match.pattern),
      category: match.category,
      pattern: match.pattern,
      index,
      id,
      url,
      field,
      value,
    };
  }
}

/**
 * Scans DB and writes candidates.jsonl & plan.json to dir.
 */
export async function plan({ dir }) {
  const candidates = [];

  for await (const { _id, _source } of getAllDocs('urls', undefined, {
    _source: ['url', ...FIELDS],
  })) {
    candidates.push(...getCandidates('urls', _id, _source.url, _source));
  }

  for (const index of ['articles', 'replies']) {
    for await (const { _id, _source } of getAllDocs(index, undefined, {
      _source: ['hyperlinks'],
    })) {
      for (const hyperlink of _source.hyperlinks || []) {
        candidates.push(...getCandidates(index, _id, hyperlink.url, hyperlink));
      }
    }
  }

  const batchMap = {};
  for (const c of candidates) {
    const b = (batchMap[c.batch] = batchMap[c.batch] || {
      batch: c.batch,
      category: c.category,
      pattern: c.pattern,
      changes: 0,
      byIndex: {},
      domains: {},
      sample: c.value.trim().slice(0, 100),
    });
    b.changes += 1;
    b.byIndex[c.index] = (b.byIndex[c.index] || 0) + 1;
    const domain = getDomain(c.url);
    b.domains[domain] = (b.domains[domain] || 0) + 1;
  }

  const batches = Object.values(batchMap)
    .map(({ domains, ...b }) => ({
      ...b,
      topDomains: Object.entries(domains)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    }))
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) -
          CATEGORY_ORDER.indexOf(b.category) || b.changes - a.changes
    );

  writeJsonl(path.join(dir, 'candidates.jsonl'), candidates);
  fs.writeFileSync(
    path.join(dir, 'plan.json'),
    JSON.stringify(batches, null, 2)
  );

  return { candidates: candidates.length, batches };
}

function getRunDirs(dir, batch) {
  const batchDir = path.join(dir, 'batches', batch);
  if (!fs.existsSync(batchDir)) return [];
  return fs
    .readdirSync(batchDir)
    .sort()
    .map((run) => path.join(batchDir, run));
}

function getCurrentValue(index, doc, { url, field }) {
  if (!doc) return undefined;
  if (index === 'urls') return doc[field];
  const hyperlink = (doc.hyperlinks || []).find((h) => h.url === url);
  return hyperlink ? hyperlink[field] : undefined;
}

/**
 * Conditionally writes changes ({index, id, url, field, from, to}) to DB, then reads back.
 *
 * @returns changes with `status`: 'done' if field is now `to`, otherwise 'skipped'
 */
async function writeChanges(changes, { bulkSize, delayMs }) {
  const docChanges = {};
  for (const c of changes) {
    const key = `${c.index}/${c.id}`;
    (docChanges[key] = docChanges[key] || []).push(c);
  }
  const docKeys = Object.keys(docChanges);
  const results = [];

  for (let i = 0; i < docKeys.length; i += bulkSize) {
    const keys = docKeys.slice(i, i + bulkSize);

    const operations = keys.flatMap((key) => {
      const [index, id] = key.split('/');
      return [
        { update: { _index: index, _id: id, retry_on_conflict: 3 } },
        {
          script: {
            source: index === 'urls' ? URLS_SCRIPT : HYPERLINKS_SCRIPT,
            params: {
              changes: docChanges[key].map(({ url, field, from, to }) => ({
                url,
                field,
                from,
                to,
              })),
            },
          },
        },
      ];
    });
    const bulkResult = await client.bulk({ operations });
    if (bulkResult.errors) {
      throw new Error(
        `Bulk update error: ${JSON.stringify(
          bulkResult.items.filter((item) => item.update.error)
        )}`
      );
    }

    // GET is realtime, no need to refresh before reading back
    const { docs } = await client.mget({
      docs: keys.map((key) => {
        const [index, id] = key.split('/');
        return { _index: index, _id: id, _source: ['hyperlinks', ...FIELDS] };
      }),
    });
    keys.forEach((key, idx) => {
      const [index] = key.split('/');
      for (const c of docChanges[key]) {
        const current = getCurrentValue(index, docs[idx]._source, c);
        results.push({ ...c, status: current === c.to ? 'done' : 'skipped' });
      }
    });

    if (i + bulkSize < docKeys.length) await delayForMs(delayMs);
  }

  return results;
}

function summarize(results) {
  return results.reduce((counts, { status }) => {
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

/**
 * Applies at most `limit` changes of the specified batch that are not attempted before.
 */
export async function apply({
  dir,
  batch,
  limit,
  dryRun = false,
  bulkSize = 100,
  delayMs = 1000,
  now = new Date(),
}) {
  const attempted = new Set(
    getRunDirs(dir, batch).flatMap((runDir) =>
      readJsonl(path.join(runDir, 'results.jsonl')).map(changeKey)
    )
  );

  const changes = readJsonl(path.join(dir, 'candidates.jsonl'))
    .filter((c) => c.batch === batch && !attempted.has(changeKey(c)))
    .slice(0, limit)
    .map(({ index, id, url, field, value }) => ({
      index,
      id,
      url,
      field,
      from: value,
      to: '',
    }));

  const runDir = path.join(
    dir,
    'batches',
    batch,
    `${now.toISOString().replace(/[:.]/g, '-')}-${dryRun ? 'dryrun' : 'apply'}`
  );

  // Backup: original values are kept in `from`
  writeJsonl(path.join(runDir, 'changes.jsonl'), changes);
  if (dryRun || changes.length === 0) {
    return { runDir, changes: changes.length };
  }

  const results = await writeChanges(changes, { bulkSize, delayMs });
  writeJsonl(path.join(runDir, 'results.jsonl'), results);
  return { runDir, changes: changes.length, ...summarize(results) };
}

/**
 * Writes original values back for all changes done by `apply` runs of the batch.
 */
export async function restore({
  dir,
  batch,
  bulkSize = 100,
  delayMs = 1000,
  now = new Date(),
}) {
  const changes = getRunDirs(dir, batch)
    .filter((runDir) => runDir.endsWith('-apply'))
    .flatMap((runDir) => readJsonl(path.join(runDir, 'results.jsonl')))
    .filter(({ status }) => status === 'done')
    .map(({ index, id, url, field, from, to }) => ({
      index,
      id,
      url,
      field,
      from: to,
      to: from,
    }));

  const runDir = path.join(
    dir,
    'batches',
    batch,
    `${now.toISOString().replace(/[:.]/g, '-')}-restore`
  );
  writeJsonl(path.join(runDir, 'changes.jsonl'), changes);
  if (changes.length === 0) return { runDir, changes: 0 };

  const results = await writeChanges(changes, { bulkSize, delayMs });
  writeJsonl(path.join(runDir, 'results.jsonl'), results);
  return { runDir, changes: changes.length, ...summarize(results) };
}

/* istanbul ignore if */
if (require.main === module) {
  const dirOption = {
    dir: {
      description: 'Directory for candidates, backups and results',
      type: 'string',
      default: 'loginwall-migration',
    },
  };
  const writeOptions = {
    batch: {
      description: 'Batch ID in plan.json',
      type: 'string',
      demandOption: true,
    },
    bulkSize: {
      description: 'Number of docs per bulk request',
      type: 'number',
      default: 100,
    },
    delayMs: {
      description: 'Delay between bulk requests',
      type: 'number',
      default: 1000,
    },
  };

  yargs
    .command('plan', 'Scan DB and list batches', dirOption, async (argv) => {
      const { candidates, batches } = await plan(argv);
      console.info(`${candidates} changes in ${batches.length} batches`);
      console.table(
        batches.map(({ batch, changes, byIndex, pattern }) => ({
          batch,
          changes,
          ...byIndex,
          pattern: pattern.slice(0, 40),
        }))
      );
    })
    .command(
      'apply',
      'Clear polluted fields of a batch',
      {
        ...dirOption,
        ...writeOptions,
        limit: {
          description: 'Max number of changes in this run',
          type: 'number',
          demandOption: true,
        },
        dryRun: {
          description: 'Only write changes.jsonl, do not write DB',
          type: 'boolean',
          default: false,
        },
      },
      async (argv) => console.info(await apply(argv))
    )
    .command(
      'restore',
      'Write original values back for a batch',
      { ...dirOption, ...writeOptions },
      async (argv) => console.info(await restore(argv))
    )
    .demandCommand(1)
    .strict()
    .help('help').argv;
}
