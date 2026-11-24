# Assignment r1: GUI agents on 2D devices (phones, desktops, the web), state of the art to November 2026

Output file: `docs/research/3d-gui-agent/01-gui-agents-2d.md`

## Goal

A complete, verified map of GUI agents on 2D screens, so that the column can explain what works today on
phones and desktops, how it works, how it is evaluated, and which parts carry over to 3D interfaces.

## Cover at least

1. **Before LLMs:** UI understanding datasets and models (Rico, Screen2Vec, UIBert, Spotlight, Pix2Struct,
   widget captioning), accessibility-based automation, reinforcement learning on web and mobile UIs (MiniWoB,
   MiniWoB++, World of Bits, workflow-guided exploration, Android-based environments).
2. **LLM and VLM GUI agents, by platform:**
   - mobile: AppAgent (v1, v2), Mobile-Agent (v1, v2, v3, -E), AutoDroid, DroidBot-GPT, MobileGPT, and
     successors;
   - desktop and OS: UFO (and UFO-2), OS-Copilot, Cradle, Agent S (S, S2, S3), and successors;
   - web: WebGPT, Mind2Web agents, SeeAct, WebVoyager, Agent-E, Magentic-One, and successors;
   - commercial computer-use agents: Anthropic computer use, OpenAI Operator / CUA, Google Gemini computer use
     and Project Mariner, and others, with dates and published evaluation numbers.
3. **Grounding and perception models:** CogAgent, SeeClick, Ferret-UI (and -2), UGround, OS-Atlas, ShowUI,
   Aria-UI, Aguvis, UI-TARS (1, 1.5, 2), GUI-Actor, Qwen2.5-VL / Qwen3-VL GUI abilities, UI-Venus, and newer
   ones; screenshot-only versus accessibility-tree versus hybrid inputs; set-of-marks prompting.
4. **Training:** supervised trajectories, data synthesis (OS-Genesis and similar), reinforcement learning
   (DigiRL, DistRL, UI-R1, GUI-R1, InfiGUI-R1, GUI-G1, the UI-TARS-2 RL pipeline, and newer), world models
   for GUI agents, self-evolving agents.
5. **Benchmarks and datasets:** AITW, AndroidControl, AMEX, AndroidWorld, AndroidLab, AndroidArena,
   MobileAgentBench, GUI-World, ScreenSpot / -v2 / -Pro, OSWorld (and -Verified), WindowsAgentArena,
   WebArena, VisualWebArena, Mind2Web, Online-Mind2Web, WebVoyager, and the newest ones; current best scores
   with dates.
6. **Architectures and agent loops:** observation, planning, reflection, memory, action spaces (tap, swipe,
   type, key, scroll, drag), multi-agent designs, latency and cost, on-device deployment.
7. **Humans in the loop:** how users interact with GUI agents (delegation, confirmation, proactive agents,
   explanation, error recovery), user studies, accessibility uses (blind and low-vision users, older adults).
8. **Safety, privacy, security:** prompt injection through the screen, risky actions, permissions, privacy of
   screenshots.
9. **Surveys:** list the main survey papers of 2024-2026 and what each covers.

## Depth

- Key-works table: at least 80 works.
- Deep notes: the 25 most relevant works.
- Close with a section "What transfers to 3D GUIs, and what breaks": observation (screenshot vs spatial
  scene), grounding (2D coordinates vs 3D targets), action space (tap vs ray, pinch, grab, 6-DoF placement,
  locomotion), the field of view problem (targets outside the current view), latency, and evaluation.
