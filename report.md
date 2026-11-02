# Final report: Paper Digest 01, continuation run

I ran, fixed and verified the digest this time, and committed it in three commits on `api/digest`: `6f67f41`, `f703204` and `18cb134`. All pages build and pass `site-check` in all three languages at both widths.

## Paper Digest 01: October to November 2026

**Title:** "Paper Digest | October-November 2026: graphics, engines, neural rendering, world models, embodied AI and XR". The zh and ja titles follow the brief.

| Item | Count |
| --- | --- |
| English words | about 11,000 by a whitespace count with code, maths and URLs removed (the summary table is included). My earlier figure of about 7,000 was wrong. |
| Papers | 42 entries, 7 per category: 12 accepted, 30 preprints or technical reports |
| Background works | 10 in the Representative papers table |
| Figures | 7 placements from 11 SVG files; three figures have en/zh/ja versions |
| Widgets | 2: `paper-digest-explorer` and `paper-digest-form-factor` |

### What changed in this run

**Figures**
- `make_all.py` and `paper_digest_01.py` run without errors and produced every SVG. The hand-written SVGs from the earlier run are gone.
- I looked at each figure as a PNG and fixed three layout problems:
  - the overview legend covered the bars;
  - the column headers of the relation-to-CG matrix overlapped each other;
  - two labels in the schematics were cut off or sat on a line.
- There were no `{% comment %}` wrappers to remove.
- Captions match the script output, including the form-factor values 0.00796 and 0.00199 and the matrix column totals 21/24/15/18/11/14.

**New schematic for entry 29 (Splat2Act)**
- A new figure, `01-real2sim2real_{en,zh,ja}.svg`, shows the pipeline: phone scan, then 3DGS twin, then tasks and demonstrations generated in simulation, then two-stage fine-tuning of the robot policy (VLA), then the real robot.
- It also plots the success rates reported in the paper's abstract: 0% before fine-tuning, 62.5% after, and on the same 12 tasks 66.7% in simulation against 63.9% on the real robot.
- The 66.7% comparison came from the abstract. I rewrote entry 29 in all three languages to compare like with like.

**Code**
- The only snippet, the form-factor Python code, runs in all three languages and prints the values the text quotes.

**Widgets**
- Both widgets are ASCII-only and pass `node --check`.
- Non-ASCII text is now stored as real `\uXXXX` escapes, as the brief asks, instead of the earlier `@XXXX` workaround. 361 escapes were converted.
- The form-factor readout now has commas between its values.
- I checked the widget's numbers by hand on a screenshot. The caption's claim that $F$ drops to 0 at a tilt of +45° is correct: $\cos\theta_j = 0.707(\cos t - \sin t)$ is zero at $t = 45°$.

### What I verified, and how

**Pages:** `site-check` reports 7 figures, 2 widgets, no broken images, no horizontal overflow, no unrendered math and no console errors on all six pages. I also looked at the 390 px screenshots of both widgets, the new schematic and the matrix.

**Citations:**
- One arXiv API query covered all 42 entries plus the 9 background papers. Title, first author and first-submission date matched for every entry. Author counts and "with X" names also matched; the only difference is that arXiv spells "Taku komura" in lower case. Every accepted-status label matches the arXiv comments field.
- I compared every number in the "the authors report …" sentences with the arXiv abstracts. All of them appear there.
- The 9 "verified but left out" candidates in the reading list are now checked against the API as well.

**Links:** all 27 project and code links return HTTP 200. `kesen.realtimerendering.com` returns 406 to scripts, but that is a well-known site that blocks automated requests. `dynamicskinning.com` permanently redirects to `velocityskinning.com`, which is the link the post uses.

**Window:** an arXiv query for cs.GR papers submitted 30 October to 2 November finds only two minor papers. I added them to the reading-list candidates, so in practice the issue covers 1 to 29 October.

### Open issues and uncertain facts

- **Affiliations** are given only where a project page shows them (NVIDIA Research, KAIST, ZJU3DV).
- **Matrix-Game 4.0:** the code link is the general Matrix-Game repository. Its project page says code and models are available, but I did not check which folder holds version 4.0.
- **Incremental Potential Contact** is cited without a link because I couldn't verify one.
- **Build warning:** the build prints `Lexer: unexpected object at 669`. It is not from this post as far as I can tell; it also appeared in the first build, before I edited the post.

### Shared-file changes I would like

- **None for content.**
- **Environment problem with the build:** the sandbox puts an unreadable device node at `site/scripts`, and Jekyll crashes on it, so `site-build` fails for every worker. To build at all, I added `scripts` to `exclude` in `_config.yml` just for the build and ran `git restore _config.yml` straight after. Nothing in `_config.yml` was committed. Either the helper or the sandbox setup should exclude that path.

### Left undone

- I didn't look again at Hugging Face daily papers or conference lists beyond what the earlier run covered.
- The issue's 42-paper selection is unchanged from the earlier run, apart from the fixes above.
