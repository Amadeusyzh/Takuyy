# Assignment w2: post 02, "GUI agents on 2D screens: a survey to November 2026"

Slug `3d-gui-agent-02-gui-agents-on-2d-screens`, series_order 2. Main source:
`docs/research/3d-gui-agent/01-gui-agents-2d.md` (216 works, 31 deep notes, 48 benchmarks, all arXiv ids
checked). Secondary: the other dossiers in the same folder for the 3D connections.

## What the post must do

Give a reader a complete, current picture of GUI agents on phones, desktops and the web: what they are, how
the main designs work, how they are trained and evaluated, where they stand in November 2026, what remains
hard, and what each part means for 3D interfaces. Suggested arc (adapt it):

1. What a GUI agent is: the perceive-reason-act loop on a screen; a short history from UI understanding and
   RL on MiniWoB to LLM and VLM agents and commercial computer-use agents.
2. Observation: screenshots, accessibility trees and view hierarchies, set-of-marks and hybrids; why pure
   vision won ground.
3. Grounding: from element indices to coordinate prediction; the grounding models (SeeClick, CogAgent,
   Ferret-UI, UGround, OS-Atlas, ShowUI, Aria-UI, UI-TARS, GUI-Actor and newer) and ScreenSpot-Pro-style
   evaluation.
4. Planning, reflection and memory; multi-agent designs (Mobile-Agent-v2/-E, Agent S, UFO); action spaces.
5. Training: trajectory data, data synthesis, reinforcement learning (DigiRL, UI-R1, GUI-R1, UI-TARS-2 and
   newer), world models for GUIs.
6. Benchmarks and the state of the art, with numbers and dates (AndroidWorld, OSWorld, WebArena, ScreenSpot-Pro
   and the others in the dossier); commercial agents.
7. Humans in the loop, accessibility, safety and privacy.
8. "From 2D to 3D": a careful section on what transfers to VR/AR/MR interfaces and what breaks (observation,
   grounding in depth, the 6-DoF action space, off-view targets, latency, evaluation), linking to posts 03 and
   04 and to the research vision post 01.

## Figures (6-10)

For example: a timeline of GUI agents 2016-2026; the agent loop and the anatomy of a modern agent; observation
types side by side on one example screen; benchmark progress over time (best success rate versus date for 3-4
benchmarks, from the dossier's numbers); the grounding gap (ScreenSpot versus ScreenSpot-Pro scores); a map of
training approaches; a 2D versus 3D comparison diagram.

## Widget

`3d-gui-agent-agent-loop`: a toy phone screen (drawn on a canvas) and a short list of instructions (for example
"turn on Wi-Fi", "send the photo to Mei", "set an alarm for 7:30"). The reader steps through an agent's episode:
each step shows the observation the agent receives (toggle: screenshot only, with set-of-marks labels, or the
accessibility tree), its reasoning in one line, the chosen action drawn on the screen, and the next screen.
Include one episode with a mistake and a reflection step that recovers. A second control shows grounding: the
reader clicks on the screen to see how a predicted point maps to an element and how a few pixels of error
changes the hit. Deterministic scripted episodes are fine; it is a teaching tool.
