I finished and verified the world-models 2025-2026 update except for one step: I couldn't run `site-build` or `site-check`, so the five posts have never been built or checked as full pages. The figures, both new code snippets, the widget and every arXiv link were run or checked; work is committed on `api/wm-up` as 6 commits on top of the WIP commit.

**Why the build is blocked:** this runner has `/dev/null` placeholder entries inside the repo (`scripts`, `.bashrc`, `.vscode`, and a few others), created at 19:41, after the WIP commit. Jekyll aborts on `scripts` with `Permission denied (Errno::EACCES)`, and it fails the same way outside the sandbox. The only fixes are deleting them or pointing `site-build` at a clean copy via `SITE_DIR`, and both need permissions I don't have. Run `site-build` and `site-check` on the five slugs once those entries are gone. I committed none of them.

## Per post

| Post | Words added (en) | Update figures | Widget | Papers added | Runnable code |
|---|---|---|---|---|---|
| 01 What is a world model | ~1,050 | 1 (`01-update-dreamer4`) | – | 5 | – |
| 02 Generative foundations | ~1,850 | 2 (`02-update-forcing`, new `02-update-exposure`) | – | 11 | new toy run |
| 03 Video world simulators | ~2,100 | 1 (`03-update-memory`) | timeline | 25 | – |
| 04 3D/4D world generation | ~1,800 | 1 (`04-update-memory-growth`) | timeline | 21 | – |
| 05 JEPA and evaluation | ~2,300 | 2 (`05-update-benchmarks`, new `05-update-sigreg`) | timeline | 16, plus labelled company claims | new toy run |

**What changed in this run:**
- **Figures:** `world_models_updates.py` now runs and has replaced the hand-drawn placeholder SVGs. I looked at every figure as a PNG and fixed labels hidden under the loop in the Dreamer 4 diagram. The numbers in the captions match what the script prints (720 vs 46 context frames; 36 M vs 6 M primitives; benchmark counts 4/6/3/2/2).
- **New in post 02:** a runnable pendulum toy comparing teacher forcing with training on the model's own rollouts. Teacher forcing has the lower one-step error (0.0131 vs 0.0139) but double the rollout error at step 30 (0.302 vs 0.144). Self-forced training wins on 79% of test trajectories, and the phase plot shows the example where the two differ most (the caption says so).
- **New in post 05:** a runnable SIGReg toy in which the regularizer alone spreads a collapsed linear encoder back out. The covariance eigenvalues go from (0.08, 0, …) to 0.96–1.03, with an overshoot to 4.6 that the text explains. The text says the test statistic is my choice for the toy, not LeJEPA's code.
- **Both toys:** text, code and output are in all three languages, and the numbers quoted in the posts are the script's actual output.
- **Widget:** the `~XXXX` workaround is gone and the file now uses real `\u` escapes. The non-ASCII grep prints nothing and `node --check` passes. I loaded it in Playwright on its own page (en/zh/ja at 390 and 1100 px, touch taps, filter and arrow buttons): no console errors and no overflow.
- **Text fixes:** the Genie 4 sentence about a "Gemini agent" planning steps wasn't supported by the announcement, so it now says what the page says. Matrix-Game 2.0's training data now reads "about 1,200 h from Unreal Engine and GTA5", as in its abstract.

## What I verified, and how
- **arXiv:** all 78 IDs added on this branch were checked against the arXiv API for title, first author, date and venue comment. All exist and match.
- **Quoted numbers** checked against the abstracts: Matrix-Game 3.0 40 fps at 720p with 5B; WorldPlay 720p at 24 fps; AlayaWorld 15B with ~30→4 steps; ReWorld 704×1280, 4 steps, 64 s; LongLive 20.7 fps and 240 s; Self-Forcing++ 4 min 15 s; V-JEPA 2.1's 20-point gain; LeWorldModel ~15M parameters and 48× faster; L3G-World 38.6× fewer primitives; Echo-Memory's state-space finding.
- **Summaries my earlier report flagged** are now confirmed by the abstracts or project pages: Hunyuan-GameCraft, DreamGen, MapAnything, Aether, Lyra, and Bolt3D's splatter images.
- **Venues and company pages:** Causal Forcing's ICML 2026 is confirmed by its official repo label. I re-opened the Genie 4 and GAIA-4 announcements, and both match the text.
- **Exercise arithmetic** re-computed: 207 GB vs 13 GB, and a ratio of 6.
- **Static checks:** no stray Liquid tags, every referenced figure and widget file exists, and headings, figures, tables, links, code fences and `$$` blocks line up across the three languages.

## Open issues and uncertain facts
- **Not rendered as pages**, because of the build problem above.
- **Venues kept cautious:** shortcut models (arXiv) and MeanFlow (preprint) may be ICLR 2025 and NeurIPS 2025. dblp and Semantic Scholar failed (rate-limited) during this run, so I couldn't confirm.
- **Widget summaries** are in English in all three languages; only the buttons and labels are localized.
- **Figure count:** posts 01, 03 and 04 still have one update figure each, below the 2–4 the brief asked for. A resolution/fps-vs-memory scatter was left out because too few comparable numbers are verified.
- **Japanese term:** I used 身体性 AI for embodied AI, since there was no existing convention to follow.

## Shared-file changes
None required. The only file outside the posts and assets I touched is `bin/figures/world-models/make_all.py`, which now also runs the update script. The new toy figures need PyTorch (CPU, about a minute).

## Left undone
- `site-build`, `site-check` and the full-page screenshot review (blocked).
- Extra figures for posts 01, 03 and 04.
