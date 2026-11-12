---
layout: post
title: "3D representations: points, meshes, voxels, SDFs, neural fields and Gaussians"
date: 2026-10-27 11:08:00+0900
description: "One shape stored nine ways: depth maps and multi-plane images, point clouds, meshes, voxel grids and octrees, signed distance fields and TSDFs, neural fields and 3D Gaussians. How to convert between them, how memory and accuracy scale (measured on one torus), which to pick for which task, and PointNet and sparse convolution in brief."
categories: 3d-vision
tags: [3d-representations, point-cloud, mesh, voxels, octree, sdf, tsdf, neural-fields, gaussian-splatting, multi-plane-images, pointnet, sparse-convolution]
series: 3d-vision
series_order: 8
toc:
  sidebar: left
related_posts: false
---

## Why this matters

Posts 1 to 7 produced geometry in several forms: [post 4]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }}) triangulated sparse points, [post 5]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}) gave a sparse point cloud with camera poses, [post 6]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }}) kept a map, and [post 7]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) turned posed images into dense depth maps. Before we can merge all of that into a surface ([post 9]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})), we have to decide what a "3D model" is in memory.

There is no single answer. A robot planning a path asks "is this cell free?". A renderer asks "what colour does this ray see?". A physics engine asks "how far am I from the surface, and in which direction?". A neural network asks for a regular array it can convolve. Each question is cheap in one representation and expensive in another. This post takes **one shape**, a torus, and stores it in every common representation. For each one we measure what it costs in memory, how accurate it is, and which questions it answers easily. By the end you should be able to look at a task and pick a representation for a reason, not out of habit.

This is a long post. Sections 2 to 8 each cover one family and can be read separately. Sections 9 to 11 compare them: conversions, the memory and accuracy trade-off, and a decision table. Section 12 is a short introduction to learning on 3D data.

## Prerequisites

- The pinhole camera $P = K[R \mid \mathbf t]$, back-projection $K^{-1}\tilde{\mathbf u}$ and the OpenCV camera frame from [post 1]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }}).
- Depth maps and what produces them: [post 7]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}). We only need to know that a depth map is an image of depths.
- Meshes, signed distance functions and marching cubes at the level of [graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}). We link to it rather than repeat it.
- For sections 7 and 8, the basics of [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) and [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) help, but are not required.
- Python with NumPy and SciPy. The code blocks build on each other: run them in order in one file or notebook. All of them are copied from `bin/figures/3d-vision/vision3d_08.py`, which also draws every figure, and every number quoted below is printed by that script.

## 1. One shape, many representations

### 1.1 Three ways to slice the landscape

Every 3D representation makes three choices.

1. **Explicit or implicit.** An explicit representation lists things that lie *on* the surface: points, triangles, Gaussians. You can enumerate the surface directly, but asking "is $\mathbf x$ inside?" requires a search. An implicit representation stores a function $f(\mathbf x)$ over space, and the surface is a level set such as $\\{\mathbf x : f(\mathbf x) = 0\\}$. Inside tests become one function evaluation, but finding the surface requires a search (root finding, marching cubes).
2. **Surface or volume.** A mesh or a point cloud describes only the boundary. An occupancy grid, an SDF or a density field describes every point of space, including empty space and the interior. Volumetric representations are what you need for collision checking, free-space reasoning and volume rendering. They pay for it in memory, because volume grows as $N^3$ while area grows as $N^2$.
3. **World space or image space.** A depth map or a multi-plane image is attached to one camera. It is cheap and matches the sensor exactly, but it only describes what that camera saw.

Two further distinctions come up again and again. A representation can be **discrete** (a grid, a list) or **continuous** (a function you can query anywhere, such as an interpolated grid or a neural network). And it can be **structured** (a regular grid that a CNN can convolve) or **unstructured** (a set of points with no order).

| Representation | Explicit / implicit | Surface / volume | Natural query | Hard query |
| --- | --- | --- | --- | --- |
| depth map $Z(u, v)$ | explicit, image space | visible surface | "what does pixel $(u, v)$ see?" | anything the camera did not see |
| multi-plane image | explicit, image space | volume in a frustum | render nearby views | large viewpoint changes |
| point cloud | explicit | surface samples | "where are the samples?" | inside/outside, connectivity |
| triangle mesh | explicit | surface | rasterize, measure area, texture | inside test, topology changes |
| voxel occupancy | implicit, discrete | volume | "is cell $(i, j, k)$ occupied?" | sub-voxel precision |
| octree | implicit, discrete, adaptive | volume | the same, with less memory | updates that change the tree |
| SDF / TSDF grid | implicit, sampled | volume (band near the surface) | distance and normal at $\mathbf x$ | thin structures, sharp edges |
| neural field | implicit, continuous | volume | $f(\mathbf x)$ anywhere, differentiable | fast queries, editing |
| 3D Gaussians | explicit, soft | volume (density) | rasterize, differentiable | a well-defined surface |

### 1.2 The running example: a torus with an exact SDF

To compare representations fairly we need a shape whose true surface we know exactly. We use a **torus** around the $z$ axis, with ring radius $R = 1$ and tube radius $r = 0.4$ (think of metres). A torus is a good test because it has a hole (genus 1, so a mesh of it has Euler characteristic $0$), both convex and saddle-shaped regions, and a closed-form signed distance. For a point $\mathbf p = (x, y, z)$, let $q = \sqrt{x^2 + y^2} - R$ be the signed distance from the ring circle within the horizontal plane. The nearest point of the ring circle is at distance $\sqrt{q^2 + z^2}$, and the surface is a tube of radius $r$ around that circle, so

$$
f(\mathbf p) = \sqrt{q^2 + z^2} - r, \qquad q = \sqrt{x^2 + y^2} - R .
$$

$f < 0$ inside, $f > 0$ outside and $\lvert f \rvert$ is the Euclidean distance to the surface. The torus has area $4\pi^2 R r$ and volume $2\pi^2 R r^2$.

To sample the surface **uniformly** (we will need that to measure errors), parameterize it by the angle $\varphi$ around the ring and $\theta$ around the tube: $\mathbf p = \big((R + r\cos\theta)\cos\varphi,\ (R + r\cos\theta)\sin\varphi,\ r\sin\theta\big)$. The area element is $r(R + r\cos\theta)\,d\theta\,d\varphi$: the outer side of the tube ($\theta = 0$) has more area than the inner side. Drawing $\theta$ uniformly would crowd points on the inner side, so we accept a uniform $\theta$ with probability proportional to $R + r\cos\theta$ (rejection sampling).

```python
import numpy as np

R_MAJ, R_MIN = 1.0, 0.4          # torus around the z axis: ring radius R, tube radius r


def sdf_torus(p):
    """Exact signed distance to the torus (negative inside); p has shape (..., 3)."""
    q = np.hypot(p[..., 0], p[..., 1]) - R_MAJ     # distance from the ring circle, in its plane
    return np.hypot(q, p[..., 2]) - R_MIN


def sample_torus(n, rng):
    """n points uniformly distributed over the surface, with their exact unit normals."""
    phi = rng.uniform(0, 2 * np.pi, 4 * n)          # angle around the ring
    th = rng.uniform(0, 2 * np.pi, 4 * n)           # angle around the tube
    # the area element is r (R + r cos th) dth dphi, so accept th with probability ~ R + r cos th
    keep = rng.uniform(0, R_MAJ + R_MIN, 4 * n) < R_MAJ + R_MIN * np.cos(th)
    phi, th = phi[keep][:n], th[keep][:n]
    nrm = np.stack([np.cos(th) * np.cos(phi), np.cos(th) * np.sin(phi), np.sin(th)], -1)
    ring = np.stack([R_MAJ * np.cos(phi), R_MAJ * np.sin(phi), np.zeros_like(phi)], -1)
    return ring + R_MIN * nrm, nrm


AREA = 4 * np.pi ** 2 * R_MAJ * R_MIN
VOLUME = 2 * np.pi ** 2 * R_MAJ * R_MIN ** 2
rng = np.random.default_rng(0)
P_true, N_true = sample_torus(200_000, rng)
print("area %.4f  volume %.4f" % (AREA, VOLUME))
print("max |sdf| at the samples: %.1e" % np.abs(sdf_torus(P_true)).max())
```

Output: `area 15.7914  volume 3.1583` and `max |sdf| at the samples: 3.3e-16`. The 200,000 samples `P_true` stand in for the exact surface in all the error measurements below.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-overview.svg" localized="true" caption="The same torus ($R = 1$, $r = 0.4$) in six representations. Point cloud: 3000 uniform surface samples coloured by height. Mesh: a $24 \times 12$ parameter grid, 288 vertices and 576 triangles. Voxels: the cells of a $16^3$ grid over $[-1.5, 1.5]^3$ whose centres are inside (472 of 4096). SDF: $f$ on the plane $z = 0$ (red inside, blue outside), with the zero level (solid) and the level sets $f = 0.2$ and $0.4$ (dashed). Gaussians: 100 anisotropic Gaussians fitted to surface samples (section 8), drawn at $1.5\sigma$. Depth map: the torus on a table seen by a $160 \times 120$ camera (section 2)." %}

## 2. Image-space representations: depth maps and multi-plane images

### 2.1 Depth, range and inverse depth

A **depth map** stores one number per pixel. The convention matters, because three different numbers are all called "depth":

- **$z$-depth** $Z$: the coordinate along the optical axis in the camera frame, the $\lambda = Z\_c$ of $\lambda\tilde{\mathbf u} = K[R \mid \mathbf t]\tilde{\mathbf X}$ in [post 1]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }}). Depth cameras, stereo ([post 7]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})) and most datasets store this.
- **range** $\rho$: the Euclidean distance from the camera centre to the point, measured along the ray. Ray tracers and LiDAR return this, and so does a ray parameter $t$ whenever the ray direction has unit length. (The original NeRF code does not normalize its ray directions, which have unit $z$ component, so its $t$ is $z$-depth; check the convention of any codebase you use.) Since $K^{-1}\tilde{\mathbf u}$ has third component 1, the point is $Z\,K^{-1}\tilde{\mathbf u}$, so $\rho = Z\,\lVert K^{-1}\tilde{\mathbf u}\rVert$. The two agree at the principal point and differ by 22.6% at the corner of the camera below.
- **inverse depth** (or **disparity**) $1/Z$: stereo measures disparity $d = f b / Z$ for baseline $b$, and many networks predict inverse depth because it is bounded (zero at infinity) and because its error is closer to uniform than the error of $Z$.

Mixing $Z$ and $\rho$ bends planes into curved surfaces, an error that is easy to miss near the image centre and large at the edges.

### 2.2 Back-projection: from a depth map to points

Inverting the projection of post 1 for one pixel $\tilde{\mathbf u} = (u, v, 1)^\top$ with depth $Z$:

$$
\mathbf X_c = Z\, K^{-1} \tilde{\mathbf u}, \qquad \mathbf X_w = R^\top(\mathbf X_c - \mathbf t),
$$

using the world-to-camera convention $\mathbf X\_c = R\mathbf X\_w + \mathbf t$. Each valid pixel gives one 3D point, so a depth map is a point cloud with a known neighbourhood structure (the pixel grid).

**Worked example.** With $f\_x = f\_y = 140$ and $(c\_x, c\_y) = (79.5, 59.5)$ (the image centre of a $160 \times 120$ image, with integer pixel centres as in post 1), the corner pixel $(0, 0)$ has $K^{-1}\tilde{\mathbf u} = (-0.568, -0.425, 1)$ and $\lVert K^{-1}\tilde{\mathbf u}\rVert = 1.2260$. A depth of $Z = 3$ m there is a range of 3.678 m and the camera-frame point $(-1.704, -1.275, 3)$.

To get a depth map of our torus we render one, by **sphere tracing** the SDF ([graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})): from the camera centre, step along each ray by the current value of $f$. Because $\lvert f \rvert$ is the distance to the nearest surface, a sphere of that radius is empty, and the step can never overshoot. To make the scene less trivial, the torus rests on a 4 m by 4 m slab, and the SDF of the scene is the minimum of the two SDFs.

```python
def look_at(C, target, up=(0.0, 0.0, 1.0)):
    """World-to-camera R, t (OpenCV: x right, y down, z forward) for a camera at C."""
    z = target - C; z = z / np.linalg.norm(z)
    x = np.cross(z, up); x = x / np.linalg.norm(x)
    y = np.cross(z, x)
    R = np.stack([x, y, z])                          # rows = camera axes in world coordinates
    return R, -R @ C


def render_depth(K, R, t, W, H, sdf, n_steps=96, s_max=10.0):
    """Depth map Z(u, v) by sphere tracing the SDF; inf where the ray misses."""
    u, v = np.meshgrid(np.arange(W, dtype=float), np.arange(H, dtype=float))
    rays = np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(K).T   # K^-1 (u, v, 1): z = 1
    d = rays @ R                                     # R^T * ray: directions in the world frame
    norm = np.linalg.norm(d, axis=-1, keepdims=True)
    d = d / norm
    C = -R.T @ t
    s = np.zeros((H, W))                             # distance travelled along each ray
    for _ in range(n_steps):
        s = s + sdf(C + s[..., None] * d)            # safe step: the SDF is 1-Lipschitz
    hit = np.abs(sdf(C + s[..., None] * d)) < 1e-4
    hit &= s < s_max
    return np.where(hit, s / norm[..., 0], np.inf), np.where(hit, s, np.inf)   # depth Z, range


def backproject(depth, K, R, t):
    """Pixels with finite depth -> world points: X_w = R^T (Z K^-1 (u, v, 1) - t)."""
    v, u = np.nonzero(np.isfinite(depth))
    Z = depth[v, u]
    Xc = (np.linalg.inv(K) @ np.stack([u, v, np.ones_like(u)])) * Z    # 3 x M, camera frame
    return (R.T @ (Xc - t[:, None])).T                                  # M x 3, world frame


def depth_normals(depth, K):
    """Camera-frame normals from a depth map: cross product of neighbouring 3D points."""
    H, W = depth.shape
    v, u = np.mgrid[0:H, 0:W]
    X = np.linalg.inv(K) @ np.stack([u.ravel(), v.ravel(), np.ones(H * W)])
    X = (X * depth.ravel()).T.reshape(H, W, 3)
    du = X[1:-1, 2:] - X[1:-1, :-2]                  # along +u (right)
    dv = X[2:, 1:-1] - X[:-2, 1:-1]                  # along +v (down)
    n = -np.cross(du, dv)                            # right x down points away: flip to the camera
    n = n / np.linalg.norm(n, axis=-1, keepdims=True)
    out_ = np.full((H, W, 3), np.nan)
    out_[1:-1, 1:-1] = n
    return out_
```

The last function estimates normals from the depth map alone. Neighbouring pixels give two tangent vectors, the difference of the 3D points to the right and left and the difference of the points below and above; their cross product is normal to the surface. In the OpenCV frame ($x$ right, $y$ down, $z$ forward) "right $\times$ down" points away from the camera, so we flip it. Now the scene, the camera and the checks:

```python
def sdf_box(p, c, half):
    """Exact SDF of an axis-aligned box with centre c and half-sizes half."""
    q = np.abs(p - c) - half
    return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(-1), 0)


def sdf_scene(p):
    """The torus resting on a 4 m x 4 m slab (a table top)."""
    return np.minimum(sdf_torus(p), sdf_box(p, np.array([0, 0, -0.45]), np.array([2.0, 2.0, 0.05])))


W_IMG, H_IMG = 160, 120
K = np.array([[140.0, 0, 79.5], [0, 140.0, 59.5], [0, 0, 1]])
C_cam = np.array([0.6, -3.0, 1.8])
R_cam, t_cam = look_at(C_cam, np.zeros(3))
depth, rng_map = render_depth(K, R_cam, t_cam, W_IMG, H_IMG, sdf_scene)
pts = backproject(depth, K, R_cam, t_cam)
valid = np.isfinite(depth)
print("pixels hit: %d of %d, depth %.3f..%.3f m" % (valid.sum(), valid.size, depth[valid].min(), depth[valid].max()))
print("max |sdf| of back-projected points: %.1e" % np.abs(sdf_scene(pts)).max())
print("range / depth at the corner pixel: %.4f" % np.linalg.norm(np.linalg.inv(K) @ [0, 0, 1]))
with np.errstate(invalid="ignore"):
    nc = depth_normals(depth, K)                     # camera frame, NaN at the border and misses


def grad(f, p, e=1e-5):
    return np.stack([(f(p + e * d) - f(p - e * d)) / (2 * e) for d in np.eye(3)], -1)


v_, u_ = np.nonzero(valid)
n_true_c = np.full((H_IMG, W_IMG, 3), np.nan)
n_true_c[v_, u_] = grad(sdf_scene, pts) @ R_cam.T    # world -> camera: n_c = R n_w
ok = np.isfinite(nc).all(-1) & valid
ang = np.degrees(np.arccos(np.clip(np.sum(nc[ok] * n_true_c[ok], -1), -1, 1)))
print("normal error from depth: median %.2f deg, %.1f%% of pixels above 10 deg" % (np.median(ang), 100 * np.mean(ang > 10)))
print("float32 depth map: %.1f kB" % (W_IMG * H_IMG * 4 / 1000))
```

Output:

```text
pixels hit: 12065 of 19200, depth 2.288..5.115 m
max |sdf| of back-projected points: 7.7e-05
range / depth at the corner pixel: 1.2260
normal error from depth: median 0.02 deg, 2.7% of pixels above 10 deg
float32 depth map: 76.8 kB
```

The back-projected points lie on the surface to within the sphere-tracing tolerance. The normals are accurate almost everywhere, except on 2.7% of the pixels, which all sit on **depth discontinuities**: at the silhouette of the torus, the left neighbour is on the torus and the right neighbour on the table behind it, and the cross product produces a meaningless normal.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-depth.svg" caption="Left: the depth map $Z(u, v)$ of the torus on a table, $160 \times 120$ pixels, $f = 140$; white pixels see nothing within 10 m. Middle: normals estimated from the depth map by neighbour cross products, shown as colours (camera frame); the black pixels, 2.7% of the valid ones, have errors above 10° and all lie on depth discontinuities. Right: the 12,065 valid pixels back-projected with $\mathbf X\_w = R^\top(Z K^{-1}\tilde{\mathbf u} - \mathbf t)$ (5000 shown), with the camera frustum and its axes ($x$ red, $y$ green, $z$ blue). Points become sparser with distance: each pixel covers an area proportional to $Z^2$." %}

Real depth sensors make discontinuities worse. A time-of-flight or structured-light pixel that straddles an edge often returns a depth between the foreground and the background: a **flying pixel** that hangs in mid-air after back-projection. Filtering points whose depth differs strongly from their neighbours, or whose estimated normal is almost perpendicular to the ray, removes most of them.

**Costs.** A float32 depth map of $W \times H$ pixels takes $4WH$ bytes (76.8 kB here), and a 16-bit depth image in millimetres takes half. Its strengths: it is exactly what the sensor measured, its neighbourhood is free (the pixel grid), and 2D CNNs process it directly. Its weakness: it describes one viewpoint, with nothing behind the first surface. That is why multi-view systems fuse many depth maps into a volumetric representation (section 6 and [post 9]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})).

### 2.3 More than one depth per pixel

A depth map stores the *first* surface along each ray. Two classic extensions keep more:

- A **layered depth image** (LDI; Shade et al. 1998) stores a short list of (depth, colour) samples per pixel: the first surface, the one behind it, and so on. It can render a nearby view without holes where the first layer disoccludes something.
- A **multi-plane image** (MPI; Zhou et al. 2018) stores $D$ fronto-parallel planes at fixed depths in the reference camera, each a full RGBA image. Rendering is just alpha compositing, which made MPIs easy to predict with a CNN and was one of the stepping stones to NeRF.

### 2.4 Multi-plane images

The planes are placed **uniformly in inverse depth**. The reason is parallax: a point at depth $d$ shifts by $f b / d$ pixels when the camera moves by $b$ sideways, so planes evenly spaced in $1/d$ are evenly spaced in pixel shift. To render the MPI from the reference camera, composite the planes front to back with the "over" operator. With $\alpha\_i$ the opacity and $\mathbf c\_i$ the colour of plane $i$ at that pixel (plane $0$ nearest),

$$
\mathbf c = \sum_{i=0}^{D-1} \mathbf c_i\, \alpha_i \prod_{j<i} (1 - \alpha_j) .
$$

This is the same quadrature as NeRF's volume rendering ([neural rendering post 2]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})), with the samples fixed to planes. A **novel view** is rendered by warping each plane into the new camera and compositing again. A plane at depth $d$ with normal $\mathbf n$ in the reference frame induces a homography: for a new camera $\mathbf X' = R\mathbf X + \mathbf t$ relative to the reference, a point on the plane satisfies $\mathbf n^\top\mathbf X = d$, so $\mathbf t = \mathbf t\,\mathbf n^\top\mathbf X / d$ and

$$
\tilde{\mathbf u}' \sim K\Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)K^{-1}\tilde{\mathbf u} .
$$

This is the plane homography of [post 2]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}) seen from two cameras instead of one; [post 4]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }}) meets it again in two-view geometry. The sign of the $\mathbf t\,\mathbf n^\top$ term depends on whether the plane equation is written $\mathbf n^\top\mathbf X = d$ or $\mathbf n^\top\mathbf X + d = 0$, so check it numerically.

```python
def mpi_planes(near, far, D):
    """D fronto-parallel planes, evenly spaced in inverse depth (disparity)."""
    return 1.0 / np.linspace(1.0 / near, 1.0 / far, D)


def composite(rgb, alpha):
    """Front-to-back 'over' compositing of D layers (index 0 = nearest)."""
    T = np.cumprod(np.concatenate([[1.0], 1.0 - alpha[:-1]]))   # transmittance in front of layer i
    w = T * alpha
    return (w[:, None] * rgb).sum(0), w


d_planes = mpi_planes(1.0, 100.0, 32)
print("plane depths:", np.round(d_planes[:4], 3), "...", np.round(d_planes[-3:], 1))
f_px, base = 500.0, 0.1
print("disparity step between planes: %.2f px" % (f_px * base * (1 / d_planes[0] - 1 / d_planes[1])))
c_ray, w_ray = composite(np.array([[1.0, 0, 0], [0, 1.0, 0], [0, 0, 1.0]]), np.array([0.3, 0.5, 1.0]))
print("composited colour:", c_ray, "weights:", w_ray)
```

Output: plane depths `[1. 1.033 1.068 1.106] ... [13.5 23.8 100.]`, a disparity step of `1.60 px` between planes for $f = 500$ px and a 10 cm baseline, and for three layers with opacities $0.3, 0.5, 1$ the weights $0.3, 0.35, 0.35$. Half of the 32 planes lie within the first 2 m: inverse-depth spacing spends the planes where parallax is large.

The figure builds a small MPI from the RGB-D image of section 2.2. A pixel whose inverse depth falls between planes $i$ and $i+1$ goes to plane $i+1$ with $\alpha = 1$ and to plane $i$ with $\alpha = w$, the fraction of the way to plane $i$ in inverse depth, both with its colour, so that compositing reproduces the reference image exactly. Then we move the camera 0.5 m to the right and render the MPI by intersecting every new ray with every plane.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-mpi.svg" caption="A 16-plane MPI from the RGB-D image of section 2.2, planes from 2.2 m to 6 m evenly spaced in inverse depth. Second panel: four of the RGBA planes on a checkerboard (transparent). Third: the MPI rendered from a camera 0.5 m to the right; magenta pixels (12.7%) are transparent in every plane: parts of the table hidden behind the torus in the reference view and the strip outside the reference field of view. Elsewhere the mean colour error against the ray-traced view (right) is 0.006, and 1.7% of the pixels differ by more than 0.1, mostly along the torus outline where the two blended planes separate." %}

The magenta holes are the fundamental limitation. An MPI built from one RGB-D image contains nothing that the reference camera did not see. Learned MPIs predict plausible content for the hidden layers, which is what made them useful for view synthesis from stereo pairs.

## 3. Point clouds

### 3.1 What a point cloud is

A **point cloud** is a set $\\{\mathbf p\_i\\}\_{i=1}^n$, $\mathbf p\_i \in \mathbb R^3$, often with attributes: a colour, an intensity (LiDAR), a normal $\mathbf n\_i$, a timestamp. It is what LiDAR, back-projected depth maps (section 2.2) and SfM ([post 5]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})) produce. Two properties shape everything you do with it:

- It is a **set**: the order of the points carries no information. Any function of a point cloud that should describe the shape must be invariant to permutations (section 12).
- It has **no connectivity**. Which points are neighbours, which side is inside, and whether two nearby points lie on the same sheet or on two sheets close together (the two sides of a thin wall) are not stored.

Memory is $12n$ bytes for float32 positions, plus the attributes. A surfel (surface element; Pfister et al. 2000) adds a normal and a radius to each point, turning it into a small oriented disc that can be rendered without holes. Surfel maps are used in dense SLAM.

### 3.2 Neighbourhoods, normals and downsampling

Almost every point cloud algorithm starts with **nearest-neighbour queries**: the $k$ nearest points, or all points within radius $\varepsilon$. A k-d tree (`scipy.spatial.cKDTree`, nanoflann in C++) answers them in roughly logarithmic time. Normals are estimated by fitting a plane to the neighbours (PCA of the $3 \times 3$ neighbourhood covariance, smallest eigenvector), then oriented consistently; [graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) derives this.

Raw clouds are often too dense or unevenly dense, so they are **downsampled**:

- **Voxel-grid downsampling** keeps one point (usually the centroid) per occupied cell of a grid with spacing $s$. It is fast, and it makes the density roughly uniform at spacing $s$.
- **Farthest point sampling** (FPS) picks the first point arbitrarily, then repeatedly the point farthest from all points picked so far. The result covers the shape evenly. FPS costs $O(nm)$ for $m$ samples, and PointNet++ uses it to choose the centres of its local regions (section 12).

### 3.3 Measuring a point cloud: Chamfer distance and F-score

To compare a reconstruction $A$ with a reference $B$, both as point sets, define the distance of a point to a set, $d(\mathbf a, B) = \min\_{\mathbf b \in B}\lVert \mathbf a - \mathbf b\rVert$. Then:

- **Accuracy** asks how close the reconstruction is to the truth: the distances $d(\mathbf a, B)$ for $\mathbf a \in A$. **Completeness** asks how much of the truth is covered: $d(\mathbf b, A)$ for $\mathbf b \in B$.
- The **Chamfer distance** averages both directions. Conventions differ (sum or mean of the two directions, squared or unsquared distances), so always state which. We use the mean of the two mean distances:

$$
\mathrm{CD}(A, B) = \frac12\Big(\frac{1}{\lvert A\rvert}\sum_{\mathbf a \in A} d(\mathbf a, B) + \frac{1}{\lvert B\rvert}\sum_{\mathbf b \in B} d(\mathbf b, A)\Big).
$$

- The **F-score** at a threshold $\tau$ (Knapitsch et al. 2017, the Tanks and Temples benchmark) uses precision $P(\tau)$, the fraction of $A$ within $\tau$ of $B$, and recall $R(\tau)$, the fraction of $B$ within $\tau$ of $A$, and reports $F = 2PR/(P + R)$. Unlike the Chamfer mean, it is not dominated by a few far outliers, and it says separately whether the problem is wrong points or missing points.

```python
from scipy.spatial import cKDTree


def chamfer_fscore(A, B, tau):
    """Symmetric Chamfer distance and F-score at threshold tau between point sets A and B."""
    d_ab = cKDTree(B).query(A)[0]                    # every point of A to its nearest point in B
    d_ba = cKDTree(A).query(B)[0]
    precision = np.mean(d_ab < tau)                  # how much of A lies near B (accuracy)
    recall = np.mean(d_ba < tau)                     # how much of B is covered by A (completeness)
    f = 2 * precision * recall / max(precision + recall, 1e-12)
    return 0.5 * (d_ab.mean() + d_ba.mean()), precision, recall, f


ref = P_true                                          # 200k exact samples stand in for the surface
rng = np.random.default_rng(1)
cases = {
    "2k exact": sample_torus(2_000, rng)[0],
    "20k exact": sample_torus(20_000, rng)[0],
    "20k noisy": sample_torus(20_000, rng)[0] + rng.normal(0, 0.02, (20_000, 3)),
}
hole = sample_torus(20_000, rng)[0]
cases["20k, hole"] = hole[hole[:, 0] < 0.8]          # a scanner never saw the +x side
for name, A in cases.items():
    cd, p, r, f = chamfer_fscore(A, ref, tau=0.02)
    print("%-10s n=%6d  CD=%.4f  precision=%.3f recall=%.3f F=%.3f" % (name, len(A), cd, p, r, f))


def farthest_point_sampling(P, m, first=0):
    """Greedy FPS: each new sample is the point farthest from all samples chosen so far."""
    idx = np.zeros(m, dtype=int); idx[0] = first
    d = np.linalg.norm(P - P[first], axis=1)
    for i in range(1, m):
        idx[i] = np.argmax(d)
        d = np.minimum(d, np.linalg.norm(P - P[idx[i]], axis=1))
    return idx


cloud = sample_torus(20_000, np.random.default_rng(2))[0]
i_fps = farthest_point_sampling(cloud, 256)
i_rnd = np.random.default_rng(3).choice(len(cloud), 256, replace=False)
for name, idx in (("random", i_rnd), ("FPS", i_fps)):
    gap = cKDTree(cloud[idx]).query(cloud)[0]        # distance of every point to its nearest sample
    print("%-6s 256 samples: mean gap %.3f, largest gap %.3f" % (name, gap.mean(), gap.max()))
```

Output:

```text
2k exact   n=  2000  CD=0.0247  precision=1.000 recall=0.146 F=0.255
20k exact  n= 20000  CD=0.0092  precision=1.000 recall=0.795 F=0.886
20k noisy  n= 20000  CD=0.0184  precision=0.667 recall=0.538 F=0.596
20k, hole  n= 16116  CD=0.0399  precision=1.000 recall=0.643 F=0.783
random 256 samples: mean gap 0.118, largest gap 0.328
FPS    256 samples: mean gap 0.096, largest gap 0.193
```

Read the table row by row. Exact samples have perfect precision, but 2000 of them leave most of the surface farther than $\tau = 0.02$ from any sample, so recall is low: **a sparse but correct cloud scores as incomplete**. Noise of $\sigma = 0.02$ hurts precision and recall together. A hole hurts only recall, and it raises the Chamfer distance more than the noise does, because the missing region contributes large distances. The last two lines show that FPS reduces the largest gap from 0.328 to 0.193 for the same 256 points.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-point-clouds.svg" localized="true" caption="Left and middle: 256 points (red) chosen from 20,000 surface samples at random and by farthest point sampling; the grey cloud is shaded by the distance to the nearest chosen point (darker = larger gap). Random sampling leaves clusters and holes (largest gap 0.328), FPS spreads the points evenly (0.193). Right: precision, recall and F-score at $\tau = 0.02$ against 200,000 reference samples for four reconstructions: 2000 exact samples, 20,000 exact samples, 20,000 samples with Gaussian noise $\sigma = 0.02$, and 20,000 samples with the region $x > 0.8$ removed." %}

## 4. Meshes

### 4.1 Structure and topology

A **triangle mesh** is a vertex array $V \in \mathbb R^{n\_V \times 3}$ and a face array $F \in \mathbb N^{n\_F \times 3}$ of vertex indices ([graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) covers half-edge structures, manifoldness and the Euler characteristic $\chi = V - E + F$). Compared with a point cloud, a mesh adds **connectivity**, and with it a surface between the samples: you can measure area, rasterize without holes, parameterize and texture it, and simulate on it. That is why the final output of most reconstruction pipelines, and the input of every game engine, is a mesh.

The price is **topology**. A mesh fixes how the surface is connected. Merging two blobs or opening a hole means re-meshing, which is why optimization methods that must change shape freely (fusion, neural fields) work with implicit functions and extract a mesh only at the end, with marching cubes.

### 4.2 How accurate is a mesh?

A mesh with vertices exactly on a smooth surface is a piecewise-linear interpolant, and its error is the **sagitta**: a chord of length $s$ across a circle of radius $\rho$ bulges away from the arc by

$$
\delta = \rho\big(1 - \cos(\Delta/2)\big) \approx \frac{s^2}{8\rho}, \qquad \Delta \text{ the angle the chord spans}, \ s = 2\rho\sin(\Delta/2) \approx \rho\Delta .
$$

So the error falls with the **square** of the edge length. For a surface of area $A$ meshed with edges of length $s$, the number of triangles is $F \approx 2A/(\tfrac{\sqrt 3}{2}s^2) \propto s^{-2}$, hence $\delta \propto F^{-1}$: doubling the triangle count halves the error. For our torus meshed as an $n \times m$ grid of the angles $(\varphi, \theta)$, the largest bulge comes from the outer equator, a circle of radius $R + r$ divided into $n$ chords, plus the tube circle of radius $r$ divided into $m$ chords: $\delta\_{\max} \lesssim (R + r)(1 - \cos\frac{\pi}{n}) + r(1 - \cos\frac{\pi}{m})$.

To measure the error we also need to **sample a mesh uniformly**, which is how meshes are compared with point clouds in every benchmark. Pick a triangle with probability proportional to its area, then a point inside it with barycentric coordinates $(1 - \sqrt{s},\ \sqrt{s}(1 - t),\ \sqrt{s}\,t)$ for $s, t$ uniform in $[0, 1]$; the square root compensates for the triangle being narrower near its apex.

```python
def torus_mesh(n, m):
    """Triangle mesh of the torus: n segments around the ring, m around the tube."""
    PH, TH = np.meshgrid(2 * np.pi * np.arange(n) / n, 2 * np.pi * np.arange(m) / m, indexing="ij")
    rho = R_MAJ + R_MIN * np.cos(TH)
    V = np.stack([rho * np.cos(PH), rho * np.sin(PH), R_MIN * np.sin(TH)], -1).reshape(-1, 3)
    i, j = np.meshgrid(np.arange(n), np.arange(m), indexing="ij")
    a, b = i * m + j, (i + 1) % n * m + j            # the four corners of quad (i, j)
    c, d = (i + 1) % n * m + (j + 1) % m, i * m + (j + 1) % m
    F = np.concatenate([np.stack([a, b, c], -1).reshape(-1, 3), np.stack([a, c, d], -1).reshape(-1, 3)])
    return V, F


def sample_mesh(V, F, n, rng):
    """n points uniformly distributed over the mesh area (area-weighted face choice)."""
    A, B, C = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(B - A, C - A), axis=1)
    f = rng.choice(len(F), n, p=area / area.sum())
    s, t = np.sqrt(rng.uniform(size=n)), rng.uniform(size=n)   # sqrt makes it uniform in area
    return ((1 - s)[:, None] * A[f] + (s * (1 - t))[:, None] * B[f] + (s * t)[:, None] * C[f]), area.sum()


rng = np.random.default_rng(4)
for n, m in ((12, 6), (24, 12), (48, 24), (96, 48)):
    V, F = torus_mesh(n, m)
    S, area = sample_mesh(V, F, 200_000, rng)
    sag = (R_MAJ + R_MIN) * (1 - np.cos(np.pi / n)) + R_MIN * (1 - np.cos(np.pi / m))
    print("n=%2d m=%2d  V=%5d F=%5d  %6.1f kB  area err %+.2f%%  max dev %.4f (sag bound %.4f)  mean dev %.4f"
          % (n, m, len(V), len(F), (12 * len(V) + 12 * len(F)) / 1000, 100 * (area / AREA - 1),
             np.abs(sdf_torus(S)).max(), sag, np.abs(sdf_torus(S)).mean()))
V, F = torus_mesh(24, 12)
E = np.unique(np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1), axis=0)
print("Euler characteristic V - E + F = %d - %d + %d = %d" % (len(V), len(E), len(F), len(V) - len(E) + len(F)))
```

Output:

```text
n=12 m= 6  V=   72 F=  144     2.6 kB  area err -7.20%  max dev 0.0923 (sag bound 0.1013)  mean dev 0.0436
n=24 m=12  V=  288 F=  576    10.4 kB  area err -1.84%  max dev 0.0250 (sag bound 0.0256)  mean dev 0.0114
n=48 m=24  V= 1152 F= 2304    41.5 kB  area err -0.46%  max dev 0.0064 (sag bound 0.0064)  mean dev 0.0029
n=96 m=48  V= 4608 F= 9216   165.9 kB  area err -0.12%  max dev 0.0016 (sag bound 0.0016)  mean dev 0.0007
Euler characteristic V - E + F = 288 - 864 + 576 = 0
```

Each doubling of $n$ and $m$ multiplies the triangle count by 4 and divides the error by 4, exactly as the sagitta predicts. The area is always too small, because chords cut inside the curved surface. The Euler characteristic is 0, as it must be for a torus.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-mesh.svg" caption="Torus meshes with $12 \times 6$, $24 \times 12$ and $48 \times 24$ quads (two triangles each), coloured by the distance of each triangle's centroid from the true surface; the error is largest on the outer equator, where the ring circle is largest. Right: the largest deviation of 100,000 area-weighted samples against the triangle count $F$, from $6 \times 3$ to $192 \times 96$, with the sagitta bound (dashed) and the slope $F^{-1}$ (dotted). At $F = 9216$ (166 kB) the largest error is 0.0016, 0.4% of the tube radius." %}

Two practical notes. **Adaptive meshes** put small triangles where curvature is high and large ones where the surface is flat; the $F^{-1}$ law then holds with a smaller constant, which is what mesh simplification ([graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}), quadric error metrics) achieves. And meshes from reconstruction are rarely perfect: they have holes, flipped faces, non-manifold edges and self-intersections, and a "watertight" check (every edge shared by exactly two faces) is the first thing to run before 3D printing or simulation.

## 5. Voxels, occupancy grids and octrees

### 5.1 Dense occupancy grids

Divide a bounding box into $N^3$ cubes of side $h$ and store one value per cube. In an **occupancy grid** the value says whether the cube is inside the object (or, in robotics, whether it is occupied by an obstacle). The simplest rule marks a voxel occupied if its centre is inside, $f(\mathbf c\_{ijk}) < 0$. Voxels are the 3D analogue of pixels: the structure is regular, so lookups are a single index computation, neighbours are $(i \pm 1, j, k)$, and 3D CNNs can convolve them.

```python
import itertools

LO, HI = -1.5, 1.5                                   # the cube that holds the torus


def grid_centres(N):
    h = (HI - LO) / N
    c = LO + h * (np.arange(N) + 0.5)
    return np.stack(np.meshgrid(c, c, c, indexing="ij"), -1), h


for N in (16, 32, 64, 128):
    X, h = grid_centres(N)
    occ = sdf_torus(X) < 0                           # occupancy: is the voxel centre inside?
    pad = np.pad(occ, 1)
    nb_empty = sum(~np.roll(pad, s, a)[1:-1, 1:-1, 1:-1] for a in range(3) for s in (-1, 1))
    surf = occ & (nb_empty > 0)                      # occupied with an empty face neighbour
    print("N=%3d  occupied %7d (%.2f%%)  surface %6d  volume err %+.2f%%  bits %7.1f kB  floats %8.1f kB"
          % (N, occ.sum(), 100 * occ.mean(), surf.sum(), 100 * (occ.sum() * h ** 3 / VOLUME - 1),
             N ** 3 / 8 / 1000, 4 * N ** 3 / 1000))
```

The loop prints:

```text
N= 16  occupied     472 (11.52%)  surface    312  volume err -1.49%  bits     0.5 kB  floats     16.4 kB
N= 32  occupied    3784 (11.55%)  surface   1408  volume err -1.28%  bits     4.1 kB  floats    131.1 kB
N= 64  occupied   30544 (11.65%)  surface   5928  volume err -0.39%  bits    32.8 kB  floats   1048.6 kB
N=128  occupied  245408 (11.70%)  surface  24144  volume err +0.04%  bits   262.1 kB  floats   8388.6 kB
```

Two observations. First, the **volume** is estimated well even at $N = 16$ (1.5% error), because errors on the two sides of the surface cancel. The **surface** position is a different matter: the voxel boundary is a staircase whose distance to the true surface is somewhat below $h/4$ on average and up to about $0.8h$ at the corners of the steps (at most $\sqrt 3\, h/2$), so halving the error requires 8 times the memory (section 6 measures this). Second, the number of surface voxels grows as $N^2$ (it quadruples from one row to the next) while the grid grows as $N^3$. At $N = 128$ only 1% of the voxels touch the surface. A dense grid spends almost all of its memory on empty space and on the interior, and storing float32 values instead of bits costs 32 times more.

### 5.2 Probabilistic occupancy and log-odds

Robot maps do not know occupancy for certain. Each voxel stores the probability $p$ that it is occupied, updated from sensor rays: a voxel where a ray *ends* is evidence for "occupied", a voxel a ray *passes through* is evidence for "free". Bayes' rule for independent measurements becomes an addition in **log-odds** $l = \log\frac{p}{1 - p}$:

$$
l \leftarrow l + \log\frac{P(\text{occ} \mid z)}{1 - P(\text{occ} \mid z)} - l_0 ,
$$

where $l\_0$ is the prior (0 for $p = 0.5$). With a sensor model $P(\text{occ} \mid \text{hit}) = 0.7$ and $P(\text{occ} \mid \text{pass}) = 0.4$, a hit adds $\log(0.7/0.3) = 0.847$ and a pass adds $\log(0.4/0.6) = -0.405$. Clamping $l$ to an interval (here $[-2, 3.5]$) keeps the map able to change when the world changes. The last lines of the code block in section 5.3 print, for three hits then one pass:

```text
hit  l = +0.847  p = 0.700
hit  l = +1.695  p = 0.845
hit  l = +2.542  p = 0.927
miss l = +2.136  p = 0.894
```

OctoMap (Hornung et al. 2013) stores exactly this, in an octree.

### 5.3 Octrees: spend memory where the surface is

An **octree** starts with one cube and splits a cube into 8 children only where needed. For a surface, "needed" means the surface may pass through the cube. The SDF answers that question for free: because $\lvert f \rvert$ is a distance, if $\lvert f(\mathbf c)\rvert$ at the cube centre exceeds the half-diagonal $\sqrt 3\, h/2$, no surface point is inside the cube. This is the same Lipschitz argument that makes sphere tracing safe.

```python
OFFS = np.array(list(itertools.product((-1, 1), repeat=3)), float)   # the 8 child directions


def octree_levels(sdf, max_depth):
    """Node count per level of an octree that only splits cells the surface may cross."""
    centres, half = np.zeros((1, 3)), (HI - LO) / 2
    counts = []
    for depth_ in range(max_depth + 1):
        counts.append(len(centres))
        if depth_ == max_depth:
            break
        # 1-Lipschitz SDF: if |f(centre)| > half-diagonal, the surface cannot enter the cell
        cross = np.abs(sdf(centres)) <= np.sqrt(3) * half
        centres = (centres[cross][:, None, :] + 0.5 * half * OFFS[None]).reshape(-1, 3)
        half = half / 2
    return counts


cnt = octree_levels(sdf_torus, 8)
print("octree nodes per level:", cnt)
print("total %d nodes vs %d dense voxels at 256^3 (%.2f%%)" % (sum(cnt), 256 ** 3, 100 * sum(cnt) / 256 ** 3))


def logodds(p):
    return np.log(p / (1 - p))


l_hit, l_miss = logodds(0.7), logodds(0.4)           # sensor model: P(occ | hit), P(occ | pass-through)
l = 0.0                                              # prior p = 0.5
for z in ("hit", "hit", "hit", "miss"):
    l = np.clip(l + (l_hit if z == "hit" else l_miss), -2.0, 3.5)
    print("%-4s l = %+.3f  p = %.3f" % (z, l, 1 / (1 + np.exp(-l))))
```

Output: nodes per level `[1, 8, 64, 256, 1664, 6784, 25728, 95936, 402176]`, in total `532617 nodes vs 16777216 dense voxels at 256^3 (3.17%)`. From level 5 on, each level has about 4 times as many nodes as the previous one, not 8: the octree grows with the surface area, as $4^L$, while the dense grid grows with the volume, as $8^L$. The deeper the tree, the larger the saving in cells.

Whether that saves *bytes* depends on what a dense cell costs. A pointer-based node takes several bytes; at 8 bytes per node, the octree down to level 7 (130,441 nodes, the resolution of a $128^3$ grid) takes 1.04 MB, four times more than the bit-packed $128^3$ occupancy grid (262 kB), but eight times less than a $128^3$ grid of float32 values (8.4 MB). Robot maps store a float log-odds per cell and TSDFs store a distance and a weight, so against the grids they would otherwise need, the octree wins at once, and its advantage grows by a factor of 2 with every further level.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-octree.svg" localized="true" caption="Left: a quadtree (the 2D octree) of the torus cross-section $y = 0$, two discs of radius 0.4, split down to depth 6 only where the half-diagonal test says the boundary may enter a cell: 448 leaves instead of $64^2 = 4096$ cells. Right: node counts per level of the 3D octree (depth 8, finest cell $3/256 \approx 0.012$) against the $8^L$ cells of a dense grid; the octree follows $4^L$, the growth of surface area. At level 8: 402,176 nodes against 16.8 million." %}

The saving has costs. Lookups follow pointers from the root ($L$ steps instead of one index), neighbours are harder to find, and inserting data can restructure the tree. GPU systems often prefer a flatter scheme: **voxel hashing** (Nießner et al. 2013) allocates small dense blocks of voxels only near observed surfaces and finds them through a hash table on the block coordinates. Lookups stay $O(1)$ and memory follows the surface, like an octree with exactly one level of indirection. Section 10 measures this "sparse block" layout.

## 6. Signed distance fields and TSDFs

### 6.1 Why store distances instead of occupancy

An SDF stores, at each grid vertex, the signed distance $f$ instead of one bit. A grid of distances tells you not only *whether* the surface is between two vertices but *where*: along an edge from $f\_a < 0$ to $f\_b > 0$ the zero crossing is at the fraction $t = f\_a/(f\_a - f\_b)$, exactly as in marching squares and marching cubes ([graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})). Between vertices the field is reconstructed by **trilinear interpolation**. For a point with fractional cell coordinates $(\xi, \eta, \zeta) \in [0, 1]^3$ and corner values $f\_{abc}$, $a, b, c \in \\{0, 1\\}$,

$$
\hat f = \sum_{a, b, c \in \{0, 1\}} f_{abc}\; \xi^{a}(1 - \xi)^{1-a}\, \eta^{b}(1 - \eta)^{1-b}\, \zeta^{c}(1 - \zeta)^{1-c} .
$$

Linear interpolation of a smooth function has error proportional to $h^2$ times its second derivative. A distance field is linear along its gradient direction, so the error comes only from the curvature of the surface, and the zero level set of $\hat f$ is typically within a small fraction of a voxel of the true surface: **sub-voxel accuracy from the same $N^3$ grid**. Occupancy throws this information away, and its error is proportional to $h$.

```python
def sdf_grid(N):
    """The SDF sampled at the (N+1)^3 vertices of an N^3 grid."""
    g = np.linspace(LO, HI, N + 1)
    return sdf_torus(np.stack(np.meshgrid(g, g, g, indexing="ij"), -1)), (HI - LO) / N


def trilinear(G, h, p):
    """Trilinear interpolation of grid values G at points p (M x 3)."""
    s = (p - LO) / h
    i = np.clip(np.floor(s).astype(int), 0, G.shape[0] - 2)
    f = s - i
    val = 0.0
    for c in itertools.product((0, 1), repeat=3):
        w = np.prod([f[:, k] if c[k] else 1 - f[:, k] for k in range(3)], axis=0)
        val = val + w * G[i[:, 0] + c[0], i[:, 1] + c[1], i[:, 2] + c[2]]
    return val


def zero_crossings(G, h):
    """Points where the field changes sign along grid edges: the vertices marching cubes places."""
    out_ = []
    for ax in range(3):
        f0 = np.take(G, np.arange(G.shape[ax] - 1), axis=ax)
        f1 = np.take(G, np.arange(1, G.shape[ax]), axis=ax)
        idx = np.argwhere((f0 < 0) != (f1 < 0))
        a, b = f0[tuple(idx.T)], f1[tuple(idx.T)]
        p = idx.astype(float)
        p[:, ax] += a / (a - b)                      # linear interpolation along the edge
        out_.append(LO + h * p)
    return np.concatenate(out_)


G16, h16 = sdf_grid(16)
x_q = np.array([[0.62, 0.05, 0.11]])
print("at", x_q[0], ": trilinear %.4f, exact %.4f" % (trilinear(G16, h16, x_q)[0], sdf_torus(x_q)[0]))
for N in (16, 32, 64, 128):
    G, h = sdf_grid(N)
    Z = zero_crossings(G, h)
    print("N=%3d  h=%.4f  crossings %6d  mean |sdf| %.5f  max %.5f  |f_hat| at true surface: mean %.5f"
          % (N, h, len(Z), np.abs(sdf_torus(Z)).mean(), np.abs(sdf_torus(Z)).max(),
             np.abs(trilinear(G, h, P_true)).mean()))
print("TSDF band: voxels with |sdf| < 3h at N=128: %.2f%% of the grid"
      % (100 * np.mean(np.abs(sdf_grid(128)[0]) < 3 * 3.0 / 128)))
```

Output:

```text
at [0.62 0.05 0.11] : trilinear -0.0001, exact -0.0063
N= 16  h=0.1875  crossings    720  mean |sdf| 0.00248  max 0.00914  |f_hat| at true surface: mean 0.00746
N= 32  h=0.0938  crossings   2664  mean |sdf| 0.00058  max 0.00266  |f_hat| at true surface: mean 0.00186
N= 64  h=0.0469  crossings  10392  mean |sdf| 0.00014  max 0.00067  |f_hat| at true surface: mean 0.00046
N=128  h=0.0234  crossings  42168  mean |sdf| 0.00004  max 0.00017  |f_hat| at true surface: mean 0.00012
TSDF band: voxels with |sdf| < 3h at N=128: 8.03% of the grid
```

The zero crossings (the vertices that marching cubes would create) are off the true surface by 0.00248 on average at $N = 16$, which is 1.3% of a voxel, and each halving of $h$ divides the error by about 4. Conversely, the interpolated field $\hat f$ evaluated on the true surface (where the exact $f$ is zero) is off by 0.00746 at $N = 16$, again falling as $h^2$. The single query point shows the same effect: at a point just inside the tube, interpolation between vertices $0.19$ apart is off by $0.006$.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-sdf-vs-occupancy.svg" localized="true" caption="The cross-section $y = 0$ of the torus (two discs of radius 0.4) at $16^3$ resolution. Left: occupancy, the voxels whose centres are inside; the boundary is a staircase. Middle: the SDF sampled at the $17^2$ grid vertices of the plane (dots), interpolated bilinearly, with its zero level (orange) on top of the true circles (dashed, almost hidden). Right: the mean two-sided surface error against the voxel size $h$ in 3D. Occupancy stays near $h/5$, between $0.17h$ and $0.22h$ (from 0.032 at $N = 16$ to 0.0046 at $N = 128$); the interpolated SDF follows $h^2$ (from 0.020 at $N = 8$ to 0.00008 at $N = 128$)." %}

The price is memory, 32 bits per vertex instead of 1 bit per voxel, and two limitations. **Thin structures** thinner than about two voxels can vanish, because no vertex lands inside them and the sign never changes. **Sharp edges and corners** are rounded off, because trilinear interpolation cannot represent a crease inside a cell (marching cubes variants such as dual contouring store gradients to fix this).

An SDF has two more advantages that matter in practice. Its gradient is the surface normal, $\mathbf n = \nabla f / \lVert \nabla f\rVert$, available everywhere, not only on the surface. And it satisfies the **eikonal equation** $\lVert\nabla f\rVert = 1$ almost everywhere, a constraint that neural SDFs use as a regularizer (section 7).

### 6.2 Truncated SDFs

When the SDF is built from depth maps, as in KinectFusion (Newcombe et al. 2011) and the volumetric method of Curless and Levoy (1996) that it builds on, we do not know the true distance to the surface. We only know the **projective distance** along each camera ray, $Z\_{\text{measured}}(u, v) - Z\_c(\mathbf x)$ for a voxel $\mathbf x$ that projects to pixel $(u, v)$. This is a good approximation of the signed distance only near the surface, and far behind the surface it is meaningless (that space was never observed). So the value is **truncated**:

$$
\text{TSDF}(\mathbf x) = \mathrm{clamp}\Big(\frac{Z_{\text{measured}}(u, v) - Z_c(\mathbf x)}{\mu},\ -1,\ 1\Big),
$$

with a truncation distance $\mu$ of a few voxels. Each voxel also stores a weight, and new depth maps are fused by a running weighted average; [post 7]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) derives the fusion and [post 9]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) runs it end to end, with a widget. (Sign conventions vary: here the TSDF is positive in front of the surface, in free space, and negative behind it, matching an SDF that is positive outside.)

Truncation has a memory consequence. Only voxels within $\mu$ of the surface carry information, so only those need storage. In our torus at $N = 128$, voxels within $3h$ of the surface are 8.03% of the grid. Voxel hashing stores exactly this band in $8^3$ blocks, and section 10 shows what that buys.

A full, untruncated distance field (a Euclidean SDF, **ESDF**) is what motion planners want, because they need the distance to the nearest obstacle from anywhere in free space. Voxblox (Oleynikova et al. 2017) builds an ESDF incrementally from a TSDF for drone planning.

## 7. Neural fields

### 7.1 A network as a function of space

Instead of sampling $f$ on a grid, a **neural field** represents it with a network $f\_\theta : \mathbb R^3 \to \mathbb R$ (or to occupancy, density and colour): a coordinate goes in, a value comes out. The main families:

- **Occupancy networks** (Mescheder et al. 2019) output the probability that $\mathbf x$ is inside; the surface is the level set of that probability at a threshold $\tau$, such as $0.5$.
- **DeepSDF** (Park et al. 2019) outputs a signed distance. It conditions the network on a per-shape latent code $\mathbf z$, $f\_\theta(\mathbf x, \mathbf z)$, so one network represents a whole category of shapes, and fitting a new shape means optimizing only $\mathbf z$.
- **NeRF** (Mildenhall et al. 2020) outputs density and view-dependent colour and is trained through volume rendering from images ([neural rendering post 2]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})). Its geometry is a density field rather than a surface; NeuS-style methods in [post 9]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) turn it back into an SDF.

What these share is that the representation is **continuous** (query any $\mathbf x$, at any resolution), **differentiable** in both $\mathbf x$ and $\theta$ (so it can be fitted through a renderer), and **memory independent of resolution** (the parameter count does not grow with the output resolution).

### 7.2 Spectral bias and positional encoding

A plain multilayer perceptron fitted to a function learns its low frequencies first and its high frequencies very slowly, the **spectral bias** of neural networks (Rahaman et al. 2019). For shapes this means rounded corners and lost detail. The standard cure, used by NeRF and analysed by Tancik et al. (2020), is to feed the network a **positional encoding** of the input,

$$
\gamma(\mathbf x) = \big(\mathbf x,\ \sin(2^0\pi\mathbf x),\ \cos(2^0\pi\mathbf x),\ \dots,\ \sin(2^{L-1}\pi\mathbf x),\ \cos(2^{L-1}\pi\mathbf x)\big),
$$

so that high frequencies are available as inputs instead of having to be built from low ones.

We test this in 2D, where a small NumPy network trains in seconds. The shape is a gear with 16 teeth (64 corners), whose exact SDF we compute as the distance to the nearest polygon edge, with the sign from the even-odd rule. The network has two hidden layers of 64 ReLU units and is trained with Adam on the mean squared SDF error at random points in $[-1, 1]^2$. The backward pass is written out by hand, so the code is a complete, if small, neural field.

```python
def sdf_polygon(p, Vp):
    """Exact SDF of a closed polygon Vp (k x 2) at points p (M x 2); negative inside."""
    d = np.full(len(p), np.inf); inside = np.zeros(len(p), bool)
    for a, b in zip(Vp, np.roll(Vp, 1, axis=0)):
        e, w = b - a, p - a
        t = np.clip(w @ e / (e @ e), 0, 1)
        d = np.minimum(d, np.linalg.norm(w - t[:, None] * e, axis=1))
        crosses = (a[1] > p[:, 1]) != (b[1] > p[:, 1])                  # even-odd rule
        x_hit = a[0] + (p[:, 1] - a[1]) * e[0] / (e[1] + 1e-300)
        inside ^= crosses & (p[:, 0] < x_hit)
    return np.where(inside, -d, d)


a_g = 2 * np.pi * (np.arange(64) + 0.5) / 64          # a gear with 16 teeth: 64 corners
GEAR = np.stack([np.cos(a_g), np.sin(a_g)], 1) * np.where(np.arange(64) // 2 % 2, 0.62, 0.8)[:, None]


def encode(x, L):
    """NeRF-style positional encoding: x, sin(2^k pi x), cos(2^k pi x) for k < L."""
    feats = [x]
    for k in range(L):
        feats += [np.sin(2 ** k * np.pi * x), np.cos(2 ** k * np.pi * x)]
    return np.concatenate(feats, 1)


def train_field(L, width=64, steps=4000, batch=1024, lr=3e-3, seed=0):
    """f(x) = W3 relu(W2 relu(W1 enc(x) + b1) + b2) + b3, fitted to the SDF with Adam."""
    rng = np.random.default_rng(seed)
    dims = [2 + 4 * L, width, width, 1]
    params = []
    for i in range(3):
        params += [rng.normal(0, np.sqrt(2 / dims[i]), (dims[i], dims[i + 1])), np.zeros(dims[i + 1])]
    m = [np.zeros_like(q) for q in params]; v = [np.zeros_like(q) for q in params]
    for it in range(1, steps + 1):
        x = rng.uniform(-1, 1, (batch, 2))
        y = sdf_polygon(x, GEAR)[:, None]
        h0 = encode(x, L)
        z1 = h0 @ params[0] + params[1]; h1 = np.maximum(z1, 0)
        z2 = h1 @ params[2] + params[3]; h2 = np.maximum(z2, 0)
        pred = h2 @ params[4] + params[5]
        g = 2 * (pred - y) / batch                                     # d(MSE)/d(pred)
        g2 = (g @ params[4].T) * (z2 > 0); g1 = (g2 @ params[2].T) * (z1 > 0)
        grads = [h0.T @ g1, g1.sum(0), h1.T @ g2, g2.sum(0), h2.T @ g, g.sum(0)]
        a_t = lr * (0.05 ** (it / steps))                              # exponential decay to 5%
        for q, gq, mq, vq in zip(params, grads, m, v):                 # Adam
            mq *= 0.9; mq += 0.1 * gq; vq *= 0.999; vq += 0.001 * gq ** 2
            q -= a_t * (mq / (1 - 0.9 ** it)) / (np.sqrt(vq / (1 - 0.999 ** it)) + 1e-8)

    def f(x):
        h = np.maximum(encode(x, L) @ params[0] + params[1], 0)
        return (np.maximum(h @ params[2] + params[3], 0) @ params[4] + params[5])[:, 0]
    return f, sum(q.size for q in params)


g2d = np.linspace(-1, 1, 201)
XY = np.stack(np.meshgrid(g2d, g2d, indexing="xy"), -1).reshape(-1, 2)
SDF_GEAR = sdf_polygon(XY, GEAR)
band = np.abs(SDF_GEAR) < 0.05                       # points within 0.05 of the boundary


def report(name, pred, n_floats):
    err = np.abs(pred - SDF_GEAR)
    iou = np.mean((pred < 0) & (SDF_GEAR < 0)) / np.mean((pred < 0) | (SDF_GEAR < 0))
    print("%-14s %5d floats  mean |error| %.4f  near the boundary %.4f  IoU %.4f"
          % (name, n_floats, err.mean(), err[band].mean(), iou))


FIELDS = {}
for L in (0, 2, 6):
    f, n_par = train_field(L)
    FIELDS[L] = f
    report("MLP, L=%d" % L, f(XY), n_par)

from scipy.interpolate import RegularGridInterpolator

gn = np.linspace(-1, 1, 70)                          # 70 x 70 = 4900 floats, like the L=2 MLP
GN = np.stack(np.meshgrid(gn, gn, indexing="ij"), -1).reshape(-1, 2)
grid_f = RegularGridInterpolator((gn, gn), sdf_polygon(GN, GEAR).reshape(70, 70))
report("grid 70x70", grid_f(XY), 70 * 70)
```

Output:

```text
MLP, L=0        4417 floats  mean |error| 0.0107  near the boundary 0.0175  IoU 0.9056
MLP, L=2        4929 floats  mean |error| 0.0074  near the boundary 0.0074  IoU 0.9632
MLP, L=6        5953 floats  mean |error| 0.0098  near the boundary 0.0109  IoU 0.9435
grid 70x70      4900 floats  mean |error| 0.0007  near the boundary 0.0008  IoU 0.9952
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-neural-field.svg" localized="true" caption="A 2D neural SDF of a gear with 16 teeth, trained for 4000 Adam steps; grey: the error $\vert f\_\theta - f\vert$ (black = 0.04 or more), black line: the true outline, red line: the zero level of the model. Without positional encoding ($L = 0$) the network rounds the teeth off (error near the boundary 0.0175, IoU 0.906). With $L = 2$ frequency bands the teeth appear (0.0074, IoU 0.963). With $L = 6$ the fit becomes noisy everywhere (0.0109). Right: an SDF grid of $70 \times 70$ values, as many numbers as the $L = 2$ network, interpolated bilinearly: ten times more accurate (0.0008, IoU 0.995)." %}

Three lessons, all of which carry over to 3D.

1. **Spectral bias is real.** Without the encoding, the network cannot produce the teeth in 4000 steps.
2. **More frequencies is not better.** With $L = 6$, the network can represent frequencies far above what the shape needs. Every step draws fresh random points, so this is not overfitting to a fixed training set: within the fixed budget of 4000 steps, the high-frequency components are not damped out and remain as ripples over the whole field, and the optimization itself becomes harder (exercise 5). This is why later methods use fewer bands, anneal them in during training (coarse to fine), or use other activations, such as SIREN's sines (Sitzmann et al. 2020).
3. **A single small network is not a compact way to store one shape.** The plain grid of the same size wins by an order of magnitude. Neural fields earn their place elsewhere: when the field is high-dimensional (NeRF's 5D radiance), when one network with latent codes represents many shapes (DeepSDF), when the representation must be fitted through a differentiable renderer, and when a network is combined with a grid. Hybrids such as Instant-NGP's multiresolution hash grid ([neural rendering post 3]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})) store features in grids and use a tiny MLP only to decode them, which gets the accuracy of grids and the flexibility of networks.

For neural SDFs, nothing in a plain regression loss forces $f\_\theta$ to be a distance away from the training points. The **eikonal loss** $\mathbb E\_{\mathbf x}\big(\lVert\nabla\_{\mathbf x} f\_\theta(\mathbf x)\rVert - 1\big)^2$ (IGR, Gropp et al. 2020) adds that constraint, which also makes it possible to fit an SDF to a raw point cloud, with $f\_\theta = 0$ at the points as the only data term.

## 8. 3D Gaussians

### 8.1 The primitive

[3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) (Kerbl et al. 2023) represents a scene as a set of anisotropic Gaussians. Each has a mean $\boldsymbol\mu \in \mathbb R^3$, a covariance $\Sigma = R S S^\top R^\top$ (rotation $R$ from a unit quaternion, scales $S = \mathrm{diag}(s\_1, s\_2, s\_3)$), an opacity $o$ and a view-dependent colour in spherical harmonics. Its density at $\mathbf x$ is

$$
G(\mathbf x) = o \, \exp\Big(-\tfrac12 (\mathbf x - \boldsymbol\mu)^\top \Sigma^{-1} (\mathbf x - \boldsymbol\mu)\Big).
$$

With degree-3 spherical harmonics (16 coefficients per colour channel), one Gaussian has $3 + 4 + 3 + 1 + 48 = 59$ learned floats, 236 bytes; the reference implementation's PLY files also store three unused normal fields. Geometry alone is 11 floats. Real scenes use hundreds of thousands to millions of Gaussians.

As a representation, Gaussians sit between points and volumes. They are **explicit** (a list you can edit, cull and stream), **soft** (each has a spatial extent, so they cover the surface without holes), **differentiable** (gradients flow to every parameter) and **fast to render** (they are projected and alpha-blended, not ray-marched). What they lack is a well-defined surface: the scene is a density, and the "surface" is wherever the accumulated opacity saturates.

### 8.2 Gaussians as geometry

To see how Gaussians describe a surface, fit them to one directly. A simple way, and a common initialization: cluster surface samples with k-means and give each cluster the sample mean and covariance of its points. (3DGS itself optimizes the Gaussians through rendering; clustering is just the most transparent way to see the geometry.)

```python
from scipy.cluster.vq import kmeans2


def fit_gaussians(P, k, seed=0):
    """k anisotropic Gaussians fitted to a point cloud: k-means, then each cluster's covariance."""
    mu, lab = kmeans2(P, k, minit="++", seed=seed)
    cov = np.stack([np.cov(P[lab == j].T) + 1e-6 * np.eye(3) for j in range(k)])
    w = np.bincount(lab, minlength=k) / len(P)
    return mu, cov, w


Pg = sample_torus(20_000, np.random.default_rng(5))[0]
mu_g, cov_g, w_g = fit_gaussians(Pg, 100)
evals, evecs = np.linalg.eigh(cov_g)                 # ascending: column 0 = thinnest axis
n_at_mu = grad(sdf_torus, mu_g)
cosang = np.abs(np.sum(evecs[:, :, 0] * n_at_mu, 1)) / np.linalg.norm(n_at_mu, axis=1)
ang_g = np.degrees(np.arccos(np.clip(cosang, -1, 1)))
flat = np.sqrt(evals[:, 0] / evals[:, 2])
print("thinnest axis vs surface normal: median %.1f deg, max %.1f deg" % (np.median(ang_g), ang_g.max()))
print("thickness / length sigma ratio: median %.3f" % np.median(flat))
print("centres inside the tube by: median %.4f" % np.median(-sdf_torus(mu_g)))
```

Output: `thinnest axis vs surface normal: median 1.6 deg, max 4.4 deg`, `thickness / length sigma ratio: median 0.140`, `centres inside the tube by: median 0.0171`.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-gaussians.svg" caption="Left: 100 Gaussians fitted to 20,000 surface samples by k-means, drawn at $\pm 2\sigma$; they become flat discs lying on the surface. Middle: the log-density of the mixture on the slice $y = 0$, with the true tube circles (dashed); the density is a shell, thickest where neighbouring discs overlap. Right: the angle between each Gaussian's thinnest axis and the true normal at its centre: median 1.6°, maximum 4.4°; the median thickness is 0.14 of the length." %}

The Gaussians flatten themselves into discs tangent to the surface, with the thinnest axis along the normal. They are not exactly on the surface: a cluster of points on a curved patch has its mean inside the curve (here the centres are inside the tube by a median of 0.017), the same sagitta effect as in a mesh. This observation drives the surface-oriented variants: **2D Gaussian Splatting** (Huang et al. 2024) uses flat 2D Gaussian discs (surfels) with a well-defined normal, which makes depth and normals consistent and surfaces extractable. [Neural rendering post 5]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}) surveys these and other variants.

To get a mesh from Gaussians, the most common route is indirect: render depth maps from many views and fuse them into a TSDF (section 6.2), then run marching cubes. Section 9 lists the routes between all representations.

## 9. Converting between representations

A real pipeline converts several times: depth maps to a TSDF, TSDF to a mesh, mesh to points for evaluation. Each conversion has a standard algorithm and a characteristic way of losing information.

| From → to | Standard method | What is lost or assumed | Where in this blog |
| --- | --- | --- | --- |
| depth map → points | back-projection $Z K^{-1}\tilde{\mathbf u}$ | nothing, but flying pixels need filtering | section 2.2 |
| depth maps → TSDF | projective truncated distance, weighted averaging | detail below the voxel size; needs poses | [post 7]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}), [post 9]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) |
| SDF / TSDF / occupancy → mesh | marching cubes (dual contouring for sharp features) | sharp edges, features thinner than a voxel | [graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) |
| neural field → mesh | sample on a grid, then marching cubes | everything finer than the sampling grid | section 7 |
| points → mesh | screened Poisson (needs oriented normals), ball pivoting | fills holes with smooth guesses; needs normals | [graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}), [post 9]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) |
| mesh → points | area-weighted sampling | connectivity | section 4.2 |
| mesh → SDF | closest-point distance; sign from winding number or ray parity | nothing if the mesh is watertight; sign is ill-defined otherwise | exercise 4 |
| mesh / points → voxels | rasterize or quantize to cells | everything below $h$ | section 5 |
| Gaussians → mesh | render depth from many views, TSDF fusion, marching cubes | soft, semi-transparent content | section 8 |
| anything → depth map | rasterize or ray cast from a camera | everything not visible | section 2 |
| anything → Gaussians | initialize from points, optimize through rendering | needs images or a renderer | [neural rendering post 4]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) |

Two rules of thumb. Conversions **toward implicit** representations (points → SDF) need an inside/outside decision that the source may not contain, so they need normals, a watertight mesh or extra assumptions. Conversions **toward discrete** representations (anything → voxels) lose everything below the cell size, permanently. Keep the original data, and convert as late as possible.

## 10. Memory against accuracy

### 10.1 Measuring all representations on one shape

We can now put the representations on one chart. For each one, at a range of resolutions, we compute its memory and its **mean two-sided surface error**: half the mean distance from its surface to the true surface plus half the mean distance from the true surface to its surface (the Chamfer distance of section 3.3, but evaluated against the representation's continuous surface wherever it has one). For points, the "surface" is the points themselves; for occupancy, the voxel staircase; for SDF grids, the zero level of the interpolated field; for meshes, the triangles. Memory uses float32 coordinates and values, int32 indices and one bit per voxel. The "sparse SDF" stores only the $8^3$ blocks that contain a cell crossed by the surface, as voxel hashing would.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-tradeoff.svg" localized="true" caption="Memory against mean two-sided surface error for the torus. Points: 500 to 50,000 exact samples (error 0.044 to 0.0044). Meshes: $8 \times 4$ to $128 \times 64$ (0.093 to 0.0004). Occupancy: $16^3$ to $128^3$ bits (0.032 to 0.0046). Dense SDF: $8^3$ to $128^3$ cells of float32 (0.020 to 0.00008). Sparse SDF: the same values stored only in $8^3$ blocks that touch the surface, 1.5 MB instead of 8.6 MB at $128^3$. Slopes on this log-log plot: points $-1/2$, occupancy $-1/3$, dense SDF $-2/3$, mesh $-1$, and sparse SDF approaching $-1$ at fine resolution (its $8^3$ blocks are coarse at small $N$)." %}

### 10.2 Scaling laws

Every curve is a straight line on the log-log plot, and its slope follows from two facts: how the error depends on the resolution, and how the memory depends on it. Let $h$ be the resolution (sample spacing, voxel size or edge length) and $M$ the memory.

| Representation | Error | Memory | Error as a function of memory |
| --- | --- | --- | --- |
| point cloud | spacing, $\propto h$ | samples on a surface, $\propto h^{-2}$ | $\propto M^{-1/2}$ |
| occupancy grid (dense) | staircase, $\propto h$ | $\propto h^{-3}$ | $\propto M^{-1/3}$ |
| SDF grid (dense) | interpolation, $\propto h^2$ | $\propto h^{-3}$ | $\propto M^{-2/3}$ |
| SDF grid (sparse band) | $\propto h^2$ | band near the surface, $\propto h^{-2}$ | $\propto M^{-1}$ |
| triangle mesh | sagitta, $\propto h^2$ | $\propto h^{-2}$ | $\propto M^{-1}$ |
| octree occupancy | $\propto h$ | $\propto h^{-2}$ | $\propto M^{-1/2}$ |

Reading the chart at about 10 kB: the mesh ($24 \times 12$, 10.4 kB) has error 0.011, the dense SDF ($12^3$, 8.8 kB) 0.0085, occupancy ($32^3$ bits, 4.1 kB; $48^3$, 13.8 kB) 0.018 and 0.013, and 1000 points (12 kB) 0.031. At about 150 kB, the sparse SDF (0.00054 at 131 kB) and the mesh (0.00072 at 166 kB) lead, the dense SDF follows (0.0012 at 144 kB), and occupancy (0.0067 at 111 kB) and points (0.0099 at 120 kB) trail by an order of magnitude. Two lessons generalize. **Interpolation beats resolution**: storing a little more per sample (a distance instead of a bit, a triangle instead of a point) changes the exponent, not just the constant. And **storage near the surface beats storage everywhere**: the sparse SDF and the mesh have the best slope because both spend memory only on the surface.

These numbers are for one smooth shape. For shapes with thin parts or sharp edges, the SDF and occupancy curves flatten at low resolution (features vanish), and points and meshes, whose samples sit exactly on the surface, look relatively better. Try that in the widget below.

### 10.3 Try it: one shape, six representations

The widget works in 2D, where everything is visible at once, but the same scaling laws apply: in 3D the dense grids pay one extra power of $N$.

{% include widget.liquid name="3d-vision-representations" height="640" caption="A 2D shape in a 100 mm box stored as points, pixels (occupancy), a quadtree, an SDF grid (with marching squares), a polygon or a mixture of Gaussians. Choose the representation with the buttons and its resolution with the slider; the dashed line is the true boundary. The panel shows the memory (float32 coordinates, 1 bit per pixel, 8 bytes per quadtree node, so at these small sizes the quadtree loses to the bit-packed pixel grid; see section 5.3) and the mean two-sided distance between the representation's boundary and the true one. Drag the probe (ringed dot) to see what each representation can say about a point: points only give a distance, pixels and quadtree leaves give inside or outside, the SDF interpolates a signed distance from 4 nodes (the dashed circle has that radius), the polygon counts ray crossings, and the Gaussian mixture compares its density with a threshold chosen to match the true area. The chart plots memory against error for all six over their whole range; tap a point to jump to it. Try the thin ring: the occupancy and SDF curves stall until the grid resolves the 3.5 mm wall." %}

## 11. Which representation for which task

| Task | Typical choice | Why |
| --- | --- | --- |
| Sensor data, per frame | depth map, LiDAR point cloud | it is what the sensor measures; no conversion error |
| Sparse SfM / SLAM landmarks | point cloud with descriptors | only distinctive points are tracked ([post 5]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}), [post 6]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})) |
| Dense real-time fusion (RGB-D) | TSDF in hashed voxel blocks; surfels | incremental averaging of noisy depth, bounded memory |
| Robot navigation and collision | occupancy octree (OctoMap), ESDF (Voxblox) | free/occupied/unknown, distances for planners |
| Final asset for rendering, games, printing | watertight triangle mesh with textures | every engine and printer consumes meshes |
| Novel-view synthesis | 3D Gaussians; NeRF-style fields; MPIs for small baselines | photometric quality, fitted through differentiable rendering |
| Learning shape priors, completion | SDF or occupancy fields with latent codes | continuous output, any resolution, interpolation in latent space |
| 3D perception networks (detection, segmentation) | raw points (PointNet-style), sparse voxels (sparse convolution) | permutation invariance; efficiency on mostly empty space |
| AR occlusion and physics on device | depth maps and coarse meshes | cheap to update, enough for occlusion and collision ([post 10]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }})) |

The questions to ask, in order: What queries will be made most often (render, inside test, distance, nearest neighbour)? Does the shape change topology while you work on it? Do you need gradients? How big is the scene relative to the finest detail? What does the next stage of the pipeline expect?

## 12. Learning on 3D data, in brief

### 12.1 PointNet: a function of a set

A network that consumes a point cloud must give the same output for any ordering of its points. **PointNet** (Qi et al. 2017) achieves this with the simplest possible architecture: apply the **same** small MLP $h$ to every point independently, then combine the results with a **symmetric** function, an element-wise maximum over points:

$$
g(\{\mathbf p_1, \dots, \mathbf p_n\}) = \psi\Big(\max_{i} h(\mathbf p_i)\Big).
$$

Here $\psi$ is a second MLP applied to the pooled vector (the paper calls it $\gamma$; we rename it to avoid a clash with the positional encoding of section 7.2). Because max does not care about order, $g$ is permutation invariant by construction. Each of the $K$ channels of the max is "won" by one point, so at most $K$ points determine the global feature; the paper calls them the **critical points**, and every other point can be deleted or moved a little without changing the output.

```python
def pointnet_feature(P, Ws):
    """Shared per-point MLP (the same weights for every point), then max-pooling over points."""
    h = P
    for W_, b_ in Ws:
        h = np.maximum(h @ W_ + b_, 0)
    return h.max(axis=0), h.argmax(axis=0)          # global feature, which point won each channel


rng = np.random.default_rng(6)
Ws = [(rng.normal(0, 1, (3, 64)), rng.normal(0, 0.1, 64)),
      (rng.normal(0, 0.18, (64, 256)), rng.normal(0, 0.1, 256))]
cloud2 = sample_torus(2_000, rng)[0]
g1, winners = pointnet_feature(cloud2, Ws)
g2, _ = pointnet_feature(cloud2[rng.permutation(2_000)], Ws)
crit = np.unique(winners)
g3, _ = pointnet_feature(cloud2[crit], Ws)
print("permuted input, same feature:", np.allclose(g1, g2))
print("critical points: %d of 2000; feature from them alone equal: %s" % (len(crit), np.allclose(g1, g3)))
```

Output: `permuted input, same feature: True` and `critical points: 218 of 2000; feature from them alone equal: True`. Even with random weights, 218 of the 2000 points carry the whole 256-dimensional feature. With trained weights the critical points outline the shape's skeleton, which is why PointNet is robust to missing and perturbed points. What PointNet lacks is **locality**: no layer sees the relation between a point and its neighbours. **PointNet++** (Qi et al. 2017) adds it by applying PointNet hierarchically to local neighbourhoods, whose centres it chooses with farthest point sampling (section 3.2) and whose members it gathers with a radius query.

### 12.2 Sparse convolution

Voxels give a regular structure that convolution can use, but a dense 3D CNN on a $256^3$ grid spends nearly all of its computation on empty space (section 5.1). **Sparse convolution** stores only the active (occupied) voxels in a hash table and computes the convolution only at them. There is a subtlety: a regular convolution's output is active wherever any input in its kernel is active, so the active set **dilates** by one voxel per layer, and after a few layers the data is no longer sparse. **Submanifold sparse convolution** (Graham et al. 2018) computes outputs only at sites that were already active, keeping the sparsity pattern fixed through the network. The Minkowski Engine (Choy et al. 2019) generalized this to arbitrary dimensions, including 4D space-time.

```python
from scipy import ndimage as ndi

X64, h64 = grid_centres(64)
active = np.abs(sdf_torus(X64)) < h64 / 2           # a thin shell of occupied voxels, like a scan
k3 = np.ones((3, 3, 3), bool)
counts_reg, a_ = [int(active.sum())], active
for layer in range(3):
    a_ = ndi.binary_dilation(a_, k3)                 # a regular sparse conv activates every site it touches
    counts_reg.append(int(a_.sum()))
print("active sites, regular sparse conv over 3 layers:", counts_reg)
print("submanifold sparse conv keeps %d; dense grid has %d" % (active.sum(), 64 ** 3))
```

Output: `active sites, regular sparse conv over 3 layers: [7120, 27776, 48360, 67224]` and `submanifold sparse conv keeps 7120; dense grid has 262144`.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-sparse-conv.svg" localized="true" caption="A shell of 7120 active voxels (the torus surface at $64^3$, like a scan). Left: the slice just above $z = 0$; black: the input, dark orange: the sites a regular sparse $3 \times 3 \times 3$ convolution activates after one layer, light orange: after two. Right: active sites per layer. The regular sparse convolution grows from 7120 to 27,776 after one layer and 67,224 after three, a quarter of the dense $64^3 = 262{,}144$ grid; the submanifold convolution keeps 7120 at every layer." %}

Point-based and sparse-voxel networks have since converged. Current point cloud backbones such as Point Transformer V3 (Wu et al. 2024) serialize points along space-filling curves, attend within local windows and use sparse convolution for position information. The choice between "points" and "voxels" is now mostly a choice of data structure for neighbourhood queries.

## Try it

- In the widget of section 10.3, find the resolution at which each representation reaches an error of 0.5 mm on the star, and compare the memory. Then switch to the thin ring and repeat. Which representations fail first, and why?
- Drag the probe across the boundary in the SDF view at a coarse resolution and watch the interpolated value change linearly inside each cell; then do the same in the Gaussian view, where the density is smooth but its level set does not match the true boundary exactly.
- The home page's [Interactive Lab]({{ '/' | relative_url }}#lab) renders a scene of 3D Gaussians (Gaussian World) and a path-traced scene of analytic shapes. The first is section 8's representation in action; the second uses exact implicit shapes like our torus.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Lorensen, Cline: Marching cubes | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37422) | Mesh extraction from any sampled implicit field |
| Curless, Levoy: A volumetric method for building complex models from range images | SIGGRAPH | 1996 | [DOI](https://doi.org/10.1145/237170.237269) | Cumulative weighted signed distance from range images: the origin of TSDF fusion |
| Shade, Gortler, He, Szeliski: Layered depth images | SIGGRAPH | 1998 | [DOI](https://doi.org/10.1145/280814.280882) | Several depths per pixel; rendering with parallax and disocclusion |
| Pfister, Zwicker, van Baar, Gross: Surfels | SIGGRAPH | 2000 | [DOI](https://doi.org/10.1145/344779.344936) | Oriented point primitives without connectivity |
| Newcombe et al.: KinectFusion | ISMAR | 2011 | [DOI](https://doi.org/10.1109/ISMAR.2011.6092378) | Real-time TSDF fusion and tracking from a depth camera |
| Hornung et al.: OctoMap | Autonomous Robots | 2013 | [DOI](https://doi.org/10.1007/s10514-012-9321-0) | Probabilistic occupancy in an octree; the standard robot map |
| Nießner, Zollhöfer, Izadi, Stamminger: Voxel hashing | ACM TOG (SIGGRAPH Asia) | 2013 | [DOI](https://doi.org/10.1145/2508363.2508374) | Sparse TSDF blocks behind a hash table, for scenes of any size |
| Qi, Su, Mo, Guibas: PointNet | CVPR | 2017 | [arXiv](https://arxiv.org/abs/1612.00593) | Permutation-invariant learning on raw points |
| Qi, Yi, Su, Guibas: PointNet++ | NeurIPS | 2017 | [arXiv](https://arxiv.org/abs/1706.02413) | Hierarchical local features with FPS and ball queries |
| Fan, Su, Guibas: A point set generation network | CVPR | 2017 | [arXiv](https://arxiv.org/abs/1612.00603) | Predicting point clouds; popularized Chamfer and EMD losses |
| Knapitsch, Park, Zhou, Koltun: Tanks and Temples | ACM TOG | 2017 | [DOI](https://doi.org/10.1145/3072959.3073599) | Precision, recall and F-score for reconstructions |
| Oleynikova et al.: Voxblox | IROS | 2017 | [arXiv](https://arxiv.org/abs/1611.03631) | Incremental ESDFs built from TSDFs for planning |
| Graham, Engelcke, van der Maaten: 3D semantic segmentation with submanifold sparse convolutional networks | CVPR | 2018 | [arXiv](https://arxiv.org/abs/1711.10275) | Sparse convolution that keeps the sparsity pattern |
| Zhou et al.: Stereo magnification (multiplane images) | SIGGRAPH (ACM TOG) | 2018 | [arXiv](https://arxiv.org/abs/1805.09817) | MPIs predicted by a CNN for view synthesis |
| Mescheder et al.: Occupancy networks | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1812.03828) | Shape as the decision boundary of a classifier |
| Park et al.: DeepSDF | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1901.05103) | Neural SDFs with latent codes for whole shape categories |
| Choy, Gwak, Savarese: Minkowski CNNs | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1904.08755) | Generalized sparse convolution, up to 4D |
| Rahaman et al.: On the spectral bias of neural networks | ICML | 2019 | [arXiv](https://arxiv.org/abs/1806.08734) | Why plain MLPs learn low frequencies first |
| Gropp et al.: Implicit geometric regularization (IGR) | ICML | 2020 | [arXiv](https://arxiv.org/abs/2002.10099) | The eikonal loss; SDFs from raw point clouds |
| Mildenhall et al.: NeRF | ECCV | 2020 | [arXiv](https://arxiv.org/abs/2003.08934) | Radiance fields trained by volume rendering |
| Tancik et al.: Fourier features | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.10739) | Analysis of positional encodings for coordinate networks |
| Sitzmann et al.: SIREN | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.09661) | Sine activations for fields with fine detail and derivatives |
| Müller et al.: Instant-NGP | SIGGRAPH (ACM TOG) | 2022 | [arXiv](https://arxiv.org/abs/2201.05989) | Hash-grid features plus tiny MLPs |
| Kerbl et al.: 3D Gaussian Splatting | SIGGRAPH (ACM TOG) | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) | Explicit, differentiable, real-time scene representation |
| Huang et al.: 2D Gaussian Splatting | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2403.17888) | Flat Gaussian surfels with well-defined normals and surfaces |
| Wu et al.: Point Transformer V3 | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.10035) | Serialized attention plus sparse convolution for point clouds |

## Learning resources

- [Graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) on this site: meshes, implicit surfaces, marching cubes and Poisson reconstruction.
- M. Botsch, L. Kobbelt, M. Pauly, P. Alliez and B. Lévy, *Polygon Mesh Processing*, A K Peters, 2010: meshes, conversions and remeshing.
- [Open3D](https://www.open3d.org/) (point clouds, meshes, TSDF integration, voxel downsampling) and [Trimesh](https://trimesh.org/) (mesh I/O, sampling, signed distance) for experimenting in Python.
- [OctoMap](https://octomap.github.io/) and [Voxblox](https://github.com/ethz-asl/voxblox) for robotics maps; [MinkowskiEngine](https://github.com/NVIDIA/MinkowskiEngine) and [Pointcept](https://github.com/Pointcept/Pointcept) for 3D deep learning.
- Y. Xie et al., "Neural Fields in Visual Computing and Beyond" (Eurographics STAR 2022) and its [paper list](https://neuralfields.cs.brown.edu/), a structured survey of neural fields.

## Exercises

1. A depth camera returns $z$-depth in millimetres as 16-bit integers. What is the largest depth it can store, and what is the depth resolution at 1 m and at 5 m? If it stored inverse depth $1/Z$ instead, as a 16-bit integer in steps of $2^{-10}$ m⁻¹, how would the resolution at 1 m and 5 m change?

   <details markdown="1"><summary>Hint</summary>

   Millimetres: up to 65.535 m, with a uniform 1 mm step at any depth. Inverse depth with step $\delta = 2^{-10}$ m⁻¹: since $dZ = Z^2\, d(1/Z)$, the depth step is $Z^2\delta$, about 1 mm at 1 m and 24 mm at 5 m. Inverse depth spends its precision near the camera, like the MPI planes, which matches the error of stereo (post 7).
   </details>

2. Extend `depth_normals` to reject normals at depth discontinuities: mark a pixel invalid if any of its four neighbours differs in depth by more than a few percent. What fraction of the pixels does that remove in the scene of section 2.2, and does it catch all normals with error above 10°?

   <details markdown="1"><summary>Hint</summary>

   Compare `depth[1:-1, 2:]`, `depth[1:-1, :-2]`, `depth[2:, 1:-1]` and `depth[:-2, 1:-1]` with the centre and threshold the relative difference. Also reject pixels with a missing neighbour. The silhouette of the torus against the table is a jump of 0.5 m or more and is easy to catch; the inner rim of the hole, where the torus curves away almost tangentially to the ray, needs a check on the angle between the normal and the ray instead.
   </details>

3. Derive the slope of the octree curve in section 5.3. If a surface of area $A$ is covered by cells of size $h = 3/2^L$, roughly how many cells at level $L$ does the surface cross? Compare with the printed count at $L = 8$.

   <details markdown="1"><summary>Hint</summary>

   About $c \cdot A/h^2$ cells, with $c$ between 1 and 3 depending on how the surface cuts the cells. With $A = 15.79$ and $h = 3/256$, $A/h^2 = 1.15 \times 10^5$. The level-8 count of 402,176 includes all 8 children of every crossing cell at level 7, not only the crossing ones; counting only crossing cells at level 8 gives a number much closer to $A/h^2$ times a small constant.
   </details>

4. Write `mesh_sdf(V, F, p)` that computes the signed distance from points to a closed triangle mesh: the distance to the nearest triangle (point-triangle distance), and the sign from the generalized winding number $w(\mathbf p) = \frac{1}{4\pi}\sum\_f \Omega\_f(\mathbf p)$, where $\Omega\_f$ is the solid angle of triangle $f$ seen from $\mathbf p$. Test it against `sdf_torus` on the $96 \times 48$ mesh.

   <details markdown="1"><summary>Hint</summary>

   The solid angle of a triangle $\mathbf a, \mathbf b, \mathbf c$ (relative to $\mathbf p$) is $2\,\mathrm{atan2}\big(\mathbf a \cdot (\mathbf b \times \mathbf c),\ abc + (\mathbf a\cdot\mathbf b)c + (\mathbf b\cdot\mathbf c)a + (\mathbf c\cdot\mathbf a)b\big)$ with $a = \lVert\mathbf a\rVert$ and so on (Van Oosterom and Strackee). $w \approx 1$ inside and $0$ outside for a closed, consistently oriented mesh; it degrades gracefully for meshes with small holes, unlike ray parity. The difference from `sdf_torus` should stay within about the sagitta, 0.0016.
   </details>

5. Repeat the neural field experiment of section 7 with a smaller learning rate or more steps for $L = 6$, and with $L = 4$. Does the noise of $L = 6$ go away with more training? Then add an eikonal penalty $\lambda(\lVert\nabla\_{\mathbf x} f\_\theta\rVert - 1)^2$; how would you compute $\nabla\_{\mathbf x} f\_\theta$ in the NumPy network?

   <details markdown="1"><summary>Hint</summary>

   While preparing this post we tried a smaller learning rate for $L = 6$ on a star-shaped polygon, and within 4000 steps it made the fit worse, not better: high-frequency inputs make the optimization harder, not only the fit noisier. Check whether the gear behaves the same. For the input gradient, back-propagate a gradient of ones from the output to the encoding (the same chain rule as for the weights), then multiply by the Jacobian of $\gamma$: $\partial \sin(2^k\pi x)/\partial x = 2^k\pi\cos(2^k\pi x)$. The eikonal term then needs second derivatives for its own gradient, which is where an autodiff framework becomes worth it.
   </details>

**Next:** [post 9]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) uses these representations to go from photographs to surfaces: the classical SfM, MVS, fusion and meshing pipeline, neural surfaces, and feed-forward 3D foundation models.
