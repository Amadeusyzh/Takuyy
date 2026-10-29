---
layout: post
title: "Explicit worlds: 3D and 4D world generation"
date: 2026-10-27 15:04:00+0900
description: "Generating explicit 3D and 4D worlds: score distillation (DreamFusion, VSD), multi-view diffusion, scene growing with inpainting and depth (Text2Room, LucidDreamer, WonderJourney, WonderWorld), Gaussian scene generation, 4D generation, World Labs' Marble, and the trade-offs against pixel-space video world models."
categories: world-models
tags: [world-models, 3d-generation, score-distillation, gaussian-splatting, 4d-generation]
series: world-models
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## Why this matters

The video world simulators of [post 3]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }}) keep the whole world implicitly inside a network and its context window; that is why they forget what is behind you. The opposite design keeps an **explicit 3D (or 4D) representation**, such as a mesh, a NeRF or a set of 3D Gaussians, and uses generative models only to *create* or *extend* it. Once the world exists in 3D, a classical renderer guarantees multi-view consistency, it can be edited object by object, run in real time on a phone or a VR headset, and handed to a physics engine. For readers coming from the [Neural Rendering & 3DGS series]({{ '/blog/category/neural-rendering/' | relative_url }}), this post is where that series meets world models: the representation is the one you already know, and the new question is how to *generate* it from text or a single image.

## Prerequisites

- Diffusion models, classifier-free guidance and DDIM ([post 2]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})).
- Radiance fields and 3D Gaussian Splatting (Kerbl et al., SIGGRAPH 2023 / ACM TOG 42(4)): differentiable rendering $x = g(\theta, \text{camera})$.
- Pinhole camera model: intrinsics $K$, camera-to-world pose $[R \mid t]$, unprojection with depth.

## 1. The core difficulty: no 3D data at internet scale

There are billions of captioned images and videos but only a few million 3D assets and very few large, high-quality 3D scenes. Every method in this post therefore **borrows a 2D prior** (an image or video diffusion model) and lifts it to 3D. There are four main strategies:

| Strategy | Idea | Examples | Speed |
| --- | --- | --- | --- |
| Score distillation | optimize a 3D representation so that all its renderings look likely under a 2D diffusion model | DreamFusion, Magic3D, ProlificDreamer, DreamGaussian | minutes to hours per asset |
| Multi-view generation + reconstruction | generate several consistent views with a 3D-aware diffusion model, then reconstruct | Zero-1-to-3, MVDream, CAT3D | about a minute |
| Feed-forward 3D | a large network directly outputs a 3D representation from an image | LRM and successors | seconds |
| Scene growing (inpaint + depth) | render the current scene from a new camera, inpaint the holes with a 2D model, lift with monocular depth, fuse | Text2Room, LucidDreamer, WonderJourney, WonderWorld | seconds to hours per scene |

Objects are mostly handled by the first three; **scenes and worlds**, which are unbounded and need room-scale layout, mostly by the fourth, or by systems that combine all of them (Marble, Section 6).

## 2. Score distillation sampling (SDS)

### 2.1 Derivation

**DreamFusion** (Poole et al., ICLR 2023, [arXiv:2209.14988](https://arxiv.org/abs/2209.14988)) optimizes NeRF parameters $\theta$ so that a rendering $x = g(\theta)$ from a random camera looks like a sample from a frozen text-to-image diffusion model $\hat\epsilon_\phi(x_t; y, t)$ with prompt $y$. The natural idea is to minimize the diffusion training loss with respect to the *image* instead of the network:

$$
\mathcal{L}_{\mathrm{diff}}(\theta) = \mathbb{E}_{t,\epsilon}\Big[w(t)\,\big\lVert \hat\epsilon_\phi(\alpha_t x + \sigma_t \epsilon;\ y, t) - \epsilon \big\rVert^2\Big], \qquad x = g(\theta).
$$

Its gradient contains the Jacobian of the U-Net, $\partial \hat\epsilon_\phi / \partial x_t$, which is expensive and, as the paper found, works poorly. Dropping it yields the **SDS gradient**:

$$
\nabla_\theta \mathcal{L}_{\mathrm{SDS}} = \mathbb{E}_{t,\epsilon}\Big[w(t)\,\big(\hat\epsilon_\phi(x_t;\ y, t) - \epsilon\big)\,\frac{\partial x}{\partial \theta}\Big].
$$

Intuitively: add noise to the rendering, ask the diffusion model which noise it "sees", and push the rendering in the direction that makes the residual $(\hat\epsilon - \epsilon)$ small. The paper shows this is the gradient of a weighted sum of KL divergences between the noised rendering distribution $q(x_t \mid x = g(\theta))$ and the model's noisy marginal $p_\phi(x_t \mid y)$. Since $\hat\epsilon_\phi \approx -\sigma_t \nabla \ln p_t$ (post 2, Section 5.3), SDS is gradient ascent on the log-density of the noised rendering, averaged over noise levels: it is **mode seeking**.

The figure traces one SDS step.

{% include blog_figure.liquid path="assets/img/blog/world-models/04-sds-loop.svg" localized="true" caption="One SDS update: render the scene from a random camera, noise the rendering to a random level $t$, let the frozen text-conditioned diffusion model predict the noise, and push the residual $w(t)(\hat\epsilon_\phi - \epsilon)$ back through the differentiable renderer into $\theta$ (red). The diffusion model is never updated, and its Jacobian is never computed." %}

### 2.2 Practical consequences

- DreamFusion used a very large classifier-free guidance weight ($w = 100$) to get sharp results. Combined with mode seeking, this causes the typical **over-saturated, over-smoothed** look of SDS assets and low diversity across seeds.
- The 2D prior has no notion of 3D identity, so each view tries to look like the "canonical" view of the object; the result can have several faces (the **Janus problem**). View-dependent prompts ("front view", "back view") help; 3D-aware priors (Section 3) fix it more fundamentally.
- **Magic3D** (Lin et al., CVPR 2023) speeds this up with a coarse-to-fine schedule (a coarse neural field, then a textured mesh optimized with a latent diffusion prior at high resolution).
- **ProlificDreamer** (Wang et al., NeurIPS 2023) proposes **variational score distillation** (VSD): treat the 3D scene as a random variable and replace the noise $\epsilon$ in the SDS residual by the prediction of a second, LoRA-fine-tuned diffusion model that tracks the distribution of the current renderings:

$$
\nabla_\theta \mathcal{L}_{\mathrm{VSD}} = \mathbb{E}_{t,\epsilon,c}\Big[w(t)\,\big(\hat\epsilon_{\phi}(x_t;\ y, t) - \hat\epsilon_{\mathrm{lora}}(x_t;\ y, t, c)\big)\,\frac{\partial x}{\partial \theta}\Big],
$$

  where $c$ is the camera. This works with normal guidance weights (e.g. 7.5) and gives far more detailed and diverse results.
- **DreamGaussian** (Tang et al., ICLR 2024) and **GaussianDreamer** (Yi et al., CVPR 2024) replace NeRF by 3D Gaussians, which renders much faster and makes densification a natural way to grow geometry; DreamGaussian produces a textured mesh in about two minutes.

### 2.3 A runnable toy: SDS is mode seeking

The script below trains a small 2D diffusion model on a mixture of 8 Gaussians (exactly as in post 2), then treats 512 free 2D points as the "scene" $\theta$, with the identity as the "renderer" $g$, and optimizes them by SDS. Compare the spread of the optimized points with the spread of real samples.

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

The SDS points end up much closer to the mode centers than real samples are: each point climbs to a nearby density peak instead of reproducing the spread of the distribution. In 3D this is exactly the over-smoothed, "average-looking" texture of SDS assets. (Which modes are covered depends on the initialization, because each particle simply climbs the nearest hill.) Replacing $\epsilon$ in `grad` by the prediction of a second model trained on the current particles turns this into a toy VSD. Note also the **annealed** noise schedule in the loop. If $t$ is drawn uniformly over the whole range at every step, the high-noise terms dominate; the noisy marginal at large $t$ is a single blob around the data mean, so the particles are pulled toward the center of the circle instead of onto the modes (try it). Lowering the maximum timestep during optimization, as ProlificDreamer does with its two-stage time schedule, first settles the coarse layout and then the details.

Running the script, and the uniform-$t$ variant, gives the following (numbers in each panel: mean distance to the nearest mode, and modes covered):

{% include blog_figure.liquid path="assets/img/blog/world-models/04-sds-toy.svg" width="85%" caption="SDS on 512 free 2D points with the trained toy prior. With the annealed schedule the points first form a ring and then climb onto the modes, ending at mean distance 0.062 from the mode centres, half the spread of real samples (0.121): mode seeking. With $t$ drawn uniformly over the whole range, the high-noise terms keep pulling the points toward the centre, and they stop on a smaller circle (mean radius 1.53 instead of 2)." %}

## 3. 3D-aware priors: multi-view diffusion and feed-forward models

Instead of fighting the 2D prior's lack of 3D awareness, one can fine-tune it on 3D data so that it understands cameras:

- **Zero-1-to-3** (Liu et al., ICCV 2023) fine-tunes Stable Diffusion to synthesize a novel view of an object given an input image and a relative camera transform; used as an SDS prior it greatly reduces the Janus problem.
- **MVDream** (Shi et al., ICLR 2024) generates several views jointly with cross-view attention, so the views are consistent with each other.
- **CAT3D** (Gao et al., NeurIPS 2024) generates many consistent novel views of a *scene* from one or a few images with a multi-view diffusion model, then reconstructs a NeRF-like representation from them, in about a minute.
- **LRM** (Hong et al., ICLR 2024) is a large Transformer that maps a single image to a triplane NeRF in a few seconds, trained on large 3D object datasets; many follow-ups output 3D Gaussians directly.
- Pose-free reconstruction such as **DUSt3R** (Wang et al., CVPR 2024) predicts dense 3D point maps from image pairs without known cameras, which makes it easy to lift generated images into a common 3D frame.

The general lesson: **generate in 2D where the data is, reconstruct in 3D where consistency is needed**. That is also how scene generators work.

## 4. Scene generation by iterative inpainting and lifting

### 4.1 The loop

**Text2Room** (Höllein et al., ICCV 2023, [arXiv:2303.11989](https://arxiv.org/abs/2303.11989)) was the first to generate a room-scale textured mesh from text alone. The loop, shared by most later scene generators, is:

1. **Render** the current scene from a new camera pose. Pixels not covered by existing geometry form a mask $M$.
2. **Inpaint** the masked region with a text-conditioned 2D inpainting model (Stable Diffusion inpainting).
3. **Estimate depth** for the new image with a monocular depth network.
4. **Align** the predicted depth to the depth of the existing geometry on the known pixels (monocular depth is only defined up to scale and shift).
5. **Unproject** the new pixels into 3D and **fuse** them into the scene (a mesh in Text2Room; points or Gaussians in later work).

Drawn as a cycle:

{% include blog_figure.liquid path="assets/img/blog/world-models/04-scene-loop.svg" localized="true" width="75%" caption="The scene-growing loop shared by Text2Room, LucidDreamer, WonderJourney and WonderWorld. Every pass adds geometry for the region that the new camera sees but the scene does not yet cover; what is added stays in the scene, so later views are consistent with it by construction." %}

Text2Room splits this into a *generation* stage with carefully chosen camera trajectories, which lays out the room, and a *completion* stage that picks additional viewpoints to fill the remaining holes. Viewpoint selection matters: bad trajectories produce stretched geometry at depth discontinuities.

### 4.2 The geometry, with code

Depth alignment is a least-squares problem over the known pixels $\mathcal{K}$:

$$
(s^\ast, b^\ast) = \arg\min_{s, b} \sum_{p \in \mathcal{K}} \big(s\, \hat d_p + b - d_p\big)^2,
$$

after which a pixel $(u, v)$ with aligned depth $d = s^\ast \hat d + b^\ast$ is unprojected to the world as

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

In a real pipeline the alignment is often done per region or with a depth-completion network conditioned on the known depth, because a single global affine fit cannot repair a wrong depth *shape*. WonderWorld (below) calls its version **guided depth diffusion**.

The figure shows what the script computes.

{% include blog_figure.liquid path="assets/img/blog/world-models/04-depth-align.svg" width="75%" caption="Top: on the known pixels, scene depth is an affine function of the monocular prediction; least squares recovers $s = 2.47$, $b = 1.23$ (the true values are 2.5 and 1.2), and the error on the new pixels drops from 2.99 to 0.021. Bottom: the unprojected points in camera coordinates (OpenCV convention, $z$ forward, $y$ down; plotted with $-y$ up). Aligned new points (orange) continue the existing plane (blue); unaligned ones (grey) would float about one unit in front of the camera." %}

### 4.3 From meshes to Gaussians, and from rooms to journeys

- **LucidDreamer** (Chung et al., [arXiv:2311.13384](https://arxiv.org/abs/2311.13384), 2023; later in IEEE TVCG) runs a "dreaming" step (inpaint + depth from a new view) and an "alignment" step that merges the new points into the existing point cloud, then uses the point cloud to initialize **3D Gaussian Splatting** and optimizes it on the generated images. Its input can be text, RGB or RGB-D, and the result is a domain-free scene that renders in real time. (Not to be confused with the text-to-3D object method of the same name by Liang et al., CVPR 2024.)
- **WonderJourney** (Yu et al., CVPR 2024, [arXiv:2312.03884](https://arxiv.org/abs/2312.03884)) generates a *journey* through a long sequence of diverse but connected 3D scenes, starting from an image or text. A large language model writes the description of the next scene, a visual module builds it as a point cloud with inpainting and depth, and a vision-language model checks each result for artifacts and triggers regeneration.
- **WonderWorld** (Yu et al., CVPR 2025, [arXiv:2406.09394](https://arxiv.org/abs/2406.09394)) makes this **interactive**: a user moves the camera and types what should appear, and a new connected scene is generated in under 10 seconds on a single A6000 GPU. It uses **FLAGS** (fast layered Gaussian surfels), a geometry-based initialization that needs only a single view and little optimization, layer-wise generation to handle disocclusions, and guided depth diffusion for consistent depth. The authors note that scenes only have front-facing surfaces, so the viewing range is limited.

This family is the closest explicit analog of the interactive video world models of post 3: it is driven by a camera and text, and it grows the world as you explore, but what it grows is a **persistent 3D asset**.

## 5. 4D: adding time

A 4D world is a 3D representation plus dynamics. Two common representations: a **dynamic NeRF** (a time-conditioned field), and **deformable 3D Gaussians**, where canonical Gaussians are moved by a deformation field $\Delta\mu, \Delta q, \Delta s = D_\psi(\mu, t)$ (as in 4D Gaussian Splatting, Wu et al., CVPR 2024, [arXiv:2310.08528](https://arxiv.org/abs/2310.08528), which renders dynamic captured scenes in real time).

With time as the vertical axis, a deformable Gaussian scene looks like this:

{% include blog_figure.liquid path="assets/img/blog/world-models/04-4d-gaussians.svg" width="75%" caption="Deformable Gaussians in 2D + time: the same ten canonical Gaussians are drawn at $t = 0, 0.5, 1$, and the curves are the paths of their centres $\mu + \Delta\mu(\mu, t)$. The deformation here is a hand-written swirl plus drift standing in for a learned $D_\psi$; it also rotates each Gaussian. Rendering any time $t$ means deforming, then splatting as usual." %}

Generation again borrows priors, now including **video** diffusion models:

- **MAV3D** (Singer et al., ICML 2023, [arXiv:2301.11280](https://arxiv.org/abs/2301.11280)) was the first text-to-4D method: a dynamic NeRF optimized with SDS from a text-to-video model.
- **4D-fy** (Bahmani et al., CVPR 2024, [arXiv:2311.17984](https://arxiv.org/abs/2311.17984)) observes a trade-off: image models give good appearance and 3D structure but no motion, video models give motion but weaker appearance and structure. **Hybrid SDS** alternates gradients from both kinds of priors (plus a 3D-aware prior).
- **Align Your Gaussians** (Ling et al., CVPR 2024, [arXiv:2312.13763](https://arxiv.org/abs/2312.13763)) uses dynamic 3D Gaussians with deformation fields and composes text-to-image, text-to-video and multi-view diffusion feedback, with an autoregressive scheme to chain longer sequences.
- **Physics as the dynamics model.** Instead of distilling motion from video models, one can simulate it: **PhysGaussian** (Xie et al., CVPR 2024, [arXiv:2311.12198](https://arxiv.org/abs/2311.12198)) treats Gaussians as continuum particles and integrates them with the material point method, so that the same primitives are both simulated and rendered. This is the explicit-world answer to "video models do not know physics".

## 6. World Labs' Marble and productized world generators

World Labs released **Marble** as a limited beta in September 2025 and made it publicly available on [November 12, 2025](https://www.worldlabs.ai/blog/marble-world-model). Marble generates **persistent, downloadable 3D worlds** from text, images, video or coarse 3D layouts, rather than generating frames on the fly. According to the launch post, Gaussian splats are the highest-fidelity representation of a Marble world, and worlds can also be exported as meshes (low-fidelity collider meshes for physics and high-quality meshes). An experimental editor called **Chisel** lets users block out structure with simple shapes or imported assets and have the model fill in the appearance. No technical paper describes the model, so how it works internally is not public.

Marble is useful as a reference point because it embodies the explicit route end to end: generation produces an asset (splats + meshes) that is then consumed by ordinary graphics and game tooling. The pixel-space route (Genie 3) instead produces an *experience* that exists only while the model runs.

## 7. Trade-offs: pixels vs. explicit 3D/4D

| Criterion | Pixel-space video world model (post 3) | Explicit 3D / 4D world |
| --- | --- | --- |
| Multi-view consistency | learned, approximate; degrades with time | guaranteed by the renderer for static content |
| Memory / persistence | limited by context window | the representation *is* the memory |
| Dynamics, agents, effects | rich, learned from video (water, smoke, characters) | hard: need 4D generation or an explicit simulator |
| Physics | implicit, often wrong out of distribution | can plug into physics engines (meshes, MPM on Gaussians), but materials must be inferred |
| Editability | via prompts / world events, not precise | per-object edits, sculpting, relighting, export to engines |
| Rendering cost at runtime | a large network per frame (GPUs/TPUs) | rasterization or splatting, real time on consumer hardware and VR |
| Generality of content | anything seen in video | mostly static scenes; unbounded and dynamic content is harder |
| Interactivity with actions | native (action-conditioned) | requires a game engine or simulator around the asset |

The core of the table is where the world state lives:

{% include blog_figure.liquid path="assets/img/blog/world-models/04-explicit-vs-pixel.svg" localized="true" width="85%" caption="Where the state lives. In a pixel-space model the only state is the window of recent frames, and every frame is produced by a large network, so a revisited place is regenerated and may change. In an explicit world the state is a persistent set of primitives that a cheap renderer can draw from any camera; edits and physics act on that state directly." %}

The two routes are converging. Video models are being conditioned on explicit 3D signals (camera trajectories, point clouds, depth) to improve consistency, and explicit pipelines increasingly use video models as their prior (CAT3D-style multi-view generation, 4D-fy). A plausible research direction is a **hybrid world model**: an explicit, persistent 3D/4D state that is updated by learned dynamics and rendered either by splatting or by a generative "neural renderer" for effects the explicit state cannot represent.

## 8. Try it: an editable explicit world

The **Gaussian World** tab of the [lab on the home page]({{ '/' | relative_url }}#lab) is a toy illustration of the explicit route. Its world is made of around 200,000 3D Gaussians rendered with the 3DGS pipeline (EWA projection, depth sort, alpha compositing). You can type a prompt or pick a preset, then sculpt the terrain, paint materials, place or erase objects, flood the valley, change the time of day and walk through it in first person.

Two honest caveats. First, the generator is **procedural, not learned**: a keyword-driven program reads the prompt and builds terrain, lakes, forests and villages; a real system would replace it with a learned model such as the scene generators in Section 4. Second, its dynamics (wind, seasons, relighting) are hand-written shaders, not learned. What the demo does show well is the *benefit* of the explicit route: every edit is local, persistent and immediately consistent from every viewpoint, and rendering runs in real time in a browser, which is precisely what pixel-space world models struggle with.

A static analogue of the demo shows why edits are local:

{% include blog_figure.liquid path="assets/img/blog/world-models/04-terrain-edit.svg" caption="A procedural terrain made of 3200 Gaussian splats (height from a sum of sinusoid octaves, coloured by height), before and after a sculpt edit that raises a Gaussian bump. Only the 334 splats near the brush (red, 10%) change; everything else, and therefore every view of it, stays exactly as it was." %}

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| DreamFusion: Text-to-3D using 2D Diffusion (Poole et al.) | ICLR | 2023 | [arXiv:2209.14988](https://arxiv.org/abs/2209.14988) | Score distillation sampling |
| Magic3D: High-Resolution Text-to-3D Content Creation (Lin et al.) | CVPR | 2023 | [arXiv:2211.10440](https://arxiv.org/abs/2211.10440) | Coarse-to-fine SDS with meshes |
| ProlificDreamer: High-Fidelity and Diverse Text-to-3D Generation with Variational Score Distillation (Wang et al.) | NeurIPS | 2023 | [arXiv:2305.16213](https://arxiv.org/abs/2305.16213) | VSD fixes over-saturation and low diversity |
| Zero-1-to-3: Zero-shot One Image to 3D Object (Liu et al.) | ICCV | 2023 | [arXiv:2303.11328](https://arxiv.org/abs/2303.11328) | Camera-conditioned novel-view diffusion |
| Text2Room: Extracting Textured 3D Meshes from 2D Text-to-Image Models (Höllein et al.) | ICCV | 2023 | [arXiv:2303.11989](https://arxiv.org/abs/2303.11989) | Room-scale scene growing via inpainting + depth |
| Text-To-4D Dynamic Scene Generation (MAV3D, Singer et al.) | ICML | 2023 | [arXiv:2301.11280](https://arxiv.org/abs/2301.11280) | First text-to-4D, SDS from a video model |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al.) | SIGGRAPH / ACM TOG | 2023 | [arXiv:2308.04079](https://arxiv.org/abs/2308.04079) | The explicit representation most generators now target |
| MVDream: Multi-view Diffusion for 3D Generation (Shi et al.) | ICLR | 2024 | [arXiv:2308.16512](https://arxiv.org/abs/2308.16512) | Joint multi-view generation |
| LRM: Large Reconstruction Model for Single Image to 3D (Hong et al.) | ICLR | 2024 | [arXiv:2311.04400](https://arxiv.org/abs/2311.04400) | Feed-forward image-to-3D |
| DreamGaussian: Generative Gaussian Splatting for Efficient 3D Content Creation (Tang et al.) | ICLR | 2024 | [arXiv:2309.16653](https://arxiv.org/abs/2309.16653) | Fast SDS with Gaussians |
| LucidDreamer: Domain-free Generation of 3D Gaussian Splatting Scenes (Chung et al.) | arXiv / IEEE TVCG | 2023 | [arXiv:2311.13384](https://arxiv.org/abs/2311.13384) | Scene growing into 3DGS |
| WonderJourney: Going from Anywhere to Everywhere (Yu et al.) | CVPR | 2024 | [arXiv:2312.03884](https://arxiv.org/abs/2312.03884) | LLM-planned sequences of connected 3D scenes |
| 4D-fy: Text-to-4D Generation Using Hybrid Score Distillation Sampling (Bahmani et al.) | CVPR | 2024 | [arXiv:2311.17984](https://arxiv.org/abs/2311.17984) | Combining image and video priors for 4D |
| Align Your Gaussians: Text-to-4D with Dynamic 3D Gaussians and Composed Diffusion Models (Ling et al.) | CVPR | 2024 | [arXiv:2312.13763](https://arxiv.org/abs/2312.13763) | Dynamic Gaussians for text-to-4D |
| PhysGaussian: Physics-Integrated 3D Gaussians for Generative Dynamics (Xie et al.) | CVPR | 2024 | [arXiv:2311.12198](https://arxiv.org/abs/2311.12198) | Simulating and rendering the same Gaussians |
| CAT3D: Create Anything in 3D with Multi-View Diffusion Models (Gao et al.) | NeurIPS | 2024 | [arXiv:2405.10314](https://arxiv.org/abs/2405.10314) | Multi-view diffusion + reconstruction for scenes |
| WonderWorld: Interactive 3D Scene Generation from a Single Image (Yu et al.) | CVPR | 2025 | [arXiv:2406.09394](https://arxiv.org/abs/2406.09394) | Interactive, under-10-second scene generation |

## Learning resources

- The [threestudio](https://github.com/threestudio-project/threestudio) framework implements DreamFusion, Magic3D, ProlificDreamer, Zero-1-to-3 guidance and many other SDS variants in one codebase; it is the fastest way to experiment.
- Project pages with code: [Text2Room](https://github.com/lukasHoel/text2room), [LucidDreamer](https://luciddreamer-cvlab.github.io/), [WonderJourney](https://kovenyu.com/wonderjourney/), [WonderWorld](https://kovenyu.com/WonderWorld/), [4DGaussians](https://github.com/hustvl/4DGaussians).
- World Labs' blog posts on [Marble](https://www.worldlabs.ai/blog/marble-world-model) describe the product and its export formats.
- For the 3DGS and camera background, the Neural Rendering series on this blog; for diffusion, [post 2]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }}) and Lilian Weng's [diffusion post](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/).

## Exercises

1. Derive the SDS gradient by differentiating $\mathcal{L}_{\mathrm{diff}}$ with the chain rule and identifying the term that is dropped. Under what assumption on the U-Net Jacobian would the dropped term vanish in expectation?
2. In the SDS toy, add a classifier-free-guidance-like scale by multiplying `eps_model(x_t, t) - eps` by 5 and 20. How do the spread and mode coverage change? Relate this to the over-saturation of DreamFusion's assets.
3. Turn the toy into VSD: train a second small denoiser online on the current particles `theta` and use its prediction in place of `eps`. Does the spread approach that of the real data?
4. In the depth-alignment script, replace the planar scene by one with a step discontinuity and a monocular depth that is a nonlinear function of the truth. Where does the global affine fit fail, and how would a local fit help?
5. Take one row of the trade-off table in Section 7 and design a hybrid system that gets the best of both columns for that row. What would its training data be?

**Next:** [post 5]({{ '/blog/2026/world-models-05-jepa-evaluation-and-open-problems/' | relative_url }}) steps back from generation: JEPA and the predictive-vs-generative debate, how world models are evaluated, and the open problems that lead into embodied AI.
