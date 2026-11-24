---
layout: post
title: "Why 3D interfaces are hard to operate: the evidence"
date: 2026-11-24 12:03:00+0900
description: "A survey of what it costs to operate VR, AR and MR interfaces: the 3D task taxonomy, gaze, pinch, rays and touch with their pointing models, the cost of depth and the Midas touch, windows, volumes and reference frames, measured fatigue, error, text-entry and sickness numbers, adoption and accessibility evidence, the help that exists today, and a catalogue of 30 headset operations sorted by whether an agent could do them, guide them, or neither."
categories: 3d-gui-agent
tags: [3d-user-interfaces, xr-interaction, fitts-law, gaze-pinch, midas-touch, consumed-endurance, text-entry, cybersickness, accessibility, gui-agents]
series: 3d-gui-agent
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## Why this matters

The [research vision]({{ '/blog/2026/3d-gui-agent-01-research-vision/' | relative_url }}) of this column rests on one claim: operating the 3D user interface of a headset or a pair of glasses costs the user more than operating a phone, part of that cost is the reason 3D devices have not entered everyday life, and part of it is work an AI agent could take over. [Post 2]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }}) showed that GUI agents already operate phones, desktops and the web. This post examines the first half of the claim. It asks what users actually do when they operate a 3D interface, which of those operations are measurably hard, by how much, for whom, and whether the difficulty shows up in why people buy, use or abandon the devices.

The answer is more nuanced than "3D is hard". The evidence that operating spatial interfaces is costly is strong and quantitative: slower pointing in depth, arm fatigue, text entry at a third to a half of phone speed, selection error rates of 9 to 36% on current headsets, and novices who cannot discover the right gesture. The evidence that this cost is *the* reason for slow adoption is weak: price, comfort, content and sickness dominate every ranked survey. Usability appears as a real but contributing factor, mostly as learning, discoverability, input precision and configuration. A careful research program has to keep these two statements apart, and this post does.

Almost every number below comes from the research dossier of this column (162 works, checked against primary sources on 2026-11-24); dates are given for anything that changes, such as market data and shipping assistants.

## Prerequisites

- Basic HCI vocabulary: Fitts' law, throughput, NASA-TLX, SUS, within-subject studies.
- What a headset is: a stereo display in front of each eye, head tracking, and cameras that track hands and (on some devices) eyes. [3D vision post 10]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }}) explains the tracking side.
- What a GUI agent is ([post 2]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }})): a model that reads a screen (screenshot and/or accessibility tree) and emits actions such as tap, swipe and type.

## 1. What "operating" a 3D interface means: the task taxonomy

To measure the cost of operating something, we first need a list of the operations. 3D user interface (3D UI) research settled this in the standard textbook by Bowman, Kruijff, LaViola and Poupyrev ([*3D User Interfaces: Theory and Practice*, 2004; 2nd ed. LaViola et al. 2017](https://people.cs.vt.edu/~bowman/3dui.org/Table_of_Contents.html)). It splits every interaction into a few **universal tasks**:

- **Selection**: indicating one or more objects and confirming the choice. Techniques split into the *virtual hand* (touch what is within reach, extended non-linearly by Go-Go), *virtual pointing* (a ray, a cone, or the 2D image plane), and *exocentric* proxies (a World-in-Miniature, Voodoo Dolls).
- **Manipulation**: setting the position, orientation and scale of a selected object. The 2nd edition groups techniques as grasping, pointing, surface, indirect, bimanual and hybrid metaphors; hybrids such as HOMER separate "grab" from "manipulate".
- **Navigation**, which has two halves: **travel**, the motor part (walking, steering, teleporting), and **wayfinding**, the cognitive part (knowing where you are and how to get where you want).
- **System control**: issuing commands to run a function, change a mode or change the system state, through menus, voice, gestures, tools or physical controllers.
- **Symbolic input**: entering text, numbers and other symbols. In the 2nd edition it is folded into the system-control chapter, because in 3D applications text is usually short and serves a command (a file name, a search query).

The book's definition of system control contains a sentence that matters for this whole column: "In system control tasks, the user typically specifies only what should be done and leaves it up to the system to determine the details." That is exactly what delegating to an agent means. An agent turns every other task into system control: the user says *what* ("put the recipe next to the stove", "open the settings for hand tracking"), and the agent works out *how*.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/03-taxonomy.svg" localized="true" caption="The five universal 3D interaction tasks (top row), the classic techniques that solve them, how they look on today's headsets, and the agent action each one would become. Look at the bottom row: a 2D GUI agent has tap, swipe and type; a 3D GUI agent needs a richer vocabulary, and system control is the task that every delegated action turns into." %}

How the tasks look on today's devices:

| Task | Vision Pro (visionOS) | Quest 3 (Horizon OS) | Galaxy XR (Android XR) | Ray-Ban Display (glasses) |
| --- | --- | --- | --- | --- |
| Selection | look at the target, pinch fingers (indirect); poke for near content | hand ray + pinch, controller ray + trigger, poke | gaze + pinch, hand ray, controllers | thumb swipes and pinches on the EMG wristband move a focus |
| Manipulation | pinch-and-drag windows and 3D objects; two hands to scale | grab with hands or controllers | held pinch to move or resize panels | none (2D cards only) |
| Navigation | mostly turning the head and body; recentre with the Digital Crown | walking in the guardian, teleport in apps | walking, recentre | none in the display, the world is real |
| System control | Control Center, Home view, ornaments, voice (Siri) | quick settings, universal menu, voice (Meta AI) | launcher, Gemini by voice | menus by swipe; Meta AI by voice |
| Symbolic input | virtual keyboard by gaze + pinch or poke, dictation | virtual keyboard by ray or poke, dictation | keyboard, dictation, Gemini | voice; handwriting on the wristband announced |

The platform descriptions come from the official guidelines and product pages cited in section 3 and section 7. The table already shows the main difference to a phone: a phone has one input channel (a finger on glass) with one meaning (the thing under the finger), while a headset has several channels whose meaning depends on depth, distance and what the user happens to be looking at.

## 2. Input: how users point, confirm and type in 3D

### 2.1 The modalities

Headsets moved from controllers to hands and eyes. The table compares the input techniques in use today. Throughput values come from different studies with different devices and designs, so compare within a row, not across rows.

| Modality | How it selects and confirms | Strengths | Weaknesses | Numbers |
| --- | --- | --- | --- | --- |
| Gaze + dwell | look; the target fires after a fixation threshold | hands-free; works for motor-impaired users | Midas touch; the dwell time caps speed | gaze typing rose from 6.9 to 19.9 wpm as dwell fell from 876 to 282 ms over 10 sessions ([Majaranta et al., CHI 2009](https://doi.org/10.1145/1518701.1518758)) |
| Gaze + pinch | look at the target; tap finger and thumb to commit | low effort; works at any distance; flat Fitts slope | early and late triggers; eye-tracker error of about 0.5 to 1.7° | $\mathrm{MT} = 0.63 + 0.35\,\mathrm{ID}$ s on HoloLens 2 ([Wagner et al., CHI 2023](https://doi.org/10.1145/3544548.3581423)) |
| Hand ray + pinch | a ray from the palm; pinch confirms | no device; default on Quest and HoloLens 2 | the pinch moves the ray; arm fatigue; tracking loss | $\mathrm{MT} = -0.27 + 0.88\,\mathrm{ID}$ s (same study); 11.8% slower than a controller ray ([Luong et al., TVCG 2023](https://doi.org/10.1109/TVCG.2023.3320211)) |
| Direct touch | touch virtual buttons within reach | intuitive; preferred over controllers for touch | no haptics; raised arm; misjudged depth | 3.5 bit/s, 7.3% errors (Luong et al.) |
| Controller ray | a ray from a tracked controller; trigger | precise; buttons; haptics; lowest exertion | a device to carry; absent on Vision Pro and glasses | 4.71 bit/s; 18.9% more accurate than a hand ray in tracing (Luong et al.) |
| Voice (+ gaze or pointing) | speak; "that" is grounded by gaze or a point | hands-free; expressive; good for abstract commands | ambiguous referents; not private | see section 7 |
| sEMG wristband | decoded micro-gestures and handwriting | discreet; hand can be out of view | no spatial pointer; slower than baselines | 0.66 target acquisitions/s, 0.88 gestures/s, 20.9 wpm ([Kaifosh et al., Nature 2025](https://doi.org/10.1038/s41586-025-09255-w)) |

**Gaze + pinch** deserves a closer look, because it is the default on Vision Pro and is available on Android XR. It was introduced in research by [Pfeuffer et al. (SUI 2017)](https://doi.org/10.1145/3131277.3132180): "eye gaze to select targets, and indirect freehand gestures to manipulate them". The eyes do what they already do (look at the thing you want), and the hand does what the eyes cannot (commit). A later design essay by the same group ([arXiv 2401.10948](https://arxiv.org/abs/2401.10948), published in IEEE CG&A 2024) gives five principles. The most important for us is *minimal multimodal timing*: gaze only matters at the instant finger and thumb touch, so afterwards the eyes are free and cannot trigger anything by accident. The essay also lists the failure modes: users' habit of moving the hand toward the target, early triggers (the pinch happens before the eyes land) and late triggers (the eyes have already left), awkward long drags, and losing a dropped object because "you can look away". Its fix for timing errors is to use the last stable fixation (about 200 to 300 ms) rather than the current gaze sample.

### 2.2 Pointing models: Fitts' law, and why angles replace centimetres

**Fitts' law** predicts the movement time to acquire a target of width $W$ at distance $A$. In the Shannon formulation used in HCI:

$$
\mathrm{MT} = a + b\,\mathrm{ID}, \qquad \mathrm{ID} = \log_2\!\left(\frac{A}{W} + 1\right)
$$

where $\mathrm{ID}$ is the index of difficulty in bits, and $a$, $b$ are fitted per device and technique. The ISO 9241-9 method ([Soukoreff and MacKenzie, IJHCS 2004](https://doi.org/10.1016/j.ijhcs.2004.09.001)) summarizes a technique by its **throughput** $\mathrm{TP} = \mathrm{ID}\_e / \mathrm{MT}$, in bits per second, where the effective index $\mathrm{ID}\_e$ uses the width $W\_e = 4.133\,\sigma$ that users actually hit ($\sigma$ is the standard deviation of their endpoints). Throughput folds speed and accuracy into one number, which is why the tables above report it.

For pointing at a distance with a ray or the eyes, the physical width in centimetres is the wrong unit. What matters is the **angle** the target covers at the eye. [Kopper et al. (IJHCS 2010)](https://doi.org/10.1016/j.ijhcs.2010.05.001) showed that distal pointing time depends on angular amplitude and angular width, that width matters much more, and that difficulty grows quadratically with it. [Lane et al. (IEEE TVCG 2025)](https://doi.org/10.1109/TVCG.2025.3567078) revisited the question on a Quest 2 with 20 participants and 13,868 trials and found that a plain Fitts index in angles,

$$
\mathrm{ID} = \log_2\!\left(\frac{\alpha}{\omega} + 1\right), \qquad \omega = 2\arctan\frac{W}{2d},
$$

with angular amplitude $\alpha$, angular width $\omega$ and viewing distance $d$, fits with $R^2 = 97.86\%$, against $73.3\%$ for Kopper's model. This is why the platforms specify target sizes as angles (section 3.3): visionOS even "defines a point as an angle".

A worked example shows how quickly targets become hard. A 3 cm button seen from 0.5 m covers $\omega = 2\arctan(0.015/0.5) = 3.4°$. The same button on a window placed 2 m away, where visionOS puts its first window, covers $0.86°$. For a 20° movement the index of difficulty rises from $\log\_2(20/3.4 + 1) = 2.8$ to $\log\_2(20/0.86 + 1) = 4.6$ bits. Worse, $0.86°$ is smaller than the measured error of the eye trackers: $1.65°$ accuracy on Quest Pro ([Wei et al., IMX 2023](https://doi.org/10.1145/3573381.3596467)) and $0.45$ to $1.06°$ on Vision Pro measured from outside ([Huang et al., Virtual Reality 2026](https://doi.org/10.1007/s10055-026-01442-y)). With gaze alone, such a button cannot be hit reliably no matter how carefully the user looks. Microsoft's guidance of at least 1° for ray or gaze targets (3.5 cm at 2 m) and Apple's rule of button centres at least 60 pt apart are the platforms' answer.

Two further results limit what 2D models can say. [Grossman and Balakrishnan (CHI 2004)](https://doi.org/10.1145/985692.985749) showed that in 3D the target's size along the main axis of movement and the movement angle matter, so difficulty depends on direction as well as size. [Teather and Stuerzlinger (3DUI 2011)](https://doi.org/10.1109/3DUI.2011.5759222) found that 2D Fitts' law describes planar pointing even in stereo, but "fully 3D motions ... are less well modeled". For a GUI agent this means that difficulty models from 2D GUIs carry over only to flat panels, not to targets spread in depth.

### 2.3 The cost of depth

Why should depth be special? Headsets show each eye a flat image at a fixed focal distance, but ask the eyes to converge at the virtual object's depth. This **vergence-accommodation conflict** and other missing depth cues make depth hard to judge ([Hoffman et al., Journal of Vision 2008](https://doi.org/10.1167/8.3.33)).

[Barrera Machuca and Stuerzlinger (CHI 2019)](https://doi.org/10.1145/3290605.3300437) measured the consequence for the virtual hand. On a stereo display, movements along the viewing direction were about 25% slower than lateral ones and had about 20% lower throughput, "well beyond" the 9% that differences in visual size could explain. With physical targets the effect disappeared. They extended Fitts' law with a term for the change in target depth (CTD) between consecutive targets:

$$
\mathrm{MT} = 167.6 + 273.5\,\mathrm{ID} + 3.35\,\mathrm{CTD},
$$

which fits better than plain Fitts ($r^2 = 0.98$ and AIC 344, against $0.96$ and 359). Their design advice is concrete: put touch targets 50 to 65 cm away, avoid several interactive objects on one line of sight, and avoid depth changes of 20 cm or more. [Batmaz et al. (IEEE VR 2019)](https://doi.org/10.1109/VR.2019.8797975) repeated the depth penalty on commercial AR and VR headsets. For the eyes, [Bashar et al. (arXiv 2607.27369, to appear in IEEE TVCG / ISMAR 2026)](https://arxiv.org/abs/2607.27369) found on a Quest Pro that gaze + pinch selection gets slower with depth (a large effect, $\eta\_p^2 = 0.767$), and that a Fitts model with a variation-in-diopter term fits much better than the linear one ($R^2 = 0.93$ against $0.63$).

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/03-depth-cost.svg" localized="true" caption="Three costs that a flat screen does not have. (a) Virtual-hand pointing at stereo targets: movements in depth are 25% slower than lateral ones, and visual size explains only 9 points of that (Barrera Machuca and Stuerzlinger, CHI 2019). (b) Ray selection at 8 m on Quest 3: most errors come from the confirm action itself moving the ray (Qiu et al., arXiv 2602.01061). (c) Movement-time models for 3D pointing fit much better once they contain depth or angles (CHI 2019; Lane et al., TVCG 2025; Bashar et al., arXiv 2607.27369)." %}

### 2.4 The Midas touch and the confirmation problem

[Jacob (CHI 1990)](https://doi.org/10.1145/97243.97246) named the central problem of gaze input the **Midas touch**: if looking also triggers, every look issues a command, and the user can no longer look at anything without acting on it. Dwell time is the classic compromise: a target fires only after the eyes rest on it for a threshold, recommended at 350 to 600 ms in the selection survey of [Argelaguet and Andujar (Computers & Graphics 2013)](https://doi.org/10.1016/j.cag.2012.12.003). Dwell is slow, and the right threshold is personal and changes with practice, as Majaranta's typing study above shows. In a VR Fitts' task, dwell made the fewest errors but was significantly slower than pinch or a button click ([Mutasim et al., ETRA 2021](https://doi.org/10.1145/3448018.3457998)).

The opposite problem affects rays: confirming moves the pointer. When the user pinches or pulls a trigger, the hand moves slightly and the ray, amplified by distance, slips off the target. This is called the **Heisenberg effect**. On a Quest 3 with ray selection at 8 m, [Qiu et al. (arXiv 2602.01061, accepted to IEEE TVCG / IEEE VR 2026 according to the authors)](https://arxiv.org/abs/2602.01061) found error rates of 15.20% with a controller and 32.92% with a bare hand, and the Heisenberg effect caused 80.57% and 71.86% of those errors. A model that infers the intended target from the pointing history (weighted VOTE) cut the error rate of score-based hand selection from 21.96% to 7.93%. That model is a small agent in its own right: intent inference from behaviour removes most of the motor error.

### 2.5 Comparing techniques with numbers

The cleanest comparison of freehand techniques is [Wagner et al. (CHI 2023)](https://doi.org/10.1145/3544548.3581423): 20 participants on HoloLens 2, five techniques, three depths (0.5, 1 and 2 m), three amplitudes (3.5°, 8° and 15°) and 3° targets. Gaze & Finger, Gaze & Pinch and Gaze & Handray reached significantly higher throughput than Handray and HeadCrusher (an image-plane pinch). At 2 m, Gaze & Pinch gained 0.83 bit/s over Handray. The fitted lines in the figure below show why: the slope of Gaze & Pinch (0.35 s/bit) is 2.5 times flatter than that of Handray (0.88 s/bit), so gaze degrades much less as targets get harder. The two lines cross at $\mathrm{ID} = 0.9/0.53 \approx 1.7$ bits: for easy targets the hand ray is as fast, for hard targets the eyes win. Users agreed: Gaze & Handray was most preferred (9 of 20), then Gaze & Pinch (7). Handray "need[ed] pronounced head and arm movement".

What happens outside the lab? [Sasalovici et al. (CHI 2025)](https://doi.org/10.1145/3706598.3714077) ran 24 participants with a Varjo XR-3 in a car, with 4.25° targets at 40 cm. Parked, error rates were 8.8% (head gaze), 15.0% (hand ray), 15.6% (direct touch) and 23.5% (gaze + pinch). While driving, they rose to 20.4 to 36.0%. Even at standstill, one selection in seven to one in four missed.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/03-input-fitts.svg" localized="true" caption="(a) Fitts' law lines fitted by Wagner et al. (CHI 2023) on HoloLens 2 with 3° targets, over the ID range they tested. Compare the slopes: Gaze & Pinch rises 0.35 s per bit, Handray 0.88 s per bit, so gaze wins for hard targets and the hand ray only for easy ones. (b) Error rates of four techniques in a parked car (bars) and the range while driving (shaded) from Sasalovici et al. (CHI 2025). The two panels come from different studies and devices." %}

### 2.6 Who can see the input

A detail with large consequences for agents: on the most important gaze-first platform, apps never see the gaze. Apple's guidelines state that "visionOS doesn't provide direct information about where people are looking before they tap"; the hover highlight is drawn by the system, out of the app's process, and Apple's privacy page says eye input "is not shared with apps, websites, or Apple" ([HIG: Eyes](https://developer.apple.com/design/human-interface-guidelines/eyes)). Android XR also does not share raw eye-tracking data with apps and draws the gaze hover itself ([Android XR design guidelines](https://developer.android.com/design/ui/xr/guides/foundations)). Huang et al. had to measure Vision Pro's eye-tracking accuracy from the outside for the same reason. A third-party agent therefore sees the user's commits but not the intent signal that precedes them; only an agent at the operating-system level could use gaze, and that raises its own consent questions.

### 2.7 Try it: the selection lab

The widget below lets you feel these costs. It shows a small room with panels at 0.45, 1, 2 and 4 m, and buttons of different sizes. Pick a technique and run a block of trials: hit the highlighted button as fast as you can. The widget adds simulated noise, which it states on screen, and plots time and errors per target, with a running estimate of throughput and of arm effort.

{% include widget.liquid name="3d-gui-agent-selection-lab" height="640" caption="Selection lab. Choose a technique, press Start, and hit the orange target button. With a mouse, aim by moving and confirm by clicking; on a touch screen, put your finger down to aim, slide, and lift to confirm. Simulated: hand-ray jitter of 0.35° that grows with distance in centimetres, plus a 0.6° kick at the confirm (Heisenberg effect); eye-tracking error of about 1°; dwell selection after 450 ms on any button (Midas touch); direct touch only within 0.65 m, with 1 cm fingertip noise and an occasional depth misjudgment, and a simulated step toward far panels. Arm effort uses the shoulder-torque model and Rohmert's endurance curve of section 4.1 (toy parameters). Small, far targets defeat gaze; depth and reach defeat touch; rays tire the arm." %}

## 3. Spatial UI structure

### 3.1 Windows, volumes and immersive spaces

Every current platform organizes content into three kinds of container. On **visionOS** ([HIG: Designing for visionOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos)), apps start in the *Shared Space*, "where multiple apps can run side-by-side and people can open, close, and relocate windows". **Windows** are glass planes with a window bar and resize controls; **volumes** hold 3D content that can be viewed from any angle; an `ImmersiveSpace` is unbounded, "the system allows only one immersive space to be open at a time", and opening one hides all other apps (a *Full Space*). **Android XR** ([design guidelines](https://developer.android.com/design/ui/xr)) has a *Home Space* for multitasking, in which apps are flat panels (default 1024 × 720 dp), and a *Full Space* where one app can use spatial panels, orbiters (floating controls attached to a panel) and 3D models. **Meta Horizon OS** ([design guidelines](https://developers.meta.com/horizon/design/panels/)) uses panels and system windows with a control bar and resize handles. **HoloLens** uses holograms, hand menus, and tag-along or billboarded panels ([Microsoft Mixed Reality design docs](https://learn.microsoft.com/en-us/windows/mixed-reality/design/comfort)).

Compared with a phone, this adds two layers of state the user must manage: *where* each window is in the room, and *which mode* the system is in (shared or exclusive). A phone has one foreground app on one screen.

### 3.2 Reference frames: world-, body- and head-locked content

Where content stays when the user moves is decided by its **reference frame**. [Feiner et al. (UIST 1993)](https://doi.org/10.1145/168642.168657) already distinguished windows fixed to the head, to the surroundings (the body) and to world objects. The modern vocabulary:

- **World-locked**: anchored to a place in the room, like a picture on a wall. Stable, findable by memory, but out of view when you turn away.
- **Body-locked**: follows the torso, so it stays around you as you turn your head.
- **Head-locked**: follows the head, always at the same spot in view. All platforms advise against it: Apple says it makes people feel "stuck" and breaks Pointer Control and Zoom; Meta says to avoid head-locking HUD content; Microsoft recommends body-locked HUDs instead.
- **Tag-along**: a lazy follower that stays put while it is in view and catches up when it would leave the view, keeping content "a glance away" (Microsoft).

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/03-reference-frames.svg" localized="true" caption="The same four panels before (a) and after (b) the user turns the head 60° left and the torso 20°. The world-locked window (green) stays where it was, now outside the central 41° of the view (dashed lines, the Android XR guideline for primary content); the body-locked panel (orange) turned with the torso; the head-locked label (red) turned with the head; the tag-along panel (blue) lagged and stopped at the edge of the view. Dotted arcs show each panel's path." %}

Which frame is best depends on the task and the person. [Billinghurst et al. (VRAIS 1998)](https://doi.org/10.1109/VRAIS.1998.658418) found body-stabilized displays better than head-stabilized ones for search. The Personal Cockpit of [Ens et al. (CHI 2014)](https://doi.org/10.1145/2556288.2557058), a body-centric layout of windows, made application switching 40% faster than view-fixed baselines. [Belo et al. (arXiv 2608.28064, accepted to IEEE ISMAR 2026)](https://arxiv.org/abs/2608.28064) found that users shift from world-anchored to body-anchored UIs while walking, and that no single body anchor wins. For an agent, the lesson is that "place this window" is not one action but a choice of frame, distance and angle, and that the right choice is personal.

### 3.3 What the guidelines say in numbers

The platform guidelines are unusually quantitative. They define comfort envelopes that are, in effect, constraints for any layout, whether a person or an agent produces it:

| Rule | visionOS | Android XR | Meta Horizon OS | Microsoft MR |
| --- | --- | --- | --- | --- |
| Default distance | first window about 2 m, 1280 × 720 pt, about 3 m wide | apps launch at 1.75 m, panel centre 5° below eye level | touch UI 42 to 46 cm; indirect 0.8 to 3 m; avoid 0.5 to 0.8 m | optimal hologram zone 1.25 to 5 m; display focus about 2 m; fade at 40 cm, clip at 30 cm |
| Depth range | reading content at least 1 m away | panels move between 0.75 and 5 m | movable panels keep their angular size | keep content mostly at 1 m or more |
| Target size | default control 60 × 60 pt (minimum 28 × 28), centres at least 60 pt apart | at least 56 × 56 dp, 8 dp apart | at least 48 dp, angular collider about 2.5 to 3°, 12 mm spacing | at least 2° for touch (1.6 cm at 45 cm), 1° for ray or gaze (3.5 cm at 2 m) |
| Field of view, neck | avoid content that needs head turns | primary content in the central 41° of the view | constant head movement increases discomfort | gaze no more than 10° above or 60° below the horizon; neck rotation under 45° |
| Number of windows | "avoid displaying too many windows" | no limit; avoid overlapping panels | one primary + at most 2 supporting windows | hand menu: one column of three buttons |

The figure puts the distance rules on one axis. Note how narrow the band for direct touch is (a few centimetres around 45 cm on Meta, 50 to 65 cm in the lab study of section 2.3), and that it sits right next to a zone Meta says to avoid (0.5 to 0.8 m), where content is too far to touch and too close for comfortable ray or gaze use.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/03-comfort-zones.svg" localized="true" caption="Distance rules from the four platform guidelines and from a lab study, on a log scale. Green: ranges for content used indirectly (ray or gaze); blue: ranges for direct touch; hatched red: Meta's zone to avoid; vertical marks: clip, fade, focal and default spawn distances. Everything within the shaded band can be touched, but only a thin slice of it is comfortable." %}

### 3.4 Placement, occlusion, off-view content and multitasking

The guidelines also show what they leave to the user. On visionOS the system places only the first window; after that, people place, resize and arrange windows themselves with gaze + pinch on the window bar and corners. Apple notes that "the system doesn't provide information about a person's field of view" to apps. Content can be behind the user, hidden behind another window, or occluded by a real object, and the user has to find it by turning around or recentring. There are 50 classified techniques for occlusion management in 3D visualization ([Elmqvist and Tsigas, TVCG 2008](https://doi.org/10.1109/TVCG.2008.59)), but on a headset most of them are left to the user's own head and hands.

Multitasking in 3D costs time and comfort. With virtual monitors on a headset, [Pavanatto et al. (Frontiers in VR 2023)](https://doi.org/10.3389/frvir.2023.1215820) measured 9.10% slower task completion than a physical workstation (not significant), 37% lower ratings than a laptop on "could continue comfortably for an hour", and 24% lower ratings on focus than the workstation. Working in VR for five 8-hour days ([Biener et al., TVCG 2022](https://doi.org/10.1109/TVCG.2022.3203103)) gave significantly worse ratings on most measures, and 2 of 16 participants dropped out on the first day. Long-term Vision Pro users interviewed by [Biener et al. (arXiv 2509.05067)](https://arxiv.org/abs/2509.05067) named workflow integration and limited ability to adapt and customize. Window management is the clearest example of spatial work that the platform hands to the user and that research systems already automate (section 7.2).

## 4. Measured difficulty

### 4.1 Arm fatigue and "gorilla arm"

Mid-air input tires the arm. Designers called this the **gorilla-arm effect** long before anyone could measure it. **Consumed Endurance** (CE) by [Hincapié-Ramos et al. (CHI 2014)](https://doi.org/10.1145/2556288.2557130) made it measurable from a skeleton stream. CE models the arm as a lever. It sums the gravitational torques of the upper arm and the forearm-plus-hand about the shoulder,

$$
\tau = g\,\big(m\_1 r\_1 + m\_2 r\_2\big), \qquad f = 100\,\frac{\tau}{\tau\_{\max}},
$$

where $m\_i$ are segment masses, $r\_i$ the horizontal distances of their centres of mass from the shoulder, and $f$ the required force in percent of the maximum. Rohmert's endurance curve then predicts how long that force could be held,

$$
E(f) = \frac{1236.5}{(f - 15)^{0.618}} - 72.5 \ \text{s} \quad (f > 15), \qquad \mathrm{CE} = 100\,\frac{T\_{\text{interaction}}}{E(f)}\ \%.
$$

The curve gives 385 s at 20% and 7 s at 100% of maximum force. It is asymptotic at 15%: below that, the predicted endurance is unlimited.

The numbers from the paper (wall display, Kinect, standing users):
- CE correlated with perceived exertion on the Borg CR10 scale with $R^2 = 0.716$ (768 measurements, 16 participants).
- Across plane positions and arm extensions, CE was lowest for the centre plane (27.23%) and the bent arm (23.44%), with the lowest cell at 15.55% (centre plane, bent elbow). Completion time (about 45 s) and landing error did **not** differ. In the authors' words, "differences in fatigue emerge even when other measurements are flat". A system judged only by time and errors would miss the cost.
- A mid-air dwell keyboard reached only 4.55 wpm in the best block, with required strength between 9.2% and 20.46% of maximum across the keyboard grid.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/03-arm-fatigue.svg" localized="true" caption="Left: four arm poses and the shoulder load they need in a toy version of the CE model (our assumptions: 70 kg body, segment masses and centres of mass from standard anthropometric fractions, 50 N m maximum torque). Right: Rohmert's endurance curve as used by CE, with the 15% asymptote. Only the extended arm, typical of direct touch at arm's length, crosses 15% (about 6 minutes of endurance). The above-shoulder pose shows the model's blind spot: its torque is small, but holding the hand up is tiring, which is what NICE and NICER add." %}

The model has known limits. [Li et al. (VRST 2023)](https://doi.org/10.1145/3611659.3615702) found that CE overestimates endurance for low-exertion poses and misses extra exertion above 90° of shoulder elevation. The improved model **NICER** ([Li et al., ACM TOG 2024](https://doi.org/10.1145/3658230)) adds a shoulder-specific endurance function, an empirical term for above-shoulder work, and recovery during rest; its correlation with Borg CR10 was 0.978 and 0.976 for two interaction methods, while CE made no prediction at all in that low-exertion task because of the 15% asymptote. [Jang et al. (CHI 2017)](https://doi.org/10.1145/3025453.3025523) modelled how fatigue accumulates over a session.

What this means on current headsets: Luong et al. found that bare hands put the hand 14.3% higher and 66.2% further forward than controllers during ray selection, with more exertion. Apple's guidelines say direct gestures are "best for infrequent use" and that indirect gestures should be preferred for buttons and common components ([HIG: Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)). Gaze + pinch with the hand resting in the lap sidesteps most of the torque. Fatigue matters most for direct touch, rays, and long sequences such as arranging windows or filling in a form.

### 4.2 Selection errors

The numbers from section 2 add up to a simple fact: on current headsets, selection misses often. In the car study, 8.8 to 23.5% of selections failed at standstill and 20.4 to 36.0% while driving. Ray selection at 8 m failed 15% (controller) to 33% (hand) of the time, mostly because of the confirm action. On a phone, by comparison, touch typing by 37,370 people had 2.3% uncorrected errors ([Palin et al., MobileHCI 2019](https://doi.org/10.1145/3338286.3340120)); misses on large touch buttons are rare enough that nobody reports them.

### 4.3 Text entry

Text is where the gap to the phone is largest and best measured.

- Phones: 36.2 wpm on average, with 2.3% uncorrected errors (37,370 volunteers, Palin et al.).
- Selection keyboards in VR ([Speicher et al., CHI 2018](https://doi.org/10.1145/3173574.3174221), HTC Vive, N = 24): controller pointing was fastest at 15.44 wpm (0.97% errors), then controller tapping 12.69, head pointing 10.20, freehand 9.77 (7.57% errors), continuous cursor 8.35 and the d-pad cursor 5.31 wpm. The fastest built-in method is 43% of phone speed.
- Head-based typing ([Yu et al., CHI 2017](https://doi.org/10.1145/3025453.3025964)): 10.59 wpm with dwell, 15.58 with tap, 19.04 with gesture, and 24.73 after 60 minutes of training.
- A physical keyboard in VR ([Grubert et al., IEEE VR 2018](https://doi.org/10.1109/VR.2018.8446059)): 41.4 wpm outside VR fell to 26.3 inside; a touchscreen keyboard fell from 23.98 to 11.6. Typing without a view of reality gave 30.86% total errors against 4.64% in reality ([McGill et al., CHI 2015](https://doi.org/10.1145/2702123.2702382)). Inexperienced typists lost most: 31.8 against 45.4 wpm, while experienced typists lost little (61.8 against 67.2) ([Knierim et al., CHI 2018](https://doi.org/10.1145/3173574.3173919)).
- Decoding helps: an AR mid-air keyboard with a statistical decoder reached 17.75 wpm with under 1% character errors ([Dudley et al., TOCHI 2018](https://doi.org/10.1145/3232163)). With ideal tracking and simulated auto-correction, the upper bounds were 55.6 wpm with two fingers on a surface and 34.5 wpm with ten fingers in mid-air ([Dudley et al., ISMAR 2019](https://doi.org/10.1109/ISMAR.2019.00027)).
- The field as a whole: a database of 176 XR text-entry techniques ([Bhatia et al., CHI 2025](https://doi.org/10.1145/3706598.3713382)) reports a mean of 20.36 wpm over 137 techniques with a speed figure (range 2.8 to 55.6), and only 20% of their user studies were longitudinal.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/03-text-entry.svg" localized="true" caption="Text entry speeds in words per minute, with the source of each bar. Grey: references outside VR (desktop keyboard and the phone mean, dashed line at 36.2 wpm). Every method that uses only what a headset provides (purple, cyan, orange) stays below the phone; only a physical keyboard or a simulated ideal comes close. Dotted lines: simulated upper bounds with perfect tracking and auto-correction." %}

Today's product keyboards add prediction and swipe, so these lab numbers are lower bounds for current products. But the shape of the result is robust: entering a search query, a URL or a message on a headset takes two to three times as long as on a phone, and the intent behind it is easy to say in words. That makes text entry the most obvious operation to hand to an agent (or at least to dictation plus a model that cleans up the result).

### 4.4 Learnability and discoverability

The most important difficulty for everyday adoption may be the least studied: not knowing what to do. [Khurana et al. (IMWUT 2023)](https://doi.org/10.1145/3631451) observed 25 novices using four consumer AR applications. "Users struggled to discover the correct gestures, with the majority of errors occurring when participants could not determine the correct sequence of actions to perform or could not evaluate their actions." In Norman's terms, these are the **gulf of execution** and the **gulf of evaluation**, not motor failures. The textbook warns about the same thing for "invisible" voice and gesture commands and lists "design for discoverability" among its system-control guidelines.

Other evidence points the same way. In the review corpus of [Dehghani et al. (2021)](https://doi.org/10.1080/0144929X.2021.1876767), the ease-of-use theme was illustrated by an owner who wrote that "trying to remember where the buttons are is not instinctual yet". In the YouTube ethnography of [Tran et al. (CHI 2025)](https://doi.org/10.1145/3706598.3713572), some Vision Pro users did not know that Travel Mode existed and had to find out how to enable it. In a Counterpoint test with 10 users, Vision Pro had "a bit of a learning curve when using the eyes, hands and gestures". And learning is barely measured: only 20% of XR text-entry studies were longitudinal (Bhatia et al.), and Khurana's study is a single session. Nobody knows whether novice difficulty lasts hours or weeks.

### 4.5 Cybersickness

Sickness is not caused by the interface logic, but interaction design affects it, and it caps how long anyone can operate a headset. The **Simulator Sickness Questionnaire** (SSQ) of [Kennedy et al. (1993)](https://doi.org/10.1207/s15327108ijap0303_3) is the standard measure. The meta-analysis of [Saredakis et al. (Frontiers in Human Neuroscience 2020)](https://doi.org/10.3389/fnhum.2020.00096) pooled 55 articles with 3,016 participants:

- pooled total SSQ 28.00 (95% CI 24.66 to 31.35), above the "problem" cut-off of 20 borrowed from flight simulators;
- gaming content highest at 34.26, scenic content lowest at 17.33;
- a mean of 15.6% of participants dropped out because of sickness, across 46 experiments (possibly inflated, since 22 studies did not report dropouts);
- no relation with the share of female participants ($r = -0.172$). A review of 71 papers by [MacArthur et al. (CHI 2021)](https://doi.org/10.1145/3411764.3445701) found the claimed gender gap confounded by study design.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/03-sickness.svg" localized="true" caption="Left: total SSQ scores by content type from the meta-analysis of Saredakis et al. (2020), with 95% confidence intervals where reported, against the flight-simulator cut-offs (dashed). Even scenic content is in the 'concern' band. Right: about one in six study participants (15.6%) quit because of sickness." %}

For agents this cuts both ways. An agent that finishes tasks faster and removes head and view motion shortens exposure. An agent that moves the user's viewpoint automatically creates passive motion, which is one of the factors that shape sickness, so automated navigation could make sickness worse.

### 4.6 Cognitive load

The evidence on cognitive load is mixed. A review of 58 studies of AR in learning ([Buchner et al., JCAL 2022](https://doi.org/10.1111/jcal.12617)) concludes that AR seems less demanding than other media, but also that AR glasses can add unnecessary load, and that spatial AR (projection) beats see-through AR. The long-session studies of section 3.4 point the same way. A guiding agent must keep its own overlays lean, because help is one more thing to look at.

### 4.7 Social acceptability

Some costs are social. Location and audience change people's willingness to perform gestures in public ([Rico and Brewster, CHI 2010](https://doi.org/10.1145/1753326.1753458)). VR glasses are judged acceptable in bed, on a metro or a train, but significantly less so in a living room or a café, where interaction with others is expected ([Schwind et al., MobileHCI 2018 Adjunct](https://doi.org/10.1145/3236112.3236127)). Bystanders of camera glasses want to be asked before being recorded ([Denning et al., CHI 2014](https://doi.org/10.1145/2556288.2557352)), and in a survey of 1,037 Australians, people who did not own Ray-Ban Stories saw more privacy issues ([Kaviani et al., PLOS ONE 2024](https://doi.org/10.1371/journal.pone.0313001)). And a review of 69 papers found no established methods to measure social acceptability at all ([Koelle et al., CHI 2020](https://doi.org/10.1145/3313831.3376162)). Voice, the obvious channel to an agent, carries this cost too.

### 4.8 Difficulty at a glance

| Dimension | Phone | Headset (measured) | Sources |
| --- | --- | --- | --- |
| Text entry | 36.2 wpm, 2.3% uncorrected errors | 5.3 to 15.4 wpm (selection keyboards); field mean 20.4 wpm | Palin 2019; Speicher 2018; Bhatia 2025 |
| Selection errors | rare on large targets | 8.8 to 23.5% (parked car), 20.4 to 36.0% (driving); 15 to 33% for rays at 8 m | Sasalovici 2025; Qiu 2026 |
| Depth | none (one plane) | depth moves 25% slower; throughput about 20% lower | Barrera Machuca 2019 |
| Arm load | finger on a hand-held screen | CE 15.55% best case, more with extended or raised arms | Hincapié-Ramos 2014 |
| Learning | familiar touch conventions | majority of novice errors: not knowing the sequence or the result | Khurana 2023 |
| Sickness | none | pooled SSQ 28; 15.6% dropout in studies | Saredakis 2020 |
| Social | accepted almost everywhere | context-dependent; bystander concerns | Schwind 2018; Denning 2014 |

## 5. Adoption: does complexity keep headsets out of everyday life?

### 5.1 The numbers

All unit figures below are analyst estimates unless marked as company-reported; "derived" marks numbers we computed from a published growth rate.

- **Headsets shrank.** IDC estimates that AR/VR headset shipments peaked at 11.2 M in 2021, fell to 8.8 M in 2022 (−20.9%) and fell another 23.5% in 2023 (about 6.7 M, derived), then grew 10% in 2024 (about 7.4 M, derived), with Meta at 74.6% share ([IDC, 2025-03-25](https://www.idc.com/resource-center/press-releases/growth-expected-to-pause-for-ar-vr-headsets-according-to-idc/)). Counterpoint estimates that VR headset shipments fell 28% in 2025 ([Counterpoint, Q4 2025](https://counterpointresearch.com/en/reports/Global-AR-VR-Market-Insights-and-Development-Trends-Q4-2025)). Omdia estimated that headsets in active use fell 8% to 21.9 M in 2024 and that VR "will remain a niche market as long as it remains in its current form" ([Omdia, 2024-12-12](https://prnewswire.com/news-releases/reality-check-for-vr-omdia-forecasts-decline-as-apples-entry-fails-to-galvanize-market-302330338.html)).
- **Glasses grew.** IDC reports that the XR market including glasses grew 44.4% in 2025, while Meta's Quest shipments fell 42.3% and display-less glasses became the majority of XR shipments ([IDC, 2026-03-23](https://www.idc.com/resource-center/press-releases/xr-market-grew-44-4-in-2025-as-smart-glasses-redefine-the-category/)). EssilorLuxottica sold more than 7 M Ray-Ban Meta and Oakley Meta AI glasses in 2025 (company results as reported by [UploadVR](https://uploadvr.com/meta-essilorluxottica-sold-7-million-smart-glasses-in-2025/)). These glasses have almost no spatial GUI: voice, a camera and audio.
- **Phones are two orders of magnitude bigger.** 1,260.3 M smartphones were shipped in 2025 ([IDC, 2026-01-13](https://www.idc.com/resource-center/press-releases/q425mobilephonetop5/)). IDC's December 2025 forecast of 14.5 M XR devices for 2025 is about 1.2% of that.
- **The leading vendor is losing money.** Meta's Reality Labs reported USD 2,207 M revenue and an operating loss of USD 19,193 M in 2025 ([Meta, 2026-01-28](https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Fourth-Quarter-and-Full-Year-2025-Results/)), and USD 443 M revenue with a USD 4,129 M loss in Q3 2026 ([10-Q](https://www.sec.gov/Archives/edgar/data/0001326801/000162828026066773/meta-20260930.htm)).
- **Forecasts kept missing.** In December 2023, IDC expected 8.1 M units for 2023 and 28.6 M for 2027.

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/03-market.svg" localized="true" caption="(a) Yearly shipments on a log scale: AR/VR headsets (IDC; hollow points derived by us from IDC growth rates), the 2025 IDC forecast for all XR devices including glasses, Meta AI glasses sold in 2025, smartphones, and IDC's December 2023 forecast (dashed), which the market did not follow. (b) Reasons US adults gave for not buying a Vision Pro in February 2024 (Variety VIP+ / CivicScience, N = 1,069). 'Too hard to use' was not offered as an answer, so the survey could not detect it." %}

### 5.2 Why people do not buy, and why they stop

- **Price dominates purchase decisions.** Among US adults not buying a Vision Pro in February 2024 (Variety VIP+ with CivicScience, N = 1,069; [data](https://datawrapper.dwcdn.net/tcgki/1/)), 65.5% named price; 22.3% said they were not aware of its capabilities; 20.9% said a phone, TV or laptop suffices; 15% said it is uncomfortable; 13.5% named nausea; 12.2% not enough content; 10.2% isolation.
- **Discomfort and health risk drive discontinuance.** Dehghani et al. coded 3,205 Amazon reviews of 10 VR devices (2016 to 2019 generation). Perceived discomfort was 39% of codes, health risk 30%, missing content 21%, external compatibility 21%, and ease of use ("effort expectancy") 7%. In their survey of 119 users, discomfort lowered continuance intention ($\beta = -0.159$) and usage ($\beta = -0.262$), and health risk lowered continuance ($\beta = -0.234$). Ease of use was not among the measured predictors.
- **Use stays narrow.** In spring 2023, 29% of US teens owned a VR device, but only 4% of owners used it daily and 14% weekly (Piper Sandler via [CNBC](https://www.cnbc.com/2023/04/04/american-teens-not-into-virtual-reality-only-4percent-use-it-daily-.html)). In 112 YouTube videos of sustained use (about 27 h, mostly Vision Pro), use was mainly media and games; productivity was limited by hardware and apps (Tran et al.).
- **Trying is not buying.** After an extensive metaverse trial, almost 100 participants wanted to use headsets more but to buy them less ([Hennig-Thurau et al., J. Interactive Marketing 2025](https://doi.org/10.1177/10949968241263353)), which points to value and price rather than an inability to operate the device.

### 5.3 Where interface complexity appears

Usability does appear in this evidence, in five forms:

1. A minor but real theme in owner reviews: 7% of codes, about remembering controller mappings (Dehghani et al.).
2. A learning curve with eyes, hands and gestures noted by analysts (Counterpoint, 10 testers, not peer-reviewed).
3. Everyday friction in the interaction layer: no precise input like a mouse, hand tracking failing in the dark, a hidden Travel Mode, window management, missing continuity with phone and PC (Tran et al.).
4. "Ease of use" and "cognitive affordance" as significant antecedents in acceptance models ([Rauschnabel and Ro 2016](https://doi.org/10.1504/IJTMKT.2016.075690); [Jo and Park 2023](https://doi.org/10.1038/s41598-023-42113-1)), alongside usefulness, comfort and social norms.
5. "Not aware of its capabilities" (22.3%), a discoverability problem, which is closer to the agent thesis than raw complexity.

There is counter-evidence. Early adopters describe the Vision Pro interface as intuitive ([Tafesse, SAGE Open 2026](https://doi.org/10.1177/21582440261464433)). The fastest-growing device class has almost no GUI at all, which can be read as "simpler interaction wins" (supporting the column) or as "cheaper, lighter and fashionable wins" (not supporting it); the data cannot separate the two, because price, weight and interface simplicity change together. And no survey we found even offers "too hard to use" as an answer.

**The honest verdict.** Operating 3D interfaces is measurably harder than operating a phone, and this adds to the price, comfort, content and sickness barriers that dominate the adoption evidence. It shows up mainly as learning, discoverability, input precision and configuration effort. An agent can lower these costs. It cannot fix weight, price or sickness. The missing evidence is itself a research opportunity: a longitudinal study of why owners stop using Quest-era and Vision Pro-era devices, with "too hard to use" as an option, does not exist.

## 6. Accessibility: who is excluded today

XR adds barriers for people whom phones already serve reasonably well. The reviews of [Dudley et al. (Virtual Reality 2023)](https://doi.org/10.1007/s10055-023-00850-8) and [Creed et al. (UAIS 2023)](https://doi.org/10.1007/s10209-023-00969-0) map them across physical, cognitive, visual and auditory impairments. [Gerling and Spiel (CHI 2021)](https://doi.org/10.1145/3411764.3445196) argue that VR assumes a "corporeal standard", a non-disabled body that stands, turns and raises two hands.

- **Blind and low-vision users.** Low-vision participants struggled with details at a distance, depth, and searching for targets. With SeeingVR's 14 tools ([Zhao et al., CHI 2019](https://doi.org/10.1145/3290605.3300341)), all 11 participants completed a menu task that only 4 could complete without aids; visual search fell from 7.51 to 3.98 s. Blind users are excluded from most apps. VRSight ([Killough et al., UIST 2025](https://doi.org/10.1145/3746059.3747641)) describes unmodified VR apps from the headset video (a detector trained on 17,691 VR images, depth, OCR and GPT-4o, about 2.3 to 2.6 s per query). Its 9 blind and low-vision participants all found the menu in Rec Room, but only one found the specific button: menu trials had an 11% completion rate. **Describing a scene is far easier than operating a 3D UI.** Participants asked for d-pad navigation, snapping and row/column reading, in other words for a discrete action space.
- **People with limited mobility.** Interviews with 16 people found seven physical-access barriers, from first setup to keeping controllers in view of the headset's cameras ([Mott et al., ASSETS 2020](https://doi.org/10.1145/3373625.3416998)). Seated users cannot easily turn to content behind them; point-of-interest techniques that turn the virtual camera instead of the body help ([Franz et al., ASSETS 2021](https://doi.org/10.1145/3441852.3471230)).
- **Older adults.** 36 adults aged 60+ using Quest 2 social VR complained about headset weight, eyeglass fit, controllers needing finger dexterity, and too little training ([Kalantari et al., Innovation in Aging 2023](https://doi.org/10.1093/geroni/igad031)).
- **Deaf and hard-of-hearing users.** Work focuses on captions placed in 3D ([Jain et al., DIS 2018](https://doi.org/10.1145/3197391.3205404)) and visual or haptic substitutes for sound ([Jain et al., ICMI 2021](https://doi.org/10.1145/3462244.3479946)), not on operating UIs.

The platform accessibility services are the closest thing to an agent layer on headsets today. They read a UI tree and act on behalf of the user:

| Platform | Services (official names) | Can operate | Cannot (as documented) |
| --- | --- | --- | --- |
| Vision Pro | VoiceOver (pinch gestures; look-to-explore; "Describe passthrough"; "Label item"), Zoom, Pointer Control (eyes, head, wrist or finger), Dwell Control, Switch Control, Voice Control | system UI, SwiftUI windows, and 3D entities that expose an `AccessibilityComponent` | unlabelled 3D entities; Dwell Control documents tap and scroll only |
| Android XR | TalkBack (pinch gestures, explore mode with a hand pointer, can be turned on by asking Gemini), magnification, hover actions with gaze | Android views in panels, through the Android accessibility tree | how immersive environments and 3D content are read is not documented |
| Meta Quest | screen reader (under "Settings > Experimental"), color correction, live captions | system UI and 2D panel apps with content descriptions | immersive apps, which draw their own UI; the checklist items are recommendations |
| HoloLens 2 | voice ("select", "What can I say?"), eye-gaze Start gesture | system shell, Start menu, 2D windows | no HoloLens-specific screen reader page found |

Sources: Apple Vision Pro User Guide, Android XR help, [Meta's accessibility checklist](https://developers.meta.com/horizon/design/accessibility-checklist/), [HoloLens 2 basic usage](https://learn.microsoft.com/en-us/hololens/hololens2-basic-usage). These services enumerate labelled elements and move focus in a reading order. They cannot give spatial structure (what is left, behind, near), cannot act on unlabelled 3D content (most content inside immersive apps), and cannot map a free-form 3D manipulation to a command. The W3C's [XR Accessibility User Requirements](https://www.w3.org/TR/2021/NOTE-xaur-20210825/) ask that all of the interface be reachable with one input method and that no action require several simultaneous inputs; they also name the missing piece, "a need for accessibility API's that map custom user interface actions to control types". Those requirements are also the preconditions for a 3D GUI agent.

## 7. What exists to help, and its limits

### 7.1 Tutorials and onboarding

Learning to interact is a separate, costly phase of VR use. [Chauvergne et al. (CHI 2023)](https://doi.org/10.1145/3544548.3581211) built a framework for VR onboarding from 21 ergonomic reviews of tutorials and 15 expert interviews. [Kao et al. (CHI PLAY 2021)](https://doi.org/10.1145/3474661) analysed 50 popular VR games: 90% had a tutorial level, 88% used text help, 56% diagrams and only 22% labelled the virtual controllers. In four online experiments with 433 headset owners, tooltips attached to the virtual controllers improved learnability in a shooter and a puzzle game but made no difference in a wave shooter and a rhythm game. Help that is anchored in space can work, but tutorials are one-shot, mostly text, and not available later when a user forgets.

### 7.2 Adaptive and intelligent UIs

A line of research lets the system decide what to show, where and how much, and it already takes over part of the spatial work with measured gains:

| System | What it does | Result |
| --- | --- | --- |
| [Lindlbauer et al., UIST 2019](https://doi.org/10.1145/3332165.3347945) | rule-based + combinatorial optimization of which apps appear, at what detail, where, from cognitive load | −36% secondary-task interactions |
| [SemanticAdapt, UIST 2021](https://doi.org/10.1145/3472749.3474750) | a linear program placing UI by semantic links to physical objects (recipe next to the stove) | −33% manual adaptations |
| [AUIT, UIST 2022](https://doi.org/10.1145/3526113.3545651) | toolkit of adaptation objectives (reachability, visibility, consistency) with a real-time solver | a reusable objective library |
| [SituationAdapt, UIST 2024](https://doi.org/10.1145/3654777.3676470) | GPT-4V rates where UI may cover the real scene; an optimizer places it | ranked first by all 12 participants |
| [DuoZone, arXiv 2511.15676](https://arxiv.org/abs/2511.15676) | GPT-4.1 recommends apps and layouts on Vision Pro; users refine by direct manipulation | 34.5% faster layout matching; 168 s vs 218 s to build a workspace; NASA-TLX 33 vs 48; 82.8% of layouts accepted |
| [Put-that-there via LLMs, arXiv 2511.02378](https://arxiv.org/abs/2511.02378) | GPT-4 fuses a 3D scene, speech, pointing and head gaze into JSON `place` / `remove` actions | action schema, no user study yet |
| [ConverseMR, arXiv 2610.24640](https://arxiv.org/abs/2610.24640) | spoken requests mapped to adaptation objectives | speech and direct manipulation are complementary |

These systems *arrange* the UI. None of them operates the content inside the windows, and most run inside their own app, not on the system's windows. Users accept most but not all proposals (about 17% of DuoZone's layout suggestions were rejected), and they keep refining spoken commands after seeing the result. And rearranging too often is itself a cost, which is why SemanticAdapt has a consistency term.

### 7.3 Assistants and voice control on shipping devices

As of November 2026:

| Device | Assistant | Can operate | Not documented |
| --- | --- | --- | --- |
| Vision Pro (visionOS 27, beta) | Siri AI with Visual Intelligence: onscreen awareness, gaze-to-invoke ([Apple, 2026-06-08](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/)) | app actions (messages, playlists, alarms), Environments, accessibility toggles | pressing arbitrary buttons or changing arbitrary settings |
| Vision Pro | Voice Control ([support page](https://support.apple.com/guide/apple-vision-pro/perform-actions-with-your-voice-tan14d179ad1/visionos)) | any named or numbered element: "Tap 3", "Swipe up at 5", grid overlays | planning: the user names every step |
| Quest 3 / 3S | Meta AI ([Meta, 2024-07-23](https://about.fb.com/news/2024/07/meta-ai-is-now-multilingual-more-creative-and-smarter/)), replacing Voice Commands, to "control your headset hands-free"; vision of the physical room | system commands, answers | recognition of virtual objects and app UIs |
| Galaxy XR (Android XR) | Gemini ([Google](https://blog.google/products/android/samsung-galaxy-xr/)): "take action on your behalf across your apps"; "Hey Google, organize these windows" | window layout, Maps, YouTube search | a list of supported actions; acting inside immersive third-party apps |
| Ray-Ban Display | Meta AI with visual answers and "step-by-step how-tos" ([Meta, 2025-09-17](https://about.fb.com/news/2025/09/meta-ray-ban-display-ai-glasses-emg-wristband/)) | shows guidance; the user swipes through it | operating the display UI for the user |

Gemini's "organize these windows" is the closest shipping product to a 3D GUI agent: it sees the mixed scene and acts on the spatial layout. Apple's Voice Control is the closest *action space*: it can reach any labelled element, but it has no planner, so a ten-step settings change is ten spoken commands.

### 7.4 Research assistants and first XR GUI perception

Research systems go further, mostly in perception. GazePointAR ([Lee et al., CHI 2024](https://doi.org/10.1145/3613904.3642230)) fuses gaze, pointing and conversation history to resolve "this" and "that" in wearable AR, but answered only 13 of 32 participant-invented queries satisfactorily, at about 7.5 to 7.9 s per answer. RAVEN ([Cao et al., CHI 2026](https://doi.org/10.1145/3772318.3791616)) gives an LLM the scene graph of a Unity scene and lets it write code to answer or edit; 75.3% of 336 prompts from 8 blind and low-vision users succeeded, at 3.1 s on average. For GUI perception, Orienter ([Li et al., arXiv 2409.10811](https://arxiv.org/abs/2409.10811)) detects interactable elements in screenshots of 100 VR apps with an interactability F1 of only 46.00% (against 29.32% for the best baseline), and in GUI-World ([Chen et al., ICLR 2025](https://arxiv.org/abs/2406.10819)) XR was the hardest of six scenarios for every model. No benchmark yet measures an agent *operating* a headset UI.

### 7.5 The limits

- **Latency.** LLM assistants in XR answer in about 3 to 12 s; a pinch takes well under a second. Agents pay off for multi-step or hard operations, not for single easy selections.
- **Perception.** XR GUI perception is weak (F1 46%), and platforms withhold gaze and the field of view.
- **Platform access.** No documented third-party API lets an agent move another app's windows or inject input on visionOS; post hoc tools such as VRSight need a tethered PC and developer mode.
- **Agency.** In VRCopilot ([Zhang et al., UIST 2024](https://doi.org/10.1145/3654777.3676451)), fully automatic creation lowered the user's sense of agency compared with scaffolded creation, and some low-vision users felt an aid "feels like cheating" in games (SeeingVR). Shipping agentic flows keep a final confirmation step.

## 8. The catalogue: 30 operations and who should act

The dossier of this column ends with a catalogue of concrete operations on a headset or glasses, each with the techniques used today, the measured or reported difficulty, and a judgment of whether a 3D GUI agent could **do it**, **guide** the user, or **neither**. The judgments are our assessment, not findings of the cited works.

| # | Operation | Measured or reported difficulty | Agent role |
| --- | --- | --- | --- |
| 1 | Select a small target at a distance | time grows with angular size; 72 to 81% of ray errors at 8 m come from the confirm | do it (with scene-graph or accessibility access); otherwise guide (highlight, enlarge, snap) |
| 2 | Select an occluded object in a dense scene | density and visibility degrade selection; eye-hand mismatch | do it via the object list; or reveal the target |
| 3 | Press buttons at different depths | depth moves 25% slower; gaze degrades with depth | neither; re-place targets on one depth plane at 50 to 65 cm |
| 4 | Travel to a far location | teleport increases disorientation | guide (path cues, preview); do it only on explicit command |
| 5 | Rotate or scale an object precisely | mid-air manipulation "often lack[s] precision and control" | do it: exact numeric poses |
| 6 | Select a button by gaze + pinch | early and late triggers; eye-tracker error 0.45 to 1.7° | do it for named targets; guide for small ones |
| 7 | Select an occluded or distant 3D object | rays need line of sight; parallax hurts at depth | do it if the object is named; otherwise offer a list |
| 8 | Drag a slider precisely or move a far object | hand ray 18.9% less accurate than a controller in tracing | do it for exact values; guide subjective ones |
| 9 | Scroll a long list | raised arms tire; no XR scrolling study found | do it by jumping to the item; neither for browsing |
| 10 | Voice command referring to "that" | pronouns sometimes counter-intuitive | do it if gaze or pointing can be fused; else ask |
| 11 | Open, place and resize a window | 218 s vs 168 s to build a workspace without and with LLM help | do it in its own app or with OS rights; else guide |
| 12 | Find a window that is behind you | neck rotation over 45° to avoid; view-fixed switching 40% slower | do it with window poses; else guide by sound or arrows |
| 13 | Arrange several windows | virtual monitors: 37% lower comfort, 24% lower focus | do it (82.8% of LLM layouts accepted), with a manual fallback |
| 14 | Pin a window or widget to a wall | scene detectors miss walls; content drifts | do it where anchors exist; guide otherwise |
| 15 | Move a virtual object onto a real table | no haptics; poor depth judgment near the body | do it ("place X on the table"); guide fine alignment |
| 16 | Switch to a Full Space | hides other apps and the surroundings | guide: a user decision |
| 17 | Type a search query or short message | 5.3 to 15.4 wpm vs 36.2 on phones | do it, with one confirmation |
| 18 | Enter a password or PIN | same costs; prediction cannot help | neither: route to passkeys or a paired phone |
| 19 | Hold the arm up for a long interaction | CE rises with arm height and extension | do it; offer when a fatigue estimate rises |
| 20 | First use of an app by a novice | most errors: not knowing the sequence or the result | guide: explain, point, confirm success |
| 21 | Select small targets while moving | 20.4 to 36.0% errors while driving | do it, with confirmation |
| 22 | A blind user presses a menu button in an immersive app | 11% completion with scene description | do it, with confirmation; or snap and step through elements |
| 23 | A blind user finds a free seat | 5 of 9 succeeded | guide; optionally move the user |
| 24 | A seated user selects an object behind them | seven physical-access barriers | do it: "bring X to me", "turn the view to X" |
| 25 | A low-vision user reads distant text | 4 of 11 managed without aids | guide (read aloud, highlight), or do it on request |
| 26 | Find and open an app | voice routes already exist | do it |
| 27 | Change a buried setting | Voice Control needs one command per step | do it, with confirmation |
| 28 | Learn a new gesture or controller mapping | tutorial modality helps only in some apps | guide: a motor skill cannot be delegated |
| 29 | Follow a multi-step procedure | AR overlays cut assembly errors by 82% | guide for physical steps; do virtual steps later |
| 30 | Find and use a control inside any 3D app | interactability F1 46% | neither yet: perception is the bottleneck |

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/03-catalogue.svg" localized="true" caption="The 30 operations of the catalogue, grouped by task (rows) and by who should act (columns). Look at the first column: most operations whose goal is easy to say but whose execution is costly in 3D (selection, layout, text, buried settings) can be done by an agent, but many only with scene-graph, accessibility or OS access (*). Learning, judgment and safety-relevant mode changes stay with the user; passwords and controls in arbitrary 3D apps are out of reach today." %}

Reading the catalogue:

- **The agent can do it** when the goal is easy to state in words and the execution is expensive in 3D: placing and arranging windows, finding content behind the user, typing a query, navigating a buried setting, selecting a tiny, distant or occluded target. The costs it removes are the ones measured in section 4: depth-dependent pointing, arm fatigue, text entry at a fraction of phone speed, and multi-step menus. One utterance and one confirmation replace them.
- **The agent should guide** when the user must judge the result or acquire the skill: learning gestures, fine visual alignment, safety-relevant mode changes, and travel, where spatial awareness belongs to the user.
- **Neither, yet** for what is physical (fit, comfort, sickness), secret (passwords), or not perceivable (unlabelled controls in arbitrary 3D apps).

## 9. What this means for 3D GUI agents

1. **The cost is real, measurable, and concentrated in a few operations.** Text, small or far selection, window management and buried commands account for most of the measured gap to the phone. A 3D GUI agent should be judged on those first.
2. **The action space must be richer than tap, swipe and type.** The five universal tasks suggest primitives: `select(target)`, `set_pose(object, pose)`, `place(window, anchor)`, `travel(to)`, `find(object)`, `command(path)`, `type(text)`. The platforms' numeric comfort envelopes (section 3.3) and the pointing models with depth terms (section 2) can serve as constraints and as a cost model that tells the agent when to act and when to guide.
3. **The observation space is undefined.** A 2D agent sees a screenshot and an accessibility tree. In XR, the user's view is per-eye, head-dependent and private, gaze is withheld, and the accessibility tree covers 2D panels and labelled 3D entities only.
4. **Mixed initiative, not autopilot.** Users accept most but not all proposals, refine after seeing results, and want to keep agency.
5. **Accessibility is the strongest near-term case.** Screen readers and Voice Control already provide the action space; an agent adds the plan. VRSight's 11% menu completion marks exactly the step an operating agent would remove.
6. **Benchmarks and human baselines are missing.** No benchmark measures task success for an agent on a headset UI, and no study reports per-task human baselines (time, errors, fatigue) for whole tasks on commercial devices.

[Post 4]({{ '/blog/2026/3d-gui-agent-04-agents-in-xr-and-the-gap/' | relative_url }}) surveys what AI agents in XR and 3D can already do and where exactly the gap lies; the [research vision]({{ '/blog/2026/3d-gui-agent-01-research-vision/' | relative_url }}) turns the catalogue into research questions, and [the research plan]({{ '/blog/2026/3d-gui-agent-05-research-plan/' | relative_url }}) follows from them.

## Try it

- In the **selection lab** (section 2.7), run one block with *gaze + pinch* and one with *hand ray*. Which targets does each technique fail on? Compare the throughput estimates with the slopes in the Fitts figure.
- Switch to *gaze + dwell* and try to reach the far panel without passing over other buttons. How many unintended selections (Midas touch) did you make?
- Run a block with *direct touch* and watch the arm-effort bar. Then run *gaze + pinch*: why does it stay near zero?

## Representative papers

| Title | Authors | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- | --- |
| "Put-that-there": voice and gesture at the graphics interface | R. A. Bolt | SIGGRAPH | 1980 | [DOI](https://doi.org/10.1145/800250.807503) | The archetype of the deictic command an XR agent must ground |
| What you look at is what you get: eye movement-based interaction techniques | R. J. K. Jacob | CHI | 1990 | [DOI](https://doi.org/10.1145/97243.97246) | Names the Midas touch problem of gaze input |
| Windows on the world: 2D windows for 3D augmented reality | S. Feiner et al. | UIST | 1993 | [DOI](https://doi.org/10.1145/168642.168657) | Head-, body- and world-fixed windows |
| 3D User Interfaces: Theory and Practice (2nd ed.) | J. J. LaViola Jr. et al. | Addison-Wesley | 2017 | [book site](https://people.cs.vt.edu/~bowman/3dui.org/Table_of_Contents.html) | The task taxonomy; system control as "what, not how" |
| Towards a standard for pointing device evaluation | R. W. Soukoreff, I. S. MacKenzie | IJHCS | 2004 | [DOI](https://doi.org/10.1016/j.ijhcs.2004.09.001) | ISO 9241-9 throughput |
| A human motor behavior model for distal pointing tasks | R. Kopper et al. | IJHCS | 2010 | [DOI](https://doi.org/10.1016/j.ijhcs.2010.05.001) | Angular size, not centimetres, governs ray pointing |
| A survey of 3D object selection techniques for virtual environments | F. Argelaguet, C. Andujar | Computers & Graphics | 2013 | [DOI](https://doi.org/10.1016/j.cag.2012.12.003) | Why 3D selection fails; disambiguation taxonomy |
| Consumed endurance: a metric to quantify arm fatigue of mid-air interactions | J. D. Hincapié-Ramos et al. | CHI | 2014 | [DOI](https://doi.org/10.1145/2556288.2557130) | Measures gorilla arm from a skeleton stream |
| The personal cockpit | B. M. Ens et al. | CHI | 2014 | [DOI](https://doi.org/10.1145/2556288.2557058) | Body-centric windows, 40% faster switching |
| Gaze + pinch interaction in virtual reality | K. Pfeuffer et al. | SUI | 2017 | [DOI](https://doi.org/10.1145/3131277.3132180) | Origin of the visionOS input model |
| Selection-based text entry in virtual reality | M. Speicher et al. | CHI | 2018 | [DOI](https://doi.org/10.1145/3173574.3174221) | Six VR keyboards, 5.3 to 15.4 wpm |
| The effect of stereo display deficiencies on virtual hand pointing | M. D. Barrera Machuca, W. Stuerzlinger | CHI | 2019 | [DOI](https://doi.org/10.1145/3290605.3300437) | Depth moves 25% slower; Fitts with a depth term |
| Context-aware online adaptation of mixed reality interfaces | D. Lindlbauer et al. | UIST | 2019 | [DOI](https://doi.org/10.1145/3332165.3347945) | The system decides when, where and how much |
| SeeingVR | Y. Zhao et al. | CHI | 2019 | [DOI](https://doi.org/10.1145/3290605.3300341) | Accessibility overlay; post hoc vs metadata tools |
| Factors associated with virtual reality sickness in head-mounted displays | D. Saredakis et al. | Front. Hum. Neurosci. | 2020 | [DOI](https://doi.org/10.3389/fnhum.2020.00096) | Pooled SSQ 28; 15.6% dropout |
| Understanding the accessibility of virtual reality for people with limited mobility | M. Mott et al. | ASSETS | 2020 | [DOI](https://doi.org/10.1145/3373625.3416998) | Seven physical-access barriers |
| A holistic analysis towards understanding consumer perceptions of VR devices in the post-adoption phase | M. Dehghani et al. | Behaviour & IT | 2021 | [DOI](https://doi.org/10.1080/0144929X.2021.1876767) | Discomfort, not ease of use, predicts discontinuance |
| Evaluating tutorial-based instructions for controllers in VR games | D. Kao et al. | CHI PLAY | 2021 | [DOI](https://doi.org/10.1145/3474661) | What onboarding looks like and when spatial help works |
| SemanticAdapt | Y. F. Cheng et al. | UIST | 2021 | [DOI](https://doi.org/10.1145/3472749.3474750) | Semantic placement, −33% manual adaptations |
| A Fitts' law study of gaze-hand alignment for selection in 3D user interfaces | U. Wagner et al. | CHI | 2023 | [DOI](https://doi.org/10.1145/3544548.3581423) | Fitts models for five freehand techniques |
| Controllers or bare hands? | T. Luong et al. | IEEE TVCG | 2023 | [DOI](https://doi.org/10.1109/TVCG.2023.3320211) | Hands cost speed, accuracy and exertion even with perfect tracking |
| "Do I just tap my headset?" Novice discovery of gestural interactions | A. Khurana et al. | IMWUT | 2023 | [DOI](https://doi.org/10.1145/3631451) | Novices fail at discovery, not motion |
| NICER: a new and improved consumed endurance and recovery metric | Y. Li et al. | ACM TOG | 2024 | [DOI](https://doi.org/10.1145/3658230) | Current fatigue model with recovery |
| SituationAdapt | Z. Li et al. | UIST | 2024 | [DOI](https://doi.org/10.1145/3654777.3676470) | VLM reasoning about where UI may go |
| GazePointAR | J. Lee et al. | CHI | 2024 | [DOI](https://doi.org/10.1145/3613904.3642230) | Gaze + pointing + speech to resolve "this" |
| Bumpy ride? External forces on spatial interactions in moving vehicles | M. Sasalovici et al. | CHI | 2025 | [DOI](https://doi.org/10.1145/3706598.3714077) | 9 to 36% selection errors in a car |
| Wearable AR in everyday contexts | T. T. M. Tran et al. | CHI | 2025 | [DOI](https://doi.org/10.1145/3706598.3713572) | Everyday friction in the interaction layer |
| Text Entry for XR Trove (TEXT) | A. Bhatia et al. | CHI | 2025 | [DOI](https://doi.org/10.1145/3706598.3713382) | 176 XR text-entry techniques, mean 20.4 wpm |
| Revisiting performance models of distal pointing tasks in VR | L. Lane et al. | IEEE TVCG | 2025 | [DOI](https://doi.org/10.1109/TVCG.2025.3567078) | Angular Fitts index fits with R² 0.98 |
| VRSight | D. Killough et al. | UIST | 2025 | [DOI](https://doi.org/10.1145/3746059.3747641) | Describing is not operating: 11% menu completion |
| A generic non-invasive neuromotor interface for human-computer interaction | P. Kaifosh et al. | Nature | 2025 | [DOI](https://doi.org/10.1038/s41586-025-09255-w) | EMG input for glasses |
| Direct vs. score-based selection: the Heisenberg effect in VR | L. Qiu et al. | arXiv preprint (accepted to TVCG / IEEE VR 2026 per authors) | 2026 | [arXiv](https://arxiv.org/abs/2602.01061) | The confirm action causes most ray errors |
| Evaluating the vergence-accommodation conflict in gaze-based 3D target selection | M. R. Bashar et al. | arXiv preprint (IEEE TVCG / ISMAR 2026) | 2026 | [arXiv](https://arxiv.org/abs/2607.27369) | Gaze selection cost grows with depth |
| DuoZone: LLM-guided mixed-initiative XR window management | J. Qian et al. | arXiv preprint | 2025 | [arXiv](https://arxiv.org/abs/2511.15676) | LLM window layout on Vision Pro, 34.5% faster |
| Grounded GUI understanding for vision-based spatial intelligent agent (Orienter) | S. Li et al. | arXiv preprint | 2024 | [arXiv](https://arxiv.org/abs/2409.10811) | First XR GUI element detection; F1 46% |
| RAVEN | X. Cao et al. | CHI | 2026 | [DOI](https://doi.org/10.1145/3772318.3791616) | An LLM acting on a VR scene graph for blind users |

## Learning resources

- J. J. LaViola Jr., E. Kruijff, R. P. McMahan, D. A. Bowman, I. Poupyrev, *3D User Interfaces: Theory and Practice*, 2nd ed., Addison-Wesley, 2017: chapters 7 (selection and manipulation), 8 (travel and wayfinding) and 9 (system control and symbolic input). The [book site](https://people.cs.vt.edu/~bowman/3dui.org/Table_of_Contents.html) has the table of contents.
- Platform guidelines, which are short and full of numbers: [Apple visionOS HIG](https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos), [Android XR design](https://developer.android.com/design/ui/xr), [Meta Horizon OS design](https://developers.meta.com/horizon/design/panels/), [Microsoft Mixed Reality comfort](https://learn.microsoft.com/en-us/windows/mixed-reality/design/comfort).
- I. S. MacKenzie, *Human-Computer Interaction: An Empirical Research Perspective* (Morgan Kaufmann, 2013), for Fitts' law, throughput and text-entry methodology.
- The W3C [XR Accessibility User Requirements](https://www.w3.org/TR/2021/NOTE-xaur-20210825/) and the [XR Access](https://xraccess.org/) community.
- The [Text Entry for XR Trove](https://arxiv.org/abs/2503.11357) for a searchable overview of XR keyboards.
- Reading list for this column: `docs/reading-lists/3d-gui-agent.md` in the site repository.

## Exercises

1. A settings window is 2 m away and its toggles are 2.5 cm wide. Compute their angular width. With an eye tracker of 1° accuracy and Microsoft's 1° rule, can they be operated by gaze + pinch? How large would they have to be, and how far away could the window be placed instead?

   <details markdown="1"><summary>Hint</summary>

   $\omega = 2\arctan(0.0125/2) = 0.72°$, below both the tracker error and the 1° minimum. A 1° target at 2 m is $2 \cdot 2 \tan(0.5°) = 3.5$ cm; to make the 2.5 cm toggle cover 1°, move the window to $0.0125/\tan(0.5°) = 1.43$ m. Apple's angular points solve the same problem by scaling the window with distance.
   </details>

2. Using the two lines of Wagner et al., $\mathrm{MT} = -0.27 + 0.88\,\mathrm{ID}$ (Handray) and $\mathrm{MT} = 0.63 + 0.35\,\mathrm{ID}$ (Gaze & Pinch), find the index of difficulty where the two techniques take the same time. For a block of 20 selections at ID 2.5, how many seconds does gaze save? Why should you not extrapolate to ID 4.6?

   <details markdown="1"><summary>Hint</summary>

   They cross at $\mathrm{ID} = 0.90 / 0.53 \approx 1.70$ bits. At ID 2.5: $1.93$ s against $1.505$ s, so about $0.43$ s per selection and $8.5$ s per block. The models were fitted on 3° targets with IDs between 1.1 and 2.6 bits; at 4.6 bits the target is smaller than the eye-tracker error, so gaze would miss rather than slow down.
   </details>

3. Write the CE computation for a user who holds a hand ray with the arm extended (shoulder load 20.5% of maximum) for 4 minutes while arranging windows. What is CE? What would CE be for the same 4 minutes with the elbow bent (12%)? What does this say about the 15% asymptote, and how would NICER differ?

   <details markdown="1"><summary>Hint</summary>

   $E(20.5) = 1236.5/5.5^{0.618} - 72.5 \approx 360$ s, so $\mathrm{CE} = 240/360 = 67\%$. At 12% the endurance is unlimited and CE is 0, although four minutes with a raised forearm is not effortless. NICER replaces Rohmert's curve with a shoulder-specific endurance function that does not have this asymptote, and models recovery during rest.
   </details>

4. Take one task you do weekly on your phone (for example, sending a short message to a contact found by name). Break it down into the five 3D interaction tasks as it would be done on a headset, estimate the time of each step from the numbers in this post, and mark which steps an agent could do, guide or neither.

   <details markdown="1"><summary>Hint</summary>

   For example: open the app (system control, a selection at about 1 s), find the contact (symbolic input: a 6-letter search at 10 to 15 wpm takes about 5 to 7 s, plus errors), select it (selection), dictate the message, confirm. The search and the typing dominate; both are "do it with confirmation" rows of the catalogue.
   </details>

5. The adoption surveys in section 5 never offer "too hard to use" as an answer. Design a short survey or diary study that could measure whether interface complexity contributes to people stopping headset use, without leading the participants.

   <details markdown="1"><summary>Hint</summary>

   Recruit owners at purchase and follow them for months (diary entries and, with consent, usage logs). Ask open questions first ("what did you try to do last time and what happened?"), then a ranked list that includes price, comfort, content, sickness, social reasons, setup, *and* "I could not figure out how to do X". Exit interviews when usage stops separate abandonment reasons from first-week friction.
   </details>

**Next:** [Agents in XR and the gap]({{ '/blog/2026/3d-gui-agent-04-agents-in-xr-and-the-gap/' | relative_url }}): what AI agents in XR and 3D can already perceive and do, the platforms and tooling they run on, and the gap a 3D GUI agent would fill.
