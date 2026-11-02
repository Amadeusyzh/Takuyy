# Assignment eng-a: new series "Graphics Engines: Learning and Building", posts 01 and 02

You start a new series, key `graphics-engine`. Its series name is already in `_data/*/strings.yml`:
- en: "Graphics Engines: Learning and Building"
- zh: 图形引擎：学习与开发
- ja: グラフィックスエンジン：学習と開発

The owner's intent: learn how game and graphics engines are designed and built, all the way to frontier AI
plus engines. The series is the bridge from the graphics and neural-rendering series to the world-models
and embodied-AI series. Engines are simulators, and neural networks are starting to replace engine parts.

The six posts are:

| Post | Slug | Worker |
| --- | --- | --- |
| 01 | `graphics-engine-01-anatomy-of-an-engine` | you |
| 02 | `graphics-engine-02-gpu-apis-and-render-graphs` | you |
| 03 | `graphics-engine-03-build-a-mini-engine` | eng-b |
| 04 | `graphics-engine-04-inside-production-engines` | eng-b |
| 05 | `graphics-engine-05-physics-and-simulation-engines` | eng-c |
| 06 | `graphics-engine-06-ai-meets-graphics-engines` | eng-c |

Post 01 opens the series: give a short series map with links to all six posts and say who the series is for.

Files:
- Post 01: `2026-10-27-graphics-engine-01-anatomy-of-an-engine.md`, date `2026-10-27 13:01:00+0900`,
  series_order 1.
- Post 02: `2026-10-27-graphics-engine-02-gpu-apis-and-render-graphs.md`, date `2026-10-27 13:02:00+0900`,
  series_order 2.
- Front matter: `categories: graphics-engine`, `series: graphics-engine`.
- Figures:
  - Create `bin/figures/graphics-engine/make_all.py`, generic: it runs every `graphics_engine_*.py` in its
    folder, like `bin/figures/graphics/make_all.py`. Only you create this file.
  - Scripts `graphics_engine_01.py` and `graphics_engine_02.py`; SVGs
    `assets/img/blog/graphics-engine/01-*` and `02-*`.
- Reading list:
  - Create `docs/reading-lists/graphics-engine.md`, in Chinese like the other lists: books, courses,
    open-source engines, talks.
  - Put your entries under a section "## 01-02". Others will append their own sections.
  - Include the classics: Gregory, "Game Engine Architecture" (3rd ed.); "Real-Time Rendering" (4th ed.);
    "Game Programming Patterns"; GAMES104 (现代游戏引擎：从入门到实践) and its Piccolo engine; GDC and
    SIGGRAPH "Advances in Real-Time Rendering" talks. Verify the links.

## Post 01: Anatomy of a game engine

Suggested sections:
1. What an engine is (runtime plus tools plus pipeline) and its layered architecture: platform, core,
   resources, rendering, physics, animation, audio, gameplay and scripting, editor and tools.
2. The game loop:
   - variable versus fixed timestep, the accumulator with interpolation ("Fix Your Timestep"), and why
     physics wants a fixed step;
   - frame pacing, V-sync, input latency.
   - Include runnable code.
3. Frame budget: 16.6, 11.1 and 8.3 ms; CPU and GPU running in parallel; frames in flight (in short, since
   post 02 goes deeper).
4. Data-oriented design: caches, AoS versus SoA, a measured micro-benchmark in NumPy or C, and its figure.
5. Entity Component System:
   - archetype tables (Unity DOTS, Bevy, flecs) versus sparse sets (EnTT); queries; systems; scheduling;
   - a minimal working ECS in Python or C++.
6. Scene graphs and transform hierarchies; dirty flags; spatial structures (BVH, octree, grid) for culling and
   queries.
7. Concurrency: job systems, task graphs and fibers (Naughty Dog, GDC 2015 "Parallelizing the Naughty Dog
   Engine Using Fibers"), the main-thread/render-thread split.
8. Assets: import, cook, package, stream; serialization; hot reload; the editor; why the tools are half of an
   engine.
9. How to study engines: read Godot, Bevy and the GAMES104 Piccolo engine, plus courses and books, with a
   project ladder.

Figures (computed): 8-11, for example:
- A layered architecture diagram.
- A frame timeline with CPU and GPU lanes.
- Fixed versus variable timestep, as position-error and stutter plots from a real simulation.
- The accumulator over frames.
- Cache-line diagrams of AoS versus SoA, plus benchmark bars from a real run.
- ECS archetype tables.
- A transform-hierarchy example.
- A job dependency graph with a scheduling Gantt chart from a toy scheduler you run.

Widget: `graphics-engine-fixed-timestep`. A ball or spring simulated with a variable dt versus a fixed dt
with interpolation, with sliders for frame-time jitter and physics rate, showing the visible stutter and the
energy drift.

## Post 02: Modern GPU APIs and render graphs

Suggested sections:
1. From the OpenGL state machine to explicit APIs (Vulkan, D3D12, Metal, WebGPU): instance, device and
   queues; command buffers; pipeline state objects; shaders and SPIR-V/DXIL/WGSL; descriptors and bind groups;
   bindless.
2. Memory and synchronization: heaps, resource states and barriers, frames in flight, fences and semaphores,
   common bugs. Use a timeline figure.
3. A minimal WebGPU example: a triangle, then uniforms and a render pass, in JS or TS.
   - Explain the code line by line.
   - Link `graphics-engine-03` for the full mini engine.
4. Render graphs and frame graphs:
   - Frostbite's FrameGraph (O'Donnell, GDC 2017), UE's RDG, Unity's RenderGraph;
   - pass declaration, DAG compilation, culling of unused passes, resource lifetimes, transient-memory
     aliasing, automatic barriers, async compute.
   - Write a toy frame-graph compiler in Python that you actually run: topological sort, lifetimes, an
     aliasing allocator. The figures come from its output.
5. Lighting architectures:
   - forward, deferred, tiled and clustered (Olsson et al. 2012), Forward+;
   - the visibility buffer (Burns & Hunt 2013).
   - Point to `graphics-11` for the shading mathematics.
6. GPU-driven rendering:
   - indirect draws;
   - GPU frustum and occlusion culling with a hierarchical Z-buffer (Haar & Aaltonen, SIGGRAPH 2015
     "GPU-Driven Rendering Pipelines"; Wihlidal, GDC 2016 "Optimizing the Graphics Pipeline with Compute");
   - meshlets and mesh shaders; D3D12 work graphs. Verify the dates and status.
7. Debugging and profiling: RenderDoc, PIX, Nsight; GPU timestamps.

Figures (computed): 8-11, for example:
- The API object graph.
- A CPU/GPU timeline with two or three frames in flight and fences.
- The barrier state machine of a texture used through several passes.
- The render-graph DAG with culled passes.
- Resource lifetime bars and the aliased memory layout, from your compiler.
- A clustered froxel grid with light assignment, computed.
- HZB occlusion culling on a toy depth buffer, computed.
- Meshlet partitioning of a mesh, computed.

Widget: `graphics-engine-render-graph`. The reader toggles passes on and off, or marks outputs as used, and
sees culled passes, resource lifetimes and the aliasing packing update live.

Order: finish, verify and commit post 01 before starting post 02.
