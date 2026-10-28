---
layout: post
title: "生成式工具箱：VAE、tokenizer、Transformer、扩散模型与流匹配"
date: 2026-10-27 15:02:00+0900
description: "构成现代世界模型的生成模型：VAE 与 ELBO、VQ-VAE tokenizer、自回归 Transformer、DDPM、score/SDE 视角、DDIM、潜在扩散、无分类器引导、流匹配与 DiT，并附可运行的 PyTorch 代码。"
categories: world-models
tags: [world-models, vae, vq-vae, diffusion, flow-matching, dit]
series: world-models
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

在[第 1 篇]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})中，世界模型（world model）是针对每个任务单独训练的小型网络：VAE 加 RNN，或者 RSSM。而如今的视频世界模拟器（Sora、Genie、GameNGen、Cosmos；[第 3 篇]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})）和 3D 世界生成器（[第 4 篇]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})）都是由同样几种生成式构件组装而成的：一个压缩像素的**自编码器或 tokenizer**（autoencoder / tokenizer），以及一个对压缩后序列建模的**序列模型**（sequence model；自回归 Transformer、扩散模型或流模型，通常以 Transformer 为骨干）。本文会把每个构件推导得足够仔细，让你能够不靠含糊其辞地读懂世界模型论文，并从零实现一个扩散模型。

## 前置知识

- 本系列第 1 篇（RSSM 是一个序列化的 VAE）。
- 概率论：高斯分布、KL 散度（KL divergence）、贝叶斯公式（Bayes' rule）、Jensen 不等式（Jensen's inequality）。
- PyTorch 基础。代码可以在 CPU 上运行。

## 1. 问题与全景

我们观测到样本 $x \sim p_{\mathrm{data}}(x)$（图像、视频片段、token 序列），希望得到一个模型 $p_\theta(x)$：可以从中**采样**，通常还能以某个 $c$（文本、过去的帧、动作）为**条件**，有时还能**评估**其似然。不同的模型族做出了不同的取舍：

| 模型族 | 采样 | 似然 | 在世界模型中的典型角色 |
| --- | --- | --- | --- |
| VAE | 一次解码器前向 | 下界（ELBO） | 把帧压缩为潜变量（Ha & Schmidhuber 的 V、潜在扩散的自编码器） |
| VQ-VAE / tokenizer | （需要一个 token 上的先验） | - | 把帧变成供 Transformer 使用的离散 token（IRIS、GAIA-1、Genie） |
| 自回归 Transformer | 顺序进行，一次一个 token | 精确 | 下一个 token 的动力学（GAIA-1、Genie） |
| 扩散 / score 模型 | 迭代去噪（数十步） | 下界 / ODE | 帧与视频生成（Sora、GameNGen、DIAMOND、Cosmos） |
| 流匹配 / 整流流 | ODE 积分（几步到数十步） | 通过 ODE | 现代图像/视频骨干网络（Stable Diffusion 3、许多视频模型） |

这里省略了 GAN；它们仍然以辅助损失的形式出现（VQGAN），但很少作为世界模型的核心。

## 2. 变分自编码器

### 2.1 ELBO

潜变量模型（latent-variable model）写作 $p_\theta(x) = \int p_\theta(x \mid z)\, p(z)\, dz$，其中先验 $p(z) = \mathcal{N}(0, I)$ 很简单。这个积分难以计算，因此我们引入一个编码器 $q_\phi(z \mid x)$，并应用 Jensen 不等式：

$$
\ln p_\theta(x) = \ln \mathbb{E}_{q_\phi(z\mid x)}\left[\frac{p_\theta(x\mid z)\,p(z)}{q_\phi(z\mid x)}\right]
\;\ge\; \underbrace{\mathbb{E}_{q_\phi(z\mid x)}\big[\ln p_\theta(x\mid z)\big] - \mathrm{KL}\big(q_\phi(z\mid x)\,\Vert\,p(z)\big)}_{\mathrm{ELBO}(x;\,\theta,\phi)}.
$$

两者之间的差距恰好是 $\mathrm{KL}(q_\phi(z \mid x) \Vert p_\theta(z \mid x))$，所以最大化证据下界（evidence lower bound, ELBO）既能拟合数据，又能让编码器逼近真实后验。采用对角高斯编码器 $q_\phi(z \mid x) = \mathcal{N}(\mu, \mathrm{diag}\,\sigma^2)$ 时，KL 项有闭式解：

$$
\mathrm{KL}\big(\mathcal{N}(\mu, \mathrm{diag}\,\sigma^2)\,\Vert\,\mathcal{N}(0, I)\big) = \frac{1}{2}\sum_{j}\left(\mu_j^2 + \sigma_j^2 - 1 - \ln \sigma_j^2\right).
$$

### 2.2 重参数化技巧

为了让梯度能够穿过对 $z$ 的采样，将其写成 $z = \mu_\phi(x) + \sigma_\phi(x) \odot \epsilon$，其中 $\epsilon \sim \mathcal{N}(0, I)$。这样随机性就落在了一个输入上，梯度可以流经 $\mu$ 和 $\sigma$。Dreamer 的动作和随机状态（第 1 篇）用的也是同样的技巧，即重参数化技巧（reparameterization trick）。

### 2.3 VAE 擅长什么、不擅长什么

使用高斯解码器时，$-\ln p_\theta(x \mid z)$ 就是 L2 损失，它会对不确定性取平均，从而生成**模糊**的样本。用 $\beta$ 加权 KL 项（$\beta$-VAE）可以在重建质量和更规整的潜在空间之间做权衡；过强的解码器则可能完全忽略 $z$（**后验坍缩**，posterior collapse）。在现代系统中，VAE 本身很少充当生成器，而是作为一个**感知压缩器**（perceptual compressor）：一个 KL 权重很小、并加上感知损失和对抗损失的卷积自编码器，把一张 $256 \times 256 \times 3$ 的图像映射为比如 $32 \times 32 \times 4$ 的潜变量，然后由扩散模型在其上工作（第 6 节）。

## 3. VQ-VAE 与视觉 tokenizer

**VQ-VAE**（van den Oord et al., NeurIPS 2017）使潜变量变成**离散**的。编码器输出一个向量网格 $z_e(x)$；其中每个向量都被替换为可学习码本（codebook）$\lbrace e_k \rbrace_{k=1}^{K}$ 中距离它最近的条目：

$$
z_q(x) = e_{k^\ast}, \qquad k^\ast = \arg\min_k \lVert z_e(x) - e_k \rVert_2 .
$$

argmin 没有梯度，因此解码器的梯度被直接复制给编码器（代码中写作 $z_q = z_e + \mathrm{sg}(z_q - z_e)$）。损失为

$$
\mathcal{L} = -\ln p(x \mid z_q(x)) + \lVert \mathrm{sg}[z_e(x)] - e \rVert_2^2 + \beta\, \lVert z_e(x) - \mathrm{sg}[e] \rVert_2^2 ,
$$

其中第二项把码本向量拉向编码器输出，第三项（**承诺损失**，commitment loss；论文中 $\beta = 0.25$）让编码器保持在其所选码字附近。许多实现会用指数滑动平均（exponential moving average）更新来替代码本项。

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class VectorQuantizer(nn.Module):
    def __init__(self, num_codes=512, dim=64, beta=0.25):
        super().__init__()
        self.codebook = nn.Embedding(num_codes, dim)
        self.codebook.weight.data.uniform_(-1 / num_codes, 1 / num_codes)
        self.beta = beta

    def forward(self, z_e):                       # z_e: [..., dim]
        flat = z_e.reshape(-1, z_e.shape[-1])
        d = (flat.pow(2).sum(1, keepdim=True)     # squared distances to every code
             - 2 * flat @ self.codebook.weight.t()
             + self.codebook.weight.pow(2).sum(1))
        idx = d.argmin(1)
        z_q = self.codebook(idx).view_as(z_e)
        loss = F.mse_loss(z_q, z_e.detach()) + self.beta * F.mse_loss(z_e, z_q.detach())
        z_q = z_e + (z_q - z_e).detach()          # straight-through estimator
        return z_q, idx.view(z_e.shape[:-1]), loss

vq = VectorQuantizer()
z_q, tokens, loss = vq(torch.randn(2, 16, 16, 64))   # a 16x16 grid of tokens per image
print(tokens.shape, loss.item())
```

离散 token 把图像变成了 Transformer 可以用交叉熵建模的“句子”。**VQGAN**（Esser et al., CVPR 2021）加入了感知损失和 patch-GAN 损失，使得较小的 token 网格依然能解码出清晰的图像。对于视频，tokenizer 会用因果 3D 卷积或 Transformer 同时在空间*和*时间上进行压缩。MAGVIT-v2（Yu et al., ICLR 2024）用**无查找量化**（lookup-free quantization）取代了码本查找（每个潜在通道被量化为 $\pm 1$，因此“码本”是隐式的，并且可以非常大），NVIDIA 的 Cosmos tokenizer 则同时提供连续和离散两种版本。GAIA-1 和 Genie 都构建在这类视频 tokenizer 之上。

## 4. 自回归 Transformer

任何 token 序列上的分布都可以按链式法则分解：

$$
p_\theta(x_1, \dots, x_N) = \prod_{i=1}^{N} p_\theta(x_i \mid x_{\lt i}).
$$

带有**因果注意力掩码**（causal attention mask）的仅解码器（decoder-only）Transformer 在训练时可以并行计算全部 $N$ 个条件分布（**教师强制**，teacher forcing），损失为交叉熵之和 $-\sum_i \ln p_\theta(x_i \mid x_{\lt i})$。对于世界模型，序列中帧 token 与动作交替出现，例如 `[frame_1 tokens][a_1][frame_2 tokens][a_2]...`，这样对下一帧 token 的预测就以过去的帧和动作为条件。

实践中有两个问题：

- **采样代价**：生成一个 $16 \times 16$ token 的帧需要 256 个顺序步骤。**MaskGIT**（Chang et al., CVPR 2022）转而训练一个*双向* Transformer 来预测被随机掩码的 token，并通过保留置信度最高的预测，在大约 8-16 个并行细化步骤内解码出一帧；Genie 的动力学模型就采用了这种解码方式。
- **暴露偏差 / 漂移**（exposure bias / drift）：训练时模型总是以真实数据为条件；测试时则以自己的采样结果为条件，因此误差会在长时间推演中不断累积。这是第 1 篇中误差累积问题在序列模型中的版本，也是所有长时程视频世界模型的核心难点。

## 5. 扩散模型

### 5.1 前向过程

**去噪扩散概率模型**（denoising diffusion probabilistic models, DDPM；Ho, Jain, Abbeel, NeurIPS 2020，建立在 Sohl-Dickstein et al., ICML 2015 的基础上）定义了一条固定的马尔可夫链，按方差调度（variance schedule）$\beta_1, \dots, \beta_T$ 逐步添加高斯噪声：

$$
q(x_t \mid x_{t-1}) = \mathcal{N}\big(x_t;\ \sqrt{1-\beta_t}\, x_{t-1},\ \beta_t I\big).
$$

记 $\alpha_t = 1 - \beta_t$、$\bar\alpha_t = \prod_{s=1}^{t} \alpha_s$，高斯分布的复合给出了一个可以直接跳到任意步的闭式解：

$$
q(x_t \mid x_0) = \mathcal{N}\big(x_t;\ \sqrt{\bar\alpha_t}\, x_0,\ (1-\bar\alpha_t) I\big)
\quad\Longleftrightarrow\quad
x_t = \sqrt{\bar\alpha_t}\, x_0 + \sqrt{1-\bar\alpha_t}\, \epsilon,\ \ \epsilon \sim \mathcal{N}(0, I).
$$

当 $T$ 足够大且调度合适时，$\bar\alpha_T \approx 0$，$x_T$ 基本就是纯噪声。

### 5.2 反向过程与损失

我们学习一条从 $p(x_T) = \mathcal{N}(0, I)$ 出发的反向链 $p_\theta(x_{t-1} \mid x_t) = \mathcal{N}(x_{t-1};\ \mu_\theta(x_t, t),\ \sigma_t^2 I)$。与 VAE 类似（前向过程扮演一个固定编码器的角色），负 ELBO 可以分解为逐步的 KL 项：

$$
-\ln p_\theta(x_0) \le \mathbb{E}_q\Big[\underbrace{\mathrm{KL}(q(x_T\mid x_0)\,\Vert\,p(x_T))}_{\text{constant}} + \sum_{t=2}^{T} \mathrm{KL}\big(q(x_{t-1}\mid x_t, x_0)\,\Vert\,p_\theta(x_{t-1}\mid x_t)\big) - \ln p_\theta(x_0\mid x_1)\Big].
$$

关键事实在于，**以 $x_0$ 为条件**的前向后验是一个可解析计算的高斯分布（对高斯分布应用贝叶斯公式）：

$$
q(x_{t-1} \mid x_t, x_0) = \mathcal{N}\big(x_{t-1};\ \tilde\mu_t(x_t, x_0),\ \tilde\beta_t I\big),\quad
\tilde\mu_t = \frac{\sqrt{\bar\alpha_{t-1}}\,\beta_t}{1-\bar\alpha_t}\, x_0 + \frac{\sqrt{\alpha_t}\,(1-\bar\alpha_{t-1})}{1-\bar\alpha_t}\, x_t,\quad
\tilde\beta_t = \frac{1-\bar\alpha_{t-1}}{1-\bar\alpha_t}\,\beta_t .
$$

代入 $x_0 = (x_t - \sqrt{1-\bar\alpha_t}\,\epsilon)/\sqrt{\bar\alpha_t}$，得到 $\tilde\mu_t = \frac{1}{\sqrt{\alpha_t}}\big(x_t - \frac{\beta_t}{\sqrt{1-\bar\alpha_t}}\,\epsilon\big)$。因此很自然地让网络去预测噪声，即 $\mu_\theta(x_t, t) = \frac{1}{\sqrt{\alpha_t}}\big(x_t - \frac{\beta_t}{\sqrt{1-\bar\alpha_t}}\,\epsilon_\theta(x_t, t)\big)$。两个方差相同的高斯分布之间的 KL 是均值之间平方距离的缩放，于是变为

$$
\mathrm{KL}_t = \frac{\beta_t^2}{2\sigma_t^2\, \alpha_t\, (1-\bar\alpha_t)}\, \big\lVert \epsilon - \epsilon_\theta(x_t, t)\big\rVert^2 + \text{const}.
$$

Ho 等人发现，在实践中去掉这个权重效果更好，由此得到了著名的**简化损失**（simple loss）：

$$
\mathcal{L}_{\mathrm{simple}}(\theta) = \mathbb{E}_{x_0,\ t \sim \mathcal{U}\lbrace 1..T\rbrace,\ \epsilon}\Big[\big\lVert \epsilon - \epsilon_\theta\big(\sqrt{\bar\alpha_t}\,x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon,\ t\big)\big\rVert^2\Big].
$$

因此训练过程非常简单：取一张图像、一个随机时间步和随机噪声，加噪，然后回归噪声。祖先采样（ancestral sampling）则从 $t = T$ 到 $1$ 执行 $x_{t-1} = \mu_\theta(x_t, t) + \sigma_t z$，其中 $\sigma_t^2 = \beta_t$ 或 $\tilde\beta_t$。

等价的**参数化方式**（parameterization）也很常见：直接预测 $x_0$，或者预测“速度” $v = \sqrt{\bar\alpha_t}\,\epsilon - \sqrt{1-\bar\alpha_t}\,x_0$（许多视频模型采用后者，因为它在调度的两端都表现良好）。

### 5.3 score 视角与 SDE

为什么预测噪声是有效的？**Tweedie 公式**（Tweedie's formula）表明，对于 $x_t = \sqrt{\bar\alpha_t} x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon$，噪声的后验均值与加噪边缘分布的**分数**（score）直接相关：

$$
\nabla_{x_t} \ln p_t(x_t) = -\frac{\mathbb{E}[\epsilon \mid x_t]}{\sqrt{1-\bar\alpha_t}}
\qquad\Rightarrow\qquad
s_\theta(x_t, t) := -\frac{\epsilon_\theta(x_t, t)}{\sqrt{1-\bar\alpha_t}} \approx \nabla_{x_t} \ln p_t(x_t).
$$

噪声预测损失（在加权意义下）就是**去噪分数匹配**（denoising score matching；Vincent, 2011），去噪器估计的是在每个噪声水平上指向数据的梯度场（Song & Ermon 的 NCSN，NeurIPS 2019）。

Song 等人（ICLR 2021）在连续时间下统一了这两种视角。前向**随机微分方程**（stochastic differential equation, SDE）$dx = f(x, t)\,dt + g(t)\,dw$ 把数据扩散为噪声；DDPM 是**方差保持**（variance-preserving）SDE $dx = -\tfrac{1}{2}\beta(t)\,x\,dt + \sqrt{\beta(t)}\,dw$ 的离散化。根据 Anderson 定理，该过程可以按照**反向 SDE**（reverse SDE）在时间上倒着运行：

$$
dx = \big[f(x, t) - g(t)^2\, \nabla_x \ln p_t(x)\big]\,dt + g(t)\,d\bar w,
$$

此外还存在一个具有相同边缘分布 $p_t$ 的确定性**概率流 ODE**（probability-flow ODE）：

$$
\frac{dx}{dt} = f(x, t) - \frac{1}{2}\, g(t)^2\, \nabla_x \ln p_t(x).
$$

把分数替换为 $s_\theta$，就可以用任意 SDE 或 ODE 求解器来采样。ODE 视角解释了为什么存在步数少得多的采样器，能够给出精确似然，并把扩散模型与流匹配联系起来（第 8 节）。

### 5.4 DDIM：快速确定性采样

**DDIM**（Song, Meng, Ermon, ICLR 2021）注意到训练损失只依赖于边缘分布 $q(x_t \mid x_0)$，因此可以使用任何具有相同边缘分布的非马尔可夫过程。它的更新先预测干净样本，再把它重新加噪到 $t-1$ 的噪声水平：

$$
\hat x_0 = \frac{x_t - \sqrt{1-\bar\alpha_t}\,\epsilon_\theta(x_t, t)}{\sqrt{\bar\alpha_t}},\qquad
x_{t-1} = \sqrt{\bar\alpha_{t-1}}\,\hat x_0 + \sqrt{1-\bar\alpha_{t-1}-\sigma_t^2}\;\epsilon_\theta(x_t, t) + \sigma_t z .
$$

当 $\sigma_t = 0$ 时，采样器是确定性的（即概率流 ODE 的一种离散化），可以在时间步的子序列上运行（例如 1000 步中取 50 步），并把每个噪声向量映射到唯一的样本，从而支持反演（inversion）和插值。当 $\sigma_t = \eta\sqrt{\tilde\beta_t}$ 且 $\eta = 1$ 时，它退化为 DDPM。

## 6. 潜在扩散

在 $256 \times 256 \times 3$ 的像素上运行扩散模型代价很高，视频就更不用说了，而且图像中的大部分比特都是人眼无法感知的细节。**潜在扩散**（latent diffusion；Rombach et al., CVPR 2022；Stable Diffusion 的基础）先训练一次自编码器（$\mathcal{E}, \mathcal{D}$，带 KL 或 VQ 正则化，以及感知损失 + GAN 损失），然后在 $z = \mathcal{E}(x)$ 上运行扩散：

$$
\mathcal{L}_{\mathrm{LDM}} = \mathbb{E}_{\mathcal{E}(x),\,c,\,\epsilon,\,t}\Big[\big\lVert \epsilon - \epsilon_\theta(z_t, t, \tau_\theta(c))\big\rVert^2\Big],
$$

其中 $\tau_\theta(c)$ 对条件进行编码（例如文本，通过交叉注意力输入）。几乎每一个视频世界模型都是这个意义上的潜在模型：Sora 的“时空 patch”就是压缩后视频潜变量上的 patch，而 GameNGen 是在 Stable Diffusion v1.4 上微调得到的。

## 7. 无分类器引导

条件扩散模型常常会忽略较弱的条件。**无分类器引导**（classifier-free guidance；Ho & Salimans, NeurIPS 2021 workshop）用同一个网络同时进行条件和无条件训练（以约 10-20% 的概率把 $c$ 丢弃为空 token $\varnothing$），并在采样时进行外推：

$$
\tilde\epsilon_\theta(x_t, c) = \epsilon_\theta(x_t, \varnothing) + w\,\big(\epsilon_\theta(x_t, c) - \epsilon_\theta(x_t, \varnothing)\big).
$$

（$w = 1$ 就是普通的条件采样；原论文把同一个式子写成 $(1+w^\prime)\,\epsilon(c) - w^\prime\,\epsilon(\varnothing)$，其中 $w^\prime = w - 1$。）从分数的角度看，由于 $\nabla \ln p(c \mid x) = \nabla \ln p(x \mid c) - \nabla \ln p(x)$，引导实际上是从一个被锐化的分布中采样：

$$
\nabla_x \ln \tilde p(x \mid c) = \nabla_x \ln p(x) + w\, \nabla_x \ln p(c \mid x) \;\propto\; \text{score of } p(x)\, p(c \mid x)^{w}.
$$

$w$ 越大，样本与条件越吻合，但多样性越低。在以动作为条件的世界模型中，同样的技巧被用在**动作**（或过去的帧）上：GameNGen 等模型利用引导让模型更忠实地响应玩家的输入。

## 8. 流匹配与整流流

扩散模型的 ODE 视角启发了一个更简单的方案：直接学习一个把噪声输运到数据的速度场。**流匹配**（flow matching；Lipman et al., ICLR 2023）和**整流流**（rectified flow；Liu, Gong, Liu, ICLR 2023）使用噪声样本 $x_0 \sim \mathcal{N}(0, I)$ 与数据样本 $x_1$ 之间的直线插值：

$$
x_t = (1-t)\,x_0 + t\,x_1,\qquad \frac{dx_t}{dt} = x_1 - x_0,\qquad t \in [0, 1].
$$

**条件流匹配**（conditional flow matching）损失让网络回归这个逐样本对的速度：

$$
\mathcal{L}_{\mathrm{CFM}}(\theta) = \mathbb{E}_{t,\,x_0,\,x_1}\Big[\big\lVert v_\theta(x_t, t) - (x_1 - x_0)\big\rVert^2\Big].
$$

虽然每个目标都只是某一个特定样本对的速度，但最优解是条件期望 $v^\ast(x, t) = \mathbb{E}[x_1 - x_0 \mid x_t = x]$，而这恰好就是**边缘**速度场，其 ODE $dx/dt = v^\ast(x, t)$ 把 $\mathcal{N}(0, I)$ 输运到 $p_{\mathrm{data}}$；条件目标与边缘目标的梯度是一致的。采样就是普通的 ODE 积分（Euler 或 Heun 方法），从 $t = 0$ 积分到 $1$。

注意事项：

- 约定各不相同：整流流和 Stable Diffusion 3 把数据放在 $t = 0$、噪声放在 $t = 1$。照搬公式之前，请先阅读每篇论文的定义。
- 高斯扩散是一个插值路径为曲线的特例（用 $\sqrt{\bar\alpha_t}$ 和 $\sqrt{1-\bar\alpha_t}$ 代替 $t$ 和 $1-t$）；给定 $x_t$ 时，流模型的速度和扩散模型的 $\epsilon$ 可以通过线性变换相互转换。
- 整流流的 **reflow** 过程会在（噪声，生成样本）对上重新训练，使轨迹进一步变直，从而支持极少步数的采样。
- Esser et al., "Scaling Rectified Flow Transformers for High-Resolution Image Synthesis"（ICML 2024）表明，采用 Transformer 骨干的整流流具有良好的扩展性；许多近期的视频模型都使用流匹配进行训练。

## 9. 扩散 Transformer（DiT）

去噪器最初是一个 U-Net。**DiT**（Diffusion Transformer；Peebles & Xie, ICCV 2023）用一个作用于潜在 patch 的普通 Vision Transformer 取代了它：潜变量被切成 $p \times p$ 的 patch，经过线性嵌入，由 Transformer 块处理，再还原为 patch 网格的原始形状以预测噪声（以及方差）。时间步和类别条件通过**自适应层归一化**（adaptive layer norm）注入：一个小型 MLP 把条件映射为每个块的缩放和平移参数，在 **adaLN-Zero** 变体中还会映射出一个初始化为零的门控，使每个块在初始时都是恒等映射。论文表明，随着模型变深/变宽或 patch 尺寸变小，样本质量随计算量（Gflops）稳步提升；DiT-XL/2 在类别条件的 ImageNet 256x256 上达到了 2.27 的 FID。

这对世界模型为什么重要：Transformer 把视频看作只是一个更长的 patch 序列。Sora 的技术报告描述的正是这一点：一个作用于压缩视频潜变量之上**时空 patch**（spacetime patches）的扩散 Transformer，在时长、分辨率和宽高比各不相同的视频上训练。以动作或过去的帧为条件，就变成了“更多的 token”或“更多的 adaLN 输入”。

## 10. 代码：用 PyTorch 实现最小的 DDPM（以及流匹配）

下面的脚本在由八个高斯组成的二维混合分布上训练一个预测噪声的 MLP，并同时用 DDPM 祖先采样（1000 步）和 DDIM（50 步）进行采样。在笔记本电脑的 CPU 上大约一分钟就能跑完。二维玩具问题是调试扩散模型实现的最佳方式：你可以立刻看出样本是否落在了各个模态上。

```python
import math
import torch
import torch.nn as nn

torch.manual_seed(0)

def sample_data(n):
    """Mixture of 8 Gaussians on a circle of radius 2."""
    k = torch.randint(0, 8, (n,))
    ang = k.float() * (2 * math.pi / 8)
    centers = 2.0 * torch.stack([torch.cos(ang), torch.sin(ang)], dim=1)
    return centers + 0.1 * torch.randn(n, 2)

# ---- noise schedule (DDPM linear schedule) ----
T = 1000
betas = torch.linspace(1e-4, 0.02, T)
alphas = 1.0 - betas
alpha_bar = torch.cumprod(alphas, dim=0)

def time_embedding(t, dim=32):
    """Sinusoidal embedding of integer timesteps t in [0, T)."""
    half = dim // 2
    freqs = torch.exp(-math.log(10000.0) * torch.arange(half) / half)
    args = t.float()[:, None] * freqs[None]
    return torch.cat([torch.sin(args), torch.cos(args)], dim=1)

class Denoiser(nn.Module):
    def __init__(self, hidden=256):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(2 + 32, hidden), nn.SiLU(),
            nn.Linear(hidden, hidden), nn.SiLU(),
            nn.Linear(hidden, hidden), nn.SiLU(),
            nn.Linear(hidden, 2))

    def forward(self, x, t):
        return self.net(torch.cat([x, time_embedding(t)], dim=1))

model = Denoiser()
opt = torch.optim.Adam(model.parameters(), lr=1e-3)

# ---- training: L_simple ----
for step in range(4000):
    x0 = sample_data(512)
    t = torch.randint(0, T, (512,))
    eps = torch.randn_like(x0)
    ab = alpha_bar[t][:, None]
    xt = ab.sqrt() * x0 + (1 - ab).sqrt() * eps
    loss = ((model(xt, t) - eps) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 1000 == 0:
        print(f"step {step:4d}  loss {loss.item():.4f}")

@torch.no_grad()
def ddpm_sample(n):
    x = torch.randn(n, 2)
    for t in reversed(range(T)):
        tt = torch.full((n,), t)
        eps = model(x, tt)
        mean = (x - betas[t] / (1 - alpha_bar[t]).sqrt() * eps) / alphas[t].sqrt()
        x = mean + (betas[t].sqrt() * torch.randn_like(x) if t > 0 else 0)
    return x

@torch.no_grad()
def ddim_sample(n, steps=50, eta=0.0):
    ts = torch.linspace(T - 1, 0, steps).long()
    x = torch.randn(n, 2)
    for i, t in enumerate(ts):
        ab = alpha_bar[t]
        ab_prev = alpha_bar[ts[i + 1]] if i + 1 < steps else torch.tensor(1.0)
        eps = model(x, torch.full((n,), int(t)))
        x0_hat = (x - (1 - ab).sqrt() * eps) / ab.sqrt()
        sigma = eta * ((1 - ab_prev) / (1 - ab) * (1 - ab / ab_prev)).sqrt()
        x = ab_prev.sqrt() * x0_hat + (1 - ab_prev - sigma ** 2).sqrt() * eps + sigma * torch.randn_like(x)
    return x

def mode_coverage(x):
    """Fraction of samples within 0.5 of a mode, and how many of the 8 modes are hit."""
    ang = torch.arange(8).float() * (2 * math.pi / 8)
    centers = 2.0 * torch.stack([torch.cos(ang), torch.sin(ang)], dim=1)
    d = torch.cdist(x, centers)
    near = d.min(dim=1).values < 0.5
    return near.float().mean().item(), d.argmin(dim=1)[near].unique().numel()

for name, xs in [("DDPM 1000 steps", ddpm_sample(2000)), ("DDIM 50 steps", ddim_sample(2000))]:
    frac, modes = mode_coverage(xs)
    print(f"{name}: {100 * frac:.1f}% of samples near a mode, {modes}/8 modes covered")
```

换成**流匹配**只需要改变训练目标和采样器。复用 `Denoiser`（它的时间输入现在是 $t \in [0, 1]$ 乘以 1000，这样同样的正弦嵌入依然适用）：

```python
fm = Denoiser()
opt = torch.optim.Adam(fm.parameters(), lr=1e-3)
for step in range(4000):
    x1 = sample_data(512)                       # data at t = 1
    x0 = torch.randn_like(x1)                   # noise at t = 0
    t = torch.rand(512)
    xt = (1 - t)[:, None] * x0 + t[:, None] * x1
    loss = ((fm(xt, t * 1000) - (x1 - x0)) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()

@torch.no_grad()
def fm_sample(n, steps=50):
    x = torch.randn(n, 2)
    for i in range(steps):                      # explicit Euler from t = 0 to 1
        t = torch.full((n,), i / steps)
        x = x + fm(x, t * 1000) / steps
    return x

frac, modes = mode_coverage(fm_sample(2000))
print(f"Flow matching 50 Euler steps: {100 * frac:.1f}% near a mode, {modes}/8 modes covered")
```

（`time_embedding` 也接受浮点时间，因为它只调用了 `.float()`。）可以尝试的事情：分别画出 DDIM 和流匹配中若干样本的轨迹，比较它们有多直；加入类别标签和无分类器引导；把 MLP 换成一个作用于两个“token”的小型 Transformer。

## 11. 这些构件如何对应到世界模型

| 系统 | 压缩器 | 动力学 / 生成器 | 条件 |
| --- | --- | --- | --- |
| World Models (2018) | VAE | MDN-RNN | 动作 |
| DreamerV3 | （RSSM 编码器） | 带类别型潜变量的 RSSM | 动作 |
| IRIS (2023) | 离散自编码器 | 自回归 Transformer | 动作 token |
| GAIA-1 (2023) | 图像 tokenizer | 自回归 Transformer + 视频扩散解码器 | 视频、文本、动作 |
| Genie (2024) | 时空 VQ tokenizer | MaskGIT 式动力学 Transformer | 学习得到的潜在动作 |
| GameNGen (2024) | Stable Diffusion 自编码器 | 潜在扩散（微调的 SD v1.4） | 过去的帧 + 动作 |
| Sora (2024) | 视频压缩网络 | 作用于时空 patch 的扩散 Transformer | 文本、图像、视频 |
| Cosmos (2025) | Cosmos tokenizer | 扩散式与自回归式世界基础模型 | 文本、视频、（后训练加入的）动作 |

第 3 篇将深入这些视频世界模拟器的内部。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 为什么重要 |
| --- | --- | --- | --- | --- |
| Auto-Encoding Variational Bayes (Kingma, Welling) | ICLR | 2014 | [arXiv:1312.6114](https://arxiv.org/abs/1312.6114) | VAE、ELBO、重参数化 |
| Neural Discrete Representation Learning (VQ-VAE, van den Oord et al.) | NeurIPS | 2017 | [arXiv:1711.00937](https://arxiv.org/abs/1711.00937) | 离散潜变量 / 视觉 token |
| Taming Transformers for High-Resolution Image Synthesis (VQGAN, Esser et al.) | CVPR | 2021 | [arXiv:2012.09841](https://arxiv.org/abs/2012.09841) | 感知 + GAN tokenizer，Transformer 先验 |
| MaskGIT: Masked Generative Image Transformer (Chang et al.) | CVPR | 2022 | [arXiv:2202.04200](https://arxiv.org/abs/2202.04200) | 并行 token 解码 |
| Deep Unsupervised Learning using Nonequilibrium Thermodynamics (Sohl-Dickstein et al.) | ICML | 2015 | [arXiv:1503.03585](https://arxiv.org/abs/1503.03585) | 扩散模型的起源 |
| Generative Modeling by Estimating Gradients of the Data Distribution (NCSN, Song, Ermon) | NeurIPS | 2019 | [arXiv:1907.05600](https://arxiv.org/abs/1907.05600) | 基于分数的生成建模 |
| Denoising Diffusion Probabilistic Models (Ho, Jain, Abbeel) | NeurIPS | 2020 | [arXiv:2006.11239](https://arxiv.org/abs/2006.11239) | 简单的噪声预测损失 |
| Score-Based Generative Modeling through Stochastic Differential Equations (Song et al.) | ICLR | 2021 | [arXiv:2011.13456](https://arxiv.org/abs/2011.13456) | SDE / 概率流 ODE 的统一 |
| Denoising Diffusion Implicit Models (DDIM, Song, Meng, Ermon) | ICLR | 2021 | [arXiv:2010.02502](https://arxiv.org/abs/2010.02502) | 快速确定性采样 |
| High-Resolution Image Synthesis with Latent Diffusion Models (Rombach et al.) | CVPR | 2022 | [arXiv:2112.10752](https://arxiv.org/abs/2112.10752) | 在学习得到的潜在空间中做扩散 |
| Classifier-Free Diffusion Guidance (Ho, Salimans) | NeurIPS Workshop | 2021 | [arXiv:2207.12598](https://arxiv.org/abs/2207.12598) | 无需分类器的引导 |
| Elucidating the Design Space of Diffusion-Based Generative Models (EDM, Karras et al.) | NeurIPS | 2022 | [arXiv:2206.00364](https://arxiv.org/abs/2206.00364) | 对噪声水平、预条件和采样器的清晰参数化 |
| Flow Matching for Generative Modeling (Lipman et al.) | ICLR | 2023 | [arXiv:2210.02747](https://arxiv.org/abs/2210.02747) | 无需模拟的连续流训练 |
| Flow Straight and Fast: Rectified Flow (Liu, Gong, Liu) | ICLR | 2023 | [arXiv:2209.03003](https://arxiv.org/abs/2209.03003) | 直线路径、reflow |
| Scalable Diffusion Models with Transformers (DiT, Peebles, Xie) | ICCV | 2023 | [arXiv:2212.09748](https://arxiv.org/abs/2212.09748) | Transformer 去噪器、adaLN-Zero、扩展性 |
| Scaling Rectified Flow Transformers for High-Resolution Image Synthesis (Esser et al.) | ICML | 2024 | [arXiv:2403.03206](https://arxiv.org/abs/2403.03206) | 大规模的整流流 + Transformer（SD3） |
| Language Model Beats Diffusion: Tokenizer is Key to Visual Generation (MAGVIT-v2, Yu et al.) | ICLR | 2024 | [arXiv:2310.05737](https://arxiv.org/abs/2310.05737) | 无查找量化的视频 tokenizer |

## 学习资源

- Lilian Weng，["What are Diffusion Models?"](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/)（2021，之后有更新）：对 DDPM、score 视角、DDIM 和引导最清晰的一站式推导。
- S. Prince，*Understanding Deep Learning*（MIT Press, 2023），其中关于 VAE、归一化流（normalizing flows）和扩散模型的章节：免费 PDF 见 [udlbook.github.io/udlbook](https://udlbook.github.io/udlbook/)。
- 斯坦福 [CS236: Deep Generative Models](https://deepgenerativemodels.github.io/)（课程讲义与讲座）。
- Hugging Face 的 [diffusers](https://github.com/huggingface/diffusers)，提供生产级的调度器和流水线；以及 Meta 的 [flow_matching](https://github.com/facebookresearch/flow_matching) 库。

## 练习

1. 利用独立高斯变量之和仍为高斯这一事实，用归纳法证明 $q(x_t \mid x_0) = \mathcal{N}(\sqrt{\bar\alpha_t}x_0, (1-\bar\alpha_t)I)$。
2. 从贝叶斯公式 $q(x_{t-1} \mid x_t, x_0) \propto q(x_t \mid x_{t-1})\, q(x_{t-1} \mid x_0)$ 出发，通过配方推导 $\tilde\mu_t$ 和 $\tilde\beta_t$。
3. 在 DDPM 脚本中，比较步数为 10、50、200 以及 $\eta \in \lbrace 0, 1 \rbrace$ 时的 DDIM。减少步数时，哪一种先退化？
4. 加入类别标签（模态的索引），并以 15% 的标签丢弃率进行训练。实现无分类器引导，并画出 $w \in \lbrace 1, 3, 7 \rbrace$ 时的样本。每个模态的分散程度会发生什么变化？
5. 证明对于线性路径 $x_t = (1-t)x_0 + t x_1$，速度预测器 $v_\theta$ 与噪声预测器之间满足 $\hat\epsilon = x_t - t\,v_\theta(x_t, t)$。

**下一篇：**[第 3 篇]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})将利用这些工具构建视频世界模拟器：Sora、Genie 1-3、GameNGen、UniSim、GAIA-1 与 Cosmos。
