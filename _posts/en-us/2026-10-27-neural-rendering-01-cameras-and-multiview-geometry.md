---
layout: post
title: "Cameras and multi-view geometry: from pixels to poses"
date: 2026-10-27 12:01:00+0900
description: "Pinhole cameras, intrinsics and extrinsics, lens distortion, epipolar geometry, the eight-point algorithm, triangulation, bundle adjustment, Structure-from-Motion with COLMAP and multi-view stereo, with NumPy code."
categories: neural-rendering
tags: [camera-model, epipolar-geometry, structure-from-motion, colmap, bundle-adjustment, multi-view-stereo]
series: neural-rendering
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## Why this matters

The graphics series went from a 3D scene to an image: you knew the geometry, the materials and the camera, and you computed pixels. Neural rendering runs that pipeline **backwards**. We are given photographs and want a 3D representation that, when rendered from the same cameras, reproduces them. NeRF and 3D Gaussian Splatting (3DGS) both assume that every training image comes with an accurate camera: its intrinsics (focal length, principal point, distortion) and its pose in a common world frame. Those cameras almost always come from **Structure-from-Motion (SfM)**, typically COLMAP, and 3DGS even uses the sparse SfM point cloud as its initialization.

So before we optimize any radiance field we need to understand how a camera maps 3D to 2D, how two views constrain each other, and how hundreds of views are solved jointly. This post is the multi-view geometry toolkit for the rest of the series.

## Prerequisites

- Linear algebra: rotations, homogeneous coordinates, SVD and least squares.
- The camera and projection matrices from the graphics series (the view and projection transforms of rasterization).
- NumPy. The bundle adjustment snippet also uses SciPy.

## 1. The pinhole camera

### 1.1 Projection

An ideal pinhole camera maps a 3D point to the image plane by a central projection. Write a world point in homogeneous coordinates $\tilde{\mathbf X} = (X, Y, Z, 1)^\top$. The camera first moves it into its own frame with a rigid transform (the **extrinsics**), then projects and converts to pixels with the **intrinsics**:

$$
\lambda \begin{pmatrix} u \\ v \\ 1 \end{pmatrix}
= \underbrace{\begin{pmatrix} f_x & s & c_x \\ 0 & f_y & c_y \\ 0 & 0 & 1 \end{pmatrix}}_{K}
\underbrace{\begin{pmatrix} R & \mathbf t \end{pmatrix}}_{3\times 4}
\begin{pmatrix} X \\ Y \\ Z \\ 1 \end{pmatrix},
\qquad P = K\,[R \mid \mathbf t].
$$

Here $\lambda$ is the depth of the point in the camera frame, so $u = f_x\, X_c/Z_c + c_x$ and $v = f_y\, Y_c/Z_c + c_y$ (with skew $s = 0$, which holds for practically every modern sensor). The $3\times 4$ matrix $P$ is the **projection matrix**; it has 11 degrees of freedom (12 entries up to scale): 5 intrinsic and 6 extrinsic.

- $f_x, f_y$ are the focal length in pixels: $f_x = F / \text{pixel width}$ for a physical focal length $F$. With a horizontal field of view $\theta_x$ and image width $W$, $f_x = \frac{W}{2\tan(\theta_x/2)}$.
- $(c_x, c_y)$ is the **principal point**, where the optical axis pierces the image, usually close to the image centre.

### 1.2 Extrinsics, camera centres and conventions

$[R \mid \mathbf t]$ maps **world to camera**: $\mathbf X_c = R\mathbf X_w + \mathbf t$. The camera centre is the point that maps to the origin, $\mathbf C = -R^\top \mathbf t$. Many neural rendering codebases instead store the inverse, the **camera-to-world** matrix

$$
T_{c2w} = \begin{pmatrix} R^\top & \mathbf C \\ \mathbf 0^\top & 1 \end{pmatrix},
$$

whose columns are the camera's right/down/forward axes and its position expressed in world coordinates. Two axis conventions are in common use, and mixing them is the most frequent bug in this field:

| Convention | $x$ | $y$ | camera looks along | Used by |
| --- | --- | --- | --- | --- |
| OpenCV / COLMAP | right | down | $+z$ | COLMAP, OpenCV, 3DGS (internally) |
| OpenGL / Blender | right | up | $-z$ | original NeRF `transforms.json`, Blender, nerfstudio |

Converting between them is a right-multiplication of $T_{c2w}$ by $\mathrm{diag}(1, -1, -1, 1)$ (flip the camera's $y$ and $z$ axes). COLMAP itself stores, per image, a world-to-camera quaternion `QW QX QY QZ` and translation `TX TY TZ`.

### 1.3 Lens distortion

Real lenses bend straight lines. The standard Brown–Conrady model (used by OpenCV and by COLMAP's `OPENCV` camera) acts on the normalized image coordinates $x = X_c/Z_c$, $y = Y_c/Z_c$ before the intrinsics are applied. With $r^2 = x^2 + y^2$:

$$
\begin{aligned}
x_d &= x\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + 2p_1 xy + p_2 (r^2 + 2x^2),\\
y_d &= y\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + p_1 (r^2 + 2y^2) + 2p_2 xy,
\end{aligned}
$$

then $u = f_x x_d + c_x$, $v = f_y y_d + c_y$. The $k_i$ terms are **radial** distortion (barrel for $k_1<0$, pincushion for $k_1>0$) and $p_1, p_2$ are **tangential** distortion from a lens that is not perfectly parallel to the sensor. Fisheye lenses need a different model (COLMAP's `OPENCV_FISHEYE`, an equidistant projection with polynomial correction).

The original 3DGS rasterizer only supports undistorted pinhole cameras, which is why its preprocessing script runs COLMAP's `image_undistorter` and then trains on `PINHOLE` images. We will meet this again in the tutorial (post 6).

Intrinsics and distortion are estimated by **calibration**, classically by showing a planar checkerboard to the camera from several orientations and solving for $K$ and the distortion coefficients in closed form followed by nonlinear refinement (Zhang, 2000), which is what `cv2.calibrateCamera` implements. SfM can also self-calibrate them from the scene.

### 1.4 Code: projecting points

The following snippet builds two cameras looking at a cloud of points and projects them, including optional distortion. We reuse it for the rest of the post.

```python
import numpy as np

def look_at(C, target, up=np.array([0.0, -1.0, 0.0])):
    """World-to-camera (R, t) in the OpenCV convention: x right, y down, z forward."""
    z = target - C; z /= np.linalg.norm(z)
    x = np.cross(up, z); x /= np.linalg.norm(x)
    y = np.cross(z, x)
    R = np.stack([x, y, z])          # rows are the camera axes in world coordinates
    t = -R @ C
    return R, t

def project(K, R, t, X, dist=None):
    """Project Nx3 world points to Nx2 pixels; dist = (k1, k2, p1, p2, k3) or None."""
    Xc = X @ R.T + t                 # world -> camera
    x, y = Xc[:, 0] / Xc[:, 2], Xc[:, 1] / Xc[:, 2]   # normalized image plane
    if dist is not None:
        k1, k2, p1, p2, k3 = dist
        r2 = x * x + y * y
        radial = 1 + k1 * r2 + k2 * r2**2 + k3 * r2**3
        x, y = (x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x),
                y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y)
    u = K[0, 0] * x + K[0, 1] * y + K[0, 2]
    v = K[1, 1] * y + K[1, 2]
    return np.stack([u, v], axis=1), Xc[:, 2]

W, H, fov = 640, 480, np.deg2rad(60)
f = W / (2 * np.tan(fov / 2))
K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])

rng = np.random.default_rng(0)
X = rng.uniform(-1, 1, size=(200, 3))                     # points around the origin
R1, t1 = look_at(np.array([0.0, -0.5, -4.0]), np.zeros(3))
R2, t2 = look_at(np.array([2.0, -0.8, -3.5]), np.zeros(3))
x1, d1 = project(K, R1, t1, X)
x2, d2 = project(K, R2, t2, X)
print("all in front:", (d1 > 0).all() and (d2 > 0).all())
```

Note that `look_at` uses "up" $=(0,-1,0)$ because in the OpenCV convention the image $y$ axis points down.

## 2. Two views: epipolar geometry

### 2.1 The epipolar constraint

Take two cameras observing the same 3D point $\mathbf X$, at pixels $\mathbf x_1$ and $\mathbf x_2$. The two camera centres and $\mathbf X$ span a plane, the **epipolar plane**. It intersects each image in a line, the **epipolar line**, so given $\mathbf x_1$ the match $\mathbf x_2$ must lie on a known line in image 2. The line joining the two centres (the **baseline**) pierces the images at the **epipoles**.

Algebraically, let the relative pose be $\mathbf X_2 = R\,\mathbf X_1 + \mathbf t$ (camera-1 coordinates to camera-2 coordinates), and let $\hat{\mathbf x}_i = K_i^{-1}\tilde{\mathbf x}_i$ be normalized (calibrated) homogeneous coordinates. The vectors $\hat{\mathbf x}_2$, $\mathbf t$ and $R\hat{\mathbf x}_1$ are coplanar, so their triple product vanishes:

$$
\hat{\mathbf x}_2^\top\, [\mathbf t]_\times R\, \hat{\mathbf x}_1 = 0,
\qquad
E = [\mathbf t]_\times R,
\qquad
[\mathbf t]_\times = \begin{pmatrix} 0 & -t_z & t_y \\ t_z & 0 & -t_x \\ -t_y & t_x & 0 \end{pmatrix}.
$$

$E$ is the **essential matrix** (Longuet-Higgins, 1981). In pixel coordinates the same constraint reads

$$
\tilde{\mathbf x}_2^\top F\, \tilde{\mathbf x}_1 = 0,
\qquad
F = K_2^{-\top} E\, K_1^{-1},
$$

with $F$ the **fundamental matrix**. $F\tilde{\mathbf x}_1$ is the epipolar line in image 2, $F^\top \tilde{\mathbf x}_2$ the line in image 1, and the epipoles are the null vectors $F\mathbf e_1 = 0$, $F^\top \mathbf e_2 = 0$.

Useful facts:

- $F$ has rank 2 and 7 degrees of freedom (9 entries, minus scale, minus $\det F = 0$).
- $E$ has 5 degrees of freedom (3 rotation + 2 for the direction of $\mathbf t$: the scale of the translation is **not observable** from two images). Its two non-zero singular values are equal: $\mathrm{svd}(E) = (\sigma, \sigma, 0)$.

### 2.2 The (normalized) eight-point algorithm

Each correspondence gives one linear equation in the 9 entries of $F$. Writing $\tilde{\mathbf x}_1 = (u_1, v_1, 1)$ and $\tilde{\mathbf x}_2 = (u_2, v_2, 1)$,

$$
\tilde{\mathbf x}_2^\top F \tilde{\mathbf x}_1 = (\tilde{\mathbf x}_2 \otimes \tilde{\mathbf x}_1)^\top \operatorname{vec}(F) = 0,
$$

so stacking $N \ge 8$ correspondences gives $A\,\operatorname{vec}(F) = \mathbf 0$ with $A \in \mathbb R^{N\times 9}$. The least-squares solution with $\lVert \operatorname{vec}(F)\rVert = 1$ is the right singular vector of $A$ with the smallest singular value. Then we enforce rank 2 by zeroing the smallest singular value of $F$.

Applied naively to pixel coordinates this is badly conditioned: entries of $A$ range from 1 to $10^5$. Hartley (1997) showed that simply translating and scaling each image's points so their centroid is at the origin and their mean distance is $\sqrt 2$ makes the linear algorithm competitive with iterative methods. Solve for $\hat F$ in normalized coordinates, then undo: $F = T_2^\top \hat F T_1$.

```python
def normalize(pts):
    """Hartley normalization: centroid to origin, mean distance sqrt(2)."""
    c = pts.mean(0)
    s = np.sqrt(2) / np.linalg.norm(pts - c, axis=1).mean()
    T = np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])
    ph = np.c_[pts, np.ones(len(pts))] @ T.T
    return ph, T

def eight_point(x1, x2):
    """Fundamental matrix with x2^T F x1 = 0 from N >= 8 correspondences (Nx2 pixels)."""
    p1, T1 = normalize(x1)
    p2, T2 = normalize(x2)
    # each row is kron(p2, p1) so that A @ vec(F) = p2^T F p1
    A = np.einsum("ni,nj->nij", p2, p1).reshape(-1, 9)
    F = np.linalg.svd(A)[2][-1].reshape(3, 3)
    U, S, Vt = np.linalg.svd(F)              # enforce rank 2
    F = U @ np.diag([S[0], S[1], 0]) @ Vt
    F = T2.T @ F @ T1                        # undo the normalization
    return F / np.linalg.norm(F)

noise = rng.normal(scale=0.5, size=x1.shape)                # 0.5 px of noise
F = eight_point(x1 + noise, x2)
h1, h2 = np.c_[x1, np.ones(len(x1))], np.c_[x2, np.ones(len(x2))]
Fx1, Ftx2 = h1 @ F.T, h2 @ F
sampson = np.sum(h2 * Fx1, 1) ** 2 / (Fx1[:, 0]**2 + Fx1[:, 1]**2 + Ftx2[:, 0]**2 + Ftx2[:, 1]**2)
print("mean Sampson distance (px):", np.sqrt(sampson).mean())   # ~0.05 px
```

The **Sampson distance** printed at the end is a first-order approximation of the geometric distance of a correspondence to the epipolar constraint and is the standard residual used inside RANSAC.

In practice correspondences come from feature matching (SIFT, or learned matchers such as SuperPoint + LightGlue) and contain many outliers, so $F$ or $E$ is estimated inside **RANSAC**: repeatedly fit a model to a minimal random sample, count inliers by Sampson distance, keep the best. With known intrinsics one uses the minimal **five-point** solver for $E$ (Nistér, TPAMI 2004) because fewer points per sample means exponentially fewer RANSAC iterations.

### 2.3 Recovering the pose from $E$

With $E = K_2^\top F K_1$ and the SVD $E = U\,\mathrm{diag}(1,1,0)\,V^\top$, there are four candidate poses:

$$
R \in \{U W V^\top,\; U W^\top V^\top\},\quad \mathbf t \in \{+\mathbf u_3, -\mathbf u_3\},\qquad
W = \begin{pmatrix} 0 & -1 & 0 \\ 1 & 0 & 0 \\ 0 & 0 & 1 \end{pmatrix},
$$

where $\mathbf u_3$ is the last column of $U$ (signs of $U$, $V$ are fixed so that both have determinant $+1$). Only one candidate places the triangulated points in front of both cameras (the **cheirality** check), so we triangulate with each and count. This is what `cv2.recoverPose` does.

## 3. Triangulation

Given two (or more) projection matrices $P_i$ and observations $\mathbf x_i = (u_i, v_i)$, the **direct linear transform (DLT)** uses the fact that $\tilde{\mathbf x}_i \times P_i \tilde{\mathbf X} = \mathbf 0$. Writing $\mathbf p_i^{k\top}$ for the $k$-th row of $P_i$, each view contributes two independent equations:

$$
\begin{pmatrix}
u_1 \mathbf p_1^{3\top} - \mathbf p_1^{1\top} \\
v_1 \mathbf p_1^{3\top} - \mathbf p_1^{2\top} \\
u_2 \mathbf p_2^{3\top} - \mathbf p_2^{1\top} \\
v_2 \mathbf p_2^{3\top} - \mathbf p_2^{2\top}
\end{pmatrix} \tilde{\mathbf X} = \mathbf 0 .
$$

Again, take the smallest right singular vector and dehomogenize. The DLT minimizes an algebraic error; the statistically optimal answer minimizes reprojection error, which is what bundle adjustment will do anyway. Triangulation is ill-conditioned when the **triangulation angle** between the two rays is small: a tiny pixel error then moves the point far along the ray. COLMAP therefore only accepts points with a minimum angle (1.5 degrees by default) and rejects those with large reprojection error.

```python
def triangulate(P1, P2, x1, x2):
    """Linear (DLT) triangulation. P1, P2: 3x4 projection matrices; x1, x2: Nx2 pixels."""
    Xs = []
    for (u1, v1), (u2, v2) in zip(x1, x2):
        A = np.stack([u1 * P1[2] - P1[0], v1 * P1[2] - P1[1],
                      u2 * P2[2] - P2[0], v2 * P2[2] - P2[1]])
        Xh = np.linalg.svd(A)[2][-1]
        Xs.append(Xh[:3] / Xh[3])
    return np.array(Xs)

def pose_from_essential(E, K, x1, x2):
    """Pick the (R, t) among the four decompositions of E that puts points in front of both cameras."""
    U, _, Vt = np.linalg.svd(E)
    if np.linalg.det(U) < 0: U = -U
    if np.linalg.det(Vt) < 0: Vt = -Vt
    Wm = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]])
    P1 = K @ np.c_[np.eye(3), np.zeros(3)]
    best = None
    for R in (U @ Wm @ Vt, U @ Wm.T @ Vt):
        for t in (U[:, 2], -U[:, 2]):
            P2 = K @ np.c_[R, t]
            Xt = triangulate(P1, P2, x1, x2)
            n_front = ((Xt[:, 2] > 0) & ((Xt @ R.T + t)[:, 2] > 0)).sum()
            if best is None or n_front > best[0]:
                best = (n_front, R, t, Xt)
    return best[1:]

E = K.T @ F @ K
R, t, Xt = pose_from_essential(E, K, x1, x2)
R_true = R2 @ R1.T                       # ground-truth relative pose camera 1 -> camera 2
t_true = t2 - R_true @ t1
cos = np.clip((np.trace(R.T @ R_true) - 1) / 2, -1, 1)
print("rotation error (deg):", np.rad2deg(np.arccos(cos)))                 # ~0.16
print("translation direction cos:", t @ t_true / np.linalg.norm(t_true))   # ~0.9999
# Xt is in camera-1 coordinates with |t| = 1: compare after fixing the unknown scale
print("3D error:", np.abs(Xt * np.linalg.norm(t_true) - (X @ R1.T + t1)).mean())
```

With half a pixel of noise we recover the relative rotation to a fraction of a degree and the structure **up to a global scale**. This scale ambiguity is fundamental: any SfM reconstruction from images alone is only defined up to a similarity transform (rotation, translation, scale; 7 degrees of freedom), the so-called **gauge freedom**. That is why COLMAP models come in arbitrary units and why NeRF/3DGS code normalizes the scene (for instance 3DGS computes a "camera extent" from the spread of camera centres to set its learning rates and densification thresholds).

## 4. Bundle adjustment

Two-view geometry gives a starting point; **bundle adjustment (BA)** refines all cameras and points jointly by minimizing the total reprojection error:

$$
\min_{\{K_i, R_i, \mathbf t_i\},\,\{\mathbf X_j\}}
\sum_{(i,j)\in\mathcal O} \rho\!\left( \big\lVert \pi(K_i, R_i, \mathbf t_i, \mathbf X_j) - \mathbf x_{ij} \big\rVert^2 \right),
$$

where $\mathcal O$ is the set of observations (point $j$ seen in image $i$), $\pi$ is the projection (with distortion), and $\rho$ is a robust loss such as Huber or Cauchy that down-weights outliers. The name refers to adjusting the "bundles" of rays leaving each camera until they meet at the points.

BA is a nonlinear least-squares problem solved with **Gauss–Newton** or **Levenberg–Marquardt (LM)**. At each step LM solves

$$
(J^\top J + \mu D)\,\delta = -J^\top \mathbf r ,
$$

with Jacobian $J$, residuals $\mathbf r$ and damping $\mu$. The key to scaling BA to thousands of images is **sparsity**: each residual depends on one camera and one point only. Ordering the unknowns as (cameras, points), the normal matrix has a block structure

$$
\begin{pmatrix} B & C \\ C^\top & P \end{pmatrix}\begin{pmatrix} \delta_c \\ \delta_p\end{pmatrix} = \begin{pmatrix} \mathbf g_c \\ \mathbf g_p \end{pmatrix},
$$

where $P$ is block-diagonal with $3\times 3$ blocks (one per point). Eliminating the points with the **Schur complement** leaves a much smaller "reduced camera system" $(B - C P^{-1} C^\top)\,\delta_c = \mathbf g_c - C P^{-1}\mathbf g_p$, after which each point is updated independently. Libraries such as Ceres Solver (used by COLMAP) implement this together with robust losses and automatic differentiation; see Triggs et al., "Bundle Adjustment — A Modern Synthesis" (1999) for the full story.

A tiny BA with SciPy, refining our two-view reconstruction (cameras as axis-angle + translation):

```python
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix

def rodrigues(r):
    """Axis-angle (3,) -> rotation matrix."""
    th = np.linalg.norm(r)
    if th < 1e-12: return np.eye(3)
    k = r / th
    Kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + np.sin(th) * Kx + (1 - np.cos(th)) * Kx @ Kx

def axis_angle(R):
    th = np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1))
    if th < 1e-12: return np.zeros(3)
    return th / (2 * np.sin(th)) * np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])

def ba_residuals(params, n_cams, n_pts, cam_idx, pt_idx, obs, K):
    cams = params[:n_cams * 6].reshape(n_cams, 6)            # [axis-angle | t] per camera
    pts = params[n_cams * 6:].reshape(n_pts, 3)
    res = np.empty((len(obs), 2))
    for c in range(n_cams):
        m = cam_idx == c
        uv, _ = project(K, rodrigues(cams[c, :3]), cams[c, 3:], pts[pt_idx[m]])
        res[m] = uv - obs[m]
    return res.ravel()

def ba_sparsity(n_cams, n_pts, cam_idx, pt_idx):
    """Each residual touches 6 camera parameters and 3 point coordinates."""
    A = lil_matrix((2 * len(cam_idx), 6 * n_cams + 3 * n_pts), dtype=int)
    i = np.arange(len(cam_idx))
    for k in range(6):
        A[2 * i, 6 * cam_idx + k] = 1; A[2 * i + 1, 6 * cam_idx + k] = 1
    for k in range(3):
        A[2 * i, 6 * n_cams + 3 * pt_idx + k] = 1; A[2 * i + 1, 6 * n_cams + 3 * pt_idx + k] = 1
    return A

obs = np.r_[x1 + noise, x2]                                   # the same noisy observations
cam_idx = np.r_[np.zeros(len(X), int), np.ones(len(X), int)]
pt_idx = np.r_[np.arange(len(X)), np.arange(len(X))]
x0 = np.r_[np.zeros(6), axis_angle(R), t, Xt.ravel()]          # camera 1 = identity
args = (2, len(X), cam_idx, pt_idx, obs, K)
print("RMS before:", np.sqrt(np.mean(ba_residuals(x0, *args) ** 2)))   # ~0.47 px
sol = least_squares(ba_residuals, x0, jac_sparsity=ba_sparsity(2, len(X), cam_idx, pt_idx),
                    x_scale="jac", method="trf", loss="linear", args=args)
print("RMS after: ", np.sqrt(np.mean(sol.fun ** 2)))                   # ~0.16 px
```

The residual drops from about 0.47 px (the DLT/eight-point solution) to about 0.16 px. Real systems fix the gauge (e.g. hold the first camera and the scale fixed) to make the problem well-posed; here the trust-region solver simply moves along the flat directions harmlessly.

## 5. Structure-from-Motion and COLMAP

**Structure-from-Motion** recovers camera poses (motion) and a sparse point cloud (structure) from an unordered image collection. Early large-scale systems such as Photo Tourism (Snavely et al., SIGGRAPH 2006) reconstructed landmarks from internet photos; **COLMAP** (Schönberger & Frahm, "Structure-from-Motion Revisited", CVPR 2016) is the open-source incremental SfM system that became the default for neural rendering datasets.

### 5.1 The incremental pipeline

1. **Feature extraction.** Detect keypoints and descriptors in every image (COLMAP uses SIFT on the GPU), and read or guess intrinsics from EXIF.
2. **Matching.** Exhaustive matching for small sets, sequential matching for video, vocabulary-tree retrieval for large collections.
3. **Geometric verification.** Estimate $F$, $E$ or a homography with RANSAC per image pair and keep only inlier matches. The result is the **scene graph**: images as nodes, verified pairs as edges.
4. **Initialization.** Choose a well-connected pair with a wide baseline, recover the relative pose from $E$ and triangulate.
5. **Image registration.** Repeatedly pick the **next best view** (an unregistered image that sees many already-triangulated points, with a good spatial distribution of those points in the image) and estimate its pose from 2D–3D correspondences with **PnP** (Perspective-n-Point) inside RANSAC.
6. **Triangulation.** Triangulate new points seen by the newly registered image, with COLMAP's robust multi-view triangulation.
7. **Bundle adjustment.** Run local BA after each registration and global BA whenever the model has grown substantially, then filter observations with large reprojection error and re-triangulate.

The CVPR 2016 paper's contributions are exactly about making steps 3 and 5–7 robust and complete: a geometric verification strategy that classifies pair geometry (e.g. detecting pure rotation or watermark-like matches), the next-best-view score, robust triangulation, and an iterative BA / re-triangulation / filtering loop.

An alternative is **global SfM**, which first estimates all rotations and then all positions at once rather than adding images one by one. GLOMAP (Pan et al., ECCV 2024) revisits it and reports accuracy on par with COLMAP while running much faster, and it reads COLMAP's database directly, so it can drop into the same workflow.

### 5.2 What COLMAP gives you

A sparse model consists of three files (binary `.bin` or text `.txt`):

- `cameras.txt`: one line per camera model, e.g. `1 PINHOLE 1600 1200 1450.2 1450.2 800 600` (`CAMERA_ID MODEL WIDTH HEIGHT PARAMS[]`).
- `images.txt`: per image, the world-to-camera pose `QW QX QY QZ TX TY TZ`, the camera id and the file name, followed by a line of 2D keypoints with the id of the 3D point they observe.
- `points3D.txt`: per point, its position, colour, reprojection error and its **track** (which images and keypoints observe it).

NeRF loaders turn `images.txt` into camera-to-world matrices; 3DGS additionally reads `points3D` and creates one Gaussian per sparse point. A quick sanity check you should always do: the **mean reprojection error** reported by COLMAP should be below about 1 px, and almost all your images should be registered in a single model.

## 6. Multi-view stereo

SfM points are sparse, only where distinctive features exist. **Multi-view stereo (MVS)** densifies the reconstruction given the now-known cameras. The classic formulation estimates a **depth map** per reference image by searching, for each pixel, the depth (and often normal) that maximizes photo-consistency with neighbouring views, then fuses all depth maps into a dense point cloud and optionally a mesh (e.g. Poisson surface reconstruction).

- **Plane sweeping** tests a set of fronto-parallel depth planes: warp the source images onto each plane via the homography $H = K_s (R - \mathbf t \mathbf n^\top / d) K_r^{-1}$ and compare patches (NCC).
- **PatchMatch stereo** propagates good depth/normal hypotheses between neighbouring pixels with random refinement, which is far cheaper than exhaustive search. COLMAP's MVS (Schönberger et al., "Pixelwise View Selection for Unstructured Multi-View Stereo", ECCV 2016) adds per-pixel source-view selection and geometric consistency so it works on unstructured photo collections.
- **Learned MVS** such as MVSNet (Yao et al., ECCV 2018) builds a cost volume by differentiable homography warping of CNN features and regularizes it with 3D convolutions.

Why does a neural rendering series care? Because NeRF and 3DGS can be seen as **MVS with a differentiable renderer**: instead of matching patches, they optimize a volumetric representation so that rendering reproduces every image. MVS depth is also widely used as a geometric prior or initialization for both.

### 6.1 Feed-forward geometry

Since 2024, networks that regress geometry directly from images have changed this landscape. DUSt3R (Wang et al., CVPR 2024) predicts per-pixel **pointmaps** for an image pair without known intrinsics; MASt3R (Leroy et al., ECCV 2024) adds dense matching features on top; VGGT (Wang et al., CVPR 2025) predicts cameras, depth maps, pointmaps and tracks for many views in a single forward pass. These are increasingly used to pose sparse or casual captures where COLMAP fails, and they connect directly to the feed-forward 3DGS methods in post 5.

## Try it

The Gaussian World demo in the [interactive lab]({{ '/' | relative_url }}#lab) uses exactly the projection model of section 1 to place every Gaussian on screen: view matrix, perspective divide and a focal length derived from the field of view. When you walk around in first person you are changing $R$ and $\mathbf t$; post 4 explains how the same Jacobian of this projection turns 3D Gaussians into 2D ellipses.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| A computer algorithm for reconstructing a scene from two projections (Longuet-Higgins) | Nature | 1981 | — | Introduces the essential matrix and the eight-point idea |
| In Defense of the Eight-Point Algorithm (Hartley) | TPAMI | 1997 | — | Coordinate normalization makes the linear method accurate |
| A Flexible New Technique for Camera Calibration (Zhang) | TPAMI | 2000 | [DOI](https://doi.org/10.1109/34.888718) | Checkerboard calibration used by OpenCV |
| Bundle Adjustment — A Modern Synthesis (Triggs et al.) | Vision Algorithms Workshop (LNCS) | 1999 | — | The reference on sparse nonlinear least squares for BA |
| An Efficient Solution to the Five-Point Relative Pose Problem (Nistér) | TPAMI | 2004 | — | Minimal solver for $E$ used inside RANSAC |
| Photo Tourism: Exploring Photo Collections in 3D (Snavely et al.) | SIGGRAPH | 2006 | — | Internet-scale SfM, ancestor of modern pipelines |
| Structure-from-Motion Revisited (Schönberger & Frahm) | CVPR | 2016 | [CVF](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) | COLMAP SfM; the default pose source for NeRF/3DGS |
| Pixelwise View Selection for Unstructured Multi-View Stereo (Schönberger et al.) | ECCV | 2016 | [DOI](https://doi.org/10.1007/978-3-319-46487-9_31) | COLMAP's PatchMatch MVS |
| MVSNet: Depth Inference for Unstructured Multi-view Stereo (Yao et al.) | ECCV | 2018 | [arXiv](https://arxiv.org/abs/1804.02505) | Learned cost-volume MVS |
| DUSt3R: Geometric 3D Vision Made Easy (Wang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.14132) | Pose-free pointmap regression |
| Grounding Image Matching in 3D with MASt3R (Leroy et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2406.09756) | Dense matching on top of DUSt3R |
| Global Structure-from-Motion Revisited (GLOMAP, Pan et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2407.20219) | Fast global SfM, COLMAP-compatible |
| VGGT: Visual Geometry Grounded Transformer (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2503.11651) | Feed-forward cameras + depth + points for many views |

## Learning resources

- R. Hartley and A. Zisserman, *Multiple View Geometry in Computer Vision*, 2nd ed., Cambridge University Press, 2004. The reference for everything in sections 1–4.
- R. Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed., free online at [szeliski.org/Book](https://szeliski.org/Book/) (chapters on image formation, SfM and depth estimation).
- Stanford [CS231A: Computer Vision, From 3D Perception to 3D Reconstruction and Beyond](https://web.stanford.edu/class/cs231a/): course notes on camera models, epipolar geometry and SfM.
- [COLMAP documentation](https://colmap.github.io/) and [source](https://github.com/colmap/colmap), including the output format and the camera models; [GLOMAP](https://github.com/colmap/glomap).
- [Ceres Solver](http://ceres-solver.org/) tutorials on bundle adjustment.
- OpenCV's camera calibration and `calib3d` module documentation (`calibrateCamera`, `findEssentialMat`, `recoverPose`, `triangulatePoints`).

## Exercises

1. Show that $E = [\mathbf t]\_\times R$ has singular values $(\lVert\mathbf t\rVert, \lVert\mathbf t\rVert, 0)$. Hint: $[\mathbf t]\_\times$ has singular values $(\lVert\mathbf t\rVert, \lVert\mathbf t\rVert, 0)$ and $R$ is orthogonal.
2. Remove the Hartley normalization from `eight_point` and plot the Sampson error versus pixel noise. How much worse does it get?
3. Add radial distortion ($k_1 = -0.2$) to the synthetic images, run the pipeline without modelling it, and observe how the reconstructed points bend. Then add $k_1$ as a parameter in the bundle adjustment.
4. Extend `triangulate` to $N$ views and compute the triangulation angle per point; reject points below 1.5°.
5. Run COLMAP on 30–50 photos of an object on a table and inspect `cameras.txt`, `images.txt` and the reprojection error in the GUI.

**Next:** with calibrated cameras in hand, [post 2]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) turns images into a neural radiance field with differentiable volume rendering.
