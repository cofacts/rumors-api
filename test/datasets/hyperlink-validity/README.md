# Hyperlink validity dataset

URLs mentioned in Cofacts articles and replies, together with the content url-resolver
scraped for them, labeled by **whether the scraped content is the real content of the URL**
or something else (login wall, 404, bot block page, home page the URL redirected to, ...).

It is meant for evaluating and prompt-tuning the classifier proposed in
[rumors-api#409](https://github.com/cofacts/rumors-api/issues/409), which decides whether
to keep a scrape result in `urls` / `hyperlinks` before it pollutes search
(see [20261006 meeting notes](https://github.com/cofacts/kb/blob/main/src/meetings/2026/20261006.md)).

## Files

| File | Description |
|---|---|
| `dataset.jsonl` | One dataset item per line, in Langfuse dataset item shape (`id`, `input`, `expectedOutput`, `metadata`). |
| `dataset.csv` | Same rows flattened for reviewing in a spreadsheet. |
| `prelabel_stats.json` | How many of the 167,612 unique URLs in production each rule in `scripts/rules.py` matched. About 22% (36.8k) of them match a non-content rule — a rough, lower-bound estimate of how much existing data is polluted. |
| `scripts/` | Scripts used to build the dataset (see [Rebuilding](#rebuilding)). |

Upload to Langfuse with:

```sh
npx tsx src/scripts/uploadHyperlinkDataset.ts --datasetName "hyperlink validity"
```

## Overview

1,206 rows over 603 unique URLs:

| label | production | rerun-20261012 | curated | total |
|---|---:|---:|---:|---:|
| content | 280 | 232 | 58 | 570 |
| partial | 44 | 21 | | 65 |
| login_wall | 51 | 61 | | 112 |
| not_found | 53 | 5 | | 58 |
| blocked | 50 | 7 | | 57 |
| generic_page | 19 | 30 | | 49 |
| error_page | 18 | 6 | | 24 |
| empty | 30 | 241 | | 271 |

Most `empty` re-run rows are URLs url-resolver itself already rejects (`error` is set, e.g.
`UNKNOWN_UNFURL_ERROR` when the site responds with a non-2xx status), so a classifier never
sees them. Filter on `input.title` / `input.summary` being non-empty to get the rows a
classifier actually has to judge.

## Item format

```jsonc
{
  "id": "hl-0123456789abcdef",       // stable: sha1(snapshot + url)
  "input": {
    "url": "https://www.facebook.com/share/r/1J37dQMCjX/",  // URL as it appears in the article / reply
    "canonical": "https://m.facebook.com/reel/...",         // only available in re-run & curated rows
    "title": "Log in or sign up to view",
    "summary": "See posts, photos and more on Facebook.",
    "topImageUrl": "https://...",
    "status": "200",                 // HTTP status stored in production `urls` index (production rows only)
    "error": null                    // url-resolver / rumors-api error, if any
  },
  "expectedOutput": {
    "label": "login_wall",
    "reason": "Facebook login page; no post content."
  },
  "metadata": {
    "snapshot": "rerun-20261012",    // see "Snapshots"
    "domain": "www.facebook.com",
    "labelSource": "llm-review",     // see "Labels"
    "ambiguous": true,               // only present when the reviewer found the label debatable
    "preLabel": "login_wall",        // rule-based guess from scripts/rules.py
    "preLabelRule": "fb_login_title",
    "fetchedAt": "2026-10-12T04:02:34.665Z",
    "refCount": 1,                   // # of articles / replies containing the URL
    "refs": [{ "type": "article", "id": "2marh2mxcxldm", "createdAt": "..." }]
  }
}
```

### Snapshots

The same URL can appear in up to 3 rows, one per snapshot:

- `production` — the `title` / `summary` currently stored in production `hyperlinks`, fetched
  through `ListArticles` / `ListReplies` of the public API on 2026-10-12. These are what
  url-resolver returned at the time the article / reply was created (2017–2026), so they
  include behaviors of older url-resolver versions and the production server's IP.
- `rerun-20261012` — the same URL resolved again on 2026-10-12 by url-resolver `master`
  (`859902d`, local Chromium, called in-process via `scripts/resolve.js`). It was run from a
  cloud sandbox, not the production GCP machine, so sites that block by IP / ASN may behave
  differently. Only HTTPS was reachable from the sandbox, so `http://` URLs come back with errors.
- `curated` — human-curated ground truth from the
  "Cofacts URL resolution test cases" spreadsheet (`Test cases` sheet), all real content.

## Labels

| Label | Meaning |
|---|---|
| `content` | Title / summary are the actual content of the page the URL points to (article text, post text, video title + description, product page, ...). Short is fine. |
| `partial` | Some item-specific information survived (e.g. the real post / video title) but the body is boilerplate — e.g. YouTube's site-wide description, Facebook login title with the post text in summary. |
| `login_wall` | A login / sign-up page instead of the content. |
| `not_found` | 404, removed / unavailable / expired content, invalid short link. |
| `blocked` | Bot challenge, access denied, rate limited, "temporarily blocked", consent wall. |
| `generic_page` | A page that is not specific to the URL: site home page, list page the site redirected to when a post is gone, search page, site-wide default title / description. |
| `error_page` | Other error pages: 5xx, unsupported browser, maintenance. |
| `empty` | Nothing usable was scraped (no title and no summary). |

`metadata.labelSource` tells how `expectedOutput.label` was decided:

- `human` — curated rows from the spreadsheet.
- `llm-review` — labeled by Claude reading `url`, `canonical`, `title`, `summary` and `error`
  with the definitions above. **Not yet verified by a human**; please correct labels in place
  (keep the `id`) and set `labelSource` to `human` when you review them.
- `rule` — rows with no title and no summary: `not_found` for HTTP 404 / 410, `blocked` for
  401 / 403 / 429, otherwise `empty`.

45 rows have `metadata.ambiguous: true` — the reviewer found more than one label defensible
(e.g. a reel caption inside Facebook login chrome: `partial` or `content`?). Review those first.

`preLabel` comes from the high-precision regexes in `scripts/rules.py`, plus a
`dup_title_same_domain` signal (same title on ≥ 5 distinct URLs of a domain). It is a
baseline to compare classifiers against, not ground truth.

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
# 3. Re-resolve with url-resolver checked out at ../url-resolver
(cd ../url-resolver && npm ci && npm run compile && \
  node ../rumors-api/$D/resolve.js . ../rumors-api/out/urls.txt ../rumors-api/out/rerun.jsonl)
# 4. Merge (labels.jsonl: {"id", "label", "reason"} per row)
python3 $D/build.py out/sampled.jsonl out/rerun.jsonl sheet_cases.jsonl labels.jsonl test/datasets/hyperlink-validity
```
