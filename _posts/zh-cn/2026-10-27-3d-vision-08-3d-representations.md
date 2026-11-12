---
layout: post
title: "三维表示：点、网格、体素、SDF、神经场与高斯"
date: 2026-10-27 11:08:00+0900
description: "同一个形状的九种存法：深度图与多平面图像、点云、网格、体素栅格与八叉树、有符号距离场与 TSDF、神经场与三维高斯。它们之间如何转换，内存与精度如何随分辨率变化（在同一个圆环上实测），什么任务该选哪一种，并简要介绍 PointNet 与稀疏卷积。"
categories: 3d-vision
tags: [3d-representations, point-cloud, mesh, voxels, octree, sdf, tsdf, neural-fields, gaussian-splatting, multi-plane-images, pointnet, sparse-convolution]
series: 3d-vision
series_order: 8
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

第 1 至 7 篇以多种形式产生了几何：[第 4 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})三角化出稀疏点，[第 5 篇]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})给出稀疏点云和相机位姿，[第 6 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})维护一张地图，[第 7 篇]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})把带位姿的图像变成稠密深度图。在把这些合并成曲面（[第 9 篇]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})）之前，我们必须先决定：内存里的"三维模型"到底是什么。

答案不止一个。规划路径的机器人问"这个格子是空的吗？"；渲染器问"这条光线看到什么颜色？"；物理引擎问"我离表面多远，在哪个方向？"；神经网络则需要一个可以做卷积的规则数组。每个问题在某种表示里很便宜，在另一种表示里却很昂贵。本文拿**同一个形状**（一个圆环）把它存进每一种常见表示，逐一测量它占多少内存、有多精确、能轻松回答哪些问题。读完之后，你应该能针对一个任务，有理有据地选择表示，而不是凭习惯。

这是一篇长文。第 2 至 8 节各讲一类表示，可以单独阅读；第 9 至 11 节进行比较：相互转换、内存与精度的权衡、决策表；第 12 节简要介绍三维数据上的学习。

## 前置知识

- [第 1 篇]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})中的针孔相机 $P = K[R \mid \mathbf t]$、反投影 $K^{-1}\tilde{\mathbf u}$ 与 OpenCV 相机坐标系。
- 深度图及其来源：[第 7 篇]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})。这里只需知道深度图是一幅由深度组成的图像。
- [图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})程度的网格、有符号距离函数与 Marching Cubes。本文链接过去，不再重复。
- 第 7、8 节若了解 [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) 与 [3D 高斯泼溅]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})的基础会更好，但不是必需。
- Python、NumPy 与 SciPy。各代码块相互依赖：请在同一个文件或 notebook 中按顺序运行。它们全部摘自 `bin/figures/3d-vision/vision3d_08.py`，该脚本也绘制了所有插图，文中引用的每个数字都由它打印出来。

## 1. 同一个形状，多种表示

### 1.1 划分表示的三个维度

每种三维表示都要做三个选择。

1. **显式（explicit）还是隐式（implicit）。** 显式表示列出位于表面*上*的东西：点、三角形、高斯。可以直接枚举表面，但要回答"$\mathbf x$ 在内部吗？"就需要搜索。隐式表示存储空间上的一个函数 $f(\mathbf x)$，表面是某个水平集，例如 $\\{\mathbf x : f(\mathbf x) = 0\\}$。内外判断只需求一次函数值，但找到表面需要搜索（求根、Marching Cubes）。
2. **表面（surface）还是体积（volume）。** 网格和点云只描述边界；占据栅格、SDF 或密度场描述空间中的每一点，包括空白空间和内部。碰撞检测、自由空间推理和体渲染需要的正是体积表示，代价是内存，因为体积按 $N^3$ 增长，而面积只按 $N^2$ 增长。
3. **世界空间还是图像空间。** 深度图或多平面图像附着在某一台相机上。它便宜，并且与传感器完全一致，但只描述那台相机看到的东西。

还有两个区分会反复出现。表示可以是**离散的**（栅格、列表）或**连续的**（可以在任意位置查询的函数，例如插值后的栅格或神经网络）；也可以是**结构化的**（CNN 能卷积的规则栅格）或**非结构化的**（没有顺序的点集）。

| 表示 | 显式 / 隐式 | 表面 / 体积 | 自然的查询 | 困难的查询 |
| --- | --- | --- | --- | --- |
| 深度图 $Z(u, v)$ | 显式，图像空间 | 可见表面 | "像素 $(u, v)$ 看到什么？" | 相机没看到的一切 |
| 多平面图像 | 显式，图像空间 | 视锥内的体积 | 渲染附近的视角 | 大幅度的视角变化 |
| 点云 | 显式 | 表面采样 | "采样点在哪里？" | 内外判断、连接关系 |
| 三角网格 | 显式 | 表面 | 光栅化、测面积、贴纹理 | 内外判断、拓扑变化 |
| 体素占据 | 隐式，离散 | 体积 | "格子 $(i, j, k)$ 被占据吗？" | 亚体素精度 |
| 八叉树 | 隐式，离散，自适应 | 体积 | 同上，但内存更少 | 会改变树结构的更新 |
| SDF / TSDF 栅格 | 隐式，采样 | 体积（表面附近的带） | $\mathbf x$ 处的距离与法向 | 细薄结构、尖锐棱边 |
| 神经场 | 隐式，连续 | 体积 | 任意位置的 $f(\mathbf x)$，可微 | 快速查询、编辑 |
| 三维高斯 | 显式，软的 | 体积（密度） | 光栅化、可微 | 定义明确的表面 |

### 1.2 贯穿全文的例子：具有精确 SDF 的圆环

为了公平比较各种表示，我们需要一个精确已知真实表面的形状。我们使用绕 $z$ 轴的**圆环**（torus），环半径 $R = 1$，管半径 $r = 0.4$（单位可以想成米）。圆环是很好的测试形状：它有一个洞（亏格 1，所以它的网格欧拉示性数为 $0$），既有凸区域也有马鞍形区域，并且有闭式的有符号距离。对点 $\mathbf p = (x, y, z)$，令 $q = \sqrt{x^2 + y^2} - R$ 为水平面内到环圆的有符号距离。环圆上最近点的距离为 $\sqrt{q^2 + z^2}$，而表面是环圆周围半径为 $r$ 的管，所以

$$
f(\mathbf p) = \sqrt{q^2 + z^2} - r, \qquad q = \sqrt{x^2 + y^2} - R .
$$

内部 $f < 0$，外部 $f > 0$，$\lvert f \rvert$ 是到表面的欧氏距离。圆环面积为 $4\pi^2 R r$，体积为 $2\pi^2 R r^2$。

为了在表面上**均匀**采样（测量误差时需要），用绕环的角 $\varphi$ 和绕管的角 $\theta$ 参数化：$\mathbf p = \big((R + r\cos\theta)\cos\varphi,\ (R + r\cos\theta)\sin\varphi,\ r\sin\theta\big)$。面积元为 $r(R + r\cos\theta)\,d\theta\,d\varphi$：管的外侧（$\theta = 0$）比内侧面积大。若均匀抽取 $\theta$，点会挤在内侧，所以我们以正比于 $R + r\cos\theta$ 的概率接受均匀抽取的 $\theta$（拒绝采样）。

```python
import numpy as np

R_MAJ, R_MIN = 1.0, 0.4          # torus around the z axis: ring radius R, tube radius r


def sdf_torus(p):
    """Exact signed distance to the torus (negative inside); p has shape (..., 3)."""
    q = np.hypot(p[..., 0], p[..., 1]) - R_MAJ     # distance from the ring circle, in its plane
    return np.hypot(q, p[..., 2]) - R_MIN


def sample_torus(n, rng):
    """n points uniformly distributed over the surface, with their exact unit normals."""
    phi = rng.uniform(0, 2 * np.pi, 4 * n)          # angle around the ring
    th = rng.uniform(0, 2 * np.pi, 4 * n)           # angle around the tube
    # the area element is r (R + r cos th) dth dphi, so accept th with probability ~ R + r cos th
    keep = rng.uniform(0, R_MAJ + R_MIN, 4 * n) < R_MAJ + R_MIN * np.cos(th)
    phi, th = phi[keep][:n], th[keep][:n]
    nrm = np.stack([np.cos(th) * np.cos(phi), np.cos(th) * np.sin(phi), np.sin(th)], -1)
    ring = np.stack([R_MAJ * np.cos(phi), R_MAJ * np.sin(phi), np.zeros_like(phi)], -1)
    return ring + R_MIN * nrm, nrm


AREA = 4 * np.pi ** 2 * R_MAJ * R_MIN
VOLUME = 2 * np.pi ** 2 * R_MAJ * R_MIN ** 2
rng = np.random.default_rng(0)
P_true, N_true = sample_torus(200_000, rng)
print("area %.4f  volume %.4f" % (AREA, VOLUME))
print("max |sdf| at the samples: %.1e" % np.abs(sdf_torus(P_true)).max())
```

输出：`area 15.7914  volume 3.1583` 和 `max |sdf| at the samples: 3.3e-16`。下面所有误差测量中，这 200,000 个采样点 `P_true` 都代表精确表面。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-overview.svg" localized="true" caption="同一个圆环（$R = 1$，$r = 0.4$）的六种表示。点云：3000 个均匀表面采样，按高度着色。网格：$24 \times 12$ 的参数网格，288 个顶点、576 个三角形。体素：$[-1.5, 1.5]^3$ 上 $16^3$ 栅格中中心位于内部的格子（4096 个中的 472 个）。SDF：$z = 0$ 平面上的 $f$（红为内部，蓝为外部），实线为零水平集，虚线为水平集 $f = 0.2$ 和 $0.4$。高斯：拟合到表面采样的 100 个各向异性高斯（第 8 节），画在 $1.5\sigma$ 处。深度图：$160 \times 120$ 相机看到的放在桌面上的圆环（第 2 节）。" %}

## 2. 图像空间表示：深度图与多平面图像

### 2.1 深度、距离与逆深度

**深度图**（depth map）每个像素存一个数。约定很重要，因为有三种不同的数都叫"深度"：

- **$z$ 深度** $Z$：相机坐标系中沿光轴的坐标，即[第 1 篇]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }}) $\lambda\tilde{\mathbf u} = K[R \mid \mathbf t]\tilde{\mathbf X}$ 中的 $\lambda = Z\_c$。深度相机、双目（[第 7 篇]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})）和大多数数据集存的是它。
- **距离**（range）$\rho$：沿光线从相机中心到该点的欧氏距离。光线追踪器和 LiDAR 返回的是它；当光线方向为单位长度时，光线参数 $t$ 也是它。（原始 NeRF 代码不归一化光线方向，其 $z$ 分量为单位长度，所以它的 $t$ 是 $z$ 深度；使用任何代码库时都要核对其约定。）由于 $K^{-1}\tilde{\mathbf u}$ 的第三个分量为 1，该点为 $Z\,K^{-1}\tilde{\mathbf u}$，所以 $\rho = Z\,\lVert K^{-1}\tilde{\mathbf u}\rVert$。二者在主点处相等，在下面这台相机的图像角上相差 22.6%。
- **逆深度**（inverse depth，或**视差** disparity）$1/Z$：双目在基线 $b$ 下测得视差 $d = f b / Z$；许多网络预测逆深度，因为它有界（无穷远处为零），而且其误差比 $Z$ 的误差更接近均匀。

把 $Z$ 和 $\rho$ 混用会把平面弯成曲面。这种错误在图像中心附近很容易被忽略，在边缘处却很大。

### 2.2 反投影：从深度图到点

对一个深度为 $Z$ 的像素 $\tilde{\mathbf u} = (u, v, 1)^\top$，反转第 1 篇的投影：

$$
\mathbf X_c = Z\, K^{-1} \tilde{\mathbf u}, \qquad \mathbf X_w = R^\top(\mathbf X_c - \mathbf t),
$$

这里使用世界到相机的约定 $\mathbf X\_c = R\mathbf X\_w + \mathbf t$。每个有效像素给出一个三维点，所以深度图就是一个邻域结构已知（像素网格）的点云。

**算例。** 取 $f\_x = f\_y = 140$，$(c\_x, c\_y) = (79.5, 59.5)$（$160 \times 120$ 图像的中心，像素中心取整数坐标，同第 1 篇），角上的像素 $(0, 0)$ 有 $K^{-1}\tilde{\mathbf u} = (-0.568, -0.425, 1)$，$\lVert K^{-1}\tilde{\mathbf u}\rVert = 1.2260$。该处深度 $Z = 3$ m 对应距离 3.678 m，相机系中的点为 $(-1.704, -1.275, 3)$。

为了得到圆环的深度图，我们对 SDF 做**球体追踪**（sphere tracing，见[图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}））来渲染：从相机中心出发，沿每条光线以当前的 $f$ 值为步长前进。因为 $\lvert f \rvert$ 是到最近表面的距离，以它为半径的球内是空的，所以步子永远不会越过表面。为了让场景不那么平凡，圆环放在一块 4 m × 4 m 的平板上，场景的 SDF 是两个 SDF 的最小值。

```python
def look_at(C, target, up=(0.0, 0.0, 1.0)):
    """World-to-camera R, t (OpenCV: x right, y down, z forward) for a camera at C."""
    z = target - C; z = z / np.linalg.norm(z)
    x = np.cross(z, up); x = x / np.linalg.norm(x)
    y = np.cross(z, x)
    R = np.stack([x, y, z])                          # rows = camera axes in world coordinates
    return R, -R @ C


def render_depth(K, R, t, W, H, sdf, n_steps=96, s_max=10.0):
    """Depth map Z(u, v) by sphere tracing the SDF; inf where the ray misses."""
    u, v = np.meshgrid(np.arange(W, dtype=float), np.arange(H, dtype=float))
    rays = np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(K).T   # K^-1 (u, v, 1): z = 1
    d = rays @ R                                     # R^T * ray: directions in the world frame
    norm = np.linalg.norm(d, axis=-1, keepdims=True)
    d = d / norm
    C = -R.T @ t
    s = np.zeros((H, W))                             # distance travelled along each ray
    for _ in range(n_steps):
        s = s + sdf(C + s[..., None] * d)            # safe step: the SDF is 1-Lipschitz
    hit = np.abs(sdf(C + s[..., None] * d)) < 1e-4
    hit &= s < s_max
    return np.where(hit, s / norm[..., 0], np.inf), np.where(hit, s, np.inf)   # depth Z, range


def backproject(depth, K, R, t):
    """Pixels with finite depth -> world points: X_w = R^T (Z K^-1 (u, v, 1) - t)."""
    v, u = np.nonzero(np.isfinite(depth))
    Z = depth[v, u]
    Xc = (np.linalg.inv(K) @ np.stack([u, v, np.ones_like(u)])) * Z    # 3 x M, camera frame
    return (R.T @ (Xc - t[:, None])).T                                  # M x 3, world frame


def depth_normals(depth, K):
    """Camera-frame normals from a depth map: cross product of neighbouring 3D points."""
    H, W = depth.shape
    v, u = np.mgrid[0:H, 0:W]
    X = np.linalg.inv(K) @ np.stack([u.ravel(), v.ravel(), np.ones(H * W)])
    X = (X * depth.ravel()).T.reshape(H, W, 3)
    du = X[1:-1, 2:] - X[1:-1, :-2]                  # along +u (right)
    dv = X[2:, 1:-1] - X[:-2, 1:-1]                  # along +v (down)
    n = -np.cross(du, dv)                            # right x down points away: flip to the camera
    n = n / np.linalg.norm(n, axis=-1, keepdims=True)
    out_ = np.full((H, W, 3), np.nan)
    out_[1:-1, 1:-1] = n
    return out_
```

最后一个函数只用深度图估计法向。相邻像素给出两个切向量：右邻与左邻三维点之差、下邻与上邻三维点之差，它们的叉积垂直于表面。在 OpenCV 坐标系（$x$ 向右、$y$ 向下、$z$ 向前）中，"右 $\times$ 下"指向远离相机的方向，所以要取反。接下来是场景、相机和检查：

```python
def sdf_box(p, c, half):
    """Exact SDF of an axis-aligned box with centre c and half-sizes half."""
    q = np.abs(p - c) - half
    return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(-1), 0)


def sdf_scene(p):
    """The torus resting on a 4 m x 4 m slab (a table top)."""
    return np.minimum(sdf_torus(p), sdf_box(p, np.array([0, 0, -0.45]), np.array([2.0, 2.0, 0.05])))


W_IMG, H_IMG = 160, 120
K = np.array([[140.0, 0, 79.5], [0, 140.0, 59.5], [0, 0, 1]])
C_cam = np.array([0.6, -3.0, 1.8])
R_cam, t_cam = look_at(C_cam, np.zeros(3))
depth, rng_map = render_depth(K, R_cam, t_cam, W_IMG, H_IMG, sdf_scene)
pts = backproject(depth, K, R_cam, t_cam)
valid = np.isfinite(depth)
print("pixels hit: %d of %d, depth %.3f..%.3f m" % (valid.sum(), valid.size, depth[valid].min(), depth[valid].max()))
print("max |sdf| of back-projected points: %.1e" % np.abs(sdf_scene(pts)).max())
print("range / depth at the corner pixel: %.4f" % np.linalg.norm(np.linalg.inv(K) @ [0, 0, 1]))
with np.errstate(invalid="ignore"):
    nc = depth_normals(depth, K)                     # camera frame, NaN at the border and misses


def grad(f, p, e=1e-5):
    return np.stack([(f(p + e * d) - f(p - e * d)) / (2 * e) for d in np.eye(3)], -1)


v_, u_ = np.nonzero(valid)
n_true_c = np.full((H_IMG, W_IMG, 3), np.nan)
n_true_c[v_, u_] = grad(sdf_scene, pts) @ R_cam.T    # world -> camera: n_c = R n_w
ok = np.isfinite(nc).all(-1) & valid
ang = np.degrees(np.arccos(np.clip(np.sum(nc[ok] * n_true_c[ok], -1), -1, 1)))
print("normal error from depth: median %.2f deg, %.1f%% of pixels above 10 deg" % (np.median(ang), 100 * np.mean(ang > 10)))
print("float32 depth map: %.1f kB" % (W_IMG * H_IMG * 4 / 1000))
```

输出：

```text
pixels hit: 12065 of 19200, depth 2.288..5.115 m
max |sdf| of back-projected points: 7.7e-05
range / depth at the corner pixel: 1.2260
normal error from depth: median 0.02 deg, 2.7% of pixels above 10 deg
float32 depth map: 76.8 kB
```

反投影得到的点在球体追踪的容差范围内落在表面上。法向几乎处处准确，只有 2.7% 的像素例外，而它们全都位于**深度不连续处**：在圆环的轮廓上，左邻在圆环上而右邻在后面的桌面上，叉积给出毫无意义的法向。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-depth.svg" caption="左：桌面上圆环的深度图 $Z(u, v)$，$160 \times 120$ 像素，$f = 140$；白色像素在 10 m 内什么也没看到。中：由相邻像素叉积从深度图估计的法向，以颜色显示（相机坐标系）；黑色像素（有效像素的 2.7%）误差超过 10°，全部位于深度不连续处。右：用 $\mathbf X\_w = R^\top(Z K^{-1}\tilde{\mathbf u} - \mathbf t)$ 反投影的 12,065 个有效像素（显示 5000 个），以及相机视锥和坐标轴（$x$ 红、$y$ 绿、$z$ 蓝）。点随距离变稀：每个像素覆盖的面积正比于 $Z^2$。" %}

真实的深度传感器会让不连续处更糟。跨在边缘上的 ToF 或结构光像素常常返回介于前景和背景之间的深度：反投影后悬在半空中的**飞点**（flying pixel）。过滤掉与邻居深度相差很大、或者估计法向几乎垂直于光线的点，可以去掉其中大部分。

**代价。** $W \times H$ 像素的 float32 深度图占 $4WH$ 字节（这里是 76.8 kB），以毫米为单位的 16 位深度图占一半。它的优点：正是传感器测到的东西，邻域免费（像素网格），二维 CNN 可以直接处理。缺点：它只描述一个视角，第一个表面之后什么都没有。这就是多视图系统把许多深度图融合成体积表示的原因（第 6 节与[第 9 篇]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})）。

### 2.3 每个像素不止一个深度

深度图存的是每条光线上的*第一个*表面。有两种经典扩展保存得更多：

- **分层深度图像**（layered depth image，LDI；Shade 等，1998）每个像素存一小串（深度，颜色）样本：第一个表面、它后面的表面，依此类推。它可以渲染附近的视角，在第一层露出被遮挡物的地方不会出现空洞。
- **多平面图像**（multi-plane image，MPI；Zhou 等，2018）在参考相机中固定深度处存 $D$ 个正对相机的平面，每个平面是一幅完整的 RGBA 图像。渲染只需 alpha 合成，这使得 MPI 很容易用 CNN 预测，也是通往 NeRF 的垫脚石之一。

### 2.4 多平面图像

各平面**按逆深度均匀**放置。原因是视差：相机横向移动 $b$ 时，深度 $d$ 处的点移动 $f b / d$ 个像素，所以在 $1/d$ 上均匀分布的平面在像素位移上也是均匀的。从参考相机渲染 MPI 时，用"over"算子从前往后合成各平面。设 $\alpha\_i$ 为平面 $i$ 在该像素的不透明度、$\mathbf c\_i$ 为颜色（平面 $0$ 最近），则

$$
\mathbf c = \sum_{i=0}^{D-1} \mathbf c_i\, \alpha_i \prod_{j<i} (1 - \alpha_j) .
$$

这与 NeRF 体渲染的求积公式（[神经渲染第 2 篇]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})）相同，只是采样点固定在平面上。渲染**新视角**时，把每个平面变换到新相机中再合成。参考坐标系中深度为 $d$、法向为 $\mathbf n$ 的平面诱导一个单应：对于相对参考相机为 $\mathbf X' = R\mathbf X + \mathbf t$ 的新相机，平面上的点满足 $\mathbf n^\top\mathbf X = d$，于是 $\mathbf t = \mathbf t\,\mathbf n^\top\mathbf X / d$，从而

$$
\tilde{\mathbf u}' \sim K\Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)K^{-1}\tilde{\mathbf u} .
$$

这正是[第 2 篇]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})的平面单应，只是从一台相机换成了两台；[第 4 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})在两视图几何中会再次遇到它。$\mathbf t\,\mathbf n^\top$ 项的符号取决于平面方程写成 $\mathbf n^\top\mathbf X = d$ 还是 $\mathbf n^\top\mathbf X + d = 0$，务必用数值检查。

```python
def mpi_planes(near, far, D):
    """D fronto-parallel planes, evenly spaced in inverse depth (disparity)."""
    return 1.0 / np.linspace(1.0 / near, 1.0 / far, D)


def composite(rgb, alpha):
    """Front-to-back 'over' compositing of D layers (index 0 = nearest)."""
    T = np.cumprod(np.concatenate([[1.0], 1.0 - alpha[:-1]]))   # transmittance in front of layer i
    w = T * alpha
    return (w[:, None] * rgb).sum(0), w


d_planes = mpi_planes(1.0, 100.0, 32)
print("plane depths:", np.round(d_planes[:4], 3), "...", np.round(d_planes[-3:], 1))
f_px, base = 500.0, 0.1
print("disparity step between planes: %.2f px" % (f_px * base * (1 / d_planes[0] - 1 / d_planes[1])))
c_ray, w_ray = composite(np.array([[1.0, 0, 0], [0, 1.0, 0], [0, 0, 1.0]]), np.array([0.3, 0.5, 1.0]))
print("composited colour:", c_ray, "weights:", w_ray)
```

输出：平面深度 `[1. 1.033 1.068 1.106] ... [13.5 23.8 100.]`；在 $f = 500$ px、基线 10 cm 下，相邻平面的视差步长为 `1.60 px`；对不透明度为 $0.3, 0.5, 1$ 的三层，权重为 $0.3, 0.35, 0.35$。32 个平面中有一半位于最初的 2 m 以内：逆深度间隔把平面花在视差大的地方。

插图用第 2.2 节的 RGB-D 图像构建一个小 MPI。逆深度落在平面 $i$ 与 $i+1$ 之间的像素，以 $\alpha = 1$ 放入平面 $i+1$，以 $\alpha = w$ 放入平面 $i$（$w$ 是在逆深度上朝平面 $i$ 走过的比例），两者都用该像素的颜色，这样合成后能精确重现参考图像。然后把相机向右移动 0.5 m，让每条新光线与每个平面求交来渲染 MPI。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-mpi.svg" caption="由第 2.2 节 RGB-D 图像构建的 16 平面 MPI，平面从 2.2 m 到 6 m 按逆深度均匀分布。第二幅：棋盘格背景（透明）上的四个 RGBA 平面。第三幅：从向右 0.5 m 的相机渲染的 MPI；洋红色像素（12.7%）在所有平面上都是透明的：参考视角中被圆环挡住的桌面部分，以及参考视场以外的竖条。其余区域与光线追踪的视图（右）相比，平均颜色误差为 0.006，1.7% 的像素差异超过 0.1，主要在圆环轮廓上，那里两个混合的平面分离开来。" %}

洋红色空洞是根本性的限制。由一幅 RGB-D 图像构建的 MPI 不包含参考相机没看到的任何东西。学习式 MPI 会为被遮挡的层预测合理的内容，这正是它们在从立体图像对合成新视角时有用的原因。

## 3. 点云

### 3.1 点云是什么

**点云**（point cloud）是集合 $\\{\mathbf p\_i\\}\_{i=1}^n$，$\mathbf p\_i \in \mathbb R^3$，常带有属性：颜色、强度（LiDAR）、法向 $\mathbf n\_i$、时间戳。LiDAR、反投影的深度图（第 2.2 节）和 SfM（[第 5 篇]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})）产生的都是点云。它的两个性质决定了对它所做的一切：

- 它是**集合**：点的顺序不携带任何信息。任何用来描述形状的点云函数都必须对排列不变（第 12 节）。
- 它**没有连接关系**。哪些点是邻居、哪一侧是内部、两个相近的点是在同一片曲面上还是在两片靠得很近的曲面上（薄墙的两面），这些都没有存储。

float32 坐标的内存为 $12n$ 字节，外加属性。面元（surfel，surface element；Pfister 等，2000）给每个点加上法向和半径，把它变成一个可以无洞渲染的小定向圆盘。稠密 SLAM 中会用到面元地图。

### 3.2 邻域、法向与降采样

几乎所有点云算法都从**最近邻查询**开始：$k$ 个最近点，或半径 $\varepsilon$ 内的所有点。k-d 树（`scipy.spatial.cKDTree`，C++ 中的 nanoflann）大致以对数时间回答这些查询。法向通过对邻居拟合平面来估计（$3 \times 3$ 邻域协方差的 PCA，取最小特征向量），然后统一定向；[图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})有推导。

原始点云往往太密或密度不均，所以要**降采样**：

- **体素栅格降采样**在间距为 $s$ 的栅格的每个被占据格子中保留一个点（通常是质心）。它很快，并使密度在间距 $s$ 上大致均匀。
- **最远点采样**（farthest point sampling，FPS）任意选第一个点，然后反复选出离已选点最远的点。结果均匀覆盖形状。选 $m$ 个样本的代价为 $O(nm)$；PointNet++ 用它选取局部区域的中心（第 12 节）。

### 3.3 衡量点云：Chamfer 距离与 F-score

要把重建 $A$ 与参考 $B$（都是点集）比较，先定义点到集合的距离 $d(\mathbf a, B) = \min\_{\mathbf b \in B}\lVert \mathbf a - \mathbf b\rVert$。于是：

- **准确度**（accuracy）问重建离真值有多近：$\mathbf a \in A$ 的距离 $d(\mathbf a, B)$。**完整度**（completeness）问真值被覆盖了多少：$\mathbf b \in B$ 的距离 $d(\mathbf b, A)$。
- **Chamfer 距离**把两个方向平均。约定各不相同（两个方向求和或求平均，距离是否平方），所以一定要说明用的是哪种。我们用两个方向平均距离的平均：

$$
\mathrm{CD}(A, B) = \frac12\Big(\frac{1}{\lvert A\rvert}\sum_{\mathbf a \in A} d(\mathbf a, B) + \frac{1}{\lvert B\rvert}\sum_{\mathbf b \in B} d(\mathbf b, A)\Big).
$$

- 阈值 $\tau$ 下的 **F-score**（Knapitsch 等，2017，Tanks and Temples 基准）使用精确率 $P(\tau)$（$A$ 中离 $B$ 在 $\tau$ 以内的比例）和召回率 $R(\tau)$（$B$ 中离 $A$ 在 $\tau$ 以内的比例），报告 $F = 2PR/(P + R)$。它不像 Chamfer 平均那样被少数远离的外点主导，而且能分别说明问题出在错误的点还是缺失的点。

```python
from scipy.spatial import cKDTree


def chamfer_fscore(A, B, tau):
    """Symmetric Chamfer distance and F-score at threshold tau between point sets A and B."""
    d_ab = cKDTree(B).query(A)[0]                    # every point of A to its nearest point in B
    d_ba = cKDTree(A).query(B)[0]
    precision = np.mean(d_ab < tau)                  # how much of A lies near B (accuracy)
    recall = np.mean(d_ba < tau)                     # how much of B is covered by A (completeness)
    f = 2 * precision * recall / max(precision + recall, 1e-12)
    return 0.5 * (d_ab.mean() + d_ba.mean()), precision, recall, f


ref = P_true                                          # 200k exact samples stand in for the surface
rng = np.random.default_rng(1)
cases = {
    "2k exact": sample_torus(2_000, rng)[0],
    "20k exact": sample_torus(20_000, rng)[0],
    "20k noisy": sample_torus(20_000, rng)[0] + rng.normal(0, 0.02, (20_000, 3)),
}
hole = sample_torus(20_000, rng)[0]
cases["20k, hole"] = hole[hole[:, 0] < 0.8]          # a scanner never saw the +x side
for name, A in cases.items():
    cd, p, r, f = chamfer_fscore(A, ref, tau=0.02)
    print("%-10s n=%6d  CD=%.4f  precision=%.3f recall=%.3f F=%.3f" % (name, len(A), cd, p, r, f))


def farthest_point_sampling(P, m, first=0):
    """Greedy FPS: each new sample is the point farthest from all samples chosen so far."""
    idx = np.zeros(m, dtype=int); idx[0] = first
    d = np.linalg.norm(P - P[first], axis=1)
    for i in range(1, m):
        idx[i] = np.argmax(d)
        d = np.minimum(d, np.linalg.norm(P - P[idx[i]], axis=1))
    return idx


cloud = sample_torus(20_000, np.random.default_rng(2))[0]
i_fps = farthest_point_sampling(cloud, 256)
i_rnd = np.random.default_rng(3).choice(len(cloud), 256, replace=False)
for name, idx in (("random", i_rnd), ("FPS", i_fps)):
    gap = cKDTree(cloud[idx]).query(cloud)[0]        # distance of every point to its nearest sample
    print("%-6s 256 samples: mean gap %.3f, largest gap %.3f" % (name, gap.mean(), gap.max()))
```

输出：

```text
2k exact   n=  2000  CD=0.0247  precision=1.000 recall=0.146 F=0.255
20k exact  n= 20000  CD=0.0092  precision=1.000 recall=0.795 F=0.886
20k noisy  n= 20000  CD=0.0184  precision=0.667 recall=0.538 F=0.596
20k, hole  n= 16116  CD=0.0399  precision=1.000 recall=0.643 F=0.783
random 256 samples: mean gap 0.118, largest gap 0.328
FPS    256 samples: mean gap 0.096, largest gap 0.193
```

逐行阅读这张表。精确采样的精确率完美，但 2000 个点使大部分表面离任何采样点都超过 $\tau = 0.02$，所以召回率很低：**稀疏但正确的点云会被判为不完整**。$\sigma = 0.02$ 的噪声同时损害精确率和召回率。空洞只损害召回率，但它使 Chamfer 距离的增加比噪声还多，因为缺失区域贡献了很大的距离。最后两行表明，同样 256 个点，FPS 把最大间隙从 0.328 降到 0.193。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-point-clouds.svg" localized="true" caption="左、中：从 20,000 个表面采样中随机选出和用最远点采样选出的 256 个点（红色）；灰色点云按到最近选中点的距离着色（越深间隙越大）。随机采样留下了团簇和空洞（最大间隙 0.328），FPS 把点均匀铺开（0.193）。右：四种重建相对于 200,000 个参考采样在 $\tau = 0.02$ 下的精确率、召回率和 F-score：2000 个精确采样、20,000 个精确采样、带 $\sigma = 0.02$ 高斯噪声的 20,000 个采样，以及去掉 $x > 0.8$ 区域的 20,000 个采样。" %}

## 4. 网格

### 4.1 结构与拓扑

**三角网格**（triangle mesh）由顶点数组 $V \in \mathbb R^{n\_V \times 3}$ 和顶点索引组成的面数组 $F \in \mathbb N^{n\_F \times 3}$ 构成（[图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})讲了半边结构、流形性和欧拉示性数 $\chi = V - E + F$）。与点云相比，网格增加了**连接关系**，从而在采样点之间有了曲面：可以测量面积、无洞地光栅化、参数化并贴纹理、在其上做仿真。所以大多数重建流程的最终输出、每个游戏引擎的输入都是网格。

代价是**拓扑**。网格固定了曲面的连接方式。合并两团形状或打开一个洞都需要重新划分网格。因此必须自由改变形状的优化方法（融合、神经场）使用隐式函数，只在最后用 Marching Cubes 提取网格。

### 4.2 网格有多精确？

顶点恰好位于光滑曲面上的网格是一个分段线性插值，它的误差就是**弓高**（sagitta）：长为 $s$ 的弦横跨半径为 $\rho$ 的圆时，与圆弧的最大偏离为

$$
\delta = \rho\big(1 - \cos(\Delta/2)\big) \approx \frac{s^2}{8\rho}, \qquad \Delta \text{ 为弦所张的角}, \ s = 2\rho\sin(\Delta/2) \approx \rho\Delta .
$$

所以误差随边长的**平方**下降。面积为 $A$、边长为 $s$ 的曲面需要的三角形数为 $F \approx 2A/(\tfrac{\sqrt 3}{2}s^2) \propto s^{-2}$，因此 $\delta \propto F^{-1}$：三角形数翻倍，误差减半。我们把圆环按角度 $(\varphi, \theta)$ 划成 $n \times m$ 的网格，最大的鼓出来自外赤道（半径 $R + r$ 的圆被分成 $n$ 段弦），再加上半径 $r$ 的管截面圆被分成 $m$ 段弦：$\delta\_{\max} \lesssim (R + r)(1 - \cos\frac{\pi}{n}) + r(1 - \cos\frac{\pi}{m})$。

为了测量误差，我们还需要**在网格上均匀采样**，这也是所有基准把网格与点云比较的方法。按面积比例的概率选一个三角形，然后取重心坐标 $(1 - \sqrt{s},\ \sqrt{s}(1 - t),\ \sqrt{s}\,t)$ 的点，其中 $s, t$ 在 $[0, 1]$ 上均匀；平方根补偿了三角形在顶点附近更窄这一点。

```python
def torus_mesh(n, m):
    """Triangle mesh of the torus: n segments around the ring, m around the tube."""
    PH, TH = np.meshgrid(2 * np.pi * np.arange(n) / n, 2 * np.pi * np.arange(m) / m, indexing="ij")
    rho = R_MAJ + R_MIN * np.cos(TH)
    V = np.stack([rho * np.cos(PH), rho * np.sin(PH), R_MIN * np.sin(TH)], -1).reshape(-1, 3)
    i, j = np.meshgrid(np.arange(n), np.arange(m), indexing="ij")
    a, b = i * m + j, (i + 1) % n * m + j            # the four corners of quad (i, j)
    c, d = (i + 1) % n * m + (j + 1) % m, i * m + (j + 1) % m
    F = np.concatenate([np.stack([a, b, c], -1).reshape(-1, 3), np.stack([a, c, d], -1).reshape(-1, 3)])
    return V, F


def sample_mesh(V, F, n, rng):
    """n points uniformly distributed over the mesh area (area-weighted face choice)."""
    A, B, C = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(B - A, C - A), axis=1)
    f = rng.choice(len(F), n, p=area / area.sum())
    s, t = np.sqrt(rng.uniform(size=n)), rng.uniform(size=n)   # sqrt makes it uniform in area
    return ((1 - s)[:, None] * A[f] + (s * (1 - t))[:, None] * B[f] + (s * t)[:, None] * C[f]), area.sum()


rng = np.random.default_rng(4)
for n, m in ((12, 6), (24, 12), (48, 24), (96, 48)):
    V, F = torus_mesh(n, m)
    S, area = sample_mesh(V, F, 200_000, rng)
    sag = (R_MAJ + R_MIN) * (1 - np.cos(np.pi / n)) + R_MIN * (1 - np.cos(np.pi / m))
    print("n=%2d m=%2d  V=%5d F=%5d  %6.1f kB  area err %+.2f%%  max dev %.4f (sag bound %.4f)  mean dev %.4f"
          % (n, m, len(V), len(F), (12 * len(V) + 12 * len(F)) / 1000, 100 * (area / AREA - 1),
             np.abs(sdf_torus(S)).max(), sag, np.abs(sdf_torus(S)).mean()))
V, F = torus_mesh(24, 12)
E = np.unique(np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1), axis=0)
print("Euler characteristic V - E + F = %d - %d + %d = %d" % (len(V), len(E), len(F), len(V) - len(E) + len(F)))
```

输出：

```text
n=12 m= 6  V=   72 F=  144     2.6 kB  area err -7.20%  max dev 0.0923 (sag bound 0.1013)  mean dev 0.0436
n=24 m=12  V=  288 F=  576    10.4 kB  area err -1.84%  max dev 0.0250 (sag bound 0.0256)  mean dev 0.0114
n=48 m=24  V= 1152 F= 2304    41.5 kB  area err -0.46%  max dev 0.0064 (sag bound 0.0064)  mean dev 0.0029
n=96 m=48  V= 4608 F= 9216   165.9 kB  area err -0.12%  max dev 0.0016 (sag bound 0.0016)  mean dev 0.0007
Euler characteristic V - E + F = 288 - 864 + 576 = 0
```

$n$ 和 $m$ 每翻一倍，三角形数乘以 4，误差除以 4，与弓高的预测完全一致。面积总是偏小，因为弦从弯曲表面的内侧切过。欧拉示性数为 0，圆环理应如此。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-mesh.svg" caption="$12 \times 6$、$24 \times 12$ 和 $48 \times 24$ 个四边形（每个两个三角形）的圆环网格，按各三角形质心到真实表面的距离着色；误差在环圆最大的外赤道上最大。右：100,000 个按面积加权的采样中的最大偏差与三角形数 $F$ 的关系，从 $6 \times 3$ 到 $192 \times 96$，虚线为弓高界，点线为斜率 $F^{-1}$。$F = 9216$（166 kB）时最大误差为 0.0016，是管半径的 0.4%。" %}

两点实践提示。**自适应网格**在曲率大的地方用小三角形、平坦处用大三角形；$F^{-1}$ 律仍然成立，但常数更小，网格简化（[图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})中的二次误差度量）做的就是这件事。另外，重建得到的网格很少完美：有空洞、翻转的面、非流形边和自相交。在 3D 打印或仿真之前，首先要做"水密"检查（每条边恰好被两个面共享）。

## 5. 体素、占据栅格与八叉树

### 5.1 稠密占据栅格

把包围盒分成边长为 $h$ 的 $N^3$ 个立方体，每个存一个值。在**占据栅格**（occupancy grid）中，这个值表示立方体是否在物体内部（在机器人学中则是是否被障碍物占据）。最简单的规则是：中心在内部（$f(\mathbf c\_{ijk}) < 0$）则体素被占据。体素是像素的三维对应物：结构规则，查找只需一次索引计算，邻居是 $(i \pm 1, j, k)$，三维 CNN 可以对它做卷积。

```python
import itertools

LO, HI = -1.5, 1.5                                   # the cube that holds the torus


def grid_centres(N):
    h = (HI - LO) / N
    c = LO + h * (np.arange(N) + 0.5)
    return np.stack(np.meshgrid(c, c, c, indexing="ij"), -1), h


for N in (16, 32, 64, 128):
    X, h = grid_centres(N)
    occ = sdf_torus(X) < 0                           # occupancy: is the voxel centre inside?
    pad = np.pad(occ, 1)
    nb_empty = sum(~np.roll(pad, s, a)[1:-1, 1:-1, 1:-1] for a in range(3) for s in (-1, 1))
    surf = occ & (nb_empty > 0)                      # occupied with an empty face neighbour
    print("N=%3d  occupied %7d (%.2f%%)  surface %6d  volume err %+.2f%%  bits %7.1f kB  floats %8.1f kB"
          % (N, occ.sum(), 100 * occ.mean(), surf.sum(), 100 * (occ.sum() * h ** 3 / VOLUME - 1),
             N ** 3 / 8 / 1000, 4 * N ** 3 / 1000))
```

循环打印：

```text
N= 16  occupied     472 (11.52%)  surface    312  volume err -1.49%  bits     0.5 kB  floats     16.4 kB
N= 32  occupied    3784 (11.55%)  surface   1408  volume err -1.28%  bits     4.1 kB  floats    131.1 kB
N= 64  occupied   30544 (11.65%)  surface   5928  volume err -0.39%  bits    32.8 kB  floats   1048.6 kB
N=128  occupied  245408 (11.70%)  surface  24144  volume err +0.04%  bits   262.1 kB  floats   8388.6 kB
```

两点观察。第一，即使在 $N = 16$，**体积**也估计得很好（误差 1.5%），因为表面两侧的误差相互抵消。**表面**位置则是另一回事：体素边界是阶梯，它到真实表面的平均距离略低于 $h/4$，在台阶的角上最大约 $0.8h$（至多 $\sqrt 3\, h/2$），所以误差减半需要 8 倍的内存（第 6 节会测量）。第二，表面体素的数量按 $N^2$ 增长（每往下一行翻四倍），而栅格按 $N^3$ 增长。在 $N = 128$ 时，只有 1% 的体素接触表面。稠密栅格几乎把全部内存都花在空白空间和内部上，而存 float32 值而不是比特还要再贵 32 倍。

### 5.2 概率占据与对数几率

机器人地图并不确定地知道占据状态。每个体素存储它被占据的概率 $p$，并由传感器光线更新：光线*终止*处的体素是"占据"的证据，光线*穿过*的体素是"空闲"的证据。对独立观测，贝叶斯法则在**对数几率**（log-odds）$l = \log\frac{p}{1 - p}$ 中变成加法：

$$
l \leftarrow l + \log\frac{P(\text{occ} \mid z)}{1 - P(\text{occ} \mid z)} - l_0 ,
$$

其中 $l\_0$ 是先验（$p = 0.5$ 时为 0）。对于传感器模型 $P(\text{occ} \mid \text{hit}) = 0.7$、$P(\text{occ} \mid \text{pass}) = 0.4$，一次命中加 $\log(0.7/0.3) = 0.847$，一次穿过加 $\log(0.4/0.6) = -0.405$。把 $l$ 截断在某个区间（这里是 $[-2, 3.5]$）使地图在世界变化时仍能改变。第 5.3 节代码块的最后几行打印三次命中之后一次穿过的结果：

```text
hit  l = +0.847  p = 0.700
hit  l = +1.695  p = 0.845
hit  l = +2.542  p = 0.927
miss l = +2.136  p = 0.894
```

OctoMap（Hornung 等，2013）存储的正是这个量，只是放在八叉树里。

### 5.3 八叉树：把内存花在表面所在之处

**八叉树**（octree）从一个立方体开始，只在需要时把立方体分成 8 个子立方体。对于曲面，"需要"指曲面可能穿过该立方体。SDF 免费回答了这个问题：因为 $\lvert f \rvert$ 是距离，若立方体中心处的 $\lvert f(\mathbf c)\rvert$ 超过半对角线 $\sqrt 3\, h/2$，立方体内就没有任何表面点。这与保证球体追踪安全的 Lipschitz 论证相同。

```python
OFFS = np.array(list(itertools.product((-1, 1), repeat=3)), float)   # the 8 child directions


def octree_levels(sdf, max_depth):
    """Node count per level of an octree that only splits cells the surface may cross."""
    centres, half = np.zeros((1, 3)), (HI - LO) / 2
    counts = []
    for depth_ in range(max_depth + 1):
        counts.append(len(centres))
        if depth_ == max_depth:
            break
        # 1-Lipschitz SDF: if |f(centre)| > half-diagonal, the surface cannot enter the cell
        cross = np.abs(sdf(centres)) <= np.sqrt(3) * half
        centres = (centres[cross][:, None, :] + 0.5 * half * OFFS[None]).reshape(-1, 3)
        half = half / 2
    return counts


cnt = octree_levels(sdf_torus, 8)
print("octree nodes per level:", cnt)
print("total %d nodes vs %d dense voxels at 256^3 (%.2f%%)" % (sum(cnt), 256 ** 3, 100 * sum(cnt) / 256 ** 3))


def logodds(p):
    return np.log(p / (1 - p))


l_hit, l_miss = logodds(0.7), logodds(0.4)           # sensor model: P(occ | hit), P(occ | pass-through)
l = 0.0                                              # prior p = 0.5
for z in ("hit", "hit", "hit", "miss"):
    l = np.clip(l + (l_hit if z == "hit" else l_miss), -2.0, 3.5)
    print("%-4s l = %+.3f  p = %.3f" % (z, l, 1 / (1 + np.exp(-l))))
```

输出：各层节点数 `[1, 8, 64, 256, 1664, 6784, 25728, 95936, 402176]`，总计 `532617 nodes vs 16777216 dense voxels at 256^3 (3.17%)`。从第 5 层起，每层节点数约为上一层的 4 倍而不是 8 倍：八叉树随表面积增长，即 $4^L$，而稠密栅格随体积增长，即 $8^L$。树越深，格子数上的节省越多。

至于能否节省*字节*，取决于一个稠密格子的代价。基于指针的节点要占好几个字节；按每节点 8 字节计，深到第 7 层（130,441 个节点，相当于 $128^3$ 栅格的分辨率）的八叉树占 1.04 MB，是按比特打包的 $128^3$ 占据栅格（262 kB）的四倍，却只有 $128^3$ float32 栅格（8.4 MB）的八分之一。机器人地图每个格子存一个浮点对数几率，TSDF 存距离和权重，所以与它们原本需要的栅格相比，八叉树立刻胜出，而且每多一层，优势再扩大一倍。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-octree.svg" localized="true" caption="左：圆环截面 $y = 0$（两个半径 0.4 的圆盘）的四叉树（二维的八叉树），只在半对角线测试表明边界可能进入格子时才细分，直到深度 6：448 个叶子，而不是 $64^2 = 4096$ 个格子。右：三维八叉树（深度 8，最细格子 $3/256 \approx 0.012$）各层的节点数，与稠密栅格的 $8^L$ 个格子对比；八叉树遵循 $4^L$，即面积的增长率。第 8 层：402,176 个节点对 1680 万个。" %}

节省是有代价的。查找要从根开始沿指针走（$L$ 步而不是一次索引），找邻居更难，插入数据可能改变树的结构。GPU 系统常常偏好更扁平的方案：**体素哈希**（voxel hashing；Nießner 等，2013）只在观测到的表面附近分配小的稠密体素块，并通过以块坐标为键的哈希表找到它们。查找保持 $O(1)$，内存跟随表面，相当于只有一层间接的八叉树。第 10 节测量了这种"稀疏块"布局。

## 6. 有符号距离场与 TSDF

### 6.1 为什么存距离而不是占据

SDF 在每个栅格顶点存储有符号距离 $f$，而不是一个比特。距离栅格不仅告诉你表面*是否*在两个顶点之间，还告诉你*在哪里*：沿着从 $f\_a < 0$ 到 $f\_b > 0$ 的边，零点位于比例 $t = f\_a/(f\_a - f\_b)$ 处，与 Marching Squares 和 Marching Cubes（[图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})）完全相同。顶点之间的场用**三线性插值**重建。对格内小数坐标为 $(\xi, \eta, \zeta) \in [0, 1]^3$、角点值为 $f\_{abc}$（$a, b, c \in \\{0, 1\\}$）的点，

$$
\hat f = \sum_{a, b, c \in \{0, 1\}} f_{abc}\; \xi^{a}(1 - \xi)^{1-a}\, \eta^{b}(1 - \eta)^{1-b}\, \zeta^{c}(1 - \zeta)^{1-c} .
$$

对光滑函数做线性插值，误差正比于 $h^2$ 乘以二阶导数。距离场沿梯度方向是线性的，所以误差只来自表面的曲率，$\hat f$ 的零水平集通常离真实表面只有体素的一小部分：**同样的 $N^3$ 栅格得到亚体素精度**。占据栅格丢掉了这个信息，其误差正比于 $h$。

```python
def sdf_grid(N):
    """The SDF sampled at the (N+1)^3 vertices of an N^3 grid."""
    g = np.linspace(LO, HI, N + 1)
    return sdf_torus(np.stack(np.meshgrid(g, g, g, indexing="ij"), -1)), (HI - LO) / N


def trilinear(G, h, p):
    """Trilinear interpolation of grid values G at points p (M x 3)."""
    s = (p - LO) / h
    i = np.clip(np.floor(s).astype(int), 0, G.shape[0] - 2)
    f = s - i
    val = 0.0
    for c in itertools.product((0, 1), repeat=3):
        w = np.prod([f[:, k] if c[k] else 1 - f[:, k] for k in range(3)], axis=0)
        val = val + w * G[i[:, 0] + c[0], i[:, 1] + c[1], i[:, 2] + c[2]]
    return val


def zero_crossings(G, h):
    """Points where the field changes sign along grid edges: the vertices marching cubes places."""
    out_ = []
    for ax in range(3):
        f0 = np.take(G, np.arange(G.shape[ax] - 1), axis=ax)
        f1 = np.take(G, np.arange(1, G.shape[ax]), axis=ax)
        idx = np.argwhere((f0 < 0) != (f1 < 0))
        a, b = f0[tuple(idx.T)], f1[tuple(idx.T)]
        p = idx.astype(float)
        p[:, ax] += a / (a - b)                      # linear interpolation along the edge
        out_.append(LO + h * p)
    return np.concatenate(out_)


G16, h16 = sdf_grid(16)
x_q = np.array([[0.62, 0.05, 0.11]])
print("at", x_q[0], ": trilinear %.4f, exact %.4f" % (trilinear(G16, h16, x_q)[0], sdf_torus(x_q)[0]))
for N in (16, 32, 64, 128):
    G, h = sdf_grid(N)
    Z = zero_crossings(G, h)
    print("N=%3d  h=%.4f  crossings %6d  mean |sdf| %.5f  max %.5f  |f_hat| at true surface: mean %.5f"
          % (N, h, len(Z), np.abs(sdf_torus(Z)).mean(), np.abs(sdf_torus(Z)).max(),
             np.abs(trilinear(G, h, P_true)).mean()))
print("TSDF band: voxels with |sdf| < 3h at N=128: %.2f%% of the grid"
      % (100 * np.mean(np.abs(sdf_grid(128)[0]) < 3 * 3.0 / 128)))
```

输出：

```text
at [0.62 0.05 0.11] : trilinear -0.0001, exact -0.0063
N= 16  h=0.1875  crossings    720  mean |sdf| 0.00248  max 0.00914  |f_hat| at true surface: mean 0.00746
N= 32  h=0.0938  crossings   2664  mean |sdf| 0.00058  max 0.00266  |f_hat| at true surface: mean 0.00186
N= 64  h=0.0469  crossings  10392  mean |sdf| 0.00014  max 0.00067  |f_hat| at true surface: mean 0.00046
N=128  h=0.0234  crossings  42168  mean |sdf| 0.00004  max 0.00017  |f_hat| at true surface: mean 0.00012
TSDF band: voxels with |sdf| < 3h at N=128: 8.03% of the grid
```

零点（即 Marching Cubes 会生成的顶点）在 $N = 16$ 时平均偏离真实表面 0.00248，是一个体素的 1.3%；$h$ 每减半，误差约除以 4。反过来，在真实表面（精确 $f$ 为零处）上求插值场 $\hat f$，$N = 16$ 时偏差为 0.00746，同样按 $h^2$ 下降。单个查询点显示了同样的效应：在管内侧略靠里的一点，在相距 $0.19$ 的顶点之间插值，偏差为 $0.006$。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-sdf-vs-occupancy.svg" localized="true" caption="圆环截面 $y = 0$（两个半径 0.4 的圆盘），分辨率 $16^3$。左：占据，即中心在内部的体素；边界是阶梯。中：在该平面 $17^2$ 个栅格顶点（点）上采样的 SDF，经双线性插值，其零水平集（橙色）叠在真实圆（虚线，几乎被遮住）上。右：三维中平均双向表面误差与体素边长 $h$ 的关系。占据保持在 $h/5$ 附近，介于 $0.17h$ 与 $0.22h$ 之间（$N = 16$ 时 0.032，$N = 128$ 时 0.0046）；插值后的 SDF 遵循 $h^2$（$N = 8$ 时 0.020，$N = 128$ 时 0.00008）。" %}

代价是内存（每个顶点 32 比特，而不是每个体素 1 比特），以及两个局限。比大约两个体素更**细的结构**可能消失，因为没有顶点落在其内部，符号从不改变。**尖锐的棱边和角**会被磨圆，因为三线性插值无法在格内表示折痕（Dual Contouring 等 Marching Cubes 的变体会存储梯度来解决这个问题）。

SDF 还有两个在实践中很重要的优点。它的梯度就是表面法向 $\mathbf n = \nabla f / \lVert \nabla f\rVert$，处处可得，而不只是在表面上。它几乎处处满足**程函方程**（eikonal equation）$\lVert\nabla f\rVert = 1$，神经 SDF 把这个约束用作正则项（第 7 节）。

### 6.2 截断 SDF

当 SDF 由深度图构建时（如 KinectFusion（Newcombe 等，2011）及其所基于的 Curless 与 Levoy（1996）的体积方法），我们并不知道到表面的真实距离，只知道沿每条相机光线的**投影距离**：对投影到像素 $(u, v)$ 的体素 $\mathbf x$，为 $Z\_{\text{measured}}(u, v) - Z\_c(\mathbf x)$。它只在表面附近才是有符号距离的好近似；在表面后方很远处毫无意义（那里从未被观测）。所以要把值**截断**：

$$
\text{TSDF}(\mathbf x) = \mathrm{clamp}\Big(\frac{Z_{\text{measured}}(u, v) - Z_c(\mathbf x)}{\mu},\ -1,\ 1\Big),
$$

截断距离 $\mu$ 取几个体素。每个体素还存一个权重，新深度图通过加权滑动平均融合；[第 7 篇]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})推导了融合过程，[第 9 篇]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})带着交互组件完整地跑一遍。（符号约定各不相同：这里 TSDF 在表面前方、即自由空间中为正，在表面后方为负，与外部为正的 SDF 一致。）

截断带来了内存上的后果。只有离表面 $\mu$ 以内的体素携带信息，所以只需存储这些体素。在我们的圆环中，$N = 128$ 时离表面 $3h$ 以内的体素占栅格的 8.03%。体素哈希正是以 $8^3$ 的块存储这条带，第 10 节显示了它带来的收益。

完整的、不截断的距离场（欧氏 SDF，**ESDF**）是运动规划器需要的，因为它们要知道自由空间中任意一点到最近障碍物的距离。Voxblox（Oleynikova 等，2017）为无人机规划从 TSDF 增量地构建 ESDF。

## 7. 神经场

### 7.1 作为空间函数的网络

**神经场**（neural field）不在栅格上采样 $f$，而是用网络 $f\_\theta : \mathbb R^3 \to \mathbb R$（或输出占据、密度和颜色）来表示它：输入坐标，输出值。主要的几类：

- **占据网络**（Occupancy Networks；Mescheder 等，2019）输出 $\mathbf x$ 在内部的概率；表面是该概率在阈值 $\tau$（例如 $0.5$）处的水平集。
- **DeepSDF**（Park 等，2019）输出有符号距离。它用每个形状的隐编码 $\mathbf z$ 对网络加条件，$f\_\theta(\mathbf x, \mathbf z)$，于是一个网络表示整个类别的形状，拟合新形状只需优化 $\mathbf z$。
- **NeRF**（Mildenhall 等，2020）输出密度和依赖视角的颜色，通过从图像做体渲染来训练（[神经渲染第 2 篇]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})）。它的几何是密度场而不是曲面；[第 9 篇]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})中 NeuS 一类方法把它变回 SDF。

它们的共同点是：表示是**连续的**（任意 $\mathbf x$、任意分辨率都可查询）、对 $\mathbf x$ 和 $\theta$ 都**可微**（因此可以通过渲染器拟合）、**内存与分辨率无关**（参数量不随输出分辨率增长）。

### 7.2 频谱偏置与位置编码

普通多层感知机拟合函数时，先学低频，高频学得很慢，这就是神经网络的**频谱偏置**（spectral bias；Rahaman 等，2019）。对形状而言，这意味着角被磨圆、细节丢失。NeRF 使用、Tancik 等（2020）分析过的标准解法是给网络输入一个**位置编码**（positional encoding）：

$$
\gamma(\mathbf x) = \big(\mathbf x,\ \sin(2^0\pi\mathbf x),\ \cos(2^0\pi\mathbf x),\ \dots,\ \sin(2^{L-1}\pi\mathbf x),\ \cos(2^{L-1}\pi\mathbf x)\big),
$$

这样高频直接作为输入可用，而不必由低频构造出来。

我们在二维中测试，那里一个小的 NumPy 网络几秒钟就能训练完。形状是有 16 个齿（64 个角）的齿轮，其精确 SDF 用到最近多边形边的距离计算，符号由奇偶规则决定。网络有两个 64 单元的 ReLU 隐藏层，在 $[-1, 1]^2$ 内随机点上以 SDF 的均方误差用 Adam 训练。反向传播是手写的，所以这段代码是一个完整的（虽然很小的）神经场。

```python
def sdf_polygon(p, Vp):
    """Exact SDF of a closed polygon Vp (k x 2) at points p (M x 2); negative inside."""
    d = np.full(len(p), np.inf); inside = np.zeros(len(p), bool)
    for a, b in zip(Vp, np.roll(Vp, 1, axis=0)):
        e, w = b - a, p - a
        t = np.clip(w @ e / (e @ e), 0, 1)
        d = np.minimum(d, np.linalg.norm(w - t[:, None] * e, axis=1))
        crosses = (a[1] > p[:, 1]) != (b[1] > p[:, 1])                  # even-odd rule
        x_hit = a[0] + (p[:, 1] - a[1]) * e[0] / (e[1] + 1e-300)
        inside ^= crosses & (p[:, 0] < x_hit)
    return np.where(inside, -d, d)


a_g = 2 * np.pi * (np.arange(64) + 0.5) / 64          # a gear with 16 teeth: 64 corners
GEAR = np.stack([np.cos(a_g), np.sin(a_g)], 1) * np.where(np.arange(64) // 2 % 2, 0.62, 0.8)[:, None]


def encode(x, L):
    """NeRF-style positional encoding: x, sin(2^k pi x), cos(2^k pi x) for k < L."""
    feats = [x]
    for k in range(L):
        feats += [np.sin(2 ** k * np.pi * x), np.cos(2 ** k * np.pi * x)]
    return np.concatenate(feats, 1)


def train_field(L, width=64, steps=4000, batch=1024, lr=3e-3, seed=0):
    """f(x) = W3 relu(W2 relu(W1 enc(x) + b1) + b2) + b3, fitted to the SDF with Adam."""
    rng = np.random.default_rng(seed)
    dims = [2 + 4 * L, width, width, 1]
    params = []
    for i in range(3):
        params += [rng.normal(0, np.sqrt(2 / dims[i]), (dims[i], dims[i + 1])), np.zeros(dims[i + 1])]
    m = [np.zeros_like(q) for q in params]; v = [np.zeros_like(q) for q in params]
    for it in range(1, steps + 1):
        x = rng.uniform(-1, 1, (batch, 2))
        y = sdf_polygon(x, GEAR)[:, None]
        h0 = encode(x, L)
        z1 = h0 @ params[0] + params[1]; h1 = np.maximum(z1, 0)
        z2 = h1 @ params[2] + params[3]; h2 = np.maximum(z2, 0)
        pred = h2 @ params[4] + params[5]
        g = 2 * (pred - y) / batch                                     # d(MSE)/d(pred)
        g2 = (g @ params[4].T) * (z2 > 0); g1 = (g2 @ params[2].T) * (z1 > 0)
        grads = [h0.T @ g1, g1.sum(0), h1.T @ g2, g2.sum(0), h2.T @ g, g.sum(0)]
        a_t = lr * (0.05 ** (it / steps))                              # exponential decay to 5%
        for q, gq, mq, vq in zip(params, grads, m, v):                 # Adam
            mq *= 0.9; mq += 0.1 * gq; vq *= 0.999; vq += 0.001 * gq ** 2
            q -= a_t * (mq / (1 - 0.9 ** it)) / (np.sqrt(vq / (1 - 0.999 ** it)) + 1e-8)

    def f(x):
        h = np.maximum(encode(x, L) @ params[0] + params[1], 0)
        return (np.maximum(h @ params[2] + params[3], 0) @ params[4] + params[5])[:, 0]
    return f, sum(q.size for q in params)


g2d = np.linspace(-1, 1, 201)
XY = np.stack(np.meshgrid(g2d, g2d, indexing="xy"), -1).reshape(-1, 2)
SDF_GEAR = sdf_polygon(XY, GEAR)
band = np.abs(SDF_GEAR) < 0.05                       # points within 0.05 of the boundary


def report(name, pred, n_floats):
    err = np.abs(pred - SDF_GEAR)
    iou = np.mean((pred < 0) & (SDF_GEAR < 0)) / np.mean((pred < 0) | (SDF_GEAR < 0))
    print("%-14s %5d floats  mean |error| %.4f  near the boundary %.4f  IoU %.4f"
          % (name, n_floats, err.mean(), err[band].mean(), iou))


FIELDS = {}
for L in (0, 2, 6):
    f, n_par = train_field(L)
    FIELDS[L] = f
    report("MLP, L=%d" % L, f(XY), n_par)

from scipy.interpolate import RegularGridInterpolator

gn = np.linspace(-1, 1, 70)                          # 70 x 70 = 4900 floats, like the L=2 MLP
GN = np.stack(np.meshgrid(gn, gn, indexing="ij"), -1).reshape(-1, 2)
grid_f = RegularGridInterpolator((gn, gn), sdf_polygon(GN, GEAR).reshape(70, 70))
report("grid 70x70", grid_f(XY), 70 * 70)
```

输出：

```text
MLP, L=0        4417 floats  mean |error| 0.0107  near the boundary 0.0175  IoU 0.9056
MLP, L=2        4929 floats  mean |error| 0.0074  near the boundary 0.0074  IoU 0.9632
MLP, L=6        5953 floats  mean |error| 0.0098  near the boundary 0.0109  IoU 0.9435
grid 70x70      4900 floats  mean |error| 0.0007  near the boundary 0.0008  IoU 0.9952
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-neural-field.svg" localized="true" caption="16 齿齿轮的二维神经 SDF，Adam 训练 4000 步；灰度：误差 $\vert f\_\theta - f\vert$（黑色 = 0.04 或以上），黑线：真实轮廓，红线：模型的零水平集。没有位置编码（$L = 0$）时网络把齿磨圆了（边界附近误差 0.0175，IoU 0.906）。用 $L = 2$ 个频带时齿出现了（0.0074，IoU 0.963）。用 $L = 6$ 时拟合处处变得嘈杂（0.0109）。最右：$70 \times 70$ 个值的 SDF 栅格，数字个数与 $L = 2$ 的网络相同，做双线性插值：精确十倍（0.0008，IoU 0.995）。" %}

三条教训，全都适用于三维。

1. **频谱偏置是真实存在的。** 没有编码，网络在 4000 步内画不出齿。
2. **频率越多并不越好。** $L = 6$ 时网络能表示的频率远超形状所需。每一步都重新抽取随机点，所以这不是对固定训练集的过拟合：在 4000 步的固定预算内，高频分量没有被压下去，作为波纹留在整个场上，而且优化本身也变难了（练习 5）。所以后来的方法使用更少的频带、在训练中逐步加入频带（由粗到细），或使用其他激活函数，例如 SIREN 的正弦（Sitzmann 等，2020）。
3. **单个小网络并不是存储单个形状的紧凑方式。** 同样大小的普通栅格要好一个数量级。神经场的价值在别处：场是高维的时候（NeRF 的五维辐射场）；一个网络加隐编码表示许多形状的时候（DeepSDF）；表示必须通过可微渲染器拟合的时候；以及网络与栅格结合的时候。Instant-NGP 的多分辨率哈希栅格（[神经渲染第 3 篇]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})）这类混合方法把特征存在栅格里，只用一个很小的 MLP 来解码，从而兼得栅格的精度和网络的灵活性。

对神经 SDF 而言，普通回归损失中没有任何东西迫使 $f\_\theta$ 在训练点之外成为距离。**程函损失** $\mathbb E\_{\mathbf x}\big(\lVert\nabla\_{\mathbf x} f\_\theta(\mathbf x)\rVert - 1\big)^2$（IGR，Gropp 等，2020）加上了这个约束，这也使得仅用原始点云就能拟合 SDF，唯一的数据项是点上的 $f\_\theta = 0$。

## 8. 三维高斯

### 8.1 基元

[3D 高斯泼溅]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})（Kerbl 等，2023）把场景表示为一组各向异性高斯。每个高斯有均值 $\boldsymbol\mu \in \mathbb R^3$、协方差 $\Sigma = R S S^\top R^\top$（旋转 $R$ 来自单位四元数，尺度 $S = \mathrm{diag}(s\_1, s\_2, s\_3)$）、不透明度 $o$ 以及用球谐表示的依赖视角的颜色。它在 $\mathbf x$ 处的密度为

$$
G(\mathbf x) = o \, \exp\Big(-\tfrac12 (\mathbf x - \boldsymbol\mu)^\top \Sigma^{-1} (\mathbf x - \boldsymbol\mu)\Big).
$$

使用 3 阶球谐（每个颜色通道 16 个系数）时，一个高斯有 $3 + 4 + 3 + 1 + 48 = 59$ 个可学习浮点数，236 字节；参考实现的 PLY 文件还存了三个不用的法向字段。仅几何部分是 11 个浮点数。真实场景使用几十万到几百万个高斯。

作为一种表示，高斯介于点和体积之间。它们是**显式的**（一个可以编辑、剔除和流式传输的列表）、**软的**（每个都有空间范围，因此能无洞地覆盖表面）、**可微的**（梯度流向每个参数）、**渲染快**（投影后做 alpha 混合，而不是光线步进）。它们缺少的是定义明确的表面：场景是一个密度，"表面"就是累积不透明度饱和的地方。

### 8.2 作为几何的高斯

为了看清高斯如何描述表面，直接把它们拟合到表面上。一种简单的方法（也是常见的初始化）：用 k-means 对表面采样聚类，给每个簇赋予其点的样本均值和协方差。（3DGS 本身是通过渲染优化高斯的；聚类只是看清几何最直观的办法。）

```python
from scipy.cluster.vq import kmeans2


def fit_gaussians(P, k, seed=0):
    """k anisotropic Gaussians fitted to a point cloud: k-means, then each cluster's covariance."""
    mu, lab = kmeans2(P, k, minit="++", seed=seed)
    cov = np.stack([np.cov(P[lab == j].T) + 1e-6 * np.eye(3) for j in range(k)])
    w = np.bincount(lab, minlength=k) / len(P)
    return mu, cov, w


Pg = sample_torus(20_000, np.random.default_rng(5))[0]
mu_g, cov_g, w_g = fit_gaussians(Pg, 100)
evals, evecs = np.linalg.eigh(cov_g)                 # ascending: column 0 = thinnest axis
n_at_mu = grad(sdf_torus, mu_g)
cosang = np.abs(np.sum(evecs[:, :, 0] * n_at_mu, 1)) / np.linalg.norm(n_at_mu, axis=1)
ang_g = np.degrees(np.arccos(np.clip(cosang, -1, 1)))
flat = np.sqrt(evals[:, 0] / evals[:, 2])
print("thinnest axis vs surface normal: median %.1f deg, max %.1f deg" % (np.median(ang_g), ang_g.max()))
print("thickness / length sigma ratio: median %.3f" % np.median(flat))
print("centres inside the tube by: median %.4f" % np.median(-sdf_torus(mu_g)))
```

输出：`thinnest axis vs surface normal: median 1.6 deg, max 4.4 deg`、`thickness / length sigma ratio: median 0.140`、`centres inside the tube by: median 0.0171`。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-gaussians.svg" caption="左：用 k-means 拟合到 20,000 个表面采样的 100 个高斯，画在 $\pm 2\sigma$ 处；它们变成贴在表面上的扁圆盘。中：混合密度在切片 $y = 0$ 上的对数，以及真实的管截面圆（虚线）；密度是一层壳，在相邻圆盘重叠处最厚。右：每个高斯最薄轴与其中心处真实法向的夹角：中位数 1.6°，最大 4.4°；厚度的中位数是长度的 0.14。" %}

高斯自己压扁成与表面相切的圆盘，最薄轴沿着法向。它们并不恰好在表面上：弯曲面片上一簇点的均值位于曲线内侧（这里中心平均位于管内 0.017 处，取中位数），与网格中的弓高效应相同。这一观察推动了面向表面的变体：**2D 高斯泼溅**（Huang 等，2024）使用扁平的二维高斯圆盘（面元），法向定义明确，使深度和法向一致、表面可以提取。[神经渲染第 5 篇]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})综述了这些及其他变体。

从高斯得到网格，最常见的路线是间接的：从许多视角渲染深度图，融合进 TSDF（第 6.2 节），再运行 Marching Cubes。第 9 节列出了所有表示之间的路线。

## 9. 表示之间的转换

真实的流程会转换好几次：深度图转 TSDF，TSDF 转网格，网格转点用于评测。每种转换都有标准算法和典型的信息损失方式。

| 从 → 到 | 标准方法 | 丢失或假设了什么 | 本博客中的位置 |
| --- | --- | --- | --- |
| 深度图 → 点 | 反投影 $Z K^{-1}\tilde{\mathbf u}$ | 什么也不丢，但需要过滤飞点 | 第 2.2 节 |
| 深度图 → TSDF | 投影截断距离，加权平均 | 体素尺寸以下的细节；需要位姿 | [第 7 篇]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})、[第 9 篇]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) |
| SDF / TSDF / 占据 → 网格 | Marching Cubes（尖锐特征用 Dual Contouring） | 尖锐棱边、比体素更细的特征 | [图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) |
| 神经场 → 网格 | 在栅格上采样，再做 Marching Cubes | 比采样栅格更细的一切 | 第 7 节 |
| 点 → 网格 | 屏蔽泊松重建（需要定向法向）、滚球法 | 用光滑的猜测补洞；需要法向 | [图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})、[第 9 篇]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) |
| 网格 → 点 | 按面积加权采样 | 连接关系 | 第 4.2 节 |
| 网格 → SDF | 最近点距离；符号由环绕数或射线奇偶性决定 | 网格水密时不丢；否则符号无定义 | 练习 4 |
| 网格 / 点 → 体素 | 光栅化或量化到格子 | $h$ 以下的一切 | 第 5 节 |
| 高斯 → 网格 | 从多视角渲染深度，TSDF 融合，Marching Cubes | 软的、半透明的内容 | 第 8 节 |
| 任意 → 深度图 | 从相机光栅化或光线投射 | 一切不可见的东西 | 第 2 节 |
| 任意 → 高斯 | 从点初始化，通过渲染优化 | 需要图像或渲染器 | [神经渲染第 4 篇]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) |

两条经验法则。**向隐式**表示的转换（点 → SDF）需要一个源数据可能并不包含的内外判断，因此需要法向、水密网格或额外假设。**向离散**表示的转换（任意 → 体素）会永久丢失格子尺寸以下的一切。保留原始数据，尽可能晚地转换。

## 10. 内存与精度

### 10.1 在同一个形状上测量所有表示

现在可以把各种表示放到同一张图上。对每种表示，在一系列分辨率下计算其内存和**平均双向表面误差**：它的表面到真实表面的平均距离的一半，加上真实表面到它的表面的平均距离的一半（即第 3.3 节的 Chamfer 距离，但只要表示有连续表面，就用连续表面来评估）。点的"表面"就是点本身；占据是体素阶梯；SDF 栅格是插值场的零水平集；网格是三角形。内存按 float32 坐标与值、int32 索引、每体素 1 比特计算。"稀疏 SDF"只存储包含被表面穿过的格子的 $8^3$ 块，与体素哈希的做法相同。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-tradeoff.svg" localized="true" caption="圆环的内存与平均双向表面误差。点：500 到 50,000 个精确采样（误差 0.044 到 0.0044）。网格：$8 \times 4$ 到 $128 \times 64$（0.093 到 0.0004）。占据：$16^3$ 到 $128^3$ 比特（0.032 到 0.0046）。稠密 SDF：$8^3$ 到 $128^3$ 个 float32 格子（0.020 到 0.00008）。稀疏 SDF：同样的值只存在接触表面的 $8^3$ 块中，$128^3$ 时为 1.5 MB 而不是 8.6 MB。对数坐标下的斜率：点 $-1/2$，占据 $-1/3$，稠密 SDF $-2/3$，网格 $-1$，稀疏 SDF 在高分辨率下趋近 $-1$（$N$ 较小时它的 $8^3$ 块很粗）。" %}

### 10.2 标度律

对数坐标图上每条曲线都是直线，斜率由两件事决定：误差如何依赖分辨率，内存如何依赖分辨率。设 $h$ 为分辨率（采样间距、体素边长或边长），$M$ 为内存。

| 表示 | 误差 | 内存 | 误差作为内存的函数 |
| --- | --- | --- | --- |
| 点云 | 间距，$\propto h$ | 曲面上的采样，$\propto h^{-2}$ | $\propto M^{-1/2}$ |
| 占据栅格（稠密） | 阶梯，$\propto h$ | $\propto h^{-3}$ | $\propto M^{-1/3}$ |
| SDF 栅格（稠密） | 插值，$\propto h^2$ | $\propto h^{-3}$ | $\propto M^{-2/3}$ |
| SDF 栅格（稀疏带） | $\propto h^2$ | 表面附近的带，$\propto h^{-2}$ | $\propto M^{-1}$ |
| 三角网格 | 弓高，$\propto h^2$ | $\propto h^{-2}$ | $\propto M^{-1}$ |
| 八叉树占据 | $\propto h$ | $\propto h^{-2}$ | $\propto M^{-1/2}$ |

在约 10 kB 处读图：网格（$24 \times 12$，10.4 kB）误差 0.011，稠密 SDF（$12^3$，8.8 kB）0.0085，占据（$32^3$ 比特 4.1 kB；$48^3$ 13.8 kB）0.018 和 0.013，1000 个点（12 kB）0.031。在约 150 kB 处，稀疏 SDF（131 kB 时 0.00054）和网格（166 kB 时 0.00072）领先，稠密 SDF 其次（144 kB 时 0.0012），占据（111 kB 时 0.0067）和点（120 kB 时 0.0099）落后一个数量级。两条教训可以推广。**插值胜过分辨率**：每个采样多存一点（距离而不是比特，三角形而不是点）改变的是指数，而不只是常数。**只在表面附近存储胜过处处存储**：稀疏 SDF 和网格的斜率最好，因为两者都只把内存花在表面上。

这些数字只针对一个光滑形状。对于有细薄部分或尖锐棱边的形状，SDF 和占据的曲线在低分辨率时会变平（特征消失），而采样恰好在表面上的点和网格相对更好。请在下面的组件中试试。

### 10.3 动手试试：一个形状，六种表示

组件在二维中工作，那里一切一目了然，但标度律相同：在三维中，稠密栅格要多付一次 $N$ 的幂。

{% include widget.liquid name="3d-vision-representations" height="640" caption="100 mm 方框中的二维形状，存储为点、像素（占据）、四叉树、SDF 栅格（配合 Marching Squares）、多边形或高斯混合。用按钮选择表示，用滑块选择分辨率；虚线是真实边界。面板显示内存（float32 坐标、每像素 1 比特、每个四叉树节点 8 字节，因此在这么小的规模下四叉树输给按比特打包的像素栅格，见第 5.3 节）以及表示的边界与真实边界之间的平均双向距离。拖动探针（带圈的点），看看每种表示能对一个点说些什么：点只能给出距离；像素和四叉树叶子给出内部或外部；SDF 从 4 个节点插值出有符号距离（虚线圆的半径就是它）；多边形数射线穿越次数；高斯混合把密度与一个使面积与真值相等的阈值比较。右图画出六种表示在整个范围内的内存与误差；点击某个点即可跳到该设置。试试细环：直到栅格能分辨 3.5 mm 的壁厚之前，占据和 SDF 的曲线都停滞不前。" %}

## 11. 什么任务用什么表示

| 任务 | 典型选择 | 原因 |
| --- | --- | --- |
| 逐帧的传感器数据 | 深度图、LiDAR 点云 | 正是传感器测量的东西，没有转换误差 |
| 稀疏 SfM / SLAM 路标 | 带描述子的点云 | 只跟踪有区分度的点（[第 5 篇]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})、[第 6 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})） |
| 实时稠密融合（RGB-D） | 哈希体素块中的 TSDF；面元 | 对噪声深度增量平均，内存有界 |
| 机器人导航与碰撞 | 占据八叉树（OctoMap）、ESDF（Voxblox） | 空闲/占据/未知，以及给规划器的距离 |
| 用于渲染、游戏、打印的最终资产 | 带纹理的水密三角网格 | 每个引擎和打印机都吃网格 |
| 新视角合成 | 三维高斯；NeRF 类的场；小基线用 MPI | 光度质量，通过可微渲染拟合 |
| 学习形状先验、补全 | 带隐编码的 SDF 或占据场 | 输出连续、分辨率任意，可在隐空间插值 |
| 三维感知网络（检测、分割） | 原始点（PointNet 类）、稀疏体素（稀疏卷积） | 排列不变性；在大部分为空的空间中高效 |
| 设备上的 AR 遮挡与物理 | 深度图与粗网格 | 更新便宜，足以做遮挡和碰撞（[第 10 篇]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }})） |

要按顺序问的问题：最常做的查询是什么（渲染、内外判断、距离、最近邻）？工作过程中形状会改变拓扑吗？需要梯度吗？场景相对于最细的细节有多大？流程的下一阶段期望什么？

## 12. 三维数据上的学习（简述）

### 12.1 PointNet：集合的函数

处理点云的网络必须对点的任何排列给出相同的输出。**PointNet**（Qi 等，2017）用最简单的结构做到这一点：对每个点独立地施加**同一个**小 MLP $h$，再用一个**对称**函数（对所有点逐元素取最大值）把结果合并：

$$
g(\{\mathbf p_1, \dots, \mathbf p_n\}) = \psi\Big(\max_{i} h(\mathbf p_i)\Big).
$$

其中 $\psi$ 是作用在池化向量上的第二个 MLP（论文中记为 $\gamma$；这里改名，以免与第 7.2 节的位置编码冲突）。因为最大值不关心顺序，$g$ 按构造就是排列不变的。最大值的 $K$ 个通道中每个都由一个点"赢得"，所以至多 $K$ 个点决定全局特征；论文称它们为**关键点**（critical points），其余每个点都可以删掉或稍微移动而不改变输出。

```python
def pointnet_feature(P, Ws):
    """Shared per-point MLP (the same weights for every point), then max-pooling over points."""
    h = P
    for W_, b_ in Ws:
        h = np.maximum(h @ W_ + b_, 0)
    return h.max(axis=0), h.argmax(axis=0)          # global feature, which point won each channel


rng = np.random.default_rng(6)
Ws = [(rng.normal(0, 1, (3, 64)), rng.normal(0, 0.1, 64)),
      (rng.normal(0, 0.18, (64, 256)), rng.normal(0, 0.1, 256))]
cloud2 = sample_torus(2_000, rng)[0]
g1, winners = pointnet_feature(cloud2, Ws)
g2, _ = pointnet_feature(cloud2[rng.permutation(2_000)], Ws)
crit = np.unique(winners)
g3, _ = pointnet_feature(cloud2[crit], Ws)
print("permuted input, same feature:", np.allclose(g1, g2))
print("critical points: %d of 2000; feature from them alone equal: %s" % (len(crit), np.allclose(g1, g3)))
```

输出：`permuted input, same feature: True` 和 `critical points: 218 of 2000; feature from them alone equal: True`。即使权重是随机的，2000 个点中也只有 218 个承载了全部 256 维特征。训练后的权重下，关键点勾勒出形状的骨架，这就是 PointNet 对缺失和扰动的点很鲁棒的原因。PointNet 缺少的是**局部性**：没有哪一层能看到一个点与其邻居之间的关系。**PointNet++**（Qi 等，2017）把 PointNet 分层地施加到局部邻域上来弥补这一点：用最远点采样（第 3.2 节）选取邻域中心，用半径查询收集邻域成员。

### 12.2 稀疏卷积

体素提供了卷积可以利用的规则结构，但在 $256^3$ 栅格上的稠密三维 CNN 几乎把全部计算都花在空白空间上（第 5.1 节）。**稀疏卷积**（sparse convolution）只把活跃（被占据）的体素存在哈希表中，只在它们那里计算卷积。这里有个微妙之处：普通卷积在其卷积核内只要有任一输入活跃，输出就活跃，所以活跃集合每层**膨胀**一个体素，几层之后数据就不再稀疏了。**子流形稀疏卷积**（submanifold sparse convolution；Graham 等，2018）只在原本就活跃的位置计算输出，使稀疏模式在整个网络中保持不变。Minkowski Engine（Choy 等，2019）把它推广到任意维度，包括四维时空。

```python
from scipy import ndimage as ndi

X64, h64 = grid_centres(64)
active = np.abs(sdf_torus(X64)) < h64 / 2           # a thin shell of occupied voxels, like a scan
k3 = np.ones((3, 3, 3), bool)
counts_reg, a_ = [int(active.sum())], active
for layer in range(3):
    a_ = ndi.binary_dilation(a_, k3)                 # a regular sparse conv activates every site it touches
    counts_reg.append(int(a_.sum()))
print("active sites, regular sparse conv over 3 layers:", counts_reg)
print("submanifold sparse conv keeps %d; dense grid has %d" % (active.sum(), 64 ** 3))
```

输出：`active sites, regular sparse conv over 3 layers: [7120, 27776, 48360, 67224]` 和 `submanifold sparse conv keeps 7120; dense grid has 262144`。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-sparse-conv.svg" localized="true" caption="由 7120 个活跃体素组成的壳（$64^3$ 下的圆环表面，类似扫描数据）。左：$z = 0$ 上方紧邻的切片；黑色：输入，深橙色：一层普通稀疏 $3 \times 3 \times 3$ 卷积后激活的位置，浅橙色：两层之后。右：每层的活跃位置数。普通稀疏卷积一层后从 7120 增长到 27,776，三层后到 67,224，是稠密 $64^3 = 262{,}144$ 栅格的四分之一；子流形卷积每层都保持 7120。" %}

基于点的网络和稀疏体素网络后来逐渐趋同。当前的点云骨干网络如 Point Transformer V3（Wu 等，2024）把点沿空间填充曲线序列化，在局部窗口内做注意力，并用稀疏卷积提供位置信息。在"点"和"体素"之间的选择，如今主要是为邻域查询选择数据结构。

## 动手试试

- 在第 10.3 节的组件中，找出每种表示在星形上达到 0.5 mm 误差所需的分辨率，比较内存。然后换成细环再做一遍。哪些表示最先失效？为什么？
- 在 SDF 视图中以粗分辨率把探针拖过边界，观察插值值在每个格子内线性变化；再在高斯视图中做同样的事，那里的密度是光滑的，但其水平集并不精确地与真实边界重合。
- 首页的[交互实验室]({{ '/' | relative_url }}#lab)渲染一个三维高斯场景（Gaussian World）和一个路径追踪的解析形状场景。前者是第 8 节的表示在实际运行；后者使用和我们的圆环一样的精确隐式形状。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Lorensen, Cline: Marching cubes | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37422) | 从任意采样的隐式场提取网格 |
| Curless, Levoy: A volumetric method for building complex models from range images | SIGGRAPH | 1996 | [DOI](https://doi.org/10.1145/237170.237269) | 由距离图像累积加权有符号距离：TSDF 融合的起源 |
| Shade, Gortler, He, Szeliski: Layered depth images | SIGGRAPH | 1998 | [DOI](https://doi.org/10.1145/280814.280882) | 每像素多个深度；能处理视差与去遮挡的渲染 |
| Pfister, Zwicker, van Baar, Gross: Surfels | SIGGRAPH | 2000 | [DOI](https://doi.org/10.1145/344779.344936) | 没有连接关系的定向点基元 |
| Newcombe et al.: KinectFusion | ISMAR | 2011 | [DOI](https://doi.org/10.1109/ISMAR.2011.6092378) | 用深度相机实时进行 TSDF 融合与跟踪 |
| Hornung et al.: OctoMap | Autonomous Robots | 2013 | [DOI](https://doi.org/10.1007/s10514-012-9321-0) | 八叉树中的概率占据；标准的机器人地图 |
| Nießner, Zollhöfer, Izadi, Stamminger: Voxel hashing | ACM TOG (SIGGRAPH Asia) | 2013 | [DOI](https://doi.org/10.1145/2508363.2508374) | 哈希表背后的稀疏 TSDF 块，适用于任意大小的场景 |
| Qi, Su, Mo, Guibas: PointNet | CVPR | 2017 | [arXiv](https://arxiv.org/abs/1612.00593) | 直接在原始点上做排列不变的学习 |
| Qi, Yi, Su, Guibas: PointNet++ | NeurIPS | 2017 | [arXiv](https://arxiv.org/abs/1706.02413) | 用 FPS 和球查询提取分层局部特征 |
| Fan, Su, Guibas: A point set generation network | CVPR | 2017 | [arXiv](https://arxiv.org/abs/1612.00603) | 预测点云；推广了 Chamfer 和 EMD 损失 |
| Knapitsch, Park, Zhou, Koltun: Tanks and Temples | ACM TOG | 2017 | [DOI](https://doi.org/10.1145/3072959.3073599) | 重建的精确率、召回率与 F-score |
| Oleynikova et al.: Voxblox | IROS | 2017 | [arXiv](https://arxiv.org/abs/1611.03631) | 由 TSDF 增量构建 ESDF，用于规划 |
| Graham, Engelcke, van der Maaten: 3D semantic segmentation with submanifold sparse convolutional networks | CVPR | 2018 | [arXiv](https://arxiv.org/abs/1711.10275) | 保持稀疏模式的稀疏卷积 |
| Zhou et al.: Stereo magnification（多平面图像） | SIGGRAPH (ACM TOG) | 2018 | [arXiv](https://arxiv.org/abs/1805.09817) | 用 CNN 预测 MPI 做视角合成 |
| Mescheder et al.: Occupancy networks | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1812.03828) | 把形状看作分类器的决策边界 |
| Park et al.: DeepSDF | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1901.05103) | 带隐编码、可表示整类形状的神经 SDF |
| Choy, Gwak, Savarese: Minkowski CNNs | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1904.08755) | 推广的稀疏卷积，可到四维 |
| Rahaman et al.: On the spectral bias of neural networks | ICML | 2019 | [arXiv](https://arxiv.org/abs/1806.08734) | 普通 MLP 为何先学低频 |
| Gropp et al.: Implicit geometric regularization (IGR) | ICML | 2020 | [arXiv](https://arxiv.org/abs/2002.10099) | 程函损失；从原始点云学 SDF |
| Mildenhall et al.: NeRF | ECCV | 2020 | [arXiv](https://arxiv.org/abs/2003.08934) | 用体渲染训练的辐射场 |
| Tancik et al.: Fourier features | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.10739) | 坐标网络位置编码的分析 |
| Sitzmann et al.: SIREN | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.09661) | 正弦激活，适合有精细细节和导数的场 |
| Müller et al.: Instant-NGP | SIGGRAPH (ACM TOG) | 2022 | [arXiv](https://arxiv.org/abs/2201.05989) | 哈希栅格特征加小 MLP |
| Kerbl et al.: 3D Gaussian Splatting | SIGGRAPH (ACM TOG) | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) | 显式、可微、实时的场景表示 |
| Huang et al.: 2D Gaussian Splatting | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2403.17888) | 法向和表面定义明确的扁平高斯面元 |
| Wu et al.: Point Transformer V3 | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.10035) | 序列化注意力加稀疏卷积的点云网络 |

## 学习资源

- 本站[图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})：网格、隐式曲面、Marching Cubes 与泊松重建。
- M. Botsch, L. Kobbelt, M. Pauly, P. Alliez, B. Lévy，*Polygon Mesh Processing*，A K Peters，2010：网格、转换与重新划分网格。
- 在 Python 中实验可用 [Open3D](https://www.open3d.org/)（点云、网格、TSDF 积分、体素降采样）和 [Trimesh](https://trimesh.org/)（网格读写、采样、有符号距离）。
- 机器人地图：[OctoMap](https://octomap.github.io/) 与 [Voxblox](https://github.com/ethz-asl/voxblox)；三维深度学习：[MinkowskiEngine](https://github.com/NVIDIA/MinkowskiEngine) 与 [Pointcept](https://github.com/Pointcept/Pointcept)。
- Y. Xie 等，"Neural Fields in Visual Computing and Beyond"（Eurographics STAR 2022）及其[论文列表](https://neuralfields.cs.brown.edu/)，是关于神经场的系统综述。

## 练习

1. 一台深度相机以 16 位整数返回以毫米为单位的 $z$ 深度。它能存的最大深度是多少？在 1 m 和 5 m 处的深度分辨率是多少？如果改为存逆深度 $1/Z$，即以 $2^{-10}$ m⁻¹ 为步长的 16 位整数，1 m 和 5 m 处的分辨率会怎样变化？

   <details markdown="1"><summary>提示</summary>

   毫米：最多 65.535 m，任何深度处步长都是均匀的 1 mm。步长为 $\delta = 2^{-10}$ m⁻¹ 的逆深度：由于 $dZ = Z^2\, d(1/Z)$，深度步长为 $Z^2\delta$，1 m 处约 1 mm，5 m 处约 24 mm。逆深度把精度花在靠近相机的地方，和 MPI 的平面一样，这与双目的误差（第 7 篇）相匹配。
   </details>

2. 扩展 `depth_normals`，拒绝深度不连续处的法向：若某像素的四个邻居中任何一个的深度相差超过百分之几，就把它标为无效。在第 2.2 节的场景中这会去掉多少比例的像素？它能抓住所有误差超过 10° 的法向吗？

   <details markdown="1"><summary>提示</summary>

   把 `depth[1:-1, 2:]`、`depth[1:-1, :-2]`、`depth[2:, 1:-1]` 和 `depth[:-2, 1:-1]` 与中心比较，对相对差设阈值。也要拒绝缺少邻居的像素。圆环相对桌面的轮廓是 0.5 m 以上的跳变，很容易抓住；而洞的内缘处圆环几乎沿光线方向弯走，需要改为检查法向与光线的夹角。
   </details>

3. 推导第 5.3 节八叉树曲线的斜率。若面积为 $A$ 的曲面被边长 $h = 3/2^L$ 的格子覆盖，第 $L$ 层大约有多少个格子被曲面穿过？与 $L = 8$ 时打印的数字比较。

   <details markdown="1"><summary>提示</summary>

   约 $c \cdot A/h^2$ 个格子，$c$ 介于 1 和 3 之间，取决于曲面如何切割格子。$A = 15.79$、$h = 3/256$ 时 $A/h^2 = 1.15 \times 10^5$。第 8 层的 402,176 包含第 7 层每个被穿过格子的全部 8 个子格子，而不只是被穿过的那些；只数第 8 层中被穿过的格子，得到的数字会更接近 $A/h^2$ 乘一个小常数。
   </details>

4. 写一个 `mesh_sdf(V, F, p)`，计算点到闭合三角网格的有符号距离：距离取到最近三角形的距离（点到三角形距离），符号由广义环绕数 $w(\mathbf p) = \frac{1}{4\pi}\sum\_f \Omega\_f(\mathbf p)$ 决定，其中 $\Omega\_f$ 是从 $\mathbf p$ 看三角形 $f$ 所张的立体角。在 $96 \times 48$ 的网格上与 `sdf_torus` 对比测试。

   <details markdown="1"><summary>提示</summary>

   三角形 $\mathbf a, \mathbf b, \mathbf c$（相对于 $\mathbf p$）的立体角为 $2\,\mathrm{atan2}\big(\mathbf a \cdot (\mathbf b \times \mathbf c),\ abc + (\mathbf a\cdot\mathbf b)c + (\mathbf b\cdot\mathbf c)a + (\mathbf c\cdot\mathbf a)b\big)$，其中 $a = \lVert\mathbf a\rVert$ 等（Van Oosterom 与 Strackee）。对于闭合且方向一致的网格，内部 $w \approx 1$，外部为 $0$；与射线奇偶性不同，对有小洞的网格它会平滑地退化。与 `sdf_torus` 的差应大致不超过弓高 0.0016。
   </details>

5. 对 $L = 6$ 用更小的学习率或更多步数重复第 7 节的神经场实验，再试 $L = 4$。$L = 6$ 的噪声会随着更多训练消失吗？然后加上程函惩罚 $\lambda(\lVert\nabla\_{\mathbf x} f\_\theta\rVert - 1)^2$；在 NumPy 网络中如何计算 $\nabla\_{\mathbf x} f\_\theta$？

   <details markdown="1"><summary>提示</summary>

   写这篇文章时，我们在一个星形多边形上对 $L = 6$ 试过更小的学习率，在 4000 步内拟合反而更差：高频输入不只让拟合更嘈杂，也让优化更难。请检查齿轮是否也一样。对输入梯度，从输出向编码反向传播一个全 1 的梯度（与求权重梯度相同的链式法则），再乘以 $\gamma$ 的雅可比：$\partial \sin(2^k\pi x)/\partial x = 2^k\pi\cos(2^k\pi x)$。程函项自身的梯度还需要二阶导数，这时自动微分框架就值得用了。
   </details>

**下一篇：**[三维重建]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})：用这些表示从照片走到曲面，包括经典的 SfM、MVS、融合与网格化流程，神经曲面，以及前馈式三维基础模型。
