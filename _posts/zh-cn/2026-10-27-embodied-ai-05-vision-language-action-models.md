---
layout: post
title: "视觉-语言-动作模型：RT-2、OpenVLA、pi0、GR00T 与 Gemini Robotics"
date: 2026-10-27 18:05:00+0900
description: "机器人基础模型是如何构建的：从 RT-1、RT-2 到 Octo、OpenVLA、pi0/pi0.5、GR00T N1 和 Gemini Robotics；动作分词与流匹配动作头、跨本体训练、评测，以及世界模型如何进入机器人学习。"
categories: embodied-ai
tags: [vla, foundation-models, rt-2, openvla, pi0, world-models]
series: embodied-ai
series_order: 5
toc:
  sidebar: left
related_posts: false
mermaid:
  enabled: true
  zoomable: true
---

## 为什么重要

[模仿学习]({{ '/blog/2026/embodied-ai-04-imitation-learning/' | relative_url }})能用几十条示范教会机器人一项技能。
**视觉-语言-动作模型**（Vision-Language-Action model, VLA）的目标则是一个单一策略：输入相机图像和自然语言指令，为许多任务、
场景乃至不同的机器人本体输出动作。其配方借鉴了大型语言模型和视觉-语言模型：从在互联网上预训练的模型出发，再在 Open
X-Embodiment 这类大规模、异构的机器人数据集上训练。自 2023 年起，这已成为工业界和学术界机器人学习的主要方向。本文介绍主要
模型、区分它们的设计模式、评测方式，以及世界模型在其中的位置。

**前置知识**

- 第 1 到 4 篇，尤其是动作分块和扩散/流动作头（第 4 篇）。
- Transformer 与视觉-语言模型（ViT/SigLIP 编码器、LLM 解码器、分词）。
- 流匹配或扩散的基础。[世界模型系列]({{ '/blog/category/world-models/' | relative_url }})会深入讨论视频世界模型与 JEPA。

## 1. 从语言条件策略到 VLA

早期系统把语言和控制分开。**SayCan**（Ahn 等 CoRL 2022）用 LLM 从固定技能库中提出下一个技能，并把 LLM 的得分乘以一个学习
得到的价值函数——它估计该技能在当前状态下能否成功——从而把语言模型落地到机器人实际能做的事情上。技能本身是普通的语言条件策略。

**RT-1**（Brohan 等 RSS 2023）是第一个大型"机器人 Transformer"：一个在约 13 万条真实世界回合上训练的策略，覆盖 700 多个任务，
由 13 台移动操作机器人在 17 个月内采集。它用以指令嵌入为条件的 FiLM EfficientNet 对图像分词，用 TokenLearner 压缩，再用
Transformer 以约 3 Hz 输出**离散化动作**（手臂、底盘和模式的每个维度 256 个箱）。RT-1 表明，主导泛化能力的是数据规模和多样性，
而不是精巧的算法。

**PaLM-E**（Driess 等 ICML 2023）走了另一条路：把连续的传感器观测（图像、状态估计）作为 token 注入大型语言模型，端到端地训练它
做具身推理和规划。最大的版本有 5620 亿参数，在学会机器人规划任务的同时保留了通用的语言能力。

**RT-2**（Brohan 等 CoRL 2023）把两种思路合二为一，并提出了 VLA 这个术语。它微调大型视觉-语言模型（PaLI-X 和 PaLM-E），让它们
**以文本 token 的形式**输出机器人动作：7 个动作维度加一个终止标志各自离散化为 256 个箱，写成一串整数。关键在于它在机器人数据和
原有的网络视觉-语言数据上**联合微调**（co-fine-tuning），因此模型保留了语义知识。RT-2 能遵循涉及机器人数据中从未出现的概念的
指令（"把香蕉移到二加一之和那里"、"捡起已灭绝的动物"），因为这些知识来自网络。

## 2. 开放的通用策略

| 模型 | 年份 | 主干 | 动作输出 | 数据 | 备注 |
| --- | --- | --- | --- | --- | --- |
| Octo | 2024 | 从零训练的 Transformer（27M / 93M） | 扩散头，动作块 | 80 万条 OXE 轨迹 | 灵活的观测与目标 token，易于微调 |
| OpenVLA | 2024 | Llama 2 7B + DINOv2 + SigLIP（Prismatic VLM） | 256 箱动作 token | 97 万条 OXE 回合 | 开放权重；在 29 个任务上绝对成功率比 RT-2-X（55B）高 16.5% |
| RDT-1B | 2024 | 扩散 Transformer，1.2B | 统一动作空间上的扩散 | 多机器人，侧重双臂 | "物理可解释的统一动作空间" |
| pi0 | 2024 | PaliGemma 3B + 300M 动作专家 | 流匹配，50 步动作块 | 大规模跨本体混合数据 + OXE | 灵巧的长时程任务（叠衣服） |
| pi0.5 | 2025 | pi0 系列 | 离散（FAST）+ 流匹配专家 | 机器人 + 网络 + 高层子任务数据 | 在未见过的家庭中打扫厨房和卧室 |
| GR00T N1 | 2025 | Eagle-2 VLM（System 2）+ 扩散 Transformer（System 1） | 高频率的流匹配 | 真实 + 合成 + 人类视频的"数据金字塔" | 面向人形机器人的开放模型 |
| Gemini Robotics | 2025 | Gemini 2.0 | 低延迟动作解码器 | 大规模 ALOHA 2 双臂数据 + 网络数据 | 另有用于具身推理的 Gemini Robotics-ER |
| SmolVLA | 2025 | 小型 VLM（总计约 0.45B） | 流匹配动作专家 | 社区 LeRobot 数据集 | 可在消费级硬件上运行 |

把本文的模型和第 5 节的世界模型工作放到时间轴上，可以看出 2022 年以来这个领域发展得有多快：

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/05-timeline.svg" localized="true" caption="机器人策略与 VLA（上）以及用于机器人的世界模型或视频模型（下），按本文所引论文在 arXiv 上第一版的月份放置（由 arXiv 编号读出）。会议版本通常晚几个月才出现；这张图要说明的是先后顺序，而不是精确日期。" %}

### Octo

Octo（Octo Model Team，RSS 2024）是一个在 Open X-Embodiment 的 80 万条轨迹上预训练的基于 Transformer 的策略。观测（多路相机、
本体感觉）和任务规格（语言或目标图像）被分词后，由一个使用分块注意力的 Transformer 处理；读出 token 送入一个小型**扩散头**，
预测动作块。它的设计目标是可适配性：微调时可以通过增加分词器和输出头来接入新的传感器或动作空间。

### OpenVLA

OpenVLA（Kim 等 CoRL 2024）是开源版的 RT-2：一个 7B 的 Prismatic VLM（Llama 2 加上融合的 DINOv2 与 SigLIP 特征），在 97 万条回合上
微调以输出 256 箱动作 token，这些 token 覆盖了 Llama 词表中最少使用的 256 个 token。它表明，用 LoRA 微调到新机器人只需一块 GPU，
而且融合 DINOv2+SigLIP 的视觉编码器有助于空间推理。**OpenVLA-OFT**（Kim 等 RSS 2025）后来发现，一套"优化微调"配方（并行解码
动作块、使用 L1 损失的连续动作）能大幅提升成功率和推理速度。

### pi0 与 pi0.5

**pi0**（Black 等，Physical Intelligence，RSS 2025）在 PaliGemma VLM 之外增加了一个独立的**动作专家**（action expert，约 3 亿参数）。
图像和语言经过 VLM；动作专家处理本体感觉和带噪声的动作 token，关注 VLM 的 token，并用**流匹配**训练以输出 $H = 50$ 个连续动作组成
的动作块，从而实现高频率的灵巧控制（叠衣服、收拾餐桌、组装纸箱）。两套权重构成一个类似混合专家的 Transformer：VLM 的 token 从不
关注动作 token，因此 VLM 的知识得到保护。

**FAST**（Pertsch 等 RSS 2025）重新审视了离散 token：它用**离散余弦变换**（DCT）压缩动作块，量化系数，再做字节对编码（BPE）。
平滑的动作块只变成少量 token，使自回归 VLA 能在高频数据上训练，而且训练速度比扩散式动作头快得多。

**pi0.5**（Physical Intelligence，CoRL 2025）瞄准**开放世界泛化**：一台移动操作机器人在训练时从未见过的家庭中打扫厨房和卧室。它的
关键在于**异构数据联合训练**：来自多种机器人的数据、网络数据（图像描述、VQA、目标检测）以及高层语义标注。推理时，模型先用文本
预测一个高层子任务（"拿起盘子"），再为它预测底层动作，全部在一个模型内完成。作者报告，在新家庭中的表现随不同训练环境数量的增加
而提升。

### GR00T N1

NVIDIA 的 **GR00T N1**（2025）是面向人形机器人的开放基础模型，采用受"快思考与慢思考"启发的**双系统**架构：System 2 是视觉-语言
模块（Eagle-2 VLM），以约 10 Hz 理解场景和指令；System 1 是用流匹配训练的扩散 Transformer，以高频率生成运动动作（论文报告为
120 Hz）。两者端到端联合训练。训练使用一个**数据金字塔**：底层是网络和人类视频，中间是来自仿真和神经视频生成的合成数据，顶层是
真实机器人数据。人类视频和生成视频没有动作标签，因此要为它们推断潜在动作（latent action）或逆动力学伪标签。

### Gemini Robotics

Google DeepMind 的 **Gemini Robotics**（2025）在 Gemini 2.0 之上构建了 VLA。配套模型 **Gemini Robotics-ER**（具身推理，embodied
reasoning）用指点、目标检测、3D 包围盒、轨迹和抓取预测扩展了 Gemini 的空间理解能力。VLA 本身拆分为云端的主干和本地的动作解码器，
以保持低延迟；报告展示了在 ALOHA 2 上的长时程灵巧任务、用约 100 条示范快速适应新的短任务，以及适应新的机器人本体。
**Gemini Robotics 1.5**（技术报告，2025）加入了行动前的"思考"，并能把在一种本体上学到的运动迁移到其他本体。

## 3. 设计模式

```mermaid
flowchart LR
  I[相机图像] --> V[视觉编码器: SigLIP / DINOv2]
  L[语言指令] --> T[分词器]
  V --> B[在网络数据上预训练的 VLM 主干]
  T --> B
  P[本体感觉] --> E
  B -->|token 或 KV cache| E[动作头]
  E --> A[动作块 a_t ... a_t+H]
  A --> C[底层控制器: IK, 阻抗, PD]
```

把动作接到 VLM 上的两种主流方式，并排画出来是这样的：

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/05-vla-architectures.svg" localized="true" caption="(a) RT-2 和 OpenVLA 把每个动作维度写成 256 个 token 之一，并用 VLM 自身自回归地解码；图中的 token 数值只是随意举例。(b) pi0 保留 VLM 处理图像和语言，另加一个独立的动作专家：它接收本体感知和含噪的动作块，关注 VLM 的 token，预测流匹配的速度场，再经约 10 步欧拉积分得到包含 50 个连续动作的块。" %}

### 动作表示

主要有两类：

1. **离散动作 token**（RT-1、RT-2、OpenVLA、FAST）。每个维度 $a^{(j)}\in[\ell_j, u_j]$ 映射到一个箱
   $b^{(j)} = \lfloor (a^{(j)}-\ell_j)/(u_j-\ell_j)\cdot 256\rfloor$，模型用常规的下一 token 交叉熵训练。优点：原封不动地复用 LLM 机制；类别输出天然
   支持多模态。缺点：每步每维一个 token，使高频动作块又长又解码缓慢，除非进行压缩（FAST）。
2. **连续生成式动作头**（Octo、pi0、GR00T、RDT）：一个扩散或流匹配模型以主干特征为条件预测整个动作块。优点：精确、平滑，
   对长动作块只需少量积分步，速度快。缺点：多了一个网络，而且动作损失的梯度可能扰乱预训练主干（Physical Intelligence 后来关于
   "知识隔离"（knowledge insulation）的工作阻断了这些梯度，改用离散 token 训练主干）。

两者都依赖**动作分块**（第 4 篇）和细致的**归一化**（按数据集的分位数，例如把第 1 和第 99 百分位映射到 $\pm 1$），因为不同机器人和
数据集的单位与范围各不相同。

下面的代码同时展示两者：256 箱分词及其量化误差，以及 FAST 思路下的 DCT 压缩。

```python
import numpy as np
from scipy.fft import dct, idct

# ---- RT-2 / OpenVLA style: 256 uniform bins per action dimension ----
def to_bins(a, low, high, n_bins=256):
    a = np.clip(a, low, high)
    return np.minimum(((a - low) / (high - low) * n_bins).astype(int), n_bins - 1)

def from_bins(b, low, high, n_bins=256):
    return low + (b + 0.5) * (high - low) / n_bins        # bin centers

# a smooth 7-D action chunk (xyz, rpy, gripper) at 50 Hz for 1 s
t = np.linspace(0, 1, 50)[:, None]
chunk = np.concatenate([0.05 * np.sin(2 * np.pi * t * [1, 0.5, 0.25]),
                        0.1 * np.cos(np.pi * t * [1, 2, 3]),
                        (t > 0.5).astype(float)], axis=1)  # [50, 7]
low, high = chunk.min(0) - 1e-3, chunk.max(0) + 1e-3     # per-dimension range (from the dataset)
tokens = to_bins(chunk, low, high)                        # [50, 7] integers -> 350 tokens
err = np.abs(from_bins(tokens, low, high) - chunk).max()
print(f"binning: {tokens.size} tokens, max error {err:.5f}")

# ---- FAST-style: DCT along time, quantize, keep the few non-zero coefficients ----
coef = dct(chunk, axis=0, norm="ortho")                   # [50, 7] frequency coefficients
for scale in [10.0, 50.0, 200.0]:
    q = np.round(coef * scale).astype(int)                # most high frequencies round to 0
    recon = idct(q / scale, axis=0, norm="ortho")
    print(f"DCT scale {scale:5.0f}: {np.count_nonzero(q):3d} non-zero of {q.size} coefficients, "
          f"mean error {np.abs(recon - chunk).mean():.4f}")
```

```text
binning: 350 tokens, max error 0.00096
DCT scale    10:  35 non-zero of 350 coefficients, mean error 0.0052
DCT scale    50:  42 non-zero of 350 coefficients, mean error 0.0016
DCT scale   200:  57 non-zero of 350 coefficients, mean error 0.0005
```

一个 50 Hz、1 秒的动作块，按步分箱需要 350 个 token，而 DCT 后只有几十个非零系数，因为平滑运动的能量集中在低频。FAST 随后对这个
稀疏整数矩阵做游程/BPE 编码，得到一个短 token 序列；缩放系数就是在压缩率与精度之间调节的旋钮。

下面两张图展示了这些数字对代码中构造的动作块意味着什么：先是某一维上的 256 个箱，然后是 DCT 把动作块的能量放在了哪里。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/05-binning.svg" caption="上：代码中的 7 维动作块（为便于显示，每一维都单独缩放）：位置和姿态是平滑的正弦曲线，夹爪是一个阶跃。下：放大 $x$ 维的峰值附近。在它的取值范围内分 256 个箱，每个箱只有 0.40 mm 宽（灰线），所以解码出的箱中心（红色）紧贴连续动作：整个动作块的最大误差为 0.00096。代价是每一步每一维一个 token，这个 1 秒的动作块需要 350 个 token。" %}

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/05-dct-fast.svg" caption="左上：同一动作块 DCT 系数的幅值（对数刻度；行为时间频率）。平滑的维度把能量集中在最前面几行；夹爪的阶跃则把能量分散到许多频率上。中上和右上：在缩放系数 10（350 个中剩 35 个）和 50（42 个）下取整后仍非零的系数。下：用缩放 10 时的 35 个整数重建的结果。平滑维度几乎完全一致，夹爪在阶跃附近有轻微振铃，这就是需要精度时要用更大缩放系数的原因。" %}

### 流匹配动作专家

另一类方法，以 pi0 和 GR00T 为代表，学习一个以主干特征 $c$ 为条件、把高斯噪声输运到动作块的速度场。取线性路径
$A^t = (1-t)\,\epsilon + t\,A$，目标速度是常数 $\frac{d}{dt}A^t = A - \epsilon$，损失为

$$
\mathcal{L}(\theta) = \mathbb{E}_{t\sim p(t),\,\epsilon\sim\mathcal{N}(0,I),\,(A,c)\sim\mathcal{D}}\left[\left\lVert v_\theta(A^t, t, c) - (A - \epsilon)\right\rVert^2\right].
$$

采样时从 $t = 0$ 到 $t = 1$ 积分 $dA/dt = v_\theta$，通常用约 10 个欧拉步。（pi0 使用同样的思想，但有自己的时间约定，并用一个偏向
噪声较大时间步的 Beta 形分布 $p(t)$。）在下面的玩具例子中，一个随机向量代替了两条指令"向左"和"向右"的 VLM 嵌入：

```python
import math
import torch
import torch.nn as nn
import torch.nn.functional as F

torch.manual_seed(0)
H, A, C = 8, 2, 64           # chunk length, action dim, size of the "VLM" context embedding

class ActionExpert(nn.Module):
    """v_theta(A_t, t, c): predicts the flow velocity for a whole action chunk.
    pi0 uses a transformer "action expert" attending to the VLM's tokens; an MLP keeps this toy fast."""
    def __init__(self, hidden=256):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(H * A + C + 32, hidden), nn.SiLU(),
                                 nn.Linear(hidden, hidden), nn.SiLU(),
                                 nn.Linear(hidden, hidden), nn.SiLU(),
                                 nn.Linear(hidden, H * A))
    def forward(self, a_t, t, c):
        freqs = torch.exp(torch.arange(16) * (-math.log(1000.0) / 16))
        emb = 1000 * t[:, None] * freqs[None]             # sinusoidal embedding of flow time
        x = torch.cat([a_t.flatten(1), c, emb.sin(), emb.cos()], -1)
        return self.net(x).view(-1, H, A)

def flow_matching_loss(model, actions, ctx):
    """Linear path from noise (t=0) to data (t=1); regress the constant velocity."""
    eps = torch.randn_like(actions)
    t = torch.rand(actions.shape[0])
    a_t = (1 - t)[:, None, None] * eps + t[:, None, None] * actions
    return F.mse_loss(model(a_t, t, ctx), actions - eps)

@torch.no_grad()
def sample(model, ctx, steps=10):
    a = torch.randn(ctx.shape[0], H, A)
    for i in range(steps):                                # forward Euler on da/dt = v
        t = torch.full((ctx.shape[0],), i / steps)
        a = a + model(a, t, ctx) / steps
    return a

# toy data: two instructions ("go left" / "go right") encoded as fixed context vectors
instr = torch.randn(2, C)
def batch(n):
    side = torch.randint(0, 2, (n,))
    tt = torch.linspace(0, 1, H)
    y = (side.float() * 2 - 1)[:, None] * torch.sin(math.pi * tt) * 0.5
    return torch.stack([tt.expand(n, H), y], -1), instr[side], side

model = ActionExpert()
opt = torch.optim.AdamW(model.parameters(), lr=1e-3)
for it in range(3000):
    act, ctx, _ = batch(128)
    loss = flow_matching_loss(model, act, ctx)
    opt.zero_grad(); loss.backward(); opt.step()
act, ctx, side = batch(512)
pred = sample(model, ctx)
ok = (torch.sign(pred[:, H // 2, 1]) == (side * 2 - 1)).float().mean()
print(f"final loss {loss.item():.4f}; follows the instruction in {ok:.1%} of samples; "
      f"chunk error {(pred - act).abs().mean():.3f}")
```

```text
final loss 0.0246; follows the instruction in 100.0% of samples; chunk error 0.018
```

一个小网络走 10 个欧拉步，就能为每条指令把噪声变成正确的动作块。在真实的 VLA 中，上下文是主干的 token（由 Transformer 动作专家
关注），动作块有 50 步、7 到 30 多个维度，而指令集是开放的。

记录下这十步欧拉积分，就能看到流在起作用：含噪的动作块被（平均意义上沿直线）运送到与各自指令相符的动作块。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/05-flow-matching.svg" caption="从上面的玩具动作专家采样，模型用相同代码与种子重新训练（最终损失 0.0246，与打印结果一致）。每条线是 $x$-$y$ 平面上一个 8 步的动作块，按所条件化的指令着色；按本文的约定，“go left” 向 $y$ 负方向弯曲。$t = 0$ 时动作块是高斯噪声；10 步欧拉积分中走完 3 步和 6 步后，它们向数据收缩；到 $t = 1$ 时，全部 40 个动作块都遵循各自的指令。" %}

### 跨本体训练

数据集在机器人、相机、控制频率和动作空间上各不相同。常见的选择：

- **共享的动作约定**，通常是末端执行器增量加夹爪，按数据集归一化；或者使用一个补齐的"统一"动作向量，每种本体填写自己的槽位
  （RDT、pi0），再加上本体或数据集 token。
- **带权重的数据混合**：大量使用的数据集降权，多样化的数据集升权；pi0.5 表明，即使只针对一个目标机器人，网络数据和跨机器人数据
  也能提升在新环境中的泛化能力。
- **没有动作的人类数据和合成数据**（GR00T 的数据金字塔）：潜在动作模型从相邻帧推断伪动作，使视频能传授运动先验。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/05-cross-embodiment.svg" localized="true" caption="上：统一的动作向量（示例布局，并非某个具体模型的布局）：每种本体填自己的槽位，未用到的尾部是填充，在损失中被屏蔽。下：两个单位和分布宽度都不同的合成动作数据集，在按数据集做分位数归一化（把第 1 和第 99 百分位映射到 $\pm 1$）前后的对比。归一化之后两者使用相同的数值范围，谁也不会主导损失。" %}

### 层级与推理

长任务需要规划。可选方案包括：外部 LLM/VLM 规划器调用 VLA（SayCan 式）；一个模型在动作之前先预测子任务（pi0.5）；由慢速推理器和
快速执行器组成的双系统设计（GR00T N1，以及 Figure 公开介绍的 Helix）；以及在行动前用文本或指点、包围盒进行推理的"具身思维链"
（Gemini Robotics-ER 与 1.5）。

## 4. 规模化与评测

评测 VLA 很难：每次真实运行都要花费数分钟的人力，成功与否取决于场景布置，而不同随机种子和评测者之间的方差很大。逐渐形成的做法：

- **泛化维度**：视觉（新背景、光照、干扰物）、语义（新物体、新指令）、行为（新位置、新动作）以及本体（新机器人）。RT-2 和
  OpenVLA 都按这些维度报告结果。
- **标准化的仿真代理**：用 LIBERO 比较微调效果，用 SimplerEnv（第 3 篇）评估在真实 Google 机器人和 WidowX 数据上训练的策略，并明确
  测量仿真与现实的相关性。
- **跨机构的盲 A/B 评测**和成对比较，以减少评测者偏差。
- **规模化研究**：pi0.5 的环境数量扩展、OXE 的跨本体收益和 GR00T 的数据混合都表明，场景和本体的多样性至少和原始回合数一样重要。
  与语言模型不同，我们还没有关于机器人成功率的清晰幂律。

部署方面的问题非常实际：推理延迟（每秒只能跑几次的 7B 模型需要动作分块和异步执行）、机器人上的算力、底层控制器中的安全约束，
以及失败检测。

## 5. 用于机器人学习的世界模型

**世界模型**（world model）预测观测在给定动作下如何演化。世界模型系列会深入讨论它们；这里列出它们与机器人学相遇的主要方式：

1. **用于 RL 的学习型仿真器。** Dreamer 式智能体学习一个隐空间动力学模型，并在"想象"中训练策略。**DayDreamer**（Wu 等 CoRL 2022）
   只用约一小时的真实交互就让四足机器人从零学会行走，DreamerV3（Hafner 等，Nature 2025）把这一配方推广到多个领域。
2. **把视频预测当作规划。** **UniPi**（Du 等 NeurIPS 2023）根据文本指令生成任务完成过程的视频，再用逆动力学模型提取动作。
   **GR-1**（Wu 等 ICLR 2024）在大规模视频预测上预训练一个 GPT 式模型，再微调使其联合预测动作和未来帧。
3. **从视频中学到的交互式仿真器。** **UniSim**（Yang 等 ICLR 2024）从多样数据中学习一个动作条件视频仿真器，并用它训练策略和
   规划器；**Genie**（Bruce 等 ICML 2024）从无标签视频中学习潜在动作，使生成的世界可以被控制。NVIDIA 的 **Cosmos** 世界基础模型
   （2025）被设计为可以后训练成面向机器人和自动驾驶的仿真器与合成数据生成器（GR00T 的"神经轨迹"就是一种用法）。
4. **隐空间规划。** **V-JEPA 2**（Assran 等，2025）用联合嵌入预测目标在超过一百万小时的互联网视频上预训练视频编码器，然后在来自
   DROID 的约 62 小时无标签机器人视频上训练一个动作条件预测器（V-JEPA 2-AC）。在学到的隐空间中以目标图像进行规划，实现了在两个
   实验室的 Franka 机械臂上零样本抓取放置，无需任务特定数据或奖励。
5. **策略评估。** 由于真实评测昂贵，动作条件世界模型可以充当学习得到的评估器，在策略上真机之前对它们排序——前提是它已对照真实
   结果验证过。

```mermaid
flowchart TB
  D[机器人与人类视频] --> W[世界模型]
  W --> R1[用于 RL 的想象轨迹]
  W --> R2[合成示范]
  W --> R3[隐空间规划 / MPC]
  W --> R4[策略评估]
  R1 --> P[策略 / VLA]
  R2 --> P
  R3 --> P
```

悬而未决的问题是：能否让一个模型同时兼任两者——既是预测动作的 VLA，又是预测动作后果的世界模型——并联合训练，使两者相互促进。
2025 年已有若干系统同时训练动作预测和未来帧预测。

## 6. 开放问题

- **数据**：机器人数据仍比文本或视频少几个数量级；人类视频、仿真和 XR 遥操作（第 6 篇）是主要杠杆。
- **精度与接触**：VLA 擅长语义和粗略运动，对毫米级精度、力敏感的操作则较弱；触觉感知和力感知的动作空间是活跃的研究方向。
- **记忆与长时程**：大多数 VLA 只看最近的一两帧。
- **可靠性**：80% 的成功率在论文里令人印象深刻，在家庭中却不可接受；从部署中学习（RL 微调、人工介入）是下一个前沿。
- 可在不同实验室间复现的**评测**。

## 动手试试

主页 **[Lab]({{ '/' | relative_url }}#lab)** 中有一个"Gaussian World"演示：描述一个世界，就会构建出一个由约 20 万个 3D 高斯组成的
可编辑开放世界（由一个关键词驱动的程序化生成器代替学习模型），而且它是"活"的：可以重新打光、塑形、在其中行走。它是上面那些
生成式世界模型的一个迷你版。结合 XPBD 物理演示，它暗示了长远的图景：带物理的生成式三维世界，VLA 在其中被训练和评估。

## 2025–2026 年进展（截至 2026 年 11 月）

前面各节描述的是 2026 年初的状况，本节补充此后到 2026 年 11 月为止的新工作。ICLR 2026（4 月，里约热内卢）、ICRA 2026（6 月，维也纳）、ICML 2026（7 月）和 RSS 2026（7 月，悉尼）都已召开；CoRL 2026（11 月 9–12 日，奥斯汀）还有一周，因此其论文在这里按预印本引用。每项工作都注明了状态：已发表、已录用、预印本或官方公告。许多工业界模型只有博客文章，我们会明确指出。

下面的浏览器把本文和本节的模型放在同一条时间线上：每条泳道是一个机构或模型家族，灰色曲线表示“基于”。用筛选器可以看出三个趋势：流匹配（flow matching）逐渐成为主流动作头；开放权重从学术界扩展到 NVIDIA 和 Physical Intelligence；2026 年人形机器人成为主要目标。

{% include widget.liquid name="embodied-ai-vla-explorer" height="560" caption="交互：按动作头、是否开放权重或本体类型筛选。点击模型可查看摘要、状态和链接（摘要为英文）。颜色 = 动作头，实心 = 开放权重，灰色曲线 = 基于。手机上时间轴向下延伸。日期为 arXiv 首个版本或官方公告的月份。" %}

{% comment %} 运行 bin/figures/embodied-ai/embodied_ai_updates.py 生成 SVG 后再启用：
{% include blog_figure.liquid path="assets/img/blog/embodied-ai/05-update-vla-timeline.svg" localized="true" caption="上：与浏览器相同的模型，画成静态时间线（实心 = 开放权重，空心 = 未开放）。下：本列表中每年的模型数，按动作头分类。2022–2023 年以离散 token 为主，2024 年出现扩散头；从 2025 年起流匹配成为最常见的动作头，“其他”的比例上升是因为若干工业界模型没有公开动作头。该列表是精选，而非完整统计。" %}
{% endcomment %}

### Physical Intelligence：从 pi0.5 到 pi0.7

- **知识隔离**（knowledge insulation，Driess 等，NeurIPS 2025）解决了给 VLM 加动作专家时的一个问题：动作专家的梯度会损害 VLM 原有的知识。主干网络用离散的 FAST token 和网络数据训练，流匹配动作专家则通过停止梯度（stop-gradient）读取主干特征。这样训练依然快，推理仍输出连续动作块，语言跟随能力也更好。openpi 中的 pi0.5 权重采用了这一做法。
- **实时分块**（real-time chunking，Black 等，NeurIPS 2025）让分块流策略异步运行：机器人执行当前动作块时，下一块作为一个*修复*（inpainting）问题生成，已提交的动作被冻结，重叠部分被引导与之衔接。无需重新训练，就能消除第 3 节提到的动作块边界处的停顿和抖动。
- **pi\*0.6**（Physical Intelligence，arXiv 预印本，2025 年 11 月）提出 **Recap**（基于优势条件策略、利用经验与纠正的强化学习）。一个价值函数为示范、专家纠正和自主执行数据的每一段打分，VLA 在二值化优势的条件下训练，部署时要求输出“好”的动作。这是一种不需要通过流匹配头做策略梯度的离线 RL。官方报告称在最难的任务（制作意式咖啡、在家中叠衣服、组装纸箱）上吞吐量提高了一倍以上。优势函数的概念见[第 2 篇]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})。
- **pi0.7**（arXiv 预印本，2026 年 4 月）让提示（prompt）更丰富：除语言外，还包含片段元数据（示范质量、速度）、控制模态和可选的子目标图像。这样，质量参差的数据和其他本体的数据都能用于训练而不拖累策略，测试时在提示中要求“高质量”即可。报告展示了在没有叠衣数据的本体上零样本叠衣。pi.website 上两篇未经同行评审的研究文章（2026 年 3 月）还加入了记忆（压缩视频加文本笔记，可处理约 15 分钟的任务）和用于快速在线 RL 的“RL token”；后者随后以 arXiv 预印本发表（见第 2 篇）。

### Google DeepMind：从 Gemini Robotics 1.5 到 2

**Gemini Robotics On-Device**（2025 年 6 月，公告）是 DeepMind 第一个无需联网、可用 50–100 条示范微调的 VLA。**Gemini Robotics-ER 1.6**（2026 年 4 月，通过 Gemini API 提供）改进了指点、计数和成功检测，并加入与 Boston Dynamics 合作开发的仪表读数能力。**Gemini Robotics 2**（2026 年 7 月公告；VLA 面向早期合作伙伴，ER 2 为预览版）把控制从双臂桌面操作扩展到 Apptronik Apollo 2 等**全身人形机器人**；ER 2 可协调多台机器人完成数分钟的任务，On-Device 2 用不到 200 个示例即可适配新的双臂本体。这些都没有完整论文，只有博客和安全报告，公告之外的架构细节未知。

### NVIDIA：GR00T N1.5 到 N1.7，以及作为世界动作模型的 N2

- **GR00T N1.5**（2025 年 6 月，开放权重）冻结 Eagle 2.5 VLM，加入 **FLARE** 损失，使策略特征与未来观测的嵌入对齐，并使用 DreamGen 的“神经轨迹”（见下文）训练。
- **GR00T N1.6**（2025 年 12 月，非商用许可的开放权重）改用基于 Cosmos 的 2B VLM 并解冻其顶层，动作 DiT 为 32 层，预测**相对当前状态**的动作块，这正是第 3 节归一化问题的一个实例。
- **GR00T N1.7**（2026 年 3 月抢先体验，现已在 GitHub 发布）采用 Cosmos-Reason2-2B 主干，通过人手与机器人夹爪共享的相对末端执行器动作空间，加入约 2 万小时来自 EgoScale 的第一人称人类视频（见[第 6 篇]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})）。
- **DreamZero**（Ye 等，arXiv 预印本，2026 年 2 月）主张**世界动作模型就是零样本策略**：一个 14B 的自回归视频扩散模型同时生成未来视频*和*动作，以约 7 Hz 闭环运行。NVIDIA 在 2026 年 3 月的 GTC 上预告了基于这一设计的 **GR00T N2**，称将于“年底前”发布；截至 2026 年 11 月，它仍只是公告。

### Figure：Helix、Helix 02 与 Helix 2.5

**Helix**（2025 年 2 月，公告）就是第 3 节提到的双系统设计：7B VLM（System 2）以 7–9 Hz 运行，把潜向量传给一个 8000 万参数的 Transformer（System 1），后者以 200 Hz 控制 35 自由度的上半身，全部在机载算力上运行。**Helix 02**（2026 年 1 月）加入 **System 0**：一个用重定向人体动作训练、以 1 kHz 运行的学习型全身控制器，也就是第 2 篇中的动作跟踪 RL 进入了 VLA 体系。**Helix 2.5**（2026 年 9 月）在人类行为数据上预训练后，报告在 30 个未见过的家庭中零样本工作。这些都是公司公告，没有论文或公开评测。

### 来自学术界和其他公司的开放模型

- **UniVLA**（Bu 等，RSS 2025）在 DINO 特征空间中从视频学习**以任务为中心的潜在动作**，使互联网视频和人类视频成为预训练数据，再用小解码器映射到各个机器人。
- **X-VLA**（Zheng 等，ICLR 2026）用**软提示**（soft prompt）处理跨本体数据：每个数据源一个可学习嵌入，拼接在 token 前面。只用一个 0.9B 的普通 Transformer 和流匹配头，这些嵌入就能吸收相机与动作空间的差异（可与上文统一动作向量图对比）。
- **GR-3**（字节跳动 Seed，技术报告，2025 年 7 月）约 4B 参数（Qwen2.5-VL 主干加流匹配 DiT），在网络数据、VR 采集的人类轨迹和双臂移动机器人数据上联合训练。
- **WALL-OSS**（X Square Robot，arXiv 预印本，2025 年 9 月）用“统一的跨层级思维链”连接指令推理、子目标和动作，发布了流匹配和 FAST 两个版本。
- **RDT2**（Liu 等，ICML 2026）在超过 1 万小时的 **UMI 手持夹爪数据**（见[第 4 篇]({{ '/blog/2026/embodied-ai-04-imitation-learning/' | relative_url }})）上训练 7B VLM，有 RVQ token 和流匹配两个版本，可零样本部署到训练中从未出现的机器人上。由于夹爪是共享的“本体”，机械臂几乎可以互换。
- **MolmoAct2**（Fang 等，Ai2，arXiv 预印本，2026 年 5 月）完全开放：权重、代码、720 小时的双臂数据集，以及一个开放的 FAST 式分词器；其流匹配专家读取主干每一层的键值缓存。
- **OAT（有序动作分词）**（Liu 等，RSS 2026，杰出论文候选）设计的动作 token 只看前缀就能解码出粗略动作，比 FAST 的 DCT 排序更进一步。

### 世界动作模型：同时预测视频和动作

第 5 节问过：一个模型能否既是策略又是世界模型？2025–2026 年已有多个团队做出了这样的模型：

- **WorldVLA**（Cen 等，arXiv 预印本，2025 年 6 月）和 **Unified VLA**（Wang 等，ICLR 2026）把图像、语言和动作 token 放进同一个自回归模型；Unified VLA 还在视频上做世界模型后训练。
- **Genie Envisioner**（Liao 等，arXiv 预印本，2025 年 8 月）训练了视频扩散世界模型（GE-Base）、基于其潜变量的流匹配动作解码器（GE-Act）和神经仿真器（GE-Sim）。
- **DreamGen**（Jang 等，CoRL 2025）把微调后的视频模型当作*数据生成器*：“梦见”新行为的视频，用逆动力学模型标注动作，再用这些神经轨迹训练 GR00T，仅凭单一任务的遥操作数据就学会了 22 种新行为。
- **Cosmos Policy**（Kim 等，ICLR 2026）微调 Cosmos-Predict2 视频模型，把动作、未来状态和价值编码为额外的潜在帧，使一个网络同时充当策略、世界模型和价值函数，并能用 best-of-N 采样做规划。
- **DreamZero / GR00T N2**（见上文）是目前规模最大的。

共同的模式是：视频生成主干取代 VLM 主干，动作只是又一个需要去噪的模态。押注在于视频预训练比图像描述更能教会物理和运动；代价是推理速度（几 Hz 而不是几十 Hz）。视频模型本身见世界模型系列的[视频世界模拟器]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})；引擎与这些模型如何汇合成数据工厂，见 [AI 与图形引擎]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})。

### VLA 的强化学习微调

除 Recap 外，开放研究也在仿真中对预训练 VLA 做策略梯度 RL。**RL4VLA**（Liu 等，NeurIPS 2025）发现 PPO 微调比监督微调更能提升语义和执行层面的泛化，且在该设置下 PPO 优于 DPO 和 GRPO。**SimpleVLA-RL**（Li 等，arXiv 预印本，2025 年 9 月）基于 veRL 框架在 OpenVLA-OFT 上扩展结果奖励 RL，减少了所需示范数量。流策略的 RL（pi_RL）和真实世界的变体见第 2 篇。

### 评测

- **RoboArena**（Atreya 等，CoRL 2025）众包真实世界评测：策略在多个机构的 DROID 式 Franka 平台上运行，评测者在自选任务上比较两个匿名策略，成对偏好模型把投票汇总成排名，即第 4 节盲测 A/B 思路的规模化。
- **RoboChallenge**（Yakefu 等，arXiv 预印本，2025 年 10 月）是托管式远程基准：团队提交策略，在真实机器人上执行固定的 30 个任务（Table30）。
- **以世界模型为评测器**：Google DeepMind 在微调后的 **Veo** 世界模拟器中评测 Gemini Robotics 策略（包括安全性探测），并与真实试验对照（arXiv 预印本，2025 年 12 月），正是第 5 节第 5 条的实践。更多内容见第 3 篇。

*与前文相比的变化：*第 2 节汇总表中几乎每一行都有了后继模型。第 4 节说机器人学习还没有清晰的规模定律，这对成功率而言仍然成立；但 EgoScale（第 6 篇）报告了人类视频预训练小时数与下游灵巧操作性能之间的对数线性关系。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Ahn et al., *Do as I can, not as I say: grounding language in robotic affordances* (SayCan) | CoRL | 2022 | [arXiv](https://arxiv.org/abs/2204.01691) | 由价值函数落地的 LLM 规划 |
| Reed et al., *A generalist agent* (Gato) | TMLR | 2022 | [arXiv](https://arxiv.org/abs/2205.06175) | 一个 Transformer 兼顾游戏、图像描述和机械臂 |
| Wu et al., *DayDreamer: world models for physical robot learning* | CoRL | 2022 | [arXiv](https://arxiv.org/abs/2206.14176) | 真实机器人上的世界模型 RL |
| Brohan et al., *RT-1: Robotics Transformer for real-world control at scale* | RSS | 2023 | [arXiv](https://arxiv.org/abs/2212.06817) | 大规模真实世界机器人 Transformer |
| Jiang et al., *VIMA: robot manipulation with multimodal prompts* | ICML | 2023 | [arXiv](https://arxiv.org/abs/2210.03094) | 多模态任务提示 |
| Driess et al., *PaLM-E: an embodied multimodal language model* | ICML | 2023 | [arXiv](https://arxiv.org/abs/2303.03378) | LLM 中的传感器 token |
| Brohan et al., *RT-2: vision-language-action models transfer web knowledge to robotic control* | CoRL | 2023 | [arXiv](https://arxiv.org/abs/2307.15818) | 第一个 VLA，动作即文本 token |
| Du et al., *Learning universal policies via text-guided video generation* (UniPi) | NeurIPS | 2023 | [arXiv](https://arxiv.org/abs/2302.00111) | 视频生成即规划 |
| Bousmalis et al., *RoboCat: a self-improving generalist agent for robotic manipulation* | TMLR | 2023 | [arXiv](https://arxiv.org/abs/2306.11706) | 跨本体的自我改进 |
| Yang et al., *Learning interactive real-world simulators* (UniSim) | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2310.06114) | 动作条件视频仿真器 |
| Wu et al., *Unleashing large-scale video generative pre-training for visual robot manipulation* (GR-1) | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2312.13139) | 面向策略的视频预训练 |
| Bruce et al., *Genie: generative interactive environments* | ICML | 2024 | [arXiv](https://arxiv.org/abs/2402.15391) | 从无标签视频中学习潜在动作 |
| Octo Model Team, *Octo: an open-source generalist robot policy* | RSS | 2024 | [arXiv](https://arxiv.org/abs/2405.12213) | 带扩散头的开放通用策略 |
| Kim et al., *OpenVLA: an open-source vision-language-action model* | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2406.09246) | 开放的 7B VLA |
| Liu et al., *RDT-1B: a diffusion foundation model for bimanual manipulation* | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2410.07864) | 扩散 Transformer VLA |
| Black et al., *pi0: a vision-language-action flow model for general robot control* | RSS | 2025 | [arXiv](https://arxiv.org/abs/2410.24164) | 流匹配动作专家 |
| Pertsch et al., *FAST: efficient action tokenization for vision-language-action models* | RSS | 2025 | [arXiv](https://arxiv.org/abs/2501.09747) | DCT + BPE 动作 token |
| NVIDIA, *Cosmos world foundation model platform for physical AI* | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2501.03575) | 面向机器人的世界基础模型 |
| Kim et al., *Fine-tuning vision-language-action models: optimizing speed and success* (OpenVLA-OFT) | RSS | 2025 | [arXiv](https://arxiv.org/abs/2502.19645) | 更好的 VLA 微调配方 |
| NVIDIA, *GR00T N1: an open foundation model for generalist humanoid robots* | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2503.14734) | 双系统人形机器人 VLA |
| Gemini Robotics Team, *Gemini Robotics: bringing AI into the physical world* | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2503.20020) | 基于 Gemini 2.0 的 VLA 与具身推理 |
| Physical Intelligence, *pi0.5: a vision-language-action model with open-world generalization* | CoRL | 2025 | [arXiv](https://arxiv.org/abs/2504.16054) | 面向未见家庭的联合训练 |
| Shukor et al., *SmolVLA: a vision-language-action model for affordable and efficient robotics* | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2506.01844) | 小型开放 VLA |
| Assran et al., *V-JEPA 2: self-supervised video models enable understanding, prediction and planning* | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2506.09985) | 用于零样本规划的隐空间世界模型 |
| Gemini Robotics Team, *Gemini Robotics 1.5* | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2510.03342) | 会思考的 VLA，运动迁移 |
| Bu et al., *UniVLA: learning to act anywhere with task-centric latent actions* | RSS | 2025 | [arXiv](https://arxiv.org/abs/2505.06111) | 从视频学习潜在动作 |
| Driess et al., *Knowledge insulating vision-language-action models* | NeurIPS | 2025 | [arXiv](https://arxiv.org/abs/2505.23705) | 防止动作专家梯度损害 VLM |
| Black et al., *Real-time execution of action chunking flow policies* | NeurIPS | 2025 | [arXiv](https://arxiv.org/abs/2506.07339) | 以修复方式异步分块执行 |
| Jang et al., *DreamGen: unlocking generalization in robot learning through video world models* | CoRL | 2025 | [arXiv](https://arxiv.org/abs/2505.12705) | 视频模型生成神经轨迹 |
| Atreya et al., *RoboArena: distributed real-world evaluation of generalist robot policies* | CoRL | 2025 | [arXiv](https://arxiv.org/abs/2506.18123) | 众包成对真实世界评测 |
| Liu et al., *What can RL bring to VLA generalization? An empirical study* | NeurIPS | 2025 | [arXiv](https://arxiv.org/abs/2505.19789) | 用 PPO 微调 VLA |
| Cen et al., *WorldVLA: towards autoregressive action world model* | arXiv 预印本（2025 年 6 月） | 2025 | [arXiv](https://arxiv.org/abs/2506.21539) | 联合预测动作与图像 |
| ByteDance Seed, *GR-3 technical report* | arXiv 预印本（2025 年 7 月） | 2025 | [arXiv](https://arxiv.org/abs/2507.15493) | 网络 + VR 人类 + 机器人联合训练 |
| Liao et al., *Genie Envisioner: a unified world foundation platform for robotic manipulation* | arXiv 预印本（2025 年 8 月） | 2025 | [arXiv](https://arxiv.org/abs/2508.05635) | 视频世界模型 + 动作解码器 + 神经仿真器 |
| Li et al., *SimpleVLA-RL: scaling VLA training via reinforcement learning* | arXiv 预印本（2025 年 9 月） | 2025 | [arXiv](https://arxiv.org/abs/2509.09674) | VLA 的结果奖励 RL |
| Zhai et al., *Igniting VLMs toward the embodied space*（WALL-OSS） | arXiv 预印本（2025 年 9 月） | 2025 | [arXiv](https://arxiv.org/abs/2509.11766) | 带跨层级思维链的开放 VLA |
| Zheng et al., *X-VLA: soft-prompted transformer as scalable cross-embodiment VLA* | ICLR | 2026 | [arXiv](https://arxiv.org/abs/2510.10274) | 按数据源的软提示 |
| Wang et al., *Unified vision-language-action model* | ICLR | 2026 | [arXiv](https://arxiv.org/abs/2506.19850) | 带世界模型后训练的自回归 VLA |
| Yakefu et al., *RoboChallenge: large-scale real-robot evaluation of embodied policies* | arXiv 预印本（2025 年 10 月） | 2025 | [arXiv](https://arxiv.org/abs/2510.17950) | 托管式真实机器人基准 |
| Physical Intelligence, *pi\*0.6: a VLA that learns from experience* | arXiv 预印本（2025 年 11 月） | 2025 | [arXiv](https://arxiv.org/abs/2511.14759) | Recap：优势条件 RL |
| Gemini Robotics Team, *Evaluating Gemini Robotics policies in a Veo world simulator* | arXiv 预印本（2025 年 12 月） | 2025 | [arXiv](https://arxiv.org/abs/2512.10675) | 世界模型作为策略评测器 |
| Kim et al., *Cosmos Policy: fine-tuning video models for visuomotor control and planning* | ICLR | 2026 | [arXiv](https://arxiv.org/abs/2601.16163) | 一个视频模型兼任策略、世界模型和价值函数 |
| Ye et al., *World action models are zero-shot policies*（DreamZero） | arXiv 预印本（2026 年 2 月） | 2026 | [arXiv](https://arxiv.org/abs/2602.15922) | 14B 视频-动作联合模型，GR00T N2 的基础 |
| Liu et al., *RDT2: exploring the scaling limit of UMI data towards zero-shot cross-embodiment generalization* | ICML | 2026 | [arXiv](https://arxiv.org/abs/2602.03310) | 用 1 万小时以上 UMI 数据训练的 VLA |
| Liu et al., *OAT: ordered action tokenization* | RSS | 2026 | [arXiv](https://arxiv.org/abs/2602.04215) | 前缀可解码的动作 token |
| Physical Intelligence, *pi0.7: a steerable generalist robotic foundation model with emergent capabilities* | arXiv 预印本（2026 年 4 月） | 2026 | [arXiv](https://arxiv.org/abs/2604.15483) | 富含元数据的提示，跨本体迁移 |
| Fang et al., *MolmoAct2: action reasoning models for real-world deployment* | arXiv 预印本（2026 年 5 月） | 2026 | [arXiv](https://arxiv.org/abs/2605.02881) | 完全开放的 VLA、数据和分词器 |
| 工业界公告：[Helix](https://www.figure.ai/news/helix)、[Helix 02](https://www.figure.ai/news/helix-02)、[Gemini Robotics On-Device](https://deepmind.google/blog/gemini-robotics-on-device-brings-ai-to-local-robotic-devices/)、[Gemini Robotics 2](https://deepmind.google/blog/gemini-robotics-2-brings-whole-body-intelligence-to-robots/)、[GR00T N1.5](https://research.nvidia.com/labs/gear/gr00t-n1_5/)、[GR00T N1.6](https://research.nvidia.com/labs/gear/gr00t-n1_6/) | 公告 | 2025–2026 | 见链接 | 无论文，仅官方页面 |

## 学习资源

- [OpenVLA 代码](https://github.com/openvla/openvla)与 [openpi](https://github.com/Physical-Intelligence/openpi)（开放的 pi0 / pi0.5 权重
  与微调代码）。
- [LeRobot](https://github.com/huggingface/lerobot)：一个库里集成了 pi0、SmolVLA、ACT 与 Diffusion Policy。
- [Octo](https://github.com/octo-models/octo) 与 [Isaac GR00T](https://github.com/NVIDIA/Isaac-GR00T)。
- RLDS 格式的 [Open X-Embodiment](https://robotics-transformer-x.github.io) 数据集。
- 综述与课程：Stanford CS 224R（深度 RL 与机器人学习）、CMU 16-831，以及 Tedrake
  [*Robotic Manipulation*](https://manipulation.csail.mit.edu) 中的相关章节。

## 练习

1. 计算对一个 14 维（双臂机器人）、50 Hz、2 秒的动作块，RT-2 式分箱需要多少 token，并与上面三种缩放下的 FAST 比较。
2. 修改流匹配玩具例子，让上下文含有噪声（两条指令只能部分区分）。指令遵循率如何变化？然后分别用 1、2、5、10 个欧拉步采样。
3. 把 MLP 动作专家换成一个关注 16 个"VLM token"序列（而不是单个向量）的小型 Transformer。训练速度和精度有什么变化？
4. 阅读 OpenVLA 和 pi0 的论文，用与上面 Mermaid 图相同的风格画出两者的架构。标出哪些权重是预训练的、哪些是从零训练的，以及
   梯度从哪里流过。
5. 为你实验室中的 VLA 设计一个评测方案：列出泛化维度、每个条件的试验次数，以及如何估计成功率的置信区间。

**下一篇：**[具身智能遇上 XR 与 HCI]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})，人、头显与机器人
在这里相遇。
