# PR Review Guide: Elasticsearch 6.8 → 9.2 + Node 24 Migration

> Branch: `feature/upgrade-to-elasticsearch-v9`
> 132 files changed, ~12,146 insertions, ~24,308 deletions (bulk of deletions from package-lock.json regeneration)

## TL;DR

This PR migrates rumors-api from **Elasticsearch 6.8 / Node 18** to **Elasticsearch 9.2 / Node 24**, covering:

1. ES client library upgrade (`@elastic/elasticsearch` v9.2)
2. All ES API call sites migrated to v9 request/response format (body wrapper removal done in phases — initial bulk in Phase 1, remaining calls in Phase 7)
3. Comprehensive test updates (snapshots, cursors, scoring, error format)
4. Node 24 compatibility fixes (undici, Babel config, env var types)
5. TypeScript type error fixes (CI `npm run typecheck` must pass)
6. Docker / dev environment configuration updates
7. CI workflow updated for ES 9.2.2 + Node 24
8. Database submodule updated (separate PR: [rumors-db#77](https://github.com/cofacts/rumors-db/pull/77))

---

## Commit Walkthrough (read bottom-up)

### Phase 1: Infrastructure & Client Upgrade

| Commit                                                                                  | Description                                                                                                                                                                 |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ca5d54b` refactor(ESv9): update elasticsearch client version                           | Upgrade `@elastic/elasticsearch` to v9.2.0 in package.json                                                                                                                  |
| `770baec` refactor(ESv9): update client call sites (drop resp.body, remove type/\_type) | Remove `.body` response wrappers across the entire codebase and `type: 'doc'` / `_type` parameters from production code — admin handlers, graphql mutations, queries, scripts, auth, dataLoaders |
| `2048c95` refactor(ESv9): add getTotalCount helper to normalize hits.total              | Add `getTotalCount(total)` in `src/util/client.ts` to normalize v9 `hits.total` from `{ value, relation }` back to a plain number; update all call sites                    |
| `e2ad361` refactor(ESv9): update defaultResolveTotalCount for v9 count API              | Remove `body` wrapper from `count` API call in `src/graphql/util.js`; read `response.count` directly                                                                        |

### Phase 2: Core Functionality Fixes

| Commit                                                                                      | Description                                                                                                                                         |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `9cdef98` fix(ESv9): update error handling using instanceof ResponseError                   | Replace manual property checks with `e instanceof errors.ResponseError` + `e.body?.error?.type` across badge handlers, blockUser, and genAIReply    |
| `51f0c68` fix(ESv9): use \_shard_doc for pagination sort instead of \_id                    | ES v9 no longer supports `_id` sort; use `_shard_doc` as tiebreaker for cursor-based pagination in `src/graphql/util.js`                            |
| `b1e3c48` fix(ESv9): migrate msearch body to searches format in dataLoaders                 | Rename `body[]` to `searches[]` in all 11 dataLoader factories                                                                                      |
| `ccb5b99` fix(ESv9): migrate update calls in badge handlers to v9 format                    | Remove `body` wrapper from `client.update()` and `client.updateByQuery()` in awardBadge.ts and revokeBadge.ts                                       |
| `086d7de` fix(ESv9): migrate update call in CreateOrUpdateArticleReplyFeedback to v9 format | Remove `body` wrapper from `client.update()` in the feedback mutation                                                                               |
| `be2aaf8` fix(ESv9): fix Painless isEmpty() null-safety                                     | Add null checks before `isEmpty()` calls in Painless scripts (ListArticles.js, genBERTInputArticles.js) — ES v9 Painless throws on `null.isEmpty()` |
| `1f4f0e9` fix(ESv9): fix array-wrapped range filter push in Article model                   | Fix incorrect array wrapping when pushing range filters in `src/graphql/models/Article.js`                                                          |

### Phase 3: Test Updates

| Commit                                                                                      | Description                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `03b9c52` refactor(test): remove deprecated ES v6 body/type patterns from test setup        | Remove `.body` wrappers and `type: 'doc'` from test setup code across auth, badge, moderation, and graphql query tests                                                                                                |
| `e44a0c3` fix(test): fetch real cursor for pagination tests (due to \_shard_doc sort)       | Stop constructing cursors manually; fetch actual cursors from list API response before testing `after/before` — affects ListAnalytics, ListArticles, ListBlockedUsers, ListCategories, ListReplies, ListReplyRequests |
| `ad49ba4` test(ESv9): update test snapshots for v9 scoring and sort order changes           | ES v9 produces slightly different relevance scores; tied-score document order may differ — updates snapshots for userLoaderFactory, GetReplyAndGetArticle, ListArticles, ListAIResponses                              |
| `1f88446` test(ESv9): update test expectations for v9 total.value format and error response | `hits.total` changed from `number` to `{ value, relation }` object; error response format updated — affects genBERTInputArticles, removeArticleReply, importFlowAnnotation tests                                      |
| `a5c3bb3` test(snapshot): update snapshot due to sort order                                 | Snapshot updates reflecting sort order changes in ListArticles.js.snap                                                                                                                                                |
| `638be1c` + `d1bf0b1`: stop asserting cursor values and remove cursor entries from snapshots | `_shard_doc` cursors are non-deterministic;
remove cursor literal assertions and cursor fields from all snapshot files                                                                                                 |
| `62f85e6` test(CreateAIReply): await polling delay and assert errors undefined              | Fix async test timing in CreateAIReply test                                                                                                                                                                           |

### Phase 4: Environment & Node 24

| Commit                                                                              | Description                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `91cdc8a` chore(ESv9): update Dockerfile to Node 24 and docker-compose for ES 9.2.2 | Dockerfile base image changed to `node:24-alpine`; docker-compose updated to `elasticsearch:9.2.2`; README updated with new test DB instructions      |
| `632e37b` fix(node24): add date-fns, undici and update package-lock                 | `undici`: Node 24 built-in fetch uses undici; added explicitly to avoid Jest inconsistencies. `date-fns`: pm2 upgrade no longer pulls it transitively |
| `eada708` fix(node24): update test fixtures for Node 24 and environment changes     | Update blockUser fixture date format, Content-Length expectations, and FormData snapshots for undici (Node 24 built-in fetch)                         |
| `d85a5e5` fix(node24): migrate .babelrc to babel.config.js                          | Resolve `@babel/eslint-parser` error — Node 24 requires explicit babel.config.js instead of .babelrc                                                  |
| `153b388` fix(node24): convert COOKIE_MAXAGE env var to number with fallback        | `process.env` values are strings; `koa-session` `maxAge` expects a number — added `Number()` conversion with fallback                                 |

### Phase 5: TypeScript Type Fixes

| Commit                                                                      | Description                                                                                                                                                      |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20af9f8` fix(ESv9): fix type errors in admin handler files                 | blockUser / genAITranscript / replaceMedia / awardBadge / revokeBadge: add type generics to `client.get`/`mget`, fix aggregations type casting, default `number\|undefined` to 0 |
| `2b11192` fix(ESv9): fix type errors in graphql mutations and util files    | CreateOrUpdateArticleReplyFeedback / user.ts: add `Article` type generic for update response, cast `loadMany` through `unknown`, bridge processMeta types                        |
| `02d10c0` fix(test): add Record type annotation in archiveUrlsFromText test | Add `Record<string, unknown>` type to `bodyEntries` in archiveUrlsFromText test                                                                                  |

### Phase 6: CI & Ops

| Commit                                                          | Description                                                                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `4480437` chore(ci): update CI workflow to ES 9.2.2 and Node 24 | Update `.github/workflows/ci.yml` — ES 9.2.2 Docker image, Node 24, `xpack.security.enabled: false` for CI                                                               |
| `c6d00a4` chore: update rumors-db submodule to ES v9 + Node 24  | Update submodule pointer to `feature/upgrade-to-elasticsearch-v9` branch; fix `.gitmodules` remote URL to `cofacts/rumors-db`; add `xpack.security.enabled: false` to CI |

### Phase 7: Final Cleanup

| Commit                                                                    | Description                                                                                                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ade72c3` fix(ESv9): remove remaining body wrappers from ES client calls  | Remove `body:` request wrappers from remaining 25 files — mutations, scripts, utilities (bulk, mget, scrapUrls, cleanupUrls, etc.) |
| `a761dfa` fix(test): remove remaining ES v6 body/type patterns from tests | Remove `body:` wrappers and `type: 'doc'` from remaining 5 test files (genAITranscript, scrapUrls, fixtures, etc.)                 |
---

## Key Review Areas

### 1. ES v9 Request Format Changes (High Priority)

**Pattern**: All ES client calls have their `body` wrapper removed.

> **⚠️ Note:** `searchResultLoader.load({ body: ... })` is **NOT** an ES client body wrapper. The `body` here is a custom convention in `searchResultLoaderFactory.js` that destructures and spreads search params into the msearch request. These calls are intentionally unchanged:
> ```javascript
> // searchResultLoaderFactory.js
> searchContexts.forEach(({ body, index, ...otherContext }) => {
>   searches.push({ index });
>   searches.push({ ...otherContext, ...body }); // body is spread into msearch
> });
> ```

```typescript
// Before (ES v6)
client.search({ index, body: { query, aggs } });
client.update({ index, id, body: { doc, upsert } });
client.updateByQuery({ index, body: { query, script } });

// After (ES v9)
client.search({ index, query, aggs });
client.update({ index, id, doc, upsert });
client.updateByQuery({ index, query, script });
```

**Relevant commits**: `770baec`, `b1e3c48`, `ccb5b99`, `086d7de`, `ade72c3` — spanning dataLoaders, mutations, handlers, scripts, and utilities

### 2. Response Format Changes (High Priority)

**`hits.total`**: Changed from `number` to `{ value: number, relation: string }`

```typescript
// Before
const total = resp.hits.total; // number

// After — normalized via helper
import { getTotalCount } from "util/client";
const total = getTotalCount(resp.hits.total); // number
```

**`.body` wrapper removed**: Responses return data directly, no longer wrapped in `.body`

**`client.get()` `_source` typing**: v9 defaults to `{}`, requires a type generic:

```typescript
const { _source } = await client.get<Article>({ index, id });
```

**Relevant commits**: `770baec`, `2048c95`, `e2ad361`

### 3. Pagination / Cursor Changes (Medium Priority)

- ES v9 no longer supports `_id` sort; `_shard_doc` is used as a tiebreaker instead
- `_shard_doc` is a Lucene shard-internal value — **not guaranteed stable across index rebuilds**
- Impact: cursor values are no longer predictable; tests now remove cursor literal assertions and instead fetch actual cursors before testing pagination

**Relevant commits**: `51f0c68`, `e44a0c3`, `638be1c`, `d1bf0b1`

### 4. Error Handling Pattern (Medium Priority)

```typescript
// Before
if ('meta' in e && e.meta?.body?.error?.type === 'document_missing_exception')

// After — idiomatic ES v9 pattern
import { errors } from '@elastic/elasticsearch';
if (
  e instanceof errors.ResponseError &&
  e.body?.error?.type === 'document_missing_exception'
)
```

**Note**: `client.get()` on a missing doc returns `{ found: false }` (no `error` field in body), unlike `client.update()` which returns `{ error: { type: 'document_missing_exception' } }`. `genAIReply.ts` additionally checks `e.statusCode === 404` to catch get 404s.

**Relevant commit**: `9cdef98`

### 5. msearch / mget / bulk Migration (Medium Priority)

These three APIs renamed their body-related parameters in v9:

**msearch** — `body` → `searches`:
```typescript
// Before (ES v6)
client.msearch({ body: [header, query, header, query, ...] });

// After (ES v9)
client.msearch({ searches: [header, query, header, query, ...] });
```

All 11 dataLoader factories updated in a single commit. **Relevant commit**: `b1e3c48`

**mget** — `body: { docs }` → `docs`:
```typescript
// Before (ES v6)
client.mget({ body: { docs } });

// After (ES v9)
client.mget({ docs });
```

**Relevant commit**: `ade72c3` (docLoaderFactory.js, fetchStatsFromGA.js)

**bulk** — `body` → `operations`:
```typescript
// Before (ES v6)
client.bulk({ body: [...] });

// After (ES v9)
client.bulk({ operations: [...] });
```

**Relevant commit**: `ade72c3` (bulk.js, cleanupUrls.js, fetchStatsFromGA.js, scrapUrls.js, fixtures.js)

### 6. Painless Script Changes (Medium Priority)

- `isEmpty()` throws on `null` in ES v9 Painless — added null checks: `field == null || field.isEmpty()`
- `return "noop"` no longer works — replaced with `ctx.op = 'noop'`
- `interval` deprecated in date_histogram — replaced with `calendar_interval`

```painless
// Before — ES v6 Painless (isEmpty() on null doesn't throw)
doc['articleReplies.positiveFeedbackCount'].value >
doc['articleReplies.negativeFeedbackCount'].value

// After — ES v9 Painless (null-safe with isEmpty() guard)
(!doc['articleReplies.positiveFeedbackCount'].isEmpty()
  ? doc['articleReplies.positiveFeedbackCount'].value : 0) >
(!doc['articleReplies.negativeFeedbackCount'].isEmpty()
  ? doc['articleReplies.negativeFeedbackCount'].value : 0)
```

```painless
// Before — return string to skip update
return "noop";

// After — set ctx.op directly
ctx.op = 'noop';
```

**Relevant commits**: `be2aaf8` (isEmpty null-safety), `ccb5b99` (ctx.op noop in badge handlers)

### 7. TypeScript Type Fixes (Low Priority — quick scan)

Key patterns:

- `client.update()` has 3 generic parameters in its `UpdateResponse`: `<TDocument, TPartialDocument, TDocumentR>`. The response type uses the **3rd** parameter. When only input typing is needed, `<Article>` suffices; for response `_source` typing, an explicit cast is required:

```typescript
// Problem: UpdateResponse._source typed as TDocumentR (3rd generic), not TDocument
const result = await client.update<Article>({ ... });
result.get._source; // typed as unknown, not Article

// Solution: explicit cast
const { _source } = result.get as { _source: Article };
```

- `processMeta()` expects all `ProcessMetaArgs` fields to be required, but `UpdateResponse.get` has a different shape — `user.ts` uses explicit argument construction to bridge the types:

```typescript
// user.ts — bridge UpdateResponse.get to processMeta's expected shape
const user = processMeta<User>({
  _id: dbUserId,
  _source: userFound?._source as User,
  found: userFound?.found ?? true,
  _score: 0,
  highlight: {},
  inner_hits: {},
  sort: '',
  fields: userFound?.fields ?? {},
});
```

- `loadMany()` returns `(T | Error)[]`; casting to a tuple requires `as unknown` first.

**Relevant commits**: `20af9f8`, `2b11192`, `02d10c0`

### 8. Node 24 Compatibility (Low Priority)

- **undici**: Node 24 built-in fetch uses undici internally; added as explicit dependency to avoid Jest test inconsistencies
- **Babel config**: `.babelrc` migrated to `babel.config.js` — Node 24 requires this for `@babel/eslint-parser` to find the config
- **COOKIE_MAXAGE**: `process.env` values are strings; `koa-session` `maxAge` expects a number — added `Number()` conversion with fallback

**Relevant commits**: `632e37b`, `d85a5e5`, `153b388`, `eada708`

---

## Known Issues / Reviewer Notes

### Cursor Instability

- `_shard_doc` cursors may change after shard rebuilds, but **runtime functionality is correct** (pagination still works properly)
- Test strategy: only assert that cursors "exist and are strings"; focus on verifying node ordering and pagination results

### rumors-db Submodule

- `src/rumors-db` has been updated to ES v9 + Node 24 in a **separate PR**: [rumors-db#77](https://github.com/cofacts/rumors-db/pull/77)
- The submodule includes 8 commits covering: ES client upgrade, db script updates, migration scripts, and CI workflow
- Migration scripts are located at:
  - `src/rumors-db/db/migrations/202602-000-create-v9-indices.js` — creates V9 indices with correct mappings
  - `src/rumors-db/db/migrations/202602-001-reindex-v6-to-v9.sh` — automates V6 to V9 remote reindex

### Migration Script

- The migration script (`202602-001-reindex-v6-to-v9.sh`) automates V6 to V9 remote reindex across all 14 indices
- Step 1: Create V9 indices using `src/rumors-db` schema (with correct mapping: nested types, keyword fields)
- Step 2: Async reindex across 14 indices
- Supports re-runs: `op_type: create` skips already-existing documents

### Old Migration Scripts

- Files in `src/scripts/migrations/` (e.g. `fillAllHyperlinks.js`, `createBackendUsers.js`) still use the old `body:` wrapper syntax. These are **one-off historical migration scripts** that have already been executed and are not part of normal runtime — they are intentionally left untouched.

### CI Configuration

- ES 9.2 Docker image defaults to security enabled in production mode
- With `discovery.type=single-node`, ES runs in development mode (security auto-disabled)
- Added `xpack.security.enabled: false` explicitly in CI for clarity — this is a CI/dev-only setting, not a production concern
