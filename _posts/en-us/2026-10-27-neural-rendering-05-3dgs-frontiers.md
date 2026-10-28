---
layout: post
title: "Beyond 3DGS: a map of the Gaussian splatting frontier"
date: 2026-10-27 12:05:00+0900
description: "A structured survey of what came after 3D Gaussian Splatting: anti-aliasing, surfaces, dynamic scenes, compression, SLAM, feed-forward reconstruction, generation, relighting, physics, semantics and AR/VR, with the key idea and representative papers of each direction."
categories: neural-rendering
tags: [3d-gaussian-splatting, survey, mip-splatting, 2dgs, 4dgs, slam, feed-forward, text-to-3d, physgaussian, vr]
series: neural-rendering
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## Why this matters

[Post 4]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) covered the original 3DGS method. Within a year of its publication there were hundreds of follow-ups, and by now Gaussians are used far beyond novel view synthesis: as maps for robots, as outputs of feed-forward and generative models, as simulation particles, and as the content format for web and VR viewers. This post is a **map**, not an exhaustive list. For each direction it explains what limitation of vanilla 3DGS is addressed, the key technical idea (often a single equation), and two or three representative papers to read first. Use the reading list at the end of the series for more.

A useful way to organize the field is by which part of the 3DGS pipeline a paper changes:

| Pipeline stage | What gets changed | Directions in this post |
| --- | --- | --- |
| Primitive | shape, dimensionality, attributes | surfaces (2D/flat Gaussians), dynamics (4D), semantics, relighting |
| Projection and rasterization | filtering, sorting, ray tracing | anti-aliasing, popping, ray-traced Gaussians |
| Optimization | densification, regularizers, losses | MCMC densification, surface regularizers, compression |
| Where parameters come from | per-scene optimization vs networks | SLAM, feed-forward reconstruction, generation |
| What happens after | simulation, editing, display | physics, AR/VR |

## Prerequisites

- The full 3DGS method: covariance, EWA projection, blending, density control (post 4).
- NeRF follow-ups (Mip-NeRF, NeRF-W; post 2), and K-Planes (post 3).
- For SLAM and feed-forward models: camera poses (post 1) and basic transformers/diffusion models.

## 1. Anti-aliasing: Mip-Splatting

**Problem.** 3DGS adds a fixed $0.3\,I$ dilation in screen space (post 4, section 2.1). Train at one resolution and render at a much higher one (zoom in), and Gaussians that were sub-pixel during training become thin, high-frequency artefacts; render at a lower resolution (zoom out) and the dilation makes everything look too thick and bright, because it adds energy without normalization.

**Key idea.** **Mip-Splatting** (Yu, Chen, Huang, Sattler & Geiger, CVPR 2024) uses two filters:

- A **3D smoothing filter** limits the frequency of each Gaussian based on the maximal sampling rate of the training views. For Gaussian $k$, $\hat\nu_k = \max_n f_n / d_{k,n}$ over training cameras $n$ that see it (focal length in pixels over depth). The Gaussian is convolved with an isotropic Gaussian of variance $s/\hat\nu_k^2$, and the opacity is rescaled so the integral is preserved:

$$
\Sigma_k \leftarrow \Sigma_k + \frac{s}{\hat\nu_k^{2}}\, I,
\qquad
o_k \leftarrow o_k \sqrt{\frac{\lvert \Sigma_k \rvert}{\lvert \Sigma_k + \frac{s}{\hat\nu_k^{2}} I \rvert}} .
$$

  The filter becomes part of the Gaussian, so it is applied consistently from every viewpoint, and it prevents Gaussians from becoming thinner than the data can justify.
- A **2D Mip filter** replaces the dilation with a normalized Gaussian approximating a one-pixel box filter, $\Sigma'_{2D} = \Sigma' + sI$ with $o$ scaled by $\sqrt{\lvert\Sigma'\rvert / \lvert \Sigma' + sI\rvert}$, which simulates the integration over a pixel area when zooming out.

```python
import numpy as np

def max_sampling_rate(means, cams):
    """nu_k = max over training cameras that see Gaussian k of focal / depth (pixels per world unit)."""
    nu = np.zeros(len(means))
    for R, t, f, W, H in cams:
        Xc = means @ R.T + t
        z = Xc[:, 2]
        u, v = f * Xc[:, 0] / np.maximum(z, 1e-6) + W / 2, f * Xc[:, 1] / np.maximum(z, 1e-6) + H / 2
        visible = (z > 0.2) & (u >= 0) & (u < W) & (v >= 0) & (v < H)
        nu = np.where(visible, np.maximum(nu, f / np.maximum(z, 1e-6)), nu)
    return nu

def smooth_3d(Sigma, opacity, nu, s=0.2):
    """Mip-Splatting 3D smoothing: convolve each Gaussian with an isotropic Gaussian of
    variance s / nu^2 and rescale opacity so that the integral stays the same."""
    add = (s / np.maximum(nu, 1e-6) ** 2)[:, None, None] * np.eye(3)
    Sigma_f = Sigma + add
    scale = np.sqrt(np.linalg.det(Sigma) / np.linalg.det(Sigma_f))
    return Sigma_f, opacity * scale

def mip_filter_2d(cov2d, opacity, s=0.1):
    """Replace 3DGS's '+0.3 I' dilation by a normalized 2D filter approximating a 1-pixel box."""
    cov_f = cov2d + s * np.eye(2)
    return cov_f, opacity * np.sqrt(np.linalg.det(cov2d) / np.linalg.det(cov_f))
```

Mip-Splatting is the 3DGS counterpart of Mip-NeRF's integrated positional encoding: in both cases a point sample is replaced by a footprint-aware, low-passed one. It is cheap and implemented as an option in gsplat; consider enabling it whenever renders will be viewed at resolutions different from the capture, which is the norm in VR.

## 2. Surfaces and geometry

**Problem.** 3DGS optimizes appearance, not geometry. Its Gaussians are volumetric blobs whose depth along a ray is ill-defined, normals do not exist, and extracting a mesh with marching cubes on the opacity yields noisy, bumpy surfaces. Robotics, physics and editing all need surfaces.

**Key ideas.**

- **SuGaR** (Guédon & Lepetit, CVPR 2024) adds a regularizer that drives Gaussians to be flat and well distributed on the surface, so that the density can be approximated by an SDF-like function near the surface. A mesh is then extracted with Poisson reconstruction from level-set samples, and new Gaussians are bound to the mesh triangles for joint refinement, giving an editable, animatable hybrid.
- **2D Gaussian Splatting** (Huang, Yu, Chen, Geiger & Gao, SIGGRAPH 2024) collapses each primitive to an oriented planar disk (a **surfel**) with two tangent vectors $\mathbf t_u, \mathbf t_v$ and two scales $s_u, s_v$. A point on the disk is $P(u,v) = \mathbf p_k + s_u \mathbf t_u u + s_v \mathbf t_v v$, the normal is $\mathbf t_u \times \mathbf t_v$, and instead of EWA linearization each pixel's ray is **intersected** exactly with the disk's plane, giving perspective-correct, view-consistent depth. Two regularizers make it geometry-aware: a depth-distortion loss (from Mip-NeRF 360) that concentrates weights along each ray, and a normal-consistency loss that aligns the splat normals with normals computed from the rendered depth map. Meshes are extracted by TSDF fusion of rendered depth.
- **Gaussian Opacity Fields (GOF)** (Yu, Sattler & Geiger, ACM TOG / SIGGRAPH Asia 2024) define a continuous opacity field directly from 3D Gaussians via ray–Gaussian intersection, and extract the surface as a level set with marching tetrahedra on a grid induced by the Gaussians, which handles unbounded scenes and adapts resolution to detail.

The general lesson: if you need geometry, choose a primitive whose depth and normal are well defined (flat Gaussians or disks) and add geometric regularization. 2DGS-style surfels have become a common choice in mapping and robotics pipelines.

## 3. Dynamic scenes

**Problem.** 3DGS assumes a static scene. For moving people, objects or deformable scenes we need the Gaussians to change over time while staying consistent, from multi-view video or even a single monocular video.

Four designs dominate:

1. **Per-frame tracking.** **Dynamic 3D Gaussians** (Luiten, Kopanas, Leibe & Ramanan, 3DV 2024) keep colour, opacity and size fixed and optimize each Gaussian's position and rotation per time step, with **local rigidity** regularizers between neighbours. Dense 6-DoF tracking of every scene element emerges as a by-product, with no correspondence or flow supervision.
2. **Canonical space + deformation network.** **Deformable 3D Gaussians** (Yang et al., CVPR 2024) learn Gaussians in a canonical space and an MLP $\mathcal F_\theta(\gamma(\mathbf x), \gamma(t)) \mapsto (\delta\mathbf x, \delta\mathbf r, \delta\mathbf s)$ that deforms them at time $t$, trained on monocular video.
3. **Canonical space + factorized field.** **4D Gaussian Splatting** (Wu et al., CVPR 2024) replaces the MLP by a HexPlane-style decomposition (six feature planes over $xy, xz, yz, xt, yt, zt$, as in K-Planes of post 3) followed by a tiny decoder, which is faster and more compact; the paper reports real-time rendering (82 fps at $800\times800$ on synthetic data).
4. **Native 4D primitives.** In "Real-time Photorealistic Dynamic Scene Representation and Rendering with 4D Gaussian Splatting" (Yang et al., ICLR 2024), each primitive is a Gaussian in $(x, y, z, t)$. Rendering at time $t$ **conditions** it on $t$, which yields a 3D Gaussian whose mean moves linearly in time and whose opacity is modulated by the temporal marginal:

$$
\boldsymbol\mu_{xyz\mid t} = \boldsymbol\mu_{1:3} + \Sigma_{1:3,4}\,\Sigma_{4,4}^{-1}(t - \mu_4),
\qquad
\Sigma_{xyz\mid t} = \Sigma_{1:3,1:3} - \Sigma_{1:3,4}\,\Sigma_{4,4}^{-1}\,\Sigma_{4,1:3},
\qquad
p(t) \propto \exp\!\Big(-\tfrac{(t-\mu_4)^2}{2\Sigma_{4,4}}\Big).
$$

```python
def slice_4d(mu4, Sigma4, t):
    """Condition a 4D (x, y, z, t) Gaussian on time t: returns the 3D mean, 3D covariance and the
    temporal marginal p(t) (unnormalized), as in native 4D Gaussian splatting."""
    S11, S12, S22 = Sigma4[:3, :3], Sigma4[:3, 3], Sigma4[3, 3]
    mu3 = mu4[:3] + S12 / S22 * (t - mu4[3])
    Sigma3 = S11 - np.outer(S12, S12) / S22
    p_t = np.exp(-0.5 * (t - mu4[3]) ** 2 / S22)
    return mu3, Sigma3, p_t
```

Related designs include **Spacetime Gaussians** (Li et al., CVPR 2024), with polynomial motion and rotation, temporal radial-basis opacity, and neural features instead of SH, and articulated or rigged models such as **GaussianAvatars** (Qian et al., CVPR 2024), which attach Gaussians to the triangles of a parametric face model so that expressions and head pose drive them directly. Monocular dynamic reconstruction remains hard: a single moving camera does not constrain fast non-rigid motion, so the best systems add priors such as depth, optical flow, or point tracks from foundation models.

## 4. Compression and efficiency

**Problem.** A 3DGS scene often takes hundreds of megabytes to more than a gigabyte, mostly in the 48 SH coefficients, and contains many redundant Gaussians. That is too much for streaming, mobile and VR.

The toolbox, roughly in order of how aggressive it is:

- **Pruning by importance.** Score each Gaussian by how much it contributes to the training views (e.g. accumulated $\alpha_i T_i$ over all pixels) and remove the least useful. **LightGaussian** (Fan et al., NeurIPS 2024) combines such pruning with **SH distillation** to lower degrees and vector quantization, and reports an average compression of about 15× with a higher frame rate.
- **Learned masks and codebooks.** **Compact 3D Gaussian Representation** (Lee et al., CVPR 2024) learns a mask that removes Gaussians during training, stores view-dependent colour in a hash grid instead of per-Gaussian SH, and vector-quantizes geometry attributes.
- **Structured anchors.** **Scaffold-GS** (Lu et al., CVPR 2024) stores sparse anchor points with features and decodes local Gaussians on the fly with small MLPs conditioned on view direction and distance. It is more compact and more robust to view-dependent effects.
- **Entropy coding.** **HAC** (Chen et al., ECCV 2024) builds on Scaffold-GS and uses a binarized hash grid as context to model the distribution of anchor attributes for entropy coding, reporting more than 75× size reduction over vanilla 3DGS.

Practical formats have followed: viewers such as SuperSplat and Spark read compressed formats (e.g. SPZ and SOG) alongside the original `.ply`. For speed, the main tricks are fewer Gaussians (MCMC-style budgets, pruning), lower SH degrees, and better load balancing in the rasterizer.

## 5. Rendering quality and correctness

A few papers fix limitations of the renderer itself:

- **Popping.** Sorting by Gaussian centre per tile changes order abruptly under rotation. **StopThePop** (Radl et al., ACM TOG / SIGGRAPH 2024) approximates per-pixel sorting with a hierarchical rasterizer at about 4% extra cost on average, and finds that enforcing consistency lets it halve the number of Gaussians. This matters most in VR, where head rotation is constant.
- **Ray tracing.** **3D Gaussian Ray Tracing** (Moenne-Loccoz et al., SIGGRAPH Asia 2024) encloses Gaussians in bounding primitives inside a BVH and traces rays with hardware ray tracing, enabling distorted cameras (fisheye, rolling shutter), secondary rays for reflections and shadows, and exact per-ray ordering, at some speed cost.
- **Densification.** **3DGS as Markov Chain Monte Carlo** (Kheradmand et al., NeurIPS 2024) interprets the Gaussians as samples and the updates as stochastic gradient Langevin dynamics, replacing clone/split heuristics with relocation of dead Gaussians and a fixed budget, which is more robust to initialization.

## 6. SLAM: Gaussians as maps

**Problem.** A robot or headset needs to localize and map *online*, with unknown poses, from a stream of frames. Classic dense SLAM uses TSDF volumes, surfels or neural fields; Gaussians offer photorealistic, differentiable maps that can be rendered from any pose in milliseconds.

**Key idea.** Alternate **tracking**, optimizing the current camera pose by minimizing photometric (and depth) error between the incoming frame and the rendering of the map with the map frozen, and **mapping**, optimizing the Gaussians on keyframes with the poses frozen, while adding new Gaussians where the map is incomplete. Differentiable rasterization makes both steps gradient-based.

- **SplaTAM** (Keetha et al., CVPR 2024) targets RGB-D input. It renders a **silhouette** (accumulated opacity) to know which pixels the current map explains, uses only those for tracking, and densifies where the silhouette is low or new geometry appears in front of the map. It uses simplified isotropic, view-independent Gaussians.
- **Gaussian Splatting SLAM / MonoGS** (Matsuki, Murai, Kelly & Davison, CVPR 2024) is the first to work with a **monocular** camera (and extends to RGB-D). It derives analytic Jacobians of the rendering with respect to the camera pose on the Lie group $SE(3)$, regularizes Gaussians to stay isotropic for stable incremental mapping, and manages a keyframe window.

For embodied AI this is a key bridge: a Gaussian map is simultaneously a localization map, a photorealistic simulator for the robot's camera, and, with semantic features (section 10), a queryable scene representation.

## 7. Feed-forward reconstruction

**Problem.** Per-scene optimization takes minutes and needs many posed views. Can a network predict Gaussians from a few images in a single forward pass?

**Key idea.** Predict **pixel-aligned Gaussians**: for each pixel of each input view, the network outputs a depth along the pixel's ray (hence a 3D mean), a covariance, an opacity and a colour. Training uses large multi-view datasets with the same rendering loss as 3DGS, on held-out target views.

- **pixelSplat** (Charatan, Li, Tagliasacchi & Sitzmann, CVPR 2024) reconstructs a scene from an **image pair**. An epipolar transformer resolves scale, and instead of regressing depth directly, the network predicts a probability distribution over depth buckets and samples the Gaussian mean from it, using a reparameterization trick so gradients flow to the probabilities.
- **MVSplat** (Chen et al., ECCV 2024) builds a **plane-sweep cost volume** (the multi-view stereo of post 1, learned) to localize Gaussian centres, which is more geometric and reported to use 10× fewer parameters than pixelSplat while running more than 2× faster.
- The **large reconstruction model** line scales this up with transformers. **LRM** (Hong et al., ICLR 2024) predicts a triplane NeRF from a single image with a 500M-parameter transformer trained on about a million objects; **GS-LRM** (Zhang et al., ECCV 2024) patchifies posed images, runs a transformer over all tokens and decodes per-pixel Gaussians; **LGM** (Tang et al., ECCV 2024) maps four views (generated by a multi-view diffusion model) to Gaussians with an asymmetric U-Net within seconds.

Pose-free variants combine these ideas with DUSt3R/MASt3R/VGGT-style geometry networks (post 1), so that unposed photos go straight to splats. Feed-forward reconstruction is also how 3D world generation is increasingly built: a generator produces images or video, and a reconstruction network lifts them to Gaussians.

## 8. Generation: text and images to Gaussians

**Problem.** Create 3D content without captured data.

**Key idea 1: score distillation.** DreamFusion (post 2) optimizes a 3D representation $\theta$ so that its renderings $\mathbf x = g(\theta)$ look plausible to a frozen text-to-image diffusion model $\hat{\boldsymbol\epsilon}_\phi$, via the **score distillation sampling (SDS)** gradient

$$
\nabla_\theta \mathcal L_{\text{SDS}} = \mathbb E_{t, \boldsymbol\epsilon}\Big[ w(t)\,\big(\hat{\boldsymbol\epsilon}_\phi(\mathbf x_t; y, t) - \boldsymbol\epsilon\big)\, \frac{\partial \mathbf x}{\partial \theta} \Big],
$$

where $\mathbf x_t$ is the noised rendering at noise level $t$ and $y$ the prompt. Gaussians are a far faster $\theta$ than NeRFs: **DreamGaussian** (Tang et al., ICLR 2024) runs SDS on Gaussians with progressive densification, then extracts a textured mesh and refines its UV texture, producing assets in minutes. **GaussianDreamer** (Yi et al., CVPR 2024) initializes the Gaussians from a 3D diffusion model's coarse output and refines them with 2D diffusion, combining 3D consistency with 2D detail.

**Key idea 2: generate views, then reconstruct.** Multi-view diffusion models generate a consistent set of views, and a feed-forward model (LGM, GS-LRM, section 7) turns them into Gaussians. This is faster and avoids SDS's oversaturation, and it extends to scenes: video or panorama generators followed by reconstruction produce explorable Gaussian worlds, the idea behind products such as World Labs' Marble, which the Gaussian World demo on the home page imitates procedurally.

## 9. Relighting and inverse rendering

**Problem.** 3DGS bakes the capture's lighting into SH colour, so a captured object cannot be placed under new lighting, which is exactly what AR and content creation need.

**Key idea.** Give each Gaussian **physically based attributes** (a normal, albedo, roughness, metallic) and model lighting explicitly (an environment map plus visibility), then render with a differentiable shading model, essentially the BRDF machinery of the PBR post, evaluated per Gaussian or per pixel in a deferred pass. The hard parts are normals (Gaussians have none, so they are derived from the shortest axis or from rendered depth) and visibility.

- **Relightable 3D Gaussians** (Gao et al., ECCV 2024) attach normals, BRDF parameters and incident lighting to each Gaussian, decompose them with physically based differentiable rendering, and compute visibility by **point-based ray tracing** on a BVH over Gaussians, enabling relighting with shadows.
- **GS-IR** (Liang et al., CVPR 2024) regularizes normals with rendered depth and **bakes occlusion** into a volume to approximate indirect illumination, recovering geometry, materials and lighting under unknown illumination.

The Gaussian World demo takes the opposite route: its Gaussians are generated with albedo and normals rather than inverted from photos, so it can relight them for any time of day by construction.

## 10. Physics, semantics and editing

**Physics.** Gaussians are particles, so they can be simulated. **PhysGaussian** (Xie et al., CVPR 2024) treats each Gaussian as a particle of a Material Point Method (MPM) continuum simulation. When the material deforms with local deformation gradient $\mathbf F$, the covariance deforms accordingly,

$$
\Sigma_t = \mathbf F_t\, \Sigma_0\, \mathbf F_t^\top ,
$$

and the SH coefficients are rotated by the rotational part of $\mathbf F_t$, so that "what you see is what you simulate" without converting to meshes. **VR-GS** (Jiang et al., SIGGRAPH 2024) builds an interactive VR system that embeds Gaussians in tetrahedral cages simulated with **XPBD** (extended position-based dynamics) for real-time manipulation, with segmentation, inpainting and shadows. The XPBD cloth demo in the [interactive lab]({{ '/' | relative_url }}#lab) uses the same solver family.

**Semantics.** Attaching features to Gaussians makes scenes queryable. **LangSplat** (Qin et al., CVPR 2024) distills CLIP language features, organized by SAM's hierarchy of masks, into per-Gaussian latent features through a scene-specific autoencoder, enabling open-vocabulary 3D queries ("where is the mug?") much faster than NeRF-based language fields. This is the representation that robots can use to ground instructions in a 3D map.

**Editing.** Because Gaussians are explicit, selection, deletion, transformation and compositing are straightforward, which tools such as SuperSplat expose interactively. Diffusion-guided editing methods modify appearance or geometry with text instructions.

## 11. AR and VR

**Why Gaussians suit XR.** They render photoreal captures at high frame rates with a simple rasterizer, run in browsers and on standalone headsets, and require no meshing or texture baking.

**What makes XR hard.**

- **Frame budget.** Stereo rendering at 72–120 Hz per eye on mobile GPUs leaves a few milliseconds for millions of Gaussians, on top of sorting. Compression and Gaussian budgets (section 4) and level-of-detail streaming are therefore essential; web renderers such as Spark (World Labs) now stream large splat scenes with level of detail across desktop, mobile and VR.
- **Artefacts are more visible.** Popping (section 5) under constant head motion, aliasing when the viewer moves closer than the capture (section 1), and inconsistent depth between the two eyes all break immersion. Mip filtering and consistent sorting help.
- **Foveated rendering.** Rendering fewer or larger Gaussians in the periphery exploits the falloff of visual acuity; see the foveated rendering demo in the lab for the underlying idea.
- **Interaction and relighting.** Placing virtual objects into a captured room needs consistent lighting (section 9), occlusion from accurate depth (section 2) and physics (section 10); VR-GS is a good example of putting these together.

For research at the intersection with HCI, open questions include perceptual quality metrics for splats in VR, interaction techniques for selecting and editing millions of soft primitives, and capture interfaces that guide users to collect good coverage (post 6).

## Try it

The [interactive lab]({{ '/' | relative_url }}#lab) connects to several sections: Gaussian World (rendering, and generation by a procedural stand-in, section 8; relightable Gaussians, section 9), XPBD cloth (the physics family used by VR-GS, section 10) and foveated rendering (section 11).

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Mip-Splatting: Alias-free 3D Gaussian Splatting (Yu et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.16493) | 3D smoothing + 2D Mip filter |
| SuGaR: Surface-Aligned Gaussian Splatting (Guédon & Lepetit) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.12775) | Mesh extraction and mesh-bound Gaussians |
| 2D Gaussian Splatting for Geometrically Accurate Radiance Fields (Huang et al.) | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2403.17888) | Surfels with exact ray–splat intersection |
| Gaussian Opacity Fields (Yu, Sattler & Geiger) | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2404.10772) | Level-set surfaces in unbounded scenes |
| Dynamic 3D Gaussians (Luiten et al.) | 3DV | 2024 | [arXiv](https://arxiv.org/abs/2308.09713) | Per-frame Gaussians, dense tracking |
| Deformable 3D Gaussians (Yang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2309.13101) | Canonical space + deformation MLP |
| 4D Gaussian Splatting for Real-Time Dynamic Scene Rendering (Wu et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2310.08528) | HexPlane deformation field |
| Real-time Photorealistic Dynamic Scene Representation and Rendering with 4D Gaussian Splatting (Yang et al.) | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2310.10642) | Native 4D primitives sliced in time |
| Spacetime Gaussian Feature Splatting (Li et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.16812) | Temporal opacity, polynomial motion |
| GaussianAvatars (Qian et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.02069) | Gaussians rigged to a face model |
| LightGaussian (Fan et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2311.17245) | Pruning + SH distillation + quantization |
| Compact 3D Gaussian Representation for Radiance Field (Lee et al.) | CVPR | 2024 | [CVF](https://openaccess.thecvf.com/content/CVPR2024/papers/Lee_Compact_3D_Gaussian_Representation_for_Radiance_Field_CVPR_2024_paper.pdf) | Learned masks, grid colour, codebooks |
| Scaffold-GS (Lu et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.00109) | Anchor-based structured Gaussians |
| HAC: Hash-grid Assisted Context for 3DGS Compression (Chen et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2403.14530) | Entropy coding of anchors |
| StopThePop (Radl et al.) | ACM TOG (SIGGRAPH) | 2024 | [arXiv](https://arxiv.org/abs/2402.00525) | View-consistent sorting, no popping |
| 3D Gaussian Ray Tracing (Moenne-Loccoz et al.) | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2407.07090) | BVH ray tracing of Gaussians |
| 3D Gaussian Splatting as Markov Chain Monte Carlo (Kheradmand et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2404.09591) | Principled densification |
| SplaTAM (Keetha et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.02126) | RGB-D Gaussian SLAM |
| Gaussian Splatting SLAM (Matsuki et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.06741) | Monocular Gaussian SLAM |
| pixelSplat (Charatan et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.12337) | Feed-forward Gaussians from image pairs |
| MVSplat (Chen et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2403.14627) | Cost-volume feed-forward Gaussians |
| LRM: Large Reconstruction Model for Single Image to 3D (Hong et al.) | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2311.04400) | Transformer image-to-3D at scale |
| GS-LRM (Zhang et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2404.19702) | Transformer to per-pixel Gaussians |
| LGM: Large Multi-View Gaussian Model (Tang et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2402.05054) | Multi-view diffusion + U-Net to Gaussians |
| DreamGaussian (Tang et al.) | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2309.16653) | SDS on Gaussians, minutes per asset |
| GaussianDreamer (Yi et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2310.08529) | 3D-diffusion init + 2D-diffusion refinement |
| Relightable 3D Gaussians (Gao et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2311.16043) | BRDF decomposition + point ray tracing |
| GS-IR: 3D Gaussian Splatting for Inverse Rendering (Liang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.16473) | Normals, baked occlusion, materials |
| PhysGaussian (Xie et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.12198) | MPM simulation of Gaussians |
| VR-GS (Jiang et al.) | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2401.16663) | Interactive physics-aware Gaussians in VR |
| LangSplat (Qin et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.16084) | Open-vocabulary language fields on Gaussians |

## Learning resources

- The official code of most papers above is linked from their arXiv pages; [gsplat](https://github.com/nerfstudio-project/gsplat) implements several of them (Mip-Splatting filters, MCMC densification, 2DGS rasterization) behind one API.
- The [radiancefields.com](https://radiancefields.com/) news site tracks new Gaussian splatting papers, tools and products.
- The reading list `docs/reading-lists/neural-rendering.md` in the repository of this website groups the papers by stage.
- For the graphics background of sections 9–10, the PBR and simulation posts of the graphics series.

## Exercises

1. Show that convolving a Gaussian of covariance $\Sigma$ (peak 1, opacity $o$) with a normalized isotropic Gaussian of variance $v$ gives a Gaussian of covariance $\Sigma + vI$ and peak $o\sqrt{\lvert\Sigma\rvert/\lvert\Sigma+vI\rvert}$. This is the opacity rescaling of Mip-Splatting.
2. Verify `slice_4d` numerically: sample from a random 4D Gaussian, keep the samples with $\lvert t - t_0\rvert < \varepsilon$, and compare their mean and covariance with the formula.
3. In the PyTorch renderer of post 4, replace the `+ 0.3 * I` dilation by `mip_filter_2d` and compare renders at $0.5\times$ and $4\times$ the training resolution.
4. Sketch a SplaTAM-style tracking step with the renderer of post 4: freeze the Gaussians, make the camera rotation (axis-angle) and translation learnable, and minimize L1 to a target image rendered from a perturbed pose.
5. Pick one direction and read its two representative papers. Write a half-page summary of what problem each solves, its key equation, and one failure case.

**Next:** [post 6]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }}) is hands-on: capture your own scene, run COLMAP, train a splat, and look at it on the web and in VR.
