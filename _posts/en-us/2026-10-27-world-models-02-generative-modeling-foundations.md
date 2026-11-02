---
layout: post
title: "The generative toolkit: VAEs, tokenizers, Transformers, diffusion and flow matching"
date: 2026-10-27 15:02:00+0900
description: "The generative models modern world models are built from: VAE and ELBO, VQ-VAE tokenizers, autoregressive Transformers, DDPM, the score/SDE view, DDIM, latent diffusion, classifier-free guidance, flow matching and DiT, with runnable PyTorch."
categories: world-models
tags: [world-models, vae, vq-vae, diffusion, flow-matching, dit]
series: world-models
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## Why this matters

In [post 1]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}) world models were small networks trained per task: a VAE plus an RNN, or an RSSM. Today's video world simulators (Sora, Genie, GameNGen, Cosmos; [post 3]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})) and 3D world generators ([post 4]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})) are assembled from the same few generative building blocks: an **autoencoder or tokenizer** that compresses pixels, and a **sequence model** (autoregressive Transformer, diffusion or flow model, usually with a Transformer backbone) that models the compressed sequence. This post derives each block carefully enough that you can read the world-model papers without hand-waving and implement a diffusion model from scratch.

## Prerequisites

- Post 1 of this series (the RSSM is a sequential VAE).
- Probability: Gaussians, KL divergence, Bayes' rule, Jensen's inequality.
- PyTorch basics. The code runs on a CPU.

## 1. The problem and the landscape

We observe samples $x \sim p_{\mathrm{data}}(x)$ (images, video clips, token sequences) and want a model $p_\theta(x)$ that we can **sample** from, often **condition** on something $c$ (text, past frames, actions), and sometimes **evaluate**. Different families make different trade-offs:

| Family | Sampling | Likelihood | Typical role in world models |
| --- | --- | --- | --- |
| VAE | one decoder pass | lower bound (ELBO) | compress frames into latents (Ha & Schmidhuber's V, the autoencoder of latent diffusion) |
| VQ-VAE / tokenizer | (needs a prior over tokens) | - | turn frames into discrete tokens for Transformers (IRIS, GAIA-1, Genie) |
| Autoregressive Transformer | sequential, one token at a time | exact | next-token dynamics (GAIA-1, Genie) |
| Diffusion / score model | iterative denoising (tens of steps) | bound / ODE | frame and video generation (Sora, GameNGen, DIAMOND, Cosmos) |
| Flow matching / rectified flow | ODE integration (few to tens of steps) | via ODE | modern image/video backbones (Stable Diffusion 3, many video models) |

GANs are omitted here; they still appear as auxiliary losses (VQGAN) but are rarely the core of world models.

## 2. Variational autoencoders

### 2.1 The ELBO

A latent-variable model writes $p_\theta(x) = \int p_\theta(x \mid z)\, p(z)\, dz$ with a simple prior $p(z) = \mathcal{N}(0, I)$. The integral is intractable, so we introduce an encoder $q_\phi(z \mid x)$ and apply Jensen's inequality:

$$
\ln p_\theta(x) = \ln \mathbb{E}_{q_\phi(z\mid x)}\left[\frac{p_\theta(x\mid z)\,p(z)}{q_\phi(z\mid x)}\right]
\;\ge\; \underbrace{\mathbb{E}_{q_\phi(z\mid x)}\big[\ln p_\theta(x\mid z)\big] - \mathrm{KL}\big(q_\phi(z\mid x)\,\Vert\,p(z)\big)}_{\mathrm{ELBO}(x;\,\theta,\phi)}.
$$

The gap is exactly $\mathrm{KL}(q_\phi(z \mid x) \Vert p_\theta(z \mid x))$, so maximizing the ELBO both fits the data and makes the encoder approximate the true posterior. With a diagonal Gaussian encoder $q_\phi(z \mid x) = \mathcal{N}(\mu, \mathrm{diag}\,\sigma^2)$ the KL term is closed-form:

$$
\mathrm{KL}\big(\mathcal{N}(\mu, \mathrm{diag}\,\sigma^2)\,\Vert\,\mathcal{N}(0, I)\big) = \frac{1}{2}\sum_{j}\left(\mu_j^2 + \sigma_j^2 - 1 - \ln \sigma_j^2\right).
$$

### 2.2 The reparameterization trick

To backpropagate through the sampling of $z$, write $z = \mu_\phi(x) + \sigma_\phi(x) \odot \epsilon$ with $\epsilon \sim \mathcal{N}(0, I)$. The randomness now sits in an input, and gradients flow through $\mu$ and $\sigma$. The same trick is used for Dreamer's actions and stochastic states (post 1).

The figure shows where the randomness goes and which path the gradient takes.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-reparam.svg" localized="true" width="85%" caption="Reparameterization: the encoder outputs $\mu$ and $\sigma$, the noise $\epsilon$ enters from outside as an input (dashed), and $z = \mu + \sigma \odot \epsilon$ is a deterministic function of all three. The reconstruction loss can therefore be differentiated with respect to the encoder (red arrow)." %}

### 2.3 What VAEs are good and bad at

With a Gaussian decoder, $-\ln p_\theta(x \mid z)$ is an L2 loss, which averages over uncertainty and gives **blurry** samples. Weighting the KL by $\beta$ ($\beta$-VAE) trades reconstruction against a more regular latent space; a too-strong decoder can ignore $z$ (**posterior collapse**). In modern systems the VAE is rarely the generator itself; instead it is a **perceptual compressor**: a convolutional autoencoder with a small KL weight plus perceptual and adversarial losses, mapping a $256 \times 256 \times 3$ image to, say, a $32 \times 32 \times 4$ latent on which a diffusion model then works (Section 6).

To see the KL/reconstruction trade-off in a latent space we can draw, we trained two small VAEs with a 2D latent on toy 16-pixel "images" that each contain one Gaussian bump (random position $c$ and width), once with $\beta = 1$ and once with $\beta = 0.05$.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-vae-latent.svg" caption="Encoder posteriors $q_\phi(z\mid x)$ for 70 test inputs: dots are the means, ellipses one standard deviation, colour the true bump position; the dashed and dotted circles are the 1 and 2 standard deviation contours of the prior $\mathcal{N}(0, I)$. With $\beta = 1$ the posteriors stay wide and inside the prior (KL 4.4 nats). With $\beta = 0.05$ they shrink to points (KL 8.2 nats): reconstruction improves, but the model behaves almost like a deterministic autoencoder. In both cases position varies smoothly along the latent space." %}

## 3. VQ-VAE and visual tokenizers

**VQ-VAE** (van den Oord et al., NeurIPS 2017) makes the latent **discrete**. An encoder outputs a grid of vectors $z_e(x)$; each is replaced by its nearest entry in a learned codebook $\lbrace e_k \rbrace_{k=1}^{K}$:

$$
z_q(x) = e_{k^\ast}, \qquad k^\ast = \arg\min_k \lVert z_e(x) - e_k \rVert_2 .
$$

The argmin has no gradient, so the decoder's gradient is copied straight through to the encoder ($z_q = z_e + \mathrm{sg}(z_q - z_e)$ in code). The loss is

$$
\mathcal{L} = -\ln p(x \mid z_q(x)) + \lVert \mathrm{sg}[z_e(x)] - e \rVert_2^2 + \beta\, \lVert z_e(x) - \mathrm{sg}[e] \rVert_2^2 ,
$$

where the second term moves codebook vectors toward encoder outputs and the third (the **commitment loss**, $\beta = 0.25$ in the paper) keeps the encoder close to its chosen code. Many implementations replace the codebook term with an exponential moving average update.

In two dimensions the quantization step can be drawn directly: every codebook vector owns a Voronoi cell.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-vq-voronoi.svg" width="75%" caption="A codebook of $K = 12$ vectors (stars), trained with the codebook term of the VQ loss on 2D encoder outputs (grey; a ring plus a central blob). Coloured regions are the Voronoi cells of the argmin: every $z_e$ inside a cell is replaced by that cell's code (orange arrows). The decoder only ever sees the 12 stars, i.e. one of 12 tokens per position." %}

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

Discrete tokens turn images into "sentences" that a Transformer can model with cross-entropy. **VQGAN** (Esser et al., CVPR 2021) added perceptual and patch-GAN losses so that a small token grid still decodes to sharp images. For video, tokenizers compress space *and* time with causal 3D convolutions or Transformers. MAGVIT-v2 (Yu et al., ICLR 2024) replaced the codebook lookup by **lookup-free quantization** (each latent channel is quantized to $\pm 1$, so the "codebook" is implicit and can be very large), and NVIDIA's Cosmos tokenizers offer both continuous and discrete variants. GAIA-1 and Genie are built on such video tokenizers.

## 4. Autoregressive Transformers

Any distribution over a sequence of tokens factorizes by the chain rule:

$$
p_\theta(x_1, \dots, x_N) = \prod_{i=1}^{N} p_\theta(x_i \mid x_{\lt i}).
$$

A decoder-only Transformer with a **causal attention mask** computes all $N$ conditionals in parallel during training (**teacher forcing**), and the loss is the summed cross-entropy $-\sum_i \ln p_\theta(x_i \mid x_{\lt i})$. For a world model the sequence interleaves frame tokens and actions, for example `[frame_1 tokens][a_1][frame_2 tokens][a_2]...`, so that predicting the next frame's tokens is conditioned on the past frames and the action.

The figure shows the causal mask for such an interleaved sequence of three 4-token frames and two actions.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-ar-mask.svg" width="70%" caption="Causal attention mask: row $i$ may attend only to columns $j \le i$ (coloured by token type; grey is masked). The highlighted row is the position of $a_2$; its output predicts the first token of frame 3 from both previous frames and both actions. With teacher forcing all 14 rows are computed in one parallel pass." %}

Two practical issues:

- **Sampling cost**: generating a $16 \times 16$ token frame needs 256 sequential steps. **MaskGIT** (Chang et al., CVPR 2022) instead trains a *bidirectional* Transformer to predict randomly masked tokens and decodes a frame in about 8-16 parallel refinement steps by keeping the most confident predictions; Genie's dynamics model uses this style of decoding.
- **Exposure bias / drift**: during training the model always conditions on ground truth; at test time it conditions on its own samples, so errors compound over long rollouts. This is the sequence-model version of the compounding-error problem from post 1, and it is the central difficulty of every long-horizon video world model.

## 5. Diffusion models

### 5.1 The forward process

**Denoising diffusion probabilistic models** (DDPM; Ho, Jain, Abbeel, NeurIPS 2020, building on Sohl-Dickstein et al., ICML 2015) define a fixed Markov chain that gradually adds Gaussian noise with a variance schedule $\beta_1, \dots, \beta_T$:

$$
q(x_t \mid x_{t-1}) = \mathcal{N}\big(x_t;\ \sqrt{1-\beta_t}\, x_{t-1},\ \beta_t I\big).
$$

With $\alpha_t = 1 - \beta_t$ and $\bar\alpha_t = \prod_{s=1}^{t} \alpha_s$, the composition of Gaussians gives a closed form for jumping directly to any step:

$$
q(x_t \mid x_0) = \mathcal{N}\big(x_t;\ \sqrt{\bar\alpha_t}\, x_0,\ (1-\bar\alpha_t) I\big)
\quad\Longleftrightarrow\quad
x_t = \sqrt{\bar\alpha_t}\, x_0 + \sqrt{1-\bar\alpha_t}\, \epsilon,\ \ \epsilon \sim \mathcal{N}(0, I).
$$

For large $T$ and a suitable schedule, $\bar\alpha_T \approx 0$ and $x_T$ is essentially pure noise.

The figure applies this closed form to the 2D toy data used in Section 10 (a mixture of 8 Gaussians) with the same linear schedule.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-forward.svg" width="85%" caption="Forward process $x_t = \sqrt{\bar\alpha_t}\,x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon$ on 1500 samples (colour = mixture component; $t$ is the 0-based step of the code in Section 10). The clusters first blur, then shrink toward the origin and merge; by $t = 400$ ($\bar\alpha_t = 0.19$) the components overlap, and at $t = 999$ the cloud is indistinguishable from $\mathcal{N}(0, I)$." %}

{% include blog_figure.liquid path="assets/img/blog/world-models/02-schedule.svg" width="85%" caption="The two coefficients of the closed form for the linear schedule $\beta_t \in [10^{-4}, 0.02]$, $T = 1000$. Signal and noise weights cross at $t \approx 259$, where the signal-to-noise ratio $\bar\alpha_t / (1-\bar\alpha_t)$ is 1; at the end $\bar\alpha_T \approx 4 \times 10^{-5}$. Vertical lines mark the snapshots in the previous figure." %}

### 5.2 The reverse process and the loss

We learn a reverse chain $p_\theta(x_{t-1} \mid x_t) = \mathcal{N}(x_{t-1};\ \mu_\theta(x_t, t),\ \sigma_t^2 I)$ starting from $p(x_T) = \mathcal{N}(0, I)$. As for a VAE (the forward process plays the role of a fixed encoder), the negative ELBO decomposes into per-step KL terms:

$$
-\ln p_\theta(x_0) \le \mathbb{E}_q\Big[\underbrace{\mathrm{KL}(q(x_T\mid x_0)\,\Vert\,p(x_T))}_{\text{constant}} + \sum_{t=2}^{T} \mathrm{KL}\big(q(x_{t-1}\mid x_t, x_0)\,\Vert\,p_\theta(x_{t-1}\mid x_t)\big) - \ln p_\theta(x_0\mid x_1)\Big].
$$

The key fact is that the forward posterior **conditioned on $x_0$** is a tractable Gaussian (Bayes' rule on Gaussians):

$$
q(x_{t-1} \mid x_t, x_0) = \mathcal{N}\big(x_{t-1};\ \tilde\mu_t(x_t, x_0),\ \tilde\beta_t I\big),\quad
\tilde\mu_t = \frac{\sqrt{\bar\alpha_{t-1}}\,\beta_t}{1-\bar\alpha_t}\, x_0 + \frac{\sqrt{\alpha_t}\,(1-\bar\alpha_{t-1})}{1-\bar\alpha_t}\, x_t,\quad
\tilde\beta_t = \frac{1-\bar\alpha_{t-1}}{1-\bar\alpha_t}\,\beta_t .
$$

Substituting $x_0 = (x_t - \sqrt{1-\bar\alpha_t}\,\epsilon)/\sqrt{\bar\alpha_t}$ gives $\tilde\mu_t = \frac{1}{\sqrt{\alpha_t}}\big(x_t - \frac{\beta_t}{\sqrt{1-\bar\alpha_t}}\,\epsilon\big)$. So it is natural to let the network predict the noise, $\mu_\theta(x_t, t) = \frac{1}{\sqrt{\alpha_t}}\big(x_t - \frac{\beta_t}{\sqrt{1-\bar\alpha_t}}\,\epsilon_\theta(x_t, t)\big)$. The KL between two Gaussians with equal variance is a scaled squared distance between means, which becomes

$$
\mathrm{KL}_t = \frac{\beta_t^2}{2\sigma_t^2\, \alpha_t\, (1-\bar\alpha_t)}\, \big\lVert \epsilon - \epsilon_\theta(x_t, t)\big\rVert^2 + \text{const}.
$$

Ho et al. found that dropping the weight works better in practice, giving the famous **simple loss**:

$$
\mathcal{L}_{\mathrm{simple}}(\theta) = \mathbb{E}_{x_0,\ t \sim \mathcal{U}\lbrace 1..T\rbrace,\ \epsilon}\Big[\big\lVert \epsilon - \epsilon_\theta\big(\sqrt{\bar\alpha_t}\,x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon,\ t\big)\big\rVert^2\Big].
$$

Training is therefore just: pick an image, a random timestep and random noise, corrupt, and regress the noise. Ancestral sampling runs $x_{t-1} = \mu_\theta(x_t, t) + \sigma_t z$ from $t = T$ to $1$, with $\sigma_t^2 = \beta_t$ or $\tilde\beta_t$.

Running the reverse chain of a network trained exactly as in Section 10 looks like this:

{% include blog_figure.liquid path="assets/img/blog/world-models/02-reverse.svg" width="85%" caption="Ancestral DDPM sampling (1000 steps) with the noise-prediction MLP of Section 10 after 4000 training steps; snapshots of 1500 samples, crosses mark the true modes. Nothing visible happens for the first few hundred steps, the ring forms around $t \approx 150$, and the modes separate only in the last 50 steps. At $t = 0$, 98.5% of the samples lie within 0.5 of a mode and all 8 modes are covered." %}

Equivalent **parameterizations** are common: predicting $x_0$ directly, or the "velocity" $v = \sqrt{\bar\alpha_t}\,\epsilon - \sqrt{1-\bar\alpha_t}\,x_0$ (used by many video models because it behaves well at both ends of the schedule).

### 5.3 The score view and SDEs

Why does predicting noise work? **Tweedie's formula** says that for $x_t = \sqrt{\bar\alpha_t} x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon$, the posterior mean of the noise is tied to the **score** of the noisy marginal:

$$
\nabla_{x_t} \ln p_t(x_t) = -\frac{\mathbb{E}[\epsilon \mid x_t]}{\sqrt{1-\bar\alpha_t}}
\qquad\Rightarrow\qquad
s_\theta(x_t, t) := -\frac{\epsilon_\theta(x_t, t)}{\sqrt{1-\bar\alpha_t}} \approx \nabla_{x_t} \ln p_t(x_t).
$$

The noise-prediction loss is (up to weighting) **denoising score matching** (Vincent, 2011), and the denoiser estimates the gradient field that points toward data at every noise level (Song & Ermon's NCSN, NeurIPS 2019).

For the 2D toy the true score of every noisy marginal is known in closed form, so we can check the trained denoiser against it.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-score-field.svg" width="85%" caption="Arrows show the direction of $-\epsilon_\theta(x_t, t)$ from the trained network (top) and of the exact $-\mathbb{E}[\epsilon \mid x_t] = \sqrt{1-\bar\alpha_t}\,\nabla \ln p_t$ (bottom); grey dots are samples of $x_t$. At small $t$ the field points to the nearest mode; at large $t$ the noisy marginal is a single blob and the field points to its centre. The mean cosine similarity between learned and exact directions is 0.94, 0.97 and 0.99 for $t = 30, 200, 600$." %}

Song et al. (ICLR 2021) unified both views in continuous time. A forward **SDE** $dx = f(x, t)\,dt + g(t)\,dw$ diffuses data into noise; DDPM is the discretization of the **variance-preserving** SDE $dx = -\tfrac{1}{2}\beta(t)\,x\,dt + \sqrt{\beta(t)}\,dw$. By Anderson's theorem the process runs backward in time according to the **reverse SDE**

$$
dx = \big[f(x, t) - g(t)^2\, \nabla_x \ln p_t(x)\big]\,dt + g(t)\,d\bar w,
$$

and there is a deterministic **probability-flow ODE** with the same marginals $p_t$:

$$
\frac{dx}{dt} = f(x, t) - \frac{1}{2}\, g(t)^2\, \nabla_x \ln p_t(x).
$$

Replace the score by $s_\theta$ and you can sample with any SDE or ODE solver. The ODE view explains why samplers with far fewer steps exist, gives exact likelihoods, and connects diffusion to flow matching (Section 8).

{% include widget.liquid name="world-models-diffusion-explorer" height="560" caption="Try it: move the slider to change $t$. In forward mode the samples are noised with fixed $\epsilon$; in reverse mode 500 noise samples are denoised with deterministic DDIM (100 steps), coloured by the mode they end up in. Arrows show the direction of the exact score at the current $t$. Drag the black probe: the black arrow is $-\mathbb{E}[\epsilon \mid x_t]$ (scaled by 0.5) and the orange curve is the probability-flow path from the probe to $t = 0$." %}

### 5.4 DDIM: fast deterministic sampling

**DDIM** (Song, Meng, Ermon, ICLR 2021) observes that the training loss only depends on the marginals $q(x_t \mid x_0)$, so we may use any non-Markovian process with the same marginals. Its update first predicts the clean sample and then re-noises it to level $t-1$:

$$
\hat x_0 = \frac{x_t - \sqrt{1-\bar\alpha_t}\,\epsilon_\theta(x_t, t)}{\sqrt{\bar\alpha_t}},\qquad
x_{t-1} = \sqrt{\bar\alpha_{t-1}}\,\hat x_0 + \sqrt{1-\bar\alpha_{t-1}-\sigma_t^2}\;\epsilon_\theta(x_t, t) + \sigma_t z .
$$

With $\sigma_t = 0$ the sampler is deterministic (a discretization of the probability-flow ODE), works on a sub-sequence of timesteps (e.g. 50 of 1000), and maps each noise vector to a unique sample, which enables inversion and interpolation. With $\sigma_t = \eta\sqrt{\tilde\beta_t}$ and $\eta = 1$ it recovers DDPM.

The figure starts both samplers from the same four noise vectors.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-ddim-vs-ddpm.svg" caption="Trajectories from noise (circles) to samples (squares) with the trained toy model. Left: DDPM ancestral sampling injects fresh noise at every one of its 1000 steps, so paths wander and end at unrelated modes. Right: DDIM with $\eta = 0$ follows a smooth deterministic path in 50 steps, so each noise vector has exactly one sample; over 2000 samples, 94.9% land within 0.5 of a mode and all 8 modes are covered." %}

## 6. Latent diffusion

Running diffusion on $256 \times 256 \times 3$ pixels, let alone on video, is expensive, and most of the bits in an image are imperceptible detail. **Latent diffusion** (Rombach et al., CVPR 2022; the basis of Stable Diffusion) trains an autoencoder once ($\mathcal{E}, \mathcal{D}$ with KL or VQ regularization and perceptual + GAN losses) and runs diffusion on $z = \mathcal{E}(x)$:

$$
\mathcal{L}_{\mathrm{LDM}} = \mathbb{E}_{\mathcal{E}(x),\,c,\,\epsilon,\,t}\Big[\big\lVert \epsilon - \epsilon_\theta(z_t, t, \tau_\theta(c))\big\rVert^2\Big],
$$

where $\tau_\theta(c)$ encodes the conditioning (e.g. text, fed through cross-attention). Almost every video world model is a latent model in this sense: Sora's "spacetime patches" are patches of a compressed video latent, and GameNGen fine-tunes Stable Diffusion v1.4.

The figure summarizes the data flow.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-latent-diffusion.svg" localized="true" caption="Latent diffusion: a frozen autoencoder ($\mathcal{E}$, $\mathcal{D}$), trained once, maps a $256 \times 256 \times 3$ image to a $32 \times 32 \times 4$ latent (48 times fewer numbers). All diffusion steps run on the latent, with the condition injected through $\tau_\theta$; only the final latent is decoded back to pixels." %}

## 7. Classifier-free guidance

Conditional diffusion models often ignore weak conditioning. **Classifier-free guidance** (Ho & Salimans, NeurIPS 2021 workshop) trains one network both conditionally and unconditionally (drop $c$ to a null token $\varnothing$ with probability ~10-20%) and at sampling time extrapolates:

$$
\tilde\epsilon_\theta(x_t, c) = \epsilon_\theta(x_t, \varnothing) + w\,\big(\epsilon_\theta(x_t, c) - \epsilon_\theta(x_t, \varnothing)\big).
$$

($w = 1$ is plain conditional sampling; the original paper writes the same thing as $(1+w^\prime)\,\epsilon(c) - w^\prime\,\epsilon(\varnothing)$ with $w^\prime = w - 1$.) In score terms, since $\nabla \ln p(c \mid x) = \nabla \ln p(x \mid c) - \nabla \ln p(x)$, guidance samples from a sharpened distribution:

$$
\nabla_x \ln \tilde p(x \mid c) = \nabla_x \ln p(x) + w\, \nabla_x \ln p(c \mid x) \;\propto\; \text{score of } p(x)\, p(c \mid x)^{w}.
$$

Larger $w$ gives samples that match the condition better but are less diverse. In action-conditioned world models the same trick is applied to the **action** (or past frames): GameNGen and others use guidance to make the model follow the player's inputs more faithfully.

For the 8-Gaussian toy, both the conditional score (one component) and the unconditional score (the whole mixture) are known exactly, so the figure shows what guidance does without any network error.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-cfg.svg" caption="Classifier-free guidance with exact scores (class = mixture component; DDIM, 200 steps, the same 600 noise vectors in every panel). Top: samples for class 0 (purple, right) and class 3 (orange, upper left). Bottom: zoom on class 0; the dashed circle is two standard deviations of the true class. $w = 1$ reproduces the class exactly. $w = 3$ and $w = 7$ make the samples much narrower and also push them away from the other classes, out of the real data (mean shift 0.16 and 0.33): guidance trades diversity, and eventually fidelity, for 'class-ness'." %}

## 8. Flow matching and rectified flow

Diffusion's ODE view suggests a simpler recipe: directly learn a velocity field that transports noise to data. **Flow matching** (Lipman et al., ICLR 2023) and **rectified flow** (Liu, Gong, Liu, ICLR 2023) use the straight-line interpolation between a noise sample $x_0 \sim \mathcal{N}(0, I)$ and a data sample $x_1$:

$$
x_t = (1-t)\,x_0 + t\,x_1,\qquad \frac{dx_t}{dt} = x_1 - x_0,\qquad t \in [0, 1].
$$

The **conditional flow matching** loss regresses a network onto this per-pair velocity:

$$
\mathcal{L}_{\mathrm{CFM}}(\theta) = \mathbb{E}_{t,\,x_0,\,x_1}\Big[\big\lVert v_\theta(x_t, t) - (x_1 - x_0)\big\rVert^2\Big].
$$

Although each target is the velocity of one specific pair, the minimizer is the conditional expectation $v^\ast(x, t) = \mathbb{E}[x_1 - x_0 \mid x_t = x]$, which is exactly the **marginal** velocity field whose ODE $dx/dt = v^\ast(x, t)$ transports $\mathcal{N}(0, I)$ to $p_{\mathrm{data}}$; the gradients of the conditional and marginal objectives coincide. Sampling is plain ODE integration (Euler or Heun) from $t = 0$ to $1$.

The figure compares the per-pair paths of the two recipes for the same pairs of noise and data points.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-flow-vs-diffusion.svg" caption="The same 10 (noise, data) pairs; black dots are noise, squares data (note the opposite naming conventions in the two titles). Left: the Gaussian diffusion interpolation traced from $t = 999$ to $0$ is an arc, with a dot every 50 steps. Right: the flow-matching interpolation is a straight segment traversed at constant speed (dots at equal time steps). These are the conditional paths used as regression targets; the marginal ODE that a sampler integrates bends where different pairs cross (try the widget below)." %}

Notes:

- Conventions differ: rectified flow and Stable Diffusion 3 put data at $t = 0$ and noise at $t = 1$. Read each paper's definition before copying formulas.
- Gaussian diffusion is a special case with a curved interpolation path ($\sqrt{\bar\alpha_t}$ and $\sqrt{1-\bar\alpha_t}$ instead of $t$ and $1-t$); a flow model's velocity and a diffusion model's $\epsilon$ are linear transformations of each other given $x_t$.
- Rectified flow's **reflow** procedure retrains on (noise, generated sample) pairs to straighten trajectories further, enabling very few-step sampling.
- Esser et al., "Scaling Rectified Flow Transformers for High-Resolution Image Synthesis" (ICML 2024) showed rectified flow with Transformer backbones scales well; many recent video models train with flow matching.

What matters in practice is how few solver steps are needed. The figure integrates the exact marginal fields of the toy mixture with very few uniform steps.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-few-step.svg" width="85%" caption="End points of 1500 samples after $N$ solver steps on the exact fields: DDIM ($\eta = 0$, uniform timesteps) for diffusion, Euler for flow matching. With one step both land on the data mean, the best single guess. With 4 steps flow matching already puts 89% of the samples near a mode versus 14% for DDIM; with 16 steps both are close (100% and 98%). The exact numbers depend on the time grid, but the gap is why flow models are popular for few-step sampling." %}

{% include widget.liquid name="world-models-flow-paths" height="560" caption="Try it: drag the black noise sample. Thin curves are the exact ODE paths of diffusion (orange, DDIM) and flow matching (purple, Euler), with dots at equal time steps so you can see the speed; thick dashed lines are the same solvers with only $N$ steps (slider), squares their end points. Both exact paths end at the same data point: for Gaussian paths the two ODEs differ only by a rescaling of space and time ($x_{\mathrm{fm}} = x_{\mathrm{vp}} / (\sqrt{\bar\alpha_t} + \sqrt{1-\bar\alpha_t})$). What differs is the speed along the path, and that decides how close an $N$-step solver gets to the nearest mode." %}

## 9. Diffusion Transformers (DiT)

The denoiser was originally a U-Net. **DiT** (Peebles & Xie, ICCV 2023) replaced it with a plain Vision Transformer over latent patches: the latent is cut into $p \times p$ patches, linearly embedded, processed by Transformer blocks, and un-patchified to predict noise (and variance). The timestep and class conditioning enter through **adaptive layer norm**: a small MLP maps the conditioning to per-block scale and shift parameters, and in the **adaLN-Zero** variant also to a gate initialized to zero so each block starts as the identity. The paper shows that sample quality improves steadily with compute (Gflops) as the model gets deeper/wider or the patch size smaller; DiT-XL/2 reached an FID of 2.27 on class-conditional ImageNet 256x256.

The figure traces one denoising step through a DiT.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-dit.svg" caption="DiT: the noisy latent is cut into $p \times p$ patches (here an $8 \times 8$ latent with $p = 2$ gives 16 tokens), embedded with positional embeddings and processed by $N$ Transformer blocks. The timestep and class enter through adaLN-Zero: an MLP produces per-block scale $\gamma$, shift $\beta$ and a zero-initialized gate $\alpha$. The output tokens are un-patchified into the predicted noise (and variance). Halving $p$ quadruples the number of tokens." %}

Why this matters for world models: Transformers treat video as just a longer sequence of patches. Sora's report describes exactly this, a diffusion Transformer over **spacetime patches** of a compressed video latent, trained on videos of variable duration, resolution and aspect ratio. Conditioning on actions or past frames becomes "more tokens" or "more adaLN inputs".

## 10. Code: a minimal DDPM (and flow matching) in PyTorch

The script below trains a noise-prediction MLP on a 2D mixture of eight Gaussians and samples with both DDPM ancestral sampling (1000 steps) and DDIM (50 steps). It runs in about a minute on a laptop CPU. A 2D toy is the best way to debug a diffusion implementation: you can see immediately whether samples land on the modes.

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

Switching to **flow matching** changes only the training target and the sampler. Reusing `Denoiser` (its time input is now $t \in [0, 1]$ scaled by 1000 so the same sinusoidal embedding works):

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

(`time_embedding` accepts float times as well, since it only calls `.float()`.) Things to try: plot the trajectories of a few samples for DDIM and for flow matching, and compare how straight they are; add a class label and classifier-free guidance; replace the MLP by a tiny Transformer over two "tokens".

## 11. How the pieces map onto world models

| System | Compressor | Dynamics / generator | Conditioning |
| --- | --- | --- | --- |
| World Models (2018) | VAE | MDN-RNN | action |
| DreamerV3 | (RSSM encoder) | RSSM with categorical latents | action |
| IRIS (2023) | discrete autoencoder | autoregressive Transformer | action tokens |
| GAIA-1 (2023) | image tokenizer | autoregressive Transformer + video diffusion decoder | video, text, action |
| Genie (2024) | spatiotemporal VQ tokenizer | MaskGIT-style dynamics Transformer | learned latent actions |
| GameNGen (2024) | Stable Diffusion autoencoder | latent diffusion (fine-tuned SD v1.4) | past frames + actions |
| Sora (2024) | video compression network | diffusion Transformer over spacetime patches | text, images, video |
| Cosmos (2025) | Cosmos tokenizers | diffusion and autoregressive world foundation models | text, video, (post-trained) actions |

Post 3 looks inside these video world simulators. (*Update, November 2026:* the 2025-2026 update below extends this table with causal, few-step video diffusion models.)

## 2025-2026 update (as of November 2026)

This section adds the generative-modeling developments of 2025 to early November 2026 that matter for world models. It is not a survey of video generation, which moved too fast to cover here. The biggest change for world models is that **causal, few-step video diffusion became the standard backbone of interactive simulators**. Its key problem, and the most important new idea, is about *what the model sees as context during training*. "Preprint" means an arXiv paper not yet published at a venue.

### Causal video diffusion and the train-test gap

An interactive world model must generate frame $t$ from frames $\lt t$ and the action, then condition on its *own* output for frame $t+1$ (the factorization of post 3, section 4). Write $x_{\lt t}$ for real frames and $\hat x_{\lt t}$ for generated ones. Standard **teacher forcing** (TF) trains $p_\theta(x_t \mid x_{\lt t})$ on real context, but at test time the model receives $\hat x_{\lt t}$. Errors in $\hat x$ are inputs it has never seen, so they compound. This is the exposure-bias version of the compounding-error problem from post 1. The figure compares three ways to choose the training context.

{% include blog_figure.liquid path="assets/img/blog/world-models/02-update-forcing.svg" width="90%" caption="What a causal video model is conditioned on during training. TF (teacher forcing): the clean real past $x_{1:5}$, with only the frame being learned noised. DF (Diffusion Forcing, post 3): every frame gets an independent noise level $\sigma$ (grey level), so the model learns to work with uncertain context. SF (Self Forcing): the context is the model's own autoregressive rollout $\hat x_{1:5}$ (arrows, generated with a KV cache exactly as at test time), and the loss is applied to the whole generated clip by a distribution-matching (DMD) or adversarial objective. Only SF trains on the same inputs the model will see when deployed." %}

- **CausVid** (Yin et al., "From Slow Bidirectional to Fast Autoregressive Video Diffusion Models", CVPR 2025, [arXiv:2412.07772](https://arxiv.org/abs/2412.07772)) distills a high-quality *bidirectional* video diffusion teacher into a *causal* student that needs only a few denoising steps. Generation becomes streaming with a KV cache. The distillation uses distribution matching distillation (DMD): the student is trained so that its output distribution matches the teacher's, rather than copying individual samples.
- **Self Forcing** (Huang et al., NeurIPS 2025, [arXiv:2506.08009](https://arxiv.org/abs/2506.08009)) closes the train-test gap directly. During training the model generates the clip autoregressively, frame by frame with KV caching, exactly as at inference. A holistic, video-level loss (DMD, score-identity or GAN) is then applied to its own outputs. Unrolling a rollout during training is affordable only because each frame takes a few denoising steps. The result runs in real time on one GPU and became the default recipe for open interactive world models such as Matrix-Game 2.0 (post 3's update).
- Successors fix the remaining weaknesses. **Self-Forcing++** (Cui et al., preprint, [arXiv:2510.02283](https://arxiv.org/abs/2510.02283)) reduces drift over long rollouts without long-video teachers and reaches videos of up to 4 min 15 s. **LongLive** (preprint, [arXiv:2509.22622](https://arxiv.org/abs/2509.22622)) adds prompt switching during generation. **Causal Forcing** (Zhu et al., ICML 2026, [arXiv:2602.02214](https://arxiv.org/abs/2602.02214)) observes that distilling from a *bidirectional* teacher leaves an architectural gap. It initializes the student with an *autoregressive* teacher before DMD and reports clear gains over Self Forcing in motion dynamics. **Causal Forcing++** (preprint, [arXiv:2605.15141](https://arxiv.org/abs/2605.15141)) and **Causal-rCM** (Zheng et al., preprint, [arXiv:2606.25473](https://arxiv.org/abs/2606.25473)) push to 2 sampling steps per frame. Causal-rCM combines teacher-forcing consistency distillation with self-forcing DMD.
- Two related ideas. **History-Guided Video Diffusion** (Song et al., ICML 2025, [arXiv:2502.06764](https://arxiv.org/abs/2502.06764)) trains a Diffusion Forcing Transformer that accepts a variable-length history. It applies classifier-free guidance (section 7) *to the history*, comparing predictions with and without past frames to strengthen long-range consistency. **MAGI-1** (Sand AI, preprint, [arXiv:2505.13211](https://arxiv.org/abs/2505.13211)) scales autoregressive, chunk-by-chunk video diffusion to a large open model.

### A toy run: teacher forcing vs training on your own rollouts

The train-test gap is easy to reproduce without any video. The script below learns a damped pendulum, with state $x = (\theta, \dot\theta)$ and the true one-step map $x_{t+1} = F(x_t)$ (Euler integration of $\ddot\theta = -\sin\theta - 0.1\,\dot\theta$ with $\Delta t = 0.1$). The model is deliberately too small to fit $F$ exactly: $\hat x_{t+1} = \hat x_t + f_\phi(\hat x_t)$ with an MLP $f_\phi$ of 8 hidden units, so some error is unavoidable. We train it in two ways:

- **teacher forcing (TF):** minimize the one-step loss $\frac{1}{N}\sum_t \Vert x_t + f_\phi(x_t) - x_{t+1} \Vert^2$, always starting from the *real* state;
- **self forcing (SF):** start from a real state $x_s$, roll the model out for $H = 20$ steps *on its own predictions*, and minimize $\frac{1}{H+1}\sum_{k=0}^{H} \Vert \hat x_{s+k} - x_{s+k} \Vert^2$, back-propagating through the whole rollout.

Both models see the same 256 training trajectories. We then test on 256 new starting states and roll out 60 steps.

```python
import torch

torch.manual_seed(0)
dt = 0.1


def true_step(x):                       # damped pendulum, state = (angle, angular velocity)
    th, om = x[..., 0], x[..., 1]
    return torch.stack([th + dt * om, om + dt * (-torch.sin(th) - 0.1 * om)], -1)


def rollout(step, x0, T):
    xs = [x0]
    for _ in range(T):
        xs.append(step(xs[-1]))
    return torch.stack(xs, 1)            # (batch, T+1, 2)


x0_train = (torch.rand(256, 2) - 0.5) * torch.tensor([5.0, 3.0])
x0_test = (torch.rand(256, 2) - 0.5) * torch.tensor([5.0, 3.0])
X = rollout(true_step, x0_train, 40)


def make_model():                        # a small model that cannot fit the dynamics exactly
    return torch.nn.Sequential(torch.nn.Linear(2, 8), torch.nn.Tanh(), torch.nn.Linear(8, 2))


def train(mode, H=20, iters=1500):
    torch.manual_seed(1)
    f = make_model()
    step = lambda x: x + f(x)
    opt = torch.optim.Adam(f.parameters(), lr=3e-3)
    for _ in range(iters):
        if mode == "teacher":            # context = real previous state, one-step target
            loss = ((step(X[:, :-1]) - X[:, 1:]) ** 2).mean()
        else:                            # context = the model's own rollout, loss on the whole clip
            s = torch.randint(0, 40 - H, (1,)).item()
            loss = ((rollout(step, X[:, s], H) - X[:, s:s + H + 1]) ** 2).mean()
        opt.zero_grad()
        loss.backward()
        opt.step()
    return step


with torch.no_grad():
    Y = rollout(true_step, x0_test, 60)
models = {m: train(m) for m in ("teacher", "self")}
for m, step in models.items():
    with torch.no_grad():
        one = ((step(Y[:, :-1]) - Y[:, 1:]) ** 2).sum(-1).sqrt().mean().item()
        err = (rollout(step, x0_test, 60) - Y).pow(2).sum(-1).sqrt().mean(0)
    print(f"{m:8s} one-step error {one:.4f}   rollout error at t=10: {err[10]:.3f}  t=30: {err[30]:.3f}  t=60: {err[60]:.3f}")
```

Output (CPU, a few seconds):

```text
teacher  one-step error 0.0131   rollout error at t=10: 0.086  t=30: 0.302  t=60: 0.863
self     one-step error 0.0139   rollout error at t=10: 0.068  t=30: 0.144  t=60: 0.644
```

The numbers show the whole story in miniature. TF is slightly *better* at the task it was trained on (one-step error 0.0131 vs 0.0139). But once the model feeds on its own outputs, SF's error is half of TF's after 30 steps (0.144 vs 0.302) and still 25% lower after 60. SF has learned to stay in states from which its own small errors do not grow. It sacrifices a little one-step accuracy to do so. Self Forcing applies exactly this trade, with a video diffusion model in place of $f_\phi$ and a distribution-matching loss in place of the squared error (a single sample cannot be matched pixel by pixel to one "true" future video).

{% include blog_figure.liquid path="assets/img/blog/world-models/02-update-exposure.svg" width="95%" caption="Left: mean rollout error $\Vert \hat x_t - x_t \Vert$ over 256 test trajectories for the teacher-forced (TF, blue) and self-forced (SF, orange) models of the script. Both start at zero error. TF's error grows faster even though its one-step error is lower. Right: phase portrait ($\theta$, $\dot\theta$) of the test trajectory where the two models differ most. The true pendulum (black) swings over the top ($\theta$ passes $\pi$). The SF model follows it; the TF model's small errors push it to the wrong side of the hilltop and it swings back. SF has the lower error at $t = 60$ on 79% of the test trajectories." %}

### Few-step samplers: shortcut models and MeanFlow

Real-time world models need one to four network evaluations per frame. Section 8 met reflow. Two newer ideas train few-step samplers directly.

- **Shortcut models** (Frans et al., "One Step Diffusion via Shortcut Models", [arXiv:2410.12557](https://arxiv.org/abs/2410.12557), 2024) condition the network on the desired *step size* $d$ as well as the noise level. They train it so that one step of size $2d$ equals two consecutive steps of size $d$, a self-consistency target. One model can then sample with 1, 2, 4, ... steps. Dreamer 4's *shortcut forcing* (post 1's update) combines this with Diffusion Forcing.
- **MeanFlow** (Geng et al., "Mean Flows for One-step Generative Modeling", preprint, [arXiv:2505.13447](https://arxiv.org/abs/2505.13447)) learns the *average* velocity $u(x_t, r, t) = \frac{1}{t - r}\int_r^t v(x_\tau, \tau)\, d\tau$ over an interval instead of the instantaneous velocity $v$ of flow matching. A single evaluation then jumps from noise to data: $x_r = x_t - (t - r)\, u(x_t, r, t)$. (This uses the paper's convention, data at $t = 0$ and noise at $t = 1$, which is the opposite of section 8.) Compare this with the curved exact paths in the flow-paths widget above, where a large Euler step overshoots because it uses the instantaneous velocity.

### Open backbones and tokenizers

- **Wan** (Team Wan, preprint, [arXiv:2503.20314](https://arxiv.org/abs/2503.20314), March 2025) is an open family of large video diffusion transformers (flow matching, a causal 3D VAE). Many 2025-2026 world models start from it, including several in post 3's update and models built on Wan2.1/2.2.
- **Representation autoencoders** (Zheng et al., "Diffusion Transformers with Representation Autoencoders", technical report, [arXiv:2510.11690](https://arxiv.org/abs/2510.11690)) replace the VAE of latent diffusion (section 6) with a frozen *pretrained representation encoder* (such as DINOv2) plus a trained decoder. The diffusion model then works in a semantic feature space. This is the same "predict in feature space" choice that JEPA and DINO-world make (post 5), now used for generation.
- The **Cosmos tokenizers** (section 11 table) remain a common open choice for video. NVIDIA's later Cosmos releases are covered in post 3's update.

### The table in section 11, extended

| System | Compressor | Dynamics / generator | Conditioning |
| --- | --- | --- | --- |
| Self Forcing / CausVid students (2025) | video VAE (Wan) | causal few-step video diffusion with KV cache | text (and actions when fine-tuned) |
| Matrix-Game 2.0 (2025) | video VAE | causal few-step diffusion (Self-Forcing-style) | keyboard and mouse |
| Dreamer 4 (2025) | learned video tokenizer | transformer with shortcut forcing | actions (few labels) |
| Cosmos 3 (2026) | not detailed in the announcement | mixture of transformers: reasoning + generation | text, image, video, sound, actions |

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Auto-Encoding Variational Bayes (Kingma, Welling) | ICLR | 2014 | [arXiv:1312.6114](https://arxiv.org/abs/1312.6114) | VAE, ELBO, reparameterization |
| Neural Discrete Representation Learning (VQ-VAE, van den Oord et al.) | NeurIPS | 2017 | [arXiv:1711.00937](https://arxiv.org/abs/1711.00937) | Discrete latents / visual tokens |
| Taming Transformers for High-Resolution Image Synthesis (VQGAN, Esser et al.) | CVPR | 2021 | [arXiv:2012.09841](https://arxiv.org/abs/2012.09841) | Perceptual + GAN tokenizer, Transformer prior |
| MaskGIT: Masked Generative Image Transformer (Chang et al.) | CVPR | 2022 | [arXiv:2202.04200](https://arxiv.org/abs/2202.04200) | Parallel token decoding |
| Deep Unsupervised Learning using Nonequilibrium Thermodynamics (Sohl-Dickstein et al.) | ICML | 2015 | [arXiv:1503.03585](https://arxiv.org/abs/1503.03585) | Origin of diffusion models |
| Generative Modeling by Estimating Gradients of the Data Distribution (NCSN, Song, Ermon) | NeurIPS | 2019 | [arXiv:1907.05600](https://arxiv.org/abs/1907.05600) | Score-based generative modeling |
| Denoising Diffusion Probabilistic Models (Ho, Jain, Abbeel) | NeurIPS | 2020 | [arXiv:2006.11239](https://arxiv.org/abs/2006.11239) | Simple noise-prediction loss |
| Score-Based Generative Modeling through Stochastic Differential Equations (Song et al.) | ICLR | 2021 | [arXiv:2011.13456](https://arxiv.org/abs/2011.13456) | SDE / probability-flow ODE unification |
| Denoising Diffusion Implicit Models (DDIM, Song, Meng, Ermon) | ICLR | 2021 | [arXiv:2010.02502](https://arxiv.org/abs/2010.02502) | Fast deterministic sampling |
| High-Resolution Image Synthesis with Latent Diffusion Models (Rombach et al.) | CVPR | 2022 | [arXiv:2112.10752](https://arxiv.org/abs/2112.10752) | Diffusion in a learned latent space |
| Classifier-Free Diffusion Guidance (Ho, Salimans) | NeurIPS Workshop | 2021 | [arXiv:2207.12598](https://arxiv.org/abs/2207.12598) | Guidance without a classifier |
| Elucidating the Design Space of Diffusion-Based Generative Models (EDM, Karras et al.) | NeurIPS | 2022 | [arXiv:2206.00364](https://arxiv.org/abs/2206.00364) | Clean parameterization of noise levels, preconditioning and samplers |
| Flow Matching for Generative Modeling (Lipman et al.) | ICLR | 2023 | [arXiv:2210.02747](https://arxiv.org/abs/2210.02747) | Simulation-free training of continuous flows |
| Flow Straight and Fast: Rectified Flow (Liu, Gong, Liu) | ICLR | 2023 | [arXiv:2209.03003](https://arxiv.org/abs/2209.03003) | Straight paths, reflow |
| Scalable Diffusion Models with Transformers (DiT, Peebles, Xie) | ICCV | 2023 | [arXiv:2212.09748](https://arxiv.org/abs/2212.09748) | Transformer denoiser, adaLN-Zero, scaling |
| Scaling Rectified Flow Transformers for High-Resolution Image Synthesis (Esser et al.) | ICML | 2024 | [arXiv:2403.03206](https://arxiv.org/abs/2403.03206) | Rectified flow + Transformers at scale (SD3) |
| Language Model Beats Diffusion: Tokenizer is Key to Visual Generation (MAGVIT-v2, Yu et al.) | ICLR | 2024 | [arXiv:2310.05737](https://arxiv.org/abs/2310.05737) | Lookup-free quantization video tokenizer |
| One Step Diffusion via Shortcut Models (Frans et al.) | arXiv | 2024 | [arXiv:2410.12557](https://arxiv.org/abs/2410.12557) | Step-size-conditioned few-step sampling |
| From Slow Bidirectional to Fast Autoregressive Video Diffusion Models (CausVid, Yin et al.) | CVPR | 2025 | [arXiv:2412.07772](https://arxiv.org/abs/2412.07772) | Bidirectional teacher to causal few-step student |
| History-Guided Video Diffusion (Song et al.) | ICML | 2025 | [arXiv:2502.06764](https://arxiv.org/abs/2502.06764) | Guidance on variable-length history |
| Wan: Open and Advanced Large-Scale Video Generative Models (Team Wan) | preprint | 2025 | [arXiv:2503.20314](https://arxiv.org/abs/2503.20314) | Open backbone of many world models |
| MAGI-1: Autoregressive Video Generation at Scale (Sand AI) | preprint | 2025 | [arXiv:2505.13211](https://arxiv.org/abs/2505.13211) | Chunk-wise autoregressive diffusion at scale |
| Mean Flows for One-step Generative Modeling (Geng et al.) | preprint | 2025 | [arXiv:2505.13447](https://arxiv.org/abs/2505.13447) | Average-velocity flows for one-step sampling |
| Self Forcing: Bridging the Train-Test Gap in Autoregressive Video Diffusion (Huang et al.) | NeurIPS | 2025 | [arXiv:2506.08009](https://arxiv.org/abs/2506.08009) | Train on own rollouts; real-time causal video |
| Self-Forcing++: Towards Minute-Scale High-Quality Video Generation (Cui et al.) | preprint | 2025 | [arXiv:2510.02283](https://arxiv.org/abs/2510.02283) | Minute-scale rollouts without long teachers |
| Diffusion Transformers with Representation Autoencoders (Zheng et al.) | technical report | 2025 | [arXiv:2510.11690](https://arxiv.org/abs/2510.11690) | Diffusion in a pretrained feature space |
| Causal Forcing (Zhu et al.) | ICML | 2026 | [arXiv:2602.02214](https://arxiv.org/abs/2602.02214) | Autoregressive teacher for causal distillation |
| Causal-rCM (Zheng et al.) | technical report | 2026 | [arXiv:2606.25473](https://arxiv.org/abs/2606.25473) | Teacher-forcing consistency + self-forcing DMD |

## Learning resources

- Lilian Weng, ["What are Diffusion Models?"](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/) (2021, with later updates): the clearest single derivation of DDPM, the score view, DDIM and guidance.
- S. Prince, *Understanding Deep Learning* (MIT Press, 2023), chapters on VAEs, normalizing flows and diffusion models: free PDF at [udlbook.github.io/udlbook](https://udlbook.github.io/udlbook/).
- Stanford [CS236: Deep Generative Models](https://deepgenerativemodels.github.io/) (course notes and lectures).
- Hugging Face [diffusers](https://github.com/huggingface/diffusers) for production-quality schedulers and pipelines, and Meta's [flow_matching](https://github.com/facebookresearch/flow_matching) library.

## Exercises

1. Prove $q(x_t \mid x_0) = \mathcal{N}(\sqrt{\bar\alpha_t}x_0, (1-\bar\alpha_t)I)$ by induction, using that the sum of independent Gaussians is Gaussian.
2. Derive $\tilde\mu_t$ and $\tilde\beta_t$ by completing the square, starting from Bayes' rule: the posterior $q(x_{t-1} \mid x_t, x_0)$ is proportional to $q(x_t \mid x_{t-1})\, q(x_{t-1} \mid x_0)$.
3. In the DDPM script, compare DDIM with 10, 50 and 200 steps and $\eta \in \lbrace 0, 1 \rbrace$. Which one degrades first when you reduce steps?
4. Add a class label (the mode index) and train with 15% label dropout. Implement classifier-free guidance and plot samples for $w \in \lbrace 1, 3, 7 \rbrace$. What happens to the spread of each mode?
5. Show that for the linear path $x_t = (1-t)x_0 + t x_1$, a velocity predictor $v_\theta$ and a noise predictor are related by $\hat\epsilon = x_t - t\,v_\theta(x_t, t)$.
6. (2025-2026 update) A causal video model uses $S$ denoising steps per frame and generates $F$ frames. Count the network evaluations needed to unroll one Self Forcing training clip, and explain why Self Forcing is practical with $S = 4$ but not with $S = 50$. Which part of the gap between teacher forcing and test time does Diffusion Forcing close, and which part does it leave open?

<details markdown="1"><summary>Hint</summary>

Unrolling needs $F \cdot S$ evaluations (a KV cache keeps each one roughly constant in cost), for example 80 for $F = 20$, $S = 4$, against 1,000 for $S = 50$. In practice, gradients are kept only through part of the unroll to save memory. Diffusion Forcing teaches the model to tolerate *noisy* context, but the noise is Gaussian, while real test-time context contains the model's own structured errors (blur, drift). Only training on its own rollouts exposes the model to those.

</details>

**Next:** [post 3]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }}) uses these tools to build video world simulators: Sora, Genie 1-3, GameNGen, UniSim, GAIA-1 and Cosmos.
