# Assignment gfx-d: graphics chapter 13, research frontiers 2026 (plus light updates to chapters 03-07)

The owner wants the graphics series to reach the current frontier: recent top-venue work up to now
(November 2026), some from conferences that just took place and some still preprints. This assignment is
research-heavy. Accuracy beats quantity: every entry must be verified (guide section 11).

## Part A: new chapter 13

- File: `2026-10-27-graphics-13-research-frontiers-2026.md`, date `2026-10-27 09:13:00+0900`, series_order 13.
- Title idea: "Graphics research frontiers 2026: what SIGGRAPH, SIGGRAPH Asia and the latest preprints are
  doing".

Scope:
- Conferences and journals:
  - SIGGRAPH 2026 Technical Papers (ACM TOG 45(4)).
  - SIGGRAPH Asia 2026 accepted papers and their preprints. Find out the conference dates and status
    yourself.
  - Eurographics 2026 (CGF), EGSR 2026, HPG 2026, I3D 2026, Pacific Graphics 2026, and TOG journal papers.
- Notable arXiv cs.GR preprints from roughly June to November 2026.

Use the ARIS `research-lit` skill and primary sources:
- Ke-Sen Huang's paper pages;
- the ACM DL TOG tables of contents;
- arXiv listings;
- project pages.

Structure:
1. How to read this chapter, with the "as of November 2026" date stamp, and the venues and their timeline.
2. Topic sections, each with 3-6 works and a short synthesis of where the area is heading:
   - light transport and rendering: path guiding, many-light and ReSTIR variants, spectral, real-time GI,
     neural methods inside renderers;
   - neural and hybrid representations in graphics: Gaussian ray tracing, neural materials and textures,
     meshes combined with splats;
   - geometry and modeling: meshing, CAD and B-rep generation, neural fields, learned geometry processing;
   - simulation: MPM, cloth, hair, fluids, contact, GPU solvers, differentiable simulation;
   - animation and characters: motion generation, physics-based characters, avatars;
   - imaging and displays: computational photography, holographic and VR/AR displays, perception (connect
     to the owner's AR/VR interest);
   - fabrication and design;
   - generative 3D and 4D content.
3. For each work give:
   - the title (linked to its arXiv, DOI or project page);
   - the first author et al.;
   - the venue and status (published, accepted / to appear, or preprint), and the month;
   - 3-5 sentences on the problem, the key idea, why it matters, and which earlier chapter it builds on
     (link that chapter).
4. Cross-cutting trends: neural primitives everywhere, differentiability, ML inside shaders, generative
   priors, simulation and rendering converging, and the link to world models and embodied AI. Point to the
   graphics-engine and world-models series.
5. How to follow graphics research: Ke-Sen Huang's lists, TOG, arXiv cs.GR, technical-paper fast forwards and
   videos, open-source code, reading groups.

Data and figures:
- Keep your curated list as data in `bin/figures/graphics/data/13-frontiers.json`. Generate the figures from
  it in `bin/figures/graphics/graphics_13.py`, writing `assets/img/blog/graphics/13-*`.
- Figures (6-9), for example:
  - works per topic and status (stacked bars);
  - a 2026 venue timeline;
  - a "trend map" linking topics to the blog chapters that teach the prerequisites;
  - one or two explanatory schematics for especially important papers (for example a method diagram).
- Draw these yourself from the paper's description. Never copy figures from papers.
- Widget: `graphics-frontiers-explorer`, built from the same data.
  - Filter by topic and status.
  - Tap a work to see its summary, its link and the chapter it builds on.

Also append a "2026 frontiers" section to `docs/reading-lists/graphics.md`.

## Part B: light-touch updates to existing chapters 03-07

You are the only worker allowed to edit these five posts, in all three languages:
- `graphics-03-shading-and-textures`
- `graphics-04-physically-based-rendering`
- `graphics-05-ray-and-path-tracing`
- `graphics-06-real-time-ray-tracing`
- `graphics-07-physically-based-simulation`

For each:
- add 1-3 verified rows of 2025-2026 work to its "Representative papers" table;
- add one sentence near the end pointing to chapter 13 for the frontier.

Do not change anything else in those posts.

Order: Part A first (commit), then Part B (commit).
