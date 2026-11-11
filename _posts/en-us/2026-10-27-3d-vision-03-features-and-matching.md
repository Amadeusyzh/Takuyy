---
layout: post
title: "Features and matching: corners, SIFT, RANSAC and learned matchers"
date: 2026-10-27 11:03:00+0900
description: "How to find the same point in two images: the structure tensor and Harris corners, scale space and SIFT, FAST/BRIEF/ORB, the ratio test, RANSAC and its descendants (MSAC, LO-RANSAC, MAGSAC++), SuperPoint, SuperGlue, LightGlue, LoFTR and RoMa, Lucas-Kanade and RAFT optical flow, and how matchers are evaluated, with NumPy code for every step."
categories: 3d-vision
tags: [harris, sift, orb, feature-matching, ratio-test, ransac, superglue, lightglue, loftr, optical-flow]
series: 3d-vision
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## Why this matters

[Post 2]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}) gave us cameras whose intrinsics we trust. Everything that comes next in this series (relative pose and triangulation in post 4, Structure-from-Motion and bundle adjustment in post 5, SLAM in post 6) is built on one kind of raw data: **correspondences**, pairs of pixels in two images that show the same 3D point. Calibration had a printed board with known corners. A real scene has no labels, so the computer has to find the "same point" by itself, in images taken from different places, at different scales, under different light. How many correspondences we get, how precise they are, and how many of them are wrong decides whether a reconstruction succeeds or quietly fails.

[Neural rendering post 1]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}) summarized this step in one paragraph ("SIFT, a ratio test, RANSAC"). This post opens that box. We build each stage from scratch in NumPy on a synthetic image pair with a known ground-truth homography, so every claim can be checked with numbers: corners from the structure tensor, blobs from scale space, the SIFT descriptor, binary descriptors, nearest-neighbour matching with the ratio test, RANSAC and its modern descendants, the learned matchers that replaced much of this pipeline after 2018, and finally optical flow, which is matching between consecutive video frames.

The pipeline we are going to build:

| Stage | Question it answers | Classical answer | Learned answer |
| --- | --- | --- | --- |
| Detection | Which pixels can be found again in another image? | Harris, Shi-Tomasi, DoG, FAST | SuperPoint, DISK, ALIKED |
| Description | What does the neighbourhood of a keypoint look like, in a way that survives viewpoint and light changes? | SIFT (128 floats), ORB (256 bits) | SuperPoint (256 floats), learned patch descriptors |
| Matching | Which keypoint in image 2 belongs to this one? | nearest neighbour + ratio test + mutual check | SuperGlue, LightGlue; detector-free LoFTR, RoMa |
| Verification | Which matches agree with one geometric model? | RANSAC, MSAC, LO-RANSAC, MAGSAC++ | (still mostly RANSAC) |

## Prerequisites

- Image gradients and convolution with a Gaussian (any image processing course; `scipy.ndimage`).
- Eigenvalues of a symmetric 2x2 matrix, least squares and the SVD.
- Homographies and the normalized DLT from [post 2]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}); pixel coordinates from [post 1]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }}).
- Basic probability (independent trials) for RANSAC, and basic deep learning (CNNs, attention) for section 7.

Notation: an image is a function $I(x, y)$ with $x$ to the right and $y$ down, stored as `img[y, x]` with values in $[0, 1]$. $I_x = \partial I/\partial x$ and $I_y = \partial I/\partial y$ are its partial derivatives, $\nabla I = (I_x, I_y)^\top$ its gradient. $G_\sigma$ is a 2D Gaussian with standard deviation $\sigma$, and $\ast$ is convolution.

## 1. What makes a good feature

A **local feature** is a point (plus, often, a scale and an orientation) together with a **descriptor**, a vector summarizing its neighbourhood. We want features that are:

- **Repeatable**: the detector fires on the same physical point in both images, despite rotation, scale change, blur, noise and illumination change.
- **Distinctive**: the descriptor of that point differs from the descriptors of all other points, so a nearest-neighbour search finds the right partner.
- **Local**: computed from a small neighbourhood, so occlusion and clutter elsewhere do not matter.
- **Accurate**: localized to a fraction of a pixel, because every pixel of error becomes a 3D error after triangulation.
- **Efficient**: thousands per image, in milliseconds for SLAM.

Two words are easy to confuse. A detector is **covariant** with a transformation if its output transforms with the image (rotate the image by 30°, the keypoints rotate by 30° and the detected scale follows the zoom). A descriptor is **invariant** if its value does not change. SIFT gets invariant descriptors from covariant detection: it measures the scale and orientation of each keypoint and then describes the patch in that normalized frame.

Which points can satisfy these requirements? Look at three small windows of an image. In a **flat** region, the window can slide in any direction and nothing changes: the point cannot be found again. On an **edge**, the window can slide along the edge without change: the position is only known across the edge (this is the **aperture problem**, which will return in section 8). At a **corner**, every shift changes the content: the point is fixed in both directions. The next section turns this observation into a formula.

### 1.1 A test pair with a known answer

To check every step with numbers we need ground truth. `make_scene` paints 120 random rectangles, disks and triangles onto a smooth background. The second image is the first one warped by a known homography `H_true` (a rotation by 25°, a scale change by 0.8, a translation and a little perspective), with a change of brightness and contrast and some noise. Two photographs of a planar scene are related in exactly this way ([post 2]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})), so for every point $\mathbf x$ of image 1 we know that its true position in image 2 is `apply_h(H_true, x)`. All later snippets continue from this one.

```python
import numpy as np
from scipy import ndimage as ndi


def make_scene(h=240, w=320, n_shapes=120, seed=0):
    """A synthetic 'poster': random rectangles, disks and triangles on a smooth background."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    img = 0.5 + 0.15 * np.sin(xx / 37.0) * np.cos(yy / 23.0)
    for _ in range(n_shapes):
        kind, val = rng.integers(3), rng.uniform(0.0, 1.0)
        cx, cy, r = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(4, 22)
        if kind == 0:                                    # axis-aligned rectangle
            m = (abs(xx - cx) < r) & (abs(yy - cy) < r * rng.uniform(0.4, 1.0))
        elif kind == 1:                                  # disk
            m = (xx - cx) ** 2 + (yy - cy) ** 2 < r * r
        else:                                            # triangle = three half-planes
            a = rng.uniform(0, 2 * np.pi) + np.array([0.0, 2.1, 4.2])
            px, py = cx + r * np.cos(a), cy + r * np.sin(a)
            m = np.ones((h, w), bool)
            for i in range(3):
                j = (i + 1) % 3
                m &= (px[j] - px[i]) * (yy - py[i]) - (py[j] - py[i]) * (xx - px[i]) > 0
        img[m] = val
    return ndi.gaussian_filter(img, 0.7)


def warp_homography(img, H, shape):
    """out(x2) = img(H^-1 x2), bilinear; pixels that fall outside get 0.5 (gray)."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    p = np.linalg.inv(H) @ np.stack([xx.ravel(), yy.ravel(), np.ones(h * w)])
    return ndi.map_coordinates(img, [p[1] / p[2], p[0] / p[2]], order=1, cval=0.5).reshape(h, w)


def apply_h(H, p):
    q = np.c_[p, np.ones(len(p))] @ H.T
    with np.errstate(divide="ignore", invalid="ignore"):   # degenerate hypotheses -> inf / nan
        return q[:, :2] / q[:, 2:]


img = make_scene()                                       # 240 x 320, values in [0, 1]
# image 2: rotate by 25 deg, scale by 0.8 about the centre, add mild perspective, change
# brightness and contrast, add noise. H_true maps pixels of img to pixels of img2.
th, s, c = np.deg2rad(25), 0.8, np.array([160.0, 120.0])
A = s * np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
H_true = np.eye(3); H_true[:2, :2] = A; H_true[:2, 2] = c - A @ c + [10, -6]
H_true[2, :2] = [2e-4, -1e-4]
img2 = 0.85 * warp_homography(img, H_true, img.shape) + 0.1
img2 += np.random.default_rng(1).normal(0, 0.01, img.shape)
```

## 2. Corners: the structure tensor, Harris and Shi-Tomasi

### 2.1 The auto-correlation function

Measure how much a window changes when it is shifted by $(u, v)$, with a weight $w(\mathbf x)$ (a Gaussian of standard deviation $\sigma_i$, the **integration scale**) that selects the window around a point:

$$
E(u, v) = \sum_{\mathbf x} w(\mathbf x)\, \big[ I(x + u, y + v) - I(x, y) \big]^2 .
$$

$E$ is the weighted sum of squared differences between the window and its shifted copy. A good feature has $E$ large for every shift $(u, v) \neq 0$: a sharp bowl. The bottom row of the figure plots $E(u, v)$ computed exactly, by shifting real windows of our synthetic test image.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-autocorrelation.svg" localized="true" caption="Top: three windows of the synthetic image used throughout this post; the orange circle is the Gaussian window ($\sigma_i = 2$ px, circle radius $3\sigma_i$). Bottom: the auto-correlation $E(u, v)$ for shifts up to $\pm 6$ px (same colour scale in all three panels), with the quadratic approximation $[u\ v]\,M\,[u\ v]^\top$ as white dashed contours. Flat: $E \approx 0$ everywhere and both eigenvalues of $M$ vanish. Edge: a valley along the edge direction; $\lambda_1 = 0.0298$, $\lambda_2 = 0.0005$. Corner: a bowl; $\lambda_1 = 0.0245$, $\lambda_2 = 0.0129$." %}

### 2.2 From $E(u, v)$ to the structure tensor

For a small shift, a first-order Taylor expansion gives $I(x + u, y + v) \approx I(x, y) + I_x u + I_y v$. Substituting it:

$$
E(u, v) \approx \sum_{\mathbf x} w(\mathbf x)\, (I_x u + I_y v)^2
= \begin{pmatrix} u & v \end{pmatrix}
\underbrace{\sum_{\mathbf x} w(\mathbf x) \begin{pmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{pmatrix}}_{M}
\begin{pmatrix} u \\ v \end{pmatrix}.
$$

The $2\times 2$ symmetric matrix $M$ is the **structure tensor** (also called the second-moment matrix). Locally, $E$ is a quadratic bowl whose shape is fully described by $M$. Write its eigen-decomposition $M = \lambda_1 \mathbf e_1 \mathbf e_1^\top + \lambda_2 \mathbf e_2 \mathbf e_2^\top$ with $\lambda_1 \geq \lambda_2 \geq 0$ (both are non-negative because $M$ is a weighted sum of outer products $\nabla I\, \nabla I^\top$). Then a shift of length 1 along $\mathbf e_i$ costs $E = \lambda_i$:

- **flat**: $\lambda_1 \approx \lambda_2 \approx 0$;
- **edge**: $\lambda_1 \gg \lambda_2 \approx 0$, with $\mathbf e_1$ across the edge;
- **corner**: both $\lambda_1$ and $\lambda_2$ large.

The level sets $[u\ v] M [u\ v]^\top = c$ are ellipses with semi-axes $\sqrt{c/\lambda_i}$ along $\mathbf e_i$: the dashed contours in the figure above. In practice the derivatives are computed with Gaussian derivative filters of a small **differentiation scale** $\sigma_d$ (here 1 px), and the sum over $\mathbf x$ is a Gaussian blur of the three images $I_x^2$, $I_x I_y$, $I_y^2$ with $\sigma_i$.

**A worked example.** Take a window with uniform weights in which 10 pixels lie on a vertical edge with gradient $(0.5, 0)$, 10 pixels on a horizontal edge with gradient $(0, 0.5)$, and all other gradients are zero (an L-shaped corner). Then $\sum I_x^2 = 10 \cdot 0.25 = 2.5$, $\sum I_y^2 = 2.5$, $\sum I_x I_y = 0$, so $M = \mathrm{diag}(2.5, 2.5)$ and $\lambda_1 = \lambda_2 = 2.5$: a corner. Remove the horizontal edge and $M = \mathrm{diag}(2.5, 0)$: an edge. Rotate the corner by 45°: the gradients become $(0.354, 0.354)$ and $(-0.354, 0.354)$, so $\sum I_x^2 = 20 \cdot 0.125 = 2.5$, $\sum I_y^2 = 2.5$, and the cross terms $+1.25$ and $-1.25$ cancel. $M$ is unchanged, which shows why eigenvalue-based detectors are rotation invariant.

### 2.3 Harris and Shi-Tomasi scores

Harris and Stephens (1988) avoided computing the eigenvalues explicitly with the response

$$
R = \det M - k\, (\operatorname{tr} M)^2 = \lambda_1 \lambda_2 - k\, (\lambda_1 + \lambda_2)^2, \qquad k \in [0.04, 0.06].
$$

$R$ is large and positive at corners, negative at edges (where $\lambda_1\lambda_2 \approx 0$) and small in flat regions. In the worked example, the corner gives $R = 6.25 - 0.05 \cdot 25 = 5.0$ and the edge $R = 0 - 0.05 \cdot 6.25 = -0.31$. Where exactly is the border between the two? Write $\lambda_2 = c\,\lambda_1$; then $R = \lambda_1^2 \,[\,c - k (1 + c)^2\,]$, which is positive exactly when $k c^2 - (1 - 2k)\, c + k < 0$, that is, when

$$
\frac{\lambda_2}{\lambda_1} > c^\ast(k) = \frac{1 - 2k - \sqrt{1 - 4k}}{2k}, \qquad c^\ast(0.05) = 0.0557 .
$$

So with $k = 0.05$ Harris calls a point corner-like as soon as the weaker direction has more than about 5.6% of the strength of the stronger one; $k$ is a knob on that ratio. Shi and Tomasi (1994) proposed the more direct score $\min(\lambda_1, \lambda_2) = \lambda_2$, which they derived from the conditioning of the tracking equations of section 8: a point is good to track when the smaller eigenvalue is large. Both are followed by **non-maximum suppression** (keep a pixel only if its score is the largest in a $(2r+1)^2$ neighbourhood) and a threshold.

```python
def structure_tensor(img, sigma_d=1.0, sigma_i=2.0):
    """Gaussian-derivative gradients, then Gaussian-weighted sums of their products."""
    Ix = ndi.gaussian_filter(img, sigma_d, order=(0, 1))   # d/dx (axis 1 = columns)
    Iy = ndi.gaussian_filter(img, sigma_d, order=(1, 0))   # d/dy (axis 0 = rows)
    Sxx = ndi.gaussian_filter(Ix * Ix, sigma_i)
    Sxy = ndi.gaussian_filter(Ix * Iy, sigma_i)
    Syy = ndi.gaussian_filter(Iy * Iy, sigma_i)
    return Sxx, Sxy, Syy


def harris(img, k=0.05, **kw):
    Sxx, Sxy, Syy = structure_tensor(img, **kw)
    det, tr = Sxx * Syy - Sxy ** 2, Sxx + Syy
    R = det - k * tr ** 2                                  # Harris-Stephens response
    lam_min = tr / 2 - np.sqrt((Sxx - Syy) ** 2 / 4 + Sxy ** 2)   # Shi-Tomasi score
    return R, lam_min


def nms_peaks(score, radius=4, rel_thresh=0.01, max_n=None):
    """Local maxima in a (2r+1)^2 window above rel_thresh * max, strongest first, as (x, y)."""
    peak = (score == ndi.maximum_filter(score, size=2 * radius + 1)) & (score > rel_thresh * score.max())
    ys, xs = np.nonzero(peak)
    order = np.argsort(-score[ys, xs])
    return np.stack([xs, ys], 1)[order][:max_n]


R, lam_min = harris(img)
corners = nms_peaks(R, radius=4, rel_thresh=0.01)
print("Harris corners:", len(corners), " strongest at (x, y) =", corners[0])
print("R > 0 (corner-like) pixels: %.1f%%   R < 0 (edge-like): %.1f%%"
      % (100 * np.mean(R > 1e-6), 100 * np.mean(R < -1e-6)))
```

```text
Harris corners: 121  strongest at (x, y) = [257 192]
R > 0 (corner-like) pixels: 7.9%   R < 0 (edge-like): 7.3%
```

The figure shows the detections and, at the bottom, every pixel of the image as a point in the $(\lambda_1, \lambda_2)$ plane. Edges form the long arm along the $\lambda_1$ axis, corners the cloud above the line $R = 0$.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-harris.svg" localized="true" caption="Top left: the 121 Harris corners (red crosses; $k = 0.05$, NMS radius 4 px, threshold $0.01\,R_{\max}$) and 145 Shi-Tomasi corners (cyan circles; threshold $0.05$ of the largest $\lambda_2$) of the synthetic image. Top right: the Harris response, red where $R > 0$ (corners), blue where $R < 0$ (edges); the shape outlines are blue and their corners red. Bottom: 6000 random pixels in the $(\lambda_1, \lambda_2)$ plane. The black line $\lambda_2 = 0.0557\,\lambda_1$ is $R = 0$, the dashed red curve is the detection threshold, the dotted cyan line is the Shi-Tomasi threshold." %}

Harris corners are invariant to rotation and to adding a constant brightness, but not to **scale**: a corner seen from far away fits inside the window, while the same corner seen close up looks like a gently curved edge. Section 3 fixes this. A few practical refinements: sub-pixel accuracy from a quadratic fit of the score around the maximum (or OpenCV's `cornerSubPix`, which solves for the point where the gradients of the window are orthogonal to the vectors pointing to it); adaptive non-maximal suppression to spread corners evenly over the image (important for SLAM front ends); and a minimum distance between corners, as in OpenCV's `goodFeaturesToTrack`, which implements Shi-Tomasi.

The interactive widget below lets you feel the structure tensor. Drag the window over corners, edges and flat areas; the middle plot shows the gradients $(I_x, I_y)$ inside the window, and the ellipse is the matrix $M$. Its right-hand plot belongs to section 8 and will make sense later.

{% include widget.liquid name="3d-vision-structure-tensor" height="470" caption="Structure tensor and Lucas-Kanade. Drag the orange window over the image (synthetic, 160 by 100 px). Middle: the gradient vectors of the window's pixels (lighter: their negatives, since $M$ cannot tell $\nabla I$ from $-\nabla I$) and the ellipse of $M$, with semi-axes proportional to $\sqrt{\lambda_1}$ and $\sqrt{\lambda_2}$; a corner gives a fat ellipse, an edge a needle, a flat area nothing. The label follows the sign of $R$; 'Harris map' colours the whole image by $R$. Right: each pixel's flow constraint $I_x u + I_y v + I_t = 0$ as a line in the $(u, v)$ plane for a second image shifted by $(u, v)$ (sliders); red dot: true motion, green circle: Lucas-Kanade estimate. At a corner the lines cross at one point; on an edge they are parallel and only the normal flow is determined." %}

## 3. Scale space and SIFT

### 3.1 Scale space

To detect the same structure at whatever size it appears, we look at the image at every scale. The **Gaussian scale space** of an image is the family of blurred images

$$
L(\mathbf x; \sigma) = (G_\sigma \ast I)(\mathbf x), \qquad G_\sigma(\mathbf x) = \frac{1}{2\pi\sigma^2} e^{-\lVert\mathbf x\rVert^2 / 2\sigma^2}.
$$

Blurring removes detail smaller than about $\sigma$, and the Gaussian is the unique kernel that never creates new structure as $\sigma$ grows (Koenderink 1984, Lindeberg 1994). $L$ satisfies the heat (diffusion) equation, which we will need in a moment:

$$
\frac{\partial L}{\partial \sigma} = \sigma\, \nabla^2 L, \qquad \nabla^2 = \frac{\partial^2}{\partial x^2} + \frac{\partial^2}{\partial y^2}.
$$

### 3.2 Automatic scale selection

If the image is magnified by a factor $a$, so that $I'(a\mathbf x) = I(\mathbf x)$, then $L'(a\mathbf x; a\sigma) = L(\mathbf x; \sigma)$: the same structure appears at the scale $a\sigma$. Each spatial derivative, however, gains a factor $1/a$. Derivatives multiplied by $\sigma$, the **scale-normalized derivatives** $\sigma \partial_x$, are therefore unchanged. Lindeberg (1998) turned this into a rule: a structure's **characteristic scale** is the $\sigma$ at which a scale-normalized differential response is extremal over scale. For blobs the natural response is the scale-normalized Laplacian $\sigma^2 \nabla^2 L$.

**Worked derivation for a Gaussian blob.** Let the image be a bright blob $I(\mathbf x) = e^{-\lVert\mathbf x\rVert^2/2s^2}$ of size $s$. Convolving two Gaussians adds variances, so $L(\mathbf x; \sigma) = \frac{s^2}{s^2 + \sigma^2}\, e^{-\lVert\mathbf x\rVert^2 / 2(s^2 + \sigma^2)}$. The Laplacian of $A e^{-r^2/2v}$ at the centre is $-2A/v$, so at the blob centre

$$
\sigma^2 \nabla^2 L(\mathbf 0; \sigma) = -\frac{2\,\sigma^2 s^2}{(s^2 + \sigma^2)^2}.
$$

Setting the derivative with respect to $t = \sigma^2$ to zero gives $(s^2 + t) - 2t = 0$, so the magnitude peaks at $\sigma = s$, with value $1/2$: the detector reports exactly the blob's own size, whatever the zoom. For a disk of radius $r$ the same experiment peaks at $\sigma = r/\sqrt 2$. Without the factor $\sigma^2$ the response would simply decay with $\sigma$ and select the finest scale every time.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-scale-selection.svg" localized="true" caption="Left: the scale-normalized Laplacian $-\sigma^2\nabla^2 L$ at the centre of bright disks of radius $r = 3, 6, 12$, computed with `scipy.ndimage.gaussian_laplace` on a 0.1 grid of $\sigma$. The peaks lie at $\sigma = 2.2, 4.2, 8.4$, within the grid step of $r/\sqrt 2 = 2.12, 4.24, 8.49$ (dotted): doubling the disk doubles the selected scale. Right: a Gaussian blob of size $s = 6$. The numerical response (purple) matches the closed form $2\sigma^2 s^2/(s^2+\sigma^2)^2$ (black) and peaks at $\sigma = 6.0$ with value $1/2$. The difference of Gaussians divided by $k - 1$ (orange, $k = 2^{1/3}$) has the same shape, peaks at $\sigma = 5.3 \approx s/\sqrt k$ because it compares $\sigma$ with $k\sigma$, and reaches 0.443." %}

### 3.3 Difference of Gaussians

Computing $\nabla^2 L$ at many scales is expensive. Lowe's SIFT (2004) uses a cheap approximation that falls out of the heat equation. A finite difference in $\sigma$ gives

$$
L(\mathbf x; k\sigma) - L(\mathbf x; \sigma) \approx (k\sigma - \sigma)\, \frac{\partial L}{\partial \sigma} = (k - 1)\, \sigma^2 \nabla^2 L .
$$

The **difference of Gaussians** (DoG) of two neighbouring scales is already the scale-normalized Laplacian, up to the constant factor $k - 1$, which does not move the extrema. The scale space is organized in **octaves**: within an octave the blur grows geometrically as $\sigma_0 2^{s/S}$ ($S = 3$ intervals and $\sigma_0 = 1.6$ in Lowe's paper); after one doubling of $\sigma$ the image is subsampled by two and the next octave starts. Each octave needs $S + 3$ Gaussian images to produce $S + 2$ DoG images, so that extrema can be searched in $S$ levels, each with a neighbour above and below.

A keypoint is a pixel whose DoG value is larger (or smaller) than all 26 neighbours in the $3 \times 3 \times 3$ block of space and scale. Each candidate is then refined and filtered:

1. **Sub-pixel and sub-scale localization.** Fit a quadratic to $D$ around the sample, $D(\mathbf z + \boldsymbol\delta) \approx D + \mathbf g^\top \boldsymbol\delta + \frac12 \boldsymbol\delta^\top H \boldsymbol\delta$ with $\mathbf z = (x, y, \sigma)$, gradient $\mathbf g$ and Hessian $H$ from finite differences. The extremum is at $\hat{\boldsymbol\delta} = -H^{-1}\mathbf g$; if any component exceeds 0.5 the extremum belongs to a neighbouring sample.
2. **Low contrast.** Reject if $\lvert D(\hat{\mathbf z})\rvert = \lvert D + \frac12 \mathbf g^\top \hat{\boldsymbol\delta} \rvert$ is below a threshold (Lowe used 0.03 for images in $[0, 1]$).
3. **Edges.** The DoG also responds strongly along edges, where the position along the edge is undefined. With the $2 \times 2$ spatial Hessian $H_s$ of $D$ and eigenvalues $\alpha = r\beta$, the ratio $(\operatorname{tr} H_s)^2/\det H_s = (r + 1)^2/r$ grows with $r$. Keep the point only if $(\operatorname{tr} H_s)^2 / \det H_s < (r_{\max} + 1)^2 / r_{\max}$; Lowe used $r_{\max} = 10$, a bound of 12.1. This is the Harris idea again, applied to the Hessian instead of the structure tensor.

```python
def build_dog(img, n_oct=4, S=3, sigma0=1.6, sigma_in=0.5):
    """Gaussian and difference-of-Gaussian pyramids: octave o has S+3 levels sigma0 * 2^(s/S)."""
    gauss, dogs = [], []
    base = ndi.gaussian_filter(img, np.sqrt(sigma0 ** 2 - sigma_in ** 2))
    for o in range(n_oct):
        sig = sigma0 * 2.0 ** (np.arange(S + 3) / S)
        L = np.stack([base] + [ndi.gaussian_filter(base, np.sqrt(s ** 2 - sigma0 ** 2)) for s in sig[1:]])
        gauss.append(L)
        dogs.append(L[1:] - L[:-1])        # S+2 DoG levels
        base = L[S][::2, ::2]              # blur 2*sigma0 here = sigma0 at half resolution
    return gauss, dogs


def detect_dog(dogs, S=3, sigma0=1.6, contrast=0.015, r_edge=10.0):
    """Scale-space extrema of the DoG, refined to sub-pixel, with low-contrast and edge rejection.
    Returns rows (x, y, sigma) in input-image pixels plus (octave, level)."""
    kps = []
    for o, D in enumerate(dogs):
        ext = (D == ndi.maximum_filter(D, size=3)) | (D == ndi.minimum_filter(D, size=3))
        ext &= np.abs(D) > 0.5 * contrast
        ext[[0, -1]] = False                                  # need a level above and below
        ext[:, :2] = ext[:, -2:] = False; ext[:, :, :2] = ext[:, :, -2:] = False
        for s, y, x in zip(*np.nonzero(ext)):
            c = D[s, y, x]
            g = 0.5 * np.array([D[s, y, x + 1] - D[s, y, x - 1],
                                D[s, y + 1, x] - D[s, y - 1, x],
                                D[s + 1, y, x] - D[s - 1, y, x]])
            dxx = D[s, y, x + 1] + D[s, y, x - 1] - 2 * c
            dyy = D[s, y + 1, x] + D[s, y - 1, x] - 2 * c
            dss = D[s + 1, y, x] + D[s - 1, y, x] - 2 * c
            dxy = 0.25 * (D[s, y + 1, x + 1] - D[s, y + 1, x - 1] - D[s, y - 1, x + 1] + D[s, y - 1, x - 1])
            dxs = 0.25 * (D[s + 1, y, x + 1] - D[s + 1, y, x - 1] - D[s - 1, y, x + 1] + D[s - 1, y, x - 1])
            dys = 0.25 * (D[s + 1, y + 1, x] - D[s + 1, y - 1, x] - D[s - 1, y + 1, x] + D[s - 1, y - 1, x])
            Hm = np.array([[dxx, dxy, dxs], [dxy, dyy, dys], [dxs, dys, dss]])
            try:
                off = -np.linalg.solve(Hm, g)                  # quadratic fit: x_hat = -H^-1 g
            except np.linalg.LinAlgError:
                continue
            if np.abs(off).max() > 0.5:                        # extremum belongs to a neighbour
                continue
            if abs(c + 0.5 * g @ off) < contrast:              # low contrast
                continue
            tr, det = dxx + dyy, dxx * dyy - dxy ** 2          # 2x2 spatial Hessian
            if det <= 0 or tr ** 2 * r_edge >= (r_edge + 1) ** 2 * det:   # edge-like
                continue
            sigma = sigma0 * 2 ** ((s + off[2]) / S)
            kps.append(((x + off[0]) * 2 ** o, (y + off[1]) * 2 ** o, sigma * 2 ** o, o, s))
    return kps


gauss, dogs = build_dog(img)
kps = detect_dog(dogs)
sig = np.array([k[2] for k in kps])
print("DoG keypoints:", len(kps), "  per octave:", np.bincount([k[3] for k in kps]))
print("sigma range: %.2f .. %.2f px" % (sig.min(), sig.max()))
```

```text
DoG keypoints: 139   per octave: [78 34 25  2]
sigma range: 1.80 .. 19.36 px
```

### 3.4 Orientation and the SIFT descriptor

**Orientation.** Around each keypoint, at its scale, build a 36-bin histogram of gradient directions weighted by gradient magnitude and by a Gaussian of $1.5\sigma$. The highest peak gives the orientation $\theta$; every other peak above 80% of it creates an additional keypoint with that orientation (on our image, the 139 locations become 183 oriented keypoints). Fitting a parabola to the three bins around a peak refines $\theta$ beyond the 10° bin width.

**Descriptor.** Rotate a square window by $\theta$ and scale it with $\sigma$: $4 \times 4$ cells, each $3\sigma$ wide. In each cell, accumulate an 8-bin histogram of gradient orientations (measured relative to $\theta$), weighted by magnitude and by a Gaussian over the whole window. Concatenating gives $4 \times 4 \times 8 = 128$ numbers. Normalize to unit length (invariance to contrast), clip every entry at 0.2 (so that a few large gradients from a non-linear illumination change or a specular highlight cannot dominate), and normalize again. The descriptor is a coarse spatial layout of edge directions, tolerant to small shifts within a cell and to small deformations. Lowe also interpolates every sample trilinearly into neighbouring cells and bins to avoid boundary effects; our compact version uses hard binning.

```python
def orientations(gx, gy, x, y, sigma, nbins=36, peak_ratio=0.8):
    """Dominant gradient directions (radians) in a Gaussian window of std 1.5*sigma around (x, y)."""
    r = int(round(4.5 * sigma))
    xi, yi = int(round(x)), int(round(y))
    y0, y1 = max(yi - r, 0), min(yi + r + 1, gx.shape[0])
    x0, x1 = max(xi - r, 0), min(xi + r + 1, gx.shape[1])
    yy, xx = np.mgrid[y0:y1, x0:x1]
    w = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * (1.5 * sigma) ** 2))
    mag = np.hypot(gx[y0:y1, x0:x1], gy[y0:y1, x0:x1])
    ang = np.arctan2(gy[y0:y1, x0:x1], gx[y0:y1, x0:x1]) % (2 * np.pi)
    hist = np.bincount((ang / (2 * np.pi) * nbins).astype(int).ravel() % nbins,
                       weights=(w * mag).ravel(), minlength=nbins)
    hist = (np.roll(hist, 1) + 2 * hist + np.roll(hist, -1)) / 4          # smooth once
    out = []
    for i in range(nbins):
        l, c, rr = hist[i - 1], hist[i], hist[(i + 1) % nbins]
        if c > l and c > rr and c >= peak_ratio * hist.max():
            di = 0.5 * (l - rr) / (l - 2 * c + rr)                        # parabolic peak
            out.append(((i + 0.5 + di) / nbins * 2 * np.pi) % (2 * np.pi))
    return out


def sift_descriptor(gx, gy, x, y, sigma, theta, d=4, nb=8):
    """d x d cells x nb orientation bins over a window of d cells, each 3*sigma wide, rotated by theta."""
    n = 4 * d                                                # 16 x 16 samples
    u = ((np.arange(n) + 0.5) / n - 0.5) * d                 # sample coordinates in cell units
    U, V = np.meshgrid(u, u)
    c, s = np.cos(theta), np.sin(theta)
    X = x + 3 * sigma * (c * U - s * V)
    Y = y + 3 * sigma * (s * U + c * V)
    GX = ndi.map_coordinates(gx, [Y, X], order=1, mode="nearest")
    GY = ndi.map_coordinates(gy, [Y, X], order=1, mode="nearest")
    gu, gv = c * GX + s * GY, -s * GX + c * GY               # gradients in the keypoint frame
    mag = np.hypot(gu, gv) * np.exp(-(U ** 2 + V ** 2) / (2 * (d / 2) ** 2))
    ob = (np.arctan2(gv, gu) % (2 * np.pi) / (2 * np.pi) * nb).astype(int) % nb
    ci = np.clip((U + d / 2).astype(int), 0, d - 1)
    cj = np.clip((V + d / 2).astype(int), 0, d - 1)
    desc = np.zeros((d, d, nb))
    np.add.at(desc, (cj, ci, ob), mag)
    desc = desc.ravel() / (np.linalg.norm(desc) + 1e-12)
    desc = np.minimum(desc, 0.2)                              # damp large gradients (illumination)
    return desc / (np.linalg.norm(desc) + 1e-12)


def sift(img, n_oct=4, S=3):
    """Mini-SIFT: returns keypoints (x, y, sigma, theta) and 128-D descriptors."""
    gauss, dogs = build_dog(img, n_oct, S)
    grads = [[np.gradient(L) for L in G] for G in gauss]     # (d/dy, d/dx) of every level
    K, Dsc = [], []
    for x, y, sigma, o, s in detect_dog(dogs, S):
        gy, gx = grads[o][s]
        xo, yo, so = x / 2 ** o, y / 2 ** o, sigma / 2 ** o  # octave pixel units
        for th in orientations(gx, gy, xo, yo, so):
            K.append((x, y, sigma, th))
            Dsc.append(sift_descriptor(gx, gy, xo, yo, so, th))
    return np.array(K), np.array(Dsc)


kp1, d1 = sift(img)
print("keypoints with orientation:", len(kp1), " descriptor shape:", d1.shape)
```

```text
keypoints with orientation: 183  descriptor shape: (183, 128)
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-dog-sift.svg" caption="Left: the 183 oriented DoG keypoints of `sift(img)`; each circle has radius $\sqrt2\,\sigma$ (the radius of a disk whose characteristic scale is $\sigma$) and the red tick shows $\theta$. Small keypoints sit on corners and thin structures, large ones on whole shapes. Middle: one keypoint ($\sigma = 3.89$ px, $\theta = 12°$) with its rotated $4 \times 4$ grid of $3\sigma$-wide cells (orange); in each cell the 8 red spokes are the cell's orientation histogram, drawn in the image frame. Right: the resulting 128-D vector, unit length with entries clipped at 0.2 before the final normalization (largest entry 0.28, 61 non-zero)." %}

Variants worth knowing: **RootSIFT** (Arandjelović and Zisserman, CVPR 2012) takes the element-wise square root of the L1-normalized SIFT vector, so that Euclidean distance becomes the Hellinger kernel, a free and consistent improvement; **SURF** (Bay et al., ECCV 2006) approximates the Hessian with box filters on integral images; **KAZE/AKAZE** use non-linear diffusion instead of Gaussian blur so that edges are kept sharp across scales. The SIFT patent expired in 2020, and SIFT has been in OpenCV's main module since version 4.4. SIFT (computed on the GPU) is still COLMAP's default feature.

## 4. Binary features: FAST, BRIEF and ORB

SIFT is accurate but slow for real-time systems on small processors. ORB (Rublee et al., ICCV 2011), the front end of ORB-SLAM, combines two fast ingredients and repairs their weaknesses.

**FAST** (Rosten and Drummond, ECCV 2006) tests the 16 pixels on a circle of radius 3 around a candidate $\mathbf p$. The point is a corner if there is a contiguous arc of at least $n$ circle pixels that are all brighter than $I(\mathbf p) + t$ or all darker than $I(\mathbf p) - t$ ($n = 9$ in FAST-9, the common choice). Most pixels can be rejected after looking at 2 to 4 of the 16; Rosten and Drummond even learned a decision tree that orders the tests optimally. FAST has no orientation and no scale, and it fires along edges, so ORB ranks FAST points by the Harris response, keeps the best, and runs the detector on an image pyramid (OpenCV defaults: 8 levels, factor 1.2).

**BRIEF** (Calonder et al., ECCV 2010) describes a smoothed patch $S \times S$ by $n_b = 256$ binary tests: bit $k$ is 1 when $I(\mathbf p + \mathbf a_k) < I(\mathbf p + \mathbf b_k)$, for a fixed random pattern of offset pairs, drawn i.i.d. from $\mathcal N(0, S^2/25)$ in the variant that worked best. Matching then uses the **Hamming distance**, the number of differing bits, which is an XOR followed by a popcount: one or two machine instructions per 64 bits, far cheaper than a 128-D float distance. A 256-bit descriptor takes 32 bytes, against 512 for a float SIFT descriptor.

BRIEF is not rotation invariant: rotate the image and every test compares different pixels. ORB measures an orientation with the **intensity centroid**: with the patch moments $m_{pq} = \sum x^p y^q I(x, y)$ over a disk around the keypoint, the angle

$$
\theta = \operatorname{atan2}(m_{01}, m_{10})
$$

points from the keypoint to the brightness-weighted centre of the patch. The test pattern is rotated by $\theta$ before sampling (**steered BRIEF**). ORB's paper noticed a side effect: once the patterns are steered, the bits become more correlated and their mean drifts away from 0.5, which makes descriptors less discriminative. ORB therefore replaces the random pattern by **rBRIEF**, 256 test pairs selected greedily on training patches to have high variance and low correlation.

```python
def brief_pattern(n_bits=256, S=31, seed=0):
    """BRIEF test pairs (a_k, b_k), offsets drawn i.i.d. from N(0, S^2/25) inside an S x S patch."""
    rng = np.random.default_rng(seed)
    return np.clip(np.round(rng.normal(0, S / 5, (n_bits, 4))), -(S // 2), S // 2)


def ic_angle(img, x, y, r=15):
    """ORB orientation: direction from the keypoint to the intensity centroid of a disk."""
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    disk = xx ** 2 + yy ** 2 <= r * r
    I = ndi.map_coordinates(img, [y + yy[disk], x + xx[disk]], order=1)
    return np.arctan2(I @ yy[disk], I @ xx[disk])          # atan2(m01, m10)


def brief(img, pts, pattern, steer=False):
    """Bit k = [I(p + a_k) < I(p + b_k)] on a smoothed image, packed into bytes (256 bits = 32 B)."""
    sm = ndi.gaussian_filter(img, 2.0)
    out = []
    for x, y in pts:
        a, b = pattern[:, :2], pattern[:, 2:]
        if steer:                                           # rotate the pattern (steered BRIEF)
            c, s = np.cos(ic_angle(img, x, y)), np.sin(ic_angle(img, x, y))
            Rm = np.array([[c, -s], [s, c]])
            a, b = a @ Rm.T, b @ Rm.T
        Ia = ndi.map_coordinates(sm, [y + a[:, 1], x + a[:, 0]], order=1)
        Ib = ndi.map_coordinates(sm, [y + b[:, 1], x + b[:, 0]], order=1)
        out.append(np.packbits(Ia < Ib))
    return np.array(out)


def hamming(B1, B2):
    """All pairwise Hamming distances: XOR then popcount."""
    return np.unpackbits(B1[:, None] ^ B2[None], axis=2).sum(2)


# Harris corners of image 1 and their true positions in image 2 (25 deg rotation)
pts1 = nms_peaks(harris(img)[0], radius=6, rel_thresh=0.02).astype(float)
pts2 = apply_h(H_true, pts1)
ok = np.all((pts2 > 20) & (pts2 < [300, 220]), axis=1) & np.all((pts1 > 20) & (pts1 < [300, 220]), axis=1)
pts1, pts2 = pts1[ok], pts2[ok]
pat = brief_pattern()
for steer in (False, True):
    Hd = hamming(brief(img, pts1, pat, steer), brief(img2, pts2, pat, steer))
    same, diff = np.diag(Hd), Hd[~np.eye(len(Hd), dtype=bool)]
    correct = np.mean(np.argmin(Hd, axis=1) == np.arange(len(Hd)))
    print("steered=%-5s  Hamming true pairs %.0f, other pairs %.0f, NN correct %.0f%% (%d points)"
          % (steer, np.median(same), np.median(diff), 100 * correct, len(Hd)))
```

```text
steered=False  Hamming true pairs 45, other pairs 129, NN correct 48% (60 points)
steered=True   Hamming true pairs 23, other pairs 77, NN correct 65% (60 points)
```

The output shows both effects at once. Under the 25° rotation and 0.8 scale change between our two images, steering halves the median Hamming distance of true correspondences (45 to 23 of 256 bits) and raises nearest-neighbour accuracy from 48% to 65%. But the median distance between unrelated points also falls, from 129 (almost exactly the 128 expected for independent random bits) to 77: steered bits are no longer independent, exactly what motivated rBRIEF. The remaining errors come mostly from the scale change, which this single-scale snippet ignores and ORB handles with its pyramid.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-fast-brief.svg" localized="true" caption="Left: the FAST segment test at a corner of the synthetic image (centre pixel green, $t = 0.1$). The 16 circle pixels are blue when darker than $I_p - t$, red when brighter than $I_p + t$ and yellow otherwise; 13 contiguous blue pixels make this a FAST-9 corner (all 37 of the 40 strongest Harris corners that lie inside the image pass the test). Middle: 48 of the 256 BRIEF test pairs on a $31 \times 31$ patch, steered by the intensity-centroid angle $\theta = 45°$ (orange arrow). Right: Hamming distances between true correspondences (green) and between unrelated points (red) for 60 corners under a 25° rotation; dashed: plain BRIEF, solid: steered BRIEF." %}

## 5. Matching descriptors

### 5.1 Nearest neighbours and the ratio test

Given descriptors $\\{\mathbf d_i\\}$ in image 1 and $\\{\mathbf d'_j\\}$ in image 2, the obvious match for $i$ is its **nearest neighbour** $j^\ast = \arg\min_j \lVert \mathbf d_i - \mathbf d'_j \rVert$. The trouble is that every keypoint has a nearest neighbour, including the many that are not visible in image 2 at all, or that lie on repeated texture. An absolute distance threshold works poorly because some descriptors are much more distinctive than others.

Lowe's **ratio test** compares the best distance $d_1$ with the second-best $d_2$ and keeps the match only if

$$
\frac{d_1}{d_2} < \tau, \qquad \tau \approx 0.7 \text{ to } 0.8 .
$$

The intuition: a correct match must be clearly better than the best of the wrong candidates, and $d_2$ is an estimate of how close a wrong candidate can get in this region of descriptor space. For an ambiguous point on a repeated pattern $d_1 \approx d_2$ and the match is rejected even if it happens to be correct. On his data Lowe reported that $\tau = 0.8$ removed 90% of the false matches while discarding fewer than 5% of the correct ones.

Two further filters are standard: the **mutual nearest-neighbour** (cross) check, which keeps $(i, j)$ only if $i$ is also the nearest neighbour of $j$ in the reverse direction, and enforcing one-to-one matches.

```python
def match_descriptors(d1, d2, ratio=0.8, mutual=True):
    """Nearest neighbour in L2 with Lowe's ratio test and an optional mutual (cross) check."""
    D = np.sqrt(np.maximum((d1 ** 2).sum(1)[:, None] + (d2 ** 2).sum(1)[None] - 2 * d1 @ d2.T, 0))
    nn = np.argsort(D, axis=1)[:, :2]
    i = np.arange(len(d1))
    r = D[i, nn[:, 0]] / D[i, nn[:, 1]]                   # distance ratio d1 / d2
    keep = r < ratio
    if mutual:
        keep &= np.argmin(D, axis=0)[nn[:, 0]] == i       # j's nearest neighbour is i, too
    return np.stack([i[keep], nn[keep, 0]], 1), r


kp2, d2 = sift(img2)
m, ratio = match_descriptors(d1, d2)
err = np.linalg.norm(apply_h(H_true, kp1[m[:, 0], :2]) - kp2[m[:, 1], :2], axis=1)
print("keypoints: %d / %d   tentative matches: %d   correct (< 3 px): %d"
      % (len(kp1), len(kp2), len(m), (err < 3).sum()))
```

```text
keypoints: 183 / 146   tentative matches: 85   correct (< 3 px): 83
```

A match counts as correct if it lands within 3 px of its true position `apply_h(H_true, x)`. Plain nearest neighbours give 183 matches of which 91 are correct (50%); ratio test plus mutual check keep 85 matches, 83 of them correct (98%). To see the trade-off more reliably, the figure pools eight random scenes.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-matching.svg" localized="true" caption="Top: all 183 nearest-neighbour matches between the synthetic image and its transformed copy, coloured by the RANSAC result of section 6 (green: inliers to the estimated homography, red: outliers); the orange quadrilateral is the border of image 1 mapped by the estimated $H$. Bottom, pooled over 8 scenes (1382 nearest-neighbour matches, 609 correct): left, the distribution of $d_1/d_2$ for correct and wrong matches; right, precision and recall (fraction of the correct matches kept) against the threshold $\tau$. At $\tau = 0.8$ precision is 94.3% and recall 92.1%; adding the mutual check raises precision to 97.2% at 90.8% recall; $\tau = 0.7$ gives 98.9% and 87.5%." %}

### 5.2 Scaling up

Brute-force matching costs $O(N_1 N_2 D)$: for two images with 8000 SIFT features, about $8 \times 10^9$ multiply-adds, which a GPU does in milliseconds but a CPU does not. For CPU or for large collections, **approximate nearest-neighbour** search is used: randomized kd-trees and hierarchical k-means trees (the FLANN library of Muja and Lowe), product quantization or graph-based indices (as in the faiss library). In Structure-from-Motion the larger problem is which **image pairs** to match at all: exhaustive matching is quadratic in the number of images, so COLMAP offers sequential matching for video and vocabulary-tree retrieval for unordered collections, where images are first compared through bags of quantized visual words.

## 6. Robust estimation: RANSAC and its descendants

### 6.1 Why least squares fails

Even after the ratio test, some matches are wrong, and for the geometry of the next posts we must fit a model (a homography, a fundamental or essential matrix, a camera pose) to correspondences that contain outliers. Least squares minimizes $\sum_i e_i^2$, so a single match that is 300 px off contributes as much as 10,000 matches that are 3 px off: least squares has a **breakdown point** of zero, meaning that one arbitrarily bad point can move the estimate arbitrarily far. Fitting a homography with the normalized DLT to all 183 nearest-neighbour matches (half of them wrong) maps the image corners up to 381 px away from where they belong.

### 6.2 RANSAC

**RANSAC** (RANdom SAmple Consensus; Fischler and Bolles, 1981) turns the problem around: instead of fitting to all data and hoping, fit to the smallest possible random subset and check how many points agree.

1. Draw a **minimal sample** of $s$ correspondences, the fewest that determine the model: $s = 2$ for a line, 4 for a homography, 5 for an essential matrix, 7 or 8 for a fundamental matrix, 3 for a camera pose from 2D-3D matches (P3P).
2. Fit the **hypothesis** to the sample.
3. Compute the residual $e_i$ of every correspondence and the **consensus set** $\mathcal I = \\{ i : e_i < t \\}$.
4. Keep the hypothesis with the largest consensus set; repeat $N$ times.
5. Re-estimate the model from all inliers of the best hypothesis with least squares (and, for geometric models, a non-linear refinement).

The threshold $t$ comes from the noise level. If the residuals of inliers are Gaussian with standard deviation $\sigma$ per coordinate, $e^2/\sigma^2$ follows a $\chi^2$ distribution whose degrees of freedom are the codimension of the model, and a threshold that accepts 95% of the inliers is $t^2 = 3.84\,\sigma^2$ for a point-to-line distance (line, fundamental matrix with the Sampson distance) and $t^2 = 5.99\,\sigma^2$ for a 2D transfer error (homography), as tabulated by Hartley and Zisserman.

### 6.3 How many samples?

Let $w$ be the fraction of inliers and $\varepsilon = 1 - w$ the outlier ratio. If samples are drawn independently, a sample of $s$ points is outlier-free with probability $w^s$, so all of $N$ samples are contaminated with probability $(1 - w^s)^N$. Requiring this to be at most $1 - p$, where $p$ is the desired confidence, gives

$$
N = \left\lceil \frac{\log(1 - p)}{\log(1 - w^s)} \right\rceil .
$$

**Worked example**: a homography ($s = 4$) with half the matches wrong ($w = 0.5$) and $p = 0.99$: $w^4 = 0.0625$ and

$$
N = \left\lceil \frac{\log 0.01}{\log 0.9375} \right\rceil = \left\lceil \frac{-4.605}{-0.0645} \right\rceil = \lceil 71.4 \rceil = 72 .
$$

Because $w^s$ shrinks exponentially in $s$, the minimal sample size matters enormously:

```python
def ransac_iterations(eps, s, p=0.99):
    """Samples needed so that, with probability p, at least one of size s is outlier-free."""
    return int(np.ceil(np.log(1 - p) / np.log(1 - (1 - eps) ** s)))


print("outlier ratio:   " + "".join("%8.0f%%" % (100 * e) for e in (0.1, 0.3, 0.5, 0.7, 0.8)))
for s, name in [(2, "line"), (3, "P3P"), (4, "homography"), (5, "essential"), (7, "F 7-pt"), (8, "F 8-pt")]:
    print("s=%d %-11s" % (s, name) + "".join("%9d" % ransac_iterations(e, s) for e in (0.1, 0.3, 0.5, 0.7, 0.8)))
```

```text
outlier ratio:         10%      30%      50%      70%      80%
s=2 line               3        7       17       49      113
s=3 P3P                4       11       35      169      574
s=4 homography         5       17       72      567     2876
s=5 essential          6       26      146     1893    14389
s=7 F 7-pt             8       54      588    21055   359777
s=8 F 8-pt             9       78     1177    70188  1798893
```

At 70% outliers, the 5-point solver for the essential matrix needs 1893 samples where the 8-point algorithm needs 70188. This is why so much research went into **minimal solvers** (five-point, P3P, and many more), and why a good prefilter such as the ratio test pays off twice: it lowers $\varepsilon$, and $N$ falls exponentially.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-ransac-iterations.svg" localized="true" caption="The number of samples $N$ that RANSAC needs to draw at least one outlier-free minimal sample with probability $p = 0.99$, against the outlier ratio $\varepsilon$, for minimal sample sizes $s = 2$ (line) to $s = 8$ (fundamental matrix, 8-point). The purple dot is the worked example ($s = 4$, $\varepsilon = 0.5$, $N = 72$). The vertical axis is logarithmic: every extra point in the minimal sample multiplies $N$ by roughly $1/w$." %}

The inlier ratio is not known in advance, so implementations use the **adaptive** rule: start with $N = \infty$ (or a cap), and every time a better hypothesis is found, set $w$ to its inlier ratio and recompute $N$. The best model only improves, so $N$ only decreases. Here is RANSAC for a homography on the 183 nearest-neighbour matches, half of which are wrong:

```python
def normalize_pts(p):
    """Hartley normalization: centroid to the origin, mean distance sqrt(2)."""
    c = p.mean(0)
    s = np.sqrt(2) / np.mean(np.linalg.norm(p - c, axis=1))
    return (p - c) * s, np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])


def homography_dlt(p1, p2):
    """Normalized DLT (post 02): H with p2 ~ H p1 from n >= 4 correspondences."""
    q1, T1 = normalize_pts(p1)
    q2, T2 = normalize_pts(p2)
    A = []
    for (x, y), (u, v) in zip(q1, q2):
        A.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        A.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    H = np.linalg.svd(np.array(A))[2][-1].reshape(3, 3)
    H = np.linalg.inv(T2) @ H @ T1
    return H / H[2, 2]


def ransac_homography(p1, p2, thresh=3.0, conf=0.999, max_iter=10000, seed=0):
    """RANSAC with the adaptive stopping rule N = log(1-p) / log(1-w^4)."""
    rng = np.random.default_rng(seed)
    best, N, it = np.zeros(len(p1), bool), max_iter, 0
    while it < N:
        idx = rng.choice(len(p1), 4, replace=False)          # minimal sample
        H = homography_dlt(p1[idx], p2[idx])                 # hypothesis
        inl = np.linalg.norm(apply_h(H, p1) - p2, axis=1) < thresh   # consensus set
        if inl.sum() > best.sum():
            best = inl
            w = inl.mean()                                   # current inlier-ratio estimate
            N = min(max_iter, np.log(1 - conf) / np.log(max(1 - w ** 4, 1e-12)))
        it += 1
    H = homography_dlt(p1[best], p2[best])                   # refit on all inliers
    return H, np.linalg.norm(apply_h(H, p1) - p2, axis=1) < thresh, it


# plain nearest-neighbour matches (no ratio test): about half of them are wrong
m_nn, _ = match_descriptors(d1, d2, ratio=1.01, mutual=False)
p1, p2 = kp1[m_nn[:, 0], :2], kp2[m_nn[:, 1], :2]
H, inl, iters = ransac_homography(p1, p2)
box = np.array([[0, 0], [319, 0], [319, 239], [0, 239]], float)
print("matches %d, RANSAC inliers %d after %d iterations" % (len(p1), inl.sum(), iters))
print("corner error of H vs ground truth: %.2f px (max)"
      % np.linalg.norm(apply_h(H, box) - apply_h(H_true, box), axis=1).max())
H_ls = homography_dlt(p1, p2)                                # no robustness at all
print("corner error of plain least squares: %.0f px"
      % np.linalg.norm(apply_h(H_ls, box) - apply_h(H_true, box), axis=1).max())
```

```text
matches 183, RANSAC inliers 91 after 120 iterations
corner error of H vs ground truth: 0.40 px (max)
corner error of plain least squares: 381 px
```

The run is worth tracing. The first hypotheses have 5, 6, 9, 14 inliers; sample 13 finds 37 ($N$ drops to 4130), sample 49 finds 82 ($N = 168$) and sample 107 finds 89, which sets $N = 120$ for $p = 0.999$; the loop stops at 120. Re-fitting to those 89 inliers then recovers all 91 correct matches, and the final homography maps the image corners to within 0.40 px of the ground truth. The figure below shows the same process on a line, where every hypothesis can be drawn.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-ransac-steps.svg" caption="RANSAC for a line on 60 points, 36 of them inliers (noise $\sigma = 1$) and 24 uniform outliers, threshold $t = 2.5$ (purple band). Red circles: the minimal sample; green: points within $t$ of the hypothesis. Sample 1 (5 inliers) and sample 2 (4 inliers) contain an outlier; sample 9 is outlier-free and collects 35 inliers, which no later sample beats. Bottom right: the total-least-squares refit on those inliers (purple, error 0.52 $\sigma$ against the true line, dotted) and least squares on all points (dashed red, error 9.5 $\sigma$)." %}

The widget lets you run RANSAC yourself. Raise the outlier ratio and watch the needed $N$ explode, especially for the circle ($s = 3$); lower the threshold below the noise and watch good hypotheses lose their inliers.

{% include widget.liquid name="3d-vision-ransac" height="560" caption="RANSAC playground. 100 points from a line or a circle with noise $\sigma$ plus outliers at ratio $\varepsilon$. 'step' draws one minimal sample (red circles) and shows its hypothesis with the band $\pm t$ (purple); 'run' continues until $k \geq N$, where $N = \lceil\log(1-p)/\log(1-\hat w^s)\rceil$ uses the inlier ratio $\hat w$ of the best model so far ($p = 0.99$). Green: refit of the best model and its inliers; dashed red: least squares on all points. The chart shows the inlier count of every hypothesis (dots), the best so far (green), the true inlier count (dashed), the adaptive $N$ (purple) and the $N$ for the true $\varepsilon$ (grey). Tap the plot to add an outlier, drag a point to move it, switch to MSAC or enable LO." %}

### 6.4 Beyond the inlier count

Plain RANSAC has several weaknesses that a line of later work has fixed one by one.

**The score.** Counting inliers ignores how well they fit: all hypotheses that put the same points inside the band tie, however far from the centre of the band those points lie. **MSAC** (M-estimator SAC; Torr and Zisserman, 2000) scores a hypothesis by a truncated quadratic loss

$$
C = \sum_i \rho(e_i), \qquad \rho(e) = \min(e^2, t^2),
$$

so inliers contribute their squared residual and outliers a constant. **MLESAC** in the same paper goes one step further and maximizes the likelihood of a mixture of Gaussian inliers and uniform outliers. RANSAC itself is the special case $\rho(e) = 0$ for $e < t$ and a constant otherwise.

**The optimism of the formula.** The iteration count assumes that any outlier-free sample yields a model that collects all inliers. With noisy data that is false: two inliers that happen to be close together define a line with a badly wrong angle. Chum, Matas and Kittler (2003) observed that RANSAC in practice needs more samples than predicted and proposed **LO-RANSAC**: every time a new best model is found, run a **local optimization**, for example iterated least squares on its inliers (or an inner RANSAC that samples non-minimal subsets of the inliers), and keep the result if it scores better. Because new best models are found only about $\log N$ times, LO costs little.

```python
def fit_line(P):
    """Total least squares line {x : n.x = d}, |n| = 1."""
    c = P.mean(0)
    n = np.linalg.svd(P - c)[2][-1]
    return n, n @ c


def robust_line(P, t, iters, score="ransac", lo=False, seed=0):
    """RANSAC (inlier count) or MSAC (truncated quadratic) with optional local optimization."""
    rng = np.random.default_rng(seed)
    cost = lambda e: -(e < t).sum() if score == "ransac" else np.minimum(e ** 2, t ** 2).sum()
    best, best_c = None, np.inf
    for _ in range(iters):
        n, d = fit_line(P[rng.choice(len(P), 2, replace=False)])
        c = cost(np.abs(P @ n - d))
        if c < best_c and lo:                        # LO: polish every new best model
            for _ in range(5):
                inl = np.abs(P @ n - d) < t
                if inl.sum() < 3:
                    break
                n2, d2 = fit_line(P[inl])
                c2 = cost(np.abs(P @ n2 - d2))
                if c2 >= c:
                    break
                n, d, c = n2, d2, c2
        if c < best_c:
            best, best_c = (n, d), c
    n, d = best
    return fit_line(P[np.abs(P @ n - d) < t])        # final refit on the consensus set


def line_error(model, truth=(np.array([-0.6, 0.8]), 20.0)):
    """Largest distance between the two lines over x in [0, 100] (in units of the noise sigma = 1)."""
    (n, d), (n0, d0) = model, truth
    xs = np.array([0.0, 100.0])
    ys = (d0 - n0[0] * xs) / n0[1]                    # two points on the true line
    return np.abs(np.c_[xs, ys] @ n - d).max()


def make_line_data(n_pts, eps, rng, sigma=1.0):
    n0, d0 = np.array([-0.6, 0.8]), 20.0              # true line 0.8 y - 0.6 x = 20
    k = int(round(n_pts * (1 - eps)))
    x = rng.uniform(0, 100, k)
    P_in = np.c_[x, (d0 + 0.6 * x) / 0.8] + rng.normal(0, sigma, (k, 2))
    P_out = rng.uniform([0, 0], [100, 100], (n_pts - k, 2))
    return np.r_[P_in, P_out]


rng = np.random.default_rng(0)
eps, t = 0.6, 2.5
N = ransac_iterations(eps, 2)
errs = {k: [] for k in ("LS", "RANSAC", "MSAC", "LO-RANSAC")}
for trial in range(200):
    P = make_line_data(200, eps, rng)
    errs["LS"].append(line_error(fit_line(P)))
    errs["RANSAC"].append(line_error(robust_line(P, t, N, "ransac", seed=trial)))
    errs["MSAC"].append(line_error(robust_line(P, t, N, "msac", seed=trial)))
    errs["LO-RANSAC"].append(line_error(robust_line(P, t, N, "msac", lo=True, seed=trial)))
print("eps = %.1f, N = %d samples; median / 95th-percentile line error:" % (eps, N))
for k, v in errs.items():
    print("  %-10s %6.2f  %6.2f" % (k, np.median(v), np.percentile(v, 95)))
```

```text
eps = 0.6, N = 27 samples; median / 95th-percentile line error:
  LS           9.28   16.20
  RANSAC       0.33    1.57
  MSAC         0.34    1.57
  LO-RANSAC    0.28    0.59
```

With the iteration budget from the formula ($N = 27$ for $\varepsilon = 0.6$), all robust variants beat least squares by a factor of about 30 in the median. With a final refit, RANSAC and MSAC behave almost identically on this simple problem; LO-RANSAC mainly cuts the **tail**: the 95th-percentile error falls from 1.57 to 0.59, because the runs whose best hypothesis came from a poor (but outlier-free) sample are rescued by the local optimization. The figure repeats the experiment for all outlier ratios and shows directly how optimistic the formula is.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-robust-variants.svg" localized="true" caption="Top left: the loss $\rho(e)$ of least squares, RANSAC (0 inside the threshold, constant outside, drawn as $t^2$) and MSAC (truncated quadratic). Bottom: line error (largest distance between the fitted and the true line over the data range, in units of the noise $\sigma$) against the outlier ratio, 150 trials per point and $N$ from the formula with $p = 0.99$; solid: median, dotted: 95th percentile. Top right: at $\varepsilon = 0.7$, the probability that the best model after $k$ samples has error below $1\sigma$ (300 trials), against the formula's $1 - (1 - w^2)^k$ (dashed). At the formula's $N = 49$ (dotted) the formula promises 0.99; MSAC reaches 0.89 and LO-RANSAC 0.98." %}

**Further improvements**, which modern libraries combine:

- **PROSAC** (Chum and Matas, CVPR 2005) samples first from the matches with the best descriptor scores (for example the lowest ratio $d_1/d_2$) and gradually widens the pool. When the score is informative, good samples come much earlier.
- **Degeneracy.** A sample can be outlier-free and still define the wrong model, for example when 7 of the 8 points of a fundamental-matrix sample lie on one plane. DEGENSAC detects and handles this case.
- **USAC** (Raguram et al., TPAMI 2013) is a framework that assembles these pieces: guided sampling, early rejection of bad hypotheses with a sequential test (SPRT), degeneracy checks and local optimization.
- **MAGSAC and MAGSAC++** (Barath et al., CVPR 2019 and CVPR 2020) remove the hardest parameter, the threshold $t$. Instead of choosing one noise scale, MAGSAC++ marginalizes the model quality over a range of noise scales up to a maximum $\sigma_{\max}$, which yields a smooth weight for every point instead of a hard inlier/outlier decision, and it polishes models with iteratively re-weighted least squares using those weights. It is the default choice in many current pipelines and is available in OpenCV as `cv2.USAC_MAGSAC`.

## 7. Learned features and matchers

Hand-designed pipelines fail in predictable situations: strong illumination change (day and night), large viewpoint change, weak or repetitive texture, and motion blur. Since 2018, each stage of the pipeline has been learned from data, and by 2026 learned matchers are the default in most research systems for SfM and visual localization.

### 7.1 Learned detectors and descriptors: SuperPoint and its successors

**SuperPoint** (DeTone, Malisiewicz and Rabinovich, CVPR Workshops 2018) is a fully convolutional network that computes keypoints and descriptors for a whole image in one forward pass. A shared VGG-style encoder reduces the image by 8; a **detector head** outputs, for each $8 \times 8$ cell, a 65-way softmax (64 pixel positions plus a "no keypoint" dustbin), and a **descriptor head** outputs a 256-D descriptor map that is interpolated at the keypoints and normalized. Where do the labels come from? The detector is first trained on synthetic shapes whose corners are known (the resulting network is called MagicPoint), then **Homographic Adaptation** labels real images: warp each image with many random homographies, run the detector on every warp, map the detections back and aggregate them. Points that are found consistently under all warps become the labels, which directly trains repeatability, the property section 1 asked for. The descriptor is trained with a contrastive loss on pairs related by a known homography.

Later detectors and descriptors changed the training signal and the efficiency: **DISK** (Tyszkiewicz et al., NeurIPS 2020) treats keypoint selection and matching as a stochastic policy and trains it with policy gradients to maximize the number of correct matches; **ALIKED** adds deformable descriptors at low cost; **XFeat** (Potje et al., CVPR 2024) is a lightweight network designed to run in real time on a CPU.

### 7.2 Learned matching as optimal transport: SuperGlue

Nearest-neighbour matching looks at one descriptor pair at a time. **SuperGlue** (Sarlin et al., CVPR 2020) looks at all keypoints of both images together. An attentional graph neural network alternates **self-attention** (between keypoints of the same image, which lets a point know its neighbourhood) and **cross-attention** (between the two images, which lets it look for its partner), starting from the descriptors plus an encoding of the keypoint positions. The result is a score matrix $S_{ij}$ between the $M$ keypoints of image A and the $N$ of image B.

The assignment must be **partial**: each keypoint matches at most once, and some keypoints (occluded, outside the other view) match nothing. SuperGlue therefore appends a **dustbin** row and column with a learned score $\alpha$, and asks for a soft assignment $P$ of the augmented $(M+1) \times (N+1)$ matrix whose real rows and columns each sum to 1, while the dustbin row and column absorb up to $N$ and $M$ points. This is an entropy-regularized **optimal transport** problem, solved by the **Sinkhorn algorithm**: alternately rescale rows and columns of $e^{S}$ until the marginals hold. In the log domain:

$$
u_i \leftarrow \log a_i - \log \sum_j e^{Z_{ij} + v_j}, \qquad v_j \leftarrow \log b_j - \log \sum_i e^{Z_{ij} + u_i}, \qquad P_{ij} = e^{Z_{ij} + u_i + v_j}.
$$

Every step is differentiable, so the whole matcher is trained end to end with ground-truth correspondences from posed images with depth.

```python
from scipy.special import logsumexp


def sinkhorn_dustbin(S, alpha, iters=100):
    """SuperGlue's partial assignment: append a dustbin row and column with score alpha, then
    alternately normalize rows and columns in the log domain. Real rows/columns get mass 1,
    the dustbins get mass N and M, so every point can be matched at most once or not at all."""
    M, N = S.shape
    Z = np.full((M + 1, N + 1), float(alpha))
    Z[:M, :N] = S
    log_a = np.log(np.r_[np.ones(M), N])                  # row marginals
    log_b = np.log(np.r_[np.ones(N), M])                  # column marginals
    u, v = np.zeros(M + 1), np.zeros(N + 1)
    for _ in range(iters):
        u = log_a - logsumexp(Z + v[None, :], axis=1)
        v = log_b - logsumexp(Z + u[:, None], axis=0)
    return np.exp(Z + u[:, None] + v[None, :])


S = np.array([[12.0, 1.5, 0.6],     # A0 clearly matches B0
              [0.9, 7.8, 8.4],      # A1 is ambiguous between B1 and B2 ...
              [0.3, 1.2, 12.6],     # ... but B2 is clearly taken by A2
              [1.8, 2.7, 2.1]])     # A3 has no partner (occluded)
P = sinkhorn_dustbin(S, alpha=4.0)
np.set_printoptions(precision=2, suppress=True)
print(P)
print("row-wise argmax of S:", S.argmax(1), "  argmax of P (3 = dustbin):", P[:4].argmax(1))
```

```text
[[0.97 0.   0.   0.03]
 [0.   0.75 0.05 0.2 ]
 [0.   0.   0.94 0.06]
 [0.   0.02 0.   0.98]
 [0.03 0.23 0.01 2.73]]
row-wise argmax of S: [0 2 2 1]   argmax of P (3 = dustbin): [0 1 2 3]
```

The toy example shows the two things that row-wise argmax cannot do. $A_1$ slightly prefers $B_2$ (8.4 against 7.8), but $B_2$ is clearly taken by $A_2$; because each column can only be used once, the transport moves $A_1$ to $B_1$ (0.75). $A_3$ has no good partner, and its mass goes to the dustbin (0.98) instead of producing a false match with $B_1$.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-sinkhorn.svg" caption="Sinkhorn with a dustbin on the toy scores of the code. Left: the augmented score matrix with the dustbin score $\alpha = 4$ (row and column $\varnothing$). Middle: the transport plan $P$ after one row and one column normalization. Right: after 100 iterations; real rows and columns sum to 1, the dustbin row to 3 and the dustbin column to 4 (the numbers of keypoints of the other image). Cyan boxes: the row-wise maxima, which are now one-to-one: $A_1 \to B_1$ although $S_{12} > S_{11}$, and $A_3 \to \varnothing$." %}

### 7.3 LightGlue

**LightGlue** (Lindenberger, Sarlin and Pollefeys, ICCV 2023) revisits SuperGlue's design to make it faster, more accurate and easier to train. Two ideas stand out. It is **adaptive**: after every layer a small head predicts whether the matches are already confident; easy image pairs (large overlap, little change) exit after a few layers, and keypoints that are confidently unmatchable are pruned from later layers. And it replaces the Sinkhorn iterations with a lighter assignment that combines pairwise similarity with a per-point **matchability** score. The authors report accuracy close to the dense matcher LoFTR at about 8 times its speed in typical outdoor conditions. Pretrained weights exist for SuperPoint, DISK, ALIKED and even classical SIFT features, which makes LightGlue an easy upgrade to an existing SIFT pipeline.

### 7.4 Detector-free and dense matching: LoFTR, RoMa and beyond

Detect-then-describe fails where no detector fires: white walls, uniform floors, repetitive façades. **Detector-free** matchers skip the detector. **LoFTR** (Sun et al., CVPR 2021) extracts feature maps at 1/8 and 1/2 resolution, transforms the coarse maps of both images with interleaved self- and cross-attention, matches all coarse cells with a dual softmax (or optimal transport), and refines each coarse match to sub-pixel precision in a small window of the fine map. Because attention gives every cell a global receptive field, LoFTR finds matches in low-texture regions where descriptors alone are ambiguous.

**Dense** matchers go further and estimate a warp (a match and a certainty) for every pixel. **RoMa** (Edstedt et al., CVPR 2024) combines frozen DINOv2 foundation-model features for the coarse, robust match with specialized ConvNet features for precise refinement, and treats the coarse match as classification over anchor positions, which handles multi-modal ambiguity better than regression. Its successor **RoMa v2** (arXiv 2511.15706, November 2025; listed in the authors' university record as published at ECCV 2026) focuses on speed, memory and a curated training mix. Dense matchers are the most robust option for hard pairs today, at a much higher cost than sparse ones.

Two related lines, as of November 2026: **MASt3R** (Leroy et al., ECCV 2024) predicts dense 3D point maps for an image pair and matches in that 3D-grounded space, linking matching directly to the feed-forward reconstruction models of post 9; and **MatchAnything** (He et al., arXiv preprint 2501.07556, January 2025) pre-trains detector-free matchers on synthetic cross-modal pairs (for example visible and thermal, or medical modalities).

In practice: SIFT or ORB remain good when speed or licensing matters and images are similar; SuperPoint or ALIKED + LightGlue is a strong default for SfM and localization; LoFTR, RoMa and their successors are worth their cost on difficult pairs. All of them still feed a robust estimator: learned matchers lower the outlier ratio, they do not remove the need for RANSAC.

## 8. Optical flow: matching through time

### 8.1 Brightness constancy and the aperture problem

In a video, consecutive frames differ by a small motion, and we want a correspondence for every pixel, the **optical flow** $\mathbf d(\mathbf x) = (u, v)$. Assume that a point keeps its brightness as it moves (**brightness constancy**): $I_2(\mathbf x + \mathbf d) = I_1(\mathbf x)$. For small $\mathbf d$ a Taylor expansion gives

$$
I_x u + I_y v + I_t = 0, \qquad I_t = I_2(\mathbf x) - I_1(\mathbf x).
$$

One equation, two unknowns: each pixel only constrains $\mathbf d$ to a line in the $(u, v)$ plane. Only the component along the gradient, the **normal flow** $-I_t \nabla I / \lVert \nabla I \rVert^2$, is determined. This is the aperture problem from section 1, now in equation form: through a small aperture, a moving edge only reveals its motion across itself.

### 8.2 Lucas-Kanade

Lucas and Kanade (1981) assume that $\mathbf d$ is constant in a small window and solve the stacked constraints by least squares:

$$
\min_{\mathbf d} \sum_{\mathbf x \in W} \big( \nabla I^\top \mathbf d + I_t \big)^2
\quad\Longrightarrow\quad
\underbrace{\sum_W \begin{pmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{pmatrix}}_{M}\, \mathbf d = -\sum_W \begin{pmatrix} I_x I_t \\ I_y I_t \end{pmatrix}.
$$

The matrix is the **same structure tensor** $M$ as in section 2. Corner detection and flow estimation are two sides of one coin: $\mathbf d$ is well determined exactly where $M$ is well conditioned, which is why Shi and Tomasi's paper about tracking is titled "Good features to track". On an edge, $M$ is nearly singular and the window still only gives the normal flow.

Because the linearization only holds for small motion, LK is applied **iteratively** (Gauss-Newton): warp $I_2$ by the current estimate, solve for an update, repeat. For motions larger than the scale of the image structure, the linearization point is in the wrong basin, so LK runs **coarse-to-fine** on an image pyramid: estimate at 1/4 resolution where the motion is 4 times smaller, double, refine at 1/2, double, refine at full resolution (Bouguet's pyramidal implementation in OpenCV, `calcOpticalFlowPyrLK`). Tracking Shi-Tomasi corners with pyramidal LK over a sequence is the **KLT tracker**, still used in the front ends of visual-inertial odometry systems; a forward-backward check (track back from frame 2 to frame 1 and reject points that do not return) removes most failures.

```python
def lk_window(I, J, x, y, d0=(0.0, 0.0), half=7, iters=30):
    """Iterative Lucas-Kanade for the (2*half+1)^2 window at integer (x, y):
    find d with J(p + d) = I(p). Returns d and the eigenvalues of the 2x2 matrix M."""
    Iy, Ix = np.gradient(I)
    ys, xs = np.mgrid[y - half:y + half + 1, x - half:x + half + 1]
    gx, gy, T = Ix[ys, xs].ravel(), Iy[ys, xs].ravel(), I[ys, xs].ravel()
    M = np.array([[gx @ gx, gx @ gy], [gx @ gy, gy @ gy]])        # = structure tensor (box window)
    d = np.array(d0, float)
    for _ in range(iters):
        e = ndi.map_coordinates(J, [ys.ravel() + d[1], xs.ravel() + d[0]], order=1) - T
        step = np.linalg.solve(M, -np.array([gx @ e, gy @ e]))   # Gauss-Newton step
        d += step
        if np.linalg.norm(step) < 1e-3:
            break
    return d, np.linalg.eigvalsh(M)


def lk_pyramid(I, J, x, y, levels=3, **kw):
    """Coarse-to-fine LK: solve at 1/4 resolution, double, refine at 1/2, double, refine."""
    PI, PJ = [I], [J]
    for _ in range(levels - 1):
        PI.append(ndi.gaussian_filter(PI[-1], 1.0)[::2, ::2])
        PJ.append(ndi.gaussian_filter(PJ[-1], 1.0)[::2, ::2])
    d = np.zeros(2)
    for l in reversed(range(levels)):
        d, _ = lk_window(PI[l], PJ[l], int(round(x / 2 ** l)), int(round(y / 2 ** l)), d, **kw)
        if l > 0:
            d = 2 * d
    return d


I = ndi.gaussian_filter(img, 1.0)
pts = [(x, y) for x, y in nms_peaks(harris(I)[0], radius=6)[:25] if 30 < x < 290 and 30 < y < 210]
for true_d in ([0.6, -0.4], [5.3, -3.6], [12.0, 7.0]):         # pure translations, in pixels
    J = warp_homography(I, np.array([[1, 0, true_d[0]], [0, 1, true_d[1]], [0, 0, 1.0]]), I.shape)
    ok1 = sum(np.linalg.norm(lk_window(I, J, x, y)[0] - true_d) < 0.1 for x, y in pts)
    ok2 = sum(np.linalg.norm(lk_pyramid(I, J, x, y) - true_d) < 0.1 for x, y in pts)
    print("motion %-12s single-level LK %2d/%d, pyramidal LK %2d/%d within 0.1 px"
          % (true_d, ok1, len(pts), ok2, len(pts)))
```

```text
motion [0.6, -0.4]  single-level LK 20/20, pyramidal LK 20/20 within 0.1 px
motion [5.3, -3.6]  single-level LK 20/20, pyramidal LK 20/20 within 0.1 px
motion [12.0, 7.0]  single-level LK 14/20, pyramidal LK 20/20 within 0.1 px
```

Our synthetic image consists of large uniform shapes, so the basin of convergence of a single level is unusually wide (motions of 6 px still converge); on natural, finely textured images it is typically a pixel or two. The figure measures it directly.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-lucas-kanade.svg" localized="true" caption="Top: the flow constraint $I_x u + I_y v + I_t = 0$ of the 40 strongest-gradient pixels of a $15 \times 15$ window, for a true motion $\mathbf d = (0.6, -0.4)$ (red star), as lines in the $(u, v)$ plane. At a corner ($\lambda_2/\lambda_1 = 0.54$) the lines cross near the truth and the least-squares solution (green circle) is $(0.58, -0.43)$ after one step. On a vertical edge ($\lambda_2/\lambda_1 = 0.004$) all lines are parallel: only the normal flow $(0.6, 0)$ is determined, and any point on the green dashed line fits equally well. Bottom: fraction of 20 corners on which LK converges to within 0.1 px, against the motion magnitude. Single-level LK is perfect up to 9 px and drops to 35% at 24 px; the 3-level pyramid stays perfect up to 19.5 px." %}

### 8.3 From Horn-Schunck to RAFT

Lucas-Kanade is **local**: it fails in flat regions and on edges. Horn and Schunck (1981) made flow **global** by minimizing the brightness-constancy error over the whole image plus a smoothness term $\alpha^2 \int (\lVert\nabla u\rVert^2 + \lVert\nabla v\rVert^2)$, which fills in flat regions from their surroundings. Decades of variational methods refined this energy (robust penalties, coarse-to-fine warping, large-displacement matching terms).

**RAFT** (Recurrent All-Pairs Field Transforms; Teed and Deng, ECCV 2020) replaced that energy minimization with a learned iterative solver. A CNN extracts per-pixel features of both frames at 1/8 resolution; the **all-pairs correlation volume** stores the dot product of every pixel of frame 1 with every pixel of frame 2 (a 4D volume, pooled into a pyramid to also see large motions); and a convolutional GRU starts from zero flow and repeatedly looks up the correlation around the current estimate and predicts an update, much like an unrolled, learned Gauss-Newton. RAFT set a new state of the art on Sintel and KITTI and became the backbone of later flow, stereo and tracking networks; **SEA-RAFT** (Wang, Lipson and Deng, ECCV 2024) simplifies it and makes it faster with a mixture-of-Laplace loss, a direct initial flow prediction and rigid-motion pre-training. Long-range **point tracking** networks extend the idea from two frames to whole videos.

## 9. Evaluating features and matchers

Papers report several metrics, and they measure different things:

- **Repeatability**: the fraction of keypoints detected in both images at corresponding positions (within $\epsilon$ px after mapping with the ground-truth geometry). It evaluates the detector alone.
- **Matching score / mean matching accuracy (MMA@$\epsilon$)**: the fraction of (mutual nearest-neighbour) matches whose reprojection error is below $\epsilon$, plotted for $\epsilon$ = 1 to 10 px. HPatches (Balntas et al., CVPR 2017), a set of planar scenes with ground-truth homographies, is the standard benchmark; our toy pair is a miniature version of it.
- **Homography estimation accuracy**: the fraction of image pairs whose estimated $H$ maps the image corners within $\epsilon$ px of the truth (our 0.40 px), or the area under that curve.
- **Relative pose AUC**: for 3D scenes, estimate $E$ with RANSAC, decompose it into a rotation and translation (post 4), take the larger of the angular errors, and report the area under the cumulative error curve up to 5°, 10° and 20°, on datasets such as MegaDepth (outdoor) and ScanNet (indoor).
- **Downstream reconstruction**: the Image Matching Challenge and its benchmark (Jin et al., IJCV 2021) evaluate whole pipelines by the accuracy of the camera poses they produce.

Jin et al. made an important methodological point: many earlier "improvements" disappeared once the baselines were tuned properly (ratio threshold, RANSAC variant and threshold, number of features), and with careful settings classical SIFT pipelines remained competitive. When you compare two matchers, fix and tune the robust estimator for both, and report runtime.

## 10. A practical recipe with OpenCV

Everything above is available in OpenCV, which you would use in practice. The snippet runs the same experiment with SIFT and ORB, the ratio test and MAGSAC++:

```python
import cv2          # pip install opencv-python  (SIFT is in the main package since 4.4)

u8 = lambda a: np.clip(a * 255, 0, 255).astype(np.uint8)
g1, g2 = u8(img), u8(img2)
for name, det, norm in [("SIFT", cv2.SIFT_create(), cv2.NORM_L2),
                        ("ORB", cv2.ORB_create(nfeatures=1000), cv2.NORM_HAMMING)]:
    k1, D1 = det.detectAndCompute(g1, None)
    k2, D2 = det.detectAndCompute(g2, None)
    knn = cv2.BFMatcher(norm).knnMatch(D1, D2, k=2)
    good = [m for m, n in knn if m.distance < 0.8 * n.distance]          # ratio test
    q1 = np.float32([k1[m.queryIdx].pt for m in good])
    q2 = np.float32([k2[m.trainIdx].pt for m in good])
    H, mask = cv2.findHomography(q1, q2, cv2.USAC_MAGSAC, 3.0, confidence=0.999, maxIters=10000)
    err = np.linalg.norm(apply_h(H, box) - apply_h(H_true, box), axis=1).max()
    print("%-4s %4d / %4d keypoints, %3d ratio-test matches, %3d MAGSAC++ inliers, corner error %.2f px"
          % (name, len(k1), len(k2), len(good), mask.sum(), err))
```

```text
SIFT  322 /  313 keypoints, 204 ratio-test matches, 187 MAGSAC++ inliers, corner error 0.36 px
ORB   759 /  864 keypoints, 336 ratio-test matches, 316 MAGSAC++ inliers, corner error 0.71 px
```

(The numbers come from OpenCV 5.0 in our environment; other versions may differ slightly.) OpenCV's SIFT finds more keypoints than our version mainly because it first doubles the image, which adds an octave of small features. Some practical advice:

- **Undistort first**, or at least undistort the keypoint coordinates with the calibration of post 2 before geometric verification: the models in RANSAC assume a pinhole camera.
- **Spread the features.** Many matches on one textured corner constrain the geometry poorly. Use a grid or adaptive non-maximal suppression.
- **Ratio 0.7 to 0.8, mutual check, then RANSAC** with a threshold of about 1 to 3 px for well-calibrated images; prefer MAGSAC++ when you cannot tune the threshold.
- **Check the inlier count, not only the model.** Fewer than 15 to 30 inliers usually means a wrong or degenerate model, whatever its residual.
- **Mind degeneracies.** If the scene is planar or the camera only rotates, a homography explains the matches as well as a fundamental matrix; post 4 explains how to detect this.
- For hard pairs, switch the matcher (SuperPoint or ALIKED + LightGlue, or a dense matcher), not the RANSAC settings.

## Try it

- In the **structure-tensor widget** of section 2, find a spot where Harris says "corner" but the motion estimate is still poor (hint: add noise and use a small window), and a spot on the checkerboard where the window size decides between edge and corner.
- In the **RANSAC widget** of section 6, set $\varepsilon = 0.8$ and compare the number of samples needed for the line and the circle. Then set the threshold far below the noise and watch the best model's inlier count collapse.
- The home page's [Interactive Lab]({{ '/' | relative_url }}#lab) has the rendering side of the story (path tracing, Gaussian splatting); the next posts of this series put the correspondences found here to work.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Random sample consensus (Fischler, Bolles) | Communications of the ACM | 1981 | [DOI](https://doi.org/10.1145/358669.358692) | RANSAC: fit minimal samples, count the consensus |
| An iterative image registration technique with an application to stereo vision (Lucas, Kanade) | IJCAI | 1981 | — | The Lucas-Kanade method: Gauss-Newton on image windows |
| Determining optical flow (Horn, Schunck) | Artificial Intelligence | 1981 | [DOI](https://doi.org/10.1016/0004-3702(81)90024-2) | Global variational optical flow with a smoothness prior |
| A combined corner and edge detector (Harris, Stephens) | Alvey Vision Conference | 1988 | [DOI](https://doi.org/10.5244/C.2.23) | The structure tensor and the Harris response |
| Good features to track (Shi, Tomasi) | CVPR | 1994 | [DOI](https://doi.org/10.1109/CVPR.1994.323794) | The minimum-eigenvalue criterion, derived from tracking |
| Feature detection with automatic scale selection (Lindeberg) | IJCV | 1998 | [DOI](https://doi.org/10.1023/A:1008045108935) | Scale-normalized derivatives and characteristic scale |
| MLESAC: a new robust estimator with application to estimating image geometry (Torr, Zisserman) | CVIU | 2000 | [DOI](https://doi.org/10.1006/cviu.1999.0832) | MSAC and MLESAC: better scores than the inlier count |
| Locally optimized RANSAC (Chum, Matas, Kittler) | DAGM | 2003 | [DOI](https://doi.org/10.1007/978-3-540-45243-0_31) | LO-RANSAC: polish every new best model |
| Distinctive image features from scale-invariant keypoints (Lowe) | IJCV | 2004 | [DOI](https://doi.org/10.1023/B:VISI.0000029664.99615.94) | SIFT: DoG detector, 128-D descriptor, ratio test |
| Matching with PROSAC: progressive sample consensus (Chum, Matas) | CVPR | 2005 | [DOI](https://doi.org/10.1109/CVPR.2005.221) | Guided sampling by match quality |
| Machine learning for high-speed corner detection (Rosten, Drummond) | ECCV | 2006 | [DOI](https://doi.org/10.1007/11744023_34) | FAST |
| BRIEF: binary robust independent elementary features (Calonder et al.) | ECCV | 2010 | [DOI](https://doi.org/10.1007/978-3-642-15561-1_56) | Binary tests and Hamming matching |
| ORB: an efficient alternative to SIFT or SURF (Rublee et al.) | ICCV | 2011 | [DOI](https://doi.org/10.1109/ICCV.2011.6126544) | Oriented FAST + rotated BRIEF, the ORB-SLAM front end |
| USAC: a universal framework for random sample consensus (Raguram et al.) | TPAMI | 2013 | [DOI](https://doi.org/10.1109/TPAMI.2012.257) | The modular modern RANSAC |
| HPatches: a benchmark and evaluation of handcrafted and learned local descriptors (Balntas et al.) | CVPR | 2017 | [arXiv](https://arxiv.org/abs/1704.05939) | The standard local-descriptor benchmark |
| SuperPoint: self-supervised interest point detection and description (DeTone et al.) | CVPR Workshops | 2018 | [arXiv](https://arxiv.org/abs/1712.07629) | Learned keypoints via homographic adaptation |
| SuperGlue: learning feature matching with graph neural networks (Sarlin et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1911.11763) | Attention + optimal transport for matching |
| MAGSAC++, a fast, reliable and accurate robust estimator (Barath et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1912.05909) | Threshold-free robust estimation by marginalizing the noise scale |
| RAFT: recurrent all-pairs field transforms for optical flow (Teed, Deng) | ECCV | 2020 | [arXiv](https://arxiv.org/abs/2003.12039) | All-pairs correlation + recurrent updates |
| DISK: learning local features with policy gradient (Tyszkiewicz et al.) | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.13566) | End-to-end trained features via reinforcement learning |
| Image matching across wide baselines: from paper to practice (Jin et al.) | IJCV | 2021 | [arXiv](https://arxiv.org/abs/2003.01587) | Pose-based benchmark; tuned baselines matter |
| LoFTR: detector-free local feature matching with transformers (Sun et al.) | CVPR | 2021 | [arXiv](https://arxiv.org/abs/2104.00680) | Detector-free coarse-to-fine matching |
| LightGlue: local feature matching at light speed (Lindenberger et al.) | ICCV | 2023 | [arXiv](https://arxiv.org/abs/2306.13643) | Adaptive, fast successor of SuperGlue |
| RoMa: robust dense feature matching (Edstedt et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2305.15404) | Dense matching with foundation-model features |
| XFeat: accelerated features for lightweight image matching (Potje et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2404.19174) | Real-time learned features on a CPU |
| SEA-RAFT: simple, efficient, accurate RAFT for optical flow (Wang et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2405.14793) | Faster, simpler RAFT |
| RoMa v2: harder better faster denser feature matching (Edstedt et al.) | ECCV (per the authors' university record) | 2026 | [arXiv](https://arxiv.org/abs/2511.15706) | Faster dense matching with a curated training mix |

## Learning resources

- R. Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed., 2022: chapter 7 (feature detection and matching), chapter 8 (image alignment, including RANSAC) and chapter 9 (motion estimation and optical flow). Free for personal use at [szeliski.org/Book](https://szeliski.org/Book/).
- R. Hartley and A. Zisserman, *Multiple View Geometry in Computer Vision*, 2nd ed., 2004, section 4.7 (robust estimation, the RANSAC iteration count and the $\chi^2$ thresholds).
- D. Lowe's IJCV paper is very readable; the [author's copy](https://www.cs.ubc.ca/~lowe/papers/ijcv04.pdf) is a good companion to section 3.
- OpenCV: the feature tutorials (`cv2.SIFT_create`, `cv2.ORB_create`, `cv2.BFMatcher`, `cv2.calcOpticalFlowPyrLK`) and the [USAC tutorial](https://docs.opencv.org/5.0/tutorials/calib3d/usac.html) for the modern RANSAC flags.
- Code: [cvg/LightGlue](https://github.com/cvg/LightGlue) (SuperPoint, DISK, ALIKED and SIFT + LightGlue), [magicleap/SuperGluePretrainedNetwork](https://github.com/magicleap/SuperGluePretrainedNetwork), [Parskatt/RoMa](https://github.com/Parskatt/RoMa), [danini/magsac](https://github.com/danini/magsac), [princeton-vl/RAFT](https://github.com/princeton-vl/RAFT).
- Benchmarks: [HPatches](https://github.com/hpatches) and the [Image Matching Challenge](https://vision.uvic.ca/image-matching-challenge/) of Jin et al.

## Exercises

1. Show that the Harris response is positive exactly when $\lambda_2/\lambda_1 > c^\ast(k) = (1 - 2k - \sqrt{1 - 4k})/(2k)$, and compute $c^\ast$ for $k = 0.04$ and $k = 0.06$. Which $k$ is stricter?

   <details markdown="1"><summary>Hint</summary>

   Substitute $\lambda_2 = c\lambda_1$ into $R$ and divide by $\lambda_1^2 > 0$: $R > 0 \iff kc^2 - (1-2k)c + k < 0$. The discriminant is $(1-2k)^2 - 4k^2 = 1 - 4k$, and the smaller root is $c^\ast$. You get $c^\ast(0.04) = 0.0436$ and $c^\ast(0.06) = 0.0685$: a larger $k$ demands a stronger second direction, so it is stricter.
   </details>

2. For the Gaussian blob of section 3.2, compute the DoG response $L(\mathbf 0; k\sigma) - L(\mathbf 0; \sigma)$ in closed form and show that its extremum over $\sigma$ lies near $\sigma = s/\sqrt k$, not at $\sigma = s$. Does this bias matter for matching?

   <details markdown="1"><summary>Hint</summary>

   $L(\mathbf 0; \sigma) = s^2/(s^2 + \sigma^2)$. The DoG compares $\sigma$ and $k\sigma$, so it measures the Laplacian at a scale between them, roughly the geometric mean $\sqrt k\,\sigma$; setting $\sqrt k\,\sigma = s$ gives $\sigma = s/\sqrt k = 5.35$ for $s = 6$, as in the figure (5.3). The bias is the same constant factor in every image, so the ratio of the scales of two matched keypoints, which is what matters, is unaffected.
   </details>

3. Your matcher produces 2000 matches with 70% outliers, and one hypothesis plus verification costs 0.2 ms. Estimate the RANSAC time at $p = 0.99$ for a homography, an essential matrix with the 5-point solver and a fundamental matrix with the 8-point solver. How much do you gain if the ratio test brings the outlier ratio down to 40%?

   <details markdown="1"><summary>Hint</summary>

   Use the table: 567, 1893 and 70188 samples at 70% outliers, so about 0.11 s, 0.38 s and 14 s. At 40% outliers, `ransac_iterations(0.4, s)` gives 34, 57 and 272 samples: under 0.06 s for all three. Lowering $\varepsilon$ helps exponentially more for large $s$.
   </details>

4. Test rotation invariance of the mini-SIFT: rotate the synthetic image by 0°, 30°, 60° and 90° (use `warp_homography`), and measure the fraction of correct ratio-test matches with the normal descriptor and with $\theta$ forced to 0 in `sift`. Explain the curve.

   <details markdown="1"><summary>Hint</summary>

   Write a copy of `sift` that appends `sift_descriptor(..., 0.0)` instead of looping over `orientations`, and count correct matches with `match_descriptors` and the known rotation. We got 183/183, 99/99, 96/97 and 115/115 correct matches with orientation assignment, and 139/139, 0/1, 0/4 and 1/1 with $\theta = 0$. Without a measured orientation the descriptor grid stays aligned with the image axes, so even a 90° rotation (which shifts every 8-bin histogram by 2 bins and permutes the cells) destroys the match.
   </details>

5. Add a forward-backward check to the single-level `lk_window`: track each corner from $I$ to $J$, start a second track from $J$ back to $I$ at the rounded end point, and reject the corner if it does not come back to within 0.5 px. For the 12 px motion of section 8.2, how many of the 6 failed tracks does the check catch, and how many correct tracks does it reject? Why?

   <details markdown="1"><summary>Hint</summary>

   Remember the sub-pixel part you lost by rounding: the corner returns to $(x_i + d^b_x) - (x_i - x_e)$, where $x_e$ is the forward end point and $x_i$ its rounding. Also skip end points whose window leaves the image. We found that the check catches all 6 failures but also rejects 4 of the 14 correct tracks: the backward track faces the same 14 px motion and fails just as often. The check is a reliable alarm only when both directions are tracked with a method that can handle the motion, such as the pyramid.
   </details>

**Next:** [post 4]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }}) uses these correspondences to recover the geometry of two views: epipolar lines, the essential and fundamental matrices, relative pose and triangulation.
