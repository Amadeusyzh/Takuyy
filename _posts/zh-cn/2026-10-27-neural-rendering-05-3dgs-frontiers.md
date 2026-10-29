---
layout: post
title: "超越 3DGS：高斯泼溅前沿地图"
date: 2026-10-27 12:05:00+0900
description: "对 3D 高斯泼溅之后各方向的结构化综述：抗锯齿、表面、动态场景、压缩、SLAM、前馈重建、生成、重光照、物理、语义以及 AR/VR，给出每个方向的核心思想与代表性论文。"
categories: neural-rendering
tags: [3d-gaussian-splatting, survey, mip-splatting, 2dgs, 4dgs, slam, feed-forward, text-to-3d, physgaussian, vr]
series: neural-rendering
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第 4 篇]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})讲解了原始的 3DGS 方法。它发表后不到一年就出现了数百篇后续工作，如今高斯的用途已远远超出新视角合成（novel view synthesis）：它们被用作机器人的地图、前馈（feed-forward）模型和生成模型的输出、仿真粒子，以及网页和 VR 查看器的内容格式。本文是一张**地图**，而不是一份详尽的清单。对每个方向，本文都会说明它解决了原版 3DGS 的哪一个局限、核心技术思想（往往只是一个公式），以及两三篇值得最先阅读的代表性论文。更多内容请参考本系列末尾的阅读清单。

整理这一领域的一种有用方式，是看一篇论文改变了 3DGS 流水线（pipeline）的哪个部分：

| 流水线阶段 | 改变的内容 | 本文涉及的方向 |
| --- | --- | --- |
| 基元 | 形状、维度、属性 | 表面（2D/扁平高斯）、动态（4D）、语义、重光照 |
| 投影与光栅化 | 滤波、排序、光线追踪 | 抗锯齿、跳变、光线追踪高斯 |
| 优化 | 致密化、正则项、损失 | MCMC 致密化、表面正则项、压缩 |
| 参数从何而来 | 逐场景优化 vs 网络 | SLAM、前馈重建、生成 |
| 之后会发生什么 | 仿真、编辑、显示 | 物理、AR/VR |

下图把同一张表画成一张地图，并在每个阶段下列出本文讨论的代表性论文。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-taxonomy.svg" localized="true" caption="3DGS 流水线的五个阶段（左侧，自上而下）以及改动各阶段的后续工作；右下角的小节编号指出它们在本文中的位置。" %}

## 前置知识

- 完整的 3DGS 方法：协方差、EWA 投影、混合、密度控制（第 4 篇）。
- NeRF 的后续工作（Mip-NeRF、NeRF-W；第 2 篇），以及 K-Planes（第 3 篇）。
- 对于 SLAM 和前馈模型：相机位姿（第 1 篇）以及 Transformer / 扩散模型（diffusion model）的基础知识。

## 1. 抗锯齿：Mip-Splatting

**问题。** 3DGS 在屏幕空间中加入固定的 $0.3\,I$ 膨胀（dilation）（第 4 篇第 2.1 节）。如果在一种分辨率下训练、在高得多的分辨率下渲染（放大），那些在训练时小于一个像素的高斯就会变成细长的高频伪影；如果在较低分辨率下渲染（缩小），膨胀会让一切看起来过粗、过亮，因为它在没有归一化的情况下增加了能量。

**核心思想。** **Mip-Splatting**（Yu, Chen, Huang, Sattler & Geiger, CVPR 2024）使用两个滤波器：

- **3D 平滑滤波器**（3D smoothing filter）根据训练视图的最大采样率来限制每个高斯的频率。对于高斯 $k$，在能看到它的训练相机 $n$ 上取 $\hat\nu_k = \max_n f_n / d_{k,n}$（以像素为单位的焦距除以深度）。高斯与方差为 $s/\hat\nu_k^2$ 的各向同性（isotropic）高斯做卷积，并重新缩放不透明度以保持积分不变：

$$
\Sigma_k \leftarrow \Sigma_k + \frac{s}{\hat\nu_k^{2}}\, I,
\qquad
o_k \leftarrow o_k \sqrt{\frac{\lvert \Sigma_k \rvert}{\lvert \Sigma_k + \frac{s}{\hat\nu_k^{2}} I \rvert}} .
$$

  该滤波器成为高斯本身的一部分，因此从任何视点都会被一致地应用，并且能防止高斯变得比数据所能支撑的更细。
- **2D Mip 滤波器**（2D Mip filter）用一个近似单像素盒式滤波器（box filter）的归一化高斯替代膨胀，即 $\Sigma'_{2D} = \Sigma' + sI$，并把 $o$ 乘以 $\sqrt{\lvert\Sigma'\rvert / \lvert \Sigma' + sI\rvert}$，从而在缩小时模拟对像素面积的积分。

下图对一个在训练分辨率下足迹（footprint）只有 0.2 像素的小高斯计算了两种滤波器，参数与下面代码一致：3D 用 $s = 0.2$，2D 用 $s = 0.1$。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-mip-footprint.svg" localized="true" caption="(a) 一个训练时宽 0.2 像素的高斯在缩小（m < 1）或放大（m > 1）渲染时的屏幕空间尺寸。使用 +0.3 I 膨胀（红色）时，缩小时它始终不小于约 0.55 像素，放大时又和原始高斯一样细；Mip-Splatting（蓝色）在缩小时趋近 1 像素盒式滤波，放大时也不会比训练采样率所允许的更细。(b) 膨胀还会增加能量（m = 1 时为 8.5 倍，缩小时更多），这正是 3DGS 缩小渲染时显得过粗过亮的原因；归一化的 2D Mip 滤波器把它保持为 1。" %}

```python
import numpy as np

def max_sampling_rate(means, cams):
    """nu_k = max over training cameras that see Gaussian k of focal / depth (pixels per world unit)."""
    nu = np.zeros(len(means))
    for R, t, f, W, H in cams:
        Xc = means @ R.T + t
        z = Xc[:, 2]
        u, v = f * Xc[:, 0] / np.maximum(z, 1e-6) + W / 2, f * Xc[:, 1] / np.maximum(z, 1e-6) + H / 2
        visible = (z > 0.2) & (u >= 0) & (u < W) & (v >= 0) & (v < H)
        nu = np.where(visible, np.maximum(nu, f / np.maximum(z, 1e-6)), nu)
    return nu

def smooth_3d(Sigma, opacity, nu, s=0.2):
    """Mip-Splatting 3D smoothing: convolve each Gaussian with an isotropic Gaussian of
    variance s / nu^2 and rescale opacity so that the integral stays the same."""
    add = (s / np.maximum(nu, 1e-6) ** 2)[:, None, None] * np.eye(3)
    Sigma_f = Sigma + add
    scale = np.sqrt(np.linalg.det(Sigma) / np.linalg.det(Sigma_f))
    return Sigma_f, opacity * scale

def mip_filter_2d(cov2d, opacity, s=0.1):
    """Replace 3DGS's '+0.3 I' dilation by a normalized 2D filter approximating a 1-pixel box."""
    cov_f = cov2d + s * np.eye(2)
    return cov_f, opacity * np.sqrt(np.linalg.det(cov2d) / np.linalg.det(cov_f))
```

Mip-Splatting 相当于 3DGS 版的 Mip-NeRF 积分位置编码（integrated positional encoding）：两者都把点采样替换为考虑足迹、经过低通处理的采样。它的代价很低，并且作为一个选项实现在 gsplat 中；只要渲染结果会在与采集时不同的分辨率下观看（这在 VR 中是常态），就值得考虑启用它。

## 2. 表面与几何

**问题。** 3DGS 优化的是外观，而不是几何。它的高斯是体积性的团块，其沿光线的深度没有明确定义，法线也不存在；在不透明度上用 Marching Cubes 提取网格，得到的表面充满噪声且凹凸不平。而机器人、物理和编辑都需要表面。

**核心思想。**

- **SuGaR**（Guédon & Lepetit, CVPR 2024）加入一个正则项，促使高斯变得扁平并在表面上分布良好，从而使表面附近的密度可以用一个类似 SDF 的函数来近似。随后从水平集（level set）的采样点出发，用泊松重建（Poisson reconstruction）提取网格，并把新的高斯绑定到网格三角形上进行联合精修，得到一种可编辑、可驱动动画的混合表示。
- **2D 高斯泼溅**（2D Gaussian Splatting）（Huang, Yu, Chen, Geiger & Gao, SIGGRAPH 2024）把每个基元压缩成一个有朝向的平面圆盘（即**面元**，surfel），它有两个切向量 $\mathbf t_u, \mathbf t_v$ 和两个尺度 $s_u, s_v$。圆盘上的点为 $P(u,v) = \mathbf p_k + s_u \mathbf t_u u + s_v \mathbf t_v v$，法线为 $\mathbf t_u \times \mathbf t_v$；它不再使用 EWA 线性化，而是让每个像素的光线与圆盘所在平面精确**求交**，从而得到透视正确、视角一致的深度。两个正则项使其具备几何感知能力：一个是深度畸变损失（depth-distortion loss，来自 Mip-NeRF 360），使权重沿每条光线集中；另一个是法线一致性损失（normal-consistency loss），使泼溅的法线与由渲染深度图计算出的法线对齐。网格通过对渲染深度做 TSDF 融合来提取。
- **高斯不透明度场**（Gaussian Opacity Fields，GOF）（Yu, Sattler & Geiger, ACM TOG / SIGGRAPH Asia 2024）通过光线与高斯的求交，直接从 3D 高斯定义出一个连续的不透明度场，并在由高斯导出的网格上用 Marching Tetrahedra 把表面提取为水平集，这样既能处理无界场景，又能根据细节自适应调整分辨率。

下图把这一差别具体化：两台相机观察同一个基元上的同一些点。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-surfel-vs-ellipsoid.svg" caption="左：对于一个薄的 3D 高斯，光线上的深度取在高斯沿该光线的峰值处（闭式解 $t^* = \mathbf d^\top\Sigma^{-1}(\boldsymbol\mu-\mathbf o) / \mathbf d^\top\Sigma^{-1}\mathbf d$）。橙色和青色相机瞄准同一点的光线在不同的 3D 位置达到峰值（黑色线段），因此深度依赖于视角。右：2DGS 面元，切向量为 $s_u\mathbf t_u$、$s_v\mathbf t_v$，法线为 $\mathbf n$；每条光线都与其平面精确求交，两台相机得到同一个点。" %}

一般性的经验是：如果需要几何，就选择深度和法线有良好定义的基元（扁平高斯或圆盘），并加入几何正则化。2DGS 风格的面元已成为建图和机器人流水线中的常见选择。

## 3. 动态场景

**问题。** 3DGS 假设场景是静态的。对于运动的人、物体或可变形场景，我们需要让高斯随时间变化，同时保持一致性，数据来源可以是多视角视频，甚至是单目视频。

下图展示了这对基元本身意味着什么：每个高斯保持其身份，并随时间沿一条轨迹运动。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-dynamic-trajectories.svg" caption="作用在规范空间（canonical space）高斯上的一个玩具形变场（一根弯曲的柱子）：曲线是各高斯中心的轨迹，颜色从 t = 0（紫）到 t = 0.5（黄）；椭球是同一批高斯在 t = 0、0.25、0.5 时的样子，并随局部形变旋转。逐帧跟踪直接优化这些位置和旋转，形变网络则由 (x, t) 预测它们。" %}

主流设计有四种：

1. **逐帧跟踪。** **Dynamic 3D Gaussians**（Luiten, Kopanas, Leibe & Ramanan, 3DV 2024）固定颜色、不透明度和大小，在每个时间步优化每个高斯的位置和旋转，并在相邻高斯之间施加**局部刚性**（local rigidity）正则项。作为副产品，场景中每个元素的稠密 6 自由度（6-DoF）跟踪自然涌现，无需任何对应关系或光流监督。
2. **规范空间 + 形变网络。** **Deformable 3D Gaussians**（Yang et al., CVPR 2024）在规范空间（canonical space）中学习高斯，并学习一个 MLP $\mathcal F_\theta(\gamma(\mathbf x), \gamma(t)) \mapsto (\delta\mathbf x, \delta\mathbf r, \delta\mathbf s)$ 在时间 $t$ 对它们进行形变，在单目视频上训练。
3. **规范空间 + 因式分解场。** **4D 高斯泼溅**（4D Gaussian Splatting）（Wu et al., CVPR 2024）用 HexPlane 风格的分解（在 $xy, xz, yz, xt, yt, zt$ 上的六个特征平面，与第 3 篇的 K-Planes 相同）加一个极小的解码器取代 MLP，速度更快、更紧凑；论文报告了实时渲染（在合成数据上 $800\times800$ 分辨率下 82 fps）。
4. **原生 4D 基元。** 在 "Real-time Photorealistic Dynamic Scene Representation and Rendering with 4D Gaussian Splatting"（Yang et al., ICLR 2024）中，每个基元都是 $(x, y, z, t)$ 上的一个高斯。在时间 $t$ 渲染时，以 $t$ 为**条件**对其取条件分布，得到一个 3D 高斯，其均值随时间线性移动，其不透明度由时间边缘分布调制：

$$
\boldsymbol\mu_{xyz\mid t} = \boldsymbol\mu_{1:3} + \Sigma_{1:3,4}\,\Sigma_{4,4}^{-1}(t - \mu_4),
\qquad
\Sigma_{xyz\mid t} = \Sigma_{1:3,1:3} - \Sigma_{1:3,4}\,\Sigma_{4,4}^{-1}\,\Sigma_{4,1:3},
\qquad
p(t) \propto \exp\!\Big(-\tfrac{(t-\mu_4)^2}{2\Sigma_{4,4}}\Big).
$$

```python
def slice_4d(mu4, Sigma4, t):
    """Condition a 4D (x, y, z, t) Gaussian on time t: returns the 3D mean, 3D covariance and the
    temporal marginal p(t) (unnormalized), as in native 4D Gaussian splatting."""
    S11, S12, S22 = Sigma4[:3, :3], Sigma4[:3, 3], Sigma4[3, 3]
    mu3 = mu4[:3] + S12 / S22 * (t - mu4[3])
    Sigma3 = S11 - np.outer(S12, S12) / S22
    p_t = np.exp(-0.5 * (t - mu4[3]) ** 2 / S22)
    return mu3, Sigma3, p_t
```

下图对一个 $x$ 与 $t$ 相关的 4D 高斯运行 `slice_4d`。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-4d-slice.svg" caption="上：x 与 t 相关系数为 0.9 的 4D 高斯在 $(x,t)$ 上的边缘分布，彩色横线是切片所取的时刻。下：`slice_4d` 得到的一维切片。均值沿虚线线性移动（速度为 $\Sigma_{x,t}/\Sigma_{t,t}$），条件宽度保持不变（0.26，而边缘分布为 0.6），峰值 $p(t)$ 在远离 $\mu_t = 0.5$ 时衰减，因此该基元会出现、移动、再消失。" %}

相关设计还包括 **Spacetime Gaussians**（Li et al., CVPR 2024），它使用多项式运动与旋转、时间径向基（radial-basis）不透明度，并用神经特征代替 SH；以及带关节或绑定骨骼的模型，例如 **GaussianAvatars**（Qian et al., CVPR 2024），它把高斯附着在参数化人脸模型的三角形上，使表情和头部姿态能直接驱动它们。单目动态重建仍然很困难：单个运动相机无法约束快速的非刚性运动，因此最好的系统会加入来自基础模型（foundation model）的先验，例如深度、光流或点轨迹。

## 4. 压缩与效率

**问题。** 一个 3DGS 场景往往占用数百 MB 乃至超过 1 GB，其中大部分是 48 个 SH 系数，并且包含大量冗余的高斯。这对于流式传输、移动端和 VR 来说都太大了。

下图统计了未压缩的 float32 属性中这些字节都花在了哪里。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-memory.svg" localized="true" caption="上：使用 float32 时每个高斯的字节数（均值 3、尺度 3、四元数 4、不透明度 1，再加上 L 阶 SH 的 3(L+1)^2 个系数）。在 3 阶时，48 个 SH 系数占 236 字节中的 192 字节，这正是把 SH 蒸馏到更低阶数很划算的原因。下：文件大小随高斯数量线性增长，大约 420 万个高斯时超过 1 GB。" %}

可用的工具，大致按激进程度排列：

- **按重要性剪枝。** 根据每个高斯对训练视图的贡献（例如在所有像素上累积的 $\alpha_i T_i$）给它打分，并移除最无用的那些。**LightGaussian**（Fan et al., NeurIPS 2024）把这种剪枝与降低阶数的 **SH 蒸馏**（SH distillation）以及向量量化（vector quantization）结合起来，报告平均约 15 倍的压缩率，同时帧率更高。
- **学习的掩码与码本。** **Compact 3D Gaussian Representation**（Lee et al., CVPR 2024）学习一个在训练中移除高斯的掩码，把随视角变化的颜色存储在哈希网格中而不是逐高斯的 SH 中，并对几何属性做向量量化。
- **结构化锚点。** **Scaffold-GS**（Lu et al., CVPR 2024）存储带特征的稀疏锚点（anchor），并用以视线方向和距离为条件的小型 MLP 即时解码出局部高斯。它更紧凑，对视角相关效果也更鲁棒。
- **熵编码。** **HAC**（Chen et al., ECCV 2024）建立在 Scaffold-GS 之上，用二值化的哈希网格作为上下文来建模锚点属性的分布以进行熵编码（entropy coding），报告相对原版 3DGS 超过 75 倍的体积缩减。

实用格式也随之出现：SuperSplat 和 Spark 等查看器除了原始的 `.ply` 之外，还能读取压缩格式（例如 SPZ 和 SOG）。在速度方面，主要技巧是更少的高斯（MCMC 风格的预算、剪枝）、更低的 SH 阶数，以及光栅化器中更好的负载均衡。

## 5. 渲染质量与正确性

有几篇论文修正了渲染器本身的局限：

- **跳变（popping）。** 在每个图块内按高斯中心排序，会在旋转时导致顺序突变。**StopThePop**（Radl et al., ACM TOG / SIGGRAPH 2024）用分层光栅化器近似逐像素排序，平均只增加约 4% 的开销，并发现强制一致性后可以把高斯数量减半。这在头部不断转动的 VR 中最为重要。
- **光线追踪。** **3D Gaussian Ray Tracing**（Moenne-Loccoz et al., SIGGRAPH Asia 2024）把高斯包裹在 BVH 中的包围基元里，并用硬件光线追踪来追踪光线，从而支持畸变相机（鱼眼、卷帘快门）、用于反射和阴影的次级光线，以及精确的逐光线排序，代价是一定的速度损失。
- **致密化（densification）。** **3D Gaussian Splatting as Markov Chain Monte Carlo**（Kheradmand et al., NeurIPS 2024）把高斯解释为样本，把更新解释为随机梯度朗之万动力学（stochastic gradient Langevin dynamics），用对“死亡”高斯的重新放置和固定预算取代了克隆/分裂的启发式规则，对初始化更加鲁棒。

## 6. SLAM：把高斯当作地图

**问题。** 机器人或头显需要在位姿未知的情况下，从帧流中*在线*完成定位与建图。经典的稠密 SLAM 使用 TSDF 体积、面元或神经场；高斯则提供了照片级真实、可微的地图，可以在几毫秒内从任意位姿渲染。

**核心思想。** 交替进行**跟踪**（tracking）和**建图**（mapping）：跟踪时冻结地图，通过最小化输入帧与地图渲染结果之间的光度（以及深度）误差来优化当前相机位姿；建图时冻结位姿，在关键帧上优化高斯，同时在地图不完整的地方加入新的高斯。可微光栅化使这两个步骤都可以基于梯度进行。

下图是这一循环在一个玩具例子中的俯视图。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-slam.svg" localized="true" caption="玩具 SLAM 运行的俯视图（x 向右，z 向前）：相机（橙色方块，视锥按时间着色）扫过一个房间。每个墙面点按其首次加入地图的时间着色，灰色点尚未被看到。跟踪在冻结的地图上估计每个新位姿，建图则在渲染轮廓较低处加入高斯，因此地图沿着扫描方向逐渐增长。" %}

- **SplaTAM**（Keetha et al., CVPR 2024）面向 RGB-D 输入。它渲染一张**轮廓图**（silhouette，即累积不透明度），以确定当前地图能够解释哪些像素，只用这些像素进行跟踪，并在轮廓值较低或在地图前方出现新几何的地方进行致密化。它使用简化的各向同性、与视角无关的高斯。
- **Gaussian Splatting SLAM / MonoGS**（Matsuki, Murai, Kelly & Davison, CVPR 2024）是第一个可以使用**单目**（monocular）相机工作的方法（并可扩展到 RGB-D）。它在李群（Lie group）$SE(3)$ 上推导出渲染相对于相机位姿的解析雅可比矩阵，通过正则化使高斯保持各向同性以实现稳定的增量建图，并管理一个关键帧窗口。

对于具身智能（embodied AI）而言，这是一座关键的桥梁：高斯地图同时是定位地图、机器人相机的照片级真实模拟器，并且在加上语义特征之后（第 10 节）还是一种可查询的场景表示。

## 7. 前馈重建

**问题。** 逐场景优化需要几分钟，而且需要许多带位姿的视图。网络能否只用一次前向传播，从少量图像中预测出高斯？

**核心思想。** 预测**像素对齐的高斯**（pixel-aligned Gaussians）：对于每个输入视图的每个像素，网络输出沿该像素光线的深度（从而得到 3D 均值）、协方差、不透明度和颜色。训练使用大规模多视角数据集，在留出的目标视图上采用与 3DGS 相同的渲染损失。

下图展示了一个输入视图中像素对齐高斯的几何关系。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-pixel-aligned.svg" caption="左：12 x 9 输入视图的每个像素 (u, v) 发出一条光线，预测深度 $z_{uv}$ 把一个高斯放在 $z_{uv}K^{-1}(u,v,1)^\top$ 处：橙色落在球面上，蓝色落在其后的墙上。右：pixelSplat 风格的单像素深度桶（depth bucket）分布示例，取自一个球面像素，墙面处有一个较小的第二峰；高斯均值从该分布中采样，而不是直接回归。" %}

- **pixelSplat**（Charatan, Li, Tagliasacchi & Sitzmann, CVPR 2024）从一个**图像对**重建场景。一个极线 Transformer（epipolar transformer）用于解决尺度问题；网络并不直接回归深度，而是预测深度区间上的概率分布并从中采样高斯均值，借助重参数化技巧（reparameterization trick）让梯度流向这些概率。
- **MVSplat**（Chen et al., ECCV 2024）构建一个**平面扫描代价体**（plane-sweep cost volume，即第 1 篇中多视图立体的可学习版本）来定位高斯中心，这种方法更具几何性；据报告，它的参数量比 pixelSplat 少 10 倍，运行速度快 2 倍以上。
- **大型重建模型**（large reconstruction model）这条路线用 Transformer 把这一思路扩展到更大规模。**LRM**（Hong et al., ICLR 2024）用一个在约一百万个物体上训练、拥有 5 亿参数的 Transformer，从单张图像预测三平面（triplane）NeRF；**GS-LRM**（Zhang et al., ECCV 2024）把带位姿的图像切分为图块（patchify），在所有 token 上运行 Transformer，并解码出逐像素的高斯；**LGM**（Tang et al., ECCV 2024）用一个非对称 U-Net 在几秒钟内把四个视图（由多视角扩散模型生成）映射为高斯。

无位姿（pose-free）变体把这些思想与 DUSt3R/MASt3R/VGGT 风格的几何网络（第 1 篇）结合起来，使未标定位姿的照片可以直接变成泼溅。前馈重建也越来越多地成为构建 3D 世界生成的方式：生成器产生图像或视频，再由重建网络把它们提升为高斯。

## 8. 生成：从文本和图像到高斯

**问题。** 在没有采集数据的情况下创建 3D 内容。

**核心思想 1：分数蒸馏。** DreamFusion（第 2 篇）优化一个 3D 表示 $\theta$，使其渲染结果 $\mathbf x = g(\theta)$ 在一个冻结的文本到图像扩散模型 $\hat{\boldsymbol\epsilon}_\phi$ 看来是合理的，所用的是**分数蒸馏采样**（score distillation sampling，SDS）梯度

$$
\nabla_\theta \mathcal L_{\text{SDS}} = \mathbb E_{t, \boldsymbol\epsilon}\Big[ w(t)\,\big(\hat{\boldsymbol\epsilon}_\phi(\mathbf x_t; y, t) - \boldsymbol\epsilon\big)\, \frac{\partial \mathbf x}{\partial \theta} \Big],
$$

其中 $\mathbf x_t$ 是噪声水平 $t$ 下加噪后的渲染结果，$y$ 是提示词。作为 $\theta$，高斯比 NeRF 快得多：**DreamGaussian**（Tang et al., ICLR 2024）在高斯上运行 SDS 并逐步致密化，然后提取带纹理的网格并精修其 UV 纹理，几分钟内即可生成资产。**GaussianDreamer**（Yi et al., CVPR 2024）用 3D 扩散模型的粗略输出初始化高斯，再用 2D 扩散对其精修，将 3D 一致性与 2D 细节结合起来。

**核心思想 2：先生成视图，再重建。** 多视角扩散模型生成一组一致的视图，再由前馈模型（LGM、GS-LRM，第 7 节）把它们转换为高斯。这种方式更快，也避免了 SDS 的过饱和问题，并且可以扩展到场景：视频或全景生成器加上重建，就能产生可探索的高斯世界——这正是 World Labs 的 Marble 等产品背后的思想，而主页上的“高斯世界”演示则以程序化方式对其进行了模仿。

## 9. 重光照与逆渲染

**问题。** 3DGS 把采集时的光照烘焙进 SH 颜色中，因此采集到的物体无法被放到新的光照下，而这恰恰是 AR 和内容创作所需要的。

**核心思想。** 为每个高斯赋予**基于物理的属性**（physically based attributes：法线、反照率、粗糙度、金属度），并显式地建模光照（环境贴图加可见性），然后用可微的着色模型进行渲染——本质上就是 PBR 那篇文章中的 BRDF 机制，在每个高斯上或在延迟渲染（deferred）阶段的每个像素上求值。难点在于法线（高斯没有法线，因此要从最短轴或渲染深度推导）和可见性。

- **Relightable 3D Gaussians**（Gao et al., ECCV 2024）为每个高斯附加法线、BRDF 参数和入射光照，用基于物理的可微渲染对它们进行分解，并在高斯的 BVH 上通过**基于点的光线追踪**（point-based ray tracing）计算可见性，从而实现带阴影的重光照。
- **GS-IR**（Liang et al., CVPR 2024）用渲染深度正则化法线，并把**遮挡烘焙**（bake occlusion）到一个体积中以近似间接光照，在未知光照下恢复几何、材质和光照。

“高斯世界”演示走的是相反的路线：它的高斯是带着反照率和法线生成出来的，而不是从照片反演得到的，因此从构造上就可以在一天中的任意时刻对其进行重光照。

## 10. 物理、语义与编辑

**物理。** 高斯就是粒子，因此可以对它们进行仿真。**PhysGaussian**（Xie et al., CVPR 2024）把每个高斯视为物质点法（Material Point Method，MPM）连续体仿真中的一个粒子。当材料以局部形变梯度（deformation gradient）$\mathbf F$ 发生形变时，协方差也随之相应形变，

$$
\Sigma_t = \mathbf F_t\, \Sigma_0\, \mathbf F_t^\top ,
$$

并且 SH 系数会按 $\mathbf F_t$ 的旋转部分进行旋转，从而无需转换为网格即可做到“所见即所仿真”。**VR-GS**（Jiang et al., SIGGRAPH 2024）构建了一个交互式 VR 系统，把高斯嵌入用 **XPBD**（extended position-based dynamics，扩展的基于位置的动力学）仿真的四面体笼（tetrahedral cage）中以实现实时操作，并支持分割、修补（inpainting）和阴影。[交互实验室]({{ '/' | relative_url }}#lab)中的 XPBD 布料演示使用的是同一类求解器。

下图把这一规则作用于一排在弯曲加剪切形变下的高斯。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-physgaussian.svg" caption="左：未形变网格上的高斯（2-sigma 椭圆）。右：同一批高斯在弯曲加剪切的形变 $\phi$ 之后；每个中心随 $\phi$ 移动，每个协方差变为 $\mathbf F\Sigma_0\mathbf F^\top$，其中 $\mathbf F = \partial\phi/\partial\mathbf x$ 在该中心处计算，因此椭圆随网格线一起拉伸和旋转。" %}

**语义。** 给高斯附加特征可以让场景变得可查询。**LangSplat**（Qin et al., CVPR 2024）通过一个场景专用的自编码器（autoencoder），把按 SAM 的层级掩码组织的 CLIP 语言特征蒸馏到逐高斯的隐特征中，从而实现开放词汇（open-vocabulary）的 3D 查询（“马克杯在哪里？”），速度比基于 NeRF 的语言场快得多。这正是机器人可以用来把指令落地到 3D 地图中的表示。

**编辑。** 由于高斯是显式的，选择、删除、变换和合成都很直接，SuperSplat 等工具以交互方式提供了这些功能。基于扩散引导的编辑方法则可以用文本指令修改外观或几何。

## 11. AR 与 VR

**为什么高斯适合 XR。** 它们能用简单的光栅化器以高帧率渲染照片级真实的采集结果，可以在浏览器和一体机头显上运行，并且不需要网格化或纹理烘焙。

**XR 的难点在哪里。**

- **帧预算。** 在移动 GPU 上以每只眼睛 72–120 Hz 进行立体渲染，只给数百万个高斯留下几毫秒的时间，还要再加上排序。因此压缩、高斯预算（第 4 节）以及细节层次（level of detail）流式传输必不可少；Spark（World Labs）等网页渲染器如今已能在桌面、移动端和 VR 上以细节层次流式传输大型泼溅场景。
- **伪影更加明显。** 头部持续运动下的跳变（第 5 节）、观看者靠得比采集时更近时的走样（第 1 节），以及双眼之间不一致的深度，都会破坏沉浸感。Mip 滤波和一致的排序对此有帮助。
- **注视点渲染（foveated rendering）。** 在周边视野中渲染更少或更大的高斯，可以利用视敏度随偏心率下降的特性；其背后的思想可参见实验室中的注视点渲染演示。
- **交互与重光照。** 把虚拟物体放进采集到的房间，需要一致的光照（第 9 节）、来自准确深度的遮挡（第 2 节）和物理（第 10 节）；VR-GS 是把这些结合在一起的一个很好的例子。

对于与人机交互（HCI）交叉的研究而言，开放问题包括：VR 中泼溅的感知质量指标、用于选择和编辑数百万个软基元的交互技术，以及引导用户获得良好覆盖的采集界面（第 6 篇）。

## 动手试试

[交互实验室]({{ '/' | relative_url }}#lab)与本文的多个小节相关：高斯世界（渲染，以及用程序化替代方案实现的生成，第 8 节；可重光照的高斯，第 9 节）、XPBD 布料（VR-GS 所用的物理方法家族，第 10 节）和注视点渲染（第 11 节）。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Mip-Splatting: Alias-free 3D Gaussian Splatting (Yu et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.16493) | 3D 平滑 + 2D Mip 滤波器 |
| SuGaR: Surface-Aligned Gaussian Splatting (Guédon & Lepetit) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.12775) | 网格提取与绑定到网格的高斯 |
| 2D Gaussian Splatting for Geometrically Accurate Radiance Fields (Huang et al.) | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2403.17888) | 光线与泼溅精确求交的面元 |
| Gaussian Opacity Fields (Yu, Sattler & Geiger) | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2404.10772) | 无界场景中的水平集表面 |
| Dynamic 3D Gaussians (Luiten et al.) | 3DV | 2024 | [arXiv](https://arxiv.org/abs/2308.09713) | 逐帧高斯，稠密跟踪 |
| Deformable 3D Gaussians (Yang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2309.13101) | 规范空间 + 形变 MLP |
| 4D Gaussian Splatting for Real-Time Dynamic Scene Rendering (Wu et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2310.08528) | HexPlane 形变场 |
| Real-time Photorealistic Dynamic Scene Representation and Rendering with 4D Gaussian Splatting (Yang et al.) | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2310.10642) | 按时间切片的原生 4D 基元 |
| Spacetime Gaussian Feature Splatting (Li et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.16812) | 时间不透明度，多项式运动 |
| GaussianAvatars (Qian et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.02069) | 绑定到人脸模型的高斯 |
| LightGaussian (Fan et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2311.17245) | 剪枝 + SH 蒸馏 + 量化 |
| Compact 3D Gaussian Representation for Radiance Field (Lee et al.) | CVPR | 2024 | [CVF](https://openaccess.thecvf.com/content/CVPR2024/papers/Lee_Compact_3D_Gaussian_Representation_for_Radiance_Field_CVPR_2024_paper.pdf) | 学习的掩码、网格颜色、码本 |
| Scaffold-GS (Lu et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.00109) | 基于锚点的结构化高斯 |
| HAC: Hash-grid Assisted Context for 3DGS Compression (Chen et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2403.14530) | 锚点的熵编码 |
| StopThePop (Radl et al.) | ACM TOG (SIGGRAPH) | 2024 | [arXiv](https://arxiv.org/abs/2402.00525) | 视角一致的排序，无跳变 |
| 3D Gaussian Ray Tracing (Moenne-Loccoz et al.) | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2407.07090) | 基于 BVH 的高斯光线追踪 |
| 3D Gaussian Splatting as Markov Chain Monte Carlo (Kheradmand et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2404.09591) | 有原理依据的致密化 |
| SplaTAM (Keetha et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.02126) | RGB-D 高斯 SLAM |
| Gaussian Splatting SLAM (Matsuki et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.06741) | 单目高斯 SLAM |
| pixelSplat (Charatan et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.12337) | 从图像对前馈预测高斯 |
| MVSplat (Chen et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2403.14627) | 基于代价体的前馈高斯 |
| LRM: Large Reconstruction Model for Single Image to 3D (Hong et al.) | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2311.04400) | 大规模 Transformer 图像到 3D |
| GS-LRM (Zhang et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2404.19702) | Transformer 输出逐像素高斯 |
| LGM: Large Multi-View Gaussian Model (Tang et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2402.05054) | 多视角扩散 + U-Net 生成高斯 |
| DreamGaussian (Tang et al.) | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2309.16653) | 在高斯上做 SDS，每个资产几分钟 |
| GaussianDreamer (Yi et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2310.08529) | 3D 扩散初始化 + 2D 扩散精修 |
| Relightable 3D Gaussians (Gao et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2311.16043) | BRDF 分解 + 点光线追踪 |
| GS-IR: 3D Gaussian Splatting for Inverse Rendering (Liang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.16473) | 法线、烘焙遮挡、材质 |
| PhysGaussian (Xie et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.12198) | 高斯的 MPM 仿真 |
| VR-GS (Jiang et al.) | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2401.16663) | VR 中可交互、具备物理感知的高斯 |
| LangSplat (Qin et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.16084) | 高斯上的开放词汇语言场 |

## 学习资源

- 上面大多数论文的官方代码都可以从它们的 arXiv 页面找到；[gsplat](https://github.com/nerfstudio-project/gsplat) 在同一套 API 之下实现了其中的若干方法（Mip-Splatting 滤波器、MCMC 致密化、2DGS 光栅化）。
- [radiancefields.com](https://radiancefields.com/) 新闻网站持续追踪新的高斯泼溅论文、工具和产品。
- 本网站代码仓库中的阅读清单 `docs/reading-lists/neural-rendering.md` 按阶段对论文进行了分组。
- 关于第 9–10 节的图形学背景，可参考图形学系列中关于 PBR 和仿真的文章。

## 练习

1. 证明：将协方差为 $\Sigma$（峰值为 1，不透明度为 $o$）的高斯与方差为 $v$ 的归一化各向同性高斯做卷积，得到协方差为 $\Sigma + vI$、峰值为 $o\sqrt{\lvert\Sigma\rvert/\lvert\Sigma+vI\rvert}$ 的高斯。这就是 Mip-Splatting 中的不透明度重缩放。
2. 数值验证 `slice_4d`：从一个随机 4D 高斯中采样，保留满足 $\lvert t - t_0\rvert < \varepsilon$ 的样本，并把它们的均值和协方差与公式进行比较。
3. 在第 4 篇的 PyTorch 渲染器中，用 `mip_filter_2d` 替换 `+ 0.3 * I` 膨胀，并比较在训练分辨率的 $0.5\times$ 和 $4\times$ 下的渲染结果。
4. 用第 4 篇的渲染器勾勒一个 SplaTAM 风格的跟踪步骤：冻结高斯，让相机旋转（轴角表示）和平移成为可学习参数，并最小化与一张从扰动位姿渲染出的目标图像之间的 L1 损失。
5. 选择一个方向，阅读它的两篇代表性论文。写一份半页的总结，说明每篇论文解决了什么问题、它的关键公式，以及一个失败案例。

**下一篇：** [第 6 篇]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})是动手实践：采集你自己的场景、运行 COLMAP、训练一个泼溅模型，并在网页和 VR 中查看它。
