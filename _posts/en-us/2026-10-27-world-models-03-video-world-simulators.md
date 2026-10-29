---
layout: post
title: "Video generation as world simulation: Sora, Genie, GameNGen and beyond"
date: 2026-10-27 15:03:00+0900
description: "How video generators became interactive world simulators: the Sora report, Genie 1-3, GameNGen, UniSim, GAIA-1, NVIDIA Cosmos, latent action models, and the open problems of memory, consistency and physics."
categories: world-models
tags: [world-models, video-generation, genie, sora, latent-actions]
series: world-models
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## Why this matters

[Post 1]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}) introduced world models as small learned simulators trained per task, and [post 2]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }}) built the generative toolkit. Between 2023 and 2025 the two lines merged: video generators trained on internet-scale data started to be described, and used, as **world simulators**: you give them a frame and a stream of actions, and they render what happens next. For a graphics person this is a striking shift: a *learned* model replaces the whole game engine (state update, physics and rendering) at once. This post surveys the key systems, explains the one genuinely new ingredient (**latent actions** learned from unlabeled video), and is honest about what these models still cannot do.

## Prerequisites

- Posts 1 and 2 (RSSM and imagination; tokenizers, autoregressive Transformers, latent diffusion, classifier-free guidance, DiT).
- Familiarity with video tensors $(T, H, W, C)$ and with the idea of a game loop (input, state update, render).

## 1. From video prediction to world simulation

A video model learns $p_\theta(x_{1:T} \mid c)$ for clips $x_{1:T}$ and conditioning $c$ (text, a first frame). A **world simulator** additionally needs:

1. **Interactivity**: a factorization $p_\theta(x_{t+1} \mid x_{\le t}, a_{\le t})$ that can be stepped frame by frame as actions arrive, not just a whole clip at once.
2. **Controllability**: the actions must actually determine the outcome (a "move left" input moves the character left), and the space of actions must be meaningful.
3. **Consistency and memory**: the world must stay the same when you look away and back, objects must persist, and the rollout must not drift into noise after a few hundred frames.
4. **Plausible dynamics**: objects fall, collide and occlude as in the target domain (a game's rules or real physics).
5. **Speed**: for interaction it must run in real time, typically 20-30 frames per second.

Requirement 1 is the important structural one; the figure shows the loop that every interactive model below runs.

{% include blog_figure.liquid path="assets/img/blog/world-models/03-next-frame.svg" localized="true" width="85%" caption="Interactive next-frame prediction: the model sees a window of the last $N$ frames and actions and generates $x_{t+1}$, which is appended to the context while the oldest frame drops out. Everything the model 'knows' about the world must fit in this window, and its own errors are fed back in at the next step." %}

Each system below solves a different subset of these. A compact way to compare them:

| System | Year | Domain | Generator | Action input | Interactive in real time? |
| --- | --- | --- | --- | --- | --- |
| GAIA-1 (Wayve) | 2023 | driving | tokenizer + AR Transformer + video diffusion decoder | ego speed/curvature, text | no |
| UniSim (Google DeepMind et al.) | 2023 | robots, humans, navigation | video diffusion | text or low-level controls | no |
| Sora (OpenAI) | 2024 | general video | diffusion Transformer on spacetime patches | none (text/image/video prompts) | no |
| Genie (Google DeepMind) | 2024 | 2D platformers, robotics videos | VQ tokenizer + MaskGIT dynamics | learned latent actions | no (about 1 fps) |
| GameNGen (Google) | 2024 | DOOM | fine-tuned Stable Diffusion | keyboard actions | yes, 20 fps on one TPU |
| Genie 2 (Google DeepMind) | 2024 | 3D worlds from an image | autoregressive latent diffusion | keyboard/mouse | no (research prototype) |
| Cosmos (NVIDIA) | 2025 | physical AI (robots, driving) | diffusion and AR world foundation models | via post-training | depends on model |
| Genie 3 (Google DeepMind) | 2025 | general 3D worlds from text | not published | navigation + text "world events" | yes, 24 fps at 720p (per announcement) |

On a time axis (months of the arXiv submissions or official announcements):

{% include blog_figure.liquid path="assets/img/blog/world-models/03-timeline.svg" caption="Timeline of the systems in this post, plus DIAMOND (post 1) and Diffusion Forcing (Section 6). Orange: interactive in real time; purple: action-conditioned; grey: no action input. Within about two years the field went from offline, action-conditioned video prediction to real-time, playable worlds." %}

## 2. Sora: "Video generation models as world simulators"

OpenAI's February 2024 technical report, ["Video generation models as world simulators"](https://openai.com/index/video-generation-models-as-world-simulators/), describes Sora at a high level (it explicitly omits model and implementation details):

- A **video compression network** maps raw video to a latent that is compressed in space and time (post 2, Section 6).
- The latent is cut into **spacetime patches**, which act as tokens for a **diffusion Transformer** (post 2, Section 9). Because the model sees a variable-length set of patches, it can be trained on videos of native **duration, resolution and aspect ratio** instead of cropping everything to a fixed square.
- Training videos are re-captioned with a descriptive captioner (the technique from DALL·E 3), and short user prompts are expanded by a language model.

Spacetime patches are easiest to see in 3D:

{% include blog_figure.liquid path="assets/img/blog/world-models/03-spacetime-patches.svg" width="75%" caption="A compressed video latent of $4 \times 4 \times 6$ (time, height, width) cut into $2 \times 2 \times 2$ spacetime patches, drawn slightly apart: each coloured block becomes one token, 12 in total. A longer, larger or wider video simply yields more tokens, which is why the model can train on native durations and aspect ratios. (The sizes here are illustrative; the report does not give Sora's patch sizes.)" %}

The report's main claim is in its title: scaling video generation produces **emergent simulation capabilities**, which it lists as 3D consistency under camera motion, long-range coherence and object permanence (sometimes), simple interactions that change world state (a painter leaving strokes, a bite in a burger), and "simulating digital worlds" (it can render Minecraft while controlling the player with a basic policy). The same report lists failures: it does not accurately model the physics of many basic interactions such as glass shattering, and interactions like eating do not always yield correct state changes.

Two cautions are worth keeping in mind when you cite Sora as a world model. First, it is **not action-conditioned**: you cannot step it with control inputs, so it is a simulator only in a weak, "prompt it with a scene description" sense. Second, the evidence is **qualitative** (curated samples); post 5 discusses benchmarks that test such claims and find physical understanding to be limited.

## 3. Genie: generative interactive environments from unlabeled video

### 3.1 The problem: internet video has no actions

To train $p(x_{t+1} \mid x_{\le t}, a_t)$ you need action labels, but the vast majority of gameplay and real-world video on the internet comes without them. **Genie** (Bruce et al., "Genie: Generative Interactive Environments", ICML 2024, [arXiv:2402.15391](https://arxiv.org/abs/2402.15391)) learns a controllable world model from about thirty thousand hours of 2D platformer gameplay videos **without any action labels**. Its 11B-parameter model has three parts:

1. A **spatiotemporal video tokenizer** (a VQ-VAE with a memory-efficient ST-Transformer that alternates spatial and causal temporal attention), producing discrete tokens $z_t$ for every frame.
2. A **latent action model** (LAM) that infers a discrete action $\tilde a_t$ between consecutive frames (Section 3.2).
3. A **dynamics model**, a MaskGIT-style ST-Transformer that predicts the next frame's tokens from past tokens and latent actions: $p(z_{t+1} \mid z_{\le t}, \tilde a_{\le t})$.

The figure shows how the three parts are wired during training and during play.

{% include blog_figure.liquid path="assets/img/blog/world-models/03-genie.svg" localized="true" caption="Genie. Training (top) needs only video: the tokenizer turns frames into tokens, the latent action model infers a code $\tilde a_t$ from each pair of consecutive frames, and the dynamics model learns to predict the next frame's tokens from past tokens and codes. Playing (bottom): the latent action model is discarded and the user chooses one of the 8 codes at every step." %}

At inference time the LAM is discarded. A user (or an agent) picks one of the latent actions at every step, and the dynamics model plus tokenizer decoder render the result. Genie can be prompted with images it has never seen, including sketches and photographs, turning them into playable 2D worlds. The same recipe trained on robot videos learned consistent latent actions for a robot arm, and the paper shows that latent actions inferred from expert videos can be used to train a policy for an unseen game with very few labeled samples.

### 3.2 Latent action models

The LAM is an autoencoder with an **information bottleneck in the middle**. An encoder sees past frames $x_{1:t}$ **and** the next frame $x_{t+1}$ and outputs a continuous vector, which is quantized to one of a very small number of codes (Genie uses $\lvert \mathcal{A} \rvert = 8$). A decoder must reconstruct $x_{t+1}$ from the past frames and that code alone:

$$
\tilde a_t = \mathrm{VQ}\big(\mathrm{Enc}_\phi(x_{1:t}, x_{t+1})\big) \in \lbrace e_1, \dots, e_{\lvert\mathcal{A}\rvert} \rbrace,\qquad
\mathcal{L}_{\mathrm{LAM}} = \big\lVert x_{t+1} - \mathrm{Dec}_\psi(x_{1:t}, \tilde a_t) \big\rVert^2 + \mathcal{L}_{\mathrm{VQ}} .
$$

Because the past frames are given to the decoder, the cheapest way to use the 3-bit bottleneck is to encode **what changed and is not predictable from the past**, which in a game is mostly the player's input. The same principle appears in **LAPO** (Schmidt & Jiang, "Learning to Act without Actions", ICLR 2024, [arXiv:2312.10812](https://arxiv.org/abs/2312.10812)), which recovers latent-action policies and world models from Procgen videos and maps latent actions to real ones with a tiny labeled set. An older alternative is **VPT** (Baker et al., NeurIPS 2022, [arXiv:2206.11795](https://arxiv.org/abs/2206.11795)): train an inverse dynamics model on a small amount of labeled Minecraft play and use it to pseudo-label 70k hours of internet video.

The figure shows why the bottleneck forces the code to mean 'action':

{% include blog_figure.liquid path="assets/img/blog/world-models/03-lam.svg" localized="true" width="85%" caption="Latent action model. The encoder sees the past and the next frame, but only 3 bits ($\lvert\mathcal{A}\rvert = 8$ codes) pass to the decoder. Since the decoder already receives the past frames (dashed), the only useful thing to send through the bottleneck is what changed and cannot be predicted from the past, which in a game is mostly the player's input." %}

Latent actions have known weaknesses: they can capture changes not caused by the agent (camera shake, other characters), they are not aligned across domains, and a small discrete codebook cannot express continuous control well. Section 8 has a runnable toy LAM.

### 3.3 Genie 2 and Genie 3

**Genie 2** (Google DeepMind blog, [December 2024](https://deepmind.google/discover/blog/genie-2-a-large-scale-foundation-world-model/)) moved to 3D. It is described as an **autoregressive latent diffusion model**: frames pass through an autoencoder, and a large Transformer dynamics model, trained with a causal mask like an LLM, generates the next latent frame by diffusion given past latents and keyboard/mouse actions. Classifier-free guidance is used to improve action controllability. Prompted with a single image (for example from Imagen 3), it produces worlds that stay consistent for up to a minute, remembers parts of the scene that leave the view, and models effects such as water, smoke, gravity and lighting. DeepMind used it to generate evaluation environments for its SIMA agent.

**Genie 3** (Google DeepMind blog, [August 2025](https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/)) is generated from a text prompt and is the first in the series that is **interactive in real time**: the announcement states 24 frames per second at 720p with consistency over a few minutes. It also introduced **promptable world events**: text instructions that change the running world (weather, new objects or characters). The announcement lists limitations, including a limited action space for the agent, difficulties with multi-agent interactions, inaccurate rendering of real-world locations and text, and a limited interaction duration. No paper or architecture details were published at the time of the announcement, so treat specific capability claims as the company's own.

## 4. GameNGen: a diffusion model as a game engine

**GameNGen** (Valevski et al., "Diffusion Models Are Real-Time Game Engines", ICLR 2025, [arXiv:2408.14837](https://arxiv.org/abs/2408.14837)) asks a narrow but sharp question: can a neural network *be* the game engine of a complex game? It simulates DOOM interactively at 20 frames per second on a single TPU, over multi-minute sessions. The recipe has two phases:

1. **Data**: an RL agent learns to play DOOM, and all its training episodes (including the bad early ones, which give diverse coverage) are recorded as (frame, action) sequences.
2. **Model**: Stable Diffusion v1.4 is re-purposed as a next-frame predictor. The text conditioning is replaced by embeddings of the last actions, and the past frames are encoded by the autoencoder and concatenated to the noisy latent along the channel axis:

$$
p_\theta\big(x_{t+1} \mid x_{t-N+1:t},\ a_{t-N+1:t}\big)
$$

Here $N$ is the number of past frames and actions in the context (64 in the paper).

The decisive trick is **noise augmentation of the context**. During training, the *conditioning* frames are corrupted with Gaussian noise of a random level, and that level is given to the model as an input. The model therefore learns to correct errors in its own context, which stops the autoregressive drift that otherwise destroys rollouts within a few seconds. The authors also fine-tune the latent decoder to reduce artifacts in the HUD, sample with only 4 DDIM steps, and report next-frame PSNR of 29.4 (comparable to lossy JPEG); human raters were only slightly better than chance at telling short clips of the real game from the simulation.

Put together, one denoising pass of GameNGen looks like this:

{% include blog_figure.liquid path="assets/img/blog/world-models/03-gamengen.svg" localized="true" caption="GameNGen as described in the paper: past frames are encoded by the Stable Diffusion autoencoder, corrupted with Gaussian noise of a random level $\sigma$ (which is also given to the model), and concatenated along channels with the noisy latent of the next frame. Embeddings of the past actions replace the text conditioning of the U-Net, and 4 DDIM steps produce $x_{t+1}$." %}

GameNGen's limitation is equally instructive: with about three seconds of visual context, it has **no long-term memory**. Game state that is not visible on screen (such as which areas you have visited) persists only through what the HUD shows. DIAMOND (post 1) reached similar conclusions on CS:GO.

The figure sketches why a finite context window means no long-term memory.

{% include blog_figure.liquid path="assets/img/blog/world-models/03-memory.svg" localized="true" width="85%" caption="Top-down sketch of a walk around a loop. At $t_1$ the agent sees the red landmark. At $t_2$ it faces the same place again, but the context window (orange segment) only covers the last part of the walk, so nothing in the model's input says what the landmark looked like. The model must re-imagine it, and the result need not match." %}

## 5. Action-conditioned real-world simulators

### 5.1 UniSim

**UniSim** (Yang et al., "Learning Interactive Real-World Simulators", ICLR 2024 Outstanding Paper, [arXiv:2310.06114](https://arxiv.org/abs/2310.06114)) aims at the real world. Its insight is that different datasets carry different kinds of "actions": text in image-caption data, motor commands in robot data, camera motion in navigation data, language descriptions of human activities. UniSim casts all of them as conditioning for one video diffusion model that predicts the next video segment given the history and the action. The paper then trains (a) a high-level vision-language planner and (b) a low-level RL policy purely inside the simulator and shows zero-shot transfer to real robots. It is the clearest demonstration that a video world model can be used *as a simulator for training*, not just for producing pretty videos.

### 5.2 GAIA-1 for driving

**GAIA-1** (Hu et al., Wayve, [arXiv:2309.17080](https://arxiv.org/abs/2309.17080), 2023) is a generative world model for autonomous driving. Video, text and ego-vehicle actions are encoded into tokens, an autoregressive Transformer world model predicts the next image tokens (future prediction as next-token prediction), and a separate video diffusion decoder renders high-resolution frames. Conditioning on actions lets one ask counterfactual questions ("what if the car steered left?"), and text prompts can change weather or time of day. Driving is a natural application because rare, dangerous scenarios are exactly what a simulator should generate.

### 5.3 NVIDIA Cosmos

**Cosmos** (NVIDIA, "Cosmos World Foundation Model Platform for Physical AI", [arXiv:2501.03575](https://arxiv.org/abs/2501.03575), 2025) frames world models as **foundation models** for physical AI. The platform includes a video curation pipeline, continuous and discrete **Cosmos tokenizers**, pre-trained **world foundation models** in both diffusion and autoregressive flavors, guardrails, and post-training examples that specialize the general model to camera control, robotic manipulation and autonomous driving. The models are released under the NVIDIA Open Model License ([github.com/NVIDIA/Cosmos](https://github.com/NVIDIA/Cosmos)). The intended workflow is "pre-train once on broad video, post-train on your robot or car", which mirrors how LLMs are adapted. Cosmos is a good starting point if you want to experiment with a large open video world model.

## 6. Making autoregressive video rollouts stable

All interactive models generate frame by frame (or chunk by chunk) and condition on their own outputs, so they face the compounding-error problem from post 1 in a severe form. Techniques you will meet repeatedly:

- **Context noise augmentation** (GameNGen, Genie 2-style models): train with corrupted context and tell the model the corruption level.
- **Diffusion Forcing** (Chen et al., NeurIPS 2024, [arXiv:2407.01392](https://arxiv.org/abs/2407.01392)): give every frame in a sequence its **own independent noise level** during training. A causal model trained this way can denoise the next frames while past frames are clean or only slightly noisy, keeps the future uncertain and stabilizes long rollouts; it also enables guidance over whole future trajectories for planning.
- **Causal attention with KV caching** so that each new frame costs a constant amount of compute, and **step distillation** (few-step or one-step samplers) to reach real-time rates.
- **Memory mechanisms**: longer context windows, compressed memories of past frames, retrieval of frames by camera pose, or an explicit 3D representation of the scene. The last option leads directly to [post 4]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }}).

The schemes differ only in which noise levels the frames of a training sequence get, as the figure shows.

{% include blog_figure.liquid path="assets/img/blog/world-models/03-diffusion-forcing.svg" localized="true" width="85%" caption="Noise level per frame (white = clean, dark = pure noise; grey = not part of the input). Full-sequence diffusion uses one level for the whole clip; next-frame prediction keeps the past clean and noises only the frame to predict; Diffusion Forcing samples an independent level for every frame. At sampling time this allows a causal 'pyramid' schedule (bottom right), where each frame is denoised a little behind its predecessor, so the near future is sharper than the far future." %}

## 7. What is still missing

- **Long-horizon consistency and memory.** Turn around twice and the room changes. Pixel-space models have no persistent state other than their context window; consistency over minutes is a frontier claim, over hours unsolved.
- **Physics.** Kang et al. ("How Far is Video Generation from World Model: A Physical Law Perspective", ICML 2025, [arXiv:2411.02385](https://arxiv.org/abs/2411.02385)) trained video diffusion models on synthetic 2D physics and found near-perfect in-distribution generalization but failure out of distribution: the models behave like **case-based** retrieval (mimicking the closest training example) rather than learning laws. Physics-IQ (Motamed et al., WACV 2026, [arXiv:2501.09038](https://arxiv.org/abs/2501.09038)) found that physical understanding in current video models is severely limited and unrelated to visual realism. Post 5 returns to evaluation.
- **Controllability and action spaces.** Keyboard actions in one game, latent actions in another, robot joint commands elsewhere: there is no shared action interface, which limits transfer.
- **Causality vs. correlation.** A model trained on passive video may learn that "umbrellas cause rain". Interventional data (actions) helps, but most video has none.
- **Compute.** Real-time generation at high resolution needs heavy distillation and specialized hardware, and the training budgets are out of reach for most labs.
- **Evaluation.** FVD and visual quality metrics say little about whether a simulator is useful for training agents (post 5).

## 8. Code: a toy latent action model

The script below makes the latent-action idea concrete. A dot moves on a $12 \times 12$ grid under five hidden actions (stay, up, down, left, right). A LAM with an 8-way discrete bottleneck is trained **only on frame pairs** $(x_t, x_{t+1})$; afterwards we check whether the learned codes align with the hidden actions, and we "play" the world model by feeding a chosen code repeatedly. For robustness at this tiny scale the bottleneck is a straight-through Gumbel-softmax rather than Genie's VQ (both give a discrete code with gradients), and the encoder is convolutional with global pooling, i.e. translation invariant. It runs in about two minutes on a CPU.

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

On this toy the five hidden actions typically map to distinct codes with high purity, and repeatedly pressing the "right" code moves the dot one cell to the right per step. Things to try: add a second, *uncontrolled* dot that moves randomly and see whether the codes start to encode its motion as well (a known failure mode of LAMs), or shrink the codebook to 4 and see which actions merge. Also replace `ConvEncoder` by an MLP on the concatenated frames: the reconstruction loss still goes down, but code purity drops to about 0.2-0.3 (close to chance), because the decoder also sees the current position and the meaning of each code can then change from one region of the grid to another. Latent actions are only consistent across states if the architecture or the training forces them to be, which is a real issue for LAMs trained on diverse video.

We ran the script, and also the MLP-encoder variant described above, with the same seed:

{% include blog_figure.liquid path="assets/img/blog/world-models/03-lam-results.svg" caption="Top: fraction of transitions of each hidden action assigned to each of the 8 learned codes. With the translation-invariant ConvEncoder every action has its own code (mean purity 0.96; 'down' is split over two codes); with an MLP encoder the codes are mixed (mean purity 0.25, close to chance). Bottom: 'playing' the ConvEncoder world model by feeding the 'right' code four times from column 3: the dot moves one cell per step to column 7, while small decoder errors accumulate as background noise." %}

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Video Diffusion Models (Ho et al.) | NeurIPS | 2022 | [arXiv:2204.03458](https://arxiv.org/abs/2204.03458) | Early diffusion model for video |
| Video PreTraining (VPT): Learning to Act by Watching Unlabeled Online Videos (Baker et al.) | NeurIPS | 2022 | [arXiv:2206.11795](https://arxiv.org/abs/2206.11795) | Inverse-dynamics pseudo-labels for internet video |
| GAIA-1: A Generative World Model for Autonomous Driving (Hu et al.) | arXiv (Wayve tech report) | 2023 | [arXiv:2309.17080](https://arxiv.org/abs/2309.17080) | Token-based driving world model with action and text control |
| Learning Interactive Real-World Simulators (UniSim, Yang et al.) | ICLR | 2024 | [arXiv:2310.06114](https://arxiv.org/abs/2310.06114) | Unifies heterogeneous actions; trains policies in a video simulator |
| Learning to Act without Actions (LAPO, Schmidt, Jiang) | ICLR | 2024 | [arXiv:2312.10812](https://arxiv.org/abs/2312.10812) | Latent action policies from observation-only video |
| Video generation models as world simulators (Sora, OpenAI) | technical report | 2024 | [openai.com](https://openai.com/index/video-generation-models-as-world-simulators/) | Spacetime-patch diffusion Transformer; "emergent simulation" claims |
| Genie: Generative Interactive Environments (Bruce et al.) | ICML | 2024 | [arXiv:2402.15391](https://arxiv.org/abs/2402.15391) | Controllable worlds from unlabeled video via latent actions |
| Diffusion Forcing: Next-token Prediction Meets Full-Sequence Diffusion (Chen et al.) | NeurIPS | 2024 | [arXiv:2407.01392](https://arxiv.org/abs/2407.01392) | Per-frame noise levels for stable long rollouts |
| Genie 2: A large-scale foundation world model (Google DeepMind) | blog | 2024 | [deepmind.google](https://deepmind.google/discover/blog/genie-2-a-large-scale-foundation-world-model/) | Image-prompted, action-controllable 3D worlds |
| Diffusion Models Are Real-Time Game Engines (GameNGen, Valevski et al.) | ICLR | 2025 | [arXiv:2408.14837](https://arxiv.org/abs/2408.14837) | Real-time DOOM; context noise augmentation |
| Cosmos World Foundation Model Platform for Physical AI (NVIDIA) | arXiv | 2025 | [arXiv:2501.03575](https://arxiv.org/abs/2501.03575) | Open world foundation models and tokenizers |
| Genie 3: A new frontier for world models (Google DeepMind) | blog | 2025 | [deepmind.google](https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/) | Real-time, text-prompted, promptable world events |
| How Far is Video Generation from World Model: A Physical Law Perspective (Kang et al.) | ICML | 2025 | [arXiv:2411.02385](https://arxiv.org/abs/2411.02385) | Video models generalize case-by-case, not by physical laws |

## Learning resources

- The Sora report and the Genie 2 / Genie 3 announcements above are short and worth reading in full, ideally side by side with their limitation sections.
- NVIDIA Cosmos code and models: [github.com/NVIDIA/Cosmos](https://github.com/NVIDIA/Cosmos).
- DIAMOND's code includes playable Atari and CS:GO world models that run on a single consumer GPU: [github.com/eloialonso/diamond](https://github.com/eloialonso/diamond).
- Diffusion Forcing code: [github.com/buoyancy99/diffusion-forcing](https://github.com/buoyancy99/diffusion-forcing).
- For the generative background, Lilian Weng's ["What are Diffusion Models?"](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/) and Stanford [CS236](https://deepgenerativemodels.github.io/).

## Exercises

1. Run the toy LAM. Then add a second dot that moves randomly and independently of the action. How does code purity change? Propose a modification (hint: give the decoder information about the distractor) that restores it.
2. Turn the LAM decoder into a multi-step world model and roll it out for 30 steps. Does the dot stay sharp? Implement GameNGen-style context noise augmentation (add noise to the input frame during training and pass the noise level) and compare.
3. Write down the factorization $p(x_{1:T} \mid a_{1:T})$ used by GameNGen and by Sora-style full-clip diffusion. Which one can be used interactively, and what does each need to be retrained for?
4. Pick one claim from the Genie 3 announcement and design an experiment (data, metric, baseline) that would test it quantitatively.

**Next:** [post 4]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }}) looks at the alternative to pixel-space simulators: generating explicit 3D and 4D worlds, from score distillation to Gaussian scene generators and World Labs' Marble.
