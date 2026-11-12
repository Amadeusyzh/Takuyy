---
layout: post
title: "Multi-view geometry and bundle adjustment: PnP, Structure-from-Motion and the Schur complement"
date: 2026-10-27 11:05:00+0900
description: "From two views to many: camera resectioning with P3P, EPnP and RANSAC, bundle adjustment derived from scratch (Jacobians, sparse normal equations, the Schur complement, Levenberg-Marquardt, gauge freedom, robust kernels), incremental SfM as in COLMAP, global SfM with rotation averaging and GLOMAP-style positioning, and the scale ambiguity, all with NumPy code on synthetic scenes."
categories: 3d-vision
tags: [pnp, p3p, epnp, bundle-adjustment, schur-complement, structure-from-motion, colmap, glomap, rotation-averaging, gauge-freedom]
series: 3d-vision
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## Why this matters

[Post 04]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }}) recovered the relative pose of two calibrated cameras and triangulated the points they both see. Real reconstructions have tens, thousands or millions of images. Every photo must be placed in **one** common frame, every 3D point must agree with every image that sees it, and all of this must survive wrong matches, bad initial guesses and drift. This post is about the three tools that do that:

1. **Camera resectioning (PnP)**: place a new camera from 2D-3D matches against points you already have.
2. **Bundle adjustment (BA)**: adjust all cameras and all points together until every ray passes through its pixel. It is the workhorse of Structure-from-Motion (SfM), SLAM, calibration (which is a small BA with a known target, as [post 02]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}) noted) and of the camera poses that NeRF and 3D Gaussian Splatting train on.
3. **The SfM pipelines** that use them: **incremental** SfM, which grows a reconstruction one image at a time (COLMAP), and **global** SfM, which estimates all rotations and positions at once (GLOMAP).

[Neural rendering post 1]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}) gave a one-section tour of BA and COLMAP. Here we derive everything, implement it in NumPy, and run it on synthetic scenes where the truth is known, so that every claim comes with a number. The bundle adjuster we build in section 3 is about 60 lines long, uses the Schur complement, supports robust kernels, and is the same algorithm that Ceres Solver runs inside COLMAP, minus decades of engineering.

## Prerequisites

- [Post 01]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }}): the pinhole camera $\mathbf x \sim K[R \mid \mathbf t]\mathbf X$, world-to-camera poses, the camera centre $\mathbf C = -R^\top\mathbf t$, and the OpenCV frame ($x$ right, $y$ down, $z$ forward).
- [Post 02]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}): reprojection error as maximum likelihood, Gauss-Newton and Levenberg-Marquardt, the axis-angle vector and Rodrigues' formula, and the covariance $\sigma^2(J^\top J)^{-1}$.
- [Post 03]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}): correspondences, RANSAC and the number of samples it needs.
- [Post 04]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }}): the essential matrix, its decomposition with the cheirality check, and triangulation. We reuse compact versions of these tools here without re-deriving them.
- Linear algebra: block matrices, eigenvectors, the SVD. Python with NumPy and SciPy. All snippets form **one script**; run them in order and every printed number matches the text.

**Notation.** Cameras are indexed by $i = 1, \dots, m$ and points by $j = 1, \dots, n$. Camera $i$ has the world-to-camera pose $(R\_i, \mathbf t\_i)$, so a world point $\mathbf X\_j$ has camera coordinates $\mathbf X\_{c} = R\_i\mathbf X\_j + \mathbf t\_i$. All cameras share a known $K$ (calibrated in post 02). $\pi(\cdot)$ maps camera coordinates to pixels, $\pi(X, Y, Z) = (f\_x X/Z + c\_x,\ f\_y Y/Z + c\_y)$. The set $\mathcal O$ contains the pairs $(i, j)$ where camera $i$ observed point $j$, at the pixel $\mathbf x\_{ij}$, and $L = \vert\mathcal O\vert$ is the number of observations. The world frame is also $y$-down, so "up" is $-y$.

## 1. From two views to many

### 1.1 Unknowns, measurements and the gauge

Count what we want and what we have. Each camera has 6 pose parameters (3 for rotation, 3 for translation) and each point 3 coordinates. Each observation gives 2 numbers. So

$$
\underbrace{6m + 3n}_{\text{unknowns}} \quad\text{versus}\quad \underbrace{2L}_{\text{measurements}} .
$$

There is a catch. Images alone cannot tell where the world origin is, which way its axes point, or how big the scene is. If you move, rotate and scale the whole reconstruction together, every image stays the same (section 3.7 proves it). That is a 7-parameter family of equally good answers: 3 for translation, 3 for rotation and 1 for scale. This freedom is called the **gauge**. So the number of quantities images can actually determine is $6m + 3n - 7$. Two views with $n$ points give $2 \cdot 2n$ measurements for $12 + 3n - 7$ unknowns, which needs $n \ge 5$: the five-point problem of post 04.

### 1.2 The running example

We build one scene and use it for sections 2 and 3: 120 points on the ground and on two boxes, seen by 8 cameras on an arc 5 m away, with $f = 500$ px and $640\times480$ images. Every observation gets Gaussian noise with $\sigma = 0.5$ px. As in post 02's synthetic calibration, we simulate so that the truth is known, but now the 3D points are unknown too.

```python
import numpy as np

def skew(v):
    return np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])

def rodrigues(w):
    """Axis-angle vector -> rotation matrix (as in post 02)."""
    th = np.linalg.norm(w)
    if th < 1e-12:
        return np.eye(3) + skew(w)
    k = skew(np.asarray(w, float) / th)
    return np.eye(3) + np.sin(th) * k + (1 - np.cos(th)) * k @ k

def look_at(C, target=(0.0, 0.0, 0.0)):
    """World-to-camera (R, t) of a camera at C looking at target. World and camera are
    OpenCV-style (y down), so the world 'up' direction is -y."""
    z = np.asarray(target, float) - C
    z /= np.linalg.norm(z)
    x = np.cross(z, [0.0, -1.0, 0.0]); x /= np.linalg.norm(x)
    R = np.stack([x, np.cross(z, x), z])          # rows: camera axes in world coordinates
    return R, -R @ C

def project(K, R, t, X):
    """World points X (N x 3) -> pixels (N x 2) and depths (N,)."""
    Xc = X @ R.T + t
    return (Xc[:, :2] / Xc[:, 2:]) @ K[:2, :2].T + K[:2, 2], Xc[:, 2]

def box_points(lo, hi, n, rng):
    """n random points on the surface of an axis-aligned box."""
    lo, hi = np.asarray(lo, float), np.asarray(hi, float)
    P = rng.uniform(lo, hi, (n, 3))
    axis = rng.integers(0, 3, n)
    side = rng.integers(0, 2, n)
    P[np.arange(n), axis] = np.where(side == 1, hi[axis], lo[axis])
    return P

rng = np.random.default_rng(5)
W, H = 640, 480
K = np.array([[500.0, 0, 320], [0, 500.0, 240], [0, 0, 1]])
X_true = np.vstack([                          # world y points down: the ground is y = 0
    np.c_[rng.uniform(-2, 2, 40), np.zeros(40), rng.uniform(-2, 2, 40)],    # ground
    box_points([-1.3, -1.0, -0.6], [-0.3, 0.0, 0.4], 40, rng),              # low box
    box_points([0.3, -1.6, -0.9], [1.3, 0.0, 0.1], 40, rng)])               # tall box
cams_true = [look_at(5.0 * np.array([np.sin(a), -0.4, -np.cos(a)]), (0, -0.5, 0))
             for a in np.deg2rad(np.linspace(-60, 60, 8))]

sigma = 0.5                                   # pixel noise
obs = []                                      # (camera i, point j, observed pixel)
for i, (R, t) in enumerate(cams_true):
    uv, depth = project(K, R, t, X_true)
    for j in range(len(X_true)):
        if depth[j] > 0 and 0 <= uv[j, 0] < W and 0 <= uv[j, 1] < H:
            obs.append((i, j, uv[j] + rng.normal(0, sigma, 2)))
cam_idx = np.array([o[0] for o in obs]); pt_idx = np.array([o[1] for o in obs])
uv_obs = np.array([o[2] for o in obs])
m, n, L = len(cams_true), len(X_true), len(obs)
print(f"{m} cameras, {n} points, {L} observations")
print(f"unknowns 6m + 3n = {6 * m + 3 * n}, residuals 2L = {2 * L}, gauge 7")
```

```text
8 cameras, 120 points, 960 observations
unknowns 6m + 3n = 408, residuals 2L = 1920, gauge 7
```

The problem has 408 unknowns, 401 of which are determined, and 1920 measurements: overdetermined almost five times.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-scene.svg" caption="The running example. Left: 120 points on the ground (gray), on a low box (orange) and on a tall box (purple), and the 8 cameras on an arc 5 m from the centre, 2 m above the ground, all looking at $(0,-0.5,0)$. The dashed red lines are three rays of camera 4. Right: what camera 4 observes, 120 pixels with 0.5 px noise; the circled ones are the three points of the P3P example in section 2.3." %}

### 1.3 The plan

Multi-view reconstruction is a chicken-and-egg problem: with known cameras we could triangulate the points (post 04), and with known points we could place the cameras (section 2). Both are easy alone. Doing both at once is a large nonlinear least-squares problem, bundle adjustment (section 3), which needs a good starting point. SfM pipelines produce that starting point either by growing the reconstruction one camera at a time (section 4) or by solving for all rotations and then all positions (section 5). Section 6 deals with the one thing no pipeline can recover from images alone: the scale.

## 2. Camera resectioning: Perspective-n-Point

### 2.1 The problem

**Perspective-n-Point (PnP)**: given $n$ known 3D points $\mathbf X\_j$ (world frame), their pixels $\mathbf x\_j$ in a new image, and the intrinsics $K$, find the pose $(R, \mathbf t)$. In incremental SfM this is how each new image joins the model. In AR and robotics it is how a device relocalizes against a map. In post 02 it was the pose of the calibration board.

Each correspondence gives 2 equations and the pose has 6 unknowns, so **3 points** are the minimum. Three points give a finite number of solutions, up to four. A fourth point picks the right one. With many points we want the solution that is best in the least-squares sense, and with wrong matches among them we need RANSAC.

It is convenient to turn pixels into **bearing vectors**, unit directions in the camera frame: $\mathbf f = K^{-1}\tilde{\mathbf x} / \lVert K^{-1}\tilde{\mathbf x}\rVert$. A bearing knows the direction of a point but not its distance.

### 2.2 The linear way: DLT

The simplest method ignores the structure of the pose. Treat $P\_n = [R \mid \mathbf t]$ as a general $3\times4$ matrix with 12 unknowns. Each correspondence between $\mathbf X$ and the normalized image point $(x, y)$ gives two linear equations, exactly as in post 02's homography DLT but one dimension up:

$$
x\,(\mathbf p^{3\top}\tilde{\mathbf X}) - \mathbf p^{1\top}\tilde{\mathbf X} = 0, \qquad y\,(\mathbf p^{3\top}\tilde{\mathbf X}) - \mathbf p^{2\top}\tilde{\mathbf X} = 0 ,
$$

where $\mathbf p^{k\top}$ are the rows of $P\_n$. Six points give 12 equations; the least-squares solution is the smallest right singular vector. The left $3\times3$ block is then forced onto the nearest rotation with an SVD, and the scale is fixed by its singular values. The DLT is easy and works for any $n \ge 6$, but it estimates 11 degrees of freedom where only 6 exist, so noise leaks into the extra 5, and it minimizes an algebraic error, not pixels.

### 2.3 Three points: P3P

**The geometry.** Let the unknown camera centre be $\mathbf C$ and let $s\_1, s\_2, s\_3$ be the unknown distances from $\mathbf C$ to the three points. The angle between two bearing vectors is known from the image ($\cos\theta\_{jk} = \mathbf f\_j^\top\mathbf f\_k$), and the distance $d\_{jk}$ between two points is known from the map. The triangle $\mathbf C, \mathbf X\_j, \mathbf X\_k$ then obeys the **law of cosines**:

$$
s_j^2 + s_k^2 - 2 s_j s_k \cos\theta_{jk} = d_{jk}^2, \qquad (j,k) \in \{(2,3), (1,3), (1,2)\}.
$$

Three quadratic equations in three distances. Name the sides $a = d\_{23}$, $b = d\_{13}$, $c = d\_{12}$ and the angles opposite to them $\alpha = \theta\_{23}$, $\beta = \theta\_{13}$, $\gamma = \theta\_{12}$. This is Grunert's formulation from 1841, as reviewed by Haralick et al. (1994).

**Elimination.** Write $s\_2 = u\, s\_1$ and $s\_3 = v\, s\_1$. Each equation becomes $s\_1^2$ times something, and dividing two of them removes $s\_1$:

$$
\begin{aligned}
b^2 (u^2 + v^2 - 2uv\cos\alpha) &= a^2 (1 + v^2 - 2v\cos\beta), \\
b^2 (1 + u^2 - 2u\cos\gamma) &= c^2 (1 + v^2 - 2v\cos\beta).
\end{aligned}
$$

Subtracting the second equation from the first cancels $u^2$ and leaves an equation that is *linear* in $u$:

$$
u = \frac{(a^2 - c^2)(1 + v^2 - 2v\cos\beta) - b^2 (v^2 - 1)}{2b^2(\cos\gamma - v\cos\alpha)} = \frac{N(v)}{D(v)} .
$$

Substituting $u = N/D$ into the second equation and multiplying by $D^2$ gives a polynomial of degree 4 in $v$, the **P3P quartic**. Each positive real root gives $u$, then $s\_1 = b / \sqrt{1 + v^2 - 2v\cos\beta}$, then the three points in the camera frame, $s\_k\mathbf f\_k$.

**From points to pose: absolute orientation.** We now have the same three points in two frames, world and camera, and need the rigid motion between them. For point sets $\mathbf A\_k$ and $\mathbf B\_k$ the least-squares rotation is the classical SVD solution (Kabsch, Horn, Umeyama): center both sets, form the cross-covariance $M = \sum (\mathbf B\_k - \bar{\mathbf B})(\mathbf A\_k - \bar{\mathbf A})^\top = U\Sigma V^\top$, take $R = U\,\mathrm{diag}(1, 1, \det UV^\top)\,V^\top$, then $\mathbf t = \bar{\mathbf B} - R\bar{\mathbf A}$. The determinant term prevents a reflection.

We let NumPy do the polynomial algebra, so the code follows the derivation line by line:

```python
def absolute_orientation(A, B):
    """R, t minimizing sum |R A_k + t - B_k|^2 (Kabsch / Horn), A and B are N x 3."""
    a, b = A.mean(0), B.mean(0)
    U, _, Vt = np.linalg.svd((B - b).T @ (A - a))
    D = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])
    R = U @ D @ Vt
    return R, b - R @ a

def p3p(Xw, f):
    """Grunert's P3P. Xw: 3 world points (3 x 3); f: their unit bearing vectors in the
    camera frame (3 x 3). Returns up to 4 candidate poses (R, t) with X_c = R X_w + t."""
    a = np.linalg.norm(Xw[1] - Xw[2]); b = np.linalg.norm(Xw[0] - Xw[2]); c = np.linalg.norm(Xw[0] - Xw[1])
    ca, cb, cg = f[1] @ f[2], f[0] @ f[2], f[0] @ f[1]      # cosines of the angles between rays
    P = np.polynomial.polynomial                             # coefficient arrays, lowest power first
    # with s2 = u s1 and s3 = v s1, two of the cosine-law equations give u = N(v) / D(v)
    N = (a * a - c * c) * np.array([1, -2 * cb, 1]) - b * b * np.array([-1, 0, 1])
    D = 2 * b * b * np.array([cg, -ca])
    # substitute into b^2 (1 + u^2 - 2 u cos(gamma)) = c^2 (1 + v^2 - 2 v cos(beta)), times D^2
    quartic = P.polyadd(b * b * P.polysub(P.polyadd(P.polymul(D, D), P.polymul(N, N)),
                                          2 * cg * P.polymul(N, D)),
                        -c * c * P.polymul([1, -2 * cb, 1], P.polymul(D, D)))
    poses = []
    for v in P.polyroots(quartic):
        if abs(v.imag) > 1e-8 or v.real <= 0:
            continue
        v = v.real
        u = P.polyval(v, N) / P.polyval(v, D)
        if u <= 0:
            continue
        s1 = b / np.sqrt(1 + v * v - 2 * v * cb)            # distance of point 1 from the centre
        Xc = np.array([s1, u * s1, v * s1])[:, None] * f    # the three points in the camera frame
        poses.append(absolute_orientation(Xw, Xc))
    return poses, quartic

def bearings(K, uv):
    """Pixels -> unit ray directions in the camera frame."""
    r = np.c_[uv, np.ones(len(uv))] @ np.linalg.inv(K).T
    return r / np.linalg.norm(r, axis=1, keepdims=True)

R0, t0 = cams_true[3]
sel = [17, 87, 8]                                           # two ground points, one on the tall box
uv3, _ = project(K, R0, t0, X_true[sel])
poses, quartic = p3p(X_true[sel], bearings(K, uv3))
print("quartic coefficients (v^0..v^4):", quartic.round(3))
uv4 = project(K, R0, t0, X_true[[60]])[0]                  # a fourth point decides
for R, t in poses:
    e4 = np.linalg.norm(project(K, R, t, X_true[[60]])[0] - uv4)
    print("centre", (-R.T @ t).round(3), " |R - R_true| = %.1e" % np.linalg.norm(R - R0),
          " 4th point off by %.1f px" % e4)
print("true centre", (-R0.T @ t0).round(3))
```

```text
quartic coefficients (v^0..v^4): [ -27.431  123.357 -194.301  128.036  -30.045]
centre [-2.331 -0.82  -3.445]  |R - R_true| = 8.2e-01  4th point off by 88.1 px
centre [-0.745 -2.    -4.944]  |R - R_true| = 1.2e-13  4th point off by 0.0 px
centre [ 1.851  2.126 -2.851]  |R - R_true| = 1.9e+00  4th point off by 208.5 px
centre [ 1.179 -2.008 -0.678]  |R - R_true| = 1.8e+00  4th point off by 199.7 px
true centre [-0.745 -2.    -4.944]
```

This triple has **four** real solutions. One is the true camera to machine precision. The others are genuine, exact solutions of the three-point problem: each places a camera that sees the three points at exactly the observed pixels. One of them even sits below the ground plane ($y = +2.1$, under the floor, looking up). A fourth point removes the ambiguity at once: projected with the wrong poses it misses its pixel by 88 to 209 px. Inside RANSAC we do not even need a separate check, because the wrong poses get few inliers.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-p3p.svg" caption="P3P on three points seen by camera 4 (two on the ground, one on the tall box). Left: the four camera centres $\mathbf C^{(1)}$ to $\mathbf C^{(4)}$ that see $\mathbf X\_1,\mathbf X\_2,\mathbf X\_3$ under exactly the observed angles; $\mathbf C^{(2)}$ is the true camera, $\mathbf C^{(3)}$ lies under the floor. Right: the quartic $q(v)$ of the snippet, with its four positive real roots $v=0.522$, $0.846$, $1.285$, $1.608$, one per candidate. The number of real roots changes only where two roots merge. When one of the merging solutions is the true pose, the camera lies on the 'danger cylinder' (through the three points, with its axis perpendicular to their plane), where P3P is also ill-conditioned; Gao et al. (2003) classify all cases." %}

Modern P3P solvers, such as Kneip et al. (2011) and Lambda Twist (Persson and Nordberg, 2018), compute the same solutions more stably and faster. Lambda Twist avoids the quartic altogether. They differ in numerics, not in what they compute.

### 2.4 Many points: EPnP

With $n \gg 3$ points we want one pose that uses all of them, in $O(n)$ time. **EPnP** (Lepetit, Moreno-Noguer and Fua, 2009) does it with a neat change of unknowns. Choose four **control points** $\mathbf c\_1, \dots, \mathbf c\_4$ in the world (the centroid of the points plus their three principal directions). Every world point is an affine combination of them,

$$
\mathbf X_j = \sum_{k=1}^4 \alpha_{jk}\mathbf c_k, \qquad \sum_k \alpha_{jk} = 1 ,
$$

with weights $\alpha\_{jk}$ we can compute once. A rigid motion preserves affine combinations, so the **same** weights hold in the camera frame: $\mathbf X\_j^c = \sum\_k \alpha\_{jk}\mathbf c\_k^c$. The unknowns are now the 12 coordinates of the four control points in the camera frame. The projection condition $x\_j = X\_j^c / Z\_j^c$ becomes $X\_j^c - x\_j Z\_j^c = 0$, linear in them:

$$
\sum_{k=1}^4 \alpha_{jk}\,(c_{k,x}^c - x_j\,c_{k,z}^c) = 0, \qquad \sum_{k=1}^4 \alpha_{jk}\,(c_{k,y}^c - y_j\,c_{k,z}^c) = 0 .
$$

Stacking all points gives $M\mathbf v = \mathbf 0$ with a $2n \times 12$ matrix $M$. The solution is a null vector of $M$, known up to scale. The scale follows from the requirement that the control points keep their mutual distances. The paper also handles noisy cases where the null space is effectively 2 to 4 dimensional; the snippet implements the simplest case, a single null vector. Absolute orientation then gives $(R, \mathbf t)$.

```python
def epnp(Xw, uv, K):
    """EPnP with the single-null-vector solution (the paper's N = 1 case)."""
    cw = Xw.mean(0)                                          # control points: centroid ...
    U, S, Vt = np.linalg.svd(Xw - cw, full_matrices=False)
    C = np.vstack([cw, cw + (S[:, None] / np.sqrt(len(Xw))) * Vt])   # ... plus principal axes
    alpha = np.linalg.solve(np.vstack([C.T, np.ones(4)]), np.vstack([Xw.T, np.ones(len(Xw))])).T
    xn = (uv - K[:2, 2]) / np.diag(K)[:2]                    # normalized image coordinates
    M = np.zeros((2 * len(Xw), 12))
    for k in range(4):                                       # x c_z - c_x = 0, y c_z - c_y = 0, summed
        M[0::2, 3 * k] = alpha[:, k]; M[0::2, 3 * k + 2] = -alpha[:, k] * xn[:, 0]
        M[1::2, 3 * k + 1] = alpha[:, k]; M[1::2, 3 * k + 2] = -alpha[:, k] * xn[:, 1]
    v = np.linalg.svd(M)[2][-1].reshape(4, 3)                # camera-frame control points, up to scale
    dc = [np.linalg.norm(v[i] - v[j]) for i in range(4) for j in range(i)]
    dw = [np.linalg.norm(C[i] - C[j]) for i in range(4) for j in range(i)]
    Xc = alpha @ (v * (np.dot(dc, dw) / np.dot(dc, dc)))     # scale from the control-point distances
    if np.mean(Xc[:, 2]) < 0:
        Xc = -Xc                                              # points must be in front of the camera
    return absolute_orientation(Xw, Xc)

def dlt_pnp(Xw, uv, K):
    """Linear DLT for P = K[R|t] (post 02's DLT, one dimension up), then project onto SO(3)."""
    xn = (uv - K[:2, 2]) / np.diag(K)[:2]
    A = []
    for (X, Y, Z), (x, y) in zip(Xw, xn):
        A.append([X, Y, Z, 1, 0, 0, 0, 0, -x * X, -x * Y, -x * Z, -x])
        A.append([0, 0, 0, 0, X, Y, Z, 1, -y * X, -y * Y, -y * Z, -y])
    Pn = np.linalg.svd(np.array(A))[2][-1].reshape(3, 4)     # normalized [R|t] up to scale
    U, S, Vt = np.linalg.svd(Pn[:, :3])
    s = np.sign(np.linalg.det(U @ Vt))
    return s * U @ Vt, s * Pn[:, 3] / S.mean()

def pose_error(R, t, R0, t0):
    """Rotation error (deg) and camera-centre error."""
    ang = np.degrees(np.arccos(np.clip((np.trace(R @ R0.T) - 1) / 2, -1, 1)))
    return ang, np.linalg.norm(R.T @ t - R0.T @ t0)

rng_pnp = np.random.default_rng(0)
R0, t0 = cams_true[5]
uv_clean, _ = project(K, R0, t0, X_true)
for s_px in (0.5, 2.0):
    uvn = uv_clean + rng_pnp.normal(0, s_px, uv_clean.shape)
    for name, solver in (("DLT ", dlt_pnp), ("EPnP", epnp)):
        e = pose_error(*solver(X_true, uvn, K), R0, t0)
        print(f"sigma {s_px} px, {name}: rotation {e[0]:.3f} deg, centre {e[1]:.4f}")
```

```text
sigma 0.5 px, DLT : rotation 0.063 deg, centre 0.0089
sigma 0.5 px, EPnP: rotation 0.041 deg, centre 0.0061
sigma 2.0 px, DLT : rotation 0.552 deg, centre 0.0673
sigma 2.0 px, EPnP: rotation 0.585 deg, centre 0.0682
```

Both linear methods are good to a small fraction of a degree here. That is because 120 points are a lot. The left half of the figure in section 2.5 shows what happens with fewer points.

### 2.5 Refinement and RANSAC

Neither linear method minimizes the error we care about, the reprojection error in pixels. So every serious pipeline ends with a few Gauss-Newton iterations on

$$
\min_{R,\mathbf t} \sum_j \big\lVert \pi(R\mathbf X_j + \mathbf t) - \mathbf x_j\big\rVert^2 ,
$$

with the points held fixed. This is called **motion-only bundle adjustment**. It needs the derivative of a pixel with respect to the pose, which we derive properly in section 3.3; the function `project_jac` below already computes it. With outliers, P3P runs inside RANSAC (post 03, with $s = 3$): sample three matches, compute up to four poses, count the inliers of each, keep the best, then refit on all inliers.

```python
def project_jac(K, R, t, X):
    """Pixels of X (N x 3) and their Jacobians w.r.t. the pose update (N x 2 x 6) and X (N x 2 x 3).
    Pose update: R <- exp([dw]x) R, t <- exp([dw]x) t + dt, i.e. Xc <- Xc + dw x Xc + dt."""
    Xc = X @ R.T + t
    x, y, z = Xc.T
    fx, fy = K[0, 0], K[1, 1]
    dpi = np.zeros((len(X), 2, 3))                           # d pixel / d Xc
    dpi[:, 0, 0] = fx / z; dpi[:, 0, 2] = -fx * x / z**2
    dpi[:, 1, 1] = fy / z; dpi[:, 1, 2] = -fy * y / z**2
    dXc_dw = -np.array([skew(p) for p in Xc])                # d (dw x Xc) / d dw = -[Xc]x
    J_pose = np.concatenate([dpi @ dXc_dw, dpi], axis=2)
    J_point = dpi @ R
    uv = (Xc[:, :2] / Xc[:, 2:]) @ K[:2, :2].T + K[:2, 2]
    return uv, J_pose, J_point

def refine_pose(R, t, Xw, uv, K, iters=10):
    """Gauss-Newton on the reprojection error of one camera (points fixed): motion-only BA."""
    for _ in range(iters):
        pred, Jp, _ = project_jac(K, R, t, Xw)
        r = (pred - uv).ravel()
        J = Jp.reshape(-1, 6)
        d = np.linalg.solve(J.T @ J, -J.T @ r)
        dR = rodrigues(d[:3])
        R, t = dR @ R, dR @ t + d[3:]
    return R, t

def ransac_pnp(Xw, uv, K, thresh=2.0, p=0.99, max_iters=1000, rng=np.random.default_rng(1)):
    f = bearings(K, uv)
    best, best_inl, N, k = None, np.zeros(len(uv), bool), max_iters, 0
    while k < N:
        k += 1
        sample = rng.choice(len(uv), 3, replace=False)
        for R, t in p3p(Xw[sample], f[sample])[0]:          # up to 4 hypotheses per sample
            pred, depth = project(K, R, t, Xw)
            inl = (np.linalg.norm(pred - uv, axis=1) < thresh) & (depth > 0)
            if inl.sum() > best_inl.sum():
                best, best_inl = (R, t), inl
                w = inl.mean()                                # adaptive stopping (post 03)
                N = min(max_iters, int(np.ceil(np.log(1 - p) / np.log(1 - w**3))))
    R, t = best
    for _ in range(2):                                       # refit on all inliers, re-score
        R, t = refine_pose(R, t, Xw[best_inl], uv[best_inl], K)
        pred, depth = project(K, R, t, Xw)
        best_inl = (np.linalg.norm(pred - uv, axis=1) < thresh) & (depth > 0)
    return (R, t), best_inl, k

uvn = uv_clean + rng_pnp.normal(0, 1.0, uv_clean.shape)
bad = rng_pnp.random(len(uvn)) < 0.4                         # 40% gross outliers
uvn[bad] = rng_pnp.uniform([0, 0], [W, H], (bad.sum(), 2))
(R, t), inl, k = ransac_pnp(X_true, uvn, K)
e = pose_error(R, t, R0, t0)
print(f"RANSAC: {k} samples, {inl.sum()} inliers (true {(~bad).sum()}), "
      f"wrongly accepted {np.sum(inl & bad)}, rotation {e[0]:.3f} deg, centre {e[1]:.4f}")
e = pose_error(*epnp(X_true, uvn, K), R0, t0)
print(f"EPnP on all points: rotation {e[0]:.1f} deg, centre {e[1]:.2f}")
```

```text
RANSAC: 116 samples, 62 inliers (true 67), wrongly accepted 0, rotation 0.223 deg, centre 0.0127
EPnP on all points: rotation 40.4 deg, centre 3.38
```

With 40% of the matches replaced by random pixels, EPnP on all points is useless: 40° and 3.4 m off. P3P-RANSAC needs 116 samples and finds 62 inliers. With $\sigma = 1$ px, a 2 px threshold keeps a fraction $1 - e^{-2} = 86\%$ of the true inliers, about 58 of the 67; the 62 found is at least that many, so RANSAC has missed no inliers. It accepts no outlier, and the refined pose is off by $0.22°$.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-pnp.svg" caption="Left: median rotation error over 200 trials against the pixel noise $\sigma$, for camera 6 of the scene, with all $n=120$ points (solid) and with 12 random points (dashed). EPnP is slightly better than the DLT; a Gauss-Newton refinement of the reprojection error (EPnP+GN) is 2.2 to 3.5 times more accurate than EPnP in every setting (with 120 points at $\sigma=1$ px: 0.28°, 0.22° and 0.09°). Right: RANSAC samples needed for 99% confidence, $N=\log 0.01/\log(1-(1-\varepsilon)^s)$, for $s=3$ (P3P), 4 and 6 (DLT). The circles are the mean number of samples our `ransac_pnp` actually drew (20 runs each): 28, 54, 230 and 629 at $\varepsilon=0.2$, 0.4, 0.6 and 0.7. They lie above the $s=3$ curve because the adaptive stopping rule uses the inlier ratio of the best model so far, which is lower than the true one (noise pushes some inliers past the threshold)." %}

In practice you call a library: OpenCV's `solvePnP` and `solvePnPRansac` offer P3P, EPnP, SQPnP and others, followed by `solvePnPRefineLM`. If the focal length is unknown too, there are minimal solvers with unknown focal length; for camera rigs there are generalized versions that work with rays from several centres.

## 3. Bundle adjustment

### 3.1 The cost

Bundle adjustment estimates all cameras and all points together by minimizing the reprojection error:

$$
E(\{R_i, \mathbf t_i\}, \{\mathbf X_j\}) = \sum_{(i,j)\in\mathcal O} \rho\Big(\big\lVert \mathbf r_{ij} \big\rVert^2\Big), \qquad \mathbf r_{ij} = \pi(R_i\mathbf X_j + \mathbf t_i) - \mathbf x_{ij}.
$$

With $\rho(s) = s$ and independent Gaussian pixel noise this is maximum likelihood, by the same argument as in post 02, section 4.1. A **robust kernel** $\rho$ that grows more slowly than $s$ limits the influence of wrong matches (section 3.8). The name comes from photogrammetry: each camera emits a **bundle** of rays, and we adjust the bundles until every ray passes through its point.

Calibration in post 02 was a bundle adjustment with the points known (the board) and the intrinsics unknown. PnP refinement is a bundle adjustment with one camera and fixed points. Here both cameras and points are free, and that is what creates the size, the structure and the gauge.

### 3.2 Parameterization

**Points** are plain 3-vectors. Points very far away (on the horizon) make $\mathbf X$ huge and badly conditioned; then an inverse-depth or homogeneous parameterization is better, which SLAM systems use. We ignore that here.

**Rotations** need care: $R$ has 9 entries but 3 degrees of freedom. Post 02 stored an axis-angle vector per camera. Here we use the approach of modern solvers: keep $R$ as a matrix and parameterize only the **update**, a small rotation $\delta\boldsymbol\omega \in \mathbb R^3$ applied on the left,

$$
R \leftarrow \exp([\delta\boldsymbol\omega]_\times)\,R, \qquad \mathbf t \leftarrow \exp([\delta\boldsymbol\omega]_\times)\,\mathbf t + \delta\mathbf t ,
$$

where $\exp([\delta\boldsymbol\omega]\_\times)$ is Rodrigues' formula and $[\cdot]\_\times$ the cross-product matrix. This update rotates and then translates the camera's whole coordinate frame, a left perturbation on $SE(3)$ (see [embodied AI post 1]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }}) for Lie groups). It has no singularities, because $\delta\boldsymbol\omega$ is always small. Each camera thus contributes 6 numbers $\delta\mathbf c\_i = (\delta\boldsymbol\omega\_i, \delta\mathbf t\_i)$ per iteration.

### 3.3 The Jacobian of one observation

Gauss-Newton needs, for each observation, the derivative of the 2D residual with respect to the 6 camera parameters and the 3 point coordinates. The chain rule splits it into two pieces.

**Pixel with respect to camera coordinates.** With $\mathbf X\_c = (X, Y, Z)$ and $\pi = (f\_x X/Z + c\_x, f\_y Y/Z + c\_y)$:

$$
\frac{\partial \pi}{\partial \mathbf X_c} = \begin{pmatrix} f_x/Z & 0 & -f_x X/Z^2 \\ 0 & f_y/Z & -f_y Y/Z^2 \end{pmatrix}.
$$

The third column says that moving a point away from the camera pulls its pixel towards the principal point.

**Camera coordinates with respect to the update.** To first order, $\exp([\delta\boldsymbol\omega]\_\times) \approx I + [\delta\boldsymbol\omega]\_\times$, so the update moves the camera coordinates of a point to

$$
\mathbf X_c \;\leftarrow\; (I + [\delta\boldsymbol\omega]_\times)(R\mathbf X + \mathbf t) + \delta\mathbf t = \mathbf X_c + \delta\boldsymbol\omega \times \mathbf X_c + \delta\mathbf t = \mathbf X_c - [\mathbf X_c]_\times\,\delta\boldsymbol\omega + \delta\mathbf t ,
$$

using $\mathbf a \times \mathbf b = -\mathbf b \times \mathbf a$. Hence $\partial\mathbf X\_c/\partial\delta\boldsymbol\omega = -[\mathbf X\_c]\_\times$ and $\partial\mathbf X\_c/\partial\delta\mathbf t = I$. With respect to the point, $\partial\mathbf X\_c/\partial\mathbf X = R$. Altogether,

$$
J_{c,ij} = \frac{\partial \pi}{\partial \mathbf X_c}\begin{pmatrix} -[\mathbf X_c]_\times & I \end{pmatrix} \in \mathbb R^{2\times 6},
\qquad
J_{p,ij} = \frac{\partial \pi}{\partial \mathbf X_c}\, R_i \in \mathbb R^{2\times 3}.
$$

These are exactly the two outputs of `project_jac` in section 2.5. Before building anything on them, compare them with finite differences. This habit catches most bugs in hand-written Jacobians.

```python
R0, t0 = cams_true[3]
Xs = X_true[:5]
_, Jp, Jx = project_jac(K, R0, t0, Xs)
eps = 1e-6
num_pose = np.zeros((5, 2, 6)); num_pt = np.zeros((5, 2, 3))
for k in range(6):
    d = np.zeros(6); d[k] = eps
    dR = rodrigues(d[:3])
    num_pose[:, :, k] = (project(K, dR @ R0, dR @ t0 + d[3:], Xs)[0] - project(K, R0, t0, Xs)[0]) / eps
for k in range(3):
    d = np.zeros(3); d[k] = eps
    num_pt[:, :, k] = (project(K, R0, t0, Xs + d)[0] - project(K, R0, t0, Xs)[0]) / eps
print("max |analytic - numeric|: pose %.1e, point %.1e (largest entry %.0f)"
      % (np.abs(Jp - num_pose).max(), np.abs(Jx - num_pt).max(), np.abs(Jp).max()))
```

```text
max |analytic - numeric|: pose 1.7e-04, point 1.1e-05 (largest entry 548)
```

The agreement is at the level of the finite-difference error (entries up to 548, differences below $2\times10^{-4}$), so the formulas are right. Libraries such as Ceres also offer automatic differentiation; analytic Jacobians like these are still common in performance-critical code.

### 3.4 The normal equations and their structure

Stack all camera updates into $\delta\mathbf c \in \mathbb R^{6m}$ and all point updates into $\delta\mathbf p \in \mathbb R^{3n}$. Residual $\mathbf r\_{ij}$ depends on only one camera and one point, so its row block in the full Jacobian $J$ has exactly two nonzero blocks, $J\_{c,ij}$ and $J\_{p,ij}$. The Gauss-Newton normal equations $J^\top J\,\boldsymbol\delta = -J^\top\mathbf r$ (post 02) therefore have the block form

$$
\begin{pmatrix} B & E \\ E^\top & C \end{pmatrix}
\begin{pmatrix} \delta\mathbf c \\ \delta\mathbf p \end{pmatrix}
= -\begin{pmatrix} \mathbf g_c \\ \mathbf g_p \end{pmatrix},
$$

with

$$
B_i = \sum_{j:(i,j)\in\mathcal O} J_{c,ij}^\top J_{c,ij}, \quad
C_j = \sum_{i:(i,j)\in\mathcal O} J_{p,ij}^\top J_{p,ij}, \quad
E_{ij} = J_{c,ij}^\top J_{p,ij}, \quad
\mathbf g_{c,i} = \sum_j J_{c,ij}^\top \mathbf r_{ij}, \quad
\mathbf g_{p,j} = \sum_i J_{p,ij}^\top \mathbf r_{ij}.
$$

$B$ is block-diagonal with $6\times6$ blocks and $C$ is block-diagonal with $3\times3$ blocks, one per point, because no residual involves two cameras or two points. Only $E$ couples cameras with points, and its block $E\_{ij}$ is nonzero only if camera $i$ sees point $j$.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-sparsity.svg" caption="The structure of bundle adjustment on the corridor scene of section 4 (30 cameras, every fourth point: 208 points, 2260 observations), with the true values. Left: the Jacobian $J$ ($4520\times804$, 0.93% nonzero); each row pair has one $2\times6$ camera block left of the red line and one $2\times3$ point block right of it. Middle: $H=J^\top J$ ($804\times804$, 12.3% nonzero) with its blocks: $B$ (block-diagonal, cameras), $C$ (block-diagonal, points) and the coupling $E$, whose band shows which camera sees which point (points are sorted by $x$, cameras walk along $x$). Right: the reduced camera system $S=B-EC^{-1}E^\top$ ($180\times180$), drawn as its $30\times30$ grid of $6\times6$ blocks, shaded by the number of points the two cameras share. Block $(i,k)$ is nonzero only if cameras $i$ and $k$ see a common point: 832 of the 900 blocks here, since distant points are visible over long stretches." %}

### 3.5 The Schur complement

The point block $C$ is the large part of the system ($3n$ unknowns, often millions) but trivially invertible: it is $n$ independent $3\times3$ matrices. The **Schur complement** exploits this. Write the system as two block rows:

$$
B\,\delta\mathbf c + E\,\delta\mathbf p = -\mathbf g_c, \qquad E^\top\delta\mathbf c + C\,\delta\mathbf p = -\mathbf g_p .
$$

Solve the second for the points, $\delta\mathbf p = C^{-1}(-\mathbf g\_p - E^\top\delta\mathbf c)$, and substitute into the first:

$$
\underbrace{\big(B - E\,C^{-1}E^\top\big)}_{S}\;\delta\mathbf c = -\mathbf g_c + E\,C^{-1}\mathbf g_p .
$$

This **reduced camera system** has only $6m$ unknowns. Once it is solved, each point is updated independently by **back-substitution**, $\delta\mathbf X\_j = C\_j^{-1}\big(-\mathbf g\_{p,j} - \sum\_i E\_{ij}^\top\delta\mathbf c\_i\big)$. Nothing is approximated: the result is exactly the Gauss-Newton step of the full system. The cost changes dramatically. A typical internet-photo reconstruction with $m = 1000$ cameras and $n = 200\,000$ points has $606\,000$ unknowns; a dense solve would be hopeless, while the Schur complement leaves a $6000\times6000$ system plus 200 000 inversions of $3\times3$ matrices. Photogrammetrists used this reduction from the early days of bundle adjustment, and it is the core of every BA solver since (Triggs et al. 2000, Lourakis and Argyros 2009).

**Levenberg-Marquardt** (post 02, section 4.2) makes this Gauss-Newton step safe. It solves $\big(J^\top J + \lambda\,\mathrm{diag}(J^\top J)\big)\boldsymbol\delta = -J^\top\mathbf r$; if the cost drops, it accepts the step and lowers $\lambda$ (we divide by 3), otherwise it rejects the step and raises $\lambda$ (we multiply by 4). A small $\lambda$ gives the fast Gauss-Newton step near the minimum, a large one gives short steps along the scaled gradient far from it. In BA the damping is added to the diagonals of $B$ and $C$ before the elimination, so it does not change the structure. One more detail: we hold camera 1 fixed by removing its 6 unknowns from $S$. That fixes 6 of the 7 gauge freedoms; section 3.7 explains why the seventh, scale, does no harm. Here is the whole bundle adjuster:

```python
def robust_weight(s, kernel, delta):
    """rho(s) and w = rho'(s) for squared residual norms s (Ceres-style kernels)."""
    if kernel == "l2":
        return s, np.ones_like(s)
    if kernel == "huber":
        r = np.sqrt(s)
        return (np.where(r <= delta, s, 2 * delta * r - delta**2),
                np.where(r <= delta, 1.0, delta / np.maximum(r, 1e-12)))
    if kernel == "cauchy":
        return delta**2 * np.log1p(s / delta**2), 1.0 / (1.0 + s / delta**2)

def residuals(cams, X, obs_set):
    ci, pj, uv = obs_set
    r = np.zeros_like(uv)
    for i, (R, t) in enumerate(cams):
        sel = ci == i
        r[sel] = project(K, R, t, X[pj[sel]])[0] - uv[sel]
    return r

def ba_cost(cams, X, obs_set, kernel="l2", delta=1.0):
    r = residuals(cams, X, obs_set)
    return robust_weight((r * r).sum(1), kernel, delta)[0].sum()

def ba_step(cams, X, obs_set, lam, fixed, kernel="l2", delta=1.0):
    """One damped Gauss-Newton step: build the normal equations block by block,
    eliminate the points with the Schur complement, solve for the cameras, back-substitute."""
    ci, pj, uv = obs_set
    m, n = len(cams), len(X)
    Jc = np.zeros((len(ci), 2, 6)); Jx = np.zeros((len(ci), 2, 3)); r = np.zeros((len(ci), 2))
    for i, (R, t) in enumerate(cams):
        sel = ci == i
        pred, Jc[sel], Jx[sel] = project_jac(K, R, t, X[pj[sel]])
        r[sel] = pred - uv[sel]
    w = robust_weight((r * r).sum(1), kernel, delta)[1]      # IRLS weight of each observation
    B = np.zeros((m, 6, 6)); gc = np.zeros((m, 6))          # camera blocks  B_i = sum J_c^T J_c
    C = np.zeros((n, 3, 3)); gp = np.zeros((n, 3))          # point blocks   C_j = sum J_x^T J_x
    np.add.at(B, ci, np.einsum("k,kai,kaj->kij", w, Jc, Jc))
    np.add.at(gc, ci, np.einsum("k,kai,ka->ki", w, Jc, r))
    np.add.at(C, pj, np.einsum("k,kai,kaj->kij", w, Jx, Jx))
    np.add.at(gp, pj, np.einsum("k,kai,ka->ki", w, Jx, r))
    E = np.zeros((m, 6, n, 3))                               # coupling blocks E_ij = J_c^T J_x
    E[ci, :, pj, :] = np.einsum("k,kai,kaj->kij", w, Jc, Jx) # (stored densely here for clarity)
    B += lam * np.einsum("kii->ki", B)[:, :, None] * np.eye(6)   # Marquardt damping
    C += lam * np.einsum("kii->ki", C)[:, :, None] * np.eye(3)
    Cinv = np.linalg.inv(C)                                  # n independent 3 x 3 inverses
    E = E.reshape(6 * m, 3 * n)
    ECinv = np.einsum("ajk,jkl->ajl", E.reshape(6 * m, n, 3), Cinv).reshape(6 * m, 3 * n)
    S = -ECinv @ E.T                                         # S = B - E C^-1 E^T
    for i in range(m):
        S[6 * i:6 * i + 6, 6 * i:6 * i + 6] += B[i]
    b = -gc.ravel() + ECinv @ gp.ravel()                     # b = -g_c + E C^-1 g_p
    free = np.ones(6 * m, bool)
    for i in fixed:
        free[6 * i:6 * i + 6] = False                       # hold these cameras still
    dc = np.zeros(6 * m)
    dc[free] = np.linalg.solve(S[np.ix_(free, free)], b[free])
    dX = -gp - (E.T @ dc).reshape(n, 3)                      # back-substitution, point by point:
    dX = np.einsum("kij,kj->ki", Cinv, dX)                   # dX_j = C_j^-1 (-g_pj - sum_i E_ij^T dc_i)
    new_cams = []
    for (R, t), d in zip(cams, dc.reshape(m, 6)):
        dR = rodrigues(d[:3])
        new_cams.append((dR @ R, dR @ t + d[3:]))
    return new_cams, X + dX, S

def bundle_adjust(cams, X, obs_set, fixed=(0,), iters=50, lam=1e-3, kernel="l2", delta=1.0):
    """Levenberg-Marquardt on the (robust) reprojection error, as in post 02."""
    cost = ba_cost(cams, X, obs_set, kernel, delta)
    log = [(cost, lam)]
    for it in range(iters):
        while True:
            new_cams, new_X, S = ba_step(cams, X, obs_set, lam, fixed, kernel, delta)
            new_cost = ba_cost(new_cams, new_X, obs_set, kernel, delta)
            if new_cost < cost:
                break
            lam *= 4                                         # reject: damp harder
            if lam > 1e10:
                return cams, X, log
        done = cost - new_cost < 1e-10 * cost
        cams, X, cost, lam = new_cams, new_X, new_cost, lam / 3
        log.append((cost, lam))
        if done:
            break
    return cams, X, log

obs_all = (cam_idx, pt_idx, uv_obs)
rng_init = np.random.default_rng(3)                           # a perturbed start:
cams0 = [cams_true[0]]                                       # rotations off by ~2 deg,
for R, t in cams_true[1:]:                                   # centres and points by ~0.15
    dR = rodrigues(rng_init.normal(0, np.deg2rad(2.0), 3))
    Cc = -R.T @ t + rng_init.normal(0, 0.15, 3)
    cams0.append((dR @ R, -(dR @ R) @ Cc))
X0 = X_true + rng_init.normal(0, 0.15, X_true.shape)

cams_ba, X_ba, log = bundle_adjust(cams0, X0, obs_all)
S = ba_step(cams_ba, X_ba, obs_all, 0.0, (0,))[2]
print("normal equations %d x %d, Schur complement %d x %d" % (6 * m + 3 * n, 6 * m + 3 * n, *S.shape))
for it in (0, 1, 2, 3, len(log) - 1):
    print("iteration %2d: rms %.4f px  lambda %.1e" % (it, np.sqrt(log[it][0] / L), log[it][1]))
dof = 2 * L - (6 * m + 3 * n - 7)
print("expected rms at the optimum: sigma * sqrt(dof / L) = %.4f px" % (sigma * np.sqrt(dof / L)))
print("rms with the true cameras and points: %.4f px" % np.sqrt(ba_cost(cams_true, X_true, obs_all) / L))
```

```text
normal equations 408 x 408, Schur complement 48 x 48
iteration  0: rms 46.8114 px  lambda 1.0e-03
iteration  1: rms 2.3807 px  lambda 3.3e-04
iteration  2: rms 0.6302 px  lambda 1.1e-04
iteration  3: rms 0.6283 px  lambda 3.7e-05
iteration  6: rms 0.6283 px  lambda 1.4e-06
expected rms at the optimum: sigma * sqrt(dof / L) = 0.6289 px
rms with the true cameras and points: 0.7070 px
```

(The coupling blocks are stored densely for readability; with $\vert\mathcal O\vert \ll mn$ a real solver stores only the nonzero $E\_{ij}$.) We start from the true scene with every camera rotated by a random 2° per axis (2.0° to 6.6° in total) and every centre and every point moved by 15 cm per coordinate (26 cm RMS in 3D), an RMS reprojection error of 47 px. Two iterations bring it to 0.63 px, and after six the cost no longer changes.

Is 0.6283 px the right answer? At the optimum of a least-squares problem, the residuals have lost the degrees of freedom the model used to fit the noise: $\mathbb E\,\lVert\mathbf r\rVert^2 = \sigma^2(2L - p)$ with $p = 6m + 3n - 7 = 401$ effective parameters. Our RMS is the per-observation length, $\sqrt{\lVert\mathbf r\rVert^2/L}$, so the expected value is $\sigma\sqrt{(2L - p)/L} = 0.6289$ px, against 0.6283 px measured. The true scene, with no degrees of freedom fitted, gives $\sigma\sqrt2 = 0.707$ px; the optimum is *below* the truth, which is the signature of a correctly converged estimator, not of overfitting gone wrong.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-ba.svg" caption="Bundle adjustment of the running example. Left: RMS reprojection error per LM iteration $k$ (purple, left axis): 46.81, 2.38, 0.63 px, then flat at the expected 0.629 px (dotted). The damping $\lambda$ (orange, right axis) falls by 3 each time, because every step was accepted. Middle and right: top view ($x$ against $z$) of the estimate (purple) over the truth (gray) after aligning the two with a similarity transform; red lines join each estimated point to its true position. At $k=0$ the RMS 3D errors are 0.26 for the camera centres and 0.25 for the points; after BA they are 0.0047 and 0.0043, about 4 to 5 mm in a scene about 9 m across." %}

### 3.6 How accurate is the result?

To compare a reconstruction with the truth we must first remove the gauge: find the similarity transform (rotation, translation, scale) that best maps the estimate onto the truth and measure what is left. The closed-form solution is Umeyama's (1991), the absolute orientation of section 2.3 plus a scale.

```python
def umeyama(A, B):
    """Similarity (s, R, t) minimizing sum |s R A_k + t - B_k|^2 (Umeyama 1991)."""
    a, b = A.mean(0), B.mean(0)
    U, D, Vt = np.linalg.svd((B - b).T @ (A - a) / len(A))
    S = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])
    R = U @ S @ Vt
    s = np.trace(np.diag(D) @ S) / ((A - a) ** 2).sum(1).mean()
    return s, R, b - s * R @ a

def centres(cams):
    return np.array([-R.T @ t for R, t in cams])

def errors(cams, X):
    """Camera-centre and point RMSE after aligning (cameras + points) to the truth."""
    s, Ra, ta = umeyama(np.vstack([centres(cams), X]), np.vstack([centres(cams_true), X_true]))
    ec = centres(cams) @ (s * Ra).T + ta - centres(cams_true)
    ex = X @ (s * Ra).T + ta - X_true
    return np.sqrt((ec**2).sum(1).mean()), np.sqrt((ex**2).sum(1).mean())

print("start: centre RMSE %.4f, point RMSE %.4f" % errors(cams0, X0))
print("after BA: centre RMSE %.4f, point RMSE %.4f" % errors(cams_ba, X_ba))
```

```text
start: centre RMSE 0.2641, point RMSE 0.2518
after BA: centre RMSE 0.0047, point RMSE 0.0043
```

The errors drop by a factor of 55 to 60, to about 4 to 5 mm. This also answers a frequent question: BA does not need a perfect start, but it needs one inside the basin of convergence. Section 4 shows how pipelines produce such a start.

Try it yourself in the widget below. It runs the same algorithm on a smaller scene (6 cameras, 42 points) in your browser.

{% include widget.liquid name="3d-vision-bundle-adjustment" height="760" caption="Bundle adjustment, one Levenberg-Marquardt step at a time: the post's algorithm (Jacobians of section 3.3, Schur complement with camera 1 fixed, back-substitution, Marquardt damping) on 6 cameras and 42 points. The 3D view shows the truth in gray and the estimate in blue (cameras) and purple (points), after removing the free scale; red lines are point errors. Drag to orbit. The image shows the observations of the selected camera (dots), the current predictions (purple crosses) and the residuals between them. Try a larger start error, then switch on outliers and compare the L2, Huber and Cauchy kernels. With 15% outliers L2 converges to a wrong answer with inlier residuals of several pixels, and Huber gets close to the scene. Cauchy is not convex: from the default start it can get stuck with some points left at large residuals, but with the start error lowered to ×0.3 it recovers the scene best of the three. The dashed line in the chart is the RMS expected at the optimum, $\sigma\sqrt{(2L-p)/L}$." %}

### 3.7 Gauge freedom

**Why the gauge exists.** Take any similarity transform of the world, $\mathbf X \mapsto sQ\mathbf X + \mathbf d$ (rotation $Q$, scale $s > 0$, translation $\mathbf d$), and change each camera to $R\_i' = R\_i Q^\top$, $\mathbf t\_i' = s\mathbf t\_i - R\_i Q^\top\mathbf d$. Then

$$
R_i'(sQ\mathbf X_j + \mathbf d) + \mathbf t_i' = sR_i\mathbf X_j + R_iQ^\top\mathbf d + s\mathbf t_i - R_iQ^\top\mathbf d = s\,(R_i\mathbf X_j + \mathbf t_i).
$$

Camera coordinates are multiplied by $s$, and the projection $\pi$ divides by $Z$, so $s$ cancels: every pixel is unchanged. The cost is exactly flat along a 7-dimensional family of directions.

**What the solver sees.** At the optimum, $J$ has a 7-dimensional null space and $J^\top J$ has 7 zero eigenvalues:

```python
def full_jacobian(cams, X, obs_set):
    ci, pj, _ = obs_set
    J = np.zeros((2 * len(ci), 6 * len(cams) + 3 * len(X)))
    for i, (R, t) in enumerate(cams):
        sel = np.flatnonzero(ci == i)
        _, Jc, Jx = project_jac(K, R, t, X[pj[sel]])
        for k, o in enumerate(sel):
            J[2 * o:2 * o + 2, 6 * i:6 * i + 6] = Jc[k]
            J[2 * o:2 * o + 2, 6 * len(cams) + 3 * pj[o]:6 * len(cams) + 3 * pj[o] + 3] = Jx[k]
    return J

J = full_jacobian(cams_ba, X_ba, obs_all)
ev = np.linalg.eigvalsh(J.T @ J)
print("J is %d x %d, rank %d" % (*J.shape, np.linalg.matrix_rank(J)))
print("eigenvalues of J^T J: 7 smallest all below %.0e, then %.0f, %.0f, ..., largest %.1e"
      % (np.abs(ev[:7]).max(), ev[7], ev[8], ev[-1]))
```

```text
J is 1920 x 408, rank 401
eigenvalues of J^T J: 7 smallest all below 5e-09, then 2359, 5140, ..., largest 3.4e+07
```

The rank is $408 - 7 = 401$, and the gap between the seventh and the eighth eigenvalue is more than 11 orders of magnitude. Plain Gauss-Newton would try to invert a singular matrix. There are four standard ways out:

1. **Fix parameters.** Hold one camera fixed (6 DoF) and one more number for the scale, for example the distance between two camera centres or one coordinate of the second camera. COLMAP's global BA, for example, fixes the pose of one image and one translation coordinate of a second image.
2. **Let damping handle it.** LM's damping makes the system invertible. The gradient $J^\top\mathbf r$ has no component along the flat directions (moving along them does not change any residual), so with Levenberg's $\lambda I$ the step has none either; with Marquardt's $\lambda\,\mathrm{diag}$ it can drift slightly along them, which is harmless because the cost does not change there. Our solver fixes camera 1 and leaves the scale to the damping.
3. **Minimal or inner constraints.** Add constraints that remove exactly the gauge, such as fixing the centroid and the mean distance of the points, or solve with a pseudo-inverse. Photogrammetrists call this a free-network adjustment.
4. **Priors.** GPS positions, an IMU's gravity direction or a known baseline pin down some or all of the gauge with real information.

**It matters for uncertainty.** Section 5 of post 02 read uncertainties off $\sigma^2(J^\top J)^{-1}$. In BA that matrix does not exist; covariances are only defined after a gauge is chosen, and they depend on it. "Camera 7 is uncertain by 3 cm" means something different if camera 1 is fixed or if the centroid is fixed. Report uncertainties together with their gauge, or compute gauge-invariant quantities such as distances between cameras.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-gauge.svg" caption="Left: all 408 eigenvalues of $J^\top J$ at the BA solution, sorted. The first seven (red) are below $5\times10^{-9}$, numerical zeros; the eighth is 2359. Right: the RMS reprojection error when the solution is moved by $\alpha$ along different directions. Scaling the whole scene ($s=e^{0.7\alpha}$, from 0.50 to 2.0) or rotating it about the vertical axis by up to $\pm 34°$ leaves the RMS exactly at 0.628 px: these are gauge motions. A unit step along the eigenvector $\mathbf v\_8$ of the smallest nonzero eigenvalue, the weakest real direction, raises it to 1.65 px; along $\mathbf v\_{41}$ ($\lambda=20974$) to 4.47 px." %}

### 3.8 Robust kernels

One wrong match with a residual of 50 px contributes $2500$ to the squared cost, as much as $10\,000$ good observations with $0.5$ px. Least squares bends the whole reconstruction to reduce that one term. RANSAC removes most wrong matches before BA, but some always survive: repeated textures, moving objects, wrong triangulations. **Robust kernels** replace $s = \lVert\mathbf r\rVert^2$ by a function $\rho(s)$ that grows more slowly for large residuals. With a scale $\delta$ (in pixels), the two most common are

$$
\rho_{\text{Huber}}(s) = \begin{cases} s & \sqrt s \le \delta \\ 2\delta\sqrt s - \delta^2 & \sqrt s > \delta \end{cases},
\qquad
\rho_{\text{Cauchy}}(s) = \delta^2\log\Big(1 + \frac{s}{\delta^2}\Big).
$$

Huber is quadratic near zero and linear beyond $\delta$: it is convex, so it never adds local minima, but large residuals still pull with constant force. Cauchy grows only logarithmically: an outlier at 50 px barely matters, but the cost is no longer convex and needs a decent starting point.

**How a solver uses them: IRLS.** The gradient of $\rho(\lVert\mathbf r\rVert^2)$ is $2\rho'(s)\,J^\top\mathbf r$. It is the gradient of the ordinary least-squares cost with each residual weighted by $w = \rho'(s)$. So the robust problem is solved as a sequence of **weighted** least-squares problems: compute the weights from the current residuals, take a Gauss-Newton step with $J^\top WJ$ and $J^\top W\mathbf r$, and repeat. This is **iteratively reweighted least squares** (IRLS), and the weights are what `robust_weight` returns: $w = 1$ inside the Huber threshold and $\delta/\lVert\mathbf r\rVert$ outside; $w = 1/(1 + s/\delta^2)$ for Cauchy. (Triggs et al. describe a refinement that also keeps the curvature of $\rho$; Ceres implements it.) We corrupt 5% of the observations by 10 to 60 px and run BA with each kernel from the same start:

```python
rng_out = np.random.default_rng(7)
uv_bad = uv_obs.copy()
bad_obs = rng_out.random(L) < 0.05                           # 5% of the observations are wrong:
nb = bad_obs.sum()                                           # bad matches 10-60 px away
uv_bad[bad_obs] += rng_out.uniform(10, 60, (nb, 2)) * rng_out.choice([-1, 1], (nb, 2))
obs_bad = (cam_idx, pt_idx, uv_bad)
print("outlier observations:", bad_obs.sum())
for kernel in ("l2", "huber", "cauchy"):
    c, X_, log_ = bundle_adjust(cams0, X0, obs_bad, kernel=kernel, delta=1.0)
    r = np.linalg.norm(residuals(c, X_, obs_bad), axis=1)
    print("%-6s centre RMSE %.4f, point RMSE %.4f, median inlier residual %.3f px, %d iterations"
          % (kernel, *errors(c, X_), np.median(r[~bad_obs]), len(log_) - 1))
```

```text
outlier observations: 51
l2     centre RMSE 0.0816, point RMSE 0.0717, median inlier residual 1.952 px, 6 iterations
huber  centre RMSE 0.0049, point RMSE 0.0048, median inlier residual 0.520 px, 13 iterations
cauchy centre RMSE 0.0043, point RMSE 0.0045, median inlier residual 0.489 px, 30 iterations
```

With $L\_2$, the 51 bad observations drag the camera centres 8 cm off and spread the error over all good observations (their median residual is 1.95 px instead of about 0.5). Huber and Cauchy both recover the scene to the accuracy of the outlier-free run (4.7 mm), and the good observations again fit to about half a pixel. Cauchy needs more iterations, as nonconvex kernels do. A practical choice for $\delta$ is 2 to 3 times the expected inlier noise. Ceres, which COLMAP uses, provides Huber, soft $L\_1$, Cauchy and several other losses.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-robust.svg" caption="Left: the kernels $\rho$ as a function of the residual length for $\delta=1$ px. Middle: their IRLS weights $w=\rho'$; $L\_2$ trusts every residual fully, Huber lowers the weight as $\delta/\lVert\mathbf r\rVert$, Cauchy as $1/(1+\lVert\mathbf r\rVert^2/\delta^2)$, so a 10 px outlier gets weight 0.1 or 0.01. Right: camera-centre RMSE after BA from the same start. Without outliers (gray, $L\_2$) 0.0047; with 5% outliers $L\_2$ gives 0.0816, Huber 0.0049 and Cauchy 0.0043." %}

### 3.9 Scaling up

Our solver builds $S$ densely and solves it with a dense factorization: $O(m^3)$, fine for hundreds of cameras. Real systems go further:

- **Sparse Cholesky of $S$.** $S$ is sparse whenever most camera pairs share no points (the white blocks in the sparsity figure). Sparse direct solvers (CHOLMOD, used by Ceres) factor it with fill-reducing orderings.
- **Iterative Schur.** For very large problems $S$ is never formed: conjugate gradients solve $S\delta\mathbf c = \mathbf b$ using only products with $B$, $E$ and $C^{-1}$, with a block-Jacobi preconditioner. Agarwal et al. (2010) studied these inexact Newton methods on their "Bundle Adjustment in the Large" dataset, and Wu et al. (2011) ran them on multicore CPUs and GPUs.
- **Local BA.** Incremental SfM and SLAM optimize only the recently changed cameras and their points after each step, with a ring of neighbouring cameras held fixed, and run a global BA only occasionally.
- **Intrinsics and distortion** can be added as a third block of shared parameters, exactly the arrowhead structure of post 02's calibration Jacobian.

The usual libraries are Ceres Solver (COLMAP), g2o and GTSAM (factor graphs, the language of [post 06]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})).

## 4. Incremental Structure-from-Motion

### 4.1 The pipeline

**Incremental SfM** starts from two views and adds one image at a time, running BA as it goes. Photo Tourism (Snavely et al. 2006) made it famous on internet photos, and COLMAP (Schönberger and Frahm 2016) is its most widely used modern form. The steps:

1. **Correspondence search.** Extract features in every image and match image pairs ([post 03]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})). **Geometric verification** keeps only pairs whose matches agree with a fundamental, essential or homography matrix under RANSAC (post 04). The result is the **scene graph** (or view graph): images are nodes, verified pairs are edges. Matches are chained across pairs into **tracks**, one per 3D point.
2. **Initialization.** Choose a good image pair, estimate its relative pose (post 04), triangulate, and run a two-view BA.
3. **Image registration.** Choose the next image that sees many already reconstructed points, and place it with PnP inside RANSAC plus a motion-only refinement (section 2).
4. **Triangulation.** Triangulate the tracks that the new image makes visible from at least two registered cameras with a sufficient angle.
5. **Bundle adjustment** of the affected part (local BA), and from time to time of everything (global BA).
6. **Filtering.** Remove observations with a large reprojection error and points with too small a triangulation angle, and re-triangulate. Repeat from step 3 until no image can be added.

### 4.2 A toy incremental SfM

We implement steps 2 to 5 on a new scene designed to show drift: 30 cameras walking 20 m along a corridor, each looking sideways at points 4 to 12 m away, with 1 px of noise. Each camera sees only a stretch of the scene, so information must be handed from camera to camera. The two-view tools of post 04 appear first, compactly:

```python
def essential_8pt(f1, f2):
    """Linear 8-point estimate of E (f2^T E f1 = 0) from unit bearings, projected to rank 2."""
    A = np.einsum("ni,nj->nij", f2, f1).reshape(-1, 9)
    U, _, Vt = np.linalg.svd(np.linalg.svd(A)[2][-1].reshape(3, 3))
    return U @ np.diag([1.0, 1.0, 0.0]) @ Vt

def triangulate(poses, f):
    """Multi-view DLT: poses [(R, t)], f the matching bearings (one per view)."""
    A = []
    for (R, t), b in zip(poses, f):
        P = np.c_[R, t]
        A += [b[0] * P[2] - b[2] * P[0], b[1] * P[2] - b[2] * P[1]]
    Xh = np.linalg.svd(np.array(A))[2][-1]
    return Xh[:3] / Xh[3]

def pose_from_E(E, f1, f2):
    """The four (R, t) of E; keep the one that puts most points in front of both cameras."""
    U, _, Vt = np.linalg.svd(E)
    U, Vt = U * np.sign(np.linalg.det(U)), Vt * np.sign(np.linalg.det(Vt))
    Wm = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1.0]])
    best, best_n = None, -1
    for R in (U @ Wm @ Vt, U @ Wm.T @ Vt):
        for t in (U[:, 2], -U[:, 2]):
            Xs = np.array([triangulate([(np.eye(3), np.zeros(3)), (R, t)], [a, b]) for a, b in zip(f1, f2)])
            n_front = np.sum((Xs[:, 2] > 0) & ((Xs @ R.T + t)[:, 2] > 0))   # cheirality
            if n_front > best_n:
                best, best_n = (R, t), n_front
    return best
```

Then the pipeline. The next view is the unregistered camera that sees the most reconstructed points; registration uses EPnP plus refinement (there are no outliers here, so RANSAC is skipped); new points are triangulated when their rays meet at 2° or more and reproject within 4 px; and, if requested, a BA with a Huber kernel runs after every registration:

```python
rng_c = np.random.default_rng(11)
Xw_c = np.c_[rng_c.uniform(-4, 26, 900), rng_c.uniform(-1.5, 1.5, 900), rng_c.uniform(4, 12, 900)]
cams_c = []                                                  # 30 cameras walking along x,
for k in range(30):                                         # looking at points 4-12 m away
    R = rodrigues([0, np.deg2rad(rng_c.normal(0, 4)), 0])
    cams_c.append((R, -R @ np.array([0.7 * k, 0, 0])))
obs_c = {}                                                   # (i, j) -> observed pixel
for i, (R, t) in enumerate(cams_c):
    uv, depth = project(K, R, t, Xw_c)
    for j in np.flatnonzero((depth > 0) & (uv[:, 0] >= 0) & (uv[:, 0] < W) & (uv[:, 1] >= 0) & (uv[:, 1] < H)):
        obs_c[i, j] = uv[j] + rng_c.normal(0, 1.0, 2)
print("corridor: %d cameras, %d points, %d observations" % (len(cams_c), len(Xw_c), len(obs_c)))

def obs_arrays(reg, pts):
    """Observations among registered cameras and triangulated points, re-indexed for BA."""
    ci = {c: k for k, c in enumerate(reg)}; pj = {p: k for k, p in enumerate(pts)}
    keys = [(i, j) for (i, j) in obs_c if i in ci and j in pj]
    return (np.array([ci[i] for i, _ in keys]), np.array([pj[j] for _, j in keys]),
            np.array([obs_c[k] for k in keys]))

def incremental_sfm(init=(0, 4), use_ba=True, min_angle=2.0):
    i0, i1 = init
    common = [j for j in range(len(Xw_c)) if (i0, j) in obs_c and (i1, j) in obs_c]
    f0 = bearings(K, np.array([obs_c[i0, j] for j in common]))
    f1 = bearings(K, np.array([obs_c[i1, j] for j in common]))
    poses = {i0: (np.eye(3), np.zeros(3)), i1: pose_from_E(essential_8pt(f0, f1), f0, f1)}
    points, order = {}, [i0, i1]

    def add_points():
        for j in range(len(Xw_c)):
            if j in points:
                continue
            seen = [i for i in poses if (i, j) in obs_c]
            if len(seen) < 2:
                continue
            f = [bearings(K, obs_c[i, j][None])[0] for i in seen]
            X = triangulate([poses[i] for i in seen], f)
            rays = [poses[i][0].T @ fi for i, fi in zip(seen, f)]           # world-frame rays
            angle = max(np.degrees(np.arccos(np.clip(a @ b, -1, 1))) for a in rays for b in rays)
            ok = angle >= min_angle
            for i in seen:
                uv, d = project(K, *poses[i], X[None])
                ok &= d[0] > 0 and np.linalg.norm(uv[0] - obs_c[i, j]) < 4.0
            if ok:
                points[j] = X

    def run_ba():
        reg, pts = list(poses), list(points)
        cams, X, _ = bundle_adjust([poses[i] for i in reg], np.array([points[j] for j in pts]),
                                   obs_arrays(reg, pts), fixed=(0,), kernel="huber", delta=2.0)
        poses.update(zip(reg, cams)); points.update(zip(pts, X))

    add_points()
    if use_ba:
        run_ba()
    while len(poses) < len(cams_c):
        counts = {i: sum((i, j) in obs_c for j in points) for i in range(len(cams_c)) if i not in poses}
        i = max(counts, key=counts.get)                    # next view: sees most 3D points
        js = [j for j in points if (i, j) in obs_c]
        Xw = np.array([points[j] for j in js]); uv = np.array([obs_c[i, j] for j in js])
        R, t = epnp(Xw, uv, K)
        poses[i] = refine_pose(R, t, Xw, uv, K)
        order.append(i)
        add_points()
        if use_ba:
            run_ba()                                        # COLMAP: local BA here, global BA now and then
    return poses, points, order

def trajectory_errors(poses):
    """Centre errors after aligning the initial pair (gauge of the reconstruction) to the truth."""
    est = np.array([-poses[i][0].T @ poses[i][1] for i in range(len(cams_c))])
    tru = np.array([-R.T @ t for R, t in cams_c])
    R0 = cams_c[0][0]                                       # camera 0 defines the frame,
    s = np.linalg.norm(tru[4] - tru[0]) / np.linalg.norm(est[4])   # the initial baseline the scale
    aligned = (s * est - cams_c[0][1]) @ R0                 # camera-0 frame -> world: R0^T (X - t0)
    return np.linalg.norm(aligned - tru, axis=1), aligned

runs = {}
for use_ba in (False, True):
    runs[use_ba] = poses, points, order = incremental_sfm(use_ba=use_ba)
    err, _ = trajectory_errors(poses)
    print("BA %-5s: %d points, order %s..., centre error at cameras 0, 10, 20, 29: %s m"
          % (use_ba, len(points), order[:8], err[[0, 10, 20, 29]].round(3)))
```

```text
corridor: 30 cameras, 900 points, 9203 observations
BA False: 806 points, order [0, 4, 3, 5, 7, 8, 10, 6]..., centre error at cameras 0, 10, 20, 29: [0.    0.096 0.511 1.202] m
BA True : 826 points, order [0, 4, 3, 5, 7, 8, 10, 6]..., centre error at cameras 0, 10, 20, 29: [0.    0.007 0.024 0.044] m
```

Errors are measured in the frame the reconstruction itself defines: camera 0 at its true pose, and the scale set by the initial baseline from camera 0 to camera 4. Without BA, each registration inherits the errors of the points it was placed against, and those points inherit the errors of the cameras that triangulated them. The errors compound: after 20 m the last camera is 1.2 m off. With a BA after every image, all observations constrain all parameters together, and the last camera is 4.4 cm off, 27 times better.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-incremental.svg" localized="true" caption="The toy incremental SfM on the corridor scene (30 cameras every 0.7 m, 900 points 4 to 12 m away, 1 px noise). Left: top view of the camera centres (the $z$ axis is stretched about 10 times); the reconstruction is anchored at camera 0 and scaled by the initial baseline to camera 4. Without BA (orange) rotation errors bend the trajectory and scale errors stretch it: the last camera is 1.20 m off. With BA after every image (purple) it stays on the truth (black). Top right: centre error per camera, log scale (camera 29: 1.202 m against 0.044 m). Bottom right: the local scale, estimated over true distance between consecutive cameras; without BA it drifts upwards, to 1.16 on the last step (1.19 at most); with BA it stays within about 1% of 1." %}

### 4.3 What COLMAP does better, and why each step matters

Our toy shows the skeleton. The details that make COLMAP robust on real photo collections are worth knowing, because they are also the knobs you turn when a reconstruction fails.

**Choosing the initial pair.** The first pair defines the frame and the scale and seeds everything else, so it must be reliable. It needs many verified matches *and* a wide baseline. A pair whose matches are explained about as well by a homography as by an essential matrix is a bad choice: it is either a pure rotation (no baseline, no depth, post 04) or a nearly planar scene, where the essential matrix is poorly determined. Our first version of the corridor scene had all points within a 2 m deep slab 8 m away; the linear eight-point estimate for the pair (0, 4) was then about 50° off in its translation direction (median 52° over 20 random versions of that scene, against 0.4° for points spread over 4 to 12 m), and the reconstruction failed. Spreading the points over 4 to 12 m fixed it. COLMAP prefers pairs with many verified matches in a densely connected part of the scene graph, and its two-view geometry step compares homography and essential-matrix inliers to flag planar and pure-rotation pairs.

**Next-best-view selection.** Registering an image against few or clustered points gives a poorly constrained pose, and errors made early are hard to undo later. COLMAP scores candidate images not only by the number of visible 3D points but also by how evenly they are spread over the image, using a multi-resolution grid; a pose is better constrained by points spread over the whole image.

**Robust triangulation.** A track may contain wrong matches. COLMAP triangulates each track with RANSAC over pairs of observations, checks the triangulation angle (1.5° by default, as [neural rendering post 1]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}) showed, below that depth error explodes) and cheirality (positive depth in every camera).

**Local and global BA.** After each registration COLMAP runs BA on the new image and its most connected neighbours, and runs a global BA when the model has grown by a certain fraction. It then filters observations with a large reprojection error and re-triangulates, which recovers tracks that were lost to earlier errors.

**Failure modes.** Incremental SfM is sequential, so its result depends on the order and early mistakes propagate. Drift accumulates along long chains without loop closures. Symmetric or repetitive structures (two identical facades, the inside and outside of a dome) can produce wrong but geometrically consistent registrations. And the repeated BA makes the cost grow faster than linearly with the number of images; Wu (2013) showed how to keep the main steps close to linear time.

## 5. Global Structure-from-Motion

### 5.1 The idea

**Global SfM** avoids the sequential growth. From the scene graph it takes the relative pose $(R\_{ij}, \hat{\mathbf t}\_{ij})$ of every verified pair, the rotation and the translation *direction* from post 04 (the length is unknown), and solves for all cameras at once:

1. **Rotation averaging**: find absolute rotations $R\_i$ consistent with all relative rotations.
2. **Translation averaging** (or global positioning): find positions consistent with the relative directions.
3. Triangulate all tracks and run **one** global BA.

Every image is treated the same, there is no order to get wrong, and the expensive BA runs once instead of hundreds of times. The price is robustness: a few wrong relative poses can spoil the whole solution, so robust averaging is essential.

### 5.2 Rotation averaging

With world-to-camera rotations, the relative rotation from camera $i$ to camera $j$ is $R\_{ij} = R\_j R\_i^\top$: it maps camera-$i$ coordinates to camera-$j$ coordinates. Each measured $R\_{ij}$ is one equation, so with $\vert\mathcal E\vert$ edges in the view graph and $m$ unknown rotations the problem is overdetermined, with a 3-DoF gauge (a global rotation). The **chordal** cost measures the mismatch with the Frobenius norm:

$$
\min_{R_1,\dots,R_m \in SO(3)} \sum_{(i,j)\in\mathcal E} \lVert R_j - R_{ij}R_i\rVert_F^2 .
$$

**A spectral solution.** Because rotations are orthogonal, $\lVert R\_j - R\_{ij}R\_i\rVert\_F^2 = 6 - 2\,\mathrm{tr}(R\_j^\top R\_{ij} R\_i)$, so minimizing the cost is the same as maximizing $\sum \mathrm{tr}(R\_j^\top R\_{ij}R\_i)$. Stack the unknowns into a $3m\times3$ matrix $Q = (R\_1; R\_2; \dots; R\_m)$ and the measurements into a symmetric $3m\times3m$ matrix $G$ whose block $(j, i)$ is $R\_{ij}$ and block $(i, j)$ is $R\_{ij}^\top$. Then the objective is $\mathrm{tr}(Q^\top G Q)$, up to a factor of 2. Now relax: keep only the constraint $Q^\top Q = mI$ that all rotations satisfy and forget the rest. The maximizer of $\mathrm{tr}(Q^\top GQ)$ under this constraint is spanned by the **top three eigenvectors** of $G$ (the Rayleigh quotient, three dimensions at once). Finally, project each $3\times3$ block of the eigenvector matrix onto the nearest rotation with an SVD. Why this works: with noise-free measurements, block row $j$ of $GQ$ is $\sum\_i R\_jR\_i^\top R\_i = d\_j R\_j$, where $d\_j$ is the number of edges at camera $j$. After dividing each block row by $d\_j$, as the code does, the three columns of $Q$ are exact eigenvectors with eigenvalue 1, the largest possible for a connected view graph, so the relaxation recovers the rotations exactly (up to the global rotation). Linear relaxations of this kind, which drop the orthogonality constraints and project onto $SO(3)$ at the end, are the classic initializers of global SfM (Martinec and Pajdla, CVPR 2007).

**Robustness by IRLS.** One wrong relative rotation, for example from a repetitive facade, can be off by 90°. The spectral solution is a least-squares method and spreads that error over everybody. As in BA, iterate: solve, measure the residual angle of every edge, down-weight the edges with large residuals (Cauchy weights with a 5° scale), and solve again. Chatterjee and Govindu (2013) popularized this approach for large problems (an $L\_1$ solution, then IRLS); Hartley et al. (2013) is the reference for the theory.

We simulate a view graph: 40 cameras on a circle around the running example, each connected to its neighbours up to 45° away (200 edges), relative rotations with 1.5° of noise per axis (a typical error of about 2°), and 8% of them replaced by wrong rotations (in a real pipeline they would come from post 04's essential-matrix decomposition; simulating them keeps the run short).

```python
def rot_angle(R):
    return np.degrees(np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1)))

rng_g = np.random.default_rng(21)
mg = 40                                                      # 40 cameras on a full circle
cams_g = [look_at(5.0 * np.array([np.sin(a), -0.4, -np.cos(a)]), (0, -0.5, 0))
          for a in np.linspace(0, 2 * np.pi, mg, endpoint=False)]
edges, R_rel = [], []
for i in range(mg):
    for j in range(i + 1, mg):
        if min(j - i, mg - (j - i)) <= 5:                  # neighbours up to 45 deg apart
            Rij = cams_g[j][0] @ cams_g[i][0].T              # R_ij = R_j R_i^T maps frame i to frame j
            if rng_g.random() < 0.08:                        # 8% of the pairs are simply wrong
                Rij = rodrigues(rng_g.normal(0, 1, 3)) @ Rij
            else:
                Rij = rodrigues(rng_g.normal(0, np.deg2rad(1.5), 3)) @ Rij
            edges.append((i, j)); R_rel.append(Rij)
print("%d cameras, %d relative rotations" % (mg, len(edges)))
```

```text
40 cameras, 200 relative rotations
```

```python
def project_so3(M):
    U, _, Vt = np.linalg.svd(M)
    return U @ np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))]) @ Vt

def rotation_averaging(m, edges, R_rel, iters=0, scale_deg=5.0):
    """Spectral relaxation of the chordal cost, then optional IRLS with Cauchy weights."""
    w = np.ones(len(edges))
    for it in range(iters + 1):
        G = np.zeros((3 * m, 3 * m)); deg = np.zeros(m)
        for (i, j), Rij, wk in zip(edges, R_rel, w):
            G[3 * j:3 * j + 3, 3 * i:3 * i + 3] = wk * Rij       # block (j, i) should be R_j R_i^T
            G[3 * i:3 * i + 3, 3 * j:3 * j + 3] = wk * Rij.T
            deg[[i, j]] += wk
        G = G / np.repeat(deg, 3)[:, None]                    # normalize each block row by its degree
        vals, vecs = np.linalg.eig(G)
        V = vecs[:, np.argsort(-vals.real)[:3]].real         # top 3 eigenvectors ~ [R_1; ...; R_m] O
        if np.sum([np.linalg.det(V[3 * k:3 * k + 3]) for k in range(m)]) < 0:
            V[:, 0] *= -1                                    # remove a global reflection
        Rs = [project_so3(V[3 * k:3 * k + 3]) for k in range(m)]
        res = np.array([rot_angle(Rs[j] @ Rs[i].T @ Rij.T) for (i, j), Rij in zip(edges, R_rel)])
        w = 1.0 / (1.0 + (res / scale_deg) ** 2)             # Cauchy IRLS weights for the next round
    return Rs, res

def chain_rotations(m, edges, R_rel):
    """Naive alternative: walk a spanning tree from camera 0 and compose relative rotations."""
    Rs = {0: np.eye(3)}
    while len(Rs) < m:
        for (i, j), Rij in zip(edges, R_rel):
            if i in Rs and j not in Rs:
                Rs[j] = Rij @ Rs[i]
            elif j in Rs and i not in Rs:
                Rs[i] = Rij.T @ Rs[j]
    return [Rs[k] for k in range(m)]

def rotation_errors(Rs):
    """Per-camera errors (deg) after removing the global rotation gauge."""
    O = project_so3(sum(Ri.T @ Rt for Ri, Rt in zip(Rs, (c[0] for c in cams_g))))
    return np.array([rot_angle(Ri @ O @ Rt.T) for Ri, (Rt, _) in zip(Rs, cams_g)])

for name, Rs in (("spanning tree", chain_rotations(mg, edges, R_rel)),
                 ("spectral L2", rotation_averaging(mg, edges, R_rel)[0]),
                 ("spectral + IRLS", rotation_averaging(mg, edges, R_rel, iters=10)[0])):
    e = rotation_errors(Rs)
    print("%-16s median %.2f deg, max %.2f deg" % (name, np.median(e), e.max()))
```

```text
spanning tree    median 5.13 deg, max 57.41 deg
spectral L2      median 4.48 deg, max 10.05 deg
spectral + IRLS  median 0.90 deg, max 1.78 deg
```

Chaining rotations along a spanning tree (what an incremental method implicitly does) is as good as the edges it happens to use: a wrong edge in the tree makes everything behind it 57° off. The spectral $L\_2$ solution uses all edges, so no camera is catastrophically wrong, but the 15 wrong edges spread a 4.5° error everywhere. Ten rounds of reweighting isolate them, and the median error drops to 0.9°: averaging 10 measurements per camera gives a result more accurate than any single measurement (about 2° each).

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-rotation-averaging.svg" localized="true" caption="Rotation averaging on 40 cameras and 200 relative rotations, 15 of them wrong. Left: per-camera rotation error after removing the global rotation gauge, log scale. Spanning tree: median 5.1°, maximum 57°; spectral $L\_2$: median 4.5°, maximum 10°; spectral with IRLS: median 0.90°, maximum 1.8°. Right: the edge residuals after IRLS. The correct pairs (purple) stay below 5.4°, the wrong ones (red) above 32.6°, so the Cauchy weights (dashed, right axis) separate them cleanly." %}

### 5.3 Translation averaging

With all $R\_i$ known, each pair gives the direction from one camera centre to the other. From $\mathbf X^{(j)} = R\_{ij}\mathbf X^{(i)} + \mathbf t\_{ij}$ and $\mathbf t\_k = -R\_k\mathbf C\_k$ we get $\mathbf t\_{ij} = -R\_j(\mathbf C\_j - \mathbf C\_i)$, so the measured unit vector $\hat{\mathbf t}\_{ij}$ fixes the world direction

$$
\mathbf d_{ij} = -R_j^\top\hat{\mathbf t}_{ij}, \qquad \mathbf C_j - \mathbf C_i = \lambda_{ij}\,\mathbf d_{ij}, \quad \lambda_{ij} > 0 \text{ unknown}.
$$

The simplest solver writes $\mathbf d\_{ij}\times(\mathbf C\_j - \mathbf C\_i) = \mathbf 0$, which is linear in the centres, and solves the homogeneous system with an SVD (after fixing $\mathbf C\_1 = \mathbf 0$). Two problems make translation averaging the hard part of global SfM. **Magnitude**: the cross-product form weighs each edge by its unknown length, so long baselines dominate. Methods such as LUD (Özyeşil and Singer 2015) solve $\min\sum\lVert\mathbf C\_j - \mathbf C\_i - \lambda\_{ij}\mathbf d\_{ij}\rVert$ with $\lambda\_{ij} \ge 1$; BATA (Zhuang et al. 2018) uses a bilinear, angle-based cost that is insensitive to baseline length. **Degeneracy**: directions alone cannot fix positions along a straight line of cameras (a car driving down a street), since all directions are parallel and every spacing fits. Parallel rigidity theory characterizes when the problem is well posed. Wrong directions are common too; 1DSfM (Wilson and Snavely 2014) removes them by projecting the problem onto many 1D lines first.

### 5.4 Global positioning: GLOMAP

GLOMAP (Pan, Baráth, Pollefeys and Schönberger, ECCV 2024) skips the pairwise directions altogether. After rotation averaging it already knows, for each observation, the viewing ray in world orientation: $\mathbf v\_{ij} = R\_i^\top\mathbf f\_{ij}$, with $\mathbf f\_{ij}$ the bearing of the pixel. It then estimates camera centres $\mathbf C\_i$ and points $\mathbf X\_j$ **together**, by asking each ray to point from its camera to its point:

$$
\min_{\{\mathbf C_i\}, \{\mathbf X_j\}, \{d_{ij}\}} \sum_{(i,j)\in\mathcal O} \rho\Big(\big\lVert \mathbf v_{ij} - d_{ij}\,(\mathbf X_j - \mathbf C_i) \big\rVert\Big), \qquad d_{ij} \ge 0 .
$$

The scalar $d\_{ij}$ absorbs the unknown distance (it ends up near the inverse depth), the constraint $d\_{ij} \ge 0$ enforces cheirality, and the residual is bounded: for the best $d\_{ij}$ it equals the sine of the angle between $\mathbf v\_{ij}$ and the direction from $\mathbf C\_i$ to $\mathbf X\_j$ (or 1 if the point lies behind the camera), so a wrong observation can cost at most a constant. Compared with translation averaging, the constraints come from tracks over many images, not from pairs, so there are far more of them, the baseline-length problem disappears, and collinear camera motion is no longer degenerate when the points are spread out. The objective is bilinear rather than projective, and the GLOMAP paper reports that it converges from a **random** initialization. We test that claim with SciPy's bounded least squares on the 40-camera circle, using the averaged rotations of section 5.2 and the pixels of the running example's 120 points with 0.5 px noise:

```python
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix

Rs_avg, res = rotation_averaging(mg, edges, R_rel, iters=10)
Og = project_so3(sum(Ri.T @ Rt for Ri, (Rt, _) in zip(Rs_avg, cams_g)))
Rs_avg = [Ri @ Og for Ri in Rs_avg]                           # express in the true frame, for plotting
obs_g = []
for i, (R, t) in enumerate(cams_g):
    uv, depth = project(K, R, t, X_true)
    for j in np.flatnonzero(depth > 0):
        f = bearings(K, (uv[j] + rng_g.normal(0, 0.5, 2))[None])[0]
        obs_g.append((i, j, Rs_avg[i].T @ f))                # the ray in world orientation
gi = np.array([o[0] for o in obs_g]); gj = np.array([o[1] for o in obs_g])
v = np.array([o[2] for o in obs_g]); Lg = len(obs_g)

def positioning_residuals(z):
    Cg, Xg, dg = z[:3 * mg].reshape(-1, 3), z[3 * mg:3 * (mg + n)].reshape(-1, 3), z[3 * (mg + n):]
    return (v - dg[:, None] * (Xg[gj] - Cg[gi])).ravel()     # v_ij - d_ij (X_j - c_i)

sparsity = lil_matrix((3 * Lg, 3 * (mg + n) + Lg), dtype=int)
for k in range(Lg):
    for a in range(3):
        sparsity[3 * k + a, 3 * gi[k] + a] = 1
        sparsity[3 * k + a, 3 * mg + 3 * gj[k] + a] = 1
        sparsity[3 * k + a, 3 * (mg + n) + k] = 1
z0 = np.r_[np.random.default_rng(0).uniform(-1, 1, 3 * (mg + n)), np.ones(Lg)]   # random start
lo = np.r_[np.full(3 * (mg + n), -np.inf), np.zeros(Lg)]     # d_ij >= 0
sol = least_squares(positioning_residuals, z0, jac_sparsity=sparsity, bounds=(lo, np.inf),
                    loss="soft_l1", f_scale=0.1, x_scale="jac")
Cg = sol.x[:3 * mg].reshape(-1, 3); Xg = sol.x[3 * mg:3 * (mg + n)].reshape(-1, 3)
Ctrue_g = np.array([-R.T @ t for R, t in cams_g])
s, Ra, ta = umeyama(np.vstack([Cg, Xg]), np.vstack([Ctrue_g, X_true]))
err_c = np.linalg.norm(Cg @ (s * Ra).T + ta - Ctrue_g, axis=1)
err_x = np.linalg.norm(Xg @ (s * Ra).T + ta - X_true, axis=1)
print("%d observations, %d function evaluations; after a similarity alignment: centre error "
      "median %.3f, max %.3f; point error median %.3f" % (Lg, sol.nfev, np.median(err_c), err_c.max(), np.median(err_x)))
```

```text
4800 observations, 51 function evaluations; after a similarity alignment: centre error median 0.063, max 0.140; point error median 0.006
```

From positions drawn uniformly in a $2\times2\times2$ cube, 51 function evaluations recover the circle of cameras to a median of 6.3 cm and the points to 6 mm. The remaining camera error mostly comes from the 0.9° rotation errors (at 5 m, $0.9° \approx 8$ cm); the final global BA, which refines rotations too, removes it.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-global-positioning.svg" caption="Global positioning from a random start: top views ($x$ against $z$) of the camera centres (triangles, colored by their index around the circle) and the points (gray) after $n\_{\mathrm{eval}}$ function evaluations of the solver, each panel at its own scale (the scale is a gauge freedom). The title gives $\tilde e$, the median camera-centre error after a similarity alignment to the truth, for a 5 m circle. At the start (random, $\tilde e=5.07$) and after 3, 8 and 15 evaluations the cameras are still a jumble, but the colors begin to sort; after 25 the ring has formed ($\tilde e=1.27$), and at convergence (51 evaluations) the circle and its order are recovered, $\tilde e=0.06$." %}

GLOMAP reports accuracy on par with or better than COLMAP's incremental mapper while being orders of magnitude faster. As of November 2026 COLMAP itself ships it as the `global_mapper` command, and the COLMAP documentation recommends running `view_graph_calibrator` on a copy of the database first. Like every global method it depends on robust averaging (section 5.1), so the incremental mapper remains the safer choice for difficult collections.

### 5.5 Which one to use

| | Incremental (COLMAP) | Global (GLOMAP, OpenMVG, Theia) |
| --- | --- | --- |
| Order | one image at a time | all images at once |
| BA | after every image (local) and periodically (global) | once at the end (plus refinements) |
| Robustness | high: each step is verified, bad images are simply not registered | depends on robust averaging; wrong pairs can corrupt everything |
| Drift | accumulates along chains, corrected by BA | errors spread evenly over the graph |
| Speed | slow for many images (repeated BA) | much faster |
| Good for | difficult, unordered internet collections; the reference for NeRF/3DGS datasets | large, well-connected captures (video, drones, scans) |

Feed-forward networks are now a third way to get cameras: VGGSfM (CVPR 2024) builds a differentiable SfM pipeline around learned tracks and a differentiable BA, and VGGT (CVPR 2025) predicts cameras, depth and point maps for many images in one forward pass. As of November 2026 they are fast and robust initializers, and VGGT's own code offers an optional BA refinement afterwards: the geometry of this post remains the final word on accuracy. [Post 09]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) covers these models.

## 6. Scale ambiguity

### 6.1 Images do not know metres

The gauge of section 3.7 includes scale. A reconstruction made from images alone cannot tell a building from a model of it, because scaling all points and all translations changes no pixel:

```python
for s_ in (0.1, 1.0, 37.0):
    cams_s = [(R, s_ * t) for R, t in cams_ba]              # scale every translation ...
    print("scale %5.1f: rms %.6f px" % (s_, np.sqrt(ba_cost(cams_s, s_ * X_ba, obs_all) / L)))  # ... and every point

def drift_scale(poses):
    """Ratio of estimated to true distance between consecutive cameras (initial baseline = 1)."""
    est = np.array([-poses[i][0].T @ poses[i][1] for i in range(len(cams_c))])
    tru = np.array([-R.T @ t for R, t in cams_c])
    s = np.linalg.norm(tru[4] - tru[0]) / np.linalg.norm(est[4] - est[0])
    return s * np.linalg.norm(np.diff(est, axis=0), axis=1) / np.linalg.norm(np.diff(tru, axis=0), axis=1)

for use_ba in (False, True):
    ratio = drift_scale(runs[use_ba][0])
    print("BA %-5s: local scale at steps 1, 15, 29: %s" % (use_ba, ratio[[0, 14, 28]].round(3)))
```

```text
scale   0.1: rms 0.628297 px
scale   1.0: rms 0.628297 px
scale  37.0: rms 0.628297 px
BA False: local scale at steps 1, 15, 29: [1.009 1.028 1.159]
BA True : local scale at steps 1, 15, 29: [0.999 1.    0.994]
```

The RMS is identical to six digits for a scene 10 times smaller and 37 times larger. COLMAP models are therefore in arbitrary units, and NeRF and 3DGS code typically normalizes scenes by the spread of the camera centres before training.

### 6.2 Scale drift

In a single global optimization the scale is one number. In a sequential process it is re-estimated at every step: each newly triangulated point and each newly registered camera carries the scale of the points it was computed from, with a little error. Those errors random-walk. The second half of the snippet measures the **local scale**, the ratio of estimated to true distance between consecutive cameras, in the corridor reconstruction: without BA it climbs to 1.16 on the last step (1.19 at most, as the incremental figure shows), so distances at the far end of the map come out 10 to 20% too large; with BA after every image it stays within about 1% of 1 (0.994 on the last step). Monocular visual odometry and SLAM suffer from the same **scale drift**, and loop closures in [post 06]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }}) are optimized over similarities ($\mathrm{Sim}(3)$) rather than rigid motions for exactly this reason.

### 6.3 Getting metric scale

Scale must come from outside the images, or from prior knowledge:

- **A known distance**: a scale bar, a calibration board or markers in the scene, or the known size of an object. One distance fixes the scale of the whole model.
- **A stereo rig**: the calibrated baseline of [post 02]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}), section 7, is a known distance in every frame.
- **An IMU**: accelerometers measure metric acceleration, which makes scale observable in visual-inertial odometry ([post 06]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})).
- **GNSS or other position priors** align the model with a geographic frame and fix all seven gauge parameters.
- **Depth sensors and metric depth networks** ([post 07]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})) give metric depth for some pixels, hence scale.

## 7. A practical checklist

When an SfM result looks wrong, check in this order:

1. **Registered images.** Are almost all images in one model? Several small models mean the scene graph is disconnected: add images that bridge the gaps or improve matching.
2. **Mean reprojection error.** Below about 1 px for good images with correct intrinsics. A larger value often means wrong intrinsics or distortion model (post 02) or rolling shutter (post 01).
3. **Track lengths and triangulation angles.** Many points seen by only two images with tiny angles mean weak geometry; capture with more parallax.
4. **Look at the cameras.** Plot the camera centres and viewing directions (the debugging checklist of post 01, section 4.5). Duplicated or mirrored parts of a scene suggest wrong registrations from symmetric structures.
5. **Scale and gauge.** Remember that the model has an arbitrary similarity transform. Compare shapes after a Umeyama alignment, not raw coordinates.
6. **Intrinsics.** If you let BA refine focal length and distortion per image, make sure enough views constrain them; share intrinsics across images from the same camera.

## Try it

- The bundle adjustment widget in section 3.6: watch LM converge, then break it with outliers and fix it with a robust kernel.
- The [Gaussian World demo]({{ '/' | relative_url }}#lab) on the home page renders 3D Gaussians from camera poses of exactly the kind this post estimates.
- Run COLMAP on 30 to 50 photos of an object you walk around. Compare `colmap mapper` with `colmap global_mapper` (a recent COLMAP that includes `global_mapper`), and read the registration order and the reprojection errors in the log.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Random sample consensus (Fischler, Bolles) | Communications of the ACM | 1981 | [DOI](https://doi.org/10.1145/358669.358692) | RANSAC, introduced for exactly this problem: the camera pose from landmarks |
| Review and analysis of solutions of the three point perspective pose estimation problem (Haralick, Lee, Ottenberg, Nölle) | IJCV | 1994 | [DOI](https://doi.org/10.1007/BF02028352) | Grunert's P3P and its successors, with a numerical analysis |
| Bundle adjustment — a modern synthesis (Triggs, McLauchlan, Hartley, Fitzgibbon) | Vision Algorithms: Theory and Practice (LNCS 1883) | 2000 | [DOI](https://doi.org/10.1007/3-540-44480-7_21) | The reference on BA: cost functions, sparsity, gauge, robustness |
| Complete solution classification for the perspective-three-point problem (Gao, Hou, Tang, Cheng) | TPAMI | 2003 | [DOI](https://doi.org/10.1109/TPAMI.2003.1217599) | When P3P has one, two, three or four solutions |
| Photo tourism: exploring photo collections in 3D (Snavely, Seitz, Szeliski) | SIGGRAPH (ACM TOG) | 2006 | [DOI](https://doi.org/10.1145/1141911.1141964) | Incremental SfM on internet photos |
| EPnP: an accurate O(n) solution to the PnP problem (Lepetit, Moreno-Noguer, Fua) | IJCV | 2009 | [DOI](https://doi.org/10.1007/s11263-008-0152-6) | Control points make PnP linear in the number of points |
| SBA: a software package for generic sparse bundle adjustment (Lourakis, Argyros) | ACM TOMS | 2009 | [DOI](https://doi.org/10.1145/1486525.1486527) | Sparse LM with the Schur complement, as a library |
| Building Rome in a day (Agarwal, Snavely, Simon, Seitz, Szeliski) | ICCV | 2009 | [DOI](https://doi.org/10.1109/ICCV.2009.5459148) | City-scale SfM on a cluster |
| Bundle adjustment in the large (Agarwal, Snavely, Seitz, Szeliski) | ECCV | 2010 | [DOI](https://doi.org/10.1007/978-3-642-15552-9_3) | Inexact Newton and iterative Schur solvers; the BAL benchmark |
| A novel parametrization of the perspective-three-point problem (Kneip, Scaramuzza, Siegwart) | CVPR | 2011 | [DOI](https://doi.org/10.1109/CVPR.2011.5995464) | A direct P3P solver for the pose |
| Multicore bundle adjustment (Wu, Agarwal, Curless, Seitz) | CVPR | 2011 | [DOI](https://doi.org/10.1109/CVPR.2011.5995552) | BA on multicore CPUs and GPUs |
| Rotation averaging (Hartley, Trumpf, Dai, Li) | IJCV | 2013 | [DOI](https://doi.org/10.1007/s11263-012-0601-0) | Theory of single and multiple rotation averaging |
| Efficient and robust large-scale rotation averaging (Chatterjee, Govindu) | ICCV | 2013 | [CVF](https://openaccess.thecvf.com/content_iccv_2013/html/Chatterjee_Efficient_and_Robust_2013_ICCV_paper.html) | $L\_1$ followed by IRLS, robust to wrong pairs |
| Global fusion of relative motions for robust, accurate and scalable structure from motion (Moulon, Monasse, Marlet) | ICCV | 2013 | [CVF](https://openaccess.thecvf.com/content_iccv_2013/html/Moulon_Global_Fusion_of_2013_ICCV_paper.html) | Robust global SfM: rotations first, then translations from triplets of views; the basis of OpenMVG's global pipeline |
| Towards linear-time incremental structure from motion (Wu) | 3DV | 2013 | [DOI](https://doi.org/10.1109/3DV.2013.25) | Keeping incremental SfM close to O(n) (VisualSFM) |
| Robust global translations with 1DSfM (Wilson, Snavely) | ECCV | 2014 | [Project](https://research.cs.cornell.edu/1dsfm) | Removing wrong translation directions |
| Robust camera location estimation by convex programming (Özyeşil, Singer) | CVPR | 2015 | [CVF](https://openaccess.thecvf.com/content_cvpr_2015/html/Ozyesil_Robust_Camera_Location_2015_CVPR_paper.html) | LUD: robust convex translation averaging, parallel rigidity |
| Structure-from-Motion revisited (Schönberger, Frahm) | CVPR | 2016 | [CVF](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) | COLMAP's incremental pipeline |
| Baseline desensitizing in translation averaging (Zhuang, Cheong, Lee) | CVPR | 2018 | [arXiv](https://arxiv.org/abs/1901.00643) | BATA: a bilinear, angle-based cost |
| Lambda Twist: an accurate fast robust perspective three point (P3P) solver (Persson, Nordberg) | ECCV | 2018 | [ECVA](https://www.ecva.net/papers/eccv_2018/papers_ECCV/html/Mikael_Persson_Lambda_Twist_An_ECCV_2018_paper.php) | A fast, stable P3P without a quartic |
| Pixel-perfect structure-from-motion with featuremetric refinement (Lindenberger et al.) | ICCV | 2021 | [arXiv](https://arxiv.org/abs/2108.08291) | Refines keypoints and BA with dense learned features |
| VGGSfM: visual geometry grounded deep structure from motion (Wang, Karaev, Rupprecht, Novotny) | CVPR | 2024 | [CVF](https://openaccess.thecvf.com/content/CVPR2024/html/Wang_VGGSfM_Visual_Geometry_Grounded_Deep_Structure_From_Motion_CVPR_2024_paper.html) | A fully differentiable SfM with a differentiable BA |
| Global structure-from-motion revisited (Pan, Baráth, Pollefeys, Schönberger) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2407.20219) | GLOMAP: joint global positioning of cameras and points |
| VGGT: visual geometry grounded transformer (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2503.11651) | Feed-forward cameras, depth and points; BA optional afterwards |

Status as of November 2026: every entry is published at the venue listed, including the recent VGGSfM (CVPR 2024), GLOMAP (ECCV 2024) and VGGT (CVPR 2025).

## Learning resources

- R. Hartley and A. Zisserman, *Multiple View Geometry in Computer Vision*, 2nd ed., 2004: chapter 7 (camera matrix estimation), chapter 18 (N-view computational methods, including bundle adjustment) and appendix A6 (iterative estimation, sparse Levenberg-Marquardt).
- R. Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed., 2022, chapter 11 (structure from motion and SLAM): sections on bundle adjustment, exploiting sparsity and global SfM. Free at [szeliski.org/Book](https://szeliski.org/Book/).
- B. Triggs et al., "Bundle adjustment — a modern synthesis" (above): long, but the best single text on gauge freedom and robust costs; a free copy is on [HAL](https://hal.archives-ouvertes.fr/inria-00548290v1).
- [Ceres Solver](http://ceres-solver.org/): its bundle adjustment tutorial and the BAL problems; [the BAL dataset](https://grail.cs.washington.edu/projects/bal/).
- [COLMAP documentation](https://colmap.github.io/) (tutorial, incremental and global mappers) and [GLOMAP](https://github.com/colmap/glomap).
- OpenCV: [Perspective-n-Point pose computation](https://docs.opencv.org/4.x/d5/d1f/calib3d_solvePnP.html) (solvePnP methods, RANSAC and refinement).

## Exercises

1. **P3P solution count.** Move the camera of the P3P example along a line and count the real positive roots of the quartic at each position. Where does the number change? (Gao et al. 2003 give the full classification.)

   <details markdown="1"><summary>Hint</summary>

   Reuse `p3p` with `project(K, R, t, X_true[sel])` for cameras from `look_at`. The number of solutions changes when two real roots merge (the quartic touches zero); when one of the two merging roots is the true pose, the camera is crossing the "danger cylinder" through the three points, where the problem is also ill-conditioned. (Two false solutions can also merge elsewhere.)
   </details>

2. **Schur by hand.** For one camera and two points, write $H$ as a $12\times12$ block matrix and verify numerically that the Schur complement step equals `np.linalg.solve(H, -g)` on the full system.

   <details markdown="1"><summary>Hint</summary>

   Build $J$ with `full_jacobian`, $H = J^\top J + \lambda\,\mathrm{diag}(J^\top J)$ and $\mathbf g = J^\top\mathbf r$; compare with the step `ba_step` returns (with `fixed=()`). With one camera there is a gauge, so keep $\lambda > 0$.
   </details>

3. **The gauge in the covariance.** Compute the covariance of the camera centres from $\sigma^2(J^\top J)^{+}$ (pseudo-inverse) and from $\sigma^2(J\_f^\top J\_f)^{-1}$ with camera 1 and the scale fixed. Which cameras are "uncertain" in each gauge?

   <details markdown="1"><summary>Hint</summary>

   With camera 1 fixed, uncertainty grows with distance from camera 1, because the gauge puts all the uncertainty of the frame into the other cameras. The pseudo-inverse spreads it evenly (minimum-norm gauge). Distances between cameras have the same variance in both.
   </details>

4. **Breaking robust BA.** Raise the outlier fraction in the code of section 3.8 from 5% to 20% and 40%. When does Huber fail? When does Cauchy fail, and does a better start (less perturbation) help?

   <details markdown="1"><summary>Hint</summary>

   Huber's influence is bounded but not zero, so its bias grows roughly with the outlier fraction. Cauchy's influence goes to zero, but its cost is nonconvex; with many outliers and a poor start it can lock onto a wrong minimum. The widget lets you try the same thing interactively.
   </details>

5. **Translation averaging.** Implement the linear method of section 5.3 ($\mathbf d\_{ij}\times(\mathbf C\_j - \mathbf C\_i) = \mathbf 0$) for the 40-camera circle with exact rotations and 1° of noise on the directions. Then put all cameras on a straight line. What happens, and why does the global positioning of section 5.4 not have this problem?

   <details markdown="1"><summary>Hint</summary>

   Fix $\mathbf C\_1 = \mathbf 0$ and take the smallest right singular vector of the stacked $3\vert\mathcal E\vert\times3(m-1)$ system. On a line all $\mathbf d\_{ij}$ are parallel and any spacing of the cameras satisfies every constraint: the null space becomes large. Point-camera rays come from points off the line, so they still fix the spacing.
   </details>

**Next:** [Visual SLAM]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }}): the same optimization run in real time on a moving camera, with keyframes, factor graphs, loop closure and IMUs.
