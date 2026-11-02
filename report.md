# Final report: gfx-a (continuation run)

Both chapters are finished and checked, and each has its own commit on `api/gfx-a` (`afd53cd` for chapter 08, `246c6a0` for chapter 09). The final `site-build` and `site-check` on both slugs are clean in en, zh-cn and ja-jp at 390 and 1100 px: no broken images, no horizontal overflow, no unrendered math, and no console errors after the simulated widget drags.

## `graphics-08-geometry-processing`: Geometry processing: meshes, curvature, smoothing, subdivision and reconstruction

- **Size:** about 7,200 English words (code blocks excluded, tables and math included), 11 figures, 2 widgets (`graphics-subdivision`, `graphics-marching-squares`), 26 papers plus 1 textbook.
- **Figures:** `graphics_08.py` runs and writes all 11 SVGs. I opened each one as a PNG and fixed:
  - the half-edge figure, where the `h` and `next(h)` labels overlapped (`next(h)` is now drawn in black);
  - the Loop subdivision figure, which now overlays the whole level-0 cage instead of only its equator;
  - the marching-squares colorbar label, which was overlapping the next panel;
  - the Poisson figure's title;
  - the curvature figure's legend, which covered data.
- **Code:** every Python snippet runs in all three languages. Extra tests I ran:
  - Gauss–Bonnet sum on the torus is −3×10⁻¹³. The largest error against the exact formulas is 0.03 for K and 0.006 for H.
  - QEM simplifies to 400, 150 and 60 faces and keeps χ = 2.
  - The Tutte embedding has 0 flipped triangles.
- **Text now matches the computed numbers**, in all three languages:
  - Taubin smoothing actually ends 3% *above* the starting area after 1,000 iterations, so the caption says that.
  - The snippets now show their printed outputs as comments.
- **Rendering bug fixed:** kramdown was reading underscores inside inline math (`\mathbf{p}_i … \mathbf{p}_{i+1}`) as emphasis. That broke MathJax and caused the overflow on phones. It is fixed with `\_` in the affected lines.

## `graphics-09-animation-and-characters`: Animation and characters: splines, rotations, skinning, IK, motion matching and learned motion

- **Size:** about 6,650 English words (same counting), 10 figures, 2 widgets (`graphics-skinning`, `graphics-ik-chain`), 36 papers.
- **Corrections from actually running the figures:**
  - **Arc length:** the caption said uniform-t samples bunch up near the ends, but with the original control points the curve is *fastest* at the ends. I changed the control points (short first handle), so the bunching is now clear: uniform-t gaps run from 0.13 to 0.63, and arc-length gaps are all 0.33. The code and captions are updated to match.
  - **Motion matching:** the original query (a 1 rad/s turn) was far outside the database (about 0.3 rad/s turns), so "they line up" was false. The new query is in range: matching cost 0.54, the query sits next to the best match, and the panel is zoomed onto the match.
  - **Squad:** the caption now says that slerp's jumps in angular speed are small here. The bigger break is the sudden change of rotation axis.
  - Legends that covered data are fixed in the IK, LBS/DQS and PD figures.
- **Code:** every snippet runs in all three languages, and the outputs match the text (for example, the wrist ends at (0.18, 0.27, 1.95)). I also tested LBS against the twist formula and DQS keeps the full radius.
- **Overflow fix:** the long inline DeepMimic reward formula overflowed on phones, so it is now a two-line display equation.

## Widgets (all four)

- All four widget files are now ASCII-only (the zh/ja strings were converted to `\u` escapes), and `node --check` passes.
- The IK target and the subdivision control points are now kept inside the canvas. Before, the simulated drag pushed the IK target off-screen and it vanished.
- The marching-squares field had speckled level-set bands, which I removed; it is now drawn in lighter colours.

## Citations

- **arXiv:** all 27 ids resolve to the cited titles and first authors.
- **Claims checked against abstracts:** Kimodo (700 h of mocap), SONIC (up to 42M parameters, 700 h, published in *Science Robotics*), HY-Motion (billion-parameter scale), SuperMimic (accepted at CoRL 2026), Go to Zero (2507.07095) and GMT (2506.14770).
- **DOIs:** all 31 resolve through OpenAlex with the right year and first author. The Catmull–Clark DOI contains parentheses; I confirmed the rendered link works.
- **Other links:** TWIST on PMLR (v305) and Clavet's GDC Vault page are confirmed. Every URL in the "Chapters 08-09" reading-list section also appears in the posts, so those are covered by the same checks.

## Open issues and uncertain facts

- The SuperMimic sentence says it "matches" a large-compute baseline. The abstract actually claims it *surpasses* that baseline's return after 3 hours on one GPU, so the text understates it.
- HY-Motion is credited to "Tencent Hunyuan"; the arXiv first author is Yuxin Wen.
- The Catmull & Rom (1974) entry has no link, because it is a book chapter.
- The marching-tetrahedra figure shows small sliver artifacts along the fillet. These come from the algorithm itself; it is not a bug.

## Shared-file changes I would like

- `docs/BLOG_GUIDE.md` §5 could add a rule: inside inline `$…$`, write `\_` wherever two subscripts follow `}` on one line (for example `\mathbf{p}_i … \mathbf{p}_{i+1}`), because kramdown otherwise turns them into emphasis. Other workers' posts may have the same hidden overflow.

## Left undone

Nothing from the brief. The site build always prints a `Lexer: unexpected object at 669` warning; it doesn't come from my files and the build still succeeds.
