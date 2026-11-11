# In single-dollar inline math, protect \{ \} \! from kramdown's backslash escapes by doubling the backslash
# (kramdown turns \\ into \, so MathJax receives \{ \} \!). Skips fenced code, inline code and $$ math.
import re, sys
pat = re.compile(r'(?<!\\)\\([{}!])')
for path in sys.argv[1:]:
    lines = open(path, encoding='utf-8').read().split('\n')
    infence = indisp = False; n = 0
    for i, ln in enumerate(lines):
        if ln.lstrip().startswith('```'): infence = not infence; continue
        if infence: continue
        if ln.count('$$') % 2 == 1: indisp = not indisp; continue
        if indisp or '$' not in ln: continue
        # split out inline code and $$..$$ so they are left untouched
        parts = re.split(r'(`[^`]*`|\$\$.*?\$\$)', ln)
        for j in range(0, len(parts), 2):
            def fix(m):
                return '$' + pat.sub(r'\\\\\1', m.group(1)) + '$'
            parts[j] = re.sub(r'(?<![\\$])\$([^$]+?)(?<!\\)\$(?!\$)', fix, parts[j])
        new = ''.join(parts)
        if new != ln: lines[i] = new; n += 1
    if n:
        open(path, 'w', encoding='utf-8').write('\n'.join(lines)); print(path, 'lines changed:', n)
