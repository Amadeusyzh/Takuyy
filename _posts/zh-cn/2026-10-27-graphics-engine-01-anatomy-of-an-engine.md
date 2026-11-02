---
layout: post
title: "游戏引擎解剖：主循环、数据、ECS、任务系统与工具"
date: 2026-10-27 13:01:00+0900
description: "游戏引擎由什么构成：分层架构、游戏主循环与固定时间步长、帧预算、面向数据设计、ECS、场景图与空间结构、任务系统以及资源管线，配有可运行代码和实测图。"
categories: graphics-engine
tags: [game-engine, game-loop, fixed-timestep, data-oriented-design, ecs, job-system, scene-graph]
series: graphics-engine
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[图形学系列]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})讲的是一张图像如何生成：光栅化、着色、路径追踪。而一个游戏或模拟器每秒要生成六十张甚至更多图像，同时还要模拟物理、播放动画和声音、读取输入、从磁盘流式加载资源，并始终对用户保持响应。把这一切组织起来的软件就是**引擎**（engine）。引擎同时也是虚拟世界的**模拟器**（simulator），所以这个系列是从图形学、神经渲染通往[世界模型]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})和[具身智能]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})的桥梁：机器人在引擎里训练，而神经网络正开始替代引擎的各个部件。

### 本系列：面向谁、讲什么

本系列面向已经了解图形学系列中渲染基础（或愿意随时查阅）的读者，目标是理解实时系统如何设计和构建，一直讲到 AI 与引擎相遇的地方。你需要一些编程经验；读引擎源码时 C++ 会有帮助，但这里所有示例都用 Python 或 JavaScript。

| 篇目 | 主题 |
| --- | --- |
| 01（本篇） | 引擎解剖：分层、主循环、面向数据设计、ECS、场景图、任务系统、资源 |
| [02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}) | 现代 GPU API（Vulkan、D3D12、Metal、WebGPU）、同步、渲染图、GPU 驱动渲染 |
| [03]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }}) | 用 WebGPU 搭建迷你引擎：主循环、资源、glTF、相机、PBR、阴影、ECS、性能分析 |
| [04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}) | 商业引擎内部：Unreal Engine 5、Unity 6、Godot 4、Bevy |
| [05]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }}) | 物理与仿真引擎、作为机器人模拟器的引擎、OpenUSD 与合成数据 |
| [06]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }}) | AI 遇上引擎：引擎中的神经渲染与高斯泼溅、生成式资产、神经游戏引擎 |

## 前置知识

- Python 与 NumPy；能读简单的类 C 代码。
- 向量与矩阵，包括 $3\times 3$ 齐次二维变换（[图形学 01]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})）。
- 对 $\ddot{x} = a(x)$ 的数值积分器有基本概念（[图形学 07]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}) 第 2 节）。本文沿用半隐式（辛）欧拉法。

## 1. 引擎是什么

引擎包含三部分：

1. **运行时**（runtime）：随游戏发布、每帧都在运行的代码（渲染、物理、动画、音频、输入、网络、玩法逻辑）。
2. **工具**（tools）：内容创作者每天使用的编辑器、导入器、性能分析器、调试器和关卡设计界面。
3. **管线**（pipeline）：离线把源资源（FBX 或 glTF 网格、PSD 纹理、WAV 音频）转换成各平台紧凑运行时格式的机制。

初学者往往只想到第一部分。在商业引擎中，工具和管线至少占一半代码，它们决定了一个团队能工作得多快（第 8 节）。

运行时按**层**（layer）组织（图 1）。每一层只能调用它下方的层。**平台层**（platform layer）屏蔽操作系统、文件系统、线程和 GPU API。**核心层**（core）提供数学库、内存分配器、容器、日志和任务系统。**资源层**（resource layer）知道每个资源在哪里，负责加载以及流式换入换出。其上是几大子系统（渲染、物理、动画、音频、输入与网络），再往上是**玩法层**（gameplay layer，包括实体、脚本、AI、UI），最上面才是游戏本身。Gregory 的《Game Engine Architecture》正是按这些层组织的，是这方面的标准参考书。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-layers.svg" localized="true" caption="典型引擎的分层运行时（左）以及离线操作它的编辑器和工具（右）。依赖只能指向下方：渲染可以使用核心层和资源层，但核心层永远不调用渲染。正是这条规则使得移植引擎时只需重写平台层。" %}

“只向下依赖”并不是学究式的讲究。正因为有这条规则，引擎才能通过只重写平台层登陆新主机，才能在服务器上去掉渲染器无头运行，也才能替换物理库。在[具身智能 03]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}) 的机器人模拟器中也有同样的规则：那里的“游戏”层是训练脚本，渲染可以完全关闭。

## 2. 游戏主循环

每个引擎的核心都是一个循环：

```python
while running:
    process_input()
    update(dt)        # simulate the world forward by dt seconds
    render()          # draw the current state
```

真正有意思的问题是：`dt` 应该取多少？

### 可变时间步长

最简单的做法：测量上一帧花了多长时间，把它当作 `dt`。这能适应任何机器，却让模拟结果依赖于帧率。以初速度 $v_0 = 5$ m/s、重力 $g = 9.81$ m/s$^2$ 的一次跳跃为例，用半隐式欧拉法积分：

$$
v_{n+1} = v_n - g\,\Delta t, \qquad y_{n+1} = y_n + v_{n+1}\,\Delta t .
$$

精确的最高点高度是 $v_0^2 / (2g) = 1.274$ m。离散解的最高点大约低 $v_0 \Delta t / 2$，因为第一次位置更新用的已经是减小后的速度。在 30 fps（$\Delta t = 33$ ms）下约低 8 cm，在 144 fps 下约低 2 cm。机器越快，玩家跳得越高：这对关卡设计是个问题，对联网游戏则是致命的，因为所有机器必须得出一致的结果。图 3（左）给出了三条轨迹。

还有第二个问题。弹簧、接触等刚性力只有在步长足够小时才稳定（[图形学 07]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}) 推导了辛欧拉法的稳定条件 $\omega\Delta t \le 2$）。一帧过长（例如操作系统换页或加载关卡时）就可能越过这个极限，让模拟爆炸。即使没有越界，长步长也带来大误差：图 3（右）中弹簧的能量本应严格守恒，但当 $\Delta t$ 等于抖动的帧时间时，它大幅摆动，并在每个长帧处跳变。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-timestep.svg" caption="左：同一次跳跃分别以 30、60、144 fps 用 dt = 帧时间积分，图例给出各自的最高点高度，帧率越低跳得越低。右：帧时间抖动时的无摩擦弹簧（1.5 Hz）。可变步长（红）的能量比摆动大得多，并在长帧处跳变；带累加器的固定 120 Hz 步长（蓝）始终停留在 1 附近的窄带内。" %}

### 带累加器的固定时间步长

标准解法由 Glenn Fiedler 的文章《Fix Your Timestep!》（2004）推广开来：**把模拟时间与帧时间解耦**。物理总是以固定步长 $\Delta t$（例如 1/60 或 1/120 s）前进。每帧把真实经过的时间加到一个**累加器**（accumulator）里，然后执行尽可能多的固定步：

$$
A \leftarrow A + t_\text{frame}, \qquad
n = \left\lfloor A / \Delta t \right\rfloor, \qquad
A \leftarrow A - n\,\Delta t .
$$

剩余量 $A \in [0, \Delta t)$ 是现实中已经过去、但模拟中尚未推进的时间。图 4 展示了一次帧时间抖动的运行：有的帧一步也不走，有的帧走三步。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-accumulator.svg" caption="30 个抖动帧中的累加器，物理步长为 120 Hz（上图虚线）。上：帧时间。中：该帧执行的固定步数（短于 DT 的帧常常一步不走，长帧走两三步）。下：用于插值的剩余比例 alpha = A/DT。" %}

直接渲染最新的物理状态会带来新的瑕疵。假设物理以 50 Hz 运行、显示器为 60 Hz。六个显示帧共 0.1 s，其间恰好发生五个物理步，于是每六帧中有一帧完全没有运动：可见的**顿挫**（judder，图 5 红线）。解决办法是渲染最后两个物理状态的混合，权重为

$$
\alpha = A / \Delta t, \qquad x_\text{shown} = (1-\alpha)\,x_\text{prev} + \alpha\, x_\text{curr} .
$$

这相当于显示一步之前的状态，但子步相位恰好正确，因此运动是平滑的（蓝线）。代价是最多增加一个物理步长的延迟。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-interpolation.svg" caption="物理 50 Hz、显示 60 Hz，物体以 1 m/s 运动。左：屏幕上的位置；不插值时（红）阶梯每第六帧出现一个平台。右：每帧位移。不插值时在 20 mm 和 0 mm 之间交替；插值后（蓝）从第一帧之后起恒为 16.7 mm（虚线）。" %}

下面是一个包含全部要素的可运行循环：固定步长、累加器、插值，以及对帧时间的钳制，用来防止**死亡螺旋**（spiral of death：一帧慢了就需要更多步，而更多步又让下一帧更慢）：

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

无论休眠时间如何变化，打印出的能量都接近 20，因为物理永远只看到 $\Delta t = 1/120$ s。图 5 的顿挫实验可以用整数时间单位精确复现（1 单位 = 1/300 s，于是 60 Hz 的一帧是 5 单位，50 Hz 的一步是 6 单位）：

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

为什么偏偏是物理需要固定步长？有三个原因：**稳定性**（步长始终低于刚度极限）、**确定性**（相同输入得到逐位相同的结果，锁步多人游戏、回放和自动化测试都依赖这一点）以及**可调性**（像图形学 07 中 XPBD 这样的约束求解器，其刚度依赖于步长）。因此许多引擎把循环拆开：Unity 用 `FixedUpdate` 处理物理、用 `Update` 处理逐帧逻辑；Unreal 的 Chaos 物理可以以固定步长模式运行；机器人模拟器则总是使用固定步长，因为以 500 Hz 训练的控制器必须看到 500 Hz。

### 动手试试

下面的小部件把三种做法并排运行在一个无摩擦弹簧上。调大抖动并按下卡顿按钮：可变步长的小球（红）在每个长帧都会获得一次能量冲击。把物理频率降到 20 Hz：橙色小球（固定步长、显示最新状态）明显跳跃前进，而蓝色小球（固定步长、插值）保持平滑，并以很小的滞后跟随虚线表示的精确解。

{% include widget.liquid name="graphics-engine-fixed-timestep" height="440" caption="滑块：帧时间抖动（在 16.7 ms 附近 0-40 ms）与物理频率（10-240 Hz）。按钮注入一个 200 ms 的长帧。水平拖动任意小球可从新的振幅重新开始。下方曲线显示最近 10 s 内可变步长（红）与固定步长（蓝）模拟的能量比 E/E0，它本应保持为 1。" %}

### 帧节奏、垂直同步与输入延迟

显示器以固定的**垂直同步**（vsync）间隔刷新。开启 V-sync 时，渲染完的帧要等到下一次 vsync 才显示；如果错过一次，就要晚整整一个间隔。所以在 60 Hz 显示器上交替出现 15 ms 和 18 ms 帧的游戏，有的帧显示 16.7 ms，有的显示 33.3 ms。这种**不均匀的帧节奏**（frame pacing）看起来比稳定的 30 fps 还差。关闭 V-sync 可以避免等待，但会造成**画面撕裂**（tearing）：屏幕上半部分是一帧，下半部分是下一帧。可变刷新率显示器（G-Sync、FreeSync）则让显示器等待帧。

**输入延迟**（input latency）是从按下按键到显示其效果的第一个光子之间的时间。它在整条流水线上累加：输入在 CPU 帧开始时采样，然后模拟该帧，再为 GPU 录制命令、渲染，最后扫描输出。图 2 展示了一个典型的流水线化引擎，这里的延迟是三个 vsync 间隔，在 60 Hz 下为 50 ms。引擎降低延迟的办法包括：尽可能晚地采样输入、限制可以提前排队的帧数，以及使用厂商的低延迟模式（如 NVIDIA Reflex），通过控制 CPU 节奏让 GPU 队列保持很短。

## 3. 帧预算：CPU 与 GPU 并行

在 60 Hz 下每帧必须在 $1000/60 = 16.7$ ms 内完成；90 Hz（典型的 VR）下为 11.1 ms；120 Hz 下为 8.3 ms。这就是**帧预算**（frame budget），每个子系统分到其中一份（例如动画 2 ms、物理 3 ms、渲染提交 4 ms）。

但 CPU 和 GPU 并不是轮流工作，而是**并行地处理不同的帧**（图 2）。GPU 渲染第 $N$ 帧时，CPU 的渲染线程在录制第 $N+1$ 帧的命令，主线程在模拟第 $N+2$ 帧。吞吐量由最慢的阶段决定，而不是各阶段之和，这就是性能分析时首先要问“是 CPU 瓶颈还是 GPU 瓶颈”的原因。延迟则是各阶段之和。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-frame-timeline.svg" caption="流水线化的一帧，框中数字是帧序号。第 0 帧在主线程上模拟（10 ms），在下一个间隔内由渲染线程录制（6 ms），由 GPU 渲染（12 ms），并在随后的 vsync（虚线）显示。每个阶段都在 16.7 ms 内完成，所以引擎能达到 60 fps，但每帧从输入到光子要经历三个间隔（50 ms）。" %}

为了让 CPU 领先于 GPU，每一份逐帧数据（uniform 缓冲、命令缓冲）都需要为每个可能同时“在途”（in flight）的帧准备一份副本，再用栅栏（fence）阻止 CPU 覆写 GPU 仍在读取的副本。这是[第 02 篇]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})的主题。

## 4. 面向数据设计

### 为什么内存布局起决定作用

现代 CPU 核心每纳秒可以完成若干次浮点运算，而一次主存读取需要 100 ns 量级。缓存弥补了这一差距：缓存以 64 字节的**缓存行**（cache line）为单位搬运数据，硬件预取器能识别线性访问模式并提前取出后续的行。Drepper 的《What Every Programmer Should Know About Memory》（2007）详细阐述了由此得出的结论：*数据在内存中如何排布*往往比执行多少条指令更重要。**面向数据设计**（data-oriented design，DOD）在游戏界由 Mike Acton 在 CppCon 2014 的主题演讲大力推广，它的出发点是数据及其访问模式，而不是对象。

### AoS 与 SoA

设想每个实体有 16 个 float 字段（位置、速度、生命值、质量、颜色、UV、标志位），共 64 字节，正好一个缓存行。移动系统只读位置和速度，即每个实体 24 字节。

- **结构体数组**（array of structures，AoS）：`Entity entities[N]`。遍历时每一行都被整行加载，64 字节中有 40 字节被浪费。
- **数组结构体**（structure of arrays，SoA）：`float px[N], py[N], ..., vz[N]`。移动系统流式读取六个紧密数组，加载的每个字节都有用，循环也能直接映射到 SIMD 通道上。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-cache-lines.svg" caption="同一批实体的两种布局，每个矩形是一个 4 字节 float，每一行是一个 64 字节缓存行。上（AoS）：每行存放一个实体，移动系统只用到六个着色字段，即加载字节的 37.5 %。下（SoA）：每行存放 16 个实体的同一字段，加载的每个字节都被使用。" %}

一个 NumPy 微基准可以把这一点量化。NumPy 的结构化数组就是 AoS 布局（每个实体一条 64 字节记录），`aos["px"]` 是对它的跨步视图；分开的数组则是 SoA：

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

图 7 给出了运行作图脚本时在四种数组规模下实测的耗时，每组上方标出了加速比。你的数字会因机器而异。差距的来源是：每次对 AoS 数组的跨步遍历都要把每条记录的全部 64 字节拖过缓存。小数组能装进缓存，因此惩罚最小；到一百万个实体时，AoS 数组有 64 MB，只能从主存流式读取。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-aos-soa-bench.svg" caption="更新 p += v dt（x、y、z）时每个实体的耗时：AoS 布局（红）与 SoA 布局（蓝），在生成该图的机器上用 timeit 测得；粗体标签是 SoA 的加速比。具体数值取决于 CPU 和内存，但 SoA 布局每个实体只触及 24 字节而不是 64 字节。" %}

DOD 不只是 SoA。它的其他习惯包括：成批处理而不是一次一个虚函数调用；冷热数据分离；用数组下标代替指针；对数据排序或分组，使一个循环无分支地处理一类对象。实体组件系统（ECS）就是把这些习惯变成默认做法的架构。

## 5. 实体组件系统（ECS）

经典引擎用继承（`GameObject -> Actor -> Pawn -> Character`）或挂在游戏对象上的组件对象（Unity 早期的 `MonoBehaviour`）来建模对象，两者都会把数据散布在堆上。**ECS**（Entity Component System）把世界拆成三个概念：

- **实体**（entity）：只是一个 ID（一个整数，通常附带代数计数器，用来检测失效句柄）。
- **组件**（component）：不含行为的纯数据，例如 `Position`、`Velocity`、`Health`。
- **系统**（system）：作用于所有拥有某组组件的实体的函数，例如作用于 `(Position, Velocity)` 的 `movement`。

**查询**（query）声明系统读写哪些组件。存储结构必须让查询高效，主要有两种设计（图 8）。

**原型表**（archetype table；Unity Entities、Bevy 默认的 table 存储、flecs）。组件类型集合完全相同的所有实体构成一个**原型**（archetype）。每个原型是一张表，每种组件一列，采用 SoA 布局。查询只访问匹配的表并流式读取其列，迭代效率最佳。Unity Entities 把原型存放在 16 KiB 的 chunk 中，每个 chunk 最多 128 个实体。代价在于结构变化：添加或移除组件会把实体所在的行搬到另一张表。

**稀疏集**（sparse set；EnTT，以及 Bevy 可选的 `SparseSet` 存储）。每种组件类型有自己的池：一个紧密排列的组件数组（dense），加上一个把实体 ID 映射到 dense 下标的稀疏数组（sparse）。添加或移除组件是 $O(1)$，且只涉及一个池；但跨多个组件的查询需要遍历一个池并在其他池中查找，局部性较差。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-ecs-storage.svg" caption="上：三张原型表。查询 (Position, Velocity) 匹配 A1 和 A2（紫色列）并跳过 A3，于是移动系统流式读取两对紧密的列。下：同样的 Velocity 数据用稀疏集存储。以实体 ID 为下标的稀疏数组指向紧密排列的 dense 数组（短横表示没有该组件），所以添加或移除 Velocity 只涉及这一个池。" %}

下面是一个约 50 行的最小原型 ECS（Python）。真正的实现会把列存成类型化的连续数组并缓存查询结果，但结构是一样的：

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

实体 `c` 直到第三步才加入 `{pos, vel}` 表，所以它移动了 $2 \times 0.5 = 1$。`{pos}` 表仍然存在，只是现在为空。（字典的 `|` 合并需要 Python 3.9 及以上。）

**调度**（scheduling）。由于每个系统都声明了自己读写哪些组件，引擎可以自动并行地运行系统：只有当一个系统写入另一个系统读或写的组件时，两者才冲突。Bevy 正是根据系统签名构建这样的调度。改变结构的系统（生成实体、添加组件）通常把操作记录为**命令**（command），在同步点统一应用，以免表在查询运行时被改动。

ECS 并不是唯一的好架构：Unreal 使用 Actor 与组件，并用 Mass 框架作为面向人群的 ECS；Godot 使用节点树。但 ECS 背后的面向数据思想出现在每个现代引擎的热点循环中。Overwatch 团队在 GDC 2017 的演讲很好地展示了 ECS 在已发售游戏中的应用，包括它如何简化了网络代码。

## 6. 场景图、变换与空间结构

### 变换层级

许多物体相对于父物体运动：手相对于手臂、炮塔相对于坦克、相机相对于汽车。**变换层级**（transform hierarchy）为每个节点保存一个局部变换 $L$；世界变换是从根到该节点路径上的乘积：

$$
M_\text{hand} = L_\text{root}\, L_\text{arm}\, L_\text{hand} .
$$

使用二维齐次矩阵
$L = \begin{pmatrix} \cos\theta & -\sin\theta & t_x \\ \sin\theta & \cos\theta & t_y \\ 0 & 0 & 1 \end{pmatrix}$，
设根节点位于 $(2, 1)$、旋转 $20°$，手臂在局部 $(1.5, 0)$、旋转 $40°$，手在局部 $(1.2, 0)$、旋转 $-30°$。手的世界原点为

$$
(2,1) + 1.5\,(\cos 20°, \sin 20°) + 1.2\,(\cos 60°, \sin 60°) = (4.010,\ 2.552),
$$

因为施加手的偏移时，手臂坐标系已经转过了 $20° + 40° = 60°$。旋转根节点会带动所有后代（图 9）。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-transform-hierarchy.svg" caption="一个三节点层级。每个节点的局部 x 轴（红）和 y 轴（绿）画在其世界位置上，并标注计算出的世界坐标。虚线和淡色：根节点从 20° 转到 30° 后，手臂和手随之移动，而它们的局部变换没有改变。" %}

当大部分物体静止时，每帧重算所有世界矩阵是浪费。**脏标记**（dirty flag）解决了这个问题：修改局部变换时把该节点及其子树标记为脏，世界矩阵只在被读取时才重算：

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

在 ECS 中，同样的思想以面向数据的方式实现：使用 `Parent` 和 `LocalTransform` 组件，再由一个系统按拓扑顺序传播 `GlobalTransform`（Bevy 和 Unity Entities 都是这样做的）。

### 用于剔除和查询的空间结构

场景图回答的是“谁挂在谁身上”。另一个问题是“谁在谁附近”：哪些物体在相机视锥内、哪些物体对可能碰撞、这条光线打中了什么。对所有物体线性扫描，每次查询是 $O(n)$。**空间结构**（spatial structure）可以降低这一开销：

- **均匀网格**（uniform grid）把物体散列到格子中。它简单，在物体分布均匀、尺寸相近时表现极好，因此粒子系统和碰撞粗检测常用它。
- **八叉树**（octree，二维时为四叉树）自适应地细分空间，适合大型静态世界。
- **包围体层次结构**（bounding volume hierarchy，BVH）把物体组织成一棵包围盒树（Goldsmith 与 Salmon，1987）。它是光线追踪背后的结构（[图形学 05]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})），也适合剔除和动态场景，因为物体移动后重新拟合（refit）包围盒的代价很低。

用 BVH 做视锥剔除（frustum culling）时，先用根节点的包围盒与视锥平面测试。完全位于任何一个平面外侧的包围盒连同整棵子树一起被拒绝；否则递归测试子节点。图 10 是一次真实的二维运行。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-bvh-culling.svg" caption="用中位数划分的 BVH（叶子最多 4 个盒子）对 200 个盒子做视锥剔除。蓝色楔形：相机的二维视锥。紫色轮廓：被测试过的 BVH 节点；位于楔形外的整棵子树只需一次测试就被拒绝。橙色盒子通过了剔除测试。标题给出包围盒测试次数，暴力方法则需要 200 次。" %}

## 7. 并发：任务、任务图与纤程

主机或桌面 CPU 有 8 到 16 个甚至更多硬件线程，而一帧中有数百个相互独立的工作片段。早期的多核引擎给每个子系统分配一个专用线程（物理线程、音频线程），这种做法扩展性差，因为各线程负载不均。现代引擎使用**任务系统**（job system）：一个固定的工作线程池（通常每个核心一个）从队列中取出小任务执行，空闲的线程从忙碌的线程那里窃取任务（**工作窃取**，work stealing，由 Blumofe 与 Leiserson 于 1999 年分析）。

任务之间有依赖（动画先于蒙皮、剔除先于命令录制），所以一帧就是一张**任务图**（task graph），即一个有向无环图（DAG）。在 $P$ 个工作线程上，它能跑多快受两个量约束：总**工作量** $W$（所有任务时长之和）和**关键路径** $C$（最长的依赖链）。任何调度都至少需要

$$
T_P \ \ge\ \max\!\left(C,\ \frac{W}{P}\right).
$$

贪心的**列表调度**（list scheduling）能保证不超过这个下界的两倍（Graham 界，$T_P \le W/P + C$）。优先调度到终点剩余路径最长的任务，通常效果好得多。下面是一个包含 12 个任务的玩具帧，用 30 行代码调度：

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

验证一下下界：$W = 27$ ms，$C = 12$ ms（input、physics、gameplay、cull、build、submit）。两个工作线程时下界为 $\max(12, 13.5) = 13.5$ ms，调度器达到 15 ms。从三个线程开始，关键路径成为瓶颈，第四个线程只会增加空闲时间（图 11）。要让这一帧更快，必须缩短关键路径（例如把物理拆分成多个岛），而不是增加核心。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-job-graph.svg" caption="左：代码中的任务 DAG，红色是 12 ms 的关键路径。右：列表调度器在 4 个工作线程上生成的甘特图。总时长等于关键路径；线程 2 有一半时间空闲，线程 3 根本没有分到任务，所以更多核心对这一帧没有帮助。" %}

下面的小部件运行同一个调度器。改变工作线程数，把优先级切换成单纯的声明顺序，再把物理拆成两个并行的 2 ms 岛：物理链变短了，但关键路径只从 12 ms 降到 11 ms，因为现在限制这一帧的是动画链（input、anim、skinning、cull、build、submit）。

{% include widget.liquid name="graphics-engine-job-scheduler" height="360" caption="在 P 个工作线程上调度这 12 个任务。红色描边标出关键路径；绿色虚线是下界 max(C, W/P)，当调度达到下界时总时长显示为绿色。试试 P = 2 时两种优先级的差别，再勾选拆分物理。" %}

**纤程**（fiber）。如果一个任务必须等待另一个任务（比如 `cull` 等待某个子任务的结果），就会阻塞它所在的工作线程。顽皮狗（Naughty Dog）的引擎用**纤程**解决了这一问题，Christian Gyrling 在 GDC 2015 的演讲《Parallelizing the Naughty Dog Engine Using Fibers》对此有详细介绍。纤程是拥有独立栈的轻量级用户态执行上下文。等待某个原子计数器的任务会让自己的纤程休眠，工作线程随即切换到另一个纤程，不需要操作系统的上下文切换。同一个演讲还介绍了引擎如何让帧重叠：一帧的游戏逻辑运行时，上一帧的渲染工作也在进行，也就是图 2 的流水线。

**主线程与渲染线程。** 即使有任务系统，引擎仍会保留少数专用线程。Unreal 有游戏线程、把场景转换成渲染命令的渲染线程，以及与 GPU API 打交道的 RHI 线程。把模拟与命令录制分开，二者就能在不同的帧上重叠，代价是二者之间传递的数据需要复制或双缓冲。

## 8. 资源、序列化、热重载与编辑器

美术使用便于编辑的格式创作：FBX、glTF、USD、PSD、高分辨率 EXR、WAV。运行时需要的则是便于加载的格式：GPU 压缩纹理（桌面上的 BC1-7、移动端的 ASTC）、完全符合着色器读取布局的顶点缓冲、拆分为 LOD 或 meshlet 的网格，并且全部打包进大型归档文件，以便用很少的 I/O 请求读取。**资源管线**（asset pipeline）负责这一转换：

1. **导入**（import）：把源文件解析成与引擎无关的表示，并给每个资源分配一个稳定 ID（GUID）。
2. **烘焙**（cook，也叫 build 或 bake）：针对一个目标平台进行转换，包括纹理压缩、网格优化、为每种排列组合编译着色器，以及烘焙光照或导航网格。烘焙结果按内容哈希缓存，因为完整游戏的烘焙可能需要数小时。
3. **打包**（package）：把烘焙后的资源打包成归档，并让一起加载的内容在磁盘上相邻存放。
4. **流式加载**（stream）：在运行时随玩家移动，在内存预算内于后台加载和卸载资源，不让帧卡顿。

**序列化**（serialization）把对象变成字节，再变回来。引擎通常对自身类型做反射（Unreal 用 C++ 宏，Unity 用特性与源代码生成器，Bevy 用 derive 宏），这样一份类型描述就能同时驱动保存、加载、网络复制和编辑器的属性面板。**热重载**（hot reload）在游戏运行时重新导入修改过的资源，或重新编译着色器或脚本，并原地替换。它把耗时数分钟的“修改-构建-运行”循环缩短到几秒，所以团队非常看重它。

正因如此，**编辑器和工具占了引擎的一半**。对一个 100 人的美术团队来说，渲染器快 10 % 远不如一条能在两秒而不是两分钟内看到修改效果的管线重要。在[第 04 篇]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})比较引擎时，要像比较渲染一样仔细比较它们的工具。

## 9. 如何学习引擎

阅读真实引擎是最快的学习方式，前提是带着问题去读。适合阅读的代码库：

- **Godot**（C++，MIT 协议）：一个完整、可读的引擎，包含编辑器、基于节点的场景，以及 Vulkan、D3D12 和 Metal 渲染器。从 `main/main.cpp` 开始，跟踪一帧的执行（`Main::iteration`）。
- **Bevy**（Rust，MIT/Apache 协议）：现代的 ECS 优先引擎。`bevy_ecs` 是原型表、稀疏集、查询和并行调度的一个紧凑参考实现。
- **Piccolo**（C++，MIT 协议）：为 GAMES104 课程打造的小型教学引擎，它的分层运行时几乎与第 1 节一一对应。
- **EnTT** 与 **flecs**：独立的 ECS 库，适合对比稀疏集和原型两种存储。

一条项目阶梯，每一级需要一两个周末：

1. 带插值的固定步长循环，加一个弹跳小球场景（本文）。
2. 一个包含三个系统的最小 ECS，以及显示每个系统耗时的性能分析叠加层。
3. 带脏标记的变换层级，加上基于 BVH 的视锥剔除。
4. 一个带工作窃取线程池的任务系统，然后把第 2 级的系统改写为任务。
5. 一个带渲染图的 WebGPU 渲染器（[第 02 篇]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})和[第 03 篇]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})）。
6. 一条资源管线：导入 glTF，烘焙为二进制格式，文件变化时热重载。

## 代表性论文

引擎架构主要记录在书籍和会议演讲中，而不是论文里；下表两者兼收。

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Goldsmith & Salmon, *Automatic Creation of Object Hierarchies for Ray Tracing* | IEEE CG&A | 1987 | [DOI](https://doi.org/10.1109/MCG.1987.276983) | 自动构建包围体层次结构；BVH 剔除与光线追踪的基础 |
| Blumofe & Leiserson, *Scheduling Multithreaded Computations by Work Stealing* | J. ACM | 1999 | [DOI](https://doi.org/10.1145/324133.324234) | 工作窃取任务系统背后的理论 |
| Fiedler, *Fix Your Timestep!* | Gaffer on Games（文章） | 2004 | [链接](https://gafferongames.com/post/fix_your_timestep/) | 带插值的累加器；游戏主循环的经典参考 |
| Drepper, *What Every Programmer Should Know About Memory* | Red Hat 技术报告 | 2007 | [PDF](https://people.freebsd.org/~lstewart/articles/cpumemory.pdf) | 深入讲解缓存、预取与内存布局 |
| Acton, *Data-Oriented Design and C++* | CppCon（主题演讲） | 2014 | [isocpp](https://isocpp.org/blog/2015/01/cppcon-2014-data-oriented-design-and-c-mike-acton) | 让 DOD 成为游戏编程主流的演讲 |
| Gyrling, *Parallelizing the Naughty Dog Engine Using Fibers* | GDC | 2015 | [GDC Vault](https://gdcvault.com/play/1022186) | 3A 引擎中基于纤程的任务系统与帧重叠 |
| Ford, *Overwatch Gameplay Architecture and Netcode* | GDC | 2017 | [GDC Vault](https://gdcvault.com/play/1024001) | 已发售游戏中的 ECS 及其对网络架构的影响 |

## 学习资源

- Jason Gregory，《Game Engine Architecture》第 3 版（CRC Press，2018）；[本书网站](https://www.gameenginebook.com/)现在还预告了分为两卷的第 4 版。这本标准教材由顽皮狗的工程师撰写。
- Robert Nystrom，[《Game Programming Patterns》](https://gameprogrammingpatterns.com/)（可免费在线阅读）：其中 Game Loop、Update Method、Component、Data Locality、Dirty Flag 和 Spatial Partition 各章与本文高度对应。
- Richard Fabian，[《Data-Oriented Design》](https://www.dataorienteddesign.com/dodbook/)（可免费在线阅读）。
- Akenine-Möller 等，[《Real-Time Rendering》](https://www.realtimerendering.com/)第 4 版（2018），覆盖引擎的渲染部分。
- **GAMES104（现代游戏引擎：从入门到实践）**：免费的中文现代游戏引擎课程（[课程主页](https://games104.boomingtech.com/)），配套教学引擎 [Piccolo](https://github.com/BoomingTech/Piccolo)。
- 代码：[Godot](https://github.com/godotengine/godot)、[Bevy](https://github.com/bevyengine/bevy)、[EnTT](https://github.com/skypjack/entt)、[flecs](https://github.com/SanderMertens/flecs)。

## 练习

1. 证明对于半隐式欧拉法的跳跃，离散最高点为 $h_\Delta = \frac{v_0^2}{2g} - \frac{v_0\Delta t}{2} + O(\Delta t^2)$，并与图 3 的图例对照。
2. 在固定步长循环中去掉 `MAX_FRAME` 钳制，并人为让 `physics_step` 变慢（在 `DT = 1/120` 时在函数里休眠 10 ms）。累加器和帧时间会怎样？解释死亡螺旋。
3. 为 Python ECS 增加 `remove(eid, name)` 和 `despawn(eid)`，并给实体 ID 加上代数计数器，以便检测失效句柄。
4. 把 `schedule` 中的优先级改成先到先服务（只按名字对 `ready` 排序）。对比 2、3、4 个工作线程时与关键路径优先级的总时长。
5. 用一个按“父节点在前、子节点在后”排序的扁平节点数组取代脏标记递归，在一个循环里更新所有世界矩阵。为什么这对大型层级更快？

<details markdown="1"><summary>提示</summary>

1. 对位置求和：$y_n = \sum_{k=1}^{n} (v_0 - g k\Delta t)\Delta t$，再对 $n$ 求最大值（$n^\ast \approx v_0/(g\Delta t)$）。
2. 每帧需要的步数超过它能算完的步数，于是这一帧变长，下一帧需要更多步。累加器会无限增长。
4. `physics` 与动画任务谁先开始，决定了关键路径是否被推迟。
5. 扁平循环读取的父矩阵刚刚在前面被写入，访问是顺序的、对缓存友好，也没有递归开销。

</details>

下一篇：[第 02 篇]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})深入渲染层之下，讲解显式 GPU API、同步与渲染图。
