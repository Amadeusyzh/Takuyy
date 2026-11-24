---
layout: post
title: "GUI agents on 2D screens: a survey to November 2026"
date: 2026-11-24 12:02:00+0900
description: "How AI agents operate phones, desktops and the web: the perceive-plan-ground-act loop, screenshots versus accessibility trees, grounding models from SeeClick to GroundCascade, planning, reflection and memory, training with synthetic data and reinforcement learning, benchmarks and the state of the art as of November 2026, humans in the loop, safety, and what carries over to 3D interfaces."
categories: 3d-gui-agent
tags: [gui-agent, computer-use, grounding, screenspot, osworld, androidworld, reinforcement-learning, set-of-mark, xr]
series: 3d-gui-agent
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## Why this matters

The [research vision]({{ '/blog/2026/3d-gui-agent-01-research-vision/' | relative_url }}) of this column is to bring GUI agents, AI agents that operate graphical user interfaces on a user's behalf, to the 3D interfaces of VR, AR and MR devices. Before asking what a 3D GUI agent should look like, we need an accurate picture of what 2D GUI agents already are. On phones, desktops and the web, the field moved remarkably fast: in April 2024 the best model completed 12.2% of the computer tasks in OSWorld, against 72.4% for people; by December 2025 an agent system passed the human baseline, and in 2026 frontier models ship "computer use" as a built-in skill. Almost every design decision a 3D agent will face (what to observe, how to point at a target, which actions to allow, how to train, how to evaluate, when to ask the user) has been argued over, measured and partly settled on 2D screens.

This post is a survey of that work up to **November 2026**. It is organized by ideas rather than by papers: the agent loop, observation, grounding, planning and memory, training, evaluation, humans and safety. For the key methods it explains how they work (inputs, outputs, training signal, loop) and gives the numbers that matter. Every section ends with what it means for 3D interfaces, and the last section collects these threads into a careful list of what transfers and what breaks. The companion posts look at the 3D side: [why 3D interfaces are hard to operate]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }}) and [agents in XR, the platforms and the gap]({{ '/blog/2026/3d-gui-agent-04-agents-in-xr-and-the-gap/' | relative_url }}).

## Prerequisites

- Basic familiarity with large language models (LLMs) and vision-language models (VLMs): a VLM reads images and text and writes text.
- The idea of a Markov decision process and of policy-gradient reinforcement learning (the [world models series]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}) and the [embodied AI series]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }}) cover both).
- No GUI-agent background is assumed.

A note on numbers. Benchmark scores below come from papers, vendor pages and leaderboards that use different harnesses, step limits and benchmark versions, so they are only roughly comparable across sources. Each number is given with its source and date; "secondary" marks numbers known only from press or aggregators; most 2025-2026 industrial systems are technical reports on arXiv without peer review, and are marked as such.

## 1. What a GUI agent is

### 1.1 The loop

A **GUI agent** receives a task in natural language ("turn on Wi-Fi", "book the cheapest flight to Osaka on Friday") and completes it by operating the same graphical user interface (GUI) a person would use: it looks at the screen, decides what to do, and sends taps, clicks, keystrokes and scrolls. The task is therefore solved *through the interface*, not through a special API for each app. That is the whole point: any app that a person can use becomes usable by the agent, without the app's developer doing anything.

Formally, an episode is a partially observable decision process. At step $t$ the agent has the instruction $g$, the current observation $o_t$ (a screenshot, a text description of the screen, or both) and its own history $h_t$ of earlier observations, thoughts and actions. A policy $\pi$ outputs an action $a_t$; the device executes it and produces the next screen $o_{t+1}$. The episode ends when the agent outputs `finish`, declares the task infeasible, asks the user, or runs out of steps. Success is judged on the final state of the device $s_T$:

$$
a_t \sim \pi(\,\cdot \mid g,\; o_{\le t},\; a_{<t}), \qquad \text{success} = \mathbb{1}\big[\,\mathrm{check}_g(s_T) = \text{true}\,\big].
$$

Inside $\pi$, most systems run some version of the loop in the figure below: **observe** (and possibly parse the screen into elements), **plan** the next step, **ground** it (turn "the Share button" into a concrete screen location), **act**, then **verify or reflect** on the result and **update memory**. Two side channels matter more than they first appear: the agent can **ask** the user (to resolve ambiguity or confirm a consequential action), and it can decide to **stop**.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/02-agent-loop.svg" localized="true" caption="Anatomy of a 2D GUI agent. The main loop (purple) runs observe, plan, ground, act; the device returns the next screen (green). Framework agents implement each box as a separate module or prompt; native agent models (dashed envelope) do all four in one vision-language model. Memory and reflection (blue) and the ask/confirm channel to the user (red) are where systems differ most." %}

Two architectural families share this loop:

- **Framework agents** (2023-2024 and still common): a general LLM or VLM is prompted in each role, with hand-built perception (accessibility tree, OCR, icon detectors), memory files and sometimes several cooperating agents. AppAgent, Mobile-Agent, AutoDroid, UFO, Agent S and SeeAct are examples.
- **Native agent models** (from late 2024): one VLM is trained end to end to map a screenshot plus history to a thought and an action. UI-TARS, Aguvis, OpenCUA, GUI-Owl, MAI-UI and the computer-use modes of frontier models (Claude, OpenAI's CUA and GPT-5.x, Gemini) belong here.

The distinction is not strict: native models are often wrapped in a light framework (a planner, a reflector, a memory) and framework agents increasingly call a trained grounding model.

### 1.2 A short history, 2016-2026

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/02-timeline.svg" localized="true" caption="Milestones of GUI agents, 2016-2026, in chronological order (rows are evenly spaced, not to scale in time). Colours mark the strand: UI data and understanding (blue), reinforcement learning on synthetic UIs (green), LLM/VLM agent systems (purple), grounding and native models (orange), benchmarks (grey), commercial computer use (red). Note how the bottom half, 2024-2026, is denser than the first eight years together." %}

The history falls into four phases, as the timeline shows.

**UI data and UI understanding (2016-2022).** HCI and mobile-systems groups mined apps at scale. ERICA (UIST 2016) and Rico (UIST 2017; 72k+ unique Android screens with view hierarchies and interaction traces) made screens into data. Models learned to caption widgets, summarize screens (Screen2Words) and embed them (Screen2Vec, UIBert). Seq2Act (ACL 2020) mapped instructions such as "turn on airplane mode" to action sequences, reaching 70.59% complete match on its PixelHelp test set. Google's Spotlight (ICLR 2023) and Pix2Struct (ICML 2023) then showed that a model reading **only the screenshot** could beat models given the view hierarchy, which is often missing or wrong. Accessibility research (SUGILITE; Screen Recognition, which rebuilds accessibility metadata from pixels) contributed the idea of driving apps through, or reconstructing, accessibility information.

**Reinforcement learning on synthetic UIs (2017-2022).** In parallel, RL researchers built World of Bits / MiniWoB (ICML 2017), small web tasks with scripted rewards (click this button, fill this form), and MiniWoB++ (ICLR 2018), where a few demonstrations constrain exploration. AndroidEnv (2021) wrapped the Android emulator as an RL environment. DeepMind's CC-Net (ICML 2022) reached mean human-level performance on MiniWoB++ from pixels plus DOM, but needed about 2.4 million human demonstrations: pixel-level control worked, at a data price nobody could pay for real apps.

**LLM and VLM agent systems (2023-2024).** With GPT-4 and GPT-4V, prompted agents appeared on every platform at once: AppAgent, Mobile-Agent, AutoDroid and MobileGPT on Android; UFO, Cradle and Agent S on desktops; MindAct, SeeAct and WebVoyager on the web. Large datasets (Android in the Wild, AITW: 715,142 episodes) and the first realistic benchmarks (Mind2Web, WebArena, OSWorld, AndroidWorld) appeared. The main lesson of this phase was that planning was not the bottleneck; **grounding** was.

**Native models, RL at scale and commercial computer use (2024-2026).** Grounding models trained on millions of synthetic elements (SeeClick, UGround, OS-Atlas) and end-to-end agent models (UI-TARS, January 2025) replaced hand-built perception. Anthropic released computer use for Claude (October 2024), OpenAI its Computer-Using Agent and Operator (January 2025), Google Gemini 2.5 Computer Use (October 2025); with GPT-5.4 (March 2026) computer use became a native skill of a general model. R1-style reinforcement learning (2025) and multi-turn online RL in thousands of parallel virtual machines pushed scores past human baselines on several benchmarks, which were then replaced by harder ones (ScreenSpot-Pro, OSWorld 2.0).

### 1.3 Three platforms

The loop is the same everywhere, but the three platforms differ in what the agent can see and do:

| Platform | Typical observation | Action channel | Environment for experiments |
| --- | --- | --- | --- |
| Phone (Android, iOS) | screenshot, Android view hierarchy / accessibility tree | tap, long press, swipe, type, back, home (via `adb` or an accessibility service) | Android emulator snapshots (AndroidEnv, AndroidWorld), real-device farms |
| Desktop (Windows, macOS, Linux) | screenshot, OS accessibility API (Windows UI Automation, macOS AX) | mouse move / click / drag, keyboard, hotkeys, scroll; shell and app APIs | virtual machines with snapshots (OSWorld, Windows Agent Arena) |
| Web | screenshot, DOM, browser accessibility tree | click, type, scroll, navigate, tabs (via Playwright / Chrome DevTools Protocol) | self-hosted sites (WebArena), live websites (Online-Mind2Web) |

Phones have small screens, touch gestures and many apps without good accessibility labels. Desktops have large, high-resolution screens with tiny targets, overlapping windows and professional software. The web has the richest structure (the DOM) but also the most adversarial content.

**For 3D.** The loop transfers unchanged in shape, and the success definition (a check on the final state) does too. What changes is everything inside the boxes: the observation is a viewpoint, not a screen; "ground" must produce a target in space; "act" includes continuous 6-DoF motion; and the device is a headset whose state includes the user's body and room. Section 8 goes through each box.

## 2. Observation: what the agent sees

### 2.1 Structured observations: view hierarchies, accessibility trees and the DOM

Every GUI toolkit keeps a tree of widgets. Android exposes it as the view hierarchy and, for assistive technology, as an **accessibility tree** (each node has a role, a text or content description, a bounding box and flags such as clickable or checked). Windows has UI Automation, macOS the AX API, and the web has the DOM plus a browser accessibility tree. Serialized as text, the tree gives a language model exactly what it is good at: a list of named, typed elements with coordinates. The first LLM agents (DroidBot-GPT, AutoDroid, UFO, MindAct) used it, and it has clear strengths: labels are exact, invisible state (checked, disabled, off-screen items in a list) is available, and the element to act on can be named rather than located.

Its weaknesses are just as clear, and they decided the debate. Trees are **missing or wrong** in many apps: custom-drawn widgets, canvases, games, web apps built from `div`s and icon buttons without labels. They are **long**: the raw HTML of a modern page is far beyond what a model can read in each step, which is why MindAct (the Mind2Web baseline) first ranked candidate elements with a small model before asking the LLM. And they are **platform-specific**: an agent built on Android's accessibility service does not run on Windows.

### 2.2 Screenshots

A screenshot is universal: every app on every platform renders pixels. A VLM turns it into visual tokens. With the patching scheme of the Qwen2.5-VL family, on which most 2025 GUI models are built, one visual token covers a 28 x 28 pixel area, so a 1080 x 2400 phone screenshot costs about $(1080/28)(2400/28) \approx 3{,}300$ tokens and a 1920 x 1080 desktop about 2,600. That is affordable, but small text and icons that occupy a few patches are hard to read; high-resolution encoders (CogAgent's 1120 x 1120 branch), tiling (Ferret-UI's "any resolution" sub-images) and token pruning (ShowUI) all address this.

The difficulty with pixels is not reading but **pointing**: a general VLM in 2023 could describe a screen well but could not say *where* the Save button was. Two answers emerged: give the model labels to refer to (next subsection) or teach it to output coordinates (section 3).

### 2.3 Set-of-Mark labels and screen parsers

**Set-of-Mark (SoM) prompting** (Yang et al., 2023) overlays numbered marks on segmented regions of an image so that the model can answer "17" instead of a coordinate. GUI agents adopted it at once: WebVoyager, MM-Navigator, AppAgent and Mobile-Agent draw a box and a number on each interactive element, taken from the accessibility tree when it exists or from detectors when it does not. **OmniParser** (Microsoft, 2024) builds the marks from pixels alone: a fine-tuned YOLOv8 detector finds icons, a BLIP-2 captioner describes them, and OCR reads text. With GPT-4V, a screenshot-only OmniParser agent beat GPT-4 given the page's HTML on Mind2Web (step success 36.5 vs 30.1 cross-website, 42.0 vs 26.4 cross-domain).

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/02-observations.svg" localized="true" caption="One toy settings screen as three observations. (a) The screenshot alone: universal, but the model must find targets in pixels. (b) Set-of-Mark: numbered boxes on clickable elements, so the model can answer with a mark number. (c) The serialized accessibility tree: exact labels, roles, states (checked) and boxes, but only if the app exposes them. The interactive widget in section 4 uses the same three views." %}

Marks have costs too: detector errors propagate, marks clutter dense screens and can hide the content they label, and SeeAct (ICML 2024) found image annotation markedly weaker than giving GPT-4V a textual list of candidate elements (offline Mind2Web step success 20.3 vs 39.1 on cross-task).

### 2.4 Which observation won, and why

The evidence changed with the models. The figure collects the clearest comparisons in which only the input changes.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/02-input-evidence.svg" localized="true" caption="Task success with different inputs, same agent, from four studies. OSWorld (Xie et al., NeurIPS 2024, Table 5): for GPT-4V a screenshot alone gives 5.26% and screenshot + accessibility tree 12.17%; for GPT-4o the tree alone gives 11.36% and the screenshot alone 5.03%. AndroidWorld (Rawles et al., 2024): GPT-4 Turbo with the text accessibility tree 30.6%, with screenshot + Set-of-Mark 25.4%. EntWorld (Mo et al., 2026), a trained agent on enterprise web apps: screenshot 15.6%, tree 35.2%, both 53.7%. In 2024 general models did better with text; hybrids help most when available." %}

In 2024, general models used as agents did better with text than with pixels, and best with both. What changed in 2025 is that **models trained for GUIs** made screenshot-only agents competitive and then dominant: UI-TARS, Aguvis, GUI-Owl, MAI-UI and the frontier computer-use modes all act from screenshots alone; GPT-5.4 reports 92.8% on Online-Mind2Web "screenshot-only" (OpenAI, March 2026). Three reasons explain the shift:

1. **Coverage.** Pixels exist for every app; trees do not. An agent that needs a tree fails silently on canvases, games, remote desktops and badly labelled apps.
2. **Training data.** Grounding data can be generated at scale *from* structure (DOM boxes rendered as screenshots, section 3), so a vision model can learn what the tree knew, then work without it.
3. **One model for all platforms.** A screenshot plus generic input events (tap, click, type) is the same interface on Android, Windows and the web, which is what cross-platform native models need.

Trees did not disappear. Where they exist they remain a strong extra signal (EntWorld's hybrid result), Windows agents such as UFO2 fuse UI Automation with vision parsing, and Apple and Google route assistant actions through app intents and accessibility APIs rather than pixels.

**For 3D.** The screenshot-first lesson transfers: a rendered view of the XR scene is a valid primary observation, and an XR version of OmniParser (a detector and captioner over rendered frames) is buildable. The structured side channel is even richer in 3D, because engines know every object's name, type, pose and interactability (the scene graph), and visionOS and Android XR extend their 2D accessibility stacks to spatial apps. What breaks: a headset view is egocentric and changes with every head movement, so one UI state yields many images; the frame contains depth, stereo, occlusion and passthrough of the real world; and many immersive apps render custom 3D UI with no accessibility metadata at all, the situation Screen Recognition addressed for iOS in 2021. The agent's "screen" also becomes a choice: the user's view, a virtual camera placed elsewhere, or a map of the room.

## 3. Grounding: from "the Share button" to a screen location

### 3.1 The problem and its metric

**GUI grounding** maps a referring expression (an instruction such as "open the share menu" or a description such as "the Share icon at the bottom left") and a screenshot to the location of the element to act on. A grounding benchmark gives $N$ triples (screenshot, instruction, target box $B_i$), the model outputs a point $\hat p_i$, and accuracy is the fraction of points inside their boxes:

$$
\mathrm{Acc} = \frac{1}{N}\sum_{i=1}^{N} \mathbb{1}\big[\hat p_i \in B_i\big].
$$

A point is the natural output because a tap or click is a point. The metric hides an important geometric fact: whether a slightly wrong point still counts depends on the target's size. If the prediction error is roughly Gaussian with standard deviation $\sigma$ pixels in each axis, and the target is a box of half-width $a$ and half-height $b$ centred on the true point, the hit probability is

$$
P(\text{hit}) = \operatorname{erf}\!\Big(\frac{a}{\sigma\sqrt2}\Big)\,\operatorname{erf}\!\Big(\frac{b}{\sigma\sqrt2}\Big).
$$

For a 44 x 44 px phone icon ($a = b = 22$) and $\sigma = 8$ px this is 0.99; for a 12 px toolbar icon on a 4K professional application ($a = b = 6$) the same error gives 0.30. The same model, the same error, a very different score: this is the gap between ScreenSpot and ScreenSpot-Pro in section 3.4, and the grounding mode of the widget in section 4 lets you try it.

### 3.2 Three ways to output a location

1. **Choose an element** from a list (mark index, element id, DOM node). Simple and exact, but only as good as the list: it needs a tree or a parser.
2. **Write coordinates as text tokens.** The VLM simply outputs `click(x=412, y=873)`. SeeClick (ACL 2024) continually pretrained Qwen-VL on about one million grounding samples to do this; UI-TARS and most later models follow, with coordinates either normalized or in absolute pixels depending on the base model. It needs no parser, but a coordinate written as digits receives weak spatial supervision (an answer one pixel off is as "wrong" to the cross-entropy loss as one a screen away) and gives a single brittle point with no confidence.
3. **Predict a heatmap.** GUI-Actor (NeurIPS 2025) adds an `<ACTOR>` token whose attention over the visual patches is the output: every patch overlapping the target box is supervised, the peak is the click, and a small verifier ranks candidate regions. The spread of the map is a natural confidence signal.

### 3.3 The grounding models

The table lists the models that shaped the area. Scores are on ScreenSpot (SS), its corrected version ScreenSpot-v2 (SS-v2) and the professional, high-resolution ScreenSpot-Pro (SS-Pro), as reported by the paper or model card cited.

| Model (first version) | What is new | Data / base | Reported grounding |
| --- | --- | --- | --- |
| SeeClick (Jan 2024; ACL 2024) | Grounding pretraining; introduced ScreenSpot | ~1M samples on Qwen-VL | SS 53.4 (CogAgent 47.4, GPT-4V 16.2) |
| CogAgent (Dec 2023; CVPR 2024) | 1120 x 1120 high-resolution cross-attention branch | 18B; CCS400K screenshots | SS 47.4 |
| Ferret-UI (Apr 2024; ECCV 2024) | "Any resolution" sub-images for tall screens and small widgets | Apple; mobile UI tasks | Android grounding 83.5 vs GPT-4V 4.7 (its own tasks) |
| OmniParser (Aug 2024) | Pixel-only parser: icon detector + captioner + OCR, marks for any VLM | YOLOv8, BLIP-2 | SS 73.0 with GPT-4V |
| UGround (Oct 2024; ICLR 2025) | Pure-vision grounder trained on synthetic web elements | ~10M elements, 1.3M screenshots | SS 77.7 / 86.3 / 89.4 (2B / 7B / 72B, Qwen2-VL) |
| OS-Atlas (Oct 2024; ICLR 2025) | Cross-platform grounding corpus; introduced SS-v2 | 13.58M elements, 5 platforms | SS 82.47 (7B); SS-Pro 18.9 |
| ShowUI (Nov 2024; CVPR 2025) | UI-guided visual token selection (fewer tokens) | 2B | lightweight vision-language-action model |
| Aria-UI (Dec 2024; ACL 2025) | Mixture-of-experts grounder using action history as context | MoE | context-aware grounding |
| UI-TARS (Jan 2025) / UI-TARS-1.5 (Apr 2025) | Native agent model; RL-trained 1.5 | Qwen2-VL; ByteDance | SS-Pro 38.1 (72B) / 61.6 (1.5) |
| Jedi (May 2025; NeurIPS 2025 D&B) | UI decomposition and synthesis; OSWorld-G benchmark | 4M synthetic examples | o3 + Jedi lifts OSWorld 23% to 51% |
| GUI-Actor (Jun 2025; NeurIPS 2025) | Coordinate-free attention head + verifier | Qwen2.5-VL-7B | SS-v2 92.1 (92.5 w/ verifier); SS-Pro 44.6 (47.7) |
| UI-Venus (Aug 2025) | RL fine-tuning with point-in-box reward | 7B / 72B | SS-Pro 61.9 (72B) |
| Ferret-UI Lite (Sep 2025) | 3B on-device agent | Apple | SS-v2 91.6; SS-Pro 53.3 |
| Holo2 (Nov 2025, blog) | Open localization models from H Company | Qwen3-VL | SS-Pro 66.1 (30B-A3B) |
| UI-Venus-2 (Aug 2026) | Verified tasks across 170+ apps | 27B | SS-Pro 74.1 |
| GroundCascade (Nov 2026) | Cascade: a second grounder only when the first is unsure | system of models | SS-Pro 85.33 |

All entries without a venue are arXiv technical reports. The progression has a clear logic: first teach a VLM to point at all (SeeClick, CogAgent), then scale the data synthetically (UGround, OS-Atlas, Jedi), then change the output head (GUI-Actor), then train with reinforcement learning on cheap rule-based rewards (section 5.3), and finally spend more computation at test time on the hard cases (section 3.5).

### 3.4 ScreenSpot versus ScreenSpot-Pro: the grounding gap

ScreenSpot (600+ screenshots, 1.2k+ instructions on iOS, Android, macOS, Windows and web) quickly saturated above 90%. **ScreenSpot-Pro** (K. Li et al., April 2025; ACM MM 2025) moved to 23 professional applications in five industries on three operating systems: CAD, video editing, scientific and office software on high-resolution screens, where targets are tiny and similar-looking. At release the best model scored 18.9%.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/02-grounding.svg" localized="true" caption="(a) The same model on ScreenSpot (or -v2) and on ScreenSpot-Pro: OS-Atlas-7B drops from 82.5 to 18.9, GUI-Actor-7B from 92.1 to 44.6, Ferret-UI Lite from 91.6 to 53.3; by July 2026 Qwen-UI-Agent reaches 97.5 and 81.5 (the latter with zoom-in). (b) ScreenSpot-Pro results over time by method type: single-pass models (purple, with their running best), zoom or search procedures (orange squares), a cascade of grounders (red diamond) and one report whose setting the abstract does not state (grey triangle). Single-pass accuracy rose from 18.9% to 74.1% in sixteen months; search and cascades add another 7-11 points." %}

Panel (a) shows the gap: the same models lose 30-60 points when the targets become small and the screens large and dense. Panel (b) shows how the gap closed. Single-pass accuracy rose from 18.9% (April 2025) through 61.6% (UI-TARS-1.5, April 2025) and 67.9% (MAI-UI, December 2025) to 74.1% (UI-Venus-2-27B, August 2026). GUI-Owl-1.5 reports 80.3% (February 2026) without stating the inference setting in its abstract.

### 3.5 Look, then zoom: search and cascades

ScreenSpot-Pro's own paper proposed **ScreenSeekeR**, a training-free procedure in which a planner model proposes the region where the target should be, the grounder searches that crop, and the search recurses: 48.1% without any training, against 18.9% for the best single pass. The lesson, that **reducing the search area helps more than a bigger model**, was absorbed into later models as an explicit zoom step (GUI-ARP's adaptive region perception; MAI-UI's zoom mode, 73.5% vs 67.9% single pass; Qwen-UI-Agent 81.5% with zoom) and into iterative refinement (Chain-of-Ground, 68.4%). GroundCascade (November 2026) asks a second grounder only when the first one's prediction looks unreliable, and reaches 85.33%.

Look-then-zoom is the 2D version of what a headset does with **foveated rendering** and gaze: spend resolution where the target is likely to be. It is also a reminder that test-time computation (section 4.6) works for perception as well as for planning.

### 3.6 Split the planner from the grounder

If grounding is the bottleneck, one option is to let a strong general model plan and a specialist ground. SeeAct (ICML 2024) measured the bottleneck directly on live websites: GPT-4V completed 51.1% of tasks when a human did the grounding ("oracle"), but only 37.8% with the best automatic grounding. Jedi showed the other direction: OpenAI's o3 as planner went from 23% to 51% on OSWorld when its clicks were grounded by the 7B Jedi model. Agent S2 (2025) pushed the idea to a **mixture of grounders** (visual, textual and structural specialists chosen per target), and Phi-Ground (2025) studied the training of such specialist grounders systematically.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/02-design-levers.svg" localized="true" caption="Three design levers, each measured with the model held fixed. (a) AppAgent (CHI 2025) with GPT-4 on its phone tasks: raw coordinate actions 2.2% success, a simplified element-level action space 48.9%, plus app documents written by autonomous exploration 73.3%, by watching demonstrations 84.4%, by hand 95.6%. (b) SeeAct on live websites: best practical grounding 37.8% vs oracle grounding 51.1%. (c) OSWorld: o3 alone 23%, o3 planning with the Jedi grounder 51%." %}

**For 3D.** Grounding transfers better than any other part, and in some ways gets easier: the best 2D grounders already output heatmaps (GUI-Actor) or zoom in two passes, which map directly to **ray casting** through the heatmap peak and to gaze-guided foveation; and synthetic grounding data, generated in 2D from the DOM, can be generated in 3D from the engine, which can render any object from any viewpoint with an exact label. What breaks: the output is no longer a pixel but an object or a volume. One pixel can correspond to several objects at different depths; small, distant or edge-on targets project to a few pixels (the ScreenSpot-Pro problem, made worse by headset optics); targets can be occluded or outside the field of view; and instructions are often relative to the user's body ("the panel on my left"). Section 8.2 makes this concrete.

## 4. Planning, reflection and memory

### 4.1 Reasoning before acting

Almost all agents write a short **thought** before each action, in the ReAct style: "The Wi-Fi switch is off; tap it" followed by `tap(...)`. AitZ (2024) annotated Android episodes with chain-of-action-thought (what the screen shows, what the action should achieve, what happened), and UI-TARS trained its native model on "System-2" reasoning traces that include task decomposition, reflection and milestone recognition. Reasoning helps planning; for pure grounding it can hurt: GUI-G1 (2025) found that long chains of thought lower grounding accuracy, and many grounders answer with coordinates directly.

### 4.2 The action space

The action space is a design decision with large effects. A typical mobile action space is `tap(x, y)`, `long_press(x, y)`, `swipe(start, end)`, `type(text)`, `back`, `home`, `wait`, plus three non-device actions: `finish`, `infeasible` (the task cannot be done here; MoTIF, ECCV 2022, made this a research question) and `ask_user(question)`. Desktop agents add mouse moves, drags, scrolling, keyboard shortcuts and window management.

Panel (a) of the design-lever figure shows how much this choice matters: AppAgent's success rose from 2.2% with raw actions to 48.9% with a small action space over numbered elements, before any other improvement. Agent S (ICLR 2025) generalized the point into the **Agent-Computer Interface (ACI)**: design the interface *for the agent* (a constrained, grounded action set with immediate feedback) rather than force it through the human one.

The strongest recent systems **mix GUI actions with programmatic ones**. UFO2 (2025) calls a native application API when one exists and falls back to GUI clicks when it does not; CoAct-1 (2025) lets an orchestrator choose between a GUI operator and a programmer agent that writes scripts, reaching 60.76% on OSWorld; UI-TARS-2 and Qwen-UI-Agent (2026) unify GUI, terminal (CLI) and file-system actions; MAI-UI adds Model Context Protocol (MCP) tool calls and explicit user interaction to the action space. MobileWorld (2025) turned asking the user and MCP tools into scored task types. A cross-interface authorization study (2026) draws the security conclusion: consent should be tied to the *effect* of an action, whether it is issued through a click, a command line or an API.

### 4.3 Reflection and verification

A single wrong tap can send an agent into the wrong app; what separates good agents from bad ones is whether they notice. **Mobile-Agent-v2** (NeurIPS 2024) added a reflection agent that compares the screens before and after each action and classifies the action as correct, erroneous (wrong page: go back) or ineffective (nothing changed: try something else); together with a planning agent that keeps a task-progress summary and a memory unit for focus content, it raised success on its benchmark from 43.2% (v1) to 75.0%. UI-TARS uses **reflection tuning**: mistakes found in its own online traces are paired with corrections, and the model is trained on the corrected continuations, so recovery becomes part of the policy.

Verification can also choose between candidates. GTA1 (ICLR 2026) samples several plans and lets a judge pick one. **Agent S3** (2025; TMLR 2026) scales this to whole episodes with *Behavior Best-of-N*: run several complete rollouts, turn each into a short "behaviour narrative" of what changed on screen, and let a judge compare the narratives. This gave 72.6% on OSWorld, the first published result above the 72.36% human baseline (December 2025).

The negative result is equally important: the failure analysis of OSWorld 2.0 (June 2026) says that agents still "lose track of constraints, miss information that arrives mid-task, guess rather than ask the user, and skip verification".

### 4.4 Memory and exploration

Agents need two kinds of memory. **Within a task**, they must track progress and remember information read on one screen and needed on another (Mobile-Agent-v2's memory unit, Mobile-Agent-v3's notetaker). **Across tasks**, they can accumulate knowledge about apps:

- **Exploration documents.** AppAgent first lets the agent explore an app (or watch a human), then writes a document describing what each element does. Its success rose from 48.9% to 73.3% with self-explored documents, 84.4% with demonstration-based ones and 95.6% with manual documentation (design-lever figure, panel a).
- **UI transition graphs.** AutoDroid (MobiCom 2024) explores apps offline without an LLM, builds a graph of which action leads to which screen, and turns it into prompt hints at run time: 71.3% task success with GPT-4 on its DroidTask benchmark, and 51.7% lower query cost.
- **Reusable skills.** MobileGPT stores sub-tasks; Agent Workflow Memory (ICML 2025) induces reusable workflows from past episodes (+24.6% and +51.1% relative on Mind2Web and WebArena); Mobile-Agent-E (2025) writes "Tips" and "Shortcuts" after each task (+22% absolute on Mobile-Eval-E); AppAgentX compresses repeated action chains into new high-level actions. Agent S4 (October 2026) goes furthest: a meta-agent evolves the agent's own tools, scripts and usage knowledge, and with a 27B open model reaches 21.3% on OSWorld V2 (3.8 times the same model with fixed interfaces).

### 4.5 Multi-agent designs

Several systems split the work among role agents. Mobile-Agent-v2 uses planning, decision and reflection agents; Mobile-Agent-E adds a manager and a perceptor; Mobile-Agent-v3 wraps the GUI-Owl model in manager, worker, reflector and notetaker roles. On desktops, UFO's HostAgent decomposes a task and dispatches per-application AppAgents; Agent S2 combines a generalist planner with specialist grounders; Magentic-One's orchestrator keeps task and progress ledgers and directs a web surfer, a file surfer, a coder and a terminal. UFO3 (2025) orchestrates agents across Windows, Linux and Android devices. Minitap's five-role system (planning, sub-goal tracking, state capture, decision, execution) reports pass@3 of 100% on AndroidWorld, and losing its task decomposition costs it 26.1 points.

The price of roles is latency: each role is another model call, and OSWorld-Human (2025) found that planning, reflection and judging calls dominate the time agents take.

### 4.6 Test-time scaling and look-ahead

When the environment can be reset, an agent can try several things and keep the best: Best-of-N rollouts (Agent S3), sampled plans with a judge (GTA1), or best-first **tree search** over web states (Koh et al., 2024; 26.4% on VisualWebArena). When it cannot, a **world model** can imagine the outcome of candidate actions: WebDreamer lets the LLM simulate what each candidate click would show and scores the predictions, at 4-5 times the efficiency of tree search on live sites (section 5.5).

### 4.7 Try it: one agent, three observations, one slip

The widget runs three scripted episodes on a toy phone. Step through them and switch the observation between the screenshot, Set-of-Mark labels and the accessibility tree: the thought stays the same, but the action is written as coordinates, as a mark number or as a node name. The photo episode contains a grounding slip (the agent aims at the small Share icon and hits Edit), a reflection step that notices the wrong screen and goes back, and a confirmation request before a message is sent. The **Grounding** mode lets you place the model's predicted point yourself and add Gaussian error, to see why small targets punish a few pixels of error.

{% include widget.liquid name="3d-gui-agent-agent-loop" height="640" caption="A GUI agent episode, step by step. Choose an episode (top row), the observation type (Screenshot, Set-of-Mark or A11y tree) and step with Next / Prev. Each step shows what the agent sees, its one-line thought and its action (red crosshair for taps, blue box for typing, the highlighted back key, a dialog when it asks the user); the next step shows the resulting screen. In the photo episode, step 3 is a grounding slip and step 4 a reflection that recovers. Grounding mode (or tap the phone): drag the predicted point; dashed boxes are the clickable elements, dots are 400 samples of a Gaussian error of the chosen sigma (green: same element, orange: another element, grey: empty space)." %}

**For 3D.** Reflection on outcomes (did the panel actually open?), persistent shortcuts and exploration documents transfer directly; exploration-then-document is how an agent could learn an unfamiliar XR app before a user needs it. The hybrid action space is natural on XR platforms, where Apple and Google already expose app intents and function calling to their assistants. What breaks: exploration in 3D can move or delete content in the user's space, so it must run in a sandboxed copy; best-of-N over full rollouts is impossible on the user's live surroundings without a simulated twin; and multi-agent prompting multiplies latency, which a headset wearer feels more than a phone user.

## 5. Training GUI agents

By 2026 most strong agents follow a four-stage recipe: collect or synthesize data, supervised fine-tuning (SFT) on grounding and trajectories, reinforcement learning on grounding with rule-based rewards, and online multi-turn RL in many parallel environments. World models appear at several points. The figure maps the stages.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/02-training-map.svg" localized="true" caption="The 2025-2026 training recipe for GUI agents, left to right: data (human demonstrations, tutorials turned into trajectories, exploration followed by task naming, grounding labels generated from the DOM), SFT, grounding RL with rule rewards, and online multi-turn RL in parallel emulators or VMs. World models (blue) predict the next screen and serve look-ahead, imagined RL and data synthesis. The orange row lists what each stage would become for 3D interfaces." %}

### 5.1 Data

**Human demonstrations** came first. AITW (NeurIPS 2023) collected 715,142 Android episodes over 30,378 instructions; AndroidControl (NeurIPS 2024) collected 15,283 demonstrations over 833 apps with both high-level and step-level instructions, and gave a sobering result: in-domain performance scales with data, but performance on unseen apps grows much more slowly. OpenCUA (2025) released AgentNet, desktop demonstrations across three operating systems and 200+ applications, with its annotation tool.

Demonstrations are expensive, so most data is now **synthesized**:

- **From tutorials.** Synatra turns indirect knowledge (how-to articles) into about 100K demonstrations at roughly USD 0.031 each; AgentTrek replays web tutorials with a VLM agent at about USD 0.55 per trajectory; TongUI builds 143K trajectories from multimodal tutorials; Explorer generates 94K at about USD 0.28; Fara-7B's FaraGen pipeline produces verified trajectories for about USD 1 each.
- **From exploration.** OS-Genesis (ACL 2025) inverts the usual order. Instead of writing a task and trying to execute it, it explores first (rule-based clicks, typing, scrolling), then asks GPT-4o to describe each observed transition as a low-level instruction and to compose them into high-level tasks ("reverse task synthesis"), re-executes them and filters the trajectories with a reward model. With about a thousand such trajectories, Qwen2-VL-7B reached 17.41% on AndroidWorld against 6.25% with task-first synthesis.
- **Grounding labels from structure.** UGround rendered web pages and used their DOM to label about 10 million elements; OS-Atlas built 13.58 million across five platforms; Jedi decomposed interfaces into widget types and synthesized 4 million examples. This is the data path that matters most for 3D, where the engine plays the role of the DOM.

### 5.2 Supervised fine-tuning

The common SFT recipe trains **grounding first, then acting**. Aguvis (ICML 2025) makes the two stages explicit: a grounding stage on single-step (instruction, screenshot, point) data, then a planning-and-reasoning stage on multi-step trajectories with inner monologue. UI-TARS adds large perception datasets (element captioning, dense screen description, state transitions), a unified cross-platform action space, reasoning traces and reflection tuning. The result of SFT is a capable but brittle policy: it imitates the paths in its data and has never experienced its own mistakes.

### 5.3 Reinforcement learning with rule-based rewards

In early 2025 the "R1" recipe from reasoning models (Group Relative Policy Optimization, GRPO, with verifiable rewards) reached GUIs, first for grounding and single-step actions. For a training example, the model samples $G$ answers $o_1, \dots, o_G$ and each gets a reward $r_i$. GRPO needs no value network: each answer's advantage is its reward standardized within the group,

$$
A_i = \frac{r_i - \operatorname{mean}(r_1, \dots, r_G)}{\operatorname{std}(r_1, \dots, r_G)},
$$

and the policy is pushed towards answers with positive advantage (with a clipped probability ratio and a KL penalty to the reference model, as in PPO). For grounding the reward is a rule, not a learned model:

$$
r = r_{\text{format}} + \mathbb{1}\big[\hat p \in B\big] \quad\text{or}\quad r = r_{\text{format}} + \mathrm{IoU}(\hat B, B).
$$

Because the reward is exact and free, a few thousand examples suffice. UI-R1 (March 2025) used 136 tasks to improve a 3B model by 22.1 points on ScreenSpot and 6.0 on ScreenSpot-Pro; GUI-R1 beat OS-Atlas with about 3K samples; SE-GUI reached 47.3% on ScreenSpot-Pro with 3K samples (7B). Two refinements address the obvious problems of a 0/1 point reward. GUI-G1 found **reward hacking** when the model predicts boxes (predicting huge boxes raises IoU-style rewards cheaply) and added a box-size constraint. GUI-G² replaced the binary hit with **Gaussian rewards**, a smooth score that is highest at the element's centre and spreads with the element's size, so that "almost right" is rewarded more than "far off".

### 5.4 Online multi-turn reinforcement learning

Single-step rewards do not teach recovery or long-horizon planning. For that the agent must act in a live environment and be rewarded at the end of an episode. **DigiRL** (NeurIPS 2024) was the first convincing demonstration on real Android apps: start from offline RL on existing data, then continue online in parallel emulators with advantage-weighted updates, an automatic curriculum and a VLM that judges success. A 1.3B model went from 17.7% to 67.2% on AitW tasks, ahead of CogAgent (38.5%) and filtered behaviour cloning (57.8%). **WebRL** (ICLR 2025) generated new tasks from the agent's failures and trained an outcome reward model, lifting Llama-3.1-8B from 4.8% to 42.4% on WebArena-Lite.

In 2025-2026 this became an infrastructure race:

| System | Environment scale | Notes |
| --- | --- | --- |
| UI-TARS-2 (Sep 2025) | thousands of VMs; GUI + terminal + file-system sandbox | multi-turn PPO with stability fixes, data flywheel |
| ComputerRL (Aug 2025) | thousands of VMs | API-GUI actions, alternating RL and SFT; OSWorld 48.9% (9B) |
| MAI-UI (Dec 2025) | 32 to 512 parallel environments: +5.2 points | device-cloud routing, MCP in the action space |
| MobileGym (May 2026; EMNLP 2026) | browser-hosted phone simulator | 95.1% of RL gains kept on real devices |
| Qwen-UI-Agent (Jul 2026) | more than 10,000 concurrent environments | GUI + CLI actions; OSWorld-Verified 79.5 |
| BlueLM-GUI (Sep 2026) | hundreds of real phones | 35B-A3B; AndroidWorld 84.9 |
| MAI-Gym (Oct 2026) | 20,000 parallel instances, synthesized apps | 9B model 76.2% on OSWorld-Verified; mocked-app training lifts a real phone from 28.8% to 48.1% |

Rewards for open-ended tasks come from programmatic checkers where they exist, otherwise from VLM judges or critics (OS-Themis, 2026, uses a multi-agent critic and reports +10.3% on AndroidWorld). A careful 2026 study (Gu et al.) adds the caveat: with the same algorithm, RL gains shrink as test tasks move away from training. For UI-TARS-7B-SFT the gain was +17.5 points on unseen instances of training tasks, +11.1 on unseen task templates and +4.2 on unseen applications; for Qwen3-VL-8B, +10.3, +7.4 and +0. A few steps of adaptation inside the target app recovered +22.9.

### 5.5 World models for GUIs

A **world model** predicts the next observation given the current one and an action. For GUIs it has three uses: look-ahead before acting, an imagined environment for RL, and data synthesis. The representations differ:

- **Text.** WMA (ICLR 2025) predicts a natural-language description of *what changes* after an action and uses it to choose actions on WebArena and Mind2Web without training the policy; WebDreamer lets the LLM itself imagine each candidate's outcome.
- **Code.** Code2World (2026) predicts the next screen as renderable HTML, which keeps text and layout exact; plugged into Gemini-2.5-Flash it adds 9.5% on AndroidWorld. Generative Visual Code Mobile World Models (ICML 2026) do the same for mobile.
- **Pixels.** ViMo generates the next screenshot with text placeholders; NeuralOS (ICLR 2026) simulates a whole desktop with a recurrent state tracker and a diffusion renderer.
- **For training.** DynaWeb and WM-R1 (2026) train policies inside imagined rollouts, and WebWorld scales a web simulator to over a million interactions.

These are the GUI counterparts of the video and 3D world models discussed in the [world models series]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}).

**For 3D.** The recipe transfers, and parts of it become easier. A ray-collider test is an exact, free grounding reward, so R1-style grounding RL for spatial targets can be bootstrapped from engine data with no human labels; reverse task synthesis fits engines well, since random exploration produces state transitions that a VLM can describe as tasks; and predicting a scene-description delta (a USD or glTF transform change) is the 3D analogue of Code2World's HTML. What breaks: there is no XR trajectory corpus at all (no AITW, no AndroidControl), XR simulators need a GPU per instance, which makes 20,000 parallel environments expensive, and the generalization study warns that RL gains may not survive the move to unseen XR apps, which share far fewer widget conventions than phone apps.

## 6. Evaluation and the state of the art

### 6.1 Offline, online and live evaluation

Early datasets were evaluated **offline**: at each step, does the agent's action match the recorded human action? AITW counts a tap as correct if it falls within 14% of the screen distance or inside the (enlarged) element box. Offline step accuracy is cheap and reproducible but misleading: any valid alternative path counts as an error, and high step accuracy does not imply that whole tasks succeed. **Online, execution-based** benchmarks run the agent in a real environment and check the final state with a program. **Live-web** benchmarks run on real websites and use a judge, because the web cannot be reset.

| Benchmark | Platform | Size | Success check | Human | Best found (Nov 2026) |
| --- | --- | --- | --- | --- | --- |
| AndroidWorld (2024; ICLR 2025) | Android emulator, 20 apps | 116 parameterized tasks | programmatic | 80.0% (secondary) | saturated: 84.9 (BlueLM-GUI, Sep 2026); pass@3 100% (Minitap) |
| OSWorld / -Verified (2024 / Jul 2025) | Ubuntu, Windows, macOS VMs | 369 tasks | execution-based scripts | 72.36% | 78.7 GPT-5.5 (Apr 2026, vendor); 79.5-80.5 open/industrial (2026 reports); 83.4 Claude Opus 4.8 (secondary) |
| OSWorld 2.0 (Jun 2026) | desktop, long workflows | 108 tasks (~1.6 h human median) | binary at 500 steps + partial credit | n/a | 20.6% binary, 54.8% partial (Claude Opus 4.8) |
| WebArena (2023; ICLR 2024) | self-hosted shop, forum, GitLab, CMS | 812 tasks | functional correctness | 78.24% | 73.6 (Qwen-UI-Agent, paper); 86.1 (leaderboard, self-reported) |
| Online-Mind2Web (2025; COLM 2025) | 136 live websites | 300 tasks | WebJudge (~85% human agreement) | n/a | 92.8% (GPT-5.4, screenshot-only, vendor) |
| MobileWorld (Dec 2025) | Android, cross-app, user interaction, MCP | 201 tasks | backend-verified | n/a | 82.1 (Qwen-UI-Agent) |
| Windows Agent Arena (2024; ICML 2025) | Windows VMs | 154 tasks | execution-based | 74.5% | 50.6 (UI-TARS-2) |
| ScreenSpot-Pro (2025; ACM MM 2025) | professional desktop apps | 23 apps, 3 OSes | point in box | n/a | 74.1 single pass; 85.33 cascade |

### 6.2 Progress over time

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/02-benchmark-progress.svg" localized="true" caption="Best reported task success over time on three online benchmarks (step lines follow primary sources; hollow markers are self-reported leaderboard entries or secondary sources), with human baselines as dotted lines. OSWorld went from 12.2% (April 2024) to 72.6% (Agent S3, December 2025, above the 72.36% human baseline) and about 80% in 2026; the dashed line marks the switch to OSWorld-Verified in July 2025. AndroidWorld went from 30.6% to 84.9%; WebArena from 14.4% to 73.6% in papers. The red star is OSWorld 2.0 (June 2026), where the best agent completes 20.6% of long workflows." %}

The OSWorld curve is the clearest summary of the field: 12.24% at release (April 2024), 14.9% for Claude 3.5 Sonnet with computer use (October 2024; 22.0% with more steps), 38.1% for OpenAI's CUA (January 2025), 61.4% for Claude Sonnet 4.5 on OSWorld-Verified (September 2025), 72.6% for Agent S3 (December 2025), 75.0% for GPT-5.4 (March 2026) and 78.7% for GPT-5.5 (April 2026), with industrial models around 80% by mid-2026 and 83.4% reported for Claude Opus 4.8 by secondary sources. That is roughly a 6.5-fold increase in two years. The long-horizon OSWorld 2.0 then reset the scale to about 20%.

Why should longer tasks collapse so sharply? A back-of-the-envelope model helps. If each step succeeds independently with probability $q$ and a task needs $n$ steps, the task succeeds with probability $q^n$. With $q = 0.99$, a 30-step task (the scale of OSWorld 1.0) succeeds 74% of the time; a 318-step task (the average number of tool calls in OSWorld 2.0) succeeds 4% of the time. Real agents recover from some errors, so this is pessimistic, but it explains why verification and recovery, not single-step accuracy, decide long tasks.

### 6.3 Commercial computer-use agents

| Product or model | Company, date | Published numbers (source type) | Notes |
| --- | --- | --- | --- |
| Claude computer use (Claude 3.5 Sonnet) | Anthropic, 2024-10-22 | OSWorld 14.9% screenshot-only, 22.0% with more steps; next best 7.8% (vendor) | public beta API tool, run by the developer in a VM or container |
| Claude Sonnet 4.5 | Anthropic, 2025-09-29 | OSWorld-Verified 61.4% (vendor) | later Claude models 66-83% (secondary) |
| Computer-Using Agent (CUA) and Operator | OpenAI, 2025-01-23 | OSWorld 38.1%, WebArena 58.1%, WebVoyager 87.0% (vendor) | remote browser; confirmations, takeover, watch mode; merged into ChatGPT agent in July 2025 |
| Gemini 2.5 Computer Use | Google DeepMind, 2025-10-07 | leading results on Online-Mind2Web, WebVoyager, AndroidWorld per vendor charts | browser-first; a per-step safety service checks each action |
| GPT-5.4 | OpenAI, 2026-03-05 | OSWorld-Verified 75.0%, Online-Mind2Web 92.8% screenshot-only (vendor) | "native computer-use capabilities" in a general model |
| GPT-5.5 | OpenAI, 2026-04-23 | OSWorld-Verified 78.7% (vendor) | |
| Fara-7B | Microsoft Research, 2025-11-24 | WebVoyager 73.5%, Online-Mind2Web 34.1% (vendor blog) | open weights, on-device size |
| UI-TARS-2 | ByteDance Seed, 2025-09 | OSWorld 47.5, AndroidWorld 73.3, Online-Mind2Web 88.2 (report) | also plays browser games at about 60% of human level |
| Qwen-UI-Agent | Alibaba, 2026-07-30 | OSWorld-Verified 79.5, MobileWorld 82.1, WebArena 73.6, ScreenSpot-Pro 81.5 (report) | unified GUI + CLI actions |

Product integration followed: Windows Insider builds got an agent workspace in which Copilot acts under a separate account (November 2025), and Google's Gemini began automating Android apps on the Galaxy S26 in a virtual phone environment (March 2026, press reports). Apple's route at WWDC 2026 was App Intents rather than pixel control.

### 6.4 How far to trust the numbers

The 2D literature learned several lessons about evaluation the hard way:

1. **Offline overstates.** Online-Mind2Web, "An Illusion of Progress?" (COLM 2025), found that many web agents that looked strong on earlier benchmarks did not beat the 2024 SeeAct baseline on live tasks.
2. **Evaluators have bugs.** OSWorld-Verified (July 2025) fixed more than 300 issues, mostly in evaluation scripts; scores before and after are not directly comparable. Harness, step limit and thinking budget move scores by several points.
3. **Self-reporting and saturation.** The AndroidWorld leaderboard lists several self-reported 100% entries and marks the benchmark saturated; ScreenSpot, ScreenSpot-v2 and WebVoyager are saturated too.
4. **Reliability is not capability.** If one attempt succeeds with probability $p$, the chance that at least one of $k$ attempts succeeds is $\text{pass@}k = 1-(1-p)^k$, while the chance that all $k$ succeed is $\text{pass}^k = p^k$. With $p = 0.9$ and $k = 3$ these are 0.999 and 0.729. A user needs the second. Minitap reports both on AndroidWorld: pass@3 100%, pass^3 94.0%.
5. **Efficiency.** OSWorld-Human (2025) found that the best agents take 2.7 to 4.3 times more steps than necessary, that later steps take up to three times longer than early ones, and that tasks take tens of minutes.
6. **Judges are noisy.** WebVoyager's GPT-4V judge and Online-Mind2Web's WebJudge agree with people about 85% of the time.

**For 3D.** The benchmark design transfers: resettable environments, parameterized tasks with programmatic checks (AndroidWorld), held-out apps, reliability (pass^k) and efficiency metrics, and human-validated judges. What breaks: resettable VMs become XR simulators or engine builds that must run headless and in parallel on GPUs; success checks need spatial tolerances (placed within 5 cm, facing the user); a judge looking at one rendered frame cannot see an occluded result; and testing on real devices involves a person's body and room. The only XR material in the 2D benchmark literature is GUI-World's 393 screen recordings of VR, AR and MR interfaces, evaluated as video question answering (GPT-4o 84.3% on multiple choice). No interactive benchmark in which an agent operates an XR interface appears in the 2D literature; [post 4]({{ '/blog/2026/3d-gui-agent-04-agents-in-xr-and-the-gap/' | relative_url }}) looks at what exists on the XR side.

## 7. Humans in the loop, accessibility, safety and privacy

### 7.1 Delegation, oversight and asking

An agent acting for a person must decide when to involve them. **Morae** (UIST 2025) studied this with blind and low-vision (BLV) users, for whom silent choices are invisible: in a formative study, an agent reported "completed" for 484 of 576 feasible requests but only 189 were correct, and 182 failures involved ambiguity (which flight, which size). Morae detects decision points, pauses, and generates an accessible choice interface. On tasks that require a pause it succeeded 65.6% of the time against 50.8% for OpenAI's Operator, and in a study with 10 BLV participants users completed more tasks with it, at the cost of slower runs.

How often to ask is a scheduling problem. "When Should Users Check?" (CHI 2026) modelled confirmation frequency in multi-step tasks; 81% of its 48 participants preferred intermediate confirmations over confirming only at the end, and the scheduled confirmations cut task time by 13.54%. Other 2026 work compares oversight strategies in live sessions (48 participants, 192 sessions), predicts when real users intervene (CowCorpus), and designs for the short "micro-waits" during agent runs. A usability study of Operator and Manus (CAIS 2026) found a wide gap between industry aspirations and what users could actually get done.

Not every user wants the agent to act. Context-aware *guidance* for screen-reader users (CHI 2026) helps people operate software themselves, and "Beyond Chat and Clicks" (2026) has the agent transform the live interface around the user instead of clicking through it. These "guide me" and "reshape the UI" modes are an alternative to full autonomy.

### 7.2 Accessibility

GUI agents are often promoted as an accessibility technology, but they are themselves inaccessible in revealing ways. The A11y-CUA dataset (CHI 2026) found that a computer-use agent that succeeds on 78.3% of tasks drops to 41.67% when restricted to keyboard-only interaction and to 28.3% with a screen magnifier, the settings many disabled users rely on. On 1,258 real desktop commands from eight blind users, GPT-5 succeeded 52.5% of the time (EMNLP 2026). ElderBench (2026) collects 249 tasks elicited from older adults.

### 7.3 Security: everything on the screen is input

A GUI agent reads whatever is displayed, so **every pixel is an input channel**, including content written by attackers. The attacks are effective:

- **Pop-ups.** Adversarial pop-ups on OSWorld and VisualWebArena reached 86% attack success and cut task success by 47%; telling the agent to ignore pop-ups did not help (ACL 2025).
- **Injected page content.** EIA steals specific personal data in up to 70% of cases (ICLR 2025); perturbing under 5% of a page's pixels hijacks agents in up to 67% (ICLR 2025).
- **Visual prompt injection.** VPI-Bench reaches up to 51% on computer-use agents and 100% on browser agents (ICLR 2026); RedTeamCUA aims web injections at operating-system actions and finds that more capable agents can be more exploitable (ICLR 2026); StepJack spreads an injection over several steps and raises success from 41.7% to 72.9% (2026).
- **Adaptive attacks.** Against 21 defence configurations, adaptive visual injection still succeeds about 92% of the time (November 2026).

Harm benchmarks measure the other side: OS-Harm (NeurIPS 2025) tests misuse, injection and misbehaviour on 150 OSWorld tasks; MobileSafetyBench does the same on Android; SEAM (2026) splits harmful tasks across screens and finds agents complete up to 92% of them.

Shipped defences are layered rather than perfect. OpenAI's Operator system card reports a confirmation recall of 92% on 607 tasks, a prompt-injection monitor with 99% recall and 90% precision, and an injection susceptibility of 23% with mitigations against 62% without. Google's Gemini Computer Use attaches a safety decision (allowed, requires confirmation, blocked) to each proposed action. Anthropic recommends a minimal-privilege VM and confirmation of consequential actions. Microsoft's Windows agent workspace and UFO2's picture-in-picture desktop isolate the agent from the user's session.

### 7.4 Privacy

Screenshots contain everything on screen. PriMobiBench (ACM CCS 2026) found that VLM-driven mobile agents can extract sensitive on-screen data in up to 82.5% of cases and infer user profiles about 70% of the time; masking task-irrelevant parts of the interface cut profiling by up to 58% at about 8% task-performance cost.

**For 3D.** Pause on ambiguity, scheduled confirmation, confirmation of consequential actions, takeover for credentials and guide-instead-of-do modes all transfer, and spatial references ("put it over there") make ambiguity more frequent than in 2D. What breaks: confirmation and takeover must work without mouse and keyboard and without breaking presence; an agent that moves content in the user's space can startle them or move something they are reaching for; passthrough brings uncontrolled real-world text (posters, screens, signs) into the agent's input, which enlarges the injection surface that 2D defences already fail to close; and headset cameras, eye tracking and room scans are far more sensitive than screenshots.

## 8. From 2D to 3D: what transfers and what breaks

This section collects the "For 3D" notes into one argument. The question is not whether ideas from 2D agents are useful in XR (they clearly are) but which assumptions of 2D agents fail, because those failures define the research problems of a 3D GUI agent.

| Dimension | 2D state of the art (Nov 2026) | Transfers to 3D | Breaks in 3D |
| --- | --- | --- | --- |
| Observation | screenshot-only native models; tree as extra signal | rendered view as primary input; scene graph as a richer tree; marks anchored to objects | egocentric, changing viewpoint; depth, stereo, occlusion, passthrough; few accessibility trees |
| Grounding | point in box; 74% single pass on ScreenSpot-Pro, 85% with cascades | heatmaps become rays; zoom becomes foveation; engine-generated labels; exact ray-hit rewards | target is an object or volume; several objects per pixel; tiny distant targets; body-relative references |
| Action space | tap, type, swipe, key; hybrid GUI + API + MCP | small designed action sets; intents and APIs first | 6-DoF poses, rays, pinch, grab, two hands, gaze, voice, locomotion; tolerances instead of hits |
| Field of view | everything on one screen (scroll for the rest) | active perception, exploration memory | targets behind the user, occluded or in another room; spatial memory needed |
| Latency | 2.5-4 s per step; tasks of tens of minutes | quantization, batching, small models, device-cloud split | the user waits inside the interface; rendering budget of 8-14 ms per frame shares the device |
| Training | SFT, rule-reward RL, online RL in 10k+ VMs | the whole recipe; free spatial rewards; reverse task synthesis | no trajectory corpus; GPU-heavy simulators; weaker transfer to unseen apps |
| Evaluation | execution-checked, parameterized, pass^k | the design principles | headless XR runtimes at scale; spatial tolerances; occluded outcomes |
| Humans and safety | confirm, pause, take over, isolate | the patterns | takeover of the user's hands and view; physical surprise; passthrough injection; room and gaze privacy |

### 8.1 Observation

A 2D agent's observation is a screenshot that is the same for the user and the agent. In a headset there are several candidate observations, and none is agreed: the stereo frames the user sees, a monocular rendering, depth, the engine's scene graph, the platform's accessibility information for spatial apps, the head, hand and gaze poses of the user, or a rendered "agent view" from a viewpoint the agent chooses. The 2D lesson (pixels for coverage, structure where available) suggests a hybrid, but the viewpoint problem is new: one UI state produces a different image every time the user moves.

### 8.2 Grounding in depth

The figure contrasts the two settings with a real visibility computation.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/02-2d-vs-3d.svg" localized="true" caption="Left: on a 2D screen every target is visible and one point names one element. Right: four panels around a user whose view frustum (64 by 50 degrees) points forward, with a virtual box in the scene. The percentages are the fraction of 400 points on each panel that are inside the frustum and not hidden by the box, computed by ray casting from the user's head: panel A in front is fully visible, panel B is in view but 87% occluded by the box, C to the right and D behind the user are outside the field of view. The red line is a hand ray selecting a point on A." %}

A 2D grounder outputs a pixel. A 3D grounder must output a target object (or a point on it), and the natural way to get there from a 2D model is to **cast a ray**. If the model predicts pixel $(u, v)$ in a view with intrinsics $K$, camera rotation $R$ and position $\mathbf c$, the ray is

$$
\mathbf x(t) = \mathbf c + t\,\frac{R K^{-1} [u, v, 1]^\top}{\lVert R K^{-1} [u, v, 1]^\top \rVert}, \qquad t > 0,
$$

and the target is the first collider it hits. A pixel error becomes an angular error of about $\delta/f$ radians for focal length $f$ in pixels, and a lateral error of about $z\,\delta/f$ at distance $z$: for a 1920-pixel-wide view with a 90° horizontal field of view, $f = 960$ px, so a 10 px error at 2 m is about 2 cm, enough to miss a small button on a far panel. A heatmap output (GUI-Actor) is better than a point here, because its spread can be turned into a cone of rays and compared with the sizes of the candidate objects. Occlusion adds a failure that 2D grounding never had: the ray may hit a nearer object (panel B in the figure), and the right action may be to move the head or the panel first.

### 8.3 Action space

2D actions are a handful of discrete types over 2D points. XR input includes ray-and-pinch selection, direct touch, grab-and-place with a full 6-DoF pose (a rotation and a translation, an element of $SE(3)$), rotation and scaling, two-handed gestures, gaze-and-pinch, gaze dwell, voice, controller buttons, and locomotion or teleportation. Many of these have no "click" equivalent, and their success is judged with tolerances (aligned within a few degrees, placed within a few centimetres). Language models are poor at producing such sequences directly: on ComboBench (2025), the best model mapped VR game actions to the exact controller and headset sequences only 11.7% of the time. The 2D answer, a small designed action space plus APIs where possible (AppAgent, Agent S's ACI, UFO2), is probably the right starting point, with deterministic low-level controllers below the language model, as ClawMobile (2026) argues for phones.

### 8.4 Targets outside the view

A 2D agent handles hidden content by scrolling, switching tabs and opening menus, and memory helps it remember what it has seen. In XR, a window can be behind the user, occluded by a real or virtual object, or in another room, and the user moves. The agent needs to decide where to look (or ask the user to turn), and it needs a **persistent spatial memory** of where windows and objects are, which is a scene graph with anchors rather than a list of screens. Spatial memory is a known weakness of current multimodal models: on VSI-Bench (2024), the best model scored 45.4% against about 79% for people on spatial questions about indoor videos.

### 8.5 Latency

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/02-latency.svg" localized="true" caption="Time per decision on a log scale. An XR frame at 90 Hz lasts 11 ms. The Lumine game agent (2025) issues its first action in 114 ms, 234 ms with reasoning. A 2D GUI agent step takes 2.5-4.0 s (UI-TARS-2, quantized and full precision). Published XR research prototypes take about 4 s per turn (DuoZone window layout), 9.1 s (SIAgent intent agent) and 49 s (NavAI VR navigation). The gap between the green and the orange bars is the latency problem of 3D GUI agents." %}

On a desktop, an agent that takes three seconds per step and twenty minutes per task can run in the background while the user does something else. In a headset the user is *inside* the interface, watching. The figure puts the numbers side by side: per-step times of 2D agents are two orders of magnitude above what real-time 3D game agents achieve, and the first XR prototypes are slower still. The 2D toolbox (quantization, which cut UI-TARS-2's per-round latency from 4.0 s to 2.5 s at a cost of 3.1 OSWorld points; speculative multi-action planning in UFO2; batched actions; small on-device models such as Ferret-UI Lite and Fara-7B; MAI-UI's device-cloud routing) all applies, but a headset also has a hard rendering budget of 8-14 ms per frame on the same chip, and VideoGameBench (2025) shows that agents that do well when a game pauses for them do far worse in real time, while XR cannot pause. Designs that split work (the headset perceives and renders, a phone or the cloud plans) and that *guide* the user while the agent thinks are likely to be necessary.

### 8.6 Data and evaluation

The 2D field was built on data: Rico, AITW, AndroidControl, Mind2Web, and millions of synthetic grounding labels. For XR there is no instruction-to-action trajectory corpus, the largest public VR UI-element dataset has about 17.7K frames (DISCOVR, UIST 2025), and no interactive benchmark exists in which an agent must operate an XR app to complete a task. Building one means solving the problems of section 6.4 in 3D: headless, resettable XR runtimes, success checks with spatial tolerances, held-out apps and reliability metrics. [Post 4]({{ '/blog/2026/3d-gui-agent-04-agents-in-xr-and-the-gap/' | relative_url }}) reviews the platforms and tools that could host such a benchmark, and [post 3]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }}) explains, from the human side, which 3D interactions are hard enough that delegating them is worth it.

### 8.7 What this means for the column

Three conclusions carry forward into the [research vision]({{ '/blog/2026/3d-gui-agent-01-research-vision/' | relative_url }}) and the research plan:

1. **Most of the agent stack can be reused.** Screenshot-first native models, planner/grounder splits, reflection, exploration memory, hybrid action spaces, the SFT-then-RL recipe and execution-based evaluation are mature and open (UI-TARS, GUI-Owl, OpenCUA, MAI-UI weights and code).
2. **The new problems are spatial.** Viewpoint-dependent observation, grounding with depth and occlusion, off-view targets with spatial memory, a continuous 6-DoF action space, and latency inside the interface have no 2D counterpart that solves them.
3. **The missing pieces are infrastructure.** A trajectory dataset, a grounding benchmark for spatial targets and an interactive, execution-checked benchmark for XR apps would play the role that Rico, ScreenSpot and OSWorld played in 2D.

## Summary

- A GUI agent turns an instruction into actions on the same interface a person uses, through a loop of observe, plan, ground, act, verify and remember; native models now do the first four in one VLM.
- Screenshots won over accessibility trees as the primary observation because they cover every app and because grounding data can be synthesized from structure; trees remain a useful extra signal.
- Grounding was the 2024 bottleneck. Synthetic data, heatmap heads, rule-reward RL and zoom/cascade inference raised ScreenSpot-Pro from 18.9% (April 2025) to 74% single pass and 85% with a cascade (November 2026).
- Action-space design, exploration documents, reflection and best-of-N selection each moved success by tens of points with the model held fixed.
- Training is SFT on human and synthetic trajectories, then GRPO with rule rewards, then online multi-turn RL in thousands to tens of thousands of environments; gains shrink on unseen apps.
- OSWorld passed the human baseline in December 2025 and frontier models ship computer use natively; long-horizon OSWorld 2.0 (best 20.6%) shows what remains: tracking constraints, asking, verifying.
- Every pixel is an attack surface; adaptive injections defeat current defences, and products rely on confirmation, monitoring and isolation.
- For 3D, the stack transfers but observation, grounding, action, field of view, latency, data and evaluation each break in specific ways, which define the research agenda of this column.

## Representative papers

| Title | Authors | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- | --- |
| Rico: A Mobile App Dataset for Building Data-Driven Design Applications | Deka et al. | UIST | 2017 | [DOI](https://doi.org/10.1145/3126594.3126651) | 72k Android screens with view hierarchies; the template for UI data |
| Reinforcement Learning on Web Interfaces Using Workflow-Guided Exploration | E. Z. Liu et al. | ICLR | 2018 | [arXiv](https://arxiv.org/abs/1802.08802) | MiniWoB++; demonstrations constrain RL exploration |
| A Data-Driven Approach for Learning to Control Computers (CC-Net) | Humphreys et al. | ICML | 2022 | [arXiv](https://arxiv.org/abs/2202.08137) | human-level MiniWoB++ from 2.4M demonstrations |
| Pix2Struct: Screenshot Parsing as Pretraining for Visual Language Understanding | K. Lee et al. | ICML | 2023 | [arXiv](https://arxiv.org/abs/2210.03347) | screenshot-only models beat view-hierarchy models |
| Android in the Wild (AITW) | Rawles et al. | NeurIPS D&B | 2023 | [arXiv](https://arxiv.org/abs/2307.10088) | 715k human device-control episodes |
| Mind2Web: Towards a Generalist Agent for the Web | X. Deng et al. | NeurIPS D&B | 2023 | [arXiv](https://arxiv.org/abs/2306.06070) | 2,000+ web tasks; candidate ranking before the LLM |
| WebArena: A Realistic Web Environment for Building Autonomous Agents | S. Zhou et al. | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2307.13854) | self-hosted, execution-checked web benchmark |
| Set-of-Mark Prompting Unleashes Extraordinary Visual Grounding in GPT-4V | J. Yang et al. | arXiv | 2023 | [arXiv](https://arxiv.org/abs/2310.11441) | numbered marks let a VLM refer to regions |
| AppAgent: Multimodal Agents as Smartphone Users | C. Zhang et al. | CHI | 2025 | [arXiv](https://arxiv.org/abs/2312.13771) | element action space and exploration documents |
| CogAgent: A Visual Language Model for GUI Agents | W. Hong et al. | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.08914) | high-resolution branch for dense GUI text |
| SeeClick: Harnessing GUI Grounding for Advanced Visual GUI Agents | K. Cheng et al. | ACL | 2024 | [arXiv](https://arxiv.org/abs/2401.10935) | grounding pretraining; the ScreenSpot benchmark |
| GPT-4V(ision) is a Generalist Web Agent, if Grounded (SeeAct) | B. Zheng et al. | ICML | 2024 | [arXiv](https://arxiv.org/abs/2401.01614) | showed grounding, not planning, was the bottleneck |
| WebVoyager | H. He et al. | ACL | 2024 | [arXiv](https://arxiv.org/abs/2401.13919) | live-web multimodal agent with a VLM judge |
| OSWorld | T. Xie et al. | NeurIPS D&B | 2024 | [arXiv](https://arxiv.org/abs/2404.07972) | 369 execution-checked computer tasks; human 72.36% |
| AndroidWorld | Rawles et al. | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2405.14573) | parameterized Android tasks with programmatic checks |
| Mobile-Agent-v2 | J. Wang et al. | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2406.01014) | planning, decision and reflection agents |
| DigiRL | H. Bai et al. | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2406.11896) | offline-to-online RL on real Android apps |
| Agent S: An Open Agentic Framework that Uses Computers Like a Human | Agashe et al. | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2410.08164) | the Agent-Computer Interface |
| Navigating the Digital World as Humans Do (UGround) | Gou et al. | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2410.05243) | pure-vision grounding from 10M synthetic elements |
| OS-ATLAS: A Foundation Action Model for Generalist GUI Agents | Z. Wu et al. | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2410.23218) | 13.58M-element cross-platform grounding corpus |
| OS-Genesis: Reverse Task Synthesis | Q. Sun et al. | ACL | 2025 | [arXiv](https://arxiv.org/abs/2412.19723) | explore first, then name the task |
| UI-TARS: Pioneering Automated GUI Interaction with Native Agents | Y. Qin et al. | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2501.12326) | native end-to-end agent model |
| UI-R1: Enhancing Efficient Action Prediction of GUI Agents by RL | Z. Lu et al. | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2503.21620) | R1-style rule-reward RL with 136 tasks |
| ScreenSpot-Pro | K. Li et al. | ACM MM | 2025 | [arXiv](https://arxiv.org/abs/2504.07981) | professional high-resolution grounding; ScreenSeekeR |
| An Illusion of Progress? (Online-Mind2Web) | T. Xue et al. | COLM | 2025 | [arXiv](https://arxiv.org/abs/2504.01382) | live-web evaluation exposes over-optimism |
| GUI-Actor: Coordinate-Free Visual Grounding | Q. Wu et al. | NeurIPS | 2025 | [arXiv](https://arxiv.org/abs/2506.03143) | attention-heatmap grounding head with verifier |
| Scaling Computer-Use Grounding via UI Decomposition and Synthesis (Jedi) | T. Xie et al. | NeurIPS D&B | 2025 | [arXiv](https://arxiv.org/abs/2505.13227) | 4M synthetic examples; planner + grounder |
| UI-TARS-2 Technical Report | H. Wang et al. | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2509.02544) | multi-turn RL at scale, hybrid sandbox |
| Scaling Agents for Computer Use (Agent S3) | Gonzalez-Pumariega et al. | TMLR | 2026 | [arXiv](https://arxiv.org/abs/2510.02250) | Behavior Best-of-N; first above-human OSWorld |
| Morae: Proactively Pausing UI Agents for User Choices | Y.-H. Peng et al. | UIST | 2025 | [arXiv](https://arxiv.org/abs/2508.21456) | pause on ambiguity, for BLV users |
| Attacking Vision-Language Computer Agents via Pop-ups | Y. Zhang et al. | ACL | 2025 | [arXiv](https://arxiv.org/abs/2411.02391) | 86% attack success with pop-ups |
| Code2World: A GUI World Model via Renderable Code Generation | Y. Zheng et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2602.09856) | next screen predicted as HTML |
| How Far Does Online RL Generalize in Mobile GUI Agents? | L. Gu et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2603.07432) | RL gains shrink on unseen apps |
| OSWorld 2.0 | M. Yuan et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2606.29537) | long-horizon workflows; best 20.6% |
| Qwen-UI-Agent Technical Report | H. Zhou et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2607.28227) | GUI + CLI actions, 10k+ RL environments |
| A11y-CUA Dataset | Gubbi Mohanbabu et al. | CHI | 2026 | [arXiv](https://arxiv.org/abs/2602.09310) | agents fail under assistive-technology settings |
| PriMobiBench | Q. Cen et al. | ACM CCS | 2026 | [arXiv](https://arxiv.org/abs/2609.13873) | visual privacy leakage of mobile agents |
| GroundCascade: Selective Second Opinions for GUI Grounding | Phoulady et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2611.13177) | 85.33% on ScreenSpot-Pro with a cascade |

## Learning resources

- Surveys: *Large Language Model-Brained GUI Agents: A Survey* (C. Zhang et al., 2024, [arXiv](https://arxiv.org/abs/2411.18279)), the most complete roadmap; *OS Agents: A Survey on MLLM-based Agents for General Computing Devices Use* (X. Hu et al., ACL 2025, [arXiv](https://arxiv.org/abs/2508.04482)); *Reinforcement Learning in GUI Agents: A Survey Toward Digital Inhabitants* (J. Hu et al., TMLR 2026, [arXiv](https://arxiv.org/abs/2604.27955)).
- Environments to run yourself: [AndroidWorld](https://github.com/google-research/android_world) (Android emulator tasks), [OSWorld](https://github.com/xlang-ai/OSWorld) (desktop VMs), [WebArena](https://github.com/web-arena-x/webarena) (self-hosted sites).
- Open agents and models: [Agent S](https://github.com/simular-ai/Agent-S), [UI-TARS](https://github.com/bytedance/UI-TARS), [OmniParser](https://github.com/microsoft/OmniParser), [OpenCUA](https://github.com/xlang-ai/OpenCUA).
- Vendor documentation worth reading for the safety design: OpenAI's [Operator system card](https://openai.com/index/operator-system-card) and Anthropic's [computer use announcement](https://www.anthropic.com/news/3-5-models-and-computer-use).
- The column's reading list (in Chinese, with English titles) lives in the repository at `docs/reading-lists/3d-gui-agent.md`.

## Exercises

1. **Grounding error and target size.** Using the formula of section 3.1, compute the hit probability for a 44 x 44 px button and for a 12 x 12 px icon at $\sigma = 4$, 8 and 15 px. Then estimate the $\sigma$ at which a model would score 50% on targets of 12 px. What does this suggest about the value of zooming in by a factor of 2?

   <details markdown="1"><summary>Hint</summary>

   For the 44 px button ($a = b = 22$): about 1.00, 0.99 and 0.74. For the 12 px icon ($a = b = 6$): 0.75, 0.30 and 0.09. A 50% hit rate needs $\operatorname{erf}(6/(\sigma\sqrt2)) = 0.707$, i.e. $6/(\sigma\sqrt2) \approx 0.74$, so $\sigma \approx 5.7$ px. Zooming by 2 doubles the target in pixels while the model's error in pixels stays roughly the same, so a 12 px target behaves like a 24 px one, which is why ScreenSeekeR and zoom modes gain so much. You can check the numbers in the grounding mode of the widget.
   </details>

2. **Choose an observation.** You are building an agent for a hospital's in-house Windows application whose custom-drawn widgets expose no UI Automation names. List the observation options of section 2, say which you would use and why, and say what data you would collect first.

   <details markdown="1"><summary>Hint</summary>

   Without names the tree gives boxes at best, so the screenshot must carry the semantics; a parser (OmniParser-style) or a native screenshot model is the primary input, with whatever structure exists as an extra signal. Collecting a small grounding set (screenshots with labelled target boxes for the application's frequent operations) lets you measure grounding accuracy, the most likely bottleneck, before building anything else.
   </details>

3. **Reliability arithmetic.** An agent succeeds on a task with probability 0.85 per attempt. Compute pass@3 and pass^3. Then assume the task needs 40 steps and each step succeeds with probability $q$; what $q$ gives 85% task success without recovery? What does this say about where to invest: better steps or recovery?

   <details markdown="1"><summary>Hint</summary>

   pass@3 $= 1 - 0.15^3 = 0.997$; pass^3 $= 0.85^3 = 0.614$. From $q^{40} = 0.85$ you get $q = 0.85^{1/40} \approx 0.9959$, i.e. fewer than one failed step in 240. Pushing single-step accuracy that high is hard; detecting and undoing a failed step (reflection, section 4.3) relaxes the requirement, because a step only has to be right *eventually*.
   </details>

4. **A reward for 3D grounding.** Design a GRPO reward for a model that, given a rendered XR view and an instruction, outputs a pixel to cast a ray through. Use the engine's colliders. How would you handle occluded targets and tiny distant targets, and how could the reward be hacked?

   <details markdown="1"><summary>Hint</summary>

   A natural reward is 1 if the first collider hit by the ray belongs to the target, plus a smooth term (like GUI-G²'s Gaussian reward) based on the angular distance between the ray and the target's centre, scaled by the target's angular size, so that small far targets are not hopeless. For occluded targets, decide whether the correct output is the occluder (to move it), a "change viewpoint" action, or the target through the occluder; reward the choice you want. Hacks: rays aimed at large objects that contain the target's collider (e.g. a whole window instead of a button), so use the smallest interactable collider.
   </details>

5. **Hands-on: the widget.** In the photo episode, switch to the grounding mode on step 3 (the toolbar) and find the smallest $\sigma$ at which a point placed at the centre of the Share icon hits Share less than 90% of the time. Then do the same for the Wi-Fi row in the Settings screen. Explain the difference with the formula of section 3.1.

   <details markdown="1"><summary>Hint</summary>

   The Share icon's touch box is 44 x 44 px, so the hit rate falls below 90% at about $\sigma \approx 11$ px; the Wi-Fi row is 328 x 52 px, so only the vertical direction matters and $\sigma$ must exceed about 16 px. The sampled percentages in the widget use 400 samples, so expect a few points of noise around the formula.
   </details>

**Next:** [Why 3D interfaces are hard to operate]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }}), the human side of the problem: what makes spatial UIs harder than screens, and which operations a 3D GUI agent should take over.
