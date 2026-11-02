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

下图展示了随机性被放到了哪里，以及梯度走的是哪条路径。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-reparam.svg" localized="true" width="85%" caption="重参数化：编码器输出 $\mu$ 和 $\sigma$，噪声 $\epsilon$ 作为外部输入进入（虚线），$z = \mu + \sigma \odot \epsilon$ 是这三者的确定性函数。因此重建损失可以对编码器求导（红色箭头）。" %}

### 2.3 VAE 擅长什么、不擅长什么

使用高斯解码器时，$-\ln p_\theta(x \mid z)$ 就是 L2 损失，它会对不确定性取平均，从而生成**模糊**的样本。用 $\beta$ 加权 KL 项（$\beta$-VAE）可以在重建质量和更规整的潜在空间之间做权衡；过强的解码器则可能完全忽略 $z$（**后验坍缩**，posterior collapse）。在现代系统中，VAE 本身很少充当生成器，而是作为一个**感知压缩器**（perceptual compressor）：一个 KL 权重很小、并加上感知损失和对抗损失的卷积自编码器，把一张 $256 \times 256 \times 3$ 的图像映射为比如 $32 \times 32 \times 4$ 的潜变量，然后由扩散模型在其上工作（第 6 节）。

为了在一个能画出来的潜空间中看到 KL 与重建之间的权衡，我们在玩具数据上训练了两个二维潜变量的小 VAE：每张 16 像素的“图像”里有一个高斯凸起（位置 $c$ 和宽度随机），一个用 $\beta = 1$，一个用 $\beta = 0.05$。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-vae-latent.svg" caption="70 个测试输入的编码器后验 $q_\phi(z\mid x)$：圆点是均值，椭圆是一个标准差，颜色表示真实的凸起位置；虚线圆和点线圆是先验 $\mathcal{N}(0, I)$ 的 1 倍和 2 倍标准差等高线。$\beta = 1$ 时后验较宽且留在先验之内（KL 为 4.4 nats）。$\beta = 0.05$ 时后验缩成一个点（KL 为 8.2 nats）：重建更好，但模型几乎退化成确定性的自编码器。两种情况下，位置都沿潜空间平滑变化。" %}

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

在二维中，可以直接把量化这一步画出来：每个码本向量都拥有一个 Voronoi 单元。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-vq-voronoi.svg" width="75%" caption="由 $K = 12$ 个向量组成的码本（星号），用 VQ 损失中的码本项在二维编码器输出（灰点：一个圆环加中心的一团）上训练得到。彩色区域是 argmin 的 Voronoi 单元：落在某个单元中的每个 $z_e$ 都会被替换成该单元的码（橙色箭头）。解码器只会看到这 12 个星号，也就是每个位置 12 种 token 之一。" %}

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

下图给出了这样一个交错序列（三个各含 4 个 token 的帧和两个动作）的因果掩码。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-ar-mask.svg" width="70%" caption="因果注意力掩码：第 $i$ 行只能关注列 $j \le i$（按 token 类型着色，灰色表示被遮挡）。高亮的一行是 $a_2$ 所在的位置，它的输出根据前两帧和两个动作来预测第 3 帧的第一个 token。在教师强制下，全部 14 行在一次并行前向中算完。" %}

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

下图把这个闭式公式用在第 10 节的二维玩具数据（8 个高斯的混合）上，调度与那里相同（线性）。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-forward.svg" width="85%" caption="1500 个样本上的前向过程 $x_t = \sqrt{\bar\alpha_t}\,x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon$（颜色表示混合成分；$t$ 是第 10 节代码中从 0 开始的步数）。各簇先变模糊，然后向原点收缩并合并；到 $t = 400$（$\bar\alpha_t = 0.19$）时各成分已经重叠，$t = 999$ 时整团点与 $\mathcal{N}(0, I)$ 已无法区分。" %}

{% include blog_figure.liquid path="assets/img/blog/world-models/02-schedule.svg" width="85%" caption="线性调度 $\beta_t \in [10^{-4}, 0.02]$、$T = 1000$ 时闭式公式的两个系数。信号权重与噪声权重在 $t \approx 259$ 处相交，此时信噪比 $\bar\alpha_t / (1-\bar\alpha_t)$ 为 1；最后 $\bar\alpha_T \approx 4 \times 10^{-5}$。竖线标出了上一张图中快照所在的时刻。" %}

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

用完全按第 10 节训练的网络运行反向链，过程如下：

{% include blog_figure.liquid path="assets/img/blog/world-models/02-reverse.svg" width="85%" caption="用第 10 节的噪声预测 MLP（训练 4000 步）进行祖先 DDPM 采样（1000 步）；图中是 1500 个样本的快照，十字标出真实的模式。前几百步几乎看不到变化，圆环在 $t \approx 150$ 左右形成，各模式直到最后 50 步才分开。在 $t = 0$ 时，98.5% 的样本落在某个模式 0.5 范围内，8 个模式全部被覆盖。" %}

等价的**参数化方式**（parameterization）也很常见：直接预测 $x_0$，或者预测“速度” $v = \sqrt{\bar\alpha_t}\,\epsilon - \sqrt{1-\bar\alpha_t}\,x_0$（许多视频模型采用后者，因为它在调度的两端都表现良好）。

### 5.3 score 视角与 SDE

为什么预测噪声是有效的？**Tweedie 公式**（Tweedie's formula）表明，对于 $x_t = \sqrt{\bar\alpha_t} x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon$，噪声的后验均值与加噪边缘分布的**分数**（score）直接相关：

$$
\nabla_{x_t} \ln p_t(x_t) = -\frac{\mathbb{E}[\epsilon \mid x_t]}{\sqrt{1-\bar\alpha_t}}
\qquad\Rightarrow\qquad
s_\theta(x_t, t) := -\frac{\epsilon_\theta(x_t, t)}{\sqrt{1-\bar\alpha_t}} \approx \nabla_{x_t} \ln p_t(x_t).
$$

噪声预测损失（在加权意义下）就是**去噪分数匹配**（denoising score matching；Vincent, 2011），去噪器估计的是在每个噪声水平上指向数据的梯度场（Song & Ermon 的 NCSN，NeurIPS 2019）。

对于二维玩具数据，每个加噪边缘分布的真实分数都有闭式解，因此可以拿它来检验训练好的去噪器。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-score-field.svg" width="85%" caption="箭头表示训练好的网络给出的 $-\epsilon_\theta(x_t, t)$ 的方向（上），以及精确的 $-\mathbb{E}[\epsilon \mid x_t] = \sqrt{1-\bar\alpha_t}\,\nabla \ln p_t$ 的方向（下）；灰点是 $x_t$ 的样本。$t$ 较小时，向量场指向最近的模式；$t$ 较大时，加噪后的边缘分布只是一团，向量场指向它的中心。在 $t = 30$、200、600 时，学到的方向与精确方向的平均余弦相似度分别为 0.94、0.97、0.99。" %}

Song 等人（ICLR 2021）在连续时间下统一了这两种视角。前向**随机微分方程**（stochastic differential equation, SDE）$dx = f(x, t)\,dt + g(t)\,dw$ 把数据扩散为噪声；DDPM 是**方差保持**（variance-preserving）SDE $dx = -\tfrac{1}{2}\beta(t)\,x\,dt + \sqrt{\beta(t)}\,dw$ 的离散化。根据 Anderson 定理，该过程可以按照**反向 SDE**（reverse SDE）在时间上倒着运行：

$$
dx = \big[f(x, t) - g(t)^2\, \nabla_x \ln p_t(x)\big]\,dt + g(t)\,d\bar w,
$$

此外还存在一个具有相同边缘分布 $p_t$ 的确定性**概率流 ODE**（probability-flow ODE）：

$$
\frac{dx}{dt} = f(x, t) - \frac{1}{2}\, g(t)^2\, \nabla_x \ln p_t(x).
$$

把分数替换为 $s_\theta$，就可以用任意 SDE 或 ODE 求解器来采样。ODE 视角解释了为什么存在步数少得多的采样器，能够给出精确似然，并把扩散模型与流匹配联系起来（第 8 节）。

{% include widget.liquid name="world-models-diffusion-explorer" height="560" caption="动手试试：拖动滑块改变 $t$。前向模式下，样本用固定的 $\epsilon$ 加噪；反向模式下，500 个噪声样本用确定性 DDIM（100 步）去噪，并按最终落入的模式着色。箭头表示当前 $t$ 下精确分数的方向。拖动黑色探针：黑色箭头是 $-\mathbb{E}[\epsilon \mid x_t]$（缩放 0.5 倍），橙色曲线是从探针到 $t = 0$ 的概率流路径。" %}

### 5.4 DDIM：快速确定性采样

**DDIM**（Song, Meng, Ermon, ICLR 2021）注意到训练损失只依赖于边缘分布 $q(x_t \mid x_0)$，因此可以使用任何具有相同边缘分布的非马尔可夫过程。它的更新先预测干净样本，再把它重新加噪到 $t-1$ 的噪声水平：

$$
\hat x_0 = \frac{x_t - \sqrt{1-\bar\alpha_t}\,\epsilon_\theta(x_t, t)}{\sqrt{\bar\alpha_t}},\qquad
x_{t-1} = \sqrt{\bar\alpha_{t-1}}\,\hat x_0 + \sqrt{1-\bar\alpha_{t-1}-\sigma_t^2}\;\epsilon_\theta(x_t, t) + \sigma_t z .
$$

当 $\sigma_t = 0$ 时，采样器是确定性的（即概率流 ODE 的一种离散化），可以在时间步的子序列上运行（例如 1000 步中取 50 步），并把每个噪声向量映射到唯一的样本，从而支持反演（inversion）和插值。当 $\sigma_t = \eta\sqrt{\tilde\beta_t}$ 且 $\eta = 1$ 时，它退化为 DDPM。

下图让两种采样器从同样的四个噪声向量出发。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-ddim-vs-ddpm.svg" caption="用训练好的玩具模型，从噪声（圆点）到样本（方块）的轨迹。左：DDPM 祖先采样在 1000 步中的每一步都注入新的噪声，因此路径四处游走，最终落在毫不相干的模式上。右：$\eta = 0$ 的 DDIM 用 50 步沿一条平滑的确定性路径前进，因此每个噪声向量恰好对应一个样本；在 2000 个样本中，94.9% 落在某个模式 0.5 范围内，8 个模式全部覆盖。" %}

## 6. 潜在扩散

在 $256 \times 256 \times 3$ 的像素上运行扩散模型代价很高，视频就更不用说了，而且图像中的大部分比特都是人眼无法感知的细节。**潜在扩散**（latent diffusion；Rombach et al., CVPR 2022；Stable Diffusion 的基础）先训练一次自编码器（$\mathcal{E}, \mathcal{D}$，带 KL 或 VQ 正则化，以及感知损失 + GAN 损失），然后在 $z = \mathcal{E}(x)$ 上运行扩散：

$$
\mathcal{L}_{\mathrm{LDM}} = \mathbb{E}_{\mathcal{E}(x),\,c,\,\epsilon,\,t}\Big[\big\lVert \epsilon - \epsilon_\theta(z_t, t, \tau_\theta(c))\big\rVert^2\Big],
$$

其中 $\tau_\theta(c)$ 对条件进行编码（例如文本，通过交叉注意力输入）。几乎每一个视频世界模型都是这个意义上的潜在模型：Sora 的“时空 patch”就是压缩后视频潜变量上的 patch，而 GameNGen 是在 Stable Diffusion v1.4 上微调得到的。

下图概括了数据流。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-latent-diffusion.svg" localized="true" caption="潜在扩散：一个只训练一次、随后冻结的自编码器（$\mathcal{E}$、$\mathcal{D}$）把 $256 \times 256 \times 3$ 的图像映射为 $32 \times 32 \times 4$ 的潜变量（数值少了 48 倍）。所有扩散步骤都在潜变量上进行，条件通过 $\tau_\theta$ 注入；只有最终的潜变量才被解码回像素。" %}

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

对于 8 个高斯的玩具数据，条件分数（单个成分）和无条件分数（整个混合）都可以精确求出，因此下图展示的是不含任何网络误差时引导的效果。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-cfg.svg" caption="使用精确分数的无分类器引导（类别 = 混合成分；DDIM，200 步，每个子图使用同样的 600 个噪声向量）。上：类别 0（紫色，右侧）和类别 3（橙色，左上）的样本。下：放大类别 0；虚线圆是真实类别的两个标准差。$w = 1$ 精确地重现了该类别。$w = 3$ 和 $w = 7$ 让样本变得窄得多，同时还把它们推离其他类别，跑到真实数据之外（平均偏移 0.16 和 0.33）：引导是用多样性、最终还会用保真度去换取“更像这个类别”。" %}

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

下图对同样的噪声点与数据点配对，比较两种方法的逐对路径。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-flow-vs-diffusion.svg" caption="同样的 10 组（噪声, 数据）配对；黑点是噪声，方块是数据（注意两个标题中相反的命名约定）。左：从 $t = 999$ 到 $0$ 描出的高斯扩散插值是一段弧线，每 50 步一个点。右：流匹配插值是一条以恒定速度走过的直线段（点位于等间隔的时间步）。这些都是用作回归目标的条件路径；采样器实际积分的边缘 ODE 会在不同配对相互交叉的地方弯曲（试试下面的交互组件）。" %}

注意事项：

- 约定各不相同：整流流和 Stable Diffusion 3 把数据放在 $t = 0$、噪声放在 $t = 1$。照搬公式之前，请先阅读每篇论文的定义。
- 高斯扩散是一个插值路径为曲线的特例（用 $\sqrt{\bar\alpha_t}$ 和 $\sqrt{1-\bar\alpha_t}$ 代替 $t$ 和 $1-t$）；给定 $x_t$ 时，流模型的速度和扩散模型的 $\epsilon$ 可以通过线性变换相互转换。
- 整流流的 **reflow** 过程会在（噪声，生成样本）对上重新训练，使轨迹进一步变直，从而支持极少步数的采样。
- Esser et al., "Scaling Rectified Flow Transformers for High-Resolution Image Synthesis"（ICML 2024）表明，采用 Transformer 骨干的整流流具有良好的扩展性；许多近期的视频模型都使用流匹配进行训练。

实践中真正重要的是需要多少个求解步。下图用极少的均匀步数对玩具混合分布的精确边缘向量场进行积分。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-few-step.svg" width="85%" caption="在精确向量场上走 $N$ 个求解步后 1500 个样本的终点：扩散用 DDIM（$\eta = 0$，均匀时间步），流匹配用 Euler 法。只走一步时两者都落在数据均值上，这是单步能给出的最佳猜测。走 4 步时，流匹配已让 89% 的样本靠近某个模式，而 DDIM 只有 14%；走 16 步时两者接近（100% 与 98%）。具体数字取决于时间网格，但这个差距正是流模型在少步采样中受欢迎的原因。" %}

{% include widget.liquid name="world-models-flow-paths" height="560" caption="动手试试：拖动黑色的噪声样本。细曲线是扩散（橙色，DDIM）和流匹配（紫色，Euler）的精确 ODE 路径，点位于等间隔的时间步，可以看出速度；粗虚线是只用 $N$ 步（滑块）的同一求解器，方块是它们的终点。两条精确路径终止于同一个数据点：对高斯路径而言，两个 ODE 只相差空间和时间的重新缩放（$x_{\mathrm{fm}} = x_{\mathrm{vp}} / (\sqrt{\bar\alpha_t} + \sqrt{1-\bar\alpha_t})$）。不同的是沿路径的速度，而这决定了 $N$ 步求解器能离最近的模式多近。" %}

## 9. 扩散 Transformer（DiT）

去噪器最初是一个 U-Net。**DiT**（Diffusion Transformer；Peebles & Xie, ICCV 2023）用一个作用于潜在 patch 的普通 Vision Transformer 取代了它：潜变量被切成 $p \times p$ 的 patch，经过线性嵌入，由 Transformer 块处理，再还原为 patch 网格的原始形状以预测噪声（以及方差）。时间步和类别条件通过**自适应层归一化**（adaptive layer norm）注入：一个小型 MLP 把条件映射为每个块的缩放和平移参数，在 **adaLN-Zero** 变体中还会映射出一个初始化为零的门控，使每个块在初始时都是恒等映射。论文表明，随着模型变深/变宽或 patch 尺寸变小，样本质量随计算量（Gflops）稳步提升；DiT-XL/2 在类别条件的 ImageNet 256x256 上达到了 2.27 的 FID。

下图追踪了 DiT 中的一次去噪步骤。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-dit.svg" caption="DiT：带噪潜变量被切成 $p \times p$ 的图块（这里 $8 \times 8$ 的潜变量、$p = 2$ 得到 16 个 token），加上位置嵌入后由 $N$ 个 Transformer 块处理。时间步和类别通过 adaLN-Zero 注入：一个 MLP 为每个块生成缩放 $\gamma$、平移 $\beta$ 以及初始化为零的门控 $\alpha$。输出的 token 再拼回（unpatchify）成预测的噪声（以及方差）。$p$ 减半，token 数就变为四倍。" %}

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

第 3 篇将深入这些视频世界模拟器的内部。（*更新，2026 年 11 月：*下文的 2025–2026 年进展一节用因果少步视频扩散模型扩展了这张表。）

## 2025–2026 年进展（截至 2026 年 11 月）

本节补充 2025 年至 2026 年 11 月初与世界模型相关的生成建模进展。这里不是视频生成的综述，那一领域发展太快，无法在此覆盖。对世界模型来说，最大的变化是：**因果、少步的视频扩散成为交互式模拟器的标准骨干**。它的关键问题，也是最重要的新思想，在于*训练时模型看到什么作为上下文*。“预印本”指尚未在会议或期刊发表的 arXiv 论文。

### 因果视频扩散与训练-测试差距

交互式世界模型必须由帧 $\lt t$ 和动作生成第 $t$ 帧，再以*自己的*输出为条件生成第 $t+1$ 帧（第 3 篇第 4 节的分解）。用 $x_{\lt t}$ 表示真实帧，$\hat x_{\lt t}$ 表示生成的帧。标准的**教师强制**（teacher forcing，TF）在真实上下文上训练 $p_\theta(x_t \mid x_{\lt t})$，但在测试时模型收到的是 $\hat x_{\lt t}$。$\hat x$ 中的误差是它从未见过的输入，因此会不断累积。这是第 1 篇误差累积问题的“暴露偏差”（exposure bias）版本。下图比较了选择训练上下文的三种方式。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-update-forcing.svg" width="90%" caption="因果视频模型在训练时以什么为条件。TF（教师强制）：干净的真实过去 $x_{1:5}$，只有正在学习的帧被加噪。DF（Diffusion Forcing，第 3 篇）：每一帧获得独立的噪声水平 $\sigma$（灰度），因此模型学会处理不确定的上下文。SF（Self Forcing）：上下文是模型自己的自回归推演 $\hat x_{1:5}$（箭头，用 KV 缓存生成，与测试时完全相同），损失通过分布匹配（DMD）或对抗目标作用在整段生成的视频上。只有 SF 在部署时会看到的同样输入上训练。" %}

- **CausVid**（Yin et al., "From Slow Bidirectional to Fast Autoregressive Video Diffusion Models"，CVPR 2025，[arXiv:2412.07772](https://arxiv.org/abs/2412.07772)）把一个高质量的*双向*视频扩散教师蒸馏成只需少量去噪步的*因果*学生，生成借助 KV 缓存变为流式。蒸馏使用分布匹配蒸馏（distribution matching distillation，DMD）：训练学生使其输出分布与教师一致，而不是复制单个样本。
- **Self Forcing**（Huang et al.，NeurIPS 2025，[arXiv:2506.08009](https://arxiv.org/abs/2506.08009)）直接弥合训练-测试差距。训练时，模型像推理时一样，用 KV 缓存逐帧自回归地生成整段视频，再在自己的输出上施加整体的视频级损失（DMD、score identity 或 GAN）。只有当每帧只需少量去噪步时，在训练中展开推演才负担得起。结果可以在单块 GPU 上实时运行，并成为 Matrix-Game 2.0 等开放交互世界模型的默认配方（第 3 篇更新）。
- 后续工作修补了剩余的弱点。**Self-Forcing++**（Cui et al.，预印本，[arXiv:2510.02283](https://arxiv.org/abs/2510.02283)）在不需要长视频教师的情况下减少长推演中的漂移，视频长度可达 4 分 15 秒。**LongLive**（预印本，[arXiv:2509.22622](https://arxiv.org/abs/2509.22622)）支持在生成过程中切换提示。**Causal Forcing**（Zhu et al.，ICML 2026，[arXiv:2602.02214](https://arxiv.org/abs/2602.02214)）指出，从*双向*教师蒸馏会留下架构上的差距，因此在 DMD 之前用*自回归*教师初始化学生，并报告其在运动动态上明显优于 Self Forcing。**Causal Forcing++**（预印本，[arXiv:2605.15141](https://arxiv.org/abs/2605.15141)）和 **Causal-rCM**（Zheng et al.，预印本，[arXiv:2606.25473](https://arxiv.org/abs/2606.25473)）把每帧的采样步数推到 2 步；Causal-rCM 把教师强制的一致性蒸馏与 Self Forcing 式的 DMD 结合起来。
- 两个相关思想。**History-Guided Video Diffusion**（Song et al.，ICML 2025，[arXiv:2502.06764](https://arxiv.org/abs/2502.06764)）训练一个可接受可变长度历史的 Diffusion Forcing Transformer，并把无分类器引导（第 7 节）用在*历史*上：比较有无过去帧时的预测，以增强长程一致性。**MAGI-1**（Sand AI，预印本，[arXiv:2505.13211](https://arxiv.org/abs/2505.13211)）把逐块（chunk-by-chunk）的自回归视频扩散扩展为一个大型开放模型。

### 少步采样器：shortcut 模型与 MeanFlow

实时世界模型每帧只能负担一到四次网络计算。第 8 节介绍了 reflow，另有两种较新的思想直接训练少步采样器。

- **Shortcut 模型**（Frans et al., "One Step Diffusion via Shortcut Models"，[arXiv:2410.12557](https://arxiv.org/abs/2410.12557)，2024）除了噪声水平之外，还以期望的*步长* $d$ 为条件，并用自一致性目标训练网络：一步长度为 $2d$ 的跨步应等于两步连续的长度为 $d$ 的跨步。这样同一个模型就能用 1、2、4……步采样。Dreamer 4 的 *shortcut forcing*（第 1 篇更新）把它与 Diffusion Forcing 结合了起来。
- **MeanFlow**（Geng et al., "Mean Flows for One-step Generative Modeling"，预印本，[arXiv:2505.13447](https://arxiv.org/abs/2505.13447)）学习一个区间上的*平均*速度 $u(x_t, r, t) = \frac{1}{t - r}\int_r^t v(x_\tau, \tau)\, d\tau$，而不是流匹配的瞬时速度 $v$。这样一次计算就能从噪声跳到数据：$x_r = x_t - (t - r)\, u(x_t, r, t)$。（这里采用论文的约定：数据在 $t = 0$，噪声在 $t = 1$，与第 8 节相反。）可以与上面流路径小部件中弯曲的精确路径对照：大步长的 Euler 步之所以会冲过头，是因为它用的是瞬时速度。

### 开放骨干与 tokenizer

- **Wan**（Team Wan，预印本，[arXiv:2503.20314](https://arxiv.org/abs/2503.20314)，2025 年 3 月）是一个开放的大型视频扩散 Transformer 系列（流匹配、因果 3D VAE）。2025–2026 年的许多世界模型都以它为起点，包括第 3 篇更新中的若干模型以及基于 Wan2.1/2.2 构建的模型。
- **表示自编码器**（representation autoencoders；Zheng et al., "Diffusion Transformers with Representation Autoencoders"，技术报告，[arXiv:2510.11690](https://arxiv.org/abs/2510.11690)）用一个冻结的*预训练表示编码器*（如 DINOv2）加一个训练好的解码器，取代潜在扩散（第 6 节）中的 VAE，使扩散模型在语义特征空间中工作。这与 JEPA 和 DINO-world 所做的“在特征空间中预测”的选择相同（第 5 篇），只是现在用于生成。
- **Cosmos tokenizer**（第 11 节表格）仍是视频领域常用的开放选择；NVIDIA 后续的 Cosmos 版本见第 3 篇更新。

### 扩展第 11 节的表格

| 系统 | 压缩器 | 动力学 / 生成器 | 条件 |
| --- | --- | --- | --- |
| Self Forcing / CausVid 学生模型（2025） | 视频 VAE（Wan） | 带 KV 缓存的因果少步视频扩散 | 文本（微调后可加入动作） |
| Matrix-Game 2.0（2025） | 视频 VAE | 因果少步扩散（Self Forcing 式） | 键盘与鼠标 |
| Dreamer 4（2025） | 学到的视频 tokenizer | 使用 shortcut forcing 的 Transformer | 动作（少量标签） |
| Cosmos 3（2026） | 公告中未详述 | 混合 Transformer：推理 + 生成 | 文本、图像、视频、声音、动作 |

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
| One Step Diffusion via Shortcut Models (Frans et al.) | arXiv | 2024 | [arXiv:2410.12557](https://arxiv.org/abs/2410.12557) | 以步长为条件的少步采样 |
| From Slow Bidirectional to Fast Autoregressive Video Diffusion Models (CausVid, Yin et al.) | CVPR | 2025 | [arXiv:2412.07772](https://arxiv.org/abs/2412.07772) | 从双向教师到因果少步学生 |
| History-Guided Video Diffusion (Song et al.) | ICML | 2025 | [arXiv:2502.06764](https://arxiv.org/abs/2502.06764) | 对可变长度历史施加引导 |
| Wan: Open and Advanced Large-Scale Video Generative Models (Team Wan) | 预印本 | 2025 | [arXiv:2503.20314](https://arxiv.org/abs/2503.20314) | 许多世界模型的开放骨干 |
| MAGI-1: Autoregressive Video Generation at Scale (Sand AI) | 预印本 | 2025 | [arXiv:2505.13211](https://arxiv.org/abs/2505.13211) | 大规模逐块自回归扩散 |
| Mean Flows for One-step Generative Modeling (Geng et al.) | 预印本 | 2025 | [arXiv:2505.13447](https://arxiv.org/abs/2505.13447) | 用平均速度流实现单步采样 |
| Self Forcing: Bridging the Train-Test Gap in Autoregressive Video Diffusion (Huang et al.) | NeurIPS | 2025 | [arXiv:2506.08009](https://arxiv.org/abs/2506.08009) | 在自身推演上训练；实时因果视频 |
| Self-Forcing++: Towards Minute-Scale High-Quality Video Generation (Cui et al.) | 预印本 | 2025 | [arXiv:2510.02283](https://arxiv.org/abs/2510.02283) | 无需长视频教师的分钟级推演 |
| Diffusion Transformers with Representation Autoencoders (Zheng et al.) | 技术报告 | 2025 | [arXiv:2510.11690](https://arxiv.org/abs/2510.11690) | 在预训练特征空间中做扩散 |
| Causal Forcing (Zhu et al.) | ICML | 2026 | [arXiv:2602.02214](https://arxiv.org/abs/2602.02214) | 用自回归教师做因果蒸馏 |
| Causal-rCM (Zheng et al.) | 技术报告 | 2026 | [arXiv:2606.25473](https://arxiv.org/abs/2606.25473) | 教师强制一致性 + Self Forcing 式 DMD |

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
6. （2025–2026 年更新）一个因果视频模型每帧使用 $S$ 个去噪步，共生成 $F$ 帧。数一数展开一段 Self Forcing 训练视频需要多少次网络计算，并解释为什么 Self Forcing 在 $S = 4$ 时可行而在 $S = 50$ 时不可行。Diffusion Forcing 弥合了教师强制与测试时之间差距的哪一部分，又留下了哪一部分？

<details markdown="1"><summary>提示</summary>

展开需要 $F \cdot S$ 次计算（KV 缓存使每次的开销大致恒定），例如 $F = 20$、$S = 4$ 时为 80 次，而 $S = 50$ 时为 1,000 次。实践中，为了节省内存，梯度只保留在展开的一部分上。Diffusion Forcing 教会模型容忍*带噪声的*上下文，但这种噪声是高斯的，而测试时真实的上下文包含模型自身的结构化误差（模糊、漂移）。只有在自身推演上训练，才能让模型接触到这些误差。

</details>

**下一篇：**[第 3 篇]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})将利用这些工具构建视频世界模拟器：Sora、Genie 1-3、GameNGen、UniSim、GAIA-1 与 Cosmos。
