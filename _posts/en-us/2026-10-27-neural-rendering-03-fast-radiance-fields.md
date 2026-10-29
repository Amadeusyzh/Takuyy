---
layout: post
title: "Fast radiance fields: grids, tensors and hash encodings"
date: 2026-10-27 12:03:00+0900
description: "Why NeRF is slow and how explicit and hybrid representations fixed it: Plenoxels, DVGO, TensoRF, Instant-NGP's multiresolution hash encoding (with PyTorch code), Zip-NeRF, and the nerfstudio toolbox."
categories: neural-rendering
tags: [instant-ngp, hash-encoding, plenoxels, tensorf, zip-nerf, nerfstudio]
series: neural-rendering
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## Why this matters

The NeRF of [post 2]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) needs a day of GPU time per scene and seconds per rendered frame. Between late 2021 and 2022, a series of papers cut training to minutes, and Instant-NGP to seconds. They all keep NeRF's volume rendering equation but change **how the field is stored**: from one large MLP that every sample must pass through, to explicit data structures that are mostly looked up and interpolated. This shift from implicit to explicit is the bridge to 3D Gaussian Splatting (post 4), which goes all the way and makes the primitives themselves explicit.

## Prerequisites

- Volume rendering, positional encoding and hierarchical sampling (post 2).
- Trilinear interpolation, spherical harmonics (we recap the basics; post 4 goes deeper), hashing.
- PyTorch.

## 1. Why NeRF is slow

Count the work. A training batch of 4096 rays with $64 + 192$ samples each is about a million MLP evaluations; each evaluation of the $8\times256$ trunk costs roughly $8 \times 256^2 \times 2 \approx 10^6$ FLOPs forward. That is around $10^{12}$ FLOPs per iteration forward alone, times 200k iterations. Rendering a single $800\times800$ frame is another $\sim 1.6\times10^8$ network evaluations.

Three properties make this wasteful:

1. **Every sample pays for the whole network.** All of the scene's information lives in shared MLP weights, so there is no way to evaluate "only the part of the model near this point".
2. **Most samples are useless.** Empty space and occluded space dominate, yet stratified sampling evaluates them anyway. Hierarchical sampling helps but itself costs a coarse network pass.
3. **Global weights converge slowly.** Updating one region changes the function everywhere; gradient descent on a large MLP needs many small steps.

The fixes map one-to-one onto these problems: store features **locally** (grids, planes, hash tables) so a sample only touches a few parameters; **skip empty space** with an occupancy structure and stop rays early once transmittance is negligible; and make the remaining network **tiny**.

The figure puts these numbers side by side (top) and shows the second problem on a toy ray (bottom): only a small fraction of the 256 samples ever receives a non-negligible weight.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-nerf-cost.svg" localized="true" caption="Top: forward FLOPs of NeRF on a log scale, computed from the numbers in this section (one $8\times256$ MLP evaluation, a batch of 4096 rays with 256 samples each, one $800\times800$ frame, 200k training iterations). Bottom: a toy ray with one opaque surface and a faint blob, sampled at 256 uniform points. The transmittance $T(t)$ drops to zero at the surface, and only the red ticks (43 of 256 samples) have a weight $w_i>10^{-3}$: every grey tick costs a full network evaluation but contributes almost nothing." %}

A useful mental model: a hybrid radiance field is

$$
(\sigma, \mathbf c)(\mathbf x, \mathbf d) = g_\phi\big(\, \operatorname{interp}(\mathcal G, \mathbf x),\ \mathbf d \,\big),
$$

where $\mathcal G$ is some explicit structure of learnable features, $\operatorname{interp}$ is a cheap lookup with (tri)linear interpolation, and $g_\phi$ is a small decoder, or no network at all.

## 2. Pure grids: Plenoxels and DVGO

### 2.1 Plenoxels

**Plenoxels** (Fridovich-Keil, Yu et al., CVPR 2022) asked whether the neural network is needed at all. It stores, at the vertices of a **sparse voxel grid**, a density and **spherical harmonic (SH)** coefficients for colour. A sample's values are trilinearly interpolated from the 8 surrounding vertices, and view-dependent colour is evaluated from SH:

$$
\mathbf c(\mathbf x, \mathbf d) = \operatorname{sigmoid}\!\Big( \sum_{\ell=0}^{\ell_{\max}} \sum_{m=-\ell}^{\ell} \mathbf k_{\ell m}(\mathbf x)\, Y_{\ell m}(\mathbf d) \Big),
$$

with degree $\ell_{\max} = 2$ (9 coefficients per channel, 27 per vertex). The rendering is NeRF's quadrature; the optimization is directly over grid values, with a **total variation** regularizer

$$
\mathcal L_{TV} = \frac{1}{|\mathcal V|}\sum_{\mathbf v\in\mathcal V} \sqrt{\Delta_x^2(\mathbf v) + \Delta_y^2(\mathbf v) + \Delta_z^2(\mathbf v)}
$$

(differences between neighbouring voxels) to suppress noise in unobserved regions, and coarse-to-fine upsampling with pruning of empty voxels. The paper reports optimization about two orders of magnitude faster than NeRF at comparable quality. Its message, that the **differentiable volumetric renderer** is the key ingredient rather than the neural network, is precisely the bet 3DGS later made with a different primitive. Plenoxels built on PlenOctrees (Yu et al., ICCV 2021), which baked a trained NeRF with SH outputs into an octree for real-time rendering.

The figure shows both halves of this recipe: the trilinear weights of one sample, and the voxels that survive when empty space is pruned.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-trilinear-sparse.svg" caption="Left: trilinear interpolation inside one voxel. The sample $\mathbf x$ at fractional position (0.3, 0.65, 0.4) takes each corner's value with weight $\prod_k (x_k \text{ or } 1-x_k)$; the marker size and the number at each corner show that weight, and the eight weights sum to 1. Right: a $16^3$ grid around a sphere that keeps only the voxels the surface passes through (680 of 4096, 17%; a wedge is cut away to show that the inside is empty too). This is the idea behind pruning empty voxels in Plenoxels; the real method keeps a sparse grid at a much higher resolution." %}

### 2.2 DVGO

**DVGO** (Direct Voxel Grid Optimization; Sun et al., CVPR 2022) also optimizes grids directly but keeps a little network: a dense **density grid** and a **feature grid** whose interpolated feature (plus view direction) is decoded by a shallow MLP. Two of its findings are broadly useful:

- **Post-activation.** Interpolate the raw grid value first and apply the density activation (softplus, then $\alpha = 1 - e^{-\sigma\delta}$) afterwards. A trilinearly interpolated pre-activation can represent a sharp surface inside a single voxel, whereas interpolating already-activated densities cannot.
- **Priors against bad geometry.** Directly optimized density grids readily overfit with floaters, so DVGO initializes densities low and uses view-count-based learning rates in the coarse stage.

The figure reproduces the post-activation argument in 1D (Exercise 4 asks you to build it yourself).

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-post-activation.svg" caption="DVGO's post-activation in 1D. A grid of 8 cells (vertical lines are vertices) has to represent an opaque surface at $x=0.56$, inside the shaded cell (dotted target). For each scheme the 9 vertex values were fitted by least squares. Interpolating opacity (orange) or activated density (blue) can only ramp up across the whole cell, while interpolating the raw value and activating afterwards (red) puts a sharp step exactly at 0.56. Activation: softplus, then $\alpha = 1-e^{-\sigma\delta}$ with $\delta=1/64$." %}

DVGO reports NeRF-comparable quality from scratch in about 15 minutes on a single GPU.

The price of pure grids is memory: a dense $512^3$ grid with 28 floats per vertex is 15 GB. Sparse structures, pruning and factorization are therefore essential.

## 3. Factorized grids: TensoRF and K-Planes

**TensoRF** (Chen et al., ECCV 2022) treats the feature grid as a 4D tensor (three spatial axes plus features) and factorizes it. In the **CP decomposition** the density is a sum of rank-one components,

$$
\sigma(\mathbf x) = \sum_{r=1}^{R} v^X_r(x)\, v^Y_r(y)\, v^Z_r(z),
$$

with learnable 1D vectors $v_r$ along each axis. The more expressive **vector–matrix (VM)** decomposition pairs each 1D vector with a 2D matrix over the other two axes:

$$
\sigma(\mathbf x) = \sum_{r=1}^{R} \Big( v^X_r(x)\, M^{YZ}_r(y,z) + v^Y_r(y)\, M^{XZ}_r(x,z) + v^Z_r(z)\, M^{XY}_r(x,y) \Big).
$$

Appearance uses the same factorization to produce a feature vector, which is decoded by a small MLP or by SH. Memory drops from $O(N^3)$ to $O(N^2)$ (VM) or $O(N)$ (CP); the paper reports CP models under 4 MB trained in under 30 minutes.

The figure fits both decompositions to a small volume, so you can see the trade-off.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-tensorf.svg" caption="CP versus VM on a real volume: a tilted torus with a ball on top, sampled on a $32^3$ grid and factorized with CP (alternating least squares) and VM (each of the three terms is a rank-$R$ matrix in one unfolding, fitted by truncated SVDs). Top left: one VM term, a vector along $x$ times a matrix on the $yz$ plane. Top right: reconstruction PSNR versus parameter count; the dashed line is the dense grid. Bottom: a $z$-slice of the target and of two reconstructions of equal quality: CP needs 16 components (1536 parameters), VM only 2 (6336 parameters). Per component VM is far more expressive; per parameter, CP is very compact on this smooth toy volume." %}

**K-Planes** (Fridovich-Keil et al., CVPR 2023) pushes the planar idea to $d$ dimensions: a $d$-dimensional field is represented by $\binom{d}{2}$ planes whose interpolated features are **multiplied**. For a dynamic scene $(x, y, z, t)$ this means six planes: three spatial ($xy, xz, yz$) and three space–time ($xt, yt, zt$). The same factorized-plane idea underlies many dynamic 3DGS methods (e.g. the HexPlane deformation field of 4D Gaussian Splatting, post 5).

## 4. Instant-NGP: multiresolution hash encoding

**Instant Neural Graphics Primitives** (Müller, Evans, Schied & Keller, ACM TOG / SIGGRAPH 2022) is the most influential of these methods. It replaces NeRF's frequency encoding by a learned, multi-resolution, hashed feature grid, implemented with fully fused CUDA kernels, and trains a NeRF in seconds to minutes.

### 4.1 The encoding

Choose $L$ resolution levels. Level $l$ has a grid resolution growing geometrically between $N_{\min}$ and $N_{\max}$:

$$
N_l = \big\lfloor N_{\min}\, b^{\,l} \big\rfloor,
\qquad
b = \exp\!\left( \frac{\ln N_{\max} - \ln N_{\min}}{L - 1} \right).
$$

Each level owns a table of $T$ feature vectors of dimension $F$. To encode a point $\mathbf x\in[0,1]^d$:

1. At each level, scale $\mathbf x$ by $N_l$ and find the $2^d$ integer corners of the enclosing cell.
2. Map each corner $\mathbf i$ to a table index. If the level's full grid fits, $(N_l+1)^d \le T$, use a one-to-one dense index. Otherwise use the **spatial hash**
   $$
   h(\mathbf i) = \Big( \bigoplus_{k=1}^{d} i_k\, \pi_k \Big) \bmod T,
   \qquad \pi_1 = 1,\ \pi_2 = 2\,654\,435\,761,\ \pi_3 = 805\,459\,861,
   $$
   where $\oplus$ is bitwise XOR.
3. Look up the $2^d$ feature vectors and interpolate them (trilinearly for $d=3$) with the fractional position inside the cell.
4. Concatenate the $L$ interpolated vectors (and optionally auxiliary inputs) into an $L\cdot F$-dimensional encoding, fed to a tiny MLP.

The paper's typical configuration is $L = 16$, $F = 2$, $T = 2^{14}$ to $2^{24}$ (e.g. $2^{19}$ for NeRF), $N_{\min} = 16$. Table entries are initialized from $\mathcal U(-10^{-4}, 10^{-4})$.

The figure shows these levels for the 2D test of section 4.4.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-hash-levels.svg" caption="The levels of the 2D test in section 4.4 ($L=16$, $N$ from 16 to 512, $T=2^{15}$), computed with the formulas above. Top: vertices per level on a log scale; green levels fit into the table and use the dense index, orange levels (from $N=203$ up) are hashed. Bottom left: the grids of levels 0, 5 and 10 over the bottom-left corner of the test image. Bottom right: at the finest level 263169 vertices share 32768 slots (8 per slot on average, and every slot is used); the red dots are the 9 vertices that the spatial hash sends to the same slot as the circled one, scattered pseudo-randomly over the image." %}

### 4.2 Why hash collisions are fine

At fine levels there are far more grid vertices than table entries, so different vertices collide in the same slot. Instant-NGP simply lets them, and relies on three facts:

- **Gradient averaging favours what matters.** A slot shared by a vertex on a visible surface and a vertex in empty space receives gradients from both, but the surface vertex receives many more and larger gradients (its samples have large weights $w_i$), so the stored feature serves the surface.
- **Multi-resolution disambiguation.** Coarse levels are collision-free (dense), and it is very unlikely that two points collide at *all* fine levels simultaneously. The MLP sees the concatenation and can tell them apart.
- **Adaptivity for free.** No explicit sparse structure or pruning is needed; the table capacity flows to where the detail is.

$T$ is the explicit memory–quality knob: the paper shows quality rising with $\log T$ until it saturates.

You can see this knob in the 2D test of section 4.4, where a NumPy re-run with $T$ from $2^{10}$ to $2^{19}$ is plotted.

### 4.3 The rest of the system

- **Tiny MLPs.** For NeRF, a density MLP with one hidden layer of 64 neurons outputs 16 values, the first interpreted as log-density; a colour MLP with two hidden layers of 64 neurons takes these 16 values plus the view direction encoded in spherical harmonics up to degree 4 (16 coefficients).
- **Occupancy grid.** A multiscale binary grid marks cells with non-negligible density. Ray marching skips empty cells and stops when transmittance falls below a threshold, so most rays evaluate only a handful of samples. The grid is updated periodically from the current density.
- **Optimizer.** Adam with $\beta_1 = 0.9$, $\beta_2 = 0.99$, $\epsilon = 10^{-15}$ (the tiny $\epsilon$ matters because many hash entries receive rare, small gradients), with weak L2 regularization applied to the MLP weights only.
- **Fully fused CUDA.** The MLP is evaluated by the `tiny-cuda-nn` library with all layers fused in one kernel, keeping activations in on-chip memory.

The figure shows how much the occupancy grid and early termination save on a toy ray.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-occupancy.svg" caption="Empty-space skipping on a 2D toy scene with two blobs. A $32\times32$ occupancy grid marks the 216 cells (purple) whose density exceeds 0.01. A ray that has 487 uniform samples inside the scene evaluates only the samples in occupied cells and stops once the transmittance falls below $10^{-4}$: just 37 samples (red) are evaluated, all near the first surface it hits." %}

The same encoding also fits gigapixel images, signed distance functions and neural radiance caches, which is why the paper speaks of "graphics primitives".

### 4.4 Code: a hash encoding in PyTorch

Here is a readable (not fast) PyTorch implementation for $d \le 3$, followed by a test that fits a $512\times512$ image with a 2D hash grid and a one-hidden-layer MLP.

```python
import math, torch, torch.nn as nn

PRIMES = [1, 2654435761, 805459861]        # from the Instant-NGP paper (pi_1 = 1)

class HashEncoding(nn.Module):
    """Multiresolution hash encoding (Mueller et al. 2022) for inputs in [0, 1]^D, D <= 3."""
    def __init__(self, D=3, L=16, F=2, log2_T=19, N_min=16, N_max=2048):
        super().__init__()
        self.D, self.L, self.F, self.T = D, L, F, 2 ** log2_T
        b = math.exp((math.log(N_max) - math.log(N_min)) / (L - 1))    # per-level growth factor
        self.register_buffer("res", torch.tensor([math.floor(N_min * b ** l) for l in range(L)]))
        # one table per level, initialised U(-1e-4, 1e-4) as in the paper
        self.tables = nn.Parameter(torch.empty(L, self.T, F).uniform_(-1e-4, 1e-4))
        # all 2^D corners of a cell as 0/1 offsets, shape (2^D, D)
        corners = torch.stack(torch.meshgrid(*[torch.arange(2)] * D, indexing="ij"), -1)
        self.register_buffer("corners", corners.reshape(-1, D))
        self.register_buffer("primes", torch.tensor(PRIMES[:D], dtype=torch.int64))

    def index(self, ic, l):
        """Grid vertex (..., D) at level l -> table index. Dense indexing where the grid fits."""
        n = int(self.res[l]) + 1                          # vertices per axis
        if n ** self.D <= self.T:                         # coarse level: 1:1 mapping, no collisions
            stride = torch.tensor([n ** k for k in range(self.D)], device=ic.device)
            return (ic * stride).sum(-1)
        h = ic[..., 0] * self.primes[0]
        for k in range(1, self.D):
            h = h ^ (ic[..., k] * self.primes[k])         # spatial hash: XOR of coordinate * prime
        return h & (self.T - 1)                           # mod T (T is a power of two)

    def forward(self, x):                                 # x: (B, D) in [0, 1]
        feats = []
        for l in range(self.L):
            xs = x * self.res[l]
            x0 = torch.floor(xs)
            w = xs - x0                                   # position inside the cell
            ic = x0.long()[:, None, :] + self.corners     # (B, 2^D, D) integer corners
            # (d-)linear interpolation weights of each corner
            cw = torch.where(self.corners.bool(), w[:, None, :], 1 - w[:, None, :]).prod(-1)
            f = self.tables[l][self.index(ic, l)]         # (B, 2^D, F)
            feats.append((cw[..., None] * f).sum(1))
        return torch.cat(feats, -1)                       # (B, L * F)
```

```python
torch.manual_seed(0)
# target: a 512x512 procedural image with sharp detail
n = 512
yy, xx = torch.meshgrid(torch.linspace(0, 1, n), torch.linspace(0, 1, n), indexing="ij")
img = torch.stack([0.5 + 0.5 * torch.sin(40 * xx * yy), ((xx * 16).floor() + (yy * 16).floor()) % 2,
                   0.5 + 0.5 * torch.cos(60 * (xx - 0.5) ** 2 + 60 * (yy - 0.5) ** 2)], -1)
coords, colors = torch.stack([xx, yy], -1).reshape(-1, 2), img.reshape(-1, 3)

enc = HashEncoding(D=2, L=16, F=2, log2_T=15, N_min=16, N_max=512)
mlp = nn.Sequential(nn.Linear(32, 64), nn.ReLU(), nn.Linear(64, 3))
opt = torch.optim.Adam([{"params": enc.parameters()}, {"params": mlp.parameters(), "weight_decay": 1e-6}],
                       lr=1e-2, betas=(0.9, 0.99), eps=1e-15)
for step in range(1001):
    idx = torch.randint(0, coords.shape[0], (2 ** 14,))
    loss = ((mlp(enc(coords[idx])) - colors[idx]) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 250 == 0:
        with torch.no_grad():
            mse = ((mlp(enc(coords)) - colors) ** 2).mean()
        print(f"step {step:4d}  full-image PSNR {-10 * torch.log10(mse).item():.1f} dB")
```

On a CPU (single thread) this reaches above 40 dB within a few hundred steps (our run printed 45.8 dB at step 250), even though the finest levels have about eight times more vertices than table entries. Two remarks on the code:

- The integer products such as $511 \times 2\,654\,435\,761$ fit comfortably in `int64`; the CUDA implementation uses `uint32` arithmetic with wrap-around, which gives different but equally good hashes.
- The loop over levels launches many small kernels. Real implementations ([tiny-cuda-nn](https://github.com/NVlabs/tiny-cuda-nn), or the pure-PyTorch-friendly variants in nerfstudio and nerfacc) process all levels and corners in one fused kernel and write the backward pass by hand.

The figure is a NumPy re-run of this test that also compares table sizes.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-hash-fit.svg" caption="The 2D test above, re-implemented in NumPy (same encoding, MLP, Adam settings and batch size; 300 steps; PSNR measured on every other pixel). Top left: the $512\times512$ target. Top right: the reconstruction with $T=2^{15}$ after 300 steps (46.0 dB; the PyTorch run in the text printed 45.8 dB at step 250). Bottom: PSNR versus step for four table sizes. With $T=2^{19}$ every level fits and nothing collides, so its gap to $T=2^{15}$ is the price of hashing; $T=2^{10}$ and $2^{12}$ show the memory-quality knob of section 4.2." %}

To use it in the NeRF of post 2, normalize sample positions into $[0,1]^3$ (with a scene contraction for unbounded scenes), replace `positional_encoding(x, L_x)` by `HashEncoding(D=3)(x)`, and shrink the MLP to one or two hidden layers of width 64.

## 5. Zip-NeRF: anti-aliasing meets grids

Grid methods are fast but **alias**: a hash grid is queried at points, so the cone-based prefiltering of Mip-NeRF (integrated positional encoding) does not apply directly. **Zip-NeRF** (Barron et al., ICCV 2023) combines Mip-NeRF 360 with an Instant-NGP-style grid:

- **Multisampling.** Each conical frustum is represented by a small set of points arranged on a spiral inside it, and the hash features of those points are averaged, approximating the integral of the feature over the frustum.
- **Scale-aware downweighting.** Features from grid levels whose cell size is smaller than the frustum's footprint are attenuated: a feature at a level with resolution $n$ is scaled by $\operatorname{erf}\!\big(1/\sqrt{8\sigma^2 n^2}\big)$, where $\sigma$ is the standard deviation of the frustum's Gaussian. This is a soft version of IPE's $e^{-\sigma^2/2}$ factor.
- **Anti-aliased interlevel loss** between the proposal networks and the NeRF, which removes the z-aliasing ("banding") of Mip-NeRF 360's proposal supervision.

The figure illustrates the first two ideas.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-zipnerf.svg" caption="Top: Zip-NeRF's multisampling, schematically: the conical frustum of one ray interval (purple) is represented by 6 points on a spiral inside it, whose hash features are averaged. Bottom: the downweighting factor $\mathrm{erf}(1/\sqrt{8\sigma^2 n^2})$ as a function of $\sigma n$, the frustum's standard deviation measured in grid cells. Orange dots: the 16 levels of the 2D test ($n$ from 16 to 512) for a footprint $\sigma=1/64$. Coarse levels pass almost unchanged; levels whose cells are much smaller than the footprint are attenuated towards 0." %}

The paper reports error rates 8%–77% lower than either Mip-NeRF 360 or grid-based baselines and training 24× faster than Mip-NeRF 360. Zip-NeRF remained one of the strongest quality references on the Mip-NeRF 360 benchmark well into the Gaussian splatting era.

## 6. Baking for real-time rendering

Even an Instant-NGP model renders at only interactive rates for large images, because every pixel still marches a ray. A line of work **bakes** a trained field into rasterization-friendly assets: sparse grids with small deferred decoders (SNeRG, Hedman et al., ICCV 2021), textured polygons with a tiny view-dependent shader (MobileNeRF, Chen et al., CVPR 2023), low-memory hybrid grids for the web (MERF, Reiser et al., SIGGRAPH 2023), and meshes from SDFs (BakedSDF, Yariv et al., SIGGRAPH 2023). These reach real-time frame rates on phones, but each needs a separate optimization stage and often trades quality. 3DGS (post 4) removed that trade-off by training directly in a representation that rasterizes in real time.

## 7. Tooling: nerfstudio and friends

You rarely implement these systems from scratch. **nerfstudio** (Tancik et al., SIGGRAPH 2023 conference) is a modular PyTorch framework with a common data format, a web viewer, data processing wrappers for COLMAP and phone capture apps, and export tools. Its default method **nerfacto** combines ideas from this post and post 2: hash grid encoding, a proposal network with scene contraction, per-image appearance embeddings (from NeRF-W) and camera pose refinement.

```bash
pip install nerfstudio
ns-download-data nerfstudio --capture-name=poster        # a sample capture
ns-train nerfacto --data data/nerfstudio/poster          # opens the web viewer
ns-render camera-path --load-config outputs/poster/nerfacto/<timestamp>/config.yml \
    --camera-path-filename camera_path.json --output-path renders/poster.mp4
```

`ns-process-data images --data <folder> --output-dir <out>` runs COLMAP for your own photos. The same framework hosts Gaussian splatting as **splatfacto** (built on the gsplat library), which we will use in post 6. Other useful tools: [instant-ngp](https://github.com/NVlabs/instant-ngp) (the original, with a GUI and VR mode), [nerfacc](https://github.com/nerfstudio-project/nerfacc) (occupancy-grid sampling as a PyTorch library) and [tiny-cuda-nn](https://github.com/NVlabs/tiny-cuda-nn).

## Try it

The fast-field idea of "local, explicit parameters plus a cheap renderer" is what makes the Gaussian World demo in the [interactive lab]({{ '/' | relative_url }}#lab) possible in a browser: each frame it only sorts and rasterizes primitives, with no network evaluation. Try the lab before reading post 4, and compare its frame rate with how long one NeRF frame takes on your machine with the code from post 2.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| PlenOctrees for Real-time Rendering of Neural Radiance Fields (Yu et al.) | ICCV | 2021 | [arXiv](https://arxiv.org/abs/2103.14024) | SH outputs + octree baking, real-time NeRF rendering |
| Plenoxels: Radiance Fields without Neural Networks (Fridovich-Keil, Yu et al.) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2112.05131) | Sparse SH voxel grid, no MLP |
| Direct Voxel Grid Optimization (Sun et al.) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2111.11215) | Density + feature grids, post-activation |
| TensoRF: Tensorial Radiance Fields (Chen et al.) | ECCV | 2022 | [arXiv](https://arxiv.org/abs/2203.09517) | CP / VM tensor factorization |
| Instant Neural Graphics Primitives with a Multiresolution Hash Encoding (Müller et al.) | ACM TOG (SIGGRAPH) | 2022 | [arXiv](https://arxiv.org/abs/2201.05989) | Hash grids + tiny fused MLPs, seconds-scale NeRF |
| K-Planes: Explicit Radiance Fields in Space, Time, and Appearance (Fridovich-Keil et al.) | CVPR | 2023 | [arXiv](https://arxiv.org/abs/2301.10241) | Planar factorization for static and dynamic scenes |
| Nerfstudio: A Modular Framework for Neural Radiance Field Development (Tancik et al.) | SIGGRAPH (Conf.) | 2023 | [arXiv](https://arxiv.org/abs/2302.04264) | The standard toolbox, nerfacto |
| Zip-NeRF: Anti-Aliased Grid-Based Neural Radiance Fields (Barron et al.) | ICCV | 2023 | [arXiv](https://arxiv.org/abs/2304.06706) | Anti-aliasing for hash grids, quality reference |

## Learning resources

- [Instant-NGP project page](https://nvlabs.github.io/instant-ngp/) and [code](https://github.com/NVlabs/instant-ngp); [tiny-cuda-nn](https://github.com/NVlabs/tiny-cuda-nn) for the fused MLP and encodings.
- [nerfstudio documentation](https://docs.nerf.studio/), especially the "Nerfology" pages that explain each method's components.
- The official code of [Plenoxels (svox2)](https://github.com/sxyu/svox2), [DVGO](https://github.com/sunset1995/DirectVoxGO) and [TensoRF](https://github.com/apchenstu/TensoRF), each a few thousand lines and readable.
- [Zip-NeRF project page](https://jonbarron.info/zipnerf/).
- Spherical harmonics for graphics: P.-P. Sloan, "Stupid Spherical Harmonics (SH) Tricks" (GDC 2008), and R. Green, "Spherical Harmonic Lighting: The Gritty Details" (2003).

## Exercises

1. Compute the memory of a dense $256^3$ Plenoxels grid with density and degree-2 SH in float32, and of a TensoRF VM model with $R=16$ components per axis at the same resolution.
2. Replace the hash encoding in the 2D test by the frequency encoding of post 2 (`positional_encoding`, $L=10$) with a 4-layer MLP of width 128. How many steps does it need to reach 30 dB?
3. Set `log2_T = 10` and then `log2_T = 20` in the 2D test and plot PSNR versus table size. Where does it saturate?
4. Implement DVGO-style post-activation in 1D: a grid of raw densities on $[0,1]$ with 8 cells, and show that interpolating before the activation can produce a sharper opacity step than interpolating after.
5. Plug `HashEncoding` into the NeRF of post 2, with a one-hidden-layer density MLP, and compare training speed per PSNR on the toy scene.

**Next:** [post 4]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) abandons ray marching altogether: 3D Gaussian Splatting represents the scene with millions of explicit anisotropic Gaussians and rasterizes them in real time.
