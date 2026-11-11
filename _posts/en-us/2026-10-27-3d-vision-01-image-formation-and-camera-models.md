---
layout: post
title: "Image formation and camera models: projective geometry, pinholes, lenses and conventions"
date: 2026-10-27 11:01:00+0900
description: "The first post of 3D Vision Fundamentals: homogeneous coordinates, points at infinity and vanishing points, the pinhole camera P = K[R|t] and its RQ decomposition, Brown-Conrady and Kannala-Brandt distortion, rolling shutter, and how to convert between OpenCV, OpenGL, COLMAP and NeRF conventions."
categories: 3d-vision
tags: [projective-geometry, pinhole-camera, camera-matrix, lens-distortion, fisheye, rolling-shutter, coordinate-conventions]
series: 3d-vision
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## Why this matters

Computer graphics goes from a scene to an image: you know the geometry and the camera, and you compute pixels. 3D vision goes the other way, from images back to geometry: where were the cameras, what shape is the world, how far away is each pixel. Every step of that inverse problem starts from a precise model of how a camera turns 3D points into pixels. If the model is a little wrong (a forgotten distortion term, a flipped axis, half a pixel of offset), every later stage inherits the error: calibration, matching, triangulation, SLAM, NeRF and 3D Gaussian Splatting.

This post builds that model from the ground up. We start with projective geometry, the algebra in which "parallel lines meet at the horizon" is a precise statement. Then we assemble the pinhole camera $P = K[R \mid \mathbf t]$ and learn to take it apart again. Next come the ways real cameras deviate from a pinhole: lens distortion, fisheye optics and rolling shutters. We end with the coordinate conventions of OpenCV, OpenGL, COLMAP and NeRF, which cause more silent bugs than all the rest combined.

### Who this series is for

**3D Vision Fundamentals** is a from-scratch learning path for a motivated reader who knows linear algebra, calculus, Python and basic machine learning, but has not studied multi-view geometry. Each post builds an idea in the same order: intuition with a picture, the formula derived step by step, a small worked example with numbers, runnable NumPy code that reproduces it, and a figure or interactive widget that shows the result in space. If you work on NeRF, Gaussian splatting, SLAM, robotics or AR/VR and have been using COLMAP poses as a black box, this series opens the box.

The series sits between the [graphics series]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }}) (scene to image) and the [neural rendering series]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}) (images to radiance fields). Neural rendering post 1 gives a compact tour of cameras, epipolar geometry, bundle adjustment and COLMAP; this series takes each of those topics slowly and in depth.

### The series map

| # | Post | What you will be able to do |
| --- | --- | --- |
| 01 | [Image formation and camera models]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }}) (this post) | Write down, decompose and convert any camera model |
| 02 | [Camera calibration]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}) | Estimate $K$ and distortion with Zhang's method and judge the result |
| 03 | [Features and matching]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}) | Detect, describe and robustly match points between images |
| 04 | [Two-view geometry]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }}) | Recover relative pose and depth from two images |
| 05 | [Multi-view geometry and bundle adjustment]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}) | Build Structure-from-Motion and optimize it |
| 06 | [Visual SLAM]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }}) | Track a camera in real time and close loops |
| 07 | [Depth estimation and multi-view stereo]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) | Turn posed images into dense depth |
| 08 | [3D representations]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }}) | Choose between points, meshes, voxels, SDFs, fields and Gaussians |
| 09 | [3D reconstruction, classic to feed-forward]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) | Go from photos to surfaces, by optimization or by one network pass |
| 10 | [3D vision for AR/VR]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }}) | Understand headset tracking, latency and registration error |

## Prerequisites

- Linear algebra: matrix products, inverses, determinants, orthogonal matrices, the cross product, and the QR decomposition (we will use its mirror image, RQ).
- Rotations and rigid transforms. The [graphics math post]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }}) covers rotation matrices and quaternions; [embodied AI post 1]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }}) covers $SE(3)$.
- Helpful but not required: the perspective projection matrix of [rasterization]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }}).
- Python with NumPy and SciPy. Every snippet below runs as is, and its printed numbers are quoted in the text.

## 1. Projective geometry: the language of image formation

A camera maps a 3D world onto a 2D image. Lengths, angles and parallelism are not preserved: railway tracks converge, circles become ellipses. What *is* preserved is that straight lines stay straight (for an ideal lens) and that a point on a line stays on the line. Projective geometry is the geometry that keeps exactly these properties, and its algebra, homogeneous coordinates, turns the camera into a matrix.

### 1.1 Homogeneous coordinates in the plane

A point $(x, y)$ of the plane is represented by any 3-vector $\tilde{\mathbf x} = (\lambda x, \lambda y, \lambda)^\top$ with $\lambda \neq 0$. All nonzero multiples represent the same point, written $\tilde{\mathbf x} \sim \lambda \tilde{\mathbf x}$. To go back, divide by the last coordinate: $(x_1, x_2, x_3) \mapsto (x_1/x_3,\, x_2/x_3)$.

The picture to keep in mind is the top half of the next figure. Each homogeneous vector is a **ray through the origin** of $\mathbb R^3$; the ordinary point is where that ray crosses the plane $w = 1$. The set of all such rays is the **projective plane** $\mathbb P^2$. This is already a camera: put the eye at the origin and the image on the plane $w=1$, and every ray through the eye is one image point.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-projective-plane.svg" width="75%" caption="Top: the projective plane as rays through the origin. The black ray carries $(x,y,1)$ and every multiple $\lambda(x,y,1)$; they are one point. The two parallel lines $\mathbf m_1$ (orange) and $\mathbf m_2$ (cyan) on the plane $w=1$ are planes through the origin (shaded fans). The two planes meet in the red ray $(8,4,0)^\top$, which lies in $w=0$ and never reaches $w=1$: the point at infinity where the parallel lines meet. Bottom: the computation of section 1.2. $\mathbf l_1$ through $\mathbf a,\mathbf b$ and $\mathbf l_2$ through $\mathbf c,\mathbf d$ meet at $\mathbf x\sim(2.5,2,1)$; the parallel lines $x-2y+1=0$ and $x-2y-3=0$ meet at $(8,4,0)$, the direction $(2,1)$ shown by the arrow." %}

### 1.2 Lines, joins and meets

A line $ax + by + c = 0$ is the 3-vector $\mathbf l = (a, b, c)^\top$, again up to scale. A point lies on a line exactly when

$$
\mathbf l^\top \tilde{\mathbf x} = a x_1 + b x_2 + c x_3 = 0 .
$$

This single bilinear equation gives two very useful constructions. The line through two points $\tilde{\mathbf a}$ and $\tilde{\mathbf b}$ must satisfy $\mathbf l^\top \tilde{\mathbf a} = \mathbf l^\top \tilde{\mathbf b} = 0$, so $\mathbf l$ is orthogonal to both vectors, and the cross product does exactly that:

$$
\mathbf l = \tilde{\mathbf a} \times \tilde{\mathbf b}, \qquad \text{since } (\tilde{\mathbf a}\times\tilde{\mathbf b})^\top \tilde{\mathbf a} = 0 .
$$

By the same argument with the roles swapped, two lines meet at $\tilde{\mathbf x} = \mathbf l_1 \times \mathbf l_2$. Points and lines enter these formulas symmetrically (this is **duality**): any statement about points has a twin about lines.

**Worked example.** Take $\mathbf a = (1,1)$, $\mathbf b = (4,3)$, $\mathbf c = (1,3)$, $\mathbf d = (4,1)$. Then $\mathbf l_1 = \tilde{\mathbf a} \times \tilde{\mathbf b} = (-2, 3, -1)$, which is the line $-2x + 3y - 1 = 0$ (check: $-2 + 3 - 1 = 0$ and $-8 + 9 - 1 = 0$). Similarly $\mathbf l_2 = (2, 3, -11)$. Their meet is $\mathbf l_1 \times \mathbf l_2 = (-30, -24, -12) \sim (2.5, 2, 1)$, the point $(2.5, 2)$.

```python
import numpy as np

def hom(p):                      # Euclidean -> homogeneous
    return np.append(np.asarray(p, float), 1.0)

def dehom(x):                    # homogeneous -> Euclidean (needs x[-1] != 0)
    return x[:-1] / x[-1]

a, b = hom([1, 1]), hom([4, 3])
c, d = hom([1, 3]), hom([4, 1])
l1 = np.cross(a, b)              # line through a and b
l2 = np.cross(c, d)              # line through c and d
x = np.cross(l1, l2)             # intersection of the two lines
print("l1 =", l1, " l2 =", l2)
print("x  =", x, "->", dehom(x))
print("incidence:", l1 @ x, l2 @ x)

# two parallel lines x - 2y + 1 = 0 and x - 2y - 3 = 0
m1, m2 = np.array([1.0, -2.0, 1.0]), np.array([1.0, -2.0, -3.0])
print("parallel lines meet at", np.cross(m1, m2))   # last entry 0: a point at infinity
# the line through two points at infinity is the line at infinity
print("line at infinity:", np.cross([2.0, 1.0, 0.0], [1.0, 0.0, 0.0]))
```

Output: `l1 = [-2. 3. -1.]`, `l2 = [2. 3. -11.]`, `x = [-30. -24. -12.] -> [2.5 2.]`, incidence `0.0 0.0`, the parallel lines meet at `[8. 4. 0.]`, and the line at infinity is `[0. 0. -1.]`.

### 1.3 Points at infinity and the line at infinity

The last two lines of the snippet are the interesting ones. Two parallel lines $ax + by + c_1 = 0$ and $ax + by + c_2 = 0$ have no intersection in the Euclidean plane, but their cross product is perfectly defined:

$$
(a, b, c_1) \times (a, b, c_2) = (c_2 - c_1)\,(b, -a, 0) \sim (b, -a, 0).
$$

The result has $x_3 = 0$. It is a **point at infinity** (an *ideal point*), and $(b, -a)$ is the common direction of the two lines. In the top half of the figure it is the ray in the $w = 0$ plane that never reaches $w = 1$. All points at infinity satisfy $x_3 = 0$, that is $(0, 0, 1)\,\tilde{\mathbf x} = 0$, so they lie on one line, the **line at infinity** $\mathbf l_\infty = (0, 0, 1)^\top$ (the snippet printed it as $(0, 0, -1)$, the same line).

This is not a trick of notation. In an image, the point at infinity of a direction is a real, finite pixel whenever the camera does not look exactly perpendicular to that direction: it is the **vanishing point** where the images of parallel lines converge. Section 1.6 computes it.

### 1.4 Projective space $\mathbb P^3$

The same construction one dimension up gives **projective 3-space**: a 3D point $(X, Y, Z)$ is $\tilde{\mathbf X} = (X, Y, Z, 1)^\top$ up to scale, points at infinity $(d_x, d_y, d_z, 0)^\top$ are 3D directions, and a plane $\boldsymbol\pi^\top \tilde{\mathbf X} = 0$ is a 4-vector $\boldsymbol\pi = (n_x, n_y, n_z, -d)^\top$ (unit normal $\mathbf n$, distance $d$ from the origin). All points at infinity lie on the **plane at infinity** $\boldsymbol\pi_\infty = (0, 0, 0, 1)^\top$. The distinction between a point $(\mathbf X, 1)$ and a direction $(\mathbf d, 0)$ is the one you met in graphics: translations move points but not directions.

### 1.5 Projective transformations and their hierarchy

A **projective transformation** (homography) of the plane is any invertible $3 \times 3$ matrix $H$ acting on homogeneous points, $\tilde{\mathbf x}' = H \tilde{\mathbf x}$. It has $8$ degrees of freedom (9 entries minus the overall scale). It maps lines to lines: if $\mathbf l^\top \tilde{\mathbf x} = 0$, then

$$
\mathbf l'^\top \tilde{\mathbf x}' = 0 \quad\text{with}\quad \mathbf l' = H^{-\top} \mathbf l ,
$$

because $(H^{-\top}\mathbf l)^\top H \tilde{\mathbf x} = \mathbf l^\top H^{-1} H \tilde{\mathbf x} = 0$. Points transform with $H$, lines with the inverse transpose; this is the same rule as for surface normals in graphics.

Restricting $H$ gives a nested family of groups. Each smaller group preserves more:

| Group | Matrix form | DoF | Preserves |
| --- | --- | --- | --- |
| Euclidean $SE(2)$ | $\begin{pmatrix} R & \mathbf t \\\\ \mathbf 0^\top & 1 \end{pmatrix}$ | 3 | lengths, angles, areas |
| Similarity $\mathrm{Sim}(2)$ | $\begin{pmatrix} sR & \mathbf t \\\\ \mathbf 0^\top & 1 \end{pmatrix}$ | 4 | angles, ratios of lengths |
| Affine $\mathrm{Aff}(2)$ | $\begin{pmatrix} A & \mathbf t \\\\ \mathbf 0^\top & 1 \end{pmatrix}$ | 6 | parallelism, ratios of areas, the line at infinity |
| Projective $PGL(3)$ | $\begin{pmatrix} A & \mathbf t \\\\ \mathbf v^\top & 1 \end{pmatrix}$ | 8 | collinearity, incidence, cross-ratio |

The bottom row $\mathbf v^\top$ is what separates projective from affine. An affine map sends a point at infinity $(d_1, d_2, 0)$ to another point at infinity, so parallel lines stay parallel. A projective map with $\mathbf v \neq \mathbf 0$ gives it a nonzero third coordinate: the direction becomes a finite point, and parallel lines now meet there.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-transform-hierarchy.svg" caption="The same $3\times 3$ grid (dotted square, faint gray lines) and circle under one member of each group; the number after the group name is its degrees of freedom. $\mathrm{SE}(2)$ rotates by 25° and translates; $\mathrm{Sim}(2)$ also scales by 0.65; the affine map shears, so the circle becomes an ellipse but red lines stay parallel to red lines. Only the projective map, with bottom row $(0.2, 0.25, 1)$, makes each family of parallel lines converge (dashed extensions) to a finite point: $H(1,0,0)^\top$ for the red family and $H(0,1,0)^\top$ for the blue one." %}

Homographies are not only abstract: the image of a plane seen by a pinhole camera is related to the plane itself by a homography, and two images of a plane (or two images taken by a camera rotating about its centre) are related by one. Post 2 uses this to calibrate cameras from a checkerboard.

### 1.6 Vanishing points, the horizon and calibration from them

We can now explain the converging railway tracks. Anticipating section 2, let the camera be $P = K[R \mid \mathbf t]$. A 3D line through the point $\mathbf A$ with direction $\mathbf d$ is $\mathbf X(\lambda) = \mathbf A + \lambda \mathbf d$. In homogeneous coordinates

$$
P \begin{pmatrix} \mathbf A + \lambda\mathbf d \\ 1 \end{pmatrix}
= P \begin{pmatrix} \mathbf A \\ 1 \end{pmatrix} + \lambda\, P \begin{pmatrix} \mathbf d \\ 0 \end{pmatrix}
\;\xrightarrow{\;\lambda\to\infty\;}\; \sim P \begin{pmatrix} \mathbf d \\ 0 \end{pmatrix} = K R\,\mathbf d .
$$

So the **vanishing point** of the direction $\mathbf d$ is

$$
\mathbf v = K R\, \mathbf d .
$$

It does not depend on $\mathbf A$: all lines with direction $\mathbf d$ converge to the same image point. It does not depend on $\mathbf t$ either: translating the camera never moves a vanishing point, which is why the Moon seems to follow you on a drive. The vanishing points of the world axes are the first three columns of $P$.

A plane with unit normal $\mathbf n$ contains all directions $\mathbf d \perp \mathbf n$; their vanishing points fill the **vanishing line**

$$
\mathbf l = K^{-\top} R\, \mathbf n ,
$$

because $\mathbf l^\top \mathbf v = \mathbf n^\top R^\top K^{-1} K R\,\mathbf d = \mathbf n^\top \mathbf d = 0$. For the ground plane this line is the **horizon**.

**Calibration from vanishing points.** Back-projecting a pixel gives a ray direction in the camera frame: $\mathbf r = K^{-1}\tilde{\mathbf x}$. Assume zero skew, square pixels and a known principal point $\mathbf c$ (we relax this below). Then $K^{-1}(u, v, 1)^\top = \big((u - c_x)/f,\ (v - c_y)/f,\ 1\big)^\top$, and two vanishing points $\mathbf v_1, \mathbf v_2$ of **orthogonal** world directions give orthogonal rays:

$$
\frac{(\mathbf v_1 - \mathbf c)\cdot(\mathbf v_2 - \mathbf c)}{f^2} + 1 = 0
\quad\Longrightarrow\quad
f = \sqrt{-(\mathbf v_1 - \mathbf c)\cdot(\mathbf v_2 - \mathbf c)} .
$$

With three mutually orthogonal directions (the edges of a box, the X, Y and Z of a building) we get three such equations. Subtracting two of them, $(\mathbf v_1 - \mathbf c)\cdot(\mathbf v_2 - \mathbf v_3) = 0$: the principal point lies on the altitude from $\mathbf v_1$ of the triangle $\mathbf v_1\mathbf v_2\mathbf v_3$, and by symmetry on all three altitudes. **The principal point is the orthocentre of the vanishing-point triangle**, a classic result used for calibration by Caprile and Torre (1990).

```python
import numpy as np

def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])

def rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

def camera_R(yaw, pitch, roll=0.0):
    """World-to-camera rotation. World: X east, Y north, Z up. Camera (OpenCV): x right,
    y down, z forward. yaw > 0 turns left, pitch > 0 looks up, roll > 0 turns the image
    clockwise. With all three zero the camera looks north with a level horizon."""
    R0 = np.array([[1.0, 0, 0], [0, 0, -1], [0, 1, 0]])   # rows: camera axes in world coordinates
    return rot_z(roll).T @ rot_x(-pitch) @ R0 @ rot_z(yaw).T

f, W, H = 800.0, 1280, 720
K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
R = camera_R(np.deg2rad(30), np.deg2rad(-15))     # turned 30 deg left, looking 15 deg down

V = K @ R                     # column i = vanishing point of world axis i (homogeneous)
vx, vy, vz = (V[:, i] / V[2, i] for i in range(3))
print("v_X =", vx[:2].round(1), " v_Y =", vy[:2].round(1), " v_Z =", vz[:2].round(1))

horizon = np.linalg.inv(K).T @ R @ np.array([0, 0, 1.0])   # vanishing line of the ground plane
print("horizon passes through v_X, v_Y:", np.allclose([horizon @ vx, horizon @ vy], 0))

# focal length from two orthogonal vanishing points (square pixels, zero skew, known c)
c = np.array([W / 2, H / 2])
f_est = np.sqrt(-(vx[:2] - c) @ (vy[:2] - c))
print("f from (v_X, v_Y):", f_est.round(3))

# with three finite vanishing points, c is the orthocentre of their triangle
A = np.array([vy[:2] - vz[:2], vx[:2] - vz[:2]])
b = np.array([(vy[:2] - vz[:2]) @ vx[:2], (vx[:2] - vz[:2]) @ vy[:2]])
print("orthocentre:", np.linalg.solve(A, b).round(3))
```

It prints $\mathbf v_X = (-794.5, 145.6)$, $\mathbf v_Y = (1118.2, 145.6)$ and $\mathbf v_Z = (640, 3345.6)$. Two of the three lie outside the $1280\times 720$ image, which is normal; the image plane extends beyond the sensor. The horizon passes through $\mathbf v_X$ and $\mathbf v_Y$ (`True`), the focal length comes back as exactly $800.0$, and the orthocentre is $(640, 360)$, the principal point.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-vanishing-points.svg" caption="The scene of the snippet: a ground grid and four boxes seen by the camera turned 30° left and tilted 15° down ($f=800$, $1280\times720$ image in the black frame). Left: edges along world $X$ (red) converge to $\mathbf v_X=(-794.5,145.6)$, edges along $Y$ (green) to $\mathbf v_Y=(1118.2,145.6)$, both on the horizon (purple, $v=145.6$). The vertical edges (blue) converge downwards to $\mathbf v_Z$ at $v=3346$, far below the frame, because the camera looks down. Right: the triangle of the three vanishing points; its three altitudes (dashed) meet at the principal point $\mathbf c=(640,360)$." %}

Play with this in the widget below. Note what happens when you level the camera (pitch 0): the vertical edges become parallel in the image, $\mathbf v_Z$ moves to infinity, and only $f$ (not the full principal point) can be recovered from the two remaining vanishing points.

{% include widget.liquid name="3d-vision-vanishing-points" height="720" caption="Vanishing points of a box scene. Drag the view to turn the camera (left/right: yaw, up/down: pitch) or use the sliders; the dark rectangle is the image, the rest of the view is the extended image plane. The readout gives each $\mathbf v_i = KR\,\mathbf e_i$ in homogeneous form; a vanishing point at infinity has third coordinate 0. Compare the focal length recovered from $\mathbf v_X$ and $\mathbf v_Y$ with the true one, and watch the altitudes of the vanishing-point triangle meet at the principal point." %}

## 2. The pinhole camera

### 2.1 Central projection

Put the camera centre at the origin and look along $+z$. Following OpenCV, the camera frame has $x$ to the right, $y$ **down** and $z$ forward (section 4 discusses the alternatives). A point $\mathbf X_c = (X, Y, Z)$ in this frame is joined to the centre by a ray, and the ray meets the plane $z = 1$, the **normalized image plane**, at

$$
x = \frac{X}{Z}, \qquad y = \frac{Y}{Z} ,
$$

by similar triangles. A physical pinhole camera forms an upside-down image behind the hole, at distance $F$; placing a virtual image plane in front of the centre removes the flip without changing anything else. In homogeneous coordinates the projection is linear:

$$
Z \begin{pmatrix} x \\ y \\ 1 \end{pmatrix} = \begin{pmatrix} 1 & 0 & 0 & 0 \\ 0 & 1 & 0 & 0 \\ 0 & 0 & 1 & 0 \end{pmatrix}
\begin{pmatrix} X \\ Y \\ Z \\ 1 \end{pmatrix} = [I \mid \mathbf 0]\, \tilde{\mathbf X}_c .
$$

Depth is lost: every point on the ray $\lambda \mathbf X_c$ lands on the same $(x, y)$. Recovering it is what the rest of this series is about.

### 2.2 Intrinsics: from metres to pixels

The sensor measures pixels, not normalized coordinates. With a lens of focal length $F$ (in mm) and square pixels of pitch $p$ (in mm), a normalized coordinate $x$ is $F x$ mm from the optical axis, that is $F x / p$ pixels. Adding the pixel position of the optical axis gives

$$
u = f_x\, x + s\, y + c_x, \qquad v = f_y\, y + c_y, \qquad
K = \begin{pmatrix} f_x & s & c_x \\ 0 & f_y & c_y \\ 0 & 0 & 1 \end{pmatrix},
$$

with these five **intrinsic parameters**:

- $f_x = F / p_x$ and $f_y = F / p_y$: the focal length in pixels. They differ only if pixels are not square or the image was resampled anisotropically.
- $(c_x, c_y)$: the **principal point**, where the optical axis meets the sensor; close to the image centre but rarely exactly at it.
- $s$: the **skew**, nonzero only if the sensor axes are not perpendicular. It is $0$ for practically all modern cameras, but keep it in mind for images that were cropped or rectified with a shear.

Then $\tilde{\mathbf u} \sim K \mathbf x$, and the opposite direction, **back-projection**, is $K^{-1}\tilde{\mathbf u}$: the ray direction of a pixel. The horizontal field of view follows from the image width $W$: $\theta_x = 2\arctan\\!\big(W / (2 f_x)\big)$ for a centred principal point.

**Worked example.** A lens with $F = 4.0$ mm on a sensor with $1.6\ \mu$m pixels gives $f = 4.0 / 0.0016 = 2500$ px. For a $4000 \times 3000$ image with $(c_x, c_y) = (2000, 1500)$, the horizontal field of view is $2\arctan(2000/2500) = 77.3°$. A point at $\mathbf X_c = (0.5, -0.2, 4.0)$ m has $(x, y) = (0.125, -0.05)$ and lands at $u = 2500 \cdot 0.125 + 2000 = 2312.5$, $v = 2500 \cdot (-0.05) + 1500 = 1375$.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-intrinsics.svg" caption="What each intrinsic parameter does to the image of the same checkerboard (8×6 squares of 10 cm, 1.2 m away and turned 25°) in a 640×480 image (purple frame); the red cross is the principal point. A larger $f$ magnifies about the principal point; $f_y=0.8f_x$ squashes vertically; moving $(c_x,c_y)$ translates the image without changing its shape; the skew $s=150$ shears rows sideways in proportion to $y$. The last panel keeps $K$ and rotates the camera instead ($R$ is an extrinsic): the board now changes perspective, which no change of $K$ can produce." %}

The last panel of the figure carries an important lesson. Changing $K$ is a 2D affine warp of the image (a homography with bottom row $(0, 0, 1)$); it never changes which 3D points are visible or how they overlap. Changing the pose changes the perspective itself.

### 2.3 Extrinsics: where the camera is

World points are rarely given in the camera frame. The **extrinsics** are the rigid transform from world to camera,

$$
\mathbf X_c = R\, \mathbf X_w + \mathbf t ,
$$

with a rotation $R \in SO(3)$ (3 DoF) and a translation $\mathbf t$ (3 DoF). Read the rows of $R$ as the camera's $x$, $y$ and $z$ axes expressed in world coordinates. The **camera centre** is the world point that maps to the camera origin: $R\mathbf C + \mathbf t = \mathbf 0$, so $\mathbf C = -R^\top \mathbf t$. Note that $\mathbf t$ is *not* the camera position; it is the world origin expressed in the camera frame. Mixing up $\mathbf t$ and $\mathbf C$ is the second most common pose bug (the first is in section 4).

### 2.4 The camera matrix $P = K[R \mid \mathbf t]$ and what it encodes

Chaining the three steps gives the full pinhole camera:

$$
\lambda \begin{pmatrix} u \\ v \\ 1 \end{pmatrix} = K \,[R \mid \mathbf t] \begin{pmatrix} \mathbf X_w \\ 1 \end{pmatrix} = P\,\tilde{\mathbf X}_w,
\qquad \lambda = Z_c \;(\text{the depth}).
$$

$P$ is a $3\times 4$ matrix with 11 degrees of freedom (12 entries up to scale): 5 intrinsic and 6 extrinsic. Conversely, any $3\times 4$ matrix whose left $3\times 3$ block $M$ is invertible is a finite projective camera, and it can be split back into $K$, $R$ and $\mathbf t$ (section 2.5). Write $P = [M \mid \mathbf p_4]$ with rows $\mathbf p^{1\top}, \mathbf p^{2\top}, \mathbf p^{3\top}$. A lot of geometry can be read directly from $P$:

- **Camera centre.** $P\tilde{\mathbf C} = \mathbf 0$: the centre is the right null vector of $P$, and $\mathbf C = -M^{-1}\mathbf p_4$. It is the only point with no image.
- **Columns.** The first three columns are $P(\mathbf e_i, 0)^\top$: the vanishing points of the world $X$, $Y$ and $Z$ axes (section 1.6). The fourth column is the image of the world origin.
- **Rows are planes.** $\mathbf p^{1\top}\tilde{\mathbf X} = 0$ means $u \cdot \lambda = 0$: the plane through the centre that projects to the image column $u = 0$. Likewise $\mathbf p^{2}$ is the plane of the row $v = 0$, and $\mathbf p^{3}$ is the **principal plane** through the centre parallel to the image, the points with depth $0$, which project to infinity.
- **Principal axis.** The third row of $M$, $\mathbf m^3$, is the normal of the principal plane, so it points along the optical axis. Because $P$ is defined only up to scale (including sign), the viewing direction is $\det(M)\,\mathbf m^3$.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-camera-matrix.svg" caption="The camera of the next snippet, $\mathbf C=(1,-0.6,-3)$, looking at the world origin (axes $X$, $Y$, $Z$; the OpenCV world is $y$-down, drawn with $-Y$ up). The purple quadrilateral is the image rectangle at unit depth. The red plane is $\mathbf p^{1\top}\mathbf X=0$, the plane through $\mathbf C$ and the left image edge $u=0$; the green plane is $\mathbf p^{2\top}\mathbf X=0$, through the top edge $v=0$; the blue plane is the principal plane $\mathbf p^{3\top}\mathbf X=0$ (depth zero). The arrow is the principal axis $\mathbf m^3=(-0.311,0.186,0.932)$. The script asserts that every drawn point of each plane makes that row of $P$ vanish." %}

### 2.5 Taking $P$ apart: RQ decomposition

Often you only have $P$: from a DLT estimate (post 2), from a dataset, or from an OpenGL engine. To recover $K$, $R$ and $\mathbf t$, look at the left block: $M = K R$, an upper-triangular matrix times an orthogonal one. That is exactly the **RQ decomposition**, the mirror image of the familiar QR. It is unique up to signs: inserting $D = \mathrm{diag}(\pm1, \pm1, \pm1)$ as $M = (KD)(DR)$ gives another valid factorization, since $D^2 = I$. We fix the signs by requiring a positive diagonal of $K$. One more subtlety: $P$ is only known up to scale, and the scale may be negative. If $\det M < 0$ we would get $\det R = -1$, a reflection, so we flip the sign of $P$ first. Finally $\mathbf p_4 = K\mathbf t$ gives $\mathbf t$, and we normalize $K$ so that $K_{33} = 1$.

```python
import numpy as np
from scipy.linalg import rq

def decompose_P(P):
    """Split a 3x4 camera matrix (known only up to scale and sign) into K, R, t and C."""
    P = P if np.linalg.det(P[:, :3]) > 0 else -P   # det(M) > 0  <=>  det(R) = +1
    K, R = rq(P[:, :3])                            # M = K R, K upper triangular, R orthogonal
    S = np.diag(np.sign(np.diag(K)))               # S @ S = I: flip signs so diag(K) > 0
    K, R = K @ S, S @ R
    t = np.linalg.solve(K, P[:, 3])                # p4 = K t (before rescaling K)
    K = K / K[2, 2]
    C = -R.T @ t                                   # camera centre, also the null vector of P
    return K, R, t, C

# a ground-truth camera: 640x480, fx = 800, fy = 780, skew 2, looking at the origin from C
K_true = np.array([[800.0, 2.0, 330.0], [0, 780.0, 245.0], [0, 0, 1]])
C_true = np.array([1.0, -0.6, -3.0])
z = -C_true / np.linalg.norm(C_true)                       # forward: towards the origin
x = np.cross(z, [0, -1.0, 0]); x /= np.linalg.norm(x)     # right ("up" is -y in OpenCV)
R_true = np.stack([x, np.cross(z, x), z])                 # rows: camera axes in world coordinates
t_true = -R_true @ C_true
P = -3.7 * K_true @ np.c_[R_true, t_true]                 # arbitrary (negative) scale

K, R, t, C = decompose_P(P)
print("K =\n", K.round(4))
print("R error:", np.abs(R - R_true).max(), " det R:", np.linalg.det(R).round(6))
print("C =", C.round(6), " P @ [C, 1] =", (P @ np.append(C, 1)).round(9))
print("principal axis m3 =", R[2].round(4))
```

Even with the arbitrary factor $-3.7$, the decomposition returns $K$ exactly (`[[800, 2, 330], [0, 780, 245], [0, 0, 1]]`), $R$ to within $2\times10^{-16}$ with $\det R = 1$, the centre $(1, -0.6, -3)$ with $P\tilde{\mathbf C} = \mathbf 0$, and the principal axis $(-0.3107, 0.1864, 0.9321)$, which points from $\mathbf C$ towards the origin as constructed. Without the sign handling you would get a $K$ with negative focal lengths or a "rotation" with determinant $-1$; both happen in practice with matrices exported from other tools.

### 2.6 When perspective fades: affine cameras

If a scene's depth range is small compared with its distance (a telephoto shot, a satellite image), every point has nearly the same depth $Z \approx Z_0$, and the projection becomes approximately linear: $u \approx (f/Z_0) X + c_x$. This **weak-perspective** or, more generally, **affine camera** has a last row $(0, 0, 0, 1)$ in $P$: parallel lines stay parallel and there are no finite vanishing points. It is the camera model behind classical factorization methods for Structure-from-Motion, and a useful sanity check: if your vanishing points are far outside the image, your problem is close to affine and depth will be poorly constrained.

## 3. Lens distortion

### 3.1 The Brown-Conrady model

Real lenses are not pinholes. Wide-angle lenses in particular bend straight lines near the image border. The standard model, due to Conrady (1919) and Brown (1966) and used by OpenCV and by COLMAP's `OPENCV` camera, applies a nonlinear map to the **normalized** coordinates $(x, y) = (X/Z, Y/Z)$ before $K$:

$$
\begin{aligned}
x_d &= x\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + 2p_1 xy + p_2 (r^2 + 2x^2),\\
y_d &= y\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + p_1 (r^2 + 2y^2) + 2p_2 xy,
\end{aligned}
\qquad r^2 = x^2 + y^2,
$$

then $u = f_x x_d + s\, y_d + c_x$ and $v = f_y y_d + c_y$. The **radial** terms $k_i$ model a lens that is rotationally symmetric about the optical axis: $k_1 < 0$ gives **barrel** distortion (points pulled towards the centre), $k_1 > 0$ **pincushion** distortion. The **tangential** terms $p_1, p_2$ model a lens that is slightly decentred or tilted with respect to the sensor. OpenCV's full model adds a rational radial factor ($k_4$ to $k_6$), thin-prism terms and a sensor tilt, 14 coefficients in all. Most calibrations use $(k_1, k_2, p_1, p_2)$, with $k_3$ only for strong wide-angle lenses. [Neural rendering post 1]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}) shows how barrel and pincushion warp a grid; here we look at the properties of the model that matter when you use it.

**The polynomial is only trustworthy where it was calibrated.** Look at the radial profile $r_d = r(1 + k_1 r^2 + k_2 r^4)$. For barrel distortion it eventually stops increasing and folds back, so two different rays map to the same pixel and the model cannot be inverted. With $k_1 = -0.4$ (and $k_2 = 0$) the fold is where $dr_d/dr = 1 + 3k_1 r^2 = 0$, at $r = 1/\sqrt{1.2} = 0.913$, a field angle of $\arctan(0.913) = 42.4°$. A lens with a wider field of view simply cannot be described by these coefficients, and a calibration that extrapolates beyond its data can produce this behaviour inside the image corners.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-distortion-radial.svg" caption="Left: radial profiles $r_d(r)$. With no distortion (gray) $r_d=r$; the purple curve is the lens of the next snippet ($k_1=-0.28$, $k_2=0.07$), monotonic over the whole range; $k_1=-0.4$ (red) folds back at $r=0.913$, beyond which the model is meaningless; $k_1=+0.2$ (blue) is pincushion. The dotted line marks the corner of a 640×480 image at $f=600$, $r=0.667$. Right: the error of the fixed-point undistortion of the snippet versus the number of iterations $n$ for three points of that lens; convergence is linear (a straight line on the log scale), and slower for points further out ($r=0.18$, $0.63$, $0.89$)." %}

### 3.2 Undistorting points and images

There are two different "undistort" operations, and they need opposite directions of the model.

**Points** (feature locations for geometry): we observe distorted $(x_d, y_d)$ and need the ideal $(x, y)$, the inverse of the map above, which has no closed form. A simple fixed-point iteration works well: start from $(x, y) = (x_d, y_d)$, compute the radial factor and tangential offset at the current guess, and solve the forward equations for $(x, y)$ with those held fixed. OpenCV's point undistortion uses the same kind of iteration.

```python
import numpy as np

def distort(x, y, k1=0.0, k2=0.0, p1=0.0, p2=0.0, k3=0.0):
    """Brown-Conrady (OpenCV order k1, k2, p1, p2, k3) on normalized coordinates."""
    r2 = x * x + y * y
    radial = 1 + k1 * r2 + k2 * r2**2 + k3 * r2**3
    xd = x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x)
    yd = y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y
    return xd, yd

def undistort(xd, yd, iters=20, **coef):
    """Invert distort() by fixed-point iteration: x = (x_d - tangential(x)) / radial(x)."""
    x, y = xd, yd                                      # initial guess: no distortion
    for _ in range(iters):
        r2 = x * x + y * y
        radial = 1 + coef.get("k1", 0) * r2 + coef.get("k2", 0) * r2**2 + coef.get("k3", 0) * r2**3
        dx, dy = distort(x, y, p1=coef.get("p1", 0), p2=coef.get("p2", 0))
        x = (xd - (dx - x)) / radial                   # dx - x is the tangential part
        y = (yd - (dy - y)) / radial
    return x, y

coef = dict(k1=-0.28, k2=0.07, p1=0.001, p2=-0.0005)   # a wide-angle lens (illustrative values)
x0, y0 = 0.50, 0.38                   # near the corner of a 640 x 480 image with f = 600
xd, yd = distort(x0, y0, **coef)
for n in (1, 2, 5, 10, 20):
    xu, yu = undistort(xd, yd, iters=n, **coef)
    print(f"{n:2d} iterations: error {np.hypot(xu - x0, yu - y0):.2e}")
print("distorted:", round(xd, 4), round(yd, 4), " shift in pixels at f = 600:",
      round(600 * np.hypot(xd - x0, yd - y0), 1))
```

The point near the image corner is moved by $37.4$ px by this lens, to $(0.4502, 0.3427)$. The undistortion error after 1, 2, 5, 10 and 20 iterations is $1.2\times10^{-2}$, $2.3\times10^{-3}$, $1.7\times10^{-5}$, $4.9\times10^{-9}$ and $5.2\times10^{-16}$: roughly a constant factor per step. At $f = 600$, five iterations leave $10^{-2}$ px, enough for most uses but not for the outer corners of strong lenses, which is why it pays to check the residual instead of trusting a fixed iteration count.

**Images** (to get a pinhole image for an algorithm that assumes one, such as the original 3DGS rasterizer): for every pixel of the *output* (undistorted) image, compute where it came from in the captured image and sample there. That only needs the **forward** model `distort`, which is why image undistortion is fast and exact (`cv2.initUndistortRectifyMap` followed by `cv2.remap`).

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-distortion-image.svg" caption="The lens of the snippet on a 640×480 image with $f=600$. (a) A synthetic capture of a flat checkerboard with 40 px squares: barrel distortion bends the outer squares. Rendering it needs the inverse model, one `undistort` per pixel. (b) The rectified image, computed by the forward model alone: each output pixel is distorted, then the capture (a) is sampled there; the squares are square again. (c) The displacement $f\,\Vert\mathbf x_d-\mathbf x\Vert$ in pixels with contours at 2, 5, 10, 20 and 30 px; it reaches 44.8 px in the corner, and the cross marks the snippet's point (37.4 px)." %}

A practical consequence: with barrel distortion, the corners of the rectified image come from *inside* the captured frame, while the captured corners map *outside* the rectified one. You must choose between cropping (all output pixels valid) and keeping all input pixels (black borders); `cv2.getOptimalNewCameraMatrix` exposes exactly this trade-off through its `alpha` parameter, and returns a new $K$ for the rectified image.

### 3.3 Fisheye lenses and the Kannala-Brandt model

A pinhole maps a ray at angle $\theta$ from the optical axis to the radius $r = f\tan\theta$ on the image. As $\theta \to 90°$ this diverges: with $f = 300$ px, rays at 60°, 80° and 89° land at 520, 1701 and 17187 px from the centre. No sensor can hold a 180° view this way, and a polynomial correction of $\tan\theta$ cannot fix it. Fisheye lenses are designed around other **projection functions** $r(\theta)$:

| Projection | $r(\theta)$ | Typical use |
| --- | --- | --- |
| perspective (pinhole) | $f\tan\theta$ | ordinary lenses; impractical for very wide fields of view |
| equidistant | $f\theta$ | many fisheye lenses; angle proportional to radius |
| equisolid | $2f\sin(\theta/2)$ | equal-area fisheyes |
| stereographic | $2f\tan(\theta/2)$ | preserves local shape (conformal) |
| orthographic | $f\sin\theta$ | limited to 180° |

Kannala and Brandt (2006) proposed to model any of them, and real lenses in between, by an odd polynomial in the angle:

$$
r(\theta) = f\,\theta_d, \qquad \theta_d = \theta\,(1 + k_1\theta^2 + k_2\theta^4 + k_3\theta^6 + k_4\theta^8),
\qquad \theta = \operatorname{atan2}\!\big(\sqrt{X^2 + Y^2},\, Z\big),
$$

and the pixel is $u = f_x\,\theta_d \cos\varphi + c_x$, $v = f_y\,\theta_d \sin\varphi + c_y$ with the azimuth $\varphi = \operatorname{atan2}(Y, X)$ unchanged. This is the model of OpenCV's `cv::fisheye` module and of COLMAP's `OPENCV_FISHEYE` camera. Two things make it work. First, it is a polynomial in $\theta$, not in $\tan\theta$, so it stays finite at and beyond 90°. Second, because $\theta = \operatorname{atan2}(\rho, Z)$ is computed from the 3D ray rather than from $X/Z$, it handles rays with $Z \le 0$, behind the image plane, which a pinhole cannot even express.

```python
import numpy as np

def project_kb(Xc, K, k):
    """Kannala-Brandt / OpenCV fisheye: r_d = theta (1 + k1 theta^2 + ... + k4 theta^8)."""
    rho = np.hypot(Xc[:, 0], Xc[:, 1])
    theta = np.arctan2(rho, Xc[:, 2])                  # angle to the optical axis, also > 90 deg
    t2 = theta**2
    theta_d = theta * (1 + k[0] * t2 + k[1] * t2**2 + k[2] * t2**3 + k[3] * t2**4)
    phi = np.arctan2(Xc[:, 1], Xc[:, 0])               # the azimuth is unchanged
    xd, yd = theta_d * np.cos(phi), theta_d * np.sin(phi)
    return np.c_[K[0, 0] * xd + K[0, 1] * yd + K[0, 2], K[1, 1] * yd + K[1, 2]]

# a 190-degree equisolid lens r = 2 f sin(theta / 2), fitted by the 4 KB coefficients
f = 300.0
theta = np.linspace(0, np.deg2rad(95), 200)
r_true = 2 * f * np.sin(theta / 2)
A = f * np.stack([theta**3, theta**5, theta**7, theta**9], 1)   # r = f (theta + k1 theta^3 + ...)
k = np.linalg.lstsq(A, r_true - f * theta, rcond=None)[0]
print("k =", k.round(6))
print(f"max fit error: {np.abs(f * theta + A @ k - r_true).max():.1e} px")
print("pinhole radius at 60/80/89 deg:", (f * np.tan(np.deg2rad([60, 80, 89]))).round(0))

# a ray 95 degrees off the axis (behind the plane Z = 0) still lands in the image
K = np.array([[f, 0, 640.0], [0, f, 480.0], [0, 0, 1]])
X = np.array([[np.sin(np.deg2rad(95)), 0.0, np.cos(np.deg2rad(95))]])
print("pixel of a ray at 95 deg:", project_kb(X, K, k).round(1))
```

Because $r = f(\theta + k_1\theta^3 + \dots)$ is linear in the $k_i$, fitting a lens curve is a linear least-squares problem. For the equisolid lens the fit gives $k = (-0.041667, 0.000521, -0.000003, 0)$ with a maximum error of $6.2\times10^{-9}$ px over 0 to 95°. These are, to the printed digits, the Taylor coefficients of $2\sin(\theta/2) = \theta - \theta^3/24 + \theta^5/1920 - \dots$: Kannala-Brandt is a truncated Taylor series of the lens's projection function. The ray 95° off-axis, which has $Z < 0$, lands at pixel $(1082.4, 480.0)$.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-fisheye-models.svg" caption="Left: the five projection functions, as $r/f$ against the field angle $\theta$. The pinhole $f\tan\theta$ diverges at 90° (dotted); the fisheye models stay finite, and the orthographic one ends at 90°. Right: the maximum error of a four-coefficient Kannala-Brandt fit (the snippet's least squares, $f=300$, over 0 to 95°): $6.2\times10^{-9}$ px for the equisolid lens, $6.1\times10^{-6}$ px for the orthographic and $6.3\times10^{-3}$ px for the stereographic one, whose Taylor series converges more slowly. All three are far below the noise of any real calibration." %}

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-fisheye-room.svg" caption="A camera at the centre of a cube whose six walls carry checkerboards of different colours, rendered on a 420×420 sensor by back-projecting every pixel. A 90° pinhole ($f=210$) sees exactly the front wall. A 150° pinhole ($f=56$) sees the side walls too, but stretches them enormously, because $r=f\tan\theta$ spends most of the sensor on the outer angles while the front wall shrinks to a small square. A 180° equidistant fisheye ($f=134$, $r=f\theta$) shares the sensor evenly over the angles and shows five walls in an image circle; straight edges become curves." %}

With the projection models in hand, the widget below combines everything so far: intrinsics, the two distortion models, the checkerboard image, and the true field of view in 3D.

{% include widget.liquid name="3d-vision-camera-model" height="900" caption="Interactive camera model. Move the intrinsics and the distortion coefficients and watch the 640×480 image of a 12×9 checkerboard; the dashed orange outline is the same board through a pure pinhole with the same $K$. The purple frustum on the left is the field of view the current model really sees, found by unprojecting the image border (fixed-point iteration for Brown-Conrady, Newton's method for Kannala-Brandt). Try the Barrel preset and push $k_1$ further negative until parts of the board vanish where the polynomial folds back, then switch to the Fisheye preset and watch the field of view exceed 160°." %}

### 3.4 Other wide-angle and generic models

Kannala-Brandt is not the only choice. The **unified camera model** of Mei and Rives (2007) projects the point onto a unit sphere first and then perspectively from a point shifted along the axis, which also covers catadioptric (mirror) cameras; the **double sphere** model (Usenko, Demmel and Cremers, 3DV 2018) uses two spheres, fits large-field-of-view lenses about as well, and has a closed-form inverse, which matters inside visual odometry where projection and unprojection run millions of times. Devernay and Faugeras (2001) used the property we started with, that a pinhole camera maps straight lines to straight lines, to estimate distortion with no calibration target. At the other extreme, **generic** camera models drop the parametric form and store a dense grid of ray directions; Schöps et al. (CVPR 2020) argue that such models, with thousands of parameters, calibrate real lenses noticeably more accurately than the usual twelve. Post 2 returns to how these models are estimated.

### 3.5 Rolling shutter

Most CMOS sensors do not expose all rows at once. A **rolling shutter** reads the image row by row, so row $v$ is captured at time

$$
t(v) = t_0 + \frac{v}{H}\,\tau ,
$$

where $\tau$ is the readout time of the frame (typically several to tens of milliseconds). If the camera moves during readout, every row is taken from a slightly different pose: $\mathbf X_c(v) = R(t(v))\,\mathbf X_w + \mathbf t(t(v))$. Vertical structures lean during a pan, objects wobble under vibration ("jello"), and a fast propeller turns into curved blades. Geometrically the image is no longer a central projection; Meingast, Geyer and Sastry (2005) analyse this model in detail.

The projection becomes an implicit equation, because the row at which a point appears depends on the pose, which depends on the row: $v = \pi_v\big(P(t(v))\,\tilde{\mathbf X}\big)$. For moderate motion, a fixed-point iteration solves it in a few steps.

```python
import numpy as np

def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

f, W, H = 1000.0, 1920, 1080
K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
readout = 0.030                       # seconds from the first to the last row
omega = np.deg2rad(60.0)              # pan rate (rad/s) about the camera y axis

def project_rs(X, iters=10):
    """Rolling-shutter projection of one world point: row v is exposed at t = readout * v / H,
    so the pixel must satisfy v = proj_v(R(t(v)) X). Solve by fixed-point iteration."""
    v = H / 2
    for _ in range(iters):
        t = readout * v / H
        x = K @ (rot_y(-omega * t) @ X)          # camera turned by omega * t
        u, v = x[0] / x[2], x[1] / x[2]
    return u, v

# a vertical pole 5 m ahead, from 2.5 m above to 2.5 m below the optical axis
for Y in (-2.5, 0.0, 2.5):
    X = np.array([0.0, Y, 5.0])
    u_gs = (K @ X)[0] / 5.0                     # global shutter (t = 0 for every row)
    u, v = project_rs(X)
    print(f"Y = {Y:+.1f} m: row {v:7.1f}, u_global = {u_gs:.1f}, u_rolling = {u:.1f}")
print(f"rotation during readout: {np.rad2deg(omega * readout):.2f} deg = {f * np.tan(omega * readout):.1f} px at the centre")
```

With a 30 ms readout and a moderate 60°/s pan to the right, a vertical pole that a global shutter images at $u = 960$ appears at $u = 958.8$ in row 40, $944.3$ in row 540 and $929.7$ in row $1040.2$: it leans by 29 px over 1000 rows. The camera turns by $1.80°$ during the full readout, which is $31.4$ px at the image centre; $31.4 \cdot 1000/1080 = 29.1$ px matches the lean.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-rolling-shutter.svg" caption="Left: seven vertical poles 8 m ahead in a 1920×1080 image ($f=1000$, 30 ms readout), with a global shutter (gray), and with a rolling shutter while panning right at 60°/s (purple) and 240°/s (orange). Rows exposed later see the scene further to the left. Right: horizontal displacement of the pole of the snippet relative to the global-shutter image, against the row (and its exposure time on the right axis), for 60, 120 and 240°/s. Between rows 40 and 1040 the pole leans by 29.1, 58.3 and 117.3 px; the displacement grows almost linearly with the exposure time of the row." %}

Two pixels of error are enough to bias pose estimation, so rolling shutter matters whenever the camera moves quickly: phones, drones, head-mounted cameras. Rolling-shutter-aware bundle adjustment (Hedborg et al., CVPR 2012) adds per-frame velocities to the unknowns; visual-inertial systems use the IMU to predict the motion within a frame. This is one reason tracking cameras often use global-shutter sensors.

## 4. Coordinate conventions

Everything above used the OpenCV camera frame. Other software uses other frames, and a pipeline that mixes them without converting produces results that are wrong but often plausible-looking. This section is a reference you will come back to.

### 4.1 Camera frames

| Convention | $x$ | $y$ | $z$ | camera looks along | Used by |
| --- | --- | --- | --- | --- | --- |
| OpenCV / COLMAP | right | down | forward | $+z$ | OpenCV, COLMAP, 3DGS (internally), ROS optical frames |
| OpenGL / Blender / NeRF | right | up | backward | $-z$ | OpenGL, Blender, NeRF `transforms.json`, nerfstudio |
| LLFF | down | right | backward | $-z$ | `poses_bounds.npy` of LLFF and the forward-facing NeRF scenes |
| PyTorch3D | left | up | forward | $+z$ | PyTorch3D cameras |

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-conventions.svg" width="80%" caption="One physical camera, looking into the page (purple image rectangle), described in four conventions. All four frames are right-handed; they differ by which camera axis is called $x$, $y$ and $z$. Converting between OpenCV and OpenGL flips $y$ and $z$; LLFF lists the columns as (down, right, backward); PyTorch3D flips $x$ and $y$ relative to OpenCV." %}

All four frames are right-handed, so each conversion is a rotation of the camera's own axes: a right-multiplication of the camera-to-world matrix (or a left-multiplication of the world-to-camera matrix) by a fixed matrix. OpenCV to OpenGL is $\mathrm{diag}(1, -1, -1)$. The **world** frame is a separate choice. Blender and many robotics stacks are $Z$-up; ROS (REP 103) uses $x$ forward, $y$ left, $z$ up for bodies and a separate `_optical` frame with the OpenCV axes for cameras; COLMAP's world frame is whatever the reconstruction happened to produce.

### 4.2 Poses: world-to-camera or camera-to-world

A pose can be stored in either direction:

$$
T_{w2c} = \begin{pmatrix} R & \mathbf t \\ \mathbf 0^\top & 1 \end{pmatrix},
\qquad
T_{c2w} = T_{w2c}^{-1} = \begin{pmatrix} R^\top & \mathbf C \\ \mathbf 0^\top & 1 \end{pmatrix}, \quad \mathbf C = -R^\top\mathbf t .
$$

The columns of $T_{c2w}$ are the camera axes and the camera centre in world coordinates, which is convenient for placing cameras in a scene, so NeRF-style datasets store $T_{c2w}$. COLMAP's `images.txt` stores $T_{w2c}$ as a unit quaternion `QW QX QY QZ` (scalar first, Hamilton convention) and a translation `TX TY TZ`. Quaternion order is a trap of its own: SciPy's `Rotation.from_quat` expects scalar-last $(x, y, z, w)$ by default, and Eigen's `Quaternion(w, x, y, z)` constructor takes scalar-first arguments but stores the coefficients scalar-last.

### 4.3 Pixels and image coordinates

Even the pixel grid has conventions. In OpenCV, integer coordinates are pixel **centres**: the top-left pixel is centred at $(0, 0)$. COLMAP puts the image origin at the top-left **corner**, so the top-left pixel centre is $(0.5, 0.5)$, and the same lens has $c_x^{\text{COLMAP}} = c_x^{\text{OpenCV}} + 0.5$. OpenGL window coordinates start at the bottom-left, with $y$ up, and its normalized device coordinates run from $-1$ to $1$. These half-pixel and flip offsets are invisible in a quick visual check and show up as a systematic sub-pixel error, or as a vertically mirrored image.

### 4.4 Code: converting COLMAP to NeRF and OpenGL

The snippet below takes one COLMAP image (quaternion, translation, `PINHOLE` intrinsics), builds the OpenCV and OpenGL camera-to-world matrices, builds the OpenGL projection matrix that reproduces $K$, and checks that both routes put a world point at the same pixel. The OpenGL matrix is the frustum matrix of [rasterization]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }}) with its entries expressed through $f_x, f_y, c_x, c_y$; it follows from substituting $(x, y, z)\_{\text{CV}} = (x, -y, -z)\_{\text{GL}}$ into $u = f_x x/z + s\,y/z + c_x$ and mapping $u \in [0, W]$ to $x_{\text{ndc}} \in [-1, 1]$ and $v \in [0, H]$ to $y_{\text{ndc}} \in [1, -1]$.

```python
import numpy as np

def qvec2rotmat(q):
    """COLMAP quaternion (QW, QX, QY, QZ) -> rotation matrix (Hamilton convention)."""
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])

CV_TO_GL = np.diag([1.0, -1.0, -1.0, 1.0])   # flip the camera's y and z axes

def colmap_to_c2w(qvec, tvec, convention="opencv"):
    """images.txt stores world-to-camera; NeRF-style loaders want camera-to-world."""
    R = qvec2rotmat(qvec)
    c2w = np.eye(4)
    c2w[:3, :3], c2w[:3, 3] = R.T, -R.T @ tvec      # columns: camera axes and centre in world
    return c2w @ CV_TO_GL if convention == "opengl" else c2w

def gl_projection(K, W, H, near, far):
    """OpenGL clip matrix that reproduces the pinhole K (pixel origin at the image corner,
    pixel centres at +0.5, as in COLMAP) for a camera looking down -z with y up."""
    fx, s, cx, fy, cy = K[0, 0], K[0, 1], K[0, 2], K[1, 1], K[1, 2]
    return np.array([
        [2 * fx / W, -2 * s / W, 1 - 2 * cx / W, 0],
        [0, 2 * fy / H, 2 * cy / H - 1, 0],
        [0, 0, -(far + near) / (far - near), -2 * far * near / (far - near)],
        [0, 0, -1, 0]])

# one COLMAP image: quaternion, translation and a PINHOLE camera 1600 x 1200
qvec, tvec = np.array([0.95, 0.10, -0.25, 0.05]), np.array([0.3, -0.2, 2.5])
K = np.array([[1450.0, 0, 801.5], [0, 1450.0, 598.0], [0, 0, 1]])
W, H = 1600, 1200
Xw = np.array([0.4, -0.3, 1.2, 1.0])                 # a world point (homogeneous)

# (1) OpenCV/COLMAP route: world -> camera -> K
R = qvec2rotmat(qvec)
xc = R @ Xw[:3] + tvec
u_cv = (K @ xc)[:2] / xc[2]

# (2) OpenGL route: inverse of the OpenGL camera-to-world, projection, divide, viewport
c2w_gl = colmap_to_c2w(qvec, tvec, "opengl")
clip = gl_projection(K, W, H, 0.1, 100.0) @ np.linalg.inv(c2w_gl) @ Xw
ndc = clip[:3] / clip[3]
u_gl = np.array([(ndc[0] + 1) * W / 2, (1 - ndc[1]) * H / 2])   # y_ndc points up, v down

print("OpenCV pixel:", u_cv.round(4), " OpenGL pixel:", u_gl.round(4))
print("camera centre:", c2w_gl[:3, 3].round(4), " looks along:", (-c2w_gl[:3, 2]).round(4))

# (3) LLFF's poses_bounds.npy stores camera-to-world columns as [down, right, backwards]
c2w_cv = colmap_to_c2w(qvec, tvec)[:3]                                  # [right, down, forward | C]
llff = np.c_[c2w_cv[:, 1], c2w_cv[:, 0], -c2w_cv[:, 2], c2w_cv[:, 3]]   # [down, right, back | C]
nerf = np.c_[llff[:, 1], -llff[:, 0], llff[:, 2], llff[:, 3]]           # [right, up, back | C]
print("LLFF reordered equals the OpenGL c2w:", np.allclose(nerf, c2w_gl[:3]))
```

Both routes give the pixel $(849.0957, 306.4640)$, to all printed digits. The camera centre is $(-1.4913, -0.1826, -2.0304)$ and, in the OpenGL convention, the camera looks along $-z$, the world direction $(0.4962, 0.1688, 0.8517)$. The last line performs the column reordering that NeRF's LLFF loader applies, (down, right, back) to (right, up, back), and confirms that it yields the same OpenGL camera-to-world matrix (`True`).

### 4.5 A debugging checklist

When poses from one tool look wrong in another:

1. **Draw the cameras.** Plot every camera centre and its viewing direction together with the sparse points. Cameras pointing away from the scene mean a flipped $z$; a mirrored scene means a flipped single axis, that is a determinant of $-1$ somewhere.
2. **Project a known point.** Take a 3D point and a pixel where you know it appears, and check that your full chain reproduces it to a pixel. In the OpenCV convention the depth $Z_c$ must be positive.
3. **Check the direction of the pose.** If all camera centres collapse near the origin or form a mirror image of the expected trajectory, you are probably using $\mathbf t$ instead of $\mathbf C = -R^\top\mathbf t$, or $T_{w2c}$ instead of $T_{c2w}$.
4. **Check the quaternion order** (scalar first or last) and the Euler-angle convention, if any.
5. **Check the principal point** against the image size, including the half-pixel convention, and whether the images were resized after calibration ($f_x, f_y, c_x, c_y$ all scale with the image).
6. **Check the distortion model.** If the data was calibrated with distortion but your renderer assumes a pinhole, undistort the images first, as the 3DGS preprocessing does.

## Try it

- The two widgets above: vanishing points and calibration from them, and the complete camera model with Brown-Conrady and Kannala-Brandt distortion.
- The [Interactive Lab]({{ '/' | relative_url }}#lab) on the home page renders with ideal pinhole cameras. The Gaussian World demo projects every Gaussian with a focal length in pixels of $f = (H/2)/\tan(\theta_y/2)$, the field-of-view relation of section 2.2 applied to the vertical axis; orbiting or walking changes only $R$ and $\mathbf t$.
- Take a photo of a building with your phone, mark two vanishing points of perpendicular edges by intersecting lines, and estimate your camera's focal length in pixels with the formula of section 1.6. Compare it with the 35 mm equivalent focal length $F_{35}$ in the EXIF data: $f \approx F_{35}\, W / 36\,\text{mm}$ for an image $W$ pixels wide in landscape orientation.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Decentering distortion of lenses (Brown) | Photogrammetric Engineering | 1966 | — | The radial plus tangential distortion model used by OpenCV |
| Using vanishing points for camera calibration (Caprile, Torre) | IJCV | 1990 | [DOI](https://doi.org/10.1007/BF00127813) | Intrinsics from vanishing points; the orthocentre property |
| A flexible new technique for camera calibration (Zhang) | TPAMI | 2000 | [DOI](https://doi.org/10.1109/34.888718) | Checkerboard calibration, the basis of post 2 |
| Straight lines have to be straight (Devernay, Faugeras) | Machine Vision and Applications | 2001 | [DOI](https://doi.org/10.1007/PL00013269) | Distortion from the straightness of lines, no target needed |
| Geometric models of rolling-shutter cameras (Meingast, Geyer, Sastry) | arXiv preprint | 2005 | [arXiv](https://arxiv.org/abs/cs/0503076) | Projection equations for rolling-shutter cameras in motion |
| A generic camera model and calibration method for conventional, wide-angle, and fish-eye lenses (Kannala, Brandt) | TPAMI | 2006 | [DOI](https://doi.org/10.1109/TPAMI.2006.153) | The polynomial-in-angle fisheye model of OpenCV and COLMAP |
| Single view point omnidirectional camera calibration from planar grids (Mei, Rives) | ICRA | 2007 | [DOI](https://doi.org/10.1109/ROBOT.2007.364084) | The unified (sphere) model for fisheye and catadioptric cameras |
| Rolling shutter bundle adjustment (Hedborg, Forssén, Felsberg, Ringaby) | CVPR | 2012 | [DOI](https://doi.org/10.1109/CVPR.2012.6247831) | Structure from motion with per-row poses |
| Structure-from-Motion revisited (Schönberger, Frahm) | CVPR | 2016 | [CVF](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) | COLMAP, whose camera models and conventions most datasets inherit |
| The double sphere camera model (Usenko, Demmel, Cremers) | 3DV | 2018 | [arXiv](https://arxiv.org/abs/1807.08957) | A wide-angle model with a closed-form inverse, and a comparison of models |
| Local light field fusion (Mildenhall et al.) | SIGGRAPH (ACM TOG) | 2019 | [arXiv](https://arxiv.org/abs/1905.00889) | The `poses_bounds.npy` format used by forward-facing NeRF scenes |
| Why having 10,000 parameters in your camera model is better than twelve (Schöps et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1912.02908) | Generic dense camera models calibrate more accurately |

## Learning resources

- R. Hartley and A. Zisserman, *Multiple View Geometry in Computer Vision*, 2nd ed., Cambridge University Press, 2004. Chapters 2 and 3 (projective geometry of 2D and 3D), 6 (camera models) and 8 (vanishing points and single-view geometry) are the reference for sections 1 and 2.
- R. Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed., 2022, chapter 2 (image formation). Free for personal use at [szeliski.org/Book](https://szeliski.org/Book/).
- OpenCV documentation: the [calib3d module](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html) (pinhole and Brown-Conrady model) and the [fisheye module](https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html) (Kannala-Brandt).
- COLMAP documentation: the [output format](https://colmap.github.io/format.html) (`cameras.txt`, `images.txt`) and the camera model list.
- Convention references: [nerfstudio data conventions](https://docs.nerf.studio/quickstart/data_conventions.html) and [PyTorch3D camera coordinate systems](https://pytorch3d.org/docs/cameras).

## Exercises

1. Compute the intersection of the vertical lines $x = 1$ and $x = 3$ in homogeneous coordinates, and the line through the points at infinity $(1, 0, 0)$ and $(0, 1, 0)$. Interpret both results.

   <details markdown="1"><summary>Hint</summary>

   The lines are $(1, 0, -1)$ and $(1, 0, -3)$; their cross product is $(0, 2, 0) \sim (0, 1, 0)$, the point at infinity in the vertical direction. The line through $(1,0,0)$ and $(0,1,0)$ is their cross product $(0, 0, 1) = \mathbf l_\infty$.
   </details>

2. Show that for a camera with zero skew and square pixels, the principal point is the orthocentre of the triangle of three vanishing points of mutually orthogonal directions. What can you still recover when the camera is level and $\mathbf v_Z$ is at infinity?

   <details markdown="1"><summary>Hint</summary>

   Write the orthogonality condition $(\mathbf v_i - \mathbf c)\cdot(\mathbf v_j - \mathbf c) = -f^2$ for the three pairs and subtract two of them. If $\mathbf v_Z = (a, b, 0)$ is at infinity, its ray $K^{-1}\mathbf v_Z = (a/f, b/f, 0)$ must be orthogonal to the ray of $\mathbf v_X$, which gives $(\mathbf v_X - \mathbf c)\cdot(a, b) = 0$: the principal point lies on the horizon. That leaves a one-parameter family of $(\mathbf c, f)$ satisfying $(\mathbf v_X - \mathbf c)\cdot(\mathbf v_Y - \mathbf c) = -f^2$; you need one more assumption, such as $c_x$ at the image centre (as in the widget), to fix $f$.
   </details>

3. Implement RQ decomposition yourself with `np.linalg.qr`, without SciPy, and check it against `scipy.linalg.rq` inside `decompose_P`.

   <details markdown="1"><summary>Hint</summary>

   Let $J$ be the exchange matrix (ones on the anti-diagonal). Compute `Q, U = np.linalg.qr((J @ M).T)`; then $K = J U^\top J$ is upper triangular and $R = J Q^\top$ is orthogonal, with $KR = M$. Fix the signs as in `decompose_P`.
   </details>

4. For Brown-Conrady with only $k_1 = -0.4$, what is the largest field of view (full angle, square pixels, centred principal point) that the model can represent? Repeat for $k_1 = -0.28$, $k_2 = 0.07$.

   <details markdown="1"><summary>Hint</summary>

   The model folds where $1 + 3k_1 r^2 + 5k_2 r^4 = 0$. For $k_1 = -0.4$ that is $r = 0.913$, a half-angle of $42.4°$ and a full angle of $84.8°$. For the second lens the quadratic $0.35 s^2 - 0.84 s + 1$ in $s = r^2$ has no real root, so it never folds (though its accuracy far outside the calibrated region is another question).
   </details>

5. Derive a first-order formula for the rolling-shutter lean of a vertical line during a pan at angular rate $\omega$, and check it against the snippet. How fast may you pan with a 30 ms readout and $f = 1000$ if the lean over the full frame must stay below 2 px?

   <details markdown="1"><summary>Hint</summary>

   Near the image centre a small rotation $\delta$ shifts the image by about $f\delta$, and row $v$ is exposed $\tau v/H$ later, so the shift is $\Delta u(v) \approx f\,\omega\,\tau\,v/H$. Over the full frame that is $f\omega\tau = 1000 \cdot 1.047 \cdot 0.03 = 31.4$ px for 60°/s, as printed. For 2 px you need $\omega < 2/(1000 \cdot 0.03)$ rad/s, about 3.8°/s.
   </details>

6. You receive a NeRF `transforms.json` with camera-to-world matrices in the OpenGL convention and want to train 3DGS, which expects OpenCV world-to-camera matrices. Write the conversion and verify it by projecting a point with both.

   <details markdown="1"><summary>Hint</summary>

   $T_{w2c}^{\text{CV}} = \big(T_{c2w}^{\text{GL}}\,\mathrm{diag}(1,-1,-1,1)\big)^{-1}$. Reuse the projection check of section 4.4 in reverse. Also convert the field of view or focal length in the JSON into $f_x, f_y$ in pixels for the actual image size.
   </details>

**Next:** [Camera calibration]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}): how to estimate $K$ and the distortion coefficients from images of a checkerboard, and how to tell whether the result can be trusted.
