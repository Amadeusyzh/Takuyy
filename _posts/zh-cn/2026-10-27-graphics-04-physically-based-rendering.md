---
layout: post
title: "基于物理的渲染：辐射度量学、渲染方程与 GGX"
date: 2026-10-27 09:04:00+0900
description: "从瓦特到辐亮度，渲染方程、BRDF 的性质、GGX 微表面模型、金属度-粗糙度工作流与 split-sum 基于图像的光照，并配有数值验证和 GLSL 着色器。"
categories: graphics
tags: [pbr, radiometry, rendering-equation, brdf, microfacet, ggx, ibl]
series: graphics
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

在[上一篇]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})里，我们用 Lambert、Phong 和 Blinn-Phong 给表面着色。这些模型看起来还算可信，但它们的参数（“高光指数”、高光颜色）没有物理含义，也不守恒能量，在一种光照下调好的资产换一种光照就会显得不对。**基于物理的渲染（physically based rendering, PBR）** 用可测量的量取而代之：辐亮度、遵守物理规律的反射函数，以及一小组在任何光照下行为都一致的材质参数。这一篇是整个系列的理论核心。这里定义的渲染方程，正是[下一篇]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})中路径追踪要求解的方程；它同时也是 NeRF、3D Gaussian Splatting 等神经渲染方法所近似的成像模型。

## 前置知识

- [第 1 篇]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})中的向量、点积和局部坐标系；[第 3 篇]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})中的半程向量与法线贴图。
- 球坐标下的二重积分。
- 基础概率（期望、概率密度），有助于理解 split-sum 一节。

## 1. 辐射度量学：度量光

渲染就是模拟光能在场景中的传播，所以首先需要单位。这里用几何光学（geometric optics）来处理光：光沿直线传播，忽略衍射、干涉等波动效应。

### 立体角

平面角是弧长除以半径。**立体角（solid angle）** 是一组方向在单位球面上覆盖的面积，单位是球面度（steradian, sr）。整个球面是 $4\pi$ sr，半球是 $2\pi$ sr。在球坐标中（$\theta$ 是相对法线的极角，$\phi$ 是方位角），微分立体角为

$$
d\omega = \sin\theta \, d\theta \, d\phi .
$$

距离为 $r$、面积为 $dA$ 的小面元，若其法线与视线夹角为 $\theta'$，它所张的立体角为

$$
d\omega = \frac{dA \cos\theta'}{r^2}.
$$

借助这个恒等式，可以在“对方向积分”和“对表面积分”之间切换。后面写渲染方程的面积形式时要用它，下一篇的光源采样也会再用到。

着色中处处出现一个很有用的积分：

$$
\int_{\Omega} \cos\theta \, d\omega = \int_0^{2\pi}\!\!\int_0^{\pi/2} \cos\theta \sin\theta \, d\theta\, d\phi = \pi .
$$

正是这个 $\pi$，使得 Lambert BRDF 是 $\rho/\pi$ 而不是 $\rho$。

### 辐射通量、辐照度、辐射强度、辐亮度

| 物理量 | 符号 | 定义 | 单位 |
| --- | --- | --- | --- |
| 辐射通量（功率）（radiant flux） | $\Phi$ | 单位时间的能量 | W |
| 辐照度（入射，irradiance）/ 辐出度（出射，radiant exitance） | $E$, $M$ | $d\Phi / dA$ | W m$^{-2}$ |
| 辐射强度（radiant intensity） | $I$ | $d\Phi / d\omega$ | W sr$^{-1}$ |
| 辐亮度（radiance） | $L$ | $\dfrac{d^2\Phi}{dA\,\cos\theta\,d\omega}$ | W m$^{-2}$ sr$^{-1}$ |

**辐亮度**是相机像素或人眼实际测量的量：单位*投影*面积、单位立体角上的功率。它有两条性质，使它成为适合放在光线上的量：

1. 在真空中，辐亮度**沿光线保持不变**。传感器离墙越远，每个像素看到的墙面越大，但这块墙面所张的立体角也越小，两种效应恰好抵消。这就是光线追踪可以沿路径直接携带一个辐亮度值的原因。
2. 其他所有量都是辐亮度的积分。例如，法线为 $n$ 的点上的辐照度为

$$
E(x) = \int_{\Omega} L_i(x,\omega_i) \cos\theta_i \, d\omega_i .
$$

其中的 $\cos\theta_i$ 就是 Lambert 余弦定律：以掠射角到达的光束会铺展到更大的面积上。

强度为 $I$、距离为 $r$ 的**点光源**产生的辐照度为 $E = I\cos\theta / r^2$（平方反比定律）。本文最后着色器中的 `E = I * NoL / dist2` 就是这一行。注意，实时引擎中的“光源颜色乘以强度”通常正是这个 $I$，只是可能用光度学单位（坎德拉）而不是瓦特。

## 2. BRDF

到达某点的光要么被反射，要么被透射，要么被吸收。对于不透明表面，**双向反射分布函数（bidirectional reflectance distribution function, BRDF）** 描述从方向 $\omega_i$ 到达的辐照度中，有多少作为辐亮度反射到 $\omega_o$：

$$
f_r(x, \omega_i, \omega_o) = \frac{dL_o(x,\omega_o)}{dE_i(x,\omega_i)} = \frac{dL_o(x,\omega_o)}{L_i(x,\omega_i)\cos\theta_i \, d\omega_i} \quad [\text{sr}^{-1}].
$$

一个物理上合理的 BRDF 满足三条性质：

- **非负性（positivity）**：$f_r \ge 0$。
- **Helmholtz 互易性（reciprocity）**：$f_r(\omega_i,\omega_o) = f_r(\omega_o,\omega_i)$。光路可以从任意一端追踪，双向算法依赖这一点。
- **能量守恒（energy conservation）**：对每个出射方向，**方向反照率（directional albedo）** 不超过 1：

$$
\rho(\omega_o) = \int_{\Omega} f_r(\omega_i,\omega_o)\cos\theta_i \, d\omega_i \le 1 .
$$

对 Lambert BRDF $f_r = \rho/\pi$，有 $\rho(\omega_o) = (\rho/\pi)\cdot\pi = \rho$，所以任何反照率 $\rho \le 1$ 都守恒能量。相比之下，经典 Phong 模型在某些参数下同时违反互易性和能量守恒。归一化的 Blinn-Phong 波瓣 $\frac{s+8}{8\pi}(n\cdot h)^s$ 是早期的修补办法（见《Real-Time Rendering》），而微表面理论给出了有原理支撑的答案。

推广形式：BTDF 描述透射，BSDF 把两者合在一起，BSSRDF 则允许光从一个点进入、从另一个点射出（皮肤、大理石、牛奶中的次表面散射）。

## 3. 渲染方程

由 BRDF 的定义直接得到**反射方程（reflection equation）**：把所有入射方向的反射辐亮度加起来。再加上自发光，就得到**渲染方程（rendering equation）**。它由 Kajiya（SIGGRAPH 1986）引入图形学，同年 Immel、Cohen 和 Greenberg 也提出了同样的方程：

$$
L_o(x,\omega_o) = L_e(x,\omega_o) + \int_{\Omega} f_r(x,\omega_i,\omega_o)\, L_i(x,\omega_i)\, \cos\theta_i \, d\omega_i .
$$

难点在于 $L_i$ 并非已知。在真空中，从 $\omega_i$ 到达 $x$ 的辐亮度，就是这条光线击中的第一个表面点的出射辐亮度：$L_i(x,\omega_i) = L_o(\mathrm{trace}(x,\omega_i), -\omega_i)$。未知量 $L$ 同时出现在等式两边，所以这是一个第二类 Fredholm 积分方程。

Kajiya 用的是**三点（面积）形式**。利用 $d\omega = dA\cos\theta'/r^2$，可以把对方向的积分换成对场景所有表面 $M$ 的积分：

$$
L_o(x' \to x) = L_e(x' \to x) + \int_{M} f_r(x'' \to x' \to x)\, L_o(x'' \to x')\, G(x'', x')\, dA(x''),
$$

$$
G(x'',x') = V(x'',x')\,\frac{\cos\theta''\cos\theta'}{\lVert x''-x'\rVert^2},
$$

其中 $V$ 是取 0 或 1 的可见性项。面积形式是下一篇中光源采样（next-event estimation）的自然出发点。

把积分写成线性传输算子 $\mathcal{T}$，方程就变成 $L = L_e + \mathcal{T}L$，其解是 Neumann 级数

$$
L = L_e + \mathcal{T}L_e + \mathcal{T}^2L_e + \cdots
$$

每一项多一次弹射：$L_e$ 是直接看到的光源，$\mathcal{T}L_e$ 是直接光照，更高阶的项是间接光照（全局光照）。光栅化加局部着色模型只算前两项，路径追踪则用蒙特卡洛积分估计整个级数。

## 4. 微表面理论

真实表面在比像素小、但比光波长大的尺度上是粗糙的。微表面理论（microfacet theory）把这样的表面建模为大量微小的、完全光滑的镜面（微表面），它们的朝向服从某种统计分布。描述这个微观表面如何把光反射到观察者，需要三个要素：

- $D(m)$：**法线分布函数（normal distribution function, NDF）**，即微表面法线 $m$ 的密度；
- $F(\omega, m)$：每个光滑微表面的 **Fresnel** 反射率；
- $G_2(\omega_i,\omega_o,m)$：**遮蔽-阴影函数（masking-shadowing function）**，即同时对光源和观察者可见的微表面所占的比例。

### Cook-Torrance 镜面 BRDF

只有法线等于半程向量 $h = (\omega_i+\omega_o)/\lVert\omega_i+\omega_o\rVert$ 的微表面，才能把光从 $\omega_i$ 镜面反射到 $\omega_o$。按照 Walter 等人（EGSR 2007）的推导，宏观 BRDF 是所有微表面贡献的积分，按投影面积和可见性加权：

$$
f_r(\omega_i,\omega_o) = \int_{\Omega} \frac{\lvert \omega_i\cdot m\rvert}{\lvert \omega_i\cdot n\rvert}\, f_\mu(\omega_i,\omega_o,m)\, \frac{\lvert \omega_o\cdot m\rvert}{\lvert \omega_o\cdot n\rvert}\, G_2(\omega_i,\omega_o,m)\, D(m)\, d\omega_m .
$$

对于理想镜面微表面，$f_\mu$ 是关于 $\omega_o$ 的 delta 分布。把它转换为关于 $m$ 的 delta，需要半程向量映射的雅可比行列式：

$$
\left\lVert \frac{\partial \omega_h}{\partial \omega_o} \right\rVert = \frac{1}{4\,\lvert \omega_o\cdot h\rvert},
$$

由此得到 $f_\mu = F(\omega_i,m)\,\delta_\omega(m,h) / (4(\omega_i\cdot h)^2)$。代入并利用 $\omega_i\cdot h = \omega_o\cdot h$，积分坍缩为：

$$
f_{\text{spec}}(\omega_i,\omega_o) = \frac{F(\omega_i,h)\; G_2(\omega_i,\omega_o,h)\; D(h)}{4\,\lvert n\cdot\omega_i\rvert\,\lvert n\cdot\omega_o\rvert}.
$$

这就是 **Cook-Torrance** 形式（Cook 和 Torrance 在 TOG 1982 中使用的是 Beckmann NDF 和 V 形槽 $G$）。分母里的 $4$ 来自雅可比行列式，而不是随意的归一化常数；分母中的两个余弦来自微观投影面积与宏观面积之间的换算。实时代码常把 $G_2$ 和分母合并为一个**可见性项（visibility term）** $V = G_2 / (4\lvert n\cdot\omega_i\rvert\lvert n\cdot\omega_o\rvert)$。

### NDF 必须归一化

$D$ 是*面积*的密度。所有微表面投影到宏观表面上的面积必须等于宏观面积，由此得到归一化条件：

$$
\int_{\Omega} D(m)\,(n\cdot m)\, d\omega_m = 1 .
$$

### GGX / Trowbridge-Reitz

如今最常用的 NDF 由 Trowbridge 和 Reitz（JOSA 1975）针对椭球形微表面推导得出，后来 Walter 等人（2007）在图形学中重新发现了它，并命名为 **GGX**：

$$
D_{\text{GGX}}(h) = \frac{\alpha^2}{\pi\left((n\cdot h)^2(\alpha^2-1)+1\right)^2}.
$$

其中 $\alpha$ 是粗糙度。当 $\alpha\to 0$ 时，$D$ 趋于 delta（镜面）。当 $\alpha=1$ 时，$D = 1/\pi$，即微表面法线均匀分布。与类似高斯的 Beckmann 分布相比，GGX 峰值尖锐且有**长尾**，产生实测材质所表现出的“明亮高光加柔和光晕”。

对于拉丝金属这样的各向异性表面，用切线空间分量 $h_x,h_y,h_z$ 和粗糙度 $\alpha_x,\alpha_y$ 表示：

$$
D(h) = \frac{1}{\pi\,\alpha_x\alpha_y\left(\frac{h_x^2}{\alpha_x^2}+\frac{h_y^2}{\alpha_y^2}+h_z^2\right)^2}.
$$

### Smith 遮蔽-阴影

Heitz（JCGT 2014）证明，一个自洽的遮蔽函数由 NDF 和对微观表面轮廓的假设共同决定。在 **Smith** 假设（高度与法线不相关）下，方向 $\omega$ 的遮蔽函数为

$$
G_1(\omega,m) = \frac{\chi^+(\omega\cdot m)}{1+\Lambda(\omega)},
\qquad
\Lambda_{\text{GGX}}(\omega) = \frac{-1+\sqrt{1+\alpha^2\tan^2\theta}}{2},
$$

其中 $\chi^+$ 在自变量为正时取 1，否则取 0。它与 NDF 是自洽的：微表面的可见投影面积总等于宏观表面的投影面积，即

$$
\int_{\Omega} G_1(\omega,m)\,\max(0,\omega\cdot m)\, D(m)\, d\omega_m = n\cdot\omega .
$$

把遮蔽（视线方向）和阴影（光源方向）组合成 $G_2$ 有两种常见做法：

- **可分离（separable）**：$G_2 = G_1(\omega_i)\,G_1(\omega_o)$。它把两个事件当作独立的，会高估遮挡。
- **高度相关（height-correlated）**：$G_2 = \dfrac{1}{1+\Lambda(\omega_i)+\Lambda(\omega_o)}$。位置较高的微表面更可能既可见又被照亮，Heitz 推荐这种更准确的形式，而计算代价几乎相同。

把 $\Lambda_{\text{GGX}}$ 代入高度相关的 $G_2$，再除以 $4(n\cdot\omega_i)(n\cdot\omega_o)$，就得到一个紧凑的可见性项（Filament 和许多引擎都在用）：

$$
V(\omega_i,\omega_o) = \frac{0.5}{(n\cdot\omega_i)\sqrt{(n\cdot\omega_o)^2(1-\alpha^2)+\alpha^2} + (n\cdot\omega_o)\sqrt{(n\cdot\omega_i)^2(1-\alpha^2)+\alpha^2}} .
$$

推导方法：写出 $\tan^2\theta = (1-\cos^2\theta)/\cos^2\theta$，于是 $1+\Lambda = \frac{1}{2}\left(1+\sqrt{\cos^2\theta(1-\alpha^2)+\alpha^2}/\cos\theta\right)$，再化简即可。

### Fresnel 与 Schlick 近似

光滑界面反射的光的比例在掠射角处会增大。即使是哑光地板，沿着它看过去也会变得像镜子。精确的 Fresnel 方程依赖复折射率和偏振。Schlick（Computer Graphics Forum 1994）提出了近似：

$$
F(\omega,h) \approx F_0 + (1-F_0)\,(1-\omega\cdot h)^5,
$$

其中 $F_0$ 是垂直入射时的反射率。对于空气中折射率为 $\eta$ 的电介质，

$$
F_0 = \left(\frac{\eta-1}{\eta+1}\right)^2 ,
$$

所以玻璃和大多数塑料（$\eta\approx 1.5$）的 $F_0 = 0.04$，水（$\eta\approx 1.33$）约为 $0.02$。金属的 $F_0$ 很高，并且随波长变化，这就是金和铜的反射带颜色的原因。

## 5. 用数值验证数学

在写着色器之前，先验证归一化恒等式，并做一次**白炉测试（white furnace test）**。白炉测试把表面放在辐亮度处处为 1 的均匀环境中，并令 $F=1$，此时反射辐亮度就等于方向反照率。一个完美的镜面反射模型对任何粗糙度都应恰好返回 1。

```python
import numpy as np

def D_ggx(cos_h, alpha):
    """GGX / Trowbridge-Reitz NDF, isotropic. cos_h = n.h"""
    a2 = alpha * alpha
    d = cos_h * cos_h * (a2 - 1.0) + 1.0
    return a2 / (np.pi * d * d)

def Lambda_ggx(cos_v, alpha):
    """Smith Lambda for GGX: (-1 + sqrt(1 + alpha^2 tan^2 theta)) / 2"""
    tan2 = (1.0 - cos_v * cos_v) / (cos_v * cos_v)
    return 0.5 * (-1.0 + np.sqrt(1.0 + alpha * alpha * tan2))

def G1(cos_v, alpha):
    return 1.0 / (1.0 + Lambda_ggx(cos_v, alpha))

def G2_correlated(cos_l, cos_v, alpha):
    return 1.0 / (1.0 + Lambda_ggx(cos_l, alpha) + Lambda_ggx(cos_v, alpha))

# Midpoint quadrature grid over the upper hemisphere (theta, phi)
nt, nphi = 2048, 512
theta = (np.arange(nt) + 0.5) * (0.5 * np.pi / nt)
phi = (np.arange(nphi) + 0.5) * (2.0 * np.pi / nphi)
T, P = np.meshgrid(theta, phi, indexing="ij")
dw = np.sin(T) * (0.5 * np.pi / nt) * (2.0 * np.pi / nphi)   # d(omega) = sin(theta) dtheta dphi
dirs = np.stack([np.sin(T) * np.cos(P), np.sin(T) * np.sin(P), np.cos(T)], axis=-1)

print("1) projected-area normalization  int D(h) (n.h) dw_h  (should be 1)")
for alpha in [0.05, 0.2, 0.5, 1.0]:
    print(f"   alpha={alpha:4.2f}: {np.sum(D_ggx(np.cos(T), alpha) * np.cos(T) * dw):.5f}")

print("2) visible-normal normalization  int G1(v) <v.h> D(h) dw_h  vs  n.v")
alpha = 0.5
for theta_v in [0.0, 0.6, 1.2]:
    v = np.array([np.sin(theta_v), 0.0, np.cos(theta_v)])
    vh = np.clip(dirs @ v, 0.0, None)
    lhs = G1(np.cos(theta_v), alpha) * np.sum(vh * D_ggx(np.cos(T), alpha) * dw)
    print(f"   theta_v={theta_v:.1f}: lhs={lhs:.5f}  n.v={np.cos(theta_v):.5f}")

print("3) white furnace: directional albedo of the specular lobe with F = 1")
def spec_albedo(theta_v, alpha, correlated=True):
    v = np.array([np.sin(theta_v), 0.0, np.cos(theta_v)])
    l = dirs                                  # integrate over incident directions
    cos_l, cos_v = l[..., 2], np.cos(theta_v)
    h = l + v
    h /= np.linalg.norm(h, axis=-1, keepdims=True)
    D = D_ggx(h[..., 2], alpha)
    G = G2_correlated(cos_l, cos_v, alpha) if correlated else G1(cos_l, alpha) * G1(cos_v, alpha)
    f = D * G / (4.0 * cos_l * cos_v)         # Cook-Torrance with F = 1
    return np.sum(f * cos_l * dw)

for alpha in [0.1, 0.3, 0.6, 1.0]:
    a = [spec_albedo(t, alpha) for t in (0.0, 1.0, 1.4)]
    print(f"   alpha={alpha:3.1f}: E(theta_v=0, 1.0, 1.4) = " + ", ".join(f"{x:.3f}" for x in a))
print("   separable G at alpha=1.0, theta_v=1.4:", f"{spec_albedo(1.4, 1.0, correlated=False):.3f}")
```

输出（运行约两秒）：

```text
1) projected-area normalization  int D(h) (n.h) dw_h  (should be 1)
   alpha=0.05: 1.00002
   alpha=0.20: 1.00000
   alpha=0.50: 1.00000
   alpha=1.00: 1.00000
2) visible-normal normalization  int G1(v) <v.h> D(h) dw_h  vs  n.v
   theta_v=0.0: lhs=1.00000  n.v=1.00000
   theta_v=0.6: lhs=0.82534  n.v=0.82534
   theta_v=1.2: lhs=0.36236  n.v=0.36236
3) white furnace: directional albedo of the specular lobe with F = 1
   alpha=0.1: E(theta_v=0, 1.0, 1.4) = 0.988, 0.973, 0.894
   alpha=0.3: E(theta_v=0, 1.0, 1.4) = 0.877, 0.826, 0.850
   alpha=0.6: E(theta_v=0, 1.0, 1.4) = 0.592, 0.634, 0.781
   alpha=1.0: E(theta_v=0, 1.0, 1.4) = 0.307, 0.434, 0.672
   separable G at alpha=1.0, theta_v=1.4: 0.525
```

我用另一种独立的蒙特卡洛估计（采样可见法线，Heitz 2018）交叉验证了这些反照率，两者在小数点后三位一致。由此得出两点结论：

- NDF 与 Smith $G_1$ 完全自洽，所以模型*绝不会凭空产生*能量。
- 但它在高粗糙度时会**损失**能量：$\alpha=1$ 时最多损失 70%。丢失的是在微表面之间弹射不止一次的光，而单次散射模型忽略了这部分。因此粗糙金属会渲染得偏暗。能量补偿方法（Kulla 与 Conty，“Revisiting Physically Based Shading at Imageworks”，SIGGRAPH 2017 课程；Turquin 2019）会加回一个多次散射波瓣，它由 `spec_albedo` 这样的表格预计算得到。可分离的 $G_2$ 损失的能量更多（最后一行中 0.525 对 0.672）。

## 6. 金属度-粗糙度工作流

不应该让美术人员去输入折射率。Burley 的 Disney “principled” BRDF（SIGGRAPH 2012 课程）以及 Karis 在 Unreal Engine 4 中的改编（SIGGRAPH 2013 课程）推广了一组小而直观的参数，如今已在 glTF 2.0 中标准化：

| 参数 | 范围 | 含义 |
| --- | --- | --- |
| `baseColor` | RGB，$[0,1]$ | 电介质的反照率，金属的 $F_0$ |
| `metallic` | $[0,1]$，几乎总是 0 或 1 | 导体还是电介质 |
| `roughness` | $[0,1]$ | *感知*粗糙度 $r$，$\alpha = r^2$ |

材质是两种物理情形的混合：

- **电介质**（塑料、木头、皮肤）：一个 $F_0=0.04$ 的白色镜面波瓣，加上反照率为 `baseColor` 的漫反射波瓣。
- **金属**：自由电子几乎立刻吸收折射进去的光，所以**没有漫反射波瓣**，`baseColor` 变成带颜色的 $F_0$。

写成代码：

$$
F_0 = \mathrm{lerp}(0.04,\ \text{baseColor},\ \text{metallic}), \qquad c_{\text{diff}} = (1-\text{metallic})\,\text{baseColor},
$$

$$
f_r = \underbrace{(1-F)\,\frac{c_{\text{diff}}}{\pi}}_{\text{diffuse}} + \underbrace{D\,V\,F}_{\text{specular}} .
$$

因子 $(1-F)$ 是一种廉价的做法，避免已经被镜面反射掉的能量再进入漫反射波瓣。它只是近似，更严谨的分层模型会改用镜面反照率。对粗糙度取平方（$\alpha=r^2$）能让滑块在感知上接近线性。Burley 发现，如果不这样做，大部分可见变化都会挤在滑块的低端。

两条实践规则：`baseColor` 纹理以 sRGB 存储，必须先解码到线性空间再参与光照；所有光照计算都在线性 HDR 数值上进行，最后才做色调映射。

## 7. 基于图像的光照与 split-sum 近似

点光源只是一部分。真实环境从各个方向包围着物体，通常用 HDR 环境贴图 $L_{\text{env}}(\omega)$ 来记录。于是给一个像素着色需要完整的反射积分：

$$
L_o(\omega_o) = \int_{\Omega} f_r(\omega_i,\omega_o)\, L_{\text{env}}(\omega_i)\cos\theta_i\, d\omega_i ,
$$

如果每帧每个像素用几百个样本来算，代价太高。

**漫反射部分。** 对 Lambert 波瓣，$L_o = \frac{c_{\text{diff}}}{\pi}E(n)$，只依赖法线。我们为每个环境预计算一次**辐照度贴图（irradiance map）** $E(n)/\pi$。实践中通常存 9 个球谐（spherical harmonics）系数（Ramamoorthi 与 Hanrahan，SIGGRAPH 2001），或者一张很小的立方体贴图。

**镜面部分。** 镜面积分依赖 $\omega_o$、$n$、粗糙度和 $F_0$，维度太多，无法直接制表。Karis（2013）从重要性采样的蒙特卡洛估计出发，把它拆成两个求和的乘积：

$$
\frac{1}{N}\sum_{k=1}^{N} \frac{L_{\text{env}}(\omega_k)\, f_r(\omega_k,\omega_o)\cos\theta_k}{p(\omega_k)}
\;\approx\;
\left(\frac{1}{N}\sum_{k=1}^{N} L_{\text{env}}(\omega_k)\right)
\left(\frac{1}{N}\sum_{k=1}^{N}\frac{f_r(\omega_k,\omega_o)\cos\theta_k}{p(\omega_k)}\right).
$$

1. **预滤波环境贴图（pre-filtered environment map）。** 第一个因子是用 GGX 波瓣卷积后的环境。Karis 额外用 $\cos\theta_k$ 加权，效果更好。为了让它只依赖反射方向 $r$，我们假设 $n = \omega_o = r$。每个粗糙度级别存一张立方体贴图，利用 mip 链：mip 0 是锐利的镜面，最后一级是最模糊的波瓣。这个假设丢掉了掠射角下被拉长的高光，这是该方法最主要的可见瑕疵。
2. **环境 BRDF（environment BRDF）。** 第二个因子是白光下的镜面方向反照率。使用 Schlick Fresnel 时，$F_0$ 可以从积分中提出来：

$$
\int_{\Omega} f_r\cos\theta_i\, d\omega_i = F_0 \underbrace{\int_{\Omega} \frac{f_r}{F}\left(1-(1-\omega_o\cdot h)^5\right)\cos\theta_i\, d\omega_i}_{A} \; + \; \underbrace{\int_{\Omega} \frac{f_r}{F}(1-\omega_o\cdot h)^5\cos\theta_i\, d\omega_i}_{B} .
$$

$A$ 和 $B$ 只依赖 $(n\cdot\omega_o,\ \text{roughness})$，所以能装进一张很小的双通道二维查找表（lookup table, LUT）。运行时，镜面 IBL 就只是 `prefiltered(r, roughness) * (F0 * A + B)`。

下面是用 NumPy 积分 LUT 的代码。它对 GGX NDF 做重要性采样，与 GPU 烘焙着色器的做法完全相同。由于 $p(h) = D(h)(n\cdot h)$、$p(\omega_i) = p(h)/(4\,\omega_o\cdot h)$，NDF 在权重中被约掉：

```python
import numpy as np

def lambda_ggx(c, alpha):
    return 0.5 * (-1.0 + np.sqrt(1.0 + alpha**2 * (1.0 - c * c) / (c * c)))

def hammersley(n):
    i = np.arange(n, dtype=np.uint32)
    b = i.copy()                                   # radical inverse base 2 (bit reversal)
    b = ((b << 16) | (b >> 16)).astype(np.uint32)
    b = (((b & 0x55555555) << 1) | ((b & 0xAAAAAAAA) >> 1)).astype(np.uint32)
    b = (((b & 0x33333333) << 2) | ((b & 0xCCCCCCCC) >> 2)).astype(np.uint32)
    b = (((b & 0x0F0F0F0F) << 4) | ((b & 0xF0F0F0F0) >> 4)).astype(np.uint32)
    b = (((b & 0x00FF00FF) << 8) | ((b & 0xFF00FF00) >> 8)).astype(np.uint32)
    return (i + 0.5) / n, b * 2.3283064365386963e-10

def integrate_brdf(n_dot_v, roughness, n=4096):
    """Split-sum LUT entry (A, B): int f*cos = F0 * A + B for a Schlick-Fresnel GGX lobe."""
    alpha = roughness * roughness                  # perceptual roughness -> alpha
    v = np.array([np.sqrt(1.0 - n_dot_v**2), 0.0, n_dot_v])
    u1, u2 = hammersley(n)
    # sample h proportional to D(h) (n.h)  (GGX NDF importance sampling)
    cos_h = np.sqrt((1.0 - u1) / (1.0 + (alpha**2 - 1.0) * u1))
    sin_h = np.sqrt(1.0 - cos_h**2)
    phi = 2.0 * np.pi * u2
    h = np.stack([sin_h * np.cos(phi), sin_h * np.sin(phi), cos_h], axis=-1)
    v_dot_h = h @ v
    l = 2.0 * v_dot_h[:, None] * h - v             # reflect v about h
    n_dot_l = l[:, 2]
    ok = n_dot_l > 0.0
    nl, vh, nh = n_dot_l[ok], v_dot_h[ok], cos_h[ok]
    G2 = 1.0 / (1.0 + lambda_ggx(nl, alpha) + lambda_ggx(n_dot_v, alpha))
    # f*cos/pdf with pdf(l) = D (n.h) / (4 v.h):  D cancels
    w = G2 * vh / (nh * n_dot_v)
    fc = (1.0 - vh) ** 5
    return np.sum((1.0 - fc) * w) / n, np.sum(fc * w) / n

if __name__ == "__main__":
    for r in [0.25, 0.5, 1.0]:
        for nv in [0.1, 0.5, 1.0]:
            A, B = integrate_brdf(nv, r)
            print(f"roughness={r:4.2f} n.v={nv:3.1f}  A={A:.3f} B={B:.3f}  A+B={A+B:.3f}")
```

```text
roughness=0.25 n.v=0.1  A=0.510 B=0.391  A+B=0.901
roughness=0.25 n.v=0.5  A=0.955 B=0.033  A+B=0.988
roughness=0.25 n.v=1.0  A=0.996 B=0.000  A+B=0.996
roughness=0.50 n.v=0.1  A=0.747 B=0.140  A+B=0.887
roughness=0.50 n.v=0.5  A=0.834 B=0.022  A+B=0.857
roughness=0.50 n.v=1.0  A=0.916 B=0.000  A+B=0.916
roughness=1.00 n.v=0.1  A=0.737 B=0.024  A+B=0.760
roughness=1.00 n.v=0.5  A=0.448 B=0.003  A+B=0.451
roughness=1.00 n.v=1.0  A=0.307 B=0.000  A+B=0.307
```

$A+B$ 就是 $F_0=1$ 时的白炉反照率，与第 5 节的数值积分一致：粗糙度 1、$n\cdot v = 1$ 时两者都是 0.307。注意，对于光滑表面，Fresnel 增益 $B$ 在掠射角处会增大，这就是真实物体边缘的亮边。Karis 的原始代码在 IBL 中用的是 $k=\alpha/2$ 的 Schlick-GGX 近似 $G$，所以他的 LUT 与这里的高度相关版本略有不同。选定一种 $G$，并在解析光源和 LUT 中统一使用。

## 8. 完整的 GLSL 实现

下面的片元着色器实现了以上全部内容：GGX、高度相关的 Smith 可见性项、Schlick Fresnel、金属度-粗糙度参数化、遵循平方反比定律的点光源，以及 split-sum IBL。它可以作为 GLSL 3.30 编译（如果把版本行改掉并加上 `precision highp float;`，也可以作为 WebGL 2 的 GLSL ES 3.00 编译）。

```glsl
#version 330 core
// Metallic-roughness PBR: GGX + height-correlated Smith + Schlick, plus split-sum IBL.
in vec3 vWorldPos;
in vec3 vNormal;
out vec4 fragColor;

uniform vec3  uCamPos;
uniform vec3  uBaseColor;     // linear RGB
uniform float uMetallic;      // 0 = dielectric, 1 = metal
uniform float uRoughness;     // perceptual roughness in [0, 1]
uniform int   uNumLights;
uniform vec3  uLightPos[4];
uniform vec3  uLightIntensity[4];   // radiant intensity I (W/sr), RGB
uniform samplerCube uIrradianceMap; // E(n)/pi, i.e. cosine-convolved radiance
uniform samplerCube uPrefilterMap;  // GGX-prefiltered radiance, roughness -> mip
uniform sampler2D   uBrdfLut;       // (A, B) indexed by (n.v, roughness)
uniform float uMaxMip;

const float PI = 3.14159265359;

float D_GGX(float NoH, float a) {
    float a2 = a * a;
    float d = NoH * NoH * (a2 - 1.0) + 1.0;
    return a2 / (PI * d * d);
}

// V = G2 / (4 NoL NoV) with the height-correlated Smith G2 for GGX
float V_SmithGGXCorrelated(float NoV, float NoL, float a) {
    float a2 = a * a;
    float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
    float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
    return 0.5 / (gv + gl);
}

vec3 F_Schlick(float VoH, vec3 F0) {
    return F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
}

void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(uCamPos - vWorldPos);
    float NoV = max(dot(n, v), 1e-4);
    float a = max(uRoughness * uRoughness, 1e-3);   // alpha = roughness^2
    vec3 F0 = mix(vec3(0.04), uBaseColor, uMetallic);
    vec3 diffuseColor = (1.0 - uMetallic) * uBaseColor;

    vec3 Lo = vec3(0.0);
    for (int i = 0; i < 4; ++i) {
        if (i >= uNumLights) break;
        vec3 toLight = uLightPos[i] - vWorldPos;
        float dist2 = dot(toLight, toLight);
        vec3 l = toLight * inversesqrt(dist2);
        vec3 h = normalize(v + l);
        float NoL = max(dot(n, l), 0.0);
        if (NoL <= 0.0) continue;
        float NoH = max(dot(n, h), 0.0);
        float VoH = max(dot(v, h), 0.0);

        vec3  F = F_Schlick(VoH, F0);
        vec3  spec = D_GGX(NoH, a) * V_SmithGGXCorrelated(NoV, NoL, a) * F;
        vec3  diff = (1.0 - F) * diffuseColor / PI;
        vec3  E = uLightIntensity[i] * NoL / dist2;  // irradiance from a point light
        Lo += (diff + spec) * E;
    }

    // image-based lighting (split sum)
    vec3 r = reflect(-v, n);
    vec3 prefiltered = textureLod(uPrefilterMap, r, uRoughness * uMaxMip).rgb;
    vec2 AB = texture(uBrdfLut, vec2(NoV, uRoughness)).rg;
    vec3 specIBL = prefiltered * (F0 * AB.x + AB.y);
    vec3 diffIBL = diffuseColor * texture(uIrradianceMap, n).rgb;
    Lo += diffIBL + specIBL;

    fragColor = vec4(Lo, 1.0);   // linear HDR; tone map + sRGB encode in a later pass
}
```

几点细节说明：

- `a` 被钳制到 $10^{-3}$。当 $\alpha=0$ 时，NDF 变成一个点光源永远打不中的 delta，`V` 也会除以零。
- 解析光源按 $f_r \cdot E$ 计算，其中 $E = I\cos\theta/r^2$。这就是渲染方程的积分被 delta 光源坍缩后的结果，也是 PBR 着色器中没有“乘以 $\pi$”这类凑数因子的原因。
- 把粗糙度线性映射到 mip 级别是最简单的选择。引擎通常会用与预滤波烘焙方式相匹配的非线性映射。
- 在生产级引擎中，你还会加上法线贴图（第 3 篇）、环境光与镜面遮蔽，以及第 5 节提到的多次散射补偿。

## 动手试试

[主页实验室]({{ '/' | relative_url }}#lab)里的路径追踪器用的正是这个 GGX 微表面 BRDF，并配合可见法线采样（Heitz 2018）。点击一个球体选中它，然后：

- 在 **diffuse**、**plastic** 和 **metal** 预设之间切换。塑料在彩色漫反射基底上叠加一个 $F_0=0.04$ 的白色波瓣；金属没有漫反射波瓣，反射本身带颜色。
- 拖动 **roughness** 滑块。随着 $\alpha$ 增大，高光变宽变暗，因为 $D$ 的积分固定不变，只是铺展开了。**mirror** 是 $\alpha\to 0$ 的极限。
- 试试 **glass** 和 **frosted**。磨砂玻璃是微表面理论中粗糙*透射*的情形（Walter 等人 2007）。
- 观察墙壁前的粗糙金属球。它看起来比预期略暗，这正是第 5 节测出的单次散射能量损失。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Kajiya, *The Rendering Equation* | SIGGRAPH | 1986 | [DOI](https://doi.org/10.1145/15922.15902) | 把各种渲染算法统一为同一个积分方程的解；提出路径追踪 |
| Cook & Torrance, *A Reflectance Model for Computer Graphics* | ACM TOG 1(1) | 1982 | [DOI](https://doi.org/10.1145/357290.357293) | 沿用至今的 $DFG/(4\cos\cos)$ 微表面 BRDF |
| Trowbridge & Reitz, *Average irregularity representation of a rough surface for ray reflection* | JOSA | 1975 | — | 如今称为 GGX 的分布的起源 |
| Schlick, *An Inexpensive BRDF Model for Physically-based Rendering* | Computer Graphics Forum 13(3) | 1994 | [DOI](https://doi.org/10.1111/1467-8659.1330233) | $(1-\cos)^5$ Fresnel 近似 |
| Walter, Marschner, Li & Torrance, *Microfacet Models for Refraction through Rough Surfaces* | EGSR | 2007 | [DOI](https://doi.org/10.2312/EGWR/EGSR07/195-206) | GGX、一般性的微表面推导、粗糙透射 |
| Burley, *Physically-Based Shading at Disney* | SIGGRAPH 课程 | 2012 | [页面](https://disneyanimation.com/publications/physically-based-shading-at-disney) | 有原则、对美术友好的参数；$\alpha = r^2$ |
| Karis, *Real Shading in Unreal Engine 4* | SIGGRAPH 课程 | 2013 | [课程页面](https://blog.selfshadow.com/publications/s2013-shading-course/) | 实时金属度-粗糙度模型与 split-sum IBL |
| Heitz, *Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs* | JCGT 3(2) | 2014 | [JCGT](https://jcgt.org/published/0003/02/03/) | 严格推导 Smith $G_1$ 与高度相关 $G_2$ |
| Heitz, *Sampling the GGX Distribution of Visible Normals* | JCGT 7(4) | 2018 | [JCGT](https://jcgt.org/published/0007/04/01/) | 低方差的 GGX 采样，所有现代路径追踪器都在用 |
| Kulla & Conty, *Revisiting Physically Based Shading at Imageworks* | SIGGRAPH 课程 | 2017 | — | 针对多次散射的能量补偿 |

## 学习资源

- **GAMES101**（闫令琪）中关于辐射度量学、渲染方程和材质的几讲：[课程主页](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html)。**GAMES202** 讲解实时 PBR 材质、split sum 和多次散射补偿：[课程主页](https://sites.cs.ucsb.edu/~lingqi/teaching/games202.html)。
- **Physically Based Rendering: From Theory to Implementation**（PBRT 第 4 版，可免费在线阅读）：第 4 章讲辐射度量学，[9.6 节讲微表面理论](https://pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory)。
- **Real-Time Rendering** 第 4 版，第 9 章（基于物理的着色）和第 10 章（局部光照与 IBL）：[realtimerendering.com](https://www.realtimerendering.com/)。
- **LearnOpenGL** 的 PBR 章节，一份完整可运行的实现：[Theory](https://learnopengl.com/PBR/Theory) 和 [Specular IBL](https://learnopengl.com/PBR/IBL/Specular-IBL)。
- Google 的 **Filament** 文档，推导详尽、非常清晰的引擎文档：[Physically Based Rendering in Filament](https://google.github.io/filament/Filament.md.html)。
- **Berkeley CS184** 中关于辐射度量学和材质模型的讲座：[cs184.eecs.berkeley.edu](https://cs184.eecs.berkeley.edu/)。

## 练习

1. 解析地证明 $\int_\Omega D_{\text{GGX}}(m)(n\cdot m)\,d\omega_m = 1$。提示：令 $u = \cos^2\theta$。
2. 把 `D_ggx` 扩展为各向异性形式，并在 $\alpha_x=0.2$、$\alpha_y=0.6$ 时数值验证其归一化。
3. 用 Schlick Fresnel 和塑料材质（漫反射 $\rho=1$ 加 $F_0=0.04$ 的镜面）做白炉测试。在使用 $(1-F)$ 耦合时，掠射角下的总反照率会超过 1 吗？不用它呢？
4. 用 `integrate_brdf` 烘焙完整的 $32\times 32$ split-sum LUT，保存为 PNG，并与 LearnOpenGL 中的 LUT 比较。解释由 $G$ 的选择带来的差异。
5. （较难）实现 Kulla-Conty 能量补偿：用 `spec_albedo` 制表得到 $E(\mu)$，计算其余弦加权平均 $E_{\text{avg}} = 2\int_0^1 E(\mu)\,\mu\,d\mu$，并加上波瓣 $f_{\text{ms}} = \frac{(1-E(\mu_o))(1-E(\mu_i))}{\pi(1-E_{\text{avg}})}$。检查白炉测试现在是否返回 1。

**下一篇：** 在[第 5 篇]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})中，我们不再近似，而是用蒙特卡洛路径追踪求解渲染方程：重要性采样、next-event estimation 和多重重要性采样。
