---
layout: post
title: "Depth estimation and multi-view stereo: sensors, plane sweeps, PatchMatch, learned MVS and monocular depth"
date: 2026-10-27 11:07:00+0900
description: "From posed images to dense depth: depth, range and disparity, stereo, structured light, time-of-flight and LiDAR sensors, plane-sweep stereo with cost volumes, PatchMatch multi-view stereo with slanted planes, MVSNet and soft-argmin, monocular depth from MiDaS to Depth Anything and metric models, and TSDF depth fusion, with NumPy code for every step."
categories: 3d-vision
tags: [depth-estimation, multi-view-stereo, plane-sweep, patchmatch, mvsnet, monocular-depth, tsdf, time-of-flight, structured-light]
series: 3d-vision
series_order: 7
toc:
  sidebar: left
related_posts: false
---

## Why this matters

By the end of [post 5]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}) we can take a pile of photographs and recover every camera ($K$, $R$, $\mathbf t$) plus a sparse cloud of 3D points, one point for each feature track. [Post 6]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }}) does the same in real time. But a few thousand points are not a surface: a robot cannot plan a grasp on them, an AR headset cannot hide a virtual object behind them, and a 3D artist cannot turn them into a mesh. This post fills the gap between "the cameras are known" and "the shape is known". It asks one question for **every pixel**: how far away is the surface that this pixel sees?

There are three ways to answer it, and we will build each one:

1. **Measure it** with an active sensor: a structured-light projector, a time-of-flight camera or a LiDAR.
2. **Triangulate it densely** from several posed images: plane-sweep stereo, PatchMatch multi-view stereo (MVS) and their learned versions such as MVSNet.
3. **Guess it from one image** with a network that has seen millions of scenes: monocular depth (MiDaS, Depth Anything, metric-depth models).

At the end, many depth maps from many viewpoints are fused into one consistent model with a **truncated signed distance function (TSDF)**. Every later topic builds on this: the 3D representations of [post 8]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }}), the reconstruction pipelines of [post 9]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}), the depth priors used to train NeRF and 3D Gaussian Splatting, and the scene meshes of AR headsets in [post 10]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }}).

[Neural rendering post 1]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}) describes multi-view stereo in one paragraph. Here we open it up and run every algorithm on a synthetic scene with exact ground truth, so each claim comes with a number.

## Prerequisites

- The pinhole camera $\tilde{\mathbf x} \sim K(R\mathbf X + \mathbf t)$, homogeneous coordinates and the OpenCV camera frame (x right, y down, z forward) from [post 1]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }}).
- Homographies and the plane-induced homography of a calibration board from [post 2]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}).
- Patch similarity and the aperture problem from [post 3]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}).
- Epipolar geometry, rectified stereo, disparity and semi-global matching from [post 4]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }}). We recap what we need.
- Basic deep learning (CNNs, softmax, regression losses) for sections 5 and 6.

**Notation.** As in the earlier posts, a world point $\mathbf X$ maps to camera coordinates $\mathbf X\_c = R\mathbf X + \mathbf t$ and to the pixel $\tilde{\mathbf x} \sim K\mathbf X\_c$ with $\tilde{\mathbf x} = (x, y, 1)^\top$. We call one image the **reference view** (subscript r) and compute its depth map; the others are **source views** (subscript s). We write $z$ for depth (the third coordinate of $\mathbf X\_c$), $w = 1/z$ for inverse depth, $D$ for the number of depth hypotheses, $\mathbf n$ for a plane normal and $d$ for a plane's offset.

## 1. What a depth map is

### 1.1 Depth, range, disparity and inverse depth

A **depth map** stores one number per pixel. Three different numbers are in common use, and confusing them is a classic bug.

- **z-depth** $z$: the coordinate of the 3D point along the optical axis. This is what OpenCV, COLMAP, most datasets and most networks store.
- **Range** $\rho$: the Euclidean distance from the camera centre to the point, along the pixel's ray. LiDARs and some ToF cameras report range.
- **Disparity** $\delta$: for a rectified stereo pair with focal length $f$ and baseline $B$, the horizontal pixel shift $\delta = fB/z$. It is proportional to **inverse depth** $w = 1/z$.

Back-projection turns a z-depth map into 3D points. The ray through pixel $\tilde{\mathbf x}$ is $\mathbf r = K^{-1}\tilde{\mathbf x}$, and since $K^{-1}$ maps $(x, y, 1)$ to a vector whose third entry is 1, the point at depth $z$ is simply

$$
\mathbf X_c = z\,K^{-1}\tilde{\mathbf x}, \qquad \rho = \lVert \mathbf X_c \rVert = z\,\lVert K^{-1}\tilde{\mathbf x} \rVert .
$$

The factor $\lVert K^{-1}\tilde{\mathbf x}\rVert = \sqrt{1 + ((x - c\_x)/f\_x)^2 + ((y - c\_y)/f\_y)^2}$ is 1 at the principal point and grows towards the corners. In our test camera ($160 \times 120$ pixels, $f = 150$) the corner pixel has $\sqrt{1 + (79.5/150)^2 + (59.5/150)^2} = 1.1993$: range and z-depth differ by 20%. Treating a range image as z-depth bends every plane into a bowl.

The snippet uses the test scene of section 1.2 (`K`, `Z_gt`, `R_ref`, `t_ref`); to run the post's code in order, run the scene block of section 1.2 first.

```python
def backproject(depth, K):
    """z-depth map (H, W) -> 3D points (H, W, 3) in the camera frame: X = z K^-1 (x, y, 1)."""
    h, w = depth.shape
    ys, xs = np.mgrid[0:h, 0:w]
    rays = np.stack([xs, ys, np.ones_like(xs)], -1) @ np.linalg.inv(K).T   # rays with z = 1
    return rays * depth[..., None]


X_cam = backproject(Z_gt, K)
rng_len = np.linalg.norm(X_cam, axis=-1)                 # distance along the ray ("range")
print("pixel (0, 0):   z = %.3f m, range = %.3f m, ratio %.4f"
      % (Z_gt[0, 0], rng_len[0, 0], rng_len[0, 0] / Z_gt[0, 0]))
print("pixel (80, 60): z = %.3f m, range = %.3f m" % (Z_gt[60, 80], rng_len[60, 80]))
X_world = (X_cam - t_ref) @ R_ref                        # X = R^T (X_c - t), row-wise
print("lowest floor point: world y = %.3f m (the floor is y = 1.2)" % X_world[..., 1].max())
```

Output: `pixel (0, 0): z = 6.119 m, range = 7.339 m, ratio 1.1993`, `pixel (80, 60): z = 6.663 m, range = 6.664 m` (next to the principal point $(79.5, 59.5)$ the two agree), and `lowest floor point: world y = 1.200 m`: the back-projected points land exactly on the floor plane, a good sanity check for the conventions.

### 1.2 The test scene

Every algorithm in this post runs on the same synthetic scene, rendered by a small NumPy ray caster. A camera 1.8 m above a textured floor looks at a textured wall 6.5 m away; in front stand a box and a sphere. The wall carries two deliberately hard regions: a **flat gray poster** with no texture at all, and a patch of **vertical stripes** with a 0.3 m period. All surfaces are Lambertian (they look the same from every direction), so the "photo-consistency" assumption of stereo holds exactly, and each image gets Gaussian noise with $\sigma = 0.01$.

The reference camera ($160 \times 120$ pixels, $f = 150$ px, about 56° horizontal field of view) sees depths from 2.93 m to 6.73 m. Four source cameras sit around it, all looking at the same point: 0.40 m to the right, 0.25 m to the left, 0.30 m up and 0.28 m down (with small sideways offsets). The code is long but plain; open it if you want to run the post yourself.

<details markdown="1"><summary>The scene and the renderer (NumPy)</summary>

```python
import numpy as np
from scipy import ndimage as ndi

W, H, F = 160, 120, 150.0                       # image size and focal length (pixels)
K = np.array([[F, 0, (W - 1) / 2], [0, F, (H - 1) / 2], [0, 0, 1.0]])
LIGHT = np.array([-0.4, -0.7, -0.6]) / np.linalg.norm([-0.4, -0.7, -0.6])
_lat = np.random.default_rng(7).uniform(0, 1, (64, 64))


def value_noise(u, v):
    """Random texture in [0, 1]: 3 octaves of bilinearly interpolated lattice noise."""
    out = np.zeros_like(u)
    for freq, amp in ((3.0, 0.3), (8.0, 0.35), (18.0, 0.35)):
        x, y = u * freq, v * freq
        x0, y0 = np.floor(x), np.floor(y)
        fx, fy = x - x0, y - y0
        i, j = x0.astype(int) % 64, y0.astype(int) % 64
        a, b = _lat[j, i], _lat[j, (i + 1) % 64]
        c, d = _lat[(j + 1) % 64, i], _lat[(j + 1) % 64, (i + 1) % 64]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
    return np.clip(0.5 + 2.0 * (out - 0.5), 0.0, 1.0)              # stretch the contrast


def look_at(C, target, up=(0.0, -1.0, 0.0)):
    """World-to-camera R, t (OpenCV axes: x right, y down, z forward) of a camera at C."""
    z = np.asarray(target, float) - C
    z /= np.linalg.norm(z)
    x = np.cross(z, up)
    x /= np.linalg.norm(x)
    R = np.stack([x, np.cross(z, x), z])
    return R, -R @ C


def wall_albedo(P):
    a = 0.15 + 0.8 * value_noise(0.5 * P[:, 0] + 3.1, 0.5 * P[:, 1] + 5.3)
    poster = (P[:, 0] > 0.2) & (P[:, 0] < 2.2) & (P[:, 1] > -1.8) & (P[:, 1] < -0.7)
    a[poster] = 0.62                                               # textureless poster
    st = (P[:, 0] > -3.0) & (P[:, 0] < -1.1) & (P[:, 1] > -1.8) & (P[:, 1] < -0.4)
    a[st] = 0.3 + 0.4 * (np.sin(2 * np.pi * P[st, 0] / 0.3) > 0)   # vertical stripes
    return a


def intersect(o, d):
    """Ray-cast the scene from o along unit directions d (N, 3): distance, normal, albedo."""
    n = len(d)
    t, nrm, alb = np.full(n, np.inf), np.zeros((n, 3)), np.zeros(n)

    def hit(tc, normal, albedo):
        m = (tc > 1e-6) & (tc < t)
        P = o + tc[m, None] * d[m]
        t[m] = tc[m]
        nrm[m] = normal(P) if callable(normal) else normal
        alb[m] = albedo(P)

    with np.errstate(divide="ignore", invalid="ignore"):
        hit((6.5 - o[2]) / d[:, 2], np.array([0, 0, -1.0]), wall_albedo)        # wall z = 6.5
        hit((1.2 - o[1]) / d[:, 1], np.array([0, -1.0, 0]),                     # floor y = 1.2
            lambda P: 0.2 + 0.7 * value_noise(0.5 * P[:, 0] + 11.0, 0.5 * P[:, 2]))
        lo, hi = np.array([-1.6, 0.2, 3.2]), np.array([-0.5, 1.2, 4.3])         # box
        t1, t2 = (lo - o) / d, (hi - o) / d
        tn, tf = np.minimum(t1, t2).max(1), np.maximum(t1, t2).min(1)

        def box_normal(P):
            q = (P - (lo + hi) / 2) / ((hi - lo) / 2)
            k = np.abs(q).argmax(1)
            N = np.zeros_like(P)
            N[np.arange(len(P)), k] = np.sign(q[np.arange(len(P)), k])
            return N
        hit(np.where((tn < tf) & (tn > 0), tn, np.inf), box_normal,
            lambda P: 0.15 + 0.8 * value_noise(P[:, 0] + P[:, 2] + 20.0, P[:, 1] + 0.6 * P[:, 2]))
        c, r = np.array([1.0, 0.4, 3.6]), 0.8                                   # sphere
        b = d @ (o - c)
        disc = b * b - ((o - c) @ (o - c) - r * r)
        hit(np.where(disc > 0, -b - np.sqrt(np.abs(disc)), np.inf), lambda P: (P - c) / r,
            lambda P: 0.2 + 0.75 * value_noise(1.2 * np.arctan2(P[:, 0] - c[0], P[:, 2] - c[2]) + 30.0,
                                               1.5 * P[:, 1]))
    return t, nrm, alb


def render(R, t, ss=3, noise=0.01, seed=0):
    """Image and z-depth (H, W) of the camera X_c = R X + t; Lambertian, 3x3 supersampled."""
    C = -R.T @ t
    ys, xs = (np.mgrid[0:H * ss, 0:W * ss] + 0.5) / ss - 0.5
    rays = np.linalg.inv(K) @ np.stack([xs.ravel(), ys.ravel(), np.ones(xs.size)])
    d = (R.T @ rays).T
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    tt, nrm, alb = intersect(C, d)
    shade = alb * (0.35 + 0.65 * np.clip(nrm @ LIGHT, 0, 1))
    img = shade.reshape(H, ss, W, ss).mean((1, 3))
    img += np.random.default_rng(seed).normal(0, noise, img.shape)
    depth = (rays[2] * tt / np.linalg.norm(rays, axis=0)).reshape(H * ss, W * ss)  # z = t cos
    return img, depth[ss // 2::ss, ss // 2::ss]                  # depth at pixel centres


TARGET = np.array([0.0, 0.4, 4.5])
C_ref = np.array([0.0, -0.6, 0.0])              # reference camera, 1.8 m above the floor
R_ref, t_ref = look_at(C_ref, TARGET)
I_ref, Z_gt = render(R_ref, t_ref, seed=0)
OFFSETS = [(0.40, 0.0, 0.0), (-0.25, 0.0, 0.0), (0.05, -0.30, 0.0), (-0.10, 0.28, 0.0)]
src = []                                        # (image, R, t) of the 4 source views
for i, off in enumerate(OFFSETS):
    R_s, t_s = look_at(C_ref + off, TARGET)
    src.append((render(R_s, t_s, seed=i + 1)[0], R_s, t_s))
print("depth range of the reference view: %.2f .. %.2f m" % (Z_gt.min(), Z_gt.max()))
```

</details>

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-depth-and-points.svg" caption="The test scene. (a) The reference image: textured floor, box, sphere and wall; top left the stripes, top right the flat poster. (b) Its ground-truth z-depth, 2.93 m (yellow, bottom rows of the floor) to 6.73 m (dark, the wall corners). (c) The depth map back-projected with $\mathbf X = R^\top(z K^{-1}\tilde{\mathbf x} - \mathbf t)$ and seen from another angle; the purple frustum is the reference camera. The empty wedges behind the box and the sphere are the parts of the scene this camera cannot see. A depth map is a 2.5D representation: one surface per pixel, nothing behind it." %}

The figure makes a point that is easy to forget: a depth map from one viewpoint is **2.5D**. Seen from elsewhere it has holes wherever the surface was hidden. Filling those holes needs more views, which is why we fuse depth maps in section 7.

### 1.3 Why inverse depth is the natural variable

Stereo measures pixel shifts, and a pixel shift is proportional to inverse depth: $\delta = fB\,w$. Differentiating $z = fB/\delta$ gives the first-order depth error for a disparity error $\sigma\_\delta$:

$$
\sigma_z = \left\lvert \frac{\partial z}{\partial \delta} \right\rvert \sigma_\delta = \frac{fB}{\delta^2}\,\sigma_\delta = \frac{z^2}{fB}\,\sigma_\delta .
$$

Depth error grows with the **square** of distance, while the error in $w$ is the constant $\sigma\_\delta/(fB)$. Three consequences follow, and all of them reappear below:

- **Sample hypotheses uniformly in $w$**, not in $z$: equal steps in $w$ are equal steps in pixels along the epipolar line.
- **Report relative errors** such as $\lvert \hat z - z^\ast\rvert / z^\ast$: an absolute 5 cm error is excellent at 10 m and poor at 50 cm.
- **Regress inverse depth** (or disparity) in learning: its errors are closer to homoscedastic, and points at infinity get the finite value $w = 0$. SLAM systems use the same parameterization for the same reason ([post 6]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})).

## 2. Depth sensors

Before computing depth from images, let us see how hardware measures it. Every depth sensor is one of two things: a **triangulation** device (two viewpoints, as in stereo) or a **time-of-flight** device (a clock). The figure at the end of this section puts numbers on each.

### 2.1 Passive stereo

Two calibrated cameras, rectified so that epipolar lines are image rows ([post 4]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})), give $z = fB/\delta$. The error formula above tells you how to design one:

```python
def stereo_depth_sigma(Z, f, B, sigma_d):
    """First-order depth noise of a rectified stereo pair: Z = f B / d -> dZ = Z^2 / (f B) dd."""
    return Z ** 2 / (f * B) * sigma_d


for B in (0.05, 0.12):
    print("B = %.2f m:" % B, ", ".join("Z = %g m -> %.1f cm" % (Z, 100 * stereo_depth_sigma(Z, 600, B, 0.2))
                                       for Z in (1, 2, 5)))
```

With $f = 600$ px and a matching precision of 0.2 px, a 5 cm baseline gives `0.7 cm, 2.7 cm, 16.7 cm` at 1, 2 and 5 m, and a 12 cm baseline gives `0.3 cm, 1.1 cm, 6.9 cm`. A wider baseline helps linearly, distance hurts quadratically. The price of a wide baseline is more occlusion and larger appearance changes between the views, which make matching harder.

Passive stereo works outdoors, in sunlight and at long range, and costs only two cameras. It fails exactly where matching fails: textureless walls, repetitive patterns, reflections and darkness. Active sensors fix this by bringing their own light.

### 2.2 Structured light and active stereo

Replace one camera of a stereo pair with a **projector**. A projector is an "inverse camera": it has intrinsics and a pose like a camera, but its rays go out instead of in. If we know which projector column $u\_p$ lit a camera pixel, that pixel's ray and the projector's plane of column $u\_p$ intersect in one 3D point. This is triangulation, with the projector pattern solving the correspondence problem that textureless surfaces make impossible for passive stereo.

How do we encode "which column" in light? Three families dominate:

- **Single-shot pseudo-random patterns.** A fixed infrared dot pattern (speckle) gives every small window a unique texture, so ordinary block matching works even on a white wall. The first Kinect worked this way, and many "active stereo" modules add such a projector to a passive stereo pair: the pattern adds texture, and the two cameras do the stereo.
- **Binary (Gray-code) patterns.** Project $\lceil \log\_2 N \rceil$ black-and-white stripe images; the on/off sequence observed at a pixel is the binary code of its column. Gray codes change one bit between neighbouring columns, so a bit misread at a stripe boundary costs at most one column.
- **Phase shifting.** Project a sinusoidal fringe pattern several times, shifted by known phases. Each pixel sees $I\_k = A + B\cos(\varphi + \delta\_k)$, where $A$ is the ambient light plus offset, $B$ the modulation and $\varphi$ the unknown phase, which encodes the projector column. With three shifts $\delta = -2\pi/3, 0, +2\pi/3$:

$$
I_1 - I_3 = \sqrt 3\,B\sin\varphi, \qquad 2I_2 - I_1 - I_3 = 3B\cos\varphi
\quad\Longrightarrow\quad
\varphi = \operatorname{atan2}\!\big(\sqrt 3\,(I_1 - I_3),\; 2I_2 - I_1 - I_3\big).
$$

(Expand $\cos(\varphi \pm 2\pi/3)$ with the angle-sum formula to check the two identities.) The ambient light $A$ and the surface reflectance in $B$ cancel: the phase is measured per pixel, with sub-pixel precision and no matching window.

```python
def phase_from_three(I1, I2, I3):
    """Three fringe images shifted by -120, 0, +120 degrees -> wrapped phase in [0, 2 pi)."""
    return np.arctan2(np.sqrt(3) * (I1 - I3), 2 * I2 - I1 - I3) % (2 * np.pi)


period = 16.0                                   # projector pixels per fringe
u_proj = np.array([37.0])                       # the projector column that lit this camera pixel
phi = 2 * np.pi * u_proj / period
I1, I2, I3 = (0.5 + 0.4 * np.cos(phi + s) for s in (-2 * np.pi / 3, 0.0, 2 * np.pi / 3))
phi_hat = phase_from_three(I1, I2, I3)
print("decoded phase %.4f rad -> column %.2f + k * %g" % (phi_hat[0], phi_hat[0] / (2 * np.pi) * period, period))
```

Output: `decoded phase 1.9635 rad -> column 5.00 + k * 16`. The phase is only known modulo $2\pi$: column 37 and columns 5, 21, 53 look identical. This **phase ambiguity** is resolved by combining phase shifting with a coarse Gray code (which tells $k$) or with a second, longer fringe period. Industrial 3D scanners work this way, and the reference scans of the DTU MVS benchmark were taken with a structured-light scanner.

Structured light gives excellent short-range accuracy, but it competes with ambient light: sunlight drowns an infrared pattern, which is why such sensors are mostly indoor sensors.

### 2.3 Time of flight

A **time-of-flight (ToF)** sensor measures how long light takes to reach the surface and come back: $d = c\,\Delta t/2$. Light is fast: 1 mm of depth is $2 \times 0.001/c = 6.7$ ps of round trip. Two designs make this measurable.

- **Direct ToF (dToF)** times individual laser pulses with single-photon avalanche diodes (SPADs) and builds a histogram of arrival times. Most LiDARs, and the LiDAR sensors built into some phones and tablets, are dToF.
- **Indirect ToF (iToF, also AMCW for amplitude-modulated continuous wave)** modulates the illumination at a frequency $f$ (tens of MHz) and measures the **phase delay** $\varphi = 4\pi f d / c$ of the returning wave by correlating it with four shifted copies of the reference signal. The four correlation samples are $Q\_k = B + A\cos(\varphi - k\pi/2)$, so

$$
\varphi = \operatorname{atan2}(Q_1 - Q_3,\; Q_0 - Q_2), \qquad A = \tfrac12\sqrt{(Q_1 - Q_3)^2 + (Q_0 - Q_2)^2}, \qquad d = \frac{c\,\varphi}{4\pi f}.
$$

As in phase shifting, the offset $B$ (ambient light) cancels. The amplitude $A$ is a free confidence value: dark or distant surfaces return little light and give noisy phases.

```python
c_light = 299_792_458.0


def tof_samples(d, f_mod, A=1.0, B=2.0, sigma=0.0, rng=None):
    """Four correlation samples of an AMCW ToF pixel at phase offsets 0, 90, 180, 270 degrees."""
    phi = 4 * np.pi * f_mod * d / c_light                      # round-trip phase delay
    Q = B + A * np.cos(phi[None] - np.arange(4)[:, None] * np.pi / 2)        # shape (4, n)
    if sigma:
        Q = Q + rng.normal(0, sigma, Q.shape)
    return Q


def tof_decode(Q, f_mod):
    phi = np.arctan2(Q[1] - Q[3], Q[0] - Q[2]) % (2 * np.pi)
    amp = 0.5 * np.hypot(Q[1] - Q[3], Q[0] - Q[2])
    return c_light * phi / (4 * np.pi * f_mod), amp            # distance modulo c / (2 f)


def unwrap_two(d1, d2, f1, f2, max_range):
    """Pick the wrap counts (n1, n2) whose candidate distances agree best."""
    r1, r2 = c_light / (2 * f1), c_light / (2 * f2)
    best = (np.inf, None)
    for n1 in range(int(max_range / r1) + 1):
        for n2 in range(int(max_range / r2) + 1):
            e = abs((d1 + n1 * r1) - (d2 + n2 * r2))
            if e < best[0]:
                best = (e, 0.5 * (d1 + n1 * r1 + d2 + n2 * r2))
    return best[1]


f1, f2 = 80e6, 100e6
print("unambiguous ranges: %.3f m and %.3f m" % (c_light / (2 * f1), c_light / (2 * f2)))
d_true = np.array([5.3])
d1, a1 = tof_decode(tof_samples(d_true, f1), f1)
d2, a2 = tof_decode(tof_samples(d_true, f2), f2)
print("wrapped: %.4f m at 80 MHz, %.4f m at 100 MHz, amplitude %.2f" % (d1[0], d2[0], a1[0]))
print("unwrapped: %.4f m" % unwrap_two(d1[0], d2[0], f1, f2, max_range=7.49))
```

The phase wraps every $c/(2f)$: `unambiguous ranges: 1.874 m and 1.499 m` at 80 and 100 MHz. A surface at 5.3 m appears at `1.5526 m` and `0.8031 m`. Each alone is useless, but only one distance below 7.49 m is consistent with both, and the search finds `unwrapped: 5.3000 m`. The combined unambiguous range is $c/(2\gcd(f\_1, f\_2)) = c/(2 \cdot 20\ \text{MHz}) = 7.49$ m. Higher frequencies give finer phase resolution, lower ones a longer range; real iToF cameras combine two or three.

ToF has its own failure modes. **Multipath** (light that bounces off a second surface before returning, as in room corners) adds a delayed copy and biases the phase. **Flying pixels** at depth edges mix foreground and background light and land in between. Motion between the four samples corrupts the phase.

### 2.4 LiDAR

A **LiDAR** is a dToF range finder that scans: spinning multi-beam units, MEMS mirrors, optical phased arrays, or flash LiDARs that light the whole scene at once. It reports **range** along known beam directions, not z-depth per image pixel, with centimetre accuracy at tens to hundreds of metres. FMCW LiDARs chirp the laser frequency instead of timing pulses and also measure radial velocity through the Doppler shift.

Two practical points connect LiDAR to this series. First, to use LiDAR with a camera, transform its points into the camera frame with the LiDAR-camera extrinsics and project them with $K$ ([post 1]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})); the result is a **sparse** depth image, often with only a few percent of pixels filled. **Depth completion** networks densify it, guided by the image. Second, the extrinsic calibration between the two sensors is a calibration problem in the sense of [post 2]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}), usually solved with targets visible to both.

### 2.5 Comparing the sensors

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-sensors.svg" localized="true" caption="(a) Stereo depth noise $\sigma_Z = Z^2\sigma_d/(fB)$ for $f=600$ px and $\sigma_d = 0.2$ px: the numbers of the snippet (2.7 and 16.7 cm at 2 and 5 m for $B = 5$ cm; 1.1 and 6.9 cm for $B = 12$ cm). (b) Indirect ToF: the decoded distance wraps every $c/(2f)$ = 1.874 m (80 MHz, orange) and 1.499 m (100 MHz, blue); dashed is the truth. At $d = 5.3$ m (dotted line) the two wrapped values 1.55 and 0.80 m are consistent with only one distance below 7.49 m. (c) Phase shifting: the three fringe images $I_k$ along the projector columns (top) and the decoded wrapped phase (bottom), a sawtooth with period 16 px; the dot is column 37, decoded as 5 + 2 x 16." %}

| Sensor | Principle | Typical strengths | Typical failure modes |
| --- | --- | --- | --- |
| Passive stereo | triangulation, two cameras | outdoors, long range with a wide baseline, cheap | textureless and repetitive surfaces, darkness; error $\propto z^2$ |
| Active stereo / structured light | triangulation, projector + camera(s) | textureless surfaces, dense, accurate at short range | sunlight, shiny or dark surfaces, range limited by projector power |
| Indirect ToF | phase of modulated light | dense, compact, little computation | multipath, flying pixels, phase wrapping, sunlight |
| Direct ToF / LiDAR | pulse timing | long range, accuracy nearly independent of distance, works in the dark | sparse, expensive (scanning), rain and fog, black or specular surfaces |

No sensor is perfect, and all of them produce exactly the same kind of output: depth maps with noise, holes and outliers. Section 7 shows how to fuse such depth maps. First, though, we compute depth from plain images.

## 3. Plane-sweep stereo and cost volumes

### 3.1 The idea: sweep a plane through the scene

Rectified two-view stereo ([post 4]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})) searches along image rows. With more than two views, or with views that are not rectified, no single rectification exists. **Plane sweeping** (Collins, 1996) generalizes the search in a way that works for any number of calibrated views:

1. Choose a family of planes in front of the reference camera, usually **fronto-parallel** planes $z = z\_i$, $i = 1, \dots, D$.
2. For each plane, **warp** every source image onto the reference view as if the whole scene lay on that plane.
3. Compare each warped image with the reference image, pixel by pixel, in a small window. Where the scene really lies on (or near) the plane, the warped image agrees with the reference; elsewhere it does not.
4. The comparison results form a **cost volume** $C(x, y, i)$. For each pixel, the plane with the lowest cost is its depth.

The first figure shows the geometry for one pixel. The hypotheses $z\_i$ are points along the pixel's ray; each projects into the source view somewhere on the **epipolar line** of the pixel. Sweeping the plane is a search along the epipolar line, exactly as in rectified stereo, but expressed in 3D.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-sweep-geometry.svg" localized="true" caption="Plane-sweep geometry for the pixel $(120, 60)$ on the sphere. (a) Top view of the reference camera frame (row $y = 60$, gray: the true surface points of that row). Every third of the 64 planes $z = 1/w_i$ is drawn (colour from near, purple, to far, yellow); the hypotheses are the dots on the black ray, and the coloured lines connect them to the source camera $\mathbf C_1$. The red star is the true surface point. Because the planes are uniform in $1/z$ they crowd near the camera. (b) The same hypotheses projected into source view 1 by the plane-induced homographies $H_i\tilde{\mathbf x}$: they lie on the epipolar line, now evenly spaced, 17.1 px from the nearest to the farthest plane, 0.27 px apart." %}

### 3.2 The plane-induced homography

How do we warp "as if the scene lay on a plane"? Write the plane in reference-camera coordinates as $\mathbf n^\top\mathbf X = d$ (unit normal $\mathbf n$, offset $d > 0$). Let $(R, \mathbf t)$ map reference coordinates to source coordinates: $\mathbf X\_s = R\mathbf X + \mathbf t$. If the cameras have world-to-camera poses $(R\_r, \mathbf t\_r)$ and $(R\_s, \mathbf t\_s)$, then

$$
R = R_s R_r^\top, \qquad \mathbf t = \mathbf t_s - R\,\mathbf t_r .
$$

For a point on the plane, $\mathbf n^\top\mathbf X / d = 1$, so we may multiply $\mathbf t$ by this factor without changing anything:

$$
\mathbf X_s = R\mathbf X + \mathbf t\,\frac{\mathbf n^\top\mathbf X}{d} = \Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)\mathbf X .
$$

The map from $\mathbf X$ to $\mathbf X\_s$ is now linear. With $\mathbf X = z K\_r^{-1}\tilde{\mathbf x}\_r$ and $\tilde{\mathbf x}\_s \sim K\_s\mathbf X\_s$, the unknown $z$ is just a scale factor, which homogeneous coordinates ignore:

$$
\tilde{\mathbf x}_s \sim H\,\tilde{\mathbf x}_r, \qquad H = K_s\Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)K_r^{-1} .
$$

This is the same plane-to-image homography that calibrated cameras in post 2, now between two images. (Some texts write the plane as $\mathbf n^\top\mathbf X + d = 0$ and get $R - \mathbf t\mathbf n^\top/d$, as in neural rendering post 1; it is the same formula with the sign of $d$ flipped.) For fronto-parallel planes $\mathbf n = (0, 0, 1)^\top$ and $d = z\_i$.

**Sanity check: rectified stereo.** Put the source camera $B$ to the right with the same orientation: $R = I$, $\mathbf t = (-B, 0, 0)^\top$, $K\_s = K\_r = K$. Then $R + \mathbf t\mathbf n^\top/z = I - (B/z)\,\mathbf e\_x\mathbf e\_z^\top$, and for $\tilde{\mathbf x} = (x, y, 1)^\top$ the homography gives $x\_s = x - fB/z$, $y\_s = y$: a horizontal shift by the disparity $\delta = fB/z$. Plane sweeping contains rectified stereo as a special case.

### 3.3 How to sample the depth hypotheses

The figure above already answered this. Planes uniform in **inverse depth** $w\_i$ produce evenly spaced points along the epipolar line, because the pixel shift is affine in $w$ (exactly so for the rectified case, approximately otherwise). Uniform sampling in $z$ would waste most planes far away, where they are less than a pixel apart, and leave gaps near the camera. Our sweep uses $D = 64$ planes from $z = 2.5$ m to $8$ m, uniform in $w$; for the sphere pixel of the figure they span 17.1 px in source view 1, 0.27 px apart. A spacing of a fraction of a pixel is what we want: coarser sampling skips the true match, finer sampling only costs time.

### 3.4 Matching costs

How do we compare a reference window with a warped source window? The candidates are those of [post 3]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}):

- **SAD / SSD** (sum of absolute or squared differences): simplest, but sensitive to brightness differences between the cameras.
- **NCC** (normalized cross-correlation): subtract each window's mean, divide by its standard deviation, take the mean product. For windows $\mathbf a$ and $\mathbf b$ with means $\mu$ and variances $\sigma^2$,

$$
\mathrm{NCC}(\mathbf a, \mathbf b) = \frac{\frac1m\sum_k (a_k - \mu_a)(b_k - \mu_b)}{\sqrt{\sigma_a^2\,\sigma_b^2}} \in [-1, 1] .
$$

  It is invariant to gain and offset changes ($b \mapsto \alpha b + \beta$, $\alpha > 0$), which is why most MVS systems use it. We use the cost $1 - \mathrm{NCC} \in [0, 2]$, and add a small $\varepsilon$ to each variance so that flat windows give a cost near 1 ("no information") rather than a division by zero.
- **Census**: compare each pixel with the window centre, store the bits, and count differing bits (Hamming distance). It is robust to any monotonic brightness change and is popular in SGM-based hardware stereo.

The window size is a trade-off. A larger window averages more pixels, so the cost is less noisy and works on weaker texture, but it also assumes that the whole window lies on the plane. At depth edges a large window straddles foreground and background, and the foreground, usually more textured, wins: depth edges **fatten** outwards. On slanted surfaces the fronto-parallel window is the wrong shape; section 4 fixes that.

### 3.5 The plane sweep in code

```python
def relative_pose(R_r, t_r, R_s, t_s):
    """(R, t) that map reference-camera coordinates to source-camera coordinates."""
    R = R_s @ R_r.T
    return R, t_s - R @ t_r


def plane_homography(K_r, K_s, R, t, n, d):
    """Reference pixels -> source pixels for the plane n^T X = d (X in reference coordinates)."""
    return K_s @ (R + np.outer(t, n) / d) @ np.linalg.inv(K_r)


def warp(img, Hm):
    """For every reference pixel x, sample img at Hm x (bilinear). NaN where it falls outside."""
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    p = Hm @ np.stack([xs.ravel(), ys.ravel(), np.ones(H * W)])
    out = ndi.map_coordinates(img, [p[1] / p[2], p[0] / p[2]], order=1, cval=np.nan)
    return out.reshape(H, W)


def ncc_cost(a, b, r=2, eps=1e-5):
    """1 - NCC over (2r+1) x (2r+1) windows, per pixel: 0 = perfect match, 2 = worst.
    Windows that touch a NaN of b (outside the source image) get the worst cost."""
    box = lambda x: ndi.uniform_filter(x, 2 * r + 1, mode="nearest")
    outside = np.isnan(b)
    b = np.where(outside, 0.0, b)
    ma, mb = box(a), box(b)
    va, vb, cab = box(a * a) - ma ** 2, box(b * b) - mb ** 2, box(a * b) - ma * mb
    cost = 1 - cab / np.sqrt((np.maximum(va, 0) + eps) * (np.maximum(vb, 0) + eps))
    return np.where(box(outside.astype(float)) > 1e-6, 2.0, cost)


def plane_sweep(I_ref, R_ref, t_ref, views, z_near=2.5, z_far=8.0, D=64, r=2):
    """Cost volume C[view, plane, y, x] for fronto-parallel planes, uniform in 1/z."""
    inv_z = np.linspace(1 / z_near, 1 / z_far, D)
    n = np.array([0.0, 0.0, 1.0])                       # planes z = const in the reference frame
    C = np.empty((len(views), D, H, W))
    for j, (I_s, R_s, t_s) in enumerate(views):
        R, t = relative_pose(R_ref, t_ref, R_s, t_s)
        for i, w in enumerate(inv_z):
            C[j, i] = ncc_cost(I_ref, warp(I_s, plane_homography(K, K, R, t, n, 1 / w)), r)
    return inv_z, C


def wta(inv_z, cost):
    """Winner-take-all over the planes, refined by a parabola through 3 costs; returns z."""
    i = cost.argmin(0)
    ic = np.clip(i, 1, len(inv_z) - 2)
    c0, c1, c2 = (np.take_along_axis(cost, (ic + o)[None], 0)[0] for o in (-1, 0, 1))
    den = c0 - 2 * c1 + c2
    off = np.where((i == ic) & (den > 1e-9), 0.5 * (c0 - c2) / np.maximum(den, 1e-9), 0.0)
    return 1 / np.interp(ic + np.clip(off, -0.5, 0.5), np.arange(len(inv_z)), inv_z)


def depth_errors(z, z_gt):
    e = np.abs(z - z_gt) / z_gt
    return "AbsRel %.3f, |e| < 1%%: %4.1f%%, |e| < 5%%: %4.1f%%" % (
        e.mean(), 100 * np.mean(e < 0.01), 100 * np.mean(e < 0.05))


inv_z, C = plane_sweep(I_ref, R_ref, t_ref, src)          # C: (4 views, 64 planes, H, W)
z_one = wta(inv_z, C[0])                                   # only source view 1 (index 0)
z_mean = wta(inv_z, C.mean(0))                             # average of the 4 views
z_best2 = wta(inv_z, np.sort(C, 0)[:2].mean(0))            # best 2 of 4 views, per pixel and plane
for name, z in (("view 1 only", z_one), ("mean of 4", z_mean), ("best 2 of 4", z_best2)):
    print("%-12s %s" % (name, depth_errors(z, Z_gt)))
```

Three details deserve a comment. `ncc_cost` computes all window sums with box filters, so one plane costs a handful of image-sized operations, whatever the window size. `wta` refines the winning plane with the vertex of the parabola through the costs at $i-1, i, i+1$: if the costs are $c\_0, c\_1, c\_2$, the minimum of the parabola lies at offset $\tfrac12(c\_0 - c\_2)/(c\_0 - 2c\_1 + c\_2)$, which gives sub-plane precision for the price of three lookups. And the cost volume keeps the views separate, `C[view, plane, y, x]`, because how we combine them matters, as section 3.7 shows.

The next figure shows what the warps look like. For each plane, the region of the scene that lies near that plane lines up with the reference image and the difference image turns dark there; everything else stays bright. Sweeping the plane moves this "in-focus" band from the near floor to the far wall, much like the focus ring of a camera.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-sweep-warps.svg" caption="First row: the reference image and source view 1, taken 0.40 m to the right. Each further row: left, source view 1 warped onto the reference view by the homography of one plane ($z = 3.3$, $4.6$ and $6.6$ m); right, its absolute difference to the reference image. The cyan contour marks pixels whose true depth is within 3% of the plane: there the difference is dark (aligned), elsewhere bright. At 3.3 m the front face of the box, a ring on the sphere and a strip of near floor align, at 4.6 m a band of floor, at 6.6 m the wall. The blank strips at the image borders are pixels that fall outside source view 1." %}

### 3.6 Reading the cost curves

The cost volume is easiest to understand one pixel at a time. The figure below shows $C(z)$ for four probe pixels, per view (thin lines) and aggregated (thick).

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-cost-curves.svg" localized="true" caption="Cost curves $1 - \mathrm{NCC}$ along the 64 planes for four probe pixels (5x5 windows), one thin line per source view and the best-2-of-4 aggregate in black; the dashed red line is the true depth, the black triangle the estimate. A: textured wall, one deep, narrow minimum in every view, estimate 6.36 m for a truth of 6.35 m. B: the flat poster, every curve is flat noise around 1 and the minimum lands at 4.58 m instead of 6.21 m. C: the stripes. The horizontal-baseline views 1 and 2 have periodic minima at different depths; view 3, whose baseline is nearly vertical, sees almost no change along its epipolar line (low cost at every depth), and view 4 gives a broad curve. The aggregate is ambiguous; the estimate is 6.12 m for 6.25 m. D: a wall pixel next to the box, hidden from view 2 (blue, high cost at the truth) but visible in the others: best-2 gives 6.62 m for 6.66 m, while the mean of all four views gives 5.29 m." %}

Each probe is a lesson:

- **A (texture)**: the ideal case. A sharp, unique minimum at the right place in every view.
- **B (no texture)**: there is nothing to match. NCC of two noise windows is random, so the "best" plane is random too. No local cost can fix this; we need either a prior that propagates depth from the poster's textured surroundings (smoothness, section 3.8; planes, section 4) or active light (section 2.2).
- **C (repetitive texture)**: a stripe pattern with period $p$ pixels matches itself after a shift of $p$, so a single view has several equally good minima. Views with **different baselines** put these aliases at different depths, and only the true depth is a minimum in all of them. This is the idea of **multiple-baseline stereo** (Okutomi and Kanade, 1993), who summed SSD curves over baselines in inverse depth. Views whose epipolar lines run **along** the stripes see a constant pattern and carry no information: they are the aperture problem of post 3 in another form.
- **D (occlusion)**: from view 2 (0.25 m to the left) the pixel's surface point is hidden behind the box, so view 2 compares the wall with the box and gives a high cost at the true depth. Averaging this outlier into the cost moves the minimum; ignoring the worst views keeps it.

### 3.7 Many views: aggregation and occlusion

How should the per-view costs $C\_j(x, y, i)$ be combined? The printed results answer it on our scene:

```
view 1 only  AbsRel 0.079, |e| < 1%: 52.3%, |e| < 5%: 78.3%
mean of 4    AbsRel 0.047, |e| < 1%: 65.5%, |e| < 5%: 82.8%
best 2 of 4  AbsRel 0.034, |e| < 1%: 67.9%, |e| < 5%: 90.5%
```

More views help, and **robust aggregation** helps more. Taking, per pixel and per plane, the mean of the best $k$ of $N$ views, in the spirit of the view-subset selection of Kang, Szeliski and Chai (2001), assumes that each point is visible in at least $k$ views and discards the rest as possibly occluded. For probe D the mean of all four views gives 5.29 m, the best two give 6.62 m. Production systems go further: COLMAP (Schönberger et al., 2016) estimates for every pixel a probability that each source view sees it, jointly with the depth, and also weights views by their triangulation angle (too small an angle gives no depth resolution; too large an angle gives very different appearance).

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-sweep-result.svg" localized="true" caption="Plane-sweep depth maps with 5x5 NCC windows and parabola refinement. (a) Ground truth. (b) Only source view 1: noisy blocks on the poster and the stripes, and a band at the right border, where pixels leave view 1. (c) Best 2 of 4 views per pixel and plane: 68% of pixels within 1% of the true depth and 90% within 5%. (d) The relative error of (c), clipped at 5%. The remaining errors sit on the textureless poster, along depth edges (foreground fattening of the box and the sphere outlines) and at the image border; on textured surfaces the error is mostly below 1%." %}

The error map of (d) is the typical signature of local stereo: good on texture, wrong on the poster, and a bright **halo** around every depth edge, where the 5x5 window mixes foreground and background.

### 3.8 Regularizing the cost volume

So far every pixel decided alone (winner-take-all). The errors on the poster and at edges call for **context**: neighbouring pixels usually have similar depths. Three classic ways to bring it in:

- **Cost aggregation**: filter each cost slice spatially, with a box, a Gaussian, or an edge-aware filter (bilateral or guided filter) that does not average across image edges and so reduces fattening.
- **Global optimization**: minimize $E(\mathbf z) = \sum\_p C\_p(z\_p) + \lambda\sum\_{p \sim q} V(z\_p, z\_q)$ over the whole depth map, with a smoothness penalty $V$ between neighbours. Graph cuts and belief propagation solve it approximately.
- **Semi-global matching (SGM)** (Hirschmüller, 2008), explained in [post 4]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }}): solve the 1D version of the global problem exactly by dynamic programming along 8 or 16 directions and sum the results. It runs on a cost volume of any kind, including a plane-sweep volume.

Learned MVS (section 5) replaces all three with a 3D CNN that learns how to regularize the cost volume from data.

### 3.9 Try it: sweep the plane yourself

The widget runs the plane sweep of this section in your browser on a similar scene (one reference view and one source view, re-rendered in JavaScript). Drag on the chart, or use the slider, to move the plane, and watch which parts of the image line up. Things to try:

- Show **|difference|** and sweep from near to far: a dark band travels from the bottom of the image (near floor) to the wall.
- Put probes on the box, the poster and the stripes (tap a probe button, then tap the image). Compare a sharp minimum, a flat curve and periodic minima.
- Switch to **WTA depth**, then change the window from 3x3 to 9x9: noise on the textured surfaces drops, but edges fatten. Watch the accuracy line under the chart.
- Change the **baseline**: the stripe aliases move to other depths (with the 5x5 window, a baseline of 0.5 m happens to give the stripe probe the right depth), and a short baseline makes every minimum wider (less depth resolution).

{% include widget.liquid name="3d-vision-plane-sweep" height="760" caption="Plane-sweep stereo, live. Left: the reference image with three probe pixels. Right: source view warped by the homography of the current plane, the absolute difference, the cost of every pixel at this plane, or the winner-take-all depth map. The cyan outline marks pixels whose true depth is within 3% of the plane. Chart: cost of each probe against depth (spaced in $1/z$), the purple line is the current plane, dashed lines the true depths, triangles the WTA estimates." %}

## 4. PatchMatch multi-view stereo

### 4.1 Two problems with the sweep

The plane sweep has two built-in limitations.

1. **Cost.** It evaluates all $D$ planes at every pixel. At 4K resolution with $D = 256$, that is two billion window comparisons per source view, most of them for depths that are obviously wrong.
2. **Fronto-parallel bias.** Every window is warped as if the surface faced the camera. On a slanted surface (a floor, a street, a façade seen obliquely) the true depth changes across the window, so even the best plane matches only partially. Our floor shows it: only 51% of floor pixels are within 1%, against 68% overall.

**PatchMatch** (Barnes et al., 2009, for image editing) solves the first problem, and its stereo version with **slanted planes** (Bleyer, Rhemann and Rother, 2011) solves the second.

### 4.2 The PatchMatch idea

PatchMatch rests on one observation: **good hypotheses are spatially coherent**. If a pixel's depth (and orientation) is right, its neighbour's is probably almost the same. The algorithm needs only three steps:

1. **Random initialization.** Give every pixel a random hypothesis: here a depth (uniform in $w$) and a normal.
2. **Propagation.** Visit the pixels; let each one try its neighbours' hypotheses and keep any that lowers its cost.
3. **Random refinement.** Perturb the current hypothesis by a random amount, shrinking the perturbation each iteration, and keep it if it is better.

Why does random initialization work? Because we only need **one** lucky pixel per region. Suppose a hypothesis counts as "good" if its inverse depth is within ±1% of the truth. For a surface at 5 m ($w = 0.2$) that is an interval of width 0.004 out of the full range $1/2.5 - 1/8 = 0.275$, so a random guess is good with probability $p = 0.0145$. In a $20 \times 20$ region of the same surface, the probability that at least one of the 400 pixels starts with a good guess is

$$
1 - (1 - p)^{400} = 1 - 0.9855^{400} \approx 1 - e^{-5.84} = 0.997 .
$$

Propagation then spreads that pixel's hypothesis over the whole region in a few sweeps. Refinement polishes it beyond the 1% of the lucky guess. (With slanted planes the normal must also be roughly right, which lowers $p$; the refinement steps and the many neighbours make up for it.)

### 4.3 Slanted support windows

Each pixel $p$ now carries a plane: a depth $z\_p$ and a normal $\mathbf n\_p$. The plane passes through the back-projected point $\mathbf X\_p = z\_p K^{-1}\tilde{\mathbf x}\_p$, so its offset is $d\_p = \mathbf n\_p^\top\mathbf X\_p$. Every pixel of $p$'s window is warped into the source views with **$p$'s own** homography

$$
H_p = K_s\Big(R + \frac{\mathbf t\,\mathbf n_p^\top}{d_p}\Big)K_r^{-1},
$$

so the window follows the surface instead of facing the camera. A window on the floor is warped as a piece of the floor. (Our code orients every normal towards the camera, so $d\_p < 0$, unlike the $d > 0$ of section 3.2. This does not matter: flipping $\mathbf n$ also flips $d$, and $\mathbf t\mathbf n^\top/d$ stays the same.)

Propagation needs one more formula. When pixel $p$ borrows the plane $(\mathbf n\_q, \mathbf X\_q)$ of a neighbour $q$, the depth to test at $p$ is where $p$'s ray $\mathbf r\_p = K^{-1}\tilde{\mathbf x}\_p$ meets that plane: $\mathbf n\_q^\top(z\,\mathbf r\_p) = \mathbf n\_q^\top\mathbf X\_q$, so

$$
z = \frac{\mathbf n_q^\top\mathbf X_q}{\mathbf n_q^\top\mathbf r_p} .
$$

On a slanted surface this correctly extrapolates the depth instead of copying it.

### 4.4 Propagation order and parallelism

Bleyer et al. propagate sequentially, scanning the image top-left to bottom-right on even iterations (so information flows right and down) and in the opposite order on odd ones. That is inherently serial. **Gipuma** (Galliani, Lasinger and Schindler, 2015) made PatchMatch massively parallel with a **red-black checkerboard**: colour the pixels like a chessboard, update all red pixels at once from their black neighbours, then all black ones. Each update uses neighbours at distance 1 and further away (we use distances 1 and 3 in the four directions), so information still travels several pixels per half-step. ACMM (Xu and Tao, 2019) adapts which neighbours to sample and adds multi-scale geometric consistency for low-texture areas. The same red-black scheme is what makes our NumPy version fast: half of the pixels are updated in one vectorized call.

### 4.5 PatchMatch in code

```python
Kinv = np.linalg.inv(K)
WIN = np.array([(dx, dy) for dy in range(-2, 3) for dx in range(-2, 3)], float)   # 5 x 5 window
NEIGH = [(-1, 0), (1, 0), (0, -1), (0, 1), (-3, 0), (3, 0), (0, -3), (0, 3)]


def plane_cost(z, nrm, xs, ys, I_ref, views, k=2):
    """Best-k mean of 1 - NCC for pixel (xs, ys) carrying the plane through depth z with normal
    nrm; every window pixel is warped by its own plane-induced homography."""
    q = np.stack([xs[:, None] + WIN[:, 0], ys[:, None] + WIN[:, 1]], -1)          # (M, 25, 2)
    a = ndi.map_coordinates(I_ref, [q[..., 1].ravel(), q[..., 0].ravel()], order=1,
                            mode="nearest").reshape(q.shape[:2])
    X = z[:, None] * (np.stack([xs, ys, np.ones_like(xs)], 1) @ Kinv.T)            # 3D point
    d = np.sum(nrm * X, 1)                                                          # n^T X = d
    qh = np.concatenate([q, np.ones(q.shape[:2] + (1,))], -1)
    costs = []
    for I_s, R_s, t_s in views:
        R, t = relative_pose(R_ref, t_ref, R_s, t_s)
        Hm = K @ (R + t[:, None] * nrm[:, None, :] / d[:, None, None]) @ Kinv      # (M, 3, 3)
        p = np.einsum("mij,mkj->mki", Hm, qh)
        b = ndi.map_coordinates(I_s, [(p[..., 1] / p[..., 2]).ravel(), (p[..., 0] / p[..., 2]).ravel()],
                                order=1, cval=np.nan).reshape(q.shape[:2])
        bad = np.isnan(b).any(1)
        a0 = a - a.mean(1, keepdims=True)
        b = np.where(bad[:, None], 0.0, b)                                  # cost 2 below anyway
        b0 = b - b.mean(1, keepdims=True)
        ncc = (a0 * b0).mean(1) / np.sqrt(((a0 ** 2).mean(1) + 1e-5) * ((b0 ** 2).mean(1) + 1e-5))
        costs.append(np.where(bad, 2.0, 1 - ncc))
    return np.sort(np.array(costs), 0)[:k].mean(0)


def facing(nrm, rays):
    nrm = nrm / np.linalg.norm(nrm, axis=1, keepdims=True)
    return np.where(np.sum(nrm * rays, 1, keepdims=True) > 0, -nrm, nrm)   # point at the camera


def patchmatch(I_ref, views, iters=6, z_near=2.5, z_far=8.0, slanted=True, seed=0, history=None):
    """Multi-view PatchMatch with red-black propagation (Gipuma-style); returns z, normals, cost."""
    rng = np.random.default_rng(seed)
    ys, xs = (g.ravel().astype(float) for g in np.mgrid[0:H, 0:W])
    rays = np.stack([xs, ys, np.ones_like(xs)], 1) @ Kinv.T
    w = rng.uniform(1 / z_far, 1 / z_near, H * W)                   # 1. random inverse depth
    N = facing(rng.normal(size=(H * W, 3)), rays) if slanted else np.tile([0, 0, -1.0], (H * W, 1))
    cost = plane_cost(1 / w, N, xs, ys, I_ref, views)
    dw, dn = (1 / z_near - 1 / z_far) / 4, 0.3                       # refinement step sizes
    for it in range(iters + 1):
        if history is not None:
            history.append((1 / w).reshape(H, W).copy())
        if it == iters:
            break
        for color in (0, 1):                                          # red-black halves
            sel = np.nonzero((xs + ys) % 2 == color)[0]
            xi, yi = xs[sel].astype(int), ys[sel].astype(int)
            cands = []
            for dx, dy in NEIGH:                                      # 2. propagation
                j = np.clip(yi + dy, 0, H - 1) * W + np.clip(xi + dx, 0, W - 1)
                # the neighbour's plane, intersected with this pixel's ray: z = n^T X_j / n^T r
                z = np.sum(N[j] * rays[j], 1) / w[j] / np.sum(N[j] * rays[sel], 1)
                ok = (z > 0.9 * z_near) & (z < 1.1 * z_far)
                cands.append((np.where(ok, 1 / np.where(ok, z, 1.0), w[j]), N[j]))
            # 3. random refinement: perturb the depth, and (if slanted) the normal
            cands.append((np.clip(w[sel] + rng.uniform(-dw, dw, len(sel)), 1 / z_far, 1 / z_near), N[sel]))
            if slanted:
                cands.append((w[sel], facing(N[sel] + rng.normal(0, dn, (len(sel), 3)), rays[sel])))
            for cw, cn in cands:
                c = plane_cost(1 / cw, cn, xs[sel], ys[sel], I_ref, views)
                upd = c < cost[sel]                                   # keep the better plane
                better = sel[upd]
                w[better], N[better], cost[better] = cw[upd], cn[upd], c[upd]
        dw, dn = dw / 2, dn / 2
    return (1 / w).reshape(H, W), N.reshape(H, W, 3), cost.reshape(H, W)


pm_hist = []
z_pm, N_pm, cost_pm = patchmatch(I_ref, src, history=pm_hist)
for it, z in enumerate(pm_hist):
    print("PatchMatch iteration %d: %s" % (it, depth_errors(z, Z_gt)))
pm_hist_fp = []
z_pm_fp = patchmatch(I_ref, src, slanted=False, history=pm_hist_fp)[0]   # fronto-parallel planes only
floor = np.abs(X_world[..., 1] - 1.2) < 1e-6                         # pixels that see the floor
for name, z in (("sweep, best 2", z_best2), ("PatchMatch slanted", z_pm), ("PatchMatch fronto", z_pm_fp)):
    e = np.abs(z - Z_gt) / Z_gt
    print("%-19s floor: |e| < 1%%: %4.1f%%   all: %s" % (name, 100 * np.mean(e[floor] < 0.01), depth_errors(z, Z_gt)))
```

The output tells the story of the iterations:

```
PatchMatch iteration 0: AbsRel 0.365, |e| < 1%:  1.8%, |e| < 5%:  8.9%
PatchMatch iteration 1: AbsRel 0.080, |e| < 1%: 20.1%, |e| < 5%: 64.9%
PatchMatch iteration 2: AbsRel 0.043, |e| < 1%: 49.5%, |e| < 5%: 88.6%
PatchMatch iteration 3: AbsRel 0.040, |e| < 1%: 60.9%, |e| < 5%: 89.2%
PatchMatch iteration 4: AbsRel 0.039, |e| < 1%: 64.5%, |e| < 5%: 89.5%
PatchMatch iteration 5: AbsRel 0.039, |e| < 1%: 66.2%, |e| < 5%: 89.5%
PatchMatch iteration 6: AbsRel 0.039, |e| < 1%: 66.8%, |e| < 5%: 89.5%
sweep, best 2       floor: |e| < 1%: 51.2%   all: AbsRel 0.034, |e| < 1%: 67.9%, |e| < 5%: 90.5%
PatchMatch slanted  floor: |e| < 1%: 59.4%   all: AbsRel 0.039, |e| < 1%: 66.8%, |e| < 5%: 89.5%
PatchMatch fronto   floor: |e| < 1%: 46.3%   all: AbsRel 0.039, |e| < 1%: 63.4%, |e| < 5%: 89.1%
```

From pure noise (1.8% of pixels within 1% by luck), one iteration already places 65% of the pixels within 5%, and after two iterations the depth map is nearly converged. With slanted planes, 59.4% of the floor pixels are within 1%, against 46.3% for PatchMatch restricted to fronto-parallel planes and 51.2% for the 64-plane sweep. Overall PatchMatch matches the sweep (66.8% against 67.9% within 1%) with a similar number of cost evaluations per pixel: 1 + 6 x 10 = 61 here, against 64 planes. The difference is how the cost scales: the sweep's cost grows with the number of planes, PatchMatch's does not, and PatchMatch's depths are continuous, not quantized to the planes.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-patchmatch.svg" localized="true" caption="PatchMatch MVS on the test scene (best 2 of 4 views, 5x5 windows, red-black propagation). Depth after random initialization (iteration 0: 2% of pixels within 1%), after one, two and six iterations (20%, 50%, 67%). Bottom left: the estimated normals as colours (x, -y, -z mapped to RGB): the floor comes out green, surfaces facing the camera blue-violet, the sphere shaded smoothly; on weak texture the normals stay noisy, because a 5x5 window constrains depth much better than orientation. Bottom right: fraction of pixels within 1% per iteration, for all pixels (solid) and the floor (dashed), with slanted planes (purple) and fronto-parallel planes only (orange); the dotted line is the plane sweep." %}

### 4.6 From one depth map to many: COLMAP and friends

A production MVS system such as COLMAP's (Schönberger et al., 2016) runs PatchMatch for **every** image as the reference view and adds three ingredients:

- **Per-pixel view selection**: a probabilistic model infers which source views see each pixel, instead of our fixed best-2 rule.
- **Geometric consistency**: in a second pass, a hypothesis is also scored by how well it agrees with the depth maps of the other views (project it into a neighbour, read the neighbour's depth, project back, and measure the distance to the start pixel).
- **Filtering and fusion**: pixels with low photometric or geometric consistency are discarded, and the surviving depths of all views are merged into one point cloud (section 7.1).

Earlier MVS took other routes. PMVS (Furukawa and Ponce, 2010) grew a set of small oriented patches from sparse matches by expansion and filtering; volumetric methods carved or labelled voxels. Depth-map-based PatchMatch won in practice because it parallelizes well and scales to thousands of high-resolution images.

## 5. Learned multi-view stereo

### 5.1 MVSNet: the plane sweep as a network

Hand-crafted MVS struggles where photo-consistency is weak: low texture, reflections, thin structures. **MVSNet** (Yao et al., 2018) keeps the geometry of the plane sweep and learns everything else. Its pipeline maps one to one onto section 3:

1. **Feature extraction.** A shared 2D CNN turns each of the $N$ images into a feature map with $C$ channels (32 in the paper) at quarter resolution. Matching learned features instead of raw intensities is the first gain.
2. **Differentiable homography warping.** Each source feature map is warped onto $D$ fronto-parallel planes of the reference view with exactly the homography $H\_i$ of section 3.2, using bilinear sampling, which is differentiable.
3. **Variance cost volume.** For each plane, the $N$ feature volumes $\mathbf V\_1, \dots, \mathbf V\_N$ (reference included) are combined by their per-channel variance, $\mathbf C = \frac1N\sum\_j(\mathbf V\_j - \bar{\mathbf V})^2$. Where the features agree, the variance is small. Unlike our "best 2", the variance works for any $N$.
4. **Regularization.** A 3D U-Net processes the $C \times D \times H/4 \times W/4$ volume and outputs one score per plane and pixel, converted to a **probability volume** $P\_i(x, y)$ by a softmax over $i$. This replaces SGM or global optimization: the network learns how to propagate information into textureless areas.
5. **Depth regression.** The depth is the expectation over the planes, $\hat z = \sum\_i P\_i\,z\_i$ (the soft-argmin; MVSNet samples its planes uniformly in depth, and with planes uniform in inverse depth, as in our code below, one takes the expectation of $w$ instead). A small 2D network refines the depth map with the reference image, and training minimizes an L1 loss against ground-truth depth (rendered from the DTU structured-light scans) for both the initial and the refined map.

The weak point is memory. For a $1600 \times 1200$ image the quarter-resolution volume has $400 \times 300 \times 192 \times 32 \approx 7.4 \times 10^8$ entries for $D = 192$ planes, about 3 GB in 32-bit floats, and the intermediate volumes of the 3D U-Net need several times more. Most follow-up work is about this number.

### 5.2 Soft-argmin: sub-pixel and differentiable, with a catch

Winner-take-all is not differentiable. GC-Net (Kendall et al., 2017), for stereo, and MVSNet replace it by the expectation under a softmax:

$$
P_i = \frac{\exp(-C_i/\tau)}{\sum_k \exp(-C_k/\tau)}, \qquad \hat w = \sum_i P_i\,w_i .
$$

When the distribution is unimodal and peaked, $\hat w$ is a sub-plane estimate of the minimum. When it is not, the expectation lands **between** the modes, on a depth that no plane supports. We can test this on our hand-crafted cost volume, with the temperature $\tau$ playing the role that training plays for a network:

```python
def soft_argmin(inv_z, cost, tau=0.05):
    """Expected inverse depth under P(plane) = softmax(-cost / tau), as in GC-Net and MVSNet."""
    logit = -cost / tau
    P = np.exp(logit - logit.max(0))
    P /= P.sum(0)
    return 1 / np.tensordot(inv_z, P, 1), P


agg = np.sort(C, 0)[:2].mean(0)
step = inv_z[0] - inv_z[1]                                           # plane spacing in 1/z
i_gt = (inv_z[0] - 1 / Z_gt) / step                                  # true plane index (real)
inlier = np.abs(agg.argmin(0) - i_gt) <= 2                           # WTA within 2 planes
for name, z in (("integer WTA", 1 / inv_z[agg.argmin(0)]), ("WTA + parabola", z_best2),
                ("soft-argmin tau=0.05", soft_argmin(inv_z, agg, 0.05)[0]),
                ("soft-argmin tau=0.01", soft_argmin(inv_z, agg, 0.01)[0])):
    err = ((inv_z[0] - 1 / z) / step - i_gt)[inlier]                 # error in plane spacings
    print("%-21s RMS error %.3f planes" % (name, np.sqrt(np.mean(err ** 2))))
print("pixels with WTA within 2 planes: %.1f%%" % (100 * inlier.mean()))
```

On the 88.4% of pixels where winner-take-all is within two planes of the truth, the RMS errors are `0.611` planes for integer WTA, `0.535` with the parabola, `1.566` for soft-argmin with $\tau = 0.05$ and `0.705` with $\tau = 0.01$. A soft-argmin on a broad, hand-crafted cost curve is **worse** than plain WTA: probability mass from distant, slightly-less-bad planes pulls the mean away. It only works when the distribution is sharp, and the network has to learn to make it sharp. MVSNet's L1 loss acts on the expectation only, so it does not by itself rule out a bimodal $P$ whose mean happens to be right; this is why R-MVSNet trains $P$ directly with a cross-entropy loss against the true plane, and why other methods take the expectation only within a window around the peak.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-soft-argmin.svg" localized="true" caption="(a) Probe A, best-2 cost (black) and the softmax probabilities for $\tau=0.05$ (orange) and $\tau=0.01$ (purple). The curve has one clean minimum; the integer argmin is the plane at 6.43 m, and the soft-argmin interpolates between planes: 6.31 m ($\tau=0.05$, a broad distribution with a tail towards nearer planes) and 6.34 m ($\tau=0.01$), for a truth of 6.35 m. (b) Probe C seen by view 1 only: three minima, at the near end of the range (2.5 m), near 3.5 m and near 6.1 m (truth 6.25 m, dashed). The argmin picks a wrong one (3.54 m); the soft-argmin lands at 3.87 m with $\tau = 0.05$, between the modes, on a depth that no plane supports, and at 3.48 m with $\tau=0.01$, pulled slightly towards the 2.5 m mode. (c) RMS error in plane spacings over the 88% of pixels where WTA is within two planes: integer WTA 0.61, WTA with parabola 0.53, soft-argmin 1.57 ($\tau=0.05$) and 0.70 ($\tau=0.01$)." %}

### 5.3 Making it scale, and the stereo branch

The main lines of work after MVSNet, all verified in the paper table below:

- **Recurrent regularization.** R-MVSNet (Yao et al., 2019) processes the cost volume one depth slice at a time with a convolutional GRU instead of a 3D CNN, so memory no longer grows with $D$.
- **Coarse-to-fine cascades.** CasMVSNet (Gu et al., 2020) builds a coarse cost volume over the full depth range at low resolution, then narrower volumes around the previous estimate at higher resolutions. The same depth precision costs far fewer planes.
- **Learned PatchMatch.** PatchmatchNet (Wang et al., 2021) puts section 4 into a network: learned, adaptive propagation and evaluation, iterated coarse to fine, without a full cost volume.

Two-view stereo networks followed a parallel path: GC-Net introduced the 3D-CNN cost volume and the soft-argmin, RAFT-Stereo (Lipson et al., 2021) replaced the 3D CNN with recurrent updates of a disparity field driven by an all-pairs correlation pyramid (the stereo version of RAFT from post 3), and FoundationStereo (Wen et al., CVPR 2025) feeds features of a frozen monocular depth model (Depth Anything V2) into its matching features to generalize zero-shot. Learned stereo and MVS increasingly borrow from monocular depth, the topic of the next section.

Learned MVS still needs **known cameras**. Feed-forward 3D models such as DUSt3R, VGGT and Depth Anything 3 (Lin et al., arXiv November 2025, ICLR 2026) predict depth and camera poses together from unposed images; they are the subject of [post 9]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}).

## 6. Monocular depth estimation

### 6.1 Why one image is not enough, and why it works anyway

From a single image, depth is fundamentally ambiguous. Scale the whole scene by $s$ about the camera centre: every point $\mathbf X\_c$ becomes $s\mathbf X\_c$, and $K(s\mathbf X\_c) \sim K\mathbf X\_c$ projects to the same pixel. A dollhouse and a house can produce the same picture. Worse, the focal length couples with depth: the image of an object of height $h$ at depth $z$ has height $fh/z$, so a longer lens and a farther object look the same.

Humans still judge depth from one eye, because the world is not arbitrary: familiar object sizes, perspective of parallel lines (the vanishing points of post 1), texture gradients, occlusion order, shading, haze and defocus. A network trained on enough images learns the same cues. What it cannot learn without extra information is the global scale (and, with an unknown camera, the focal length). Monocular depth models therefore come in two kinds: **relative** (affine-invariant) models that predict depth up to an unknown scale and shift, and **metric** models that predict metres and must somehow resolve the camera.

### 6.2 Scale-invariant losses

Eigen, Puhrsch and Fergus (2014), one of the first deep networks for monocular depth, introduced a loss that ignores the global scale. With $g\_i = \log\hat z\_i - \log z\_i^\ast$ over $n$ pixels,

$$
D(\hat{\mathbf z}, \mathbf z^\ast) = \frac1n\sum_i g_i^2 - \frac{\lambda}{n^2}\Big(\sum_i g_i\Big)^2 .
$$

For $\lambda = 1$ this is the variance of $g$, and multiplying $\hat{\mathbf z}$ by any $s$ adds $\log s$ to every $g\_i$, which does not change a variance. The paper used $\lambda = 0.5$, a compromise between absolute and relative accuracy. The snippet in section 6.4 confirms the invariance numerically: `si_log: 0.00035, after doubling the depth: 0.00035`.

### 6.3 Mixing datasets: affine-invariant inverse depth (MiDaS)

Scale invariance is not enough to train on **many** datasets at once. Stereo films and web stereo images give disparity with an unknown baseline and an unknown offset (the convergence of the cameras), laser scans give metric depth, structure-from-motion gives depth up to scale. MiDaS (Ranftl et al., arXiv 2019, TPAMI 2022) made all of them compatible by predicting **inverse depth up to an unknown scale and shift** and aligning before computing the loss: for a prediction $\mathbf p$ and target inverse depth $\mathbf w^\ast$, find

$$
(s, t) = \arg\min_{s, t}\sum_i \big(s\,p_i + t - w_i^\ast\big)^2 ,
$$

a linear least-squares problem with the closed form from the normal equations

$$
\begin{pmatrix} \sum_i p_i^2 & \sum_i p_i \\ \sum_i p_i & n \end{pmatrix}
\begin{pmatrix} s \\ t \end{pmatrix}
=
\begin{pmatrix} \sum_i p_i w_i^\ast \\ \sum_i w_i^\ast \end{pmatrix},
$$

then penalize the residual $s\,p\_i + t - w\_i^\ast$ (MiDaS uses robust, trimmed versions of this and a gradient-matching term for sharp edges). Why inverse depth? Because disparity data, the largest source, is affine in inverse depth, and an affine model in $w$ is exactly what unknown baseline and offset produce. DPT (Ranftl et al., 2021) replaced the CNN backbone with a vision transformer; its decoder is reused by many later models, Depth Anything among them.

### 6.4 Using a relative model: alignment in practice

A relative prediction becomes metric depth once you have a few metric anchors: LiDAR points, SfM points with known scale, the floor height, or a stereo pair. The code below simulates a relative network as an affine function of the true inverse depth plus smooth, spatially correlated errors and pixel noise (a real network's errors look similar: smooth over objects, larger at edges), and aligns it.

```python
def align_scale_shift(pred, target, mask):
    """Least-squares s, t with s * pred + t ~ target on the mask (MiDaS-style alignment)."""
    A = np.stack([pred[mask], np.ones(mask.sum())], 1)
    s, t = np.linalg.lstsq(A, target[mask], rcond=None)[0]
    return s, t


def depth_metrics(z, z_gt):
    ratio = np.maximum(z / z_gt, z_gt / z)
    return dict(AbsRel=np.mean(np.abs(z - z_gt) / z_gt), RMSE=np.sqrt(np.mean((z - z_gt) ** 2)),
                delta1=np.mean(ratio < 1.25))


def fmt(m):
    return "AbsRel %.4f, RMSE %.3f m, delta1 %.3f" % (m["AbsRel"], m["RMSE"], m["delta1"])


def si_log(z, z_gt, lam=1.0):
    """Scale-invariant log error of Eigen et al. (2014); lam = 1 ignores any global scale."""
    g = np.log(z) - np.log(z_gt)
    return np.mean(g ** 2) - lam * np.mean(g) ** 2


rng = np.random.default_rng(3)
smooth = ndi.gaussian_filter(rng.normal(size=(H, W)), 12)
smooth /= smooth.std()
# a stand-in for a relative-depth network: affine in inverse depth, plus smooth and pixel errors
pred = 1.7 / Z_gt + 0.25 + 0.006 * smooth + rng.normal(0, 0.003, (H, W))
everything = np.ones((H, W), bool)
s, t = align_scale_shift(pred, 1 / Z_gt, everything)
z_al = 1 / (s * pred + t)
print("scale-and-shift: s = %.4f, t = %.4f; %s" % (s, t, fmt(depth_metrics(z_al, Z_gt))))
k_med = np.median(Z_gt * pred)                                       # scale only: z = k / pred
print("scale only:      k = %.4f;           %s" % (k_med, fmt(depth_metrics(k_med / pred, Z_gt))))
print("si_log: %.5f, after doubling the depth: %.5f" % (si_log(z_al, Z_gt), si_log(2 * z_al, Z_gt)))
anchor_rel = {}
for n_anchor in (3, 10, 30, 100, 1000):                              # sparse metric anchors
    vals = []
    for trial in range(50):
        m = np.zeros(H * W, bool)
        m[rng.choice(H * W, n_anchor, replace=False)] = True
        s_, t_ = align_scale_shift(pred, 1 / Z_gt, m.reshape(H, W))
        zz = 1 / np.maximum(s_ * pred + t_, 1e-3)
        vals.append(depth_metrics(zz, Z_gt)["AbsRel"])
    anchor_rel[n_anchor] = (np.median(vals), np.percentile(vals, 90))
    print("%4d anchors: median AbsRel %.4f, 90th percentile %.4f" % (n_anchor, *anchor_rel[n_anchor]))
```

The fitted `s = 0.5876, t = -0.1476` are close to the exact inverse of the simulated affine map, $1/1.7 = 0.5882$ and $-0.25/1.7 = -0.1471$, and give `AbsRel 0.0144, RMSE 0.105 m, delta1 1.000`. Ignoring the shift and fitting only a scale ($z = k/p$ with the median $k$) gives `AbsRel 0.1205, RMSE 0.751 m`: eight times worse, a common mistake when the model's output is affine-invariant. With sparse anchors, 3 random metric points give a median AbsRel of 0.0189 but a bad tail (90th percentile 0.0677); 10 points give 0.0154 (0.0180) and 30 points are as good as all 19,200 (0.0148 against 0.0144). Two unknowns need few anchors, but they must be spread out.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-mono-align.svg" localized="true" caption="(a) A simulated relative-depth prediction $p$ against the true inverse depth: an affine relation with scatter; the fitted line $w = 0.588\,p - 0.148$. (b) Relative depth error after scale-and-shift alignment (AbsRel 0.0144): the remaining error is the smooth, low-frequency part of the prediction error, which no global alignment can remove. (c) AbsRel after alignment from $n$ random metric anchors (50 trials each; median and 90th percentile). Dotted: alignment with all pixels (gray, 0.0144) and scale-only alignment (red, 0.1205)." %}

**Metrics.** Monocular depth papers report **AbsRel** $= \frac1n\sum\lvert\hat z - z^\ast\rvert/z^\ast$, **RMSE** in metres, and the threshold accuracy **$\delta\_1$**: the fraction of pixels with $\max(\hat z/z^\ast, z^\ast/\hat z) < 1.25$ (also $\delta\_2$ and $\delta\_3$ with $1.25^2$ and $1.25^3$). For relative models, the metrics are computed after the alignment above. Note how lenient $\delta\_1$ is: our scale-only result, eight times worse in AbsRel, still has $\delta\_1 = 0.991$.

### 6.5 Self-supervision and foundation models

Ground-truth depth is expensive. **Self-supervised** methods train on video or stereo pairs without depth labels: predict depth for one frame (and the camera motion), warp the neighbouring frame into it with the reprojection of section 3.2 (with a per-pixel depth in place of a plane), and minimize the photometric error. Monodepth2 (Godard et al., 2019) made this work robustly with a per-pixel minimum over source frames (the same idea as our best-k for occlusions) and auto-masking of static pixels.

The recent jump came from scale. **Depth Anything** (Yang et al., CVPR 2024) trained a DPT-style model on 1.5 million labelled images plus about 62 million unlabelled images pseudo-labelled by a teacher, with strong augmentation and a feature-alignment loss to a frozen DINOv2 encoder. **Depth Anything V2** (NeurIPS 2024) replaced the real labelled images with precise synthetic ones for the teacher, which sharpened fine detail. **Marigold** (Ke et al., CVPR 2024) took a different route: fine-tune the Stable Diffusion image generator to "generate" an affine-invariant depth map conditioned on the image, exploiting the generator's prior about scenes. **Video Depth Anything** (Chen et al., CVPR 2025) adds a spatio-temporal head for depth that is consistent over long videos.

### 6.6 Metric depth and the camera problem

To predict metres, a model must know the camera, because of the $f$-$z$ ambiguity of section 6.1. The 2024-2025 generation of metric models handles it in different ways:

- **Canonical camera.** Metric3D (Yin et al., ICCV 2023) and Metric3D v2 (Hu et al., TPAMI 2024) transform every training image (or its labels) to a canonical focal length, so that "a car 50 pixels tall" always means the same depth. At test time the known focal length maps the prediction back.
- **Predict the camera.** UniDepth (Piccinelli et al., CVPR 2024) predicts the camera rays with a dedicated module and conditions the depth on them; Depth Pro (Bochkovskii et al., ICLR 2025) estimates the focal length itself and produces sharp metric depth in a fraction of a second.
- **Predict geometry, not depth.** MoGe (Wang et al., CVPR 2025) predicts an affine-invariant 3D point map (depth and rays together) and recovers the focal length and shift from it by a small optimization.

Metric monocular depth is now good enough to serve as a prior almost everywhere: initializing MVS and SLAM, filling holes in sensor depth, supervising NeRF and Gaussian splatting, and giving robots a first guess of geometry. It is still a learned guess: its error is larger than that of a calibrated stereo pair at short range, and it can be confidently wrong on unusual scenes (mirrors, paintings, miniature models). Combining it with geometric measurements, as in the alignment above, gets the best of both.

## 7. Depth fusion

### 7.1 From many depth maps to one model

MVS produces one depth map per image; a depth camera produces 30 per second. They overlap, disagree slightly because of noise, and contain outliers. Fusion turns them into one consistent model. The simplest fusion, used by COLMAP, works on points:

1. **Filter each depth map** by consistency: project a pixel's 3D point into a neighbouring view, read the neighbour's depth there, back-project that, and project it back into the first view. If it returns within a pixel or so and the depths agree within a percent, the pixel is consistent with that neighbour. Keep pixels consistent with at least two or three neighbours.
2. **Merge** the surviving points of all views, averaging those that project to the same pixel in several views.

The result is a dense point cloud. To get a surface (and to average noise properly), we need a volumetric representation.

### 7.2 The truncated signed distance function

Curless and Levoy (1996) proposed to fuse range images in a **voxel grid** that stores, at each voxel centre $\mathbf v$, a **signed distance** to the nearest surface: positive in front (free space), negative behind (inside), zero on the surface. Each depth map contributes a **projective** signed distance along the camera's viewing direction: project $\mathbf v$ into the depth map to get the pixel $\mathbf x(\mathbf v)$ and the voxel's own depth $z(\mathbf v)$, then

$$
\mathrm{sdf}(\mathbf v) = z_{\text{meas}}\big(\mathbf x(\mathbf v)\big) - z(\mathbf v),
\qquad
\mathrm{tsdf}(\mathbf v) = \operatorname{clamp}\!\big(\mathrm{sdf}(\mathbf v)/\mu,\, -1,\, 1\big).
$$

Two rules make it robust. **Truncation** at $\pm\mu$: far from the surface the projective distance is meaningless (it measures along the ray, not to the nearest surface), so voxels far in front are simply "free" (+1), and voxels more than $\mu$ behind the measured surface are **not updated** at all, since we cannot see what lies behind a surface. **Weighted averaging** over all depth maps:

$$
T_{k}(\mathbf v) = \frac{W_{k-1}(\mathbf v)\,T_{k-1}(\mathbf v) + w_k\,\mathrm{tsdf}_k(\mathbf v)}{W_{k-1}(\mathbf v) + w_k},
\qquad W_k = W_{k-1} + w_k .
$$

Why averaging distances is right: if the depth noise along each ray is Gaussian, the maximum-likelihood surface position from many observations is the (weighted) mean, and the zero crossing of the averaged distance function is exactly that mean. The weights $w\_k$ can encode confidence: lower for grazing angles, far ranges or low ToF amplitude. The surface is the **zero level set** of $T$, extracted with marching cubes ([graphics post 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) derives it) or rendered directly by ray casting.

**KinectFusion** (Newcombe et al., 2011) made this real-time on a GPU: every new depth frame is aligned to a ray-cast of the current TSDF with ICP (tracking), then integrated (mapping). A dense grid is wasteful, since almost all voxels are empty; **voxel hashing** (Nießner et al., 2013) allocates small blocks of voxels only near the surface and indexes them with a hash table, which made room-scale and building-scale fusion possible. The trade-offs between dense grids, octrees, hashing and other representations are the subject of [post 8]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }}).

### 7.3 TSDF fusion in 2D, in code

To see the averaging at work, we fuse noisy 1D depth scans of a 2D scene (a disk and a square) taken by a camera that circles the scene. The noise grows with distance, $\sigma = 2\ \text{mm} + 5\ \text{mm}\cdot z^2$ (with $z$ in metres), like a stereo or structured-light sensor.

```python
def sdf_scene(p):
    """2D scene: a disk and a square. Negative inside, positive outside."""
    d_disk = np.linalg.norm(p - [0.45, 0.35], axis=-1) - 0.55
    q = np.abs(p - [-0.5, -0.4]) - 0.4
    d_box = np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(-1), 0)
    return np.minimum(d_disk, d_box)


def camera_axes(ang):
    return np.array([np.cos(ang), np.sin(ang)]), np.array([np.sin(ang), -np.cos(ang)])  # fwd, right


def scan(pos, ang, n=96, fov=np.deg2rad(60), rng=None):
    """1D depth camera at pos looking along ang: z-depth of n pixels (sphere tracing), with noise
    sigma = 2 mm + 5 mm * z^2 that grows with distance like a stereo or structured-light sensor."""
    fwd, right = camera_axes(ang)
    f = (n / 2) / np.tan(fov / 2)
    u = (np.arange(n) + 0.5 - n / 2) / f
    dirs = fwd + u[:, None] * right                                  # z-component 1 along fwd
    z = np.zeros(n)
    for _ in range(200):
        z += sdf_scene(pos + z[:, None] * dirs) / np.linalg.norm(dirs, axis=1)
    z[z > 6] = np.nan                                                # missed everything
    return z + rng.normal(0, 0.002 + 0.005 * z ** 2)


def integrate(T, Wt, grid, pos, ang, z_meas, fov=np.deg2rad(60), mu=0.08):
    """KinectFusion-style update of the TSDF T and weights Wt (arrays over grid points)."""
    n = len(z_meas)
    fwd, right = camera_axes(ang)
    f = (n / 2) / np.tan(fov / 2)
    d = grid - pos
    z, x = d @ fwd, d @ right
    u = np.floor(f * x / np.maximum(z, 1e-9) + n / 2).astype(int)   # pixel of each grid point
    ok = (z > 1e-3) & (u >= 0) & (u < n)
    zm = z_meas[np.clip(u, 0, n - 1)]
    sdf = zm - z                                                     # projective signed distance
    ok &= np.isfinite(zm) & (sdf > -mu)                              # skip far behind the surface
    tsdf = np.clip(sdf / mu, -1.0, 1.0)
    T[ok] = (Wt[ok] * T[ok] + tsdf[ok]) / (Wt[ok] + 1)               # running weighted average
    Wt[ok] += 1


def zero_crossings(T, Wt, xs):
    """Surface points: linear interpolation where T changes sign between observed neighbours."""
    pts = []
    for axis in (0, 1):
        a, b = (T, np.roll(T, -1, axis))
        wa, wb = Wt, np.roll(Wt, -1, axis)
        m = (a * b < 0) & (wa > 0) & (wb > 0)
        if axis == 0:
            m[-1, :] = False
        else:
            m[:, -1] = False
        iy, ix = np.nonzero(m)
        frac = a[m] / (a[m] - b[m])
        px, py = xs[ix], xs[iy]
        h = xs[1] - xs[0]
        pts.append(np.stack([px + (axis == 1) * frac * h, py + (axis == 0) * frac * h], 1))
    return np.concatenate(pts)


def scan_points(pos, ang, z, fov=np.deg2rad(60)):
    """The 2D points measured by one scan."""
    fwd, right = camera_axes(ang)
    n = len(z)
    u = (np.arange(n) + 0.5 - n / 2) / ((n / 2) / np.tan(fov / 2))
    ok = np.isfinite(z)
    return pos + z[ok, None] * (fwd + u[ok, None] * right)


xs_g = np.linspace(-1.5, 1.5, 201)
grid = np.stack(np.meshgrid(xs_g, xs_g), -1).reshape(-1, 2)          # (x, y) of every cell
rng = np.random.default_rng(5)
T, Wt = np.ones(len(grid)), np.zeros(len(grid))
n_scans, poses, tsdf_err = 36, [], {}
for k in range(n_scans):
    th = 2 * np.pi * k / n_scans
    pos = 2.0 * np.array([np.cos(th), np.sin(th)])                   # on a circle of radius 2 m
    ang = th + np.pi + rng.uniform(-0.1, 0.1)                        # look back at the origin
    z_meas = scan(pos, ang, rng=rng)
    integrate(T, Wt, grid, pos, ang, z_meas)
    poses.append((pos, ang, z_meas))
    if k + 1 in (1, 2, 4, 8, 16, 36):
        P = zero_crossings(T.reshape(201, 201), Wt.reshape(201, 201), xs_g)
        tsdf_err[k + 1] = np.sqrt(np.mean(sdf_scene(P) ** 2))
raw = np.concatenate([scan_points(*p) for p in poses])
print("raw points: RMS distance to the surface %.2f mm" % (1000 * np.sqrt(np.mean(sdf_scene(raw) ** 2))))
print("fused TSDF:", ", ".join("%d scans %.2f mm" % (k, 1000 * v) for k, v in tsdf_err.items()))
```

Output: the raw measured points lie on average `14.02 mm` (RMS) from the true surface. The zero level set of the fused TSDF has an RMS error of `15.36 mm` after one scan, `12.11`, `11.33`, `10.32` and `8.31 mm` after 2, 4, 8 and 16 scans, and `4.41 mm` after all 36. Each surface point is seen by a growing number of scans, and averaging reduces the noise roughly like one over the square root of that number: after all 36 scans a voxel on the surface has been updated by a median of 10 scans, and $14.0/\sqrt{10} = 4.4$ mm. (After one scan the error is slightly above the 13.1 mm of that scan's own points, because the 1.5 cm grid and the linear interpolation of the zero crossing add a little error of their own.)

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-tsdf.svg" localized="true" caption="2D TSDF fusion (grid 201 x 201 over the dotted 3 m square, truncation $\mu = 8$ cm). (a) One scan from the camera on the right (orange triangle, thin orange rays, black measured points): the TSDF is +1 (blue) in observed free space, crosses zero at the measured surface and is red just behind it; nothing is updated further behind or outside the field of view. The dashed outline is the true scene. (b) After 36 scans from a circle of radius 2 m (every third camera shown as an orange triangle): the zero level set (purple, under the white transition) closes around both objects. (c) RMS distance of the extracted zero crossings to the true surface against the number of fused scans, from 15.4 mm to 4.4 mm; the raw points have 14.0 mm." %}

### 7.4 Limits of TSDF fusion

TSDF fusion is robust and simple, which is why it is still in every depth-camera SDK. Its limits motivate the next posts. A uniform grid either wastes memory or blurs detail. Structures thinner than the truncation band (a chair leg, a cable) are averaged away when seen from opposite sides, because one side's "behind" overwrites the other side's "in front". Fusion assumes known, accurate poses; pose errors smear the surface (SLAM's loop closures in [post 6]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }}) deform the TSDF after the fact). And it stores geometry only, not appearance or view-dependent effects. [Post 8]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }}) compares TSDFs with meshes, point clouds, neural fields and Gaussians, and [post 9]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) has an interactive TSDF fusion widget and the complete reconstruction pipeline.

## 8. Evaluating depth and MVS

**Depth maps** are evaluated per pixel against ground truth from a better sensor: AbsRel, RMSE, $\delta\_1$ (section 6.4), the fraction of pixels with error below a threshold (our "within 1%"), and for stereo the **bad-$\tau$ rate**, the percentage of pixels with disparity error above $\tau$ pixels. Classic benchmarks: Middlebury (high-resolution indoor stereo with structured-light ground truth, organized after the taxonomy of Scharstein and Szeliski, 2002), KITTI (driving, sparse LiDAR ground truth), NYU Depth v2 (indoor Kinect) and ETH3D.

**MVS reconstructions** are evaluated as point clouds against a reference scan, with two numbers that mirror precision and recall. **Accuracy** is the distance from each reconstructed point to the reference (are the points correct?); **completeness** is the distance from each reference point to the reconstruction (is the surface covered?). Tanks and Temples (Knapitsch et al., 2017) combines them into an **F-score** at a distance threshold $\tau$: precision $P(\tau)$ is the fraction of reconstructed points within $\tau$ of the reference, recall $R(\tau)$ the fraction of reference points within $\tau$ of the reconstruction, and $F = 2PR/(P + R)$. The main MVS benchmarks are DTU (Jensen et al., 2014: table-top objects photographed by a camera on a robot arm, with structured-light reference scans), ETH3D (Schöps et al., 2017: high-resolution indoor and outdoor scenes with laser scans) and Tanks and Temples (large indoor and outdoor scenes). Note what the metrics reward: a method can raise accuracy by deleting uncertain points, so always look at both numbers.

## 9. A practical recipe

- **You control the hardware and the scene is indoors and close:** use an active sensor (structured light or iToF), fuse with a TSDF, done. Mind multipath in corners and black or shiny objects.
- **Outdoors or at long range:** stereo with a baseline chosen from $\sigma\_z = z^2\sigma\_\delta/(fB)$, or LiDAR when you can afford it.
- **Offline reconstruction from photos:** SfM ([post 5]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})), then COLMAP's PatchMatch MVS (or a learned MVS model if you have similar training data), geometric filtering, fusion, meshing ([post 9]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})).
- **One image, or any time you need a prior:** a recent monocular model; relative models plus a scale-and-shift alignment to whatever metric anchors you have, or a metric model with the correct intrinsics.
- **Always:** store z-depth, not range (or label it clearly), keep invalid pixels as NaN or 0 with a mask, sample and regress in inverse depth, report relative errors, and check edges and textureless regions visually, since the mean error hides them.

## Try it

- In the **plane-sweep widget** of section 3.9, place a probe on the poster and try every window size and both costs: no setting produces a clear minimum. Then find a baseline at which the stripe probe gets the right depth, and explain with section 3.6 why it moves.
- Still in the widget, compare the WTA accuracy for 3x3 and 9x9 windows, and look at the depth map near the box and the sphere to see where the larger window loses.
- The home page's [Interactive Lab]({{ '/' | relative_url }}#lab) shows the rendering side: its Gaussian World demo renders a scene from a representation of the kind that depth maps and MVS help to initialize.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| A multiple-baseline stereo (Okutomi, Kanade) | TPAMI | 1993 | [DOI](https://doi.org/10.1109/34.206955) | SSD summed over baselines in inverse depth removes repetitive-pattern ambiguity |
| A space-sweep approach to true multi-image matching (Collins) | CVPR | 1996 | [DOI](https://doi.org/10.1109/CVPR.1996.517097) | The plane sweep |
| A volumetric method for building complex models from range images (Curless, Levoy) | SIGGRAPH | 1996 | [DOI](https://doi.org/10.1145/237170.237269) | TSDF fusion by weighted averaging |
| Handling occlusions in dense multi-view stereo (Kang, Szeliski, Chai) | CVPR | 2001 | [DOI](https://doi.org/10.1109/CVPR.2001.990462) | Shiftable windows and per-pixel view subsets against occlusions |
| A taxonomy and evaluation of dense two-frame stereo correspondence algorithms (Scharstein, Szeliski) | IJCV | 2002 | [DOI](https://doi.org/10.1023/A:1014573219977) | Matching cost, aggregation, optimization, refinement; the Middlebury benchmark |
| Stereo processing by semiglobal matching and mutual information (Hirschmüller) | TPAMI | 2008 | [DOI](https://doi.org/10.1109/TPAMI.2007.1166) | SGM |
| PatchMatch: a randomized correspondence algorithm for structural image editing (Barnes et al.) | ACM TOG (SIGGRAPH) | 2009 | [DOI](https://doi.org/10.1145/1531326.1531330) | Random init, propagation, random search |
| Accurate, dense, and robust multiview stereopsis (Furukawa, Ponce) | TPAMI | 2010 | [DOI](https://doi.org/10.1109/TPAMI.2009.161) | PMVS, patch-based MVS |
| PatchMatch stereo: stereo matching with slanted support windows (Bleyer, Rhemann, Rother) | BMVC | 2011 | [DOI](https://doi.org/10.5244/C.25.14) | Per-pixel slanted planes found by PatchMatch |
| Structured-light 3D surface imaging: a tutorial (Geng) | Advances in Optics and Photonics | 2011 | [DOI](https://doi.org/10.1364/AOP.3.000128) | Survey of structured-light coding schemes |
| KinectFusion: real-time dense surface mapping and tracking (Newcombe et al.) | ISMAR | 2011 | [DOI](https://doi.org/10.1109/ISMAR.2011.6092378) | Real-time TSDF fusion with ICP tracking |
| Real-time 3D reconstruction at scale using voxel hashing (Nießner et al.) | ACM TOG (SIGGRAPH Asia) | 2013 | [DOI](https://doi.org/10.1145/2508363.2508374) | Sparse TSDF blocks in a hash table |
| Large scale multi-view stereopsis evaluation (Jensen et al.) | CVPR | 2014 | [DOI](https://doi.org/10.1109/CVPR.2014.59) | The DTU MVS benchmark |
| Depth map prediction from a single image using a multi-scale deep network (Eigen, Puhrsch, Fergus) | NeurIPS | 2014 | [arXiv](https://arxiv.org/abs/1406.2283) | Early deep monocular depth network; scale-invariant loss |
| Massively parallel multiview stereopsis by surface normal diffusion (Galliani, Lasinger, Schindler) | ICCV | 2015 | [DOI](https://doi.org/10.1109/ICCV.2015.106) | Gipuma: red-black PatchMatch on the GPU |
| Pixelwise view selection for unstructured multi-view stereo (Schönberger et al.) | ECCV | 2016 | [DOI](https://doi.org/10.1007/978-3-319-46487-9_31) | COLMAP MVS: joint depth, normal and view selection |
| End-to-end learning of geometry and context for deep stereo regression (Kendall et al.) | ICCV | 2017 | [arXiv](https://arxiv.org/abs/1703.04309) | GC-Net: 3D-CNN cost volume and soft-argmin |
| A multi-view stereo benchmark with high-resolution images and multi-camera videos (Schöps et al.) | CVPR | 2017 | [DOI](https://doi.org/10.1109/CVPR.2017.272) | ETH3D |
| Tanks and Temples: benchmarking large-scale scene reconstruction (Knapitsch et al.) | ACM TOG (SIGGRAPH) | 2017 | [DOI](https://doi.org/10.1145/3072959.3073599) | Precision, recall and F-score for reconstructions |
| MVSNet: depth inference for unstructured multi-view stereo (Yao et al.) | ECCV | 2018 | [arXiv](https://arxiv.org/abs/1804.02505) | Learned plane sweep with a variance cost volume |
| Recurrent MVSNet for high-resolution multi-view stereo depth inference (Yao et al.) | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1902.10556) | GRU regularization, memory independent of $D$ |
| Digging into self-supervised monocular depth estimation (Godard et al.) | ICCV | 2019 | [arXiv](https://arxiv.org/abs/1806.01260) | Monodepth2 |
| Multi-scale geometric consistency guided multi-view stereo (Xu, Tao) | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1904.08103) | ACMM: adaptive checkerboard propagation, multi-scale consistency |
| Cascade cost volume for high-resolution multi-view stereo and stereo matching (Gu et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1912.06378) | CasMVSNet: coarse-to-fine depth ranges |
| Towards robust monocular depth estimation: mixing datasets for zero-shot cross-dataset transfer (Ranftl et al.) | TPAMI | 2022 | [arXiv](https://arxiv.org/abs/1907.01341) | MiDaS: affine-invariant inverse-depth training on mixed data |
| Vision transformers for dense prediction (Ranftl, Bochkovskiy, Koltun) | ICCV | 2021 | [arXiv](https://arxiv.org/abs/2103.13413) | DPT |
| PatchmatchNet: learned multi-view patchmatch stereo (Wang et al.) | CVPR | 2021 | [arXiv](https://arxiv.org/abs/2012.01411) | Learned, iterative PatchMatch |
| RAFT-Stereo: multilevel recurrent field transforms for stereo matching (Lipson, Teed, Deng) | 3DV | 2021 | [arXiv](https://arxiv.org/abs/2109.07547) | Recurrent stereo on a correlation pyramid |
| Depth Anything: unleashing the power of large-scale unlabeled data (Yang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2401.10891) | Relative depth from 62M pseudo-labelled images |
| Repurposing diffusion-based image generators for monocular depth estimation (Ke et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.02145) | Marigold |
| UniDepth: universal monocular metric depth estimation (Piccinelli et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2403.18913) | Metric depth with a self-prompted camera module |
| Metric3D v2: a versatile monocular geometric foundation model (Hu et al.) | TPAMI | 2024 | [arXiv](https://arxiv.org/abs/2404.15506) | Canonical camera space for metric depth and normals |
| Depth Anything V2 (Yang et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2406.09414) | Synthetic-label teacher, finer detail |
| Depth Pro: sharp monocular metric depth in less than a second (Bochkovskii et al.) | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2410.02073) | Zero-shot metric depth with focal-length estimation |
| MoGe: unlocking accurate monocular geometry estimation for open-domain images (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2410.19115) | Affine-invariant point maps |
| FoundationStereo: zero-shot stereo matching (Wen et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.09898) | Stereo with monocular foundation-model priors |
| Video Depth Anything: consistent depth estimation for super-long videos (Chen et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.12375) | Temporally consistent video depth |
| Depth Anything 3: recovering the visual space from any views (Lin et al.) | ICLR | 2026 | [arXiv](https://arxiv.org/abs/2511.10647) | One transformer for depth and pose from any number of views (arXiv Nov 2025) |

Status as of November 2026: all entries are published at the venue listed; Depth Anything 3 appeared on arXiv in November 2025 and was published at ICLR 2026.

## Learning resources

- R. Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed., 2022: chapter 12 (depth estimation: stereo, plane sweep, MVS, monocular depth) and chapter 13 (3D reconstruction, including TSDF fusion). Free for personal use at [szeliski.org/Book](https://szeliski.org/Book/).
- Y. Furukawa and C. Hernández, *Multi-View Stereo: A Tutorial*, Foundations and Trends in Computer Graphics and Vision, 2015: photo-consistency measures, depth-map MVS, fusion and evaluation, in one compact text.
- R. Hartley and A. Zisserman, *Multiple View Geometry in Computer Vision*, 2nd ed., 2004, section 13.1 (homographies induced by a plane).
- M. Hansard, S. Lee, O. Choi and R. Horaud, *Time-of-Flight Cameras: Principles, Methods and Applications*, Springer, 2012, for the physics and calibration of ToF sensors.
- Code: [COLMAP](https://github.com/colmap/colmap) (PatchMatch MVS and fusion), [OpenMVS](https://github.com/cdcseacave/openMVS), [Open3D](https://github.com/isl-org/Open3D) (TSDF integration with `ScalableTSDFVolume`), [MVSNet](https://github.com/YoYo000/MVSNet), [CasMVSNet](https://github.com/alibaba/cascade-stereo), [PatchmatchNet](https://github.com/FangjinhuaWang/PatchmatchNet), [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2), [Depth Pro](https://github.com/apple/ml-depth-pro), [UniDepth](https://github.com/lpiccinelli-eth/UniDepth).
- Benchmarks: [Middlebury stereo](https://vision.middlebury.edu/stereo/), [ETH3D](https://www.eth3d.net/), [Tanks and Temples](https://www.tanksandtemples.org/).

## Exercises

1. Show that for two cameras related by a pure rotation ($\mathbf t = \mathbf 0$) the plane-induced homography does not depend on the plane. What does this mean for plane-sweep stereo with a rotating camera, and how does it connect to the degeneracies of [post 4]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})?

   <details markdown="1"><summary>Hint</summary>

   With $\mathbf t = \mathbf 0$ the term $\mathbf t\mathbf n^\top/d$ vanishes and $H = K\_s R K\_r^{-1}$ for every plane: all hypotheses produce the same warp, every cost curve is flat, and depth is unobservable. This is the pure-rotation degeneracy: without a baseline there is no parallax and no triangulation. In practice it means MVS needs views with a sufficient triangulation angle, which is why view selection discards near-duplicate viewpoints.
   </details>

2. In the rectified case $x\_s = x - fB/z$. Our sweep uses $D$ planes uniform in $1/z$ between $z\_n$ and $z\_f$. Derive the pixel spacing of consecutive hypotheses and choose $D$ so that it is 0.5 px for $f = 600$ px, $B = 0.12$ m, $z\_n = 0.5$ m, $z\_f = 10$ m. How many planes would a sampling uniform in $z$ need to keep the spacing below 0.5 px everywhere?

   <details markdown="1"><summary>Hint</summary>

   The disparity range is $fB(1/z\_n - 1/z\_f) = 72 \cdot 1.9 = 136.8$ px, so uniform-in-$w$ planes are $136.8/(D - 1)$ px apart: $D = 275$ gives 0.5 px. Uniform in $z$, the worst spacing is at $z\_n$, where $\lvert\partial\delta/\partial z\rvert = fB/z\_n^2 = 288$ px per metre; a 0.5 px step needs $\Delta z = 1.74$ mm, so $9.5/0.00174 \approx 5500$ planes, twenty times more.
   </details>

3. Modify `ncc_cost` to return SAD instead of $1 - \mathrm{NCC}$, multiply source view 1 by 0.8 and add 0.1 (a gain and offset change, as between two cameras with different exposure), and rerun the sweep with view 1 only. Compare the accuracy of SAD and NCC with and without the brightness change.

   <details markdown="1"><summary>Hint</summary>

   Replace the return value by `box(np.abs(a - b))` (keeping the outside test), and apply the change as `(0.8 * I + 0.1, R, t)` to `src[0]`. We got, for pixels within 1% of the truth: NCC 52.3% with or without the change; SAD 57.7% without it (on this noise-only scene SAD is slightly better) but 32.5% with it. NCC is unaffected by construction, since it subtracts the mean and divides by the standard deviation of each window; SAD now compares windows that differ everywhere.
   </details>

4. Add **geometric consistency filtering** to the plane sweep: compute the depth map of source view 1 as a second reference (swap the roles of the cameras), then keep a reference pixel only if its 3D point, projected into view 1, lands on a pixel whose depth back-projects to within 1 px of the starting pixel. Which pixels are removed, and how does the accuracy of the remaining ones change?

   <details markdown="1"><summary>Hint</summary>

   Use `backproject`, `relative_pose` and $K$ to map the point into view 1, read view 1's depth at the rounded pixel, back-project that into 3D, and map it into the reference with the inverse relative pose. In our run the check keeps 80.9% of the pixels; among them 61.5% are within 1% (52.3% before filtering) and 90.2% within 5% (78.3% before). It removes about half of the poster (random depths agree between the two views only by chance) and most of the right border strip, which view 1 does not see. With more views, requiring agreement with two or three of them removes far more outliers; fusion with other views then fills the holes.
   </details>

5. In the TSDF experiment, set all fusion weights to 1 as now, then replace them by $w = 1/\sigma(z)^2$ with the sensor's noise model $\sigma(z) = 0.002 + 0.005z^2$. Does the error after 36 scans change? Then double the truncation $\mu$ to 16 cm, and reduce it to a quarter, 2 cm: what happens to thin parts and to the noise?

   <details markdown="1"><summary>Hint</summary>

   Compute the per-grid-point weight `w` $= 1/\sigma(z\_m)^2$ inside `integrate` and use it in the update: `T = (Wt * T + w * tsdf) / (Wt + w)` and `Wt += w` (on the `ok` entries). We got 4.36 mm instead of 4.41 mm: almost no change, because every camera in this experiment is about equally far from the objects, so all weights are similar; inverse-variance weighting (the maximum-likelihood combination of Gaussian measurements) pays off when scans see the same surface from very different distances. With $\mu = 2$ cm the error rises to 12.9 mm: the band of updated voxels is barely wider than the noise far from the camera, and the zero crossing breaks into spurious fragments. With $\mu = 16$ cm it rises to 10.1 mm: the band is now wider than the features of the scene, such as the square's corners and the 10 cm gap between the disk and the square, so measurements of one surface spill into the other's voxels.
   </details>

**Next:** [3D representations]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }}): what to store once we have depth (point clouds, meshes, voxels, signed distance fields, neural fields or 3D Gaussians) and how to convert between them.
