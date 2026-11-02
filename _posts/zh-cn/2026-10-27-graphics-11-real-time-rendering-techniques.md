---
layout: post
title: "实时渲染技术：G-buffer、软阴影、AO、反射、实时全局光照与色调映射"
date: 2026-10-27 09:11:00+0900
description: "16 ms 一帧背后的算法：延迟着色与八面体法线编码、分簇光源剔除、级联与软阴影（PCSS、VSM、EVSM）、SSAO/HBAO/GTAO 及其地平线积分、Hi-Z 屏幕空间反射、光照贴图、SH 辐照度探针、DDGI 与体素锥追踪、时间域历史校正、HDR 色调映射与 sRGB 曲线，以及如何思考 GPU 性能。"
categories: graphics
tags: [real-time, deferred-shading, shadows, ambient-occlusion, global-illumination, tone-mapping]
series: graphics
series_order: 11
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

60 fps 的游戏每帧只有 **16.7 ms**，120 fps 时只有 8.3 ms。这点预算要覆盖几何、阴影、光照、反射、间接光、透明物体、后处理和 UI。[第 03 篇]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})搭建了带基础阴影贴图和 PCF 的前向渲染器；[第 06 篇]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})加入了硬件光线追踪、降噪、ReSTIR、TAA 和学习式超分。本章填补两者之间的空白：介绍*光栅化时代*的经典技术。每个现代引擎至今仍在运行它们，而且常常与光线追踪并用。我们关注的是**算法及其数学**。引擎如何把它们组织进渲染图（render graph）和 GPU 驱动管线，是 [graphics-engine 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}) 的主题；Unreal Engine 5 的 Nanite、Lumen 和虚拟阴影贴图如何封装这些技术，见 [graphics-engine 04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})。

## 前置知识

- 光栅化管线、深度缓冲，以及带偏移和 PCF 的阴影贴图（[第 02 篇]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})、[第 03 篇]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})）。
- 辐射亮度、辐照度、渲染方程与金属度-粗糙度 BRDF（[第 04 篇]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})）。
- 时间累积、重投影与 TAA 基础（[第 06 篇]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})）。
- 第 5.4 节会用到 [第 10 篇]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }}) 的 alpha 合成。

## 1. 延迟渲染一帧的解剖

### 1.1 前向与延迟

**前向**（forward）渲染器在光栅化时就为每个三角形的片元着色：对每个片元遍历所有光源。开销大致是（被着色的片元数，含过度绘制）×（光源数）。**延迟**（deferred）渲染器（源自 Saito 和 Takahashi 1990 年的 “G-buffer” 思想）把一帧分成两步：

1. **几何 pass**：把所有不透明几何体光栅化一次，把着色所需的*输入*写入多个渲染目标，即 **G-buffer**：反照率、法线、粗糙度、金属度、深度等。此时还不做光照。
2. **光照 pass**：对每个像素读取 G-buffer，用第 04 篇的 BRDF 累加每个光源的贡献。

此时着色开销变为（像素数）×（每像素光源数），与过度绘制无关，材质与光源也解耦了。代价是显存带宽和一部分灵活性：

| | 前向 | 延迟 |
| --- | --- | --- |
| 过度绘制的代价 | 每层都要重复着色（深度预 pass 有帮助） | 只重复写 G-buffer |
| 大量光源 | 不做剔除就很贵 | 天然适合，配合分块/分簇剔除很便宜 |
| 透明 | 天然支持 | 需要单独的前向 pass |
| MSAA | 便宜 | 昂贵（每个采样都要 G-buffer），引擎改用 TAA |
| 材质多样性 | 任意着色器 | 受限于 G-buffer 存储的内容 |
| 带宽 | 低 | 高：要写入并读回多个全屏目标 |

{% include blog_figure.liquid path="assets/img/blog/graphics/11-gbuffer.svg" caption="图脚本生成的真实 G-buffer：棋盘格平面上的三个球，用 NumPy 光线投射得到。(a) 反照率，(b) 世界空间法线（以颜色表示），(c) 线性视空间深度，(d) 用八面体编码打包进两个通道的法线，(e) 红色为粗糙度、绿色为金属度（金色球是金属），(f) 延迟光照 pass：只读取 (a)-(e)，用第 04 篇的 GGX BRDF 逐像素计算三个点光源。" %}

**典型布局。** 引擎会把 G-buffer 打包得很紧。一种常见安排是四个 32 位目标加深度：RGBA8 存反照率和 AO，RGB10A2 或 RG16 存法线，RGBA8 存粗糙度、金属度和材质 ID，RG16F 存运动矢量。**数值例子**：在 1920 × 1080 下，这是 $2.07\text{M px} \times 16\ \text{B} = 33\ \text{MB}$，几何 pass 写入一次，光照 pass 再读回一次。在 60 fps 下，还没做任何光照就已经约 4 GB/s。这就是 G-buffer 的大小要一比特一比特地争的原因。

### 1.2 八面体法线编码

单位法线只有两个自由度，存三个浮点数是浪费。**八面体编码**（octahedral encoding，Cigolle 等 2014 年做了综述）先把球面投影到八面体 $\vert x\vert + \vert y\vert + \vert z\vert = 1$ 上，再把下半部分（$z<0$）向外翻折到正方形的四个角：

$$
(u, v) = \begin{cases} (x', y') & z' \ge 0\\ \big((1-\vert y'\vert)\,\mathrm{sgn}\,x',\ (1-\vert x'\vert)\,\mathrm{sgn}\,y'\big) & z' < 0 \end{cases},
\qquad (x',y',z') = \frac{\mathbf{n}}{\vert x\vert+\vert y\vert+\vert z\vert}.
$$

这个映射是连续的，几乎均匀地铺满正方形 $[-1,1]^2$，解码只需几条指令：

```python
import numpy as np

def sgn(x):
    return np.where(x >= 0, 1.0, -1.0)

def oct_encode(n):
    n = n / np.abs(n).sum(-1, keepdims=True)
    x, y, z = n[..., 0], n[..., 1], n[..., 2]
    u = np.where(z < 0, (1 - np.abs(y)) * sgn(x), x)
    v = np.where(z < 0, (1 - np.abs(x)) * sgn(y), y)
    return np.stack([u, v], -1)

def oct_decode(e):
    x, y = e[..., 0], e[..., 1]
    z = 1 - np.abs(x) - np.abs(y)
    t = np.clip(-z, 0, None)                  # fold the corners back to z < 0
    n = np.stack([x - t * sgn(x), y - t * sgn(y), z], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)

n = np.array([0.3, -0.5, -0.81]); n /= np.linalg.norm(n)
e = oct_encode(n)
q = np.round(e * 32767) / 32767               # store as two 16-bit snorm values
err = np.degrees(np.arccos(np.clip(oct_decode(q) @ n, -1, 1)))
print(e, err)                                 # error well below 0.01 degrees
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-octahedral.svg" caption="(a) 八面体映射：正方形中的每一点都解码为一个单位法线（以颜色显示）。内部菱形对应上半球 z > 0，四个角是翻折过来的下半球。(b) 对 200,000 个随机法线量化后的最大角度误差随总比特数的变化：相同比特数下，八面体 (u, v) 与球面角精度相当（球面角甚至略好），但编码和解码都不需要三角函数；三个量化的 xyz 通道要多用约 50% 的比特才能达到相近的误差。" %}

### 1.3 分块与分簇光源剔除

每个像素遍历*所有*光源，无法扩展到数百个光源。每个点光源或聚光灯都有有限的作用范围：一个半径为 $r_\ell$ 的球，球外贡献可以忽略。**分块着色**（tiled shading）把屏幕分成图块（例如 16 × 16 像素），为每个图块建立一张光源列表，收录光源球与该图块子视锥（由图块的最小/最大深度界定）相交的光源，着色时只遍历这张列表。**分簇着色**（clustered shading，Olsson、Billeter 与 Assarsson 2012）还在深度方向上细分。这避免了“深度不连续”问题：横跨前景和背景的图块会同时收集两边的光源。深度切片按指数划分，使簇在透视下大致保持立方体形状：

$$
z_k = z_n \left(\frac{z_f}{z_n}\right)^{k/S},
\qquad
k(z) = \left\lfloor S\,\frac{\ln(z/z_n)}{\ln(z_f/z_n)} \right\rfloor .
$$

**数值例子**：$z_n = 0.1$，$z_f = 1000$，$S = 24$ 个切片。深度 $z = 10$ 的像素落在切片 $\lfloor 24 \cdot \ln 100/\ln 10^4\rfloor = \lfloor 24 \cdot 0.5\rfloor = 12$。像素查找所属簇只需两次除法和一次对数。光源列表每帧在 GPU 上构建一次：用每个光源的球测试每个簇的包围盒。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-clusters.svg" caption="计算得到的分簇光源分配。(a) 视锥被切成 16 × 9 个图块和 16 个按指数间隔的深度切片（灰色轮廓，只显示近处部分），场景中有 30 个点光源（黄色球）；每个点代表至少被一个光源触及的簇，颜色表示光源数量。(b) 俯视图：每个格子按其所在列（所有 y 方向图块）的最大光源数着色，红色圆是光源范围。大多数簇只看到少数几个光源，这正是逐像素循环便宜的原因。" %}

簇网格如何在渲染图中构建和使用，以及 forward+ 和可见性缓冲（visibility buffer）渲染器如何使用同样的列表，见 [graphics-engine 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})。

## 2. 超越基础的阴影

第 03 篇讲了单张阴影贴图、偏移和 PCF。还剩三个问题：大视距下的**分辨率**、随遮挡物距离变宽的**软半影**，以及不产生痤疮（acne）的**滤波**。

### 2.1 级联阴影贴图与切分方案

方向光（太阳）若只用一张阴影贴图覆盖 200 m 视距，相机附近（一个像素只覆盖几毫米）和远处（一个像素覆盖几米）的纹素大小相同。结果就是**透视走样**（perspective aliasing）：近处阴影呈块状。**级联阴影贴图**（cascaded shadow maps，CSM；平行分割阴影贴图，Zhang 等 2006）把视锥切成 $N$ 段深度区间 $[z_i, z_{i+1}]$，每段用一张紧贴该切片的阴影贴图。

切分点放在哪里？考察阴影纹素足迹与屏幕像素足迹之比。覆盖 $[z_i, z_{i+1}]$ 的级联宽度等于视锥在 $z_{i+1}$ 处的宽度，所以纹素大小正比于 $z_{i+1}$；深度 $z$ 处像素的足迹正比于 $z$。分辨率相同时，二者之比约为 $z_{i+1}/z$，在每个级联的近端最差。让所有级联的最差情况相等，就得到**对数**切分，处处的比值都是 $(z_f/z_n)^{1/N}$。**均匀**切分在远处浪费分辨率，近处级联却不够用。**实用切分方案**（practical split scheme）用参数 $\lambda$ 混合两者：

$$
z_i^{\log} = z_n\Big(\frac{z_f}{z_n}\Big)^{i/N},\qquad
z_i^{\text{uni}} = z_n + (z_f - z_n)\frac{i}{N},\qquad
z_i = \lambda\, z_i^{\log} + (1-\lambda)\, z_i^{\text{uni}} .
$$

纯对数切分使第一个级联非常小：相机附近的细节极好，但级联切换频繁。**数值例子**：$z_n = 0.1$，$z_f = 200$，$N = 4$。对数切分为 $0.669, 4.47, 29.9$；均匀切分为 $50.1, 100, 150$；$\lambda = 0.9$ 时为 $5.61, 14.0, 41.9$。

```python
import numpy as np

def csm_splits(n, f, N, lam):
    i = np.arange(N + 1) / N
    return lam * n * (f / n) ** i + (1 - lam) * (n + (f - n) * i)

for lam in [0.0, 0.5, 0.9, 1.0]:
    print(lam, np.round(csm_splits(0.1, 200.0, 4, lam), 3))
# 0.9 -> [  0.1    5.61   14.03   41.92  200.  ]
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-csm-splits.svg" caption="n = 0.1、f = 200、四个级联时的切分。(a) λ 从 0（均匀）到 1（对数）时四段深度区间在对数轴上的分布，标出了切分深度。(b) 纹素与像素足迹之比 z_{i+1}/z 随视深度的变化：均匀切分让最近的几米分辨率不足数百倍，对数切分处处保持 (f/n)^{1/4} ≈ 6.7，λ = 0.9 是折中。" %}

产品级细节包括三点。**稳定化**（stabilization）：把每个级联的投影对齐到整数纹素并保持尺寸不变，使相机移动时阴影不闪烁。级联边界处的**混合**。**样本分布阴影贴图**（sample distribution shadow maps，Lauritzen、Salvi 与 Lefohn 2011）：读取深度缓冲，让级联贴合实际可见的深度范围。

### 2.2 PCF 与百分比渐近软阴影

PCF（Reeves、Salesin 与 Cook 1987；第 03 篇）对多次深度比较的*结果*取平均，把硬边变成一段斜坡。斜坡宽度由滤波核决定，而不是由场景决定。真实的半影来自面光源，并随遮挡物与接收面之间的距离增大：一根杆子的影子在杆脚处锐利，在杆顶处模糊。

**PCSS**（percentage-closer soft shadows，Fernando 2005）分三步逐像素估计半影：

1. **遮挡物搜索**：在搜索区域内，对比接收点更靠近光源的阴影贴图深度取平均，得到 $d_{\text{blocker}}$。
2. **半影估计**：由宽度为 $w_{\text{light}}$ 的光源、遮挡物和接收面之间的相似三角形得到
   $$ w_{\text{penumbra}} = \frac{(d_{\text{receiver}} - d_{\text{blocker}})\, w_{\text{light}}}{d_{\text{blocker}}} . $$
3. **PCF**：滤波核宽度正比于 $w_{\text{penumbra}}$。

**数值例子**：光源宽 0.5 m，遮挡物距光源 8 m，接收面在 10 m 处：$w_p = 2 \times 0.5/8 = 0.125$ m。把遮挡物移到距光源 4 m 处，半影变为 $6 \times 0.5/4 = 0.75$ m。

```glsl
uniform sampler2D uShadowDepth;   // distance from the light, normalized to [0,1]
uniform float uLightSizeUV;       // light width / shadow frustum width
uniform float uNear;              // light near plane, same normalization
const int N = 16;
uniform vec2 uPoisson[N];         // Poisson-disk offsets in the unit disk

float pcss(vec2 uv, float dReceiver) {
    // 1. blocker search
    float searchR = uLightSizeUV * (dReceiver - uNear) / dReceiver;
    float sum = 0.0; int count = 0;
    for (int i = 0; i < N; ++i) {
        float d = texture(uShadowDepth, uv + uPoisson[i] * searchR).r;
        if (d < dReceiver) { sum += d; ++count; }
    }
    if (count == 0) return 1.0;                        // nothing in front: fully lit
    float dBlocker = sum / float(count);
    // 2. penumbra width by similar triangles
    float wPenumbra = (dReceiver - dBlocker) * uLightSizeUV / dBlocker;
    // 3. PCF with that kernel
    float lit = 0.0;
    for (int i = 0; i < N; ++i) {
        float d = texture(uShadowDepth, uv + uPoisson[i] * wPenumbra).r;
        lit += (dReceiver - 0.002 <= d) ? 1.0 : 0.0;
    }
    return lit / float(N);
}
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-pcss.svg" caption="(a) 三种光源尺寸下 PCSS 半影宽度随遮挡物-接收面距离的变化（接收面距光源 10 个单位）：一开始缓慢增长，遮挡物靠近光源时急剧变大。(b) 高度 h = 2（蓝）和 h = 6（红）的直边遮挡物投下的阴影边缘处的可见度：宽 1 个单位的光源可见部分的精确比例（粗淡线）；PCSS（点线）重现了两条斜坡；固定核 PCF（虚线）无论 h 如何都给出同样宽 0.4 的斜坡。" %}

### 2.3 方差与矩阴影贴图

PCF 无法预滤波：不能直接模糊深度图，因为“先平均深度再比较”不等于“先比较再平均”。**方差阴影贴图**（variance shadow maps，VSM；Donnelly 与 Lauritzen 2006）存储深度的前两阶**矩**（moments）$M_1 = E[z]$ 和 $M_2 = E[z^2]$。矩*可以*用 mipmap、可分离模糊和各向异性滤波来过滤。查询时，设滤波区域内均值为 $\mu = M_1$、方差为 $\sigma^2 = M_2 - M_1^2$，单边**切比雪夫（Cantelli）不等式**给出深度不小于 $t$ 的比例的上界，也就是*不*遮挡深度为 $t$ 的接收点的比例：

$$
P(z \ge t) \;\le\; p_{\max}(t) = \frac{\sigma^2}{\sigma^2 + (t-\mu)^2}, \qquad t > \mu .
$$

VSM 把 $p_{\max}$ 当作可见度。对单个平面遮挡物位于平面接收面前方的情形，这个上界是精确的。**数值例子**：滤波核内一半深度为 0.3、一半为 0.7，则 $\mu = 0.5$、$\sigma^2 = 0.04$。接收点恰在第二个面之后、$t = 0.7$ 时，$p_{\max} = 0.04/(0.04+0.04) = 0.5$，完全正确。$t = 0.9$ 时真实值为 0，但 $p_{\max} = 0.04/(0.04+0.16) = 0.2$。这就是**漏光**（light bleeding）：两个遮挡物重叠时方差很大，上界变得宽松。

```python
import numpy as np

def chebyshev(m1, m2, t):
    var = np.maximum(m2 - m1 * m1, 1e-6)
    return np.where(t <= m1, 1.0, var / (var + (t - m1) ** 2))

def evsm(z, t, c=10.0):
    """Exponential VSM: Chebyshev on warped depths exp(c z) and -exp(-c z), take the min."""
    p, n = np.exp(c * z), -np.exp(-c * z)
    return np.minimum(chebyshev(p.mean(), (p * p).mean(), np.exp(c * t)),
                      chebyshev(n.mean(), (n * n).mean(), -np.exp(-c * t)))

z = np.array([0.3, 0.7])                    # depths inside the filter kernel
for t in [0.7, 0.9]:
    print(t, chebyshev(z.mean(), (z * z).mean(), t), evsm(z, t))
# VSM: 0.5 at t = 0.7 (exact), 0.2 at t = 0.9 (bleeding); EVSM is far lower at 0.9
```

补救办法：

- **漏光抑制**：重映射 $p_{\max}$，把小值压成 0，代价是半影变暗。
- **指数阴影贴图**（ESM，Annen 等 2008）：存储 $e^{cz}$。
- **指数方差阴影贴图**（EVSM，出自 Lauritzen 关于分层和扭曲 VSM 的工作）：对扭曲后的矩 $e^{cz}$ 和 $-e^{-cz}$ 分别应用切比雪夫不等式，取较小的上界。这种扭曲压缩了遮挡物相对接收点的深度，使上界紧得多。
- **矩阴影贴图**（moment shadow maps，Peters 与 Klein 2015）：存储四阶矩，并重建与之相容的最紧分布（一个 Hamburger 矩问题），几乎消除了漏光。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-vsm-chebyshev.svg" caption="(a) 滤波区域内一半深度为 0.3、一半为 0.7 时，真实比例 P(z ≥ t)（黑色阶梯）、VSM 切比雪夫上界（橙色）和 c = 10 的 EVSM（绿色）：上界在 t = 0.7 处与真实值相切，但在其后仍然偏高。(b) 一条带上的漏光：遮挡物 A（z = 0.2，阴影区）部分覆盖遮挡物 B（z = 0.5），接收面在 t = 0.6。真实的 PCF 可见度（黑色）在遮挡物下方处处为 0，只有当滤波核到达 B 的边缘 x ≈ 0.75 时才开始上升，但 VSM 在滤波核跨越两个遮挡物的地方漏光；EVSM 抑制了大部分漏光。" %}

### 2.4 接触阴影与虚拟阴影贴图

即使阴影贴图质量很好，也会漏掉小尺度遮挡：杯子与桌面的接触处、褶皱等。**接触阴影**（contact shadows）从每个像素出发，*在屏幕空间中*沿深度缓冲朝光源步进几步；若光线在很短的距离内走到某个表面之后，就把像素标为阴影。这与屏幕空间反射（第 4 节）用的是同一个步进器，只是光线更短。另一个极端是**虚拟阴影贴图**（virtual shadow maps）：每个光源一张巨大的阴影纹理（例如 $16\text{k}\times16\text{k}$），只在可见像素需要的地方按页稀疏分配，方向光还使用 clipmap 层级。它在 Unreal Engine 5 中取代了级联，详见 [graphics-engine 04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})。

## 3. 环境光遮蔽

### 3.1 定义

到达褶皱处某点的环境光会被附近的几何体削弱。**环境光遮蔽**（ambient occlusion，AO）是法线周围半球在半径 $R$ 内*未*被遮挡部分的余弦加权比例：

$$
A(\mathbf{p}) = \frac{1}{\pi}\int_{\Omega} V(\mathbf{p}, \boldsymbol{\omega})\,(\mathbf{n}\cdot\boldsymbol{\omega})\, d\boldsymbol{\omega},
$$

其中，若从 $\mathbf{p}$ 沿 $\boldsymbol{\omega}$ 的光线在 $R$ 内逃逸，则 $V = 1$。$1/\pi$ 使得无遮挡时 $A = 1$。把环境光或间接漫反射光乘以 $A$ 只是近似，因为遮挡物本身也会反射光。但它仍是实时渲染中让物体“落地”最有效的单一效果。

### 3.2 SSAO 与 HBAO

**SSAO**（Mittring 2007，CryEngine 2）只用深度缓冲来估计遮蔽。在每个像素周围半径 $R$ 内取少量随机三维采样点，投影到屏幕上，数一数有多少点位于存储深度*之后*。后来的变体改为在法线方向的半球内采样，使用逐像素随机旋转（噪声）加双边模糊，并增加范围检查，避免远处的前景物体把背景压暗。

**HBAO**（Bavoil、Sainz 与 Dimitrov 2008）把深度缓冲重新解释为高度场。对屏幕空间中的一组方向，它向外步进，找出**地平线角**（horizon angle），即看到高度场的最大仰角。地平线以下全被遮挡，以上全部敞开，所以每个方向一次步进就取代了许多次独立的可见性测试。

### 3.3 GTAO：解出地平线积分

**GTAO**（Jimenez、Wu、Pesce 与 Jarabo 2016）正是用这种切片形式写出 AO 积分，并解析地积掉余弦权重。用屏幕平面内的切片角 $\phi \in [0, \pi)$ 和切片内相对法线的角度 $\theta \in [-\pi/2, \pi/2]$ 来参数化半球。先看法线指向观察者的简单情形，此时 $d\boldsymbol{\omega} = \vert\sin\theta\vert\, d\theta\, d\phi$，

$$
A = \frac{1}{\pi}\int_0^{\pi}\!\int_{-\pi/2}^{\pi/2} V(\phi,\theta)\,\cos\theta\,\vert\sin\theta\vert\, d\theta\, d\phi .
$$

在每个切片中，可见范围位于两条地平线之间，$\theta \in [-h_1, h_2]$，其中 $h_{1,2}$ 从法线量起。记切平面以上的仰角为 $e = \pi/2 - h$，内层积分是初等的：

$$
\int_0^{h}\cos\theta\sin\theta\,d\theta = \frac{\sin^2 h}{2}
\quad\Longrightarrow\quad
a(\phi) = \frac{\sin^2 h_1 + \sin^2 h_2}{2} = \frac{\cos^2 e_1 + \cos^2 e_2}{2},
\qquad A = \frac{1}{\pi}\int_0^{\pi} a(\phi)\,d\phi .
$$

验证：无遮挡时 $e_1 = e_2 = 0$，$a = 1$，$A = 1$。**数值例子**：地平线 $e_1 = 30^\circ$、$e_2 = 10^\circ$ 时，$a = (0.75 + 0.970)/2 = 0.860$。论文把它推广到法线在切片内倾斜的情形（投影法线角进入闭式解），并加入一个廉价的多次反弹修正，使浅色表面的 AO 变亮。每个像素只用一两个切片，按像素和按帧随机旋转，噪声在空间和时间上去除。

```python
import numpy as np

def horizon_ao(h, R=0.08, steps=12, slices=4, rng=None):
    """GTAO-style AO on a height field h (n x n over [0,1]^2), normal assumed +z."""
    n = h.shape[0]
    u = (np.arange(n) + 0.5) / n
    X, Y = np.meshgrid(u, u)
    def look(x, y):
        i = np.clip((y * n).astype(int), 0, n - 1); j = np.clip((x * n).astype(int), 0, n - 1)
        return h[i, j]
    rot = rng.random(h.shape) if rng is not None else 0.0
    A = np.zeros_like(h)
    for k in range(slices):
        phi = np.pi * (k + rot) / slices
        a = 0.0
        for s in (1, -1):                               # the two sides of the slice
            e = np.zeros_like(h)
            for j in range(1, steps + 1):
                r = R * j / steps
                dh = look(X + s * r * np.cos(phi), Y + s * r * np.sin(phi)) - h
                e = np.maximum(e, np.arctan2(dh, r))    # horizon elevation
            a = a + 0.5 * np.cos(e) ** 2
        A += a
    return A / slices

xx, yy = np.meshgrid(np.linspace(0, 1, 128), np.linspace(0, 1, 128))
hill = 0.2 * np.exp(-((xx - 0.5) ** 2 + (yy - 0.5) ** 2) / 0.02)
ao = horizon_ao(hill)
print(ao.min().round(3), ao.max().round(3))           # 0.753 1.0: dark ring at the hill's foot, 1.0 on flat ground
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-ao-horizon.svg" caption="高度场（小丘、一个盒子和一个坑）上的环境光遮蔽。(a) 经过点 p 的一个切片：步进器在两侧采样高度场（圆点），保留最大仰角，即地平线 e₁ 和 e₂；该切片的可见比例为 ½(cos²e₁ + cos²e₂)。(b) 每像素 8 条余弦加权光线的蒙特卡洛估计噪声很大。(c) 64 条光线好一些，但仍有颗粒感。(d) 只用 4 个切片（8 次步进）、逐像素随机旋转的地平线形式，误差已经低于 (c)。RMSE 以 64 个切片的地平线方法为参考计算。" %}

## 4. 屏幕空间反射

**屏幕空间反射**（screen-space reflections，SSR）把已经着色好的画面当作反射光的来源。对每个有光泽表面的像素：

1. 由深度重建视空间位置，把视线向量关于法线反射：$\mathbf{r} = \mathbf{v} - 2(\mathbf{v}\cdot\mathbf{n})\mathbf{n}$。
2. **在屏幕空间中**沿深度缓冲逐步步进反射光线，直到光线的深度落到存储深度之后。
3. 若光线与表面的距离在**厚度** $\Delta$ 以内，则接受这次命中。深度缓冲只存最前面的表面，没有厚度测试的话，每个物体看起来都无限厚。
4. 返回命中处上一帧的颜色（经重投影），并在屏幕边缘淡出。

McGuire 和 Mara（2014）展示了如何用 DDA 在屏幕空间中步进：插值 $1/z$（在透视下它在屏幕空间中是线性的），每个像素恰好访问一次，而不是在三维中步进、在相机附近过度采样。

**层次 Z 追踪。** 步长为 $\Delta x$ 的线性步进，要么步数很多，要么跳过薄物体。**Hi-Z 金字塔**在第 $L$ 层存储 $2^L \times 2^L$ 个像素上的*最小*深度（最近的表面）。追踪器在这棵四叉树中行进：若光线在离开一个粗糙格子之前一直位于该格子最近深度的前方，就跳过整个格子并上升一层；否则前进到光线到达该深度的位置，并下降一层细化。在第 0 层宣布命中。开销随行进距离呈对数增长。Uludag 的章节 *Hi-Z Screen-Space Cone-Traced Reflections*（GPU Pro 5，2014）让这一方法在 SSR 中流行开来。下面是能复现图中结果的一维版本：

```python
import numpy as np

zbuf = np.full(64, 0.9); zbuf[20:24] = 0.55; zbuf[40:52] = 0.62     # 1D depth buffer
pyr = [zbuf]
while len(pyr[-1]) > 1:
    pyr.append(pyr[-1].reshape(-1, 2).min(axis=1))                  # min-depth pyramid

def hiz_trace(x0, z0, slope, pyr, thickness=0.05, max_iter=64):
    lvl, x = 0, x0
    for it in range(max_iter):
        size = 2 ** lvl
        cell = int(x // size)
        if cell * size >= len(pyr[0]):
            return None, it                            # left the screen
        x_exit = (cell + 1) * size
        zmin = pyr[lvl][cell]
        if z0 + (x_exit - x0) * slope < zmin:          # in front of the whole cell: skip, go coarser
            x, lvl = x_exit, min(lvl + 1, len(pyr) - 1)
        else:
            x = max(x, x0 + (zmin - z0) / slope)       # advance to where the ray reaches zmin
            if lvl == 0:
                if z0 + (x - x0) * slope - zmin <= thickness:
                    return x, it                       # hit
                x = x_exit                             # passed behind a thin object
            else:
                lvl -= 1                               # refine
    return None, max_iter

print(hiz_trace(4.0, 0.3, 0.009, pyr))   # (40, 12): hits the front of the box at x = 40 after 12 iterations
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-ssr-march.svg" caption="在一维深度缓冲中做屏幕空间光线步进（灰色：存储深度之后的场景；相机在上方）。(a) 步长 7 像素的线性步进（圆点）跳过了柱子，越过了盒子的背后，需要二分细化才能找到命中点（星号）。(b) 层次 Z：彩色条表示每一层金字塔上访问过的最小深度格子；光线在粗糙层级跳过大片空格子，只在盒子附近细化。" %}

**失败情形**源于深度缓冲只是相机所见的一层：

- 离开屏幕或朝向相机的光线找不到任何东西；
- 背对相机或被其他物体挡住的表面根本不在缓冲里；
- 薄物体要么被漏掉，要么被拖成一片，取决于厚度取值。

因此，引擎会把 SSR 与后备方案混合：反射探针，或第 06 篇中的硬件光线追踪。粗糙表面使用更宽的锥，或者逐像素对 GGX 波瓣做重要性采样，再在空间和时间上滤波。

## 5. 实时全局光照

直接光照是容易的一半。间接光（墙面反弹、颜色渗透、室内的天光）才让画面可信。实时全局光照（GI）是一条从完全预计算到完全动态的光谱。

### 5.1 光照贴图

**光照贴图**（light maps）把静态表面上的入射辐照度预计算到第二套不重叠的 UV 布局中，用离线路径追踪器（如第 05 篇）或 GPU 烘焙器生成。运行时一次纹理读取就能得到完美的柔和间接光，几乎零开销。为了让法线贴图仍然起作用，烘焙器会存储*有方向的*辐照度：每个纹素存一个主方向、低阶 SH 或 H 基（H-basis）。局限在于几何和光源必须是静态的，还要付出显存和烘焙时间。

### 5.2 辐照度探针与球谐函数

对动态物体，以及光照贴图不实用的场景，引擎会在空间中放置**探针**（probes）。每个探针紧凑地存储来自各个方向的辐照度 $E(\mathbf{n})$。漫反射辐照度随方向变化非常平滑，因为它是辐射亮度与截断余弦的卷积。**球谐函数**（spherical harmonics，SH）是它的天然基。

**实球谐函数** $Y_{lm}$ 是球面函数的一组正交归一基，按频带 $l = 0, 1, 2, \dots$ 组织，每个频带有 $2l+1$ 个函数，就像傅里叶级数，$l$ 是角频率。$l \le 2$ 的频带共 9 个函数。对单位向量 $(x, y, z)$，其笛卡尔形式为：

$$
\begin{aligned}
Y_{00} &= 0.282095, \qquad (Y_{1,-1}, Y_{10}, Y_{11}) = 0.488603\,(y,\ z,\ x),\\
(Y_{2,-2}, Y_{2,-1}, Y_{21}) &= 1.092548\,(xy,\ yz,\ xz),\quad Y_{20} = 0.315392\,(3z^2-1),\quad Y_{22} = 0.546274\,(x^2-y^2).
\end{aligned}
$$

把环境辐射亮度 $L(\boldsymbol{\omega})$ **投影**到这组基上得到系数（正交归一性使之成为普通的内积）：

$$
L_{lm} = \int_{S^2} L(\boldsymbol{\omega})\,Y_{lm}(\boldsymbol{\omega})\,d\boldsymbol{\omega},
\qquad L(\boldsymbol{\omega}) \approx \sum_{l\le l_{\max}}\sum_m L_{lm} Y_{lm}(\boldsymbol{\omega}).
$$

**以卷积求辐照度。** 辐照度 $E(\mathbf{n}) = \int L(\boldsymbol{\omega})\max(0, \mathbf{n}\cdot\boldsymbol{\omega})\,d\boldsymbol{\omega}$ 是与截断余弦的卷积。由 Funk-Hecke 定理，与旋转对称的核做卷积，只是把每个频带乘以一个系数。Ramamoorthi 与 Hanrahan（2001）算出了这些系数：

$$
E(\mathbf{n}) = \sum_{l,m} \hat A_l\, L_{lm}\, Y_{lm}(\mathbf{n}),
\qquad \hat A_0 = \pi,\quad \hat A_1 = \frac{2\pi}{3},\quad \hat A_2 = \frac{\pi}{4},\quad \hat A_3 = 0,\quad \hat A_4 = -\frac{\pi}{24},\ \dots
$$

这些系数衰减得很快（$l > 1$ 的奇数 $l$ 为零，偶数 $l$ 按 $l^{-5/2}$ 衰减）。所以即使环境中有锐利的太阳，**每个颜色通道 9 个系数**也能把辐照度的平均误差控制在百分之几。辐射亮度本身则需要多得多的频带。

```python
import numpy as np

def sh9(d):
    x, y, z = d[..., 0], d[..., 1], d[..., 2]
    return np.stack([0.282095 * np.ones_like(x),
                     0.488603 * y, 0.488603 * z, 0.488603 * x,
                     1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1),
                     1.092548 * x * z, 0.546274 * (x * x - y * y)], -1)

A_HAT = np.array([np.pi] + [2 * np.pi / 3] * 3 + [np.pi / 4] * 5)

def project(radiance_fn, n_theta=256, n_phi=512):
    th = (np.arange(n_theta) + 0.5) / n_theta * np.pi
    ph = (np.arange(n_phi) + 0.5) / n_phi * 2 * np.pi
    PH, TH = np.meshgrid(ph, th)
    d = np.stack([np.sin(TH) * np.cos(PH), np.sin(TH) * np.sin(PH), np.cos(TH)], -1)
    dw = np.sin(TH) * (np.pi / n_theta) * (2 * np.pi / n_phi)      # solid angle of each cell
    return np.einsum("ij,ijk->k", radiance_fn(d) * dw, sh9(d))

def irradiance(coef, n):
    return sh9(n) @ (A_HAT * coef)

c = project(lambda d: np.ones(d.shape[:-1]))                      # constant sky, L = 1
print(c[0].round(4), irradiance(c, np.array([0.0, 0.0, 1.0])).round(4))   # 3.5449 3.1416 (= pi)
c = project(lambda d: (d[..., 2] > 0).astype(float))              # sky above, black below
for nz in [1.0, 0.0, -1.0]:
    n = np.array([np.sqrt(1 - nz * nz), 0.0, nz])
    print(nz, irradiance(c, n).round(4), round(np.pi * (1 + nz) / 2, 4))   # matches pi(1+n_z)/2
```

两个检验都有精确答案。常数环境 $L = 1$ 给出 $L_{00} = 4\pi \cdot 0.282095 = 3.5449$，任意法线都有 $E = \pi$。白色上半球给出 $E(\mathbf{n}) = \pi(1 + n_z)/2$。由于它对 $n_z$ 是线性的，$l \le 1$ 的频带就已经能精确重现它。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-sh-irradiance.svg" caption="带天空渐变、暗色地面和一个小而亮的太阳的环境的 SH 辐照度，以经纬度图显示（θ 向下，φ 横向）。(a) 辐射亮度（对数刻度）：太阳是一个小亮点。(b) 暴力积分得到的精确辐照度：宽而平滑的波瓣。(c)-(e) 频带 l ≤ 0、1、2 的 SH 近似（1、4、9 个系数）：l ≤ 2 与 (b) 肉眼无法区分。(f) 相对 RMS 误差：辐照度误差下降很快，l = 3 毫无改进，因为 Â₃ = 0；而在同样的阶数下，辐射亮度本身仍然近似得很差。" %}

下面的小部件让你亲手操作。左边的球由天空、地面和一个圆盘状太阳的精确辐照度照亮，右边的球由其 SH 近似照亮。下方的环境图和同阶 SH 重建表明：*辐射亮度*早早就出现振铃和模糊，*辐照度*却还好好的。

{% include widget.liquid name="graphics-sh-lighting" height="560" caption="SH 光照。在画布上拖动（鼠标或手指）移动太阳；选择 SH 阶数 l_max（0-3）和太阳的角半径（总功率保持不变）。左：精确辐照度；右：频带直到 l_max 的 SH 辐照度。下方：环境辐射亮度及其 SH 重建。阶数为 2 时，即使太阳只有 2°，两个球的差异也在百分之几以内，而重建的环境只是一团带振铃的模糊光斑；阶数 3 对球毫无影响，因为 Â₃ = 0。" %}

**实践中的探针。** 探针放成网格或手工摆放。每个着色点对邻近探针插值（网格中为三线性插值），每个通道用 9 次乘加计算 $E(\mathbf{n})$。运行时更新的探针可以在光源变化时重新打光。经典的失败是**漏光**：墙外的探针照亮了房间内部。

### 5.3 DDGI：光线追踪的辐照度探针

**动态漫反射全局光照**（Dynamic Diffuse Global Illumination，DDGI；Majercik、Guertin、Nowrouzezahrai 与 McGuire 2019）让探针网格完全动态，并且不易漏光：

- 每帧每个探针按固定的光线预算做（硬件）光线追踪，并为命中点着色，着色时也使用上一帧探针在命中点的辐照度，于是多次反弹会随帧累积；
- 结果带滞后（hysteresis，即指数滑动平均）地混合进每个探针的小型**八面体**辐照度纹理（第 1.2 节）；
- 每个探针还按方向存储到几何体的平均**距离**和距离平方。着色时用**切比雪夫测试**（与第 2.3 节 VSM 是同一个不等式）降低可能被遮挡的探针的权重。这挡住了大部分穿墙漏光。

### 5.4 体素锥追踪

**体素锥追踪**（voxel cone tracing，Crassin 等 2011）先把场景体素化进三维纹理（原论文中是稀疏体素八叉树），存储不透明度和直接光照产生的出射辐射亮度，再建立三维 mip 金字塔。从表面点出发、孔径为 $\alpha$ 的**锥**沿其轴线步进追踪。在距离 $t$ 处，锥的直径为 $d = 2t\tan(\alpha/2)$，于是追踪器采样体素尺寸与之匹配的 mip 层级 $\log_2(d/v_0)$，并从前到后累积颜色和不透明度。这正是 [第 10 篇]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }}) 的 alpha 合成。几个宽锥收集漫反射 GI，一个窄锥收集光泽反射。代价是体素化、显存，以及粗糙 mip 层级下光线穿过薄墙的漏光。

### 5.5 SDF 与表面缓存 GI，以及 ReSTIR GI

另外两类方法驱动着当前的引擎：

- 网格的**有向距离场**（signed distance fields，SDF）支持快速的软件光线步进，用于 GI 和阴影。**表面缓存**（surface cache）把光照存储在网格周围简化的 “卡片”（cards）上。两者合起来是 Unreal Engine 5 中 Lumen 的核心，详见 [graphics-engine 04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})。
- 有了硬件光线追踪，**ReSTIR GI** 可以在像素和帧之间重采样一次反弹的间接路径，见 [第 06 篇]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})。

## 6. 深入时间域复用

第 06 篇介绍了 TAA 和时间累积。本章几乎所有效果（SSAO、SSR、PCSS、体积雾、探针）如今都以低采样数*带噪*渲染，再靠复用前几帧来清理。所以值得把这套机制说清楚。

1. **重投影。** 对世界坐标为 $\mathbf{x}$（由深度得到）的像素，它在上一帧的位置是 $$\mathbf{p}_{t-1} = P_{t-1}V_{t-1}\mathbf{x}$$，使用上一帧的视图-投影矩阵。对运动物体，则在几何 pass 中写入**运动矢量**（motion vector）目标，存储每个像素的屏幕空间位移。
2. **去遮挡**（disocclusion）。若上一帧在 $$\mathbf{p}_{t-1}$$ 处的深度或法线对不上（或 $$\mathbf{p}_{t-1}$$ 在屏幕外），说明历史属于另一个表面，必须丢弃。像素随即用更高的混合权重重新开始累积。
3. **累积。** $c_t = \alpha\,x_t + (1-\alpha)\,c_{t-1}$，即指数滑动平均。它的权重大约在 $1/\alpha$ 帧内衰减；达到平衡时，其噪声方差等于 $(2-\alpha)/\alpha$ 帧简单平均的方差：$\alpha = 0.1$ 时为 19 帧。
4. **历史校正。** 光照变化和不完美的重投影仍会留下陈旧的历史，表现为拖影（ghosting）。邻域**截断**（clamping，第 06 篇）把历史限制在当前 3 × 3 邻域的最小-最大包围盒内。**方差裁剪**（variance clipping，Salvi 2016）则用邻域的均值和标准差构造包围盒 $\mu \pm \gamma\sigma$，通常在亮度和色度去相关的 YCoCg 颜色空间中进行。然后它沿指向 $\mu$ 的直线*裁剪*历史，而不是逐通道独立截断，从而避免颜色偏移。邻域有噪声时，这个统计包围盒比最小-最大盒更紧。

```python
import numpy as np

def variance_clip(history, neigh, gamma=1.0):
    """history: (3,) colour; neigh: (k, 3) current-frame neighbourhood (YCoCg recommended)."""
    mu, sigma = neigh.mean(0), neigh.std(0)
    half = gamma * sigma + 1e-6
    d = history - mu
    t = np.max(np.abs(d) / half)            # > 1 means outside the box
    return history if t <= 1 else mu + d / t   # move toward mu until on the box surface

neigh = np.array([[0.4, 0, 0], [0.5, 0, 0], [0.6, 0, 0]] * 3)
print(variance_clip(np.array([0.9, 0.0, 0.0]), neigh))   # [0.5816 0. 0.]  (= 0.5 + 1 sigma)
```

## 7. HDR、曝光与色调映射

### 7.1 线性 HDR 工作流

光照必须在**线性**的辐射度量单位下计算。数值从阴影中的 $10^{-3}$ 到太阳圆盘处的 $10^{5}$ 不等，存储在浮点（RGBA16F）渲染目标中。以 sRGB 创作的纹理在加载时解码为线性（第 03 篇）。最终画面必须塞进显示器的范围，这需要三步：

1. **曝光**：乘以 $2^{EV}$，使场景的中灰落在 0.18 附近。**自动曝光**计算对数平均亮度 $\bar L = \exp\big(\tfrac{1}{N}\sum\ln(\delta + L_i)\big)$（Reinhard 等 2002），或者用忽略最暗和最亮百分之几的亮度直方图，再像人眼一样随时间平滑适应。
2. **色调映射**：一条把 $[0, \infty)$ 压缩到 $[0, 1)$ 的曲线，高光处有柔和的肩部（shoulder），阴影处可选地带一个趾部（toe）。
3. **输出编码**：SDR 显示器用 sRGB 传递函数，HDR10 用 PQ。

### 7.2 色调映射算子

- **Reinhard**：$y = x/(1+x)$，最简单的算子。其*扩展*形式 $y = x(1 + x/L_w^2)/(1+x)$ 把指定的白点 $L_w$ 映射到 1。**数值例子**：中灰 $0.18 \mapsto 0.153$。
- **Filmic（Hable，《Uncharted 2》）**：一条带趾部和肩部的有理曲线，
  $f(x) = \frac{x(Ax + CB) + DE}{x(Ax+B) + DF} - \frac{E}{F}$，
  再用 $f(W)$ 归一化。常数为 $A=0.15$、$B=0.50$、$C=0.10$、$D=0.20$、$E=0.02$、$F=0.30$，白点 $W = 11.2$。
- **ACES**：学院色彩编码系统（Academy Color Encoding System）为电影定义了参考渲染变换和输出变换。游戏常用 Narkowicz（2016）的单行拟合 $y = \frac{x(2.51x + 0.03)}{x(2.43x + 0.59) + 0.14}$，逐通道应用。它的对比度很强，但明亮的饱和色会发生色相偏移并去饱和（饱和的橙色会偏向黄色），因为各通道各自饱和。**数值例子**：$0.18 \mapsto 0.267$。
- **AgX**（在 Blender 4.0 中作为视图变换引入）在精心选择、略微去饱和的工作空间中应用曲线。于是极亮的饱和光源会平滑地过渡到白色，而不是截断成纯色。
- **Khronos PBR Neutral**（2024 年发布）为产品可视化而设计。它在约 0.8 以下保持基础色不变，使材质在中性光照下看起来就是其反照率；然后只压缩高光，并让高光去饱和、趋向白色。

```python
import numpy as np

def reinhard(x): return x / (1 + x)

def hable(x):
    A, B, C, D, E, F, W = 0.15, 0.50, 0.10, 0.20, 0.02, 0.30, 11.2
    f = lambda v: (v * (A * v + C * B) + D * E) / (v * (A * v + B) + D * F) - E / F
    return f(2.0 * x) / f(W)                   # 2.0 = exposure bias used in the original talk

def aces_fit(x):
    return np.clip(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)

def srgb_encode(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * x ** (1 / 2.4) - 0.055)

for f in (reinhard, hable, aces_fit):
    print(f.__name__, np.round(srgb_encode(f(np.array([0.18, 1.0, 4.0, 16.0]))), 3))
print(round(float(srgb_encode(0.18)) * 255))   # 118: middle grey in 8-bit sRGB
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-tonemap-curves.svg" caption="灰色输入下的色调映射曲线。(a) 线性坐标：截断（点线）把 1 以上全部削掉；Reinhard 缓慢逼近 1；扩展 Reinhard 在 L_w = 4 处到达 1；Hable 和 ACES 拟合有趾部和更陡的中间调；PBR Neutral 在约 0.8 以下沿恒等映射走（减去一个 0.04 的小偏移），之后进入肩部。(b) 同样的曲线经 sRGB 编码后画在跨越五个数量级场景亮度的对数轴上；点线标出中灰 0.18。ACES 拟合在中灰附近对比度最强，Reinhard 保留的高光细节最多。" %}

下面的小部件把这些算子应用到一张 HDR 测试图上：六种色相，每种跨越 12 档亮度。注意观察饱和色变亮时会发生什么。

{% include widget.liquid name="graphics-tonemap" height="440" caption="色调映射探索器。图中每一行是一种色相，从中灰以下 6 档渐变到以上 6 档（从左到右）；滑块设置曝光（EV），菜单选择算子。下方曲线显示该算子对灰色输入的响应（虚线：直接截断）。比较截断（色相突然截成黄色和青色）、ACES 拟合（对比强烈，亮红和亮蓝发生色相偏移）和 PBR Neutral（颜色保持不变，然后平滑地过渡到白色）。" %}

### 7.3 sRGB 传递函数与 HDR 输出

显示器和 8 位图像对光并不是线性的。**sRGB** 编码（用于存储和 SDR 输出的 “OETF”）为

$$
V = \begin{cases} 12.92\,L & L \le 0.0031308\\ 1.055\,L^{1/2.4} - 0.055 & L > 0.0031308 \end{cases},
$$

即一段线性趾部接上一条幂曲线。这对曲线接近 $L^{1/2.2}$，但并不相同。它的目的是感知上的：人眼对*相对*变化敏感，所以暗部的码值应该排得更密。8 位线性编码会把大多数码值浪费在高光上，在阴影里出现明显的条带。**数值例子**：中灰 0.18 编码为 $V = 1.055 \cdot 0.18^{1/2.4} - 0.055 = 0.461$，即 255 中的 118；线性存储则是 46。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-srgb.svg" caption="(a) sRGB 编码曲线与纯 2.2 次幂和恒等映射的对比；插图显示 0.0031308 以下的线性段，它避免了 0 处的无穷大斜率。(b) 相邻 8 位码值之间的相对步长 ΔL/L：线性编码在暗部的步长达 10-100%（可见条带），sRGB 在大部分范围内保持在百分之几以内（点线标出 1% 作参考）。" %}

**线性工作流**的规则：

- 在滤波和光照之前解码 sRGB 纹理（对 `*_SRGB` 格式 GPU 会自动完成）；
- 在线性空间中计算光照和混合；
- 在线性空间中做色调映射；
- 只在最后编码一次，或写入 `*_SRGB` 渲染目标，让硬件编码。

在 sRGB 空间中混合，或者把曲线应用两次，就会得到经典的“太暗、太饱和”的观感。

**HDR 输出**替换了最后一步。**HDR10** 使用 **PQ** 传递函数（SMPTE ST 2084），它编码最高 10,000 cd/m² 的*绝对*亮度，配合宽广的 **Rec. 2020** 原色，每通道 10 位。此时渲染器把画面色调映射到显示器的实际峰值亮度（常见为 600-1500 尼特），而不是 1.0。它把工作原色（通常是 Rec. 709/sRGB，有时是 ACEScg 这类更宽的空间）转换到 Rec. 2020，并让 UI 以 “纸白”（paper white）亮度合成。Windows 的 scRGB（线性 FP16、sRGB 原色、允许大于 1 的值）是另一种交换链格式，把 PQ 编码交给操作系统。

## 8. 性能思维

算法决定什么是*可能的*，但能否塞进 16 ms 取决于它们如何使用 GPU。

- **带宽与 ALU（roofline 模型）。** 若一个 pass 的算术强度（每移动一字节的 FLOP 数）低于 GPU 峰值算力与峰值带宽之比，它就是**带宽受限**的，否则是**计算受限**的。**数值例子**：假想一块 20 TFLOP/s、500 GB/s 的 GPU（拐点在 40 FLOP/字节）。一个 1080p 全屏 pass 每像素读 16 字节、做 100 次 FLOP，算术强度约为 6 FLOP/字节，所以是带宽受限的，至少要 $33\ \text{MB}/500\ \text{GB/s} \approx 66\ \mu s$。减半它的 G-buffer 读取有用，优化它的数学则没用。
- **过度绘制。** 着色后又被覆盖的片元是白费的工作。从前到后排序、深度预 pass、延迟着色和可见性缓冲（[graphics-engine 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})）都在对付它。
- **占用率与延迟隐藏。** GPU 靠在大量常驻 warp/wave 之间切换来隐藏访存延迟。占用很多寄存器或共享内存的着色器，常驻的 wave 更少，停顿就会暴露出来。遍历光源或采样的大循环、大型局部数组和发散分支是常见元凶。
- **分辨率与频率。** 许多效果以半分辨率或四分之一分辨率运行（AO、SSR、体积雾、云），再用深度感知的滤波上采样。可变速率着色和时间超分（第 06 篇）更进一步。
- **测量，而不是猜测。** **RenderDoc**（开源、跨 API 的帧捕获：检查每次绘制、每张纹理和管线状态）、**PIX**（Windows 与 Xbox 上的 Direct3D 12，提供 GPU 计时和占用率）、**NVIDIA Nsight Graphics**（硬件计数器，“GPU Trace” 显示哪个单元是瓶颈），以及 AMD 的 Radeon GPU Profiler 和 Xcode 的 Metal 工具。在自己的引擎中为每个 pass 加上时间戳查询，性能回退就能立刻显现。

## 动手试试

- 上面的两个小部件：SH 光照（试试 2° 的太阳，先用阶数 1，再用 2）和色调映射（把曝光推到 +3 EV，先用截断，再用 PBR Neutral）。
- [Interactive Lab]({{ '/' | relative_url }}#lab) 中的路径追踪器展示了收敛后的真值，本章的每一种近似都试图用一小部分时间去模仿它。

## 代表性论文

| 论文 | 发表 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Reeves, Salesin & Cook, *Rendering Antialiased Shadows with Depth Maps* | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37435) | 百分比渐近滤波（PCF） |
| Saito & Takahashi, *Comprehensible Rendering of 3-D Shapes* | SIGGRAPH | 1990 | [DOI](https://doi.org/10.1145/97880.97901) | 延迟着色背后的 G-buffer 思想 |
| Ramamoorthi & Hanrahan, *An Efficient Representation for Irradiance Environment Maps* | SIGGRAPH | 2001 | [DOI](https://doi.org/10.1145/383259.383317) | 9 个 SH 系数重现漫反射光照 |
| Sloan, Kautz & Snyder, *Precomputed Radiance Transfer for Real-Time Rendering in Dynamic, Low-Frequency Lighting Environments* | SIGGRAPH | 2002 | [DOI](https://doi.org/10.1145/566570.566612) | 基于 SH、含阴影和相互反射的预计算传输 |
| Reinhard, Stark, Shirley & Ferwerda, *Photographic Tone Reproduction for Digital Images* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566575) | 对数平均基调，Reinhard 算子 |
| Fernando, *Percentage-Closer Soft Shadows* | SIGGRAPH Sketches | 2005 | [DOI](https://doi.org/10.1145/1187112.1187153) | 遮挡物搜索与半影估计 |
| Donnelly & Lauritzen, *Variance Shadow Maps* | I3D | 2006 | [DOI](https://doi.org/10.1145/1111411.1111440) | 基于矩和切比雪夫不等式的可滤波阴影 |
| Zhang, Sun, Xu & Lun, *Parallel-Split Shadow Maps for Large-Scale Virtual Environments* | VRCIA | 2006 | [DOI](https://doi.org/10.1145/1128923.1128975) | 级联与实用切分方案 |
| Mittring, *Finding Next Gen: CryEngine 2* | SIGGRAPH Courses | 2007 | [DOI](https://doi.org/10.1145/1281500.1281671) | 提出屏幕空间环境光遮蔽 |
| Annen, Mertens, Seidel, Flerackers & Kautz, *Exponential Shadow Maps* | Graphics Interface | 2008 | [GI](https://graphicsinterface.org/proceedings/gi2008/gi2008-20) | 用于可滤波阴影的指数扭曲 |
| Bavoil, Sainz & Dimitrov, *Image-Space Horizon-Based Ambient Occlusion* | SIGGRAPH Talks | 2008 | [DOI](https://doi.org/10.1145/1401032.1401061) | 由深度缓冲求地平线角 |
| Lauritzen, Salvi & Lefohn, *Sample Distribution Shadow Maps* | I3D | 2011 | [DOI](https://doi.org/10.1145/1944745.1944761) | 让级联贴合可见深度范围 |
| Crassin, Neyret, Sainz, Green & Eisemann, *Interactive Indirect Illumination Using Voxel Cone Tracing* | CGF (PG) | 2011 | [DOI](https://doi.org/10.1111/j.1467-8659.2011.02063.x) | 在体素 mip 金字塔中锥追踪实现实时 GI |
| Olsson, Billeter & Assarsson, *Clustered Deferred and Forward Shading* | HPG | 2012 | [DOI](https://doi.org/10.2312/EGGH/HPG12/087-096) | 面向数千光源的三维光源簇 |
| Cigolle, Donow, Evangelakos, Mara, McGuire & Meyer, *A Survey of Efficient Representations for Independent Unit Vectors* | JCGT | 2014 | [JCGT](https://jcgt.org/published/0003/02/01/) | 八面体法线编码及其误差分析 |
| McGuire & Mara, *Efficient GPU Screen-Space Ray Tracing* | JCGT | 2014 | [JCGT](https://jcgt.org/published/0003/04/04/) | 用于 SSR 的透视正确 DDA 步进 |
| Peters & Klein, *Moment Shadow Mapping* | I3D | 2015 | [DOI](https://doi.org/10.1145/2699276.2699277) | 四阶矩，漏光大幅减少 |
| Jimenez, Wu, Pesce & Jarabo, *Practical Realtime Strategies for Accurate Indirect Occlusion* | Activision Tech. Report ATVI-TR-16-01 | 2016 | [报告](https://research.activision.com/publications/archives/atvi-tr-16-01practical-realtime-strategies-for-accurate-indirect-occlusion) | GTAO：解析地平线积分、多次反弹 AO |
| Majercik, Guertin, Nowrouzezahrai & McGuire, *Dynamic Diffuse Global Illumination with Ray-Traced Irradiance Fields* | JCGT | 2019 | [JCGT](https://jcgt.org/published/0008/02/01/) | 带切比雪夫可见性测试的 DDGI 探针 |

另有一些没有论文、但影响深远的演讲和规范：Salvi 的 *An Excursion in Temporal Supersampling*（GDC 2016，提出方差裁剪）；Hable 的 *Uncharted 2: HDR Lighting*（GDC 2010，filmic 曲线）；Narkowicz 的 [ACES filmic tone mapping curve](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/)（2016）；以及 [Khronos PBR Neutral](https://github.com/KhronosGroup/ToneMapping) 规范（2024）。

## 学习资源

- Akenine-Möller、Haines、Hoffman 等，《Real-Time Rendering》第 4 版（2018）：阴影、AO、全局光照和色调映射各章，参考文献详尽。
- **GAMES202**（闫令琪）：高质量实时渲染，涵盖阴影（PCSS、VSM、MSM）、基于 SH 的环境光照、SSAO/SSDO/SSR 和实时 GI，中文授课、英文课件。
- SIGGRAPH **Advances in Real-Time Rendering** 课程存档 [advances.realtimerendering.com](https://advances.realtimerendering.com/)：本章大多数技术最早都是由引擎团队在这里发表的。
- [LearnOpenGL](https://learnopengl.com/)：延迟着色、SSAO、HDR 和 PBR 各章通俗易懂，附代码。
- Google 的 [Filament 文档](https://google.github.io/filament/Filament.html)：一个产品级 PBR 引擎的设计笔记，包括曝光、色调映射和基于图像的光照。
- [RenderDoc](https://renderdoc.org/)：通过捕获帧，学习真实游戏和你自己的渲染器的帧结构。

## 练习

1. 从余弦加权的 AO 定义推导 GTAO 切片积分 $a = \tfrac12(\cos^2 e_1 + \cos^2 e_2)$，然后在第 3 节的高度场上，与 4、16、64 个采样的蒙特卡洛估计做数值比较。

   <details markdown="1"><summary>提示</summary>
   在切片坐标下 $d\boldsymbol{\omega} = \vert\sin\theta\vert\,d\theta\,d\phi$，所以权重是 $\cos\theta\vert\sin\theta\vert = \tfrac12\vert\sin 2\theta\vert$。在每一侧从 0 积分到 $h_i = \pi/2 - e_i$。
   </details>

2. 对 $n = 0.05$、$f = 500$、$N = 4$ 个级联，求使第一个级联在 2 m 处结束的 $\lambda$。每个级联中最差的纹素/像素比是多少？

3. 证明：对覆盖滤波核比例 $f$、位于深度 $z_1$ 的单个平面遮挡物，以及位于深度 $t$ 的接收平面（核的其余部分），VSM 上界是精确的。再说明它在两个遮挡物时在哪里失效。

   <details markdown="1"><summary>提示</summary>
   深度为 $z_1$（比例 $f$）和 $t$（比例 $1-f$）时，计算 $\mu$ 和 $\sigma^2$，代入 $\sigma^2/(\sigma^2 + (t-\mu)^2)$，结果为 $1-f$。两个遮挡物时分布有三个原子，两阶矩已经无法确定它。
   </details>

4. 把 SH 代码扩展到 $l \le 4$ 的频带（25 个系数，使用 $\hat A_4 = -\pi/24$），测量对于半径 1° 的太阳，辐照度误差下降了多少。每个通道多用 16 个系数值得吗？

5. 对一个饱和红色的历史颜色、而当前邻域为灰蓝色的情形，分别在 YCoCg 和 RGB 中实现方差裁剪。比较裁剪后的颜色并解释差异。

   <details markdown="1"><summary>提示</summary>
   在 RGB 中，包围盒在各通道高度相关的空间里与坐标轴对齐，所以会包含邻域中从未出现过的颜色。YCoCg 把亮度与色度去相关，包围盒能更紧地贴合邻域。
   </details>

下一篇：[可微渲染与逆向渲染]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})。它讲如何对我们至今搭建的一切求梯度，以及这如何把渲染变成一个优化问题。
