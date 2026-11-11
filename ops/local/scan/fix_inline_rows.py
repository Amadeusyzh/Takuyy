# In single-dollar inline math that holds an environment (\begin{...}), double the row separator \\ -> \\\\
# so kramdown's backslash escape leaves \\ for MathJax. Skips fenced code and $$ blocks. Usage: fix_inline_rows.py FILE...
import re, sys
for path in sys.argv[1:]:
    lines = open(path, encoding='utf-8').read().split('\n')
    infence = False; indisplay = False; changed = 0
    for i, ln in enumerate(lines):
        if ln.lstrip().startswith('```'):
            infence = not infence; continue
        if infence: continue
        if ln.count('$$') % 2 == 1: indisplay = not indisplay; continue
        if indisplay or '$$' in ln or '\\begin{' not in ln: continue
        def fix(m):
            t = m.group(1)
            if '\\begin{' not in t: return m.group(0)
            t2 = re.sub(r'(?<!\\)\\\\(?!\\)', r'\\\\\\\\', t)
            return '$' + t2 + '$'
        new = re.sub(r'(?<![\\$])\$([^$]+?)(?<!\\)\$(?!\$)', fix, ln)
        if new != ln: lines[i] = new; changed += 1
    open(path, 'w', encoding='utf-8').write('\n'.join(lines))
    print(path, 'lines changed:', changed)
