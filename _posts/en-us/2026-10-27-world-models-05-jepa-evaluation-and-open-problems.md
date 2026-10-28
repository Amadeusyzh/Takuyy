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

The paper's central technical claim concerns *how the world model should be trained*. The world is only partially predictable: the exact position of every leaf on a tree in the wind is not. A generative model that must output pixels has to either model all of that irrelevant randomness or average over it (blur). LeCun argues instead for **energy-based models** trained to give low energy to compatible pairs $(x, y)$, where $x$ is the observed past and $y$ the future, and for making the prediction **in a learned representation space** in which unpredictable details can be discarded.

### 1.1 The JEPA

A **joint-embedding predictive architecture** encodes both $x$ and $y$, and predicts the *embedding* of $y$ from that of $x$, optionally with a latent variable $z$ that captures what $x$ cannot determine (or an action $a$):

$$
s_x = \mathrm{Enc}_x(x),\qquad s_y = \mathrm{Enc}_y(y),\qquad
E(x, y, z) = D\big(s_y,\ \mathrm{Pred}(s_x, z)\big).
$$

The danger is **representation collapse**: if the encoders output a constant, the energy is zero for every pair. Approaches to prevent it fall into two groups:

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

## 5. How are world models evaluated?

There is no single accepted benchmark. It helps to separate five questions.

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

**Next:** this is the last post of the World Models series. Continue with the [Embodied AI]({{ '/blog/category/embodied-ai/' | relative_url }}) series, or go back to [post 1]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}) for the foundations.
