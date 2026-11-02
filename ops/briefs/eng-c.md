# Assignment eng-c: series "Graphics Engines: Learning and Building", posts 05 and 06

The new series `graphics-engine` covers learning and building game and graphics engines, up to frontier AI
plus engines. It bridges classical graphics to world models and embodied AI. The series name is already in
`_data/*/strings.yml`.

Earlier posts, written in parallel by other workers (link them by slug, do not repeat them):
- 01 `graphics-engine-01-anatomy-of-an-engine`
- 02 `graphics-engine-02-gpu-apis-and-render-graphs`
- 03 `graphics-engine-03-build-a-mini-engine`
- 04 `graphics-engine-04-inside-production-engines`

Your two posts end the series and hand the reader over to the `world-models` and `embodied-ai` series.

Files:
- Post 05: `2026-10-27-graphics-engine-05-physics-and-simulation-engines.md`, date `2026-10-27 13:05:00+0900`,
  series_order 5.
- Post 06: `2026-10-27-graphics-engine-06-ai-meets-graphics-engines.md`, date `2026-10-27 13:06:00+0900`,
  series_order 6.
- Front matter: `categories: graphics-engine`, `series: graphics-engine`.
- Figures:
  - Scripts `bin/figures/graphics-engine/graphics_engine_05.py` and `graphics_engine_06.py`; SVGs
    `assets/img/blog/graphics-engine/05-*` and `06-*`.
  - Do NOT create `make_all.py`; eng-a creates it.
- Reading list: append "## 05-06" to `docs/reading-lists/graphics-engine.md`. Create the file if it is
  missing; a union merge combines it with the other workers' versions.

## Post 05: Physics and simulation engines

Related posts:
- `graphics-07` covers integrators, PBD/XPBD, cloth, SPH and rigid bodies in brief.
- `embodied-ai-03` surveys robotics simulators and benchmarks.

This post is the engine-internals view; cross-link both, do not duplicate them.

Suggested sections:
1. Physics inside a game engine: the step pipeline.
   - Broad phase: sweep and prune, dynamic BVH.
   - Narrow phase: SAT, and GJK with EPA (code for 2D GJK that you run).
   - Contact manifolds and warm starting.
   - Solvers: sequential impulses / PGS, TGS, soft step, XPBD with substepping.
   - Sleeping, CCD, determinism and fixed timesteps (link post 01).
   - Engines: PhysX 5, Havok, Jolt, Chaos, Box2D v3, Rapier. Verify the versions and licenses.
2. Constraints and articulated bodies: joints; reduced coordinates (Featherstone) versus maximal coordinates.
   This is why robot simulators differ from game physics.
3. Animation runtime in engines: state machines, blend trees, IK, motion matching. Point to `graphics-09` for
   the mathematics.
4. Engines as simulators for robots and AI:
   - Isaac Sim and Isaac Lab (Omniverse, OpenUSD, RTX sensors, Replicator);
   - MuJoCo, MJX, MuJoCo Playground and MuJoCo Warp;
   - Newton (NVIDIA, Google DeepMind and Disney Research; open source under the Linux Foundation);
   - Genesis, ManiSkill3, Habitat 3, CARLA (on Unreal), Unity ML-Agents.
   - What each borrows from game engines and what it adds: accuracy, differentiability, massive GPU
     parallelism.
   - Verify current versions and status as of November 2026.
5. OpenUSD as a scene description: layers, composition arcs, schemas (UsdPhysics); why robotics and digital
   twins adopted it.
6. Synthetic data and domain randomization: rendering-side randomization; the sim-to-real gap from the
   graphics side (materials, lighting, sensor noise). Link `embodied-ai-02` and `embodied-ai-03`.

Figures (computed): 8-11, for example:
- A physics step pipeline diagram.
- Broad-phase sweep and prune on random boxes, with pair counts versus a brute-force baseline, from a real
  run.
- The GJK simplex evolution on two convex polygons, with the Minkowski difference.
- Solver convergence of PGS versus TGS or XPBD on a box stack, from a toy run.
- The effect of substepping on stack stability.
- An articulated chain in reduced versus maximal coordinates.
- A USD layer-composition diagram.
- A domain-randomization sample grid rendered in NumPy.

Widget: `graphics-engine-gjk`. The reader drags two convex polygons and sees the Minkowski difference, the
GJK simplex step by step, and the penetration depth and normal (EPA) when they overlap.

## Post 06: AI meets graphics engines

This is the frontier post, and the bridge to world models and embodied AI. Research it thoroughly (as of
November 2026), and give every product claim an official source.

Suggested sections:
1. The spectrum from a classical engine to hybrid neural components to fully neural "game engines". Which
   engine parts are being replaced or assisted by networks, and why now.
2. Neural rendering inside real-time engines:
   - learned upscaling and frame generation: DLSS (the current version, including the transformer models and
     multi-frame generation), FSR 4 and later, XeSS. Get the versions right.
   - the neural radiance cache (link `graphics-06`);
   - neural materials: Zeltner et al., SIGGRAPH 2024, "Real-Time Neural Appearance Models";
   - neural texture compression: Vaidyanathan et al. 2023;
   - RTX Neural Shaders and cooperative vectors in DirectX and Vulkan; what the shader-model or extension
     status is.
3. Gaussian splats in engines:
   - Unreal and Unity plugins; PlayCanvas and SuperSplat; three.js-based viewers such as Spark;
   - mobile and XR viewers; standardization (a Khronos glTF extension for Gaussian splats; verify its name
     and status);
   - hybrid mesh-plus-splat rendering;
   - link `neural-rendering-04`, `neural-rendering-06` and the home-page Gaussian World demo
     (`{{ '/' | relative_url }}#lab`).
4. Generative content pipelines:
   - image and text to 3D: TRELLIS, Hunyuan3D, SAM 3D and others; verify which exist and their versions;
   - PBR texture and material generation;
   - motion generation, linking `graphics-09`;
   - procedural generation combined with LLMs;
   - what is production-ready versus research.
5. LLM agents in engines and editors: MCP servers for Unity, Unreal, Godot and Blender; in-engine assistants;
   AI NPCs (for example NVIDIA ACE). Separate demos from shipped products.
6. Neural game engines and interactive world models:
   - GameNGen (ICLR 2025), DIAMOND (NeurIPS 2024), Oasis, Muse/WHAM (Nature 2025), Genie 2 and Genie 3,
     Matrix-Game, Hunyuan-GameCraft, Yan, Mirage, Odyssey, World Labs RTFM and Marble;
   - plus anything newer in 2026 that you find and verify.
   - What they learn, how they are controlled, frame rate and latency, memory and consistency, and failure
     modes.
   - Link `world-models-03` and `world-models-04`; do not repeat them.
7. Engines as data factories: synthetic data for world models and robots (Cosmos, Isaac/Omniverse,
   Genesis-style generators). This is the handover to `embodied-ai-03` and `embodied-ai-05`.
8. Open problems and a learning path, plus a closing map that points into the world-models and embodied-ai
   series.

Figures (computed or schematic, drawn by you): 8-11, for example:
- The classical-to-neural spectrum, as a matrix of engine components against the degree of neural
  replacement.
- An upscaling and frame-generation pipeline diagram.
- Displayed fps and latency versus the frame-generation factor and render resolution, from a simple model.
- A neural texture decoding diagram, plus a bits-per-texel comparison from reported numbers you verify.
- A hybrid splat-plus-mesh rendering diagram.
- A timeline of neural game engines from 2024 to 2026, from your verified table.
- A comparison of world-model "engines" by resolution, fps, memory horizon and control, from verified
  numbers only.

Widget: `graphics-engine-frame-budget`. Sliders for internal resolution scale, upscaler cost,
frame-generation factor and base render cost. It shows output fps, GPU frame time and input latency, so the
reader feels the trade-offs.

Order: finish, verify and commit post 05 before starting post 06.
