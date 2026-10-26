# Hyperlink validity dataset

URLs mentioned in Cofacts articles and replies, together with the content url-resolver
scraped for them, labeled by **which parts of the scrape result can be stored** in
`urls` / `hyperlinks`: the title, the summary, both, or neither (login wall, 404, bot block
page, home page the URL redirected to, ...).

It is meant for evaluating and prompt-tuning the decision model proposed in
[rumors-api#409](https://github.com/cofacts/rumors-api/issues/409), so that junk text stops
polluting search (see [20261006 meeting notes](https://github.com/cofacts/kb/blob/main/src/meetings/2026/20261006.md)).

## Files

| File | Description |
|---|---|
| `dataset.jsonl` | One dataset item per line, in Langfuse dataset item shape (`id`, `input`, `expectedOutput`, `metadata`). |
| `dataset.csv` | Same rows flattened for reviewing in a spreadsheet. |
| `LABELING.md` | The rubric used to label the rows. |
| `prelabel_stats.json` | How many of the 167,612 unique URLs in production each rule in `scripts/rules.py` matched. About 22% (36.8k) match a non-content rule — a rough, lower-bound estimate of how much existing data is polluted. |
| `scripts/` | Scripts used to build the dataset (see [Rebuilding](#rebuilding)). |

Upload to Langfuse, then run experiments:

```sh
npx tsx src/scripts/uploadHyperlinkDataset.ts --datasetName "hyperlink validity"

# Do HTML features help? Compare on the snapshot that has them:
npx tsx src/scripts/experimentHyperlinkDecision.ts --runName "flash-lite" --snapshot rerun-20261012
npx tsx src/scripts/experimentHyperlinkDecision.ts --runName "flash-lite+html" --snapshot rerun-20261012 --withHtmlFeatures
```

The experiment scores each item with `keepTitle-correct`, `keepSummary-correct`,
`both-correct` and `junk-kept` (the model kept a field that should have been dropped).

## Overview

1,206 rows over 603 unique URLs. `expectedOutput` as (keepTitle, keepSummary):

| | production | rerun-20261012 | curated | total |
|---|---:|---:|---:|---:|
| keep both | 241 | 209 | 58 | 508 |
| title only | 68 | 36 | | 104 |
| summary only | 15 | 10 | | 25 |
| keep neither | 221 | 348 | | 569 |

Of the "keep neither" rows, 43 production and 233 re-run rows have no text at all — mostly URLs
url-resolver already rejects (`error` is set, e.g. `UNKNOWN_UNFURL_ERROR` when the site responds
with a non-2xx status). The decision model never sees those, and the experiment script skips them.

## Item format

```jsonc
{
  "id": "hl-0123456789abcdef",       // stable: sha1(snapshot + url)
  "input": {
    "url": "https://www.facebook.com/share/r/1J37dQMCjX/",  // URL as it appears in the article / reply
    "canonical": "https://m.facebook.com/reel/...",         // url-resolver's canonical; re-run & curated rows only
    "title": "Log in or sign up to view",
    "summary": "See posts, photos and more on Facebook.",
    "topImageUrl": "https://...",
    "status": "200",                 // HTTP status (production: stored in `urls`; re-run: from a plain fetch)
    "error": null,                   // url-resolver / rumors-api error, if any
    "htmlFeatures": { ... }          // re-run rows only, see "HTML features"
  },
  "expectedOutput": {
    "keepTitle": false,
    "keepSummary": false,
    "reason": "Facebook login page; no post content."
  },
  "metadata": {
    "snapshot": "rerun-20261012",    // see "Snapshots"
    "kind": "login_wall",            // finer category, for error analysis (see "Labels")
    "labelSource": "llm-review",     // see "Labels"
    "ambiguous": true,               // only present when the reviewer found the label debatable
    "domain": "www.facebook.com",
    "preLabel": "login_wall",        // rule-based guess from scripts/rules.py
    "preLabelRule": "fb_login_title",
    "fetchedAt": "2026-10-12T16:40:58.241Z",
    "refCount": 1,                   // # of articles / replies containing the URL
    "refs": [{ "type": "article", "id": "2marh2mxcxldm", "createdAt": "..." }]
  }
}
```

### Snapshots

The same URL can appear in up to 3 rows, one per snapshot:

- `production` — the `title` / `summary` currently stored in production `hyperlinks`, fetched
  through `ListArticles` / `ListReplies` of the public API on 2026-10-12. These are what
  url-resolver returned when the article / reply was created (2017–2026), so they include
  behaviors of older url-resolver versions and the production server's IP. No HTML features,
  since `urls.html` is not exposed by the API.
- `rerun-20261012` — the same URL resolved again on 2026-10-12 by url-resolver `master`
  (`859902d`, local Chromium, called in-process via `scripts/resolve.js`), plus HTML features.
  It ran from a cloud sandbox, not the production GCP machine, so sites that block by IP / ASN
  behave differently (YouTube rate-limited the sandbox, for example). Only HTTPS was reachable
  from the sandbox, so `http://` URLs come back with errors.
- `curated` — human-curated ground truth from the
  "Cofacts URL resolution test cases" spreadsheet (`Test cases` sheet), all real content.

### HTML features

`input.htmlFeatures` (re-run rows) is a compact summary of the page HTML from
`scripts/htmlFeatures.js`, meant to be passed to the decision model next to title & summary
instead of the raw HTML (a rendered Facebook page is > 1 MB):

`htmlTitle`, `lang`, `canonicalLink`, `ogUrl`, `ogType`, `ogSiteName`, `metaRobots`,
`jsonLdTypes`, `jsonLdHeadline`, `h1`, `hasPasswordInput`, `formCount`, `bodyClass`,
`textLength`, `linkCount`, `linkTextRatio`, plus `fetchFinalUrl` (URL after redirects of a plain
fetch) and `htmlSource`.

`htmlSource` tells where the HTML came from. `browser`: the DOM url-resolver rendered with
Chromium (url-resolver only opens a browser when `<meta>` tags are incomplete). `fetch`: a plain
fetch with unfurl's user agent, made separately right after url-resolver ran — usually the same
page url-resolver parsed, but sites that vary by request may differ.

How the features line up with the labels on the 370 re-run rows with text:

| feature | keep both (209) | keep one (46) | keep neither (115) |
|---|---:|---:|---:|
| `hasPasswordInput` | 1% | 11% | 43% |
| `jsonLdTypes` has Article / VideoObject / Posting / Report | 64% | 9% | 0% |
| `ogType` is article / video | 73% | 39% | 6% |
| `textLength` < 300 | 7% | 61% | 30% |
| `fetchFinalUrl` lost the URL's path (sent to home page) | 0% | 0% | 11% |
| `h1` present | 84% | 26% | 25% |

## Labels

`expectedOutput.keepTitle` / `keepSummary` — whether the title / summary is specific to the
content at this URL (see `LABELING.md` for the full rubric). Storing only the specific part keeps
the URL indexed without polluting search; e.g. a YouTube video keeps its title but not YouTube's
site-wide description, and a Facebook post behind login chrome may keep its post text but not
the "Log in or sign up to view" title.

`metadata.kind` is a finer category for error analysis: `content`, `partial` (only one of the
two is specific), `login_wall`, `not_found`, `blocked`, `generic_page` (home / list / unrelated
page, site-wide defaults), `error_page`, `empty`.

`metadata.labelSource`:

- `human` — curated rows from the spreadsheet.
- `llm-review` — labeled by Claude reading `url`, `canonical`, `status`, `title` and `summary`
  (not `htmlFeatures`, to keep labels independent of the feature experiment) with the rubric.
  **Not yet verified by a human**; please correct labels in place (keep the `id`) and set
  `labelSource` to `human` when you review them.
- `rule` — rows with no title and no summary: keep neither; `kind` is `not_found` for HTTP
  404 / 410, `blocked` for 401 / 403 / 429, otherwise `empty`.

58 rows have `metadata.ambiguous: true` — the reviewer found more than one label defensible
(e.g. a post URL whose title is only the account name). Review those first.

`preLabel` comes from the high-precision regexes in `scripts/rules.py`, plus a
`dup_title_same_domain` signal (same title on ≥ 5 distinct URLs of a domain). It is a
baseline to compare against, not ground truth.

## Sampling

1. Crawled every article & reply hyperlink through the public API (~316k hyperlinks,
   167,612 unique URLs).
2. Pre-labeled each unique URL with `scripts/rules.py`.
3. Drew a stratified sample per pre-label (260 `unknown`, 70 `login_wall`, 60 `generic_page`,
   50 `not_found`, 50 `blocked`, 30 `empty`, 25 `error_page`), round-robin over rules and capped
   at 3 URLs per domain (12 for `login_wall`, 8 for `generic_page`) for diversity. Seed `20261012`.
4. Added the 58 curated URLs from the spreadsheet.
5. Re-resolved all sampled URLs with url-resolver and labeled every row. Re-run rows whose
   title & summary are identical to the production row reuse its label.

The rules in `scripts/rules.py` were refined after review (e.g. Telegram channel pages are not
login walls), so running `scripts/sample.py` now draws a different sample; the URLs in
`dataset.jsonl` are the frozen sample.

## Rebuilding

```sh
D=test/datasets/hyperlink-validity/scripts
# 1. Crawl hyperlinks (can be split by createdAt ranges via the 3rd arg to run in parallel)
python3 $D/crawl.py ListArticles articles.jsonl
python3 $D/crawl.py ListReplies replies.jsonl
# 2. Sample (sheet_cases.jsonl: rows of the "Test cases" sheet as JSON)
python3 $D/sample.py articles.jsonl replies.jsonl sheet_cases.jsonl out
# 3. Re-resolve with url-resolver checked out at ../url-resolver (npm ci && npm run compile there first)
(cd ../url-resolver && NODE_PATH=$PWD/node_modules \
  node ../rumors-api/$D/resolve.js . ../rumors-api/out/urls.txt ../rumors-api/out/rerun.jsonl)
# 4. Merge (labels.jsonl: {"id", "keepTitle", "keepSummary", "kind", "reason"} per row;
#    ambiguous.txt: ids of debatable rows)
python3 $D/build.py out/sampled.jsonl out/rerun.jsonl sheet_cases.jsonl labels.jsonl ambiguous.txt test/datasets/hyperlink-validity
```
