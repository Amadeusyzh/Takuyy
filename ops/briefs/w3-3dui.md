# Assignment w3: post 03, "Why 3D interfaces are hard to operate: the evidence"

Slug `3d-gui-agent-03-why-3d-interfaces-are-hard`, series_order 3. Main source:
`docs/research/3d-gui-agent/02-3d-ui-and-xr-interaction.md` (162 works, 22 deep notes, a platform comparison,
a market table, a barrier table, and a catalogue of 30 3D UI operations with measured difficulty).

## What the post must do

Build, with evidence and numbers, the central claim of the column: operating 3D user interfaces costs users more
than operating a phone, in ways that matter for everyday adoption and for accessibility, and part of that cost is
exactly what an agent could take over. Suggested arc (adapt it):

1. The task taxonomy of 3D interaction (selection, manipulation, navigation, system control, symbolic input) and
   how each looks on today's headsets and glasses.
2. Input: ray-casting, direct touch, gaze and gaze + pinch, controllers, voice; the Midas touch problem; pointing
   models in 3D and the cost of depth, with the measured numbers.
3. Spatial UI structure: windows, volumes and immersive spaces; world-, body- and head-locked content; placement,
   occlusion, off-view content and multitasking; what the platform guidelines say.
4. Measured difficulty: fatigue (consumed endurance, "gorilla arm"), selection error rates, text entry rates,
   learnability and discoverability, cybersickness, cognitive load, social acceptability.
5. Adoption: device sales and usage data with sources, why people stop using headsets, and where interface
   complexity appears among the reasons (be careful to separate evidence from speculation).
6. Accessibility in XR and who is excluded today.
7. What exists to help (tutorials, adaptive and intelligent UIs, voice assistants) and its limits.
8. The catalogue: concrete operations on a headset, their difficulty, and whether an agent could do them, guide
   the user, or neither, leading to posts 04 and 01.

## Figures (6-10)

For example: the task taxonomy as a diagram; input techniques compared (speed, accuracy, fatigue) from published
numbers; pointing throughput or time versus depth; text entry rates on phones versus VR and AR methods; a
consumed-endurance illustration of arm poses; a world-, body- and head-locked layout diagram in 3D; sales and
usage over time with sources; the catalogue of operations as a matrix (difficulty versus agent suitability).

## Widget

`3d-gui-agent-selection-lab`: a small 3D scene (WebGL 2 or canvas 2D projection, no libraries) with targets
(buttons and panels) at different depths and sizes. The reader picks a technique (ray-casting from the hand,
gaze + pinch, direct touch within arm's reach) and runs a short trial block; the widget simulates realistic noise
(hand jitter that grows with distance, eye-tracking error of about 1 degree, the Midas touch problem for gaze with
dwell) and plots movement time and errors per target, with a running estimate of throughput and of arm effort
(a simple consumed-endurance model). On a phone the reader taps instead of pointing; say in the instructions what
is simulated. The point is to feel why depth, small targets and arm posture make 3D UIs harder, not to emulate a
specific headset.
