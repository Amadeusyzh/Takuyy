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

### 2.3 What VAEs are good and bad at

With a Gaussian decoder, $-\ln p_\theta(x \mid z)$ is an L2 loss, which averages over uncertainty and gives **blurry** samples. Weighting the KL by $\beta$ ($\beta$-VAE) trades reconstruction against a more regular latent space; a too-strong decoder can ignore $z$ (**posterior collapse**). In modern systems the VAE is rarely the generator itself; instead it is a **perceptual compressor**: a convolutional autoencoder with a small KL weight plus perceptual and adversarial losses, mapping a $256 \times 256 \times 3$ image to, say, a $32 \times 32 \times 4$ latent on which a diffusion model then works (Section 6).

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

Equivalent **parameterizations** are common: predicting $x_0$ directly, or the "velocity" $v = \sqrt{\bar\alpha_t}\,\epsilon - \sqrt{1-\bar\alpha_t}\,x_0$ (used by many video models because it behaves well at both ends of the schedule).

### 5.3 The score view and SDEs

Why does predicting noise work? **Tweedie's formula** says that for $x_t = \sqrt{\bar\alpha_t} x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon$, the posterior mean of the noise is tied to the **score** of the noisy marginal:

$$
\nabla_{x_t} \ln p_t(x_t) = -\frac{\mathbb{E}[\epsilon \mid x_t]}{\sqrt{1-\bar\alpha_t}}
\qquad\Rightarrow\qquad
s_\theta(x_t, t) := -\frac{\epsilon_\theta(x_t, t)}{\sqrt{1-\bar\alpha_t}} \approx \nabla_{x_t} \ln p_t(x_t).
$$

The noise-prediction loss is (up to weighting) **denoising score matching** (Vincent, 2011), and the denoiser estimates the gradient field that points toward data at every noise level (Song & Ermon's NCSN, NeurIPS 2019).

Song et al. (ICLR 2021) unified both views in continuous time. A forward **SDE** $dx = f(x, t)\,dt + g(t)\,dw$ diffuses data into noise; DDPM is the discretization of the **variance-preserving** SDE $dx = -\tfrac{1}{2}\beta(t)\,x\,dt + \sqrt{\beta(t)}\,dw$. By Anderson's theorem the process runs backward in time according to the **reverse SDE**

$$
dx = \big[f(x, t) - g(t)^2\, \nabla_x \ln p_t(x)\big]\,dt + g(t)\,d\bar w,
$$

and there is a deterministic **probability-flow ODE** with the same marginals $p_t$:

$$
\frac{dx}{dt} = f(x, t) - \frac{1}{2}\, g(t)^2\, \nabla_x \ln p_t(x).
$$

Replace the score by $s_\theta$ and you can sample with any SDE or ODE solver. The ODE view explains why samplers with far fewer steps exist, gives exact likelihoods, and connects diffusion to flow matching (Section 8).

### 5.4 DDIM: fast deterministic sampling

**DDIM** (Song, Meng, Ermon, ICLR 2021) observes that the training loss only depends on the marginals $q(x_t \mid x_0)$, so we may use any non-Markovian process with the same marginals. Its update first predicts the clean sample and then re-noises it to level $t-1$:

$$
\hat x_0 = \frac{x_t - \sqrt{1-\bar\alpha_t}\,\epsilon_\theta(x_t, t)}{\sqrt{\bar\alpha_t}},\qquad
x_{t-1} = \sqrt{\bar\alpha_{t-1}}\,\hat x_0 + \sqrt{1-\bar\alpha_{t-1}-\sigma_t^2}\;\epsilon_\theta(x_t, t) + \sigma_t z .
$$

With $\sigma_t = 0$ the sampler is deterministic (a discretization of the probability-flow ODE), works on a sub-sequence of timesteps (e.g. 50 of 1000), and maps each noise vector to a unique sample, which enables inversion and interpolation. With $\sigma_t = \eta\sqrt{\tilde\beta_t}$ and $\eta = 1$ it recovers DDPM.

## 6. Latent diffusion

Running diffusion on $256 \times 256 \times 3$ pixels, let alone on video, is expensive, and most of the bits in an image are imperceptible detail. **Latent diffusion** (Rombach et al., CVPR 2022; the basis of Stable Diffusion) trains an autoencoder once ($\mathcal{E}, \mathcal{D}$ with KL or VQ regularization and perceptual + GAN losses) and runs diffusion on $z = \mathcal{E}(x)$:

$$
\mathcal{L}_{\mathrm{LDM}} = \mathbb{E}_{\mathcal{E}(x),\,c,\,\epsilon,\,t}\Big[\big\lVert \epsilon - \epsilon_\theta(z_t, t, \tau_\theta(c))\big\rVert^2\Big],
$$

where $\tau_\theta(c)$ encodes the conditioning (e.g. text, fed through cross-attention). Almost every video world model is a latent model in this sense: Sora's "spacetime patches" are patches of a compressed video latent, and GameNGen fine-tunes Stable Diffusion v1.4.

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

Notes:

- Conventions differ: rectified flow and Stable Diffusion 3 put data at $t = 0$ and noise at $t = 1$. Read each paper's definition before copying formulas.
- Gaussian diffusion is a special case with a curved interpolation path ($\sqrt{\bar\alpha_t}$ and $\sqrt{1-\bar\alpha_t}$ instead of $t$ and $1-t$); a flow model's velocity and a diffusion model's $\epsilon$ are linear transformations of each other given $x_t$.
- Rectified flow's **reflow** procedure retrains on (noise, generated sample) pairs to straighten trajectories further, enabling very few-step sampling.
- Esser et al., "Scaling Rectified Flow Transformers for High-Resolution Image Synthesis" (ICML 2024) showed rectified flow with Transformer backbones scales well; many recent video models train with flow matching.

## 9. Diffusion Transformers (DiT)

The denoiser was originally a U-Net. **DiT** (Peebles & Xie, ICCV 2023) replaced it with a plain Vision Transformer over latent patches: the latent is cut into $p \times p$ patches, linearly embedded, processed by Transformer blocks, and un-patchified to predict noise (and variance). The timestep and class conditioning enter through **adaptive layer norm**: a small MLP maps the conditioning to per-block scale and shift parameters, and in the **adaLN-Zero** variant also to a gate initialized to zero so each block starts as the identity. The paper shows that sample quality improves steadily with compute (Gflops) as the model gets deeper/wider or the patch size smaller; DiT-XL/2 reached an FID of 2.27 on class-conditional ImageNet 256x256.

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

Post 3 looks inside these video world simulators.

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

## Learning resources

- Lilian Weng, ["What are Diffusion Models?"](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/) (2021, with later updates): the clearest single derivation of DDPM, the score view, DDIM and guidance.
- S. Prince, *Understanding Deep Learning* (MIT Press, 2023), chapters on VAEs, normalizing flows and diffusion models: free PDF at [udlbook.github.io/udlbook](https://udlbook.github.io/udlbook/).
- Stanford [CS236: Deep Generative Models](https://deepgenerativemodels.github.io/) (course notes and lectures).
- Hugging Face [diffusers](https://github.com/huggingface/diffusers) for production-quality schedulers and pipelines, and Meta's [flow_matching](https://github.com/facebookresearch/flow_matching) library.

## Exercises

1. Prove $q(x_t \mid x_0) = \mathcal{N}(\sqrt{\bar\alpha_t}x_0, (1-\bar\alpha_t)I)$ by induction, using that the sum of independent Gaussians is Gaussian.
2. Derive $\tilde\mu_t$ and $\tilde\beta_t$ from Bayes' rule $q(x_{t-1} \mid x_t, x_0) \propto q(x_t \mid x_{t-1})\, q(x_{t-1} \mid x_0)$ by completing the square.
3. In the DDPM script, compare DDIM with 10, 50 and 200 steps and $\eta \in \lbrace 0, 1 \rbrace$. Which one degrades first when you reduce steps?
4. Add a class label (the mode index) and train with 15% label dropout. Implement classifier-free guidance and plot samples for $w \in \lbrace 1, 3, 7 \rbrace$. What happens to the spread of each mode?
5. Show that for the linear path $x_t = (1-t)x_0 + t x_1$, a velocity predictor $v_\theta$ and a noise predictor are related by $\hat\epsilon = x_t - t\,v_\theta(x_t, t)$.

**Next:** [post 3]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }}) uses these tools to build video world simulators: Sora, Genie 1-3, GameNGen, UniSim, GAIA-1 and Cosmos.
