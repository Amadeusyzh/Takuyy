The dossier is written and committed in three commits on `api/r3-xr-agents`. The headline: **no published work does the full 3D GUI agent idea**, but each piece of it already exists separately, and products are moving fast.

**Path:** `docs/research/3d-gui-agent/03-agents-in-xr-and-3d.md` (about 16,000 words)

- **Key-works table:** 123 rows: 118 research works and 5 products (Galaxy XR Gemini, Siri AI on visionOS 27, Meta's Muse agent, Meta Ray-Ban Display, Project Astra). All 110 arXiv ids were checked against the arXiv API (titles and first authors), and the wrong ones were corrected. The closest works and the key product claims were re-opened directly.
- **Deep notes:** 25, each ending with an overlap rating (none / partial / substantial) and what exactly overlaps.
- **Datasets covered:**
  - **XR interface data:** Orienter's VR screenshot set, DISCOVR, the XR part of GUI-World, ComboBench, XRBench3D, MineXR/MineXR++, StereoID screenshots, XRZoo, GenXR-Bench, VCXR60, HoloAssist, PARSE-Ego4D.
  - **Gaze, motion and hands:** BOXRR-23, GazeBaseVR, EHTask, OpenEDS/OpenEDS2020, Who Is Alyx?, HOT3D.
  - **Egocentric and spatial:** Ego4D, Ego-Exo4D, EgoSchema, EgoLife, HD-EPIC, EgoBlind, VSI-Bench, ScanRefer, Embodied Web Agents, EmbodiedBench, VideoGameBench.
  - **The data gap:** there is no dataset of natural-language instructions paired with action sequences on XR interfaces.

**Five most important findings**

1. **Nobody has built the full agent yet.** No paper (through November 2026) presents an agent that takes a language request, perceives existing XR apps' 3D interface and operates it across apps, evaluated on task success. There is also no XR benchmark with tasks and action traces. Two search workers reached this independently, and a 2026 software-engineering survey (Guo et al., arXiv 2611.18567) lists LLM agents for VR interface exploration as open.
2. **The closest works, ranked by overlap:**
   1. Orienter (Li et al., FSE 2026, arXiv 2409.10811): finds interactable elements in VR screenshots, F1 about 44–46%, but takes no user instructions.
   2. Revisiting Put-That-There (Bovo et al., ISMAR 2025 Adjunct, arXiv 2511.02378): an LLM places windows from speech and pointing.
   3. DuoZone (Qian et al., IEEE TVCG 2026, arXiv 2511.15676): LLM-assisted window layout with user confirmation, user study with 16 people.
   4. NavAI (arXiv 2601.03251): an LLM acts from VR screenshots, but only to move around, at about 49 s per step.
   5. SIAgent (arXiv 2603.00522): infers intent from gaze and hands and carries out VR operations, but takes no language input.
3. **Products are close to the idea, without published evidence.**
   - Google says Gemini on Galaxy XR can "take action on your behalf across your apps" and "organize these windows". It has not published how this works or how well.
   - Meta XR Operator (Meta XR SDK v205, August 2026) lets an agent take screenshots and press buttons and menus in VR apps. It is for developer testing and "too slow for real-time interaction".
4. **Platforms act through app APIs, not the interface itself.** Apple's WWDC26 session 343 says Siri's view of the screen is "limited to exactly what's in the pixels… Siri can't act on the tracks shown" unless the app adopts its APIs. Android XR's developer guidance likewise points to function calling per app. Apps that don't opt in are left uncovered, which is room for an agent that operates the interface directly.
5. **3D-specific obstacles, with numbers:**
   - LLMs map a VR game action to the exact controller sequence only 11.7% of the time (ComboBench).
   - 66.6% of agent failures in Embodied Web Agents come from switching between the 3D world and flat panels, which is exactly XR's mix.
   - Models finish 0.48% of games in real time vs 1.6% when the game pauses (VideoGameBench), and XR cannot pause.
   - Spatial memory: best model 45.4% vs humans about 79% (VSI-Bench).

**Could not verify** (listed in section 9 of the dossier, not used as evidence):
- **Venues:** GesPrompt (DIS 2025), EnVisionVR (TVCG), SIAgent, NavAI's journal version, and Orienter's DOI. Venues marked (*) in the tables come only from OpenAlex.
- **Contradictions inside sources:** for example, Orienter's abstract and body report different gains, and Satori gives three different participant counts.
- **Product claims:** Meta AI on Quest opening apps, Project Astra operating Android, and the Android XR "Gemini Intelligence" features. I also did not check the Android XR glasses dates myself.
- **Market numbers:** some IDC figures came only from search snippets because IDC's site blocked access.
- **Works not opened:** about a dozen (e.g. agentAR, ImaginateAR, GPT-VR Nexus).
- **Do not cite:** two preprints that were withdrawn, the "Survey of LLMs in XR" (2508.03014) and VR-GPT (2405.11537).
