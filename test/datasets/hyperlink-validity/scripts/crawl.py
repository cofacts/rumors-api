import json, sys, time, urllib.request
kind, out = sys.argv[1], sys.argv[2]  # kind: ListArticles | ListReplies
flt = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}  # e.g. {"createdAt": {"LT": "2025-05-01"}}
Q = '''query($after:String, $filter:%sFilter){ %s(first:500, after:$after, filter:$filter, orderBy:[{createdAt:DESC}]) {
  pageInfo{lastCursor} edges { cursor node { id createdAt hyperlinks { url normalizedUrl title summary topImageUrl fetchedAt status error } } } } }''' % ({'ListArticles':'ListArticle','ListReplies':'ListReply'}[kind], kind)
after = None
n = 0
with open(out, 'w') as f:
    while True:
        body = json.dumps({'query': Q, 'variables': {'after': after, 'filter': flt}}).encode()
        for attempt in range(5):
            try:
                req = urllib.request.Request('https://api.cofacts.tw/graphql', body, {'content-type': 'application/json', 'user-agent': 'cofacts-hyperlink-dataset/1.0'})
                d = json.load(urllib.request.urlopen(req, timeout=120))
                if d.get('errors'): raise RuntimeError(d['errors'])
                break
            except Exception as e:
                print('retry', attempt, e, file=sys.stderr); time.sleep(2 ** attempt)
        else:
            sys.exit('give up at ' + str(after))
        edges = d['data'][kind]['edges']
        if not edges: break
        for e in edges:
            nd = e['node']
            for h in nd['hyperlinks'] or []:
                f.write(json.dumps({'source': kind, 'docId': nd['id'], 'createdAt': nd['createdAt'], **h}, ensure_ascii=False) + '\n')
        n += len(edges)
        after = edges[-1]['cursor']
        print(kind, n, edges[-1]['node']['createdAt'], flush=True)
