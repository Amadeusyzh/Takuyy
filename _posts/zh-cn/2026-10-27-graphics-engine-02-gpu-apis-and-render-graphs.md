---
layout: post
title: "现代 GPU API 与渲染图"
date: 2026-10-27 13:02:00+0900
description: "引擎如何与 GPU 打交道：显式 API（Vulkan、D3D12、Metal、WebGPU）、内存与同步、一个最小的 WebGPU 程序、带可运行玩具编译器的渲染图、前向/延迟/分簇光照、可见性缓冲、带 HZB 剔除和 meshlet 的 GPU 驱动渲染，以及 GPU 调试。"
categories: graphics-engine
tags: [vulkan, d3d12, webgpu, render-graph, frame-graph, clustered-shading, visibility-buffer, gpu-driven, mesh-shaders]
series: graphics-engine
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第 01 篇]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})在引擎分层图中把渲染器画成了一个方框。本篇打开这个方框。现代渲染器是一个调度者：它为几十个 pass 录制命令，同时让几帧处于“在途”状态，准确地告诉 GPU 每张纹理何时从“被写入”变为“被读取”，并把短命的纹理打包到共享内存中。在今天的 GPU API 中这一切都是显式的，而**渲染图**（render graph）正是引擎驾驭这些复杂性的方法。渲染数学（BRDF、阴影、全局光照）属于图形学系列，例如[图形学 04]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})和[图形学 11]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})；这里关心的是运行这些数学的机制。

## 前置知识

- 光栅化管线：顶点着色器、光栅化器、片元着色器、深度测试（[图形学 02]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})）。
- [第 01 篇]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})第 3 节中的帧流水线与在途帧。
- 读懂 WebGPU 示例需要一点 JavaScript，渲染图编译器用 Python。

## 1. 从 OpenGL 状态机到显式 API

### OpenGL 的问题在哪里

OpenGL（以及 Direct3D 11）把 GPU 呈现为一个**全局状态机**（state machine）。你绑定纹理、设置混合模式、绑定着色器，然后调用绘制，剩下的由驱动推断。这很方便，但驱动只能去猜：它在每次绘制时校验全部状态，在第一次遇到新的状态组合时才延迟编译着色器变体（导致游戏中途卡顿），追踪每个资源以插入隐藏的同步，而且由于状态是全局的，只能在一个线程上录制命令。

**显式 API**（explicit API）把这些工作交给了解自己这一帧的应用程序：Direct3D 12（2015）、Vulkan（1.0 于 2016 年 2 月发布）、Apple 的 Metal（2014），以及面向 Web 的 **WebGPU**（2023 年在 Chrome 113 中发布，2025 年在 Windows 版 Firefox 141 和 Safari 26 中发布；截至 2026 年秋，W3C 规范处于候选推荐草案阶段）。它们在命名和细节上各不相同，但共享同一套对象模型（图 1）。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-api-objects.svg" caption="显式 API 共有的对象模型（采用 Vulkan / D3D12 / WebGPU 的命名）。设备创建一切；管线由着色器模块和布局构建；bind group（描述符集）指向存放在内存堆中的缓冲和纹理；命令缓冲被录制后提交到队列；栅栏、信号量和查询用来观察 GPU 时间线。" %}

### 各个对象

- **实例、适配器、设备。** 实例（instance）是与 API 的连接；适配器（adapter，Vulkan 中为 physical device）代表一块 GPU；逻辑**设备**（device）是你创建其他一切对象的句柄。
- **队列**（queue）。GPU 提供不同类型的队列：图形、计算和拷贝（传输）。提交到不同队列的工作可以重叠执行，这是**异步计算**（async compute，第 4 节）的基础。
- **命令缓冲**（command buffer）。命令不是立即发出的，而是先**录制**到命令缓冲（WebGPU 中为 command encoder）中，再把录好的缓冲**提交**到队列。录制只在 CPU 上进行，可以在多个线程上同时进行，每个线程一个命令缓冲。这是显式 API 能在多核 CPU 上扩展的主要原因。
- **管线状态对象**（pipeline state object，PSO）。所有影响着色器编译的状态（着色器、顶点布局、混合、深度测试、渲染目标格式）被烘焙进一个提前创建的不可变对象中。驱动只在加载时编译一次，而不是在帧中间。代价是 PSO 的数量会组合爆炸，因此引擎会缓存它们并在加载期间预编译。
- **以中间代码形式存在的着色器。** 着色器离线编译成中间表示：Vulkan 用 **SPIR-V**，D3D12 用 **DXIL**，Metal 用 Metal 库。WebGPU 接受 **WGSL** 源码，由浏览器翻译给底层原生 API。引擎通常只写一遍 HLSL 或 Slang，再交叉编译。
- **描述符与 bind group。** 着色器通过绑定槽引用资源。**描述符**（descriptor）是填入槽位的一条小记录（“纹理 X，作为采样图像”）。描述符被组织成**描述符集**（descriptor set，Vulkan）、**描述符堆**（descriptor heap）中的**描述符表**（descriptor table，D3D12），或 **bind group**（WebGPU），它们的形状由布局（Vulkan 的 pipeline layout、D3D12 的 root signature）固定。
- **无绑定**（bindless）。每次绘制都重新绑定描述符集会消耗 CPU 时间并限制合批。使用**无绑定**资源时，场景的所有纹理都放在一个巨大的描述符数组中，着色器用从缓冲中读出的整数去索引它：`textures[material.albedo_index]`。Vulkan 通过 descriptor indexing（1.2 起成为核心功能）和 descriptor buffer 提供这一能力；D3D12 通过 Shader Model 6.6 的直接堆索引提供。无绑定让 GPU 驱动渲染（第 6 节）成为可能，因为 GPU 自己就能选择材质，无需 CPU 绑定任何东西。它不在 WebGPU 1.0 的核心功能中。

## 2. 内存与同步

### 内存

在显式 API 中，你需要自己分配**内存堆**（memory heap），再把缓冲和纹理放进去。设备本地内存对 GPU 很快；主机可见内存可以被 CPU 写入（用于上传和逐帧常量）。为每个资源单独分配一个堆既慢又会造成碎片，所以引擎使用子分配器（例如 AMD 的 Vulkan Memory Allocator 和 D3D12 Memory Allocator 库），对于短命的渲染目标则使用**瞬态堆**（transient heap），让同一帧内的多张纹理复用同一块内存（**别名**，aliasing，第 4 节）。

### 冒险与屏障

GPU 是一台深度流水线化、大规模并行的机器。如果 pass A 写一张纹理而 pass B 读它，没有任何东西能保证 B 开始时 A 的写入已经完成，或者已经离开缓存。这就是**写后读冒险**（read-after-write hazard）。应用程序必须插入一个**屏障**（barrier），它表达的是：“等前面这些阶段写完，让写入可见，并把纹理转换成下一次使用所需的布局”。Vulkan 用源与目标**管线阶段**（pipeline stage）、**访问掩码**（access mask）和图像**布局**（layout）转换来表达屏障；D3D12 用**资源状态**（resource state）转换来表达（例如从 `RENDER_TARGET` 到 `PIXEL_SHADER_RESOURCE`），或使用风格类似 Vulkan 的新式 enhanced barriers。

把每张纹理想象成一个小状态机会很有帮助。在图 3 中，每一行是延迟渲染器中的一张纹理，每一列是一个 pass，颜色是该纹理在这个 pass 期间必须处于的状态。每次颜色变化都需要一个屏障（红色竖线）。这张图由第 4 节的玩具编译器生成，它会自动插入屏障。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-barrier-states.svg" caption="示例帧中各 pass 的资源状态（行：纹理，列：实际执行的 pass，R/W：该 pass 读或写）。橙色：渲染目标；灰蓝色：深度写入；绿色：着色器读取（SRV）；紫色：呈现。红色竖线表示该 pass 之前的屏障。例如 depth 由 gbuffer 写入，随后被 ssao、lighting 和 taa 读取，因此恰好需要一次从 DEPTH_WRITE 到 SRV 的转换。" %}

### CPU-GPU 同步：栅栏、信号量与在途帧

屏障负责 GPU *内部*的顺序。另外两种原语连接不同的时间线：

- **栅栏**（fence）让 CPU 等待 GPU：一次提交完成时，队列发出栅栏信号。（Vulkan 还有**时间线信号量**（timeline semaphore），即一个单调递增的 64 位计数器；D3D12 的栅栏也是这样工作的。）
- **信号量**（semaphore）负责*队列之间*或与交换链之间的顺序，例如“在呈现引擎释放交换链图像之前，不要开始往里渲染”。

CPU 想在 GPU 渲染第 $N$ 帧时录制第 $N+1$ 帧。但第 $N+1$ 帧使用自己的 uniform 缓冲和命令缓冲，并且绝不能覆写 GPU 仍在读取的那一帧的数据。因此引擎为所有逐帧数据保留 $F$ 份副本（**在途帧**，frames in flight），在复用第 $i \bmod F$ 份副本之前，等待第 $i - F$ 帧的栅栏。图 2 模拟了 CPU 每帧需要 9 ms、GPU 需要 12 ms 的情形：

- $F = 1$ 时两个处理器轮流工作：每帧 $9 + 12 = 21$ ms。
- $F = 2$ 时 GPU 从不空闲。帧时间降到 $\max(9, 12) = 12$ ms，CPU 每帧在栅栏上稍作等待：引擎处于 **GPU 瓶颈**。
- $F = 3$ 时吞吐量仍为 12 ms，但每帧从 CPU 开始工作到 GPU 完成需要 36 ms，而 $F = 2$ 时是 24 ms。更多的在途帧换来对尖峰的容忍度，代价是延迟。通常取两到三帧。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-frames-in-flight.svg" caption="一帧、两帧和三帧在途时的 CPU（上轨）与 GPU（下轨），CPU 每帧 9 ms、GPU 每帧 12 ms；数字是帧序号，斜线框是 CPU 等待栅栏的时间。每个子图的标题给出稳态帧时间，以及最后一帧从 CPU 开始到 GPU 完成的时间。" %}

### 常见的同步错误

1. **缺少屏障。** 读取看到的是陈旧或写了一半的数据。在一块 GPU 上可能正常，在另一块上就闪烁。验证层（Vulkan 的同步验证、D3D12 的基于 GPU 的验证）能发现其中很多问题。
2. **覆写在途数据。** 把本帧的常量写进 GPU 仍在为上一帧读取的缓冲中。症状：物体在两个位置之间抖动。
3. **过度同步。** 到处使用“所有阶段、所有内存”的屏障，或每帧调用一次 `vkDeviceWaitIdle`。结果正确但很慢，因为它排空了 GPU 流水线。
4. **布局错误。** 采样仍处于渲染目标布局的纹理；在某些硬件上这会把压缩数据当成垃圾读出来。
5. **死锁。** 等待一个永远不会被触发的栅栏，例如因为负责触发它的那次提交失败了。

渲染图（第 4 节）存在的很大一部分理由，就是从结构上杜绝第 1、3、4 类错误。

## 3. 一个最小的 WebGPU 程序

WebGPU 在浏览器中运行，所以它是接触显式 API 最快的途径。下面的页面绘制一个旋转的三角形，旋转角来自一个 uniform 缓冲。把它保存为 `index.html`，在支持 WebGPU 的浏览器中打开；在某些系统上需要通过 `http://localhost` 提供页面，而不是直接打开文件。

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

逐行说明：

1. **适配器。** `requestAdapter` 选择一块物理 GPU。在有两块 GPU 的笔记本上可以传入 `{ powerPreference: "high-performance" }`。
2. **设备。** 所有资源都属于设备。可选特性（例如第 7 节的 `"timestamp-query"`）在这里申请。
3. **交换链。** `context.configure` 把 canvas 与设备连接起来。每帧 `getCurrentTexture()` 返回要渲染进去的图像，也就是 Vulkan 中的交换链图像。
4. **着色器。** 顶点着色器不需要顶点缓冲：它用内建的 `vertex_index` 索引一个常量数组，并按 `u.time` 旋转该点。结构体被填充到 16 字节，因为 uniform 缓冲有对齐规则。
5. **管线。** `layout: "auto"` 让 WebGPU 从着色器推导 bind group 布局。真实引擎会显式声明布局，以便多个管线共享 bind group。
6. **uniform 缓冲。** `COPY_DST` 允许通过 `queue.writeBuffer` 上传。WebGPU 替你解决了第 2 节的在途帧问题：`writeBuffer` 在队列上是有序的，因此不会覆写之前的提交仍在使用的数据。
7. **bind group。** 它把缓冲绑定到 `@group(0) @binding(0)`。
8. **录制。** 渲染 pass 声明它的附件以及如何处理它们：`loadOp: "clear"`（不加载旧内容）和 `storeOp: "store"`（保留结果）。这些标志对基于 tile 的移动 GPU 非常重要，它们因此可以省去内存流量。
9. **提交。** 只有 `submit` 才把工作送到 GPU。WebGPU 会自己插入屏障，因为它按 pass 追踪资源的使用，所以代码中一个屏障也没有。Vulkan 和 D3D12 则把这件事留给你。

接下来的步骤是：顶点缓冲、深度纹理、放在 uniform 缓冲中的相机矩阵，以及第二个 pass。[第 03 篇]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})正是在这个基础上构建一个完整的迷你引擎：glTF 加载、PBR、阴影和 ECS。

## 4. 渲染图（帧图）

### 问题

一个现代帧有 20 到 100 个 pass：阴影贴图、深度预通道、G-buffer、SSAO、光照、透明物体、体积效果、TAA、泛光、色调映射、UI。每个 pass 都读写纹理。如果手写，每个 pass 都得知道该发出哪些屏障，每张纹理即使只用于一个 pass 也要为整帧分配，而关闭一个功能（例如低画质下关闭 SSAO）意味着要在好几处修改代码。

### 思路

Yuriy O'Donnell 在 GDC 2017 的演讲《FrameGraph: Extensible Rendering Architecture in Frostbite》提出了如今大多数引擎采用的设计。Unreal Engine 有 **Render Dependency Graph（RDG）**，Unity 的 URP 和 HDRP 使用 **RenderGraph**。一帧分三个阶段构建：

1. **设置**（setup）。每个 pass *声明*它读写的资源，并只通过描述（格式和尺寸）创建瞬态资源，不分配内存。
2. **编译**（compile）。把整张图（由资源连接起来的 pass 组成的 DAG）作为一个整体分析：**剔除**无用的 pass，对 pass 排序，计算每个资源的**生命周期**，用**别名**分配内存，并根据声明的用途推导出**屏障**。
3. **执行**（execute）。按顺序运行各 pass 的录制回调，并绑定真实资源。

由于整帧在执行任何东西之前就已知，编译器可以做出任何单个 pass 都做不到的全局决策。

### 一个玩具帧图编译器

下面是一个约 60 行的完整 Python 编译器。这一帧是一个延迟渲染器：阴影贴图、G-buffer（深度、反照率、法线）、SSAO、渲染到 HDR 目标的光照、一个可视化法线的调试 pass、TAA、泛光，以及输出到交换链图像的色调映射（`backbuffer`，一个**导入**（imported）资源，不归渲染图所有）。尺寸单位为 MB，大致相当于每个目标在 1080p 下的开销。

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

我们一步步解读输出。

**剔除。** 遍历从 `backbuffer` 开始，找到 `tonemap`，再找到它的输入 `taa_out` 和 `bloom`，如此一路回溯到 `shadow` 和 `gbuffer`。没有人读取 `debug_view`，所以 `debug_normals` 永远不会被访问到而被剔除，`debug_view` 也从不分配（图 4）。只要没有消费者，调试叠加层或可选特效就不花任何代价。关闭 SSAO 只需在设置代码中改一行，而不必修改光照 pass。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-graph-dag.svg" caption="示例帧画成 pass 的 DAG；边上的标签是沿边流动的资源。编译器从 backbuffer 向后遍历。debug_normals 产生没有人读取的 debug_view，因此它和它的输出一起被剔除（虚线）。" %}

**生命周期。** 一个瞬态资源从第一个使用它的 pass 存活到最后一个（图 5 左）。`shadow_map` 在 pass 0 中写入，最后一次被 pass 3 的 lighting 读取。`depth` 一直存活到 pass 4，因为 TAA 要用它做重投影。

**别名。** 生命周期不重叠的两个资源可以共享内存。分配器按从大到小的顺序处理资源，把每个资源放在既不在时间上、也不在地址范围上与已放置资源冲突的最低偏移处。跟踪一下 `taa_out`（16 MB，存活于 pass 4-6）：与它同时存活的已放置资源只有位于 [16, 32) 的 `hdr`，因此偏移 0 是空闲的，`taa_out` 复用了在 pass 3 之后死亡的 `shadow_map` 的内存。同样，`bloom` 落在原来 `hdr` 的范围里。堆只需要 58 MB 而不是 78 MB，而 58 MB 在这里是最优的：在 lighting（pass 3）期间，有六个资源同时存活，合计 16 + 8 + 8 + 8 + 2 + 16 = 58 MB（图 5 右）。真实的帧有多得多的短命目标，引擎报告的节省可达渲染目标内存的三分之一甚至更多。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-lifetimes-aliasing.svg" caption="compile_graph 的输出。左：每个瞬态资源在七个实际执行的 pass 中的生命周期及其大小。右：每个资源在瞬态堆中的位置（纵轴：内存偏移，横轴：生命周期）。taa_out 复用了 shadow_map 的字节，bloom 复用了 hdr 的一部分，所以堆是 58 MB 而不是 78 MB；虚线为堆大小。" %}

别名有一个微妙之处：当 `taa_out` 接管 `shadow_map` 的字节时，新资源的内容是垃圾数据。在真实 API 中，这块内存需要一个**别名屏障**（aliasing barrier，D3D12）或一次从 `UNDEFINED` 出发的初始布局转换（Vulkan），并且在任何读取之前要先清除或完全覆写。我们的 `UNDEFINED->RT` 转换代表的正是这件事。

**屏障。** 编译器知道每一次使用，所以它发出上面所示的 18 个转换，每个都位于尽可能晚的时刻，并且只覆盖涉及的阶段。它们就是图 3 中的红色竖线。真实的编译器还会把一个 pass 的屏障合并成一次 API 调用，并使用**拆分屏障**（split barrier：提前开始转换，在使用前才结束），让 GPU 有时间完成转换工作。

**异步计算。** 彼此没有依赖的 pass 可以并发执行。在我们的图中，`ssao`（适合计算着色器）只依赖 `gbuffer`，因此编译器可以把它调度到**计算队列**上，同时让图形队列光栅化阴影贴图。跨队列的边变成信号量。当两种工作负载压在不同的硬件单元上时（阴影光栅化受固定功能硬件限制，SSAO 受 ALU 和带宽限制），异步计算才有收益。

### 动手试试

{% include widget.liquid name="graphics-engine-render-graph" height="560" caption="同一个编译器在你的浏览器中运行。点击一个 pass 可将其关闭（关闭 taa 后，bloom 和 tonemap 直接读取 hdr）。勾选复选框把 debug_view 设为输出，观察 debug_normals 回来、gbuf_normal 存活得更久。左图显示生命周期，右图显示别名后的堆（红色虚线）。顶部一行对比有无别名时的堆大小，并统计屏障数量。" %}

几个实验。打开调试输出：`gbuf_normal` 多存活一个 pass，`debug_view` 需要 8 MB，所以不做别名时的总量从 78 MB 增加到 86 MB，但堆仍然是 58 MB，因为 `debug_view` 正好填进了 `shadow_map` 释放的字节。关闭 `shadow`：`taa_out` 必须另找内存，但堆缩小到 42 MB，因为 lighting 处的峰值下降了。关闭 `tonemap`：所有 pass 都被剔除，因为没有任何东西到达屏幕。

## 5. 光照架构：前向、延迟、分块、分簇

渲染图是骨架；光照架构决定它包含哪些 pass。问题在于如何高效地计算大量光源。记 $N_\text{obj}$ 为物体数，$N_L$ 为光源数，$P$ 为像素数。每次光源计算背后的着色数学见[图形学 04]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})和[图形学 11]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})。

**前向渲染**（forward rendering）。每个物体用一个遍历影响它的光源的着色器绘制一次。开销大约是（被着色的片元数）× $N_L$，而**过度绘制**（overdraw：片元被着色后又被更近的片元遮住）会浪费工作。前向渲染天然支持透明物体和 MSAA。

**延迟着色**（deferred shading）。先把所有几何体绘制一次，写入 **G-buffer**：一组屏幕尺寸的纹理，存放每个像素的表面属性（反照率、法线、粗糙度、深度）。然后在一个全屏 pass 中遍历光源，对每个像素只着色一次（Deering 等人 1988 年和 Saito 与 Takahashi 1990 年提出了这一思想，后者创造了 G-buffer 这个术语）。着色与几何复杂度和过度绘制解耦，代价是内存带宽（图 7）、无法使用硬件 MSAA，以及透明物体需要单独的前向 pass。

**分块着色**（tiled shading）。当大多数光源都很小时，每个像素遍历全部 $N_L$ 个光源仍然很浪费。把屏幕分成小块（例如 16 × 16 像素）。在一个计算 pass 中，每个块构建一张光源列表，收录包围球与该块子视锥相交的光源，像素只遍历所属块的列表。**Forward+**（Harada、McKee 与 Yang，2012）在深度预通道之后的前向 pass 中使用同样的逐块光源列表。

**分簇着色**（clustered shading）。二维块覆盖整个深度范围，所以一个同时包含近处角色和远处墙壁的块会收集两者的光源。**分簇着色**（Olsson、Billeter 与 Assarsson，HPG 2012）还在深度方向上细分，形成称为**簇**（cluster）或 **froxel**（frustum voxel，视锥体素）的三维单元。深度切片按指数间隔划分，因为透视使远处的切片覆盖更大的空间：

$$
z_k = z_\text{near} \left(\frac{z_\text{far}}{z_\text{near}}\right)^{k/S}, \qquad
k(z) = \left\lfloor S\, \frac{\ln(z / z_\text{near})}{\ln(z_\text{far}/z_\text{near})} \right\rfloor ,
$$

其中 $S$ 是切片数，$k(z)$ 是视空间深度为 $z$ 的片元所在的切片。取 $z_\text{near} = 0.5$、$z_\text{far} = 50$、$S = 12$，比值为 100。位于 $z = 5$ 的片元落在切片 $k = \lfloor 12 \cdot \ln 10 / \ln 100 \rfloor = 6$，它覆盖 $z \in [5, 7.34]$。每个片元根据所在块和深度算出自己的簇，然后遍历该簇的光源列表。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-clustered-lights.svg" caption="对 48 个随机点光源（蓝色圆）计算的分簇光源分配，视锥的俯视图：8 个屏幕列 × 12 个指数深度切片，每个单元按与之重叠的光源数着色。右：在 4000 个随机表面点上，一个像素平均需要计算的光源数：二维分块（该列中任何位置的光源）与三维分簇（只包含该深度附近的光源）。" %}

图 6 展示了在玩具数据上计算出的效果：逐列（分块）的列表包含整个深度范围内的所有光源，而分簇只保留表面附近的光源。光源分配 pass 是一个以簇为单位运行的计算着色器，列表存放在一个紧凑的索引缓冲中。分簇着色可以与前向和延迟管线结合，许多当今引擎使用分簇前向或分簇延迟路径。

### 可见性缓冲

G-buffer 存储的是*属性*，这消耗带宽，并且每当材质模型改变时都得重新设计。**可见性缓冲**（visibility buffer，Burns 与 Hunt，JCGT 2013）只存储每个像素被*哪个三角形*覆盖：一个 32 位 ID（三角形和实例）加上深度。之后的一个 pass 取出该三角形的三个顶点，解析地重新计算像素的重心坐标，插值属性并着色。屏幕尺寸的缓冲变小了（图 7），几何体只需用一个极简的着色器光栅化一次，而属性读取只发生在可见像素上。Unreal Engine 5 的 Nanite 会光栅化到一个 64 位可见性缓冲（深度加上簇和三角形 ID）中，详见《Nanite: A Deep Dive》（Karis、Stubbe 与 Wihlidal，SIGGRAPH 2021）。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-gbuffer-bytes.svg" caption="左：三种典型布局下屏幕尺寸目标的每像素字节数（示意布局：32 位深度、8 位 RGBA 或 10 位打包的属性、16 位浮点 HDR 颜色）。右：在三种分辨率下每帧对应的内存，不含 MSAA。可见性缓冲用一个 32 位的三角形与实例 ID 取代了反照率、法线和材质通道。" %}

## 6. GPU 驱动渲染

在经典渲染器中，CPU 遍历场景、剔除物体，并为每个物体和材质发出一次绘制调用。物体多达几十万时，CPU 就成了瓶颈。**GPU 驱动渲染**（GPU-driven rendering）把剔除和绘制生成移到 GPU 上。Haar 与 Aaltonen（《GPU-Driven Rendering Pipelines》，SIGGRAPH 2015 Advances in Real-Time Rendering）和 Wihlidal（《Optimizing the Graphics Pipeline with Compute》，GDC 2016）阐述了如今的标准设计：

1. 所有网格数据存放在少数几个大缓冲中，所有材质都是无绑定的（第 1 节），每个实例在 GPU 缓冲中有一条记录。
2. 一个计算着色器针对视锥和遮挡测试每个实例，或每个由约 64-128 个三角形组成的**簇**，并把幸存者的绘制参数追加到一个缓冲中。
3. 一次**间接绘制**（indirect draw：`DrawIndexedInstancedIndirect`、`vkCmdDrawIndexedIndirectCount`、WebGPU 的 `drawIndexedIndirect`）从该缓冲中读取参数。无论场景多大，CPU 每帧只发出少量调用。

### 用层次 Z 缓冲做遮挡剔除

视锥剔除去掉视野外的东西，但在城市中，视锥内的大多数物体都藏在建筑后面。**层次 Z 缓冲**（hierarchical Z-buffer，HZB；Greene、Kass 与 Miller，SIGGRAPH 1993）让遮挡测试变得廉价。为深度缓冲构建一条 mip 链，第 $\ell + 1$ 级的每个纹素存储其下方 $2 \times 2$ 个纹素中的**最大**（最远）深度：

$$
H_{\ell+1}(x, y) = \max\{ H_\ell(2x, 2y),\ H_\ell(2x+1, 2y),\ H_\ell(2x, 2y+1),\ H_\ell(2x+1, 2y+1) \} .
$$

测试一个物体时，把它的包围盒投影成一个 $w \times h$ 像素的屏幕矩形，其最近深度为 $z_\text{min}$。选择级别 $\ell = \lceil \log_2 \max(w, h) \rceil$，在这一级上矩形最多覆盖 $2 \times 2$ 个纹素，读取这些纹素。如果 $z_\text{min} > \max H_\ell$，说明盒子下方的每个像素都已有更近的东西，物体被遮挡。对于一个 $10 \times 6$ 像素的盒子，$\ell = \lceil \log_2 10 \rceil = 4$：读取四个各自概括 $16 \times 16$ 像素的纹素。这个测试是**保守的**：它可能保留一个被遮挡的物体（粗纹素上的最大值是悲观的），但绝不会剔除可见物体，如图 8 所示。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-hzb-culling.svg" caption="在一个 64 × 64 的玩具深度缓冲（黑色 = 近处遮挡物，白色 = 远平面）上对 60 个随机盒子做 HZB 遮挡剔除，每个盒子在公式选出的级别上最多读取四次。红色：被 HZB 测试剔除。橙色：实际被遮挡但被保留，因为粗纹素也覆盖了背景。绿色：可见。右：最大深度金字塔的第 1-6 级 mip。脚本断言没有任何可见盒子被剔除。" %}

{% include widget.liquid name="graphics-engine-hzb" height="470" caption="在同一张深度缓冲上进行 HZB 测试。拖动盒子，并改变它的尺寸和最近深度 z_min。蓝色虚线方框是在所选级别 L 上读取的纹素（小的 mip 图上也有显示）。红色：被剔除。橙色：实际被遮挡但被保留（保守）。绿色：绘制且可见。让盒子跨在遮挡物的边缘上，看看为什么这个测试必须保持保守。" %}

本帧的深度还不存在时，要用哪张深度缓冲来测试？常见答案是**两阶段遮挡剔除**（two-phase occlusion culling）：先绘制上一帧可见的物体，用这次的深度构建 HZB，再用它测试其余所有物体，绘制新变为可见的物体，并为下一帧更新可见性列表。

### Meshlet 与网格着色器

GPU 驱动管线以 **meshlet** 为粒度进行剔除：meshlet 是小的三角形簇（通常最多 64 个顶点和 124 或 126 个三角形），拥有自己的包围球和法线锥。背向相机、位于视锥外或被遮挡的 meshlet 可以被跳过，无需触碰其中的三角形。图 9 用一个贪心构建器划分一个圆环：它沿共享边的相邻三角形扩展每个 meshlet，直到达到顶点或三角形上限。这是 meshoptimizer 库中的 meshlet 构建器等工具所用贪心策略的简化版本。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-meshlets.svg" caption="对一个 2304 个三角形的圆环做贪心 meshlet 划分，上限为 64 个顶点和 124 个三角形（每个 meshlet 一种颜色）。右：排序后每个 meshlet 的三角形数和顶点数，虚线是上限。大多数 meshlet 先达到顶点上限，因为在规则网格的紧凑区域中，每个顶点大约被六个三角形共享。" %}

**网格着色器**（mesh shader）让 meshlet 成为管线中的一等公民。它们用两个类似计算着色器的阶段替代了固定的顶点获取和顶点着色器阶段：**任务**（task，也叫 amplification）着色器剔除 meshlet 并决定启动多少个网格着色器工作组；**网格**（mesh）着色器直接向光栅化器输出一小批顶点和三角形。它们随 NVIDIA 的 Turing GPU 于 2018 年出现，2020 年成为 DirectX 12 Ultimate 的一部分，2022 年 8 月在 Vulkan 中以 `VK_EXT_mesh_shader` 形式实现跨厂商标准化；Metal 3 也支持。Nanite 更进一步：它在计算着色器中光栅化小三角形（软件光栅化器），因为极小的三角形会浪费硬件光栅化器以四像素块（quad）为单位的工作。

### Work graphs

间接绘制让 GPU 决定做*多少*工作，却不能决定做*哪种*工作：管线仍由 CPU 固定。**D3D12 work graphs** 于 2024 年 3 月正式发布（Agility SDK 1.613），允许着色器启动其他着色器。图中的节点产生记录并喂给其他节点，调度和内存由驱动管理。例如，一个剔除节点可以直接为每种材质启动着色工作。**Mesh nodes**（让 work graph 驱动网格着色器绘制）在一个预览版 Agility SDK（1.715）中推出；使用前请确认其当前状态。

## 7. 调试与性能分析

GPU 的 bug 很少导致崩溃。它会渲染出黑屏、闪烁，或者变慢。常用工具如下：

- **RenderDoc**（免费、开源；支持 Vulkan、D3D11/12、OpenGL）：捕获一帧，让你逐个调用地单步执行，在任意时刻查看每张纹理和每个缓冲，查看管线状态，并针对单个像素调试着色器。它应该是你安装的第一个工具。
- **PIX on Windows**（微软，用于 D3D12）：帧捕获以及计时捕获，可以同时显示 CPU 和 GPU 时间线，包括队列重叠。
- **NVIDIA Nsight Graphics**、**AMD Radeon GPU Profiler** 和 Xcode 的 Metal 调试器提供硬件计数器，例如占用率、缓存命中率，以及哪些单元是瓶颈。
- **验证层**：Vulkan 的验证层（包括同步验证）和 D3D12 调试层能尽早发现 API 误用。开发期间请一直开着。

在自己的引擎中测量时，使用 **GPU 时间戳查询**（timestamp query）。在每个 pass 前后写入时间戳，把查询结果解析到一个缓冲里，并在一两帧之后再读回，以免停顿。差值乘以时间戳周期就是该 pass 的 GPU 时间（`vkCmdWriteTimestamp`；D3D12 用带时间戳查询堆的 `EndQuery`；WebGPU 用可选的 `"timestamp-query"` 特性，在 pass 上设置 `timestampWrites`）。渲染图是做这件事的天然位置：它自动给每个 pass 包上时间戳和调试标签，这样在 RenderDoc 或 PIX 的捕获中就能看到你的 pass 名字。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Deering et al., *The Triangle Processor and Normal Vector Shader: A VLSI System for High Performance Graphics* | SIGGRAPH | 1988 | [DOI](https://doi.org/10.1145/54852.378468) | 早期的硬件延迟着色 |
| Saito & Takahashi, *Comprehensible Rendering of 3-D Shapes* | SIGGRAPH | 1990 | [DOI](https://doi.org/10.1145/97880.97901) | 提出 G-buffer |
| Greene, Kass & Miller, *Hierarchical Z-Buffer Visibility* | SIGGRAPH | 1993 | [DOI](https://doi.org/10.1145/166117.166147) | HZB 遮挡剔除背后的深度金字塔 |
| Harada, McKee & Yang, *Forward+: Bringing Deferred Lighting to the Next Level* | Eurographics（短论文） | 2012 | [DOI](https://doi.org/10.2312/conf/EG2012/short/005-008) | 前向渲染器中的分块光源列表 |
| Olsson, Billeter & Assarsson, *Clustered Deferred and Forward Shading* | HPG | 2012 | [DOI](https://doi.org/10.2312/EGGH/HPG12/087-096) | 三维光源簇；当今大多数光源剔除的基础 |
| Burns & Hunt, *The Visibility Buffer: A Cache-Friendly Approach to Deferred Shading* | JCGT 2(2) | 2013 | [JCGT](https://jcgt.org/published/0002/02/04/) | 存储三角形 ID 而不是属性 |
| Haar & Aaltonen, *GPU-Driven Rendering Pipelines* | SIGGRAPH Advances in Real-Time Rendering | 2015 | [课程页面](https://advances.realtimerendering.com/s2015/index.html) | 量产中的 GPU 剔除、簇与间接绘制 |
| Wihlidal, *Optimizing the Graphics Pipeline with Compute* | GDC | 2016 | [GDC Vault](https://gdcvault.com/play/1023109) | 基于计算着色器的簇与三角形剔除 |
| O'Donnell, *FrameGraph: Extensible Rendering Architecture in Frostbite* | GDC | 2017 | [GDC Vault](https://www.gdcvault.com/play/1024612) | 现代引擎采用的渲染图设计 |
| Karis, Stubbe & Wihlidal, *Nanite: A Deep Dive* | SIGGRAPH Advances in Real-Time Rendering | 2021 | [课程页面](https://advances.realtimerendering.com/s2021/index.html) | 簇层次结构、可见性缓冲、软件光栅化 |

## 学习资源

- 《Real-Time Rendering》第 4 版（[realtimerendering.com](https://www.realtimerendering.com/)），关于图形管线、高效着色（分块与分簇）和加速算法的章节。
- [WebGPU Fundamentals](https://webgpufundamentals.org/)：从零学习 WebGPU；[Learn Wgpu](https://sotrh.github.io/learn-wgpu/)：用 Rust 学习同一套 API；[vkguide.dev](https://vkguide.dev/)：现代 Vulkan 引擎教程。
- Hans-Kristian Arntzen，[《Render graphs and Vulkan: a deep dive》](https://themaister.net/blog/2017/08/15/render-graphs-and-vulkan-a-deep-dive/)（2017）：详细讲述了如何实现渲染图、屏障和异步计算。
- 引擎文档：Unreal 的 [Render Dependency Graph](https://dev.epicgames.com/documentation/en-us/unreal-engine/render-dependency-graph-in-unreal-engine) 和 Unity 的 [URP 渲染图系统](https://docs.unity.com/en-us/engine/6000.0/manual/render-pipelines/universal-render-pipeline/customizing-urp/render-graph)。
- 代码：[meshoptimizer](https://github.com/zeux/meshoptimizer)（meshlet 构建与网格优化）和 [niagara](https://github.com/zeux/niagara)（Arseny Kapoulkine 在直播中编写的小型 GPU 驱动 Vulkan 渲染器，包含 meshlet 和遮挡剔除）。
- GAMES104 中关于渲染系统的课程，以及 [Piccolo](https://github.com/BoomingTech/Piccolo) 引擎的渲染 pass。
- 工具：[RenderDoc](https://renderdoc.org/)、[PIX](https://devblogs.microsoft.com/pix/)、[Nsight Graphics](https://developer.nvidia.com/nsight-graphics)。

## 练习

1. 扩展 `compile_graph`，允许一个 pass 写入它同时读取的资源（读-改-写，例如在光照之后把透明物体画进 `hdr`）。剔除和生命周期需要怎样修改？提示：把这次写入建模为该资源的一个新*版本*（`hdr#1`）。
2. 把别名分配器的“最大优先”顺序换成“最先使用优先”，在示例图和一张随机生成的 30 个 pass 的图上比较堆大小。两种顺序各自在什么时候胜出？
3. 给 `Pass` 增加一个队列字段（`"graphics"` 或 `"compute"`），计算哪些屏障会变成跨队列信号量。把 `ssao` 放到计算队列上。
4. 用正文中的参数，推导 $z = 20$ 处的切片序号以及该切片的深度范围。为什么对透视投影而言指数切片比均匀切片更好？
5. 修改 WebGPU 示例，用一次 `draw(3, 10000)` 调用绘制 10000 个三角形，并利用 `@builtin(instance_index)` 给每个三角形加上偏移。然后，如果你的浏览器提供 `timestamp-query` 特性，用它测量这一帧的 GPU 时间。

<details markdown="1"><summary>提示</summary>

1. 每次写入都创建一个新的版本节点；读取者依赖特定版本，因此剔除和排序按版本进行，而内存按物理资源分配。
2. 最大优先是装箱问题的经典启发式；当生命周期短、尺寸相近时，最先使用优先往往更好。
4. $k = \lfloor 12 \ln 40 / \ln 100 \rfloor = \lfloor 9.61 \rfloor = 9$，切片为 $[0.5 \cdot 100^{9/12}, 0.5 \cdot 100^{10/12}] = [15.8, 23.2]$。指数切片让每个簇的深度与宽度大致相当。

</details>

下一篇：[第 03 篇]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})在 WebGPU 上构建一个完整的迷你引擎，包含渲染图、glTF 资源、PBR 材质和阴影。
