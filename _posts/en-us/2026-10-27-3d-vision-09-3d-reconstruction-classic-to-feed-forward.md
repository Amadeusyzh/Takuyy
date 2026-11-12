---
layout: post
title: "3D reconstruction: from the classical pipeline to feed-forward models"
date: 2026-10-27 11:09:00+0900
description: "From photos to surfaces: the SfM, MVS, fusion and meshing pipeline, TSDF fusion and marching cubes, screened Poisson reconstruction, neural surfaces (NeuS, Neuralangelo, 2DGS), feed-forward 3D foundation models (DUSt3R, MASt3R, VGGT and their 2025-2026 successors), and how reconstructions are evaluated on DTU, Tanks and Temples and ETH3D, with NumPy code for every step."
categories: 3d-vision
tags: [3d-reconstruction, tsdf-fusion, marching-cubes, poisson-reconstruction, neus, dust3r, vggt, evaluation]
series: 3d-vision
series_order: 9
toc:
  sidebar: left
related_posts: false
---

## Why this matters

The previous posts built the pieces one at a time. [Post 3]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}) found correspondences, [post 4]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }}) turned two views into relative pose and depth, [post 5]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}) recovered all cameras and a sparse point cloud with structure-from-motion, [post 7]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) computed a dense depth map for every image, and [post 8]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }}) compared the ways a shape can be stored. This post puts them together and asks the question a user actually has: **I took photos (or a depth video) of something; how do I get its surface?**

There are three answers, and they arrived in this order. The **classical pipeline** chains SfM, multi-view stereo, depth fusion and meshing; each stage is a well-understood algorithm, and the whole chain still produces the most accurate geometry when you have many good images. **Neural surface reconstruction** (NeuS, Neuralangelo, 2D Gaussian splatting) replaces the last three stages with one optimization of a signed distance field or of surface-like Gaussians through a differentiable renderer. **Feed-forward 3D foundation models** (DUSt3R, MASt3R, VGGT and their many successors since 2024) skip the optimization altogether: one network pass turns a set of unposed images into cameras and dense 3D points.

We will build the core of each answer in NumPy on a small "flatland" world where everything can be checked against ground truth: TSDF fusion and marching squares, screened Poisson reconstruction, the NeuS rendering weights and a tiny NeuS optimization, the pointmap geometry of DUSt3R with focal and pose recovery, and the global alignment that stitches pairwise predictions together. The post ends with how reconstructions are evaluated, because "it looks good" is not a measurement.

## Prerequisites

- The camera model $\mathbf x \sim K(R\mathbf X + \mathbf t)$ and the OpenCV camera frame (x right, y down, z forward) from [post 1]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }}).
- What SfM and MVS produce: camera poses and per-image depth maps ([post 5]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}), [post 7]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})). The [neural rendering post on cameras and multi-view geometry]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}) is a compact substitute if you have not read them.
- Signed distance functions, meshes and implicit surfaces: [post 8]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }}) and [graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}), which also derives Poisson reconstruction and marching squares.
- Volume rendering $C = \sum\_i T\_i \alpha\_i \mathbf c\_i$ from the [NeRF post]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}), for section 6.
- Least squares, the SVD, sparse linear systems (SciPy), and gradient descent with Adam.

**Notation.** World points are $\mathbf X$, a camera maps them to its own frame by $\mathbf X\_c = R\mathbf X + \mathbf t$, and the camera centre is $\mathbf C = -R^\top \mathbf t$. A depth map $d(u)$ stores the $z$ coordinate (not the distance along the ray) of the surface seen through pixel $u$. $f(\mathbf x)$ is a signed distance function: negative inside a solid, positive outside, $\lvert f\rvert$ the distance to the surface. To avoid a clash with $f$, the focal length in pixels is written $f\_x$.

## 1. The reconstruction problem

### 1.1 What a reconstruction is

"3D reconstruction" can mean several outputs, and it pays to say which one you want:

- **cameras**: intrinsics $K\_k$ and poses $(R\_k, \mathbf t\_k)$ of every image, the output of SfM;
- **a point cloud**: sparse (SfM tracks) or dense (fused depth maps), possibly with normals and colours;
- **a surface**: usually a triangle mesh, ideally watertight (closed, with a well-defined inside), sometimes with texture;
- **a field**: an SDF, an occupancy or a radiance field that you query instead of storing a mesh;
- **a renderable scene**: NeRF or 3D Gaussians, optimized for images rather than for geometry.

[Post 8]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }}) compared these representations. This post is about the algorithms that produce them, with the surface as the main target.

### 1.2 The classical pipeline

The classical pipeline is a chain of stages, each with a clear input and output:

| Stage | Input | Output | Covered in |
| --- | --- | --- | --- |
| Features and matching | images | correspondences | [post 3]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}) |
| Structure-from-motion | correspondences | cameras $K, R, \mathbf t$ and sparse points | [posts 4-5]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}) |
| Multi-view stereo | images and cameras | a depth map (and normal map) per image | [post 7]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) |
| Depth fusion | depth maps and cameras | a fused point cloud or a volumetric field | section 2 |
| Meshing | points with normals, or a field | a triangle mesh | sections 3 and 4 |
| Texturing | mesh, images, cameras | a texture atlas | section 4.4 |

The strength of the chain is that every stage has a geometric meaning and can be checked on its own: you can look at reprojection errors after SfM, at depth maps after MVS, at the fused cloud before meshing. Its weakness is that errors only flow forward. A camera that SfM got slightly wrong produces inconsistent depth maps, fusion averages the inconsistency into a blurred surface, and the mesher cannot know why. The neural and feed-forward methods of sections 6 and 7 are, in part, attempts to let information flow backward.

This post concentrates on the last three stages, which earlier posts did not cover, and then on the methods that replace the whole chain.

### 1.3 A flatland testbed

To see every step with numbers we use a 2D world. Think of looking down on a table: the world is the horizontal plane $(x, z)$ of an OpenCV world frame (the $y$ axis points down into the page), and a camera keeps the $x$ (right) and $z$ (forward) axes of its 3D frame. Its image is a single row of 160 pixels, and the pinhole model of post 1 loses one dimension:

$$
u = f_x \frac{x_c}{z_c} + c_x, \qquad
K = \begin{pmatrix} f_x & c_x \\ 0 & 1 \end{pmatrix}, \qquad
\begin{pmatrix} x_c \\ z_c \end{pmatrix} = R \begin{pmatrix} x \\ z \end{pmatrix} + \mathbf t ,
$$

with $R$ a $2\times 2$ rotation. The scene is the zero level set of an exact SDF: a disk of radius 45 cm, a box rotated by 20° and a thin bar only 8 cm thick, which will test how fine a structure each method can keep. A camera produces a **depth scan** by sphere tracing the SDF (the ray marching of [graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})) and converting each hit distance to a $z$-depth, plus Gaussian noise of $\sigma = 2$ cm, roughly what a consumer depth camera gives at 2-3 m. Sixty-four cameras sit on a circle of radius 2.6 m, each looking at a point jittered by 15 cm around the origin.

```python
import numpy as np

W, FOC = 160, 160.0                 # a 1D image: 160 pixels, focal length 160 px
CX = (W - 1) / 2                    # principal point at the image centre (pixel centres at 0..W-1)


def sd_box(p, c, half, ang):
    """Signed distance to a box with centre c, half sizes `half`, rotated by `ang`."""
    ca, sa = np.cos(ang), np.sin(ang)
    d = p - c
    q = np.stack([ca * d[..., 0] + sa * d[..., 1], -sa * d[..., 0] + ca * d[..., 1]], -1)
    a = np.abs(q) - half
    return np.linalg.norm(np.maximum(a, 0), axis=-1) + np.minimum(a.max(-1), 0)


def scene_sdf(p):
    """Signed distance (m) to the flatland scene; p[..., :] = (x, z) world coordinates."""
    disk = np.linalg.norm(p - np.array([-0.55, 0.25]), axis=-1) - 0.45
    box = sd_box(p, np.array([0.5, -0.4]), np.array([0.45, 0.28]), np.deg2rad(20))
    bar = sd_box(p, np.array([0.45, 0.65]), np.array([0.38, 0.04]), np.deg2rad(-10))
    return np.minimum(np.minimum(disk, box), bar)


def look_at(C, target=(0.0, 0.0)):
    """World-to-camera (R, t) of a 2D camera at C looking at target (OpenCV: x right, z forward)."""
    fwd = np.asarray(target, float) - C
    fwd /= np.linalg.norm(fwd)
    R = np.array([[fwd[1], -fwd[0]],     # row 1: the camera x axis (right) in world coordinates
                  [fwd[0], fwd[1]]])     # row 2: the camera z axis (forward)
    return R, -R @ C


def render_depth(R, t, sigma=0.0, rng=None, max_range=8.0):
    """z-depth of every pixel by sphere tracing scene_sdf; NaN where the ray escapes."""
    C = -R.T @ t
    rays_c = np.stack([(np.arange(W) - CX) / FOC, np.ones(W)], 1)   # K^-1 (u, 1): z = 1
    norm = np.linalg.norm(rays_c, axis=1)
    dirs = (rays_c / norm[:, None]) @ R                              # R^T d for each ray
    s = np.zeros(W)
    for _ in range(200):
        dist = scene_sdf(C + s[:, None] * dirs)
        s = np.where(dist > 1e-6, s + dist, s)
    depth = np.where(s < max_range, s / norm, np.nan)                 # range -> z-depth
    if sigma > 0:
        depth = depth + sigma * rng.standard_normal(W)
    return depth


def orbit(n, radius=2.6, start=0.0, span=360.0, rng=None, jitter=0.0):
    """n cameras on a circle around the origin, looking at (a jittered point near) the origin."""
    step = span / n if span == 360 else span / max(n - 1, 1)
    cams = []
    for a in np.deg2rad(start + step * np.arange(n)):
        C = radius * np.array([np.cos(a), np.sin(a)])
        target = (0.0, 0.0) if rng is None else jitter * rng.standard_normal(2)
        cams.append(look_at(C, target))
    return cams


def backproject(R, t, depth):
    """World points of the valid pixels: X_w = R^T (d K^-1 (u, 1) - t)."""
    u = np.arange(W)
    pc = np.stack([(u - CX) / FOC * depth, depth], 1)
    ok = np.isfinite(depth)
    return (pc[ok] - t) @ R, ok


rng = np.random.default_rng(0)
cams = orbit(64, rng=rng, jitter=0.15)            # 64 cameras on a circle of radius 2.6 m
scans = [(R, t, render_depth(R, t, sigma=0.02, rng=rng)) for R, t in cams]
d0 = scans[0][2]
print("scan 0: %d of %d pixels hit, depth %.2f to %.2f m"
      % (np.isfinite(d0).sum(), W, np.nanmin(d0), np.nanmax(d0)))
X0, _ = backproject(*cams[0], render_depth(*cams[0]))
print("noise-free back-projection: max |sdf| = %.1e m" % np.abs(scene_sdf(X0)).max())
```

```text
scan 0: 104 of 160 pixels hit, depth 1.54 to 2.97 m
noise-free back-projection: max |sdf| = 1.6e-04 m
```

The second line checks the geometry: a noise-free depth scan, back-projected with $\mathbf X = R^\top(d\,K^{-1}(u, 1)^\top - \mathbf t)$, lands on the surface to within the sphere tracer's tolerance.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-flatland.svg" localized="true" caption="The flatland testbed. Left: the scene (gray: a disk, a box and a thin bar) and the 64 cameras of the orbit; camera $k=8$ (orange) shoots its 160 rays (every eighth drawn) and the red dots are its noisy back-projected depth readings. Right: that depth scan as a function of the pixel $u$, true (black) and with $\sigma = 2$ cm noise (red). 137 of the 160 pixels hit something, at depths from 1.57 m to 2.60 m; the jumps are occlusion boundaries, where the ray passes from one object to another." %}

Everything in sections 2 to 4 consumes these scans exactly as a real system consumes the depth maps of an RGB-D camera or of MVS. Nothing in the algorithms is specific to 2D: replace pixels $u$ by $(u, v)$, squares by cubes, and you have the 3D versions.

## 2. Volumetric fusion with a truncated signed distance function

### 2.1 From a depth map to a signed distance

A depth map tells us, along each pixel's ray, where the first surface is. It says two more things that a point cloud forgets: the space **in front of** the surface is empty (the ray passed through it), and the space **just behind** it is probably solid. Volumetric fusion, introduced by Curless and Levoy in 1996 and made real-time by KinectFusion in 2011, stores exactly this information in a voxel grid.

Take a voxel with centre $\mathbf v$. Transform it into the camera, $\mathbf v\_c = R\mathbf v + \mathbf t = (x\_c, z\_c)$, project it to the pixel $u = \operatorname{round}(f\_x x\_c / z\_c + c\_x)$, and read the depth $d(u)$ there. The difference

$$
\eta(\mathbf v) = d(u) - z_c
$$

is a **projective signed distance**: positive if the voxel is in front of the observed surface, negative if behind, zero on it. It is measured along the optical axis rather than perpendicular to the surface, so it overestimates the true distance by about $1/\cos\theta$ when the surface is seen at an angle $\theta$, but it has the right sign and the right zero crossing, which is all the surface extraction needs.

### 2.2 Truncation and the running average

Far from the surface, $\eta$ says little. A voxel 1 m in front of the surface is empty, but its exact distance is not known: some other surface, not seen through this pixel, may be closer. Behind the surface we know even less, because we cannot see there at all. So we **truncate**: with a truncation distance $\mu$,

$$
\psi(\mathbf v) = \min\Big(1, \frac{\eta(\mathbf v)}{\mu}\Big)
\quad \text{if } \eta(\mathbf v) > -\mu, \qquad \text{no update otherwise.}
$$

Voxels in front of the surface get values up to 1 ("free space"), voxels within $\mu$ behind it get values down to $-1$, and voxels deeper inside are left alone.

Each voxel stores a value $F$ and a weight $W$. Scan $k$ with value $\psi\_k$ and weight $w\_k$ updates them by

$$
F \leftarrow \frac{W F + w_k \psi_k}{W + w_k}, \qquad W \leftarrow W + w_k .
$$

Why an average? Suppose the scans see the same surface point with independent noise. Each $\psi\_k$ is then a noisy measurement of the same signed distance, and the value that minimizes the weighted squared error

$$
E(F) = \sum_k w_k (F - \psi_k)^2 \quad\Longrightarrow\quad F = \frac{\sum_k w_k \psi_k}{\sum_k w_k}
$$

is their weighted mean. The update above is just this mean computed incrementally, so a voxel never needs to remember individual scans. Curless and Levoy argue that the zero set of this field is the least-squares surface of the range data under Gaussian noise along the rays; with $w\_k = 1/\sigma\_k^2$ it is the maximum-likelihood surface. Averaging $n$ readings divides the noise by $\sqrt n$, which is what makes a cheap depth camera produce a smooth model.

### 2.3 A worked example and the code

One voxel sits 2.00 m in front of a camera that sees the surface three times, at depths 2.03, 1.98 and 2.05 m, with $\mu = 6$ cm. The signed distances are $+3$, $-2$ and $+5$ cm, so $\psi = 0.5$, $-0.333$ and $0.833$, and the fused value after three scans is their mean, $0.333$, which corresponds to $\mu F = 2.0$ cm, exactly the mean of the three signed distances. The code below does this voxel by hand and then fuses whole scans into a $128 \times 128$ grid with 2.5 cm voxels.

```python
def make_grid(n=128, extent=1.6):
    """Voxel centres of an n x n grid over [-extent, extent]^2; grid[i, j] is (xs[j], xs[i])."""
    h = 2 * extent / n
    xs = -extent + h * (np.arange(n) + 0.5)
    X, Z = np.meshgrid(xs, xs)
    return xs, np.stack([X, Z], -1).reshape(-1, 2)


def tsdf_integrate(F, Wt, P, R, t, depth, mu, w_max=np.inf):
    """Fuse one depth scan into the TSDF values F and weights Wt of the voxel centres P."""
    pc = P @ R.T + t                                 # voxel centres in camera coordinates
    z = pc[:, 1]
    u = np.full(len(P), -1)
    front = z > 1e-6
    u[front] = np.round(FOC * pc[front, 0] / z[front] + CX).astype(int)   # nearest pixel
    ok = front & (u >= 0) & (u < W)
    sdf = np.full(len(P), np.nan)
    sdf[ok] = depth[u[ok]] - z[ok]                   # projective signed distance along the ray
    ok &= np.isfinite(sdf) & (sdf > -mu)             # skip voxels far behind the surface
    f = np.minimum(1.0, sdf[ok] / mu)                # truncate in front, normalize to [-1, 1]
    F[ok] = (Wt[ok] * F[ok] + f) / (Wt[ok] + 1.0)    # running weighted average
    Wt[ok] = np.minimum(Wt[ok] + 1.0, w_max)


def tsdf_fuse(scans, n=128, extent=1.6, mu=0.06):
    xs, P = make_grid(n, extent)
    F, Wt = np.ones(len(P)), np.zeros(len(P))
    for R, t, depth in scans:
        tsdf_integrate(F, Wt, P, R, t, depth, mu)
    return xs, F.reshape(n, n), Wt.reshape(n, n)


# one voxel 2.00 m in front of the camera, three depth readings of the surface behind it
F1, W1, mu = 1.0, 0.0, 0.06
for d in (2.03, 1.98, 2.05):
    f = min(1.0, (d - 2.00) / mu)
    F1, W1 = (W1 * F1 + f) / (W1 + 1), W1 + 1
    print("reading %.2f: f = %+.3f  ->  F = %+.3f, W = %d, mu F = %+.1f mm" % (d, f, F1, W1, 1000 * mu * F1))

for n_scans in (1, 4, 16, 64):
    xs, F, Wt = tsdf_fuse(scans[::64 // n_scans])
    print("%2d scans: %4.1f%% of the voxels observed" % (n_scans, 100 * np.mean(Wt > 0)))
```

```text
reading 2.03: f = +0.500  ->  F = +0.500, W = 1, mu F = +30.0 mm
reading 1.98: f = -0.333  ->  F = +0.083, W = 2, mu F = +5.0 mm
reading 2.05: f = +0.833  ->  F = +0.333, W = 3, mu F = +20.0 mm
 1 scans: 11.9% of the voxels observed
 4 scans: 46.6% of the voxels observed
16 scans: 89.1% of the voxels observed
64 scans: 93.2% of the voxels observed
```

`tsdf_integrate` is the heart of KinectFusion-style systems, vectorized over all voxels: transform, project, look up, subtract, truncate, average. Notice what it does not do. It never searches for the closest surface point and never builds a mesh; every operation is local to one voxel and one pixel, which is why it runs on a GPU at camera frame rate. The percentage of observed voxels stops growing at about 93%: the remaining voxels are inside the objects, deeper than $\mu$ behind every surface, where no camera can see.

### 2.4 Watching the field converge

The figure below shows the field after 1, 4, 16 and 64 scans and measures the extracted surface against the truth (the accuracy and completeness of section 8: the mean distance from the reconstruction to the truth and from the truth to the reconstruction).

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-tsdf-fusion.svg" localized="true" caption="TSDF fusion of the noisy scans ($\mu$ = 6 cm, 2.5 cm voxels). Left: the fused value $F$ after 1, 4, 16 and 64 scans (blue: free space; white: the surface; red: just behind it; gray: never observed), the extracted zero crossings (black) and the directions of the cameras used (purple). Right: accuracy and completeness of the extracted curve. With one scan the surface is accurate (12.2 mm) but incomplete (327 mm); with 64 scans both reach 2.6-2.7 mm, almost an order of magnitude below the 20 mm noise of a single scan." %}

Two things stand out. Completeness improves dramatically as new viewpoints reveal new surfaces, while accuracy improves slowly, roughly as $1/\sqrt n$ (from 9.2 mm at 4 scans to 2.6 mm at 64, close to the factor 4 that averaging 16 times more readings predicts). And the interior of every object stays gray: TSDF fusion never invents what it has not seen.

Try it yourself in the widget. Drag the camera around the scene and release to take a scan; the orbit button scans automatically. Watch the noise fall as scans accumulate, and use the sliders to break things: a truncation distance smaller than the noise, or larger than the bar.

{% include widget.liquid name="3d-vision-tsdf-fusion" height="720" caption="2D TSDF fusion with the post's scene and camera (160 pixels, $f\_x$ = 160 px). Drag on the plot to move the camera (it always looks at the centre) and release to take a scan, or press orbit. The colour is $F$ (or the weight $W$), the black curve is the extracted surface, the dashed green curve the truth. The readout gives the length-weighted mean $\lvert f\rvert$ of the extracted curve (accuracy) and the share of the true surface within 2 cm of it (recall). Changing $\mu$ or the voxel size re-fuses all scans taken so far." %}

### 2.5 Choosing the truncation, the voxel size and the weights

**Truncation $\mu$.** The truncation band must be wide enough to contain the noise, otherwise readings that fall behind the true surface by more than $\mu$ are discarded and the average is biased. It must also be narrow enough not to destroy thin structures. Look at the bar from both sides: a camera above it writes "behind the surface" values into the bar and beyond, down to $\mu$ below its top face; a camera below writes "free space" values ($\psi > 0$) up to $\mu$ in front of its own surface, which, if $\mu$ exceeds the thickness, is inside the bar and above it. The two sides then cancel, and the bar thins or vanishes.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-truncation.svg" localized="true" caption="The truncation distance. Left: the thin bar (8 cm thick) fused from all 64 scans with $\mu$ = 4.5 cm: the extracted surface (black) follows the truth (dashed green). Middle: with $\mu$ = 15 cm the values from the two sides overlap, the band of negative values spreads, and only 50.6% of the bar's true outline is recovered within 2 cm. Right: the F-score of the whole scene and the recall on the bar against $\mu$ (both at $\tau$ = 2 cm). Below $\mu \approx \sigma$ the noise wins (F = 0.939 at $\mu$ = 2 cm); between 3 and 9 cm everything works; at 12 cm the bar recall drops to 0.58 and at 18 cm to 0.43." %}

The rule of thumb is $\mu \approx 2\sigma$ to $4\sigma$ and below the thickness of the thinnest part you care about; in practice a few voxel sizes. When the noise grows with depth, as for stereo where $\sigma\_z \propto z^2$ (post 4), the truncation can grow with depth too.

**Voxel size.** A voxel must be smaller than the features you want, but there is no point going below the noise of the fused surface. In the flatland run, 10 cm voxels lose the 8 cm bar entirely (F-score 0.788), 5 cm voxels already give 0.997, and going from 2.5 cm (0.999) to 1.25 cm (0.997) buys nothing, because the remaining error is noise, not discretization.

**Memory.** A dense grid costs $n^3$ voxels: $512^3$ voxels with a 4-byte value and a 4-byte weight is 1 GiB, almost all of it free space. Practical systems allocate only voxels near the surface. **Voxel hashing** (Nießner et al. 2013) stores small blocks of $8^3$ voxels in a hash table keyed by block coordinates and allocates a block only when a depth reading falls inside its truncation band; octrees and sparse grids (OpenVDB) do the same with a hierarchy. Post 8 discusses these structures.

**Weights.** We used $w\_k = 1$. Better choices encode how much a reading should be trusted: $w = 1/\sigma\_z^2(z)$ for depth-dependent noise, a factor $\cos\theta$ that down-weights grazing views, and a ramp that lowers the weight behind the surface (Curless and Levoy's original). KinectFusion also caps $W$ at a maximum, so that the field forgets old data and can follow slow changes in the scene.

**Colour and beyond.** The same running average fuses any per-voxel attribute: colour, semantic labels, or learned features. Tracking is the other half of KinectFusion: each new depth frame is aligned to a ray-cast of the current model with ICP before it is fused, which turns the fusion into a SLAM system ([post 6]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})).

## 3. From a field to a surface: marching squares and cubes

The fused field is not yet a surface. **Marching squares** (in 2D) and **marching cubes** (in 3D, Lorensen and Cline 1987) find it cell by cell: label each corner of a cell inside ($F < 0$) or outside, and wherever the sign changes along an edge, place a vertex on that edge at the zero crossing of the linear interpolant,

$$
\mathbf p = \mathbf p_a + \frac{F_a}{F_a - F_b}\,(\mathbf p_b - \mathbf p_a),
$$

then connect the vertices of the cell according to a table of the $2^4 = 16$ (squares) or $2^8 = 256$ (cubes) sign patterns. The table, the ambiguous saddle cases and dual contouring are derived in [graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}); here we add the two details that matter for fusion.

```python
def marching_squares(F, xs, valid=None, interp=True):
    """Zero crossings of F[i, j] (sampled at (xs[j], xs[i])) as an array of segments (m, 2, 2)."""
    v = [F[:-1, :-1], F[:-1, 1:], F[1:, 1:], F[1:, :-1]]          # corners c0..c3 of every cell
    lo = np.minimum(np.minimum(v[0], v[1]), np.minimum(v[2], v[3]))
    hi = np.maximum(np.maximum(v[0], v[1]), np.maximum(v[2], v[3]))
    cell = (lo < 0) & (hi >= 0)
    if valid is not None:                                           # all four corners observed
        cell &= valid[:-1, :-1] & valid[:-1, 1:] & valid[1:, 1:] & valid[1:, :-1]
    off = [(0, 0), (0, 1), (1, 1), (1, 0)]                          # (di, dj) of c0..c3
    segs = []
    for i, j in zip(*np.nonzero(cell)):
        val = [F[i + di, j + dj] for di, dj in off]
        pos = [np.array([xs[j + dj], xs[i + di]]) for di, dj in off]
        pts = {}
        for e in range(4):                                          # edge e joins corners e, e+1
            a, b = e, (e + 1) % 4
            if (val[a] < 0) != (val[b] < 0):
                s = val[a] / (val[a] - val[b]) if interp else 0.5
                pts[e] = pos[a] + s * (pos[b] - pos[a])
        if len(pts) == 2:
            segs.append(list(pts.values()))
        elif len(pts) == 4:                                         # saddle: decide by the centre
            if (np.mean(val) < 0) == (val[0] < 0):
                segs += [[pts[0], pts[1]], [pts[2], pts[3]]]
            else:
                segs += [[pts[3], pts[0]], [pts[1], pts[2]]]
    return np.array(segs).reshape(-1, 2, 2)


def sample_segments(segs, step=0.004):
    """Points along the segments, about `step` apart."""
    out = []
    for p, q in segs:
        k = max(1, int(np.ceil(np.linalg.norm(q - p) / step)))
        out.append(p + ((np.arange(k) + 0.5) / k)[:, None] * (q - p))
    return np.concatenate(out) if out else np.zeros((0, 2))


for n_scans in (1, 4, 16, 64):
    xs, F, Wt = tsdf_fuse(scans[::64 // n_scans])
    pts = sample_segments(marching_squares(F, xs, Wt > 0))
    print("%2d scans: mean distance of the extracted curve to the true surface %.1f mm"
          % (n_scans, 1000 * np.abs(scene_sdf(pts)).mean()))

for n in (16, 32, 64, 128, 256):
    xs, P = make_grid(n)
    G = scene_sdf(P).reshape(n, n)                    # exact SDF samples, no noise
    e = [1000 * np.abs(scene_sdf(sample_segments(marching_squares(G, xs, interp=i)))).mean()
         for i in (True, False)]
    print("h = %5.1f mm: interpolated %.3f mm, midpoint %.2f mm" % (3200 / n, e[0], e[1]))
```

```text
 1 scans: mean distance of the extracted curve to the true surface 12.2 mm
 4 scans: mean distance of the extracted curve to the true surface 9.2 mm
16 scans: mean distance of the extracted curve to the true surface 3.9 mm
64 scans: mean distance of the extracted curve to the true surface 2.5 mm
h = 200.0 mm: interpolated 9.941 mm, midpoint 37.72 mm
h = 100.0 mm: interpolated 3.699 mm, midpoint 17.90 mm
h =  50.0 mm: interpolated 0.667 mm, midpoint 7.84 mm
h =  25.0 mm: interpolated 0.176 mm, midpoint 4.10 mm
h =  12.5 mm: interpolated 0.045 mm, midpoint 2.20 mm
```

**Detail 1: skip unobserved cells.** Unobserved voxels keep their initial value ($F = 1$, $W = 0$). Just behind every surface lies a band of negative values, and behind that band the unobserved interior with $F = 1$: a second sign change, a phantom surface a distance $\mu$ inside every object. The `valid` mask, which extracts only cells whose four corners have $W > 0$, removes it. Every implementation needs an equivalent test.

**Detail 2: interpolate.** The second loop compares vertices placed by interpolation with vertices placed at edge midpoints, on the exact SDF of the scene. The interpolated surface is far more accurate, and its error shrinks four times faster.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-extraction.svg" localized="true" caption="Vertex placement in marching squares on the exact SDF. Left: the disk on a grid with $h$ = 20 cm (blue: corners inside, open: outside). Midpoint vertices (orange, dashed) make a staircase; interpolated vertices (purple) sit almost on the circle. Right: the mean $\lvert f\rvert$ of the extracted curve against the voxel size. Interpolation is second-order (0.667, 0.176, 0.045 mm at 5, 2.5, 1.25 cm: a factor of about 4 per halving), midpoints only first-order (7.84, 4.10, 2.20 mm: a factor of 2)." %}

Why second order? Near the surface a smooth $f$ is linear up to a curvature term: $f(\mathbf p\_a + s\,\mathbf e) = f\_a + s\,\nabla f\cdot\mathbf e + O(s^2 h^2)$. Linear interpolation finds the zero of the linear part exactly, so its error is the $O(h^2)$ remainder, while a midpoint can be off by up to $h/2$. This is why a TSDF stores a continuous value and not just "inside" or "outside": the value carries sub-voxel information, and marching cubes recovers it.

## 4. From points to a watertight surface: Poisson reconstruction

### 4.1 When fusion is not the right tool

TSDF fusion needs the original depth maps and their cameras, and it only produces surface where something was observed. Two common situations call for something else. Sometimes all you have is a point cloud with normals: COLMAP's fused MVS output, a LiDAR scan, or points sampled from a neural field. And sometimes you need a **watertight** mesh for 3D printing, physics or volume computation, even if parts of the object were never seen.

**Poisson surface reconstruction** (Kazhdan, Bolitho and Hoppe 2006) is the standard answer. Its idea, derived in detail in [graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}): let $\chi$ be the indicator function of the solid. Its gradient vanishes everywhere except on the surface, where it points inward, so the oriented normals of the samples, smoothed into a vector field $\mathbf V$, are a sample of that gradient. Find the $\chi$ whose gradient fits $\mathbf V$ best,

$$
\min_\chi \int \lVert \nabla\chi - \mathbf V \rVert^2 \, d\mathbf x
\quad\Longrightarrow\quad \Delta\chi = \nabla\cdot\mathbf V ,
$$

and extract a level set. Because the solution is global, holes are filled with the smoothest possible surface and noise averages out.

### 4.2 Screening

Plain Poisson has a weakness: the gradient term only constrains differences, so $\chi$ may drift away from the data in regions where the normals are sparse or inconsistent, and the surface is then pulled away from the points. **Screened Poisson reconstruction** (Kazhdan and Hoppe 2013) adds a term that asks $\chi$ to take a fixed value at the input points. With $\chi \approx +\tfrac12$ inside and $-\tfrac12$ outside, the surface is $\chi = 0$ and the energy becomes

$$
E(\chi) = \int \lVert \nabla\chi - \mathbf V \rVert^2 \, d\mathbf x + \alpha \sum_i \ell_i\, \chi(\mathbf p_i)^2 ,
$$

where $\ell\_i$ is the length (in 3D, the area) of surface that sample $i$ stands for, and $\alpha$ sets the strength of the screening. On a grid, $\nabla$ becomes a sparse finite-difference matrix $G$, evaluation at the samples a sparse bilinear interpolation matrix $B$, and setting the gradient of $E$ to zero gives one sparse, symmetric, positive definite system:

$$
\big(G^\top G + \alpha\, B^\top L B\big)\,\boldsymbol\chi = G^\top \mathbf v, \qquad L = \operatorname{diag}(\ell_i).
$$

The real implementation solves it on an adaptive octree with a multigrid solver; our $128 \times 128$ grid fits SciPy's sparse direct solver.

### 4.3 Code and result

This time the cameras cover only 210° of the circle, so parts of the scene are never seen. The oriented points come from the scans themselves: each normal is the direction of least variance of its 60 nearest neighbours (Hoppe et al. 1992), and the camera that saw a point decides its sign, because a visible surface faces the camera. This orientation by sensor position is much more reliable than the spanning-tree propagation needed for raw point clouds.

```python
import scipy.sparse as sp
from scipy.sparse.linalg import spsolve
from scipy.spatial import cKDTree


def oriented_points(scans, k=60):
    """Merge the back-projected scans; PCA normals from k neighbours, flipped toward the camera
    that saw each point."""
    P, C = [], []
    for R, t, depth in scans:
        X, _ = backproject(R, t, depth)
        P.append(X)
        C.append(np.repeat((-R.T @ t)[None], len(X), 0))
    P, C = np.concatenate(P), np.concatenate(C)
    nb = cKDTree(P).query(P, k)[1]
    Q = P[nb] - P[nb].mean(1, keepdims=True)
    N = np.linalg.eigh(np.einsum("nki,nkj->nij", Q, Q))[1][:, :, 0]   # smallest eigenvector
    N *= np.sign(((C - P) * N).sum(1))[:, None]
    return P, N


def bilinear_matrix(P, xs):
    """Sparse B with B @ g.ravel() = bilinear interpolation of the node values g[i, j] at P."""
    n, h = len(xs), xs[1] - xs[0]
    fx = np.clip((P[:, 0] - xs[0]) / h, 0, n - 1 - 1e-9)
    fz = np.clip((P[:, 1] - xs[0]) / h, 0, n - 1 - 1e-9)
    j, i = np.floor(fx).astype(int), np.floor(fz).astype(int)
    a, b = fx - j, fz - i
    rows = np.repeat(np.arange(len(P)), 4)
    cols = np.stack([i * n + j, i * n + j + 1, (i + 1) * n + j, (i + 1) * n + j + 1], 1).ravel()
    vals = np.stack([(1 - a) * (1 - b), a * (1 - b), (1 - a) * b, a * b], 1).ravel()
    return sp.csr_matrix((vals, (rows, cols)), shape=(len(P), n * n))


def screened_poisson(P, N, xs, alpha=0.0, k=60):
    """Indicator chi (about +1/2 inside, -1/2 outside) whose gradient fits the splatted inward
    normals, screened toward chi = 0 at the points with weight alpha. Returns chi and the iso-value."""
    n, h = len(xs), xs[1] - xs[0]
    ell = 2 * cKDTree(P).query(P, k + 1)[0][:, -1] / k        # curve length each point stands for
    D = sp.diags([-np.ones(n - 1), np.ones(n - 1)], [0, 1], shape=(n - 1, n)) / h
    Gx, Gz = sp.kron(sp.identity(n), D).tocsr(), sp.kron(D, sp.identity(n)).tocsr()
    sig, tree = 1.5 * h, cKDTree(P)

    def splat(Q, comp):                                        # V = -sum ell_i N_i G_sig(x - p_i)
        V = np.zeros(len(Q))
        for q, nb in enumerate(tree.query_ball_point(Q, 4 * sig)):
            if nb:
                d2 = ((P[nb] - Q[q]) ** 2).sum(1)
                V[q] = -(ell[nb] * N[nb, comp] * np.exp(-d2 / (2 * sig ** 2))).sum() / (2 * np.pi * sig ** 2)
        return V
    vx = splat(np.stack(np.meshgrid(xs[:-1] + h / 2, xs), -1).reshape(-1, 2), 0)   # x-edge midpoints
    vz = splat(np.stack(np.meshgrid(xs, xs[:-1] + h / 2), -1).reshape(-1, 2), 1)   # z-edge midpoints
    B = bilinear_matrix(P, xs)
    A = (Gx.T @ Gx + Gz.T @ Gz) * h * h + alpha * (B.T @ sp.diags(ell) @ B) + 1e-9 * sp.identity(n * n)
    chi = spsolve(A.tocsc(), (Gx.T @ vx + Gz.T @ vz) * h * h).reshape(n, n)
    iso = 0.0 if alpha > 0 else np.average(B @ chi.ravel(), weights=ell)
    return chi, iso


arc = orbit(24, start=-60, span=210, rng=rng, jitter=0.15)      # cameras on 210 degrees only
arc_scans = [(R, t, render_depth(R, t, sigma=0.02, rng=rng)) for R, t in arc]
P_arc, N_arc = oriented_points(arc_scans)
xs, _ = make_grid(128)
for alpha in (0.0, 32.0):
    chi, iso = screened_poisson(P_arc, N_arc, xs, alpha)
    pts = sample_segments(marching_squares(chi - iso, xs))
    print("alpha = %4.1f: chi in [%+.2f, %+.2f], iso %.3f, mean |sdf| of the curve %.1f mm"
          % (alpha, chi.min(), chi.max(), iso, 1000 * np.abs(scene_sdf(pts)).mean()))
```

```text
alpha =  0.0: chi in [-0.62, +0.95], iso 0.276, mean |sdf| of the curve 60.5 mm
alpha = 32.0: chi in [-0.54, +0.54], iso 0.000, mean |sdf| of the curve 22.7 mm
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-poisson.svg" localized="true" caption="Reconstruction from 24 scans on an arc of 210° (purple: camera directions). Left: TSDF fusion keeps only what was seen; the lower left of the disk and the left side of the box stay open (gray: unobserved). Middle: plain Poisson closes every hole, but the indicator drifts (from $-0.62$ to $+0.95$, iso-value 0.276) and the unobserved side of the box bulges into a blob; the mean $\lvert f\rvert$ of the curve is 60.5 mm. Right: screened Poisson ($\alpha$ = 32) keeps $\chi$ within $\pm 0.54$, hugs the samples (red) and closes the holes tightly (22.7 mm). The yellow dashed curve is the truth." %}

The figure is a fair summary of the trade-off. TSDF fusion is honest: where it has no data, it has no surface. Poisson is complete: it always returns a closed surface, and where it has no data it returns the smoothest guess. Screening makes the guess stay closer to the data, but it is still a guess, and section 8 will show how evaluation metrics treat it. Real pipelines remove the least supported parts of a Poisson mesh by trimming faces whose sample density is low (the `SurfaceTrimmer` tool of the PoissonRecon code, or a density threshold in Open3D).

### 4.4 Other meshers, and texturing

Two other families are worth knowing. **Visibility-based Delaunay meshing**, used by OpenMVS and by COLMAP's `delaunay_mesher`, tetrahedralizes the points and labels each tetrahedron inside or outside with a graph cut that uses the lines of sight from the cameras (a ray from a camera to a point crosses only free space). It keeps sharp details and handles large outdoor scenes well. **Ball pivoting** rolls a ball over the points and connects triples it touches; it interpolates the points exactly but leaves holes wherever the sampling is sparser than the ball.

Finally, a mesh for viewing needs **texture**: each triangle picks the image that sees it best (close, frontal and sharp), neighbouring triangles prefer the same image to avoid seams (a Markov random field over the labels), and a global colour adjustment hides the remaining exposure differences, as in the method of Waechter, Moehrle and Goesele (ECCV 2014) used by many open pipelines.

## 5. The classical pipeline in practice

With COLMAP, the whole chain from images to a mesh is a handful of commands (from the COLMAP command-line documentation; this block is not run in this post):

```bash
colmap feature_extractor --database_path db.db --image_path images
colmap exhaustive_matcher --database_path db.db
mkdir sparse
colmap mapper --database_path db.db --image_path images --output_path sparse
colmap image_undistorter --image_path images --input_path sparse/0 --output_path dense --output_type COLMAP
colmap patch_match_stereo --workspace_path dense --workspace_format COLMAP --PatchMatchStereo.geom_consistency true
colmap stereo_fusion --workspace_path dense --workspace_format COLMAP --input_type geometric --output_path dense/fused.ply
colmap poisson_mesher --input_path dense/fused.ply --output_path dense/meshed-poisson.ply
colmap delaunay_mesher --input_path dense --output_path dense/meshed-delaunay.ply
```

The stages map onto this series: features and matching (post 3), incremental SfM with bundle adjustment (post 5; `glomap mapper` is the global alternative), undistortion (post 1), PatchMatch MVS with geometric consistency (post 7), fusion, and meshing. COLMAP's `stereo_fusion` is not a TSDF: it merges depth-map pixels that agree in depth and normal across several views into points, which suits unbounded outdoor scenes where a voxel grid would be wasteful. Open3D, by contrast, offers TSDF fusion for RGB-D sequences.

Where does the chain fail? Almost always early. Textureless walls, reflections and repetitive patterns break matching; too little overlap or a pure rotation breaks SfM (post 4 explains the degeneracies); a few wrong cameras then poison everything downstream. MVS struggles with the same textureless and specular regions, and the fused cloud gets holes and floaters there. This is the gap that learned methods attack: a network trained on millions of images has priors about walls, floors and object shapes that a photo-consistency score lacks.

## 6. Neural surfaces

### 6.1 Why not take NeRF's density?

A NeRF ([neural rendering post 2]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})) fits a density $\sigma(\mathbf x)$ and a colour so that volume rendering reproduces the images. One could extract a mesh at some density level, but the result is poor. Nothing in the photometric loss asks the density to be concentrated on a surface: a semi-transparent cloud that renders the right colours is just as good, so the level set is noisy, and the right threshold differs from place to place. Neural surface methods change the representation: they store a **signed distance function** $f$, whose zero level set is the surface by definition, and derive the density from it. The question is how.

### 6.2 From an SDF to rendering weights: the bias problem

Along a ray $\mathbf r(t) = \mathbf o + t\,\mathbf d$, volume rendering forms the colour as $C = \int w(t)\,\mathbf c(t)\,dt$ with weights $w(t) = T(t)\,\sigma(t)$ and transmittance $T(t) = \exp(-\int\_0^t \sigma)$. We want two properties from the weights:

- **unbiased**: for a surface crossed by the ray, $w$ peaks exactly where the ray meets the surface, $f(\mathbf r(t^\ast)) = 0$, so that the rendered depth and colour come from the surface;
- **occlusion-aware**: if the ray meets two surfaces, the nearer one gets (almost) all the weight.

Let $\Phi\_s(x) = 1/(1 + e^{-sx})$ be the sigmoid with sharpness $s$ and $\phi\_s = \Phi\_s'$ its derivative, the logistic density, a bump of width about $1/s$. The obvious choice is the **naive** density $\sigma(t) = \phi\_s(f(\mathbf r(t)))$: large near the surface, small elsewhere. Is it unbiased? Take a plane met at incidence angle $\theta$, so that $f(\mathbf r(t)) = -c\,(t - t^\ast)$ with $c = \cos\theta$. The weight peaks where $w' = T(\sigma' - \sigma^2) = 0$, that is, where $\sigma' = \sigma^2$. Write $\Phi = \Phi\_s(f)$; then $\sigma = s\Phi(1-\Phi)$ and $\sigma' = -c\,s^2\Phi(1-\Phi)(1-2\Phi)$, and the condition becomes

$$
c\,(2\Phi - 1) = \Phi(1-\Phi)
\quad\Longrightarrow\quad
\Phi^\ast = \frac{1 - 2c + \sqrt{4c^2 + 1}}{2},
\qquad
t_{\text{peak}} - t^\ast = -\frac{1}{s\,c}\,\ln\frac{\Phi^\ast}{1 - \Phi^\ast} .
$$

The peak is always **in front of** the surface. Head-on ($c = 1$), $\Phi^\ast = (\sqrt5 - 1)/2 = 0.618$ (the golden ratio, as it happens) and the bias is $-0.481/s$; at grazing angles it grows like $1/\cos\theta$. The intuition: the density starts to absorb light before the ray reaches the zero crossing, so the transmittance has already dropped by the time $\sigma$ peaks. A different simple choice, the normalized bump $w = \phi\_s(f)/\int\phi\_s(f)$, is unbiased but ignores occlusion: every surface along the ray gets the same weight.

**NeuS** (Wang et al. 2021) derives a density that has both properties. Start from what we want for a plane: the weight should be the bump itself, $w(t) = c\,\phi\_s(f(\mathbf r(t)))$, which peaks at $t^\ast$. Since $\frac{d}{dt}\Phi\_s(f(\mathbf r(t))) = -c\,\phi\_s(f)$, this happens exactly when the transmittance equals $T(t) = \Phi\_s(f(\mathbf r(t)))$: it is close to 1 far in front of the surface (large positive $f$) and falls to 0 behind it. A transmittance determines its density through $\sigma = -T'/T$, which gives the **opaque density**

$$
\rho(t) = \max\left( \frac{-\frac{d}{dt}\Phi_s\big(f(\mathbf r(t))\big)}{\Phi_s\big(f(\mathbf r(t))\big)},\; 0 \right),
$$

where the clamp at zero handles the general case: when the ray leaves an object, $\Phi\_s$ increases again and the formula would give a negative density. Integrating $\rho$ between two samples $t\_i$ and $t\_{i+1}$ gives $\int \rho\,dt = -\ln(\Phi\_s(f\_{i+1}) / \Phi\_s(f\_i))$, so the opacity of a segment is

$$
\alpha_i = 1 - \exp\Big(-\int_{t_i}^{t_{i+1}} \rho\,dt\Big) = \max\left( \frac{\Phi_s(f_i) - \Phi_s(f_{i+1})}{\Phi_s(f_i)},\; 0 \right),
$$

and the usual compositing $w\_i = T\_i\alpha\_i$, $T\_i = \prod\_{j<i}(1 - \alpha\_j)$ does the rest. The sharpness $s$ is a learned parameter: early in training $1/s$ is large and the weights are spread out, which helps optimization; as the surface sharpens, $s$ grows.

### 6.3 Checking the claims numerically

```python
def sigmoid(x):
    return 0.5 * (1 + np.tanh(0.5 * x))          # = 1 / (1 + exp(-x)), without overflow


def weights_from_alpha(alpha):
    """w_i = T_i alpha_i with T_i = prod_{j<i} (1 - alpha_j), the volume rendering weights."""
    T = np.concatenate([np.ones(alpha.shape[:-1] + (1,)), np.cumprod(1 - alpha, -1)[..., :-1]], -1)
    return T * alpha


def alpha_naive(f, s, dt):
    """Density sigma = phi_s(f), the logistic density of the SDF: alpha = 1 - exp(-sigma dt)."""
    phi = s * sigmoid(s * f) * (1 - sigmoid(s * f))
    return 1 - np.exp(-phi[..., :-1] * dt)


def alpha_neus(f, s):
    """NeuS: alpha_i = max((Phi_s(f_i) - Phi_s(f_{i+1})) / Phi_s(f_i), 0)."""
    Phi = sigmoid(s * f)
    return np.clip((Phi[..., :-1] - Phi[..., 1:]) / np.maximum(Phi[..., :-1], 1e-12), 0, 1)


t = np.linspace(0.0, 4.0, 8001)
dt, t_star, s = t[1] - t[0], 2.0, 20.0
for theta in (0, 60, 80):
    c = np.cos(np.deg2rad(theta))
    f = -c * (t - t_star)                        # SDF along a ray that meets a plane at t* = 2
    peak = {}
    for name, a in (("naive", alpha_naive(f, s, dt)), ("NeuS", alpha_neus(f, s))):
        peak[name] = t[np.argmax(weights_from_alpha(a))] + dt / 2 - t_star
    Phi = (1 - 2 * c + np.sqrt(4 * c * c + 1)) / 2           # the peak condition derived in 6.2
    print("theta = %2d deg: peak - t* = %+.4f (naive), %+.4f (NeuS); theory for naive %+.4f"
          % (theta, peak["naive"], peak["NeuS"], -np.log(Phi / (1 - Phi)) / (s * c)))
```

```text
theta =  0 deg: peak - t* = -0.0237 (naive), +0.0002 (NeuS); theory for naive -0.0241
theta = 60 deg: peak - t* = -0.0877 (naive), +0.0002 (NeuS); theory for naive -0.0881
theta = 80 deg: peak - t* = -0.5122 (naive), +0.0002 (NeuS); theory for naive -0.5124
```

The naive peak sits in front of the surface by the predicted amount (measured $-0.0237$, $-0.0877$ and $-0.5122$ m against the formula's $-0.0241$, $-0.0881$ and $-0.5124$ m; the differences are within the sampling of the curve), while the NeuS peak is on the surface at every angle (the $+0.0002$ is half a sample).

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-neus-weights.svg" localized="true" caption="Rendering weights $w(t)$ along one ray, $s = 20$. Left: a plane at $t^\ast = 2$ seen head-on (solid) and at 60° (dashed). The naive weights (orange) peak 2.4 cm and 8.8 cm in front of the surface; the NeuS weights (purple) peak on it. Right: a 30 cm slab followed by a second surface at $t = 3$ (green: the SDF $f(t)$, right axis). The naive density puts weight 0.612 on the front face, 0.237 on the back face and 0.094 on the hidden surface; the normalized bump $\bar\phi\_s$ (dotted) spreads 0.33-0.34 over all three; NeuS gives 0.950 to the front face, 0.000 to the back face and 0.047 to the hidden surface, which is exactly the light that leaks through the slab at this $s$." %}

The second widget lets you vary $s$, the angle and the number of samples. Note how the discrete NeuS weights (bars) stay centred on the surface even with few samples, as long as $1/s$ is not much smaller than the sample spacing; when it is, the whole weight falls into one interval and the surface position is quantized, which is why NeuS adds samples near the surface hierarchically.

{% include widget.liquid name="3d-vision-neus-weights" height="520" caption="Rendering weights from an SDF along one ray. Choose one plane or a slab followed by a second surface; drag on the plot (left/right: sharpness $s$; up/down: incidence angle $\theta$) or use the sliders. Orange: the naive density $\sigma = \phi\_s(f)$; purple: NeuS, both with 2000 samples; bars: NeuS with only $n$ samples. The readout compares the naive peak with the closed-form bias of section 6.2 and gives the total opacity of both." %}

### 6.4 The eikonal term and a tiny NeuS

A network or grid that outputs $f$ is not automatically a distance function. The **eikonal** regularizer $\mathcal L\_{\text{eik}} = \mathbb E\big[(\lVert\nabla f\rVert - 1)^2\big]$, introduced for implicit surface learning by Gropp et al. (IGR, 2020), pushes it toward one, since a true SDF has unit gradient almost everywhere. Without it, $f$ can become very steep or very flat near the surface, and the relation between $s$ and the width of the weight bump (which assumes a unit gradient) breaks.

To see the whole method at work, the next block fits a NeuS in flatland. The SDF is stored on a $96 \times 96$ grid of nodes and interpolated bilinearly (a stand-in for the MLP or hash grid of the real thing), each camera casts rays through every second pixel with 128 samples between 1.0 and 4.2 m, and the loss compares the rendered opacity $O = \sum\_i w\_i$ with the silhouette (did the ray hit anything?) and the rendered depth $D = \sum\_i w\_i t\_i$ with the true range. NeuS uses colour as its main signal and a mask term like ours as an option; in flatland, depth keeps the example short. Gradients are written out by hand: for a rendered quantity $Q = \sum\_k w\_k q\_k$, $\partial Q/\partial\alpha\_k = T\_k(q\_k - A\_{k+1})$, where $A\_k = \alpha\_k q\_k + (1 - \alpha\_k)A\_{k+1}$ is the value rendered from sample $k$ onward, and the chain rule continues through $\alpha\_k = 1 - \Phi\_{k+1}/\Phi\_k$ and $\Phi = \Phi\_s(sf)$ to the grid. (A finite-difference check of these gradients agrees to six digits.)

```python
def neus_render(g, log_s, B, t_mid, n_samp, dO=None, dD=None):
    """Opacity O and depth D of every ray for the grid SDF g. With dO = dL/dO and dD = dL/dD,
    also return dL/dg and dL/dlog_s (backpropagation written out by hand)."""
    s = np.exp(log_s)
    f = (B @ g).reshape(-1, n_samp)                 # SDF at the samples of every ray
    Phi = sigmoid(s * f)
    ratio = Phi[:, 1:] / np.maximum(Phi[:, :-1], 1e-12)
    alpha = np.clip(1 - ratio, 0, 1)
    w = weights_from_alpha(alpha)
    O, D = w.sum(1), (w * t_mid).sum(1)
    if dO is None:
        return O, D, w
    # for C = sum_k w_k c_k:  dC/dalpha_k = T_k (c_k - A_{k+1}),  A_k = alpha_k c_k + (1 - alpha_k) A_{k+1}
    T = np.concatenate([np.ones((len(f), 1)), np.cumprod(1 - alpha, 1)[:, :-1]], 1)
    c = dO[:, None] + dD[:, None] * t_mid           # both outputs at once
    A, acc = np.zeros_like(alpha), np.zeros(len(f))
    for k in range(alpha.shape[1] - 1, -1, -1):
        A[:, k] = acc
        acc = alpha[:, k] * c[:, k] + (1 - alpha[:, k]) * acc
    g_alpha = T * (c - A) * (ratio < 1)             # no gradient where alpha was clipped to 0
    pk = np.maximum(Phi[:, :-1], 1e-12)
    dPhi = np.zeros_like(Phi)
    dPhi[:, :-1] += g_alpha * Phi[:, 1:] / pk ** 2  # alpha_k = 1 - Phi_{k+1} / Phi_k
    dPhi[:, 1:] -= g_alpha / pk
    dx = dPhi * Phi * (1 - Phi)                     # dL/d(s f)
    return O, D, w, B.T @ (dx * s).ravel(), (dx * f).sum() * s


def cell_gradient(n, h):
    """Sparse Cx, Cz: the gradient of a node grid at the (n-1)^2 cell centres."""
    D = sp.diags([-np.ones(n - 1), np.ones(n - 1)], [0, 1], shape=(n - 1, n)) / h
    M = sp.diags([0.5 * np.ones(n - 1), 0.5 * np.ones(n - 1)], [0, 1], shape=(n - 1, n))
    return sp.kron(M, D).tocsr(), sp.kron(D, M).tocsr()


def eikonal(g, Cx, Cz):
    """Mean of (|grad g| - 1)^2 over the cells, and its gradient with respect to g."""
    gx, gz = Cx @ g, Cz @ g
    nrm = np.sqrt(gx ** 2 + gz ** 2) + 1e-12
    r = nrm - 1
    return np.mean(r ** 2), Cx.T @ (2 * r / nrm / len(r) * gx) + Cz.T @ (2 * r / nrm / len(r) * gz)


def fit_neus(cams, n=96, n_samp=128, t_near=1.0, t_far=4.2, iters=800, lam_d=1.0, lam_e=0.3,
             lr=0.01, log_every=(0, 50, 200, 800)):
    # rays through every second pixel, with their true silhouette (hit or not) and range
    pts, m_gt, r_gt = [], [], []
    ts = np.linspace(t_near, t_far, n_samp)
    for R, t in cams:
        u = np.arange(0, W, 2)
        ray = np.stack([(u - CX) / FOC, np.ones(len(u))], 1)
        nrm = np.linalg.norm(ray, axis=1)
        d = render_depth(R, t)[u]
        dirs = (ray / nrm[:, None]) @ R
        pts.append(-R.T @ t + ts[None, :, None] * dirs[:, None, :])
        m_gt.append(np.isfinite(d)); r_gt.append(np.nan_to_num(d * nrm))
    pts = np.concatenate(pts).reshape(-1, 2)
    m_gt, r_gt = np.concatenate(m_gt), np.concatenate(r_gt)
    t_mid = 0.5 * (ts[1:] + ts[:-1])
    xs = np.linspace(-1.6, 1.6, n)                  # SDF values on the nodes of an n x n grid
    B = bilinear_matrix(pts, xs)
    Cx, Cz = cell_gradient(n, xs[1] - xs[0])
    GX, GZ = np.meshgrid(xs, xs)
    theta = [np.sqrt(GX ** 2 + GZ ** 2).ravel() - 1.0, np.array(np.log(10.0))]   # a circle, s = 10
    m1, m2 = [np.zeros_like(p) for p in theta], [np.zeros_like(p) for p in theta]
    log = {}
    for it in range(iters + 1):
        O, D, w = neus_render(theta[0], theta[1], B, t_mid, n_samp)
        loss_e, grad_e = eikonal(theta[0], Cx, Cz)
        loss = np.mean((O - m_gt) ** 2) + lam_d * np.mean((D - r_gt)[m_gt] ** 2) + lam_e * loss_e
        if it in log_every:
            log[it] = (theta[0].reshape(n, n).copy(), float(np.exp(theta[1])), loss)
            print("iter %4d: loss %.5f, s = %6.1f" % (it, loss, np.exp(theta[1])))
        if it == iters:
            break
        dO = 2 * (O - m_gt) / len(O)
        dD = lam_d * 2 * (D - r_gt) * m_gt / m_gt.sum()
        _, _, _, grad_g, grad_s = neus_render(theta[0], theta[1], B, t_mid, n_samp, dO, dD)
        for k, gr in enumerate((grad_g + lam_e * grad_e, np.array(grad_s))):   # Adam
            m1[k] = 0.9 * m1[k] + 0.1 * gr
            m2[k] = 0.999 * m2[k] + 0.001 * gr ** 2
            theta[k] = theta[k] - lr * m1[k] / (1 - 0.9 ** (it + 1)) / (np.sqrt(m2[k] / (1 - 0.999 ** (it + 1))) + 1e-8)
    return xs, theta[0].reshape(n, n), log


xs_n, g_fit, neus_log = fit_neus(orbit(24))
pts = sample_segments(marching_squares(g_fit, xs_n))
err = 1000 * np.abs(scene_sdf(pts))
print("NeuS zero level set: mean |sdf| %.1f mm, median %.1f mm" % (err.mean(), np.median(err)))
```

```text
iter    0: loss 0.60269, s =   10.0
iter   50: loss 0.20917, s =   15.0
iter  200: loss 0.02043, s =   43.3
iter  800: loss 0.00271, s =  223.0
NeuS zero level set: mean |sdf| 16.4 mm, median 8.0 mm
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-neus-fit.svg" localized="true" caption="A NeuS-style fit of a $96 \times 96$ SDF grid to the depth and silhouettes of 24 cameras (purple). Colour: $f$ (red inside, blue outside); black: the zero level set; dashed yellow: the truth. The fit starts from a circle of radius 1 m with $s$ = 10. After 50 Adam steps the circle has begun to deform toward the silhouettes; after 200 steps the three objects are separated; after 800 steps the learned sharpness has grown to $s$ = 223 and the zero level set has a median distance of 8.0 mm to the true surface (mean 16.4 mm, raised by small spurious contours inside the box, where no ray ever looks)." %}

The evolution in the figure is typical of neural surface methods: a coarse shape appears quickly, $s$ grows as the surface becomes consistent with the observations, and fine details come last. Regions that no ray constrains (here, the inside of the objects) are governed only by the regularizer, which is why the eikonal term and good initialization matter so much.

### 6.5 Neuralangelo, and the Gaussian route

NeuS with an MLP is slow and smooths away detail. **Neuralangelo** (Li et al. 2023) stores the SDF in a multi-resolution hash grid ([fast radiance fields]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})) and makes two changes that let it reach fine detail on large scenes: it computes the gradients needed by the eikonal term with **numerical** finite differences whose step shrinks during training (analytic gradients of a hash grid are local to one cell and noisy), and it optimizes the hash levels **coarse to fine**. VolSDF (Yariv et al. 2021) is the other classic of this family: it defines the density as a scaled Laplace cumulative distribution of $-f$ and bounds the opacity error of its sampling.

The newest surface methods start from Gaussian splatting instead. A 3D Gaussian has no well-defined depth along a ray, so **2D Gaussian splatting** (Huang et al. 2024) flattens each primitive into an oriented disk whose intersection with every ray is exact, and adds a depth-distortion and a normal-consistency loss; **Gaussian Opacity Fields** define a level set directly from the Gaussians. The [3DGS frontiers post]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}) explains both. What matters here is how 2DGS extracts its mesh: it renders depth maps from the training views and **fuses them with a TSDF**, then runs marching cubes. Sections 2 and 3 of this post are the last step of a 2024 method.

## 7. Feed-forward 3D foundation models

### 7.1 From pipelines to one network

Everything so far optimizes, per scene, with hand-designed objectives: reprojection error, photo-consistency, a rendering loss. In 2024 a different approach took off. **DUSt3R** (Wang et al., CVPR 2024) trained a transformer on a large mix of 3D datasets to map two images directly to dense 3D geometry, without known intrinsics or poses. Its successors handle many views at once (VGGT), add matching (MASt3R), run on video streams (CUT3R and the streaming variants), and predict metric scale (MapAnything, Depth Anything 3). For a casual capture of a few photos, where SfM fails or takes minutes, these models now often give the better answer, and their outputs are used to initialize or replace COLMAP in many NeRF and 3DGS pipelines.

### 7.2 DUSt3R: pointmaps

The key design decision of DUSt3R is its output. Instead of depth (which needs intrinsics to become 3D) or cameras (which need matching), it predicts **pointmaps**: for an image of $H \times W$ pixels, an array $X \in \mathbb R^{H\times W\times 3}$ that assigns a 3D point to every pixel. Given images 1 and 2, the network outputs

- $X^{1,1}$: the points seen by image 1, in **camera 1's frame**;
- $X^{2,1}$: the points seen by image 2, **also in camera 1's frame**;
- confidence maps $C^{1,1}$ and $C^{2,1}$ for both.

The notation $X^{n,m}$ means "pixels of image $n$, coordinates of camera $m$". Because both pointmaps live in one frame, the relative geometry of the two views is implicit in them: pixels of the two images that see the same surface point get the same 3D coordinates. Matching, relative pose and intrinsics can all be read off.

Architecturally, both images go through a shared ViT encoder, two decoders exchange information by cross-attention at every layer, and two DPT-style heads regress the pointmaps and confidences. Since the scene scale cannot be known from images, the regression loss compares scale-normalized pointmaps: with $\bar X$ the ground truth and $z$, $\bar z$ the mean distance of the valid points to the origin,

$$
\ell_{\text{regr}}(v, i) = \Big\lVert \tfrac{1}{z} X^{v,1}_i - \tfrac{1}{\bar z}\bar X^{v,1}_i \Big\rVert,
\qquad
\mathcal L_{\text{conf}} = \sum_{v\in\{1,2\}} \sum_i C^{v,1}_i\, \ell_{\text{regr}}(v, i) - \beta \log C^{v,1}_i .
$$

The confidence term lets the network say "I do not know" (sky, reflections, occlusions) at a price: a small $C$ reduces the weight of the error but pays $-\beta\log C$.

Here is what can be read off a pointmap, on a 3D toy scene (a ground plane, two boxes and a ball) seen by two $64 \times 48$ pinhole cameras with OpenCV axes, the convention of post 1. The "network" is simulated: it returns the true pointmaps at an unknown scale, with 2% noise in 3D and 5% wild points with low confidence.

**Focal length.** With the principal point at the image centre and square pixels, every pixel $(u\_i, v\_i)$ and its 3D point $(X\_i, Y\_i, Z\_i)$ in the camera frame must satisfy $(u\_i - c\_x, v\_i - c\_y) = f\_x\,(X\_i/Z\_i, Y\_i/Z\_i)$. DUSt3R estimates $f\_x$ by minimizing $\sum\_i C\_i\,\lVert (u\_i - c\_x, v\_i - c\_y) - f\_x (X\_i, Y\_i)/Z\_i \rVert$, a robust (non-squared) cost solved by the Weiszfeld algorithm: alternate a weighted least-squares solve with weights $C\_i / r\_i$, where $r\_i$ is the current residual.

**Relative pose.** Run the network a second time with the images swapped to get $X^{1,2}$, the points of image 1 in camera 2's frame. Then $X^{1,1}$ and $X^{1,2}$ are the same points in two frames, related by a similarity transform, and the Umeyama (Procrustes) solution recovers it in closed form from an SVD, rotation exactly and translation up to scale. (PnP with RANSAC on $X^{2,1}$ is the alternative.)

```python
H3, W3, F3 = 48, 64, 56.0                            # a small 64 x 48 pinhole camera
K3 = np.array([[F3, 0, (W3 - 1) / 2], [0, F3, (H3 - 1) / 2], [0, 0, 1]])


def sdf3(p):
    """A ground plane (y = 0.6; the OpenCV world has y down), two boxes and a ball."""
    def box(p, c, b):
        q = np.abs(p - c) - b
        return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(-1), 0)
    ground = 0.6 - p[..., 1]
    b1 = box(p, np.array([-0.5, 0.25, 0.2]), np.array([0.35, 0.35, 0.35]))
    b2 = box(p, np.array([0.55, 0.35, -0.3]), np.array([0.25, 0.25, 0.4]))
    ball = np.linalg.norm(p - np.array([0.2, 0.2, 0.7]), axis=-1) - 0.4
    return np.minimum(np.minimum(ground, ball), np.minimum(b1, b2))


def look_at3(C, target=(0.0, 0.2, 0.0), down=(0.0, 1.0, 0.0)):
    """World-to-camera (R, t) with OpenCV axes: x right, y down, z forward."""
    z = np.asarray(target, float) - C
    z /= np.linalg.norm(z)
    x = np.cross(down, z)
    x /= np.linalg.norm(x)
    R = np.stack([x, np.cross(z, x), z])
    return R, -R @ C


def render_pointmap(R, t):
    """The pointmap X^{v,v}: per pixel, the 3D point in the camera's own frame (NaN for sky)."""
    v, u = np.mgrid[0:H3, 0:W3].astype(float)
    rays = np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(K3).T    # K^-1 (u, v, 1)
    dirs = rays / np.linalg.norm(rays, axis=-1, keepdims=True)
    C, dw = -R.T @ t, dirs @ R
    s = np.zeros((H3, W3))
    for _ in range(160):
        s += np.where(s < 12, sdf3(C + s[..., None] * dw), 0)
    X = s[..., None] * dirs
    X[s >= 12] = np.nan
    return X


def focal_from_pointmap(X, conf, iters=10):
    """argmin_f sum_i C_i || (u_i - c) - f (X_i, Y_i) / Z_i ||, by Weiszfeld (iteratively reweighted LS)."""
    v, u = np.mgrid[0:H3, 0:W3].astype(float)
    a = np.stack([u - (W3 - 1) / 2, v - (H3 - 1) / 2], -1).reshape(-1, 2)   # pixel minus centre
    b = (X[..., :2] / X[..., 2:]).reshape(-1, 2)
    ok = np.isfinite(b).all(1)
    a, b, c = a[ok], b[ok], conf.reshape(-1)[ok]
    f = (c * (a * b).sum(1)).sum() / (c * (b * b).sum(1)).sum()             # least squares
    for _ in range(iters):
        w = c / np.maximum(np.linalg.norm(a - f * b, axis=1), 1e-9)
        f = (w * (a * b).sum(1)).sum() / (w * (b * b).sum(1)).sum()
    return f


def umeyama(A, B, w=None):
    """Similarity (s, R, t) minimizing sum_i w_i || s R A_i + t - B_i ||^2."""
    w = np.ones(len(A)) if w is None else w
    w = w / w.sum()
    ma, mb = w @ A, w @ B
    A0, B0 = A - ma, B - mb
    U, S, Vt = np.linalg.svd((B0 * w[:, None]).T @ A0)
    E = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])
    R = U @ E @ Vt
    s = np.trace(np.diag(S) @ E) / (w @ (A0 ** 2).sum(1))
    return s, R, mb - s * R @ ma


def fake_network(X, scale, rng):
    """Stand-in for DUSt3R's output: unknown scale, 2% 3D noise, 5% wild points with low confidence."""
    r = np.linalg.norm(X, axis=-1, keepdims=True)
    Y = X + 0.02 * r * rng.standard_normal(X.shape)
    wild = rng.random(X.shape[:2]) < 0.05
    Y[wild] += 0.5 * r[wild] * rng.standard_normal((wild.sum(), 3))
    return scale * Y, np.where(wild, 1.1, 3.0)


rng = np.random.default_rng(1)
R1, t1 = look_at3(np.array([0.3, -1.4, -3.0]))
R2, t2 = look_at3(np.array([2.2, -1.2, -2.2]))
R21, t21 = R2 @ R1.T, t2 - R2 @ R1.T @ t1          # camera 1 -> camera 2
X11, X22 = render_pointmap(R1, t1), render_pointmap(R2, t2)
X21 = (X22 - t21) @ R21                             # image 2's points in camera 1's frame
X12 = X11 @ R21.T + t21                             # image 1's points in camera 2's frame
P11, C11 = fake_network(X11, 0.4, rng)
P12, C12 = fake_network(X12, 0.4, rng)
print("focal: true %.1f, least squares %.2f, Weiszfeld %.2f"
      % (F3, focal_from_pointmap(P11, C11, iters=0), focal_from_pointmap(P11, C11)))
ok = np.isfinite(P11).all(-1)
s_, R_, t_ = umeyama(P11[ok], P12[ok], (C11 * C12)[ok])
ang = np.degrees(np.arccos(np.clip((np.trace(R_ @ R21.T) - 1) / 2, -1, 1)))
cosd = t_ @ t21 / np.linalg.norm(t_) / np.linalg.norm(t21)
print("relative pose: rotation error %.2f deg, translation direction error %.1f deg"
      % (ang, np.degrees(np.arccos(cosd))))
```

```text
focal: true 56.0, least squares 12.38, Weiszfeld 55.08
relative pose: rotation error 0.85 deg, translation direction error 7.5 deg
```

The ordinary least-squares focal is wrecked by the wild points (12.38 instead of 56): a point with a wrong depth near zero has a huge $X/Z$ and dominates a squared cost. The Weiszfeld estimate is within 2% of the truth. The rotation comes out within a degree; the translation direction is less accurate (7.5°), because it is estimated from the noisy points themselves and the baseline is short compared with the scene depth, the same conditioning issue that post 4 meets in two-view geometry.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-pointmap.svg" localized="true" caption="Pointmaps of the 3D toy scene. Left: top view of the two cameras (purple: 1, orange: 2) and the object points they see (ground omitted). Middle: $X^{1,1}$ and $X^{2,1}$ shown as images, with $(X, Y, Z)$ in camera 1's frame mapped to RGB by the same colour scale (white: sky). Wherever the two images see the same surface, the colours agree, although the pixels are in different places: correspondence is built into the representation. Right: the focal cost of the simulated network output against $f\_x$ (each curve divided by its minimum). The robust L1 cost has its minimum at 55.1 px, next to the truth (56, black line); the squared cost is pulled to 12.5 px by the 5% wild points." %}

### 7.3 Many views: global alignment

DUSt3R sees two images at a time. For $N$ images it runs on many pairs (edges of a graph $\mathcal E$) and then solves a **global alignment**: find a world pointmap $\chi^v$ for every image and a similarity $(\sigma\_e, P\_e)$ for every pair, such that each pair's predictions, moved into the world, agree with the world pointmaps:

$$
\min_{\chi, P, \sigma} \sum_{e \in \mathcal E} \sum_{v \in e} \sum_i C^{v,e}_i \,\big\lVert \chi^v_i - \sigma_e P_e X^{v,e}_i \big\rVert
\qquad\text{subject to } \prod_e \sigma_e = 1 .
$$

The constraint fixes the overall scale (without it, everything could shrink to zero). DUSt3R optimizes this with gradient descent and parameterizes $\chi^v$ by a depth map and a camera, so that cameras come out directly. Our toy version keeps the idea in its simplest form, with squared distances and alternating closed-form steps: given the world pointmaps, fit every pair's similarity by Umeyama; given the similarities, set each world pointmap to the confidence-weighted average of the transformed predictions; renormalize the scales. It starts from a chain: the first pair defines the world, and each further pair is attached through a view that is already placed.

```python
def global_align(edges, pm, conf, n_views, iters=30):
    """edges[e] = (a, b); pm[e] = (X^{a,e}, X^{b,e}), both in camera a's frame at an unknown scale;
    conf[e] = their confidences. Finds world pointmaps chi[v] and similarities (s_e, R_e, t_e) with
    chi[v] ~ s_e R_e X^{v,e} + t_e, under the gauge prod_e s_e = 1."""
    chi = [None] * n_views
    a, b = edges[0]
    chi[a], chi[b] = pm[0][0].copy(), pm[0][1].copy()    # pair 0 defines the initial world frame
    placed = {a, b}
    while len(placed) < n_views:                         # chain the other pairs onto it
        for e, (a, b) in enumerate(edges):
            if (a in placed) != (b in placed):
                k = 0 if a in placed else 1
                s, R, t = umeyama(pm[e][k], chi[edges[e][k]], conf[e][k])
                chi[edges[e][1 - k]] = s * pm[e][1 - k] @ R.T + t
                placed.add(edges[e][1 - k])
    chi_init, history = [c.copy() for c in chi], []
    for it in range(iters):
        sim = [umeyama(np.concatenate(pm[e]), np.concatenate([chi[a], chi[b]]), np.concatenate(conf[e]))
               for e, (a, b) in enumerate(edges)]       # step 1: every pair's similarity
        g = np.exp(np.mean([np.log(s) for s, _, _ in sim]))
        sim = [(s / g, R, t / g) for s, R, t in sim]     # gauge: geometric mean of the scales = 1
        num = [np.zeros_like(c) for c in chi]
        den = [np.zeros(len(c)) for c in chi]
        res = wsum = 0.0
        for e, (a, b) in enumerate(edges):               # step 2: average the aligned pointmaps
            s, R, t = sim[e]
            for k, v in enumerate((a, b)):
                Y = s * pm[e][k] @ R.T + t
                num[v] += conf[e][k][:, None] * Y
                den[v] += conf[e][k]
                res += (conf[e][k] * ((Y - chi[v] / g) ** 2).sum(1)).sum()
                wsum += conf[e][k].sum()
        chi = [num[v] / den[v][:, None] for v in range(n_views)]
        history.append(np.sqrt(res / wsum))
    return chi_init, chi, sim, history


def small_rotation(deg, rng):
    ax = rng.standard_normal(3)
    ax /= np.linalg.norm(ax)
    Kx = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    th = np.deg2rad(deg)
    return np.eye(3) + np.sin(th) * Kx + (1 - np.cos(th)) * Kx @ Kx


rng = np.random.default_rng(2)
n_views = 8
cams3 = [look_at3(3.2 * np.array([np.cos(a), -0.4, np.sin(a)])) for a in np.deg2rad(-90 + 45 * np.arange(n_views))]
Xw = []                                              # world points of the valid pixels of each view
for R, t in cams3:
    X = render_pointmap(R, t)[::2, ::2].reshape(-1, 3)
    Xw.append((X[np.isfinite(X).all(1)] - t) @ R)
edges = [(k, (k + 1) % n_views) for k in range(n_views)] + [(k, (k + 2) % n_views) for k in range(n_views)]
pm, conf = [], []
for a, b in edges:                                   # simulated pairwise predictions
    Ra, ta = cams3[a]
    E = small_rotation(2.0, rng)                     # this pair's relative pose is 2 degrees off
    pair = []
    for Y in (Xw[a] @ Ra.T + ta, (Xw[b] @ Ra.T + ta) @ E.T):
        Y = Y + 0.01 * np.linalg.norm(Y, axis=1, keepdims=True) * rng.standard_normal(Y.shape)
        pair.append(Y)
    scale = rng.uniform(0.5, 2.0)                    # each pair has its own unknown scale
    pm.append((scale * pair[0], scale * pair[1]))
    conf.append((np.ones(len(pair[0])), np.ones(len(pair[1]))))
world_init, world, sim, history = global_align(edges, pm, conf, n_views)


def rms_to_truth(chi):
    A, B = np.concatenate(chi), np.concatenate(Xw)
    s, R, t = umeyama(A, B)                          # compare up to a similarity
    return np.sqrt(((s * A @ R.T + t - B) ** 2).sum(1).mean())


print("RMS error after chaining: %.3f m, after global alignment: %.3f m"
      % (rms_to_truth(world_init), rms_to_truth(world)))
```

```text
RMS error after chaining: 0.222 m, after global alignment: 0.078 m
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-global-alignment.svg" localized="true" caption="Global alignment of 16 simulated pairwise predictions for 8 views around the toy scene (top view of the object points, colour = view). Each pair has its own random scale, 1% noise and a 2° error in its relative pose. Left: the ring pairs as predicted, each in its own frame and scale. Middle left: chaining the pairs one after another accumulates the pose errors (RMS error 0.222 m after the best similarity to the truth); the boxes and the ball are smeared. Middle right: global alignment spreads the errors over all pairs (0.078 m). Right: its weighted RMS residual over 30 iterations; it levels off because the 2° errors are inconsistent with every single world." %}

This is the same story as SLAM's loop closure ([post 6]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})) and as global SfM (post 5): local estimates are chained, errors accumulate, and a global optimization over all constraints distributes them. It is also DUSt3R's bottleneck: the number of pairs grows quadratically with the number of images, and the optimization takes time. The next generation removes it.

### 7.4 MASt3R: matching on top of 3D

**MASt3R** (Leroy, Cabon and Revaud, ECCV 2024) adds a head that outputs a dense local descriptor per pixel, trained with a contrastive matching loss, and trains the pointmaps at metric scale where the data allow it. Pixel matches then come from nearest neighbours in descriptor space, refined by a fast coarse-to-fine reciprocal matching scheme, and they are far more precise than matches read off the pointmaps alone. **MASt3R-SfM** (3DV 2025) builds a complete SfM pipeline on these matches, with image retrieval from the encoder features and a global optimization in two stages (3D matching, then 2D reprojection), and works where classical SfM fails, for example with pure rotation or very few images. **MASt3R-SLAM** (CVPR 2025) uses the same priors for dense monocular SLAM at about 15 frames per second.

### 7.5 VGGT: many views in one pass

**VGGT** (Wang et al., CVPR 2025, best paper) is a large transformer that takes one to hundreds of images at once and predicts, for every image, the camera intrinsics and extrinsics, a depth map, a pointmap and features for point tracking, without any post-processing optimization. Its architecture alternates two kinds of attention over the patch tokens: **frame-wise** attention within each image and **global** attention across all images, so that information is exchanged between views at every layer; each image also gets a camera token from which a small head regresses its camera. The first image defines the world frame.

Two findings of the paper are worth remembering. Predicting depth and cameras and unprojecting them gives more accurate 3D points than its own direct pointmap head, which says that the factored output (depth plus camera, the classical parameterization of posts 1 and 7) is easier to learn than raw points. And the predictions are good initializations for classical bundle adjustment, which improves them further: feed-forward and optimization are complementary, not rivals.

### 7.6 2025-2026 successors (as of November 2026)

The field moves fast; this list is a snapshot of verified works, with their status as of November 2026.

| Work | Status | Idea |
| --- | --- | --- |
| Fast3R (Yang et al.) | CVPR 2025 | DUSt3R generalized to many views in one pass; the project reports 1000+ images, no global alignment |
| CUT3R (Wang et al.) | CVPR 2025 | A recurrent model with a persistent state, updated by each new image; online metric pointmaps |
| MASt3R-SLAM (Murai et al.) | CVPR 2025 | Real-time dense SLAM on MASt3R's two-view priors |
| MonST3R (Zhang et al.) | ICLR 2025 | Pointmaps per time step for dynamic scenes |
| StreamVGGT (Zhuo et al.) | arXiv preprint, July 2025 | A causal VGGT with cached keys and values, distilled from VGGT, for streaming input |
| $\pi^3$ (Wang et al.) | ICLR 2026 (per the authors' repository) | Permutation-equivariant: no reference view; predicts affine-invariant poses and scale-invariant local pointmaps |
| MapAnything (Keetha et al.) | 3DV 2026 | Metric reconstruction from images plus any optional inputs (intrinsics, poses, depth) through a factored output: depth maps, ray maps, poses and a metric scale |
| Depth Anything 3 (Lin et al.) | ICLR 2026 | A plain transformer with a single depth-ray target for any number of views, posed or not |
| LongStream (Cheng et al.) | CVPR 2026 | Streaming reconstruction of kilometre-scale sequences with keyframe-relative poses and decoupled scale |

Three trends run through the list. **Output parameterization** has moved from raw pointmaps toward factored outputs (depth, rays or cameras, scale), echoing VGGT's finding. **Reference frames** are being removed ($\pi^3$) or made relative (LongStream), because anchoring everything to the first image hurts long and unordered inputs. And **streaming** variants with bounded memory (CUT3R, StreamVGGT, LongStream and a wave of 2026 preprints) bring the models to SLAM-like settings.

### 7.7 What feed-forward models do and do not give you

They give cameras and dense geometry in seconds, from few images and without calibration, with priors that fill textureless regions where photo-consistency has nothing to work with. What they do not give: guarantees. A network can be confidently wrong on a scene unlike its training data, scale is only as good as the metric training data, and accuracy on large scenes with many high-resolution images is still typically below a carefully run COLMAP plus MVS. The pragmatic recipe in 2026 is hybrid: initialize with a feed-forward model, then refine with bundle adjustment (post 5) and, if you need a surface, with one of the optimization methods of sections 2 to 6.

## 8. Evaluation

### 8.1 Accuracy, completeness and the F-score

Given a reconstructed surface $\mathcal R$ and a ground-truth surface $\mathcal G$, both sampled densely, two distances answer two different questions:

$$
\text{acc} = \frac{1}{\lvert\mathcal R\rvert}\sum_{\mathbf r\in\mathcal R} \min_{\mathbf g\in\mathcal G}\lVert\mathbf r - \mathbf g\rVert,
\qquad
\text{comp} = \frac{1}{\lvert\mathcal G\rvert}\sum_{\mathbf g\in\mathcal G} \min_{\mathbf r\in\mathcal R}\lVert\mathbf g - \mathbf r\rVert .
$$

**Accuracy** asks whether what you reconstructed is correct; **completeness** whether you reconstructed everything. Their mean is the **Chamfer distance** reported on DTU. Mean distances are sensitive to a few far outliers, so Tanks and Temples and ETH3D threshold them instead: with a tolerance $\tau$,

$$
P(\tau) = \frac{\lvert\{\mathbf r \in\mathcal R: d(\mathbf r, \mathcal G) < \tau\}\rvert}{\lvert\mathcal R\rvert},
\qquad
R(\tau) = \frac{\lvert\{\mathbf g \in\mathcal G: d(\mathbf g, \mathcal R) < \tau\}\rvert}{\lvert\mathcal G\rvert},
\qquad
F(\tau) = \frac{2PR}{P + R} .
$$

Precision $P$ punishes surfaces that should not be there (floaters, hallucinated fills), recall $R$ punishes missing surfaces, and the harmonic mean $F$ is high only if both are.

```python
def evaluate(rec, gt, tau):
    """Accuracy and completeness (mean distances), and precision, recall and F-score at tau."""
    d_rec = cKDTree(gt).query(rec)[0]            # reconstruction -> ground truth
    d_gt = cKDTree(rec).query(gt)[0]             # ground truth -> reconstruction
    P, R = (d_rec < tau).mean(), (d_gt < tau).mean()
    return dict(acc=d_rec.mean(), comp=d_gt.mean(), P=P, R=R, F=2 * P * R / max(P + R, 1e-12))


xs_f, Pf = make_grid(1600)                       # ground truth: the zero level set at 2 mm
gt = sample_segments(marching_squares(scene_sdf(Pf).reshape(1600, 1600), xs_f))
xs, F, Wt = tsdf_fuse(arc_scans)
recs = {"TSDF": sample_segments(marching_squares(F, xs, Wt > 0))}
for alpha in (0.0, 32.0):
    chi, iso = screened_poisson(P_arc, N_arc, xs, alpha)
    recs["Poisson a=%g" % alpha] = sample_segments(marching_squares(chi - iso, xs))
for name, rec in recs.items():
    for tau in (0.01, 0.02, 0.05):
        m = evaluate(rec, gt, tau)
        print("%-13s tau = %2.0f mm: acc %5.1f mm, comp %5.1f mm, P %.3f, R %.3f, F %.3f"
              % (name, 1000 * tau, 1000 * m["acc"], 1000 * m["comp"], m["P"], m["R"], m["F"]))
```

```text
TSDF          tau = 10 mm: acc   4.1 mm, comp  15.4 mm, P 0.935, R 0.853, F 0.892
TSDF          tau = 20 mm: acc   4.1 mm, comp  15.4 mm, P 0.978, R 0.887, F 0.930
TSDF          tau = 50 mm: acc   4.1 mm, comp  15.4 mm, P 0.999, R 0.913, F 0.954
Poisson a=0   tau = 10 mm: acc  60.5 mm, comp  34.1 mm, P 0.466, R 0.483, F 0.474
Poisson a=0   tau = 20 mm: acc  60.5 mm, comp  34.1 mm, P 0.628, R 0.637, F 0.633
Poisson a=0   tau = 50 mm: acc  60.5 mm, comp  34.1 mm, P 0.754, R 0.776, F 0.765
Poisson a=32  tau = 10 mm: acc  22.8 mm, comp  17.6 mm, P 0.738, R 0.759, F 0.748
Poisson a=32  tau = 20 mm: acc  22.8 mm, comp  17.6 mm, P 0.791, R 0.823, F 0.806
Poisson a=32  tau = 50 mm: acc  22.8 mm, comp  17.6 mm, P 0.870, R 0.903, F 0.886
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-fscore.svg" localized="true" caption="Evaluating the arc reconstructions of section 4. Left two: the reconstructed points coloured by their distance to the truth, and in gray the true surface missed by more than 2 cm. TSDF misses the unseen sides but is accurate where it reconstructs; screened Poisson closes the holes, but the closure (yellow) is up to 40 mm and more off. Right: precision (dashed), recall (dotted) and F-score (solid) against $\tau$. At $\tau$ = 2 cm TSDF reaches P = 0.978, R = 0.887, F = 0.930, screened Poisson P = 0.791, R = 0.823, F = 0.806." %}

The numbers make the trade-off of section 4 precise. Screened Poisson's filled holes do not buy recall at a 2 cm tolerance, because the guessed surface is more than 2 cm off, but they cost precision; even at 5 cm, its recall (0.903) is still slightly below TSDF's (0.913). Plain Poisson is far worse (F = 0.633 at 2 cm). In other words, a watertight mesh is a product requirement, not a quality measure, and a fair comparison always states $\tau$ and reports both $P$ and $R$.

Real evaluations add a few steps our toy does not need: the reconstruction is first **aligned** to the ground truth (by the given cameras, or by a similarity transform and ICP for methods with unknown scale), it is **cropped** to the region where ground truth exists, and the ground truth is restricted to what the input cameras could see (DUSt3R-style methods that hallucinate unseen parts would otherwise be unfairly rewarded or punished).

### 8.2 The benchmarks

| Benchmark | Scenes | Ground truth | Main metric |
| --- | --- | --- | --- |
| DTU (Aanæs et al., IJCV 2016) | 80 table-top scenes in a lab, 49 or 64 calibrated views each, seven lighting conditions | structured-light scans | accuracy, completeness and their mean (Chamfer, in mm); neural-surface papers usually report a 15-scan subset with object masks |
| Tanks and Temples (Knapitsch et al., ACM TOG 2017) | large indoor and outdoor scenes, video input, intermediate and advanced sets | industrial laser scanner | precision, recall and F-score at a per-scene $\tau$ |
| ETH3D (Schöps et al., CVPR 2017) | high-resolution DSLR images and multi-camera videos, indoor and outdoor | laser scans | F1 score at several tolerances, 2 cm being the usual headline |

DTU is clean and object-centric, which made it the default for neural surfaces; Tanks and Temples and ETH3D test whole pipelines on real, large and messy scenes. Feed-forward models are usually also evaluated on the quality of the cameras they predict: the relative rotation and translation angle errors between pairs of views, summarized by the area under the accuracy curve up to a threshold (for example AUC@30 on CO3D or RealEstate10K), and on pointmap or depth accuracy after a similarity alignment.

## 9. Choosing a method

| Situation | A good default in 2026 | Why |
| --- | --- | --- |
| RGB-D camera, real time | TSDF fusion with voxel hashing (KinectFusion family, Open3D) | depth is given; fusion is local, robust and fast |
| Many photos, maximum accuracy | COLMAP or GLOMAP, PatchMatch MVS, fusion, Poisson or Delaunay meshing | each stage is mature; scales to thousands of images |
| Same, but a smooth or detailed surface matters more than speed | Neuralangelo, 2DGS or Gaussian Opacity Fields on COLMAP cameras | joint optimization, fills weakly textured regions with smooth priors |
| Few photos, casual capture, unknown cameras | VGGT, MASt3R(-SfM), $\pi^3$, MapAnything or Depth Anything 3, then bundle adjustment | priors replace missing overlap and texture; seconds instead of minutes |
| Video stream, online | MASt3R-SLAM, CUT3R or a streaming VGGT variant; classical SLAM (post 6) where guarantees matter | bounded memory, incremental output |
| A closed mesh for printing or simulation | screened Poisson on oriented points, then trimming | always watertight; screening keeps it close to the data |

## Try it

- In the **TSDF widget** of section 2, take four scans from one side only and switch on "show weights": see where the field knows nothing. Then set $\mu$ to 20 cm and orbit: watch the bar disappear, and bring it back by lowering $\mu$ without rescanning.
- In the **NeuS widget** of section 6, set $\theta = 70°$ and compare the naive peak with the theory as you vary $s$. Then switch to the slab, reduce $n$ to 16 and increase $s$: when does the discrete NeuS lose the surface?
- The home page's [Interactive Lab]({{ '/' | relative_url }}#lab) includes Gaussian World, a 3D Gaussian splatting viewer: the representation that 2DGS and the feed-forward Gaussian methods of the [3DGS frontiers post]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}) produce.
- Run the COLMAP commands of section 5 on 30 photos of an object on a table, then compare the Poisson and Delaunay meshes, and try a feed-forward model from its official repository on 5 of the photos.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Marching cubes: a high resolution 3D surface construction algorithm (Lorensen, Cline) | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37422) | Iso-surface extraction from grids |
| A volumetric method for building complex models from range images (Curless, Levoy) | SIGGRAPH | 1996 | [DOI](https://doi.org/10.1145/237170.237269) | Cumulative weighted signed distance: TSDF fusion |
| Poisson surface reconstruction (Kazhdan, Bolitho, Hoppe) | SGP | 2006 | [DOI](https://doi.org/10.2312/SGP/SGP06/061-070) | Watertight surfaces from oriented points |
| KinectFusion: real-time dense surface mapping and tracking (Newcombe et al.) | ISMAR | 2011 | [DOI](https://doi.org/10.1109/ISMAR.2011.6092378) | Real-time TSDF fusion with ICP tracking |
| Screened Poisson surface reconstruction (Kazhdan, Hoppe) | ACM TOG | 2013 | [DOI](https://doi.org/10.1145/2487228.2487237) | Interpolation constraints at the samples |
| Real-time 3D reconstruction at scale using voxel hashing (Nießner et al.) | ACM TOG (SIGGRAPH Asia) | 2013 | [DOI](https://doi.org/10.1145/2508363.2508374) | Sparse TSDF blocks in a hash table |
| Large-scale data for multiple-view stereopsis (Aanæs et al.) | IJCV | 2016 | [DOI](https://doi.org/10.1007/s11263-016-0902-9) | The DTU benchmark |
| Pixelwise view selection for unstructured multi-view stereo (Schönberger et al.) | ECCV | 2016 | [DOI](https://doi.org/10.1007/978-3-319-46487-9_31) | COLMAP's MVS and depth-map fusion |
| Tanks and Temples: benchmarking large-scale scene reconstruction (Knapitsch et al.) | ACM TOG | 2017 | [DOI](https://doi.org/10.1145/3072959.3073599) | F-score evaluation of full pipelines |
| A multi-view stereo benchmark with high-resolution images and multi-camera videos (Schöps et al.) | CVPR | 2017 | [CVF](https://openaccess.thecvf.com/content_cvpr_2017/html/Schops_A_Multi-View_Stereo_CVPR_2017_paper.html) | The ETH3D benchmark |
| Implicit geometric regularization for learning shapes (Gropp et al.) | ICML | 2020 | [arXiv](https://arxiv.org/abs/2002.10099) | The eikonal regularizer |
| NeuS: learning neural implicit surfaces by volume rendering for multi-view reconstruction (Wang et al.) | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.10689) | Unbiased, occlusion-aware SDF rendering |
| Volume rendering of neural implicit surfaces (Yariv et al.) | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.12052) | VolSDF: Laplace-CDF density from an SDF |
| Neuralangelo: high-fidelity neural surface reconstruction (Li et al.) | CVPR | 2023 | [arXiv](https://arxiv.org/abs/2306.03092) | Hash-grid SDFs with numerical gradients |
| DUSt3R: geometric 3D vision made easy (Wang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.14132) | Pointmaps from image pairs, global alignment |
| Grounding image matching in 3D with MASt3R (Leroy et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2406.09756) | Dense matching head on a 3D model |
| 2D Gaussian splatting for geometrically accurate radiance fields (Huang et al.) | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2403.17888) | Surfels; meshes by TSDF fusion of rendered depth |
| MASt3R-SfM: a fully-integrated solution for unconstrained structure-from-motion (Duisterhof et al.) | 3DV | 2025 | [arXiv](https://arxiv.org/abs/2409.19152) | SfM built on MASt3R |
| VGGT: visual geometry grounded transformer (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2503.11651) | Cameras, depth, points and tracks for many views in one pass |
| Fast3R: towards 3D reconstruction of 1000+ images in one forward pass (Yang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.13928) | Many-view DUSt3R without global alignment |
| Continuous 3D perception model with persistent state (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.12387) | CUT3R: recurrent, online reconstruction |
| MASt3R-SLAM: real-time dense SLAM with 3D reconstruction priors (Murai et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2412.12392) | Feed-forward priors in a SLAM system |
| $\pi^3$: permutation-equivariant visual geometry learning (Wang et al.) | ICLR (per the authors' repository) | 2026 | [arXiv](https://arxiv.org/abs/2507.13347) | No reference view |
| MapAnything: universal feed-forward metric 3D reconstruction (Keetha et al.) | 3DV | 2026 | [arXiv](https://arxiv.org/abs/2509.13414) | Metric output, optional geometric inputs |
| Depth Anything 3: recovering the visual space from any views (Lin et al.) | ICLR | 2026 | [arXiv](https://arxiv.org/abs/2511.10647) | One transformer, depth-ray targets |
| LongStream: long-sequence streaming autoregressive visual geometry (Cheng et al.) | CVPR | 2026 | [arXiv](https://arxiv.org/abs/2602.13172) | Kilometre-scale streaming |

## Learning resources

- R. Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed., 2022, chapters 12 (depth estimation) and 13 (3D reconstruction: surface representations, volumetric fusion, model-based reconstruction). Free for personal use at [szeliski.org/Book](https://szeliski.org/Book/).
- COLMAP documentation: [command-line interface](https://colmap.github.io/cli.html) and [tutorial](https://colmap.github.io/tutorial.html), which describe every command of section 5.
- [Open3D](https://www.open3d.org/): TSDF integration of RGB-D sequences, normal estimation and Poisson reconstruction in a few calls; [PoissonRecon](https://github.com/mkazhdan/PoissonRecon), the reference implementation of screened Poisson with its trimming tool.
- Code of the neural and feed-forward methods: [Totoro97/NeuS](https://github.com/Totoro97/NeuS), [NVlabs/neuralangelo](https://github.com/NVlabs/neuralangelo), [hbb1/2d-gaussian-splatting](https://github.com/hbb1/2d-gaussian-splatting), [naver/dust3r](https://github.com/naver/dust3r), [naver/mast3r](https://github.com/naver/mast3r), [facebookresearch/vggt](https://github.com/facebookresearch/vggt).
- Benchmarks: [DTU robot image data](https://roboimagedata.compute.dtu.dk/), [Tanks and Temples](https://www.tanksandtemples.org/), [ETH3D](https://www.eth3d.net/).

## Exercises

1. Show that the TSDF update with weights $w\_k = 1/\sigma\_k^2$ gives the maximum-likelihood estimate of the signed distance at a voxel when the depth readings are Gaussian with standard deviations $\sigma\_k$ and all fall inside the truncation band. What goes wrong when some readings fall outside it?

   <details markdown="1"><summary>Hint</summary>

   The likelihood of $F$ is $\prod\_k \exp(-(F - \eta\_k)^2/(2\sigma\_k^2))$; maximize its logarithm. Readings more than $\mu$ behind the voxel are skipped, so the remaining ones are a truncated sample and their mean is biased toward the camera. That is why $\mu$ must be several $\sigma$.
   </details>

2. In `tsdf_integrate`, replace the projective distance by the true distance to the back-projected scan points (the nearest point of the scan to the voxel, with the sign of $\eta$). Fuse the 64 scans with both versions and compare the accuracy. Where do the fields differ most, and does it matter for the zero crossing?

   <details markdown="1"><summary>Hint</summary>

   Build a `cKDTree` of the back-projected points of each scan. The fields differ most where the surface is seen at grazing angles (there the projective distance is about $1/\cos\theta$ times the true distance) and near depth discontinuities. The zero crossings barely move; the differences matter for truncation (a projective band is effectively thinner on oblique surfaces) and for methods that use the field values as distances, such as sphere tracing.
   </details>

3. Derive the bias of the naive density for a plane and confirm the head-on value $-0.481/s$. How large must $s$ be for the bias to stay below 1 mm at 60° incidence? Why does that not solve the problem in practice?

   <details markdown="1"><summary>Hint</summary>

   Use the condition $\sigma' = \sigma^2$ as in section 6.2. At 60°, $c = 0.5$, $\Phi^\ast = 0.707$ and $\ln(\Phi^\ast/(1 - \Phi^\ast)) = 0.881$, so the bias is $1.76/s$ and you need $s > 1760$ per metre. With such a sharp density the weights are concentrated in a band of a millimetre, so almost no samples land in it and the gradients vanish; training must start with a small $s$, exactly when the bias is large.
   </details>

4. Extend `fit_neus` so that the eikonal term is evaluated only near the current zero level set, or with a smaller weight inside the objects. Do the spurious contours inside the box disappear? What does this tell you about which parts of a neural SDF are constrained by the data?

   <details markdown="1"><summary>Hint</summary>

   Cells that no ray reaches before its weights have saturated get no gradient from the rendering loss; only the regularizer shapes them. An eikonal term everywhere pushes them toward some distance function, but not necessarily the right one; most real implementations also sample the eikonal term in the whole bounding volume and initialize with a sphere so that the inside starts negative.
   </details>

5. In the pointmap snippet, replace the Procrustes pose by PnP: treat $X^{2,1}$ as known 3D points in camera 1's frame and the pixels of image 2 as their projections, and solve for camera 2 with a DLT for $P$ inside a RANSAC loop (post 5 covers PnP). Compare the rotation and translation errors with the Procrustes result.

   <details markdown="1"><summary>Hint</summary>

   A $3\times 4$ DLT needs six points per sample; use the pixel grid of image 2 and the known $K$ (or the focal estimated by Weiszfeld). PnP uses the 2D pixel positions, which are exact, instead of the noisy 3D points of a second pointmap, so the translation direction usually improves. This is why DUSt3R's authors mention both options.
   </details>

6. Compute accuracy, completeness and F-score at $\tau$ = 2 cm for the NeuS reconstruction of section 6.4 and for the TSDF fusion of 24 scans from the same cameras. Which one is more complete, and why?

   <details markdown="1"><summary>Hint</summary>

   Use `evaluate(sample_segments(marching_squares(g_fit, xs_n)), gt, 0.02)` and `tsdf_fuse` on `[(R, t, render_depth(R, t)) for R, t in orbit(24)]`. Note that NeuS was given noise-free depth here, so compare with noise-free TSDF too. Both see the same surfaces; the differences come from the grid resolutions (3.4 cm against 2.5 cm), the spurious inner contours of the NeuS fit, and the smoothing effect of the eikonal term at the box corners.
   </details>

**Next:** [post 10]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }}) closes the series with 3D vision on AR and VR headsets: inside-out tracking, scene understanding, spatial anchors and the latency budget that decides whether a virtual object stays put.
