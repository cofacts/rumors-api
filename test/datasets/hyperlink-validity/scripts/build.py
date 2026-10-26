"""Merge production snapshots, url-resolver re-run results, curated sheet cases and labels
into the final dataset.
Usage: python3 build.py sampled.jsonl rerun.jsonl sheet_cases.jsonl labels.jsonl ambiguous.txt out_dir
  labels.jsonl: {"id", "keepTitle", "keepSummary", "kind", "reason"} per row.
  ambiguous.txt: whitespace-separated row ids whose labels the reviewer found debatable.
Rows with no title and no summary are labeled by rule (nothing to keep; kind from HTTP status).
"""
import csv, hashlib, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from rules import pre_label

RERUN = 'rerun-20261012'
# url-resolver src/typeDefs/resolve_error.proto
RESOLVE_ERRORS = ['UNKNOWN_ERROR', 'NAME_NOT_RESOLVED', 'INVALID_URL', 'NOT_REACHABLE', 'UNSUPPORTED',
                  'HTTPS_ERROR', 'UNKNOWN_SCRAPE_ERROR', 'UNKNOWN_UNFURL_ERROR']


def host(u):
    m = re.match(r'(?:https?://)?([^/?#:\s]+)', u or '')
    return m.group(1).lower() if m else ''


def rid(url, snapshot):
    return 'hl-' + hashlib.sha1(f'{snapshot}\n{url}'.encode()).hexdigest()[:16]


def clean(s):
    return (s or '').strip() or None


sampled_path, rerun_path, sheet_path, labels_path, ambiguous_path, out = sys.argv[1:7]
rerun = {}
for line in open(rerun_path):
    d = json.loads(line)
    rerun[d['url']] = d
labels = {}
for line in open(labels_path):
    d = json.loads(line)
    labels[d['id']] = d
ambiguous = set(open(ambiguous_path).read().split()) if os.path.exists(ambiguous_path) else set()

rows = []


def add(url, snapshot, inp, meta):
    lab, rule = pre_label(inp.get('title'), inp.get('summary'), inp.get('status'), inp.get('error'))
    meta = {'snapshot': snapshot, 'domain': host(url), 'preLabel': lab, 'preLabelRule': rule, **meta}
    rows.append({'id': rid(url, snapshot), 'input': {'url': url, **inp}, 'meta': meta})


def add_rerun(url, extra_meta):
    r = rerun.get(url)
    if not r:
        return
    err = r.get('error')
    add(url, RERUN, {
        'canonical': r.get('canonical'), 'title': clean(r.get('title')), 'summary': clean(r.get('summary')),
        'topImageUrl': r.get('topImageUrl'),
        'status': str(r['httpStatus']) if r.get('httpStatus') is not None else None,
        'error': None if r.get('successfullyResolved') else RESOLVE_ERRORS[err] if isinstance(err, int) else str(err),
        'htmlFeatures': {**r['htmlFeatures'], 'fetchFinalUrl': r.get('finalUrl'), 'htmlSource': r.get('htmlSource')}
        if r.get('htmlFeatures') else None,
    }, {'fetchedAt': r.get('resolvedAt'), **extra_meta})


sampled = [json.loads(line) for line in open(sampled_path)]
for e in sampled:
    add(e['url'], 'production', {
        'canonical': None, 'title': clean(e['title']), 'summary': clean(e['summary']),
        'topImageUrl': e.get('topImageUrl'), 'status': e.get('status'), 'error': e.get('error'),
        'htmlFeatures': None,
    }, {'fetchedAt': e.get('fetchedAt'), 'refCount': e['refCount'], 'refs': e['refs']})
for e in sampled:
    add_rerun(e['url'], {'refCount': e['refCount'], 'refs': e['refs']})
for line in open(sheet_path):
    s = json.loads(line)
    add(s['url'], 'curated', {
        'canonical': s['canonical'], 'title': clean(s['title']), 'summary': clean(s['summary']),
        'topImageUrl': s.get('top_image_url'), 'status': None, 'error': None, 'htmlFeatures': None,
    }, {'sheetType': s['type'], 'fetchedAt': None})
    add_rerun(s['url'], {'sheetType': s['type']})

os.makedirs(out, exist_ok=True)
seen = set()
missing = 0
with open(os.path.join(out, 'dataset.jsonl'), 'w') as f, \
        open(os.path.join(out, 'dataset.csv'), 'w', newline='') as cf:
    w = csv.writer(cf)
    w.writerow(['id', 'keepTitle', 'keepSummary', 'kind', 'labelSource', 'ambiguous', 'reason', 'snapshot', 'domain',
                'url', 'canonical', 'title', 'summary', 'topImageUrl', 'status', 'error', 'preLabel', 'preLabelRule',
                'htmlFeatures'])
    for r in rows:
        if r['id'] in seen:
            continue
        seen.add(r['id'])
        m, i = r['meta'], r['input']
        if m['snapshot'] == 'curated':
            keep_t, keep_s, kind, src, reason = True, True, 'content', 'human', \
                'Curated test case (Cofacts URL resolution test cases sheet)'
        elif not i.get('title') and not i.get('summary'):
            # No text to judge: nothing to keep; kind from HTTP status.
            st = i.get('status')
            kind = 'not_found' if st in ('404', '410') else 'blocked' if st in ('401', '403', '429') else 'empty'
            keep_t, keep_s, src, reason = False, False, 'rule', None
        elif r['id'] in labels:
            lb = labels[r['id']]
            keep_t, keep_s, kind, src, reason = lb['keepTitle'], lb['keepSummary'], lb['kind'], 'llm-review', lb.get('reason')
        else:
            missing += 1
            continue
        m['kind'], m['labelSource'] = kind, src
        if r['id'] in ambiguous:
            m['ambiguous'] = True
        f.write(json.dumps({'id': r['id'], 'input': i,
                            'expectedOutput': {'keepTitle': keep_t, 'keepSummary': keep_s, 'reason': reason},
                            'metadata': m}, ensure_ascii=False) + '\n')
        w.writerow([r['id'], keep_t, keep_s, kind, src, 'Y' if m.get('ambiguous') else '', reason, m['snapshot'],
                    m['domain'], i['url'], i.get('canonical'), i.get('title'), i.get('summary'), i.get('topImageUrl'),
                    i.get('status'), i.get('error'), m['preLabel'], m['preLabelRule'],
                    json.dumps(i['htmlFeatures'], ensure_ascii=False) if i.get('htmlFeatures') else ''])
print(len(seen) - missing, 'rows;', missing, 'rows skipped for missing labels')
