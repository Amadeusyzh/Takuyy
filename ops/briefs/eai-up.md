# Assignment eai-up: bring the embodied-AI series up to date (as of November 2026)

The six existing posts were written from knowledge that stops around early 2026:
- `embodied-ai-01-robotics-foundations`
- `embodied-ai-02-reinforcement-learning-for-robots`
- `embodied-ai-03-simulation-platforms`
- `embodied-ai-04-imitation-learning`
- `embodied-ai-05-vision-language-action-models`
- `embodied-ai-06-embodied-ai-meets-xr-and-hci`

The owner wants the latest work added: 2025 and especially 2026, including papers from just-finished
conferences (find out which, for example CoRL, IROS, RSS, ICRA 2026 and the HCI/XR venues) and recent
preprints. You are the only worker allowed to edit these six posts, in all three languages, and
`docs/reading-lists/embodied-ai.md`.

Research first. Use the ARIS `research-lit` skill and primary sources. Build a verified table of candidate
works per post (title | authors | venue/status | date | link | what is new). Then integrate.

Areas to cover; verify everything and add 2026 work you find:
- Foundations and control (post 01): learned whole-body control, humanoid hardware milestones (official
  sources only), new open-source stacks.
- RL for robots (post 02):
  - humanoid motion tracking and sim-to-real: ASAP, BeyondMimic, GMT, TWIST and successors;
  - RL fine-tuning of VLAs; real-world RL;
  - 2026 results.
- Simulation (post 03):
  - Isaac Lab 2.x and later; Newton; MuJoCo Playground and MuJoCo Warp; Genesis (paper and releases);
    ManiSkill3; RoboCasa;
  - the BEHAVIOR challenge; generative simulation and world models used as simulators;
  - current versions.
- Imitation learning and data (post 04):
  - large datasets (AgiBot World, DROID, Open X-Embodiment, newer 2026 sets);
  - UMI-style data collection; diffusion and flow policies;
  - Large Behavior Models (TRI and Boston Dynamics).
- VLAs (post 05):
  - pi0, pi0-FAST, pi0.5 and later Physical Intelligence models;
  - Gemini Robotics, Gemini Robotics-ER and later versions; GR00T N1.x and later; Helix;
  - OpenVLA-OFT, SmolVLA, RDT, UniVLA, X-VLA;
  - newer 2026 VLA and world-action models;
  - evaluation (RoboArena and similar).
- XR/HCI (post 06):
  - egocentric data (Aria Gen 2, EgoDex, Nymeria, HOT3D);
  - XR teleoperation (Open-TeleVision and successors, Vision Pro or Quest based);
  - human-to-robot transfer; HRI with LLMs; new 2026 work at the HCI and XR venues (CHI, UIST, ISMAR,
    IEEE VR).

How to integrate (keep all existing content):
- In each post, add a section near the end, before "Representative papers":
  - en: "2025-2026 update (as of November 2026)"
  - zh: 2025–2026 年进展（截至 2026 年 11 月）
  - ja: 2025〜2026 年の進展（2026 年 11 月時点）
  Group the entries by theme. For each work, give 2-4 sentences: what it does, how, what is new, and how it
  relates to the post.
- Where newer results change earlier statements, add a short note there.
- Add rows to "Representative papers", with status and links.
- Cross-link the new posts:
  - `graphics-engine-05-physics-and-simulation-engines` from post 03;
  - `graphics-09-animation-and-characters` from posts 02 and 06 (physics-based characters, motion capture);
  - `graphics-engine-06-ai-meets-graphics-engines` from post 05 (world models and data factories).
- Figures: add 1-3 per post where they help, computed from verified data or toy runs. For example:
  - a VLA family tree or timeline from 2023 to 2026;
  - dataset scale against embodiment count, from verified numbers;
  - a schematic of a new architecture pattern.
  - Put them in `bin/figures/embodied-ai/embodied_ai_updates.py`, writing
    `assets/img/blog/embodied-ai/0N-update-*.svg`.
- Append a "2025-2026" section to `docs/reading-lists/embodied-ai.md`.

Commit after each post, or after every two posts. If the budget runs short, prioritize posts 05, 03 and 02.
