export const meta = {
  name: 'nov-wave-b',
  description: 'Wave B: 3D vision posts 04-10, each followed by an adversarial verification; verification of posts 01-03; series integration; zh-cn learner review of 01-10',
  phases: [
    { title: 'Write', detail: 'posts 04-10 of the 3d-vision series, one worker each in its own worktree' },
    { title: 'Verify', detail: 'one independent verifier per post (01-10): citations, claims, derivations, code, scope; fixes on the branch' },
    { title: 'Series', detail: 'merge everything, roadmap stage, reading list, cross-links, neural-rendering-01 pointer' },
    { title: 'Review', detail: 'two zh-cn learner reviews: posts 01-05 and 06-10' },
  ],
}

const PLAN = 'docs/plans/2026-11-3d-vision-and-lab.md'
const TOOLS = '/tmp/claude-0/-home-user-takuyy/0c443e9e-c3ce-5795-8d74-9c6cb688c2ab/scratchpad'
const RESULT = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    pushed: { type: 'boolean' },
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['branch', 'pushed', 'summary', 'issues'],
}

const NEW_POSTS = [
  { nn: '04', slug: '3d-vision-04-two-view-geometry' },
  { nn: '05', slug: '3d-vision-05-multi-view-geometry-and-bundle-adjustment' },
  { nn: '06', slug: '3d-vision-06-visual-slam' },
  { nn: '07', slug: '3d-vision-07-depth-estimation-and-multi-view-stereo' },
  { nn: '08', slug: '3d-vision-08-3d-representations' },
  { nn: '09', slug: '3d-vision-09-3d-reconstruction-classic-to-feed-forward' },
  { nn: '10', slug: '3d-vision-10-3d-vision-for-ar-vr',
    extra: 'This is the last post and the owner\'s own research area (AR/VR). Be precise and concrete; state nothing about the owner. End the series with pointers to the neural-rendering, world-models and embodied-ai series.' },
]
const OLD_POSTS = [
  { nn: '01', slug: '3d-vision-01-image-formation-and-camera-models' },
  { nn: '02', slug: '3d-vision-02-camera-calibration' },
  { nn: '03', slug: '3d-vision-03-features-and-matching' },
]

const RULES = `Read ${PLAN} in full, together with docs/BLOG_GUIDE.md, and follow the plan's "Process for every worker" section: the build and check tools at the absolute paths given there, commits with the trailers, and git push -u origin <branch> at the end.
Inline math: follow the kramdown escaping rules in BLOG_GUIDE section 5. After every build run
  python3 ${TOOLS}/scan/math_scan.py <worktree>/_site 3d-vision
which checks the built HTML and the post sources and must report "hits: 0".
You are in a fresh git worktree; stay inside it. Other workers run in parallel on other branches; touch only the files your task names.
Content quality comes first. This is the owner's from-scratch learning material.`

const writePrompt = (p) => `Write post ${p.nn} of the "3d-vision" series ("3D Vision Fundamentals"): slug ${p.slug}, in all three languages (en-us, zh-cn, ja-jp). Its scope and widget are in the series table of ${PLAN}.
Branch: w/3dv-${p.nn}. Create it with: git fetch origin main && git checkout -B w/3dv-${p.nn} FETCH_HEAD.
Posts 01-03 are already on main. Read post 01 and the posts yours builds on, and keep their notation, symbols and conventions (OpenCV camera frame, K, R, t, homogeneous coordinates). Link back to them instead of re-deriving what they cover, and link forward to the later slugs from the plan where natural. Look at their figures and widgets to match the visual style.
${p.extra || ''}
bin/figures/3d-vision/make_all.py and docs/reading-lists/3d-vision.md already exist: do not recreate them; append your section "## ${p.nn} <topic>" at the end of the reading list.
About 5,000-8,000 words of English prose is typical for this series; go longer only where the topic needs it.
Run every code snippet and figure script; captions must match the computed numbers. Build the site, then check the post with site-check-local (all languages, 390 and 1100 px). Look at the element screenshots and fix problems.
${RULES}
Return the structured report: branch, whether the push succeeded, a summary (words, figures, widgets, what the post covers), the main files, and open issues.`

const verifyPrompt = (p, branch, base) => `Verify post ${p.nn} of the "3d-vision" series (slug ${p.slug}, all three languages) adversarially, and fix what is wrong. Another agent wrote it; assume nothing is right until you have checked it.
Branch: ${branch}. Create it with: git fetch origin ${base} && git checkout -B ${branch} FETCH_HEAD.
Check, in this order:
1. Citations. For every paper named in the text, the figures and the Representative papers table: title, authors, venue, year and link. Verify each with web search (results showing the arXiv abstract page, DOI, CVF/ACM/IEEE page or official project page). Fix wrong venues, years and ids; if a link cannot be verified, remove the link and keep the citation text. Recent work must carry its status (published / accepted / preprint) dated "as of November 2026". Check docs/reading-lists/3d-vision.md section ${p.nn} the same way.
2. Claims. Every statement of fact (what a method does, numbers quoted from papers, "state of the art", history): verify it, correct it, or soften it to what is supported.
3. Math. Re-derive every derivation step by step: signs, indices, transposes, dimensions, degrees of freedom, conventions consistent with post 01. Recompute every worked example.
4. Code and figures. Extract and run every code block of the post in order; printed outputs and numbers in the text must match. Run the post's figure script (bin/figures/3d-vision/vision3d_${p.nn}.py); captions must match its output.
5. Widgets. Check each widget's behaviour against its instructions and the text (site-check-local on the post; drag and tap; read the source where in doubt).
6. Scope. Compare the post with its row in the plan's series table; if a listed topic is missing or only named, add a concise subsection (all three languages).
Apply every fix in en-us, zh-cn and ja-jp. Keep edits targeted; do not restructure the post or change its slug. Build, run the math scan and site-check-local (all languages, 390 and 1100 px), commit and push ${branch}.
${RULES}
Return the structured report. In summary, list each problem you found (what was wrong, the evidence, what you changed), grouped by the six checks; say "none found" for a check that found nothing.`

phase('Write')
const newChains = pipeline(
  NEW_POSTS,
  (p) => agent(writePrompt(p), { label: `write:${p.nn}`, phase: 'Write', isolation: 'worktree', effort: 'high', schema: RESULT }),
  (w, p) => (w && w.pushed)
    ? agent(verifyPrompt(p, `w/3dv-${p.nn}`, `w/3dv-${p.nn}`), { label: `verify:${p.nn}`, phase: 'Verify', isolation: 'worktree', effort: 'high', schema: RESULT })
        .then((v) => ({ nn: p.nn, write: w, verify: v }))
    : { nn: p.nn, write: w, verify: null },
)
const oldChecks = parallel(OLD_POSTS.map((p) => () =>
  agent(verifyPrompt(p, `w/3dv-verify-${p.nn}`, 'main'), { label: `verify:${p.nn}`, phase: 'Verify', isolation: 'worktree', effort: 'high', schema: RESULT })
    .then((v) => ({ nn: p.nn, verify: v }))))
const [newPosts, oldPosts] = await Promise.all([newChains, oldChecks])
const chains = newPosts.filter(Boolean)
const postBranches = chains.filter((c) => c.write && c.write.pushed).map((c) => `w/3dv-${c.nn}`)
const verifyBranches = oldPosts.filter((c) => c && c.verify && c.verify.pushed).map((c) => `w/3dv-verify-${c.nn}`)
const missing = NEW_POSTS.filter((p) => !postBranches.includes(`w/3dv-${p.nn}`)).map((p) => p.nn)
log(`posts pushed: ${postBranches.join(', ') || 'none'}${missing.length ? '; NOT pushed: ' + missing.join(', ') : ''}; verified 01-03 branches: ${verifyBranches.join(', ') || 'none'}`)

phase('Series')
const series = postBranches.length ? await agent(
  `Integrate the "3d-vision" series ("3D Vision Fundamentals").
Branch: w/3dv-series. Create it with: git fetch origin main && git checkout -B w/3dv-series FETCH_HEAD.
Merge these branches one by one (git fetch origin <branch> && git merge --no-ff FETCH_HEAD, with the trailers): ${postBranches.concat(verifyBranches).join(', ')}. The first group holds the new posts 04-10 (already verified on their branches); the w/3dv-verify-* branches hold fixes to posts 01-03. docs/reading-lists/*.md use a union merge; fix any other conflict by hand, keeping both sides' fixes.${missing.length ? ' Posts ' + missing.join(', ') + ' are missing (their workers did not push): leave their links as plain text with "(coming soon)" in the matching language.' : ''}
Then, in all three languages where it applies:
1. Roadmap hub (_posts/<lang>/*roadmap-01-learning-roadmap.md): add a stage "1.5: 3D vision" between the graphics stage and the neural-rendering stage. Link every post of the series, one line each on what it teaches, and say why it comes before neural rendering (from images back to geometry). Follow the hub's existing format.
2. docs/reading-lists/3d-vision.md: one title, sections 01-10 in order with consistent headings ("## NN <topic>"), no duplicate rows within a section.
3. Cross-links: every link between 3d-vision posts must resolve. Build the site and list internal links whose target does not exist (scan _site for href="/Takuyy/..." whose file is missing); fix those in the 3d-vision posts. Post 01's series map must match the real slugs and titles. Each post's last line points to the next post; post 10 closes the series.
4. _posts/<lang>/*neural-rendering-01-cameras-and-multiview-geometry.md: add a short note near the start and a closing paragraph pointing to the 3d-vision series for the full treatment (link the relevant posts). Do not remove content.
5. Consistency across the series: one notation for the same quantity (K, R, t, P, E, F, H, pose direction world-to-camera), one Chinese and one Japanese term per concept (pick the dominant one and align the others), consistent front matter (categories, series, series_order, dates 2026-10-27 11:NN:00+0900).
Build the site; run python3 ${TOOLS}/scan/math_scan.py <worktree>/_site (must report "hits: 0"); run site-check-local on the roadmap hub, neural-rendering-01 and the ten 3d-vision posts with LANGS=en WIDTHS=390, then on the roadmap hub in all languages. Look at the screenshots and fix problems.
${RULES}
Commit and push w/3dv-series. Return the structured report, listing what you changed for each of the five items.`,
  { label: 'series', phase: 'Series', isolation: 'worktree', effort: 'high', schema: RESULT },
) : null

phase('Review')
const GROUPS = [
  { id: 'a', posts: '01-05' },
  { id: 'b', posts: '06-10' },
]
const reviews = series && series.pushed ? (await parallel(GROUPS.map((g) => () => agent(
  `Review posts ${g.posts} of the "3d-vision" series as a learner, mainly in Chinese (zh-cn), and fix what you find.
Branch: w/3dv-review-${g.id}. Create it with: git fetch origin w/3dv-series && git checkout -B w/3dv-review-${g.id} FETCH_HEAD.
The owner will study from these posts. Read each zh-cn post from start to end as a learner who knows linear algebra, calculus and Python but is new to 3D vision. Look for:
- symbols used before they are defined, jumps in derivations, steps that need one more line;
- wrong formulas, signs, indices or units; numbers in the text or captions that do not match what the code prints (re-run snippets where in doubt);
- unclear or unnatural Chinese (translationese, overly long sentences), terms that differ across posts (keep one Chinese term per concept, with the English term at first use);
- figures, captions and widget instructions that do not match the text;
- broken links; wrong paper venues or years (verify by web search before changing).
Fix the problems in zh-cn. When a fix changes content (a formula, number, explanation or link), make the same fix in en-us and ja-jp. Make targeted edits; do not rewrite whole sections, change slugs, or add new figures or widgets.
Commit as you go. Build the site; run the math scan; check your posts with site-check-local (LANGS=zh, both widths). Push w/3dv-review-${g.id}.
${RULES}
Return the structured report. In summary, list the changes by post (what was wrong, what you changed) and anything you could not resolve.`,
  { label: `review:${g.id}`, phase: 'Review', isolation: 'worktree', effort: 'high', schema: RESULT },
)))).filter(Boolean) : []

return { posts: chains, verified01to03: oldPosts.filter(Boolean), series, reviews }
