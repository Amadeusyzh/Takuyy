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

论文的核心技术主张关乎*世界模型应当如何训练*。世界只是部分可预测的：风中一棵树上每片叶子的确切位置是不可预测的。一个必须输出像素的生成模型，要么得对所有这些无关的随机性建模，要么只能对其取平均（导致模糊）。LeCun 转而主张使用**基于能量的模型**（energy-based models），训练它们为相容的样本对 $(x, y)$ 赋予低能量，其中 $x$ 是观测到的过去，$y$ 是未来；并主张**在学到的表示空间中**进行预测，在这个空间里不可预测的细节可以被丢弃。

### 1.1 JEPA

**联合嵌入预测架构**同时对 $x$ 和 $y$ 进行编码，并根据 $x$ 的嵌入来预测 $y$ 的*嵌入*，可选地引入一个隐变量 $z$ 来刻画 $x$ 无法决定的部分（或者引入一个动作 $a$）：

$$
s_x = \mathrm{Enc}_x(x),\qquad s_y = \mathrm{Enc}_y(y),\qquad
E(x, y, z) = D\big(s_y,\ \mathrm{Pred}(s_x, z)\big).
$$

其危险在于**表示坍塌**：如果编码器输出常数，那么对任何样本对能量都为零。防止坍塌的方法分为两类：

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

## 5. 世界模型如何评估？

目前没有一个公认的单一基准。把问题拆成以下五个会更有帮助。

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

**下一篇：** 这是世界模型系列的最后一篇。请继续阅读[具身智能]({{ '/blog/category/embodied-ai/' | relative_url }})系列，或回到[第 1 篇]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})复习基础。
