# Local tools for the November plan (3d-vision series, Lab demos)

These are copies of the tools that live in the Claude session's scratchpad during the work, kept here in
case the cloud container is recreated and the scratchpad is lost.

Scratchpad: `/tmp/claude-0/-home-user-takuyy/0c443e9e-c3ce-5795-8d74-9c6cb688c2ab/scratchpad`
(`docs/plans/2026-11-3d-vision-and-lab.md` on main refers to these absolute paths).

| File here | Scratchpad path | What it does |
| --- | --- | --- |
| `tools/site-build-local` | `tools/site-build-local` | Jekyll build of a worktree with the gems of `/home/user/website` (imagemagick off) |
| `tools/site-check-local.js` | `tools/site-check-local.js` | Playwright check of posts or `home` (Lab tabs), SwiftShader WebGL, screenshots |
| `scan/math_scan.py` | `scan/math_scan.py` | Inline-math problems from kramdown, in built HTML and post sources; must print `hits: 0` |
| `scan/fix_inline_*.py` | `scan/` | One-off fixers for `\{ \} \!` and matrix row breaks in inline math |
| `mj/overflow.js`, `mj/wide_shot.js` | `mj/` | Overflow check with MathJax 3.2.2 served locally (`npm pack mathjax@3.2.2`, unpack into `mj/package`) |
| `nov-wave-a.js`, `nov-wave-b.js` | `nov-wave-b.js` | Workflow scripts of wave A (done) and wave B |

## Restore after a container reset

```bash
SP=/tmp/claude-0/-home-user-takuyy/0c443e9e-c3ce-5795-8d74-9c6cb688c2ab/scratchpad
mkdir -p $SP && cd $SP
git -C /home/user/takuyy fetch origin ops/local
git -C /home/user/takuyy archive FETCH_HEAD ops/local | tar x --strip-components=2
chmod +x tools/site-build-local
(cd mj && npm pack mathjax@3.2.2 --silent && tar xzf mathjax-3.2.2.tgz)

# the main clone with installed gems, used by site-build-local
git clone https://github.com/Amadeusyzh/Takuyy.git /home/user/website
cd /home/user/website && bundle config set --local path vendor/bundle && bundle install
git -C /home/user/takuyy config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
grep -qx '/.claude/' /home/user/takuyy/.git/info/exclude || echo '/.claude/' >> /home/user/takuyy/.git/info/exclude
```

Commits use the author `yangzehua <yangzehua@akane.waseda.jp>` (set it with GIT_AUTHOR_* /
GIT_COMMITTER_* variables, not in the shared git config) and end with the two trailer lines from the plan.
