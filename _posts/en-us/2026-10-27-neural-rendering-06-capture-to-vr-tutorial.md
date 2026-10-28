---
layout: post
title: "From phone capture to VR: a hands-on 3D Gaussian Splatting tutorial"
date: 2026-10-27 12:06:00+0900
description: "A practical, step-by-step workflow: capture photos or video, run COLMAP, train 3DGS with the official code, gsplat or nerfstudio splatfacto, clean and export the .ply, and view it on the web and in a VR headset, with common failure modes and fixes."
categories: neural-rendering
tags: [3d-gaussian-splatting, tutorial, colmap, gsplat, nerfstudio, webxr, vr]
series: neural-rendering
series_order: 6
toc:
  sidebar: left
related_posts: false
---

## Why this matters

Five posts of theory are worth little until you have captured and explored a scene of your own. This tutorial walks through the whole pipeline on a single consumer GPU: **capture → poses (COLMAP) → training (3DGS) → cleanup and export → viewing in the browser and in VR.** Each step connects back to the theory: the camera models and SfM of [post 1]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}), the optimization of [post 4]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}), and the anti-aliasing and VR concerns of [post 5]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}). When something goes wrong, and something always does, the failure-mode table at the end tells you which of those ideas to revisit.

Tools change quickly. The commands below were checked against the current sources of COLMAP, the official 3DGS repository, gsplat and nerfstudio; if a flag has been renamed in your version, `--help` is the source of truth.

## Prerequisites

- An NVIDIA GPU with CUDA (8 GB of VRAM is enough for small scenes at reduced resolution; 24 GB is comfortable for full-resolution outdoor scenes), Linux or Windows.
- Python 3.10+ with PyTorch and CUDA, `conda` or `venv`, `ffmpeg`, and COLMAP (prebuilt binaries or a CUDA build).
- A phone or camera. Optional: a WebXR-capable headset (for example a standalone headset with a Chromium-based browser).

## 1. Capture

Capture quality decides the outcome more than any hyperparameter. 3DGS needs **many sharp, overlapping, consistently exposed views** that see every surface you want to render from several directions.

**Do:**

- **Lock exposure, white balance and focus** (an "AE/AF lock" or a manual/pro camera mode). Changing exposure between frames looks like changing materials to the optimizer.
- **Move the camera, not just rotate it.** SfM and splatting need parallax: walk around the object or through the room. Pure rotation from one spot gives no depth.
- **Overlap generously:** each new photo should share roughly 60–80% of its content with the previous one.
- For an object: two or three **orbits** at different heights (e.g. eye level, from above, from low), keeping the object filling a good part of the frame. For a room: walk a loop along the walls facing inwards, and then a second loop facing outwards.
- **Light evenly.** Overcast daylight or diffuse indoor lighting is ideal; hard shadows and highlights will be baked in.
- Typical sizes: **100–300 photos** for an object or a small room; several hundred for larger scenes.

**Avoid:** motion blur (use good light and a fast shutter, or take photos instead of video), moving people and objects, mirrors, glass and very shiny surfaces, large textureless walls, and digital zoom. Ultra-wide and fisheye lenses work but require the right camera model in COLMAP and undistortion.

**Video instead of photos.** Video is convenient, but each frame has more motion blur and compression. Record at the highest resolution and frame rate available, move slowly, and extract 2–3 frames per second:

```bash
mkdir -p scene/input
ffmpeg -i capture.mp4 -qscale:v 1 -qmin 1 -vf "fps=2" scene/input/%04d.jpg
```

Then delete obviously blurry frames. A quick way to rank them is the variance of the Laplacian (a sharpness score):

```python
import sys, glob
import cv2

paths = sorted(glob.glob(sys.argv[1] + "/*.jpg"))
scores = []
for p in paths:
    g = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
    scores.append((cv2.Laplacian(g, cv2.CV_64F).var(), p))
scores.sort()
print("blurriest 10% (consider deleting):")
for s, p in scores[: max(1, len(scores) // 10)]:
    print(f"{s:8.1f}  {p}")
```

## 2. Camera poses with COLMAP

We now run the incremental SfM of post 1. The official 3DGS repository expects this layout:

```text
scene/
  input/          your photos (distorted, any camera model)
  images/         undistorted images            <- created below
  sparse/0/       cameras.bin images.bin points3D.bin (PINHOLE)  <- created below
```

### 2.1 The individual steps

```bash
cd scene
mkdir -p distorted/sparse

# 1. SIFT features; one shared camera for all images, OPENCV model (k1, k2, p1, p2)
colmap feature_extractor \
    --database_path distorted/database.db \
    --image_path input \
    --ImageReader.single_camera 1 \
    --ImageReader.camera_model OPENCV \
    --FeatureExtraction.use_gpu 1

# 2. Matching: exhaustive for < ~500 images; use sequential_matcher for video frames
colmap exhaustive_matcher \
    --database_path distorted/database.db \
    --FeatureMatching.use_gpu 1

# 3. Incremental SfM (registration, triangulation, bundle adjustment)
colmap mapper \
    --database_path distorted/database.db \
    --image_path input \
    --output_path distorted/sparse

# 4. Undistort to an ideal PINHOLE camera, as required by the 3DGS rasterizer
colmap image_undistorter \
    --image_path input \
    --input_path distorted/sparse/0 \
    --output_path . \
    --output_type COLMAP

# the undistorter writes sparse/*.bin; the 3DGS loader expects sparse/0/
mkdir -p sparse/0 && mv sparse/*.bin sparse/0/
```

Notes:

- **Option names changed in recent COLMAP releases.** Current COLMAP uses `--FeatureExtraction.use_gpu` and `--FeatureMatching.use_gpu`; older releases (and the official 3DGS `convert.py`, which still passes `--SiftExtraction.use_gpu` / `--SiftMatching.use_gpu`) use the old names. If `convert.py` fails at the first step with an unknown-option error, this is why: run the commands above by hand, or edit the two option names in `convert.py`.
- `single_camera 1` is right when all images come from one camera with fixed zoom; drop it for mixed cameras.
- With a CPU-only machine, set the `use_gpu` options to 0. It works, just slower.
- **Global SfM** is a faster alternative for large captures. COLMAP now ships a `global_mapper` command (the GLOMAP approach of post 1); the COLMAP documentation recommends running `view_graph_calibrator` on a copy of the database first. The standalone [GLOMAP](https://github.com/colmap/glomap) reads the same database.

If you prefer the one-liner, the official repository's script does steps 1–4 for you (put the photos in `scene/input` first):

```bash
python convert.py -s scene            # add --resize to also create 1/2, 1/4, 1/8 images
```

### 2.2 Check the reconstruction before training

Five minutes here saves hours later:

```bash
colmap model_analyzer --path sparse/0
colmap gui --import_path sparse/0 --database_path distorted/database.db --image_path images
```

Look for: **almost all images registered** (if COLMAP split the scene into several models, `distorted/sparse/1`, `2`, ... exist and the capture lacks overlap somewhere), a **mean reprojection error below about 1 px**, and a point cloud and camera trajectory that look like your scene. If cameras are missing, add photos bridging the gap rather than tuning parameters.

## 3. Training

Pick one of three implementations. They produce compatible `.ply` files.

### 3.1 The official INRIA code

```bash
git clone https://github.com/graphdeco-inria/gaussian-splatting --recursive
cd gaussian-splatting
conda env create --file environment.yml
conda activate gaussian_splatting

python train.py -s ../scene -m output/scene            # 30k iterations by default
python train.py -s ../scene -m output/scene_eval --eval # hold out every 8th image for testing
python render.py -m output/scene_eval                   # render train/test views
python metrics.py -m output/scene_eval                  # PSNR, SSIM, LPIPS
```

Useful options of `train.py` (all from `arguments/__init__.py`):

| Option | Effect |
| --- | --- |
| `-r 2` / `-r 4` | train at 1/2 or 1/4 resolution (images wider than 1.6K pixels are downscaled automatically) |
| `--data_device cpu` | keep images in CPU memory if VRAM is short |
| `--iterations 7000` | quick preview; the defaults save at 7k and 30k |
| `--densify_grad_threshold 0.0002` | the $\tau_{\text{pos}}$ of post 4; raise it to get fewer Gaussians |
| `--antialiasing` | the 2D Mip filter of Mip-Splatting (post 5) instead of plain dilation |
| `--train_test_exp` | per-image exposure compensation for captures with exposure changes |
| `--white_background` | for synthetic scenes with white backgrounds |

The trained model is at `output/scene/point_cloud/iteration_30000/point_cloud.ply`. The repository also contains the SIBR real-time viewer (`SIBR_gaussianViewer_app -m output/scene`) and a network viewer that can watch training live.

### 3.2 gsplat

[gsplat](https://github.com/nerfstudio-project/gsplat) is faster and lighter in memory, and exposes the variants from post 5 as options.

```bash
pip install gsplat
git clone https://github.com/nerfstudio-project/gsplat && cd gsplat/examples
pip install -r requirements.txt --no-build-isolation

# the classic recipe (DefaultStrategy: clone / split / prune)
python simple_trainer.py default --data_dir ../../scene --data_factor 1 \
    --result_dir results/scene --save_ply

# 3DGS-MCMC densification with a fixed Gaussian budget, and anti-aliased rasterization
python simple_trainer.py mcmc --data_dir ../../scene --data_factor 1 \
    --result_dir results/scene_mcmc --antialiased --save_ply
```

`--data_factor 4` reads images downsampled by 4 (it expects an `images_4/` folder, which `convert.py --resize` creates). The `.ply` files go to `results/<name>/ply/point_cloud_<step>.ply`, and a browser viewer (Viser) runs during training.

### 3.3 nerfstudio splatfacto

[nerfstudio](https://docs.nerf.studio/) wraps COLMAP and training in two commands and has the friendliest viewer:

```bash
pip install nerfstudio
ns-process-data images --data scene/input --output-dir scene_ns     # or: ns-process-data video --data capture.mp4 ...
ns-train splatfacto --data scene_ns                                  # 'splatfacto-big' for higher quality
ns-export gaussian-splat --load-config outputs/scene_ns/splatfacto/<timestamp>/config.yml \
    --output-dir exports/splat
```

Splatfacto is built on gsplat. Note that `ns-export gaussian-splat` only works for splat models, not for NeRF methods such as `nerfacto`.

### 3.4 What to expect

Watch the training PSNR and the number of Gaussians. The count grows quickly until densification stops at 15k iterations and then stays flat; one to several million Gaussians is typical for a room or an outdoor scene. A 7k-iteration preview usually tells you whether the capture works. If test-view PSNR is far below training PSNR, the model is overfitting to too few or too similar views: capture more.

## 4. Inspect, clean and convert the `.ply`

A 3DGS `.ply` is a point cloud with extra per-vertex properties: `x y z`, `nx ny nz` (unused), `f_dc_0..2` (degree-0 SH), `f_rest_0..44` (higher SH), `opacity` (logit), `scale_0..2` (log), `rot_0..3` (quaternion $w, x, y, z$, unnormalized). The following script prints statistics and removes the most common junk: nearly transparent Gaussians, a few huge blobs and far-away outliers.

```python
import sys
import numpy as np
from plyfile import PlyData, PlyElement

def load_3dgs_ply(path):
    v = PlyData.read(path)["vertex"].data
    xyz = np.stack([v["x"], v["y"], v["z"]], -1)
    opacity = 1.0 / (1.0 + np.exp(-v["opacity"]))                      # stored as logits
    scales = np.exp(np.stack([v[f"scale_{i}"] for i in range(3)], -1))   # stored as log-scales
    dc = np.stack([v[f"f_dc_{i}"] for i in range(3)], -1)
    rgb = np.clip(0.5 + 0.28209479177387814 * dc, 0, 1)                 # degree-0 SH -> base colour
    return v, xyz, opacity, scales, rgb

def clean(v, xyz, opacity, scales, min_opacity=0.02, max_scale_pct=99.5, keep_radius_pct=99.0):
    """Drop nearly transparent Gaussians, the largest 'blobs', and far-away outliers."""
    center = np.median(xyz, 0)
    dist = np.linalg.norm(xyz - center, axis=1)
    keep = (opacity > min_opacity)
    keep &= scales.max(1) < np.percentile(scales.max(1), max_scale_pct)
    keep &= dist < np.percentile(dist, keep_radius_pct)
    return v[keep], keep

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    v, xyz, opacity, scales, rgb = load_3dgs_ply(src)
    print(f"{len(xyz):,} Gaussians, SH rest coeffs: {sum(n.startswith('f_rest') for n in v.dtype.names)}")
    print("median opacity %.3f, median max-scale %.4f" % (np.median(opacity), np.median(scales.max(1))))
    print("bounding box:", xyz.min(0).round(2), xyz.max(0).round(2))
    kept, mask = clean(v, xyz, opacity, scales)
    print(f"kept {mask.sum():,} / {len(mask):,}")
    PlyData([PlyElement.describe(kept, "vertex")], text=False).write(dst)
```

```bash
pip install plyfile
python clean_ply.py output/scene/point_cloud/iteration_30000/point_cloud.ply scene_clean.ply
```

Automatic cleaning is a blunt tool; the percentiles are starting points. For precise edits (cropping to a box, deleting floaters by hand, rotating the scene upright) use **SuperSplat**, PlayCanvas's open-source browser editor at [superspl.at](https://superspl.at/): drag the `.ply` onto the page, select and delete Gaussians, then export a `.ply` or a compressed format. Compressed formats are typically several times smaller than the raw `.ply`, which matters for the web and VR.

## 5. View it on the web

Several open-source WebGL renderers display 3DGS files; we use **Spark**, a three.js renderer from World Labs that reads `.ply`, `.spz`, `.splat`, `.ksplat` and `.sog` and mixes splats with ordinary three.js meshes. Save this as `index.html` next to your `scene_clean.ply`:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style> body { margin: 0; } </style>
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
        "@sparkjsdev/spark": "https://sparkjs.dev/releases/spark/2.4.0/spark.module.js"
      }
    }
  </script>
</head>
<body>
<script type="module">
  import * as THREE from "three";
  import { OrbitControls } from "three/addons/controls/OrbitControls.js";
  import { VRButton } from "three/addons/webxr/VRButton.js";
  import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 1000);
  camera.position.set(0, 1.6, 3);

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;                          // WebXR: stereo rendering in a headset
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  scene.add(new SparkRenderer({ renderer }));

  const splat = new SplatMesh({ url: "scene_clean.ply" });
  splat.quaternion.set(1, 0, 0, 0);                    // COLMAP is y-down: rotate 180 deg about x
  splat.position.set(0, 1.2, 0);                       // put the scene around eye height
  scene.add(splat);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, 0);
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
</script>
</body>
</html>
```

Serve the folder over HTTP (browsers block module loading from `file://`):

```bash
python -m http.server 8000      # then open http://localhost:8000
```

The rotation line matters: COLMAP and 3DGS use the OpenCV convention with $y$ pointing down (post 1), while three.js uses $y$ up. The quaternion $(x, y, z, w) = (1, 0, 0, 0)$ in three.js's order is a 180° rotation about the $x$ axis. If your scene is still tilted, it is because COLMAP's world frame is arbitrary (post 1, gauge freedom): straighten it once in SuperSplat, or estimate the up direction as the average of the cameras' up vectors.

Other viewers worth knowing: the PlayCanvas engine and SuperSplat's own publishing (which creates a shareable viewer page), [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D) for three.js, the original WebGL viewer [antimatter15/splat](https://github.com/antimatter15/splat), and the official SIBR viewer on the desktop.

## 6. View it in VR

The page above is already VR-ready: `renderer.xr.enabled` plus the **Enter VR** button from `VRButton` start a WebXR session, and three.js renders the scene once per eye with the headset's tracked pose. To use it on a standalone headset:

1. **Serve over HTTPS or use port forwarding.** WebXR requires a secure context. `localhost` counts as secure, so the easiest route is to connect the headset by USB and forward the port (for example `adb reverse tcp:8000 tcp:8000` for Android-based headsets), then open `http://localhost:8000` in the headset browser. Alternatively host the folder on any HTTPS static host (GitHub Pages works).
2. **Mind the scale and origin.** SfM units are arbitrary (post 1). If the room looks like a doll house or a cathedral, scale the `SplatMesh` uniformly (`splat.scale.setScalar(k)`) using a known distance, and position it so the floor is at $y = 0$ for a `local-floor` reference space.
3. **Respect the budget.** A standalone headset renders two views at 72–90 Hz on a mobile GPU. Spark's documentation suggests budgets of roughly half a million to three quarters of a million splats for WebXR, compared with millions on desktop. Reduce the count by training with a budget (gsplat `mcmc`, e.g. via its `--strategy.cap_max` option), raising the densification threshold, or decimating in SuperSplat, and prefer compressed files.
4. **Reduce popping and aliasing.** Head motion exposes sorting pops and aliasing. Train with `--antialiasing` (official code) or `--antialiased` (gsplat) if you will view the scene at different distances from the capture.

Spark also includes its own WebXR helper (`SparkXr`) with controller and hand-tracking locomotion, and SuperSplat's published viewer supports WebXR in AR and VR. For native engines, community plugins bring Gaussian splats to Unity and Unreal; check that they support single-pass stereo before you rely on them for VR.

## 7. Common failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| COLMAP registers only part of the images, or several models | gaps in overlap, repetitive or textureless areas | add bridging photos; use `sequential_matcher` for video; try `global_mapper`; mask out sky or moving objects |
| `convert.py` fails at feature extraction | renamed COLMAP options (`SiftExtraction.*` → `FeatureExtraction.*`) | run the commands of section 2.1, or edit `convert.py` |
| Training crashes with out-of-memory | too many pixels or Gaussians | `-r 2`, `--data_device cpu`, raise `--densify_grad_threshold`, or use gsplat with a Gaussian cap |
| Floaters near the cameras | unconstrained space in front of the cameras, few views per region | more views; rely on opacity reset; remove in SuperSplat; depth regularization if available |
| Blurry everywhere | motion blur, wrong focus, bad poses | delete blurry frames; check the reprojection error; lock focus |
| Colour flicker or "patchy" exposure | auto exposure or white balance changed | lock exposure; `--train_test_exp` (official) or appearance embeddings (splatfacto) |
| Needle-like spikes or shimmer when zooming in or out | aliasing (post 5) | `--antialiasing` / `--antialiased`; avoid rendering far outside the capture distance |
| Good from capture positions, broken in between | views too similar (no parallax) or SH "painting" | move the camera more; capture more varied viewpoints |
| Mirrors and windows look like holes or second rooms | view-dependent effects 3DGS cannot explain | expected; mask or avoid such surfaces; reflections are an open research problem |
| Scene tilted or upside down in the viewer | arbitrary SfM frame, y-down convention | rotate 180° about $x$; straighten in SuperSplat |
| Wrong scale in VR | SfM scale is arbitrary | scale by a measured reference distance |

## 8. Where to go from here

- **Evaluate properly.** Use `--eval` and report PSNR / SSIM / LPIPS on held-out views (post 2), not on training views.
- **Try the variants of post 5.** 2DGS for meshes (gsplat ships `simple_trainer_2dgs.py`), MCMC densification, compression for the web.
- **Make it interactive.** Combine the splat with three.js meshes for UI and physics, or segment it and let users manipulate objects, as in VR-GS.
- **Feed-forward instead of optimization.** For sparse or unposed photos, try the feed-forward models of post 5 and compare with your optimized result.

## Try it

Before your first capture, open the Gaussian World demo in the [interactive lab]({{ '/' | relative_url }}#lab) and switch to the "Ellipsoids" and "Overdraw" views: they show what a well-distributed set of Gaussians looks like, and how much overdraw a VR frame has to pay for, the same quantities you will be tuning in sections 3 and 6.

## Representative papers and tools

| Paper / tool | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Structure-from-Motion Revisited (COLMAP, Schönberger & Frahm) | CVPR | 2016 | [CVF](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) | The pose estimation step of this tutorial |
| Global Structure-from-Motion Revisited (GLOMAP, Pan et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2407.20219) | Fast global SfM for large captures |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al.) | ACM TOG / SIGGRAPH | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) | The method we train |
| Nerfstudio (Tancik et al.) | SIGGRAPH (Conf.) | 2023 | [arXiv](https://arxiv.org/abs/2302.04264) | Processing, splatfacto and viewer |
| gsplat: An Open-Source Library for Gaussian Splatting (Ye et al.) | arXiv | 2024 | [arXiv](https://arxiv.org/abs/2409.06765) | Fast trainer with MCMC and anti-aliasing |
| Mip-Splatting (Yu et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.16493) | Why `--antialiasing` matters in VR |
| 3D Gaussian Splatting as Markov Chain Monte Carlo (Kheradmand et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2404.09591) | Budgeted densification for VR-sized models |
| VR-GS (Jiang et al.) | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2401.16663) | A full interactive Gaussian VR system |

## Learning resources

- [COLMAP documentation](https://colmap.github.io/): tutorial, command-line interface, FAQ (including tips for difficult datasets).
- [Official 3DGS repository](https://github.com/graphdeco-inria/gaussian-splatting): README sections on processing your own scenes and the viewers.
- [gsplat documentation](https://docs.gsplat.studio/) and its `examples/` folder.
- [nerfstudio documentation](https://docs.nerf.studio/), including the data capture guides and [splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html).
- [Spark](https://github.com/sparkjsdev/spark) and its examples; [SuperSplat](https://github.com/playcanvas/supersplat); the [WebXR Device API](https://immersive-web.github.io/webxr/) and three.js WebXR examples.

## Exercises

1. Capture the same object twice: once with auto exposure and once with exposure locked. Train both and compare test PSNR and visual artefacts.
2. Train with `-r 4` and at full resolution, then view both at full resolution in the browser, with and without `--antialiasing`. Describe the differences in terms of post 5.
3. Use `clean_ply.py` and SuperSplat to reduce your model to under 500k Gaussians; measure the frame rate in the headset before and after.
4. Write a small script that reads `images.bin` (e.g. with `pycolmap`) and estimates the scene's up vector from the cameras; use it to straighten the model automatically in the web viewer.
5. Measure a known distance in your scene (a table length) and set the VR scale so that it is correct; check it in the headset with your hands.

This is the last post of the neural rendering track. The world-models and embodied-AI series build on it: Gaussian maps for robots, generated Gaussian worlds, and simulators that render what a camera would see.
