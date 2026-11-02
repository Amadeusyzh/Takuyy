---
layout: post
title: "Predict, don't generate? JEPA, evaluating world models, and open problems"
date: 2026-10-27 15:05:00+0900
description: "LeCun's path towards autonomous machine intelligence, I-JEPA, V-JEPA and V-JEPA 2, the predictive-vs-generative debate, how world models are evaluated (physics, controllability, planning), and the open problems that lead into embodied AI."
categories: world-models
tags: [world-models, jepa, self-supervised-learning, evaluation, planning]
series: world-models
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## Why this matters

Posts [3]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }}) and [4]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }}) were about world models that *generate*: pixels, tokens or explicit 3D scenes. This last post of the series looks at the strongest counter-position: that an intelligent agent's world model should **predict in an abstract representation space** and never reconstruct every pixel. That is the idea behind Yann LeCun's joint-embedding predictive architectures (JEPA). We then ask the question every researcher in this area must answer: **how do we know a world model is any good?** We finish with open problems and with the bridge to the next series, embodied AI.

## Prerequisites

- Posts 1-4 of this series, in particular the Dreamer vs. MuZero contrast in [post 1]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}) (reconstruct vs. predict only what matters).
- Self-supervised learning basics: Siamese networks, contrastive learning, the representation-collapse problem, exponential-moving-average (EMA) target networks.

## 1. LeCun's "A Path Towards Autonomous Machine Intelligence"

In June 2022 LeCun circulated a long position paper, ["A Path Towards Autonomous Machine Intelligence"](https://openreview.net/forum?id=BZ5a1r-kVsf) (version 0.9.2, on OpenReview). It proposes a cognitive architecture made of differentiable modules:

| Module | Role |
| --- | --- |
| Configurator | sets up the other modules for the task at hand (executive control) |
| Perception | estimates the current state of the world from sensors |
| World model | predicts future world states, possibly for several imagined action sequences, and fills in missing information |
| Cost | an immutable **intrinsic cost** (drives such as "pain" or curiosity) plus a trainable **critic** that predicts future intrinsic cost |
| Short-term memory | stores past and predicted states and their costs |
| Actor | proposes action sequences |

The agent can act in two modes. **Mode 1** is reactive: perception feeds a policy directly. **Mode 2** is deliberate planning: the actor proposes an action sequence, the world model unrolls it, the cost module scores the predicted states, and the actions are optimized by gradient descent or search to minimize total cost, much like model-predictive control. Mode-2 results can be distilled into Mode-1 policies, as Dreamer distills imagination into an actor.

The figure arranges the six modules and the Mode-2 loop.

{% include blog_figure.liquid path="assets/img/blog/world-models/05-architecture.svg" localized="true" width="85%" caption="LeCun's proposed architecture. Perception estimates the current state $s_0$; the actor proposes an action sequence; the world model predicts the future states $\hat s_k$; the cost module scores them; short-term memory keeps states and costs. In Mode 2 the actions are optimized against the total cost (dashed red), which is model-predictive control with a learned model. The configurator (dotted) sets up all modules for the task." %}

The paper's central technical claim concerns *how the world model should be trained*. The world is only partially predictable: the exact position of every leaf on a tree in the wind is not. A generative model that must output pixels has to either model all of that irrelevant randomness or average over it (blur). LeCun argues instead for **energy-based models** trained to give low energy to compatible pairs $(x, y)$, where $x$ is the observed past and $y$ the future, and for making the prediction **in a learned representation space** in which unpredictable details can be discarded.

### 1.1 The JEPA

A **joint-embedding predictive architecture** encodes both $x$ and $y$, and predicts the *embedding* of $y$ from that of $x$, optionally with a latent variable $z$ that captures what $x$ cannot determine (or an action $a$):

$$
s_x = \mathrm{Enc}_x(x),\qquad s_y = \mathrm{Enc}_y(y),\qquad
E(x, y, z) = D\big(s_y,\ \mathrm{Pred}(s_x, z)\big).
$$

Side by side with a generative model, the difference is where the loss is computed:

{% include blog_figure.liquid path="assets/img/blog/world-models/05-jepa-vs-generative.svg" localized="true" caption="Left: a generative predictor decodes $\hat y$ and is penalized in observation space, so it must account for every pixel of $y$. Right: a JEPA encodes $y$ as well and predicts its embedding $s_y$; the target encoder is typically an EMA copy that receives no gradient, and the latent $z$ lets the predictor express several possible futures. Details of $y$ that the encoder drops never have to be predicted." %}

The danger is **representation collapse**: if the encoders output a constant, the energy is zero for every pair. Approaches to prevent it fall into two groups:

The energy view makes both the goal and the failure mode visible:

{% include blog_figure.liquid path="assets/img/blog/world-models/05-energy.svg" caption="Left: the energy over a 2D target embedding $y$ for one fixed context $x$, when the predictor's outputs for $z \in [-1, 1]$ trace an arc of compatible futures (orange; dots at $z = -1, 0, 1$). Energy is zero along the whole arc and grows away from it, so several futures can be 'right' at once. Right: with a collapsed (constant) encoder the energy is zero everywhere, for compatible and incompatible pairs alike, so it carries no information." %}

- **Contrastive** methods push up the energy of incompatible pairs (negatives). LeCun argues these scale poorly with the dimension of the representation.
- **Regularized / non-contrastive** methods limit the information content of $s_y$ or keep the representation spread out. Examples are VICReg (variance-invariance-covariance regularization), and the **asymmetric** designs of BYOL, where the target encoder is an EMA copy of the online encoder and receives no gradients.

A **hierarchical JEPA** (H-JEPA) stacks JEPAs so that higher levels predict further into the future in more abstract representations, which would support hierarchical planning.

The position paper is a research program, not an experiment. The following papers from Meta are its concrete instantiations.

## 2. I-JEPA: predicting representations of image regions

**I-JEPA** (Assran et al., "Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture", CVPR 2023, [arXiv:2301.08243](https://arxiv.org/abs/2301.08243)) applies the idea to single images, with no hand-crafted data augmentations:

1. Sample several large **target blocks** of patches and one large **context block** (with the target regions removed from it).
2. A context encoder (ViT) $f_\theta$ processes only the visible context patches.
3. A target encoder $f_{\bar\theta}$ processes the *full* image; the target representations are its output tokens at the target positions.
4. A narrow ViT **predictor** $g_\phi$ takes the context tokens plus mask tokens with positional embeddings for a target block, and predicts that block's representations.

The figure shows three masks drawn with the sampling ranges reported in the I-JEPA paper.

{% include blog_figure.liquid path="assets/img/blog/world-models/05-ijepa-masks.svg" caption="I-JEPA masks on a $16 \times 16$ patch grid (ViT-H/14 at 224 px). Four target blocks (outlined colours) with scale 0.15-0.2 of the image and aspect ratio 0.75-1.5; one context block (blue) with scale 0.85-1.0, from which the target regions are removed. The predictor must produce the target encoder's tokens inside each outlined block from the blue patches alone." %}

The loss is an L2 distance in representation space, averaged over the $M$ target blocks $B_i$:

$$
\mathcal{L} = \frac{1}{M}\sum_{i=1}^{M} \sum_{j \in B_i} \big\lVert \hat s_{y}(j) - s_{y}(j) \big\rVert_2^2 ,
$$

and the target encoder is an EMA of the context encoder, $\bar\theta \leftarrow m\,\bar\theta + (1 - m)\,\theta$, with no gradient flowing into it. The **masking strategy** turned out to be essential: targets must be large enough to be semantic, and the context must be informative and spatially distributed. Compared with pixel-reconstruction methods such as MAE (He et al., CVPR 2022), I-JEPA learned more semantic off-the-shelf features (better linear probing) with less compute.

## 3. V-JEPA and V-JEPA 2: from video understanding to planning

### 3.1 V-JEPA

**V-JEPA** (Bardes et al., "Revisiting Feature Prediction for Learning Visual Representations from Video", TMLR 2024, [arXiv:2404.08471](https://arxiv.org/abs/2404.08471)) extends the recipe to video with spatiotemporal masks (masked regions extend across time, so the model cannot copy from neighboring frames) and an L1 loss in feature space. Trained on about 2 million public videos with no text, negatives, pretrained image encoders or pixel reconstruction, its frozen features were particularly strong on motion-centric tasks such as Something-Something v2, and the paper reports that feature prediction is more label-efficient than pixel prediction.

A follow-up study (Garrido et al., "Intuitive physics understanding emerges from self-supervised pretraining on natural videos", 2025, [arXiv:2502.11831](https://arxiv.org/abs/2502.11831)) used the **violation-of-expectation** paradigm from developmental psychology: show physically possible and impossible versions of the same video and measure the model's "surprise", its prediction error in representation space. V-JEPA models were reliably more surprised by impossible events on IntPhys, GRASP and InfLevel, while pixel-generative video models and multimodal LLMs tested in the same study performed close to chance. The authors also note that not every intuitive-physics property is learned well.

### 3.2 V-JEPA 2 and V-JEPA 2-AC

**V-JEPA 2** (Assran et al., "V-JEPA 2: Self-Supervised Video Models Enable Understanding, Prediction and Planning", 2025, [arXiv:2506.09985](https://arxiv.org/abs/2506.09985)) scales the approach to over a million hours of internet video plus images and adds the missing ingredient for a world model: **actions**.

1. **Action-free pre-training** of the encoder and predictor on internet video (the V-JEPA objective at scale).
2. **Action-conditioned post-training**: the encoder is frozen and a new predictor, **V-JEPA 2-AC**, is trained on less than 62 hours of unlabeled robot videos (from the DROID dataset) to predict the next frame's representation from the current representation, the robot's end-effector state and the action.
3. **Planning**: given a goal image, the robot encodes it, and at each step searches (with the cross-entropy method) for an action sequence whose predicted final representation is closest to the goal representation in L1 distance, executes the first action and re-plans (MPC):

$$
a^\ast_{1:H} = \arg\min_{a_{1:H}} \Big\lVert \hat s_{H}(s_0, a_{1:H}) - s_{\mathrm{goal}} \Big\rVert_1, \qquad \hat s_{k} = P_\phi(\hat s_{k-1}, a_k).
$$

The paper reports zero-shot pick-and-place with Franka arms in two labs that were not in the training data, using only image goals. This is the JEPA program in its most complete form so far: a world model learned mostly from passive video, adapted to control with a small amount of interaction data, and used for planning in latent space.

*Update (November 2026):* V-JEPA 2.1 (March 2026) adds dense features and reports a 20-point gain in real-robot grasping over V-JEPA 2-AC. LeWorldModel (March 2026) trains a JEPA world model end to end from pixels. See the 2025-2026 update section near the end of this post.

The figure runs the same procedure on a toy 2D latent space, where the L1 objective has diamond-shaped level sets.

{% include blog_figure.liquid path="assets/img/blog/world-models/05-latent-planning.svg" caption="Toy latent planning with the objective above. The predictor is $\hat s_k = \hat s_{k-1} + a_k$ (each action component clipped to $\pm 0.45$), and states cannot enter the grey disc; grey diamonds are level sets of the L1 distance to the goal (star). Left: CEM over $H = 8$ actions (200 samples, 20 elites, 8 iterations) ends at L1 distance 0.23 from the goal. Right: MPC executes only the first action and re-plans; after 25 steps it is 0.15 from the goal." %}

### 3.3 Related latent-space planners

- **DINO-WM** (Zhou et al., ICML 2025, [arXiv:2411.04983](https://arxiv.org/abs/2411.04983)) freezes pre-trained DINOv2 patch features and trains only a latent dynamics model on offline trajectories; planning to an image goal with MPC works zero-shot across several manipulation and navigation tasks. It shows that a good frozen visual representation plus a small predictor can be enough, a strong argument for the "predict features, not pixels" view.
- **Navigation World Models** (Bar et al., CVPR 2025, [arXiv:2412.03572](https://arxiv.org/abs/2412.03572)) is the generative counterpoint from the same research circle: a 1B-parameter conditional diffusion Transformer predicts future egocentric *frames* from past frames and navigation actions, and is used to plan by simulating and ranking candidate trajectories.

## 4. The predictive-vs-generative debate

| Aspect | Generative (pixels / tokens) | Predictive (JEPA-style latent) |
| --- | --- | --- |
| Training signal | reconstruct or generate observations | match target representations |
| Unpredictable details | must be modeled (diffusion) or averaged (blur) | can be dropped by the encoder |
| Collapse risk | none (pixels anchor the representation) | real; needs EMA, stop-gradient or variance regularization |
| Inspectable output | yes: you can watch the rollout | no: you need probes or a separate decoder |
| Use as a simulator for humans / data generation | natural (Genie, Cosmos) | not directly |
| Compute per prediction | high (many denoising steps, many pixels) | low (a forward pass in a compact space) |
| What the representation learns | everything needed to render, including texture and lighting | what is predictable and shared across views and time |
| Representative systems | Dreamer (with reconstruction), GameNGen, Genie, Sora, NWM | MuZero (value-equivalent), TD-MPC2, I-JEPA, V-JEPA 2-AC, DINO-WM |

A few observations to keep the debate honest:

- **The lines blur.** Latent diffusion models generate in a learned latent space, and their autoencoders already discard imperceptible detail. Dreamer reconstructs pixels but plans in a compact latent. JEPA-style models can be paired with a decoder for visualization.
- **It depends on the use.** If the goal is a simulator for humans (games, VR, content creation, synthetic data), pixels are the product. If the goal is control, the evidence from MuZero, TD-MPC2, DINO-WM and V-JEPA 2-AC suggests that reconstruction is unnecessary and possibly harmful.
- **Collapse is the price of not reconstructing.** Every non-generative world model needs a mechanism that keeps the representation informative: reward and value prediction (MuZero), EMA targets (I-JEPA), frozen pre-trained encoders (DINO-WM), or explicit variance regularization (VICReg).

### 4.1 Code: collapse and how EMA targets prevent it

The toy below makes the collapse problem tangible. The "observations" are 1D signals $\sin(\omega u + \varphi)$ with random frequency and phase; the context $x$ is the first half of the signal and the target $y$ is the second half. A JEPA predicts the embedding of $y$ from the embedding of $x$. We compare three variants and report the per-dimension standard deviation of the embeddings across a batch (near zero means collapse) and how well a linear probe on the embedding recovers the hidden frequency $\omega$.

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

With a shared encoder and gradients through both branches, the easiest way to drive the loss to zero is to map everything to the same point, and the embedding standard deviation shrinks toward zero. The asymmetric EMA target slows this dynamic down, and the variance term rules collapse out explicitly; compare how much information about $\omega$ each variant keeps. Exact numbers depend on the seed and the number of steps, which is itself a lesson: collapse is a training *dynamic*, not just a property of the loss.

We ran the script above and also logged the embedding spread during training:

{% include blog_figure.liquid path="assets/img/blog/world-models/05-collapse.svg" caption="Output of the collapse toy. Top: mean per-dimension standard deviation of $s_x$ during training (log scale). Bottom: the first two principal components of 1500 embeddings, coloured by the hidden frequency $\omega$. With a shared encoder and no stop-gradient the spread falls to 0.002 and a linear probe recovers nothing about $\omega$ ($R^2 = 0.01$). The EMA target keeps the embeddings spread out ($R^2 = 0.82$), and the variance hinge pushes the spread up further without changing $R^2$ in this run." %}

## 5. How are world models evaluated?

There is no single accepted benchmark. It helps to separate five questions.

As a rough map, the figure shows where the three families of world models discussed in this series tend to be strong or weak on these five questions.

{% include blog_figure.liquid path="assets/img/blog/world-models/05-eval-radar.svg" localized="true" width="75%" caption="Qualitative only, not measured scores: our reading of the trade-off table in post 4 and of Sections 3 and 5 here. Pixel video models look best but have limited memory and physics; explicit 3D worlds are consistent by construction but need a simulator for dynamics and actions; JEPA-style latent models produce nothing to look at (0 on that axis) but are cheap and effective for planning." %}

### 5.1 Does it look right? (perceptual quality)

Frame-level FID, video-level **FVD** (Fréchet video distance), and suites such as **VBench** (Huang et al., CVPR 2024, [arXiv:2311.17982](https://arxiv.org/abs/2311.17982)), which break video quality into dimensions like subject consistency, motion smoothness and aesthetic quality. These are necessary but weak: a model can score well while violating physics.

### 5.2 Does it obey physics?

- **Violation of expectation**: IntPhys (Riochet et al.), GRASP and InfLevel test whether a model is "surprised" by impossible events (Section 3.1).
- **Physion** (Bear et al., NeurIPS 2021 Datasets and Benchmarks, [arXiv:2106.08261](https://arxiv.org/abs/2106.08261)): predict whether two objects will touch in simulated scenes with collisions, stacking, rolling, draping and more, with human data for comparison.
- **Physics-IQ** (Motamed et al., WACV 2026, [arXiv:2501.09038](https://arxiv.org/abs/2501.09038)): real videos of physical events; the model sees the beginning and must continue it, and its continuation is compared with the real future in where, when and how much motion occurs. Its headline finding is that physical understanding in current video generators is severely limited and not explained by visual realism.
- **Controlled synthetic studies** such as Kang et al. (ICML 2025, [arXiv:2411.02385](https://arxiv.org/abs/2411.02385)) separate in-distribution, combinatorial and out-of-distribution generalization (post 3).

### 5.3 Does it respond to actions? (controllability)

An interactive world model must make actions *matter*. Genie measures this with $\Delta_t\mathrm{PSNR}$: the difference between the PSNR of frames generated with the latent actions inferred from the real video and frames generated with randomly sampled actions, both compared with the real frames. If the model ignores actions, the difference is zero. Other common checks: train an inverse dynamics model on real data and test whether it recovers the commanded action from generated frames, or measure the error in the resulting camera or agent pose.

### 5.4 Is it consistent over time? (memory)

Revisit tests: move away and come back along the same path, and compare the two views of the same place (PSNR/LPIPS, or feature matching). Loop closures and 3D reconstruction from the generated video (run SfM and look at reprojection error) test geometric consistency. Explicit 3D worlds (post 4) pass these by construction for static content.

### 5.5 Is it useful? (downstream tasks)

Ultimately a world model is a tool, and the best evaluation is what it enables:

- **Planning success**: goal-reaching rate when planning with the model (DINO-WM, V-JEPA 2-AC, NWM).
- **Policy learning in imagination**: return of an agent trained only inside the model, evaluated in the real environment (Dreamer, DIAMOND, UniSim).
- **Policy evaluation**: does the success rate of different policies *inside* the model rank them the same way as real-world trials? A model that ranks policies correctly can replace expensive robot evaluation even if its videos are imperfect.
- **Data generation**: does training on synthetic data from the model improve a downstream perception or driving system (the Cosmos and GAIA-1 use case)?

A minimal sketch of the controllability metric, written so that you can plug in any frame generator:

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

The controllable toy model gets a large positive $\Delta\mathrm{PSNR}$ (perfect predictions with true actions are clamped by the `1e-10` floor, so the value is large but finite), and the model that ignores actions gets exactly zero.

The figure shows what the metric compares for one example of the toy:

{% include blog_figure.liquid path="assets/img/blog/world-models/05-delta-psnr.svg" caption="One example from the toy check. With the true actions the controllable model reproduces the real frame exactly (PSNR hits the $10^{-10}$ MSE floor, 100 dB); with random actions the texture is shifted to the wrong place (7.3 dB). A model that ignores actions returns the first frame in both cases, so its two PSNRs are equal and $\Delta\mathrm{PSNR} = 0$." %}

## 6. Open problems and research directions

1. **Memory and persistence.** How should a world model remember a world it has seen for an hour? Candidates: longer contexts with compression, retrieval by pose, explicit 3D/4D state (post 4), or learned latent maps.
2. **Physical and causal grounding.** Video data shows correlations; physics requires interventions. Promising ingredients: interaction data from robots and simulators, physics-based inductive biases (particles, simulators in the loop as in PhysGaussian), and evaluation that tests out-of-distribution laws.
3. **A shared action interface.** Keyboard inputs, latent actions, end-effector deltas, language: a world model that transfers across embodiments needs actions that mean the same thing across datasets. Latent action models (post 3) are a start.
4. **Uncertainty.** Planning against a confident but wrong model is dangerous (post 1's model exploitation). Calibrated epistemic uncertainty at scale is largely unsolved for large video models.
5. **Choosing the prediction target.** Pixels, latent tokens, self-supervised features, or task quantities? Hybrid objectives (e.g. a JEPA-style latent dynamics model plus a lightweight decoder for inspection) are under-explored.
6. **Evaluation that predicts usefulness.** Benchmarks that correlate with downstream planning and policy-evaluation performance, rather than with visual quality.
7. **Efficiency.** Real-time, high-resolution, long-horizon generation on a single device; this is also where graphics knowledge (level of detail, caching, foveation, explicit primitives) can contribute.
8. **Multi-agent and social worlds.** Most current models simulate one controllable agent; other agents with their own goals are treated as noise.

For a researcher at the intersection of graphics, XR/HCI and embodied AI, items 1, 5 and 7 are particularly natural: explicit representations, perception-aware rendering, and interactive evaluation with humans in the loop.

## 7. Bridge to embodied AI

World models matter most where actions have consequences in the physical world. The next series on this blog, [Embodied AI]({{ '/blog/category/embodied-ai/' | relative_url }}), starts from robotics basics and simulation, and then returns to the ideas of this series from the robot's side: world models as simulators for sim-to-real transfer, as policy evaluators, as planners (as in V-JEPA 2-AC and DINO-WM), and as the "imagination" inside vision-language-action models.

## 2025-2026 update (as of November 2026)

This section adds JEPA and evaluation work from mid-2025 to early November 2026, plus a short, clearly labelled list of public claims. All works were checked against their arXiv pages or official posts in November 2026. "Preprint" means not yet published at a venue. The timeline widget (filters "JEPA" and "evaluation") lists every entry.

{% include widget.liquid name="world-models-timeline" height="560" caption="Try it: use the 'JEPA' and 'evaluation' buttons to see this post's entries; tap a dot for its summary, status and link. Notice the burst of evaluation papers in 2026: benchmarks arrive about a year after the systems they measure." %}

### The JEPA line after V-JEPA 2

- **V-JEPA 2.1** (Mur-Labadia et al., preprint, [arXiv:2603.14482](https://arxiv.org/abs/2603.14482), March 2026) answers a known weakness of V-JEPA 2: its features were strong for global understanding but weak for *dense*, per-location tasks. The fix is to add dense prediction losses and to train jointly on images and video. The paper reports better dense features and scaling from 1B to 2B parameters. Relevant to section 3.2, it also reports a 20-point gain in real-robot grasping success over V-JEPA 2-AC. Dense features matter for planning because manipulation depends on *where* things are, not only on what is in the scene.
- **LeJEPA** (Balestriero and LeCun, preprint, [arXiv:2511.08544](https://arxiv.org/abs/2511.08544), November 2025) attacks the collapse problem of section 4.1 from theory. The paper argues that the embedding distribution which minimizes downstream prediction risk is an **isotropic Gaussian**. It then enforces that distribution with **SIGReg** (Sketched Isotropic Gaussian Regularization): project the batch of embeddings onto random directions $u$ and penalize how far each one-dimensional projection $u^\top z$ is from a standard normal, using a univariate statistical test. Because a distribution is determined by all its one-dimensional projections (the Cramér-Wold theorem), matching enough random projections pushes the whole distribution toward the target. This removes the heuristics that the collapse toy needed: no EMA teacher, no stop-gradient, and a single trade-off hyperparameter. Compare it with VICReg (section 4.1), which matches only the first two moments (variance and covariance), while SIGReg matches the whole distribution along each sampled direction.
- **LeWorldModel** (Maes et al., preprint, [arXiv:2603.19312](https://arxiv.org/abs/2603.19312), March 2026) applies the same idea to a *world model*. It is a JEPA trained end to end from raw pixels, with only two loss terms, so the number of loss hyperparameters drops from six to one. With about 15M parameters it trains on one GPU in a few hours, and the authors report planning up to 48x faster than world models built on large pretrained encoders. Earlier latent planners (DINO-WM, section 3.3) relied on a frozen foundation encoder because end-to-end JEPA training was unstable. LeWorldModel claims that this crutch is no longer needed.
- **VL-JEPA** (Chen et al., preprint, [arXiv:2512.10942](https://arxiv.org/abs/2512.10942), December 2025) carries the JEPA principle over to vision-language. The model predicts continuous *embeddings* of the target text instead of generating tokens, and decodes to text only when needed. In a controlled comparison it beats a token-space baseline with 50% fewer trainable parameters.
- **DINO-world** (Baldassarre et al., preprint, [arXiv:2507.19468](https://arxiv.org/abs/2507.19468), July 2025) sits between the two camps of section 4. It is a generalist video world model that predicts future frames in the feature space of a frozen DINOv2 encoder, an "in-between" target that is neither pixels nor learned-from-scratch latents.

The **predictive-vs-generative debate** (section 4) did not end, but its terms shifted. Latent-space prediction gained stable, simpler training recipes (LeJEPA, LeWorldModel) and dense features (V-JEPA 2.1). Meanwhile, generative video models became real-time and controllable (post 3's update), and the largest industrial models, such as Cosmos 3, now combine a reasoning model and a generator in one system.

### Evaluation: from "does it look right" to "is it useful"

Section 5 split evaluation into five questions. The 2025-2026 benchmarks mostly target questions 5.2 (physics), 5.3 (control) and 5.4 (memory), and the first closed-loop benchmarks target 5.5. The figure maps each benchmark to the questions it explicitly measures.

{% include blog_figure.liquid path="assets/img/blog/world-models/05-update-benchmarks.svg" width="85%" caption="Which of the five questions of Section 5 (columns 5.1 quality, 5.2 physics, 5.3 control, 5.4 memory, 5.5 usefulness) each benchmark explicitly scores, according to its abstract. Filled dots are named evaluation dimensions; hollow dots are partial (text-instruction following in WorldModelBench, 'dynamics' in WorldScore). Benchmarks above the dashed line are from 2024-2025, below it from 2026. Physics (column 5.2) is crowded; memory and usefulness have only two benchmarks each." %}

**Physics (5.2).** *WorldModelBench* (Li et al., preprint, [arXiv:2502.20694](https://arxiv.org/abs/2502.20694)) judges video generators as world models on instruction following and physics adherence, using a fine-tuned vision-language judge. *VideoPhy-2* (Bansal et al., preprint, [arXiv:2503.06800](https://arxiv.org/abs/2503.06800)) focuses on action-centric physical commonsense. *IntPhys 2* (Bordes et al., preprint, [arXiv:2506.09849](https://arxiv.org/abs/2506.09849)) brings violation-of-expectation tests (section 5.2) to complex synthetic scenes, and reports models performing close to chance. *World Models' Last Exam in Physics* (Gao et al., preprint, [arXiv:2610.08791](https://arxiv.org/abs/2610.08791), October 2026) uses 40 measurement-based tasks across mechanics, optics, fluids, thermal effects, electromagnetism and surface tension. Each task pairs a start image and prompt with physical criteria, so no reference video is needed. Across eight video generators and 1,280 videos, the best scored 57.76 out of 100.

**Control (5.3).** *WorldScore* (Duan et al., ICCV 2025, [arXiv:2504.00983](https://arxiv.org/abs/2504.00983)) treats world generation as a sequence of next-scene generations along a specified camera path and scores controllability, quality and dynamics. *WorldMark* (Xu et al., preprint, [arXiv:2604.21686](https://arxiv.org/abs/2604.21686), April 2026) solves the "no shared action interface" problem of section 6 for evaluation. Per-model adapters translate the same WASD-style inputs for ten interactive models across 500 cases. It adds control-systems metrics (direction accuracy, response latency, motion stability) and finds that the fastest responders are often the least stable.

**Memory and persistent state (5.4).** *WBench* (Ying et al., preprint, [arXiv:2605.25874](https://arxiv.org/abs/2605.25874), May 2026) is multi-turn: 289 cases, 1,058 interaction turns and 22 automatic sub-metrics across quality, setting and interaction adherence, consistency and physics. Among 20 models, no single one leads on every dimension. *WRBench* ("Current World Models Lack a Persistent State Core", Lu et al., preprint, [arXiv:2606.20545](https://arxiv.org/abs/2606.20545), June 2026) uses camera motion to *hide* an ongoing event and checks whether it kept evolving while unseen. Across 9,600 videos from 23 models, models typically resume the event in the state it was left in. This is a sharper version of the revisit test in section 5.4: remembering appearance is not the same as simulating state.

**Usefulness (5.5).** *World-in-World* (Zhang et al., ICLR 2026 oral, [arXiv:2510.18135](https://arxiv.org/abs/2510.18135)) places world models in a closed loop with an embodied agent and scores them by task success rather than visual quality. *WorldArena 2.0* (Li et al., preprint, [arXiv:2605.17912](https://arxiv.org/abs/2605.17912), May 2026) extends embodied world-model benchmarking to visuotactile inputs, to world models used as reinforcement-learning environments, and to several simulated and real robots. Closed-loop scores are what section 6, item 6 asked for: evaluation that predicts usefulness.

A complementary probe: *Video models are zero-shot learners and reasoners* (Wiedemer et al., preprint, [arXiv:2509.20328](https://arxiv.org/abs/2509.20328)) tests Veo 3 on perception, modeling, manipulation and reasoning tasks it was never trained for. It argues that video models may become general vision foundation models, much as LLMs did for language.

### Public claims by labs and startups (company statements, not peer-reviewed)

The following are claims from official announcements. They are listed so you can recognise them, not because they have been independently verified.

- **Google DeepMind, Genie 4** ([27 October 2026](https://deepmind.google/blog/genie-4-a-new-generation-of-world-simulation/)): better physics and human characters than Genie 3, native audio, real-time language steering. No benchmark table, resolution or frame rate was published.
- **NVIDIA, Cosmos 3** ([1 June 2026](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Launches-Cosmos-3-the-Open-Frontier-Foundation-Model-for-Physical-AI/default.aspx)): first place among open models on several world-generation leaderboards (including Physics-IQ), action-policy leaderboards and vision-understanding leaderboards.
- **World Labs, Atlas** ([1 September 2026](https://worldlabs.ai/blog/atlas)): human raters preferred Atlas over five video models in 75% to 94% of comparisons, and its 3D reconstruction error was lower than the baselines in the post's chart.
- **Wayve, GAIA-4** ([3 August 2026](https://wayve.ai/thinking/gaia-4/)): training GAIA for scene reconstruction improved how faithfully it preserves the recorded world by 2.5x.
- **AMI Labs.** In December 2025 Yann LeCun confirmed a new world-model startup, Advanced Machine Intelligence (AMI Labs), with himself as executive chairman ([TechCrunch, 19 December 2025](https://techcrunch.com/2025/12/19/yann-lecun-confirms-his-new-world-model-startup-reportedly-seeks-5b-valuation)). Its stated goal is world models as an alternative to LLMs, in line with the position paper of section 1. No technical results were public as of November 2026.

### What changed in sections 5 and 6

- Open problem 1 (memory) became the main research front of video world models (post 3's update), and WRBench showed that *dynamic* persistence is still missing.
- Open problem 3 (shared action interface) is partly bypassed for evaluation by adapters (WorldMark). For robots it is being addressed by joint video-action models (post 1's update).
- Open problem 6 (evaluation that predicts usefulness) now has its first closed-loop benchmarks (World-in-World, WorldArena 2.0). Whether their scores correlate across tasks and robots is the next question.
- Surveys and position papers to orient yourself: *A Definition and Roadmap for World Models* (Chen et al., [arXiv:2607.06401](https://arxiv.org/abs/2607.06401)) and *A Tutorial on World Models and Physical AI* (Oh, [arXiv:2606.12783](https://arxiv.org/abs/2606.12783)), both 2026 preprints.

For how JEPA-style and generative world models are used inside robots, continue with the [embodied-AI series]({{ '/blog/category/embodied-ai/' | relative_url }}). For how engines and simulators serve as the ground truth that these benchmarks rely on, see [graphics-engine post 5]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }}).

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| A Path Towards Autonomous Machine Intelligence (LeCun) | OpenReview (position paper) | 2022 | [OpenReview](https://openreview.net/forum?id=BZ5a1r-kVsf) | Modular architecture, energy-based models, JEPA |
| Bootstrap Your Own Latent (BYOL, Grill et al.) | NeurIPS | 2020 | [arXiv:2006.07733](https://arxiv.org/abs/2006.07733) | EMA target networks avoid collapse without negatives |
| VICReg: Variance-Invariance-Covariance Regularization for Self-Supervised Learning (Bardes, Ponce, LeCun) | ICLR | 2022 | [arXiv:2105.04906](https://arxiv.org/abs/2105.04906) | Explicit anti-collapse regularization |
| Masked Autoencoders Are Scalable Vision Learners (MAE, He et al.) | CVPR | 2022 | [arXiv:2111.06377](https://arxiv.org/abs/2111.06377) | The pixel-reconstruction baseline JEPA argues against |
| Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture (I-JEPA, Assran et al.) | CVPR | 2023 | [arXiv:2301.08243](https://arxiv.org/abs/2301.08243) | Feature prediction for images |
| Revisiting Feature Prediction for Learning Visual Representations from Video (V-JEPA, Bardes et al.) | TMLR | 2024 | [arXiv:2404.08471](https://arxiv.org/abs/2404.08471) | Feature prediction for video |
| Intuitive physics understanding emerges from self-supervised pretraining on natural videos (Garrido et al.) | arXiv | 2025 | [arXiv:2502.11831](https://arxiv.org/abs/2502.11831) | Violation-of-expectation evaluation of V-JEPA |
| V-JEPA 2: Self-Supervised Video Models Enable Understanding, Prediction and Planning (Assran et al.) | arXiv | 2025 | [arXiv:2506.09985](https://arxiv.org/abs/2506.09985) | Action-conditioned latent world model for zero-shot robot planning |
| DINO-WM: World Models on Pre-trained Visual Features enable Zero-shot Planning (Zhou et al.) | ICML | 2025 | [arXiv:2411.04983](https://arxiv.org/abs/2411.04983) | Planning on frozen DINOv2 features |
| Navigation World Models (Bar et al.) | CVPR | 2025 | [arXiv:2412.03572](https://arxiv.org/abs/2412.03572) | Generative (diffusion) world model for navigation planning |
| Physion: Evaluating Physical Prediction from Vision in Humans and Machines (Bear et al.) | NeurIPS Datasets and Benchmarks | 2021 | [arXiv:2106.08261](https://arxiv.org/abs/2106.08261) | Physical prediction benchmark with human data |
| VBench: Comprehensive Benchmark Suite for Video Generative Models (Huang et al.) | CVPR | 2024 | [arXiv:2311.17982](https://arxiv.org/abs/2311.17982) | Multi-dimensional video quality evaluation |
| Do generative video models understand physical principles? (Physics-IQ, Motamed et al.) | WACV | 2026 | [arXiv:2501.09038](https://arxiv.org/abs/2501.09038) | Visual realism does not imply physical understanding |
| WorldModelBench: Judging Video Generation Models As World Models (Li et al.) | preprint | 2025 | [arXiv:2502.20694](https://arxiv.org/abs/2502.20694) | Instruction following and physics adherence |
| VideoPhy-2: A Challenging Action-Centric Physical Commonsense Evaluation in Video Generation (Bansal et al.) | preprint | 2025 | [arXiv:2503.06800](https://arxiv.org/abs/2503.06800) | Action-centric physical commonsense |
| WorldScore: A Unified Evaluation Benchmark for World Generation (Duan et al.) | ICCV | 2025 | [arXiv:2504.00983](https://arxiv.org/abs/2504.00983) | Camera-specified next-scene generation |
| IntPhys 2: Benchmarking Intuitive Physics Understanding In Complex Synthetic Environments (Bordes et al.) | preprint | 2025 | [arXiv:2506.09849](https://arxiv.org/abs/2506.09849) | Violation of expectation in complex scenes |
| Back to the Features: DINO as a Foundation for Video World Models (Baldassarre et al.) | preprint | 2025 | [arXiv:2507.19468](https://arxiv.org/abs/2507.19468) | Prediction in frozen DINOv2 feature space |
| Video models are zero-shot learners and reasoners (Wiedemer et al.) | preprint | 2025 | [arXiv:2509.20328](https://arxiv.org/abs/2509.20328) | Veo 3 probed on untrained vision tasks |
| World-in-World: World Models in a Closed-Loop World (Zhang et al.) | ICLR (oral) | 2026 | [arXiv:2510.18135](https://arxiv.org/abs/2510.18135) | Closed-loop, task-success evaluation |
| LeJEPA: Provable and Scalable Self-Supervised Learning Without the Heuristics (Balestriero, LeCun) | preprint | 2025 | [arXiv:2511.08544](https://arxiv.org/abs/2511.08544) | SIGReg replaces EMA and stop-gradient |
| VL-JEPA: Joint Embedding Predictive Architecture for Vision-language (Chen et al.) | preprint | 2025 | [arXiv:2512.10942](https://arxiv.org/abs/2512.10942) | Predicting text embeddings instead of tokens |
| LeWorldModel: Stable End-to-End Joint-Embedding Predictive Architecture from Pixels (Maes et al.) | preprint | 2026 | [arXiv:2603.19312](https://arxiv.org/abs/2603.19312) | End-to-end JEPA world model, two losses |
| V-JEPA 2.1: Unlocking Dense Features in Video Self-Supervised Learning (Mur-Labadia et al.) | preprint | 2026 | [arXiv:2603.14482](https://arxiv.org/abs/2603.14482) | Dense features; better robot grasping |
| WorldMark: A Unified Benchmark Suite for Interactive Video World Models (Xu et al.) | preprint | 2026 | [arXiv:2604.21686](https://arxiv.org/abs/2604.21686) | Shared controls via adapters; control metrics |
| WorldArena 2.0 (Li et al.) | preprint | 2026 | [arXiv:2605.17912](https://arxiv.org/abs/2605.17912) | Embodied, multi-platform world-model benchmark |
| WBench: A Comprehensive Multi-turn Benchmark for Interactive Video World Model Evaluation (Ying et al.) | preprint | 2026 | [arXiv:2605.25874](https://arxiv.org/abs/2605.25874) | Multi-turn interactive evaluation |
| Current World Models Lack a Persistent State Core (WRBench, Lu et al.) | preprint | 2026 | [arXiv:2606.20545](https://arxiv.org/abs/2606.20545) | Off-screen dynamics are not simulated |
| World Models' Last Exam in Physics (Gao et al.) | preprint | 2026 | [arXiv:2610.08791](https://arxiv.org/abs/2610.08791) | Measurement-based physics tasks |

## Learning resources

- Code: [I-JEPA](https://github.com/facebookresearch/ijepa), [V-JEPA](https://github.com/facebookresearch/jepa), [V-JEPA 2](https://github.com/facebookresearch/vjepa2), [intuitive-physics evaluation](https://github.com/facebookresearch/jepa-intuitive-physics), [DINO-WM](https://github.com/gaoyuezhou/dino_wm), [Physics-IQ benchmark](https://github.com/google-deepmind/physics-IQ-benchmark).
- LeCun's position paper itself is long but readable; sections on the architecture and on energy-based models are the core.
- For self-supervised learning background: Balestriero et al., "A Cookbook of Self-Supervised Learning" (2023), and the relevant chapters of S. Prince, *Understanding Deep Learning* ([udlbook.github.io/udlbook](https://udlbook.github.io/udlbook/)).
- Stanford [CS236](https://deepgenerativemodels.github.io/) for the generative side of the debate.

## Exercises

1. In the collapse toy, remove the EMA (copy the online encoder's weights into the target every step, but keep the stop-gradient). Does it collapse? What does this tell you about the role of the predictor and of the EMA?
2. Add a decoder that reconstructs $y$ from $\mathrm{Pred}(s_x)$ and train it jointly (a generative auxiliary loss). Compare the linear-probe $R^2$ with and without it. When would you expect reconstruction to help, and when to hurt?
3. Write the V-JEPA 2-AC planning objective as a CEM loop (sample, roll out the predictor, score by L1 distance to the goal embedding, refit). Reuse the CEM description from post 1.
4. Design a revisit-consistency metric for a video world model: specify the camera path, the comparison metric and a baseline that would score perfectly by cheating. How do you rule out the cheat?
5. Pick one open problem from Section 6 and write a half-page research proposal: hypothesis, minimal experiment, and how you would evaluate it.
6. (2025-2026 update) In the collapse toy of Section 4.1, a fully collapsed encoder maps every input to the same vector $c$. Explain what every one-dimensional projection $u^\top z$ looks like in that case, and why a SIGReg-style penalty (compare each projection with $\mathcal{N}(0, 1)$) is large. Then consider a "dimensional collapse" where embeddings vary only along one direction $e_1$. Which random directions $u$ detect it, and why do enough random directions always catch it?

<details markdown="1"><summary>Hint</summary>

Under full collapse every projection is the constant $u^\top c$, a point mass with zero variance, which is far from a unit Gaussian for every $u$. Under dimensional collapse, $u^\top z = (u^\top e_1)\, z_1$ has variance $(u^\top e_1)^2 \operatorname{Var}(z_1)$. In high dimension this is close to zero for most random $u$, so most directions see a near-constant projection and are penalized. By Cramér-Wold, if all one-dimensional projections matched $\mathcal{N}(0,1)$, the distribution would be exactly $\mathcal{N}(0, I)$.

</details>

**Next:** this is the last post of the World Models series. Continue with the [Embodied AI]({{ '/blog/category/embodied-ai/' | relative_url }}) series, or go back to [post 1]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}) for the foundations.
