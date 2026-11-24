# Final report: w3, post 03 of the 3D GUI Agent column

**Title:** "Why 3D interfaces are hard to operate: the evidence" (`3d-gui-agent-03-why-3d-interfaces-are-hard`, series_order 3, dated 2026-11-24 12:03 +0900). It is written in en-us, zh-cn and ja-jp with the same file name, and everything is committed on `api/w3-3dui` in six commits.

`site-build` finishes without errors. `site-check` is clean on all six pages (en, zh and ja at 390 and 1100 px): 10 figures each, no broken images, no horizontal overflow, no unrendered math, and no console errors after the drag test. I looked at several screenshots myself.

## Size
- **English word count:** about 8,000 words of prose, plus about 3,500 in tables (11,500 in total).
- **Figures:** 10, each in three languages (30 SVGs). They are made by `bin/figures/3d-gui-agent/gui3d_03.py`.
- **Widgets:** 1, `assets/js/widgets/3d-gui-agent-selection-lab.js`.
- **Cited works:** about 90 in the text. The Representative papers table has 36 rows, and the catalogue has 30 operations.

## What the post argues
The arc is: task taxonomy, then input, then spatial UI structure, then measured difficulty, adoption, accessibility, the help that exists today, the catalogue of 30 operations, and finally what this means for agents.

It keeps two claims apart, as the dossier does:
- **Strongly supported:** operating a headset costs more than operating a phone. Pointing in depth is 25% slower, selection error rates are 9 to 36%, text entry runs at 5 to 15 wpm against 36 wpm on a phone, mid-air input tires the arm, and novices cannot find the right gesture.
- **Only weakly supported:** that this cost is *the* reason adoption is slow. Price, comfort, content and sickness dominate the surveys. Usability appears as a contributing factor, and none of the surveys even offered "too hard to use" as an answer.

## Figures
1. **Task taxonomy:** five tasks, the classic techniques, how each looks on today's headsets, and the agent action each would become.
2. **Input techniques:** the fitted Fitts' law lines for five freehand techniques (HoloLens 2), and error rates in a parked and a moving car.
3. **Cost of depth:** depth movements 25% slower, the confirm action causing most ray errors at 8 m, and model fits with and without a depth term.
4. **Comfort distances:** the distance rules of the four platform guidelines on one log axis.
5. **Reference frames (3D):** world-, body-, head-locked and tag-along panels before and after the user turns.
6. **Arm fatigue:** arm poses and the shoulder load they need in a simple model of my own (assumptions stated), and the Rohmert endurance curve used by Consumed Endurance.
7. **Text entry:** 17 methods from the papers compared with the phone, plus the simulated upper bounds.
8. **Cybersickness:** sickness scores by content type with the simulator cut-offs, and a 15.6% dropout waffle chart.
9. **Market:** shipments on a log scale (headsets, glasses, phones, a missed 2023 forecast) and the reasons people gave for not buying a Vision Pro.
10. **Catalogue:** the 30 operations by task and by who should act (agent does it, does it with confirmation, guides, or neither).

## The widget
In the selection lab the reader runs 18 trials with one of four techniques: hand ray, gaze + pinch, gaze + dwell, or direct touch.
- **Scene:** a 3D room with panels at 0.45, 1, 2 and 4 m and buttons from 0.7° to 5° wide.
- **Simulated noise (stated on screen):**
  - ray jitter, plus a kick when the user confirms;
  - eye-tracking error of about 1°;
  - dwell selection that fires on any button the user looks at, wanted or not (the Midas touch problem);
  - touch limited to arm's reach, with fingertip noise, depth misjudgment and a simulated step toward far panels.
- **Output:** time and errors per target, running throughput, and arm load with a Consumed Endurance estimate. A summary line compares the techniques the reader has tried.
- **Behaviour:** it works with a mouse and with touch, has a 10 s timeout per trial, and the UI is in all three languages.

## What I could not verify
- I checked 30 arXiv IDs and DOIs myself against OpenAlex (the arXiv API was rate-limited); all match. Everything else relies on the dossier's citation audit from the same day.
- The units of the depth term in Barrera Machuca's model are not given in the dossier, so the post quotes the formula without units.
- I checked the Rohmert endurance formula only indirectly: it reproduces the reference values 384.8 s at 20% and 6.9 s at 100% that are relayed from the paper. I did not read the paper itself.
- The 2025 figure of 14.5 M XR devices is IDC's December 2025 *forecast*, and the 2023 and 2024 headset totals are derived by me from IDC growth rates. Both are labelled that way in the text and in the figure.

## Shared changes needed from the orchestrator
- **`docs/reading-lists/3d-gui-agent.md`:** I created it with a short column header and a section for post 03. Other workers will likely create the same file, so it needs a manual merge.
- **No `make_all.py`:** I did not add one to `bin/figures/3d-gui-agent/`, to avoid a merge conflict. Please add it after merging, listing every worker's script.
- **Cross-links:** posts 01, 02 and 04 are linked by their slugs, and post 05 only as "the research plan". They resolve only after the merge.
- **Dollar signs:** MathJax on this site treats `$...$` as inline math, so two `$` amounts in one paragraph break the rendering. I wrote currency as "USD" in all three languages. Other workers' posts may need the same fix.
