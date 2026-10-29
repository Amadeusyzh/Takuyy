---
layout: post
title: "3D Gaussian Splatting, end to end"
date: 2026-10-27 12:04:00+0900
description: "The complete 3DGS method: Gaussian parameters, covariance from rotation and scale, EWA projection with the Jacobian, the 0.3 low-pass, tile-based differentiable rasterization, alpha blending and gradients, adaptive density control and the training recipe, with Python code."
categories: neural-rendering
tags: [3d-gaussian-splatting, ewa-splatting, differentiable-rendering, spherical-harmonics, pytorch]
series: neural-rendering
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## Why this matters

[Post 3]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }}) made radiance fields train in minutes, but rendering still marched rays through a volume and looked up features at many samples per pixel. **3D Gaussian Splatting** (Kerbl, Kopanas, Leimkühler & Drettakis, ACM Transactions on Graphics 42(4), SIGGRAPH 2023) changed the representation itself: a scene is a set of millions of explicit, anisotropic 3D Gaussians, each with a position, shape, opacity and view-dependent colour, and an image is produced by **rasterizing** them, projecting each to a 2D ellipse, sorting, and alpha-blending. Because the rasterizer is differentiable, the Gaussians are optimized from photographs exactly like a NeRF, but the result renders at real-time rates (the paper reports 1080p at 30 fps or more) with state-of-the-art quality.

3DGS is now the default representation for photoreal capture, and the backbone of most work in post 5: dynamic scenes, SLAM, feed-forward reconstruction, generation and VR. This post goes through the method end to end, with code for every piece.

## Prerequisites

- Volume rendering and alpha compositing, especially $w_i = T_i \alpha_i$ (post 2).
- Pinhole projection and camera conventions (post 1).
- Rasterization, depth sorting and the GPU pipeline from the graphics series.
- Multivariate Gaussians, quaternions, and PyTorch autograd.

## 1. The representation

A scene is a set of $N$ Gaussians. Gaussian $i$ has:

| Parameter | Symbol | Stored as | Activation | Size |
| --- | --- | --- | --- | --- |
| Mean (centre) | $\boldsymbol\mu_i \in \mathbb R^3$ | raw | — | 3 |
| Rotation | $\mathbf q_i$ | quaternion | normalize | 4 |
| Scale | $\mathbf s_i \in \mathbb R^3_{>0}$ | $\log \mathbf s_i$ | $\exp$ | 3 |
| Opacity | $o_i \in (0,1)$ | logit | sigmoid | 1 |
| Colour | SH coefficients $\mathbf k_i$ | raw | SH eval $+\,0.5$, clamp | $16\times 3 = 48$ |

That is 59 floats per Gaussian; a typical outdoor scene with 3–6 million Gaussians takes several hundred megabytes to over a gigabyte as a float32 `.ply`, which is why compression is a research area of its own (post 5).

The Gaussian defines a density in space

$$
G_i(\mathbf x) = \exp\!\Big( -\tfrac12 (\mathbf x - \boldsymbol\mu_i)^\top \Sigma_i^{-1} (\mathbf x - \boldsymbol\mu_i) \Big),
$$

without normalization constant: its peak value is 1, and the opacity $o_i$ scales it. Compared with NeRF:

- It is **explicit**: no network is evaluated at render time. All parameters are optimized directly by gradient descent.
- It is **sparse and adaptive**: Gaussians exist only where there is content, and their number and size adapt during training (section 6).
- It is still a **volumetric, soft** representation: overlapping, semi-transparent blobs are blended, which keeps gradients well behaved. There are no hard surfaces or normals.

### 1.1 Covariance from rotation and scale

A covariance matrix must be symmetric positive semi-definite, a constraint that plain gradient descent on the 6 entries of $\Sigma$ would violate. 3DGS therefore parameterizes the Gaussian as an ellipsoid: a scaling $S = \operatorname{diag}(s_x, s_y, s_z)$ followed by a rotation $R(\mathbf q)$,

$$
\Sigma = R\, S\, S^\top R^\top .
$$

Any $\Sigma$ built this way is valid, and the parameters are intuitive: $\mathbf s$ are the standard deviations along the ellipsoid's principal axes, which are the columns of $R$. The rotation matrix of a unit quaternion $\mathbf q = (w, x, y, z)$ is

$$
R(\mathbf q) =
\begin{pmatrix}
1 - 2(y^2 + z^2) & 2(xy - wz) & 2(xz + wy) \\
2(xy + wz) & 1 - 2(x^2 + z^2) & 2(yz - wx) \\
2(xz - wy) & 2(yz + wx) & 1 - 2(x^2 + y^2)
\end{pmatrix}.
$$

The quaternion is normalized inside the forward pass, so the optimizer can move it freely in $\mathbb R^4$.

```python
import numpy as np

def quat_to_rotmat(q):
    """Unit quaternion (w, x, y, z) -> 3x3 rotation matrix. q is normalized first."""
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z),     2 * (x * z + w * y)],
        [2 * (x * y + w * z),     1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y),     2 * (y * z + w * x),     1 - 2 * (x * x + y * y)]])

def covariance_3d(q, log_scale):
    """Sigma = R S S^T R^T with S = diag(exp(log_scale)); always symmetric positive semi-definite."""
    R = quat_to_rotmat(q)
    M = R @ np.diag(np.exp(log_scale))
    return M @ M.T
```

The eigenvalues of `covariance_3d(q, np.log([0.3, 0.1, 0.02]))` are exactly $0.3^2, 0.1^2, 0.02^2$ for any $\mathbf q$, a quick unit test.

The figure below builds such an ellipsoid step by step: the unit sphere is stretched by $S$ and then rotated by $R(\mathbf q)$. The coloured arrows are the columns of $RS$, i.e. the principal axes scaled by their standard deviations.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-ellipsoid.svg" caption="The 1σ surface of a 3D Gaussian is the image of the unit sphere under $RS$. Left: the unit sphere and the basis vectors. Middle: $S$ stretches the axes to the standard deviations (0.9, 0.5, 0.25). Right: $R(\mathbf q)$ rotates them. The eigenvalues printed below are exactly the squared scales, whatever the quaternion." %}

### 1.2 View-dependent colour with spherical harmonics

Colour is a function on the sphere of directions, expanded in real **spherical harmonics** up to degree 3:

$$
\mathbf c_i(\mathbf d) = \max\!\Big(0,\ \tfrac12 + \sum_{\ell=0}^{3}\sum_{m=-\ell}^{\ell} \mathbf k_{i,\ell m}\, Y_{\ell m}(\mathbf d)\Big),
\qquad
\mathbf d = \frac{\boldsymbol\mu_i - \mathbf o_{\text{cam}}}{\lVert \boldsymbol\mu_i - \mathbf o_{\text{cam}}\rVert},
$$

i.e. $(3+1)^2 = 16$ coefficients per colour channel. Degree 0 is a constant ($Y_{00} = \tfrac{1}{2\sqrt\pi} \approx 0.2821$), the "diffuse" colour; degrees 1–3 add increasingly sharp view-dependent variation such as highlights. Note that the direction is per Gaussian (from the camera centre to the Gaussian's mean), not per pixel. The constants below are those of the reference implementation (inherited from Plenoxels and PlenOctrees):

The figure shows the 16 basis functions in exactly the order and sign convention of `sh_basis` below.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-sh-basis.svg" caption="The 16 real SH basis functions of `sh_basis`, painted on the sphere of directions (red positive, blue negative, each scaled to its own maximum; $z$ up, same viewpoint in every panel). $k$ is the index in the coefficient array: row $\ell$ holds $2\ell+1$ functions, and higher degrees oscillate faster, so they can represent sharper view-dependent effects." %}

```python
C0 = 0.28209479177387814
C1 = 0.4886025119029199
C2 = [1.0925484305920792, -1.0925484305920792, 0.31539156525252005,
      -1.0925484305920792, 0.5462742152960396]
C3 = [-0.5900435899266435, 2.890611442640554, -0.4570457994644658, 0.3731763325901154,
      -0.4570457994644658, 1.445305721320277, -0.5900435899266435]

def sh_basis(d, degree=3):
    """Real SH basis in the ordering/sign convention of the 3DGS code. d: (N, 3) unit vectors."""
    x, y, z = d[:, 0], d[:, 1], d[:, 2]
    out = [np.full_like(x, C0)]
    if degree > 0:
        out += [-C1 * y, C1 * z, -C1 * x]
    if degree > 1:
        xx, yy, zz, xy, yz, xz = x * x, y * y, z * z, x * y, y * z, x * z
        out += [C2[0] * xy, C2[1] * yz, C2[2] * (2 * zz - xx - yy), C2[3] * xz, C2[4] * (xx - yy)]
    if degree > 2:
        out += [C3[0] * y * (3 * xx - yy), C3[1] * xy * z, C3[2] * y * (4 * zz - xx - yy),
                C3[3] * z * (2 * zz - 3 * xx - 3 * yy), C3[4] * x * (4 * zz - xx - yy),
                C3[5] * z * (xx - yy), C3[6] * x * (xx - 3 * yy)]
    return np.stack(out, axis=-1)                   # (N, (degree + 1)^2)

def sh_to_rgb(sh, d, degree=3):
    """sh: (N, 16, 3) coefficients, d: (N, 3) unit view directions -> (N, 3) colours."""
    B = sh_basis(d, degree)                          # (N, K)
    rgb = np.einsum("nk,nkc->nc", B, sh[:, :B.shape[1]]) + 0.5
    return np.maximum(rgb, 0.0)
```

A good self-check: draw many random unit vectors and verify that $\frac{4\pi}{M}\sum_m B(\mathbf d_m)^\top B(\mathbf d_m) \approx I_{16}$ (orthonormality). The `ply` files written by 3DGS store the degree-0 coefficients as `f_dc_0..2` and the remaining 45 as `f_rest_0..44`, channel-major. To convert an RGB colour to a DC coefficient, use $k_{00} = (c - 0.5)/C_0$.

To see what each degree buys, the next figure fits SH of increasing degree (by least squares) to a colour with a sharp highlight, and evaluates `sh_to_rgb` for cameras placed around the Gaussian.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-sh-view.svg" caption="View-dependent colour of one Gaussian. Left: cameras on a circle around it, seen from above (the $y$ axis points into the page); each dot is the colour that camera sees with degree-3 SH, and grey arrows are view directions $\mathbf d$. Right: the target colour (top row) and least-squares SH fits of degree 0, 1 and 3, as a function of the camera azimuth φ. Degree 0 is one diffuse colour, degree 1 can only tilt it, and degree 3 starts to localize the highlight near φ ≈ 60°, though it is still blurrier than the target." %}

## 2. Projection: EWA splatting

To rasterize, each 3D Gaussian must become a 2D Gaussian on the image. If the camera map were affine, this would be exact: an affine image of a Gaussian is a Gaussian. Perspective projection is not affine, so 3DGS follows **EWA splatting** (Zwicker, Pfister, van Baar & Gross, IEEE TVCG 2002) and linearizes the projection around the Gaussian's mean.

Let $W$ be the world-to-camera rotation and $\mathbf t = W\boldsymbol\mu + \mathbf t_{cw}$ the mean in camera coordinates. The perspective map $\phi(\mathbf t) = (f_x t_x/t_z + c_x,\ f_y t_y/t_z + c_y)$ has Jacobian

$$
J = \frac{\partial \phi}{\partial \mathbf t} =
\begin{pmatrix}
\dfrac{f_x}{t_z} & 0 & -\dfrac{f_x t_x}{t_z^2} \\[8pt]
0 & \dfrac{f_y}{t_z} & -\dfrac{f_y t_y}{t_z^2}
\end{pmatrix},
$$

and the first-order Taylor expansion gives the **screen-space covariance**

$$
\Sigma' = J\, W\, \Sigma\, W^\top J^\top \in \mathbb R^{2\times 2},
$$

with the 2D mean $\boldsymbol\mu' = \phi(\mathbf t)$. (The paper writes this with a $3\times3$ Jacobian and then drops the third row and column; the $2\times3$ form is equivalent.) The approximation is excellent for small Gaussians and degrades for Gaussians that are large relative to their distance, which causes some of the artefacts that later work addresses with ray-tracing or exact projections.

The figure below checks this linearization on a concrete Gaussian with `project_gaussian` from section 2.2 (with `dilation=0`).

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-ewa.svg" caption="EWA projection, computed. Left: an OpenCV camera at the origin ($x$ right, $y$ down, $z$ forward), its image plane drawn at depth 1, and a Gaussian at depth 3 (1σ wireframe and samples). The cone of rays through the projected 1σ ellipse (orange) wraps around the ellipsoid. Right: 20,000 samples of the Gaussian projected exactly with the pinhole model (dots), and the 1σ, 2σ and 3σ ellipses of $\Sigma^{\prime} = JW\Sigma W^\top J^\top$ (orange). The dashed ellipse is the 3σ contour of the empirical covariance of the projected samples; the two agree within a few percent, and the remaining gap is the linearization error for a Gaussian this large relative to its depth." %}

### 2.1 The 0.3 low-pass filter

Before use, 3DGS adds a small isotropic term:

$$
\Sigma'_{\text{2D}} = \Sigma' + 0.3\, I.
$$

In EWA splatting, the screen-space footprint is convolved with a pixel reconstruction/low-pass filter so that a splat is never smaller than about a pixel, which avoids aliasing and holes when a Gaussian projects to a sub-pixel size. Adding $0.3 I$ is exactly that convolution with a Gaussian of variance 0.3 pixels². It is also a source of trouble: the dilation is in pixels, so a Gaussian that is optimized at one resolution looks too thin or too fat when rendered at another, the main observation behind Mip-Splatting (post 5).

The figure below shows both sides of the dilation numerically, using `screen_extent` and `gaussian_alpha` from the next section.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-lowpass.svg" localized="true" caption="Left: a Gaussian with σ = 0.25 px is sampled at pixel centres while its mean slides by sub-pixel amounts. Without the dilation the total alpha it deposits on the pixel grid flickers between under 0.1 and about 0.7, so a moving splat blinks (aliasing); with $\Sigma^{\prime} + 0.3I$ it stays constant. Right: the price. A Gaussian optimized at one resolution is drawn with footprint $\sqrt{s^2\sigma^2 + 0.3}$ at $s$ times that resolution, whereas the correct footprint is $s\sqrt{\sigma^2 + 0.3}$: small Gaussians become too thin when you zoom in and too fat when you zoom out." %}

### 2.2 Code: projection and per-pixel alpha

```python
def project_gaussian(mu, Sigma, Rcw, tcw, fx, fy, cx, cy, W, H, dilation=0.3):
    """EWA projection of one 3D Gaussian (OpenCV camera: x right, y down, z forward).
    Returns the 2D mean (pixels), the 2x2 screen-space covariance and the depth."""
    t = Rcw @ mu + tcw                             # camera-space mean
    # clamp the point to a slightly enlarged frustum before linearizing (as the official code does)
    lim_x, lim_y = 1.3 * (W / 2) / fx, 1.3 * (H / 2) / fy
    tx = np.clip(t[0] / t[2], -lim_x, lim_x) * t[2]
    ty = np.clip(t[1] / t[2], -lim_y, lim_y) * t[2]
    tz = t[2]
    J = np.array([[fx / tz, 0.0, -fx * tx / tz**2],  # Jacobian of the perspective map at t
                  [0.0, fy / tz, -fy * ty / tz**2]])
    T = J @ Rcw                                     # world -> screen linearization
    cov2d = T @ Sigma @ T.T + dilation * np.eye(2)  # low-pass: at least ~one pixel wide
    mean2d = np.array([fx * t[0] / tz + cx, fy * t[1] / tz + cy])
    return mean2d, cov2d, tz

def screen_extent(cov2d):
    """Conic (inverse covariance) and a 3-sigma radius in pixels, used to find covered tiles."""
    a, b, c = cov2d[0, 0], cov2d[0, 1], cov2d[1, 1]
    det = a * c - b * b
    conic = np.array([c, -b, a]) / det             # entries of Sigma'^{-1}: (A, B, C)
    mid = 0.5 * (a + c)
    lam_max = mid + np.sqrt(max(0.1, mid * mid - det))
    return conic, int(np.ceil(3.0 * np.sqrt(lam_max)))

def gaussian_alpha(pix, mean2d, conic, opacity):
    """alpha = o * exp(-0.5 d^T Sigma'^{-1} d), clamped like the reference rasterizer."""
    d = pix - mean2d
    power = -0.5 * (conic[0] * d[..., 0]**2 + conic[2] * d[..., 1]**2) - conic[1] * d[..., 0] * d[..., 1]
    alpha = np.minimum(0.99, opacity * np.exp(np.minimum(power, 0.0)))
    return np.where(alpha < 1.0 / 255.0, 0.0, alpha)
```

You can validate `project_gaussian` numerically: sample many points from $\mathcal N(\boldsymbol\mu, \Sigma)$, project them exactly with the pinhole model, and compare the empirical covariance of the 2D points to `cov2d` (with `dilation=0`). For a small Gaussian at depth 5 they agree to about three digits. The clamping of $t_x/t_z$ to $1.3\times$ the half field of view mirrors the reference CUDA code and prevents the Jacobian from exploding for Gaussians far outside the image.

The widget below runs exactly this projection (the same Jacobian with the 1.3× clamp and the same $0.3I$) for a Gaussian that you can rotate and scale, seen by a camera that you can orbit.

{% include widget.liquid name="neural-rendering-splat" height="480" caption="Drag the image to orbit the camera around the Gaussian, and drag the 3D view to turn it. The sliders set the three scales and the rotation (yaw, pitch and roll are combined into a quaternion and turned into $R$ with the formula of section 1.1). The readout shows the resulting $\Sigma^{\prime}$, the Jacobian $J$ and the 3σ radius; the orange ellipse is the 3σ contour and the dashed square is the box that decides which 16 × 16 tiles the splat touches (section 3.2). Make one scale tiny, look at the Gaussian edge-on, and switch off the low-pass: the splat collapses to a line thinner than a pixel." %}

## 3. Rasterization

### 3.1 Alpha blending

For a pixel $\mathbf p$, take the Gaussians that overlap it sorted by depth, front to back. Each contributes an opacity

$$
\alpha_i(\mathbf p) = o_i \exp\!\Big( -\tfrac12 (\mathbf p - \boldsymbol\mu'_i)^\top {\Sigma'_{\text{2D},i}}^{-1} (\mathbf p - \boldsymbol\mu'_i) \Big),
$$

and the colour is composited exactly as in NeRF's quadrature:

$$
C(\mathbf p) = \sum_{i=1}^{N_{\mathbf p}} \mathbf c_i\, \alpha_i \prod_{j=1}^{i-1} (1 - \alpha_j) = \sum_i \mathbf c_i\, \alpha_i\, T_i .
$$

The formula is identical; what changed is where the samples come from. NeRF samples points along a ray and evaluates a field; 3DGS takes the primitives that a pixel overlaps, in sorted order. This identity is why 3DGS can reuse NeRF's datasets, losses and metrics unchanged.

The reference rasterizer adds three numerical rules: $\alpha$ is clamped to at most 0.99; contributions with $\alpha < 1/255$ are skipped; and a pixel stops once $T$ would drop below $10^{-4}$ (**early termination**).

The figure computes this for three overlapping splats.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-blending.svg" caption="Front-to-back blending of three splats, computed with `gaussian_alpha` and the clamps above on a white background. Top: the composited image; the labels give each splat's depth, so $i$ is also its blending order. Bottom: along the dashed row, the weights $\alpha T$ of the three splats stacked on top of each other, plus the transmittance left over at the end, which lets the background through. At every pixel they sum to exactly 1, and where the green splat is in front it takes its share first and shrinks what the red and blue ones can contribute." %}

### 3.2 Tile-based sorting

A naive implementation would sort Gaussians per pixel, which is prohibitively expensive. 3DGS uses a tile-based software rasterizer written in CUDA:

1. **Preprocess** (one thread per Gaussian): frustum-cull Gaussians (near plane, and outside a guard band), compute $\boldsymbol\mu'$, $\Sigma'_{\text{2D}}$, the conic, the SH colour and the 3$\sigma$ radius, and count how many $16\times16$ **tiles** the radius overlaps.
2. **Duplicate with keys**: emit one entry per (Gaussian, tile) pair, with a 64-bit key whose high 32 bits are the tile index and low 32 bits the view-space depth (as a float bit pattern, which sorts correctly for positive numbers).
3. **One global radix sort** of all keys (GPU radix sort from CUB). After it, entries are grouped by tile and sorted by depth within each tile.
4. **Find ranges**: for each tile, the start and end of its entries in the sorted list.
5. **Blend** (one thread block per tile, one thread per pixel): threads cooperatively load batches of Gaussians into shared memory, and each pixel walks the list front to back accumulating colour and $T$ until it saturates.

Sorting per tile rather than per pixel is an approximation: within a tile, all pixels use the same depth order of Gaussian centres, which can cause "popping" when the order changes as the camera moves. Later work (e.g. StopThePop, Radl et al., SIGGRAPH 2024) sorts more accurately per pixel.

The figure shows this bookkeeping for five projected Gaussians.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-tiles.svg" caption="Tile assignment for five Gaussians projected with `project_gaussian` into a 128 × 80 image with 16 × 16 tiles. Solid ellipses are 3σ contours; each dashed square has half-width equal to the 3σ radius from `screen_extent` and decides which tiles (shaded) get an entry. The numbers in a tile are its list after the global sort, front to back (the depths are given at the top). The square is conservative: the elongated Gaussian 1 is listed in corner tiles it never reaches, and every pixel of a tile walks the same order, e.g. 1, 5, 2, 4." %}

### 3.3 Backward pass and gradients

Training needs $\partial \mathcal L / \partial$ every parameter. The backward pass of the blending stage visits the same per-tile lists **back to front**. Starting from the final transmittance $T_{N+1}$ (stored in the forward pass), it recovers each $T_i$ by division, $T_i = T_{i+1}/(1-\alpha_i)$, so no per-pixel list of intermediate values needs to be stored. With $C = \sum_i \mathbf c_i \alpha_i T_i$ and $B_i = \sum_{j>i} \mathbf c_j \alpha_j T_j / T_{i+1}$ the colour accumulated behind Gaussian $i$ (normalized),

$$
\frac{\partial C}{\partial \mathbf c_i} = \alpha_i T_i,
\qquad
\frac{\partial C}{\partial \alpha_i} = T_i\,\big(\mathbf c_i - B_i\big).
$$

Intuitively, making Gaussian $i$ more opaque adds its colour but hides what is behind it. From $\partial/\partial\alpha_i$ the chain rule flows to the opacity $o_i$, the conic and the 2D mean $\boldsymbol\mu'_i$, then through the EWA projection to $\Sigma$, $\mathbf q$, $\mathbf s$ and $\boldsymbol\mu$, and through SH evaluation to the coefficients (and to $\boldsymbol\mu$ via the view direction). The reference implementation writes all these derivatives by hand in CUDA; autograd frameworks (as in the code below) get them automatically, much more slowly.

### 3.4 A dense, differentiable splatting renderer in PyTorch

To make the method tangible, here is a complete differentiable renderer in about 40 lines. It skips tiles and evaluates every Gaussian at every pixel, which is fine for a $64\times64$ image and a few hundred Gaussians, and it sorts by depth once per image (the same approximation as above). It uses the same parameterization, EWA projection, 0.3 low-pass and blending, with plain RGB instead of SH to stay short.

```python
import math, torch, torch.nn.functional as F

def quat_to_rotmat_t(q):
    q = F.normalize(q, dim=-1)
    w, x, y, z = q.unbind(-1)
    return torch.stack([1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
                        2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
                        2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)], -1).view(-1, 3, 3)

def render(params, Rcw, tcw, fx, fy, W, H, bg=1.0):
    """Dense differentiable splatting (no tiles): every Gaussian is evaluated at every pixel.
    params: dict with means (N,3), quats (N,4), log_scales (N,3), opacity_logits (N,), rgb_logits (N,3)."""
    mu = params["means"]
    t = mu @ Rcw.T + tcw                                         # camera space (OpenCV)
    tz = t[:, 2].clamp(min=1e-3)
    J = torch.zeros(len(mu), 2, 3)
    J[:, 0, 0], J[:, 0, 2] = fx / tz, -fx * t[:, 0] / tz**2
    J[:, 1, 1], J[:, 1, 2] = fy / tz, -fy * t[:, 1] / tz**2
    M = quat_to_rotmat_t(params["quats"]) * torch.exp(params["log_scales"])[:, None, :]   # R S
    Sigma = M @ M.transpose(1, 2)
    T = J @ Rcw
    cov = T @ Sigma @ T.transpose(1, 2) + 0.3 * torch.eye(2)    # EWA + low-pass
    mean2d = torch.stack([fx * t[:, 0] / tz + W / 2, fy * t[:, 1] / tz + H / 2], -1)
    conic = torch.linalg.inv(cov)                                # (N, 2, 2)
    ys, xs = torch.meshgrid(torch.arange(H) + 0.5, torch.arange(W) + 0.5, indexing="ij")
    pix = torch.stack([xs, ys], -1).reshape(-1, 2)              # (P, 2)
    d = pix[None] - mean2d[:, None]                              # (N, P, 2)
    power = -0.5 * torch.einsum("npi,nij,npj->np", d, conic, d)
    alpha = (torch.sigmoid(params["opacity_logits"])[:, None] * torch.exp(power)).clamp(max=0.99)
    alpha = alpha * (t[:, 2:3] > 0.2)                            # cull Gaussians behind the camera
    order = torch.argsort(tz)                                    # front to back
    alpha, rgb = alpha[order], torch.sigmoid(params["rgb_logits"])[order]
    trans = torch.cumprod(torch.cat([torch.ones_like(alpha[:1]), 1 - alpha[:-1]], 0), 0)
    w = alpha * trans                                            # (N, P): w_i = T_i alpha_i
    img = w.T @ rgb + (1 - w.sum(0))[:, None] * bg
    return img.reshape(H, W, 3)
```

## 4. Losses

3DGS minimizes, per training image,

$$
\mathcal L = (1 - \lambda)\, \mathcal L_1 + \lambda\, \mathcal L_{\text{D-SSIM}},
\qquad \lambda = 0.2,
\qquad \mathcal L_{\text{D-SSIM}} = 1 - \operatorname{SSIM}(\hat I, I).
$$

The L1 term is robust to outliers and keeps colours accurate; the structural similarity term compares local means, variances and covariances in $11\times11$ Gaussian windows and is sensitive to blur and structure. Compared with NeRF's L2 loss this gives sharper results.

```python
def ssim(x, y, C1=0.01**2, C2=0.03**2):
    """SSIM with an 11x11 Gaussian window (sigma 1.5), images (H, W, 3) in [0, 1]."""
    g = torch.exp(-((torch.arange(11) - 5.0) ** 2) / (2 * 1.5**2)); g = g / g.sum()
    win = (g[:, None] * g[None, :]).expand(3, 1, 11, 11)
    x, y = x.permute(2, 0, 1)[None], y.permute(2, 0, 1)[None]
    f = lambda z: F.conv2d(z, win, padding=5, groups=3)
    mx, my = f(x), f(y)
    sxx, syy, sxy = f(x * x) - mx**2, f(y * y) - my**2, f(x * y) - mx * my
    s = ((2 * mx * my + C1) * (2 * sxy + C2)) / ((mx**2 + my**2 + C1) * (sxx + syy + C2))
    return s.mean()

def loss_fn(pred, gt, lam=0.2):
    return (1 - lam) * (pred - gt).abs().mean() + lam * (1 - ssim(pred, gt))
```

Now we can fit Gaussians to multi-view images. We create a random "ground-truth" set of 150 Gaussians, render it from five cameras, and optimize a second, randomly initialized set with Adam and per-parameter learning rates:

```python
torch.manual_seed(0)

def look_at_t(C, target=torch.zeros(3)):
    z = F.normalize(target - C, dim=0); x = F.normalize(torch.linalg.cross(torch.tensor([0., -1., 0.]), z), dim=0)
    R = torch.stack([x, torch.linalg.cross(z, x), z]); return R, -R @ C

def random_gaussians(n, spread):
    return {"means": (torch.rand(n, 3) - 0.5) * spread, "quats": torch.randn(n, 4),
            "log_scales": torch.full((n, 3), math.log(0.08)) + 0.3 * torch.randn(n, 3),
            "opacity_logits": torch.full((n,), 2.0), "rgb_logits": torch.randn(n, 3) * 2}

W = H = 64; fx = fy = 70.0
cams = [look_at_t(torch.tensor([3 * math.sin(a), -0.6, -3 * math.cos(a)])) for a in torch.linspace(-0.8, 0.8, 5)]
gt_scene = random_gaussians(150, 1.6)
with torch.no_grad():
    targets = [render(gt_scene, R, t, fx, fy, W, H) for R, t in cams]

model = {k: v.clone().requires_grad_(True) for k, v in random_gaussians(150, 1.6).items()}
model["opacity_logits"].data.fill_(-2.2)                       # sigmoid(-2.2) ~ 0.1, as in 3DGS
lrs = {"means": 1e-2, "quats": 1e-2, "log_scales": 5e-3, "opacity_logits": 5e-2, "rgb_logits": 2.5e-2}
opt = torch.optim.Adam([{"params": [model[k]], "lr": lr} for k, lr in lrs.items()], eps=1e-15)
for it in range(601):
    k = it % len(cams)
    pred = render(model, *cams[k], fx, fy, W, H)
    loss = loss_fn(pred, targets[k])
    opt.zero_grad(); loss.backward(); opt.step()
    if it % 150 == 0:
        with torch.no_grad():
            mse = torch.stack([((render(model, R, t, fx, fy, W, H) - g) ** 2).mean()
                               for (R, t), g in zip(cams, targets)]).mean()
        print(f"iter {it:4d}  loss {loss.item():.4f}  PSNR {-10 * torch.log10(mse).item():.1f} dB")
```

On a single CPU thread this runs in about a minute and the training-view PSNR climbs from 12.0 dB to 33.2 dB in 600 iterations (27.6 dB after 150). Without densification it can only move and reshape the 150 Gaussians it starts with; the real method also changes their number.

## 5. Initialization

3DGS starts from the **sparse SfM point cloud** that COLMAP produced while estimating the cameras (post 1): one Gaussian per point, with

- mean at the point and SH DC from the point's colour (higher-order SH zero);
- isotropic scale equal to the mean distance to its three nearest neighbours (stored as log);
- identity rotation and opacity 0.1.

Random initialization inside a bounding box also works for synthetic scenes but is noticeably worse on real, unbounded captures; good SfM points matter, especially in the background.

The figure shows the resulting initial scales for a toy point cloud.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-init.svg" caption="Initialization from SfM points, in a 2D slice for clarity: every point becomes an isotropic Gaussian whose radius is the mean distance to its three nearest neighbours (colour, log scale). Densely matched structures (the elliptical object, the wall at the top) start with small Gaussians, while isolated background points start with huge ones that the optimizer has to shrink, split or prune." %}

## 6. Adaptive density control

The initial points are too few and badly distributed. Every 100 iterations (after a 500-iteration warm-up and until iteration 15,000), 3DGS adapts the set of Gaussians using a simple signal: the magnitude of the gradient of the loss with respect to each Gaussian's **2D projected mean**, averaged over the views in which it was visible. A large view-space positional gradient means the optimizer is trying hard to move the Gaussian, which happens in regions that are not yet well reconstructed. For Gaussians whose average exceeds $\tau_{\text{pos}} = 0.0002$:

- **Clone** small Gaussians (largest scale below 1% of the scene extent): **under-reconstruction**, where a small Gaussian has to cover missing geometry. A copy is added; the optimizer then pulls the two apart along the gradient.
- **Split** large Gaussians: **over-reconstruction**, where one big Gaussian covers a region with high variance. It is replaced by two new Gaussians whose means are sampled from the original Gaussian as a PDF and whose scales are divided by $\phi = 1.6$.

At the same steps, **prune** Gaussians with opacity below $\epsilon_\alpha = 0.005$, and (after the first opacity reset) those that are very large in world space or in screen space.

Every 3000 iterations, the **opacity reset** sets all opacities to at most 0.01. Floaters close to the cameras tend to be kept alive by densification; after the reset, Gaussians that are genuinely needed quickly regain opacity, while the others stay transparent and are pruned. The scene "extent" used in these thresholds is computed from the radius of the camera centres.

The next three figures come from a real, if tiny, run of these rules (in `bin/figures/neural-rendering/neural-rendering_04.py`): 2D Gaussians fitted with NumPy to a 64 × 64 image with an L1 loss, Adam and analytic gradients that use the blending derivatives of section 3.3, densified every 100 iterations from iteration 200 to 900, with one opacity reset at iteration 700. The thresholds are scaled to the toy: clone when the largest scale is at most 2 px, and a gradient threshold of $6\times10^{-5}$ for this loss normalization.

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-adc-events.svg" localized="true" caption="Single densification steps of the toy run. Left: Gaussians with a large average positional gradient that are still small are cloned (orange, drawn at 2σ). Middle: large ones with a large gradient are split (dashed: the removed parent; solid: the two children, sampled from the parent and shrunk by 1.6). Right: after the opacity reset, Gaussians whose opacity stayed below 0.005 are pruned (red crosses). Thin grey ellipses are Gaussians left untouched." %}

A compact implementation operating on the parameter dictionary of section 3.4:

```python
def densify_and_prune(params, grad_accum, denom, extent, grad_thresh=2e-4,
                      percent_dense=0.01, min_opacity=0.005, n_split=2):
    """One adaptive density control step in the spirit of 3DGS.
    grad_accum: (N,) sum of view-space positional gradient norms; denom: (N,) number of views."""
    grads = grad_accum / denom.clamp(min=1)
    big_grad = grads >= grad_thresh
    max_scale = torch.exp(params["log_scales"]).max(-1).values
    clone = big_grad & (max_scale <= percent_dense * extent)    # under-reconstruction: copy
    split = big_grad & (max_scale > percent_dense * extent)     # over-reconstruction: split

    new = {k: [v.detach()] for k, v in params.items()}
    for k, v in params.items():                                  # clones are exact copies
        new[k].append(v.detach()[clone])
    # splits: sample n_split new means from the parent Gaussian, shrink scales by 1.6
    std = torch.exp(params["log_scales"].detach()[split]).repeat(n_split, 1)
    R = quat_to_rotmat_t(params["quats"].detach()[split]).repeat(n_split, 1, 1)
    offset = (R @ (torch.randn_like(std) * std)[..., None]).squeeze(-1)
    for k, v in params.items():
        child = v.detach()[split].repeat(n_split, *[1] * (v.dim() - 1))
        if k == "means":
            child = child + offset
        elif k == "log_scales":
            child = child - math.log(1.6)
        new[k].append(child)
    keep_parent = torch.cat([~split, torch.ones(int(clone.sum()) + n_split * int(split.sum()), dtype=torch.bool)])
    out = {k: torch.cat(v)[keep_parent] for k, v in new.items()}  # parents of splits are removed
    alive = torch.sigmoid(out["opacity_logits"]) > min_opacity   # prune transparent Gaussians
    return {k: v[alive].clone().requires_grad_(True) for k, v in out.items()}

def reset_opacity(params, value=0.01):
    """Every 3000 iterations: clamp opacities down so that floaters must 'earn' their opacity back."""
    with torch.no_grad():
        cap = torch.logit(torch.tensor(value))
        params["opacity_logits"].copy_(torch.minimum(params["opacity_logits"], cap))
```

Two practical details: the view-space gradient is read from the 2D means after `loss.backward()` (in the official code by calling `retain_grad()` on a dummy tensor that holds the screen-space means), and after every densification the optimizer state (Adam moments) must be extended for new Gaussians and filtered for removed ones; the reference code does this by editing the optimizer's state tensors in place. The threshold-based densification is a heuristic, and several later works replace it, e.g. by treating Gaussians as MCMC samples (3DGS-MCMC, NeurIPS 2024) with a fixed budget.

Over the whole toy run, Gaussians multiply where the image has detail, and quality follows:

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-adc-progress.svg" caption="The toy run from random initialization (40 isotropic Gaussians with opacity 0.1) to the end. Top: the rendered image and its PSNR. Bottom: the Gaussians themselves, each drawn as its 1σ ellipse filled with its colour and opacity. Densification concentrates many small Gaussians along the thin line and the ring, while flat regions keep a few large ones." %}

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-adc-curve.svg" localized="true" caption="PSNR (purple) and number of Gaussians (orange steps) during the toy run. Each dotted line is a densification step, after which the PSNR briefly dips while the new Gaussians settle. The opacity reset at iteration 700 makes the image almost transparent for a moment; Gaussians that are needed regain their opacity within a few dozen iterations, and the ones that do not are pruned at the next step." %}

## 7. The training recipe

Putting it together, the reference implementation trains for **30,000 iterations** with batch size one (one random training image per iteration):

| Ingredient | Setting in the reference code |
| --- | --- |
| Optimizer | Adam, separate learning rate per parameter group |
| Position lr | $1.6\times10^{-4}$ times the scene extent, exponentially decayed to $1.6\times10^{-6}$ over 30k iterations |
| Other lrs | SH DC $2.5\times10^{-3}$ (higher orders $/20$), opacity $0.05$ (later versions lower it), scale $5\times10^{-3}$, rotation $10^{-3}$ |
| SH schedule | start with degree 0, add one degree every 1000 iterations up to 3 |
| Densification | every 100 iterations from 500 to 15,000; opacity reset every 3000 |
| Loss | $0.8\,\mathcal L_1 + 0.2\,\mathcal L_{\text{D-SSIM}}$ |
| Background | black or white (random background is an option for synthetic data) |

The SH schedule matters: if view-dependent coefficients are free from the start, the model can explain geometry errors by "painting" them into view-dependent colour, which looks right from training views and wrong elsewhere. The paper also reports a 7,000-iteration setting that already gives good quality in a few minutes, and the full 30k run takes tens of minutes on a single high-end GPU. The result is typically one to several million Gaussians.

On the standard benchmarks (Mip-NeRF 360, Tanks and Temples, Deep Blending), the paper reports quality on par with or better than Mip-NeRF 360, with training times comparable to the fastest grid methods of post 3, and real-time rendering at 1080p. Its main weaknesses, which the next post surveys, are memory, aliasing when the rendering resolution differs from training, geometry that is good enough for images but not accurate surfaces, popping from approximate sorting, and the need for good SfM.

## 8. Try it: the Gaussian World demo

The home page [interactive lab]({{ '/' | relative_url }}#lab) has a tab called **Gaussian World**: an editable open world made of about two hundred thousand 3D Gaussians, running in WebGL 2 without dependencies. It implements the *rendering half* of this post:

- each Gaussian has a centre, a rotation frame, three scales, a colour and an opacity, and its 3D covariance is projected to a screen-space ellipse through the Jacobian of the perspective map (section 2), with the same $0.3$ dilation added to the 2D covariance in the vertex shader;
- the splats are depth-sorted every frame (a 16-bit counting sort in a Web Worker rather than a tile-based radix sort) and alpha-composited back to front, which with premultiplied alpha is mathematically the same as the front-to-back sum of section 3.1;
- the debug views ("Ellipsoids", "Centers", "Overdraw", "Depth") let you see the individual Gaussians, their centres, how many splats overlap each pixel and the depth, much like the official SIBR viewer's ellipsoid mode.

It differs from 3DGS in an important way: **nothing in it is trained.** The Gaussians are generated procedurally from a text prompt by a keyword-driven generator (terrain, lakes, trees, villages, weather), standing in for a learned text-to-world model. And instead of baked spherical-harmonic radiance, each Gaussian carries an albedo and a normal and is **relit** on the GPU for any time of day, with sun shadows from a splatted shadow map, wind animation and seasons. Terrain Gaussians re-derive their height, normal and material from an editable heightfield every frame, so you can sculpt and paint the world. A captured 3DGS scene cannot do any of this without the relighting and editing research of post 5: its colours have the capture's lighting baked in.

Use the demo to build intuition: zoom in until individual ellipses become visible, look at how elongated Gaussians align with surfaces, and notice how sorting order changes cause occasional popping, the same artefact discussed in section 3.2.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Surface Splatting (Zwicker, Pfister, van Baar & Gross) | SIGGRAPH | 2001 | — | Point-based rendering with elliptical Gaussian splats |
| EWA Splatting (Zwicker, Pfister, van Baar & Gross) | IEEE TVCG | 2002 | [DOI](https://doi.org/10.1109/TVCG.2002.1021576) | Projection of Gaussian kernels with a low-pass filter |
| Plenoxels: Radiance Fields without Neural Networks (Fridovich-Keil, Yu et al.) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2112.05131) | SH colour and explicit optimization, a direct precursor |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al.) | ACM TOG 42(4) / SIGGRAPH | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) · [DOI](https://doi.org/10.1145/3592433) | The method of this post |
| gsplat: An Open-Source Library for Gaussian Splatting (Ye et al.) | arXiv | 2024 | [arXiv](https://arxiv.org/abs/2409.06765) | Modular CUDA rasterizer used by nerfstudio |
| 3D Gaussian Splatting as Markov Chain Monte Carlo (Kheradmand et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2404.09591) | Principled replacement for clone/split heuristics |
| 3D Gaussian Ray Tracing: Fast Tracing of Particle Scenes (Moenne-Loccoz et al.) | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2407.07090) | Ray-traced Gaussians: distorted cameras, secondary rays |

## Learning resources

- The official [project page](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) and [code](https://github.com/graphdeco-inria/gaussian-splatting) (PyTorch training, CUDA rasterizer in `diff-gaussian-rasterization`, SIBR viewer). Reading `gaussian_model.py`, `train.py` and `forward.cu` / `backward.cu` side by side with this post is the best way to learn the details.
- [gsplat](https://github.com/nerfstudio-project/gsplat) and its documentation, which includes a derivation of the gradients and clean Python reference implementations.
- [nerfstudio splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html), a well-documented reimplementation.
- M. Zwicker et al., "EWA Splatting" (2002), sections on the resampling filter, for the theory behind section 2.

## Exercises

1. Prove that $\Sigma = R S S^\top R^\top$ is positive semi-definite and that its eigenvectors are the columns of $R$.
2. Derive $J$ by differentiating $u = f_x t_x / t_z$ and $v = f_y t_y/t_z$, and verify `project_gaussian` against finite differences.
3. In the PyTorch renderer, change the dilation from 0.3 to 0 and train at $64\times64$; then render at $256\times256$ (scale $f_x, f_y$ by 4). What do you see, and how does a dilation of 0.3 change it?
4. Add degree-1 SH to the renderer: store `sh` of shape `(N, 4, 3)` and evaluate it with the view direction from the camera centre to each mean. Train with the SH schedule of section 7.
5. Integrate `densify_and_prune` into the training loop: accumulate `mean2d.grad.norm(dim=-1)` (call `mean2d.retain_grad()`), densify every 100 iterations, recreate the optimizer, and compare the final PSNR with the fixed-count version.

**Next:** [post 5]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}) surveys what happened after 3DGS: anti-aliasing, surfaces, dynamics, compression, SLAM, feed-forward models, generation, relighting, physics and AR/VR.
