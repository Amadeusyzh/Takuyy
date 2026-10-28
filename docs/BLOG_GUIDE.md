# Blog writing guide (for humans and agents)

This repository is Zehua Yang's trilingual academic website (Jekyll, al-folio + jekyll-polyglot).
Blog posts form a **learning roadmap** from computer graphics fundamentals to 3D Gaussian Splatting,
world models and embodied AI. This file is the contract every post must follow.

## 1. Tracks (categories / series)

| `categories` / `series` key | Topic |
| --- | --- |
| `graphics` | Computer graphics from scratch: math, rasterization, shading, PBR, ray/path tracing, real-time RT, simulation |
| `neural-rendering` | Cameras & multi-view geometry, NeRF, fast radiance fields, 3D Gaussian Splatting and its extensions |
| `world-models` | Model-based RL, video world simulators, 3D/4D world generation, JEPA, evaluation |
| `embodied-ai` | Robotics basics, simulation & sim2real, imitation learning, VLA models, embodied AI x XR/HCI |
| `roadmap` | Hub posts that link the tracks together (written last) |

Use exactly one category per post, equal to its series key.

## 2. Files and languages

- Every post exists in **three languages with the same file name**:
  `_posts/en-us/<name>.md`, `_posts/zh-cn/<name>.md`, `_posts/ja-jp/<name>.md`.
- File name: `2026-10-27-<series>-<NN>-<slug>.md`, e.g. `2026-10-27-graphics-03-shading.md`.
- The `date` must not be in the future (posts with future dates are not built). Use the fixed date
  `2026-10-27` and encode the order in the time: base hour per track, minute = NN.
  - graphics `09:NN`, neural-rendering `12:NN`, world-models `15:NN`, embodied-ai `18:NN`, roadmap `21:NN`.
- Chinese: Simplified Chinese, natural technical writing. Japanese: natural です/ます style.
  At the first mention of a technical term give the English in parentheses, e.g. 光栅化（rasterization）.
- Translations must be complete and faithful, not summaries. Code and math are identical across languages;
  code comments may stay in English.

## 3. Front matter template

```yaml
---
layout: post
title: "Rasterization: from triangles to pixels"
date: 2026-10-27 09:02:00+0900
description: "One sentence shown in the blog list."
categories: graphics
tags: [rasterization, z-buffer]
series: graphics
series_order: 2
toc:
  sidebar: left
related_posts: false
# optional, only when used in the post:
# mermaid:
#   enabled: true
#   zoomable: true
# pseudocode: true
---
```

`series` + `series_order` automatically add a series table of contents at the top and previous/next
links at the bottom (see `_includes/series_nav.liquid`). Do not write those by hand.

## 4. Content structure of a post

1. **Why this matters / where it sits in the roadmap** (2-4 sentences, link the previous post).
2. **Prerequisites** (short list).
3. **Main sections**: intuition first, then the math, then code. Aim for depth: a reader should be able
   to implement the idea after reading. 1800-3500 English words per post is typical.
4. **Try it**: where relevant, link the interactive demos on the home page
   (`{{ '/' | relative_url }}#lab`): path tracer (GGX, NEE+MIS, a-trous denoiser), Gaussian World (3DGS),
   XPBD cloth, foveated rendering.
5. **Representative papers**: a table `| Paper | Venue | Year | Link | Why it matters |` (SIGGRAPH, TOG,
   CVPR, ICCV, ECCV, NeurIPS, ICLR, ICML, CoRL, RSS, ICRA, Science Robotics, ...).
6. **Learning resources**: courses, books, open-source code (e.g. GAMES101, CS184, PBRT, Scratchapixel).
7. **Exercises** (3-5 small tasks) and a one-line pointer to the next post.

## 5. Math, code, diagrams

- Math is rendered by MathJax. Use `$...$` inline and a blank line around display math:

  ```
  $$
  L_o(x,\omega_o) = L_e + \int_{\Omega} f_r\, L_i \cos\theta_i \, d\omega_i
  $$
  ```

  Inside tables, write `\vert` instead of `|`. Avoid `{{` / `{%` (Liquid) anywhere; if code needs them,
  wrap the block in `{% raw %}` ... `{% endraw %}`.
- Code blocks must have a language tag (` ```python `, ` ```glsl `, ` ```cpp `) and be correct and
  self-contained (NumPy / PyTorch / GLSL / C++). Prefer short runnable snippets over pseudo-code.
- Diagrams: Mermaid (enable it in front matter) or tables. Do **not** hot-link images from other sites.
  Original figures may be added under `assets/img/blog/<series>/` (PNG/SVG you generate yourself).

## 6. Links and citations: accuracy rules

- Every link must be real. Prefer `https://arxiv.org/abs/<id>`, DOIs (`https://doi.org/...`), ACM DL,
  CVF open access, official project pages and GitHub repos.
- **Never guess an arXiv id, DOI or URL.** If you are not certain, verify it with web search; if you
  still cannot verify it, cite the paper by title, authors, venue and year without a link.
- Get venues and years right (e.g. NeRF: ECCV 2020; 3DGS: SIGGRAPH 2023 / ACM TOG 42(4)).
- Do not claim results or numbers you cannot attribute to a source.

## 7. Reading lists (Markdown in the repo)

Each track also maintains `docs/reading-lists/<series>.md`: a structured paper list (stage -> papers with
venue, year, link, one-line note) plus courses/books/code. Written in Chinese with English paper titles.
The `docs/` folder is excluded from the website build.

## 8. Build and check

```bash
bundle config set --local path vendor/bundle && bundle install   # first time
printf 'imagemagick:\n  enabled: false\n' > /tmp/local.yml
LANG=C.UTF-8 bundle exec jekyll build --config _config.yml,/tmp/local.yml
```

The build must finish without Liquid or Kramdown errors, and each post must appear under
`_site/blog/2026/<slug>/`, `_site/zh-cn/blog/2026/<slug>/` and `_site/ja-jp/blog/2026/<slug>/`.
(Some CDN requests fail in the sandbox; that is expected.)

## 9. Git

- Work on a branch `blog/<series>`; one commit per post (all three languages) is ideal.
- Only add files under `_posts/*/`, `assets/img/blog/<series>/` and `docs/reading-lists/<series>.md`.
  Do not edit shared files (`_config.yml`, `_data/`, `_layouts/`, `_includes/`, other tracks' posts).
  If something shared is needed, describe it in your final report instead.

## 10. Visualization (required)

Formulas alone are too abstract. Every concept that has a spatial or geometric meaning must be
shown, not only written: "dry" math is paired with a picture of what it means in space.

**Density.** Aim for roughly one figure per major section (typically 6-12 per post), placed right
next to the formula or code it explains. Each figure has a caption (in the post's language) that
says what to look at, and the surrounding text refers to it ("as the figure shows, ...").

**Static figures** (Python, reproducible):
- Scripts live in `bin/figures/<series>/` (one script per post, e.g. `graphics_01.py`, plus a
  `make_all.py`), import the shared style with
  `sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1])); from style import *`
  and write SVGs to `assets/img/blog/<series>/<NN>-<name>.svg`. Do not edit `bin/figures/style.py`.
- Prefer real geometry computed with NumPy over decorative drawings: coordinate axes with tick
  marks, vectors with components, before/after transforms, 3D plots (mplot3d) of frames, frusta,
  ellipsoids, rays, hemispheres, sample points, lobes, trajectories, loss/value curves, and toy
  data that you actually run through the algorithm (e.g. a real rasterized triangle, real
  Monte Carlo samples, a real DDPM forward process on 2D data, a real RRT tree).
- Keep text inside figures language-neutral (symbols, numbers, short code names). If words are
  needed, render three variants `name_en.svg`, `name_zh.svg`, `name_ja.svg` with
  `label(lang, en=..., zh=..., ja=...)` and include with `localized="true"`.
- Legible on phones: figure width around 8-10 inches at font size 15 (the style default),
  thick lines, no tiny annotations. White background (the site frames it in dark mode).

Embed with:

```liquid
{% include blog_figure.liquid path="assets/img/blog/graphics/01-dot-product.svg" caption="Dot product as projection: ..." %}
{% include blog_figure.liquid path="assets/img/blog/graphics/02-pipeline.svg" localized="true" width="80%" caption="..." %}
```

**Interactive widgets** (2-4 per series, for the ideas that benefit most from manipulation, e.g.
dragging a vector and watching dot/cross products update, rotating a camera frustum, moving a
3D Gaussian and seeing its 2D projection, stepping a diffusion process, dragging an IK target):
- One self-contained file per widget: `assets/js/widgets/<series>-<name>.js`, plain JS + Canvas 2D,
  SVG or WebGL, no external libraries, ASCII only (use \u escapes for non-ASCII strings).
- It must find its containers with `document.querySelectorAll('[data-widget="<series>-<name>"]')`,
  read `el.dataset.lang` (`en` / `zh` / `ja`) for its UI text, size itself to the container width
  (responsive, works with touch: pointer events), and draw on a light background.
- Embed with `{% include widget.liquid name="<series>-<name>" height="380" caption="..." %}`.

Before committing, open the built page in headless Chromium (Playwright is preinstalled:
`require('playwright')`) at phone width (390 px) and desktop width, take screenshots, and check
that figures are legible and widgets work (no console errors except blocked CDN requests).
