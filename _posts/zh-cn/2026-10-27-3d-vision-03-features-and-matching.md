---
layout: post
title: "特征与匹配：角点、SIFT、RANSAC 与学习式匹配器"
date: 2026-10-27 11:03:00+0900
description: "如何在两幅图像中找到同一个点：结构张量与 Harris 角点、尺度空间与 SIFT、FAST/BRIEF/ORB、比值检验、RANSAC 及其后继（MSAC、LO-RANSAC、MAGSAC++）、SuperPoint、SuperGlue、LightGlue、LoFTR 与 RoMa、Lucas-Kanade 与 RAFT 光流，以及匹配器如何评测；每一步都配有 NumPy 代码。"
categories: 3d-vision
tags: [harris, sift, orb, feature-matching, ratio-test, ransac, superglue, lightglue, loftr, optical-flow]
series: 3d-vision
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第 2 篇]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})让我们得到了内参可信的相机。本系列接下来的所有内容（第 4 篇的相对位姿与三角化、第 5 篇的运动恢复结构与光束法平差、第 6 篇的 SLAM）都建立在同一种原始数据之上：**对应点**（correspondence），即两幅图像中显示同一个三维点的一对像素。标定时我们有一块角点位置已知的打印标定板；真实场景没有任何标签，计算机必须自己在不同位置、不同尺度、不同光照下拍摄的图像中找到"同一个点"。得到多少对应点、它们有多精确、其中有多少是错的，决定了一次重建是成功，还是悄无声息地失败。

[神经渲染第 1 篇]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})只用一段话概括了这一步（"SIFT、比值检验、RANSAC"）。本文把这个黑箱打开。我们在一对已知真实单应（homography）的合成图像上，用 NumPy 从零实现每个阶段，因此每个结论都能用数字检验：由结构张量得到角点，由尺度空间得到斑点，SIFT 描述子，二进制描述子，带比值检验的最近邻匹配，RANSAC 及其现代后继，2018 年后在很大程度上取代了这条流水线的学习式匹配器，最后是光流，也就是视频相邻帧之间的匹配。

我们要搭建的流水线：

| 阶段 | 回答的问题 | 经典方法 | 学习式方法 |
| --- | --- | --- | --- |
| 检测（detection） | 哪些像素能在另一幅图像中被再次找到？ | Harris、Shi-Tomasi、DoG、FAST | SuperPoint、DISK、ALIKED |
| 描述（description） | 关键点的邻域长什么样？要能经受视角和光照变化 | SIFT（128 个浮点数）、ORB（256 位） | SuperPoint（256 个浮点数）、学习式图块描述子 |
| 匹配（matching） | 图像 2 中哪个关键点与它对应？ | 最近邻 + 比值检验 + 互为最近邻检查 | SuperGlue、LightGlue；无检测器的 LoFTR、RoMa |
| 验证（verification） | 哪些匹配符合同一个几何模型？ | RANSAC、MSAC、LO-RANSAC、MAGSAC++ | （仍以 RANSAC 为主） |

## 前置知识

- 图像梯度与高斯卷积（任何图像处理课程；`scipy.ndimage`）。
- 2×2 对称矩阵的特征值、最小二乘与 SVD。
- [第 2 篇]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})中的单应与归一化 DLT；[第 1 篇]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})中的像素坐标。
- RANSAC 需要基础概率（独立试验），第 7 节需要基础深度学习（CNN、注意力）。

记号：图像是函数 $I(x, y)$，$x$ 向右、$y$ 向下，存储为 `img[y, x]`，取值在 $[0, 1]$。$I_x = \partial I/\partial x$ 和 $I_y = \partial I/\partial y$ 是偏导数，$\nabla I = (I_x, I_y)^\top$ 是梯度。$G_\sigma$ 是标准差为 $\sigma$ 的二维高斯，$\ast$ 表示卷积。

## 1. 什么是好的特征

**局部特征**（local feature）是一个点（通常还带有尺度和方向）加上一个**描述子**（descriptor），即概括其邻域的向量。我们希望特征是：

- **可重复**（repeatable）：尽管有旋转、尺度变化、模糊、噪声和光照变化，检测器仍在两幅图像中的同一物理点上响应。
- **可区分**（distinctive）：该点的描述子与其他所有点的描述子都不同，从而最近邻搜索能找到正确的对应。
- **局部**（local）：只由一个小邻域计算，因此别处的遮挡和杂乱不受影响。
- **精确**（accurate）：定位到亚像素，因为每一个像素的误差在三角化后都会变成三维误差。
- **高效**（efficient）：每幅图成千上万个，SLAM 中要在毫秒级完成。

有两个词容易混淆。若检测器的输出随图像一起变换（图像旋转 30°，关键点也旋转 30°，检测到的尺度随缩放而变），则称它对该变换是**协变的**（covariant）。若描述子的取值不变，则称它是**不变的**（invariant）。SIFT 由协变的检测得到不变的描述子：先测量每个关键点的尺度和方向，再在归一化后的坐标系中描述图块。

什么样的点能满足这些要求？看图像中的三个小窗口。在**平坦**区域，窗口朝任何方向滑动内容都不变：这个点无法被再次找到。在**边缘**上，窗口沿边缘滑动内容不变：位置只在垂直于边缘的方向上确定（这就是**孔径问题**（aperture problem），第 8 节还会再遇到）。在**角点**处，任何平移都会改变内容：点在两个方向上都被固定。下一节把这个观察变成公式。

### 1.1 一对答案已知的测试图像

要用数字检验每一步，我们需要真值。`make_scene` 在平滑背景上随机画 120 个矩形、圆盘和三角形。第二幅图像是第一幅经过已知单应 `H_true`（旋转 25°、缩放 0.8、平移和少量透视）变换的结果，并改变了亮度和对比度、加入了一些噪声。平面场景的两张照片恰好就是这样相关联的（[第 2 篇]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})），所以对图像 1 中的每个点 $\mathbf x$，我们都知道它在图像 2 中的真实位置是 `apply_h(H_true, x)`。后面所有代码片段都接着这一段运行。

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

## 2. 角点：结构张量、Harris 与 Shi-Tomasi

### 2.1 自相关函数

用一个选出某点周围窗口的权重 $w(\mathbf x)$（标准差为 $\sigma_i$ 的高斯，称为**积分尺度**（integration scale）），度量窗口平移 $(u, v)$ 后的变化：

$$
E(u, v) = \sum_{\mathbf x} w(\mathbf x)\, \big[ I(x + u, y + v) - I(x, y) \big]^2 .
$$

$E$ 是窗口与其平移副本之差的加权平方和。好的特征对每个平移 $(u, v) \neq 0$ 都有较大的 $E$：一个陡峭的碗。下图下排画出了在测试图像的真实窗口上通过平移精确计算的 $E(u, v)$。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-autocorrelation.svg" localized="true" caption="上：本文始终使用的合成图像中的三个窗口；橙色圆是高斯窗口（$\sigma_i = 2$ px，圆半径 $3\sigma_i$）。下：平移不超过 $\pm 6$ px 时的自相关 $E(u, v)$（三幅子图颜色标度相同），白色虚线是二次近似 $[u\ v]\,M\,[u\ v]^\top$ 的等值线。平坦：处处 $E \approx 0$，$M$ 的两个特征值都为零。边缘：沿边缘方向的一道山谷；$\lambda_1 = 0.0298$，$\lambda_2 = 0.0005$。角点：一个碗；$\lambda_1 = 0.0245$，$\lambda_2 = 0.0129$。" %}

### 2.2 从 $E(u, v)$ 到结构张量

对小平移作一阶泰勒展开：$I(x + u, y + v) \approx I(x, y) + I_x u + I_y v$。代入得

$$
E(u, v) \approx \sum_{\mathbf x} w(\mathbf x)\, (I_x u + I_y v)^2
= \begin{pmatrix} u & v \end{pmatrix}
\underbrace{\sum_{\mathbf x} w(\mathbf x) \begin{pmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{pmatrix}}_{M}
\begin{pmatrix} u \\ v \end{pmatrix}.
$$

这个 $2\times 2$ 对称矩阵 $M$ 就是**结构张量**（structure tensor，也叫二阶矩矩阵）。局部地看，$E$ 是一个二次碗，其形状完全由 $M$ 描述。写出特征分解 $M = \lambda_1 \mathbf e_1 \mathbf e_1^\top + \lambda_2 \mathbf e_2 \mathbf e_2^\top$，$\lambda_1 \geq \lambda_2 \geq 0$（二者非负，因为 $M$ 是外积 $\nabla I\, \nabla I^\top$ 的加权和）。沿 $\mathbf e_i$ 平移单位长度的代价为 $E = \lambda_i$：

- **平坦**：$\lambda_1 \approx \lambda_2 \approx 0$；
- **边缘**：$\lambda_1 \gg \lambda_2 \approx 0$，$\mathbf e_1$ 垂直于边缘；
- **角点**：$\lambda_1$ 和 $\lambda_2$ 都大。

等值线 $[u\ v] M [u\ v]^\top = c$ 是沿 $\mathbf e_i$ 半轴为 $\sqrt{c/\lambda_i}$ 的椭圆，即上图中的虚线。实践中导数用小的**微分尺度**（differentiation scale）$\sigma_d$（这里为 1 px）的高斯导数滤波器计算，对 $\mathbf x$ 的求和则是用 $\sigma_i$ 对 $I_x^2$、$I_x I_y$、$I_y^2$ 三幅图做高斯模糊。

**算例。** 取一个均匀权重的窗口，其中 10 个像素在梯度为 $(0.5, 0)$ 的竖直边缘上，10 个像素在梯度为 $(0, 0.5)$ 的水平边缘上，其余梯度为零（L 形角点）。于是 $\sum I_x^2 = 10 \cdot 0.25 = 2.5$，$\sum I_y^2 = 2.5$，$\sum I_x I_y = 0$，所以 $M = \mathrm{diag}(2.5, 2.5)$，$\lambda_1 = \lambda_2 = 2.5$：角点。去掉水平边缘，$M = \mathrm{diag}(2.5, 0)$：边缘。把角点旋转 45°：梯度变为 $(0.354, 0.354)$ 和 $(-0.354, 0.354)$，于是 $\sum I_x^2 = 20 \cdot 0.125 = 2.5$，$\sum I_y^2 = 2.5$，交叉项 $+1.25$ 与 $-1.25$ 相互抵消。$M$ 不变，这说明了基于特征值的检测器为什么具有旋转不变性。

### 2.3 Harris 与 Shi-Tomasi 评分

Harris 和 Stephens（1988）用下面的响应避免显式计算特征值：

$$
R = \det M - k\, (\operatorname{tr} M)^2 = \lambda_1 \lambda_2 - k\, (\lambda_1 + \lambda_2)^2, \qquad k \in [0.04, 0.06].
$$

$R$ 在角点处为大的正数，在边缘处为负（那里 $\lambda_1\lambda_2 \approx 0$），在平坦区域很小。在上面的算例中，角点给出 $R = 6.25 - 0.05 \cdot 25 = 5.0$，边缘给出 $R = 0 - 0.05 \cdot 6.25 = -0.31$。二者的分界到底在哪里？令 $\lambda_2 = c\,\lambda_1$，则 $R = \lambda_1^2 \,[\,c - k (1 + c)^2\,]$，它为正当且仅当 $k c^2 - (1 - 2k)\, c + k < 0$，即

$$
\frac{\lambda_2}{\lambda_1} > c^\ast(k) = \frac{1 - 2k - \sqrt{1 - 4k}}{2k}, \qquad c^\ast(0.05) = 0.0557 .
$$

所以当 $k = 0.05$ 时，只要较弱方向的强度超过较强方向的约 5.6%，Harris 就认为这个点像角点；$k$ 就是调节这个比例的旋钮。Shi 和 Tomasi（1994）提出了更直接的评分 $\min(\lambda_1, \lambda_2) = \lambda_2$，它来自第 8 节跟踪方程的条件数：较小特征值大的点才适合跟踪。两者之后都要做**非极大值抑制**（non-maximum suppression，只保留在 $(2r+1)^2$ 邻域内得分最大的像素）并设阈值。

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

下图给出检测结果，下方把图像的每个像素画成 $(\lambda_1, \lambda_2)$ 平面上的一个点。边缘构成沿 $\lambda_1$ 轴的长臂，角点是 $R = 0$ 直线上方的点云。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-harris.svg" localized="true" caption="左上：合成图像的 121 个 Harris 角点（红色十字；$k = 0.05$，NMS 半径 4 px，阈值 $0.01\,R_{\max}$）和 145 个 Shi-Tomasi 角点（青色圆；阈值为最大 $\lambda_2$ 的 $0.05$）。右上：Harris 响应，$R > 0$（角点）处为红色，$R < 0$（边缘）处为蓝色；各形状的轮廓是蓝色，其角是红色。下：随机 6000 个像素在 $(\lambda_1, \lambda_2)$ 平面中的位置。黑线 $\lambda_2 = 0.0557\,\lambda_1$ 即 $R = 0$，红色虚线是检测阈值，青色点线是 Shi-Tomasi 阈值。" %}

Harris 角点对旋转和亮度整体平移不变，但对**尺度**不具备不变性：远处看到的角点能装进窗口，而同一个角点近看时就像一条略弯的边缘。第 3 节解决这个问题。几个实用的改进：在最大值附近对得分做二次拟合得到亚像素精度（或者用 OpenCV 的 `cornerSubPix`，它求解使窗口内梯度与指向该点的向量正交的位置）；用自适应非极大值抑制让角点在图像上均匀分布（这对 SLAM 前端很重要）；以及设置角点间最小距离，如实现了 Shi-Tomasi 的 OpenCV `goodFeaturesToTrack`。

下面的交互组件让你亲手感受结构张量。把窗口拖到角点、边缘和平坦区域上；中间的图显示窗口内的梯度 $(I_x, I_y)$，椭圆表示矩阵 $M$。右侧的图属于第 8 节，读到那里就会明白。

{% include widget.liquid name="3d-vision-structure-tensor" height="470" caption="结构张量与 Lucas-Kanade。在图像（合成，160×100 px）上拖动橙色窗口。中：窗口内各像素的梯度向量（浅色为其相反向量，因为 $M$ 无法区分 $\nabla I$ 和 $-\nabla I$）以及 $M$ 的椭圆，半轴分别正比于 $\sqrt{\lambda_1}$ 和 $\sqrt{\lambda_2}$；角点给出胖椭圆，边缘给出细针，平坦区域什么都没有。类别标签由 $R$ 的符号决定；勾选「Harris 响应图」会按 $R$ 给整幅图着色。右：对于平移 $(u, v)$（滑块）后的第二幅图像，每个像素的光流约束 $I_x u + I_y v + I_t = 0$ 是 $(u, v)$ 平面中的一条直线；红点为真实运动，绿圈为 Lucas-Kanade 估计。角点处各直线交于一点；边缘上它们相互平行，只能确定法向光流。" %}

## 3. 尺度空间与 SIFT

### 3.1 尺度空间

要在任意大小下都检测到同一结构，我们在所有尺度上观察图像。图像的**高斯尺度空间**（Gaussian scale space）是一族模糊图像

$$
L(\mathbf x; \sigma) = (G_\sigma \ast I)(\mathbf x), \qquad G_\sigma(\mathbf x) = \frac{1}{2\pi\sigma^2} e^{-\lVert\mathbf x\rVert^2 / 2\sigma^2}.
$$

模糊会去掉小于约 $\sigma$ 的细节，而高斯是 $\sigma$ 增大时从不产生新结构的唯一核（Koenderink 1984，Lindeberg 1994）。$L$ 满足热（扩散）方程，我们马上要用到：

$$
\frac{\partial L}{\partial \sigma} = \sigma\, \nabla^2 L, \qquad \nabla^2 = \frac{\partial^2}{\partial x^2} + \frac{\partial^2}{\partial y^2}.
$$

### 3.2 自动尺度选择

若图像放大 $a$ 倍，即 $I'(a\mathbf x) = I(\mathbf x)$，则 $L'(a\mathbf x; a\sigma) = L(\mathbf x; \sigma)$：同一结构出现在尺度 $a\sigma$ 处。但每个空间导数会多出因子 $1/a$。因此乘以 $\sigma$ 的导数，即**尺度归一化导数**（scale-normalized derivative）$\sigma \partial_x$，保持不变。Lindeberg（1998）由此得到一条规则：结构的**特征尺度**（characteristic scale）就是使某个尺度归一化微分响应在尺度方向上取极值的 $\sigma$。对斑点（blob）而言，自然的响应是尺度归一化拉普拉斯 $\sigma^2 \nabla^2 L$。

**高斯斑点的推导。** 设图像是大小为 $s$ 的亮斑 $I(\mathbf x) = e^{-\lVert\mathbf x\rVert^2/2s^2}$。两个高斯卷积时方差相加，所以 $L(\mathbf x; \sigma) = \frac{s^2}{s^2 + \sigma^2}\, e^{-\lVert\mathbf x\rVert^2 / 2(s^2 + \sigma^2)}$。$A e^{-r^2/2v}$ 在中心处的拉普拉斯为 $-2A/v$，所以在斑点中心

$$
\sigma^2 \nabla^2 L(\mathbf 0; \sigma) = -\frac{2\,\sigma^2 s^2}{(s^2 + \sigma^2)^2}.
$$

对 $t = \sigma^2$ 求导并令其为零，得 $(s^2 + t) - 2t = 0$，所以幅值在 $\sigma = s$ 处达到峰值 $1/2$：无论怎样缩放，检测器报告的正是斑点自身的大小。对半径为 $r$ 的圆盘，同样的实验在 $\sigma = r/\sqrt 2$ 处取峰。如果没有因子 $\sigma^2$，响应只会随 $\sigma$ 衰减，每次都选中最细的尺度。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-scale-selection.svg" localized="true" caption="左：半径 $r = 3, 6, 12$ 的亮圆盘中心处的尺度归一化拉普拉斯 $-\sigma^2\nabla^2 L$，用 `scipy.ndimage.gaussian_laplace` 在 $\sigma$ 的 0.1 网格上计算。峰值位于 $\sigma = 2.2, 4.2, 8.4$，与 $r/\sqrt 2 = 2.12, 4.24, 8.49$（点线）相差不超过一个网格步长：圆盘加倍，选出的尺度也加倍。右：大小 $s = 6$ 的高斯斑点。数值响应（紫色）与闭式解 $2\sigma^2 s^2/(s^2+\sigma^2)^2$（黑色）一致，在 $\sigma = 6.0$ 处取峰值 $1/2$。高斯差分除以 $k - 1$（橙色，$k = 2^{1/3}$）形状相同，由于它比较的是 $\sigma$ 与 $k\sigma$，峰值位于 $\sigma = 5.3 \approx s/\sqrt k$，峰值为 0.443。" %}

### 3.3 高斯差分

在许多尺度上计算 $\nabla^2 L$ 代价很高。Lowe 的 SIFT（2004）用一个由热方程直接得到的廉价近似。对 $\sigma$ 作有限差分：

$$
L(\mathbf x; k\sigma) - L(\mathbf x; \sigma) \approx (k\sigma - \sigma)\, \frac{\partial L}{\partial \sigma} = (k - 1)\, \sigma^2 \nabla^2 L .
$$

相邻两个尺度的**高斯差分**（difference of Gaussians，DoG）本身就是尺度归一化拉普拉斯，只差一个不改变极值位置的常数因子 $k - 1$。尺度空间按**组**（octave）组织：组内模糊按 $\sigma_0 2^{s/S}$ 几何增长（Lowe 论文中 $S = 3$ 个间隔、$\sigma_0 = 1.6$）；$\sigma$ 翻倍一次后，图像下采样一半，开始下一组。每组需要 $S + 3$ 幅高斯图像来得到 $S + 2$ 幅 DoG 图像，这样才能在 $S$ 层中搜索极值，且每层上下都有相邻层。

关键点是 DoG 值大于（或小于）空间与尺度 $3 \times 3 \times 3$ 邻域中全部 26 个邻居的像素。随后对每个候选点进行细化和筛选：

1. **亚像素和亚尺度定位。** 在采样点附近对 $D$ 拟合二次函数：$D(\mathbf z + \boldsymbol\delta) \approx D + \mathbf g^\top \boldsymbol\delta + \frac12 \boldsymbol\delta^\top H \boldsymbol\delta$，其中 $\mathbf z = (x, y, \sigma)$，梯度 $\mathbf g$ 和 Hessian $H$ 由有限差分得到。极值位于 $\hat{\boldsymbol\delta} = -H^{-1}\mathbf g$；若任一分量超过 0.5，则极值属于相邻的采样点。
2. **低对比度。** 若 $\lvert D(\hat{\mathbf z})\rvert = \lvert D + \frac12 \mathbf g^\top \hat{\boldsymbol\delta} \rvert$ 低于阈值则剔除（Lowe 对 $[0, 1]$ 范围的图像用 0.03）。
3. **边缘。** DoG 沿边缘也有强响应，而那里沿边缘方向的位置是不确定的。设 $D$ 的 $2 \times 2$ 空间 Hessian 为 $H_s$，特征值为 $\alpha = r\beta$，则比值 $(\operatorname{tr} H_s)^2/\det H_s = (r + 1)^2/r$ 随 $r$ 增大。只有当 $(\operatorname{tr} H_s)^2 / \det H_s < (r_{\max} + 1)^2 / r_{\max}$ 时才保留该点；Lowe 用 $r_{\max} = 10$，界为 12.1。这又是 Harris 的思想，只是作用在 Hessian 而不是结构张量上。

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

### 3.4 方向与 SIFT 描述子

**方向。** 在每个关键点周围、在它的尺度上，建立一个 36 个区间的梯度方向直方图，按梯度幅值和标准差 $1.5\sigma$ 的高斯加权。最高峰给出方向 $\theta$；其他高于最高峰 80% 的峰各自产生一个具有该方向的额外关键点（在我们的图像上，139 个位置变成了 183 个带方向的关键点）。对峰值附近三个区间拟合抛物线，可以把 $\theta$ 细化到 10° 区间宽度以下。

**描述子。** 把一个方形窗口按 $\theta$ 旋转、按 $\sigma$ 缩放：$4 \times 4$ 个单元，每个宽 $3\sigma$。在每个单元中累积一个 8 区间的梯度方向直方图（方向相对 $\theta$ 测量），按幅值以及覆盖整个窗口的高斯加权。拼接后得到 $4 \times 4 \times 8 = 128$ 个数。先归一化为单位长度（对对比度不变），再把每个分量截断到 0.2（使非线性光照变化或镜面高光带来的少数大梯度无法主导），然后再次归一化。这个描述子是边缘方向的粗略空间布局，能容忍单元内的小平移和小形变。Lowe 还把每个样本三线性插值到相邻的单元和区间，以避免边界效应；我们的紧凑版本使用硬分箱。

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

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-dog-sift.svg" caption="左：`sift(img)` 得到的 183 个带方向的 DoG 关键点；每个圆的半径为 $\sqrt2\,\sigma$（特征尺度为 $\sigma$ 的圆盘的半径），红色短线表示 $\theta$。小关键点位于角点和细结构上，大关键点覆盖整个形状。中：一个关键点（$\sigma = 3.89$ px，$\theta = 12°$）及其旋转的 $4 \times 4$ 网格，每个单元宽 $3\sigma$（橙色）；每个单元中的 8 根红色辐条是该单元的方向直方图，画在图像坐标系中。右：得到的 128 维向量，单位长度，在最后一次归一化之前各分量截断到 0.2（最大分量 0.28，非零分量 61 个）。" %}

值得了解的变体：**RootSIFT**（Arandjelović 与 Zisserman，CVPR 2012）对 L1 归一化后的 SIFT 向量逐元素开平方，使欧氏距离变成 Hellinger 核，是一个零成本且稳定的改进；**SURF**（Bay 等，ECCV 2006）用积分图上的盒滤波器近似 Hessian；**KAZE/AKAZE** 用非线性扩散代替高斯模糊，使边缘在各尺度上保持锐利。SIFT 专利已于 2020 年到期，自 4.4 版起 SIFT 位于 OpenCV 的主模块中。SIFT（在 GPU 上计算）至今仍是 COLMAP 的默认特征。

## 4. 二进制特征：FAST、BRIEF 与 ORB

SIFT 精确，但对小处理器上的实时系统来说太慢。ORB（Rublee 等，ICCV 2011）是 ORB-SLAM 的前端，它结合了两种快速的组件并修补了它们的弱点。

**FAST**（Rosten 与 Drummond，ECCV 2006）检查候选点 $\mathbf p$ 周围半径为 3 的圆上的 16 个像素。若存在至少 $n$ 个连续的圆上像素都比 $I(\mathbf p) + t$ 亮，或都比 $I(\mathbf p) - t$ 暗，则该点是角点（常用的 FAST-9 中 $n = 9$）。大多数像素只需看 16 个中的 2 到 4 个就能被排除；Rosten 和 Drummond 甚至学习了一棵决策树来以最优顺序进行这些测试。FAST 没有方向也没有尺度，并且会在边缘上响应，因此 ORB 用 Harris 响应对 FAST 点排序、保留最好的那些，并在图像金字塔上运行检测器（OpenCV 默认：8 层，比例 1.2）。

**BRIEF**（Calonder 等，ECCV 2010）用 $n_b = 256$ 个二值测试描述一个平滑后的 $S \times S$ 图块：对于固定的随机偏移对模式，当 $I(\mathbf p + \mathbf a_k) < I(\mathbf p + \mathbf b_k)$ 时第 $k$ 位为 1；效果最好的变体中偏移独立同分布地取自 $\mathcal N(0, S^2/25)$。匹配使用**汉明距离**（Hamming distance），即不同位的个数，也就是异或之后做 popcount：每 64 位只需一两条机器指令，远比 128 维浮点距离便宜。256 位的描述子占 32 字节，而浮点 SIFT 描述子占 512 字节。

BRIEF 不具备旋转不变性：图像一旋转，每个测试比较的就是不同的像素。ORB 用**灰度质心**（intensity centroid）测量方向：取关键点周围圆盘内的图块矩 $m_{pq} = \sum x^p y^q I(x, y)$，角度

$$
\theta = \operatorname{atan2}(m_{01}, m_{10})
$$

从关键点指向图块按亮度加权的中心。测试模式在采样前按 $\theta$ 旋转（**steered BRIEF**）。ORB 论文注意到一个副作用：模式被旋转校正后，各位之间的相关性变强，均值偏离 0.5，使描述子的区分能力下降。因此 ORB 用 **rBRIEF** 代替随机模式：在训练图块上贪心地选出 256 对方差高、相关性低的测试。

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

输出同时显示了两种效应。在两幅图像之间 25° 旋转和 0.8 缩放下，旋转校正使真实对应的汉明距离中位数减半（256 位中从 45 降到 23），并把最近邻准确率从 48% 提高到 65%。但无关点之间的距离中位数也从 129（几乎正好是独立随机位所期望的 128）下降到 77：校正后的各位不再独立，这正是提出 rBRIEF 的动机。剩余的错误主要来自尺度变化，这段单尺度代码忽略了它，而 ORB 用金字塔处理它。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-fast-brief.svg" localized="true" caption="左：合成图像一个角点处的 FAST 分段测试（中心像素为绿色，$t = 0.1$）。16 个圆上像素比 $I_p - t$ 暗时为蓝色，比 $I_p + t$ 亮时为红色，否则为黄色；13 个连续的蓝色像素使它成为 FAST-9 角点（位于图像内部的 40 个最强 Harris 角点中，全部 37 个都通过测试）。中：$31 \times 31$ 图块上 256 对 BRIEF 测试中的 48 对，按灰度质心角 $\theta = 45°$（橙色箭头）旋转校正。右：25° 旋转下 60 个角点的真实对应（绿色）与无关点（红色）之间的汉明距离；虚线：普通 BRIEF，实线：steered BRIEF。" %}

## 5. 描述子匹配

### 5.1 最近邻与比值检验

给定图像 1 中的描述子 $\\{\mathbf d_i\\}$ 和图像 2 中的 $\\{\mathbf d'_j\\}$，$i$ 最直接的匹配是其**最近邻** $j^\ast = \arg\min_j \lVert \mathbf d_i - \mathbf d'_j \rVert$。问题在于每个关键点都有最近邻，包括大量在图像 2 中根本不可见、或位于重复纹理上的点。绝对距离阈值效果不好，因为有些描述子比另一些更具区分性。

Lowe 的**比值检验**（ratio test）比较最佳距离 $d_1$ 和次佳距离 $d_2$，仅当

$$
\frac{d_1}{d_2} < \tau, \qquad \tau \approx 0.7 \text{ 到 } 0.8
$$

时保留匹配。直觉是：正确的匹配必须明显优于错误候选中最好的那个，而 $d_2$ 估计了在描述子空间的这一区域中错误候选能接近到什么程度。对于重复图案上的模糊点，$d_1 \approx d_2$，即便碰巧正确也会被拒绝。Lowe 在他的数据上报告，$\tau = 0.8$ 去掉了 90% 的错误匹配，而丢弃的正确匹配少于 5%。

另外两个过滤器也是标准做法：**互为最近邻**（mutual nearest neighbour，交叉）检查，即只有当 $i$ 在反方向上也是 $j$ 的最近邻时才保留 $(i, j)$；以及强制一对一匹配。

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

若匹配落在真实位置 `apply_h(H_true, x)` 的 3 px 以内，就算作正确。单纯的最近邻给出 183 个匹配，其中 91 个正确（50%）；比值检验加互为最近邻检查保留 85 个匹配，其中 83 个正确（98%）。为了更可靠地看清其中的权衡，下图汇总了 8 个随机场景。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-matching.svg" localized="true" caption="上：合成图像与其变换副本之间全部 183 个最近邻匹配，按第 6 节 RANSAC 的结果着色（绿：估计单应的内点，红：外点）；橙色四边形是用估计的 $H$ 映射后的图像 1 边界。下，汇总 8 个场景（1382 个最近邻匹配，609 个正确）：左，正确与错误匹配的 $d_1/d_2$ 分布；右，精确率和召回率（保留下来的正确匹配所占比例）随阈值 $\tau$ 的变化。$\tau = 0.8$ 时精确率 94.3%，召回率 92.1%；加上互为最近邻检查后精确率升至 97.2%，召回率 90.8%；$\tau = 0.7$ 时为 98.9% 和 87.5%。" %}

### 5.2 扩大规模

暴力匹配的代价是 $O(N_1 N_2 D)$：两幅各有 8000 个 SIFT 特征的图像约需 $8 \times 10^9$ 次乘加，GPU 几毫秒即可完成，CPU 则不行。在 CPU 上或大规模图像集合中，使用**近似最近邻**（approximate nearest neighbour）搜索：随机 kd 树和层次 k-means 树（Muja 与 Lowe 的 FLANN 库）、乘积量化或基于图的索引（如 faiss 库）。在运动恢复结构中，更大的问题是到底要匹配哪些**图像对**：穷举匹配随图像数呈二次增长，因此 COLMAP 为视频提供顺序匹配，为无序集合提供词汇树检索，即先通过量化视觉词袋比较图像。

## 6. 鲁棒估计：RANSAC 及其后继

### 6.1 最小二乘为什么失败

即使经过比值检验，仍有一些匹配是错的，而后续几篇的几何问题要求我们在含外点的对应上拟合模型（单应、基础矩阵或本质矩阵、相机位姿）。最小二乘最小化 $\sum_i e_i^2$，因此一个偏差 300 px 的匹配与 10,000 个偏差 3 px 的匹配贡献相同：最小二乘的**崩溃点**（breakdown point）为零，即一个任意坏的点就能把估计拉到任意远。用归一化 DLT 对全部 183 个最近邻匹配（一半是错的）拟合单应，图像角点会被映射到离正确位置多达 381 px 的地方。

### 6.2 RANSAC

**RANSAC**（随机抽样一致，RANdom SAmple Consensus；Fischler 与 Bolles，1981）把问题反过来：不是对全部数据拟合然后祈祷，而是对尽可能小的随机子集拟合，再检查有多少点与之一致。

1. 抽取 $s$ 个对应构成的**最小样本**（minimal sample），即确定模型所需的最少数量：直线 $s = 2$，单应 4，本质矩阵 5，基础矩阵 7 或 8，由 2D-3D 匹配求相机位姿（P3P）为 3。
2. 用样本拟合**假设**（hypothesis）。
3. 计算每个对应的残差 $e_i$ 和**一致集**（consensus set）$\mathcal I = \\{ i : e_i < t \\}$。
4. 保留一致集最大的假设；重复 $N$ 次。
5. 用最佳假设的全部内点以最小二乘重新估计模型（对几何模型还要做非线性优化）。

阈值 $t$ 由噪声水平决定。若内点残差在每个坐标上服从标准差为 $\sigma$ 的高斯分布，则 $e^2/\sigma^2$ 服从自由度等于模型余维数的 $\chi^2$ 分布；接受 95% 内点的阈值，对于点到直线距离（直线、使用 Sampson 距离的基础矩阵）为 $t^2 = 3.84\,\sigma^2$，对于二维转移误差（单应）为 $t^2 = 5.99\,\sigma^2$，见 Hartley 与 Zisserman 书中的表。

### 6.3 需要多少次采样？

设内点比例为 $w$，外点比例 $\varepsilon = 1 - w$。若各次采样独立，一个 $s$ 点样本不含外点的概率为 $w^s$，所以 $N$ 个样本全被污染的概率为 $(1 - w^s)^N$。要求它不超过 $1 - p$（$p$ 为期望的置信度），得到

$$
N = \left\lceil \frac{\log(1 - p)}{\log(1 - w^s)} \right\rceil .
$$

**算例**：单应（$s = 4$），一半匹配是错的（$w = 0.5$），$p = 0.99$：$w^4 = 0.0625$，$N = \lceil \log 0.01 / \log 0.9375 \rceil = \lceil -4.605 / -0.0645 \rceil = \lceil 71.4 \rceil = 72$。由于 $w^s$ 随 $s$ 指数缩小，最小样本的大小影响巨大：

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

外点占 70% 时，本质矩阵的五点法需要 1893 次采样，而八点法需要 70188 次。这就是为什么有那么多研究投入到**最小解算器**（minimal solver，五点法、P3P 以及更多），也是为什么像比值检验这样好的预过滤会带来双重回报：它降低了 $\varepsilon$，而 $N$ 随之指数下降。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-ransac-iterations.svg" localized="true" caption="RANSAC 以概率 $p = 0.99$ 至少抽到一个不含外点的最小样本所需的采样次数 $N$，随外点比例 $\varepsilon$ 的变化，最小样本大小从 $s = 2$（直线）到 $s = 8$（基础矩阵，八点法）。紫点是算例（$s = 4$，$\varepsilon = 0.5$，$N = 72$）。纵轴为对数坐标：最小样本每多一个点，$N$ 大约乘以 $1/w$。" %}

内点比例事先未知，因此实现中使用**自适应**规则：从 $N = \infty$（或一个上限）开始，每找到一个更好的假设，就把 $w$ 设为它的内点比例并重新计算 $N$。最佳模型只会变好，所以 $N$ 只会减小。下面是在 183 个最近邻匹配（一半是错的）上估计单应的 RANSAC：

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

这次运行值得追踪一下。最初几个假设有 5、6、9、14 个内点；第 13 次采样找到 37 个（$N$ 降到 4130），第 49 次找到 82 个（$N = 168$），第 107 次找到 89 个，在 $p = 0.999$ 下 $N = 120$；循环在第 120 次停止。用这 89 个内点重新拟合后，恢复出全部 91 个正确匹配，最终的单应把图像角点映射到距真值 0.40 px 以内。下图在直线上展示同样的过程，那里每个假设都能画出来。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-ransac-steps.svg" caption="在 60 个点上用 RANSAC 拟合直线，其中 36 个内点（噪声 $\sigma = 1$）和 24 个均匀分布的外点，阈值 $t = 2.5$（紫色带）。红圈：最小样本；绿色：距假设不超过 $t$ 的点。第 1 次采样（5 个内点）和第 2 次采样（4 个内点）包含外点；第 9 次采样不含外点，得到 35 个内点，之后的采样都没能超过它。右下：在这些内点上的总体最小二乘重新拟合（紫色，与真实直线（点线）的误差为 0.52 $\sigma$），以及在全部点上的最小二乘（红色虚线，误差 9.5 $\sigma$）。" %}

下面的组件让你亲手运行 RANSAC。提高外点比例，看所需的 $N$ 如何爆炸，尤其是圆（$s = 3$）；把阈值降到噪声以下，看好的假设如何失去内点。

{% include widget.liquid name="3d-vision-ransac" height="560" caption="RANSAC 实验场。100 个点来自一条带噪声 $\sigma$ 的直线或圆，外点比例为 $\varepsilon$。「单步」抽取一个最小样本（红圈），并显示其假设和 $\pm t$ 带（紫色）；「运行」一直继续到 $k \geq N$，其中 $N = \lceil\log(1-p)/\log(1-\hat w^s)\rceil$ 使用目前最佳模型的内点比例 $\hat w$（$p = 0.99$）。绿色：最佳模型的重新拟合及其内点；红色虚线：全部点上的最小二乘。图表显示每个假设的内点数（圆点）、目前最佳（绿色）、真实内点数（虚线）、自适应的 $N$（紫色）以及按真实 $\varepsilon$ 计算的 $N$（灰色）。点击图中空白处添加外点，拖动点可移动它，也可以切换到 MSAC 或启用 LO。" %}

### 6.4 不只是数内点

朴素的 RANSAC 有几个弱点，后来的一系列工作逐一修补了它们。

**评分。** 数内点忽略了它们拟合得有多好：所有把同样的点放进带内的假设得分相同，不管这些点离带的中心有多远。**MSAC**（M-estimator SAC；Torr 与 Zisserman，2000）用截断二次损失给假设评分：

$$
C = \sum_i \rho(e_i), \qquad \rho(e) = \min(e^2, t^2),
$$

内点贡献其残差平方，外点贡献一个常数。同一篇论文中的 **MLESAC** 更进一步，最大化高斯内点与均匀外点混合模型的似然。RANSAC 本身是 $e < t$ 时 $\rho(e) = 0$、否则为常数的特例。

**公式的乐观。** 迭代次数公式假设任何不含外点的样本都能得到一个收集全部内点的模型。对有噪声的数据这不成立：两个恰好靠得很近的内点所确定的直线，角度可能错得很厉害。Chum、Matas 和 Kittler（2003）观察到 RANSAC 实际需要的采样次数比预测的多，并提出了 **LO-RANSAC**：每找到一个新的最佳模型，就运行一次**局部优化**（local optimization），例如在其内点上迭代最小二乘（或在内点中抽取非最小子集的内层 RANSAC），若结果得分更好就保留。新的最佳模型只出现约 $\log N$ 次，所以 LO 的开销很小。

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

在公式给出的迭代预算下（$\varepsilon = 0.6$ 时 $N = 27$），所有鲁棒变体的中位误差都比最小二乘好约 30 倍。有了最终的重新拟合，RANSAC 与 MSAC 在这个简单问题上几乎相同；LO-RANSAC 主要削减了**长尾**：95 分位误差从 1.57 降到 0.59，因为那些最佳假设来自质量差（但不含外点）样本的运行被局部优化挽救了。下图对所有外点比例重复这个实验，并直接展示公式有多乐观。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-robust-variants.svg" localized="true" caption="左上：最小二乘、RANSAC（阈值内为 0，阈值外为常数，画作 $t^2$）和 MSAC（截断二次）的损失 $\rho(e)$。下：直线误差（在数据范围内拟合直线与真实直线之间的最大距离，以噪声 $\sigma$ 为单位）随外点比例的变化，每个点 150 次试验，$N$ 取自 $p = 0.99$ 的公式；实线：中位数，点线：95 分位。右上：$\varepsilon = 0.7$ 时，$k$ 次采样后最佳模型误差低于 $1\sigma$ 的概率（300 次试验），与公式 $1 - (1 - w^2)^k$（虚线）对比。在公式给出的 $N = 49$（点线）处，公式承诺 0.99；MSAC 达到 0.89，LO-RANSAC 达到 0.98。" %}

**更多改进**，现代库会把它们组合起来：

- **PROSAC**（Chum 与 Matas，CVPR 2005）先从描述子得分最好的匹配（例如比值 $d_1/d_2$ 最低）中采样，再逐步扩大候选池。当得分有信息量时，好样本会早得多地出现。
- **退化**（degeneracy）。一个样本可能不含外点却仍定义了错误的模型，例如基础矩阵样本的 8 个点中有 7 个位于同一平面上。DEGENSAC 检测并处理这种情况。
- **USAC**（Raguram 等，TPAMI 2013）是一个把这些部件组装起来的框架：引导采样、用序贯检验（SPRT）提前拒绝坏假设、退化检查和局部优化。
- **MAGSAC 与 MAGSAC++**（Barath 等，CVPR 2019 与 CVPR 2020）去掉了最难调的参数，即阈值 $t$。MAGSAC++ 不选定单一噪声尺度，而是在直到最大值 $\sigma_{\max}$ 的一系列噪声尺度上对模型质量进行边缘化，从而给每个点一个平滑的权重，而不是硬性的内点/外点判定；它还用这些权重通过迭代重加权最小二乘来精化模型。它是当前许多流水线的默认选择，在 OpenCV 中为 `cv2.USAC_MAGSAC`。

## 7. 学习式特征与匹配器

手工设计的流水线会在可预见的情形下失败：强烈的光照变化（白天与夜晚）、大视角变化、弱纹理或重复纹理，以及运动模糊。2018 年以来，流水线的每个阶段都已从数据中学习；到 2026 年，学习式匹配器已是大多数用于 SfM 和视觉定位的研究系统中的默认选择。

### 7.1 学习式检测器与描述子：SuperPoint 及其后继

**SuperPoint**（DeTone、Malisiewicz 与 Rabinovich，CVPR Workshops 2018）是一个全卷积网络，一次前向传播就为整幅图像计算关键点和描述子。共享的 VGG 风格编码器把图像缩小 8 倍；**检测头**为每个 $8 \times 8$ 单元输出一个 65 路 softmax（64 个像素位置加一个"无关键点"的垃圾箱（dustbin）），**描述子头**输出 256 维描述子图，在关键点处插值并归一化。标签从哪里来？检测器先在角点已知的合成形状上训练（得到的网络叫 MagicPoint），然后用**单应适应**（Homographic Adaptation）为真实图像生成标签：用许多随机单应变换每幅图像，在每个变换结果上运行检测器，把检测结果映射回来并汇总。在所有变换下都能稳定找到的点成为标签，这直接训练了第 1 节所要求的可重复性。描述子用对比损失在已知单应相关的图像对上训练。

后来的检测器和描述子改变了训练信号并提高了效率：**DISK**（Tyszkiewicz 等，NeurIPS 2020）把关键点选择和匹配视为随机策略，用策略梯度训练以最大化正确匹配的数量；**ALIKED** 以较低代价加入了可变形描述子；**XFeat**（Potje 等，CVPR 2024）是为在 CPU 上实时运行而设计的轻量网络。

### 7.2 把学习式匹配看作最优传输：SuperGlue

最近邻匹配一次只看一对描述子。**SuperGlue**（Sarlin 等，CVPR 2020）同时看两幅图像的全部关键点。一个注意力图神经网络交替进行**自注意力**（同一图像的关键点之间，让一个点了解其邻域）和**交叉注意力**（两幅图像之间，让它寻找对应），输入是描述子加上关键点位置的编码。结果是图像 A 的 $M$ 个关键点与图像 B 的 $N$ 个关键点之间的得分矩阵 $S_{ij}$。

分配必须是**部分的**：每个关键点至多匹配一次，而有些关键点（被遮挡、在另一视图之外）不匹配任何点。因此 SuperGlue 添加一行一列得分为可学习参数 $\alpha$ 的**垃圾箱**，并求增广的 $(M+1) \times (N+1)$ 矩阵的软分配 $P$：真实的行和列各自和为 1，而垃圾箱的行和列分别最多吸收 $N$ 和 $M$ 个点。这是一个熵正则化的**最优传输**（optimal transport）问题，用 **Sinkhorn 算法**求解：交替缩放 $e^{S}$ 的行和列，直到满足边缘约束。在对数域中：

$$
u_i \leftarrow \log a_i - \log \sum_j e^{Z_{ij} + v_j}, \qquad v_j \leftarrow \log b_j - \log \sum_i e^{Z_{ij} + u_i}, \qquad P_{ij} = e^{Z_{ij} + u_i + v_j}.
$$

每一步都是可微的，因此整个匹配器用带深度的已知位姿图像所提供的真值对应进行端到端训练。

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

这个玩具例子展示了按行取最大值做不到的两件事。$A_1$ 略微偏好 $B_2$（8.4 对 7.8），但 $B_2$ 显然属于 $A_2$；由于每一列只能用一次，传输把 $A_1$ 移到了 $B_1$（0.75）。$A_3$ 没有好的对应，它的质量流向垃圾箱（0.98），而不是与 $B_1$ 产生错误匹配。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-sinkhorn.svg" caption="在代码中的玩具得分上运行带垃圾箱的 Sinkhorn。左：带垃圾箱得分 $\alpha = 4$（行和列 $\varnothing$）的增广得分矩阵。中：一次行归一化和一次列归一化后的传输方案 $P$。右：100 次迭代后；真实行和列之和为 1，垃圾箱行之和为 3，垃圾箱列之和为 4（即另一幅图像的关键点数）。青色方框：各行最大值，现在是一对一的：尽管 $S_{12} > S_{11}$，仍有 $A_1 \to B_1$，以及 $A_3 \to \varnothing$。" %}

### 7.3 LightGlue

**LightGlue**（Lindenberger、Sarlin 与 Pollefeys，ICCV 2023）重新审视了 SuperGlue 的设计，使其更快、更准、更容易训练。有两个突出的想法。它是**自适应的**：每层之后由一个小头预测匹配是否已经足够可信；容易的图像对（重叠大、变化小）几层后就退出，而被确信无法匹配的关键点会在后续层中被剪掉。它还用一种更轻量的分配代替了 Sinkhorn 迭代，把两两相似度与每个点的**可匹配性**（matchability）得分结合起来。作者报告，在典型户外条件下，其精度接近稠密匹配器 LoFTR，速度约为其 8 倍。预训练权重覆盖 SuperPoint、DISK、ALIKED，甚至经典的 SIFT 特征，因此 LightGlue 是对现有 SIFT 流水线的一个简单升级。

### 7.4 无检测器与稠密匹配：LoFTR、RoMa 及其后

先检测后描述在检测器不响应的地方会失败：白墙、均匀的地板、重复的建筑立面。**无检测器**（detector-free）匹配器跳过检测器。**LoFTR**（Sun 等，CVPR 2021）在 1/8 和 1/2 分辨率上提取特征图，用交替的自注意力和交叉注意力变换两幅图像的粗特征图，用双 softmax（或最优传输）匹配所有粗单元，再在细特征图的小窗口内把每个粗匹配细化到亚像素精度。由于注意力赋予每个单元全局感受野，LoFTR 能在仅靠描述子会产生歧义的弱纹理区域找到匹配。

**稠密**（dense）匹配器更进一步，为每个像素估计一个变形（一个匹配和一个置信度）。**RoMa**（Edstedt 等，CVPR 2024）把冻结的 DINOv2 基础模型特征用于粗略而鲁棒的匹配，把专门的卷积网络特征用于精确细化，并把粗匹配视为对锚点位置的分类，这比回归更能处理多峰歧义。其后继 **RoMa v2**（arXiv 2511.15706，2025 年 11 月；作者所在大学的论文记录将其列为 ECCV 2026 发表论文）着重于速度、内存和精选的训练数据组合。稠密匹配器是当今处理困难图像对最鲁棒的选择，代价也比稀疏匹配器高得多。

两条相关路线（截至 2026 年 11 月）：**MASt3R**（Leroy 等，ECCV 2024）为一对图像预测稠密的三维点图，并在这个以三维为依据的空间中匹配，把匹配直接与第 9 篇的前馈重建模型联系起来；**MatchAnything**（He 等，arXiv 预印本 2501.07556，2025 年 1 月）在合成的跨模态图像对（例如可见光与热红外，或医学模态）上预训练无检测器匹配器。

实践中：当速度或许可证要紧且图像相似时，SIFT 或 ORB 仍然不错；SuperPoint 或 ALIKED + LightGlue 是 SfM 和定位的强力默认选择；LoFTR、RoMa 及其后继在困难图像对上物有所值。它们最后仍都要交给鲁棒估计器：学习式匹配器降低了外点比例，但并没有消除对 RANSAC 的需要。

## 8. 光流：沿时间的匹配

### 8.1 亮度恒定与孔径问题

在视频中，相邻帧之间只差一个小运动，我们希望为每个像素都得到对应，即**光流**（optical flow）$\mathbf d(\mathbf x) = (u, v)$。假设一个点在运动中保持亮度（**亮度恒定**，brightness constancy）：$I_2(\mathbf x + \mathbf d) = I_1(\mathbf x)$。对小的 $\mathbf d$ 作泰勒展开得

$$
I_x u + I_y v + I_t = 0, \qquad I_t = I_2(\mathbf x) - I_1(\mathbf x).
$$

一个方程，两个未知数：每个像素只把 $\mathbf d$ 约束在 $(u, v)$ 平面中的一条直线上。只有沿梯度方向的分量，即**法向光流** $-I_t \nabla I / \lVert \nabla I \rVert^2$，是确定的。这就是第 1 节中的孔径问题，现在写成了方程：透过一个小孔，运动的边缘只暴露出它垂直于自身方向的运动。

### 8.2 Lucas-Kanade

Lucas 和 Kanade（1981）假设 $\mathbf d$ 在一个小窗口内为常数，用最小二乘求解叠在一起的约束：

$$
\min_{\mathbf d} \sum_{\mathbf x \in W} \big( \nabla I^\top \mathbf d + I_t \big)^2
\quad\Longrightarrow\quad
\underbrace{\sum_W \begin{pmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{pmatrix}}_{M}\, \mathbf d = -\sum_W \begin{pmatrix} I_x I_t \\ I_y I_t \end{pmatrix}.
$$

这个矩阵正是第 2 节中**同一个结构张量** $M$。角点检测与光流估计是一枚硬币的两面：恰恰在 $M$ 条件良好的地方，$\mathbf d$ 才被良好地确定，这也是 Shi 和 Tomasi 那篇关于跟踪的论文标题叫"Good features to track"的原因。在边缘上，$M$ 接近奇异，窗口仍然只能给出法向光流。

由于线性化只对小运动成立，LK 以**迭代**方式应用（Gauss-Newton）：按当前估计变形 $I_2$，求解更新量，重复。对于大于图像结构尺度的运动，线性化点落在错误的盆地里，因此 LK 在图像金字塔上**由粗到细**运行：先在 1/4 分辨率下估计（那里运动小 4 倍），乘以 2，在 1/2 分辨率下细化，再乘以 2，在全分辨率下细化（Bouguet 在 OpenCV 中的金字塔实现，`calcOpticalFlowPyrLK`）。用金字塔 LK 在序列中跟踪 Shi-Tomasi 角点，就是 **KLT 跟踪器**，至今仍用于视觉惯性里程计系统的前端；前后向检查（从第 2 帧跟踪回第 1 帧，剔除回不到原处的点）能去掉大部分失败。

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

我们的合成图像由大块均匀形状构成，所以单层的收敛盆地异常宽（6 px 的运动仍能收敛）；在自然的、纹理细密的图像上，它通常只有一两个像素。下图直接测量了这一点。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-lucas-kanade.svg" localized="true" caption="上：$15 \times 15$ 窗口中梯度最强的 40 个像素的光流约束 $I_x u + I_y v + I_t = 0$，真实运动 $\mathbf d = (0.6, -0.4)$（红色五角星），画成 $(u, v)$ 平面中的直线。在角点处（$\lambda_2/\lambda_1 = 0.54$），各直线在真值附近相交，最小二乘解（绿圈）一步后为 $(0.58, -0.43)$。在竖直边缘上（$\lambda_2/\lambda_1 = 0.004$），所有直线相互平行：只有法向光流 $(0.6, 0)$ 是确定的，绿色虚线上的任意一点都同样好。下：20 个角点中 LK 收敛到 0.1 px 以内的比例，随运动幅度的变化。单层 LK 在 9 px 以内全部成功，在 24 px 时降到 35%；3 层金字塔在 19.5 px 以内保持全部成功。" %}

### 8.3 从 Horn-Schunck 到 RAFT

Lucas-Kanade 是**局部的**：它在平坦区域和边缘上会失败。Horn 和 Schunck（1981）把光流变成**全局的**：在整幅图像上最小化亮度恒定误差加上平滑项 $\alpha^2 \int (\lVert\nabla u\rVert^2 + \lVert\nabla v\rVert^2)$，由周围区域填补平坦区域。几十年的变分方法不断改进这个能量（鲁棒惩罚、由粗到细的变形、大位移匹配项）。

**RAFT**（Recurrent All-Pairs Field Transforms；Teed 与 Deng，ECCV 2020）用一个学习得到的迭代求解器取代了这种能量最小化。一个 CNN 在 1/8 分辨率上提取两帧的逐像素特征；**全对相关体**（all-pairs correlation volume）存储第 1 帧每个像素与第 2 帧每个像素的点积（一个四维体，池化成金字塔以同时看到大运动）；一个卷积 GRU 从零光流出发，反复在当前估计附近查询相关值并预测更新量，很像一个展开的、学习得到的 Gauss-Newton。RAFT 在 Sintel 和 KITTI 上刷新了最好成绩，并成为后来光流、立体和跟踪网络的骨干；**SEA-RAFT**（Wang、Lipson 与 Deng，ECCV 2024）用混合拉普拉斯损失、直接预测初始光流和刚体运动预训练，使它更简单、更快。长程**点跟踪**（point tracking）网络把这一思想从两帧扩展到整段视频。

## 9. 特征与匹配器的评测

论文会报告多种指标，它们度量的东西不同：

- **可重复率**（repeatability）：在两幅图像的对应位置上都被检测到的关键点比例（用真值几何映射后相距不超过 $\epsilon$ px）。它只评测检测器。
- **匹配得分 / 平均匹配精度**（MMA@$\epsilon$）：（互为最近邻的）匹配中重投影误差小于 $\epsilon$ 的比例，对 $\epsilon$ = 1 到 10 px 作图。HPatches（Balntas 等，CVPR 2017）是一组带真值单应的平面场景，是标准基准；我们的玩具图像对就是它的微缩版。
- **单应估计精度**：估计的 $H$ 把图像角点映射到距真值 $\epsilon$ px 以内的图像对比例（我们的 0.40 px），或这条曲线下的面积。
- **相对位姿 AUC**：对三维场景，用 RANSAC 估计 $E$，分解为旋转和平移（第 4 篇），取两个角度误差中较大者，报告累积误差曲线在 5°、10° 和 20° 以内的面积，数据集如 MegaDepth（户外）和 ScanNet（室内）。
- **下游重建**：Image Matching Challenge 及其基准（Jin 等，IJCV 2021）用整条流水线所得相机位姿的精度来评测。

Jin 等人提出了一个重要的方法论观点：一旦基线被恰当调参（比值阈值、RANSAC 变体及其阈值、特征数量），许多早先的"改进"就消失了，而在仔细设置下，经典的 SIFT 流水线依然有竞争力。比较两个匹配器时，要为二者固定并调好鲁棒估计器，并报告运行时间。

## 10. 用 OpenCV 的实用流程

上面的一切在 OpenCV 中都有，实践中你会用它。下面的代码用 SIFT 和 ORB、比值检验和 MAGSAC++ 运行同样的实验：

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

（这些数字来自我们环境中的 OpenCV 5.0；其他版本可能略有不同。）OpenCV 的 SIFT 比我们的版本找到更多关键点，主要是因为它先把图像放大一倍，多出一组小特征。一些实用建议：

- **先去畸变**，或者至少在几何验证之前用第 2 篇的标定结果对关键点坐标去畸变：RANSAC 中的模型假设的是针孔相机。
- **让特征分布开。** 集中在一个纹理角落的大量匹配对几何的约束很弱。使用网格或自适应非极大值抑制。
- **比值 0.7 到 0.8、互为最近邻检查，然后 RANSAC**，标定良好的图像阈值约 1 到 3 px；无法调阈值时首选 MAGSAC++。
- **检查内点数，而不只是模型。** 内点少于 15 到 30 个通常意味着模型错误或退化，无论其残差多小。
- **注意退化。** 如果场景是平面或者相机只做旋转，单应解释匹配的效果与基础矩阵一样好；第 4 篇会讲如何检测这种情况。
- 遇到困难的图像对时，换匹配器（SuperPoint 或 ALIKED + LightGlue，或稠密匹配器），而不是去调 RANSAC 的设置。

## 动手试试

- 在第 2 节的**结构张量组件**中，找一个 Harris 说"角点"但运动估计仍然很差的地方（提示：加噪声并用小窗口），再在棋盘格上找一个由窗口大小决定是边缘还是角点的位置。
- 在第 6 节的 **RANSAC 组件**中，设 $\varepsilon = 0.8$，比较直线和圆所需的采样次数。然后把阈值设得远低于噪声，看最佳模型的内点数如何崩塌。
- 主页的[交互实验室]({{ '/' | relative_url }}#lab)展示了故事的渲染一侧（路径追踪、高斯泼溅）；本系列接下来的几篇会让这里找到的对应点发挥作用。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Random sample consensus (Fischler, Bolles) | Communications of the ACM | 1981 | [DOI](https://doi.org/10.1145/358669.358692) | RANSAC：拟合最小样本，统计一致集 |
| An iterative image registration technique with an application to stereo vision (Lucas, Kanade) | IJCAI | 1981 | — | Lucas-Kanade 方法：在图像窗口上做 Gauss-Newton |
| Determining optical flow (Horn, Schunck) | Artificial Intelligence | 1981 | [DOI](https://doi.org/10.1016/0004-3702(81)90024-2) | 带平滑先验的全局变分光流 |
| A combined corner and edge detector (Harris, Stephens) | Alvey Vision Conference | 1988 | [DOI](https://doi.org/10.5244/C.2.23) | 结构张量与 Harris 响应 |
| Good features to track (Shi, Tomasi) | CVPR | 1994 | [DOI](https://doi.org/10.1109/CVPR.1994.323794) | 由跟踪推导出的最小特征值准则 |
| Feature detection with automatic scale selection (Lindeberg) | IJCV | 1998 | [DOI](https://doi.org/10.1023/A:1008045108935) | 尺度归一化导数与特征尺度 |
| MLESAC: a new robust estimator with application to estimating image geometry (Torr, Zisserman) | CVIU | 2000 | [DOI](https://doi.org/10.1006/cviu.1999.0832) | MSAC 与 MLESAC：比内点数更好的评分 |
| Locally optimized RANSAC (Chum, Matas, Kittler) | DAGM | 2003 | [DOI](https://doi.org/10.1007/978-3-540-45243-0_31) | LO-RANSAC：精化每个新的最佳模型 |
| Distinctive image features from scale-invariant keypoints (Lowe) | IJCV | 2004 | [DOI](https://doi.org/10.1023/B:VISI.0000029664.99615.94) | SIFT：DoG 检测器、128 维描述子、比值检验 |
| Matching with PROSAC: progressive sample consensus (Chum, Matas) | CVPR | 2005 | [DOI](https://doi.org/10.1109/CVPR.2005.221) | 按匹配质量引导采样 |
| Machine learning for high-speed corner detection (Rosten, Drummond) | ECCV | 2006 | [DOI](https://doi.org/10.1007/11744023_34) | FAST |
| BRIEF: binary robust independent elementary features (Calonder et al.) | ECCV | 2010 | [DOI](https://doi.org/10.1007/978-3-642-15561-1_56) | 二值测试与汉明匹配 |
| ORB: an efficient alternative to SIFT or SURF (Rublee et al.) | ICCV | 2011 | [DOI](https://doi.org/10.1109/ICCV.2011.6126544) | 带方向的 FAST + 旋转的 BRIEF，ORB-SLAM 的前端 |
| USAC: a universal framework for random sample consensus (Raguram et al.) | TPAMI | 2013 | [DOI](https://doi.org/10.1109/TPAMI.2012.257) | 模块化的现代 RANSAC |
| HPatches: a benchmark and evaluation of handcrafted and learned local descriptors (Balntas et al.) | CVPR | 2017 | [arXiv](https://arxiv.org/abs/1704.05939) | 标准的局部描述子基准 |
| SuperPoint: self-supervised interest point detection and description (DeTone et al.) | CVPR Workshops | 2018 | [arXiv](https://arxiv.org/abs/1712.07629) | 通过单应适应学习关键点 |
| SuperGlue: learning feature matching with graph neural networks (Sarlin et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1911.11763) | 注意力 + 最优传输做匹配 |
| MAGSAC++, a fast, reliable and accurate robust estimator (Barath et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1912.05909) | 对噪声尺度边缘化、无需阈值的鲁棒估计 |
| RAFT: recurrent all-pairs field transforms for optical flow (Teed, Deng) | ECCV | 2020 | [arXiv](https://arxiv.org/abs/2003.12039) | 全对相关 + 循环更新 |
| DISK: learning local features with policy gradient (Tyszkiewicz et al.) | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.13566) | 用强化学习端到端训练特征 |
| Image matching across wide baselines: from paper to practice (Jin et al.) | IJCV | 2021 | [arXiv](https://arxiv.org/abs/2003.01587) | 基于位姿的基准；调好的基线很重要 |
| LoFTR: detector-free local feature matching with transformers (Sun et al.) | CVPR | 2021 | [arXiv](https://arxiv.org/abs/2104.00680) | 无检测器的由粗到细匹配 |
| LightGlue: local feature matching at light speed (Lindenberger et al.) | ICCV | 2023 | [arXiv](https://arxiv.org/abs/2306.13643) | SuperGlue 自适应、快速的后继 |
| RoMa: robust dense feature matching (Edstedt et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2305.15404) | 使用基础模型特征的稠密匹配 |
| XFeat: accelerated features for lightweight image matching (Potje et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2404.19174) | 在 CPU 上实时运行的学习式特征 |
| SEA-RAFT: simple, efficient, accurate RAFT for optical flow (Wang et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2405.14793) | 更快、更简单的 RAFT |
| RoMa v2: harder better faster denser feature matching (Edstedt et al.) | ECCV（据作者所在大学的记录） | 2026 | [arXiv](https://arxiv.org/abs/2511.15706) | 精选训练数据、更快的稠密匹配 |

## 学习资源

- R. Szeliski，*Computer Vision: Algorithms and Applications*，第 2 版，2022：第 7 章（特征检测与匹配）、第 8 章（图像对齐，包括 RANSAC）和第 9 章（运动估计与光流）。个人使用可在 [szeliski.org/Book](https://szeliski.org/Book/) 免费获取。
- R. Hartley 与 A. Zisserman，*Multiple View Geometry in Computer Vision*，第 2 版，2004，第 4.7 节（鲁棒估计、RANSAC 迭代次数与 $\chi^2$ 阈值）。
- D. Lowe 的 IJCV 论文非常好读；[作者自存版本](https://www.cs.ubc.ca/~lowe/papers/ijcv04.pdf)是第 3 节的好伴侣。
- OpenCV：特征相关教程（`cv2.SIFT_create`、`cv2.ORB_create`、`cv2.BFMatcher`、`cv2.calcOpticalFlowPyrLK`），以及介绍现代 RANSAC 选项的 [USAC 教程](https://docs.opencv.org/5.0/tutorials/calib3d/usac.html)。
- 代码：[cvg/LightGlue](https://github.com/cvg/LightGlue)（SuperPoint、DISK、ALIKED 和 SIFT + LightGlue）、[magicleap/SuperGluePretrainedNetwork](https://github.com/magicleap/SuperGluePretrainedNetwork)、[Parskatt/RoMa](https://github.com/Parskatt/RoMa)、[danini/magsac](https://github.com/danini/magsac)、[princeton-vl/RAFT](https://github.com/princeton-vl/RAFT)。
- 基准：[HPatches](https://github.com/hpatches)，以及 Jin 等人的 [Image Matching Challenge](https://vision.uvic.ca/image-matching-challenge/)。

## 练习

1. 证明 Harris 响应为正当且仅当 $\lambda_2/\lambda_1 > c^\ast(k) = (1 - 2k - \sqrt{1 - 4k})/(2k)$，并计算 $k = 0.04$ 和 $k = 0.06$ 时的 $c^\ast$。哪个 $k$ 更严格？

   <details markdown="1"><summary>提示</summary>

   把 $\lambda_2 = c\lambda_1$ 代入 $R$ 并除以 $\lambda_1^2 > 0$：$R > 0 \iff kc^2 - (1-2k)c + k < 0$。判别式为 $(1-2k)^2 - 4k^2 = 1 - 4k$，较小的根就是 $c^\ast$。得到 $c^\ast(0.04) = 0.0436$，$c^\ast(0.06) = 0.0685$：$k$ 越大，要求第二个方向越强，所以越严格。
   </details>

2. 对第 3.2 节的高斯斑点，求出 DoG 响应 $L(\mathbf 0; k\sigma) - L(\mathbf 0; \sigma)$ 的闭式表达，并证明它在 $\sigma$ 方向上的极值位于 $\sigma = s/\sqrt k$ 附近，而不是 $\sigma = s$。这个偏差对匹配有影响吗？

   <details markdown="1"><summary>提示</summary>

   $L(\mathbf 0; \sigma) = s^2/(s^2 + \sigma^2)$。DoG 比较的是 $\sigma$ 与 $k\sigma$，所以它测量的是介于二者之间的某个尺度上的拉普拉斯，大致为几何平均 $\sqrt k\,\sigma$；令 $\sqrt k\,\sigma = s$ 得 $\sigma = s/\sqrt k$，对 $s = 6$ 为 5.35，与图中一致（5.3）。这个偏差在每幅图像中都是同一个常数因子，所以两个匹配关键点的尺度之比（这才是关键）不受影响。
   </details>

3. 你的匹配器产生 2000 个匹配，外点占 70%，一次假设加验证耗时 0.2 ms。估计 $p = 0.99$ 时 RANSAC 在单应、五点法本质矩阵和八点法基础矩阵上的耗时。如果比值检验把外点比例降到 40%，能省多少？

   <details markdown="1"><summary>提示</summary>

   查表：外点 70% 时分别需要 567、1893 和 70188 次采样，约 0.11 s、0.38 s 和 14 s。外点 40% 时，`ransac_iterations(0.4, s)` 给出 34、57 和 272 次：三者都不到 0.06 s。降低 $\varepsilon$ 对大的 $s$ 帮助呈指数级地更大。
   </details>

4. 检验迷你 SIFT 的旋转不变性：把合成图像旋转 0°、30°、60° 和 90°（用 `warp_homography`），分别用正常的描述子和在 `sift` 中把 $\theta$ 强制设为 0 的描述子，测量通过比值检验的匹配中正确的比例。解释结果。

   <details markdown="1"><summary>提示</summary>

   写一个 `sift` 的副本，不再遍历 `orientations`，而是追加 `sift_descriptor(..., 0.0)`，再用 `match_descriptors` 和已知的旋转统计正确匹配。我们得到：有方向分配时正确匹配为 183/183、99/99、96/97 和 115/115；$\theta = 0$ 时为 139/139、0/1、0/4 和 1/1。没有测得的方向，描述子网格始终与图像坐标轴对齐，所以即使是 90° 旋转（它把每个 8 区间直方图移动 2 个区间，并打乱各单元的位置）也会破坏匹配。
   </details>

5. 给单层的 `lk_window` 加上前后向检查：把每个角点从 $I$ 跟踪到 $J$，再从取整后的终点出发从 $J$ 跟踪回 $I$，若回不到 0.5 px 以内就剔除该角点。对第 8.2 节中 12 px 的运动，这个检查能抓住 6 次失败跟踪中的几次？又会错误剔除几次正确的跟踪？为什么？

   <details markdown="1"><summary>提示</summary>

   别忘了取整时丢掉的亚像素部分：角点回到的位置是 $(x_i + d^b_x) - (x_i - x_e)$，其中 $x_e$ 是前向终点，$x_i$ 是它的取整。还要跳过窗口超出图像的终点。我们发现这个检查抓住了全部 6 次失败，但也剔除了 14 次正确跟踪中的 4 次：反向跟踪面对的是同样约 14 px 的运动，失败得同样频繁。只有当两个方向都用能处理该运动的方法（例如金字塔）跟踪时，这个检查才是可靠的警报。
   </details>

**下一篇：**[第 4 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})用这些对应点恢复两个视图的几何：极线、本质矩阵与基础矩阵、相对位姿和三角化。
