---
layout: post
title: "两视图几何：对极约束、相对位姿、三角化与立体视觉"
date: 2026-10-27 11:04:00+0900
description: "三维视觉基础第 4 篇：对极约束，本质矩阵与基础矩阵，归一化八点、七点与五点算法，E 的分解与正深度（cheirality）检验，中点法、线性与最优三角化，纯旋转与平面退化，以及立体视觉：校正、视差与深度、块匹配与半全局匹配。"
categories: 3d-vision
tags: [epipolar-geometry, essential-matrix, fundamental-matrix, eight-point-algorithm, relative-pose, triangulation, stereo-matching, sgm]
series: 3d-vision
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第 03 篇]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})的结尾是一组对应点：一幅图像中的像素 $\mathbf x\_1$ 与另一幅图像中的像素 $\mathbf x\_2$ 是同一个场景点。本篇把这样的点对变成几何。静态场景的两幅图像由一个 $3\times 3$ 矩阵联系在一起；从这个矩阵可以恢复相机怎样运动，进而恢复每个匹配点在三维中的位置。这是"从图像回到几何"的最小完整实例，所有更大的系统都建立在它之上：运动恢复结构（SfM）从一对好的图像开始初始化，视觉 SLAM 用两帧建立初始地图，双目相机则用同一时刻拍下的两幅图像计算深度图。

我们走完整条链路。先是几何：为什么一幅图像中的一个点把它在另一幅图像中的匹配限制在一条**直线**上（**对极约束**，epipolar constraint），以及编码它的两个矩阵：标定相机的**本质矩阵**（essential matrix）$E$ 与像素坐标下的**基础矩阵**（fundamental matrix）$F$。然后是估计：归一化八点算法、七点与五点最小解，以及用 RANSAC 做鲁棒拟合。接着是收获：从 $E$ 恢复相对位姿及其四重歧义，以及**三角化**（triangulation）一个点的三种方法。我们会看到这一切失效的配置（纯旋转、平面场景）。最后专门讨论**校正后的双目立体**（rectified stereo）：匹配变成沿图像行的一维搜索；我们在一个已知真值的合成立体对上从零实现块匹配和半全局匹配。

[神经渲染第 1 篇]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})简要介绍过对极几何、八点算法和三角化。本篇放慢每一步，推导那篇只给出结论的内容，并补上它没有涉及的部分：最小解、误差度量、最优三角化、退化情形和稠密立体匹配。

## 预备知识

- [第 01 篇]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})的针孔相机 $P = K[R \mid \mathbf t]$、齐次坐标以及 $\mathbb P^2$ 中的点和直线。全文沿用它的约定：OpenCV 相机坐标系（$x$ 向右，$y$ 向下，$z$ 向前），像素写作 $\tilde{\mathbf x} = (u, v, 1)^\top$，过两点的直线 $\mathbf l = \tilde{\mathbf a}\times\tilde{\mathbf b}$，点在线上的判据 $\mathbf l^\top\tilde{\mathbf x} = 0$。
- [第 02 篇]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})第 2 节的单应与归一化 DLT，以及第 7 节的双目校正。
- [第 03 篇]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})第 6 节的 RANSAC 及其迭代次数。
- 线性代数：SVD、零空间、秩、叉积、旋转矩阵。
- Python、NumPy 与 SciPy。本文所有代码片段按顺序构成一个脚本；正文中的每个数字都由它们打印出来。

## 1. 两个相机，一个点

### 1.1 记号与贯穿全文的例子

把世界坐标系放在相机 1 上。一个三维点在相机 1 中的坐标为 $\mathbf X\_1$，在相机 2 中为

$$
\mathbf X_2 = R\,\mathbf X_1 + \mathbf t ,
$$

这正是第 02 篇双目标定的约定。于是两个相机为

$$
P_1 = K_1\,[I \mid \mathbf 0], \qquad P_2 = K_2\,[R \mid \mathbf t],
$$

相机 2 的相机中心在相机 1 坐标系中为 $\mathbf C\_2 = -R^\top\mathbf t$（第 01 篇 2.3 节：$\mathbf t$ 不是相机 2 的位置）。相机 $i$ 的像素 $\tilde{\mathbf x}\_i = (u\_i, v\_i, 1)^\top$ 的**归一化坐标**为

$$
\hat{\mathbf x}_i = K_i^{-1}\tilde{\mathbf x}_i = (x_i,\ y_i,\ 1)^\top ,
$$

即该像素的射线与该相机平面 $z = 1$ 的交点。$\hat{\mathbf x}\_i$ 同时也是一个方向：在相机 $i$ 的坐标系中，该像素的射线是 $\lbrace \lambda\,\hat{\mathbf x}\_i : \lambda > 0\rbrace$，$\lambda$ 就是深度。

贯穿全文的例子是一台 $640\times 480$、$f = 500$ px（水平视场 65°）的相机，拍了两次。相机 2 位于右方 80 cm、下方 10 cm、前方 30 cm，并向左转 10°、向上抬 3°。我们在图像 1 的随机像素上、以 2 到 8 m 之间的随机深度撒下 240 个点，保留其中前 200 个相机 2 也能看到的点。

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

基线长度为 $\lVert\mathbf t\rVert = \lVert\mathbf C\_2\rVert = 0.86$ m。注意 $\mathbf t = (-0.839, -0.116, -0.151)$ 是 $-R\,\mathbf C\_2$：从第二个相机看到的第一个相机中心。

### 1.2 极平面、极点与极线

取一个场景点 $\mathbf X$。两个相机中心 $\mathbf C\_1$、$\mathbf C\_2$ 与 $\mathbf X$ 是三个点，因此张成一个平面，即 $\mathbf X$ 的**极平面**（epipolar plane）。所有有意思的东西都在这个平面上：

- 从 $\mathbf C\_1$ 经过 $\mathbf X$ 的射线，因而也包括像点 $\mathbf x\_1$；
- 从 $\mathbf C\_2$ 经过 $\mathbf X$ 的射线，因而也包括 $\mathbf x\_2$；
- **基线**（baseline），即直线 $\mathbf C\_1\mathbf C\_2$。

极平面与每个像平面相交成一条直线，即**极线**（epipolar line）$\mathbf l\_1$ 和 $\mathbf l\_2$。现在把推理反过来。假设我们只知道 $\mathbf x\_1$。我们不知道 $\mathbf X$ 的深度，所以 $\mathbf X$ 可以在 $\mathbf x\_1$ 射线上的任何位置。但整条射线都在极平面内（极平面由这条射线与基线张成），所以无论 $\mathbf X$ 在哪里，它在相机 2 中的像都落在 $\mathbf l\_2$ 上。**一幅图像中的一个点把它在另一幅图像中的匹配限制在一条直线上。** 这就是对极约束，它把对应点搜索从二维降为一维。

当 $\mathbf X$ 变化时，它的极平面绕基线转动，就像书页绕书脊翻动。每个极平面都包含基线，所以图像 2 中的每条极线都经过基线穿过像平面 2 的那个点：**极点**（epipole）$\mathbf e\_2$。它是 $\mathbf C\_1$ 在相机 2 中的像。同样，$\mathbf C\_2$ 在相机 1 中的像 $\mathbf e\_1$ 位于图像 1 的每条极线上。一幅图像的所有极线构成过其极点的**线束**（pencil）。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-epipolar-geometry.svg" caption="上：三维中的例子（相机 1 紫色，相机 2 蓝色，图像矩形画在 0.9 m 深度处，黑色线段是基线）。三个场景点（橙、红、青）各自与两个相机中心张成一个极三角形；每个三角形沿该点的极线（粗线段）切过两个图像矩形，点的投影就落在这些线上。下：同样的直线在像素坐标中，延伸到 640×480 画面之外。在图像 1 中它们都交于极点 $\mathbf e\_1=(1653, 407)$，即 $\mathbf C\_2$ 的像；在图像 2 中交于更靠右的 $\mathbf e\_2=(3099, 623)$。两个极点都远在画面之外，因为相机 2 主要是横向移动。" %}

在图中，两个极点都在图像右侧很远的地方。这很典型：对于以横向为主的运动，基线几乎平行于像平面，在很远处才穿过它们。3.3 节展示其他情形。

## 2. 本质矩阵

### 2.1 共面性给出 $E$

现在把图转化为方程。在相机 2 的坐标系中工作。有三个向量位于极平面内，都从 $\mathbf C\_2$（该坐标系的原点）出发：

1. $\mathbf x\_2$ 的射线，方向为 $\hat{\mathbf x}\_2$；
2. 基线，从 $\mathbf C\_2$ 指向 $\mathbf C\_1$：相机 1 的相机中心在相机 2 中的坐标为 $R\,\mathbf 0 + \mathbf t = \mathbf t$；
3. 经过 $\mathbf C\_1$ 的 $\mathbf x\_1$ 射线，其方向 $\hat{\mathbf x}\_1$ 在相机 1 坐标中给出，在相机 2 中变为 $R\,\hat{\mathbf x}\_1$。

三个向量共面当且仅当它们的混合积为零：

$$
\hat{\mathbf x}_2 \cdot \big(\mathbf t \times R\,\hat{\mathbf x}_1\big) = 0 .
$$

把与 $\mathbf t$ 的叉积写成矩阵乘法，$\mathbf t\times\mathbf a = [\mathbf t]\_\times\mathbf a$，其中

$$
[\mathbf t]_\times = \begin{pmatrix} 0 & -t_3 & t_2 \\ t_3 & 0 & -t_1 \\ -t_2 & t_1 & 0 \end{pmatrix},
$$

条件就变成一个双线性形式：

$$
\boxed{\;\hat{\mathbf x}_2^\top E\, \hat{\mathbf x}_1 = 0, \qquad E = [\mathbf t]_\times R .\;}
$$

$E$ 就是**本质矩阵**，由 Longuet-Higgins 于 1981 年提出。它只依赖相对位姿，与场景和内参都无关。

还有第二条更代数的推导路线，值得看一次，因为它说明了深度去了哪里。把 $\mathbf X\_1 = \lambda\_1\hat{\mathbf x}\_1$ 投影到相机 2 得到 $\lambda\_2\hat{\mathbf x}\_2 = \lambda\_1 R\,\hat{\mathbf x}\_1 + \mathbf t$。两边与 $\mathbf t$ 作叉积（消去最后一项），再与 $\hat{\mathbf x}\_2$ 作点积（消去左边，因为 $\hat{\mathbf x}\_2\cdot(\mathbf t\times\hat{\mathbf x}\_2) = 0$）：

$$
0 = \lambda_1\,\hat{\mathbf x}_2^\top [\mathbf t]_\times R\,\hat{\mathbf x}_1 .
$$

未知的深度 $\lambda\_1, \lambda\_2$ 消失了；剩下的只是两个像点之间的约束。这就是为什么可以在知道任何三维结构*之前*估计两视图几何。

### 2.2 $E$ 的性质

**五个自由度。** $E$ 有 9 个元素，但它由一个旋转（3 个参数）和一个平移（3 个参数）构成，而方程 $\hat{\mathbf x}\_2^\top E\hat{\mathbf x}\_1 = 0$ 是齐次的：缩放 $E$（因而缩放 $\mathbf t$）不改变任何东西。所以 $E$ 有 $3 + 3 - 1 = 5$ 个自由度，并且**基线的长度无法从两幅图像中恢复**。一个两倍大的场景、从相距两倍远的两台相机看去，产生完全相同的图像。5.4 节会回到这一点。

**奇异值为 $(\sigma, \sigma, 0)$。** $E^\top E = R^\top [\mathbf t]\_\times^\top [\mathbf t]\_\times R$。对任意向量 $\mathbf a$，$[\mathbf t]\_\times^\top [\mathbf t]\_\times\mathbf a = -\mathbf t\times(\mathbf t\times\mathbf a) = \lVert\mathbf t\rVert^2\mathbf a - (\mathbf t^\top\mathbf a)\,\mathbf t$，所以 $[\mathbf t]\_\times^\top[\mathbf t]\_\times = \lVert\mathbf t\rVert^2 I - \mathbf t\mathbf t^\top$，其特征值为 $\lVert\mathbf t\rVert^2$、$\lVert\mathbf t\rVert^2$（垂直于 $\mathbf t$ 的方向）和 $0$（沿 $\mathbf t$）。用旋转 $R$ 做相似变换不改变特征值。因此 $E$ 的奇异值为 $(\lVert\mathbf t\rVert, \lVert\mathbf t\rVert, 0)$：**$E$ 的秩为 2，且两个非零奇异值相等。** 反过来，每个奇异值为 $(\sigma, \sigma, 0)$ 的 $3\times 3$ 矩阵都可以分解为 $[\mathbf t]\_\times R$（5.1 节构造这两个因子）。

**一个三次约束。** 奇异值条件可以不借助 SVD，写成关于 $E$ 元素的多项式方程：

$$
\det E = 0, \qquad 2\,EE^\top E - \operatorname{tr}(EE^\top)\,E = 0 .
$$

验证第二式：写 $E = U\operatorname{diag}(\sigma\_1, \sigma\_2, \sigma\_3)V^\top$，则 $EE^\top E = U\operatorname{diag}(\sigma\_i^3)V^\top$，$\operatorname{tr}(EE^\top) = \sum\_j\sigma\_j^2$，所以这个矩阵方程等价于对每个 $i$ 有 $\sigma\_i\,(2\sigma\_i^2 - \sum\_j\sigma\_j^2) = 0$。代入 $(\sigma, \sigma, 0)$：$\sigma(2\sigma^2 - 2\sigma^2) = 0$ 以及 $0 = 0$。4.4 节的五点算法求解的正是这九个三次方程。

下面的代码在例子上验证这三个结论。

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

每个对应点都以机器精度满足约束，奇异值为 $(0.8602, 0.8602, 0)$，其中 $0.8602 = \lVert\mathbf t\rVert$，三次约束成立。

## 3. 基础矩阵

### 3.1 从 $E$ 到 $F$

匹配给出的是像素，而不是归一化坐标。把 $\hat{\mathbf x}\_i = K\_i^{-1}\tilde{\mathbf x}\_i$ 代入本质约束得到

$$
\tilde{\mathbf x}_2^\top F\,\tilde{\mathbf x}_1 = 0, \qquad F = K_2^{-\top} E\,K_1^{-1} = K_2^{-\top}[\mathbf t]_\times R\,K_1^{-1} .
$$

$F$ 就是**基础矩阵**。它以像素为单位编码同样的对极几何，并且可以在不知道 $K\_1$、$K\_2$ 的情况下从像素对应点估计出来。已知内参时，用 $E = K\_2^\top F K\_1$ 回到本质矩阵。

$F$ 还有第二种形式，直接说明了几何意义。写出沿 $\tilde{\mathbf x}\_1$ 射线、深度为 $\lambda\_1$ 的点的像：

$$
\lambda_2\tilde{\mathbf x}_2 = K_2(\lambda_1 R K_1^{-1}\tilde{\mathbf x}_1 + \mathbf t) = \lambda_1\,H_\infty\tilde{\mathbf x}_1 + \mathbf e_2,
\qquad H_\infty = K_2 R K_1^{-1},\quad \mathbf e_2 = K_2\mathbf t .
$$

当 $\lambda\_1$ 从 0 变到 $\infty$ 时，像从 $\mathbf e\_2$（深度 0：相机 1 的中心的像）移动到 $H\_\infty\tilde{\mathbf x}\_1$（深度无穷大：这条射线的消失点，见第 01 篇 1.6 节）。极线就是经过这两点的直线 $\mathbf l\_2 = \mathbf e\_2\times H\_\infty\tilde{\mathbf x}\_1$，所以

$$
F = [\mathbf e_2]_\times H_\infty = [K_2\mathbf t]_\times K_2 R K_1^{-1} ,
$$

它与第一种表达式只差一个比例因子（由恒等式 $[K\mathbf a]\_\times K = \det(K)\,K^{-\top}[\mathbf a]\_\times$）。这个形式将解释第 7 节的退化情形；下面的极线小部件画的正是这条从极点到消失点的线段，中间标有深度刻度。

**自由度。** $F$ 有 9 个元素，减去 1 个尺度，再减去约束 $\det F = 0$（它的秩仍为 2，因为 $[\mathbf e\_2]\_\times$ 的秩为 2）：**7 个自由度**。比 $E$ 多出的两个参数是不知道内参的代价；$F$ 不再需要两个相等的奇异值。

### 3.2 像素坐标中的极线与极点

从约束中可以直接读出：

- $\mathbf l\_2 = F\tilde{\mathbf x}\_1$ 是 $\tilde{\mathbf x}\_1$ 在图像 2 中的极线：$\tilde{\mathbf x}\_2^\top\mathbf l\_2 = 0$ 正是第 01 篇的点在线上判据。
- $\mathbf l\_1 = F^\top\tilde{\mathbf x}\_2$ 是 $\tilde{\mathbf x}\_2$ 在图像 1 中的极线。
- $\mathbf e\_1$ 位于每条 $\mathbf l\_1$ 上：对所有 $\tilde{\mathbf x}\_2$ 有 $\mathbf e\_1^\top F^\top\tilde{\mathbf x}\_2 = 0$，所以 $F\mathbf e\_1 = \mathbf 0$。极点是 $F$ 的**右零向量**；同样 $F^\top\mathbf e\_2 = \mathbf 0$，是左零向量。
- 像素 $(u, v)$ 到直线 $(a, b, c)$ 的距离为 $\lvert au + bv + c\rvert / \sqrt{a^2 + b^2}$。

**算例。** 点 $\mathbf X = (0.5, -0.4, 5.0)$ m 投影为 $\mathbf x\_1 = (370, 200)$ 与 $\mathbf x\_2 = (375.76, 213.05)$。它在图像 2 中的极线（缩放使 $a^2 + b^2 = 1$）为 $-0.1488\,u + 0.9889\,v - 154.77 = 0$。验证：$-0.1488\cdot 375.76 + 0.9889\cdot 213.05 - 154.77 = -55.91 + 210.68 - 154.77 = 0.00$。

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

$F$ 的零向量与另一个相机中心的投影一致，两个极点都在极线上，$F$ 的秩为 2。它的奇异值 $(1, 0.0014, 0)$ 很不均衡，这与 $E$ 不同：像素单位混合了量级为 1 和 500 的尺度。

### 3.3 运动对线束的影响

极线的排布告诉你相机是怎样运动的。

- **横向平移**（$R = I$，$\mathbf t$ 垂直于光轴，这里沿 $x$）：基线平行于两个像平面，所以极点在无穷远处，$\mathbf e = (1, 0, 0)^\top$，极线互相平行且水平。这就是校正后双目的几何，见第 8 节。
- **向前平移**（$R = I$，$\mathbf t$ 沿 $z$）：基线就是光轴，极点就是主点，所有极线都经过它。相机前进时，点沿径向离开它：极点是**扩张焦点**（focus of expansion），也就是你前进所朝向的点。
- **一般的纯平移**（$R = I$，$K\_1 = K\_2$）：$F$ 与 $[\mathbf e]\_\times$ 成比例，是反对称矩阵，并且 $\mathbf x\_1$、$\mathbf x\_2$ 与极点共线：每个点沿着自己的极线滑动。（练习 1。）
- **含旋转时**，$\mathbf x\_2$ 仍在它的极线上，但不再位于过 $\mathbf x\_1$ 与极点的直线上，因为旋转还通过 $H\_\infty$ 移动了它。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-motions.svg" caption="图像 2 中的极线 $F\tilde{\mathbf x}\_1$：14 个深度在 3–7 m 的点，相机 2 的三种运动；紫色实心点：$\mathbf x\_2$；橙色空心点加箭头：该点在图像 1 中的位置。左：横向平移 $\mathbf C\_2=(0.5,0,0)$ m；极点是无穷远点 $(1,0,0)^\top$，极线水平，每个点沿自己的极线滑动。中：向前平移 $\mathbf C\_2=(0,0,0.9)$ m；所有极线经过极点 $\mathbf e\_2=(320,240)$，即扩张焦点，点沿径向远离它。右：贯穿全文的例子（平移加旋转）；极线汇聚到远在右方的 $\mathbf e\_2=(3099,623)$。" %}

### 3.4 动手试试：极线小部件

下面的小部件就是贯穿全文的例子，带有两个实时视图和一个俯视图。在视图 1 中拖动橙色点：在视图 2 中，匹配点只可能在橙色直线上。这条线上的点是你所选像素的射线在深度 1、2、4、8 m 处的投影；空心圆是 $H\_\infty\tilde{\mathbf x}\_1$（深度无穷大），黑色方块是极点（深度 0）。然后移动相机 2：试试"向前运动"预设，观察极点移入图像；再试"纯旋转"预设，此时极线退化为一个点。

{% include widget.liquid name="3d-vision-epipolar" height="900" caption="对极几何探索器，使用正文的相机（$f=500$ px，640×480）。拖动视图 1 中的橙色点，或在俯视图中拖动以移动相机 2；滑块设置 $\mathbf C\_2$、相机 2 的偏航角与俯仰角，以及绿色三维点沿射线的深度。浅蓝色直线是过 $\mathbf e\_1$ 与 $\mathbf e\_2$ 的极线束。读数给出 $F/\lVert F\rVert$、两个极点、$\mathbf l\_2=F\tilde{\mathbf x}\_1$ 以及检验值 $\tilde{\mathbf x}\_2^\top F\tilde{\mathbf x}\_1\approx 0$。" %}

## 4. 从对应点估计 $F$ 与 $E$

### 4.1 线性八点算法

每个对应点 $\tilde{\mathbf x}\_1 = (u\_1, v\_1, 1)$、$\tilde{\mathbf x}\_2 = (u\_2, v\_2, 1)$ 给出一个关于 $F$ 元素**线性**的方程：

$$
\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1 = \sum_{i,j}(\tilde{\mathbf x}_2)_i\,(\tilde{\mathbf x}_1)_j\,F_{ij}
= (\tilde{\mathbf x}_2\otimes\tilde{\mathbf x}_1)^\top\mathbf f = 0,
$$

其中 $\mathbf f$ 是 $F$ 按行堆叠成的向量，$\otimes$ 是 Kronecker 积：设计矩阵的一行为 $(u\_2u\_1, u\_2v\_1, u\_2, v\_2u\_1, v\_2v\_1, v\_2, u\_1, v\_1, 1)$。堆叠 $N$ 个对应点得到 $A\mathbf f = \mathbf 0$，$A\in\mathbb R^{N\times 9}$。$F$ 在相差尺度的意义下有 8 个未知数，所以 $N \ge 8$ 个点可以确定它；点更多且有噪声时，我们在 $\lVert\mathbf f\rVert = 1$ 的约束下最小化 $\lVert A\mathbf f\rVert$，解是最小奇异值对应的右奇异向量，与第 02 篇的 DLT 相同。

线性解忽略了 $\det F = 0$。在有噪声的数据上它是满秩的，于是它的极线不会全部经过同一点：不存在极点。修正方法是用 Frobenius 范数下最近的秩 2 矩阵替换 $F$，由 Eckart-Young 定理，这就是把最小奇异值置零：

$$
F = U\operatorname{diag}(s_1, s_2, s_3)V^\top \;\longrightarrow\; F' = U\operatorname{diag}(s_1, s_2, 0)V^\top .
$$

### 4.2 归一化

用原始像素书写时，$A$ 的各列量级差别巨大：$u\_2u\_1 \approx 10^5$，而最后一列是 1。大元素上的小噪声会淹没小元素，最小奇异向量因而很不稳定。Hartley 1997 年的论文（"In defense of the eight-point algorithm"）表明，一个简单的步骤就能解决问题：对每幅图像的点做平移和缩放，使其质心位于原点、到原点的平均距离为 $\sqrt 2$；在这些坐标下求解 $\hat F$，再用 $F = T\_2^\top\hat F T\_1$ 还原（因为 $\tilde{\mathbf x}\_2^\top F\tilde{\mathbf x}\_1 = (T\_2\tilde{\mathbf x}\_2)^\top\hat F(T\_1\tilde{\mathbf x}\_1)$）。这与第 02 篇估计单应时使用的归一化相同。

为了独立于数据噪声来衡量估计质量，我们使用**极线误差**：*无噪声*点 $\mathbf x\_2$ 到由无噪声 $\mathbf x\_1$ 得到的估计极线 $F\tilde{\mathbf x}\_1$ 的平均距离。

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

在 $\sigma = 1$ px 时，原始算法得到的极线离应有位置 1.39 px，归一化算法为 0.22 px：相差 6 倍，在 $\sigma = 2$ px 时增大到 13 倍。比值 $s\_1/s\_8$ 解释了原因：$A$ 的最大奇异值与第八个奇异值（最后一个应当非零的）之比从 $9\times 10^4$ 降到 13，所以噪声对零向量的扰动小得多。归一化只需要两个 $3\times 3$ 矩阵；永远要做。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-eight-point.svg" caption="左：图像 1 中真实极点 $\mathbf e\_1=(1653,407)$（黑色方块）附近的极线 $F^\top\tilde{\mathbf x}\_2$，来自在 2 px 噪声数据上的归一化八点估计。没有秩 2 步骤时（橙色），极线两两相交于不同的点（橙色小点，从 $u=1490$ 分布到 $1643$）：不存在极点。有了这一步（紫色），它们经过同一点，即估计的极点 $(1534,390)$。中：100 次试验的极线误差中位数随噪声 $\sigma$ 的变化，原始像素（$\tilde{\mathbf x}$）对比归一化坐标（$T\tilde{\mathbf x}$）：$\sigma=1$ 时 1.36 对 0.22 px，$\sigma=4$ 时 20.4 对 0.93 px。右：七点算法对前 7 个点的三次多项式 $\det(\alpha F\_1+(1-\alpha)F\_2)$；它的三个实根给出三个候选矩阵，只有 $\alpha=-0.68$（绿色）是真实的 $F$。" %}

中间图右端 4 px 噪声的情形并不罕见：这正是金字塔粗层上关键点误差的量级。

### 4.3 七个点与一个三次方程

既然 $F$ 有 7 个自由度，7 个对应点应该就够了；在 RANSAC 中，最小样本每少一个点，收益都是指数级的（第 03 篇 6.3 节）。只有 7 行时，$A$ 有一个由两个矩阵 $F\_1, F\_2$ 张成的二维零空间，线性方程的每个解都是 $F = \alpha F\_1 + (1 - \alpha)F\_2$（相差尺度）。现在施加秩条件：

$$
\det\big(\alpha F_1 + (1 - \alpha)F_2\big) = 0 .
$$

$3\times 3$ 行列式是其元素的三次式，所以这是**关于 $\alpha$ 的三次方程**，有一个或三个实根。每个实根给出一个精确拟合全部 7 个点且秩为 2 的基础矩阵。仅凭这 7 个点无法区分它们；在 RANSAC 中，每个候选都在全部匹配上打分。代码通过在四个 $\alpha$ 值处计算行列式得到三次多项式的系数，四个值恰好确定一个三次多项式。

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

对前 7 个点，三次方程有三个实根。第二个根以 $10^{-15}$ 的精度复现真实的 $F$ 并拟合全部 200 个点；另外两个完美拟合 7 个样本点，但在其他地方偏离 32 px 和 62 px。

### 4.4 五个点：标定情形下的最小问题

当 $K$ 已知时（这是 SfM 和 SLAM 中的常见情形），我们从归一化坐标估计 $E$，只有 5 个未知数。于是 5 个对应点就够了，第 03 篇的 RANSAC 表格显示了它的好处：在 70% 外点时，只需 1893 个样本，而八点算法需要 70188 个。这个算法以难著称，但思路与七点情形一样：

1. 9 个未知数上的 5 个方程 $\hat{\mathbf x}\_2^\top E\hat{\mathbf x}\_1 = 0$ 留下一个**四维零空间**：$E = xX + yY + zZ + W$，其中 $X, Y, Z, W$ 是基矩阵，$x, y, z$ 是未知标量（把 $W$ 的系数固定为 1 即固定了尺度）。
2. 把它代入 2.2 节的十个三次方程（$\det E = 0$ 以及 $2EE^\top E - \operatorname{tr}(EE^\top)E = 0$ 的九个元素），得到十个关于 $x, y, z$ 的三次多项式方程。
3. 求解这个多项式方程组。Nistér（2004）用 Gauss-Jordan 消元把变量消到只剩一个 10 次多项式；Stewénius、Engels 和 Nistér（2006）使用 Gröbner 基和特征值问题。无论哪种方法都有**最多 10 个解**（舍去复数解），每个实解都是一个本质矩阵，需要在其余匹配上打分。

下面的代码验证第一步，并说明为什么需要第二步。

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

真实的 $E$ 位于四维零空间内（距离 $10^{-15}$），但这个空间中随机取的一个元素奇异值为 $(0.94, 0.35, 0.03)$：它满足五个对极方程，却不是本质矩阵。三次约束挑出的是少数真正是本质矩阵的元素。实际的代码（OpenCV 的 `findEssentialMat`、PoseLib、COLMAP）实现了完整的求解器；五点法在速度之外的一个实际优势是：与八点算法不同，当所有点都在一个平面上时，它仍然返回有限个解（第 7 节）。

### 4.5 应该最小化哪种误差？

八点算法最小化的是**代数误差** $\sum\_i(\tilde{\mathbf x}\_{2i}^\top F\tilde{\mathbf x}\_{1i})^2$，一个没有几何意义的量：缩放坐标或把 $F$ 乘以常数都会改变它。在 RANSAC 中判定内点以及精化 $F$ 时，我们需要以像素为单位的距离。常用的有三种。

**对称极线距离。** $\mathbf x\_2$ 到 $F\tilde{\mathbf x}\_1$ 的距离，加上 $\mathbf x\_1$ 到 $F^\top\tilde{\mathbf x}\_2$ 的距离：

$$
d_{\text{sym}}^2 = \frac{(\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1)^2}{(F\tilde{\mathbf x}_1)_1^2 + (F\tilde{\mathbf x}_1)_2^2} + \frac{(\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1)^2}{(F^\top\tilde{\mathbf x}_2)_1^2 + (F^\top\tilde{\mathbf x}_2)_2^2} .
$$

**金标准（重投影）误差。** 找到*精确*满足约束的最近点对 $(\hat{\mathbf x}\_1, \hat{\mathbf x}\_2)$，度量 $\lVert\mathbf x\_1 - \hat{\mathbf x}\_1\rVert^2 + \lVert\mathbf x\_2 - \hat{\mathbf x}\_2\rVert^2$。在高斯像素噪声下，这是最大似然准则。找最近点对就是 6.3 节的最优三角化。

**Sampson 距离。** 金标准的一阶近似，无需搜索。把一个对应点的四个坐标堆成 $\mathbf p = (u\_1, v\_1, u\_2, v\_2)$，令 $\varepsilon(\mathbf p) = \tilde{\mathbf x}\_2^\top F\tilde{\mathbf x}\_1$。我们寻找使 $\varepsilon(\mathbf p + \boldsymbol\delta) = 0$ 的最小修正 $\boldsymbol\delta$。线性化得 $\varepsilon(\mathbf p + \boldsymbol\delta) \approx \varepsilon + \nabla\varepsilon^\top\boldsymbol\delta$，使其为零的最小 $\boldsymbol\delta$ 沿梯度方向，长度为 $\lvert\varepsilon\rvert/\lVert\nabla\varepsilon\rVert$。梯度很容易求：$\partial\varepsilon/\partial u\_1 = (F^\top\tilde{\mathbf x}\_2)\_1$，$\partial\varepsilon/\partial v\_1 = (F^\top\tilde{\mathbf x}\_2)\_2$，$\partial\varepsilon/\partial u\_2 = (F\tilde{\mathbf x}\_1)\_1$，$\partial\varepsilon/\partial v\_2 = (F\tilde{\mathbf x}\_1)\_2$。因此

$$
d_{\text{Sampson}}^2 = \frac{(\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1)^2}{(F\tilde{\mathbf x}_1)_1^2 + (F\tilde{\mathbf x}_1)_2^2 + (F^\top\tilde{\mathbf x}_2)_1^2 + (F^\top\tilde{\mathbf x}_2)_2^2} .
$$

这就是上面代码中的 `sampson` 函数。约束从 $\mathbf p$ 的四维空间中去掉一维，所以对于每个坐标带有高斯噪声 $\sigma$ 的内点，$d\_{\text{Sampson}}^2/\sigma^2$ 近似服从自由度为 1 的 $\chi^2$ 分布，95% 内点阈值为 $d^2 < 3.84\,\sigma^2$，即第 03 篇中列出的数值。

### 4.6 鲁棒估计

真实的匹配含有外点，一个错误匹配就足以毁掉最小二乘解。标准做法是：RANSAC 配合七点求解器（估计 $E$ 时用五点求解器），以 Sampson 距离为残差，使用第 03 篇的自适应迭代次数，最后在一致集上重新拟合。我们把 200 个匹配中的 80 个（40%）的 $\mathbf x\_2$ 替换为随机像素。

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

在全部匹配上运行八点算法，极线误差为 21 px：毫无用处。RANSAC 找到 120 个真实内点中的 110 个，且没有外点，极线误差为 0.18 px。它用了 783 个样本，比公式 $\log(1-p)/\log(1-w^7)$ 对真实内点率 $w = 0.6$ 预测的 163 个更多：自适应次数使用的是当前最佳模型的内点率，而由 7 个含噪点拟合出的假设只能收集到一部分内点。这就是第 03 篇讨论过的公式的乐观性，也是最后那个重新拟合循环存在的原因。漏掉的 10 个内点（8%）大约等于 95% 阈值预期损失的数量再多一点。

## 5. 从 $E$ 恢复相对位姿

### 5.1 分解 $E$：四个解

给定 $E$（来自五点算法，或由 $K\_2^\top F K\_1$ 得到），我们要求出满足 $E \sim [\mathbf t]\_\times R$ 的 $R$ 和 $\mathbf t$。SVD 给出闭式解。定义

$$
W = \begin{pmatrix} 0 & -1 & 0 \\ 1 & 0 & 0 \\ 0 & 0 & 1 \end{pmatrix}, \qquad
Z = \begin{pmatrix} 0 & 1 & 0 \\ -1 & 0 & 0 \\ 0 & 0 & 0 \end{pmatrix},
$$

于是 $W$ 是绕 $z$ 轴转 90° 的旋转，且 $ZW = \operatorname{diag}(1, 1, 0)$，$ZW^\top = -\operatorname{diag}(1, 1, 0)$。

**反对称部分。** 令 $\mathbf u\_3 = \mathbf t/\lVert\mathbf t\rVert$，并把它补成一个右手正交基 $U = (\mathbf u\_1, \mathbf u\_2, \mathbf u\_3)$。则 $\mathbf u\_3\times\mathbf u\_1 = \mathbf u\_2$，$\mathbf u\_3\times\mathbf u\_2 = -\mathbf u\_1$，$\mathbf u\_3\times\mathbf u\_3 = \mathbf 0$，在这个基下恰好是矩阵 $-Z$：$[\mathbf t]\_\times = -\lVert\mathbf t\rVert\,UZU^\top$。

**分解。** 若 $E = U\operatorname{diag}(1, 1, 0)V^\top$（缩放使奇异值为 1），则

$$
UZU^\top\cdot UWV^\top = UZWV^\top = U\operatorname{diag}(1,1,0)V^\top = E,
\qquad
UZU^\top\cdot UW^\top V^\top = -E .
$$

两个旋转都在相差符号的意义下复现 $E$；由于 $E$ 本来只确定到尺度，两者都有效。平移是 $E^\top$ 的零方向（因为 $\mathbf t^\top[\mathbf t]\_\times = \mathbf 0$），即 $\pm\mathbf u\_3$，符号未知。所以共有**四个候选**：

$$
(R, \mathbf t) \in \big\lbrace (UWV^\top, \mathbf u_3),\ (UWV^\top, -\mathbf u_3),\ (UW^\top V^\top, \mathbf u_3),\ (UW^\top V^\top, -\mathbf u_3)\big\rbrace ,
$$

其中 $U$ 和 $V$ 的符号选取使 $\det U = \det V = +1$（否则 $UWV^\top$ 是反射）。

它们意味着什么？翻转 $\mathbf t$ 交换了沿基线哪个相机在"前面"：**基线反转**（baseline reversal）。两个旋转相差 $UW^\top V^\top(UWV^\top)^\top = UW^{\top 2}U^\top = U\operatorname{diag}(-1,-1,1)U^\top$，即绕基线 $\mathbf u\_3$ 转 180°：**扭转对**（twisted pair），相机 2 绕基线转过去，朝向相反的一侧。四个解在代数上都完美无缺；需要由几何来裁决。

### 5.2 正深度检验：点必须在相机前方

四种配置中只有一种把场景放在两个相机的前方（深度为正，即 **cheirality** 条件）。所以我们用每个候选三角化匹配点（第 6 节），统计在两个相机中深度都为正的点数。在无噪声数据上，计数非全即无；有噪声和外点时，取计数最大的候选。

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

在 $K$ 已知的情况下，$E$ 来自 4.6 节的鲁棒 $F$。恰好一个候选让全部 110 个内点都位于两个相机前方。旋转恢复到 0.12°，平移方向恢复到 0.46°。三维点的单位使 $\lVert\mathbf t\rVert = 1$；借用真实基线长度后，在 2 到 8 m 的深度上，其误差中位数为 3.1 cm。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-four-poses.svg" caption="例子中真实 $E$ 的四种分解，从上方俯视（$z$ 向右，$x$ 向下；相机 1 为紫色，位于原点，候选相机 2 为蓝色，两者都画出了观察方向）。星号是用该候选三角化的点 $(0.5,-0.4,5.0)$；若点位于相机前方，射线画成绿色实线，位于后方则画成红色虚线。标题统计 200 个点中在两个相机中深度均为正的数目。只有第四个候选是一致的（200/200）；其他候选把点放在相机 1 后方、相机 2 后方或两者后方。" %}

### 5.3 精化位姿

线性流程（八点、秩 2 投影、$E = K^\top F K$、SVD）从未最小化几何误差，而且估计了 7 个参数，而 5 个就够了。一个简短的非线性精化同时解决这两个问题：用旋转向量（3 个数）参数化旋转，用两个球面角（2 个数）参数化 $\mathbf t$ 的方向，再用 Levenberg-Marquardt（第 02 篇 4.2 节）最小化 Sampson 距离。这种参数化自动让 $E$ 保持在本质矩阵流形上。

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

旋转误差从 0.118° 降到 0.102°，平移方向误差从 0.46° 降到 0.39°。这里的收益不大，因为线性估计已经很好；在更难的数据上（点更少、视场更窄），精化更为重要。在完整系统中，这一步被光束法平差（bundle adjustment，[第 05 篇]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})）取代，它同时精化位姿和三维点。

### 5.4 没人能看见的尺度

我们不得不从真值中借用 $\lVert\mathbf t\rVert$。两幅图像只能在**相差一个相似变换**的意义下确定相对位姿和结构：世界整体的旋转和平移（我们通过把相机 1 放在原点固定了它们）以及一个整体尺度。单目 SLAM 正是因此会出现尺度漂移，COLMAP 的模型也采用任意单位。尺度必须来自外部：基线已标定的双目相机（第 8 节）、IMU（[第 06 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})）、已知尺寸的物体，或者学习得到的度量深度先验（[第 07 篇]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})）。

## 6. 三角化

已知两个相机和一个对应点，三维点在哪里？没有噪声时，两条反投影射线相交。有噪声时，它们是彼此靠近却不相交的**异面直线**，"交点"必须另行定义。三种标准答案的区别在于它们最小化什么。

### 6.1 中点法

最直观的答案：找到两条射线之间的最短线段，取其中点。在相机 1 坐标系中，两条射线为 $a\,\mathbf d\_1$（从 $\mathbf C\_1 = \mathbf 0$ 出发）和 $\mathbf C\_2 + b\,\mathbf d\_2$，其中 $\mathbf d\_1 = K^{-1}\tilde{\mathbf x}\_1$，$\mathbf d\_2 = R^\top K^{-1}\tilde{\mathbf x}\_2$（旋转到相机 1 中的相机 2 方向）。对 $a$、$b$ 最小化 $\lVert a\mathbf d\_1 - \mathbf C\_2 - b\mathbf d\_2\rVert^2$，求导得到 $2\times 2$ 法方程

$$
\begin{pmatrix} \mathbf d_1^\top\mathbf d_1 & -\mathbf d_1^\top\mathbf d_2 \\ \mathbf d_1^\top\mathbf d_2 & -\mathbf d_2^\top\mathbf d_2 \end{pmatrix}
\begin{pmatrix} a \\ b \end{pmatrix} =
\begin{pmatrix} \mathbf d_1^\top\mathbf C_2 \\ \mathbf d_2^\top\mathbf C_2 \end{pmatrix},
\qquad
\hat{\mathbf X} = \tfrac12\big(a\mathbf d_1 + \mathbf C_2 + b\mathbf d_2\big).
$$

它计算量小，在两个相机从相近距离观察该点时效果很好。它的弱点在于它最小化的是**三维**距离，而噪声存在于**像素**中：偏离 1 cm，对 1 m 外的相机是很大的像素误差，对 5 m 外的相机则很小。它还需要标定后的射线，所以在射影重建中无法使用。

### 6.2 线性（DLT）三角化

[神经渲染第 1 篇]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})（第 3 节）的线性方法利用 $\tilde{\mathbf x}\_i\times P\_i\tilde{\mathbf X} = \mathbf 0$。记 $\mathbf p\_i^{k\top}$ 为 $P\_i$ 的第 $k$ 行，每个视图给出两个方程 $(u\_i\mathbf p\_i^{3\top} - \mathbf p\_i^{1\top})\tilde{\mathbf X} = 0$ 与 $(v\_i\mathbf p\_i^{3\top} - \mathbf p\_i^{2\top})\tilde{\mathbf X} = 0$，四个方程用 SVD 求解。它最小化的是什么？第一个方程的残差为 $\mathbf p\_i^{3\top}\tilde{\mathbf X}\,u\_i - \mathbf p\_i^{1\top}\tilde{\mathbf X} = \lambda\_i\,(u\_i - \hat u\_i)$，其中 $\lambda\_i = \mathbf p\_i^{3\top}\tilde{\mathbf X}$ 是点在相机 $i$ 中的深度，$\hat u\_i$ 是重投影。所以 DLT 最小化的是**按深度加权的像素误差**：远处相机的方程权重更大，误差被推到近处相机的图像里。这与中点法的偏差相同，只是来路不同。

### 6.3 最优三角化

统计上正确的答案是最小化重投影误差

$$
\min_{\mathbf X}\ \lVert\mathbf x_1 - \pi_1(\mathbf X)\rVert^2 + \lVert\mathbf x_2 - \pi_2(\mathbf X)\rVert^2 ,
$$

它是高斯像素噪声下的最大似然估计。Hartley 和 Sturm（1997）找到了一种非迭代的精确求法。诀窍是在修正后的像点上搜索，而不是在三维点上搜索。任何精确满足对极约束的点对 $(\hat{\mathbf x}\_1, \hat{\mathbf x}\_2)$ 都反投影为相交的射线，所以问题等价于

$$
\min\ \lVert\mathbf x_1 - \hat{\mathbf x}_1\rVert^2 + \lVert\mathbf x_2 - \hat{\mathbf x}_2\rVert^2 \quad\text{subject to}\quad \hat{\mathbf x}_2^\top F\hat{\mathbf x}_1 = 0 .
$$

对应点位于对应的极线上。所以用一个数 $\tau$ 参数化图像 1 中的极线束；图像 2 中与之匹配的极线由 $F$ 决定。给定直线上最好的 $\hat{\mathbf x}\_i$ 是从 $\mathbf x\_i$ 作垂线的垂足，所以代价只是 $\tau$ 的函数 $d\_1(\tau)^2 + d\_2(\tau)^2$。具体来说：

1. 平移两幅图像，使 $\mathbf x\_1$ 和 $\mathbf x\_2$ 位于原点，再旋转它们，使极点落在 $u$ 轴上的 $(1, 0, f\_1)$ 和 $(1, 0, f\_2)$。此时 $F$ 取一种特殊形式，只有四个自由元素 $a, b, c, d$。
2. 图像 1 中经过极点和点 $(0, \tau, 1)$ 的直线到原点的距离平方为 $d\_1^2 = \tau^2/(1 + f\_1^2\tau^2)$。它在图像 2 中的对应直线的距离平方为 $d\_2^2 = (c\tau + d)^2/\big((a\tau + b)^2 + f\_2^2(c\tau + d)^2\big)$。
3. 令 $d\_1^2 + d\_2^2$ 的导数为零并消去分母，得到一个关于 $\tau$ 的 **6 次多项式**

   $$
   g(\tau) = \tau\big((a\tau+b)^2 + f_2^2(c\tau+d)^2\big)^2 - (ad - bc)(1 + f_1^2\tau^2)^2(a\tau+b)(c\tau+d) .
   $$

4. 在它的实根以及 $\tau\to\infty$ 处计算代价，保留最小者，以垂足作为 $\hat{\mathbf x}\_1, \hat{\mathbf x}\_2$，变换回去，再求两条（现在精确相交的）射线的交点。

结果是**射影不变**的：它不依赖坐标的选取，而中点法和 DLT 则不然。后来 Lindstrom 的 "Triangulation made easy"（CVPR 2010）给出了一个简短的迭代方案，无需求解 6 次多项式就能达到同一最优解，是一种常用的更快替代。

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

两种配置讲述了不同的故事。在主相机对中，两个相机从相近的距离观察这些点，三种方法相差不到 1%。在**非对称相机对**中，点距相机 1 为 1–2 m，距相机 2 为 4–5 m。中点法和 DLT 把几乎所有残差都放进图像 1（1.69 px 对 0.52 px）：它们度量的是三维距离或按深度加权的误差，因而在像素意义上不信任近处的相机。最优三角化按噪声模型的要求分配修正，总 RMS 为 0.988 px。这个数是有意义的：四个观测坐标、三个未知数，所以正确模型的残差平方有一个自由度，期望值为 $\sigma^2$；$\sigma = 1$ px 时总 RMS 应该约为 1 px，事实正是如此。线性方法给出 1.76 px：残差被放大得太多，按 1 px 噪声标定的检验（4.5 节的 95% 阈值）会拒掉许多真正的内点。三维精度的差别较小（16.0 mm 对 15.5 mm），所以用来初始化光束法平差时哪种方法都行；但如果像 SfM 系统那样用重投影误差来*检验*内点，就应该用最优方法（或 Lindstrom 的方法）。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-triangulation.svg" caption="上：非对称相机对中的一个带噪声的对应点（1 px 噪声），放大到观测点（黑色十字）周围 ±3 px，左为图像 1，右为图像 2。紫色直线是一对相匹配的极线，Hartley-Sturm 方法把修正后的点（绿色）放在其上。中点法（青色三角）和 DLT（橙色方块）估计的重投影几乎重合；它们在图像 1 中留下 1.83 和 1.81 px 的残差，在图像 2 中留下 0.57 和 0.58 px（总计 1.92 和 1.90 px），而最优估计留下 0.32 和 1.04 px，总计 1.09 px。下：每幅图像的 RMS 残差（柱）与总残差（菱形），对 200 个点的 20 次试验取平均；虚线是 1 px 噪声下总残差的期望值。左：主相机对，三者一致；右：非对称相机对。" %}

### 6.4 三角化得到的深度有多精确？

即使最优三角化也无法超越几何本身的限制。一个像素的误差使射线偏转约 $\sigma/f$ 的角度，而点沿另一条射线的移动等于这个角度除以两条射线之间**三角化角**的正弦。对于深度为 $Z$、基线 $b$ 大致垂直于观察方向的点，三角化角约为 $b/Z$，所以深度误差约为

$$
\delta Z \approx \frac{Z^2}{f\,b}\,\delta d ,
$$

其中 $\delta d$ 是两幅图像间像素差的误差。**深度误差随距离的平方增长**，随基线和焦距的增大而减小。[神经渲染第 1 篇]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})用一张图展示了三角化误差在小角度时的急剧增大；8.2 节对校正后的双目对精确推导这个公式，并画出它的量化单元。

## 7. 退化配置

八点算法需要 8 个对应点唯一确定 $F$。有两种常见情况使之不可能，而且它们并不是罕见的边角情形：三脚架上水平摇动的相机、原地转身的手机、飞越平地的无人机、对着一面墙或一张桌子的相机。

### 7.1 纯旋转

如果相机只旋转，则 $\mathbf t = \mathbf 0$，$E = [\mathbf 0]\_\times R = 0$。没有基线，没有极平面，也没有极线。每个点，不论深度如何，都通过同一个单应映射：

$$
\tilde{\mathbf x}_2 \sim H_\infty\tilde{\mathbf x}_1 = K_2 R K_1^{-1}\tilde{\mathbf x}_1 ,
$$

全景拼接正是这样做的。深度完全无法恢复：一条射线上的所有点在两幅图像中都落在同一个像素上。另一方面，旋转是完全确定的，在 $K$ 已知时可以从 $H\_\infty$ 中读出。

### 7.2 平面场景

如果所有点都位于平面 $\mathbf n^\top\mathbf X\_1 = d$ 上（单位法向 $\mathbf n$，距离 $d > 0$，相机 1 坐标），则每个点都满足 $\mathbf n^\top\mathbf X\_1/d = 1$，于是

$$
\mathbf X_2 = R\mathbf X_1 + \mathbf t\,\frac{\mathbf n^\top\mathbf X_1}{d} = \Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)\mathbf X_1 ,
\qquad
H = K_2\Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)K_1^{-1} .
$$

一个平面的两幅图像通过这个**平面诱导的单应**（plane-induced homography）相联系，它与第 02 篇中的是同一个对象，那里的平面是标定板。为什么这会使八点算法失效？对任意向量 $\mathbf e$，矩阵 $F' = [\mathbf e]\_\times H$ 满足该平面的每一个对应点：

$$
\tilde{\mathbf x}_2^\top[\mathbf e]_\times H\tilde{\mathbf x}_1 \sim \tilde{\mathbf x}_2^\top[\mathbf e]_\times\tilde{\mathbf x}_2 = \tilde{\mathbf x}_2\cdot(\mathbf e\times\tilde{\mathbf x}_2) = 0 .
$$

真实的 $F = [\mathbf e\_2]\_\times H$ 是这个族中的一员（3.1 节中用 $H$ 代替 $H\_\infty$；两者相差的一项被 $[\mathbf e\_2]\_\times$ 消去），但数据无法把它挑出来：解构成一个**三维**线性族，所以 $A$ 有三个零奇异值，而不是一个。纯旋转是同样的情形，只是 $H = H\_\infty$。

### 7.3 在数据中看到它

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

一般场景中 $A$ 恰好有一个零奇异值；平面和纯旋转则有三个。在 1 px 噪声下，八点算法在一般场景中把位姿恢复到 0.14° 和 0.1°；在平面上，它返回族中恰好最适合噪声的那个成员，"恢复"出的平移偏差 92°：一个随机方向。

### 7.4 检测与处理退化

既然退化情形恰恰是**单应**能解释匹配的情形，实际的检验就是同时拟合两种模型并比较。一个简单的版本：在相同置信度（95%）下统计每个模型接受多少匹配（对单应而言，转移误差 $\lVert\mathbf x\_2 - H\mathbf x\_1\rVert$ 含有两幅图像的噪声，所以阈值为 $\sqrt{2\cdot 5.99}\,\sigma$）。

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

在一般场景中，单应解释的匹配只有 $F$ 的 3%；对平面和旋转则是 98%。最后一行在实践中最重要：**小基线接近退化**。相机只移动 3 cm 时，近点与远点之间的视差低于噪声，单应能解释 93% 的匹配。下一张图的右图对基线做了扫描。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-degeneracy.svg" caption="左：归一化八点矩阵 $A$ 的全部九个奇异值 $s\_k$（无噪声，相对于 $s\_1$；零值画在 $10^{-17}$ 处），分别对应一般场景（紫色）、平面场景（橙色）和纯旋转（蓝色）。一般场景有一个零奇异值，退化情形有三个：一个三维的解族。右：单应内点数与基础矩阵内点数之比随基线 $\lVert\mathbf C\_2\rVert$ 的变化（1 px 噪声，5 个场景的平均），随机深度（紫色）与平面（橙色）。一般场景的比值从 3 cm 时的 0.92 降到 8 cm 时的 0.58，再降到 86 cm 时的 0.02；平面场景在所有基线下都接近 1。" %}

不同系统对此的处理方式不同：

- **SLAM 初始化**同时拟合两种模型并作出选择。ORB-SLAM（Mur-Artal 等，2015）用截断的 $\chi^2$ 残差为每个模型打分，当 $S\_H/(S\_H + S\_F) > 0.45$ 时选择单应，并在场景为平面时把它分解为位姿；如果两种模型都不够可信，就等待更大的视差。Torr 的 **GRIC** 准则做同样的比较，并对模型复杂度施加信息论意义上的惩罚。
- **SfM** 把匹配能被单应解释的图像对标记为平面或全景，避免从它们开始初始化重建。
- **鲁棒估计**：即使场景不是平面，一个占主导的平面也可能骗过 RANSAC，因为主要从该平面抽取的样本会给出一个错误但仍能收集大量内点的 $F$。DEGENSAC（Chum、Werner 和 Matas，2005）检测七个点中有五个或更多由同一单应联系的样本，并修复模型。
- **标定相机**：使用五点求解器，它（与八点算法不同）对平面场景仍给出有限个候选位姿。

对纯旋转，没有任何方法能恢复深度；正确的应对是从单应估计 $R$，并等待平移出现。

## 8. 双目立体：校正、视差与深度

到目前为止，相机都在它们恰好所在的位置。**双目相机**把第二个相机刚性地固定在第一个旁边，并只对这一对相机标定一次（第 02 篇第 7 节）。于是 $F$ 事先已知，问题从"几何是什么？"变成"每个像素的深度是多少？"。使稠密匹配变得可行的技巧是校正。

### 8.1 校正后的几何是一个特殊的 $F$

假设两个相机有相同的 $K$、相同的朝向，相机 2 沿相机 1 的 $x$ 轴平移了基线长度 $b$：$R = I$，$\mathbf t = (-b, 0, 0)$。则极点是无穷远点 $\mathbf e = (1, 0, 0)^\top$，并且

$$
F \sim [\mathbf e]_\times = \begin{pmatrix} 0 & 0 & 0 \\ 0 & 0 & -1 \\ 0 & 1 & 0 \end{pmatrix},
\qquad
\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1 = v_1 - v_2 = 0 .
$$

**极线就是图像行，匹配点具有相同的 $v$。** 校正通过虚拟地旋转两个相机，把任意一对标定相机变换成这种形式，第 02 篇推导过它（Fusiello-Trucco-Verri 构造）。用本篇的语言来说：校正对两幅图像施加单应 $H\_1, H\_2$，新相机对的基础矩阵为 $H\_2^{-\top}FH\_1^{-1}$，因为 $\tilde{\mathbf x}\_2^\top F\tilde{\mathbf x}\_1 = (H\_2\tilde{\mathbf x}\_2)^\top H\_2^{-\top}FH\_1^{-1}(H\_1\tilde{\mathbf x}\_1)$。一对图像已校正，当且仅当这个矩阵与 $[\mathbf e]\_\times$ 成比例。我们在例子上验证这一点。

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

变换后的 $F$ 等于 $-[\mathbf e]\_\times/\sqrt 2$，匹配点在 $10^{-13}$ px 的精度上位于同一行，由水平偏移计算出的深度（下一节）与真实深度相差 $10^{-14}$ m。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-rectification.svg" caption="上：例子的图像 1 和图像 2，带有五组对应点（彩色点）及其极线；灰色点是全部 200 个点。极线是倾斜的，向远在右方的极点汇聚。下：经过校正单应 $H\_1=KR\_{\text{rect}}K^{-1}$ 和 $H\_2=KR\_{\text{rect}}R^\top K^{-1}$ 后，图像边界变为紫色四边形，所有极线都变成水平，每组对应点在两幅图像中位于同一行。$u$ 方向上的大偏移就是视差：对于 2 到 8 m 的深度和 86 cm 的基线，视差为 49 到 268 px。" %}

没有标定时，仅凭 $F$ 仍然可以校正，但单应不再唯一。Hartley（1999）用一个在图像中心附近接近刚体运动的单应把 $\mathbf e\_2$ 送到无穷远，再从与 $F$ 相容的族中选取 $H\_1$，使水平视差最小；Loop 和 Zhang（1999）则选取使射影畸变最小的一对单应。OpenCV 的 `stereoRectifyUncalibrated` 采用 Hartley 的方法。其结果比标定校正的图像畸变更大，这也是双目相机应当标定的又一个理由。

### 8.2 视差与深度

在 $P\_1 = K[I \mid \mathbf 0]$、$P\_2 = K[I \mid -b\,\mathbf e\_x]$ 的校正相机对中，点 $(X, Y, Z)$ 投影为

$$
u_1 = f\frac{X}{Z} + c_x, \qquad u_2 = f\frac{X - b}{Z} + c_x, \qquad v_1 = v_2 = f\frac{Y}{Z} + c_y .
$$

**视差**（disparity）是水平偏移 $d = u\_1 - u\_2 = fb/Z$，因此

$$
Z = \frac{f\,b}{d}, \qquad X = \frac{b\,(u_1 - c_x)}{d}, \qquad Y = \frac{b\,(v_1 - c_y)}{d} .
$$

OpenCV 把这三个方程打包进 `stereoRectify` 返回的 $4\times 4$ 重投影矩阵 $Q$。深度与视差成反比：近处的点视差大，无穷远处的点 $d = 0$。求导可知，视差误差 $\delta d$ 带来

$$
\delta Z = \Big\lvert\frac{\partial Z}{\partial d}\Big\rvert\,\delta d = \frac{fb}{d^2}\,\delta d = \frac{Z^2}{f\,b}\,\delta d ,
$$

这正是 6.4 节的公式，现在在一阶意义下是精确的。取 $f = 500$ px、$b = 0.12$ m、匹配精度为四分之一像素，5 m 处的深度误差为 $25/60\cdot 0.25$ m $= 10.4$ cm，10 m 处是它的四倍。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-depth-uncertainty.svg" caption="左：误差为什么随深度增大，以一个像素很大的玩具校正相机对为例（$f=6$，$b=1.5$；细线是两个相机的像素边界）。这些单元是同一个左像素与视差为 2 到 8 的右像素共同看到的区域：整数视差 $d$ 只能说明点位于深度 $fb/(d+1)$ 与 $fb/(d-1)$ 之间，从 $d=8$ 时的 1.00–1.29 到 $d=2$ 时的 3–9。右：$f=500$ px、$\delta d=0.25$ px 时三种基线下的 $\delta Z=Z^2\delta d/(fb)$；在 5 m 处误差分别为 20.8、10.4 和 4.2 cm。" %}

由此产生的权衡贯穿双目设计。更长的基线提高远距离精度，但会缩小两个视图在近处的重叠范围，增加遮挡，并且由于两个视图差别更大而使匹配更困难。车载双目的基线通常为几十厘米；手机和小型设备上的紧凑双目相机只有几厘米，按上面的公式，这把它们的精确测距范围限制在几米以内。

### 8.3 一个合成立体对

为了研究稠密匹配，我们需要一对**每个像素视差都已知**的图像。我们用光线投射生成一对：$240\times 180$ 的校正立体对，$f = 200$ px，$b = 0.12$ m，场景包括一面倾斜的墙、地面、一个有纹理的方块、一块带二值图案的倾斜面板，以及一个几乎没有纹理的方块（纹理幅度 4 个灰度级，而传感器噪声为 1.5）。从同一个三维场景渲染两个视图，真值视差 $fb/Z$ 和遮挡就自然而然地得到了。

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

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-stereo-pair.svg" caption="合成的校正立体对：左图 $I\_L$、右图 $I\_R$（相机向右移动了 12 cm，所以一切都向左移动，近处物体移动得更多），以及每个左像素的真实视差 $d^\ast$，从远处墙面的 6.0 px 到近处方块的 21.8 px。灰色：7.1% 在右图中没有匹配的左像素，要么被遮挡（每个方块左侧紧邻的条带，右相机看不到），要么超出其视场（左边缘）。" %}

被遮挡的条带值得一看：它们位于每个前景物体的左侧。右相机位置更靠右，所以它能看到物体右边缘之后的东西，却看不到左边缘之后的东西。在那里，任何匹配方法都无法得到正确的视差；最好的做法是把它们检测出来。

### 8.4 块匹配

最简单的稠密方法比较窗口。对每个左像素和每个候选视差 $d$，计算左图中 $(x, y)$ 周围窗口与右图中 $(x - d, y)$ 周围窗口之间的**匹配代价**，然后取代价最小的视差（"赢者通吃"，winner takes all，WTA）。常用的代价有：

- **SAD / SSD**：绝对差或平方差之和。速度快，但对两个相机之间的亮度和对比度差异敏感。
- **NCC**：归一化互相关，对窗口的增益和偏置不变，代价更高。
- **Census**（Zabih 和 Woodfill，1994）：把每个像素替换为一个比特串，表示哪些邻居比它暗，再用汉明距离比较比特串。对任何单调的亮度变化不变，是两个相机辐射特性不同时的标准选择。

对所有像素和视差计算 $C(x, y, d)$ 得到**代价体**（cost volume），一个 $D\times H\times W$ 的数组；借助盒式滤波，每个窗口代价的计算量为 $O(1)$。WTA 视差是整数；用一条抛物线拟合 $d - 1$、$d$、$d + 1$ 处的代价可以细化它，其顶点位于

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

窗口大小是一个权衡。小窗口（3×3）包含的纹理太少，区分度不够：10.4% 的像素出错，像椒盐噪声一样散布，并覆盖弱纹理方块。大窗口（15×15）收集到更多纹理，能恢复无纹理方块的更大部分（但仍不是全部），但在深度不连续处，它同时包含前景和背景的像素，而纹理更强的前景通常胜出：物体向外长出半个窗口。这种**前景膨胀**（foreground fattening）把误差推高到 12.0%。没有一种窗口大小处处适用，下一张图说明了这一点。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-block-matching.svg" caption="上：SAD 块匹配在 3×3、7×7 和 15×15 窗口下的视差图，以及 SAD 5×5 加半全局匹配（8.5 节）的结果；色标与真值相同。下：误差超过 1 px 的像素标为红色（灰色：没有可见匹配），标题是可见像素上的错误像素率：10.4%、9.4%、12.0% 和 4.9%。小窗口在无纹理方块上失败，并把误差撒满整幅图像；大窗口恢复了方块的更多部分，却让每个物体膨胀半个窗口；SGM 保住了边缘，并把无纹理方块的大部分算对，剩下的误差呈 4 路径实现特有的水平条纹。" %}

### 8.5 半全局匹配

块匹配独立地决定每个像素。我们真正想要的视差图既要**忠实于数据**，又要**平滑**，只在少数地方跳变。写成能量：

$$
E(D) = \sum_{\mathbf p} C(\mathbf p, D_{\mathbf p})
+ \sum_{\mathbf p}\sum_{\mathbf q\in\mathcal N(\mathbf p)} \Big( P_1\,[\lvert D_{\mathbf p} - D_{\mathbf q}\rvert = 1] + P_2\,[\lvert D_{\mathbf p} - D_{\mathbf q}\rvert > 1] \Big),
$$

其中 $[\cdot]$ 在条件成立时为 1，否则为 0。小惩罚 $P\_1$ 允许倾斜表面，其视差每次变化一个像素；大惩罚 $P\_2$ 让真正的跳变代价高昂但仍然可能。在二维网格上最小化 $E$ 一般是 NP 难的。然而沿着**单条一维路径**，它可以用动态规划精确求解，这就是经典的扫描线立体。Hirschmüller 的**半全局匹配**（semi-global matching，SGM；CVPR 2005，TPAMI 2008）沿多个方向 $\mathbf r$（从左到右、从右到左、从上到下等）运行这个动态规划，再把结果相加。沿方向 $\mathbf r$ 以视差 $d$ 到达像素 $\mathbf p$ 的代价为

$$
L_{\mathbf r}(\mathbf p, d) = C(\mathbf p, d) + \min\Big( L_{\mathbf r}(\mathbf p - \mathbf r, d),\
L_{\mathbf r}(\mathbf p - \mathbf r, d \pm 1) + P_1,\
\min_k L_{\mathbf r}(\mathbf p - \mathbf r, k) + P_2 \Big) - \min_k L_{\mathbf r}(\mathbf p - \mathbf r, k),
$$

即：以相同视差继续不需代价，变化一个像素付出 $P\_1$，跳到任意视差付出 $P\_2$。减去前一个最小值不改变 argmin，但使数值保持有界。聚合代价为 $S(\mathbf p, d) = \sum\_{\mathbf r} L\_{\mathbf r}(\mathbf p, d)$，视差取其 WTA。这样每个像素都沿每条路径接收来自远处的证据：弱纹理区域可以继承其有纹理边界的视差；而在真正的深度跳变处，数据项明显不支持平滑，固定代价 $P\_2$ 允许视差在那里改变。

另外两个想法使方法完整。**左右一致性检查**（left-right consistency check）以右图为参考再计算一张视差图，把两次视差不一致的像素标为无效；被遮挡的像素无法通过检查，因为它们的"匹配"是另一个表面。在我们的代码中，右图代价无需重新计算：右像素 $x$ 在视差 $d$ 下的代价就是左图在 $x + d$ 处的代价。Hirschmüller 的匹配代价基于**互信息**（mutual information），能处理辐射差异；census 和块代价是常见的替代。OpenCV 的 `StereoSGBM` 匹配小块，默认沿 5 个方向聚合（使用 `MODE_HH` 时为 8 个），其文档建议对绝对差之和（而非均值）取 $P\_1 = 8\cdot\text{channels}\cdot\text{blockSize}^2$、$P\_2 = 32\cdot\text{channels}\cdot\text{blockSize}^2$。

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

使用 5×5 SAD 代价时，SGM 把最好的块匹配的误差减半，从 9.4% 降到 4.9%。左右一致性检查随后去掉全部像素的 8.7%，其中包括 84% 真正被遮挡的像素，在保留下来的像素中只剩 2.3% 的错误像素。下一张图展示聚合沿一行图像对代价体做了什么。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-sgm.svg" caption="左：代价体沿第 $y=145$ 行的一个切片（暗 = 低代价，每列按其第 95 百分位数缩放），上为聚合前（5×5 SAD 代价 $C$），下为 SGM 聚合后（$S$）。白线：真实视差；青色点：每列的 argmin。聚合前，argmin 在无纹理方块（$x\approx 110$–$175$，真实 $d=21.8$）和遮挡条带中游移；聚合后，最小值在方块中基本沿着真实视差走，而有纹理区域保持不变。右：经过左右一致性检查后的 SGM 视差图；灰色像素被剔除（每个物体左侧的遮挡条带，以及零星的失败）；虚线标出左图中的那一行。" %}

### 8.6 动手试试：立体匹配实验室

这个小部件在浏览器中渲染同类场景（200×150 px），并对其运行块匹配或 SGM。选择一个像素即可看到它的代价随视差变化的曲线；使用 SGM 时还会画出聚合后的曲线。

{% include widget.liquid name="3d-vision-stereo-matching" height="620" caption="立体匹配实验室。左：左图；中：计算出的视差（灰色：被左右一致性检查剔除）；右：误差超过 1 px 的像素为红色（深灰：没有可见匹配）。在任意图像上点击或拖动以选择像素；图表显示其窗口代价 $C(d)$（橙色）、SGM 聚合代价 $S(d)$（紫色，已重新缩放）和真实视差（虚线）。滑块调整窗口大小、$P\_1$、$P\_2$、无纹理方块的纹理强度和图像噪声；纹理或噪声改变时会重新渲染图像。" %}

可以试试：用块匹配时点击无纹理方块，比较 3×3 和 11×11 窗口；代价曲线从平坦而嘈杂变成一个清晰的谷。把方块纹理设为 0 再比较：块匹配把方块的大部分算错，而 SGM 仍能算对其中大部分，因为边缘处的视差沿路径向内传播；其余部分以条纹形式出错。然后把纹理调回 6，把 $P\_2$ 提高到 120：跳变变得极其昂贵，聚合会把视差拖过物体边界，误差沿边缘增加，尤其集中在数据项太弱、无力抵抗的无纹理方块上。

### 8.7 超越手工设计的立体匹配

块匹配和 SGM 仍在许多相机和机器人中运行，因为它们行为可预测，并且在专用硬件上很快。大约从 2010 年代中期起，学习式方法在各项立体匹配基准上领先。GC-Net（Kendall 等，ICCV 2017）用学习的特征构建代价体，以 3D 卷积而非 SGM 对其正则化，并用可微的 soft argmin 读出亚像素视差。RAFT-Stereo（Lipson、Teed 和 Deng，3DV 2021）把第 03 篇的循环光流网络 RAFT 改造用于校正后的图像对。FoundationStereo（Wen 等；截至 2026 年 11 月已发表于 CVPR 2025）在约一百万对合成数据上训练，以一个冻结的单目深度模型作为先验，能够零样本泛化到真实基准。本节的结构在所有这些方法中都保留了下来：视差上的代价体、聚合和读出。[第 07 篇]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})把代价体推广到两个以上的视图（平面扫描与多视图立体），并介绍单目深度估计。

## 动手试试

- 在**极线小部件**（3.4 节）中选择"向前运动"预设，把点拖向视图 1 的中心。当点恰好位于主点时，极线在哪里？为什么？然后选择"双目"预设，确认对每个深度，极线都保持在该点所在的行上。
- 仍在极线小部件中，把深度滑块分别设为 0.5 m 和 20 m，观察绿色点落在线上的什么位置。然后在俯视图中把基线调得很小：深度刻度挤成一团，这就是从内部看到的 7.4 节的近退化。
- 在**立体匹配实验室**（8.6 节）中，观察纹理为 6 时，窗口从 3×3 增大到 15×15 的过程中块匹配如何处理无纹理方块，以及大窗口在物体边界上付出的代价；然后打开左右一致性检查，看看它去掉了哪些像素。
- 主页的[交互实验室]({{ '/' | relative_url }}#lab)展示渲染的一面：高斯溅射演示正是本篇这些带位姿的图像最终用来构建的那类场景。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| A computer algorithm for reconstructing a scene from two projections (Longuet-Higgins) | Nature | 1981 | [DOI](https://doi.org/10.1038/293133a0) | 本质矩阵与线性八点算法 |
| Non-parametric local transforms for computing visual correspondence (Zabih, Woodfill) | ECCV | 1994 | — | 鲁棒匹配代价 census 变换 |
| In defense of the eight-point algorithm (Hartley) | TPAMI | 1997 | [DOI](https://doi.org/10.1109/34.601246) | 坐标归一化使线性算法变得精确 |
| Triangulation (Hartley, Sturm) | CVIU | 1997 | [DOI](https://doi.org/10.1006/cviu.1997.0547) | 通过 6 次多项式实现最优两视图三角化 |
| The problem of degeneracy in structure and motion recovery from uncalibrated image sequences (Torr, Fitzgibbon, Zisserman) | IJCV | 1999 | — | 纯旋转与平面场景及其检测 |
| Theory and practice of projective rectification (Hartley) | IJCV | 1999 | — | 仅由 $F$ 进行校正 |
| Computing rectifying homographies for stereo vision (Loop, Zhang) | CVPR | 1999 | — | 畸变最小的校正 |
| A taxonomy and evaluation of dense two-frame stereo correspondence algorithms (Scharstein, Szeliski) | IJCV | 2002 | [DOI](https://doi.org/10.1023/A:1014573219977) | 代价、聚合、优化、细化；Middlebury 基准 |
| An efficient solution to the five-point relative pose problem (Nistér) | TPAMI | 2004 | [DOI](https://doi.org/10.1109/TPAMI.2004.17) | RANSAC 中使用的标定最小解 |
| Two-view geometry estimation unaffected by a dominant plane (Chum, Werner, Matas) | CVPR | 2005 | — | DEGENSAC |
| Recent developments on direct relative orientation (Stewénius, Engels, Nistér) | ISPRS J. Photogrammetry and Remote Sensing | 2006 | — | 基于 Gröbner 基的五点求解器 |
| Stereo processing by semiglobal matching and mutual information (Hirschmüller) | TPAMI | 2008 | [DOI](https://doi.org/10.1109/TPAMI.2007.1166) | SGM |
| Triangulation made easy (Lindstrom) | CVPR | 2010 | — | 快速迭代的最优三角化 |
| ORB-SLAM: a versatile and accurate monocular SLAM system (Mur-Artal, Montiel, Tardós) | IEEE T-RO | 2015 | [arXiv](https://arxiv.org/abs/1502.00956) | 地图初始化时在单应与基础矩阵之间选择 |
| End-to-end learning of geometry and context for deep stereo regression (Kendall et al.) | ICCV | 2017 | [arXiv](https://arxiv.org/abs/1703.04309) | 学习的代价体，3D 卷积与 soft argmin |
| RAFT-Stereo: multilevel recurrent field transforms for stereo matching (Lipson, Teed, Deng) | 3DV | 2021 | [arXiv](https://arxiv.org/abs/2109.07547) | 用于立体匹配的循环细化 |
| FoundationStereo: zero-shot stereo matching (Wen et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.09898) | 大规模合成数据训练与单目深度先验 |

## 学习资源

- R. Hartley 与 A. Zisserman，《Multiple View Geometry in Computer Vision》第 2 版，2004：第 9 章（对极几何与基础矩阵）、第 10 章（相机与结构的重建）、第 11 章（计算 $F$，包括七点算法与 Sampson 距离）和第 12 章（三角化）。
- Y. Ma、S. Soatto、J. Košecká 与 S. Sastry，《An Invitation to 3-D Vision》，2004：第 5、6 章（由两个标定视图和两个未标定视图重建），对 $E$ 的分解有细致的证明。
- R. Szeliski，《Computer Vision: Algorithms and Applications》第 2 版，2022：第 11 章（运动恢复结构，包括两帧方法）与第 12 章（深度估计：校正、匹配代价、SGM）。可在 [szeliski.org/Book](https://szeliski.org/Book/) 免费阅读。
- OpenCV calib3d：`findFundamentalMat`、`findEssentialMat`、`recoverPose`、`triangulatePoints`、`stereoRectify`、`stereoRectifyUncalibrated`、`StereoBM` 与 `StereoSGBM`（[文档](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html)）。
- 代码：[PoseLib](https://github.com/PoseLib/PoseLib)（最小解，包括五点和七点）、[COLMAP](https://github.com/colmap/colmap)（SfM 中的两视图几何估计）。
- 基准：[Middlebury stereo](https://vision.middlebury.edu/stereo/)、[KITTI stereo](https://www.cvlibs.net/datasets/kitti/eval_scene_flow.php?benchmark=stereo)、[ETH3D](https://www.eth3d.net/)。

## 练习

1. 证明对于两个具有相同 $K$ 的相机之间的纯平移，$F$ 是反对称的，并且 $\mathbf x\_1$、$\mathbf x\_2$ 与极点共线。这说明了图像中点的运动有什么特点？

   <details markdown="1"><summary>提示</summary>

   取 $R = I$，由 3.1 节的恒等式得 $F = K^{-\top}[\mathbf t]\_\times K^{-1} \sim [K\mathbf t]\_\times$，它是反对称的，且 $\mathbf e = K\mathbf t$。于是 $\tilde{\mathbf x}\_2^\top[\mathbf e]\_\times\tilde{\mathbf x}\_1 = \det(\tilde{\mathbf x}\_2, \mathbf e, \tilde{\mathbf x}\_1) = 0$：三点共线。每个点沿着它与极点的连线移动，朝向极点或远离极点（扩张焦点），正如运动示意图的左图和中图。
   </details>

2. 证明满足 $2MM^\top M - \operatorname{tr}(MM^\top)M = 0$ 的 $3\times 3$ 矩阵 $M \ne 0$ 的奇异值为 $(\sigma, \sigma, 0)$，因此该三次约束刻画了本质矩阵。

   <details markdown="1"><summary>提示</summary>

   利用 SVD，方程变为对 $i = 1, 2, 3$ 有 $\sigma\_i(2\sigma\_i^2 - s) = 0$，其中 $s = \sigma\_1^2 + \sigma\_2^2 + \sigma\_3^2$。所以每个非零的 $\sigma\_i$ 都满足 $\sigma\_i^2 = s/2$。若三个都非零，则 $s = 3s/2$，即 $s = 0$：不可能。若只有一个非零，则 $\sigma\_1^2 = \sigma\_1^2/2$：不可能。所以恰好两个非零且相等。
   </details>

3. 证明分解中的两个旋转相差绕基线 180° 的旋转，并画图解释：对扭转对而言，若某点在真实位姿下位于两个相机前方，它为什么不可能同时位于两个相机前方。

   <details markdown="1"><summary>提示</summary>

   $R\_b R\_a^\top = UW^\top V^\top VW^\top U^\top = U(W^\top)^2U^\top = U\operatorname{diag}(-1,-1,1)U^\top$，即绕 $\mathbf u\_3 = \mathbf t/\lVert\mathbf t\rVert$ 转 $\pi$。把相机 2 绕基线转 180° 会使它相对于极平面的观察方向反过来，于是 $\mathbf x\_2$ 的射线从基线的另一侧射出；两条射线随后在某个相机的后方相交（对照四种位姿图中的各个子图）。
   </details>

4. 一台双目相机 $f = 700$ px，$b = 12$ cm，匹配精度为 0.2 px。在多远的距离上相对深度误差 $\delta Z/Z$ 达到 5%？若要在 50 m 处达到 5%，基线需要多长？

   <details markdown="1"><summary>提示</summary>

   $\delta Z/Z = Z\,\delta d/(fb)$。令其为 0.05，得 $Z = 0.05\cdot 700\cdot 0.12/0.2 = 21$ m。对 $Z = 50$ m：$b = Z\,\delta d/(0.05 f) = 50\cdot 0.2/35 = 0.29$ m。
   </details>

5. 给 `sgm` 加上四个对角方向，扩展为 8 条路径，与 4 路径版本比较错误像素率和水平条纹。然后实现 census 代价（5×5 窗口、汉明距离），在仅给右图施加 1.2 倍亮度增益后，与 SAD 比较。

   <details markdown="1"><summary>提示</summary>

   对角路径依次访问 $(x, y), (x+1, y+1), \dots$；递推式相同，前一个像素为 $(x-1, y-1)$。一种向量化方法是逐行处理图像，`prev` 取上一行平移一列的结果（空出的列用原始代价 $C$ 填充）。对 census，把每个像素的 24 个邻居与中心比较，把比特打包成一个整数，再用查找表统计异或后不同的比特数。增益会改变每个绝对差，但不改变任何 census 比特，所以 SAD 应当变差而 census 不会。
   </details>

**下一篇：**[多视图几何与光束法平差]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})：从两个视图走向多个视图，包括用 PnP 做相机后方交会、增量式与全局式运动恢复结构，以及光束法平差；它同时精化所有相机和点，本篇的相对位姿和三角化最终都汇入其中。
