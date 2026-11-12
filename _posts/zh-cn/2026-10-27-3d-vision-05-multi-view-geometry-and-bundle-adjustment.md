---
layout: post
title: "多视图几何与光束法平差：PnP、运动恢复结构与 Schur 补"
date: 2026-10-27 11:05:00+0900
description: "从两视图到多视图：用 P3P、EPnP 和 RANSAC 做相机重定位（resectioning），从零推导光束法平差（雅可比、稀疏正规方程、Schur 补、Levenberg-Marquardt、规范自由度、鲁棒核函数），COLMAP 式的增量式 SfM，基于旋转平均和 GLOMAP 式全局定位的全局 SfM，以及尺度不确定性；全部配有在合成场景上运行的 NumPy 代码。"
categories: 3d-vision
tags: [pnp, p3p, epnp, bundle-adjustment, schur-complement, structure-from-motion, colmap, glomap, rotation-averaging, gauge-freedom]
series: 3d-vision
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第 04 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})恢复了两台已标定相机之间的相对位姿，并三角化了两者都能看到的点。真实的重建有几十、几千乃至几百万张图像。每张照片都必须放进**同一个**公共坐标系，每个三维点必须与所有看到它的图像一致，而且这一切还要经得起错误匹配、糟糕的初值和漂移。本文讲的就是完成这件事的三种工具：

1. **相机重定位（camera resectioning，PnP）**：利用与已有三维点之间的 2D-3D 匹配，确定一台新相机的位姿。
2. **光束法平差（bundle adjustment，BA）**：同时调整所有相机和所有点，直到每条光线都穿过它对应的像素。它是运动恢复结构（Structure-from-Motion，SfM）、SLAM、标定的主力算法（正如[第 02 篇]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})指出的，标定就是一个标定板已知的小型 BA），NeRF 和 3D Gaussian Splatting 训练所用的相机位姿也来自它。
3. 使用它们的 **SfM 流程**：**增量式（incremental）** SfM 每次加入一张图像来扩展重建（COLMAP）；**全局式（global）** SfM 一次性估计所有旋转和位置（GLOMAP）。

[神经渲染第 1 篇]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})用一节的篇幅概览了 BA 和 COLMAP。这里我们把一切推导出来，用 NumPy 实现，并在已知真值的合成场景上运行，让每个结论都有数字支撑。第 3 节写出的光束法平差器大约 60 行，使用 Schur 补、支持鲁棒核函数，它与 COLMAP 内部 Ceres Solver 运行的是同一个算法，只是少了几十年的工程打磨。

## 前置知识

- [第 01 篇]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})：针孔相机 $\mathbf x \sim K[R \mid \mathbf t]\mathbf X$、世界到相机的位姿、相机中心 $\mathbf C = -R^\top\mathbf t$，以及 OpenCV 坐标系（$x$ 向右、$y$ 向下、$z$ 向前）。
- [第 02 篇]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})：重投影误差即最大似然、Gauss-Newton 与 Levenberg-Marquardt、轴角向量与 Rodrigues 公式、协方差 $\sigma^2(J^\top J)^{-1}$。
- [第 03 篇]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})：对应点、RANSAC 及其所需的采样次数。
- [第 04 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})：本质矩阵、带正深度检验（cheirality check）的分解、三角化。这里直接复用这些工具的精简版本，不再推导。
- 线性代数：分块矩阵、特征向量、SVD。Python 与 NumPy、SciPy。所有代码片段组成**一个脚本**；按顺序运行，打印出的每个数字都与正文一致。

**记号。** 相机编号为 $i = 1, \dots, m$，点编号为 $j = 1, \dots, n$。相机 $i$ 的世界到相机位姿为 $(R\_i, \mathbf t\_i)$，因此世界点 $\mathbf X\_j$ 的相机坐标为 $\mathbf X\_{c} = R\_i\mathbf X\_j + \mathbf t\_i$。所有相机共享已知的 $K$（在第 02 篇中标定）。$\pi(\cdot)$ 把相机坐标映射为像素，$\pi(X, Y, Z) = (f\_x X/Z + c\_x,\ f\_y Y/Z + c\_y)$。集合 $\mathcal O$ 包含所有相机 $i$ 观测到点 $j$ 的组合 $(i, j)$，观测像素为 $\mathbf x\_{ij}$，$L = \vert\mathcal O\vert$ 是观测数。世界坐标系同样是 $y$ 朝下，所以"上"是 $-y$。

## 1. 从两视图到多视图

### 1.1 未知量、测量与规范自由度

先数一数我们要求什么、手里有什么。每台相机有 6 个位姿参数（旋转 3 个、平移 3 个），每个点有 3 个坐标。每次观测提供 2 个数。因此

$$
\underbrace{6m + 3n}_{\text{unknowns}} \quad\text{versus}\quad \underbrace{2L}_{\text{measurements}} .
$$

这里有一个陷阱。仅凭图像无法知道世界原点在哪里、坐标轴朝哪个方向、场景有多大。把整个重建一起平移、旋转和缩放，每张图像都保持不变（第 3.7 节会证明）。这是一个由 7 个参数构成的、同样好的解族：平移 3 个、旋转 3 个、尺度 1 个。这种自由度称为**规范自由度（gauge freedom）**。所以图像真正能确定的量只有 $6m + 3n - 7$ 个。两视图、$n$ 个点给出 $2 \cdot 2n$ 个测量，对应 $12 + 3n - 7$ 个未知量，需要 $n \ge 5$：这正是第 04 篇的五点问题。

### 1.2 贯穿全文的例子

我们构造一个场景，供第 2、3 节使用：地面和两个箱子上共 120 个点，由 5 m 外一段圆弧上的 8 台相机观测，$f = 500$ 像素，图像 $640\times480$。每次观测都加上 $\sigma = 0.5$ 像素的高斯噪声。这与第 02 篇的合成标定设置相同，只是现在三维点也是未知的。

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

这个问题有 408 个未知量（其中 401 个可以确定）和 1920 个测量，超定将近五倍。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-scene.svg" caption="贯穿全文的例子。左：地面（灰）、矮箱（橙）和高箱（紫）上的 120 个点，以及距中心 5 m、离地 2 m 的圆弧上的 8 台相机，全部朝向 $(0,-0.5,0)$。红色虚线是相机 4 的三条光线。右：相机 4 的观测，120 个带 0.5 像素噪声的像素；画圈的是第 2.3 节 P3P 例子所用的三个点。" %}

### 1.3 路线图

多视图重建是一个先有鸡还是先有蛋的问题：相机已知，就能三角化点（第 04 篇）；点已知，就能确定相机（第 2 节）。单独做都很容易。同时求两者则是一个大型非线性最小二乘问题，即光束法平差（第 3 节），它需要一个好的初值。SfM 流程要么每次加入一台相机来逐步扩展重建（第 4 节），要么先求所有旋转、再求所有位置（第 5 节），以此得到初值。第 6 节处理任何流程都无法仅从图像恢复的那个量：尺度。

## 2. 相机重定位：Perspective-n-Point

### 2.1 问题

**Perspective-n-Point（PnP）**：已知 $n$ 个三维点 $\mathbf X\_j$（世界坐标）、它们在新图像中的像素 $\mathbf x\_j$ 以及内参 $K$，求位姿 $(R, \mathbf t)$。在增量式 SfM 中，每张新图像就是这样加入模型的；在 AR 和机器人中，设备就是这样相对于地图重定位的；在第 02 篇中，它求的是标定板的位姿。

每个对应提供 2 个方程，位姿有 6 个未知量，所以**3 个点**是最少的。三个点给出有限个解，最多四个；第四个点用来挑出正确的那个。点很多时，我们要的是最小二乘意义下最好的解；其中混有错误匹配时，则需要 RANSAC。

把像素转换为**方位向量（bearing vector）**会很方便，即相机坐标系中的单位方向：$\mathbf f = K^{-1}\tilde{\mathbf x} / \lVert K^{-1}\tilde{\mathbf x}\rVert$。方位向量知道点的方向，但不知道它的距离。

### 2.2 线性方法：DLT

最简单的方法忽略位姿的结构，把 $P\_n = [R \mid \mathbf t]$ 当作有 12 个未知数的一般 $3\times4$ 矩阵。$\mathbf X$ 与归一化图像点 $(x, y)$ 之间的每个对应给出两个线性方程，与第 02 篇的单应矩阵 DLT 完全相同，只是多了一维：

$$
x\,(\mathbf p^{3\top}\tilde{\mathbf X}) - \mathbf p^{1\top}\tilde{\mathbf X} = 0, \qquad y\,(\mathbf p^{3\top}\tilde{\mathbf X}) - \mathbf p^{2\top}\tilde{\mathbf X} = 0 ,
$$

其中 $\mathbf p^{k\top}$ 是 $P\_n$ 的各行。六个点给出 12 个方程，最小二乘解是最小的右奇异向量。然后用 SVD 把左边的 $3\times3$ 块投影到最近的旋转矩阵，并用其奇异值确定尺度。DLT 很简单，适用于任意 $n \ge 6$，但它估计了 11 个自由度，而实际只有 6 个，噪声会泄漏到多出的 5 个里；而且它最小化的是代数误差，而不是像素误差。

### 2.3 三个点：P3P

**几何。** 设未知的相机中心为 $\mathbf C$，$s\_1, s\_2, s\_3$ 是 $\mathbf C$ 到三个点的未知距离。两个方位向量之间的夹角可由图像得到（$\cos\theta\_{jk} = \mathbf f\_j^\top\mathbf f\_k$），两点间的距离 $d\_{jk}$ 可由地图得到。于是三角形 $\mathbf C, \mathbf X\_j, \mathbf X\_k$ 满足**余弦定理**：

$$
s_j^2 + s_k^2 - 2 s_j s_k \cos\theta_{jk} = d_{jk}^2, \qquad (j,k) \in \{(2,3), (1,3), (1,2)\}.
$$

这是关于三个距离的三个二次方程。把边记为 $a = d\_{23}$、$b = d\_{13}$、$c = d\_{12}$，对应的夹角记为 $\alpha = \theta\_{23}$、$\beta = \theta\_{13}$、$\gamma = \theta\_{12}$。这就是 Grunert 在 1841 年给出的形式，Haralick 等人（1994）对它做了综述。

**消元。** 令 $s\_2 = u\, s\_1$、$s\_3 = v\, s\_1$。每个方程都变成 $s\_1^2$ 乘以某个式子，两两相除即可消去 $s\_1$：

$$
\begin{aligned}
b^2 (u^2 + v^2 - 2uv\cos\alpha) &= a^2 (1 + v^2 - 2v\cos\beta), \\
b^2 (1 + u^2 - 2u\cos\gamma) &= c^2 (1 + v^2 - 2v\cos\beta).
\end{aligned}
$$

用第一个方程减去第二个，$u^2$ 被消掉，剩下一个关于 $u$ *线性*的方程：

$$
u = \frac{(a^2 - c^2)(1 + v^2 - 2v\cos\beta) - b^2 (v^2 - 1)}{2b^2(\cos\gamma - v\cos\alpha)} = \frac{N(v)}{D(v)} .
$$

把 $u = N/D$ 代入第二个方程并乘以 $D^2$，就得到一个关于 $v$ 的 4 次多项式，即 **P3P 四次方程**。每个正实根给出 $u$，进而得到 $s\_1 = b / \sqrt{1 + v^2 - 2v\cos\beta}$，再得到三个点在相机坐标系中的位置 $s\_k\mathbf f\_k$。

**从点到位姿：绝对定向（absolute orientation）。** 现在我们有同一组三个点在两个坐标系（世界和相机）中的坐标，需要求它们之间的刚体变换。对点集 $\mathbf A\_k$ 和 $\mathbf B\_k$，最小二乘旋转有经典的 SVD 解（Kabsch、Horn、Umeyama）：把两组点去中心，构造互协方差 $M = \sum (\mathbf B\_k - \bar{\mathbf B})(\mathbf A\_k - \bar{\mathbf A})^\top = U\Sigma V^\top$，取 $R = U\,\mathrm{diag}(1, 1, \det UV^\top)\,V^\top$，再令 $\mathbf t = \bar{\mathbf B} - R\bar{\mathbf A}$。行列式那一项防止出现反射。

多项式运算交给 NumPy，代码逐行对应上面的推导：

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

这三个点有**四个**实数解。其中一个以机器精度等于真实相机。其他几个是三点问题货真价实的精确解：每个解放置的相机都恰好在观测到的像素处看到这三个点。其中一个甚至位于地面以下（$y = +2.1$，在地板下面往上看）。第四个点立即消除了歧义：用错误的位姿投影，它会偏离观测像素 88 到 209 像素。在 RANSAC 中甚至不需要单独检查，因为错误的位姿只会得到很少的内点。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-p3p.svg" caption="相机 4 所见三个点（两个在地面，一个在高箱上）的 P3P。左：以恰好等于观测夹角看到 $\mathbf X\_1,\mathbf X\_2,\mathbf X\_3$ 的四个相机中心 $\mathbf C^{(1)}$ 到 $\mathbf C^{(4)}$；$\mathbf C^{(2)}$ 是真实相机，$\mathbf C^{(3)}$ 位于地板之下。右：代码中的四次多项式 $q(v)$，四个正实根 $v=0.522$、$0.846$、$1.285$、$1.608$，各对应一个候选解。实根的个数取决于相机相对于过这三点的“危险圆柱面”（danger cylinder）的位置；Gao 等人（2003）对所有情况做了分类。" %}

现代 P3P 求解器，如 Kneip 等人（2011）和 Lambda Twist（Persson 与 Nordberg，2018），以更稳定、更快的方式计算出同样的解；Lambda Twist 完全避开了四次方程。它们的差别在数值方面，而不在于算出了什么。

### 2.4 很多个点：EPnP

当 $n \gg 3$ 时，我们希望用上所有点得到一个位姿，而且耗时为 $O(n)$。**EPnP**（Lepetit、Moreno-Noguer 与 Fua，2009）通过一个巧妙的换元做到这一点。在世界坐标系中选四个**控制点** $\mathbf c\_1, \dots, \mathbf c\_4$（点集的质心加上三个主方向）。每个世界点都是它们的仿射组合，

$$
\mathbf X_j = \sum_{k=1}^4 \alpha_{jk}\mathbf c_k, \qquad \sum_k \alpha_{jk} = 1 ,
$$

权重 $\alpha\_{jk}$ 只需计算一次。刚体运动保持仿射组合，所以**同样的**权重在相机坐标系中也成立：$\mathbf X\_j^c = \sum\_k \alpha\_{jk}\mathbf c\_k^c$。现在的未知量是四个控制点在相机坐标系中的 12 个坐标。投影条件 $x\_j = X\_j^c / Z\_j^c$ 变为 $X\_j^c - x\_j Z\_j^c = 0$，对这些未知量是线性的：

$$
\sum_{k=1}^4 \alpha_{jk}\,(c_{k,x}^c - x_j\,c_{k,z}^c) = 0, \qquad \sum_{k=1}^4 \alpha_{jk}\,(c_{k,y}^c - y_j\,c_{k,z}^c) = 0 .
$$

把所有点堆叠起来得到 $M\mathbf v = \mathbf 0$，$M$ 是 $2n \times 12$ 矩阵。解是 $M$ 的零空间向量，差一个尺度。尺度由控制点之间相互距离保持不变这一要求确定。论文还处理了噪声下零空间实际为 2 到 4 维的情况；代码只实现最简单的单个零空间向量的情形。最后用绝对定向得到 $(R, \mathbf t)$。

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

两种线性方法在这里的误差都只有零点几度，这是因为 120 个点很多。第 2.5 节图的左半部分显示了点更少时的情况。

### 2.5 精化与 RANSAC

两种线性方法都没有最小化我们真正关心的误差，即以像素计的重投影误差。所以每个认真的流程最后都会对下式做几次 Gauss-Newton 迭代：

$$
\min_{R,\mathbf t} \sum_j \big\lVert \pi(R\mathbf X_j + \mathbf t) - \mathbf x_j\big\rVert^2 ,
$$

其中点保持固定。这称为**仅运动的光束法平差（motion-only BA）**。它需要像素对位姿的导数，我们会在第 3.3 节严格推导；下面的函数 `project_jac` 已经在计算它。有外点时，P3P 在 RANSAC 中运行（第 03 篇，$s = 3$）：抽取三个匹配，算出最多四个位姿，统计每个位姿的内点，保留最好的，再用所有内点重新拟合。

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

当 40% 的匹配被替换为随机像素时，对所有点直接运行 EPnP 毫无用处：偏差 40° 和 3.4 m。P3P-RANSAC 用了 116 次采样，找到 62 个内点。在 $\sigma = 1$ 像素时，2 像素的阈值能保留比例为 $1 - e^{-2} = 86\%$ 的真内点，即 67 个中的约 58 个，所以没有遗漏。它没有接受任何外点，精化后的位姿误差为 $0.22°$。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-pnp.svg" caption="左：场景中相机 6 在 200 次试验中的旋转误差中位数随像素噪声 $\sigma$ 的变化，实线使用全部 $n=120$ 个点，虚线使用随机 12 个点。EPnP 略优于 DLT；对重投影误差做 Gauss-Newton 精化（EPnP+GN）在所有设置下都比 EPnP 精确 2.2 到 3.5 倍（120 个点、$\sigma=1$ 像素时分别为 0.28°、0.22° 和 0.09°）。右：99% 置信度所需的 RANSAC 采样次数 $N=\log 0.01/\log(1-(1-\varepsilon)^s)$，$s=3$（P3P）、4 和 6（DLT）。圆圈是我们的 `ransac_pnp` 实际采样次数的均值（各 20 次运行）：$\varepsilon=0.2$、0.4、0.6、0.7 时分别为 28、54、230、629。它们位于 $s=3$ 曲线上方，因为自适应停止准则使用的是当前最佳模型的内点率，它低于真实内点率（噪声把一部分内点推到了阈值之外）。" %}

实践中直接调用库函数：OpenCV 的 `solvePnP` 和 `solvePnPRansac` 提供 P3P、EPnP、SQPnP 等方法，之后可以用 `solvePnPRefineLM` 精化。焦距也未知时，有带未知焦距的最小求解器；对于相机组（rig），有处理来自多个中心的光线的广义版本。

## 3. 光束法平差

### 3.1 代价函数

光束法平差通过最小化重投影误差，同时估计所有相机和所有点：

$$
E(\{R_i, \mathbf t_i\}, \{\mathbf X_j\}) = \sum_{(i,j)\in\mathcal O} \rho\Big(\big\lVert \mathbf r_{ij} \big\rVert^2\Big), \qquad \mathbf r_{ij} = \pi(R_i\mathbf X_j + \mathbf t_i) - \mathbf x_{ij}.
$$

当 $\rho(s) = s$、像素噪声为独立高斯时，按第 02 篇第 4.1 节同样的论证，这就是最大似然。增长慢于 $s$ 的**鲁棒核函数（robust kernel）** $\rho$ 能限制错误匹配的影响（第 3.8 节）。这个名字来自摄影测量：每台相机发出一**束**（bundle）光线，我们调整这些光束，直到每条光线都穿过它的点。

第 02 篇的标定是一个点已知（标定板）、内参未知的光束法平差；PnP 精化是只有一台相机、点固定的光束法平差。这里相机和点都是自由的，这正是问题规模、结构和规范自由度的来源。

### 3.2 参数化

**点**就是普通的三维向量。非常远的点（接近地平线）会使 $\mathbf X$ 很大且病态，这时逆深度或齐次参数化更好，SLAM 系统常用它们。这里我们不考虑这一点。

**旋转**需要小心：$R$ 有 9 个元素，但只有 3 个自由度。第 02 篇为每台相机存一个轴角向量。这里采用现代求解器的做法：把 $R$ 保持为矩阵，只对**更新量**参数化，即一个从左边作用的小旋转 $\delta\boldsymbol\omega \in \mathbb R^3$，

$$
R \leftarrow \exp([\delta\boldsymbol\omega]_\times)\,R, \qquad \mathbf t \leftarrow \exp([\delta\boldsymbol\omega]_\times)\,\mathbf t + \delta\mathbf t ,
$$

其中 $\exp([\delta\boldsymbol\omega]\_\times)$ 是 Rodrigues 公式，$[\cdot]\_\times$ 是叉乘矩阵。这个更新先旋转、再平移相机的整个坐标系，即 $SE(3)$ 上的左扰动（李群见[具身智能第 1 篇]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})）。它没有奇异性，因为 $\delta\boldsymbol\omega$ 总是很小。因此每次迭代中每台相机贡献 6 个数 $\delta\mathbf c\_i = (\delta\boldsymbol\omega\_i, \delta\mathbf t\_i)$。

### 3.3 单个观测的雅可比

Gauss-Newton 需要每个观测的二维残差对 6 个相机参数和 3 个点坐标的导数。链式法则把它分成两部分。

**像素对相机坐标。** 设 $\mathbf X\_c = (X, Y, Z)$、$\pi = (f\_x X/Z + c\_x, f\_y Y/Z + c\_y)$：

$$
\frac{\partial \pi}{\partial \mathbf X_c} = \begin{pmatrix} f_x/Z & 0 & -f_x X/Z^2 \\ 0 & f_y/Z & -f_y Y/Z^2 \end{pmatrix}.
$$

第三列说明：把点移离相机，它的像素会被拉向主点。

**相机坐标对更新量。** 一阶近似下 $\exp([\delta\boldsymbol\omega]\_\times) \approx I + [\delta\boldsymbol\omega]\_\times$，所以更新使一个点的相机坐标变为

$$
\mathbf X_c \;\leftarrow\; (I + [\delta\boldsymbol\omega]_\times)(R\mathbf X + \mathbf t) + \delta\mathbf t = \mathbf X_c + \delta\boldsymbol\omega \times \mathbf X_c + \delta\mathbf t = \mathbf X_c - [\mathbf X_c]_\times\,\delta\boldsymbol\omega + \delta\mathbf t ,
$$

这里用到 $\mathbf a \times \mathbf b = -\mathbf b \times \mathbf a$。因此 $\partial\mathbf X\_c/\partial\delta\boldsymbol\omega = -[\mathbf X\_c]\_\times$、$\partial\mathbf X\_c/\partial\delta\mathbf t = I$。对点则有 $\partial\mathbf X\_c/\partial\mathbf X = R$。合起来，

$$
J_{c,ij} = \frac{\partial \pi}{\partial \mathbf X_c}\begin{pmatrix} -[\mathbf X_c]_\times & I \end{pmatrix} \in \mathbb R^{2\times 6},
\qquad
J_{p,ij} = \frac{\partial \pi}{\partial \mathbf X_c}\, R_i \in \mathbb R^{2\times 3}.
$$

这正是第 2.5 节 `project_jac` 的两个输出。在此基础上构建任何东西之前，先用有限差分核对一下。这个习惯能抓住手写雅可比中的大部分错误。

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

两者的一致程度与有限差分本身的误差相当（元素最大 548，差值小于 $2\times10^{-4}$），所以公式是对的。Ceres 等库也提供自动微分；在对性能要求高的代码中，这样的解析雅可比仍然很常见。

### 3.4 正规方程及其结构

把所有相机更新堆成 $\delta\mathbf c \in \mathbb R^{6m}$，所有点更新堆成 $\delta\mathbf p \in \mathbb R^{3n}$。残差 $\mathbf r\_{ij}$ 只依赖于一台相机和一个点，所以它在完整雅可比 $J$ 中的行块恰好只有两个非零块 $J\_{c,ij}$ 和 $J\_{p,ij}$。因此 Gauss-Newton 正规方程 $J^\top J\,\boldsymbol\delta = -J^\top\mathbf r$（第 02 篇）具有分块形式

$$
\begin{pmatrix} B & E \\ E^\top & C \end{pmatrix}
\begin{pmatrix} \delta\mathbf c \\ \delta\mathbf p \end{pmatrix}
= -\begin{pmatrix} \mathbf g_c \\ \mathbf g_p \end{pmatrix},
$$

其中

$$
B_i = \sum_{j:(i,j)\in\mathcal O} J_{c,ij}^\top J_{c,ij}, \quad
C_j = \sum_{i:(i,j)\in\mathcal O} J_{p,ij}^\top J_{p,ij}, \quad
E_{ij} = J_{c,ij}^\top J_{p,ij}, \quad
\mathbf g_{c,i} = \sum_j J_{c,ij}^\top \mathbf r_{ij}, \quad
\mathbf g_{p,j} = \sum_i J_{p,ij}^\top \mathbf r_{ij}.
$$

$B$ 是由 $6\times6$ 块组成的块对角矩阵，$C$ 是由 $3\times3$ 块（每个点一块）组成的块对角矩阵，因为没有任何残差同时涉及两台相机或两个点。只有 $E$ 把相机和点耦合起来，且只有相机 $i$ 看到点 $j$ 时块 $E\_{ij}$ 才非零。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-sparsity.svg" caption="第 4 节走廊场景（30 台相机，每四个点取一个：208 个点、2260 个观测）在真值处的光束法平差结构。左：雅可比 $J$（$4520\times804$，非零元 0.93%）；每两行在红线左侧有一个 $2\times6$ 相机块，右侧有一个 $2\times3$ 点块。中：$H=J^\top J$（$804\times804$，非零元 12.3%）及其分块：$B$（块对角，相机）、$C$（块对角，点）和耦合块 $E$，其中的条带显示哪台相机看到哪个点（点按 $x$ 排序，相机沿 $x$ 行进）。右：约化相机系统 $S=B-EC^{-1}E^\top$（$180\times180$），画成 $30\times30$ 个 $6\times6$ 块的网格，颜色深浅表示两台相机共享的点数。只有相机 $i$ 和 $k$ 看到同一个点时块 $(i,k)$ 才非零：这里 900 块中有 832 块，因为远处的点在很长一段路上都能看到。" %}

### 3.5 Schur 补

点块 $C$ 是系统中大的部分（$3n$ 个未知量，常常上百万），但求逆极其简单：它是 $n$ 个相互独立的 $3\times3$ 矩阵。**Schur 补（Schur complement）**正是利用了这一点。把系统写成两个块行：

$$
B\,\delta\mathbf c + E\,\delta\mathbf p = -\mathbf g_c, \qquad E^\top\delta\mathbf c + C\,\delta\mathbf p = -\mathbf g_p .
$$

由第二式解出点，$\delta\mathbf p = C^{-1}(-\mathbf g\_p - E^\top\delta\mathbf c)$，代入第一式：

$$
\underbrace{\big(B - E\,C^{-1}E^\top\big)}_{S}\;\delta\mathbf c = -\mathbf g_c + E\,C^{-1}\mathbf g_p .
$$

这个**约化相机系统（reduced camera system）**只有 $6m$ 个未知量。解出它之后，每个点通过**回代**独立更新：$\delta\mathbf X\_j = C\_j^{-1}\big(-\mathbf g\_{p,j} - \sum\_i E\_{ij}^\top\delta\mathbf c\_i\big)$。这里没有任何近似：结果严格等于完整系统的 Gauss-Newton 步。代价却大不相同。一个典型的网络照片重建有 $m = 1000$ 台相机、$n = 200\,000$ 个点，共 $606\,000$ 个未知量；稠密求解毫无希望，而 Schur 补只留下一个 $6000\times6000$ 的系统，外加 20 万个 $3\times3$ 矩阵的求逆。摄影测量从光束法平差诞生之初就使用这种约化，之后每个 BA 求解器的核心都是它（Triggs 等人 2000，Lourakis 与 Argyros 2009）。

Levenberg-Marquardt 在消元之前把第 02 篇的阻尼 $\lambda\,\mathrm{diag}$ 加到 $B$ 和 $C$ 的对角线上，并不改变结构。还有一个细节：我们从 $S$ 中删去相机 1 的 6 个未知量，从而固定相机 1。这固定了 7 个规范自由度中的 6 个；第 3.7 节解释为什么第七个，即尺度，不会造成问题。下面是完整的光束法平差器：

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

（为便于阅读，耦合块以稠密形式存储；当 $\vert\mathcal O\vert \ll mn$ 时，真正的求解器只存非零的 $E\_{ij}$。）我们从真实场景出发，把每台相机旋转约 2°，把每个相机中心和每个点移动约 15 cm，此时 RMS 重投影误差为 47 像素。两次迭代后降到 0.63 像素，六次之后代价不再变化。

0.6283 像素是正确答案吗？在最小二乘问题的最优点，残差失去了模型用来拟合噪声的那些自由度：$\mathbb E\,\lVert\mathbf r\rVert^2 = \sigma^2(2L - p)$，其中有效参数个数 $p = 6m + 3n - 7 = 401$。我们的 RMS 是每个观测的残差长度 $\sqrt{\lVert\mathbf r\rVert^2/L}$，所以期望值为 $\sigma\sqrt{(2L - p)/L} = 0.6289$ 像素，实测 0.6283 像素。没有拟合任何自由度的真实场景给出 $\sigma\sqrt2 = 0.707$ 像素；最优点*低于*真值，这是估计器正确收敛的标志，而不是过拟合出了问题。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-ba.svg" caption="贯穿全文例子的光束法平差。左：每次 LM 迭代 $k$ 的 RMS 重投影误差（紫色，左轴）：46.81、2.38、0.63 像素，之后平稳在期望值 0.629 像素（点线）。阻尼 $\lambda$（橙色，右轴）每次除以 3，因为每一步都被接受。中、右：用相似变换把估计（紫）对齐到真值（灰）后的俯视图（$x$ 对 $z$）；红线把每个估计点连到它的真实位置。$k=0$ 时相机中心和点的 RMS 三维误差分别为 0.26 和 0.25；BA 之后为 0.0047 和 0.0043，即在 10 m 的场景中只有 2 到 5 mm。" %}

### 3.6 结果有多准？

要把重建与真值比较，必须先去掉规范自由度：求一个最能把估计映射到真值的相似变换（旋转、平移、尺度），再度量剩下的误差。闭式解由 Umeyama（1991）给出，就是第 2.3 节的绝对定向再加上尺度。

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

误差下降了 55 到 60 倍，约为 4 到 5 mm。这也回答了一个常见问题：BA 不需要完美的初值，但需要初值落在收敛域之内。第 4 节展示各流程如何得到这样的初值。

在下面的小组件中自己试试。它在浏览器里对一个更小的场景（6 台相机、42 个点）运行同样的算法。

{% include widget.liquid name="3d-vision-bundle-adjustment" height="760" caption="一次一步的 Levenberg-Marquardt 光束法平差：正文的算法（第 3.3 节的雅可比、固定相机 1 的 Schur 补、回代、Marquardt 阻尼），作用于 6 台相机和 42 个点。3D 视图中灰色为真值，蓝色（相机）和紫色（点）为去掉自由尺度后的估计；红线是点的误差。拖动可旋转视角。图像中显示所选相机的观测（圆点）、当前预测（紫色叉）以及两者之间的残差。试着加大初始误差，然后打开外点，比较 L2、Huber 和 Cauchy 核：有 15% 外点时，L2 收敛到一个残差很大的错误答案，而 Cauchy 能恢复场景。图表中的虚线是最优点处的期望 RMS $\sigma\sqrt{(2L-p)/L}$。" %}

### 3.7 规范自由度

**规范自由度为何存在。** 对世界做任意相似变换 $\mathbf X \mapsto sQ\mathbf X + \mathbf d$（旋转 $Q$、尺度 $s > 0$、平移 $\mathbf d$），并把每台相机改为 $R\_i' = R\_i Q^\top$、$\mathbf t\_i' = s\mathbf t\_i - R\_i Q^\top\mathbf d$。则

$$
R_i'(sQ\mathbf X_j + \mathbf d) + \mathbf t_i' = sR_i\mathbf X_j + R_iQ^\top\mathbf d + s\mathbf t_i - R_iQ^\top\mathbf d = s\,(R_i\mathbf X_j + \mathbf t_i).
$$

相机坐标乘以 $s$，而投影 $\pi$ 要除以 $Z$，所以 $s$ 被约掉：每个像素都不变。代价函数沿一个 7 维的方向族严格平坦。

**求解器看到了什么。** 在最优点，$J$ 有 7 维零空间，$J^\top J$ 有 7 个零特征值：

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

秩为 $408 - 7 = 401$，第七个和第八个特征值之间相差 11 个数量级以上。朴素的 Gauss-Newton 会试图对一个奇异矩阵求逆。标准的解决办法有四种：

1. **固定参数。** 固定一台相机（6 个自由度），再固定一个数来确定尺度，例如两个相机中心之间的距离，或第二台相机的一个坐标。COLMAP 固定第一台相机的位姿和第二台相机位置的一个坐标。
2. **交给阻尼处理。** LM 的 $\lambda\,\mathrm{diag}$ 使系统可逆，它产生的步长在平坦方向上没有分量，因为这些方向不会降低代价。我们的求解器固定相机 1，把尺度交给阻尼处理。
3. **最小约束或内约束。** 加入恰好消除规范自由度的约束，例如固定点的质心和平均距离，或者用伪逆求解。摄影测量学称之为自由网平差（free-network adjustment）。
4. **先验。** GPS 位置、IMU 的重力方向或已知基线用真实信息固定部分或全部规范自由度。

**它对不确定性很重要。** 第 02 篇第 5 节从 $\sigma^2(J^\top J)^{-1}$ 读出不确定性。在 BA 中这个矩阵不存在；协方差只有在选定规范之后才有定义，并且依赖于所选的规范。"相机 7 的不确定性为 3 cm"在固定相机 1 时和固定质心时含义不同。报告不确定性时要连同所用的规范一起报告，或者计算与规范无关的量，例如相机之间的距离。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-gauge.svg" caption="左：BA 解处 $J^\top J$ 的全部 408 个特征值，按大小排序。前七个（红）低于 $5\times10^{-9}$，是数值意义上的零；第八个为 2359。右：沿不同方向把解移动 $\alpha$ 时的 RMS 重投影误差。缩放整个场景（$s=e^{0.7\alpha}$，从 0.50 到 2.0）或绕竖直轴旋转最多 $\pm 34°$，RMS 始终精确地保持在 0.628 像素：这些是规范运动。沿最小非零特征值的特征向量 $\mathbf v\_8$（最弱的真实方向）走单位步长，RMS 升到 1.65 像素；沿 $\mathbf v\_{41}$（$\lambda=20974$）升到 4.47 像素。" %}

### 3.8 鲁棒核函数

一个残差为 50 像素的错误匹配对平方代价贡献 $2500$，相当于 $10\,000$ 个残差为 $0.5$ 像素的良好观测。最小二乘会扭曲整个重建来减小这一项。RANSAC 在 BA 之前去掉了大部分错误匹配，但总有一些漏网：重复纹理、运动物体、错误的三角化。**鲁棒核函数**用一个对大残差增长更慢的函数 $\rho(s)$ 代替 $s = \lVert\mathbf r\rVert^2$。设尺度为 $\delta$（像素），最常用的两个是

$$
\rho_{\text{Huber}}(s) = \begin{cases} s & \sqrt s \le \delta \\ 2\delta\sqrt s - \delta^2 & \sqrt s > \delta \end{cases},
\qquad
\rho_{\text{Cauchy}}(s) = \delta^2\log\Big(1 + \frac{s}{\delta^2}\Big).
$$

Huber 在零附近是二次的，超过 $\delta$ 后是线性的：它是凸的，所以不会引入局部极小，但大残差仍以恒定的力拉扯。Cauchy 只按对数增长：50 像素的外点几乎不起作用，但代价不再是凸的，需要一个不错的初值。

**求解器如何使用它们：IRLS。** $\rho(\lVert\mathbf r\rVert^2)$ 的梯度是 $2\rho'(s)\,J^\top\mathbf r$，即普通最小二乘代价在每个残差加权 $w = \rho'(s)$ 后的梯度。所以鲁棒问题可以作为一系列**加权**最小二乘问题来求解：由当前残差算出权重，用 $J^\top WJ$ 和 $J^\top W\mathbf r$ 走一步 Gauss-Newton，如此反复。这就是**迭代重加权最小二乘（iteratively reweighted least squares，IRLS）**，权重就是 `robust_weight` 返回的值：Huber 在阈值内 $w = 1$，阈值外 $\delta/\lVert\mathbf r\rVert$；Cauchy 为 $w = 1/(1 + s/\delta^2)$。（Triggs 等人描述了一种同时保留 $\rho$ 曲率的改进，Ceres 实现了它。）我们把 5% 的观测改动 10 到 60 像素，再从同一个初值出发，用每种核函数运行 BA：

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

使用 $L\_2$ 时，51 个坏观测把相机中心拖偏 8 cm，并把误差摊到所有良好观测上（它们的残差中位数为 1.95 像素，而不是约 0.5）。Huber 和 Cauchy 都把场景恢复到无外点时的精度（4.7 mm），良好观测的残差也再次回到约半个像素。Cauchy 需要更多迭代，非凸核函数通常如此。$\delta$ 的实用选择是预期内点噪声的 2 到 3 倍。COLMAP 所用的 Ceres 提供 Huber、soft $L\_1$、Cauchy 以及其他几种损失函数。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-robust.svg" caption="左：$\delta=1$ 像素时核函数 $\rho$ 随残差长度的变化。中：它们的 IRLS 权重 $w=\rho'$；$L\_2$ 完全信任每个残差，Huber 按 $\delta/\lVert\mathbf r\rVert$ 降低权重，Cauchy 按 $1/(1+\lVert\mathbf r\rVert^2/\delta^2)$，所以 10 像素的外点权重分别为 0.1 和 0.01。右：从同一初值出发 BA 之后的相机中心 RMSE。无外点（灰色，$L\_2$）为 0.0047；有 5% 外点时 $L\_2$ 为 0.0816，Huber 为 0.0049，Cauchy 为 0.0043。" %}

### 3.9 扩展到大规模

我们的求解器稠密地构造 $S$，并用稠密分解求解：$O(m^3)$，对几百台相机没问题。真实系统走得更远：

- **对 $S$ 做稀疏 Cholesky 分解。** 当大多数相机对不共享点时（稀疏结构图中的白色块），$S$ 是稀疏的。稀疏直接求解器（Ceres 使用 CHOLMOD）配合减少填充的排序来分解它。
- **迭代 Schur（iterative Schur）。** 对于非常大的问题，根本不显式构造 $S$：共轭梯度法只用与 $B$、$E$ 和 $C^{-1}$ 的乘积来解 $S\delta\mathbf c = \mathbf b$，并配以块 Jacobi 预条件。Agarwal 等人（2010）在他们的 "Bundle Adjustment in the Large" 数据集上研究了这些非精确牛顿法，Wu 等人（2011）把它们搬到了多核 CPU 和 GPU 上。
- **局部 BA。** 增量式 SfM 和 SLAM 在每一步之后只优化最近变化的相机及其点，并固定一圈相邻相机，只是偶尔才运行全局 BA。
- **内参和畸变**可以作为第三组共享参数加入，这正是第 02 篇标定雅可比的箭头形结构。

常用的库有 Ceres Solver（COLMAP 使用）、g2o 和 GTSAM（因子图，[第 06 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})的语言）。

## 4. 增量式运动恢复结构

### 4.1 流程

**增量式 SfM** 从两个视图出发，每次加入一张图像，边做边运行 BA。Photo Tourism（Snavely 等人 2006）让它在网络照片上声名大噪，COLMAP（Schönberger 与 Frahm 2016）是它使用最广的现代形式。步骤如下：

1. **对应搜索。** 在每张图像中提取特征并匹配图像对（[第 03 篇]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})）。**几何验证（geometric verification）**只保留那些匹配在 RANSAC 下与某个基础矩阵、本质矩阵或单应矩阵一致的图像对（第 04 篇）。结果就是**场景图（scene graph）**，也称视图图（view graph）：图像是节点，通过验证的图像对是边。匹配在多个图像对之间串联成**轨迹（track）**，每条轨迹对应一个三维点。
2. **初始化。** 选择一个好的图像对，估计其相对位姿（第 04 篇），三角化，并运行两视图 BA。
3. **图像注册。** 选择下一张能看到许多已重建点的图像，用 RANSAC 中的 PnP 加仅运动精化来确定其位姿（第 2 节）。
4. **三角化。** 对新图像使之可见、且被至少两台已注册相机以足够大的夹角看到的轨迹进行三角化。
5. 对受影响部分做**光束法平差**（局部 BA），并不时对全部做一次（全局 BA）。
6. **过滤。** 去掉重投影误差大的观测和三角化夹角太小的点，并重新三角化。从第 3 步开始重复，直到不能再加入图像为止。

### 4.2 一个玩具版增量式 SfM

我们在一个专门用来展示漂移的新场景上实现第 2 到 5 步：30 台相机沿走廊行进 20 m，每台都朝侧面看 4 到 12 m 外的点，噪声 1 像素。每台相机只看到场景的一段，所以信息必须一台接一台地传递下去。首先是第 04 篇两视图工具的精简版：

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

然后是流程本身。下一个视图选能看到最多已重建点的未注册相机；注册使用 EPnP 加精化（这里没有外点，所以跳过 RANSAC）；当光线夹角达到 2° 以上且重投影误差在 4 像素以内时三角化新点；如果需要，每次注册之后运行一次带 Huber 核的 BA：

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

误差在重建本身定义的坐标系中度量：相机 0 位于其真实位姿，尺度由相机 0 到相机 4 的初始基线确定。不做 BA 时，每次注册都继承了它所依据的那些点的误差，而那些点又继承了三角化它们的相机的误差。误差层层累积：走过 20 m 后，最后一台相机偏差 1.2 m。每张图像之后都做 BA 时，所有观测共同约束所有参数，最后一台相机的偏差为 4.4 cm，好 27 倍。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-incremental.svg" localized="true" caption="走廊场景上的玩具版增量式 SfM（每隔 0.7 m 一台相机共 30 台，900 个点位于 4 到 12 m 外，噪声 1 像素）。左：相机中心的俯视图（$z$ 轴被拉伸约 10 倍）；重建以相机 0 为锚点，并以到相机 4 的初始基线确定尺度。不做 BA（橙色）时，旋转误差使轨迹弯曲，尺度误差使它伸长：最后一台相机偏差 1.20 m。每张图像后都做 BA（紫色）时，它始终贴着真值（黑色）。右上：每台相机的中心误差，对数坐标（相机 29：1.202 m 对 0.044 m）。右下：局部尺度，即相邻相机之间估计距离与真实距离之比；不做 BA 时到末端漂移到 1.09（单步最高 1.19），做 BA 时始终在 1 的 1% 以内。" %}

### 4.3 COLMAP 做得更好的地方，以及每一步为何重要

我们的玩具展示了骨架。让 COLMAP 在真实照片集上稳健运行的那些细节值得了解，因为重建失败时，它们也正是你要调的旋钮。

**选择初始图像对。** 第一对图像确定了坐标系和尺度，并为其余一切打下基础，所以必须可靠。它需要大量通过验证的匹配，*并且*基线要宽。如果一对图像的匹配用单应矩阵解释与用本质矩阵解释差不多好，那就是一个糟糕的选择：要么是纯旋转（没有基线，没有深度，第 04 篇），要么是近似平面的场景，此时本质矩阵确定得很差。我们走廊场景的第一个版本把所有点都放在 8 m 外一个 2 m 厚的薄层里；那时图像对 (0, 4) 的线性八点法估计在平移方向上偏差 65°，重建失败。把点分布到 4 到 12 m 之后问题就解决了。COLMAP 偏好位于场景图稠密连通部分、通过验证的匹配多的图像对，它的两视图几何步骤会比较单应矩阵与本质矩阵的内点，以标记平面和纯旋转的图像对。

**选择下一个最佳视图（next best view）。** 用很少或扎堆的点来注册一张图像，得到的位姿约束很弱，而早期的错误以后很难纠正。COLMAP 对候选图像打分时，不只看可见三维点的数量，还用一个多分辨率网格看它们在图像中分布得是否均匀；分布在整幅图像上的点能更好地约束位姿。

**鲁棒三角化。** 一条轨迹可能包含错误匹配。COLMAP 在观测对上用 RANSAC 来三角化每条轨迹，检查三角化夹角（默认 1.5°；[神经渲染第 1 篇]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})表明，低于它时深度误差会急剧增大）和正深度条件（在每台相机中深度都为正）。

**局部和全局 BA。** 每次注册之后，COLMAP 对新图像及其连接最紧密的邻居运行 BA；当模型增长到一定比例时，运行一次全局 BA。然后过滤掉重投影误差大的观测并重新三角化，这能找回因先前误差而丢失的轨迹。

**失效模式。** 增量式 SfM 是顺序进行的，所以结果依赖于顺序，早期错误会传播下去。沿着没有回环的长链，漂移会不断累积。对称或重复的结构（两个相同的立面、穹顶的内侧和外侧）可能产生错误但几何上自洽的注册。而且反复的 BA 使计算量随图像数增长得比线性更快；Wu（2013）展示了如何让主要步骤保持接近线性的时间。

## 5. 全局式运动恢复结构

### 5.1 思路

**全局式 SfM** 避免了顺序增长。它从场景图中取出每个通过验证的图像对的相对位姿 $(R\_{ij}, \hat{\mathbf t}\_{ij})$，即第 04 篇的旋转和平移*方向*（长度未知），然后一次性求解所有相机：

1. **旋转平均（rotation averaging）**：求与所有相对旋转一致的绝对旋转 $R\_i$。
2. **平移平均（translation averaging）**（或全局定位，global positioning）：求与相对方向一致的位置。
3. 三角化所有轨迹，运行**一次**全局 BA。

每张图像都被同等对待，没有可能弄错的顺序，昂贵的 BA 只运行一次而不是几百次。代价是鲁棒性：少数错误的相对位姿就可能毁掉整个解，所以鲁棒的平均方法必不可少。

### 5.2 旋转平均

采用世界到相机的旋转时，从相机 $i$ 到相机 $j$ 的相对旋转为 $R\_{ij} = R\_j R\_i^\top$：它把相机 $i$ 的坐标映射到相机 $j$ 的坐标。每个测得的 $R\_{ij}$ 是一个方程，所以当视图图有 $\vert\mathcal E\vert$ 条边、$m$ 个未知旋转时，问题是超定的，并带有 3 个自由度的规范（一个全局旋转）。**弦距离（chordal）**代价用 Frobenius 范数度量不一致：

$$
\min_{R_1,\dots,R_m \in SO(3)} \sum_{(i,j)\in\mathcal E} \lVert R_j - R_{ij}R_i\rVert_F^2 .
$$

**谱方法求解。** 由于旋转是正交的，$\lVert R\_j - R\_{ij}R\_i\rVert\_F^2 = 6 - 2\,\mathrm{tr}(R\_j^\top R\_{ij} R\_i)$，所以最小化代价等价于最大化 $\sum \mathrm{tr}(R\_j^\top R\_{ij}R\_i)$。把未知量堆成 $3m\times3$ 矩阵 $Q = (R\_1; R\_2; \dots; R\_m)$，把测量放进一个对称的 $3m\times3m$ 矩阵 $G$，其块 $(j, i)$ 为 $R\_{ij}$、块 $(i, j)$ 为 $R\_{ij}^\top$。则目标函数为 $\mathrm{tr}(Q^\top G Q)$（差一个因子 2）。现在做松弛：只保留所有旋转都满足的约束 $Q^\top Q = mI$，忽略其余约束。在这个约束下，$\mathrm{tr}(Q^\top GQ)$ 的最大值由 $G$ 的**前三个特征向量**张成（Rayleigh 商，一次处理三维）。最后用 SVD 把特征向量矩阵的每个 $3\times3$ 块投影到最近的旋转。当测量相互一致时，$G$（除缺失的边外）恰好等于秩为 3 的矩阵 $QQ^\top$，松弛是精确的。Moulon 等人（2013）用这类特征值求解器求全局旋转；我们把每个块行按其边数归一化。

**用 IRLS 获得鲁棒性。** 一个错误的相对旋转，例如来自重复的立面，可能偏差 90°。谱方法是一种最小二乘方法，会把这个误差摊给所有相机。和 BA 一样，进行迭代：求解，度量每条边的残差角，降低残差大的边的权重（尺度为 5° 的 Cauchy 权重），再求解。Chatterjee 与 Govindu（2013）让这种做法（先求 $L\_1$ 解，再做 IRLS）在大规模问题中流行起来；Hartley 等人（2013）是理论方面的参考文献。

我们模拟一个视图图：40 台相机位于贯穿全文的例子周围的一个圆上，每台与 45° 以内的邻居相连（200 条边），相对旋转带 1.5° 噪声，其中 8% 被替换为错误的旋转（在真实流程中它们来自第 04 篇的本质矩阵分解；模拟它们能让运行更快）。

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

沿生成树串联旋转（增量式方法隐含的做法）的好坏取决于它碰巧用到的边：树中一条错误的边会让其后的所有相机偏差 57°。谱 $L\_2$ 解用到了所有边，所以没有相机错得离谱，但 15 条错误的边把 4.5° 的误差摊到了各处。十轮重加权把它们隔离出来，误差中位数降到 0.9°：每台相机平均 10 个测量，结果比任何单个 1.5° 的测量都更准确。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-rotation-averaging.svg" localized="true" caption="40 台相机、200 个相对旋转（其中 15 个错误）上的旋转平均。左：去掉全局旋转规范后每台相机的旋转误差，对数坐标。生成树：中位数 5.1°，最大 57°；谱 $L\_2$：中位数 4.5°，最大 10°；谱方法加 IRLS：中位数 0.90°，最大 1.8°。右：IRLS 之后各边的残差。正确的图像对（紫）都低于 5.4°，错误的（红）都高于 32.6°，所以 Cauchy 权重（虚线，右轴）能把它们干净地分开。" %}

### 5.3 平移平均

所有 $R\_i$ 已知后，每个图像对给出从一个相机中心指向另一个的方向。由 $\mathbf X^{(j)} = R\_{ij}\mathbf X^{(i)} + \mathbf t\_{ij}$ 和 $\mathbf t\_k = -R\_k\mathbf C\_k$ 得到 $\mathbf t\_{ij} = -R\_j(\mathbf C\_j - \mathbf C\_i)$，所以测得的单位向量 $\hat{\mathbf t}\_{ij}$ 确定了世界坐标系中的方向

$$
\mathbf d_{ij} = -R_j^\top\hat{\mathbf t}_{ij}, \qquad \mathbf C_j - \mathbf C_i = \lambda_{ij}\,\mathbf d_{ij}, \quad \lambda_{ij} > 0 \text{ unknown}.
$$

最简单的求解器写出 $\mathbf d\_{ij}\times(\mathbf C\_j - \mathbf C\_i) = \mathbf 0$，它对相机中心是线性的，然后（固定 $\mathbf C\_1 = \mathbf 0$ 后）用 SVD 求解这个齐次系统。有两个问题让平移平均成为全局 SfM 中最难的部分。**长度**：叉积形式按每条边未知的长度加权，所以长基线占主导。LUD（Özyeşil 与 Singer 2015）等方法求解带 $\lambda\_{ij} \ge 1$ 约束的 $\min\sum\lVert\mathbf C\_j - \mathbf C\_i - \lambda\_{ij}\mathbf d\_{ij}\rVert$；BATA（Zhuang 等人 2018）使用一种对基线长度不敏感的双线性、基于角度的代价。**退化**：当相机排成一条直线时（汽车沿街行驶），仅凭方向无法确定位置，因为所有方向都平行，任何间距都符合。平行刚性（parallel rigidity）理论刻画了问题何时是适定的。错误的方向也很常见；1DSfM（Wilson 与 Snavely 2014）先把问题投影到许多一维直线上来去除它们。

### 5.4 全局定位：GLOMAP

GLOMAP（Pan、Baráth、Pollefeys 与 Schönberger，ECCV 2024）完全跳过了成对的方向。旋转平均之后，它已经知道每个观测在世界朝向下的视线：$\mathbf v\_{ij} = R\_i^\top\mathbf f\_{ij}$，其中 $\mathbf f\_{ij}$ 是该像素的方位向量。然后它**同时**估计相机中心 $\mathbf C\_i$ 和点 $\mathbf X\_j$，要求每条光线都从它的相机指向它的点：

$$
\min_{\{\mathbf C_i\}, \{\mathbf X_j\}, \{d_{ij}\}} \sum_{(i,j)\in\mathcal O} \rho\Big(\big\lVert \mathbf v_{ij} - d_{ij}\,(\mathbf X_j - \mathbf C_i) \big\rVert\Big), \qquad d_{ij} \ge 0 .
$$

标量 $d\_{ij}$ 吸收了未知的距离（最终接近逆深度），约束 $d\_{ij} \ge 0$ 保证正深度，而且残差是有界的：对于最佳的 $d\_{ij}$，残差等于 $\mathbf v\_{ij}$ 与从 $\mathbf C\_i$ 指向 $\mathbf X\_j$ 的方向之间夹角的正弦（点在相机后方时为 1），所以一个错误观测的代价至多是一个常数。与平移平均相比，约束来自跨越许多图像的轨迹而非图像对，所以数量多得多，基线长度问题消失了；只要点分布开来，相机共线运动也不再退化。目标函数是双线性的而非射影的，GLOMAP 论文报告它能从**随机**初值收敛。我们在 40 台相机的圆上用 SciPy 的带界最小二乘来检验这一说法，使用第 5.2 节平均得到的旋转，以及贯穿全文例子中 120 个点带 0.5 像素噪声的像素：

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

从 $2\times2\times2$ 立方体内均匀抽取的位置出发，51 次函数求值就把相机圆恢复到中位误差 6.3 cm，点恢复到 6 mm。剩下的相机误差主要来自 0.9° 的旋转误差（在 5 m 处 $0.9° \approx 8$ cm）；最后的全局 BA 也会精化旋转，从而消除它。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-global-positioning.svg" caption="从随机初值开始的全局定位：求解器经过 $n\_{\mathrm{eval}}$ 次函数求值后，相机中心（三角形，按其在圆上的编号着色）和点（灰色）的俯视图（$x$ 对 $z$），每个子图使用自己的比例（尺度是规范自由度）。标题给出 $\tilde e$，即相似对齐到真值后相机中心误差的中位数，圆半径为 5 m。开始时（随机，$\tilde e=5.07$）以及 3、8、15 次求值之后，相机仍是一团乱麻，但颜色开始有了顺序；25 次之后圆环已经成形（$\tilde e=1.27$）；收敛时（51 次求值）圆及其顺序都被恢复，$\tilde e=0.06$。" %}

GLOMAP 报告其精度与 COLMAP 的增量式建图器相当或更好，而速度快几个数量级。从 COLMAP 4.0 起，它作为 `global_mapper` 命令成为 COLMAP 的一部分（截至 2026 年 11 月）。COLMAP 文档指出，它依赖良好的焦距先验，对外点的鲁棒性可能不如增量式建图器。

### 5.5 该用哪一种

| | 增量式（COLMAP） | 全局式（GLOMAP、OpenMVG、Theia） |
| --- | --- | --- |
| 顺序 | 每次一张图像 | 所有图像同时 |
| BA | 每张图像之后（局部）以及定期（全局） | 最后一次（外加若干精化） |
| 鲁棒性 | 高：每一步都经过验证，不好的图像干脆不注册 | 依赖鲁棒平均；错误的图像对可能毁掉一切 |
| 漂移 | 沿链累积，由 BA 纠正 | 误差均匀分布在整个图上 |
| 速度 | 图像多时慢（反复 BA） | 快得多 |
| 适合 | 困难、无序的网络照片集；NeRF/3DGS 数据集的参考标准 | 大规模、连通良好的采集（视频、无人机、扫描） |

前馈网络如今是获取相机的第三条路：VGGSfM（CVPR 2024）围绕学习得到的轨迹和可微 BA 构建了一个可微的 SfM 流程，VGGT（CVPR 2025）在一次前向传播中为许多图像预测相机、深度和点图。截至 2026 年 11 月，它们是快速而鲁棒的初始化器，VGGT 自己的代码也提供可选的 BA 精化：精度方面的最终裁决仍是本文的几何。[第 09 篇]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})会介绍这些模型。

## 6. 尺度不确定性

### 6.1 图像不知道米

第 3.7 节的规范自由度包括尺度。仅由图像得到的重建无法区分一栋建筑和它的模型，因为缩放所有点和所有平移不会改变任何像素：

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
    print("BA %-5s: local scale at steps 1, 15, 28: %s" % (use_ba, ratio[[0, 14, 27]].round(3)))
```

```text
scale   0.1: rms 0.628297 px
scale   1.0: rms 0.628297 px
scale  37.0: rms 0.628297 px
BA False: local scale at steps 1, 15, 28: [1.009 1.028 1.094]
BA True : local scale at steps 1, 15, 28: [0.999 1.    1.   ]
```

对一个小 10 倍和大 37 倍的场景，RMS 在六位数字上完全相同。因此 COLMAP 模型的单位是任意的，NeRF 和 3DGS 的代码在训练前会按相机中心的分布范围对场景做归一化。

### 6.2 尺度漂移

在一次全局优化中，尺度只是一个数。在顺序过程中，它在每一步都被重新估计：每个新三角化的点和每台新注册的相机都带着计算它们时所用点的尺度，以及一点误差。这些误差做随机游走。代码的后半部分在走廊重建中度量**局部尺度**，即相邻相机之间估计距离与真实距离之比：不做 BA 时，它在走廊末端达到 1.09（如增量式图所示，单步甚至达到 1.19），所以地图的远端大了 9%；每张图像之后都做 BA 时，它保持在 1.00。单目视觉里程计和 SLAM 也受同样的**尺度漂移（scale drift）**之苦，正因如此，[第 06 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})中的回环在相似变换（$\mathrm{Sim}(3)$）而不是刚体运动上进行优化。

### 6.3 获得公制尺度

尺度必须来自图像之外，或来自先验知识：

- **已知距离**：场景中的比例尺、标定板或标记，或已知大小的物体。一个距离就能确定整个模型的尺度。
- **双目相机组**：[第 02 篇]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})第 7 节标定的基线在每一帧中都是一个已知距离。
- **IMU**：加速度计测量公制加速度，使尺度在视觉惯性里程计中可观（[第 06 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})）。
- **GNSS 或其他位置先验**把模型对齐到地理坐标系，固定全部七个规范参数。
- **深度传感器和公制深度网络**（[第 07 篇]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})）为部分像素提供公制深度，从而给出尺度。

## 7. 实用检查清单

当 SfM 结果看起来不对时，按以下顺序检查：

1. **注册的图像。** 几乎所有图像都在同一个模型里吗？出现几个小模型说明场景图不连通：补拍能连接空隙的图像，或改进匹配。
2. **平均重投影误差。** 对内参正确的良好图像，应低于约 1 像素。更大的值常常意味着内参或畸变模型有误（第 02 篇），或存在卷帘快门（第 01 篇）。
3. **轨迹长度和三角化夹角。** 大量点只被两张图像以很小的夹角看到，说明几何很弱；拍摄时要有更多视差。
4. **看看相机。** 画出相机中心和视线方向（第 01 篇第 4.5 节的调试清单）。场景中出现重复或镜像的部分，说明对称结构导致了错误注册。
5. **尺度与规范。** 记住模型带有一个任意的相似变换。比较形状要在 Umeyama 对齐之后进行，而不是直接比较原始坐标。
6. **内参。** 如果让 BA 为每张图像精化焦距和畸变，要确保有足够的视图约束它们；同一台相机拍的图像应共享内参。

## 动手试试

- 第 3.6 节的光束法平差小组件：观察 LM 收敛，然后用外点把它弄坏，再用鲁棒核函数修好。
- 主页上的 [Gaussian World 演示]({{ '/' | relative_url }}#lab)用的正是本文所估计的那种相机位姿来渲染三维高斯。
- 绕着一个物体拍 30 到 50 张照片，在上面运行 COLMAP。比较 `colmap mapper` 和 `colmap global_mapper`（COLMAP 4.0 或更新版本），并在日志中查看注册顺序和重投影误差。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Random sample consensus (Fischler, Bolles) | Communications of the ACM | 1981 | [DOI](https://doi.org/10.1145/358669.358692) | RANSAC，正是为这个问题提出的：由地标求相机位姿 |
| Review and analysis of solutions of the three point perspective pose estimation problem (Haralick, Lee, Ottenberg, Nölle) | IJCV | 1994 | [DOI](https://doi.org/10.1007/BF02028352) | Grunert 的 P3P 及其后继方法，附数值分析 |
| Bundle adjustment — a modern synthesis (Triggs, McLauchlan, Hartley, Fitzgibbon) | Vision Algorithms: Theory and Practice (LNCS 1883) | 2000 | [DOI](https://doi.org/10.1007/3-540-44480-7_21) | BA 的权威参考：代价函数、稀疏性、规范自由度、鲁棒性 |
| Complete solution classification for the perspective-three-point problem (Gao, Hou, Tang, Cheng) | TPAMI | 2003 | [DOI](https://doi.org/10.1109/TPAMI.2003.1217599) | P3P 何时有一、二、三或四个解 |
| Photo tourism: exploring photo collections in 3D (Snavely, Seitz, Szeliski) | SIGGRAPH (ACM TOG) | 2006 | [DOI](https://doi.org/10.1145/1141911.1141964) | 网络照片上的增量式 SfM |
| EPnP: an accurate O(n) solution to the PnP problem (Lepetit, Moreno-Noguer, Fua) | IJCV | 2009 | [DOI](https://doi.org/10.1007/s11263-008-0152-6) | 控制点让 PnP 关于点数线性 |
| SBA: a software package for generic sparse bundle adjustment (Lourakis, Argyros) | ACM TOMS | 2009 | [DOI](https://doi.org/10.1145/1486525.1486527) | 带 Schur 补的稀疏 LM，以库的形式提供 |
| Building Rome in a day (Agarwal, Snavely, Simon, Seitz, Szeliski) | ICCV | 2009 | [DOI](https://doi.org/10.1109/ICCV.2009.5459148) | 在集群上做城市规模的 SfM |
| Bundle adjustment in the large (Agarwal, Snavely, Seitz, Szeliski) | ECCV | 2010 | [DOI](https://doi.org/10.1007/978-3-642-15552-9_3) | 非精确牛顿与迭代 Schur 求解器；BAL 基准 |
| A novel parametrization of the perspective-three-point problem (Kneip, Scaramuzza, Siegwart) | CVPR | 2011 | [DOI](https://doi.org/10.1109/CVPR.2011.5995464) | 直接求位姿的 P3P 求解器 |
| Multicore bundle adjustment (Wu, Agarwal, Curless, Seitz) | CVPR | 2011 | [DOI](https://doi.org/10.1109/CVPR.2011.5995552) | 多核 CPU 和 GPU 上的 BA |
| Rotation averaging (Hartley, Trumpf, Dai, Li) | IJCV | 2013 | [DOI](https://doi.org/10.1007/s11263-012-0601-0) | 单旋转与多旋转平均的理论 |
| Efficient and robust large-scale rotation averaging (Chatterjee, Govindu) | ICCV | 2013 | [CVF](https://openaccess.thecvf.com/content_iccv_2013/html/Chatterjee_Efficient_and_Robust_2013_ICCV_paper.html) | 先 $L\_1$ 再 IRLS，对错误图像对鲁棒 |
| Global fusion of relative motions for robust, accurate and scalable structure from motion (Moulon, Monasse, Marlet) | ICCV | 2013 | [CVF](https://openaccess.thecvf.com/content_iccv_2013/html/Moulon_Global_Fusion_of_2013_ICCV_paper.html) | 用谱方法求旋转的全局 SfM（OpenMVG） |
| Towards linear-time incremental structure from motion (Wu) | 3DV | 2013 | [DOI](https://doi.org/10.1109/3DV.2013.25) | 让增量式 SfM 接近 O(n)（VisualSFM） |
| Robust global translations with 1DSfM (Wilson, Snavely) | ECCV | 2014 | [项目页](https://research.cs.cornell.edu/1dsfm) | 去除错误的平移方向 |
| Robust camera location estimation by convex programming (Özyeşil, Singer) | CVPR | 2015 | [CVF](https://openaccess.thecvf.com/content_cvpr_2015/html/Ozyesil_Robust_Camera_Location_2015_CVPR_paper.html) | LUD：鲁棒的凸平移平均，平行刚性 |
| Structure-from-Motion revisited (Schönberger, Frahm) | CVPR | 2016 | [CVF](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) | COLMAP 的增量式流程 |
| Baseline desensitizing in translation averaging (Zhuang, Cheong, Lee) | CVPR | 2018 | [arXiv](https://arxiv.org/abs/1901.00643) | BATA：双线性、基于角度的代价 |
| Lambda Twist: an accurate fast robust perspective three point (P3P) solver (Persson, Nordberg) | ECCV | 2018 | [ECVA](https://www.ecva.net/papers/eccv_2018/papers_ECCV/html/Mikael_Persson_Lambda_Twist_An_ECCV_2018_paper.php) | 不解四次方程的快速稳定 P3P |
| Pixel-perfect structure-from-motion with featuremetric refinement (Lindenberger et al.) | ICCV | 2021 | [arXiv](https://arxiv.org/abs/2108.08291) | 用稠密学习特征精化关键点和 BA |
| VGGSfM: visual geometry grounded deep structure from motion (Wang, Karaev, Rupprecht, Novotny) | CVPR | 2024 | [CVF](https://openaccess.thecvf.com/content/CVPR2024/html/Wang_VGGSfM_Visual_Geometry_Grounded_Deep_Structure_From_Motion_CVPR_2024_paper.html) | 带可微 BA 的完全可微 SfM |
| Global structure-from-motion revisited (Pan, Baráth, Pollefeys, Schönberger) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2407.20219) | GLOMAP：相机与点的联合全局定位 |
| VGGT: visual geometry grounded transformer (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2503.11651) | 前馈预测相机、深度和点；之后可选 BA |

## 学习资源

- R. Hartley 与 A. Zisserman，*Multiple View Geometry in Computer Vision*，第 2 版，2004：第 7 章（相机矩阵估计）、第 18 章（N 视图计算方法，包括光束法平差）和附录 A6（迭代估计、稀疏 Levenberg-Marquardt）。
- R. Szeliski，*Computer Vision: Algorithms and Applications*，第 2 版，2022，第 11 章（运动恢复结构与 SLAM）：关于光束法平差、利用稀疏性和全局 SfM 的各节。可在 [szeliski.org/Book](https://szeliski.org/Book/) 免费阅读。
- B. Triggs 等人，"Bundle adjustment — a modern synthesis"（见上表）：篇幅很长，但关于规范自由度和鲁棒代价，它是最好的单篇文献；[HAL](https://hal.archives-ouvertes.fr/inria-00548290v1) 上有免费副本。
- [Ceres Solver](http://ceres-solver.org/)：其光束法平差教程和 BAL 问题；[BAL 数据集](https://grail.cs.washington.edu/projects/bal/)。
- [COLMAP 文档](https://colmap.github.io/)（教程、增量式与全局建图器）和 [GLOMAP](https://github.com/colmap/glomap)。
- OpenCV：[Perspective-n-Point 位姿计算](https://docs.opencv.org/4.x/d5/d1f/calib3d_solvePnP.html)（solvePnP 的各种方法、RANSAC 与精化）。

## 练习

1. **P3P 解的个数。** 让 P3P 例子中的相机沿一条直线移动，统计每个位置上四次方程正实根的个数。个数在哪里发生变化？（Gao 等人 2003 给出了完整分类。）

   <details markdown="1"><summary>提示</summary>

   对用 `look_at` 构造的相机，复用 `p3p` 和 `project(K, R, t, X_true[sel])`。当两个实根合并（四次多项式与零相切）时解的个数发生变化；这发生在相机穿过过这三点的"危险圆柱面"时，此时问题也变得病态。
   </details>

2. **手算 Schur 补。** 对一台相机和两个点，把 $H$ 写成 $12\times12$ 的分块矩阵，并用数值验证 Schur 补步等于对完整系统做 `np.linalg.solve(H, -g)`。

   <details markdown="1"><summary>提示</summary>

   用 `full_jacobian` 构造 $J$，令 $H = J^\top J + \lambda\,\mathrm{diag}(J^\top J)$、$\mathbf g = J^\top\mathbf r$；与 `ba_step` 返回的步长（`fixed=()`）比较。只有一台相机时也存在规范自由度，所以要保持 $\lambda > 0$。
   </details>

3. **协方差中的规范。** 分别用 $\sigma^2(J^\top J)^{+}$（伪逆）和固定相机 1 及尺度后的 $\sigma^2(J\_f^\top J\_f)^{-1}$ 计算相机中心的协方差。在每种规范下，哪些相机"不确定"？

   <details markdown="1"><summary>提示</summary>

   固定相机 1 时，不确定性随着到相机 1 的距离增大，因为这种规范把坐标系的全部不确定性都放进了其他相机。伪逆把它均匀分摊（最小范数规范）。相机之间的距离在两种规范下方差相同。
   </details>

4. **让鲁棒 BA 失效。** 把代码片段 9 的外点比例从 5% 提高到 20% 和 40%。Huber 何时失效？Cauchy 何时失效？更好的初值（更小的扰动）有帮助吗？

   <details markdown="1"><summary>提示</summary>

   Huber 的影响有界但不为零，所以其偏差大致随外点比例增大。Cauchy 的影响趋于零，但代价是非凸的；外点多、初值差时，它可能陷入错误的极小值。小组件可以让你交互地尝试同样的事情。
   </details>

5. **平移平均。** 对 40 台相机的圆，在旋转精确、方向带 1° 噪声的情况下，实现第 5.3 节的线性方法（$\mathbf d\_{ij}\times(\mathbf C\_j - \mathbf C\_i) = \mathbf 0$）。然后把所有相机放在一条直线上。会发生什么？为什么第 5.4 节的全局定位没有这个问题？

   <details markdown="1"><summary>提示</summary>

   固定 $\mathbf C\_1 = \mathbf 0$，取堆叠起来的 $3\vert\mathcal E\vert\times3(m-1)$ 系统的最小右奇异向量。在直线上所有 $\mathbf d\_{ij}$ 都平行，相机的任何间距都满足所有约束：零空间变大。点到相机的光线来自直线外的点，所以仍然能确定间距。
   </details>

**下一篇：**[视觉 SLAM]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})：在运动的相机上实时运行同样的优化，包括关键帧、因子图、回环检测和 IMU。
