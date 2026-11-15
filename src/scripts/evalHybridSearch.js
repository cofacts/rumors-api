/*
  Measures text search quality of ListArticles: BM25-only vs hybrid (BM25 + kNN),
  on a copy of production data.

  Relevance comes from the data itself: two TEXT articles that share a NORMAL
  articleReply (same replyId) are the same rumor, so searching with the text of
  one should find the other.

  Usage (against a restored snapshot, never production):

    # 1. Sample the queries and their relevant articles
    ELASTICSEARCH_URL=http://localhost:62225 \
      node build/scripts/evalHybridSearch.js build --out eval/ [--queries 300]

    # 2. Make sure the articles to search have embeddings
    #    (scripts/migrations/backfillVertexEmbeddings)

    # 3. Run every setting through the ListArticles resolver
    ELASTICSEARCH_URL=http://localhost:62225 \
      node build/scripts/evalHybridSearch.js run --out eval/ [--cachedUrlsOnly]

  `run` writes eval/results.json and prints a markdown table. Query embeddings
  are created (and cached) through the resolver, so it calls Vertex AI once per
  new query text.

  --cachedUrlsOnly: treat URLs that are not in the `urls` index as unscrapable,
  for when url-resolver is not running. Otherwise a search with such a URL fails.
*/

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import Module from 'module';
import yargs from 'yargs';

import client from 'util/client';
import getAllDocs from 'util/getAllDocs';

const USER = { id: 'search-eval', appId: 'RUMORS_SITE' };
const K = 10;
const CONCURRENCY = 8;

// Replies linked to more articles than this are generic ("this is spam"); they
// do not tell that two articles are the same rumor.
const MAX_CLUSTER = 30;
const MIN_QUERY_LENGTH = 20;

const TEXT_FILTER = [
  { term: { articleType: 'TEXT' } },
  { term: { status: 'NORMAL' } },
];

/* istanbul ignore next */
function seededRandom(seed) {
  // mulberry32
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {Map<string, Set<string>>} replyToArticles - replyId -> article IDs
 * @returns {Map<string, Set<string>>} article ID -> the other articles sharing a reply with it
 */
export function getRelatedArticles(replyToArticles) {
  const related = new Map();
  for (const articleIds of replyToArticles.values()) {
    if (articleIds.size < 2 || articleIds.size > MAX_CLUSTER) continue;
    for (const id of articleIds) {
      if (!related.has(id)) related.set(id, new Set());
      for (const other of articleIds) {
        if (other !== id) related.get(id).add(other);
      }
    }
  }
  return related;
}

/**
 * @param {{id: string, relevant: string[]}} query
 * @param {string[]} resultIds - in rank order
 */
export function scoreQuery(query, resultIds) {
  // The query article itself is searchable; a new message would not be.
  const ids = resultIds.filter((id) => id !== query.id).slice(0, K);
  const relevant = new Set(query.relevant);
  const firstRank = ids.findIndex((id) => relevant.has(id)) + 1; // 0: not found
  return {
    ids,
    firstRank,
    recall: ids.filter((id) => relevant.has(id)).length / relevant.size,
  };
}

export function summarize(rows) {
  const n = rows.length;
  const avg = (fn) => rows.reduce((sum, r) => sum + fn(r), 0) / n;
  const hit = (k) => avg((r) => r.firstRank >= 1 && r.firstRank <= k);
  const sorted = (fn) => rows.map(fn).sort((a, b) => a - b);
  const ms = sorted((r) => r.ms);
  return {
    hit1: hit(1),
    hit5: hit(5),
    hit10: hit(K),
    recall10: avg((r) => r.recall),
    mrr10: avg((r) => (r.firstRank ? 1 / r.firstRank : 0)),
    zeroResult: avg((r) => r.total === 0),
    medianTotal: sorted((r) => r.total)[Math.floor(n / 2)],
    p50ms: ms[Math.floor(n * 0.5)],
    p95ms: ms[Math.floor(n * 0.95)],
  };
}

/* istanbul ignore next */
async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

/* istanbul ignore next */
async function build({ out, queries: queryCount, seed }) {
  const texts = new Map();
  const replyToArticles = new Map();
  for await (const { _id, _source } of getAllDocs(
    'articles',
    {
      bool: {
        filter: [
          ...TEXT_FILTER,
          { range: { normalArticleReplyCount: { gte: 1 } } },
        ],
      },
    },
    { size: 5000 }
  )) {
    texts.set(_id, _source.text || '');
    for (const ar of _source.articleReplies || []) {
      if (ar.status !== 'NORMAL') continue;
      if (!replyToArticles.has(ar.replyId))
        replyToArticles.set(ar.replyId, new Set());
      replyToArticles.get(ar.replyId).add(_id);
    }
  }

  const related = getRelatedArticles(replyToArticles);
  const candidates = [...related.keys()].filter(
    (id) => texts.get(id).trim().length >= MIN_QUERY_LENGTH
  );

  // Shuffle, then take queries whose clusters do not overlap each other.
  const random = seededRandom(seed);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const taken = new Set();
  const queries = [];
  for (const id of candidates) {
    if (queries.length >= queryCount) break;
    if (taken.has(id)) continue;
    const relevant = [...related.get(id)].sort();
    queries.push({ id, text: texts.get(id), relevant });
    [id, ...relevant].forEach((x) => taken.add(x));
  }

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, 'queries.json'),
    JSON.stringify(queries, null, 2)
  );
  console.info(
    `[eval] ${texts.size} TEXT articles with replies, ${candidates.length} candidates, ${queries.length} queries -> ${out}/queries.json`
  );
}

/* istanbul ignore next */
function useCachedUrlsOnly() {
  const filename = require.resolve('util/grpc');
  const stub = new Module(filename);
  stub.filename = filename;
  stub.loaded = true;
  stub.exports = {
    __esModule: true,
    default: async (urls) =>
      urls.map((url) => ({ url, title: '', summary: '', status: 'ERROR' })),
  };
  require.cache[filename] = stub;
}

/* istanbul ignore next */
async function run({ out, cachedUrlsOnly, similarities, numCandidates }) {
  if (cachedUrlsOnly) useCachedUrlsOnly();

  // Loaded after the stub above, so that scrapUrls picks it up.
  const { graphql } = require('graphql');
  const { default: schema } = require('graphql/schema');
  const { default: DataLoaders } = require('graphql/dataLoaders');
  const {
    getCachedEmbedding,
    getQueryEmbeddingCacheId,
  } = require('util/embedding');

  const queries = JSON.parse(
    fs.readFileSync(path.join(out, 'queries.json'), 'utf8')
  );

  const LIST_ARTICLES = `
    query ($filter: ListArticleFilter, $first: Int) {
      ListArticles(filter: $filter, orderBy: [{ _score: DESC }], first: $first) {
        totalCount
        edges {
          node {
            id
          }
        }
      }
    }
  `;

  async function searchArticles(q, embedding) {
    const filter = { moreLikeThis: { like: q.text } };
    if (embedding != null) filter.embedding = embedding;
    const start = Date.now();
    const { data, errors } = await graphql({
      schema,
      source: LIST_ARTICLES,
      contextValue: { loaders: new DataLoaders(), user: USER },
      variableValues: { filter, first: K + 1 },
    });
    if (errors) throw new Error(JSON.stringify(errors));
    return {
      ids: data.ListArticles.edges.map(({ node }) => node.id),
      total: data.ListArticles.totalCount,
      ms: Date.now() - start,
    };
  }

  async function queryVector(q) {
    const chunks = await getCachedEmbedding(
      { id: getQueryEmbeddingCacheId(q.text), type: 'text' },
      { role: 'query' }
    );
    return chunks?.[0]?.vector;
  }

  // Raw kNN on the nested vectors, approximate (HNSW) or exact (brute force).
  async function searchKnn(q, { numCandidates: candidates, exact }) {
    const vector = await queryVector(q);
    const start = Date.now();
    const res = await client.search({
      index: 'articles',
      size: K + 1,
      _source: false,
      query: {
        nested: {
          path: 'embeddings',
          score_mode: 'max',
          query: exact
            ? {
                script_score: {
                  query: { match_all: {} },
                  script: {
                    source:
                      "cosineSimilarity(params.v, 'embeddings.vector') + 1.0",
                    params: { v: vector },
                  },
                },
              }
            : {
                knn: {
                  field: 'embeddings.vector',
                  query_vector: vector,
                  k: K + 1,
                  num_candidates: candidates,
                },
              },
        },
      },
    });
    return { ids: res.hits.hits.map((h) => h._id), ms: Date.now() - start };
  }

  // Creates and caches every query embedding through the resolver, so the
  // timed runs below measure the search, not the first Vertex AI call.
  console.info('[eval] warm-up: creating query embeddings');
  await pool(queries, (q) => searchArticles(q, similarities[0]));

  const settings = [
    { name: 'bm25', run: (q) => searchArticles(q, null) },
    ...similarities.map((s) => ({
      name: `hybrid@${s}`,
      run: (q) => searchArticles(q, s),
    })),
  ];

  const results = { summary: {}, knnRecall: {}, queries: {} };
  for (const { name, run: search } of settings) {
    const rows = await pool(queries, async (q) => {
      const result = await search(q);
      return {
        ...scoreQuery(q, result.ids),
        // Without the query article itself, as scoreQuery does for the ids
        total: result.total - (result.ids.includes(q.id) ? 1 : 0),
        ms: result.ms,
      };
    });
    results.summary[name] = summarize(rows);
    rows.forEach((r, i) => {
      results.queries[queries[i].id] = {
        ...results.queries[queries[i].id],
        [name]: { firstRank: r.firstRank, total: r.total, ids: r.ids },
      };
    });
    console.info(`[eval] ${name}`, JSON.stringify(results.summary[name]));
  }

  // HNSW recall: how much of the exact top 10 the approximate search returns.
  const exact = await pool(queries, (q) => searchKnn(q, { exact: true }));
  for (const candidates of numCandidates) {
    const approx = await pool(queries, (q) =>
      searchKnn(q, { numCandidates: candidates })
    );
    const overlap = (a, b) => {
      const top = new Set(b.slice(0, K));
      return a.slice(0, K).filter((id) => top.has(id)).length / top.size;
    };
    const ms = approx.map((r) => r.ms).sort((a, b) => a - b);
    results.knnRecall[candidates] = {
      recallVsExact:
        approx.reduce((sum, r, i) => sum + overlap(r.ids, exact[i].ids), 0) /
        queries.length,
      p50ms: ms[Math.floor(ms.length / 2)],
      p95ms: ms[Math.floor(ms.length * 0.95)],
    };
    console.info(
      `[eval] knn num_candidates=${candidates}`,
      JSON.stringify(results.knnRecall[candidates])
    );
  }

  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results));

  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.info(
    [
      '',
      '| setting | Hit@1 | Hit@5 | Hit@10 | Recall@10 | MRR@10 | no results | median totalCount | p50 ms | p95 ms |',
      '|---|---|---|---|---|---|---|---|---|---|',
      ...Object.entries(results.summary).map(
        ([name, s]) =>
          `| ${name} | ${pct(s.hit1)} | ${pct(s.hit5)} | ${pct(
            s.hit10
          )} | ${pct(s.recall10)} | ${s.mrr10.toFixed(3)} | ${pct(
            s.zeroResult
          )} | ${s.medianTotal} | ${s.p50ms} | ${s.p95ms} |`
      ),
      '',
      '| num_candidates | recall vs exact kNN | p50 ms | p95 ms |',
      '|---|---|---|---|',
      ...Object.entries(results.knnRecall).map(
        ([n, r]) =>
          `| ${n} | ${pct(r.recallVsExact)} | ${r.p50ms} | ${r.p95ms} |`
      ),
    ].join('\n')
  );
}

/* istanbul ignore if */
if (require.main === module) {
  const toNumbers = (s) => String(s).split(',').map(Number);
  const argv = yargs
    .command('build', 'Sample queries and their relevant articles', {
      queries: { type: 'number', default: 300 },
      seed: { type: 'number', default: 20261026 },
    })
    .command('run', 'Run every setting through ListArticles', {
      cachedUrlsOnly: { type: 'boolean', default: false },
      similarities: {
        description: 'Minimum cosine similarity of each hybrid setting',
        default: '0.6,0.65,0.7,0.75,0.8',
        coerce: toNumbers,
      },
      numCandidates: {
        description: 'kNN num_candidates to measure HNSW recall with',
        default: '100,200,500',
        coerce: toNumbers,
      },
    })
    .options({
      out: { type: 'string', demandOption: true, description: 'Data dir' },
    })
    .demandCommand(1)
    .help('help').argv;

  const [command] = argv._;
  (command === 'build' ? build(argv) : run(argv))
    .then(() => client.close())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
