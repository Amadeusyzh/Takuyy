---
layout: post
title: "模仿学习：行为克隆、DAgger、ACT 与 Diffusion Policy"
date: 2026-10-27 18:04:00+0900
description: "从示范中学习机器人技能：协变量偏移与 DAgger、基于 Transformer 的动作分块（ACT/ALOHA）、Diffusion Policy、遥操作与 UMI 数据采集、大规模跨本体数据集，附一个可运行的扩散策略训练示例。"
categories: embodied-ai
tags: [imitation-learning, behavior-cloning, diffusion-policy, act, datasets]
series: embodied-ai
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

RL（第 2 篇）需要奖励和大量尝试，这对在 GPU 仿真器里学走路没问题，但对叠衬衫或插线缆就很痛苦了。**模仿学习**
（imitation learning, IL）跳过奖励：人来示范任务，机器人学习一个把观测映射到示范动作的策略。自 2023 年起，两个想法——
**动作分块**（action chunking）和**生成式动作模型**（扩散与流匹配）——让 IL 只需几十条示范就能完成精细、接触丰富的操作。
它们也是当今视觉-语言-动作模型（第 5 篇）的动作头。本文从零搭建 IL，最后给出一个可运行的 Diffusion Policy 训练循环。
[上一篇]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})中的仿真器，就是你在接触真实机器人之前练习它的地方。

**前置知识**

- 用 PyTorch 做监督学习；第 2 篇的 RL 记号（$\pi$、轨迹、时域 $T$）。
- DDPM 层面的扩散模型（前向加噪、噪声预测）。世界模型和神经渲染系列也会讲到。
- 第 1 篇关于动作空间的讨论（关节目标与末端执行器目标、阻抗控制）。

## 1. 行为克隆与协变量偏移

给定来自专家策略 $\pi^{\ast}$ 的示范 $\mathcal{D} = \lbrace(o_i, a_i)\rbrace$，**行为克隆**（behavior cloning, BC）用最大似然拟合策略：

$$
\theta^{\ast} = \arg\max_\theta \sum_{(o,a)\in\mathcal{D}} \log \pi_\theta(a \mid o).
$$

对固定方差的高斯策略，这就是 MSE 回归。BC 是最古老的机器人学习方法（1988 年 ALVINN 用一个小型神经网络根据相机图像驾驶
车辆），至今仍是大多数操作系统的骨干。它有两种经典的失败模式。

### 协变量偏移与误差累积

BC 在专家的状态分布 $d_{\pi^{\ast}}$ 上训练，但测试时机器人访问的是它自己的分布 $d_{\pi_\theta}$ 中的状态。一个小错误会把它带到
没有任何示范覆盖的状态，在那里它犯下更大的错误，如此循环。Ross 与 Bagnell（2010）把这一点形式化了：若学到的策略在专家状态上
出错的概率为 $\epsilon$，则时域 $T$ 上的期望代价可能以 $O(\epsilon T^2)$ 增长，而在自身状态分布上训练的学习者可以达到 $O(\epsilon T)$。

一个小实验就能让这个效应显现出来。一个点以恒定速度前进，并调整横向位置 $y$ 去跟随一条正弦路径；专家是一个简单的反馈律，学习者是拟合专家状态-动作对的径向基函数回归器：

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-covariate-shift.svg" caption="路径跟随玩具任务上的行为克隆与 DAgger。10 条专家示范很干净（灰色带：它们覆盖的状态），而部署时的扰动更大。上：普通 BC（红色）在带内表现良好，可一旦扰动把它推出带外，它的动作就失去意义，从此偏离路径。DAgger 让专家标注了学习者自己访问的状态之后，策略（蓝色）就能像专家一样纠正回来。下：20 次运行的平均跟踪误差；BC 平均为 0.131，是专家 0.029 的 4.5 倍，而只做一次 DAgger 迭代就已降到专家水平。" %}

### DAgger

**DAgger**（数据集聚合，Dataset Aggregation；Ross、Gordon 与 Bagnell，AISTATS 2011）通过在学习者访问的状态上询问专家来修正
分布失配：

1. 在专家示范 $\mathcal{D}$ 上训练 $\pi_1$。
2. 对 $i = 1, 2, \dots$：运行 $\pi_i$（可与专家混合）收集状态；请专家用 $a = \pi^{\ast}(s)$ 标注；聚合
   $\mathcal{D} \leftarrow \mathcal{D} \cup \lbrace(s, \pi^{\ast}(s))\rbrace$；重新训练 $\pi_{i+1}$。

DAgger 具有无悔（no-regret）保证和 $O(\epsilon T)$ 的界，但让人类遥操作员为任意状态打标签很别扭。实用的变体只在机器人出错时让
人**介入**（HG-DAgger，许多真实系统中的介入数据），或者用仿真中的特权策略充当专家，这正是第 2 篇中的教师-学生蒸馏。缓解协变量
偏移的其他办法：在示范时注入噪声，让数据包含恢复行为（DART）；增强观测；以及实践中最有效的，预测**动作块**（第 2 节）。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-dagger-loop.svg" localized="true" caption="DAgger 循环。普通行为克隆缺少的就是右边一列：运行当前策略，让专家为策略实际访问的状态打标签，再把它们加入数据集。" %}

### 多模态

人类会用不同方式完成同一任务：从左边或右边绕过障碍物，抓杯柄或抓杯沿。MSE 最优的预测是各模态的**平均**，而它可能恰好是那个
会失败的动作（直直撞上障碍物）。解决办法是表达力强的动作分布：带类别输出的离散化动作（RT-1，第 5 篇）、高斯混合（robomimic 的
BC-RNN-GMM）、能量模型（Implicit BC）、k-means "动作箱"加偏移（Behavior Transformers）、VAE（ACT），以及扩散或流模型
（Diffusion Policy）。本文末尾的代码展示了 MSE BC 坍缩到障碍物上，而扩散策略保留了两个模态。

下图用第 6 节训练的玩具问题展示了这一点：示范从左侧或右侧绕过障碍物，而 MSE 回归把两者平均了。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-multimodal.svg" caption="左：来自 `make_demos` 的 60 条示范动作块（灰色）、从训练好的 Diffusion Policy 采样的 40 条动作块（紫色），以及 MSE 行为克隆的预测（红色），观测都取原点。右：动作块中间位置的横向偏移。示范和扩散样本都在约 $\pm 0.5$ 处呈双峰；MSE 预测落在 $y = 0.02$，是两个峰的均值，恰好是唯一会撞上障碍物的地方。" %}

## 2. 基于 Transformer 的动作分块（ACT / ALOHA）

Zhao 等（RSS 2023）构建了 **ALOHA**——一个低成本的双臂遥操作系统，人移动两只小型"主"臂，两只"从"臂镜像其关节位置——以及
**ACT**（Action Chunking with Transformers），后者仅用约 10 分钟的示范，就以 80% 到 90% 的成功率学会了打开半透明调料杯、插入电池
等任务。关键思想：

- **动作分块。** 不是每步预测一个动作，而是预测接下来的 $k$ 个动作 $a_{t:t+k}$（例如 50 Hz 下 $k = 100$ 个关节目标）。分块把有效
  时域缩短为原来的 $1/k$，误差累积的机会随之减少；它还能表示停顿这类时间相关的行为，而单步策略很难处理这些。
- **时间集成**（temporal ensembling）。每步都查询策略会得到相互重叠的动作块。ACT 用指数权重 $w_i = \exp(-m\, i)$（$i = 0$ 是最早的
  预测）对当前时间步的所有预测取平均，使运动平滑而不产生滞后。
- **CVAE 训练。** 一个 Transformer 编码器把示范的动作块压缩为隐式风格变量 $z$；解码器（一个作用于多路相机的 ResNet 图像特征和
  关节状态的 Transformer）在给定 $z$ 时预测动作块。测试时 $z$ 取先验均值。目标函数是重建（L1）加 KL 项。
- **关节空间动作**配合位置控制器，避免了 6 自由度 ALOHA 手臂的 IK 和奇异问题。

**Mobile ALOHA**（Fu 等 CoRL 2024）把系统装到移动底盘上，并证明与静态 ALOHA 数据联合训练（co-training）能提升移动操作能力。
**ALOHA Unleashed**（Zhao 等 CoRL 2024）扩大了数据采集规模，并使用基于扩散的策略完成系鞋带、挂衬衫等任务。

时间集成放在时间轴上最容易理解。下面的玩具例子里，每个动作块都等于理想动作加上一个沿块增长的误差，就像学到的策略那样：

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-temporal-ensembling.svg" caption="上：每一步都预测一个包含 $k = 10$ 个未来动作的块（颜色表示预测时刻）；在 $t = 30$，有十个不同的块都包含对这一步的预测（红点）。下：把每个块执行到底、每 10 步重新规划（橙色）会在每个块的边界处跳变；时间集成（紫色）则用权重 $w_i = e^{-0.1 i}$（$i = 0$ 为最早的预测）对重叠的预测加权平均。它相邻两步之间的平均变化为 0.124，接近理想值 0.117，而普通分块执行为 0.172。" %}

## 3. Diffusion Policy

Chi 等（RSS 2023）用**去噪扩散模型**建模动作序列的条件分布。策略的每一步从高斯噪声出发，以最近的观测为条件，迭代地把它去噪为
一个动作块。在来自 4 个基准的 12 个任务上，它的成功率比此前最好的方法平均提高了 46.9%。

### 形式化

设 $A^0_t \in \mathbb{R}^{T_p\times d_a}$ 是 $T_p$ 个未来动作组成的块，$O_t$ 是最近 $T_o$ 个观测。DDPM 前向过程按照调度 $\bar\alpha_k$ 加噪：

$$
A^k_t = \sqrt{\bar\alpha_k}\,A^0_t + \sqrt{1-\bar\alpha_k}\,\epsilon, \qquad \epsilon\sim\mathcal{N}(0, I),
$$

网络 $\epsilon_\theta$ 学习预测这个噪声：

$$
\mathcal{L}(\theta) = \mathbb{E}_{k,\,\epsilon,\,(O_t, A^0_t)\sim\mathcal{D}}\left[\left\lVert \epsilon - \epsilon_\theta\!\left(A^k_t,\, k,\, O_t\right)\right\rVert^2\right].
$$

推理时从 $A^K_t \sim \mathcal{N}(0, I)$ 出发，每个反向步为

$$
A^{k-1}_t = \frac{1}{\sqrt{\alpha_k}}\left(A^k_t - \frac{\beta_k}{\sqrt{1-\bar\alpha_k}}\,\epsilon_\theta(A^k_t, k, O_t)\right) + \sigma_k z, \qquad z\sim\mathcal{N}(0, I),
$$

其中 $\beta_k = 1-\alpha_k$，$\sigma_k^2 = \beta_k$。由于 $\epsilon_\theta$（差一个比例因子）就是得分函数 $\nabla_A \log p(A \mid O)$，采样就是在动作对数
密度上做带噪声的梯度上升，因此能自然地表示多个模态以及高维、时间上连贯的动作序列。

对于动作块，前向过程很容易想象：块中的每个路径点都朝原点收缩，并被高斯噪声模糊，直到轨迹完全消失。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-diffusion-forward.svg" caption="对玩具问题中 40 条示范动作块（每条 8 个路径点）施加 DDPM 前向过程 $A^k = \sqrt{\bar\alpha_k}A^0 + \sqrt{1-\bar\alpha_k}\,\epsilon$，使用第 6 节代码中的余弦调度。在 $k = 20$ 时仍能看出两族轨迹，$k = 50$ 时已基本消失，$k = 100$ 时动作块就是纯噪声。下：调度的信号系数和噪声系数。" %}

### 关键的设计选择

- **滚动时域**（receding horizon）。预测 $T_p$ 步（例如 16），只执行前 $T_a$ 步（例如 8），然后根据新观测（$T_o = 2$ 帧）重新规划。
  执行一个块带来时间一致性，重新规划带来反应能力。
- **条件化而非联合建模。** 观测作为去噪器的条件（在一维时间卷积 U-Net 中通过 FiLM 层，或在 Transformer 变体中通过交叉注意力），
  而不是被一起去噪，因此视觉编码器每个策略步只运行一次，而不是每个去噪步运行一次。
- **末端执行器空间的位置控制**在他们的实验中优于速度控制：绝对目标受误差累积漂移的影响更小。
- **快速采样。** 训练用 100 个 DDPM 步；推理可用约 10 步的 DDIM。后续工作用**流匹配**（flow matching，pi0，第 5 篇）或一致性蒸馏
  取代扩散，以达到实时速率。

扩展工作包括以点云为条件的 **3D Diffusion Policy**（Ze 等 RSS 2024），以及扩展的期刊版本（Chi 等 IJRR 2024）。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-receding-horizon.svg" caption="按上面的数值进行滚动时域执行。在 $t = 0$，策略看到最近 $T_o = 2$ 个观测（青色）并预测 $T_p = 16$ 个动作，只执行前 $T_a = 8$ 个（深紫色）。在 $t = 8$，它重新观测并预测一个新的动作块，丢弃旧块中未执行的部分。" %}

## 4. 采集示范

数据才是真正的瓶颈。常见的采集接口：

| 接口 | 例子 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 示教（kinesthetic teaching） | 用手推动柔顺的机械臂 | 直观，无需额外硬件 | 人出现在相机视野里，只能单臂 |
| 主从臂 | ALOHA、GELLO | 低延迟，双臂，关节空间，可反向驱动带来力感 | 依赖特定机器人的硬件 |
| VR / AR 遥操作 | Quest 或 Vision Pro 手部追踪、Open-TeleVision | 沉浸式，灵巧手，可远程 | 重定向、延迟、缺少触觉（第 6 篇） |
| 空间鼠标 / 手机 | robomimic、RoboTurk | 便宜，易扩展 | 慢，难以完成灵巧任务 |
| 手持夹爪 | UMI | 不需要机器人，可在真实环境中采集 | 需要位姿追踪和本体匹配 |
| 人类视频 | Ego4D、EgoMimic | 规模巨大 | 没有动作，存在本体差距（第 6 篇） |

**UMI**（Universal Manipulation Interface；Chi 等 RSS 2024）是一个手持的 3D 打印夹爪，腕部装有 GoPro。鱼眼镜头和侧面镜子提供宽广、
隐式立体的视野；视觉惯性 SLAM 恢复夹爪的 6 自由度轨迹；策略接口还考虑了数据采集与部署之间的延迟差异。由于手持设备和机器人上的
观测（腕部相机）和动作（末端位姿、夹爪开度）完全相同，在厨房和公园采集的数据可以迁移到真实机械臂上。同样的原则——**让数据接口与
机器人接口完全一致**——在具身智能中反复出现。

比架构更重要的实用建议：示范者保持一致、相机经过标定、时间戳同步、记录控制器的实际目标（而不是测得的状态），以及有意识地采集
恢复行为。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-data-pipeline.svg" localized="true" caption="示范数据流水线。无论用哪种接口，记录器都以固定频率保存同步的观测和实际下发的动作。UMI 的原则就是图中最下面那句话：只要数据端和机器人端共享相同的观测空间和动作空间，数据集就能直接训练出机器人可用的策略。" %}

## 5. 大规模数据集与跨本体学习

单个实验室的数据集有几百到几万条回合。跨实验室、跨机器人汇集数据，是机器人版的网络规模预训练：

- **Open X-Embodiment**（ICRA 2024）：21 家机构合作，把来自 22 种机器人的数据集统一为 RLDS 格式，涵盖 527 种技能（160,266 个任务）。
  在混合数据上训练的 RT-1-X 和 RT-2-X 优于单机器人策略；在作者的评测中，RT-2-X 在涌现技能上的成功率约为 RT-2 的三倍。
- **BridgeData V2**（CoRL 2023）：使用低成本 WidowX 机械臂、跨多种环境的桌面操作数据；常用的预训练与评测集。
- **DROID**（RSS 2024）：在 564 个场景中用 Franka 机械臂采集的 7.6 万条遥操作轨迹（约 350 小时），由多家机构采集，以最大化场景多样性。
- **LeRobot**（Hugging Face）：一个 PyTorch 库与数据格式，实现了 ACT、Diffusion Policy 和 VLA 模型（包括 SmolVLA 和 pi0），
  还有一个汇集社区在低成本机械臂上录制的数据集的 hub。

跨本体训练带来了新的问题：如何对齐动作空间（末端增量还是关节）、如何处理不同的相机配置、如何为数据集加权。第 5 篇会讨论
VLA 模型如何回答这些问题。

## 6. 一个可运行的 Diffusion Policy 训练步骤

下面的脚本在一个暴露多模态问题的玩具任务上实现了 Diffusion Policy 的核心：示范从原点附近出发向前移动，同时向左或向右弯曲以
绕过障碍物。它在 8 步的动作块上用余弦 DDPM 调度训练一个噪声预测网络，并训练一个 MSE 行为克隆模型作对比。去噪器是一个小型
MLP（论文使用一维时间 U-Net 或 Transformer），但训练步骤和采样器都是真实的。在 CPU 上大约半分钟就能跑完。

```python
import math
import torch
import torch.nn as nn
import torch.nn.functional as F

torch.manual_seed(0)
H, A, O = 8, 2, 2          # action horizon (chunk length), action dim, observation dim
K = 100                    # diffusion steps

# ---- toy demonstrations: from the start, go around an obstacle either left OR right ----
def make_demos(n):
    obs = torch.randn(n, O) * 0.05                       # start position near the origin
    side = torch.randint(0, 2, (n, 1)).float() * 2 - 1   # -1 = left, +1 = right (multimodal!)
    t = torch.linspace(0, 1, H)
    x = t.expand(n, H)                                   # move forward in x
    y = side * torch.sin(math.pi * t) * 0.5              # bend left or right in y
    act = torch.stack([x, y], -1) + obs[:, None, :]      # [n, H, 2] chunk of future waypoints
    return obs, act

# ---- noise schedule (DDPM, cosine) ----
s = 0.008
f = torch.cos((torch.arange(K + 1) / K + s) / (1 + s) * math.pi / 2) ** 2
alpha_bar = (f / f[0])[1:]                               # \bar{alpha}_k, k = 1..K
alphas = alpha_bar / torch.cat([torch.ones(1), alpha_bar[:-1]])
betas = (1 - alphas).clamp(max=0.999)

class NoisePredictor(nn.Module):
    """eps_theta(a_k, k, o): an MLP over the flattened action chunk (a 1-D U-Net in the paper)."""
    def __init__(self, hidden=256):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(H * A + O + 32, hidden), nn.Mish(),
                                 nn.Linear(hidden, hidden), nn.Mish(),
                                 nn.Linear(hidden, H * A))
    def forward(self, a_noisy, k, obs):
        freqs = torch.exp(torch.arange(16) * (-math.log(1000.0) / 16))
        emb = k[:, None].float() * freqs[None]                     # sinusoidal step embedding
        emb = torch.cat([emb.sin(), emb.cos()], -1)
        x = torch.cat([a_noisy.flatten(1), obs, emb], -1)
        return self.net(x).view(-1, H, A)

def train_step(model, opt, obs, act):
    """One Diffusion Policy training step: predict the noise added to an action chunk."""
    B = act.shape[0]
    k = torch.randint(0, K, (B,))                                   # random diffusion step
    eps = torch.randn_like(act)
    ab = alpha_bar[k].view(B, 1, 1)
    a_noisy = ab.sqrt() * act + (1 - ab).sqrt() * eps               # forward process q(a_k | a_0)
    loss = F.mse_loss(model(a_noisy, k, obs), eps)
    opt.zero_grad(); loss.backward(); opt.step()
    return loss.item()

@torch.no_grad()
def sample(model, obs):
    """DDPM reverse process: start from Gaussian noise, denoise K times."""
    a = torch.randn(obs.shape[0], H, A)
    for k in reversed(range(K)):
        kk = torch.full((obs.shape[0],), k)
        eps = model(a, kk, obs)
        a = (a - betas[k] / (1 - alpha_bar[k]).sqrt() * eps) / alphas[k].sqrt()
        if k > 0:
            a = a + betas[k].sqrt() * torch.randn_like(a)
    return a

if __name__ == "__main__":
    model = NoisePredictor()
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-6)
    bc = nn.Sequential(nn.Linear(O, 256), nn.Mish(), nn.Linear(256, H * A))   # MSE baseline
    opt_bc = torch.optim.Adam(bc.parameters(), lr=1e-3)
    for it in range(3000):
        obs, act = make_demos(256)
        loss = train_step(model, opt, obs, act)
        l_bc = F.mse_loss(bc(obs).view(-1, H, A), act)
        opt_bc.zero_grad(); l_bc.backward(); opt_bc.step()
        if it % 1000 == 0:
            print(f"it {it}: diffusion loss {loss:.4f}, BC loss {l_bc.item():.4f}")
    obs = torch.zeros(1000, O)
    mid_dp = sample(model, obs)[:, H // 2, 1]           # lateral offset in the middle of the chunk
    with torch.no_grad():
        mid_bc = bc(obs).view(-1, H, A)[:, H // 2, 1]
    print("diffusion: fraction left %.2f, right %.2f, mean |y| %.3f" %
          ((mid_dp < -0.25).float().mean(), (mid_dp > 0.25).float().mean(), mid_dp.abs().mean()))
    print("MSE BC:    mean y %.3f (collapses to the average, i.e. into the obstacle)" % mid_bc.mean())
```

输出：

```text
it 0: diffusion loss 1.0366, BC loss 0.2291
it 1000: diffusion loss 0.0401, BC loss 0.0542
it 2000: diffusion loss 0.0299, BC loss 0.0547
diffusion: fraction left 0.56, right 0.43, mean |y| 0.484
MSE BC:    mean y 0.022 (collapses to the average, i.e. into the obstacle)
```

记录 `sample` 的中间动作块，就能看到两个模式如何从噪声中浮现出来：

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-diffusion-reverse.svg" caption="上面训练好的模型的逆向过程（相同代码与种子，约 20 s 重新训练），在原点处采样 60 条。每个动作块按它最终选择的一侧着色。左右的选择在 $k = 15$ 时就已可见，最后几步只是在去噪。到 $k = 0$ 时，样本已收敛到两条示范路径上（这批 400 个样本中 56% 向左、44% 向右），而 MSE 基线（红色）从正中间直穿过去。" %}

扩散策略以大致与示范相同的 50/50 比例采样出两个模态，动作块中点的横向偏移接近真实值 $0.5 \sin(\pi \cdot 4/7) \approx 0.49$；而 MSE BC
预测 $y \approx 0$：径直穿过障碍物。它的损失也停在约 0.055，大约就是它所平均的两个模态的方差。要把它变成真正的策略：把 `obs`
换成 ResNet 或 ViT 的图像特征（配合随机裁剪增强端到端训练），使用时间 U-Net，把动作归一化到 $[-1, 1]$，评估时使用权重的
指数滑动平均，并在滚动时域循环中执行每个采样动作块的前 $T_a$ 个动作。LeRobot 的实现是很好的参考。

## 7. 超越朴素模仿

- **逆强化学习与对抗模仿。** 恢复一个能解释示范的奖励，再优化它。**GAIL**（Ho 与 Ermon 2016）训练一个区分专家与策略状态-动作对
  的判别器，并把它用作奖励；角色动画中的对抗运动先验也遵循同样的思路。
- **离线 RL** 在固定数据集上利用奖励，以超越示范者。
- **从游玩数据和语言中学习。** 把无结构的遥操作"游玩"（play）数据用目标或语言指令重新标注（CALVIN），用于训练语言条件策略，
  这是从 IL 走向 VLA 模型的一步。

## 动手试试

主页上的演示都不是模仿学习器，但 **[Lab]({{ '/' | relative_url }}#lab)** 中的布料演示是一个很好的思想实验：用鼠标拖动布料，就是对
可变形物体操作轨迹的一次"示范"。记录鼠标路径和粒子位置，就能得到训练叠布策略所需的 $(o_t, a_t)$ 数据对。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Pomerleau, *ALVINN: an autonomous land vehicle in a neural network* | NeurIPS | 1988 | [Paper](https://proceedings.neurips.cc/paper/1988/hash/812b4ba287f5ee0bc9d43bbf5bbe87fb-Abstract.html) | 第一个神经网络行为克隆 |
| Ross, Gordon, Bagnell, *A reduction of imitation learning and structured prediction to no-regret online learning* | AISTATS | 2011 | [arXiv](https://arxiv.org/abs/1011.0686) | DAgger，协变量偏移 |
| Ho and Ermon, *Generative adversarial imitation learning* | NeurIPS | 2016 | [arXiv](https://arxiv.org/abs/1606.03476) | GAIL |
| Ho, Jain, Abbeel, *Denoising diffusion probabilistic models* | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.11239) | DDPM，Diffusion Policy 的基础 |
| Mandlekar et al., *What matters in learning from offline human demonstrations for robot manipulation* | CoRL | 2021 | [arXiv](https://arxiv.org/abs/2108.03298) | robomimic，细致的 BC 研究 |
| Florence et al., *Implicit behavioral cloning* | CoRL | 2021 | [arXiv](https://arxiv.org/abs/2109.00137) | 用能量模型策略处理多模态 |
| Shafiullah et al., *Behavior Transformers: cloning k modes with one stone* | NeurIPS | 2022 | [arXiv](https://arxiv.org/abs/2206.11251) | 离散化的多模态动作 |
| Zhao et al., *Learning fine-grained bimanual manipulation with low-cost hardware* | RSS | 2023 | [arXiv](https://arxiv.org/abs/2304.13705) | ALOHA 与 ACT |
| Chi et al., *Diffusion Policy: visuomotor policy learning via action diffusion* | RSS | 2023 | [arXiv](https://arxiv.org/abs/2303.04137) | 扩散动作头 |
| Walke et al., *BridgeData V2: a dataset for robot learning at scale* | CoRL | 2023 | [arXiv](https://arxiv.org/abs/2308.12952) | 广泛使用的数据集 |
| Open X-Embodiment Collaboration, *Open X-Embodiment: robotic learning datasets and RT-X models* | ICRA | 2024 | [arXiv](https://arxiv.org/abs/2310.08864) | 跨本体数据 |
| Chi et al., *Universal Manipulation Interface: in-the-wild robot teaching without in-the-wild robots* | RSS | 2024 | [arXiv](https://arxiv.org/abs/2402.10329) | 手持式数据采集 |
| Khazatsky et al., *DROID: a large-scale in-the-wild robot manipulation dataset* | RSS | 2024 | [arXiv](https://arxiv.org/abs/2403.12945) | 多样化的大规模数据集 |
| Ze et al., *3D Diffusion Policy* | RSS | 2024 | [arXiv](https://arxiv.org/abs/2403.03954) | 以点云为条件 |
| Fu, Zhao, Finn, *Mobile ALOHA* | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2401.02117) | 移动双臂模仿，联合训练 |
| Zhao et al., *ALOHA Unleashed: a simple recipe for robot dexterity* | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2410.13126) | 扩展双臂灵巧性 |

## 学习资源

- [LeRobot](https://github.com/huggingface/lerobot)：数据集，ACT、Diffusion Policy 与 VLA 的实现，以及面向低成本机械臂的教程。
- [Diffusion Policy 代码与项目主页](https://diffusion-policy.cs.columbia.edu/)，附 Colab notebook。
- [ACT / ALOHA 代码](https://github.com/tonyzhaozh/act)与 [UMI 项目主页](https://umi-gripper.github.io)。
- [robomimic](https://robomimic.github.io)：离线模仿的基准与参考实现。
- R. Tedrake，[*Robotic Manipulation*](https://manipulation.csail.mit.edu) 中关于模仿学习的章节。
- S. Levine，CS 285 中关于模仿学习与 DAgger 的讲座。

## 练习

1. 复现误差累积效应：在一维点跟踪正弦曲线的无噪声示范上训练 MSE BC，在带少量观测噪声的条件下运行它，画出误差随时域的变化。
   然后用脚本化的专家加入 DAgger。
2. 在扩散脚本中把 MLP 换成带 FiLM 条件的一维卷积 U-Net，比较 $H = 16$ 时的采样质量。
3. 实现 10 步的 DDIM 采样，测量左/右比例和轨迹质量的变化。
4. 用流匹配替代扩散目标：采样 $t\sim U(0,1)$，令 $A^t = (1-t)\epsilon + t A^0$，回归速度 $A^0 - \epsilon$；采样时用 10 个欧拉步积分 ODE。
5. 在扩散采样器之上实现 ACT 式的时间集成（每步查询，用指数权重平均重叠的预测），并与滚动时域执行比较平滑度。

**下一篇：**[视觉-语言-动作模型]({{ '/blog/2026/embodied-ai-05-vision-language-action-models/' | relative_url }})，模仿学习在这里与
基础模型相遇。
