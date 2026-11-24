---
layout: post
title: "3D GUI agents: a research vision for operating the interfaces of VR, AR and MR for the user"
date: 2026-11-24 12:01:00+0900
description: "Why the 3D interfaces of headsets and XR glasses are hard to operate, and the research direction this column proposes: agents that operate the spatial GUI on the user's behalf, or guide the user through it."
categories: 3d-gui-agent
tags: [gui-agent, xr, vr, mixed-reality, 3d-user-interfaces, accessibility, research-vision]
series: 3d-gui-agent
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## Why this matters

Phones did not become everyday devices only because they are useful. They also became easy to operate: one flat screen in the hand, a tap on what you see, a keyboard that most people can use at 36 words per minute. In the last three years a second change happened on top of that. **GUI agents**, AI models that read a screen and tap, type and scroll for a user, learned to operate phones, desktops and websites; on the desktop benchmark OSWorld they went from 12% of tasks in April 2024 to above the human baseline in December 2025 ([post 2]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }})). A person can now say what they want and let an agent work through the interface.

Headsets and XR glasses have had neither moment. Their interfaces are spatial: windows float around the user, buttons sit at different depths, menus are opened with gestures that have to be learned, and text is typed in mid-air. Operating them is measurably slower, less accurate and more tiring than operating a phone ([post 3]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }})). And no agent has been shown to operate them for the user in the way phone agents do ([post 4]({{ '/blog/2026/3d-gui-agent-04-agents-in-xr-and-the-gap/' | relative_url }})).

This column proposes to bring the two together: a **3D GUI agent** that operates the spatial interface of a VR, AR or MR device for the user, or guides the user through it. This post states the idea, defines it, argues for it with the evidence collected in posts 2 to 4, says honestly what it can and cannot do, and lists the open questions. **This post fixes the direction as of November 2026.** It describes a research direction, not a result: we have no system and no numbers of our own to report yet.

## Prerequisites

- What a GUI agent is (observe, ground, act, verify; task success on a benchmark). [Post 2]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }}) explains it from scratch.
- Basic 3D interaction vocabulary (ray pointing, gaze and pinch, windows and volumes in space). [Post 3]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }}) covers it with numbers.
- Nothing else. This post is the entry point of the column and keeps the technical detail light; the three survey posts carry the depth.

## 1. What we mean by a 3D GUI agent

### 1.1 The definition

> We call a *3D GUI agent* an agent that takes a user's request, in speech or text and optionally with pointing, perceives the spatial user interface of a VR, AR or MR device, and either operates that interface on the user's behalf or guides the user through it.

Four parts of this sentence carry weight.

1. **The goal comes from the user, in language.** "Open the browser", "bring the music player here", "turn on the setting that stops the boundary from showing". Pointing, gaze and head direction can complete the sentence: "put *that* over *there*" only makes sense together with where the user is pointing. The goal is not inferred from coverage targets (as in automated testing) or from a game's reward.
2. **The agent perceives the spatial user interface (spatial UI)**: windows, panels, volumes, menus and widgets placed around the user in 3D, seen through the rendered view and, where the platform allows it, through UI structure (a scene graph or an accessibility tree). It perceives *the interface*, not mainly the physical room.
3. **It acts in one of several ways.** It can operate the interface itself (select, press, grab, move, resize, type, navigate menus and apps); it can guide the user (explain, highlight, coach); and it can ask when the request is ambiguous or the step is consequential. Section 6 treats these modes as a spectrum.
4. **It is judged by task success on interfaces it did not author.** An agent that changes the virtual world through the engine of its own app is solving a different problem. The test of a 3D GUI agent is whether it completes users' requests on the interfaces of existing apps and of the system, as phone agents are tested on apps they did not write.

We do not claim that the term or the idea has never been used. The arXiv title of Orienter (Shuqing Li et al., published at FSE 2026) already speaks of a "Vision-Based Spatial Intelligent Agent" for XR apps, and vendors already describe assistants that act on headsets (section 7). What this column contributes is a precise problem statement, a motivation, and a research program around it.

### 1.2 The loop, on a phone and on a headset

A phone GUI agent runs a loop: **observe** the screen, **ground** the next step on an element ("the Share button" becomes a location), **act** (tap, type, swipe), and **verify** that the screen changed as expected. A 3D GUI agent runs the same loop, but each box changes, as the figure shows.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/01-loop-2d-vs-3d.svg" localized="true" caption="The GUI-agent loop on a phone (left) and on a headset (right). The four stages are the same; the notes in orange say what changes in 3D. The observation depends on where the user's head points, a target is an object in space that may be occluded or behind the user, actions are rays, pinches and 6-DoF poses instead of taps, and verification must account for content that moved while the agent was thinking. The red channel to the user (ask, confirm, take over) exists on both sides, but in a headset the user is inside the interface while the agent works." %}

### 1.3 What is in scope, and what is not

A useful definition says what it excludes. These are the boundaries we draw, each with its reason.

**In scope:**

- **2D panels placed in 3D.** Most of what people do on a headset happens in flat windows: a browser, a settings panel, a mail app, often 2D Android apps running unmodified as panels. Their content is a 2D GUI, but finding them, reaching them and arranging them is a 3D problem.
- **The spatial system UI.** Launchers, quick settings, the window manager, the recentre and boundary controls, the system keyboard: the layer every user has to operate, and the one where buried settings live.
- **3D widgets and volumes.** Sliders and dials in space, 3D models to rotate or scale, volumetric apps whose controls are objects rather than buttons.
- **The UI of immersive apps, when the task is an interface operation.** Changing a setting inside a VR app, opening its menu, selecting an item in its inventory screen. The line is the task, not the app: operating the app's interface is in scope, playing the app is not.
- **Multi-app tasks.** "Put the recipe next to the timer and start a 10-minute countdown" spans two apps and the window layer, like the cross-app tasks that 2D benchmarks found hardest.

**Out of scope:**

- **Generating XR content** (LLMs that build or edit scenes, such as LLMR at CHI 2024). The agent changes the world through the engine; it does not operate an interface made by someone else.
- **Guidance for physical tasks** (assembling furniture, repairing a machine with AR instructions, as in Guided Reality at UIST 2025). The object of the task is the real world, not the GUI, although its visual vocabulary of arrows and highlights is useful for our guide mode.
- **Answering questions about the view** (GazePointAR at CHI 2024, glasses assistants). Answering is perception and dialogue without action; it is a component, not the goal.
- **Automated testing** (VRExplorer, XRintTest, Meta XR Operator used by coding agents). These systems drive VR apps very effectively, but their goal is coverage of all interactions, not one user's request; we reuse their machinery, not their problem.
- **Gameplay.** Playing for the user removes the reason the user is there; a study of AI companions in VR games found that autonomous agent play lowered workload but hurt challenge, autonomy, immersion and enjoyment (Taiyu Zhang et al., arXiv 2609.13727, 2026).
- **Display-free glasses** (camera-and-audio AI glasses). They have no spatial GUI to operate; their assistants act through services and APIs. Glasses with a display, and XR glasses that show windows, are in scope.

## 2. Why 3D interfaces are hard to operate

[Post 3]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }}) collects the evidence in detail. The short version:

> Operating a 3D interface has measured costs that a phone does not have: slower and less accurate pointing in depth, mid-air text entry at roughly half of phone typing speed, arm fatigue, and novices who do not know which action to take.

Each cost has a source:

- **Pointing in depth.** On a stereo display, virtual-hand movements along the viewing direction were about 25% slower than lateral ones, with about 20% lower throughput, well beyond what the change in visual size explains (Barrera Machuca and Stuerzlinger, CHI 2019). With gaze and pinch on a Quest Pro, selection also slows down with depth (Bashar et al., arXiv 2607.27369, to appear in IEEE TVCG / ISMAR 2026).
- **Selection errors.** In a field study in a car (Varjo XR-3, N = 24), 8.8 to 23.5% of selections failed with the car standing still and 20.4 to 36.0% while it was moving, depending on the technique (Sasalovici et al., CHI 2025). With ray selection at 8 m on a Quest 3, 15.2% of selections failed with a controller and 32.9% with a bare hand, mostly because the confirm action itself moved the ray (Qiu et al., arXiv 2602.01061, accepted to IEEE TVCG / IEEE VR 2026 according to the authors). On a phone, 37,370 people typing left 2.3% of errors uncorrected (Palin et al., MobileHCI 2019).
- **Text entry.** Phone typing averaged 36.2 words per minute (wpm) in the same study. On a virtual keyboard in VR, the fastest of six selection methods, pointing with a controller, reached 15.44 wpm (Speicher et al., CHI 2018), and the mean over 137 XR text-entry techniques with a reported speed is 20.36 wpm (Bhatia et al., CHI 2025): roughly half of phone speed, or less.
- **Arm fatigue.** Mid-air input holds the arm against gravity; Consumed Endurance (Hincapié-Ramos et al., CHI 2014) made this "gorilla-arm" cost measurable and showed that it appears even when time and errors do not differ. Bare-hand ray selection puts the hand 14.3% higher and 66.2% further forward than a controller (Luong et al., IEEE TVCG 2023), and Apple's guidelines reserve direct touch for infrequent use.
- **Not knowing what to do.** Observing 25 novices with four consumer AR apps, Khurana et al. (IMWUT 2023) found that most errors occurred when participants could not determine the correct sequence of actions or could not evaluate what their action had done. These are failures of knowledge, not of motor control, and an agent that knows the interface addresses exactly them.

The figure puts the main numbers side by side.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/01-operating-cost.svg" localized="true" caption="Measured operating costs on headsets against the phone, each bar labelled with its source. (a) Text entry: the phone mean (Palin et al. 2019) against the fastest VR virtual-keyboard method (controller pointing, Speicher et al. 2018) and the mean over 137 XR techniques (Bhatia et al. 2025). (b) Selection error rates: ranges across techniques in a car standing still and moving (Sasalovici et al. 2025) and ray selection at 8 m (Qiu et al. 2026), against 2.3% uncorrected errors in phone typing. The comparisons are across studies and tasks, so read them as orders of magnitude, not as exact ratios." %}

Two further costs come from the space itself. **Content can be anywhere.** A window can be behind the user, hidden behind another window, or left in another room, and the user has to turn around or recentre to find it; the platforms leave this to the user's head and hands (post 3, section 3.4). And **the view changes with every head movement**, which matters as much for an agent that sees what the user sees as for the user. The next figure, and the widget in section 5, make this concrete.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/01-where-is-the-ui.svg" localized="true" caption="Top-down sketch of a user surrounded by five windows (conceptual layout, not taken from any study or benchmark). The purple wedge is the field of view at one moment. Visibility is computed by casting rays from the head (thin lines): two windows are in view, a third (Photos) is inside the wedge but almost entirely hidden behind the nearer Mail window, one is to the side outside the wedge, and one is behind the user. A phone agent sees the whole screen in every screenshot; a headset agent sees only the wedge, and what is in the wedge changes as soon as the user turns." %}

## 3. Does this matter for everyday XR? An honest answer

The motivation of this column, in the owner's words, is that the complexity of operating 3D interfaces is one reason why 3D mobile terminals have not entered everyday life. That is a hypothesis, and the evidence supports it only partly. We state the position we can defend:

> The difficulty of operating 3D interfaces is one of several barriers to everyday XR, alongside, and usually behind, price, comfort, content and motion sickness. An agent can lower the operating cost; it cannot fix weight, price or sickness.

The evidence behind "usually behind" is clear (post 3, section 5). Among US adults who were not buying a Vision Pro in February 2024 (Variety VIP+ with CivicScience, N = 1,069), 65.5% named the price, 15% discomfort, 13.5% nausea and 12.2% the lack of content. In 3,205 Amazon reviews of ten VR devices, discomfort accounted for 39% of the coded themes, health risk for 30%, missing content for 21%, and ease of use for 7% (Dehghani et al., 2021). Owners who stop using headsets cite comfort and health more than operation.

The evidence for "one of several barriers" is also real, and it points at the parts of operation an agent can address:

- **Discoverability.** In the same Vision Pro survey, 22.3% said they were not aware of what the device could do. Owners filmed in everyday use did not know that Travel Mode existed (Tran et al., CHI 2025), and analysts testing the Vision Pro described a learning curve with eyes, hands and gestures.
- **Learning.** The novice errors of Khurana et al. are about not knowing the sequence, the gulf of execution, which is the step a GUI agent takes over on a phone.
- **Ease of use in acceptance models.** Ease of use and cognitive affordance appear as significant antecedents of AR and VR acceptance in survey models, next to usefulness, comfort and social norms (post 3, section 5.3).

And there is counter-evidence: early adopters describe the Vision Pro interface as intuitive, and the fastest-growing device class, AI glasses, has almost no GUI at all, which can be read as "simpler interaction wins" or as "cheaper and lighter wins". No survey we found even offered "too hard to use" as an answer. The missing evidence is part of the research: if a 3D GUI agent works, it becomes possible to measure how much operating cost matters, by removing it.

So we do not claim that agents will bring headsets into daily life. We claim something narrower: operating cost is a real, measured barrier, it is the one barrier that software alone can lower, and lowering it is worth studying for its own sake and for the users in the next section.

## 4. The strongest case: accessibility

> Accessibility is the strongest near-term case: screen readers in XR can describe and enumerate, but users still fail to operate menus; with AI scene description, blind participants completed 11% of VR menu trials.

The platforms already ship assistive services that read a UI tree and act for the user: VoiceOver, Pointer Control and Voice Control on Vision Pro, TalkBack on Android XR, a screen reader in the experimental settings of Meta Quest. They work for the system UI and for 2D panels with labels. They cannot act on unlabelled 3D content, which is most of what immersive apps draw, they do not convey spatial structure (what is left, behind, near), and they cannot turn a free-form 3D manipulation into a command (post 3, section 6). Voice Control on Vision Pro can reach any labelled element, but the user has to name every step.

**VRSight** (Killough et al., UIST 2025) is the clearest measurement of what is left. It describes unmodified VR apps from the headset video, using a detector trained on 17,691 VR images, depth estimation, OCR and GPT-4o, in about 2.3 to 2.6 s per query. Nine blind and low-vision participants used it in Rec Room. All of them found the menu, but only one found the specific button the task asked for: menu trials had an 11% completion rate. Participants asked for d-pad navigation, snapping and row-by-row reading, in other words for a discrete action space. For low-vision users, the SeeingVR toolkit (Zhao et al., CHI 2019) raised the number of participants who completed a menu task from 4 of 11 to 11 of 11, but it needs tools built into each app or applied post hoc.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/01-accessibility.svg" localized="true" caption="Describing is easier than operating. Left: VRSight's nine blind and low-vision participants in Rec Room. Every participant found the menu, but only one found and pressed the target button (11% completion of menu trials, Killough et al., UIST 2025). Right: with SeeingVR's low-vision tools, all 11 participants completed a menu task that 4 completed without them (Zhao et al., CHI 2019). An agent that operates the menu on request would remove the last step, the one where most participants failed." %}

**Describing a scene is far easier than operating a 3D UI**, and the step that fails is exactly the step an operating agent would take. The case is also immediate: a blind user cannot wait for headsets to become cheaper or lighter before the menu works. Two cautions from the 2D literature apply. GUI agents are themselves often inaccessible: a computer-use agent that succeeded on 78.3% of tasks dropped to 28.3% with a screen magnifier (A11y-CUA, CHI 2026). And agents that act silently make choices the user cannot see: in the formative study of Morae (Peng et al., UIST 2025), an agent reported "completed" for 484 of 576 requests from blind users, but only 189 were correct. For accessibility, a 3D GUI agent must ask at decision points and report what it did.

## 5. From phone agents to 3D GUI agents: what transfers and what breaks

[Post 2]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }}) surveys the 2D field and ends with a careful list of what carries over. Our summary:

> Much of the phone GUI-agent recipe transfers (screenshots plus structure, element-level actions, execution-based evaluation); what breaks is that the agent's view changes with every head movement, targets can be small, distant, occluded or behind the user, actions are 3D, and the user waits inside the interface.

**What transfers.** Three lessons from 2D are strong enough to adopt from the start:

- **Screenshots plus structure.** Screenshot-first models cover every app, and accessibility trees or the DOM help where they exist. XR has the same two sources: the rendered view, and the scene graph or the platform's spatial semantics (Android XR's subspace semantics tree, RealityKit's `AccessibilityComponent`).
- **Element-level actions.** The choice of action space matters as much as the model: with GPT-4 held fixed, AppAgent's success rose from 2.2% with raw coordinate actions to 48.9% with actions over numbered elements (C. Zhang et al., CHI 2025). An XR agent should likewise act on *targets* (a window, a button, a slider) through a small set of verbs, and leave the rays and pinches to a low-level controller.
- **Execution-based evaluation.** AndroidWorld (Rawles et al., ICLR 2025) and OSWorld (Xie et al., NeurIPS 2024) run the agent in a real environment and check the final state with a program. That is the only kind of evaluation that measures whether a user's request was actually carried out.

**What breaks.** Four assumptions of 2D agents fail in a headset:

1. **The view changes with every head movement.** A phone screenshot shows the whole interface and stays the same until something is tapped. A headset frame shows only the part of the interface in the field of view, and a different part a moment later. One UI state produces endless different images.
2. **Targets can be small, distant, occluded or behind the user.** A 2 cm button on a panel 1.5 m away covers less than 1° of visual angle; a window can hide another; the window the user asks for may be behind them. The agent must decide where to look, or ask the user to turn, and it needs a memory of where things are.
3. **Actions are 3D.** Rays, pinches, grabs, two-handed scaling, 6-DoF poses, gaze, locomotion. The best language model produced the exact controller sequence for a VR action in 11.7% of the scenarios of ComboBench (Shuqing Li et al., arXiv 2510.24706, 2025).
4. **The user waits inside the interface.** On a desktop an agent can work in the background for twenty minutes. In a headset the user watches, the world keeps rendering at 90 frames per second, and the content may move while the agent thinks. Published XR agent prototypes take about 4 s (DuoZone) to about 49 s (NavAI) per turn; a delay above about 4 s already degrades the experience with LLM-driven agents in VR (Maslych et al., CUI 2025).

The interactive sketch below lets you feel the first two points. Turn the head and watch what an agent that sees through the user's eyes can and cannot know.

{% include widget.liquid name="3d-gui-agent-where-is-the-ui" height="620" caption="Where is the UI? A top-down room with five floating windows around the user (purple dot). Drag or swipe sideways to turn the head; the wedge is the field of view in one frame, and the strip below it is what the agent sees in that frame. Windows are marked as in view, occluded by a nearer window, outside the view, or behind the user. Switch on 'memory' to keep faded markers of windows seen before, press 'rearrange' to move windows while you are not looking, and pick a request to see whether the agent could act from the current view or must first turn, search or recall. The layout is illustrative and encodes no benchmark parameters." %}

## 6. Do it, show me, or ask me: the autonomy spectrum

On a phone, a GUI agent is usually expected to do the whole task. In a headset, the user is present, embodied and often there for the experience. We therefore take the position that:

> A 3D GUI agent should not always take over: some operations are better done for the user, some better shown, and sometimes the agent should ask.

We distinguish six points on a spectrum from explaining to acting, with an example operation for each:

| Mode | What the agent does | Example operation |
| --- | --- | --- |
| Explain | says in words how to do it | "How do I turn on Travel Mode?" |
| Show where | highlights the target in space, or draws a ray hint to it | find the recentre control in the quick settings |
| Coach | leads step by step, waits for the user to act, confirms each step | learn the pinch-and-drag gesture that moves a window |
| Reshape the layout | moves, enlarges or brings content closer so the user can act easily | bring the music player from behind the user to the front; enlarge a distant panel for a low-vision user |
| Propose and act | previews a change and applies it after the user confirms | arrange three windows for writing a report |
| Act with takeover | carries out the steps while the user watches and can interrupt | type a search query; change a buried setting |

At every point the agent can also **ask**: which window was meant by "that", whether to overwrite, whether to continue after an unexpected dialog.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/01-autonomy-spectrum.svg" localized="true" caption="The autonomy spectrum of a 3D GUI agent, from explaining (left) to acting with takeover (right), with example operations (top) placed over the mode we would expect to suit them, and the published studies that inform each region (bottom). Read the line from left to right as work moving from the user to the agent: at the left the user acts and the agent supplies knowledge, at the right the agent acts and the user supervises. 'Ask' (red, dashed) is not a point on the line but a channel available at every point. The placement of the examples is our judgment, not a finding of the cited works." %}

The published evidence that the choice matters comes from three directions:

- **DuoZone** (Qian et al., IEEE TVCG 2026), an LLM-guided window manager on Vision Pro, proposes layouts and applies them only after the user confirms. With 16 professionals it made layout matching 34.5% faster and building a workspace took 168.3 s instead of 218.1 s, yet participants accepted 90.3% of app recommendations, 82.8% of sizing and 76.5% of ordering decisions: a substantial share of proposals was changed. Propose-and-act fits a task where the user has preferences.
- **VRCopilot** (L. Zhang et al., UIST 2024) compared manual, fully automatic and scaffolded co-creation of VR layouts; fully automatic creation gave users a lower sense of agency than scaffolding, where the AI proposes a wireframe and the user edits it.
- **The study of AI companions in VR games** (Taiyu Zhang et al., arXiv 2609.13727, preprint, 2026; N = 24 on Vision Pro) compared no help, command-based help, discussion and autonomous agent play. Autonomous play gave the lowest workload, but lowered challenge, autonomy, immersion and enjoyment.

The 2D literature adds that users prefer to confirm at intermediate steps rather than only at the end (81% of 48 participants in "When Should Users Check?", CHI 2026), and the XR guidance systems of post 4 (Sensible Agent, Guided Reality, AgentHands) give a vocabulary for the show-and-coach end. What is missing is evidence for GUI operation in XR: which operations users want done, which shown, and when they want to be asked. We do not propose a rule here; how to choose the mode is one of the open questions of section 8.

## 7. What exists already

[Post 4]({{ '/blog/2026/3d-gui-agent-04-agents-in-xr-and-the-gap/' | relative_url }}) maps the closest work in depth, with a rubric and a heat map of 23 works and products. The picture it draws:

> Pieces of such an agent already exist: detection of GUI elements in VR frames, LLM window management from speech and pointing, LLM navigation from VR screenshots, and tools that let agents drive VR apps for testing.

- **Detection of GUI elements in VR frames.** Orienter (Shuqing Li et al., FSE 2026) finds interactable elements in screenshots of 100 Steam VR apps with a large multimodal model plus an open-vocabulary detector, reaching an interactability F1 of 44.10% at IoU 0.75, against 2.21% for the 2D screen parser OmniParser. VRSight's DISCOVR dataset (UIST 2025) labels menus, buttons and UI text in 17,691 social-VR frames.
- **LLM window management from speech and pointing.** Revisiting Put-That-There (Bovo et al., ISMAR 2025 Adjunct) turns speech, pointing and head direction into JSON actions that place or remove windows on the surfaces of the room, without a user study yet; DuoZone (section 6) does window layout with confirmation and a 16-person evaluation.
- **LLM navigation from VR screenshots.** NavAI (Qin and DiGiovanni, ASE 2025 Workshops) closes the loop from a language goal and field-of-view screenshots to executed movement in Unity scenes, completing 16 of 18 goal tasks at about 49 s per turn; it moves the viewpoint and does not touch menus.
- **Tools that let agents drive VR apps for testing.** Meta XR Operator (August 2026, experimental) lets a coding agent take screenshots of a running VR app and press buttons and work through menus; GenXR-Bench (Huang et al., arXiv 2610.29014, 2026) uses VLM actors to operate the XR apps that coding agents generate; VRExplorer and XRintTest drive Unity VR scenes for test coverage.

Close to these, SIAgent (Wang, Gu and Lu, IEEE TVCG 2026) has an agent execute VR operations from inferred eye-hand intent, without language, and GazePointAR resolves "this" and "that" from gaze and pointing to answer questions.

> Vendors are moving in this direction: Google says Gemini on Galaxy XR can take actions across apps and organize windows; Apple's Siri on visionOS 27 takes actions through app intents; Meta ships an experimental tool that lets coding agents drive VR apps. Their mechanisms and success rates are mostly undisclosed or limited to developer testing.

Google's launch post for Galaxy XR (October 2025) says that Gemini can "take action on your behalf across your apps" and that "Hey Google, organize these windows" arranges open windows; no mechanism or evaluation is published. Apple's Siri on visionOS 27 acts through the actions that apps declare with App Intents, and Apple states that Siri cannot act on what is only in the pixels. Meta's XR Operator is a developer tool that, in Meta's words, "operates too slowly for real-time interaction". These are strong signals that the direction is timely, and they also show the two routes: semantic actions that apps opt into, and operation of the GUI itself.

The capability heat map of post 4 (its section 2) rates 23 such works and products on four properties: perceiving the 3D UI, understanding a natural-language intent, operating the UI, and being evaluated. Every property is covered fully by some work; no row covers all four. Put together:

> As of November 2026 we found no published work that evaluates an agent carrying out users' natural-language requests by operating the 3D GUIs of XR apps, and no benchmark or dataset of such instruction-to-action tasks.

This statement rests on the searches behind posts 2 to 4 (arXiv, OpenAlex, ACM DL, IEEE Xplore, proceedings and product pages, through 24 November 2026). Absence in a search is not proof of absence, and the gap is narrow: Orienter perceives, Put-That-There and DuoZone act on the window layer from language, NavAI closes a loop, Meta XR Operator gives agents hands, and Gemini on Galaxy XR claims cross-app actions. The idea is therefore **timely and partly anticipated**. What it adds is the combination: one agent, driven by a user's request, operating general 3D GUIs of existing apps, evaluated by task success, with the spatial problems of section 5 treated as the core of the research rather than as details.

## 8. Open questions

We keep these at the level of questions. Each is large enough for several studies.

1. **How should a 3D GUI agent be measured?** 2D agents are evaluated by task success in resettable environments with programmatic checks. A 3D version needs tasks that real users would ask for, success checks that tolerate spatial variation (a window placed "next to" another), viewpoint variation, and human baselines (time, errors, effort) for the same tasks, which do not exist for whole tasks on commercial headsets either.
2. **How should an agent see an interface that changes with every head movement?** Through the user's eyes, through its own rendered views, through the scene graph or accessibility structure, or through a combination; and how should it remember where windows are when they leave the view, or move while nobody looks?
3. **Which actions should it use?** Device-level input (rays, pinches, poses) works on every app but is slow and fragile; semantic actions (app intents, function calls) are reliable but cover only apps that opt in. What the right level is, and how to fall back between them, is open in XR.
4. **When should it do, guide or ask?** Section 6 shows that the choice matters and that full autonomy is not always wanted. Which signals (the user's goal, expertise, the reversibility of the action, whether the user is there to enjoy the experience) should decide it, and how the user stays in control, are not known for GUI operation in XR.
5. **Does it make XR accessible?** Whether a 3D GUI agent can turn VRSight's 11% into routine success for blind users, help users with limited mobility reach content behind them, and help older adults past the first sessions, has to be shown with those users, not assumed.

Beneath all five lie the platform questions of post 4: third-party apps are closed on devices, gaze stays private, and the most open environments (WebXR, emulators, simulators) are not the ones people use every day. Safety and privacy run through all of them: an agent that sees what the user sees, in the user's home, must not become a channel for deceptive UI, prompt injection from the room, or the leakage of biometric traces.

## 9. What this column does next

> We are building an open benchmark and a first prototype on Meta Quest, and will report results when they exist.

The rest of the column is the evidence base for that work:

- [Post 2: GUI agents on 2D screens]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }}), a survey of phone, desktop and web agents up to November 2026, ending with what transfers to 3D and what breaks.
- [Post 3: why 3D interfaces are hard to operate]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }}), the evidence on input, spatial UI structure, measured difficulty, adoption and accessibility, with a catalogue of 30 headset operations.
- [Post 4: AI agents in XR, the platforms and the gap]({{ '/blog/2026/3d-gui-agent-04-agents-in-xr-and-the-gap/' | relative_url }}), the closest work in depth, what each platform lets an agent observe and control, and the datasets.
- [The research plan]({{ '/blog/2026/3d-gui-agent-05-research-plan/' | relative_url }}), password-protected for now.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/01-column-map.svg" localized="true" caption="How the five posts of the column fit together. This vision post (centre) states the idea; the three surveys supply its evidence: what agents can do on 2D screens (post 2), why 3D interfaces are costly to operate (post 3), and what exists in XR and where the gap is (post 4). The research plan (post 5, locked) builds on all four." %}

## Representative papers

Status as of November 2026. "arXiv" means preprint only.

| Paper | Authors | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- | --- |
| 3D User Interfaces: Theory and Practice (2nd ed.) | J. J. LaViola Jr., E. Kruijff, R. P. McMahan, D. A. Bowman, I. Poupyrev | Book, Addison-Wesley | 2017 | [publisher](https://www.informit.com/store/3d-user-interfaces-theory-and-practice-9780134034478) | The standard taxonomy of 3D interaction tasks (selection, manipulation, travel, system control) |
| AppAgent: Multimodal Agents as Smartphone Users | C. Zhang et al. | CHI | 2025 | [arXiv](https://arxiv.org/abs/2312.13771) | Element-level actions and exploration documents for phone agents |
| AndroidWorld: A Dynamic Benchmarking Environment for Autonomous Agents | C. Rawles et al. | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2405.14573) | Parameterized tasks with programmatic success checks |
| OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments | T. Xie et al. | NeurIPS (D&B) | 2024 | [arXiv](https://arxiv.org/abs/2404.07972) | Execution-based evaluation on real desktops; the curve that measured progress |
| Look Before You Leap: Context-Sensitive GUI Grounding for Boosting Automated Extended Reality (XR) Testing (Orienter) | S. Li et al. | FSE (PACMSE) | 2026 | [DOI](https://doi.org/10.1145/3808134) | Grounding of interactable GUI elements in rendered VR frames |
| DuoZone: A User-Centric, LLM-Guided Mixed-Initiative XR Window Management System | J. Qian et al. | IEEE TVCG | 2026 | [arXiv](https://arxiv.org/abs/2511.15676) | Language-driven window layout with confirmation, evaluated with 16 users |
| Revisiting put-that-there, context aware window interactions via LLMs | R. Bovo et al. | ISMAR Adjunct | 2025 | [arXiv](https://arxiv.org/abs/2511.02378) | LLM actions on XR windows from speech, pointing and head direction |
| NavAI: A Generalizable LLM Framework for Navigation Tasks in Virtual Reality Environments | X. Qin, M. DiGiovanni | ASE Workshops | 2025 | [arXiv](https://arxiv.org/abs/2601.03251) | Closed loop from language and VR screenshots to movement |
| SIAgent: Spatial Interaction Agent via LLM-powered Eye-Hand Motion Intent Understanding in VR | Z. Wang, C. Gu, F. Lu | IEEE TVCG | 2026 | [arXiv](https://arxiv.org/abs/2603.00522) | An agent executes VR operations from inferred intent |
| VRSight: An AI-Driven Scene Description System to Improve Virtual Reality Accessibility for Blind People | D. Killough et al. | UIST | 2025 | [DOI](https://doi.org/10.1145/3746059.3747641) | 11% menu completion with scene description: describing is not operating |
| GazePointAR: A Context-Aware Multimodal Voice Assistant for Pronoun Disambiguation in Wearable Augmented Reality | J. Lee et al. | CHI | 2024 | [arXiv](https://arxiv.org/abs/2404.08213) | Deictic requests resolved from gaze and pointing |
| Guided Reality: Generating Visually-Enriched AR Task Guidance with LLMs and Vision Models | A. Y. Zhao et al. | UIST | 2025 | [arXiv](https://arxiv.org/abs/2508.03547) | A visual vocabulary for spatial guidance |
| VRCopilot: Authoring 3D Layouts with Generative AI Models in VR | L. Zhang et al. | UIST | 2024 | [DOI](https://doi.org/10.1145/3654777.3676451) | Full automation lowers the sense of agency |
| "What Can I Do for You": How Should AI Companions Provide Assistance to Players in Virtual Reality Games | T. Zhang et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2609.13727) | Autonomous agent play lowers workload but also enjoyment |
| "Do I Just Tap My Headset?": How Novice Users Discover Gestural Interactions with Consumer Augmented Reality Applications | A. Khurana et al. | IMWUT | 2023 | [DOI](https://doi.org/10.1145/3631451) | Novices fail at knowing what to do, not at moving |
| Selection-based Text Entry in Virtual Reality | M. Speicher et al. | CHI | 2018 | [DOI](https://doi.org/10.1145/3173574.3174221) | VR keyboards at 5.3 to 15.4 wpm |
| Bumpy Ride? Understanding the Effects of External Forces on Spatial Interactions in Moving Vehicles | M. Sasalovici et al. | CHI | 2025 | [DOI](https://doi.org/10.1145/3706598.3714077) | Selection error rates on a current headset, still and moving |

Product sources: [Introducing Galaxy XR](https://blog.google/products/android/samsung-galaxy-xr) (Google, October 2025); [Introducing Meta XR Operator](https://developers.meta.com/horizon/blog/meta-xr-operator-close-the-build-test-verify-loop-for-vr/) (Meta, 18 August 2026); [About visionOS 27 updates](https://support.apple.com/en-us/149067) (Apple).

## Learning resources

- The column's research dossiers in the repository, `docs/research/3d-gui-agent/`: GUI agents in 2D, 3D UI and XR interaction, agents in XR and 3D, and platforms and tooling, each with verified citations. The reading list is `docs/reading-lists/3d-gui-agent.md`.
- The 3D UI book above (LaViola et al., 2017) for the interaction vocabulary, and Apple's [Human Interface Guidelines for spatial design](https://developer.apple.com/design/human-interface-guidelines/spatial-layout) for how one platform turns it into rules.
- For hands-on agent work: [AndroidWorld](https://github.com/google-research/android_world) and [OSWorld](https://github.com/xlang-ai/OSWorld) for environments and checkers; Meta's [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) for a scriptable WebXR headset in the browser.
- The W3C [XR Accessibility User Requirements](https://www.w3.org/TR/xaur/), which describe what an accessible XR interface must allow; they read like the preconditions of a 3D GUI agent.

## Exercises

1. **Time a buried setting.** On a headset you have access to, change one setting that takes several steps (for example, the passthrough or boundary behaviour, or the keyboard language). Time it, count the steps, and note every moment you did not know what to do next. Then do the same setting on a phone, if it has an equivalent.

   <details markdown="1"><summary>Hint</summary>

   Separate three kinds of cost while you time: knowing where the setting is (knowledge), reaching and selecting each control (motor), and checking that it took effect (evaluation). Khurana et al. found most novice errors in the first and third; an agent helps most there.
   </details>

2. **Delegate or not.** For the task of exercise 1, mark each step as "do it for me", "show me where", or "I want to do it myself". Which steps did you delegate, and why?

   <details markdown="1"><summary>Hint</summary>

   Steps that are pure navigation (opening menus, scrolling) are good candidates to delegate; the final decision (which value) often is not, because it carries your preference. This is the propose-and-act pattern of DuoZone: the agent prepares, you confirm.
   </details>

3. **Never for me.** Describe one operation on a headset that an agent should never do for you, and one it should only do after asking. What property of the operation decides it?

   <details markdown="1"><summary>Hint</summary>

   Consider reversibility (deleting, sending, paying), safety (changing the boundary or passthrough hides the real room), secrets (passwords), and experiences you are there to have (playing a game). Post 3's catalogue of 30 operations marks several as "neither".
   </details>

4. **Turn and remember.** In the widget of section 5, choose the request "bring the music player here" with memory off and turn until the agent could act. Then switch memory on, look around once, turn back, and press "rearrange". What does the agent believe now, and what should it do before acting?

   <details markdown="1"><summary>Hint</summary>

   With memory on, the agent remembers where it last saw each window, which saves a search, until something moves. After "rearrange" its memory is stale: a careful agent treats remembered positions as hints and verifies before acting, the way a 2D agent re-reads the screen after every action.
   </details>

5. **What transfers.** Pick one 2D GUI-agent technique from post 2 (for example Set-of-Mark labels, exploration documents, or reflection) and describe in a paragraph what it would look like in a headset, and which of the four broken assumptions of section 5 it would have to deal with.

   <details markdown="1"><summary>Hint</summary>

   Set-of-Mark labels, for example, become marks attached to objects in space; they must stay attached when the head moves (assumption 1), they cannot label what is behind the user (assumption 2), and a label on a tiny distant button is still hard to hit with a ray (assumption 3).
   </details>

**Next:** [Post 2: GUI agents on 2D screens]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }}).
