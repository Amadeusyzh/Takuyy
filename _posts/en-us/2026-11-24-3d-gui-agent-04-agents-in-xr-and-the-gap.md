---
layout: post
title: "AI agents in XR: the closest work, the platforms, and the gap"
date: 2026-11-24 12:04:00+0900
description: "A map, as of November 2026, of everything that comes close to an agent that operates the 3D interfaces of VR, AR and MR devices for a user: LLMs that build XR worlds, XR assistants, XR testing agents, game agents, headset and glasses assistants, the closest works in depth (Orienter, ComboBench, NavAI, SIAgent, Put-That-There, DuoZone, Gemini on Galaxy XR, Meta XR Operator, Siri on visionOS), what each platform lets an agent observe and control, the datasets, and what is still missing."
categories: 3d-gui-agent
tags: [gui-agent, xr, vr, mixed-reality, llm-agent, visionos, android-xr, openxr, webxr, benchmark]
series: 3d-gui-agent
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## Why this matters

[Post 2]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }}) showed that GUI agents, models that read a screen and tap, type and scroll for a user, have become a mature research field on phones, desktops and the web. [Post 3]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }}) explained why the 3D interfaces of headsets and glasses are harder to operate than flat screens. The [research vision]({{ '/blog/2026/3d-gui-agent-01-research-vision/' | relative_url }}) of this column puts the two together: an agent that operates the 3D GUI of a VR, AR or MR device on the user's behalf, or guides the user through it.

Before claiming that such an agent is new, we have to know exactly what already exists. Many pieces do: LLMs that build XR scenes, assistants that answer questions about what you look at, test programs that click through VR apps, game agents that act in 3D from pixels, a shipped headset assistant that its maker says can "take action on your behalf across your apps", and a vendor tool that lets an LLM agent work through the menus of a VR app. This post maps all of them as of **November 2026**, studies the closest ones in depth with their numbers, describes what each XR platform lets an agent observe and control, compares the available datasets, and states as precisely as the evidence allows what is still missing. Being fair to prior work matters here: the gap is narrower than "nobody has put agents in XR", and the post tries to say exactly how narrow.

## Prerequisites

- What a GUI agent is and how it is evaluated (observation, action space, grounding, task success): [post 2]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }}).
- The basics of 3D interaction (ray pointing, pinch, gaze, direct manipulation, windows and volumes): [post 3]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }}).
- A rough idea of how an XR runtime, an engine and an app fit together (OpenXR, Unity, WebXR). The [graphics engine series]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}) covers engines.

## 0. What counts as "close": a working definition and a rubric

The column uses this working definition. A **3D GUI agent** is an AI agent that

1. **perceives the spatial user interface** of a VR, AR or MR device (headset or glasses): windows, volumes, menus, widgets and interactive virtual objects placed in 3D, seen through the rendered view and/or through system and app structure;
2. **understands a user's intent** given in natural language (speech or text), possibly together with gaze and pointing; and
3. **operates that 3D GUI** for the user (select, press, grab, move, resize, navigate menus and apps), or **guides** the user through it.

A fourth property separates a system from an idea: it should be **evaluated as an agent**, with task success measured over a set of instructions and apps.

To compare very different works on one scale, every work in this post is rated on these four properties with three levels. The ratings are my reading of the papers and product pages; the rubric is:

| Property | 2 (full) | 1 (partial) | 0 (none) |
| --- | --- | --- | --- |
| Perceive the 3D UI | finds UI elements of existing XR apps from the rendered view or UI structure | perceives the XR scene through privileged metadata, a scene graph, or pixels without UI elements | perceives only the physical world, or nothing |
| Understand intent | natural-language goals from a user | implicit intent (gaze, hand motion), proactive inference, or test instructions | none (for example coverage-driven testing) |
| Operate / guide | executes operations on XR UI: windows, widgets, interactables | acts in XR but not on the UI (locomotion, world editing, services), guides, or plans without executing | answers or predicts only |
| Evaluated | quantitative task or user-study results | preliminary or small study, synthetic data only | none, or not disclosed |

The [capability heat map in section 2](#2-the-closest-work-in-depth) applies the rubric to 23 works and products. The short version: several works reach "full" on two properties, a few on three, and none on all four.

## 1. The landscape

The neighbours of the 3D GUI agent fall into eight lines of work. The figure arranges them around the target and labels each arrow with what that line contributes, or why it falls short.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-map.svg" localized="true" caption="Map of the area. Eight lines of work surround the 3D GUI agent. Solid arrows: the line supplies a part of the agent (perception of XR UI, 3D action from pixels, an action channel, grounding in space). Dashed arrows: the line works with LLMs in XR but on something else (it edits the virtual world, or it only answers and guides). Only line A touches the core, and each of its works covers part of the loop." %}

### 1.1 LLMs that build or edit XR worlds

The first wave of LLM-in-XR research (2023-2024) used language to **create or change the virtual world**. **LLMR** (De La Torre et al., CHI 2024, Honorable Mention) orchestrates several GPT-4 roles inside Unity: a *scene analyzer* that summarizes the scene graph into text, a *planner*, a *builder* that writes C# code, and an *inspector* that checks compile and run-time errors, plus a skill library. Its error rate is about a quarter of plain GPT-4's (the abstract says 4x lower), and 11 participants used it in a usability study. **DreamCodeVR** (Giunchi et al., IEEE VR 2024) compiles spoken requests into C# that changes a running VR app. **LLMER** (Chen et al., IEEE TVCG 2025) replaces code with JSON and reports over 80% fewer tokens and about 60% less task time than prior work. **VRCopilot** (Zhang et al., UIST 2024) compares manual, automatic and scaffolded co-creation of 3D layouts and finds that scaffolding (the AI proposes a wireframe the user edits) gives users more sense of agency, an early data point on how much autonomy people want from an XR AI. **sMoRe** (Xing et al., arXiv 2024) places and organizes virtual objects in MR from voice and text commands.

The newest systems target developers. **XR Blocks** (Li et al., arXiv 2025) and **Vibe Coding XR** (Du et al., VRST 2026 per arXiv) turn prompts into WebXR apps through an LLM-friendly "Reality Model" of user, world, interface and agent. **GenXR-Bench** (Huang et al., arXiv, October 2026) evaluates coding agents on 112 XR development tasks; its harness, discussed in section 4, contains VLM "actors" that operate the generated apps. **ControlAnything** (Ryskeldiev, arXiv, November 2026) has a coding agent generate AR controls and device connectors at use time on Quest 3 (9 of 10 requests ready, median 32.5 s).

*What this line gives a 3D GUI agent:* evidence that LLMs can read XR scene structure (LLMR's scene analyzer), and compact action formats (LLMER's JSON). *What it lacks:* it builds or edits content through the engine; it does not operate the interfaces of existing apps.

### 1.2 XR assistants that answer or guide

The second line puts a multimodal assistant inside the headset or glasses. These systems are strong on **intent**, especially on resolving deictic references ("this", "that", "there") from gaze and pointing:

- **GazePointAR** (Lee et al., CHI 2024) replaces pronouns in a spoken question with a description of what the user is gazing or pointing at, before querying an LLM (lab study with 12 participants plus a diary study).
- **G-VOILA** (Wang et al., IMWUT 2024) uses gaze, the visual field and voice for information queries.
- **EmBARDiment** (Bovo et al., IEEE VR 2025) gives an LLM chatbot the content of whichever XR window the user is reading, selected by gaze, so that users need not restate context. It reads a multi-window XR UI, but only to answer.
- **Satori** (Li et al., CHI 2025) is a proactive AR assistant on HoloLens 2 with a Belief-Desire-Intention user model; in a study with 16 participants it was non-inferior to a Wizard-of-Oz system designed by AR designers on all 11 usability items, with 2-3 s latency.
- **Sensible Agent** (Lee et al., UIST 2025) decides not only what to suggest but how to ask (multiple choice, yes/no, icons) and through which channel (gaze, head, hand, voice), running in WebXR on an Android XR headset. In a preliminary study (N=10) NASA-TLX workload was 20.55 versus 43.27 for the baseline.
- **Guided Reality** (Zhao et al., UIST 2025) and **AgentHands** (Liu et al., CHI 2026) produce visual guidance in space: highlights and arrows anchored to interaction points, and rendered agent hands that point and demonstrate while the agent talks.

*What this line gives:* intent grounding from gaze and pointing, a vocabulary for spatial guidance, and models of when and how to interrupt. It is the best evidence for the **guide mode** of a 3D GUI agent. *What it lacks:* the output is an answer or an overlay; none of these systems operates the interface.

### 1.3 Programs that already operate XR apps: automated testing

Software-engineering research has been driving VR apps automatically since 2022, for a different goal: **test coverage**. **VRTest** (Wang, ICSE 2022 tool demo) reads the Unity scene and moves the camera to explore. **VRGuide** (Wang, Rafi and Meng, ASE 2023) plans camera routes with computational geometry to cover all interactable objects. **VRExplorer** (Zhu et al., ASE 2025), **XRintTest** (Gu et al., Automated Software Engineering 2026), **AUTOVR** (Kim et al., USENIX Security 2025) and the LLM-driven **ExploreAI** (Wang et al., arXiv 2026) are described in section 2.7. **VRScout** (Wu et al., arXiv 2025) learns an Action Chunking Transformer from human demonstrations and plays commercial VR games at 60 FPS, a pixel-to-6-DoF policy without language.

The motivation is real: a study of 314 open-source Unity VR apps found that 79% had no automated tests at all (Rzig et al., ISSTA 2023). A 2026 survey of VR/AR software engineering (Guo et al., arXiv, submitted to TSE) lists LLM agents for VR GUI exploration as an open problem, with coordinate localization unsolved.

*What this line gives:* working perception-and-action machinery for real VR apps, and an executable vocabulary of 3D interactions (fire, grab, socket). *What it lacks:* user intent. The goal is to touch everything, not to do what a user asked.

### 1.4 Agents that act in 3D through a rendered view

Game agents show that **one interface, pixels in and human input devices out, can follow language across many 3D worlds**, and they measure the cost.

- **SIMA** (SIMA Team, Google DeepMind, arXiv 2024) trained a language-conditioned keyboard-and-mouse policy across more than 10 3D games. On a No Man's Sky subset it reached 34% success versus 60% for humans, and the ablation without language reached 11%: language matters.
- **SIMA 2** (arXiv, December 2025) fine-tunes Gemini Flash-Lite into an agent that reasons, talks and acts (96 keys, clicks and discretized mouse moves) and roughly doubles SIMA's average success. It improves itself with Gemini as task setter and reward model, but the fine-tuning costs general reasoning (AIME -15.4%, GPQA -19.5%).
- **Cradle** (Tan et al., arXiv 2024) is a training-free six-module GPT-4o framework that writes keyboard and mouse skills from screenshots; it has to pause the game while it thinks.
- **Lumine** (Tan et al., arXiv 2025) is the real-time counterpoint: Qwen2-VL-7B sees 5 frames per second, emits 30 Hz action chunks, reasons only when needed, reaches the first action in 113.9 ms without reasoning and 234 ms with it, and completes a 5-hour Genshin Impact storyline.
- **VideoGameBench** (Zhang et al., arXiv 2025) shows why that matters: frontier VLMs completed 0.48% of the games when playing in real time, and 1.6% when the game paused for them. **An XR interface cannot be paused for the agent.**
- **Embodied Web Agents** (Hong et al., NeurIPS 2025 Datasets and Benchmarks) mixes a 3D world with live websites in about 1.5k tasks. In cooking tasks, 66.6% of GPT-4o's failures came from switching between the 3D world and the web, against 14.6% embodied-only and 8.0% web-only failures. XR interfaces are exactly this mix: flat panels floating in a 3D space.
- 3D software agents warn against pure pixel control: on **VideoCAD** (Man et al., NeurIPS 2025 D&B, about 41k synthetic CAD UI videos) frontier models fail long-horizon CAD UI tasks, and **ComAct** (Ai et al., arXiv 2026) reports near-zero success for GUI agents on industrial CAD and argues for API actions instead.

*What this line gives:* action-space designs, latency recipes and self-improvement loops for agents that act in 3D from pixels. *What it lacks:* these worlds are games, not interfaces, and none runs on a headset.

### 1.5 Assistants on headsets and glasses, and egocentric AI

Shipped assistants already perceive a lot: the camera view, the screen, sometimes gaze. What they do with it differs:

- **Gemini on Samsung Galaxy XR** (Android XR, on sale since 21 October 2025, USD 1,799): Google's launch post says Gemini Live "can better understand what you're seeing and doing" and can "take action on your behalf across your apps", and that "Hey Google, organize these windows" arranges open windows. Details in section 2.8.
- **Siri AI on Apple Vision Pro** (announced at WWDC on 8 June 2026; visionOS 27 release notes dated 9 November 2026): you look at Siri and speak, ask about objects in your room or content on your screen, and Siri "get[s] things done across apps" through app actions.
- **Meta**: Meta Ray-Ban Display with the Neural Band wristband (on sale 30 September 2025 in the US, USD 799) shows answers and step-by-step guides in the lens. At Connect 2026 Meta announced the **Muse** personal agent for AI glasses, acting through shopping, payment and booking connectors "in the coming months", and **Meta VR Glasses** (USD 1,299.99, spring 2027) with a Meta AI agent built into the OS that can "play a movie, open an app, adjust your workspace". Neither had shipped at the time of writing.
- **Research**: egocentric AI has moved from question answering over first-person video (Ego4D, EgoSchema) through proactive assistance (ProAssist, EMNLP 2025; HoloAssist, a 166-hour HoloLens 2 dataset of an instructor guiding a performer) to glasses agents that execute tasks: **VisionClaw** (Liu et al., arXiv 2026) connects Ray-Ban Meta glasses to agents that add items to a shopping cart, create calendar events from posters and control IoT devices (lab study N=12, deployment N=5).

*What this line gives:* deployed perception, and proof that users want to delegate. *What it lacks:* the acting route is APIs and services, not the operation of a 3D interface (with Gemini on Galaxy XR as the undisclosed exception).

### 1.6 3D and spatial understanding

3D-LLMs (3D-LLM, LEO, Video-3D LLM, GPT4Scene), spatial VLMs (SpatialVLM, SpatialRGPT), scene graphs (ConceptGraphs, HOV-SG) and 3D referring-expression grounding (ScanRefer, SeeGround) ground **physical objects** in space. Two results are worth remembering for 3D GUI agents. On **VSI-Bench** (Yang et al., CVPR 2025), the best MLLM answered 45.4% of spatial-memory questions about indoor videos against about 79% for humans, and explicit cognitive maps helped more than chain-of-thought. **SeeGround** (Li et al., CVPR 2025) renders views of a 3D scene and grounds with a 2D VLM, a recipe that would let 2D GUI grounders work in 3D. The UI-side counterpart, a model that grounds *UI elements* in 3D space using stereo, depth and head pose, does not exist yet; the closest work, Orienter, works on single-eye 2D screenshots.

### 1.7 How the field converged

The timeline shows when each line appeared. Research on intent and guidance in XR started in 2023-2024; the works that actually operate parts of the XR UI cluster in late 2025 and 2026; and the infrastructure and products arrived in the same window.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-timeline.svg" localized="true" caption="Papers, infrastructure and products from 2023 to November 2026 (research items at their first arXiv submission or publication month). Look at the right half: Put-That-There, DuoZone, ComboBench, NavAI, XRintTest and SIAgent appear within six months of each other, Meta XR Operator lets agents drive VR apps from August 2026, and Galaxy XR with Gemini shipped in October 2025. The idea is timely and partly anticipated." %}

## 2. The closest work in depth

The heat map applies the rubric of section 0 to the 23 closest works and products. Read it by columns first: many rows are dark in *NL intent* and *evaluated*, several in *operate*, but the *perceive 3D UI* column has only three full cells (Orienter, VRSight, Meta XR Operator), and none of those three understands a user's request.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-capability.svg" localized="true" caption="Capability heat map. Rows: the closest works and products, coloured by line of work (purple: XR-UI grounding and operation; orange: world building; cyan: assistants; blue: XR testing; green: 3D agents; red: products; brown: infrastructure). Columns: the four properties of the rubric in section 0; dark is full, light is partial, grey is none. The right column gives the number behind the rating. The dashed bottom row is the target; no row matches it." %}

The interactive map below holds the same works and about twenty more. Each work is a point placed by how much of the 3D UI it perceives (horizontal) and how much it operates (vertical); the colour is the kind of intent it understands and the outline says how it was evaluated.

{% include widget.liquid name="3d-gui-agent-landscape" height="660" caption="Capability map of agents in XR and 3D (as of November 2026). Tap a category, platform or year chip to filter; tap a point or a name in the list to read a summary with its numbers and a link. Toggle 'target region' to outline where the 3D GUI agent idea sits: full perception of the 3D UI, full operation, natural-language intent and a task evaluation. Points are spread slightly so that works with the same rating do not hide each other." %}

### 2.1 Orienter: grounding interactable elements in VR frames

**Look Before You Leap: Context-Sensitive GUI Grounding for Boosting Automated Extended Reality (XR) Testing** (Shuqing Li et al., FSE 2026, published in Proceedings of the ACM on Software Engineering 3(FSE), [DOI 10.1145/3808134](https://doi.org/10.1145/3808134); arXiv 2409.10811, whose title reads *Grounded GUI Understanding for Vision-Based Spatial Intelligent Agent: Exemplified by Extended Reality Apps*). The method is called **Orienter**.

*Problem.* Find the *interactable GUI elements* (IGEs) in a screenshot of a VR app. Unlike phone GUIs, XR elements are open-vocabulary (a lever, a floating panel, a door handle), and whether an element is interactable depends on context: the same crate may or may not be grabbable. Detectors trained on fixed 2D widget classes transfer poorly.

*Method.* A zero-shot pipeline around a large multimodal model (GPT-4V, GPT-4o, Claude 3.5 Sonnet or Gemini 1.5 Pro):

1. *Semantic context comprehension*: the LMM reads the frame plus app information crawled from Steam.
2. *Reflection-directed candidate detection*: the LMM proposes descriptions of candidate elements, the open-vocabulary grounding model APE localizes them as boxes, and an LMM "advisor" validates them in a loop.
3. *Context-sensitive interactability classification* with chain-of-thought.

This is the 2D GUI-agent recipe of [post 2]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }}) (a language model for semantics plus a grounding model for coordinates, as in Set-of-Mark prompting and OmniParser) carried over to VR frames, with reflection added because the first guesses are often wrong.

*Data.* 1,552 right-eye frames (960x540) from 100 Steam VR apps, with 4,470 interactable annotations in 766 semantic categories, labelled by 13 annotators over more than three months.

*Results.* Interactability F1 at IoU 0.75 is 44.10% (Gemini, split by app) against 32.69% for a trained Faster R-CNN and 2.21% for OmniParser, the strong 2D screen parser. On the context-sensitive split Orienter reaches 32.51% while baselines are near 0.5%. Precision collapses at strict IoU (5.64% at IoU 0.95), and asking an LMM directly for boxes fails at localization. Used to steer automated exploration of 77 apps for 60 minutes, it raised element coverage from 0.65 to 0.83 and effective interactions from 5,911 to 13,038 (the abstract states larger relative gains than these body figures).

*What it does not do.* It works on one eye's 2D projection, without depth or stereo; there is no user goal; the "acting" is simulated as interaction points on frames for test exploration, not real 6-DoF input. **Overlap: substantial for perception.** Orienter is the only peer-reviewed work that grounds GUI elements in rendered frames of real XR apps, and its arXiv title already speaks of a "spatial intelligent agent". The column must acknowledge it as the perception half of the idea.

### 2.2 ComboBench: from a semantic action to controller steps

**ComboBench: Can LLMs Manipulate Physical Devices to Play VR Games?** (Shuqing Li et al., arXiv 2510.24706, October 2025; preprint) isolates the step after perception: given a semantic action such as "reload the gun", produce the sequence of physical headset and controller manipulations that the VR game requires.

*Data and method.* 262 scenarios from Half-Life: Alyx, Into the Radius, Moss: Book II and Vivecraft; ground-truth operation sequences recorded on a Quest 2; seven LLMs evaluated zero-shot and few-shot, in text only.

*Results.* The best strict sequence match was 11.7% (Gemini-1.5-Pro, 5-shot), with GPT-4o at 10.9% and GPT-4 at 8.8%; open models scored about 0-2%, and no model exceeded 5.8% zero-shot. Normalized alignment scores were high (up to 0.832, against 0.833 for the human baseline), so the models know roughly *which* steps are involved, but step-order accuracy stayed at or below about 0.3. A few examples raised order accuracy 10-20 times, with little gain after about three shots. Mapping steps to motor actions was the weakest capability.

*What it does not do.* No screenshots, no execution, no closed loop, and the targets are game mechanics rather than GUI widgets. **Overlap: substantial for action grounding.** It is the cleanest measurement of how poorly LLMs know 6-DoF controller procedures.

### 2.3 NavAI: a closed loop, but for walking

**NavAI: A Generalizable LLM Framework for Navigation Tasks in Virtual Reality Environments** (Xue Qin and Matthew DiGiovanni, ASE 2025 Workshops, [DOI 10.1109/ASEW67777.2025.00067](https://doi.org/10.1109/ASEW67777.2025.00067); arXiv 2601.03251, January 2026) is the only published closed loop from a natural-language goal and VR screenshots to executed actions.

*Loop.* A field-of-view screenshot with a grid overlay and the user's request go to GPT-4o; a vote across GPT-4o, Grok-2 and Gemini-2.5-Flash picks the next step; JSON function calls (`move`, `rotate`, `look`, `scan_360`) execute in a Unity simulator; the new view comes back. The grid overlay is a 3D cousin of Set-of-Mark prompting: it gives the model numbered places to point at.

*Results.* In three Unity scenes it executed 21 of 21 basic actions and completed 16 of 18 goal tasks (89%), with about 8 turns per task and about 49 s per turn, up to about 395 s per task.

*What it does not do.* It moves the viewpoint; it never touches a menu or a widget. Its latency is two orders of magnitude above interactive use (section 2.9). **Overlap: substantial for the loop, none for GUI operation.**

### 2.4 SIAgent: the agent executes, intent from eyes and hands

**SIAgent: Spatial Interaction Agent via LLM-powered Eye-Hand Motion Intent Understanding in VR** (Zhimin Wang, Chenyu Gu and Feng Lu, IEEE TVCG 32(7), 2026, [DOI 10.1109/TVCG.2026.3686395](https://doi.org/10.1109/TVCG.2026.3686395); arXiv 2603.00522, March 2026) asks whether users can skip learning gesture-to-command mappings: the agent watches natural eye and hand behaviour, infers the intended operation and executes it.

*Pipeline.* A 3-second gaze window sampled at 30 Hz is reduced to 18 points; hand pose and finger states are verbalized; three LLM calls (ChatGLM-4) return six ranked intent hypotheses; a virtual hand controlled by the agent executes the chosen one.

*Results.* In Study 1 (N=16, 54 trials each) against controller and gaze+pinch input: intent recognition 97.2% versus 93.1% for gaze+pinch; execution accuracy 86.8%; 7.7 s per task *excluding* LLM time versus 5.8 s with a controller; LLM latency about 9.1 s; less arm fatigue; 81% of participants preferred SIAgent. Top-1 intent accuracy was 83.3% with GLM-4, 72.2% with GPT-4o and 46.3% with GPT-3.5, and adding the hand to gaze raised top-1 accuracy from 30.2% to 58.3%.

*What it does not do.* There is no language instruction and no GUI perception; the operations are predefined scene operations. **Overlap: substantial for "the agent operates VR for the user".** It is the clearest published case of an agent acting on VR content on the user's behalf.

### 2.5 Revisiting Put-That-There: language and deixis to window actions

**Revisiting put-that-there, context aware window interactions via LLMs** (Riccardo Bovo et al., ISMAR 2025 Adjunct per OpenAlex; arXiv 2511.02378) updates Bolt's 1980 "put that there" for headsets.

*Method.* GPT-4, prompted without fine-tuning, receives window metadata (id, size, location), the flat surfaces of the room from the Quest Scene API (about 10 automatic classes plus about 30 hand-annotated ones), the user's speech, pointing hover events and head direction. It outputs JSON triplets `["place"|"remove", windowId, surface]`. It handles explicit commands ("put Maps on the coffee table"), deictic ones ("put that there") and goal-level ones ("I need to send a message", which opens and places the right apps), including one-to-many actions.

*What it does not do.* There are no quantitative results yet (a user study is planned). It acts through window-manager metadata rather than perceiving the GUI, and only places windows, without operating inside apps. **Overlap: substantial for intent plus operation of the XR window layer.** It is the cleanest formulation of "an LLM acts on the XR UI from multimodal intent", with privileged metadata standing in for perception.

### 2.6 DuoZone: mixed-initiative window layout, evaluated

**DuoZone: A User-Centric, LLM-Guided Mixed-Initiative XR Window Management System** (Jing Qian et al., IEEE TVCG, published online 3 November 2026 per OpenAlex; arXiv 2511.15676) is the best-evaluated system in which language drives the XR UI.

*Method.* On Apple Vision Pro with a GPT-4.1 server, the user defines zones in space and states a goal. The LLM scores how relevant each app is to the goal and assigns apps to zones using a cost matrix (pointing distance, head turn, hand movement); a non-LLM optimizer sizes the windows, because the LLM alone resized them randomly. The user confirms before anything changes; a request takes about 4 s.

*Results.* N=16 professionals, within-subject against native visionOS window management: layout matching was 34.5% faster; building a workspace took 168.3 s versus 218.1 s; NASA-TLX workload was lower in both reported comparisons (33.3 versus 47.7 and 22.4 versus 34.2). Participants accepted 90.3% of app recommendations, 82.8% of sizing and 76.5% of ordering decisions. Satisfaction did not differ.

*What it does not do.* Window layer only; app metadata instead of GUI perception; the user confirms every change. **Overlap: substantial for operating the XR window layer under mixed initiative**, and its confirm-then-apply design is a model for shared control.

### 2.7 The XR testing agents

Four testing systems show four different ways to get *perception and action* in VR apps without a user:

| System | How it perceives | How it acts | Scale and result | Status |
| --- | --- | --- | --- | --- |
| VRExplorer (Zhu et al.) | static and dynamic analysis of Unity scenes and scripts; developers tag objects with interfaces such as `IGrabbable` | NavMesh path finding, a probabilistic state machine alternating tasks and exploration | 11 Unity projects; +122.8% executable-line coverage over VRGuide; 3 bugs | ASE 2025 |
| XRintTest (Gu et al.) | an Interaction Flow Graph parsed from XR Interaction Toolkit components | simulated controller events through the XRI device simulator; an oracle flags unresponsive interactions | XRBench3D: 10 scenes, 456 interactions; 93% covered (97% fire, 94% manipulate, 83% socket) vs 8% random | Automated Software Engineering 33(3), 2026 |
| AUTOVR (Kim et al.) | binary instrumentation (Frida) of Unity IL2CPP apps on Quest 2 to recover UI event handlers | invokes handlers directly, forces collider contacts, reloads scenes | 366 Quest Store and SideQuest apps; 390 vs 117 sensitive-data exposures found compared with Android Monkey; about 222 s per app | USENIX Security 2025 |
| ExploreAI (Wang et al.) | an LLM selects targets from views and task text; navigation and multi-view capture modules | navigates and captures; per-object trace records | Unity, AI2-THOR and BeamNG apps | arXiv 2026 |

Two lessons transfer. First, **structure makes execution reliable**: with scene-graph access, XRintTest reaches 93% coverage where random input reaches 8%. Second, **third-party apps are closed**: AUTOVR could drive commercial Quest apps only by instrumenting their binaries, which no end-user agent could do. XRBench3D is also the closest thing to an executable XR interaction benchmark, but it has no instructions and no pixel perception.

### 2.8 The products: Gemini on Galaxy XR, Meta XR Operator, Siri on visionOS

**Gemini on Samsung Galaxy XR.** The launch post (blog.google, October 2025) claims that Gemini Live understands what you see and do, can "take action on your behalf across your apps", and arranges open windows on "Hey Google, organize these windows". No technical report, benchmark or mechanism is published. Android XR's developer guidance points the other way for in-app control: "To let your users navigate your app using their voice, use the Gemini live API along with function calling", that is, each app builds its own voice control through function calling. Because coverage and success rates are undisclosed, Gemini on Galaxy XR is the strongest **industrial signal** that the idea is timely, but it cannot be assessed as prior art that solves it. If products were ranked with papers by *claimed* scope, it would sit at the top.

**Meta XR Operator.** Introduced on 18 August 2026 as "an OpenXR API layer, now available as an experimental component in the Meta XR SDK (v205)". A runtime MCP (Model Context Protocol) server runs inside the app process, and a proxy keeps the agent connected across app restarts. Through it an agent can, in the blog's words, "Screenshot the running app as rendered in Meta XR Simulator", "Read room geometry (walls, floors, furniture)", "Read the Unity scene hierarchy, check components", "Press buttons, move thumbsticks, pull triggers, point and aim", and "Press buttons, work through menus, and navigate multi-step flows autonomously". The blog also lists the limits: the agent "uses a single aim-ray per hand with no per-finger data", "has no access to audio", "works from screenshots only and cannot watch animations play out", and "operates too slowly for real-time interaction". Its purpose is to close the build-test-verify loop for developers using coding agents; it works only in apps that embed the layer, so it cannot operate the system shell or other apps, and there is no published evaluation. **It is the first vendor channel through which a general LLM agent sees a VR app and drives its UI with controller input**, and its stated limitations (hand articulation, real-time speed, moving content) are exactly the research problems of a 3D GUI agent.

**Siri AI on visionOS 27.** Apple's newsroom (8 June 2026) says Siri can "answer questions related to the content on a user's screen" and "get things done across apps with even more systemwide app actions". The mechanism, explained in the WWDC26 session on App Intents, is semantic: apps declare entities and actions through App Intents, App Entities and view annotations. Apple states plainly that "Siri has an understanding of text on screen, but it's limited to exactly what's in the pixels. For example, Siri can't act on the tracks shown" unless the app adopts these APIs. Apple's design is the **opposite pole** of a pixel-based GUI agent: the assistant acts only on what developers expose. That covers apps that opt in, and leaves the rest of the interface to the user.

### 2.9 The pieces side by side

The figure collects the numbers of the pieces: how well we can perceive XR UI, translate an action into XR input, read intent, and act across a 3D world and 2D panels.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-pieces.svg" localized="true" caption="The numbers of the pieces. (a) Perception: Orienter's interactability F1 at IoU 0.75 on VR screenshots beats a trained detector, while the 2D screen parser OmniParser nearly fails. (b) Action grounding: no LLM produces the exact controller sequence for more than 11.7% of ComboBench's 262 scenarios (y axis to 100% to show the distance). (c) Intent: SIAgent's top-1 intent accuracy depends strongly on the LLM, and adding the hand to gaze almost doubles it. (d) Mixing a 3D world with 2D panels: the best model stays far below humans in every Embodied Web Agents task family." %}

Latency deserves its own picture. A turn of a published XR agent takes between 4 s (DuoZone) and about 49 s (NavAI). For comparison, Maslych et al. (CUI 2025) found that response delays above about 4 s degrade the quality of experience with LLM-driven virtual agents in VR, and real-time game agents act within 100-250 ms. The total latency of one agent step is a sum

$$
t_{\text{step}} = t_{\text{capture}} + t_{\text{upload}} + t_{\text{prefill}} + t_{\text{decode}} + t_{\text{execute}},
$$

and in a headset the world keeps moving during all of it: the user turns their head, so the screenshot the plan was based on is stale when the action executes. Game agents handle this with a fast low-level policy under a slow planner (Lumine's adaptive reasoning, JARVIS-1's planner over controllers); XR agents have not adopted it yet.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-latency.svg" localized="true" caption="Seconds per agent decision, on a log scale. Published XR agents (purple, cyan, orange) sit between 2 s and several minutes, at or above the 4 s point where VR users' quality of experience drops (dashed black). Lumine, a game agent, shows that 0.1-0.25 s (green band) is reachable for real-time 3D control with a 7B model. The red line is the often-quoted motion-to-photon target of about 20 ms, which the rendering loop, not the agent, must meet." %}

Finally, place each work on the stage of the agent loop it covers. Every stage has at least one strong piece, but no system closes the loop on the 3D GUIs of existing apps from a user's request and reports task success.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-loop.svg" localized="true" caption="The perceive-understand-plan-act-verify loop of a 3D GUI agent, with the closest works placed on the stages they cover. Observation (NavAI's field-of-view screenshots, Meta XR Operator, IWSDK), grounding (Orienter, VRSight), intent (SIAgent, GazePointAR, EmBARDiment, Put-That-There), planning (DuoZone, ComboBench), action (XRintTest, VRExplorer, AUTOVR, Operator) and verification (Orienter's reflection, XRI events) all exist separately. The centre, the whole loop evaluated on existing apps, is empty." %}

## 3. Platforms and tooling: what an agent can observe and control

A 3D GUI agent needs two channels into the device: **observation** (what it can see) and **action** (what it can do). On today's XR platforms, how much of each it gets depends mainly on **who the agent is**.

### 3.1 Who the agent is: four levels of access

| Level | Example | Observe | Act | Status (Nov 2026) |
| --- | --- | --- | --- | --- |
| L0: test harness in your own app | Meta XR Operator, IWSDK MCP tools, Jetpack `compose-testing`, Unity XRI simulator | pixels, scene graph, ECS state | device-level input, component writes | exists, experimental |
| L1: agent inside your own app | an on-device planner in a visionOS app; EmBARDiment | own UI plus permitted sensors | own UI | feasible today |
| L2: OS assistant | Siri AI, Gemini Live on Galaxy XR, the Meta AI agent of Meta VR Glasses | system-wide | semantic actions; vendor-only | vendor-only |
| L3: third-party cross-app agent | an "AppAgent for headsets" | 2D panel accessibility trees on Android XR (unverified); nothing on visionOS | accessibility gestures (Android, policy-restricted) | blocked on devices; open in emulators and WebXR |

The research question of this column is an **L3** question (operate other people's apps), but the platforms only open L0-L2. The practical conclusion is to study the L3 problem in environments one controls: WebXR, Unity and the Android XR emulator.

The figure decomposes an XR device into layers, from the sensors at the bottom to semantic app actions at the top, and marks which layers each level of agent can reach.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-channels.svg" localized="true" caption="Observation and action layers of an XR device (left, from raw sensors up to semantic app actions) and which of them each kind of agent can reach (right). A test harness inside your own app (L0) reaches almost everything; an OS assistant (L2) reaches everything the vendor allows; a third-party agent that wants to operate other people's apps (L3) gets at most consent-gated capture, 2D panel trees and, on PC, runtime-level injection." %}

### 3.2 Apple visionOS

- **Observe.** Simulator screenshots are easy. On the device, camera frames and passthrough in screen captures require **enterprise entitlements** with a license file, available only to organizations and only for private distribution; the user starts each broadcast; and any view can opt out of capture with `contentCaptureProtected`. Apps are never told where the user looks: gaze stays inside the system. ARKit hand and world data require a Full Space, so an agent app cannot watch another app.
- **Structure.** SwiftUI windows expose standard accessibility elements; RealityKit 3D content is invisible to VoiceOver unless the developer adds an `AccessibilityComponent` (label, value, traits, system and custom actions, custom rotors). That component is the best existing template for what a "3D accessibility node" should contain.
- **Act.** No third-party input injection. Apple's XCUIAutomation overview states that "UI testing isn't available to apps you build using the visionOS SDK". Assistive modes (Pointer Control, Dwell Control, Switch Control, Voice Control) prove that the UI can be driven by a single ray plus dwell, but third parties cannot drive them programmatically.
- **Semantic route.** App Intents and App Schemas let apps declare actions for Siri; the Foundation Models framework provides an on-device model of about 3B parameters (2-bit quantized) with tool calling, usable for an L1 in-app agent.

visionOS is the most polished 3D UI and the weakest platform for automated research. It is best used for user studies and the semantic route.

### 3.3 Android XR

- **Emulator.** The Android XR emulators (headset, wired glasses, AI glasses) graduated to stable on 6 November 2026 with Jetpack SceneCore and ARCore for Jetpack XR. In the headset emulator, hands "automatically direct their raycasts toward your mouse pointer position", dragging performs a pinch, gaze follows the mouse, and the viewpoint moves with WASD/QE. Only a right-hand pinch exists: "Left-hand controls and alternative gestures, such as grabbing and poking, aren't currently supported."
- **Structure.** Compose for XR documents the clearest official structure of spatial UI on any platform: a 3D subspace semantics tree of containers (spatial panels, orbiters), and separate 2D semantics trees inside each panel, which "operate as distinct hierarchies". An agent's observation should mirror this two-level structure: panel and volume nodes with poses, each holding a 2D widget tree. In-process test APIs (`compose-testing`, `scenecore-testing`) expose it for your own app.
- **Act.** On 2D Android, open GUI agents read `AccessibilityNodeInfo` trees and act with `AccessibilityService.performAction` and `dispatchGesture`. Whether this works for panels placed in 3D, and how gesture coordinates map to panel space, is **undocumented**; a one-day experiment in the emulator would settle it. AppFunctions, Android's semantic action route, requires a privileged caller permission, so in practice it serves system assistants. Gemini's UI automation, previewed on phones (Galaxy S26 and select Pixel 10) on 25 February 2026, offers a reusable safety design: live view, manual takeover at any point, and an alert before sensitive actions. The announcement does not mention XR.

Because 2D Android apps run unmodified as panels, the Android XR emulator is the natural place to ask "does a 2D GUI agent survive being moved into 3D?" with AndroidWorld-style tasks.

### 3.4 Meta Horizon OS (Quest)

- **Observe.** MediaProjection captures "the user's whole view or a single panel" after a consent dialog; immersive apps can block capture through OpenXR. The Passthrough Camera API gives camera frames (up to 1728x1728 on Quest 3/3S, 60 Hz, 20-40 ms latency) with the `HEADSET_CAMERA` permission; camera frames count as Device User Data, with bans on surveillance and on identifying people. Camera frames show the room, not the virtual UI. MRUK gives a room model with labelled anchors (TABLE, COUCH, DOOR_FRAME).
- **Structure.** Horizon OS's gaze-based "Look and Pinch" input "infers interactable elements from your app's view hierarchy and accessibility information": the OS itself uses accessibility metadata to ground gaze on 2D panels, direct evidence that an accessibility tree is a workable grounding substrate for 3D input. But `BIND_ACCESSIBILITY_SERVICE` is on Meta's list of prohibited permissions, so an AppAgent-style accessibility-service agent cannot be distributed in the store.
- **Act.** Meta XR Operator (section 2.8) for apps that embed it; Meta XR Simulator, an OpenXR runtime with synthetic rooms, keyboard/mouse/gamepad input and record-and-replay of sessions, for headset-free runs; scriptable test services that disable the boundary and sleep for unattended runs (which also shows that such controls must never be exposed to an autonomous agent on a worn device).

### 3.5 OpenXR, WebXR and engines

- **OpenXR API layers** sit between an app and the runtime and can log or rewrite poses and button states (OpenXR-Toolkit's hand-to-controller remapping shows that input rewriting under unmodified apps works); Meta XR Operator is itself such a layer. **Monado**, the open-source runtime, has a keyboard-driven HMD and a remote driver that accepts poses over TCP. This is the only channel that works for arbitrary third-party OpenXR apps on PC, but OpenXR has no notion of UI: structure must come from pixels.
- **WebXR** is the most open route. **IWER** (Meta, MIT license) replaces `navigator.xr` with a scriptable headset, controllers and hands. **IWSDK**, Meta's ECS framework on three.js, runs an MCP server with 32 tools: pixels (`capture_canvas`, `browser_screenshot`), structure (`get_scene_hierarchy`, `ecs_snapshot`, `ecs_diff`, `ui_inspect`), input (`set_transform`, `look_at`, `select`, `set_input_mode`) and time control (`ecs_pause`, `ecs_step`), in a headless "agent" mode with a managed Playwright browser. The older Immersive Web Emulator extension was archived on 1 October 2026; new work should build on IWER/IWSDK.
- **Unity** (XR Interaction Toolkit 3.5 with the XR Interaction Simulator, Input System test fixtures) is where most commercial XR UIs are built and where XRintTest's interaction graphs and oracles live. **Godot** has experimental AccessKit screen-reader support for Control nodes, and **Unreal** experimental Slate accessibility; neither has an XR test framework of note.

### 3.6 Privacy, security and store rules

An agent that sees what the user sees, in the user's home, inherits the strictest rules of each platform, and adds risks that 2D agents do not have:

- **Bystanders and rooms.** Camera frames include other people; Meta forbids identifying people from them. In a crowdsourced survey of 1,036 respondents, location data was rated the most sensitive data an XR conversational agent could use (Bozkir and Kasneci, arXiv 2025).
- **Biometrics.** Head and hand motion identify people: Nair et al. (USENIX Security 2023) identified 94.33% of 55,541 users from 100 s of motion. Agent traces are personal data.
- **Physical safety.** Moving windows can occlude real obstacles; changing the boundary or the passthrough level can hide hazards.
- **Deceptive UI and injection.** MetaScanner (Lee et al., accepted in Computers & Security per arXiv) demonstrates four deceptive-UI attacks in social VR, a direct threat to an agent that clicks. Text visible in the room or in other apps' panels is a prompt-injection channel that 2D agents face less (an inference; no XR-specific study was found).
- **Over-reliance.** In a study with 32 participants, AR X-ray visualizations of AI output led to more inappropriate reliance (mostly over-reliance) than a 2D minimap (Liu et al., CHI 2026): realistic in-situ output is persuasive.
- **Irreversible actions** need confirmation, as in Gemini's alert before sensitive tasks and DuoZone's confirm-then-apply.

### 3.7 The feasibility matrix and three prototype stacks

The matrix summarizes, per platform, whether an agent can observe pixels and UI structure, inject input, use an automation framework, and collect data in an emulator.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-feasibility.svg" localized="true" caption="Feasibility matrix for building and testing a 3D GUI agent (status November 2026). Green: works and documented; beige: partial, restricted or own app only; red: not available; grey: undocumented. WebXR with IWER/IWSDK is the only row that is green across the board, but for synthetic apps without an OS shell; visionOS is the most closed; Android XR and Horizon OS sit in between, each with an emulator or simulator and own-app structure." %}

The platform dossier behind this post recommends three stacks for a first prototype, in this order:

1. **WebXR on IWER/IWSDK, driven by Playwright.** 10-20 small WebXR apps with 3D GUIs (settings menus, a window manager, a model viewer, a media player, a form with a keyboard). The agent under test sees only per-eye RGB (optionally with set-of-mark overlays) and acts through device-level input (head pose, controller or hand ray, select or pinch); the checker keeps privileged ECS access for success checks. Open, free, deterministic, headless, with exact ground truth; but synthetic apps and no system UI.
2. **Android XR emulator with an AccessibilityService.** Port AndroidWorld-style tasks; real Android, real apps as panels, system UI; directly comparable with 2D numbers. But spatial accessibility is undocumented and the emulator has only a right-hand pinch.
3. **Unity XRI scenes with the XR Interaction Simulator, optionally Meta XR Simulator and Operator.** Grab, socket and manipulation tasks from XRBench3D, XRI events as oracles, recorded human demonstrations. Realistic, but heavy, and Operator is experimental and slow.

Whatever the stack, the episode log decides what can be learned later. A sensible schema, assembled from existing tools, records one JSON line per tick or event on a single monotonic clock:

| Field | Contents | Existing tools that log something similar |
| --- | --- | --- |
| `head_pose`, `hands`, `controllers` | position and quaternion; 26 OpenXR hand joints or buttons and axes | BOXRR-23 XROR format, Meta XR Simulator VRS capture, IWER `ActionRecorder` |
| `gaze` | origin, direction, hit entity (only where permitted) | GazeBaseVR, Aria |
| `ui_tree` | entity id, role, label, value, world pose and box, visible, interactable, parent | IWSDK `ecs_snapshot`/`ui_inspect`, Jetpack subspace semantics, RealityKit `AccessibilityComponent` |
| `action` | raw device action (pose delta, select, pinch) and semantic action (verb + target id) | GenXR-Bench actor API, IWSDK MCP tools, Meta XR Operator |
| `frames` | per-eye RGB, depth, entity-id mask, set-of-mark overlay, intrinsics and extrinsics | GenXR-Bench screenshots, Orienter frames |
| `outcome` | checker result, reason, final-state hash | OSWorld scripts, AndroidWorld init/check/teardown |

Storing intrinsics and extrinsics matters because a click in an image has to be turned back into a 3D ray. A small piece of geometry shows why pointing is hard in XR: a target of width $s$ at distance $d$ covers a visual angle

$$
\theta = 2\arctan\frac{s}{2d},
$$

so a 2 cm button on a panel 1.5 m away subtends about 0.76°. A 2D grounder that is a few pixels off on a phone screenshot is a few tenths of a degree off in a headset frame, which is enough to miss.

## 4. Datasets and benchmarks for XR interfaces, and the data gap

2D GUI agents were built on datasets of human demonstrations: AITW (715,142 episodes), AndroidControl (15,283 demonstrations over 833 apps), Mind2Web (2,000+ tasks on 137 websites), and executable benchmarks such as AndroidWorld (116 tasks) and OSWorld (369 tasks). XR has nothing like them. What exists:

| Dataset | What it contains | Size | Venue |
| --- | --- | --- | --- |
| Orienter IGE set | right-eye Steam VR screenshots with interactable-element boxes | 1,552 images, 100 apps, 4,470 boxes, 766 categories | FSE 2026 |
| DISCOVR (VRSight) | social-VR frames with 30 classes incl. menu, button, ui-text, HUD | 17,691 images, 17 apps, about 92K instances | UIST 2025 |
| StereoID screenshots | stereo screenshots of VR apps | 171K screenshots, 288 apps | FSE 2024 |
| GUI-World (XR subset) | screen-recorded GUI videos with QA | 393 XR videos, 3,930 QA (of 12,379 videos) | ICLR 2025 |
| ComboBench | semantic actions and recorded controller/HMD sequences, text only | 262 scenarios | arXiv 2025 |
| XRBench3D | Unity scenes with executable interactions | 10 scenes, 456 interactions | Automated Software Engineering 2026 |
| MineXR | personalized XR layouts made on a headset | 31 participants, 695 widgets, 109 layouts | CHI 2024 |
| GenXR-Bench | WebXR development tasks with scripted and VLM actors | 112 tasks | arXiv 2026 |

On VRSight's DISCOVR set, a small YOLOv8n detector reaches 67.3 mAP50 and 46.3 mAP50-95 (menu 62.2, button 45.9), so VR UI-element detection from pixels is feasible but far from solved. Behaviour datasets are abundant (BOXRR-23 with 4.7M motion recordings from 105,852 users, GazeBaseVR with 407 participants at 250 Hz, HOT3D with hands and objects from Aria and Quest 3), but they carry no UI labels.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-datasets.svg" localized="true" caption="XR datasets (purple) and the 2D GUI-agent datasets they would need to match (grey). Left: size on a log scale (units differ). Right: what each set contains. The 2D sets combine frames, UI labels, natural-language tasks and actions; every XR set has at most two of these, except GenXR-Bench, whose tasks are developer tasks and whose actions are scripted test actors (rings)." %}

**There is no public dataset of instruction-to-action trajectories on XR GUIs**, no XR counterpart of AndroidControl, AITW, Mind2Web or OSWorld. The closest substrates are GUI-World's XR videos (QA, not tasks), XRBench3D (interactions without instructions), ComboBench (text without screenshots) and the Orienter and DISCOVR screenshots (boxes without actions). GenXR-Bench's harness comes nearest in architecture: its VLM actors observe a pruned object tree with stable ids and set-of-mark screenshots, act through a viewer, hand, targeting and selection API (`navigateTo`, `setHandPose`, `pointTo`, `rayClick`, ...), and are checked by programmatic assertions; but it evaluates coding agents, not GUI agents. Synthetic rendering with exact entity labels (WebXR, Unity, the Jetpack test APIs) is the scalable route to grounding data, as Jedi's UI synthesis was for 2D.

## 5. The gap

### 5.1 What no work does yet

After the searches behind this column (arXiv, OpenAlex, ACM DL, IEEE Xplore, proceedings, and official product pages, through 24 November 2026), **no peer-reviewed paper or preprint was found that presents an agent which**

- takes a **natural-language** (or speech plus gaze and pointing) request from a headset user,
- **perceives the 3D GUI of existing XR apps** (windows, volumes, menus, widgets placed in depth, partly occluded or outside the field of view) from the rendered view and/or UI structure,
- **plans and executes multi-step operations across apps** with XR input (ray and pinch, controller, gaze, window manager), and
- is **evaluated as a GUI agent**, with task success over a set of instructions and apps;

nor **a benchmark or dataset of instruction-to-action trajectories on XR GUIs**. Two independent search passes of the column's research reached this conclusion, and the 2026 software-engineering survey by Guo et al. names LLM agents for VR GUI exploration as open. The usual caveat applies: absence of evidence in a search is not proof of absence, and industrial systems (Gemini on Galaxy XR above all) may already do parts of this without publishing.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-gap.svg" localized="true" caption="The gap as three overlapping sets: works that perceive the 3D UI of existing XR apps (blue), that understand a natural-language user intent (orange), and that operate the XR UI (green). Each pairwise overlap is occupied (NavAI: pixels and language, but locomotion; Meta XR Operator: pixels and operation, for developer tests; Put-That-There and DuoZone: language and window operation, via metadata). The centre is empty in the published record; Gemini on Galaxy XR claims to be there, but its mechanism and evaluation are undisclosed." %}

### 5.2 What the idea adds, and where to acknowledge overlap

**What exists, piece by piece:** perception of XR GUI elements from pixels (Orienter, DISCOVR); language to controller-action plans without execution (ComboBench); a closed loop from language and screenshots to VR locomotion (NavAI); intent to executed VR operations from gaze and hands (SIAgent); language and deixis to window placement through metadata (Put-That-There; DuoZone, with confirmation); automated execution of 3D interactions without intent (VRExplorer, XRintTest, AUTOVR); infrastructure for agents to see and drive VR apps (Meta XR Operator, IWSDK, XARP Tools); and a shipped assistant with undisclosed cross-app actions and window arrangement (Gemini on Galaxy XR).

**What the 3D GUI agent idea adds:**

1. the **unification** of these pieces into one evaluated perceive-understand-operate loop on the GUIs of existing XR apps;
2. the **3D-specific** parts that no piece addresses: depth, occlusion and off-view UI; 6-DoF manipulation of windows and volumes; the mix of flat panels and 3D content (the Embodied Web Agents failure mode); and gaze and hand deixis as part of the instruction;
3. a **guide mode** in which the same agent shows the user how to operate the UI with spatial cues instead of acting;
4. the **motivation** that operating complexity holds back 3D terminals, which none of the works frames as its problem; and
5. a **benchmark and trajectory data**.

**Where the column acknowledges overlap.** Orienter's arXiv title already speaks of a "Vision-Based Spatial Intelligent Agent" for XR apps. Put-That-There and DuoZone already let an LLM act on the XR window layer from language. Google publicly claims that Gemini on Galaxy XR acts across apps and arranges windows. Meta ships a tool that lets agents work through VR menus. The idea is therefore **timely and partly anticipated**: its novelty rests on the unified, evaluated, user-intent-driven agent for general 3D GUIs, on 3D-specific perception and action, and on the benchmark, not on "agents in XR" in general.

### 5.3 Open problems

1. **A task benchmark.** Fixed apps, natural-language user tasks, device-level actions, viewpoint variation and state-based checkers. XRBench3D, GenXR-Bench's harness and AndroidWorld's init/check/teardown are the templates.
2. **3D perception of UI.** Zero-shot interactable-element F1 is below 50% at IoU 0.75 and collapses at stricter IoU; no work uses stereo, depth or head pose to localize UI elements in 3D.
3. **6-DoF action grounding.** LLMs reach 11.7% exact controller sequences; there is no standard XR action space comparable to tap/swipe/type. Candidates: target id plus verb, ray plus pinch, or 6-DoF pose deltas.
4. **Latency.** Published XR agents take 4-49 s per turn; interactive use tolerates about 4 s; real-time 3D control needs 0.1-0.25 s. Hierarchical control (slow planner, fast local pointing), experience reuse (PastForward reports 1.63-2.36x faster on-device steps) and embodied waiting feedback (Arora et al. found gestures better than spinners in VR) are the levers.
5. **Off-view memory.** Windows behind the user and occluded volumes need spatial memory; VSI-Bench shows MLLMs are weak at it.
6. **API versus GUI actions.** Apple and Google route assistant actions through app intents and function calling, covering only apps that opt in; GUI operation covers everything but is fragile. Hybrid action spaces, which help in CAD agents, are unexplored in XR.
7. **Access.** Third-party apps are closed on devices; 3D accessibility trees (RealityKit's `AccessibilityComponent`, Jetpack's subspace semantics) are underused, and a portable "3D accessibility node" schema in the spirit of W3C's XR Accessibility User Requirements does not exist.
8. **Shared control in space.** How an agent shows what it is about to do (ghost hand, highlight, preview), when to ask, and how to hand control back has been studied for guidance and window layout (DuoZone, Sensible Agent, AgentHands), not for GUI operation. A Vision Pro study (Zhang et al., arXiv 2026, n=24) found that fully autonomous agent play minimized workload but reduced challenge, autonomy, immersion and enjoyment: "do it for me" is not always what users want.
9. **Safety and privacy.** Deceptive UI, prompt injection from the room, bystanders, biometric traces, and physical side effects of moving content.
10. **Data.** No recordings of human XR GUI use with UI annotations and actions.

How this column proposes to attack these problems is the subject of [the research plan]({{ '/blog/2026/3d-gui-agent-05-research-plan/' | relative_url }}); the motivation and research questions are in the [research vision]({{ '/blog/2026/3d-gui-agent-01-research-vision/' | relative_url }}).

## Try it

- In the **capability map** of section 2, switch on the target region and filter by year 2026: which works come closest to its corner, and which of the four properties does each one miss?
- Filter the map by platform "Quest / Horizon OS" and then "Vision Pro": compare what research has been done on each platform with what the feasibility matrix of section 3.7 says the platform allows.
- The home page's [Interactive Lab]({{ '/' | relative_url }}#lab) runs hand-written WebGL in the browser, the same technology as the WebXR stack recommended in section 3.7.

## Representative papers

Status as of November 2026. "arXiv" means preprint only.

| Paper | Authors | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- | --- |
| Look Before You Leap: Context-Sensitive GUI Grounding for Boosting Automated Extended Reality (XR) Testing (Orienter) | Shuqing Li et al. | FSE (PACMSE) | 2026 | [DOI](https://doi.org/10.1145/3808134) | Only peer-reviewed grounding of GUI elements in rendered VR frames |
| ComboBench: Can LLMs Manipulate Physical Devices to Play VR Games? | Shuqing Li et al. | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2510.24706) | Measures language-to-controller action grounding: 11.7% at best |
| NavAI: A Generalizable LLM Framework for Navigation Tasks in Virtual Reality Environments | Xue Qin, Matthew DiGiovanni | ASE Workshops | 2025 | [arXiv](https://arxiv.org/abs/2601.03251) | Closed loop from language and VR screenshots, for locomotion |
| SIAgent: Spatial Interaction Agent via LLM-powered Eye-Hand Motion Intent Understanding in VR | Zhimin Wang, Chenyu Gu, Feng Lu | IEEE TVCG | 2026 | [arXiv](https://arxiv.org/abs/2603.00522) | An agent executes VR operations from inferred intent |
| Revisiting put-that-there, context aware window interactions via LLMs | Riccardo Bovo et al. | ISMAR Adjunct | 2025 | [arXiv](https://arxiv.org/abs/2511.02378) | LLM acts on the XR window layer from speech, pointing and gaze |
| DuoZone: A User-Centric, LLM-Guided Mixed-Initiative XR Window Management System | Jing Qian et al. | IEEE TVCG | 2026 | [arXiv](https://arxiv.org/abs/2511.15676) | Best-evaluated language-driven XR UI system (N=16) |
| Voice2Action: Language Models as Agent for Efficient Real-Time Interaction in Virtual Reality | Yang Su | arXiv | 2023 | [arXiv](https://arxiv.org/abs/2310.00092) | Early language-to-VR-action agent through the engine |
| LLMR: Real-time Prompting of Interactive Worlds using Large Language Models | Fernanda De La Torre et al. | CHI | 2024 | [DOI](https://doi.org/10.1145/3613904.3642579) | LLMs read XR scene graphs and change the world |
| GenXR-Bench: Benchmarking Coding Agents for Interactive XR Development | William Huang et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2610.29014) | Harness with VLM actors that operate XR apps |
| XARP: A Human-First and Agent-Ready Extended Reality Toolkit in Python (arXiv: XARP Tools) | Arthur Caetano et al. | PACM HCI (EICS) | 2026 | [DOI](https://doi.org/10.1145/3816762) | XR toolkit exposed to agents as tools and over MCP |
| GazePointAR: A Context-Aware Multimodal Voice Assistant for Pronoun Disambiguation in Wearable Augmented Reality | Jaewook Lee et al. | CHI | 2024 | [arXiv](https://arxiv.org/abs/2404.08213) | Deictic intent from gaze and pointing |
| EmBARDiment: an Embodied AI Agent for Productivity in XR | Riccardo Bovo et al. | IEEE VR | 2025 | [arXiv](https://arxiv.org/abs/2408.08158) | Gaze over XR windows as LLM context |
| Satori: Towards Proactive AR Assistant with Belief-Desire-Intention User Modeling | Chenyi Li et al. | CHI | 2025 | [DOI](https://doi.org/10.1145/3706598.3714188) | Proactive guidance with an explicit user model |
| Sensible Agent: A Framework for Unobtrusive Interaction with Proactive AR Agents | Geonsun Lee et al. | UIST | 2025 | [arXiv](https://arxiv.org/abs/2509.09255) | How an XR agent should ask, and through which channel |
| Guided Reality: Generating Visually-Enriched AR Task Guidance with LLMs and Vision Models | Ada Yi Zhao et al. | UIST | 2025 | [arXiv](https://arxiv.org/abs/2508.03547) | Visual vocabulary for the guide mode |
| VRExplorer: A Model-based Approach for Semi-Automated Testing of Virtual Reality Scenes | Zhengyang Zhu et al. | ASE | 2025 | [arXiv](https://arxiv.org/abs/2607.10174) | Automated grab/trigger operation of Unity VR scenes |
| Automated Testing of Prevalent 3D User Interactions in Virtual Reality Applications (XRintTest) | Ruizhen Gu et al. | Automated Software Engineering | 2026 | [arXiv](https://arxiv.org/abs/2601.23139) | Interaction Flow Graph and XRBench3D (456 interactions) |
| AUTOVR: Automated UI Exploration for Detecting Sensitive Data Flow Exposures in Virtual Reality Apps | John Y. Kim et al. | USENIX Security | 2025 | [arXiv](https://arxiv.org/abs/2508.12187) | Drives commercial Quest app UIs via binary instrumentation |
| ExploreAI: Agentic Exploration Knowledge Bases for Reproducible Observable-Regression Testing of Black-Box VR and 3D Applications | Jiajie Wang et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2608.21628) | LLM agent explores black-box VR apps |
| VRSight: An AI-Driven Scene Description System to Improve Virtual Reality Accessibility for Blind People (DISCOVR) | Daniel Killough et al. | UIST | 2025 | [arXiv](https://arxiv.org/abs/2508.02958) | Largest VR UI-element detection dataset |
| Characterizing Virtual Reality Software Testing | Dhia Elhaq Rzig et al. | ISSTA | 2023 | [arXiv](https://arxiv.org/abs/2211.01992) | 79% of 314 Unity VR apps have no automated tests |
| Software Engineering Practice in the Virtual Reality/Augmented Reality Software Life Cycle: A Systematic Survey | Hanyang Guo et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2611.18567) | Names LLM agents for VR GUI exploration as open |
| Scaling Instructable Agents Across Many Simulated Worlds (SIMA) | SIMA Team | arXiv | 2024 | [arXiv](https://arxiv.org/abs/2404.10179) | One pixel-to-input policy across 3D games |
| SIMA 2: A Generalist Embodied Agent for Virtual Worlds | SIMA Team | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2512.04797) | Foundation model as planner and policy, self-improvement |
| Lumine: An Open Recipe for Building Generalist Agents in 3D Open Worlds | Weihao Tan et al. | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2511.08892) | Real-time 3D agent: about 0.1-0.25 s to first action |
| VideoGameBench: Can Vision-Language Models complete popular video games? | Alex L. Zhang et al. | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2505.18134) | Real time is first-order: 0.48% vs 1.6% when paused |
| Embodied Web Agents: Bridging Physical-Digital Realms for Integrated Agent Intelligence | Yining Hong et al. | NeurIPS D&B | 2025 | [arXiv](https://arxiv.org/abs/2506.15677) | Switching between 3D world and 2D panels is the main failure |
| VisionClaw: Always-On AI Agents through Smart Glasses | Xiaoan Liu et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2604.03486) | Glasses agent that acts through services |
| Thinking in Space: How Multimodal Large Language Models See, Remember, and Recall Spaces (VSI-Bench) | Jihan Yang et al. | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2412.14171) | Spatial memory from egocentric video is weak |
| GUI-World: A Video Benchmark and Dataset for Multimodal GUI-oriented Understanding | Dongping Chen et al. | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2406.10819) | Only GUI benchmark with an XR subset |
| MineXR: Mining Personalized Extended Reality Interfaces | Hyunsung Cho et al. | CHI | 2024 | [arXiv](https://arxiv.org/abs/2403.08057) | Where people put XR UI |
| Unique Identification of 50,000+ Virtual Reality Users from Head & Hand Motion Data | Vivek Nair et al. | USENIX Security | 2023 | [arXiv](https://arxiv.org/abs/2302.08927) | Agent traces are biometric data |
| Can AR Embedded Visualizations Foster Appropriate Reliance on AI in Spatial Decision-Making? | Xianhao Carton Liu et al. | CHI | 2026 | [arXiv](https://arxiv.org/abs/2507.14316) | In-situ AI output causes over-reliance |
| Mitigating Response Delays in Free-Form Conversations with LLM-powered Intelligent Virtual Agents | Mykola Maslych et al. | CUI | 2025 | [arXiv](https://arxiv.org/abs/2507.22352) | About 4 s is the latency budget in VR |
| MetaScanner: An Empirical Study and Proactive Defense against Deceptive UI Attacks in Social VR | Junhee Lee et al. | Computers & Security (accepted) | 2026 | [arXiv](https://arxiv.org/abs/2611.25608) | Threat model for agents that click XR UI |

Products and platform documents (official sources): [Introducing Galaxy XR](https://blog.google/products/android/samsung-galaxy-xr) (Google, October 2025); [Introducing Meta XR Operator](https://developers.meta.com/horizon/blog/meta-xr-operator-close-the-build-test-verify-loop-for-vr/) (Meta, 18 August 2026); [Apple's Siri AI announcement](https://www.apple.com/newsroom/2026/06/apple-unveils-next-generation-of-apple-intelligence-siri-ai-and-more/) (8 June 2026) and [About visionOS 27 updates](https://support.apple.com/en-us/149067); [Android XR emulator](https://developer.android.com/develop/xr/jetpack-xr-sdk/run/emulator/xr-headsets-glasses); [IWSDK AI-assisted development tooling](https://developers.meta.com/horizon/documentation/web/iwsdk-ai-assisted-dev-tooling); [XCUIAutomation](https://developer.apple.com/documentation/xcuiautomation) (the visionOS UI-testing note).

## Learning resources

- The two research dossiers behind this post, in the repository: `docs/research/3d-gui-agent/03-agents-in-xr-and-3d.md` (123 works with deep notes and overlap ratings) and `04-platforms-and-tooling.md` (156 entries, the feasibility matrix and the prototype stacks).
- Hands-on agent infrastructure: [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) and the [Immersive Web SDK](https://github.com/facebook/immersive-web-sdk) (WebXR, MIT); the [OpenXR API layer documentation](https://github.com/KhronosGroup/OpenXR-SDK-Source/blob/main/src/api_layers/README.md); [Monado](https://monado.freedesktop.org/developing-with-monado.html) for an open runtime; the Unity [XR Interaction Toolkit](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.5/changelog/CHANGELOG.html) and its simulator.
- Spatial UI structure: Apple's [AccessibilityComponent](https://developer.apple.com/documentation/realitykit/accessibilitycomponent) and the Jetpack [Compose for XR testing package](https://developer.android.com/reference/kotlin/androidx/xr/compose/testing/package-summary); the W3C [XR Accessibility User Requirements](https://www.w3.org/TR/xaur/).
- 2D benchmarks to borrow from: [OSWorld](https://arxiv.org/abs/2404.07972) and [AndroidWorld](https://arxiv.org/abs/2405.14573) for checkers and parameterized tasks; [Set-of-Mark prompting](https://arxiv.org/abs/2310.11441) for overlays.

## Exercises

1. Apply the rubric of section 0 to a work that is not in the heat map, for example LLMER, AssistVR or Guided Reality. Which property is the hardest to rate, and why?

   <details markdown="1"><summary>Hint</summary>

   Start from the output of the system: code or JSON that changes the world (LLMER), edits through speech and raycast (AssistVR), or guidance overlays (Guided Reality). The "operate" column is usually the hard one, because the line between editing the world, operating an interactable and guiding is a matter of definition; write down which rule you used, as the post did.
   </details>

2. A user in a headset turns their head at 60°/s while an agent's turn takes 4 s. How far has the view rotated between the screenshot and the action? What does this imply for an agent that clicks image coordinates, and what would you send to the executor instead?

   <details markdown="1"><summary>Hint</summary>

   240°: the target may now be behind the user. Coordinates in a stale image are meaningless; send a target that survives head motion, such as an entity id or a world-space ray or point anchored in the room, and let a fast local controller re-aim at execution time (section 2.9).
   </details>

3. Using $\theta = 2\arctan(s/2d)$, compute the visual angle of a 2 cm button at 0.5 m, 1.5 m and 3 m. If a headset frame of 960 pixels covers about 100° horizontally, how many pixels wide is the button in each case?

   <details markdown="1"><summary>Hint</summary>

   About 2.29°, 0.76° and 0.38°, that is about 22, 7 and 4 pixels at 9.6 pixels per degree. At 3 m the button is near the size where 2D grounders become unreliable (compare ScreenSpot-Pro's small targets in large screenshots), and an error of two pixels is half the button.
   </details>

4. Design one task for a 3D GUI agent benchmark on the WebXR stack of section 3.7: write the instruction, the initial state, the observation the agent gets, its action space, and the success check. Which IWSDK tools does the checker use, and which must be hidden from the agent?

   <details markdown="1"><summary>Hint</summary>

   For example: "Move the music player behind me to the left of the browser and pause the song." Initial state: two panels, one outside the field of view. Agent: per-eye RGB plus head pose and a controller ray with select. Checker: `ecs_snapshot` for panel poses and the player's state. Hide `ecs_set_component`, `get_scene_hierarchy` and `ui_inspect` from the agent, or it can bypass perception.
   </details>

5. Gemini on Galaxy XR and Siri on visionOS take different routes to acting in apps. List two advantages of the API-first route and two of the GUI-first route for an end user, and propose a hybrid policy.

   <details markdown="1"><summary>Hint</summary>

   API-first: reliable, fast, and the developer controls what is exposed; but it covers only apps that opt in, and only the actions they declared. GUI-first: covers every app and every visible control, and the user can watch what happens; but it is slow and fragile. A hybrid tries declared intents first and falls back to GUI operation with confirmation, the way CAD agents fall back between API calls and clicks.
   </details>

**Next:** [The research plan]({{ '/blog/2026/3d-gui-agent-05-research-plan/' | relative_url }}).
