# Assignment gfx-c: graphics chapter 12, differentiable and inverse rendering

Write one new chapter of the series "Computer Graphics from Scratch" (series key `graphics`).

- File: `2026-10-27-graphics-12-differentiable-and-inverse-rendering.md`, date `2026-10-27 09:12:00+0900`,
  series_order 12.
- Script `bin/figures/graphics/graphics_12.py`; SVGs `assets/img/blog/graphics/12-*`.
- Reading list: append a section "Chapter 12" to `docs/reading-lists/graphics.md`.

Why it matters: inverse problems recover a scene from images, and differentiable rendering is the engine
underneath NeRF and 3DGS. This chapter is the bridge from classical graphics to the neural-rendering
series:
- link `graphics-02`, `graphics-04` and `graphics-05` back;
- link `neural-rendering-02` and `neural-rendering-04` forward.

Suggested sections:
1. Forward versus inverse rendering: analysis by synthesis, what can be recovered (shape, materials,
   lighting, camera), and ambiguities.
2. Gradients of an image:
   - derivatives with respect to shading parameters are easy;
   - geometry and visibility create discontinuities. Work a 1D example: edge coverage, where a Heaviside step
     gives a Dirac delta, and show why automatic differentiation of a hard rasterizer returns zero.
3. Differentiable rasterization:
   - OpenDR (2014), Neural Mesh Renderer (Kato et al. 2018), SoftRas (Liu et al. 2019);
   - nvdiffrast (Laine et al. 2020), with antialiasing-based edge gradients;
   - PyTorch3D.
4. Physically based differentiable rendering:
   - Reynolds transport and boundary terms;
   - edge sampling (Li et al. 2018), reparameterization (Loubet et al. 2019), warped-area sampling (Bangaru
     et al. 2020);
   - path-space differentiable rendering (Zhang et al. 2020);
   - radiative backpropagation (Nimier-David et al. 2020), path replay backpropagation (Vicini et al. 2021);
   - Mitsuba 3 and Dr.Jit (2022).
5. Inverse rendering in practice:
   - SVBRDF capture, lighting estimation, shape optimization ("Large Steps in Inverse Rendering", Nicolet et
     al. 2021);
   - regularization, coarse-to-fine schedules, local minima.
6. Volumes and splats: why differentiable volume rendering (NeRF) and splatting (3DGS) side-step most
   visibility problems, and what remains (sorting, popping).
7. Hands-on PyTorch, actually run, with figures from the real runs:
   - fit a 2D triangle or disc to a target silhouette with a soft rasterizer;
   - compare against a hard rasterizer plus an edge-sampling gradient estimator;
   - fit the albedo and roughness of a sphere under known lighting with a tiny differentiable shader.
8. Research directions 2024-2026, from your own research and verified:
   - differentiable rendering for Gaussian primitives and ray tracing;
   - joint physics and rendering;
   - inverse rendering with generative (diffusion) priors.

Figures (computed): 8-11, for example:
- The edge coverage function and its derivative.
- Finite-difference versus edge-sampling gradient noise.
- A soft-rasterizer probability map at several sigma.
- The optimization trajectory of the triangle or disc from your run.
- A loss landscape over sphere position showing plateaus and local minima.
- Laplacian-regularized versus naive shape optimization (toy).
- The albedo/roughness fit, plotted as curves.
- A pipeline diagram.

Widget: `graphics-edge-gradient`. Drag an edge across a pixel grid and see per-pixel coverage, the
finite-difference gradient (with a step-size slider) and the analytic boundary gradient.

You may run PyTorch: CPU torch is installed. Keep runs small, under about 2 minutes each.
