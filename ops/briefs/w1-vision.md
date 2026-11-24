# Assignment w1: post 01, the research vision of the 3D GUI Agent column

Slug `3d-gui-agent-01-research-vision`, series_order 1, date `2026-11-24 12:01:00+0900`. This branch already holds
posts 02, 03 and 04 of the column and the four research dossiers. Read posts 02-04 (in English, and skim the
zh and ja versions for terms) so that this post introduces them and stays consistent with them.

## Purpose

This post states the owner's research idea publicly, with a date, so that the concept is on record ("占位"). It
must make the idea unambiguous and well argued, and it must be accurate and modest: every claim has to survive a
reader who knows Orienter, DuoZone, Revisiting Put-That-There, NavAI, SIAgent, GenXR-Bench, Meta XR Operator and
Gemini on Galaxy XR (all covered in post 04). It must also stay at the level of the concept: the owner's papers
will go to double-blind venues, so the post must not describe a method, a benchmark design, a benchmark name,
task counts, venues or deadlines. Write in the owner's voice ("we" for the owner's research), and state no result
that does not exist.

Title: "3D GUI agents: a research vision for operating the interfaces of VR, AR and MR for the user" (translate
naturally). Description: "Why the 3D interfaces of headsets and XR glasses are hard to operate, and the research
direction this column proposes: agents that operate the spatial GUI on the user's behalf, or guide the user
through it."

## Required wording of the key claims

Use these claims, in this wording or very close to it (translate faithfully into zh and ja); do not strengthen
them:

1. **Concept.** "We call a *3D GUI agent* an agent that takes a user's request, in speech or text and optionally
   with pointing, perceives the spatial user interface of a VR, AR or MR device, and either operates that
   interface on the user's behalf or guides the user through it." Do not claim the term or the idea was never
   used before (Orienter's arXiv title speaks of a "Vision-Based Spatial Intelligent Agent"; vendors describe
   assistants that act).
2. **Gap.** "As of November 2026 we found no published work that evaluates an agent carrying out users'
   natural-language requests by operating the 3D GUIs of XR apps, and no benchmark or dataset of such
   instruction-to-action tasks." Always phrase it as "we found no".
3. **Pieces exist.** "Pieces of such an agent already exist: detection of GUI elements in VR frames, LLM window
   management from speech and pointing, LLM navigation from VR screenshots, and tools that let agents drive VR
   apps for testing." Cite each piece.
4. **Operating cost.** "Operating a 3D interface has measured costs that a phone does not have: slower and less
   accurate pointing in depth, mid-air text entry at roughly half of phone typing speed, arm fatigue, and novices
   who do not know which action to take." Cite the numbers as post 03 does.
5. **Adoption, honestly.** "The difficulty of operating 3D interfaces is one of several barriers to everyday XR,
   alongside, and usually behind, price, comfort, content and motion sickness. An agent can lower the operating
   cost; it cannot fix weight, price or sickness." Present the owner's motivation (3D GUI complexity is a reason
   3D terminals have not entered daily life) as a hypothesis this evidence partly supports.
6. **Accessibility.** "Accessibility is the strongest near-term case: screen readers in XR can describe and
   enumerate, but users still fail to operate menus; with AI scene description, blind participants completed 11%
   of VR menu trials" (VRSight, UIST 2025; check the number in the dossier and the paper).
7. **Modes.** "A 3D GUI agent should not always take over: some operations are better done for the user, some
   better shown, and sometimes the agent should ask." Support it with the published evidence (DuoZone, VRCopilot,
   and the preprint on agents playing for users), but give no model for choosing the mode.
8. **What transfers from 2D.** "Much of the phone GUI-agent recipe transfers (screenshots plus structure,
   element-level actions, execution-based evaluation); what breaks is that the agent's view changes with every
   head movement, targets can be small, distant, occluded or behind the user, actions are 3D, and the user waits
   inside the interface."
9. **Plans.** "We are building an open benchmark and a first prototype on Meta Quest, and will report results
   when they exist." Nothing more specific.
10. **Vendors.** "Vendors are moving in this direction: Google says Gemini on Galaxy XR can take actions across
    apps and organize windows; Apple's Siri on visionOS 27 takes actions through app intents; Meta ships an
    experimental tool that lets coding agents drive VR apps. Their mechanisms and success rates are mostly
    undisclosed or limited to developer testing."

Words to avoid: "first agent in XR", "solves", "will make XR mainstream", any benchmark name, any number of tasks
or apps, any venue or deadline.

## Outline (adapt as needed)

1. Why this matters: phones became everyday devices partly because their interfaces are easy; GUI agents now
   operate phones for users; headsets have not had that moment; the 3D GUI agent. A date line: "This post fixes
   the direction as of November 2026."
2. What we mean by a 3D GUI agent: the definition (goal from language and pointing; perceives the spatial GUI;
   acts by doing, guiding or asking; evaluated by task success on interfaces it did not author), in scope (2D
   panels placed in 3D, spatial system UI, 3D widgets and volumes, the UI of immersive apps when the task is an
   interface operation, multi-app tasks) and out of scope (generating XR content, physical-task guidance,
   question answering about the view, automated testing, gameplay, display-free glasses), each with a reason.
3. Why 3D interfaces are hard to operate: the measured costs, linking post 03.
4. Does this matter for everyday XR? An honest answer (claim 5), with the evidence on learning and
   discoverability.
5. The strongest case: accessibility (claim 6).
6. From phone agents to 3D GUI agents: what transfers and what breaks (claim 8), linking post 02.
7. Do it, show me, or ask me: the autonomy spectrum (explain, show where, coach, reshape the layout, propose and
   act, act with takeover) with example operations for each, and why the choice matters (claim 7).
8. What exists already: claims 3 and 10 and the gap (claim 2), linking post 04.
9. Open questions, at a general level: how to measure it; how an agent should see an interface that changes with
   every head movement; which actions it should use; when to do, guide or ask; whether it makes XR accessible.
10. What this column does next (claim 9), and links to posts 02-04 and to "the research plan" (post 05, password-
    protected; do not describe it).
11. Representative papers (about 10-15: the 3D UI book of LaViola, Kruijff, McMahan, Bowman and Poupyrev; AppAgent;
    AndroidWorld; OSWorld; Orienter; DuoZone; Revisiting Put-That-There; VRSight; GazePointAR; Guided Reality;
    and others you need), Learning resources, Exercises (for example: time yourself changing one buried setting
    on a headset; list which steps you would delegate; describe one operation an agent should never do for you).

Length: about 3,500-5,000 English words; it is a vision post, so keep it tight and readable.

## Figures (4-6)

- `01-loop-2d-vs-3d`: the GUI-agent loop on a phone and on a headset (observe, ground, act, verify), annotated
  with what changes.
- `01-operating-cost`: published numbers as bars, each labelled with its source (text entry on a controller
  virtual keyboard, the XR mean and phone typing; selection error rates standing still and moving).
- `01-autonomy-spectrum`: the explain-to-act spectrum with example operations placed on it.
- `01-where-is-the-ui`: a top-down sketch of a user with a field-of-view wedge and windows around them
  (conceptual, no parameters of any benchmark).
- Optionally a figure of the column's map (how posts 01-05 fit together).

## Widget

`3d-gui-agent-where-is-the-ui`: a small top-down room with five floating windows around the reader's avatar. Drag
(or swipe) to turn the head; a field-of-view wedge shows which windows the agent can see in one frame, which are
occluded by others, and which are behind the user. A "memory" toggle keeps faded markers of windows seen before,
and a request picker ("open the browser", "bring the music player here") shows whether the agent could act from
the current view or must first turn or recall. It teaches partial observability in space; it must not encode any
benchmark parameters. Plain JavaScript, ASCII-only, three languages, touch support.
