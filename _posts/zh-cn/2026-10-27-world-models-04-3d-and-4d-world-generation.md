---
layout: post
title: "显式世界：3D 与 4D 世界生成"
date: 2026-10-27 15:04:00+0900
description: "生成显式的 3D 与 4D 世界：分数蒸馏（DreamFusion、VSD）、多视角扩散、基于修复与深度的场景生长（Text2Room、LucidDreamer、WonderJourney、WonderWorld）、高斯场景生成、4D 生成、World Labs 的 Marble，以及与像素空间视频世界模型之间的权衡。"
categories: world-models
tags: [world-models, 3d-generation, score-distillation, gaussian-splatting, 4d-generation]
series: world-models
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第 3 篇]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})中的视频世界模拟器把整个世界隐式地保存在网络及其上下文窗口（context window）之中；这正是它们会忘记你身后有什么的原因。与之相反的设计则保留一个**显式的 3D（或 4D）表示**（explicit 3D/4D representation），例如网格（mesh）、NeRF 或一组 3D 高斯，生成模型只用于*创建*或*扩展*它。一旦世界以 3D 形式存在，经典渲染器就能保证多视角一致性（multi-view consistency）；它可以逐个物体地编辑，可以在手机或 VR 头显上实时运行，也可以交给物理引擎。对于从[神经渲染与 3DGS 系列]({{ '/blog/category/neural-rendering/' | relative_url }})过来的读者，本文正是那个系列与世界模型交汇的地方：表示是你已经熟悉的，新的问题是如何从文本或单张图像*生成*它。

## 前置知识

- 扩散模型、无分类器引导（classifier-free guidance）与 DDIM（[第 2 篇]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})）。
- 辐射场（radiance field）与 3D 高斯泼溅（3D Gaussian Splatting；Kerbl et al., SIGGRAPH 2023 / ACM TOG 42(4)）：可微渲染（differentiable rendering）$x = g(\theta, \text{camera})$。
- 针孔相机模型（pinhole camera model）：内参 $K$、相机到世界的位姿 $[R \mid t]$，以及借助深度进行的反投影（unprojection）。

## 1. 核心难点：没有互联网规模的 3D 数据

带文字说明的图像和视频有数十亿之多，但 3D 资产只有几百万个，大规模、高质量的 3D 场景更是寥寥无几。因此，本文中的每一种方法都**借用一个 2D 先验**（2D prior；图像或视频扩散模型），并将其提升（lift）到 3D。主要有四种策略：

| 策略 | 思路 | 示例 | 速度 |
| --- | --- | --- | --- |
| 分数蒸馏（score distillation） | 优化一个 3D 表示，使其所有渲染图在 2D 扩散模型下都显得可能 | DreamFusion, Magic3D, ProlificDreamer, DreamGaussian | 每个资产数分钟到数小时 |
| 多视角生成（multi-view generation）+ 重建 | 用具备 3D 感知的扩散模型生成若干一致的视图，然后进行重建 | Zero-1-to-3, MVDream, CAT3D | 约一分钟 |
| 前馈式（feed-forward）3D | 由大型网络直接从图像输出 3D 表示 | LRM 及其后续工作 | 数秒 |
| 场景生长（scene growing；修复 inpainting + 深度） | 从新相机渲染当前场景，用 2D 模型修复空洞，借助单目深度提升到 3D，再进行融合 | Text2Room, LucidDreamer, WonderJourney, WonderWorld | 每个场景数秒到数小时 |

物体大多由前三种方法处理；而**场景与世界**是无界的，需要房间尺度的布局，因此主要由第四种方法处理，或者由结合了所有这些方法的系统处理（Marble，第 6 节）。

## 2. 分数蒸馏采样（score distillation sampling, SDS）

### 2.1 推导

**DreamFusion**（Poole et al., ICLR 2023, [arXiv:2209.14988](https://arxiv.org/abs/2209.14988)）优化 NeRF 参数 $\theta$，使得从随机相机得到的渲染图 $x = g(\theta)$ 看起来像是从一个冻结的文生图扩散模型 $\hat\epsilon_\phi(x_t; y, t)$（提示词为 $y$）中采样得到的。一个自然的想法是针对*图像*而非网络来最小化扩散训练损失：

$$
\mathcal{L}_{\mathrm{diff}}(\theta) = \mathbb{E}_{t,\epsilon}\Big[w(t)\,\big\lVert \hat\epsilon_\phi(\alpha_t x + \sigma_t \epsilon;\ y, t) - \epsilon \big\rVert^2\Big], \qquad x = g(\theta).
$$

它的梯度包含 U-Net 的雅可比矩阵（Jacobian）$\partial \hat\epsilon_\phi / \partial x_t$，计算代价高，而且论文发现其效果很差。去掉这一项，就得到了 **SDS 梯度**：

$$
\nabla_\theta \mathcal{L}_{\mathrm{SDS}} = \mathbb{E}_{t,\epsilon}\Big[w(t)\,\big(\hat\epsilon_\phi(x_t;\ y, t) - \epsilon\big)\,\frac{\partial x}{\partial \theta}\Big].
$$

直观地说：给渲染图加噪，询问扩散模型它"看到"了什么噪声，然后沿着使残差 $(\hat\epsilon - \epsilon)$ 变小的方向推动渲染图。论文表明，这是加噪渲染图分布 $q(x_t \mid x = g(\theta))$ 与模型带噪边缘分布 $p_\phi(x_t \mid y)$ 之间 KL 散度（KL divergence）加权和的梯度。由于 $\hat\epsilon_\phi \approx -\sigma_t \nabla \ln p_t$（第 2 篇第 5.3 节），SDS 就是在各噪声水平上平均后、对加噪渲染图的对数密度做梯度上升：它是**寻模式的**（mode seeking）。

下图追踪了一次 SDS 迭代。

{% include blog_figure.liquid path="assets/img/blog/world-models/04-sds-loop.svg" localized="true" caption="一次 SDS 更新：从随机相机渲染场景，把渲染图加噪到随机的水平 $t$，让冻结的文本条件扩散模型预测噪声，再把残差 $w(t)(\hat\epsilon_\phi - \epsilon)$ 经由可微渲染器回传到 $\theta$（红色）。扩散模型从不更新，它的雅可比矩阵也从不计算。" %}

### 2.2 实际影响

- DreamFusion 使用了非常大的无分类器引导权重（$w = 100$）来获得清晰的结果。再加上寻模式的特性，这导致了 SDS 资产典型的**过饱和、过度平滑**（over-saturated, over-smoothed）外观，以及不同随机种子之间多样性很低。
- 2D 先验没有 3D 身份的概念，因此每个视角都试图看起来像物体的"标准"视角；结果可能出现好几张脸（即 **Janus 问题**，Janus problem）。与视角相关的提示词（"front view"、"back view"）有所帮助；具备 3D 感知的先验（第 3 节）则能更根本地解决它。
- **Magic3D**（Lin et al., CVPR 2023）通过由粗到细（coarse-to-fine）的流程加速这一过程（先是粗糙的神经场，再在高分辨率下用潜在扩散先验优化带纹理的网格）。
- **ProlificDreamer**（Wang et al., NeurIPS 2023）提出了**变分分数蒸馏**（variational score distillation, VSD）：将 3D 场景视为随机变量，并把 SDS 残差中的噪声 $\epsilon$ 替换为第二个经 LoRA 微调的扩散模型的预测，该模型跟踪当前渲染图的分布：

$$
\nabla_\theta \mathcal{L}_{\mathrm{VSD}} = \mathbb{E}_{t,\epsilon,c}\Big[w(t)\,\big(\hat\epsilon_{\phi}(x_t;\ y, t) - \hat\epsilon_{\mathrm{lora}}(x_t;\ y, t, c)\big)\,\frac{\partial x}{\partial \theta}\Big],
$$

  其中 $c$ 是相机。这种方法在常规引导权重（例如 7.5）下即可工作，并能给出细节丰富得多、也更多样的结果。
- **DreamGaussian**（Tang et al., ICLR 2024）和 **GaussianDreamer**（Yi et al., CVPR 2024）用 3D 高斯取代 NeRF，渲染速度快得多，而且致密化（densification）成为生长几何的自然方式；DreamGaussian 能在大约两分钟内生成带纹理的网格。

### 2.3 可运行的玩具示例：SDS 是寻模式的

下面的脚本在 8 个高斯的混合分布上训练一个小型 2D 扩散模型（与第 2 篇完全相同），然后把 512 个自由的 2D 点视为"场景" $\theta$，以恒等映射作为"渲染器" $g$，并用 SDS 优化它们。请比较优化后点的分散程度与真实样本的分散程度。

```python
import math
import torch
import torch.nn as nn

torch.manual_seed(0)
T = 1000
betas = torch.linspace(1e-4, 0.02, T)
alpha_bar = torch.cumprod(1 - betas, dim=0)
ang = torch.arange(8).float() * (2 * math.pi / 8)
CENTERS = 2.0 * torch.stack([torch.cos(ang), torch.sin(ang)], dim=1)

def sample_data(n):
    return CENTERS[torch.randint(0, 8, (n,))] + 0.1 * torch.randn(n, 2)

def temb(t, dim=32):
    freqs = torch.exp(-math.log(10000.0) * torch.arange(dim // 2) / (dim // 2))
    a = t.float()[:, None] * freqs[None]
    return torch.cat([torch.sin(a), torch.cos(a)], 1)

net = nn.Sequential(nn.Linear(34, 256), nn.SiLU(), nn.Linear(256, 256), nn.SiLU(),
                    nn.Linear(256, 256), nn.SiLU(), nn.Linear(256, 2))
eps_model = lambda x, t: net(torch.cat([x, temb(t)], 1))

# 1) "pretrain" the 2D prior with the DDPM loss
opt = torch.optim.Adam(net.parameters(), lr=1e-3)
for step in range(4000):
    x0, t = sample_data(512), torch.randint(0, T, (512,))
    eps = torch.randn_like(x0)
    ab = alpha_bar[t][:, None]
    loss = ((eps_model(ab.sqrt() * x0 + (1 - ab).sqrt() * eps, t) - eps) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
net.requires_grad_(False)

# 2) score distillation: theta are free parameters, "rendering" x = g(theta) = theta
theta = (0.5 * torch.randn(512, 2)).requires_grad_(True)
opt = torch.optim.Adam([theta], lr=1e-2)
for step in range(2000):
    t_max = int(980 - 930 * step / 2000)                      # anneal the noise level from high to low
    t = torch.randint(20, t_max, (512,))
    eps = torch.randn_like(theta)
    ab = alpha_bar[t][:, None]
    with torch.no_grad():
        x_t = ab.sqrt() * theta + (1 - ab).sqrt() * eps
        grad = eps_model(x_t, t) - eps                       # w(t) = 1
    opt.zero_grad()
    theta.grad = grad                                         # SDS: skip the network Jacobian
    opt.step()

def spread(x):
    d = torch.cdist(x, CENTERS)
    idx = d.argmin(1)
    return (x - CENTERS[idx]).norm(dim=1).mean().item(), idx.unique().numel()

with torch.no_grad():
    s_real, m_real = spread(sample_data(512))
    s_sds, m_sds = spread(theta)
print(f"real data : mean distance to nearest mode {s_real:.3f}, modes covered {m_real}/8")
print(f"SDS points: mean distance to nearest mode {s_sds:.3f}, modes covered {m_sds}/8")
```

SDS 点最终比真实样本更靠近各模式中心：每个点都爬向附近的密度峰值，而不是再现分布的分散程度。在 3D 中，这正是 SDS 资产那种过度平滑、"看起来很平均"的纹理。（覆盖哪些模式取决于初始化，因为每个粒子只是爬上最近的山丘。）把 `grad` 中的 $\epsilon$ 替换为在当前粒子上训练的第二个模型的预测，就能把它变成一个玩具版 VSD。还要注意循环中**退火**的噪声调度。如果每一步都在整个范围内均匀采样 $t$，高噪声项就会占主导；而大 $t$ 时的加噪边缘分布是围绕数据均值的单个团块，于是粒子会被拉向圆心，而不是落到各个模式上（可以自己试试）。像 ProlificDreamer 的两阶段时间调度那样在优化过程中逐步降低最大时间步，就能先确定粗略布局，再细化细节。

运行这个脚本以及均匀采样 $t$ 的变体，结果如下（每个子图中的数字：到最近模式的平均距离，以及覆盖的模式数）：

{% include blog_figure.liquid path="assets/img/blog/world-models/04-sds-toy.svg" width="85%" caption="用训练好的玩具先验对 512 个自由二维点做 SDS。使用退火调度时，点先形成一个圆环，然后爬到各个模式上，最终到模式中心的平均距离为 0.062，只有真实样本离散程度（0.121）的一半：这就是寻模式。若 $t$ 在整个范围内均匀采样，高噪声项会不断把点拉向中心，点最终停在一个更小的圆上（平均半径 1.53，而不是 2）。" %}

## 3. 具备 3D 感知的先验：多视角扩散与前馈模型

与其和 2D 先验缺乏 3D 感知的问题对抗，不如在 3D 数据上微调它，让它理解相机：

- **Zero-1-to-3**（Liu et al., ICCV 2023）微调 Stable Diffusion，使其能在给定输入图像和相对相机变换的条件下合成物体的新视图；作为 SDS 先验使用时，它大大缓解了 Janus 问题。
- **MVDream**（Shi et al., ICLR 2024）通过跨视图注意力（cross-view attention）联合生成多个视图，使各视图彼此一致。
- **CAT3D**（Gao et al., NeurIPS 2024）用多视角扩散模型从一张或少数几张图像生成一个*场景*的大量一致新视图，再据此重建类似 NeRF 的表示，耗时约一分钟。
- **LRM**（Hong et al., ICLR 2024）是一个大型 Transformer，能在几秒内把单张图像映射为三平面（triplane）NeRF，它在大规模 3D 物体数据集上训练；许多后续工作直接输出 3D 高斯。
- 无位姿重建（pose-free reconstruction），例如 **DUSt3R**（Wang et al., CVPR 2024），无需已知相机即可从图像对预测稠密的 3D 点图（point map），从而便于把生成的图像提升到同一个 3D 坐标系中。

总的经验是：**在数据所在的 2D 中生成，在需要一致性的 3D 中重建**。场景生成器也是这样工作的。

## 4. 通过迭代修复与提升生成场景

### 4.1 循环

**Text2Room**（Höllein et al., ICCV 2023, [arXiv:2303.11989](https://arxiv.org/abs/2303.11989)）首次仅凭文本生成了房间尺度的带纹理网格。这个循环为后来大多数场景生成器所共用：

1. 从新的相机位姿**渲染**当前场景。未被现有几何覆盖的像素构成掩码 $M$。
2. 用文本条件的 2D 修复模型（inpainting model；Stable Diffusion inpainting）**修复**掩码区域。
3. 用单目深度网络（monocular depth network）为新图像**估计深度**。
4. 在已知像素上把预测深度与现有几何的深度**对齐**（单目深度只在尺度和平移意义下有定义）。
5. 把新像素**反投影**到 3D 中，并将其**融合**进场景（Text2Room 中是网格；后来的工作中是点或高斯）。

画成一个循环：

{% include blog_figure.liquid path="assets/img/blog/world-models/04-scene-loop.svg" localized="true" width="75%" caption="Text2Room、LucidDreamer、WonderJourney 和 WonderWorld 共有的场景生长循环。每一轮都为新相机能看到、而场景尚未覆盖的区域添加几何；添加的内容会留在场景中，因此之后的视角按构造就与它一致。" %}

Text2Room 把这一过程分为两个阶段：*生成*阶段使用精心挑选的相机轨迹来铺设房间布局；*补全*阶段则选取额外的视点来填补剩余的空洞。视点选择很重要：糟糕的轨迹会在深度不连续处产生被拉伸的几何。

### 4.2 几何原理与代码

深度对齐是在已知像素集合 $\mathcal{K}$ 上的最小二乘问题：

$$
(s^\ast, b^\ast) = \arg\min_{s, b} \sum_{p \in \mathcal{K}} \big(s\, \hat d_p + b - d_p\big)^2,
$$

之后，对齐深度为 $d = s^\ast \hat d + b^\ast$ 的像素 $(u, v)$ 被反投影到世界坐标系中：

$$
X_{\mathrm{world}} = R\, \big(d\, K^{-1} [u, v, 1]^\top\big) + t .
$$

```python
import numpy as np

rng = np.random.default_rng(0)
H, W = 48, 64
K = np.array([[60.0, 0, W / 2], [0, 60.0, H / 2], [0, 0, 1]])

# ground-truth depth of a tilted plane (stands in for the true scene)
v, u = np.mgrid[0:H, 0:W]
d_true = 3.0 + 0.02 * u + 0.01 * v

# monocular depth = unknown affine transform of the truth + noise (relative depth)
d_mono = (d_true - 1.2) / 2.5 + 0.01 * rng.standard_normal((H, W))

# pixels already covered by the existing scene (left half) have known depth
known = u < W // 2
A = np.stack([d_mono[known], np.ones(known.sum())], axis=1)
s, b = np.linalg.lstsq(A, d_true[known], rcond=None)[0]
d_aligned = s * d_mono + b
print(f"scale {s:.3f}, shift {b:.3f}; error on NEW pixels: "
      f"{np.abs(d_aligned - d_true)[~known].mean():.4f} (unaligned {np.abs(d_mono - d_true)[~known].mean():.3f})")

def unproject(depth, K, R=np.eye(3), t=np.zeros(3), mask=None):
    """Lift pixels to world-space points: X = R (d K^-1 [u, v, 1]) + t."""
    vv, uu = np.mgrid[0:depth.shape[0], 0:depth.shape[1]]
    pix = np.stack([uu, vv, np.ones_like(uu)], axis=-1).reshape(-1, 3).astype(float)
    rays = pix @ np.linalg.inv(K).T                 # camera-space rays with z = 1
    pts = rays * depth.reshape(-1, 1)
    pts = pts @ R.T + t
    return pts if mask is None else pts[mask.reshape(-1)]

new_points = unproject(d_aligned, K, mask=~known)   # only the inpainted (new) region
print("new points:", new_points.shape, "z range:", new_points[:, 2].min().round(2), new_points[:, 2].max().round(2))
```

在实际流程中，对齐往往按区域进行，或者使用以已知深度为条件的深度补全网络（depth completion network），因为单个全局仿射拟合无法修复错误的深度*形状*。WonderWorld（见下文）把它的版本称为**引导式深度扩散**（guided depth diffusion）。

下图展示了这个脚本计算的内容。

{% include blog_figure.liquid path="assets/img/blog/world-models/04-depth-align.svg" width="75%" caption="上：在已知像素上，场景深度是单目预测的仿射函数；最小二乘得到 $s = 2.47$、$b = 1.23$（真值为 2.5 和 1.2），新像素上的误差从 2.99 降到 0.021。下：在相机坐标系中反投影得到的点（OpenCV 约定：$z$ 朝前、$y$ 朝下；作图时 $-y$ 朝上）。对齐后的新点（橙色）与已有平面（蓝色）衔接；未对齐的点（灰色）则会漂浮在相机前方约一个单位处。" %}

### 4.3 从网格到高斯，从房间到旅程

- **LucidDreamer**（Chung et al., [arXiv:2311.13384](https://arxiv.org/abs/2311.13384), 2023；后发表于 IEEE TVCG）执行一个"做梦"步骤（从新视角进行修复 + 深度估计）和一个"对齐"步骤（把新点合并进现有点云），然后用点云初始化 **3D 高斯泼溅**，并在生成的图像上对其进行优化。它的输入可以是文本、RGB 或 RGB-D，结果是一个不限领域、可实时渲染的场景。（不要与 Liang et al., CVPR 2024 的同名文生 3D 物体方法混淆。）
- **WonderJourney**（Yu et al., CVPR 2024, [arXiv:2312.03884](https://arxiv.org/abs/2312.03884)）从一张图像或一段文本出发，生成一段穿越长序列多样而又相互连接的 3D 场景的*旅程*。由大语言模型（large language model）撰写下一个场景的描述，视觉模块借助修复和深度把它构建为点云，再由视觉-语言模型（vision-language model）检查每个结果是否有伪影，并在必要时触发重新生成。
- **WonderWorld**（Yu et al., CVPR 2025, [arXiv:2406.09394](https://arxiv.org/abs/2406.09394)）使这一过程变得**可交互**：用户移动相机并输入应当出现的内容，在单张 A6000 GPU 上不到 10 秒即可生成一个新的相连场景。它使用 **FLAGS**（fast layered Gaussian surfels，快速分层高斯面元）——一种基于几何的初始化，只需单个视图和少量优化；使用逐层生成来处理去遮挡（disocclusion）；并使用引导式深度扩散来获得一致的深度。作者指出，场景只有朝前的表面，因此可观察的范围有限。

这一类方法是第 3 篇中交互式视频世界模型最接近的显式对应物：它由相机和文本驱动，随着你的探索而生长世界，但它所生长的是一个**持久的 3D 资产**（persistent 3D asset）。

## 5. 4D：加入时间

4D 世界就是 3D 表示加上动力学（dynamics）。两种常见的表示是：**动态 NeRF**（dynamic NeRF；以时间为条件的场），以及**可变形 3D 高斯**（deformable 3D Gaussians），其中规范空间的高斯由形变场 $\Delta\mu, \Delta q, \Delta s = D_\psi(\mu, t)$ 移动（如 4D Gaussian Splatting，Wu et al., CVPR 2024, [arXiv:2310.08528](https://arxiv.org/abs/2310.08528)，它能实时渲染捕获的动态场景）。

把时间作为竖轴，可变形的高斯场景看起来是这样的：

{% include blog_figure.liquid path="assets/img/blog/world-models/04-4d-gaussians.svg" width="75%" caption="二维空间 + 时间中的可变形高斯：同样的十个规范高斯分别画在 $t = 0, 0.5, 1$ 处，曲线是它们中心 $\mu + \Delta\mu(\mu, t)$ 的轨迹。这里的形变是手写的旋涡加平移，用来代替学习到的 $D_\psi$；它也会旋转每个高斯。渲染任意时刻 $t$，就是先形变，再照常 splatting。" %}

生成同样借用先验，现在还包括**视频**扩散模型：

- **MAV3D**（Singer et al., ICML 2023, [arXiv:2301.11280](https://arxiv.org/abs/2301.11280)）是第一个文本到 4D 的方法：用来自文生视频模型的 SDS 优化一个动态 NeRF。
- **4D-fy**（Bahmani et al., CVPR 2024, [arXiv:2311.17984](https://arxiv.org/abs/2311.17984)）观察到一种权衡：图像模型能给出良好的外观和 3D 结构但没有运动，视频模型能给出运动但外观和结构较弱。**混合 SDS**（hybrid SDS）交替使用来自这两类先验的梯度（外加一个具备 3D 感知的先验）。
- **Align Your Gaussians**（Ling et al., CVPR 2024, [arXiv:2312.13763](https://arxiv.org/abs/2312.13763)）使用带形变场的动态 3D 高斯，组合来自文生图、文生视频和多视角扩散模型的反馈，并采用自回归方案串联出更长的序列。
- **以物理作为动力学模型。** 与其从视频模型中蒸馏运动，不如直接模拟它：**PhysGaussian**（Xie et al., CVPR 2024, [arXiv:2311.12198](https://arxiv.org/abs/2311.12198)）把高斯视为连续体粒子，并用物质点法（material point method, MPM）对其进行积分，使同一批基元既被模拟又被渲染。这是显式世界路线对"视频模型不懂物理"的回答。

## 6. World Labs 的 Marble 与产品化的世界生成器

World Labs 于 2025 年 9 月以有限测试版形式发布了 **Marble**，并于 [2025 年 11 月 12 日](https://www.worldlabs.ai/blog/marble-world-model)正式公开提供。Marble 从文本、图像、视频或粗略的 3D 布局生成**持久的、可下载的 3D 世界**，而不是即时生成帧。根据发布文章，高斯泼溅是 Marble 世界保真度最高的表示，世界也可以导出为网格（用于物理的低保真碰撞网格，以及高质量网格）。一个名为 **Chisel** 的实验性编辑器让用户可以用简单形状或导入的资产搭出结构，再由模型补全外观。目前没有描述该模型的技术论文，因此其内部工作原理并未公开。

Marble 之所以适合作为参照点，是因为它端到端地体现了显式路线：生成得到的是一个资产（泼溅 + 网格），随后由普通的图形与游戏工具使用。而像素空间路线（Genie 3）产生的则是一种*体验*，它只在模型运行期间存在。

## 7. 权衡：像素 vs. 显式 3D/4D

| 标准 | 像素空间视频世界模型（第 3 篇） | 显式 3D / 4D 世界 |
| --- | --- | --- |
| 多视角一致性 | 学习得到、近似的；随时间退化 | 对静态内容由渲染器保证 |
| 记忆 / 持久性 | 受上下文窗口限制 | 表示*本身*就是记忆 |
| 动力学、智能体、特效 | 丰富，从视频中学得（水、烟、角色） | 困难：需要 4D 生成或显式模拟器 |
| 物理 | 隐式，在分布外经常出错 | 可接入物理引擎（网格、在高斯上做 MPM），但材质必须推断 |
| 可编辑性 | 通过提示词 / 世界事件，不精确 | 逐物体编辑、雕刻、重新打光、导出到引擎 |
| 运行时渲染成本 | 每帧一次大型网络推理（GPU/TPU） | 光栅化或泼溅，在消费级硬件和 VR 上实时 |
| 内容通用性 | 视频中见过的任何东西 | 大多是静态场景；无界和动态内容更难 |
| 与动作的交互性 | 原生支持（以动作为条件） | 需要在资产外围包一层游戏引擎或模拟器 |

这张表的核心在于世界状态存放在哪里：

{% include blog_figure.liquid path="assets/img/blog/world-models/04-explicit-vs-pixel.svg" localized="true" width="85%" caption="状态存放在哪里。在像素空间模型中，唯一的状态就是最近若干帧组成的窗口，每一帧都由大型网络生成，因此重访的地方会被重新生成，可能发生变化。在显式世界中，状态是一组持久的基元，廉价的渲染器可以从任意相机把它画出来；编辑和物理都直接作用在这个状态上。" %}

这两条路线正在趋于融合。视频模型正在以显式 3D 信号（相机轨迹、点云、深度）为条件来提升一致性，而显式流程也越来越多地使用视频模型作为先验（CAT3D 式的多视角生成、4D-fy）。一个合理的研究方向是**混合世界模型**（hybrid world model）：一个显式、持久的 3D/4D 状态，由学习得到的动力学更新，并通过泼溅或生成式"神经渲染器"（neural renderer）来渲染，后者负责显式状态无法表示的效果。

## 8. 动手试试：一个可编辑的显式世界

[主页上的实验室]({{ '/' | relative_url }}#lab)中的 **Gaussian World** 标签页是显式路线的一个玩具示例。它的世界由大约 200,000 个 3D 高斯组成，用 3DGS 流程渲染（EWA 投影、深度排序、alpha 合成）。你可以输入提示词或选择预设，然后雕刻地形、绘制材质、放置或擦除物体、淹没山谷、改变一天中的时间，并以第一人称在其中漫游。

有两点需要坦白说明。第一，生成器是**程序化的，而非学习得到的**：一个由关键词驱动的程序读取提示词，并构建地形、湖泊、森林和村庄；真正的系统会用学习得到的模型来替代它，例如第 4 节中的场景生成器。第二，它的动力学（风、季节、重新打光）是手写的着色器，而不是学得的。这个演示真正能很好展示的，是显式路线的*好处*：每一次编辑都是局部的、持久的，并且从每个视点都立即保持一致，而且渲染在浏览器中实时运行——这恰恰是像素空间世界模型难以做到的。

下面这个与演示类似的静态例子说明了为什么编辑是局部的：

{% include blog_figure.liquid path="assets/img/blog/world-models/04-terrain-edit.svg" caption="由 3200 个高斯 splat 组成的程序化地形（高度由多个倍频正弦项叠加而成，按高度着色），以及做了一次抬起高斯形凸起的雕刻编辑之后的样子。只有笔刷附近的 334 个 splat（红色，10%）发生变化；其余部分，以及从任何视角看到的它们，都完全保持原样。" %}

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 为什么重要 |
| --- | --- | --- | --- | --- |
| DreamFusion: Text-to-3D using 2D Diffusion (Poole et al.) | ICLR | 2023 | [arXiv:2209.14988](https://arxiv.org/abs/2209.14988) | 分数蒸馏采样 |
| Magic3D: High-Resolution Text-to-3D Content Creation (Lin et al.) | CVPR | 2023 | [arXiv:2211.10440](https://arxiv.org/abs/2211.10440) | 结合网格的由粗到细 SDS |
| ProlificDreamer: High-Fidelity and Diverse Text-to-3D Generation with Variational Score Distillation (Wang et al.) | NeurIPS | 2023 | [arXiv:2305.16213](https://arxiv.org/abs/2305.16213) | VSD 解决过饱和与多样性低的问题 |
| Zero-1-to-3: Zero-shot One Image to 3D Object (Liu et al.) | ICCV | 2023 | [arXiv:2303.11328](https://arxiv.org/abs/2303.11328) | 以相机为条件的新视角扩散 |
| Text2Room: Extracting Textured 3D Meshes from 2D Text-to-Image Models (Höllein et al.) | ICCV | 2023 | [arXiv:2303.11989](https://arxiv.org/abs/2303.11989) | 通过修复 + 深度实现房间尺度的场景生长 |
| Text-To-4D Dynamic Scene Generation (MAV3D, Singer et al.) | ICML | 2023 | [arXiv:2301.11280](https://arxiv.org/abs/2301.11280) | 首个文本到 4D 方法，基于视频模型的 SDS |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al.) | SIGGRAPH / ACM TOG | 2023 | [arXiv:2308.04079](https://arxiv.org/abs/2308.04079) | 如今大多数生成器所瞄准的显式表示 |
| MVDream: Multi-view Diffusion for 3D Generation (Shi et al.) | ICLR | 2024 | [arXiv:2308.16512](https://arxiv.org/abs/2308.16512) | 联合多视角生成 |
| LRM: Large Reconstruction Model for Single Image to 3D (Hong et al.) | ICLR | 2024 | [arXiv:2311.04400](https://arxiv.org/abs/2311.04400) | 前馈式图像到 3D |
| DreamGaussian: Generative Gaussian Splatting for Efficient 3D Content Creation (Tang et al.) | ICLR | 2024 | [arXiv:2309.16653](https://arxiv.org/abs/2309.16653) | 基于高斯的快速 SDS |
| LucidDreamer: Domain-free Generation of 3D Gaussian Splatting Scenes (Chung et al.) | arXiv / IEEE TVCG | 2023 | [arXiv:2311.13384](https://arxiv.org/abs/2311.13384) | 生长为 3DGS 的场景生成 |
| WonderJourney: Going from Anywhere to Everywhere (Yu et al.) | CVPR | 2024 | [arXiv:2312.03884](https://arxiv.org/abs/2312.03884) | 由 LLM 规划的相连 3D 场景序列 |
| 4D-fy: Text-to-4D Generation Using Hybrid Score Distillation Sampling (Bahmani et al.) | CVPR | 2024 | [arXiv:2311.17984](https://arxiv.org/abs/2311.17984) | 结合图像与视频先验进行 4D 生成 |
| Align Your Gaussians: Text-to-4D with Dynamic 3D Gaussians and Composed Diffusion Models (Ling et al.) | CVPR | 2024 | [arXiv:2312.13763](https://arxiv.org/abs/2312.13763) | 用于文本到 4D 的动态高斯 |
| PhysGaussian: Physics-Integrated 3D Gaussians for Generative Dynamics (Xie et al.) | CVPR | 2024 | [arXiv:2311.12198](https://arxiv.org/abs/2311.12198) | 对同一批高斯既模拟又渲染 |
| CAT3D: Create Anything in 3D with Multi-View Diffusion Models (Gao et al.) | NeurIPS | 2024 | [arXiv:2405.10314](https://arxiv.org/abs/2405.10314) | 面向场景的多视角扩散 + 重建 |
| WonderWorld: Interactive 3D Scene Generation from a Single Image (Yu et al.) | CVPR | 2025 | [arXiv:2406.09394](https://arxiv.org/abs/2406.09394) | 可交互、10 秒以内的场景生成 |

## 学习资源

- [threestudio](https://github.com/threestudio-project/threestudio) 框架在同一代码库中实现了 DreamFusion、Magic3D、ProlificDreamer、Zero-1-to-3 引导以及许多其他 SDS 变体；这是上手实验最快的途径。
- 附代码的项目主页：[Text2Room](https://github.com/lukasHoel/text2room)、[LucidDreamer](https://luciddreamer-cvlab.github.io/)、[WonderJourney](https://kovenyu.com/wonderjourney/)、[WonderWorld](https://kovenyu.com/WonderWorld/)、[4DGaussians](https://github.com/hustvl/4DGaussians)。
- World Labs 关于 [Marble](https://www.worldlabs.ai/blog/marble-world-model) 的博客文章介绍了该产品及其导出格式。
- 关于 3DGS 和相机的背景知识，请参阅本博客的神经渲染系列；关于扩散模型，请参阅[第 2 篇]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})以及 Lilian Weng 的[扩散模型文章](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/)。

## 练习

1. 用链式法则对 $\mathcal{L}_{\mathrm{diff}}$ 求导，推导 SDS 梯度，并指出被丢弃的是哪一项。在关于 U-Net 雅可比矩阵的什么假设下，被丢弃的项在期望意义下会消失？
2. 在 SDS 玩具示例中，把 `eps_model(x_t, t) - eps` 分别乘以 5 和 20，加入一个类似无分类器引导的缩放。分散程度和模式覆盖会如何变化？把这一点与 DreamFusion 资产的过饱和联系起来。
3. 把玩具示例改成 VSD：在当前粒子 `theta` 上在线训练第二个小型去噪器，并用它的预测替代 `eps`。分散程度是否会接近真实数据的分散程度？
4. 在深度对齐脚本中，把平面场景替换为带有阶跃不连续的场景，并让单目深度成为真实深度的非线性函数。全局仿射拟合在哪里失效？局部拟合又会如何帮助？
5. 选取第 7 节权衡表中的一行，设计一个混合系统，使其在这一行上兼得两列之长。它的训练数据会是什么？

**下一篇：**[第 5 篇]({{ '/blog/2026/world-models-05-jepa-evaluation-and-open-problems/' | relative_url }})将从生成退后一步：JEPA 以及预测式与生成式之争、世界模型如何评估，以及通向具身智能（embodied AI）的开放问题。
