# Assignment gfx-a: graphics chapters 08 and 09

Write two new chapters of the series "Computer Graphics from Scratch" (series key `graphics`, existing
chapters 01-07). Both build on chapters 01-07 and must link back to them. Do not repeat what they already
explain; build on it.

- Chapter 08: `2026-10-27-graphics-08-geometry-processing.md`, date `2026-10-27 09:08:00+0900`, series_order 8.
- Chapter 09: `2026-10-27-graphics-09-animation-and-characters.md`, date `2026-10-27 09:09:00+0900`, series_order 9.
- Figure scripts: `bin/figures/graphics/graphics_08.py` and `graphics_09.py`. The existing `make_all.py`
  picks them up.
- SVGs go in `assets/img/blog/graphics/08-*.svg` and `09-*.svg`.
- Reading list: append a section "Chapters 08-09" to `docs/reading-lists/graphics.md`.

## Chapter 08: Geometry processing

Why it matters: meshes are the common language of graphics, scanning, CAD, games and 3D generation. Link
`neural-rendering-05` (surfaces from Gaussians) and `graphics-02`.

Suggested sections (adapt freely):
1. Representations: polygon soup, indexed meshes, manifoldness, Euler characteristic, point clouds, implicit
   functions and SDFs, voxels, parametric surfaces.
2. The half-edge data structure: build it from a face list in Python, then traverse one-rings and boundaries.
3. Discrete differential geometry:
   - vertex normals (area- and angle-weighted);
   - the cotangent Laplacian and the mean-curvature normal;
   - Gaussian curvature from the angle defect (Gauss-Bonnet check in code).
4. Smoothing and fairing: uniform vs cotan Laplacian smoothing, shrinkage, Taubin lambda|mu, implicit
   fairing.
5. Subdivision: Loop and Catmull-Clark rules, limit surfaces, and where subdivision is used (film, CAD).
6. Simplification: edge collapse with quadric error metrics (QEM). Include a small working implementation,
   or a clear partial one.
7. Parameterization: Tutte embedding, plus an overview of LSCM and ARAP. Show distortion.
8. Implicit surfaces: SDF operations, marching squares and cubes (code), dual contouring, sphere tracing
   (link `graphics-05`).
9. Reconstruction from points: normal estimation, Poisson and screened Poisson reconstruction, neural
   implicit surfaces (NeuS and successors, linking the neural-rendering series).
10. Tools: libigl, CGAL, OpenMesh, PyMeshLab, trimesh, Open3D, Blender scripting.

Representative papers to verify, then add recent 2024-2026 work you find:
- Catmull & Clark 1978; Loop 1987.
- Lorensen & Cline 1987; Taubin 1995.
- Garland & Heckbert 1997; Desbrun et al. 1999.
- Lévy et al. 2002 (LSCM); Ju et al. 2002 (dual contouring); Meyer et al. 2003.
- Kazhdan et al. 2006 and 2013; Sorkine & Alexa 2007; Liu et al. 2008 (ARAP parameterization).
- Wang et al. 2021 (NeuS).
- Books: Botsch et al., "Polygon Mesh Processing" (2010); Crane's discrete differential geometry course.

Figures (computed): use 8-11 of these or better ones.
- A half-edge diagram drawn from your data structure.
- Cotan weights shown on a one-ring.
- A curvature heat map on a procedural surface, such as a torus or a bumpy sphere.
- Smoothing iterations: shrinkage versus Taubin.
- Loop subdivision levels.
- QEM simplification at several face counts.
- A Tutte parameterization of a disk-topology patch.
- Marching squares on a 2D SDF, plus a 3D marching-cubes isosurface.
- Poisson reconstruction in 2D.

Widget: `graphics-subdivision`. The reader drags the control points of a closed 2D control polygon and
watches Chaikin, 4-point and B-spline subdivision refine it level by level, with a level slider.

## Chapter 09: Animation and characters

Why it matters: motion for games, film and VR avatars, and the same mathematics drives humanoid robots
(link `embodied-ai-01`, `embodied-ai-02` and `embodied-ai-06`).

Suggested sections:
1. Keyframes and splines: linear, Hermite, Bézier, Catmull-Rom, uniform cubic B-spline; continuity (C1 vs G1);
   arc-length reparameterization (code).
2. Rotations over time: slerp vs nlerp, squad, the exponential map and angular velocity. Build on
   `graphics-01`; do not repeat its slerp figure. Show squad and the C1 problem instead.
3. Skeletons and forward kinematics: joint hierarchies, bind pose, local to global transforms (code).
4. Skinning: linear blend skinning (equation and code), the candy-wrapper artifact, dual quaternion
   skinning, corrective blend shapes. Other techniques only briefly.
5. Blend shapes and faces: FACS, the ARKit-style blendshape set, rigs; MetaHuman as a production example.
6. Character IK: analytic two-bone IK, CCD, FABRIK, full-body IK. Link `embodied-ai-01` for Jacobian and
   DLS IK; do not re-derive them.
7. Motion capture and retargeting: optical, IMU and markerless capture; the SMPL body model; retargeting
   across skeletons.
8. Data-driven animation: motion graphs, motion matching (Clavet's GDC 2016 talk; learned motion matching,
   Holden et al. 2020), PFNN (Holden et al. 2017).
9. Physics-based characters with RL: DeepMimic (2018), AMP (2021), ASE (2022), PHC, MaskedMimic (2024). Then
   the bridge to humanoid robots, with a 2025-2026 update based on your own research.
10. Generative motion: MDM (ICLR 2023) and successors, text-to-motion; 2025-2026 state of the art (research
   it).

Figures (computed): 8-11, for example:
- The spline family through the same control points.
- Arc-length versus uniform parameterization.
- Squad versus piecewise slerp on the sphere (3D).
- A 3D skeleton FK chain with local frames.
- LBS versus DQS on a twisting cylinder (compute both, show the volume loss).
- Blendshape interpolation on a simple 2D face.
- CCD versus FABRIK iterations on the same chain.
- A motion-matching feature space and its cost, as a toy.
- A tracking-error plot from a toy PD-tracked pendulum chain.

Widget: `graphics-skinning`. A 2D two-bone limb or twisted ribbon with a joint-angle or twist slider,
toggling LBS against DQS, with the volume or width loss shown live.

Order: write, verify and commit chapter 08 completely before starting chapter 09.
