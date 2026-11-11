# Plan (November 2026): "3D Vision Fundamentals" series and new Interactive Lab demos

Read this file before starting any task from this plan, together with `CLAUDE.md` and
`docs/BLOG_GUIDE.md`. The guide's sections 2-6, 10 and 11 are binding.

## Purpose

These posts are a from-scratch learning path, and the owner will study from them personally.
Content quality comes first: depth, clarity, correctness, visualization and interactivity.

- Write for a motivated learner who is new to the topic. Assume linear algebra, calculus, Python and
  basic ML.
- Define every symbol before you use it.
- Build each idea in this order:
  1. intuition, with a picture;
  2. the formula, derived step by step;
  3. a small worked numeric example;
  4. runnable code that reproduces it;
  5. a figure or widget showing the result in space.
- Pair every important formula with a computed figure: axes, 3D geometry, before/after, step-by-step
  processes, real toy runs.
- Use 7-11 static figures per post, from NumPy/matplotlib.
- Add at least one interactive widget per post (the one named below), and a second where another idea
  clearly benefits from manipulation. Widgets need short instructions in all three languages, sensible
  defaults and touch support.
- End with Representative papers (verified links), Learning resources, and Exercises with brief hints in
  `<details markdown="1"><summary>Hint</summary> ... </details>` (localize the summary).

## Series `3d-vision` ("3D Vision Fundamentals")

The series sits between `graphics` and `neural-rendering` in the roadmap. Graphics goes from a scene to an
image; 3D vision goes back, from images to geometry. Everything later builds on it: NeRF/3DGS, SLAM,
world models, embodied AI.

- Front matter:
  - `categories: 3d-vision`, `series: 3d-vision`, `series_order: N`;
  - date `2026-10-27 11:NN:00+0900`, where NN is the post number;
  - `toc.sidebar: left`, `related_posts: false`.
- File name: `2026-10-27-3d-vision-NN-<slug>.md` in `_posts/en-us/`, `_posts/zh-cn/` and `_posts/ja-jp/`.
- Figures:
  - scripts `bin/figures/3d-vision/vision3d_NN.py`, written to `assets/img/blog/3d-vision/NN-*.svg`, using the
    shared style (`bin/figures/style.py`);
  - post 01's worker also creates a generic `bin/figures/3d-vision/make_all.py` that runs every
    `vision3d_*.py`.
- Widgets: `assets/js/widgets/3d-vision-<name>.js`, following the widget rules in BLOG_GUIDE section 10
  (plain JS, ASCII only, `data-lang`, pointer events).
- Reading list: `docs/reading-lists/3d-vision.md`, in Chinese like the others. Each worker appends a section
  `## NN <topic>`; post 01's worker writes the file title. A union merge combines the sections.

Existing posts overlap with this series; build on them, link them, and do not repeat them:
- `neural-rendering-01-cameras-and-multiview-geometry`: a compact intro to pinhole, epipolar, triangulation,
  BA, COLMAP and MVS.
- `graphics-01-roadmap-and-math`: transforms and rotations.
- `graphics-08-geometry-processing`: meshes, SDFs, marching cubes, Poisson.
- `embodied-ai-01-robotics-foundations`: SE(3), Lie groups.
- `neural-rendering-05-3dgs-frontiers`: Gaussian SLAM, feed-forward 3D.
- `graphics-12-differentiable-and-inverse-rendering`.

| NN | Slug | Scope | Widget |
| --- | --- | --- | --- |
| 01 | `3d-vision-01-image-formation-and-camera-models` | projective geometry (P2/P3, homogeneous coordinates, points and lines at infinity, vanishing points), pinhole model, intrinsics and extrinsics, P = K[R\|t] and its decomposition (RQ), lens distortion (Brown-Conrady, fisheye / Kannala-Brandt), rolling shutter, coordinate conventions (OpenCV, OpenGL, COLMAP, NeRF) and how to convert between them | `3d-vision-camera-model`: intrinsics and distortion sliders on a projected checkerboard, with the 3D frustum |
| 02 | `3d-vision-02-camera-calibration` | homographies and the DLT (with normalization), Zhang's method (closed form, then LM refinement with distortion), reprojection error and parameter uncertainty, calibration targets (checkerboard, ChArUco, AprilTag), stereo calibration and rectification, hand-eye calibration AX=XB, camera-IMU calibration (Kalibr), practical tips; OpenCV code on synthetic data | `3d-vision-calibration`: choose board poses and watch reprojection error and parameter uncertainty change |
| 03 | `3d-vision-03-features-and-matching` | corners (Harris, Shi-Tomasi), scale space and SIFT, ORB and binary descriptors, matching (ratio test, mutual NN), robust estimation (RANSAC and its iteration count, MSAC, LO-RANSAC, MAGSAC++), learned features and matchers (SuperPoint, SuperGlue, LightGlue, LoFTR, RoMa), optical flow (Lucas-Kanade, then RAFT), evaluation | `3d-vision-ransac`: model fitting with an outlier-ratio slider; hypotheses, inliers, iterations needed |
| 04 | `3d-vision-04-two-view-geometry` | epipolar geometry, essential and fundamental matrices, normalized 8-point, 5-point (idea), decomposing E and the cheirality check, triangulation (DLT, midpoint, optimal), degeneracies (pure rotation, planar scenes), stereo rectification, disparity and depth, block matching and SGM | `3d-vision-epipolar`: drag a point in view 1, see the epipolar line in view 2; move the baseline |
| 05 | `3d-vision-05-multi-view-geometry-and-bundle-adjustment` | PnP (P3P, EPnP) with RANSAC, incremental SfM (COLMAP), global SfM (rotation averaging, translation averaging, GLOMAP), bundle adjustment (Gauss-Newton and LM, Jacobians, Schur complement, sparsity, robust kernels, gauge freedom), scale ambiguity | `3d-vision-bundle-adjustment`: step LM on a toy scene; residuals, cameras and points converge |
| 06 | `3d-vision-06-visual-slam` | SLAM as MAP inference and factor graphs, front end and back end, keyframes, feature-based and direct VO, loop closure (bag of words), pose-graph optimization on SE(3), filtering versus optimization (EKF, MSCKF), VIO with IMU preintegration, ORB-SLAM3, VINS, DSO, DROID-SLAM, Gaussian or neural SLAM | `3d-vision-pose-graph`: drifting odometry, add a loop closure, optimize the pose graph |
| 07 | `3d-vision-07-depth-estimation-and-multi-view-stereo` | depth sensors (stereo, structured light, ToF, LiDAR), plane-sweep stereo and cost volumes, PatchMatch MVS, learned MVS (MVSNet family), monocular depth (MiDaS, Depth Anything, metric depth), depth fusion (TSDF) | `3d-vision-plane-sweep`: a depth-hypothesis slider with per-pixel matching cost curves |
| 08 | `3d-vision-08-3d-representations` | point clouds, meshes, voxels and octrees, TSDF and SDF, occupancy, neural fields, 3D Gaussians, multi-plane images, depth maps; conversions between them, memory and accuracy trade-offs, which one for which task; PointNet and sparse convolution in brief | `3d-vision-representations`: one shape as points, voxels, SDF, mesh or Gaussians, with a resolution slider and memory |
| 09 | `3d-vision-09-3d-reconstruction-classic-to-feed-forward` | the classical pipeline (SfM, MVS, fusion, meshing), surface reconstruction (Poisson, TSDF and marching cubes), neural surfaces (NeuS, Neuralangelo, 2DGS), feed-forward 3D foundation models (DUSt3R, MASt3R, VGGT and 2025-2026 successors, verified), evaluation (DTU, Tanks and Temples, ETH3D) | `3d-vision-tsdf-fusion`: 2D TSDF fusion of noisy depth scans from a moving camera |
| 10 | `3d-vision-10-3d-vision-for-ar-vr` | inside-out 6DoF tracking on headsets (VIO and maps), hand and eye tracking, scene understanding (planes, meshes, semantic anchors), spatial anchors and relocalization, motion-to-photon latency and prediction, registration error budgets, passthrough MR reprojection; the owner's AR/VR research area | `3d-vision-motion-to-photon`: latency, prediction and drift against the registration error of a virtual object |

## Interactive Lab: new home-page demos

The Lab is `_includes/lab.liquid` plus `assets/js/lab*.js`, hand-written WebGL. Tabs toggle panels:
`<div class="lab-panel" role="tabpanel" id="lab-<id>" aria-labelledby="lab-tab-<id>" hidden>`. Each demo:
- is an IIFE that finds its own panel;
- renders only while visible (IntersectionObserver plus visibilitychange, like `animate()` in `lab.js`);
- falls back to the `nogl` text if WebGL is unavailable.

New demos, one worker each. Each must look advanced and be technically meaningful:

| id | Demo | Core technique | Related posts |
| --- | --- | --- | --- |
| `rc` | 2D global illumination with Radiance Cascades | Paint light emitters and walls and get real-time 2D GI. Distance field by jump flooding, then radiance cascades (Sannikov 2023): interval raymarching per cascade and merging from coarse to fine. Toggles: cascade count, show cascades, bilinear fix; presets. | `graphics-11`, `graphics-06` |
| `mpm` | MLS-MPM 2D materials | Water, jelly and snow with the MLS-MPM method (Hu et al. 2018, SIGGRAPH). Several thousand particles on a grid, P2G and G2P transfers, fixed corotated or Neo-Hookean elasticity with snow plasticity. Drag to push or attract; material buttons; reset scenes. | `graphics-07`, `graphics-engine-05` |
| `sdf` | SDF sculpting by sphere tracing | A WebGL2 full-screen sphere tracer over a scene of primitives with smooth union and subtraction (adjustable k). Click to place or move primitives, orbit the camera, soft shadows and ambient occlusion. A "steps" heat map and a distance-field slice view make the algorithm visible. | `graphics-05`, `graphics-08` |
| `sky` | Volumetric clouds and atmosphere | Ray-marched procedural clouds (FBM noise) with Beer-Lambert transmittance, a dual-lobe Henyey-Greenstein phase function, a multiple-scattering approximation, and a Rayleigh/Mie sky. Time-of-day, coverage and density sliders; low-resolution march plus upscale for speed. | `graphics-10` |

The contract for a demo worker (files for demo `<id>`):
- `assets/js/lab-<id>.js`:
  - ASCII only (use `\u` escapes);
  - WebGL2, with a graceful message if it is unavailable;
  - no libraries;
  - pointer and touch input;
  - DPR-aware sizing, capped for performance;
  - 60 fps on a laptop GPU and acceptable on phones, with the cost scaled down when the frame rate drops;
  - all UI text, in en, zh and ja, inside the JS, chosen from `panel.dataset.lang` (`en` / `zh` / `ja`).
- `_includes/lab-panel-<id>.liquid`: the panel markup, following the existing panels' classes
  (`lab-stage`, `lab-controls`, `lab-b`, `lab-caption`). It includes
  `data-lang="{{ site.active_lang | slice: 0, 2 }}"` and a link to the related blog post with
  `{{ '/blog/2026/<slug>/' | relative_url }}`; the JS fills in the text.
- Do not edit `_includes/lab.liquid`, `_data/` or other demos. A later integration step adds the tab
  buttons, includes the panel and loads the script.
- Test with a standalone HTML page in a temp dir that includes your panel markup (rendered by hand) and your
  script. Use Playwright with SwiftShader (`--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader`) at 390 and 1100 px. Look at the screenshots; drag and tap; there must be no
  console errors.

## Process for every worker

- You run in a git worktree. Start your branch from the latest main:
  `git fetch origin main && git checkout -B w/<id> FETCH_HEAD`.
- Build the site:
  `/tmp/claude-0/-home-user-takuyy/0c443e9e-c3ce-5795-8d74-9c6cb688c2ab/scratchpad/tools/site-build-local <worktree>`
- Check pages:
  `node /tmp/claude-0/-home-user-takuyy/0c443e9e-c3ce-5795-8d74-9c6cb688c2ab/scratchpad/tools/site-check-local.js <worktree> <slug|home> ...`
  - Optional environment variables: `LANGS=en,zh,ja`, `WIDTHS=390,1100`, `LAB_TABS=lab-tab-x`.
  - CDNs (MathJax and others) are blocked in this sandbox, so formulas stay raw LaTeX and page width is only
    indicative here. A full-network check runs on GitHub after the merge.
  - Figures, broken images, widget drags and console errors are reliable here.
  - Look at the element screenshots yourself.
- Research: WebSearch works. Most sites are blocked for WebFetch here (arXiv, ACM, CVF). Verify papers
  through search results that show the arXiv abstract, DOI or official page. Never invent ids, links,
  numbers or facts; leave out what you cannot verify. Mark recent work with its status (published,
  accepted, preprint) and date it "as of November 2026".
- Python: numpy, scipy and matplotlib are available. Keep runs short.
- Commit with author `yangzehua <yangzehua@akane.waseda.jp>`, ending every message with these two lines:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CeJPo3UioEfuc4SHmQGuTp
  ```

- When done, run `git push -u origin w/<id>`.
- Touch only the files your task names, plus your own figures, widgets and reading-list section.
- Finish with a short report:
  - what you made: posts, figures, widgets, word count;
  - what you verified;
  - open issues.
