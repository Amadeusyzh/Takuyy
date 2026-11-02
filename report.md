# Fixer report (`api/fixer`, commit `ba1275d`)

All five tasks are done and committed. I changed 18 post files (6 posts × 3 languages) and did not touch `_sass` or any other shared file.

## 1. Horizontal overflow: all fixed

`site-check` now gives `scrollWidth == clientWidth` at 390 px and 1100 px in en, zh and ja for all six pages I changed. It also reports no broken figures, no unrendered math and no console errors. I found each culprit with a Playwright script that scans elements and hides them one at a time to see which one widens the page.

The footer, the navbar and the progress bar only looked wide because they grow with the page; none of them was a cause. There were two real causes:

**A. Kramdown breaking inline math (the big one).** Kramdown reads `_…_` or `*…*` inside a single-`$` formula as italics and inserts `<em>`. MathJax then pairs the wrong `$` signs and renders whole sentences as one formula that cannot wrap. That is where the 1895 px and 2195 px widths came from.

| Page | Broken formula | Fix |
| --- | --- | --- |
| graphics-07 | SPH pressure force, `\nabla_{\mathbf{p}_a}C`, `\mathbf{f}_{\text{el}}…\mathbf{f}_{\text{ext}}`, predicted position | escaped the underscores as `\_` in those paragraphs |
| graphics-05 (ja; same bug in en/zh) | running mean `\bar{I}_s = …` | `\_` |
| graphics-13 (figure caption and text) | `t^*` (asterisk italics) | `t^{\ast}`, which renders the same |

**B. Valid inline formulas too wide for a phone**, since MathJax does not line-break inline math:
- **graphics-07:** I moved the Baraff–Witkin linear system to display math, which scrolls on its own. The predicted-position formula now reads "x̃ = A (equivalently, B)".
- **graphics-13:** `Cov(f,g) = … = 0.14086` is split as "…, which is 1 − 0.85914 = 0.14086".
- **graphics-06:** the SVGF variance identity now reads "the variance of … is …".
- **world-models-02, exercise 2:** reworded to "the posterior q(…) is proportional to …".

All three languages got matching wording. No CSS rule was needed.

## 2. Roadmap hub (en, zh, ja, first-person voice kept)

- "Four series" is now five series plus the dated paper-digest column, with one sentence on why graphics engines are the bridge.
- **Mermaid diagram:**
  - It now runs top to bottom, with each stage as a left-to-right row; a 30-node single row would have been unreadable.
  - Graphics chapters 08–13 are added as branches: 2 → 8, 7 → 9, 5 → 10 and 12, 6 → 11, and 11 + 12 → 13.
  - A new "2.5 Graphics engines" subgraph sits between neural rendering and world models, with edges into world models and embodied AI.
  - I also added neural-rendering chapter 06, which was missing.
  - I took screenshots at 1100 and 390 px and checked them; both read well, and the diagram can be zoomed.
- **Stage 1:** chapters 8–13 added with their front-matter titles and links, plus one sentence saying chapters 1–7 are the core.
- **New "Stage 2.5":** a short section with the localized headings from the brief and links to all six engine posts.
- **Suggested pace:** graphics is now 13 posts, 8–11 weeks (4–6 weeks for the core). I added a graphics-engine row (6 posts, 3–5 weeks) with the milestone from the brief.
- **Browse by category:** added Graphics engines and Paper digest.
- **New "Keeping up with new papers" section:** links `paper-digest-01-2026-oct-nov`. Its facts (six categories, 42 papers, 1 Oct–2 Nov 2026) come from the digest itself.

## 3. Closing paragraph of chapter 07 (en, zh, ja)

It now says three things: this is the end of the core; chapters 08–13 continue with geometry processing, animation, volumes, real-time techniques, differentiable rendering and the 2026 frontier, with a link to chapter 08; and readers who want to skip ahead can go to neural rendering next, with a link to neural-rendering-01. The original text about what comes back in neural rendering is kept.

## 4. Internal links

I checked all 1605 internal links in every post and found no broken ones. Every `/blog/2026/<slug>/` link matches a file in `_posts/en-us/`, and every `/blog/category/<key>/` link matches a key in `display_categories`. The only matches my script flagged were the Waymo blog's own external URLs (`waymo.com/blog/2026/02/…`), which are fine.

## 5. Build and check

`site-build` exits with code 0. It prints one warning, `Lexer: unexpected object at 669`, which was already there before my changes. `site-check` passes on all six changed posts at both widths in all three languages.

## Left undone: the same math bug in posts I was not allowed to edit

The same Kramdown problem still breaks inline formulas in all three languages of:
- **graphics-01:** `\mathbf{p}_{\text{clip}} = P\,V\,M\,\mathbf{p}_{\text{obj}}`
- **graphics-12:** `C = \sum_i \mathbf{c}_i\,\alpha_i \prod_{j<i}(1-\alpha_j)`

Neither page overflows today, but each formula and the text around it render wrongly. The fix is the same: write `\_` for the underscores in those paragraphs.

My scan also flagged one paragraph in graphics-08 (line 159). It is probably a false positive, but it is worth a look.

## Suggested guide change

Add one line to `docs/BLOG_GUIDE.md` §5: inside inline `$…$`, a `_` that could pair with another `_` in the same paragraph must be written `\_`, and use `^{\ast}` instead of `^*`. Without this, new posts will keep hitting the bug.

**Note:** the repository root contains untracked runner files (`.bashrc`, `.gitconfig`, `.mcp.json`, `scripts/`, …). I left them uncommitted.
