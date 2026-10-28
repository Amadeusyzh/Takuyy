---
layout: post
title: "NeRF: neural radiance fields and differentiable volume rendering"
date: 2026-10-27 12:02:00+0900
description: "The volume rendering equation and its quadrature, positional encoding, the NeRF MLP, hierarchical sampling and the photometric loss, with a minimal PyTorch NeRF and the follow-ups Mip-NeRF, Mip-NeRF 360 and NeRF in the Wild."
categories: neural-rendering
tags: [nerf, volume-rendering, positional-encoding, pytorch, mip-nerf]
series: neural-rendering
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## Why this matters

In [post 1]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}) we recovered calibrated cameras from photographs. NeRF (Mildenhall et al., ECCV 2020) answers the next question: given those cameras and images, what 3D representation renders them back? Its answer is a **neural radiance field**, a small MLP that maps a 3D point and a viewing direction to a density and a colour, rendered by classic **volume rendering**. Because every step is differentiable, the whole scene is fitted with nothing but a photometric loss and gradient descent.

NeRF is the conceptual parent of almost everything in this series: fast grid-based fields (post 3) keep its rendering equation and replace the MLP, and 3D Gaussian Splatting (post 4) keeps the same alpha-compositing formula but swaps ray marching for rasterization. Understanding the quadrature in section 2 is the single most important takeaway.

## Prerequisites

- Cameras, intrinsics and camera-to-world matrices (post 1).
- Ray tracing and Monte Carlo estimation from the graphics series; the idea of radiance.
- PyTorch: `nn.Module`, autograd, Adam.

## 1. The scene as a radiance field

NeRF represents a static scene as a continuous function

$$
F_\Theta : (\mathbf x, \mathbf d) \mapsto (\mathbf c, \sigma),
$$

where $\mathbf x \in \mathbb R^3$ is a position, $\mathbf d$ a unit viewing direction, $\mathbf c \in [0,1]^3$ the emitted RGB radiance in direction $\mathbf d$, and $\sigma \ge 0$ the **volume density**: the differential probability that a ray is stopped at $\mathbf x$, with units of inverse length. $\Theta$ are MLP weights.

Two modelling choices matter:

1. **Density depends only on position.** Geometry must be the same from every viewpoint; otherwise the network could "cheat" by placing different surfaces in each training view. Colour depends on both $\mathbf x$ and $\mathbf d$, which lets the field reproduce specular highlights and other view-dependent effects.
2. **No explicit surfaces.** There are no meshes or normals, just a soft density field. Surfaces emerge where $\sigma$ becomes large. This is what makes the representation easy to optimize: gradients flow to every sample along a ray, not only to a single hit point.

There is no lighting model either: $\mathbf c$ is the outgoing radiance with lighting "baked in". In the language of the graphics series, NeRF learns $L_o(\mathbf x, \omega_o)$ directly, not BRDFs and lights. That is why a NeRF cannot be relit without further work.

## 2. Volume rendering

### 2.1 The continuous equation

Cast a ray $\mathbf r(t) = \mathbf o + t\mathbf d$ from the camera centre through a pixel, with near and far bounds $t_n, t_f$. Under an emission–absorption model (no scattering; Max, 1995; Kajiya & Von Herzen, 1984), the expected colour is

$$
C(\mathbf r) = \int_{t_n}^{t_f} T(t)\, \sigma(\mathbf r(t))\, \mathbf c(\mathbf r(t), \mathbf d)\, dt,
\qquad
T(t) = \exp\!\left( -\int_{t_n}^{t} \sigma(\mathbf r(s))\, ds \right).
$$

$T(t)$ is the **transmittance**: the probability that the ray travels from $t_n$ to $t$ without being absorbed. The product $T(t)\sigma(t)$ is the probability density that the ray terminates exactly at $t$, so $C$ is the expected colour at the termination point. It also gives a depth estimate, $\int T\sigma\, t\, dt$, and an opacity, $1 - T(t_f)$.

### 2.2 Quadrature: from integral to alpha compositing

We evaluate the field at $N$ samples $t_1 < \dots < t_N$ and let $\delta_i = t_{i+1} - t_i$. Assume $\sigma$ and $\mathbf c$ are constant, $\sigma_i$ and $\mathbf c_i$, on the segment $[t_i, t_{i+1}]$. On that segment, the transmittance from $t_i$ decays as $e^{-\sigma_i (t - t_i)}$, so the segment's contribution is

$$
\int_{t_i}^{t_{i+1}} T(t)\sigma_i \mathbf c_i\, dt
= T_i\, \mathbf c_i \int_0^{\delta_i} \sigma_i e^{-\sigma_i s}\, ds
= T_i \left(1 - e^{-\sigma_i \delta_i}\right) \mathbf c_i,
$$

with $T_i = T(t_i) = \exp(-\sum_{j<i} \sigma_j \delta_j)$. Defining the segment **opacity** $\alpha_i = 1 - e^{-\sigma_i\delta_i}$, we get NeRF's estimator:

$$
\hat C(\mathbf r) = \sum_{i=1}^{N} w_i\, \mathbf c_i,
\qquad
w_i = T_i\, \alpha_i,
\qquad
T_i = \prod_{j=1}^{i-1} (1 - \alpha_j).
$$

This is exactly front-to-back **alpha compositing** with the "over" operator from the graphics series: each sample covers a fraction $\alpha_i$ of what is still visible, and $T_i$ is the visibility remaining in front of it. Keep this formula in mind: in post 4, 3D Gaussian Splatting composites sorted Gaussians with the *same* expression, only with $\alpha_i$ coming from a projected 2D Gaussian rather than from $\sigma_i\delta_i$.

A few practical details:

- The weights satisfy $\sum_i w_i = 1 - T_{N+1} \le 1$. The remainder is the probability that the ray escapes; adding $(1-\sum_i w_i)\,\mathbf c_{\text{bg}}$ composites a background colour (the Blender synthetic scenes use white).
- Multiply $\delta_i$ by $\lVert \mathbf d \rVert$ if ray directions are not normalized, so densities are in world units.
- The last interval is set to a huge value ($10^{10}$) so that the final sample absorbs whatever is left.
- Samples are **stratified**: $t_i \sim \mathcal U\!\left[t_n + \tfrac{i-1}{N}(t_f - t_n),\, t_n + \tfrac{i}{N}(t_f - t_n)\right]$. Jittering positions each iteration makes the MLP see a continuous set of locations instead of a fixed grid, which avoids aliasing to the sample positions.

## 3. Positional encoding

A plain MLP taking $(x, y, z, \theta, \phi)$ produces blurry results. Neural networks are biased towards low-frequency functions (the **spectral bias**), so fine texture and sharp edges are learned extremely slowly. NeRF maps each input coordinate $p$ through a fixed **positional encoding** first:

$$
\gamma(p) = \big( \sin(2^0\pi p), \cos(2^0\pi p), \sin(2^1\pi p), \cos(2^1\pi p), \dots, \sin(2^{L-1}\pi p), \cos(2^{L-1}\pi p) \big),
$$

with $L = 10$ for positions (inputs normalized to roughly $[-1,1]$) and $L = 4$ for directions. The original code also concatenates the raw input $p$ and omits the factor $\pi$; both variants work. Tancik et al. (NeurIPS 2020) explained why this works: through the lens of the neural tangent kernel, a Fourier feature mapping turns the network's effective kernel into a stationary one whose bandwidth is set by the frequencies, so high-frequency detail becomes learnable. Too many frequencies cause noisy, overfitted results; the encoding is a bandwidth knob.

## 4. Network architecture

The MLP in the paper:

- 8 fully connected layers of width 256 with ReLU, taking $\gamma(\mathbf x)$ (63 numbers with the raw input), with a **skip connection** that concatenates $\gamma(\mathbf x)$ again into the fifth layer.
- A linear head that outputs $\sigma$ (ReLU, so $\sigma\ge 0$), and a 256-d feature vector.
- The feature is concatenated with $\gamma(\mathbf d)$ (27 numbers) and passed through one 128-wide layer, followed by a sigmoid RGB output.

The structure enforces the first modelling choice: $\sigma$ is computed before the direction is seen.

## 5. Hierarchical sampling

Uniform samples waste most evaluations on empty space and occluded regions. NeRF trains **two** networks:

1. A **coarse** network evaluated at $N_c = 64$ stratified samples. Its weights $w_i$ form a piecewise-constant PDF along the ray: $\hat w_i = w_i / \sum_j w_j$.
2. $N_f = 128$ additional samples are drawn from this PDF by **inverse transform sampling** (draw $u\sim\mathcal U[0,1)$, find the CDF bin containing $u$, interpolate linearly inside it). This is the same importance sampling idea used for BRDFs in the path tracing post.
3. A **fine** network is evaluated at all $N_c + N_f$ sorted samples and produces the final colour.

Both networks are supervised, so the coarse one keeps producing a useful PDF. Later work (Mip-NeRF 360) replaced the coarse NeRF by a tiny "proposal" network trained only to bound the fine weights.

## 6. Training

For a batch of rays $\mathcal R$ sampled at random from all training pixels, the loss is

$$
\mathcal L = \sum_{\mathbf r \in \mathcal R} \Big( \big\lVert \hat C_c(\mathbf r) - C(\mathbf r) \big\rVert_2^2 + \big\lVert \hat C_f(\mathbf r) - C(\mathbf r) \big\rVert_2^2 \Big).
$$

The paper used batches of 4096 rays, Adam with a learning rate decaying exponentially from $5\times 10^{-4}$ to $5\times 10^{-5}$, and 100k–300k iterations, roughly one to two days on a single NVIDIA V100 per scene. Rendering one $800\times800$ image requires $800^2 \times (64 + 192) \approx 1.6\times 10^8$ MLP evaluations, which is why NeRF renders at seconds per frame and why the next post exists.

Evaluation uses **PSNR** ($-10\log_{10}\mathrm{MSE}$ for images in $[0,1]$), **SSIM** and **LPIPS** (a learned perceptual distance) on held-out views. Standard datasets are the eight Blender synthetic scenes (360° renders, $800\times800$) and the forward-facing LLFF captures, for which NeRF warps space into **normalized device coordinates (NDC)** so that unbounded depth maps to a finite interval.

## 7. A minimal NeRF in PyTorch

The code below is a complete, self-contained NeRF: ray generation, positional encoding, the paper's MLP, stratified and hierarchical sampling, and volume rendering. It follows the original structure closely but stays readable.

### 7.1 Rays

```python
import torch, torch.nn as nn, torch.nn.functional as F

def get_rays(H, W, focal, c2w):
    """Rays for every pixel. c2w: 4x4 camera-to-world in the OpenGL/NeRF convention
    (x right, y up, camera looks along -z). Returns origins and directions, (H, W, 3)."""
    j, i = torch.meshgrid(torch.arange(H, dtype=torch.float32),
                          torch.arange(W, dtype=torch.float32), indexing="ij")
    dirs = torch.stack([(i + 0.5 - W / 2) / focal,
                        -(j + 0.5 - H / 2) / focal,
                        -torch.ones_like(i)], dim=-1)
    rays_d = dirs @ c2w[:3, :3].T                      # rotate into world space
    rays_o = c2w[:3, 3].expand(rays_d.shape)
    return rays_o, rays_d
```

The minus signs come from the OpenGL camera convention used by NeRF's `transforms.json` (see the table in post 1): image rows grow downwards while camera $y$ points up, and the camera looks along $-z$. For COLMAP (OpenCV) poses you would drop both minus signs.

### 7.2 Encoding and network

```python
def positional_encoding(x, n_freqs, include_input=True):
    """gamma(p) = (sin(2^k pi p), cos(2^k pi p)), k = 0..L-1, applied per coordinate."""
    freqs = 2.0 ** torch.arange(n_freqs, dtype=x.dtype, device=x.device) * torch.pi
    xb = x[..., None, :] * freqs[:, None]              # (..., L, D)
    enc = torch.cat([torch.sin(xb), torch.cos(xb)], dim=-1).flatten(-2)
    return torch.cat([x, enc], dim=-1) if include_input else enc

class NeRF(nn.Module):
    """The original architecture: 8x256 trunk with a skip at layer 5, density head,
    then a 128-wide branch that also sees the encoded view direction."""
    def __init__(self, L_x=10, L_d=4, width=256, depth=8, skip=4):
        super().__init__()
        self.L_x, self.L_d, self.skip = L_x, L_d, skip
        in_x, in_d = 3 + 6 * L_x, 3 + 6 * L_d
        self.trunk = nn.ModuleList(
            [nn.Linear(in_x, width)] +
            [nn.Linear(width + (in_x if i == skip else 0), width) for i in range(1, depth)])
        self.sigma = nn.Linear(width, 1)
        self.feat = nn.Linear(width, width)
        self.rgb = nn.Sequential(nn.Linear(width + in_d, width // 2), nn.ReLU(),
                                 nn.Linear(width // 2, 3), nn.Sigmoid())

    def forward(self, x, d):
        ex = positional_encoding(x, self.L_x)
        ed = positional_encoding(F.normalize(d, dim=-1), self.L_d)
        h = ex
        for i, layer in enumerate(self.trunk):
            if i == self.skip:
                h = torch.cat([h, ex], dim=-1)         # skip connection
            h = F.relu(layer(h))
        sigma = F.softplus(self.sigma(h) - 1.0).squeeze(-1)  # density: position only (paper: ReLU)
        rgb = self.rgb(torch.cat([self.feat(h), ed], dim=-1))
        return rgb, sigma
```

With $L_x = 10$ the position encoding has $3 + 60 = 63$ dimensions and with $L_d = 4$ the direction encoding has $3 + 24 = 27$, matching the paper. We use a shifted softplus for the density instead of a ReLU: with a ReLU, an unlucky initialization can make $\sigma = 0$ everywhere, and then no gradient reaches the density head (the original code mitigates this by adding noise to the raw density during training; Mip-NeRF switched to softplus).

### 7.3 Sampling and rendering

```python
def stratified_samples(near, far, n_rays, n_samples, perturb=True):
    """t_i = near + (far - near) * (i + u_i) / N with u_i ~ U[0, 1)."""
    bins = torch.linspace(0.0, 1.0, n_samples + 1)[:-1].expand(n_rays, n_samples)
    u = torch.rand(n_rays, n_samples) if perturb else torch.full((n_rays, n_samples), 0.5)
    return near + (far - near) * (bins + u / n_samples)

def volume_render(rgb, sigma, t, rays_d, white_bkgd=False):
    """Quadrature of the volume rendering integral.
    rgb: (R, N, 3), sigma: (R, N), t: (R, N) sample distances along each ray."""
    delta = t[..., 1:] - t[..., :-1]
    delta = torch.cat([delta, torch.full_like(delta[..., :1], 1e10)], dim=-1)
    delta = delta * rays_d.norm(dim=-1, keepdim=True)        # distances in world units
    alpha = 1.0 - torch.exp(-sigma * delta)                   # opacity of each segment
    # T_i = prod_{j<i} (1 - alpha_j): exclusive cumulative product
    trans = torch.cumprod(torch.cat([torch.ones_like(alpha[..., :1]),
                                     1.0 - alpha + 1e-10], dim=-1), dim=-1)[..., :-1]
    weights = alpha * trans                                   # w_i = T_i * alpha_i
    color = (weights[..., None] * rgb).sum(dim=-2)
    depth = (weights * t).sum(dim=-1)
    acc = weights.sum(dim=-1)                                 # 1 - final transmittance
    if white_bkgd:
        color = color + (1.0 - acc[..., None])
    return color, depth, acc, weights

def sample_pdf(bins, weights, n_samples, deterministic=False):
    """Inverse-transform sampling of the piecewise-constant PDF given by `weights`
    on the intervals `bins` (R, N+1). Returns (R, n_samples) new sample positions."""
    weights = weights + 1e-5                                  # avoid NaNs on empty rays
    pdf = weights / weights.sum(dim=-1, keepdim=True)
    cdf = torch.cumsum(pdf, dim=-1)
    cdf = torch.cat([torch.zeros_like(cdf[..., :1]), cdf], dim=-1)   # (R, N+1)
    if deterministic:
        u = torch.linspace(0.0, 1.0, n_samples).expand(cdf.shape[0], n_samples).contiguous()
    else:
        u = torch.rand(cdf.shape[0], n_samples)
    idx = torch.searchsorted(cdf, u, right=True)
    below = (idx - 1).clamp(min=0)
    above = idx.clamp(max=cdf.shape[-1] - 1)
    cdf_b, cdf_a = cdf.gather(-1, below), cdf.gather(-1, above)
    bin_b, bin_a = bins.gather(-1, below), bins.gather(-1, above)
    denom = torch.where(cdf_a - cdf_b < 1e-5, torch.ones_like(cdf_a), cdf_a - cdf_b)
    return bin_b + (u - cdf_b) / denom * (bin_a - bin_b)

def render_rays(coarse, fine, rays_o, rays_d, near, far, n_coarse=64, n_fine=128, perturb=True):
    R = rays_o.shape[0]
    t_c = stratified_samples(near, far, R, n_coarse, perturb)
    x_c = rays_o[:, None] + rays_d[:, None] * t_c[..., None]
    rgb_c, sig_c = coarse(x_c, rays_d[:, None].expand_as(x_c))
    col_c, _, _, w_c = volume_render(rgb_c, sig_c, t_c, rays_d)
    # hierarchical sampling: draw fine samples where the coarse weights are large
    mids = 0.5 * (t_c[:, 1:] + t_c[:, :-1])
    t_f = sample_pdf(mids, w_c[:, 1:-1].detach(), n_fine, deterministic=not perturb)
    t_all, _ = torch.sort(torch.cat([t_c, t_f], dim=-1), dim=-1)
    x_f = rays_o[:, None] + rays_d[:, None] * t_all[..., None]
    rgb_f, sig_f = fine(x_f, rays_d[:, None].expand_as(x_f))
    col_f, depth_f, acc_f, _ = volume_render(rgb_f, sig_f, t_all, rays_d)
    return col_c, col_f, depth_f
```

Two details are easy to get wrong. The cumulative product must be **exclusive** ($T_1 = 1$), hence the prepended ones and the dropped last element. And the coarse weights are **detached** before resampling: the fine samples' positions are not differentiated through.

### 7.4 Training on a toy scene

To keep everything self-contained, we create a ground-truth scene analytically (a soft coloured sphere), render 20 small views of it with the same quadrature, and fit a NeRF to them. With a real dataset you would instead load images and `transform_matrix` entries from `transforms.json`.

```python
import math
torch.manual_seed(0)

def pose_spherical(theta, phi, radius):
    """Camera on a sphere looking at the origin (OpenGL convention), like the NeRF synthetic data."""
    th, ph = math.radians(theta), math.radians(phi)
    C = torch.tensor([radius * math.cos(ph) * math.sin(th), radius * math.sin(ph),
                      radius * math.cos(ph) * math.cos(th)])
    back = C / C.norm()                                  # camera +z points away from the target
    right = torch.linalg.cross(torch.tensor([0.0, 1.0, 0.0]), back); right = right / right.norm()
    up = torch.linalg.cross(back, right)
    c2w = torch.eye(4); c2w[:3, 0], c2w[:3, 1], c2w[:3, 2], c2w[:3, 3] = right, up, back, C
    return c2w

# ground-truth "scene": a soft sphere with a colour gradient, rendered by the same quadrature
def gt_field(x, d):
    sigma = 30.0 * torch.sigmoid(20.0 * (0.6 - x.norm(dim=-1)))
    rgb = 0.5 + 0.5 * torch.tanh(2.0 * x)
    return rgb, sigma

H = W = 32; focal = 40.0; near, far = 2.0, 6.0
images, poses = [], []
for k in range(20):
    c2w = pose_spherical(18.0 * k, -30.0 + 3.0 * k, 4.0)
    o, d = get_rays(H, W, focal, c2w)
    o, d = o.reshape(-1, 3), d.reshape(-1, 3)
    t = stratified_samples(near, far, o.shape[0], 256, perturb=False)
    x = o[:, None] + d[:, None] * t[..., None]
    rgb, sig = gt_field(x, d)
    images.append(volume_render(rgb, sig, t, d)[0]); poses.append((o, d))

rays_o = torch.cat([p[0] for p in poses]); rays_d = torch.cat([p[1] for p in poses])
target = torch.cat(images)
# a smaller network than the paper's so that this runs on a CPU in a few minutes
coarse, fine = NeRF(L_x=6, L_d=2, width=64, depth=4), NeRF(L_x=6, L_d=2, width=64, depth=4)
opt = torch.optim.Adam(list(coarse.parameters()) + list(fine.parameters()), lr=1e-3)
for step in range(1001):
    idx = torch.randint(0, rays_o.shape[0], (512,))
    col_c, col_f, _ = render_rays(coarse, fine, rays_o[idx], rays_d[idx], near, far, 32, 32)
    loss = F.mse_loss(col_c, target[idx]) + F.mse_loss(col_f, target[idx])
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 250 == 0:
        psnr = -10.0 * torch.log10(F.mse_loss(col_f, target[idx]))
        print(f"step {step:4d}  loss {loss.item():.4f}  PSNR(fine) {psnr.item():.1f} dB")
```

On a 4-core CPU this takes about a minute and a half. The printed PSNR on the training batch rises from about 7 dB to 19.9 dB at step 250, 30.6 dB at step 750 and 35.5 dB at step 1000: the sphere's geometry appears first, then its colour gradient. Like real NeRFs, the toy model has a slow start while the density is still nearly uniform; with the full $8\times256$ network the same plateau lasts much longer on a CPU, which is why the toy run uses `depth=4` and `width=64`.

To go from here to a real NeRF: use the full-size network and $L_x = 10$, $N_c = 64$, $N_f = 128$, batches of 4096 rays, a learning-rate schedule, a GPU, and render held-out views in chunks under `torch.no_grad()`.

## 8. Follow-ups

NeRF triggered thousands of papers. Three follow-ups address its most visible failure modes and introduce ideas that reappear in 3DGS.

### 8.1 Mip-NeRF: anti-aliasing with cones

NeRF samples infinitely thin rays at points, so the same 3D point is encoded identically whether a pixel covers a millimetre or a metre of it. Training on images at multiple resolutions (or rendering far from the training distance) then produces aliasing and blur. **Mip-NeRF** (Barron et al., ICCV 2021) casts a **cone** per pixel, splits it into conical frustums, and approximates each frustum by a Gaussian with mean $\boldsymbol\mu$ and covariance $\Sigma$. It then encodes the *expected* positional encoding over that Gaussian, the **integrated positional encoding (IPE)**. For $x\sim\mathcal N(\mu, \sigma^2)$,

$$
\mathbb E[\sin(x)] = \sin(\mu)\, e^{-\sigma^2/2},
\qquad
\mathbb E[\cos(x)] = \cos(\mu)\, e^{-\sigma^2/2},
$$

so frequencies whose period is smaller than the frustum's footprint are smoothly attenuated, which is prefiltering, like mipmapping. A single MLP then represents the scene at all scales. The same "replace a point by a Gaussian footprint and low-pass it" idea returns in Mip-Splatting (post 5).

### 8.2 Mip-NeRF 360: unbounded scenes

Real captures of a whole environment have content at all distances. **Mip-NeRF 360** (Barron et al., CVPR 2022) introduces a **scene contraction** that maps all of space into a ball of radius 2,

$$
\operatorname{contract}(\mathbf x) =
\begin{cases}
\mathbf x & \lVert \mathbf x\rVert \le 1, \\[2pt]
\left(2 - \dfrac{1}{\lVert \mathbf x\rVert}\right)\dfrac{\mathbf x}{\lVert \mathbf x\rVert} & \lVert \mathbf x\rVert > 1,
\end{cases}
$$

a small **proposal MLP** trained by "online distillation" to bound the NeRF's weights (replacing the coarse network), and a **distortion loss** that encourages the weights along each ray to be compact, removing floaters. Its dataset of nine unbounded scenes (bicycle, garden, stump, room, counter, kitchen, bonsai, ...) is the standard benchmark that 3DGS also reports on.

### 8.3 NeRF in the Wild

Internet photo collections violate NeRF's assumptions: exposure, white balance and weather change between photos, and tourists move. **NeRF-W** (Martin-Brualla et al., CVPR 2021) adds:

- a learned per-image **appearance embedding** $\boldsymbol\ell^{(a)}_i$ fed to the colour branch, which absorbs photometric variation while keeping geometry shared;
- a **transient** head with its own density, colour and a per-ray **uncertainty** $\beta$, conditioned on a per-image transient embedding, so that occluders are explained away instead of baked into the scene; the loss becomes $\frac{\lVert C - \hat C\rVert^2}{2\beta^2} + \log\beta^2$ plus a sparsity term on the transient density.

Per-image appearance embeddings remain a standard trick; nerfstudio's `nerfacto` and several 3DGS variants use them.

### 8.4 Other directions in brief

- **Surfaces:** NeuS (Wang et al., NeurIPS 2021) replaces density by a signed distance function with an unbiased weight function, giving clean meshes.
- **Generation:** DreamFusion (Poole et al., ICLR 2023) optimizes a NeRF so that its renderings look plausible to a 2D text-to-image diffusion model (score distillation sampling), the starting point of text-to-3D.
- **Speed:** grids, hash encodings and baking (post 3), and eventually Gaussians (post 4).

## Try it

The [interactive lab]({{ '/' | relative_url }}#lab) does not contain a NeRF, but the Gaussian World demo composites its splats with exactly the weights $w_i = T_i\alpha_i$ of section 2.2, only sorted per pixel instead of sampled along a ray. Use its debug views while reading post 4 to see the connection.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Optical Models for Direct Volume Rendering (Max) | IEEE TVCG | 1995 | — | Emission–absorption model behind the rendering equation |
| NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis (Mildenhall et al.) | ECCV | 2020 | [arXiv](https://arxiv.org/abs/2003.08934) | The method of this post |
| Fourier Features Let Networks Learn High Frequency Functions in Low Dimensional Domains (Tancik et al.) | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.10739) | Explains why positional encoding works |
| NeRF in the Wild (Martin-Brualla et al.) | CVPR | 2021 | [arXiv](https://arxiv.org/abs/2008.02268) | Appearance embeddings and transient objects |
| Mip-NeRF: A Multiscale Representation for Anti-Aliasing Neural Radiance Fields (Barron et al.) | ICCV | 2021 | [arXiv](https://arxiv.org/abs/2103.13415) | Cone tracing and integrated positional encoding |
| NeuS: Learning Neural Implicit Surfaces by Volume Rendering (Wang et al.) | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.10689) | SDF-based volume rendering for surfaces |
| Mip-NeRF 360: Unbounded Anti-Aliased Neural Radiance Fields (Barron et al.) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2111.12077) | Contraction, proposal networks, standard benchmark |
| DreamFusion: Text-to-3D using 2D Diffusion (Poole et al.) | ICLR | 2023 | [arXiv](https://arxiv.org/abs/2209.14988) | Score distillation: NeRFs from text |

## Learning resources

- The [NeRF project page](https://www.matthewtancik.com/nerf) and the original TensorFlow code at [github.com/bmild/nerf](https://github.com/bmild/nerf); a faithful PyTorch port is [yenchenlin/nerf-pytorch](https://github.com/yenchenlin/nerf-pytorch).
- [nerfstudio](https://docs.nerf.studio/), the framework used in posts 3 and 6, with clean implementations of `vanilla-nerf`, `mipnerf` and `nerfacto`.
- Scratchapixel's lessons on volume rendering for the graphics side of section 2.
- The Brown [neural fields](https://neuralfields.cs.brown.edu/) survey and database (Xie et al., "Neural Fields in Visual Computing and Beyond", Eurographics STAR 2022).
- Stanford CS231N for the deep learning background (MLPs, optimization).

## Exercises

1. Show that the weights $w_i = T_i\alpha_i$ sum to $1 - \prod_{i}(1-\alpha_i)$. What does the remainder mean physically?
2. Remove the positional encoding (`L_x = 0`) in the toy experiment and compare the PSNR after the same number of steps. Then try `L_x = 16`.
3. Return the expected depth from `render_rays` and render a depth map of the toy scene. Is it close to $4 - 0.6 = 3.4$ at the centre of the image?
4. Replace stratified sampling by fixed midpoints (`perturb=False`) during training. What artifacts appear when rendering at a different resolution?
5. Implement the integrated positional encoding for a diagonal Gaussian and check numerically that it equals the Monte Carlo average of $\gamma(\mathbf x)$ over samples of $\mathbf x$.

**Next:** NeRF takes a day to train and seconds to render a frame. [Post 3]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }}) shows how explicit grids and hash encodings made radiance fields train in minutes.
