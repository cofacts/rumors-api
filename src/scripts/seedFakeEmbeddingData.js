/* eslint-disable no-console */
/**
 * Seed fake articles + replies (with 768-dim embedding vectors) into the
 * local dev Elasticsearch, for manually testing the kNN search path without
 * spending money on real Vertex AI embeddings.
 *
 * Two clusters are inserted:
 *   - "vaccine":  3 articles + 1 reply, vectors close to a shared center
 *   - "election": 3 articles + 1 reply, vectors orthogonal to "vaccine"
 *
 * Vectors are deterministic — re-running the script overwrites the same docs.
 * The query vectors printed at the end can be fed straight into an ES kNN
 * request to validate ranking (vaccine docs rank top for the vaccine vector,
 * election docs for the election vector).
 *
 * Usage (from host):
 *   ELASTICSEARCH_URL=http://localhost:62222 \
 *     npx babel-node --extensions .ts,.js src/scripts/seedFakeEmbeddingData.js
 *
 * Usage (inside docker compose):
 *   docker-compose run --rm api \
 *     npx babel-node --extensions .ts,.js src/scripts/seedFakeEmbeddingData.js
 */
import 'dotenv/config';
import client from 'util/client';

const DIMS = 768;

// Two deterministic, orthogonal cluster centers in 768-dim space.
// Cluster A occupies even-indexed dims, cluster B odd-indexed dims, so their
// cosine similarity is ~0 — easy to eyeball whether kNN picks the right side.
function buildCenter(parity) {
  const v = new Array(DIMS).fill(0);
  for (let i = parity; i < DIMS; i += 2) v[i] = 1;
  return normalize(v);
}

function normalize(v) {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

// Seeded PRNG (mulberry32) so noise is deterministic per doc id.
function rand(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cluster-relative vector: center + small noise. noise scale keeps cosine
// similarity within-cluster ≈ 0.9+, across-cluster ≈ 0.
function vectorFor(seedStr, center) {
  const rng = rand(seedStr);
  const noise = new Array(DIMS).fill(0).map(() => (rng() - 0.5) * 0.05);
  const v = center.map((x, i) => x + noise[i]);
  return normalize(v);
}

const VACCINE_CENTER = buildCenter(0);
const ELECTION_CENTER = buildCenter(1);

const NOW = new Date().toISOString();

function makeArticle(id, text, center) {
  return {
    text,
    createdAt: NOW,
    updatedAt: NOW,
    userId: 'fake-seed-user',
    appId: 'WEBSITE',
    articleType: 'TEXT',
    status: 'NORMAL',
    replyRequestCount: 1,
    normalArticleReplyCount: 0,
    normalArticleCategoryCount: 0,
    references: [],
    hyperlinks: [],
    articleReplies: [],
    articleCategories: [],
    contributors: [],
    embeddings: [{ vector: vectorFor(id, center) }],
  };
}

function makeReply(id, text, center) {
  return {
    type: 'NOT_RUMOR',
    createdAt: NOW,
    userId: 'fake-seed-user',
    appId: 'WEBSITE',
    text,
    embeddings: [{ vector: vectorFor(id, center) }],
  };
}

const articles = {
  'fake-vac-1': makeArticle(
    'fake-vac-1',
    '聽說最新的疫苗會讓 DNA 改變,大家不要打',
    VACCINE_CENTER
  ),
  'fake-vac-2': makeArticle(
    'fake-vac-2',
    '研究指出 mRNA 疫苗副作用嚴重,千萬不能注射',
    VACCINE_CENTER
  ),
  'fake-vac-3': makeArticle(
    'fake-vac-3',
    '醫師爆料:疫苗其實是政府控制人民的工具',
    VACCINE_CENTER
  ),
  'fake-elec-1': makeArticle(
    'fake-elec-1',
    '驚爆!選舉開票機被駭客動手腳,結果都是假的',
    ELECTION_CENTER
  ),
  'fake-elec-2': makeArticle(
    'fake-elec-2',
    '某候選人秘密金流流向境外,證據曝光',
    ELECTION_CENTER
  ),
  'fake-elec-3': makeArticle(
    'fake-elec-3',
    '投票所工作人員爆料計票過程舞弊',
    ELECTION_CENTER
  ),
};

const replies = {
  'fake-vac-reply-1': makeReply(
    'fake-vac-reply-1',
    'mRNA 疫苗不會改變 DNA,這是常見的錯誤迷思',
    VACCINE_CENTER
  ),
  'fake-elec-reply-1': makeReply(
    'fake-elec-reply-1',
    '中選會公告開票程序公開透明,並無此事',
    ELECTION_CENTER
  ),
};

async function main() {
  const operations = [];
  for (const [id, doc] of Object.entries(articles)) {
    operations.push({ index: { _index: 'articles', _id: id } });
    operations.push(doc);
  }
  for (const [id, doc] of Object.entries(replies)) {
    operations.push({ index: { _index: 'replies', _id: id } });
    operations.push(doc);
  }

  const result = await client.bulk({ operations, refresh: 'true' });
  if (result.errors) {
    console.error(JSON.stringify(result, null, 2));
    throw new Error('bulk insert had errors');
  }
  console.log(
    `Seeded ${Object.keys(articles).length} articles, ${
      Object.keys(replies).length
    } replies.`
  );
  console.log('\nQuery vectors (first 5 dims shown, full vector printed too):');
  const vaccineQuery = vectorFor('query-vaccine', VACCINE_CENTER);
  const electionQuery = vectorFor('query-election', ELECTION_CENTER);
  console.log('  vaccine head :', vaccineQuery.slice(0, 5));
  console.log('  election head:', electionQuery.slice(0, 5));
  // Full vectors written to stdout in JSON so they can be piped to a file.
  console.log('\n--- VACCINE_QUERY_VECTOR ---');
  console.log(JSON.stringify(vaccineQuery));
  console.log('--- ELECTION_QUERY_VECTOR ---');
  console.log(JSON.stringify(electionQuery));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
