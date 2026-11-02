# Assignment fixer: final fixes on the merged site

Your branch `api/fixer` starts from `integration`, which already contains the work of all ten earlier
workers. Your brief explicitly allows you to edit these files:
- the posts listed below;
- `_posts/*/2026-10-27-roadmap-01-learning-roadmap.md`;
- `_posts/*/2026-10-27-graphics-07-physically-based-simulation.md`;
- if, and only if, a shared cause needs it, one small rule in `_sass/_base.scss`, scoped to `.post-content`.

## 1. Fix horizontal overflow

A full-network check (MathJax, Mermaid and the CDNs loaded) found these pages wider than the viewport.
Values are `scrollWidth/clientWidth`:

| Page | 390 px | 1100 px |
| --- | --- | --- |
| `graphics-07-physically-based-simulation` | en 1895/390, zh 1373/390, ja 1683/390 | en 2195/1100, zh 1673/1100, ja 1983/1100 |
| `graphics-13-research-frontiers-2026` | en 521, zh 474, ja 474 | |
| `graphics-06-real-time-ray-tracing` | en, zh and ja 469 | |
| `world-models-02-generative-modeling-foundations` | en 417, zh 407, ja 417 | |
| `graphics-05-ray-and-path-tracing` | ja 435 | |

For each page:
- Find the offending element with a small Playwright script. Walk the elements, compare
  `getBoundingClientRect().right` with `clientWidth`, and skip elements inside scrollable containers.
- Fix the cause. Typical causes: a long unbreakable string or URL in text or a table, a wide inline formula,
  a wide Mermaid diagram, a widget canvas with a fixed width.
- Prefer fixing the post. Use a scoped CSS rule only for a shared cause, such as Mermaid SVGs lacking
  `max-width: 100%` or an overflow wrapper.
- Confirm with `site-check` that `scrollWidth == clientWidth` at both widths, in all three languages.

## 2. Update the roadmap hub, `roadmap-01-learning-roadmap`, in en, zh and ja

The post is written in the owner's first-person voice; keep that voice. Make these changes:
- "four series" becomes five series plus the dated paper-digest column.
- The Mermaid diagram:
  - add graphics chapters 08-13;
  - add a "Graphics engines" subgraph between neural rendering and world models, with edges into world
    models and embodied AI.
  - Keep the diagram readable.
- The Stage 1 list: add chapters 08-13, using the titles from the posts' front matter, and link them.
- A new section between Stage 2 and Stage 3:
  - en: "Stage 2.5: graphics engines (the bridge)"
  - zh: 阶段 2.5：图形引擎（通往世界模型与具身智能的桥梁）
  - ja: ステージ 2.5：グラフィックスエンジン（世界モデルと身体性 AI への橋渡し）
  It gets 2-4 sentences and links to the six posts.
- The "Suggested pace" table:
  - graphics now has 13 posts; adjust its time;
  - add a graphics-engine row, with the milestone "build a mini WebGPU engine with a render graph and profile
    a frame".
- "Browse by category": add Graphics engines and Paper digest.
- A short "Keeping up with new papers" paragraph that links the first issue, `paper-digest-01-2026-oct-nov`.

## 3. Rewrite the closing paragraph of chapter 07, in all three languages

It currently says that the graphics track ends there. It should instead say three things:
- the core part ends there;
- chapters 08-13 continue it with geometry processing, animation, volumes, real-time techniques,
  differentiable rendering and the 2026 frontier (link chapter 08);
- readers who want to jump ahead can go to neural rendering next.

Keep the rest of the paragraph's content.

## 4. Check the internal links

Every `{{ '/blog/2026/<slug>/' | relative_url }}` link in every post must point to an existing post: the slug
must match a file in `_posts/en-us/`, without the date prefix. Fix broken links in the post that contains
them. Also check `{{ '/blog/category/<key>/' | relative_url }}` links against the category keys in
`_config.yml`.

## 5. Build, check, commit

Run `site-build`, then `site-check` on every page you changed. Commit, with the trailers.

Your final report lists every fix, the cause of each overflow, and anything left.
