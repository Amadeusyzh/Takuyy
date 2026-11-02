# Assignment digest: the first "Paper Digest" issue (October to early November 2026)

Start the dated column `paper-digest`. Its series name is already in `_data/*/strings.yml`: en "Paper
Digest", zh 论文速递, ja 論文速報. Write issue 01: noteworthy papers that appeared from October 1 to about
November 2, 2026, in the owner's fields.

Files:
- Post: `_posts/<lang>/2026-11-02-paper-digest-01-2026-oct-nov.md` in all three languages.
- Front matter:
  - date `2026-11-02 12:00:00+0900`;
  - `categories: paper-digest`, `series: paper-digest`, `series_order: 1`;
  - tags such as `[paper-digest, graphics, 3dgs, world-models, embodied-ai, xr]`;
  - `toc.sidebar: left`, `related_posts: false`.
- Title idea: zh 论文速递｜2026 年 10–11 月：图形学、引擎、神经渲染、世界模型、具身智能与 XR (en and ja
  equivalents).
- Figures: `bin/figures/paper-digest/paper_digest_01.py` plus a generic `make_all.py` in the same folder;
  SVGs `assets/img/blog/paper-digest/01-*`. Keep your curated data in
  `bin/figures/paper-digest/data/01-papers.json` and generate the figures from it.

## Selection

Find candidates through several channels, because each misses things:
- arXiv listings and the API for cs.GR, cs.CV, cs.RO, cs.HC, cs.LG and cs.AI, restricted to submission dates
  in the window;
- Hugging Face daily papers;
- accepted-paper lists of the conferences in or around the window. Determine which actually happened or
  published papers then: for example SIGGRAPH Asia 2026 accepted papers and preprints, ISMAR 2026, UIST
  2026, IEEE VIS 2026, IROS 2026, CoRL 2026, Pacific Graphics 2026, NeurIPS 2026 camera-ready, ICLR 2027
  submissions on OpenReview, CHI 2027 preprints;
- lab and company research blogs;
- the ARIS `research-lit` skill, which helps here.

Then choose about 5-8 works per category, 30-45 in total. Prefer, in this order:
- significance, such as a new capability or a strong result;
- acceptance at a top venue;
- open code and data;
- relevance to the owner's research (graphics, 3D vision, AR/VR, HCI, world models, embodied AI).

Every paper must be verified on its arXiv abstract page or official page. Its date must fall in the window:
state its first-submission or publication date. Exclude anything you cannot verify.

Categories, in this order:
1. Graphics (rendering, geometry, simulation, animation, imaging)
2. Graphics engines and real-time (real-time rendering, GPU and engine systems, neural shading in engines,
   tools)
3. Neural rendering (NeRF, 3DGS, reconstruction, feed-forward 3D, relighting)
4. World models (video and interactive world models, 3D/4D world generation, JEPA, evaluation)
5. Embodied AI (VLA, robot learning, humanoids, simulation, data)
6. HCI / XR / AR / VR (interaction techniques, displays, avatars, egocentric perception, human-AI interaction)

## Writing each entry

- Heading: the paper title as a link, then first author et al., affiliations if known, venue or status, and
  date. Add code and project links when they exist.
- Four short labelled parts:
  - what it does;
  - how it works (key idea, at the level of a strong graduate student);
  - what is new compared with prior work;
  - its connection to graphics, 3D CV and CG: which representation, rendering or geometry idea it uses or
    changes. Link the relevant chapters of this blog with their slugs.
- No copied abstracts and no invented numbers. Quote a reported number only with its source context ("the
  authors report ...").

## The rest of the post

- An opening paragraph: the window, how papers were selected, and the date stamp.
- A closing "Trends this month" synthesis: themes that cut across the categories, and what to watch next.
- A compact table of all entries: category | title | venue/status | date | link.

## Figures (5-8, from your data file)

- An overview of entries per category and status.
- A "relation to CG" matrix: papers against representation, rendering, geometry, simulation, animation and
  interaction, as a heat map or dot matrix.
- A timeline of the window.
- 2-4 explanatory schematics for the most important papers, drawn by you (never copy paper figures).

Widget: `paper-digest-explorer`, an interactive explorer of this issue.
- Filter by category and by connection to CG (representation, rendering, geometry, simulation, animation,
  interaction).
- Tap a paper to see its one-paragraph summary and links.
- Keep the data inline in the JS, ASCII only (\u escapes).

The deadline is tight and this post is the owner's showcase, so make it excellent. Commit a first complete
version as soon as all six categories are written, then improve and extend it.
