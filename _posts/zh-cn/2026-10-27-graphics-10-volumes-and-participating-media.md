---
layout: post
title: "体积与参与介质：雾、烟、云、天空与皮肤"
date: 2026-10-27 09:10:00+0900
description: "消光系数与反照率、Beer-Lambert 透射率、辐射传输方程、相函数及其采样代码、光线步进、delta 与 ratio tracking、体积路径追踪、OpenVDB、实时雾/天空/云、次表面散射，以及为什么 NeRF 的 alpha 合成就是同一积分的数值求积。"
categories: graphics
tags: [volume-rendering, participating-media, phase-function, delta-tracking, subsurface-scattering, sky]
series: graphics
series_order: 10
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

到目前为止，本系列中的每条光线都在真空中传播，只在表面与光发生作用。真实场景中充满了**参与介质**（participating media，参与光传输的体积）：雾、烟、火、云、给天空着色的大气、浑浊的水，以及皮肤、大理石和牛奶的内部。在这些介质中，光会在*沿光线的每一处*被吸收和散射，而不仅是在边界上。本章把 [第 04 篇]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}) 的渲染方程和 [第 05 篇]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}) 的蒙特卡洛工具推广到体积。它也是神经渲染背后的物理：[NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) 的体渲染积分和 [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) 的 alpha 混合，都是本章推导内容的特例（第 11 节）。

## 前置知识

- 辐射亮度、BRDF 与渲染方程（[第 04 篇]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})）。
- 蒙特卡洛积分、重要性采样、下一事件估计与俄罗斯轮盘（[第 05 篇]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})）。
- 基础概率：指数分布、逆 CDF 采样、泊松过程（用到时会回顾）。

## 1. 光在介质中会发生什么

想象一束细光穿过由微小粒子组成的云。在一小段距离 $dt$ 内，光束中的光子可能遭遇三件事，另有一件事会向光束中添加光子：

1. **吸收**（absorption）：粒子吞掉光子，把能量变成热。单位长度上的概率是**吸收系数**（absorption coefficient）$\sigma_a(\mathbf{x})$，单位为 1/m。
2. **外散射**（out-scattering）：粒子把光子偏转到别的方向，它离开了*这条*光束。单位长度上的概率为**散射系数**（scattering coefficient）$\sigma_s(\mathbf{x})$。
3. **内散射**（in-scattering）：来自其他光束的光子被偏转*进入*这条光束。车灯照进雾里时雾会发光，就是这个原因。
4. **自发光**（emission）：介质本身发光（火焰、热气体），其发射辐射亮度为 $L_e$。

吸收和外散射都会从光束中移除能量，因此合并为**消光系数**（extinction coefficient，又称衰减系数）

$$
\sigma_t = \sigma_a + \sigma_s .
$$

有两个派生量随处可见。**单次散射反照率**（single-scattering albedo）$\rho = \sigma_s/\sigma_t \in [0,1]$ 是一次相互作用为散射而不是吸收的概率：云的 $\rho \approx 0.99$ 甚至更高，烟灰则接近 $0$。**平均自由程**（mean free path）$1/\sigma_t$ 是相邻两次相互作用之间的平均距离。系数是“每单位长度”的量，所以数值取决于场景单位：$\sigma_t = 0.05\ \text{m}^{-1}$ 是薄雾（平均自由程 20 m），$\sigma_t = 50\ \text{m}^{-1}$ 则是浓云（2 cm）。

从物理上说，$\sigma = n\,C$：粒子数密度 $n$ 乘以粒子截面积 $C$。渲染器通常存储一个**密度**场 $d(\mathbf{x})$，再乘以材质系数：$\sigma_t(\mathbf{x}) = d(\mathbf{x})\,\sigma_t^{\text{mat}}$。系数可以随波长变化（本文用 RGB 三元组），这正是天空呈蓝色的原因（第 9 节）。

## 2. 透射率与 Beer-Lambert 定律

### 2.1 推导

沿光线 $\mathbf{x}(t) = \mathbf{o} + t\boldsymbol{\omega}$ 跟踪一束辐射亮度为 $L$ 的光，暂时忽略内散射和自发光。在一步 $dt$ 内，光束有比例 $\sigma_t\,dt$ 被移除：

$$
dL = -\sigma_t(t)\,L\,dt
\quad\Longrightarrow\quad
\frac{dL}{L} = -\sigma_t(t)\,dt
\quad\Longrightarrow\quad
\ln L(t) - \ln L(0) = -\int_0^t \sigma_t(s)\,ds .
$$

取指数得到幸存的比例，即**透射率**（transmittance）：

$$
T(t) = \frac{L(t)}{L(0)} = \exp\!\big(-\tau(t)\big),
\qquad
\tau(t) = \int_0^t \sigma_t(s)\,ds .
$$

$\tau$ 是**光学深度**（optical depth，又称光学厚度）：一个无量纲数，表示光线穿过了多少个平均自由程。在**均匀**（homogeneous）介质中（$\sigma_t$ 为常数），$\tau = \sigma_t t$，于是得到 **Beer-Lambert 定律** $T = e^{-\sigma_t t}$。

后面的一切都依赖两条性质：

- **可乘性**：$T(0 \to b) = T(0 \to a)\,T(a \to b)$，因为光学深度可以相加。这使我们可以沿光线步进、逐步更新 $T$。
- **与顺序无关**：只有 $\sigma_t$ 的积分重要，与密度位于光线上的哪个位置无关。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-beer-lambert.svg" caption="四个消光系数下的 Beer-Lambert 透射率。(a) 线性坐标：圆点标出一个平均自由程 d = 1/σt，每条曲线都在此处经过 e⁻¹ ≈ 0.37（虚线）。(b) 对数坐标：指数衰减变成斜率为 −σt 的直线，σt 加倍则斜率加倍。" %}

**数值例子。** 雾的 $\sigma_t = 0.5\ \text{m}^{-1}$：经过 $d = 2$ m 后 $T = e^{-1} = 0.368$；经过 10 m 后 $T = e^{-5} = 0.0067$，所以 10 m 外的物体会消失。再看一条由三段 1 m 组成的非均匀光线，$\sigma_t = 0.2, 1.0, 0.4$：$\tau = 0.2 + 1.0 + 0.4 = 1.6$，$T = e^{-1.6} = 0.202$。把三段打乱顺序，$T$ 不变。

### 2.2 非均匀介质

对于烟或云，$\sigma_t(\mathbf{x})$ 随位置变化，$\tau$ 只能数值计算。下图展示了一维密度（带三个峰）、它的光学深度和透射率。$T$ 的下降大多发生在峰内部。*平均*消光相同的均匀介质在 $T(10)$ 处与之相同，但中间的走势不同。所以对密度取平均会丢失光在*何处*衰减的信息。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-heterogeneous-transmittance.svg" caption="一条非均匀光线。(a) 带三个峰的消光 σt(t)；虚线为均值，点线为最大值（稍后用作上界 majorant）。(b) 透射率 T = e^−τ（紫色）在密度高处阶梯式下降；光学深度 τ(t)（灰色，右轴）是累计积分。平均值相同的均匀介质曲线（橙色虚线）只在终点与之相交。" %}

```python
import numpy as np

def sigma_t(t):
    """Heterogeneous extinction along a ray of length 10 (1/m)."""
    return (0.1 + 1.0 * np.exp(-((t - 2.0) / 0.45) ** 2)
            + 0.6 * np.exp(-((t - 5.2) / 0.8) ** 2)
            + 1.6 * np.exp(-((t - 7.4) / 0.25) ** 2))

t = np.linspace(0.0, 10.0, 10001)
s = sigma_t(t)
tau = np.concatenate([[0.0], np.cumsum(0.5 * (s[1:] + s[:-1]) * np.diff(t))])  # trapezoid rule
T = np.exp(-tau)
print(f"tau(10) = {tau[-1]:.3f}, T(10) = {T[-1]:.4f}")   # tau(10) = 3.357, T(10) = 0.0348
print(np.exp(-(0.2 + 1.0 + 0.4)))                        # 0.2019, the three-segment example
```

每个高斯峰的积分等于 振幅 × 宽度 × $\sqrt{\pi}$，所以精确的光学深度为 $1.0 + (0.45 + 0.48 + 0.40)\sqrt{\pi} = 3.357$，与数值求积一致。

## 3. 辐射传输方程

现在把四种过程放在一起。令 $L(\mathbf{x}, \boldsymbol{\omega})$ 为位于 $\mathbf{x}$、沿方向 $\boldsymbol{\omega}$ 传播的辐射亮度。$L$ 沿 $\boldsymbol{\omega}$ 每单位长度的变化由**辐射传输方程**（radiative transfer equation，RTE）给出：

$$
(\boldsymbol{\omega}\cdot\nabla) L(\mathbf{x},\boldsymbol{\omega})
= \underbrace{-\sigma_t(\mathbf{x})\,L(\mathbf{x},\boldsymbol{\omega})}_{\text{absorption + out-scattering}}
+ \underbrace{\sigma_a(\mathbf{x})\,L_e(\mathbf{x},\boldsymbol{\omega})}_{\text{emission}}
+ \underbrace{\sigma_s(\mathbf{x}) \int_{S^2} p(\boldsymbol{\omega}', \boldsymbol{\omega})\, L(\mathbf{x},\boldsymbol{\omega}')\, d\boldsymbol{\omega}'}_{\text{in-scattering}} .
$$

其中 $S^2$ 是方向球面，$\boldsymbol{\omega}'$ 是入射光的传播方向。**相函数**（phase function）$p(\boldsymbol{\omega}', \boldsymbol{\omega})$（第 4 节）是沿 $\boldsymbol{\omega}'$ 传播的光散射后沿 $\boldsymbol{\omega}$ 继续传播的概率密度（每球面度），它扮演的角色相当于表面上的 BRDF。把自发光写成 $\sigma_a L_e$ 沿用了 pbrt 的约定：吸收强的介质发射也强。我们把内散射辐射亮度简记为

$$
L_s(\mathbf{x},\boldsymbol{\omega}) = \int_{S^2} p(\boldsymbol{\omega}', \boldsymbol{\omega})\, L(\mathbf{x},\boldsymbol{\omega}')\, d\boldsymbol{\omega}' .
$$

### 3.1 积分形式：体渲染方程

RTE 是沿光线的一阶线性常微分方程 $\frac{dL}{dt} = -\sigma_t L + q$，源项 $q = \sigma_a L_e + \sigma_s L_s$。像解 $y' + a y = q$ 那样用积分因子 $e^{\tau}$ 求解，就得到**体渲染方程**（volume rendering equation）。设相机位于 $\mathbf{o}$，沿 $\boldsymbol{\omega}$ 看去，光线在距离 $d$ 处击中表面，$\mathbf{x}_t = \mathbf{o} + t\boldsymbol{\omega}$，则

$$
L(\mathbf{o}, -\boldsymbol{\omega}) =
\int_0^{d} T(t)\,\Big[\sigma_a(\mathbf{x}_t)\,L_e(\mathbf{x}_t) + \sigma_s(\mathbf{x}_t)\,L_s(\mathbf{x}_t, -\boldsymbol{\omega})\Big]\,dt
\;+\; T(d)\,L_{\text{surf}}(\mathbf{x}_d, -\boldsymbol{\omega}),
$$

其中 $T(t) = \exp(-\int_0^t \sigma_t\,ds)$ 从相机开始计算。它的含义是：*到达眼睛的光，等于光线上每一点新增的光（各自被该点到眼睛之间的透射率衰减）之和，再加上被整段透射率衰减的背景表面*。Kajiya 和 Von Herzen（1984）把它引入图形学；Max（1995）综述了科学体可视化中使用的各种光学模型。

有两个特例值得先点名：

- **只有发射-吸收**（$\sigma_s = 0$）：$L = \int T\,\sigma_a L_e\,dt + T(d)L_{\text{surf}}$。没有递归，一遍就能算完。这正是 NeRF 的模型（第 11 节）。
- **单次散射**（single scattering）：只用光源*直接*照来、经**阴影光线**（shadow ray）透射率衰减的光来近似 $L_s$。实时雾和许多天空模型算的就是这个（第 5、9 节）。

完整方程是递归的，因为 $L_s$ 中又包含 $L$。它描述的是**多次散射**（multiple scattering）：正是多次散射让云显得洁白柔和，而不是灰暗生硬（第 7 节）。

## 4. 相函数

### 4.1 直觉与归一化

光子散射后会去哪里？对于在各个取向上统计相同的介质（随机取向的粒子），答案只取决于入射传播方向 $\boldsymbol{\omega}'$ 与出射方向 $\boldsymbol{\omega}$ 之间的**散射角**（scattering angle）$\theta$：$p(\boldsymbol{\omega}', \boldsymbol{\omega}) = p(\cos\theta)$，$\cos\theta = \boldsymbol{\omega}'\cdot\boldsymbol{\omega}$。与 BRDF 不同，相函数是概率密度，积分为一：

$$
\int_{S^2} p(\boldsymbol{\omega}'\cdot\boldsymbol{\omega})\,d\boldsymbol{\omega} = 2\pi\int_{-1}^{1} p(\mu)\,d\mu = 1, \qquad \mu = \cos\theta .
$$

能量损失由反照率负责，不由相函数负责。最简单的选择是**各向同性**（isotropic）散射 $p = 1/(4\pi)$：所有方向等可能。

**平均余弦**（mean cosine）$g = \langle\cos\theta\rangle = 2\pi\int_{-1}^{1} \mu\, p(\mu)\,d\mu$ 概括了形状。$g>0$ 表示**前向散射**（大多数光子大致直行，如云和雾，$g \approx 0.8$-$0.9$），$g<0$ 表示**后向散射**，$g=0$ 则平均而言是各向同性的。

### 4.2 Henyey-Greenstein

图形学的主力是 **Henyey-Greenstein**（HG）相函数，它在 1941 年为星际尘埃而提出：

$$
p_{HG}(\mu; g) = \frac{1}{4\pi}\,\frac{1-g^2}{\left(1+g^2-2g\mu\right)^{3/2}}, \qquad -1 < g < 1 .
$$

它唯一的参数恰好就是平均余弦 $g$，因此很容易拟合测量数据。$g=0$ 时退化为各向同性，前向与后向散射之比为 $p(1)/p(-1) = \big((1+g)/(1-g)\big)^3$。

**数值例子**（$g = 0.6$）：$p(0) = \frac{1}{4\pi}\cdot\frac{0.64}{0.16^{3/2}} = 0.0796 \cdot 0.64 / 0.064 = 0.796$，$p(\pi) = 0.0796 \cdot 0.64/2.56^{3/2} = 0.0124$。两者之比为 $64 = (1.6/0.4)^3$。各向同性时为 $1/(4\pi) = 0.0796$，可作对照。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-hg-lobes.svg" caption="Henyey-Greenstein 波瓣。(a) 以对数半径绘制 4π·p(θ)，g 从 −0.3 到 0.85。光从左向右传播（黄色箭头）；各向同性的 g = 0 曲线是半径为 1 的圆。正的 g 把波瓣向前拉长，负的 g 向后。(b) 用下面的逆 CDF 为 g = 0.7 采样的 500 个方向，画在单位球面上：它们聚集在传播方向周围，平均余弦接近 0.7。" %}

**HG 的重要性采样。** 在路径追踪器里，我们需要按密度 $p$ *采样*新方向。方位角 $\phi$ 在 $[0, 2\pi)$ 内均匀分布。对 $\mu$，我们对边缘密度 $2\pi p(\mu)$ 的 CDF 求逆：

$$
P(\mu) = 2\pi\int_{-1}^{\mu} p_{HG}(\mu')\,d\mu'
= \frac{1-g^2}{2g}\left[\frac{1}{\sqrt{1+g^2-2g\mu}} - \frac{1}{1+g}\right].
$$

检查端点：$P(-1) = 0$；在 $\mu = 1$ 处方括号为 $\frac{1}{1-g} - \frac{1}{1+g} = \frac{2g}{1-g^2}$，因此 $P(1) = 1$。令 $P(\mu) = \xi$（$\xi$ 在 $[0,1)$ 内均匀）并求解：

$$
\sqrt{1+g^2-2g\mu} = \frac{1-g^2}{1-g+2g\xi}
\quad\Longrightarrow\quad
\mu = \frac{1}{2g}\left[1 + g^2 - \left(\frac{1-g^2}{1-g+2g\xi}\right)^2\right] .
$$

当 $\vert g\vert \approx 0$ 时改用 $\mu = 1-2\xi$，以免除以零。由于样本恰好按 $p$ 抽取，路径追踪的权重 $p/\text{pdf}$ 等于 1。**数值例子**：$g = 0.6$、$\xi = 0.5$ 时，$\frac{0.64}{1.0} = 0.64$，于是 $\mu = (1.36 - 0.4096)/1.2 = 0.792$。也就是说，一半散射光子的偏转角小于 $37.6^\circ$。

```python
import numpy as np

def hg(cos_t, g):
    return (1 - g * g) / (4 * np.pi * (1 + g * g - 2 * g * cos_t) ** 1.5)

def sample_hg(g, xi):
    """Inverse-CDF sample of cos(theta); theta is measured from the direction of travel."""
    if abs(g) < 1e-3:
        return 1 - 2 * xi
    s = (1 - g * g) / (1 - g + 2 * g * xi)
    return (1 + g * g - s * s) / (2 * g)

rng = np.random.default_rng(0)
g = 0.6
mu = sample_hg(g, rng.random(1_000_000))
print(mu.mean())           # ~0.600: the mean cosine of HG is exactly g
print(sample_hg(g, 0.5))   # 0.792 (median angle ~37.6 degrees)
m = (np.arange(200000) + 0.5) / 100000 - 1          # midpoints in (-1, 1)
print(2 * np.pi * np.sum(hg(m, g)) * (2 / 200000))  # ~1.0: normalized
```

符号约定是经典的 bug 来源：pbrt 在 $\boldsymbol{\omega}_o$ 和 $\boldsymbol{\omega}_i$ *都指离散射点*时测量 $\theta$，这会让 $g$ 的符号与这里使用的传播方向约定相反。选定一种约定，并用非对称的 $g$ 测试。

### 4.3 Rayleigh、Mie 与 Draine 函数

合适的相函数取决于粒子尺寸 $r$ 与波长 $\lambda$ 之比：

- **Rayleigh 散射**（$r \ll \lambda$：空气分子）的 $p_R(\mu) = \frac{3}{16\pi}(1+\mu^2)$ 前后对称，散射系数与 $\lambda^{-4}$ 成正比。蓝光（约 440 nm）的散射是红光（约 680 nm）的 $(680/440)^4 \approx 5.7$ 倍。
- **Mie 散射**（$r \sim \lambda$：霾、雾和云滴）有精确但复杂的解：极强的前向峰、宽阔的侧向区域，以及光环（glory）、雾虹（fogbow）等特征。渲染器会对它做近似。
- 一种廉价的近似是 **HG 混合**：$w\,p_{HG}(\mu; g_1) + (1-w)\,p_{HG}(\mu; g_2)$，即一个强前向波瓣加一个弱后向波瓣。混合仍然是归一化的，采样时以概率 $w$ 选择一个波瓣即可。
- **Draine** 相函数（Draine 2003）在 HG 上增加了一个参数 $\alpha$：
  $p_D(\mu; g, \alpha) = p_{HG}(\mu; g)\,\dfrac{1+\alpha\mu^2}{1+\alpha(1+2g^2)/3}$。
  $\alpha = 0$ 时即为 HG；$\alpha = 1$ 时即为 Cornette-Shanks 函数。Jendersie 和 d'Eon（2023）把一个 HG 波瓣与一个 Draine 波瓣的混合，按水滴直径拟合到 Lorenz-Mie 理论，得到了一种廉价且可采样的雾/云相函数。拟合公式见其论文和补充材料。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-phase-functions.svg" caption="(a) 同一张对数半径极坐标图上的四种相函数（光从左向右）：Rayleigh（花生形、对称）、g = 0.76 的 HG、带少量后向散射的双瓣 HG 混合，以及 α = 1 的 Draine（在 HG 上叠加 1 + μ² 的形状）。(b) 对三个 g 值，用逆 CDF 采样 200,000 个 cos θ 的直方图与精确密度 2π p(cos θ) 的对比（对数坐标）。柱与曲线吻合，样本均值与 g 一致。" %}

下面的小部件可以让你亲手感受这些形状。在图上拖动可改变光的来向，并移动 $g$ 滑块。圆点是实时样本：用上面的采样器（Rayleigh 和 Draine 用拒绝采样）抽取的三维单位向量，投影到屏幕上。

{% include widget.liquid name="graphics-phase-function" height="560" caption="相函数探索器。在极坐标图上拖动（鼠标或手指）设置光的来向，滑块设置 g。紫色波瓣是围绕传播方向的 p(θ)（虚线圆：各向同性 1/4π），橙色圆点是投影到纸面上的三维采样方向，下方的条带比较 cos θ 直方图与精确的概率密度。试试打开对数坐标、设 g = 0.9，再试 g = −0.5，再切到 Rayleigh：对 HG，测得的平均 cos θ 跟随 g；对 Rayleigh，它保持在 0 附近。" %}

## 5. 用光线步进计算单次散射

### 5.1 算法

计算体渲染方程最直接的方法是沿光线做黎曼和，称为**光线步进**（ray marching）。把 $[0, d]$ 分成 $N$ 段、每段长 $\Delta t$，每段取一个采样点 $\mathbf{x}_i$。维护累计透射率 $T$ 和累计辐射亮度 $L$：

1. 查询 $\sigma_t(\mathbf{x}_i)$ 和 $\sigma_s(\mathbf{x}_i)$。
2. **阴影光线**：从 $\mathbf{x}_i$ 向光源步进，得到光源透射率 $T_\ell(\mathbf{x}_i) = e^{-\tau_\ell}$。
3. 单次散射源项：$S_i = p(\cos\theta)\,T_\ell(\mathbf{x}_i)\,L_{\text{light}}$。其中 $\theta$ 是光的传播方向 $-\boldsymbol{\omega}_\ell$ 与指向相机的方向 $-\boldsymbol{\omega}$ 之间的夹角，因此 $\cos\theta = \boldsymbol{\omega}_\ell\cdot\boldsymbol{\omega}$。
4. 累加并衰减：

$$
L \mathrel{+}= T\,\frac{\sigma_s}{\sigma_t}\,\big(1 - e^{-\sigma_t\Delta t}\big)\,S_i,
\qquad
T \mathrel{\ast}= e^{-\sigma_t\Delta t}.
$$

因子 $\frac{\sigma_s}{\sigma_t}(1 - e^{-\sigma_t\Delta t})$ 是系数恒定的一段上的精确积分 $\int_0^{\Delta t}\sigma_s e^{-\sigma_t s}\,ds$。朴素黎曼项 $\sigma_s\Delta t$ 在 $\sigma_t\Delta t > 1$ 时会超过 1，凭空产生能量。这种“能量守恒”形式由 Hillaire（2015）在实时雾中推广开来。

**数值例子。** 一段 $\sigma_t = 2$、$\sigma_s = 1.8$、$\Delta t = 0.1$，当前 $T = 0.7$，$S_i = 0.5$：$1 - e^{-0.2} = 0.1813$，所以 $L$ 增加 $0.7 \times 0.9 \times 0.1813 \times 0.5 = 0.0571$，$T$ 变为 $0.7\,e^{-0.2} = 0.573$。朴素项会增加 $0.7 \times 1.8 \times 0.1 \times 0.5 = 0.063$，多了约 10%。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-ray-march.svg" caption="在程序化云中做光线步进。(a) 密度的一个切片（蓝色）。从 o 沿 ω 出发的相机光线被分成长度为 Δt 的段（刻度）；每段取一个抖动采样点（橙色），并向光源 ω_ℓ 发出一条阴影光线（黄色虚线）。(b) 沿光线的密度（紫色填充）和相机透射率 T(t)（黑色），光线穿过稠密物质处 T 就下降。T ≈ 0 之后的采样点没有贡献，可以跳过（提前终止）。" %}

### 5.2 代码

一个完整的单次散射渲染器，渲染一个柔和、带起伏的球，只需约 40 行：

```python
import numpy as np

def density(p):
    """Soft sphere of radius ~1 with a sine 'noise'; sigma_t up to 4 per unit length."""
    r = np.linalg.norm(p, axis=-1)
    wobble = 0.15 * np.sin(5 * p[..., 0]) * np.sin(4 * p[..., 1] + 1) * np.sin(6 * p[..., 2])
    return 4.0 * np.clip((1.0 - r + wobble) / 0.3, 0.0, 1.0)

def hg(cos_t, g):
    return (1 - g * g) / (4 * np.pi * (1 + g * g - 2 * g * cos_t) ** 1.5)

def march(n_steps=64, n_shadow=16, jitter=True, res=96, albedo=0.9, g=0.5, seed=0):
    rng = np.random.default_rng(seed)
    light = np.array([0.6, 0.7, 0.4]); light /= np.linalg.norm(light)  # direction TO the light
    u = (np.arange(res) + 0.5) / res * 3.0 - 1.5                       # orthographic camera
    X, Y = np.meshgrid(u, -u)
    o = np.stack([X, Y, np.full_like(X, 2.0)], -1)
    w = np.array([0.0, 0.0, -1.0])                                      # looking down -z
    dt = 4.0 / n_steps
    offset = rng.random(X.shape) if jitter else np.full(X.shape, 0.5)
    phase = hg(w @ light, g)   # cos(theta) between light travel (-light) and view (-w)
    T, L = np.ones(X.shape), np.zeros(X.shape)
    for i in range(n_steps):
        x = o + ((i + offset) * dt)[..., None] * w
        sig = density(x)
        tau_l, h = np.zeros(X.shape), 2.0 / n_shadow
        for j in range(n_shadow):                                       # shadow ray
            tau_l += density(x + ((j + 0.5) * h) * light) * h
        T_seg = np.exp(-sig * dt)
        L += T * albedo * (1 - T_seg) * phase * np.exp(-tau_l)         # light radiance 1
        T *= T_seg
    return L, T

L, T = march()
img = 1 - np.exp(-(20.0 * L + 0.6 * T))      # exposure; background radiance 0.6
print(img.shape, round(float(T.min()), 4))
import matplotlib.pyplot as plt
plt.imsave("sphere_volume.png", img, cmap="gray", vmin=0, vmax=1)
```

### 5.3 条带、抖动与开销

如果每段的采样位置固定（`jitter=False`），所有像素都在相同深度上采样密度，平滑的密度梯度就会变成**条带**（banding），即可见的等高线，如下图 (a)。按像素（实时渲染中还按帧）**抖动**（jittering）起始偏移，可以把这种结构化误差变成噪声。人眼对噪声更宽容，时间累积和降噪器（见 [第 06 篇]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})）也能把它平均掉。用蓝噪声偏移效果更好。开销是每像素 $N_{\text{steps}} \times N_{\text{shadow}}$ 次密度查询。实际渲染器用三种办法削减它：$T < 10^{-3}$ 时**提前终止**（early termination）、用粗糙占用网格做**空域跳过**（empty-space skipping，第 8 节）、以及自适应步长。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-cloud-render.svg" caption="用图脚本中的光线步进器渲染的程序化云（用值噪声 fBm 侵蚀一组球的并集，存于 96×56×72 的网格），太阳位于云的右上后方。(a) 16 步、位置固定，出现条带。(b) 同样 16 步、按像素抖动，条带变成噪声。(c) 96 步、只有单次散射：背向太阳的一侧几乎全黑，因为光要经过多次反弹才能到达那里。(d) 同一渲染加上第 7 节的多次散射八度（octave）近似：阴影区域被柔和的光填满，更接近真实的云。" %}

## 6. 无偏距离采样：delta、ratio 与 residual tracking

光线步进是**有偏的**（biased）：步长有限时，黎曼和不会收敛到真实积分，采样点之间的细小结构也会被漏掉。产品级路径追踪器转而使用**无偏**（unbiased）蒙特卡洛方法来估计透射率、采样碰撞距离，这些方法只需要 $\sigma_t$ 的*逐点求值*。

### 6.1 均匀介质中的自由程采样

在均匀介质中，到下一次碰撞的距离服从密度 $p(t) = \sigma_t e^{-\sigma_t t}$，即均值为 $1/\sigma_t$ 的指数分布。其 CDF 为 $1 - e^{-\sigma_t t}$，求逆得到

$$
t = -\frac{\ln(1-\xi)}{\sigma_t}.
$$

例如 $\sigma_t = 2$、$\xi = 0.5$ 时 $t = \ln 2/2 = 0.347$。这样采样，透射率项会与 pdf 抵消，路径通量（throughput）因此不变（反照率除外）。难点在非均匀介质：$\int\sigma_t$ 无法闭式求逆。

### 6.2 Delta（Woodcock）tracking

这个技巧来自中子输运（Woodcock 等，1965）：**用虚构的“空”（null）粒子填满介质**，使之变成均匀介质。选一个处处满足 $\bar\sigma \ge \sigma_t(\mathbf{x})$ 的**上界**（majorant），定义空系数 $\sigma_n = \bar\sigma - \sigma_t \ge 0$。合并后的介质消光恒为 $\bar\sigma$，于是可以用上面的公式采样试探碰撞（tentative collision）。在每次试探碰撞处：

- 以概率 $\sigma_t(\mathbf{x})/\bar\sigma$ 判为**真实**碰撞：停止（吸收或散射）；
- 否则为**空**碰撞：光子沿原方向继续前进，状态不变。

**为什么无偏。** $[0, d]$ 上的试探碰撞构成速率为 $\bar\sigma$ 的泊松过程：点数 $n$ 服从均值为 $\bar\sigma d$ 的泊松分布，各点均匀分布。只有当每个点都是空碰撞时，光子才能穿过这一段，所以

$$
P(\text{pass}) = \sum_{n=0}^{\infty} e^{-\bar\sigma d}\frac{(\bar\sigma d)^n}{n!}
\left(\frac{1}{d}\int_0^d \Big(1 - \frac{\sigma_t(s)}{\bar\sigma}\Big) ds\right)^{\!n}
= e^{-\bar\sigma d}\, e^{\int_0^d (\bar\sigma - \sigma_t)\,ds} = e^{-\tau(d)} .
$$

因此 delta tracking 给出一个二值（0 或 1）的透射率估计，其均值恰好为 $T$。它的方差是伯努利变量的方差 $T(1-T)$，与上界无关。宽松的上界只会多花时间，因为空碰撞更多。

### 6.3 Ratio tracking

当我们只需要透射率时（例如阴影光线），在第一次真实碰撞处终止会丢掉信息。**Ratio tracking**（Novák、Selle 与 Jarosz 2014）会走完这一段上的*所有*试探碰撞，并把每处“是空碰撞”的概率相乘：

$$
\langle T\rangle = \prod_{i=1}^{n}\left(1 - \frac{\sigma_t(\mathbf{x}_i)}{\bar\sigma}\right).
$$

上面的求和表明它的期望同样是 $e^{-\tau}$。它的方差更低，而且随上界增大而继续下降。对均匀介质，二阶矩为 $\sum_n e^{-\bar\sigma d}\frac{(\bar\sigma d)^n}{n!}(1-\sigma/\bar\sigma)^{2n} = e^{-2\sigma d + \sigma^2 d/\bar\sigma}$，所以

$$
\mathrm{Var}\,\langle T\rangle = e^{-2\sigma d}\left(e^{\sigma^2 d/\bar\sigma} - 1\right) \xrightarrow{\ \bar\sigma\to\infty\ } 0 .
$$

**数值例子**：$\sigma = 1$、$d = 1$，于是 $T = 0.368$。Delta tracking 的方差为 $0.368 \times 0.632 = 0.233$。$\bar\sigma = 2$ 时 ratio tracking 的方差为 $e^{-2}(e^{0.5}-1) = 0.088$，$\bar\sigma = 4$ 时为 $e^{-2}(e^{0.25}-1) = 0.038$。代价是平均 $\bar\sigma d$ 次查询。

### 6.4 Residual ratio tracking

**Residual ratio tracking**（同样出自 Novák 等 2014）把消光拆成两部分：光学深度可解析求得的**控制**部分 $\sigma_c$（例如某个网格节点上的均值），以及残差 $\sigma_r = \sigma_t - \sigma_c$：

$$
\langle T\rangle = e^{-\sigma_c d}\prod_{i}\left(1 - \frac{\sigma_r(\mathbf{x}_i)}{\bar\sigma_r}\right),
$$

此时试探点来自残差上界 $\bar\sigma_r \ge \vert\sigma_r\vert$。只有残差需要随机估计，所以控制项选得好时，方差和开销都会下降。在 $\sigma_r<0$ 处因子可能大于 1，估计仍然无偏。

```python
import numpy as np
rng = np.random.default_rng(1)

def sigma_t(t):   # the same medium as in Section 2
    return (0.1 + 1.0 * np.exp(-((t - 2.0) / 0.45) ** 2)
            + 0.6 * np.exp(-((t - 5.2) / 0.8) ** 2)
            + 1.6 * np.exp(-((t - 7.4) / 0.25) ** 2))

SIGMA_BAR, D = 1.8, 10.0          # majorant >= max sigma_t (about 1.70)

def delta_tracking():
    t = 0.0
    while True:
        t -= np.log(1 - rng.random()) / SIGMA_BAR
        if t >= D:
            return 1.0                                  # passed the segment
        if rng.random() < sigma_t(t) / SIGMA_BAR:
            return 0.0                                  # real collision

def ratio_tracking():
    t, T = 0.0, 1.0
    while True:
        t -= np.log(1 - rng.random()) / SIGMA_BAR
        if t >= D:
            return T
        T *= 1 - sigma_t(t) / SIGMA_BAR

N = 20000
d = np.array([delta_tracking() for _ in range(N)])
r = np.array([ratio_tracking() for _ in range(N)])
print(f"exact {np.exp(-3.357364):.4f}")                       # 0.0348
print(f"delta {d.mean():.4f} +- {d.std() / np.sqrt(N):.4f}")
print(f"ratio {r.mean():.4f} +- {r.std() / np.sqrt(N):.4f}")  # same mean, much smaller error
```

下图在这一介质上运行三种估计器，上界从最大消光的 $1\times$ 到 $8\times$，每种 20,000 次估计。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-tracking-variance.svg" caption="在第 2 节的介质上真实运行三种透射率估计器的蒙特卡洛实验（真实 T = 0.0348）。(a) 单次估计的标准差随上界的变化。无论上界多宽松，delta tracking 都停留在伯努利值 √(T(1−T))（点线）。Ratio tracking 低得多，并随上界增大继续改善。以平均消光为控制项的 residual ratio tracking 更低。(b) 代价：密度查询次数随上界线性增长（delta tracking 在第一次真实碰撞处提前停止）。" %}

下面的小部件展示了两种估计器背后的几何。每次试探碰撞都画在轴上方 $\xi\bar\sigma$ 的高度，于是“以概率 $\sigma_t/\bar\sigma$ 判为真实”就变成“点落在密度曲线下方”。这就是沿光线做的拒绝采样。

{% include widget.liquid name="graphics-volume-tracking" height="520" caption="第 2 节介质上的 delta tracking 与 ratio tracking。上：一次 delta tracking 游走；每次试探碰撞画在高度 ξσ̄ 处，密度曲线上方的灰色圆环是空碰撞，曲线下方的第一个红点是真实碰撞，游走就此结束（估计为 0）；到达 t = 10 则估计为 1。下：精确的 T(t)（黑色）和一次 ratio tracking 游走（蓝色），它在每个点乘以 1 − σt/σ̄。点击图生成新光线；下方的统计会累积成千上万次游走。调高上界：delta tracking 的标准差保持在 0.18 左右，ratio tracking 的标准差缩小，两者都要付出更多查询的代价。" %}

### 6.5 空散射路径积分及更多

Delta 与 ratio tracking 是一个更大家族中的两员。Novák、Georgiev、Hanika 与 Jarosz（2018）在一篇 Eurographics 前沿报告（STAR）中做了综述：各种 tracking、针对彩色介质的谱 tracking（spectral tracking）、分解 tracking（decomposition tracking，Kutz 等 2017），以及如何选择上界。随后，Miller、Georgiev 与 Jarosz（2019）提出了**空散射路径积分表述**（null-scattering path integral formulation）。空碰撞成为路径上的显式顶点，有自己的路径空间测度。这样，tracking 估计器就能与多重重要性采样（MIS，[第 05 篇]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})）结合，包括谱 MIS 和双向方法。此前的 tracking 估计器做不到这一点，因为它们的 pdf 无法计算。

## 7. 带多次散射的体积路径追踪

体积路径追踪器在第 05 篇的表面路径追踪器上，为每一段增加一个决策：*路径是先击中下一个表面，还是先在介质中碰撞？* 用 delta tracking：

1. 从当前顶点出发，沿方向做 delta tracking，找到第一次真实碰撞（或到达表面、或逃逸）。
2. 在介质中发生真实碰撞时：以概率 $\sigma_a/\sigma_t$ 被吸收（若有自发光则累加），否则散射。等价做法是把通量乘以反照率 $\rho$ 并总是散射，再用俄罗斯轮盘终止。
3. **下一事件估计**：在光源上采样一点，用 **ratio tracking** 估计到该点的透射率，并累加 $\text{throughput}\times\rho\times p(\cos\theta)\times T_\ell\times L_{\text{light}}/\text{pdf}_{\text{light}}$。
4. 按相函数采样新方向（HG 采样的权重为 1），继续。

下面的代码把这些步骤精简到最核心：光子从顶部进入一块非均匀平板，用 delta tracking 找真实碰撞，用 HG 采样选择新方向。输出反射、透射和吸收的比例，这正是材质外观模型需要的量。

```python
import numpy as np
rng = np.random.default_rng(2)
SIGMA_BAR, ALBEDO, G, DEPTH = 1.8, 0.95, 0.7, 4.0

def sigma_t(p):   # slab 0 <= z <= 4, denser in a wavy layer around z = 2 (max exactly 1.8)
    return 1.0 + 0.8 * np.sin(2.0 * p[0]) * np.exp(-(p[2] - 2.0) ** 2)

def sample_hg(g, xi):
    if abs(g) < 1e-3:
        return 1 - 2 * xi
    s = (1 - g * g) / (1 - g + 2 * g * xi)
    return (1 + g * g - s * s) / (2 * g)

def scatter(w, g):
    cos_t = sample_hg(g, rng.random())
    sin_t = np.sqrt(max(0.0, 1 - cos_t * cos_t))
    phi = 2 * np.pi * rng.random()
    a = np.array([1.0, 0.0, 0.0]) if abs(w[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u = np.cross(a, w); u /= np.linalg.norm(u)
    v = np.cross(w, u)
    return sin_t * np.cos(phi) * u + sin_t * np.sin(phi) * v + cos_t * w

def trace(max_bounces=1000):
    p, w = np.zeros(3), np.array([0.0, 0.0, 1.0])   # enter at the top, heading down (+z)
    for _ in range(max_bounces):
        while True:                                  # delta tracking to a REAL collision
            p = p - np.log(1 - rng.random()) / SIGMA_BAR * w
            if p[2] < 0:
                return "R"
            if p[2] > DEPTH:
                return "T"
            if rng.random() < sigma_t(p) / SIGMA_BAR:
                break
        if rng.random() > ALBEDO:                    # analog absorption
            return "A"
        w = scatter(w, G)
    return "A"

fates = [trace() for _ in range(5000)]
print({k: fates.count(k) / len(fates) for k in "RTA"})
```

下图中的随机游走展示了路径本身。高反照率介质会让光子散射几十次，光因此向侧面扩散，到达太阳直射不到的区域。这就是云图 (c) 过暗的物理原因。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-random-walk.svg" caption="厚度为 4 个平均自由程、反照率 0.98 的平板中的随机游走，光从顶部进入（黄色箭头）；每幅 24 条路径，投影到 x-z 平面，按结局着色：反射（橙）、透射（蓝）、吸收（灰）。标题中的比例 R、T、A 来自 20,000 次游走。各向同性散射（左）把许多光子从顶部送回；g = 0.85 的前向散射（右）把它们带得更深、透射更多，因为每次反弹只稍微改变方向。" %}

**相似性与八度技巧。** 有两种近似让多次散射变得负担得起。**相似性关系**（similarity relation）指出：参数为 $(\sigma_s, g)$ 的前向散射介质，经过多次反弹后，表现得像约化散射系数 $\sigma_s' = \sigma_s(1-g)$ 的各向同性介质。这一点会在第 10 节的扩散模型中再次出现。在实时渲染和电影中，一种流行的启发式方法（Wrenninge、Kulla 与 Lundqvist 2013 年的演讲 *Oz: The Great and Volumetric*）用消光、散射和各向异性逐级减弱的单次散射项之和来近似多次散射：

$$
L_{ms} \approx \sum_{k=0}^{K-1} a^k\,\sigma_s\,p(\cos\theta;\, c^k g)\, e^{-b^k \tau_\ell},
\qquad a, b, c < 1 .
$$

云图 (d) 使用 $a=b=c=\tfrac12$、$K=4$。它在物理上并不精确，但抓住了主要效应：光渗入阴影区域。

## 8. 数据结构：OpenVDB 与 NanoVDB

产品级体积（爆炸、云、流体模拟）既大又**稀疏**：包围盒的大部分是空的。稠密的 $2048^3$ 浮点网格需要 32 GB。**OpenVDB**（Museth 2013）只把活动区域存进一棵浅而深度固定的树。标准配置是：哈希表根节点，两层内部节点（分别有 $32^3$ 和 $16^3$ 个子节点），以及存放 $8^3$ 个体素的叶节点。位掩码标记活动子节点，因此查询很快，随机访问为 $O(1)$，缓存访问路径还能让相干访问更便宜。

**NanoVDB**（Museth 2021）把同一棵树线性化为一块连续的只读缓冲区，不含指针，因此可以上传到 GPU，并在 CUDA、OptiX、HLSL 或 GLSL 中遍历。对渲染来说，一个有用的细节是：树中还存有每个节点的统计量，例如最小值和最大值。它们可以作为**局部上界**：delta 和 ratio tracking 可以为每个节点使用紧致的 $\bar\sigma$，而不是一个全局最大值。正如第 6 节的图所示，这会直接减少查询次数。空节点被整个跳过，也就是第 5 节的空域跳过。

## 9. 实时：froxel 体积雾、天空与云

### 9.1 Froxel 体积雾

游戏不可能让每个像素都对每个光源做步进。基于 **froxel** 的雾（Wronski 2014，SIGGRAPH Advances in Real-Time Rendering 课程中的 *Volumetric Fog*；Hillaire 2015 在 Frostbite 中加以扩展）在与视锥对齐的三维纹理中工作。froxel 即视锥体素（frustum voxel）：例如屏幕空间 $160\times 90$ 个图块乘以 64 个深度切片，切片按指数间隔 $z_k = z_n (z_f/z_n)^{k/N}$，使分辨率符合透视。

1. **注入**（inject）：计算着色器把 $\sigma_s$、$\sigma_t$ 和自发光写入每个 froxel（全局雾、高度雾、局部雾体积、粒子）。
2. **光照**：对每个 froxel 累加所有光源的内散射，用阴影贴图判断可见性，用相函数处理视角。
3. **积分**：沿每列 froxel 从前到后行进，用第 5 节的能量守恒分段公式累加散射光和透射率。
4. **应用**：着色深度为 $z$ 的像素时，取出 $z$ 处累积的 $(L_{\text{in}}, T)$，输出 $T\,L_{\text{surface}} + L_{\text{in}}$。透明物体也可以查询它。

网格很粗，所以 froxel 位置每帧抖动，并与重投影的上一帧混合。这与 [第 06 篇]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}) 中 TAA 的时间复用是同一思路。

### 9.2 天空与大气

大气是一个球壳，由三部分组成：空气（Rayleigh，标高约 8 km）、气溶胶（Mie，标高约 1.2 km）和臭氧（纯吸收，让暮光中的天空保持蓝色）。密度随高度 $h$ 指数下降：$\sigma(h) = \sigma(0)\,e^{-h/H}$。沿每条视线计算阳光的单次散射，已经能解释主要的颜色。短波长散射更强，所以远离太阳的天空是蓝色的。日落时，到达我们的光穿过了极长的空气路径，蓝光已被散射殆尽，只剩下橙色和红色。

**数值例子。** 使用 Hillaire（2020）所用的海平面 Rayleigh 系数 $\beta_R = (5.80, 13.56, 33.1)\times10^{-6}\ \text{m}^{-1}$（R, G, B），天顶光学深度为 $\beta_R H_R = (0.046, 0.108, 0.265)$。正午的直射阳光保留了 $e^{-0.265} = 77\%$ 的蓝光。在地平线方向，路径大约长 35-40 倍，蓝光降到 $e^{-9.3}\approx 10^{-4}$，红光仍保留约 $e^{-1.6} \approx 0.2$。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-rayleigh-sky.svg" caption="由图脚本计算的单次散射天空（Rayleigh + Mie + 臭氧，球形地球，沿每条视线和每条太阳光线做数值求积）。每列对应一个太阳高度角，每行对应一个视线仰角；(a) 朝向太阳，(b) 背向太阳。注意太阳方向周围明亮的 Mie 光晕（(a) 中的对角线）、越接近天顶越深的蓝色，以及太阳接近并落到地平线以下时天空的变暗和变红。下方条带显示太阳圆盘直射光的色调（每列归一化的 T_sun）：高度角大时为白色，接近地平线时变橙再变红。" %}

逐像素逐帧计算这些太昂贵，而且多次散射很重要，尤其在暮光中。**Bruneton 与 Neyret（2008）**把单次和多次散射预计算进 4D 查找表（高度、视线天顶角、太阳天顶角、视线-太阳夹角），逐阶添加散射。**Hillaire（2020）**提出了一种更轻量、完全动态的方案，现已用于 Unreal Engine。它使用一张小的透射率 LUT、一张多次散射 LUT 和一张低分辨率的天空视图 LUT（sky-view LUT），再加一个用于空气透视（aerial perspective）的 froxel 体积。多次散射 LUT 假设二阶及更高阶散射是各向同性的，并把无穷阶散射之和写成几何级数的闭式解。所有 LUT 都便宜到可以每帧重算，因此大气可以在运行时变化。

### 9.3 云

实时云景始于 Schneider 2015 年的 Advances 演讲 *The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn*。其中的要素此后已成为标准：

- **建模**：低频三维 Perlin-Worley 噪声定义云的形状，高频 Worley 噪声侵蚀边缘。二维**天气图**（weather map）设置覆盖率和云类型，按类型设定的高度梯度带来平坦的云底和翻腾的云顶。
- **光照**：朝向太阳的 Beer-Lambert 透射率、HG 相函数（常用双瓣表现银边），以及让朝阳的边缘额外变暗的“粉末”（powder）效应：薄边缘还没有积累起足够的内散射光。第 7 节的多八度技巧用来近似多次散射。
- **性能**：在空白区域用大步长，在云内用小步长；低分辨率渲染加时间重投影，每帧只刷新一部分像素；以及提前终止。

同一工作室后来的 Nubis 系列演讲介绍了该系统的演进，包括可穿越的云和基于体素的云创作。

## 10. 次表面散射

皮肤、大理石、蜡、牛奶和树叶是**半透明**（translucent）的：光从一点进入，在内部散射多次，再从别处射出。BRDF 假设入射点和出射点相同。一般的描述是 **BSSRDF** $S(\mathbf{x}_i, \boldsymbol{\omega}_i; \mathbf{x}_o, \boldsymbol{\omega}_o)$，它把离开 $\mathbf{x}_o$ 的辐射亮度与到达*另一*点 $\mathbf{x}_i$ 的光联系起来：

$$
L_o(\mathbf{x}_o, \boldsymbol{\omega}_o) = \int_A \int_{H^2} S(\mathbf{x}_i, \boldsymbol{\omega}_i; \mathbf{x}_o, \boldsymbol{\omega}_o)\, L_i(\mathbf{x}_i, \boldsymbol{\omega}_i)\,\cos\theta_i\, d\boldsymbol{\omega}_i\, dA(\mathbf{x}_i).
$$

### 10.1 扩散与偶极子

在稠密、高反照率的介质中，光已散射了太多次，方向几乎随机。此时辐射亮度几乎各向同性，RTE 化简为关于通量密度（fluence）的**扩散方程**（diffusion equation）。**Jensen、Marschner、Levoy 与 Hanrahan（2001）**为半无限平板求解了它：在表面下深度 $z_r = 1/\sigma_t'$ 处放一个正点光源，在表面上方放一个负的镜像光源，以满足边界条件。这就是**偶极子**（dipole）。结果是一个径向的**漫反射剖面**（diffuse reflectance profile）$R_d(r)$，即在距入射点 $r$ 处射出的光所占的比例：

$$
R_d(r) = \frac{\alpha'}{4\pi}\left[ z_r\,(1+\sigma_{tr} d_r)\,\frac{e^{-\sigma_{tr} d_r}}{d_r^3} + z_v\,(1+\sigma_{tr} d_v)\,\frac{e^{-\sigma_{tr} d_v}}{d_v^3}\right],
$$

其中各量为：约化系数 $\sigma_s' = \sigma_s(1-g)$、$\sigma_t' = \sigma_a + \sigma_s'$，约化反照率 $\alpha' = \sigma_s'/\sigma_t'$，有效输运系数 $\sigma_{tr} = \sqrt{3\sigma_a\sigma_t'}$，光源深度 $z_r = 1/\sigma_t'$ 和 $z_v = z_r(1+\tfrac{4}{3}A)$，距离 $d_{r,v} = \sqrt{r^2 + z_{r,v}^2}$。常数 $A = \frac{1+F_{dr}}{1-F_{dr}}$ 通过漫反射菲涅尔反射率 $F_{dr}$（相对折射率 $\eta$ 的拟合多项式）来计入边界处的内部反射。

### 10.2 Burley 的归一化扩散

Christensen 与 Burley（2015，Pixar 技术备忘录）发现，暴力蒙特卡洛模拟得到的剖面可以用两个指数之和拟合得非常好，Burley 把它用在了 Disney BSDF 中：

$$
R(r) = A\,s\,\frac{e^{-s r} + e^{-s r/3}}{8\pi r}.
$$

其中 $A$ 是表面反照率，$d = 1/s$ 是面向用户的**散射距离**（scattering distance）。它是**归一化**的：$\int_0^\infty R(r)\,2\pi r\,dr = \frac{A s}{4}\left(\frac{1}{s} + \frac{3}{s}\right) = A$，所以美术可以独立地设置颜色 $A$ 和模糊半径 $d$。更妙的是，$2\pi r R(r) = A\left[\tfrac14\,\tfrac{e^{-r/d}}{d} + \tfrac34\,\tfrac{e^{-r/(3d)}}{3d}\right]$ 是两个指数分布的混合，因此采样半径非常简单：以概率 $\tfrac14$ 取 $r = -d\ln\xi$，否则取 $r = -3d\ln\xi$。

```python
import numpy as np

def burley(r, A, d):
    return A * (np.exp(-r / d) + np.exp(-r / (3 * d))) / (8 * np.pi * d * r)

r = np.linspace(1e-6, 60.0, 600001)                         # mm
for A, d in [(0.8, 1.0), (0.55, 0.45), (0.4, 0.25)]:        # red spreads furthest in skin
    f = 2 * np.pi * r * burley(r, A, d)
    print(A, d, round(float(np.sum(0.5 * (f[1:] + f[:-1]) * np.diff(r))), 4))   # ~A

rng = np.random.default_rng(0)                              # sampling the radius
d, n = 1.0, 200000
xi, pick = rng.random(n), rng.random(n) < 0.25
radii = np.where(pick, -d * np.log(1 - xi), -3 * d * np.log(1 - xi))
print(radii.mean(), 0.25 * d + 0.75 * 3 * d)                 # both ~2.5
```

{% include blog_figure.liquid path="assets/img/blog/graphics/10-diffusion-profiles.svg" caption="扩散剖面。(a) 类似皮肤的 RGB 系数（列在图脚本中）下的偶极子 R_d(r)，双对数坐标：吸收最少的红光扩散最远，这就是背光的耳朵发红、皮肤看起来柔和的原因。(b) Burley 归一化剖面作为径向密度 2πr R(r)，三组 (A, d)；图例给出数值积分得到的面积，等于 A。" %}

### 10.3 实时与产品级渲染

- **可分离次表面散射**（separable subsurface scattering，Jimenez 等 2015）把 SSS 做成屏幕空间后处理。皮肤像素的辐照度用扩散剖面模糊，二维卷积核用两次一维卷积（先水平后垂直）的可分离秩 1 近似来代替。核半径按深度缩放，使模糊在世界空间中尺寸恒定。
- **随机游走 SSS。** 产品级路径追踪器（例如 Arnold、RenderMan 和 Blender Cycles）如今提供跳过扩散近似的模式。它们把网格内部当作体积来路径追踪，使用与第 7 节相同的 delta tracking 和相函数采样，并以网格表面为边界。这能正确处理薄几何体、背光和复杂形状，代价是更高的开销。

## 11. 回到神经渲染：alpha 合成就是数值求积

取**只有发射-吸收**的体渲染方程，把发射颜色记为 $\mathbf{c}(\mathbf{x}, \boldsymbol{\omega})$（把 $\sigma_a L_e$ 并入 $\sigma\,\mathbf{c}$）：

$$
C = \int_0^{d} T(t)\,\sigma(t)\,\mathbf{c}(t)\,dt, \qquad T(t) = e^{-\int_0^t \sigma\,ds}.
$$

这就是 NeRF 的渲染积分。现在像第 5 节的光线步进那样计算它：在点 $t_i$ 处切分光线，间距为 $\delta_i$，假设 $\sigma$ 和 $\mathbf{c}$ 在每段内恒定。第 $i$ 段上的精确积分为 $T_i\,(1 - e^{-\sigma_i\delta_i})\,\mathbf{c}_i$，所以

$$
\hat C = \sum_i T_i\,\alpha_i\,\mathbf{c}_i,
\qquad \alpha_i = 1 - e^{-\sigma_i \delta_i},
\qquad T_i = \prod_{j<i}(1 - \alpha_j).
$$

这就是**从前到后的 alpha 合成**（front-to-back alpha compositing），即 “over” 运算。NeRF 的公式就是第 5 节的能量守恒分段规则，只是把 $\sigma_s/\sigma_t$ 换成了发射颜色。3D Gaussian Splatting 使用同样的求和，只是每个 $\alpha_i$ 来自一个投影后的高斯，而不是密度采样。权重 $w_i = T_i\alpha_i$ 之和为 $1 - T_N \le 1$，因此它们像深度上的概率分布。NeRF 的分层采样正是用它来放置精细采样点。

**数值例子。** 两个采样点，$\sigma = (1, 3)$，$\delta = 0.5$，颜色 $c = (0.9, 0.2)$：$\alpha = (0.393, 0.777)$，$T = (1, 0.607)$，$w = (0.393, 0.471)$。权重之和为 $0.865 = 1 - e^{-2}$，恰好等于一减去总透射率，$\hat C = 0.9(0.393) + 0.2(0.471) = 0.448$。

```python
import numpy as np
sigma, delta, c = np.array([1.0, 3.0]), np.array([0.5, 0.5]), np.array([0.9, 0.2])
alpha = 1 - np.exp(-sigma * delta)
T = np.concatenate([[1.0], np.cumprod(1 - alpha)[:-1]])
w = T * alpha
print(alpha.round(4), T.round(4), w.round(4), w.sum().round(4), (w * c).sum().round(4))
# [0.3935 0.7769] [1.     0.6065] [0.3935 0.4712] 0.8647 0.4484
```

{% include blog_figure.liquid path="assets/img/blog/graphics/10-quadrature.svg" caption="在第 2 节的介质上把 alpha 合成看作数值求积。(a) 连续权重 T(t)σt(t)（紫色）与 16 段的离散权重 T_iα_i/δ_i（柱）：柱紧跟曲线，包括最后一个峰被前面的峰遮挡的效果。(b) 随采样数 N 增加，渲染颜色相对精确积分的误差。指数形式 α = 1 − e^−σδ（能量守恒）大约以二阶收敛；朴素的 α = σδ（截断到 1）在 N 较小时差得多，因为它在稠密段高估了不透明度。" %}

本章的一切都能迁移过去：基于透射率的采样变成 NeRF 的重要性采样；空域跳过变成 [快速辐射场]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }}) 中的占用网格；条带与噪声之间的取舍，正是 NeRF 训练时抖动采样位置的原因。

## 动手试试

- 上面的相函数小部件：比较 HG、Draine 和 Rayleigh，看样本均值收敛到 $g$。
- [NeRF 一文]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) 中的体渲染光线小部件展示了单条光线上的发射-吸收合成。
- [Interactive Lab]({{ '/' | relative_url }}#lab) 中的路径追踪器是表面路径追踪器。把第 7 节的 delta tracking 循环加进它的内循环，是一个很好的 WebGL 练习。

## 代表性论文

| 论文 | 发表 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Henyey & Greenstein, *Diffuse Radiation in the Galaxy* | Astrophysical Journal | 1941 | [DOI](https://doi.org/10.1086/144246) | 至今随处可见的单参数相函数 |
| Kajiya & Von Herzen, *Ray Tracing Volume Densities* | SIGGRAPH | 1984 | [DOI](https://doi.org/10.1145/964965.808594) | 把辐射传输方程和体积光线追踪引入图形学 |
| Nishita, Sirai, Tadamura & Nakamae, *Display of the Earth Taking into Account Atmospheric Scattering* | SIGGRAPH | 1993 | [DOI](https://doi.org/10.1145/166117.166140) | 从太空和地面观察的基于物理的单次散射天空 |
| Max, *Optical Models for Direct Volume Rendering* | IEEE TVCG | 1995 | [DOI](https://doi.org/10.1109/2945.468400) | 发射-吸收与散射模型；NeRF 渲染积分的前身 |
| Jensen, Marschner, Levoy & Hanrahan, *A Practical Model for Subsurface Light Transport* | SIGGRAPH | 2001 | [DOI](https://doi.org/10.1145/383259.383319) | 偶极子 BSSRDF，使半透明材质实用化 |
| Draine, *Scattering by Interstellar Dust Grains. I. Optical and Ultraviolet* | Astrophysical Journal | 2003 | [DOI](https://doi.org/10.1086/379118) | 提出了现代 Mie 拟合中使用的 Draine 相函数 |
| Bruneton & Neyret, *Precomputed Atmospheric Scattering* | CGF (EGSR) | 2008 | [DOI](https://doi.org/10.1111/j.1467-8659.2008.01245.x) | 基于 4D 查找表的实时多次散射天空 |
| Museth, *VDB: High-Resolution Sparse Volumes with Dynamic Topology* | ACM TOG | 2013 | [DOI](https://doi.org/10.1145/2487228.2487235) | OpenVDB 背后的稀疏体积格式 |
| Novák, Selle & Jarosz, *Residual Ratio Tracking for Estimating Attenuation in Participating Media* | ACM TOG (SIGGRAPH Asia) | 2014 | [DOI](https://doi.org/10.1145/2661229.2661292) | Ratio 与 residual ratio tracking：低方差的无偏透射率 |
| Wronski, *Volumetric Fog: Unified Compute Shader-Based Solution to Atmospheric Scattering* | SIGGRAPH Advances in Real-Time Rendering | 2014 | [课程页面](https://advances.realtimerendering.com/s2014/index.html) | 游戏中基于 froxel 的体积雾 |
| Schneider, *The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn* | SIGGRAPH Advances in Real-Time Rendering | 2015 | [课程页面](https://advances.realtimerendering.com/s2015/index.html) | 实时光线步进云的范本 |
| Hillaire, *Towards Unified and Physically-Based Volumetric Lighting in Frostbite* | SIGGRAPH Advances in Real-Time Rendering | 2015 | [课程页面](https://advances.realtimerendering.com/s2015/index.html) | 能量守恒的 froxel 积分、统一的参与介质 |
| Jimenez et al., *Separable Subsurface Scattering* | CGF | 2015 | [DOI](https://doi.org/10.1111/cgf.12529) | 用可分离卷积核实现实时屏幕空间 SSS |
| Christensen & Burley, *Approximate Reflectance Profiles for Efficient Subsurface Scattering* | Pixar Technical Memo 15-04 | 2015 | — | 归一化扩散：双指数剖面，采样极其简单 |
| Kutz, Habel, Li & Novák, *Spectral and Decomposition Tracking for Rendering Heterogeneous Volumes* | ACM TOG (SIGGRAPH) | 2017 | [DOI](https://doi.org/10.1145/3072959.3073665) | 针对彩色介质的 tracking 与控制/残差分解 |
| Novák, Georgiev, Hanika & Jarosz, *Monte Carlo Methods for Volumetric Light Transport Simulation* | CGF (Eurographics STAR) | 2018 | [DOI](https://doi.org/10.1111/cgf.13383) | 体积蒙特卡洛必读综述 |
| Miller, Georgiev & Jarosz, *A Null-Scattering Path Integral Formulation of Light Transport* | ACM TOG (SIGGRAPH) | 2019 | [DOI](https://doi.org/10.1145/3306346.3323025) | 路径空间中的空碰撞；tracking 估计器的 MIS |
| Hillaire, *A Scalable and Production Ready Sky and Atmosphere Rendering Technique* | CGF (EGSR) | 2020 | [DOI](https://doi.org/10.1111/cgf.14050) | 基于 LUT 的动态天空，多次散射有闭式近似 |
| Mildenhall et al., *NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis* | ECCV | 2020 | [arXiv](https://arxiv.org/abs/2003.08934) | 把发射-吸收体渲染用作可微的场景表示 |
| Museth, *NanoVDB: A GPU-Friendly and Portable VDB Data Structure for Real-Time Rendering and Simulation* | SIGGRAPH Talks | 2021 | [DOI](https://doi.org/10.1145/3450623.3464653) | GPU 上的 VDB |
| Jendersie & d'Eon, *An Approximate Mie Scattering Function for Fog and Cloud Rendering* | SIGGRAPH Talks | 2023 | [DOI](https://doi.org/10.1145/3587421.3595409) | 针对水滴、拟合 Mie 理论的 HG + Draine 混合 |

## 学习资源

- Pharr、Jakob 与 Humphreys，《Physically Based Rendering》第 4 版，可在 [pbr-book.org](https://pbr-book.org/4ed/contents) 免费在线阅读。第 11 章（体积散射）和第 14 章（体积光传输）用空散射路径追踪实现了第 1-7 节的全部内容。
- Fong、Wrenninge、Kulla 与 Habel，*Production Volume Rendering*，SIGGRAPH 2017 课程（[DOI](https://doi.org/10.1145/3084873.3084907)）：电影渲染器在实践中如何处理体积。
- 上面的 Novák 等 2018 综述，是关于 tracking 估计器的最佳单篇参考。
- Sébastien Hillaire 的开源天空示例 [UnrealEngineSkyAtmosphere](https://github.com/sebh/UnrealEngineSkyAtmosphere) 和 Eric Bruneton 的 [precomputed_atmospheric_scattering](https://github.com/ebruneton/precomputed_atmospheric_scattering)，两者的着色器代码都很易读。
- [OpenVDB](https://github.com/AcademySoftwareFoundation/openvdb)（包含 NanoVDB），以及 [Mitsuba 3](https://github.com/mitsuba-renderer/mitsuba3)：它的体积路径追踪器短小到可以通读。
- [Scratchapixel](https://www.scratchapixel.com/) 有一套循序渐进、附 C++ 代码的多篇体渲染入门。

## 练习

1. 证明 HG 相函数的平均余弦为 $g$。在 $2\pi\int\mu\,p_{HG}\,d\mu$ 中代换 $u = 1 + g^2 - 2g\mu$。

   <details markdown="1"><summary>提示</summary>
   代入 $\mu = (1+g^2-u)/(2g)$、$d\mu = -du/(2g)$，积分变成 $\int u^{-3/2}du$ 与 $\int u^{-1/2}du$ 在 $(1-g)^2$ 和 $(1+g)^2$ 之间的组合。整理各项后恰好剩下 $g$。
   </details>

2. 为第 5 节的球体光线步进器加上提前终止（$T < 10^{-3}$）和一个在核心处很亮的自发光项 $\sigma_a L_e$。在 `res=96` 时，提前终止能节省多少次密度查询？

3. 实现双瓣 HG 混合的采样器（以概率 $w$ 选一个波瓣，再对它采样），并用直方图验证它与 $w\,p_{HG}(g_1) + (1-w)\,p_{HG}(g_2)$ 一致。

   <details markdown="1"><summary>提示</summary>
   混合密度是凸组合，所以“先选分量、再对其采样”恰好按它抽样。因为 pdf 与函数相同，不需要任何权重修正。
   </details>

4. 把 ratio tracking 代码中的全局上界换成**分段**上界：把 $[0, 10]$ 分成 10 个单元，每个单元使用 $\sigma_t$ 在其中的最大值，并在每个单元边界处重新开始指数采样（指数分布的无记忆性保证这样做是正确的）。在相同方差下，与全局上界比较查询次数。

5. 从泊松求和推导均匀介质下 ratio tracking 的方差 $e^{-2\sigma d}(e^{\sigma^2 d/\bar\sigma} - 1)$，并用 $\sigma = 1$、$d = 1$、$\bar\sigma \in \{1, 2, 4, 8\}$ 的模拟加以验证。

   <details markdown="1"><summary>提示</summary>
   $E[\langle T\rangle^2] = \sum_n e^{-\bar\sigma d}\frac{(\bar\sigma d)^n}{n!}(1-\sigma/\bar\sigma)^{2n} = \exp\big(-\bar\sigma d + \bar\sigma d (1-\sigma/\bar\sigma)^2\big)$。展开平方，再减去 $T^2 = e^{-2\sigma d}$。
   </details>

下一篇：[实时渲染技术]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})。它讲游戏如何把延迟着色、软阴影、环境光遮蔽、反射、全局光照和色调映射塞进 16 ms 的一帧。
