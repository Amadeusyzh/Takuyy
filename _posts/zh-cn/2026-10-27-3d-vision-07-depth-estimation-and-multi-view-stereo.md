---
layout: post
title: "深度估计与多视图立体：传感器、平面扫描、PatchMatch、学习式 MVS 与单目深度"
date: 2026-10-27 11:07:00+0900
description: "从带位姿的图像到稠密深度：深度、距离与视差，立体相机、结构光、飞行时间（ToF）与 LiDAR 传感器，带代价体的平面扫描立体，带倾斜平面的 PatchMatch 多视图立体，MVSNet 与 soft-argmin，从 MiDaS 到 Depth Anything 再到度量深度模型的单目深度，以及 TSDF 深度融合；每一步都配有 NumPy 代码。"
categories: 3d-vision
tags: [depth-estimation, multi-view-stereo, plane-sweep, patchmatch, mvsnet, monocular-depth, tsdf, time-of-flight, structured-light]
series: 3d-vision
series_order: 7
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

读完[第 5 篇]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})，我们已经能从一堆照片中恢复出每台相机（$K$、$R$、$\mathbf t$）以及一片稀疏点云，每条特征轨迹对应一个点。[第 6 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})则实时地做同样的事。但几千个点并不是一个表面：机器人无法在上面规划抓取，AR 头显无法用它把虚拟物体藏到真实物体后面，3D 美术也无法把它变成网格。本篇填补"相机已知"与"形状已知"之间的空白。它对**每个像素**都问同一个问题：这个像素看到的表面离相机有多远？

回答这个问题有三条路，我们会逐一实现：

1. 用主动传感器**直接测量**：结构光投影仪、飞行时间（time-of-flight，ToF）相机或 LiDAR。
2. 从多幅带位姿的图像**稠密三角化**：平面扫描立体（plane-sweep stereo）、PatchMatch 多视图立体（multi-view stereo，MVS）以及它们的学习式版本，例如 MVSNet。
3. 用见过数百万场景的网络**从单幅图像猜测**：单目深度（MiDaS、Depth Anything、度量深度模型）。

最后，来自许多视点的许多深度图会被**截断有符号距离函数**（truncated signed distance function，TSDF）融合成一个一致的模型。后面的所有主题都建立在这一步之上：[第 8 篇]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})的三维表示、[第 9 篇]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})的重建流程、训练 NeRF 和 3D Gaussian Splatting 时用的深度先验，以及[第 10 篇]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }})中 AR 头显的场景网格。

[神经渲染第 1 篇]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})用一段话介绍了多视图立体。本篇把它完整展开，并在一个带精确真值的合成场景上运行每个算法，让每个结论都有数字支撑。

## 前置知识

- [第 1 篇]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})的针孔相机 $\tilde{\mathbf x} \sim K(R\mathbf X + \mathbf t)$、齐次坐标和 OpenCV 相机坐标系（x 向右、y 向下、z 向前）。
- [第 2 篇]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})中的单应以及标定板诱导的平面单应。
- [第 3 篇]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})中的图像块相似度与孔径问题。
- [第 4 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})的极线几何、校正立体、视差和半全局匹配。用到的部分我们会简要回顾。
- 第 5、6 节需要基础的深度学习知识（CNN、softmax、回归损失）。

**记号。** 与前几篇相同，世界点 $\mathbf X$ 映射到相机坐标 $\mathbf X\_c = R\mathbf X + \mathbf t$，再映射到像素 $\tilde{\mathbf x} \sim K\mathbf X\_c$，其中 $\tilde{\mathbf x} = (x, y, 1)^\top$。我们把一幅图像称为**参考视图**（reference view，下标 r），并计算它的深度图；其余图像是**源视图**（source view，下标 s）。$z$ 表示深度（$\mathbf X\_c$ 的第三个坐标），$w = 1/z$ 表示逆深度，$D$ 是深度假设的个数，$\mathbf n$ 是平面法向，$d$ 是平面的偏移量。

## 1. 深度图是什么

### 1.1 深度、距离、视差与逆深度

**深度图**（depth map）为每个像素存储一个数。常用的有三种不同的数，把它们混淆是一个经典错误。

- **z 深度** $z$：三维点沿光轴方向的坐标。OpenCV、COLMAP、大多数数据集和大多数网络存的都是它。
- **距离**（range）$\rho$：从相机中心沿像素射线到该点的欧氏距离。LiDAR 和部分 ToF 相机输出的是距离。
- **视差**（disparity）$\delta$：对焦距为 $f$、基线为 $B$ 的校正立体对，水平像素偏移 $\delta = fB/z$。它与**逆深度** $w = 1/z$ 成正比。

反投影把 z 深度图变成三维点。像素 $\tilde{\mathbf x}$ 的射线是 $\mathbf r = K^{-1}\tilde{\mathbf x}$，由于 $K^{-1}$ 把 $(x, y, 1)$ 映射为第三个分量为 1 的向量，深度为 $z$ 的点就是

$$
\mathbf X_c = z\,K^{-1}\tilde{\mathbf x}, \qquad \rho = \lVert \mathbf X_c \rVert = z\,\lVert K^{-1}\tilde{\mathbf x} \rVert .
$$

因子 $\lVert K^{-1}\tilde{\mathbf x}\rVert = \sqrt{1 + ((x - c\_x)/f\_x)^2 + ((y - c\_y)/f\_y)^2}$ 在主点处为 1，向图像角落逐渐增大。在我们的测试相机（$160 \times 120$ 像素，$f = 150$）中，角点像素的这个因子是 $\sqrt{1 + (79.5/150)^2 + (59.5/150)^2} = 1.1993$：距离与 z 深度相差 20%。把距离图当成 z 深度用，每个平面都会弯成一个碗。

这段代码用到 1.2 节的测试场景（`K`、`Z_gt`、`R_ref`、`t_ref`）；若想按顺序运行本文的代码，请先运行 1.2 节的场景代码块。

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

输出：`pixel (0, 0): z = 6.119 m, range = 7.339 m, ratio 1.1993`，`pixel (80, 60): z = 6.663 m, range = 6.664 m`（在主点 $(79.5, 59.5)$ 旁边两者一致），以及 `lowest floor point: world y = 1.200 m`：反投影得到的点正好落在地面上，这是检查坐标约定的好办法。

### 1.2 测试场景

本篇的所有算法都在同一个合成场景上运行，场景由一个小型 NumPy 光线投射器渲染。一台相机位于带纹理的地面上方 1.8 m 处，看着 6.5 m 外的一面带纹理的墙；前方立着一个盒子和一个球。墙上故意放了两块难区域：一张完全没有纹理的**灰色海报**，以及一块周期为 0.3 m 的**竖条纹**。所有表面都是朗伯（Lambertian）表面（从任何方向看都一样），因此立体匹配的"光度一致性"假设严格成立；每幅图像加入 $\sigma = 0.01$ 的高斯噪声。

参考相机（$160 \times 120$ 像素，$f = 150$ px，水平视场约 56°）看到的深度从 2.93 m 到 6.73 m。四台源相机围绕它摆放，都看向同一点：右侧 0.40 m、左侧 0.25 m、上方 0.30 m 和下方 0.28 m（另有少量横向偏移）。代码较长但很直白；想自己运行本篇的话可以展开查看。

<details markdown="1"><summary>场景与渲染器（NumPy）</summary>

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

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-depth-and-points.svg" caption="测试场景。(a) 参考图像：带纹理的地面、盒子、球和墙；左上是条纹，右上是平坦的海报。(b) 它的真值 z 深度，从 2.93 m（黄色，地面最下方几行）到 6.73 m（深色，墙的角落）。(c) 用 $\mathbf X = R^\top(z K^{-1}\tilde{\mathbf x} - \mathbf t)$ 反投影后从另一个角度观察的深度图；紫色视锥是参考相机。盒子和球后面的空楔形区域是这台相机看不到的部分。深度图是 2.5D 表示：每个像素只有一个表面，背后什么都没有。" %}

这张图提醒我们一件容易忘记的事：单个视点的深度图是 **2.5D** 的。从别处看，凡是被遮挡的地方都是空洞。填补这些空洞需要更多视图，这正是第 7 节要融合深度图的原因。

### 1.3 为什么逆深度是自然的变量

立体测量的是像素偏移，而像素偏移与逆深度成正比：$\delta = fB\,w$。对 $z = fB/\delta$ 求导，得到视差误差 $\sigma\_\delta$ 引起的一阶深度误差：

$$
\sigma_z = \left\lvert \frac{\partial z}{\partial \delta} \right\rvert \sigma_\delta = \frac{fB}{\delta^2}\,\sigma_\delta = \frac{z^2}{fB}\,\sigma_\delta .
$$

深度误差随距离的**平方**增长，而 $w$ 的误差是常数 $\sigma\_\delta/(fB)$。由此得到三个结论，下文都会再次出现：

- **在 $w$ 上均匀采样假设**，而不是在 $z$ 上：$w$ 的等步长就是沿极线的等像素步长。
- **报告相对误差**，例如 $\lvert \hat z - z^\ast\rvert / z^\ast$：5 cm 的绝对误差在 10 m 处极好，在 50 cm 处却很差。
- **在学习中回归逆深度**（或视差）：它的误差更接近同方差，无穷远点也得到有限值 $w = 0$。出于同样的原因，SLAM 系统也使用这种参数化（[第 6 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})）。

## 2. 深度传感器

在从图像计算深度之前，先看看硬件如何测量深度。每种深度传感器都属于两类之一：**三角化**类设备（两个视点，和立体一样）或**飞行时间**设备（一个时钟）。本节末尾的图给出了每种传感器的数字。

### 2.1 被动立体

两台标定好的相机经过校正，使极线成为图像行（[第 4 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})），就得到 $z = fB/\delta$。上面的误差公式告诉我们如何设计一套立体相机：

```python
def stereo_depth_sigma(Z, f, B, sigma_d):
    """First-order depth noise of a rectified stereo pair: Z = f B / d -> dZ = Z^2 / (f B) dd."""
    return Z ** 2 / (f * B) * sigma_d


for B in (0.05, 0.12):
    print("B = %.2f m:" % B, ", ".join("Z = %g m -> %.1f cm" % (Z, 100 * stereo_depth_sigma(Z, 600, B, 0.2))
                                       for Z in (1, 2, 5)))
```

取 $f = 600$ px、匹配精度 0.2 px，5 cm 基线在 1、2、5 m 处的误差为 `0.7 cm, 2.7 cm, 16.7 cm`，12 cm 基线为 `0.3 cm, 1.1 cm, 6.9 cm`。基线加宽带来线性的改善，距离却带来平方的恶化。宽基线的代价是更多遮挡和视图之间更大的外观差异，这会让匹配更困难。

被动立体可以在室外、阳光下和远距离工作，只需要两台相机。它恰恰在匹配失败的地方失败：无纹理的墙、重复图案、反光和黑暗。主动传感器通过自带光源来解决这个问题。

### 2.2 结构光与主动立体

把立体对中的一台相机换成**投影仪**。投影仪是一台"反向相机"：它和相机一样有内参和位姿，只是光线向外射出而不是射入。如果知道是投影仪的哪一列 $u\_p$ 照亮了某个相机像素，那么这个像素的射线与投影仪第 $u\_p$ 列对应的平面就交于一个三维点。这就是三角化，只不过由投影图案来解决对应问题，而这个问题在无纹理表面上是被动立体无法解决的。

如何用光来编码"哪一列"？主流方法有三类：

- **单帧伪随机图案。** 固定的红外点阵（散斑）让每个小窗口都有独特的纹理，于是普通的块匹配在白墙上也能工作。第一代 Kinect 就是这样工作的；许多"主动立体"模组也在被动立体对上加装这样一个投影仪：图案提供纹理，两台相机完成立体匹配。
- **二值（格雷码）图案。** 投射 $\lceil \log\_2 N \rceil$ 幅黑白条纹图像；某个像素上观察到的亮/暗序列就是它所在列的二进制编码。格雷码（Gray code）相邻列之间只有一位不同，因此在条纹边界处读错一位最多只错一列。
- **相移**（phase shifting）。多次投射正弦条纹图案，每次平移已知的相位。每个像素看到 $I\_k = A + B\cos(\varphi + \delta\_k)$，其中 $A$ 是环境光加偏置，$B$ 是调制幅度，$\varphi$ 是编码投影仪列号的未知相位。取三次相移 $\delta = -2\pi/3, 0, +2\pi/3$：

$$
I_1 - I_3 = \sqrt 3\,B\sin\varphi, \qquad 2I_2 - I_1 - I_3 = 3B\cos\varphi
\quad\Longrightarrow\quad
\varphi = \operatorname{atan2}\!\big(\sqrt 3\,(I_1 - I_3),\; 2I_2 - I_1 - I_3\big).
$$

（用和角公式展开 $\cos(\varphi \pm 2\pi/3)$ 即可验证这两个恒等式。）环境光 $A$ 和包含在 $B$ 中的表面反射率都被消掉了：相位逐像素测得，精度达亚像素，而且不需要匹配窗口。

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

输出：`decoded phase 1.9635 rad -> column 5.00 + k * 16`。相位只在模 $2\pi$ 意义下已知：第 37 列与第 5、21、53 列看起来完全一样。这种**相位模糊**要靠把相移与粗粒度的格雷码结合（格雷码给出 $k$），或者再投射一组周期更长的条纹来消除。工业三维扫描仪就是这样工作的，DTU MVS 基准的参考扫描也是用结构光扫描仪采集的。

结构光在近距离精度极高，但它要与环境光竞争：阳光会淹没红外图案，所以这类传感器主要用于室内。

### 2.3 飞行时间

**飞行时间**（ToF）传感器测量光到达表面再返回所需的时间：$d = c\,\Delta t/2$。光非常快：1 mm 的深度对应 $2 \times 0.001/c = 6.7$ ps 的往返时间。有两种设计能测出它。

- **直接 ToF（dToF）** 用单光子雪崩二极管（SPAD）对单个激光脉冲计时，并统计到达时间的直方图。大多数 LiDAR，以及部分手机和平板内置的 LiDAR 传感器，都是 dToF。
- **间接 ToF（iToF，也称 AMCW，即幅度调制连续波）** 以频率 $f$（几十 MHz）调制照明，并把返回波与四个平移后的参考信号做相关，来测量返回波的**相位延迟** $\varphi = 4\pi f d / c$。四个相关采样为 $Q\_k = B + A\cos(\varphi - k\pi/2)$，于是

$$
\varphi = \operatorname{atan2}(Q_1 - Q_3,\; Q_0 - Q_2), \qquad A = \tfrac12\sqrt{(Q_1 - Q_3)^2 + (Q_0 - Q_2)^2}, \qquad d = \frac{c\,\varphi}{4\pi f}.
$$

和相移一样，偏置 $B$（环境光）被消掉了。（注意字母：这里沿用 iToF 的惯例，$A$ 是幅度、$B$ 是偏置，与上面相移公式中的含义正好相反；这里的 $B$ 也不是立体的基线。）幅度 $A$ 是一个免费的置信度：暗的或远的表面返回的光少，相位噪声就大。

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

相位每隔 $c/(2f)$ 就会卷绕：80 MHz 和 100 MHz 下的 `unambiguous ranges: 1.874 m and 1.499 m`。5.3 m 处的表面分别表现为 `1.5526 m` 和 `0.8031 m`。单独看哪个都没用，但在 7.49 m 以内只有一个距离同时与两者一致，搜索得到 `unwrapped: 5.3000 m`。组合后的无模糊距离是 $c/(2\gcd(f\_1, f\_2)) = c/(2 \cdot 20\ \text{MHz}) = 7.49$ m。频率越高相位分辨率越细，频率越低量程越长；真实的 iToF 相机会组合两到三个频率。

ToF 有自己的失效模式。**多径**（光在返回前先在第二个表面反弹，例如房间墙角）会叠加一个延迟的副本，使相位产生偏差。**飞点**（flying pixels）出现在深度边缘，前景和背景的光混在一起，落在两者之间。四次采样之间的运动也会破坏相位。

### 2.4 LiDAR

**LiDAR** 是一种扫描式的 dToF 测距仪：旋转多线、MEMS 微镜、光学相控阵，或一次照亮整个场景的 flash LiDAR。它沿已知的光束方向报告**距离**，而不是每个图像像素的 z 深度，在几十到几百米范围内精度可达厘米级。FMCW LiDAR 不对脉冲计时，而是对激光频率做啁啾调制，还能通过多普勒频移测出径向速度。

有两点把 LiDAR 和本系列联系起来。第一，要把 LiDAR 与相机一起使用，需用 LiDAR-相机外参把点变换到相机坐标系，再用 $K$ 投影（[第 1 篇]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})）；结果是一张**稀疏**深度图，往往只有百分之几的像素有值。**深度补全**（depth completion）网络在图像引导下把它变稠密。第二，两种传感器之间的外参标定是[第 2 篇]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})意义上的标定问题，通常用两者都能看到的标定物来解决。

### 2.5 传感器对比

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-sensors.svg" localized="true" caption="(a) $f=600$ px、$\sigma_d = 0.2$ px 时的立体深度噪声 $\sigma_Z = Z^2\sigma_d/(fB)$：即代码中的数字（$B = 5$ cm 时 2 m 和 5 m 处为 2.7 cm 和 16.7 cm；$B = 12$ cm 时为 1.1 cm 和 6.9 cm）。(b) 间接 ToF：解码距离每隔 $c/(2f)$ 卷绕一次，80 MHz（橙）为 1.874 m，100 MHz（蓝）为 1.499 m；虚线是真值。在 $d = 5.3$ m（点线）处，两个卷绕值 1.55 m 和 0.80 m 在 7.49 m 以内只与一个距离一致。(c) 相移：沿投影仪列的三幅条纹图像 $I_k$（上）和解码出的卷绕相位（下），是周期 16 px 的锯齿波；圆点是第 37 列，解码为 5 + 2 x 16。" %}

| 传感器 | 原理 | 典型优点 | 典型失效模式 |
| --- | --- | --- | --- |
| 被动立体 | 三角化，两台相机 | 室外，宽基线可测远，便宜 | 无纹理和重复表面、黑暗；误差 $\propto z^2$ |
| 主动立体 / 结构光 | 三角化，投影仪 + 相机 | 无纹理表面，稠密，近距离精确 | 阳光、反光或深色表面，量程受投影功率限制 |
| 间接 ToF | 调制光的相位 | 稠密、紧凑、计算量小 | 多径、飞点、相位卷绕、阳光 |
| 直接 ToF / LiDAR | 脉冲计时 | 量程远，精度几乎与距离无关，黑暗中可用 | 稀疏，昂贵（扫描），雨雾，黑色或镜面表面 |

没有完美的传感器，而它们的输出都是同一种东西：带噪声、空洞和外点的深度图。第 7 节介绍如何融合这样的深度图。在此之前，我们先从普通图像计算深度。

## 3. 平面扫描立体与代价体

### 3.1 思路：让一个平面扫过场景

校正的双视图立体（[第 4 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})）沿图像行搜索。当视图多于两个，或者视图没有校正时，并不存在一个统一的校正。**平面扫描**（Collins，1996）以一种适用于任意数量标定视图的方式推广了这种搜索：

1. 在参考相机前方选一族平面，通常是**正对相机**（fronto-parallel）的平面 $z = z\_i$，$i = 1, \dots, D$。
2. 对每个平面，假设整个场景都位于该平面上，把每幅源图像**变换**（warp）到参考视图。
3. 在小窗口内逐像素比较每幅变换后的图像与参考图像。场景真正位于（或接近）该平面的地方，变换图像与参考图像一致；其他地方则不一致。
4. 比较结果构成**代价体**（cost volume）$C(x, y, i)$。对每个像素，代价最低的平面就是它的深度。

第一张图展示了一个像素的几何。假设 $z\_i$ 是沿像素射线的一系列点；每个点都投影到源视图中该像素的**极线**上的某处。扫描平面就是沿极线搜索，与校正立体完全相同，只是用三维的方式表达。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-sweep-geometry.svg" localized="true" caption="球上像素 $(120, 60)$ 的平面扫描几何。(a) 参考相机坐标系的俯视图（$y = 60$ 这一行，灰色：该行的真实表面点）。64 个平面 $z = 1/w_i$ 中每隔两个画一个（颜色从近处的紫色到远处的黄色）；假设是黑色射线上的圆点，彩色线把它们连到源相机 $\mathbf C_1$。红星是真实的表面点。由于平面在 $1/z$ 上均匀分布，它们在相机附近更密。(b) 同一组假设经平面诱导单应 $H_i\tilde{\mathbf x}$ 投影到源视图 1：它们落在极线上，而且间距均匀，最近到最远的平面相距 17.1 px，相邻间隔 0.27 px。" %}

### 3.2 平面诱导的单应

如何"假设场景位于平面上"进行变换？在参考相机坐标中把平面写成 $\mathbf n^\top\mathbf X = d$（单位法向 $\mathbf n$，偏移 $d > 0$）。设 $(R, \mathbf t)$ 把参考坐标映射到源坐标：$\mathbf X\_s = R\mathbf X + \mathbf t$。若两台相机的世界到相机位姿分别为 $(R\_r, \mathbf t\_r)$ 和 $(R\_s, \mathbf t\_s)$，则

$$
R = R_s R_r^\top, \qquad \mathbf t = \mathbf t_s - R\,\mathbf t_r .
$$

对平面上的点有 $\mathbf n^\top\mathbf X / d = 1$，因此可以把 $\mathbf t$ 乘上这个因子而不改变任何东西：

$$
\mathbf X_s = R\mathbf X + \mathbf t\,\frac{\mathbf n^\top\mathbf X}{d} = \Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)\mathbf X .
$$

现在从 $\mathbf X$ 到 $\mathbf X\_s$ 的映射是线性的。代入 $\mathbf X = z K\_r^{-1}\tilde{\mathbf x}\_r$ 和 $\tilde{\mathbf x}\_s \sim K\_s\mathbf X\_s$，未知的 $z$ 只是一个尺度因子，齐次坐标会忽略它：

$$
\tilde{\mathbf x}_s \sim H\,\tilde{\mathbf x}_r, \qquad H = K_s\Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)K_r^{-1} .
$$

这正是第 2 篇中用于标定相机的平面到图像单应，只是现在作用于两幅图像之间。（有些文献把平面写成 $\mathbf n^\top\mathbf X + d = 0$，得到 $R - \mathbf t\mathbf n^\top/d$，神经渲染第 1 篇就是如此；这是同一个公式，只是 $d$ 的符号相反。）对于正对相机的平面，$\mathbf n = (0, 0, 1)^\top$，$d = z\_i$。

**验算：校正立体。** 把源相机放在右侧 $B$ 处，朝向相同：$R = I$，$\mathbf t = (-B, 0, 0)^\top$，$K\_s = K\_r = K$。于是 $R + \mathbf t\mathbf n^\top/z = I - (B/z)\,\mathbf e\_x\mathbf e\_z^\top$，对 $\tilde{\mathbf x} = (x, y, 1)^\top$，单应给出 $x\_s = x - fB/z$、$y\_s = y$：一个大小为视差 $\delta = fB/z$ 的水平平移。平面扫描把校正立体作为特例包含在内。

### 3.3 如何采样深度假设

上图已经给出了答案。在**逆深度** $w\_i$ 上均匀分布的平面会在极线上产生等间距的点，因为像素偏移是 $w$ 的仿射函数（校正情形下严格成立，其他情形近似成立）。在 $z$ 上均匀采样会把大多数平面浪费在远处（那里相邻平面相距不到一个像素），而在相机附近留下空隙。我们的扫描在 $z = 2.5$ m 到 $8$ m 之间使用 $D = 64$ 个在 $w$ 上均匀的平面；对图中球上的像素，它们在源视图 1 中跨越 17.1 px，相邻间隔 0.27 px。间隔取像素的几分之一正是我们想要的：更粗会跳过真正的匹配，更细只会浪费时间。

### 3.4 匹配代价

如何比较参考窗口与变换后的源窗口？候选就是[第 3 篇]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})中的那些：

- **SAD / SSD**（绝对差或平方差之和）：最简单，但对相机之间的亮度差异敏感。
- **NCC**（归一化互相关）：减去每个窗口的均值，除以其标准差，再取乘积的均值。对均值为 $\mu$、方差为 $\sigma^2$ 的窗口 $\mathbf a$ 和 $\mathbf b$，

$$
\mathrm{NCC}(\mathbf a, \mathbf b) = \frac{\frac1m\sum_k (a_k - \mu_a)(b_k - \mu_b)}{\sqrt{\sigma_a^2\,\sigma_b^2}} \in [-1, 1] .
$$

  它对增益和偏置的变化（$b \mapsto \alpha b + \beta$，$\alpha > 0$）不变，这就是大多数 MVS 系统采用它的原因。我们使用代价 $1 - \mathrm{NCC} \in [0, 2]$，并给每个方差加上一个小的 $\varepsilon$，使平坦窗口的代价接近 1（"没有信息"），而不是除以零。
- **Census**：把窗口内每个像素与中心比较，存下比特，再数不同的比特数（汉明距离）。它对任何单调的亮度变化都鲁棒，在基于 SGM 的硬件立体中很常用。

窗口大小是一种权衡。大窗口平均更多像素，代价噪声更小，在较弱纹理上也能工作，但它也假设整个窗口都位于平面上。在深度边缘，大窗口会跨越前景和背景，而通常纹理更丰富的前景会胜出：深度边缘向外**膨胀**（fattening）。在倾斜表面上，正对相机的窗口形状是错的；第 4 节会解决这个问题。

### 3.5 平面扫描的代码

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

有三个细节值得说明。`ncc_cost` 用盒式滤波计算所有窗口和，因此不管窗口多大，一个平面只需要几次整幅图像的运算。`wta` 用过 $i-1, i, i+1$ 三处代价的抛物线顶点来细化胜出的平面：若代价为 $c\_0, c\_1, c\_2$，抛物线最小值位于偏移 $\tfrac12(c\_0 - c\_2)/(c\_0 - 2c\_1 + c\_2)$ 处，只需三次查表就能得到亚平面精度。代价体保留各个视图分开，即 `C[view, plane, y, x]`，因为如何组合它们很重要，3.7 节会说明这一点。

下一张图展示了变换的样子。对每个平面，位于该平面附近的那部分场景会与参考图像对齐，差值图在那里变暗；其他地方仍然很亮。扫描平面时，这条"对焦"带从近处的地面移到远处的墙，很像相机的对焦环。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-sweep-warps.svg" caption="第一行：参考图像，以及在右侧 0.40 m 处拍摄的源视图 1。其后每一行：左边是源视图 1 经一个平面（$z = 3.3$、$4.6$、$6.6$ m）的单应变换到参考视图后的结果，右边是它与参考图像的绝对差。青色轮廓标出真实深度与平面相差不到 3% 的像素：那里的差值是暗的（已对齐），其他地方是亮的。在 3.3 m 处盒子的正面、球上的一圈环带和近处的一条地面对齐，在 4.6 m 处是一条地面，在 6.6 m 处是墙。图像边缘的空白条是落在源视图 1 之外的像素。" %}

### 3.6 解读代价曲线

代价体最容易逐像素地理解。下图展示了四个探针像素的 $C(z)$，按视图分开画（细线）并给出聚合结果（粗线）。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-cost-curves.svg" localized="true" caption="四个探针像素沿 64 个平面的代价曲线 $1 - \mathrm{NCC}$（5x5 窗口），每个源视图一条细线，黑色是“4 选最好 2”的聚合；红色虚线是真实深度，黑色三角是估计值。A：有纹理的墙，每个视图都有一个又深又窄的最小值，估计 6.36 m，真值 6.35 m。B：平坦海报，所有曲线都是 1 附近的平坦噪声，最小值落在 4.58 m 而不是 6.21 m。C：条纹。水平基线的视图 1 和 2 在不同深度处有周期性最小值；视图 3 的基线接近竖直，沿极线几乎看不到变化（所有深度上代价都低），视图 4 给出一条宽而平缓的曲线。聚合结果有歧义；估计 6.12 m，真值 6.25 m。D：盒子旁边的一个墙面像素，在视图 2 中被遮挡（蓝色，真值处代价高），在其他视图中可见：最好 2 个视图给出 6.62 m（真值 6.66 m），而四个视图的平均给出 5.29 m。" %}

每个探针都是一课：

- **A（纹理）**：理想情形。每个视图都在正确位置有一个尖锐且唯一的最小值。
- **B（无纹理）**：没有东西可以匹配。两个噪声窗口的 NCC 是随机的，所以"最好"的平面也是随机的。任何局部代价都无法解决这个问题；我们需要一个先验，把海报周围有纹理区域的深度传播进来（平滑性，3.8 节；平面，第 4 节），或者需要主动光（2.2 节）。
- **C（重复纹理）**：周期为 $p$ 像素的条纹在平移 $p$ 之后与自身匹配，所以单个视图有好几个同样好的最小值。**基线不同**的视图会把这些混叠放到不同深度，只有真实深度在所有视图中都是最小值。这就是**多基线立体**（multiple-baseline stereo）的思想（Okutomi 和 Kanade，1993），他们在逆距离上对多条基线的 SSD 曲线求和。极线**沿着**条纹方向的视图看到的是恒定的图案，不携带任何信息：这是第 3 篇中孔径问题的另一种形式。
- **D（遮挡）**：从视图 2（左侧 0.25 m）看，这个像素的表面点被盒子挡住，所以视图 2 比较的是墙和盒子，在真实深度处代价很高。把这个离群值平均进代价会移动最小值；忽略最差的视图则能保住它。

### 3.7 多个视图：聚合与遮挡

如何组合各视图的代价 $C\_j(x, y, i)$？在我们的场景上，打印结果给出了答案：

```text
view 1 only  AbsRel 0.079, |e| < 1%: 52.3%, |e| < 5%: 78.3%
mean of 4    AbsRel 0.047, |e| < 1%: 65.5%, |e| < 5%: 82.8%
best 2 of 4  AbsRel 0.034, |e| < 1%: 67.9%, |e| < 5%: 90.5%
```

更多视图有帮助，**鲁棒聚合**帮助更大。对每个像素和每个平面，取 $N$ 个视图中最好的 $k$ 个的均值（这延续了 Kang、Szeliski 和 Chai（2001）选择视图子集的思路），相当于假设每个点至少在 $k$ 个视图中可见，其余的则可能被遮挡而被舍弃。对探针 D，四个视图的平均给出 5.29 m，最好的两个给出 6.62 m。实际系统走得更远：COLMAP（Schönberger 等，2016）为每个像素估计每个源视图看到它的概率，并与深度联合估计；它还按三角化角度给视图加权（角度太小没有深度分辨率；角度太大外观差异太大）。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-sweep-result.svg" localized="true" caption="使用 5x5 NCC 窗口和抛物线细化的平面扫描深度图。(a) 真值。(b) 只用源视图 1：海报和条纹上出现噪声块，右边缘有一条带，那里的像素离开了视图 1。(c) 每个像素和平面取 4 个视图中最好的 2 个：68% 的像素与真实深度相差不到 1%，90% 不到 5%。(d) (c) 的相对误差，截断在 5%。剩下的误差集中在无纹理的海报上、深度边缘（盒子和球轮廓的前景膨胀）以及图像边界；在有纹理的表面上误差大多低于 1%。" %}

(d) 的误差图是局部立体的典型特征：纹理上表现好，海报上出错，每条深度边缘周围都有一圈亮**光晕**，那里 5x5 窗口混合了前景和背景。

### 3.8 对代价体做正则化

到目前为止，每个像素都是独自决定的（赢者通吃，winner-take-all，WTA）。海报和边缘上的误差需要**上下文**：相邻像素通常有相近的深度。引入上下文的三种经典方法：

- **代价聚合**：对每个代价切片做空间滤波，可以用盒式、高斯，或者边缘保持滤波器（双边滤波或引导滤波），后者不会跨图像边缘取平均，从而减轻膨胀。
- **全局优化**：在整张深度图上最小化 $E(\mathbf z) = \sum\_p C\_p(z\_p) + \lambda\sum\_{p \sim q} V(z\_p, z\_q)$，其中 $V$ 是相邻像素间的平滑惩罚。图割和置信传播可以近似求解。
- **半全局匹配（SGM）**（Hirschmüller，2008），在[第 4 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})中讲过：沿 8 或 16 个方向用动态规划精确求解全局问题的一维版本，再把结果相加。它可以作用于任何代价体，包括平面扫描代价体。

学习式 MVS（第 5 节）用一个 3D CNN 取代这三者，它从数据中学习如何正则化代价体。

### 3.9 动手试试：自己扫描平面

这个小部件在浏览器中对一个类似的场景（一个参考视图和一个源视图，用 JavaScript 重新渲染）运行本节的平面扫描。在曲线图上拖动或使用滑块移动平面，观察图像的哪些部分对齐。可以试试：

- 显示 **|差值|**，从近到远扫描：一条暗带从图像底部（近处地面）移动到墙上。
- 把探针放在盒子、海报和条纹上（先点探针按钮，再点图像）。比较尖锐的最小值、平坦的曲线和周期性最小值。
- 切换到 **WTA 深度**，把窗口从 3x3 改为 9x9：纹理表面上的噪声减少，但边缘膨胀。注意曲线图下方的精度行。
- 改变**基线**：条纹的混叠移到其他深度（使用 5x5 窗口时，0.5 m 的基线恰好让条纹探针得到正确深度），而短基线会让每个最小值变宽（深度分辨率降低）。

{% include widget.liquid name="3d-vision-plane-sweep" height="760" caption="实时的平面扫描立体。左：带三个探针像素的参考图像。右：按当前平面的单应变换后的源视图、绝对差、每个像素在该平面的代价，或赢者通吃的深度图。青色轮廓标出真实深度与平面相差不到 3% 的像素。曲线图：每个探针的代价随深度（按 $1/z$ 等间距）的变化，紫线是当前平面，虚线是真实深度，三角是 WTA 估计。" %}

## 4. PatchMatch 多视图立体

### 4.1 平面扫描的两个问题

平面扫描有两个内在的局限。

1. **计算量。** 它在每个像素上评估全部 $D$ 个平面。在 4K 分辨率、$D = 256$ 时，每个源视图要做二十亿次窗口比较，其中大多数深度显然是错的。
2. **正对相机的偏置。** 每个窗口都按表面正对相机的假设来变换。在倾斜表面（地面、街道、斜看的建筑立面）上，窗口内的真实深度是变化的，所以即使最好的平面也只能部分匹配。我们的地面就说明了这一点：地面像素中只有 51% 误差在 1% 以内，而整体是 68%。

**PatchMatch**（Barnes 等，2009，用于图像编辑）解决了第一个问题，而它带**倾斜平面**的立体版本（Bleyer、Rhemann 和 Rother，2011）解决了第二个。

### 4.2 PatchMatch 的思想

PatchMatch 基于一个观察：**好的假设在空间上是连贯的**。如果一个像素的深度（和朝向）是对的，它邻居的很可能几乎相同。算法只需要三步：

1. **随机初始化。** 给每个像素一个随机假设：这里是一个深度（在 $w$ 上均匀）和一个法向。
2. **传播。** 依次访问像素；让每个像素试用邻居的假设，只要能降低代价就保留。
3. **随机细化。** 对当前假设做随机扰动，扰动幅度逐轮缩小，变好就保留。

为什么随机初始化可行？因为每个区域只需要**一个**幸运的像素。假设逆深度与真值相差不到 ±1% 就算"好"。对 5 m 处的表面（$w = 0.2$），这是宽度 0.004 的区间，而整个范围是 $1/2.5 - 1/8 = 0.275$，所以随机猜测为好的概率是 $p = 0.0145$。在同一表面上一个 $20 \times 20$ 的区域内，400 个像素中至少有一个初始猜测为好的概率是

$$
1 - (1 - p)^{400} = 1 - 0.9855^{400} \approx 1 - e^{-5.84} = 0.997 .
$$

传播随后在几轮扫描中把这个像素的假设扩散到整个区域。细化再把精度提高到幸运猜测的 1% 之外。（使用倾斜平面时法向也需要大致正确，这会降低 $p$；细化步骤和众多邻居可以弥补。）

### 4.3 倾斜的支撑窗口

现在每个像素 $p$ 携带一个平面：深度 $z\_p$ 和法向 $\mathbf n\_p$。平面经过反投影点 $\mathbf X\_p = z\_p K^{-1}\tilde{\mathbf x}\_p$，因此偏移为 $d\_p = \mathbf n\_p^\top\mathbf X\_p$。$p$ 窗口中的每个像素都用 **$p$ 自己的**单应变换到源视图

$$
H_p = K_s\Big(R + \frac{\mathbf t\,\mathbf n_p^\top}{d_p}\Big)K_r^{-1},
$$

于是窗口跟随表面，而不是正对相机。地面上的窗口会被当作一块地面来变换。（我们的代码让每个法向都指向相机，因此 $d\_p < 0$，与 3.2 节的 $d > 0$ 不同。这没有影响：翻转 $\mathbf n$ 也会翻转 $d$，$\mathbf t\mathbf n^\top/d$ 保持不变。）

传播还需要一个公式。当像素 $p$ 借用邻居 $q$ 的平面 $(\mathbf n\_q, \mathbf X\_q)$ 时，要在 $p$ 处测试的深度是 $p$ 的射线 $\mathbf r\_p = K^{-1}\tilde{\mathbf x}\_p$ 与该平面的交点：$\mathbf n\_q^\top(z\,\mathbf r\_p) = \mathbf n\_q^\top\mathbf X\_q$，因此

$$
z = \frac{\mathbf n_q^\top\mathbf X_q}{\mathbf n_q^\top\mathbf r_p} .
$$

在倾斜表面上，这会正确地外推深度，而不是简单复制。

### 4.4 传播顺序与并行

Bleyer 等人按顺序传播：偶数轮从左上到右下扫描图像（信息向右、向下流动），奇数轮反向扫描。这本质上是串行的。**Gipuma**（Galliani、Lasinger 和 Schindler，2015）用**红黑棋盘**让 PatchMatch 大规模并行：像棋盘一样给像素着色，先用黑色邻居同时更新所有红色像素，再更新所有黑色像素。每次更新使用距离为 1 以及更远的邻居（我们在四个方向上用距离 1 和 3），因此每半步信息仍能传播好几个像素。ACMM（Xu 和 Tao，2019）自适应地选择采样哪些邻居，并为低纹理区域加入多尺度几何一致性。同样的红黑方案也让我们的 NumPy 版本足够快：一半像素在一次向量化调用中更新。

### 4.5 PatchMatch 的代码

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

输出讲述了迭代的过程：

```text
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

从纯噪声开始（只有 1.8% 的像素碰巧在 1% 以内），一轮迭代就让 65% 的像素误差在 5% 以内，两轮之后深度图几乎收敛。使用倾斜平面时，59.4% 的地面像素误差在 1% 以内；限制为正对平面的 PatchMatch 只有 46.3%，64 个平面的扫描是 51.2%。整体上 PatchMatch 与平面扫描相当（1% 以内分别为 66.8% 和 67.9%），每个像素的代价评估次数也相近：这里是 1 + 6 x 10 = 61 次，而扫描是 64 个平面。区别在于计算量如何增长：扫描的计算量随平面数增长，PatchMatch 不会；而且 PatchMatch 的深度是连续的，不会被量化到平面上。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-patchmatch.svg" localized="true" caption="测试场景上的 PatchMatch MVS（4 个视图中最好 2 个，5x5 窗口，红黑传播）。随机初始化后的深度（第 0 轮：2% 的像素在 1% 以内），以及第 1、2、6 轮之后（20%、50%、67%）。左下：用颜色表示的估计法向（x、-y、-z 映射到 RGB）：地面是绿色，正对相机的表面是蓝紫色，球的颜色平滑过渡；在弱纹理上法向仍然有噪声，因为 5x5 窗口对深度的约束远强于对朝向的约束。右下：每轮迭代后误差在 1% 以内的像素比例，实线为全部像素，虚线为地面，紫色为倾斜平面，橙色为只用正对平面；点线是平面扫描。" %}

### 4.6 从一张深度图到很多张：COLMAP 等

像 COLMAP（Schönberger 等，2016）这样的实际 MVS 系统会把**每一幅**图像都当作参考视图运行 PatchMatch，并加入三个要素：

- **逐像素视图选择**：用一个概率模型推断哪些源视图能看到每个像素，而不是用我们固定的"最好 2 个"规则。
- **几何一致性**：在第二轮中，假设还要按它与其他视图深度图的一致程度打分（把它投影到邻居视图，读取邻居的深度，再投影回来，测量与起始像素的距离）。
- **过滤与融合**：丢弃光度或几何一致性低的像素，把所有视图中保留下来的深度合并成一个点云（7.1 节）。

更早的 MVS 走过其他路线。PMVS（Furukawa 和 Ponce，2010）从稀疏匹配出发，通过扩展和过滤生长出一组小的有向面片；体素方法则对体素进行雕刻或标注。基于深度图的 PatchMatch 在实践中胜出，因为它易于并行，能扩展到数千幅高分辨率图像。

## 5. 学习式多视图立体

### 5.1 MVSNet：把平面扫描做成网络

手工设计的 MVS 在光度一致性弱的地方会遇到困难：低纹理、反光、细小结构。**MVSNet**（Yao 等，2018）保留平面扫描的几何，其余部分全部学习。它的流程与第 3 节一一对应：

1. **特征提取。** 共享的 2D CNN 把 $N$ 幅图像中的每一幅变成四分之一分辨率、$C$ 通道（论文中为 32）的特征图。匹配学到的特征而不是原始亮度，是第一个收益。
2. **可微单应变换。** 每个源特征图用 3.2 节中的同一个单应 $H\_i$ 变换到参考视图的 $D$ 个正对平面上，采用可微的双线性采样。
3. **方差代价体。** 对每个平面，把 $N$ 个特征体 $\mathbf V\_1, \dots, \mathbf V\_N$（包括参考视图）按通道求方差：$\mathbf C = \frac1N\sum\_j(\mathbf V\_j - \bar{\mathbf V})^2$。特征一致的地方方差小。与我们的"最好 2 个"不同，方差适用于任意 $N$。
4. **正则化。** 一个 3D U-Net 处理 $C \times D \times H/4 \times W/4$ 的代价体，为每个平面和像素输出一个分数，再沿 $i$ 做 softmax 转换为**概率体** $P\_i(x, y)$。它取代了 SGM 或全局优化：网络学会如何把信息传播到无纹理区域。
5. **深度回归。** 深度取各平面上的期望 $\hat z = \sum\_i P\_i\,z\_i$（soft-argmin；MVSNet 的平面在深度上均匀采样，若像下面的代码那样在逆深度上均匀采样，则改取 $w$ 的期望）。一个小的 2D 网络借助参考图像细化深度图，训练时对初始深度图和细化后的深度图都相对真值深度（由 DTU 的结构光扫描渲染得到）最小化 L1 损失。

它的弱点是显存。对 $1600 \times 1200$ 的图像，四分之一分辨率的代价体在 $D = 192$ 个平面时有 $400 \times 300 \times 192 \times 32 \approx 7.4 \times 10^8$ 个元素，用 32 位浮点约 3 GB，而 3D U-Net 的中间特征体还需要数倍于此的显存。后续大多数工作都围绕这个数字展开。

### 5.2 Soft-argmin：亚像素且可微，但有陷阱

赢者通吃是不可微的。用于立体的 GC-Net（Kendall 等，2017）和 MVSNet 用 softmax 下的期望来取代它：

$$
P_i = \frac{\exp(-C_i/\tau)}{\sum_k \exp(-C_k/\tau)}, \qquad \hat w = \sum_i P_i\,w_i .
$$

当分布是单峰且尖锐时，$\hat w$ 是最小值的亚平面估计。否则，期望会落在各个峰**之间**，落在没有任何平面支持的深度上。我们可以在手工代价体上检验这一点，用温度 $\tau$ 扮演训练对网络所起的作用：

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

在赢者通吃与真值相差不超过两个平面的 88.4% 的像素上，RMS 误差分别为：整数 WTA `0.611` 个平面，加抛物线 `0.535`，$\tau = 0.05$ 的 soft-argmin `1.566`，$\tau = 0.01$ 时 `0.705`。在宽而平缓的手工代价曲线上，soft-argmin 反而**不如**普通的 WTA：来自远处那些"稍差一点"的平面的概率质量把均值拉偏了。只有分布尖锐时它才有效，而网络必须学会让分布变尖锐。MVSNet 的 L1 损失只作用于期望，本身并不能排除一个均值恰好正确的双峰 $P$；这就是 R-MVSNet 直接用相对真实平面的交叉熵损失训练 $P$、而另一些方法只在峰值附近的窗口内取期望的原因。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-soft-argmin.svg" localized="true" caption="(a) 探针 A 的“最好 2 个”代价（黑色）以及 $\tau=0.05$（橙）和 $\tau=0.01$（紫）时的 softmax 概率。这条曲线只有一个干净的最小值；整数 argmin 是 6.43 m 处的平面，soft-argmin 在平面之间插值：6.31 m（$\tau=0.05$，分布较宽，有一条伸向近处平面的尾巴）和 6.34 m（$\tau=0.01$），真值为 6.35 m。(b) 只用视图 1 看探针 C：三个最小值，分别在深度范围的近端（2.5 m）、3.5 m 附近和 6.1 m 附近（真值 6.25 m，虚线）。argmin 选错了（3.54 m）；$\tau = 0.05$ 时 soft-argmin 落在 3.87 m，位于峰之间，是一个没有任何平面支持的深度；$\tau=0.01$ 时落在 3.48 m，被 2.5 m 处的峰略微拉近。(c) 在 WTA 与真值相差不超过两个平面的 88% 像素上、以平面间距为单位的 RMS 误差：整数 WTA 0.61，WTA 加抛物线 0.53，soft-argmin 1.57（$\tau=0.05$）和 0.70（$\tau=0.01$）。" %}

### 5.3 走向可扩展，以及立体分支

MVSNet 之后的主要工作方向（都已在下方论文表中核实）：

- **循环正则化。** R-MVSNet（Yao 等，2019）用卷积 GRU 逐个深度切片处理代价体，取代 3D CNN，使显存不再随 $D$ 增长。
- **由粗到细的级联。** CasMVSNet（Gu 等，2020）先在低分辨率上为整个深度范围构建粗代价体，再在更高分辨率上围绕前一级估计构建更窄的代价体。同样的深度精度只需少得多的平面。
- **学习式 PatchMatch。** PatchmatchNet（Wang 等，2021）把第 4 节装进网络：学习的自适应传播与评估，由粗到细迭代，不需要完整的代价体。

双视图立体网络走了一条平行的路：GC-Net 引入了 3D CNN 代价体和 soft-argmin；RAFT-Stereo（Lipson 等，2021）用由全对相关金字塔驱动的视差场循环更新取代 3D CNN（即第 3 篇中 RAFT 的立体版本）；FoundationStereo（Wen 等，CVPR 2025）把冻结的单目深度模型（Depth Anything V2）的特征融入其匹配特征，以实现零样本泛化。学习式立体和 MVS 越来越多地借助单目深度，这是下一节的主题。

学习式 MVS 仍然需要**已知相机**。DUSt3R、VGGT 和 Depth Anything 3（Lin 等，arXiv 2025 年 11 月，ICLR 2026）等前馈三维模型从无位姿图像中同时预测深度和相机位姿；它们是[第 9 篇]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})的主题。

## 6. 单目深度估计

### 6.1 为什么一幅图像不够，以及它为什么仍然可行

从单幅图像看，深度从根本上是有歧义的。把整个场景以相机中心为原点缩放 $s$ 倍：每个点 $\mathbf X\_c$ 变成 $s\mathbf X\_c$，而 $K(s\mathbf X\_c) \sim K\mathbf X\_c$ 投影到同一个像素。玩具屋和真房子可以拍出同一张照片。更糟的是，焦距与深度耦合：深度 $z$ 处高为 $h$ 的物体，像高为 $fh/z$，所以更长的镜头加更远的物体看起来一样。

人类用一只眼睛仍能判断深度，因为世界并不是任意的：熟悉物体的大小、平行线的透视（第 1 篇的消失点）、纹理梯度、遮挡顺序、明暗、雾气和离焦。在足够多图像上训练的网络会学到同样的线索。没有额外信息时它学不到的是全局尺度（以及相机未知时的焦距）。因此单目深度模型分为两类：**相对**（仿射不变）模型，预测的深度带有未知的尺度和偏移；**度量**模型，以米为单位预测，必须以某种方式确定相机。

### 6.2 尺度不变损失

Eigen、Puhrsch 和 Fergus（2014）是最早用深度网络做单目深度估计的工作之一，他们提出了一种忽略全局尺度的损失。对 $n$ 个像素取 $g\_i = \log\hat z\_i - \log z\_i^\ast$，

$$
D(\hat{\mathbf z}, \mathbf z^\ast) = \frac1n\sum_i g_i^2 - \frac{\lambda}{n^2}\Big(\sum_i g_i\Big)^2 .
$$

$\lambda = 1$ 时它就是 $g$ 的方差，而把 $\hat{\mathbf z}$ 乘以任意 $s$ 会给每个 $g\_i$ 加上 $\log s$，方差不变。论文使用 $\lambda = 0.5$，在绝对精度和相对精度之间折中。6.4 节的代码在数值上验证了这种不变性：`si_log: 0.00035, after doubling the depth: 0.00035`。

### 6.3 混合数据集：仿射不变的逆深度（MiDaS）

要同时在**许多**数据集上训练，仅有尺度不变还不够。立体电影和网络立体图像给出的视差带有未知基线和未知偏移（相机的会聚），激光扫描给出度量深度，运动恢复结构给出带尺度歧义的深度。MiDaS（Ranftl 等，arXiv 2019，TPAMI 2022）让它们全部兼容：它预测**带有未知尺度和偏移的逆深度**，并在计算损失之前先对齐：对预测 $\mathbf p$ 和目标逆深度 $\mathbf w^\ast$，求

$$
(s, t) = \arg\min_{s, t}\sum_i \big(s\,p_i + t - w_i^\ast\big)^2 ,
$$

这是一个线性最小二乘问题，由正规方程得到闭式解

$$
\begin{pmatrix} \sum_i p_i^2 & \sum_i p_i \\ \sum_i p_i & n \end{pmatrix}
\begin{pmatrix} s \\ t \end{pmatrix}
=
\begin{pmatrix} \sum_i p_i w_i^\ast \\ \sum_i w_i^\ast \end{pmatrix},
$$

然后惩罚残差 $s\,p\_i + t - w\_i^\ast$（MiDaS 使用其鲁棒的截尾版本，并加入梯度匹配项以保持边缘锐利）。为什么用逆深度？因为最大的数据来源——视差数据——是逆深度的仿射函数，而 $w$ 上的仿射模型恰好就是未知基线和偏移所产生的。DPT（Ranftl 等，2021）用视觉 Transformer 取代 CNN 主干；它的解码器被许多后来的模型沿用，Depth Anything 就是其中之一。

### 6.4 使用相对模型：实践中的对齐

只要有少量度量锚点，相对预测就能变成度量深度：LiDAR 点、已知尺度的 SfM 点、地面高度或一对立体图像。下面的代码把一个相对网络模拟为真实逆深度的仿射函数，再加上平滑的空间相关误差和像素噪声（真实网络的误差看起来类似：在物体上平滑，在边缘处更大），然后进行对齐。

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

拟合得到的 `s = 0.5876, t = -0.1476` 与模拟仿射映射的精确逆 $1/1.7 = 0.5882$ 和 $-0.25/1.7 = -0.1471$ 很接近，得到 `AbsRel 0.0144, RMSE 0.105 m, delta1 1.000`。忽略偏移、只拟合尺度（$z = k/p$，$k$ 取中位数）得到 `AbsRel 0.1205, RMSE 0.751 m`：差了八倍，这是模型输出为仿射不变时的常见错误。用稀疏锚点时，3 个随机度量点的 AbsRel 中位数为 0.0189，但尾部很差（第 90 百分位 0.0677）；10 个点为 0.0154（0.0180），30 个点已经和全部 19,200 个像素一样好（0.0148 对 0.0144）。两个未知数只需要很少的锚点，但锚点必须分散开。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-mono-align.svg" localized="true" caption="(a) 模拟的相对深度预测 $p$ 与真实逆深度的关系：带散布的仿射关系；拟合直线为 $w = 0.588\,p - 0.148$。(b) 尺度加偏移对齐后的相对深度误差（AbsRel 0.0144）：剩下的是预测误差中平滑的低频部分，任何全局对齐都无法去除。(c) 用 $n$ 个随机度量锚点对齐后的 AbsRel（每种 50 次试验；中位数和第 90 百分位）。点线：用全部像素对齐（灰，0.0144）和只对齐尺度（红，0.1205）。" %}

**评价指标。** 单目深度论文报告 **AbsRel** $= \frac1n\sum\lvert\hat z - z^\ast\rvert/z^\ast$、以米为单位的 **RMSE**，以及阈值精度 **$\delta\_1$**：满足 $\max(\hat z/z^\ast, z^\ast/\hat z) < 1.25$ 的像素比例（还有阈值为 $1.25^2$ 和 $1.25^3$ 的 $\delta\_2$、$\delta\_3$）。对相对模型，这些指标是在上述对齐之后计算的。注意 $\delta\_1$ 有多宽松：我们只对齐尺度的结果 AbsRel 差了八倍，$\delta\_1$ 却仍有 0.991。

### 6.5 自监督与基础模型

真值深度很昂贵。**自监督**方法在没有深度标签的视频或立体对上训练：为一帧预测深度（以及相机运动），用 3.2 节的重投影（以逐像素深度代替平面）把相邻帧变换过来，最小化光度误差。Monodepth2（Godard 等，2019）通过对源帧逐像素取最小值（与我们处理遮挡的"最好 k 个"是同一思想）和对静态像素的自动掩膜，使这一方法变得鲁棒。

最近的飞跃来自规模。**Depth Anything**（Yang 等，CVPR 2024）在 150 万张有标注图像加约 6200 万张由教师模型伪标注的无标注图像上训练 DPT 式模型，配合强数据增强和对冻结 DINOv2 编码器的特征对齐损失。**Depth Anything V2**（NeurIPS 2024）为教师模型改用精确的合成标注图像替代真实标注图像，细节更锐利。**Marigold**（Ke 等，CVPR 2024）走了另一条路：微调 Stable Diffusion 图像生成器，让它以图像为条件"生成"仿射不变的深度图，利用生成器对场景的先验。**Video Depth Anything**（Chen 等，CVPR 2025）加入时空预测头，使长视频中的深度保持一致。

### 6.6 度量深度与相机问题

要以米为单位预测，模型必须知道相机，原因是 6.1 节的 $f$-$z$ 歧义。2024-2025 年的这一代度量模型用不同方式处理它：

- **规范相机。** Metric3D（Yin 等，ICCV 2023）和 Metric3D v2（Hu 等，TPAMI 2024）把每张训练图像（或其标签）变换到一个规范焦距，使"50 像素高的一辆车"总是意味着同一个深度。测试时用已知焦距把预测映射回去。
- **预测相机。** UniDepth（Piccinelli 等，CVPR 2024）用专门的模块预测相机射线，并以此为条件预测深度；Depth Pro（Bochkovskii 等，ICLR 2025）自己估计焦距，在不到一秒内生成锐利的度量深度。
- **预测几何而不是深度。** MoGe（Wang 等，CVPR 2025）预测仿射不变的三维点图（深度与射线一起），再通过一个小优化从中恢复焦距和偏移。

度量单目深度现在已经好到几乎可以在任何地方充当先验：初始化 MVS 和 SLAM、填补传感器深度中的空洞、监督 NeRF 和 Gaussian Splatting，以及给机器人一个几何的初步猜测。但它仍然是学出来的猜测：在近距离其误差大于标定好的立体对，在不寻常的场景（镜子、画作、微缩模型）上可能自信地出错。像上面的对齐那样把它与几何测量结合起来，能兼得两者之长。

## 7. 深度融合

### 7.1 从许多深度图到一个模型

MVS 为每幅图像生成一张深度图；深度相机每秒生成 30 张。它们相互重叠，因噪声而略有分歧，还含有外点。融合把它们变成一个一致的模型。COLMAP 使用的最简单的融合是在点上进行的：

1. **按一致性过滤每张深度图**：把一个像素的三维点投影到相邻视图，读取那里的邻居深度，反投影，再投影回第一个视图。如果它回到一个像素左右以内，且深度相差在百分之一左右以内，这个像素就与该邻居一致。保留与至少两三个邻居一致的像素。
2. **合并**所有视图中保留下来的点，对在多个视图中投影到同一像素的点取平均。

结果是一个稠密点云。要得到表面（并正确地平均噪声），我们需要体素表示。

### 7.2 截断有符号距离函数

Curless 和 Levoy（1996）提出在**体素网格**中融合距离图：在每个体素中心 $\mathbf v$ 存储到最近表面的**有符号距离**：前方（自由空间）为正，后方（内部）为负，表面上为零。每张深度图沿相机视线方向贡献一个**投影式**有符号距离：把 $\mathbf v$ 投影到深度图上，得到像素 $\mathbf x(\mathbf v)$ 和体素自身的深度 $z(\mathbf v)$，于是

$$
\mathrm{sdf}(\mathbf v) = z_{\text{meas}}\big(\mathbf x(\mathbf v)\big) - z(\mathbf v),
\qquad
\mathrm{tsdf}(\mathbf v) = \operatorname{clamp}\!\big(\mathrm{sdf}(\mathbf v)/\mu,\, -1,\, 1\big).
$$

两条规则使它鲁棒。**在 $\pm\mu$ 处截断**：远离表面时投影距离没有意义（它是沿射线测量的，而不是到最近表面的距离），所以前方很远的体素就简单地记为"自由"（+1），而位于测得表面后方超过 $\mu$ 的体素**完全不更新**，因为我们看不到表面后面有什么。对所有深度图做**加权平均**：

$$
T_{k}(\mathbf v) = \frac{W_{k-1}(\mathbf v)\,T_{k-1}(\mathbf v) + w_k\,\mathrm{tsdf}_k(\mathbf v)}{W_{k-1}(\mathbf v) + w_k},
\qquad W_k = W_{k-1} + w_k .
$$

为什么平均距离是对的：若每条射线上的深度噪声是高斯的，多次观测下表面位置的最大似然估计就是（加权）均值，而平均后的距离函数的零交叉正好就是这个均值。权重 $w\_k$ 可以编码置信度：掠射角、远距离或 ToF 幅度低时更小。表面是 $T$ 的**零水平集**，用 marching cubes（[图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})有推导）提取，或直接用光线投射渲染。

**KinectFusion**（Newcombe 等，2011）在 GPU 上实现了实时版本：每个新的深度帧先用 ICP 与当前 TSDF 的光线投射结果对齐（跟踪），再融合进去（建图）。稠密网格很浪费，因为几乎所有体素都是空的；**体素哈希**（Nießner 等，2013）只在表面附近分配小的体素块，并用哈希表索引，使房间级乃至建筑级的融合成为可能。稠密网格、八叉树、哈希和其他表示之间的权衡是[第 8 篇]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})的主题。

### 7.3 二维 TSDF 融合的代码

为了看清平均的效果，我们融合一个二维场景（一个圆盘和一个正方形）的带噪声一维深度扫描，相机绕场景转一圈拍摄。噪声随距离增长，$\sigma = 2\ \text{mm} + 5\ \text{mm}\cdot z^2$（$z$ 以米为单位），与立体或结构光传感器类似。

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

输出：原始测量点到真实表面的 RMS 距离为 `14.02 mm`。融合后 TSDF 的零水平集 RMS 误差：一次扫描后 `15.36 mm`，2、4、8、16 次扫描后分别为 `12.11`、`11.33`、`10.32` 和 `8.31 mm`，全部 36 次之后为 `4.41 mm`。每个表面点被越来越多的扫描看到，平均使噪声大致按该次数平方根的倒数下降：36 次扫描之后，表面上的体素被更新次数的中位数为 10，而 $14.0/\sqrt{10} = 4.4$ mm。（一次扫描后的误差略高于那次扫描自身点的 13.1 mm，因为 1.5 cm 的网格和零交叉的线性插值也会带来一点误差。）

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-tsdf.svg" localized="true" caption="二维 TSDF 融合（在点线围成的 3 m 正方形上取 201 x 201 网格，截断 $\mu = 8$ cm）。(a) 右侧相机的一次扫描（橙色三角、细橙色射线、黑色测量点）：TSDF 在观测到的自由空间中为 +1（蓝），在测得的表面处过零，紧贴其后为红色；更后方和视场之外不做任何更新。虚线轮廓是真实场景。(b) 从半径 2 m 的圆上做 36 次扫描之后（每三台相机画一台，橙色三角）：零水平集（紫色，位于白色过渡带下）围绕两个物体闭合。(c) 提取出的零交叉到真实表面的 RMS 距离随融合扫描次数的变化，从 15.4 mm 降到 4.4 mm；原始点为 14.0 mm。" %}

### 7.4 TSDF 融合的局限

TSDF 融合鲁棒而简单，因此至今仍在每个深度相机的 SDK 里。它的局限推动了后面的几篇。均匀网格要么浪费显存，要么模糊细节。比截断带更薄的结构（椅子腿、线缆）从相反两侧观察时会被平均掉，因为一侧的"后方"会覆盖另一侧的"前方"。融合假设位姿已知且准确；位姿误差会把表面抹开（[第 6 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})中 SLAM 的回环闭合会事后变形 TSDF）。而且它只存几何，不存外观或视角相关效应。[第 8 篇]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})把 TSDF 与网格、点云、神经场和高斯进行比较，[第 9 篇]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})有一个交互式 TSDF 融合小部件和完整的重建流程。

## 8. 深度与 MVS 的评测

**深度图**用来自更好传感器的真值逐像素评测：AbsRel、RMSE、$\delta\_1$（6.4 节）、误差低于某阈值的像素比例（我们的"1% 以内"），对立体还有 **bad-$\tau$ 率**，即视差误差超过 $\tau$ 像素的像素百分比。经典基准：Middlebury（高分辨率室内立体，结构光真值，按 Scharstein 和 Szeliski（2002）的分类体系组织）、KITTI（驾驶，稀疏 LiDAR 真值）、NYU Depth v2（室内 Kinect）和 ETH3D。

**MVS 重建**作为点云与参考扫描比较，用两个类似于精确率和召回率的数字评测。**准确度**（accuracy）是每个重建点到参考的距离（点是否正确？）；**完整度**（completeness）是每个参考点到重建的距离（表面是否被覆盖？）。Tanks and Temples（Knapitsch 等，2017）把它们合成为距离阈值 $\tau$ 下的 **F 分数**：精确率 $P(\tau)$ 是距参考 $\tau$ 以内的重建点比例，召回率 $R(\tau)$ 是距重建 $\tau$ 以内的参考点比例，$F = 2PR/(P + R)$。主要的 MVS 基准有 DTU（Jensen 等，2014：由机械臂上的相机拍摄的桌面物体，结构光参考扫描）、ETH3D（Schöps 等，2017：高分辨率室内外场景，激光扫描）和 Tanks and Temples（大型室内外场景）。注意这些指标奖励什么：一个方法可以通过删除不确定的点来提高准确度，所以一定要同时看两个数字。

## 9. 实用建议

- **你能控制硬件，场景在室内且距离近：** 用主动传感器（结构光或 iToF），再用 TSDF 融合，就完成了。注意墙角的多径以及黑色或反光的物体。
- **室外或远距离：** 用立体相机，并按 $\sigma\_z = z^2\sigma\_\delta/(fB)$ 选择基线；预算允许时用 LiDAR。
- **由照片离线重建：** SfM（[第 5 篇]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})），然后用 COLMAP 的 PatchMatch MVS（如果有相似的训练数据，也可以用学习式 MVS 模型），几何过滤，融合，网格化（[第 9 篇]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})）。
- **只有一幅图像，或任何需要先验的时候：** 用最新的单目模型；相对模型配合对已有度量锚点的尺度加偏移对齐，或者在内参正确的前提下用度量模型。
- **始终：** 存 z 深度而不是距离（或明确标注），把无效像素存为 NaN 或 0 并配掩膜，在逆深度上采样和回归，报告相对误差，并目视检查边缘和无纹理区域，因为平均误差会掩盖它们。

## 动手试试

- 在 3.9 节的**平面扫描小部件**中，把一个探针放到海报上，尝试所有窗口大小和两种代价：没有任何设置能产生清晰的最小值。然后找一个让条纹探针得到正确深度的基线，并用 3.6 节解释它为什么会移动。
- 仍在小部件中，比较 3x3 和 9x9 窗口下的 WTA 精度，并观察盒子和球附近的深度图，看看大窗口在哪里吃亏。
- 主页的[交互实验室]({{ '/' | relative_url }}#lab)展示了渲染的一侧：其中的 Gaussian World 演示从一种表示渲染场景，而深度图和 MVS 正可以帮助初始化这类表示。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| A multiple-baseline stereo (Okutomi, Kanade) | TPAMI | 1993 | [DOI](https://doi.org/10.1109/34.206955) | 在逆深度上对多条基线的 SSD 求和，消除重复图案的歧义 |
| A space-sweep approach to true multi-image matching (Collins) | CVPR | 1996 | [DOI](https://doi.org/10.1109/CVPR.1996.517097) | 平面扫描 |
| A volumetric method for building complex models from range images (Curless, Levoy) | SIGGRAPH | 1996 | [DOI](https://doi.org/10.1145/237170.237269) | 加权平均的 TSDF 融合 |
| Handling occlusions in dense multi-view stereo (Kang, Szeliski, Chai) | CVPR | 2001 | [DOI](https://doi.org/10.1109/CVPR.2001.990462) | 可移动窗口和逐像素视图子集，用于处理遮挡 |
| A taxonomy and evaluation of dense two-frame stereo correspondence algorithms (Scharstein, Szeliski) | IJCV | 2002 | [DOI](https://doi.org/10.1023/A:1014573219977) | 匹配代价、聚合、优化、细化；Middlebury 基准 |
| Stereo processing by semiglobal matching and mutual information (Hirschmüller) | TPAMI | 2008 | [DOI](https://doi.org/10.1109/TPAMI.2007.1166) | SGM |
| PatchMatch: a randomized correspondence algorithm for structural image editing (Barnes et al.) | ACM TOG (SIGGRAPH) | 2009 | [DOI](https://doi.org/10.1145/1531326.1531330) | 随机初始化、传播、随机搜索 |
| Accurate, dense, and robust multiview stereopsis (Furukawa, Ponce) | TPAMI | 2010 | [DOI](https://doi.org/10.1109/TPAMI.2009.161) | PMVS，基于面片的 MVS |
| PatchMatch stereo: stereo matching with slanted support windows (Bleyer, Rhemann, Rother) | BMVC | 2011 | [DOI](https://doi.org/10.5244/C.25.14) | 用 PatchMatch 求逐像素倾斜平面 |
| Structured-light 3D surface imaging: a tutorial (Geng) | Advances in Optics and Photonics | 2011 | [DOI](https://doi.org/10.1364/AOP.3.000128) | 结构光编码方案综述 |
| KinectFusion: real-time dense surface mapping and tracking (Newcombe et al.) | ISMAR | 2011 | [DOI](https://doi.org/10.1109/ISMAR.2011.6092378) | 带 ICP 跟踪的实时 TSDF 融合 |
| Real-time 3D reconstruction at scale using voxel hashing (Nießner et al.) | ACM TOG (SIGGRAPH Asia) | 2013 | [DOI](https://doi.org/10.1145/2508363.2508374) | 用哈希表存储稀疏 TSDF 块 |
| Large scale multi-view stereopsis evaluation (Jensen et al.) | CVPR | 2014 | [DOI](https://doi.org/10.1109/CVPR.2014.59) | DTU MVS 基准 |
| Depth map prediction from a single image using a multi-scale deep network (Eigen, Puhrsch, Fergus) | NeurIPS | 2014 | [arXiv](https://arxiv.org/abs/1406.2283) | 早期用深度网络做单目深度估计的工作；尺度不变损失 |
| Massively parallel multiview stereopsis by surface normal diffusion (Galliani, Lasinger, Schindler) | ICCV | 2015 | [DOI](https://doi.org/10.1109/ICCV.2015.106) | Gipuma：GPU 上的红黑 PatchMatch |
| Pixelwise view selection for unstructured multi-view stereo (Schönberger et al.) | ECCV | 2016 | [DOI](https://doi.org/10.1007/978-3-319-46487-9_31) | COLMAP MVS：深度、法向与视图选择联合估计 |
| End-to-end learning of geometry and context for deep stereo regression (Kendall et al.) | ICCV | 2017 | [arXiv](https://arxiv.org/abs/1703.04309) | GC-Net：3D CNN 代价体与 soft-argmin |
| A multi-view stereo benchmark with high-resolution images and multi-camera videos (Schöps et al.) | CVPR | 2017 | [DOI](https://doi.org/10.1109/CVPR.2017.272) | ETH3D |
| Tanks and Temples: benchmarking large-scale scene reconstruction (Knapitsch et al.) | ACM TOG (SIGGRAPH) | 2017 | [DOI](https://doi.org/10.1145/3072959.3073599) | 重建的精确率、召回率与 F 分数 |
| MVSNet: depth inference for unstructured multi-view stereo (Yao et al.) | ECCV | 2018 | [arXiv](https://arxiv.org/abs/1804.02505) | 带方差代价体的学习式平面扫描 |
| Recurrent MVSNet for high-resolution multi-view stereo depth inference (Yao et al.) | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1902.10556) | GRU 正则化，显存与 $D$ 无关 |
| Digging into self-supervised monocular depth estimation (Godard et al.) | ICCV | 2019 | [arXiv](https://arxiv.org/abs/1806.01260) | Monodepth2 |
| Multi-scale geometric consistency guided multi-view stereo (Xu, Tao) | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1904.08103) | ACMM：自适应棋盘传播，多尺度一致性 |
| Cascade cost volume for high-resolution multi-view stereo and stereo matching (Gu et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1912.06378) | CasMVSNet：由粗到细的深度范围 |
| Towards robust monocular depth estimation: mixing datasets for zero-shot cross-dataset transfer (Ranftl et al.) | TPAMI | 2022 | [arXiv](https://arxiv.org/abs/1907.01341) | MiDaS：在混合数据上训练仿射不变逆深度 |
| Vision transformers for dense prediction (Ranftl, Bochkovskiy, Koltun) | ICCV | 2021 | [arXiv](https://arxiv.org/abs/2103.13413) | DPT |
| PatchmatchNet: learned multi-view patchmatch stereo (Wang et al.) | CVPR | 2021 | [arXiv](https://arxiv.org/abs/2012.01411) | 学习式迭代 PatchMatch |
| RAFT-Stereo: multilevel recurrent field transforms for stereo matching (Lipson, Teed, Deng) | 3DV | 2021 | [arXiv](https://arxiv.org/abs/2109.07547) | 基于相关金字塔的循环立体 |
| Depth Anything: unleashing the power of large-scale unlabeled data (Yang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2401.10891) | 来自 6200 万张伪标注图像的相对深度 |
| Repurposing diffusion-based image generators for monocular depth estimation (Ke et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.02145) | Marigold |
| UniDepth: universal monocular metric depth estimation (Piccinelli et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2403.18913) | 带自提示相机模块的度量深度 |
| Metric3D v2: a versatile monocular geometric foundation model (Hu et al.) | TPAMI | 2024 | [arXiv](https://arxiv.org/abs/2404.15506) | 用于度量深度和法向的规范相机空间 |
| Depth Anything V2 (Yang et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2406.09414) | 合成标注的教师模型，细节更好 |
| Depth Pro: sharp monocular metric depth in less than a second (Bochkovskii et al.) | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2410.02073) | 带焦距估计的零样本度量深度 |
| MoGe: unlocking accurate monocular geometry estimation for open-domain images (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2410.19115) | 仿射不变点图 |
| FoundationStereo: zero-shot stereo matching (Wen et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.09898) | 借助单目基础模型先验的立体匹配 |
| Video Depth Anything: consistent depth estimation for super-long videos (Chen et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.12375) | 时间一致的视频深度 |
| Depth Anything 3: recovering the visual space from any views (Lin et al.) | ICLR | 2026 | [arXiv](https://arxiv.org/abs/2511.10647) | 用一个 Transformer 从任意数量视图预测深度和位姿（arXiv 2025 年 11 月） |

截至 2026 年 11 月的状态：所有条目均已在所列会议/期刊发表；Depth Anything 3 于 2025 年 11 月发布在 arXiv 上，并发表于 ICLR 2026。

## 学习资源

- R. Szeliski，《Computer Vision: Algorithms and Applications》第 2 版，2022：第 12 章（深度估计：立体、平面扫描、MVS、单目深度）和第 13 章（三维重建，包括 TSDF 融合）。个人使用可在 [szeliski.org/Book](https://szeliski.org/Book/) 免费获取。
- Y. Furukawa 和 C. Hernández，《Multi-View Stereo: A Tutorial》，Foundations and Trends in Computer Graphics and Vision，2015：光度一致性度量、基于深度图的 MVS、融合与评测，内容紧凑。
- R. Hartley 和 A. Zisserman，《Multiple View Geometry in Computer Vision》第 2 版，2004，13.1 节（平面诱导的单应）。
- M. Hansard、S. Lee、O. Choi 和 R. Horaud，《Time-of-Flight Cameras: Principles, Methods and Applications》，Springer，2012，讲解 ToF 传感器的物理原理与标定。
- 代码：[COLMAP](https://github.com/colmap/colmap)（PatchMatch MVS 与融合）、[OpenMVS](https://github.com/cdcseacave/openMVS)、[Open3D](https://github.com/isl-org/Open3D)（用 `ScalableTSDFVolume` 做 TSDF 融合）、[MVSNet](https://github.com/YoYo000/MVSNet)、[CasMVSNet](https://github.com/alibaba/cascade-stereo)、[PatchmatchNet](https://github.com/FangjinhuaWang/PatchmatchNet)、[Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2)、[Depth Pro](https://github.com/apple/ml-depth-pro)、[UniDepth](https://github.com/lpiccinelli-eth/UniDepth)。
- 基准：[Middlebury stereo](https://vision.middlebury.edu/stereo/)、[ETH3D](https://www.eth3d.net/)、[Tanks and Temples](https://www.tanksandtemples.org/)。

## 练习

1. 证明对于只相差纯旋转（$\mathbf t = \mathbf 0$）的两台相机，平面诱导的单应与平面无关。这对旋转相机的平面扫描立体意味着什么？它与[第 4 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})中的退化情形有什么联系？

   <details markdown="1"><summary>提示</summary>

   当 $\mathbf t = \mathbf 0$ 时，$\mathbf t\mathbf n^\top/d$ 这一项消失，对每个平面都有 $H = K\_s R K\_r^{-1}$：所有假设产生同一个变换，每条代价曲线都是平的，深度不可观测。这就是纯旋转退化：没有基线就没有视差，也就无法三角化。在实践中，这意味着 MVS 需要有足够三角化角度的视图，这也是视图选择要丢弃几乎重复的视点的原因。
   </details>

2. 在校正情形下 $x\_s = x - fB/z$。我们的扫描在 $z\_n$ 与 $z\_f$ 之间使用 $D$ 个在 $1/z$ 上均匀的平面。推导相邻假设的像素间距，并在 $f = 600$ px、$B = 0.12$ m、$z\_n = 0.5$ m、$z\_f = 10$ m 时选择 $D$ 使间距为 0.5 px。如果在 $z$ 上均匀采样，要让间距处处低于 0.5 px 需要多少个平面？

   <details markdown="1"><summary>提示</summary>

   视差范围为 $fB(1/z\_n - 1/z\_f) = 72 \cdot 1.9 = 136.8$ px，所以在 $w$ 上均匀的平面相距 $136.8/(D - 1)$ px：$D = 275$ 给出 0.5 px。在 $z$ 上均匀时，最坏的间距出现在 $z\_n$ 处，那里 $\lvert\partial\delta/\partial z\rvert = fB/z\_n^2 = 288$ px/m；0.5 px 的步长需要 $\Delta z = 1.74$ mm，因此要 $9.5/0.00174 \approx 5500$ 个平面，多二十倍。
   </details>

3. 修改 `ncc_cost`，让它返回 SAD 而不是 $1 - \mathrm{NCC}$；把源视图 1 乘以 0.8 再加 0.1（增益和偏置变化，就像两台曝光不同的相机之间那样），只用视图 1 重新运行扫描。比较 SAD 和 NCC 在有无亮度变化时的精度。

   <details markdown="1"><summary>提示</summary>

   把返回值换成 `box(np.abs(a - b))`（保留出界检测），并对 `src[0]` 应用 `(0.8 * I + 0.1, R, t)`。我们得到误差在 1% 以内的像素比例：NCC 无论有无变化都是 52.3%；SAD 没有变化时为 57.7%（在这个只有噪声的场景上 SAD 略好），有变化时降到 32.5%。NCC 的不变性来自构造本身，因为它减去了每个窗口的均值并除以标准差；而 SAD 现在比较的是处处都不同的窗口。
   </details>

4. 给平面扫描加入**几何一致性过滤**：把源视图 1 作为第二个参考计算它的深度图（交换两台相机的角色），只保留这样的参考像素：其三维点投影到视图 1 后落到的像素，其深度反投影回来与起始像素相差不到 1 px。哪些像素被去掉了？剩下像素的精度如何变化？

   <details markdown="1"><summary>提示</summary>

   用 `backproject`、`relative_pose` 和 $K$ 把点映射到视图 1，读取取整后像素处视图 1 的深度，反投影到三维，再用相对位姿的逆映射回参考视图。在我们的运行中，检查保留了 80.9% 的像素；其中 61.5% 误差在 1% 以内（过滤前为 52.3%），90.2% 在 5% 以内（过滤前为 78.3%）。它去掉了大约一半的海报像素（随机深度在两个视图之间只会偶然一致），以及视图 1 看不到的右边缘条带的大部分。视图更多时，要求与其中两三个一致能去掉多得多的外点；随后与其他视图的融合会填补空洞。
   </details>

5. 在 TSDF 实验中，现在所有融合权重都是 1；把它们换成 $w = 1/\sigma(z)^2$，其中 $\sigma(z) = 0.002 + 0.005z^2$ 是传感器的噪声模型。36 次扫描后的误差会变吗？然后把截断 $\mu$ 加倍到 16 cm，再把它减小到四分之一，即 2 cm：细小部分和噪声会怎样？

   <details markdown="1"><summary>提示</summary>

   在 `integrate` 中为每个网格点计算权重 `w` $= 1/\sigma(z\_m)^2$，并用于更新：`T = (Wt * T + w * tsdf) / (Wt + w)` 和 `Wt += w`（只对 `ok` 的元素）。我们得到 4.36 mm 而不是 4.41 mm：几乎没变，因为这个实验中每台相机到物体的距离都差不多，所有权重相近；逆方差加权（高斯测量的最大似然组合）在不同扫描从相差很大的距离看到同一表面时才有回报。$\mu = 2$ cm 时误差升到 12.9 mm：在远离相机处，更新带几乎不比噪声宽，零交叉碎裂成虚假的片段。$\mu = 16$ cm 时误差升到 10.1 mm：此时截断带比场景中的特征还宽，例如正方形的角以及圆盘与正方形之间 10 cm 的间隙，于是一个表面的测量会溢入另一个表面的体素。
   </details>

**下一篇：**[三维表示]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})：有了深度之后要存储什么（点云、网格、体素、有符号距离场、神经场或三维高斯），以及它们之间如何转换。
