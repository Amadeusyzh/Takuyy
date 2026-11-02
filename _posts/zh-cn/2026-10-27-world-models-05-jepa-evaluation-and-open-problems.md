---
layout: post
title: "预测，而非生成？JEPA、世界模型的评估与开放问题"
date: 2026-10-27 15:05:00+0900
description: "LeCun 的自主机器智能之路、I-JEPA、V-JEPA 与 V-JEPA 2，预测式与生成式之争，世界模型如何评估（物理、可控性、规划），以及通向具身智能的开放问题。"
categories: world-models
tags: [world-models, jepa, self-supervised-learning, evaluation, planning]
series: world-models
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第 3 篇]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})和[第 4 篇]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})讨论的是*生成*式世界模型：生成像素、token 或显式的 3D 场景。作为本系列的最后一篇，本文考察最有力的反方立场：智能体的世界模型应当**在抽象表示空间中进行预测**，而永远不必重建每一个像素。这正是 Yann LeCun 提出的联合嵌入预测架构（joint-embedding predictive architecture, JEPA）背后的思想。接着我们会追问这个领域的每位研究者都必须回答的问题：**我们如何知道一个世界模型是好的？** 最后，我们讨论开放问题，并为下一个系列——具身智能（embodied AI）——搭好桥梁。

## 前置知识

- 本系列第 1–4 篇，尤其是[第 1 篇]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})中 Dreamer 与 MuZero 的对比（重建一切 vs. 只预测重要的部分）。
- 自监督学习（self-supervised learning）基础：孪生网络（Siamese networks）、对比学习（contrastive learning）、表示坍塌（representation collapse）问题、指数移动平均（exponential moving average, EMA）目标网络。

## 1. LeCun 的《A Path Towards Autonomous Machine Intelligence》

2022 年 6 月，LeCun 发布了一篇很长的立场论文（position paper）[《A Path Towards Autonomous Machine Intelligence》](https://openreview.net/forum?id=BZ5a1r-kVsf)（0.9.2 版，发布于 OpenReview）。它提出了一种由可微模块组成的认知架构（cognitive architecture）：

| 模块 | 作用 |
| --- | --- |
| 配置器（Configurator） | 针对当前任务配置其他模块（执行控制） |
| 感知（Perception） | 根据传感器估计世界的当前状态 |
| 世界模型（World model） | 预测未来的世界状态（可能针对多个想象中的动作序列），并补全缺失的信息 |
| 代价（Cost） | 不可变的**内在代价**（intrinsic cost，例如“痛苦”或好奇心之类的驱动力），加上一个可训练的**评价器**（critic），用于预测未来的内在代价 |
| 短期记忆（Short-term memory） | 存储过去的状态、预测的状态及其代价 |
| 执行器（Actor） | 提出动作序列 |

智能体可以以两种模式行动。**模式 1** 是反应式的：感知结果直接输入策略。**模式 2** 是深思熟虑的规划：执行器提出一个动作序列，世界模型将其展开，代价模块为预测的状态打分，然后通过梯度下降或搜索来优化动作以最小化总代价，这与模型预测控制（model-predictive control, MPC）非常相似。模式 2 的结果可以蒸馏到模式 1 的策略中，正如 Dreamer 把想象蒸馏进执行器一样。

下图画出了这六个模块以及模式 2 的循环。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-architecture.svg" localized="true" width="85%" caption="LeCun 提出的架构。感知模块估计当前状态 $s_0$；执行器提出一个动作序列；世界模型预测未来状态 $\hat s_k$；代价模块为它们打分；短期记忆保存状态和代价。在模式 2 中，动作针对总代价进行优化（红色虚线），这就是使用学习到的模型的模型预测控制。配置器（点线）为当前任务设置所有模块。" %}

论文的核心技术主张关乎*世界模型应当如何训练*。世界只是部分可预测的：风中一棵树上每片叶子的确切位置是不可预测的。一个必须输出像素的生成模型，要么得对所有这些无关的随机性建模，要么只能对其取平均（导致模糊）。LeCun 转而主张使用**基于能量的模型**（energy-based models），训练它们为相容的样本对 $(x, y)$ 赋予低能量，其中 $x$ 是观测到的过去，$y$ 是未来；并主张**在学到的表示空间中**进行预测，在这个空间里不可预测的细节可以被丢弃。

### 1.1 JEPA

**联合嵌入预测架构**同时对 $x$ 和 $y$ 进行编码，并根据 $x$ 的嵌入来预测 $y$ 的*嵌入*，可选地引入一个隐变量 $z$ 来刻画 $x$ 无法决定的部分（或者引入一个动作 $a$）：

$$
s_x = \mathrm{Enc}_x(x),\qquad s_y = \mathrm{Enc}_y(y),\qquad
E(x, y, z) = D\big(s_y,\ \mathrm{Pred}(s_x, z)\big).
$$

与生成式模型并排比较，区别在于损失是在哪里计算的：

{% include blog_figure.liquid path="assets/img/blog/world-models/05-jepa-vs-generative.svg" localized="true" caption="左：生成式预测器解码出 $\hat y$，并在观测空间中受到惩罚，因此必须照顾到 $y$ 的每一个像素。右：JEPA 也对 $y$ 进行编码，并预测它的表示 $s_y$；目标编码器通常是一个不接收梯度的 EMA 副本，而潜变量 $z$ 让预测器能够表达多种可能的未来。编码器丢掉的 $y$ 的细节根本不需要被预测。" %}

其危险在于**表示坍塌**：如果编码器输出常数，那么对任何样本对能量都为零。防止坍塌的方法分为两类：

从能量的视角，可以同时看清目标和失败模式：

{% include blog_figure.liquid path="assets/img/blog/world-models/05-energy.svg" caption="左：对于一个固定的上下文 $x$，当预测器在 $z \in [-1, 1]$ 上的输出描出一段相容未来的弧线（橙色；圆点对应 $z = -1, 0, 1$）时，二维目标表示 $y$ 上的能量。整段弧线上的能量都为零，离开它则增大，因此可以同时存在多个“正确”的未来。右：编码器坍塌（输出常数）时，无论相容还是不相容的配对，能量处处为零，因此不携带任何信息。" %}

- **对比式**（contrastive）方法抬高不相容样本对（负样本）的能量。LeCun 认为这类方法随表示维度的增长扩展性很差。
- **正则化 / 非对比式**（regularized / non-contrastive）方法限制 $s_y$ 的信息量，或让表示保持分散。例子包括 VICReg（方差-不变性-协方差正则化，variance-invariance-covariance regularization），以及 BYOL 的**非对称**（asymmetric）设计：其目标编码器是在线编码器的 EMA 副本，不接收梯度。

**分层 JEPA**（hierarchical JEPA, H-JEPA）将多个 JEPA 堆叠起来，使更高的层级在更抽象的表示中预测更远的未来，从而支持分层规划（hierarchical planning）。

这篇立场论文是一份研究纲领，而不是实验。下面几篇来自 Meta 的论文是它的具体实现。

## 2. I-JEPA：预测图像区域的表示

**I-JEPA**（Assran et al., "Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture", CVPR 2023, [arXiv:2301.08243](https://arxiv.org/abs/2301.08243)）将这一思想应用于单张图像，且不使用任何手工设计的数据增强：

1. 采样若干个较大的由图像块（patch）组成的**目标块**（target blocks），以及一个较大的**上下文块**（context block）（并从中移除目标区域）。
2. 上下文编码器（ViT）$f_\theta$ 只处理可见的上下文图像块。
3. 目标编码器 $f_{\bar\theta}$ 处理*完整*图像；目标表示就是它在目标位置上的输出 token。
4. 一个窄的 ViT **预测器**（predictor）$g_\phi$ 接收上下文 token，以及带有某个目标块位置嵌入的掩码 token，并预测该块的表示。

下图是按照 I-JEPA 论文给出的采样范围抽取的三组掩码。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-ijepa-masks.svg" caption="$16 \times 16$ 图块网格（224 像素输入的 ViT-H/14）上的 I-JEPA 掩码。四个目标块（彩色边框）占图像面积的 0.15-0.2，长宽比为 0.75-1.5；一个上下文块（蓝色）占 0.85-1.0，并从中去掉目标区域。预测器只能根据蓝色图块，给出每个带框区域内目标编码器的 token。" %}

损失是表示空间中的 L2 距离，并在 $M$ 个目标块 $B_i$ 上取平均：

$$
\mathcal{L} = \frac{1}{M}\sum_{i=1}^{M} \sum_{j \in B_i} \big\lVert \hat s_{y}(j) - s_{y}(j) \big\rVert_2^2 ,
$$

目标编码器是上下文编码器的 EMA，即 $\bar\theta \leftarrow m\,\bar\theta + (1 - m)\,\theta$，且没有梯度流入其中。事实证明，**掩码策略**（masking strategy）至关重要：目标必须足够大才能具有语义，上下文必须信息充分且在空间上分布开来。与 MAE（He et al., CVPR 2022）等像素重建方法相比，I-JEPA 以更少的计算量学到了语义性更强的开箱即用特征（线性探测（linear probing）效果更好）。

## 3. V-JEPA 与 V-JEPA 2：从视频理解到规划

### 3.1 V-JEPA

**V-JEPA**（Bardes et al., "Revisiting Feature Prediction for Learning Visual Representations from Video", TMLR 2024, [arXiv:2404.08471](https://arxiv.org/abs/2404.08471)）将这套方法扩展到视频：使用时空掩码（掩码区域在时间上延伸，模型因此无法从相邻帧复制），并在特征空间中使用 L1 损失。它在约 200 万个公开视频上训练，不使用文本、负样本、预训练图像编码器或像素重建；其冻结特征在 Something-Something v2 等以运动为中心的任务上表现尤为出色。论文还报告称，特征预测比像素预测具有更高的标签效率。

一项后续研究（Garrido et al., "Intuitive physics understanding emerges from self-supervised pretraining on natural videos", 2025, [arXiv:2502.11831](https://arxiv.org/abs/2502.11831)）采用了发展心理学中的**期望违背**（violation-of-expectation）范式：给模型展示同一段视频在物理上可能与不可能的两个版本，并度量模型的“惊讶”程度，即它在表示空间中的预测误差。V-JEPA 模型在 IntPhys、GRASP 和 InfLevel 上对不可能事件稳定地表现出更大的惊讶，而同一研究中测试的像素生成式视频模型和多模态大语言模型的表现接近随机水平。作者也指出，并非所有直觉物理（intuitive physics）属性都能学得很好。

### 3.2 V-JEPA 2 与 V-JEPA 2-AC

**V-JEPA 2**（Assran et al., "V-JEPA 2: Self-Supervised Video Models Enable Understanding, Prediction and Planning", 2025, [arXiv:2506.09985](https://arxiv.org/abs/2506.09985)）将该方法扩展到超过一百万小时的互联网视频外加图像，并补上了世界模型所缺的那一味原料：**动作**。

1. **无动作预训练**（action-free pre-training）：在互联网视频上预训练编码器和预测器（即大规模的 V-JEPA 目标）。
2. **动作条件后训练**（action-conditioned post-training）：冻结编码器，在不到 62 小时的无标注机器人视频（来自 DROID 数据集）上训练一个新的预测器 **V-JEPA 2-AC**，使其根据当前表示、机器人末端执行器（end-effector）状态和动作来预测下一帧的表示。
3. **规划**：给定一张目标图像，机器人对其编码，并在每一步（用交叉熵方法（cross-entropy method, CEM））搜索一个动作序列，使其预测的最终表示在 L1 距离上最接近目标表示；然后执行第一个动作并重新规划（MPC）：

$$
a^\ast_{1:H} = \arg\min_{a_{1:H}} \Big\lVert \hat s_{H}(s_0, a_{1:H}) - s_{\mathrm{goal}} \Big\rVert_1, \qquad \hat s_{k} = P_\phi(\hat s_{k-1}, a_k).
$$

论文报告了在两个不在训练数据中的实验室里，用 Franka 机械臂仅凭图像目标实现零样本（zero-shot）抓取与放置。这是迄今为止 JEPA 纲领最完整的形态：一个主要从被动视频中学到的世界模型，借助少量交互数据适配到控制任务，并用于在隐空间中进行规划。

*更新（2026 年 11 月）：*V-JEPA 2.1（2026 年 3 月）加入了稠密特征，并报告真实机器人抓取成功率比 V-JEPA 2-AC 高 20 个百分点；LeWorldModel（2026 年 3 月）从像素端到端地训练 JEPA 世界模型。参见本文末尾的 2025–2026 年进展一节。

下图在一个玩具二维隐空间中运行同样的流程，其中 L1 目标的等值线是菱形的。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-latent-planning.svg" caption="用上面的目标进行玩具隐空间规划。预测器为 $\hat s_k = \hat s_{k-1} + a_k$（每个动作分量截断到 $\pm 0.45$），状态不能进入灰色圆盘；灰色菱形是到目标（星号）的 L1 距离等值线。左：对 $H = 8$ 个动作做 CEM（200 个样本、20 个精英、8 次迭代），终点离目标的 L1 距离为 0.23。右：MPC 只执行第一个动作然后重新规划；25 步之后离目标 0.15。" %}

### 3.3 相关的隐空间规划器

- **DINO-WM**（Zhou et al., ICML 2025, [arXiv:2411.04983](https://arxiv.org/abs/2411.04983)）冻结预训练的 DINOv2 图像块特征，只在离线轨迹上训练一个隐空间动力学模型（latent dynamics model）；用 MPC 规划到图像目标，在多个操作与导航任务上零样本可用。它表明，一个好的冻结视觉表示加上一个小型预测器可能就足够了，这是支持“预测特征而非像素”观点的有力论据。
- **Navigation World Models**（Bar et al., CVPR 2025, [arXiv:2412.03572](https://arxiv.org/abs/2412.03572)）是来自同一研究圈的生成式对照：一个 10 亿参数的条件扩散 Transformer（conditional diffusion Transformer）根据过去的帧和导航动作预测未来的第一人称（egocentric）*帧*，并通过模拟候选轨迹并对其排序来进行规划。

## 4. 预测式与生成式之争

| 方面 | 生成式（像素 / token） | 预测式（JEPA 风格的隐空间） |
| --- | --- | --- |
| 训练信号 | 重建或生成观测 | 匹配目标表示 |
| 不可预测的细节 | 必须建模（扩散）或取平均（模糊） | 可由编码器丢弃 |
| 坍塌风险 | 无（像素为表示提供锚定） | 真实存在；需要 EMA、停止梯度或方差正则化 |
| 输出是否可直接查看 | 是：可以直接观看展开结果 | 否：需要探针或单独的解码器 |
| 用作面向人类的模拟器 / 数据生成 | 自然（Genie、Cosmos） | 不能直接使用 |
| 每次预测的计算量 | 高（许多去噪步骤、大量像素） | 低（在紧凑空间中做一次前向传播） |
| 表示学到的内容 | 渲染所需的一切，包括纹理和光照 | 可预测的、在不同视角和时间之间共享的内容 |
| 代表性系统 | Dreamer（带重建）、GameNGen、Genie、Sora、NWM | MuZero（价值等价）、TD-MPC2、I-JEPA、V-JEPA 2-AC、DINO-WM |

为了让这场争论保持客观，有几点值得注意：

- **界线是模糊的。** 隐扩散模型（latent diffusion models）在学到的隐空间中生成，它们的自编码器已经丢弃了难以察觉的细节。Dreamer 重建像素，但在紧凑的隐空间中规划。JEPA 风格的模型也可以配上一个解码器用于可视化。
- **取决于用途。** 如果目标是面向人类的模拟器（游戏、VR、内容创作、合成数据），像素本身就是产品。如果目标是控制，MuZero、TD-MPC2、DINO-WM 和 V-JEPA 2-AC 的证据表明，重建是不必要的，甚至可能有害。
- **坍塌是不做重建的代价。** 每个非生成式世界模型都需要某种机制来保持表示的信息量：奖励与价值预测（MuZero）、EMA 目标（I-JEPA）、冻结的预训练编码器（DINO-WM），或显式的方差正则化（VICReg）。

### 4.1 代码：坍塌，以及 EMA 目标如何防止坍塌

下面这个玩具示例让坍塌问题变得直观可感。“观测”是频率和相位随机的一维信号 $\sin(\omega u + \varphi)$；上下文 $x$ 是信号的前半段，目标 $y$ 是后半段。JEPA 根据 $x$ 的嵌入预测 $y$ 的嵌入。我们比较三种变体，并报告一个批次中嵌入每个维度的标准差（接近零意味着坍塌），以及在嵌入上训练的线性探针能多好地恢复隐藏频率 $\omega$。

```python
import copy
import torch
import torch.nn as nn
import torch.nn.functional as F

torch.manual_seed(0)
L, D = 32, 16                                   # half-signal length, embedding size

def batch(n):
    omega = torch.rand(n, 1) * 2.5 + 0.5        # hidden factor we hope to recover
    phi = torch.rand(n, 1) * 6.283
    u = torch.arange(2 * L).float()[None]
    s = torch.sin(omega * u * 0.25 + phi) + 0.05 * torch.randn(n, 2 * L)
    return s[:, :L], s[:, L:], omega             # context x, target y, hidden omega

def encoder():
    return nn.Sequential(nn.Linear(L, 128), nn.ReLU(), nn.Linear(128, D))

def train(variant, steps=3000):
    enc = encoder()
    pred = nn.Sequential(nn.Linear(D, 128), nn.ReLU(), nn.Linear(128, D))
    target = copy.deepcopy(enc).requires_grad_(False)
    opt = torch.optim.Adam([*enc.parameters(), *pred.parameters()], lr=1e-3)
    for _ in range(steps):
        x, y, _ = batch(256)
        s_x = enc(x)
        if variant == "shared, no stop-grad":
            s_y = enc(y)                          # gradients flow into the target branch
        else:
            with torch.no_grad():
                s_y = target(y)                   # EMA target, stop-gradient
        loss = F.mse_loss(pred(s_x), s_y)
        if variant == "EMA + variance reg.":     # VICReg-style hinge on the per-dim std
            loss = loss + F.relu(1 - s_x.std(0)).mean()
        opt.zero_grad(); loss.backward(); opt.step()
        with torch.no_grad():                     # EMA update of the target encoder
            for p_t, p in zip(target.parameters(), enc.parameters()):
                p_t.mul_(0.99).add_(0.01 * p)
    return enc

def evaluate(enc):
    with torch.no_grad():
        x, _, omega = batch(4000)
        s = enc(x)
        feats = torch.cat([s, torch.ones(len(s), 1)], 1)
        w = torch.linalg.lstsq(feats[:3000], omega[:3000]).solution
        res = omega[3000:] - feats[3000:] @ w
        r2 = 1 - res.pow(2).mean() / omega[3000:].var()
    return s.std(0).mean().item(), r2.item()

for variant in ["shared, no stop-grad", "EMA target", "EMA + variance reg."]:
    std, r2 = evaluate(train(variant))
    print(f"{variant:>22}: embedding std {std:.4f}, linear-probe R^2 for omega {r2:.2f}")
```

当编码器共享且梯度同时流经两个分支时，把损失压到零的最简单方法就是把所有输入映射到同一个点，嵌入的标准差于是缩向零。非对称的 EMA 目标会减缓这一动态过程，而方差项则显式地排除了坍塌；请比较每种变体保留了多少关于 $\omega$ 的信息。具体数值取决于随机种子和训练步数，这本身就是一个教训：坍塌是一种训练*动态*，而不仅仅是损失函数的性质。

我们运行了上面的脚本，并在训练过程中记录了表示的离散程度：

{% include blog_figure.liquid path="assets/img/blog/world-models/05-collapse.svg" caption="坍塌玩具实验的输出。上：训练过程中 $s_x$ 每一维标准差的平均值（对数坐标）。下：1500 个表示的前两个主成分，按隐藏频率 $\omega$ 着色。共享编码器且不停止梯度时，离散程度降到 0.002，线性探针对 $\omega$ 一无所获（$R^2 = 0.01$）。EMA 目标让表示保持展开（$R^2 = 0.82$），方差铰链项进一步增大了离散程度，但在这次运行中没有改变 $R^2$。" %}

## 5. 世界模型如何评估？

目前没有一个公认的单一基准。把问题拆成以下五个会更有帮助。

作为一张粗略的地图，下图展示了本系列讨论的三类世界模型在这五个问题上大致的强项与弱项。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-eval-radar.svg" localized="true" width="75%" caption="仅为定性示意，并非实测分数：基于我们对第 4 篇中权衡表以及本文第 3、5 节的理解。像素视频模型看起来最好，但记忆和物理有限；显式 3D 世界按构造就是一致的，但动力学和动作需要模拟器；JEPA 式隐空间模型没有可以观看的输出（该轴为 0），但规划起来既便宜又有效。" %}

### 5.1 看起来对吗？（感知质量）

帧级的 FID、视频级的 **FVD**（Fréchet 视频距离，Fréchet video distance），以及 **VBench**（Huang et al., CVPR 2024, [arXiv:2311.17982](https://arxiv.org/abs/2311.17982)）这类评测套件，后者把视频质量拆分为主体一致性、运动平滑度和美学质量等维度。这些指标是必要的，但很弱：一个模型可以在违反物理规律的同时取得高分。

### 5.2 它遵守物理规律吗？

- **期望违背**：IntPhys（Riochet et al.）、GRASP 和 InfLevel 测试模型是否会对不可能事件感到“惊讶”（第 3.1 节）。
- **Physion**（Bear et al., NeurIPS 2021 Datasets and Benchmarks, [arXiv:2106.08261](https://arxiv.org/abs/2106.08261)）：在包含碰撞、堆叠、滚动、覆盖（draping）等情形的模拟场景中，预测两个物体是否会接触，并提供人类数据作为对照。
- **Physics-IQ**（Motamed et al., WACV 2026, [arXiv:2501.09038](https://arxiv.org/abs/2501.09038)）：物理事件的真实视频；模型看到开头后必须续写，其续写结果会在运动发生的位置、时间和幅度上与真实的未来进行比较。其核心发现是：当前视频生成器的物理理解能力非常有限，而且无法用视觉真实感来解释。
- **受控的合成研究**，例如 Kang et al.（ICML 2025, [arXiv:2411.02385](https://arxiv.org/abs/2411.02385)），将分布内泛化、组合泛化与分布外泛化区分开来（第 3 篇）。

### 5.3 它对动作有响应吗？（可控性）

交互式世界模型必须让动作*起作用*。Genie 用 $\Delta_t\mathrm{PSNR}$ 来衡量这一点：分别用从真实视频推断出的隐动作和随机采样的动作生成帧，将两者都与真实帧比较，取二者 PSNR 之差。如果模型忽略动作，这个差值就是零。其他常见的检查方法包括：在真实数据上训练一个逆动力学模型（inverse dynamics model），测试它能否从生成的帧中恢复出所下达的动作；或者度量所得相机或智能体位姿的误差。

### 5.4 它在时间上一致吗？（记忆）

重访测试：离开某处，再沿同一路径回来，比较同一地点的两个视图（PSNR/LPIPS，或特征匹配）。回环闭合（loop closure）以及基于生成视频的 3D 重建（运行 SfM 并查看重投影误差）用于测试几何一致性。显式 3D 世界（第 4 篇）对于静态内容天然能通过这些测试。

### 5.5 它有用吗？（下游任务）

归根结底，世界模型是一种工具，最好的评估是看它能让我们做成什么：

- **规划成功率**：使用该模型进行规划时到达目标的比例（DINO-WM、V-JEPA 2-AC、NWM）。
- **在想象中学习策略**：完全在模型内部训练的智能体在真实环境中评估时获得的回报（Dreamer、DIAMOND、UniSim）。
- **策略评估**：不同策略在模型*内部*的成功率，能否给出与真实世界试验相同的排序？一个能正确排序策略的模型，即使生成的视频并不完美，也可以替代昂贵的机器人评估。
- **数据生成**：用模型生成的合成数据进行训练，能否提升下游的感知或自动驾驶系统（Cosmos 和 GAIA-1 的用例）？

下面是可控性指标的一个最小示意实现，写法上允许你接入任意帧生成器：

```python
import torch

def psnr(a, b, max_val=1.0):
    mse = torch.mean((a - b) ** 2, dim=tuple(range(1, a.dim())))
    return 10 * torch.log10(max_val ** 2 / mse.clamp(min=1e-10))

def delta_psnr(model, frames, actions, sample_random_actions, t):
    """Genie-style controllability: PSNR with inferred/true actions minus PSNR with random actions.
    frames: [B, T, C, H, W] real video in [0, 1]; model(context, actions) -> predicted frames [B, t, C, H, W]."""
    ctx = frames[:, :1]
    pred_true = model(ctx, actions[:, :t])
    pred_rand = model(ctx, sample_random_actions(actions[:, :t]))
    target = frames[:, t]
    return (psnr(pred_true[:, -1], target) - psnr(pred_rand[:, -1], target)).mean()

# toy check with a "model" that shifts the first frame by the action (perfectly controllable)
def toy_model(ctx, acts):
    out, f = [], ctx[:, 0]
    for k in range(acts.shape[1]):
        f = torch.stack([torch.roll(fi, shifts=int(a), dims=-1) for fi, a in zip(f, acts[:, k])])
        out.append(f)
    return torch.stack(out, 1)

B, T = 8, 5
acts = torch.randint(-2, 3, (B, T))
first = torch.rand(B, 1, 1, 16, 16)
frames = torch.cat([first, toy_model(first, acts)], 1)             # ground-truth video
rand = lambda a: torch.randint(-2, 3, a.shape)
print("delta PSNR (controllable model):", delta_psnr(toy_model, frames, acts, rand, t=T).item())
print("delta PSNR (model that ignores actions):",
      delta_psnr(lambda c, a: c.repeat(1, a.shape[1], 1, 1, 1), frames, acts, rand, t=T).item())
```

可控的玩具模型得到一个很大的正 $\Delta\mathrm{PSNR}$（使用真实动作时的完美预测会被 `1e-10` 下限截断，因此该值很大但有限），而忽略动作的模型得到的恰好是零。

下图展示了该指标在玩具例子中的一个样本上比较的是什么：

{% include blog_figure.liquid path="assets/img/blog/world-models/05-delta-psnr.svg" caption="玩具检查中的一个样本。使用真实动作时，可控模型精确重现了真实帧（PSNR 触到 $10^{-10}$ 的 MSE 下限，即 100 dB）；使用随机动作时，纹理被移到了错误的位置（7.3 dB）。忽略动作的模型在两种情况下都返回第一帧，因此它的两个 PSNR 相等，$\Delta\mathrm{PSNR} = 0$。" %}

## 6. 开放问题与研究方向

1. **记忆与持久性。** 世界模型应当如何记住一个它已经看了一个小时的世界？候选方案：带压缩的更长上下文、按位姿检索、显式的 3D/4D 状态（第 4 篇），或学习得到的隐式地图。
2. **物理与因果的落地（grounding）。** 视频数据展示的是相关性；物理需要干预。有前景的要素包括：来自机器人和模拟器的交互数据、基于物理的归纳偏置（粒子，以及像 PhysGaussian 那样把模拟器放进回路），以及测试分布外物理规律的评估。
3. **共享的动作接口。** 键盘输入、隐动作、末端执行器增量、语言：一个能在不同本体（embodiment）之间迁移的世界模型，需要在不同数据集之间含义一致的动作。隐动作模型（latent action models，第 3 篇）是一个开端。
4. **不确定性。** 针对一个自信却错误的模型进行规划是危险的（第 1 篇中的模型利用（model exploitation））。对大型视频模型而言，大规模的校准认知不确定性（epistemic uncertainty）在很大程度上尚未解决。
5. **选择预测目标。** 像素、隐 token、自监督特征，还是任务相关的量？混合目标（例如 JEPA 风格的隐空间动力学模型加上一个用于查看的轻量解码器）尚未得到充分探索。
6. **能预测实用性的评估。** 需要与下游规划和策略评估表现相关、而非与视觉质量相关的基准。
7. **效率。** 在单个设备上实现实时、高分辨率、长时程的生成；这也是图形学知识（细节层次（level of detail）、缓存、注视点渲染（foveation）、显式图元）可以发挥作用的地方。
8. **多智能体与社会性世界。** 目前大多数模型只模拟一个可控的智能体；拥有自身目标的其他智能体被当作噪声处理。

对于处在图形学、XR/HCI 与具身智能交叉领域的研究者来说，第 1、5、7 项尤其顺理成章：显式表示、感知驱动的渲染，以及有人在回路（humans in the loop）的交互式评估。

## 7. 通向具身智能的桥梁

在动作会在物理世界中产生后果的地方，世界模型最为重要。本博客的下一个系列[具身智能]({{ '/blog/category/embodied-ai/' | relative_url }})将从机器人学基础和仿真讲起，然后从机器人的角度回到本系列的思想：世界模型作为用于仿真到现实迁移（sim-to-real transfer）的模拟器、作为策略评估器、作为规划器（如 V-JEPA 2-AC 和 DINO-WM），以及作为视觉-语言-动作模型（vision-language-action models）内部的“想象”。

## 2025–2026 年进展（截至 2026 年 11 月）

本节补充 2025 年年中至 2026 年 11 月初的 JEPA 与评测工作，并附上一份标注清楚的公开主张清单。所有工作都已在 2026 年 11 月对照其 arXiv 页面或官方文章核实。“预印本”指尚未在会议或期刊发表。时间线小部件（筛选“JEPA”和“评测”）列出了所有条目。

{% include widget.liquid name="world-models-timeline" height="560" caption="动手试试：用“JEPA”和“评测”按钮查看本篇的条目；点击圆点查看摘要、状态和链接。注意 2026 年评测论文的集中出现：基准大约比它们所衡量的系统晚一年到来。" %}

### V-JEPA 2 之后的 JEPA 路线

- **V-JEPA 2.1**（Mur-Labadia et al.，预印本，[arXiv:2603.14482](https://arxiv.org/abs/2603.14482)，2026 年 3 月）针对 V-JEPA 2 的一个已知弱点：它的特征擅长全局理解，但在*稠密*的逐位置任务上较弱。解决办法是加入稠密预测损失，并在图像和视频上联合训练。论文报告了更好的稠密特征，以及从 1B 到 2B 参数的扩展效果。与 3.2 节相关的是，它还报告真实机器人抓取成功率比 V-JEPA 2-AC 高出 20 个百分点。稠密特征对规划很重要，因为操作取决于物体*在哪里*，而不只是场景里有什么。
- **LeJEPA**（Balestriero and LeCun，预印本，[arXiv:2511.08544](https://arxiv.org/abs/2511.08544)，2025 年 11 月）从理论上处理 4.1 节的坍缩问题。论文认为，使下游预测风险最小的嵌入分布是**各向同性高斯分布**（isotropic Gaussian），并用 **SIGReg**（Sketched Isotropic Gaussian Regularization）来强制这一分布：把一批嵌入投影到随机方向 $u$ 上，再用一个一维统计检验来惩罚每个一维投影 $u^\top z$ 偏离标准正态分布的程度。由于一个分布由它所有的一维投影唯一确定（Cramér-Wold 定理），匹配足够多的随机投影就会把整个分布推向目标。这样就去掉了坍缩玩具实验所需的那些启发式技巧：不需要 EMA 教师，不需要停止梯度，只有一个权衡超参数。可以把它与 4.1 节的 VICReg 对比：VICReg 只匹配前两阶矩（方差和协方差），而 SIGReg 在每个采样方向上匹配整个分布。
- **LeWorldModel**（Maes et al.，预印本，[arXiv:2603.19312](https://arxiv.org/abs/2603.19312)，2026 年 3 月）把同样的思想用在*世界模型*上。它是一个从原始像素端到端训练的 JEPA，只有两个损失项，损失超参数从六个减少到一个。它约有 1500 万参数，在单块 GPU 上几小时即可训练完成；作者报告其规划速度比基于大型预训练编码器的世界模型快最多 48 倍。早期的隐空间规划器（DINO-WM，3.3 节）依赖冻结的基础编码器，因为端到端的 JEPA 训练不稳定；LeWorldModel 声称已经不再需要这根拐杖。
- **VL-JEPA**（Chen et al.，预印本，[arXiv:2512.10942](https://arxiv.org/abs/2512.10942)，2025 年 12 月）把 JEPA 原则带到视觉语言领域。模型预测目标文本的连续*嵌入*，而不是生成 token，只在需要时才解码为文本。在受控比较中，它以少 50% 的可训练参数胜过一个 token 空间的基线。
- **DINO-world**（Baldassarre et al.，预印本，[arXiv:2507.19468](https://arxiv.org/abs/2507.19468)，2025 年 7 月）位于第 4 节两大阵营之间。它是一个通用视频世界模型，在冻结的 DINOv2 编码器的特征空间中预测未来帧。这是一个“中间”目标，既不是像素，也不是从零学习的隐变量。

**预测式与生成式之争**（第 4 节）并没有结束，但争论的焦点变了。隐空间预测获得了稳定而更简单的训练配方（LeJEPA、LeWorldModel）和稠密特征（V-JEPA 2.1）。与此同时，生成式视频模型变得实时而可控（第 3 篇更新），而最大的工业模型（如 Cosmos 3）如今在一个系统中同时包含推理模型和生成器。

### 评测：从“看起来对不对”到“有没有用”

第 5 节把评测分成五个问题。2025–2026 年的基准大多针对 5.2（物理）、5.3（控制）和 5.4（记忆），首批闭环基准则针对 5.5。下图把每个基准对应到它明确衡量的问题上。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-update-benchmarks.svg" width="85%" caption="根据各基准的摘要，它们明确评分的是第 5 节五个问题中的哪些（列 5.1 质量、5.2 物理、5.3 控制、5.4 记忆、5.5 有用性）。实心点是有名称的评测维度；空心点表示部分覆盖（WorldModelBench 中的文本指令遵循、WorldScore 中的“动态”）。虚线以上的基准来自 2024–2025 年，以下的来自 2026 年。物理（5.2 列）十分拥挤，记忆和有用性各只有两个基准。" %}

**物理（5.2）。** *WorldModelBench*（Li et al.，预印本，[arXiv:2502.20694](https://arxiv.org/abs/2502.20694)）把视频生成器当作世界模型来评判，考察指令遵循和物理一致性，并使用一个微调过的视觉语言评判模型。*VideoPhy-2*（Bansal et al.，预印本，[arXiv:2503.06800](https://arxiv.org/abs/2503.06800)）聚焦以动作为中心的物理常识。*IntPhys 2*（Bordes et al.，预印本，[arXiv:2506.09849](https://arxiv.org/abs/2506.09849)）把违背预期测试（5.2 节）带到复杂的合成场景中，报告模型的表现接近随机水平。*World Models' Last Exam in Physics*（Gao et al.，预印本，[arXiv:2610.08791](https://arxiv.org/abs/2610.08791)，2026 年 10 月）使用 40 个基于测量的任务，涵盖力学、光学、流体、热学、电磁学和表面张力。每个任务把起始图像和提示与物理判据配对，因此不需要参考视频。在八个视频生成器、1,280 段视频上，最好的模型得分为 57.76（满分 100）。

**控制（5.3）。** *WorldScore*（Duan et al.，ICCV 2025，[arXiv:2504.00983](https://arxiv.org/abs/2504.00983)）把世界生成视为沿指定相机路径的一系列“下一场景生成”，并对可控性、质量和动态评分。*WorldMark*（Xu et al.，预印本，[arXiv:2604.21686](https://arxiv.org/abs/2604.21686)，2026 年 4 月）在评测层面解决了第 6 节提到的“没有共享动作接口”的问题：用逐模型的适配器，把同样的 WASD 式输入转换给十个交互模型，覆盖 500 个用例。它加入了控制系统式的指标（方向准确率、响应延迟、运动稳定性），并发现响应最快的模型往往最不稳定。

**记忆与持久状态（5.4）。** *WBench*（Ying et al.，预印本，[arXiv:2605.25874](https://arxiv.org/abs/2605.25874)，2026 年 5 月）是多轮的：289 个用例、1,058 个交互轮次、22 个自动子指标，涵盖质量、设定与交互遵循、一致性和物理。在 20 个模型中，没有一个在所有维度上都领先。*WRBench*（"Current World Models Lack a Persistent State Core"，Lu et al.，预印本，[arXiv:2606.20545](https://arxiv.org/abs/2606.20545)，2026 年 6 月）利用相机运动把一个正在进行的事件*藏起来*，检查它在看不见时是否继续演化。在 23 个模型的 9,600 段视频上，模型通常会让事件从离开时的状态继续，而不是向前推进。这是 5.4 节重访测试的更尖锐版本：记住外观并不等于模拟状态。

**有用性（5.5）。** *World-in-World*（Zhang et al.，ICLR 2026 口头报告，[arXiv:2510.18135](https://arxiv.org/abs/2510.18135)）把世界模型放进与具身智能体构成的闭环中，按任务成功率而非视觉质量来评分。*WorldArena 2.0*（Li et al.，预印本，[arXiv:2605.17912](https://arxiv.org/abs/2605.17912)，2026 年 5 月）把具身世界模型基准扩展到视触觉输入、作为强化学习环境的世界模型，以及多种仿真和真实机器人。闭环分数正是第 6 节第 6 项所要求的：能预测有用性的评测。

一个互补的探针：*Video models are zero-shot learners and reasoners*（Wiedemer et al.，预印本，[arXiv:2509.20328](https://arxiv.org/abs/2509.20328)）在 Veo 3 从未训练过的感知、建模、操控和推理任务上测试它，并认为视频模型可能会像 LLM 之于语言那样，成为通用的视觉基础模型。

### 实验室与初创公司的公开主张（公司自述，未经同行评审）

以下是来自官方公告的主张。列出它们是为了让你能辨认这些说法，而不是因为它们已被独立验证。

- **Google DeepMind，Genie 4**（[2026 年 10 月 27 日](https://deepmind.google/blog/genie-4-a-new-generation-of-world-simulation/)）：物理和人物角色优于 Genie 3，原生音频，实时语言操控。未公布基准表、分辨率或帧率。
- **NVIDIA，Cosmos 3**（[2026 年 6 月 1 日](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Launches-Cosmos-3-the-Open-Frontier-Foundation-Model-for-Physical-AI/default.aspx)）：在多个世界生成排行榜（包括 Physics-IQ）、动作策略排行榜和视觉理解排行榜上位列开放模型第一。
- **World Labs，Atlas**（[2026 年 9 月 1 日](https://worldlabs.ai/blog/atlas)）：在与五个视频模型的比较中，人类评审有 75% 到 94% 的比例更偏好 Atlas；在文章的图表中，其 3D 重建误差低于各基线。
- **Wayve，GAIA-4**（[2026 年 8 月 3 日](https://wayve.ai/thinking/gaia-4/)）：为场景重建训练 GAIA，使其对记录世界的保真度提高了 2.5 倍。
- **AMI Labs。** 2025 年 12 月，Yann LeCun 确认创立新的世界模型初创公司 Advanced Machine Intelligence（AMI Labs），并亲任执行董事长（[TechCrunch，2025 年 12 月 19 日](https://techcrunch.com/2025/12/19/yann-lecun-confirms-his-new-world-model-startup-reportedly-seeks-5b-valuation)）。其宣称的目标是以世界模型替代 LLM，与第 1 节的立场论文一致。截至 2026 年 11 月，尚无公开的技术成果。

### 第 5、6 节有哪些变化

- 开放问题 1（记忆）成为视频世界模型最主要的研究前沿（第 3 篇更新），而 WRBench 表明*动态*的持久性仍然缺失。
- 开放问题 3（共享动作接口）在评测中借助适配器被部分绕开（WorldMark）；在机器人方面，则由视频与动作联合模型来应对（第 1 篇更新）。
- 开放问题 6（能预测有用性的评测）如今有了首批闭环基准（World-in-World、WorldArena 2.0）。它们的分数能否在不同任务和机器人之间保持相关，是下一个问题。
- 帮助你定位的综述与立场论文：*A Definition and Roadmap for World Models*（Chen et al.，[arXiv:2607.06401](https://arxiv.org/abs/2607.06401)）和 *A Tutorial on World Models and Physical AI*（Oh，[arXiv:2606.12783](https://arxiv.org/abs/2606.12783)），均为 2026 年的预印本。

关于 JEPA 式和生成式世界模型如何在机器人中使用，请继续阅读[具身智能系列]({{ '/blog/category/embodied-ai/' | relative_url }})；关于引擎和模拟器如何充当这些基准所依赖的真值，参见[图形引擎第 5 篇]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})。

## 代表性论文

| 论文 | 发表 | 年份 | 链接 | 为什么重要 |
| --- | --- | --- | --- | --- |
| A Path Towards Autonomous Machine Intelligence (LeCun) | OpenReview (position paper) | 2022 | [OpenReview](https://openreview.net/forum?id=BZ5a1r-kVsf) | 模块化架构、基于能量的模型、JEPA |
| Bootstrap Your Own Latent (BYOL, Grill et al.) | NeurIPS | 2020 | [arXiv:2006.07733](https://arxiv.org/abs/2006.07733) | EMA 目标网络无需负样本即可避免坍塌 |
| VICReg: Variance-Invariance-Covariance Regularization for Self-Supervised Learning (Bardes, Ponce, LeCun) | ICLR | 2022 | [arXiv:2105.04906](https://arxiv.org/abs/2105.04906) | 显式的防坍塌正则化 |
| Masked Autoencoders Are Scalable Vision Learners (MAE, He et al.) | CVPR | 2022 | [arXiv:2111.06377](https://arxiv.org/abs/2111.06377) | JEPA 所反对的像素重建基线 |
| Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture (I-JEPA, Assran et al.) | CVPR | 2023 | [arXiv:2301.08243](https://arxiv.org/abs/2301.08243) | 面向图像的特征预测 |
| Revisiting Feature Prediction for Learning Visual Representations from Video (V-JEPA, Bardes et al.) | TMLR | 2024 | [arXiv:2404.08471](https://arxiv.org/abs/2404.08471) | 面向视频的特征预测 |
| Intuitive physics understanding emerges from self-supervised pretraining on natural videos (Garrido et al.) | arXiv | 2025 | [arXiv:2502.11831](https://arxiv.org/abs/2502.11831) | 用期望违背范式评估 V-JEPA |
| V-JEPA 2: Self-Supervised Video Models Enable Understanding, Prediction and Planning (Assran et al.) | arXiv | 2025 | [arXiv:2506.09985](https://arxiv.org/abs/2506.09985) | 用于零样本机器人规划的动作条件隐空间世界模型 |
| DINO-WM: World Models on Pre-trained Visual Features enable Zero-shot Planning (Zhou et al.) | ICML | 2025 | [arXiv:2411.04983](https://arxiv.org/abs/2411.04983) | 在冻结的 DINOv2 特征上进行规划 |
| Navigation World Models (Bar et al.) | CVPR | 2025 | [arXiv:2412.03572](https://arxiv.org/abs/2412.03572) | 用于导航规划的生成式（扩散）世界模型 |
| Physion: Evaluating Physical Prediction from Vision in Humans and Machines (Bear et al.) | NeurIPS Datasets and Benchmarks | 2021 | [arXiv:2106.08261](https://arxiv.org/abs/2106.08261) | 带有人类数据的物理预测基准 |
| VBench: Comprehensive Benchmark Suite for Video Generative Models (Huang et al.) | CVPR | 2024 | [arXiv:2311.17982](https://arxiv.org/abs/2311.17982) | 多维度的视频质量评估 |
| Do generative video models understand physical principles? (Physics-IQ, Motamed et al.) | WACV | 2026 | [arXiv:2501.09038](https://arxiv.org/abs/2501.09038) | 视觉真实感并不意味着物理理解 |
| WorldModelBench: Judging Video Generation Models As World Models (Li et al.) | 预印本 | 2025 | [arXiv:2502.20694](https://arxiv.org/abs/2502.20694) | 指令遵循与物理一致性 |
| VideoPhy-2: A Challenging Action-Centric Physical Commonsense Evaluation in Video Generation (Bansal et al.) | 预印本 | 2025 | [arXiv:2503.06800](https://arxiv.org/abs/2503.06800) | 以动作为中心的物理常识 |
| WorldScore: A Unified Evaluation Benchmark for World Generation (Duan et al.) | ICCV | 2025 | [arXiv:2504.00983](https://arxiv.org/abs/2504.00983) | 指定相机的下一场景生成 |
| IntPhys 2: Benchmarking Intuitive Physics Understanding In Complex Synthetic Environments (Bordes et al.) | 预印本 | 2025 | [arXiv:2506.09849](https://arxiv.org/abs/2506.09849) | 复杂场景中的违背预期测试 |
| Back to the Features: DINO as a Foundation for Video World Models (Baldassarre et al.) | 预印本 | 2025 | [arXiv:2507.19468](https://arxiv.org/abs/2507.19468) | 在冻结的 DINOv2 特征空间中预测 |
| Video models are zero-shot learners and reasoners (Wiedemer et al.) | 预印本 | 2025 | [arXiv:2509.20328](https://arxiv.org/abs/2509.20328) | 在未训练过的视觉任务上探测 Veo 3 |
| World-in-World: World Models in a Closed-Loop World (Zhang et al.) | ICLR（口头报告） | 2026 | [arXiv:2510.18135](https://arxiv.org/abs/2510.18135) | 闭环、以任务成功率评测 |
| LeJEPA: Provable and Scalable Self-Supervised Learning Without the Heuristics (Balestriero, LeCun) | 预印本 | 2025 | [arXiv:2511.08544](https://arxiv.org/abs/2511.08544) | 用 SIGReg 取代 EMA 和停止梯度 |
| VL-JEPA: Joint Embedding Predictive Architecture for Vision-language (Chen et al.) | 预印本 | 2025 | [arXiv:2512.10942](https://arxiv.org/abs/2512.10942) | 预测文本嵌入而非 token |
| LeWorldModel: Stable End-to-End Joint-Embedding Predictive Architecture from Pixels (Maes et al.) | 预印本 | 2026 | [arXiv:2603.19312](https://arxiv.org/abs/2603.19312) | 端到端 JEPA 世界模型，两个损失项 |
| V-JEPA 2.1: Unlocking Dense Features in Video Self-Supervised Learning (Mur-Labadia et al.) | 预印本 | 2026 | [arXiv:2603.14482](https://arxiv.org/abs/2603.14482) | 稠密特征；机器人抓取更好 |
| WorldMark: A Unified Benchmark Suite for Interactive Video World Models (Xu et al.) | 预印本 | 2026 | [arXiv:2604.21686](https://arxiv.org/abs/2604.21686) | 用适配器统一控制；控制指标 |
| WorldArena 2.0 (Li et al.) | 预印本 | 2026 | [arXiv:2605.17912](https://arxiv.org/abs/2605.17912) | 具身、多平台的世界模型基准 |
| WBench: A Comprehensive Multi-turn Benchmark for Interactive Video World Model Evaluation (Ying et al.) | 预印本 | 2026 | [arXiv:2605.25874](https://arxiv.org/abs/2605.25874) | 多轮交互式评测 |
| Current World Models Lack a Persistent State Core (WRBench, Lu et al.) | 预印本 | 2026 | [arXiv:2606.20545](https://arxiv.org/abs/2606.20545) | 画面外的动态没有被模拟 |
| World Models' Last Exam in Physics (Gao et al.) | 预印本 | 2026 | [arXiv:2610.08791](https://arxiv.org/abs/2610.08791) | 基于测量的物理任务 |

## 学习资源

- 代码：[I-JEPA](https://github.com/facebookresearch/ijepa)、[V-JEPA](https://github.com/facebookresearch/jepa)、[V-JEPA 2](https://github.com/facebookresearch/vjepa2)、[直觉物理评估](https://github.com/facebookresearch/jepa-intuitive-physics)、[DINO-WM](https://github.com/gaoyuezhou/dino_wm)、[Physics-IQ 基准](https://github.com/google-deepmind/physics-IQ-benchmark)。
- LeCun 的立场论文本身篇幅很长，但可读性不错；关于架构和基于能量的模型的章节是核心。
- 自监督学习的背景知识：Balestriero et al., "A Cookbook of Self-Supervised Learning"（2023），以及 S. Prince 的 *Understanding Deep Learning* 中的相关章节（[udlbook.github.io/udlbook](https://udlbook.github.io/udlbook/)）。
- 关于这场争论中生成式的一方，可参考 Stanford [CS236](https://deepgenerativemodels.github.io/)。

## 练习

1. 在坍塌玩具示例中去掉 EMA（每一步都把在线编码器的权重复制到目标编码器，但保留停止梯度）。它会坍塌吗？这说明了预测器和 EMA 各自起什么作用？
2. 添加一个从 $\mathrm{Pred}(s_x)$ 重建 $y$ 的解码器，并与其联合训练（一个生成式辅助损失）。比较有无该解码器时线性探针的 $R^2$。你预期重建在什么情况下有帮助，在什么情况下有害？
3. 把 V-JEPA 2-AC 的规划目标写成一个 CEM 循环（采样、用预测器展开、以到目标嵌入的 L1 距离打分、重新拟合）。可复用第 1 篇中对 CEM 的描述。
4. 为视频世界模型设计一个重访一致性指标：指定相机路径、比较指标，以及一个能靠作弊拿到满分的基线。你如何排除这种作弊？
5. 从第 6 节中选一个开放问题，写一份半页的研究提案：假设、最小实验，以及你将如何评估它。
6. （2025–2026 年更新）在 4.1 节的坍缩玩具实验中，完全坍缩的编码器把每个输入都映射到同一个向量 $c$。说明此时每个一维投影 $u^\top z$ 是什么样子，以及为什么 SIGReg 式的惩罚（把每个投影与 $\mathcal{N}(0, 1)$ 比较）会很大。再考虑一种“维度坍缩”：嵌入只沿一个方向 $e_1$ 变化。哪些随机方向 $u$ 能检测到它？为什么足够多的随机方向总能发现它？

<details markdown="1"><summary>提示</summary>

完全坍缩时，每个投影都是常数 $u^\top c$，即方差为零的点质量，对任何 $u$ 都远离单位高斯。维度坍缩时，$u^\top z = (u^\top e_1)\, z_1$ 的方差为 $(u^\top e_1)^2 \operatorname{Var}(z_1)$。在高维中，对大多数随机的 $u$ 它都接近零，因此大多数方向看到的是近乎常数的投影，从而受到惩罚。根据 Cramér-Wold 定理，如果所有一维投影都与 $\mathcal{N}(0,1)$ 一致，那么分布就恰好是 $\mathcal{N}(0, I)$。

</details>

**下一篇：** 这是世界模型系列的最后一篇。请继续阅读[具身智能]({{ '/blog/category/embodied-ai/' | relative_url }})系列，或回到[第 1 篇]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})复习基础。
