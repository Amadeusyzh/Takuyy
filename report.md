# Final report: dossier r2, 3D user interfaces and XR interaction

The dossier is complete and committed, and the `_parts/` folder has been merged in and deleted. Every DOI and arXiv id in the key-works table resolves to the right work. Nothing is pending.

**Path:** `docs/research/3d-gui-agent/02-3d-ui-and-xr-interaction.md`

**Size:**
- **Key-works table:** 162 distinct works in 164 rows, against a target of 70. Two papers turned up in two parts and are merged into one row each: Saredakis et al. 2020 and GazePointAR.
- **Breakdown:** 26 on foundations, 20 on modern input, 33 on spatial UI and design guidance, 23 on measured difficulty, 20 on adoption and market, 20 on accessibility, 22 on assistance in XR.
- **Deep notes:** 22 works.
- **Catalogue of 3D UI operations:** 30 rows, closing the file as the brief asks. Each row gives today's techniques, the measured difficulty with sources, and whether an agent could do it, guide the user, or neither.
- **Other sections:** platform comparison (visionOS, Android XR, Meta Horizon OS, Microsoft), comparison of input methods, market table, table of barriers, open problems, figure and widget ideas.

**Datasets and benchmarks covered:**
- **Agent-related datasets:**
  - GUI-World: its XR scenario has 393 videos.
  - Orienter: 100 VR apps, 1,552 frames.
  - DISCOVR from VRSight: 17,691 images.
  - VR exploration-testing views from Qi et al. 2025.
  - RAVEN's prompt log: 336 prompts.
  - SituationAdapt's validation set.
- **Literature and study corpora:**
  - TEXT, a catalogue of 176 XR text-entry techniques.
  - The Palin et al. phone-typing data from 37,000 volunteers.
  - The Saredakis cybersickness meta-analysis: 55 studies.
  - Kao et al.'s survey of tutorials in 50 VR games.
  - The Dehghani corpus of 3,205 VR device reviews.
  - Tran et al.'s 112 YouTube videos of everyday headset use.
- **Instruments:** the simulator sickness questionnaire (SSQ), ISO pointing throughput, NASA-TLX and SUS.
- **What is missing:** no benchmark measures an agent completing tasks on a headset UI.

## Five most important findings for the 3D GUI Agent idea
1. **Operating 3D interfaces costs measurably more than operating a phone.**
   - Pointing at targets at different depths is 25% slower, because headset displays handle depth poorly (Barrera Machuca & Stuerzlinger, CHI 2019, https://doi.org/10.1145/3290605.3300437).
   - Virtual keyboards reach about 5–15 wpm (Speicher et al., CHI 2018, https://doi.org/10.1145/3173574.3174221), against 36.2 wpm on phones (Palin et al., MobileHCI 2019, https://doi.org/10.1145/3338286.3340120).
   - Mid-air input tires the arm (consumed endurance, Hincapié-Ramos et al., CHI 2014).
   - On average 15.6% of study participants drop out because of VR sickness (Saredakis et al. 2020, https://doi.org/10.3389/fnhum.2020.00096).
2. **Automating window layout already saves measurable effort.**
   - Context-aware adaptation cut secondary-task interactions by 36% (Lindlbauer et al., UIST 2019, https://doi.org/10.1145/3332165.3347945).
   - SemanticAdapt cut manual adaptations by 33% (UIST 2021, https://doi.org/10.1145/3472749.3474750).
   - On Vision Pro, an LLM window manager made layout matching 34.5% faster; users accepted 82.8% of its layout suggestions (DuoZone, arXiv 2511.15676, a preprint).
   - The users still wanted control: they rejected the rest and refined spoken commands (arXiv 2610.24640).
3. **Complexity hindering adoption is only a contributing factor.**
   - Price, comfort, content and sickness dominate the ranked evidence. In 3,205 VR reviews, discomfort was 39% of coded comments and ease of use 7% (Dehghani et al. 2021, https://doi.org/10.1080/0144929X.2021.1876767). No analyst names interface complexity.
   - Usability still shows up: 22.3% of Vision Pro non-buyers were "not aware of its capabilities" (Variety VIP+ / CivicScience survey). Everyday users report imprecise input, hidden modes and window-management friction (Tran et al., CHI 2025, https://doi.org/10.1145/3706598.3713572).
   - For scale: IDC counts XR shipments +44.4% in 2025, but Quest shipments fell 42.3%, and the 2025 XR total is about 1.2% of the roughly 1.26 billion smartphones shipped.
   - The blog should frame complexity as one barrier an agent can lower, not the main one.
4. **Perceiving XR GUIs is the bottleneck.**
   - Detecting clickable elements in VR app screenshots reaches F1 46% (Orienter, arXiv 2409.10811).
   - XR is the lowest-scoring scenario in GUI-World (ICLR 2025, arXiv 2406.10819).
   - Platforms do not share the user's gaze with apps. The accessibility tree covers only 3D entities that developers label (Apple's guidelines and `AccessibilityComponent`).
   - VRSight users heard the scene described but succeeded in only 11% of menu trials (UIST 2025, arXiv 2508.02958).
5. **Shipping assistants are starting to act on the spatial interface, but narrowly.**
   - Gemini on Galaxy XR can "organize these windows" and "take action on your behalf across your apps" (Google blog, re-checked).
   - Siri AI for visionOS 27 was announced on 2026-06-08, with onscreen awareness and actions across apps; the user beta comes later in 2026 (Apple newsroom, re-checked).
   - Apple's Voice Control can reach any labelled element but cannot plan steps.
   - No shipping assistant is documented to operate arbitrary controls inside third-party 3D apps.

## Verification and what I could not verify
- **Audit result:** all 165 DOIs and arXiv ids were resolved through OpenAlex and matched on title, first author and year. None was wrong or invented. The few flags were rows that group several works or quirks in the database.
- **Re-opened sources:** the IDC March 2026 release, Google's Galaxy XR post, the UploadVR report on EssilorLuxottica's 7 million glasses, and Apple's Siri AI release.
- **Unverified items, listed in section 9 and not used as facts:**
  - Vision Pro 2025 shipments: sources disagree whether about 45,000 was the whole year or only Q4.
  - The 20–30 million glasses-capacity figure: Bloomberg, read only second-hand.
  - Ray-Ban Display volume: no named source.
  - No reliable Galaxy XR sales data exists.
  - Jacob's exact "Midas touch" wording.
  - Details beyond the abstract for several papers, including Lindlbauer 2019, Mott 2020, Chauvergne 2023, Personal Cockpit and Khurana 2023.
  - Meta Quest help pages, which would not load.
  - Whether HoloLens exposes a UI automation tree.
  - The "Clark et al. 2020" pointing paper, which may not exist under that title.
  - Batmaz et al. 2022–2023, found but not read.
  - The Vision Pro weight from Apple's tech specs.
- **Venue caveats:** DuoZone, Orienter and several 2025–2026 works are arXiv preprints, and the table says so.
