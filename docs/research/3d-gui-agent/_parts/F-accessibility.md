# Part F: Accessibility in XR

Compiled 2026-11-24 for the column "3D GUI agents". Each work in the table was checked against a primary
record: the DOI resolved through OpenAlex or the Semantic Scholar API (title, authors, venue, year), an arXiv
abs page, or the official W3C / project page. Numbers come from text that was actually read: the full paper
text for SeeingVR (F01), Canetroller (F02) and Siu et al. (F03) (author PDFs hosted by Microsoft Research), the
arXiv HTML full text for VRSight (F07), and abstracts or publisher / PMC pages for the rest. Platform features
(Section 3) come from official help pages read on 2026-11-24. Meta's consumer help pages render client-side and
returned no body text, so the Meta row relies on Meta's developer accessibility checklist. When a number is
taken from an abstract and not from the body, the note says "abstract".

## 1. Works

| ID | Title | First author et al. | Venue / status | Year | Link | Contribution (one line) | Relevance to 3D GUI agents (one line) |
|---|---|---|---|---|---|---|---|
| F01 | SeeingVR: A Set of Tools to Make Virtual Reality More Accessible to People with Low Vision | Yuhang Zhao et al. | ACM CHI 2019 | 2019 | https://doi.org/10.1145/3290605.3300341 | 14 low-vision tools (magnifier, bifocal lens, edge enhancement, depth measurement, highlight, guideline, object description, etc.). 9 are injected post hoc into Unity apps with no developer effort, and 5 need developer metadata. Evaluated with 11 low-vision participants. | The first "accessibility overlay" for VR. Its split between what can be done post hoc from pixels/engine state and what needs semantic labels is the same split a 3D GUI agent faces. |
| F02 | Enabling People with Visual Impairments to Navigate Virtual Reality with a Haptic and Auditory Cane Simulation | Yuhang Zhao et al. | ACM CHI 2018 | 2018 | https://doi.org/10.1145/3173574.3173690 | Canetroller: a wearable brake, vibrotactile and spatial-audio cane controller that lets cane users transfer real cane skills into VR. Study with 9 visually impaired cane users. | Shows that non-visual access to a 3D scene can be built from contact queries against scene geometry. An agent can issue the same queries without a physical device. |
| F03 | Virtual Reality Without Vision: A Haptic and Auditory White Cane to Navigate Complex Virtual Worlds | Alexa F. Siu et al. | ACM CHI 2020 | 2020 | https://doi.org/10.1145/3313831.3376353 | A three-axis brake cane controller with voice-coil textures and geometry-aware spatial audio. 7 of 8 users navigated a 6x6 m virtual room to targets while avoiding collisions. | Navigation without vision is possible but slow and hardware-bound. An agent that moves the user or describes the route is the software alternative. |
| F04 | VRBubble: Enhancing Peripheral Awareness of Avatars for People with Visual Impairments in Social Virtual Reality | Tiger F. Ji et al. | ACM ASSETS 2022 | 2022 | https://doi.org/10.1145/3517428.3544821 (arXiv: https://arxiv.org/abs/2208.11071) | Audio notifications of nearby avatars, organised by Hall's proxemic zones (intimate, conversation, social). With 12 participants it beat an audio-beacon baseline for avatar awareness, but was more distracting in crowds. | An agent that narrates a scene must filter and rank events. VRBubble shows the cost of over-reporting. |
| F05 | "The Guide Has Your Back": Exploring How Sighted Guides Can Enhance Accessibility in Social Virtual Reality for Blind and Low Vision People | Jazmin Collins et al. | ACM ASSETS 2023 | 2023 | https://doi.org/10.1145/3597638.3608386 (arXiv: https://arxiv.org/abs/2410.21659) | A human sighted guide in VR: the user virtually holds on to the guide, moves with them, and hears descriptions. 16 BLV participants with varied preferences. | The human "guide" role is the job description of a 3D GUI agent in guide mode. |
| F06 | An AI Guide to Enhance Accessibility of Social Virtual Reality for Blind People | Jazmin Collins et al. | ACM ASSETS 2024 (short paper, pp. 1–5) | 2024 | https://arxiv.org/abs/2410.14058 | An AI-powered guide with six personas (behaviour and appearance), visual interpretation and navigation help. Design paper, no user study yet. | First step from a human guide to an AI guide in VR. |
| F07 | VRSight: An AI-Driven Scene Description System to Improve Virtual Reality Accessibility for Blind People | Daniel Killough et al. | ACM UIST 2025 | 2025 | https://doi.org/10.1145/3746059.3747641 (arXiv: https://arxiv.org/abs/2508.02958) | Post hoc "3D screen reading" from the mirrored headset video: YOLOv8n trained on a new VR dataset (DISCOVR, 30 classes, 17 apps), DepthAnythingV2, OCR, GPT-4o, spatial audio. 9 BLV participants in Rec Room. | The closest existing system to a perception-only 3D GUI agent. Menus were its weakest task (11% completion). |
| F08 | Understanding the Use of a Large Language Model-Powered Guide to Make Virtual Reality Accessible for Blind and Low Vision People | Jazmin Collins et al. | ACM CHI 2026 (arXiv preprint of the paper) | 2026 | https://arxiv.org/abs/2603.09964 | An LLM-powered guide tested with 16 BLV participants in social VR with confederates. Alone, people treated it as a tool. With others present, they treated it socially (nicknames, excusing its errors). | The first user study of an LLM agent that guides BLV users in VR. Social presence changes how users judge agent errors. |
| F09 | "I just went into it assuming that I wouldn't be able to have the full experience": Understanding the Accessibility of Virtual Reality for People with Limited Mobility | Martez Mott et al. | ACM ASSETS 2020 | 2020 | https://doi.org/10.1145/3373625.3416998 | Interviews with 16 people with limited mobility. 7 physical-access barriers, from first setup to keeping controllers in view of the headset's tracking cameras. | Lists the steps that block motor-impaired users before any app UI is reached. Several (setup, re-centering, controller handling) are system-level steps an agent could take over. |
| F10 | Nearmi: A Framework for Designing Point of Interest Techniques for VR Users with Limited Mobility | Rachel L. Franz et al. | ACM ASSETS 2021 | 2021 | https://doi.org/10.1145/3441852.3471230 | POI techniques composed of four parts (representation, display, selection, transition) that let a user notice a POI and turn the virtual camera to it without turning the body. Video elicitation with 17 participants. | A "show me X, then face X" action is a core agent primitive. Nearmi is a design space for how it should look and move. |
| F11 | A Critical Examination of Virtual Reality Technology in the Context of the Minority Body | Kathrin Gerling and Katta Spiel | ACM CHI 2021 | 2021 | https://doi.org/10.1145/3411764.3445196 | Theoretical analysis (Surrogate Body theory + Critical Disability Studies): VR assumes a "corporeal standard", a non-disabled body, and fails to accommodate disabled people. | Warns that an agent that only "fixes" inputs keeps the same body assumptions. It argues for changing the system, not the user. |
| F12 | Using Immersive Virtual Reality to Enhance Social Interaction Among Older Adults: A Cross-Site Investigation | Saleh Kalantari et al. | Innovation in Aging 7(4) | 2023 | https://doi.org/10.1093/geroni/igad031 (arXiv: https://arxiv.org/abs/2210.04954) | 36 adults aged 60+ (mean 70.8) at 3 US sites on Quest 2 social VR. Complaints: headset weight, no eyeglass fit, controllers needing finger dexterity, too little training. | Older first-time users fail at hardware and controller steps, which a guiding agent could coach. |
| F13 | Exploring Augmented Reality Approaches to Real-Time Captioning: A Preliminary Autoethnographic Study | Dhruv Jain et al. | ACM DIS 2018 Companion | 2018 | https://doi.org/10.1145/3197391.3205404 | HMD (HoloLens) captions whose shape, number and placement users manipulate in 3D. Autoethnography: more glanceable and better visual contact with speakers than laptop captions. | Caption placement is a 3D layout decision that an agent could make from speaker position. |
| F14 | Towards Sound Accessibility in Virtual Reality | Dhruv Jain et al. | ACM ICMI 2021 | 2021 | https://doi.org/10.1145/3462244.3479946 | A design space of visual and haptic substitutes for VR sounds, with prototypes evaluated with 11 DHH users and 4 VR developers. | Sound is an unlabeled output channel. An agent that perceives audio events could convert them into visual or haptic cues. |
| F15 | Accessible by Design: An Opportunity for Virtual Reality | Martez E. Mott et al. | IEEE ISMAR-Adjunct 2019 (position paper) | 2019 | https://doi.org/10.1109/ISMAR-Adjunct.2019.00122 | Argues VR should build accessibility in and develop cross-industry standards, since post hoc or third-party patches are less optimal. | States the design-time vs post-hoc tension that decides whether an agent can rely on semantics or must infer from pixels. |
| F16 | Inclusive Immersion: a review of efforts to improve accessibility in virtual reality, augmented reality and the metaverse | John J. Dudley et al. | Virtual Reality (Springer) | 2023 | https://doi.org/10.1007/s10055-023-00850-8 | Review of research and commercial efforts on VR/AR accessibility, a synthesis of strategies, and open challenges. | Survey entry point for the whole area. |
| F17 | Inclusive AR/VR: accessibility barriers for immersive technologies | Chris Creed et al. | Universal Access in the Information Society (online 2023) | 2023 | https://doi.org/10.1007/s10209-023-00969-0 (arXiv: https://arxiv.org/abs/2304.13465) | Two multidisciplinary "sandpit" workshops (researchers, industry, people with disabilities, assistive technologists, charities) mapping barriers across physical, cognitive, visual and auditory impairments. | One of the few sources that covers cognitive barriers in XR alongside the others. |
| F18 | An Equitable Experience? How HCI Research Conceptualizes Accessibility of Virtual Reality in the Context of Disability | Kathrin Gerling et al. | ACM Transactions on Accessible Computing (DOI 10.1145/3770755 per Semantic Scholar); arXiv preprint | 2024 (arXiv) | https://arxiv.org/abs/2411.04489 | Literature study of 28 VR accessibility papers: accessibility is rarely defined, work is barrier-centric, and experience (presence, immersion) is rarely evaluated. | Task completion is not enough. An agent that "does it for the user" may remove the experience the user came for. |
| F19 | XR Accessibility User Requirements (XAUR) | W3C Accessible Platform Architectures WG (eds. Janina Sajka, Scott Hollier et al.) | W3C Working Group Note | 2021 | https://www.w3.org/TR/2021/NOTE-xaur-20210825/ | 19 user-need areas with requirements (immersive semantics, motion-agnostic interaction, target customization, voice commands, second screen, captions, etc.). | Its requirements (objects locatable and describable by AT, all UI reachable with one input method) are also the preconditions for a 3D GUI agent. |
| F20 | XR Access (initiative) | Cornell Tech (research initiative) | Official site | 2019– (site read 2026-11-24) | https://xraccess.org/ | Community for accessible XR. Runs the XR Access Symposium (2025 edition held June 26–27, New York) and an XR accessibility GitHub repository with the XR Association. | Main venue where industry and researchers align on XR accessibility practice. Its homepage shows a "XR Access Enters Hibernation" notice with no further detail. |

## 2. Deep notes

### F01: SeeingVR (Zhao et al., CHI 2019)

**Problem.** Mainstream VR apps did not support people with low vision (vision loss short of blindness that
glasses cannot correct). In a formative study, participants had trouble seeing details at a distance, perceiving
depth, and searching for and tracking targets. Their needs varied by condition, scene lighting and task. They
wanted one consistent set of tools across all apps, and the tools had to avoid clashing with each app's own
interaction scheme.

**Method.** Fourteen tools that overlay visual and audio augmentations. Users select, combine and tune them.
To avoid clashing with app input, the tools are controlled by speech (a Wizard-of-Oz voice invocation in the
study). Two deployment paths:
- A *post hoc plugin* with 9 tools (Magnification Lens, Bifocal Lens, Brightness Lens, Contrast Lens, Edge
  Enhancement, Peripheral Remapping, Text Augmentation, Text to Speech, Depth Measurement). It injects a DLL into
  a compiled Unity app through the Illusion Plugin Architecture and loads the tools from an AssetBundle at runtime.
  No source code or developer effort is needed.
- A *Unity toolkit* that adds the remaining 5 tools (Object Recognition/Description, Highlight, Guideline,
  Recoloring, and an assistive-app tool modelled on smartphone apps such as VizWiz/Seeing AI). These need
  metadata that "we cannot easily get by automatic recognition". The toolkit extends Unity's GameObject with
  three fields: `Description` (alt text), `isSalient` (important object, used by Highlight and Guideline) and
  `isWholeObject` (object hierarchy, used by Recoloring).

**Data and results.** 11 participants with low vision did three tasks with and without SeeingVR.
- Menu navigation (7 of 14 items on a menu 10 m away): all participants completed it with SeeingVR. Only 4 could
  complete it without any augmentation. For those 4, time fell from 4.67 s (SD 1.62) to 2.22 s (SD 0.35)
  (paired t-test, p = 0.039, d = 1.76). Two of them had 40% and 60% accuracy without tools and 100% with them.
- Visual search (pick 1 of 10 objects on a desk): 7.51 s (SD 4.94) without vs 3.98 s (SD 2.33) with
  (p = 0.004, d = 1.11). Accuracy reached 100% for all with SeeingVR.
- Target shooting: 27.08 s (SD 13.56) vs 16.04 s (SD 9.60) (p = 0.0004, d = 1.55).
- All participants preferred SeeingVR. Tool choice varied by task: Text Augmentation and Magnification for
  menus, Highlight for search, Guideline for moving targets. Many used Depth Measurement as a better laser
  pointer, to tell which menu item the controller was pointing at.
- The plugin ran on the 10 most popular Unity VR apps. Six Unity developers found the toolkit easy to use. One
  found filling in `Description` too time-consuming.

**Limitations.** Unity-only. The semantic tools depend on developers filling in metadata. Some participants
felt Recoloring and Edge Enhancement hurt the aesthetics, and that Guideline "feels like cheating" in games.
Tool invocation in the study was Wizard-of-Oz speech, not a deployed input method. The study was short and in
the lab.

**Transfers to agents.** (1) The post hoc / metadata split is the key design fact: with engine access but no
semantics, you can change how things look (zoom, contrast, edges, depth), but you cannot say what things are or
which are important. That second half is what a VLM agent adds. (2) The three fields `Description`,
`isSalient` and `isWholeObject` are a minimal 3D accessibility schema, close to what an agent needs as an
observation (label, priority, object grouping). (3) "Guideline", a line from the view centre to an important
off-screen object, is a ready guidance primitive for an agent in "guide" mode. (4) Participants wanted one
consistent tool set across apps, which argues for an OS-level agent rather than per-app features.

**Does not transfer.** SeeingVR leaves the user in control of every action. It only changes perception, so it
avoids the safety, trust and "cheating" questions an acting agent raises. Its post hoc path depends on
injecting code into Unity builds, which closed platforms (visionOS, Horizon OS store apps) do not allow.

### F07: VRSight (Killough et al., UIST 2025)

**Problem.** Blind users cannot use most VR apps, and fixes that need developer integration (as in F01's
toolkit) rarely ship. The authors aim at a post hoc system that works on unmodified apps.

**Method.** The headset view is cast from a Meta Quest 3 (Meta Quest Developer Hub, then OBS Studio at 640x640
as a virtual camera) to a PC. The pipeline:
- object detection with YOLOv8n fine-tuned on DISCOVR,
- depth from DepthAnythingV2 to place sounds in 3D,
- OCR with Azure AI Vision for signs, notifications and avatar names,
- GPT-4o to read the scene's mood (to pick a speech tone) and to describe icons and emoji,
- spatial audio played through a PlayCanvas WebVR page in the background.

Four tools are triggered from a three-key keypad on the left controller:
- *ContextCompass* gives a short summary of the scene.
- *SceneSweep* reads the detected objects from left to right, with spatial audio.
- *AimAssist* describes what is near the pointer or hand.
- *SafeGuard* gives a spatial-audio warning near the play-area boundary.

DISCOVR has 17,691 annotated images from 17 apps (15 social VR apps and 2 Oculus demos), with 30 classes in six
categories (avatars, informational, interactables, safety, seating, VR system). The classes include menu,
button, UI-text and UI-graphic.

**Data and results.**
- Detector on the DISCOVR test set: mAP@50 67.3, mAP@50-95 46.3. The weakest classes were "locomotion-target"
  (14.5) and "portal" (21.1).
- On an RTX 4090: detection about 45 ms per frame, depth about 134 ms, GPT-4o 1.69 s, OCR 1.23 s. Time from
  keypress to response was about 2.25 to 2.55 s, and an audio cue masks part of that wait.
- 9 BLV participants (5 blind, 4 low vision), mostly with little VR experience, used Rec Room:
  - Dorm room: they identified 7.11 objects on average, with a 17.2% object identification error rate.
  - Avatar count: 6 of 9 were exactly right.
  - Open seat: 5 of 9 found and sat in an open seat.
  - Menu: all found the menu, but only 1 (P7) found the specific backpack icon and the "Join Public Room" button.
    The paper reports an 11% completion rate for menu trials.
- Ratings: ContextCompass was rated most helpful (6 of 7). AimAssist was rated lowest (3.44).

**Limitations.** The system needs a separate PC and a casting setup, which may need sighted help to start. The
spatial-audio app cannot read the headset's IMU when it is not in focus, so head-tracked audio is limited. It
depends on cloud services, and repeated presses give varying descriptions, which makes mental mapping harder.
It is weaker in dark, fast or crowded scenes. Pointer detection fails when an app's pointer is not the usual
style. Users asked for verbal direction and distance cues, and the study measured first use only. The authors
ask headset makers to allow such post hoc accessibility tools.

**Transfers to agents.** (1) It proves the perception half of a pixel-based 3D GUI agent on a consumer
headset: a VR-specific detector plus OCR plus an LLM, at about 2 s per query. (2) The menu result marks
the gap. Describing a scene is far easier than *operating* a 3D UI. Even with good descriptions, participants
could not reach a specific button with a free pointer. They asked for d-pad style navigation, snapping
cursors and row/column reading. In other words, they asked for a discrete, enumerable action space, which is
what an agent needs too. (3) Inconsistent LLM wording hurts spatial memory, so an agent should cache
descriptions per location or object. (4) Its platform barriers (no access to the frame or head pose from a
background service) are the same ones an OS-level 3D GUI agent would hit.

**Does not transfer.** VRSight only describes. It never acts for the user, so it does not show whether
automatic actions would be accepted. Its 30 classes come from social VR and will not cover productivity apps or
passthrough MR scenes, which the authors did not evaluate rigorously.

## 3. Platform accessibility features

Accessibility services are the closest thing to an "agent layer" on headsets today. They read a UI tree
(labels, roles, focus order) and perform actions on behalf of the user (activate, scroll, next item). The
table records what each platform documents. P-IDs are used in Section 4.

| Platform | Features (official names) | What they can operate | What they cannot (or what the docs do not claim) | Source |
|---|---|---|---|---|
| P1 Apple Vision Pro (visionOS) | VoiceOver (pinch-gesture set: right index pinch = next item, right middle = previous, left index or right ring = activate. Pinch-and-hold right index = explore, which speaks items "you look at". A rotor, Item Chooser, "Describe passthrough", and "Label item"). Zoom (visionOS 26 adds "Zoom into your surroundings", e.g. physical books or people in the room). Live Recognition (on-device machine learning, per the visionOS 26 notes. It gives spoken, braille or sound descriptions of scenes, people, furniture and text). Pointer Control (pointer driven by eyes, head, wrist or finger). Dwell Control (eyes only: Long Look to Tap or Glance Up to Tap, Activation Time, Movement Tolerance, scroll buttons). Switch Control. AssistiveTouch. Guided Access. Live Captions. Sound Recognition. | All system UI and SwiftUI windows that expose accessibility elements. 3D RealityKit entities can expose labels and actions through `AccessibilityComponent` (see Part C, C01). VoiceOver offers linear navigation, look-to-explore, item search (Item Chooser) and user-added labels for unlabeled items. | The gesture guide does not explain how immersive spaces or 3D content behave under VoiceOver. Unlabeled 3D entities have no description beyond what the user adds with "Label item". Apple says Live Recognition should not be relied on for navigation or in situations where the user could be harmed. Dwell Control documents tap and scroll only (no drag). | https://support.apple.com/guide/apple-vision-pro/get-started-with-accessibility-features-tan426c48bdc/visionos ; https://support.apple.com/guide/apple-vision-pro/learn-voiceover-gestures-tanf5c9d873d/visionos ; https://support.apple.com/guide/apple-vision-pro/use-a-pointer-to-navigate-tan3869c8a85/visionos ; https://support.apple.com/guide/apple-vision-pro/perform-actions-with-your-eyes-tan0ba69a1f1/visionos ; https://support.apple.com/guide/apple-vision-pro/get-live-descriptions-with-live-recognition-tanb4e29f7a1/visionos ; https://support.apple.com/en-gb/123024 |
| P2 Android XR (headsets) | TalkBack (on via volume buttons, Settings, accessibility toolbar or "Hey Gemini, turn on TalkBack". Palm-out pinch moves focus forward or back. Palm-in pinch-and-hold gestures for Launcher, Recents and Back. Explore mode: aim a hand pointer and pinch to select). Magnification. Color correction. Relumino outline. Reduce animations. Accessibility toolbar. Live Caption (English only at time of reading). Hover actions (gaze to select, with hover duration and movement tolerance). | Android views in spatial panels, through the standard Android accessibility tree. Focus order starts at the top of each screen and moves down. Gemini can switch accessibility features on by voice. | The TalkBack page does not say how immersive environments or 3D content are read. Gesture reliability is a stated issue ("try a slower pinch"). | https://support.google.com/android-xr/answer/16659712?hl=en ; https://support.google.com/android-xr/answer/16659361?hl=en |
| P3 Meta Quest (Horizon OS) | Screen reader (listed as "Settings > Experimental" in Meta's developer checklist). Color correction. Live captions. Meta's developer checklist recommends one-hand / one-controller play, all interactions reachable from a fixed seated or standing position, subtitles for all dialogue and sound effects, and `contentDescription` on interactive elements. | System UI and 2D (Android-based) panel apps that provide content descriptions. | Immersive apps draw their UI in their own engine. Meta's checklist items are *recommended*, not required for Store submission. The screen reader is still experimental. VRSight's authors found that a background app loses head-pose (IMU) access when it is not in focus. | https://developers.meta.com/horizon/design/accessibility-checklist/ (updated 2026-04-13); F07 |
| P4 Microsoft HoloLens 2 (Windows Holographic) | Voice: "select" brings up a gaze cursor that is steered by head direction, then "select" again. "What can I say?" lists commands. "Go to Start", "Close", "Hide hand rays". Most hand actions have voice equivalents. One-handed Start gesture using eye gaze. | System shell, Start menu, 2D app windows, window move/resize/follow. | No HoloLens-specific screen reader or magnifier page was found on Microsoft Learn (Windows Narrator documentation is PC-oriented). Hand input works only inside the hand-tracking frame. | https://learn.microsoft.com/en-us/hololens/hololens2-basic-usage |

**What the existing "agent layer" can and cannot do in 3D.**
- *Can:* enumerate labelled elements in 2D panels, move focus linearly, activate, scroll, switch apps, and accept
  alternative inputs (gaze dwell, head or wrist pointer, switches, voice). On visionOS, focus can follow gaze,
  and users can add their own labels.
- *Cannot (as documented):* give spatial structure (what is left, behind, near or far) beyond a reading order.
  They cannot describe or act on unlabeled 3D content, which is most content inside immersive apps and games.
  They cannot move the user's viewpoint or body (locomotion, turning) except where the app provides a POI or
  teleport feature (F10). Nor can they map a free-form 3D manipulation (grab, rotate, place) to a discrete
  command. XAUR (F19) names the missing piece: "a need for accessibility API's that map custom user interface
  actions to control types."

## 4. Facts and numbers

- SeeingVR has 14 tools, 9 of them post hoc with no developer effort, and was evaluated with 11 low-vision participants [F01, https://doi.org/10.1145/3290605.3300341].
- In SeeingVR's menu task, only 4 of 11 low-vision participants could complete it without augmentation. All completed it with SeeingVR [F01, https://doi.org/10.1145/3290605.3300341].
- SeeingVR roughly halved visual search time (7.51 s to 3.98 s, p = 0.004) and cut target shooting from 27.08 s to 16.04 s (p = 0.0004) [F01, https://doi.org/10.1145/3290605.3300341].
- SeeingVR's post hoc plugin worked on the 10 most popular Unity VR apps [F01, https://doi.org/10.1145/3290605.3300341].
- Canetroller: 9 cane users. In the indoor scene all located and identified all virtual objects, and 8 of 9 correctly pointed out all object locations afterwards [F02, https://doi.org/10.1145/3173574.3173690].
- Siu et al.: 7 of 8 users navigated a 6x6 m virtual room to targets while avoiding collisions [F03, https://doi.org/10.1145/3313831.3376353].
- VRBubble: 12 participants with visual impairments. Better avatar awareness than an audio beacon, but more distracting in crowded scenes (abstract) [F04, https://doi.org/10.1145/3517428.3544821].
- VRSight's DISCOVR dataset: 17,691 images, 30 classes, 17 apps. Detector mAP@50 67.3 on test [F07, https://arxiv.org/abs/2508.02958].
- VRSight: GPT-4o responses took 1.69 s and OCR 1.23 s. Keypress-to-response was about 2.25–2.55 s on an RTX 4090 [F07, https://arxiv.org/abs/2508.02958].
- VRSight, 9 BLV users: menu trials had an 11% completion rate. 6 of 9 counted avatars exactly. 5 of 9 found an open seat. Object identification error rate was 17.2% [F07, https://arxiv.org/abs/2508.02958].
- LLM guide in social VR: 16 BLV participants. Users treated it as a tool when alone and socially when others were present (abstract) [F08, https://arxiv.org/abs/2603.09964].
- Human sighted guide in VR: 16 BLV participants with a wide range of preferences (abstract) [F05, https://doi.org/10.1145/3597638.3608386].
- Limited mobility: 16 interviewees and 7 physical-access barriers, from setup to keeping controllers in view of the headset cameras (abstract) [F09, https://doi.org/10.1145/3373625.3416998].
- Nearmi: 17 participants with limited mobility. Preferences showed trade-offs among accessibility, realism, spatial awareness, comfort and familiarity (abstract) [F10, https://doi.org/10.1145/3441852.3471230].
- Older adults: 36 participants aged 60+ (mean 70.8) on Quest 2. Complaints included headset weight, no eyeglass fit, and controllers needing too much finger dexterity. Exit-interview responses were coded 39 "unusable" and 23 "usable" [F12, https://doi.org/10.1093/geroni/igad031].
- Sound accessibility in VR: prototypes evaluated with 11 DHH users and 4 VR developers (abstract) [F14, https://doi.org/10.1145/3462244.3479946].
- Review of 28 VR accessibility papers: accessibility is seldom defined, and experience (presence, immersion) is rarely designed for or evaluated [F18, https://arxiv.org/abs/2411.04489].
- XAUR REQ 2b: all areas of the interface should be reachable with one input method. REQ 4c: no action should require multiple simultaneous inputs or gestures [F19, https://www.w3.org/TR/2021/NOTE-xaur-20210825/].
- visionOS VoiceOver has "Describe passthrough" and "Label item" commands, and its explore mode speaks items the user looks at [P1, https://support.apple.com/guide/apple-vision-pro/learn-voiceover-gestures-tanf5c9d873d/visionos].
- Android XR TalkBack can be turned on by asking Gemini, and has an explore mode with a hand-aimed pointer [P2, https://support.google.com/android-xr/answer/16659712?hl=en].
- Meta's developer accessibility checklist lists the screen reader under "Settings > Experimental". All checklist items are recommended, not required [P3, https://developers.meta.com/horizon/design/accessibility-checklist/].

## 5. Open problems (as they bear on 3D GUI agents)

1. **No semantic layer for 3D content.** Screen readers work on 2D panels, but inside immersive apps most
   objects carry no label (F01, F07, P3). An agent must either infer semantics from pixels (VRSight-style,
   2 s per query and 17% error) or rely on developer metadata that is rarely provided. A shared 3D accessibility
   schema (label, role, salience, grouping, available actions) would serve both assistive technology and agents.
   XAUR notes this as a need (F19).
2. **Describing is not operating.** BLV users could get rich descriptions but still could not hit a menu button
   (11% in F07). Agents that act directly (select the button for the user) or that turn free pointing into
   discrete steps (d-pad, snapping, row/column reading) address the actual bottleneck.
3. **Platform access.** Post hoc tools need the rendered frame, head pose and input injection. Today these need
   developer modes, a tethered PC, or code injection (F01, F07). An OS-level agent API with user consent does
   not exist on any of the four platforms.
4. **Body-independent actions.** Motor-impaired users are blocked by setup, controller tracking, reach and
   turning (F09, F10, F11). XAUR asks for motion-agnostic interaction (F19). An agent can be the
   motion-agnostic layer ("face the door", "bring the menu down to me"), but it must not quietly assume a standing,
   two-handed user.
5. **Experience versus completion.** Participants worried that aids reduce aesthetics or "feel like cheating"
   (F01), and F18 finds experience is rarely evaluated. An agent that completes tasks may remove the experience.
   Users need control over how much the agent does.
6. **Consistency and trust.** LLM descriptions vary from press to press (F07). Social context changes how users
   forgive agent errors (F08). Agents need stable, cached descriptions and visible error handling.
7. **Gaps in the evidence.** Few XR studies cover cognitive impairment or neurodivergent users (F17 is a workshop
   study, not an evaluation). Older-adult studies are small pilots (F12). Deaf and hard-of-hearing work focuses on
   captions and sound substitution (F13, F14), not on operating UIs.

## 6. Catalogue rows

| Operation | Techniques used today | Measured/reported difficulty (with source IDs) | Agent could: do it / guide / neither, and why |
|---|---|---|---|
| A blind user finds and presses a specific button in an app menu inside an immersive VR app | System screen reader only for system UI and 2D panels (P1–P3). Inside immersive apps: post hoc scene description plus a free pointer (F07), or a human or AI guide (F05, F06, F08). | VRSight: all 9 found the menu, but only 1 found the target icon and button. 11% completion for menu trials (F07). | **Do it**, with confirmation. An agent that detects the button and issues the press removes the pointing step that failed. Where input injection is not allowed, it can **guide** by snapping or by d-pad navigation over detected elements. |
| A blind user explores a social VR room and finds a free seat or a person | Spatial-audio summaries and left-to-right sweeps (F07), proxemic avatar notifications (F04), virtual cane (F02, F03), human or AI guide (F05, F08). | 5 of 9 found an open seat and 6 of 9 counted avatars correctly (F07). VRBubble was distracting in crowds (F04). | **Guide**, and optionally **do it** (move the user to the seat). Users value agency and social presence (F08, F18), so narration with optional auto-navigation fits better than full automation. |
| A seated user with limited reach or turning selects an object that is behind them or on the floor | Height adjustment and seated modes (P3 checklist). POI techniques that turn the camera to a target (F10). Pointer Control and Dwell Control (P1). Hover actions (P2). | 7 physical-access barriers, including setup and keeping controllers in camera view (F09). 13 preferred POI combinations out of 48 per a secondary summary, not verified (F10). VR assumes a non-disabled "corporeal standard" (F11). | **Do it.** "Bring X to me" or "turn the view to X" is a short sequence of system actions that needs no fine motor control, which is what XAUR REQ 2a/4a ask for (F19). |
| A low-vision user reads distant text and picks a menu item | Magnification, bifocal lens, text augmentation, depth-measurement laser (F01). System Zoom (P1, P2). | Only 4 of 11 could do the menu task without aids. Time 4.67 s vs 2.22 s for those 4 with SeeingVR (F01). | **Guide** (read the text aloud, highlight the target) or **do it** on request. Many low-vision users want to keep doing it themselves with better visibility (F01). |

## 7. Figure/widget ideas

1. **"Two routes to a 3D accessibility tree" (static SVG).** Left: the design-time route (developer metadata such
   as SeeingVR's `Description` / `isSalient` / `isWholeObject` and RealityKit `AccessibilityComponent`, feeding
   VoiceOver / TalkBack). Right: the post hoc route (frame capture, then detector + depth + OCR + LLM as in
   VRSight). Both feed one node labelled "3D GUI agent". Annotate each route with its measured costs: developer
   effort (F01) on the left, about 2 s latency and 17% error (F07) on the right.
2. **"Linear focus vs. spatial sweep vs. agent" (interactive widget, `assets/js/widgets/`).** A top-down VR room
   with 12 objects, including a small menu button. The reader picks a mode:
   - screen-reader style next/previous focus over labelled items only,
   - a left-to-right SceneSweep inside the view cone,
   - an agent command ("press Join").

   A counter shows the steps needed to reach the button, and unlabeled objects are greyed out in the first mode.
   This shows why describing is not operating.

## 8. Unverified

- **Mott et al. 2020, the seven barriers by name.** Only the abstract-level description was verified ("from
  initial setup to keeping controllers in view of headset cameras"). The ACM full text returned HTTP 403, and the
  author PDF's text layer could not be extracted.
- **Nearmi "13 preferred combinations out of 48".** This comes from a secondary summary and is not in the
  abstract that was read. It is used in Section 6 only with that flag.
- **Kalantari et al. as "first experiences" with VR.** The verified paper (F12) is a social-VR pilot, not a
  first-use barrier study. Roberts et al. (older adults and VR acceptance) and any "Brown" older-adult study were
  not looked up.
- **"Exploring the design space of captions in VR" (Li et al. 2022).** No paper with this title was found.
  Related caption work was found but not verified against DOI records, so it is not in the table: Rothe et al.
  2018 "Dynamic Subtitles in Cinematic Virtual Reality" (TVX), Agulló et al. 2019 (AI EDAM, subtitles in VR), and
  Brescia-Zapata et al. (eye-tracking of 360° subtitles).
- **Game Accessibility Guidelines** (gameaccessibilityguidelines.com). The site refused the connection
  (ECONNREFUSED), so it was not verified.
- **Meta Quest help pages** ("Screen reader on Meta Quest", "Learn about accessibility features for Meta Quest",
  "Text-to-speech on Meta Quest"). These render client-side and returned no body text. Search snippets say the
  screen reader needs Touch controllers and that text-to-speech works only in Horizon UI and some 2D apps, not in
  immersive apps. These claims were not read on the pages themselves and are not used above. The older "Raise
  View" (+0.4 m) feature is also unverified.
- **Apple Voice Control on Vision Pro.** The accessibility overview page lists "Perform actions with sounds, your
  eyes, your voice, or face gestures" but does not name Voice Control, so Voice Control is not claimed.
- **Microsoft HoloLens Narrator.** No HoloLens-specific page was found.
- **XR Access "Hibernation".** The notice was seen on xraccess.org, but its date and meaning were not confirmed.
- **Other candidates not checked:** South et al. 2024 "Barriers to Photosensitive Accessibility in Virtual
  Reality" (CHI, https://doi.org/10.1145/3613904.3642635; only the metadata was seen). Yin et al. "Inclusive
  Immersion: Barriers to Enjoyment and Emerging Design Principles..." (UAIS; not looked up).
