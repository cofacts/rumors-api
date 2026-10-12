"""Dedupe crawled hyperlinks, pre-label with rules, and draw a domain-diverse stratified sample.
Usage: python3 sample.py articles.jsonl replies.jsonl sheet_cases.jsonl out_dir
"""
import json, random, re, sys, os, collections
sys.path.insert(0, os.path.dirname(__file__))
from rules import pre_label

SEED = 20261012
TARGETS = {  # pre_label -> number of URLs to sample
    'unknown': 260, 'login_wall': 70, 'not_found': 50, 'blocked': 50,
    'generic_page': 60, 'error_page': 25, 'empty': 30,
}
DOMAIN_CAP = {'default': 3, 'login_wall': 12, 'generic_page': 8}

def host(u):
    m = re.match(r'(?:https?://)?([^/?#:\s]+)', u or '')
    return m.group(1).lower() if m else ''

art, rep, sheet, out = sys.argv[1:5]
by_url = {}
for f in (art, rep):
    for line in open(f):
        d = json.loads(line)
        e = by_url.get(d['url'])
        if e is None:
            e = by_url[d['url']] = {**d, 'refs': []}
        e['refs'].append({'type': 'article' if d['source'] == 'ListArticles' else 'reply', 'id': d['docId'], 'createdAt': d['createdAt']})

# Same title on >= DUP_MIN distinct URLs of one domain usually means the URLs all landed on
# one generic page (home page, list page, consent page, etc.) instead of their own content.
DUP_MIN = 5
dup_title = collections.defaultdict(set)
for u, e in by_url.items():
    t = (e['title'] or '').strip()
    if t:
        dup_title[(host(u), t)].add(u)

pool = collections.defaultdict(list)
stats = collections.Counter()
for u, e in by_url.items():
    lab, rid = pre_label(e['title'], e['summary'], e['status'], e['error'])
    e['sameTitleUrlCount'] = len(dup_title.get((host(u), (e['title'] or '').strip()), ()))
    if lab == 'unknown' and e['sameTitleUrlCount'] >= DUP_MIN:
        lab, rid = 'generic_page', 'dup_title_same_domain'
    e['preLabel'], e['preLabelRule'] = lab, rid
    stats[(lab, rid)] += 1
    pool[lab].append(e)

rng = random.Random(SEED)
picked = []
for lab, n in TARGETS.items():
    cands = pool[lab][:]
    rng.shuffle(cands)
    # Round-robin over rules then domains so that every rule & domain gets represented
    cap = DOMAIN_CAP.get(lab, DOMAIN_CAP['default'])
    by_rule = collections.defaultdict(list)
    for e in cands:
        by_rule[e['preLabelRule']].append(e)
    per_dom = collections.Counter()
    chosen = []
    iters = {k: iter(v) for k, v in by_rule.items()}
    while len(chosen) < n and iters:
        for k in list(iters):
            for e in iters[k]:
                h = host(e['url'])
                if per_dom[h] < cap:
                    per_dom[h] += 1
                    chosen.append(e)
                    break
            else:
                del iters[k]
            if len(chosen) >= n:
                break
    picked += chosen

for line in open(sheet):
    d = json.loads(line)
    if d['url'] in by_url:
        print('sheet url also in prod:', d['url'], file=sys.stderr)

os.makedirs(out, exist_ok=True)
with open(os.path.join(out, 'sampled.jsonl'), 'w') as f:
    for e in picked:
        e['refCount'] = len(e['refs'])
        e['refs'] = sorted(e['refs'], key=lambda r: r['createdAt'], reverse=True)[:5]
        f.write(json.dumps(e, ensure_ascii=False) + '\n')
with open(os.path.join(out, 'urls.txt'), 'w') as f:
    urls = [e['url'] for e in picked] + [json.loads(l)['url'] for l in open(sheet)]
    f.write('\n'.join(dict.fromkeys(urls)) + '\n')
with open(os.path.join(out, 'prelabel_stats.json'), 'w') as f:
    json.dump({'totalUniqueUrls': len(by_url), 'byRule': {f'{k[0]}/{k[1]}': v for k, v in stats.most_common()}}, f, ensure_ascii=False, indent=1)
print(len(by_url), 'unique urls;', len(picked), 'sampled;', collections.Counter(e['preLabel'] for e in picked))
