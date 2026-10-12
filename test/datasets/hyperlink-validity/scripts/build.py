"""Merge production snapshots, url-resolver re-run results, curated sheet cases and labels
into the final dataset.
Usage: python3 build.py sampled.jsonl rerun.jsonl sheet_cases.jsonl labels.jsonl out_dir
labels.jsonl: {"id", "label", "reason"} per row (rows without a label fall back to the rule pre-label).
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

sampled, rerun_path, sheet_path, labels_path, out = sys.argv[1:6]
rerun = {}
for l in open(rerun_path):
    d = json.loads(l)
    rerun[d['url']] = d
labels = {}
if os.path.exists(labels_path):
    for l in open(labels_path):
        d = json.loads(l)
        labels[d['id']] = d

rows = []
def add(url, snapshot, inp, meta):
    i = rid(url, snapshot)
    lab, rule = pre_label(inp.get('title'), inp.get('summary'), inp.get('status'), inp.get('error'))
    meta = {'snapshot': snapshot, 'domain': host(url), 'preLabel': lab, 'preLabelRule': rule, **meta}
    rows.append({'id': i, 'input': {'url': url, **inp}, 'meta': meta})

for l in open(sampled):
    e = json.loads(l)
    add(e['url'], 'production', {
        'canonical': None, 'title': clean(e['title']), 'summary': clean(e['summary']),
        'topImageUrl': e.get('topImageUrl'), 'status': e.get('status'), 'error': e.get('error'),
    }, {'fetchedAt': e.get('fetchedAt'), 'refCount': e['refCount'], 'refs': e['refs']})

def add_rerun(url, extra_meta):
    r = rerun.get(url)
    if not r:
        return
    add(url, RERUN, {
        'canonical': r.get('canonical'), 'title': clean(r.get('title')), 'summary': clean(r.get('summary')),
        'topImageUrl': r.get('topImageUrl'), 'status': None,
        'error': None if r.get('successfullyResolved') else
                 RESOLVE_ERRORS[r['error']] if isinstance(r.get('error'), int) else str(r.get('error')),
    }, {'fetchedAt': r.get('resolvedAt'), **extra_meta})

for l in open(sampled):
    e = json.loads(l)
    add_rerun(e['url'], {'refCount': e['refCount'], 'refs': e['refs']})

for l in open(sheet_path):
    s = json.loads(l)
    add(s['url'], 'curated', {
        'canonical': s['canonical'], 'title': clean(s['title']), 'summary': clean(s['summary']),
        'topImageUrl': s.get('top_image_url'), 'status': None, 'error': None,
    }, {'sheetType': s['type'], 'fetchedAt': None})
    add_rerun(s['url'], {'sheetType': s['type']})

os.makedirs(out, exist_ok=True)
seen = set()
with open(os.path.join(out, 'dataset.jsonl'), 'w') as f, \
        open(os.path.join(out, 'dataset.csv'), 'w', newline='') as cf:
    w = csv.writer(cf)
    w.writerow(['id', 'label', 'labelSource', 'reason', 'ambiguous', 'snapshot', 'domain', 'url', 'canonical', 'title', 'summary', 'topImageUrl', 'status', 'error', 'preLabel', 'preLabelRule'])
    for r in rows:
        if r['id'] in seen:
            continue
        seen.add(r['id'])
        m = r['meta']
        if m['snapshot'] == 'curated':
            label, src, reason = 'content', 'human', 'Curated test case (Cofacts URL resolution test cases sheet)'
        elif r['id'] in labels:
            label, src, reason = labels[r['id']]['label'], labels[r['id']].get('source', 'llm-review'), labels[r['id']].get('reason')
            if labels[r['id']].get('ambiguous'):
                m['ambiguous'] = True  # reviewer flagged the label as debatable; check these first
        else:
            label, src, reason = m['preLabel'], 'rule', None
        i = r['input']
        if not (i.get('title') or '').strip() and not (i.get('summary') or '').strip() and m['snapshot'] != 'curated':
            # No text to judge: decide by HTTP status so that reviewers stay consistent.
            st = i.get('status')
            src = 'rule'
            label = 'not_found' if st in ('404', '410') else 'blocked' if st in ('401', '403', '429') else 'empty'
        m['labelSource'] = src
        f.write(json.dumps({'id': r['id'], 'input': r['input'], 'expectedOutput': {'label': label, 'reason': reason}, 'metadata': m}, ensure_ascii=False) + '\n')
        w.writerow([r['id'], label, src, reason, 'Y' if m.get('ambiguous') else '', m['snapshot'], m['domain'], i['url'], i.get('canonical'), i.get('title'), i.get('summary'), i.get('topImageUrl'), i.get('status'), i.get('error'), m['preLabel'], m['preLabelRule']])
print(len(seen), 'rows')
