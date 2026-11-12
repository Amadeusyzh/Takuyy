#!/usr/bin/env python3
# Checks the papers cited in blog posts against public metadata services (no AI, no API key):
# Crossref and doi.org for DOIs, the arXiv API for arXiv ids, Semantic Scholar (batch), DBLP (by title),
# OpenReview (by title, for ICLR/NeurIPS-style venues), the CVF/ECVA/NeurIPS paper listings, and an HTTP
# GET for every other link.
#
# Usage: cite-check.py <repo-dir> <out-dir> <meta-glob>... [-- <link-only-glob>...]
#   meta globs: table rows are parsed (title, venue, year, link) and looked up by title as well;
#   link-only globs: every link is only resolved (status and resolved title).
#   --parse-only as the first argument parses and prints the rows without any network access.
# Writes rows.json (everything), rows.tsv (one line per table row with flags), links.tsv (every URL),
# claims.tsv (venue/year claims per paper across files) to <out-dir>.
import difflib, glob, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

PARSE_ONLY = len(sys.argv) > 1 and sys.argv[1] == '--parse-only'
args = sys.argv[2:] if PARSE_ONLY else sys.argv[1:]
REPO, OUT = args[0], args[1]
rest = args[2:]
meta_globs = rest[:rest.index('--')] if '--' in rest else rest
link_globs = rest[rest.index('--') + 1:] if '--' in rest else []
os.makedirs(OUT, exist_ok=True)
UA = 'blog-citation-check/1.0 (+https://github.com/features/actions)'
LOG = open(os.path.join(OUT, 'log.txt'), 'w')


def log(*a):
    print(*a, file=LOG, flush=True)


def get(url, accept=None, data=None, tries=4, timeout=40, ctype=None):
    for k in range(tries):
        try:
            h = {'User-Agent': UA}
            if accept:
                h['Accept'] = accept
            if ctype:
                h['Content-Type'] = ctype
            req = urllib.request.Request(url, headers=h, data=data)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.geturl(), r.read()
        except urllib.error.HTTPError as e:
            body = b''
            try:
                body = e.read()
            except Exception:
                pass
            if e.code in (429, 500, 502, 503, 504) and k < tries - 1:
                ra = e.headers.get('Retry-After') if e.headers else None
                time.sleep(min(60, int(ra)) if ra and ra.isdigit() else 4 * (k + 1) ** 2)
                continue
            log('HTTP', e.code, url)
            return e.code, url, body
        except Exception as e:  # noqa: BLE001
            if k < tries - 1:
                time.sleep(3 * (k + 1))
                continue
            log('ERR', type(e).__name__, url, e)
            return 'ERR ' + type(e).__name__, url, b''


def norm(t):
    t = html.unescape(t or '')
    t = re.sub(r'\$\\pi\^3\$|\\pi\^3|π\^?3|π³', 'pi3', t)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = t.lower().replace('&', ' and ')
    t = re.sub(r'[^a-z0-9]+', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def sim(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return round(difflib.SequenceMatcher(None, a, b).ratio(), 3)


# ---------------------------------------------------------------------------- parsing
URL_RE = re.compile(r'https?://[^\s)<>|\]"\']+')
MDLINK_RE = re.compile(r'\[([^\]]*)\]\((https?://[^)\s]+)\)')
HEAD = {
    'paper': re.compile(r'^(paper|papers|work|title|论文|工作|論文|研究|手法|文献)$', re.I),
    'venue': re.compile(r'^(venue|status|venue / status|会议/期刊|会议|期刊|状态|状況|状態|会議/論文誌|掲載先|会議|発表先|会議・論文誌)$', re.I),
    'year': re.compile(r'^(year|年份|年)$', re.I),
    'link': re.compile(r'^(link|links|链接|リンク)$', re.I),
}


def strip_md(s):
    s = MDLINK_RE.sub(lambda m: m.group(1), s)
    s = re.sub(r'\*\*|__|`', '', s)
    return s.strip()


def cells(line):
    line = line.strip()
    if line.startswith('|'):
        line = line[1:]
    if line.endswith('|'):
        line = line[:-1]
    # split on | not inside $...$ or [...](...)
    out, cur, depth, inmath = [], '', 0, False
    i = 0
    while i < len(line):
        c = line[i]
        if c == '\\' and i + 1 < len(line) and line[i + 1] == '|':
            cur += '|'
            i += 2
            continue
        if c == '$':
            inmath = not inmath
        if c == '(' and cur.endswith(']'):
            depth += 1
        elif c == ')' and depth:
            depth -= 1
        if c == '|' and not inmath and not depth:
            out.append(cur.strip())
            cur = ''
        else:
            cur += c
        i += 1
    out.append(cur.strip())
    return out


def parse_file(path):
    rows, links = [], []
    lines = open(path, encoding='utf-8').read().split('\n')
    infence = False
    header = None
    for i, ln in enumerate(lines):
        if ln.lstrip().startswith('```'):
            infence = not infence
            continue
        if infence:
            continue
        for m in URL_RE.finditer(ln):
            u = m.group(0).rstrip('.,;:')
            links.append({'url': u, 'file': path, 'line': i + 1, 'text': strip_md(ln)[:160]})
        s = ln.strip()
        if not s.startswith('|'):
            header = None if not s else header
            continue
        nxt = lines[i + 1].strip() if i + 1 < len(lines) else ''
        if re.match(r'^\|?\s*:?-{3,}', nxt):
            header = [strip_md(c) for c in cells(s)]
            continue
        if re.match(r'^\|?\s*:?-{3,}', s) or header is None:
            continue
        cs = cells(s)
        col = {}
        for k, rx in HEAD.items():
            for j, h in enumerate(header):
                if rx.match(h.strip()):
                    col[k] = j
                    break
        if 'paper' not in col:
            continue
        get_c = lambda k: cs[col[k]] if k in col and col[k] < len(cs) else ''
        title_cell = strip_md(get_c('paper'))
        title = re.sub(r'\s*[\(（][^()（）]*(et al|等|ら|,|，|、| and |&)[^()（）]*[\)）]\s*$', '', title_cell).strip()
        title = re.sub(r'\s*[\(（][A-Z][^()（）]{1,40}[\)）]\s*$', '', title).strip() if title == title_cell else title
        venue = strip_md(get_c('venue'))
        year = strip_md(get_c('year'))
        if not year:
            m = re.search(r'(19|20)\d\d', venue)
            year = m.group(0) if m else ''
        urls = [u.rstrip('.,;:') for u in URL_RE.findall(s)]
        rows.append({'file': path, 'line': i + 1, 'title_cell': title_cell, 'title': title, 'venue': venue,
                     'year': year, 'urls': urls, 'header': header})
    return rows, links


def files_for(globs):
    out = []
    for g in globs:
        out += sorted(glob.glob(os.path.join(REPO, g)))
    return [f for i, f in enumerate(out) if f not in out[:i]]


meta_files = files_for(meta_globs)
link_files = [f for f in files_for(link_globs) if f not in meta_files]
ROWS, LINKS = [], []
for f in meta_files:
    r, l = parse_file(f)
    ROWS += r
    LINKS += l
for f in link_files:
    _, l = parse_file(f)
    LINKS += l
rel = lambda p: os.path.relpath(p, REPO)
for r in ROWS:
    r['file'] = rel(r['file'])
for l in LINKS:
    l['file'] = rel(l['file'])
print(f'meta files {len(meta_files)}, link-only files {len(link_files)}, rows {len(ROWS)}, links {len(LINKS)}')
if PARSE_ONLY:
    for r in ROWS[:400]:
        print(r['file'].split('/')[-1][:40], r['line'], '|', r['title'][:70], '|', r['venue'], '|', r['year'], '|', r['urls'][:1])
    sys.exit(0)


# ---------------------------------------------------------------------------- identifiers
def doi_of(u):
    m = re.search(r'doi\.org/(10\.\d{4,9}/[^\s?#]+)', u)
    if m:
        return urllib.parse.unquote(m.group(1)).rstrip('/')
    m = re.search(r'dl\.acm\.org/doi/(?:abs/|full/|pdf/)?(10\.\d{4,9}/[^\s?#]+)', u)
    return urllib.parse.unquote(m.group(1)).rstrip('/') if m else None


def arxiv_of(u):
    m = re.search(r'arxiv\.org/(?:abs|pdf|html)/(\d{4}\.\d{4,5}|[a-z\-]+(?:\.[A-Z]{2})?/\d{7})(v\d+)?', u)
    return m.group(1) if m else None


all_urls = sorted({l['url'] for l in LINKS} | {u for r in ROWS for u in r['urls']})
dois = sorted({d for u in all_urls for d in [doi_of(u)] if d})
arxivs = sorted({a for u in all_urls for a in [arxiv_of(u)] if a})
print(f'unique urls {len(all_urls)}, dois {len(dois)}, arxiv ids {len(arxivs)}')

# ---------------------------------------------------------------------------- Crossref / doi.org
DOI = {}
for d in dois:
    st, _, body = get('https://api.crossref.org/works/' + urllib.parse.quote(d, safe='/'), accept='application/json')
    rec = {'crossref': st}
    if st == 200:
        try:
            m = json.loads(body)['message']
            rec['title'] = (m.get('title') or [''])[0]
            rec['container'] = (m.get('container-title') or [''])[0]
            rec['event'] = (m.get('event') or {}).get('name', '')
            dp = (m.get('published-print') or m.get('published-online') or m.get('issued') or {}).get('date-parts', [[None]])
            rec['year'] = dp[0][0]
            rec['type'] = m.get('type')
        except Exception as e:  # noqa: BLE001
            rec['err'] = str(e)
    else:
        st2, _, b2 = get('https://doi.org/api/handles/' + urllib.parse.quote(d, safe='/'), accept='application/json')
        try:
            rec['handle'] = json.loads(b2).get('responseCode') if st2 == 200 else st2
        except Exception:  # noqa: BLE001
            rec['handle'] = st2
        if rec.get('handle') == 1:
            st3, _, b3 = get('https://api.datacite.org/dois/' + urllib.parse.quote(d, safe='/'), accept='application/json')
            if st3 == 200:
                try:
                    a = json.loads(b3)['data']['attributes']
                    rec['title'] = (a.get('titles') or [{}])[0].get('title', '')
                    rec['year'] = a.get('publicationYear')
                    rec['container'] = (a.get('container') or {}).get('title', '') or a.get('publisher', '')
                except Exception as e:  # noqa: BLE001
                    rec['err'] = str(e)
    DOI[d] = rec
    time.sleep(0.3)
print('crossref done')

# ---------------------------------------------------------------------------- arXiv API
ARX = {}
A = '{http://www.w3.org/2005/Atom}'
AX = '{http://arxiv.org/schemas/atom}'
for k in range(0, len(arxivs), 40):
    chunk = arxivs[k:k + 40]
    st, _, body = get('https://export.arxiv.org/api/query?max_results=100&id_list=' + ','.join(chunk))
    if st == 200:
        try:
            root = ET.fromstring(body)
            for e in root.findall(A + 'entry'):
                eid = e.findtext(A + 'id') or ''
                m = re.search(r'abs/(.+?)(v\d+)?$', eid)
                if not m:
                    continue
                ARX[m.group(1)] = {
                    'title': re.sub(r'\s+', ' ', e.findtext(A + 'title') or ''),
                    'published': (e.findtext(A + 'published') or '')[:10],
                    'journal_ref': e.findtext(AX + 'journal_ref') or '',
                    'comment': re.sub(r'\s+', ' ', e.findtext(AX + 'comment') or '')[:200],
                    'authors': [a.findtext(A + 'name') for a in e.findall(A + 'author')][:4],
                }
        except Exception as e:  # noqa: BLE001
            log('arxiv parse', e)
    time.sleep(3.5)
for a in arxivs:
    ARX.setdefault(a, {'missing': True})
print('arxiv done', sum(1 for v in ARX.values() if 'missing' not in v), 'of', len(arxivs))

# ---------------------------------------------------------------------------- Semantic Scholar batch
S2 = {}
ids = ['arXiv:' + a for a in arxivs] + ['DOI:' + d for d in dois]
for k in range(0, len(ids), 400):
    chunk = ids[k:k + 400]
    st, _, body = get('https://api.semanticscholar.org/graph/v1/paper/batch?fields=title,venue,year,publicationVenue,journal,externalIds,publicationDate',
                      data=json.dumps({'ids': chunk}).encode(), ctype='application/json', tries=6)
    if st == 200:
        try:
            for i, p in zip(chunk, json.loads(body)):
                if p:
                    S2[i] = {'title': p.get('title'), 'venue': p.get('venue') or (p.get('publicationVenue') or {}).get('name', ''),
                             'year': p.get('year'), 'journal': (p.get('journal') or {}).get('name', ''),
                             'date': p.get('publicationDate'), 'doi': (p.get('externalIds') or {}).get('DOI')}
        except Exception as e:  # noqa: BLE001
            log('s2 parse', e)
    time.sleep(3)
print('s2 done', len(S2))

# ---------------------------------------------------------------------------- venue listings (CVF, ECVA, NeurIPS)
LISTS = {}
for name, url in [('CVPR 2023', 'https://openaccess.thecvf.com/CVPR2023?day=all'),
                  ('ICCV 2023', 'https://openaccess.thecvf.com/ICCV2023?day=all'),
                  ('CVPR 2024', 'https://openaccess.thecvf.com/CVPR2024?day=all'),
                  ('CVPR 2025', 'https://openaccess.thecvf.com/CVPR2025?day=all'),
                  ('ICCV 2025', 'https://openaccess.thecvf.com/ICCV2025?day=all'),
                  ('CVPR 2026', 'https://openaccess.thecvf.com/CVPR2026?day=all'),
                  ('WACV 2025', 'https://openaccess.thecvf.com/WACV2025'),
                  ('WACV 2026', 'https://openaccess.thecvf.com/WACV2026'),
                  ('ECVA', 'https://www.ecva.net/papers.php'),
                  ('NeurIPS 2023', 'https://papers.nips.cc/paper_files/paper/2023'),
                  ('NeurIPS 2024', 'https://papers.nips.cc/paper_files/paper/2024'),
                  ('NeurIPS 2025', 'https://papers.nips.cc/paper_files/paper/2025')]:
    st, _, body = get(url, timeout=120)
    if st != 200:
        LISTS[name] = None
        log('listing', name, st)
        continue
    txt = body.decode('utf-8', 'replace')
    titles = set()
    if name == 'ECVA':
        # papers.php groups papers by year under headings "ECCV 2024 Papers" etc.
        for part in re.split(r'(?=ECCV\s+20\d\d\s+Papers)', txt):
            m = re.match(r'ECCV\s+(20\d\d)', part)
            yr = m.group(1) if m else '?'
            for t in re.findall(r'<dt class="ptitle">\s*<br>\s*<a[^>]*>([^<]+)</a>', part):
                titles.add((norm(t), 'ECCV ' + yr))
            for t in re.findall(r'class="ptitle"[^>]*>(?:\s*<br>)?\s*<a[^>]*>([^<]+)</a>', part):
                titles.add((norm(t), 'ECCV ' + yr))
        LISTS[name] = titles
    else:
        pat = r'<dt class="ptitle">\s*<br>\s*<a[^>]*>([^<]+)</a>' if 'thecvf' in url else r'<a title="paper title" href="[^"]*">([^<]+)</a>|<a href="/paper_files/paper/20\d\d/hash/[^"]*">([^<]+)</a>'
        for m in re.finditer(pat, txt):
            t = next(g for g in m.groups() if g)
            titles.add((norm(t), name))
        LISTS[name] = titles
    log('listing', name, len(LISTS[name] or []))
LIST_INDEX = {}
for name, ts in LISTS.items():
    for t, v in ts or []:
        LIST_INDEX.setdefault(t, set()).add(v)
print('listings:', {k: (len(v) if v is not None else None) for k, v in LISTS.items()})


def listing_hits(title):
    n = norm(title)
    if not n:
        return []
    if n in LIST_INDEX:
        return sorted(LIST_INDEX[n])
    # prefix match for titles quoted without subtitle, or with a subtitle the listing drops
    out = set()
    if len(n) > 25:
        for t, vs in LIST_INDEX.items():
            if t.startswith(n) or n.startswith(t) and len(t) > 25:
                out |= vs
    return sorted(out)


# ---------------------------------------------------------------------------- DBLP and OpenReview by title
uniq_titles = sorted({r['title'] for r in ROWS if r['title'] and re.search(r'[A-Za-z]{3}', r['title'])})
DBLP, OR = {}, {}
for t in uniq_titles:
    q = re.sub(r'[^A-Za-z0-9 \-]', ' ', html.unescape(t))
    q = re.sub(r'\s+', ' ', q).strip()
    st, _, body = get('https://dblp.org/search/publ/api?format=json&h=10&q=' + urllib.parse.quote(q))
    hits = []
    if st == 200:
        try:
            for h in (json.loads(body)['result']['hits'].get('hit') or []):
                inf = h['info']
                hits.append({'title': inf.get('title', ''), 'venue': inf.get('venue', '') if isinstance(inf.get('venue'), str) else ' / '.join(inf.get('venue') or []),
                             'year': inf.get('year'), 'type': inf.get('type'), 'doi': inf.get('doi'), 'ee': inf.get('ee'),
                             'authors': [a.get('text') for a in ((inf.get('authors') or {}).get('author') or []) if isinstance(a, dict)][:4]
                             if isinstance((inf.get('authors') or {}).get('author'), list) else [], 's': sim(t, inf.get('title', ''))})
        except Exception as e:  # noqa: BLE001
            log('dblp parse', t, e)
    DBLP[t] = sorted(hits, key=lambda h: -h['s'])[:6]
    time.sleep(1.2)
print('dblp done')
for t in uniq_titles:
    st, _, body = get('https://api2.openreview.net/notes/search?term=' + urllib.parse.quote(t) + '&type=terms&content=all&source=forum&limit=6')
    hits = []
    if st == 200:
        try:
            for n in json.loads(body).get('notes', []):
                c = n.get('content', {})
                val = lambda k: (c.get(k) or {}).get('value') if isinstance(c.get(k), dict) else c.get(k)
                hits.append({'title': val('title') or '', 'venue': val('venue') or '', 'venueid': val('venueid') or '', 's': sim(t, val('title') or '')})
        except Exception as e:  # noqa: BLE001
            log('openreview parse', t, e)
    OR[t] = [h for h in sorted(hits, key=lambda h: -h['s']) if h['s'] >= 0.85][:3]
    time.sleep(1.0)
print('openreview done')
NOLINK = {}
for t in sorted({r['title'] for r in ROWS if not r['urls'] and len(norm(r['title'])) > 12}):
    rec = {}
    st, _, body = get('https://api.semanticscholar.org/graph/v1/paper/search/match?fields=title,venue,year,externalIds,publicationVenue&query=' + urllib.parse.quote(t), tries=5)
    if st == 200:
        try:
            p = (json.loads(body).get('data') or [None])[0]
            if p:
                rec['s2'] = {'title': p.get('title'), 'venue': p.get('venue'), 'year': p.get('year'), 'ids': p.get('externalIds'), 's': sim(t, p.get('title'))}
        except Exception as e:  # noqa: BLE001
            log('s2 match', t, e)
    time.sleep(2)
    q = ' AND '.join('ti:' + w for w in re.findall(r'[A-Za-z0-9]{4,}', t)[:8])
    st, _, body = get('https://export.arxiv.org/api/query?max_results=3&search_query=' + urllib.parse.quote(q))
    if st == 200:
        try:
            root = ET.fromstring(body)
            rec['arxiv'] = [{'id': (e.findtext(A + 'id') or '').split('/abs/')[-1], 'title': re.sub(r'\s+', ' ', e.findtext(A + 'title') or ''),
                             'published': (e.findtext(A + 'published') or '')[:10], 'comment': re.sub(r'\s+', ' ', e.findtext(AX + 'comment') or '')[:160],
                             's': sim(t, e.findtext(A + 'title') or '')} for e in root.findall(A + 'entry')]
        except Exception as e:  # noqa: BLE001
            log('arxiv search', t, e)
    time.sleep(3.5)
    NOLINK[t] = rec
print('no-link lookups done', len(NOLINK))

# ---------------------------------------------------------------------------- other URLs
HTTP = {}
for u in all_urls:
    if doi_of(u) or arxiv_of(u):
        continue
    st, final, body = get(u, tries=2, timeout=40)
    title = ''
    if isinstance(st, int) and st < 400:
        txt = body[:400000].decode('utf-8', 'replace')
        m = re.search(r'<div id="papertitle">\s*([^<]+)', txt) or re.search(r'<meta name="citation_title" content="([^"]+)"', txt) \
            or re.search(r'<title[^>]*>([\s\S]*?)</title>', txt, re.I)
        title = re.sub(r'\s+', ' ', html.unescape(m.group(1))).strip()[:200] if m else ''
    HTTP[u] = {'status': st, 'final': final if final != u else '', 'title': title}
    time.sleep(0.4)
print('http done', len(HTTP))


# ---------------------------------------------------------------------------- assemble
def link_info(u):
    d, a = doi_of(u), arxiv_of(u)
    if d:
        r = DOI.get(d, {})
        ok = r.get('crossref') == 200 or r.get('handle') == 1
        return {'kind': 'doi', 'id': d, 'ok': ok, 'title': r.get('title', ''), 'venue': r.get('container') or r.get('event', ''),
                'year': r.get('year'), 's2': S2.get('DOI:' + d)}
    if a:
        r = ARX.get(a, {})
        return {'kind': 'arxiv', 'id': a, 'ok': 'missing' not in r, 'title': r.get('title', ''), 'year': (r.get('published') or '')[:4],
                'venue': r.get('journal_ref', ''), 'comment': r.get('comment', ''), 's2': S2.get('arXiv:' + a)}
    r = HTTP.get(u, {})
    st = r.get('status')
    return {'kind': 'web', 'id': u, 'ok': isinstance(st, int) and st < 400, 'status': st, 'title': r.get('title', ''), 'final': r.get('final', '')}


VENUE_ALIASES = [
    ('CVPR', ['cvpr', 'computer vision and pattern recognition']), ('ICCV', ['iccv', 'international conference on computer vision']),
    ('ECCV', ['eccv', 'european conference on computer vision']), ('NeurIPS', ['neurips', 'nips', 'neural information processing']),
    ('ICLR', ['iclr', 'learning representations']), ('ICML', ['icml', 'international conference on machine learning']),
    ('3DV', ['3dv', '3d vision']), ('SIGGRAPH', ['siggraph', 'trans graph', 'transactions on graphics', 'tog']),
    ('TOG', ['trans graph', 'transactions on graphics', 'tog', 'siggraph']), ('IJCV', ['int j comput vis', 'international journal of computer vision', 'ijcv']),
    ('TPAMI', ['pattern anal mach intell', 'pattern analysis and machine intelligence', 'tpami', 'pami']),
    ('PAMI', ['pattern anal mach intell', 'pattern analysis and machine intelligence', 'pami']),
    ('ICRA', ['icra', 'robotics and automation']), ('IROS', ['iros', 'intelligent robots and systems']),
    ('RSS', ['robotics science and systems', 'rss']), ('T-RO', ['trans robotics', 'transactions on robotics']),
    ('TRO', ['trans robotics', 'transactions on robotics']), ('RA-L', ['robotics and automation letters', 'robotics autom lett', 'ra l']),
    ('IJRR', ['int j robotics res', 'international journal of robotics research']), ('ISMAR', ['ismar', 'mixed and augmented reality']),
    ('TVCG', ['trans vis comput graph', 'visualization and computer graphics', 'tvcg']), ('BMVC', ['bmvc', 'british machine vision']),
    ('WACV', ['wacv', 'winter conference on applications of computer vision']), ('SGP', ['sgp', 'geometry processing']),
    ('Eurographics', ['eurographics', 'comput graph forum', 'computer graphics forum']), ('CGF', ['comput graph forum', 'computer graphics forum']),
    ('ACM MM', ['acm multimedia']), ('ISPRS', ['isprs']), ('IJCAI', ['ijcai']), ('AAAI', ['aaai']), ('CoRL', ['corl', 'conference on robot learning']),
    ('ICPR', ['icpr', 'pattern recognition']), ('IJCV', ['ijcv']), ('CACM', ['commun acm', 'communications of the acm']),
    ('UIST', ['uist']), ('CHI', ['chi', 'human factors in computing']), ('IEEE VR', ['ieee vr', 'virtual reality']), ('VR', ['virtual reality', 'ieee vr']),
]


def venue_keys(v):
    v0 = norm(v)
    keys = []
    for k, al in VENUE_ALIASES:
        if re.search(r'\b' + re.escape(norm(k)) + r'\b', v0):
            keys.append((k, al))
    return keys


def venue_match(cited, found_strings):
    keys = venue_keys(cited)
    if not keys:
        return None  # unknown venue name, or a preprint: not judged
    blob = ' | '.join(norm(s) for s in found_strings if s)
    return any(any(re.search(r'\b' + re.escape(a) + r'\b', blob) for a in al) for k, al in keys)


out_rows = []
for r in ROWS:
    li = [link_info(u) for u in r['urls']]
    paper_links = [x for x in li if x['kind'] in ('doi', 'arxiv') or 'thecvf' in x['id'] or 'ecva' in x['id']]
    best_link_sim = max([sim(r['title'], x.get('title', '')) for x in li] or [0])
    dbl = DBLP.get(r['title'], [])
    dbl_good = [h for h in dbl if h['s'] >= 0.88]
    dbl_pub = [h for h in dbl_good if h['venue'] != 'CoRR']
    orh = OR.get(r['title'], [])
    lst = listing_hits(r['title'])
    s2s = [x['s2'] for x in li if x.get('s2')]
    found_venues = [h['venue'] for h in dbl_pub] + [h['venue'] for h in orh] + lst + [s.get('venue', '') for s in s2s] + \
        [s.get('journal', '') for s in s2s] + [x.get('venue', '') for x in li] + [x.get('comment', '') for x in li]
    found_years = {str(h['year']) for h in dbl_pub if h.get('year')} | {str(s.get('year')) for s in s2s if s.get('year')} | \
        {str(x.get('year')) for x in li if x.get('year')} | {v.split()[-1] for v in lst} | \
        {m for h in orh for m in re.findall(r'20\d\d', h.get('venue', '') + ' ' + h.get('venueid', ''))}
    flags = []
    if any(not x['ok'] for x in li):
        flags.append('LINK_FAIL')
    if paper_links and best_link_sim < 0.75:
        flags.append('LINK_TITLE')
    if not r['urls']:
        flags.append('NO_LINK')
    vm = venue_match(r['venue'], found_venues)
    if vm is False:
        flags.append('VENUE?')
    if r['year'] and re.fullmatch(r'(19|20)\d\d', r['year']) and found_years and r['year'] not in found_years:
        flags.append('YEAR?')
    if not dbl_good and not orh and not lst and not s2s and not paper_links:
        flags.append('NOT_FOUND')
    out_rows.append({**{k: r[k] for k in ('file', 'line', 'title', 'venue', 'year', 'urls')}, 'flags': flags, 'links': li,
                     'dblp': dbl[:3], 'openreview': orh, 'listings': lst, 's2': s2s, 'found_years': sorted(found_years)})

json.dump({'rows': out_rows, 'nolink': NOLINK, 'doi': DOI, 'arxiv': ARX, 's2': S2, 'http': HTTP, 'dblp': DBLP, 'openreview': OR},
          open(os.path.join(OUT, 'rows.json'), 'w'), ensure_ascii=False, indent=1)


def short(x):
    return re.sub(r'\s+', ' ', str(x or ''))[:90]


with open(os.path.join(OUT, 'rows.tsv'), 'w') as f:
    f.write('flags\tfile:line\ttitle\tcited venue\tcited year\tlink title (sim)\tDBLP best\tOpenReview\tlistings\tS2\n')
    for r in out_rows:
        lt = '; '.join(f"{x['kind']}:{short(x.get('title'))} ({sim(r['title'], x.get('title', ''))}) {x.get('venue', '') or ''} {x.get('year', '') or ''}".strip()
                       for x in r['links'])
        db = '; '.join(f"{short(h['title'])[:60]} [{h['venue']} {h['year']}] s={h['s']}" + (f" doi={h['doi']}" if not r['urls'] and h.get('doi') else '')
                       for h in r['dblp'][:2])
        nl = NOLINK.get(r['title'])
        if nl:
            db += ' || S2: ' + json.dumps(nl.get('s2'), ensure_ascii=False)[:200] + ' || arXiv: ' + '; '.join(
                f"{a['id']} {short(a['title'])[:50]} s={a['s']}" for a in nl.get('arxiv', [])[:2])
        orr = '; '.join(f"{h['venue'] or h['venueid']} s={h['s']}" for h in r['openreview'])
        s2 = '; '.join(f"{s.get('venue') or s.get('journal')} {s.get('year')}" for s in r['s2'])
        f.write('\t'.join([','.join(r['flags']) or 'ok', f"{r['file'].split('/')[-1][:48]}:{r['line']}", short(r['title']), short(r['venue']), r['year'],
                           lt, db, orr, ','.join(r['listings']), s2]) + '\n')

with open(os.path.join(OUT, 'links.tsv'), 'w') as f:
    f.write('ok\tkind\turl\tresolved title / status\tused in\n')
    used = {}
    for l in LINKS:
        used.setdefault(l['url'], []).append(f"{l['file'].split('/')[-1][:40]}:{l['line']}")
    for u in all_urls:
        x = link_info(u)
        f.write('\t'.join(['ok' if x['ok'] else 'FAIL', x['kind'], u, short(x.get('title') or x.get('status')) + (' -> ' + x['final'] if x.get('final') else ''),
                           ' '.join(used.get(u, [])[:4])]) + '\n')

# claims: venue/year per paper (keyed by arXiv id / DOI / title) across files
claims = {}
for r in out_rows:
    key = next((x['id'] for x in r['links'] if x['kind'] in ('arxiv', 'doi')), None) or norm(r['title'])[:60]
    claims.setdefault(key, set()).add((r['venue'], r['year'], r['file'].split('/')[-1][:46]))
with open(os.path.join(OUT, 'claims.tsv'), 'w') as f:
    for k, cs in sorted(claims.items()):
        vy = {(v, y) for v, y, _ in cs}
        if len(vy) > 1:
            f.write(k + '\n' + ''.join(f'\t{v} | {y} | {fn}\n' for v, y, fn in sorted(cs)))
nflag = sum(1 for r in out_rows if r['flags'])
print(f'rows {len(out_rows)}, flagged {nflag}, link failures {sum(1 for u in all_urls if not link_info(u)["ok"])}')
