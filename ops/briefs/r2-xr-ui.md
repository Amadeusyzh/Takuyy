# Assignment r2: 3D user interfaces and XR interaction: why spatial UIs are hard to operate

Output file: `docs/research/3d-gui-agent/02-3d-ui-and-xr-interaction.md`

## Goal

The evidence base for the column's central claim: operating 3D interfaces is complex, and that complexity
hinders the everyday adoption of VR, AR and MR devices. Collect the foundations of 3D interaction, the
empirical evidence of difficulty, and what designers and researchers already do about it.

## Cover at least

1. **Foundations of 3D interaction:** the task taxonomy of selection, manipulation, navigation (travel and
   wayfinding), system control and symbolic input (Bowman, Kruijff, LaViola, Poupyrev, *3D User Interfaces:
   Theory and Practice*, both editions); classic techniques (ray-casting, Go-Go, World-in-Miniature, HOMER,
   Voodoo Dolls, image-plane selection), and pointing models in 3D (Fitts' law extensions, effects of depth).
2. **Modern input:** hand tracking and direct touch, pinch, gaze-based selection and gaze + pinch (Pfeuffer
   et al. 2017 and the visionOS model), controllers, voice, multimodal input, eye-hand coordination, the
   Midas touch problem.
3. **Spatial UI structure:** windows, volumes and full spaces (visionOS); panels in Android XR and Meta
   Horizon OS; world-, body- and head-locked content; layout and placement; occlusion and depth conflicts;
   multitasking with many windows; adaptive and context-aware MR UIs (for example Lindlbauer et al.
   UIST 2019, and later optimization-based or LLM-based layout work).
4. **Measured difficulty:** fatigue (consumed endurance, "gorilla arm"), precision and error rates of
   selection techniques, text entry rates in VR and AR, learnability and discoverability, novice versus
   expert gaps, cybersickness, social acceptability, and the cognitive load of mixed reality. Numbers with
   sources.
5. **Adoption barriers:** peer-reviewed studies and reliable reports on why people stop using headsets or do
   not buy them (comfort, content, usability, setup, social factors), device sales and usage data with
   sources (Apple Vision Pro, Meta Quest, smart glasses such as Ray-Ban Meta, Android XR devices), and
   whether usability or interface complexity is named as a factor.
6. **Accessibility in XR:** people with visual, motor or cognitive impairments, older adults; systems such as
   SeeingVR and later work; platform accessibility features.
7. **Design guidance:** Apple visionOS Human Interface Guidelines, Android XR design guidance, Meta Horizon OS
   guidelines, Microsoft Mixed Reality guidance: what they say about complexity, comfort and input.
8. **Assistance already in XR:** tutorials, onboarding, contextual help, intelligent or adaptive UIs,
   voice assistants on headsets and glasses (what they can and cannot operate).

## Depth

- Key-works table: at least 70 works (papers, books, guidelines, reports).
- Deep notes: the 20 most relevant works.
- Close with "A catalogue of 3D UI operations": a table of concrete operations a user performs on a
  headset (for example find an app, open, place and resize a window, select a small target at a distance,
  adjust a setting buried in a menu, type a search query, move a virtual object onto a real table), each with
  the techniques used today, measured or reported difficulty with sources, and whether an agent could do it
  for the user, guide the user, or neither.
