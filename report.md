# Final report: gfx-c, graphics chapter 12 (differentiable and inverse rendering), continuation run

Chapter 12 is now finished in all three languages: all 10 figures are generated and checked, every Python snippet runs, and both widgets work. I could not build the site or run `site-check`, because Jekyll can't read a sandbox placeholder file. Everything else is verified and committed on `api/gfx-c` (one commit on top of the WIP commit).

## Post: "Differentiable and inverse rendering: gradients through pixels"

| Item | Value |
| --- | --- |
| English words | About 6,800 without code blocks (counted by script); zh and ja have the same structure |
| Figures | 10, written as 12 SVGs because the pipeline diagram has an en, zh and ja version. All produced by `bin/figures/graphics/graphics_12.py` (CPU, 6 s) |
| Widgets | 2: `graphics-edge-gradient` (required) and `graphics-silhouette-fit` (extra) |
| Papers cited | About 36. All 23 arXiv ids and 12 DOIs were checked |

## What I fixed in this run

- **Figures:**
  - The zh and ja pipeline diagrams showed boxes instead of CJK text, because matplotlib's math mode draws the surrounding text in a font without CJK glyphs. The labels now use plain Unicode (θ, ∂L/∂θ) and render correctly.
  - Fixed two overlaps: the legend over the δ arrow in the edge-coverage figure, and the legend over a curve in the loss-landscape figure.
  - I opened every SVG as a PNG and checked it against its caption.
- **Captions now quote the real runs** (all three languages):
  - FD vs edge sampling: the old caption said small-h finite differences are "mostly zero". They are actually unbiased but very noisy, and some estimates have the wrong sign. The caption now gives the relative errors: 0.80 / 0.26 / 0.96 for finite differences (h = 1, 0.1, 0.01) and 0.67 / 0.32 / 0.18 for edge sampling (M = 16, 64, 256). It also notes the cost difference.
  - Large Steps: 32 of the 100 vertices end up out of order with the naive update, so the curve folds over itself. The error stalls near 0.016, against about 0.008 for Large Steps.
  - The other captions (silhouette fit, loss landscape, BRDF fit, SoftRas σ, volume vs splats) already matched what the script produces.
- **Code snippets:** I ran all six by extracting them from the post.
  - The 1D example prints exactly what the post shows (0.380/0.600, 0.350/0.000, 0.000, 1.500).
  - The disc fits end at (39.9993, 26.0007, 11.9902) for the soft rasterizer and about (40.01, 26.01, 12.01) for edge sampling, against a target of (40, 26, 12).
  - The sphere fit recovers albedo (0.80, 0.35, 0.20) and roughness 0.35 exactly.
  - The Mitsuba 3 snippet runs with mitsuba 3.9.1 (LLVM backend). After 50 steps it gives about (0.60, 0.041, 0.017) for the red wall, whose true value is (0.570, 0.043, 0.044).
  - Each snippet now has its real output as a comment.
- **Mitsuba version:** the post said the latest release is v3.9.0 from August 2026. PyPI shows v3.9.0 came out on 26 June 2026 and v3.9.1 on 7 August 2026, so all three posts and the reading list now say v3.9.1.

## What was verified, and how

- **Widgets:**
  - Both files are ASCII-only (the grep prints nothing) and pass `node --check`.
  - I loaded each one in a Playwright page that mimics `widget.liquid`, in en, zh and ja at 390 and 1100 px. I dragged, tapped, moved the sliders and pressed the buttons. There were no console or page errors and no horizontal overflow.
  - I looked at the screenshots. Live runs behave as the text says: edge sampling falls to about 1e-5, the soft rasterizer at fixed σ levels off near 2e-3 (its blur bias), and naive autodiff stays flat with the "gradient = 0" message.
- **Page source, checked by script:** all 12 includes are well-formed, every referenced SVG and widget file exists, there are no stray `{{` or `{%`, and includes, links and code blocks match across the three languages.
- **Citations:**
  - The arXiv API confirmed title, first author and date for all 23 ids, including the 2025–2026 items: IRGS++ (its abstract confirms the name and the metals extension), UTrice, PhysTwin, MOSIV (ICLR 2026), UniRelight, and Relit-LiVE ("Accepted at SIGGRAPH 2026").
  - OpenAlex and Semantic Scholar confirmed all 12 DOIs.
  - OpenAlex confirmed the venues I had earlier taken from memory: NMR (CVPR 2018), SoftRas (ICCV 2019), nvdiffrast (ACM TOG 2020) and nvdiffrec (CVPR 2022).
  - I opened the SIGGRAPH 2020 course page; its title and organizers match the post.

## Open issues

- **The site build and `site-check` did not run.** Jekyll stops with `Permission denied … site/scripts`: `scripts` is a placeholder the sandbox creates at the repository root. Running Jekyll directly, or with a different `SITE_DIR`, was not permitted. Please run `site-build` and `site-check graphics-12-differentiable-and-inverse-rendering` outside the sandbox. MathJax and Kramdown rendering on the real page are still unconfirmed.
- Tzu-Mao Li's thesis is still cited without a link; I couldn't find one I could verify.
- The edge-sampling output in 7.2 changes from run to run because its random numbers are not seeded; the comment says so.

## Shared-file changes requested

None for the content. For the tooling, `site-build` could add `scripts` to `exclude` in its temporary config, which would fix the sandbox failure.

## Left undone

Only the real site build and `site-check` screenshots, for the reason above.
