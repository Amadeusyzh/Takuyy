# Assignment wm-figs: more learning figures for world-models posts 01, 03 and 04

Your branch `api/wm-figs` starts from `main`. The "2025-2026 update" sections of three posts have only one
update figure each:
- `world-models-01-what-is-a-world-model`
- `world-models-03-video-world-simulators`
- `world-models-04-3d-and-4d-world-generation`

Your brief explicitly allows you to edit these three posts, in all three languages, plus
`bin/figures/world-models/world_models_updates.py` and new SVGs named
`assets/img/blog/world-models/0N-update-*.svg`. Do not touch any other file.

Add 1-2 figures per post, where they help a learner understand the new material. They must be computed from
real toy runs or verified numbers, never decorative. Examples:
- 01: imagination training (an agent learning inside a learned model) as a toy model-based RL run, comparing
  learning curves against model-free on the same toy task.
- 03: error accumulation in autoregressive rollouts versus horizon, with and without memory or conditioning,
  from a small toy model you actually run.
- 04: scene coverage or consistency as an explicit 3D world grows along a camera trajectory, as a toy run.

For each figure:
- Insert it at the right place in all three languages.
- Write a caption in each language saying what to look at.
- Add a sentence of text that refers to it.

Keep runs under about 2 minutes on CPU. Commit with the trailers. Run `site-build`, then `site-check` on the
three slugs, and look at the figure screenshots.

Your final report lists each figure and what it shows.
