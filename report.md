# Final report: post 01 of the 3D GUI Agent column (w1)

Post 01 is written and committed on `api/w1-vision` in all three languages, with 6 figures and 1 widget, in 3 commits (`8272358`, `d1c259f`, `31378dc`). After the last edits the site builds without errors. `site-check` passes on all 6 pages (en, zh-cn and ja-jp at 390 and 1100 px): all 6 figures load, no broken images, no horizontal overflow, no unrendered math, and no console errors after the simulated drag on the widget.

**Title:** "3D GUI agents: a research vision for operating the interfaces of VR, AR and MR for the user"
- zh: 3D GUI 智能体：替用户操作 VR、AR 与 MR 界面的研究愿景
- ja: 3D GUI エージェント：VR・AR・MR のインターフェースをユーザーに代わって操作するための研究ビジョン

**Files:** `_posts/{en-us,zh-cn,ja-jp}/2026-11-24-3d-gui-agent-01-research-vision.md`, dated `2026-11-24 12:01:00+0900`, `series_order: 1`.

## Numbers
- **English length:** about 5,060 words of body text before the paper table, about 6,300 with the tables and exercises. That is at the upper edge of the 3,500–5,000 target.
- **Figures:** 6, each in three languages, made by `bin/figures/3d-gui-agent/gui_agent_01.py`.
- **Widgets:** 1, `assets/js/widgets/3d-gui-agent-where-is-the-ui.js`.
- **Cited works:** 17 in the Representative papers table, and about 40 across the whole post. The post also cites product sources from Google, Meta and Apple, including the WWDC26 session 343.

## Content
- All ten required claims appear in the brief's wording or very close to it. Each is set as a blockquote and backed by its sources.
- None of the words to avoid appears. The post does not describe the owner's own method or benchmark, gives no task or app counts, and names no venue or deadline.
- The scope section explains why each excluded topic is excluded: content generation, physical-task guidance, question answering, testing, gameplay, and display-free glasses.
- The post ends with Representative papers, Learning resources and five Exercises. Each exercise has a localized hint.
- The Chinese section of the reading list is appended to `docs/reading-lists/3d-gui-agent.md`.

## What the figures show
1. **`01-loop-2d-vs-3d`:** the observe, ground, act, verify loop on a phone (top) and on a headset (bottom). Orange notes mark what changes in 3D.
2. **`01-operating-cost`:**
   - Text entry: phone 36.2 wpm, mean of 137 XR methods 20.36, VR keyboard 15.44 with a controller and 9.77 freehand.
   - Selection error rates: phone typing 2.3%, a headset in a car 8.8–23.5% standing still and 20.4–36.0% moving, ray selection at 8 m 15.2% (controller) and 32.9% (hand).
   - Every bar is labelled with its source.
3. **`01-where-is-the-ui`:** a top-down view of five windows around a user, sorted by real ray casting into in view, occluded, outside the view, and behind. The layout is made up for illustration.
4. **`01-accessibility`:** in VRSight, 9 of 9 participants found the menu but only 1 of 9 pressed the target button. In SeeingVR, 4 of 11 completed the menu task without the tools and 11 of 11 with them.
5. **`01-autonomy-spectrum`:** six modes from explain to act with takeover, each with an example operation, the supporting studies, and "ask" as a channel available at every step.
6. **`01-column-map`:** how posts 01–05 fit together.

## The widget
The reader drags or swipes to turn the head. A field-of-view wedge and a first-person strip show what the agent sees in that frame. Each window is marked as in view, at the edge of the view, occluded, outside the view, or behind the user.
- **Memory toggle:** leaves faded markers where windows were last seen.
- **Rearrange button:** moves the windows, which can make that memory out of date.
- **Request picker:** says whether the agent can act from this frame, or must turn, search, recall or ask.

The widget encodes no benchmark parameters. It works in three languages, has ASCII-only source, and supports touch with `touch-action: pan-y`.

## Verification and changes beyond the brief
- I checked 17 arXiv IDs against the arXiv API and 9 DOIs against Crossref, and opened the main URLs. An independent reviewer then checked the post against the dossiers. All of its points are fixed in all three languages except one (see the last bullet).
- **Claim 6 wording:** I changed "blind participants" to "blind and low-vision participants", because VRSight's 11% comes from 5 blind and 4 low-vision users.
- **Claim 5 framing:** the post presents the owner's motivation as a hypothesis that the evidence only partly supports.
- **Claim 9 left as written:** the reviewer flagged that "open benchmark … on Meta Quest" says something about platform and openness. I kept it verbatim because the brief requires that wording. Please confirm it is acceptable for the double-blind plans.

## Not verified
- I did not open the Luong et al. paper. The figures (14.3% higher, 66.2% further forward) come from the dossier and post 3.
- The vendor statements are only what Google, Apple and Meta say. Their mechanisms and success rates are undisclosed, and the post says so.

## Shared changes needed from the orchestrator
- **Post 03's Apple link:** it cites a different Apple newsroom URL for the 8 June 2026 Siri announcement than post 04. I checked that both URLs exist; post 01 uses the "Apple introduces Siri AI" release.
- **Orienter F1:** post 03 gives 46.00% (the arXiv number), while posts 01 and 04 give 44.10% (the FSE 2026 version). Post 03 should probably be aligned.
- **Untracked files:** the working tree has untracked environment files (`.bashrc`, `.mcp.json`, `scripts/` and others) that I did not create or commit.
