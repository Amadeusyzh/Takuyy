# Assignment wm-up: bring the world-models series up to date (as of November 2026)

The five existing posts were written from knowledge that stops around early 2026:
- `world-models-01-what-is-a-world-model`
- `world-models-02-generative-modeling-foundations`
- `world-models-03-video-world-simulators`
- `world-models-04-3d-and-4d-world-generation`
- `world-models-05-jepa-evaluation-and-open-problems`

The owner wants the latest work added: 2025 and especially 2026, including papers from just-finished
conferences and recent preprints. You are the only worker allowed to edit these five posts, in all three
languages, and `docs/reading-lists/world-models.md`.

Research first. Use the ARIS `research-lit` skill and primary sources. Build a verified table of candidate
works per post (title | authors | venue/status | date | link | what is new). Then integrate.

Areas to cover; verify everything and add 2026 work you find:
- Model-based RL and agents that learn in imagination: Dreamer 4 ("Training Agents Inside of Scalable World
  Models", 2025) and successors, plus world models for games and robots.
- Generative backbones relevant to world models (post 02): video diffusion and flow models; autoregressive
  and diffusion hybrids such as Diffusion Forcing, self-forcing and causal video diffusion; tokenizers. Only
  the parts that matter for world models.
- Interactive video world models (post 03):
  - Genie 3 (Aug 2025) and later versions;
  - NVIDIA Cosmos (Predict, Transfer, Reason, and later releases);
  - Matrix-Game 2.0 and later; Hunyuan-GameCraft, HunyuanWorld and Voyager; Yan; Mirage;
  - Odyssey; World Labs RTFM; Lucid; GAIA-2 and other driving world models; any new 2026 systems;
  - long-horizon memory and consistency methods.
- 3D/4D world generation (post 04):
  - World Labs Marble (and its general release), HunyuanWorld;
  - feed-forward 3D/4D generation, Gaussian-based world generation, scene-scale generation;
  - 2026 methods.
- JEPA and evaluation (post 05): V-JEPA 2 (and V-JEPA 2-AC), LeJEPA, later JEPA work; physical-understanding
  benchmarks such as Physics-IQ and WorldModelBench; new 2026 benchmarks; public claims by labs and startups,
  clearly labelled as claims.

How to integrate (keep all existing content):
- In each post, add a section near the end, before "Representative papers":
  - en: "2025-2026 update (as of November 2026)"
  - zh: 2025–2026 年进展（截至 2026 年 11 月）
  - ja: 2025〜2026 年の進展（2026 年 11 月時点）
  Group the entries by theme. For each work, give 2-4 sentences: what it does, how, what is new, and how it
  relates to the post's earlier sections.
- Where a newer result changes something an earlier section says, add a short note there too.
- Add rows to "Representative papers", with status (published, accepted or preprint) and links.
- Cross-link the new graphics-engine series:
  - `graphics-engine-06-ai-meets-graphics-engines` (neural game engines) from posts 01, 03 and 04;
  - `graphics-engine-05-physics-and-simulation-engines` where simulation is discussed.
- Figures: add 2-4 per post where they help, computed by NumPy/matplotlib from your verified data or from
  real toy runs. For example:
  - a 2024-2026 timeline of world models;
  - a scatter of reported resolution or fps against memory horizon, from verified numbers only;
  - a schematic of a new architecture idea.
  - Put them in a new script `bin/figures/world-models/world_models_updates.py`, writing
    `assets/img/blog/world-models/0N-update-*.svg`.
- Widget: `world-models-timeline`, an interactive, filterable timeline of the 2024-2026 world models you
  verified.
  - Filter by type: interactive video, 3D/4D generation, latent RL, JEPA, evaluation.
  - Tap an entry to see a two-line summary, its status and its link.
  - Embed it in post 03, and in 04 and 05 if useful.
  - Keep the data inline in the JS, ASCII only (\u escapes).
- Append a "2025-2026" section to `docs/reading-lists/world-models.md`.

Commit after each post, or after every two posts. Quality and accuracy come first. If the budget runs short,
prioritize posts 03, 04 and 05.
