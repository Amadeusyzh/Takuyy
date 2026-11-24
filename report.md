# Final report: post 02 of the 3D GUI Agent column

**Title:** "GUI agents on 2D screens: a survey to November 2026", in en / zh-cn / ja-jp. Slug `3d-gui-agent-02-gui-agents-on-2d-screens`, series_order 2. Committed on `api/w2-gui-survey` (6d56603, plus 7d49c28, a small table fix).

`site-build` finishes with no Liquid or Kramdown errors. `site-check` passes on all 6 pages (en, zh, ja at 390 and 1100 px): 10 figures each, no broken images, no horizontal overflow, no unrendered math, no console errors after the drag on the widget. I also looked at several screenshots myself.

## Numbers
- **English length:** about 9,400 words of prose, about 12,900 including tables and captions. That is a little above the 5,000-9,000 guideline; I kept it because the eight sections in the brief each needed their numbers and their "what it means for 3D" paragraph.
- **Figures:** 10 localized SVGs (_en/_zh/_ja), all made by `bin/figures/3d-gui-agent/gui_agent_02.py`.
- **Widgets:** 1, `3d-gui-agent-agent-loop`.
- **Cited works:** about 100 named in the text. 40 distinct arXiv links plus DOI and vendor links in the post, and 38 rows in the Representative papers table.

## What the figures show
1. **Timeline 2016-2026:** 28 milestones, coloured by strand.
2. **Agent loop:** observe, plan, ground, act, with memory, reflection and ask/confirm; a dashed box marks what one native VLM does.
3. **Observations:** one toy screen as a screenshot, with Set-of-Mark labels, and as a serialized accessibility tree.
4. **Input evidence:** success with screenshot vs tree vs hybrid input, from OSWorld, AndroidWorld and EntWorld.
5. **Grounding gap:** the same models on ScreenSpot vs ScreenSpot-Pro, and ScreenSpot-Pro over time split into single pass, zoom and cascade.
6. **Design levers:** AppAgent's action-space and documentation ablation, SeeAct oracle vs practical grounding, and o3 with and without the Jedi grounder.
7. **Training map:** data, SFT, grounding RL, online RL and world models, with a row saying what each stage becomes in 3D.
8. **Benchmark progress:** OSWorld, AndroidWorld and WebArena over time against human baselines, plus OSWorld 2.0. Secondary and self-reported scores use hollow markers.
9. **2D vs 3D:** a real ray-casting visibility computation. Panels around a user are visible, occluded (B is 87% hidden) or outside the field of view.
10. **Latency:** time per decision on a log scale: an XR frame, the Lumine game agent, UI-TARS-2, and three XR research prototypes.

## What the widget does
- **Episode mode:** three scripted episodes on a canvas phone (Wi-Fi, photo to Mei, alarm 7:30).
  - Each step shows the observation, switchable between screenshot, Set-of-Mark and accessibility tree. It also shows a one-line thought and the action drawn on the screen.
  - The action text changes with the observation: coordinates, a mark number, or a node name.
  - The photo episode has a grounding slip (Edit hit instead of Share), a reflection step that goes back, and an ask-user confirmation before sending.
- **Grounding mode:** tap or drag to place the predicted point. A sigma slider adds Gaussian error; 400 samples show the hit rate, matching the formula in §3.1 and two of the exercises.
- **Build:** plain JavaScript, ASCII-only source, three languages, works with touch.

## Verification
- All arXiv ids I cite were checked through the Semantic Scholar batch API (title, first author, date). The arXiv API rate-limited this sandbox, and that check was stopped.
- 2611.29268, GUI-Owl-1.5 and UI-Venus-2 were checked on their arXiv pages.
- The WebArena task count (812) comes from its GitHub README.
- **Not independently verified:**
  - Vendor scores taken from the dossier: the GPT-5.4/5.5, Anthropic and Operator system-card numbers.
  - Secondary scores, labelled as such in the post: Claude Opus 4.8 at 83.4, the AndroidWorld human baseline of 80.0%, and the 86.1 self-reported WebArena leaderboard entry.
  - Table-level numbers the dossier marks "paper", for example UI-Venus-2's 74.1 and 80.5, which are not in its abstract.
  - The inference setting behind GUI-Owl-1.5's 80.3 on ScreenSpot-Pro, which its abstract does not state. The figure shows it as "setting not stated".
- **Venues:** I followed the dossier. Semantic Scholar lists venues for a few works the dossier calls arXiv only (UFO2 in TMLR, UI-R1 in AAAI, CoAct-1 and ComputerRL in ICLR, NavAI at ASE workshops, SIAgent in TVCG). I kept them as arXiv preprints in the post.
- **Fixed:** the translators found that dollar prices in §5.1 were being read as inline math; they now read "USD …".

## Shared changes needed from the orchestrator
1. **Register the series:** `3d-gui-agent` is not in `_data/<lang>/strings.yml`, the file that holds series names and categories. It needs an entry in all three languages for the series navigation and the category pages.
2. **Reading list:** I created `docs/reading-lists/3d-gui-agent.md` with a header and my section ("第 2 篇"). Other workers who add sections in parallel may conflict with this new file when merging.
3. **Cross-links:** the post links to posts 01, 03, 04 and the research plan (05) by their slugs. They will resolve only after the merge.
