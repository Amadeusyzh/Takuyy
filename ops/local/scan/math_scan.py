# Finds inline math ($...$) that kramdown alters. Usage: python3 math_scan.py <repo>/_site [substring filter]
# 1. Built HTML: <em>/<strong> inside $...$ (paired underscores or asterisks became emphasis), and tags inside $$...$$.
# 2. Sources (<repo>/_posts): in $...$, a single backslash before { } ! (kramdown eats it; write \\{ \\} \\!),
#    and matrix row breaks written as \\ inside an environment (write \\\\).
# Prints one line per problem and "hits: N" at the end.
import re, sys, pathlib, html

site = pathlib.Path(sys.argv[1]).resolve()
filt = sys.argv[2] if len(sys.argv) > 2 else ''
hits = 0

for f in sorted(site.rglob('index.html')):
    if filt and filt not in str(f):
        continue
    s = f.read_text(encoding='utf-8', errors='replace')
    m = re.search(r'<article[\s\S]*?</article>', s)
    if not m:
        continue
    body = re.sub(r'<(pre|code|script|style)\b[\s\S]*?</\1>', ' ', m.group(0))
    for d in re.finditer(r'\$\$([\s\S]*?)\$\$', body):
        if re.search(r'</?(em|strong|a|p|br)\b', d.group(1)):
            hits += 1
            print(f'{f}: HTML display math has tags: {html.unescape(d.group(1))[:140]!r}')
    body2 = re.sub(r'\$\$[\s\S]*?\$\$', ' ', body)
    for seg in re.finditer(r'(?<![\\$])\$([^$\n]{1,400}?)(?<!\\)\$(?!\$)', body2):
        if re.search(r'</?(em|strong)\b', seg.group(1)):
            hits += 1
            print(f'{f}: HTML inline math has emphasis: {html.unescape(seg.group(1))[:140]!r}')

posts = site.parent / '_posts'
single = re.compile(r'(?<!\\)\\([{}!])')
rowsep = re.compile(r'(?<!\\)\\\\(?!\\)')
for f in sorted(posts.rglob('*.md')) if posts.is_dir() else []:
    if filt and filt not in f.name:
        continue
    infence = indisp = False
    for i, ln in enumerate(f.read_text(encoding='utf-8').split('\n'), 1):
        if ln.lstrip().startswith('```'):
            infence = not infence
            continue
        if infence:
            continue
        if ln.count('$$') % 2 == 1:
            indisp = not indisp
            continue
        if indisp or '$' not in ln:
            continue
        l2 = re.sub(r'`[^`]*`', ' ', re.sub(r'\$\$.*?\$\$', ' ', ln))
        for seg in re.finditer(r'(?<![\\$])\$([^$]+?)(?<!\\)\$(?!\$)', l2):
            t = seg.group(1)
            if single.search(t):
                hits += 1
                print(f'{f}:{i}: source inline math needs \\\\{{ \\\\}} \\\\! : {t[:120]!r}')
            if 'begin{' in t and rowsep.search(t):
                hits += 1
                print(f'{f}:{i}: source inline matrix row break needs \\\\\\\\ : {t[:120]!r}')
print('hits:', hits)
