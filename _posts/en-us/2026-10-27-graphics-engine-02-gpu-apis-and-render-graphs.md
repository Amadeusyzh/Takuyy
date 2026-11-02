---
layout: post
title: "Modern GPU APIs and render graphs"
date: 2026-10-27 13:02:00+0900
description: "How engines talk to the GPU: explicit APIs (Vulkan, D3D12, Metal, WebGPU), memory and synchronization, a minimal WebGPU program, render graphs with a working toy compiler, forward/deferred/clustered lighting, the visibility buffer, GPU-driven rendering with HZB culling and meshlets, and GPU debugging."
categories: graphics-engine
tags: [vulkan, d3d12, webgpu, render-graph, frame-graph, clustered-shading, visibility-buffer, gpu-driven, mesh-shaders]
series: graphics-engine
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## Why this matters

[Post 01]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}) drew the renderer as one box in the engine's layer diagram. This post opens the box. A modern renderer is an orchestrator: it records commands for dozens of passes, keeps several frames in flight, tells the GPU exactly when each texture changes from "being written" to "being read", and packs short-lived textures into shared memory. All of this is explicit in today's GPU APIs, and **render graphs** are how engines keep it manageable. The rendering mathematics (BRDFs, shadows, global illumination) lives in the graphics track, for example [graphics 04]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}) and [graphics 11]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }}); here we care about the machinery that runs it.

## Prerequisites

- The rasterization pipeline: vertex shader, rasterizer, fragment shader, depth test ([graphics 02]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})).
- The frame pipeline and frames in flight from [post 01]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}), Section 3.
- Some JavaScript for the WebGPU example, Python for the render-graph compiler.

## 1. From the OpenGL state machine to explicit APIs

### What was wrong with OpenGL

OpenGL (and Direct3D 11) present the GPU as a **global state machine**. You bind a texture, set a blend mode, bind a shader, and call draw; the driver works out the rest. That is convenient, but the driver has to guess. It validates the whole state at every draw, compiles shader variants lazily when it first sees a new state combination (causing hitches in the middle of gameplay), tracks every resource to insert hidden synchronization, and can record commands on only one thread, because the state is global.

**Explicit APIs** move that work to the application, which knows its own frame: Direct3D 12 (2015), Vulkan (1.0 released in February 2016), Apple's Metal (2014) and, for the web, **WebGPU** (shipped in Chrome 113 in 2023, in Firefox 141 on Windows and in Safari 26 in 2025; the W3C specification is a Candidate Recommendation Draft as of autumn 2026). They differ in names and details but share one object model (Figure 1).

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-api-objects.svg" caption="The object model shared by explicit APIs (Vulkan / D3D12 / WebGPU names). The device creates everything; pipelines are built from shader modules and a layout; bind groups (descriptor sets) point at buffers and textures that live in memory heaps; command buffers are recorded and submitted to queues; fences, semaphores and queries observe the GPU timeline." %}

### The objects

- **Instance, adapter, device.** The instance is the connection to the API; an adapter (Vulkan: physical device) is one GPU; the logical **device** is your handle for creating everything else.
- **Queues.** The GPU exposes queues of different kinds: graphics, compute and copy (transfer). Work submitted to different queues can overlap, which is the basis of **async compute** (Section 4).
- **Command buffers.** Instead of issuing calls immediately, you **record** commands into a command buffer (WebGPU: a command encoder) and **submit** the finished buffer to a queue. Recording is CPU-only and can run on many threads at once, one command buffer per thread. This is the main reason explicit APIs scale on multi-core CPUs.
- **Pipeline state objects (PSOs).** All the state that affects shader compilation (shaders, vertex layout, blend, depth test, render-target formats) is baked into one immutable object, created ahead of time. The driver compiles it once, at load time, not in the middle of a frame. The cost is a combinatorial number of PSOs, which is why engines cache them and precompile them during loading.
- **Shaders as intermediate code.** Shaders are compiled offline to an intermediate representation: **SPIR-V** for Vulkan, **DXIL** for D3D12, a Metal library for Metal. WebGPU takes **WGSL** source, which the browser translates for the native API. Engines usually write HLSL or Slang once and cross-compile.
- **Descriptors and bind groups.** A shader refers to resources through binding slots. A **descriptor** is a small record ("texture X, as a sampled image") that fills a slot. Descriptors are grouped in **descriptor sets** (Vulkan), **descriptor tables** inside **descriptor heaps** (D3D12) or **bind groups** (WebGPU), whose shape is fixed by a layout (Vulkan pipeline layout, D3D12 root signature).
- **Bindless.** Rebinding sets for every draw costs CPU time and limits batching. With **bindless** resources, all textures of a scene live in one huge descriptor array, and the shader indexes it with an integer read from a buffer: `textures[material.albedo_index]`. Vulkan offers this through descriptor indexing (core since 1.2) and descriptor buffers; D3D12 through Shader Model 6.6's direct heap indexing. Bindless is what makes GPU-driven rendering (Section 6) possible, because the GPU itself can pick the material without the CPU binding anything. It is not part of core WebGPU 1.0.

## 2. Memory and synchronization

### Memory

In explicit APIs you allocate **memory heaps** yourself and place buffers and textures in them. Device-local memory is fast for the GPU; host-visible memory can be written by the CPU (for uploads and per-frame constants). Allocating one heap per resource is slow and fragments memory, so engines use sub-allocators (for example AMD's Vulkan Memory Allocator and D3D12 Memory Allocator libraries) and, for short-lived render targets, a **transient heap** whose memory is reused by several textures within one frame (**aliasing**, Section 4).

### Hazards and barriers

The GPU is a deeply pipelined, massively parallel machine. If pass A writes a texture and pass B reads it, nothing guarantees that A's writes have finished, or that they have left the caches, before B starts. That is a **read-after-write hazard**. The application must insert a **barrier** that says: "wait until these earlier stages have finished writing, make the writes visible, and convert the texture to the layout the next use needs". Vulkan expresses a barrier as source and destination **pipeline stages**, **access masks** and an image **layout** transition; D3D12 as a **resource state** transition (for example `RENDER_TARGET` to `PIXEL_SHADER_RESOURCE`), or with the newer enhanced barriers in the Vulkan style.

It helps to think of each texture as a small state machine. In Figure 3, each row is a texture of a deferred renderer, each column is a pass, and the color is the state the texture must be in during that pass. Every color change requires a barrier (the red tick). This figure was produced by the toy compiler of Section 4, which inserts barriers automatically.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-barrier-states.svg" caption="Resource states across the passes of the example frame (rows: textures, columns: executed passes, R/W: read or written by that pass). Orange: render target; gray-blue: depth write; green: shader read (SRV); purple: present. A red tick marks a barrier before the pass. depth, for example, is written by gbuffer and then read by ssao, lighting and taa, so it needs exactly one transition from DEPTH_WRITE to SRV." %}

### CPU-GPU synchronization: fences, semaphores, frames in flight

Barriers order work *within* the GPU. Two other primitives connect timelines:

- A **fence** lets the CPU wait for the GPU: the queue signals the fence when a submission completes. (Vulkan also has **timeline semaphores**, a monotonically increasing 64-bit counter; D3D12 fences work the same way.)
- A **semaphore** orders work *between queues* or with the swapchain, for example "do not start rendering into the swapchain image until the presentation engine has released it".

The CPU wants to record frame $N+1$ while the GPU renders frame $N$. But frame $N+1$ uses its own uniform buffers and command buffers, and it must not overwrite those of a frame the GPU is still reading. So the engine keeps $F$ copies of all per-frame data (**frames in flight**), and before reusing copy $i \bmod F$ it waits on the fence of frame $i - F$. Figure 2 simulates a frame where the CPU needs 9 ms and the GPU 12 ms:

- With $F = 1$ the two processors take turns: $9 + 12 = 21$ ms per frame.
- With $F = 2$ the GPU never idles. The frame time drops to $\max(9, 12) = 12$ ms, and the CPU waits a little on the fence each frame: the engine is **GPU-bound**.
- With $F = 3$ the throughput stays 12 ms, but each frame now takes 36 ms from the start of its CPU work to the end of its GPU work, compared with 24 ms for $F = 2$. More frames in flight buy tolerance to spikes and cost latency. Two or three is typical.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-frames-in-flight.svg" caption="CPU (top lane) and GPU (bottom lane) for one, two and three frames in flight, CPU 9 ms and GPU 12 ms per frame; the number is the frame index and hatched boxes are CPU time spent waiting on a fence. The title of each panel gives the steady-state frame time and the time from CPU start to GPU completion of the last frame." %}

### Common synchronization bugs

1. **Missing barrier.** The read sees stale or half-written data. It may work on one GPU and flicker on another. Validation layers (Vulkan's synchronization validation, D3D12's GPU-based validation) catch many of these.
2. **Overwriting in-flight data.** Writing this frame's constants into a buffer the GPU is still reading for the previous frame. Symptom: objects jitter between two positions.
3. **Over-synchronization.** Barriers with "all stages, all memory" everywhere, or a `vkDeviceWaitIdle` per frame. Correct but slow, since it drains the GPU pipeline.
4. **Wrong layout.** Sampling a texture still in render-target layout; on some hardware this reads compressed data as garbage.
5. **Deadlock.** Waiting on a fence that is never signaled, for example because the submission that signals it failed.

Render graphs (Section 4) exist largely to make bugs 1, 3 and 4 impossible by construction.

## 3. A minimal WebGPU program

WebGPU runs in the browser, so it is the quickest way to touch an explicit API. The page below draws a rotating triangle whose angle comes from a uniform buffer. Save it as `index.html` and open it in a WebGPU-capable browser; on some systems you have to serve it from `http://localhost` rather than opening the file directly.

```html
<!doctype html>
<canvas id="c" width="640" height="480"></canvas>
<script type="module">
const adapter = await navigator.gpu.requestAdapter();             // 1. pick a GPU
const device = await adapter.requestDevice();                     // 2. logical device
const canvas = document.getElementById("c");
const context = canvas.getContext("webgpu");
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format, alphaMode: "opaque" });       // 3. swapchain

const shader = device.createShaderModule({ code: `                // 4. WGSL shaders
  struct Uniforms { time: f32, aspect: f32, pad0: f32, pad1: f32 };
  @group(0) @binding(0) var<uniform> u: Uniforms;
  struct VSOut { @builtin(position) pos: vec4f, @location(0) color: vec3f };

  @vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
    var p = array<vec2f, 3>(vec2f(0.0, 0.6), vec2f(-0.6, -0.4), vec2f(0.6, -0.4));
    var c = array<vec3f, 3>(vec3f(1, 0, 0), vec3f(0, 1, 0), vec3f(0, 0, 1));
    let s = sin(u.time);
    let k = cos(u.time);
    let q = vec2f(k * p[i].x - s * p[i].y, s * p[i].x + k * p[i].y);
    var o: VSOut;
    o.pos = vec4f(q.x / u.aspect, q.y, 0.0, 1.0);
    o.color = c[i];
    return o;
  }
  @fragment fn fs(v: VSOut) -> @location(0) vec4f { return vec4f(v.color, 1.0); }
` });

const pipeline = device.createRenderPipeline({                    // 5. pipeline state object
  layout: "auto",
  vertex: { module: shader, entryPoint: "vs" },
  fragment: { module: shader, entryPoint: "fs", targets: [{ format }] },
  primitive: { topology: "triangle-list" },
});

const ubo = device.createBuffer({                                 // 6. uniform buffer (16 bytes)
  size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const bindGroup = device.createBindGroup({                        // 7. bind group = descriptor set
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: ubo } }],
});

function frame(ms) {
  device.queue.writeBuffer(ubo, 0, new Float32Array([ms / 1000, canvas.width / canvas.height, 0, 0]));
  const encoder = device.createCommandEncoder();                  // 8. record commands
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.95, g: 0.95, b: 0.97, a: 1 },
      loadOp: "clear", storeOp: "store",
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);                                                   // 3 vertices, no vertex buffer
  pass.end();
  device.queue.submit([encoder.finish()]);                        // 9. submit to the queue
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script>
```

Line by line:

1. **Adapter.** `requestAdapter` picks a physical GPU. You could pass `{ powerPreference: "high-performance" }` on laptops with two GPUs.
2. **Device.** All resources belong to the device. Optional features (for example `"timestamp-query"`, Section 7) are requested here.
3. **Swapchain.** `context.configure` connects the canvas to the device. Each frame, `getCurrentTexture()` returns the image to render into, which is the swapchain image of Vulkan.
4. **Shaders.** The vertex shader needs no vertex buffer: it indexes a constant array with the built-in `vertex_index` and rotates the point by `u.time`. The struct is padded to 16 bytes, because uniform buffers follow alignment rules.
5. **Pipeline.** `layout: "auto"` lets WebGPU derive the bind group layout from the shader. Real engines declare layouts explicitly, so that several pipelines can share bind groups.
6. **Uniform buffer.** `COPY_DST` allows `queue.writeBuffer` uploads. WebGPU handles the frames-in-flight problem of Section 2 for you: `writeBuffer` is ordered on the queue, so it cannot overwrite data that an earlier submission is still using.
7. **Bind group.** It binds the buffer to `@group(0) @binding(0)`.
8. **Recording.** A render pass declares its attachments and what to do with them: `loadOp: "clear"` (do not load the old contents) and `storeOp: "store"` (keep the result). These flags matter a lot on tile-based mobile GPUs, which can then skip memory traffic.
9. **Submission.** Only `submit` sends work to the GPU. WebGPU inserts barriers itself, because it tracks resource usage per pass, which is why there are none in the code. Vulkan and D3D12 leave that to you.

From here, the next steps are a vertex buffer, a depth texture, a camera matrix in the uniform buffer, and a second pass. [Post 03]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }}) builds a full mini engine on exactly this foundation: glTF loading, PBR, shadows and an ECS.

## 4. Render graphs (frame graphs)

### The problem

A modern frame has 20 to 100 passes: shadow maps, a depth prepass, a G-buffer, SSAO, lighting, transparency, volumetrics, TAA, bloom, tone mapping, UI. Each reads and writes textures. Written by hand, every pass must know which barriers to issue, every texture must be allocated for the whole frame even if it is used for one pass, and turning a feature off (for example SSAO on low settings) means editing code in several places.

### The idea

Yuriy O'Donnell's GDC 2017 talk "FrameGraph: Extensible Rendering Architecture in Frostbite" introduced the design that most engines now use. Unreal Engine has the **Render Dependency Graph (RDG)** and Unity has the **RenderGraph** used by URP and HDRP. The frame is built in three phases:

1. **Setup.** Each pass *declares* the resources it reads and writes, and creates transient resources by description only (format and size), without allocating memory.
2. **Compile.** The graph, a DAG of passes connected by resources, is analyzed as a whole: unused passes are **culled**, the passes are ordered, the **lifetime** of each resource is computed, memory is assigned with **aliasing**, and **barriers** are derived from the declared uses.
3. **Execute.** The passes' recording callbacks run in order, with real resources bound.

Because the whole frame is known before anything executes, the compiler can make global decisions that no single pass could make.

### A toy frame-graph compiler

Here is a complete compiler in about 60 lines of Python. The frame is a deferred renderer: a shadow map, a G-buffer (depth, albedo, normal), SSAO, lighting into an HDR target, a debug pass that visualizes normals, TAA, bloom and tone mapping into the swapchain image (`backbuffer`, an **imported** resource that the graph does not own). Sizes are in MB, roughly what each target costs at 1080p.

```python
from dataclasses import dataclass

@dataclass
class Pass:
    name: str
    reads: list
    writes: list

SIZES = {"shadow_map": 16, "depth": 8, "gbuf_albedo": 8, "gbuf_normal": 8,
         "ssao": 2, "hdr": 16, "taa_out": 16, "bloom": 4, "debug_view": 8}
DEPTH_LIKE = {"shadow_map", "depth"}
IMPORTED = {"backbuffer"}

PASSES = [
    Pass("shadow", [], ["shadow_map"]),
    Pass("gbuffer", [], ["depth", "gbuf_albedo", "gbuf_normal"]),
    Pass("ssao", ["depth", "gbuf_normal"], ["ssao"]),
    Pass("lighting", ["gbuf_albedo", "gbuf_normal", "depth", "ssao", "shadow_map"], ["hdr"]),
    Pass("debug_normals", ["gbuf_normal"], ["debug_view"]),
    Pass("taa", ["hdr", "depth"], ["taa_out"]),
    Pass("bloom", ["taa_out"], ["bloom"]),
    Pass("tonemap", ["taa_out", "bloom"], ["backbuffer"]),
]

def compile_graph(passes, outputs):
    # 1. cull: walk backwards from the outputs through the producers
    writer = {r: p for p in passes for r in p.writes}
    needed, stack = set(), list(outputs)
    while stack:
        r = stack.pop()
        p = writer.get(r)
        if p is not None and p.name not in needed:
            needed.add(p.name)
            stack.extend(p.reads)
    # 2. order: Kahn's topological sort, ties broken by declaration order
    live = [p for p in passes if p.name in needed]
    deps = {p.name: {writer[r].name for r in p.reads if r in writer} for p in live}
    order, done = [], set()
    while len(order) < len(live):
        p = next(p for p in live if p.name not in done and deps[p.name] <= done)
        order.append(p)
        done.add(p.name)
    # 3. lifetimes: first and last pass index that touches each transient resource
    life = {}
    for i, p in enumerate(order):
        for r in p.reads + p.writes:
            if r not in IMPORTED:
                a, b = life.get(r, (i, i))
                life[r] = (min(a, i), max(b, i))
    # 4. aliasing: largest first, lowest offset free of overlaps in time and memory
    placed = {}
    for r in sorted(life, key=lambda r: (-SIZES[r], life[r][0], r)):
        a, b = life[r]
        busy = sorted((placed[q][0], placed[q][0] + SIZES[q]) for q in placed
                      if not (life[q][1] < a or b < life[q][0]))
        off = 0
        for lo, hi in busy:
            if off + SIZES[r] <= lo:
                break
            off = max(off, hi)
        placed[r] = (off, off + SIZES[r])
    # 5. barriers: track each resource's state, emit a transition when it changes
    state = {r: "UNDEFINED" for r in life} | {r: "PRESENT" for r in IMPORTED}
    barriers = []
    for i, p in enumerate(order):
        want = [(r, "SRV") for r in p.reads] + \
               [(r, "DEPTH_WRITE" if r in DEPTH_LIKE else "RT") for r in p.writes]
        for r, s in want:
            if state[r] != s:
                barriers.append((i, r, state[r], s))
                state[r] = s
    for r in IMPORTED:
        if state[r] != "PRESENT":
            barriers.append((len(order), r, state[r], "PRESENT"))
    return order, life, placed, barriers

order, life, placed, barriers = compile_graph(PASSES, outputs=["backbuffer"])
print("culled:", [p.name for p in PASSES if p not in order])
print("order :", [p.name for p in order])
for r in life:
    print(f"{r:12s} life {life[r]}  memory [{placed[r][0]:2d}, {placed[r][1]:2d}) MB")
print("no aliasing:", sum(SIZES[r] for r in life), "MB; aliased heap:",
      max(hi for _, hi in placed.values()), "MB")
for i in range(len(order) + 1):
    items = [f"{r}:{a}->{b}" for j, r, a, b in barriers if j == i]
    print(f"{order[i].name if i < len(order) else '(end)':9s}", ", ".join(items))
```

```text
culled: ['debug_normals']
order : ['shadow', 'gbuffer', 'ssao', 'lighting', 'taa', 'bloom', 'tonemap']
shadow_map   life (0, 3)  memory [ 0, 16) MB
depth        life (1, 4)  memory [32, 40) MB
gbuf_albedo  life (1, 3)  memory [40, 48) MB
gbuf_normal  life (1, 3)  memory [48, 56) MB
ssao         life (2, 3)  memory [56, 58) MB
hdr          life (3, 4)  memory [16, 32) MB
taa_out      life (4, 6)  memory [ 0, 16) MB
bloom        life (5, 6)  memory [16, 20) MB
no aliasing: 78 MB; aliased heap: 58 MB
shadow    shadow_map:UNDEFINED->DEPTH_WRITE
gbuffer   depth:UNDEFINED->DEPTH_WRITE, gbuf_albedo:UNDEFINED->RT, gbuf_normal:UNDEFINED->RT
ssao      depth:DEPTH_WRITE->SRV, gbuf_normal:RT->SRV, ssao:UNDEFINED->RT
lighting  gbuf_albedo:RT->SRV, ssao:RT->SRV, shadow_map:DEPTH_WRITE->SRV, hdr:UNDEFINED->RT
taa       hdr:RT->SRV, taa_out:UNDEFINED->RT
bloom     taa_out:RT->SRV, bloom:UNDEFINED->RT
tonemap   bloom:RT->SRV, backbuffer:PRESENT->RT
(end)     backbuffer:RT->PRESENT
```

Let us read the output step by step.

**Culling.** The walk starts from `backbuffer`, finds `tonemap`, then its inputs `taa_out` and `bloom`, and so on back to `shadow` and `gbuffer`. Nobody reads `debug_view`, so `debug_normals` is never reached and is culled, and `debug_view` is never allocated (Figure 4). A debug overlay or an optional effect costs nothing when nothing consumes it. Turning SSAO off is a one-line change in the setup code, not a change to the lighting pass.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-graph-dag.svg" caption="The example frame as a DAG of passes; edge labels name the resources that flow along them. The compiler walks backwards from backbuffer. debug_normals produces debug_view, which nobody reads, so it is culled (dashed) along with its output." %}

**Lifetimes.** A transient resource is alive from the first pass that touches it to the last (Figure 5, left). `shadow_map` is written in pass 0 and last read by lighting in pass 3. `depth` lives until pass 4, because TAA reprojects with it.

**Aliasing.** Two resources may share memory if their lifetimes do not overlap. The allocator takes resources from largest to smallest and puts each at the lowest offset that does not collide, in both time and address range, with what is already placed. Follow `taa_out` (16 MB, alive in passes 4-6): the only placed resource alive at the same time is `hdr` at [16, 32), so offset 0 is free, and `taa_out` reuses the memory of `shadow_map`, which died after pass 3. Likewise `bloom` lands in the old `hdr` range. The heap needs 58 MB instead of 78 MB, and 58 MB is optimal here: during lighting (pass 3), six resources totaling 16 + 8 + 8 + 8 + 2 + 16 = 58 MB are alive at once (Figure 5, right). Real frames have many more short-lived targets, and engines report savings of a third or more of render-target memory.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-lifetimes-aliasing.svg" caption="Output of compile_graph. Left: lifetime of every transient resource across the seven executed passes, with its size. Right: where each resource lives in the transient heap (y: memory offset, x: its lifetime). taa_out reuses shadow_map's bytes and bloom reuses part of hdr's, so the heap is 58 MB instead of 78 MB; the dashed line is the heap size." %}

Aliasing has one subtlety: when `taa_out` takes over `shadow_map`'s bytes, the new resource's contents are garbage, and on real APIs the memory needs an **aliasing barrier** (D3D12) or an initial layout transition from `UNDEFINED` (Vulkan), plus a clear or a full overwrite before any read. Our `UNDEFINED->RT` transition stands for exactly that.

**Barriers.** The compiler knows every use, so it emits the 18 transitions shown, each at the latest possible point and covering exactly the stages involved. These are the red ticks of Figure 3. Real compilers also batch the barriers of one pass into a single API call, and they use **split barriers** (begin the transition early, end it just before the use) so that the GPU has time to do the work.

**Async compute.** Passes with no dependency between them can run concurrently. In our graph, `ssao` (compute-friendly) depends only on `gbuffer`, so a compiler could schedule it on the **compute queue** while the graphics queue rasterizes the shadow map. Cross-queue edges become semaphores. Async compute pays off when the two workloads stress different units (shadow rasterization is bound by fixed-function hardware, SSAO by ALU and bandwidth).

### Try it

{% include widget.liquid name="graphics-engine-render-graph" height="560" caption="The same compiler running in your browser. Tap a pass to switch it off (switching off taa makes bloom and tonemap read hdr directly). Tick the box to make debug_view an output and watch debug_normals come back and gbuf_normal live longer. The left chart shows lifetimes, the right chart the aliased heap (red dashed line). The top line compares heap size with and without aliasing and counts barriers." %}

A few experiments. Turn on the debug output: `gbuf_normal` now lives one pass longer and `debug_view` needs 8 MB, so the unaliased total grows from 78 to 86 MB, yet the heap stays at 58 MB, because `debug_view` slots into the bytes `shadow_map` released. Switch off `shadow`: `taa_out` must find new memory, but the heap shrinks to 42 MB because the peak at lighting drops. Switch off `tonemap`: everything is culled, because nothing reaches the screen.

## 5. Lighting architectures: forward, deferred, tiled, clustered

The render graph is the skeleton; the lighting architecture decides which passes it contains. The question is how to evaluate many lights efficiently. Write $N_\text{obj}$ for the number of objects, $N_L$ for the number of lights and $P$ for the number of pixels. The shading mathematics behind each light evaluation is in [graphics 04]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}) and [graphics 11]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }}).

**Forward rendering.** Each object is drawn once with a shader that loops over the lights affecting it. The cost is roughly (shaded fragments) × $N_L$, and **overdraw** (fragments shaded and then hidden by nearer ones) wastes work. Forward handles transparency and MSAA naturally.

**Deferred shading.** First draw all geometry once into a **G-buffer**, a set of screen-sized textures holding the surface attributes per pixel (albedo, normal, roughness, depth). Then shade every pixel once, in a full-screen pass, by looping over the lights (Deering et al. 1988 and Saito and Takahashi 1990 introduced the idea; the latter coined the term G-buffer). Shading is decoupled from geometry complexity and overdraw, at the cost of memory bandwidth (Figure 7), no hardware MSAA, and a separate forward pass for transparent objects.

**Tiled shading.** Looping over all $N_L$ lights per pixel is still wasteful when most lights are small. Divide the screen into tiles (for example 16 × 16 pixels). In a compute pass, each tile builds a list of the lights whose bounding sphere overlaps the tile's sub-frustum, and pixels loop over their tile's list only. **Forward+** (Harada, McKee and Yang, 2012) uses the same per-tile light lists in a forward pass, after a depth prepass.

**Clustered shading.** A 2D tile spans the full depth range, so a tile containing both a near character and a distant wall collects the lights of both. **Clustered shading** (Olsson, Billeter and Assarsson, HPG 2012) also subdivides depth, into 3D cells called **clusters** or **froxels** (frustum voxels). Depth slices are spaced exponentially, because perspective makes distant slices cover more space:

$$
z_k = z_\text{near} \left(\frac{z_\text{far}}{z_\text{near}}\right)^{k/S}, \qquad
k(z) = \left\lfloor S\, \frac{\ln(z / z_\text{near})}{\ln(z_\text{far}/z_\text{near})} \right\rfloor ,
$$

where $S$ is the number of slices and $k(z)$ is the slice of a fragment at view depth $z$. With $z_\text{near} = 0.5$, $z_\text{far} = 50$ and $S = 12$, the ratio is 100. A fragment at $z = 5$ falls in slice $k = \lfloor 12 \cdot \ln 10 / \ln 100 \rfloor = 6$, which spans $z \in [5, 7.34]$. Each fragment computes its cluster from its tile and its depth, and loops over that cluster's light list.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-clustered-lights.svg" caption="Clustered light assignment computed for 48 random point lights (blue circles) in a top-down view of the frustum: 8 screen columns times 12 exponential depth slices, each cell colored by the number of lights that overlap it. Right: average number of lights a pixel must evaluate for 4000 random surface points, with 2D tiles (every light anywhere in the column) versus 3D clusters (only lights near that depth)." %}

Figure 6 shows the effect, computed on toy data: the per-column (tiled) lists contain every light along the whole depth range, while clusters keep only lights near the surface. The light-assignment pass is a compute shader over the clusters, and the lists live in a compact buffer of indices. Clustered shading works with both forward and deferred pipelines, and many current engines use a clustered forward or deferred path.

### The visibility buffer

The G-buffer stores *attributes*, which costs bandwidth and must be redesigned whenever the material model changes. The **visibility buffer** (Burns and Hunt, JCGT 2013) stores only *which triangle* covers each pixel: a 32-bit ID (triangle and instance) plus depth. A later pass fetches the triangle's three vertices, recomputes the barycentric coordinates of the pixel analytically, interpolates the attributes and shades. The screen-sized buffers shrink (Figure 7), geometry is rasterized only once with a trivial shader, and the attribute fetch happens only for visible pixels. Unreal Engine 5's Nanite rasterizes into a 64-bit visibility buffer (depth plus cluster and triangle IDs), described in "Nanite: A Deep Dive" (Karis, Stubbe and Wihlidal, SIGGRAPH 2021).

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-gbuffer-bytes.svg" caption="Left: bytes per pixel of the screen-sized targets in three typical layouts (an illustrative layout: 32-bit depth, 8-bit RGBA or 10-bit packed attributes, 16-bit float HDR color). Right: the resulting memory per frame at three resolutions, before MSAA. The visibility buffer replaces albedo, normal and material channels with one 32-bit triangle and instance ID." %}

## 6. GPU-driven rendering

In a classic renderer, the CPU walks the scene, culls objects and issues one draw call per object and material. With hundreds of thousands of objects, the CPU becomes the bottleneck. **GPU-driven rendering** moves culling and draw generation to the GPU. Haar and Aaltonen ("GPU-Driven Rendering Pipelines", SIGGRAPH 2015 Advances in Real-Time Rendering) and Wihlidal ("Optimizing the Graphics Pipeline with Compute", GDC 2016) laid out the now-standard design:

1. All mesh data lives in a few large buffers, all materials are bindless (Section 1), and every instance has a record in a GPU buffer.
2. A compute shader tests each instance, or each **cluster** of about 64-128 triangles, against the frustum and against occlusion, and appends the survivors' draw arguments to a buffer.
3. An **indirect draw** (`DrawIndexedInstancedIndirect`, `vkCmdDrawIndexedIndirectCount`, WebGPU's `drawIndexedIndirect`) reads the arguments from that buffer. The CPU issues a handful of calls per frame regardless of scene size.

### Occlusion culling with a hierarchical Z-buffer

Frustum culling removes what is outside the view, but in a city most objects inside the frustum are hidden behind buildings. The **hierarchical Z-buffer** (HZB; Greene, Kass and Miller, SIGGRAPH 1993) makes occlusion tests cheap. Build a mip chain of the depth buffer in which each texel of level $\ell + 1$ stores the **maximum** (farthest) depth of the $2 \times 2$ texels below it:

$$
H_{\ell+1}(x, y) = \max\{ H_\ell(2x, 2y),\ H_\ell(2x+1, 2y),\ H_\ell(2x, 2y+1),\ H_\ell(2x+1, 2y+1) \} .
$$

To test an object, project its bounding box to a screen rectangle of $w \times h$ pixels with nearest depth $z_\text{min}$. Choose the level $\ell = \lceil \log_2 \max(w, h) \rceil$, at which the rectangle covers at most $2 \times 2$ texels, and read those texels. If $z_\text{min} > \max H_\ell$, every pixel under the box already holds something nearer, so the object is hidden. For a $10 \times 6$ pixel box, $\ell = \lceil \log_2 10 \rceil = 4$: four reads of texels that each summarize $16 \times 16$ pixels. The test is **conservative**: it may keep a hidden object (the max over a coarse texel is pessimistic) but never culls a visible one, as Figure 8 shows.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-hzb-culling.svg" caption="HZB occlusion culling on a toy 64 × 64 depth buffer (black = near occluders, white = far plane) with 60 random boxes, each tested with at most four reads at the level the formula picks. Red: culled by the HZB test. Orange: actually hidden but kept, because the coarse texels also cover background. Green: visible. Right: mip levels 1-6 of the max-depth pyramid. The script asserts that no visible box is culled." %}

{% include widget.liquid name="graphics-engine-hzb" height="470" caption="The HZB test on the same depth buffer. Drag the box and change its size and nearest depth z_min. Blue dashed squares are the texels read at the chosen level L (also shown on the small mip image). Red: culled. Orange: actually hidden but kept (conservative). Green: drawn and visible. Make the box straddle an occluder edge to see why the test must stay conservative." %}

Which depth buffer do you test against, when this frame's depth does not exist yet? The usual answer is **two-phase occlusion culling**: draw the objects that were visible last frame, build the HZB from that depth, test everything else against it, draw the newly visible objects, and update the visibility list for the next frame.

### Meshlets and mesh shaders

GPU-driven pipelines cull at the granularity of **meshlets**: small clusters of triangles (typically up to 64 vertices and 124 or 126 triangles) with their own bounding sphere and normal cone. A meshlet facing away from the camera, outside the frustum or occluded is skipped without touching its triangles. Figure 9 partitions a torus with a greedy builder that grows each meshlet over edge-adjacent triangles until it hits the vertex or triangle limit, a simplified version of the greedy strategy behind meshlet builders such as the one in the meshoptimizer library.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-meshlets.svg" caption="Greedy meshlet partition of a 2304-triangle torus with limits of 64 vertices and 124 triangles (one color per meshlet). Right: triangles and vertices per meshlet, sorted; the dashed lines are the limits. Most meshlets hit the vertex limit first, because a compact patch of a regular grid shares each vertex among about six triangles." %}

**Mesh shaders** make meshlets a first-class part of the pipeline. They replace the fixed vertex-fetch and vertex-shader stages with two compute-like stages: a **task** (amplification) shader that culls meshlets and decides how many mesh shader groups to launch, and a **mesh** shader that outputs a small batch of vertices and triangles directly to the rasterizer. They appeared with NVIDIA's Turing GPUs in 2018, became part of DirectX 12 Ultimate in 2020, and were standardized across vendors in Vulkan as `VK_EXT_mesh_shader` in August 2022; Metal 3 has them too. Nanite goes one step further: it rasterizes small triangles in a compute shader (a software rasterizer), because tiny triangles waste the hardware rasterizer's quad-based work.

### Work graphs

Indirect draws let the GPU choose *how much* work to do, but not *what kind*: the pipeline is still fixed by the CPU. **D3D12 work graphs**, released in March 2024 (Agility SDK 1.613), let shaders launch other shaders. Nodes in a graph produce records that feed other nodes, with the scheduling and memory handled by the driver. A culling node can directly launch the shading work for each material, for example. **Mesh nodes**, which let a work graph drive mesh-shader draws, were introduced in a preview Agility SDK (1.715); check the current status before relying on them.

## 7. Debugging and profiling

A GPU bug rarely crashes. It renders black, or flickers, or is slow. The tools:

- **RenderDoc** (free, open source; Vulkan, D3D11/12, OpenGL): captures one frame and lets you step through every call, inspect every texture and buffer at every point, see the pipeline state, and debug a shader for one pixel. It should be the first tool you install.
- **PIX on Windows** (Microsoft, for D3D12): frame captures plus timing captures that show the CPU and GPU timelines together, including queue overlap.
- **NVIDIA Nsight Graphics**, **AMD Radeon GPU Profiler** and the Xcode Metal debugger expose hardware counters such as occupancy, cache hit rates and which units are the bottleneck.
- **Validation layers**: Vulkan's validation layers (including synchronization validation) and the D3D12 debug layer catch API misuse early. Leave them on during development.

To measure inside your own engine, use **GPU timestamp queries**. You write a timestamp before and after each pass, resolve the queries into a buffer, and read it back a frame or two later, so as not to stall. The difference times the timestamp period is the GPU time of the pass (`vkCmdWriteTimestamp`; D3D12 `EndQuery` with a timestamp query heap; WebGPU's optional `"timestamp-query"` feature with `timestampWrites` on a pass). A render graph is the natural place for this: it wraps every pass with timestamps and a debug label automatically, so captures in RenderDoc or PIX show your pass names.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Deering et al., *The Triangle Processor and Normal Vector Shader: A VLSI System for High Performance Graphics* | SIGGRAPH | 1988 | [DOI](https://doi.org/10.1145/54852.378468) | Early hardware deferred shading |
| Saito & Takahashi, *Comprehensible Rendering of 3-D Shapes* | SIGGRAPH | 1990 | [DOI](https://doi.org/10.1145/97880.97901) | Introduced the G-buffer |
| Greene, Kass & Miller, *Hierarchical Z-Buffer Visibility* | SIGGRAPH | 1993 | [DOI](https://doi.org/10.1145/166117.166147) | The depth pyramid behind HZB occlusion culling |
| Harada, McKee & Yang, *Forward+: Bringing Deferred Lighting to the Next Level* | Eurographics (short papers) | 2012 | [DOI](https://doi.org/10.2312/conf/EG2012/short/005-008) | Tiled light lists in a forward renderer |
| Olsson, Billeter & Assarsson, *Clustered Deferred and Forward Shading* | HPG | 2012 | [DOI](https://doi.org/10.2312/EGGH/HPG12/087-096) | 3D light clusters; the basis of most current light culling |
| Burns & Hunt, *The Visibility Buffer: A Cache-Friendly Approach to Deferred Shading* | JCGT 2(2) | 2013 | [JCGT](https://jcgt.org/published/0002/02/04/) | Store triangle IDs instead of attributes |
| Haar & Aaltonen, *GPU-Driven Rendering Pipelines* | SIGGRAPH Advances in Real-Time Rendering | 2015 | [course page](https://advances.realtimerendering.com/s2015/index.html) | GPU culling, clusters and indirect draws in production |
| Wihlidal, *Optimizing the Graphics Pipeline with Compute* | GDC | 2016 | [GDC Vault](https://gdcvault.com/play/1023109) | Compute-based cluster and triangle culling |
| O'Donnell, *FrameGraph: Extensible Rendering Architecture in Frostbite* | GDC | 2017 | [GDC Vault](https://www.gdcvault.com/play/1024612) | The render-graph design used by modern engines |
| Karis, Stubbe & Wihlidal, *Nanite: A Deep Dive* | SIGGRAPH Advances in Real-Time Rendering | 2021 | [course page](https://advances.realtimerendering.com/s2021/index.html) | Cluster hierarchies, visibility buffer, software rasterization |

## Learning resources

- *Real-Time Rendering*, 4th ed. ([realtimerendering.com](https://www.realtimerendering.com/)), chapters on the graphics pipeline, efficient shading (tiled and clustered) and acceleration algorithms.
- [WebGPU Fundamentals](https://webgpufundamentals.org/) for WebGPU from scratch; [Learn Wgpu](https://sotrh.github.io/learn-wgpu/) for the same API in Rust; [vkguide.dev](https://vkguide.dev/) for a modern Vulkan engine tutorial.
- Hans-Kristian Arntzen, ["Render graphs and Vulkan: a deep dive"](https://themaister.net/blog/2017/08/15/render-graphs-and-vulkan-a-deep-dive/) (2017): a detailed account of implementing a render graph, barriers and async compute.
- Engine documentation: Unreal's [Render Dependency Graph](https://dev.epicgames.com/documentation/en-us/unreal-engine/render-dependency-graph-in-unreal-engine) and Unity's [render graph system in URP](https://docs.unity.com/en-us/engine/6000.0/manual/render-pipelines/universal-render-pipeline/customizing-urp/render-graph).
- Code: [meshoptimizer](https://github.com/zeux/meshoptimizer) (meshlet building and mesh optimization) and [niagara](https://github.com/zeux/niagara) (a small GPU-driven Vulkan renderer with meshlets and occlusion culling, built on stream by Arseny Kapoulkine).
- GAMES104 lectures on the rendering system and the [Piccolo](https://github.com/BoomingTech/Piccolo) engine's render passes.
- Tools: [RenderDoc](https://renderdoc.org/), [PIX](https://devblogs.microsoft.com/pix/), [Nsight Graphics](https://developer.nvidia.com/nsight-graphics).

## Exercises

1. Extend `compile_graph` so that a pass may write a resource it also reads (a read-modify-write, such as transparent objects drawn into `hdr` after lighting). How must the culling and the lifetimes change? Hint: model the write as a new *version* of the resource (`hdr#1`).
2. Replace the aliasing allocator's "largest first" order with "first-used first" and compare the heap size on the example graph and on a random graph of 30 passes. When does each order win?
3. Add a queue field to `Pass` (`"graphics"` or `"compute"`) and compute which barriers become cross-queue semaphores. Put `ssao` on the compute queue.
4. In the clustered-lighting formula, derive the slice index for $z = 20$ with the parameters of the text, and the depth range of that slice. Why are exponential slices better than uniform ones for perspective projection?
5. Modify the WebGPU example to draw 10,000 triangles with a single `draw(3, 10000)` call, using `@builtin(instance_index)` to offset each one. Then measure the frame's GPU time with the `timestamp-query` feature, if your browser exposes it.

<details markdown="1"><summary>Hint</summary>

1. Each write creates a new version node; readers depend on a specific version, so culling and ordering work on versions while memory is assigned per physical resource.
2. Largest-first is a classic heuristic for packing; first-used-first tends to work better when lifetimes are short and sizes are similar.
4. $k = \lfloor 12 \ln 40 / \ln 100 \rfloor = \lfloor 9.61 \rfloor = 9$, slice $[0.5 \cdot 100^{9/12}, 0.5 \cdot 100^{10/12}] = [15.8, 23.2]$. Exponential slices make every cluster roughly as deep as it is wide.

</details>

Next: [post 03]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }}) builds a complete mini engine on WebGPU, with a render graph, glTF assets, PBR materials and shadows.
