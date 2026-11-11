---
layout: post
title: "Camera calibration: homographies, Zhang's method and how far to trust the result"
date: 2026-10-27 11:02:00+0900
description: "Estimate a camera's intrinsics and lens distortion from a checkerboard: plane homographies and the normalized DLT, Zhang's closed form, Levenberg-Marquardt refinement, reprojection error and parameter uncertainty, calibration targets and subpixel corners, stereo rectification, hand-eye AX = XB and camera-IMU calibration, with NumPy and OpenCV code on synthetic data."
categories: 3d-vision
tags: [camera-calibration, homography, dlt, zhang-method, levenberg-marquardt, uncertainty, stereo-rectification, hand-eye, kalibr]
series: 3d-vision
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## Why this matters

[Post 01]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }}) wrote down the camera model: a pinhole $P = K[R \mid \mathbf t]$ plus a distortion polynomial. Every number in that model was given. In practice nobody hands you $f_x$ or $k_1$. A lens has a nominal focal length, but the effective focal length in pixels depends on the focus setting, the exact sensor position and manufacturing tolerances. The principal point can sit tens of pixels away from the image centre, and the distortion of a cheap wide-angle lens can move corner pixels by 30 px or more.

**Calibration** measures these numbers. It is the first experiment in almost every 3D vision project: SfM, SLAM, stereo depth, AR registration, robot grasping. An error here spreads to everything downstream. A focal length that is 1% too long scales every depth estimated from a moving camera by about 1%. An uncorrected distortion bends straight lines, which breaks epipolar geometry. This post builds the standard pipeline from scratch, runs it on synthetic data where we know the truth, checks it against OpenCV, and then asks the question that tutorials usually skip: *how much should you trust the result, and where in the image?*

## Prerequisites

- Post 01 of this series: homogeneous coordinates, $K$, $[R \mid \mathbf t]$, the Brown-Conrady model and undistortion by fixed-point iteration.
- Linear least squares and the SVD: the solution of $\min \lVert A\mathbf h\rVert$ subject to $\lVert\mathbf h\rVert = 1$ is the right singular vector of the smallest singular value.
- Gradients and Jacobians; a little probability (Gaussian noise, covariance).
- Python with NumPy and SciPy. Sections 4 to 8 also cross-check with OpenCV (`pip install opencv-python`; the numbers below come from OpenCV 4.10). All snippets form **one script**: run them in order and every printed number matches the text.

## 1. The calibration problem

### 1.1 What we estimate, and from what

We use the camera model of post 01 with OpenCV's default five distortion coefficients. A 3D point $\mathbf X_c = (X_c, Y_c, Z_c)$ in the camera frame (OpenCV convention: $x$ right, $y$ down, $z$ forward) has normalized coordinates $x = X_c/Z_c$, $y = Y_c/Z_c$. With $r^2 = x^2 + y^2$, the lens moves them to

$$
\begin{aligned}
x_d &= x\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + 2p_1 xy + p_2 (r^2 + 2x^2),\\
y_d &= y\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + p_1 (r^2 + 2y^2) + 2p_2 xy,
\end{aligned}
$$

and the pixel is $u = f_x x_d + c_x$, $v = f_y y_d + c_y$. The **intrinsic parameters** are therefore $\boldsymbol\theta = (f_x, f_y, c_x, c_y, k_1, k_2, p_1, p_2, k_3)$, nine numbers. We assume zero skew, which holds for practically every modern sensor.

We cannot measure $\boldsymbol\theta$ directly. What we *can* do is show the camera an object whose geometry we know exactly, detect points on it in the image, and ask which $\boldsymbol\theta$ explains what we see. A printed **planar target**, typically a checkerboard, is the cheapest such object: we know the position of every corner on the board to a fraction of a millimetre, and corners are easy to detect with subpixel accuracy.

There is one catch. We also do not know where the board was in each photo. Every image $i$ adds a board pose $(R_i, \mathbf t_i)$, six more unknowns. With $N$ images of a board with $n$ corners we have

$$
\underbrace{9}_{\boldsymbol\theta} + \underbrace{6N}_{\text{poses}} \text{ unknowns}, \qquad 2nN \text{ measurements } (u, v).
$$

For our board ($n = 54$) and $N = 12$ images that is 81 unknowns and 1296 measurements, comfortably overdetermined. But the problem is nonlinear (rotations, the perspective division, the distortion polynomial), so we cannot solve it in one step. The classical recipe, due to Zhang (2000), has three stages:

1. For each image, estimate the **homography** from the board plane to the image (linear, section 2).
2. From the homographies, get $K$ and the poses in **closed form**, ignoring distortion (linear, section 3).
3. Refine everything, distortion included, by **nonlinear least squares** on the reprojection error (section 4).

Then comes the part that makes the result usable: **checking** it (section 5).

### 1.2 A synthetic dataset

To be able to check every step against the truth, we simulate the experiment. The camera has a $640\times 480$ sensor, $f_x = 600$, $f_y = 596$ (slightly non-square pixels), a principal point $(322, 236)$ that is off-centre by a few pixels, and the barrel distortion of post 01 ($k_1 = -0.28$, $k_2 = 0.07$) plus a small tangential term. The board has $9\times 6$ inner corners with 30 mm squares. We place it in twelve poses: three frontal (one close, one far), four tilted by 35° about one axis, four pushed into the image corners and one rolled by 40°. Real corner detectors are accurate to a few tenths of a pixel, so we add Gaussian noise with $\sigma = 0.3$ px.

```python
import numpy as np

W, H = 640, 480
K_true = np.array([[600.0, 0.0, 322.0],
                   [0.0, 596.0, 236.0],
                   [0.0, 0.0, 1.0]])
dist_true = np.array([-0.28, 0.07, 0.0008, -0.0005, 0.0])   # k1, k2, p1, p2, k3 (OpenCV order)

# planar target: 9 x 6 inner corners, 30 mm squares, on the plane Z = 0 of the board frame
sq = 0.03
ii, jj = np.meshgrid(np.arange(6), np.arange(9), indexing="ij")
obj = np.stack([jj.ravel() * sq, ii.ravel() * sq, np.zeros(54)], axis=1)   # 54 x 3, metres

def rodrigues(r):
    """Axis-angle vector (3,) -> rotation matrix."""
    th = np.linalg.norm(r)
    if th < 1e-12:
        return np.eye(3)
    k = r / th
    Kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + np.sin(th) * Kx + (1 - np.cos(th)) * Kx @ Kx

def project(K, dist, R, t, X):
    """Board points X (N x 3) -> pixels (N x 2): pinhole + Brown-Conrady distortion."""
    Xc = X @ R.T + t
    x, y = Xc[:, 0] / Xc[:, 2], Xc[:, 1] / Xc[:, 2]
    k1, k2, p1, p2, k3 = dist
    r2 = x * x + y * y
    rad = 1 + k1 * r2 + k2 * r2**2 + k3 * r2**3
    xd = x * rad + 2 * p1 * x * y + p2 * (r2 + 2 * x * x)
    yd = y * rad + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y
    return np.stack([K[0, 0] * xd + K[0, 1] * yd + K[0, 2], K[1, 1] * yd + K[1, 2]], axis=1)

def board_pose(tilt_x, tilt_y, roll, centre):
    """Board-to-camera (R, t): rotate the board about its centre, then move the centre to `centre`."""
    d = np.deg2rad
    R = rodrigues([0, 0, d(roll)]) @ rodrigues([d(tilt_x), 0, 0]) @ rodrigues([0, d(tilt_y), 0])
    return R, np.asarray(centre, float) - R @ obj.mean(axis=0)

# twelve poses: (tilt about x, tilt about y, roll) in degrees, board centre in camera coordinates (m)
POSES = [(0, 0, 0, (0, 0, 0.55)), (0, 0, 0, (0, 0, 0.40)), (0, 0, 20, (0.06, 0.05, 0.80)),
         (0, 35, 0, (0, 0, 0.55)), (0, -35, 0, (0, 0, 0.55)), (35, 0, 0, (0, 0, 0.55)),
         (-35, 0, 0, (0, 0, 0.55)), (20, -25, 10, (-0.16, -0.115, 0.60)),
         (20, 25, -10, (0.16, -0.115, 0.60)), (-20, -25, -10, (-0.16, 0.115, 0.60)),
         (-20, 25, 10, (0.16, 0.115, 0.60)), (25, 20, 40, (0, 0, 0.50))]
views = [board_pose(*p) for p in POSES]

rng = np.random.default_rng(0)
sigma = 0.3                                         # corner-detection noise (px)
obs = [project(K_true, dist_true, R, t, obj) + rng.normal(0, sigma, (54, 2)) for R, t in views]
uv = np.concatenate(obs)
print(f"{len(uv)} corners, u in [{uv[:, 0].min():.0f}, {uv[:, 0].max():.0f}], "
      f"v in [{uv[:, 1].min():.0f}, {uv[:, 1].max():.0f}]")
```

```text
648 corners, u in [47, 596], v in [45, 427]
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-setup.svg" caption="The synthetic experiment. Left: the camera frustum at $\mathbf C$ and the twelve board poses in the camera frame (drawn with $z$ into the page and $-y$ up). Right: the 648 noisy corners in the image, coloured by view, with each board's outline. Views 1 to 3 are frontal, 4 to 7 tilted by 35° about $y$ or $x$, 8 to 11 sit in the image corners and 12 is rolled by 40°. The corners cover $u \in [47, 596]$, $v \in [45, 427]$: almost, but not quite, the whole image." %}

## 2. Homographies and the DLT

### 2.1 Why a plane gives a homography

Put the board frame on the board, so every corner has $Z = 0$ and board coordinates $(X, Y, 0)$. Write the rotation by its columns, $R = [\mathbf r_1\ \mathbf r_2\ \mathbf r_3]$. The projection of a corner (ignoring distortion for now) is

$$
s \begin{pmatrix} u \\ v \\ 1 \end{pmatrix}
= K \begin{pmatrix} \mathbf r_1 & \mathbf r_2 & \mathbf r_3 & \mathbf t \end{pmatrix}
\begin{pmatrix} X \\ Y \\ 0 \\ 1 \end{pmatrix}
= \underbrace{K \begin{pmatrix} \mathbf r_1 & \mathbf r_2 & \mathbf t \end{pmatrix}}_{H}
\begin{pmatrix} X \\ Y \\ 1 \end{pmatrix}.
$$

The third column of $R$ multiplies $Z = 0$ and drops out. What is left is a $3\times 3$ matrix $H$ that maps homogeneous board coordinates to homogeneous pixels: a **homography** (projective transformation of the plane, post 01 section 1.5). $H$ is defined only up to scale (the factor $s$ is the depth), so it has 8 degrees of freedom. It maps lines to lines, which is why a photographed checkerboard still has straight rows and columns, as long as the lens has no distortion.

This equation is the heart of plane-based calibration. $H$ can be measured from the image alone, and it contains $K$, $\mathbf r_1$, $\mathbf r_2$ and $\mathbf t$ multiplied together. Section 3 pulls them apart.

### 2.2 The direct linear transform (DLT)

Write $\tilde{\mathbf x} = (u, v, 1)^\top$ and $\tilde{\mathbf X} = (X, Y, 1)^\top$, and let $\mathbf h_1^\top, \mathbf h_2^\top, \mathbf h_3^\top$ be the **rows** of $H$. "Equal up to scale" means $\tilde{\mathbf x} \times H\tilde{\mathbf X} = \mathbf 0$. The third row of $H\tilde{\mathbf X}$ is $\mathbf h_3^\top\tilde{\mathbf X}$, so dividing out gives

$$
u = \frac{\mathbf h_1^\top \tilde{\mathbf X}}{\mathbf h_3^\top \tilde{\mathbf X}}, \quad
v = \frac{\mathbf h_2^\top \tilde{\mathbf X}}{\mathbf h_3^\top \tilde{\mathbf X}}
\quad\Longrightarrow\quad
\begin{aligned}
\mathbf h_1^\top \tilde{\mathbf X} - u\, \mathbf h_3^\top \tilde{\mathbf X} &= 0,\\
\mathbf h_2^\top \tilde{\mathbf X} - v\, \mathbf h_3^\top \tilde{\mathbf X} &= 0.
\end{aligned}
$$

Both equations are **linear** in the nine entries $\mathbf h = (h_{11}, h_{12}, \dots, h_{33})$. Each correspondence gives two rows of a matrix $A$:

$$
\begin{pmatrix}
X & Y & 1 & 0 & 0 & 0 & -uX & -uY & -u \\
0 & 0 & 0 & X & Y & 1 & -vX & -vY & -v
\end{pmatrix} \mathbf h = \mathbf 0 .
$$

With $n \ge 4$ points (no three collinear) we stack them into $A\mathbf h = \mathbf 0$, a $2n\times 9$ system. With noise there is no exact solution, so we minimize the **algebraic error** $\lVert A\mathbf h\rVert$ subject to $\lVert\mathbf h\rVert = 1$ (to exclude $\mathbf h = \mathbf 0$). The minimizer is the right singular vector of $A$ with the smallest singular value. That is the whole algorithm: build $A$, take one SVD.

### 2.3 Normalization

The entries of $A$ have wildly different sizes: board coordinates are about 0.1 m, pixels about 300, and products like $uX$ mix them. The algebraic error then weights the equations very unevenly, and the result depends on the arbitrary choice of units and origin. Hartley's fix (1997) is a **similarity transform** on each side: move the centroid of the points to the origin and scale them so that the mean distance from it is $\sqrt 2$. With $T_1$ for the board and $T_2$ for the image we solve for $\hat H$ between the normalized points and undo it at the end:

$$
\hat{\mathbf x} = T_2\tilde{\mathbf x},\quad \hat{\mathbf X} = T_1\tilde{\mathbf X},\quad \hat{\mathbf x} \simeq \hat H \hat{\mathbf X}
\quad\Longrightarrow\quad H = T_2^{-1}\hat H\,T_1 .
$$

```python
def normalizing_transform(p):
    """Similarity T that moves the centroid to 0 and makes the mean distance sqrt(2)."""
    c = p.mean(axis=0)
    d = np.linalg.norm(p - c, axis=1).mean()
    k = np.sqrt(2) / d
    return np.array([[k, 0, -k * c[0]], [0, k, -k * c[1]], [0, 0, 1]])

def homography_dlt(X, x, normalize=True):
    """H (3 x 3, H[2,2] = 1) with x ~ H X, from N >= 4 plane points X (N x 2) and pixels x (N x 2)."""
    T1 = normalizing_transform(X) if normalize else np.eye(3)
    T2 = normalizing_transform(x) if normalize else np.eye(3)
    Xh = np.c_[X, np.ones(len(X))] @ T1.T
    xh = np.c_[x, np.ones(len(x))] @ T2.T
    A = []
    for (X_, Y_, _), (u, v, _) in zip(Xh, xh):
        A.append([X_, Y_, 1, 0, 0, 0, -u * X_, -u * Y_, -u])
        A.append([0, 0, 0, X_, Y_, 1, -v * X_, -v * Y_, -v])
    A = np.array(A)
    _, S, Vt = np.linalg.svd(A)
    Hn = Vt[-1].reshape(3, 3)                    # right singular vector of the smallest singular value
    Hm = np.linalg.inv(T2) @ Hn @ T1             # undo the normalization
    return Hm / Hm[2, 2], S

Hs = [homography_dlt(obj[:, :2], o)[0] for o in obs]
H0 = Hs[0]
pred = np.c_[obj[:, :2], np.ones(54)] @ H0.T
pred = pred[:, :2] / pred[:, 2:]
print("H for view 1:\n", np.array2string(H0, precision=2, suppress_small=True))
print("rms transfer error of view 1: %.2f px" % np.sqrt(((pred - obs[0]) ** 2).sum(1).mean()))
_, S_raw = homography_dlt(obj[:, :2], obs[0], normalize=False)
_, S_nrm = homography_dlt(obj[:, :2], obs[0], normalize=True)
print("condition number s1/s8: raw %.1e, normalized %.1e" % (S_raw[0] / S_raw[-2], S_nrm[0] / S_nrm[-2]))
```

```text
H for view 1:
 [[1077.98   -0.84  192.66]
 [   0.07 1071.88  155.63]
 [   0.     -0.      1.  ]]
rms transfer error of view 1: 0.62 px
condition number s1/s8: raw 3.3e+04, normalized 3.5e+00
```

**A worked check.** View 1 is frontal: $R = I$ and $\mathbf t = (-0.12, -0.075, 0.55)$ m (the board's first corner is 12 cm left of and 7.5 cm above the optical axis, 55 cm away). Then $H = K[\mathbf e_1\ \mathbf e_2\ \mathbf t]$, and after dividing by $t_z = 0.55$:

$$
H = \begin{pmatrix} f_x/t_z & 0 & (f_x t_x + c_x t_z)/t_z \\ 0 & f_y/t_z & (f_y t_y + c_y t_z)/t_z \\ 0 & 0 & 1\end{pmatrix}
= \begin{pmatrix} 1090.9 & 0 & 191.1 \\ 0 & 1083.6 & 154.7 \\ 0 & 0 & 1 \end{pmatrix}.
$$

The estimate has the right structure, but its diagonal is about 1.2% smaller. Nothing is wrong with the DLT: barrel distortion pulls the outer corners towards the centre, so the board *looks* smaller, and a homography (which maps lines to lines) cannot represent the bending. The figure below shows this systematic misfit in the most distorted view. It is our first warning that a distortion-free closed form will be biased.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-homography.svg" caption="A homography maps the board plane (left, in mm, $Z=0$) to the image. Right: view 8 (top-left corner of the image) without noise, the grid mapped by the best-fitting $H$ (orange, straight lines by construction) and the residuals between the true distorted corners (purple) and $H$'s prediction, magnified 20 times. The misfit is systematic, not random: RMS 0.78 px, at most 2.06 px. A homography cannot bend lines; the distortion terms of section 4 can." width="95%" %}

What does normalization buy? The left panel of the next figure shows the singular values of $A$ for view 1: without normalization they span six orders of magnitude, and the ratio $s_1/s_8$ (largest to the second smallest; $s_9$ is the "null" direction we are after) is $3.3\times 10^4$ instead of 3.5. The right panel runs the DLT on 300 noisy, distortion-free boards per noise level. Here the honest answer is: with 54 well-spread points and double precision, the effect on accuracy is small, a few percent, growing to 14% (board in metres) and 20% (board in millimetres) at $\sigma = 3$ px. Normalization costs nothing, makes the result independent of your choice of units, and matters much more where the coordinates enter quadratically (the fundamental matrix of post 04) or with few points. Always do it.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-normalization.svg" caption="Left: the nine singular values of the $108\times 9$ DLT matrix $A$ of view 1, without (red) and with (blue) Hartley normalization. Right: RMS error $e_H$ of the estimated homography against the true one (distortion-free boards, mean over 300 trials) versus the corner noise $\sigma$. Normalized: 0.381 px at $\sigma=1$, 1.142 px at $\sigma=3$; unnormalized with the board in metres 1.306 px and in millimetres 1.369 px at $\sigma=3$. The dashed line $\sigma\sqrt{8/54}$ is the error expected from fitting 8 parameters to 54 points." %}

## 3. Zhang's closed-form solution

### 3.1 Two constraints per image

Now the key idea. Write $H = [\mathbf h_1\ \mathbf h_2\ \mathbf h_3]$ by **columns**. Since $H = \lambda K[\mathbf r_1\ \mathbf r_2\ \mathbf t]$ for some unknown scale $\lambda$,

$$
\mathbf r_1 = \tfrac{1}{\lambda} K^{-1}\mathbf h_1, \qquad \mathbf r_2 = \tfrac{1}{\lambda} K^{-1}\mathbf h_2 .
$$

We know nothing about the pose, except that $\mathbf r_1$ and $\mathbf r_2$ are two columns of a rotation matrix: **orthogonal** and of **equal (unit) length**. Substituting,

$$
\mathbf r_1^\top \mathbf r_2 = 0 \;\Rightarrow\; \mathbf h_1^\top B\, \mathbf h_2 = 0, \qquad
\mathbf r_1^\top \mathbf r_1 = \mathbf r_2^\top \mathbf r_2 \;\Rightarrow\; \mathbf h_1^\top B\, \mathbf h_1 - \mathbf h_2^\top B\, \mathbf h_2 = 0,
\qquad B = K^{-\top}K^{-1}.
$$

The pose has disappeared. Every image gives two equations in the entries of one symmetric matrix $B$ that depends only on the intrinsics. (Geometrically, $B$ is the **image of the absolute conic**, the same object behind calibration from vanishing points in post 01 section 1.6: two orthogonal vanishing directions $\mathbf v_1, \mathbf v_2$ satisfy $\mathbf v_1^\top B\,\mathbf v_2 = 0$. Here $\mathbf h_1$ and $\mathbf h_2$ *are* the vanishing points of the board's $X$ and $Y$ axes.)

### 3.2 A linear system for $B$

$B$ is symmetric, so it has six distinct entries, $\mathbf b = (B_{11}, B_{12}, B_{22}, B_{13}, B_{23}, B_{33})$. Expanding $\mathbf h_i^\top B\,\mathbf h_j$ gives a dot product $\mathbf v_{ij}^\top \mathbf b$ with

$$
\mathbf v_{ij} = \big(h_{1i}h_{1j},\; h_{1i}h_{2j} + h_{2i}h_{1j},\; h_{2i}h_{2j},\; h_{3i}h_{1j} + h_{1i}h_{3j},\; h_{3i}h_{2j} + h_{2i}h_{3j},\; h_{3i}h_{3j}\big)^\top,
$$

where $h_{ki}$ is entry $k$ of column $i$. The two constraints of image $i$ become two rows of a matrix $V$:

$$
\begin{pmatrix} \mathbf v_{12}^\top \\ (\mathbf v_{11} - \mathbf v_{22})^\top \end{pmatrix} \mathbf b = \mathbf 0
\quad\text{for every image}\quad\Longrightarrow\quad V\mathbf b = \mathbf 0 .
$$

$\mathbf b$ is again the right singular vector of the smallest singular value. **Counting:** $\mathbf b$ has 6 entries up to scale, 5 degrees of freedom (the 5 entries of $K$ including skew). Each image gives 2 equations, so we need **at least 3 images**, or 2 if we also impose zero skew.

### 3.3 From $B$ back to $K$ and the poses

$B = K^{-\top}K^{-1}$ (up to scale) is symmetric positive definite, and $K^{-1}$ is upper triangular. A Cholesky factorization $B = LL^\top$ with lower-triangular $L$ therefore gives $L^\top \propto K^{-1}$, so $K \propto (L^\top)^{-1}$; we divide by $K_{33}$. (Zhang's paper writes out the same result as explicit formulas.) The sign of $\mathbf b$ is arbitrary; we flip it if needed so that $B$ is positive definite.

With $K$ known, each pose follows from its homography: $\lambda = 1/\lVert K^{-1}\mathbf h_1\rVert$, $\mathbf r_1 = \lambda K^{-1}\mathbf h_1$, $\mathbf r_2 = \lambda K^{-1}\mathbf h_2$, $\mathbf r_3 = \mathbf r_1\times\mathbf r_2$, $\mathbf t = \lambda K^{-1}\mathbf h_3$. The sign of $\lambda$ is chosen so the board is in front of the camera ($t_z > 0$). With noise, $[\mathbf r_1\ \mathbf r_2\ \mathbf r_3]$ is not exactly a rotation, so we replace it by the nearest one, $UV^\top$ from its SVD $U\Sigma V^\top$.

```python
def v_ij(H, i, j):
    """Row vector with h_i^T B h_j = v_ij . b for b = (B11, B12, B22, B13, B23, B33)."""
    a, c = H[:, i], H[:, j]
    return np.array([a[0] * c[0], a[0] * c[1] + a[1] * c[0], a[1] * c[1],
                     a[2] * c[0] + a[0] * c[2], a[2] * c[1] + a[1] * c[2], a[2] * c[2]])

def zhang_intrinsics(Hs):
    """Closed-form K from >= 3 plane homographies (Zhang 2000)."""
    V = np.array([row for H in Hs for row in (v_ij(H, 0, 1), v_ij(H, 0, 0) - v_ij(H, 1, 1))])
    _, S, Vt = np.linalg.svd(V)
    b = Vt[-1]
    B = np.array([[b[0], b[1], b[3]], [b[1], b[2], b[4]], [b[3], b[4], b[5]]])
    if B[0, 0] < 0:                              # b is defined up to sign; B = K^-T K^-1 is pos. def.
        B = -B
    L = np.linalg.cholesky(B)                    # B = L L^T with L lower triangular, L^T ~ K^-1
    K = np.linalg.inv(L.T)
    return K / K[2, 2], S

def zhang_extrinsics(K, H):
    """Board pose (R, t) from K and the homography H ~ K [r1 r2 t]."""
    M = np.linalg.inv(K) @ H
    lam = 1.0 / np.linalg.norm(M[:, 0])
    if M[2, 2] < 0:                              # the board must be in front of the camera (t_z > 0)
        lam = -lam
    r1, r2, t = lam * M[:, 0], lam * M[:, 1], lam * M[:, 2]
    U, _, Vt = np.linalg.svd(np.c_[r1, r2, np.cross(r1, r2)])
    return U @ Vt, t                             # nearest rotation matrix (Frobenius norm)

K0, S_V = zhang_intrinsics(Hs)
print("closed-form K:\n", np.array2string(K0, precision=1, suppress_small=True))
print("singular values of V (smallest two): %.2e %.2e" % (S_V[-2], S_V[-1]))
poses0 = [zhang_extrinsics(K0, H) for H in Hs]
```

```text
closed-form K:
 [[618.9  -0.8 327.2]
 [  0.  618.6 237.9]
 [  0.    0.    1. ]]
singular values of V (smallest two): 2.96e+03 2.99e-01
```

The closed form lands within a few percent: $f_x = 618.9$ instead of 600 (+3.2%), $f_y = 618.6$ instead of 596 (+3.8%), and a principal point a few pixels off. That is about as good as it gets while ignoring distortion. It is not the answer, but it is an excellent **starting point** for the nonlinear refinement, which is what it is for. The gap between the smallest singular value of $V$ (0.30) and the next (2960) says that $\mathbf b$ is well determined.

### 3.4 When the closed form fails: pose diversity

The constraints of section 3.1 only carry information if the boards are seen from **different orientations**. Translating the board, or rotating it about the optical axis, changes $\mathbf t$ and the in-plane rotation, but the pair of constraints it adds is (nearly) the same as before. Zhang's paper proves the extreme case: images of parallel planes add no independent constraints. Sturm and Maybank (1999) catalogue all such singular configurations.

There is a nice physical reason. For a board parallel to the image plane at depth $Z$, the image of a corner is $u = f_x X/Z + c_x$: only the ratio $f_x/Z$ is visible. Doubling $f$ and moving every board twice as far along the optical axis gives exactly the same images (with distortion, $k_1$ and $k_2$ rescale to compensate; exercise 2). Tilting the board breaks the tie, because then the near and the far parts of the board have different depths and perspective foreshortening reveals $f$ separately.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-views-and-tilt.svg" caption="Monte Carlo study of the closed form (distortion-free camera, $\sigma = 0.3$ px, 200 trials per point, median relative error of $f_x$). Left: boards with random 20-45° tilts; the error falls from 0.69% with $N=3$ views to 0.24% with $N=12$. Right: three boards tilted by the same angle $\theta$ about axes 120° apart. Nearly frontal boards are useless: 29.7% error at $\theta = 2°$ (where the closed form also fails outright in 2.5% of trials, gray bars), 4.6% at 5°, 1.4% at 10°. Between 30° and 70° the error is flat at about 0.3%." %}

The practical rules: tilt the board by 30-50° in several **different directions**, and do not waste images on frontal views at different distances. In the widget of section 5 you can select only the three frontal views and watch the method break.

## 4. Nonlinear refinement with distortion

### 4.1 Maximum likelihood is least squares on reprojection error

Let $\mathbf x_{ij}$ be the detected position of corner $j$ in image $i$, and $\pi(\boldsymbol\theta, R_i, \mathbf t_i, \mathbf X_j)$ the full camera model (pose, projection, distortion, $K$). If detection errors are independent Gaussians with standard deviation $\sigma$ in each coordinate, the likelihood of all detections is

$$
p(\{\mathbf x_{ij}\} \mid \boldsymbol\theta, \{R_i, \mathbf t_i\}) \propto \prod_{i,j} \exp\!\Big(-\frac{\lVert \pi(\boldsymbol\theta, R_i, \mathbf t_i, \mathbf X_j) - \mathbf x_{ij}\rVert^2}{2\sigma^2}\Big),
$$

and maximizing it is the same as minimizing the **sum of squared reprojection errors**

$$
E(\mathbf p) = \sum_{i=1}^N \sum_{j=1}^n \big\lVert \pi(\boldsymbol\theta, R_i, \mathbf t_i, \mathbf X_j) - \mathbf x_{ij} \big\rVert^2 = \lVert \mathbf r(\mathbf p)\rVert^2 ,
$$

where $\mathbf p$ stacks all unknowns and $\mathbf r(\mathbf p) \in \mathbb R^{2nN}$ stacks all residuals. This is the "gold standard" cost: it measures error in pixels, where the noise actually lives, unlike the algebraic error of the DLT.

**Parameterizing rotations.** A rotation matrix has 9 entries but 3 degrees of freedom. We store each rotation as an **axis-angle vector** $\boldsymbol\omega \in \mathbb R^3$ (direction = axis, length = angle) and convert with Rodrigues' formula $R = I + \sin\theta\,[\mathbf k]\_\times + (1-\cos\theta)[\mathbf k]\_\times^2$. OpenCV does the same (`rvec`). So $\mathbf p$ has $9 + 6N$ entries.

### 4.2 Gauss-Newton and Levenberg-Marquardt

Linearize the residual around the current estimate, $\mathbf r(\mathbf p + \boldsymbol\delta) \approx \mathbf r + J\boldsymbol\delta$ with the Jacobian $J = \partial\mathbf r/\partial\mathbf p$. Minimizing $\lVert\mathbf r + J\boldsymbol\delta\rVert^2$ over $\boldsymbol\delta$ is a linear least-squares problem; setting the gradient $2J^\top(\mathbf r + J\boldsymbol\delta)$ to zero gives the **normal equations** of the **Gauss-Newton** step:

$$
J^\top J\,\boldsymbol\delta = -J^\top \mathbf r .
$$

Gauss-Newton converges fast near the minimum but can overshoot far from it, where the linearization is poor. **Levenberg-Marquardt** (LM) adds a damping term,

$$
\big(J^\top J + \lambda\,\mathrm{diag}(J^\top J)\big)\,\boldsymbol\delta = -J^\top \mathbf r ,
$$

and adapts $\lambda$: if the step lowers the cost, accept it and decrease $\lambda$ (trust the quadratic model more, approach Gauss-Newton); if not, reject it and increase $\lambda$ (shorter steps, closer to scaled gradient descent). Marquardt's scaling by $\mathrm{diag}(J^\top J)$ makes the damping independent of each parameter's units, important when $f_x \approx 600$ and $k_2 \approx 0.07$ live in the same vector.

The code below is a complete, if slow, calibrator: closed-form initialization (distortion starts at zero), a forward-difference Jacobian and LM. Real implementations (OpenCV, Ceres) use analytic derivatives and exploit sparsity, but compute the same thing.

```python
def rvec_of(R):
    """Rotation matrix -> axis-angle vector (inverse of rodrigues for angles below pi)."""
    th = np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1))
    if th < 1e-12:
        return np.zeros(3)
    w = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    return th * w / (2 * np.sin(th))

def pack(K, dist, poses):
    """Parameter vector: fx, fy, cx, cy, k1, k2, p1, p2, k3, then (rvec, t) per view."""
    return np.r_[K[0, 0], K[1, 1], K[0, 2], K[1, 2], dist,
                 np.concatenate([np.r_[rvec_of(R), t] for R, t in poses])]

def unpack(p):
    K = np.array([[p[0], 0, p[2]], [0, p[1], p[3]], [0, 0, 1]])
    return K, p[4:9], [(rodrigues(q[:3]), q[3:]) for q in p[9:].reshape(-1, 6)]

def residuals(p, observations):
    K, dist, poses = unpack(p)
    return np.concatenate([(project(K, dist, R, t, obj) - o).ravel()
                           for (R, t), o in zip(poses, observations)])

def jacobian(f, p, r0, eps=1e-6):
    """Forward-difference Jacobian (fine here; real solvers use analytic derivatives)."""
    J = np.empty((len(r0), len(p)))
    for k in range(len(p)):
        dp = np.zeros_like(p)
        dp[k] = eps * max(1.0, abs(p[k]))
        J[:, k] = (f(p + dp) - r0) / dp[k]
    return J

def levenberg_marquardt(f, p, iters=100, lam=1e-3, tol=1e-12):
    r = f(p)
    log = [(r @ r, lam)]
    for _ in range(iters):
        J = jacobian(f, p, r)
        A, g = J.T @ J, J.T @ r
        while True:
            step = np.linalg.solve(A + lam * np.diag(np.diag(A)), -g)
            r_new = f(p + step)
            if r_new @ r_new < r @ r:             # accept: trust the Gauss-Newton model more
                break
            lam *= 4                              # reject: damp harder, towards gradient descent
            if lam > 1e10:                        # no step lowers the cost: we are at the minimum
                return p, jacobian(f, p, r), log
        converged = (r @ r - r_new @ r_new) < tol * (r @ r)
        p, r, lam = p + step, r_new, lam / 3
        log.append((r @ r, lam))
        if converged:
            break
    return p, jacobian(f, p, r), log

def calibrate(observations, fix_k3=False):
    """Zhang's closed form, then LM on intrinsics, distortion and poses (optionally with k3 = 0)."""
    Hs = [homography_dlt(obj[:, :2], o)[0] for o in observations]
    K0, _ = zhang_intrinsics(Hs)
    p0 = pack(K0, np.zeros(5), [zhang_extrinsics(K0, H) for H in Hs])
    free = np.ones(len(p0), bool)
    free[8] = not fix_k3

    def f(q):                                     # residuals as a function of the free parameters
        p = p0.copy()
        p[free] = q
        return residuals(p, observations)

    q, J, log = levenberg_marquardt(f, p0[free])
    p = p0.copy()
    p[free] = q
    return p, J, free, log

p_opt, J, free, log = calibrate(obs)
n_corners = sum(len(o) for o in obs)
for it in (0, 1, 2, 3, len(log) - 1):
    print("iteration %2d: rms %.4f px" % (it, np.sqrt(log[it][0] / n_corners)))
print("fx fy cx cy:", np.round(p_opt[:4], 2))
print("k1 k2 p1 p2 k3:", np.round(p_opt[4:9], 4))
```

```text
iteration  0: rms 4.0605 px
iteration  1: rms 2.7048 px
iteration  2: rms 0.4239 px
iteration  3: rms 0.4047 px
iteration 11: rms 0.4036 px
fx fy cx cy: [601.06 596.97 325.19 235.49]
k1 k2 p1 p2 k3: [-0.2806  0.0914  0.     -0.0005 -0.0526]
```

(The `fix_k3` option and the `free` mask let us hold $k_3 = 0$, which we will need in section 5.3.) From an initial RMS error of 4.06 px, two iterations bring it to 0.42 px, and after 11 it has converged at 0.4036 px. The estimates are now within 1-3 px of the truth for $K$, and $k_1 = -0.2806$ is within 0.3% of $-0.28$.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-lm.svg" caption="Left: the sparsity pattern of the $1296\times 81$ Jacobian at the solution (black = nonzero). The first 9 columns (intrinsics, left of the red line) touch every residual; $f_x$ and $c_x$ only touch $u$ rows and $f_y$, $c_y$ only $v$ rows, hence the stripes. Each 6-column pose block touches only the 108 residuals of its own view: a block-diagonal 'arrowhead'. Right: LM on our data. The RMS reprojection error drops from 4.06 px (closed form, no distortion) to 0.42 px in two iterations and settles at 0.4036 px, just below $\sqrt 2\,\sigma = 0.42$ (dotted); every step was accepted, so the damping $\lambda$ (orange, right axis) fell by a factor of 3 each iteration." %}

The Jacobian's arrowhead structure is worth remembering. With thousands of images the pose blocks dominate, and solvers eliminate them first with the **Schur complement**, leaving a small system for the shared parameters. This is exactly the trick that makes bundle adjustment feasible ([post 05]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})); calibration *is* a small bundle adjustment with a known 3D structure.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-residuals.svg" caption="Reprojection residuals of all 648 corners (arrow from the detected corner towards the model's prediction). (a) After the closed form, with no distortion model: a coherent radial pattern, RMS 4.06 px and up to 12.7 px in the corners of the image, magnified 8 times. (b) After LM with distortion: no structure left, RMS 0.40 px, magnified 100 times. Random-looking residuals are a necessary (not sufficient) sign of a good model; any remaining pattern means the model is missing something." %}

### 4.3 Cross-check with OpenCV

`cv2.calibrateCamera` implements the same pipeline (Zhang initialization, then LM). Given the same detections it must give the same answer:

```python
import cv2

obj_pts = [obj.astype(np.float32)] * len(obs)
img_pts = [o.astype(np.float32).reshape(-1, 1, 2) for o in obs]
rms, K_cv, d_cv, rvecs, tvecs, std_int, std_ext, per_view = cv2.calibrateCameraExtended(
    obj_pts, img_pts, (W, H), None, None)
print("OpenCV: rms %.4f px" % rms)
print("  fx fy cx cy:", np.round([K_cv[0, 0], K_cv[1, 1], K_cv[0, 2], K_cv[1, 2]], 2))
print("  k1 k2 p1 p2 k3:", np.round(d_cv.ravel(), 4))
print("  std of fx fy cx cy:", np.round(std_int.ravel()[:4], 3))
r = residuals(p_opt, obs)
print("ours:   rms %.4f px (same definition: sqrt(sum |e|^2 / #corners))" % np.sqrt(r @ r / n_corners))
```

```text
OpenCV: rms 0.4036 px
  fx fy cx cy: [601.06 596.97 325.19 235.49]
  k1 k2 p1 p2 k3: [-0.2806  0.0914  0.     -0.0005 -0.0526]
  std of fx fy cx cy: [1.897 1.877 2.363 1.959]
ours:   rms 0.4036 px (same definition: sqrt(sum |e|^2 / #corners))
```

Identical to every printed digit. Note OpenCV's definition of the returned "RMS": the square root of the summed squared error *per corner* (not per coordinate). The last line, the standard deviations, is the subject of the next section.

## 5. How good is the calibration?

### 5.1 What the RMS reprojection error does and does not tell you

Everyone reports the RMS error, and everyone is tempted to read "0.40 px" as "accurate to 0.4 px". It is neither the accuracy of the parameters nor of anything you will compute later. It is the size of what is left over **after** fitting, and its expected value is fixed by the noise:

$$
\mathbb E\big[\text{RMS}^2\big] = \frac{2\sigma^2 (2M - P)}{2M}, \qquad M = nN \text{ corners},\ P = 9 + 6N \text{ parameters}.
$$

(Each of the $2M$ coordinates has variance $\sigma^2$, and fitting $P$ parameters absorbs $P$ of those degrees of freedom.) For us $\sqrt{2\cdot 0.09\cdot 1215/1296} = 0.411$ px; we got 0.404. So a perfect calibration has RMS $\approx\sqrt 2\,\sigma$, *not* zero, and a bad one can have a low RMS too:

- With few images, extra parameters can fit the noise (over-fitting): RMS goes down, accuracy goes down.
- The RMS only measures the error where you had corners. If all boards were in the image centre, the corners of the image are pure extrapolation (section 5.3).
- A wrong model (e.g. too few distortion terms) shows up as RMS above $\sqrt 2\,\sigma$ *and* as structure in the residuals (figure above, panel a).

Turned around, the formula gives a noise estimate, $\hat\sigma^2 = \lVert\mathbf r\rVert^2/(2M - P)$, which we use next.

### 5.2 Parameter uncertainty: $\Sigma = \sigma^2 (J^\top J)^{-1}$

Near the solution $\hat{\mathbf p}$ the residual is linear in a perturbation: $\mathbf r(\hat{\mathbf p} + \boldsymbol\delta) \approx \hat{\mathbf r} + J\boldsymbol\delta$. Now ask how the estimate moves if the noise $\boldsymbol\varepsilon$ in the detections changes. The least-squares solution of the linearized problem is $\boldsymbol\delta = -(J^\top J)^{-1}J^\top\boldsymbol\varepsilon$. With $\mathrm{Cov}(\boldsymbol\varepsilon) = \sigma^2 I$,

$$
\Sigma_{\mathbf p} = \mathrm{Cov}(\boldsymbol\delta) = (J^\top J)^{-1}J^\top(\sigma^2 I)J(J^\top J)^{-1} = \sigma^2 (J^\top J)^{-1}.
$$

This is the covariance of the estimate under Gaussian noise (to first order). Its diagonal gives the standard deviation of every parameter; the off-diagonal terms say which parameters trade off against each other. You already have $J$ from the last LM iteration, so it is essentially free. In OpenCV it is `calibrateCameraExtended`'s `stdDeviationsIntrinsics`.

```python
def covariance(p, J, free, observations):
    """Linearized covariance sigma^2 (J^T J)^-1 of all parameters (zero rows for fixed ones)."""
    r = residuals(p, observations)
    sigma2 = r @ r / (J.shape[0] - J.shape[1])    # unbiased noise variance per coordinate
    Cov = np.zeros((len(p), len(p)))
    Cov[np.ix_(free, free)] = sigma2 * np.linalg.inv(J.T @ J)
    return Cov, np.sqrt(sigma2)

Cov, sigma_hat = covariance(p_opt, J, free, obs)
std = np.sqrt(np.diag(Cov))
truth = np.r_[K_true[0, 0], K_true[1, 1], K_true[0, 2], K_true[1, 2], dist_true]
print("sigma_hat = %.3f px (true %.1f)" % (sigma_hat, sigma))
for k, name in enumerate(["fx", "fy", "cx", "cy", "k1", "k2", "p1", "p2", "k3"]):
    print("%-2s %9.4f +- %.4f  (true %8.4f, error %+.1f sigma)"
          % (name, p_opt[k], std[k], truth[k], (p_opt[k] - truth[k]) / std[k]))
corr = Cov[:9, :9] / np.outer(std[:9], std[:9])
print("corr(fx, fy) = %.2f  corr(k1, k2) = %.2f  corr(k2, k3) = %.2f" % (corr[0, 1], corr[4, 5], corr[5, 8]))
```

```text
sigma_hat = 0.295 px (true 0.3)
fx  601.0563 +- 1.8972  (true 600.0000, error +0.6 sigma)
fy  596.9735 +- 1.8765  (true 596.0000, error +0.5 sigma)
cx  325.1882 +- 2.3631  (true 322.0000, error +1.3 sigma)
cy  235.4898 +- 1.9589  (true 236.0000, error -0.3 sigma)
k1   -0.2806 +- 0.0104  (true  -0.2800, error -0.1 sigma)
k2    0.0914 +- 0.0564  (true   0.0700, error +0.4 sigma)
p1    0.0000 +- 0.0003  (true   0.0008, error -2.3 sigma)
p2   -0.0005 +- 0.0003  (true  -0.0005, error -0.1 sigma)
k3   -0.0526 +- 0.0949  (true   0.0000, error -0.6 sigma)
corr(fx, fy) = 0.99  corr(k1, k2) = -0.95  corr(k2, k3) = -0.98
```

How to read this:

- Every estimate is where the covariance says it should be: errors of 0.1-1.3 standard deviations, and one of 2.3 ($p_1$). With nine parameters, one beyond $2\sigma$ happens about a third of the time ($1 - 0.954^9 \approx 0.35$).
- $f_x$ is known to $\pm 1.9$ px (0.3%) and the principal point to $\pm 2$ px. For twelve images of a small board this is typical. More corners per image, more images and lower noise shrink these numbers roughly as $1/\sqrt{\text{data}}$.
- $f_x$ and $f_y$ are 99% correlated: their *ratio* (the pixel aspect) is known much better than either. They move together with the board distances, the $f/Z$ ambiguity of section 3.4.
- $k_2$ and $k_3$ are $-98\%$ correlated: over the radii we observed, $k_2 r^4$ and $k_3 r^6$ look almost alike. The individual coefficients are poorly determined ($k_3 = -0.05 \pm 0.09$), even though the distortion *function* they describe is well determined inside the data.

Is the linear formula right? We can test it by brute force: redo the whole calibration 200 times with fresh noise and look at the spread.

```python
rng_mc = np.random.default_rng(1)
clean = [project(K_true, dist_true, R, t, obj) for R, t in views]
est = []
for trial in range(200):
    pts = [(c + rng_mc.normal(0, sigma, c.shape)).astype(np.float32).reshape(-1, 1, 2) for c in clean]
    _, Kt, dt, _, _ = cv2.calibrateCamera(obj_pts, pts, (W, H), None, None)
    est.append([Kt[0, 0], Kt[1, 1], Kt[0, 2], Kt[1, 2], *dt.ravel()[:5]])
est = np.array(est)
print("Monte Carlo std   fx fy cx cy:", np.round(est[:, :4].std(axis=0), 2))
print("predicted std     fx fy cx cy:", np.round(std[:4], 2))
print("Monte Carlo std   k1 k2 k3:", np.round(est[:, [4, 5, 8]].std(axis=0), 4))
print("predicted std     k1 k2 k3:", np.round(std[[4, 5, 8]], 4))
```

```text
Monte Carlo std   fx fy cx cy: [1.85 1.84 2.36 2.15]
predicted std     fx fy cx cy: [1.9  1.88 2.36 1.96]
Monte Carlo std   k1 k2 k3: [0.01   0.0546 0.0923]
predicted std     k1 k2 k3: [0.0104 0.0564 0.0949]
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-uncertainty.svg" caption="200 complete calibrations with fresh noise (gray dots), the truth (red star), our single estimate (orange diamond) and the 1$\sigma$ and 2$\sigma$ ellipses of $\sigma^2(J^\top J)^{-1}$ from that single run, centred on the truth. Left: $f_x$ against $f_y$, correlation 0.99 (Monte Carlo 0.989). Right: $k_2$ against $k_3$, correlation $-0.98$ (Monte Carlo $-0.978$). The prediction from one calibration matches the Monte Carlo spread to within about 10% for every parameter." %}

The predicted and the simulated spreads agree to within about 10%. So a single calibration can tell you its own uncertainty, as long as the model is right and the noise is roughly Gaussian and independent. (If the detector has systematic errors, or the board is not flat, the formula is optimistic.)

### 5.3 From parameters to pixels: where in the image can you trust the model?

Twelve standard deviations are hard to interpret, and correlations make them misleading: a large $\sigma_{k_3}$ is harmless if $k_2$ compensates. What we really want to know is: **if I take a pixel, turn it into a ray with my calibration and project the ray back, how wrong can the pixel be?** That is the *projection uncertainty*, the idea behind AprilCal (Richardson et al. 2013) and the `mrcal` toolkit.

For a pixel $\mathbf u$, undistort it to a normalized ray $\mathbf q$ with the estimated $\hat{\boldsymbol\theta}$. Now perturb the intrinsics: the reprojected pixel moves by $G\,\delta\boldsymbol\theta$ with $G = \partial\pi(\boldsymbol\theta, \mathbf q)/\partial\boldsymbol\theta$ (a $2\times 9$ matrix). Its covariance is $G\,\Sigma_{\boldsymbol\theta}\,G^\top$, with $\Sigma_{\boldsymbol\theta}$ the $9\times 9$ intrinsic block of $\Sigma_{\mathbf p}$.

One subtlety. A change of $c_x$ by 1 px moves *every* pixel by about 1 px, which looks like a large error, but it is almost exactly what a rotation of the camera by $1/f$ radians does. The camera's orientation is not fixed by the calibration anyway (it is only defined relative to the boards), and whatever you do next (estimate a pose, triangulate) will absorb such a rotation. So before measuring we remove, over the whole image, the part of the perturbation that a small rotation of all rays can explain (a least-squares projection). `mrcal` handles this coupling more carefully; this simpler version keeps the code short.

```python
def project_ray(theta, q):
    """Pixels of normalized rays q = (x, y) (N x 2) under intrinsics theta = (fx, fy, cx, cy, k1..k3)."""
    K = np.array([[theta[0], 0, theta[2]], [0, theta[1], theta[3]], [0, 0, 1]])
    return project(K, theta[4:9], np.eye(3), np.zeros(3), np.c_[q, np.ones(len(q))])

def undistort(theta, uv, iters=50):
    """Pixels -> normalized rays by fixed-point iteration (post 01, section 3.2); NaN if it diverges."""
    q = np.c_[(uv[:, 0] - theta[2]) / theta[0], (uv[:, 1] - theta[3]) / theta[1]]
    with np.errstate(all="ignore"):
        for _ in range(iters):
            d = project_ray(theta, q)
            q = q + np.c_[(uv[:, 0] - d[:, 0]) / theta[0], (uv[:, 1] - d[:, 1]) / theta[1]]
        bad = np.linalg.norm(project_ray(theta, q) - uv, axis=1) > 1e-3
    q[bad] = np.nan
    return q

def projection_std(theta, Cov9, uv, eps=1e-6):
    """Per-pixel RMS error (px) of re-projecting the rays of uv when theta ~ N(theta_hat, Cov9),
    after removing the part of the error that a small rotation of the whole camera explains."""
    q = undistort(theta, uv)
    ok = ~np.isnan(q[:, 0])
    q = q[ok]
    base = project_ray(theta, q)
    G = np.empty((len(q), 2, 9))                  # d pixel / d theta
    for k in range(9):
        dt = np.zeros(9)
        dt[k] = eps * max(1.0, abs(theta[k]))
        G[:, :, k] = (project_ray(theta + dt, q) - base) / dt[k]
    A = np.empty((len(q), 2, 3))                  # d pixel / d (small rotation of the rays)
    for k in range(3):
        w = np.zeros(3)
        w[k] = eps
        Xr = np.c_[q, np.ones(len(q))] @ rodrigues(w).T
        A[:, :, k] = (project_ray(theta, Xr[:, :2] / Xr[:, 2:]) - base) / eps
    G, A = G.reshape(-1, 9), A.reshape(-1, 3)
    G = G - A @ np.linalg.lstsq(A, G, rcond=None)[0]    # project out the rotation directions
    out = np.full(len(uv), np.nan)
    out[ok] = np.sqrt(np.einsum("nk,kl,nl->n", G, Cov9, G).reshape(-1, 2).sum(axis=1))
    return out

gu, gv = np.meshgrid(np.linspace(4, W - 4, 81), np.linspace(4, H - 4, 61))   # an 8 px grid
grid = np.c_[gu.ravel(), gv.ravel()]
centre, corner = 30 * 81 + 40, 0                  # indices of (320, 240) and (4, 4) in the grid
central = [0, 1, 2, 3, 4, 5, 6, 11]               # views 1-7 and 12 keep the board near the centre
for label, idx, fix in (("all 12 views", range(12), False), ("central views", central, False),
                        ("central, k3 = 0", central, True)):
    ob = [obs[i] for i in idx]
    p_s, J_s, free_s, _ = calibrate(ob, fix_k3=fix)
    Cov_s, _ = covariance(p_s, J_s, free_s, ob)
    m = projection_std(p_s[:9], Cov_s[:9, :9], grid)
    print("%-16s k3 = %+.2f +- %.2f   std at centre %.2f px, at corner %.2f px"
          % (label, p_s[8], np.sqrt(Cov_s[8, 8]), m[centre], m[corner]))
```

```text
all 12 views     k3 = -0.05 +- 0.09   std at centre 0.09 px, at corner 2.97 px
central views    k3 = -1.42 +- 4.50   std at centre 0.40 px, at corner nan px
central, k3 = 0  k3 = +0.00 +- 0.00   std at centre 0.23 px, at corner 13.51 px
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-projection-uncertainty.svg" caption="Projection uncertainty $\sigma_{\mathrm{proj}}$ (log colour scale, contours at 0.2 px and 1 px; dots: the corners used). (a) All twelve views: 0.09 px in the centre, under 1 px in most of the image, 3 px in the extreme corner (4, 4), which no board reached. (b) Only the eight central views (1-7 and 12; corners up to 208 px from the centre): $k_3 = -1.42 \pm 4.50$, and beyond the data the fitted polynomial folds back, so near the image corners (hatched) the model cannot even be inverted. (c) The same views with $k_3$ fixed to 0: the model stays valid, but 13.5 px of uncertainty in the corner. (d) The three maps along the diagonal from the centre to the corner." width="92%" %}

This is the most useful picture in the post. Inside the region covered by corners, all three calibrations are good. Outside it, the model is **extrapolating**, and the uncertainty grows like the high powers of $r$ in the distortion polynomial. Two lessons:

- **Cover the whole image with corners,** especially the corners and edges of the frame, where distortion is largest. The RMS error will not warn you if you don't: calibration (b) has an RMS of 0.414 px, almost the same as the 0.404 px of (a).
- **Do not estimate parameters your data cannot support.** With central views only, freeing $k_3$ produces a polynomial that folds inside the image. Fixing $k_3 = 0$ (OpenCV: `cv2.CALIB_FIX_K3`) is the usual remedy for normal lenses; the real cure is better coverage.

### 5.4 Try it: choose the board poses

The widget runs the complete pipeline of sections 2-5 in your browser on the same camera, board and twelve poses (with only the two radial coefficients $k_1, k_2$). Tap boards in the 3D view or the image to add or remove views, and watch the estimates, their standard deviations and the projection-uncertainty map respond. Things to try:

- Start from the default (view 1 plus the four tilted views 4-7), then add the corner views 8-11: the uncertainty in the image corners and $\sigma_{k_2}$ drop sharply.
- Select only the frontal views 1-3: the closed form fails, and $\sigma_{f_x}$ explodes to about a thousand pixels. This is the $f/Z$ ambiguity.
- Raise the noise: every $\sigma$ grows in proportion to $\sigma$, and the RMS follows $\sqrt 2\,\sigma$.

{% include widget.liquid name="3d-vision-calibration" height="760" caption="Calibration lab. Board numbers match the post's twelve poses. The table shows the true value, the estimate $\pm 1\sigma$ from $\sigma^2(J^\top J)^{-1}$, and a bar for $\sigma$ on a log scale (red when large). The map behind the image is the projection uncertainty of section 5.3 (log scale 0.05 to 10 px; gray where the fitted model folds)." %}

## 6. Calibration targets and corner detection

### 6.1 Checkerboard corners and subpixel refinement

A checkerboard corner is an **X-junction**: four squares meet, and the intensity is a saddle (bright-dark-bright-dark around the point). Detectors such as `cv2.findChessboardCorners` (or the more robust `findChessboardCornersSB`) find the board and give corner positions to about a pixel. The accuracy that makes calibration work comes from **subpixel refinement**.

The idea behind `cv2.cornerSubPix` is a neat geometric fact. Let $\mathbf p$ be the true corner and $\mathbf q$ any pixel near it. If $\mathbf q$ lies inside a uniform square, its image gradient $\mathbf g_{\mathbf q}$ is zero. If $\mathbf q$ lies on an edge between two squares, the gradient is perpendicular to the edge, and the edge passes through $\mathbf p$, so $\mathbf q - \mathbf p$ lies *along* the edge. Either way

$$
\mathbf g_{\mathbf q}^\top(\mathbf q - \mathbf p) = 0 \quad \text{for every } \mathbf q \text{ near the corner}.
$$

Summing the squares of these over a window $W$ and setting the derivative with respect to $\mathbf p$ to zero gives a $2\times 2$ linear system,

$$
\Big(\sum_{\mathbf q\in W} \mathbf g_{\mathbf q}\mathbf g_{\mathbf q}^\top\Big)\,\mathbf p = \sum_{\mathbf q\in W} \mathbf g_{\mathbf q}\mathbf g_{\mathbf q}^\top\,\mathbf q ,
$$

which we solve, re-centre the window on the new $\mathbf p$ and repeat. The matrix on the left is the structure tensor of the Harris detector, which we will meet in [post 03]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}); at a corner it is well conditioned because gradients point in two directions.

```python
from scipy.ndimage import gaussian_filter, sobel

def render_corner(c, a1, a2, n=31, ss=8, blur=1.0, noise=0.02, seed=3):
    """n x n image of a checkerboard X-junction at subpixel position c; edges at angles a1, a2 (rad).
    Each pixel integrates ss x ss samples; then optical blur and sensor noise."""
    g = (np.arange(n * ss) + 0.5) / ss - 0.5                 # sample positions, pixel centres at 0..n-1
    X, Y = np.meshgrid(g, g)
    s1 = np.sign(-np.sin(a1) * (X - c[0]) + np.cos(a1) * (Y - c[1]))
    s2 = np.sign(-np.sin(a2) * (X - c[0]) + np.cos(a2) * (Y - c[1]))
    img = 0.5 + 0.4 * s1 * s2                                 # dark 0.1, bright 0.9
    img = img.reshape(n, ss, n, ss).mean(axis=(1, 3))
    img = gaussian_filter(img, blur)
    return img + np.random.default_rng(seed).normal(0, noise, img.shape)

def saddle_pixel(img):
    """Integer corner: the most negative Hessian determinant (an X-junction is a saddle)."""
    sm = gaussian_filter(img, 1.5)
    Iyy, Ixx = np.gradient(np.gradient(sm, axis=0), axis=0), np.gradient(np.gradient(sm, axis=1), axis=1)
    Ixy = np.gradient(np.gradient(sm, axis=0), axis=1)
    det = Ixx * Iyy - Ixy**2
    det[:4], det[-4:], det[:, :4], det[:, -4:] = 0, 0, 0, 0
    y, x = np.unravel_index(np.argmin(det), det.shape)
    return np.array([x, y], float)

def refine_corner(img, p, half=5, iters=10):
    """Subpixel corner: every gradient near the corner is orthogonal to (q - p), so
    sum_q g g^T (q - p) = 0 -> solve the 2 x 2 system for p and repeat (cv2.cornerSubPix's idea)."""
    gx, gy = sobel(img, axis=1) / 8, sobel(img, axis=0) / 8
    track = [p.copy()]
    for _ in range(iters):
        xi, yi = int(round(p[0])), int(round(p[1]))
        ys, xs = np.mgrid[yi - half:yi + half + 1, xi - half:xi + half + 1]
        w = np.exp(-((xs - p[0])**2 + (ys - p[1])**2) / (2 * (half / 2)**2))
        Gx, Gy = gx[ys, xs] * w, gy[ys, xs] * w
        A = np.array([[(Gx * gx[ys, xs]).sum(), (Gx * gy[ys, xs]).sum()],
                      [(Gy * gx[ys, xs]).sum(), (Gy * gy[ys, xs]).sum()]])
        bvec = np.array([(Gx * gx[ys, xs] * xs + Gx * gy[ys, xs] * ys).sum(),
                         (Gy * gx[ys, xs] * xs + Gy * gy[ys, xs] * ys).sum()])
        p = np.linalg.solve(A, bvec)
        track.append(p.copy())
    return p, np.array(track)

c_true = np.array([15.37, 14.62])
img = render_corner(c_true, np.deg2rad(20), np.deg2rad(115))
p_int = saddle_pixel(img)
p_sub, track = refine_corner(img, p_int)
print("true %s  integer %s (error %.2f px)  refined %s (error %.3f px)" % (
    c_true, p_int, np.linalg.norm(p_int - c_true), np.round(p_sub, 3), np.linalg.norm(p_sub - c_true)))
cv_sub = cv2.cornerSubPix(img.astype(np.float32), p_int.astype(np.float32).reshape(1, 1, 2), (5, 5), (-1, -1),
                          (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 1e-4)).ravel()
print("cv2.cornerSubPix %s (error %.3f px)" % (np.round(cv_sub, 3), np.linalg.norm(cv_sub - c_true)))
```

```text
true [15.37 14.62]  integer [15. 15.] (error 0.53 px)  refined [15.373 14.668] (error 0.048 px)
cv2.cornerSubPix [15.398 14.644] (error 0.037 px)
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-subpixel.svg" caption="Subpixel refinement on a rendered corner (edges at 20° and 115°, 8×8 supersampling per pixel, 1 px optical blur, 2% noise). Left: the image, the gradients in the window (blue arrows, perpendicular to the edges), the true corner $\mathbf p^\ast=(15.37, 14.62)$, the integer saddle detection $\mathbf p_0$ and the refinement path to $\mathbf p_{10}$. Right: the error falls from 0.53 px to 0.048 px in about four iterations; OpenCV's `cornerSubPix` reaches 0.037 px on the same image." %}

### 6.2 Which target?

| Target | How it is detected | Strengths | Weaknesses |
| --- | --- | --- | --- |
| Checkerboard | X-junction corners, subpixel by gradients | Most accurate corners; universal support | The whole board must be visible (corners are not identifiable individually); a symmetric board ($n_x$, $n_y$ both odd or both even) has an orientation ambiguity |
| Circle grid | Blob centroids | Robust to blur | The centroid of a projected circle is *not* the projected centre (perspective and distortion bias it; Heikkilä and Silvén 1997 correct for this) |
| ChArUco | Checkerboard with ArUco markers in the white squares | Each corner has an ID: partial views and occlusions are fine, so you can fill the image corners | Needs good print quality; markers must be large enough to decode |
| AprilGrid (Kalibr) | Grid of AprilTags; tag corners as points | Unique IDs, robust detection, the default target of Kalibr | Corners are tag corners, slightly less precise than X-junctions |

Since only identifiable corners can be partially visible, **ChArUco** is the best default for single-camera calibration today: it lets you push the board into the image corners, which section 5.3 showed to matter most. Whatever you use, print it on a rigid, **flat** substrate (glass, aluminium composite) and **measure** the square size with calipers rather than trusting the printer: a 1% scale error on the board does not change $K$ (it is absorbed by the board distances), but every metric quantity you compute from the calibration (stereo baseline, hand-eye translation) inherits it.

## 7. Stereo calibration and rectification

### 7.1 Calibrating two cameras together

A stereo rig is two cameras with a fixed relative pose: a point with coordinates $\mathbf X_1$ in camera 1 has coordinates $\mathbf X_2 = R\mathbf X_1 + \mathbf t$ in camera 2. If both cameras see the board in image $i$, with board poses $(R_{1i}, \mathbf t_{1i})$ and $(R_{2i}, \mathbf t_{2i})$, then for every board point

$$
\mathbf X_2 = R_{2i}\mathbf X_b + \mathbf t_{2i} = R(R_{1i}\mathbf X_b + \mathbf t_{1i}) + \mathbf t
\;\Longrightarrow\;
R = R_{2i}R_{1i}^\top,\quad \mathbf t = \mathbf t_{2i} - R\,\mathbf t_{1i}.
$$

Each image gives an estimate; averaging them initializes a joint LM over both cameras' intrinsics, $(R, \mathbf t)$, and one board pose per image (the second camera's board pose is now *derived*, which ties the two cameras together). That is `cv2.stereoCalibrate`. Our second camera sits 12 cm to the right, toed in by 8°, with slightly different intrinsics and lens.

```python
# a second camera 12 cm to the right, toed in by 8 degrees (about y), with 2 degrees of tilt and 4 of roll
K2_true = np.array([[605.0, 0, 318.0], [0, 601.0, 242.0], [0, 0, 1]])
dist2_true = np.array([-0.26, 0.06, 0.0, 0.0, 0.0])
R_s = rodrigues(np.deg2rad([2.0, 8.0, 4.0]))            # camera-1 coordinates -> camera-2 coordinates
t_s = -R_s @ np.array([0.12, 0.0, 0.0])                  # camera-2 centre at (0.12, 0, 0) in camera 1
rng2 = np.random.default_rng(2)
both, obs_l, obs_r = [], [], []
for i, (R, t) in enumerate(views):
    uv2 = project(K2_true, dist2_true, R_s @ R, R_s @ t + t_s, obj)
    if (uv2 > 5).all() and (uv2[:, 0] < W - 5).all() and (uv2[:, 1] < H - 5).all():
        both.append(i)
        obs_l.append(obs[i])
        obs_r.append(uv2 + rng2.normal(0, sigma, uv2.shape))
print("views seen by both cameras:", [i + 1 for i in both])

f32 = lambda pts: [p.astype(np.float32).reshape(-1, 1, 2) for p in pts]
objs = [obj.astype(np.float32)] * len(both)
_, K1c, d1c, _, _ = cv2.calibrateCamera(objs, f32(obs_l), (W, H), None, None)
_, K2c, d2c, _, _ = cv2.calibrateCamera(objs, f32(obs_r), (W, H), None, None)
for name, flag in (("intrinsics fixed", cv2.CALIB_FIX_INTRINSIC), ("joint", cv2.CALIB_USE_INTRINSIC_GUESS)):
    rms_s, K1s, d1s, K2s, d2s, R_est, T_est, E, F = cv2.stereoCalibrate(
        objs, f32(obs_l), f32(obs_r), K1c.copy(), d1c.copy(), K2c.copy(), d2c.copy(), (W, H), flags=flag)
    ang = np.rad2deg(np.linalg.norm(cv2.Rodrigues(R_est @ R_s.T)[0]))
    print("%-16s rms %.3f px, rotation error %.2f deg, baseline %.2f mm (true 120)"
          % (name, rms_s, ang, 1000 * np.linalg.norm(T_est)))

R1, R2, P1, P2, Q, _, _ = cv2.stereoRectify(K1s, d1s, K2s, d2s, (W, H), R_est, T_est, alpha=0)
yl = cv2.undistortPoints(f32([obs_l[0]])[0], K1s, d1s, R=R1, P=P1).reshape(-1, 2)
yr = cv2.undistortPoints(f32([obs_r[0]])[0], K2s, d2s, R=R2, P=P2).reshape(-1, 2)
print("first shared view: mean |v_l - v_r| before %.2f px, after rectification %.3f px"
      % (np.abs(obs_l[0][:, 1] - obs_r[0][:, 1]).mean(), np.abs(yl[:, 1] - yr[:, 1]).mean()))
print("rectified baseline from P2: %.2f mm" % (-1000 * P2[0, 3] / P2[0, 0]))
```

```text
views seen by both cameras: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
intrinsics fixed rms 0.426 px, rotation error 0.76 deg, baseline 119.77 mm (true 120)
joint            rms 0.415 px, rotation error 0.07 deg, baseline 120.04 mm (true 120)
first shared view: mean |v_l - v_r| before 20.69 px, after rectification 0.326 px
rectified baseline from P2: 120.04 mm
```

Look at the rotation error: 0.76° when each camera's intrinsics are calibrated separately and then frozen, 0.07° when everything is refined jointly. The reason is a coupling you saw in section 5.3: an error in a principal point looks like a small rotation of that camera. With frozen intrinsics, the relative rotation has to absorb both cameras' principal-point errors; jointly, the shared observations pin them down. For stereo depth this matters a lot: a 0.76° error in the relative yaw shifts the disparity by $f\cdot 0.0133 \approx 8$ px at every pixel.

### 7.2 Rectification

Stereo matching ([post 04]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})) is much simpler if corresponding points lie on the **same image row**. Rectification makes this true by rotating both cameras *virtually* (no new images are taken, only a resampling) so that they look in the same direction, their image planes coincide, and the $x$ axes are parallel to the baseline. Following Fusiello, Trucco and Verri (2000), in camera-1 coordinates:

$$
\mathbf e_1 = \frac{\mathbf C_2}{\lVert\mathbf C_2\rVert},\quad
\mathbf e_2 = \frac{\mathbf z\times\mathbf e_1}{\lVert\mathbf z\times\mathbf e_1\rVert},\quad
\mathbf e_3 = \mathbf e_1\times\mathbf e_2,\qquad
R_{\text{rect}} = \begin{pmatrix}\mathbf e_1^\top\\ \mathbf e_2^\top\\ \mathbf e_3^\top\end{pmatrix},
$$

where $\mathbf C_2 = -R^\top\mathbf t$ is the second camera's centre and $\mathbf z = (0,0,1)$ the old optical axis. Camera 1 is rotated by $R_{\text{rect}}$, camera 2 by $R_{\text{rect}}R^\top$, and both get the same new intrinsic matrix $K_n$. A pixel is mapped by undistorting it to a ray, rotating the ray and projecting with $K_n$; for undistorted images this is the homography $K_n R_{\text{rect},i} K_i^{-1}$. `cv2.stereoRectify` returns these rotations and the new projection matrices; `cv2.initUndistortRectifyMap` turns them into a lookup table for `cv2.remap`.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-rectification.svg" caption="Rectification of view 12, computed with our NumPy calibration (stereo pose from the averaged per-view poses: rotation error 0.74°, baseline 119.40 mm). (a) Left and (b) right raw images; the curves in (b) are the epipolar curves of the four outer corners of the left image (the left ray of each corner projected into the right camera). They are slanted, and slightly curved by the lens distortion. (c), (d) After rectification each corresponding pair lies on one horizontal line: the mean vertical offset drops from 20.71 px to 0.40 px, the size of the detection noise." %}

## 8. Hand-eye calibration: $AX = XB$

A camera on a robot arm is useful only if we know where it sits relative to the gripper: the fixed transform $X = T_{gc}$ (camera pose in the gripper frame). It cannot be measured with a ruler; it has to be calibrated. Move the arm to $n$ stations; at each one, the robot reports the gripper pose $T_{bg,i}$ in its base frame $\lbrace b\rbrace$, and the camera sees a fixed target and reports the target pose $T_{ct,i}$ (from PnP on the board, post 05). The target does not move, so for any two stations $i$ and $j$

$$
T_{bg,i}\,X\,T_{ct,i} = T_{bt} = T_{bg,j}\,X\,T_{ct,j}
\;\Longrightarrow\;
\underbrace{T_{bg,j}^{-1}T_{bg,i}}_{A}\;X = X\;\underbrace{T_{ct,j}\,T_{ct,i}^{-1}}_{B}.
$$

$A$ is the gripper's motion between the stations, $B$ the camera's motion, and $X$ relates them. Split it into rotation and translation:

$$
R_A R_X = R_X R_B, \qquad (R_A - I)\,\mathbf t_X = R_X \mathbf t_B - \mathbf t_A .
$$

**Rotation (Park and Martin 1994).** $R_A = R_X R_B R_X^\top$ says $R_A$ and $R_B$ are the same rotation seen in two frames, so their axis-angle vectors are related by $\boldsymbol\alpha = R_X\boldsymbol\beta$ (with $\boldsymbol\alpha = \log R_A$, $\boldsymbol\beta = \log R_B$). With several motions, $R_X$ is the rotation that best aligns the $\boldsymbol\beta$'s with the $\boldsymbol\alpha$'s, an orthogonal Procrustes problem solved by one SVD. **Translation.** With $R_X$ known, the second equation is linear in $\mathbf t_X$: stack it for all motions and solve by least squares.

```python
def se3(R, t):
    T = np.eye(4)
    T[:3, :3], T[:3, 3] = R, t
    return T

def log_so3(R):
    return rvec_of(R)                                     # the axis-angle vector is the SO(3) logarithm

def hand_eye_park_martin(As, Bs):
    """Solve A_i X = X B_i (4 x 4 rigid motions) for X: rotation by Park & Martin (1994), then translation."""
    alpha = np.array([log_so3(A[:3, :3]) for A in As])  # rotation axes * angles of the gripper motions
    beta = np.array([log_so3(B[:3, :3]) for B in Bs])   # ... and of the camera motions; alpha_i = R_X beta_i
    U, _, Vt = np.linalg.svd(beta.T @ alpha)            # orthogonal Procrustes (Kabsch)
    D = np.diag([1, 1, np.linalg.det(Vt.T @ U.T)])
    R_X = Vt.T @ D @ U.T
    C = np.vstack([A[:3, :3] - np.eye(3) for A in As])  # (R_A - I) t_X = R_X t_B - t_A
    d = np.concatenate([R_X @ B[:3, 3] - A[:3, 3] for A, B in zip(As, Bs)])
    return se3(R_X, np.linalg.lstsq(C, d, rcond=None)[0])

rng3 = np.random.default_rng(4)
X_true = se3(rodrigues(np.deg2rad([5.0, -10.0, 90.0])), np.array([0.05, -0.03, 0.08]))   # camera in gripper
T_bt = se3(np.eye(3), np.array([0.6, 0.0, 0.0]))                                      # target in base
T_bg, T_ct = [], []
for i in range(10):                                         # ten gripper stations looking at the target
    R_g = rodrigues(np.deg2rad(rng3.uniform(-30, 30, 3))) @ rodrigues([0, np.pi, 0])
    Tg = se3(R_g, np.array([0.6, 0.0, 0.45]) + rng3.uniform(-0.1, 0.1, 3))
    Tc = np.linalg.inv(Tg @ X_true) @ T_bt                  # target pose seen by the camera (PnP in practice)
    noise = se3(rodrigues(np.deg2rad(rng3.normal(0, 0.05, 3))), rng3.normal(0, 0.0005, 3))
    T_bg.append(Tg)
    T_ct.append(Tc @ noise)
As = [np.linalg.inv(T_bg[j]) @ T_bg[i] for i in range(10) for j in range(i + 1, 10)]
Bs = [T_ct[j] @ np.linalg.inv(T_ct[i]) for i in range(10) for j in range(i + 1, 10)]
X = hand_eye_park_martin(As, Bs)
err_R = np.rad2deg(np.linalg.norm(log_so3(X[:3, :3] @ X_true[:3, :3].T)))
print("ours:   rotation error %.3f deg, translation error %.2f mm"
      % (err_R, 1000 * np.linalg.norm(X[:3, 3] - X_true[:3, 3])))
R_cv, t_cv = cv2.calibrateHandEye([T[:3, :3] for T in T_bg], [T[:3, 3] for T in T_bg],
                                  [T[:3, :3] for T in T_ct], [T[:3, 3] for T in T_ct],
                                  method=cv2.CALIB_HAND_EYE_PARK)
print("OpenCV: rotation error %.3f deg, translation error %.2f mm"
      % (np.rad2deg(np.linalg.norm(log_so3(R_cv @ X_true[:3, :3].T))), 1000 * np.linalg.norm(t_cv.ravel() - X_true[:3, 3])))
```

```text
ours:   rotation error 0.042 deg, translation error 0.73 mm
OpenCV: rotation error 0.042 deg, translation error 0.73 mm
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-hand-eye.svg" caption="Left: the setup, robot base $\lbrace b\rbrace$, four gripper stations (thick axes), the camera mounted on each by the same $X$ (thin axes, orange link) and the fixed target $\lbrace t\rbrace$. Right: median error of $X$ over 100 trials (camera-to-target poses with 0.05° and 0.5 mm of noise per axis) against the number of stations $n$, using all pairs. Solid: general rotations; the rotation error falls from 0.16° ($n=3$) to 0.04° ($n=20$) and the translation error from 1.8 mm to 0.5 mm. Dashed: every rotation about the same vertical axis; then the rotation of $X$ about that axis is unobservable and the errors stay near 90° and over 100 mm however many stations you add." %}

The dashed curves show the classic failure: the motions must contain rotations about **at least two non-parallel axes**. A robot that only turns its wrist about one axis (or a mobile robot driving on a floor) cannot calibrate a hand-eye transform this way. Other solvers (Tsai and Lenz 1989, Daniilidis' dual quaternions 1999, all available in `cv2.calibrateHandEye`) differ in how they weight rotation against translation, but all need this diversity. Variants: with the camera fixed in the world looking at a target on the gripper ("eye-to-hand") the same equation holds with the roles swapped; estimating the target pose at the same time gives $AX = YB$ (`cv2.calibrateRobotWorldHandEye`).

## 9. Camera-IMU calibration

Visual-inertial odometry ([post 06]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})), and every AR/VR headset, fuses a camera with an IMU (gyroscope and accelerometer). Fusion needs three calibration results beyond the camera intrinsics:

- the **extrinsic** transform $T_{CI}$ between the IMU and the camera;
- the **time offset** $t_d$ between their clocks: the camera timestamp of an image is usually not the instant of exposure;
- the IMU's noise model (noise densities and bias random walks of gyro and accelerometer), usually measured beforehand from a long static recording (Allan variance).

**Why the time offset matters, in numbers.** Turn your head at $\omega = 2$ rad/s (about 115°/s, an ordinary head turn). A clock offset of $t_d = 5$ ms means the IMU thinks the camera looked $\omega t_d = 0.01$ rad away from where it actually did. Near the image centre that is $f\,\omega\,t_d = 600 \times 0.01 = 6$ px with our camera: fifteen times the noise of the corner detector. For a headset this is a virtual object visibly swimming against the real world.

**How Kalibr does it** (Furgale, Rehder and Siegwart 2013). You wave the sensor rig in front of an AprilGrid for a minute or two, exciting all rotation and acceleration axes. The trajectory of the IMU is modelled as a **continuous-time B-spline** in $SE(3)$, so its pose, angular velocity and acceleration can be evaluated at any instant. One large nonlinear least-squares problem then estimates the spline, $T_{CI}$, $t_d$, gravity and the IMU biases together. Its residuals are the reprojection errors of the grid corners at the (shifted) image times, plus gyro residuals (measured minus spline angular velocity) and accelerometer residuals (measured minus spline acceleration minus gravity), each weighted by its noise. The continuous-time representation is what makes the time offset estimable, because a shift $t_d$ simply moves where along the spline the image residuals are evaluated. The paper reports time offsets estimated to a fraction of the IMU sampling period. In practice: `kalibr_calibrate_cameras` first, then `kalibr_calibrate_imu_camera` with your `imu.yaml` noise parameters. Rehder et al. (2016) extended the toolbox to several IMUs and to IMU intrinsics. Rolling-shutter cameras (post 01, section 3.5) need, in addition, a time offset that grows with the image row.

## 10. A practical checklist

1. **Fix the optics first.** Focus, zoom and aperture change the intrinsics. Set them as they will be used, then tape the rings. Turn off autofocus and digital stabilization.
2. **Use a good target.** Flat and rigid, square size measured, large enough to fill a good part of the image at working distance. ChArUco if you can.
3. **Collect diverse poses.** 15-40 images: tilts of 30-50° about different axes, the board pushed into every corner and along every edge of the frame, a range of distances around the working distance. Avoid motion blur (hold still, or use a short exposure).
4. **Choose the model to match the lens.** $(k_1, k_2, p_1, p_2)$ for normal lenses, add $k_3$ only with full coverage, rational or fisheye models (post 01) for wide-angle lenses. For the highest accuracy, generic models with thousands of parameters exist (Schöps et al. 2020).
5. **Check the residuals, not just the RMS.** RMS near $\sqrt 2\,\sigma$ of your detector (0.1-0.5 px is typical); no spatial pattern in the residual plot; no single image with much larger error (remove it and recalibrate).
6. **Look at the uncertainty.** Standard deviations from $\sigma^2(J^\top J)^{-1}$, and if possible a projection-uncertainty map. Collect more images where the map is bad.
7. **Validate on held-out data.** Calibrate on part of the images and compute the reprojection error on the rest (with the poses re-estimated by PnP). A model that over-fits has a much larger held-out error.
8. **Recalibrate when things change.** Temperature, shocks and lens changes move the intrinsics; extrinsics of rigs drift. Many products recalibrate online, inside SLAM.

## Try it

The widget in section 5.4 is the hands-on part of this post. On the home page, the [interactive lab]({{ '/' | relative_url }}#lab) shows the forward direction of the same model: every demo projects 3D content with a pinhole camera, and the foveated-rendering demo is a reminder that display systems are calibrated too.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| An Algorithm for Least-Squares Estimation of Nonlinear Parameters (Marquardt) | J. SIAM | 1963 | [DOI](https://doi.org/10.1137/0111030) | The damping scheme behind every calibration solver |
| A versatile camera calibration technique for high-accuracy 3D machine vision metrology using off-the-shelf TV cameras and lenses (Tsai) | IEEE J. Robotics and Automation | 1987 | [DOI](https://doi.org/10.1109/JRA.1987.1087109) | Classic two-stage calibration with radial distortion |
| A new technique for fully autonomous and efficient 3D robotics hand/eye calibration (Tsai & Lenz) | IEEE Trans. Robotics and Automation | 1989 | [DOI](https://doi.org/10.1109/70.34770) | The first practical $AX = XB$ solver |
| Robot sensor calibration: solving AX = XB on the Euclidean group (Park & Martin) | IEEE Trans. Robotics and Automation | 1994 | [DOI](https://doi.org/10.1109/70.326576) | Lie-group view; closed-form least-squares rotation |
| In Defense of the Eight-Point Algorithm (Hartley) | TPAMI | 1997 | [DOI](https://doi.org/10.1109/34.601246) | Coordinate normalization for linear estimators |
| A four-step camera calibration procedure with implicit image correction (Heikkilä & Silvén) | CVPR | 1997 | [DOI](https://doi.org/10.1109/CVPR.1997.609468) | Radial and tangential distortion, an inverse model for undistortion, correction of the circle-centre bias |
| On plane-based camera calibration: a general algorithm, singularities, applications (Sturm & Maybank) | CVPR | 1999 | [HAL](https://hal.archives-ouvertes.fr/inria-00525681) | Plane-based calibration and its degenerate configurations |
| Hand-eye calibration using dual quaternions (Daniilidis) | IJRR | 1999 | [DOI](https://doi.org/10.1177/02783649922066213) | Rotation and translation solved together |
| A Flexible New Technique for Camera Calibration (Zhang) | TPAMI | 2000 | [DOI](https://doi.org/10.1109/34.888718) | The checkerboard method of this post |
| A compact algorithm for rectification of stereo pairs (Fusiello, Trucco & Verri) | Machine Vision and Applications | 2000 | [DOI](https://doi.org/10.1007/s001380050120) | The rectification of section 7.2 |
| AprilTag: A robust and flexible visual fiducial system (Olson) | ICRA | 2011 | [DOI](https://doi.org/10.1109/ICRA.2011.5979561) | Fiducials used in AprilGrid targets |
| Unified temporal and spatial calibration for multi-sensor systems (Furgale, Rehder & Siegwart) | IROS | 2013 | [DOI](https://doi.org/10.1109/IROS.2013.6696514) | Kalibr: continuous-time camera-IMU calibration with time offset |
| AprilCal: Assisted and repeatable camera calibration (Richardson, Strom & Olson) | IROS | 2013 | [DOI](https://doi.org/10.1109/IROS.2013.6696595) | Suggests the next board pose from the projection uncertainty |
| Automatic generation and detection of highly reliable fiducial markers under occlusion (Garrido-Jurado et al.) | Pattern Recognition | 2014 | [DOI](https://doi.org/10.1016/j.patcog.2014.01.005) | ArUco markers, the basis of ChArUco boards |
| Extending Kalibr: Calibrating the extrinsics of multiple IMUs and of individual axes (Rehder et al.) | ICRA | 2016 | [DOI](https://doi.org/10.1109/ICRA.2016.7487628) | Multi-IMU and IMU-intrinsic calibration |
| Why Having 10,000 Parameters in Your Camera Model Is Better Than Twelve (Schöps et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1912.02908) | Generic camera models and the bias of parametric ones |
| GeoCalib: Learning Single-image Calibration with Geometric Optimization (Veicht et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2409.06704) | Intrinsics and gravity from a single image, without a target |

## Learning resources

- R. Hartley and A. Zisserman, *Multiple View Geometry in Computer Vision*, 2nd ed., Cambridge University Press, 2004: chapter 4 (DLT, normalization, the gold-standard cost) and chapters 7-8 (camera matrix estimation, the image of the absolute conic).
- R. Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed., free online at [szeliski.org/Book](https://szeliski.org/Book/): the sections on calibration and nonlinear least squares.
- OpenCV tutorials: [camera calibration](https://docs.opencv.org/4.8.0/d4/d94/tutorial_camera_calibration.html), [ChArUco detection](https://docs.opencv.org/4.x/df/d4a/tutorial_charuco_detection.html) and [calibration with ArUco and ChArUco](https://docs.opencv.org/4.x/da/d13/tutorial_aruco_calibration.html).
- [mrcal](https://mrcal.secretsauce.net/uncertainty.html): a calibration toolkit with excellent documentation on projection uncertainty and model differencing.
- [Kalibr](https://github.com/ethz-asl/kalibr) and its [camera-IMU calibration wiki](https://github.com/ethz-asl/kalibr/wiki/camera-imu-calibration).
- [puzzlepaint/camera_calibration](https://github.com/puzzlepaint/camera_calibration): the generic-model calibrator of Schöps et al.; [cvg/GeoCalib](https://github.com/cvg/GeoCalib) for target-free single-image calibration.
- Bouguet's Camera Calibration Toolbox for Matlab, the ancestor of OpenCV's calibration code; its documentation pages are still a clear step-by-step tutorial.

## Exercises

1. **Two images are enough with zero skew.** Add the constraint $B_{12} = 0$ (zero skew means $K^{-\top}K^{-1}$ has $B_{12} = 0$) as an extra row of $V$, and calibrate from views 4 and 6 only. Compare with the three-view closed form.

   <details markdown="1"><summary>Hint</summary>

   Append the row $(0, 1, 0, 0, 0, 0)$ to $V$ (weighted so its scale matches the other rows). With two views you then have $2\cdot 2 + 1 = 5$ equations for the 5 degrees of freedom of $\mathbf b$. Expect a noticeably larger error than with three views, and a total failure if the two views are tilted about the same axis.
   </details>

2. **Why frontal views fail, exactly.** Show that for boards parallel to the image plane, the map $(f_x, f_y) \to \alpha (f_x, f_y)$, $t_{z,i} \to \alpha t_{z,i}$ for every view, $k_1 \to \alpha^2 k_1$, $k_2 \to \alpha^4 k_2$ leaves every image unchanged. What does this predict for $J^\top J$?

   <details markdown="1"><summary>Hint</summary>

   For a frontal board (a rotation about the optical axis only) every corner has depth $t_z$, so $x = (\text{something independent of } t_z)/t_z$; scaling $t_z$ by $\alpha$ divides $x$, $y$ and $r$ by $\alpha$. Then $f x(1 + k_1 r^2 + k_2 r^4)$ is unchanged with the stated rescaling. A one-parameter family of exact solutions means $J$ has a null vector, so $J^\top J$ is singular and the predicted $\sigma_{f_x}$ is infinite. The widget shows a huge (finite, because of rounding) value.
   </details>

3. **Held-out validation.** Calibrate on views 1-7 and 12, then estimate the poses of views 8-11 by PnP (`cv2.solvePnP`) with the fixed intrinsics and compute their reprojection error. Repeat with $k_3$ fixed. Which calibration generalizes better, and does the held-out error agree with the projection-uncertainty map?

   <details markdown="1"><summary>Hint</summary>

   The held-out corners lie exactly in the region where figure (b) shows large or undefined uncertainty, so expect held-out errors of several pixels for the free-$k_3$ model, smaller with $k_3 = 0$, against about 0.4 px on the training views.
   </details>

4. **Analytic Jacobian.** Replace the forward-difference `jacobian` by analytic derivatives of `project` with respect to $f_x, f_y, c_x, c_y$ (easy) and $k_1, k_2$ (chain rule through $r^2$). Check it against the numerical one, and time both.

   <details markdown="1"><summary>Hint</summary>

   $\partial u/\partial f_x = x_d$, $\partial u/\partial c_x = 1$, $\partial u/\partial k_1 = f_x\, x\, r^2$, $\partial u/\partial k_2 = f_x\, x\, r^4$; similarly for $v$. The differences to the numerical Jacobian should be around $10^{-5}$ relative.
   </details>

5. **Time offset.** A headset's camera runs at 30 Hz and its IMU at 1000 Hz. During a calibration you rotate it at up to 3 rad/s. If you require the time-offset error to cause less than 0.5 px of error at the image centre with $f = 450$ px, how accurately must $t_d$ be known?

   <details markdown="1"><summary>Hint</summary>

   The image shift is about $f\,\omega\,\delta t_d$, so $\delta t_d < 0.5/(450\cdot 3) \approx 0.37$ ms, about a third of one IMU sample period. This is why the time offset is estimated as part of the calibration rather than read from the timestamps.
   </details>

**Next:** [Features and matching]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}): finding and matching points between arbitrary images, when there is no checkerboard to help.
