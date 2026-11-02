# Assignment eng-b: series "Graphics Engines: Learning and Building", posts 03 and 04

The new series `graphics-engine` covers learning and building game and graphics engines, up to frontier AI
plus engines. It bridges classical graphics to world models and embodied AI. The series name is already in
`_data/*/strings.yml`.

The other posts in the series:
- 01 and 02 (written in parallel by eng-a): `graphics-engine-01-anatomy-of-an-engine` (layers, game loop,
  DOD, ECS, jobs, assets) and `graphics-engine-02-gpu-apis-and-render-graphs` (explicit APIs, sync, WebGPU
  basics, render graphs, clustered shading, GPU-driven rendering).
- 05 and 06 (eng-c): `graphics-engine-05-physics-and-simulation-engines` and
  `graphics-engine-06-ai-meets-graphics-engines`.

Build on 01 and 02 and do not repeat them; link them by slug.

Files:
- Post 03: `2026-10-27-graphics-engine-03-build-a-mini-engine.md`, date `2026-10-27 13:03:00+0900`,
  series_order 3.
- Post 04: `2026-10-27-graphics-engine-04-inside-production-engines.md`, date `2026-10-27 13:04:00+0900`,
  series_order 4.
- Front matter: `categories: graphics-engine`, `series: graphics-engine`.
- Figures:
  - Scripts `bin/figures/graphics-engine/graphics_engine_03.py` and `graphics_engine_04.py`; SVGs
    `assets/img/blog/graphics-engine/03-*` and `04-*`.
  - Do NOT create `make_all.py` in that folder; eng-a creates it.
- Reading list: append a section "## 03-04" to `docs/reading-lists/graphics-engine.md`. Create the file if it
  is missing; eng-a creates it too, and a union merge combines both.

## Post 03: Build a mini engine

This is a hands-on tutorial. Build a small but real engine architecture in TypeScript or JavaScript with
WebGPU, so it runs in a browser. Add short notes on how each part maps to Vulkan or C++ and to Rust with
wgpu.

Show complete, correct code for the key files:
- the project layout and module boundaries;
- the main loop, using the fixed timestep from post 01;
- the device and swap chain, and a resource manager (buffers, textures, samplers, pipeline cache);
- glTF 2.0 loading (the structure of nodes, meshes, accessors and materials);
- a camera with input;
- a PBR material shader in WGSL, linking `graphics-04` for the theory;
- a shadow-map pass, linking `graphics-03`;
- a minimal ECS-driven scene;
- a tiny frame-graph-like pass list, linking post 02;
- a debug UI and GPU timestamp queries.

Then: debugging with RenderDoc and the browser tools, how to test an engine, performance pitfalls, and the
next steps (clustered lighting, an asset pipeline, an editor).

You cannot run WebGPU on this runner. For JS/TS:
- keep the code syntactically valid;
- check it with `node --check`, or `npx tsc --noEmit` if you write TypeScript (you may npm-install
  typescript and @webgpu/types in /tmp, not in the repository).

Do not add a WebGPU demo to the site; the widget below uses Canvas 2D.

Figures (computed): 7-10, for example:
- A module dependency graph.
- The data flow of one frame.
- A glTF structure diagram.
- The resource lifetime of the frame.
- The shadow-map pass geometry (light frustum, depth map, lookup) as a 3D figure.
- A frame-time breakdown chart from a CPU timing model.
- A comparison table rendered as a figure, only if it adds something.

Widget: `graphics-engine-scene-graph`. A Canvas 2D scene graph:
- the reader drags or rotates parent nodes and sees the children follow;
- a toggle shows local versus world transforms and the dirty-flag propagation, with recomputed nodes
  highlighted.

## Post 04: Inside production engines

Explain how modern engines solve the hard problems. Use official documentation, the papers, and SIGGRAPH
"Advances in Real-Time Rendering" or GDC talks. Verify every claim and link.

Suggested sections:
1. Unreal Engine 5:
   - Nanite: the cluster hierarchy and LOD DAG; screen-space error and the "cut"; GPU culling; the software
     rasterizer for micro-triangles. Source: Karis et al., SIGGRAPH 2021 Advances, "A Deep Dive into Nanite
     Virtualized Geometry".
   - Lumen: surface cache, mesh and global distance fields, screen traces, radiance cache, final gather.
     Source: Wright et al., SIGGRAPH 2022 Advances.
   - Virtual Shadow Maps; Temporal Super Resolution; World Partition; MetaHuman.
   - What changed through UE 5.4-5.7; verify the current version.
2. Unity 6:
   - the Scriptable Render Pipeline (URP and HDRP), the Render Graph, the GPU Resident Drawer;
   - DOTS/Entities; the current state of its rendering features.
3. Godot 4: the RenderingDevice abstraction; the Forward+, Mobile and Compatibility renderers; SDFGI and
   other GI options; being open source makes it ideal for study.
4. Bevy: Rust ECS-first design, wgpu, the render app and its extract phase.
5. Others in brief: O3DE (Atom), Filament, Frostbite talks, id Tech, NVIDIA Falcor and RTX Remix as a
   research and modding example. Keep this to what you can verify.
6. A comparison table: language, license, renderer architecture, GI, geometry pipeline, scripting, platforms.
7. What to learn from each, and how to read their source.

Figures (computed): 8-11, for example:
- A Nanite-style cluster DAG built on a toy mesh, with the LOD cut chosen by projected error at two camera
  distances. Compute it: simplify clusters, record errors, select the cut.
- Error versus distance.
- The triangle-size distribution and the hardware/software rasterizer split.
- A Lumen pipeline diagram.
- Surface-cache cards on a simple object.
- Virtual-shadow-map page allocation for a toy view, computed.
- An engine feature matrix as a heat map.

Widget: `graphics-engine-nanite-lod`. A 2D polyline or terrain with a multi-level cluster hierarchy:
- the reader moves the camera distance or the error threshold;
- the selected cut and triangle count update live;
- a toggle shows cracks with naive per-cluster LOD versus no cracks with DAG-consistent selection.

Order: finish, verify and commit post 03 before starting post 04.
