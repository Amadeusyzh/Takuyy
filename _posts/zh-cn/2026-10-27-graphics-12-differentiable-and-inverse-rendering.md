---
layout: post
title: "可微渲染与逆向渲染：穿过像素的梯度"
date: 2026-10-27 09:12:00+0900
description: "为什么图像的梯度很难求（可见性会产生狄拉克 δ），软光栅化器、nvdiffrast、边缘采样、重参数化与路径空间方法如何解决这个问题，Mitsuba 3，逆向渲染的实践，以及三个可以运行的 PyTorch 实验。"
categories: graphics
tags: [differentiable-rendering, inverse-rendering, soft-rasterizer, edge-sampling, mitsuba, pytorch]
series: graphics
series_order: 12
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

到目前为止，每一篇文章讲的都是*正向*过程：给定一个场景（几何、材质、光源、相机），通过[光栅化]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})或[路径追踪]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})生成图像。而三维视觉中的大多数问题恰好相反：我们手里有照片，想要得到场景。**逆向渲染**（inverse rendering）从图像中恢复形状、材质、光照或相机，而最通用的做法，是让渲染器**可微**（differentiable），再用梯度下降不断调整场景，直到它的渲染结果与照片吻合。这正是 [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) 和 [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) 背后的引擎，因此本章是从经典图形学通往神经渲染系列的桥梁。

难点出奇地具体：对颜色求导很容易，但对*物体在哪里*求导会撞上可见性，而可见性是不连续的。本章的大部分内容都围绕这一个问题，以及人们为绕开它想出的半打巧妙办法展开。

## 前置知识

- 来自[基于物理的渲染]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})的渲染方程与双向反射分布函数（BRDF）；来自[路径追踪]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})的蒙特卡洛积分。
- 来自[第 2 篇]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})的三角形光栅化与覆盖率。
- 链式法则、梯度下降与 Adam；基础的 PyTorch（`requires_grad`、`backward`）。
- 把狄拉克 δ 函数（Dirac delta）$\delta(x)$ 看作“阶跃函数的导数”：$\frac{d}{dx}H(x) = \delta(x)$，其中 $H$ 是海维赛德阶跃函数（Heaviside step，$H(x)=1$ 当 $x>0$，否则为 $0$），且 $\int g(x)\,\delta(x-a)\,dx = g(a)$。

## 1. 正向渲染与逆向渲染

把场景写成参数向量 $\theta$：顶点位置、每个纹素的 BRDF 参数、光源强度、相机位姿。渲染器是一个把 $\theta$ 映射为图像 $I = R(\theta) \in \mathbb{R}^{P}$ 的函数 $R$（$P$ 为像素数乘以颜色通道数）。给定目标照片 $I^\star$，逆向渲染求解

$$
\theta^\star = \arg\min_\theta \; \mathcal{L}\big(R(\theta), I^\star\big) + \mathcal{R}(\theta),
$$

其中 $\mathcal{L}$ 是图像损失（例如均方误差 $\frac{1}{P}\lVert R(\theta)-I^\star \rVert^2$），$\mathcal{R}$ 是编码先验知识（光滑的表面、合理的材质）的正则项（regularizer）。这就是**合成式分析**（analysis by synthesis）：通过合成图像来解释图像。梯度下降需要

$$
\frac{\partial \mathcal{L}}{\partial \theta} = \Big(\frac{\partial I}{\partial \theta}\Big)^{\!\top} \frac{\partial \mathcal{L}}{\partial I},
$$

向量 $\partial\mathcal{L}/\partial I$（每个像素一个数）的计算很简单。所有的困难都在雅可比矩阵（Jacobian）$\partial I/\partial\theta$ 里，而我们从不显式构造它：反向模式微分（reverse-mode differentiation）会即时地把 $\partial\mathcal{L}/\partial I$ 与它相乘。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-pipeline.svg" localized="true" caption="合成式分析的循环。前向传播渲染当前的场景参数 $\theta$ 并与照片比较；反向传播（红色虚线）把 $\partial\mathcal{L}/\partial\theta$ 沿渲染器传回去，使优化器能够更新 $\theta$。" %}

**能恢复什么。** 只要视角足够多、渲染器足够好，四类量都可以恢复：形状（顶点、符号距离场、密度）、材质（反照率、粗糙度、法线贴图、完整的空间变化 BRDF，即 SVBRDF）、光照（环境贴图、点光源）和相机（位姿、内参）。

**不能恢复什么（至少无法从单张图像恢复）。** 逆向渲染充满了*歧义*（ambiguity），即不同的场景可以产生相同的像素：

- *反照率与光强*：光加倍而反照率减半，漫反射图像不变。
- *形状与明暗*：从上方打光的凸起，看起来就像从下方打光的凹陷（从明暗恢复形状中的浮雕歧义，bas-relief ambiguity）。
- *粗糙度与光源大小*：模糊的高光，既可能是小光源下的粗糙表面，也可能是大光源下的光滑表面。
- *纹理与几何*：在单个视角下，画上去的阴影与真实的阴影无法区分。

更多的视角、已知的光照以及先验（正则项 $\mathcal{R}$，或学习得到的先验）才能消除这些歧义。请记住这份清单：当优化“失败”时，它往往只是找到了同一歧义族中的另一个成员。

## 2. 图像的梯度

### 着色参数很容易

取漫反射表面上的一个像素，只有一盏光源：$I = \frac{\rho}{\pi} E \max(0, \mathbf{n}\cdot\mathbf{l})$，其中反照率为 $\rho$，辐照度为 $E$，法线为 $\mathbf{n}$，光线方向为 $\mathbf{l}$。那么 $\partial I/\partial\rho = \frac{E}{\pi}\max(0,\mathbf{n}\cdot\mathbf{l})$：一个光滑、定义明确的数。微表面 BRDF 中的粗糙度、光源强度或某个纹素的值也是如此：这些参数改变的是一个点*有多亮*，而绝不会改变一个像素看到的是*哪个点*。对着色器做普通的自动微分（automatic differentiation, autodiff）就能得到正确的梯度，7.3 节正是这样拟合反照率和粗糙度的。

### 几何会产生不连续

现在来移动几何。一个像素的值是场景在该像素覆盖范围上的积分（即[第 2 篇]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})中的盒式滤波器），而在物体轮廓穿过该范围的位置，被积函数会发生跳变。我们先在一维情形下算一遍。

**一维例子。** 像素是区间 $[0,1]$。在位置 $\theta$ 处的边缘左侧，场景的值为 $f_{\rm in}$（物体）；右侧为 $f_{\rm out}$（背景）。场景是

$$
f(x,\theta) = f_{\rm out} + (f_{\rm in} - f_{\rm out})\,H(\theta - x),
$$

真实的像素值是它在像素上的平均：

$$
I(\theta) = \int_0^1 f(x,\theta)\,dx = f_{\rm out} + (f_{\rm in} - f_{\rm out})\,\theta \qquad (0 \le \theta \le 1).
$$

这是一条完全光滑的斜坡，导数为 $dI/d\theta = f\_{\rm in}-f\_{\rm out}$。现在改为在积分号*内部*求导：

$$
\frac{dI}{d\theta} = \int_0^1 \frac{\partial f}{\partial\theta}\,dx = (f_{\rm in}-f_{\rm out})\int_0^1 \delta(\theta - x)\,dx = f_{\rm in}-f_{\rm out}.
$$

答案相同，但请注意它*从哪里*来：整个导数集中在单独一点 $x=\theta$，也就是边缘上。然而渲染器并不解析地积分，它是在**采样**：在采样点 $x_k$ 处求 $f$ 的值再取平均：

$$
\hat I(\theta) = \frac{1}{N}\sum_{k=1}^{N} f(x_k, \theta).
$$

每一项都是 $\theta$ 的阶跃函数，所以 $\hat I$ 是一条阶梯线。它的导数除了 $N$ 个点 $\theta = x_k$ 之外处处为零，在这些点上则为无穷大。自动微分对计算 $\hat I$ 的代码求导，因此返回的是**恰好为零**：某个采样点恰好落在边缘上的概率为零，所以 δ 函数永远不会被“命中”。一句话概括：当被积函数不连续时，*估计量的导数并不是导数的估计量*。

**数值算例。** 设 $f_{\rm in}=0.8$，$f_{\rm out}=0.2$，$\theta=0.3$，并取 $N=4$ 个分层采样点 $x_k = 0.125, 0.375, 0.625, 0.875$。

- 精确值：$I = 0.2 + 0.6\cdot 0.3 = 0.38$，$dI/d\theta = 0.6$。
- 采样值：只有 $x_1 = 0.125$ 落在边缘左侧，所以 $\hat I = (0.8 + 3\cdot 0.2)/4 = 0.35$，自动微分给出 $0$。
- 对采样后的像素做步长为 $h$ 的有限差分（finite difference, FD）：当 $h=0.01$ 时没有采样点越过边缘，FD 为 $0$；当 $h=0.1$ 时边缘越过了 $x_2=0.375$，$\hat I$ 跳到 $0.5$，FD 为 $(0.5-0.35)/0.1 = 1.5$，是真实值的 2.5 倍。

```python
import torch

f_in, f_out = 0.8, 0.2
xs = (torch.arange(4) + 0.5) / 4                      # 4 stratified sample positions in [0, 1]

def pixel_sampled(theta):                             # what a renderer computes
    H = (torch.sign(theta - xs) + 1) / 2              # Heaviside H(theta - x); d sign/dx = 0 in PyTorch
    return (f_in * H + f_out * (1 - H)).mean()

def pixel_exact(theta):                               # the area integral, valid for 0 <= theta <= 1
    return f_in * theta + f_out * (1 - theta)

theta = torch.tensor(0.3, requires_grad=True)
for name, f in (("exact", pixel_exact), ("sampled", pixel_sampled)):
    I = f(theta)
    (g,) = torch.autograd.grad(I, theta)
    print(f"{name:8s} I = {I.item():.3f}  autodiff dI/dtheta = {g.item():.3f}")
for h in (0.01, 0.1):
    with torch.no_grad():
        fd = (pixel_sampled(theta + h) - pixel_sampled(theta)) / h
    print(f"FD of sampled pixel, h = {h}: {fd.item():.3f}")
```

```text
exact    I = 0.380  autodiff dI/dtheta = 0.600
sampled  I = 0.350  autodiff dI/dtheta = 0.000
FD of sampled pixel, h = 0.01: 0.000
FD of sampled pixel, h = 0.1: 1.500
```

下图在 $\theta$ 的整个取值范围上展示了同样的这些函数。左侧是精确的斜坡、单采样的阶跃（经典光栅化器对像素中心采样）和四采样的阶梯线。右侧是它们的导数：精确的方框、单采样像素的狄拉克 δ、自动微分返回的零线，以及尖刺状的 FD。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-edge-coverage.svg" caption="一维像素 $[0,1]$（阴影部分）与位于 $\theta$ 的边缘（这里取 $f_{\rm in}=1$，$f_{\rm out}=0$）。左：面积积分是一条斜坡，而点采样给出阶跃。右：精确导数是像素范围内高度为 1 的方框；单采样像素在其采样点处有一个狄拉克 δ（箭头）；任何采样版本的自动微分都给出点线表示的零线；4 采样阶梯线的有限差分（图中 $h=0.1$）在边缘越过采样点的位置给出宽为 $h$、高为 $0.25/h=2.5$ 的方框。" %}

### 一般规则：内部项加边界项

在二维中，同样的计算就是**雷诺输运定理**（Reynolds transport theorem，即针对运动区域的莱布尼茨法则）。设像素 $P$ 的面积为 $\lvert P\rvert$，值为 $I = \frac{1}{\lvert P\rvert}\int_P f(\mathbf{x},\theta)\,d\mathbf{x}$，并设 $f$ 在曲线 $\Gamma(\theta)$（一条轮廓边缘）两侧发生跳变。在 $\Gamma$ 上的一点处，令 $\mathbf{n}$ 为单位法向量，$f^{-}$ 为 $\mathbf{n}$ 所背离的那一侧（物体内部）的值，$f^{+}$ 为另一侧的值，$\mathbf{v} = \partial\mathbf{x}_\Gamma/\partial\theta$ 为 $\theta$ 变化时边界点的速度。则

$$
\frac{dI}{d\theta} = \underbrace{\frac{1}{\lvert P\rvert}\int_P \frac{\partial f}{\partial\theta}\,d\mathbf{x}}_{\text{interior term}} \; + \; \underbrace{\frac{1}{\lvert P\rvert}\int_{\Gamma\cap P} \big(f^{-}-f^{+}\big)\,(\mathbf{v}\cdot\mathbf{n})\,d\ell}_{\text{boundary term}}.
$$

内部项（interior term）就是对着色器做自动微分所得到的（着色、纹理、光源）。边界项（boundary term）则是自动微分所遗漏的部分：值的跳变量，乘以边缘沿其法向移动的速度，再沿边缘位于像素内的部分积分。推导思路：在一个微小步长 $\delta\theta$ 内，边缘扫过一条宽度为 $(\mathbf{v}\cdot\mathbf{n})\,\delta\theta$ 的细条；在这条细条内，值从 $f^{+}$ 变为 $f^{-}$，所以积分在每单位边缘长度上改变 $(f^{-}-f^{+})(\mathbf{v}\cdot\mathbf{n})\,\delta\theta$。下一幅图的左半部分展示了这条细条；右半部分则对一条穿过单位像素的直线边缘 $\mathbf{n}\cdot\mathbf{x}=\theta$（$\mathbf{v}\cdot\mathbf{n}=1$，$f^{-}-f^{+}=1$）用数值方法验证了这个公式。被覆盖面积的导数等于边缘落在像素内的长度 $\ell(\theta)$。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-reynolds.svg" caption="左：当边缘 $\mathbf{n}\cdot\mathbf{x}=\theta$ 移动 $\delta\theta$ 时，被覆盖区域（紫色）增加一条面积约为 $\ell\,\delta\theta$ 的细条（橙色）。右：单位像素的被覆盖面积 $A(\theta)$（通过多边形裁剪计算）、它的有限差分导数（橙色粗线）以及被裁剪的边缘长度 $\ell(\theta)$（虚线）：后两者重合，这就是雷诺输运定理的边界项。" %}

下面的小组件可以让你逐像素地验证这一点。在一个 $8\times 8$ 的网格上拖动边缘：中间的面板显示你所选渲染器（每像素 1 到 64 个采样，或精确面积）的有限差分梯度，右边的面板显示边界项，它就是每个像素内的边缘长度。

{% include widget.liquid name="graphics-edge-gradient" height="440" caption="拖动紫色圆点来移动边缘，拖动圆环来旋转边缘；滑块用于选择渲染器（每像素采样数，或精确面积）以及有限差分的步长 $h$。每像素 1 个采样且 $h$ 很小时，几乎所有像素的 FD 梯度都是 0，少数非零的数值则非常大。使用精确面积覆盖率时，随着 $h \to 0$，FD 图会收敛到边界项，并且两者的总和 $\Sigma$ 一致。" %}

### 有限差分与边缘采样

有限差分对每个参数都需要多渲染一次，因此无法扩展到数百万个参数，而且它很有噪声，一维例子已经说明了这一点。边界项启发了一种更好的估计量，即**边缘采样**（edge sampling）：以密度 $p(\mathbf{x}_k)$ 在轮廓上随机选取点 $\mathbf{x}_k$（沿边缘均匀分布：$p = 1/\text{length}$），查看两侧的值，并对 $(f^{-}-f^{+})(\mathbf{v}\cdot\mathbf{n})/p$ 取平均。对于整幅图像上的损失，每个边缘样本都对它所落入的像素有贡献，权重为该像素的 $\partial\mathcal{L}/\partial I$。

我们来测量一下两种方法。一幅 $32\times 32$ 的图像中，在目标圆盘之上有一个半径为 $r$ 的硬边圆盘，每像素用 16 个抖动采样渲染，我们用每种方法各估计 300 次 $\partial\mathcal{L}/\partial r$。参考值是用 400,000 个求积点计算的边界积分。结果如下图所示：看橙色和紫色两组点相对红色虚线的离散程度。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-fd-vs-edge.svg" caption="圆盘实验中 $\partial\mathcal{L}/\partial r$ 的估计值（对称对数坐标轴；红色虚线为参考值；黑色短条为均值）。有限差分（橙色）两次渲染使用相同的随机采样：$h$ 大时平滑但有偏，$h$ 小时无偏但噪声很大，因为两次渲染之间只有少数采样点发生变化（$h=0.01$ 时有些估计值甚至符号相反）。边缘采样（紫色）在圆周上取 $M$ 个点，其分布以参考值为中心，离散程度大致按 $1/\sqrt{M}$ 缩小。右：相对 RMSE（有限差分在 $h=1, 0.1, 0.01$ 时为 0.80、0.26、0.96；边缘采样在 $M=16, 64, 256$ 时为 0.67、0.32、0.18）。注意代价：有限差分每个参数需要渲染两次，而边缘采样一次就得到所有参数的梯度。" %}

## 3. 可微光栅化

光栅化器用像素中心处的 z-buffer 来解决可见性，也就是上面的单采样情形。下面按大致的历史顺序介绍五个系统，它们展示了获得有用梯度的几种主要途径。

**OpenDR**（Loper 和 Black，ECCV 2014）是第一个通用的“近似可微渲染器”（approximate differentiable renderer）。它在前向传播中保留普通的光栅化器，用图像空间的滤波器（渲染图像的有限差分）来近似像素值对其图像位置的导数，再与投影顶点位置的导数相乘。它开销低，用于把 SMPL 等人体模型拟合到图像上效果很好。

**Neural 3D Mesh Renderer**（NMR；Kato、Ushiku 和 Harada，CVPR 2018）同样保留硬的前向传播，但*定义*了一个反向传播。如果把顶点移动 $\Delta x$ 会使某个像素的颜色变化 $\Delta I$，它就赋予该像素梯度 $\Delta I/\Delta x$，这是一种线性插值，因此即使边缘尚未到达的像素也能接收到信号。它是人工设计的梯度，不是任何函数的导数，但它让使用网格监督的单图像三维重建变得可行。

**Soft Rasterizer**（SoftRas；Liu、Li、Chen 和 Li，ICCV 2019）改变了前向传播本身，使其变得光滑。每个三角形 $j$ 以如下概率影响每个像素 $i$：

$$
D_j^i = \operatorname{sigmoid}\!\Big(\delta_j^i\,\frac{d^2(i,j)}{\sigma}\Big),
$$

其中 $d(i,j)$ 是像素中心到三角形边界的距离，$\delta_j^i$ 在内部为 $+1$、外部为 $-1$，$\sigma$（单位为归一化设备坐标的平方）控制模糊程度。轮廓为 $1-\prod\_j(1-D\_j^i)$，颜色按权重 $w\_j^i \propto D\_j^i \exp(z\_j^i/\gamma)$（归一化的逆深度 $z$，温度 $\gamma$）再加上一个背景项来混合，也就是在深度上做 softmax，取代了硬的深度测试。当 $\sigma,\gamma \to 0$ 时它退化为普通光栅化器，而当 $\sigma>0$ 时，边缘附近的每个像素都有非零梯度。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-softras-sigma.svg" caption="$64\times64$ 图像（归一化坐标 $[-1,1]$）中单个三角形的 SoftRas 概率图 $D(x)$，取四个 $\sigma$ 值。上：随着 $\sigma$ 增大，硬轮廓（青色轮廓线）融化成一个光滑的凸起，其梯度可以到达远离边缘的像素。下：沿点线的剖面。当 $\sigma=10^{-5}$ 时，过渡区比一个像素（$2/64$）还窄，因此梯度几乎处处再次消失。" %}

这幅图展示了你需要权衡的取舍：$\sigma$ 大时梯度作用范围长，但图像模糊，无法匹配锐利的目标；$\sigma$ 小时结果准确，但梯度只存在于离边缘大约一个像素的范围内。通常的补救办法（我们在第 7 节中也采用）是在优化过程中把 $\sigma$ 从大到小**退火**（anneal）。

**nvdiffrast**（Laine、Hellsten、Karras、Seol、Lehtinen 和 Aila；ACM TOG 39(6)，SIGGRAPH Asia 2020）走了另一条路，保持前向传播是锐利的。它把渲染拆成四个模块化的 GPU 原语：*rasterize*（每像素的三角形 ID 和重心坐标）、*interpolate*（顶点属性）、*texture*（带 mipmap 的过滤纹理查询）和 *antialias*（抗锯齿）。前三者对三角形内部的所有量都是普通意义上的可微，这覆盖了内部项。边界项来自 *antialias*：每当两个相邻像素在某条轮廓边缘两侧看到不同的三角形时，它会找出该边缘与两个像素中心连线段的交点位置，并按比例混合两种颜色。这个混合权重连续地依赖于顶点位置，所以它的导数就是边界项的一个廉价近似。由于 nvdiffrast 通过 OpenGL 使用 GPU 的硬件光栅化器（也可以使用它自带的高速 CUDA 光栅化器），它能在高分辨率下渲染数百万个三角形，并成为基于网格的逆向渲染的主力工具（例如第 5 节的 nvdiffrec）。

**PyTorch3D**（Ravi 等，2020）是 Meta 的可微三维算子库。它的网格光栅化器在 `blur_radius` 范围内为每个像素保留最近的 $K$ 个面，它的着色器（`SoftSilhouetteShader`、`SoftPhongShader`）以 SoftRas 的方式混合这些面；它还提供可微的点云渲染器。这是在 Python 中尝试可微光栅化最容易的地方。

## 4. 基于物理的可微渲染

路径追踪器把每个像素计算为对光路 $\bar{x}$（相机、反弹、反弹、光源）的积分：

$$
I = \int_{\Omega} f(\bar{x};\theta)\,d\mu(\bar{x}),
$$

即[第 5 篇]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})中的路径积分，其中 $\Omega$ 是所有光路的集合，$\mu$ 是其上的测度（measure）。可见性出现在*每一次*反弹中，包括阴影、反射和间接光，而不仅仅是在主视线的轮廓处，所以边界项现在存在于多种不连续之上。基于物理的可微渲染（physically based differentiable rendering, PBDR）在这种设定下估计雷诺公式的两项。有四个思想定义了这个领域。

**边缘采样**（Li、Aittala、Durand 和 Lehtinen，SIGGRAPH Asia 2018）像第 2 节那样直接估计边界项。对于主可见性，它在屏幕空间中对轮廓边缘上的点采样；对于次级可见性（阴影、间接光），它对从着色点看到的轮廓边缘采样，并利用三角形边上的层次结构来找出相关的边。它是无偏的，但寻找轮廓开销很大，而且无法推广到隐式曲面。

**重参数化**（reparameterization；Loubet、Holzschuch 和 Jakob，SIGGRAPH Asia 2019）避免了显式的边。如果我们变换积分变量 $\mathbf{x} = T(\mathbf{u},\theta)$，使得不连续*随着* $\theta$ 一起移动，那么在 $\mathbf{u}$ 空间中不连续是固定的，被积函数的导数又变回普通的导数。Loubet 等人估计附近的不连续如何移动（借助少量辅助光线），并用方向的一个小旋转来近似 $T$，得到方差低但略有偏差的梯度。

**扭曲面积采样**（warped-area sampling；Bangaru、Li 和 Durand，SIGGRAPH Asia 2020）让同样的想法变得无偏。它利用散度定理（divergence theorem），把边界积分改写为一个光滑扭曲场（warp field）散度的*面积*积分，该扭曲场在不连续处与边界速度一致。面积积分正是蒙特卡洛所擅长的，因此无需去寻找任何边。

**路径空间可微渲染**（path-space differentiable rendering, PSDR；Zhang、Miller、Yan、Gkioulekas 和 Zhao，SIGGRAPH 2020）直接对路径积分本身求导，建立在辐射传输的微分理论（Zhang 等，SIGGRAPH Asia 2019）之上。边界项变成对*边界路径*的积分，即有一个顶点落在轮廓边缘上的光路，它们可以用双向和多方向的策略来采样。这使得复杂光传输（焦散、相互反射）的梯度变得可行。

### 内存：辐射反向传播与路径重放

反向模式自动微分会把前向传播的每一次运算记录在“磁带”（tape）上，对于有数百万条路径、每条数次反弹的路径追踪器来说，这意味着数 GB 的内存。**辐射反向传播**（radiative backpropagation；Nimier-David、Speierer、Ruiz 和 Jakob，SIGGRAPH 2020）观察到梯度本身就是一个光传输问题。像素梯度 $\partial\mathcal{L}/\partial I$ 作为“伴随辐射”（adjoint radiance）从相机发出，第二次传输遍历会在伴随辐射遇到可微参数的位置沉积梯度。不需要磁带。它的弱点是，有些项需要每个顶点处的入射辐射，它要重新估计这些量，因此长路径的开销是二次方的。

**路径重放反向传播**（path replay backpropagation, PRB；Vicini、Speierer 和 Jakob，SIGGRAPH 2021）通过在伴随遍历中重放*同一条*路径（相同的随机数）来解决这个问题，这样每个顶点处所需的辐射可以增量地得到：时间线性，内存恒定。PRB 处理内部项；Mitsuba 把它与用于可见性的重参数化结合起来（`prb_reparam` 积分器）。

### Mitsuba 3 与 Dr.Jit

**Mitsuba 3**（由 EPFL 的 Realistic Graphics Lab 于 2022 年发布；最新版本为 2026 年 8 月的 v3.9.1）是一个构建在 **Dr.Jit**（Jakob、Speierer、Roussel 和 Vicini，SIGGRAPH 2022）之上的研究型渲染器。Dr.Jit 是一个即时编译器（just-in-time compiler），它把渲染器的 Python/C++ 代码追踪成大型融合内核，运行于 CPU（LLVM）或 GPU（CUDA/OptiX），并为这些内核实现前向与反向模式的微分。一个完整的逆向渲染循环只需寥寥几行；下面这段代码沿用官方教程的结构，恢复康奈尔盒（Cornell box）中一面墙的颜色：

```python
import drjit as dr
import mitsuba as mi

mi.set_variant("llvm_ad_rgb")                       # or "cuda_ad_rgb" on an NVIDIA GPU
scene = mi.load_dict(mi.cornell_box())
img_ref = mi.render(scene, spp=256)                 # the "photograph"

params = mi.traverse(scene)
key = "red.reflectance.value"
params[key] = mi.Color3f(0.1, 0.2, 0.9)             # wrong initial guess
params.update()

opt = mi.ad.Adam(lr=0.05)
opt[key] = params[key]
params.update(opt)
for it in range(50):
    img = mi.render(scene, params, spp=4, seed=it)  # differentiable render
    loss = dr.mean(dr.square(img - img_ref))
    dr.backward(loss)                               # radiative backprop / PRB under the hood
    opt.step()
    opt[key] = dr.clip(opt[key], 0.0, 1.0)
    params.update(opt)
print(params[key])     # about [0.60, 0.041, 0.017]; true wall: [0.570, 0.043, 0.044]
```

它的前身 Mitsuba 2（Nimier-David、Vicini、Zeltner 和 Jakob，SIGGRAPH Asia 2019）引入了可重定向（retargetable）的设计；Mitsuba 3 增加了快得多的 Dr.Jit 后端，以及用于 PRB、重参数化可见性和可微符号距离函数的积分器（Vicini、Speierer 和 Jakob，SIGGRAPH 2022）。

## 5. 逆向渲染的实践

**SVBRDF 采集。** 从一块平面材质的几张照片中恢复空间变化的 BRDF（每纹素的反照率、粗糙度、法线、镜面反射），是经典的逆向渲染任务。Deschaintre 等人（SIGGRAPH 2018）训练了一个网络，从单张闪光灯照片预测这些贴图，并使用*渲染感知*（rendering-aware）的损失，即比较预测贴图与真实贴图在多种光照下的渲染结果。随后基于优化的方法再用可微着色器对这类预测结果进行精修。

**光照与材质联合恢复。** 逆向路径追踪（inverse path tracing；Azinović 等，CVPR 2019）用可微路径追踪器优化整个房间的材质与发光体。nvdiffrec（Munkberg 等，CVPR 2022）借助 nvdiffrast，从多视角照片中联合恢复三角形网格（通过可微的行进四面体层）、PBR 纹理和环境光，因此结果可以直接放进游戏引擎。

**形状优化与 “Large Steps”。** 用梯度下降直接优化原始顶点位置，往往会把网格弄得纠缠不清：轮廓梯度稀疏而嘈杂，使相邻顶点收到截然不同的更新，三角形会翻转或自相交。Nicolet、Jacobson 和 Jakob（“Large Steps in Inverse Rendering of Geometry”，SIGGRAPH Asia 2021）通过下式对顶点 $\mathbf{x}$ 重参数化：

$$
\mathbf{u} = (\mathbf{I} + \lambda \mathbf{L})\,\mathbf{x},
$$

其中 $\mathbf{L}$ 是网格拉普拉斯算子，$\lambda$ 是平滑权重，并改为优化 $\mathbf{u}$ 而非 $\mathbf{x}$。记 $\mathbf{M} = \mathbf{I}+\lambda\mathbf{L}$（对称），由链式法则得 $\nabla\_{\mathbf{u}} = \mathbf{M}^{-1}\nabla\_{\mathbf{x}}$，所以对 $\mathbf{u}$ 的一步梯度更新 $\Delta\mathbf{u} = -\eta\,\nabla_{\mathbf{u}}\mathcal{L}$（$\eta$ 为步长）会使顶点移动

$$
\Delta\mathbf{x} = \mathbf{M}^{-1}\Delta\mathbf{u} = -\eta\,(\mathbf{I}+\lambda\mathbf{L})^{-2}\,\nabla_{\mathbf{x}}\mathcal{L}.
$$

在 $\mathbf{L}$ 的特征基下（特征值 $\mu_k \ge 0$；小的 $\mu_k$ 对应光滑的低频形状），第 $k$ 个模态上的步长被缩放为 $1/(1+\lambda\mu_k)^2$：光滑的形变几乎原样通过，而高频噪声被强烈抑制。这是一种 Sobolev 风格的预条件子（preconditioner），它让你可以迈出*很大*的步子而不破坏网格。（论文还修改了 Adam，使其逐参数的缩放不会抵消这种平滑。）下面的玩具实验把这个想法应用到一条有 100 个顶点的二维闭合曲线上，让它长成五瓣花形，每一步的梯度只触及随机 30% 的顶点并带有噪声，很像真实的轮廓梯度，结果如下图所示。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-large-steps.svg" caption="玩具形状优化（100 个顶点的闭合曲线，起点：点线圆，目标：虚线花形，300 步，步长 $\eta=0.3$，使用相同的带噪声稀疏梯度）。左：朴素梯度下降使噪声沿曲线累积，顶点沿曲线漂移并挤在一起：100 条边中有 32 条的角度方向反了过来（相邻顶点的角度顺序颠倒），即多边形自身折叠。中：$\lambda=5$ 的 Large Steps 更新 $(\mathbf{I}+\lambda\mathbf{L})^{-2}g$ 保持曲线光滑。右：每次迭代的平均径向误差；在最后 50 步中，朴素更新停滞在约 0.016，Large Steps 达到约 0.008。" %}

**由粗到细与局部极小值。** 损失作为几何的函数，到处是平坦的高原和局部极小值。如果渲染出的物体与目标完全不重叠，硬渲染器的梯度为零（稍微移动一下什么也不会改变）。如果目标中有两个相似的物体，模型可能锁定到错误的那一个。下图为一个圆盘计算了这两种效应。标准的应对办法有：

- 一开始先让前向模型变光滑：使用较大的 SoftRas $\sigma$，或在损失中使用高斯模糊图像或图像金字塔，再随时间逐步锐化；
- 从良好的初始化出发（视觉外壳、粗糙的重建结果、网络预测）；
- 先优化粗糙的几何（低分辨率、少量顶点，之后再重新划分网格并细分）；
- 加正则：拉普拉斯光滑项、法线一致性、边长项，或 Large Steps 参数化；
- 使用多个视角，这能同时消除许多歧义和局部极小值。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-loss-landscape.svg" caption="左：损失随圆盘水平位置的变化（半径 6 px；目标中心位于 32 px），每条曲线都按其最大值缩放。硬损失在两个圆盘重叠的阴影带之外是平的，那是一块没有梯度的高原；用更大的 $\sigma$ 做软渲染，或对两幅图像做模糊，会让吸引域（basin of attraction）变宽。右：当目标包含左侧一个大圆盘和右侧一个小圆盘（点线）时，半径为 6.5 的圆盘在二维位置 $(c\_x,c\_y)$ 上的软损失（$\sigma=1.5$，颜色越深损失越低）。两次 Adam 运行（圆点：起点；星号：终点；白色与橙色）落入不同的吸引域，停在右侧小圆盘处的橙色那条是局部极小值。" %}

## 6. 体与点云：绕开可见性

为什么 NeRF 和 3D Gaussian Splatting 完全不用边缘采样，也能从图像中如此可靠地优化？因为它们用**半透明的体**取代了硬表面，它们的可见性是光滑的。

在 [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) 的体渲染中，像素为

$$
C = \int_{t_n}^{t_f} T(t)\,\sigma(t)\,\mathbf{c}(t)\,dt, \qquad T(t) = \exp\!\Big(-\int_{t_n}^{t}\sigma(s)\,ds\Big),
$$

其中 $\sigma$ 是密度，$\mathbf{c}$ 是颜色，$T$ 是透射率（transmittance）。如果 $\sigma$ 是网络权重或网格值的光滑函数，那么 $C$ 也是：遮挡物不会突然出现，它的光学深度（optical depth）是连续增长的。可见性变成了一个积分的指数，这很容易求导。下图左半部分比较了一个不透明的盒子和一个高斯密度团滑过一条光线时的像素值。

在 [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) 中，对于与其投影中心偏移 $\mathbf{d}$ 的像素，每个高斯贡献 $\alpha\_i = o\_i \exp\\!\big(-\tfrac12 \mathbf{d}^\top \Sigma\_i'^{-1}\mathbf{d}\big)$，其中 $o_i$ 为不透明度，$\Sigma_i'$ 为二维协方差，像素则是由前到后的合成 $C = \sum\_i \mathbf{c}\_i\,\alpha\_i \prod\_{j<i}(1-\alpha\_j)$。每个 $\alpha_i$ 都是均值、协方差和不透明度的光滑函数，所以梯度无需任何边界项就能传到所有这些参数。

**仍然不连续的地方。**

- *排序*：3DGS 按高斯*中心*的深度（逐 tile）排序，而不是按每个贡献沿每条光线的真实深度。当相机移动、两个重叠的高斯交换顺序时，合成结果会发生跳变。这就是“闪现”（popping）伪影，它同样是 $\theta$ 中梯度所忽略的一种不连续（见下图右半部分）。
- *截断*：高斯在约三个标准差处被截断，低于不透明度阈值的会被跳过，这会产生小的跳变。
- *最终的硬表面*：当优化器把密度推向非常尖锐（不透明表面）时，光滑性又消失了。

StopThePop（Radl 等，SIGGRAPH 2024）逐像素分层排序以减轻闪现；3D Gaussian ray tracing 和 EVER（第 8 节）则按正确的顺序、或精确地沿每条光线计算体积分。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-volume-vs-splat.svg" caption="左：遮挡物滑过光线时的像素值。黑线：不透明的盒子给出阶跃（导数为 δ 函数）；紫色实线：高斯密度团给出光滑曲线 $e^{-\tau(p)}$，导数定义明确（紫色虚线，已缩放）。右：纵轴是像素的红色通道。一条光线穿过两个重叠的高斯（颜色分别为红色和黑色，各自 $\alpha=0.7$），随着相机旋转它们的深度顺序发生交换。红线：按中心深度排序的合成在 $\beta=0$ 处从 0.21 跳到 0.70（闪现）；蓝线：沿光线精确地对体积分则连续变化。" %}

## 7. 动手实践：三个 PyTorch 实验

三个实验都能在 CPU 上数秒内跑完；`bin/figures/graphics/graphics_12.py` 包含同样的代码，并生成了这些图。共同的设定是一幅以像素为单位的 $64\times64$ 图像，其中像素 $(i,j)$ 的中心为 $(j+0.5,\,i+0.5)$。

```python
import torch

H = W = 64
ys, xs = torch.meshgrid(torch.arange(H) + 0.5, torch.arange(W) + 0.5, indexing="ij")

def coverage(cx, cy, r, ss=8):
    """Hard disc, area-averaged with ss x ss stratified samples per pixel (no gradients)."""
    o = (torch.arange(ss) + 0.5) / ss - 0.5
    oy, ox = torch.meshgrid(o, o, indexing="ij")
    px, py = xs[..., None, None] + ox, ys[..., None, None] + oy
    return (((px - cx) ** 2 + (py - cy) ** 2) < r ** 2).float().mean(dim=(-1, -2))
```

### 7.1 软光栅化器拟合轮廓

未知量是圆盘的 $\theta = (c\_x, c\_y, r)$；目标是一个硬边圆盘。软渲染器把阶跃 $H(r-d)$ 替换为 $\operatorname{sigmoid}((r-d)/\sigma)$，其中 $d$ 是像素中心到 $(c\_x,c\_y)$ 的距离：这是 SoftRas 的简化版：它只用一维的符号距离，而不是 SoftRas 的距离平方。我们把 $\sigma$ 从 3 个像素按几何级数退火到 0.5 个像素。

```python
def render_soft(p, sigma):
    d = torch.sqrt((xs - p[0]) ** 2 + (ys - p[1]) ** 2 + 1e-12)
    return torch.sigmoid((p[2] - d) / sigma)

T = coverage(40.0, 26.0, 12.0)                      # target image
p = torch.tensor([30.0, 36.0, 7.0], requires_grad=True)
opt = torch.optim.Adam([p], lr=0.5)
iters = 150
for it in range(iters):
    sigma = 3.0 * (0.5 / 3.0) ** (it / (iters - 1))  # anneal: blurry -> sharp
    loss = ((render_soft(p, sigma) - T) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
    with torch.no_grad():
        p[2].clamp_(min=0.5)
print(p.detach())                                   # tensor([39.9993, 26.0007, 11.9902]); target (40, 26, 12)
```

### 7.2 带边缘采样梯度的硬光栅化器

现在在前向传播中保留硬的、超采样的渲染器，并用边界项手写它的反向传播。圆盘的边界是 $\mathbf{x}(\phi) = (c\_x,c\_y) + r(\cos\phi,\sin\phi)$，外法线为 $\mathbf{n} = (\cos\phi,\sin\phi)$。对 $\mathbf{x}(\phi)$ 求导，得到法向速度 $\mathbf{v}\cdot\mathbf{n}$：对 $c_x$ 为 $\cos\phi$，对 $c_y$ 为 $\sin\phi$，对 $r$ 为 $1$。取 $f^{-}-f^{+} = 1$ 和单位像素面积，边界项为

$$
\frac{\partial\mathcal{L}}{\partial\theta} = \oint \frac{\partial\mathcal{L}}{\partial I_{j(\mathbf{x})}}\,(\mathbf{v}\cdot\mathbf{n})\,d\ell \;\approx\; \frac{2\pi r}{M}\sum_{k=1}^{M} \frac{\partial\mathcal{L}}{\partial I_{j(\mathbf{x}_k)}}\,(\mathbf{v}\cdot\mathbf{n})_k ,
$$

其中 $j(\mathbf{x})$ 是包含 $\mathbf{x}$ 的像素，$\phi_k$ 在 $[0,2\pi)$ 上均匀分布。因子 $2\pi r/M$ 是每个样本对应的弧长，即 $1/(M p)$。

```python
class HardDiscEdgeSampled(torch.autograd.Function):
    @staticmethod
    def forward(ctx, p, n_edge):
        ctx.save_for_backward(p)
        ctx.n_edge = n_edge
        return coverage(*p.tolist(), ss=4)           # hard forward pass

    @staticmethod
    def backward(ctx, grad_img):                     # grad_img = dL/dI, shape (H, W)
        (p,) = ctx.saved_tensors
        cx, cy, r = p
        phi = torch.rand(ctx.n_edge) * 2 * torch.pi
        nx, ny = torch.cos(phi), torch.sin(phi)      # outward normal at each edge sample
        i = (cy + r * ny).floor().long()
        j = (cx + r * nx).floor().long()
        ok = (i >= 0) & (i < H) & (j >= 0) & (j < W)
        g = torch.zeros(ctx.n_edge)
        g[ok] = grad_img[i[ok], j[ok]]               # times (f_in - f_out) = 1
        w = 2 * torch.pi * r / ctx.n_edge            # arc length per sample
        return torch.stack([(g * nx).sum(), (g * ny).sum(), g.sum()]) * w, None

p = torch.tensor([30.0, 36.0, 7.0], requires_grad=True)
opt = torch.optim.Adam([p], lr=0.5)
for it in range(150):
    loss = ((HardDiscEdgeSampled.apply(p, 256) - T) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
print(p.detach())                    # e.g. tensor([40.0112, 26.0081, 12.0141]); varies with the seed
```

第三种做法对硬渲染器做朴素求导，即 `(torch.sign(p[2] - d) + 1) / 2`，得到的梯度恰好为零，所以 Adam 始终不会移动（见下图右侧的灰线）。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-silhouette-fit.svg" caption="第 7 节中的两个优化，从同一个起点（黑点）出发走向目标圆盘（灰色）。左：软光栅化器，$\sigma$ 从 3 退火到 0.5 px；圆圈表示第 0、10、25、50 和 150 次迭代（颜色越深越靠后），黑线是圆心的轨迹。中：带边缘采样梯度（$M=256$）的硬光栅化器。右：两者每次迭代的*真实*图像损失（硬边圆盘，每像素 64 个采样），以及朴素的硬渲染加自动微分的运行结果，它保持不变，因为它的梯度为零。" %}

需要关注的是：软渲染的运行平滑地移动，但它是在模糊图像上度量损失的，这就是最后必须缩小 $\sigma$ 的原因。边缘采样的运行遵循锐利图像的精确梯度，但这个梯度是蒙特卡洛估计，因此路径会抖动，损失会停在一个噪声底限上，该底限随 $M$ 增大而下降。你可以在线试一试，包括几乎不与目标重叠的起点：

{% include widget.liquid name="graphics-silhouette-fit" height="440" caption="第 7.1 和 7.2 节在 $32\times32$ 图像上的在线版本。选择梯度（带 $\sigma$ 的软光栅化器、带 $M$ 个采样的硬渲染加边缘采样，或朴素的硬渲染加自动微分），在图像上拖动来放置起始圆盘，然后点击运行。曲线保留每种方法最近一次的运行结果，并始终用真实的硬损失来度量。从远离目标的位置开始：小的 $\sigma$ 会停滞，而大的 $\sigma$ 仍能找到目标；当圆盘与目标完全不重叠时，边缘采样会让圆盘缩小（它唯一能得到的边界信号是圆盘覆盖了背景）。" %}

### 7.3 拟合球体的反照率与粗糙度

着色参数没有可见性问题，所以普通的自动微分就够了。我们用正交投影渲染一个球体（相机位于 $+z$ 并朝 $-z$ 方向看，单位圆盘内的法线为 $\mathbf{n} = (x, y, \sqrt{1-x^2-y^2})$），光源是一盏辐照度为 $E$ 的方向光。BRDF 为 Lambert 加上[第 4 篇]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})中的 Cook-Torrance GGX 镜面项：

$$
f_r = \frac{\boldsymbol{\rho}}{\pi} + \frac{D(\mathbf{h})\,G(\mathbf{l},\mathbf{v})\,F(\mathbf{v},\mathbf{h})}{4\,(\mathbf{n}\cdot\mathbf{l})(\mathbf{n}\cdot\mathbf{v})}, \qquad L_o = f_r\,E\,\max(0,\mathbf{n}\cdot\mathbf{l}) + 0.05\,\boldsymbol{\rho},
$$

其中 GGX 分布为 $D$（$\alpha = $ roughness$^2$），Smith 遮蔽为 $G = G\_1(\mathbf{l})G\_1(\mathbf{v})$，Schlick 菲涅尔项取 $F_0 = 0.04$，另有一个很小的环境光项。未知量是 RGB 反照率 $\boldsymbol{\rho}$ 和粗糙度，并用 sigmoid 将其限制在取值范围内。下面的代码给出了完整的拟合过程，代码之后的图展示了它的收敛情况。

```python
import torch

def sphere_setup(res=64):
    c = (torch.arange(res) + 0.5) / res * 2 - 1
    y, x = torch.meshgrid(-c, c, indexing="ij")            # row 0 is the top (y = +1)
    mask = (x ** 2 + y ** 2) < 1
    z = torch.sqrt(torch.clamp(1 - x ** 2 - y ** 2, min=0))
    return torch.stack([x, y, z], -1) * mask[..., None], mask   # normal = 0 outside the disc

def shade(n, mask, albedo, rough, light=(-0.4, 0.5, 0.75), E=3.0):
    l = torch.tensor(light); l = l / l.norm()
    v = torch.tensor([0.0, 0.0, 1.0])
    h = (l + v) / (l + v).norm()
    nl = (n @ l).clamp(min=0)[..., None]
    nv = (n @ v).clamp(min=1e-4)[..., None]
    nh = (n @ h).clamp(min=0)[..., None]
    a2 = (rough ** 2) ** 2                                 # alpha = rough^2
    D = a2 / (torch.pi * (nh ** 2 * (a2 - 1) + 1) ** 2)
    G1 = lambda c: 2 * c / (c + torch.sqrt(a2 + (1 - a2) * c ** 2))
    F = 0.04 + 0.96 * (1 - (h @ v)) ** 5
    spec = D * G1(nl.clamp(min=1e-4)) * G1(nv) * F / (4 * nl.clamp(min=1e-4) * nv)
    return ((albedo / torch.pi + spec) * E * nl + 0.05 * albedo) * mask[..., None]

n, mask = sphere_setup()
target = shade(n, mask, torch.tensor([0.80, 0.35, 0.20]), torch.tensor(0.35))
a_raw = torch.zeros(3, requires_grad=True)                 # albedo starts at 0.5 gray
r_raw = torch.tensor(1.2, requires_grad=True)              # roughness starts near 0.8
opt = torch.optim.Adam([a_raw, r_raw], lr=0.05)
for it in range(200):
    albedo, rough = torch.sigmoid(a_raw), 0.05 + 0.95 * torch.sigmoid(r_raw)
    loss = ((shade(n, mask, albedo, rough) - target) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
print(torch.sigmoid(a_raw).detach(), (0.05 + 0.95 * torch.sigmoid(r_raw)).item())
# tensor([0.8000, 0.3500, 0.2000]) 0.35000815987586975
```

{% include blog_figure.liquid path="assets/img/blog/graphics/12-brdf-fit.svg" caption="在已知光照下拟合球体的反照率和粗糙度。上：第 0、25 和 200 次迭代的渲染结果以及目标（显示 gamma 2.2）。下：三个反照率通道和粗糙度随 Adam 迭代的变化（实线）及其真实值（虚线），以及损失（注意图例中的 $\rho$ 表示紫色的粗糙度，而不是正文中的反照率）。反照率由大片漫反射区域确定；粗糙度仅由高光的形状和大小决定。" %}

请注意是什么让这件事变得容易：一盏已知的光、已知的形状，以及形式正确的材质模型。如果把光强也设为自由参数，你就会遇到第 1 节的第一个歧义（不妨试试：光强与反照率的乘积可以恢复出来，但两个因子无法分开）。

## 8. 研究方向，2024 至 2026

截至 2026 年 11 月，有三个方向特别活跃。下面的状态均已对照 arXiv 或出版方核实。

**高斯基元的可微渲染与光线追踪。** 高斯泼溅的光栅化器只能近似排序，也无法跟踪次级光线。*3D Gaussian Ray Tracing*（Moenne-Loccoz 等，SIGGRAPH Asia 2024）通过包围网格代理，用硬件光线追踪来追踪粒子，沿每条光线按正确顺序处理，并保持全程可微；*3DGUT*（Wu 等，CVPR 2025）则用无迹变换（unscented transform）让高斯穿过畸变相机投影，并在光栅化框架内支持次级光线。*EVER*（Mai 等，arXiv 预印本 2410.01804，2024）用*精确*的体积分渲染恒定密度的椭球，从构造上消除了闪现。在逆向渲染方面，*IRGS*（Gu 等，CVPR 2025）使用可微的二维高斯光线追踪，在恢复材质和光照时考虑相互反射，它的后续工作 *IRGS++*（arXiv 预印本 2607.22780，2026 年 7 月）通过重要性采样和去噪将其扩展到金属材质。*UTrice*（Liu 等，arXiv 预印本 2512.04421，2025 年 12 月）在单一的可微光线追踪器和光栅化器中直接使用三角形作为基元。

**物理与渲染的联合。** 如果可微模拟器（[第 7 篇]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})）产生了可微渲染器所成像的几何，梯度就能从视频像素一路流回物理参数：这就是从视频做*系统辨识*（system identification）。*PAC-NeRF*（Li 等，ICLR 2023）把辐射场与可微的物质点法（material point method, MPM）耦合，从多视角视频估计材料参数；*PhysGaussian*（Xie 等，CVPR 2024）用同一批高斯同时做 MPM 模拟和渲染。*PhysTwin*（Jiang 等，arXiv 预印本 2503.17973，2025）把用高斯渲染的质点-弹簧模型拟合到可变形物体的稀疏视频；*MOSIV*（Liu 等，ICLR 2026）通过可微模拟器辨识多物体场景中每个物体的材料参数。

**带生成式先验的逆向渲染。** 单张图像的歧义几乎无法消除（第 1 节），因此近期的工作用在合成渲染上训练的扩散模型取代了手工设计的正则项。*RGB↔X*（Zeng 等，SIGGRAPH 2024）借助感知材质和光照的扩散模型，把图像分解为反照率、法线、粗糙度、金属度和光照，并能由这些通道合成回图像。*DiffusionRenderer*（Liang 等，CVPR 2025）用视频扩散模型同时做逆向渲染和正向渲染，实现对真实视频的重新打光和材质编辑。*UniRelight*（He 等，arXiv 预印本 2506.15673，2025）联合学习反照率估计与重新打光，*Relit-LiVE*（Xiao 等，arXiv 2605.06658；据其 arXiv 备注已被 SIGGRAPH 2026 接收）则同时预测重新打光的帧和逐帧的环境贴图。这些工作提出的开放问题是：如何把“知道材质长什么样”的生成式先验，与能够保证跨视角一致性的基于物理的可微渲染器结合起来。

## 9. 小结

- 逆向渲染在场景参数上最小化图像损失；难点在于 $\partial I/\partial\theta$。
- 着色参数的导数是光滑的；几何与可见性使被积函数不连续，因此图像的导数含有一个**边界项**（雷诺输运），对采样渲染器做自动微分会完全漏掉它。
- 光栅化器要么平滑前向传播（SoftRas、PyTorch3D），要么设计反向传播（OpenDR、NMR），要么通过抗锯齿近似边界项（nvdiffrast）。
- 基于物理的可微渲染器通过边缘采样、重参数化、扭曲面积采样或路径空间采样来估计边界项，并借助辐射反向传播和路径重放避免巨大的磁带；Mitsuba 3 与 Dr.Jit 把这一切打包在一起。
- 在实践中，成败取决于初始化、由粗到细的调度和正则（Large Steps）。
- 体与高斯让可见性变得光滑，这是 NeRF 和 3DGS 优化得如此之好的重要原因；剩下的只有排序和截断。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 为什么重要 |
| --- | --- | --- | --- | --- |
| Loper & Black, *OpenDR: An Approximate Differentiable Renderer* | ECCV | 2014 | [DOI](https://doi.org/10.1007/978-3-319-10584-0_11) | 第一个通用的可微渲染器，使用图像空间导数近似 |
| Kato, Ushiku & Harada, *Neural 3D Mesh Renderer* | CVPR | 2018 | [arXiv](https://arxiv.org/abs/1711.07566) | 为网格重建手工设计的光栅化梯度 |
| Li, Aittala, Durand & Lehtinen, *Differentiable Monte Carlo Ray Tracing through Edge Sampling* | SIGGRAPH Asia (TOG) | 2018 | [DOI](https://doi.org/10.1145/3272127.3275109) | 首个针对主可见性与次级可见性的无偏梯度 |
| Liu, Li, Chen & Li, *Soft Rasterizer* | ICCV | 2019 | [arXiv](https://arxiv.org/abs/1904.01786) | 概率式、完全光滑的光栅化 |
| Loubet, Holzschuch & Jakob, *Reparameterizing Discontinuous Integrands for Differentiable Rendering* | SIGGRAPH Asia (TOG) | 2019 | [DOI](https://doi.org/10.1145/3355089.3356510) | 让不连续随参数一起移动，而不是对边采样 |
| Nimier-David et al., *Mitsuba 2: A Retargetable Forward and Inverse Renderer* | SIGGRAPH Asia (TOG) | 2019 | [DOI](https://doi.org/10.1145/3355089.3356498) | 带自动微分的可重定向研究型渲染器 |
| Zhang et al., *Path-Space Differentiable Rendering* | SIGGRAPH (TOG) | 2020 | [DOI](https://doi.org/10.1145/3386569.3392383) | 把边界项表示为对边界路径的积分 |
| Nimier-David et al., *Radiative Backpropagation* | SIGGRAPH (TOG) | 2020 | [DOI](https://doi.org/10.1145/3386569.3392406) | 把梯度视为伴随光传输，无需磁带 |
| Bangaru, Li & Durand, *Unbiased Warped-Area Sampling for Differentiable Rendering* | SIGGRAPH Asia (TOG) | 2020 | [DOI](https://doi.org/10.1145/3414685.3417833) | 借助散度定理得到无偏的边界项 |
| Laine et al., *Modular Primitives for High-Performance Differentiable Rendering* (nvdiffrast) | SIGGRAPH Asia (TOG) | 2020 | [arXiv](https://arxiv.org/abs/2011.03277) | 带基于抗锯齿的边缘梯度的快速 GPU 光栅化 |
| Ravi et al., *Accelerating 3D Deep Learning with PyTorch3D* | arXiv | 2020 | [arXiv](https://arxiv.org/abs/2007.08501) | PyTorch 中的可微网格与点渲染器 |
| Vicini, Speierer & Jakob, *Path Replay Backpropagation* | SIGGRAPH (TOG) | 2021 | [DOI](https://doi.org/10.1145/3450626.3459804) | 线性时间、恒定内存的可微路径追踪 |
| Nicolet, Jacobson & Jakob, *Large Steps in Inverse Rendering of Geometry* | SIGGRAPH Asia (TOG) | 2021 | [DOI](https://doi.org/10.1145/3478513.3480501) | 用于稳健形状优化的拉普拉斯重参数化 |
| Jakob, Speierer, Roussel & Vicini, *Dr.Jit: A Just-In-Time Compiler for Differentiable Rendering* | SIGGRAPH (TOG) | 2022 | [DOI](https://doi.org/10.1145/3528223.3530099) | Mitsuba 3 底层的 JIT/自动微分引擎 |
| Munkberg et al., *Extracting Triangular 3D Models, Materials, and Lighting From Images* (nvdiffrec) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2111.12503) | 借助 nvdiffrast 联合恢复网格、材质和光照 |
| Moenne-Loccoz et al., *3D Gaussian Ray Tracing* | SIGGRAPH Asia (TOG) | 2024 | [arXiv](https://arxiv.org/abs/2407.07090) | 高斯粒子的可微光线追踪 |
| Liang et al., *DiffusionRenderer* | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.18590) | 用视频扩散先验做逆向与正向渲染 |

## 学习资源

- Shuang Zhao、Wenzel Jakob 和 Tzu-Mao Li，[*Physics-Based Differentiable Rendering: A Comprehensive Introduction*](https://courses.shuangz.com/pbdr-course-sg20/)（SIGGRAPH 2020 课程）：对第 2 节和第 4 节的理论有深入讲解，附幻灯片和视频。
- Kato 等，[*Differentiable Rendering: A Survey*](https://arxiv.org/abs/2006.12057)（2020）：网格、体素、点和隐式可微渲染器的综述。
- [Mitsuba 3](https://github.com/mitsuba-renderer/mitsuba3) 及其文档中的逆向渲染教程（先从基于梯度的优化教程开始，再看形状和焦散优化）。
- 可微光栅化可参考 [nvdiffrast](https://github.com/NVlabs/nvdiffrast) 和 [PyTorch3D](https://github.com/facebookresearch/pytorch3d)；原始的软光栅化器代码见 [SoftRas](https://github.com/ShichenLiu/SoftRas)。
- Tzu-Mao Li 的博士论文 *Differentiable Visual Computing*（MIT，2019）是对边缘采样和可微图像处理的一篇易读的长篇导论。
- 神经渲染系列从第 6 节停下的地方继续：[NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})和 [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})。

## 练习

1. **手算边界项。** 一个单位像素被边缘 $x\cos\varphi + y\sin\varphi = \theta$ 穿过，其中 $\varphi = 45^\circ$，$\theta = 0.5$；内部（$\mathbf{n}\cdot\mathbf{x}<\theta$）的值为 1，外部为 0。计算被覆盖的面积 $A$ 和 $dA/d\theta$，并用上面的边缘梯度小组件验证。

   <details markdown="1"><summary>提示</summary>
   这条直线经过 $(0.707, 0)$ 和 $(0, 0.707)$，所以被覆盖的区域是一个直角边为 $0.707$ 的直角三角形：$A = 0.25$。边缘落在像素内的长度为 $\ell = 0.707\sqrt2 = 1$，所以 $dA/d\theta = \ell = 1$（验证：对这个角度，$A(\theta) = \theta^2$，而 $2\theta = 1$）。
   </details>

2. **有限差分的偏差。** 在带有 $N$ 个分层采样的一维例子中，证明前向差分在边缘位置 $\theta$ 均匀随机的平均下（忽略像素两端）等于真实导数，然而对固定的 $\theta$，它只取 $0$ 和 $(f\_{\rm in}-f\_{\rm out})/(Nh)$ 的整数倍这些值。这对在 SGD 中使用 FD 梯度意味着什么？

   <details markdown="1"><summary>提示</summary>
   当且仅当某个采样点落在 $(\theta, \theta+h]$ 内时，它贡献一个大小为 $(f\_{\rm in}-f\_{\rm out})/N$ 的跳变，此时差分商为 $(f\_{\rm in}-f\_{\rm out})/(Nh)$。$N$ 个分层采样点的间距为 $1/N$，所以对均匀随机的 $\theta$（$h \le 1/N$），这个概率为 $Nh$（而不是 $h$）。于是均值为 $f\_{\rm in}-f\_{\rm out}$，即该估计量在对 $\theta$ 取平均时是无偏的；但它的二阶矩为 $(f\_{\rm in}-f\_{\rm out})^2/(Nh)$，方差按 $1/(Nh)$ 增长。
   </details>

3. **三角形的边缘采样。** 把 `HardDiscEdgeSampled` 扩展到顶点为 $\mathbf{p}\_0,\mathbf{p}\_1,\mathbf{p}\_2$ 的三角形。对于边 $ab$ 上的点 $\mathbf{x} = (1-t)\mathbf{p}\_a + t\,\mathbf{p}\_b$，关于 $\mathbf{p}_a$ 的每个坐标，$\mathbf{v}\cdot\mathbf{n}$ 是多少？

   <details markdown="1"><summary>提示</summary>
   $\partial\mathbf{x}/\partial\mathbf{p}_a = (1-t)\mathbf{I}$，所以 $\mathbf{p}_a$ 的 $x$ 坐标的法向速度是 $(1-t)\,n_x$，$y$ 坐标则是 $(1-t)\,n_y$。均匀地采样 $t$，并按边的长度成比例地选边。
   </details>

4. **歧义的实际表现。** 在球体实验（7.3）中，把光的辐照度 $E$ 作为第三个未知量。哪些量收敛，哪些量漂移？加入第二个光线方向或对 $E$ 的先验，然后重复实验。

5. **Large Steps。** 在二维曲线玩具实验中，扫描 $\lambda \in \\{0, 1, 5, 20\\}$，并绘制 300 步之后的最终误差。为什么非常大的 $\lambda$ 会减慢对五个花瓣的拟合？（使用环图拉普拉斯算子的特征值 $\mu_k = 2-2\cos(2\pi k/N)$。）

系列下一篇：[2026 年研究前沿]({{ '/blog/2026/graphics-13-research-frontiers-2026/' | relative_url }})，纵览 SIGGRAPH、SIGGRAPH Asia 及其他图形学会议今年发表的成果。
