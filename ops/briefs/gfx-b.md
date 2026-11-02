# Assignment gfx-b: graphics chapters 10 and 11

Write two new chapters of the series "Computer Graphics from Scratch" (series key `graphics`, existing
chapters 01-07). Both must link back to earlier chapters and must not repeat what those chapters already
explain:
- Chapter 03 has basic shadow mapping.
- Chapter 06 has hardware ray tracing, ReSTIR, denoising, TAA, learned upscaling and the neural radiance
  cache.

Files:
- Chapter 10: `2026-10-27-graphics-10-volumes-and-participating-media.md`, date `2026-10-27 09:10:00+0900`,
  series_order 10.
- Chapter 11: `2026-10-27-graphics-11-real-time-rendering-techniques.md`, date `2026-10-27 09:11:00+0900`,
  series_order 11.
- Scripts `bin/figures/graphics/graphics_10.py` and `graphics_11.py`; SVGs `assets/img/blog/graphics/10-*`
  and `11-*`.
- Reading list: append a section "Chapters 10-11" to `docs/reading-lists/graphics.md`.

## Chapter 10: Volumes and participating media

Why it matters: fog, smoke, clouds, skin and the sky. NeRF's volume rendering is a special case of this
physics: link `neural-rendering-02` and `neural-rendering-04`.

Suggested sections:
1. Absorption, out-scattering and extinction coefficients; albedo; emission.
2. Transmittance and the Beer-Lambert law, in homogeneous and heterogeneous media; optical depth.
3. The radiative transfer equation, and its integral form, the volume rendering equation.
4. Phase functions:
   - isotropic, Henyey-Greenstein (normalization and importance sampling, with code), Rayleigh;
   - the Mie approximation by HG mixtures, and the Draine function as a note.
5. Single scattering by ray marching: a NumPy ray marcher on a procedural density, shadow rays, jittering
   and banding.
6. Unbiased distance sampling:
   - delta (Woodcock) tracking, ratio tracking, residual ratio tracking;
   - null-scattering path integrals: Novák et al. 2014 and 2018 (survey), Miller et al. 2019.
7. Volumetric path tracing with multiple scattering (code sketch).
8. Data structures: OpenVDB and NanoVDB.
9. Real time:
   - froxel volumetric fog (Wronski 2014; Hillaire 2015);
   - sky and atmosphere (Bruneton & Neyret 2008; Hillaire 2020);
   - clouds (Schneider, Horizon Zero Dawn and the Nubis talks).
10. Subsurface scattering:
    - BSSRDF, the dipole (Jensen et al. 2001), Burley's normalized diffusion (2015);
    - separable SSS (Jimenez et al. 2015), random-walk SSS in production renderers.
11. Back to neural rendering: emission-absorption models and alpha compositing as quadrature.

Figures (computed): 8-11, for example:
- Beer-Lambert curves for several extinction values.
- Transmittance along a ray through a heterogeneous medium.
- HG polar plots for several g, with sampled directions.
- A ray-marching diagram.
- A small NumPy render of a procedural cloud: single scattering versus a multiple-scattering approximation.
- Delta versus ratio tracking estimator variance from a real Monte Carlo run.
- 2D random-walk multiple-scattering paths.
- Rayleigh sky colour versus sun elevation.
- A dipole diffusion profile.

Widget: `graphics-phase-function`. Drag g and the incoming direction, see the HG lobe as a polar plot, and
live-sample directions as dots. Note that `neural-rendering-volume-ray` already exists; do not duplicate it.

## Chapter 11: Real-time rendering techniques

Why it matters: how games fit a frame into 16 ms or less. Link `graphics-03`, `graphics-06`,
`graphics-engine-02` (render graphs, clustered shading in depth) and `graphics-engine-04` (Nanite, Lumen,
VSM in depth). This chapter is about the algorithms and their mathematics; the engine series covers
architecture.

Suggested sections:
1. Frame anatomy of a deferred renderer: G-buffer layout and packing (octahedral normals), forward versus
   deferred, the idea of tiled and clustered light culling (short).
2. Shadows beyond chapter 03:
   - cascaded shadow maps, with split schemes (uniform, logarithmic, practical lambda) computed;
   - PCF and PCSS (blocker search, penumbra estimate);
   - VSM, EVSM and moment shadow maps (Chebyshev bound);
   - contact shadows; a pointer to virtual shadow maps.
3. Ambient occlusion: the definition; SSAO (Crytek 2007), HBAO (Bavoil et al. 2008), GTAO (Jimenez et al.
   2016), with the horizon-integral math and code.
4. Screen-space reflections: ray marching in the depth buffer, hierarchical-Z tracing (McGuire & Mara 2014,
   JCGT), failure cases.
5. Real-time global illumination:
   - light maps;
   - irradiance probes and spherical harmonics (Ramamoorthi & Hanrahan 2001), with the SH projection and
     evaluation in code;
   - DDGI (Majercik et al. 2019);
   - voxel cone tracing (Crassin et al. 2011);
   - SDF and surface-cache GI (point to `graphics-engine-04` for Lumen);
   - ReSTIR GI (point to `graphics-06`).
6. Temporal reuse in depth: reprojection, motion vectors, disocclusion, history rectification (neighbourhood
   clamping and variance clipping, Salvi 2016). Keep it short and point to `graphics-06` for TAA and
   upscalers.
7. HDR, exposure and tone mapping:
   - Reinhard, filmic (Hable), ACES, AgX, Khronos PBR Neutral;
   - the sRGB transfer function, a linear workflow, HDR10 and wide-gamut output.
8. Performance thinking: bandwidth versus ALU, overdraw, occupancy, GPU profilers (RenderDoc, PIX, Nsight).

Figures (computed): 8-12, for example:
- G-buffer channels of a tiny scene you render in NumPy.
- A clustered froxel grid in 3D.
- CSM split distances for several lambda.
- PCSS penumbra width versus blocker distance.
- The VSM Chebyshev bound versus the true visibility.
- An AO horizon diagram, plus SSAO noise versus sample count.
- An SSR march through a depth buffer (2D).
- SH irradiance approximation of an environment at orders 1-3.
- Tone-mapping curves.
- The sRGB transfer function.

Widget: `graphics-sh-lighting`. Drag the light direction on a sphere, choose the SH order (0-3), and compare
the exact irradiance with its SH approximation side by side.

Order: finish, verify and commit chapter 10 before starting chapter 11.
