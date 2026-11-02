# Final report: eai-up continuation run

The update sections of all six embodied-AI posts are now finished, built and checked in all three languages, and committed in three commits on top of the WIP commit. Every figure script, widget and code snippet in the update sections ran. All six posts pass the page check in en, zh-cn and ja-jp at 390 and 1100 px: no horizontal overflow, broken images, unrendered math or console errors.

## Per post

About 10,000 English words were added across the six update sections, including the tables; reading lines added: 01 45, 02 214, 03 92, 04 107, 05 175, 06 97.

| Post | Figures added | Widgets | Papers cited in the update | Done in this run |
|---|---|---|---|---|
| 05 VLA | 1 (VLA timeline) | 1 (`embodied-ai-vla-explorer`) | about 35 | figure fixed and enabled; widget phone layout fixed; exercise 6 |
| 02 RL | 2 (tracking reward, Flow-Noise) | 0 | 17 new table rows | figure enabled; new worked example, code, figure and exercises 6–7; phone overflow fixed |
| 03 Simulation | 0 | 0 | about 15 | exercise 6 |
| 04 IL and data | 1 (dataset scale) | 0 | 15 new rows | figure enabled; exercise 6 |
| 06 XR/HCI | 0 | 0 | 14 new rows | exercise 6 |
| 01 Foundations | 0 | 0 | 2 rows plus official links | nothing new |

Every new exercise has a localized hint in a `<details>` block.

**Figures.**
- I ran `embodied_ai_updates.py` and removed all nine `{% comment %}` wrappers.
- **VLA timeline:** labels overlapped and the legend covered the RT entries. Labels are now placed so they don't collide, and the legend sits in an empty area.
- **Tracking reward:** the legend covered the error curve, so I moved it below the plot.
- **Dataset scale:** I changed the caption to say "the *largest* human corpora are one to two orders of magnitude larger", because Nymeria (300 h) is smaller than some robot datasets.

**Post 02 worked example.** It explains why pi_RL needs Flow-Noise: adding noise to each Euler step makes the log-likelihood of a flow policy computable, and with it the PPO ratio. It has the derivation, runnable code and the printed output. The output in the post is exactly what the script prints (a_K = 0.441, ratio = 0.157). A new figure, generated from the same toy model, shows the noisy chains and the PPO ratio as θ changes for three noise levels.

**Phone overflow in post 02.** An inline formula in the original SAC section made the page 432 px wide at 390 px. I split it into two pieces in all three languages.

**Widget on phones.**
- Labels in the rightmost lane were clipped and two lane headers overlapped. Markers now sit at the left edge of each lane, long names are shortened with an ellipsis (tapping shows the full name), and the headers wrap and shrink to fit.
- The caption now mentions the shortened names in all three languages.
- The source is still ASCII only and passes `node --check`.

## How I verified

- **arXiv:** all 85 arXiv IDs added in the posts, widget and reading list resolve, and their titles and first authors match how the posts cite them.
- **Abstracts and comments**, used to confirm these specific 2026 claims:
  - X-WBC: accepted to CoRL 2026.
  - SONIC: *Science Robotics* 11 (117), 2026.
  - RoboCasa365: ICLR 2026, with 365 tasks and 2,500 kitchens.
  - Dataset hours: UniHand-2.0 over 35,000 h, EgoScale 20,854 h, RDT2 10,000 h, MolmoAct2 720 h, Xu et al. 1,500 h.
  - The names "Real-Time EXPO-FT" and "RL token" appear in their abstracts.
- **Exercise answers:** the numbers in the hints were computed, and the post 05 exercise matches the widget data (11 open flow-matching models).
- **Exercise wording:** the post 06 hint follows that post's three routes (share the action space, edit the pixels, distil from web video).

## Open issues and uncertain facts

- **Venues still unconfirmed** (dblp returned no data and Semantic Scholar was rate-limited, HTTP 429): SimpleVLA-RL and HIL-SERL stay listed as preprint / arXiv, and the TRI LBM *Science Robotics* status comes only from the project page.
- **Carried over from last run:** pi\*0.6 and pi0.7 are marked "flow" based on lineage, not on their papers; Genie 4 is described only as a research preview; no CHI, UIST or IEEE VR 2026 teleoperation papers could be verified.
- **World-action lane** of the timeline figure: five models within three months share one area, so it is hard to tell which label belongs to which marker. The widget shows the same models clearly.

## Shared-file changes

- **`scripts` breaks the build here:** in this runner the site root contains a `scripts` entry that cannot be read, and Jekyll fails on it. That happens even with the sandbox disabled. To build, I temporarily added `- scripts` to `exclude` in `_config.yml`, then restored the file; it is not committed. Adding that line permanently would be harmless and would avoid the problem for anyone building here.
- **SVG regeneration noise:** every run of a figure script rewrites all SVGs with new timestamps and random IDs. Setting `svg.hashsalt` and dropping the date metadata in `bin/figures/style.py` would make re-runs reproducible. I discarded these metadata-only changes rather than committing them.

## Left undone

- Posts 01, 03 and 06 still have no new figures, and post 05 has one plus the widget, so most posts are below the brief's 2–4 figures.
- Post 01 got no new exercise.
- The widget's model summaries remain English only.
