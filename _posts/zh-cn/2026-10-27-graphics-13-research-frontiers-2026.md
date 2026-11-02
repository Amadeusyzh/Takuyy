---
layout: post
title: "2026 年图形学研究前沿：SIGGRAPH、SIGGRAPH Asia 与最新预印本在做什么"
date: 2026-10-27 09:13:00+0900
description: "按主题梳理、逐条核实的 2026 年图形学研究地图（SIGGRAPH 2026、SIGGRAPH Asia 2026、EGSR、I3D、SCA 与 arXiv 预印本），附四个反复出现的思想背后的数学，以及一个交互式浏览器。"
categories: graphics
tags: [research, siggraph, survey, rendering, simulation, gaussian-splatting, holography]
series: graphics
series_order: 13
toc:
  sidebar: left
related_posts: false
---

## 如何阅读本章

前面十二章讲的是基础：从[向量与变换]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})，到[路径追踪]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})、[模拟]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})、[几何处理]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})和[可微渲染]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})。本章不同：它是一张带日期的地图，描绘**截至 2026 年 11 月**研究所处的位置。它会过时，而这正是它的意义所在。请把它当作一张快照来读：它展示了你学过的那些思想如今被推向何处，同时也是一份你现在已经可以去读的论文清单。

本章的组织方式：

- **八个主题小节**，每节 5-6 项工作，并有一段简短的综述，说明该方向的发展趋势。每项工作都给出标题（链接到其 arXiv 页面、DOI 或项目主页）、第一作者、发表场合和**状态**、月份，以及几句话介绍它要解决的问题、核心思想，以及它所建立在其上的前面章节。
- **四个“讲透一个概念”框**，对在许多论文中反复出现的思想做推导、计算和绘图：3D 高斯沿光线的峰值响应、控制变量、IPC 接触屏障，以及纯相位全息图。
- 一个**交互式浏览器**，包含同一份清单；还有一节**跨领域趋势**，以及一节关于你自己**如何跟进图形学研究**的内容。

状态的表述遵循本博客的规则，力求精确：

- **已发表**：在已经举行的 2026 年会议上发表（例如 2026 年 7 月的 SIGGRAPH 2026，论文见 ACM TOG 45(4) 或 SIGGRAPH 2026 Conference Papers），或已刊登在期刊的某一期。
- **已接收 / 待发表**：已被尚未举行的会议接收。截至 2026 年 11 月 2 日，这主要指 **SIGGRAPH Asia 2026**（2026 年 12 月 1-4 日，吉隆坡）。
- **预印本**：仅在 arXiv 上，作者没有注明发表场合。预印本没有经过同行评审，对其结论要更加谨慎。

每一条目都对照了一手来源核实：arXiv 摘要页（标题、作者、备注和期刊引用）、其 DOI 的 Crossref 记录，或官方项目主页。当 arXiv 备注与 DOI 记录不一致时，以 DOI 记录为准。摘要中的数字是作者自己的声明，并非我复现的结果。选择标准由我个人决定：力求覆盖面广，并且是本系列的学习者能够读得懂的论文，它不是排名。许多优秀的论文并未收录。

## 前置知识

- 本系列第 1-7 章。第 8-12 章对几何、动画和可微渲染相关小节有帮助。
- 对于神经表示相关小节：[3D 高斯泼溅]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})，以及[扩散与流匹配]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})的基础。
- 如果想运行代码片段和绘图脚本（`bin/figures/graphics/graphics_13.py`），需要 Python 与 NumPy。

## 1. 2026 年会议日历

图形学研究主要在少数几个会议上流动。最大的两个是 **ACM SIGGRAPH**（北美，夏季）和 **SIGGRAPH Asia**（冬季）。它们的技术论文要么发表在期刊 **ACM Transactions on Graphics（TOG）**上，要么收录在 **Conference Papers** 论文集中。围绕它们的是欧洲和专业方向的会议：**Eurographics**（论文发表在 Computer Graphics Forum，即 CGF）、**EGSR**（渲染）、**HPG**（高性能图形）、**I3D**（交互式 3D 与游戏，论文发表在 PACMCGIT，即 Proceedings of the ACM on Computer Graphics and Interactive Techniques）、**SCA**（动画与模拟）、**SGP**（几何处理）和 **Pacific Graphics**。越来越多的工作也首先、或者只以 cs.GR 类别下的 **arXiv 预印本**形式出现。

| 会议 | 2026 年日期 | 地点 | 2026 年 11 月 2 日的状态 |
| --- | --- | --- | --- |
| Eurographics 2026 | 5 月 4-8 日 | 德国亚琛 | 已举行（CGF 45(2)） |
| I3D 2026 | 5 月 13-15 日 | 美国旧金山 | 已举行（PACMCGIT 9(1)） |
| EGSR 2026 | 7 月 1-3 日 | 法国波尔多 | 已举行 |
| SGP 2026 | 7 月 1-3 日 | 瑞士伯尔尼 | 已举行 |
| SCA 2026 | 7 月 8-10 日 | 西班牙巴塞罗那 | 已举行（CGF 45(8)） |
| HPG 2026 | 7 月 17-19 日 | 美国洛杉矶 | 已举行 |
| SIGGRAPH 2026 | 7 月 19-23 日 | 美国洛杉矶 | 已举行（ACM TOG 45(4) + Conference Papers） |
| Pacific Graphics 2026 | 10 月 | 新加坡 | 已举行 |
| SIGGRAPH Asia 2026 | 12 月 1-4 日 | 马来西亚吉隆坡 | 即将举行；已接收的论文正陆续出现在 arXiv 上 |

{% include blog_figure.liquid path="assets/img/blog/graphics/13-venue-timeline.svg" caption="2026 年各会议在月份轴上的位置（1 = 一月）。实心条表示已经举行；斜线填充的条（12 月的 SIGGRAPH Asia）尚未到来。红色虚线是今天，即 2026 年 11 月 2 日；阴影带是本章所涵盖的 arXiv 预印本的 6 月至 11 月窗口。粗体数字统计本章中来自各会议的工作数量：SIGGRAPH 2026 占主导，而 SIGGRAPH Asia 2026 的论文已经以预印本的形式出现。" %}

这条时间线解释了本章的结构。SIGGRAPH 2026 的论文在 7 月发表，因此是最扎实的一层。SIGGRAPH Asia 2026 的论文已被接收，但会议还有一个月才举行，所以我们是通过作者的 arXiv 版本了解它们的。预印本最新，也最不确定。

{% include blog_figure.liquid path="assets/img/blog/graphics/13-topic-status.svg" localized="true" caption="本章 45 项工作按主题和状态的分布。绿色：已发表；蓝色：已接收 / 待发表（全部是 SIGGRAPH Asia 2026）；橙色：预印本。几何与建模、制造与设计在这里全部是 SIGGRAPH 2026 的论文，而光传输与渲染、物理模拟包含最多的预印本。这既反映了领域本身，也反映了我的选择。" %}

{% include blog_figure.liquid path="assets/img/blog/graphics/13-months.svg" localized="true" caption="同样这些工作按月份的分布（会议论文取会议所在月份，预印本取 arXiv 月份）。7 月的高峰来自 SIGGRAPH、EGSR 和 SCA；12 月是 SIGGRAPH Asia。虚线是今天。" %}

## 2. 浏览论文列表

下面的浏览器包含本章的每一项工作。每一行是一个主题，每一列是 2026 年的一个月份。颜色表示主题，形状表示状态：实心圆表示已发表，空心圆环表示已接收 / 待发表，菱形表示预印本。

<div id="fw-i18n" hidden data-all="全部" data-topic="主题" data-status="状态" data-published="已发表" data-accepted="已接收 / 待发表" data-preprint="预印本" data-hint="点击圆点或标题。" data-count="{n} / {m} 项工作" data-jump="跳到正文中的这一条" data-today="今天" data-t-light="光传输" data-t-neural="神经表示" data-t-geometry="几何" data-t-simulation="模拟" data-t-animation="动画" data-t-imaging="显示" data-t-fabrication="制造" data-t-generative="生成"></div>

{% include widget.liquid name="graphics-frontiers-explorer" height="640" caption="用按钮按主题和状态筛选，然后点击一个圆点（或其下方列表中的标题），即可阅读该工作的摘要、链接以及它所建立在其上的章节。使用键盘时，让图表获得焦点，用左右方向键在筛选后的工作之间逐个移动。红色虚线是 2026 年 11 月 2 日。" %}

## 3. 光传输与渲染

前面章节中的[路径追踪器]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})和 [ReSTIR]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})都是蒙特卡洛估计器。几乎所有渲染研究都围绕两件事之一：降低这些估计器的方差，或者用一个计算代价更低的、学习得到或拟合得到的模型来替换计算的一部分。2026 年在这两方面都有出色的例子。

### 讲透一个概念：控制变量

**直观理解。** 如果你必须估计 $I = \int f$，并且你知道一个与 $f$ 相似的函数 $g$，其积分 $G = \int g$ 你恰好知道，那么只需用蒙特卡洛去估计*差* $f - g$，再把 $G$ 加回来。这个差既小又平滑，所以它的估计噪声要小得多。

**公式。** 设 $N$ 个样本 $X_i$ 从定义域（这里是 $[0,1]$）上均匀抽取，系数为 $\beta$ 的控制变量（control variates）估计器为

$$
\hat I_{\text{CV}} = \frac{1}{N}\sum_{i=1}^{N}\bigl[f(X_i) - \beta\, g(X_i)\bigr] + \beta\,G .
$$

对任意 $\beta$ 它都是无偏的，因为 $\mathbb E[g(X)] = G$。它的方差为

$$
\operatorname{Var}[\hat I_{\text{CV}}] = \frac{1}{N}\left(\sigma_f^2 - 2\beta\,\operatorname{Cov}(f,g) + \beta^2\sigma_g^2\right),
$$

这是关于 $\beta$ 的抛物线。令导数为零得到 $\beta^* = \operatorname{Cov}(f,g)/\sigma_g^2$，代回后得到 $\operatorname{Var} = \sigma_f^2(1-\rho^2)/N$，其中 $\rho$ 是 $f(X)$ 与 $g(X)$ 之间的相关系数。$g$ 越贴近 $f$，$\rho^2$ 就越接近 1，被消除的方差也就越多。

**算例。** 取 $[0,1]$ 上的 $f(x) = e^x$（$I = e-1 \approx 1.71828$）和 $g(x) = 1 + x$（$G = 1.5$）。于是 $\sigma_f^2 = \frac{e^2-1}{2} - (e-1)^2 \approx 0.24204$，$\sigma_g^2 = 1/12$，$\operatorname{Cov}(f,g) = \mathbb E[xe^x] - \tfrac12(e-1) = 1 - 0.85914 = 0.14086$。因此 $\beta^* \approx 1.690$，$\rho^2 \approx 0.9837$。取 $N = 8$ 个样本时，普通估计器的标准差为 $\sqrt{0.24204/8} \approx 0.174$，而控制变量估计器为 $\sqrt{0.24204 \cdot 0.0163/8} \approx 0.022$：在样本数相同的情况下，方差降低约 60 倍。

用模拟得到同样的数字，并像渲染器那样从样本中拟合 $\beta$：

```python
import numpy as np

rng = np.random.default_rng(0)
f = np.exp                      # integrand on [0, 1]
g = lambda x: 1 + x             # control variate with known integral G
I, G = np.e - 1, 1.5

x = rng.random(1_000_000)       # pilot samples to fit beta
beta = np.cov(f(x), g(x))[0, 1] / np.var(g(x), ddof=1)

X = rng.random((100_000, 8))    # 100k independent estimates, N = 8 samples each
mc = f(X).mean(axis=1)
cv = (f(X) - beta * (g(X) - G)).mean(axis=1)
print(round(beta, 3), round(mc.std(), 3), round(cv.std(), 4))   # about 1.69 0.174 0.022
print(round(mc.mean(), 3), round(cv.mean(), 3), round(I, 3))     # 1.718 1.718 1.718: both unbiased
```

{% include blog_figure.liquid path="assets/img/blog/graphics/13-control-variate.svg" caption="左：被积函数 $f(x)=e^x$ 与缩放后的控制变量 $\beta g(x)$，其中拟合得到 $\beta\approx1.69$。两者之间只剩下那条细细的灰色间隙留给蒙特卡洛。右：4000 次独立估计的直方图，每次使用 $N=8$ 个样本；普通估计（紫色）围绕虚线所示的真值分布很宽，而控制变量估计（橙色）是一个窄尖峰。图例中的标准差与算例一致。" %}

在渲染中，$g$ 绝不会是一个玩具多项式。它可以是相邻像素或上一帧中看到的颜色（下面的 ReSTCV），可以是一个拟合出来的光照模型，也可以是神经网络的预测（神经控制变量这一系列工作）。估计器本身和它之所以有效的原因，与上面完全一样。

### 论文

**[A Generalizable Light Transport 3D Embedding for Global Illumination](https://arxiv.org/abs/2510.18189)**：Bing Xu 等，*SIGGRAPH 2026 Conference Papers*，已发表，2026 年 7 月。大多数用于全局光照（global illumination, GI）的学习型捷径仍然需要路径追踪器或光栅化的光照缓冲作为输入。这里用一个 Transformer 把场景本身（一个携带几何与材质的点云）编码成 3D 嵌入。渲染时，通过交叉注意力汇集附近的嵌入点，来预测查询点处的光照。这个嵌入的目标是能够跨场景泛化，并可适配到其他渲染任务。它建立在[第 4 章]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})的渲染方程和[第 5 章]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})的 GI 问题之上。
{: #fw-lt-embedding}

**[Gaussian Light Transport](https://arxiv.org/abs/2609.11430)**（[项目主页](https://patrick-attimont.com/projects/gaussian-light-transport/)）：Patrick Attimont 等，*SIGGRAPH Asia 2026 (Conference Track)*，已接收，2026 年 12 月。GI 中与视角无关的部分被表示为位置、方向、法线和材质上的高斯混合。其参数通过让混合满足渲染方程来拟合，也就是最小化混合与传输算子作用一次之后的结果之间的残差，思路类似 Neural Radiosity。一个剔除步骤使拟合保持在可处理的规模，而对混合的求值足够快，可以实时显示。这篇论文有意思之处在于：[3D 高斯泼溅]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})中大家熟悉的高斯基元，在这里被用来求解光传输本身，而不是拟合照片。建立在[第 4 章]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})之上。
{: #fw-gaussian-lt}

**[Spatio-Temporal Control Variates with ReSTIR for Real-Time Rendering](https://doi.org/10.1145/3799902.3811113)**（[项目主页](https://hercier.github.io/restcv/)）：Zhong Shi 等，*SIGGRAPH 2026 Conference Papers*，已发表，2026 年 7 月。ReSTIR 每个像素只保留一个样本，由亮度这样的标量目标函数来选择，因此在场景中存在不同颜色的光源、采样数又很低时，会出现颜色噪声。这篇论文加入了控制变量，用的正是上面推导过的估计器：从相邻像素和之前帧累积的颜色估计充当 $g$，储备池（reservoir）中的样本只估计两者之差。作者报告以较小的代价获得了更低、更稳定的颜色方差。它是[第 6 章]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})中 RIS 与储备池机制的直接扩展。
{: #fw-restcv}

**[ToF ReSTIR: Time-of-Flight Rendering with Spatio-temporal Reservoir Resampling](https://arxiv.org/abs/2605.11536)**：Juhyeon Kim 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。飞行时间（time-of-flight）传感器（激光雷达、门控相机）记录的不只是有多少光，还有光何时到达。当 ReSTIR 重用相邻像素的路径时，被重用的路径通常光程不同，这就破坏了时间约束。这篇论文设计了一种尊重路径长度的偏移映射（shift mapping），使时空重用能够以交互速率用于瞬态渲染和时间门控渲染。它表明[第 6 章]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})中“偏移映射 + 雅可比”的视角已经变得多么灵活，并且对模拟机器人和汽车的传感器很重要。
{: #fw-tof-restir}

**[Neural Caching of Prefiltered Radiance for Specular Lighting](https://arxiv.org/abs/2610.11702)**：Dmitrii Klepikov 等，arXiv 预印本，2026 年 10 月。神经辐射缓存（一个在线训练、用来存储间接光的网络，见[第 6 章]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})）能很好地处理漫反射光，但对尖锐的镜面波瓣则力不从心。这篇预印本用反射方向来索引缓存，并在按粗糙度*预滤波*的辐射度上训练它。然后通过[第 4 章]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})中基于图像的光照里大家熟悉的 split-sum 近似，把缓存与预计算的 BRDF 表结合起来。作者报告在他们的测试场景上，镜面质量优于标准缓存。
{: #fw-prefiltered-nrc}

**[Beyond Positional Encoding: A 5D Spatio-Directional Hash Encoding](https://arxiv.org/abs/2603.05079)**：Philippe Weier 等，arXiv 预印本，2026 年 3 月。多分辨率哈希网格是快速辐射场背后的编码（[神经渲染 3]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})），它对位置效果很好，但对球面上的方向效果不佳。这篇论文为方向构建了一个分层的测地线网格，并把它与空间哈希网格结合成一个 5D 编码。它的主要应用是神经**路径引导**（path guiding）：学习光从哪里来，使[第 5 章]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})中的路径追踪器更频繁地采样重要方向。作者报告在相同采样数下方差更低。
{: #fw-hash-5d}

**发展方向。** 有三个方向很突出。第一，ReSTIR 家族不断吸收经典的蒙特卡洛工具：控制变量、路径引导和新的偏移映射。第二，“渲染器内部的神经方法”正在变得具体：针对某一个子问题量身定制的缓存、编码和嵌入，取代了通用的 MLP。第三，高斯基元正从场景表示扩展到光传输本身。光谱传输与体积传输见[体积章节]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }})，实时 GI 系统见[第 11 章]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})。

## 4. 神经与混合表示

3D 高斯泼溅（3D Gaussian Splatting, 3DGS）让数以百万计的柔软、依赖视角的椭球成为标准的场景表示。2026 年的论文对它们提出了图形学的问题：我们能对它们做*光线追踪*吗？能不能去掉排序？什么基元适合毛发？与此同时，神经网络正在进入实时引擎的材质与纹理管线。

### 讲透一个概念：光线与 3D 高斯相遇的位置

光栅化 3DGS 时，每个高斯被投影成一个 2D 椭圆（[神经渲染 4]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})）。光线追踪则是沿光线对每个高斯求值，这样可以处理畸变相机、反射和次级光线。每个高斯光线追踪器都必须回答的问题是：*沿光线的哪个位置，这个高斯的贡献最大，贡献有多大？*

**公式。** 均值为 $\boldsymbol\mu$、协方差为 $\Sigma$ 的高斯，其密度为 $G(\mathbf x) = \exp\left(-\tfrac12 q(\mathbf x)\right)$，其中 $q(\mathbf x) = (\mathbf x-\boldsymbol\mu)^\top\Sigma^{-1}(\mathbf x-\boldsymbol\mu)$ 是马氏距离（Mahalanobis distance）的平方。在光线 $\mathbf x(t) = \mathbf o + t\mathbf d$ 上，$q$ 是关于 $t$ 的二次函数：

$$
q(t) = (\mathbf o + t\mathbf d - \boldsymbol\mu)^\top \Sigma^{-1} (\mathbf o + t\mathbf d - \boldsymbol\mu),
\qquad
\frac{dq}{dt} = 2\,\mathbf d^\top\Sigma^{-1}(\mathbf o + t\mathbf d - \boldsymbol\mu).
$$

令导数为零，得到峰值位置

$$
t^* = \frac{\mathbf d^\top\Sigma^{-1}(\boldsymbol\mu - \mathbf o)}{\mathbf d^\top\Sigma^{-1}\mathbf d},
\qquad
G_{\max} = \exp\!\left(-\tfrac12\, q(t^*)\right).
$$

$t^*$ *不是*光线上按普通距离离 $\boldsymbol\mu$ 最近的点。它是在高斯自身度量下最近的点，这个度量会沿短轴方向拉伸空间。

**算例。** 令 $\boldsymbol\mu = \mathbf 0$，$\Sigma = \operatorname{diag}(4,1,1)$（标准差为 2、1、1），$\mathbf o = (-4,-1,0)$，$\mathbf d = (1,1,0)/\sqrt2$。于是 $\Sigma^{-1} = \operatorname{diag}(0.25,1,1)$，$\mathbf d^\top\Sigma^{-1}(\boldsymbol\mu-\mathbf o) = (0.25\cdot4 + 1)/\sqrt2 = 1.4142$，$\mathbf d^\top\Sigma^{-1}\mathbf d = 0.625$，所以 $t^* = 2.263$。该点为 $(-2.4, 0.6, 0)$，$q = 0.25\cdot5.76 + 0.36 = 1.8$，因此 $G_{\max} = e^{-0.9} = 0.407$。欧氏距离最近的点位于 $t = \mathbf d\cdot(\boldsymbol\mu-\mathbf o) = 3.536$，那里只有 $G = e^{-1.406} = 0.245$。

```python
import numpy as np

Sigma = np.diag([4.0, 1.0, 1.0]); Si = np.linalg.inv(Sigma)
mu = np.zeros(3)
o = np.array([-4.0, -1.0, 0.0]); d = np.array([1.0, 1.0, 0.0]) / np.sqrt(2)

t_star = d @ Si @ (mu - o) / (d @ Si @ d)
x = o + t_star * d - mu
print(t_star, np.exp(-0.5 * x @ Si @ x))      # 2.2627..., 0.4066...

t_e = d @ (mu - o)                             # closest point in Euclidean distance
y = o + t_e * d - mu
print(t_e, np.exp(-0.5 * y @ Si @ y))          # 3.5355..., 0.2451...
```

{% include blog_figure.liquid path="assets/img/blog/graphics/13-gaussian-ray.svg" caption="左：一个旋转过的各向异性 3D 高斯（其 1-sigma 椭球）和三条偏移量依次增大的平行光线；方块标出各光线的起点，圆点标出其峰值点 $t^*$。右：沿每条光线的响应 $G(\mathbf o+t\mathbf d)$，由公式计算得到。每条曲线都是关于 $t$ 的一维高斯，其最大值位于 $t^*$（虚线）。峰值处标出的数值是 $G_{\max}$，它随偏移量迅速下降，因为光线是沿着一条短轴穿过的。" %}

在二维中亲手试一试同样的计算。控件的初始状态正是上面的数值例子（$\sigma_x = 2$，$\sigma_y = 1$，$\mathbf o = (-4,-1)$，方向 $(1,1)/\sqrt2$），因此读数显示 $t^* = 2.26$、$G = 0.407$，而欧氏最近点为 $t = 3.54$、$G = 0.245$。

<div id="gr-i18n" hidden data-drag="拖动方块（光线起点）或圆圈（方向）；滑块用于旋转和拉伸高斯。" data-rot="旋转" data-peak="峰值" data-eucl="最近点" data-reset="重置"></div>

{% include widget.liquid name="graphics-gaussian-ray" height="470" caption="紫色：峰值 $t^*$，光线在此与高斯的一条等值椭圆相切（紫色虚线）。灰色：普通距离意义下的最近点，光线在此与以均值为圆心的圆相切（灰色虚线）。下方的曲线是 $G$ 沿光线的变化。旋转或拉伸高斯，观察两点如何分开：一般情况下两点不同，只在特殊情形下重合，例如各向同性的高斯、光线平行于某条主轴，或光线穿过均值。" %}

高斯光线追踪器会把每个高斯包在一个包围代理（例如一个被拉伸的二十面体）里，放入 BVH（[第 5 章]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})），收集光线上的命中，对每个命中求 $G_{\max}$ 和不透明度，并按深度顺序做 alpha 合成，与体渲染完全一样。下面这些论文讨论的是如何让它变快，以及它的替代方案。

### 论文

**[GRay: Ray Tracing 3D Gaussians Near the Speed of Splats](https://arxiv.org/abs/2606.30869)**：Yohan Poirier-Ginter 等，*I3D 2026 (PACMCGIT 9(1))*，已发表，2026 年 5 月。光线追踪的高斯支持光栅化无法实现的效果，例如广角相机和次级光线，但它们一直比泼溅慢得多。GRay 是一个更快的高斯光线追踪器。论文还论证了：当场景包含非常多的小高斯时（密集初始化就会产生这种情况），光线追踪的*扩展性比*光栅化*更好*。作者报告渲染和优化速度比早先的 3DGRT 快数倍。它把[第 5 章]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})的 BVH 内容与 [3DGS]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})结合在了一起。
{: #fw-gray}

**[Gaussian Point Splatting](https://doi.org/10.1145/3811272)**（[项目主页](https://jorisar.nl/gaussian_point_splatting/)）：Joris Rijsdijk 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。标准的 3DGS 必须按深度对高斯排序，并逐 tile 混合，这对巨大的场景扩展性很差。这种方法则从可见的高斯中随机抽取像素大小的*不透明*点，并用 64 位原子深度测试写入，这是一种带碰撞修正的随机透明（stochastic transparency）。没有排序，代价的增长就比较平缓，项目主页展示了在单个 GPU 上以交互速率渲染数亿个高斯。它把[第 2 章]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})中的可见性与 z-buffer 思想与泼溅联系了起来。
{: #fw-gps}

**[Inverse Rendering for Modeling with Line Primitives](https://arxiv.org/abs/2609.00625)**（[项目主页](https://kenji-tojo.github.io/sa26-line-primitives/)）：Kenji Tojo 等，*SIGGRAPH Asia 2026 (ACM TOG)*，已接收，2026 年 12 月。毛发、皮毛和织物是毛茸茸的：曲面无法表示它们，而体积高斯又要为它们消耗很多基元。这篇论文把这类场景重建为显式线段，并在亚像素网格上光栅化以实现抗锯齿。一个随机可微光栅化器为位置、属性乃至连接关系提供梯度。这是根据内容选择基元的一个好例子，所用的梯度工具来自[第 12 章]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})。
{: #fw-line-primitives}

**[Neural Texture Compression using Hypernetworks](https://arxiv.org/abs/2606.26913)**：Laurent Belcour，*EGSR 2026*，已发表，2026 年 7 月。神经纹理压缩把材质的纹理存成一个小的潜变量网格加一个很小的解码器网络。大多数方法必须为每种材质单独做一次优化，这拖慢了内容管线。这里由一个*超网络*（hypernetwork，输出另一个网络权重的网络）直接根据输入纹理预测潜变量和解码器权重。作者报告质量接近逐材质优化，并可扩展到多个解码器和超分辨率。建立在[第 3 章]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})的纹理管线之上。
{: #fw-ntc-hyper}

**[A Hybrid Neural-Microfacet BRDF Model for Real-Time Rendering](https://arxiv.org/abs/2608.09604)**（[项目主页](https://ubisoft-laforge.github.io/world/hybridrdf)）：Louis De Oliveira 等，*EGSR 2026 (CGF)*，已发表，2026 年 7 月。解析的微表面 BRDF 代价低，但对实测材质的拟合并不完美。纯神经 BRDF 拟合得好，但求值代价更高。这个混合模型保留一个 GGX 微表面模型（[第 4 章]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})），并加上一个小网络来修正它的输出。在内存相同的情况下，作者报告对实测数据的拟合优于早先的神经模型，且开销不大。解析部分保留了熟悉的结构（以及重要性采样），网络只学习残差。
{: #fw-hybrid-brdf}

**[Extracting Neural Materials from Images](https://arxiv.org/abs/2606.26715)**（[项目主页](https://nvlabs.github.io/neumatex/)）：Kim Youwang 等，arXiv 预印本，2026 年 6 月。神经材质比[第 4 章]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})中的基础颜色 / 粗糙度 / 金属度参数更丰富，但从照片中恢复它们很困难。该方法先用前馈网络预测反照率、镜面潜变量和一张不确定性图，再通过可微路径追踪器（[第 12 章]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})）做测试时优化来细化，并用不确定性来决定正则化的强度。它是“学习得到的先验 + 基于物理的细化”的一个模板。
{: #fw-neumatex}

**发展方向。** 高斯正在成为图形管线中的一等基元：被光线追踪、免排序，或被更合适的基元（例如线）所取代。视觉方面的内容见 [3DGS 前沿章节]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})。在引擎内部，神经组件以*混合*的方式进入：经典结构（微表面 BRDF、块压缩纹理）加上学习得到的修正，使性能保持可预测。[关于 AI 的引擎章节]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})会跟随这些组件进入生产环境。

## 5. 几何与建模

[几何处理章节]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})讲了网格、离散微分几何、重网格化和隐式曲面。2026 年的几何研究对它们做了两件事：用学习来自动化原先需要专家的任务（四边形布局、CAD 编辑），并构建能让几何算法可微、或大幅加速的系统。

**[B-repLer: Language-guided Editing of CAD Models](https://arxiv.org/abs/2508.10201)**（[项目主页](https://yilinliu77.github.io/brepler.github.io/)）：Yilin Liu 等，*SIGGRAPH 2026 Conference Papers*，已发表，2026 年 7 月。CAD 模型以边界表示（B-rep）存储：由沿边粘合的裁剪参数曲面构成。用文本编辑它们通常需要构造历史，而这往往缺失。B-repLer 在学习得到的潜空间中，把文本指令映射为对 B-rep 本身的编辑，训练数据是用 CAD 工具和多模态语言模型构建的大型配对数据集。它适用于没有历史记录的零件，从棱柱形到自由形态的 B 样条形状都可以。建立在[第 8 章]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})的曲面表示之上。
{: #fw-brepler}

**[SQuadGen: Generating Simple Quad Layouts via Chart Distance Fields](https://arxiv.org/abs/2604.27329)**（[项目主页](https://youkang-kong.github.io/squadgen/)）：Youkang Kong 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。美术人员希望四边形网格的边环（edge loop）少而干净，但自动的四边形重网格化往往产生复杂的布局。这个方法不去预测离散的连接关系，而是在定义于曲面上的连续场（即 chart 距离场）上训练一个扩散模型，再从中提取布局。作者还定义了考虑边环的简洁性度量，并收集了一个大型布局数据集。建立在[第 8 章]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})的重网格化之上。
{: #fw-squadgen}

**[SAND: Spatially Adaptive Network Depth for Fast Sampling of Neural Implicit Surfaces](https://arxiv.org/abs/2604.25936)**：Chuanxiang Yang 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。神经符号距离场（signed distance field, SDF）对每次查询都用完整的网络回答，尽管远离曲面的点或简单区域所需的精度要低得多。SAND 在 MLP 的隐藏层上接出提前退出（early-exit）输出，并针对每个位置预测求值需要深入到哪一层。这加速了球追踪（sphere tracing）和曲面提取。它把经典的细节层次（level-of-detail）思想应用到了[第 8 章]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})和 [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})的神经场上。
{: #fw-sand}

**[Points as Tori: Fast Pointwise Signed Distance for Point Clouds](https://doi.org/10.1145/3811385)**（[项目主页](https://nzfeng.github.io/research/PointsAsTori/index.html)）：Nicole Feng 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。从带方向的点云计算符号距离，通常需要网格或全局求解。这里每个点配有一个小圆环面（torus），由预训练网络根据其邻域拟合得到。圆环面有闭式的符号距离，逐点的距离再通过核平均混合，因此求值完全不需要离散化。偏移和布尔运算于是可以直接作用于原始扫描数据。这是对[第 8 章]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})隐式曲面思想的一次巧妙运用。
{: #fw-tori}

**[Iskra: A System for Inverse Geometry Processing](https://arxiv.org/abs/2602.12105)**：Ana Dodik 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。许多几何算法（平均曲率流、参数化、尽可能刚性的变形）是用快速的专用迭代求解的，例如 local-global 或 ADMM 求解器。要想*穿过*它们去做优化，通常得把它们改写到自动微分框架里，从而失去速度。Iskra 保留现有的求解器，并用伴随法（adjoint method）自动生成反向传播，而且可以接入机器学习框架。它是[第 12 章]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})中可微渲染在几何方面的对应物。
{: #fw-iskra}

**发展方向。** 学习针对的是几何中面向美术人员的*结构*（四边形边环、CAD 特征、缝纫片），而不是原始三角形。与此同时，系统层面的工作（伴随法、自适应求值、闭式局部基元）使经典几何处理保持快速且可微，从而能够嵌入学习循环之中。

## 6. 物理模拟

[第 7 章]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})搭建了 XPBD 布料求解器，并概览了刚体和流体。2026 年的研究围绕鲁棒性（永不失效的接触）、GPU 上的性能，以及穿过整个模拟的梯度。

### 讲透一个概念：IPC 接触屏障

增量势能接触（Incremental Potential Contact, IPC）保证物体永不互相穿透。做法是在时间步能量中加入一个屏障项：当两个基元（点-三角形或边-边）之间的距离 $d$ 趋于零时，它无界增长；超过激活距离 $\hat d$ 后则为零：

$$
b(d) =
\begin{cases}
-(d-\hat d)^2 \ln\!\left(\dfrac{d}{\hat d}\right), & 0 < d < \hat d,\\[4pt]
0, & d \ge \hat d .
\end{cases}
$$

检查其性质：$b(\hat d) = 0$ 且 $b'(\hat d) = 0$，所以屏障是平滑启动的。当 $d \to 0$ 时，$-\ln(d/\hat d) \to \infty$，因此从有效状态出发的线搜索，其任何一步都无法越过 $d = 0$。排斥力为

$$
-b'(d) = 2(d-\hat d)\ln\!\left(\frac{d}{\hat d}\right) + \frac{(d-\hat d)^2}{d}.
$$

数值上，取 $\hat d = 1$：$b(0.5) = 0.25\ln 2 = 0.173$，$b(0.1) = 0.81\ln 10 = 1.865$，$b(0.01) = 0.9801\ln 100 = 4.513$。能量只是对数增长，而力则像 $\hat d^2/d$ 那样增长。

```python
import numpy as np

def barrier(d, dhat):
    return np.where(d < dhat, -(d - dhat) ** 2 * np.log(d / dhat), 0.0)

print(barrier(np.array([0.01, 0.1, 0.5, 2.0]), 1.0))   # about [4.513 1.865 0.173 0.]
```

{% include blog_figure.liquid path="assets/img/blog/graphics/13-ipc-barrier.svg" caption="左：两个激活距离 $\hat d$（点线）下的 IPC 屏障 $b(d)$。它在 $\hat d$ 之外恰好为零，在 $\hat d$ 处平滑衔接，并在 $d\to0$ 时无界上升。右：排斥力 $-b'(d)$，大致按 $\hat d^2/d$ 增长。较小的 $\hat d$ 让物体在彼此“感觉”到对方之前靠得更近，代价是问题更加刚性。" %}

与 XPBD 对穿透约束做投影相比，屏障把接触变成了一个平滑（尽管刚性）的能量，牛顿法可以对它做最小化。代价是每一步都要做带有大量接触对的非线性求解，这就是为什么 2026 年有这么多工作围绕 GPU 求解器和代码生成。

### 论文

**[YASPS: A Symbolic Framework for Extensible, High-Performance IPC Simulation](https://arxiv.org/abs/2605.23088)**：Xuan Tang 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。快速的 IPC 求解器通常针对每种能量和每种基元类型手写，所以尝试一种新的材料或接触模型就意味着重写 GPU 代码。YASPS 让用户用符号方式描述能量，自动推导 Hessian 的稀疏结构和压缩布局，并即时编译（JIT）CUDA 核函数。示例包括布料、刚体与可变形体的混合，以及基于笼（cage）的变形。建立在[第 7 章]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})之上，并与[物理引擎]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})相联系。
{: #fw-yasps}

**[Locality-Aware Automatic Differentiation on the GPU for Mesh-Based Computations](https://arxiv.org/abs/2509.00406)**：Ahmed H. Mahmoud 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。通用的自动微分框架会构建全局计算图，而忽略了网格能量是许多小项之和、每项只涉及少数几个顶点这一事实。这个系统在寄存器和共享内存中对每个单元做前向模式微分，并直接在 GPU 上组装梯度、稀疏雅可比和 Hessian。这使得布料和弹性的牛顿类求解器既更容易编写，也比通用张量框架更快。与[第 7 章]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})和[第 12 章]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})相关。
{: #fw-mesh-ad}

**[DiffSurFlow: Efficient and Robust Differentiable Fluid Optimization via Surrogate Strategy on Flow Map](https://doi.org/10.1145/3811337)**（[项目主页](https://illusionarydream.github.io/DiffSurFlowPage/)）：Yuhao Quan 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。对一个很长的流体模拟求微分（例如把烟雾引导成目标形状）在时间和内存上都很昂贵。作者观察到，通过流映射（flow map）连接各时间步的那些环节承载了梯度的大部分。他们构造了一个代理梯度，保留这些环节，并剪掉冗余的伴随计算。逆向流体设计因此变得更便宜、更鲁棒。它用[第 12 章]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})的伴随思想扩展了[第 7 章]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})的流体。
{: #fw-diffsurflow}

**[Learnable Persistent Wrinkle Formation in Cloth Simulation](https://arxiv.org/abs/2609.13707)**：Deshan Gong 等，*SIGGRAPH Asia 2026*，已接收，2026 年 12 月。真实的织物在被穿着或折叠之后会留下折痕，这是一种弹塑性效应，标准的布料模型（比如[第 7 章]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})中的弹性弹簧和约束）并未涵盖。作者测量了一百多种织物在反复加载和卸载下的行为，并用伴随法把一个带摩擦的可微弹塑性布料模型拟合到测得的曲线上。这样，模拟出的衣物就能保持逼真的持久皱褶。
{: #fw-wrinkles}

**[Curly Hair Simulation using Curly Finite Elements](https://arxiv.org/abs/2607.22103)**：Xinming Pei 等，arXiv 预印本，2026 年 7 月。卷发和波浪发把发丝尺度的运动与精细的螺旋和波浪耦合在一起，用大量小的杆段去分辨它们代价很高。这篇预印本把每根发丝建模为一根杆，其单元携带解析的波浪或螺旋细节：弯曲驱动波浪，扭转驱动螺旋，能量按拉伸、屈曲和弯曲分开。碰撞使用粗糙的代理加上解析细节，引导发丝则插值出密集的头发。它扩展了[第 7 章]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})的杆和约束模型。
{: #fw-curly-hair}

**[MPM Lite: Linear Kernels and Integration without Particles](https://arxiv.org/abs/2602.07853)**：Xiang Feng 等，arXiv 预印本，2026 年 2 月。物质点法（material point method, MPM）混合使用粒子和网格来模拟雪、沙以及其他大变形材料（[第 7 章]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})）。在隐式 MPM 中，用宽核对大量粒子积分力，使每次求解都很昂贵。MPM Lite 把粒子状态重采样到体素六面体网格的固定积分点上，并使用紧支的线性核，因此力的计算和时间积分完全不触及粒子。其结果是一个类似有限元的增量势能形式，可以配合标准的非线性求解器和预条件器使用。
{: #fw-mpm-lite}

**发展方向。** 模拟正在变成*软件基础设施*：符号化的能量、代码生成，以及 GPU 上考虑局部性的自动微分。实测数据（织物测试）和伴随法被用来拟合材料模型，而不是手工调参。同样的求解器也位于机器人模拟器之内，因此本节与[具身智能的模拟平台]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})相联系。

## 7. 动画与角色

[动画章节]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})讲了蒙皮、IK、运动匹配和基于物理的角色。2026 年，世界模型背后的学习方法（扩散、自回归 Transformer、大规模预训练）进入了角色动画，而 GPU 模拟使基于物理的技能学习变得便宜。

**[ARDY: Autoregressive Diffusion with Hybrid Representation for Interactive Human Motion Generation](https://arxiv.org/abs/2607.08741)**：Kaifeng Zhao 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。离线的文本到运动模型可控，但对交互来说太慢；在线模型则失去控制和长程连贯性。ARDY 用一个两阶段的自回归扩散 Transformer 以流式方式生成运动，其上的表示是显式的根节点特征加上潜在的身体嵌入，并使用变长的历史。它接受运动学约束，也能实时接受新的文本提示。建立在[第 9 章]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})和[扩散基础]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})之上。
{: #fw-ardy}

**[GPC: Large-Scale Generative Pretraining for Transferable Motor Control](https://arxiv.org/abs/2606.29148)**：Yi Shi 等，*SIGGRAPH 2026 Conference Papers*，已发表，2026 年 7 月。基于物理的角色通常一次只训练一个任务，控制器也无法迁移。GPC 使用有限标量量化（finite scalar quantization）学习一个离散的运动码词表，并与一个把码转换为模拟中关节动作的强化学习策略联合训练。然后由一个 GPT 风格的 Transformer 学习预测下一个码。结果是一个可以适配到新任务的预训练生成式控制器，也就是角色版的“基础模型”配方。与[机器人强化学习]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})相关。
{: #fw-gpc}

**[InstantMimic: A High Performance System for Learning Physics-based Skills in Seconds](https://arxiv.org/abs/2609.09821)**：Ikjun Choi 等，*SIGGRAPH Asia 2026 Conference Papers*，已接收，2026 年 12 月。即使有 GPU 物理，训练一个角色去模仿一段动作片段，也会把大量硬件资源浪费在求解器之外的开销上：碎片化的核函数以及 CPU-GPU 之间的数据传输。InstantMimic 把模拟、环境逻辑、策略推理和更新放在同一个 GPU 原生的执行流程中。作者报告每个技能的训练时间只需数秒，这使得自动超参数搜索之类的事情变得可行。它是[第 9 章]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})和[模拟平台]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})的系统一面。
{: #fw-instantmimic}

**[Skinned Motion Retargeting via Artifact-driven Kinematic Prior Refinement](https://arxiv.org/abs/2609.06517)**：Seokhyeon Hong 等，*SIGGRAPH Asia 2026 (Journal Track)*，已接收，2026 年 12 月。重定向（retargeting）是把动画迁移到骨架和体型都不同的角色上，而神经重定向常会留下自穿透（比如手臂穿过躯干）。该方法训练一个带有跨骨架运动嵌入的 Transformer 自编码器。在细化阶段，它在*蒙皮网格*上检测穿透，并通过运动到顶点的雅可比把它们转化为对运动的修正。建立在[第 9 章]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})的蒙皮和 IK 之上。
{: #fw-retarget}

**[Generalized Audio-Driven Synthesis of Precise Drummer Motion](https://arxiv.org/abs/2608.19055)**：Álvaro G. Iñesta 等，*SCA 2026 (Best Paper)*，已发表，2026 年 7 月。鼓手的演奏要求精确的时机和鼓棒位置，而早先的音频到运动方法依赖运动匹配或 MIDI 输入，对真实录音的泛化很差。这个扩散模型使用两个损失，一个针对骨架完整性，一个针对鼓棒精度。它在专门构建的数据集上训练，并用数据增强来适应野外音频。论文还提出了衡量击打准确度和音频-运动相关性的指标。建立在[第 9 章]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})之上。
{: #fw-drummer}

**[Multi-View Face and Gesture Animation with Dynamic Gaussians](https://arxiv.org/abs/2608.04722)**：Alireza Javanmardi 等，*SCA 2026 (CGF 45(8))*，已发表，2026 年 7 月。虚拟形象系统往往要么只捕捉头部（而忽略双手），要么捕捉全身（而丢失面部和手指的细节）。这条管线分别对脸和手建模，再用参数化的上半身网格把它们融合起来，并把 3D 高斯附着在网格上表示外观。作者还发布了一个多视角上半身采集数据集，包含受控的表情和手势。它把[第 9 章]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})的蒙皮网格与[高斯虚拟形象]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})结合在了一起。
{: #fw-face-gesture}

**发展方向。** 角色动画正在向大模型的配方收敛：把运动 token 化、预训练，然后以文本、音频或约束作为条件。物理通过在极快的 GPU 模拟器上的强化学习进入。经典工具（蒙皮雅可比、运动匹配）则作为建立在学习模型之上的细化层和控制层继续存在。

## 8. 成像与显示

这一节对 AR 和 VR 很重要。头显是一个渲染系统，其输出由人的视觉系统来接收，所以显示光学和感知就成了渲染问题的一部分。全息近眼显示能够重现光的*波前*，因而可以呈现真实的对焦线索，它是 2026 年的一大主题。

### 讲透一个概念：用 Gerchberg-Saxton 求纯相位全息图

**直观理解。** 全息显示器使用空间光调制器（spatial light modulator, SLM），这是一块像素屏幕，能以可编程的相位 $\varphi$ 延迟相干激光，但不能改变其振幅。在最简单的（远场）设置中，观看者看到的图像是 SLM 出射场的傅里叶变换。所以我们需要一个相位图案，使其傅里叶变换具有规定的*振幅* $A$，而像平面上的相位可以自由选择。

**公式。** 记 $\mathcal F$ 为二维傅里叶变换，我们希望 $\lvert\mathcal F\{e^{i\varphi}\}\rvert \approx A$。Gerchberg-Saxton 算法在两个平面之间交替，并在每个平面上强制满足该处已知的条件：

$$
\varphi^{(k)} = \arg \mathcal F^{-1}\!\left\{A\,e^{i\psi^{(k-1)}}\right\},
\qquad
\psi^{(k)} = \arg \mathcal F\!\left\{e^{i\varphi^{(k)}}\right\}.
$$

第一步保留 SLM 处的相位并把振幅设为 1，因为 SLM 只能显示相位。第二步保留图像中的相位，并把振幅替换为目标。每一步都是向该平面上已知条件的投影。这就是 Gerchberg 和 Saxton（1972）的算法，是当今基于优化的全息图生成方法的鼻祖。

```python
import numpy as np

def gerchberg_saxton(A, iters, seed=0):
    psi = np.random.default_rng(seed).uniform(0, 2 * np.pi, A.shape)   # image-plane phase
    for _ in range(iters):
        phi = np.angle(np.fft.ifft2(A * np.exp(1j * psi)))   # phase-only SLM pattern
        R = np.fft.fft2(np.exp(1j * phi))                    # what the viewer sees
        psi = np.angle(R)
    return phi, np.abs(R) ** 2
yy, xx = np.mgrid[0:128, 0:128] - 63.5                       # target: ring plus cross
r = np.hypot(xx, yy)
A = ((r > 30) & (r < 38)).astype(float)
A[(abs(xx) < 4) & (abs(yy) < 22)] = 1.0
A[(abs(yy) < 4) & (abs(xx) < 22)] = 1.0
for k in (1, 5, 60):
    amp = np.sqrt(gerchberg_saxton(A, k)[1])
    s = (amp * A).sum() / (amp ** 2).sum()                   # best brightness scale
    print(k, round(np.sqrt(((s * amp - A) ** 2).mean() / (A ** 2).mean()), 3))
# 1 0.444 / 5 0.366 / 60 0.288: the relative error plotted in the figure below
```

{% include blog_figure.liquid path="assets/img/blog/graphics/13-hologram-gs.svg" caption="在 128 × 128 目标（圆环与十字）上的一次真实 Gerchberg-Saxton 运行。上排：目标强度 $\lvert A\rvert^2$、最终的纯相位 SLM 图案 $\varphi$（从 $-\pi$ 到 $\pi$ 的循环色图），以及每次迭代的相对误差（对数坐标）。下排：迭代 1、5 和 60 次之后重建的强度。形状在一次迭代后就出现了，但布满散斑；误差在最初几次迭代中迅速下降，然后趋于平缓，留下残余的散斑。如何去除这种散斑，并以人所感知的方式来评判它，正是下面这些全息论文要解决的问题。" %}

真实系统还要加入近场传播（角谱法）、3D 内容和经过相机标定的光学，并且用基于损失的梯度下降取代 Gerchberg-Saxton。这就是为什么*损失的选择*（HoOPOE）和*光传输*模型的选择（HoloPathTracer）都是研究问题。

### 论文

**[HoloPathTracer: Fast and Accurate Wave Path Tracing for Holography](https://arxiv.org/abs/2606.14173)**：Wenbin Zhou 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。计算机生成全息图通常分两步制作：先渲染辐射度（图像或分层），再由它们传播波。这种拆分会丢失深度和视角连续性，并且对光泽或镜面类表面处理得很差。HoloPathTracer 用蒙特卡洛路径追踪同时求解渲染方程和波传播积分。它重用路径，以很低的代价生成多个时间复用的相位全息图。硬件实验结果展示了正确的离焦、依赖视角的外观和反射。它是把[路径追踪]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})搬到波动光学，面向的是 [XR]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})的显示器。
{: #fw-holopathtracer}

**[HoOPOE: A Holography-Optimized Perceptual ObjectivE function](https://arxiv.org/abs/2610.17474)**：Ethan Chen 等，*SIGGRAPH Asia 2026*，已接收，2026 年 12 月。真实 SLM 上的全息图会出现散斑，也就是上图中可见的颗粒状噪声，而普通的图像损失并不能反映人眼对它的可见程度。作者围绕人对时空频率和颜色的敏感度构建了一个损失，其参数针对全息做了调节。在一项针对 3D 场景全息图的用户研究中，参与者更喜欢用它优化出的结果，胜过次优的损失。任何基于梯度的全息图管线都可以采用它。它与感知驱动的渲染（perception-aware rendering）和 [XR]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})相联系。
{: #fw-hoopoe}

**[Dichoptic Foveation](https://arxiv.org/abs/2609.16385)**：Henry Kam 等，*SIGGRAPH 2026 Conference Papers*，已发表，2026 年 7 月。注视点渲染（foveated rendering）在眼睛不敏感的周边区域降低质量，通常对双眼做同样的处理。这项工作在周边区域给每只眼睛展示*不同*的频率内容，模糊一个视图而锐化另一个，并在 VR 头显中测量大脑如何融合这两者。测量结果被转换为刚可察觉差异（just-objectionable-difference, JOD）尺度，并用一个感知模型来拟合，再应用到注视点 360 度视频上。它为本站[实验室]({{ '/' | relative_url }}#lab)中的注视点渲染增加了双眼线索，并与 [XR 渲染]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})相关。
{: #fw-dichoptic}

**[PAColorHolo: A Perceptually-Aware Color Management Framework for Holographic Displays](https://arxiv.org/abs/2601.14766)**：Chun Chen 等，*ACM TOG 45(2)*，已发表，2026 年 3 月。全息显示器混合红、绿、蓝三种激光，要再现*看起来*正确的颜色出人意料地困难。该框架结合了色彩空间变换、照明的自适应控制，以及在标定中使用的相机颜色响应神经模型。它在模拟、光学原型和用户研究中得到了验证。颜色管理是颜色管线在显示一端的环节，这条管线始于[第 3 章]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})的着色。
{: #fw-pacolorholo}

**[Hybrid Foveated Path Tracing with Peripheral Gaussians for Immersive Anatomy](https://arxiv.org/abs/2601.22026)**：Constantin Kleinbeck 等，*IEEE VR 2026*，已发表，2026 年 3 月。在 VR 中对体积医学数据做路径追踪，效果极好，但对头显来说太慢；而预计算的高斯泼溅很快，却必须提前准备。该系统只对注视区域做路径追踪，并在周边显示一个高斯近似，该近似可以被快速重建，并根据中央凹的渲染结果逐步细化。由深度引导的重投影掩盖了延迟。它以随注视点变化的方式，把[实时路径追踪]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})与 [3DGS]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})结合起来。
{: #fw-hybrid-foveated}

**发展方向。** 面向头显的渲染正在变得*由感知驱动、并且关注光学*：基于人类视觉建模的损失、双眼与随注视点变化的渲染，以及基于物理的波动光学。对从事 AR/VR 和 HCI 的研究者来说，这些论文是图形学与用户研究之间的桥梁。

## 9. 制造与设计

用于形状、模拟和优化的图形学方法，也可以用来设计实体物件：3D 打印零件、针织品、剪纸（kirigami）和服装。本节的每一项工作都是 SIGGRAPH 2026 的论文。

**[AtomSlicer: Constant-Thickness Field-Aligned Non-Planar Slicing and Continuous Toolpaths for FFF](https://doi.org/10.1145/3811363)**（[项目主页](https://xavierchermain.github.io/publications/atom-slicer)）：Giovanni Cocco 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。熔丝（FFF）打印机通常打印平面层。多轴打印机可以沿着弯曲的层打印，这能提高强度和表面质量，但层必须保持近似恒定的厚度，喷嘴还必须避免碰撞。该方法根据零件上的方向场和走向场，构建非平面的层和刀具路径，这些路径在每一层内是连续的，并且在层与层之间尽可能连续。它还会报告某个设计何时无法被制造。建立在[第 8 章]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})中曲面上的场之上。
{: #fw-atomslicer}

**[Surface Power Diagrams for Knit Singularity Placement](https://rahulmitra.xyz/projects/powerknit/)**（DOI [10.1145/3811401](https://doi.org/10.1145/3811401)）：Rahul Mitra 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。机器编织一个 3D 形状需要一张“针织图”，其奇异点（行开始、结束或合并的地方）必须被仔细放置。这篇论文用修改过的测地热核，把幂图（power diagram，即加权 Voronoi 图）推广到曲面网格上。它通过 Lloyd 式迭代来放置奇异点，并加入顺序约束，使无螺旋的针织图更加可靠。制作出的样品展示了结果。建立在[第 8 章]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})的测地线和 Voronoi 思想之上。
{: #fw-powerknit}

**[IsoGami: Rigid-Deployable Kirigami Materials From Isohedral Tilings](https://thomaszewski.com/projects/isogami/index.html)**（DOI [10.1145/3799902.3811127](https://doi.org/10.1145/3799902.3811127)）：Guo Han 等，*SIGGRAPH 2026 Conference Papers*，已发表，2026 年 7 月。剪纸是把一张薄片切开，使其能够展开成新的形状。*刚性可展开*（rigid-deployable）的设计通过单一的运动打开，而不弯曲任何一块瓦片。该方法系统地搜索平面的等面铺砌（isohedral tiling），改变关节拓扑和瓦片形状。连杆分析只保留恰好有一个自由度的设计，然后对它们的展开做模拟。论文附带一个交互式浏览器和 3D 打印的原型。它与[第 7 章]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})中力学的约束视角相关。
{: #fw-isogami}

**[Shellular Metamaterial Design via Compact Electric Potential Parametrization](https://arxiv.org/abs/2511.04025)**：Tianyi Huang 等，*SIGGRAPH 2026 Conference Papers*，已发表，2026 年 7 月。壳体超材料（shell-based metamaterials）是周期性的薄壁结构，在低密度下很强，但难以设计，评估代价也高。这里一个设计由几十个电荷来描述，壳体几何则由它们产生的电势推导得出。一条 GPU 均匀化（homogenization）管线可以快速计算等效弹性性质。两者结合，使交互式设计和面向目标刚度的逆向设计成为可能，并通过打印的原型得到验证。它用到了隐式曲面（[第 8 章]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})）和弹性（[第 7 章]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})）。
{: #fw-shellular}

**[Learning Sewing Patterns via Latent Flow Matching of Implicit Fields](https://arxiv.org/abs/2601.17740)**：Cong Cao 等，*SIGGRAPH 2026 Conference Papers*，已发表，2026 年 7 月。一件衣服由缝合在一起的平面裁片制成，裁片的数量、形状和缝线差别很大，使得纸样很难生成。每个裁片被编码为其边界的符号距离场和其缝合端点的无符号距离场，位于带可微网格化的潜空间中。一个流匹配模型生成裁片集合，另一个独立的模块预测缝合方式。应用包括从图像估计纸样、补全和重新适配。它把[第 8 章]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})的隐式场与[流匹配]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})结合在一起。
{: #fw-sewing}

**发展方向。** 计算设计不断从“模拟一个给定的设计”走向“搜索或生成设计空间”：铺砌、电荷配置、纸样的潜空间。GPU 上的快速评估（均匀化、模拟）使这一切成为交互式的。

## 10. 生成式 3D/4D 内容

生成式 3D 模型已在[3D 与 4D 世界生成]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})中从世界模型的角度讲过。图形学会议贡献的是生产所需要的东西：拓扑良好的原生网格、可控的高斯、尊重房间结构的布局，以及可以被模拟和做动画的资产。

**[Nexus: Native Mesh Generation with Diffusion](https://arxiv.org/abs/2607.13563)**：Hanxiao Wang 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。大多数网格生成器要么以自回归的方式把三角形作为 token 逐个输出，要么先生成一个场再从中提取网格。两者在拓扑上都有困难。Nexus 直接对*顶点*做扩散，表示为由粗到细的稀疏八叉树体素。第二个扩散模型生成逐顶点的嵌入，连接关系从中解码出来。作者报告结果优于自回归和两阶段基线，并且在一项盲测研究中得到 3D 从业者的偏好。建立在网格（[第 8 章]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})）之上。
{: #fw-nexus}

**[Generative 3D Gaussians with Learned Density Control](https://arxiv.org/abs/2605.16355)**：Runjie Yan 等，*SIGGRAPH 2026 Conference Papers*，已发表，2026 年 7 月。生成式高斯模型通常把基元放在固定网格或固定大小的数组上，这会把预算浪费在空旷或简单的区域。这里高斯的中心是从八叉树上的一个可学习密度中采样的，用渲染监督进行训练，再由一个潜在扩散模型根据一张图像生成这种表示。一种基于 Sobol 序列的 token 锚定方案加速了扩散训练。基元的数量可以在生成时选择。它把 [3DGS]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})的稠密化问题与[扩散]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})结合了起来。
{: #fw-triposplat}

**[CasLayout: Cascaded 3D Layout Diffusion for Indoor Scene Synthesis with Implicit Relation Modeling](https://arxiv.org/abs/2604.27361)**：Yingrui Wu 等，*SIGGRAPH 2026 (ACM TOG 45(4))*，已发表，2026 年 7 月。生成出来的房间必须尊重墙、门和窗，以及家具之间合理的关系，而所有物体之间的稠密关系图会带来噪声。该方法运行四个条件扩散阶段：物体数量与类别、尺寸、潜在关系，最后是有向包围盒，并把建筑结构作为约束。稀疏的关系图提供了控制。它还借助语言模型和视觉语言模型，支持零样本的图像到场景生成。与[3D 世界生成]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})相关。
{: #fw-caslayout}

**[SIMART: Decomposing Monolithic Meshes into Sim-ready Articulated Assets via MLLM](https://arxiv.org/abs/2603.23386)**（[项目主页](https://simart-mllm.github.io/)）：Chuanrui Zhang 等，*SIGGRAPH 2026 Conference Papers*，已发表，2026 年 7 月。机器人模拟器需要铰接物体（带门的柜子、可滑动的抽屉），而扫描得到或生成的网格是整块的。SIMART 用一个多模态大语言模型把网格拆分为部件，*同时*预测它们的关节，避免了跨阶段的误差累积。一个稀疏的 3D VQ-VAE 让 token 的数量保持在可控范围内。论文在机器人模拟中演示了这些资产。这是面向[具身智能模拟器]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})和[引擎]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})的资产生成。
{: #fw-simart}

**[R-DMesh: Video-Guided 3D Animation via Rectified Dynamic Mesh Flow](https://arxiv.org/abs/2605.13838)**（[项目主页](https://r-dmesh.github.io/)）：Zijie Wu 等，*SIGGRAPH 2026 Conference Papers*，已发表，2026 年 7 月。让用户的静态网格跟随参考视频做动画，当网格的初始姿态与视频不同时就会失效。一个 VAE 把输入拆分为基础网格、相对运动，以及一个学习得到的、用来对齐起始姿态的*校正*（rectification）偏移。然后由一个以视频为条件的整流流（rectified-flow）扩散 Transformer 生成网格动画。作者构建了一个包含 50 万多个模拟网格序列的数据集，它也支持重定向和 4D 生成。建立在[第 9 章]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})和 [4D 生成]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})之上。
{: #fw-rdmesh}

**[GaussiAnimate: Rig Animatable Categories with Level of Dynamics](https://arxiv.org/abs/2604.08547)**：Jiaxin Wang 等，*SIGGRAPH Asia 2026*，已接收，2026 年 12 月。动态的 4D 采集结果以高斯或网格序列存储，很难用新的姿态重新做动画。该方法把一个序列压缩为带蒙皮权重的自由形态骨骼，并从规范形状中提取基于曲率的骨架。然后一个无需学习的、逐部件的运动匹配步骤检索并混合已有的运动，以合成新的运动。它不需要模板，并且能处理拓扑变化。它把[第 9 章]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})的蒙皮与运动匹配，同 [3DGS 前沿]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})中的动态高斯结合在了一起。
{: #fw-gaussianimate}

**发展方向。** “生成一个漂亮的物体”正让位于“生成一个*可用的*资产”：拓扑良好的原生网格、预算可控的基元、带约束的房间，以及已铰接、已绑定骨骼、可以直接用于模拟的物体。图形学会议是以管线能用输出做什么来评判生成模型的。

## 11. 跨领域趋势

{% include blog_figure.liquid path="assets/img/blog/graphics/13-trend-map.svg" localized="true" caption="趋势图：每条线把本章的一个主题（左）连到一个博客章节（右），该章节讲授的是这个主题中某项工作的前置知识；线越粗表示工作越多。G = 图形学，NR = 神经渲染，WM = 世界模型，EA = 具身智能，GE = 图形引擎，后面跟章节编号。右侧节点的大小是连线总数。模拟（G07）、几何处理（G08）和动画（G09）是被使用最多的基础，而且几乎每个主题也都延伸到了图形学系列之外。" %}

通读这八个小节，同样的几股力量一再出现。

1. **神经基元无处不在，但以混合的形式。** 高斯现在可以被光线追踪（GRay）、被点泼溅（Gaussian Point Splatting）、被用作光传输的基（Gaussian Light Transport），也被附着在虚拟形象网格上。网络以对经典模型的*修正*形式进入：GGX BRDF 加一个网络，块压缩纹理加一个解码器，ReSTIR 估计器加一个控制变量。经典结构使代价和行为保持可预测。
2. **可微性是基础设施。** Iskra（几何求解器）、考虑局部性的自动微分（网格能量）、DiffSurFlow（流体）、用伴随法拟合的皱褶模型，以及线基元光栅化器，都把梯度看作系统所提供的东西，而不是每篇论文各自重新推导的东西。这就是[第 12 章]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})的纲领被带入模拟和几何。
3. **着色器和求解器内部的机器学习。** 神经缓存、由超网络解码的纹理和混合 BRDF，被设计成能在现代 GPU 的张量硬件上逐像素实时运行。[引擎系列]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})会跟进这些组件如何落地到生产引擎中。
4. **生成式先验遇上物理约束。** 扩散和流匹配现在可以生成四边形布局、缝纫纸样、网格、房间和运动，而图形学所增加的价值就在约束之中：拓扑、物理有效性、缝线、运动学、可用于模拟。
5. **模拟与渲染趋于融合，二者都在为具身智能提供养分。** ToF ReSTIR 模拟传感器，SIMART 制作可直接用于模拟的资产，InstantMimic 和 GPC 大规模训练基于物理的技能，而 GPU 接触求解器是机器人模拟器的核心。这是通向[世界模型]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})和[具身智能]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})的桥梁，也通向[物理引擎]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})。
6. **感知成为渲染的一部分。** 双眼注视点渲染（dichoptic foveation）、针对全息的感知损失和感知颜色管理，都把人的视觉系统视为管线的最后一级，这个主题对任何构建 AR/VR 系统的人都很重要。

## 12. 如何跟进图形学研究

这个领域发展很快，但信息来源是稳定的。一套实用的日常做法：

- **Ke-Sen Huang 的论文列表**（[kesen.realtimerendering.com](https://kesen.realtimerendering.com/)）为每个主要会议收集论文标题，并在论文出现时附上作者主页、PDF、视频和代码的链接。截至本文写作时，有 SIGGRAPH、SIGGRAPH Asia（有条件接收的论文）、Eurographics 和 I3D 的 2026 年页面。这是最好的单一入口。
- **ACM TOG 与 ACM Digital Library**（[dl.acm.org/journal/tog](https://dl.acm.org/journal/tog)）提供权威版本。SIGGRAPH 期刊类论文出现在每卷的第 4 期，SIGGRAPH Asia 的则在第 6 期；会议类论文出现在单独的论文集中。**Crossref**（`api.crossref.org/works/<doi>`）是核对某个 DOI 的会议、卷号和日期的一种快捷而开放的方式。
- **arXiv cs.GR**（[arxiv.org/list/cs.GR/recent](https://arxiv.org/list/cs.GR/recent)）：留意“comments”字段。作者通常会在那里写上“Accepted to SIGGRAPH Asia 2026”，没有这样的说明就意味着*预印本*。相关工作也会出现在 cs.CV 和 cs.LG 中。
- **Eurographics Digital Library**（[diglib.eg.org](https://diglib.eg.org/)）收录 CGF、EGSR、SCA、SGP 和 HPG 的论文。
- **Technical Papers Fast Forward 与视频。** 每届 SIGGRAPH 和 SIGGRAPH Asia 都以一场 fast-forward 环节开场，每篇论文都有一段很短的推介，而且大多数论文都有补充视频。观看它们是浏览整个会议最快的方式。官方网站是 [s2026.siggraph.org](https://s2026.siggraph.org/) 和 [asia.siggraph.org/2026](https://asia.siggraph.org/2026/)。
- **课程（Courses）。** SIGGRAPH 的课程（例如长期举办的 *Physically Based Shading* 和 *Advances in Real-Time Rendering* 系列，可从 [blog.selfshadow.com](https://blog.selfshadow.com/) 链接到）是为教学而写的，也是从本博客通向论文的最佳桥梁。
- **开源代码。** 许多论文在项目主页上链接了 GitHub 仓库。每个月把一篇论文的代码跑起来，比浏览十篇学到的更多。
- **读书会。** 每周挑一场 fast forward 的内容，一起读一篇论文，并尝试复现一张图。本章中的“讲透一个概念”框就是应当追求的深度的范例。

## 代表性论文

本章的一个横截面，每个主题一到两篇。所有条目都标注了其截至 2026 年 11 月的状态。

| 论文 | 发表 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Shi et al., *Spatio-Temporal Control Variates with ReSTIR for Real-Time Rendering* | SIGGRAPH 2026 Conference Papers | 2026 | [DOI](https://doi.org/10.1145/3799902.3811113) | ReSTIR 中的控制变量；消除颜色噪声 |
| Kim et al., *ToF ReSTIR* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2605.11536) | 用于飞行时间渲染的、考虑路径长度的重用 |
| Poirier-Ginter et al., *GRay: Ray Tracing 3D Gaussians Near the Speed of Splats* | I3D 2026 (PACMCGIT 9(1)) | 2026 | [arXiv](https://arxiv.org/abs/2606.30869) | 快速的高斯光线追踪 |
| Rijsdijk et al., *Gaussian Point Splatting* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [DOI](https://doi.org/10.1145/3811272) | 免排序的随机泼溅，可处理巨大场景 |
| Kong et al., *SQuadGen* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2604.27329) | 在 chart 距离场上做扩散，得到干净的四边形布局 |
| Dodik et al., *Iskra: A System for Inverse Geometry Processing* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2602.12105) | 为现有几何求解器自动生成伴随 |
| Tang et al., *YASPS* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2605.23088) | 符号化、即时编译的 GPU IPC |
| Zhao et al., *ARDY* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2607.08741) | 实时可控的自回归运动扩散 |
| Zhou et al., *HoloPathTracer* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2606.14173) | 为全息图同时求解路径追踪与波传播 |
| Kam et al., *Dichoptic Foveation* | SIGGRAPH 2026 Conference Papers | 2026 | [arXiv](https://arxiv.org/abs/2609.16385) | 面向注视点 VR 的双眼感知模型 |
| Cocco et al., *AtomSlicer* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [DOI](https://doi.org/10.1145/3811363) | 面向多轴打印的恒定厚度非平面切片 |
| Wang et al., *Nexus: Native Mesh Generation with Diffusion* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2607.13563) | 直接对顶点和连接关系做扩散 |
| Zhang et al., *SIMART* | SIGGRAPH 2026 Conference Papers | 2026 | [arXiv](https://arxiv.org/abs/2603.23386) | 从单个网格得到可直接用于模拟的铰接资产 |
| Attimont et al., *Gaussian Light Transport* | SIGGRAPH Asia 2026 (to appear) | 2026 | [arXiv](https://arxiv.org/abs/2609.11430) | 把高斯混合用作渲染方程的求解器 |

## 学习资源

- [Ke-Sen Huang 的论文列表](https://kesen.realtimerendering.com/)：SIGGRAPH、SIGGRAPH Asia、Eurographics 和 I3D 的 2026 年页面。
- [ACM Transactions on Graphics](https://dl.acm.org/journal/tog) 与 [Eurographics Digital Library](https://diglib.eg.org/)。
- [arXiv cs.GR 最新列表](https://arxiv.org/list/cs.GR/recent)。
- SIGGRAPH 2026 的[技术论文日程](https://s2026.siggraph.org/program/technical-papers/)和 SIGGRAPH Asia 2026 的[技术论文页面](https://asia.siggraph.org/2026/program/technical-papers/)。
- 对于四个“讲透一个概念”框：Veach 的博士论文和 PBRT（[pbr-book.org](https://pbr-book.org/)）中关于蒙特卡洛方差缩减的内容；Li et al., *Incremental Potential Contact*（ACM TOG 39(4), 2020, [DOI](https://doi.org/10.1145/3386569.3392425)）；Goodman 的 *Introduction to Fourier Optics*，用于全息。
- 绘图脚本 `bin/figures/graphics/graphics_13.py` 和数据文件 `bin/figures/graphics/data/13-frontiers.json`。随着论文发表更新这个 JSON 并重新运行脚本；浏览器组件使用同样的字段。

## 练习

1. **控制变量。** 在算例中，把 $g(x) = 1+x$ 替换为 $g(x) = 1 + x + x^2/2$（$e^x$ 的二阶泰勒多项式）。用解析方法或 NumPy 计算 $G$、$\beta^*$ 和方差的降低程度。

   <details markdown="1"><summary>提示</summary>
   $G = 1 + \tfrac12 + \tfrac16 = 5/3$，$\sigma_g^2 \approx 0.1889$，$\operatorname{Cov}(f,g) \approx 0.2136$（用到 $\mathbb E[x^2e^x] = e-2$），所以 $\beta^* \approx 1.131$，$\rho^2 \approx 0.9981$。残余方差比用 $1+x$ 时小约 9 倍，比普通蒙特卡洛小约 500 倍。
   </details>

2. **光线上的高斯。** 证明 $q(t)$ 是关于 $t$ 的凸二次函数，并且 $q(t^*) = q(0) - \frac{(\mathbf d^\top\Sigma^{-1}(\boldsymbol\mu-\mathbf o))^2}{\mathbf d^\top\Sigma^{-1}\mathbf d}$。然后用代码片段做数值验证。

   <details markdown="1"><summary>提示</summary>
   把 $q(t)$ 写成 $q(t) = a t^2 - 2bt + c$，其中 $a = \mathbf d^\top\Sigma^{-1}\mathbf d > 0$，$b = \mathbf d^\top\Sigma^{-1}(\boldsymbol\mu-\mathbf o)$，$c = q(0)$，然后配方。
   </details>

3. **IPC 屏障。** 证明 $b$ 在 $d = \hat d$ 处二阶连续可微：计算 $d$ 从下方趋于 $\hat d$ 时的 $b'$ 和 $b''$，并与从上方得到的值 $0$ 比较。为什么牛顿法在意这一点？

   <details markdown="1"><summary>提示</summary>
   令 $u = d - \hat d$，则 $b = -u^2\ln(1 + u/\hat d)$。展开对数：在 $u = 0$ 附近 $b \approx -u^3/\hat d$，所以 $b'$ 和 $b''$ 从下方都趋于 0，屏障是 $C^2$ 的。牛顿法用到 Hessian，所以当一个接触对进入激活集时，如果 $b''$ 发生跳变，迭代就会停滞或振荡。
   </details>

4. **全息。** 在你选择的目标上，分别用 1、5、20 和 100 次迭代运行 Gerchberg-Saxton 代码片段，并画出误差。然后用*恒定*的初始相位代替随机相位。会发生什么？为什么随机相位有帮助？

   <details markdown="1"><summary>提示</summary>
   用恒定相位时，$\mathcal F^{-1}\{A\}$ 把大部分能量放进少数几个低频的 SLM 像素里。把振幅强制设为 1 会把这个频谱压平，这相当于一个很强的高通滤波器：主要只有目标的边缘得以保留，迭代往往会停滞。随机相位把能量均匀地分散到整个 SLM 上，所以纯相位约束丢失的信息更少，代价是出现散斑。
   </details>

5. **跟进这个领域。** 打开 Ke-Sen Huang 的 SIGGRAPH Asia 2026 页面，挑两篇本章没有收录的论文，在 arXiv 或 Crossref 上核实它们的状态，并把它们加入 `13-frontiers.json`，写明主题、月份和它们所建立在其上的章节。重新运行绘图脚本，并检查浏览器。

本章暂时为图形学系列画上句号。从这里出发，[图形引擎系列]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})展示这些思想如何变成软件，[世界模型]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})和[具身智能]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})系列则展示图形学在哪里与学习型智能体相遇。
