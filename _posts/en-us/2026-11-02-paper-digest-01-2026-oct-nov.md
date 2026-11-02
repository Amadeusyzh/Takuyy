---
layout: post
title: "Paper Digest | October-November 2026: graphics, engines, neural rendering, world models, embodied AI and XR"
date: 2026-11-02 12:00:00+0900
description: "Issue 01 of the dated paper digest: 42 verified papers first posted between 1 October and 2 November 2026, in six categories, each with what it does, how it works, what is new and how it connects to computer graphics."
categories: paper-digest
tags: [paper-digest, graphics, real-time-rendering, 3dgs, world-models, embodied-ai, xr]
series: paper-digest
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## About this issue

This is the first issue of the **Paper Digest**, a dated column that sits next to the learning series of this blog. The learning series ([graphics]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }}), [neural rendering]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}), [graphics engines]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}), [world models]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}), [embodied AI]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})) explain the foundations. The digest shows what researchers did with those foundations last month.

**Window and date stamp.** This issue covers papers whose **first version** appeared between **1 October and 2 November 2026**. It was compiled on **2 November 2026**, and every status below is "as of" that date. When a paper is accepted later, the status here will be out of date.

**How the papers were chosen.** I swept the arXiv listings of cs.GR, cs.CV, cs.RO, cs.HC, cs.LG and cs.AI for the window, ran keyword queries (Gaussian splatting, world model, vision-language-action, humanoid, virtual reality, path tracing, neural shading and others), and read the arXiv comments for acceptances at SIGGRAPH Asia 2026, NeurIPS 2026, CoRL 2026, UIST 2026, ISMAR 2026 and IEEE TVCG. From a few hundred candidates I kept **42 papers, 7 per category**, preferring, in order:

1. significance: a new capability or a clearly stronger result;
2. acceptance at a top venue;
3. open code or data;
4. relevance to graphics, 3D vision, AR/VR, HCI, world models and embodied AI.

**What was verified.** For every entry I opened the arXiv abstract page and checked the title, first author, first-submission date and the comments field; project and code links were opened once. Affiliations are given only when the paper's own pages state them. Numbers are quoted only as "the authors report ...". The summaries are mine: they are written from the abstracts and project pages, not copied, and a short summary cannot replace reading the paper.

**Status labels.** "SIGGRAPH Asia 2026 (accepted)" and similar labels come from the arXiv comments field. "Preprint" means that no venue was stated, not that the paper was rejected. A preprint has not been peer reviewed.

**How to read an entry.** Each entry has four parts: *what it does*, *how it works* (the key idea, at the level of a graduate student), *what is new* compared with prior work, and the *connection to CG*: which representation, rendering, geometry, simulation, animation or interaction idea it uses or changes, with links to the chapters of this blog that explain the background.

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-overview.svg" localized="true" width="85%" caption="The issue at a glance. Each bar counts the entries of one category. The dark part counts papers accepted at a venue (per the arXiv comments as of 2 Nov 2026) and the light part counts preprints. Each triangle marks one paper with released code or data. Note that the engine and real-time papers are all still preprints, while neural rendering has the most SIGGRAPH Asia acceptances." %}

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-timeline.svg" caption="Timeline of the window. Each dot is one paper at its first arXiv submission date, in one lane per category (GFX graphics, ENG engines and real-time, NR neural rendering, WM world models, EAI embodied AI, XR HCI/XR). The numbers are the entry numbers used in this post. Look at the cluster around 20 October: that week brought Matrix-Game 4.0, three CoRL 2026 robot papers and several Gaussian-splatting papers." %}

### Explore this issue

The explorer below contains all 42 entries. Filter by category or by connection to computer graphics, scrub along the timeline, and tap a paper to read its summary and open its links.

{% include widget.liquid name="paper-digest-explorer" height="640" caption="Interactive explorer. Tap a category chip to show only that category (tap more chips to add categories, or All to reset). Tap a CG link such as *rendering* to keep only papers that touch it. Tap or drag across the dots to select a paper; the card shows its summary from this page, with links to the paper, code, project page and the full entry." %}

## 1. Graphics

Rendering, geometry, physical simulation, animation and imaging. This month the graphics papers are mostly about **simulation**: differentiable contact, learned integrators, material point methods and Monte Carlo PDE solvers. Background: [physically based simulation]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}) and [animation and characters]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}).

### 1. [Tabula Rasa: Monte Carlo estimation of unit-variance noise with controlled spatio-temporal correlation](https://arxiv.org/abs/2610.11653) {#pd-01}

*Tobias Ritschel et al. (7 authors) · SIGGRAPH Asia 2026 Conference Papers (accepted) · first submitted 8 Oct 2026 · [code](https://github.com/facebookresearch/Tabula-Rasa)*

- **What it does.** It generates noise fields that have exactly unit variance and a chosen correlation over space and time. Rendering and simulation pipelines use such fields for dithering, sampling and procedural detail.
- **How it works.** The authors treat noise synthesis as a Monte Carlo estimation problem: they estimate a pixel reconstruction and its variance together, and normalize by the variance estimate. To do so cheaply they borrow *sketching*, a technique from database research that summarizes large data streams in small, fixed-size structures.
- **What is new.** Earlier ways to build correlated noise with controlled temporal coherence are more complex. The authors report that their generator is simpler and faster than earlier methods.
- **Connection to CG.** Noise with a controlled spectrum decides how Monte Carlo error looks in a frame and how it flickers over time, which in turn decides how well a temporal denoiser can remove it. See Monte Carlo estimation in [ray and path tracing]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}) and the temporal reuse in [real-time ray tracing]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}).

### 2. [DiffGIPC: Differentiable Mixed-Coordinate Contact Dynamics on GPU](https://arxiv.org/abs/2610.19091) {#pd-02}

*Kemeng Huang et al. (5 authors, with Taku Komura) · preprint · first submitted 13 Oct 2026*

- **What it does.** It is a GPU simulator for Incremental Potential Contact (IPC) that you can differentiate. It handles scenes that mix soft deformable bodies with nearly rigid ones.
- **How it works.** Nearly rigid parts are modeled as *affine bodies*: each has only 12 degrees of freedom, a 3x3 matrix and a translation. Soft parts use full finite-element (FEM) coordinates. For the backward pass the method solves one coupled FEM-affine *adjoint* linear system per frame, so the system is much smaller, while the contact and friction terms stay coupled. A PyTorch interface connects user parameters and losses to the simulator.
- **What is new.** Penalty-based or velocity-level differentiable simulators let objects interpenetrate or drift. IPC guarantees that they never intersect, but differentiating it was expensive. The authors report peak speedups over DiffIPC of about 150x with full-space FEM and about 4133x with affine bodies.
- **Connection to CG.** IPC's barrier energy keeps contacts free of intersections. Gradients through it enable inverse design, such as material and shape fitting, and system identification for robots. See implicit integration and contact in [physically based simulation]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}) and the inverse problems in [differentiable rendering]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }}).

### 3. [Neuroll: Real-Time Neural Strand-Based Hair Simulation via Simulator-in-the-Loop Unrolling](https://arxiv.org/abs/2610.04689) {#pd-03}

*Gene Wei-Chin Lin et al. · preprint · first submitted 3 Oct 2026*

- **What it does.** It is a neural time integrator for strand-based hair that runs in real time on commodity hardware.
- **How it works.** The network takes the inputs a classical integrator would take: the previous hair states, the material stiffness and the collision geometry. It works in each strand's local frame, so it does not depend on hair density. Training is self-supervised with the simulator *in the loop*: the network is unrolled over randomly chosen horizons, and the physics is enforced along the whole rollout, not just for one step.
- **What is new.** Earlier neural hair and cloth simulators often lose physical plausibility and fail on inputs unlike their training data. This one aims at stable long rollouts that transfer across hairstyles, materials and body motions. It also supports quasi-static simulation by resetting the state.
- **Connection to CG.** It is a learned replacement for the time-stepping loop in [physically based simulation]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}). It matters for real-time characters ([animation and characters]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})), where hair is among the most expensive secondary motions.

### 4. [PhysSkin++: Real-Time and Generalizable Physics-Based Animation via Self-Supervised Neural Skinning](https://arxiv.org/abs/2610.26067) {#pd-04}

*Yuanhang Lei et al. (12 authors) · preprint · first submitted 19 Oct 2026 · [project](https://zju3dv.github.io/PhysSkin_plus/)*

- **What it does.** Given any static shape, a feed-forward network predicts a *neural skinning field*. The field defines a small deformation subspace in which elastic simulation runs in real time, with no per-object training.
- **How it works.** A neural skinning field assigns each point a weight per handle, as in linear blend skinning. The handles' affine transforms then become the reduced coordinates of the simulation. The autoencoder is trained self-supervised from physical energies, not simulation data. Normalized skinning fields and a conflict-aware gradient correction keep the physics loss and the orthogonality loss from fighting each other. Because the subspace is a field, it can drive meshes, point clouds and 3D Gaussians alike.
- **What is new.** Earlier neural subspace methods, including the original PhysSkin, optimize one subspace per shape. PhysSkin++ predicts the subspace for unseen shapes.
- **Connection to CG.** Skinning is the deformation model of [animation and characters]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}), and reduced-order elasticity is a classic speed-up in [physically based simulation]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}). Driving [3D Gaussians]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) directly makes captured scenes physically animatable.

### 5. [Total Deformation-based MPM for Perfectly Elastic Solid Simulation with Strong Deformations](https://arxiv.org/abs/2610.36945) {#pd-05}

*Timna Böttcher et al. (3 authors, with Jan Bender) · preprint · first submitted 27 Oct 2026*

- **What it does.** It is a material point method (MPM) for perfectly elastic solids that does not fracture artificially under large deformations and handles collisions naturally.
- **How it works.** Standard MPM updates each particle's deformation gradient $F$ from the grid velocity gradient. Errors accumulate in that update, and they show up as numerical fracture. Here, $F$ is derived directly from the particle positions relative to a fixed reference grid ("total" deformation), with no velocity-gradient update, and elastic forces are computed on the current, deformed grid.
- **What is new.** Earlier total-Lagrangian MPM variants evaluate forces in the reference state, which makes standard collision handling awkward. This formulation supports collisions at the particle level and suppresses zero-energy modes.
- **Connection to CG.** MPM is the workhorse for snow, sand and soft solids in film. See MPM and hyperelasticity in [physically based simulation]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}).

### 6. [Walk on Multiscale Media: Compiling Editable and Composable Transport Medium Prefabs for Monte Carlo PDE Solvers](https://arxiv.org/abs/2610.35952) {#pd-06}

*Yunfeng Liao et al. (2 authors) · preprint · first submitted 24 Oct 2026*

- **What it does.** It precompiles fine-scale transport inside heterogeneous materials into reusable, editable "prefabs" that Monte Carlo PDE solvers can plug in, so material edits become interactive.
- **How it works.** Walk-on-Spheres (WoS) solves PDEs such as diffusion with random walks that jump between spheres, the same way a path tracer walks between surfaces, with no mesh. Inside a finely structured medium, walks become very short and slow. Each prefab stores coarse transition probabilities derived from multiscale finite-element bases, port-to-port operators, exit distributions and recorded trajectories. A hybrid WoS solver then jumps across a whole prefab in one step. The method also supports overlapping absorption fields, gradient steering through path reweighting, and transient diffusion.
- **What is new.** Plain WoS and Walk-on-Stars must re-solve the fine scale after every edit. Prefabs make the medium composable, like instancing in a scene graph.
- **Connection to CG.** Walk-based PDE solvers come from the rendering community and reuse its tools: importance sampling, path reweighting and BVH-style queries. Compare random walks in [ray and path tracing]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}) and in [volumes and participating media]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }}).

### 7. [Dynamic Skinning: Kinematics-Driven Cartoon Effects for Articulated Characters](https://arxiv.org/abs/2610.40976) {#pd-07}

*Damien Rohmer et al. (4 authors) · IEEE TVCG 2026 (accepted version) · first submitted 29 Oct 2026 · [project](https://velocityskinning.com/)*

- **What it does.** It adds physics-like secondary motion, such as jiggle, oscillation and waves running along a limb, to skinned characters without running a simulation.
- **How it works.** A set of *deformers* offsets each vertex as a closed-form function of time and of the time derivatives of its position. The derivatives come from the skeleton's motion, on top of standard skinning such as linear blend skinning (LBS). Because nothing is integrated over time, the result is fast, stable and directly controllable by artists.
- **What is new.** It is a kinematic, closed-form alternative to simulation-based secondary motion: it gives cartoon-style effects at almost no cost and with no tuning of solver stability.
- **Connection to CG.** It extends the skinning pipeline of [animation and characters]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}). Compare it with PhysSkin++ (entry 4): one uses real physics in a learned subspace, the other gets a physics-like look from kinematics alone.

## 2. Graphics engines and real-time

Real-time rendering, GPU and engine systems, neural shading in engines and tools. The common thread this month is **moving expensive integration out of the frame**: into a pre-integrated network (entry 10), a radiance cache (12), a hardware unit (13) or a hierarchy (14). Background: [real-time ray tracing]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}), [real-time rendering techniques]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }}) and [GPU APIs and render graphs]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}).

### 8. [Windfoil: Closed-Form Coverage for Real-Time and Differentiable Vector Graphics](https://arxiv.org/abs/2610.02468) {#pd-08}

*Matt DesLauriers (single author) · preprint · first submitted 1 Oct 2026*

- **What it does.** It is one WebGPU method that covers real-time vector-graphics rendering, high-resolution print rasterization and differentiable vector-graphics optimization.
- **How it works.** A pixel's coverage of a filled shape is the integral of the shape's winding number over the pixel footprint. For contours made of quadratic Bézier curves, the paper evaluates this box-filtered winding number **in closed form** on the GPU. This gives anti-aliased coverage that is exact for a box filter, and the same formula is differentiable with respect to the control points.
- **What is new.** It is compared with Skia and Slug for rendering and with DiffVG and Bézier Splatting for optimization. The author reports coverage closer to the reference at speeds comparable to Slug, and a fraction of the per-step cost when optimizing.
- **Connection to CG.** This is anti-aliasing as integration over a pixel, the idea behind [rasterization]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }}), applied to curves. Because the result is analytic and differentiable, it links to [differentiable rendering]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }}). WebGPU is the API of the [mini engine]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }}).

### 9. [SteadySplats: Resampling of Low-Variance Gaussians for High-Fidelity Stochastic Rendering](https://arxiv.org/abs/2610.05576) {#pd-09}

*Felix Windisch et al. (7 authors, with Chris Wyman, Georgios Kopanas, Bernhard Kerbl and Markus Steinberger) · preprint · first submitted 4 Oct 2026*

- **What it does.** It makes *stochastic transparency* practical for 3D Gaussian splats: Gaussians are rendered without sorting, and the result stays close to sorted 3DGS.
- **How it works.** 3DGS normally sorts Gaussians by depth and alpha-blends them front to back. Stochastic transparency avoids the sort: each pixel keeps a Gaussian with a probability equal to its opacity and depth-tests it like an opaque surface. The expected result equals alpha blending, but at one sample per pixel it is very noisy. SteadySplats reduces the noise with history-based spatial resampling and temporal importance resampling, in the spirit of ReSTIR, and adds a training-time colour regularizer that lowers variance along each view ray.
- **What is new.** Earlier stochastic 3DGS renderers were fast but too noisy to use. The authors report a 13 dB PSNR improvement at one sample per pixel over previous stochastic methods, in a Vulkan renderer.
- **Connection to CG.** No sorting means splats can go through an ordinary depth-buffered engine pipeline and be mixed with meshes. See [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}), ReSTIR in [real-time ray tracing]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}) and splats in production engines in [AI meets graphics engines]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }}).

### 10. [Real-time Rendering of Pre-integrated Neural Emitters](https://arxiv.org/abs/2610.06762) {#pd-10}

*Arno Coomans et al. (4 authors, with Markus Steinberger) · preprint · first submitted 5 Oct 2026*

- **What it does.** Neural Emission Fields (NEF) give noise-free direct lighting from geometrically complex light sources with a single network evaluation per shading point.
- **How it works.** A network learns the illumination that the emitter produces in the volume around it. Its inputs are the shading point's position, normal, view direction and material, and it has separate diffuse and glossy output heads. Training happens in the emitter's local frame, so a trained NEF can be placed in other scenes under rigid transforms. Self-occlusion, interreflection inside the emitter, spatially varying emission and deformation are all baked in.
- **What is new.** Analytic light models handle only simple shapes. Light sampling is noisy, and proxy methods still integrate radiance at run time. NEF moves the integral over the emitter's surface out of the frame entirely.
- **Connection to CG.** It pre-integrates the direct-lighting integral of the [rendering equation]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}), much as split-sum image-based lighting does for environment maps in [real-time rendering techniques]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }}).

### 11. [Masking Judder in Foveated Rendering with Phase-Shifted Noise](https://arxiv.org/abs/2610.10811) {#pd-11}

*Ville Cantory et al. (4 authors, with Piotr Didyk) · preprint · first submitted 7 Oct 2026*

- **What it does.** When the periphery is rendered at a lower frame rate, as in temporally foveated rendering, motion there looks jerky ("judder"). This paper hides the judder with cheap synthesized noise.
- **How it works.** Translating a Gabor kernel is the same as shifting its phase. So by modulating the *phase* of procedural Gabor noise over time, the method creates apparent smooth motion without re-rendering the noise. Given the on-screen angular velocity and the reduced temporal rate, it chooses a spatial-frequency band in which the noise masks the judder without adding visible aliasing of its own.
- **What is new.** Earlier work used noise to restore spatial detail and the perception of speed lost to foveation. Temporal filtering suppresses judder but costs compute and blurs detail. The authors' user experiments report a substantially wider range of speeds that look smooth.
- **Connection to CG.** It is perception-driven rendering for VR: compare the foveated rendering demo in the [Interactive Lab]({{ '/' | relative_url }}#lab) and [embodied AI meets XR and HCI]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }}).

### 12. [Neural Caching of Prefiltered Radiance for Specular Lighting](https://arxiv.org/abs/2610.11702) {#pd-12}

*Dmitrii Klepikov and Vladimir Frolov · preprint · first submitted 8 Oct 2026*

- **What it does.** It is a variant of neural radiance caching (NRC) that also works for glossy and specular surfaces, in real time and adapting online.
- **How it works.** NRC trains a small network online to predict outgoing radiance at path vertices, so paths can be cut short. This variant parameterizes the query by the reflection direction and trains a roughness-dependent target: it predicts *prefiltered* incoming radiance. That prediction is combined with a precomputed BRDF integration table through the split-sum approximation, the factorization real-time engines use for image-based lighting.
- **What is new.** Classic NRC struggles with specular lighting, because outgoing radiance there changes sharply with the view direction. The authors report faster convergence to a path-traced reference and better specular quality on the Bunny and Specular Sponza scenes.
- **Connection to CG.** It combines two standard tools: radiance caching from [real-time ray tracing]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}) and the split-sum approximation from [real-time rendering techniques]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }}), with the microfacet BRDF from [physically based rendering]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}).

### 13. [A Hybrid and Hierarchical Ray Tracing Method for Efficient 3D Gaussian Rendering](https://arxiv.org/abs/2610.13498) {#pd-13}

*Tiancheng Zhao et al. (6 authors) · preprint (cs.AR) · first submitted 9 Oct 2026*

- **What it does.** H2-Ray co-designs the algorithm and the hardware to speed up ray-traced 3D Gaussians on RT-core-style ray-tracing units.
- **How it works.** It has three parts. **LB-SBVH** is a density-aware uniform-grid BVH that balances the work per node. **RCPR** lets one proxy ray share its traversal state with neighbouring rays. **UIE** is an intersection datapath that handles both Gaussian and triangle primitives, with 40% of its floating-point units shared.
- **What is new.** Ray-traced Gaussian renderers such as RaySplats suffer from load imbalance, redundant traversal and mixed primitive types on current GPUs. Using a cycle-accurate model of a modified RT core plus CUDA timings on an RTX A5000, the authors report a geometric-mean speedup of 3.77x, and up to 9.26x, over RaySplats.
- **Connection to CG.** Ray tracing Gaussians, rather than rasterizing them, gives secondary effects such as reflections, shadows and distorted cameras. See BVHs in [ray and path tracing]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}), hardware RT in [real-time ray tracing]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}) and [3DGS frontiers]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}).

### 14. [Geometric Queries on Tessellation-Free Displaced Surfaces](https://arxiv.org/abs/2610.21584) {#pd-14}

*Bing Xu et al. (3 authors) · preprint · first submitted 15 Oct 2026*

- **What it does.** It answers surface sampling, specular path search and closest-point queries directly on displacement-mapped surfaces, without first tessellating them into triangles.
- **How it works.** The method builds a texture-space hierarchy. Each node stores a local *affine* height plane plus a conservative bound on how far the true height deviates from it. From the plane and the bound it derives distance and intersection bounds, area estimates for sampling, and slope bounds for specular path search, each with its own traversal algorithm.
- **What is new.** Earlier tessellation-free methods mostly handled ray intersection and stored only min/max height bounds, which throw away how the height varies across a node. The first-order (planar) bounds are tighter and support many more queries.
- **Connection to CG.** Displacement maps add fine detail without storing more geometry, a goal shared with virtualized geometry such as Nanite in [inside production engines]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}). The queries are the building blocks of [geometry processing]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) and of [path tracing]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}).

## 3. Neural rendering

NeRF, 3D Gaussian Splatting, reconstruction, feed-forward 3D and relighting. Three SIGGRAPH Asia 2026 papers extend what a Gaussian scene can *contain*: X-ray interiors, discrete object states and volumetric video. The others push **feed-forward** prediction, from 4D novel views to global illumination. Background: [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) and [3DGS frontiers]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}).

### 15. [X-Splat: Unified Gaussian Splatting for Joint RGB and X-ray 3D Reconstruction](https://arxiv.org/abs/2610.23237) {#pd-15}

*Wangze Xu et al. (7 authors, with Imari Sato and Takashi Ijiri) · SIGGRAPH Asia 2026 Conference Papers (accepted) · first submitted 16 Oct 2026 · [project](https://zezeaaa.github.io/X-Splat/)*

- **What it does.** It reconstructs one Gaussian representation of an object from both RGB photos and X-ray images, so its surface appearance and its internal structure live in the same model.
- **How it works.** All Gaussians share one set of geometric parameters (position, covariance and density). Only Gaussians near the surface also carry colour. The two modalities are registered through geometric proxies, from multi-view stereo for RGB and from X-ray geometry, instead of aligning two separately optimized Gaussian sets afterwards. During joint optimization a surface-depth consistency loss derived from the X-ray geometry guides the RGB reconstruction.
- **What is new.** It replaces "two independent reconstructions plus registration" with one shared geometry. The authors evaluate on InsideOut and on a new Flower & Insect dataset.
- **Connection to CG.** An X-ray image is a line integral of attenuation, the same transmittance integral as volume rendering in [volumes and participating media]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }}) and [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}). X-Splat asks one set of Gaussians to explain both the emission-absorption model of RGB and the pure-absorption model of X-rays.

### 16. [SwitchSplat: Learning Discrete Object States from Casually Captured Scenes](https://arxiv.org/abs/2610.24812) {#pd-16}

*Yizheng Xie et al. (6 authors, with Andrea Tagliasacchi) · SIGGRAPH Asia 2026 (accepted) · first submitted 17 Oct 2026 · [project](https://switchsplat.github.io)*

- **What it does.** From a casual capture of a scene in which objects change state (for example, a door that is open in some frames and closed in others), it builds a Gaussian scene whose objects can be **switched** between their states independently, including combinations that were never captured.
- **How it works.** A static base of Gaussians is shared. Each interactable object gets a *slot* that holds one set of Gaussians per discrete state. The assignment of Gaussians to slots is differentiable, so each state's geometry and appearance are learned from video without annotations. At render time any combination of slot states is composed and rendered from any viewpoint.
- **What is new.** Static 3DGS cannot represent state changes, and time-conditioned 4D Gaussians can only replay the captured sequence. SwitchSplat factorizes the scene into independent discrete variables, so it can compose states.
- **Connection to CG.** It turns a reconstruction into something closer to a game asset with states, a step from [capture to VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }}) toward interactive scenes. The discrete-state view also matches how a [game engine]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}) stores interactable objects.

### 17. [Holo4D: Holistic 4D Reconstruction as Geometric Control for Video Diffusion](https://arxiv.org/abs/2610.25276) {#pd-17}

*Yushi Lan et al. (6 authors) · NeurIPS 2026 (accepted) · first submitted 18 Oct 2026 · [project](https://nirvanalan.github.io/projects/holo4d/)*

- **What it does.** It re-renders a monocular video along a new camera trajectory and keeps the scene's geometry and motion consistent: a "reshoot" of the video.
- **How it works.** First, the 3D trajectories of points over the whole video are reconstructed into a holistic 4D scaffold. The scaffold is projected into the new camera views, and its geometry plus the source appearance condition a pretrained video diffusion model. The model fills in regions the scaffold does not cover. The generator does not need retraining when the 4D reconstructor is replaced.
- **What is new.** Earlier camera-control methods warp each frame with its own depth map. Dense 4D trajectories keep the scene consistent across time and across views.
- **Connection to CG.** This is the "geometry guides a generator" pattern: a 4D point representation is *rendered* (projected) into the target camera, and diffusion acts as the appearance model. See projection in [cameras and multi-view geometry]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}) and video world models in [video world simulators]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }}).

### 18. [RealMe: Immersive Volumetric Video from Minimal Captures](https://arxiv.org/abs/2610.30023) {#pd-18}

*Chenxu Zhou et al. (7 authors, with Xiaowei Zhou and Jiaming Sun) · SIGGRAPH Asia 2026 Conference Papers (to appear) · first submitted 21 Oct 2026 · [project](https://zju3dv.github.io/realme)*

- **What it does.** It produces volumetric video of people from a few low-resolution cameras instead of a dense studio rig.
- **How it works.** A high-resolution video diffusion model upgrades the sparse, low-resolution captures to 2K multi-view videos that are consistent in 4D, and these then feed a standard volumetric reconstruction. Capture-side information is encoded into the latents with layout-aware positional embeddings. Factorized spatio-temporal attention is adapted to the multi-view layout. A loss in the latent frequency domain pushes the generated views toward the statistics of real captures.
- **What is new.** It replaces most of the cameras of a dense capture dome with a generative "view densification" stage. The authors evaluate on DNA-Rendering and a new RealVV dataset.
- **Connection to CG.** Volumetric video is the content format for VR telepresence ([capture to VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})). The idea of generating the missing views and then reconstructing is a recurring theme of [3D and 4D world generation]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }}).

### 19. [RADIANT: Object-Centric Feed-Forward Global Illumination](https://arxiv.org/abs/2610.32075) {#pd-19}

*Sarah Zhang et al. (5 authors, with Wojciech Matusik) · preprint · first submitted 23 Oct 2026*

- **What it does.** It is a transformer that renders global illumination for new scenes in one forward pass, with no ray tracing and no per-scene optimization, and its cost grows with the number of *objects*, not the number of triangles.
- **How it works.** Each object is summarized by a fixed budget of 32 surface-patch tokens. A scene transformer models light exchange between objects with an *SE(3)-invariant form-factor attention*: distances and orientations between patches enter the query-key products, weighted by learned area and material gains. This mirrors the geometric form factor of radiosity, explained below. A view decoder lets camera rays cross-attend to the scene tokens, guided by depth-tested point splats for primary visibility.
- **What is new.** RenderFormer (SIGGRAPH 2025) tokenizes every triangle, so its attention cost grows quadratically with mesh resolution. The authors report 32.2 dB tone-mapped PSNR, 3.3 dB above RenderFormer, and 0.83 s for a 512x512 view of a 500-object scene.
- **Connection to CG.** Radiosity computes light exchange between patches with the **form factor**, the fraction of energy leaving patch $i$ that arrives at patch $j$. For small patches,

$$
F_{i\to j} \approx \frac{\cos\theta_i \,\cos\theta_j}{\pi\, r^2}\, A_j ,
$$

where $r$ is the distance between the patch centres, $\theta_i$ and $\theta_j$ are the angles between each patch normal and the line joining them, and $A_j$ is the area of the receiving patch. The figure computes it for a patch sliding past another one. RADIANT's attention is a learned, material-aware generalization of this kernel. Like the formula, it depends only on relative pose, so it is SE(3)-invariant. Background: the rendering equation in [physically based rendering]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}) and global illumination in [ray and path tracing]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}).

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-form-factor.svg" caption="The geometric form factor behind RADIANT's attention. Left: patch $i$ at the origin faces up, and a patch $j$ of area $A_j=0.1$ at height 2 faces down; it slides sideways by $y$. Right: $F_{i\to j}$ as a function of $y$. It falls as $4A_j/(\pi r^4)$, because both cosines shrink as $2/r$ and the distance term adds $1/r^2$. The dots are the two worked examples in the text." %}

**Worked example.** Put patch $i$ at the origin with normal $(0,0,1)$ and a patch $j$ of area $0.1$ at $(0,0,2)$ with normal $(0,0,-1)$. Then $r=2$ and both cosines are 1, so $F = 0.1/(4\pi) \approx 0.00796$. Slide $j$ to $(0,2,2)$: now $r^2=8$ and both cosines are $2/\sqrt{8}\approx 0.707$, so $F = 0.5 \cdot 0.1/(8\pi) \approx 0.00199$, four times smaller. A learned attention that respected only distance would miss the cosine factors. That is why RADIANT embeds orientation, not only position, into its attention.

```python
import numpy as np

def form_factor(xi, ni, xj, nj, Aj):
    """Point-to-patch form factor F_{i->j} for small patches."""
    d = xj - xi
    r2 = d @ d
    w = d / np.sqrt(r2)
    cos_i = max(ni @ w, 0.0)
    cos_j = max(nj @ -w, 0.0)
    return cos_i * cos_j * Aj / (np.pi * r2)

ni = np.array([0.0, 0.0, 1.0])
nj = np.array([0.0, 0.0, -1.0])
print(form_factor(np.zeros(3), ni, np.array([0.0, 0.0, 2.0]), nj, 0.1))  # ~0.00796
print(form_factor(np.zeros(3), ni, np.array([0.0, 2.0, 2.0]), nj, 0.1))  # ~0.00199
```

Try it yourself: the widget below evaluates the same function while you move patch $j$.

{% include widget.liquid name="paper-digest-form-factor" height="420" caption="Form factor explorer. Drag the red patch $j$ anywhere above patch $i$, and use the slider to tilt it. The readout shows $r$, both cosines and $F_{i\to j}$, and compares $F$ with the start position $(0,2,2)$. Things to try: move $j$ straight up and watch $F$ fall as $1/r^2$; tilt $j$ toward $i$ and see $\cos\theta_j$ reach 1; tilt it away until its normal makes more than 90 degrees with the line to $i$ (at the start position, a tilt of +45 degrees) and $F$ drops to 0." %}

### 20. [FL4N: Feed-forward Latent Model for 4D Novel View Synthesis](https://arxiv.org/abs/2610.35854) {#pd-20}

*Eunbeen Hong et al. · preprint · first submitted 26 Oct 2026 · [project and code](https://cvlab-kaist.github.io/FL4N/)*

- **What it does.** It synthesizes novel views of a *dynamic* scene from a monocular video in one forward pass, without explicit 4D primitives.
- **How it works.** The scene is a single space-time latent, not a set of moving Gaussians. Dynamics are modeled as *residuals* on top of a pretrained static-scene latent prior, so the model needs little dynamic training data. A lightweight dynamic encoder uses the static scene features to separate object motion from camera parallax. Training uses only an image-synthesis loss.
- **What is new.** Earlier feed-forward 4D methods predict explicit 4D Gaussians, which the authors say cause temporal inconsistency and artifacts. The authors report real-time rendering and state-of-the-art 4D novel-view quality.
- **Connection to CG.** It pushes the "latent scene, decoded by a network" end of the representation spectrum, the opposite end from explicit splats (compare [fast radiance fields]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }}) and [3DGS frontiers]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})). Separating motion from parallax is the central difficulty of dynamic reconstruction ([cameras and multi-view geometry]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})).

### 21. [LucidLyra: Feed-Forward Generative 3D Scene Reconstruction and Joint Understanding via Multi-Task Distillation](https://arxiv.org/abs/2610.40495) {#pd-21}

*Oliver Hahn et al. (10 authors; project page hosted by NVIDIA Research) · preprint · first submitted 29 Oct 2026 · [project](https://research.nvidia.com/labs/sil/projects/lucidlyra)*

- **What it does.** In one forward pass it turns video latents into a 3D Gaussian scene that also carries open-vocabulary semantics and instance features.
- **How it works.** It distills two kinds of teacher into one network: a camera-controlled video diffusion model, which supplies geometry and appearance, and frozen 2D vision foundation models, which supply semantic and instance features. Each predicted Gaussian stores geometry, colour, a semantic embedding and a class-agnostic instance feature. No per-scene optimization and no 3D labels are needed, and the latent formulation also extends to monocular video of dynamic scenes.
- **What is new.** Earlier pipelines chain a generative 3D reconstructor with a separate 3DGS segmentation step. Predicting everything jointly keeps reconstruction quality while adding understanding.
- **Connection to CG.** Gaussians that carry features beyond colour are rendered with the same alpha compositing as 3DGS. The features are simply blended instead of RGB, the same trick L3G-World (entry 28) uses. See [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) and generated worlds in [3D and 4D world generation]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }}).

## 4. World models

Video and interactive world models, 3D/4D world generation, JEPA and evaluation. The headline this month is a structural shift: several systems **separate the world state from the pixels**. A conventional engine or an explicit 3D memory holds the state, and a video generator only renders it (figure below). Background: [video world simulators]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }}) and [JEPA and evaluation]({{ '/blog/2026/world-models-05-jepa-evaluation-and-open-problems/' | relative_url }}).

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-engine-vs-generator.svg" caption="Two ways to build a playable world model. Top: an end-to-end model $G_\theta$ maps past frames $x_{\le t}$ and an action $a_t$ to the next frame; the world state exists only implicitly in the pixels. Bottom (Matrix-Game 4.0, BoxWorld): an explicit engine updates a state $s_{t+1}=f(s_t,a_t)$ with executable rules, a cheap proxy render $r(s_{t+1})$ (low-poly geometry or layout boxes) exposes it, and the video generator only adds appearance on top. Follow the dashed arrow: in the bottom design the generator never decides what happens, only how it looks." %}

### 22. [Orbia: Do Generated Videos Form a Consistent 3D World?](https://arxiv.org/abs/2610.20693) {#pd-22}

*Dongyue Lu et al. (23 authors) · technical report · first submitted 14 Oct 2026 · [project](https://orbia-bench.github.io/) · [code](https://github.com/worldbench/Orbia)*

- **What it does.** It is a benchmark that tests whether interactive video world models keep a consistent 3D world when the camera explores and then **revisits** places.
- **How it works.** It defines 720 test instances across six explore-and-revisit protocols, some of them minute-long. Three things are measured with geometric probes: *input preservation* against registered RGB-D references, *persistence* of generated content when it is seen again, and *3D self-consistency*, which covers cross-view depth and feature correspondence, scale agreement, and how well a Gaussian splatting model fitted to the generated frames renders held-out views.
- **What is new.** Earlier world-model evaluations mostly use perceptual video metrics, which ignore whether the world stays geometrically consistent. The authors evaluate 27 text-, action- and camera-conditioned models.
- **Connection to CG.** It uses 3D reconstruction ([cameras and multi-view geometry]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}), [3DGS]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})) as a *measuring instrument* for generative models. It is a concrete answer to the evaluation question in [JEPA, evaluation and open problems]({{ '/blog/2026/world-models-05-jepa-evaluation-and-open-problems/' | relative_url }}).

### 23. [Matrix-Game 4.0: Harnessing Video Models for Real-Time Playable Game Worlds](https://arxiv.org/abs/2610.27999) {#pd-23}

*Jihai Zhang et al. (18 authors) · preprint · first submitted 20 Oct 2026 · [project](https://matrix-game-v4-0.github.io/page/) · [code](https://github.com/SkyworkAI/Matrix-Game)*

- **What it does.** It is a real-time playable game-world system that separates game *logic* from visual *generation*.
- **How it works.** A lightweight engine tracks the world state, enforces the rules and renders low-poly proxies. A multimodal coding agent turns the player's ideas into game code and into dynamic captions. An autoregressive video model then "re-renders" the proxies with rich detail. For speed, it is distilled into a causal generator that outputs four-frame chunks in one or two denoising steps.
- **What is new.** Earlier interactive world models, including earlier Matrix-Game versions, generate the whole world implicitly, with no persistent state or executable rules. The authors report 480p at 60 FPS on one RTX 5090, with 112 ms from key press to display.
- **Connection to CG.** In graphics terms, the video model is a *neural shading pass* over a G-buffer-like proxy render, and the engine is an ordinary [game loop]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}). This is the neural game engine debate of [AI meets graphics engines]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }}), settled here in favour of a hybrid.

### 24. [Rethinking Video Autoencoders for Interactive World Models](https://arxiv.org/abs/2610.30129) {#pd-24}

*Adrien Ramanana Rahary et al. (5 authors, with Patrick Pérez) · preprint · first submitted 21 Oct 2026 · [blog, code and models](https://kyutai.org/blog/2026-10-21-cadre)*

- **What it does.** It introduces CADRE, a family of causal diffusion representation autoencoders at several compression levels, and studies how the choice of autoencoder affects interactive world models.
- **How it works.** All family members share a diffusion decoder, self-distilled to one or a few steps, and differ only in a small bottleneck applied to frozen visual features. A world model is trained on top of each member, in manipulation and in navigation environments, to map the frontier between latency and quality.
- **What is new.** Most world models reuse an autoencoder built for offline text-to-video, with a fixed compression. The study finds that manipulation tolerates *temporal* compression, that navigation with a moving camera tolerates *spatial* compression, and that at strong compression a diffusion decoder beats perceptual regression. The authors report that CADRE members make up most of the latency-quality frontier.
- **Connection to CG.** The latent space is the world model's "framebuffer format", and choosing its compression is like choosing texture compression or resolution in an engine. See latent diffusion in [generative modeling foundations]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }}).

### 25. [World-in-Context: Interactive Video World Modeling with In-Context Conditioning](https://arxiv.org/abs/2610.33169) {#pd-25}

*Harold Haodong Chen et al. (7 authors) · preprint · first submitted 23 Oct 2026 · [project](https://haroldchen19.github.io/WiC-site/)*

- **What it does.** It is a single conditioning scheme for view, action and camera control in interactive video world models. For example, it can switch between first- and third-person views on command.
- **How it works.** *In-Context Conditioning* turns the view, action and camera controls into explicit tokens in the same self-attention space as the video tokens. *Interaction-Transport RoPE* adjusts the rotary position encoding of temporal attention by the accumulated control transitions, so that continuity holds across executed actions. Explicit view tokens let view switching be learned from single-view data.
- **What is new.** Earlier models leave the view mode implicit in captions, entangle actions with camera motion, and use separate conditioning branches. The authors report 93.8% success at switching perspective, against 18.8% for 5B baselines. On WBench navigation their 5B model scores 81.5, against 81.6 for the 22B EchoWM.
- **Connection to CG.** Keeping the camera separate from agent actions is the separation between view and model transforms in a renderer ([graphics roadmap and math]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})). See action conditioning in [video world simulators]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }}).

### 26. [BoxWorld: Let World Engines Control and Video Generators Render](https://arxiv.org/abs/2610.36371) {#pd-26}

*Zike Wu et al. (7 authors, with Renjie Liao) · preprint · first submitted 26 Oct 2026 · [project](https://boxworld-web.github.io)*

- **What it does.** It builds real-time interactive video worlds with object behaviours defined by the user, by splitting the interaction logic from rendering.
- **How it works.** A coding agent writes a "Box World Engine" from the user's rules. The engine exposes object states as layout boxes, persistent attributes and status variables. A box-state generative renderer turns this state stream into video autoregressively. Training has three stages: grounding objects to boxes, learning state transitions from gameplay video, and distilling rollouts. The paper also releases PairedStateBench.
- **What is new.** Same week, same idea as Matrix-Game 4.0, but with an even lighter state: boxes instead of low-poly proxies. The authors report that it substantially outperforms end-to-end world models.
- **Connection to CG.** Layout boxes are the bounding volumes of a scene graph, and the generator acts as a learned renderer conditioned on them (see the figure above). Compare scene graphs and ECS in [anatomy of an engine]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}).

### 27. [SWIM: Learning What Matters from Behaviors for JEPA World Models](https://arxiv.org/abs/2610.36662) {#pd-27}

*Jiaming Hu et al. (14 authors) · preprint · first submitted 27 Oct 2026*

- **What it does.** When a JEPA world model is supervised with simulator state, SWIM learns how much each state feature should count, instead of weighting them uniformly.
- **How it works.** An inverse-dynamics model predicts the recorded action from the current state and the observed future displacement of each feature. Its learned weights define a weighted state metric, and latent distances are aligned with that metric. The inverse-dynamics model is needed only during training, so planning costs nothing extra.
- **What is new.** It replaces hand-picked or uniform state weights. The authors report consistent gains in planning success over uniform weighting on five simulated manipulation tasks.
- **Connection to CG.** It is about what a representation should *measure*: the features that actions actually change. This links the JEPA view of [JEPA, evaluation and open problems]({{ '/blog/2026/world-models-05-jepa-evaluation-and-open-problems/' | relative_url }}) to planning in [what is a world model]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}).

### 28. [L3G-World: Real-Time Infinite World Generation with Latent 3D Gaussian Memory](https://arxiv.org/abs/2610.40614) {#pd-28}

*Jinhyeok Choi et al. (8 authors, with Seungryong Kim) · preprint · first submitted 29 Oct 2026 · [project](https://cvlab-kaist.github.io/L3G-World/)*

- **What it does.** It is an interactive world model whose memory is a 3D Gaussian scene. The memory grows with the explored *space*, not with the length of the video stream.
- **How it works.** Feed-forward reconstruction builds a *latent 3D Gaussian memory*, in which every Gaussian stores a VAE latent feature instead of an RGB colour. The memory can therefore be splatted straight into the latent space of the video diffusion transformer (DiT), with no decoding to RGB and re-encoding. A memory updater spawns Gaussians in newly seen regions and refines existing ones, and it alternates autoregressively with the DiT.
- **What is new.** Context-window memory forgets old places, and explicit RGB 3D memory is slow to render and re-encode. The authors report up to 38.6x fewer primitives, 359x faster memory rendering and 9 FPS generation, each compared with the most efficient prior 3D-memory baseline.
- **Connection to CG.** The latent rendering is exactly 3DGS compositing with features in place of colours (figure). Revisiting a place means *rendering* the memory from the new camera, which is the consistency that Orbia (entry 22) measures. See [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) and [3D and 4D world generation]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }}).

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-latent-gaussian-memory.svg" caption="Latent Gaussian memory (L3G-World), as I read the paper. Each Gaussian $k$ stores a mean $\mu_k$, a covariance $\Sigma_k$, an opacity $\alpha_k$ and a latent feature vector $f_k$ (the coloured bars) instead of RGB. Splatting from the current camera composites $z(p)=\sum_k T_k\,\alpha_k G_k(p)\,f_k$ with transmittance $T_k=\prod_{l<k}(1-\alpha_l G_l(p))$, the 3DGS formula with features. The resulting latent map conditions the DiT, which predicts the next chunk. The updater then adds Gaussians for newly seen regions (dashed ellipses) and refines the old ones." %}

## 5. Embodied AI

Vision-language-action models, robot learning, humanoids, simulation and data. Graphics is everywhere this month. Three papers turn **casual captures into Gaussian-splat digital twins** and train robots inside them. One builds a ray-traced simulator that renders millions of frames per second, and one learns a differentiable world model for humanoid control. Background: [simulation platforms]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}) and [vision-language-action models]({{ '/blog/2026/embodied-ai-05-vision-language-action-models/' | relative_url }}).

### 29. [Splat2Act: From Captured Scenes to Personalized VLA Manipulation](https://arxiv.org/abs/2610.13945) {#pd-29}

*Xiaomeng Ye et al. (6 authors) · preprint · first submitted 9 Oct 2026 · [project](https://splat2act.github.io)*

- **What it does.** It is an automated real-to-sim-to-real pipeline that personalizes a pretrained VLA, π0.5, to a user's own scanned home or building.
- **How it works.** A handheld phone scan is reconstructed as a 3DGS digital twin. The pipeline finds receptacles, creates pickup tasks and generates demonstrations with a privileged simulation oracle. Fine-tuning has two stages: first on public object assets, then on the user's own objects in the target scene.
- **What is new.** Earlier real-to-sim work mostly reconstructs a single tabletop. This works at building scale and ends with a personalized policy. The authors report that π0.5 goes from 0% pickup success in the captured scenes to 62.5% after personalization, and reaches 63.9% on a real Stretch 3 robot on a 12-task subset, close to the 66.7% the same policy scores in simulation on those tasks. They generated more than 68,000 demonstrations in 101 scanned environments.
- **Connection to CG.** Rendering the splat twin from the robot's cameras *is* the simulator's camera model. Its realism decides the visual sim-to-real gap. See [capture to VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }}) for the capture side and [simulation platforms]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}) for the robot side.

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-real2sim2real.svg" localized="true" width="90%" caption="Splat2Act's real-to-sim-to-real loop, as I read the paper. A phone scan becomes a 3DGS twin; rendering the splats from the robot's own cameras is the simulator's camera model (blue arrow), so task generation and oracle demonstrations happen inside the captured scene. The VLA is fine-tuned in two stages and then runs on the real robot. Bottom: the pickup success rates the authors report for π0.5: in the captured scene before and after personalization, then on a 12-task subset both in simulation and on a real Stretch 3. Compare the last two bars, which measure the same tasks: 66.7% in the splat twin against 63.9% on the real robot. Success measured inside the twin predicts real success closely." %}

### 30. [Learning Adaptable Dexterous Skills via Hybrid Dexterous Mimicking](https://arxiv.org/abs/2610.28628) {#pd-30}

*Yuxuan Kuang et al. (8 authors) · preprint · first submitted 20 Oct 2026 · [project](https://yuxuank.com/AdaDex/)*

- **What it does.** AdaDex turns a single hand-object trajectory a few seconds long, from motion capture or reconstructed from video, into a dexterous robot skill that adapts to new object poses and goals.
- **How it works.** *Hybrid dexterous mimicking* trains one goal-conditioned RL policy in two kinds of parallel environments. Tracking environments give a dense imitation reward, which teaches human-like finger strategies. Generalization environments start from noised states and goals and give only a sparse reward for object success, which pushes the skill beyond the reference.
- **What is new.** Goal-reaching RL generalizes but moves the fingers unnaturally, and pure motion tracking cannot leave the reference. Mixing both in one policy gets both. The authors report sim-to-sim and real-world transfer.
- **Connection to CG.** It is the robotics version of physics-based character animation, which tracks a mocap clip with RL in the style of DeepMimic ([animation and characters]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})). See RL in [reinforcement learning for robots]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }}).

### 31. [SuperMimic: Scaling Humanoid Whole-Body Control with One Differentiable World Model](https://arxiv.org/abs/2610.28480) {#pd-31}

*Qiayuan Liao et al. (7 authors) · CoRL 2026, oral (accepted) · first submitted 20 Oct 2026 · [project](https://supermimic.github.io)*

- **What it does.** It trains one humanoid motion-tracking policy on more than 129,000 human motions with a small fraction of the usual compute.
- **How it works.** A single differentiable world model is fitted to transitions logged from a standard rigid-body simulator and shared across all motions. It is trained jointly with the tracking policy. The policy then gets *analytic* gradients by backpropagating through time over short imagined rollouts, instead of relying on model-free RL alone.
- **What is new.** The baseline is a state-of-the-art model-free tracker trained on 128 GPUs. The authors report that SuperMimic exceeds its return after 3 hours on one GPU, more than 1000x fewer GPU-hours, with 25 failures out of 129,514 motions against 179 for the baseline.
- **Connection to CG.** A learned, differentiable surrogate of a physics engine is the same idea as Dreamer's imagination ([what is a world model]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})), here used on character physics ([physically based simulation]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}), [animation and characters]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})).

### 32. [HyperDrone: Simulation-to-Reality Transfer at Millions of Frames per Second](https://arxiv.org/abs/2610.28950) {#pd-32}

*Jonas Eschmann et al. (2 authors) · CoRL 2026 (accepted) · first submitted 20 Oct 2026*

- **What it does.** It is a GPU-resident, batched quadrotor simulator with a built-in ray-tracing renderer, fast enough to train vision-based policies from pixels.
- **How it works.** The HyperLux renderer runs on OptiX, Vulkan, Metal and WebGPU. It outputs RGB, depth, segmentation, normals and optical flow, and its fidelity is adjustable: reflections, motion blur and PBR materials can be switched on. It is paired with optimized multirotor dynamics. A vision-based yaw-control policy trained purely in simulation ran on a real Crazyflie drone.
- **What is new.** Existing batched quadrotor simulators do not have physically based ray-traced rendering at this throughput. The authors report more than 20x speedup over state-of-the-art batched quadrotor simulators, at millions of frames per second on consumer GPUs.
- **Connection to CG.** This is a renderer designed for *learning*, not for looking good: many tiny frames, arbitrary output channels such as a G-buffer, and fidelity chosen per experiment. See [real-time ray tracing]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}), [GPU APIs]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}) and [physics and simulation engines]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }}).

### 33. [Real2Sem2Real: 3D Semantic Augmentations for Robot Learning from a Single Human RGB Demonstration](https://arxiv.org/abs/2610.28880) {#pd-33}

*Matthew Strong et al. (6 authors) · preprint · first submitted 20 Oct 2026 · [project](https://real2sem2real.github.io/)*

- **What it does.** It turns one monocular RGB video of a person doing a task into thousands of robot demonstrations that cover a whole object category.
- **How it works.** Object 6-DoF poses are tracked with Gaussian splats into which DINOv3 features have been distilled. Generated "digital cousins", similar objects of the same category, are aligned to the demonstrated objects, including their functional parts. Human hand motion is mapped to feasible robot grasps, and the data is rendered in IsaacSim or simulated in MuJoCo.
- **What is new.** Earlier pipelines need depth sensors, paste the robot over 2D video, or cover only the demonstrated object. The authors report more than 2,000 episodes in about two hours. VLAs trained on one human video per task matched or beat teleoperation-trained policies on two real robots and four tasks.
- **Connection to CG.** Feature-carrying Gaussians (as in entries 21 and 28) are used here for pose tracking. Part-aligned digital cousins are a [geometry processing]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) problem: correspondence between shapes. See also [imitation learning]({{ '/blog/2026/embodied-ai-04-imitation-learning/' | relative_url }}).

### 34. [Zero-HLM: Generalizable Humanoid Loco-Manipulation without Real Robot Data](https://arxiv.org/abs/2610.35075) {#pd-34}

*Dianyi Yang et al. (12 authors) · preprint · first submitted 26 Oct 2026 · [project](https://young-bit.github.io/zero-hlm/)*

- **What it does.** It trains humanoid loco-manipulation policies only from smartphone captures plus simulated demonstrations, and transfers them zero-shot to a Unitree G1.
- **How it works.** *Gaussian-guided agentic scene reconstruction* aligns the visual scene (splats) with the physical scene (collision geometry). Rollout feedback then refines whole-body motions and contact geometry, which yields 4,800 physically validated demonstrations. A GR00T N1.7 policy is trained only on this data.
- **What is new.** It needs no real robot data. The authors report 66.7% mean full-task success for the simulation-only policy, against 46.7% for a policy trained on real robot data.
- **Connection to CG.** The hard part is keeping *two* representations of one scene consistent: a radiance representation for cameras and a collision representation for physics. This is the same problem a game engine solves with separate render meshes and collision meshes ([physics and simulation engines]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})).

### 35. [TAPESTRY: A Single Backbone for Video Generation and Robot Control](https://arxiv.org/abs/2610.36823) {#pd-35}

*Jeremy A. Collins et al. (7 authors) · CoRL 2026 (accepted) · first submitted 27 Oct 2026 · [project](https://tapestry-wam.github.io)*

- **What it does.** It turns a pretrained video diffusion transformer into a robot policy that does **not** generate video at inference time.
- **How it works.** Each action timestep is linearly projected to the size of a VAE patch and processed as a one-patch token by the same backbone that models video. Training mixes three diffusion objectives: video only (on robot and human video), video plus action (on demonstrations), and action only, conditioned on clean image latents. At test time a single DDIM step produces an action chunk.
- **What is new.** "World-action models" denoise future frames at test time to plan, which is slow. TAPESTRY keeps the video prior but skips the video. The authors report 84 ms per action chunk on consumer hardware.
- **Connection to CG.** It treats actions as just another "pixel" of the video latent, an extreme form of the shared representation behind VLA models ([vision-language-action models]({{ '/blog/2026/embodied-ai-05-vision-language-action-models/' | relative_url }})) and video world models ([video world simulators]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})).

## 6. HCI / XR / AR / VR

Interaction techniques, displays, avatars, egocentric perception and human-AI interaction. Two threads stand out: **Gaussian splats as XR content** (SplatXR, DomeGS) and **perceptual objectives** for displays (HoOPOE, together with the judder masking of entry 11). Background: [capture to VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }}) and [embodied AI meets XR and HCI]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }}).

### 36. [HoOPOE: A Holography-Optimized Perceptual ObjectivE function](https://arxiv.org/abs/2610.17474) {#pd-36}

*Ethan Chen et al. (9 authors) · SIGGRAPH Asia 2026 (to appear) · first submitted 12 Oct 2026*

- **What it does.** It is a perceptual loss function for computer-generated holography (CGH), built so that optimized holograms show less *visible* speckle.
- **How it works.** CGH optimizes the phase pattern of a spatial light modulator so that the propagated light field matches target images, here focal stacks rendered from meshes. HoOPOE replaces the pixel loss with a model of human sensitivity to spatio-temporal frequency and colour, with parameters tuned for use as a CGH objective.
- **What is new.** Generic image losses such as MSE, SSIM or LPIPS treat all errors alike, but speckle is visible only in certain frequency bands. In the authors' user study, participants preferred HoOPOE holograms about 68% of the time over those from the next-best objective.
- **Connection to CG.** Holographic near-eye displays are a candidate for AR glasses that show true depth. The pipeline is a differentiable wave-optics renderer optimized end to end ([differentiable rendering]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})), and the loss is a perceptual metric of the kind discussed in [embodied AI meets XR and HCI]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }}).

### 37. [FlowAvatar: Real-Time Full-Body Avatars from Sparse Egocentric Inputs on Consumer XR Devices](https://arxiv.org/abs/2610.16277) {#pd-37}

*Chenfeng Gao et al. (7 authors) · IEEE ISMAR 2026 (accepted) · first submitted 12 Oct 2026 · [code](https://github.com/SPICExLAB/FlowAvatar)*

- **What it does.** It is a real-time, personalized full-body avatar that runs on a standalone headset (Meta Quest Pro).
- **How it works.** It fuses the sparse signals a headset provides (head and hand poses, hand articulation, facial expression and eye gaze) into a full-body pose. Losses designed for spatial and temporal consistency keep the pose stable. The pose then drives a personalized look-alike avatar.
- **What is new.** The authors report state-of-the-art temporal consistency and competitive accuracy on AMASS compared with earlier sparse-input pose estimators. Two small user studies (N=12 and N=10) find that a positive sense of embodiment needed both complete tracking and personalized appearance.
- **Connection to CG.** Inferring a full skeleton from a few trackers is an inverse kinematics problem with learned priors ([animation and characters]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})). Avatar embodiment is the HCI question of [embodied AI meets XR and HCI]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }}).

### 38. [SplatXR: A Toolkit for Multi-Layered Extended Reality via On-Headset 3D Gaussian Splatting](https://arxiv.org/abs/2610.26338) {#pd-38}

*Cyrus Vachha et al. (3 authors) · UIST 2026 (accepted) · first submitted 19 Oct 2026 · [project](https://splatxr.github.io)*

- **What it does.** It is a Unity toolkit that makes Gaussian splats first-class XR content: captured objects can cast shadows, collide and blend with virtual ones on a headset.
- **How it works.** It has five components: a standalone splat renderer, splat-to-mesh reconstruction, splat physics, splat blending, and offloaded on-headset capture and reconstruction of objects. The meshes give splats the explicit surfaces they lack, so shadows and collisions work.
- **What is new.** XR pipelines are built around polygons and keep physical and digital content separate. SplatXR puts reconstruction from 3D foundation models directly into the XR interaction loop. It is validated with demo applications and a small developer study.
- **Connection to CG.** It is the engineering answer to "splats have no surfaces": derive a proxy mesh for physics and shadows, and keep the splats for appearance, as in Zero-HLM (entry 34). See [capture to VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }}) and [geometry processing]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}).

### 39. [V-JEPA Hand: Simple, Accurate and Fast 3D Hand and Camera Trajectory Recovery from Egocentric Videos](https://arxiv.org/abs/2610.26780) {#pd-39}

*Ruicheng Li et al. (6 authors) · preprint · first submitted 19 Oct 2026 · [project](https://qft-333.github.io/V-JEPA-Hand-Page/)*

- **What it does.** One feed-forward model recovers the 3D motion of both hands *and* the camera's own motion in a world frame from egocentric video.
- **How it works.** A self-supervised V-JEPA 2.1 video encoder feeds a query-based predictor that outputs per-frame hand poses, hand presence and camera motion. The camera motion places the hands in a common world frame. Training mixes pseudo-labelled videos with high-precision 3D annotations.
- **What is new.** It replaces multi-stage pipelines (detect, reconstruct the hands, run SLAM for the camera) with a single network. The authors report better results than the compared baselines on ARCTIC, HOT3D and EgoStandard, at 93.4 FPS on one RTX A6000.
- **Connection to CG.** Separating hand motion from head motion is the camera-versus-object motion problem of [cameras and multi-view geometry]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}). It is also a practical use of a JEPA encoder ([JEPA]({{ '/blog/2026/world-models-05-jepa-evaluation-and-open-problems/' | relative_url }})), and egocentric hand tracking is the input layer of XR interaction.

### 40. [Bringing physics-based controller policies to virtual reality](https://arxiv.org/abs/2610.26278) {#pd-40}

*Joan Llobera et al. (5 authors) · preprint · first submitted 19 Oct 2026*

- **What it does.** It brings physics-based character controllers into runtimes that run in VR (Unity3D and WebXR).
- **How it works.** DeepMimic, AMP and ADD are re-implemented in JAX and trained in MuJoCo-MJX on the GPU. The policies are exported to Unity3D and compiled for several platforms, including Android headsets. The paper also proposes an *animation fidelity index* to compare controllers.
- **What is new.** It is a practical pipeline rather than a new algorithm. The authors report about 50x faster training than a traditional CPU setup, and find that DeepMimic and ADD trained in MJX give the best fidelity among the methods compared.
- **Connection to CG.** Physics-based characters ([animation and characters]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})) need a physics engine at run time. Bridging MuJoCo training and engine deployment is the theme of [physics and simulation engines]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }}).

### 41. [GenXR-Bench: Benchmarking Coding Agents for Interactive XR Development](https://arxiv.org/abs/2610.29014) {#pd-41}

*William Huang et al. (16 authors) · preprint · first submitted 21 Oct 2026 · [code](https://github.com/whuang37/genxr-bench)*

- **What it does.** It is a benchmark of 112 tasks for coding agents that build XR applications: 24 feature tasks, 21 bug fixes and 67 whole-app generation tasks.
- **How it works.** Held-out tests combine scripted and adaptive interactions with programmatic and visual assertions. The test suite was validated against blinded expert judgments of the apps running on consumer XR hardware.
- **What is new.** The authors call it the first end-to-end benchmark of coding agents for XR development. They report that the best of ten models reaches only 50.9% Pass@1, with failures clustering around asynchronous sensor lifecycles, physical grounding and embodied interaction.
- **Connection to CG.** It measures how well LLM agents handle engine concepts such as frame loops, scene graphs and spatial input. These are the "LLM agents in editors" of [AI meets graphics engines]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }}), and the coding agents inside Matrix-Game 4.0 and BoxWorld (entries 23 and 26) face the same tasks.

### 42. [DomeGS: Perceptually Consistent Background Completion for Unbounded 3D Gaussian Splatting in Virtual Reality](https://arxiv.org/abs/2610.37172) {#pd-42}

*Anastasiya Pechko et al. (7 authors) · preprint · first submitted 27 Oct 2026*

- **What it does.** It completes the missing horizon and sky of unbounded outdoor 3DGS scenes, so that they feel whole and comfortable in VR.
- **How it works.** Instead of placing the reconstruction inside a separate skybox or skydome, it makes the background part of the 3DGS reconstruction itself, so foreground and background form one consistent environment.
- **What is new.** It addresses the poor blending between a skybox and reconstructed geometry. The authors report a 36-participant study with significantly higher presence and realism than with a skybox (p = 0.042 for each).
- **Connection to CG.** Skyboxes are the classic environment-map trick for "infinitely far" content ([shading and textures]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})). Unbounded scene parameterization is a known 3DGS problem ([3DGS frontiers]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})), and DomeGS evaluates it as a question of presence, as in [capture to VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }}).

## Trends this month

The matrix below shows, for every entry, which part of computer graphics it uses or changes. Read it column by column: **rendering** (24 of 42) and **representation** (21) dominate, and simulation (18) is close behind, because robotics and world models now rely on it as much as graphics does.

{% include blog_figure.liquid path="assets/img/blog/paper-digest/01-cg-matrix.svg" width="80%" caption="Relation to computer graphics. Rows are the 42 entries, coloured by category and labelled with entry number and short name. Columns are representation, rendering, geometry, simulation, animation and interaction. A large dot means the paper uses or changes that part of CG; the numbers at the bottom are column totals. Note the blocks: engine papers (orange) sit almost entirely in rendering and representation, embodied-AI papers (red) in representation and simulation, and XR papers (cyan) spread over every column." %}

**1. The engine is back, with a generator on top.** Matrix-Game 4.0 (23) and BoxWorld (26), both from the week of 20 October, make the same architectural choice independently: an explicit engine owns the state and the rules, and a video model only renders it. L3G-World (28) makes the same choice for memory: an explicit 3D Gaussian store instead of a long context window. Orbia (22) explains why: end-to-end models drift when the camera revisits a place. For graphics people this is good news. Proxy geometry, G-buffers, scene graphs and render-to-latent are graphics concepts, and [AI meets graphics engines]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }}) becomes a design manual for world models.

**2. Gaussians as a common currency.** In this one month, Gaussians are XR content (SplatXR, DomeGS), robot training worlds (Splat2Act, Zero-HLM, Real2Sem2Real), world-model memory (L3G-World), carriers of semantics (LucidLyra), multi-modal volumes (X-Splat), switchable objects (SwitchSplat) and the target of new hardware and stochastic renderers (H2-Ray, SteadySplats). The open engineering problem is the one SplatXR and Zero-HLM both solve with proxies: splats have appearance but no surfaces, so physics and shadows need a second representation.

**3. Feed-forward replaces per-scene optimization, even for light transport.** RADIANT (19) predicts global illumination, FL4N (20) and LucidLyra (21) predict scenes, PhysSkin++ (4) predicts simulation subspaces, and V-JEPA Hand (39) predicts hand and camera trajectories, each in one forward pass. Where the physics is known, the best designs build it into the architecture: RADIANT's attention mirrors radiosity form factors, and Neuroll (3) is trained with the simulator in the loop.

**4. Differentiable physics scales up.** DiffGIPC (2) makes contact-rich IPC simulations differentiable at GPU speed, and SuperMimic (31) learns a differentiable surrogate of a rigid-body simulator to train humanoid control across 129k motions. Inverse problems that were offline research are becoming training loops.

**5. Perception as the objective.** HoOPOE (36) optimizes holograms for what the eye sees, judder masking (11) for what moving eyes perceive in foveated displays, Tabula Rasa (1) controls how noise looks over time, and DomeGS (42) is evaluated by presence, not PSNR. In XR, the metric is the observer.

**What to watch next.**

- The SIGGRAPH Asia 2026 conference, where several papers in this issue will be presented, and its full paper list.
- Whether engine-plus-generator world models release code that others can build on. Matrix-Game 4.0 says code and models are available.
- Benchmarks that close the loop: Orbia-style 3D consistency for world models and GenXR-Bench-style tests for agents that build interactive 3D content.
- Real-to-sim pipelines moving from tabletops to buildings, and from manipulation to humanoids.

## All entries at a glance

| # | Category | Paper | Status | First submitted | Link |
| --- | --- | --- | --- | --- | --- |
| 1 | Graphics | Tabula Rasa | SIGGRAPH Asia 2026 | 2026-10-08 | [arXiv](https://arxiv.org/abs/2610.11653) |
| 2 | Graphics | DiffGIPC | preprint | 2026-10-13 | [arXiv](https://arxiv.org/abs/2610.19091) |
| 3 | Graphics | Neuroll | preprint | 2026-10-03 | [arXiv](https://arxiv.org/abs/2610.04689) |
| 4 | Graphics | PhysSkin++ | preprint | 2026-10-19 | [arXiv](https://arxiv.org/abs/2610.26067) |
| 5 | Graphics | Total Deformation-based MPM | preprint | 2026-10-27 | [arXiv](https://arxiv.org/abs/2610.36945) |
| 6 | Graphics | Walk on Multiscale Media | preprint | 2026-10-24 | [arXiv](https://arxiv.org/abs/2610.35952) |
| 7 | Graphics | Dynamic Skinning | IEEE TVCG 2026 | 2026-10-29 | [arXiv](https://arxiv.org/abs/2610.40976) |
| 8 | Engines | Windfoil | preprint | 2026-10-01 | [arXiv](https://arxiv.org/abs/2610.02468) |
| 9 | Engines | SteadySplats | preprint | 2026-10-04 | [arXiv](https://arxiv.org/abs/2610.05576) |
| 10 | Engines | Pre-integrated Neural Emitters (NEF) | preprint | 2026-10-05 | [arXiv](https://arxiv.org/abs/2610.06762) |
| 11 | Engines | Masking Judder in Foveated Rendering | preprint | 2026-10-07 | [arXiv](https://arxiv.org/abs/2610.10811) |
| 12 | Engines | Neural Caching of Prefiltered Radiance | preprint | 2026-10-08 | [arXiv](https://arxiv.org/abs/2610.11702) |
| 13 | Engines | H2-Ray | preprint | 2026-10-09 | [arXiv](https://arxiv.org/abs/2610.13498) |
| 14 | Engines | Tessellation-Free Displaced Surfaces | preprint | 2026-10-15 | [arXiv](https://arxiv.org/abs/2610.21584) |
| 15 | Neural rendering | X-Splat | SIGGRAPH Asia 2026 | 2026-10-16 | [arXiv](https://arxiv.org/abs/2610.23237) |
| 16 | Neural rendering | SwitchSplat | SIGGRAPH Asia 2026 | 2026-10-17 | [arXiv](https://arxiv.org/abs/2610.24812) |
| 17 | Neural rendering | Holo4D | NeurIPS 2026 | 2026-10-18 | [arXiv](https://arxiv.org/abs/2610.25276) |
| 18 | Neural rendering | RealMe | SIGGRAPH Asia 2026 | 2026-10-21 | [arXiv](https://arxiv.org/abs/2610.30023) |
| 19 | Neural rendering | RADIANT | preprint | 2026-10-23 | [arXiv](https://arxiv.org/abs/2610.32075) |
| 20 | Neural rendering | FL4N | preprint | 2026-10-26 | [arXiv](https://arxiv.org/abs/2610.35854) |
| 21 | Neural rendering | LucidLyra | preprint | 2026-10-29 | [arXiv](https://arxiv.org/abs/2610.40495) |
| 22 | World models | Orbia | technical report | 2026-10-14 | [arXiv](https://arxiv.org/abs/2610.20693) |
| 23 | World models | Matrix-Game 4.0 | preprint | 2026-10-20 | [arXiv](https://arxiv.org/abs/2610.27999) |
| 24 | World models | CADRE (video autoencoders) | preprint | 2026-10-21 | [arXiv](https://arxiv.org/abs/2610.30129) |
| 25 | World models | World-in-Context | preprint | 2026-10-23 | [arXiv](https://arxiv.org/abs/2610.33169) |
| 26 | World models | BoxWorld | preprint | 2026-10-26 | [arXiv](https://arxiv.org/abs/2610.36371) |
| 27 | World models | SWIM | preprint | 2026-10-27 | [arXiv](https://arxiv.org/abs/2610.36662) |
| 28 | World models | L3G-World | preprint | 2026-10-29 | [arXiv](https://arxiv.org/abs/2610.40614) |
| 29 | Embodied AI | Splat2Act | preprint | 2026-10-09 | [arXiv](https://arxiv.org/abs/2610.13945) |
| 30 | Embodied AI | AdaDex | preprint | 2026-10-20 | [arXiv](https://arxiv.org/abs/2610.28628) |
| 31 | Embodied AI | SuperMimic | CoRL 2026 (oral) | 2026-10-20 | [arXiv](https://arxiv.org/abs/2610.28480) |
| 32 | Embodied AI | HyperDrone | CoRL 2026 | 2026-10-20 | [arXiv](https://arxiv.org/abs/2610.28950) |
| 33 | Embodied AI | Real2Sem2Real | preprint | 2026-10-20 | [arXiv](https://arxiv.org/abs/2610.28880) |
| 34 | Embodied AI | Zero-HLM | preprint | 2026-10-26 | [arXiv](https://arxiv.org/abs/2610.35075) |
| 35 | Embodied AI | TAPESTRY | CoRL 2026 | 2026-10-27 | [arXiv](https://arxiv.org/abs/2610.36823) |
| 36 | HCI / XR | HoOPOE | SIGGRAPH Asia 2026 | 2026-10-12 | [arXiv](https://arxiv.org/abs/2610.17474) |
| 37 | HCI / XR | FlowAvatar | IEEE ISMAR 2026 | 2026-10-12 | [arXiv](https://arxiv.org/abs/2610.16277) |
| 38 | HCI / XR | SplatXR | UIST 2026 | 2026-10-19 | [arXiv](https://arxiv.org/abs/2610.26338) |
| 39 | HCI / XR | V-JEPA Hand | preprint | 2026-10-19 | [arXiv](https://arxiv.org/abs/2610.26780) |
| 40 | HCI / XR | Physics-based controllers in VR | preprint | 2026-10-19 | [arXiv](https://arxiv.org/abs/2610.26278) |
| 41 | HCI / XR | GenXR-Bench | preprint | 2026-10-21 | [arXiv](https://arxiv.org/abs/2610.29014) |
| 42 | HCI / XR | DomeGS | preprint | 2026-10-27 | [arXiv](https://arxiv.org/abs/2610.37172) |

## Representative papers

This issue's entries build on a small set of earlier works. If you read only a few background papers, read these.

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al.) | SIGGRAPH / ACM TOG 42(4) | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) | The representation behind more than a third of this issue |
| Real-time Neural Radiance Caching for Path Tracing (Müller et al.) | SIGGRAPH / ACM TOG | 2021 | [arXiv](https://arxiv.org/abs/2106.12372) | The baseline that entry 12 extends to specular lighting |
| RenderFormer: Transformer-based Neural Rendering of Triangle Meshes with Global Illumination (Zeng et al.) | SIGGRAPH | 2025 | [arXiv](https://arxiv.org/abs/2505.21925) | The per-triangle neural GI renderer that RADIANT (19) scales up |
| Incremental Potential Contact (Li et al.) | SIGGRAPH / ACM TOG 39(4) | 2020 | (no verified link) | The intersection-free contact model that DiffGIPC (2) differentiates |
| DeepMimic: Example-Guided Deep Reinforcement Learning of Physics-Based Character Skills (Peng et al.) | SIGGRAPH / ACM TOG | 2018 | [arXiv](https://arxiv.org/abs/1804.02717) | Motion tracking with RL, behind entries 30, 31 and 40 |
| Genie: Generative Interactive Environments (Bruce et al.) | ICML | 2024 | [arXiv](https://arxiv.org/abs/2402.15391) | The end-to-end playable world model that entries 23 and 26 move away from |
| Navigation World Models (Bar et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2412.03572) | Camera-controlled video prediction for planning |
| V-JEPA 2: Self-Supervised Video Models Enable Understanding, Prediction and Planning (Assran et al.) | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2506.09985) | The JEPA line behind entries 27 and 39 |
| VGGT: Visual Geometry Grounded Transformer (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2503.11651) | The feed-forward 3D reconstruction trend behind entries 20, 21 and 28 |
| π0: A Vision-Language-Action Flow Model for General Robot Control (Black et al.) | RSS | 2025 | [arXiv](https://arxiv.org/abs/2410.24164) | The VLA family that Splat2Act (29) personalizes |

## Learning resources

- **Finding papers yourself.** arXiv "new" listings for [cs.GR](https://arxiv.org/list/cs.GR/new), [cs.CV](https://arxiv.org/list/cs.CV/new), [cs.RO](https://arxiv.org/list/cs.RO/new) and [cs.HC](https://arxiv.org/list/cs.HC/new); the [arXiv API](https://info.arxiv.org/help/api/index.html) for date-restricted queries (the exercise below uses it); Ke-Sen Huang's [conference paper lists](https://kesen.realtimerendering.com/) for SIGGRAPH, SIGGRAPH Asia, EG, HPG and EGSR.
- **Reading a paper quickly.** Read the abstract, then the teaser figure, then the method overview figure, then the limitations. The "what / how / new / connection" structure of this digest is a template you can use for your own notes.
- **Background on this blog.** The chapters linked from each entry. The figure scripts for this issue (`bin/figures/paper-digest/`) and the data file `data/01-papers.json` are in the site repository.

## Exercises

1. **Form factors.** Using the `form_factor` function from entry 19, place patch $j$ at $(0, y, 2)$ but tilt its normal toward the origin, $n_j = -(0,y,2)/\lVert(0,y,2)\rVert$. How does $F_{i\to j}(y)$ now fall off with $y$? Plot both curves.
   <details markdown="1"><summary>Hint</summary>
   Now $\cos\theta_j = 1$, so only one cosine shrinks, as $2/r$. The fall-off becomes $2A_j/(\pi r^3)$ instead of $4A_j/(\pi r^4)$, which is slower.
   </details>
2. **Features instead of colours.** Take the 3DGS compositing formula $C(p)=\sum_k T_k\,\alpha_k G_k(p)\,c_k$ and replace $c_k\in\mathbb{R}^3$ by $f_k\in\mathbb{R}^{16}$. What changes in the rasterizer's memory traffic and in the backward pass? Which entries of this issue rely on this trick?
   <details markdown="1"><summary>Hint</summary>
   Only the per-Gaussian payload and the accumulation buffer grow, from 3 to 16 channels; sorting, tiling and the transmittance $T_k$ are unchanged. The gradient with respect to $f_k$ is $T_k\alpha_k G_k(p)$ times the upstream gradient, exactly as for colour. Entries 21, 28 and 33 use this trick.
   </details>
3. **Engine or generator?** For a simple game such as Pong, list which parts of the state you would keep in an explicit engine and which you would leave to a video generator, following Matrix-Game 4.0 and BoxWorld. What would an Orbia-style revisit test reveal for an end-to-end model?
   <details markdown="1"><summary>Hint</summary>
   Keep the ball and paddle positions, the score and the collision rules in the engine, because they must be exact and persistent. Leave textures, lighting and particle effects to the generator. An end-to-end model may "forget" the score or the court layout when the camera returns.
   </details>
4. **Stochastic transparency.** Three Gaussians lie along a ray with opacities $0.5, 0.4, 0.6$ and colours $1, 0, 1$ (grey levels), front to back. Compute the alpha-blended colour. Then show that keeping each Gaussian with probability $\alpha_k$ and taking the nearest kept one (black if none is kept) has the same expected value.
   <details markdown="1"><summary>Hint</summary>
   Blended: $0.5\cdot1 + 0.5\cdot0.4\cdot0 + 0.5\cdot0.6\cdot0.6\cdot1 = 0.5 + 0.18 = 0.68$. In the stochastic version the probability that Gaussian $k$ is the nearest kept one is $\alpha_k\prod_{l<k}(1-\alpha_l)$, which is exactly its blending weight $T_k\alpha_k$, so the expectations match. SteadySplats (entry 9) attacks the variance of this estimator.
   </details>
5. **Make your own digest entry.** Use the arXiv API, for example `http://export.arxiv.org/api/query?search_query=cat:cs.GR+AND+submittedDate:[202611010000+TO+202611302359]`, to find one November 2026 paper, and write the four parts (what, how, new, connection to CG) in at most 150 words.

The next issue will cover November to December 2026.
