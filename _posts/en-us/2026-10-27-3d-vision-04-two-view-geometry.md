---
layout: post
title: "Two-view geometry: epipolar constraints, relative pose, triangulation and stereo"
date: 2026-10-27 11:04:00+0900
description: "Post 4 of 3D Vision Fundamentals: the epipolar constraint, essential and fundamental matrices, the normalized eight-point, seven-point and five-point algorithms, decomposing E with the cheirality check, midpoint, linear and optimal triangulation, pure rotation and planar degeneracies, and stereo: rectification, disparity and depth, block matching and semi-global matching."
categories: 3d-vision
tags: [epipolar-geometry, essential-matrix, fundamental-matrix, eight-point-algorithm, relative-pose, triangulation, stereo-matching, sgm]
series: 3d-vision
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## Why this matters

[Post 03]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}) ended with a list of correspondences: pixel $\mathbf x\_1$ in one image is the same scene point as pixel $\mathbf x\_2$ in another. This post turns such pairs into geometry. Two images of a static scene are tied together by a single $3\times 3$ matrix, and from that matrix we can recover how the camera moved, and then where every matched point is in 3D. This is the smallest complete instance of "images back to geometry", and every larger system is built from it: Structure-from-Motion initializes from one good image pair, visual SLAM bootstraps its map from two frames, and a stereo camera computes a depth map from two images taken at the same instant.

We go through the whole chain. First the geometry: why a point in one image constrains its match to a *line* in the other (the **epipolar constraint**), and the two matrices that encode it, the **essential matrix** $E$ for calibrated cameras and the **fundamental matrix** $F$ for pixels. Then estimation: the normalized eight-point algorithm, the seven-point and five-point minimal solvers, and robust fitting with RANSAC. Then the payoff: the relative pose from $E$ with its fourfold ambiguity, and three ways to **triangulate** a point. We look at the configurations where all of this breaks (pure rotation, planar scenes). Finally we specialize to the **rectified stereo** case, where matching becomes a 1D search along image rows, and build block matching and semi-global matching from scratch on a synthetic stereo pair with known ground truth.

[Neural rendering post 1]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}) gives a compact tour of epipolar geometry, the eight-point algorithm and triangulation. Here we take each step slowly, derive what that post states, and add what it leaves out: minimal solvers, error measures, optimal triangulation, degeneracies and dense stereo.

## Prerequisites

- The pinhole camera $P = K[R \mid \mathbf t]$, homogeneous coordinates, and points and lines in $\mathbb P^2$ from [post 01]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }}). We use its conventions throughout: the OpenCV camera frame ($x$ right, $y$ down, $z$ forward), $\tilde{\mathbf x} = (u, v, 1)^\top$ for a pixel, the line $\mathbf l$ through two points $\mathbf l = \tilde{\mathbf a}\times\tilde{\mathbf b}$, and the incidence test $\mathbf l^\top\tilde{\mathbf x} = 0$.
- Homographies and the normalized DLT from [post 02]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}), section 2, and its stereo rectification in section 7.
- RANSAC and its iteration count from [post 03]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}), section 6.
- Linear algebra: the SVD, null spaces, rank, the cross product, rotation matrices.
- Python with NumPy and SciPy. All snippets in this post run in sequence as one script; every number in the text is printed by them.

## 1. Two cameras, one point

### 1.1 Notation and the running example

We put the world frame on camera 1. A 3D point has coordinates $\mathbf X\_1$ in camera 1 and

$$
\mathbf X_2 = R\,\mathbf X_1 + \mathbf t
$$

in camera 2, exactly the convention of post 02's stereo calibration. The two cameras are therefore

$$
P_1 = K_1\,[I \mid \mathbf 0], \qquad P_2 = K_2\,[R \mid \mathbf t],
$$

and the centre of camera 2, expressed in camera 1, is $\mathbf C\_2 = -R^\top\mathbf t$ (post 01, section 2.3: $\mathbf t$ is not the position of camera 2). A pixel $\tilde{\mathbf x}\_i = (u\_i, v\_i, 1)^\top$ of camera $i$ has the **normalized coordinates**

$$
\hat{\mathbf x}_i = K_i^{-1}\tilde{\mathbf x}_i = (x_i,\ y_i,\ 1)^\top ,
$$

the point where its ray meets the plane $z = 1$ of that camera. $\hat{\mathbf x}\_i$ is also a direction: the ray of the pixel is $\lbrace \lambda\,\hat{\mathbf x}\_i : \lambda > 0\rbrace$ in camera $i$'s frame, and $\lambda$ is the depth.

The running example is a $640\times 480$ camera with $f = 500$ px (a 65° horizontal field of view) used twice. Camera 2 sits 80 cm to the right, 10 cm lower and 30 cm further forward, and it is turned 10° to the left and 3° up. We scatter 240 points at random pixels of image 1 and random depths between 2 and 8 m and keep the first 200 that camera 2 also sees.

```python
import numpy as np

np.set_printoptions(precision=4, suppress=True)


def rot(axis, deg):
    """Rotation by deg degrees about the x, y or z axis."""
    a = np.deg2rad(deg)
    c, s = np.cos(a), np.sin(a)
    i, j = {"x": (1, 2), "y": (2, 0), "z": (0, 1)}[axis]
    R = np.eye(3)
    R[i, i], R[j, j], R[i, j], R[j, i] = c, c, -s, s
    return R


def skew(v):
    """The cross-product matrix [v]_x, with skew(v) @ w == np.cross(v, w)."""
    return np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])


def hom(x):
    """N x 2 points -> N x 3 homogeneous points (u, v, 1)."""
    return np.c_[x, np.ones(len(x))]


def project(K, R, t, X):
    """Points X (N x 3, camera-1 frame) -> pixels (N x 2) of the camera with X_c = R X + t."""
    p = (X @ R.T + t) @ K.T
    return p[:, :2] / p[:, 2:]


W, H = 640, 480
K = np.array([[500.0, 0.0, 320.0], [0.0, 500.0, 240.0], [0.0, 0.0, 1.0]])
R = rot("y", 10) @ rot("x", -3)            # camera 2 turns 10 deg to the left and 3 deg up
C2 = np.array([0.8, 0.1, 0.3])             # its centre in camera-1 coordinates (metres)
t = -R @ C2                                # so that X2 = R X1 + t

rng = np.random.default_rng(0)
uv = rng.uniform([20, 20], [W - 20, H - 20], (240, 2))           # random pixels of image 1 ...
Z = rng.uniform(2.0, 8.0, 240)                                   # ... at random depths
X = (hom(uv) @ np.linalg.inv(K).T) * Z[:, None]                  # back-projected, camera-1 frame
x2 = project(K, R, t, X)
keep = np.all((x2 > 0) & (x2 < [W, H]), axis=1)                  # keep what camera 2 also sees
X, x2 = X[keep][:200], x2[keep][:200]
x1 = project(K, np.eye(3), np.zeros(3), X)                       # pixels in image 1
print(len(X), "points;  t =", t, " |t| =", round(np.linalg.norm(t), 4))
```

```text
200 points;  t = [-0.839  -0.1156 -0.151 ]  |t| = 0.8602
```

The baseline is $\lVert\mathbf t\rVert = \lVert\mathbf C\_2\rVert = 0.86$ m. Note that $\mathbf t = (-0.839, -0.116, -0.151)$ is $-R\,\mathbf C\_2$: the first camera's centre seen from the second camera.

### 1.2 The epipolar plane, epipoles and epipolar lines

Take one scene point $\mathbf X$. The two camera centres $\mathbf C\_1$, $\mathbf C\_2$ and $\mathbf X$ are three points, so they span a plane, the **epipolar plane** of $\mathbf X$. Everything interesting lies in this plane:

- the ray from $\mathbf C\_1$ through $\mathbf X$, and therefore the image point $\mathbf x\_1$;
- the ray from $\mathbf C\_2$ through $\mathbf X$, and therefore $\mathbf x\_2$;
- the **baseline**, the line $\mathbf C\_1\mathbf C\_2$.

The epipolar plane cuts each image plane in a line: the **epipolar lines** $\mathbf l\_1$ and $\mathbf l\_2$. Now turn the reasoning around. Suppose we only know $\mathbf x\_1$. We do not know the depth of $\mathbf X$, so $\mathbf X$ could be anywhere on the ray of $\mathbf x\_1$. But the whole ray lies in the epipolar plane (the plane is spanned by the ray and the baseline), so wherever $\mathbf X$ is, its image in camera 2 lies on $\mathbf l\_2$. **A point in one image constrains its match in the other image to a line.** This is the epipolar constraint, and it reduces correspondence search from 2D to 1D.

As $\mathbf X$ varies, its epipolar plane rotates about the baseline like the pages of a book about its spine. Every epipolar plane contains the baseline, so every epipolar line in image 2 passes through the point where the baseline pierces image plane 2: the **epipole** $\mathbf e\_2$. It is the image of $\mathbf C\_1$ in camera 2. Likewise $\mathbf e\_1$, the image of $\mathbf C\_2$ in camera 1, lies on every epipolar line of image 1. The epipolar lines of an image form a **pencil** through its epipole.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-epipolar-geometry.svg" caption="Top: the running example in 3D (camera 1 purple, camera 2 blue, image rectangles drawn at depth 0.9 m, the black segment is the baseline). Three scene points (orange, red, cyan) each span an epipolar triangle with the two centres; each triangle cuts both image rectangles along that point's epipolar lines (thick segments), and the projections of the point lie on them. Bottom: the same lines in pixels, extended beyond the 640×480 frames. In image 1 they all meet at the epipole $\mathbf e\_1=(1653, 407)$, the image of $\mathbf C\_2$; in image 2 they meet at $\mathbf e\_2=(3099, 623)$, further out to the right. Both epipoles are far outside the frames because camera 2 moved mostly sideways." %}

In the figure the epipoles lie far to the right of both images. This is typical: for a mostly sideways motion the baseline is almost parallel to the image planes and pierces them far away. Section 3.3 shows the other cases.

## 2. The essential matrix

### 2.1 Coplanarity gives $E$

We now turn the picture into an equation. Work in the frame of camera 2. Three vectors lie in the epipolar plane, all starting from $\mathbf C\_2$ (the origin of this frame):

1. the ray of $\mathbf x\_2$, with direction $\hat{\mathbf x}\_2$;
2. the baseline, from $\mathbf C\_2$ to $\mathbf C\_1$: camera 1's centre has camera-2 coordinates $R\,\mathbf 0 + \mathbf t = \mathbf t$;
3. the ray of $\mathbf x\_1$ through $\mathbf C\_1$, whose direction $\hat{\mathbf x}\_1$ is given in camera-1 coordinates and becomes $R\,\hat{\mathbf x}\_1$ in camera 2.

Three vectors are coplanar exactly when their triple product vanishes:

$$
\hat{\mathbf x}_2 \cdot \big(\mathbf t \times R\,\hat{\mathbf x}_1\big) = 0 .
$$

Write the cross product with $\mathbf t$ as a matrix product, $\mathbf t\times\mathbf a = [\mathbf t]\_\times\mathbf a$ with

$$
[\mathbf t]_\times = \begin{pmatrix} 0 & -t_3 & t_2 \\ t_3 & 0 & -t_1 \\ -t_2 & t_1 & 0 \end{pmatrix},
$$

and the condition becomes a bilinear form:

$$
\boxed{\;\hat{\mathbf x}_2^\top E\, \hat{\mathbf x}_1 = 0, \qquad E = [\mathbf t]_\times R .\;}
$$

$E$ is the **essential matrix**, introduced by Longuet-Higgins in 1981. It depends only on the relative pose, not on the scene and not on the intrinsics.

There is a second, more algebraic route that is worth seeing once, because it shows where the depth goes. Projecting $\mathbf X\_1 = \lambda\_1\hat{\mathbf x}\_1$ into camera 2 gives $\lambda\_2\hat{\mathbf x}\_2 = \lambda\_1 R\,\hat{\mathbf x}\_1 + \mathbf t$. Cross both sides with $\mathbf t$ (killing the last term) and then dot with $\hat{\mathbf x}\_2$ (killing the left side, since $\hat{\mathbf x}\_2\cdot(\mathbf t\times\hat{\mathbf x}\_2) = 0$):

$$
0 = \lambda_1\,\hat{\mathbf x}_2^\top [\mathbf t]_\times R\,\hat{\mathbf x}_1 .
$$

The unknown depths $\lambda\_1, \lambda\_2$ have dropped out; what remains is a constraint between the two image points alone. That is why two-view geometry can be estimated *before* we know any 3D structure.

### 2.2 Properties of $E$

**Five degrees of freedom.** $E$ has 9 entries, but it is built from a rotation (3 parameters) and a translation (3 parameters), and the equation $\hat{\mathbf x}\_2^\top E\hat{\mathbf x}\_1 = 0$ is homogeneous: scaling $E$, and therefore $\mathbf t$, changes nothing. So $E$ has $3 + 3 - 1 = 5$ degrees of freedom, and **the length of the baseline cannot be recovered from two images**. A scene twice as large, seen from cameras twice as far apart, produces the same images. Section 5.4 returns to this.

**Singular values $(\sigma, \sigma, 0)$.** $E^\top E = R^\top [\mathbf t]\_\times^\top [\mathbf t]\_\times R$. For any vector $\mathbf a$, $[\mathbf t]\_\times^\top [\mathbf t]\_\times\mathbf a = -\mathbf t\times(\mathbf t\times\mathbf a) = \lVert\mathbf t\rVert^2\mathbf a - (\mathbf t^\top\mathbf a)\,\mathbf t$, so $[\mathbf t]\_\times^\top[\mathbf t]\_\times = \lVert\mathbf t\rVert^2 I - \mathbf t\mathbf t^\top$, with eigenvalues $\lVert\mathbf t\rVert^2$, $\lVert\mathbf t\rVert^2$ (for directions perpendicular to $\mathbf t$) and $0$ (along $\mathbf t$). Conjugating by the rotation $R$ does not change eigenvalues. Hence the singular values of $E$ are $(\lVert\mathbf t\rVert, \lVert\mathbf t\rVert, 0)$: **$E$ has rank 2 and two equal nonzero singular values.** Conversely, every $3\times 3$ matrix with singular values $(\sigma, \sigma, 0)$ factors as $[\mathbf t]\_\times R$ (section 5.1 constructs the factors).

**A cubic constraint.** The singular-value condition can be written without an SVD, as polynomial equations in the entries of $E$:

$$
\det E = 0, \qquad 2\,EE^\top E - \operatorname{tr}(EE^\top)\,E = 0 .
$$

To check the second, write $E = U\operatorname{diag}(\sigma\_1, \sigma\_2, \sigma\_3)V^\top$. Then $EE^\top E = U\operatorname{diag}(\sigma\_i^3)V^\top$ and $\operatorname{tr}(EE^\top) = \sum\_j\sigma\_j^2$, so the matrix equation says $\sigma\_i\,(2\sigma\_i^2 - \sum\_j\sigma\_j^2) = 0$ for each $i$. With $(\sigma, \sigma, 0)$: $\sigma(2\sigma^2 - 2\sigma^2) = 0$ and $0 = 0$. These nine cubic equations are what the five-point algorithm of section 4.4 solves.

The next snippet verifies all three claims on the running example.

```python
E = skew(t) @ R
Kinv = np.linalg.inv(K)
n1, n2 = hom(x1) @ Kinv.T, hom(x2) @ Kinv.T          # normalized coordinates (x, y, 1)
print("max |n2^T E n1|    : %.1e" % np.abs(np.sum(n2 * (n1 @ E.T), axis=1)).max())
print("singular values of E:", np.linalg.svd(E)[1])
print("2EE^TE - tr(EE^T)E : %.1e" % np.abs(2 * E @ E.T @ E - np.trace(E @ E.T) * E).max())
```

```text
max |n2^T E n1|    : 2.2e-16
singular values of E: [0.8602 0.8602 0.    ]
2EE^TE - tr(EE^T)E : 2.2e-16
```

Every correspondence satisfies the constraint to machine precision, the singular values are $(0.8602, 0.8602, 0)$ with $0.8602 = \lVert\mathbf t\rVert$, and the cubic constraint holds.

## 3. The fundamental matrix

### 3.1 From $E$ to $F$

Matching gives us pixels, not normalized coordinates. Substituting $\hat{\mathbf x}\_i = K\_i^{-1}\tilde{\mathbf x}\_i$ into the essential constraint gives

$$
\tilde{\mathbf x}_2^\top F\,\tilde{\mathbf x}_1 = 0, \qquad F = K_2^{-\top} E\,K_1^{-1} = K_2^{-\top}[\mathbf t]_\times R\,K_1^{-1} .
$$

$F$ is the **fundamental matrix**. It encodes the same epipolar geometry in pixel units, and it can be estimated from pixel correspondences without knowing $K\_1$ or $K\_2$. When the intrinsics are known, we go back with $E = K\_2^\top F K\_1$.

There is a second form of $F$ that explains the geometry directly. Write the image of the point at depth $\lambda\_1$ along the ray of $\tilde{\mathbf x}\_1$:

$$
\lambda_2\tilde{\mathbf x}_2 = K_2(\lambda_1 R K_1^{-1}\tilde{\mathbf x}_1 + \mathbf t) = \lambda_1\,H_\infty\tilde{\mathbf x}_1 + \mathbf e_2,
\qquad H_\infty = K_2 R K_1^{-1},\quad \mathbf e_2 = K_2\mathbf t .
$$

As $\lambda\_1$ runs from 0 to $\infty$, the image moves from $\mathbf e\_2$ (depth 0: the image of camera 1's centre) to $H\_\infty\tilde{\mathbf x}\_1$ (infinite depth: the vanishing point of the ray, post 01 section 1.6). The epipolar line is the line through these two points, $\mathbf l\_2 = \mathbf e\_2\times H\_\infty\tilde{\mathbf x}\_1$, so

$$
F = [\mathbf e_2]_\times H_\infty = [K_2\mathbf t]_\times K_2 R K_1^{-1} ,
$$

which equals the first expression up to scale (by the identity $[K\mathbf a]\_\times K = \det(K)\,K^{-\top}[\mathbf a]\_\times$). This form will explain the degeneracies of section 7, and the epipolar widget below draws exactly this segment, from the epipole to the vanishing point, with depth ticks in between.

**Degrees of freedom.** $F$ has 9 entries, minus 1 for scale, minus 1 for the constraint $\det F = 0$ (it is still rank 2, since $[\mathbf e\_2]\_\times$ is): **7 degrees of freedom**. The two extra parameters compared to $E$ are the price of not knowing the intrinsics; $F$ no longer needs two equal singular values.

### 3.2 Epipolar lines and epipoles in pixels

Reading off the constraint:

- $\mathbf l\_2 = F\tilde{\mathbf x}\_1$ is the epipolar line of $\tilde{\mathbf x}\_1$ in image 2: $\tilde{\mathbf x}\_2^\top\mathbf l\_2 = 0$ is the incidence test of post 01.
- $\mathbf l\_1 = F^\top\tilde{\mathbf x}\_2$ is the epipolar line of $\tilde{\mathbf x}\_2$ in image 1.
- $\mathbf e\_1$ lies on every $\mathbf l\_1$: $\mathbf e\_1^\top F^\top\tilde{\mathbf x}\_2 = 0$ for all $\tilde{\mathbf x}\_2$, so $F\mathbf e\_1 = \mathbf 0$. The epipole is the **right null vector** of $F$; likewise $F^\top\mathbf e\_2 = \mathbf 0$, the left null vector.
- The distance of a pixel $(u, v)$ from a line $(a, b, c)$ is $\lvert au + bv + c\rvert / \sqrt{a^2 + b^2}$.

**Worked example.** The point $\mathbf X = (0.5, -0.4, 5.0)$ m projects to $\mathbf x\_1 = (370, 200)$ and $\mathbf x\_2 = (375.76, 213.05)$. Its epipolar line in image 2, scaled so that $a^2 + b^2 = 1$, is $-0.1488\,u + 0.9889\,v - 154.77 = 0$. Check: $-0.1488\cdot 375.76 + 0.9889\cdot 213.05 - 154.77 = -55.91 + 210.68 - 154.77 = 0.00$.

```python
F = Kinv.T @ E @ Kinv
F = F / np.linalg.norm(F)


def null_vector(A):
    """Unit vector v minimizing |A v| (the last right singular vector)."""
    return np.linalg.svd(A)[2][-1]


e1 = null_vector(F)                          # F e1 = 0
e2 = null_vector(F.T)                        # F^T e2 = 0
print("e1 =", e1[:2] / e1[2], " C2 seen by camera 1:", project(K, np.eye(3), np.zeros(3), C2[None])[0])
print("e2 =", e2[:2] / e2[2], " C1 seen by camera 2:", project(K, R, t, np.zeros((1, 3)))[0])


def point_line_distance(l, x):
    """Distance (pixels) of pixel x (2,) from the homogeneous line l = (a, b, c)."""
    return abs(l @ np.append(x, 1.0)) / np.hypot(l[0], l[1])


Xp = np.array([0.5, -0.4, 5.0])               # one point, camera-1 frame
p1 = project(K, np.eye(3), np.zeros(3), Xp[None])[0]
p2 = project(K, R, t, Xp[None])[0]
l2 = F @ np.append(p1, 1.0)                  # epipolar line of p1 in image 2
l1 = F.T @ np.append(p2, 1.0)                # epipolar line of p2 in image 1
print("p1 =", p1, " p2 =", p2)
print("l2 =", l2 / np.hypot(*l2[:2]), " distance of p2: %.1e px" % point_line_distance(l2, p2))
print("l2 passes through e2:", abs(l2 @ e2) < 1e-12, "; l1 through e1:", abs(l1 @ e1) < 1e-12)
print("rank of F:", np.linalg.matrix_rank(F), " singular values:", np.linalg.svd(F)[1])
```

```text
e1 = [1653.3333  406.6667]  C2 seen by camera 1: [1653.3333  406.6667]
e2 = [3098.6624  622.7506]  C1 seen by camera 2: [3098.6624  622.7506]
p1 = [370. 200.]  p2 = [375.7571 213.0501]
l2 = [  -0.1488    0.9889 -154.7698]  distance of p2: 3.0e-14 px
l2 passes through e2: True ; l1 through e1: True
rank of F: 2  singular values: [1.     0.0014 0.    ]
```

The null vectors of $F$ agree with the projections of the other camera's centre, both epipoles lie on the epipolar lines, and $F$ has rank 2. Its singular values $(1, 0.0014, 0)$ are very unequal, unlike those of $E$: pixel units mix scales of order 1 and 500.

### 3.3 What the motion does to the pencil

The arrangement of the epipolar lines tells you how the camera moved.

- **Sideways translation** ($R = I$, $\mathbf t \perp$ the optical axis, here along $x$): the baseline is parallel to both image planes, so the epipoles are at infinity, $\mathbf e = (1, 0, 0)^\top$, and the epipolar lines are parallel and horizontal. This is the geometry of a rectified stereo rig, section 8.
- **Forward translation** ($R = I$, $\mathbf t$ along $z$): the baseline is the optical axis, the epipole is the principal point, and every epipolar line passes through it. Points move radially away from it as the camera advances: the epipole is the **focus of expansion**, the point you are heading towards.
- **Pure translation in general** ($R = I$, $K\_1 = K\_2$): $F = [\mathbf e]\_\times$ up to scale, a skew-symmetric matrix, and $\mathbf x\_1$, $\mathbf x\_2$ and the epipole are collinear: every point slides along its own epipolar line. (Exercise 1.)
- **With rotation**, $\mathbf x\_2$ still lies on its epipolar line but no longer on the line through $\mathbf x\_1$ and the epipole, because the rotation also moves it by $H\_\infty$.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-motions.svg" caption="Epipolar lines $F\tilde{\mathbf x}\_1$ in image 2 for 14 points at depths 3–7 m and three motions of camera 2; filled purple: $\mathbf x\_2$; open orange with arrow: where the point was in image 1. Left: sideways translation $\mathbf C\_2=(0.5,0,0)$ m; the epipole is the point at infinity $(1,0,0)^\top$, the lines are horizontal and each point slides along its own line. Middle: forward translation $\mathbf C\_2=(0,0,0.9)$ m; all lines pass through the epipole $\mathbf e\_2=(320,240)$, the focus of expansion, and points move radially away from it. Right: the running example (translation and rotation); the lines converge to $\mathbf e\_2=(3099,623)$, far to the right." %}

### 3.4 Try it: the epipolar widget

The widget below is the running example with two live views and a top view. Drag the orange point in view 1: in view 2, the match can only be on the orange line. The dots on that line are where the ray of your pixel lands for depths of 1, 2, 4 and 8 m; the open circle is $H\_\infty\tilde{\mathbf x}\_1$ (infinite depth) and the black square the epipole (depth 0). Then move camera 2: try the forward-motion preset and watch the epipoles move into the image, and the pure-rotation preset, where the line collapses to a point.

{% include widget.liquid name="3d-vision-epipolar" height="900" caption="Epipolar geometry explorer, with the post's cameras ($f=500$ px, 640×480). Drag the orange point in view 1, or drag in the top view to move camera 2; the sliders set $\mathbf C\_2$, the yaw and pitch of camera 2 and the depth of the green 3D point along the ray. The light blue lines are the pencils of epipolar lines through $\mathbf e\_1$ and $\mathbf e\_2$. The readout gives $F/\lVert F\rVert$, both epipoles, $\mathbf l\_2=F\tilde{\mathbf x}\_1$ and the check $\tilde{\mathbf x}\_2^\top F\tilde{\mathbf x}\_1\approx 0$." %}

## 4. Estimating $F$ and $E$ from correspondences

### 4.1 The linear eight-point algorithm

Each correspondence $\tilde{\mathbf x}\_1 = (u\_1, v\_1, 1)$, $\tilde{\mathbf x}\_2 = (u\_2, v\_2, 1)$ gives one equation that is **linear** in the entries of $F$:

$$
\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1 = \sum_{i,j}(\tilde{\mathbf x}_2)_i\,(\tilde{\mathbf x}_1)_j\,F_{ij}
= (\tilde{\mathbf x}_2\otimes\tilde{\mathbf x}_1)^\top\mathbf f = 0,
$$

where $\mathbf f$ stacks the rows of $F$ and $\otimes$ is the Kronecker product: the row of the design matrix is $(u\_2u\_1, u\_2v\_1, u\_2, v\_2u\_1, v\_2v\_1, v\_2, u\_1, v\_1, 1)$. Stacking $N$ correspondences gives $A\mathbf f = \mathbf 0$ with $A\in\mathbb R^{N\times 9}$. $F$ has 8 unknowns up to scale, so $N \ge 8$ points determine it; with more points and noise we minimize $\lVert A\mathbf f\rVert$ subject to $\lVert\mathbf f\rVert = 1$, whose solution is the right singular vector of the smallest singular value, as for the DLT of post 02.

The linear solution ignores $\det F = 0$. With noisy data it comes out with full rank, and then its epipolar lines do not all pass through one point: there is no epipole. The fix is to replace $F$ by the nearest rank-2 matrix in the Frobenius norm, which by the Eckart-Young theorem means zeroing its smallest singular value:

$$
F = U\operatorname{diag}(s_1, s_2, s_3)V^\top \;\longrightarrow\; F' = U\operatorname{diag}(s_1, s_2, 0)V^\top .
$$

### 4.2 Normalization

Written in raw pixels, the columns of $A$ have wildly different magnitudes: $u\_2u\_1 \approx 10^5$, while the last column is 1. Small noise in the large entries then swamps the small ones, and the smallest singular vector is badly determined. Hartley's 1997 paper ("In defense of the eight-point algorithm") showed that one simple step fixes this: translate and scale each image's points so that their centroid is at the origin and their mean distance from it is $\sqrt 2$, solve for $\hat F$ in these coordinates, and undo the transforms with $F = T\_2^\top\hat F T\_1$ (because $\tilde{\mathbf x}\_2^\top F\tilde{\mathbf x}\_1 = (T\_2\tilde{\mathbf x}\_2)^\top\hat F(T\_1\tilde{\mathbf x}\_1)$). It is the same normalization post 02 used for homographies.

To measure the quality of an estimate independently of the noise in the data we use the **epipolar error**: the mean distance of the *noise-free* points $\mathbf x\_2$ from the estimated lines $F\tilde{\mathbf x}\_1$ of the noise-free $\mathbf x\_1$.

```python
def normalize_points(x):
    """Hartley normalization: centroid to the origin, mean distance sqrt(2)."""
    c = x.mean(axis=0)
    s = np.sqrt(2) / np.linalg.norm(x - c, axis=1).mean()
    T = np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])
    return hom(x) @ T.T, T


def eight_point(x1, x2, normalize=True, rank2=True):
    """F with x2^T F x1 = 0 from N >= 8 correspondences (N x 2 pixels)."""
    if normalize:
        q1, T1 = normalize_points(x1)
        q2, T2 = normalize_points(x2)
    else:
        q1, q2, T1, T2 = hom(x1), hom(x2), np.eye(3), np.eye(3)
    A = np.einsum("ni,nj->nij", q2, q1).reshape(-1, 9)     # row n = kron(q2_n, q1_n)
    Fq = null_vector(A).reshape(3, 3)
    if rank2:                                              # closest rank-2 matrix (Frobenius)
        U, S, Vt = np.linalg.svd(Fq)
        Fq = U @ np.diag([S[0], S[1], 0.0]) @ Vt
    Fx = T2.T @ Fq @ T1                                    # undo the normalization
    return Fx / np.linalg.norm(Fx)


def sampson(F, x1, x2):
    """Sampson distance (pixels): first-order distance of each correspondence to x2^T F x1 = 0."""
    h1, h2 = hom(x1), hom(x2)
    Fx1, Ftx2 = h1 @ F.T, h2 @ F
    num = np.sum(h2 * Fx1, axis=1)
    den = Fx1[:, 0] ** 2 + Fx1[:, 1] ** 2 + Ftx2[:, 0] ** 2 + Ftx2[:, 1] ** 2
    return np.abs(num) / np.sqrt(den)


def epipolar_error(Fest, x1, x2):
    """Mean distance of the true points x2 from the estimated lines Fest x1 (noise-free x1, x2)."""
    l = hom(x1) @ Fest.T
    return np.mean(np.abs(np.sum(l * hom(x2), axis=1)) / np.hypot(l[:, 0], l[:, 1]))


rng = np.random.default_rng(1)
for sigma in (0.5, 1.0, 2.0):
    err = {"raw": [], "normalized": []}
    for trial in range(200):
        y1 = x1 + rng.normal(0, sigma, x1.shape)
        y2 = x2 + rng.normal(0, sigma, x2.shape)
        err["raw"].append(epipolar_error(eight_point(y1, y2, normalize=False), x1, x2))
        err["normalized"].append(epipolar_error(eight_point(y1, y2), x1, x2))
    print("sigma = %.1f px: epipolar error raw %.3f px, normalized %.3f px"
          % (sigma, np.median(err["raw"]), np.median(err["normalized"])))

A_raw = np.einsum("ni,nj->nij", hom(x2), hom(x1)).reshape(-1, 9)
A_nrm = np.einsum("ni,nj->nij", normalize_points(x2)[0], normalize_points(x1)[0]).reshape(-1, 9)
for name, A in (("raw", A_raw), ("normalized", A_nrm)):
    s = np.linalg.svd(A)[1]
    print("%-10s s1/s8 = %.3g" % (name, s[0] / s[7]))
```

```text
sigma = 0.5 px: epipolar error raw 0.390 px, normalized 0.109 px
sigma = 1.0 px: epipolar error raw 1.393 px, normalized 0.221 px
sigma = 2.0 px: epipolar error raw 5.544 px, normalized 0.438 px
raw        s1/s8 = 9e+04
normalized s1/s8 = 13.2
```

At $\sigma = 1$ px the raw algorithm puts the epipolar lines 1.39 px from where they should be, the normalized one 0.22 px: a factor of 6, growing to 13 at $\sigma = 2$ px. The ratio $s\_1/s\_8$ explains why: the gap between the largest and the eighth singular value of $A$ (the last one that should be nonzero) shrinks from $9\times 10^4$ to 13, so noise perturbs the null vector much less. Normalization costs two $3\times 3$ matrices; always do it.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-eight-point.svg" caption="Left: epipolar lines $F^\top\tilde{\mathbf x}\_2$ in image 1 near the true epipole $\mathbf e\_1=(1653,407)$ (black square), from the normalized eight-point estimate on data with 2 px noise. Without the rank-2 step (orange) the lines meet pairwise at different points (orange dots, spread from $u=1490$ to $1643$): there is no epipole. With it (purple) they pass through one point, the estimated epipole $(1534,390)$. Middle: median epipolar error over 100 trials against the noise $\sigma$, raw pixels ($\tilde{\mathbf x}$) against normalized coordinates ($T\tilde{\mathbf x}$): 1.36 against 0.22 px at $\sigma=1$, 20.4 against 0.93 px at $\sigma=4$. Right: the cubic $\det(\alpha F\_1+(1-\alpha)F\_2)$ of the seven-point algorithm for the first 7 points; its three real roots give three candidate matrices, and only $\alpha=-0.68$ (green) is the true $F$." %}

The 4 px noise case on the right of the middle panel is not exotic: it is the scale of keypoint errors at coarse pyramid levels.

### 4.3 Seven points and a cubic

Since $F$ has 7 degrees of freedom, 7 correspondences should suffice, and in RANSAC every point fewer in the minimal sample pays off exponentially (post 03, section 6.3). With 7 rows, $A$ has a two-dimensional null space spanned by two matrices $F\_1, F\_2$, and every solution of the linear equations is $F = \alpha F\_1 + (1 - \alpha)F\_2$ (up to scale). Now impose the rank condition:

$$
\det\big(\alpha F_1 + (1 - \alpha)F_2\big) = 0 .
$$

A $3\times 3$ determinant is cubic in its entries, so this is a **cubic in $\alpha$** with one or three real roots. Each real root gives one fundamental matrix that fits all 7 points exactly and has rank 2. We cannot tell them apart from the 7 points alone; in RANSAC each candidate is scored on all matches. The code gets the cubic's coefficients by evaluating the determinant at four values of $\alpha$, which determine a cubic exactly.

```python
def seven_point(x1, x2):
    """All real fundamental matrices through exactly 7 correspondences (1 or 3 solutions)."""
    q1, T1 = normalize_points(x1)
    q2, T2 = normalize_points(x2)
    A = np.einsum("ni,nj->nij", q2, q1).reshape(-1, 9)     # 7 x 9: a 2-dimensional null space
    Vt = np.linalg.svd(A)[2]
    F1, F2 = Vt[-1].reshape(3, 3), Vt[-2].reshape(3, 3)
    a = np.array([-1.0, 0.0, 1.0, 2.0])                    # det(a F1 + (1 - a) F2) is a cubic in a:
    d = [np.linalg.det(ai * F1 + (1 - ai) * F2) for ai in a]
    coef = np.polyfit(a, d, 3)                             # four samples determine it exactly
    sols = []
    for r in np.roots(coef):
        if abs(r.imag) < 1e-8:
            Fr = T2.T @ (r.real * F1 + (1 - r.real) * F2) @ T1
            sols.append(Fr / np.linalg.norm(Fr))
    return sols, coef


sols, coef = seven_point(x1[:7], x2[:7])
print("cubic coefficients:", coef)
for Fs in sols:
    print("root: max Sampson distance over all 200 points %.2g px, |F - F_true| = %.2g"
          % (sampson(Fs, x1, x2).max(), min(np.linalg.norm(Fs - F), np.linalg.norm(Fs + F))))
```

```text
cubic coefficients: [ 0.0135 -0.0217 -0.0232 -0.0014]
root: max Sampson distance over all 200 points 62 px, |F - F_true| = 0.035
root: max Sampson distance over all 200 points 1.8e-12 px, |F - F_true| = 1.6e-15
root: max Sampson distance over all 200 points 32 px, |F - F_true| = 0.11
```

For our first 7 points the cubic has three real roots. The second one reproduces the true $F$ to $10^{-15}$ and fits all 200 points; the other two fit the 7 sample points perfectly but are 32 and 62 px off elsewhere.

### 4.4 Five points: the calibrated minimal problem

When $K$ is known, which is the normal case in SfM and SLAM, we estimate $E$ from normalized coordinates and have only 5 unknowns. Five correspondences then suffice, and the RANSAC table of post 03 shows what that buys: at 70% outliers, 1893 samples instead of 70188 for the eight-point algorithm. The algorithm is famous for being hard, but its idea follows the seven-point case:

1. Five equations $\hat{\mathbf x}\_2^\top E\hat{\mathbf x}\_1 = 0$ in 9 unknowns leave a **four-dimensional null space**: $E = xX + yY + zZ + W$ for basis matrices $X, Y, Z, W$ and unknown scalars $x, y, z$ (fixing the coefficient of $W$ to 1 fixes the scale).
2. Substitute this into the ten cubic equations of section 2.2 ($\det E = 0$ and the nine entries of $2EE^\top E - \operatorname{tr}(EE^\top)E = 0$). This gives ten polynomial equations of degree 3 in $x, y, z$.
3. Solve the polynomial system. Nistér (2004) eliminated variables by Gauss-Jordan elimination down to a single polynomial of degree 10; Stewénius, Engels and Nistér (2006) used a Gröbner basis and an eigenvalue problem. Either way there are **up to 10 solutions** (complex ones are discarded), and each real one is an essential matrix to be scored on the other matches.

The next snippet checks the first step and shows why the second is needed.

```python
A5 = np.einsum("ni,nj->nij", n2[:5], n1[:5]).reshape(-1, 9)   # 5 calibrated correspondences
basis = np.linalg.svd(A5)[2][5:]                                # 4 x 9 null-space basis
e_true = E.ravel() / np.linalg.norm(E)
print("null-space dimension:", basis.shape[0],
      " distance of the true E from it: %.1e" % np.linalg.norm(e_true - basis.T @ (basis @ e_true)))
rng = np.random.default_rng(2)
Er = (basis.T @ rng.normal(size=4)).reshape(3, 3)              # a random member of the null space
print("random member: singular values", np.linalg.svd(Er / np.linalg.norm(Er))[1])
```

```text
null-space dimension: 4  distance of the true E from it: 1.2e-15
random member: singular values [0.9374 0.3466 0.033 ]
```

The true $E$ lies in the four-dimensional null space (distance $10^{-15}$), but a random member of that space has singular values $(0.94, 0.35, 0.03)$: it satisfies the five epipolar equations and is not an essential matrix. The cubic constraints pick the few members that are. Production code (OpenCV's `findEssentialMat`, PoseLib, COLMAP) implements the full solver; a practical advantage of the five-point method beyond speed is that, unlike the eight-point algorithm, it still returns a finite set of solutions when all points lie on a plane (section 7).

### 4.5 Which error to minimize?

The eight-point algorithm minimizes the **algebraic error** $\sum\_i(\tilde{\mathbf x}\_{2i}^\top F\tilde{\mathbf x}\_{1i})^2$, a number without geometric meaning: scaling the coordinates or multiplying $F$ by a constant changes it. To score inliers in RANSAC and to refine $F$, we want a distance in pixels. Three are in common use.

**Symmetric epipolar distance.** The distance of $\mathbf x\_2$ from $F\tilde{\mathbf x}\_1$, plus that of $\mathbf x\_1$ from $F^\top\tilde{\mathbf x}\_2$:

$$
d_{\text{sym}}^2 = \frac{(\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1)^2}{(F\tilde{\mathbf x}_1)_1^2 + (F\tilde{\mathbf x}_1)_2^2} + \frac{(\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1)^2}{(F^\top\tilde{\mathbf x}_2)_1^2 + (F^\top\tilde{\mathbf x}_2)_2^2} .
$$

**Gold standard (reprojection) error.** Find the closest pair $(\hat{\mathbf x}\_1, \hat{\mathbf x}\_2)$ that satisfies the constraint *exactly* and measure $\lVert\mathbf x\_1 - \hat{\mathbf x}\_1\rVert^2 + \lVert\mathbf x\_2 - \hat{\mathbf x}\_2\rVert^2$. Under Gaussian pixel noise this is the maximum-likelihood criterion. Finding the closest pair is optimal triangulation, section 6.3.

**Sampson distance.** A first-order approximation of the gold standard that needs no search. Stack the four coordinates of a correspondence into $\mathbf p = (u\_1, v\_1, u\_2, v\_2)$ and let $\varepsilon(\mathbf p) = \tilde{\mathbf x}\_2^\top F\tilde{\mathbf x}\_1$. We look for the smallest correction $\boldsymbol\delta$ with $\varepsilon(\mathbf p + \boldsymbol\delta) = 0$. Linearizing, $\varepsilon(\mathbf p + \boldsymbol\delta) \approx \varepsilon + \nabla\varepsilon^\top\boldsymbol\delta$, and the smallest $\boldsymbol\delta$ that makes this vanish points along the gradient, with length $\lvert\varepsilon\rvert/\lVert\nabla\varepsilon\rVert$. The gradient is easy: $\partial\varepsilon/\partial u\_1 = (F^\top\tilde{\mathbf x}\_2)\_1$, $\partial\varepsilon/\partial v\_1 = (F^\top\tilde{\mathbf x}\_2)\_2$, $\partial\varepsilon/\partial u\_2 = (F\tilde{\mathbf x}\_1)\_1$, $\partial\varepsilon/\partial v\_2 = (F\tilde{\mathbf x}\_1)\_2$. Hence

$$
d_{\text{Sampson}}^2 = \frac{(\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1)^2}{(F\tilde{\mathbf x}_1)_1^2 + (F\tilde{\mathbf x}_1)_2^2 + (F^\top\tilde{\mathbf x}_2)_1^2 + (F^\top\tilde{\mathbf x}_2)_2^2} .
$$

This is the `sampson` function of the snippet above. The constraint removes one dimension from the four-dimensional space of $\mathbf p$, so for an inlier with Gaussian noise $\sigma$ in each coordinate, $d\_{\text{Sampson}}^2/\sigma^2$ is approximately $\chi^2$ with one degree of freedom, and the 95% inlier threshold is $d^2 < 3.84\,\sigma^2$, the value tabulated in post 03.

### 4.6 Robust estimation

Real matches contain outliers, and a single wrong match ruins the least-squares solution. The standard recipe is RANSAC with the seven-point solver (or the five-point solver for $E$), the Sampson distance as residual and the adaptive iteration count of post 03, followed by a refit on the consensus set. We corrupt 80 of the 200 matches (40%) by replacing $\mathbf x\_2$ with a random pixel.

```python
def ransac_fundamental(x1, x2, thresh, p=0.99, max_iters=10000, seed=0):
    """Robust F: seven-point hypotheses, Sampson inliers, adaptive iteration count, final 8-point."""
    rng = np.random.default_rng(seed)
    best = np.zeros(len(x1), bool)
    n_needed, k = max_iters, 0
    while k < n_needed:
        idx = rng.choice(len(x1), 7, replace=False)
        for Fh in seven_point(x1[idx], x2[idx])[0]:
            inl = sampson(Fh, x1, x2) < thresh
            if inl.sum() > best.sum():
                best = inl
                w = inl.mean()
                n_needed = min(max_iters, int(np.ceil(np.log(1 - p) / np.log(1 - w ** 7))))
        k += 1
    for _ in range(3):                    # refit on the consensus set, re-collect the inliers
        Fb = eight_point(x1[best], x2[best])
        best = sampson(Fb, x1, x2) < thresh
    return eight_point(x1[best], x2[best]), best, k


rng = np.random.default_rng(3)
sigma = 0.5
y1 = x1 + rng.normal(0, sigma, x1.shape)
y2 = x2 + rng.normal(0, sigma, x2.shape)
wrong = rng.choice(200, 80, replace=False)                       # 40% of the matches are wrong
y2[wrong] = rng.uniform([0, 0], [W, H], (80, 2))
is_out = np.zeros(200, bool)
is_out[wrong] = True
thresh = np.sqrt(3.84) * sigma                                  # 95% of inliers pass
F_all = eight_point(y1, y2)
F_rs, inl, iters = ransac_fundamental(y1, y2, thresh)
print("8-point on all matches: epipolar error %.2f px" % epipolar_error(F_all, x1, x2))
print("RANSAC: %d iterations, %d inliers (%d true inliers missed, %d outliers kept), error %.3f px"
      % (iters, inl.sum(), (~inl & ~is_out).sum(), (inl & is_out).sum(), epipolar_error(F_rs, x1, x2)))
```

```text
8-point on all matches: epipolar error 20.85 px
RANSAC: 783 iterations, 110 inliers (10 true inliers missed, 0 outliers kept), error 0.184 px
```

The eight-point algorithm on all matches has an epipolar error of 21 px: useless. RANSAC finds 110 of the 120 true inliers and no outliers, with an epipolar error of 0.18 px. It needed 783 samples, more than the 163 that the formula $\log(1-p)/\log(1-w^7)$ predicts for the true inlier ratio $w = 0.6$: the adaptive count uses the inlier ratio of the best model so far, and hypotheses fitted to 7 noisy points collect only part of the inliers. This is the optimism of the formula that post 03 discussed, and the reason for the final refit loop. The missed 10 inliers (8%) are what a 95% threshold is expected to lose plus a little.

## 5. Relative pose from $E$

### 5.1 Decomposing $E$: four solutions

Given $E$ (from the five-point algorithm, or as $K\_2^\top F K\_1$), we want $R$ and $\mathbf t$ with $E \sim [\mathbf t]\_\times R$. The SVD gives them in closed form. Define

$$
W = \begin{pmatrix} 0 & -1 & 0 \\ 1 & 0 & 0 \\ 0 & 0 & 1 \end{pmatrix}, \qquad
Z = \begin{pmatrix} 0 & 1 & 0 \\ -1 & 0 & 0 \\ 0 & 0 & 0 \end{pmatrix},
$$

so that $W$ is a rotation by 90° about $z$, and $ZW = \operatorname{diag}(1, 1, 0)$, $ZW^\top = -\operatorname{diag}(1, 1, 0)$.

**The skew part.** Let $\mathbf u\_3 = \mathbf t/\lVert\mathbf t\rVert$ and complete it to a right-handed orthonormal basis $U = (\mathbf u\_1, \mathbf u\_2, \mathbf u\_3)$. Then $\mathbf u\_3\times\mathbf u\_1 = \mathbf u\_2$, $\mathbf u\_3\times\mathbf u\_2 = -\mathbf u\_1$ and $\mathbf u\_3\times\mathbf u\_3 = \mathbf 0$, which in this basis is exactly the matrix $-Z$: $[\mathbf t]\_\times = -\lVert\mathbf t\rVert\,UZU^\top$.

**The factorization.** If $E = U\operatorname{diag}(1, 1, 0)V^\top$ (scaled so the singular values are 1), then

$$
UZU^\top\cdot UWV^\top = UZWV^\top = U\operatorname{diag}(1,1,0)V^\top = E,
\qquad
UZU^\top\cdot UW^\top V^\top = -E .
$$

Both rotations reproduce $E$ up to sign, and since $E$ is only defined up to scale, both are valid. The translation is the null direction of $E^\top$ (because $\mathbf t^\top[\mathbf t]\_\times = \mathbf 0$), which is $\pm\mathbf u\_3$, sign unknown. So there are **four candidates**:

$$
(R, \mathbf t) \in \big\lbrace (UWV^\top, \mathbf u_3),\ (UWV^\top, -\mathbf u_3),\ (UW^\top V^\top, \mathbf u_3),\ (UW^\top V^\top, -\mathbf u_3)\big\rbrace ,
$$

where the signs of $U$ and $V$ are chosen so that $\det U = \det V = +1$ (otherwise $UWV^\top$ is a reflection).

What do they mean? Flipping $\mathbf t$ swaps which camera is "in front" along the baseline: the **baseline reversal**. The two rotations differ by $UW^\top V^\top(UWV^\top)^\top = UW^{\top 2}U^\top = U\operatorname{diag}(-1,-1,1)U^\top$, a rotation by 180° about $\mathbf u\_3$, the baseline: the **twisted pair**, where camera 2 is turned around the baseline so that it looks the other way. All four are algebraically perfect; geometry has to decide.

### 5.2 Cheirality: points must be in front of the cameras

Only one of the four configurations places the scene in front of both cameras (positive depth, the **cheirality** condition). So we triangulate the matches with each candidate (section 6) and count how many points get positive depth in both cameras. With noise-free data the count is all-or-nothing; with noise and outliers we take the candidate with the largest count.

```python
def decompose_essential(E):
    """The four (R, t) with E ~ [t]_x R and |t| = 1."""
    U, _, Vt = np.linalg.svd(E)
    if np.linalg.det(U) < 0:
        U = -U
    if np.linalg.det(Vt) < 0:
        Vt = -Vt
    Wm = np.array([[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]])
    Ra, Rb, u3 = U @ Wm @ Vt, U @ Wm.T @ Vt, U[:, 2]
    return [(Ra, u3), (Ra, -u3), (Rb, u3), (Rb, -u3)]


def triangulate_dlt(P1, P2, x1, x2):
    """Linear triangulation of N correspondences; returns N x 3 points."""
    A = np.stack([x1[:, :1] * P1[2] - P1[0], x1[:, 1:] * P1[2] - P1[1],
                  x2[:, :1] * P2[2] - P2[0], x2[:, 1:] * P2[2] - P2[1]], axis=1)   # N x 4 x 4
    Xh = np.linalg.svd(A)[2][:, -1]
    return Xh[:, :3] / Xh[:, 3:]


def relative_pose(E, K, x1, x2, verbose=False):
    """Pick the decomposition of E that puts the most points in front of both cameras."""
    P1 = K @ np.c_[np.eye(3), np.zeros(3)]
    best = None
    for Rc, tc in decompose_essential(E):
        Xc = triangulate_dlt(P1, K @ np.c_[Rc, tc], x1, x2)
        n_front = np.sum((Xc[:, 2] > 0) & ((Xc @ Rc.T + tc)[:, 2] > 0))
        if verbose:
            print("  candidate: %3d of %d points in front of both cameras" % (n_front, len(x1)))
        if best is None or n_front > best[0]:
            best = (n_front, Rc, tc, Xc)
    return best[1], best[2], best[3]


def rotation_angle(Ra, Rb):
    """Angle (degrees) of the rotation Ra Rb^T."""
    return np.rad2deg(np.arccos(np.clip((np.trace(Ra @ Rb.T) - 1) / 2, -1, 1)))


def direction_angle(a, b):
    """Angle (degrees) between two vectors."""
    return np.rad2deg(np.arccos(np.clip(a @ b / np.linalg.norm(a) / np.linalg.norm(b), -1, 1)))


E_est = K.T @ F_rs @ K                       # same K in both cameras
R_est, t_est, X_est = relative_pose(E_est, K, y1[inl], y2[inl], verbose=True)
print("rotation error %.3f deg, translation direction error %.3f deg"
      % (rotation_angle(R_est, R), direction_angle(t_est, t)))
scale = np.linalg.norm(t)                    # unknown from images; borrowed from the ground truth
print("3D error after fixing the scale: %.4f m (median)"
      % np.median(np.linalg.norm(X_est * scale - X[inl], axis=1)))
```

```text
  candidate:   0 of 110 points in front of both cameras
  candidate:   0 of 110 points in front of both cameras
  candidate: 110 of 110 points in front of both cameras
  candidate:   0 of 110 points in front of both cameras
rotation error 0.118 deg, translation direction error 0.461 deg
3D error after fixing the scale: 0.0307 m (median)
```

With $K$ known, $E$ comes from the robust $F$ of section 4.6. Exactly one candidate has all 110 inliers in front of both cameras. The rotation is recovered to 0.12° and the translation direction to 0.46°. The 3D points come out in units where $\lVert\mathbf t\rVert = 1$; after borrowing the true baseline length, their median error is 3.1 cm at depths of 2 to 8 m.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-four-poses.svg" caption="The four decompositions of the true $E$ of the running example, seen from above ($z$ to the right, $x$ down the page; camera 1 purple at the origin, the candidate camera 2 blue, both drawn with their viewing direction). The star is the point $(0.5,-0.4,5.0)$ triangulated with that candidate; a ray is solid green where the point is in front of the camera and dashed red where it is behind. The title counts the 200 points with positive depth in both cameras. Only the fourth candidate is consistent (200/200); the others put the points behind camera 1, behind camera 2 or behind both." %}

### 5.3 Refining the pose

The linear pipeline (eight-point, rank-2 projection, $E = K^\top F K$, SVD) never minimized a geometric error, and it estimated 7 parameters where 5 suffice. A short nonlinear refinement fixes both: parameterize the pose by a rotation vector (3 numbers) and the direction of $\mathbf t$ by two spherical angles (2 numbers), and minimize the Sampson distances with Levenberg-Marquardt (post 02, section 4.2). The parameterization keeps $E$ on the manifold of essential matrices automatically.

```python
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation


def pose_to_F(params, K):
    """Five pose parameters (rotation vector, two angles of the unit t) -> F."""
    Rp = Rotation.from_rotvec(params[:3]).as_matrix()
    th, ph = params[3:]
    tp = np.array([np.sin(th) * np.cos(ph), np.sin(th) * np.sin(ph), np.cos(th)])
    Ki = np.linalg.inv(K)
    return Ki.T @ skew(tp) @ Rp @ Ki, Rp, tp


def refine_pose(R0, t0, K, x1, x2):
    t0 = t0 / np.linalg.norm(t0)
    p0 = np.r_[Rotation.from_matrix(R0).as_rotvec(), np.arccos(t0[2]), np.arctan2(t0[1], t0[0])]
    res = least_squares(lambda p: sampson(pose_to_F(p, K)[0], x1, x2), p0, method="lm")
    return pose_to_F(res.x, K)[1:]


R_ref, t_ref = refine_pose(R_est, t_est, K, y1[inl], y2[inl])
print("refined: rotation error %.3f deg, translation direction error %.3f deg"
      % (rotation_angle(R_ref, R), direction_angle(t_ref, t)))
```

```text
refined: rotation error 0.102 deg, translation direction error 0.385 deg
```

The rotation error drops from 0.118° to 0.102° and the translation direction error from 0.46° to 0.39°. The gains are modest here because the linear estimate was already good; on harder data (fewer points, narrow field of view) the refinement matters more. In a full system this step is subsumed by bundle adjustment ([post 05]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})), which refines the poses and the 3D points together.

### 5.4 The scale nobody can see

We had to borrow $\lVert\mathbf t\rVert$ from the ground truth. Two images determine the relative pose and the structure only **up to a similarity transform**: the global rotation and translation of the world (we fixed them by putting camera 1 at the origin) and one global scale. Monocular SLAM drifts in scale for this reason, and COLMAP models come in arbitrary units. The scale has to come from outside: a stereo rig with a calibrated baseline (section 8), an IMU ([post 06]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})), an object of known size, or a learned metric depth prior ([post 07]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})).

## 6. Triangulation

Given both cameras and a correspondence, where is the 3D point? Without noise, the two back-projected rays meet. With noise they are **skew lines** that pass close to each other without meeting, and "the intersection" must be defined. The three standard answers differ in what they minimize.

### 6.1 The midpoint method

The most intuitive answer: find the shortest segment between the two rays and take its midpoint. In camera-1 coordinates the rays are $a\,\mathbf d\_1$ (from $\mathbf C\_1 = \mathbf 0$) and $\mathbf C\_2 + b\,\mathbf d\_2$, with $\mathbf d\_1 = K^{-1}\tilde{\mathbf x}\_1$ and $\mathbf d\_2 = R^\top K^{-1}\tilde{\mathbf x}\_2$ (a camera-2 direction rotated into camera 1). Minimizing $\lVert a\mathbf d\_1 - \mathbf C\_2 - b\mathbf d\_2\rVert^2$ over $a$ and $b$, the derivatives give the $2\times 2$ normal equations

$$
\begin{pmatrix} \mathbf d_1^\top\mathbf d_1 & -\mathbf d_1^\top\mathbf d_2 \\ \mathbf d_1^\top\mathbf d_2 & -\mathbf d_2^\top\mathbf d_2 \end{pmatrix}
\begin{pmatrix} a \\ b \end{pmatrix} =
\begin{pmatrix} \mathbf d_1^\top\mathbf C_2 \\ \mathbf d_2^\top\mathbf C_2 \end{pmatrix},
\qquad
\hat{\mathbf X} = \tfrac12\big(a\mathbf d_1 + \mathbf C_2 + b\mathbf d_2\big).
$$

It is cheap and works well when both cameras see the point from similar distances. Its weakness is that it minimizes a distance in **3D**, while the noise lives in **pixels**: a 1 cm miss is a large pixel error for a camera 1 m away and a small one for a camera 5 m away. It also needs calibrated rays, so it is not available in a projective reconstruction.

### 6.2 Linear (DLT) triangulation

The linear method of [neural rendering post 1]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}) (section 3) uses $\tilde{\mathbf x}\_i\times P\_i\tilde{\mathbf X} = \mathbf 0$. With $\mathbf p\_i^{k\top}$ the $k$-th row of $P\_i$, each view gives two equations, $(u\_i\mathbf p\_i^{3\top} - \mathbf p\_i^{1\top})\tilde{\mathbf X} = 0$ and $(v\_i\mathbf p\_i^{3\top} - \mathbf p\_i^{2\top})\tilde{\mathbf X} = 0$, and the four equations are solved by SVD. What does it minimize? The residual of the first equation is $\mathbf p\_i^{3\top}\tilde{\mathbf X}\,u\_i - \mathbf p\_i^{1\top}\tilde{\mathbf X} = \lambda\_i\,(u\_i - \hat u\_i)$, where $\lambda\_i = \mathbf p\_i^{3\top}\tilde{\mathbf X}$ is the depth of the point in camera $i$ and $\hat u\_i$ its reprojection. So the DLT minimizes **pixel errors weighted by depth**: a far camera's equations count more, and the error is pushed into the near camera's image. It is the same bias as the midpoint method, by a different route.

### 6.3 Optimal triangulation

The statistically right answer minimizes the reprojection error

$$
\min_{\mathbf X}\ \lVert\mathbf x_1 - \pi_1(\mathbf X)\rVert^2 + \lVert\mathbf x_2 - \pi_2(\mathbf X)\rVert^2 ,
$$

which is the maximum-likelihood estimate under Gaussian pixel noise. Hartley and Sturm (1997) found a non-iterative way to compute it exactly. The trick is to search over corrected image points instead of 3D points. Any pair $(\hat{\mathbf x}\_1, \hat{\mathbf x}\_2)$ that satisfies the epipolar constraint exactly back-projects to rays that meet, so the problem is equivalent to

$$
\min\ \lVert\mathbf x_1 - \hat{\mathbf x}_1\rVert^2 + \lVert\mathbf x_2 - \hat{\mathbf x}_2\rVert^2 \quad\text{subject to}\quad \hat{\mathbf x}_2^\top F\hat{\mathbf x}_1 = 0 .
$$

Corresponding points lie on corresponding epipolar lines. So parameterize the pencil of epipolar lines in image 1 by one number $\tau$; the matching line in image 2 follows from $F$. The best $\hat{\mathbf x}\_i$ on a given line is the foot of the perpendicular from $\mathbf x\_i$, so the cost is a function of $\tau$ alone, $d\_1(\tau)^2 + d\_2(\tau)^2$. Concretely:

1. Translate both images so that $\mathbf x\_1$ and $\mathbf x\_2$ are at the origin, and rotate them so that the epipoles land on the $u$ axis, at $(1, 0, f\_1)$ and $(1, 0, f\_2)$. Then $F$ takes a special form with four free entries $a, b, c, d$.
2. The line through the epipole and the point $(0, \tau, 1)$ of image 1 is at squared distance $d\_1^2 = \tau^2/(1 + f\_1^2\tau^2)$ from the origin. Its partner in image 2 is at $d\_2^2 = (c\tau + d)^2/\big((a\tau + b)^2 + f\_2^2(c\tau + d)^2\big)$.
3. Setting the derivative of $d\_1^2 + d\_2^2$ to zero and clearing denominators gives a **polynomial of degree 6** in $\tau$,

   $$
   g(\tau) = \tau\big((a\tau+b)^2 + f_2^2(c\tau+d)^2\big)^2 - (ad - bc)(1 + f_1^2\tau^2)^2(a\tau+b)(c\tau+d) .
   $$

4. Evaluate the cost at its real roots and at $\tau\to\infty$, keep the smallest, take the feet of the perpendiculars as $\hat{\mathbf x}\_1, \hat{\mathbf x}\_2$, transform back and intersect the (now exactly meeting) rays.

The result is **projectively invariant**: it does not depend on the choice of coordinates, unlike the midpoint and DLT methods. Lindstrom's "Triangulation made easy" (CVPR 2010) later gave a short iterative scheme that reaches the same optimum without solving the degree-6 polynomial, and is a popular faster replacement.

```python
def triangulate_midpoint(K, R, t, x1, x2):
    """Midpoint of the shortest segment between the two back-projected rays (camera-1 frame)."""
    Ki = np.linalg.inv(K)
    d1 = hom(x1) @ Ki.T                       # ray directions from C1 = 0
    d2 = hom(x2) @ Ki.T @ R                   # ray directions of camera 2, rotated into frame 1
    c2 = -R.T @ t                             # camera-2 centre
    # minimize |a d1 - (c2 + b d2)|^2 over the ray parameters a, b (2 x 2 normal equations)
    d11, d12, d22 = (d1 * d1).sum(1), (d1 * d2).sum(1), (d2 * d2).sum(1)
    r1, r2 = d1 @ c2, d2 @ c2
    den = d11 * d22 - d12 ** 2
    a = (r1 * d22 - r2 * d12) / den
    b = (r1 * d12 - r2 * d11) / den
    return 0.5 * (a[:, None] * d1 + c2 + b[:, None] * d2)


def optimal_correction(F, x1, x2):
    """Hartley-Sturm: the closest pair (x1', x2') with x2'^T F x1' = 0, for one correspondence."""
    T1 = np.array([[1, 0, -x1[0]], [0, 1, -x1[1]], [0, 0, 1.0]])   # move both points to the origin
    T2 = np.array([[1, 0, -x2[0]], [0, 1, -x2[1]], [0, 0, 1.0]])
    Fm = np.linalg.inv(T2).T @ F @ np.linalg.inv(T1)
    e1, e2 = null_vector(Fm), null_vector(Fm.T)
    e1, e2 = e1 / np.hypot(e1[0], e1[1]), e2 / np.hypot(e2[0], e2[1])
    R1 = np.array([[e1[0], e1[1], 0], [-e1[1], e1[0], 0], [0, 0, 1]])   # epipoles to (1, 0, f)
    R2 = np.array([[e2[0], e2[1], 0], [-e2[1], e2[0], 0], [0, 0, 1]])
    Fm = R2 @ Fm @ R1.T
    f1, f2 = e1[2], e2[2]
    a, b, c, d = Fm[1, 1], Fm[1, 2], Fm[2, 1], Fm[2, 2]
    # epipolar lines through (0, t, 1) in image 1; g(t) = 0 at the stationary points of the cost
    P = np.polynomial.polynomial
    atb, ctd = np.array([b, a]), np.array([d, c])
    q = P.polyadd(P.polymul(atb, atb), f2 ** 2 * P.polymul(ctd, ctd))
    g = P.polysub(P.polymul([0, 1], P.polymul(q, q)),
                  (a * d - b * c) * P.polymul(P.polymul([1, 0, f1 ** 2], [1, 0, f1 ** 2]),
                                              P.polymul(atb, ctd)))
    cands = [r.real for r in P.polyroots(g) if abs(r.imag) < 1e-9]
    cost = lambda s: s ** 2 / (1 + f1 ** 2 * s ** 2) + (c * s + d) ** 2 / ((a * s + b) ** 2 + f2 ** 2 * (c * s + d) ** 2)
    s = min(cands, key=cost)
    if cost(s) > 1 / f1 ** 2 + c ** 2 / (a ** 2 + f2 ** 2 * c ** 2):   # the asymptote s -> infinity
        s = 1e12
    l1 = np.array([s * f1, 1, -s])
    l2 = np.array([-f2 * (c * s + d), a * s + b, c * s + d])
    foot = lambda l: np.array([-l[0] * l[2], -l[1] * l[2], l[0] ** 2 + l[1] ** 2])   # nearest point to 0
    y1 = np.linalg.inv(T1) @ R1.T @ foot(l1)
    y2 = np.linalg.inv(T2) @ R2.T @ foot(l2)
    return y1[:2] / y1[2], y2[:2] / y2[2]


def triangulate_optimal(K, R, t, x1, x2):
    """Correct each pair onto the epipolar constraint, then intersect the (now meeting) rays."""
    Ki = np.linalg.inv(K)
    Fm = Ki.T @ skew(t) @ R @ Ki
    pairs = [optimal_correction(Fm, a, b) for a, b in zip(x1, x2)]
    c1, c2 = np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs])
    return triangulate_dlt(K @ np.c_[np.eye(3), np.zeros(3)], K @ np.c_[R, t], c1, c2)



def reprojection_rms(K, R, t, Xe, x1, x2):
    """RMS reprojection residual (pixels) in image 1 and in image 2."""
    r1 = project(K, np.eye(3), np.zeros(3), Xe) - x1
    r2 = project(K, R, t, Xe) - x2
    return np.sqrt(np.mean(np.sum(r1 ** 2, 1))), np.sqrt(np.mean(np.sum(r2 ** 2, 1)))


# a second pair: points 1-2 m from camera 1, camera 2 about 4-5 m away, turned 40 degrees
Ra, Ca = rot("y", 40), np.array([3.0, 0.0, -2.0])
ta = -Ra @ Ca
rng = np.random.default_rng(5)
uv = rng.uniform([200, 150], [440, 330], (200, 2))
Xa = (hom(uv) @ np.linalg.inv(K).T) * rng.uniform(1.0, 2.0, 200)[:, None]
configs = {"main pair": (R, t, X), "asymmetric": (Ra, ta, Xa)}

results = {}
for name, (Rp, tp, Xq) in configs.items():
    a1, a2 = project(K, np.eye(3), np.zeros(3), Xq), project(K, Rp, tp, Xq)
    P1, P2 = K @ np.c_[np.eye(3), np.zeros(3)], K @ np.c_[Rp, tp]
    stats = {"midpoint": [], "DLT": [], "optimal": []}
    for trial in range(20):
        o1 = a1 + rng.normal(0, 1.0, a1.shape)          # 1 px of noise in both images
        o2 = a2 + rng.normal(0, 1.0, a2.shape)
        for method, Xe in (("midpoint", triangulate_midpoint(K, Rp, tp, o1, o2)),
                           ("DLT", triangulate_dlt(P1, P2, o1, o2)),
                           ("optimal", triangulate_optimal(K, Rp, tp, o1, o2))):
            stats[method].append(reprojection_rms(K, Rp, tp, Xe, o1, o2)
                                 + (np.sqrt(np.mean(np.sum((Xe - Xq) ** 2, 1))),))
    results[name] = stats
    print(name)
    for method, v in stats.items():
        m1, m2, m3 = np.mean(v, axis=0)
        print("  %-8s residual image 1: %.3f px, image 2: %.3f px, total %.3f px; 3D RMS error %.1f mm"
              % (method, m1, m2, np.hypot(m1, m2), 1000 * m3))
```

```text
main pair
  midpoint residual image 1: 0.700 px, image 2: 0.746 px, total 1.023 px; 3D RMS error 114.1 mm
  DLT      residual image 1: 0.700 px, image 2: 0.741 px, total 1.019 px; 3D RMS error 113.6 mm
  optimal  residual image 1: 0.740 px, image 2: 0.695 px, total 1.016 px; 3D RMS error 113.6 mm
asymmetric
  midpoint residual image 1: 1.694 px, image 2: 0.519 px, total 1.772 px; 3D RMS error 16.0 mm
  DLT      residual image 1: 1.685 px, image 2: 0.521 px, total 1.764 px; 3D RMS error 16.0 mm
  optimal  residual image 1: 0.299 px, image 2: 0.941 px, total 0.988 px; 3D RMS error 15.5 mm
```

The two configurations tell different stories. In the main pair, where both cameras see the points from similar distances, the three methods agree to within 1%. In the **asymmetric pair**, the points are 1-2 m from camera 1 and 4-5 m from camera 2. Midpoint and DLT put almost all the residual into image 1 (1.69 px against 0.52 px): they trust the near camera less in pixels because they measure 3D distance or depth-weighted error. Optimal triangulation spreads the correction as the noise model asks and gets a total RMS of 0.988 px. That number has a meaning: four measured coordinates, three unknowns, so the squared residual of a correct model has one degree of freedom and an expected value of $\sigma^2$; with $\sigma = 1$ px the total RMS should be about 1 px, and it is. The linear methods report 1.76 px: their residuals are inflated so much that a test calibrated for 1 px noise (the 95% threshold of section 4.5) would reject many true inliers. The 3D accuracy differs less (16.0 mm against 15.5 mm), so for initializing bundle adjustment any method is fine; for *testing* inliers by their reprojection error, as SfM systems do, use the optimal (or Lindstrom's) method.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-triangulation.svg" caption="Top: one noisy correspondence of the asymmetric pair (1 px noise), zoomed to ±3 px around the observations (black crosses) in image 1 (left) and image 2 (right). The purple lines are the matching epipolar lines on which Hartley-Sturm places the corrected points (green). The reprojections of the midpoint (cyan triangle) and DLT (orange square) estimates almost coincide; they leave 1.83 and 1.81 px of residual in image 1 and 0.57 and 0.58 px in image 2 (totals 1.92 and 1.90 px), while the optimal estimate leaves 0.32 and 1.04 px, a total of 1.09 px. Bottom: RMS residual per image (bars) and in total (diamonds), averaged over 20 trials of 200 points; the dashed line is the expected total for 1 px noise. Left: the main pair, where all three agree; right: the asymmetric pair." %}

### 6.4 How precise is a triangulated depth?

Even optimal triangulation cannot beat the geometry. A pixel error moves a ray by an angle of about $\sigma/f$, and the point moves along the other ray by that angle divided by the sine of the **triangulation angle** between the rays. For a point at depth $Z$ seen from a baseline $b$ roughly perpendicular to the viewing direction, the triangulation angle is about $b/Z$, so the depth error is about

$$
\delta Z \approx \frac{Z^2}{f\,b}\,\delta d ,
$$

where $\delta d$ is the error in the pixel difference between the two images. **Depth error grows with the square of the distance** and shrinks with the baseline and the focal length. [Neural rendering post 1]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}) shows the blow-up of triangulation error at small angles in a figure; section 8.2 derives this formula exactly for a rectified stereo pair and draws its quantization cells.

## 7. Degenerate configurations

The eight-point algorithm needs the 8 correspondences to determine $F$ uniquely. Two common situations make that impossible, and they are not rare corner cases: a camera panning on a tripod, a phone turning in place, a drone over flat ground, a camera looking at a wall or a table.

### 7.1 Pure rotation

If the camera only rotates, $\mathbf t = \mathbf 0$ and $E = [\mathbf 0]\_\times R = 0$. There is no baseline, no epipolar plane and no epipolar line. Every point, at every depth, maps by the same homography

$$
\tilde{\mathbf x}_2 \sim H_\infty\tilde{\mathbf x}_1 = K_2 R K_1^{-1}\tilde{\mathbf x}_1 ,
$$

which is how panoramas are stitched. Depth cannot be recovered at all: all points of a ray land on one pixel in both images. The rotation, on the other hand, is perfectly well defined and can be read off $H\_\infty$ when $K$ is known.

### 7.2 Planar scenes

If all points lie on a plane $\mathbf n^\top\mathbf X\_1 = d$ (unit normal $\mathbf n$, distance $d > 0$, in camera-1 coordinates), then $\mathbf n^\top\mathbf X\_1/d = 1$ for every point and

$$
\mathbf X_2 = R\mathbf X_1 + \mathbf t\,\frac{\mathbf n^\top\mathbf X_1}{d} = \Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)\mathbf X_1 ,
\qquad
H = K_2\Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)K_1^{-1} .
$$

The two images of a plane are related by this **plane-induced homography**, the same object as in post 02, where the plane was a calibration board. Why does this break the eight-point algorithm? For any vector $\mathbf e$, the matrix $F' = [\mathbf e]\_\times H$ satisfies every correspondence of the plane:

$$
\tilde{\mathbf x}_2^\top[\mathbf e]_\times H\tilde{\mathbf x}_1 \sim \tilde{\mathbf x}_2^\top[\mathbf e]_\times\tilde{\mathbf x}_2 = \tilde{\mathbf x}_2\cdot(\mathbf e\times\tilde{\mathbf x}_2) = 0 .
$$

The true $F = [\mathbf e\_2]\_\times H$ is one member of this family (section 3.1 with $H$ in place of $H\_\infty$; they differ by a term that $[\mathbf e\_2]\_\times$ annihilates), but the data cannot single it out: the solutions form a **three-dimensional** linear family, so $A$ has three zero singular values instead of one. Pure rotation is the same story with $H = H\_\infty$.

### 7.3 Seeing it in the data

```python
def make_pair(R, C2, plane=None, n_pts=200, seed=6):
    """Correspondences for camera 2 = (R, C2); points at random depths or on a plane n.X = 1."""
    rng = np.random.default_rng(seed)
    uv = rng.uniform([20, 20], [W - 20, H - 20], (n_pts, 2))
    rays = hom(uv) @ np.linalg.inv(K).T
    depth = rng.uniform(2.0, 8.0, n_pts) if plane is None else 1.0 / (rays @ plane)
    Xs = rays * depth[:, None]
    return uv, project(K, R, -R @ C2, Xs)


scenes = {
    "general": make_pair(R, C2),
    "planar": make_pair(R, C2, plane=np.array([0.05, -0.03, 0.2])),   # the plane Z = 5 - 0.25 X + 0.15 Y
    "rotation": make_pair(R, np.zeros(3)),
}
for name, (a, b) in scenes.items():
    q1, q2 = normalize_points(a)[0], normalize_points(b)[0]
    s = np.linalg.svd(np.einsum("ni,nj->nij", q2, q1).reshape(-1, 9))[1]
    print("%-8s smallest singular values of A: %s" % (name, np.array2string(s[-4:] / s[0], precision=2)))

rng = np.random.default_rng(7)
for name in ("general", "planar"):
    a, b = scenes[name]
    a, b = a + rng.normal(0, 1.0, a.shape), b + rng.normal(0, 1.0, b.shape)
    Fn = eight_point(a, b)
    Rn, tn, _ = relative_pose(K.T @ Fn @ K, K, a, b)
    print("%-8s 8-point with 1 px noise: rotation error %5.2f deg, translation error %5.1f deg"
          % (name, rotation_angle(Rn, R), direction_angle(tn, t)))
```

```text
general  smallest singular values of A: [0.2  0.09 0.08 0.  ]
planar   smallest singular values of A: [0.2 0.  0.  0. ]
rotation smallest singular values of A: [0.2 0.  0.  0. ]
general  8-point with 1 px noise: rotation error  0.14 deg, translation error   0.1 deg
planar   8-point with 1 px noise: rotation error  5.93 deg, translation error  92.3 deg
```

For the general scene exactly one singular value of $A$ is zero; for the plane and for the pure rotation three are. With 1 px of noise, the eight-point algorithm on the general scene recovers the pose to 0.14° and 0.1°; on the plane it returns a member of the family that happens to fit the noise best, and the "recovered" translation is 92° off: a random direction.

### 7.4 Detecting and handling degeneracy

Since the degenerate cases are exactly those in which a **homography** explains the matches, the practical test is to fit both models and compare. A simple version: count how many matches each model accepts at the same confidence (95%; for the homography the transfer error $\lVert\mathbf x\_2 - H\mathbf x\_1\rVert$ has noise from both images, hence the threshold $\sqrt{2\cdot 5.99}\,\sigma$).

```python
def homography_dlt(x1, x2):
    """Normalized DLT for x2 ~ H x1 (as in post 02)."""
    q1, T1 = normalize_points(x1)
    q2, T2 = normalize_points(x2)
    z = np.zeros_like(q1)
    A = np.r_[np.c_[z, -q1 * q2[:, 2:], q1 * q2[:, 1:2]], np.c_[q1 * q2[:, 2:], z, -q1 * q2[:, :1]]]
    Hm = np.linalg.inv(T2) @ null_vector(A).reshape(3, 3) @ T1
    return Hm / Hm[2, 2]


def transfer(Hm, x):
    p = hom(x) @ Hm.T
    return p[:, :2] / p[:, 2:]


def inlier_ratio(x1, x2, sigma):
    """(# homography inliers) / (# fundamental-matrix inliers), both at 95% of the inliers."""
    Fm, Hm = ransac_fundamental(x1, x2, np.sqrt(3.84) * sigma)[0], homography_dlt(x1, x2)
    n_F = np.sum(sampson(Fm, x1, x2) < np.sqrt(3.84) * sigma)
    n_H = np.sum(np.linalg.norm(transfer(Hm, x1) - x2, axis=1) < np.sqrt(2 * 5.99) * sigma)
    return n_H / n_F


scenes["small baseline"] = make_pair(R, 0.03 * C2 / np.linalg.norm(C2))   # 3 cm instead of 86 cm
for name, (a, b) in scenes.items():
    r = inlier_ratio(a + rng.normal(0, 1.0, a.shape), b + rng.normal(0, 1.0, b.shape), 1.0)
    print("%-15s H/F inlier ratio %.2f" % (name, r))
```

```text
general         H/F inlier ratio 0.03
planar          H/F inlier ratio 0.98
rotation        H/F inlier ratio 0.98
small baseline  H/F inlier ratio 0.93
```

In the general scene the homography explains 3% of what $F$ explains; for the plane and the rotation, 98%. The last row is the important one in practice: **a small baseline is nearly degenerate**. With 3 cm of camera motion, the parallax between near and far points is below the noise, and a homography explains 93% of the matches. The right panel of the next figure sweeps the baseline.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-degeneracy.svg" caption="Left: all nine singular values $s\_k$ of the normalized eight-point matrix $A$ (noise-free, relative to $s\_1$; zeros are drawn at $10^{-17}$) for the general scene (purple), a planar scene (orange) and a pure rotation (blue). The general scene has one zero singular value, the degenerate ones three: a three-dimensional family of solutions. Right: ratio of homography to fundamental-matrix inliers against the baseline $\lVert\mathbf C\_2\rVert$ (1 px noise, mean of 5 scenes), for random depths (purple) and a plane (orange). For the general scene the ratio falls from 0.92 at 3 cm to 0.58 at 8 cm and 0.02 at 86 cm; for the plane it stays near 1 at every baseline." %}

Systems handle the result in different ways:

- **SLAM initialization** fits both models and chooses. ORB-SLAM (Mur-Artal et al., 2015) scores each model by its truncated $\chi^2$ residuals and selects the homography when $S\_H/(S\_H + S\_F) > 0.45$, decomposing it into a pose when the scene is planar; if neither model is convincing, it waits for more parallax. Torr's **GRIC** criterion makes the same comparison with an information-theoretic penalty for model complexity.
- **SfM** labels image pairs whose matches are explained by a homography as planar or panoramic, and avoids initializing the reconstruction from them.
- **Robust estimation**: a dominant plane can fool RANSAC even when the scene is not planar, because samples drawn mostly from the plane give a wrong $F$ that still collects many inliers. DEGENSAC (Chum, Werner and Matas, 2005) detects samples in which five or more of the seven points are related by a homography and repairs the model.
- **Calibrated cameras**: use the five-point solver, which (unlike the eight-point algorithm) still gives a finite number of candidate poses for a planar scene.

For pure rotation nothing can recover depth; the correct response is to estimate $R$ from the homography and to wait for translation.

## 8. Stereo: rectification, disparity and depth

So far the cameras were wherever they happened to be. A **stereo camera** fixes the second camera rigidly next to the first and calibrates the pair once (post 02, section 7). Then $F$ is known in advance, and the question changes from "what is the geometry?" to "what is the depth of every pixel?". The trick that makes dense matching practical is rectification.

### 8.1 Rectified geometry is a special $F$

Suppose both cameras have the same $K$, the same orientation, and camera 2 is displaced along camera 1's $x$ axis by the baseline $b$: $R = I$, $\mathbf t = (-b, 0, 0)$. Then the epipole is the point at infinity $\mathbf e = (1, 0, 0)^\top$, and

$$
F \sim [\mathbf e]_\times = \begin{pmatrix} 0 & 0 & 0 \\ 0 & 0 & -1 \\ 0 & 1 & 0 \end{pmatrix},
\qquad
\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1 = v_1 - v_2 = 0 .
$$

**Epipolar lines are image rows, and matches have the same $v$.** Rectification transforms an arbitrary calibrated pair into this form by rotating both cameras virtually, which post 02 derived (the Fusiello-Trucco-Verri construction). In terms of this post: rectification applies homographies $H\_1, H\_2$ to the two images, and the fundamental matrix of the new pair is $H\_2^{-\top}FH\_1^{-1}$, because $\tilde{\mathbf x}\_2^\top F\tilde{\mathbf x}\_1 = (H\_2\tilde{\mathbf x}\_2)^\top H\_2^{-\top}FH\_1^{-1}(H\_1\tilde{\mathbf x}\_1)$. A pair is rectified exactly when this matrix is proportional to $[\mathbf e]\_\times$. We check that on the running example.

```python
def rectify_rotation(R, t):
    """Fusiello-style rectifying rotation (post 02): new x axis along the baseline."""
    c2 = -R.T @ t                                   # camera-2 centre in camera-1 coordinates
    r1 = c2 / np.linalg.norm(c2)
    r2 = np.cross([0.0, 0.0, 1.0], r1)
    r2 /= np.linalg.norm(r2)
    return np.array([r1, r2, np.cross(r1, r2)])


Rr = rectify_rotation(R, t)
H1 = K @ Rr @ np.linalg.inv(K)                     # image 1 -> rectified image 1
H2 = K @ Rr @ R.T @ np.linalg.inv(K)               # image 2 -> rectified image 2
F_rect = np.linalg.inv(H2).T @ F @ np.linalg.inv(H1)
print("F_rect / |F_rect| =\n", np.round(F_rect / np.linalg.norm(F_rect), 4) + 0.0)
r1, r2 = transfer(H1, x1), transfer(H2, x2)
print("max |v1 - v2| after rectification: %.2e px" % np.abs(r1[:, 1] - r2[:, 1]).max())
disp = r1[:, 0] - r2[:, 0]                          # disparity d = u1 - u2
b = np.linalg.norm(t)                               # baseline
Z_rect = (X @ Rr.T)[:, 2]                           # depth in the rectified camera-1 frame
print("disparity range %.1f to %.1f px;  max |f b / d - Z| = %.2e m"
      % (disp.min(), disp.max(), np.abs(K[0, 0] * b / disp - Z_rect).max()))
```

```text
F_rect / |F_rect| =
 [[ 0.      0.      0.    ]
 [ 0.      0.      0.7071]
 [ 0.     -0.7071  0.    ]]
max |v1 - v2| after rectification: 2.27e-13 px
disparity range 48.6 to 268.2 px;  max |f b / d - Z| = 2.04e-14 m
```

The transformed $F$ is $-[\mathbf e]\_\times/\sqrt 2$, matched points share their row to $10^{-13}$ px, and the depth computed from the horizontal offset (next section) agrees with the true depth to $10^{-14}$ m.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-rectification.svg" caption="Top: images 1 and 2 of the running example with five correspondences (coloured dots) and their epipolar lines; gray dots are all 200 points. The lines are slanted and converge towards the epipoles far to the right. Bottom: after the rectifying homographies $H\_1=KR\_{\text{rect}}K^{-1}$ and $H\_2=KR\_{\text{rect}}R^\top K^{-1}$, the image borders become the purple quadrilaterals, all epipolar lines are horizontal, and each correspondence lies on one row in both images. The large offsets in $u$ are the disparities, 49 to 268 px for these depths of 2 to 8 m with an 86 cm baseline." %}

Without calibration, rectification is still possible from $F$ alone, but the homographies are no longer unique. Hartley (1999) sends $\mathbf e\_2$ to infinity with a homography that is close to a rigid motion near the image centre, then chooses $H\_1$ from the family compatible with $F$ to minimize the horizontal disparities; Loop and Zhang (1999) choose the pair to minimize projective distortion. OpenCV's `stereoRectifyUncalibrated` follows Hartley's method. The results distort the images more than calibrated rectification, which is one more reason to calibrate stereo rigs.

### 8.2 Disparity and depth

In a rectified pair with $P\_1 = K[I \mid \mathbf 0]$ and $P\_2 = K[I \mid -b\,\mathbf e\_x]$, a point $(X, Y, Z)$ projects to

$$
u_1 = f\frac{X}{Z} + c_x, \qquad u_2 = f\frac{X - b}{Z} + c_x, \qquad v_1 = v_2 = f\frac{Y}{Z} + c_y .
$$

The **disparity** is the horizontal offset $d = u\_1 - u\_2 = fb/Z$, so

$$
Z = \frac{f\,b}{d}, \qquad X = \frac{b\,(u_1 - c_x)}{d}, \qquad Y = \frac{b\,(v_1 - c_y)}{d} .
$$

These three equations are what OpenCV packs into the $4\times 4$ reprojection matrix $Q$ returned by `stereoRectify`. Depth is inversely proportional to disparity: near points have large disparity, the point at infinity has $d = 0$. Differentiating, an error $\delta d$ in the disparity gives

$$
\delta Z = \Big\lvert\frac{\partial Z}{\partial d}\Big\rvert\,\delta d = \frac{fb}{d^2}\,\delta d = \frac{Z^2}{f\,b}\,\delta d ,
$$

the formula of section 6.4, now exact to first order. With $f = 500$ px, $b = 0.12$ m and a matcher accurate to a quarter pixel, the depth error at 5 m is $25/60\cdot 0.25$ m $= 10.4$ cm, and at 10 m it is four times that.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-depth-uncertainty.svg" caption="Left: why the error grows with depth, for a toy rectified pair with huge pixels ($f=6$, $b=1.5$; thin lines are the pixel boundaries of each camera). The cells are the regions seen by the same left pixel and right pixels at disparities 2 to 8: integer disparity $d$ only says that the point lies between depths $fb/(d+1)$ and $fb/(d-1)$, from 1.00–1.29 at $d=8$ to 3–9 at $d=2$. Right: $\delta Z=Z^2\delta d/(fb)$ for $f=500$ px and $\delta d=0.25$ px with three baselines; at 5 m the error is 20.8, 10.4 and 4.2 cm." %}

The trade-off this creates runs through stereo design. A longer baseline improves far-range accuracy but shrinks the overlap of the two views at close range, increases occlusions, and makes matching harder because the two views differ more. Car stereo rigs typically use baselines of tens of centimetres; compact stereo cameras in phones and devices, a few centimetres, which by the formula above limits their accurate range to a few metres.

### 8.3 A synthetic stereo pair

To study dense matching we need a pair with **known disparity at every pixel**. We ray-cast one: a $240\times 180$ rectified pair with $f = 200$ px and $b = 0.12$ m, showing a slanted wall, a floor, a textured box, a slanted panel with a binary pattern, and a box whose face has almost no texture (an amplitude of 4 grey levels against a sensor noise of 1.5). Rendering both views from the same 3D scene gives the ground-truth disparity $fb/Z$ and the occlusions for free.

```python
from scipy.ndimage import map_coordinates, uniform_filter

SW, SH, sf, sb = 240, 180, 200.0, 0.12          # image size, focal length (px), baseline (m)
scx, scy = (SW - 1) / 2, (SH - 1) / 2
lattice = np.random.default_rng(8).uniform(0, 1, (6, 64, 64))


def noise(s, t, k, cell):
    """Smooth value noise on surface coordinates (s, t) in metres: lattice k, cell size in metres."""
    return map_coordinates(lattice[k], [t / cell, s / cell], order=3, mode="grid-wrap")


# each surface: normal n and offset c of the plane n.P = c, optional X and Y limits, texture of P
SURFACES = [
    ((0.25, 0, 1), 3.4, None, lambda P: 85 + 70 * noise(P[0], P[1], 0, 0.06) + 30 * noise(P[0], P[1], 1, 0.015)),
    ((0, 1, 0), 0.55, None, lambda P: 90 + 90 * noise(P[0], P[2], 2, 0.05)),                  # floor
    ((0, 0, 1), 1.5, ((-0.75, -0.25), (-0.15, 0.55)), lambda P: 60 + 150 * noise(P[0], P[1], 3, 0.02)),
    ((-0.9, 0, 1), 1.73, ((0.15, 0.6), (-0.35, 0.3)), lambda P: 40 + 180 * (noise(P[0], P[1], 4, 0.03) > 0.5)),
    ((0, 0, 1), 1.1, ((-0.05, 0.3), (0.2, 0.55)), lambda P: 200 + 4 * noise(P[0], P[1], 5, 0.05)),   # no texture
]


def cast(cam_x, u, v):
    """Shade and depth Z of the first surface hit by the rays of pixels (u, v), camera at (cam_x, 0, 0)."""
    d = np.stack([(u - scx) / sf, (v - scy) / sf, np.ones_like(u)])     # ray directions with d_z = 1
    depth, shade = np.full(u.shape, np.inf), np.zeros(u.shape)
    for n, c, lim, tex in SURFACES:
        n = np.array(n, float)
        lam = (c - n[0] * cam_x) / np.tensordot(n, d, 1)                 # ray parameter = depth Z
        P = np.array([cam_x, 0.0, 0.0])[:, None, None] + lam * d
        hit = (lam > 0) & (lam < depth)
        if lim is not None:
            hit &= (P[0] >= lim[0][0]) & (P[0] <= lim[0][1]) & (P[1] >= lim[1][0]) & (P[1] <= lim[1][1])
        depth = np.where(hit, lam, depth)
        shade = np.where(hit, tex(P), shade)
    return shade, depth


def render(cam_x, ss=2):
    """Image (ss x ss supersampled) and per-pixel depth of the camera at (cam_x, 0, 0)."""
    u, v = np.meshgrid(np.arange(SW, dtype=float), np.arange(SH, dtype=float))
    offs = (np.arange(ss) + 0.5) / ss - 0.5
    img = sum(cast(cam_x, u + dx, v + dy)[0] for dy in offs for dx in offs) / ss ** 2
    return img, cast(cam_x, u, v)[1]


left, depth_l = render(0.0)
right, depth_r = render(sb)
rng = np.random.default_rng(9)
left = left + rng.normal(0, 1.5, left.shape)            # sensor noise (grey levels 0..255)
right = right + rng.normal(0, 1.5, right.shape)
gt = sf * sb / depth_l                                  # true disparity of every left pixel
gt_r = sf * sb / depth_r
xm = np.arange(SW)[None, :] - np.round(gt).astype(int)  # column of the match in the right image
valid = xm >= 0
occluded = valid & (np.abs(np.take_along_axis(gt_r, np.clip(xm, 0, SW - 1), 1) - gt) > 1.0)
mask = valid & ~occluded                                # pixels whose match is visible
print("disparity %.1f to %.1f px; %.1f%% of the pixels are occluded or leave the right image"
      % (gt.min(), gt.max(), 100 * (1 - mask.mean())))
```

```text
disparity 6.0 to 21.8 px; 7.1% of the pixels are occluded or leave the right image
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-stereo-pair.svg" caption="The synthetic rectified pair: left image $I\_L$, right image $I\_R$ (the camera moved 12 cm to the right, so everything shifts left, near objects more), and the true disparity $d^\ast$ of each left pixel, from 6.0 px on the far wall to 21.8 px on the near box. Gray: the 7.1% of left pixels that have no match in the right image, either occluded (the strips just left of each box, which the right camera cannot see) or outside its field of view (the left border)." %}

The occluded strips are worth a look: they lie on the left side of every foreground object. The right camera sits further right, so it sees past the right edge of an object but not past its left edge. No matching method can find correct disparities there; the best it can do is to detect them.

### 8.4 Block matching

The simplest dense method compares windows. For each left pixel and each candidate disparity $d$, compute a **matching cost** between the window around $(x, y)$ in the left image and the window around $(x - d, y)$ in the right image, then take the disparity with the lowest cost ("winner takes all", WTA). Common costs:

- **SAD / SSD**: sum of absolute or squared differences. Fast, but sensitive to brightness and contrast differences between the two cameras.
- **NCC**: normalized cross-correlation, invariant to gain and bias of the window, at a higher price.
- **Census** (Zabih and Woodfill, 1994): replace each pixel by a bit string saying which neighbours are darker than it, and compare bit strings by Hamming distance. Invariant to any monotonic brightness change, and the standard choice when the two cameras differ radiometrically.

Computing $C(x, y, d)$ for all pixels and disparities gives the **cost volume**, a $D\times H\times W$ array; with a box filter, every window cost costs $O(1)$. The WTA disparity is an integer; a parabola through the costs at $d - 1$, $d$, $d + 1$ refines it, its vertex lying at

$$
d^\ast = d + \frac{c_{d-1} - c_{d+1}}{2\,(c_{d-1} - 2c_d + c_{d+1})} .
$$

```python
DMAX = 32                                               # disparities 0..31


def cost_volume_sad(L, Rimg, win):
    """C[d, y, x] = mean |L(x, y) - R(x - d, y)| over a win x win window."""
    C = np.empty((DMAX, SH, SW))
    for d in range(DMAX):
        diff = np.full((SH, SW), 255.0)                 # no match possible left of column d
        diff[:, d:] = np.abs(L[:, d:] - Rimg[:, :SW - d])
        C[d] = uniform_filter(diff, win, mode="nearest")
    return C


def wta(C):
    """Winner-take-all disparity with parabola subpixel refinement."""
    d = np.argmin(C, axis=0)
    dc = np.clip(d, 1, DMAX - 2)
    c0, c1, c2 = (np.take_along_axis(C, (dc + k)[None], 0)[0] for k in (-1, 0, 1))
    den = c0 - 2 * c1 + c2
    off = np.where((d == dc) & (den > 0), 0.5 * (c0 - c2) / np.where(den > 0, den, 1.0), 0.0)
    return d + off


def bad_pixels(D, thresh=1.0, margin=6):
    """Percentage of visible pixels (away from the border) whose disparity is off by more than thresh."""
    m = mask.copy()
    m[:margin], m[-margin:], m[:, :margin], m[:, -margin:] = False, False, False, False
    return 100 * np.mean(np.abs(D - gt)[m] > thresh)


for win in (3, 7, 15):
    D = wta(cost_volume_sad(left, right, win))
    print("SAD %2dx%-2d: bad pixels (error > 1 px) %.1f%%" % (win, win, bad_pixels(D)))
```

```text
SAD  3x3 : bad pixels (error > 1 px) 10.4%
SAD  7x7 : bad pixels (error > 1 px) 9.4%
SAD 15x15: bad pixels (error > 1 px) 12.0%
```

The window size is a trade-off. A small window (3×3) contains too little texture to be distinctive: 10.4% of the pixels are wrong, scattered as salt-and-pepper noise and covering the weakly textured box. A large window (15×15) collects more texture and recovers more of the plain box (though still not all of it), but near depth discontinuities it contains pixels from both the foreground and the background, and the foreground, with its stronger texture, usually wins: objects grow by half a window. This **foreground fattening** pushes the error up to 12.0%. No single window size works everywhere, as the next figure shows.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-block-matching.svg" caption="Top: disparity maps from SAD block matching with 3×3, 7×7 and 15×15 windows, and from SAD 5×5 with semi-global matching (section 8.5); same colour scale as the ground truth. Bottom: pixels with an error above 1 px in red (gray: no visible match), with the bad-pixel rate over the visible pixels: 10.4%, 9.4%, 12.0% and 4.9%. Small windows fail on the plain box and scatter errors everywhere; large windows recover more of the box but fatten every object by half a window; SGM keeps the edges and gets most of the plain box right, with the remaining errors in horizontal streaks typical of a 4-path implementation." %}

### 8.5 Semi-global matching

Block matching decides each pixel independently. What we want instead is a disparity map that is both **faithful to the data** and **smooth** except at a few jumps. As an energy:

$$
E(D) = \sum_{\mathbf p} C(\mathbf p, D_{\mathbf p})
+ \sum_{\mathbf p}\sum_{\mathbf q\in\mathcal N(\mathbf p)} \Big( P_1\,[\lvert D_{\mathbf p} - D_{\mathbf q}\rvert = 1] + P_2\,[\lvert D_{\mathbf p} - D_{\mathbf q}\rvert > 1] \Big),
$$

where $[\cdot]$ is 1 when the condition holds and 0 otherwise. The small penalty $P\_1$ allows slanted surfaces, whose disparity changes by one pixel at a time; the large penalty $P\_2$ makes real jumps expensive but possible. Minimizing $E$ over a 2D grid is NP-hard in general. Along a **single 1D path**, however, it is solved exactly by dynamic programming, the classic scanline stereo. Hirschmüller's **semi-global matching** (SGM; CVPR 2005, TPAMI 2008) runs that dynamic program along several directions $\mathbf r$ (left to right, right to left, top to bottom, and so on) and sums the results. The cost of reaching pixel $\mathbf p$ with disparity $d$ along direction $\mathbf r$ is

$$
L_{\mathbf r}(\mathbf p, d) = C(\mathbf p, d) + \min\Big( L_{\mathbf r}(\mathbf p - \mathbf r, d),\
L_{\mathbf r}(\mathbf p - \mathbf r, d \pm 1) + P_1,\
\min_k L_{\mathbf r}(\mathbf p - \mathbf r, k) + P_2 \Big) - \min_k L_{\mathbf r}(\mathbf p - \mathbf r, k),
$$

that is: continue at the same disparity for free, change by one for $P\_1$, or jump anywhere for $P\_2$. Subtracting the previous minimum does not change the argmin but keeps the numbers bounded. The aggregated cost is $S(\mathbf p, d) = \sum\_{\mathbf r} L\_{\mathbf r}(\mathbf p, d)$ and the disparity is its WTA. Each pixel thus receives evidence from far away along every path: a weakly textured region can inherit the disparity of its textured border, while at a real depth jump, where the data term clearly disagrees, the fixed price $P\_2$ lets the disparity change.

Two more ideas complete the method. The **left-right consistency check** computes a second disparity map with the right image as reference and invalidates pixels whose two disparities disagree; occluded pixels fail it because their "match" is a different surface. In our code the right-image costs need no new computation: the cost of right pixel $x$ at disparity $d$ is the left cost at $x + d$. Hirschmüller's matching cost was based on **mutual information**, which handles radiometric differences; census and block costs are common replacements. OpenCV's `StereoSGBM` matches small blocks and aggregates along 5 directions by default (8 with `MODE_HH`), and its documentation suggests $P\_1 = 8\cdot\text{channels}\cdot\text{blockSize}^2$ and $P\_2 = 32\cdot\text{channels}\cdot\text{blockSize}^2$ for a sum (not a mean) of absolute differences.

```python
def aggregate_path(C, P1, P2, reverse):
    """One SGM path along the first axis of C (steps, D, other):
    L(p, d) = C(p, d) + min(L(p-r, d), L(p-r, d-1) + P1, L(p-r, d+1) + P1, min_k L(p-r, k) + P2) - min_k L(p-r, k)."""
    C = C[::-1] if reverse else C
    L = np.empty_like(C)
    L[0] = C[0]
    inf = np.full((1, C.shape[2]), np.inf)
    for i in range(1, len(C)):
        prev = L[i - 1]                                    # (D, other)
        m = prev.min(axis=0)
        step = np.minimum(np.vstack([prev[1:], inf]), np.vstack([inf, prev[:-1]])) + P1
        L[i] = C[i] + np.minimum(np.minimum(prev, step), m + P2) - m
    return L[::-1] if reverse else L


def sgm(C, P1=2.0, P2=16.0):
    """Sum of the left/right and up/down path costs (Hirschmueller uses 8 or 16 paths)."""
    Cy = np.transpose(C, (1, 0, 2))                        # (y, d, x): scan down or up
    Cx = np.transpose(C, (2, 0, 1))                        # (x, d, y): scan right or left
    S = sum(np.transpose(aggregate_path(Cy, P1, P2, r), (1, 0, 2)) for r in (False, True))
    return S + sum(np.transpose(aggregate_path(Cx, P1, P2, r), (1, 2, 0)) for r in (False, True))


C5 = cost_volume_sad(left, right, 5)
D_sgm = wta(sgm(C5))
print("SAD 5x5 + SGM: bad pixels %.1f%%" % bad_pixels(D_sgm))

# right-image disparities from the same costs: C_R(x, d) = C(x + d, d)
C5_r = np.full_like(C5, 255.0)
for d in range(DMAX):
    C5_r[d, :, :SW - d] = C5[d, :, d:]
D_r = wta(sgm(C5_r))
xr = np.clip(np.round(np.arange(SW)[None, :] - D_sgm).astype(int), 0, SW - 1)
consistent = np.abs(D_sgm - np.take_along_axis(D_r, xr, 1)) <= 1.0
print("left-right check rejects %.1f%% of pixels, %.0f%% of the occluded ones;"
      " bad pixels among the kept ones: %.1f%%"
      % (100 * (1 - consistent.mean()), 100 * (~consistent)[occluded].mean(),
         100 * np.mean((np.abs(D_sgm - gt) > 1)[mask & consistent])))
```

```text
SAD 5x5 + SGM: bad pixels 4.9%
left-right check rejects 8.7% of pixels, 84% of the occluded ones; bad pixels among the kept ones: 2.3%
```

With a 5×5 SAD cost, SGM halves the error of the best block matcher, from 9.4% to 4.9%. The left-right check then removes 8.7% of all pixels, among them 84% of the truly occluded ones, and leaves 2.3% bad pixels among those it keeps. The next figure shows what the aggregation does to the cost volume along one image row.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-sgm.svg" caption="Left: one slice of the cost volume along row $y=145$ (dark = low cost, each column scaled by its 95th percentile), before (top, the 5×5 SAD cost $C$) and after SGM aggregation (bottom, $S$). White: the true disparity; cyan dots: the argmin of each column. Before aggregation the argmin wanders in the plain box ($x\approx 110$–$175$, true $d=21.8$) and in the occluded strips; after it, the minimum mostly follows the true disparity in the box, and the textured regions are unchanged. Right: the SGM disparity map after the left-right check; gray pixels are rejected (the occlusion strips left of every object, and isolated failures); the dashed line marks the row on the left." %}

### 8.6 Try it: the stereo matching lab

The widget renders the same kind of scene in your browser (at 200×150 px) and runs block matching or SGM on it. Pick a pixel to see its cost curve against the disparity; with SGM the aggregated curve is drawn as well.

{% include widget.liquid name="3d-vision-stereo-matching" height="620" caption="Stereo matching lab. Left: the left image; middle: the computed disparity (gray: rejected by the left-right check); right: errors above 1 px in red (dark gray: no visible match). Tap or drag on any image to select a pixel; the chart shows its window cost $C(d)$ (orange), the SGM-aggregated cost $S(d)$ (purple, rescaled) and the true disparity (dashed). Sliders change the window size, $P\_1$, $P\_2$, the texture of the plain box and the image noise; new images are rendered when the texture or noise changes." %}

Things to try: with block matching, tap the plain box and compare a 3×3 with an 11×11 window; the cost curve goes from flat and noisy to a clear valley. Set the box texture to 0 and compare: block matching gets most of the box wrong, while SGM still gets most of it right, because the disparity of its edges propagates inwards along the paths; the rest fails in streaks. Then go back to texture 6 and raise $P\_2$ to 120: jumps become so expensive that the aggregation drags disparities across object borders, and the errors grow along the edges and above all on the plain box, whose weak data term cannot resist.

### 8.7 Beyond hand-crafted stereo

Block matching and SGM still run in many cameras and robots because they are predictable and fast on dedicated hardware. Since the mid-2010s, learned methods have led the stereo benchmarks. GC-Net (Kendall et al., ICCV 2017) built the cost volume from learned features, regularized it with 3D convolutions instead of SGM, and read out a subpixel disparity with a differentiable soft argmin. RAFT-Stereo (Lipson, Teed and Deng, 3DV 2021) adapted the recurrent optical-flow network RAFT of post 03 to rectified pairs. FoundationStereo (Wen et al.; published at CVPR 2025, as of November 2026) trains on about a million synthetic pairs with a frozen monocular depth model as a prior and generalizes zero-shot to real benchmarks. The structure of this section survives in all of them: a cost volume over disparities, aggregation, and a readout. [Post 07]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) generalizes the cost volume to more than two views (plane sweep and multi-view stereo) and covers monocular depth.

## Try it

- In the **epipolar widget** (section 3.4), choose the forward-motion preset and drag the point towards the centre of view 1. Where is the epipolar line when the point is exactly at the principal point, and why? Then choose the stereo preset and confirm that the line stays on the row of the point for every depth.
- Still in the epipolar widget, set the depth slider to 0.5 m and to 20 m and watch where the green point lands on the line. Then make the baseline very small with the top view: the depth ticks bunch together, which is section 7.4's near-degeneracy seen from the inside.
- In the **stereo lab** (section 8.6), watch how block matching handles the plain box (texture 6) as the window grows from 3×3 to 15×15, and what the larger windows cost at the object borders; then turn on the left-right check and see which pixels it removes.
- The home page's [Interactive Lab]({{ '/' | relative_url }}#lab) shows the rendering side: the Gaussian splatting demo is exactly the kind of scene that the posed images of this post are used to build.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| A computer algorithm for reconstructing a scene from two projections (Longuet-Higgins) | Nature | 1981 | [DOI](https://doi.org/10.1038/293133a0) | The essential matrix and the linear eight-point algorithm |
| Non-parametric local transforms for computing visual correspondence (Zabih, Woodfill) | ECCV | 1994 | — | The census transform for robust matching costs |
| In defense of the eight-point algorithm (Hartley) | TPAMI | 1997 | [DOI](https://doi.org/10.1109/34.601246) | Coordinate normalization makes the linear algorithm accurate |
| Triangulation (Hartley, Sturm) | CVIU | 1997 | [DOI](https://doi.org/10.1006/cviu.1997.0547) | Optimal two-view triangulation via a degree-6 polynomial |
| The problem of degeneracy in structure and motion recovery from uncalibrated image sequences (Torr, Fitzgibbon, Zisserman) | IJCV | 1999 | — | Pure rotation and planar scenes, and how to detect them |
| Theory and practice of projective rectification (Hartley) | IJCV | 1999 | — | Rectification from $F$ alone |
| Computing rectifying homographies for stereo vision (Loop, Zhang) | CVPR | 1999 | — | Rectification with minimal distortion |
| A taxonomy and evaluation of dense two-frame stereo correspondence algorithms (Scharstein, Szeliski) | IJCV | 2002 | [DOI](https://doi.org/10.1023/A:1014573219977) | Cost, aggregation, optimization, refinement; the Middlebury benchmark |
| An efficient solution to the five-point relative pose problem (Nistér) | TPAMI | 2004 | [DOI](https://doi.org/10.1109/TPAMI.2004.17) | The calibrated minimal solver used in RANSAC |
| Two-view geometry estimation unaffected by a dominant plane (Chum, Werner, Matas) | CVPR | 2005 | — | DEGENSAC |
| Recent developments on direct relative orientation (Stewénius, Engels, Nistér) | ISPRS J. Photogrammetry and Remote Sensing | 2006 | — | Gröbner-basis five-point solver |
| Stereo processing by semiglobal matching and mutual information (Hirschmüller) | TPAMI | 2008 | [DOI](https://doi.org/10.1109/TPAMI.2007.1166) | SGM |
| Triangulation made easy (Lindstrom) | CVPR | 2010 | — | Fast iterative optimal triangulation |
| ORB-SLAM: a versatile and accurate monocular SLAM system (Mur-Artal, Montiel, Tardós) | IEEE T-RO | 2015 | [arXiv](https://arxiv.org/abs/1502.00956) | Homography or fundamental matrix for map initialization |
| End-to-end learning of geometry and context for deep stereo regression (Kendall et al.) | ICCV | 2017 | [arXiv](https://arxiv.org/abs/1703.04309) | Learned cost volumes with 3D convolutions and soft argmin |
| RAFT-Stereo: multilevel recurrent field transforms for stereo matching (Lipson, Teed, Deng) | 3DV | 2021 | [arXiv](https://arxiv.org/abs/2109.07547) | Recurrent refinement for stereo |
| FoundationStereo: zero-shot stereo matching (Wen et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.09898) | Large-scale synthetic training with a monocular depth prior |

## Learning resources

- R. Hartley and A. Zisserman, *Multiple View Geometry in Computer Vision*, 2nd ed., 2004: chapter 9 (epipolar geometry and the fundamental matrix), chapter 10 (reconstruction of cameras and structure), chapter 11 (computing $F$, including the seven-point algorithm and the Sampson distance) and chapter 12 (triangulation).
- Y. Ma, S. Soatto, J. Košecká and S. Sastry, *An Invitation to 3-D Vision*, 2004: chapters 5 and 6 (reconstruction from two calibrated and two uncalibrated views), with careful proofs of the decomposition of $E$.
- R. Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed., 2022: chapter 11 (structure from motion, including two-frame methods) and chapter 12 (depth estimation: rectification, matching costs, SGM). Free at [szeliski.org/Book](https://szeliski.org/Book/).
- OpenCV calib3d: `findFundamentalMat`, `findEssentialMat`, `recoverPose`, `triangulatePoints`, `stereoRectify`, `stereoRectifyUncalibrated`, `StereoBM` and `StereoSGBM` ([documentation](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html)).
- Code: [PoseLib](https://github.com/PoseLib/PoseLib) (minimal solvers, including five-point and seven-point), [COLMAP](https://github.com/colmap/colmap) (two-view geometry estimation inside SfM).
- Benchmarks: [Middlebury stereo](https://vision.middlebury.edu/stereo/), [KITTI stereo](https://www.cvlibs.net/datasets/kitti/eval_scene_flow.php?benchmark=stereo), [ETH3D](https://www.eth3d.net/).

## Exercises

1. Show that for a pure translation between two cameras with the same $K$, $F$ is skew-symmetric, and that $\mathbf x\_1$, $\mathbf x\_2$ and the epipole are collinear. What does this say about the motion of points in the image?

   <details markdown="1"><summary>Hint</summary>

   With $R = I$, $F = K^{-\top}[\mathbf t]\_\times K^{-1} \sim [K\mathbf t]\_\times$ by the identity of section 3.1, which is skew-symmetric, and $\mathbf e = K\mathbf t$. Then $\tilde{\mathbf x}\_2^\top[\mathbf e]\_\times\tilde{\mathbf x}\_1 = \det(\tilde{\mathbf x}\_2, \mathbf e, \tilde{\mathbf x}\_1) = 0$: the three points are collinear. Every point moves along the line joining it to the epipole, towards it or away from it (the focus of expansion), as in the left and middle panels of the motions figure.
   </details>

2. Prove that a $3\times 3$ matrix $M \ne 0$ with $2MM^\top M - \operatorname{tr}(MM^\top)M = 0$ has singular values $(\sigma, \sigma, 0)$, so the cubic constraint characterizes essential matrices.

   <details markdown="1"><summary>Hint</summary>

   With the SVD the equation becomes $\sigma\_i(2\sigma\_i^2 - s) = 0$ for $i = 1, 2, 3$, with $s = \sigma\_1^2 + \sigma\_2^2 + \sigma\_3^2$. Every nonzero $\sigma\_i$ therefore satisfies $\sigma\_i^2 = s/2$. If all three were nonzero, $s = 3s/2$, so $s = 0$: impossible. If only one were nonzero, $\sigma\_1^2 = \sigma\_1^2/2$: impossible. So exactly two are nonzero and equal.
   </details>

3. Show that the two rotations of the decomposition differ by a rotation of 180° about the baseline, and explain with a sketch why, for the twisted pair, a point can never be in front of both cameras when it is in front of them for the true pose.

   <details markdown="1"><summary>Hint</summary>

   $R\_b R\_a^\top = UW^\top V^\top VW^\top U^\top = U(W^\top)^2U^\top = U\operatorname{diag}(-1,-1,1)U^\top$, the rotation by $\pi$ about $\mathbf u\_3 = \mathbf t/\lVert\mathbf t\rVert$. Turning camera 2 by 180° about the baseline reverses its viewing direction relative to the epipolar plane, so the ray of $\mathbf x\_2$ now leaves on the other side of the baseline; the two rays then meet behind one of the cameras (compare the panels of the four-poses figure).
   </details>

4. A stereo camera has $f = 700$ px and $b = 12$ cm, and its matcher is accurate to 0.2 px. At what distance does the relative depth error $\delta Z/Z$ reach 5%? How long would the baseline have to be for 5% at 50 m?

   <details markdown="1"><summary>Hint</summary>

   $\delta Z/Z = Z\,\delta d/(fb)$. Setting it to 0.05 gives $Z = 0.05\cdot 700\cdot 0.12/0.2 = 21$ m. For $Z = 50$ m: $b = Z\,\delta d/(0.05 f) = 50\cdot 0.2/35 = 0.29$ m.
   </details>

5. Extend `sgm` to 8 paths by adding the four diagonal directions, and compare the bad-pixel rate and the horizontal streaks with the 4-path version. Then implement the census cost (5×5 window, Hamming distance) and compare it with SAD after adding a brightness gain of 1.2 to the right image only.

   <details markdown="1"><summary>Hint</summary>

   A diagonal path visits $(x, y), (x+1, y+1), \dots$; the recurrence is the same, with the previous pixel at $(x-1, y-1)$. One way to vectorize it is to process the image row by row and take `prev` from the previous row shifted by one column (filling the vacated column with the plain cost $C$). For the census code, compare each pixel's 24 neighbours with the centre, pack the bits into an integer, and count the differing bits of XOR-ed codes with a lookup table. A gain changes every absolute difference but no census bit, so SAD should degrade and census should not.
   </details>

**Next:** [Multi-view geometry and bundle adjustment]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}): from two views to many, with camera resectioning by PnP, incremental and global Structure-from-Motion, and bundle adjustment, which refines all cameras and points together and is where the relative poses and triangulations of this post end up.
