# Final report, w4: post 04 written, built and checked

**Title:** "AI agents in XR: the closest work, the platforms, and the gap" (`3d-gui-agent-04-agents-in-xr-and-the-gap`, series_order 4). It exists in en-us, zh-cn and ja-jp and is committed in 6 commits on `api/w4-xr-agents`.

**Checks:** `site-build` finishes without errors. `site-check` passes for en, zh and ja at 390 and 1100 px: 10 figures each, no broken images, no horizontal overflow, no unrendered math, and no console errors after the widget drag. I also looked at several screenshots myself.

| Item | Count |
| --- | --- |
| English words | about 8,500 of prose (11,356 by `wc`, which also counts tables, links and front matter) |
| Figures | 10, each in three language versions (30 SVGs), made by `bin/figures/3d-gui-agent/gui_agent_04.py` |
| Widgets | 1, `3d-gui-agent-landscape` |
| Cited papers | 35 in the Representative papers table, plus about 15 more in the text, and 7 product or platform sources |

The post also has Learning resources, 5 exercises with hints, and its section of `docs/reading-lists/3d-gui-agent.md` (in Chinese).

## Arc of the post

0. A working definition of a 3D GUI agent and a rubric with four properties: perceives the 3D UI, understands natural-language intent, operates or guides, and is evaluated.
1. The landscape in seven lines of work (1.1–1.7).
2. The closest work in depth: Orienter, ComboBench, NavAI, SIAgent, Put-That-There, DuoZone, the XR testing agents, and the products (Gemini on Galaxy XR, Meta XR Operator, Siri on visionOS).
3. The platforms: what each one lets an agent observe and control, the four access levels L0–L3, the privacy and store rules, the feasibility matrix, three prototype stacks, and a schema for logging agent episodes.
4. The datasets and the data gap.
5. The gap: a precise statement of what is missing, what the idea adds, where the post says plainly that others got there partly first, and 10 open problems.

It links to post 01 and to "the research plan" (post 05) without describing the plan.

## What the figures show

- **Map:** the eight lines of work around the target.
- **Timeline 2023–2026:** research, infrastructure and products in three lanes.
- **Capability heat map:** 23 works rated against the rubric; no row matches the target row.
- **The pieces with their numbers:** Orienter F1 44.1%, ComboBench at most 11.7%, SIAgent intent accuracy by model, Embodied Web Agents best model against humans.
- **Latency on a log scale:** published XR agents need 2 s to several minutes per decision, against a 4 s comfort budget and 0.1–0.25 s for real-time control.
- **Agent loop:** each work placed on the stage it covers; nobody closes the whole loop.
- **Observation and action layers:** which layers each access level (L0–L3) can reach.
- **Platform feasibility matrix.**
- **Datasets:** XR datasets against 2D datasets, by size and contents.
- **Gap diagram:** three overlapping sets with an empty centre; Gemini on Galaxy XR claims to be there but has published no mechanism or evaluation.

**Widget:** 38 works and products placed by perception of the 3D UI and by operation, coloured by intent and outlined by how they were evaluated. It filters by category, platform and year, shows a card with a summary, numbers and a link in all three languages, and can outline the empty target region. It works with touch and the source is ASCII-only.

## Verification

- **arXiv:** the arXiv API returned HTTP 429 for the whole run, so I checked ids against OpenAlex (by DOI and by title search) and Crossref instead.
- **Product pages:** I re-fetched the Meta XR Operator blog and the Galaxy XR launch post and checked the quotes the post uses.
- **Statuses changed from the dossier, confirmed in Crossref:**
  - Orienter is published in PACMSE 3(FSE) (DOI 10.1145/3808134), under a slightly longer title.
  - SIAgent is in IEEE TVCG 32(7), 2026.
  - NavAI appeared at the ASE 2025 Workshops.
  - XRintTest is in *Automated Software Engineering* 33(3), 2026.
  - XARP is in PACM HCI 10(4) under the published title "XARP: A Human-First and Agent-Ready Extended Reality Toolkit in Python".
- **Not re-checked during this run:** ComboBench, VideoGameBench, VRSight, Sensible Agent and Satori did not match in OpenAlex or Crossref. For these I relied on the dossier's arXiv check of 24 November 2026; ComboBench is presented as a preprint.
- **Other things I could not verify:**
  - the 20 ms motion-to-photon figure (labelled in the post as "often quoted", with no source);
  - whether Android XR accessibility services work for 3D panels (marked as undocumented);
  - Gemini on Galaxy XR's actual capabilities (presented as claims only).
- **Judgement calls:** the heat-map and widget ratings are my reading of the sources, and the post says so with the rubric stated.

## Shared changes needed from the orchestrator

- **Reading list:** `docs/reading-lists/3d-gui-agent.md` did not exist on my branch, so I created it with a header and my `## 04` section. Expect a merge conflict with other workers who also create it; keep one header.
- **Series names:** `_data/<lang>/strings.yml` probably needs the series name and category for `3d-gui-agent`, if no one else has added them.
- **Stray files:** untracked dotfiles from the environment (`.bashrc`, `.mcp.json`, `scripts/` and others) sit in the working tree. I did not commit them.
