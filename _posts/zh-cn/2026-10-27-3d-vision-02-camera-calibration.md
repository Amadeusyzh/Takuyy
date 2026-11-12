---
layout: post
title: "相机标定：单应矩阵、张正友标定法，以及结果有多可信"
date: 2026-10-27 11:02:00+0900
description: "用棋盘格估计相机内参与镜头畸变：平面单应与归一化 DLT、张正友闭式解、Levenberg-Marquardt 优化、重投影误差与参数不确定度、标定板与亚像素角点、双目极线校正、手眼标定 AX = XB 与相机-IMU 标定，附合成数据上的 NumPy 与 OpenCV 代码。"
categories: 3d-vision
tags: [camera-calibration, homography, dlt, zhang-method, levenberg-marquardt, uncertainty, stereo-rectification, hand-eye, kalibr]
series: 3d-vision
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第 01 篇]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})写下了相机模型：针孔投影 $P = K[R \mid \mathbf t]$ 加上一个畸变多项式。那里所有的数值都是给定的。可在实际中，没有人会把 $f_x$ 或 $k_1$ 直接交给你。镜头有标称焦距，但以像素为单位的有效焦距取决于对焦位置、传感器的确切位置和制造公差。主点可能偏离图像中心几十个像素，廉价广角镜头的畸变可以让角落的像素移动 30 像素甚至更多。

**相机标定**（camera calibration）就是测量这些数值。它几乎是所有 三维视觉项目的第一个实验：SfM、SLAM、双目深度、AR 配准、机器人抓取。这里的误差会传播到下游的一切。焦距长了 1%，由已知基线（双目相机，或移动了已知距离的相机）三角化得到的每个深度大约都会被放大 1%；没有校正的畸变会把直线弄弯，从而破坏极线几何。本文从零搭建标准流程，在已知真值的合成数据上运行，与 OpenCV 对照，然后回答教程通常略过的问题：*这个结果有多可信，在图像的哪些区域可信？*

## 预备知识

- 本系列第 01 篇：齐次坐标、$K$、$[R \mid \mathbf t]$、Brown-Conrady 模型以及用不动点迭代去畸变。
- 线性最小二乘与 SVD：$\min \lVert A\mathbf h\rVert$（约束 $\lVert\mathbf h\rVert = 1$）的解是最小奇异值对应的右奇异向量。
- 梯度与雅可比矩阵；一点概率（高斯噪声、协方差）。
- Python、NumPy 和 SciPy。第 4 到第 8 节还会用 OpenCV 交叉验证（`pip install opencv-python`；下面的数字来自 OpenCV 4.10）。所有代码片段构成**同一个脚本**：按顺序运行，打印出的每个数字都与正文一致。

## 1. 标定问题

### 1.1 估计什么，依据什么

我们使用第 01 篇的相机模型和 OpenCV 默认的五个畸变系数。相机坐标系（OpenCV 约定：$x$ 向右、$y$ 向下、$z$ 向前）中的三维点 $\mathbf X_c = (X_c, Y_c, Z_c)$ 的归一化坐标为 $x = X_c/Z_c$、$y = Y_c/Z_c$。记 $r^2 = x^2 + y^2$，镜头把它们移到

$$
\begin{aligned}
x_d &= x\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + 2p_1 xy + p_2 (r^2 + 2x^2),\\
y_d &= y\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + p_1 (r^2 + 2y^2) + 2p_2 xy,
\end{aligned}
$$

像素坐标为 $u = f_x x_d + c_x$、$v = f_y y_d + c_y$。因此**内参**（intrinsic parameters）是 $\boldsymbol\theta = (f_x, f_y, c_x, c_y, k_1, k_2, p_1, p_2, k_3)$，共九个数。我们假设倾斜（skew）为零，这对几乎所有现代传感器都成立。

$\boldsymbol\theta$ 无法直接测量。我们*能*做的是让相机拍摄一个几何形状精确已知的物体，在图像中检测它上面的点，然后问：哪一个 $\boldsymbol\theta$ 能解释我们看到的东西？打印出来的**平面标定板**（planar target，通常是棋盘格）是最便宜的这类物体：板上每个角点的位置都精确到零点几毫米，而且角点很容易以亚像素精度检测。

但有一个麻烦：我们也不知道每张照片里标定板在哪里。每张图像 $i$ 都带来一个标定板位姿 $(R_i, \mathbf t_i)$，即另外六个未知数。用一块有 $n$ 个角点的标定板拍 $N$ 张图像，就有

$$
\underbrace{9}_{\boldsymbol\theta} + \underbrace{6N}_{\text{位姿}} \text{ 个未知数}, \qquad 2nN \text{ 个观测 } (u, v).
$$

对我们的标定板（$n = 54$）和 $N = 12$ 张图像，就是 81 个未知数和 1296 个观测，方程远多于未知数。但问题是非线性的（旋转、透视除法、畸变多项式），无法一步解出。张正友（Zhang, 2000）给出的经典做法分三个阶段：

1. 对每张图像，估计从标定板平面到图像的**单应矩阵**（homography）（线性，第 2 节）。
2. 忽略畸变，由单应矩阵以**闭式解**（closed form）得到 $K$ 和各个位姿（线性，第 3 节）。
3. 以重投影误差为目标，用**非线性最小二乘**（nonlinear least squares）把所有参数（包括畸变）一起优化（第 4 节）。

之后才是让结果真正可用的部分：**检验**它（第 5 节）。

### 1.2 合成数据集

为了能把每一步都和真值对照，我们模拟这个实验。相机传感器为 $640\times 480$，$f_x = 600$、$f_y = 596$（像素略非正方形），主点 $(322, 236)$ 偏离中心几个像素，畸变采用第 01 篇的桶形畸变（$k_1 = -0.28$，$k_2 = 0.07$）再加一点切向畸变。标定板有 $9\times 6$ 个内角点，方格边长 30 mm。我们把它摆成十二个位姿：三个正对相机（一近一远），四个绕某一轴倾斜 35°，四个推到图像四角，一个绕光轴转 40°。实际的角点检测器精度为零点几像素，所以我们加上 $\sigma = 0.3$ 像素的高斯噪声。

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

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-setup.svg" caption="合成实验。左：位于 $\mathbf C$ 的相机视锥和相机坐标系中的十二个标定板位姿（$z$ 朝里、$-y$ 朝上绘制）。右：图像中 648 个带噪声的角点，按视图着色，并画出每块板的轮廓。视图 1 到 3 正对相机，4 到 7 绕 $y$ 或 $x$ 轴倾斜 35°，8 到 11 位于图像四角，12 绕光轴转了 40°。角点覆盖 $u \in [47, 596]$、$v \in [45, 427]$：几乎覆盖整幅图像，但还差一点。" %}

## 2. 单应矩阵与 DLT

### 2.1 为什么平面给出单应

把标定板坐标系建在板上，于是每个角点都有 $Z = 0$，板坐标为 $(X, Y, 0)$。把旋转按列写成 $R = [\mathbf r_1\ \mathbf r_2\ \mathbf r_3]$。一个角点的投影（暂时忽略畸变）为

$$
s \begin{pmatrix} u \\ v \\ 1 \end{pmatrix}
= K \begin{pmatrix} \mathbf r_1 & \mathbf r_2 & \mathbf r_3 & \mathbf t \end{pmatrix}
\begin{pmatrix} X \\ Y \\ 0 \\ 1 \end{pmatrix}
= \underbrace{K \begin{pmatrix} \mathbf r_1 & \mathbf r_2 & \mathbf t \end{pmatrix}}_{H}
\begin{pmatrix} X \\ Y \\ 1 \end{pmatrix}.
$$

$R$ 的第三列乘的是 $Z = 0$，于是消失了。剩下的 $3\times 3$ 矩阵 $H$ 把齐次板坐标映射到齐次像素坐标：这就是一个**单应**（平面的射影变换，第 01 篇 1.5 节）。$H$ 只在相差一个尺度的意义下确定（因子 $s$ 是深度），所以有 8 个自由度。它把直线映射为直线，这就是为什么只要镜头没有畸变，拍出的棋盘格的行和列仍是直的。

这个等式是平面标定的核心。$H$ 可以仅凭图像测出，而它包含了乘在一起的 $K$、$\mathbf r_1$、$\mathbf r_2$ 和 $\mathbf t$。第 3 节会把它们拆开。

### 2.2 直接线性变换（DLT）

记 $\tilde{\mathbf x} = (u, v, 1)^\top$、$\tilde{\mathbf X} = (X, Y, 1)^\top$，令 $\mathbf h_1^\top, \mathbf h_2^\top, \mathbf h_3^\top$ 为 $H$ 的**行**。"相差一个尺度相等"意味着 $\tilde{\mathbf x} \times H\tilde{\mathbf X} = \mathbf 0$。$H\tilde{\mathbf X}$ 的第三个分量是 $\mathbf h_3^\top\tilde{\mathbf X}$，除掉它得到

$$
u = \frac{\mathbf h_1^\top \tilde{\mathbf X}}{\mathbf h_3^\top \tilde{\mathbf X}}, \quad
v = \frac{\mathbf h_2^\top \tilde{\mathbf X}}{\mathbf h_3^\top \tilde{\mathbf X}}
\quad\Longrightarrow\quad
\begin{aligned}
\mathbf h_1^\top \tilde{\mathbf X} - u\, \mathbf h_3^\top \tilde{\mathbf X} &= 0,\\
\mathbf h_2^\top \tilde{\mathbf X} - v\, \mathbf h_3^\top \tilde{\mathbf X} &= 0.
\end{aligned}
$$

两个方程对九个元素 $\mathbf h = (h_{11}, h_{12}, \dots, h_{33})$ 都是**线性**的。每个对应点给出矩阵 $A$ 的两行：

$$
\begin{pmatrix}
X & Y & 1 & 0 & 0 & 0 & -uX & -uY & -u \\
0 & 0 & 0 & X & Y & 1 & -vX & -vY & -v
\end{pmatrix} \mathbf h = \mathbf 0 .
$$

有 $n \ge 4$ 个点（任意三点不共线）时，把它们叠成 $2n\times 9$ 的方程组 $A\mathbf h = \mathbf 0$。有噪声时没有精确解，于是我们在 $\lVert\mathbf h\rVert = 1$（排除 $\mathbf h = \mathbf 0$）的约束下最小化**代数误差**（algebraic error）$\lVert A\mathbf h\rVert$。解就是 $A$ 最小奇异值对应的右奇异向量。整个算法就是：构造 $A$，做一次 SVD。

### 2.3 归一化

$A$ 的元素大小差异极大：板坐标约 0.1 m，像素约 300，而 $uX$ 这样的乘积把两者混在一起。于是代数误差对各个方程的权重极不均匀，结果还依赖于单位和原点这种任意的选择。Hartley（1997）的办法是在两侧各做一个**相似变换**：把点的质心移到原点，再缩放使点到原点的平均距离为 $\sqrt 2$。板一侧用 $T_1$、图像一侧用 $T_2$，我们在归一化后的点之间求 $\hat H$，最后再变换回去：

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

**手算核对。** 视图 1 是正对的：$R = I$，$\mathbf t = (-0.12, -0.075, 0.55)$ m（板的第一个角点在光轴左边 12 cm、上方 7.5 cm，距离 55 cm）。于是 $H = K[\mathbf e_1\ \mathbf e_2\ \mathbf t]$，除以 $t_z = 0.55$ 后：

$$
H = \begin{pmatrix} f_x/t_z & 0 & (f_x t_x + c_x t_z)/t_z \\ 0 & f_y/t_z & (f_y t_y + c_y t_z)/t_z \\ 0 & 0 & 1\end{pmatrix}
= \begin{pmatrix} 1090.9 & 0 & 191.1 \\ 0 & 1083.6 & 154.7 \\ 0 & 0 & 1 \end{pmatrix}.
$$

估计结果结构正确，但对角线小了约 1.2%。DLT 本身没有错：桶形畸变把外侧角点拉向中心，所以标定板*看起来*更小，而单应（把直线映射成直线）无法表示这种弯曲。下图展示了畸变最强的视图中的这种系统性偏差。这是第一个警告：不含畸变的闭式解会有偏差。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-homography.svg" caption="单应把标定板平面（左，单位 mm，$Z=0$）映射到图像。右：不加噪声的视图 8（图像左上角），用最佳拟合的 $H$ 映射的网格（橙色，按构造都是直线），以及真实的带畸变角点（紫色）与 $H$ 预测之间的残差，放大 20 倍。偏差是系统性的而不是随机的：RMS 0.78 像素，最大 2.06 像素。单应无法让直线弯曲，第 4 节的畸变项可以。" width="95%" %}

归一化带来了什么？下图左侧是视图 1 的 $A$ 的奇异值：不归一化时它们跨越六个数量级，比值 $s_1/s_8$（最大值与第二小的值之比；$s_9$ 是我们要找的"零"方向）为 $3.3\times 10^4$，而归一化后是 3.5。右侧对每个噪声水平在 300 块带噪声、无畸变的标定板上运行 DLT。老实说：54 个分布良好的点加上双精度浮点，对精度的影响很小，只有百分之几，在 $\sigma = 3$ 像素时增大到 14%（板坐标以米为单位）和 20%（以毫米为单位）。归一化没有任何代价，让结果与单位选择无关；而在坐标以二次形式出现的地方（第 04 篇的基础矩阵）或点数很少时，它重要得多。请始终使用它。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-normalization.svg" caption="左：视图 1 的 $108\times 9$ DLT 矩阵 $A$ 的九个奇异值，不做（红）与做（蓝）Hartley 归一化。右：估计的单应相对真实单应的 RMS 误差 $e_H$（无畸变标定板，300 次试验的平均）随角点噪声 $\sigma$ 的变化。归一化：$\sigma=1$ 时 0.381 像素，$\sigma=3$ 时 1.142 像素；不归一化、板坐标用米时在 $\sigma=3$ 为 1.306 像素，用毫米时为 1.369 像素。虚线 $\sigma\sqrt{8/54}$ 是用 54 个点拟合 8 个参数时的期望误差。" %}

## 3. 张正友闭式解

### 3.1 每张图像两个约束

现在是关键思想。把 $H$ 按**列**写成 $H = [\mathbf h_1\ \mathbf h_2\ \mathbf h_3]$。由于对某个未知尺度 $\lambda$ 有 $H = \lambda K[\mathbf r_1\ \mathbf r_2\ \mathbf t]$，

$$
\mathbf r_1 = \tfrac{1}{\lambda} K^{-1}\mathbf h_1, \qquad \mathbf r_2 = \tfrac{1}{\lambda} K^{-1}\mathbf h_2 .
$$

我们对位姿一无所知，只知道 $\mathbf r_1$ 和 $\mathbf r_2$ 是旋转矩阵的两列：**正交**且**长度相等（为 1）**。代入得

$$
\mathbf r_1^\top \mathbf r_2 = 0 \;\Rightarrow\; \mathbf h_1^\top B\, \mathbf h_2 = 0, \qquad
\mathbf r_1^\top \mathbf r_1 = \mathbf r_2^\top \mathbf r_2 \;\Rightarrow\; \mathbf h_1^\top B\, \mathbf h_1 - \mathbf h_2^\top B\, \mathbf h_2 = 0,
\qquad B = K^{-\top}K^{-1}.
$$

位姿消失了。每张图像给出两个关于同一个对称矩阵 $B$ 的方程，而 $B$ 只依赖于内参。（几何上，$B$ 是**绝对二次曲线的像**（image of the absolute conic），也就是第 01 篇 1.6 节中由消失点标定背后的那个对象：两个正交的消失方向 $\mathbf v_1, \mathbf v_2$ 满足 $\mathbf v_1^\top B\,\mathbf v_2 = 0$。这里 $\mathbf h_1$ 和 $\mathbf h_2$ *正是*标定板 $X$ 轴和 $Y$ 轴的消失点。）

### 3.2 关于 $B$ 的线性方程组

$B$ 对称，有六个不同的元素 $\mathbf b = (B_{11}, B_{12}, B_{22}, B_{13}, B_{23}, B_{33})$。把 $\mathbf h_i^\top B\,\mathbf h_j$ 展开得到点积 $\mathbf v_{ij}^\top \mathbf b$，其中

$$
\mathbf v_{ij} = \big(h_{1i}h_{1j},\; h_{1i}h_{2j} + h_{2i}h_{1j},\; h_{2i}h_{2j},\; h_{3i}h_{1j} + h_{1i}h_{3j},\; h_{3i}h_{2j} + h_{2i}h_{3j},\; h_{3i}h_{3j}\big)^\top,
$$

$h_{ki}$ 是第 $i$ 列的第 $k$ 个元素。图像 $i$ 的两个约束成为矩阵 $V$ 的两行：

$$
\begin{pmatrix} \mathbf v_{12}^\top \\ (\mathbf v_{11} - \mathbf v_{22})^\top \end{pmatrix} \mathbf b = \mathbf 0
\quad\text{对每张图像}\quad\Longrightarrow\quad V\mathbf b = \mathbf 0 .
$$

$\mathbf b$ 同样是最小奇异值对应的右奇异向量。**计数：**$\mathbf b$ 有 6 个元素、相差一个尺度，即 5 个自由度（$K$ 的 5 个元素，含倾斜）。每张图像给出 2 个方程，所以**至少需要 3 张图像**；如果再加上倾斜为零的约束，2 张就够了。

### 3.3 由 $B$ 回到 $K$ 和位姿

$B = K^{-\top}K^{-1}$（相差一个尺度）是对称正定的，而 $K^{-1}$ 是上三角矩阵。因此对 $B$ 做 Cholesky 分解 $B = LL^\top$（$L$ 为下三角）就得到 $L^\top \propto K^{-1}$，即 $K \propto (L^\top)^{-1}$，再除以 $K_{33}$。（张正友的论文把同样的结果写成了显式公式。）$\mathbf b$ 的符号是任意的；必要时取反，使 $B$ 正定。

$K$ 已知后，每个位姿都可以从它的单应得到：$\lambda = 1/\lVert K^{-1}\mathbf h_1\rVert$，$\mathbf r_1 = \lambda K^{-1}\mathbf h_1$，$\mathbf r_2 = \lambda K^{-1}\mathbf h_2$，$\mathbf r_3 = \mathbf r_1\times\mathbf r_2$，$\mathbf t = \lambda K^{-1}\mathbf h_3$。$\lambda$ 的符号选为使标定板位于相机前方（$t_z > 0$）。有噪声时 $[\mathbf r_1\ \mathbf r_2\ \mathbf r_3]$ 并不严格是旋转矩阵，于是用最近的旋转矩阵代替它，即其 SVD $U\Sigma V^\top$ 中的 $UV^\top$。

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

闭式解与真值相差几个百分点：$f_x = 618.9$ 而不是 600（+3.2%），$f_y = 618.6$ 而不是 596（+3.8%），主点偏了几个像素。在忽略畸变的前提下，这差不多是最好的结果了。它不是最终答案，但它是非线性优化极好的**初值**，而这正是它的用途。$V$ 的最小奇异值（0.30）与次小值（2960）之间的巨大差距说明 $\mathbf b$ 被很好地确定了。

### 3.4 闭式解何时失败：位姿的多样性

第 3.1 节的约束只有在从**不同朝向**观察标定板时才携带信息。平移标定板，或者绕光轴旋转它，会改变 $\mathbf t$ 和平面内的旋转，但它新增的那对约束与之前（几乎）相同。张正友的论文证明了极端情况：平行平面的图像不提供独立的约束。Sturm 和 Maybank（1999）列举了所有这类奇异配置。

这背后有一个很好的物理解释。对于一块平行于像平面、深度为 $Z$ 的标定板，角点的像是 $u = f_x X/Z + c_x$：能看到的只有比值 $f_x/Z$。把 $f$ 加倍、同时把每块板沿光轴移到两倍远，得到的图像完全相同（有畸变时，$k_1$ 和 $k_2$ 会重新缩放来补偿；见练习 2）。倾斜标定板就打破了这种平衡，因为板的近端和远端深度不同，透视缩短（foreshortening）单独揭示了 $f$。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-views-and-tilt.svg" caption="闭式解的蒙特卡洛实验（无畸变相机，$\sigma = 0.3$ 像素，每个点 200 次试验，$f_x$ 相对误差的中位数）。左：随机倾斜 20-45° 的标定板；误差从 $N=3$ 个视图时的 0.69% 降到 $N=12$ 时的 0.24%。右：三块绕相隔 120° 的轴倾斜同一角度 $\theta$ 的标定板。几乎正对的板毫无用处：$\theta = 2°$ 时误差 29.7%（此时闭式解还在 2.5% 的试验中直接失败，灰色柱），5° 时 4.6%，10° 时 1.4%。在 30° 到 70° 之间误差平稳在约 0.3%。" %}

实用规则：让标定板朝几个**不同方向**倾斜 30-50°，不要把图像浪费在不同距离的正对视图上。在第 5 节的小工具中，你可以只选三个正对视图，亲眼看着方法失效。

## 4. 带畸变的非线性优化

### 4.1 最大似然就是重投影误差的最小二乘

设 $\mathbf x_{ij}$ 为图像 $i$ 中角点 $j$ 的检测位置，$\pi(\boldsymbol\theta, R_i, \mathbf t_i, \mathbf X_j)$ 为完整的相机模型（位姿、投影、畸变、$K$）。如果检测误差在每个坐标上都是独立、标准差为 $\sigma$ 的高斯噪声，所有检测结果的似然为

$$
p(\{\mathbf x_{ij}\} \mid \boldsymbol\theta, \{R_i, \mathbf t_i\}) \propto \prod_{i,j} \exp\!\Big(-\frac{\lVert \pi(\boldsymbol\theta, R_i, \mathbf t_i, \mathbf X_j) - \mathbf x_{ij}\rVert^2}{2\sigma^2}\Big),
$$

最大化它等价于最小化**重投影误差平方和**（sum of squared reprojection errors）

$$
E(\mathbf p) = \sum_{i=1}^N \sum_{j=1}^n \big\lVert \pi(\boldsymbol\theta, R_i, \mathbf t_i, \mathbf X_j) - \mathbf x_{ij} \big\rVert^2 = \lVert \mathbf r(\mathbf p)\rVert^2 ,
$$

其中 $\mathbf p$ 把所有未知数堆在一起，$\mathbf r(\mathbf p) \in \mathbb R^{2nN}$ 把所有残差堆在一起。这是"金标准"（gold standard）代价：与 DLT 的代数误差不同，它以像素为单位度量误差，而噪声正是在像素空间中产生的。

**旋转的参数化。**旋转矩阵有 9 个元素但只有 3 个自由度。我们把每个旋转存为**轴角向量**（axis-angle）$\boldsymbol\omega \in \mathbb R^3$（方向为旋转轴，长度为转角），用 Rodrigues 公式 $R = I + \sin\theta\,[\mathbf k]\_\times + (1-\cos\theta)[\mathbf k]\_\times^2$ 转换。OpenCV 也是这样做的（`rvec`）。因此 $\mathbf p$ 有 $9 + 6N$ 个元素。

### 4.2 Gauss-Newton 与 Levenberg-Marquardt

在当前估计附近把残差线性化：$\mathbf r(\mathbf p + \boldsymbol\delta) \approx \mathbf r + J\boldsymbol\delta$，其中雅可比矩阵 $J = \partial\mathbf r/\partial\mathbf p$。关于 $\boldsymbol\delta$ 最小化 $\lVert\mathbf r + J\boldsymbol\delta\rVert^2$ 是线性最小二乘问题；令梯度 $2J^\top(\mathbf r + J\boldsymbol\delta)$ 为零，得到 **Gauss-Newton** 步的**正规方程**（normal equations）：

$$
J^\top J\,\boldsymbol\delta = -J^\top \mathbf r .
$$

Gauss-Newton 在极小值附近收敛很快，但在远处线性化不准时可能走过头。**Levenberg-Marquardt**（LM）加入阻尼项

$$
\big(J^\top J + \lambda\,\mathrm{diag}(J^\top J)\big)\,\boldsymbol\delta = -J^\top \mathbf r ,
$$

并自适应地调整 $\lambda$：如果这一步降低了代价，就接受它并减小 $\lambda$（更信任二次模型，接近 Gauss-Newton）；否则拒绝并增大 $\lambda$（步子更短，更接近缩放后的梯度下降）。Marquardt 用 $\mathrm{diag}(J^\top J)$ 缩放，使阻尼与各参数的单位无关；当 $f_x \approx 600$ 和 $k_2 \approx 0.07$ 处在同一个向量里时，这一点很重要。

下面的代码是一个完整（虽然慢）的标定器：闭式初始化（畸变从零开始）、前向差分雅可比和 LM。实际的实现（OpenCV，或基于 Ceres 的标定器）使用解析导数或自动微分并利用稀疏性，但计算的是同一件事。

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

（选项 `fix_k3` 和掩码 `free` 可以把 $k_3$ 固定为 0，第 5.3 节会用到。）RMS 误差从初始的 4.06 像素出发，两次迭代降到 0.42 像素，11 次后收敛于 0.4036 像素。现在 $K$ 的估计与真值相差不超过约 3 像素（最差的是 $c_x$，偏 3.2 像素），$k_1 = -0.2806$ 与 $-0.28$ 相差不到 0.3%。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-lm.svg" caption="左：解处 $1296\times 81$ 雅可比矩阵的稀疏模式（黑 = 非零）。前 9 列（内参，红线左侧）涉及所有残差；$f_x$ 和 $c_x$ 只影响 $u$ 行，$f_y$、$c_y$ 只影响 $v$ 行，因此出现条纹。每个 6 列的位姿块只涉及本视图的 108 个残差：块对角的'箭头'结构。右：在我们的数据上运行 LM。RMS 重投影误差在两次迭代内从 4.06 像素（闭式解，无畸变）降到 0.42 像素，最终稳定在 0.4036 像素，略低于 $\sqrt 2\,\sigma = 0.42$（点线）；每一步都被接受，所以阻尼 $\lambda$（橙色，右轴）每次迭代都缩小 3 倍。" %}

雅可比矩阵的箭头结构值得记住。有成千上万张图像时，位姿块占主导，求解器先用 **Schur 补**（Schur complement）消去它们，只剩下共享参数的一个小方程组。这正是让光束法平差可行的技巧（[第 05 篇]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})）；标定*就是*一个三维结构已知的小型光束法平差。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-residuals.svg" caption="全部 648 个角点的重投影残差（箭头从检测到的角点指向模型预测）。(a) 闭式解之后、没有畸变模型时：一致的径向图案，RMS 4.06 像素，图像角落处最大 12.7 像素，放大 8 倍。(b) 加入畸变的 LM 之后：不再有任何结构，RMS 0.40 像素，放大 100 倍。看起来随机的残差是好模型的必要（而非充分）条件；任何残留的图案都说明模型缺了什么。" %}

### 4.3 与 OpenCV 交叉验证

`cv2.calibrateCamera` 实现的是同一个流程（张正友初始化，然后 LM）。给定相同的检测结果，它必须给出相同的答案：

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

打印出的每一位都相同。注意 OpenCV 返回的"RMS"的定义：*每个角点*（而不是每个坐标）的平方误差之和的平方根。最后一行的标准差是下一节的主题。

## 5. 标定结果有多好？

### 5.1 RMS 重投影误差能说明什么，不能说明什么

人人都报告 RMS 误差，人人都想把"0.40 像素"读成"精确到 0.4 像素"。它既不是参数的精度，也不是你之后计算任何东西的精度。它是拟合**之后**剩下的部分的大小，其期望值由噪声决定：

$$
\mathbb E\big[\text{RMS}^2\big] = \frac{2\sigma^2 (2M - P)}{2M}, \qquad M = nN \text{ 个角点},\ P = 9 + 6N \text{ 个参数}.
$$

（$2M$ 个坐标的方差都是 $\sigma^2$，拟合 $P$ 个参数吸收了其中 $P$ 个自由度。）对我们来说 $\sqrt{2\cdot 0.09\cdot 1215/1296} = 0.411$ 像素，实际得到 0.404。所以完美的标定其 RMS $\approx\sqrt 2\,\sigma$，*而不是*零；而糟糕的标定也可能有很低的 RMS：

- 图像太少时，多余的参数会拟合噪声（过拟合）：RMS 下降，精度也下降。
- RMS 只衡量有角点的地方的误差。如果所有标定板都在图像中央，那么图像角落完全是外推（第 5.3 节）。
- 错误的模型（例如畸变项太少）表现为 RMS 高于 $\sqrt 2\,\sigma$，*并且*残差中出现结构（上图 (a)）。

反过来，这个公式给出了噪声的估计 $\hat\sigma^2 = \lVert\mathbf r\rVert^2/(2M - P)$，下面就会用到。

### 5.2 参数不确定度：$\Sigma = \sigma^2 (J^\top J)^{-1}$

在解 $\hat{\mathbf p}$ 附近，残差对扰动是线性的：$\mathbf r(\hat{\mathbf p} + \boldsymbol\delta) \approx \hat{\mathbf r} + J\boldsymbol\delta$。现在问：如果检测位置移动了一个噪声向量 $\boldsymbol\varepsilon$，估计会怎样移动？残差改变 $-\boldsymbol\varepsilon$，线性化问题变为 $\min \lVert J\boldsymbol\delta - \boldsymbol\varepsilon\rVert^2$，其最小二乘解为 $\boldsymbol\delta = (J^\top J)^{-1}J^\top\boldsymbol\varepsilon$。由 $\mathrm{Cov}(\boldsymbol\varepsilon) = \sigma^2 I$，

$$
\Sigma_{\mathbf p} = \mathrm{Cov}(\boldsymbol\delta) = (J^\top J)^{-1}J^\top(\sigma^2 I)J(J^\top J)^{-1} = \sigma^2 (J^\top J)^{-1}.
$$

这是高斯噪声下估计的协方差（一阶近似）。它的对角线给出每个参数的标准差；非对角元说明哪些参数会相互抵消。最后一次 LM 迭代已经有了 $J$，所以这几乎不花任何代价。在 OpenCV 中它就是 `calibrateCameraExtended` 返回的 `stdDeviationsIntrinsics`。

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

如何解读：

- 每个估计都落在协方差所预言的范围内：误差为 0.1-1.3 个标准差，只有一个是 2.3 个（$p_1$）。九个参数中有一个超过 $2\sigma$ 的情况大约三次中出现一次（$1 - 0.954^9 \approx 0.35$）。
- $f_x$ 的精度为 $\pm 1.9$ 像素（0.3%），主点为 $\pm 2$ 像素。对一块小标定板拍十二张图像来说，这很典型。每张图更多角点、更多图像、更低噪声都会让这些数字大致按 $1/\sqrt{\text{数据量}}$ 缩小。
- $f_x$ 和 $f_y$ 的相关系数为 99%：它们的*比值*（像素纵横比）比单独的任何一个都确定得多。它们与标定板距离一起变化，这就是第 3.4 节的 $f/Z$ 不确定性。
- $k_2$ 与 $k_3$ 的相关系数为 $-98\%$：在我们观测到的半径范围内，$k_2 r^4$ 和 $k_3 r^6$ 看起来几乎一样。单个系数确定得很差（$k_3 = -0.05 \pm 0.09$），尽管它们描述的畸变*函数*在数据范围内被很好地确定了。

这个线性公式对吗？可以用蛮力检验：用新的噪声把整个标定重做 200 次，看结果的散布。

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

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-uncertainty.svg" caption="用新噪声做的 200 次完整标定（灰点）、真值（红色星）、我们的单次估计（橙色菱形），以及由这一次运行的 $\sigma^2(J^\top J)^{-1}$ 得到的 1$\sigma$ 和 2$\sigma$ 椭圆（以真值为中心）。左：$f_x$ 对 $f_y$，相关系数 0.99（蒙特卡洛 0.989）。右：$k_2$ 对 $k_3$，相关系数 $-0.98$（蒙特卡洛 $-0.978$）。单次标定给出的预测与蒙特卡洛散布对每个参数都吻合到约 10% 以内。" %}

预测的散布与模拟的散布吻合到约 10% 以内。所以只要模型正确、噪声大致是独立高斯的，一次标定就能告诉你它自己的不确定度。（如果检测器有系统误差，或者标定板不平，这个公式会过于乐观。）

### 5.3 从参数到像素：在图像的哪些区域可以相信模型？

十二个标准差很难解读，相关性还会让它们产生误导：如果 $k_2$ 能补偿，那么很大的 $\sigma_{k_3}$ 也无害。我们真正想知道的是：**取一个像素，用我的标定把它变成一条光线，再把光线投影回去，这个像素可能错多少？**这就是*投影不确定度*（projection uncertainty），也是 AprilCal（Richardson 等，2013）和 `mrcal` 工具包背后的思想。

对像素 $\mathbf u$，用估计的 $\hat{\boldsymbol\theta}$ 把它去畸变为归一化光线 $\mathbf q$。现在扰动内参：重投影的像素移动 $G\,\delta\boldsymbol\theta$，其中 $G = \partial\pi(\boldsymbol\theta, \mathbf q)/\partial\boldsymbol\theta$（$2\times 9$ 矩阵）。它的协方差是 $G\,\Sigma_{\boldsymbol\theta}\,G^\top$，$\Sigma_{\boldsymbol\theta}$ 是 $\Sigma_{\mathbf p}$ 中 $9\times 9$ 的内参块。

有一个微妙之处。$c_x$ 改变 1 像素会让*每个*像素都移动约 1 像素，看上去误差很大，但这几乎正是相机转动 $1/f$ 弧度的效果。相机的朝向本来就不由标定决定（它只相对于标定板定义），而你之后做的任何事（估计位姿、三角化）都会吸收这样的旋转。所以在度量之前，我们在整幅图像上去掉扰动中能被所有光线的一个小旋转解释的部分（一个最小二乘投影）。`mrcal` 对这种耦合的处理更细致；这个简化版本让代码保持简短。

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

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-projection-uncertainty.svg" caption="投影不确定度 $\sigma_{\mathrm{proj}}$（对数色标，等值线为 0.2 像素和 1 像素；点为所用角点）。(a) 全部十二个视图：中心 0.09 像素，图像大部分区域低于 1 像素，在没有任何标定板到达的极端角落 (4, 4) 为 3 像素。(b) 只用八个中央视图（1-7 和 12；角点距中心最远 208 像素）：$k_3 = -1.42 \pm 4.50$，在数据范围之外拟合出的多项式发生折返，所以在图像角落附近（斜线区）模型甚至无法求逆。(c) 同样的视图但把 $k_3$ 固定为 0：模型保持有效，但角落处有 13.5 像素的不确定度。(d) 三幅图沿从中心到角落的对角线的剖面。" width="92%" %}

这是本文最有用的一幅图。在角点覆盖的区域内，三个标定都很好；在区域之外，模型是在**外推**，不确定度随畸变多项式中 $r$ 的高次幂增长。两条教训：

- **让角点覆盖整幅图像，**尤其是畸变最大的四角和边缘。如果不这样做，RMS 误差不会提醒你：标定 (b) 的 RMS 为 0.414 像素，与 (a) 的 0.404 像素几乎相同。
- **不要估计数据无法支撑的参数。**只有中央视图时，放开 $k_3$ 会得到在图像内部就折返的多项式。把 $k_3$ 固定为 0（OpenCV：`cv2.CALIB_FIX_K3`）是普通镜头的常用补救办法；真正的解决办法是更好的覆盖。

### 5.4 动手试试：选择标定板位姿

下面的小工具在浏览器中对相同的相机、标定板和十二个位姿（只用两个径向系数 $k_1, k_2$）运行第 2-5 节的完整流程。点击 3D 视图或图像中的标定板来加入或去掉视图，观察估计值、标准差和投影不确定度图如何变化。可以试试：

- 从默认设置（视图 1 加上四个倾斜视图 4-7）开始，再加入角落视图 8-11：图像角落的不确定度和 $\sigma_{k_2}$ 急剧下降。
- 只选正对的视图 1-3：闭式解失败，$\sigma_{f_x}$ 暴涨到约一千像素。这就是 $f/Z$ 不确定性。
- 增大噪声：每个 $\sigma$ 都与噪声 $\sigma$ 成正比地增长，RMS 跟随 $\sqrt 2\,\sigma$。

{% include widget.liquid name="3d-vision-calibration" height="760" caption="标定实验室。标定板编号与正文的十二个位姿一致。表格给出真值、由 $\sigma^2(J^\top J)^{-1}$ 得到的估计值 $\pm 1\sigma$，以及按对数刻度表示 $\sigma$ 的条形（过大时为红色）。图像背后的色图是第 5.3 节的投影不确定度（对数刻度 0.05 到 10 像素；灰色表示拟合模型发生折返）。" %}

## 6. 标定板与角点检测

### 6.1 棋盘格角点与亚像素精化

棋盘格角点是一个 **X 型交点**（X-junction）：四个方格在此相交，灰度呈鞍形（绕该点依次为亮-暗-亮-暗）。`cv2.findChessboardCorners`（或更鲁棒的 `findChessboardCornersSB`）这类检测器找到标定板，并给出约一个像素精度的角点位置。让标定真正可用的精度来自**亚像素精化**（subpixel refinement）。

`cv2.cornerSubPix` 背后的思想是一个漂亮的几何事实。设 $\mathbf p$ 为真实角点，$\mathbf q$ 为它附近的任意像素。如果 $\mathbf q$ 位于均匀的方格内部，它的图像梯度 $\mathbf g_{\mathbf q}$ 为零；如果 $\mathbf q$ 位于两个方格之间的边缘上，梯度垂直于边缘，而边缘经过 $\mathbf p$，所以 $\mathbf q - \mathbf p$ *沿着*边缘。无论哪种情况都有

$$
\mathbf g_{\mathbf q}^\top(\mathbf q - \mathbf p) = 0 \quad \text{对角点附近的每个 } \mathbf q .
$$

在窗口 $W$ 上对这些式子的平方求和，再对 $\mathbf p$ 求导并令其为零，得到一个 $2\times 2$ 线性方程组

$$
\Big(\sum_{\mathbf q\in W} \mathbf g_{\mathbf q}\mathbf g_{\mathbf q}^\top\Big)\,\mathbf p = \sum_{\mathbf q\in W} \mathbf g_{\mathbf q}\mathbf g_{\mathbf q}^\top\,\mathbf q ,
$$

解出后把窗口重新以新的 $\mathbf p$ 为中心，重复迭代。左边的矩阵就是 Harris 检测器的结构张量（structure tensor），我们会在[第 03 篇]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})再见到它；在角点处，梯度指向两个方向，所以它是良态的。

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

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-subpixel.svg" caption="在渲染出的角点上做亚像素精化（边缘方向为 20° 和 115°，每像素 8×8 超采样，1 像素光学模糊，2% 噪声）。左：图像、窗口内的梯度（蓝色箭头，垂直于边缘）、真实角点 $\mathbf p^\ast=(15.37, 14.62)$、整数精度的鞍点检测 $\mathbf p_0$，以及到 $\mathbf p_{10}$ 的精化路径。右：误差在约四次迭代内从 0.53 像素降到 0.048 像素；OpenCV 的 `cornerSubPix` 在同一幅图像上达到 0.037 像素。" %}

### 6.2 选哪种标定板？

| 标定板 | 检测方式 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 棋盘格 | X 型交点角点，用梯度做亚像素精化 | 角点最精确；到处都支持 | 整块板必须可见（角点无法单独识别）；对称的板（$n_x$、$n_y$ 同为奇数或同为偶数）存在方向歧义 |
| 圆点阵列 | 斑点质心 | 对模糊鲁棒 | 投影后圆的质心*不是*圆心的投影（透视和畸变带来偏差；Heikkilä 和 Silvén 1997 对此做了校正） |
| ChArUco | 白格中嵌入 ArUco 标记的棋盘格 | 每个角点有 ID：部分可见和遮挡都没问题，所以可以覆盖图像角落 | 需要良好的打印质量；标记要足够大才能解码 |
| AprilGrid（Kalibr） | AprilTag 组成的网格；以标签角点为特征点 | ID 唯一、检测鲁棒，是 Kalibr 的默认标定板 | 角点是标签角点，比 X 型交点略不精确 |

由于只有可识别的角点才能在部分可见时使用，**ChArUco** 是单相机标定的一个好的默认选择：它让你能把标定板推进图像四角，而第 5.3 节表明这一点最重要。无论用哪种，都要把它印在坚硬、**平整**的基材上（玻璃、铝塑板），并用卡尺**实测**方格边长，而不要相信打印机：标定板 1% 的尺度误差不会改变 $K$（它被标定板距离吸收了），但你由标定计算出的每个度量量（双目基线、手眼平移）都会继承这个误差。

## 7. 双目标定与极线校正

### 7.1 同时标定两台相机

双目系统由两台相对位姿固定的相机组成：在相机 1 中坐标为 $\mathbf X_1$ 的点，在相机 2 中坐标为 $\mathbf X_2 = R\mathbf X_1 + \mathbf t$。如果两台相机都在图像 $i$ 中看到标定板，板的位姿分别为 $(R_{1i}, \mathbf t_{1i})$ 和 $(R_{2i}, \mathbf t_{2i})$，那么对板上每个点

$$
\mathbf X_2 = R_{2i}\mathbf X_b + \mathbf t_{2i} = R(R_{1i}\mathbf X_b + \mathbf t_{1i}) + \mathbf t
\;\Longrightarrow\;
R = R_{2i}R_{1i}^\top,\quad \mathbf t = \mathbf t_{2i} - R\,\mathbf t_{1i}.
$$

每张图像给出一个估计；把它们合并（对各视图取平均或中位数）作为初值，再对两台相机的内参、$(R, \mathbf t)$ 以及每张图像的一个标定板位姿做联合 LM（第二台相机的板位姿现在由此*推导*出来，这就把两台相机绑在了一起）。这就是 `cv2.stereoCalibrate`。我们的第二台相机位于右侧 12 cm 处，向内偏转 8°，内参和镜头略有不同。

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

看看旋转误差：如果分别标定每台相机的内参然后固定，误差为 0.76°；联合优化所有参数时为 0.07°。原因是第 5.3 节见过的一种耦合：主点的误差看起来像这台相机的一个小旋转。内参固定时，相对旋转必须吸收两台相机的主点误差；联合优化时，共享的观测把它们约束住了。数字也对得上：分别标定时，相机 1 的 $c_x$ 偏大 3.2 像素，相机 2 的偏小 5.4 像素，在 $f \approx 600$ 像素下 8.6 像素约等于 0.8° 的偏航；而 0.76° 的误差中确实有 0.75° 是绕 $y$ 轴的旋转。这对双目深度影响很大：相对偏航角 0.76° 的误差会让整幅图像的视差偏移约 $f\cdot 0.0133 \approx 8$ 像素。

### 7.2 极线校正

如果对应点位于**同一图像行**上，立体匹配（[第 04 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})）会简单得多。极线校正（rectification）通过*虚拟地*旋转两台相机（不拍新图像，只是重采样）来实现这一点：让它们朝同一方向看，像平面重合，$x$ 轴平行于基线。按照 Fusiello、Trucco 和 Verri（2000）的做法，在相机 1 的坐标系中：

$$
\mathbf e_1 = \frac{\mathbf C_2}{\lVert\mathbf C_2\rVert},\quad
\mathbf e_2 = \frac{\mathbf z\times\mathbf e_1}{\lVert\mathbf z\times\mathbf e_1\rVert},\quad
\mathbf e_3 = \mathbf e_1\times\mathbf e_2,\qquad
R_{\text{rect}} = \begin{pmatrix}\mathbf e_1^\top\\ \mathbf e_2^\top\\ \mathbf e_3^\top\end{pmatrix},
$$

其中 $\mathbf C_2 = -R^\top\mathbf t$ 是第二台相机的相机中心，$\mathbf z = (0,0,1)$ 是原来的光轴。相机 1 旋转 $R_{\text{rect}}$，相机 2 旋转 $R_{\text{rect}}R^\top$，两者使用同一个新的内参矩阵 $K_n$。一个像素的映射方式是：去畸变成光线，旋转光线，再用 $K_n$ 投影；对无畸变图像，这就是单应 $K_n R_{\text{rect},i} K_i^{-1}$。`cv2.stereoRectify` 返回这些旋转和新的投影矩阵；`cv2.initUndistortRectifyMap` 把它们变成供 `cv2.remap` 使用的查找表。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-rectification.svg" caption="视图 12 的极线校正，用我们的 NumPy 标定计算（双目位姿由各视图位姿平均得到：旋转误差 0.74°，基线 119.40 mm）。(a) 左、(b) 右原始图像；(b) 中的曲线是左图四个外角点的极线曲线（每个角点在左相机中的光线投影到右相机）。它们是倾斜的，并且被镜头畸变稍微弄弯了。(c)、(d) 校正后，每一对对应点都位于同一条水平线上：平均垂直偏差从 20.71 像素降到 0.40 像素，也就是检测噪声的大小。" %}

## 8. 手眼标定：$AX = XB$

机械臂上的相机只有在我们知道它相对于夹爪的位置时才有用：即固定的变换 $X = T_{gc}$（相机在夹爪坐标系中的位姿）。它无法用尺子量，只能标定。把机械臂移动到 $n$ 个工位；在每个工位，机器人报告夹爪在基座坐标系 $\lbrace b\rbrace$ 中的位姿 $T_{bg,i}$，相机观察一个固定的标定板并报告其位姿 $T_{ct,i}$（由标定板上的 PnP 得到，第 05 篇）。标定板不动，所以对任意两个工位 $i$ 和 $j$

$$
T_{bg,i}\,X\,T_{ct,i} = T_{bt} = T_{bg,j}\,X\,T_{ct,j}
\;\Longrightarrow\;
\underbrace{T_{bg,j}^{-1}T_{bg,i}}_{A}\;X = X\;\underbrace{T_{ct,j}\,T_{ct,i}^{-1}}_{B}.
$$

$A$ 是夹爪在两个工位间的运动，$B$ 是相机的运动，$X$ 把两者联系起来。拆成旋转和平移：

$$
R_A R_X = R_X R_B, \qquad (R_A - I)\,\mathbf t_X = R_X \mathbf t_B - \mathbf t_A .
$$

**旋转（Park 和 Martin 1994）。**$R_A = R_X R_B R_X^\top$ 说明 $R_A$ 和 $R_B$ 是在两个坐标系中看到的同一个旋转，所以它们的轴角向量满足 $\boldsymbol\alpha = R_X\boldsymbol\beta$（$\boldsymbol\alpha = \log R_A$，$\boldsymbol\beta = \log R_B$）。有多次运动时，$R_X$ 就是把各个 $\boldsymbol\beta$ 与 $\boldsymbol\alpha$ 对齐得最好的旋转，这是一个正交 Procrustes 问题，一次 SVD 就能解出。**平移。**$R_X$ 已知后，第二个方程对 $\mathbf t_X$ 是线性的：把所有运动的方程叠起来，用最小二乘求解。

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

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-hand-eye.svg" caption="左：实验设置，机器人基座 $\lbrace b\rbrace$、四个夹爪工位（粗坐标轴）、通过同一个 $X$ 装在每个工位上的相机（细坐标轴，橙色连线）、固定的标定板 $\lbrace t\rbrace$，以及每台相机到它的视线（灰色点线）。右：100 次试验中 $X$ 误差的中位数（相机到标定板的位姿每轴加 0.05° 和 0.5 mm 的噪声）随工位数 $n$ 的变化，使用所有工位对。实线：一般的旋转；旋转误差从 0.16°（$n=3$）降到 0.04°（$n=20$），平移误差从 1.8 mm 降到 0.5 mm。虚线：所有旋转都绕同一竖直轴；此时 $X$ 绕该轴的旋转不可观测，无论加多少工位，误差都停留在 90° 左右和 100 mm 以上。" %}

虚线展示的是经典的失败情形：运动必须包含绕**至少两个不平行轴**的旋转。只绕一个轴转动手腕的机器人（或在地面上行驶的移动机器人）无法用这种方法标定手眼变换。其他解法（Tsai 和 Lenz 1989、Daniilidis 的对偶四元数 1999，都可以在 `cv2.calibrateHandEye` 中使用）在运动的参数化方式上不同，也在于先后分别求解旋转和平移（Tsai-Lenz、Park-Martin）还是同时求解（Daniilidis），但都需要这种多样性。变体：如果相机固定在世界中、观察夹爪上的标定板（"眼在手外"，eye-to-hand），同样的方程成立，只是角色互换；同时估计标定板位姿则得到 $AX = YB$（`cv2.calibrateRobotWorldHandEye`）。

## 9. 相机-IMU 标定

视觉惯性里程计（[第 06 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})）以及每一台 AR/VR 头显都会把相机与 IMU（陀螺仪和加速度计）融合。除了相机内参，融合还需要三项标定结果：

- IMU 与相机之间的**外参**变换 $T_{CI}$；
- 两者时钟之间的**时间偏移** $t_d$：图像的相机时间戳通常并不是曝光的时刻；
- IMU 的噪声模型（陀螺仪和加速度计的噪声密度与零偏随机游走），通常事先由一段长时间静止的记录测得（Allan 方差）。

**时间偏移为什么重要，用数字说话。**以 $\omega = 2$ rad/s（约 115°/s，普通的转头速度）转动头部。$t_d = 5$ ms 的时钟偏移意味着 IMU 认为相机所看的方向与实际相差 $\omega t_d = 0.01$ rad。对我们的相机，在图像中心附近这相当于 $f\,\omega\,t_d = 600 \times 0.01 = 6$ 像素：是角点噪声 $\sigma = 0.3$ 像素的二十倍。对头显来说，这就是虚拟物体相对真实世界明显地"漂"。

**Kalibr 的做法**（Furgale、Rehder 和 Siegwart 2013）。你拿着传感器在 AprilGrid 前挥动一两分钟，激励所有的旋转轴和加速度轴。IMU 的轨迹被建模为**连续时间 B 样条**（continuous-time B-spline，对位置和旋转的一种参数化分别建模），因此可以在任意时刻求它的位姿、角速度和加速度。然后一个大的非线性最小二乘问题同时估计样条、$T_{CI}$、$t_d$、重力和 IMU 零偏。它的残差包括：在（平移后的）图像时刻的网格角点重投影误差，加上陀螺仪残差（测量值减去样条角速度）和加速度计残差（测量值减去样条加速度和重力），各自按噪声加权。正是连续时间表示让时间偏移变得可估计，因为平移 $t_d$ 只是改变了图像残差在样条上的求值位置。论文报告时间偏移可以估计到 IMU 采样周期的一小部分。实践中：先运行 `kalibr_calibrate_cameras`，再用写有噪声参数的 `imu.yaml` 运行 `kalibr_calibrate_imu_camera`。Rehder 等（2016）把工具箱扩展到多个 IMU 和 IMU 内参。卷帘快门相机（第 01 篇 3.5 节）还需要一个随图像行增长的时间偏移。

## 10. 实用清单

1. **先固定光学参数。**对焦、变焦和光圈都会改变内参。按使用时的状态设好，然后用胶带固定调节环。关闭自动对焦和数字防抖。
2. **使用好的标定板。**平整坚硬，方格尺寸实测，在工作距离上足够大、能占据图像的相当一部分。条件允许就用 ChArUco。
3. **采集多样的位姿。**15-40 张图像：绕不同轴倾斜 30-50°，把标定板推到画面的每个角落和每条边，在工作距离附近取一系列距离。避免运动模糊（保持静止，或用短曝光）。
4. **按镜头选模型。**普通镜头用 $(k_1, k_2, p_1, p_2)$，只有覆盖完整时才加 $k_3$，广角镜头用有理模型或鱼眼模型（第 01 篇）。要追求最高精度，还有带数千个参数的通用模型（Schöps 等 2020）。
5. **检查残差，而不只是 RMS。**RMS 接近检测器的 $\sqrt 2\,\sigma$（典型值 0.1-0.5 像素）；残差图中没有空间图案；没有哪一张图像误差特别大（如果有，剔除后重新标定）。
6. **看不确定度。**由 $\sigma^2(J^\top J)^{-1}$ 得到标准差，条件允许再画投影不确定度图。在图上不好的区域补拍图像。
7. **在留出数据上验证。**用部分图像标定，在其余图像上计算重投影误差（位姿用 PnP 重新估计）。过拟合的模型其留出误差会大得多。
8. **情况变化时重新标定。**温度、冲击和换镜头会改变内参；多相机系统的外参会漂移。许多产品在 SLAM 内部在线重新标定。

## 动手试试

第 5.4 节的小工具是本文的动手部分。主页上的[交互实验室]({{ '/' | relative_url }}#lab)展示的是同一模型的正向过程：每个演示都用针孔相机投影三维内容，而注视点渲染演示提醒我们，显示系统同样需要标定。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| An Algorithm for Least-Squares Estimation of Nonlinear Parameters (Marquardt) | J. SIAM | 1963 | [DOI](https://doi.org/10.1137/0111030) | 所有标定求解器背后的阻尼方案 |
| A versatile camera calibration technique for high-accuracy 3D machine vision metrology using off-the-shelf TV cameras and lenses (Tsai) | IEEE J. Robotics and Automation | 1987 | [DOI](https://doi.org/10.1109/JRA.1987.1087109) | 带径向畸变的经典两步标定 |
| A new technique for fully autonomous and efficient 3D robotics hand/eye calibration (Tsai & Lenz) | IEEE Trans. Robotics and Automation | 1989 | [DOI](https://doi.org/10.1109/70.34770) | 快速的闭式 $AX = XB$ 求解器，与 Shiu 和 Ahmad 的论文同年发表；至今仍是 OpenCV 的默认方法 |
| Robot sensor calibration: solving AX = XB on the Euclidean group (Park & Martin) | IEEE Trans. Robotics and Automation | 1994 | [DOI](https://doi.org/10.1109/70.326576) | 李群视角；旋转的闭式最小二乘解 |
| In Defense of the Eight-Point Algorithm (Hartley) | TPAMI | 1997 | [DOI](https://doi.org/10.1109/34.601246) | 线性估计器的坐标归一化 |
| A four-step camera calibration procedure with implicit image correction (Heikkilä & Silvén) | CVPR | 1997 | [DOI](https://doi.org/10.1109/CVPR.1997.609468) | 径向与切向畸变、去畸变的逆模型、圆心偏差的校正 |
| On plane-based camera calibration: a general algorithm, singularities, applications (Sturm & Maybank) | CVPR | 1999 | [HAL](https://hal.archives-ouvertes.fr/inria-00525681) | 基于平面的标定及其退化配置 |
| Hand-eye calibration using dual quaternions (Daniilidis) | IJRR | 1999 | [DOI](https://doi.org/10.1177/02783649922066213) | 同时求解旋转与平移 |
| A Flexible New Technique for Camera Calibration (Zhang) | TPAMI | 2000 | [DOI](https://doi.org/10.1109/34.888718) | 本文的棋盘格标定法 |
| A compact algorithm for rectification of stereo pairs (Fusiello, Trucco & Verri) | Machine Vision and Applications | 2000 | [DOI](https://doi.org/10.1007/s001380050120) | 第 7.2 节的极线校正 |
| AprilTag: A robust and flexible visual fiducial system (Olson) | ICRA | 2011 | [DOI](https://doi.org/10.1109/ICRA.2011.5979561) | AprilGrid 标定板所用的标记 |
| Unified temporal and spatial calibration for multi-sensor systems (Furgale, Rehder & Siegwart) | IROS | 2013 | [DOI](https://doi.org/10.1109/IROS.2013.6696514) | Kalibr：带时间偏移的连续时间相机-IMU 标定 |
| AprilCal: Assisted and repeatable camera calibration (Richardson, Strom & Olson) | IROS | 2013 | [DOI](https://doi.org/10.1109/IROS.2013.6696595) | 根据投影不确定度建议下一个标定板位姿 |
| Automatic generation and detection of highly reliable fiducial markers under occlusion (Garrido-Jurado et al.) | Pattern Recognition | 2014 | [DOI](https://doi.org/10.1016/j.patcog.2014.01.005) | ArUco 标记，ChArUco 标定板的基础 |
| Extending Kalibr: Calibrating the extrinsics of multiple IMUs and of individual axes (Rehder et al.) | ICRA | 2016 | [DOI](https://doi.org/10.1109/ICRA.2016.7487628) | 多 IMU 与 IMU 内参标定 |
| Why Having 10,000 Parameters in Your Camera Model Is Better Than Twelve (Schöps et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1912.02908) | 通用相机模型以及参数化模型的偏差 |
| GeoCalib: Learning Single-image Calibration with Geometric Optimization (Veicht et al.) | ECCV（已发表；截至 2026 年 11 月） | 2024 | [arXiv](https://arxiv.org/abs/2409.06704) | 不用标定板，从单张图像估计内参和重力方向 |

## 学习资源

- R. Hartley 和 A. Zisserman，*Multiple View Geometry in Computer Vision*，第 2 版，Cambridge University Press，2004：第 4 章（DLT、归一化、金标准代价）和第 7-8 章（相机矩阵估计、绝对二次曲线的像）。
- R. Szeliski，*Computer Vision: Algorithms and Applications*，第 2 版，可在 [szeliski.org/Book](https://szeliski.org/Book/) 免费阅读：标定和非线性最小二乘的相关章节。
- OpenCV 教程：[相机标定](https://docs.opencv.org/4.8.0/d4/d94/tutorial_camera_calibration.html)、[ChArUco 检测](https://docs.opencv.org/4.x/df/d4a/tutorial_charuco_detection.html)和[用 ArUco 与 ChArUco 标定](https://docs.opencv.org/4.x/da/d13/tutorial_aruco_calibration.html)。
- [mrcal](https://mrcal.secretsauce.net/uncertainty.html)：一个标定工具包，关于投影不确定度和模型差分的文档非常出色。
- [Kalibr](https://github.com/ethz-asl/kalibr) 及其[相机-IMU 标定 wiki](https://github.com/ethz-asl/kalibr/wiki/camera-imu-calibration)。
- [puzzlepaint/camera_calibration](https://github.com/puzzlepaint/camera_calibration)：Schöps 等人的通用模型标定器；[cvg/GeoCalib](https://github.com/cvg/GeoCalib)：无标定板的单图标定。
- Bouguet 的 Camera Calibration Toolbox for Matlab，OpenCV 标定代码的前身；它的文档至今仍是清晰的分步教程。

## 练习

1. **倾斜为零时两张图像就够了。**把约束 $B_{12} = 0$（零倾斜意味着 $K^{-\top}K^{-1}$ 的 $B_{12} = 0$）作为 $V$ 的额外一行，只用视图 4 和 6 标定。与三视图的闭式解比较。

   <details markdown="1"><summary>提示</summary>

   向 $V$ 追加一行 $(0, 1, 0, 0, 0, 0)$（加权使其尺度与其他行相当）。两个视图就有 $2\cdot 2 + 1 = 5$ 个方程，对应 $\mathbf b$ 的 5 个自由度。预期误差会明显大于三视图；如果两个视图绕同一轴倾斜，则会完全失败。
   </details>

2. **正对的视图为什么失败。**证明对于平行于像平面的标定板，变换 $(f_x, f_y) \to \alpha (f_x, f_y)$、对每个视图 $t_{z,i} \to \alpha t_{z,i}$、$k_1 \to \alpha^2 k_1$、$k_2 \to \alpha^4 k_2$ 不改变任何图像。这对 $J^\top J$ 意味着什么？

   <details markdown="1"><summary>提示</summary>

   对正对的标定板（只绕光轴旋转），每个角点的深度都是 $t_z$，所以 $x = (\text{与 } t_z \text{ 无关的量})/t_z$；把 $t_z$ 乘以 $\alpha$ 会让 $x$、$y$ 和 $r$ 都除以 $\alpha$。于是在上述缩放下 $f x(1 + k_1 r^2 + k_2 r^4)$ 不变。存在一族单参数的精确解，意味着 $J$ 有零向量，所以 $J^\top J$ 奇异，预测的 $\sigma_{f_x}$ 为无穷大。小工具显示的是一个巨大的（由于舍入误差而有限的）值。
   </details>

3. **留出验证。**用视图 1-7 和 12 标定，然后固定内参，用 PnP（`cv2.solvePnP`）估计视图 8-11 的位姿，并计算它们的重投影误差。再在 $k_3$ 固定的情况下重复。哪个标定泛化得更好？留出误差与投影不确定度图一致吗？

   <details markdown="1"><summary>提示</summary>

   两种标定在留出视图上都约为 1 像素（放开 $k_3$：每个视图 1.00-1.23 像素；$k_3 = 0$：0.93-1.15 像素），而训练视图上为 0.41 像素，所以 $k_3 = 0$ 的模型泛化得稍好。留出误差比图 (b) 在角落处的数值小得多，原因有二：PnP 会为每个留出视图重新拟合位姿，吸收一部分模型误差；留出的角点离中心最远约 331 像素，到不了图 (b) 最差的图像四角。尽管如此，留出误差是训练 RMS 的 2.5 倍，这清楚地提示模型在外推。
   </details>

4. **解析雅可比。**把前向差分的 `jacobian` 换成 `project` 对 $f_x, f_y, c_x, c_y$（简单）以及 $k_1, k_2$（经由 $r^2$ 的链式法则）的解析导数。与数值雅可比对照，并比较两者的耗时。

   <details markdown="1"><summary>提示</summary>

   $\partial u/\partial f_x = x_d$，$\partial u/\partial c_x = 1$，$\partial u/\partial k_1 = f_x\, x\, r^2$，$\partial u/\partial k_2 = f_x\, x\, r^4$；$v$ 类似。两个雅可比的相对差小于 $10^{-9}$：$u$ 对其中每个参数单独来看都是线性的，所以前向差分没有截断误差，只有舍入误差。
   </details>

5. **时间偏移。**一台头显的相机为 30 Hz，IMU 为 1000 Hz。标定时你以最高 3 rad/s 的速度转动它。如果要求时间偏移的误差在图像中心（$f = 450$ 像素）造成的误差小于 0.5 像素，$t_d$ 需要知道得多精确？

   <details markdown="1"><summary>提示</summary>

   图像偏移约为 $f\,\omega\,\delta t_d$，所以 $\delta t_d < 0.5/(450\cdot 3) \approx 0.37$ ms，约为 IMU 采样周期的三分之一。这就是为什么时间偏移要作为标定的一部分来估计，而不是直接从时间戳读出。
   </details>

**下一篇：**[特征与匹配]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})：在没有棋盘格帮忙时，如何在任意图像之间寻找并匹配点。
