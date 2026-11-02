# Final report (gfx-d, continuation run)

**Headline:** Chapter 13 now has all eight figures generated and every code snippet runs in all three languages. All 57 citations check out (45 in chapter 13, 12 in chapters 03–07). But **I could not build the site or run `site-check`**: the sandbox blocks the build. The orchestrator needs to build the site and run the check before merging.

**Why the build failed:** the sandbox puts a `/dev/null` device file at `site/scripts`, and Jekyll stops with `Permission denied @ rb_sysopen - site/scripts`. It failed the same way with the sandbox turned off. Running `bundle exec` or `ruby` directly with a config that skips `scripts` was refused. With no `_site` folder, `site-check` can't run either. As a substitute I tested both widgets in a standalone Playwright page and rendered the figures to PNG to look at them.

New commit: `b2b3f3d` (Part A fixes). Part B was already complete in the earlier WIP commit and needed no changes.

## Part A: `graphics-13-research-frontiers-2026`

**Title:** "Graphics research frontiers 2026: what SIGGRAPH, SIGGRAPH Asia and the latest preprints are doing"

| Item | Value |
| --- | --- |
| English words | about 4,800 by script count (prose and inline math, excluding code and Liquid). The earlier estimate of 7,000+ was wrong. |
| Figures | 8 (three of them have en/zh/ja versions) |
| Widgets | 2 (`graphics-frontiers-explorer`, `graphics-gaussian-ray`) |
| Papers cited | 45 surveyed works, plus Gerchberg–Saxton (1972) and IPC (2020) as background |

**What I fixed:**
- **Figure script path:** `graphics_13.py` was writing into `bin/assets/…`. It now writes to `assets/img/blog/graphics/`, and all 14 SVG files exist. I deleted the stray `bin/assets` folder.
- **Gaussian-ray figure:** the peak labels overlapped and there was no legend. I added a legend, moved the value labels to the side and enlarged the 3D view. The caption still matches (peaks 1.00 / 0.93 / 0.76).
- **Control-variate example:** it had no code at all. I added a runnable snippet in all three languages, with a localized lead-in. It prints β ≈ 1.69, σ 0.174 against 0.022, and shows that both estimates are unbiased. That matches the worked example and the figure legend.
- **Hologram snippet:** it only defined a function and printed nothing. It now builds the ring-and-cross target and prints relative errors of 0.444, 0.366 and 0.288 after 1, 5 and 60 iterations, the same numbers as the figure.

**What I verified:**
- **Code:** I ran every Python block in en, zh-cn and ja-jp (4 per language) and all match their stated outputs. I also recomputed the exercise-1 hint numbers (β* ≈ 1.131, ρ² ≈ 0.998, about 9× and 500× less variance) and they hold.
- **Figures:** I looked at all eight as PNGs, and the captions match the computed numbers.
- **Widgets:**
  - Both files are ASCII-only and pass `node --check`.
  - In the test page, at 390 and 1100 px in en, zh and ja, a mouse drag and a touch tap gave no console errors and no horizontal overflow.
  - The explorer picks up all 45 localized summaries.
  - The Gaussian-ray widget's defaults show t* = 2.26, G = 0.407 and the Euclidean point t = 3.54, G = 0.245, as the text says.
  - The "today" line in the explorer sits correctly at the start of November.
- **Citations:** I re-checked every entry by script.
  - arXiv API: title, first author, comment and journal reference.
  - OpenAlex, for all DOIs: title, first author, date and venue.
  - All titles match (≥ 0.97 similarity) and all first authors match.
  - All 7 SIGGRAPH Asia "accepted" entries carry an acceptance note on arXiv; none of the 5 "preprint" entries has one.
- **Dates:** SIGGRAPH Asia 2026 is confirmed as 1–4 December 2026 at KLCC, Kuala Lumpur, by the official site and the SIGGRAPH blog. The official `.ics` calendar file says 3–6 December, which looks like an outlier.

**Open issues and uncertain facts:**
- **Kramdown rendering is unverified.** No other post uses the two patterns that might break: the `{: #fw-…}` attribute lines, and the `<details markdown="1">` hint blocks indented inside numbered lists. Going by kramdown's rules they should render, but nobody has seen them. If a hint shows the label "Details" instead of the localized summary text, put a blank line after `<summary>…</summary>`.
- **Fact gaps left as they were:** Pacific Graphics 2026 is dated only "October" because sources conflict. One EGSR entry (`ntc-hyper`) has no DOI; its EGSR 2026 status rests on arXiv's journal reference.
- **Topic gaps** (unchanged): spectral rendering, neural denoising and supersampling, and Gaussian-to-mesh work.

## Part B: chapters 03–07

Each of the 15 files (5 chapters × 3 languages) got 2–3 new table rows and one sentence pointing to chapter 13. I reviewed the English diff against `main`: only those rows and that sentence were added. All 12 papers were re-checked: the 9 DOIs against OpenAlex and the 3 arXiv ids against the arXiv API. Titles, first authors and venues are correct.

## Shared-file changes I'd like

- **Jekyll exclude list:** add `scripts` to `exclude` in `_config.yml`, or build outside the sandbox. This is what currently stops `site-build` in the worker environment.
- **Chapter 07:** its last paragraph says "This completes the graphics track"; with chapters 08–13 that is no longer true.
- **`make_all.py`:** if `bin/figures/graphics/make_all.py` lists every script, add `graphics_13.py`.

## Left undone

- **Build and page check:** `site-build`, `site-check graphics-13-research-frontiers-2026` and the screenshot review of the real page could not run.
- **Translation read-through:** the zh-cn and ja-jp texts have still not been read in full for quality. They match the English structure and the code, and I translated the new snippet lead-ins myself.
- **Stray files:** the untracked dotfiles (`.bashrc`, `.mcp.json`, …) and `scripts` in the repo root are sandbox mask files, not mine. I did not commit them, and they should not be committed.

Sources:
- [SIGGRAPH Asia 2026: about the event](https://asia.siggraph.org/2026/about-the-event/about-siggraph-asia/)
- [SIGGRAPH blog](https://blog.siggraph.org/?p=20746)
- [SIGGRAPH Asia 2026 calendar file](https://asia.siggraph.org/2026/storage/2025/11/SIGGRAPH_Asia_2026_Malaysia.ics)
