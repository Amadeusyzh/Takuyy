# Assignment r4: XR platforms and tooling: what a 3D GUI agent could observe and control, and how to build one

Output file: `docs/research/3d-gui-agent/04-platforms-and-tooling.md`

## Goal

A practical feasibility study: on each XR platform, how an agent could see the interface (rendered frames,
UI structure, scene entities) and act on it (input injection, accessibility actions, automation APIs), what
simulators and emulators exist for collecting data and running benchmarks, and what the privacy and security
rules allow. Work from official documentation, SDK references and repositories, with links and dates.

## Cover at least

1. **Apple visionOS:** SwiftUI windows, volumes and immersive spaces; RealityKit entities; accessibility
   (VoiceOver, the accessibility tree, Pointer Control, Dwell Control); XCTest / XCUITest UI automation in the
   visionOS simulator; screen capture and enterprise APIs; camera access rules; on-device models (Apple
   Foundation Models framework) and App Intents / Siri actions.
2. **Android XR:** Jetpack XR SDK (Compose for XR, SceneCore, ARCore for Jetpack XR), the Android XR emulator,
   Android accessibility services (the basis of most Android GUI agents) and how they work for spatial panels,
   Gemini on Android XR, input methods, and device status (headsets and glasses) as of November 2026.
3. **Meta Horizon OS / Quest:** Spatial SDK, 2D Android panels, Unity and Unreal integration, the Meta XR
   Simulator, accessibility features, the passthrough camera API and its rules, voice and AI features.
4. **Cross-platform layers:** OpenXR (runtimes, API layers, input simulation), WebXR (the Immersive Web
   Emulator, IWER and other emulation runtimes, automated testing of WebXR pages with Playwright or
   Puppeteer), Unity XR Interaction Toolkit and its XR Device Simulator, MRTK3, Godot XR, Unreal.
5. **Building environments for agents:** existing research environments or benchmarks built on game engines
   or WebXR that could host 3D GUI tasks; how to log interaction traces (poses, gaze, hand joints, UI events);
   how to render observations (egocentric RGB, depth, segmentation, UI entity IDs).
6. **Model side:** VLMs with strong GUI grounding that are open (UI-TARS, OS-Atlas, Qwen-VL family and newer),
   3D-capable or video-capable VLMs, latency budgets for interactive XR, on-device versus cloud inference on
   headsets and glasses.
7. **Privacy and security:** camera and screen-capture permissions on each platform, policies on automation
   and accessibility services, and the risks of an agent acting in a user's physical surroundings.

## Depth

- Key-works table (papers, docs, repos, tools): at least 60 entries.
- Deep notes: the 15 most useful tools or platforms.
- Close with a feasibility matrix: platform x {observe pixels, observe UI structure, inject input, automation
  framework, emulator for data collection, licensing or cost, risk}, and a recommendation of two or three
  concrete stacks for a first research prototype (for example a WebXR environment driven by Playwright, the
  Android XR emulator with an accessibility service, or a Unity scene with the XR Device Simulator), with pros
  and cons.
