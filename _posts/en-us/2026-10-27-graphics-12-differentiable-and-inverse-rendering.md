---
layout: post
title: "Differentiable and inverse rendering: gradients through pixels"
date: 2026-10-27 09:12:00+0900
description: "Why gradients of images are hard (visibility makes Dirac deltas), how soft rasterizers, nvdiffrast, edge sampling, reparameterization and path-space methods fix it, Mitsuba 3, inverse rendering in practice, and three PyTorch experiments you can run."
categories: graphics
tags: [differentiable-rendering, inverse-rendering, soft-rasterizer, edge-sampling, mitsuba, pytorch]
series: graphics
series_order: 12
toc:
  sidebar: left
related_posts: false
---

## Why this matters

Every post so far has gone *forward*: given a scene (geometry, materials, lights, camera), produce an image by [rasterization]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }}) or [path tracing]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}). Most problems in 3D vision run the other way: we have photographs and want the scene. **Inverse rendering** recovers shape, materials, lighting or camera from images, and the most general way to do it is to make the renderer **differentiable** and let gradient descent adjust the scene until its rendering matches the photographs. This is exactly the engine underneath [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) and [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}), so this chapter is the bridge from classical graphics to the neural-rendering series.

The difficulty is surprisingly specific: derivatives with respect to colors are easy, but derivatives with respect to *where things are* run into visibility, which is discontinuous. Most of this chapter is about that one problem and the half-dozen clever ways people have found around it.

## Prerequisites

- The rendering equation and BRDFs from [physically based rendering]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}); Monte Carlo integration from [path tracing]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}).
- Triangle rasterization and coverage from [post 2]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }}).
- The chain rule, gradient descent and Adam; basic PyTorch (`requires_grad`, `backward`).
- The Dirac delta $\delta(x)$ as "the derivative of a step": $\frac{d}{dx}H(x) = \delta(x)$, where $H$ is the Heaviside step ($H(x)=1$ for $x>0$, else $0$) and $\int g(x)\,\delta(x-a)\,dx = g(a)$.

## 1. Forward versus inverse rendering

Write the scene as a parameter vector $\theta$: vertex positions, BRDF parameters per texel, light intensities, camera pose. A renderer is a function $R$ that maps $\theta$ to an image $I = R(\theta) \in \mathbb{R}^{P}$ ($P$ pixels times color channels). Given target photographs $I^\star$, inverse rendering solves

$$
\theta^\star = \arg\min_\theta \; \mathcal{L}\big(R(\theta), I^\star\big) + \mathcal{R}(\theta),
$$

where $\mathcal{L}$ is an image loss (for example the mean squared error $\frac{1}{P}\lVert R(\theta)-I^\star \rVert^2$) and $\mathcal{R}$ is a regularizer that encodes prior knowledge (smooth surfaces, plausible materials). This is **analysis by synthesis** (analysis-by-synthesis): we explain an image by synthesizing it. Gradient descent needs

$$
\frac{\partial \mathcal{L}}{\partial \theta} = \Big(\frac{\partial I}{\partial \theta}\Big)^{\!\top} \frac{\partial \mathcal{L}}{\partial I},
$$

and the vector $\partial\mathcal{L}/\partial I$ (one number per pixel) is trivial to compute. Everything hard sits in the Jacobian $\partial I/\partial\theta$, which we never form explicitly: reverse-mode differentiation multiplies $\partial\mathcal{L}/\partial I$ by it on the fly.

{% include blog_figure.liquid path="assets/img/blog/graphics/12-pipeline.svg" localized="true" caption="The analysis-by-synthesis loop. The forward pass renders the current scene parameters $\theta$ and compares the result with photographs; the backward pass (red, dashed) carries $\partial\mathcal{L}/\partial\theta$ back through the renderer so that an optimizer can update $\theta$." %}

**What can be recovered.** With enough views and a good renderer, all four groups: shape (vertices, signed distance fields, densities), materials (albedo, roughness, normal maps, full spatially varying BRDFs, called SVBRDFs), lighting (environment maps, point lights) and camera (pose, intrinsics).

**What cannot, at least not from a single image.** Inverse rendering is full of *ambiguities*, different scenes that produce the same pixels:

- *Albedo versus light intensity*: doubling the light and halving the albedo gives the same diffuse image.
- *Shape versus shading*: a bump lit from above looks like a dent lit from below (the bas-relief ambiguity in shape from shading).
- *Roughness versus light size*: a blurry highlight can be a rough surface under a small light or a shiny one under a large light.
- *Texture versus geometry*: a painted shadow is indistinguishable from a real one in one view.

More views, known lighting, and priors (the regularizer $\mathcal{R}$, or a learned prior) are what break these ties. Keep the list in mind: when an optimization "fails", it has often found a different member of the same ambiguity family.

## 2. Gradients of an image

### Shading parameters are easy

Take one pixel of a diffuse surface under one light: $I = \frac{\rho}{\pi} E \max(0, \mathbf{n}\cdot\mathbf{l})$, with albedo $\rho$, irradiance $E$, normal $\mathbf{n}$ and light direction $\mathbf{l}$. Then $\partial I/\partial\rho = \frac{E}{\pi}\max(0,\mathbf{n}\cdot\mathbf{l})$: a smooth, well-defined number. The same holds for roughness inside a microfacet BRDF, light intensity, or a texel value: these parameters change *how bright* a point is, never *which* point a pixel sees. Ordinary automatic differentiation (autodiff) of the shader gives correct gradients, and Section 7.3 fits albedo and roughness exactly this way.

### Geometry creates discontinuities

Now move geometry. A pixel's value is an integral of the scene over the pixel footprint (the box filter of [post 2]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})), and the integrand jumps where an object's silhouette crosses the footprint. Let us work it out in 1D.

**The 1D example.** The pixel is the interval $[0,1]$. Left of an edge at position $\theta$ the scene has value $f_{\rm in}$ (the object); right of it, $f_{\rm out}$ (the background). The scene is

$$
f(x,\theta) = f_{\rm out} + (f_{\rm in} - f_{\rm out})\,H(\theta - x),
$$

and the true pixel value is its average over the pixel:

$$
I(\theta) = \int_0^1 f(x,\theta)\,dx = f_{\rm out} + (f_{\rm in} - f_{\rm out})\,\theta \qquad (0 \le \theta \le 1).
$$

This is a perfectly smooth ramp, with derivative $dI/d\theta = f_{\rm in}-f_{\rm out}$. Now differentiate *under* the integral sign instead:

$$
\frac{dI}{d\theta} = \int_0^1 \frac{\partial f}{\partial\theta}\,dx = (f_{\rm in}-f_{\rm out})\int_0^1 \delta(\theta - x)\,dx = f_{\rm in}-f_{\rm out}.
$$

Same answer, but notice *where* it came from: the entire derivative is concentrated on the single point $x=\theta$, the edge. A renderer, however, does not integrate analytically; it **samples**. It evaluates $f$ at sample points $x_k$ and averages:

$$
\hat I(\theta) = \frac{1}{N}\sum_{k=1}^{N} f(x_k, \theta).
$$

Each term is a step function of $\theta$, so $\hat I$ is a staircase. Its derivative is zero everywhere except at the $N$ points $\theta = x_k$, where it is infinite. Autodiff differentiates the code that computes $\hat I$, so it returns **exactly zero**: the probability that one of the sample points sits exactly on the edge is zero, so the delta is never "hit". In one sentence: *the derivative of the estimate is not an estimate of the derivative* when the integrand is discontinuous.

**Worked numbers.** Let $f_{\rm in}=0.8$, $f_{\rm out}=0.2$, $\theta=0.3$, and $N=4$ stratified samples at $x_k = 0.125, 0.375, 0.625, 0.875$.

- Exact: $I = 0.2 + 0.6\cdot 0.3 = 0.38$ and $dI/d\theta = 0.6$.
- Sampled: only $x_1 = 0.125$ lies left of the edge, so $\hat I = (0.8 + 3\cdot 0.2)/4 = 0.35$, and autodiff gives $0$.
- Finite difference (FD) on the sampled pixel with step $h$: for $h=0.01$ no sample crosses the edge, so the FD is $0$; for $h=0.1$ the edge passes $x_2=0.375$, $\hat I$ jumps to $0.5$, and the FD is $(0.5-0.35)/0.1 = 1.5$, which is 2.5 times too large.

```python
import torch

f_in, f_out = 0.8, 0.2
xs = (torch.arange(4) + 0.5) / 4                      # 4 stratified sample positions in [0, 1]

def pixel_sampled(theta):                             # what a renderer computes
    H = (torch.sign(theta - xs) + 1) / 2              # Heaviside H(theta - x); d sign/dx = 0 in PyTorch
    return (f_in * H + f_out * (1 - H)).mean()

def pixel_exact(theta):                               # the area integral, valid for 0 <= theta <= 1
    return f_in * theta + f_out * (1 - theta)

theta = torch.tensor(0.3, requires_grad=True)
for name, f in (("exact", pixel_exact), ("sampled", pixel_sampled)):
    I = f(theta)
    (g,) = torch.autograd.grad(I, theta)
    print(f"{name:8s} I = {I.item():.3f}  autodiff dI/dtheta = {g.item():.3f}")
for h in (0.01, 0.1):
    with torch.no_grad():
        fd = (pixel_sampled(theta + h) - pixel_sampled(theta)) / h
    print(f"FD of sampled pixel, h = {h}: {fd.item():.3f}")
```

```text
exact    I = 0.380  autodiff dI/dtheta = 0.600
sampled  I = 0.350  autodiff dI/dtheta = 0.000
FD of sampled pixel, h = 0.01: 0.000
FD of sampled pixel, h = 0.1: 1.500
```

The figure below shows the same functions over the whole range of $\theta$. On the left, the exact ramp, the one-sample step (a classic rasterizer that samples the pixel center) and the four-sample staircase. On the right, their derivatives: the exact box, the Dirac delta of the one-sample pixel, the zero line that autodiff returns, and the spiky FD.

{% include blog_figure.liquid path="assets/img/blog/graphics/12-edge-coverage.svg" caption="The 1D pixel $[0,1]$ (shaded) with an edge at $\theta$ ($f_{\rm in}=1$, $f_{\rm out}=0$ here). Left: the area integral is a ramp, while point sampling gives steps. Right: the exact derivative is a box of height 1 over the pixel; a one-sample pixel has a Dirac delta at its sample (arrow); autodiff of any sampled version gives the dotted zero line; finite differences of the 4-sample staircase (here $h=0.1$) give boxes of width $h$ and height $0.25/h=2.5$ wherever an edge crosses a sample." %}

### The general rule: interior term plus boundary term

In 2D the same calculation is the **Reynolds transport theorem** (Leibniz's rule for moving domains). Let a pixel $P$ have area $\lvert P\rvert$ and value $I = \frac{1}{\lvert P\rvert}\int_P f(\mathbf{x},\theta)\,d\mathbf{x}$, and let $f$ jump across a curve $\Gamma(\theta)$ (a silhouette edge). At a point on $\Gamma$ let $\mathbf{n}$ be the unit normal, $f^{-}$ the value on the side $\mathbf{n}$ points away from (inside the object), $f^{+}$ the value on the other side, and $\mathbf{v} = \partial\mathbf{x}_\Gamma/\partial\theta$ the velocity of the boundary point when $\theta$ changes. Then

$$
\frac{dI}{d\theta} = \underbrace{\frac{1}{\lvert P\rvert}\int_P \frac{\partial f}{\partial\theta}\,d\mathbf{x}}_{\text{interior term}} \; + \; \underbrace{\frac{1}{\lvert P\rvert}\int_{\Gamma\cap P} \big(f^{-}-f^{+}\big)\,(\mathbf{v}\cdot\mathbf{n})\,d\ell}_{\text{boundary term}}.
$$

The interior term is what autodiff of the shader gives you (shading, textures, lights). The boundary term is what it misses: the jump in value, times how fast the edge moves along its normal, integrated along the part of the edge inside the pixel. Derivation sketch: in a small step $\delta\theta$ the edge sweeps a thin strip of width $(\mathbf{v}\cdot\mathbf{n})\,\delta\theta$; inside that strip the value changes from $f^{+}$ to $f^{-}$, so the integral changes by $(f^{-}-f^{+})(\mathbf{v}\cdot\mathbf{n})\,\delta\theta$ per unit length of edge. The left panel of the next figure shows that strip; the right panel checks the formula numerically for a straight edge $\mathbf{n}\cdot\mathbf{x}=\theta$ crossing a unit pixel ($\mathbf{v}\cdot\mathbf{n}=1$, $f^{-}-f^{+}=1$). The derivative of the covered area equals the length $\ell(\theta)$ of the edge inside the pixel.

{% include blog_figure.liquid path="assets/img/blog/graphics/12-reynolds.svg" caption="Left: when the edge $\mathbf{n}\cdot\mathbf{x}=\theta$ moves by $\delta\theta$, the covered region (purple) grows by a strip (orange) of area about $\ell\,\delta\theta$. Right: the covered area $A(\theta)$ of the unit pixel (computed by polygon clipping), its finite-difference derivative (thick orange) and the clipped edge length $\ell(\theta)$ (dashed): the last two coincide, which is the boundary term of the Reynolds transport theorem." %}

The widget below lets you check this pixel by pixel. Drag the edge across an $8\times 8$ grid: the middle panel shows the finite-difference gradient of the renderer you choose (1 to 64 samples per pixel, or the exact area), and the right panel the boundary term, which is simply the edge length in each pixel.

{% include widget.liquid name="graphics-edge-gradient" height="440" caption="Drag the purple dot to move the edge and the ring to rotate it; the sliders choose the renderer (samples per pixel, or exact area) and the finite-difference step $h$. With 1 sample per pixel and a small $h$, almost every pixel's FD gradient is 0 and the few nonzero ones are huge. With exact area coverage, the FD map converges to the boundary term as $h \to 0$, and the sums $\Sigma$ agree." %}

### Finite differences versus edge sampling

Finite differences need one extra render per parameter, so they do not scale to millions of parameters, and they are noisy, as the 1D example shows. The boundary term suggests a better estimator, **edge sampling**: pick random points $\mathbf{x}_k$ on the silhouette with density $p(\mathbf{x}_k)$ (uniform along the edge: $p = 1/\text{length}$), look up the two sides, and average $(f^{-}-f^{+})(\mathbf{v}\cdot\mathbf{n})/p$. For a loss over the whole image, each edge sample contributes to the pixel it lands in, weighted by $\partial\mathcal{L}/\partial I$ of that pixel.

Let us measure both. A $32\times 32$ image contains a hard disc of radius $r$ over a target disc, rendered with 16 jittered samples per pixel, and we estimate $\partial\mathcal{L}/\partial r$ 300 times with each method. The reference is the boundary integral evaluated with 400,000 quadrature points. In the figure below, compare how widely the orange and purple point clouds scatter around the red dashed line.

{% include blog_figure.liquid path="assets/img/blog/graphics/12-fd-vs-edge.svg" caption="Estimates of $\partial\mathcal{L}/\partial r$ for the disc experiment (symmetric-log axis; the red dashed line is the reference; the black bars are the means). Finite differences (orange) with the same random samples for both renders: a large $h$ is smooth but biased, a small $h$ is unbiased but very noisy, because only a handful of samples change between the two renders (with $h=0.01$ some estimates even have the wrong sign). Edge sampling (purple) with $M$ points on the circle is centered on the reference, and its spread shrinks roughly like $1/\sqrt{M}$. Right: relative RMSE (FD: 0.80, 0.26, 0.96 for $h=1, 0.1, 0.01$; edge sampling: 0.67, 0.32, 0.18 for $M=16, 64, 256$). Note the cost: FD needs two renders per parameter, edge sampling gives all parameters from one pass." %}

## 3. Differentiable rasterization

Rasterizers resolve visibility with a z-buffer at pixel centers, the one-sample case above. Five systems, roughly in historical order, show the main ways to get useful gradients anyway.

**OpenDR** (Loper and Black, ECCV 2014) was the first general "approximate differentiable renderer". It keeps the ordinary rasterizer for the forward pass and approximates the derivative of pixel values with respect to their image position using image-space filters (finite differences of the rendered image), then chains that with the derivative of projected vertex positions. It was cheap and worked well for fitting body models such as SMPL to images.

**Neural 3D Mesh Renderer** (NMR; Kato, Ushiku and Harada, CVPR 2018) also keeps the hard forward pass but *defines* a backward pass. If moving a vertex by $\Delta x$ would make a pixel change color by $\Delta I$, it assigns that pixel the gradient $\Delta I/\Delta x$, a linear interpolation, so even pixels that the edge has not yet reached receive a signal. It is an engineered gradient, not the derivative of any function, but it made single-image 3D reconstruction with mesh supervision practical.

**Soft Rasterizer** (SoftRas; Liu, Li, Chen and Li, ICCV 2019) changes the forward pass itself so that it is smooth. Every triangle $j$ influences every pixel $i$ with a probability

$$
D_j^i = \operatorname{sigmoid}\!\Big(\delta_j^i\,\frac{d^2(i,j)}{\sigma}\Big),
$$

where $d(i,j)$ is the distance from the pixel center to the triangle's boundary, $\delta_j^i = +1$ inside and $-1$ outside, and $\sigma$ (in squared normalized-device-coordinate units) controls the blur. The silhouette is $1-\prod_j(1-D_j^i)$, and colors are blended with weights $w_j^i \propto D_j^i \exp(z_j^i/\gamma)$ (normalized inverse depth $z$, temperature $\gamma$) plus a background term, a softmax over depth instead of a hard z-test. As $\sigma,\gamma \to 0$ it becomes the ordinary rasterizer, and for $\sigma>0$ every pixel near an edge has a nonzero gradient.

{% include blog_figure.liquid path="assets/img/blog/graphics/12-softras-sigma.svg" caption="SoftRas probability map $D(x)$ of one triangle in a $64\times64$ image (normalized coordinates $[-1,1]$) for four values of $\sigma$. Top: as $\sigma$ grows, the hard silhouette (cyan outline) melts into a smooth bump whose gradient reaches pixels far from the edge. Bottom: the profiles along the dotted line. For $\sigma=10^{-5}$ the transition is narrower than a pixel ($2/64$), so gradients again vanish almost everywhere." %}

The figure shows the trade-off you have to manage: a large $\sigma$ gives long-range gradients but a blurry image that cannot match a sharp target; a small $\sigma$ is accurate but gives gradients only within a pixel or so of the edge. The usual fix, which we use in Section 7, is to **anneal** $\sigma$ from large to small during optimization.

**nvdiffrast** (Laine, Hellsten, Karras, Seol, Lehtinen and Aila; ACM TOG 39(6), SIGGRAPH Asia 2020) takes a different route that keeps the forward pass sharp. It splits rendering into four modular GPU primitives: *rasterize* (triangle IDs and barycentric coordinates per pixel), *interpolate* (vertex attributes), *texture* (filtered texture lookups with mipmaps) and *antialias*. The first three are differentiable in the ordinary sense with respect to everything inside triangles, which covers the interior term. The boundary term comes from *antialias*: wherever two neighboring pixels see different triangles across a silhouette edge, it finds where the edge crosses the segment between the two pixel centers and blends the two colors in proportion. That blend weight depends continuously on the vertex positions, so its derivative is a cheap approximation of the boundary term. Because nvdiffrast uses the GPU's hardware rasterizer through OpenGL (or its own fast CUDA rasterizer), it renders millions of triangles at high resolution, and it became the workhorse of mesh-based inverse rendering (for example nvdiffrec, Section 5).

**PyTorch3D** (Ravi et al., 2020) is Meta's library of differentiable 3D operators. Its mesh rasterizer keeps the $K$ nearest faces per pixel within a `blur_radius`, and its shaders (`SoftSilhouetteShader`, `SoftPhongShader`) blend them SoftRas-style; it also has a differentiable point-cloud renderer. It is the easiest place to try differentiable rasterization in Python.

## 4. Physically based differentiable rendering

A path tracer computes each pixel as an integral over light paths $\bar{x}$ (camera, bounce, bounce, light):

$$
I = \int_{\Omega} f(\bar{x};\theta)\,d\mu(\bar{x}),
$$

the path integral of [post 5]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}), where $\Omega$ is the set of all light paths and $\mu$ is the measure on it. Visibility appears at *every* bounce, in shadows, reflections and indirect light, not only at primary silhouettes, so the boundary term now lives on many kinds of discontinuities. Physically based differentiable rendering (PBDR) estimates both terms of the Reynolds formula in this setting. Four ideas define the field.

**Edge sampling** (Li, Aittala, Durand and Lehtinen, SIGGRAPH Asia 2018) estimates the boundary term directly, as in Section 2. For primary visibility it samples points on silhouette edges in screen space; for secondary visibility (shadows, indirect) it samples silhouette edges as seen from a shading point, using a hierarchy over triangle edges to find the relevant ones. It is unbiased, but finding silhouettes is expensive and does not extend to implicit surfaces.

**Reparameterization** (Loubet, Holzschuch and Jakob, SIGGRAPH Asia 2019) avoids explicit edges. If we change integration variables, $\mathbf{x} = T(\mathbf{u},\theta)$, such that the discontinuity *moves with* $\theta$, then in $\mathbf{u}$-space the discontinuity is fixed and the derivative of the integrand is again an ordinary derivative. Loubet et al. estimate how nearby discontinuities move (from a few auxiliary rays) and approximate $T$ by a small rotation of directions, which gives low-variance but slightly biased gradients.

**Warped-area sampling** (Bangaru, Li and Durand, SIGGRAPH Asia 2020) makes the same idea unbiased. Using the divergence theorem, it rewrites the boundary integral as an *area* integral of the divergence of a smooth warp field that agrees with the boundary velocity on the discontinuities. Area integrals are exactly what Monte Carlo is good at, so no edge has to be found.

**Path-space differentiable rendering** (PSDR; Zhang, Miller, Yan, Gkioulekas and Zhao, SIGGRAPH 2020) differentiates the path integral itself, building on the differential theory of radiative transfer (Zhang et al., SIGGRAPH Asia 2019). The boundary term becomes an integral over *boundary paths*, light paths with one vertex on a silhouette edge, and these can be sampled with bidirectional and multi-directional strategies. This made gradients of complex light transport (caustics, interreflections) practical.

### Memory: radiative backpropagation and path replay

Reverse-mode autodiff records every operation of the forward pass on a "tape", which for a path tracer with millions of paths of several bounces means gigabytes. **Radiative backpropagation** (Nimier-David, Speierer, Ruiz and Jakob, SIGGRAPH 2020) observes that the gradient is itself a light-transport problem. The pixel gradients $\partial\mathcal{L}/\partial I$ are emitted from the camera as "adjoint radiance", and a second transport pass deposits gradients wherever that adjoint radiance meets a differentiable parameter. No tape is needed. Its weakness is that some terms need the incident radiance at each vertex, which it re-estimates, so long paths cost quadratic time.

**Path replay backpropagation** (PRB; Vicini, Speierer and Jakob, SIGGRAPH 2021) fixes that by replaying the *same* path (same random numbers) in the adjoint pass, so the radiance needed at each vertex is available incrementally: linear time, constant memory. PRB handles the interior term; Mitsuba combines it with reparameterization for visibility (the `prb_reparam` integrator).

### Mitsuba 3 and Dr.Jit

**Mitsuba 3** (released in 2022 by the Realistic Graphics Lab at EPFL; latest release v3.9.1, August 2026) is a research renderer built on **Dr.Jit** (Jakob, Speierer, Roussel and Vicini, SIGGRAPH 2022). Dr.Jit is a just-in-time compiler that traces the renderer's Python/C++ code into large fused kernels for CPU (LLVM) or GPU (CUDA/OptiX), and it implements forward- and reverse-mode differentiation of those kernels. A complete inverse-rendering loop fits in a few lines; this one, following the structure of the official tutorials, recovers the color of a wall in the Cornell box:

```python
import drjit as dr
import mitsuba as mi

mi.set_variant("llvm_ad_rgb")                       # or "cuda_ad_rgb" on an NVIDIA GPU
scene = mi.load_dict(mi.cornell_box())
img_ref = mi.render(scene, spp=256)                 # the "photograph"

params = mi.traverse(scene)
key = "red.reflectance.value"
params[key] = mi.Color3f(0.1, 0.2, 0.9)             # wrong initial guess
params.update()

opt = mi.ad.Adam(lr=0.05)
opt[key] = params[key]
params.update(opt)
for it in range(50):
    img = mi.render(scene, params, spp=4, seed=it)  # differentiable render
    loss = dr.mean(dr.square(img - img_ref))
    dr.backward(loss)                               # radiative backprop / PRB under the hood
    opt.step()
    opt[key] = dr.clip(opt[key], 0.0, 1.0)
    params.update(opt)
print(params[key])     # about [0.60, 0.041, 0.017]; true wall: [0.570, 0.043, 0.044]
```

Its predecessor Mitsuba 2 (Nimier-David, Vicini, Zeltner and Jakob, SIGGRAPH Asia 2019) introduced the retargetable design; Mitsuba 3 adds the much faster Dr.Jit backend and integrators for PRB, reparameterized visibility and differentiable signed distance functions (Vicini, Speierer and Jakob, SIGGRAPH 2022).

## 5. Inverse rendering in practice

**SVBRDF capture.** Recovering a spatially varying BRDF (per-texel albedo, roughness, normal, specular) from a few photos of a flat material is a classic inverse-rendering task. Deschaintre et al. (SIGGRAPH 2018) trained a network that predicts the maps from a single flash photo, with a *rendering-aware* loss that compares renderings of the predicted and true maps under many lights. Optimization-based methods then refine such predictions with a differentiable shader.

**Lighting and materials together.** Inverse path tracing (Azinović et al., CVPR 2019) optimizes the materials and emitters of a whole room with a differentiable path tracer. nvdiffrec (Munkberg et al., CVPR 2022) jointly recovers a triangle mesh (through a differentiable marching-tetrahedra layer), PBR textures and an environment light from multi-view photos, using nvdiffrast, so the result drops straight into a game engine.

**Shape optimization and "Large Steps".** Optimizing raw vertex positions with gradient descent tends to tangle meshes: silhouette gradients are sparse and noisy, so neighboring vertices receive very different updates, and triangles flip or self-intersect. Nicolet, Jacobson and Jakob ("Large Steps in Inverse Rendering of Geometry", SIGGRAPH Asia 2021) reparameterize the vertices $\mathbf{x}$ through

$$
\mathbf{u} = (\mathbf{I} + \lambda \mathbf{L})\,\mathbf{x},
$$

where $\mathbf{L}$ is the mesh Laplacian and $\lambda$ a smoothing weight, and optimize $\mathbf{u}$ instead of $\mathbf{x}$. With $\mathbf{M} = \mathbf{I}+\lambda\mathbf{L}$ (symmetric), the chain rule gives $\nabla_{\mathbf{u}} = \mathbf{M}^{-1}\nabla_{\mathbf{x}}$, so a gradient step $\Delta\mathbf{u} = -\eta\,\nabla_{\mathbf{u}}\mathcal{L}$ on $\mathbf{u}$ (with step size $\eta$) moves the vertices by

$$
\Delta\mathbf{x} = \mathbf{M}^{-1}\Delta\mathbf{u} = -\eta\,(\mathbf{I}+\lambda\mathbf{L})^{-2}\,\nabla_{\mathbf{x}}\mathcal{L}.
$$

In the eigenbasis of $\mathbf{L}$ (eigenvalues $\mu_k \ge 0$; small $\mu_k$ are smooth, low-frequency shapes) the step in mode $k$ is scaled by $1/(1+\lambda\mu_k)^2$: smooth deformations pass almost unchanged, while high-frequency noise is strongly damped. This is a Sobolev-style preconditioner, and it lets you take *large* steps without destroying the mesh. (The paper also modifies Adam so its per-parameter scaling does not undo the smoothing.) The toy below applies the idea to a closed 2D curve of 100 vertices that should grow into a five-lobed flower, with a gradient that reaches only a random 30 % of the vertices per step and carries noise, much like real silhouette gradients; the figure below shows the result.

{% include blog_figure.liquid path="assets/img/blog/graphics/12-large-steps.svg" caption="Toy shape optimization (100-vertex closed curve, start: dotted circle, target: dashed flower, 300 steps of size $\eta=0.3$ with the same noisy, sparse gradients). Left: plain gradient descent lets the noise accumulate along the curve, so the vertices drift along it and bunch up: 32 of the 100 edges end up running backwards in angle (adjacent vertices in reversed angular order), i.e. the polygon folds over itself. Middle: the Large Steps update $(\mathbf{I}+\lambda\mathbf{L})^{-2}g$ with $\lambda=5$ keeps the curve smooth. Right: mean radial error per iteration; over the last 50 steps it stalls near 0.016 for the naive update and reaches about 0.008 for Large Steps." %}

**Coarse to fine, and local minima.** The loss as a function of geometry is full of flat plateaus and local minima. If the rendered object does not overlap its target at all, a hard renderer has zero gradient (moving it a little changes nothing). If the target has two similar objects, the model can lock onto the wrong one. The figure computes both effects for a disc. The standard defenses:

- smooth the forward model at first: a large SoftRas $\sigma$, or Gaussian-blurred images or an image pyramid in the loss, and sharpen over time;
- start from a good initialization (a visual hull, a coarse reconstruction, a network prediction);
- optimize coarse geometry first (low resolution, few vertices, then remesh and subdivide);
- regularize: Laplacian smoothness, normal consistency, edge-length terms, or the Large Steps parameterization;
- use many views, which removes many ambiguities and local minima at once.

{% include blog_figure.liquid path="assets/img/blog/graphics/12-loss-landscape.svg" caption="Left: loss versus the horizontal position of a disc (radius 6 px; target centered at 32 px), each curve scaled to its maximum. The hard loss is flat outside the shaded band where the two discs overlap, a plateau with no gradient; soft rendering with a larger $\sigma$, or blurring both images, widens the basin. Right: soft loss ($\sigma=1.5$; darker is lower) over the 2D position $(c_x,c_y)$ of a disc of radius 6.5 when the target contains a big disc on the left and a small disc on the right (dotted). Two Adam runs (dots: starts; stars: ends; white and orange) settle in different basins, and the orange one, which stops at the small disc on the right, is a local minimum." %}

## 6. Volumes and splats: side-stepping visibility

Why do NeRF and 3D Gaussian Splatting optimize so reliably from images, with no edge sampling at all? Because they replace hard surfaces with **semi-transparent volumes**, and their visibility is smooth.

In the volume rendering of [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}), a pixel is

$$
C = \int_{t_n}^{t_f} T(t)\,\sigma(t)\,\mathbf{c}(t)\,dt, \qquad T(t) = \exp\!\Big(-\int_{t_n}^{t}\sigma(s)\,ds\Big),
$$

with density $\sigma$, color $\mathbf{c}$ and transmittance $T$. If $\sigma$ is a smooth function of the network weights or grid values, $C$ is too: an occluder does not appear suddenly; its optical depth grows continuously. Visibility has become an exponential of an integral, which differentiates nicely. The left panel below compares the pixel value as an opaque box and as a Gaussian density blob slide across a ray.

In [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}), each Gaussian contributes $\alpha_i = o_i \exp\!\big(-\tfrac12 \mathbf{d}^\top \Sigma_i'^{-1}\mathbf{d}\big)$ to a pixel at offset $\mathbf{d}$ from its projected center, with opacity $o_i$ and 2D covariance $\Sigma_i'$, and the pixel is the front-to-back composite $C = \sum_i \mathbf{c}_i\,\alpha_i \prod_{j<i}(1-\alpha_j)$. Every $\alpha_i$ is a smooth function of the mean, covariance and opacity, so gradients reach all of them without any boundary term.

**What remains discontinuous.**

- *Sorting*: 3DGS sorts Gaussians by the depth of their *centers* (per tile), not by the true depth of each contribution along each ray. When the camera moves and two overlapping Gaussians swap order, the composite jumps. This is the "popping" artifact, and it is also a discontinuity in $\theta$ that the gradient ignores (right panel below).
- *Truncation*: Gaussians are cut off at about three standard deviations and skipped below an opacity threshold, which creates small jumps.
- *Hard surfaces at the end*: when the optimizer drives densities to be very sharp (opaque surfaces), the smoothness disappears again.

StopThePop (Radl et al., SIGGRAPH 2024) sorts per pixel hierarchically to reduce popping; 3D Gaussian ray tracing and EVER (Section 8) evaluate the volume along each ray in the correct order, or exactly.

{% include blog_figure.liquid path="assets/img/blog/graphics/12-volume-vs-splat.svg" caption="Left: pixel value as an occluder slides across the ray. Black: an opaque box gives a step (a delta-function derivative); purple solid: a Gaussian density blob gives the smooth curve $e^{-\tau(p)}$ with a well-defined derivative (purple dashed, scaled). Right: the vertical axis is the red channel of the pixel. A ray passes through two overlapping Gaussians (colored red and black, each with $\alpha=0.7$) whose depth order swaps as the camera rotates. Red line: compositing sorted by center depth jumps from 0.21 to 0.70 at $\beta=0$ (popping); blue line: integrating the volume exactly along the ray changes continuously." %}

## 7. Hands-on: three experiments in PyTorch

All three experiments run on a CPU in seconds; `bin/figures/graphics/graphics_12.py` contains the same code and produced the figures. The common setup is a $64\times64$ image in pixel units, where pixel $(i,j)$ has center $(j+0.5,\,i+0.5)$.

```python
import torch

H = W = 64
ys, xs = torch.meshgrid(torch.arange(H) + 0.5, torch.arange(W) + 0.5, indexing="ij")

def coverage(cx, cy, r, ss=8):
    """Hard disc, area-averaged with ss x ss stratified samples per pixel (no gradients)."""
    o = (torch.arange(ss) + 0.5) / ss - 0.5
    oy, ox = torch.meshgrid(o, o, indexing="ij")
    px, py = xs[..., None, None] + ox, ys[..., None, None] + oy
    return (((px - cx) ** 2 + (py - cy) ** 2) < r ** 2).float().mean(dim=(-1, -2))
```

### 7.1 A soft rasterizer fits a silhouette

The unknowns are $\theta = (c_x, c_y, r)$ of a disc; the target is a hard disc. The soft renderer replaces the step $H(r-d)$ by $\operatorname{sigmoid}((r-d)/\sigma)$, where $d$ is the distance from the pixel center to $(c_x,c_y)$: the 1D version of SoftRas with a signed distance instead of SoftRas's squared distance. We anneal $\sigma$ geometrically from 3 to 0.5 pixels.

```python
def render_soft(p, sigma):
    d = torch.sqrt((xs - p[0]) ** 2 + (ys - p[1]) ** 2 + 1e-12)
    return torch.sigmoid((p[2] - d) / sigma)

T = coverage(40.0, 26.0, 12.0)                      # target image
p = torch.tensor([30.0, 36.0, 7.0], requires_grad=True)
opt = torch.optim.Adam([p], lr=0.5)
iters = 150
for it in range(iters):
    sigma = 3.0 * (0.5 / 3.0) ** (it / (iters - 1))  # anneal: blurry -> sharp
    loss = ((render_soft(p, sigma) - T) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
    with torch.no_grad():
        p[2].clamp_(min=0.5)
print(p.detach())                                   # tensor([39.9993, 26.0007, 11.9902]); target (40, 26, 12)
```

### 7.2 A hard rasterizer with an edge-sampling gradient

Now keep the hard, supersampled renderer in the forward pass and write its backward pass by hand with the boundary term. The boundary of the disc is $\mathbf{x}(\phi) = (c_x,c_y) + r(\cos\phi,\sin\phi)$ with outward normal $\mathbf{n} = (\cos\phi,\sin\phi)$. Differentiating $\mathbf{x}(\phi)$ gives the normal velocities $\mathbf{v}\cdot\mathbf{n}$: $\cos\phi$ for $c_x$, $\sin\phi$ for $c_y$ and $1$ for $r$. With $f^{-}-f^{+} = 1$ and unit pixel area, the boundary term is

$$
\frac{\partial\mathcal{L}}{\partial\theta} = \oint \frac{\partial\mathcal{L}}{\partial I_{j(\mathbf{x})}}\,(\mathbf{v}\cdot\mathbf{n})\,d\ell \;\approx\; \frac{2\pi r}{M}\sum_{k=1}^{M} \frac{\partial\mathcal{L}}{\partial I_{j(\mathbf{x}_k)}}\,(\mathbf{v}\cdot\mathbf{n})_k ,
$$

where $j(\mathbf{x})$ is the pixel containing $\mathbf{x}$ and $\phi_k$ is uniform on $[0,2\pi)$. The factor $2\pi r/M$ is the arc length per sample, i.e. $1/(M p)$.

```python
class HardDiscEdgeSampled(torch.autograd.Function):
    @staticmethod
    def forward(ctx, p, n_edge):
        ctx.save_for_backward(p)
        ctx.n_edge = n_edge
        return coverage(*p.tolist(), ss=4)           # hard forward pass

    @staticmethod
    def backward(ctx, grad_img):                     # grad_img = dL/dI, shape (H, W)
        (p,) = ctx.saved_tensors
        cx, cy, r = p
        phi = torch.rand(ctx.n_edge) * 2 * torch.pi
        nx, ny = torch.cos(phi), torch.sin(phi)      # outward normal at each edge sample
        i = (cy + r * ny).floor().long()
        j = (cx + r * nx).floor().long()
        ok = (i >= 0) & (i < H) & (j >= 0) & (j < W)
        g = torch.zeros(ctx.n_edge)
        g[ok] = grad_img[i[ok], j[ok]]               # times (f_in - f_out) = 1
        w = 2 * torch.pi * r / ctx.n_edge            # arc length per sample
        return torch.stack([(g * nx).sum(), (g * ny).sum(), g.sum()]) * w, None

p = torch.tensor([30.0, 36.0, 7.0], requires_grad=True)
opt = torch.optim.Adam([p], lr=0.5)
for it in range(150):
    loss = ((HardDiscEdgeSampled.apply(p, 256) - T) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
print(p.detach())                    # e.g. tensor([40.0112, 26.0081, 12.0141]); varies with the seed
```

A third run differentiates the hard renderer naively, `(torch.sign(p[2] - d) + 1) / 2`, and gets exactly zero gradient, so Adam never moves (the gray line in the right panel of the figure below).

{% include blog_figure.liquid path="assets/img/blog/graphics/12-silhouette-fit.svg" caption="The two optimizations of Section 7, from the same start (black dot) to the target disc (gray). Left: soft rasterizer with $\sigma$ annealed from 3 to 0.5 px; circles show iterations 0, 10, 25, 50 and 150 (darker = later), and the black line is the path of the center. Middle: hard rasterizer with the edge-sampling gradient ($M=256$). Right: the *true* image loss (hard disc, 64 samples per pixel) per iteration for both, plus the naive hard + autodiff run, which stays flat because its gradient is zero." %}

What to look for: the soft run moves smoothly but measures its loss on a blurred image, which is why $\sigma$ must shrink at the end. The edge-sampling run follows the exact gradient of the sharp image, but the gradient is a Monte Carlo estimate, so the path jitters and the loss plateaus at a noise floor that shrinks with $M$. Try it live, including starts that barely overlap the target:

{% include widget.liquid name="graphics-silhouette-fit" height="440" caption="Live version of Sections 7.1 and 7.2 on a $32\times32$ image. Choose the gradient (soft rasterizer with its $\sigma$, hard + edge sampling with $M$ samples, or naive hard + autodiff), drag on the image to place the starting disc, and press Run. The curves keep the last run of each method, always measured with the true hard loss. Start far from the target: a small $\sigma$ stalls while a large one still finds it, and edge sampling shrinks the disc when it does not overlap the target at all (the only boundary signal it gets is that the disc covers background)." %}

### 7.3 Fitting albedo and roughness of a sphere

Shading parameters have no visibility problem, so plain autodiff works. We render a sphere orthographically (camera on $+z$ looking down $-z$, normal $\mathbf{n} = (x, y, \sqrt{1-x^2-y^2})$ inside the unit disc) under one directional light with irradiance $E$. The BRDF is Lambert plus the Cook-Torrance GGX specular of [post 4]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}):

$$
f_r = \frac{\boldsymbol{\rho}}{\pi} + \frac{D(\mathbf{h})\,G(\mathbf{l},\mathbf{v})\,F(\mathbf{v},\mathbf{h})}{4\,(\mathbf{n}\cdot\mathbf{l})(\mathbf{n}\cdot\mathbf{v})}, \qquad L_o = f_r\,E\,\max(0,\mathbf{n}\cdot\mathbf{l}) + 0.05\,\boldsymbol{\rho},
$$

with GGX distribution $D$ ($\alpha = $ roughness$^2$), Smith masking $G = G_1(\mathbf{l})G_1(\mathbf{v})$, Schlick Fresnel with $F_0 = 0.04$, and a small ambient term. The unknowns are the RGB albedo $\boldsymbol{\rho}$ and the roughness, kept in range by sigmoids. The code below is the complete fit; the figure after it shows how it converges.

```python
import torch

def sphere_setup(res=64):
    c = (torch.arange(res) + 0.5) / res * 2 - 1
    y, x = torch.meshgrid(-c, c, indexing="ij")            # row 0 is the top (y = +1)
    mask = (x ** 2 + y ** 2) < 1
    z = torch.sqrt(torch.clamp(1 - x ** 2 - y ** 2, min=0))
    return torch.stack([x, y, z], -1) * mask[..., None], mask   # normal = 0 outside the disc

def shade(n, mask, albedo, rough, light=(-0.4, 0.5, 0.75), E=3.0):
    l = torch.tensor(light); l = l / l.norm()
    v = torch.tensor([0.0, 0.0, 1.0])
    h = (l + v) / (l + v).norm()
    nl = (n @ l).clamp(min=0)[..., None]
    nv = (n @ v).clamp(min=1e-4)[..., None]
    nh = (n @ h).clamp(min=0)[..., None]
    a2 = (rough ** 2) ** 2                                 # alpha = rough^2
    D = a2 / (torch.pi * (nh ** 2 * (a2 - 1) + 1) ** 2)
    G1 = lambda c: 2 * c / (c + torch.sqrt(a2 + (1 - a2) * c ** 2))
    F = 0.04 + 0.96 * (1 - (h @ v)) ** 5
    spec = D * G1(nl.clamp(min=1e-4)) * G1(nv) * F / (4 * nl.clamp(min=1e-4) * nv)
    return ((albedo / torch.pi + spec) * E * nl + 0.05 * albedo) * mask[..., None]

n, mask = sphere_setup()
target = shade(n, mask, torch.tensor([0.80, 0.35, 0.20]), torch.tensor(0.35))
a_raw = torch.zeros(3, requires_grad=True)                 # albedo starts at 0.5 gray
r_raw = torch.tensor(1.2, requires_grad=True)              # roughness starts near 0.8
opt = torch.optim.Adam([a_raw, r_raw], lr=0.05)
for it in range(200):
    albedo, rough = torch.sigmoid(a_raw), 0.05 + 0.95 * torch.sigmoid(r_raw)
    loss = ((shade(n, mask, albedo, rough) - target) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
print(torch.sigmoid(a_raw).detach(), (0.05 + 0.95 * torch.sigmoid(r_raw)).item())
# tensor([0.8000, 0.3500, 0.2000]) 0.35000815987586975
```

{% include blog_figure.liquid path="assets/img/blog/graphics/12-brdf-fit.svg" caption="Fitting albedo and roughness of a sphere with known light. Top: renderings at iterations 0, 25 and 200 next to the target (display gamma 2.2). Bottom: the three albedo channels and the roughness per Adam iteration (solid) against their true values (dashed), and the loss (note that the $\rho$ in the legend denotes the purple roughness curve, not the albedo of the text). The albedo is pinned down by the large diffuse region; the roughness is determined only by the shape and size of the highlight." %}

Note what made this easy: one known light, a known shape, and a material model with the right form. Make the light intensity a free parameter too, and you will meet the first ambiguity of Section 1 (try it: the product of light and albedo is recovered, the factors are not).

## 8. Research directions, 2024 to 2026

As of November 2026, three directions are especially active. Statuses below were checked against arXiv or the publisher.

**Differentiable rendering of Gaussian primitives and ray tracing.** Gaussian splatting's rasterizer sorts approximately and cannot follow secondary rays. *3D Gaussian Ray Tracing* (Moenne-Loccoz et al., SIGGRAPH Asia 2024) traces particles with hardware ray tracing through bounding-mesh proxies, in correct order along each ray, and keeps everything differentiable; *3DGUT* (Wu et al., CVPR 2025) instead uses the unscented transform to project Gaussians through distorted cameras and enables secondary rays within the rasterization framework. *EVER* (Mai et al., arXiv preprint 2410.01804, 2024) renders constant-density ellipsoids with an *exact* volume integral, removing popping by construction. On the inverse-rendering side, *IRGS* (Gu et al., CVPR 2025) uses differentiable 2D Gaussian ray tracing to account for inter-reflections when recovering materials and lighting, and its follow-up *IRGS++* (arXiv preprint 2607.22780, July 2026) extends it to metals with importance sampling and denoising. *UTrice* (Liu et al., arXiv preprint 2512.04421, December 2025) uses triangles directly as primitives in a single differentiable ray tracer and rasterizer.

**Joint physics and rendering.** If a differentiable simulator ([post 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})) produces the geometry that a differentiable renderer images, gradients flow from video pixels back to physical parameters: *system identification* from video. *PAC-NeRF* (Li et al., ICLR 2023) couples a radiance field with a differentiable material point method (MPM) to estimate material parameters from multi-view video; *PhysGaussian* (Xie et al., CVPR 2024) uses the same Gaussians for MPM simulation and rendering. *PhysTwin* (Jiang et al., arXiv preprint 2503.17973, 2025) fits a spring-mass model rendered with Gaussians to sparse videos of deformable objects; *MOSIV* (Liu et al., ICLR 2026) identifies per-object material parameters in multi-object scenes through a differentiable simulator.

**Inverse rendering with generative priors.** Single images are hopelessly ambiguous (Section 1), so recent work replaces hand-made regularizers with diffusion models trained on synthetic renders. *RGB↔X* (Zeng et al., SIGGRAPH 2024) decomposes an image into albedo, normals, roughness, metallicity and lighting, and synthesizes images back from those channels, with material- and lighting-aware diffusion models. *DiffusionRenderer* (Liang et al., CVPR 2025) does inverse and forward rendering with video diffusion models, enabling relighting and material editing of real videos. *UniRelight* (He et al., arXiv preprint 2506.15673, 2025) learns albedo estimation and relighting jointly, and *Relit-LiVE* (Xiao et al., arXiv 2605.06658; accepted to SIGGRAPH 2026 according to its arXiv comments) predicts relit frames together with per-frame environment maps. The open question these raise: how to combine a generative prior that "knows what materials look like" with a physically based differentiable renderer that guarantees consistency across views.

## 9. Summary

- Inverse rendering minimizes an image loss over scene parameters; the hard part is $\partial I/\partial\theta$.
- Shading parameters have smooth derivatives; geometry and visibility make the integrand discontinuous, so the derivative of the image contains a **boundary term** (Reynolds transport) that autodiff of a sampled renderer misses entirely.
- Rasterizers either smooth the forward pass (SoftRas, PyTorch3D), engineer a backward pass (OpenDR, NMR), or approximate the boundary term through antialiasing (nvdiffrast).
- Physically based differentiable renderers estimate the boundary term by edge sampling, reparameterization, warped-area sampling or path-space sampling, and avoid giant tapes with radiative backpropagation and path replay; Mitsuba 3 and Dr.Jit package all of this.
- In practice, success depends on initialization, coarse-to-fine schedules and regularization (Large Steps).
- Volumes and Gaussians make visibility smooth, which is a big part of why NeRF and 3DGS optimize so well; sorting and truncation are what is left.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Loper & Black, *OpenDR: An Approximate Differentiable Renderer* | ECCV | 2014 | [DOI](https://doi.org/10.1007/978-3-319-10584-0_11) | First general differentiable renderer, with image-space derivative approximations |
| Kato, Ushiku & Harada, *Neural 3D Mesh Renderer* | CVPR | 2018 | [arXiv](https://arxiv.org/abs/1711.07566) | Hand-designed rasterization gradients for mesh reconstruction |
| Li, Aittala, Durand & Lehtinen, *Differentiable Monte Carlo Ray Tracing through Edge Sampling* | SIGGRAPH Asia (TOG) | 2018 | [DOI](https://doi.org/10.1145/3272127.3275109) | First unbiased gradients for primary and secondary visibility |
| Liu, Li, Chen & Li, *Soft Rasterizer* | ICCV | 2019 | [arXiv](https://arxiv.org/abs/1904.01786) | Probabilistic, fully smooth rasterization |
| Loubet, Holzschuch & Jakob, *Reparameterizing Discontinuous Integrands for Differentiable Rendering* | SIGGRAPH Asia (TOG) | 2019 | [DOI](https://doi.org/10.1145/3355089.3356510) | Moves discontinuities with the parameters instead of sampling edges |
| Nimier-David et al., *Mitsuba 2: A Retargetable Forward and Inverse Renderer* | SIGGRAPH Asia (TOG) | 2019 | [DOI](https://doi.org/10.1145/3355089.3356498) | Retargetable research renderer with autodiff |
| Zhang et al., *Path-Space Differentiable Rendering* | SIGGRAPH (TOG) | 2020 | [DOI](https://doi.org/10.1145/3386569.3392383) | Boundary terms as integrals over boundary paths |
| Nimier-David et al., *Radiative Backpropagation* | SIGGRAPH (TOG) | 2020 | [DOI](https://doi.org/10.1145/3386569.3392406) | Gradients as adjoint light transport, no tape |
| Bangaru, Li & Durand, *Unbiased Warped-Area Sampling for Differentiable Rendering* | SIGGRAPH Asia (TOG) | 2020 | [DOI](https://doi.org/10.1145/3414685.3417833) | Unbiased boundary term via the divergence theorem |
| Laine et al., *Modular Primitives for High-Performance Differentiable Rendering* (nvdiffrast) | SIGGRAPH Asia (TOG) | 2020 | [arXiv](https://arxiv.org/abs/2011.03277) | Fast GPU rasterization with antialiasing-based edge gradients |
| Ravi et al., *Accelerating 3D Deep Learning with PyTorch3D* | arXiv | 2020 | [arXiv](https://arxiv.org/abs/2007.08501) | Differentiable mesh and point renderers in PyTorch |
| Vicini, Speierer & Jakob, *Path Replay Backpropagation* | SIGGRAPH (TOG) | 2021 | [DOI](https://doi.org/10.1145/3450626.3459804) | Linear-time, constant-memory differentiable path tracing |
| Nicolet, Jacobson & Jakob, *Large Steps in Inverse Rendering of Geometry* | SIGGRAPH Asia (TOG) | 2021 | [DOI](https://doi.org/10.1145/3478513.3480501) | Laplacian reparameterization for robust shape optimization |
| Jakob, Speierer, Roussel & Vicini, *Dr.Jit: A Just-In-Time Compiler for Differentiable Rendering* | SIGGRAPH (TOG) | 2022 | [DOI](https://doi.org/10.1145/3528223.3530099) | The JIT/autodiff engine under Mitsuba 3 |
| Munkberg et al., *Extracting Triangular 3D Models, Materials, and Lighting From Images* (nvdiffrec) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2111.12503) | Joint mesh, material and light recovery with nvdiffrast |
| Moenne-Loccoz et al., *3D Gaussian Ray Tracing* | SIGGRAPH Asia (TOG) | 2024 | [arXiv](https://arxiv.org/abs/2407.07090) | Differentiable ray tracing of Gaussian particles |
| Liang et al., *DiffusionRenderer* | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.18590) | Inverse and forward rendering with video diffusion priors |

## Learning resources

- Shuang Zhao, Wenzel Jakob and Tzu-Mao Li, [*Physics-Based Differentiable Rendering: A Comprehensive Introduction*](https://courses.shuangz.com/pbdr-course-sg20/) (SIGGRAPH 2020 course): the theory of Sections 2 and 4 in depth, with slides and videos.
- Kato et al., [*Differentiable Rendering: A Survey*](https://arxiv.org/abs/2006.12057) (2020): overview of mesh, voxel, point and implicit differentiable renderers.
- [Mitsuba 3](https://github.com/mitsuba-renderer/mitsuba3) and its documentation's inverse-rendering tutorials (start with the gradient-based optimization tutorial, then shape and caustic optimization).
- [nvdiffrast](https://github.com/NVlabs/nvdiffrast) and [PyTorch3D](https://github.com/facebookresearch/pytorch3d) for differentiable rasterization; [SoftRas](https://github.com/ShichenLiu/SoftRas) for the original soft rasterizer code.
- Tzu-Mao Li's PhD thesis *Differentiable Visual Computing* (MIT, 2019) is a readable long-form introduction to edge sampling and differentiable image processing.
- The neural-rendering series continues where Section 6 stops: [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) and [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}).

## Exercises

1. **Boundary term by hand.** A unit pixel is crossed by the edge $x\cos\varphi + y\sin\varphi = \theta$ with $\varphi = 45^\circ$ and $\theta = 0.5$; the inside ($\mathbf{n}\cdot\mathbf{x}<\theta$) has value 1, the outside 0. Compute the covered area $A$ and $dA/d\theta$, and check them with the edge-gradient widget.

   <details markdown="1"><summary>Hint</summary>
   The line passes through $(0.707, 0)$ and $(0, 0.707)$, so the covered region is a right triangle with legs $0.707$: $A = 0.25$. The edge length inside the pixel is $\ell = 0.707\sqrt2 = 1$, so $dA/d\theta = \ell = 1$ (check: $A(\theta) = \theta^2$ for this angle, and $2\theta = 1$).
   </details>

2. **Bias of finite differences.** In the 1D example with $N$ stratified samples, show that the forward difference, averaged over a uniformly random edge position $\theta$ (ignore the ends of the pixel), equals the true derivative, yet for a fixed $\theta$ it takes only the values $0$ and multiples of $(f_{\rm in}-f_{\rm out})/(Nh)$. What does this say about using FD gradients inside SGD?

   <details markdown="1"><summary>Hint</summary>
   Each sample contributes a jump of $(f_{\rm in}-f_{\rm out})/N$ exactly when it lies in $(\theta, \theta+h]$, and the difference quotient is then $(f_{\rm in}-f_{\rm out})/(Nh)$. The $N$ stratified samples are $1/N$ apart, so for a uniformly random $\theta$ (and $h \le 1/N$) this has probability $Nh$ (not $h$). The mean is therefore $f_{\rm in}-f_{\rm out}$, i.e. the estimator is unbiased on average over $\theta$, but its second moment is $(f_{\rm in}-f_{\rm out})^2/(Nh)$, so its variance grows like $1/(Nh)$.
   </details>

3. **Edge sampling for a triangle.** Extend `HardDiscEdgeSampled` to a triangle with vertices $\mathbf{p}_0,\mathbf{p}_1,\mathbf{p}_2$. For a point $\mathbf{x} = (1-t)\mathbf{p}_a + t\,\mathbf{p}_b$ on edge $ab$, what is $\mathbf{v}\cdot\mathbf{n}$ with respect to each coordinate of $\mathbf{p}_a$?

   <details markdown="1"><summary>Hint</summary>
   $\partial\mathbf{x}/\partial\mathbf{p}_a = (1-t)\mathbf{I}$, so the normal velocity for the $x$-coordinate of $\mathbf{p}_a$ is $(1-t)\,n_x$, and $(1-t)\,n_y$ for its $y$-coordinate. Sample $t$ uniformly and edges proportionally to their length.
   </details>

4. **Ambiguity in action.** In the sphere experiment (7.3), make the light irradiance $E$ a third unknown. Which quantities converge and which drift? Add a second light direction or a prior on $E$ and repeat.

5. **Large Steps.** In the 2D curve toy, sweep $\lambda \in \{0, 1, 5, 20\}$ and plot the final error after 300 steps. Why does a very large $\lambda$ slow down fitting of the five lobes? (Use the eigenvalues $\mu_k = 2-2\cos(2\pi k/N)$ of the cycle-graph Laplacian.)

Next in the series: [research frontiers 2026]({{ '/blog/2026/graphics-13-research-frontiers-2026/' | relative_url }}), a tour of what SIGGRAPH, SIGGRAPH Asia and the other graphics venues published this year.
