---
layout: post
title: "论文速递｜2026 年 10–11 月：图形学、引擎、神经渲染、世界模型、具身智能与 XR"
date: 2026-11-02 12:00:00+0900
description: "论文速递第 01 期：2026 年 10 月 1 日至 11 月 2 日首次发布的 42 篇经过核实的论文，分六个类别，每篇说明它做什么、怎么做、新在哪里，以及与计算机图形学的联系。"
categories: paper-digest
tags: [paper-digest, graphics, real-time-rendering, 3dgs, world-models, embodied-ai, xr]
series: paper-digest
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## 关于本期

这是**论文速递**的第一期。它是一个按日期出刊的专栏，与本博客的学习系列并行。学习系列（[图形学]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})、[神经渲染]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})、[图形引擎]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})、[世界模型]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})、[具身智能]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})）讲解基础，速递则展示研究者上个月在这些基础之上做了什么。

**时间窗口与日期标记。** 本期收录**首个版本**发布于 **2026 年 10 月 1 日至 11 月 2 日**之间的论文。本期编写于 **2026 年 11 月 2 日**，下文所有状态都以该日期为准。论文之后若被录用，这里的状态就会过时。

**选文方法。** 我遍历了窗口内 arXiv 的 cs.GR、cs.CV、cs.RO、cs.HC、cs.LG 和 cs.AI 列表，做了关键词检索（高斯泼溅、世界模型、视觉-语言-动作、人形机器人、虚拟现实、路径追踪、神经着色等），并查看 arXiv 备注（comments）中关于 SIGGRAPH Asia 2026、NeurIPS 2026、CoRL 2026、UIST 2026、ISMAR 2026 和 IEEE TVCG 的录用信息。从几百篇候选中，我保留了 **42 篇，每个类别 7 篇**，优先顺序为：

1. 重要性：带来新能力，或结果明显更强；
2. 被顶级会议或期刊录用；
3. 开源代码或数据；
4. 与图形学、三维视觉、AR/VR、人机交互、世界模型和具身智能的相关性。

**核实了什么。** 每一篇我都打开了 arXiv 摘要页，核对标题、第一作者、首次提交日期和备注栏；项目页和代码链接都打开过一次。只有论文自己的页面写明时才给出作者单位。数字一律以“作者报告……”的形式引用。摘要由我根据论文摘要和项目页撰写，没有照抄；简短的概述不能代替阅读原文。

**状态标签。** “SIGGRAPH Asia 2026（已录用）”之类的标签来自 arXiv 备注栏。“预印本”表示未注明会议或期刊，并不表示被拒稿。预印本尚未经过同行评审。

**如何阅读一个条目。** 每个条目分四部分：*它做什么*；*它怎么做*（关键思想，研究生水平）；*新在哪里*（与已有工作相比）；*与 CG 的联系*：它使用或改变了哪种表示、渲染、几何、仿真、动画或交互思想，并链接到本博客中讲解相关背景的章节。

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-overview.svg" localized="true" width="85%" caption="本期一览。每根条形统计一个类别的条目数：深色部分是已被会议或期刊录用的论文（依据截至 2026 年 11 月 2 日的 arXiv 备注），浅色部分是预印本。每个三角形标记一篇公开了代码或数据的论文。注意：引擎与实时类的论文全部还是预印本，而神经渲染类获得的 SIGGRAPH Asia 录用最多。" %}

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-timeline.svg" caption="窗口时间线。每个圆点是一篇论文在 arXiv 首次提交的日期，每个类别一条泳道（GFX 图形学，ENG 引擎与实时，NR 神经渲染，WM 世界模型，EAI 具身智能，XR 人机交互/XR）。数字是本文使用的条目编号。请看 10 月 20 日前后的密集区：那一周出现了 Matrix-Game 4.0、三篇 CoRL 2026 机器人论文和数篇高斯泼溅论文。" %}

### 浏览本期

下面的浏览器包含全部 42 个条目。可以按类别或按与计算机图形学的联系筛选，沿时间线拖动，点击论文即可阅读摘要并打开链接。

{% include widget.liquid name="paper-digest-explorer" height="640" caption="交互式浏览器。点击类别标签只显示该类别（再点其他标签可以叠加类别，点“全部”复位）。点击 *渲染* 等 CG 关联标签，只保留涉及该方面的论文。点击或在圆点上拖动来选中论文；卡片会显示本页中的摘要，并给出论文、代码、项目页和正文条目的链接。" %}

## 1. 图形学

渲染、几何、物理仿真、动画与成像。本月的图形学论文大多与**仿真**有关：可微接触、学习型积分器、物质点法和蒙特卡洛偏微分方程求解器。背景知识见[基于物理的仿真]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})和[动画与角色]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})。

### 1. [Tabula Rasa: Monte Carlo estimation of unit-variance noise with controlled spatio-temporal correlation](https://arxiv.org/abs/2610.11653) {#pd-01}

*Tobias Ritschel 等（7 位作者）· SIGGRAPH Asia 2026 Conference Papers（已录用）· 首次提交 2026-10-08 · [代码](https://github.com/facebookresearch/Tabula-Rasa)*

- **它做什么。** 生成方差恰好为 1、并且具有指定时空相关性的噪声场。渲染和仿真管线用这类噪声做抖动（dithering）、采样和程序化细节。
- **它怎么做。** 作者把噪声合成看作一个蒙特卡洛估计问题：同时估计像素重建及其方差，再用方差估计做归一化。为了廉价地做到这一点，他们借用了数据库研究中的*草图*（sketching）技术，即用固定大小的小结构概括大规模数据流。
- **新在哪里。** 以往构造可控时间相干性的相关噪声的方法更复杂。作者报告，他们的生成器比以往方法代码更简单、速度更快。
- **与 CG 的联系。** 噪声的频谱决定了蒙特卡洛误差在一帧中的样子、以及它随时间如何闪烁，进而决定时域降噪器能否把它去掉。参见[光线与路径追踪]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})中的蒙特卡洛估计和[实时光线追踪]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})中的时域复用。

### 2. [DiffGIPC: Differentiable Mixed-Coordinate Contact Dynamics on GPU](https://arxiv.org/abs/2610.19091) {#pd-02}

*Kemeng Huang 等（5 位作者，含 Taku Komura）· 预印本 · 首次提交 2026-10-13*

- **它做什么。** 一个可以求导的 GPU 增量势接触（Incremental Potential Contact，IPC）仿真器，能处理柔软的可变形体与近似刚体混合的场景。
- **它怎么做。** 近似刚体部分用*仿射体*（affine body）建模：每个只有 12 个自由度，即一个 3x3 矩阵加一个平移。柔软部分使用完整的有限元（FEM）坐标。反向传播时，每帧只求解一个耦合的 FEM-仿射*伴随*（adjoint）线性系统，因此系统规模小得多，而接触与摩擦项仍然保持耦合。PyTorch 接口把用户参数和损失与仿真器连接起来。
- **新在哪里。** 基于罚函数或速度层面的可微仿真器会出现穿透或漂移。IPC 保证物体永不相交，但对它求导一直很昂贵。作者报告，相对 DiffIPC 的峰值加速在全空间 FEM 下约 150 倍，使用仿射体时约 4133 倍。
- **与 CG 的联系。** IPC 的障碍能量（barrier energy）保证接触无相交。对它求梯度可以做逆向设计（例如拟合材料和形状），也可以做机器人系统辨识。参见[基于物理的仿真]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})中的隐式积分与接触，以及[可微渲染]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})中的逆问题。

### 3. [Neuroll: Real-Time Neural Strand-Based Hair Simulation via Simulator-in-the-Loop Unrolling](https://arxiv.org/abs/2610.04689) {#pd-03}

*Gene Wei-Chin Lin 等 · 预印本 · 首次提交 2026-10-03*

- **它做什么。** 一个面向发丝级（strand-based）头发的神经时间积分器，在普通硬件上实时运行。
- **它怎么做。** 网络的输入与经典积分器相同：之前的头发状态、材料刚度和碰撞几何。它在每根发丝的局部坐标系中计算，因此与头发密度无关。训练是自监督的，并且*仿真器在环*（simulator in the loop）：网络在随机选择的时间跨度上展开（unroll），物理约束作用于整个展开过程，而不只是单步。
- **新在哪里。** 以往的神经头发和布料仿真器常常失去物理合理性，遇到与训练数据不同的输入就会失效。它的目标是稳定的长时间展开，并能迁移到不同发型、材料和身体动作。它还支持通过重置状态做准静态仿真。
- **与 CG 的联系。** 它是[基于物理的仿真]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})中时间步进循环的学习型替代品。对实时角色（[动画与角色]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})）很重要，因为头发是最昂贵的次级运动之一。

### 4. [PhysSkin++: Real-Time and Generalizable Physics-Based Animation via Self-Supervised Neural Skinning](https://arxiv.org/abs/2610.26067) {#pd-04}

*Yuanhang Lei 等（12 位作者）· 预印本 · 首次提交 2026-10-19 · [项目页](https://zju3dv.github.io/PhysSkin_plus/)*

- **它做什么。** 对任意静态形状，一个前馈网络预测出*神经蒙皮场*（neural skinning field）。该场定义一个小的变形子空间，弹性仿真可以在其中实时运行，而且不需要逐物体训练。
- **它怎么做。** 神经蒙皮场像线性混合蒙皮一样，给每个点分配对每个控制柄（handle）的权重；控制柄的仿射变换就成为仿真的降维坐标。自编码器用物理能量自监督训练，不需要仿真数据。归一化的蒙皮场和冲突感知的梯度校正，使物理损失与正交性损失不再相互冲突。由于子空间是一个场，它可以同样驱动网格、点云和三维高斯。
- **新在哪里。** 以往的神经子空间方法（包括最初的 PhysSkin）要为每个形状单独优化子空间，PhysSkin++ 则能为没见过的形状直接预测子空间。
- **与 CG 的联系。** 蒙皮是[动画与角色]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})中的变形模型，降阶弹性是[基于物理的仿真]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})中的经典加速手段。直接驱动[三维高斯]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})，可以让采集到的场景具备物理动画能力。

### 5. [Total Deformation-based MPM for Perfectly Elastic Solid Simulation with Strong Deformations](https://arxiv.org/abs/2610.36945) {#pd-05}

*Timna Böttcher 等（3 位作者，含 Jan Bender）· 预印本 · 首次提交 2026-10-27*

- **它做什么。** 一种用于完全弹性固体的物质点法（material point method，MPM），在大变形下不会出现人为断裂，并能自然地处理碰撞。
- **它怎么做。** 标准 MPM 用网格速度梯度更新每个粒子的变形梯度 $F$，这一更新中的误差会累积，并表现为数值断裂。这里的 $F$ 直接由粒子相对于固定参考网格的位置推出（“全”变形），不再做速度梯度更新；弹性力则在当前的变形网格上计算。
- **新在哪里。** 以往的全拉格朗日 MPM 变体在参考状态中计算力，难以结合标准的碰撞处理。新的形式支持粒子级碰撞，并能抑制零能模式（zero-energy modes）。
- **与 CG 的联系。** MPM 是电影中雪、沙和软固体的主力方法。参见[基于物理的仿真]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})中的 MPM 与超弹性。

### 6. [Walk on Multiscale Media: Compiling Editable and Composable Transport Medium Prefabs for Monte Carlo PDE Solvers](https://arxiv.org/abs/2610.35952) {#pd-06}

*Yunfeng Liao 等（2 位作者）· 预印本 · 首次提交 2026-10-24*

- **它做什么。** 把非均匀材料内部的细尺度输运预先编译成可复用、可编辑的“预制件”（prefab），蒙特卡洛偏微分方程求解器可以直接插入使用，从而让材料编辑变得可交互。
- **它怎么做。** 球面行走（Walk-on-Spheres，WoS）用在球之间跳跃的随机游走求解扩散等偏微分方程，就像路径追踪器在表面之间游走一样，不需要网格。在结构精细的介质中，每一步都很短，游走变得很慢。每个预制件存储由多尺度有限元基导出的粗尺度转移概率、端口到端口的算子、出射分布和记录下来的轨迹。混合 WoS 求解器因此可以一步跨过整个预制件。该方法还支持重叠的吸收场、通过路径重加权进行梯度引导，以及瞬态扩散。
- **新在哪里。** 普通的 WoS 和 Walk-on-Stars 每次编辑后都要重新求解细尺度问题。预制件让介质像场景图中的实例化（instancing）一样可以组合。
- **与 CG 的联系。** 基于游走的 PDE 求解器出自渲染社区，并复用了它的工具：重要性采样、路径重加权和 BVH 式查询。可对比[光线与路径追踪]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})和[体积与参与介质]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }})中的随机游走。

### 7. [Dynamic Skinning: Kinematics-Driven Cartoon Effects for Articulated Characters](https://arxiv.org/abs/2610.40976) {#pd-07}

*Damien Rohmer 等（4 位作者）· IEEE TVCG 2026（录用版本）· 首次提交 2026-10-29 · [项目页](https://velocityskinning.com/)*

- **它做什么。** 不运行仿真，就为蒙皮角色加上类似物理的次级运动，例如抖动、振荡以及沿肢体传播的波。
- **它怎么做。** 一组*变形器*（deformer）把每个顶点的偏移写成时间和该顶点位置时间导数的闭式函数。这些导数来自骨骼运动，叠加在线性混合蒙皮（LBS）等标准蒙皮之上。由于不需要随时间积分，结果快速、稳定，美术师可以直接控制。
- **新在哪里。** 它是基于仿真的次级运动的一种运动学、闭式替代方案：几乎不增加开销就得到卡通风格效果，也不需要调节求解器的稳定性。
- **与 CG 的联系。** 它扩展了[动画与角色]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})中的蒙皮管线。可与 PhysSkin++（条目 4）对比：一个在学习到的子空间里使用真实物理，另一个只靠运动学得到“看起来像物理”的效果。

## 2. 图形引擎与实时

实时渲染、GPU 与引擎系统、引擎中的神经着色以及工具。本月的共同主线是**把昂贵的积分移出每一帧**：移进预积分的网络（条目 10）、辐射缓存（12）、硬件单元（13）或层次结构（14）。背景知识见[实时光线追踪]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})、[实时渲染技术]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})和 [GPU API 与渲染图]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})。

### 8. [Windfoil: Closed-Form Coverage for Real-Time and Differentiable Vector Graphics](https://arxiv.org/abs/2610.02468) {#pd-08}

*Matt DesLauriers（单一作者）· 预印本 · 首次提交 2026-10-01*

- **它做什么。** 用同一种 WebGPU 方法同时覆盖实时矢量图形渲染、高分辨率印刷光栅化和可微矢量图形优化。
- **它怎么做。** 像素对一个填充形状的覆盖率，等于该形状的环绕数（winding number）在像素覆盖区域上的积分。对由二次贝塞尔曲线组成的轮廓，论文在 GPU 上以**闭式**计算这一盒式滤波的环绕数。得到的抗锯齿覆盖率对盒式滤波是精确的，而且同一个公式对控制点可微。
- **新在哪里。** 渲染方面与 Skia 和 Slug 比较，优化方面与 DiffVG 和 Bézier Splatting 比较。作者报告，其覆盖率比两者更接近参考值，速度与 Slug 相当；在优化中，每步开销只有对手的一小部分。
- **与 CG 的联系。** 这是把“抗锯齿即像素上的积分”这一[光栅化]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})思想用于曲线。由于结果是解析且可微的，它也与[可微渲染]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})相连。WebGPU 正是[迷你引擎]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})所用的 API。

### 9. [SteadySplats: Resampling of Low-Variance Gaussians for High-Fidelity Stochastic Rendering](https://arxiv.org/abs/2610.05576) {#pd-09}

*Felix Windisch 等（7 位作者，含 Chris Wyman、Georgios Kopanas、Bernhard Kerbl 和 Markus Steinberger）· 预印本 · 首次提交 2026-10-04*

- **它做什么。** 让三维高斯泼溅的*随机透明*（stochastic transparency）变得实用：高斯无需排序就能渲染，结果仍接近排序后的 3DGS。
- **它怎么做。** 3DGS 通常按深度对高斯排序，再从前到后做 alpha 混合。随机透明避免了排序：每个像素以等于不透明度的概率保留一个高斯，并像不透明表面一样做深度测试。其期望结果等于 alpha 混合，但每像素一个样本时噪声非常大。SteadySplats 借鉴 ReSTIR 的思路，用基于历史的空间重采样和时域重要性重采样来降低噪声，并在训练时加入颜色正则项，降低每条视线上的方差。
- **新在哪里。** 以往的随机 3DGS 渲染器很快，但噪声太大无法实用。作者在 Vulkan 渲染器中报告，每像素一个样本时比以往的随机方法 PSNR 提高 13 dB。
- **与 CG 的联系。** 不需要排序，泼溅就可以走普通的深度缓冲引擎管线，并与网格混合渲染。参见[三维高斯泼溅]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})、[实时光线追踪]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})中的 ReSTIR，以及[AI 与图形引擎]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})中生产引擎里的泼溅。

### 10. [Real-time Rendering of Pre-integrated Neural Emitters](https://arxiv.org/abs/2610.06762) {#pd-10}

*Arno Coomans 等（4 位作者，含 Markus Steinberger）· 预印本 · 首次提交 2026-10-05*

- **它做什么。** 神经发光场（Neural Emission Fields，NEF）对几何上复杂的光源，在每个着色点只需一次网络求值，就能给出无噪声的直接光照。
- **它怎么做。** 网络学习光源在其周围空间中产生的光照。输入是着色点的位置、法线、视线方向和材质，输出分为漫反射和光泽两个头。训练在光源的局部坐标系中进行，因此训练好的 NEF 可以在刚体变换下放进其他场景。自遮挡、光源内部的相互反射、空间变化的发光和变形都被预先烘焙进去。
- **新在哪里。** 解析光源模型只能处理简单形状，光源采样有噪声，代理方法仍要在运行时积分辐射度。NEF 则把对光源表面的积分完全移出了每一帧。
- **与 CG 的联系。** 它预积分了[渲染方程]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})中的直接光照积分，类似于[实时渲染技术]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})中 split-sum 基于图像的光照对环境贴图所做的事。

### 11. [Masking Judder in Foveated Rendering with Phase-Shifted Noise](https://arxiv.org/abs/2610.10811) {#pd-11}

*Ville Cantory 等（4 位作者，含 Piotr Didyk）· 预印本 · 首次提交 2026-10-07*

- **它做什么。** 在时域注视点渲染（foveated rendering）中，周边视野以较低帧率渲染，那里的运动会显得一顿一顿（即“抖动”，judder）。本文用廉价的合成噪声掩盖这种抖动。
- **它怎么做。** 平移一个 Gabor 核等价于改变它的相位。因此，随时间调制程序化 Gabor 噪声的*相位*，就能在不重新渲染噪声的情况下产生平滑运动的错觉。根据屏幕上的角速度和降低后的时间采样率，该方法选择一个空间频带，使噪声掩盖抖动，同时不引入自身可见的混叠。
- **新在哪里。** 以往的工作用噪声恢复注视点渲染丢失的空间细节和速度感。时域滤波可以抑制抖动，但会增加计算并模糊细节。作者的用户实验报告，看起来平滑的速度范围显著扩大。
- **与 CG 的联系。** 这是面向 VR 的感知驱动渲染：可对照[交互实验室]({{ '/' | relative_url }}#lab)中的注视点渲染演示，以及[具身智能与 XR 和人机交互]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})。

### 12. [Neural Caching of Prefiltered Radiance for Specular Lighting](https://arxiv.org/abs/2610.11702) {#pd-12}

*Dmitrii Klepikov、Vladimir Frolov · 预印本 · 首次提交 2026-10-08*

- **它做什么。** 神经辐射缓存（neural radiance caching，NRC）的一个变体，同样适用于光泽和镜面表面，保持实时并能在线自适应。
- **它怎么做。** NRC 在线训练一个小网络来预测路径顶点处的出射辐射度，从而可以提前截断路径。这个变体用反射方向参数化查询，并训练一个与粗糙度相关的目标：预测*预滤波*的入射辐射度。预测结果再通过 split-sum 近似与预计算的 BRDF 积分表结合，这正是实时引擎做基于图像的光照时所用的分解。
- **新在哪里。** 经典 NRC 难以处理镜面光照，因为那里的出射辐射度随视线方向剧烈变化。作者报告，在 Bunny 和 Specular Sponza 场景上，它更快收敛到路径追踪参考，镜面质量也更好。
- **与 CG 的联系。** 它结合了两个标准工具：[实时光线追踪]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})中的辐射缓存，以及[实时渲染技术]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})中的 split-sum 近似，再加上[基于物理的渲染]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})中的微表面 BRDF。

### 13. [A Hybrid and Hierarchical Ray Tracing Method for Efficient 3D Gaussian Rendering](https://arxiv.org/abs/2610.13498) {#pd-13}

*Tiancheng Zhao 等（6 位作者）· 预印本（cs.AR）· 首次提交 2026-10-09*

- **它做什么。** H2-Ray 对算法和硬件进行协同设计，在 RT 核心式的光线追踪单元上加速三维高斯的光线追踪。
- **它怎么做。** 它包括三部分。**LB-SBVH** 是一种感知密度的均匀网格 BVH，用来平衡每个节点的工作量。**RCPR** 让一条代理光线与相邻光线共享遍历状态。**UIE** 是一条同时处理高斯和三角形图元的求交数据通路，其中 40% 的浮点单元是共享的。
- **新在哪里。** RaySplats 等高斯光线追踪渲染器在现有 GPU 上存在负载不均、遍历冗余和图元类型混杂的问题。作者使用改造后 RT 核心的周期精确模型，加上 RTX A5000 上的 CUDA 计时，报告相对 RaySplats 的几何平均加速为 3.77 倍，最高 9.26 倍。
- **与 CG 的联系。** 用光线追踪而不是光栅化来渲染高斯，可以得到反射、阴影和畸变相机等次级效果。参见[光线与路径追踪]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})中的 BVH、[实时光线追踪]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})中的硬件光追，以及 [3DGS 前沿]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})。

### 14. [Geometric Queries on Tessellation-Free Displaced Surfaces](https://arxiv.org/abs/2610.21584) {#pd-14}

*Bing Xu 等（3 位作者）· 预印本 · 首次提交 2026-10-15*

- **它做什么。** 直接在置换贴图（displacement map）表面上回答表面采样、镜面路径搜索和最近点查询，而不必先把表面细分成三角形。
- **它怎么做。** 方法构建一个纹理空间的层次结构。每个节点存储一个局部*仿射*高度平面，以及真实高度偏离该平面程度的保守上界。由平面和上界可以推出距离与求交界、采样所需的面积估计，以及镜面路径搜索所需的斜率界，每种查询都有各自的遍历算法。
- **新在哪里。** 以往的免细分方法主要处理光线求交，并且只存储最小/最大高度界，丢掉了高度在节点内的变化趋势。一阶（平面）界更紧，并能支持多得多的查询。
- **与 CG 的联系。** 置换贴图在不增加存储几何的情况下添加精细细节，这与 [生产引擎内部]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})中 Nanite 等虚拟化几何的目标相同。这些查询是[几何处理]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})和[路径追踪]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})的基本构件。

## 3. 神经渲染

NeRF、三维高斯泼溅、重建、前馈三维和重光照。三篇 SIGGRAPH Asia 2026 论文扩展了高斯场景能*容纳*的内容：X 光内部结构、离散的物体状态和体积视频。其余论文推进了**前馈**预测，从 4D 新视角合成一直到全局光照。背景知识见[三维高斯泼溅]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})和 [3DGS 前沿]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})。

### 15. [X-Splat: Unified Gaussian Splatting for Joint RGB and X-ray 3D Reconstruction](https://arxiv.org/abs/2610.23237) {#pd-15}

*Wangze Xu 等（7 位作者，含 Imari Sato 和 Takashi Ijiri）· SIGGRAPH Asia 2026 Conference Papers（已录用）· 首次提交 2026-10-16 · [项目页](https://zezeaaa.github.io/X-Splat/)*

- **它做什么。** 同时从 RGB 照片和 X 光图像重建同一个物体的高斯表示，让表面外观和内部结构存在于同一个模型中。
- **它怎么做。** 所有高斯共享一套几何参数（位置、协方差和密度），只有靠近表面的高斯额外携带颜色。两种模态通过几何代理进行配准（RGB 来自多视图立体，X 光来自 X 光几何），而不是先分别优化两组高斯再对齐。联合优化时，一个由 X 光几何导出的表面深度一致性损失引导 RGB 重建。
- **新在哪里。** 它用一套共享几何取代了“两次独立重建再配准”。作者在 InsideOut 和新的 Flower & Insect 数据集上进行了评估。
- **与 CG 的联系。** X 光图像是衰减的线积分，与[体积与参与介质]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }})和 [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) 中体渲染的透射率积分相同。X-Splat 要求同一组高斯既解释 RGB 的发射-吸收模型，又解释 X 光的纯吸收模型。

### 16. [SwitchSplat: Learning Discrete Object States from Casually Captured Scenes](https://arxiv.org/abs/2610.24812) {#pd-16}

*Yizheng Xie 等（6 位作者，含 Andrea Tagliasacchi）· SIGGRAPH Asia 2026（已录用）· 首次提交 2026-10-17 · [项目页](https://switchsplat.github.io)*

- **它做什么。** 对一段随手拍摄、物体状态会变化的场景（例如一扇门在某些帧中开着、在另一些帧中关着），构建一个高斯场景，其中的物体可以在各自状态之间独立**切换**，包括从未拍到过的组合。
- **它怎么做。** 一个静态的基础高斯集合被共享。每个可交互物体有一个*槽位*（slot），为每个离散状态各存一组高斯。高斯到槽位的分配是可微的，因此每个状态的几何和外观都能在没有标注的情况下从视频中学到。渲染时，可以组合任意槽位状态，并从任意视角渲染。
- **新在哪里。** 静态 3DGS 无法表示状态变化，以时间为条件的 4D 高斯只能回放拍摄到的序列。SwitchSplat 把场景分解成相互独立的离散变量，因此能够组合状态。
- **与 CG 的联系。** 它把重建结果变得更像带状态的游戏资产，是从[采集到 VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})走向可交互场景的一步。离散状态的视角也与[游戏引擎]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})存储可交互物体的方式一致。

### 17. [Holo4D: Holistic 4D Reconstruction as Geometric Control for Video Diffusion](https://arxiv.org/abs/2610.25276) {#pd-17}

*Yushi Lan 等（6 位作者）· NeurIPS 2026（已录用）· 首次提交 2026-10-18 · [项目页](https://nirvanalan.github.io/projects/holo4d/)*

- **它做什么。** 沿一条新的相机轨迹重新渲染单目视频，同时保持场景几何和运动的一致性，相当于对视频“重拍”。
- **它怎么做。** 首先，把整段视频中各点的三维轨迹重建成一个整体的 4D 骨架（scaffold）。骨架被投影到新相机视角中，它的几何与源视频外观一起作为条件，输入预训练的视频扩散模型；模型补全骨架没有覆盖的区域。更换 4D 重建器时，生成器无需重新训练。
- **新在哪里。** 以往的相机控制方法用每帧各自的深度图做形变（warp）。稠密的 4D 轨迹使场景在时间和视角上都保持一致。
- **与 CG 的联系。** 这是“几何引导生成器”的模式：4D 点表示被*渲染*（投影）到目标相机，扩散模型充当外观模型。参见[相机与多视图几何]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})中的投影，以及[视频世界模拟器]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})中的视频世界模型。

### 18. [RealMe: Immersive Volumetric Video from Minimal Captures](https://arxiv.org/abs/2610.30023) {#pd-18}

*Chenxu Zhou 等（7 位作者，含 Xiaowei Zhou 和 Jiaming Sun）· SIGGRAPH Asia 2026 Conference Papers（即将发表）· 首次提交 2026-10-21 · [项目页](https://zju3dv.github.io/realme)*

- **它做什么。** 只用几台低分辨率相机，而不是密集的影棚相机阵列，就能制作人物的体积视频（volumetric video）。
- **它怎么做。** 一个高分辨率视频扩散模型把稀疏、低分辨率的采集升级为在 4D 上一致的 2K 多视角视频，再送入标准的体积重建。采集端的信息通过布局感知的位置嵌入编码进潜变量。分解的时空注意力被改造以适应多视角布局。潜空间频域中的损失把生成视角的统计特性推向真实采集。
- **新在哪里。** 它用生成式的“视角加密”阶段取代了密集采集穹顶中的大部分相机。作者在 DNA-Rendering 和新的 RealVV 数据集上进行了评估。
- **与 CG 的联系。** 体积视频是 VR 远程临场的内容格式（[采集到 VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})）。“先生成缺失视角、再重建”是[三维与四维世界生成]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})中反复出现的主题。

### 19. [RADIANT: Object-Centric Feed-Forward Global Illumination](https://arxiv.org/abs/2610.32075) {#pd-19}

*Sarah Zhang 等（5 位作者，含 Wojciech Matusik）· 预印本 · 首次提交 2026-10-23*

- **它做什么。** 一个 Transformer，一次前向传播就为新场景渲染全局光照，不做光线追踪，也不做逐场景优化，而且开销随*物体*数量而不是三角形数量增长。
- **它怎么做。** 每个物体用固定的 32 个表面面片 token 概括。场景 Transformer 用 *SE(3) 不变的形状因子注意力*（form-factor attention）建模物体之间的光能交换：面片之间的距离和朝向进入 query-key 乘积，并由学习到的面积与材质增益加权。这对应于下文解释的辐射度（radiosity）方法中的几何形状因子。视图解码器让相机光线对场景 token 做交叉注意力，并用深度测试过的点泼溅引导主可见性。
- **新在哪里。** RenderFormer（SIGGRAPH 2025）为每个三角形建 token，注意力开销随网格分辨率二次增长。作者报告，色调映射后的 PSNR 为 32.2 dB，比 RenderFormer 高 3.3 dB；对 500 个物体的场景渲染一张 512x512 视图需要 0.83 秒。
- **与 CG 的联系。** 辐射度方法用**形状因子**（form factor）计算面片之间的光能交换，它表示离开面片 $i$ 的能量中到达面片 $j$ 的比例。对小面片，

$$
F_{i\to j} \approx \frac{\cos\theta_i \,\cos\theta_j}{\pi\, r^2}\, A_j ,
$$

其中 $r$ 是两个面片中心的距离，$\theta_i$ 和 $\theta_j$ 是各自法线与连线之间的夹角，$A_j$ 是接收面片的面积。下图计算了一个面片从另一个面片旁边滑过时的形状因子。RADIANT 的注意力是这个核的一种可学习、感知材质的推广；与公式一样，它只依赖相对位姿，因此是 SE(3) 不变的。背景知识见[基于物理的渲染]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})中的渲染方程和[光线与路径追踪]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})中的全局光照。

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-form-factor.svg" caption="RADIANT 注意力背后的几何形状因子。左：面片 $i$ 位于原点、朝上；面积 $A_j=0.1$ 的面片 $j$ 位于高度 2、朝下，并沿横向滑动距离 $y$。右：$F_{i\to j}$ 关于 $y$ 的函数。它按 $4A_j/(\pi r^4)$ 衰减，因为两个余弦都按 $2/r$ 缩小，距离项又贡献 $1/r^2$。圆点是正文中的两个算例。" %}

**算例。** 把面片 $i$ 放在原点，法线 $(0,0,1)$；把面积为 $0.1$ 的面片 $j$ 放在 $(0,0,2)$，法线 $(0,0,-1)$。此时 $r=2$，两个余弦都是 1，所以 $F = 0.1/(4\pi) \approx 0.00796$。把 $j$ 移到 $(0,2,2)$：现在 $r^2=8$，两个余弦都是 $2/\sqrt{8}\approx 0.707$，所以 $F = 0.5 \cdot 0.1/(8\pi) \approx 0.00199$，变成原来的四分之一。只考虑距离的学习型注意力会漏掉这两个余弦因子，这就是 RADIANT 在注意力中同时嵌入朝向和位置的原因。

```python
import numpy as np

def form_factor(xi, ni, xj, nj, Aj):
    """Point-to-patch form factor F_{i->j} for small patches."""
    d = xj - xi
    r2 = d @ d
    w = d / np.sqrt(r2)
    cos_i = max(ni @ w, 0.0)
    cos_j = max(nj @ -w, 0.0)
    return cos_i * cos_j * Aj / (np.pi * r2)

ni = np.array([0.0, 0.0, 1.0])
nj = np.array([0.0, 0.0, -1.0])
print(form_factor(np.zeros(3), ni, np.array([0.0, 0.0, 2.0]), nj, 0.1))  # ~0.00796
print(form_factor(np.zeros(3), ni, np.array([0.0, 2.0, 2.0]), nj, 0.1))  # ~0.00199
```

动手试试：下面的小部件在你移动面片 $j$ 时计算同一个函数。

{% include widget.liquid name="paper-digest-form-factor" height="420" caption="形状因子演示。把红色面片 $j$ 拖到面片 $i$ 上方的任意位置，并用滑块调整它的倾斜。读数显示 $r$、两个余弦和 $F_{i\to j}$，并与初始位置 $(0,2,2)$ 的 $F$ 作比较。可以试试：把 $j$ 竖直向上移动，观察 $F$ 按 $1/r^2$ 下降；让 $j$ 倾向 $i$，看 $\cos\theta_j$ 达到 1；把它向外倾斜，直到法线与指向 $i$ 的连线夹角超过 90 度（在初始位置约为倾斜 +45 度），$F$ 就降为 0。" %}

### 20. [FL4N: Feed-forward Latent Model for 4D Novel View Synthesis](https://arxiv.org/abs/2610.35854) {#pd-20}

*Eunbeen Hong 等 · 预印本 · 首次提交 2026-10-26 · [项目页与代码](https://cvlab-kaist.github.io/FL4N/)*

- **它做什么。** 一次前向传播，从单目视频合成*动态*场景的新视角，不使用显式的 4D 图元。
- **它怎么做。** 场景是一个时空潜变量，而不是一组运动的高斯。动态被建模为预训练静态场景潜先验之上的*残差*，因此模型只需要很少的动态训练数据。一个轻量的动态编码器利用静态场景特征，把物体运动与相机视差分开。训练只用图像合成损失。
- **新在哪里。** 以往的前馈 4D 方法预测显式的 4D 高斯，作者认为这会造成时间上的不一致和伪影。作者报告了实时渲染和最先进的 4D 新视角合成质量。
- **与 CG 的联系。** 它把表示推向“潜变量场景 + 网络解码”这一端，与显式泼溅正好相反（对比[快速辐射场]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})和 [3DGS 前沿]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})）。区分运动与视差是动态重建的核心难点（[相机与多视图几何]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})）。

### 21. [LucidLyra: Feed-Forward Generative 3D Scene Reconstruction and Joint Understanding via Multi-Task Distillation](https://arxiv.org/abs/2610.40495) {#pd-21}

*Oliver Hahn 等（10 位作者；项目页托管于 NVIDIA Research）· 预印本 · 首次提交 2026-10-29 · [项目页](https://research.nvidia.com/labs/sil/projects/lucidlyra)*

- **它做什么。** 一次前向传播把视频潜变量转换成三维高斯场景，场景中还带有开放词汇语义和实例特征。
- **它怎么做。** 它把两类教师蒸馏进同一个网络：一个相机可控的视频扩散模型提供几何和外观，冻结的二维视觉基础模型提供语义与实例特征。每个预测出的高斯存储几何、颜色、语义嵌入和与类别无关的实例特征。不需要逐场景优化，也不需要三维标注；潜变量形式还能扩展到动态场景的单目视频。
- **新在哪里。** 以往的管线把生成式三维重建器和单独的 3DGS 分割步骤串接起来。联合预测在保持重建质量的同时增加了场景理解。
- **与 CG 的联系。** 携带颜色以外特征的高斯，用与 3DGS 相同的 alpha 合成来渲染，只是混合的是特征而不是 RGB，L3G-World（条目 28）用的也是这个技巧。参见[三维高斯泼溅]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})和[三维与四维世界生成]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})中生成的世界。

## 4. 世界模型

视频与交互式世界模型、三维/四维世界生成、JEPA 与评测。本月的头条是一次结构性转变：多个系统**把世界状态与像素分离**。传统引擎或显式的三维记忆保存状态，视频生成器只负责渲染（见下图）。背景知识见[视频世界模拟器]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})和 [JEPA 与评测]({{ '/blog/2026/world-models-05-jepa-evaluation-and-open-problems/' | relative_url }})。

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-engine-vs-generator.svg" caption="构建可玩世界模型的两种方式。上：端到端模型 $G_\theta$ 把过去的帧 $x_{\le t}$ 和动作 $a_t$ 映射为下一帧，世界状态只隐含在像素之中。下（Matrix-Game 4.0、BoxWorld）：显式引擎用可执行规则更新状态 $s_{t+1}=f(s_t,a_t)$，廉价的代理渲染 $r(s_{t+1})$（低多边形几何或布局框）把状态呈现出来，视频生成器只在其上添加外观。请顺着虚线箭头看：在下方的设计中，生成器从不决定发生什么，只决定看起来怎样。" %}

### 22. [Orbia: Do Generated Videos Form a Consistent 3D World?](https://arxiv.org/abs/2610.20693) {#pd-22}

*Dongyue Lu 等（23 位作者）· 技术报告 · 首次提交 2026-10-14 · [项目页](https://orbia-bench.github.io/) · [代码](https://github.com/worldbench/Orbia)*

- **它做什么。** 一个基准测试，检验交互式视频世界模型在相机先探索、再**回访**同一地点时，能否保持一致的三维世界。
- **它怎么做。** 它在六种“探索-回访”协议中定义了 720 个测试实例，其中一些长达一分钟。用几何探针测量三件事：相对于已配准 RGB-D 参考的*输入保持*；再次看到时生成内容的*持久性*；以及 *3D 自洽性*，包括跨视角深度与特征对应、尺度一致性，以及用生成帧拟合的高斯泼溅模型渲染留出视角的效果。
- **新在哪里。** 以往的世界模型评测大多使用感知类视频指标，忽略了世界在几何上是否一致。作者评测了 27 个以文本、动作或相机为条件的模型。
- **与 CG 的联系。** 它把三维重建（[相机与多视图几何]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})、[3DGS]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})）当作衡量生成模型的*测量仪器*，具体回答了 [JEPA、评测与开放问题]({{ '/blog/2026/world-models-05-jepa-evaluation-and-open-problems/' | relative_url }})中提出的评测问题。

### 23. [Matrix-Game 4.0: Harnessing Video Models for Real-Time Playable Game Worlds](https://arxiv.org/abs/2610.27999) {#pd-23}

*Jihai Zhang 等（18 位作者）· 预印本 · 首次提交 2026-10-20 · [项目页](https://matrix-game-v4-0.github.io/page/) · [代码](https://github.com/SkyworkAI/Matrix-Game)*

- **它做什么。** 一个实时可玩的游戏世界系统，把游戏*逻辑*与画面*生成*分开。
- **它怎么做。** 一个轻量引擎跟踪世界状态、执行规则，并渲染低多边形代理。一个多模态编程智能体把玩家的想法转换为游戏代码和动态描述（caption）。一个自回归视频模型再把代理“重新渲染”成细节丰富的画面。为了速度，它被蒸馏为因果生成器，每次用一到两步去噪输出四帧。
- **新在哪里。** 以往的交互式世界模型（包括早期的 Matrix-Game 版本）隐式地生成整个世界，没有持久状态，也没有可执行规则。作者报告，在单张 RTX 5090 上达到 480p、60 FPS，从按键到显示的延迟为 112 毫秒。
- **与 CG 的联系。** 用图形学的话说，视频模型是作用在类似 G-buffer 的代理渲染上的*神经着色通道*，引擎则是普通的[游戏循环]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})。这正是 [AI 与图形引擎]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})中关于神经游戏引擎的争论，这里给出的答案是混合方案。

### 24. [Rethinking Video Autoencoders for Interactive World Models](https://arxiv.org/abs/2610.30129) {#pd-24}

*Adrien Ramanana Rahary 等（5 位作者，含 Patrick Pérez）· 预印本 · 首次提交 2026-10-21 · [博客、代码与模型](https://kyutai.org/blog/2026-10-21-cadre)*

- **它做什么。** 提出 CADRE，一族不同压缩率的因果扩散表示自编码器（causal diffusion representation autoencoders），并研究自编码器的选择如何影响交互式世界模型。
- **它怎么做。** 族内所有成员共享一个扩散解码器（经过自蒸馏，只需一步或几步），区别只在于作用于冻结视觉特征上的一个小瓶颈层。在每个成员之上训练一个世界模型，分别在操作和导航环境中，绘制延迟与质量之间的前沿。
- **新在哪里。** 大多数世界模型直接复用为离线文生视频设计、压缩率固定的自编码器。研究发现：操作任务能容忍*时间*压缩，相机移动的导航任务能容忍*空间*压缩，而在强压缩下扩散解码器优于感知回归。作者报告，CADRE 的成员构成了延迟-质量前沿的大部分。
- **与 CG 的联系。** 潜空间就是世界模型的“帧缓冲格式”，选择其压缩率就像在引擎中选择纹理压缩或分辨率。参见[生成模型基础]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})中的潜扩散。

### 25. [World-in-Context: Interactive Video World Modeling with In-Context Conditioning](https://arxiv.org/abs/2610.33169) {#pd-25}

*Harold Haodong Chen 等（7 位作者）· 预印本 · 首次提交 2026-10-23 · [项目页](https://haroldchen19.github.io/WiC-site/)*

- **它做什么。** 为交互式视频世界模型提供视角、动作和相机控制的统一条件化方案。例如，它能按指令在第一人称与第三人称视角之间切换。
- **它怎么做。** *上下文内条件化*（In-Context Conditioning）把视角、动作和相机控制都变成显式 token，与视频 token 处在同一个自注意力空间。*Interaction-Transport RoPE* 按累计的控制变化来调整时间注意力的旋转位置编码，使执行动作前后保持连续。显式的视角 token 让视角切换可以从单视角数据中学到。
- **新在哪里。** 以往的模型把视角模式隐含在描述文本中，把动作和相机运动纠缠在一起，并使用分散的条件分支。作者报告视角切换成功率为 93.8%，而 5B 基线为 18.8%；在 WBench 导航上，他们的 5B 模型得分 81.5，22B 的 EchoWM 为 81.6。
- **与 CG 的联系。** 把相机与智能体动作分开，正对应渲染器中视图变换与模型变换的分离（[图形学路线图与数学]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})）。参见[视频世界模拟器]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})中的动作条件化。

### 26. [BoxWorld: Let World Engines Control and Video Generators Render](https://arxiv.org/abs/2610.36371) {#pd-26}

*Zike Wu 等（7 位作者，含 Renjie Liao）· 预印本 · 首次提交 2026-10-26 · [项目页](https://boxworld-web.github.io)*

- **它做什么。** 通过把交互逻辑与渲染分开，构建实时交互的视频世界，其中物体行为由用户定义。
- **它怎么做。** 一个编程智能体根据用户规则编写“Box World Engine”。引擎把物体状态表示为布局框、持久属性和状态变量。一个基于框状态的生成式渲染器把这个状态流自回归地转换为视频。训练分三个阶段：把物体对应到框、从游戏视频中学习状态转移，以及蒸馏展开过程。论文还发布了 PairedStateBench。
- **新在哪里。** 与 Matrix-Game 4.0 同一周、同一思路，但状态更轻量：用布局框代替低多边形代理。作者报告它大幅优于端到端世界模型。
- **与 CG 的联系。** 布局框就是场景图中的包围体，生成器是以它们为条件的学习型渲染器（见上图）。可对比[引擎剖析]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})中的场景图与 ECS。

### 27. [SWIM: Learning What Matters from Behaviors for JEPA World Models](https://arxiv.org/abs/2610.36662) {#pd-27}

*Jiaming Hu 等（14 位作者）· 预印本 · 首次提交 2026-10-27*

- **它做什么。** 当 JEPA 世界模型用仿真器状态监督时，SWIM 学习每个状态特征应占多大权重，而不是均匀加权。
- **它怎么做。** 一个逆动力学模型根据当前状态和每个特征观测到的未来位移，预测所记录的动作。它学到的权重定义一个加权状态度量，潜空间距离与该度量对齐。逆动力学模型只在训练时需要，因此规划时没有额外开销。
- **新在哪里。** 它取代了人工挑选或均匀的状态权重。作者报告，在五个仿真操作任务上，规划成功率相对均匀加权稳定提升。
- **与 CG 的联系。** 它关心表示应该*度量*什么：真正被动作改变的那些特征。这把 [JEPA、评测与开放问题]({{ '/blog/2026/world-models-05-jepa-evaluation-and-open-problems/' | relative_url }})中的 JEPA 视角与[什么是世界模型]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})中的规划联系起来。

### 28. [L3G-World: Real-Time Infinite World Generation with Latent 3D Gaussian Memory](https://arxiv.org/abs/2610.40614) {#pd-28}

*Jinhyeok Choi 等（8 位作者，含 Seungryong Kim）· 预印本 · 首次提交 2026-10-29 · [项目页](https://cvlab-kaist.github.io/L3G-World/)*

- **它做什么。** 一个交互式世界模型，它的记忆是一个三维高斯场景，记忆随探索过的*空间*增长，而不是随视频流的长度增长。
- **它怎么做。** 前馈重建构建一个*潜三维高斯记忆*，其中每个高斯存储一个 VAE 潜特征而不是 RGB 颜色。因此记忆可以直接泼溅到视频扩散 Transformer（DiT）的潜空间中，无需先解码成 RGB 再重新编码。记忆更新器在新看到的区域生成新的高斯并细化已有高斯，并与 DiT 自回归地交替进行。
- **新在哪里。** 上下文窗口式的记忆会忘掉旧地点，显式 RGB 三维记忆渲染和重新编码都很慢。作者报告，与各项指标上最高效的已有三维记忆基线相比，图元数量最多减少 38.6 倍，记忆渲染快 359 倍，生成速度为 9 FPS。
- **与 CG 的联系。** 潜空间渲染就是把颜色换成特征的 3DGS 合成（见图）。回访一个地点，就是从新相机*渲染*记忆，这正是 Orbia（条目 22）所测量的一致性。参见[三维高斯泼溅]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})和[三维与四维世界生成]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})。

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-latent-gaussian-memory.svg" caption="潜高斯记忆（L3G-World），按我对论文的理解绘制。每个高斯 $k$ 存储均值 $\mu_k$、协方差 $\Sigma_k$、不透明度 $\alpha_k$ 和一个潜特征向量 $f_k$（彩色小条），而不是 RGB。从当前相机泼溅时合成 $z(p)=\sum_k T_k\,\alpha_k G_k(p)\,f_k$，其中透射率 $T_k=\prod_{l<k}(1-\alpha_l G_l(p))$，就是把颜色换成特征的 3DGS 公式。得到的潜特征图作为 DiT 的条件，DiT 预测下一段视频。随后更新器为新看到的区域添加高斯（虚线椭圆），并细化旧的高斯。" %}

## 5. 具身智能

视觉-语言-动作模型、机器人学习、人形机器人、仿真与数据。本月图形学无处不在：三篇论文把**随手采集的数据变成高斯泼溅数字孪生**，并在其中训练机器人；一篇构建了每秒渲染数百万帧的光线追踪仿真器；还有一篇为人形机器人控制学习了一个可微世界模型。背景知识见[仿真平台]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})和[视觉-语言-动作模型]({{ '/blog/2026/embodied-ai-05-vision-language-action-models/' | relative_url }})。

### 29. [Splat2Act: From Captured Scenes to Personalized VLA Manipulation](https://arxiv.org/abs/2610.13945) {#pd-29}

*Xiaomeng Ye 等（6 位作者）· 预印本 · 首次提交 2026-10-09 · [项目页](https://splat2act.github.io)*

- **它做什么。** 一条自动化的“真实-仿真-真实”（real-to-sim-to-real）管线，把预训练的 VLA π0.5 个性化到用户自己扫描的住宅或建筑中。
- **它怎么做。** 手持手机扫描被重建为 3DGS 数字孪生。管线找出可放置物体的容器，生成拾取任务，并用拥有特权信息的仿真预言器（oracle）生成示范。微调分两个阶段：先用公开的物体资产，再用用户自己的物体和目标场景。
- **新在哪里。** 以往的真实到仿真工作大多只重建一张桌面，它则在建筑尺度上工作，最终得到个性化的策略。作者报告，π0.5 在采集场景中的拾取成功率从 0% 提升到个性化后的 62.5%，在真实的 Stretch 3 机器人上的一个 12 任务子集上达到 63.9%，与同一策略在这些任务上的仿真成功率 66.7% 很接近。他们在 101 个扫描环境中生成了超过 68,000 条示范。
- **与 CG 的联系。** 从机器人相机视角渲染泼溅孪生，*就是*仿真器的相机模型，它的真实感决定了视觉上的仿真到真实差距。采集一侧见[采集到 VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})，机器人一侧见[仿真平台]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})。

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-real2sim2real.svg" localized="true" width="90%" caption="按我对论文的理解画出的 Splat2Act“真实→仿真→真实”流程。手机扫描先重建为 3DGS 数字孪生；从机器人自身相机视角渲染这些高斯（蓝色箭头）就是仿真器的相机模型，因此任务生成和特权示范都在扫描得到的场景里完成。VLA 分两阶段微调后部署到真实机器人上。下方是作者报告的 π0.5 抓取成功率：先是在扫描场景中个性化之前与之后，然后是在同一个 12 任务子集上分别于仿真和真实 Stretch 3 上的结果。请比较最后两根柱子，它们衡量的是同一组任务：高斯孪生中 66.7%，真机上 63.9%。在孪生中测得的成功率能相当准确地预测真机表现。" %}

### 30. [Learning Adaptable Dexterous Skills via Hybrid Dexterous Mimicking](https://arxiv.org/abs/2610.28628) {#pd-30}

*Yuxuan Kuang 等（8 位作者）· 预印本 · 首次提交 2026-10-20 · [项目页](https://yuxuank.com/AdaDex/)*

- **它做什么。** AdaDex 把一段只有几秒的手-物交互轨迹（来自动作捕捉或视频重建）变成灵巧的机器人技能，并能适应新的物体位姿和目标。
- **它怎么做。** *混合灵巧模仿*在两类并行环境中训练同一个目标条件强化学习策略。跟踪环境给出稠密的模仿奖励，教会策略类人的手指策略；泛化环境从加噪的状态和目标开始，只给物体成功的稀疏奖励，推动技能超越参考动作。
- **新在哪里。** 面向目标的强化学习能泛化，但手指动作不自然；纯动作跟踪又无法偏离参考。把两者混在一个策略中可以兼得。作者报告了仿真到仿真以及到真实世界的迁移。
- **与 CG 的联系。** 它是基于物理的角色动画在机器人上的版本，后者以 DeepMimic 的方式用强化学习跟踪动捕片段（[动画与角色]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})）。强化学习见[面向机器人的强化学习]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})。

### 31. [SuperMimic: Scaling Humanoid Whole-Body Control with One Differentiable World Model](https://arxiv.org/abs/2610.28480) {#pd-31}

*Qiayuan Liao 等（7 位作者）· CoRL 2026，口头报告（已录用）· 首次提交 2026-10-20 · [项目页](https://supermimic.github.io)*

- **它做什么。** 在超过 129,000 段人体动作上训练一个人形机器人动作跟踪策略，所需计算只是通常的一小部分。
- **它怎么做。** 用标准刚体仿真器记录的状态转移拟合一个可微世界模型，并在所有动作之间共享。它与跟踪策略联合训练。策略随后在短的想象展开上做随时间反向传播，得到*解析*梯度，而不只依赖无模型强化学习。
- **新在哪里。** 基线是在 128 张 GPU 上训练的最先进无模型跟踪器。作者报告，SuperMimic 在单张 GPU 上 3 小时就超过了它的回报，GPU 时数少 1000 倍以上；在 129,514 段动作上失败 25 次，而基线失败 179 次。
- **与 CG 的联系。** 物理引擎的可学习、可微代理，与 Dreamer 的想象（[什么是世界模型]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})）是同一个想法，这里用于角色物理（[基于物理的仿真]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})、[动画与角色]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})）。

### 32. [HyperDrone: Simulation-to-Reality Transfer at Millions of Frames per Second](https://arxiv.org/abs/2610.28950) {#pd-32}

*Jonas Eschmann 等（2 位作者）· CoRL 2026（已录用）· 首次提交 2026-10-20*

- **它做什么。** 一个常驻 GPU、批量运行的四旋翼仿真器，内置光线追踪渲染器，速度足以从像素训练基于视觉的策略。
- **它怎么做。** HyperLux 渲染器运行在 OptiX、Vulkan、Metal 和 WebGPU 上，输出 RGB、深度、分割、法线和光流，保真度可调：反射、运动模糊和 PBR 材质都可以开启。它与优化过的多旋翼动力学配合使用。一个完全在仿真中训练的视觉偏航控制策略，在真实的 Crazyflie 无人机上运行。
- **新在哪里。** 现有的批量四旋翼仿真器没有这种吞吐量下的基于物理的光线追踪渲染。作者报告，比最先进的批量四旋翼仿真器快 20 倍以上，在消费级 GPU 上达到每秒数百万帧。
- **与 CG 的联系。** 这是为*学习*而不是为好看设计的渲染器：大量很小的帧、类似 G-buffer 的任意输出通道、按实验选择的保真度。参见[实时光线追踪]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})、[GPU API]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}) 和[物理与仿真引擎]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})。

### 33. [Real2Sem2Real: 3D Semantic Augmentations for Robot Learning from a Single Human RGB Demonstration](https://arxiv.org/abs/2610.28880) {#pd-33}

*Matthew Strong 等（6 位作者）· 预印本 · 首次提交 2026-10-20 · [项目页](https://real2sem2real.github.io/)*

- **它做什么。** 把一段人完成任务的单目 RGB 视频，变成覆盖整个物体类别的数千条机器人示范。
- **它怎么做。** 用蒸馏了 DINOv3 特征的高斯泼溅跟踪物体的 6 自由度位姿。生成的“数字表亲”（digital cousins，同类别的相似物体）与示范中的物体对齐，包括功能部件。人手动作被映射为机器人可行的抓取，数据在 IsaacSim 中渲染或在 MuJoCo 中仿真。
- **新在哪里。** 以往的管线需要深度传感器、把机器人贴到二维视频上，或只覆盖示范过的那个物体。作者报告，约两小时生成 2,000 多段数据；每个任务只用一段人类视频训练的 VLA，在两台真实机器人和四个任务上达到或超过了用遥操作数据训练的策略。
- **与 CG 的联系。** 携带特征的高斯（同条目 21 和 28）在这里用于位姿跟踪。部件对齐的数字表亲是一个[几何处理]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})问题：形状之间的对应。另见[模仿学习]({{ '/blog/2026/embodied-ai-04-imitation-learning/' | relative_url }})。

### 34. [Zero-HLM: Generalizable Humanoid Loco-Manipulation without Real Robot Data](https://arxiv.org/abs/2610.35075) {#pd-34}

*Dianyi Yang 等（12 位作者）· 预印本 · 首次提交 2026-10-26 · [项目页](https://young-bit.github.io/zero-hlm/)*

- **它做什么。** 只用智能手机采集和仿真示范训练人形机器人的移动操作（loco-manipulation）策略，并零样本迁移到 Unitree G1。
- **它怎么做。** *高斯引导的智能体式场景重建*把视觉场景（泼溅）与物理场景（碰撞几何）对齐。随后根据展开反馈细化全身动作和接触几何，得到 4,800 条经过物理验证的示范。一个 GR00T N1.7 策略只用这些数据训练。
- **新在哪里。** 它不需要任何真实机器人数据。作者报告，纯仿真策略的平均全任务成功率为 66.7%，而用真实机器人数据训练的策略为 46.7%。
- **与 CG 的联系。** 难点在于让同一场景的*两种*表示保持一致：给相机用的辐射表示和给物理用的碰撞表示。游戏引擎用分开的渲染网格和碰撞网格解决的正是同一个问题（[物理与仿真引擎]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})）。

### 35. [TAPESTRY: A Single Backbone for Video Generation and Robot Control](https://arxiv.org/abs/2610.36823) {#pd-35}

*Jeremy A. Collins 等（7 位作者）· CoRL 2026（已录用）· 首次提交 2026-10-27 · [项目页](https://tapestry-wam.github.io)*

- **它做什么。** 把预训练的视频扩散 Transformer 变成一个机器人策略，而推理时**不**生成视频。
- **它怎么做。** 每个动作时间步被线性投影到 VAE 图块（patch）的维度，作为单图块 token 由建模视频的同一个主干处理。训练混合三种扩散目标：仅视频（机器人和人类视频）、视频加动作（示范数据），以及以干净图像潜变量为条件的仅动作。测试时一步 DDIM 就得到一个动作块（action chunk）。
- **新在哪里。** “世界-动作模型”（world-action models）在测试时要对未来帧去噪来做规划，速度很慢。TAPESTRY 保留视频先验却跳过视频生成。作者报告，在消费级硬件上每个动作块耗时 84 毫秒。
- **与 CG 的联系。** 它把动作当作视频潜变量中的又一个“像素”，是 VLA 模型（[视觉-语言-动作模型]({{ '/blog/2026/embodied-ai-05-vision-language-action-models/' | relative_url }})）与视频世界模型（[视频世界模拟器]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})）共享表示这一思路的极端形式。

## 6. 人机交互 / XR / AR / VR

交互技术、显示、虚拟化身、第一视角感知与人机协作。两条主线最突出：**把高斯泼溅当作 XR 内容**（SplatXR、DomeGS），以及面向显示的**感知目标函数**（HoOPOE，加上条目 11 的抖动掩盖）。背景知识见[采集到 VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})和[具身智能与 XR 和人机交互]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})。

### 36. [HoOPOE: A Holography-Optimized Perceptual ObjectivE function](https://arxiv.org/abs/2610.17474) {#pd-36}

*Ethan Chen 等（9 位作者）· SIGGRAPH Asia 2026（即将发表）· 首次提交 2026-10-12*

- **它做什么。** 一个面向计算全息（computer-generated holography，CGH）的感知损失函数，让优化出的全息图中*可见*的散斑更少。
- **它怎么做。** CGH 优化空间光调制器的相位图，使传播后的光场匹配目标图像，这里的目标是由网格渲染的焦点堆栈（focal stack）。HoOPOE 用一个关于人眼对时空频率和颜色敏感度的模型取代像素损失，并调整其参数以适合作为 CGH 目标函数。
- **新在哪里。** MSE、SSIM、LPIPS 等通用图像损失对所有误差一视同仁，而散斑只在某些频带中可见。在作者的用户研究中，参与者约 68% 的时间更偏好 HoOPOE 的全息图，而不是次优目标函数的结果。
- **与 CG 的联系。** 全息近眼显示是能显示真实深度的 AR 眼镜的候选方案。整个管线是一个端到端优化的可微波动光学渲染器（[可微渲染]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})），损失则是[具身智能与 XR 和人机交互]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})中讨论的那类感知度量。

### 37. [FlowAvatar: Real-Time Full-Body Avatars from Sparse Egocentric Inputs on Consumer XR Devices](https://arxiv.org/abs/2610.16277) {#pd-37}

*Chenfeng Gao 等（7 位作者）· IEEE ISMAR 2026（已录用）· 首次提交 2026-10-12 · [代码](https://github.com/SPICExLAB/FlowAvatar)*

- **它做什么。** 一个在一体式头显（Meta Quest Pro）上实时运行的个性化全身虚拟化身。
- **它怎么做。** 它把头显提供的稀疏信号（头部和手部位姿、手部关节、面部表情与眼动）融合成全身姿态。专为空间和时间一致性设计的损失让姿态保持稳定。姿态随后驱动一个外观与用户相似的个性化化身。
- **新在哪里。** 作者报告，与以往的稀疏输入姿态估计器相比，在 AMASS 上时间一致性达到最先进水平、精度具有竞争力。两项小规模用户研究（N=12 和 N=10）发现，只有完整跟踪和个性化外观两者兼具，才能带来正面的具身感（sense of embodiment）。
- **与 CG 的联系。** 从少数跟踪器推断完整骨架，是一个带学习先验的逆运动学问题（[动画与角色]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})）。化身的具身感是[具身智能与 XR 和人机交互]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})中的人机交互问题。

### 38. [SplatXR: A Toolkit for Multi-Layered Extended Reality via On-Headset 3D Gaussian Splatting](https://arxiv.org/abs/2610.26338) {#pd-38}

*Cyrus Vachha 等（3 位作者）· UIST 2026（已录用）· 首次提交 2026-10-19 · [项目页](https://splatxr.github.io)*

- **它做什么。** 一个 Unity 工具包，让高斯泼溅成为一等 XR 内容：在头显上，采集到的物体可以投射阴影、发生碰撞，并与虚拟物体融合。
- **它怎么做。** 它包含五个组件：独立的泼溅渲染器、泼溅到网格的重建、泼溅物理、泼溅混合，以及卸载到外部计算的头显端物体采集与重建。网格为泼溅补上了它们缺少的显式表面，所以阴影和碰撞得以实现。
- **新在哪里。** XR 管线围绕多边形构建，并把物理内容和数字内容分开。SplatXR 把基于三维基础模型的重建直接放进 XR 交互循环，并通过演示应用和一项小规模开发者研究进行验证。
- **与 CG 的联系。** 它是“泼溅没有表面”这一问题的工程解法：为物理和阴影导出代理网格，外观仍由泼溅负责，与 Zero-HLM（条目 34）相同。参见[采集到 VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})和[几何处理]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})。

### 39. [V-JEPA Hand: Simple, Accurate and Fast 3D Hand and Camera Trajectory Recovery from Egocentric Videos](https://arxiv.org/abs/2610.26780) {#pd-39}

*Ruicheng Li 等（6 位作者）· 预印本 · 首次提交 2026-10-19 · [项目页](https://qft-333.github.io/V-JEPA-Hand-Page/)*

- **它做什么。** 一个前馈模型从第一视角视频中，在世界坐标系下同时恢复双手的三维运动*和*相机自身的运动。
- **它怎么做。** 自监督的 V-JEPA 2.1 视频编码器连接一个基于 query 的预测器，逐帧输出手部姿态、手是否出现以及相机运动。相机运动把双手放进同一个世界坐标系。训练混合使用伪标注视频和高精度三维标注。
- **新在哪里。** 它用一个网络取代了多阶段管线（检测、重建手、再用 SLAM 估计相机）。作者报告，在 ARCTIC、HOT3D 和 EgoStandard 上优于对比基线，在单张 RTX A6000 上达到 93.4 FPS。
- **与 CG 的联系。** 把手部运动与头部运动分开，就是[相机与多视图几何]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})中相机运动与物体运动的分离问题。它也是 JEPA 编码器的一个实际用例（[JEPA]({{ '/blog/2026/world-models-05-jepa-evaluation-and-open-problems/' | relative_url }})），而第一视角手部跟踪正是 XR 交互的输入层。

### 40. [Bringing physics-based controller policies to virtual reality](https://arxiv.org/abs/2610.26278) {#pd-40}

*Joan Llobera 等（5 位作者）· 预印本 · 首次提交 2026-10-19*

- **它做什么。** 把基于物理的角色控制器带进能在 VR 中运行的运行时（Unity3D 和 WebXR）。
- **它怎么做。** 用 JAX 重新实现 DeepMimic、AMP 和 ADD，并在 GPU 上的 MuJoCo-MJX 中训练。策略被导出到 Unity3D，并为多个平台编译，包括 Android 头显。论文还提出了一个*动画保真度指数*（animation fidelity index）来比较控制器。
- **新在哪里。** 它是一条实用的管线，而不是新算法。作者报告，训练比传统 CPU 方案快约 50 倍，并发现在 MJX 中训练的 DeepMimic 和 ADD 在所比较的方法中保真度最好。
- **与 CG 的联系。** 基于物理的角色（[动画与角色]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})）在运行时需要物理引擎。把 MuJoCo 训练与引擎部署连接起来，正是[物理与仿真引擎]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})的主题。

### 41. [GenXR-Bench: Benchmarking Coding Agents for Interactive XR Development](https://arxiv.org/abs/2610.29014) {#pd-41}

*William Huang 等（16 位作者）· 预印本 · 首次提交 2026-10-21 · [代码](https://github.com/whuang37/genxr-bench)*

- **它做什么。** 一个包含 112 个任务的基准，用来评测开发 XR 应用的编程智能体：24 个功能任务、21 个缺陷修复任务和 67 个完整应用生成任务。
- **它怎么做。** 留出的测试把脚本化和自适应的交互与程序断言、视觉断言结合起来。测试集在消费级 XR 硬件上运行应用，并与盲评的专家判断进行了校验。
- **新在哪里。** 作者称它是第一个端到端评测 XR 开发编程智能体的基准。他们报告，十个模型中最好的 Pass@1 只有 50.9%，失败集中在异步传感器生命周期、物理落地（physical grounding）和具身交互上。
- **与 CG 的联系。** 它衡量 LLM 智能体对帧循环、场景图和空间输入等引擎概念的掌握程度。这些就是 [AI 与图形引擎]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})中的“编辑器里的 LLM 智能体”，Matrix-Game 4.0 和 BoxWorld（条目 23 和 26）中的编程智能体面对的也是同样的任务。

### 42. [DomeGS: Perceptually Consistent Background Completion for Unbounded 3D Gaussian Splatting in Virtual Reality](https://arxiv.org/abs/2610.37172) {#pd-42}

*Anastasiya Pechko 等（7 位作者）· 预印本 · 首次提交 2026-10-27*

- **它做什么。** 补全无界户外 3DGS 场景缺失的地平线和天空，让它们在 VR 中显得完整、看着舒适。
- **它怎么做。** 它不是把重建结果放进单独的天空盒（skybox）或天空穹顶，而是让背景成为 3DGS 重建本身的一部分，使前景与背景构成一个一致的环境。
- **新在哪里。** 它解决的是天空盒与重建几何融合不佳的问题。作者报告了一项 36 人的研究：与天空盒相比，临场感和真实感都显著更高（两者均为 p = 0.042）。
- **与 CG 的联系。** 天空盒是表现“无限远”内容的经典环境贴图技巧（[着色与纹理]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})）。无界场景的参数化是 3DGS 的已知问题（[3DGS 前沿]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})），DomeGS 则把它当作临场感问题来评估，正如[采集到 VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})所讨论的。

## 本月趋势

下面的矩阵给出每个条目使用或改变了计算机图形学的哪些部分。请按列阅读：**渲染**（42 篇中 24 篇）和**表示**（21 篇）占主导，仿真（18 篇）紧随其后，因为机器人和世界模型如今与图形学一样依赖仿真。

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-cg-matrix.svg" width="80%" caption="与计算机图形学的关系。行是 42 个条目，按类别着色，并标注条目编号和简称。列依次为表示、渲染、几何、仿真、动画和交互。大圆点表示该论文使用或改变了 CG 的这一部分；底部数字是每列合计。注意其中的块状结构：引擎论文（橙色）几乎全在渲染和表示两列，具身智能论文（红色）集中在表示和仿真两列，XR 论文（青色）则分布在每一列。" %}

**1. 引擎回来了，上面加了一个生成器。** Matrix-Game 4.0（23）和 BoxWorld（26）都在 10 月 20 日那一周出现，并且各自独立地做出同样的架构选择：显式引擎掌握状态和规则，视频模型只负责渲染。L3G-World（28）在记忆上做了同样的选择：用显式的三维高斯存储取代长上下文窗口。Orbia（22）说明了原因：相机回访一个地点时，端到端模型会发生漂移。这对图形学研究者是好消息。代理几何、G-buffer、场景图和渲染到潜空间都是图形学概念，[AI 与图形引擎]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})也因此成为世界模型的设计手册。

**2. 高斯成为通用货币。** 仅在这一个月里，高斯就是 XR 内容（SplatXR、DomeGS）、机器人训练世界（Splat2Act、Zero-HLM、Real2Sem2Real）、世界模型的记忆（L3G-World）、语义的载体（LucidLyra）、多模态体积（X-Splat）、可切换的物体（SwitchSplat），也是新硬件和随机渲染器的目标（H2-Ray、SteadySplats）。尚待解决的工程问题，正是 SplatXR 和 Zero-HLM 都用代理来解决的那个：泼溅有外观而没有表面，所以物理和阴影需要第二种表示。

**3. 前馈取代逐场景优化，连光传输也不例外。** RADIANT（19）预测全局光照，FL4N（20）和 LucidLyra（21）预测场景，PhysSkin++（4）预测仿真子空间，V-JEPA Hand（39）预测手和相机的轨迹，都只需一次前向传播。在物理规律已知的地方，最好的设计会把物理写进架构：RADIANT 的注意力对应辐射度形状因子，Neuroll（3）则在训练时让仿真器在环。

**4. 可微物理走向规模化。** DiffGIPC（2）让接触丰富的 IPC 仿真以 GPU 速度可微；SuperMimic（31）学习刚体仿真器的可微代理，在 12.9 万段动作上训练人形机器人控制。过去只能离线研究的逆问题，正在变成训练循环。

**5. 以感知为目标。** HoOPOE（36）为人眼所见优化全息图，抖动掩盖（11）为注视点显示中运动的眼睛所感知的效果优化，Tabula Rasa（1）控制噪声随时间呈现的样子，DomeGS（42）用临场感而不是 PSNR 来评估。在 XR 中，度量标准就是观察者本身。

**接下来值得关注：**

- SIGGRAPH Asia 2026 会议本身（本期多篇论文将在会上发表）及其完整论文列表。
- “引擎 + 生成器”式世界模型是否会发布可供他人继续开发的代码。Matrix-Game 4.0 表示代码和模型已公开。
- 闭环的基准：Orbia 式的世界模型三维一致性测试，以及 GenXR-Bench 式的、针对构建交互式三维内容的智能体的测试。
- 真实到仿真的管线从桌面走向整栋建筑，从操作走向人形机器人。

## 全部条目一览

| # | 类别 | 论文 | 状态 | 首次提交 | 链接 |
| --- | --- | --- | --- | --- | --- |
| 1 | 图形学 | Tabula Rasa | SIGGRAPH Asia 2026 | 2026-10-08 | [arXiv](https://arxiv.org/abs/2610.11653) |
| 2 | 图形学 | DiffGIPC | 预印本 | 2026-10-13 | [arXiv](https://arxiv.org/abs/2610.19091) |
| 3 | 图形学 | Neuroll | 预印本 | 2026-10-03 | [arXiv](https://arxiv.org/abs/2610.04689) |
| 4 | 图形学 | PhysSkin++ | 预印本 | 2026-10-19 | [arXiv](https://arxiv.org/abs/2610.26067) |
| 5 | 图形学 | Total Deformation-based MPM | 预印本 | 2026-10-27 | [arXiv](https://arxiv.org/abs/2610.36945) |
| 6 | 图形学 | Walk on Multiscale Media | 预印本 | 2026-10-24 | [arXiv](https://arxiv.org/abs/2610.35952) |
| 7 | 图形学 | Dynamic Skinning | IEEE TVCG 2026 | 2026-10-29 | [arXiv](https://arxiv.org/abs/2610.40976) |
| 8 | 引擎 | Windfoil | 预印本 | 2026-10-01 | [arXiv](https://arxiv.org/abs/2610.02468) |
| 9 | 引擎 | SteadySplats | 预印本 | 2026-10-04 | [arXiv](https://arxiv.org/abs/2610.05576) |
| 10 | 引擎 | Pre-integrated Neural Emitters (NEF) | 预印本 | 2026-10-05 | [arXiv](https://arxiv.org/abs/2610.06762) |
| 11 | 引擎 | Masking Judder in Foveated Rendering | 预印本 | 2026-10-07 | [arXiv](https://arxiv.org/abs/2610.10811) |
| 12 | 引擎 | Neural Caching of Prefiltered Radiance | 预印本 | 2026-10-08 | [arXiv](https://arxiv.org/abs/2610.11702) |
| 13 | 引擎 | H2-Ray | 预印本 | 2026-10-09 | [arXiv](https://arxiv.org/abs/2610.13498) |
| 14 | 引擎 | Tessellation-Free Displaced Surfaces | 预印本 | 2026-10-15 | [arXiv](https://arxiv.org/abs/2610.21584) |
| 15 | 神经渲染 | X-Splat | SIGGRAPH Asia 2026 | 2026-10-16 | [arXiv](https://arxiv.org/abs/2610.23237) |
| 16 | 神经渲染 | SwitchSplat | SIGGRAPH Asia 2026 | 2026-10-17 | [arXiv](https://arxiv.org/abs/2610.24812) |
| 17 | 神经渲染 | Holo4D | NeurIPS 2026 | 2026-10-18 | [arXiv](https://arxiv.org/abs/2610.25276) |
| 18 | 神经渲染 | RealMe | SIGGRAPH Asia 2026 | 2026-10-21 | [arXiv](https://arxiv.org/abs/2610.30023) |
| 19 | 神经渲染 | RADIANT | 预印本 | 2026-10-23 | [arXiv](https://arxiv.org/abs/2610.32075) |
| 20 | 神经渲染 | FL4N | 预印本 | 2026-10-26 | [arXiv](https://arxiv.org/abs/2610.35854) |
| 21 | 神经渲染 | LucidLyra | 预印本 | 2026-10-29 | [arXiv](https://arxiv.org/abs/2610.40495) |
| 22 | 世界模型 | Orbia | 技术报告 | 2026-10-14 | [arXiv](https://arxiv.org/abs/2610.20693) |
| 23 | 世界模型 | Matrix-Game 4.0 | 预印本 | 2026-10-20 | [arXiv](https://arxiv.org/abs/2610.27999) |
| 24 | 世界模型 | CADRE（视频自编码器） | 预印本 | 2026-10-21 | [arXiv](https://arxiv.org/abs/2610.30129) |
| 25 | 世界模型 | World-in-Context | 预印本 | 2026-10-23 | [arXiv](https://arxiv.org/abs/2610.33169) |
| 26 | 世界模型 | BoxWorld | 预印本 | 2026-10-26 | [arXiv](https://arxiv.org/abs/2610.36371) |
| 27 | 世界模型 | SWIM | 预印本 | 2026-10-27 | [arXiv](https://arxiv.org/abs/2610.36662) |
| 28 | 世界模型 | L3G-World | 预印本 | 2026-10-29 | [arXiv](https://arxiv.org/abs/2610.40614) |
| 29 | 具身智能 | Splat2Act | 预印本 | 2026-10-09 | [arXiv](https://arxiv.org/abs/2610.13945) |
| 30 | 具身智能 | AdaDex | 预印本 | 2026-10-20 | [arXiv](https://arxiv.org/abs/2610.28628) |
| 31 | 具身智能 | SuperMimic | CoRL 2026（口头报告） | 2026-10-20 | [arXiv](https://arxiv.org/abs/2610.28480) |
| 32 | 具身智能 | HyperDrone | CoRL 2026 | 2026-10-20 | [arXiv](https://arxiv.org/abs/2610.28950) |
| 33 | 具身智能 | Real2Sem2Real | 预印本 | 2026-10-20 | [arXiv](https://arxiv.org/abs/2610.28880) |
| 34 | 具身智能 | Zero-HLM | 预印本 | 2026-10-26 | [arXiv](https://arxiv.org/abs/2610.35075) |
| 35 | 具身智能 | TAPESTRY | CoRL 2026 | 2026-10-27 | [arXiv](https://arxiv.org/abs/2610.36823) |
| 36 | HCI / XR | HoOPOE | SIGGRAPH Asia 2026 | 2026-10-12 | [arXiv](https://arxiv.org/abs/2610.17474) |
| 37 | HCI / XR | FlowAvatar | IEEE ISMAR 2026 | 2026-10-12 | [arXiv](https://arxiv.org/abs/2610.16277) |
| 38 | HCI / XR | SplatXR | UIST 2026 | 2026-10-19 | [arXiv](https://arxiv.org/abs/2610.26338) |
| 39 | HCI / XR | V-JEPA Hand | 预印本 | 2026-10-19 | [arXiv](https://arxiv.org/abs/2610.26780) |
| 40 | HCI / XR | 基于物理的控制器进入 VR | 预印本 | 2026-10-19 | [arXiv](https://arxiv.org/abs/2610.26278) |
| 41 | HCI / XR | GenXR-Bench | 预印本 | 2026-10-21 | [arXiv](https://arxiv.org/abs/2610.29014) |
| 42 | HCI / XR | DomeGS | 预印本 | 2026-10-27 | [arXiv](https://arxiv.org/abs/2610.37172) |

## 代表性论文

本期条目建立在少数几篇早期工作之上。如果只读几篇背景论文，请读下面这些。

| 论文 | 会议/期刊 | 年份 | 链接 | 为什么重要 |
| --- | --- | --- | --- | --- |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering（Kerbl 等） | SIGGRAPH / ACM TOG 42(4) | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) | 本期三分之一以上条目所用的表示 |
| Real-time Neural Radiance Caching for Path Tracing（Müller 等） | SIGGRAPH / ACM TOG | 2021 | [arXiv](https://arxiv.org/abs/2106.12372) | 条目 12 扩展到镜面光照的基线 |
| RenderFormer: Transformer-based Neural Rendering of Triangle Meshes with Global Illumination（Zeng 等） | SIGGRAPH | 2025 | [arXiv](https://arxiv.org/abs/2505.21925) | RADIANT（19）加以扩展的逐三角形神经全局光照渲染器 |
| Incremental Potential Contact（Li 等） | SIGGRAPH / ACM TOG 39(4) | 2020 | （无已核实链接） | DiffGIPC（2）对其求导的无相交接触模型 |
| DeepMimic: Example-Guided Deep Reinforcement Learning of Physics-Based Character Skills（Peng 等） | SIGGRAPH / ACM TOG | 2018 | [arXiv](https://arxiv.org/abs/1804.02717) | 用强化学习做动作跟踪，是条目 30、31、40 的基础 |
| Genie: Generative Interactive Environments（Bruce 等） | ICML | 2024 | [arXiv](https://arxiv.org/abs/2402.15391) | 条目 23 和 26 正在远离的端到端可玩世界模型 |
| Navigation World Models（Bar 等） | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2412.03572) | 用于规划的相机可控视频预测 |
| V-JEPA 2: Self-Supervised Video Models Enable Understanding, Prediction and Planning（Assran 等） | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2506.09985) | 条目 27 和 39 背后的 JEPA 路线 |
| VGGT: Visual Geometry Grounded Transformer（Wang 等） | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2503.11651) | 条目 20、21、28 背后的前馈三维重建趋势 |
| π0: A Vision-Language-Action Flow Model for General Robot Control（Black 等） | RSS | 2025 | [arXiv](https://arxiv.org/abs/2410.24164) | Splat2Act（29）所个性化的 VLA 家族 |

## 学习资源

- **自己找论文。** arXiv 的 [cs.GR](https://arxiv.org/list/cs.GR/new)、[cs.CV](https://arxiv.org/list/cs.CV/new)、[cs.RO](https://arxiv.org/list/cs.RO/new) 和 [cs.HC](https://arxiv.org/list/cs.HC/new) 新论文列表；用于按日期检索的 [arXiv API](https://info.arxiv.org/help/api/index.html)（下面的练习会用到）；Ke-Sen Huang 整理的 SIGGRAPH、SIGGRAPH Asia、EG、HPG 和 EGSR [会议论文列表](https://kesen.realtimerendering.com/)。
- **快速读一篇论文。** 先读摘要，再看首图（teaser），然后看方法总览图，最后读局限性。本速递“做什么 / 怎么做 / 新在哪里 / 联系”的结构，也可以当作你自己读书笔记的模板。
- **本博客的背景章节。** 即每个条目中链接的章节。本期的图表脚本（`bin/figures/paper-digest/`）和数据文件 `data/01-papers.json` 都在网站仓库中。

## 练习

1. **形状因子。** 用条目 19 中的 `form_factor` 函数，把面片 $j$ 放在 $(0, y, 2)$，但让它的法线朝向原点，即 $n_j = -(0,y,2)/\lVert(0,y,2)\rVert$。此时 $F_{i\to j}(y)$ 随 $y$ 如何衰减？画出两条曲线进行比较。
   <details markdown="1"><summary>提示</summary>
   现在 $\cos\theta_j = 1$，只有一个余弦按 $2/r$ 缩小。衰减变为 $2A_j/(\pi r^3)$，而不是 $4A_j/(\pi r^4)$，因此更慢。
   </details>
2. **用特征代替颜色。** 在 3DGS 合成公式 $C(p)=\sum_k T_k\,\alpha_k G_k(p)\,c_k$ 中，把 $c_k\in\mathbb{R}^3$ 换成 $f_k\in\mathbb{R}^{16}$。光栅化器的显存访问和反向传播会有什么变化？本期哪些条目依赖这个技巧？
   <details markdown="1"><summary>提示</summary>
   只有每个高斯携带的数据和累加缓冲区变大，从 3 个通道变成 16 个；排序、分块和透射率 $T_k$ 都不变。对 $f_k$ 的梯度是 $T_k\alpha_k G_k(p)$ 乘以上游梯度，与颜色完全相同。条目 21、28 和 33 用到了这个技巧。
   </details>
3. **引擎还是生成器？** 以 Pong 这样的简单游戏为例，参照 Matrix-Game 4.0 和 BoxWorld，列出你会把哪些状态放进显式引擎、哪些交给视频生成器。对端到端模型做 Orbia 式的回访测试，会暴露出什么问题？
   <details markdown="1"><summary>提示</summary>
   球和球拍的位置、比分和碰撞规则放进引擎，因为它们必须精确且持久；纹理、光照和粒子特效交给生成器。相机回来时，端到端模型可能会“忘记”比分或球场布局。
   </details>
4. **随机透明。** 一条光线上从前到后有三个高斯，不透明度为 $0.5, 0.4, 0.6$，颜色（灰度）为 $1, 0, 1$。计算 alpha 混合后的颜色。再证明：以概率 $\alpha_k$ 保留每个高斯、取最近的被保留者（若都没保留则为黑色），其期望值相同。
   <details markdown="1"><summary>提示</summary>
   混合结果：三项分别为 $0.5\cdot1 = 0.5$、$0.5\cdot0.4\cdot0 = 0$ 和 $0.5\cdot0.6\cdot0.6\cdot1 = 0.18$，所以颜色为 $0.68$。在随机版本中，高斯 $k$ 成为最近被保留者的概率是 $\alpha_k\prod_{l<k}(1-\alpha_l)$，正好等于它的混合权重 $T_k\alpha_k$，所以期望相同。SteadySplats（条目 9）针对的就是这个估计量的方差。
   </details>
5. **写一个你自己的速递条目。** 用 arXiv API，例如 `http://export.arxiv.org/api/query?search_query=cat:cs.GR+AND+submittedDate:[202611010000+TO+202611302359]`，找一篇 2026 年 11 月的论文，并用不超过 150 字写出四个部分（做什么、怎么做、新在哪里、与 CG 的联系）。

下一期将覆盖 2026 年 11 月至 12 月。
