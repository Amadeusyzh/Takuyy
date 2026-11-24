# r4 dossier: XR platforms and tooling for 3D GUI agents

**Path:** `docs/research/3d-gui-agent/04-platforms-and-tooling.md`, committed in four commits on `api/r4-platforms`. No other repository file was edited. The untracked dotfiles and `scripts/` in the working tree were already there and were not committed.

- **Key-works table:** 156 entries, covering official docs, SDK references, repos, policies, filings and papers.
- **Deep notes:** 15 tools and platforms:
  - Meta's WebXR emulator and SDK (IWER, IWSDK)
  - Meta XR Operator
  - Android XR emulator
  - Android accessibility services, AppFunctions and Gemini
  - Jetpack XR testing APIs
  - Meta XR Simulator
  - OpenXR API layers with the open-source Monado runtime
  - Unity XR Interaction Toolkit simulator
  - visionOS accessibility
  - visionOS simulator
  - visionOS enterprise APIs
  - Apple Foundation Models with App Intents
  - Meta passthrough camera API and room model
  - GenXR-Bench / XR Blocks
  - The open model stack
- **Closing sections:** a feasibility matrix over 8 platforms and three recommended prototype stacks.
- **Verification:**
  - All 81 arXiv ids were checked against the arXiv API.
  - A separate audit re-opened 80 non-arXiv links; 21 had problems, mostly title or date mismatches, and all were fixed.
  - The key platform claims were re-opened by hand.

**Datasets and benchmarks covered:**
- XR-specific: GenXR-Bench, XRBench3D, Orienter's VR GUI set, DISCOVR.
- GUI agents and grounding: OSWorld, OSWorld-Human, AndroidWorld, AndroidLab, ScreenSpot-Pro.
- Spatial and embodied: VSI-Bench, BEHAVIOR-1K.
- Motion, gaze and egocentric: BOXRR-23, Who Is Alyx?, GazeBaseVR, HOT3D, Aria Everyday Activities, Ego-Exo4D, Aria Gen 2 Pilot.
- The dossier also proposes a trace-logging schema (poses, hands, gaze, UI entity tree, actions, frames with entity-ID masks) and maps each field to existing tools.

## The five most important findings

1. **No platform lets a third-party agent read another app's 3D UI structure.**
   - Spatial structure is exposed only to in-app test APIs: Jetpack's subspace semantics tree, RealityKit's `AccessibilityComponent`, and the scene/ECS data of Meta's WebXR SDK.
   - Jetpack Compose for XR documents the shape officially: a 3D tree of containers, each with its own 2D tree, which "operate as distinct hierarchies" ([API ref](https://developer.android.com/reference/kotlin/androidx/xr/compose/subspace/semantics/package-summary)).
   - Horizon OS's own gaze input uses apps' accessibility information ([features overview](https://developers.meta.com/vr/documentation/android-apps/features-overview)). Yet Meta's prohibited-permissions list includes `BIND_ACCESSIBILITY_SERVICE` ([Meta](https://developers.meta.com/horizon/resources/permissions-prohibited/)).
   - Apple's docs say "UI testing isn't available to apps you build using the visionOS SDK" ([XCUIAutomation](https://developer.apple.com/documentation/xcuiautomation)).
2. **Vendor tools for agents arrived in 2026, but only for developers' own apps.**
   - Meta XR Operator (OpenXR layer plus MCP server, experimental in SDK v205, 2026-08-18) gives an agent screenshots, the scene hierarchy, controller input and head pose. Meta itself says it is "too slow for real-time interaction" ([Meta blog](https://developers.meta.com/horizon/blog/meta-xr-operator-close-the-build-test-verify-loop-for-vr/)).
   - Meta's WebXR SDK has a headless `agent` mode with a managed Playwright browser and 32 MCP tools ([AI-Native Development](https://developers.meta.com/horizon/documentation/iwsdk/ai/)).
3. **OS assistants are getting there first, through semantic APIs rather than pixels.**
   - Siri AI on visionOS 27 has onscreen awareness and app actions ([Apple](https://support.apple.com/en-us/149067)).
   - Gemini UI automation on phones comes with live view, takeover and alerts before sensitive actions ([Android blog, 2026-02-25](https://android-developers.googleblog.com/2026/02/the-intelligent-os-making-ai-agents.html)).
   - Meta VR Glasses ($1,299.99, spring 2027) have a Meta AI agent built into the OS that opens apps and adjusts the workspace ([Meta](https://www.meta.com/blog/meta-vr-glasses-announcement-meta-connect/)).
4. **No end-to-end 3D GUI agent benchmark exists, and it is the clearest gap to fill.**
   - GenXR-Bench ([arXiv 2610.29014](https://arxiv.org/abs/2610.29014)) benchmarks coding agents, but its WebXR simulated-user API is reusable as an action space: viewer moves, hand poses, ray clicks, set-of-marks views, state-based checkers.
   - The only VR GUI grounding dataset found is Orienter's 1,552 screenshots ([arXiv 2409.10811](https://arxiv.org/abs/2409.10811)).
5. **Latency is the main constraint for the model.**
   - VR users' quality of experience drops above about 4 s of agent delay ([Maslych et al., CUI 2025](https://arxiv.org/abs/2507.22352)).
   - Desktop computer-use agents take 2.7–4.3× more steps than necessary, and later steps take up to 3× longer ([OSWorld-Human](https://arxiv.org/abs/2506.16042)).
   - The design should therefore be hierarchical: a slow planner sets goals and a fast local controller does the pointing. While the agent waits, a "thinking" gesture works better than a spinner ([arXiv 2610.23336](https://arxiv.org/abs/2610.23336)).

## Recommended prototype stacks
- **A. WebXR (Meta's IWER/IWSDK) driven by Playwright.** The primary choice: open, headless, deterministic, with exact ground truth.
- **B. Android XR emulator plus an accessibility service.** The realistic-OS option, and a clean study of porting 2D AndroidWorld tasks into 3D.
- **C. Unity XR Interaction Toolkit simulator and/or Meta XR Simulator with Operator.** For grab and manipulation tasks.
- **visionOS is not recommended as a first stack**, because it has no UI automation and capture needs enterprise licensing.

## Could not verify (listed in Section 10)
- **Android XR accessibility and test tools:**
  - How accessibility services see spatial panels, and whether `adb input`, `uiautomator` and `screencap` work on XR emulator images or Galaxy XR.
  - The Android XR accessibility help page and Google Play's accessibility-policy text, both behind a captcha.
- **Quest:** whether a sideloaded accessibility service runs in developer mode, and whether adb tap, screencap or scrcpy work.
- **visionOS:**
  - Conflicting signals on XCUITest for visionOS 27.
  - Whether `simctl io` and ScreenCaptureKit work.
  - Foundation Models context sizes.
- **GenXR-Bench numbers beyond the abstract** come from a truncated page.
- **Hardware figures:**
  - The ~20 ms motion-to-photon figure has no primary source.
  - Qualcomm's chip TOPS figures are from secondary sources.
  - The AI-glasses launch facts come from press reports, not a Samsung or Google page.
- **Models:** licenses for several GUI models, and whether UI-TARS-2 and MAI-UI weights are released.
