---
layout: post
title: "Imitation learning: behavior cloning, DAgger, ACT and Diffusion Policy"
date: 2026-10-27 18:04:00+0900
description: "Learning robot skills from demonstrations: covariate shift and DAgger, action chunking with transformers (ACT/ALOHA), Diffusion Policy, data collection with teleoperation and UMI, and large cross-embodiment datasets, with a runnable diffusion-policy training example."
categories: embodied-ai
tags: [imitation-learning, behavior-cloning, diffusion-policy, act, datasets]
series: embodied-ai
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## Why this matters

RL (post 2) needs a reward and a lot of trials, which is fine for walking in a GPU simulator and painful for folding a
shirt or plugging in a cable. **Imitation learning** (IL) skips the reward: a human demonstrates the task, and the
robot learns a policy that maps observations to the demonstrated actions. Since 2023, two ideas, **action chunking**
and **generative action models** (diffusion and flow matching), made IL work for fine-grained, contact-rich
manipulation from a few dozen demonstrations. They are also the action heads of today's Vision-Language-Action
models (post 5). This post builds IL from the ground up and ends with a working Diffusion Policy training loop.
The simulators of [the previous post]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}) are
where you can practice it before touching a robot.

**Prerequisites**

- Supervised learning with PyTorch; the RL notation of post 2 ($\pi$, trajectories, horizon $T$).
- Diffusion models at the level of DDPM (forward noising, noise prediction). The world-models and neural-rendering
  tracks cover these too.
- The action-space discussion of post 1 (joint vs. end-effector targets, impedance control).

## 1. Behavior cloning and covariate shift

Given demonstrations $\mathcal{D} = \lbrace(o_i, a_i)\rbrace$ from an expert policy $\pi^{\ast}$, **behavior cloning** (BC)
fits a policy by maximum likelihood:

$$
\theta^{\ast} = \arg\max_\theta \sum_{(o,a)\in\mathcal{D}} \log \pi_\theta(a \mid o).
$$

With a fixed-variance Gaussian policy this is just MSE regression. BC is the oldest robot learning method (ALVINN
drove a vehicle from camera images with a small neural network in 1988) and it is still the backbone of most
manipulation systems. It has two classic failure modes.

### Covariate shift and compounding errors

BC trains on states from the expert's distribution $d_{\pi^{\ast}}$, but at test time the robot visits states from its
own distribution $d_{\pi_\theta}$. A small mistake moves it to a state no demonstration covers, where it makes a bigger
mistake, and so on. Ross and Bagnell (2010) formalized this: if the learned policy errs with probability $\epsilon$ on
the expert's states, the expected cost over a horizon $T$ can grow as $O(\epsilon T^2)$, while a learner trained on its
own state distribution achieves $O(\epsilon T)$.

A small experiment makes the effect visible. A point moves forward at constant speed and steers its lateral position $y$ to follow a sine-shaped path; the expert is a simple feedback law, and the learner is a radial-basis-function regressor fitted to the expert's state-action pairs:

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-covariate-shift.svg" caption="Behaviour cloning versus DAgger on the path-following toy. The 10 expert demonstrations are clean (grey band: the states they cover), while deployment adds more disturbance. Top: plain BC (red) is fine while it stays in the band, but once a disturbance pushes it out, its actions are meaningless and it drifts away from the path for good. After DAgger has labelled the learner's own states, the policy (blue) recovers like the expert. Bottom: mean tracking error over 20 rollouts; BC averages 0.131, 4.5 times the expert's 0.029, and a single DAgger iteration already brings it to the expert's level." %}

### DAgger

**DAgger** (Dataset Aggregation; Ross, Gordon and Bagnell, AISTATS 2011) fixes the distribution mismatch by querying
the expert on states the learner visits:

1. Train $\pi_1$ on the expert demonstrations $\mathcal{D}$.
2. For $i = 1, 2, \dots$: run $\pi_i$ (optionally mixed with the expert) to collect states; ask the expert to label
   them with $a = \pi^{\ast}(s)$; aggregate $\mathcal{D} \leftarrow \mathcal{D} \cup \lbrace(s, \pi^{\ast}(s))\rbrace$; retrain $\pi_{i+1}$.

DAgger has no-regret guarantees and the $O(\epsilon T)$ bound, but labelling arbitrary states is awkward for a human
teleoperator. Practical variants let the human **intervene** only when the robot goes wrong (HG-DAgger, intervention
data in many real systems), or use a privileged simulator policy as the expert, which is exactly the teacher-student
distillation from post 2. Other remedies for covariate shift: inject noise during demonstrations so the data contains
recoveries (DART), augment observations, and, most effectively in practice, predict **action chunks** (section 2).

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-dagger-loop.svg" localized="true" caption="The DAgger loop. The step that plain behaviour cloning lacks is the right column: run the current policy, let the expert label the states the policy actually visits, and add them to the dataset." %}

### Multimodality

Humans solve the same task in different ways: go around an obstacle on the left or on the right, grasp a mug by
the handle or the rim. The MSE-optimal prediction is the **average** of the modes, which may be the one action that
fails (straight into the obstacle). Remedies are expressive action distributions: discretized actions with a
categorical output (RT-1, post 5), Gaussian mixtures (robomimic's BC-RNN-GMM), energy-based models (Implicit BC),
k-means "action bins" plus offsets (Behavior Transformers), VAEs (ACT), and diffusion or flow models (Diffusion Policy).
The code at the end of this post shows MSE BC collapsing onto the obstacle while a diffusion policy keeps both modes.

The figure shows this with the toy problem trained in section 6: demonstrations pass an obstacle on the left or on the right, and the MSE regressor averages the two.

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-multimodal.svg" caption="Left: 60 demonstration chunks (grey) from `make_demos`, 40 chunks sampled from the trained Diffusion Policy (purple), and the MSE behaviour-cloning prediction (red), all for the observation at the origin. Right: the lateral offset in the middle of the chunk. The demonstrations and the diffusion samples are bimodal at about $\pm 0.5$; the MSE prediction sits at $y = 0.02$, the mean of the two modes and the one place that hits the obstacle." %}

## 2. Action chunking with transformers (ACT / ALOHA)

Zhao et al. (RSS 2023) built **ALOHA**, a low-cost bimanual teleoperation system in which a human moves two small
"leader" arms and two "follower" arms mirror the joint positions, and **ACT** (Action Chunking with Transformers),
which learned tasks like opening a translucent condiment cup and slotting a battery with 80 to 90% success from about
10 minutes of demonstrations. The key ideas:

- **Action chunking.** Instead of one action per step, predict the next $k$ actions $a_{t:t+k}$ (e.g. $k = 100$ joint
  targets at 50 Hz). Chunking reduces the effective horizon by a factor of $k$, so compounding errors have fewer
  opportunities to accumulate, and it lets the model represent temporally correlated behaviour such as pauses, which
  single-step policies handle poorly.
- **Temporal ensembling.** Querying the policy every step yields overlapping chunks. ACT averages all predictions
  for the current time step with exponential weights $w_i = \exp(-m\, i)$, where $i = 0$ is the oldest prediction,
  which smooths motion without lag.
- **CVAE training.** A transformer encoder compresses the demonstrated chunk into a latent style variable $z$; the
  decoder (a transformer over ResNet image features from several cameras and the joint state) predicts the chunk
  given $z$. At test time $z$ is set to the prior mean. The objective is reconstruction (L1) plus a KL term.
- **Joint-space actions** with a position controller, which avoids IK and singularities for the 6-DoF ALOHA arms.

**Mobile ALOHA** (Fu et al. CoRL 2024) put the system on a mobile base and showed that co-training with the static
ALOHA data improves mobile manipulation. **ALOHA Unleashed** (Zhao et al. CoRL 2024) scaled data collection and used a
diffusion-based policy for tasks like tying shoelaces and hanging shirts.

Temporal ensembling is easiest to understand on a timeline. In the toy below, every chunk is the ideal action plus an error that grows along the chunk, as a learned policy's would:

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-temporal-ensembling.svg" caption="Top: a chunk of $k = 10$ future actions is predicted at every step (colour = prediction time); at $t = 30$, ten different chunks each contain a prediction for that step (red dots). Bottom: executing each chunk to the end and replanning every 10 steps (orange) jumps at every chunk boundary, while the temporal ensemble (purple) averages the overlapping predictions with weights $w_i = e^{-0.1 i}$, $i = 0$ for the oldest. Its mean step-to-step change is 0.124, close to the ideal 0.117, versus 0.172 for plain chunking." %}

## 3. Diffusion Policy

Chi et al. (RSS 2023) model the conditional distribution of an action sequence with a **denoising diffusion model**.
A policy step starts from Gaussian noise and iteratively denoises it into an action chunk, conditioned on recent
observations. Across 12 tasks from 4 benchmarks it improved success rates by 46.9% on average over the prior state of
the art.

### Formulation

Let $A^0_t \in \mathbb{R}^{T_p\times d_a}$ be a chunk of $T_p$ future actions and $O_t$ the last $T_o$ observations.
The DDPM forward process adds noise with a schedule $\bar\alpha_k$:

$$
A^k_t = \sqrt{\bar\alpha_k}\,A^0_t + \sqrt{1-\bar\alpha_k}\,\epsilon, \qquad \epsilon\sim\mathcal{N}(0, I),
$$

and the network $\epsilon_\theta$ learns to predict that noise:

$$
\mathcal{L}(\theta) = \mathbb{E}_{k,\,\epsilon,\,(O_t, A^0_t)\sim\mathcal{D}}\left[\left\lVert \epsilon - \epsilon_\theta\!\left(A^k_t,\, k,\, O_t\right)\right\rVert^2\right].
$$

At inference, starting from $A^K_t \sim \mathcal{N}(0, I)$, each reverse step is

$$
A^{k-1}_t = \frac{1}{\sqrt{\alpha_k}}\left(A^k_t - \frac{\beta_k}{\sqrt{1-\bar\alpha_k}}\,\epsilon_\theta(A^k_t, k, O_t)\right) + \sigma_k z, \qquad z\sim\mathcal{N}(0, I),
$$

with $\beta_k = 1-\alpha_k$ and $\sigma_k^2 = \beta_k$. Since $\epsilon_\theta$ is (up to scale) the score
$\nabla_A \log p(A \mid O)$, sampling is noisy gradient ascent on the log-density of actions, which naturally represents
multiple modes and high-dimensional, temporally coherent action sequences.

The forward process is easy to picture for an action chunk: each of its waypoints is shrunk toward the origin and blurred with Gaussian noise until nothing of the trajectory remains.

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-diffusion-forward.svg" caption="The DDPM forward process $A^k = \sqrt{\bar\alpha_k}A^0 + \sqrt{1-\bar\alpha_k}\,\epsilon$ applied to 40 demonstration chunks of the toy problem (8 waypoints each), with the cosine schedule from the code in section 6. At $k = 20$ the two families of trajectories are still visible, at $k = 50$ they are mostly gone, and at $k = 100$ the chunks are pure noise. Bottom: the signal and noise coefficients of the schedule." %}

### Design choices that matter

- **Receding horizon.** Predict $T_p$ steps (e.g. 16), execute only the first $T_a$ (e.g. 8), then replan from new
  observations ($T_o = 2$ frames). Executing a chunk gives temporal consistency; replanning gives reactivity.
- **Conditioning, not joint modelling.** Observations condition the denoiser (via FiLM layers in a 1-D temporal
  CNN U-Net, or cross-attention in a transformer variant) instead of being denoised, so the vision encoder runs once
  per policy step, not once per denoising step.
- **Position control in end-effector space** worked better than velocity control in their experiments: absolute
  targets suffer less from compounding drift.
- **Fast sampling.** Training uses 100 DDPM steps; inference can use DDIM with about 10 steps. Later work replaces
  diffusion with **flow matching** (pi0, post 5) or consistency distillation to reach real-time rates.

Extensions include **3D Diffusion Policy** (Ze et al. RSS 2024), which conditions on point clouds, and the extended
journal version (Chi et al. IJRR 2024).

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-receding-horizon.svg" caption="Receding-horizon execution with the values above. At $t = 0$ the policy sees the last $T_o = 2$ observations (cyan) and predicts $T_p = 16$ actions; only the first $T_a = 8$ (dark purple) are executed. At $t = 8$ it observes again and predicts a fresh chunk, discarding the unexecuted tail of the old one." %}

## 4. Collecting demonstrations

The data is the real bottleneck. Common interfaces:

| Interface | Examples | Pros | Cons |
| --- | --- | --- | --- |
| Kinesthetic teaching | pushing a compliant arm by hand | intuitive, no extra hardware | human in the camera view, single arm |
| Leader-follower arms | ALOHA, GELLO | low latency, bimanual, joint-space, force feel via backdrivability | robot-specific hardware |
| VR / AR teleoperation | Quest or Vision Pro hand tracking, Open-TeleVision | immersive, dexterous hands, remote | retargeting, latency, no haptics (post 6) |
| Space mouse / phone | robomimic, RoboTurk | cheap, scalable | slow, hard for dexterous tasks |
| Hand-held grippers | UMI | no robot needed, in-the-wild data | needs pose tracking and embodiment matching |
| Human video | Ego4D, EgoMimic | huge scale | no actions, embodiment gap (post 6) |

**UMI** (Universal Manipulation Interface; Chi et al. RSS 2024) is a hand-held, 3D-printed gripper with a wrist-mounted
GoPro. A fisheye lens and side mirrors give a wide, implicitly stereo view; visual-inertial SLAM recovers the gripper's
6-DoF trajectory; and the policy interface accounts for latency differences between data collection and deployment.
Because the observation (wrist camera) and action (end-effector pose, gripper width) are the same on the hand-held
device and on the robot, data collected in kitchens and parks transfers to real arms. The same principle, **make the
data interface and the robot interface identical**, recurs throughout embodied AI.

Practical tips that matter more than the architecture: consistent demonstrators, calibrated cameras, synchronised
timestamps, recording the controller's actual targets (not the measured state), and collecting recovery behaviour on
purpose.

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-data-pipeline.svg" localized="true" caption="A demonstration pipeline. Whatever the interface, the recorder stores synchronized observations and the actions actually commanded at a fixed rate. The UMI principle is the bottom line of the figure: if the data side and the robot side share the same observation and action spaces, the dataset can train a policy for the robot directly." %}

## 5. Large datasets and cross-embodiment learning

Single-lab datasets have hundreds to tens of thousands of episodes. Pooling data across labs and robots is the robotics
version of web-scale pre-training:

- **Open X-Embodiment** (ICRA 2024): a collaboration of 21 institutions that standardized datasets from 22 robots,
  covering 527 skills (160,266 tasks), into the RLDS format. RT-1-X and RT-2-X trained on the mixture outperformed
  single-robot policies; on the authors' evaluation RT-2-X showed about three times the success of RT-2 on emergent
  skills.
- **BridgeData V2** (CoRL 2023): tabletop manipulation with a low-cost WidowX arm across many environments; a common
  pre-training and evaluation set.
- **DROID** (RSS 2024): 76k teleoperated trajectories (about 350 hours) on Franka arms in 564 scenes, collected by
  many institutions to maximize scene diversity.
- **LeRobot** (Hugging Face): a PyTorch library and data format with implementations of ACT, Diffusion Policy and
  VLA models (including SmolVLA and pi0), plus a hub of community datasets recorded on low-cost arms.

Cross-embodiment training raises its own questions: how to align action spaces (end-effector deltas vs. joints),
how to handle different camera setups, and how to weight datasets. Post 5 discusses how VLA models answer them.

## 6. A runnable Diffusion Policy training step

The script below implements the core of Diffusion Policy on a toy problem that exposes multimodality: demonstrations
start near the origin and move forward while bending either left or right around an obstacle. It trains a
noise-prediction network over 8-step action chunks with a cosine DDPM schedule and, for comparison, an MSE behavior
cloning model. The denoiser is a small MLP (the paper uses a 1-D temporal U-Net or a transformer), but the training
step and the sampler are the real thing. It runs in about half a minute on a CPU.

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

Output:

```text
it 0: diffusion loss 1.0366, BC loss 0.2291
it 1000: diffusion loss 0.0401, BC loss 0.0542
it 2000: diffusion loss 0.0299, BC loss 0.0547
diffusion: fraction left 0.56, right 0.43, mean |y| 0.484
MSE BC:    mean y 0.022 (collapses to the average, i.e. into the obstacle)
```

Recording the intermediate chunks of `sample` shows how the two modes emerge from noise:

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-diffusion-reverse.svg" caption="The reverse process of the trained model above (same code and seed, retrained in about 20 s), for 60 samples at the origin. Each chunk is coloured by the side it finally chooses. The left/right decision is already visible at $k = 15$; the last steps only remove noise. At $k = 0$ the samples have converged onto the two demonstrated paths (56% left and 44% right in this batch of 400), while the MSE baseline (red) goes straight through the middle." %}

The diffusion policy samples both modes in roughly the demonstrated 50/50 proportion, with a lateral offset close to
the true $0.5 \sin(\pi \cdot 4/7) \approx 0.49$ at the middle of the chunk, while MSE BC predicts $y \approx 0$:
straight through the obstacle. Its loss also plateaus near 0.055, about the variance of the two modes it averages. To turn this into a real policy: replace `obs` with image features from a
ResNet or ViT (trained end-to-end with random-crop augmentation), use a temporal U-Net, normalize actions to
$[-1, 1]$, keep an exponential moving average of the weights for evaluation, and execute the first $T_a$ actions
of each sampled chunk in a receding-horizon loop. LeRobot's implementation is a good reference.

## 7. Beyond plain imitation

- **Inverse RL and adversarial imitation.** Recover a reward that explains the demonstrations, then optimize it.
  **GAIL** (Ho and Ermon 2016) trains a discriminator between expert and policy state-action pairs and uses it as a
  reward; adversarial motion priors in character animation follow the same idea.
- **Offline RL** uses rewards on fixed datasets to improve beyond the demonstrator.
- **Learning from play and language.** Unstructured teleoperation "play" data relabeled with goals or language
  instructions (CALVIN) feeds language-conditioned policies, the step from IL to VLA models.

## Try it

None of the home-page demos is an imitation learner, but the **[Lab]({{ '/' | relative_url }}#lab)** cloth demo makes
a good thought experiment: dragging the cloth with the mouse is a "demonstration" of a deformable-object manipulation
trajectory. Recording the mouse path and the particle positions would give exactly the $(o_t, a_t)$ pairs that a
cloth-folding policy is trained on.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Pomerleau, *ALVINN: an autonomous land vehicle in a neural network* | NeurIPS | 1988 | [Paper](https://proceedings.neurips.cc/paper/1988/hash/812b4ba287f5ee0bc9d43bbf5bbe87fb-Abstract.html) | First neural behavior cloning |
| Ross, Gordon, Bagnell, *A reduction of imitation learning and structured prediction to no-regret online learning* | AISTATS | 2011 | [arXiv](https://arxiv.org/abs/1011.0686) | DAgger, covariate shift |
| Ho and Ermon, *Generative adversarial imitation learning* | NeurIPS | 2016 | [arXiv](https://arxiv.org/abs/1606.03476) | GAIL |
| Ho, Jain, Abbeel, *Denoising diffusion probabilistic models* | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.11239) | DDPM, basis of Diffusion Policy |
| Mandlekar et al., *What matters in learning from offline human demonstrations for robot manipulation* | CoRL | 2021 | [arXiv](https://arxiv.org/abs/2108.03298) | robomimic, careful BC study |
| Florence et al., *Implicit behavioral cloning* | CoRL | 2021 | [arXiv](https://arxiv.org/abs/2109.00137) | Energy-based policies for multimodality |
| Shafiullah et al., *Behavior Transformers: cloning k modes with one stone* | NeurIPS | 2022 | [arXiv](https://arxiv.org/abs/2206.11251) | Discretized multimodal actions |
| Zhao et al., *Learning fine-grained bimanual manipulation with low-cost hardware* | RSS | 2023 | [arXiv](https://arxiv.org/abs/2304.13705) | ALOHA and ACT |
| Chi et al., *Diffusion Policy: visuomotor policy learning via action diffusion* | RSS | 2023 | [arXiv](https://arxiv.org/abs/2303.04137) | Diffusion action heads |
| Walke et al., *BridgeData V2: a dataset for robot learning at scale* | CoRL | 2023 | [arXiv](https://arxiv.org/abs/2308.12952) | Widely used dataset |
| Open X-Embodiment Collaboration, *Open X-Embodiment: robotic learning datasets and RT-X models* | ICRA | 2024 | [arXiv](https://arxiv.org/abs/2310.08864) | Cross-embodiment data |
| Chi et al., *Universal Manipulation Interface: in-the-wild robot teaching without in-the-wild robots* | RSS | 2024 | [arXiv](https://arxiv.org/abs/2402.10329) | Hand-held data collection |
| Khazatsky et al., *DROID: a large-scale in-the-wild robot manipulation dataset* | RSS | 2024 | [arXiv](https://arxiv.org/abs/2403.12945) | Diverse large dataset |
| Ze et al., *3D Diffusion Policy* | RSS | 2024 | [arXiv](https://arxiv.org/abs/2403.03954) | Point-cloud conditioning |
| Fu, Zhao, Finn, *Mobile ALOHA* | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2401.02117) | Mobile bimanual imitation, co-training |
| Zhao et al., *ALOHA Unleashed: a simple recipe for robot dexterity* | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2410.13126) | Scaling bimanual dexterity |

## Learning resources

- [LeRobot](https://github.com/huggingface/lerobot): datasets, ACT, Diffusion Policy and VLA implementations, tutorials
  for low-cost arms.
- [Diffusion Policy code and project page](https://diffusion-policy.cs.columbia.edu/), with Colab notebooks.
- [ACT / ALOHA code](https://github.com/tonyzhaozh/act) and the [UMI project page](https://umi-gripper.github.io).
- [robomimic](https://robomimic.github.io): benchmark and reference implementations for offline imitation.
- R. Tedrake, [*Robotic Manipulation*](https://manipulation.csail.mit.edu), chapter on imitation learning.
- S. Levine, CS 285 lectures on imitation learning and DAgger.

## Exercises

1. Reproduce the compounding-error effect: train MSE BC on noise-free demonstrations of a 1-D point tracking a
   sinusoid, roll it out with small observation noise, and plot error versus horizon. Then add DAgger with a scripted
   expert.
2. In the diffusion script, replace the MLP with a 1-D convolutional U-Net with FiLM conditioning and compare sample
   quality for $H = 16$.
3. Implement DDIM sampling with 10 steps and measure how the left/right fractions and the trajectory quality change.
4. Replace the diffusion objective by flow matching: sample $t\sim U(0,1)$, set $A^t = (1-t)\epsilon + t A^0$ and regress
   the velocity $A^0 - \epsilon$; sample by integrating the ODE with 10 Euler steps.
5. Implement ACT-style temporal ensembling on top of the diffusion sampler (query every step, average overlapping
   predictions with exponential weights) and compare smoothness with receding-horizon execution.

**Next:** [Vision-Language-Action models]({{ '/blog/2026/embodied-ai-05-vision-language-action-models/' | relative_url }}),
where imitation learning meets foundation models.
