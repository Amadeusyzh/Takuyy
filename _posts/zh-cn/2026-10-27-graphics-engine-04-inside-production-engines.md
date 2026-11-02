---
layout: post
title: "走进生产级引擎：Unreal Engine 5、Unity 6、Godot 4、Bevy 及其他"
description: "现代引擎如何解决那些最难的问题：Nanite 的簇层级与 LOD 切割、Lumen 的表面缓存与距离场追踪、虚拟阴影贴图、时间上采样、Unity 的渲染图与 GPU Resident Drawer、Godot 的 RenderingDevice、Bevy 的提取阶段，以及如何阅读它们的源码。"
date: 2026-10-27 13:04:00+0900
categories: graphics-engine
tags: [unreal-engine, nanite, lumen, virtual-shadow-maps, unity, godot, bevy, engine]
series: graphics-engine
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

在[上一篇]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})中，我们搭建了一个迷你引擎：一个主循环、一张阴影贴图、一个恒定的环境光项，以及一个为每个物体发出一次绘制调用（draw call）的 CPU 循环。生产级引擎面对的是同样的问题，但规模大到这些简单的答案全部失效：数十亿的源三角形、动态全局光照、在任何距离都清晰的阴影、无法整体放进内存的开放世界，以及需要工具链支持的数百人团队。本文打开四个引擎和另外几个引擎，借助它们的官方文档和作者们讲解设计的演讲，看看它们是*如何*解决这些问题的。当某个算法是关键思想时（Nanite 的 LOD 切割、球体追踪、虚拟阴影贴图页），我们会重建一个玩具版本，让你亲眼看到它如何工作。

所有版本信息均**截至 2026 年 11 月**；引擎迭代很快，请查阅所附的发布说明。

## 前置知识

- [第 01 篇]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})（引擎分层、ECS）、[第 02 篇]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})（渲染图、可见性缓冲、GPU 驱动渲染）和[第 03 篇]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})（一条可工作的渲染管线）。
- 来自[图形学第 08 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})的细节层次（level of detail，LOD）与网格简化；来自[图形学第 05 篇]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})的全局光照，以及[图形学第 11 篇]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})中的实时技术。
- 用于玩具实验的 Python 与 NumPy。

## 1. Unreal Engine 5

Unreal Engine 5（UE5）用 C++ 编写，上层有 Blueprint 可视化脚本，任何接受 Unreal Engine EULA 的人都可以在 GitHub 上获取其完整源码。它的渲染围绕 2021-2022 年一同推出的三个系统构建：**Nanite**（虚拟几何体，virtualized geometry）、**Lumen**（动态全局光照，dynamic global illumination）和 **Virtual Shadow Maps**（虚拟阴影贴图）。它们是作为一个整体来设计的：Nanite 生成微细节几何的可见性缓冲（visibility buffer），Virtual Shadow Maps 把同样的几何渲染到超高分辨率的阴影页中，而 Lumen 则无需预计算地为其打光。

### 1.1 Nanite：虚拟几何体

**问题。** 一个电影级品质的资产可能有数百万个三角形。当物体只占几百个像素时，把它们全部绘制出来是浪费；而经典的离散 LOD（每个网格预先计算几个版本，按距离切换）会出现明显的跳变，并且仍然无法简化一个*大*物体，因为它的近端需要完整细节，远端却几乎不需要细节。Nanite 的答案由 Karis、Stubbe 和 Wihlidal 在 SIGGRAPH 2021 Advances 课程中提出（[*A Deep Dive into Nanite Virtualized Geometry*](https://advances.realtimerendering.com/s2021/index.html)）：让细节层次**以簇（cluster）为单位**，并在每一帧于 GPU 上选择，这样绘制的三角形数量就与像素数量挂钩，而不是与源资产的大小挂钩。

**构建层级（离线）。** 网格被切分成最多 128 个三角形的**簇**。然后逐层进行：

1. 把相邻的簇组合成**组（group）**；
2. 把每个组合并后**简化到大约一半**的三角形数，同时**锁定**组的外边界（边界顶点不得移动）；
3. 把简化后的组重新切分成新的、更粗的簇，作为下一层的输入。

由于下一层会形成*不同*的分组，在某一层被锁定的边界，在下一层会落在某个组的内部，并在那里被简化。这就是锁定并不会让边界永远保持完整分辨率的原因。这也是一个粗簇可以有多个父组的原因：该层级是一个**有向无环图**（directed acyclic graph，DAG），而不是树。每个簇存储创建它的那次简化的**几何误差**（geometric error，以世界单位计），并且误差被设为**单调**（monotonic）的：父节点的误差永远不小于其子节点的误差。

我们可以在一维中重建这一思想的本质。我们的“网格”是一条有 128 个线段的地形剖面（每个线段扮演三角形的角色），被切成 16 个簇，每个簇 8 个线段。每一层合并相邻的兄弟对，通过贪心的顶点删除把线段数减半，同时锁定组的两端，并把到原始剖面的最大竖直距离记录为误差。

```python
import numpy as np

xs = np.linspace(0.0, 16.0, 129)                 # 128 segments, 8 per cluster
h = (1.2 * np.sin(0.45 * xs) + 0.5 * np.sin(1.7 * xs + 1)
     + 0.18 * np.sin(4.3 * xs + 2) + 0.07 * np.sin(9.1 * xs + 0.5))

def max_dev(a, b):
    """Largest vertical distance between the original samples a..b and the segment a-b."""
    t = (xs[a:b + 1] - xs[a]) / (xs[b] - xs[a])
    return float(np.max(np.abs(h[a:b + 1] - (h[a] + t * (h[b] - h[a])))))

def simplify(verts, target_segments):
    """Greedy vertex removal; the first and last vertex are locked."""
    verts = list(verts)
    while len(verts) - 1 > target_segments:
        costs = [max_dev(verts[i - 1], verts[i + 1]) for i in range(1, len(verts) - 1)]
        del verts[1 + int(np.argmin(costs))]
    err = max(max_dev(verts[i], verts[i + 1]) for i in range(len(verts) - 1))
    return verts, err

# Level 0: 16 clusters of 8 segments with error 0. Each level: merge pairs, halve, lock the ends.
levels = [[dict(verts=list(range(8 * c, 8 * c + 9)), err=0.0, children=[]) for c in range(16)]]
while len(levels[-1]) > 1:
    prev, nxt = levels[-1], []
    for g in range(0, len(prev), 2):
        a, b = prev[g], prev[g + 1]
        verts, err = simplify(a["verts"] + b["verts"][1:], 8)
        nxt.append(dict(verts=verts, err=max(err, a["err"], b["err"]), children=[a, b]))
    levels.append(nxt)

for i, lv in enumerate(levels):
    print(f"level {i}: {len(lv):2d} clusters, max error {max(c['err'] for c in lv):.4f} m")
```

在一维中，每个组的内部只有一个顶点，所以我们的层级恰好是一棵树；在曲面上，跨越旧边界的重新分组才会产生 DAG。对正确性起决定作用的两个性质，即**锁定的组边界**和**单调的误差**，则是相同的。下图画出了这段代码构建的层级：自下而上看簇数如何减半，并留意黑色刻度在各层的位置，它们对应锁定的边界。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-cluster-hierarchy.svg" caption="脚本计算出的玩具层级：第 0 层（底部）有 16 个簇，每个簇 8 个线段，往上每一层的簇数减半，每个簇仍是 8 个线段。紫色和橙色按簇交替；黑色刻度是簇的端点，由于组边界被锁定，它们始终是原始顶点。每一行上的数字是该层的最大误差（单位为米）；灰色虚线曲线是原始剖面。" %}

**选择切割（每一帧，在 GPU 上）。** 簇的世界空间误差 $\varepsilon$ 通过透视投影变成屏幕空间误差。设垂直分辨率为 $H$ 像素、视场角为 $\theta$，距离 $d$ 处的一个世界单位覆盖 $K/d$ 个像素，其中 $K = H / (2 \tan(\theta/2))$。于是

$$
\varepsilon_{\text{px}} = \frac{\varepsilon\, K}{d}, \qquad d = \max\big(\lVert \mathbf{c} - \mathbf{e} \rVert - r,\ d_{\min}\big),
$$

这里使用的是从眼睛 $\mathbf{e}$ 到簇包围球（球心 $\mathbf{c}$，半径 $r$）最近点的距离，这是保守的做法；$d_{\min}$ 是一个很小的下限，防止相机落进包围球内部时除以零。当且仅当一个簇自身的误差足够小而其父节点的误差不够小时，才绘制这个簇：

$$
\varepsilon_{\text{px}}(\text{cluster}) \le \tau \;<\; \varepsilon_{\text{px}}(\text{parent}),
$$

阈值 $\tau$ 约为一个像素。被绘制的簇的集合称为 DAG 上的**切割**（cut）。由于误差是单调的，从根到叶的每条路径恰好穿过切割一次，因此曲面的每一部分只以一种分辨率绘制一次。又因为同一个组内的簇共享它们的父误差，它们总是一起切换（前提是同组的簇用同一个包围球来计算 $d$），所以被锁定的边界能够对齐：**不会出现裂缝**。关键在于，这个测试是*局部*的：每个簇都可以在一个计算着色器线程中独立求值，无需从根开始遍历（Nanite 仍然在簇包围体上使用一个层级结构来快速剔除）。

**算例。** 取 $H = 1080$、$\theta = 60°$，则 $K = 1080/(2 \tan 30°) \approx 935$ 像素。一个 $\varepsilon = 0.05$ m 的簇在 $d = 0.05 \cdot 935 \approx 47$ m 处投影为 1 个像素。比这更近时，它必须细化为它的子节点；更远时，它的父节点（比如 $\varepsilon = 0.12$ m，在 112 m 处切换）可以接管。

```python
K = 1080 / (2 * np.tan(np.radians(30)))         # pixels per world unit at distance 1

def select_cut(node, cam, tau=1.0):
    v = node["verts"]
    lo, hi = v[0], v[-1]
    hmin, hmax = h[lo:hi + 1].min(), h[lo:hi + 1].max()
    cx, cy = (xs[lo] + xs[hi]) / 2, (hmin + hmax) / 2
    r = 0.5 * np.hypot(xs[hi] - xs[lo], hmax - hmin)
    d = max(np.hypot(cx - cam[0], cy - cam[1]) - r, 1e-3)
    if node["err"] * K / d <= tau or not node["children"]:
        return [node]
    return [c for child in node["children"] for c in select_cut(child, cam, tau)]

for D in (5.0, 60.0, 500.0):                     # camera to the left of the terrain, 2 m high
    cut = select_cut(levels[-1][0], cam=(-D, 2.0))
    print(f"camera {D:5.0f} m away: {len(cut):2d} clusters, {sum(len(c['verts']) - 1 for c in cut):3d} segments")
```

对于一维玩具，我们从根开始遍历；GPU 版本则并行地对每个簇求值同一个不等式。运行这段脚本：近处的相机会在靠近它的地方保留细的簇，而在远端保留粗的簇，随着相机远离，线段数量下降。如下图所示：上半部分的折线按所选簇的层级着色（颜色越深，层级越细），下半部分是层级结构，被选中的簇用高亮方块标出，请对照着看两幅子图。紧接着的第二幅图把不等式 $\varepsilon K / d \le \tau$ 画了出来：请看每一层的直线在多远的距离处穿过 $\tau = 1$ px 的虚线。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-lod-cut.svg" caption="`select_cut` 在相机位于地形左侧 25 m（左）和 100 m（右）、τ = 1 px 时选出的切割。上：被绘制的折线，按每个被选簇所在的层级着色（深色 = 细）。下：高亮显示切割的层级结构；每条从根到叶的路径恰好穿过它一次。较远的相机在各处都使用更粗的层级（100 m 处为 5 个簇、40 条线段，25 m 处为 13 个簇、104 条线段）。在同一视图内，层级取决于每个簇自身的误差，而不只是距离：在 25 m 时，x = 6-8 处平坦的一段已经简化到第 1 层，而更远处更崎岖的几段（x = 8-10、12-14）仍需要第 0 层。" %}

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-error-distance.svg" caption="左：以各层的最大误差 $\varepsilon$ 算出的投影误差 $\varepsilon K / d$ 随距离的变化（双对数坐标，因此每一层是一条斜率为 −1 的直线）；当某一层的直线降到 τ = 1 px（虚线）以下时，该层变得可以接受。右：所选切割中的线段数随相机距离的变化，由 `select_cut` 计算得出。细节随距离平滑下降，而不是在几个大的离散 LOD 台阶上突变。" %}

现在来玩一玩。这个小组件用 JavaScript 运行同样的构造过程。移动相机并调整阈值，然后切换到*独立 LOD 层级*：此时每个 1 m 的区域会从一份单独简化的整条剖面副本中选取自己的层级，这就是朴素的按物体或按块 LOD 的做法，只要相邻区域选择了不同的层级，就会出现裂缝。小组件之后的静态图把其中一处裂缝放大来看。

{% include widget.liquid name="graphics-engine-nanite-lod" height="520" caption="一维的 Nanite 风格层级。拖动相机滑块（对数刻度）和以像素为单位的误差阈值 τ；所选切割（上，按层级着色）、层级结构（下）和线段数会实时更新。切换到独立 LOD 层级，可以看到相邻区域意见不一致的区域边界处出现裂缝（红色）；使用锁定边界的层级结构则不可能出现裂缝。" %}

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-cracks.svg" caption="为什么边界必须被锁定，用计算来说明。左：两个相邻区域的几何取自剖面的两个独立简化版本（第 1 层和第 3 层，用不同颜色表示）。在共享的 x 处，两个版本的高度不同，留下一条竖直的缝隙（红色竖线，标题给出缝隙高度 Δh）。右：同样的区域取自层级结构，簇的端点是被锁定的原始顶点；两条折线严丝合缝。" %}

**剔除、光栅化与着色。** 在 LOD 选择之后，Nanite 分**两个阶段**对簇进行视锥剔除和针对层次深度缓冲（hierarchical depth buffer，HZB）的剔除：先对照上一帧的深度（上一帧可见的东西现在很可能也可见），然后把剩下的簇对照刚刚绘制出的内容的深度重新测试，这样新近露出的部分就不会丢失。可见的簇随后被光栅化到**可见性缓冲**（第 02 篇）中：每个像素写入一个 64 位的值，包含深度以及簇和三角形的 ID，通过原子操作写入。材质着色稍后进行，每个像素一次，通过读取这些 ID 完成。

光栅化被一分为二。GPU 硬件光栅化器对大三角形很高效，但对微小三角形会浪费工作：它们以 2x2 像素的四元组（quad）着色，并且每个三角形都有设置开销，因此一个只覆盖一个像素的三角形，其开销几乎与覆盖许多像素的三角形相当。因此 Nanite 用**计算着色器中的软件光栅化器**来光栅化含**小三角形**的簇（使用 64 位原子操作写入可见性缓冲），并把含大三角形的簇送往硬件路径。演讲中描述了 32 像素的边长阈值（[摘要](https://www.thecandidstartup.org/2023/04/03/nanite-graphics-pipeline.html)），我们在下一幅图中使用它。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-triangle-sizes.svg" caption="一个被细分成约 26 万个三角形的球体在屏幕上的三角形大小，距离分别为 3、10 和 30 m（1080 p，60° 视场角），通过投影每一个正面三角形计算得出。直方图显示最长边的像素长度（对数刻度）；虚线为 32 px。在几何密集时，即使在 3 m 处，所有三角形也都落在这条线以下（大多为 1-10 px，在 30 m 处大多小于 1 个像素），而这正是计算着色器光栅化器胜过固定功能光栅化器的地方。" %}

最后，Nanite 会对其数据进行**流送**（streaming）：DAG 被切成页，只有当前切割所需的页才驻留在 GPU 内存中，更粗的数据则始终存在作为后备。这就是名字中的“虚拟化”，类比于虚拟内存。[Nanite 文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine)列出了它当前的限制（例如只支持不透明和遮罩材质，不支持前向渲染器、MSAA 或变形目标）以及自 2021 年以来新增的功能，比如骨骼网格。

### 1.2 Lumen：动态全局光照

Lumen 每一帧都计算间接漫反射光照和反射，不需要烘焙，所以灯光、几何和一天中的时间都可以自由变化。它由 Wright、Narkowicz 和 Kelly 在 SIGGRAPH 2022 Advances 课程中介绍（[*Lumen: Real-time Global Illumination in Unreal Engine 5*](https://advances.realtimerendering.com/s2022/index.html)），而 [Lumen Technical Details](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine) 页面记录了当前的行为。下图给出了整体流程，可以从左向右读：左列是“光线能命中什么”（场景表示），中列是“怎么追踪”，右列是“怎么把结果变成每个像素的光照”。其核心难点在于，全局光照需要能命中场景中*任何东西*（包括屏幕之外的东西）的光线，并且还需要命中点处的*已打光*颜色，而这一切都要在几毫秒内完成。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-lumen-pipeline.svg" caption="简化的 Lumen 管线，依据 SIGGRAPH 2022 的演讲和技术细节文档绘制。左：场景表示（屏幕、每个网格的距离场、合并后的全局距离场、可选的硬件光线追踪结构）以及把材质和光照存储在卡片（card）上的表面缓存。中：用于软件光线追踪的追踪级联。右：最终聚集（final gather），把追踪得到的辐射度转换为间接漫反射和反射。" %}

**不用三角形的追踪。** 使用软件光线追踪时（在没有光追单元的硬件上这是默认方式），Lumen 针对**有向距离场**（signed distance field，SDF）进行追踪。每个网格都有一个预先计算好的**网格距离场**（mesh distance field）：一张小的 3D 纹理，在每个点存储到最近表面的距离。Lumen 对最初的几米（据文档所述为 2 m）针对各个网格的 SDF 进行追踪，更远的光线则针对合并后、更粗的**全局距离场**（global distance field）进行追踪。在这两者之前，它会先尝试对深度缓冲做一次廉价的**屏幕追踪**（screen trace）。启用硬件光线追踪后，光线-三角形追踪会取代距离场步进。

追踪 SDF 使用**球体追踪**（sphere tracing，Hart 1996）：在点 $\mathbf{p}$ 处，到最近表面的距离 $f(\mathbf{p})$ 意味着以该距离为半径的球是空的，所以光线可以安全地前进 $f(\mathbf{p})$：

$$
\mathbf{p}_{k+1} = \mathbf{p}_k + f(\mathbf{p}_k)\, \boldsymbol{\omega}, \qquad \text{stop when } f(\mathbf{p}_k) < \epsilon .
$$

其中 $\boldsymbol{\omega}$ 是光线的单位方向，$\epsilon$ 是判定命中的容差（与上文的几何误差 $\varepsilon$ 无关）。

**算例。** 原点处的单位球，$f(\mathbf{p}) = \lVert\mathbf{p}\rVert - 1$，以及一条从 $(-3, 0.5, 0)$ 出发沿 $+x$ 方向的光线。各步长依次为 $2.041,\ 0.081,\ 0.0099,\ 0.0013$，四步之后到达 $x \approx -0.8662$，而精确的命中点为 $x = -\sqrt{0.75} = -0.86603$。远离表面时步长很大；靠近表面时收敛很快。擦着表面经过却没有命中的掠射光线是较慢的情形，而且薄墙的 SDF 并不准确，这就是文档要求墙至少 10 cm 厚的原因。

```python
import numpy as np

def sphere_trace(f, origin, direction, eps=1e-3, max_steps=64):
    p = np.asarray(origin, float)
    d = np.asarray(direction, float) / np.linalg.norm(direction)
    for k in range(max_steps):
        dist = f(p)
        if dist < eps:
            return p, k
        p = p + dist * d
    return None, max_steps

unit_sphere = lambda p: np.linalg.norm(p) - 1.0
hit, steps = sphere_trace(unit_sphere, (-3.0, 0.5, 0.0), (1.0, 0.0, 0.0))
print(hit, steps)   # about [-0.8662, 0.5, 0.0] after 4 steps
```

**命中点处是什么？表面缓存。** 距离场只能告诉你光线*在哪里*命中，却不知道那里的材质。Lumen 维护一个**表面缓存**（surface cache）：每个网格被几张**卡片**覆盖，卡片是从几个方向对网格做的正交捕获（文档给出的默认值是每个静态网格 12 张卡片、每个骨骼网格 6 张），存储反照率、法线、深度以及计算出的*光照*。一次光线命中会查找最近的卡片并读取它们缓存的光照，因此一次命中只需要几次纹理读取，而不是一次完整的材质求值。缓存会在若干帧内被增量地重新打光，并且由于缓存的光照包含来自上一帧的间接光，多次反弹会随时间累积。下图用一个玩具物体演示卡片：右侧每张小图是一张卡片捕获的深度，灰色越暗表示离卡片越近，白色表示光线没有打到物体。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-surface-cache-cards.svg" caption="一个玩具物体（顶部放着一个球的盒子）上的表面缓存卡片，通过正交光线投射计算得出。左：物体（黑线为盒子，蓝色线框为球）及其六个与坐标轴对齐的卡片平面（紫色轮廓，为了看得清而向外推开）。右：六张卡片各自捕获的深度，标题 ±x、±y、±z 表示卡片的朝向（越暗 = 离卡片越近，白色 = 未命中）。每个可见的表面点至少出现在一张卡片中，因此光线命中后只需投影到朝向它的那些卡片中，就能找到其材质和缓存的光照。" %}

**最终聚集。** 为每个像素都追踪光线代价太高，因此据演讲所述，Lumen 从放置在可见表面上的一组稀疏的**屏幕空间探针**（screen-space probes）出发进行追踪，利用上一帧的光照对它们的方向做重要性采样，把远处的辐射度缓存在更粗的**世界空间辐射度缓存**（world-space radiance cache）中，然后把探针辐射度积分并滤波为逐像素的间接漫反射光照。反射复用同样的追踪机制，只是光线沿着镜面波瓣（specular lobe）发出。这种“稀疏追踪、缓存、插值”的结构与光照探针（辐照度探针，irradiance probes）和 DDGI（图形学第 11 篇）的思路相同，只是被做成了能根据屏幕上的内容自适应。

UE 5.8（2026 年 6 月）加入了 **Lumen Lite**（测试版），一种更廉价的 Lumen 模式，见 [UE 5.8 发布说明](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes)。

### 1.3 Virtual Shadow Maps

第 03 篇中的单张阴影贴图在整个场景中只有一种纹素密度：相机附近模糊，远处则浪费。级联阴影贴图（cascaded shadow maps）用几张不同尺度的贴图改善了这一点。**Virtual Shadow Maps**（VSM）则走得远得多。根据[文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-shadow-maps-in-unreal-engine)，每盏灯有一张 16k × 16k 纹素的**虚拟**阴影贴图，划分成 128 × 128 纹素的页。只有被某个可见像素实际需要的页才会在物理页池中分配并渲染（使用 Nanite，因此几何细节与纹素密度相匹配），并且除非页内有东西移动，否则页会在帧与帧之间被**缓存**。平行光使用**剪辑图**（clipmap）：以相机为中心的一叠这样的虚拟贴图，每一层覆盖的半径是前一层的两倍；文档中记录的层级范围大约从 64 cm 到约 40 km。

**选择层级。** 距离为 $d$ 的像素覆盖的世界空间足迹约为 $\varphi = d \cdot 2\tan(\theta/2)/H$。剪辑图第 $k$ 层覆盖半径 $2^k$ cm，直径上有 $16384$ 个纹素，所以它的纹素大小是 $s_k = 2^{k+1}/16384$ cm。为了让每个像素至少有一个阴影纹素，该像素需要纹素不大于其足迹的最粗层级，即 $s_k \le \varphi$，也就是 $k = \lfloor \log_2(16384\, \varphi / 1\,\text{cm}) \rfloor - 1$（限制在可用层级范围内），其页为 $\lfloor \mathbf{x} / (128\, s_k) \rfloor$（$\mathbf{x}$ 是该点在剪辑图平面内的世界坐标，单位 cm；每页 128 个纹素，所以页宽为 $128\, s_k$）。

**算例。** 在 $d = 10$ m、$H = 1080$、$\theta = 60°$ 时，$\varphi \approx 1.07$ cm。第 14 层的 $s_{14} = 2^{15}/16384 = 2$ cm，太粗；第 13 层的 $s_{13} = 1$ cm，所以 10 m 处的像素采样第 13 层，其页宽 $128 \times 1$ cm $= 1.28$ m。（Unreal 真实的层级选择还取决于到剪辑图中心的距离以及质量设置；这里给出的是原理。）如下图所示，把同样的选择应用到整片可见地面上：左图看颜色如何随距离变化，右图看每一层需要多少页。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-vsm-pages.svg" caption="一个玩具视角下的虚拟阴影贴图页分配，用上述模型计算得出：相机位于地面上方 1.7 m 处，沿 +z 方向看，1080 p，60°。左：相机前方 150 m 以内的可见地面所请求的页的俯视图（红点为相机，红线为视锥），按剪辑图层级 k 着色；随着足迹随距离增大，页每升一级放大 2 倍。右：每一层请求的页数，与完全驻留的 16k 贴图的 16,384 页相比（对数刻度）。" %}

在下面的小部件中移动和转动相机，它运行的是同一个模型。红框标出的页在上一次更新中没有被请求：有了页缓存，只有这些页需要渲染，这就是为什么缓慢移动的相机的开销远小于总页数所暗示的。

{% include widget.liquid name="graphics-engine-vsm-pages" height="560" caption="位于地面上方 1.7 m 的相机所请求的虚拟阴影贴图页（俯视图，红线为视锥体）。拖动以移动相机，用滑块转动相机。颜色表示剪辑图层级；红框标出自上次更新以来新增的页，即页缓存唯一需要渲染的页。" %}

### 1.4 Temporal Super Resolution、World Partition 与 MetaHuman

- **时间性超分辨率**（Temporal Super Resolution，TSR）是 UE5 内置的时间上采样器（temporal upscaler）：它以较低的内部分辨率渲染，每帧使用不同的亚像素抖动（jitter），用运动向量重投影一份高分辨率的历史，并累积样本，在历史不再匹配的地方将其拒绝。它的前身是 Karis 在 UE4 中的时间抗锯齿（SIGGRAPH 2014 Advances）。[TSR 文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/temporal-super-resolution-in-unreal-engine)解释了它的设置，例如 16 的历史样本数，以及在 50 % 屏幕百分比下需要多少帧才能收敛。时间累积也是让 Lumen 和 VSM 负担得起的原因：三者都是把工作分摊到多个帧上。
- **World Partition** 用一个单一的持久世界取代手动拆分的关卡，该世界被划分成网格并**按距离流送**，配合 *One File Per Actor* 使许多人可以无冲突地编辑同一张地图，配合 *Data Layers* 处理变体，并为远处的单元格自动生成 **HLOD**（层级 LOD 代理，hierarchical LOD proxies）（[文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine)）。
- **MetaHuman**：自 UE 5.6 起，用于制作逼真数字人的工具 MetaHuman Creator 可以在引擎内运行，并配有用于面部表演捕捉的 MetaHuman Animator（[文档](https://dev.epicgames.com/documentation/en-us/metahuman/metahuman-workflow-changes)）。

### 1.5 从 UE 5.4 到 5.8 有什么变化

| 版本 | 发布时间 | 渲染方面的亮点 |
| --- | --- | --- |
| 5.4 | 2024 年 4 月 | 实验性的 Nanite 曲面细分；运动匹配（motion matching）可用于生产 |
| 5.5 | 2024 年 11 月 | **MegaLights**（实验性：大量带阴影的动态灯光）；Substrate 材质进入测试版；路径追踪器可用于生产 |
| 5.6 | 2025 年 6 月 | MetaHuman Creator 进入引擎；针对 60 Hz 开放世界的性能优化 |
| 5.7 | 2025 年 11 月 | Substrate 和 PCG（程序化内容生成，procedural content generation）可用于生产；MegaLights 进入测试版；Nanite 植被 |
| 5.8 | 2026 年 6 月 | MegaLights 可用于生产；Lumen Lite（测试版） |

来源：Epic 的 [5.8 发布说明](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes)以及各版本的报道（[5.4](https://gamefromscratch.com/unreal-engine-5-4-released/)、[5.5](https://gamefromscratch.com/unreal-engine-5-5-released/)、[5.7](https://gamefromscratch.com/unreal-engine-5-7-released/)）。截至 2026 年 11 月，5.8 是最新的已发布版本。

## 2. Unity 6

Unity 是一个用 C# 编写脚本的 C++ 引擎，核心闭源。Unity 6 始于 2024 年的 6.0 LTS，如今持续发布常规更新：[6.3 LTS](https://unity.com/blog/unity-6-3-lts-is-now-available)（2025 年 12 月）是当前的长期支持版本，[6.6](https://unity.com/releases/editor/whats-new/6000.6.0)（2026 年 8 月）是最新的受支持更新。2024 年，Unity [取消了运行时费用](https://unity.com/blog/unity-is-canceling-the-runtime-fee)（该费用曾在 2023 年引发强烈反对），并回到按席位计费的定价方式。

**可编程渲染管线（Scriptable Render Pipeline，SRP）。** Unity 的渲染循环本身是用 C# 在[可编程渲染管线](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/scriptable-render-pipeline-introduction)（SRP）之上编写的，这是一个用于调度和配置渲染命令的薄 API。它自带两条管线：可从手机扩展到 PC 的 **Universal Render Pipeline**（URP），以及面向高端平台的 **High Definition Render Pipeline**（HDRP）。Unity 的 [2026 年渲染管线策略](https://unity.com/topics/render-pipelines-strategy-for-2026)把新的工作放进 URP（包括计划中的实时 GI 和屏幕空间反射），让 HDRP 处于维护状态、不再增加新功能，并从 6.5 起弃用旧的 Built-in 管线。

**Render Graph。** 在 Unity 6 中，URP 的各个 pass 是基于[渲染图](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/universal-render-pipeline/customizing-urp/render-graph/introduction)（render graph）编写的：每个 pass 声明自己的资源，系统会移除输出未被使用的 pass，在每个资源第一次写入前才分配它、在最后一次读取后释放它，并在基于分块（tile-based）的移动 GPU 上把兼容的 pass 合并为原生渲染 pass。这恰好就是第 03 篇中玩具 `PassList` 的三项工作。

**GPU Resident Drawer。** [GPU Resident Drawer](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/universal-render-pipeline/urp-whats-new) 把实例数据保存在 GPU 上（基于 BatchRendererGroup API），并用 GPU 实例化绘制兼容的渲染器，降低有大量物体的场景的 CPU 开销，也就是第 03 篇帧预算图中的那个拐点。它要求使用 Forward+ 路径和支持计算的图形 API。在此之上，[GPU 遮挡剔除](https://docs.unity.com/en-us/engine/6000.3/manual/analysis/graphics-performance-profiling/in-urp/gpu-culling)会针对来自当前帧和上一帧的降采样深度缓冲测试包围球，与 Nanite 的 HZB 剔除是同样的两阶段思路。**STP**（Spatial-Temporal Post-processing）上采样器扮演 TSR 的角色，而 Adaptive Probe Volumes 提供逐像素的烘焙探针光照。

**DOTS 与 Entities。** Unity 的数据导向技术栈（Entities ECS、Burst 编译器和 C# Job System）是第 01 篇思想的生产级范例。自 [Unity 6.4](https://unity.com/releases/editor/whats-new/6000.4.0)（2026 年 3 月）起，Entities、Entities Graphics 和 Collections 成为与编辑器同步版本的**核心包**，而 6.5 把 Netcode for Entities 移入了引擎。

## 3. Godot 4

Godot 是一个完全**开源**的引擎，采用 [MIT 许可证](https://godotengine.org/license/)，用 C++ 编写，可以用 GDScript、C# 或原生扩展编写脚本。截至 2026 年 11 月，最新的稳定版本是 [4.7.2](https://godotengine.org/article/maintenance-release-godot-4-7-2/)（2026 年 8 月），它之前是 2026 年 6 月的功能版本 [4.7](https://godotengine.org/releases/4.7/)（HDR 输出、面光源、Vulkan 注视点渲染支持）。

**RenderingDevice。** Godot 4 围绕 [RenderingDevice](https://docs.godotengine.org/en/stable/classes/class_renderingdevice.html) 重写了渲染器，这是对现代显式 API 的一层低级抽象，也就是 Unreal 称为 RHI、第 02 篇介绍过的那种渲染硬件接口（render hardware interface，RHI）。它背后是 Vulkan、Direct3D 12（自 [4.3](https://godotengine.org/releases/4.3/) 起）和 Metal（自 [4.4](https://godotengine.org/releases/4.4/) 起，面向 Apple 芯片）。RenderingDevice 也向脚本公开，所以你可以在 GDScript 中编写计算着色器。

**三个渲染器。** [Forward+](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html)（面向桌面的分簇前向渲染，clustered forward rendering）和 Mobile 都运行在 RenderingDevice 上；**Compatibility** 运行在 OpenGL 上，是网页端唯一的选择。一个引擎要维护三个渲染器，本身就是一个很好的教训：功能集是平台的函数。

**全局光照选项。** Godot 提供了一份[GI 技术菜单](https://docs.godotengine.org/en/stable/tutorials/3d/global_illumination/introduction_to_global_illumination.html)，各有不同的权衡：**VoxelGI**（实时、基于体素，用于有界区域）、**SDFGI**（有向距离场 GI，在相机周围使用级联，由 Juan Linietsky [于 2020 年](https://godotengine.org/article/godot-40-gets-sdf-based-real-time-global-illumination)提出；它不需要 UV 展开或烘焙；动态物体会接收它的光，但不会对它有贡献）、屏幕空间间接光照（SSIL）、烘焙的 **LightmapGI** 以及反射探针。把 SDFGI 与 Lumen 作比较很有启发：两者都用距离场来低成本地追踪，但 Lumen 又加入了表面缓存和屏幕探针，以达到更高的质量并让动态物体也能贡献光照。

**为什么要研究 Godot。** Godot 的渲染器小到可以读完。基于 RenderingDevice 的渲染器位于[代码仓库](https://github.com/godotengine/godot)的 `servers/rendering/renderer_rd/` 中，每一个设计决策都在公开的拉取请求和提案中讨论过。

## 4. Bevy

[Bevy](https://github.com/bevyengine/bevy) 是一个用 Rust 编写的引擎，采用 MIT 或 Apache-2.0 双重许可，并且是 **ECS 优先**的：一切，包括渲染，都是实体（entity）、组件（component）、资源（resource）和系统（system）。截至 2026 年 11 月，它的最新版本是 [Bevy 0.20](https://bevy.org/news/bevy-0-20/)（2026 年 10 月）；它仍处于 1.0 之前，每个版本都会破坏 API。

**wgpu。** Bevy 通过 [wgpu](https://github.com/gfx-rs/wgpu) 渲染，这是 WebGPU API（第 03 篇所用的 API）的 Rust 实现，可以运行在 Vulkan、Metal、D3D12、OpenGL 上，也可以通过 WebGPU 或 WebGL2 在浏览器中运行。

**渲染应用与提取阶段。** Bevy 在一个单独的**子应用**（sub-app）中运行渲染，该子应用有自己的 ECS 世界。每一帧，一个简短的 [`ExtractSchedule`](https://docs.rs/bevy_render/latest/bevy_render/struct.ExtractSchedule.html) 会把渲染所需的数据（变换、网格句柄、灯光、相机）从主世界复制到渲染世界；然后主世界就可以开始模拟第 $n+1$ 帧，同时渲染世界准备并提交第 $n$ 帧。这就是**流水线化**（pipelining）：设模拟时间为 $S$、渲染准备时间为 $R$，帧时间从 $S + R$ 降到约 $\max(S, R)$，代价是多出一帧的延迟。文档要求让提取保持简短，因为它是两个世界唯一同步的地方。我们的迷你引擎的 `render(world, ...)` 直接读取 ECS；提取就是让它能够并行运行的方式。

Bevy 近期的渲染工作显示了开源引擎可以多快地前进：自 [0.14](https://bevy.org/news/bevy-0-14/) 起的实验性虚拟几何（meshlets），自 [0.17](https://bevy.org/news/bevy-0-17/) 起的实验性光线追踪光照项目 **Solari**，[0.19](https://bevy.org/news/bevy-0-19/) 中被改造成普通 ECS 系统的渲染 pass，以及 0.20 中的网格着色器（mesh shaders）。要研究它，请从 `crates/bevy_render` 和 `crates/bevy_pbr` 入手。

## 5. 其他值得了解的引擎

- **O3DE**（[Open 3D Engine](https://github.com/o3de/o3de)），亚马逊 Lumberyard 的开源继任者，采用 Apache-2.0 / MIT 许可；它的模块化渲染器称为 [Atom](https://www.docs.o3de.org/docs/atom-guide/)。
- **Filament**（[GitHub](https://github.com/google/filament)，Apache-2.0）是 Google 面向 Android、iOS、桌面和 WebGL2 的实时 PBR 引擎。它的[设计文档](https://google.github.io/filament/Filament.md.html)是关于如何实现 PBR 的最好的免费文本（我们在第 03 篇中用过）。
- **Frostbite**（EA）并不公开，但它的演讲塑造了整个行业：[FrameGraph](https://www.gdcvault.com/play/1024612/FrameGraph-Extensible-Rendering-Architecture-in) 演讲（GDC 2017）普及了渲染图，而 *Moving Frostbite to Physically Based Rendering*（[SIGGRAPH 2014 课程](https://blog.selfshadow.com/publications/s2014-shading-course/)）是生产环境中 PBR 的参考。
- **id Tech 8** 是 id Software 为《DOOM: The Dark Ages》（2025）打造的引擎，围绕光线追踪构建：这款游戏原生使用光线追踪渲染，后来又加入了路径追踪模式（[NVIDIA](https://www.nvidia.com/en-us/geforce/news/doom-the-dark-ages-dlss-4-multi-frame-generation-out-now)），这表明硬件光线追踪正在成为基线。
- **NVIDIA Falcor**（[GitHub](https://github.com/NVIDIAGameWorks/Falcor)）是一个基于 D3D12 和 Vulkan 的研究框架，专为实时渲染研究的原型开发而设计，是连接论文与引擎的良好桥梁。
- **RTX Remix**（[GitHub](https://github.com/NVIDIAGameWorks/rtx-remix)）会拦截旧的固定功能 DirectX 8/9 游戏的绘制调用，重建场景并用路径追踪重新渲染，使模组作者可以替换资产和灯光。它的运行时是开源的，是围绕别人的引擎*打造*引擎的一个迷人范例。

## 6. 对比

| | Unreal Engine 5 | Unity 6 | Godot 4 | Bevy |
| --- | --- | --- | --- | --- |
| 核心语言 | C++ | C++ 核心，C# 脚本 | C++ | Rust |
| 许可证 | 源码可获取（Unreal EULA） | 专有 | MIT | MIT 或 Apache-2.0 |
| 渲染器架构 | 延迟渲染 + 可见性缓冲（Nanite）；RDG 渲染图 | C# 中的 SRP：URP（前向、Forward+、延迟）和 HDRP；渲染图 | RenderingDevice；Forward+、Mobile、Compatibility（OpenGL） | wgpu；带提取阶段的渲染子应用 |
| 动态 GI | Lumen（软件 SDF 或硬件 RT） | 烘焙探针（APV）、光照贴图；URP 计划加入实时 GI | SDFGI、VoxelGI、SSIL；LightmapGI | 实验性（Solari） |
| 几何管线 | Nanite 虚拟几何体、HLOD | GPU Resident Drawer、GPU 遮挡剔除、LOD 组 | 经典 LOD、自动网格 LOD、遮挡剔除 | 实验性 meshlets、网格着色器 |
| 脚本 | C++、Blueprint | C# | GDScript、C#、GDExtension | Rust |
| ECS | Mass（用于人群） | Entities（自 6.4 起为核心包） | 节点树，不是 ECS | 处处是 ECS |
| 平台 | PC、主机、移动、XR | PC、主机、移动、XR、网页 | PC、移动、网页、XR | PC、网页、移动（成熟度较低） |

有两个单元格需要留意。“Unreal 的渲染图”指的是渲染依赖图（Render Dependency Graph，RDG），即第 02 篇中那种图的生产版本。Unity 的 ECS 与它的 GameObject 世界仍然并存；大多数 Unity 项目使用的是 GameObject。

## 7. 从每个引擎学到什么，以及如何阅读它们的源码

- **从 Unreal 学**：如何让开销正比于*像素*而不是*内容*（Nanite、VSM），以及时间摊销能走多远（Lumen、TSR、VSM 缓存）。先读 SIGGRAPH 的演讲，再读着色器：在 GitHub 源码中，`Engine/Shaders/Private/Nanite/` 和 `Engine/Shaders/Private/Lumen/` 比驱动它们的 C++ 更易读。编辑器视口中的 Nanite 和 Lumen 可视化模式，是实时观察切割、簇和过度绘制（overdraw）的最快方式。
- **从 Unity 学**：如何把渲染器公开为一个 *API*，让用户可以编写自己的管线和 pass（SRP、渲染图），以及如何在面向对象的引擎上后期引入数据导向设计（Entities、GPU Resident Drawer）。URP 的 C# 源码随包附带，很容易在调试器里单步跟踪。
- **从 Godot 学**：一个小团队如何让可移植的渲染器保持可理解，以及如何提供多种 GI 方法并如实说明各自的权衡。从 `RenderingDevice` 入手，然后读 `servers/rendering/renderer_rd/` 中的一个渲染器。
- **从 Bevy 学**：“一切皆 ECS”能走多远，以及提取和流水线化如何把模拟与渲染解耦。它的 examples 文件夹是一套由小程序组成的测试集，它的发布说明解释了每一次设计变更。

**如何阅读一个引擎的源码。** 不要从 `main` 开始。选定一个*帧*和一个*功能*：用 RenderDoc 捕获一帧（第 03 篇），列出它的各个 pass，然后通过搜索每个 pass 的调试标签（每个引擎都会给它的 pass 加标签）找到发出该 pass 的代码。跟踪一个资源（例如阴影贴图）从创建到最后一次使用的全过程。让官方演讲与代码并排放在一起：演讲解释*为什么*，代码展示演讲略去的数以百计的特殊情况。

## 代表性论文

| 论文 | 发表 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Hoppe, *Progressive Meshes* | SIGGRAPH | 1996 | [DOI](https://doi.org/10.1145/237170.237216) | 通过边折叠实现连续 LOD；视点相关细化的先驱 |
| Garland & Heckbert, *Surface Simplification Using Quadric Error Metrics* | SIGGRAPH | 1997 | [DOI](https://doi.org/10.1145/258734.258849) | 用于构建簇层级的简化误差 |
| Cignoni et al., *Batched Multi Triangulation* | IEEE Visualization | 2005 | [DOI](https://doi.org/10.1109/VISUAL.2005.1532797) | 边界一致的补丁 DAG；Nanite 最接近的前驱 |
| Burns & Hunt, *The Visibility Buffer: A Cache-Friendly Approach to Deferred Shading* | JCGT | 2013 | [论文](https://jcgt.org/published/0002/02/04/paper.pdf) | 存储三角形 ID，稍后着色；Nanite 的输出格式 |
| Karis, Stubbe & Wihlidal, *A Deep Dive into Nanite Virtualized Geometry* | SIGGRAPH Advances 课程 | 2021 | [课程页面](https://advances.realtimerendering.com/s2021/index.html) | Nanite 的设计：簇 DAG、LOD 切割、剔除、软件光栅化 |
| Hart, *Sphere Tracing* | The Visual Computer | 1996 | [DOI](https://doi.org/10.1007/s003710050084) | 对有向距离场做光线步进，是 Lumen 软件追踪和 Godot SDFGI 的基础 |
| Crassin et al., *Interactive Indirect Illumination Using Voxel Cone Tracing* | Computer Graphics Forum (PG) | 2011 | [DOI](https://doi.org/10.1111/j.1467-8659.2011.02063.x) | 基于体素场景的实时 GI；Godot VoxelGI 背后的思想 |
| Majercik et al., *Dynamic Diffuse Global Illumination with Ray-Traced Irradiance Fields* | JCGT | 2019 | [论文](http://jcgt.org/published/0008/02/01/) | 基于探针的动态 GI（DDGI） |
| Wright, Narkowicz & Kelly, *Lumen: Real-time Global Illumination in Unreal Engine 5* | SIGGRAPH Advances 课程 | 2022 | [课程页面](https://advances.realtimerendering.com/s2022/index.html) | 表面缓存、距离场追踪、屏幕探针 |
| Fernando et al., *Adaptive Shadow Maps* | SIGGRAPH | 2001 | [DOI](https://doi.org/10.1145/383259.383302) | 层级化、由视点驱动的阴影贴图分辨率；VSM 的先驱之一 |
| Lefohn, Sengupta & Owens, *Resolution-Matched Shadow Maps* | ACM TOG | 2007 | [DOI](https://doi.org/10.1145/1289603.1289611) | 只在视图需要的地方分配阴影页 |
| Karis, *High Quality Temporal Supersampling* | SIGGRAPH Advances 课程 | 2014 | [课程页面](https://advances.realtimerendering.com/s2014/index.html) | TAA 和 TSR 背后的时间累积 |
| Bitterli et al., *Spatiotemporal Reservoir Resampling for Real-Time Ray Tracing with Dynamic Direct Lighting* | ACM TOG (SIGGRAPH) | 2020 | [DOI](https://doi.org/10.1145/3386569.3392481) | ReSTIR：面向大量动态灯光的蓄水池重采样，开启了一系列随机多光源方法 |

## 学习资源

- SIGGRAPH [Advances in Real-Time Rendering](https://advances.realtimerendering.com/) 课程页面（2021 年的 Nanite、2022 年的 Lumen，以及此后每一年的内容）：生产级渲染的一手资料。
- 官方文档：[Nanite](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine)、[Lumen 技术细节](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine)、[Virtual Shadow Maps](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-shadow-maps-in-unreal-engine)；Unity 的 [URP 渲染图](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/universal-render-pipeline/customizing-urp/render-graph/introduction)；Godot 的[渲染文档](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html)；Bevy 的[新闻文章](https://bevy.org/news/)，解释了每个版本的设计。
- 源码：[Godot](https://github.com/godotengine/godot)、[Bevy](https://github.com/bevyengine/bevy)、[O3DE](https://github.com/o3de/o3de)、[Filament](https://github.com/google/filament)、[Falcor](https://github.com/NVIDIAGameWorks/Falcor)；Unreal Engine 在关联 Epic 账号后可在 GitHub 上获取。
- Akenine-Möller 等人的 *Real-Time Rendering*（第 4 版），以及 Jason Gregory 的 *Game Engine Architecture*，用于了解周边系统。
- Arseny Kapoulkine 的 [meshoptimizer](https://github.com/zeux/meshoptimizer) 库，它的簇生成器和简化器是构建类 Nanite 管线时最常用的开源构件。

## 练习

1. **单调误差。** 从层级构建器中去掉 `max(err, a["err"], b["err"])`（只保留 `err`），然后搜索使切割变得不一致的相机位置（一个簇与它的某个祖先同时被选中，或者两者都没被选中）。为什么单调性能防止这种情况？
   <details markdown="1"><summary>提示</summary>
   对于逐簇的测试 $\varepsilon(c) \le \tau < \varepsilon(\text{parent})$，只有当 $\varepsilon$ 沿路径递减时，一条从根到叶的路径才会只穿过切割一次。如果父节点的误差小于其子节点的误差，那么两个不等式可能在同一条路径上同时成立（或同时不成立）。
   </details>
2. **作为 DAG 的组。** 修改构建器，使每一层合并*四个*簇、简化到一半，再切分成*两个*簇，并让分组在交替的层级上偏移一个簇。画出得到的图：现在哪些簇有两个父节点？
3. **球体追踪的开销。** 统计 `sphere_trace` 对于从离单位球表面 0.01、0.1 和 1 的距离处擦过的光线所需的步数。绘制步数与未命中距离的关系图并解释结果。
   <details markdown="1"><summary>提示</summary>
   靠近表面时，安全步长就是到表面的那段很小的距离，所以掠射光线只能缓慢向前爬行；对于光滑表面，步数大致与未命中距离的平方根的倒数成比例增长。
   </details>
4. **VSM 预算。** 扩展页分配模型，为一个每秒转动 90° 的相机统计物理页数，缓存会把页保留 30 帧。每帧必须渲染多少新页？
5. **阅读源码。** 在 Godot 的仓库中，找到 Forward+ 构建其分簇灯光列表的位置；或者在 Bevy 中，找到提取点光源的系统。写下从场景传递到渲染器的数据。

[下一篇]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})将从渲染转向模拟：游戏引擎的物理管线，以及 Isaac、MuJoCo、Newton 和 Genesis 等引擎如何成为机器人和 AI 的模拟器。
