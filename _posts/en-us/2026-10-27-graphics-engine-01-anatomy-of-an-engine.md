---
layout: post
title: "Anatomy of a game engine: loops, data, ECS, jobs and tools"
date: 2026-10-27 13:01:00+0900
description: "What a game engine is made of: the layered architecture, the game loop and fixed timestep, frame budgets, data-oriented design, ECS, scene graphs and spatial structures, job systems, and the asset pipeline, with runnable code and measured figures."
categories: graphics-engine
tags: [game-engine, game-loop, fixed-timestep, data-oriented-design, ecs, job-system, scene-graph]
series: graphics-engine
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## Why this matters

The [graphics series]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }}) explained how one image is made: rasterization, shading, path tracing. A game or simulator has to make sixty or more images per second, while also simulating physics, playing animations and sound, reading input, streaming assets from disk, and staying responsive to the user. The software that organizes all of this is the **engine**. An engine is also a **simulator** of a virtual world, which is why this series is the bridge from graphics and neural rendering to [world models]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}) and [embodied AI]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}). Robots are trained in engines, and neural networks are starting to replace engine parts.

### The series: who it is for and where it goes

The series is for readers who know the rendering basics of the graphics track (or are willing to look them up) and want to understand how real-time systems are designed and built, up to the point where AI meets engines. You need some programming experience; C++ helps for reading engine code, but every example here is Python or JavaScript.

| Post | Topic |
| --- | --- |
| 01 (this post) | Anatomy of an engine: layers, game loop, data-oriented design, ECS, scene graphs, jobs, assets |
| [02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}) | Modern GPU APIs (Vulkan, D3D12, Metal, WebGPU), synchronization, render graphs, GPU-driven rendering |
| [03]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }}) | Build a mini engine in WebGPU: loop, resources, glTF, camera, PBR, shadows, ECS, profiling |
| [04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}) | Inside production engines: Unreal Engine 5, Unity 6, Godot 4, Bevy |
| [05]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }}) | Physics and simulation engines, engines as robot simulators, OpenUSD and synthetic data |
| [06]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }}) | AI meets engines: neural rendering and Gaussian splats in engines, generative assets, neural game engines |

## Prerequisites

- Python and NumPy; reading simple C-like code.
- Vectors and matrices, including $3\times 3$ homogeneous 2D transforms ([graphics 01]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})).
- The idea of a numerical integrator for $\ddot{x} = a(x)$ ([graphics 07]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}), Section 2). We reuse semi-implicit (symplectic) Euler.

## 1. What an engine is

An engine is three things:

1. A **runtime**: the code that ships inside the game and runs every frame (rendering, physics, animation, audio, input, networking, gameplay).
2. **Tools**: the editor, importers, profilers, debuggers and level-design UI that content creators use every day.
3. A **pipeline**: the offline machinery that turns source assets (FBX or glTF meshes, PSD textures, WAV audio) into compact runtime formats for each platform.

Beginners think of the first part only. In a production engine the tools and the pipeline are at least half of the code, and they decide how fast a team can work (Section 8).

The runtime is organized in **layers** (Figure 1). Each layer may call only the layers below it. The **platform layer** hides the operating system, the file system, threads and the GPU API. The **core** provides math, memory allocators, containers, logging and the job system. The **resource layer** knows where every asset is, loads it, and streams it in and out. Above those sit the big subsystems (rendering, physics, animation, audio, input and networking), then the **gameplay layer** (entities, scripting, AI, UI), and finally the game itself. Gregory's *Game Engine Architecture* is organized in exactly these layers and is the standard reference.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-layers.svg" localized="true" caption="The layered runtime of a typical engine (left) and the editor and tools that work on it offline (right). Dependencies point downwards only: rendering may use the core and resource layers, but the core never calls rendering. This rule is what lets you port an engine by rewriting only the platform layer." %}

The downward-only rule is not academic. It is what lets an engine run on a new console by rewriting the platform layer, run headless on a server without the renderer, or replace its physics library. The same rule appears in the robot simulators of [embodied AI 03]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}): there, the "game" layer is a training script, and rendering can be switched off entirely.

## 2. The game loop

Every engine has a loop at its heart:

```python
while running:
    process_input()
    update(dt)        # simulate the world forward by dt seconds
    render()          # draw the current state
```

The interesting question is what `dt` should be.

### Variable timestep

The simplest choice: measure how long the last frame took and use that as `dt`. This adapts to any machine. But it makes the simulation depend on the frame rate. Take a jump with initial speed $v_0 = 5$ m/s under gravity $g = 9.81$ m/s$^2$, integrated with semi-implicit Euler:

$$
v_{n+1} = v_n - g\,\Delta t, \qquad y_{n+1} = y_n + v_{n+1}\,\Delta t .
$$

The exact apex height is $v_0^2 / (2g) = 1.274$ m. The discrete apex is lower by roughly $v_0 \Delta t / 2$, because the first position update already uses the reduced velocity. At 30 fps ($\Delta t = 33$ ms) that is about 8 cm; at 144 fps about 2 cm. Players on faster machines jump higher, which matters for level design and is fatal for networked games, where all machines must agree. Figure 3 (left) shows the three trajectories.

There is a second problem. Stiff forces such as springs and contacts are only stable for small steps ([graphics 07]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}) derives the limit $\omega\Delta t \le 2$ for symplectic Euler). One long frame, for example while the OS swaps memory or a level loads, can push the simulation over that limit and make it explode. Even below the limit, a long step gives a large error: in Figure 3 (right) the spring's energy should stay exactly constant, but with $\Delta t$ equal to a jittery frame time it swings widely and jumps at every long frame.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-timestep.svg" caption="Left: the same jump integrated with dt = frame time at 30, 60 and 144 fps; the legend gives each apex height, and lower frame rates jump lower. Right: a frictionless spring (1.5 Hz) under jittered frame times. The energy ratio of the variable-step run (red) swings much more widely and jumps at the long frames; the fixed 120 Hz step with an accumulator (blue) stays in a narrow band around 1." %}

### Fixed timestep with an accumulator

The standard fix, popularized by Glenn Fiedler's article "Fix Your Timestep!" (2004), is to **decouple simulation time from frame time**. Physics always advances in steps of a fixed size $\Delta t$, for example 1/60 or 1/120 s. Each frame adds the real elapsed time to an **accumulator** and then takes as many fixed steps as fit:

$$
A \leftarrow A + t_\text{frame}, \qquad
n = \left\lfloor A / \Delta t \right\rfloor, \qquad
A \leftarrow A - n\,\Delta t .
$$

The leftover $A \in [0, \Delta t)$ is time that has passed in reality but not yet in the simulation. Figure 4 shows a run with jittered frames: some frames take zero steps, some take three.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-accumulator.svg" caption="The accumulator over 30 jittered frames with a 120 Hz physics step (dashed line in the top panel). Top: frame time. Middle: number of fixed steps taken in that frame (frames shorter than DT often take none, long frames take two or three). Bottom: the leftover fraction alpha = A/DT that is used for interpolation." %}

Rendering the newest physics state directly causes a new artifact. Suppose physics runs at 50 Hz and the display at 60 Hz. Six display frames span 0.1 s, during which exactly five physics steps happen, so one frame in six shows no motion at all: a visible **judder** (Figure 5, red). The cure is to render a blend of the last two physics states with weight

$$
\alpha = A / \Delta t, \qquad x_\text{shown} = (1-\alpha)\,x_\text{prev} + \alpha\, x_\text{curr} .
$$

This displays the state as it was one step ago, at exactly the right sub-step phase, so the motion is smooth (blue). The price is up to one physics step of extra latency.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-interpolation.svg" caption="Physics at 50 Hz, display at 60 Hz, an object moving at 1 m/s. Left: position on screen; without interpolation (red) the staircase has a flat step every sixth frame. Right: displacement per frame. Without interpolation it alternates between 20 mm and 0 mm; with interpolation (blue) it is a constant 16.7 mm (dashed line) after the first frame." %}

Here is a runnable loop with all the pieces: a fixed step, the accumulator, interpolation, and a clamp on the frame time that prevents the **spiral of death** (a slow frame demands many steps, which make the next frame even slower):

```python
import random
import time

DT = 1 / 120               # fixed physics step (s)
MAX_FRAME = 0.25           # clamp: never simulate more than 0.25 s per frame
K = 40.0                   # spring stiffness (mass 1)

def physics_step(s, dt):   # semi-implicit Euler on x'' = -K x
    v = s["v"] - K * s["x"] * dt
    return {"x": s["x"] + v * dt, "v": v}

def render(x):             # stand-in for drawing
    pass

prev = curr = {"x": 1.0, "v": 0.0}
acc = 0.0
t_last = time.perf_counter()
t_end = t_last + 2.0
while (now := time.perf_counter()) < t_end:
    frame = min(now - t_last, MAX_FRAME)
    t_last = now
    acc += frame
    while acc >= DT:
        prev, curr = curr, physics_step(curr, DT)
        acc -= DT
    alpha = acc / DT
    render((1 - alpha) * prev["x"] + alpha * curr["x"])
    time.sleep(random.uniform(0.004, 0.030))   # pretend the frame took a while

E = 0.5 * curr["v"] ** 2 + 0.5 * K * curr["x"] ** 2
print(f"energy after 2 s: {E:.3f} (start 20.000)")
```

Whatever the sleep pattern, the energy printed stays close to 20, because physics only ever sees $\Delta t = 1/120$ s. The judder experiment of Figure 5 can be reproduced exactly with integer time units (1 unit = 1/300 s, so a 60 Hz frame is 5 units and a 50 Hz step is 6):

```python
FRAME, STEP = 5, 6                    # units of 1/300 s
acc, x_prev, x = 0, 0.0, 0.0
steps, raw, lerp = [], [], []
last_raw = last_lerp = 0.0
for frame in range(12):
    acc += FRAME
    n = 0
    while acc >= STEP:
        x_prev, x = x, x + STEP / 300  # constant speed 1 m/s
        acc -= STEP
        n += 1
    shown = x_prev + (acc / STEP) * (x - x_prev)
    steps.append(n)
    raw.append(round(x - last_raw, 4))
    lerp.append(round(shown - last_lerp, 4))
    last_raw, last_lerp = x, shown
print("steps per frame :", steps)
print("raw  dx (m)     :", raw)
print("lerp dx (m)     :", lerp)
```

```text
steps per frame : [0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1]
raw  dx (m)     : [0.0, 0.02, 0.02, 0.02, 0.02, 0.02, 0.0, 0.02, 0.02, 0.02, 0.02, 0.02]
lerp dx (m)     : [0.0, 0.0133, 0.0167, 0.0167, 0.0167, 0.0167, 0.0167, 0.0167, 0.0167, 0.0167, 0.0167, 0.0167]
```

Why does physics in particular want a fixed step? Three reasons: **stability** (the step stays below the stiffness limit), **determinism** (the same inputs give bit-identical results, which lockstep multiplayer, replays and automated tests rely on), and **tuning** (constraint solvers such as the XPBD of graphics 07 have stiffness that depends on the step). Many engines therefore split the loop: Unity has `FixedUpdate` for physics and `Update` for per-frame logic; Unreal's Chaos physics can run in fixed-step mode; robot simulators always use a fixed step, because a controller trained at 500 Hz must see 500 Hz.

### Try it

The widget runs the three versions side by side on a frictionless spring. Raise the jitter and press the hitch button: the variable-step ball (red) gets a kick in energy at every long frame. Lower the physics rate to 20 Hz: the orange ball (fixed step, newest state) moves in visible jumps, while the blue ball (fixed step, interpolated) stays smooth and follows the dashed exact solution with a small lag.

{% include widget.liquid name="graphics-engine-fixed-timestep" height="440" caption="Sliders: frame-time jitter (0-40 ms around 16.7 ms) and physics rate (10-240 Hz). The button injects one 200 ms frame. Drag any ball horizontally to restart from a new amplitude. The bottom plot shows the energy ratio E/E0 of the variable (red) and fixed (blue) simulations over the last 10 s; it should stay at 1." %}

### Frame pacing, V-sync and input latency

The display refreshes at fixed **vsync** intervals. With V-sync on, a finished frame waits for the next vsync before it is shown; if it misses one, it is shown a whole interval later. So a game that alternates between 15 ms and 18 ms frames on a 60 Hz display shows some frames for 16.7 ms and others for 33.3 ms. That **uneven pacing** looks worse than a steady 30 fps. V-sync off avoids the wait but causes **tearing**: the screen shows the top of one frame and the bottom of the next. Variable refresh rate displays (G-Sync, FreeSync) let the display wait for the frame instead.

**Input latency** is the time from a button press to the first photon that shows its effect. It adds up across the pipeline: the input is sampled at the start of the CPU frame, the frame is simulated, then recorded for the GPU, rendered, and finally scanned out. Figure 2 shows a typical pipelined engine where this is three vsync intervals, 50 ms at 60 Hz. Engines reduce it by sampling input as late as possible, limiting how many frames may be queued ahead, and using vendor latency-reduction modes (such as NVIDIA Reflex) that pace the CPU so the GPU queue stays short.

## 3. Frame budget: CPU and GPU in parallel

At 60 Hz every frame must be finished within $1000/60 = 16.7$ ms; at 90 Hz (typical VR) within 11.1 ms; at 120 Hz within 8.3 ms. That is the **frame budget**, and each subsystem gets a slice of it (for example 2 ms animation, 3 ms physics, 4 ms render submission).

But the CPU and GPU do not take turns. They run **in parallel, on different frames** (Figure 2). While the GPU renders frame $N$, the CPU's render thread records commands for frame $N+1$ and the main thread simulates frame $N+2$. Throughput is set by the slowest stage, not by the sum of the stages, which is why a profiler always asks first: "are we CPU-bound or GPU-bound?". Latency, on the other hand, is the sum of the stages.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-frame-timeline.svg" caption="A pipelined frame. The number in each box is the frame index. Frame 0 is simulated on the main thread (10 ms), recorded on the render thread during the next interval (6 ms), rendered by the GPU (12 ms) and shown at the following vsync (dashed lines). Every stage fits in 16.7 ms, so the engine delivers 60 fps, but each frame takes three intervals (50 ms) from input to photons." %}

To let the CPU run ahead of the GPU, each piece of per-frame data (uniform buffers, command buffers) needs a separate copy for each frame that can be in flight. Fences then stop the CPU from overwriting a copy that the GPU is still reading. That is the topic of [post 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}).

## 4. Data-oriented design

### Why memory layout dominates

A modern CPU core can do several floating-point operations per nanosecond, but a load from main memory takes on the order of 100 ns. Caches bridge the gap. They move data in **cache lines** of 64 bytes, and hardware prefetchers detect linear access patterns and fetch the next lines early. The consequence, laid out in Drepper's "What Every Programmer Should Know About Memory" (2007), is that *how you lay out data in memory* often matters more than how many instructions you execute. **Data-oriented design** (DOD), championed in games by Mike Acton's CppCon 2014 keynote, starts from the data and its access patterns instead of from objects.

### AoS versus SoA

Consider entities with 16 float fields (position, velocity, health, mass, color, UV, flags): 64 bytes, exactly one cache line. The movement system reads only position and velocity, 24 bytes per entity.

- **Array of structures (AoS)**: `Entity entities[N]`. Iterating loads every line in full, so 40 of the 64 bytes are wasted.
- **Structure of arrays (SoA)**: `float px[N], py[N], ..., vz[N]`. The movement system streams six dense arrays, so every byte loaded is used, and the loop maps directly onto SIMD lanes.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-cache-lines.svg" caption="The same entities in two layouts, one rectangle per 4-byte float and one row per 64-byte cache line. Top (AoS): each line holds one entity, and the movement system uses only the six colored fields, 37.5 % of the bytes it loads. Bottom (SoA): each line holds the same field of 16 entities, and every loaded byte is used." %}

A NumPy micro-benchmark makes this measurable. A NumPy structured array is an AoS layout (one 64-byte record per entity), and `aos["px"]` is a strided view into it. Separate arrays are SoA:

```python
import timeit
import numpy as np

FIELDS = ["px", "py", "pz", "vx", "vy", "vz", "hp", "mass",
          "r", "g", "b", "a", "u", "v", "w", "flags"]
N = 1_000_000
aos = np.zeros(N, dtype=[(f, np.float32) for f in FIELDS])   # 64 B per entity
soa = {f: np.zeros(N, np.float32) for f in FIELDS}            # one array per field
dt = np.float32(1 / 60)

def update_aos():
    for c in "xyz":
        aos["p" + c] += aos["v" + c] * dt

def update_soa():
    for c in "xyz":
        soa["p" + c] += soa["v" + c] * dt

for f in (update_aos, update_soa):
    t = min(timeit.repeat(f, number=10, repeat=5)) / 10
    print(f"{f.__name__}: {t * 1e3:.2f} ms ({t / N * 1e9:.2f} ns per entity)")
```

Figure 7 shows the timings measured when the figure script ran, for four array sizes, with the speedup written above each pair. Your numbers will differ by machine. The gap appears because every strided pass over the AoS array drags all 64 bytes of each record through the cache. Small arrays fit in cache, so the penalty is smallest there; at a million entities the AoS array is 64 MB and must stream from main memory.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-aos-soa-bench.svg" caption="Time per entity of the update p += v dt (x, y and z) in the AoS layout (red) and the SoA layout (blue), measured with timeit on the machine that generated the figure; the bold label is the SoA speedup. The exact numbers depend on the CPU and memory, but the SoA layout touches 24 instead of 64 bytes per entity." %}

DOD is more than SoA. Its other habits: process items in batches rather than one virtual call at a time, keep hot and cold data apart, replace pointers with indices into arrays, and sort or group data so that one loop handles one kind of item without branches. The Entity Component System is the architecture that makes these habits the default.

## 5. Entity Component System (ECS)

Classic engines modeled objects with inheritance (`GameObject -> Actor -> Pawn -> Character`) or with component objects attached to a game object (Unity's original `MonoBehaviour`). Both scatter data across the heap. An **ECS** splits the world into three concepts:

- **Entity**: just an ID (an integer, often with a generation counter to detect stale handles).
- **Component**: plain data with no behavior, e.g. `Position`, `Velocity`, `Health`.
- **System**: a function that runs over all entities that have a given set of components, e.g. `movement` over `(Position, Velocity)`.

A **query** names the components a system reads and writes. The storage must make queries fast, and there are two main designs (Figure 8).

**Archetype tables** (Unity Entities, Bevy's default table storage, flecs). All entities with exactly the same set of component types form an **archetype**. Each archetype is a table with one column per component, in SoA layout. A query visits only the matching tables and streams their columns, which is ideal iteration. Unity Entities stores archetypes in 16 KiB chunks with at most 128 entities each. The cost is structural change: adding or removing a component moves the entity's row to another table.

**Sparse sets** (EnTT, and Bevy's opt-in `SparseSet` storage). Each component type has its own pool: a dense packed array of components plus a sparse array that maps an entity ID to its index in the dense array. Adding or removing a component is $O(1)$ and touches only one pool, but a query over several components must iterate one pool and look up the others, with less locality.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-ecs-storage.svg" caption="Top: three archetype tables. The query (Position, Velocity) matches A1 and A2 (purple columns) and skips A3, so the movement system streams two dense column pairs. Bottom: the same Velocity data as a sparse set. The sparse array, indexed by entity ID, points into the packed dense array (a dash means no component), so adding or removing Velocity touches only this pool." %}

Here is a minimal archetype ECS in about 50 lines of Python. Real implementations store columns in typed contiguous arrays and cache query results, but the structure is the same:

```python
class Archetype:
    def __init__(self, key):
        self.key = key                          # frozenset of component names
        self.entities = []                      # row -> entity id
        self.columns = {name: [] for name in key}

    def add_row(self, eid, comps):
        self.entities.append(eid)
        for name in self.key:
            self.columns[name].append(comps[name])
        return len(self.entities) - 1

    def remove_row(self, row):
        """Swap-remove: move the last row into the hole. Returns the moved entity (or None)."""
        last = len(self.entities) - 1
        moved = self.entities[last] if row != last else None
        for col in [self.entities, *self.columns.values()]:
            col[row] = col[last]
            col.pop()
        return moved


class World:
    def __init__(self):
        self.archetypes = {}                    # key -> Archetype
        self.where = {}                         # entity id -> (archetype, row)
        self.next_id = 0

    def _arch(self, key):
        if key not in self.archetypes:
            self.archetypes[key] = Archetype(key)
        return self.archetypes[key]

    def spawn(self, **comps):
        eid, self.next_id = self.next_id, self.next_id + 1
        arch = self._arch(frozenset(comps))
        self.where[eid] = (arch, arch.add_row(eid, comps))
        return eid

    def get(self, eid, name):
        arch, row = self.where[eid]
        return arch.columns[name][row]

    def add(self, eid, **new):
        """Structural change: move the entity to the archetype with more components."""
        arch, row = self.where[eid]
        comps = {n: arch.columns[n][row] for n in arch.key} | new
        moved = arch.remove_row(row)
        if moved is not None:
            self.where[moved] = (arch, row)
        target = self._arch(frozenset(comps))
        self.where[eid] = (target, target.add_row(eid, comps))

    def query(self, *names):
        need = set(names)
        return [a for a in self.archetypes.values() if need <= a.key]


def movement(world, dt):                        # a system
    for arch in world.query("pos", "vel"):
        P, V = arch.columns["pos"], arch.columns["vel"]
        for i in range(len(arch.entities)):
            P[i][0] += V[i][0] * dt
            P[i][1] += V[i][1] * dt


world = World()
a = world.spawn(pos=[0.0, 0.0], vel=[1.0, 0.0])
b = world.spawn(pos=[5.0, 5.0], vel=[0.0, -1.0], hp=100)
c = world.spawn(pos=[2.0, 1.0])                 # static: no velocity
movement(world, 0.5)
movement(world, 0.5)
world.add(c, vel=[0.0, 2.0])                    # c changes archetype
movement(world, 0.5)
for e in (a, b, c):
    print(e, world.get(e, "pos"), sorted(world.where[e][0].key))
print(len(world.archetypes), "archetypes")
```

```text
0 [1.5, 0.0] ['pos', 'vel']
1 [5.0, 3.5] ['hp', 'pos', 'vel']
2 [2.0, 2.0] ['pos', 'vel']
3 archetypes
```

Entity `c` joined the `{pos, vel}` table only at the third step, so it moved by $2 \times 0.5 = 1$. The `{pos}` table still exists, now empty. (The `|` merge of dictionaries needs Python 3.9 or newer.)

**Scheduling.** Because each system declares what it reads and writes, the engine can run systems in parallel automatically: two systems conflict only if one writes a component that the other reads or writes. Bevy builds exactly this kind of schedule from system signatures. Systems that change structure (spawning, adding components) usually record **commands** that are applied at a sync point, so that tables do not change under a running query.

ECS is not the only good architecture: Unreal uses actors and components with its Mass framework as an ECS for crowds, and Godot uses a node tree. But the data-oriented ideas behind ECS show up in the hot loops of every modern engine. The Overwatch team's GDC 2017 talk is a good look at ECS in a shipped game, including how it simplified netcode.

## 6. Scene graphs, transforms and spatial structures

### Transform hierarchies

Many objects move relative to a parent: a hand relative to the arm, a turret relative to a tank, a camera relative to a car. A **transform hierarchy** stores a local transform $L$ per node; the world transform is the product along the path from the root:

$$
M_\text{hand} = L_\text{root}\, L_\text{arm}\, L_\text{hand} .
$$

With 2D homogeneous matrices
$L = \begin{pmatrix} \cos\theta & -\sin\theta & t_x \\ \sin\theta & \cos\theta & t_y \\ 0 & 0 & 1 \end{pmatrix}$,
take the root at $(2, 1)$ rotated $20°$, the arm at local $(1.5, 0)$ rotated $40°$ and the hand at local $(1.2, 0)$ rotated $-30°$. The hand's world origin is

$$
(2,1) + 1.5\,(\cos 20°, \sin 20°) + 1.2\,(\cos 60°, \sin 60°) = (4.010,\ 2.552),
$$

because the arm's frame is rotated by $20° + 40° = 60°$ when the hand offset is applied. Rotating the root moves every descendant (Figure 9).

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-transform-hierarchy.svg" caption="A three-node hierarchy. Each node's local x axis (red) and y axis (green) are drawn at its world position, labeled with the computed world coordinates. Dashed and faded: after the root is rotated from 20° to 30°, arm and hand follow without their local transforms changing." %}

Recomputing every world matrix every frame wastes time when most objects are static. **Dirty flags** fix this: changing a local transform marks the node and its subtree dirty, and world matrices are recomputed only when read:

```python
import numpy as np

recomputed = 0

def T2(tx, ty, deg):
    a = np.radians(deg)
    return np.array([[np.cos(a), -np.sin(a), tx], [np.sin(a), np.cos(a), ty], [0.0, 0.0, 1.0]])

class Node:
    def __init__(self, local, parent=None):
        self.local, self.parent, self.children = local, parent, []
        self.dirty, self._world = True, None
        if parent:
            parent.children.append(self)

    def set_local(self, local):
        self.local = local
        stack = [self]
        while stack:                      # mark the whole subtree dirty
            n = stack.pop()
            n.dirty = True
            stack.extend(n.children)

    def world(self):
        global recomputed
        if self.dirty:
            parent_world = self.parent.world() if self.parent else np.eye(3)
            self._world = parent_world @ self.local
            self.dirty = False
            recomputed += 1
        return self._world

root = Node(T2(2.0, 1.0, 20))
arm = Node(T2(1.5, 0.0, 40), root)
hand = Node(T2(1.2, 0.0, -30), arm)
for label, action in [("first read", None), ("second read", None), ("after root moves", 30)]:
    if action is not None:
        root.set_local(T2(2.0, 1.0, action))
    recomputed = 0
    x, y = hand.world()[:2, 2]
    print(f"{label:17s}: hand at ({x:.3f}, {y:.3f}), recomputed {recomputed} matrices")
```

```text
first read       : hand at (4.010, 2.552), recomputed 3 matrices
second read      : hand at (4.010, 2.552), recomputed 0 matrices
after root moves : hand at (3.709, 2.878), recomputed 3 matrices
```

In an ECS the same idea becomes data-oriented: `Parent` and `LocalTransform` components, with a system that propagates `GlobalTransform` in topological order (Bevy and Unity Entities both do this).

### Spatial structures for culling and queries

The scene graph answers "what is attached to what". A different question is "what is near what": which objects are inside the camera frustum, which pairs might collide, what does this ray hit. A linear scan over all objects is $O(n)$ per query. **Spatial structures** reduce that:

- A **uniform grid** hashes objects into cells. It is simple and excellent when objects are evenly spread and similar in size, which is why particle systems and broad-phase collision often use it.
- An **octree** (quadtree in 2D) subdivides space adaptively and suits large static worlds.
- A **bounding volume hierarchy (BVH)** groups objects into a tree of bounding boxes (Goldsmith and Salmon, 1987). It is the structure behind ray tracing ([graphics 05]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})), and it is also good for culling and dynamic scenes, because refitting the boxes after objects move is cheap.

Frustum culling with a BVH tests the root box against the frustum planes. A box completely outside any one plane is rejected together with its whole subtree; otherwise the test recurses into the children. Figure 10 shows a real 2D run.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-bvh-culling.svg" caption="Frustum culling of 200 boxes with a median-split BVH (leaves of up to 4 boxes). Blue wedge: the camera's 2D frustum. Purple outlines: BVH nodes that were tested; whole subtrees outside the wedge are rejected with one test. Orange boxes pass the culling test. The title gives the number of box tests compared with 200 for brute force." %}

## 7. Concurrency: jobs, task graphs and fibers

A console or desktop CPU has 8 to 16 or more hardware threads, and a frame contains hundreds of independent pieces of work. Early multi-core engines gave each subsystem its own thread (a physics thread, an audio thread). That scales poorly, because the threads are unevenly loaded. Modern engines use a **job system**: a fixed pool of worker threads, usually one per core, pulls small jobs from queues. Idle workers steal work from busy ones (**work stealing**, analyzed by Blumofe and Leiserson, 1999).

Jobs have dependencies (animation before skinning, culling before command recording), so a frame is a **task graph**, a DAG. Two numbers bound how fast it can run on $P$ workers: the total **work** $W$ (the sum of all durations) and the **critical path** $C$ (the longest dependency chain). Any schedule needs at least

$$
T_P \ \ge\ \max\!\left(C,\ \frac{W}{P}\right).
$$

A greedy **list scheduler** gets within a factor of two of this bound (Graham's bound, $T_P \le W/P + C$). Giving priority to jobs with the longest remaining path to the end usually does much better. Here is a toy frame with 12 jobs, scheduled in 30 lines:

```python
import heapq

JOBS = {  # name: (duration in ms, dependencies)
    "input": (1, []),
    "anim_a": (3, ["input"]),
    "anim_b": (3, ["input"]),
    "physics": (4, ["input"]),
    "gameplay": (2, ["physics"]),
    "skinning": (2, ["anim_a", "anim_b"]),
    "particles": (3, ["physics"]),
    "audio": (2, ["gameplay"]),
    "cull": (2, ["gameplay", "skinning"]),
    "build_1": (2, ["cull"]),
    "build_2": (2, ["cull", "particles"]),
    "submit": (1, ["build_1", "build_2"]),
}

def schedule(jobs, workers):
    children = {n: [] for n in jobs}
    for n, (_, deps) in jobs.items():
        for d in deps:
            children[d].append(n)
    prio = {}
    def bottom(n):                       # longest path from n to the end, including n
        if n not in prio:
            prio[n] = jobs[n][0] + max((bottom(c) for c in children[n]), default=0)
        return prio[n]
    for n in jobs:
        bottom(n)
    missing = {n: len(deps) for n, (_, deps) in jobs.items()}
    ready = [n for n in jobs if missing[n] == 0]
    free, running, t, log = list(range(workers)), [], 0, []
    while ready or running:
        ready.sort(key=lambda n: (-prio[n], n))   # most critical first
        free.sort()
        while ready and free:
            n, w = ready.pop(0), free.pop(0)
            heapq.heappush(running, (t + jobs[n][0], w, n))
            log.append((n, w, t, t + jobs[n][0]))
        t = running[0][0]                         # jump to the next completion
        while running and running[0][0] == t:
            _, w, n = heapq.heappop(running)
            free.append(w)
            for c in children[n]:
                missing[c] -= 1
                if missing[c] == 0:
                    ready.append(c)
    return t, log

for p in (1, 2, 3, 4):
    print(p, "workers: makespan", schedule(JOBS, p)[0], "ms")
```

```text
1 workers: makespan 27 ms
2 workers: makespan 15 ms
3 workers: makespan 12 ms
4 workers: makespan 12 ms
```

Check the bound: $W = 27$ ms and $C = 12$ ms (input, physics, gameplay, cull, build, submit). With two workers the bound is $\max(12, 13.5) = 13.5$ ms and the scheduler reaches 15 ms. From three workers on, the critical path is the limit, and a fourth worker only adds idle time (Figure 11). To speed this frame up you must shorten the critical path, for example by splitting physics into islands, not add cores.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-job-graph.svg" caption="Left: the job DAG of the code, with the 12 ms critical path in red. Right: the Gantt chart that the list scheduler produces on 4 workers. The makespan equals the critical path; worker 2 is idle half of the time and worker 3 never receives a job, so more cores would not help this frame." %}

The widget runs the same scheduler. Change the number of workers, switch the priority to plain declaration order, and split physics into two parallel 2 ms islands: the physics chain gets shorter, but the critical path only drops from 12 to 11 ms, because the animation chain (input, anim, skinning, cull, build, submit) now limits the frame.

{% include widget.liquid name="graphics-engine-job-scheduler" height="360" caption="The 12-job frame on P workers. Red outlines mark the critical path; the green dashed line is the lower bound max(C, W/P), and the makespan turns green when the schedule reaches it. Try P = 2 with both priorities, then tick the split-physics box." %}

**Fibers.** A job that must wait for another job (say, `cull` waiting for the result of a sub-job) would block its worker thread. Naughty Dog's engine, described by Christian Gyrling at GDC 2015 ("Parallelizing the Naughty Dog Engine Using Fibers"), solves this with **fibers**: lightweight user-space execution contexts with their own stacks. A job that waits on an atomic counter puts its fiber to sleep, and the worker thread switches to another fiber, with no OS context switch. The same talk describes how the engine overlaps frames: game logic for one frame runs while rendering work for the previous frame is processed, which is the pipelining of Figure 2.

**Main thread and render thread.** Even engines with job systems keep a few dedicated threads. Unreal has a game thread, a render thread that turns the scene into rendering commands, and an RHI thread that talks to the GPU API. Separating simulation from command recording lets the two overlap on different frames, at the cost of having to copy or double-buffer the data passed between them.

## 8. Assets, serialization, hot reload and the editor

Artists author in formats that are good for editing: FBX, glTF, USD, PSD, high-resolution EXR, WAV. The runtime wants formats that are good for loading: GPU-compressed textures (BC1-7 on desktop, ASTC on mobile), vertex buffers in the exact layout the shaders read, meshes split into LODs or meshlets, and everything packed into large archives that can be read with few I/O requests. The **asset pipeline** does this conversion:

1. **Import**: parse the source file into an engine-neutral representation, and assign each asset a stable ID (a GUID).
2. **Cook** (also called build or bake): convert it for one target platform. This means texture compression, mesh optimization, shader compilation for each permutation, and baking lighting or navigation meshes. Cooking is cached by content hash, because it can take hours for a full game.
3. **Package**: bundle the cooked assets into archives, ordered so that what loads together sits together on disk.
4. **Stream**: at run time, load and unload assets as the player moves, within a memory budget, in the background without stalling frames.

**Serialization** turns objects into bytes and back. Engines usually reflect over their types (C++ macros in Unreal, attributes and source generators in Unity, derive macros in Bevy) so that one description of a type drives saving, loading, network replication and the editor's property panels. **Hot reload** reimports a changed asset or recompiles a shader or script while the game runs, and swaps it in place. It turns a minutes-long change-build-run loop into seconds, which is why teams care about it so much.

All of this is why the **editor and tools are half of an engine**. A renderer that is 10 % faster matters less to a team of 100 artists than a pipeline that shows their change in two seconds instead of two minutes. When you compare engines in [post 04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}), compare their tools as carefully as their rendering.

## 9. How to study engines

Reading a real engine is the fastest way to learn, provided you read with a question in mind. Good codebases for that:

- **Godot** (C++, MIT): a complete, readable engine with editor, node-based scenes and Vulkan, D3D12 and Metal renderers. Start from `main/main.cpp` and follow one frame (`Main::iteration`).
- **Bevy** (Rust, MIT/Apache): a modern ECS-first engine. `bevy_ecs` is a compact reference implementation of archetype tables, sparse sets, queries and parallel scheduling.
- **Piccolo** (C++, MIT): the small teaching engine built for the GAMES104 course. Its layered runtime matches Section 1 almost one to one.
- **EnTT** and **flecs**: standalone ECS libraries, good for comparing sparse-set and archetype storage.

A project ladder, each rung a weekend or two:

1. A fixed-timestep loop with interpolation and a bouncing-ball scene (this post).
2. A minimal ECS with three systems and a profiler overlay that shows the time each system takes.
3. A transform hierarchy with dirty flags, plus frustum culling with a BVH.
4. A job system with a work-stealing pool, then convert the systems of rung 2 into jobs.
5. A WebGPU renderer with a render graph ([post 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}) and [post 03]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})).
6. An asset pipeline: import glTF, cook it into a binary format, hot-reload it on file change.

## Representative papers

Engine architecture is documented mostly in books and conference talks rather than papers; the table mixes both.

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Goldsmith & Salmon, *Automatic Creation of Object Hierarchies for Ray Tracing* | IEEE CG&A | 1987 | [DOI](https://doi.org/10.1109/MCG.1987.276983) | Bounding volume hierarchies built automatically; basis of BVH culling and ray tracing |
| Blumofe & Leiserson, *Scheduling Multithreaded Computations by Work Stealing* | J. ACM | 1999 | [DOI](https://doi.org/10.1145/324133.324234) | The theory behind work-stealing job systems |
| Fiedler, *Fix Your Timestep!* | Gaffer on Games (article) | 2004 | [link](https://gafferongames.com/post/fix_your_timestep/) | The accumulator with interpolation; the reference for game loops |
| Drepper, *What Every Programmer Should Know About Memory* | Red Hat report | 2007 | [PDF](https://people.freebsd.org/~lstewart/articles/cpumemory.pdf) | Caches, prefetching and memory layout in depth |
| Acton, *Data-Oriented Design and C++* | CppCon (keynote) | 2014 | [isocpp](https://isocpp.org/blog/2015/01/cppcon-2014-data-oriented-design-and-c-mike-acton) | The talk that made DOD mainstream in game programming |
| Gyrling, *Parallelizing the Naughty Dog Engine Using Fibers* | GDC | 2015 | [GDC Vault](https://gdcvault.com/play/1022186) | Fiber-based job system and overlapping frames in a AAA engine |
| Ford, *Overwatch Gameplay Architecture and Netcode* | GDC | 2017 | [GDC Vault](https://gdcvault.com/play/1024001) | ECS in a shipped game and how it shaped networking |

## Learning resources

- Jason Gregory, *Game Engine Architecture*, 3rd ed. (CRC Press, 2018); the [book site](https://www.gameenginebook.com/) now also announces a two-volume 4th edition. The standard textbook, written by a Naughty Dog engineer.
- Robert Nystrom, [*Game Programming Patterns*](https://gameprogrammingpatterns.com/) (free online): the game loop, update method, component, data locality, dirty flag and spatial partition chapters match this post closely.
- Richard Fabian, [*Data-Oriented Design*](https://www.dataorienteddesign.com/dodbook/) (free online).
- Akenine-Möller et al., [*Real-Time Rendering*](https://www.realtimerendering.com/), 4th ed. (2018), for the rendering side of the engine.
- **GAMES104 (现代游戏引擎：从入门到实践)**, a free course in Chinese on modern game engines ([course page](https://games104.boomingtech.com/)), with the [Piccolo](https://github.com/BoomingTech/Piccolo) teaching engine.
- Code: [Godot](https://github.com/godotengine/godot), [Bevy](https://github.com/bevyengine/bevy), [EnTT](https://github.com/skypjack/entt), [flecs](https://github.com/SanderMertens/flecs).

## Exercises

1. Show that for the semi-implicit Euler jump the discrete apex is $h_\Delta = \frac{v_0^2}{2g} - \frac{v_0\Delta t}{2} + O(\Delta t^2)$, and check it against the legend of Figure 3.
2. In the fixed-timestep loop, remove the `MAX_FRAME` clamp and make `physics_step` artificially slow (sleep 10 ms inside it at `DT = 1/120`). What happens to the accumulator and the frame time? Explain the spiral of death.
3. Extend the Python ECS with `remove(eid, name)` and a `despawn(eid)`, and add generation counters to entity IDs so that a stale handle is detected.
4. Change the priority in `schedule` to first-come-first-served (sort `ready` by name only). Compare the makespans for 2, 3 and 4 workers with the critical-path priority.
5. Replace the dirty-flag recursion with a flat array of nodes sorted so that parents come before children, and update all world matrices in one loop. Why is this faster for large hierarchies?

<details markdown="1"><summary>Hint</summary>

1. Sum the positions: $y_n = \sum_{k=1}^{n} (v_0 - g k\Delta t)\Delta t$ and maximize over $n$ ($n^\ast \approx v_0/(g\Delta t)$).
2. Each frame needs more steps than it can compute, so the frame gets longer, so the next frame needs even more steps. The accumulator grows without bound.
4. The order in which `physics` and the animation jobs start decides whether the critical path is delayed.
5. The flat loop reads the parent's matrix from a slot it has just written, so the access is sequential and cache-friendly and has no recursion overhead.

</details>

Next: [post 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}) goes below the renderer layer, to explicit GPU APIs, synchronization and render graphs.
