# Part C: Spatial UI structure, adaptive and optimized layout, platform design guidance

Compiled 2026-11-24 for the column "3D GUI agents". Every entry below was checked against a primary
source (official documentation page, DOI resolved through Crossref/OpenAlex, or an arXiv abs record).
Apple HIG pages render with JavaScript, so their text was read through Apple's own JSON data endpoints
(`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`). The human-readable
URLs are the ones cited. All numbers come from text that was actually read. Where a number was reported
second-hand, the note says so.

## 1. Works

| ID | Title | First author et al. | Venue / status | Year | Link | Contribution (one line) | Relevance to 3D GUI agents (one line) |
|---|---|---|---|---|---|---|---|
| C01 | Apple visionOS Human Interface Guidelines and visionOS developer docs (Designing for visionOS, Spatial layout, Windows, Immersive experiences, Eyes, Ornaments, Accessibility; SwiftUI `ImmersiveSpace`; RealityKit `AccessibilityComponent`; WWDC23 "Create accessible spatial experiences"; widgets support article) | Apple | Official guidelines and docs (living pages) | 2023–2026 | https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos ; https://developer.apple.com/design/human-interface-guidelines/spatial-layout ; https://developer.apple.com/design/human-interface-guidelines/windows ; https://developer.apple.com/design/human-interface-guidelines/immersive-experiences ; https://developer.apple.com/design/human-interface-guidelines/eyes ; https://developer.apple.com/design/human-interface-guidelines/ornaments ; https://developer.apple.com/design/human-interface-guidelines/accessibility ; https://developer.apple.com/documentation/swiftui/immersivespace ; https://developer.apple.com/documentation/realitykit/accessibilitycomponent ; https://developer.apple.com/videos/play/wwdc2023/10034/ ; https://support.apple.com/en-us/124816 | Defines the window / volume / immersive-space structure, Shared vs Full Space, and the comfort, spacing and size rules. | The best-documented spatial UI model, and it has an accessibility tree that reaches 3D entities (VoiceOver + `AccessibilityComponent`). |
| C02 | Android XR design guidelines (Overview, Foundations, Spatial UI, Visual design, Get started) | Google (Android Developers) | Official guidelines (SDK in Developer Preview) | 2024–2026 | https://developer.android.com/design/ui/xr ; https://developer.android.com/design/ui/xr/guides/foundations ; https://developer.android.com/design/ui/xr/guides/spatial-ui ; https://developer.android.com/design/ui/xr/guides/visual-design ; https://developer.android.com/design/ui/xr/guides/get-started | Home Space vs Full Space, spatial panels, orbiters and spatial elevation, with the most numerically explicit distance and size rules of any platform. | The panels are Android views, so TalkBack and the Android accessibility tree apply. Gemini voice control is already a built-in "agent" path. |
| C03 | Meta Horizon OS design guidelines (Panels, Multi-window layouts, Windows implementation, Hands UI best practices, Comfort, MR design guideline, Accessibility checklist) | Meta | Official guidelines (pages dated 2025-10 to 2026-09) | 2025–2026 | https://developers.meta.com/horizon/design/panels/ ; https://developers.meta.com/horizon/design/multi-window-layouts ; https://developers.meta.com/horizon/design/windows_implementation/ ; https://developers.meta.com/horizon/design/hands-ui-best-practices/ ; https://developers.meta.com/horizon/design/comfort/ ; https://developers.meta.com/horizon/design/mr-design-guideline/ ; https://developers.meta.com/horizon/design/accessibility-checklist/ | Panels and system windows, a one-primary-plus-two-supporting multi-window target, and touch vs ray distance bands. | Gives explicit layout targets an agent could optimize against. The screen reader is still listed under "Experimental". |
| C04 | Microsoft Mixed Reality design docs (Comfort, Billboarding and tag-along, Hand menu, Instinctual interactions, Interactable object) | Microsoft | Official guidelines (HoloLens / Windows MR) | 2018–2026 (pages updated 2026-10-26) | https://learn.microsoft.com/en-us/windows/mixed-reality/design/comfort ; https://learn.microsoft.com/en-us/windows/mixed-reality/design/billboarding-and-tag-along ; https://learn.microsoft.com/en-us/windows/mixed-reality/design/hand-menu ; https://learn.microsoft.com/en-us/windows/mixed-reality/design/interaction-fundamentals ; https://learn.microsoft.com/en-us/windows/mixed-reality/design/interactable-object | Vergence-accommodation zone (1.25–5 m), gaze and neck angle limits, body-locked HUDs, hand-menu ergonomics, and angular target sizes. | The most quantitative comfort envelope available. It is a ready-made constraint set for an agent's placement policy. |
| C05 | Windows on the world: 2D windows for 3D augmented reality | Steven Feiner et al. | ACM UIST 1993 | 1993 | https://doi.org/10.1145/168642.168657 | X-server windows that are head-fixed, surround-fixed (body), or fixed to world objects. | The original taxonomy of reference frames an agent must reason about when it "places" a window. |
| C06 | An evaluation of wearable information spaces | Mark Billinghurst et al. | IEEE VRAIS 1998 | 1998 | https://doi.org/10.1109/VRAIS.1998.658418 | Body-stabilised displays beat head-stabilised ones for search, ease and intuitiveness. Spatial audio and visual cues help further. | Early evidence that the frame of reference changes findability, which matters for where an agent puts things. |
| C07 | The personal cockpit: a spatial interface for effective task switching on head-worn displays | Barrett M. Ens et al. | ACM CHI 2014 | 2014 | https://doi.org/10.1145/2556288.2557058 | A body-centric layout of virtual windows around the user. 40% faster application switching than view-fixed baselines. | A tuned multi-window layout an agent could reproduce or use as a default target. |
| C08 | Ethereal planes: a design framework for 2D information space in 3D mixed reality environments | Barrett M. Ens et al. | ACM SUI 2014 | 2014 | https://doi.org/10.1145/2659766.2659769 | Seven design dimensions (from a literature review) for 2D information spaces in 3D. | A vocabulary for describing a window's spatial state, usable as an agent's action and state schema. |
| C09 | Walking with adaptive augmented reality workspaces: design and usage patterns | Wallace S. Lages and Doug A. Bowman | ACM IUI 2019 | 2019 | https://doi.org/10.1145/3301275.3302278 | Contextual studies of adaptation strategies for AR windows while walking. | Shows that window management while mobile is a recurring burden that automation could take over. |
| C10 | Adjustable adaptation for spatial augmented reality workspaces | Wallace S. Lages and Doug A. Bowman | ACM SUI 2019 | 2019 | https://doi.org/10.1145/3357251.3358755 | A unified system for quickly switching and fine-tuning spatial adaptation. A small set of behaviours suffices. | Suggests a small discrete action set (adaptation modes) for an agent. |
| C11 | User Preferences for UI Anchoring in MR: Effects of Task Mobility and Interface Properties | João Belo et al. | Accepted to IEEE ISMAR 2026 (arXiv preprint) | 2026 | https://arxiv.org/abs/2608.28064 | Users shift from world-anchored to body-anchored UIs during locomotion. No single body anchor dominates. | Anchoring is personal, so an agent needs per-user preference models and should not apply one fixed rule. |
| C12 | Do we still need physical monitors? An evaluation of the usability of AR virtual monitors for productivity work | Leonardo Pavanatto et al. | IEEE VR 2021 | 2021 | https://doi.org/10.1109/VR50410.2021.00103 | Physical vs virtual (AR) vs hybrid monitors. Virtual monitors are feasible but inferior. Hybrid is the best trade-off. | A baseline for multi-window productivity in AR headsets. |
| C13 | Virtual monitors vs. physical monitors: an empirical comparison for productivity work | Leonardo Pavanatto et al. | Frontiers in Virtual Reality | 2023 | https://doi.org/10.3389/frvir.2023.1215820 | N=27 comparison of workstation, virtual monitors and laptop. Virtual was 9.10% slower (n.s.) and less comfortable. | Quantifies the comfort and focus costs that an assisting agent could reduce. |
| C14 | Quantifying the Effects of Working in VR for One Week | Verena Biener et al. | IEEE TVCG 2022 | 2022 | https://doi.org/10.1109/TVCG.2022.3203103 (arXiv: https://arxiv.org/abs/2206.03189) | 16 participants worked 5 days × 8 h in VR vs a physical desktop. Worse ratings on most measures and 2 day-one dropouts. | Long-session costs. An agent that reduces interaction counts may matter more over days than in one-hour lab studies. |
| C15 | Augmented Reality Productivity In-the-Wild: A Diary Study of Usage Patterns and Experiences of Working With AR Laptops in Real-World Settings | Yi Fei Cheng et al. | IEEE TVCG 31(10) 2025 (presented at ISMAR 2025) | 2025 | https://doi.org/10.1109/TVCG.2025.3592962 (arXiv: https://arxiv.org/abs/2502.14241) | 14 participants, 40-min daily sessions over two weeks, 103 h of AR work on Spacetop EA. Workspace configuration patterns. | Real-world evidence of how people configure virtual displays: demonstrations an agent could learn from. |
| C16 | Long-Term Experiences From Working with Extended Reality in the Wild | Verena Biener et al. | arXiv preprint | 2025 | https://arxiv.org/abs/2509.05067 | Interviews with 10 Apple Vision Pro users. Limitations include workflow integration and limited ability to adapt and customize. | "Limited customization" is a gap an agent could fill on today's visionOS. |
| C17 | A Taxonomy of 3D Occlusion Management for Visualization | Niklas Elmqvist and Philippas Tsigas | IEEE TVCG 2008 | 2008 | https://doi.org/10.1109/TVCG.2008.59 | Classifies 50 occlusion-management techniques and derives 5 orthogonal design patterns. | A menu of strategies an agent can use to reveal a hidden window or target (e.g., move it, make it transparent, explode the layout). |
| C18 | View management for virtual and augmented reality | Blaine Bell et al. | ACM UIST 2001 | 2001 | https://doi.org/10.1145/502348.502363 | Real-time view-plane constraint solving (position, size, transparency) to avoid occlusion, with temporal coherence. | The first "layout manager for 3D". Its free-space representation is close to what an agent needs for placement. |
| C19 | Evaluating label placement for augmented reality view management | Ronald T. Azuma and Chris Furmanski | IEEE/ACM ISMAR 2003 | 2003 | https://doi.org/10.1109/ISMAR.2003.1240689 | Compared four label-placement algorithms. Users read fastest with algorithms that removed overlap quickest. | Speed of de-cluttering matters more than optimality, which bears on agent latency budgets. |
| C20 | Vergence–accommodation conflicts hinder visual performance and cause visual fatigue | David M. Hoffman et al. | Journal of Vision 8(3) | 2008 | https://doi.org/10.1167/8.3.33 | With correct focus cues: faster stereo identification, better stereoacuity, less distortion and less fatigue. | A physiological reason an agent should keep content near the display's focal distance and avoid depth jumps. |
| C21 | The Effects of Text Drawing Styles, Background Textures, and Natural Lighting on Text Legibility in Outdoor Augmented Reality | Joseph L. Gabbard et al. | Presence 15(1) | 2006 | https://doi.org/10.1162/pres.2006.15.1.16 | Significant effects of background texture, illuminance and text drawing style on text identification in optical see-through AR. | Legibility depends on what is behind the panel, so an agent placing windows must model the background. |
| C22 | Context-Aware Online Adaptation of Mixed Reality Interfaces | David Lindlbauer et al. | ACM UIST 2019 | 2019 | https://doi.org/10.1145/3332165.3347945 | Real-time rule-based + combinatorial optimization deciding which apps show, how much detail, and where, based on cognitive load. Secondary-task interactions −36%. | The canonical "system decides when, where and how much" formulation, i.e. what a 3D GUI agent would do. |
| C23 | SemanticAdapt: Optimization-based Adaptation of Mixed Reality Layouts Leveraging Virtual-Physical Semantic Connections | Yi Fei Cheng et al. | ACM UIST 2021 | 2021 | https://doi.org/10.1145/3472749.3474750 | A linear program placing UI elements by semantic association with physical objects, utility, layout and spatio-temporal consistency. Manual adaptations −33%. | Semantic links (e.g., a recipe next to the stove) are exactly what a VLM agent can infer. |
| C24 | AUIT – the Adaptive User Interfaces Toolkit for Designing XR Applications | João Marcelo Evangelista Belo et al. | ACM UIST 2022 | 2022 | https://doi.org/10.1145/3526113.3545651 | Toolkit of composable adaptation objectives (reachability, visibility, consistency) with a real-time multi-objective solver. | A ready objective library that could serve as an agent's "tools" or a verifier for agent-proposed layouts. |
| C25 | InteractionAdapt: Interaction-driven Workspace Adaptation for Situated Virtual Reality Environments | Yi Fei Cheng et al. | ACM UIST 2023 | 2023 | https://doi.org/10.1145/3586183.3606717 | Optimization assigns each UI element to the most suitable input technique (surface touch, mid-air, cursor) given physical affordances. | An agent's placement choice also changes how the user can interact, so it is an input-aware layout. |
| C26 | User-Driven Constraints for Layout Optimisation in Augmented Reality | Aziz Niyazov et al. | ACM CHI 2023 | 2023 | https://doi.org/10.1145/3544548.3580873 | Users define layout constraints in situ through elicited gestures. Design space of constraints × regions × parameters. | A model for how users could instruct or correct an agent ("keep this within reach"). |
| C27 | Adaptive 3D UI Placement in Mixed Reality Using Deep Reinforcement Learning | Feiyu Lu et al. | ACM CHI EA 2024 | 2024 | https://doi.org/10.1145/3613905.3651059 (arXiv: https://arxiv.org/abs/2504.21731) | An RL policy for continuous, pose- and environment-aware content placement (preliminary). | A learned-policy alternative to optimization. It hints at training placement agents in simulation. |
| C28 | LLMR: Real-time Prompting of Interactive Worlds using Large Language Models | Fernanda De La Torre et al. | ACM CHI 2024 | 2024 | https://doi.org/10.1145/3613904.3642579 | An LLM framework (scene understanding, planning, self-debugging, memory) that creates and edits Unity MR scenes. 4× lower average error than standard GPT-4. Usability study N=11. | An LLM acting on a 3D scene graph through code. It is the "API agent" counterpart of a GUI agent. |
| C29 | SituationAdapt: Contextual UI Optimization in Mixed Reality with Situation Awareness via LLM Reasoning | Zhipeng Li et al. | ACM UIST 2024 | 2024 | https://doi.org/10.1145/3654777.3676470 (arXiv: https://arxiv.org/abs/2409.12836) | Perception (objects, people) + VLM (GPT-4V) reasoning about overlay and interaction suitability + optimizer. Ranked first by all 12 study participants. | The closest existing system to a VLM agent that decides where spatial UI may go. |
| C30 | DuoZone: A User-Centric, LLM-Guided Mixed-Initiative XR Window Management System | Jing Qian et al. | arXiv preprint (venue fields in the PDF are unfilled template text) | 2025 | https://arxiv.org/abs/2511.15676 | LLM (GPT-4.1) recommends apps and layouts. Users refine in an arrangement zone. On Vision Pro, N=16: 34.5% faster layout matching, lower NASA-TLX. | Direct evidence that an LLM can take over window arrangement on a commercial headset. |
| C31 | Revisiting put-that-there, context aware window interactions via LLMs | Riccardo Bovo et al. | arXiv preprint | 2025 | https://arxiv.org/abs/2511.02378 | GPT-4 fuses a segmented 3D scene, app metadata, speech, pointing and head gaze, and emits JSON `place`/`remove` actions on surfaces. | A concrete action schema for a 3D window agent. No user evaluation yet. |
| C32 | Say It or Grab It? Conversational Control of UI Adaptations in Mixed Reality | Sina Elahimanesh et al. | arXiv preprint | 2026 | https://arxiv.org/abs/2610.24640 | ConverseMR maps spoken requests to adaptation objectives and constraints. Elicitation N=19, study N=24: speech and direct manipulation are complementary. | Users refine spoken commands after seeing the result, so an agent must support iterative, user-led correction. |
| C33 | AdjustAR: AI-Driven In-Situ Adjustment of Site-Specific Augmented Reality Content | Nels Numan et al. | ACM UIST 2025 Adjunct (poster) | 2025 | https://doi.org/10.1145/3746058.3758362 (arXiv: https://arxiv.org/abs/2508.06826) | An MLLM compares the authored view with the live view, proposes 2D placement corrections and backprojects them to 3D. | A "screenshot to 2D fix to 3D action" loop, the same perception trick a GUI agent would use in XR. |

## 2. Deep notes

### C01: visionOS HIG and app structure

**Problem.** Apple's guidelines and docs define how spatial UI is structured and kept comfortable on Vision Pro.

**Structure.** Apps launch by default in the Shared Space, "where multiple apps can run side-by-side and people can open, close, and relocate windows". A Full Space makes the app "the only app running". There are two scene types:
- Windows: 2D or 3D content on a glass plane, with a close button, window bar and resize controls.
- Volumes: 3D content viewable from any angle.

An `ImmersiveSpace` is an unbounded scene. "The system allows only one immersive space to be open at a time", and opening one "hides all other visible apps".

**Numbers.**
- The default window is 1280×720 pt. The system places it about 2 m in front of the wearer, for an apparent width of about 3 m.
- Points are angular: "visionOS defines a point as an angle".
- Button centres should be at least 60 pt apart, or have a 16 pt margin around each item.
- Default control size is 60×60 pt; the minimum is 28×28 pt. Text is 17 pt by default, 12 pt minimum.
- Reading content should be at least 1 m away.
- Progressive and full immersion define a boundary of about 1.5 m. The Digital Crown adjusts immersion between 120° and 360°.

**Comfort rules.** "Display content within a person's field of view… Avoid placing content in places where people have to turn their head." Also "Avoid displaying too many windows". Avoid head-anchored content, because it blocks Pointer Control and Zoom.

**Accessibility.** VoiceOver exists on visionOS, and RealityKit entities expose label, value, traits and actions through `AccessibilityComponent` (WWDC23 10034).

**Limitations.** The guidance is qualitative about cognitive complexity. "The system doesn't provide information about a person's field of view."

**Transfers to agents.** There is a semantic accessibility tree for windows and opted-in 3D entities. The constraint set is explicit.

**Does not transfer.** Third-party code cannot move other apps' windows. Window placement in the Shared Space belongs to the system and the user (the system places only the first window). So an agent either runs at OS level or only guides.

### C22: Lindlbauer, Feit and Hilliges, UIST 2019

**Problem.** Users manually adjust which MR applications are visible, how much information they show, and where they sit. They must redo this at every context switch, and context switches happen "many times a day".

**Method.** A real-time mix of rule-based decision making and combinatorial optimization. Inputs are the user's current cognitive load plus knowledge of the task and environment. It jointly decides visibility, level of detail and placement for each app.

**Data and results.** Proof-of-concept applications in several scenarios. In a dual-task evaluation the approach "decreased secondary tasks interactions by 36%" (abstract, via DOI record). The participant count and the cognitive-load measure were not read (see Unverified).

**Limitations.** Utility and rules are hand-specified by designers. Cognitive-load estimation is assumed available. Applications must expose discrete levels of detail.

**Transfers to agents.** This is the cleanest formal statement of the decision a 3D GUI agent makes: when, where and how much. It could serve as a planner or verifier under an LLM front end. The 36% drop in interactions is a measurable target for agent studies.

**Does not transfer.** The system has full access to an app model (elements, levels of detail, utilities). A pixel-level GUI agent operating third-party apps on a commercial headset has none of that. It must infer app semantics from rendering or the accessibility tree. The method also does not operate apps' internal controls; it only arranges them.

### C23: SemanticAdapt (Yi Fei Cheng et al., UIST 2021)

**Problem.** MR layouts (the position and scale of virtual elements) must be manually re-adapted whenever users change environment or task. This is "tedious and time consuming".

**Method.** Layout as a combinatorial optimization solved as a single linear program in real time. Its terms are:
- semantic association between virtual elements and physical objects (e.g., an app placed near a related object);
- utility for the current task;
- layout factors;
- spatio-temporal consistency with previous layouts.

**Results.** Against a naive adaptive baseline without semantic associations, it "decreased the number of manual interface adaptations by 33%" (abstract via DOI record). The paper also presents several application scenarios.

**Limitations.** Semantic associations are pre-specified or scored offline, not inferred open-vocabulary. Physical scenes must be segmented into known objects. Evaluation used controlled environments.

**Transfers to agents.** The key ingredient, virtual-to-physical semantic affinity, is precisely what VLMs now supply cheaply. SituationAdapt (C29) and put-that-there (C31) essentially replace SemanticAdapt's hand-coded associations with LLM/VLM reasoning. The temporal-consistency term is a lesson for agents: rearranging too often is itself a usability cost.

**Does not transfer.** It optimizes the layout once per context change. It does not handle user intent expressed in language, and it does not operate the content of the windows.

### C29: SituationAdapt (Zhipeng Li et al., UIST 2024)

**Problem.** Adaptive MR layouts assume static, private environments. In shared, mobile settings, UI can block relevant real-world cues (a display, a person) or break social norms.

**Method.** Three modules:
1. Perception: object and person detection with YOLOv3 categories.
2. Reasoning: "GPT4 Vision 2024-02-15-Preview" on Azure, few-shot prompted, rating each area of interest for overlay and interaction suitability.
3. Optimization: produces layouts that respect these ratings plus temporal constraints.

**Data and results** (arXiv HTML v1).
- Validation: 42 participants and 42 VLM instances rated 64 areas in 18 scenarios. VLM ratings were not more extreme than humans' (overlay p<0.04; interaction p=0.0, bootstrap). VLM SDs were smaller (1.18 vs 1.72 for overlay).
- Reasoning modes matched humans in 50% of overlay ratings (chance 20%) but only 25% for interaction.
- User study, N=12: SituationAdapt beat SurfaceAdapt and UserCentric on overlay suitability (F(2,66)=67.35, p<.0001) and interaction suitability (F=68.93). It received mean preference rank 1.0 (SD 0).

**Limitations.** One simulated lecture scenario. YOLOv3 classes do not include walls. The VLM cannot infer social relationships, and its rationales often diverged from users'. No latency was reported.

**Transfers to agents.** A VLM can judge where UI may go in a real scene about as well as people on a rating scale.

**Does not transfer.** It adapts layouts. It does not operate apps or follow open-ended user goals. The VLM latency is unknown, which matters for real-time XR.

### C30: DuoZone (Jing Qian et al., arXiv 2025)

**Problem.** "Current window management systems require users to manually place, resize, and organize multiple applications across large 3D spaces."

**Method.** Two zones in a mixed-initiative design:
- Recommendation Zone: layout templates, plus app recommendations from goals given by voice or text. ChatGPT 4.1 handles relevance and layout assignment; Meta's Wit does speech-to-text.
- Arrangement Zone: direct-manipulation refinement (drag, resize, snap).

**Platform.** Apple Vision Pro (1st gen), with a Unity PolySpatial client and a separate GPU host.

**Data and results** (arXiv HTML v1). N=16 professionals, within-subject, compared with native visionOS manual window adjustment.
- Task 1 (layout matching): 34.5% faster (t(15)=6.22, p<0.001).
- Task 2 (workspace construction): 168.3 ± 16.1 s vs 218.1 ± 18.0 s (p=0.0056).
- Overall NASA-TLX was lower: 33.30 vs 47.71 in Task 1, 22.38 vs 34.16 in Task 2.
- Users accepted 90.3% of app recommendations, 82.8% of layout suggestions and 76.5% of automatic orderings.
- Satisfaction did not differ (3.69 vs 3.81, p=.927).

**Limitations.** Remote-LLM dependence. Occlusion-free areas were evaluated only qualitatively. No long-term use with real apps. The venue metadata is unfilled template text. The manual-scaling percentages are internally inconsistent (39.6% vs 37.3%).

**Transfers to agents.** This is the strongest quantitative evidence that LLM-proposed window layouts are accepted and save time on a shipping headset. The ~17% rejection of layout suggestions shows that a direct-manipulation fallback is required.

**Does not transfer.** It runs inside a Unity app with its own windows, not on visionOS system windows. The agent only arranges windows; it does not operate their content.

## 3. Platform comparison

| Concept | visionOS | Android XR | Meta Horizon OS | Windows Mixed Reality / HoloLens |
|---|---|---|---|---|
| UI containers | Windows (glass plane with window bar, close, resize); volumes (3D, viewable from any angle); `ImmersiveSpace` (unbounded, one at a time); ornaments float slightly in front of a window and move with it. visionOS 26 widgets must attach to a surface (C01) | Spatial panels as building blocks; orbiters (floating controls anchored to a panel, default 15 dp z-elevation, 20 dp offset); spatial elevation levels for popups and dialogs; 3D models; environments (C02) | Panels (2D surfaces); system windows with system-provided control bar, edge handles and resize handles for panel apps (C03) | Holograms. UI patterns in the docs read: hand menu (hand-attached), tag-along and billboarded panels, body-locked HUD (C04) |
| Shared vs exclusive mode | Shared Space (apps side by side) vs Full Space (one app, others hidden); Full Space immersion styles mixed / progressive / full (C01) | Home Space (multitasking; default app 1024×720 dp, min 385×595, max 2560×1800 dp; no spatial panels or 3D models) vs Full Space (one app; spatial UI available only here) (C02) | Not formalized as two named spaces in the pages read. Multi-window guidance assumes several windows coexist (C03) | Not covered in the design pages read (C04) |
| Default spawn distance and size | First window placed about 2 m away, 1280×720 pt, apparent width about 3 m (C01) | Apps launch 1.75 m away (not overridable in Home Space). Panel centre 5° below eye level. At 1.75 m, 1024 dp is perceived as 1556.24 mm; 0.868 dp-to-dmm (C02) | Touch UI 42–46 cm. Indirect (ray/gaze) comfortable at about 0.8–3 m. Avoid 0.5–0.8 m. MR guideline: 2D window about 45 cm for direct hands, about 1 m for indirect, about 70 cm for hands + controllers (C03) | Optimal hologram zone 1.25–5 m. Display focal distance about 2.0 m. Fade at 40 cm, clip at 30 cm. Near-depth "budget" example: at most 25% of time (C04) |
| Allowed depth range / scaling | Dynamic scale keeps apparent size constant with distance. Fixed scale for real-object replicas (C01) | Panel movement limits 0.75–5 m. Size constant between 0.75 and 1.75 m, then scales at 0.5 m per m (C02) | Movable panels keep angular size rather than physical size when moved in z (C03) | Keep content mostly at 1 m or more on immersive devices (C04) |
| Target size and spacing | Default control 60×60 pt (min 28×28). Centres at least 60 pt apart or 16 pt margin (C01) | Target 56×56 dp or larger (icon 48 dp). At least 8 dp between targets. No overlapping pointer targets (C02) | Hit target at least 48 dp. Angular collider about 2.5°–3°. At least 12 mm between interactables. 7 mm button travel (C03) | Direct touch: at least 2° (1.6×1.6 cm at 45 cm). Ray or gaze: at least 1° (3.5×3.5 cm at 2 m) (C04) |
| Text | Default 17 pt, minimum 12 pt. Avoid adding depth to text (C01) | At least 14 dp, normal weight or heavier (C02) | Not numerically specified in the pages read (C03) | "Making font sizes as large as possible". Test legibility per device (C04) |
| Field of view / head and neck | Keep content within the field of view. Avoid needing head turns. Prefer horizontal layouts. "The system doesn't provide information about a person's field of view" (C01) | Primary content in the central 41° of the FOV. Headsets about 110°+ FOV, wired glasses about 50°–70° (C02) | Constant head and neck movement increases discomfort. Device FOV is smaller than natural FOV (C03) | Avoid gaze more than 10° above or 60° below the horizon and neck rotation over 45°. Resting gaze 10°–20° below the horizon. Content 0°–35° below the horizon (C04) |
| Head-locked content | Avoid. It makes people feel "stuck" and breaks Pointer Control and Zoom. Recentre with the Digital Crown (C01) | Not covered in the pages read. Users can anchor panels to the floor, chairs, walls, ceilings or tables (passthrough only) (C02) | Avoid head-locking HUD content. Anchor to space or follow loosely with smoothing. Do not place virtual objects behind walls (C03) | Body-lock HUDs instead of head-locking. Tag-along keeps content "a glance away" (C04) |
| Number of windows / complexity | "Avoid displaying too many windows". Constrain the number of ornaments (C01) | No API limit on panels. Use orbiters sparingly. Avoid overlapping panels. "Reduce cognitive load" (C02) | One primary window and at most 2 important supporting windows ("a design target, not a capacity limit") (C03) | Hand menu: one column of three buttons works well. Attentional cone about 10°. World-lock large menus (C04) |
| Input | Eyes + indirect pinch (default). Direct touch for nearby content. Pointer Control can drive focus from head, wrist or index finger. Dwell Control (C01) | Hand and eye tracking, voice (Gemini), keyboard, mouse, trackpad, 6DoF controllers. Pinch to select, held pinch to move or resize. Raw eye data not shared with apps (C02) | Hands (direct touch, ray), eyes, controllers. Ray or gaze beyond reach (C03) | Three models: hands and motion controllers, hands-free (gaze/dwell, voice), head-gaze and commit. Use one model per app (C04) |
| Accessibility / UI tree exposed to developers | Yes. SwiftUI accessibility plus RealityKit `AccessibilityComponent` (label, value, traits, actions, rotors) for 3D entities. VoiceOver uses spatial audio. Entities without the component are invisible to VoiceOver (C01) | Panels are Android UI, so TalkBack, dwell control and magnification are adapted to XR. Material targets apply (C02) | Checklist asks for `contentDescription` on interactive elements and alt text. Screen reader is under "Settings > Experimental" (C03) | Not covered in the MR design pages read. Voice commands recommended for every interactable object (C04) |

## 4. Facts and numbers

- visionOS default window: 1280×720 pt, placed about 2 m away, apparent width about 3 m [C01, https://developer.apple.com/design/human-interface-guidelines/windows].
- visionOS defines a point as an angle. Interactive items need centres at least 60 pt apart or a 16 pt margin [C01, https://developer.apple.com/design/human-interface-guidelines/spatial-layout; https://developer.apple.com/design/human-interface-guidelines/eyes].
- visionOS default control size is 60×60 pt; the minimum is 28×28 pt. Default text 17 pt, minimum 12 pt [C01, https://developer.apple.com/design/human-interface-guidelines/accessibility]. Note: 60 pt is the default, not the minimum.
- visionOS reading content should be at least 1 m away [C01, https://developer.apple.com/design/human-interface-guidelines/eyes].
- visionOS progressive and full immersion: boundary about 1.5 m from the initial head position. The Digital Crown adjusts immersion over a default 120°–360° [C01, https://developer.apple.com/design/human-interface-guidelines/immersive-experiences].
- Only one `ImmersiveSpace` can be open at a time. Opening one hides all other visible apps [C01, https://developer.apple.com/documentation/swiftui/immersivespace].
- visionOS: "The system doesn't provide information about a person's field of view." [C01, spatial-layout].
- visionOS 26 widgets snap to walls, doors and desks (not ceilings), cannot float freely, and reappear per room [C01, https://support.apple.com/en-us/124816].
- Android XR Home Space: default 1024×720 dp, minimum 385×595 dp, maximum 2560×1800 dp, launch at 1.75 m [C02, https://developer.android.com/design/ui/xr/guides/foundations].
- Android XR panels: movement limits 0.75–5 m. Constant size between 0.75 and 1.75 m. Spawn at 1.75 m with the centre 5° below eye level. Content in the central 41° of the FOV [C02, https://developer.android.com/design/ui/xr/guides/spatial-ui].
- Android XR: 0.868 dp-to-dmm. At 1.75 m, 1024 dp ≈ 1556.24 mm and 720 dp ≈ 1093.66 mm. Targets 56 dp or larger; spacing at least 8 dp; text at least 14 dp [C02, https://developer.android.com/design/ui/xr/guides/visual-design].
- Android XR does not share raw eye-tracking data with apps. Hover highlights for eye tracking are drawn by the system and are inaccessible to the app [C02, foundations; visual-design].
- Android XR headset FOV is about 110°+; wired XR glasses about 50°–70° [C02, https://developer.android.com/design/ui/xr/guides/get-started].
- Meta: default panel 1024×640 dp, minimum 384×500 dp [C03, https://developers.meta.com/horizon/design/panels/].
- Meta: one primary window plus at most two supporting windows that are important at the same time [C03, https://developers.meta.com/horizon/design/multi-window-layouts].
- Meta: touch UI at 42–46 cm. Indirect interaction comfortable at about 0.8–3 m. Avoid 0.5–0.8 m. Hit target at least 48 dp; angular collider about 2.5°–3°; at least 12 mm spacing [C03, https://developers.meta.com/horizon/design/hands-ui-best-practices/].
- Microsoft: optimal hologram placement 1.25–5 m. HoloLens focal distance about 2.0 m. Fade at 40 cm, clip at 30 cm. Near-content depth budget example: at most 25% of time [C04, https://learn.microsoft.com/en-us/windows/mixed-reality/design/comfort].
- Microsoft: avoid gaze more than 10° above or 60° below the horizon and neck rotation over 45°. Resting gaze 10°–20° below the horizon [C04, comfort].
- Microsoft: target at least 2° for direct touch (1.6 cm at 45 cm) and at least 1° for ray or gaze (3.5 cm at 2 m) [C04, https://learn.microsoft.com/en-us/windows/mixed-reality/design/interactable-object].
- Microsoft hand menu: attentional cone about 10°. One column of three buttons works well. Place the menu 13 cm above the palm [C04, https://learn.microsoft.com/en-us/windows/mixed-reality/design/hand-menu].
- Personal Cockpit: 40% improvement in application switching time over view-fixed baselines [C07, https://doi.org/10.1145/2556288.2557058].
- Virtual vs physical monitors (N=27, ages 20–46): mean task time was 614.37 s on the workstation, 674.52 s with virtual monitors and 703.19 s on the laptop. Virtual was 9.10% slower than the workstation (n.s.). Accuracy was about 82% in all conditions (p=.771). Virtual monitors scored 37% lower than the laptop on "could continue comfortably for 1 h" (p=.003) and 24% lower than the workstation on focus (p=.004) [C13, https://doi.org/10.3389/frvir.2023.1215820].
- C13 reports that the earlier HoloLens 2 study (C12) found about 14% lower performance with virtual monitors, attributed to resolution and FOV. This figure is second-hand [C13].
- One week in VR: 16 participants, 5 days × 8 h. Two dropped out on day one (migraine, nausea, anxiety). "Significantly worse ratings across most measures" [C14, https://arxiv.org/abs/2206.03189].
- AR laptop in the wild: 14 participants, 40-min sessions over two weeks, 103 h total [C15, https://arxiv.org/abs/2502.14241].
- Lindlbauer et al.: secondary-task interactions −36% [C22]. SemanticAdapt: manual adaptations −33% [C23].
- LLMR: 4× lower average error rate than standard GPT-4. Usability study N=11 [C28, https://doi.org/10.1145/3613904.3642579].
- SituationAdapt: VLM vs human rating validation with 42 + 42 raters, 64 areas, 18 scenarios. User study N=12: mean preference rank 1.0 vs 2.25 and 2.75 for the baselines [C29, https://arxiv.org/abs/2409.12836].
- DuoZone on Vision Pro (N=16): 34.5% faster layout matching. Workspace construction 168.3 s vs 218.1 s. Overall NASA-TLX 33.30 vs 47.71 (Task 1). 82.8% of layout suggestions accepted [C30, https://arxiv.org/abs/2511.15676].
- Elmqvist and Tsigas: 50 occlusion-management techniques classified into 5 design patterns [C17].

## 5. Open problems

- **What the agent perceives.** In 3D, the user's rendered view is per-eye, head-dependent and private. visionOS says it does not even tell apps the user's FOV (C01). Android XR hides raw gaze and draws gaze hover itself (C02). An agent can see a passthrough-composited capture, the app scene graph, or an accessibility tree. Each misses something: occluded windows, out-of-view windows, or 3D entities without labels.
- **A spatial accessibility tree exists only partly.** visionOS exposes 2D SwiftUI views plus RealityKit entities that opt in through `AccessibilityComponent`; unlabelled entities are invisible to VoiceOver (C01). Android XR panels inherit the Android tree, but it is unclear whether 3D models and orbiter positions are represented spatially (C02). Meta's screen reader is still experimental (C03). No platform documents a tree that carries world-space poses of all windows across apps.
- **Window placement is itself a task an agent can do.** C22, C23, C29 and C30 show measurable savings (−36%, −33%, 34.5% faster). Two gaps remain: third-party agents have no documented API to move other apps' windows in the Shared or Home Space, and temporal consistency matters (C23). An over-eager agent that rearranges space creates its own usability cost.
- **Users want control and keep refining.** Speech commands are "rarely final" (C32). About 17% of LLM layout suggestions were rejected (C30). Anchoring preferences are personal (C11). Agents need user-led, correctable adaptation rather than one-shot automation.
- **Comfort constraints are numeric but platform-specific.** For example, Microsoft says 1.25–5 m, Android 0.75–5 m with a 1.75 m spawn, and Meta 42–46 cm for touch. An agent that plans cross-platform needs a per-device constraint model (C02–C04). It must also keep VAC (C20) and legibility against real backgrounds (C21) in mind.
- **Occlusion is two-way in MR.** Virtual UI can hide real hazards or people (C29; C01 dims content near obstacles), and real objects can hide virtual UI. An agent's "find the window" action needs an occlusion-management repertoire (C17, C18) and must also respect safety.
- **Shared vs Full Space switching is app-controlled and safety-relevant.** An immersive space hides other apps and passthrough, and only one can be open (C01). It is unclear whether an agent should ever trigger this on the user's behalf.
- **No benchmarks.** None of the adaptive-layout papers share a common task suite or dataset. A 3D-window-management benchmark (scene + windows + goal → layout, scored by comfort and consistency) is missing.

## 6. Catalogue rows

| Operation | Techniques used today | Measured/reported difficulty (with source IDs) | Agent could: do it / guide / neither, and why |
|---|---|---|---|
| Open, place and resize a window | visionOS: the system places the first window about 2 m away; the user drags the window bar and corner resize controls with gaze + pinch (C01). Android XR: held pinch to move or resize (C02). Meta: system control bar and resize handles (C03) | Manual workspace construction 218.1 s vs 168.3 s with LLM help (C30). Without semantics, users make 33% more manual adaptations (C23). Too-small windows can make UI elements overlap (C01) | **Do it** inside an app the agent controls, or with OS-level privileges: placement is a well-posed optimization with explicit numeric constraints (C01–C04). For other apps' windows, **guide** only, because no documented third-party API was found. |
| Find a window that is behind you or occluded | Digital Crown recentre (C01). Tag-along "a glance away" (C04). Spatial audio cues (C06). Occlusion techniques (C17, C18) | Neck rotation beyond 45° should be avoided (C04). View-fixed displays make switching 40% slower than the body-centric cockpit (C07). VoiceOver needs the "where" announced explicitly (C01, WWDC23) | **Do it** if the agent has window poses (scene graph or OS): bring the window into the central FOV (41° on Android XR, C02). Otherwise **guide** with audio or arrow cues. Pixel-only agents cannot see what is behind the user. |
| Arrange several windows for multitasking | Templates and zones (C30). Body-centric cockpit (C07). Flat or curved rows (C02). One primary + at most 2 supporting windows (C03) | Virtual monitors: 9.10% slower (n.s.), 37% lower comfort, 24% lower focus (C13). One-week VR work: worse ratings, dropouts (C14). AVP users cite limited customization (C16) | **Do it**: LLM layout suggestions were 82.8% accepted and 34.5% faster (C30). Keep a direct-manipulation fallback and temporal consistency (C23, C32). |
| Pin a window or widget to a real wall | visionOS 26 widgets snap to walls and desks and persist per room (C01). Android XR anchors panels to walls, tables etc. in passthrough only (C02). Meta: align objects with surfaces and give placement cues (C03) | Scene detectors miss walls (YOLOv3, C29). Flat-surface detection needs thresholds and manual labels (C31). Real environments drift from authored content (C33) | **Do it** where the platform exposes anchors and plane detection; an LLM can choose the semantically right surface (C31). **Guide** when anchoring fails or the surface is ambiguous. |
| Move a virtual object onto a real table | Direct grab or ray manipulation. Snap to detected planes. Voice "put that there" (C31) | No haptics and imperfect depth perception make contact hard to judge (C04 interactable object). VAC discomfort at near distances (C04, C20). Avoid the 0.5–0.8 m dead zone (C03) | **Do it**: "Place X on the coffee table" maps to a JSON place action (C31). **Guide** fine alignment, where the user's judgment of "looks right" dominates. |
| Switch between Shared/Home Space and Full Space | App-initiated `openImmersiveSpace` / `dismissImmersiveSpace`; only one immersive space at a time (C01). Android XR collapse/expand affordances (C02) | Full Space hides other apps. Progressive and full styles impose a 1.5 m boundary. Excessive movement interrupts the experience (C01) | **Guide** (or neither): the transition is app-controlled and changes what the user can see of their surroundings, so it should stay a user decision. An agent can explain or suggest it. |

## 7. Figure/widget ideas

1. **Comfort-zone top-down map (interactive SVG/canvas).** A user at the origin, with concentric distance bands per platform:
   - Meta: touch 42–46 cm, dead zone 0.5–0.8 m, ray 0.8–3 m (C03).
   - Android XR: limits 0.75–5 m, spawn 1.75 m (C02).
   - Microsoft: 1.25–5 m optimal, 2.0 m focal, 30/40 cm clip/fade (C04).
   - visionOS: first window about 2 m, reading at 1 m or more (C01).

   Add a toggle per platform and a draggable window that turns red when it violates a rule.
2. **Reference-frame toggle.** A head-rotation slider shows the same panel world-locked, body-locked (with rotation threshold), tag-along (lagging spring) and head-locked (C04, C05, C06, C11). It visualizes why head-locked content breaks Pointer Control and Zoom (C01).
3. **Layout-optimizer toy.** A small room with a desk, wall and stove, plus three app windows. Sliders weight semantic affinity, visibility, reachability and consistency, in the style of SemanticAdapt and AUIT (C23, C24). A button shows an "LLM proposal" as JSON place actions (C31) and scores it with the same cost.
4. **Angular target-size calculator.** Plots the physical size needed against distance for 60 pt (visionOS, angular), 56 dp (Android, 0.868 dp-to-dmm), 2.5°–3° (Meta) and 1°/2° (Microsoft). It shows that "the same button" differs by platform (C01–C04).

## 8. Unverified

- The brief's "target size minimum 60 pt" for visionOS. The HIG pages read give 60×60 pt as the default control size and 28×28 pt as the minimum, plus "centres at least 60 points apart" (C01). Cite those exact phrasings.
- Lindlbauer et al. 2019 (C22): participant count, task design and cognitive-load measure. Only the abstract was read; no open PDF was found.
- Biener et al. 2022 (C14): SUS, SSQ, NASA-TLX values. The PDF could not be text-extracted in this environment; only abstract-level numbers are used.
- Pavanatto et al. 2021 (C12): sample size and the exact "about 14%" performance drop. The figure is quoted second-hand from C13.
- Personal Cockpit (C07): layout parameters (distance, curvature, grid). Only the abstract (40%) was read.
- DuoZone (C30) venue: the PDF shows unfilled IMWUT template fields. Treat it as an arXiv preprint.
- Meta Quest screen reader behaviour (e.g., controller-only input, what it reads in third-party apps). The help page did not load. Only the checklist entry "Screen reader enabled (Settings > Experimental)" was read (C03).
- Whether visionOS withholds gaze position from apps. Widely stated, but not found in the HIG pages read here. Android XR's equivalent statement is verified (C02).
- Whether HoloLens / Windows Mixed Reality exposes a UI Automation tree for holographic apps. Not covered in the design pages read.
- An alpha Meta quickstart page reportedly recommends 1–1.5 m for UI panels (search snippet only, not read). It may conflict with the 42–46 cm touch guidance.
- Ens et al. "Personal Cockpit" design-space study details, and Dingler et al. 2018 "VR Reading UIs" (CHI EA, DOI 10.1145/3170427.3188695 found via Crossref, content not read). Neither is included in the table for that reason.
