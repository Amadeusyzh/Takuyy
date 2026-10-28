---
layout: post
title: "相机与多视图几何：从像素到位姿"
date: 2026-10-27 12:01:00+0900
description: "针孔相机、内参与外参、镜头畸变、对极几何、八点算法、三角化、光束法平差、基于 COLMAP 的运动恢复结构以及多视图立体，附 NumPy 代码。"
categories: neural-rendering
tags: [camera-model, epipolar-geometry, structure-from-motion, colmap, bundle-adjustment, multi-view-stereo]
series: neural-rendering
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

图形学系列讲的是从 3D 场景到图像的过程：已知几何、材质和相机，计算出像素。神经渲染（neural rendering）则把这条管线**反过来**运行。我们手里有一组照片，希望得到一个 3D 表示，使得从相同相机渲染时能够复现这些照片。NeRF 和 3D 高斯泼溅（3D Gaussian Splatting，3DGS）都假设每张训练图像都配有准确的相机参数：内参（intrinsics，包括焦距、主点和畸变）以及它在公共世界坐标系中的位姿（pose）。这些相机几乎总是来自**运动恢复结构（Structure-from-Motion，SfM）**，通常是 COLMAP；3DGS 甚至直接用 SfM 的稀疏点云作为初始化。

因此，在优化任何辐射场（radiance field）之前，我们需要先理解相机如何把 3D 映射到 2D、两个视图之间如何相互约束，以及数百个视图如何被联合求解。本文就是本系列后续内容所需的多视图几何工具箱。

## 前置知识

- 线性代数：旋转、齐次坐标（homogeneous coordinates）、SVD 与最小二乘。
- 图形学系列中的相机矩阵与投影矩阵（光栅化中的视图变换与投影变换）。
- NumPy。光束法平差的代码片段还会用到 SciPy。

## 1. 针孔相机

### 1.1 投影

理想的针孔相机（pinhole camera）通过中心投影（central projection）把 3D 点映射到像平面上。把世界点写成齐次坐标 $\tilde{\mathbf X} = (X, Y, Z, 1)^\top$。相机先用一个刚体变换（即**外参（extrinsics）**）把它变换到相机自身的坐标系，再用**内参**进行投影并转换为像素：

$$
\lambda \begin{pmatrix} u \\ v \\ 1 \end{pmatrix}
= \underbrace{\begin{pmatrix} f_x & s & c_x \\ 0 & f_y & c_y \\ 0 & 0 & 1 \end{pmatrix}}_{K}
\underbrace{\begin{pmatrix} R & \mathbf t \end{pmatrix}}_{3\times 4}
\begin{pmatrix} X \\ Y \\ Z \\ 1 \end{pmatrix},
\qquad P = K\,[R \mid \mathbf t].
$$

这里 $\lambda$ 是该点在相机坐标系下的深度，因此 $u = f_x\, X_c/Z_c + c_x$，$v = f_y\, Y_c/Z_c + c_y$（取倾斜因子 $s = 0$，这对几乎所有现代传感器都成立）。$3\times 4$ 矩阵 $P$ 称为**投影矩阵（projection matrix）**；它有 11 个自由度（12 个元素，相差一个尺度）：5 个内参自由度和 6 个外参自由度。

- $f_x, f_y$ 是以像素为单位的焦距：对于物理焦距 $F$，$f_x = F / \text{pixel width}$。若水平视场角（field of view）为 $\theta_x$、图像宽度为 $W$，则 $f_x = \frac{W}{2\tan(\theta_x/2)}$。
- $(c_x, c_y)$ 是**主点（principal point）**，即光轴穿过图像的位置，通常接近图像中心。

### 1.2 外参、相机中心与坐标约定

$[R \mid \mathbf t]$ 把**世界坐标映射到相机坐标**：$\mathbf X_c = R\mathbf X_w + \mathbf t$。相机中心是被映射到原点的那个点，$\mathbf C = -R^\top \mathbf t$。许多神经渲染代码库存储的是它的逆，即**相机到世界（camera-to-world）**矩阵

$$
T_{c2w} = \begin{pmatrix} R^\top & \mathbf C \\ \mathbf 0^\top & 1 \end{pmatrix},
$$

它的各列分别是用世界坐标表示的相机右/下/前方向轴以及相机位置。常用的坐标轴约定有两种，混用它们是这个领域最常见的 bug：

| 约定 | $x$ | $y$ | 相机朝向 | 使用者 |
| --- | --- | --- | --- | --- |
| OpenCV / COLMAP | 右 | 下 | $+z$ | COLMAP、OpenCV、3DGS（内部） |
| OpenGL / Blender | 右 | 上 | $-z$ | 原版 NeRF 的 `transforms.json`、Blender、nerfstudio |

两者之间的转换就是把 $T_{c2w}$ 右乘 $\mathrm{diag}(1, -1, -1, 1)$（翻转相机的 $y$ 轴和 $z$ 轴）。COLMAP 本身为每张图像存储的是世界到相机的四元数 `QW QX QY QZ` 和平移 `TX TY TZ`。

### 1.3 镜头畸变

真实镜头会使直线弯曲。标准的 Brown–Conrady 模型（OpenCV 以及 COLMAP 的 `OPENCV` 相机模型所采用）作用于施加内参之前的归一化图像坐标 $x = X_c/Z_c$、$y = Y_c/Z_c$。记 $r^2 = x^2 + y^2$：

$$
\begin{aligned}
x_d &= x\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + 2p_1 xy + p_2 (r^2 + 2x^2),\\
y_d &= y\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + p_1 (r^2 + 2y^2) + 2p_2 xy,
\end{aligned}
$$

然后 $u = f_x x_d + c_x$，$v = f_y y_d + c_y$。$k_i$ 项是**径向（radial）**畸变（$k_1<0$ 时为桶形，$k_1>0$ 时为枕形），$p_1, p_2$ 是**切向（tangential）**畸变，源于镜头与传感器不完全平行。鱼眼镜头需要另一种模型（COLMAP 的 `OPENCV_FISHEYE`，即带多项式校正的等距投影）。

原版 3DGS 光栅化器只支持无畸变的针孔相机，这就是为什么它的预处理脚本会先运行 COLMAP 的 `image_undistorter`，再在 `PINHOLE` 图像上训练。我们会在教程（第 6 篇）中再次遇到这一点。

内参和畸变通过**标定（calibration）**来估计。经典方法是让相机从多个朝向拍摄一块平面棋盘格，先以闭式解求出 $K$ 和畸变系数，再进行非线性优化（Zhang, 2000），这正是 `cv2.calibrateCamera` 所实现的方法。SfM 也可以直接从场景中对它们进行自标定（self-calibrate）。

### 1.4 代码：投影点

下面的代码构造两台看向一团点云的相机，并对这些点进行投影（可选畸变）。本文其余部分都会复用它。

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

注意 `look_at` 使用 "up" $=(0,-1,0)$，因为在 OpenCV 约定中图像的 $y$ 轴朝下。

## 2. 两个视图：对极几何

### 2.1 对极约束

设两台相机观测同一个 3D 点 $\mathbf X$，对应像素分别为 $\mathbf x_1$ 和 $\mathbf x_2$。两个相机中心与 $\mathbf X$ 张成一个平面，即**对极平面（epipolar plane）**。它与每幅图像相交于一条直线，即**对极线（epipolar line）**，因此给定 $\mathbf x_1$，其匹配点 $\mathbf x_2$ 必定落在图像 2 中一条已知的直线上。连接两个相机中心的直线（**基线（baseline）**）与两幅图像的交点称为**对极点（epipole）**。

从代数上看，设相对位姿为 $\mathbf X_2 = R\,\mathbf X_1 + \mathbf t$（从相机 1 坐标到相机 2 坐标），并令 $\hat{\mathbf x}_i = K_i^{-1}\tilde{\mathbf x}_i$ 为归一化（已标定）齐次坐标。向量 $\hat{\mathbf x}_2$、$\mathbf t$ 和 $R\hat{\mathbf x}_1$ 共面，因此它们的混合积为零：

$$
\hat{\mathbf x}_2^\top\, [\mathbf t]_\times R\, \hat{\mathbf x}_1 = 0,
\qquad
E = [\mathbf t]_\times R,
\qquad
[\mathbf t]_\times = \begin{pmatrix} 0 & -t_z & t_y \\ t_z & 0 & -t_x \\ -t_y & t_x & 0 \end{pmatrix}.
$$

$E$ 称为**本质矩阵（essential matrix）**（Longuet-Higgins, 1981）。在像素坐标下，同一约束写作

$$
\tilde{\mathbf x}_2^\top F\, \tilde{\mathbf x}_1 = 0,
\qquad
F = K_2^{-\top} E\, K_1^{-1},
$$

其中 $F$ 为**基础矩阵（fundamental matrix）**。$F\tilde{\mathbf x}_1$ 是图像 2 中的对极线，$F^\top \tilde{\mathbf x}_2$ 是图像 1 中的对极线，对极点则是零空间向量：$F\mathbf e_1 = 0$，$F^\top \mathbf e_2 = 0$。

一些有用的事实：

- $F$ 的秩为 2，有 7 个自由度（9 个元素，减去尺度，再减去 $\det F = 0$）。
- $E$ 有 5 个自由度（3 个旋转 + 2 个表示 $\mathbf t$ 的方向：平移的尺度从两幅图像中**不可观测**）。它的两个非零奇异值相等：$\mathrm{svd}(E) = (\sigma, \sigma, 0)$。

### 2.2 （归一化）八点算法

每一对对应点都给出一个关于 $F$ 的 9 个元素的线性方程。记 $\tilde{\mathbf x}_1 = (u_1, v_1, 1)$ 和 $\tilde{\mathbf x}_2 = (u_2, v_2, 1)$，

$$
\tilde{\mathbf x}_2^\top F \tilde{\mathbf x}_1 = (\tilde{\mathbf x}_2 \otimes \tilde{\mathbf x}_1)^\top \operatorname{vec}(F) = 0,
$$

于是把 $N \ge 8$ 对对应点堆叠起来就得到 $A\,\operatorname{vec}(F) = \mathbf 0$，其中 $A \in \mathbb R^{N\times 9}$。在 $\lVert \operatorname{vec}(F)\rVert = 1$ 约束下的最小二乘解是 $A$ 的最小奇异值对应的右奇异向量。随后把 $F$ 的最小奇异值置零，以强制其秩为 2。

如果直接在像素坐标上使用这一方法，问题的条件数会很差：$A$ 的元素范围从 1 到 $10^5$。Hartley（1997）指出，只需对每幅图像的点做平移和缩放，使其质心位于原点、到原点的平均距离为 $\sqrt 2$，线性算法的精度就能与迭代方法相媲美。先在归一化坐标下求解 $\hat F$，再撤销归一化：$F = T_2^\top \hat F T_1$。

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

最后打印的 **Sampson 距离（Sampson distance）**是对应点到对极约束的几何距离的一阶近似，也是 RANSAC 内部使用的标准残差。

在实际中，对应点来自特征匹配（SIFT，或 SuperPoint + LightGlue 这类学习型匹配器），并且包含大量外点（outlier），因此 $F$ 或 $E$ 要在 **RANSAC** 中估计：反复对一个随机最小样本拟合模型，用 Sampson 距离统计内点（inlier）数量，保留最好的模型。若内参已知，则使用求解 $E$ 的最小**五点**求解器（Nistér, TPAMI 2004），因为每个样本所需点数越少，RANSAC 所需的迭代次数就呈指数级减少。

### 2.3 从 $E$ 恢复位姿

由 $E = K_2^\top F K_1$ 及其 SVD $E = U\,\mathrm{diag}(1,1,0)\,V^\top$，可以得到四个候选位姿：

$$
R \in \{U W V^\top,\; U W^\top V^\top\},\quad \mathbf t \in \{+\mathbf u_3, -\mathbf u_3\},\qquad
W = \begin{pmatrix} 0 & -1 & 0 \\ 1 & 0 & 0 \\ 0 & 0 & 1 \end{pmatrix},
$$

其中 $\mathbf u_3$ 是 $U$ 的最后一列（$U$、$V$ 的符号取定为使两者行列式均为 $+1$）。只有一个候选能让三角化出的点同时位于两台相机前方（即**手性（cheirality）**检验），所以我们用每个候选分别三角化并计数。这正是 `cv2.recoverPose` 所做的事情。

## 3. 三角化

给定两个（或更多）投影矩阵 $P_i$ 和观测 $\mathbf x_i = (u_i, v_i)$，**直接线性变换（direct linear transform，DLT）**利用了 $\tilde{\mathbf x}_i \times P_i \tilde{\mathbf X} = \mathbf 0$ 这一事实。记 $\mathbf p_i^{k\top}$ 为 $P_i$ 的第 $k$ 行，每个视图贡献两个独立的方程：

$$
\begin{pmatrix}
u_1 \mathbf p_1^{3\top} - \mathbf p_1^{1\top} \\
v_1 \mathbf p_1^{3\top} - \mathbf p_1^{2\top} \\
u_2 \mathbf p_2^{3\top} - \mathbf p_2^{1\top} \\
v_2 \mathbf p_2^{3\top} - \mathbf p_2^{2\top}
\end{pmatrix} \tilde{\mathbf X} = \mathbf 0 .
$$

同样取最小奇异值对应的右奇异向量并去齐次化即可。DLT 最小化的是代数误差；统计意义上最优的解应最小化重投影误差（reprojection error），而这正是光束法平差无论如何都会做的。当两条射线之间的**三角化角（triangulation angle）**很小时，三角化是病态的：微小的像素误差就会让点沿射线移动很远。因此 COLMAP 只接受满足最小角度（默认 1.5 度）的点，并剔除重投影误差较大的点。

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

在半个像素的噪声下，我们恢复的相对旋转误差不到一度，结构则是**在相差一个全局尺度的意义下**恢复的。这种尺度歧义是根本性的：任何仅凭图像得到的 SfM 重建都只能确定到一个相似变换（旋转、平移、尺度；共 7 个自由度），即所谓的**规范自由度（gauge freedom）**。这就是为什么 COLMAP 模型的单位是任意的，也是为什么 NeRF/3DGS 代码要对场景做归一化（例如 3DGS 会根据相机中心的分布范围计算一个"相机范围（camera extent）"，用来设定学习率和致密化阈值）。

## 4. 光束法平差

两视图几何提供了一个起点；**光束法平差（bundle adjustment，BA）**则通过最小化总重投影误差，对所有相机和点进行联合优化：

$$
\min_{\{K_i, R_i, \mathbf t_i\},\,\{\mathbf X_j\}}
\sum_{(i,j)\in\mathcal O} \rho\!\left( \big\lVert \pi(K_i, R_i, \mathbf t_i, \mathbf X_j) - \mathbf x_{ij} \big\rVert^2 \right),
$$

其中 $\mathcal O$ 是观测集合（点 $j$ 在图像 $i$ 中被看到），$\pi$ 是投影（含畸变），$\rho$ 是 Huber 或 Cauchy 之类的鲁棒损失（robust loss），用于降低外点的权重。这个名字指的是调整从每台相机发出的射线"光束（bundle）"，直到它们在各个点处交汇。

BA 是一个非线性最小二乘问题，用 **Gauss–Newton** 或 **Levenberg–Marquardt（LM）**方法求解。LM 在每一步求解

$$
(J^\top J + \mu D)\,\delta = -J^\top \mathbf r ,
$$

其中 $J$ 为雅可比矩阵（Jacobian），$\mathbf r$ 为残差，$\mu$ 为阻尼系数。把 BA 扩展到数千张图像的关键在于**稀疏性（sparsity）**：每个残差只依赖于一台相机和一个点。把未知量按（相机，点）排序后，法方程矩阵具有分块结构

$$
\begin{pmatrix} B & C \\ C^\top & P \end{pmatrix}\begin{pmatrix} \delta_c \\ \delta_p\end{pmatrix} = \begin{pmatrix} \mathbf g_c \\ \mathbf g_p \end{pmatrix},
$$

其中 $P$ 是由 $3\times 3$ 块（每个点一块）构成的块对角矩阵。用 **Schur 补（Schur complement）**消去点之后，剩下一个小得多的"约化相机系统（reduced camera system）"$(B - C P^{-1} C^\top)\,\delta_c = \mathbf g_c - C P^{-1}\mathbf g_p$，之后每个点都可以独立更新。Ceres Solver（COLMAP 所使用）等库实现了这一方法，并配合鲁棒损失和自动微分（automatic differentiation）；完整内容参见 Triggs 等人的 "Bundle Adjustment — A Modern Synthesis"（1999）。

下面是一个用 SciPy 实现的小型 BA，用来优化我们的两视图重建（相机参数化为轴角 + 平移）：

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

残差从大约 0.47 px（DLT/八点算法的解）下降到大约 0.16 px。实际系统会固定规范（例如固定第一台相机和尺度），使问题成为适定的；这里信赖域（trust-region）求解器只是沿着平坦方向移动，并无害处。

## 5. 运动恢复结构与 COLMAP

**运动恢复结构**从无序图像集合中恢复相机位姿（运动）和稀疏点云（结构）。早期的大规模系统，如 Photo Tourism（Snavely et al., SIGGRAPH 2006），利用互联网照片重建地标建筑；**COLMAP**（Schönberger & Frahm, "Structure-from-Motion Revisited", CVPR 2016）则是一个开源的增量式（incremental）SfM 系统，已成为神经渲染数据集的默认选择。

### 5.1 增量式管线

1. **特征提取（feature extraction）。** 在每幅图像中检测关键点（keypoint）并计算描述子（descriptor）（COLMAP 在 GPU 上使用 SIFT），并从 EXIF 中读取或猜测内参。
2. **匹配（matching）。** 小规模图像集用穷举匹配，视频用顺序匹配，大规模集合用词汇树（vocabulary tree）检索。
3. **几何验证（geometric verification）。** 对每个图像对用 RANSAC 估计 $F$、$E$ 或单应矩阵（homography），只保留内点匹配。结果是**场景图（scene graph）**：图像为节点，通过验证的图像对为边。
4. **初始化（initialization）。** 选择一对连接良好、基线较宽的图像，从 $E$ 恢复相对位姿并进行三角化。
5. **图像注册（image registration）。** 反复选择**下一最佳视图（next best view）**（一张尚未注册、能看到大量已三角化点且这些点在图像中空间分布良好的图像），并在 RANSAC 中用 **PnP**（Perspective-n-Point）从 2D–3D 对应关系估计其位姿。
6. **三角化。** 用 COLMAP 的鲁棒多视图三角化，对新注册图像看到的新点进行三角化。
7. **光束法平差。** 每次注册后运行局部 BA，每当模型显著增长时运行全局 BA，然后过滤重投影误差大的观测并重新三角化。

CVPR 2016 论文的贡献恰恰在于让第 3 步以及第 5–7 步变得鲁棒且完整：一种对图像对几何进行分类的几何验证策略（例如检测纯旋转或类似水印的匹配）、下一最佳视图评分、鲁棒三角化，以及迭代的 BA / 重新三角化 / 过滤循环。

另一种方案是**全局 SfM（global SfM）**，它不是逐张添加图像，而是先一次性估计所有旋转，再一次性估计所有位置。GLOMAP（Pan et al., ECCV 2024）重新审视了这一方法，报告的精度与 COLMAP 相当，而运行速度快得多；并且它直接读取 COLMAP 的数据库，因此可以无缝接入相同的工作流程。

### 5.2 COLMAP 给你什么

一个稀疏模型由三个文件组成（二进制 `.bin` 或文本 `.txt`）：

- `cameras.txt`：每个相机模型一行，例如 `1 PINHOLE 1600 1200 1450.2 1450.2 800 600`（`CAMERA_ID MODEL WIDTH HEIGHT PARAMS[]`）。
- `images.txt`：每张图像包含世界到相机的位姿 `QW QX QY QZ TX TY TZ`、相机 id 和文件名，随后一行是 2D 关键点及其所观测的 3D 点的 id。
- `points3D.txt`：每个点包含其位置、颜色、重投影误差以及它的**轨迹（track）**（哪些图像和关键点观测到了它）。

NeRF 的数据加载器会把 `images.txt` 转换成相机到世界矩阵；3DGS 还会额外读取 `points3D`，为每个稀疏点创建一个高斯。一个应当始终进行的快速健全性检查：COLMAP 报告的**平均重投影误差**应低于约 1 px，并且几乎所有图像都应被注册到同一个模型中。

## 6. 多视图立体

SfM 点是稀疏的，只出现在有显著特征的地方。**多视图立体（multi-view stereo，MVS）**在相机已知的前提下对重建进行稠密化。经典的做法是为每幅参考图像估计一张**深度图（depth map）**：对每个像素搜索能使其与相邻视图的光度一致性（photo-consistency）最大化的深度（通常还包括法向），然后把所有深度图融合成稠密点云，并可选地生成网格（例如泊松表面重建（Poisson surface reconstruction））。

- **平面扫描（plane sweeping）**测试一组正对相机的（fronto-parallel）深度平面：通过单应矩阵 $H = K_s (R - \mathbf t \mathbf n^\top / d) K_r^{-1}$ 把源图像变换到每个平面上，然后比较图像块（NCC）。
- **PatchMatch 立体（PatchMatch stereo）**在相邻像素之间传播好的深度/法向假设，并配合随机细化，代价远低于穷举搜索。COLMAP 的 MVS（Schönberger et al., "Pixelwise View Selection for Unstructured Multi-View Stereo", ECCV 2016）增加了逐像素的源视图选择和几何一致性，使其能处理非结构化的照片集合。
- **学习型 MVS（learned MVS）**，如 MVSNet（Yao et al., ECCV 2018），通过对 CNN 特征进行可微单应变换构建代价体（cost volume），并用 3D 卷积对其进行正则化。

为什么神经渲染系列要关心这些？因为 NeRF 和 3DGS 可以被看作**带可微渲染器的 MVS**：它们不是去匹配图像块，而是优化一个体表示，使渲染结果能复现每一幅图像。MVS 深度也被广泛用作两者的几何先验或初始化。

### 6.1 前馈式几何

自 2024 年以来，直接从图像回归几何的网络改变了这一格局。DUSt3R（Wang et al., CVPR 2024）在内参未知的情况下为一对图像预测逐像素的**点图（pointmap）**；MASt3R（Leroy et al., ECCV 2024）在此基础上增加了稠密匹配特征；VGGT（Wang et al., CVPR 2025）则在一次前向传播中为多个视图预测相机、深度图、点图和轨迹。这些方法越来越多地被用于为 COLMAP 无法处理的稀疏或随手拍摄的数据估计位姿，并且与第 5 篇中的前馈式 3DGS 方法直接相关。

## 动手试试

[交互实验室]({{ '/' | relative_url }}#lab)中的 Gaussian World 演示正是用第 1 节的投影模型把每个高斯放到屏幕上：视图矩阵、透视除法，以及由视场角推导出的焦距。当你以第一人称四处走动时，你改变的就是 $R$ 和 $\mathbf t$；第 4 篇会解释同一投影的雅可比矩阵如何把 3D 高斯变成 2D 椭圆。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| A computer algorithm for reconstructing a scene from two projections (Longuet-Higgins) | Nature | 1981 | — | 提出本质矩阵和八点算法的思想 |
| In Defense of the Eight-Point Algorithm (Hartley) | TPAMI | 1997 | — | 坐标归一化使线性方法变得精确 |
| A Flexible New Technique for Camera Calibration (Zhang) | TPAMI | 2000 | [DOI](https://doi.org/10.1109/34.888718) | OpenCV 所采用的棋盘格标定方法 |
| Bundle Adjustment — A Modern Synthesis (Triggs et al.) | Vision Algorithms Workshop (LNCS) | 1999 | — | 关于 BA 中稀疏非线性最小二乘的权威参考 |
| An Efficient Solution to the Five-Point Relative Pose Problem (Nistér) | TPAMI | 2004 | — | 在 RANSAC 中使用的 $E$ 的最小求解器 |
| Photo Tourism: Exploring Photo Collections in 3D (Snavely et al.) | SIGGRAPH | 2006 | — | 互联网规模的 SfM，现代管线的前身 |
| Structure-from-Motion Revisited (Schönberger & Frahm) | CVPR | 2016 | [CVF](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) | COLMAP SfM；NeRF/3DGS 默认的位姿来源 |
| Pixelwise View Selection for Unstructured Multi-View Stereo (Schönberger et al.) | ECCV | 2016 | [DOI](https://doi.org/10.1007/978-3-319-46487-9_31) | COLMAP 的 PatchMatch MVS |
| MVSNet: Depth Inference for Unstructured Multi-view Stereo (Yao et al.) | ECCV | 2018 | [arXiv](https://arxiv.org/abs/1804.02505) | 基于学习的代价体 MVS |
| DUSt3R: Geometric 3D Vision Made Easy (Wang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.14132) | 无需位姿的点图回归 |
| Grounding Image Matching in 3D with MASt3R (Leroy et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2406.09756) | 在 DUSt3R 之上实现稠密匹配 |
| Global Structure-from-Motion Revisited (GLOMAP, Pan et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2407.20219) | 快速的全局 SfM，与 COLMAP 兼容 |
| VGGT: Visual Geometry Grounded Transformer (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2503.11651) | 前馈式地为多个视图预测相机 + 深度 + 点 |

## 学习资源

- R. Hartley and A. Zisserman, *Multiple View Geometry in Computer Vision*, 2nd ed., Cambridge University Press, 2004。第 1–4 节所有内容的权威参考书。
- R. Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed.，可在 [szeliski.org/Book](https://szeliski.org/Book/) 免费在线阅读（其中关于图像形成、SfM 和深度估计的章节）。
- Stanford [CS231A: Computer Vision, From 3D Perception to 3D Reconstruction and Beyond](https://web.stanford.edu/class/cs231a/)：关于相机模型、对极几何和 SfM 的课程讲义。
- [COLMAP 文档](https://colmap.github.io/)和[源代码](https://github.com/colmap/colmap)，包括输出格式和相机模型；[GLOMAP](https://github.com/colmap/glomap)。
- [Ceres Solver](http://ceres-solver.org/) 中关于光束法平差的教程。
- OpenCV 的相机标定与 `calib3d` 模块文档（`calibrateCamera`、`findEssentialMat`、`recoverPose`、`triangulatePoints`）。

## 练习

1. 证明 $E = [\mathbf t]\_\times R$ 的奇异值为 $(\lVert\mathbf t\rVert, \lVert\mathbf t\rVert, 0)$。提示：$[\mathbf t]\_\times$ 的奇异值为 $(\lVert\mathbf t\rVert, \lVert\mathbf t\rVert, 0)$，且 $R$ 是正交矩阵。
2. 从 `eight_point` 中去掉 Hartley 归一化，绘制 Sampson 误差随像素噪声变化的曲线。结果会变差多少？
3. 给合成图像加入径向畸变（$k_1 = -0.2$），在不对其建模的情况下运行整条管线，观察重建出的点如何弯曲。然后把 $k_1$ 作为一个参数加入光束法平差。
4. 把 `triangulate` 扩展到 $N$ 个视图，并计算每个点的三角化角；剔除小于 1.5° 的点。
5. 对桌上一个物体拍摄 30–50 张照片并运行 COLMAP，在 GUI 中检查 `cameras.txt`、`images.txt` 以及重投影误差。

**下一篇：**有了标定好的相机，[第 2 篇]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})将借助可微体渲染把图像变成神经辐射场。
