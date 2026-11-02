---
layout: post
title: "视频生成即世界模拟：Sora、Genie、GameNGen 及其后"
date: 2026-10-27 15:03:00+0900
description: "视频生成器如何成为可交互的世界模拟器：Sora 技术报告、Genie 1-3、GameNGen、UniSim、GAIA-1、NVIDIA Cosmos、潜在动作模型，以及记忆、一致性与物理方面的开放问题。"
categories: world-models
tags: [world-models, video-generation, genie, sora, latent-actions]
series: world-models
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第 1 篇]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})把世界模型介绍为针对单个任务训练的小型学习式模拟器，[第 2 篇]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})则搭建了生成模型的工具箱。2023 到 2025 年间，这两条路线汇合了：在互联网规模数据上训练的视频生成器开始被描述为、也被用作**世界模拟器**（world simulator）：给它一帧画面和一串动作，它就渲染出接下来发生的事情。对于做图形学的人来说，这是一个惊人的转变：一个*学习得到的*模型一次性取代了整个游戏引擎（状态更新、物理和渲染）。本文梳理关键系统，解释其中唯一真正全新的要素（从无标注视频中学到的**潜在动作**（latent actions）），并坦诚说明这些模型目前仍做不到什么。

## 前置知识

- 第 1 篇和第 2 篇（RSSM 与想象；tokenizer、自回归 Transformer、潜在扩散、无分类器引导、DiT）。
- 熟悉视频张量 $(T, H, W, C)$，以及游戏循环（game loop）的概念（输入、状态更新、渲染）。

## 1. 从视频预测到世界模拟

视频模型针对片段 $x_{1:T}$ 和条件 $c$（文本、首帧）学习 $p_\theta(x_{1:T} \mid c)$。**世界模拟器**还额外需要：

1. **交互性**（interactivity）：一种分解 $p_\theta(x_{t+1} \mid x_{\le t}, a_{\le t})$，能够随着动作到来逐帧推进，而不是只能一次生成整个片段。
2. **可控性**（controllability）：动作必须真正决定结果（“向左移动”的输入会让角色向左移动），并且动作空间必须有意义。
3. **一致性与记忆**（consistency and memory）：移开视线再看回来时世界必须保持不变，物体必须持续存在，推演（rollout）在几百帧之后也不能漂移成噪声。
4. **合理的动力学**（plausible dynamics）：物体像在目标领域（游戏规则或真实物理）中那样下落、碰撞和遮挡。
5. **速度**：要用于交互，就必须实时运行，通常为每秒 20-30 帧。

第 1 条要求在结构上最为关键；下图展示了下面每个交互式模型都在运行的循环。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-next-frame.svg" localized="true" width="85%" caption="交互式的逐帧预测：模型看到最近 $N$ 帧及其动作组成的窗口，生成 $x_{t+1}$，再把它加入上下文，同时最旧的一帧被移出。模型对世界的全部“认知”都必须装进这个窗口，而它自己的误差会在下一步被反馈回来。" %}

下面的每个系统都解决了这些需求中的不同子集。一种简洁的比较方式如下：

| 系统 | 年份 | 领域 | 生成器 | 动作输入 | 能否实时交互？ |
| --- | --- | --- | --- | --- | --- |
| GAIA-1 (Wayve) | 2023 | 驾驶 | tokenizer + 自回归 Transformer + 视频扩散解码器 | 自车速度/曲率、文本 | 否 |
| UniSim (Google DeepMind et al.) | 2023 | 机器人、人类、导航 | 视频扩散 | 文本或底层控制 | 否 |
| Sora (OpenAI) | 2024 | 通用视频 | 基于时空 patch 的扩散 Transformer | 无（文本/图像/视频提示） | 否 |
| Genie (Google DeepMind) | 2024 | 2D 平台游戏、机器人视频 | VQ tokenizer + MaskGIT 动力学 | 学习得到的潜在动作 | 否（约 1 fps） |
| GameNGen (Google) | 2024 | DOOM | 微调的 Stable Diffusion | 键盘动作 | 是，单个 TPU 上 20 fps |
| Genie 2 (Google DeepMind) | 2024 | 由图像生成 3D 世界 | 自回归潜在扩散 | 键盘/鼠标 | 否（研究原型） |
| Cosmos (NVIDIA) | 2025 | 物理 AI（机器人、驾驶） | 扩散与自回归世界基础模型 | 通过后训练 | 取决于具体模型 |
| Genie 3 (Google DeepMind) | 2025 | 由文本生成通用 3D 世界 | 未公开 | 导航 + 文本“世界事件” | 是，720p 下 24 fps（据官方公告） |

放到时间轴上（按 arXiv 提交或官方发布的月份）：

{% include blog_figure.liquid path="assets/img/blog/world-models/03-timeline.svg" caption="本文所讨论系统的时间线，另加 DIAMOND（第 1 篇）和 Diffusion Forcing（第 6 节）。橙色：可实时交互；紫色：以动作为条件；灰色：没有动作输入。大约两年里，这个领域从离线的、以动作为条件的视频预测走到了实时可玩的世界。" %}

## 2. Sora：“视频生成模型作为世界模拟器”

OpenAI 于 2024 年 2 月发布的技术报告 ["Video generation models as world simulators"](https://openai.com/index/video-generation-models-as-world-simulators/) 在较高层次上描述了 Sora（报告明确省略了模型与实现细节）：

- 一个**视频压缩网络**（video compression network）把原始视频映射到在空间和时间上都经过压缩的潜在表示（第 2 篇第 6 节）。
- 潜在表示被切分成**时空 patch**（spacetime patches），作为**扩散 Transformer**（diffusion Transformer）的 token（第 2 篇第 9 节）。由于模型看到的是长度可变的 patch 集合，它可以在视频原生的**时长、分辨率和宽高比**上训练，而不必把所有视频都裁成固定的正方形。
- 训练视频使用一个描述性字幕模型重新标注（即 DALL·E 3 中的技术），用户的简短提示则由语言模型进行扩写。

时空图块在 3D 中最容易看清：

{% include blog_figure.liquid path="assets/img/blog/world-models/03-spacetime-patches.svg" width="75%" caption="一个 $4 \times 4 \times 6$（时间、高、宽）的压缩视频潜变量被切成 $2 \times 2 \times 2$ 的时空图块，图中稍微分开画：每个彩色块成为一个 token，共 12 个。更长、更大或更宽的视频只是产生更多 token，所以模型可以在原始时长和宽高比上训练。（此处尺寸仅为示意；报告没有给出 Sora 的图块大小。）" %}

报告的核心主张就写在标题里：扩大视频生成的规模会产生**涌现的模拟能力**（emergent simulation capabilities），报告列举了相机运动下的 3D 一致性、长程连贯性与物体恒存性（有时能做到）、改变世界状态的简单交互（画家留下笔触、汉堡上的一口咬痕），以及“模拟数字世界”（它能在用一个基础策略控制玩家的同时渲染 Minecraft）。同一份报告也列出了失败之处：它无法准确模拟许多基本交互的物理过程，例如玻璃碎裂；吃东西之类的交互也并不总能产生正确的状态变化。

把 Sora 当作世界模型来引用时，有两点值得注意。第一，它**不以动作为条件**（not action-conditioned）：你无法用控制输入逐步推进它，因此它只是弱意义上的模拟器，即“用场景描述去提示它”。第二，证据是**定性的**（经过挑选的样例）；第 5 篇会讨论检验这类主张的基准测试，它们发现模型对物理的理解相当有限。

## 3. Genie：从无标注视频学习生成式交互环境

### 3.1 问题：互联网视频没有动作

要训练 $p(x_{t+1} \mid x_{\le t}, a_t)$ 就需要动作标签，但互联网上绝大多数游戏视频和真实世界视频都没有这些标签。**Genie**（Bruce et al., "Genie: Generative Interactive Environments", ICML 2024, [arXiv:2402.15391](https://arxiv.org/abs/2402.15391)）从约三万小时的 2D 平台游戏视频中学习了一个可控的世界模型，**完全不需要动作标签**。其 11B 参数的模型由三部分组成：

1. 一个**时空视频 tokenizer**（spatiotemporal video tokenizer）（一个 VQ-VAE，采用内存高效的 ST-Transformer，交替进行空间注意力和因果时间注意力），为每一帧生成离散 token $z_t$。
2. 一个**潜在动作模型**（latent action model, LAM），推断相邻两帧之间的离散动作 $\tilde a_t$（第 3.2 节）。
3. 一个**动力学模型**（dynamics model），即 MaskGIT 风格的 ST-Transformer，根据过去的 token 和潜在动作预测下一帧的 token：$p(z_{t+1} \mid z_{\le t}, \tilde a_{\le t})$。

下图展示了这三部分在训练和游玩时分别如何连接。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-genie.svg" localized="true" caption="Genie。训练（上）只需要视频：tokenizer 把帧变成 token，潜在动作模型从每对相邻帧推断出一个码 $\tilde a_t$，动力学模型学习根据过去的 token 和码预测下一帧的 token。游玩（下）：丢弃潜在动作模型，由用户在每一步从 8 个码中选一个。" %}

推理时 LAM 会被丢弃。用户（或智能体）在每一步从潜在动作中选择一个，再由动力学模型和 tokenizer 解码器渲染结果。Genie 可以用从未见过的图像（包括草图和照片）作为提示，把它们变成可玩的 2D 世界。同样的方法在机器人视频上训练后，为机械臂学到了一致的潜在动作；论文还表明，从专家视频中推断出的潜在动作可以用很少的标注样本为一个未见过的游戏训练策略。

### 3.2 潜在动作模型

LAM 是一个**中间带有信息瓶颈**（information bottleneck）的自编码器。编码器看到过去的帧 $x_{1:t}$ **以及**下一帧 $x_{t+1}$，输出一个连续向量，该向量被量化为数量极少的码字之一（Genie 使用 $\lvert \mathcal{A} \rvert = 8$）。解码器必须仅凭过去的帧和这个码字重建 $x_{t+1}$：

$$
\tilde a_t = \mathrm{VQ}\big(\mathrm{Enc}_\phi(x_{1:t}, x_{t+1})\big) \in \lbrace e_1, \dots, e_{\lvert\mathcal{A}\rvert} \rbrace,\qquad
\mathcal{L}_{\mathrm{LAM}} = \big\lVert x_{t+1} - \mathrm{Dec}_\psi(x_{1:t}, \tilde a_t) \big\rVert^2 + \mathcal{L}_{\mathrm{VQ}} .
$$

由于过去的帧已经提供给了解码器，利用这个 3 比特瓶颈最划算的方式，就是编码**发生了什么变化且无法从过去预测的部分**，而在游戏中这主要就是玩家的输入。同样的原理也出现在 **LAPO**（Schmidt & Jiang, "Learning to Act without Actions", ICLR 2024, [arXiv:2312.10812](https://arxiv.org/abs/2312.10812)）中，它从 Procgen 视频中恢复潜在动作策略和世界模型，并用一个很小的标注集把潜在动作映射到真实动作。一种更早的替代方案是 **VPT**（Baker et al., NeurIPS 2022, [arXiv:2206.11795](https://arxiv.org/abs/2206.11795)）：在少量带标注的 Minecraft 游玩数据上训练一个逆动力学模型（inverse dynamics model），再用它为 7 万小时的互联网视频打伪标签。

下图说明了为什么瓶颈会迫使这个码表示“动作”：

{% include blog_figure.liquid path="assets/img/blog/world-models/03-lam.svg" localized="true" width="85%" caption="潜在动作模型。编码器能看到过去帧和下一帧，但只有 3 比特（$\lvert\mathcal{A}\rvert = 8$ 个码）能传给解码器。由于解码器本来就能拿到过去的帧（虚线），通过瓶颈唯一值得传递的，是那些发生了变化且无法从过去预测的东西，在游戏中这主要就是玩家的输入。" %}

潜在动作有一些已知的弱点：它们可能捕捉到并非由智能体引起的变化（相机抖动、其他角色），在不同领域之间并不对齐，而且一个小的离散码本难以很好地表达连续控制。第 8 节给出了一个可运行的玩具 LAM。

### 3.3 Genie 2 与 Genie 3

**Genie 2**（Google DeepMind 博客，[2024 年 12 月](https://deepmind.google/discover/blog/genie-2-a-large-scale-foundation-world-model/)）转向了 3D。它被描述为一个**自回归潜在扩散模型**（autoregressive latent diffusion model）：帧先经过自编码器，然后一个像 LLM 一样用因果掩码训练的大型 Transformer 动力学模型，在给定过去潜在表示和键盘/鼠标动作的条件下，通过扩散生成下一个潜在帧。模型使用无分类器引导来提升动作的可控性。以单张图像（例如来自 Imagen 3）为提示，它生成的世界可以保持长达一分钟的一致性，能记住离开视野的场景部分，并能模拟水、烟、重力和光照等效果。DeepMind 用它为其 SIMA 智能体生成评估环境。

**Genie 3**（Google DeepMind 博客，[2025 年 8 月](https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/)）由文本提示生成，是该系列中第一个**可实时交互**的模型：公告称其在 720p 下达到每秒 24 帧，并能在几分钟内保持一致性。它还引入了**可提示的世界事件**（promptable world events）：用文本指令改变正在运行的世界（天气、新的物体或角色）。公告列出了若干局限，包括智能体的动作空间有限、多智能体交互困难、对真实地点和文字的渲染不准确，以及交互时长有限。公告发布时并未公开论文或架构细节，因此应把具体的能力主张视为该公司自己的说法。

*更新（2026 年 11 月）：*Genie 3 于 2026 年 1 月以 **Project Genie** 的形式向公众开放；**Genie 4** 于 2026 年 10 月 27 日以研究预览形式发布，加入了原生音频和语言操控。参见本文末尾的 2025–2026 年进展一节。

## 4. GameNGen：把扩散模型当作游戏引擎

**GameNGen**（Valevski et al., "Diffusion Models Are Real-Time Game Engines", ICLR 2025, [arXiv:2408.14837](https://arxiv.org/abs/2408.14837)）提出了一个范围很窄但很尖锐的问题：神经网络能否*本身就是*一个复杂游戏的游戏引擎？它在单个 TPU 上以每秒 20 帧交互式地模拟 DOOM，单次会话可持续数分钟。其方法分为两个阶段：

1. **数据**：一个强化学习智能体学习玩 DOOM，其所有训练回合（包括早期表现很差的回合，它们提供了多样化的覆盖）都被记录为（帧，动作）序列。
2. **模型**：把 Stable Diffusion v1.4 改造成下一帧预测器。文本条件被替换为最近若干动作的嵌入，过去的帧由自编码器编码后沿通道维度与加噪的潜在表示拼接：

$$
p_\theta\big(x_{t+1} \mid x_{t-N+1:t},\ a_{t-N+1:t}\big)
$$

其中 $N$ 是上下文中过去帧与动作的数量（论文中为 64）。

决定性的技巧是**上下文噪声增强**（noise augmentation of the context）。训练时，用随机强度的高斯噪声破坏*作为条件的*帧，并把该噪声强度作为输入提供给模型。于是模型学会纠正自身上下文中的误差，从而阻止自回归漂移，否则这种漂移会在几秒内毁掉推演。作者还微调了潜在解码器以减少 HUD 中的伪影，采样只用 4 步 DDIM，并报告下一帧 PSNR 为 29.4（与有损 JPEG 相当）；人类评估者区分真实游戏与模拟的短片段时，准确率仅略高于随机猜测。

把这些组合起来，GameNGen 的一次去噪过程如下：

{% include blog_figure.liquid path="assets/img/blog/world-models/03-gamengen.svg" localized="true" caption="论文所描述的 GameNGen：过去的帧经 Stable Diffusion 自编码器编码，加上随机强度 $\sigma$ 的高斯噪声（$\sigma$ 也作为输入给模型），再与下一帧的带噪潜变量按通道拼接。过去动作的嵌入取代了 U-Net 的文本条件，4 步 DDIM 生成 $x_{t+1}$。" %}

GameNGen 的局限同样富有启发性：由于只有约三秒的视觉上下文，它**没有长期记忆**。屏幕上不可见的游戏状态（例如你去过哪些区域）只能通过 HUD 显示的内容得以保留。DIAMOND（第 1 篇）在 CS:GO 上也得出了类似结论。

下图示意了为什么有限的上下文窗口意味着没有长期记忆。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-memory.svg" localized="true" width="85%" caption="沿环形路线行走的俯视示意图。在 $t_1$ 时智能体看到了红色地标。到 $t_2$ 时它再次面向同一个地方，但上下文窗口（橙色线段）只覆盖了路线的最后一段，因此模型的输入里没有任何信息说明那个地标长什么样。模型只能重新“想象”它，结果不一定一致。" %}

## 5. 以动作为条件的真实世界模拟器

### 5.1 UniSim

**UniSim**（Yang et al., "Learning Interactive Real-World Simulators", ICLR 2024 Outstanding Paper, [arXiv:2310.06114](https://arxiv.org/abs/2310.06114)）瞄准真实世界。它的洞见在于，不同数据集携带不同种类的“动作”：图像-字幕数据中的文本、机器人数据中的电机指令、导航数据中的相机运动、人类活动的语言描述。UniSim 把它们全部统一为同一个视频扩散模型的条件，该模型在给定历史和动作的情况下预测下一段视频。论文随后完全在模拟器内部训练了（a）一个高层视觉-语言规划器和（b）一个底层强化学习策略，并展示了向真实机器人的零样本迁移。这是视频世界模型可以*作为训练用模拟器*、而不仅仅用于生成好看视频的最清晰的证明。

### 5.2 面向驾驶的 GAIA-1

**GAIA-1**（Hu et al., Wayve, [arXiv:2309.17080](https://arxiv.org/abs/2309.17080), 2023）是一个面向自动驾驶的生成式世界模型。视频、文本和自车动作被编码为 token，一个自回归 Transformer 世界模型预测下一组图像 token（把未来预测当作下一个 token 预测），再由一个独立的视频扩散解码器渲染高分辨率帧。以动作为条件使人们可以提出反事实问题（“如果车向左转会怎样？”），文本提示则可以改变天气或时间。驾驶是一个天然的应用场景，因为罕见而危险的场景正是模拟器应该生成的东西。

*更新（2026 年 11 月）：*这条路线延续为 GAIA-2（2025 年，多相机潜在扩散）和 GAIA-4（2026 年，闭环的相机与雷达仿真）；Waymo 则在 Genie 3 的基础上构建了自己的驾驶世界模型。参见更新一节。

### 5.3 NVIDIA Cosmos

**Cosmos**（NVIDIA, "Cosmos World Foundation Model Platform for Physical AI", [arXiv:2501.03575](https://arxiv.org/abs/2501.03575), 2025）把世界模型定位为物理 AI 的**基础模型**（foundation models）。该平台包括视频筛选管线、连续和离散的 **Cosmos tokenizer**、扩散和自回归两种形式的预训练**世界基础模型**（world foundation models）、安全护栏，以及把通用模型专门化到相机控制、机器人操作和自动驾驶的后训练示例。这些模型以 NVIDIA Open Model License 发布（[github.com/NVIDIA/Cosmos](https://github.com/NVIDIA/Cosmos)）。预期的工作流是“在广泛的视频上预训练一次，再在你的机器人或汽车数据上后训练”，这与 LLM 的适配方式如出一辙。如果你想在一个大型开放视频世界模型上做实验，Cosmos 是一个很好的起点。

*更新（2026 年 11 月）：*NVIDIA 随后推出了 Cosmos-Predict2.5 和 Transfer2.5（2025 年 10 月），以及 **Cosmos 3**（2026 年 6 月），后者是一个同时具备推理能力并能输出动作的混合 Transformer 模型。参见更新一节。

## 6. 让自回归视频推演保持稳定

所有交互式模型都是逐帧（或逐块）生成，并以自身的输出为条件，因此它们以一种严重的形式面临第 1 篇中提到的误差累积问题。你会反复遇到以下技术：

- **上下文噪声增强**（context noise augmentation）（GameNGen、Genie 2 类模型）：用被破坏的上下文进行训练，并把破坏程度告诉模型。
- **Diffusion Forcing**（Chen et al., NeurIPS 2024, [arXiv:2407.01392](https://arxiv.org/abs/2407.01392)）：训练时为序列中的每一帧赋予其**独立的噪声强度**。以这种方式训练的因果模型可以在过去帧干净或仅略带噪声的情况下对后续帧去噪，保持未来的不确定性并稳定长时推演；它还支持对整条未来轨迹施加引导，用于规划。
- **带 KV 缓存的因果注意力**（causal attention with KV caching），使每一新帧的计算量保持恒定；以及**步数蒸馏**（step distillation）（少步或单步采样器），以达到实时速率。
- **记忆机制**（memory mechanisms）：更长的上下文窗口、对过去帧的压缩记忆、按相机位姿检索帧，或场景的显式 3D 表示。最后一种方案直接引向[第 4 篇]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})。

如下图所示，这些方案的区别仅在于训练序列中各帧被赋予怎样的噪声水平。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-diffusion-forcing.svg" localized="true" width="85%" caption="每一帧的噪声水平（白 = 干净，深色 = 纯噪声；灰 = 不在输入中）。全序列扩散对整段视频使用同一个水平；逐帧预测让过去保持干净，只给要预测的帧加噪；Diffusion Forcing 为每一帧独立采样噪声水平。这样在采样时就可以使用因果的“金字塔”调度（右下）：每一帧的去噪都比前一帧稍晚一些，因此近的未来比远的未来更清晰。" %}

## 7. 仍然缺少什么

- **长时程一致性与记忆。** 转两圈身，房间就变了。像素空间模型除了上下文窗口之外没有任何持久状态；几分钟级别的一致性是前沿主张，几小时级别则尚未解决。（*更新，2026 年 11 月：*带按位姿索引记忆的开放模型如今已报告分钟级一致性；小时级一致性和画面外的动态仍未解决。参见更新一节。）
- **物理。** Kang et al.（"How Far is Video Generation from World Model: A Physical Law Perspective", ICML 2025, [arXiv:2411.02385](https://arxiv.org/abs/2411.02385)）在合成的 2D 物理数据上训练视频扩散模型，发现其在分布内的泛化近乎完美，但在分布外失败：模型表现得像**基于案例的**（case-based）检索（模仿最接近的训练样例），而不是学到了规律。Physics-IQ（Motamed et al., WACV 2026, [arXiv:2501.09038](https://arxiv.org/abs/2501.09038)）发现，当前视频模型的物理理解极为有限，且与视觉真实感无关。第 5 篇会再回到评估问题。
- **可控性与动作空间。** 一个游戏里是键盘动作，另一个里是潜在动作，别处又是机器人关节指令：不存在共享的动作接口，这限制了迁移。
- **因果与相关。** 在被动视频上训练的模型可能会学到“雨伞导致下雨”。干预数据（动作）有帮助，但大多数视频都没有动作。
- **算力。** 高分辨率的实时生成需要大量蒸馏和专用硬件，而训练预算超出了大多数实验室的承受范围。
- **评估。** FVD 和视觉质量指标几乎无法说明一个模拟器是否适合用来训练智能体（第 5 篇）。

## 8. 代码：一个玩具潜在动作模型

下面的脚本把潜在动作的思想具体化。一个点在 $12 \times 12$ 网格上按五种隐藏动作（不动、上、下、左、右）移动。一个带 8 路离散瓶颈的 LAM **只用帧对** $(x_t, x_{t+1})$ 训练；之后我们检查学到的码字是否与隐藏动作对齐，并通过反复输入选定的码字来“玩”这个世界模型。为了在这么小的规模下稳定训练，瓶颈采用直通（straight-through）Gumbel-softmax，而不是 Genie 的 VQ（两者都能在保留梯度的同时给出离散码字）；编码器是带全局池化的卷积网络，即具有平移不变性。它在 CPU 上大约两分钟即可运行完毕。

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

torch.manual_seed(0)
G, K = 12, 8                                      # grid size, number of latent actions
MOVES = torch.tensor([[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]])   # stay, up, down, left, right

def render(pos):
    ys, xs = torch.meshgrid(torch.arange(G), torch.arange(G), indexing="ij")
    d2 = (ys[None] - pos[:, 0, None, None]) ** 2 + (xs[None] - pos[:, 1, None, None]) ** 2
    return torch.exp(-d2.float() / 0.5).reshape(len(pos), -1)

def sample_transitions(n):
    pos = torch.randint(1, G - 1, (n, 2))
    act = torch.randint(0, 5, (n,))
    nxt = (pos + MOVES[act]).clamp(0, G - 1)
    return render(pos), render(nxt), act

def mlp(i, o, h=256):
    return nn.Sequential(nn.Linear(i, h), nn.ReLU(), nn.Linear(h, h), nn.ReLU(), nn.Linear(h, o))

class ConvEncoder(nn.Module):
    """Translation-invariant: conv layers + global max pooling, so a code can only describe the motion."""
    def __init__(self):
        super().__init__()
        self.conv = nn.Sequential(nn.Conv2d(2, 32, 3, padding=1), nn.ReLU(), nn.Conv2d(32, 32, 3, padding=1), nn.ReLU())
        self.head = nn.Linear(32, K)

    def forward(self, x, x_next):
        h = self.conv(torch.stack([x, x_next], 1).view(-1, 2, G, G))
        return self.head(h.amax(dim=(2, 3)))

enc = ConvEncoder()
dec = mlp(G * G + K, G * G)
opt = torch.optim.Adam([*enc.parameters(), *dec.parameters()], lr=1e-3)
for step in range(3000):
    x, x_next, _ = sample_transitions(256)
    z = F.gumbel_softmax(enc(x, x_next), tau=1.0, hard=True)
    loss = F.mse_loss(dec(torch.cat([x, z], 1)), x_next) * 100
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 1000 == 0:
        print(f"step {step}  loss {loss.item():.4f}")
with torch.no_grad():
    x, x_next, act = sample_transitions(5000)
    idx = enc(x, x_next).argmax(1)
    for a, name in enumerate(["stay", "up", "down", "left", "right"]):
        c = torch.bincount(idx[act == a], minlength=K)
        print(f"{name:>5}: code {c.argmax().item()}, purity {(c.max() / c.sum()).item():.2f}")
    right = torch.bincount(idx[act == 4], minlength=K).argmax()
    frame = render(torch.tensor([[6, 3]]))
    for t in range(4):
        frame = dec(torch.cat([frame, F.one_hot(right, K).float()[None]], 1))
        r, c = divmod(frame.argmax().item(), G)
        print(f"t={t + 1}: dot at row {r}, col {c}")
```

在这个玩具例子中，五种隐藏动作通常会以很高的纯度映射到不同的码字，反复按下“右”对应的码字会让点每步向右移动一格。可以尝试：加入第二个*不受控制*、随机移动的点，看看码字是否也开始编码它的运动（这是 LAM 的一种已知失效模式）；或者把码本缩小到 4，看看哪些动作会被合并。还可以把 `ConvEncoder` 换成作用于拼接帧的 MLP：重建损失照样下降，但码字纯度会跌到 0.2-0.3 左右（接近随机水平）。原因是解码器也能看到当前位置，于是每个码字的含义可以随网格区域而变化。只有当网络结构或训练方式强制要求时，潜在动作才会在不同状态之间保持一致，这对在多样化视频上训练的 LAM 来说是一个真实存在的问题。

我们用同一个随机种子运行了这个脚本，以及上面提到的 MLP 编码器版本：

{% include blog_figure.liquid path="assets/img/blog/world-models/03-lam-results.svg" caption="上：每个隐藏动作的转移被分到 8 个学到的码上的比例。使用平移不变的 ConvEncoder 时，每个动作都有自己的码（平均纯度 0.96；“down” 被分到两个码上）；使用 MLP 编码器时，码是混杂的（平均纯度 0.25，接近随机）。下：从第 3 列出发，连续四次输入“right”的码来“玩”ConvEncoder 世界模型：圆点每步右移一格，到达第 7 列，同时解码器的小误差逐渐累积成背景噪声。" %}

## 2025–2026 年进展（截至 2026 年 11 月）

本节补充正文写成之后、截至 2026 年 11 月初发生的进展。这一时期交互式视频世界模型发展极快：实时生成成为常态，开放模型追上了 2025 年的闭源演示，研究重心也从“看起来对不对”转向“它记不记得住、智能体能不能用它”。每个条目都标注了状态：“预印本”指尚未在会议或期刊发表的 arXiv 论文；“公告”指公司博客或产品页面，其中的能力描述是公司的自述，而非经过同行评审的结果。下面的时间线汇总了本次更新（以及第 4、5 篇更新）中的所有系统，点击条目即可查看摘要、状态和链接。

{% include widget.liquid name="world-models-timeline" height="560" caption="动手试试：第 3–5 篇 2025–2026 年更新中涉及的世界模型的可筛选时间线。按钮按类型筛选；点击圆点（或用箭头按钮）查看两行摘要、状态（实心点 = 论文，空心点 = 公司公告或产品）和链接。虚线标出 2026 年 11 月初。可以看到，交互式视频这一行从 2025 年年中开始变得密集，而评测论文大约滞后一年跟上。" %}

### Google DeepMind：从 Genie 3 到 Project Genie 和 Genie 4

3.3 节介绍了 **Genie 3**（2025 年 8 月）：由文本提示生成世界，720p、每秒 24 帧，可保持几分钟的一致性，视觉记忆约一分钟。2026 年 1 月，Google 让它走出了实验室：**Project Genie**（[Google 博客，2026 年 1 月 29 日](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/)）是一个实验性网页应用，组合了 Genie 3、Nano Banana Pro 图像模型和 Gemini。它最初面向美国的成年 Google AI Ultra 订阅用户开放，每次生成限制在 60 秒以内。2026 年 10 月 27 日，DeepMind 发布了 **Genie 4**（[DeepMind 博客](https://deepmind.google/blog/genie-4-a-new-generation-of-world-simulation/)），以研究预览的形式向受信任的测试者开放。公告强调了原生生成的音频（会对事件做出反应的环境音、音乐和对话）、用自然语言提示进行实时操控，以及对物理和人物角色更好的模拟。Gemini 模型为模拟提供支持：它们把文本提示适配到周围场景，并在两次输入之间让世界继续演化。博客没有给出分辨率、帧率或架构，并指出一致性只能在*短时会话*中保持，时间更长或多次编辑之后可能发生漂移。用第 7 节的话说，前沿主张仍然是“几分钟，而不是几小时”。Genie 3 还成为了一个领域模型的基础，即 **Waymo World Model**（见下文自动驾驶部分）。

### 开放的实时交互模型

对学习者来说，2025–2026 年最重要的变化是：交互式世界模型现在可以自己*跑起来*了。大多数开放模型共享同一套配方。它们从一个大型预训练文生视频或图生视频扩散模型出发（常用 Wan，见[第 2 篇]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})），把它改成因果的并加入动作条件，再用 Self Forcing 式的目标把它蒸馏成少步自回归采样器（第 2 篇的更新解释了 Self Forcing 及其后续工作）。

- **Matrix-Game 2.0**（He et al.，预印本，[arXiv:2508.13009](https://arxiv.org/abs/2508.13009)，2025 年 8 月）是一个开源、实时、流式的世界模型，在大规模游戏和驾驶数据上训练。它把因果少步扩散学生模型与键盘、鼠标条件结合起来，让 GameNGen 的思路（第 4 节）在开放域场景和长时流式生成中也能成立。**Matrix-Game 3.0**（Wang et al.，预印本，[arXiv:2604.08995](https://arxiv.org/abs/2604.08995)，2026 年 4 月）加入了记忆：它按相机位姿检索过去的帧，用 DMD 做多段蒸馏，并用量化和剪枝后的 VAE 解码器加速解码。论文报告 5B 模型在 720p 下最高 40 fps，并能在长达一分钟的序列中保持记忆一致性。
- **Hunyuan-GameCraft**（Li et al.，预印本，[arXiv:2506.17201](https://arxiv.org/abs/2506.17201)，2025 年 6 月）把键盘和鼠标输入映射到共享的相机运动空间，并在训练中混合使用多种历史条件，使长的游戏风格视频能持续响应输入。**Yan**（Ye et al.，预印本，[arXiv:2508.08601](https://arxiv.org/abs/2508.08601)，2025 年 8 月）是一个由三部分组成的框架：实时模拟、多模态生成，以及用文本编辑正在运行的世界。
- **WorldPlay**（Sun et al.，预印本，[arXiv:2512.14614](https://arxiv.org/abs/2512.14614)，2025 年 12 月）针对速度与记忆之间的权衡。它用两种方式表示动作，从过去的帧重建紧凑的上下文记忆，并使用“context forcing”蒸馏。它以 24 fps 流式生成 720p 视频，长期几何一致性更好。**AlayaWorld**（预印本，[arXiv:2607.18367](https://arxiv.org/abs/2607.18367)，2026 年 7 月）是一个 24 fps 的 15B 自回归视频 DiT。它的上下文由四部分组成：一个“sink”帧、压缩后的历史、空间记忆和最近的帧。蒸馏把每个块的采样步数从约 30 步降到 4 步。
- **LongLive**（Yang et al.，预印本，[arXiv:2509.22622](https://arxiv.org/abs/2509.22622)，2025 年 9 月）不以动作为条件，但在长视频上展示了同一套机制。它是一个帧级自回归模型，用户可以在生成过程中切换提示。1.3B 模型在单块 H100 上达到 20.7 fps，可生成最长 240 秒的视频。

### 记忆：最主要的研究前沿

第 7 节把长时程一致性列为最大的缺口，2025–2026 年的大多数论文都在攻克它。下图展示了最基本的预算问题。把所有过去的潜在帧都保留在上下文中的模型，其内存和注意力开销随推演长度 $T$ 增长。$W$ 帧的滑动窗口很便宜，但会遗忘。常见的折中是保留窗口，再加上 $K$ 个*经过挑选的*记忆帧（或一个紧凑的 3D 状态），这样开销保持有界，旧的地点仍然可以被回忆起来。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-update-memory.svg" width="85%" caption="上下文大小 $N_{ctx}$（潜在帧数，对数坐标）随推演时间的变化，假设 24 fps 视频、4 倍时间压缩（每秒 6 个潜在帧）。完整上下文按 $O(T)$ 增长（红色），两分钟后达到 720 帧。5 秒的滑动窗口（蓝色虚线）保持在 $W = 30$，但看不到 5 秒以前的任何内容。窗口加上 $K = 16$ 个检索出的记忆帧（绿色）同样保持平坦（46 帧），并且仍能访问旧的视角。竖直虚线是 Genie 3 声称的约一分钟视觉记忆。" %}

记忆设计大致可按从隐式到显式分为四类：

1. **按相机位姿检索过去的帧。** *WorldMem*（Xiao et al.，预印本，[arXiv:2504.12369](https://arxiv.org/abs/2504.12369)）连同位姿和时间戳一起存储过去的帧，并对相关的帧做注意力。*Context as Memory*（Yu et al.，SIGGRAPH Asia 2025，[arXiv:2506.03141](https://arxiv.org/abs/2506.03141)）挑选相机视锥与当前视角重叠的帧作为上下文。*VMem*（Li et al.，ICCV 2025，[arXiv:2506.18903](https://arxiv.org/abs/2506.18903)）用面元（surfel）为过去的视角建立索引。*ReWorld*（Chen et al.，预印本，[arXiv:2608.23565](https://arxiv.org/abs/2608.23565)，2026 年 8 月）维护一个有界的 KV 缓存和一个按位姿索引的地标库。它用 4 个采样步流式生成 704x1280 视频，在 64 秒的往返行程后能重新生成起始视角。World Labs 的 **RTFM**（[博客，2025 年 10 月](https://worldlabs.ai/blog/rtfm)）在一个产品研究预览中应用了同样的原理。它没有显式 3D：带位姿的帧充当空间记忆，附近的帧被“轮换”（context juggling）进上下文。它在单块 H100 上以交互速率运行。
2. **压缩的循环状态。** *Long-Context State-Space Video World Models*（Po et al.，预印本，[arXiv:2505.20171](https://arxiv.org/abs/2505.20171)）用分块状态空间层负责长程记忆，用局部注意力负责细节。这相当于把[第 1 篇]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})的 RSSM 思想放大到视频尺度。
3. **对长上下文的可学习稀疏注意力。** *Mixture of Contexts*（Cai et al.，预印本，[arXiv:2508.21058](https://arxiv.org/abs/2508.21058)）让每个查询只路由到长历史中少数几个相关的块，而不是做稠密注意力。
4. **显式 3D 记忆。** 这一类模型把帧反投影成点云或高斯，并把渲染出的状态作为条件。例子有第 4 篇更新中介绍的 GEN3C 和 Voyager，以及 *L3G-World*（2026 年 10 月），它的高斯记忆随已探索的场景而不是随时间增长。

2026 年的一项严谨研究 **Echo-Memory**（King et al.，预印本，[arXiv:2606.09803](https://arxiv.org/abs/2606.09803)，2026 年 6 月）在同一个共享骨干网络上比较了这些选择。研究发现：原始上下文是一个很强的基线；激进的压缩会丢失返回某处所需的证据；在开放域中，分块状态空间循环是返回能力最强的机制。两篇综述梳理了这一领域：*Towards Interactive Video World Modeling*（[arXiv:2606.01164](https://arxiv.org/abs/2606.01164)）和 *The Past Frames the Future: Memory for Autoregressive Video Generation*（[arXiv:2609.28466](https://arxiv.org/abs/2609.28466)）。第 5 篇更新中的一个结果给所有这些工作泼了冷水：WRBench（2026 年 6 月）发现，当前模型不会让*看不见的*事件继续演化。记住一个地方的样子，并不等于模拟你离开期间那里发生了什么。

### 物理 AI 基础模型与通用世界模型

- **Cosmos 第二代和第三代。** NVIDIA 的 *World Simulation with Video Foundation Models for Physical AI*（预印本，[arXiv:2511.00062](https://arxiv.org/abs/2511.00062)，2025 年 10 月）推出了 Cosmos-Predict2.5 和 Cosmos-Transfer2.5。这个基于流的视频模型统一了文本、图像和视频到世界的生成，Transfer 模型则加入深度、分割和边缘等控制输入（Cosmos-Transfer1：[arXiv:2503.14492](https://arxiv.org/abs/2503.14492)）。Cosmos-Reason1（[arXiv:2503.15558](https://arxiv.org/abs/2503.15558)）是负责推理的视觉语言部分。2026 年 6 月 1 日，NVIDIA 发布了 **Cosmos 3**（[新闻稿](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Launches-Cosmos-3-the-Open-Frontier-Foundation-Model-for-Physical-AI/default.aspx)）。它被描述为一个开放的“全模态模型”（omnimodel），采用混合 Transformer（mixture-of-transformers）设计：一个推理 Transformer 加一个生成专家，能理解并生成文本、图像、视频、环境声音和动作。它可以充当视觉语言模型、世界模型，或机器人“世界动作模型”（world action model）的骨干。NVIDIA 称它在包括 Physics-IQ 在内的多个排行榜上位列开放模型第一；在独立评测出现之前，应将其视为公司的说法。这一设计把 5.3 节中的模拟器角色与[具身智能第 5 篇]({{ '/blog/2026/embodied-ai-05-vision-language-action-models/' | relative_url }})中的规划器/策略角色合在了一起。
- **Runway GWM-1**（[Runway，2025 年 12 月 11 日](https://runway.com/research/introducing-runway-gwm-1)）是构建在 Gen-4.5 视频模型之上的自回归世界模型。它逐帧生成，可以用相机位姿、机器人指令或音频来控制。它有三个后训练变体（Worlds、Avatars、Robotics），输出 720p，视频最长两分钟。
- **Emu3.5**（Cui et al.，预印本，[arXiv:2510.26583](https://arxiv.org/abs/2510.26583)，2025 年 10 月）是一个原生多模态的下一个 token 预测模型，在交错的视觉语言数据（包括来自视频的长序列）上训练，被定位为“世界学习者”。它说明第 2 篇中的自回归路线在扩散之外依然有生命力。

### 自动驾驶世界模型

自动驾驶仍然是最成熟的工业应用（5.2 节）。**GAIA-2**（Russell et al.，预印本，[arXiv:2503.20523](https://arxiv.org/abs/2503.20523)，2025 年 3 月）是一个生成一致多相机视频的潜在扩散模型，可以用自车动作、其他交通参与者、天气和道路布局来控制。Wayve 的 **GAIA-4**（[Wayve 博客，2026 年 8 月 3 日](https://wayve.ai/thinking/gaia-4/)）转向*闭环*仿真。它从记录的传感器日志重建场景，并让驾驶策略留在回路中，因此策略的决策会改变它接下来收到的相机*和雷达*输入。除非开启反应式智能体，其他道路使用者会重放日志中的行为。**Waymo World Model**（[Waymo 博客，2026 年 2 月 6 日](https://waymo.com/blog/2026/02/the-waymo-world-model-a-new-frontier-for-autonomous-driving-simulation)）在 Genie 3 的基础上针对驾驶进行后训练，同时生成相机和激光雷达输出（4D 点云），并提供驾驶动作、场景布局和语言三种控制方式。Waymo 把它定位为模拟罕见、安全攸关事件的工具。这是迄今最清晰的一个案例：通用世界模型成为领域模拟器的基础，正是 5.3 节所说的“广泛预训练，再在你的汽车数据上后训练”的工作流。

### “仍然缺少什么”有哪些变化

- **算力与实时性：**借助蒸馏，开放模型在 720p 下已基本解决（单块 GPU 上每秒几十帧）。现在的未解问题是长时流式生成中的质量，而不是速度。
- **记忆：**分钟级一致性已经是开放模型的成果，而不只是前沿主张。小时级一致性和*持久的动态状态*（在画面外继续发生的事件）仍未解决。
- **动作空间：**仍然碎片化。相机位姿成为探索类模型事实上的共享接口，机器人模型则转向视频与动作的联合预测（见第 1 篇更新）。
- **物理与评测：**物理基准大量涌现，但最好的模型离满分仍很远（见第 5 篇更新）。

关于这些模型如何被接入游戏引擎（引擎中的神经渲染、可玩的神经游戏、引擎侧工具），参见[图形引擎第 6 篇]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})；关于用来与它们比较的经典模拟器（Isaac、MuJoCo、Newton 等），参见[图形引擎第 5 篇]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 为什么重要 |
| --- | --- | --- | --- | --- |
| Video Diffusion Models (Ho et al.) | NeurIPS | 2022 | [arXiv:2204.03458](https://arxiv.org/abs/2204.03458) | 早期的视频扩散模型 |
| Video PreTraining (VPT): Learning to Act by Watching Unlabeled Online Videos (Baker et al.) | NeurIPS | 2022 | [arXiv:2206.11795](https://arxiv.org/abs/2206.11795) | 用逆动力学为互联网视频生成伪标签 |
| GAIA-1: A Generative World Model for Autonomous Driving (Hu et al.) | arXiv (Wayve tech report) | 2023 | [arXiv:2309.17080](https://arxiv.org/abs/2309.17080) | 基于 token、支持动作与文本控制的驾驶世界模型 |
| Learning Interactive Real-World Simulators (UniSim, Yang et al.) | ICLR | 2024 | [arXiv:2310.06114](https://arxiv.org/abs/2310.06114) | 统一异构动作；在视频模拟器中训练策略 |
| Learning to Act without Actions (LAPO, Schmidt, Jiang) | ICLR | 2024 | [arXiv:2312.10812](https://arxiv.org/abs/2312.10812) | 从仅有观测的视频中学习潜在动作策略 |
| Video generation models as world simulators (Sora, OpenAI) | technical report | 2024 | [openai.com](https://openai.com/index/video-generation-models-as-world-simulators/) | 时空 patch 扩散 Transformer；“涌现模拟”主张 |
| Genie: Generative Interactive Environments (Bruce et al.) | ICML | 2024 | [arXiv:2402.15391](https://arxiv.org/abs/2402.15391) | 通过潜在动作从无标注视频得到可控世界 |
| Diffusion Forcing: Next-token Prediction Meets Full-Sequence Diffusion (Chen et al.) | NeurIPS | 2024 | [arXiv:2407.01392](https://arxiv.org/abs/2407.01392) | 逐帧噪声强度，实现稳定的长时推演 |
| Genie 2: A large-scale foundation world model (Google DeepMind) | blog | 2024 | [deepmind.google](https://deepmind.google/discover/blog/genie-2-a-large-scale-foundation-world-model/) | 图像提示、动作可控的 3D 世界 |
| Diffusion Models Are Real-Time Game Engines (GameNGen, Valevski et al.) | ICLR | 2025 | [arXiv:2408.14837](https://arxiv.org/abs/2408.14837) | 实时 DOOM；上下文噪声增强 |
| Cosmos World Foundation Model Platform for Physical AI (NVIDIA) | arXiv | 2025 | [arXiv:2501.03575](https://arxiv.org/abs/2501.03575) | 开放的世界基础模型与 tokenizer |
| Genie 3: A new frontier for world models (Google DeepMind) | blog | 2025 | [deepmind.google](https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/) | 实时、文本提示、可提示的世界事件 |
| How Far is Video Generation from World Model: A Physical Law Perspective (Kang et al.) | ICML | 2025 | [arXiv:2411.02385](https://arxiv.org/abs/2411.02385) | 视频模型按案例泛化，而非依据物理规律 |
| GAIA-2: A Controllable Multi-View Generative World Model for Autonomous Driving (Russell et al.) | 预印本 | 2025 | [arXiv:2503.20523](https://arxiv.org/abs/2503.20523) | 控制方式丰富的多相机驾驶世界模型 |
| WorldMem: Long-term Consistent World Simulation with Memory (Xiao et al.) | 预印本 | 2025 | [arXiv:2504.12369](https://arxiv.org/abs/2504.12369) | 带位姿的过去帧记忆库 |
| Context as Memory (Yu et al.) | SIGGRAPH Asia | 2025 | [arXiv:2506.03141](https://arxiv.org/abs/2506.03141) | 按相机视锥重叠检索上下文帧 |
| VMem: Consistent Interactive Video Scene Generation with Surfel-Indexed View Memory (Li et al.) | ICCV | 2025 | [arXiv:2506.18903](https://arxiv.org/abs/2506.18903) | 以几何为索引的视角记忆 |
| Long-Context State-Space Video World Models (Po et al.) | 预印本 | 2025 | [arXiv:2505.20171](https://arxiv.org/abs/2505.20171) | SSM 记忆加局部注意力 |
| Hunyuan-GameCraft (Li et al.) | 预印本 | 2025 | [arXiv:2506.17201](https://arxiv.org/abs/2506.17201) | 动作统一到相机空间，混合历史条件 |
| Matrix-Game 2.0 (He et al.) | 预印本 | 2025 | [arXiv:2508.13009](https://arxiv.org/abs/2508.13009) | 开放的实时流式世界模型 |
| Yan: Foundational Interactive Video Generation (Ye et al.) | 预印本 | 2025 | [arXiv:2508.08601](https://arxiv.org/abs/2508.08601) | 模拟、生成与编辑合于一个框架 |
| Mixture of Contexts for Long Video Generation (Cai et al.) | 预印本 | 2025 | [arXiv:2508.21058](https://arxiv.org/abs/2508.21058) | 在长历史上做可学习的稀疏路由 |
| LongLive: Real-time Interactive Long Video Generation (Yang et al.) | 预印本 | 2025 | [arXiv:2509.22622](https://arxiv.org/abs/2509.22622) | 分钟级、可切换提示的实时自回归视频 |
| World Simulation with Video Foundation Models for Physical AI (NVIDIA, Cosmos-Predict2.5) | 预印本 | 2025 | [arXiv:2511.00062](https://arxiv.org/abs/2511.00062) | 第二代 Cosmos 世界模拟器 |
| Emu3.5: Native Multimodal Models are World Learners (Cui et al.) | 预印本 | 2025 | [arXiv:2510.26583](https://arxiv.org/abs/2510.26583) | 作为世界学习者的下一个 token 多模态模型 |
| RTFM: A Real-Time Frame Model (World Labs) | blog | 2025 | [worldlabs.ai](https://worldlabs.ai/blog/rtfm) | 带位姿的帧作为空间记忆，无显式 3D |
| Introducing Runway GWM-1 (Runway) | blog | 2025 | [runway.com](https://runway.com/research/introducing-runway-gwm-1) | 基于 Gen-4.5 的通用世界模型系列 |
| WorldPlay (Sun et al.) | 预印本 | 2025 | [arXiv:2512.14614](https://arxiv.org/abs/2512.14614) | 带重建式上下文记忆的实时 720p |
| Project Genie (Google) | blog | 2026 | [blog.google](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/) | Genie 3 作为公开原型 |
| The Waymo World Model (Waymo) | blog | 2026 | [waymo.com](https://waymo.com/blog/2026/02/the-waymo-world-model-a-new-frontier-for-autonomous-driving-simulation) | 由 Genie 3 后训练而来的相机 + 激光雷达驾驶模拟器 |
| Matrix-Game 3.0 (Wang et al.) | 预印本 | 2026 | [arXiv:2604.08995](https://arxiv.org/abs/2604.08995) | 带长时程记忆的 720p 实时模型 |
| NVIDIA Launches Cosmos 3 (NVIDIA) | 新闻稿 | 2026 | [nvidia.com](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Launches-Cosmos-3-the-Open-Frontier-Foundation-Model-for-Physical-AI/default.aspx) | 开放全模态模型：推理 + 生成 + 动作 |
| Echo-Memory: A Controlled Study of Memory in Action World Models (King et al.) | 预印本 | 2026 | [arXiv:2606.09803](https://arxiv.org/abs/2606.09803) | 对记忆机制的公平比较 |
| AlayaWorld (AlayaWorld Team) | 预印本 | 2026 | [arXiv:2607.18367](https://arxiv.org/abs/2607.18367) | 15B 长时程交互模型 |
| GAIA-4 (Wayve) | blog | 2026 | [wayve.ai](https://wayve.ai/thinking/gaia-4/) | 闭环的相机 + 雷达驾驶仿真 |
| ReWorld: An Interactive World Model with Long-Horizon Memory (Chen et al.) | 预印本 | 2026 | [arXiv:2608.23565](https://arxiv.org/abs/2608.23565) | 有界缓存加按位姿索引的地标 |
| Genie 4: A new generation of world simulation (Google DeepMind) | blog | 2026 | [deepmind.google](https://deepmind.google/blog/genie-4-a-new-generation-of-world-simulation/) | 原生音频、语言操控（研究预览） |

## 学习资源

- 上面的 Sora 报告以及 Genie 2 / Genie 3 公告篇幅都不长，值得完整阅读，最好与它们的局限性部分对照着读。
- NVIDIA Cosmos 的代码和模型：[github.com/NVIDIA/Cosmos](https://github.com/NVIDIA/Cosmos)。
- DIAMOND 的代码包含可玩的 Atari 和 CS:GO 世界模型，可在单块消费级 GPU 上运行：[github.com/eloialonso/diamond](https://github.com/eloialonso/diamond)。
- Diffusion Forcing 的代码：[github.com/buoyancy99/diffusion-forcing](https://github.com/buoyancy99/diffusion-forcing)。
- 关于生成模型的背景知识，可参考 Lilian Weng 的 ["What are Diffusion Models?"](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/) 和 Stanford [CS236](https://deepgenerativemodels.github.io/)。

## 练习

1. 运行这个玩具 LAM。然后加入第二个点，让它随机移动且与动作无关。码字纯度会如何变化？提出一种能恢复纯度的修改（提示：给解码器提供关于干扰物的信息）。
2. 把 LAM 的解码器改造成多步世界模型，并推演 30 步。点能保持清晰吗？实现 GameNGen 风格的上下文噪声增强（训练时给输入帧加噪并传入噪声强度），并进行比较。
3. 写出 GameNGen 和 Sora 式整段片段扩散所使用的分解 $p(x_{1:T} \mid a_{1:T})$。哪一种可以交互式使用？各自需要为什么而重新训练？
4. 从 Genie 3 的公告中挑选一项主张，设计一个能定量检验它的实验（数据、指标、基线）。
5. （2025–2026 年更新）利用记忆示意图中的数字，计算完整上下文模型在 120 秒后的 KV 缓存大小。假设每个潜在帧有 1,560 个 token，模型有 30 层，每层以 16 位浮点存储宽度为 1,536 的键和值。将其与 $W + K = 46$ 帧的设计进行比较。

<details markdown="1"><summary>提示</summary>

每帧：$1560 \times 30 \times 2 \times 1536 \times 2$ 字节 $\approx 0.29$ GB。完整上下文（720 帧）约需 207 GB，单块 GPU 放不下；有界设计（46 帧）约需 13 GB。这就是更新中每个实时模型都要限制上下文大小的原因。

</details>

**下一篇：**[第 4 篇]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})将探讨像素空间模拟器之外的另一条路线：生成显式的 3D 和 4D 世界，从分数蒸馏（score distillation）到高斯场景生成器，再到 World Labs 的 Marble。
