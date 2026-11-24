# Part G: Assistance already in XR

Compiled 2026-11-24 for the column "3D GUI agents". Each academic entry was checked against a primary
record. DOIs were resolved through the OpenAlex works endpoint, which returned title, authors, venue and
abstract. arXiv-only entries were checked on their arXiv abs pages, and numbers were taken from the arXiv
HTML full text where noted. For Kao et al. (G02), numbers come from the authors' PDF
(people.csail.mit.edu). Product entries cite official pages only (apple.com newsroom, support.apple.com,
about.fb.com, blog.google, developer.android.com, Samsung's press site). Dates are the dates printed on
those pages. Meta's help-center and meta.com blog pages render client-side and could not be read, so
claims that rest only on them are listed under "Unverified". Every number below comes from text that was
actually read. Where two parts of one source disagree, the note says so.

## 1. Works and sources

| ID | Title | First author et al. / organization | Venue / status | Year | Link | Contribution (one line) | Relevance to 3D GUI agents (one line) |
|---|---|---|---|---|---|---|---|
| G01 | User Onboarding in Virtual Reality: An Investigation of Current Practices | Edwige Chauvergne, Martin Hachet, Arnaud Prouzeau | ACM CHI 2023 | 2023 | https://doi.org/10.1145/3544548.3581211 (HAL: https://hal.science/hal-04009287) | 21 ergonomic reviews of VR tutorials and 15 interviews with VR onboarding experts, which lead to a conceptual framework for VR onboarding. | Documents that learning how to interact is a separate, costly phase in VR, and that phase is what a guiding agent would replace or shorten. |
| G02 | Evaluating Tutorial-Based Instructions for Controllers in Virtual Reality Games | Dominic Kao, Alejandra J. Magana, Christos Mousas | PACM HCI 5 (CHI PLAY), Art. 234 | 2021 | https://doi.org/10.1145/3474661 | Content analysis of 50 VR games plus four online experiments (433 retained participants with their own headsets) comparing Text, Text+Diagram and Text+Spatial (controller tooltip) tutorials. | Spatially anchored help works in some apps and not in others, so a guiding agent must choose its help modality per app. |
| G03 | Comparative effectiveness of augmented reality in object assembly | Arthur Tang et al. | ACM CHI 2003 | 2003 | https://doi.org/10.1145/642611.642626 | 3D instructions registered on the work pieces cut assembly errors by 82% compared with a printed manual and two computer-assisted conditions, and lowered mental effort. | The founding evidence that in-situ, step-by-step overlays beat separate instructions. A guiding agent inherits this format. |
| G04 | XAIR: A Framework of Explainable AI in Augmented Reality | Xuhai Xu et al. (Meta Reality Labs) | ACM CHI 2023 | 2023 | https://doi.org/10.1145/3544548.3581500 (arXiv: https://arxiv.org/abs/2303.16292) | Framework for when, what and how to explain AI output in AR. Built from a literature review, a survey of 500+ end users and workshops with 12 experts. Checked with 10 designers and 12 end users. | An agent that acts in a headset must explain itself. XAIR gives the design rules for those explanations. |
| G05 | GazePointAR: A Context-Aware Multimodal Voice Assistant for Pronoun Disambiguation in Wearable Augmented Reality | Jaewook Lee et al. | ACM CHI 2024 | 2024 | https://doi.org/10.1145/3613904.3642230 (arXiv: https://arxiv.org/abs/2404.08213) | HoloLens 2 assistant that uses gaze, pointing and conversation history to resolve "this/that" in spoken queries. Lab study N=12 plus a five-day first-person diary study. | Shows how gaze and pointing pick the referent of a command, which a 3D GUI agent needs for "open this", "move that". It only answers and does not act. |
| G06 | G-VOILA: Gaze-Facilitated Information Querying in Daily Scenarios | Zeyu Wang et al. | PACM IMWUT 8(2), Art. 78 | 2024 | https://doi.org/10.1145/3659623 (arXiv: https://arxiv.org/abs/2405.07652) | Combines gaze, visual field and voice for querying. Enactment study (21 participants, 3 scenarios) found ambiguous query language and a gaze-voice coordination pattern. A proof of concept beat a no-gaze baseline (16 participants). | Gaze is a cheap, strong intent signal for an XR agent that ordinary 2D GUI agents do not have. |
| G07 | XaiR: An XR Platform that Integrates Large Language Models with the Physical World | Sruti Srinidhi, Edward Lu, Anthony Rowe | IEEE ISMAR 2024 (Best Student Paper) | 2024 | https://doi.org/10.1109/ISMAR62088.2024.00091 | Split architecture: MLLM on a server, 3D processing and pose on the headset. A cognitive assistant for coffee making or furniture assembly reached over 90% task-guidance accuracy and 85% anchoring accuracy (15 participants). | A reference system design for an XR agent's perception loop (frames + pose to server, anchored output back). |
| G08 | Satori: Towards Proactive AR Assistant with Belief-Desire-Intention User Modeling | Chenyi Li et al. | ACM CHI 2025 | 2025 | https://doi.org/10.1145/3706598.3714188 (arXiv: https://arxiv.org/abs/2410.16668) | Proactive AR guidance for physical tasks that models the user's belief, desire and intention with a multimodal LLM. Matched designer-made Wizard-of-Oz systems in a 16-participant within-subject study. | A model of when to step in without being asked, which a guiding 3D GUI agent needs. |
| G09 | VRCopilot: Authoring 3D Layouts with Generative AI Models in VR | Lei Zhang et al. | ACM UIST 2024 | 2024 | https://doi.org/10.1145/3654777.3676451 (arXiv: https://arxiv.org/abs/2408.09382) | Mixed-initiative VR layout authoring with manual, scaffolded (wireframe) and automatic creation. Scaffolded creation gave more agency than automatic creation. | Evidence on how much users want an AI to act for them in VR: full automation lowered the sense of agency. |
| G10 | RAVEN: Realtime Accessibility in Virtual ENvironments for Blind and Low-Vision People | Xinyun Cao et al. | ACM CHI 2026 | 2026 | https://doi.org/10.1145/3772318.3791616 (arXiv: https://arxiv.org/abs/2510.06573) | An LLM receives a semantic scene graph of a Unity scene and generates and runs C# code to answer queries or modify the scene. 8 BLV users: 75.3% of 336 prompts succeeded, with a mean response time of 3.1 s. | One of the few XR assistants that acts on the virtual environment. It acts through a scene graph and code, not through the GUI. |
| G11 | GUI-World: A Video Benchmark and Dataset for Multimodal GUI-oriented Understanding | Dongping Chen et al. | ICLR 2025 | 2025 | https://arxiv.org/abs/2406.10819 | GUI video benchmark with six scenarios, one of them XR (393 videos, e.g., Apple Vision Pro GUIs). Strong MLLMs score lowest on XR free-form questions. | The first GUI-agent benchmark found that includes XR. It measures understanding only, not acting. |
| G12 | Grounded GUI Understanding for Vision-Based Spatial Intelligent Agent: Exemplified by Extended Reality Apps (Orienter) | Shuqing Li et al. | arXiv preprint (v4, 2025-10-01) | 2024–2025 | https://arxiv.org/abs/2409.10811 | Zero-shot, context-sensitive detection of interactable GUI elements in VR app screenshots (100 Steam VR apps, 1,552 frames, 4,470 annotations). Beats 2D GUI detectors and direct LMM prompting. | The most direct "XR GUI agent" perception work found: it treats a VR frame the way a 2D GUI agent treats a screenshot. |
| G13 | Harnessing large language models for virtual reality exploration testing: a case study | Zhenyu Qi et al. | Automated Software Engineering 33, 7 (2026), online 2025 | 2025 | https://doi.org/10.1007/s10515-025-00535-3 (arXiv: https://arxiv.org/abs/2501.05625) | GPT-4o field-of-view analysis for VR testing. Prompt engineering raised entity identification from 41.67% to 71.30%. Matching the same entity across views reached F1 0.70. The model failed to label entities. | Shows what a VLM can and cannot read from a VR view, the first step of any agent that operates a VR app. |
| G14 | VisionClaw: Always-On AI Agents through Smart Glasses | Xiaoan Liu et al. | arXiv preprint | 2026 | https://arxiv.org/abs/2604.03486 | Ray-Ban Meta camera and microphone stream to Gemini Live. Function calls go to OpenClaw agents (browser, email, calendar, smart home). Lab study N=12 plus an in-the-wild deployment. | The clearest research example of glasses that see and then act through software agents. It acts on phone and web services, not on the glasses' own UI. |
| G15 | Apple Vision Pro: Apple Intelligence (visionOS 2.4) and Siri AI with Visual Intelligence (visionOS 27) | Apple | Official newsroom and Apple Vision Pro User Guide | 2025–2026 | https://www.apple.com/newsroom/2025/03/apple-intelligence-comes-to-apple-vision-pro-today-with-visionos-2-4/ ; https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/ ; https://support.apple.com/guide/apple-vision-pro/get-started-with-siri-ai-tan1a7f30d92/visionos ; https://support.apple.com/guide/apple-vision-pro/find-info-and-get-things-done-tan462de531e/visionos ; https://support.apple.com/guide/apple-vision-pro/siri-ai-use-visual-intelligence-tanee58a6e66/visionos | Writing and image tools (2025-03-31). Then, announced 2026-06-08: Siri AI with onscreen awareness, systemwide app actions, gaze-to-invoke and Visual Intelligence on Vision Pro (beta). | The first-party assistant that sees windows and surroundings. Its documented actions go through app actions, not arbitrary UI. |
| G16 | Use Voice Control to interact with Apple Vision Pro | Apple | Official Apple Vision Pro User Guide (visionOS 27 pages) | 2026 (living page) | https://support.apple.com/guide/apple-vision-pro/perform-actions-with-your-voice-tan14d179ad1/visionos | "Show names / numbers / grid" overlays and commands such as "Tap [number]", "Long press [number]", "Swipe up at [number]". | A shipping accessibility channel that can address any UI element, the same action space a GUI agent would need. |
| G17 | Meta AI on Meta Quest (announcement) | Meta | about.fb.com newsroom, 2024-07-23 (updated 2025-01-27) | 2024 | https://about.fb.com/news/2024/07/meta-ai-is-now-multilingual-more-creative-and-smarter/ | Meta AI replaces Voice Commands on Quest, "allowing you to control your headset hands-free". Meta AI with Vision answers questions about the physical surroundings seen in Passthrough. Experimental rollout in the US and Canada. | A headset assistant that both answers and issues system commands, but whose vision covers the physical room. |
| G18 | Ray-Ban Meta glasses: new AI features (no more "look and", video for continuous help, reminders, live translation) | Meta | about.fb.com newsroom, 2024-09-25 | 2024 | https://about.fb.com/news/2024/09/ray-ban-meta-glasses-new-ai-features-and-partner-integrations/ | Questions about what you see no longer need "look and". Meta announced video in Meta AI for continuous real-time help (later shipped as "live AI"). | The camera-first glasses assistant. It answers and captures, with no UI to operate. |
| G19 | Meta Ray-Ban Display: AI Glasses With an EMG Wristband | Meta | about.fb.com newsroom, 2025-09-17 (updated 2025-09-30) | 2025 | https://about.fb.com/news/2025/09/meta-ray-ban-display-ai-glasses-emg-wristband/ | In-lens display, Meta AI that shows answers and "step-by-step how-tos", and the Meta Neural Band (EMG): swipe, pinch, wrist-rotate. $799 including the band. | The first mass-market glasses with a real GUI to operate. Meta AI guides users step by step on that display. |
| G20 | Android XR: The Gemini era comes to headsets and glasses; A new look at how Android XR will bring Gemini to glasses and headsets | Google (Shahram Izadi) | blog.google, 2024-12-12; I/O 2025 post (page undated, refers to I/O 2025) | 2024–2025 | https://blog.google/products/android/android-xr/ ; https://blog.google/products/android/android-xr-gemini-glasses-headsets/ | Announced Android XR with Gemini that can "have conversations about what you're seeing or control your device", later "understanding what you're seeing and taking actions on your behalf". | The first XR platform pitched with an assistant that controls the device. |
| G21 | Introducing Galaxy XR, the first Android XR headset; Samsung "Introducing Galaxy XR: Opening New Worlds" | Google (Shahram Izadi); Samsung Electronics | blog.google (page undated); Samsung press release dated 2025-10-22 (Seoul), on sale 2025-10-21 (US) | 2025 | https://blog.google/products/android/samsung-galaxy-xr/ ; https://www.samsungmobilepress.com/press-releases/galaxy-xr-opening-new-worlds/ | Gemini Live "can better understand what you're seeing and doing" and can "take action on your behalf across your apps". "Hey Google, organize these windows" makes Gemini arrange open windows. Circle to Search works on virtual and real objects. | The closest shipping product to a 3D GUI agent: it sees the mixed scene and is claimed to act on apps and on the window layout. |
| G22 | Intelligent eyewear with Gemini is coming this fall (I/O 2026); Integrate with the Gemini Live API for audio glasses and display glasses | Google (Shahram Izadi); Android Developers | blog.google, 2026-05-19; developer.android.com (living page) | 2026 | https://blog.google/products-and-platforms/platforms/android/android-xr-io-2026/ ; https://developer.android.com/develop/xr/jetpack-xr-sdk/gemini-live | Audio glasses with Gemini that can "execute tasks on your behalf". "Gemini Intelligence handles multi-step tasks in the background", for example a DoorDash order, with the user confirming the final order. Developers expose app functions to Gemini through `FunctionDeclaration`. | 2026 agentic features on glasses act through phone apps and declared functions, not by operating a spatial GUI. |

## 2. Deep notes

### G02: Kao et al. 2021, tutorials for VR controllers (onboarding)

**Problem.** VR games must teach controller mappings to players who cannot see their real hands or
controllers. Developers mostly design tutorials from intuition and examples. The paper asks which tutorial
modality works: plain text, text with a controller diagram, or text with tooltips attached to the virtual
controllers ("Text+Spatial").

**Method.** First, a directed content analysis of 50 popular VR games (list from mid-2019), coded by three
researchers over five rounds until consensus. Second, four between-subjects experiments, each using a
different VR game (a third-person shooter, a puzzle game, a wave shooter and a rhythm game), comparing
Text, Text+Diagram and Text+Spatial. Participants were Amazon Mechanical Turk workers who had to prove they
owned an Oculus Rift or HTC Vive. Measures included controls learnability, performance, player experience,
intrinsic motivation and mental load.

**Data and results.** Content analysis: 90% of the games had a tutorial level, 40% had embedded help
(loading-screen hints, hints on walls, just-in-time cues), 88% used text help, 56% used diagrams or images,
and 22% labelled the player's virtual controllers. After screening, 433 participants were retained. In the
third-person shooter, Text+Spatial gave significantly higher controls learnability than Text and
Text+Diagram, and higher performance, player experience and intrinsic motivation than Text. In the puzzle
game, Text+Spatial gave higher learnability and performance than Text, and Text+Diagram gave higher
learnability than Text. In the wave shooter and the rhythm game, differences were negligible on all
measures. The authors conclude that game type decides how much tutorial modality matters.

**Limitations.** Remote, self-run study with crowd workers who already own headsets. The authors note that
this sample is male-skewed and that its spatial ability may differ from lab samples. Only games, only
controllers (no hand tracking, gaze or voice), and only one-shot tutorials, not help on demand later.

**Transfers to agents.** A guiding agent can attach its help to the thing being learned (the controller,
the hand, the target widget), which is the format that won where modality mattered. The 22% figure shows
that most shipped help is still text, so an agent that renders spatial cues on demand fills a real gap.
Combined with G01 (21 tutorial reviews, 15 expert interviews), onboarding is a known, separate cost of VR
use.

**Does not transfer.** Learning a motor mapping (which button, which pinch) cannot be done by an agent on
the user's behalf. The agent can only guide or remove the need for the skill (e.g., by voice). Results are
game-specific, and no condition included adaptive or conversational help.

### G12: Orienter, grounded GUI understanding for XR apps (the closest XR GUI-agent work)

**Problem.** An agent that operates or tests a VR app must first find which things in the 3D view are
interactable GUI elements (IGEs). 2D detectors trained on mobile or desktop UIs fail because XR elements
are open-vocabulary (any object can be a control), their interactability depends on context (a tree may be
a control in one app and scenery in another), and multimodal models localize poorly and hallucinate.

**Method.** Zero-shot pipeline on single 2D right-eye frames (960×540). Module I: an LMM reads the app's
store page and the frame to build global and local context. Module II: an LMM describes candidate
elements, an open-vocabulary grounding model (APE) localizes them, and a reflection loop (zoom-and-compare,
region-wise checks, an LMM "advisor") decides whether to iterate. Module III: chain-of-thought
classification of interactability using the context. LMMs tried: GPT-4V, GPT-4o, Claude 3.5 Sonnet and
Gemini 1.5 Pro. Output per element: bounding box, open-vocabulary label and an interactable flag.

**Data and results.** 100 VR-only Steam apps sampled from 4,610. 1,552 frames recorded by 13 annotators.
4,470 interactable annotations in 766 semantic categories. On the genre split at IoU 0.75, interactability
F1 was 46.00% for Orienter (Gemini 1.5 Pro) against 29.32% for the best baseline (CenterNet2). Direct LMM
prompting did poorly, mainly because of localization errors. Orienter-guided black-box testing reached 0.83
element coverage against 0.65 for random testing. The abstract and the body report different percentage
gains for testing, so only the raw values are given here.

**Limitations.** Single frames, with no depth, no stereo and no history. Interactability is labelled by
annotators, which brings subjectivity. Applications with unusual interaction paradigms may not generalize.
The testing evaluation is a simplified simulation, and nothing is executed on a real headset by a policy.

**Transfers to agents.** It is the perception half of a 3D GUI agent: a "set-of-marks" over a VR frame
built from app context, grounding and self-checking. App-store text as context is a cheap trick a headset
agent could reuse. The low absolute F1 (46%) quantifies how far XR perception is behind 2D GUI grounding.

**Does not transfer.** It detects elements but does not act, and it has no notion of gaze/pinch targeting,
depth, or elements behind the user. It works on PC VR game frames, not on system UIs (launchers, settings,
windows) of visionOS, Horizon OS or Android XR, which is where an assistant for everyday headset use would
operate.

### G21 (with G20, G22): Gemini on Android XR, the closest shipping assistant

**Problem.** Google positions Android XR as the first XR platform built around an assistant. The question
for this column is what Gemini on Galaxy XR is documented to perceive and to operate.

**Method (as described officially).** Galaxy XR (on sale 2025-10-21 in the US) tracks head, hands and
eyes and has six microphones (Samsung release). Input is "voice, hands and eyes", plus an optional
keyboard and mouse (Google blog). Gemini is invoked with "Hey Google". Samsung says it "understands users'
surroundings by seeing what they see and hearing what they hear" and that Gemini is integrated "at the
system level".

**Data and results (official claims, no measurements).** Google's Galaxy XR post says that Gemini Live
"can better understand what you're seeing and doing" and can "take action on your behalf across your apps
— with just a conversation". It names one concrete operation on the spatial GUI: "just say, 'Hey Google,
organize these windows,' and Gemini will instantly arrange them into a neat layout." Other examples are
answering questions about videos, photos and games, explaining a landmark in Google Maps, and Circle to
Search on "a virtual object — or a real-world item in your room". Samsung adds navigation in Google Maps,
finding content in YouTube and in-game coaching. The 2024 announcement (G20) had already promised that
users can "control your device" and that Gemini can "guide you through tasks". The 2025-12-08 Android
Show update (https://blog.google/products/android/android-show-xr-edition-updates/) describes gameplay
tips and glasses features, but no new on-device actions. At I/O 2026 (G22),
the agentic claims moved to glasses: Gemini can "execute tasks on your behalf", and "Gemini Intelligence
handles multi-step tasks in the background", with the DoorDash example ending at "the final order
confirmation" done by the user. On glasses, developers expose app capabilities through Gemini Live API
`FunctionDeclaration`s. The developer page warns that the API needs a persistent connection, has
concurrency limits, and "might not be ideal for handling error conditions".

**Limitations.** No official page found lists which apps or which UI actions Gemini can perform on Galaxy
XR, how it acts (app functions vs. accessibility vs. pixels), its success rate, or how it confirms risky
actions. No support page with a capability list was found. All evidence is marketing text.

**Transfers to agents.** It confirms the product direction: an assistant with access to the mixed
scene (passthrough + windows) that both explains and acts, including one genuinely spatial action (window
layout). The function-declaration route on glasses is the API-agent counterpart of a GUI agent.

**Does not transfer.** Nothing documented shows Gemini clicking arbitrary controls inside third-party XR
apps, operating 3D content in immersive apps, or teaching the user a gesture. "Organize these windows" is a
system-level layout command, not general GUI operation.

## 3. Assistants on shipping devices

| Device | Assistant | Perceives | Can operate | Cannot operate (as documented) | Source ID, date |
|---|---|---|---|---|---|
| Apple Vision Pro (visionOS 27) | Siri AI (beta) with Visual Intelligence | Speech; onscreen content ("Ask Siri about something in your view—like a webpage"); objects in surroundings or windows by looking at them. The capture method is not stated. | App-specific actions in the guide's examples (message, playlist, groceries, alarm, meeting), Environments ("Open this Environment", "Make it daytime"), accessibility toggles ("Turn on VoiceOver / Voice Control"), "systemwide app actions" (newsroom) | The guide documents no general "change any setting" or "press any button" ability. Visual Intelligence returns facts and tappable buttons, and the user taps them. Beta, 6 languages, not in mainland China or for users under 13, daily usage limits for server-side features. | G15, 2026-06-08 (newsroom); support pages are for visionOS 27 |
| Apple Vision Pro | Voice Control (accessibility) | Speech; the system's UI element tree (names, numbers) | Any element that has a name or number, and grid cells for the rest: tap, long press, swipe, double tap; "Go home", "Open Control Center" | Commands only. It does not plan or understand goals, and the user must name each step. | G16, living page (visionOS 27) |
| Apple Vision Pro (visionOS 2.4) | Apple Intelligence (writing and image tools) | Text and photos inside apps | Writing Tools, Image Playground, Genmoji, Smart Reply, summaries | No device control. U.S. English only at launch. | G15, 2025-03-31 |
| Meta Quest 3 / 3S (and other Quest models for the voice part) | Meta AI ("Hey Meta"), replacing Voice Commands | Speech; with Vision, the physical room seen in Passthrough | "control your headset hands-free", plus answers and real-time information | Experimental in the US and Canada at launch. Recognition of virtual objects and app UIs is not documented (see Unverified). | G17, 2024-07-23 |
| Ray-Ban Meta glasses | Meta AI; live AI | Speech; camera (no "look and" needed) | Photos and video, reminders, live translation, continuous video help | There is no GUI to operate. The page documents no app control on the glasses beyond these features. | G18, 2024-09-25 |
| Meta Ray-Ban Display + Neural Band | Meta AI with visual answers | Speech; camera; EMG gestures | Shows answers and "step-by-step how-tos". The user steps through them by thumb swipe. Messages, video calls, walking navigation (beta), captions and translation | Meta AI is not documented as operating the display UI for the user. The user drives the UI with swipe, pinch and rotate gestures. Handwriting is "near future". | G19, 2025-09-17 |
| Samsung Galaxy XR (Android XR) | Gemini / Gemini Live ("Hey Google"), Circle to Search | Speech; "what you're seeing and doing" (passthrough and app content); head, hand and eye tracking | "take action on your behalf across your apps"; "organize these windows"; Maps navigation, YouTube search, game coaching | No public list of supported actions or apps, and no documentation of acting inside immersive third-party apps | G20 2024-12-12; G21 2025-10-21/22 |
| Android XR audio glasses (announced I/O 2026; display glasses later) | Gemini, Gemini Intelligence | Speech; camera; location and heading | Calls, texts, message summaries, music, photos, translation, multi-step phone-app tasks in the background (user confirms the final order); third-party functions via Gemini Live API | No display on audio glasses. The developer page warns the Live API may not suit error handling on audio glasses. | G22, 2026-05-19 |

## 4. Facts and numbers

- 21 VR tutorial ergonomic reviews and 15 expert interviews underlie the VR onboarding framework [G01, https://doi.org/10.1145/3544548.3581211].
- Of 50 popular VR games, 90% had a tutorial level, 40% had embedded help, 88% used text help, 56% used diagrams or images, and 22% labelled the virtual controllers [G02, https://doi.org/10.1145/3474661].
- Four tutorial experiments retained 433 crowd participants who owned a Rift or Vive. Text+Spatial helped in a shooter and a puzzle game, with negligible differences in a wave shooter and a rhythm game [G02, https://doi.org/10.1145/3474661].
- AR instructions overlaid on the work pieces reduced assembly error rate by 82% [G03, https://doi.org/10.1145/642611.642626].
- XAIR rests on a survey of 500+ end users and workshops with 12 experts, and was checked with 10 designers and 12 end users [G04, https://doi.org/10.1145/3544548.3581500].
- GazePointAR (HoloLens 2, gpt-3.5-turbo in v2) had about 7.5–7.9 s end-to-end latency. Lab SUS was 62.1 against 80.0 for Google voice assistant and 66.3 for Google Lens, while it was ranked highest for perceived intelligence. It answered 13 of 32 participant-invented queries satisfactorily. In the diary study, 20 of 48 queries were satisfactory [G05, https://arxiv.org/abs/2404.08213].
- G-VOILA: enactment study with 21 participants in 3 scenarios, and an evaluation with 16 participants against a no-gaze baseline [G06, https://doi.org/10.1145/3659623].
- XaiR: over 90% task-guidance accuracy and 85% AR-anchoring accuracy with 15 participants [G07, https://doi.org/10.1109/ISMAR62088.2024.00091].
- Satori: two formative studies with 12 experts. A 16-participant within-subject study found it comparable to designer-made Wizard-of-Oz systems [G08, https://doi.org/10.1145/3706598.3714188].
- RAVEN: of 336 prompts from 8 BLV users, 75.3% succeeded, 2.7% were correctly flagged out of scope and 22.0% failed (14 intent and 60 technical errors). Mean response time was 3.1 s and SUS 79.7 [G10, https://arxiv.org/abs/2510.06573].
- GUI-World XR scenario: 393 videos. GPT-4o scored 3.285 on XR free-form questions against 3.558–3.740 in the other scenarios [G11, https://arxiv.org/abs/2406.10819].
- Orienter: 100 VR apps, 1,552 frames, 4,470 annotations, 766 categories. Interactability F1 was 46.00% against 29.32% for the best baseline (IoU 0.75, genre split). Testing coverage was 0.83 against 0.65 for random testing [G12, https://arxiv.org/abs/2409.10811].
- GPT-4o entity identification in VR views rose from 41.67% to 71.30% with prompt engineering. Cross-view matching reached F1 0.70 [G13, https://doi.org/10.1007/s10515-025-00535-3].
- VisionClaw: tasks were 13–37% faster with 7–46% lower perceived difficulty than the baselines (N=12). Success rates were 85.4% for VisionClaw, 89.6% for Agent Only and 97.9% for Always-On Only. Deployment logs: 555 interactions, median latency 12.2 s, 3.2 tool calls per command [G14, https://arxiv.org/abs/2604.03486].
- Apple Intelligence reached Vision Pro on 2025-03-31 (visionOS 2.4), U.S. English only [G15, https://www.apple.com/newsroom/2025/03/apple-intelligence-comes-to-apple-vision-pro-today-with-visionos-2-4/].
- Siri AI on Vision Pro: invoke by "looking at it and starting to speak". Visual Intelligence lets users "ask Siri about things just by looking at them". Announced 2026-06-08 as a beta [G15, https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/].
- Meta AI on Quest was to "replace the current Voice Commands on Quest, allowing you to control your headset hands-free" [G17, https://about.fb.com/news/2024/07/meta-ai-is-now-multilingual-more-creative-and-smarter/].
- Meta Ray-Ban Display costs $799 including the Neural Band, and was on sale from 2025-09-30 at limited US retailers [G19, https://about.fb.com/news/2025/09/meta-ray-ban-display-ai-glasses-emg-wristband/].
- Galaxy XR: "Hey Google, organize these windows" makes Gemini arrange open windows [G21, https://blog.google/products/android/samsung-galaxy-xr/].

## 5. Open problems (the gap between today's assistants and a 3D GUI agent)

1. **Acting on the spatial GUI itself.** Shipping assistants act through app intents or functions
   (G15, G22) or through a few system commands (G17, G21's window layout). Only Apple's Voice Control
   (G16) reaches any UI element, and it has no planner. No shipping assistant is documented to press
   arbitrary controls in third-party XR apps.
2. **Perception of virtual content.** Research perception of XR GUIs is weak: interactability F1 is 46%
   (G12), VLM entity labelling fails (G13), and XR is the hardest GUI-World scenario (G11). Shipping
   "vision" features started with the physical room (G17), and only recently extended to window content
   (G15, G21).
3. **Referent resolution.** Gaze and pointing make "this/that" usable (G05, G06), but latencies of 7–12 s
   (G05, G14) are far above the time of a direct pinch.
4. **Guiding instead of doing.** Tutorials are still mostly static text (G02), and proactive guidance
   research targets physical tasks (G07, G08), not learning the headset UI. No system found teaches
   gestures or menu paths on demand.
5. **Agency and trust.** Users want scaffolded rather than fully automatic help (G09). They do not trust
   high-stakes actions without visual confirmation (G14). Explanations need design rules (G04). Shipping
   agentic flows keep a final confirmation step (G22).
6. **No benchmark for acting.** GUI-World measures understanding and Orienter measures detection. No
   benchmark found measures task success for an agent operating a headset UI.

## 6. Catalogue rows

| Operation | Techniques used today | Measured/reported difficulty (with source IDs) | Agent could: do it / guide / neither, and why |
|---|---|---|---|
| Find an app or environment and open it | Launcher by gaze+pinch or ray; voice ("Open this Environment" on Vision Pro, Meta AI system commands on Quest) | No quantitative measure found. Voice routes exist as documented (G15, G17), and onboarding is a known cost for novices (G01). | **Do it.** It is already partly shipped by voice. The gap is a referent like "open the one I used yesterday". |
| Change a setting buried in a menu | Settings app navigation; Voice Control overlays with numbers or a grid (G16); Siri only for documented toggles such as VoiceOver (G15) | No study found. Documented Siri examples cover few settings (G15). Voice Control needs one command per step (G16). | **Do it, with confirmation.** The action space (named or numbered elements) already exists in Voice Control. An agent adds the plan. |
| Learn a new controller mapping or gesture | Tutorial levels (90%), text (88%), diagrams (56%), controller tooltips (22%) (G02); Neural Band swipe, pinch and rotate (G19) | Text+Spatial helped only in some game types (G02). The onboarding framework comes from 21 reviews and 15 interviews (G01). | **Guide.** A motor skill cannot be delegated. An agent can show spatial cues on the hand or controller when needed, or offer a voice alternative. |
| Follow a multi-step procedure | In-situ AR overlays (G03); MLLM task guidance (G07); proactive BDI guidance (G08); step-by-step how-tos on the display (G19) | AR overlays cut errors by 82% (G03). Task guidance was over 90% accurate (G07). Proactive guidance matched Wizard-of-Oz systems (G08). | **Guide** for physical steps. **Do it** for purely virtual steps once GUI perception is reliable. |
| Find and use a control inside a 3D app | Direct manipulation; no assistant support documented | Interactability F1 46% (G12). VLM entity identification 71.30% at best (G13). XR is the lowest GUI-World free-form score (G11). | **Neither yet, reliably.** Perception is the bottleneck. Scene-graph access (G10) works only where the developer provides it. |

## 7. Figure/widget ideas

1. **Perceive × act map (static SVG).** The x-axis is what the assistant perceives (speech only → camera
   of the physical room → gaze + camera → window/screen content → scene graph or UI tree). The y-axis is
   what it can act on (answer only → fixed system commands → app intents/functions → any UI element → 3D
   scene content). Plot G05–G14 as research points and G15–G22 as product points. The empty upper-right
   region (sees virtual UI, acts on any element) is the 3D GUI agent.
2. **"Who presses the button?" widget (interactive, WebGL or Canvas).** A small 3D room with three floating
   windows and a hidden setting. The reader picks a help mode: static text tutorial, spatial tooltip
   (G02), Voice Control numbers overlay (G16), or "agent does it" (G21-style). The widget counts steps,
   gaze shifts and seconds, and shows where each mode fails (e.g., an element without a name gets a grid).

## 8. Unverified

- Meta Quest blog "Introducing Meta AI on Meta Quest" (https://www.meta.com/blog/meta-ai-on-meta-quest-3/):
  search-index excerpts say "Only physical objects seen through Passthrough are recognized by this
  experimental version" and that Quest 2 lacks the Vision feature. The page renders client-side and could
  not be read.
- Meta Quest help center (https://www.meta.com/help/quest/486179404363222/): search excerpts list example
  commands ("Take a photo", "Recenter my view", "Quit this game") and US/Canada availability. Not read
  directly.
- Ray-Ban Meta live AI help page (https://www.meta.com/help/ai-glasses/894093646030348/): search excerpts
  describe "Hey Meta, start live AI", interruptions and English-only rollout in the US and Canada. Live AI
  session length of about one to two hours appears only in non-English Connect 2025 recaps. Not read
  directly.
- Chauvergne et al. (G01): findings attributed to it by citing papers (instruction availability, corrective
  feedback, context-based learning) were not checked against the full text, which was blocked. Only the
  abstract was read.
- VisionClaw (G14): the abstract summary mentioned a five-person deployment, while the HTML body reports
  four author-participants. The body figures are used above.
- Orienter (G12): percentage gains for testing differ between the abstract and the body. Raw values are
  used above. The venue, if any, is not confirmed.
- Apple Siri AI status: Apple's own pages differ on whether visionOS 27 Siri AI is a beta or rolling out
  generally. The support pages read on 2026-11-24 say beta.
- Items searched for and not found as named: "SensAI", "VR GPT", an "XR GUI agent" benchmark that measures
  acting on headset UIs. Found but not checked: ClickAIXR (arXiv 2604.04905), GenXR-Bench (arXiv
  2610.29014, a coding-agent benchmark), "A Benchmarking Framework for Context-aware XR Interfaces" (arXiv
  2609.30466), VRScout (arXiv 2511.00002), and "Teaching LLMs to See and Guide" (arXiv 2511.00730, checked
  on arXiv but left out of the table for space).
- VirtualNexus (UIST 2024, https://doi.org/10.1145/3654777.3676377) was verified but left out: it is an
  AR/VR collaboration system, not an assistant.
- LLMR (CHI 2024) is covered in Part C (C28) and is not repeated here.
