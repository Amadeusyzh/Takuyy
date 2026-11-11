export const meta = {
  name: 'nov-wave-a',
  description: 'Wave A: four new Interactive Lab demos (radiance cascades, MLS-MPM, SDF sculpting, clouds and sky), 3D vision posts 01-03, then Lab integration',
  phases: [
    { title: 'Build', detail: 'four Lab demos and three 3d-vision posts, one worker each in its own worktree' },
    { title: 'Integrate', detail: 'wire the new demos into the home-page Lab' },
  ],
}

const PLAN = 'docs/plans/2026-11-3d-vision-and-lab.md'
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

const DEMOS = [
  { id: 'rc', name: '2D global illumination with Radiance Cascades' },
  { id: 'mpm', name: 'MLS-MPM 2D materials (water, jelly, snow)' },
  { id: 'sdf', name: 'SDF sculpting by sphere tracing' },
  { id: 'sky', name: 'Volumetric clouds and atmosphere' },
]
const POSTS = [
  { nn: '01', slug: '3d-vision-01-image-formation-and-camera-models',
    extra: 'You write the first post, so you also create bin/figures/3d-vision/make_all.py (generic: runs every vision3d_*.py in its folder, like bin/figures/graphics/make_all.py), and create docs/reading-lists/3d-vision.md with its title. Your post opens the series: give a short series map linking all ten planned slugs from the plan, and say who the series is for.' },
  { nn: '02', slug: '3d-vision-02-camera-calibration', extra: 'Do not create make_all.py; the post-01 worker does.' },
  { nn: '03', slug: '3d-vision-03-features-and-matching', extra: 'Do not create make_all.py; the post-01 worker does.' },
]

const common = `First read ${PLAN} in full, together with CLAUDE.md and docs/BLOG_GUIDE.md. Follow the plan's "Process for every worker" section exactly. In particular:
- create your branch with: git fetch origin main && git checkout -B <branch> FETCH_HEAD;
- use the two tools at the absolute paths given there;
- commit with the trailers;
- push with: git push -u origin <branch>.
You are in a fresh git worktree; stay inside it. Other workers run in parallel on other branches; touch only your own files.
Content quality comes first. This is the owner's from-scratch learning material.
When finished, return the structured report: branch, whether the push succeeded, a summary of what you made (counts of words, figures and widgets, or the demo's features), the main files, and open issues.`

phase('Build')
const demoRuns = parallel(DEMOS.map((d) => () => agent(
  `Build the new Interactive Lab demo "${d.id}" (${d.name}) for the home page, exactly as specified in the "Interactive Lab: new home-page demos" section of ${PLAN} (its row in the table, and the contract for a demo worker).
Your branch is w/lab-${d.id}. You create only:
- assets/js/lab-${d.id}.js
- _includes/lab-panel-${d.id}.liquid
- (optionally) small test files outside the repository.
Do not edit _includes/lab.liquid, _data/ or other demos; an integration step wires the tab in afterwards.
The demo must look advanced and be technically faithful, with a short caption explaining the technique and a link to the related blog post.
Test it thoroughly in a standalone page with Playwright and SwiftShader at 390 and 1100 px: render, drag/tap, every control, no console errors. Look at the screenshots and fix what looks wrong.
${common}`,
  { label: `lab:${d.id}`, phase: 'Build', isolation: 'worktree', effort: 'high', schema: RESULT },
)))
const postRuns = parallel(POSTS.map((p) => () => agent(
  `Write post ${p.nn} of the new "3d-vision" series ("3D Vision Fundamentals"): slug ${p.slug}, in all three languages (en-us, zh-cn, ja-jp). Its scope and widget are in the series table of ${PLAN}.
${p.extra}
Your branch is w/3dv-${p.nn}.
Run every code snippet and figure script; captions must match the computed numbers. Build the site, then check the post with site-check-local (all languages, 390 and 1100 px). Look at the element screenshots and fix problems.
${common}`,
  { label: `3dv:${p.nn}`, phase: 'Build', isolation: 'worktree', effort: 'high', schema: RESULT },
)))

const demos = (await demoRuns).filter(Boolean)
log(`demos finished: ${demos.map((d) => d.branch + (d.pushed ? '' : ' (NOT pushed)')).join(', ')}`)

phase('Integrate')
const pushedDemos = demos.filter((d) => d.pushed).map((d) => d.branch)
const integration = pushedDemos.length ? await agent(
  `Integrate the new Interactive Lab demos into the home page.
Branch: w/lab-integrate. Create it with: git fetch origin main && git checkout -B w/lab-integrate FETCH_HEAD.
Then merge these pushed demo branches (git fetch origin <branch> && git merge --no-ff FETCH_HEAD, with the trailers): ${pushedDemos.join(', ')}.
Read ${PLAN} (section "Interactive Lab: new home-page demos"), _includes/lab.liquid and assets/js/lab.js first. Then, in _includes/lab.liquid:
- add a tab button for each merged demo after the existing five, following their markup: id lab-tab-<id>, aria-controls lab-<id>, label {{ t.tab_<id> }};
- include each panel with {% include lab-panel-<id>.liquid %} after the existing panels;
- load each script with a deferred <script> line like the existing ones.
Add the tab_<id> labels under "lab:" in _data/en-us/strings.yml, _data/zh-cn/strings.yml and _data/ja-jp/strings.yml. Keep them short; for example en "Radiance cascades" / zh "辐射级联" / ja "ラディアンスカスケード", and similar for MPM, SDF sculpting and Clouds & sky. If the Lab intro text lists the demos, mention the new ones in all three languages.
Make sure the tab row stays usable on a 390 px phone.
Build the site. Run site-check-local on "home" with LAB_TABS set to the new tab ids, for all languages at 390 and 1100 px. Look at the panel screenshots and fix problems, including inside the demo files.
Commit with the trailers and push w/lab-integrate.
Return the structured report.`,
  { label: 'lab:integrate', phase: 'Integrate', isolation: 'worktree', effort: 'high', schema: RESULT },
) : null
const posts = (await postRuns).filter(Boolean)
return { demos, posts, integration }
