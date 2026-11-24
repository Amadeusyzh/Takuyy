# Part D: Measured difficulty of operating XR interfaces

Compiled 2026-11-24 for the column "3D GUI agents". The title, first author, venue, year and DOI of every
entry were checked against OpenAlex and Crossref records. The DOIs of 2025 papers were also checked against
the arXiv abs page that OpenAlex links. Numbers come from text that was actually read, and each note says
where. "Full text" means the paper itself was read: an author copy (university repository or lab page), an
arXiv/ar5iv HTML version, or the open-access publisher page. "Abstract" means only the abstract was
available (OpenAlex/Semantic Scholar record), so no numbers beyond the abstract are given for that work.
Where a number was reported second-hand by another paper, the note says so.

## 1. Works

| ID | Title | First author et al. | Venue / status | Year | Link | Contribution (one line) | Relevance to 3D GUI agents (one line) |
|---|---|---|---|---|---|---|---|
| D01 | Consumed endurance: a metric to quantify arm fatigue of mid-air interactions | Juan David Hincapié-Ramos et al. | ACM CHI 2014 | 2014 | https://doi.org/10.1145/2556288.2557130 | Defines Consumed Endurance (CE), a torque-based estimate of the "gorilla-arm" effect that correlates with Borg CR10. Applies it to selection methods and a mid-air keyboard layout (full text, author copy). | A cheap, real-time fatigue signal an agent could use to decide when to take over or move a panel. |
| D02 | Modeling cumulative arm fatigue in mid-air interaction based on perceived exertion and kinetics of arm motion | Sujin Jang et al. | ACM CHI 2017 | 2017 | https://doi.org/10.1145/3025453.3025523 | Estimates each user's maximum shoulder torque from a pointing task and models cumulative subjective fatigue over time (abstract). | Fatigue builds up over a session, so an agent's help is worth more late in a session than early. |
| D03 | NICER: A New and Improved Consumed Endurance and Recovery Metric to Quantify Muscle Fatigue of Mid-Air Interactions | Yi Li et al. | ACM Transactions on Graphics 43(4) | 2024 | https://doi.org/10.1145/3658230 (arXiv: https://arxiv.org/abs/2406.08875) | Hybrid fatigue model with a shoulder-specific endurance function, an empirical term for above-shoulder work, and recovery during rest. Correlation with Borg CR10 ρ = 0.978/0.976 (full text, ar5iv). | The current best open model for predicting when a user's arm is tired. It could serve as an agent's cost function. |
| D04 | Selection-based Text Entry in Virtual Reality | Marco Speicher et al. | ACM CHI 2018 | 2018 | https://doi.org/10.1145/3173574.3174221 | Six virtual-keyboard selection methods on an HTC Vive, N = 24. Controller pointing was fastest at 15.44 wpm. The discrete cursor was slowest at 5.31 wpm (full text, DFKI copy). | The standard benchmark for "type with what the headset gives you". Every method is below half of phone speed. |
| D05 | Text Entry in Immersive Head-Mounted Display-Based Virtual Reality Using Standard Keyboards | Jens Grubert et al. | IEEE VR 2018 | 2018 | https://doi.org/10.1109/VR.2018.8446059 (arXiv: https://arxiv.org/abs/1802.00626) | Desktop and touchscreen keyboards used inside VR (Rift DK2, N = 24). Desktop: 41.4 wpm outside vs 26.3 wpm inside VR. Touchscreen: 23.98 vs 11.6 wpm (full text, ar5iv). | Even a real keyboard loses about 40% of its speed when the user cannot see it, which is a cost an agent can avoid entirely. |
| D06 | Physical Keyboards in Virtual Reality: Analysis of Typing Performance and Effects of Avatar Hands | Pascal Knierim et al. | ACM CHI 2018 | 2018 | https://doi.org/10.1145/3173574.3173919 | Tracked hands and keyboard rendered in VR, N = 32. Inexperienced typists: 31.8 wpm with no hands vs 45.4 wpm in the real world. Experienced typists: 61.8 vs 67.2 wpm (full text, Aalto copy). | Novices suffer most from missing visual feedback, which makes them the main beneficiaries of an assisting agent. |
| D07 | A Dose of Reality: Overcoming Usability Challenges in VR Head-Mounted Displays | Mark McGill et al. | ACM CHI 2015 | 2015 | https://doi.org/10.1145/2702123.2702382 | Survey of 108 HMD users plus a typing study. Typing in VR without a view of reality: 23.6 wpm and 30.86% total error rate, vs 58.9 wpm and 4.64% in reality (full text, Glasgow eprint). | Early evidence that interacting with peripherals and real objects is a major impediment to HMD use, not only input inside VR. |
| D08 | Tap, Dwell or Gesture? Exploring Head-Based Text Entry Techniques for HMDs | Chun Yu et al. | ACM CHI 2017 | 2017 | https://doi.org/10.1145/3025453.3025964 | Head-pointing keyboards: DwellType 10.59, TapType 15.58, GestureType 19.04 wpm. Refined GestureType reached 24.73 wpm after 60 min of training (abstract). | Hands-free input exists but is slow and needs training, so voice-plus-agent input competes with it directly. |
| D09 | Fast and Precise Touch-Based Text Entry for Head-Mounted Augmented Reality with Variable Occlusion | John J. Dudley et al. | ACM TOCHI 25(6) | 2018 | https://doi.org/10.1145/3232163 | VISAR mid-air touch keyboard with a statistical decoder for AR HMDs: 17.75 wpm, CER < 1%, 19.6% faster than a HoloLens gaze-then-gesture baseline (abstract). | Shows how much of XR typing speed comes from decoding (inference), which is the same kind of help an agent provides. |
| D10 | Performance Envelopes of Virtual Keyboard Text Input Strategies in Virtual Reality | John J. Dudley et al. | IEEE ISMAR 2019 | 2019 | https://doi.org/10.1109/ISMAR.2019.00027 | Upper bounds with ideal tracking and simulated auto-correction, N = 24: 55.6 wpm (two fingers on a surface) down to 34.5 wpm (ten fingers in mid-air) (full text, Cambridge repository). | Even the best case for mid-air typing is below desktop typing. A physical surface is the main lever. |
| D11 | Text Entry for XR Trove (TEXT): Collecting and Analyzing Techniques for Text Input in XR | Arpit Bhatia et al. | ACM CHI 2025 | 2025 | https://doi.org/10.1145/3706598.3713382 (arXiv: https://arxiv.org/abs/2503.11357) | Database of 176 XR text-entry techniques. Mean reported speed 20.36 wpm (range 2.8 to 55.6, 137 techniques). Only 20% of user studies were longitudinal (full text, arXiv HTML). | A survey of the whole field, and a ready table for comparing an agent's "type for me" against the alternatives. |
| D12 | How do People Type on Mobile Devices? Observations from a Study with 37,000 Volunteers | Kseniia Palin et al. | ACM MobileHCI 2019 | 2019 | https://doi.org/10.1145/3338286.3340120 | 37,370 volunteers typed on phones at 36.2 wpm on average with 2.3% uncorrected errors (abstract). | The phone baseline: the speed users expect for entering text. |
| D13 | Bumpy Ride? Understanding the Effects of External Forces on Spatial Interactions in Moving Vehicles | Markus Sasalovici et al. | ACM CHI 2025 | 2025 | https://doi.org/10.1145/3706598.3714077 (arXiv: https://arxiv.org/abs/2502.16656) | Field study (Varjo XR-3, N = 24) of Gaze&Pinch, DirectTouch, Handray and HeadGaze in a car. Error rates of 8.8 to 23.5% at standstill and 20.4 to 36.0% while moving (full text, arXiv HTML). | Selection on current headsets misses often, and more so in real-world contexts, so an agent must verify that each action took effect. |
| D14 | "Do I Just Tap My Headset?": How Novice Users Discover Gestural Interactions with Consumer Augmented Reality Applications | Anjali Khurana et al. | Proc. ACM IMWUT 7(4) | 2023 | https://doi.org/10.1145/3631451 | Observed 25 novices using four AR applications. Most errors came from not knowing the action sequence (gulf of execution) or not being able to evaluate the result (gulf of evaluation). Expert validation with 8 practitioners (abstract). | The clearest evidence that discoverability, not motor skill, blocks first-time XR users. This is the gap a guiding agent fills. |
| D15 | Simulator Sickness Questionnaire: An Enhanced Method for Quantifying Simulator Sickness | Robert S. Kennedy et al. | International Journal of Aviation Psychology 3(3) | 1993 | https://doi.org/10.1207/s15327108ijap0303_3 | Derives the SSQ from the Pensacola MSQ through factor analysis, using a database of more than 1,100 MSQs from 10 Navy simulators and data from 3,691 simulator hops (abstract). | The standard instrument for the sickness side of "how hard is XR to use". Any agent study in XR should report it. |
| D16 | Factors Associated With Virtual Reality Sickness in Head-Mounted Displays: A Systematic Review and Meta-Analysis | Dimitrios Saredakis et al. | Frontiers in Human Neuroscience 14 | 2020 | https://doi.org/10.3389/fnhum.2020.00096 | 55 articles, 3,016 participants. Pooled total SSQ 28.00. Mean sickness dropout 15.6% across 46 experiments (full text, Frontiers). | Sets the baseline: about one in six study participants quit because of sickness. An agent that shortens exposure or cuts head motion attacks this directly. |
| D17 | Identifying Causes of and Solutions for Cybersickness in Immersive Technology: Reformulation of a Research and Development Agenda | Kay M. Stanney et al. | IJHCI 36(19) | 2020 | https://doi.org/10.1080/10447318.2020.1828535 | Calls cybersickness "a common user problem" and sets an R&D agenda: lighter untethered displays, lower latency, standard measurement, better countermeasures (abstract). | Places sickness among the main barriers to mass adoption, i.e. to the user population an agent would serve. |
| D18 | You're Making Me Sick: A Systematic Review of How Virtual Reality Research Considers Gender & Cybersickness | Cayley MacArthur et al. | ACM CHI 2021 | 2021 | https://doi.org/10.1145/3411764.3445701 | Review of 71 publications (59 studies, 12 surveys). The claimed gender gap in cybersickness is confounded by study design, missing demographics and recruitment bias (full text, UWSpace author copy). | Warns that user models used by an agent (e.g., "who gets sick") rest on weak and biased data. |
| D19 | Usable gestures for mobile interfaces: evaluating social acceptability | Julie Rico and Stephen A. Brewster | ACM CHI 2010 | 2010 | https://doi.org/10.1145/1753326.1753458 | A survey and an in-situ study (including a busy street). Location and audience significantly affect willingness to perform gestures (abstract). | Mid-air gestures and speech are judged by bystanders, which limits which modalities an agent can ask the user to perform. |
| D20 | Social Acceptability in HCI: A Survey of Methods, Measures, and Design Strategies | Marion Koelle et al. | ACM CHI 2020 | 2020 | https://doi.org/10.1145/3313831.3376162 | Systematic analysis of 69 papers. Finds no established methods and shortcomings in the measures used (abstract). | There is no standard way to measure whether an agent-mediated interaction is socially acceptable. |
| D21 | Virtual reality on the go? A study on social acceptance of VR glasses | Valentin Schwind et al. | ACM MobileHCI 2018 Adjunct | 2018 | https://doi.org/10.1145/3236112.3236127 | Online experiment across six contexts. VR glasses are acceptable in bed, metro or train, but significantly less so in a living room or café, where interaction with others is expected (abstract). | Context decides whether headset use is acceptable at all. An agent cannot fix this, but it can shorten exposure. |
| D22 | In situ with bystanders of augmented reality glasses: perspectives on recording and privacy-mediating technologies | Tamara Denning et al. | ACM CHI 2014 | 2014 | https://doi.org/10.1145/2556288.2557352 | 12 café field sessions, 31 bystanders interviewed. Reactions split between indifferent and negative. Bystanders want to be asked before being recorded (abstract). | An agent that perceives the world through the glasses' cameras raises the bystander problem directly. |
| D23 | The impact of augmented reality on cognitive load and performance: A systematic review | Josef Buchner et al. | Journal of Computer Assisted Learning 38(1) | 2022 (online 2021) | https://doi.org/10.1111/jcal.12617 | 58 studies. AR seems less demanding than other media, but the evidence is mostly media comparisons. AR glasses can add unnecessary cognitive load. Spatial AR beats see-through AR (abstract). | The headset itself adds load, so a guiding agent must keep its own overlays lean. |

## 2. Deep notes

### D01: Consumed Endurance (Hincapié-Ramos et al., CHI 2014)

**Problem.** Mid-air input causes arm fatigue, the "gorilla-arm effect". Designers blamed it for the limits
of their techniques but had no quantitative way to measure it.

**Method.** CE models the arm as a lever, estimates shoulder torque from skeleton tracking (Kinect), and
normalizes it by maximum torque. It then uses Rohmert's endurance-time function to predict how long the pose
could be held. CE is interaction time divided by that endurance time, in percent. The paper notes that
Rohmert's equation "is asymptotic at 15% of the maximum force": forces below 15% can be held for a long time
(full text, section on endurance). Validation: 16 participants (8 female) held the arm at different angles
for 15, 30, 45 and 60 s, giving 768 CE measurements and 256 Borg CR10 ratings. Three design experiments with
12 participants each used a 4 × 2.3 m projected screen with participants standing 3.3 m away.

**Data and results** (all from the author PDF at hci.cs.umanitoba.ca, results sections):
- CE vs Borg CR10: linear regression R² = 0.716 (p < 0.001). CE showed no gender effect.
- Experiment 1 (plane location × arm extension): CE was lowest for the center plane (27.23%) and the bent
  arm (23.44%). The lowest single cell was center plane + bent arm at 15.55%. Completion time (average 45 s)
  and landing error did not differ significantly. In the authors' words, "differences in fatigue emerge even
  when other measurements are flat".
- Experiment 2 (selection method): CE was lowest for a mouse click held in the other hand (8.18%). Click was
  also fastest (40.76 s per block of targets). Dwell used a 1.5 s threshold.
- Experiment 3 (mid-air dwell keyboard, SEATO vs QWERTY): over the grid, required strength ranged from 9.2%
  of maximum (lower-left cell) to 20.46% (upper-right cell). The best block reached only 4.55 wpm
  (SD 1.26). The paper states that SEATO "had a lower average CE compared to QWERTY at 6.43%" but does not make
  clear whether 6.43% is SEATO's mean or the difference.

**Limitations.** Done on a large wall display with Kinect, not a headset. It uses a population constant for
maximum torque. Li et al. later found that CE overestimates endurance time for low-exertion poses and that a
torque-only model misses extra exertion above 90° of shoulder elevation (Li et al. VRST 2023, abstract;
see Section 8). NICER (D03) reports that CE produced no predictions at all in its low-exertion selection
task, because of the 15% asymptote (ar5iv full text, Table 3).

**Transfers to agents.** (1) Fatigue is measurable from the same pose stream an XR agent already has, so an
agent can watch CE or NICER live and offer to take over when it rises. (2) Time and error rates did not show
the fatigue difference, so an agent judged only on task success will miss it. (3) The low-CE zone (center,
elbow bent) is a concrete placement target for an agent that moves panels.

**Does not transfer.** CE says nothing about which actions are hard to discover or plan. It measures the
arm, not the interface. Gaze-and-pinch with the hand resting in the lap (visionOS) largely sidesteps the
torque problem, so CE matters most for direct touch and ray pointing.

### D04: Selection-based text entry in VR (Speicher et al., CHI 2018)

**Problem.** Consumer VR shipped without a text-entry solution, and there was little comparative data on
virtual-keyboard selection methods.

**Method.** A design space for selection-based VR text entry, then a within-subjects study of six methods on
an HTC Vive with tracked controllers. Head Pointing (HP), Controller Pointing (CP), Controller Tapping (CT,
the controller held like a pen), Freehand (FH), Discrete Cursor (DC, d-pad) and Continuous Cursor (CC).
24 participants (19 male, 5 female, aged 22 to 29), 5 phrases per method (720 trials), Latin-square order.
Measures were WPM, corrected error rate, UEQ, NASA-TLX subscales, sickness and immersion.

**Data and results** (DFKI author PDF, Results section and Table 3; mean ± SD):

| Method | WPM | Error rate (%, corrected) |
|---|---|---|
| Controller Pointing | 15.44 ± 2.68 | 0.97 ± 1.19 |
| Controller Tapping | 12.69 ± 2.27 | 1.94 ± 2.22 |
| Head Pointing | 10.20 ± 1.91 | 1.15 ± 2.14 |
| Freehand | 9.77 ± 4.78 | 7.57 ± 7.69 |
| Continuous Cursor | 8.35 ± 1.58 | 2.15 ± 2.93 |
| Discrete Cursor | 5.31 ± 1.05 | 2.79 ± 3.02 |

WPM differed significantly (F(5,120) = 36.28, p < 0.01, η² = 0.60). FH, CC and HP formed one speed group.
CP was rated best on user experience (M = 1.17 on a −3 to 3 scale) and lowest on frustration. The body text
gives error rates as "M = 0.01" (CP) and "M = 0.76" (FH), which do not match Table 3. The table values are
used here.

**Limitations.** Only five phrases per method, so there is no learning curve. Young, mostly male sample.
Hardware from 2016 (Vive). No word prediction or auto-correction.

**Transfers to agents.** The fastest built-in method (15.44 wpm) is about 43% of the phone mean
(36.2 wpm, D12) and about 37% of the desktop-keyboard baseline in D05 (41.4 wpm). Typing a URL, search query or
message is a clear task to hand to an agent (dictation + LLM rewrite + one confirmation). Freehand, the
closest analogue to today's hand-tracking keyboards, had both low speed and the highest error rate.

**Does not transfer.** Lab copy-typing measures motor speed only. Composing text, editing it and correcting
an agent's mistakes have their own costs, and none of these were measured. Today's keyboards (Quest, visionOS)
add prediction and swipe, so absolute numbers are lower bounds for current products.

### D16: VR sickness meta-analysis (Saredakis et al., Frontiers in Human Neuroscience 2020)

**Problem.** Many HMD users still get sick. How much does content matter, and which user factors are
involved?

**Method.** PRISMA systematic review and meta-analysis of HMD studies that reported SSQ scores. 55 articles,
3,016 participants, mean age range 19.5 to 80, 41% female.

**Data and results** (Frontiers full text: Abstract, Table 3, Results "Dropouts", Discussion):
- Pooled total SSQ across content: 28.00 (95% CI 24.66 to 31.35), from 54 experiments.
- By content: gaming 34.26 (29.57 to 38.95, n = 25), 360° video 27.42 (n = 10), minimalist 21.71 (n = 5),
  scenic 17.33 (n = 10). The content effect was significant (Q = 18.745, p < 0.001).
- Exposure time, total SSQ: < 10 min 23.47; ≥ 10 min 33.42; ≥ 20 min 27.35. Not significant for the total
  (p = 0.066).
- Age: samples with mean age < 35 scored 28.44 vs 14.30 for ≥ 35 (n = 4 experiments; p = 0.006). The
  authors caution that the evidence base for older users is small.
- Sex: no relation between percentage female and total SSQ (r = −0.172, p = 0.170).
- Dropouts: mean dropout due to VR sickness was 15.6% across 46 experiments. The authors note that
  22 studies did not report dropouts, so the figure may be inflated. Earlier gaming studies they cite reported
  dropouts from 44 to 100%.
- Cut-offs (citing Kennedy et al. 2003): 10 to 15 significant symptoms, 15 to 20 a concern, > 20 a "problem
  simulator". The authors note these come from military flight-simulator personnel.

**Limitations.** SSQ cut-offs are borrowed from simulators. Older users are under-represented. Heterogeneous
hardware, many of them older HMDs. The analysis covers sickness during exposure, not difficulty of operation
as such.

**Transfers to agents.** (1) Sickness rises with visual motion and locomotion, so an agent that operates
menus or navigates for the user can reduce head and view motion. (2) A pooled mean of 28 is already above
the "problem" cut-off, so short sessions matter, and an agent that finishes tasks faster cuts exposure.
(3) Dropout is a real cost in agent user studies: plan for about 15% attrition.

**Does not transfer.** Sickness comes from the display and content, not from the UI logic. An agent cannot
remove latency or vergence-accommodation conflict. If an agent moves the user's viewpoint automatically, that
is artificial locomotion, which D16 lists among the factors that shape sickness profiles, so it could make
sickness worse.

### D14: Novice discovery of AR gestures (Khurana et al., IMWUT 2023)

**Problem.** Consumer AR apps on immersive headsets require unfamiliar gestures and interaction paradigms.
How do everyday users discover them, and what goes wrong?

**Method** (abstract, Semantic Scholar/OpenAlex record; research questions also confirmed from the
anonymized draft hosted at hci.cs.sfu.ca through search snippets). An observational study of 25 novices
"from diverse backgrounds and technical knowledge" using four different AR applications that need a range of
interaction techniques. Gesture interaction traces were coded for errors. An expert validation study followed
with eight professional AR designers, engineers and researchers. The research questions ask how novices
discover the required gestural input, what barriers they face, and what workarounds they use.

**Data and results.** From the abstract: "users struggled to discover the correct gestures, with the
majority of errors occurring when participants could not determine the correct sequence of actions to
perform or could not evaluate their actions". In Norman's terms these are the gulfs of execution and
evaluation (the draft uses these terms). The full paper (28 pages) could not be read. The ACM PDF returned
HTTP 403 and the author draft exceeds the fetch size limit, so no per-category error counts are given here.

**Limitations.** Small qualitative sample. Specific apps and devices (not recorded here because the full
text was not read). Single session, so the work shows first contact, not learning over time.

**Transfers to agents.** This is the strongest case for a guiding agent. The errors are about knowing
what to do next and whether it worked, which is exactly what a VLM agent with screen understanding can
answer ("pinch with thumb and index while looking at the button; the panel moved, so it worked"). The
authors' own implications are AR-specific onboarding and help systems, and better system-level gesture
recognition. Related evidence: in D06 the typing deficit in VR was concentrated in inexperienced typists, and
in D11 only 20% of text-entry studies were longitudinal, so novice difficulty is under-measured in general.

**Does not transfer.** An agent cannot perform physical gestures for the user in a gesture-first app if the
platform exposes no API or accessibility action. In that case the agent can only guide, and the guidance
itself is one more overlay to understand (see D23).

## 3. Difficulty at a glance

| Dimension | Measure | Value(s) | Condition / device | Source ID |
|---|---|---|---|---|
| Text entry, reference | WPM, error | 36.2 wpm, 2.3% uncorrected errors | Phones, 37,370 web volunteers | D12 |
| Text entry, reference | WPM | 41.4 (Grubert); 45.4 inexperienced / 67.2 experienced (Knierim); 58.9 (McGill) | Desktop keyboard, outside VR | D05, D06, D07 |
| Text entry, physical keyboard in VR | WPM, error | 26.3 wpm (about 59% of own baseline); CER 2.1% vs 0.9% outside | Rift DK2, keyboard and hands rendered in place ("NoReposition") | D05 |
| Text entry, physical keyboard in VR, no hands | WPM | 31.8 inexperienced / 61.8 experienced | Tracked keyboard, no hand rendering | D06 |
| Text entry, physical keyboard in VR, no view of reality | WPM, total error | 23.6 wpm, 30.86% TER (vs 58.9, 4.64% in reality); with keyboard blended in: 38.5 wpm, 9.20% | VR HMD, CHI 2015 study (headset model not recorded here) | D07 |
| Text entry, touchscreen keyboard in VR | WPM | 11.6 (vs 23.98 outside VR) | Rift DK2 | D05 |
| Text entry, controller pointing | WPM, error | 15.44 wpm, 0.97% | HTC Vive | D04 |
| Text entry, head pointing | WPM | 10.20 (Speicher); dwell 10.59, tap 15.58, gesture 19.04, gesture after 60 min 24.73 (Yu) | Vive; HMD head-pointing | D04, D08 |
| Text entry, freehand / mid-air | WPM, error | 9.77 wpm, 7.57% (freehand); 4.55 wpm (mid-air dwell on a wall display) | Vive; Kinect + projector | D04, D01 |
| Text entry, AR mid-air touch with decoder | WPM, CER | 17.75 wpm, < 1% | AR HMD (HoloLens baseline) | D09 |
| Text entry, upper bound | WPM (simulated auto-correct) | 55.6 (2 fingers on surface), 51.6 (10 on surface), 42.1 (2 mid-air), 34.5 (10 mid-air) | Ideal tracking, N = 24 | D10 |
| Text entry, field average | WPM, TER | Mean 20.36 wpm (2.8 to 55.6, 137 techniques); mean TER 7.96% (58 techniques) | 176 XR techniques | D11 |
| Arm fatigue | CE | 15.55% best (center, bent arm) to higher for shoulder-height or extended arm; 9.2 to 20.46% of max strength across a mid-air keyboard grid | Kinect, standing | D01 |
| Arm fatigue model fit | Pearson ρ with Borg CR10 | NICER 0.978 / 0.976; CF (2023 update) 0.966 / 0.923; CF (Jang 2017) 0.954 / 0.940; CE no prediction | Mid-air selection, two methods | D03 (CF from D02) |
| Selection errors | Error rate | Standstill: HeadGaze 8.8%, Handray 15.0%, DirectTouch 15.6%, Gaze&Pinch 23.5%. Moving car: 20.4 to 36.0% | Varjo XR-3, 4.25° targets at 40 cm | D13 |
| Selection throughput | bits/s | 1.93 (HeadGaze) to 2.19 (DirectTouch); 2.25 standstill vs 1.82 moving (pooled) | Same | D13 |
| Cybersickness | Total SSQ | Pooled 28.00; gaming 34.26; scenic 17.33; > 20 = "problem simulator" cut-off | 55 HMD studies | D16 |
| Cybersickness dropout | % leaving due to sickness | 15.6% mean across 46 experiments (possibly inflated) | Same | D16 |
| Sex / gender and sickness | SSQ, review | No sex effect in meta-analysis (r = −0.172); review of 71 papers finds the gender evidence confounded; female share about 47.5% across reviewed studies | HMD studies | D16, D18 |
| Learnability | Error source | Majority of novice errors: not knowing the action sequence or not being able to evaluate it | 25 novices, 4 AR apps | D14 |
| Learnability | Learning effect | No significant learning effect for keyboards in VR (D05). Head-gesture typing rose to 24.73 wpm after 60 min (D08). Only 20% of XR text-entry studies longitudinal (D11) | Various | D05, D08, D11 |
| Social acceptability | Context effect | Acceptable in bed, metro, train; significantly less in living room or café | Online experiment, six contexts | D21 |
| Bystander privacy | Interview | 31 bystanders: reactions split between indifferent and negative; want to be asked before recording | Café field sessions | D22 |
| Cognitive load | Review | 58 studies: AR glasses can add unnecessary load; spatial AR better than see-through | Learning settings | D23 |

## 4. Facts and numbers

- CE correlates with Borg CR10 with R² = 0.716 over 768 measurements from 16 participants [D01, https://doi.org/10.1145/2556288.2557130].
- In CE's plane/extension experiment, fatigue differed significantly while completion time (about 45 s) and landing error did not [D01, https://doi.org/10.1145/2556288.2557130].
- Rohmert's endurance function used by CE is asymptotic at 15% of maximum force. NICER replaces it because CE cannot register fatigue from low-intensity work, and CE gave no prediction in NICER's selection task [D01, D03, https://doi.org/10.1145/3658230].
- NICER's correlation with Borg CR10 was ρ = 0.978 and 0.976 for two interaction methods, vs 0.966 and 0.923 for the Cumulative Fatigue model. The authors note overlapping confidence intervals [D03, https://arxiv.org/abs/2406.08875].
- Controller pointing was the fastest of six VR selection keyboards at 15.44 wpm. The discrete cursor was slowest at 5.31 wpm [D04, https://doi.org/10.1145/3173574.3174221].
- A desktop keyboard used inside VR fell from 41.4 to 26.3 wpm, and a touchscreen keyboard from 23.98 to 11.6 wpm. The abstract states retention of about 60% and 40 to 45% [D05, https://doi.org/10.1109/VR.2018.8446059].
- Inexperienced typists reached 31.8 wpm with no hands shown in VR vs 45.4 wpm in the real world. Experienced typists reached 61.8 vs 67.2 wpm [D06, https://doi.org/10.1145/3173574.3173919].
- Typing in VR without seeing reality gave 30.86% total error rate. Blending in the real keyboard cut it to 9.20% [D07, https://doi.org/10.1145/2702123.2702382].
- In a survey of 108 HMD users, over half of respondents agreed that interacting with peripherals and with real-world objects impeded their HMD use [D07, https://doi.org/10.1145/2702123.2702382].
- Head-based typing reached 10.59 (dwell), 15.58 (tap) and 19.04 wpm (gesture), and 24.73 wpm after 60 minutes of training [D08, https://doi.org/10.1145/3025453.3025964].
- An AR mid-air touch keyboard with a statistical decoder reached 17.75 wpm with CER below 1% [D09, https://doi.org/10.1145/3232163].
- With ideal tracking and simulated auto-correction, typing on a surface reached 55.6 wpm (two fingers). Ten-finger mid-air typing reached 34.5 wpm, and users "overwhelmingly fail to effectively engage all ten fingers in mid-air" [D10, https://doi.org/10.1109/ISMAR.2019.00027].
- Across 137 XR text-entry techniques reporting speed, the mean is 20.36 wpm. Only 29 of 140 techniques with user studies (20%) used a longitudinal design [D11, https://arxiv.org/abs/2503.11357].
- Phone typing averages 36.2 wpm with 2.3% uncorrected errors [D12, https://doi.org/10.1145/3338286.3340120].
- On a Varjo XR-3 in a parked car, selection error rates were 8.8 to 23.5% depending on technique. They rose to 20.4 to 36.0% while driving [D13, https://arxiv.org/abs/2502.16656].
- Novices using consumer AR apps mostly failed at knowing the action sequence or judging its result, not at executing the motion [D14, https://doi.org/10.1145/3631451].
- The pooled total SSQ across 55 HMD studies is 28.00, above the > 20 "problem simulator" cut-off. Gaming content scores highest at 34.26 [D16, https://doi.org/10.3389/fnhum.2020.00096].
- On average 15.6% of participants dropped out because of VR sickness (46 experiments) [D16, https://doi.org/10.3389/fnhum.2020.00096].
- Samples with mean age ≥ 35 had lower SSQ (14.30 vs 28.44), based on only 4 experiments [D16, https://doi.org/10.3389/fnhum.2020.00096].
- MacArthur et al. quote a study by Stanney et al. with 1,102 participants in which female participants had 15% higher total symptom severity. This is second-hand, and the underlying Stanney paper was not identified or read [D18, https://doi.org/10.1145/3411764.3445701].
- VR glasses are judged acceptable in bed or on a train but significantly less so in a living room or café [D21, https://doi.org/10.1145/3236112.3236127].
- Bystanders of AR glasses want to be asked permission before being recorded [D22, https://doi.org/10.1145/2556288.2557352].
- A review of 58 AR learning studies concludes that AR glasses can unnecessarily increase cognitive load [D23, https://doi.org/10.1111/jcal.12617].

## 5. Open problems (as they bear on 3D GUI agents)

1. **No benchmark of "operating an XR system" as a whole.** The literature measures parts (wpm, Fitts
   throughput, SSQ, CE) but not end-to-end tasks such as "change a setting" or "find and open a file" on a
   commercial headset. A 3D GUI agent benchmark needs human baselines for such tasks, and none were found.
2. **Novice data is thin and short.** D14 is a single session. D11 finds only 20% longitudinal text-entry
   studies. Nobody has measured how long novice difficulty lasts, so it is unclear whether a guiding agent is
   needed for hours or for weeks.
3. **Fatigue is modelled, not acted on.** CE and NICER can run in real time, but no system was found that
   uses them to hand control to an agent or relocate content. Whether users accept an agent that intervenes
   because "your arm is tired" is untested.
4. **Error recovery cost.** Selection error rates of 9 to 36% (D13) mean an agent acting through the same
   input channel (synthetic gaze/pinch) would need verification and undo. Its own error rates under these
   conditions are unknown.
5. **Modality trade-offs for delegation.** Voice is the obvious channel for instructing an agent, but social
   acceptability depends on place and audience (D19, D21). The acceptability of speaking to an agent, compared
   with gesturing, in public XR use has not been measured.
6. **Sickness from automation.** Agent-driven viewpoint or content motion is passive motion. No study was
   found on whether automated navigation by an agent raises SSQ compared with user-driven navigation.
7. **Bystander privacy of perceiving agents.** An agent that reads the scene through passthrough cameras
   inherits the bystander concerns of D22, and agent-specific consent designs are missing.

## 6. Catalogue rows

| Operation | Techniques used today | Measured/reported difficulty (with source IDs) | Agent could: do it / guide / neither, and why |
|---|---|---|---|
| Type a search query or short message | Virtual keyboard by ray/controller pointing, direct touch, head/gaze pointing, swipe; dictation; paired physical keyboard | 5.31 to 15.44 wpm for selection keyboards (D04), 10.6 to 19.0 wpm head-based (D08), field mean 20.36 wpm (D11), vs 36.2 wpm on phones (D12). Freehand error 7.57% (D04) | **Do it.** Text entry is the slowest common XR operation and the intent is easy to state by voice. The agent fills the field and asks for one confirmation. A confirmation selection still costs one pinch. |
| Enter a password or PIN | Same virtual keyboards (often without prediction); system passkeys or companion phone where offered | Same speed and error costs as above. Prediction and decoding, which give much of the speed in D09/D10, cannot help with random strings. Bystander concerns with camera-equipped glasses (D22) | **Neither / guide.** An agent should not see or hold secrets. Better: route to OS passkeys or a paired phone, and have the agent only guide the user to that path. |
| Hold the arm up for a long interaction (e.g., arranging windows, a long form) | Direct touch on panels, hand rays, controller rays; gaze-and-pinch with the hand at rest | CE rises with arm height and extension, lowest about 15.55% at center + bent elbow (D01). Fatigue accumulates over the session (D02, D03). Fatigue differences appear even when time and errors do not (D01) | **Do it.** The agent executes multi-step sequences on instruction and moves panels into the low-fatigue zone. A live NICER/CE estimate could trigger the offer. |
| First-time setup or first use of an app by a novice | Built-in tutorials, text plus controller diagrams, spatial tooltips; trial and error | Novices mostly fail at knowing the action sequence or evaluating the result (D14). Inexperienced users lose the most speed in VR (D06). Sickness dropout averages 15.6% in studies (D16) | **Guide.** Physical steps (fit, IPD, boundary, hand calibration) cannot be delegated. The agent can explain the next gesture, point at the target and confirm success, which addresses the gulfs in D14. |
| Select small targets while moving (car, train, walking) | Gaze&Pinch, hand ray, direct touch, head gaze | Error rates 20.4 to 36.0% while driving vs 8.8 to 23.5% stationary (D13). Acceptance depends on the social setting (D21) | **Do it, with confirmation.** The agent can take high-level spoken commands instead of fine pointing. Speech in public carries its own acceptability cost (D19, D21). |

## 7. Figure/widget ideas

1. **Bar chart: wpm by XR text-entry technique.** Bars for Speicher's six methods (D04), Yu's three head
   techniques (D08), VISAR (D09), the Dudley envelope bounds (D10, hatched as "simulated upper bound") and
   the physical keyboard in VR (D05, D06). Horizontal reference lines for phones (36.2, D12) and desktop
   (41.4 from D05; a band to 67.2 for experienced typists from D06). Error rate as a dot on a second axis.
   Script in `bin/figures/` writing SVG.
2. **Interactive arm-fatigue widget.** A 2D arm figure. The reader drags the hand to a position and holds it.
   A simple CE-style estimate (torque relative to maximum, with the 15% line marked) fills a "consumed
   endurance" bar over time, compared with the same task done by an agent (bar stays flat). Labels quote the
   15.55% center-and-bent result from D01. Plain JS in `assets/js/widgets/`, ASCII only.
3. **SSQ by content with cut-offs and dropout.** Horizontal bars for the four content types from D16 with
   95% CIs, vertical lines at 10, 15 and 20 (Kennedy cut-offs as cited by D16), and an inset of "about 1 in 6
   participants dropped out" (15.6%).

## 8. Unverified and checked but not tabled

**Unverified or second-hand (not used as facts):**
- "Villanueva et al. 2023" and "Hou et al." fatigue models in VR, as named in the brief: no matching paper
  was found and none was verified. The verified fatigue line is CE (D01), Jang et al. (D02), NICE (Li et al.
  2023, below) and NICER (D03). WICE (Li et al., UIST 2025, https://doi.org/10.1145/3746059.3747745) appeared
  in an OpenAlex search but was not read.
- The Stanney et al. study with 1,102 participants and "15% higher total severity" for female participants
  is known only from MacArthur et al. (D18). The original was not identified.
- Apple Vision Pro weight (600 to 650 g): the Apple tech specs page was not fetched in this pass, so no
  number is given.
- A forum summary (AppleInsider) of a gaze-and-pinch vs hand-ray study (about 2.5 s vs 4.6 s, 1% vs 3% errors)
  came up in search but is second-hand and was not traced to the paper. Not used.
- A Purdue press release about Jang et al. (D02) gives an 8.4% strength-estimation error. That is a news
  source, so it is not used.

**Verified metadata, content not read or not needed (left out of the table to stay near the target count):**
- Dube and Arif, "Text Entry in Virtual Reality: A Comprehensive Review of the Literature", HCII 2019, LNCS,
  https://doi.org/10.1007/978-3-030-22643-5_33. No abstract or full text was available.
- Rebenitsch and Owen, "Review on cybersickness in applications and visual displays", Virtual Reality 2016,
  https://doi.org/10.1007/s10055-016-0285-9. Paywalled, and no abstract in OpenAlex or Semantic Scholar.
- Chang, Kim and Yoo, "Virtual Reality Sickness: A Review of Causes and Measurements", IJHCI 2020,
  https://doi.org/10.1080/10447318.2020.1778351. Abstract read: groups causes into hardware, content and human
  factors and proposes a "multimodal fidelity hypothesis". No numbers.
- Caserman et al., "Cybersickness in current-generation virtual reality head-mounted displays: systematic
  review and outlook", Virtual Reality 2021, https://doi.org/10.1007/s10055-021-00513-6. Abstract read: 49
  publications. Current HMDs cause significantly less cybersickness (p < 0.001), but some symptoms remain as
  intense.
- Li et al., "Revisiting Consumed Endurance: A NICE Way to Quantify Shoulder Fatigue in Virtual Reality",
  ACM VRST 2023, https://doi.org/10.1145/3611659.3615702. Abstract read: CE overestimates endurance time for
  low-exertion interactions, and a torque-only model misses exertion above 90° shoulder elevation.
- Kern et al., "Text Input for Non-Stationary XR Workspaces: Investigating Tap and Word-Gesture Keyboards in
  Virtual and Augmented Reality", IEEE TVCG 2023, https://doi.org/10.1109/TVCG.2023.3247098. Abstract read:
  N = 64. Tap beat swipe on usability. Both were faster in VR than in video see-through AR. Significant learning
  effect within ten sentences.
- Mutasim et al., "Pinch, Click, or Dwell: Comparing Different Selection Techniques for Eye-Gaze-Based
  Pointing in Virtual Reality", ETRA 2021 Short Papers, https://doi.org/10.1145/3448018.3457998. Read in part:
  targets of 2° to 3°. Pinch had more errors than click (not significant), and dwell had the fewest errors but
  was slowest. The per-condition values sit in figures that could not be read.
- Kytö et al., "Pinpointing: Precise Head- and Eye-Based Target Selection for Augmented Reality", CHI 2018,
  https://doi.org/10.1145/3173574.3173655. Metadata only, since no open copy was found.
- Kao et al., "Evaluating Tutorial-Based Instructions for Controllers in Virtual Reality Games", PACM HCI 5
  (CHI PLAY) 2021, https://doi.org/10.1145/3474661. Full text read: 433 crowd participants who owned VR
  headsets, four games. Spatial tooltips on the virtual controllers raised controls learnability in two of
  the four games, with negligible differences in the other two. Relevant to "guide" designs, but the
  participants were not novices.
- Dhakal et al., "Observations on Typing from 136 Million Keystrokes", CHI 2018,
  https://doi.org/10.1145/3173574.3174220. Abstract read (168,000 volunteers). It contains no speed figure,
  so desktop baselines in this part come from D05 to D07 instead.
- Grubert et al. (D05) states different touchscreen retention figures in different places: 40 to 45% in the
  abstract and 47 to 49% in Section 3.6.1. The raw values are reported in Section 3 above.
