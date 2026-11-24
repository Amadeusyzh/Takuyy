# Assignment w4: post 04, "AI agents in XR: the closest work, the platforms, and the gap"

Slug `3d-gui-agent-04-agents-in-xr-and-the-gap`, series_order 4. Main sources:
`docs/research/3d-gui-agent/03-agents-in-xr-and-3d.md` (123 works, 25 deep notes with an overlap rating, the
gap analysis and the closest five works) and `docs/research/3d-gui-agent/04-platforms-and-tooling.md` (156
entries, 15 deep notes, a feasibility matrix and three prototype stacks).

## What the post must do

Map everything that comes close to a 3D GUI agent, as of November 2026, and state precisely what is missing.
This post matters for priority: be exact and fair about what others have done, and do not overclaim. Suggested
arc (adapt it):

1. The landscape: LLMs that build or edit XR worlds; XR assistants that answer or guide; automated operation and
   testing of XR apps; agents acting in 3D through a rendered view (game agents, embodied web agents);
   assistants on glasses and headsets and egocentric AI; 3D and spatial understanding.
2. The closest work in depth (Orienter, Revisiting Put-That-There, DuoZone, NavAI, SIAgent, ComboBench, the XR
   testing agents, and the products Gemini on Galaxy XR, Meta XR Operator and Siri on visionOS): what each does,
   with numbers, and what it does not.
3. Platforms and tooling: what an agent can observe and control on visionOS, Android XR, Meta Horizon OS,
   OpenXR, WebXR and engines; simulators and emulators; privacy and security rules; the feasibility matrix.
4. Datasets and benchmarks for XR interfaces, and the data gap.
5. The gap: what no work does yet, stated as concretely as the evidence allows, and the open problems (task
   benchmark, 3D perception of UI, 6-DoF action grounding, latency, off-view memory, API versus GUI actions,
   access, shared control in space, safety and privacy, data). Link to the research vision post 01 and to "the
   research plan" post 05 without describing its contents.

## Figures (6-10)

For example: a map of the area; a capability matrix of the closest works (perceive the 3D UI / understand
intent / operate or guide / evaluated as an agent), drawn as a heat map; per-turn latency of published XR
agents against the time budget of interactive use (log scale); the platform feasibility matrix; a timeline of
products and papers 2023-2026; the datasets compared by modality and size; a diagram of the gap.

## Widget

`3d-gui-agent-landscape`: an interactive capability map. Each work or product is a point or card placed by what
it covers (for example perception of 3D UI on one axis and operation on the other, with color for intent and
an outline for evaluation). The reader can filter by category, platform and year, tap an item to read a
one-paragraph summary with its numbers and link, and toggle an outline that shows the empty region the 3D GUI
agent idea targets. Data from the dossier tables; keep it accurate.
