---
layout: post
title: "三维重建：从经典流水线到前馈模型"
date: 2026-10-27 11:09:00+0900
description: "从照片到曲面：SfM、MVS、融合与网格化组成的经典流水线，TSDF 融合与 Marching Cubes，屏蔽泊松重建，神经曲面（NeuS、Neuralangelo、2DGS），前馈式三维基础模型（DUSt3R、MASt3R、VGGT 及其 2025-2026 年的后继），以及如何在 DTU、Tanks and Temples 和 ETH3D 上评测重建结果；每一步都配有 NumPy 代码。"
categories: 3d-vision
tags: [3d-reconstruction, tsdf-fusion, marching-cubes, poisson-reconstruction, neus, dust3r, vggt, evaluation]
series: 3d-vision
series_order: 9
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

前面几篇逐个搭好了零件。[第 3 篇]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})找到对应点，[第 4 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})由两个视图得到相对位姿和深度，[第 5 篇]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})用运动恢复结构（structure-from-motion，SfM）求出所有相机和一个稀疏点云，[第 7 篇]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})为每张图像计算稠密深度图，[第 8 篇]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})比较了存储形状的各种方式。本文把它们组装起来，回答用户真正关心的问题：**我拍了一些照片（或者一段深度视频），怎样得到物体的表面？**

答案有三种，按出现的先后排列。**经典流水线**把 SfM、多视图立体（multi-view stereo，MVS）、深度融合与网格化串联起来；每一级都是理解透彻的算法，在图像多且质量好时，整条链仍然给出最精确的几何。**神经曲面重建**（NeuS、Neuralangelo、二维高斯泼溅）把后三级换成一次优化：通过可微渲染器优化一个有符号距离场，或一组"像曲面一样"的高斯。**前馈式三维基础模型**（DUSt3R、MASt3R、VGGT，以及 2024 年以来的大量后继）干脆跳过优化：网络前向一次，就把一组无位姿的图像变成相机和稠密三维点。

我们会在一个小小的"平面国"（flatland）世界里用 NumPy 实现每种答案的核心，所有结果都能和真值对照：TSDF 融合与 Marching Squares、屏蔽泊松重建、NeuS 的渲染权重和一个迷你 NeuS 优化、DUSt3R 点图（pointmap）的几何以及由它恢复焦距和位姿、把成对预测拼成整体的全局对齐。最后讨论如何评测重建结果，因为"看起来不错"不是一种测量。

## 前置知识

- [第 1 篇]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})的相机模型 $\mathbf x \sim K(R\mathbf X + \mathbf t)$ 与 OpenCV 相机坐标系（x 向右，y 向下，z 向前）。
- SfM 与 MVS 的输出：相机位姿和逐图像深度图（[第 5 篇]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})、[第 7 篇]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})）。如果还没读过，[神经渲染系列关于相机与多视图几何的一篇]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})是一个紧凑的替代。
- 有符号距离函数、网格与隐式曲面：[第 8 篇]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})和[图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})，后者也推导了泊松重建和 Marching Squares。
- 第 6 节需要 [NeRF 一篇]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})中的体渲染公式 $C = \sum\_i T\_i \alpha\_i \mathbf c\_i$。
- 最小二乘、SVD、稀疏线性方程组（SciPy），以及带 Adam 的梯度下降。

**记号。** 世界点记为 $\mathbf X$，相机用 $\mathbf X\_c = R\mathbf X + \mathbf t$ 把它变到自身坐标系，相机中心为 $\mathbf C = -R^\top \mathbf t$。深度图 $d(u)$ 存储从像素 $u$ 看到的表面的 $z$ 坐标（不是沿射线的距离）。$f(\mathbf x)$ 是有符号距离函数（signed distance function，SDF）：实体内部为负，外部为正，$\lvert f\rvert$ 是到表面的距离。为了不和 $f$ 冲突，以像素为单位的焦距写作 $f\_x$。

## 1. 重建问题

### 1.1 重建得到的是什么

"三维重建"可以指好几种输出，最好先说清楚想要哪一种：

- **相机**：每张图像的内参 $K\_k$ 和位姿 $(R\_k, \mathbf t\_k)$，即 SfM 的输出；
- **点云**：稀疏的（SfM 轨迹）或稠密的（融合后的深度图），可能带法向和颜色；
- **曲面**：通常是三角网格，理想情况下是水密的（watertight，封闭、内外分明），有时带纹理；
- **场**：SDF、占据场或辐射场，用查询代替存储网格；
- **可渲染的场景**：NeRF 或三维高斯，为图像而不是为几何优化。

[第 8 篇]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})比较了这些表示。本文讲的是产生它们的算法，主要目标是曲面。

### 1.2 经典流水线

经典流水线是一串阶段，每一级的输入和输出都很明确：

| 阶段 | 输入 | 输出 | 所在篇目 |
| --- | --- | --- | --- |
| 特征与匹配 | 图像 | 对应点 | [第 3 篇]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}) |
| 运动恢复结构 | 对应点 | 相机 $K, R, \mathbf t$ 与稀疏点 | [第 4-5 篇]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}) |
| 多视图立体 | 图像与相机 | 每张图像的深度图（和法向图） | [第 7 篇]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) |
| 深度融合 | 深度图与相机 | 融合点云或体素场 | 第 2 节 |
| 网格化 | 带法向的点，或一个场 | 三角网格 | 第 3、4 节 |
| 纹理映射 | 网格、图像、相机 | 纹理图集 | 第 4.4 节 |

这条链的优点是每一级都有几何意义，可以单独检查：SfM 之后看重投影误差，MVS 之后看深度图，网格化之前看融合点云。缺点是误差只向前传播。SfM 算得略有偏差的相机会产生互相矛盾的深度图，融合把矛盾平均成一个模糊的表面，而网格化无从知道原因。第 6、7 节的神经方法和前馈方法，在某种程度上都是想让信息也能向后流动。

本文先集中讲前面几篇没有覆盖的最后三级，然后讲替代整条链的方法。

### 1.3 平面国试验台

为了让每一步都有数字可查，我们使用一个二维世界。想象俯视一张桌子：世界是 OpenCV 世界坐标系的水平面 $(x, z)$（$y$ 轴向下指入纸面），相机保留其三维坐标系的 $x$ 轴（向右）和 $z$ 轴（向前）。它的图像只有一行 160 个像素，第 1 篇的针孔模型少了一维：

$$
u = f_x \frac{x_c}{z_c} + c_x, \qquad
K = \begin{pmatrix} f_x & c_x \\ 0 & 1 \end{pmatrix}, \qquad
\begin{pmatrix} x_c \\ z_c \end{pmatrix} = R \begin{pmatrix} x \\ z \end{pmatrix} + \mathbf t ,
$$

其中 $R$ 是 $2\times 2$ 旋转矩阵。场景是一个精确 SDF 的零水平集：半径 45 cm 的圆盘、旋转 20° 的方块，以及只有 8 cm 厚的细杆，用来检验每种方法能保留多细的结构。相机对 SDF 做球体追踪（sphere tracing，即[图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})的光线步进），把每个命中距离换算成 $z$ 深度，再加上 $\sigma = 2$ cm 的高斯噪声，得到一次**深度扫描**；这大致是消费级深度相机在 2-3 m 处的噪声水平。64 台相机分布在半径 2.6 m 的圆上，每台看向原点附近一个随机偏移 15 cm 的点。

```python
import numpy as np

W, FOC = 160, 160.0                 # a 1D image: 160 pixels, focal length 160 px
CX = (W - 1) / 2                    # principal point at the image centre (pixel centres at 0..W-1)


def sd_box(p, c, half, ang):
    """Signed distance to a box with centre c, half sizes `half`, rotated by `ang`."""
    ca, sa = np.cos(ang), np.sin(ang)
    d = p - c
    q = np.stack([ca * d[..., 0] + sa * d[..., 1], -sa * d[..., 0] + ca * d[..., 1]], -1)
    a = np.abs(q) - half
    return np.linalg.norm(np.maximum(a, 0), axis=-1) + np.minimum(a.max(-1), 0)


def scene_sdf(p):
    """Signed distance (m) to the flatland scene; p[..., :] = (x, z) world coordinates."""
    disk = np.linalg.norm(p - np.array([-0.55, 0.25]), axis=-1) - 0.45
    box = sd_box(p, np.array([0.5, -0.4]), np.array([0.45, 0.28]), np.deg2rad(20))
    bar = sd_box(p, np.array([0.45, 0.65]), np.array([0.38, 0.04]), np.deg2rad(-10))
    return np.minimum(np.minimum(disk, box), bar)


def look_at(C, target=(0.0, 0.0)):
    """World-to-camera (R, t) of a 2D camera at C looking at target (OpenCV: x right, z forward)."""
    fwd = np.asarray(target, float) - C
    fwd /= np.linalg.norm(fwd)
    R = np.array([[fwd[1], -fwd[0]],     # row 1: the camera x axis (right) in world coordinates
                  [fwd[0], fwd[1]]])     # row 2: the camera z axis (forward)
    return R, -R @ C


def render_depth(R, t, sigma=0.0, rng=None, max_range=8.0):
    """z-depth of every pixel by sphere tracing scene_sdf; NaN where the ray escapes."""
    C = -R.T @ t
    rays_c = np.stack([(np.arange(W) - CX) / FOC, np.ones(W)], 1)   # K^-1 (u, 1): z = 1
    norm = np.linalg.norm(rays_c, axis=1)
    dirs = (rays_c / norm[:, None]) @ R                              # R^T d for each ray
    s = np.zeros(W)
    for _ in range(200):
        dist = scene_sdf(C + s[:, None] * dirs)
        s = np.where(dist > 1e-6, s + dist, s)
    depth = np.where(s < max_range, s / norm, np.nan)                 # range -> z-depth
    if sigma > 0:
        depth = depth + sigma * rng.standard_normal(W)
    return depth


def orbit(n, radius=2.6, start=0.0, span=360.0, rng=None, jitter=0.0):
    """n cameras on a circle around the origin, looking at (a jittered point near) the origin."""
    step = span / n if span == 360 else span / max(n - 1, 1)
    cams = []
    for a in np.deg2rad(start + step * np.arange(n)):
        C = radius * np.array([np.cos(a), np.sin(a)])
        target = (0.0, 0.0) if rng is None else jitter * rng.standard_normal(2)
        cams.append(look_at(C, target))
    return cams


def backproject(R, t, depth):
    """World points of the valid pixels: X_w = R^T (d K^-1 (u, 1) - t)."""
    u = np.arange(W)
    pc = np.stack([(u - CX) / FOC * depth, depth], 1)
    ok = np.isfinite(depth)
    return (pc[ok] - t) @ R, ok


rng = np.random.default_rng(0)
cams = orbit(64, rng=rng, jitter=0.15)            # 64 cameras on a circle of radius 2.6 m
scans = [(R, t, render_depth(R, t, sigma=0.02, rng=rng)) for R, t in cams]
d0 = scans[0][2]
print("scan 0: %d of %d pixels hit, depth %.2f to %.2f m"
      % (np.isfinite(d0).sum(), W, np.nanmin(d0), np.nanmax(d0)))
X0, _ = backproject(*cams[0], render_depth(*cams[0]))
print("noise-free back-projection: max |sdf| = %.1e m" % np.abs(scene_sdf(X0)).max())
```

```text
scan 0: 104 of 160 pixels hit, depth 1.54 to 2.97 m
noise-free back-projection: max |sdf| = 1.6e-04 m
```

第二行检查几何：无噪声的深度扫描用 $\mathbf X = R^\top(d\,K^{-1}(u, 1)^\top - \mathbf t)$ 反投影后，落在表面上，误差在球体追踪的容差之内。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-flatland.svg" localized="true" caption="平面国试验台。左：场景（灰色：圆盘、方块和细杆）与环绕的 64 台相机；相机 $k=8$（橙色）发出 160 条射线（每八条画一条），红点是它带噪声的反投影深度读数。右：这次深度扫描随像素 $u$ 的变化，真值（黑）和加了 $\sigma = 2$ cm 噪声的测量值（红）。160 个像素中有 137 个命中物体，深度从 1.57 m 到 2.60 m；跳变处是遮挡边界，射线从一个物体转到另一个物体。" %}

第 2 至 4 节完全像真实系统使用 RGB-D 相机或 MVS 的深度图那样使用这些扫描。算法中没有任何东西是二维特有的：把像素 $u$ 换成 $(u, v)$，把正方形换成立方体，就得到三维版本。

## 2. 用截断有符号距离函数做体素融合

### 2.1 从深度图到有符号距离

深度图告诉我们，沿每个像素的射线，第一个表面在哪里。它还说明了点云会忘掉的两件事：表面**之前**的空间是空的（射线穿过了它），表面**之后**紧挨着的空间很可能是实体。体素融合（volumetric fusion）由 Curless 和 Levoy 于 1996 年提出、由 KinectFusion 在 2011 年做到实时，它在体素网格里恰好存储这些信息。

取中心为 $\mathbf v$ 的一个体素。把它变换到相机坐标 $\mathbf v\_c = R\mathbf v + \mathbf t = (x\_c, z\_c)$，投影到像素 $u = \operatorname{round}(f\_x x\_c / z\_c + c\_x)$，读出那里的深度 $d(u)$。差值

$$
\eta(\mathbf v) = d(u) - z_c
$$

是一个**投影有符号距离**（projective signed distance）：体素在观测表面之前为正，之后为负，在表面上为零。它沿光轴测量，而不是垂直于表面，所以当表面以角度 $\theta$ 被观察时，它大约把真实距离高估为 $1/\cos\theta$ 倍；但它的符号和过零点都是对的，而提取表面只需要这两样。

### 2.2 截断与滑动平均

离表面很远时，$\eta$ 提供的信息很少。表面前方 1 m 的体素是空的，但它到最近表面的确切距离并不知道：也许还有别的表面，只是没有通过这个像素被看到，离它更近。表面后方我们知道得更少，因为根本看不到。所以我们**截断**：取截断距离 $\mu$，

$$
\psi(\mathbf v) = \min\Big(1, \frac{\eta(\mathbf v)}{\mu}\Big)
\quad \text{若 } \eta(\mathbf v) > -\mu, \qquad \text{否则不更新。}
$$

表面之前的体素取值最多为 1（"自由空间"），表面后方 $\mu$ 以内的体素取值最低到 $-1$，更深处的体素不动。

每个体素存储一个值 $F$ 和一个权重 $W$。第 $k$ 次扫描以值 $\psi\_k$ 和权重 $w\_k$ 更新它们：

$$
F \leftarrow \frac{W F + w_k \psi_k}{W + w_k}, \qquad W \leftarrow W + w_k .
$$

为什么是平均？假设多次扫描以独立噪声看到同一个表面点。那么每个 $\psi\_k$ 都是同一个有符号距离的带噪测量，使加权平方误差最小的值

$$
E(F) = \sum_k w_k (F - \psi_k)^2 \quad\Longrightarrow\quad F = \frac{\sum_k w_k \psi_k}{\sum_k w_k}
$$

就是它们的加权平均。上面的更新只是增量地计算这个平均，体素不必记住每一次扫描。Curless 和 Levoy 论证了：在沿射线的高斯噪声下，这个场的零水平集就是距离数据的最小二乘曲面；若 $w\_k = 1/\sigma\_k^2$，它就是最大似然曲面。平均 $n$ 个读数把噪声降为 $1/\sqrt n$，这正是廉价深度相机能产生光滑模型的原因。

### 2.3 算例与代码

一个体素位于相机前方 2.00 m，相机三次看到它后面的表面，深度分别为 2.03、1.98 和 2.05 m，$\mu = 6$ cm。有符号距离为 $+3$、$-2$ 和 $+5$ cm，所以 $\psi = 0.5$、$-0.333$ 和 $0.833$，三次之后的融合值是它们的平均 $0.333$，对应 $\mu F = 2.0$ cm，恰好是三个有符号距离的平均。下面的代码先手算这个体素，再把整次扫描融合进体素边长 2.5 cm 的 $128 \times 128$ 网格。

```python
def make_grid(n=128, extent=1.6):
    """Voxel centres of an n x n grid over [-extent, extent]^2; grid[i, j] is (xs[j], xs[i])."""
    h = 2 * extent / n
    xs = -extent + h * (np.arange(n) + 0.5)
    X, Z = np.meshgrid(xs, xs)
    return xs, np.stack([X, Z], -1).reshape(-1, 2)


def tsdf_integrate(F, Wt, P, R, t, depth, mu, w_max=np.inf):
    """Fuse one depth scan into the TSDF values F and weights Wt of the voxel centres P."""
    pc = P @ R.T + t                                 # voxel centres in camera coordinates
    z = pc[:, 1]
    u = np.full(len(P), -1)
    front = z > 1e-6
    u[front] = np.round(FOC * pc[front, 0] / z[front] + CX).astype(int)   # nearest pixel
    ok = front & (u >= 0) & (u < W)
    sdf = np.full(len(P), np.nan)
    sdf[ok] = depth[u[ok]] - z[ok]                   # projective signed distance along the ray
    ok &= np.isfinite(sdf) & (sdf > -mu)             # skip voxels far behind the surface
    f = np.minimum(1.0, sdf[ok] / mu)                # truncate in front, normalize to [-1, 1]
    F[ok] = (Wt[ok] * F[ok] + f) / (Wt[ok] + 1.0)    # running weighted average
    Wt[ok] = np.minimum(Wt[ok] + 1.0, w_max)


def tsdf_fuse(scans, n=128, extent=1.6, mu=0.06):
    xs, P = make_grid(n, extent)
    F, Wt = np.ones(len(P)), np.zeros(len(P))
    for R, t, depth in scans:
        tsdf_integrate(F, Wt, P, R, t, depth, mu)
    return xs, F.reshape(n, n), Wt.reshape(n, n)


# one voxel 2.00 m in front of the camera, three depth readings of the surface behind it
F1, W1, mu = 1.0, 0.0, 0.06
for d in (2.03, 1.98, 2.05):
    f = min(1.0, (d - 2.00) / mu)
    F1, W1 = (W1 * F1 + f) / (W1 + 1), W1 + 1
    print("reading %.2f: f = %+.3f  ->  F = %+.3f, W = %d, mu F = %+.1f mm" % (d, f, F1, W1, 1000 * mu * F1))

for n_scans in (1, 4, 16, 64):
    xs, F, Wt = tsdf_fuse(scans[::64 // n_scans])
    print("%2d scans: %4.1f%% of the voxels observed" % (n_scans, 100 * np.mean(Wt > 0)))
```

```text
reading 2.03: f = +0.500  ->  F = +0.500, W = 1, mu F = +30.0 mm
reading 1.98: f = -0.333  ->  F = +0.083, W = 2, mu F = +5.0 mm
reading 2.05: f = +0.833  ->  F = +0.333, W = 3, mu F = +20.0 mm
 1 scans: 11.9% of the voxels observed
 4 scans: 46.6% of the voxels observed
16 scans: 89.1% of the voxels observed
64 scans: 93.2% of the voxels observed
```

`tsdf_integrate` 是 KinectFusion 类系统的核心，这里对所有体素向量化：变换、投影、查表、相减、截断、平均。注意它不做什么：它从不搜索最近的表面点，也从不构建网格；每个操作只涉及一个体素和一个像素，因此能在 GPU 上以相机帧率运行。被观测体素的比例停在约 93%：剩下的体素位于物体内部，在所有表面之后比 $\mu$ 更深的地方，没有相机能看到。

### 2.4 看着场收敛

下图显示 1、4、16 和 64 次扫描之后的场，并把提取出的曲面与真值比较（采用第 8 节的准确度和完整度：从重建到真值、从真值到重建的平均距离）。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-tsdf-fusion.svg" localized="true" caption="带噪扫描的 TSDF 融合（$\mu$ = 6 cm，体素 2.5 cm）。左：1、4、16 和 64 次扫描后的融合值 $F$（蓝：自由空间；白：表面；红：紧邻表面之后；灰：从未观测），提取出的过零曲线（黑）以及所用相机的方向（紫）。右：提取曲线的准确度和完整度。一次扫描时表面准确（12.2 mm）但不完整（327 mm）；64 次扫描后两者都达到 2.6-2.7 mm，几乎比单次扫描 20 mm 的噪声低一个数量级。" %}

有两点很突出。完整度随着新视角揭示新表面而迅速改善，准确度则改善得较慢，大致按 $1/\sqrt n$ 下降（从 4 次扫描的 9.2 mm 到 64 次的 2.6 mm，相差 3.5 倍，离平均 16 倍读数所预测的 4 倍不远；图中量的是到第 8 节采样真值的距离，所以第 3 节代码用精确 SDF 量出的 64 次扫描结果是 2.5 mm）。而每个物体的内部始终是灰色的：TSDF 融合从不编造它没有看到的东西。

在下面的小部件里亲手试试。在场景周围拖动相机，松开即扫描一次；"环绕"按钮会自动扫描。观察噪声如何随扫描累积而下降，再用滑块把它弄坏：截断距离小于噪声，或者大于细杆的厚度。

{% include widget.liquid name="3d-vision-tsdf-fusion" height="720" caption="二维 TSDF 融合，场景和相机与正文相同（160 个像素，$f\_x$ = 160 px）。在图上拖动可移动相机（它始终看向中心），松开即扫描一次，也可以按“环绕”。颜色表示 $F$（或权重 $W$），黑色曲线是提取的表面，绿色虚线是真值。读数给出提取曲线按长度加权的平均 $\lvert f\rvert$（准确度），以及真实表面中距它 2 cm 以内的比例（召回率）。改变 $\mu$ 或体素大小会重新融合目前为止的全部扫描。" %}

### 2.5 如何选择截断距离、体素大小和权重

**截断距离 $\mu$。** 截断带必须足够宽以容纳噪声。否则，对表面附近的体素来说，落在真实表面之前超过 $\mu$ 的读数会被丢弃，而落在真实表面之后超过 $\mu$ 的读数只是被截到 $\psi = 1$，平均值就有偏（见练习 1）。它还必须足够窄，以免破坏细小结构。从两侧看细杆：上方的相机把"表面之后"的值（$\psi < 0$）一直写到顶面以下 $\mu$ 处，如果 $\mu$ 超过杆厚，这些值会穿过细杆进入杆下方的自由空间；下方的相机同样向上写，进入杆上方的自由空间。在那里，这些负值与该侧相机写入的较小正值做平均，而在细杆附近负值占上风，因为体素位于一个表面之后的距离大于它位于另一个表面之前的距离。过零点于是向外移动：细杆变得过厚、模糊，不再符合它真实的轮廓。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-truncation.svg" localized="true" caption="截断距离。左：用全部 64 次扫描、$\mu$ = 4.5 cm 融合的细杆（厚 8 cm）：提取的表面（黑）贴合真值（绿色虚线）。中：$\mu$ = 15 cm 时两侧的值相互重叠，负值带扩散开来，细杆被重建得过厚，其真实轮廓只有 50.6% 在 2 cm 内被恢复。右：整个场景的 F 值和细杆上的召回率随 $\mu$ 的变化（均取 $\tau$ = 2 cm）。$\mu \approx \sigma$ 以下噪声占上风（$\mu$ = 2 cm 时 F = 0.939）；3 到 9 cm 之间一切正常；12 cm 时细杆召回率降到 0.58，18 cm 时降到 0.43。" %}

经验法则是 $\mu \approx 2\sigma$ 到 $4\sigma$，并且小于你关心的最薄部分的厚度；实践中通常取几个体素边长。当噪声随深度增大时（例如立体视觉中 $\sigma\_z \propto z^2$，见第 4 篇），截断距离也可以随深度增大。

**体素大小。** 体素必须小于你想要的特征，但小到低于融合表面的噪声就没有意义了。在平面国里，10 cm 的体素完全丢失 8 cm 的细杆（F 值 0.788），5 cm 的体素已达到 0.997，而从 2.5 cm（0.999）缩小到 1.25 cm（0.997）毫无收益，因为剩余误差来自噪声而不是离散化。

**内存。** 稠密网格需要 $n^3$ 个体素：$512^3$ 个体素、每个存 4 字节值和 4 字节权重，就是 1 GiB，几乎全是自由空间。实用系统只为表面附近的体素分配内存。**体素哈希**（voxel hashing，Nießner 等，2013）把 $8^3$ 体素的小块存进以块坐标为键的哈希表，只有当某个深度读数落在块的截断带内时才分配；八叉树和稀疏网格（OpenVDB）用层次结构做同样的事。第 8 篇讨论了这些数据结构。

**权重。** 我们用了 $w\_k = 1$。更好的选择反映读数的可信程度：对随深度变化的噪声用 $w = 1/\sigma\_z^2(z)$，用因子 $\cos\theta$ 降低掠射视角的权重，以及在表面之后让权重逐渐下降的斜坡（Curless 和 Levoy 的原始做法）。KinectFusion 还给 $W$ 设上限，使场能遗忘旧数据、跟上场景的缓慢变化。

**颜色及其他。** 同样的滑动平均可以融合任何逐体素属性：颜色、语义标签或学习到的特征。跟踪是 KinectFusion 的另一半：每个新深度帧先用 ICP 与当前模型的光线投射结果对齐，然后再融合，这使融合变成一个 SLAM 系统（[第 6 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})）。

## 3. 从场到曲面：Marching Squares 与 Marching Cubes

融合得到的场还不是曲面。**Marching Squares**（二维）和 **Marching Cubes**（三维，Lorensen 与 Cline，1987）逐个单元地找出它：把单元的每个角点标为内部（$F < 0$）或外部；只要沿某条边符号改变，就在这条边上线性插值的过零点处放一个顶点，

$$
\mathbf p = \mathbf p_a + \frac{F_a}{F_a - F_b}\,(\mathbf p_b - \mathbf p_a),
$$

然后按照 $2^4 = 16$ 种（正方形）或 $2^8 = 256$ 种（立方体）符号模式的查找表连接单元内的顶点。查找表、有歧义的鞍点情形和对偶轮廓（dual contouring）在[图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})中有推导；这里补充对融合很重要的两个细节。

```python
def marching_squares(F, xs, valid=None, interp=True):
    """Zero crossings of F[i, j] (sampled at (xs[j], xs[i])) as an array of segments (m, 2, 2)."""
    v = [F[:-1, :-1], F[:-1, 1:], F[1:, 1:], F[1:, :-1]]          # corners c0..c3 of every cell
    lo = np.minimum(np.minimum(v[0], v[1]), np.minimum(v[2], v[3]))
    hi = np.maximum(np.maximum(v[0], v[1]), np.maximum(v[2], v[3]))
    cell = (lo < 0) & (hi >= 0)
    if valid is not None:                                           # all four corners observed
        cell &= valid[:-1, :-1] & valid[:-1, 1:] & valid[1:, 1:] & valid[1:, :-1]
    off = [(0, 0), (0, 1), (1, 1), (1, 0)]                          # (di, dj) of c0..c3
    segs = []
    for i, j in zip(*np.nonzero(cell)):
        val = [F[i + di, j + dj] for di, dj in off]
        pos = [np.array([xs[j + dj], xs[i + di]]) for di, dj in off]
        pts = {}
        for e in range(4):                                          # edge e joins corners e, e+1
            a, b = e, (e + 1) % 4
            if (val[a] < 0) != (val[b] < 0):
                s = val[a] / (val[a] - val[b]) if interp else 0.5
                pts[e] = pos[a] + s * (pos[b] - pos[a])
        if len(pts) == 2:
            segs.append(list(pts.values()))
        elif len(pts) == 4:                                         # saddle: decide by the centre
            if (np.mean(val) < 0) == (val[0] < 0):
                segs += [[pts[0], pts[1]], [pts[2], pts[3]]]
            else:
                segs += [[pts[3], pts[0]], [pts[1], pts[2]]]
    return np.array(segs).reshape(-1, 2, 2)


def sample_segments(segs, step=0.004):
    """Points along the segments, about `step` apart."""
    out = []
    for p, q in segs:
        k = max(1, int(np.ceil(np.linalg.norm(q - p) / step)))
        out.append(p + ((np.arange(k) + 0.5) / k)[:, None] * (q - p))
    return np.concatenate(out) if out else np.zeros((0, 2))


for n_scans in (1, 4, 16, 64):
    xs, F, Wt = tsdf_fuse(scans[::64 // n_scans])
    pts = sample_segments(marching_squares(F, xs, Wt > 0))
    print("%2d scans: mean distance of the extracted curve to the true surface %.1f mm"
          % (n_scans, 1000 * np.abs(scene_sdf(pts)).mean()))

for n in (16, 32, 64, 128, 256):
    xs, P = make_grid(n)
    G = scene_sdf(P).reshape(n, n)                    # exact SDF samples, no noise
    e = [1000 * np.abs(scene_sdf(sample_segments(marching_squares(G, xs, interp=i)))).mean()
         for i in (True, False)]
    print("h = %5.1f mm: interpolated %.3f mm, midpoint %.2f mm" % (3200 / n, e[0], e[1]))
```

```text
 1 scans: mean distance of the extracted curve to the true surface 12.2 mm
 4 scans: mean distance of the extracted curve to the true surface 9.2 mm
16 scans: mean distance of the extracted curve to the true surface 3.9 mm
64 scans: mean distance of the extracted curve to the true surface 2.5 mm
h = 200.0 mm: interpolated 9.941 mm, midpoint 37.72 mm
h = 100.0 mm: interpolated 3.699 mm, midpoint 17.90 mm
h =  50.0 mm: interpolated 0.667 mm, midpoint 7.84 mm
h =  25.0 mm: interpolated 0.176 mm, midpoint 4.10 mm
h =  12.5 mm: interpolated 0.045 mm, midpoint 2.20 mm
```

**细节 1：跳过未观测的单元。** 未观测体素保持初值（$F = 1$，$W = 0$）。每个表面之后是一条负值带，负值带之后是 $F = 1$ 的未观测内部：又一次符号变化，也就是在每个物体内部 $\mu$ 处出现一个幻影表面。`valid` 掩码只提取四个角点都有 $W > 0$ 的单元，从而去掉它。任何实现都需要等价的检查。

**细节 2：插值。** 第二个循环在场景的精确 SDF 上，比较用插值放置的顶点和放在边中点的顶点。插值得到的曲面精确得多，体素边长每减半一次，误差约缩小为原来的 1/4，而不是 1/2。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-extraction.svg" localized="true" caption="在精确 SDF 上用 Marching Squares 放置顶点。左：$h$ = 20 cm 网格上的圆盘（蓝点：角点在内部，空心：在外部）。边中点顶点（橙色虚线）形成阶梯，插值顶点（紫色）几乎落在圆上。右：提取曲线的平均 $\lvert f\rvert$ 随体素大小的变化。插值是二阶的（5、2.5、1.25 cm 时分别为 0.667、0.176、0.045 mm：每减半约缩小 4 倍），中点只有一阶（7.84、4.10、2.20 mm：缩小 2 倍）。" %}

为什么是二阶？在表面附近，光滑的 $f$ 除曲率项外是线性的：$f(\mathbf p\_a + s\,\mathbf e) = f\_a + s\,\nabla f\cdot\mathbf e + O(s^2 h^2)$。线性插值精确地找到线性部分的零点，所以误差就是 $O(h^2)$ 的余项，而中点最多可能偏 $h/2$。这就是 TSDF 存连续值而不只是"内"或"外"的原因：数值携带了亚体素信息，Marching Cubes 能把它恢复出来。

## 4. 从点到水密曲面：泊松重建

### 4.1 融合不适用的时候

TSDF 融合需要原始深度图和对应相机，而且只在观测到的地方产生表面。有两种常见情况需要别的方法。有时你手里只有一个带法向的点云：COLMAP 融合后的 MVS 输出、激光雷达扫描，或从神经场采样的点。有时你需要一个**水密**网格，用于三维打印、物理仿真或体积计算，哪怕物体有些部分从未被看到。

**泊松曲面重建**（Poisson surface reconstruction，Kazhdan、Bolitho 与 Hoppe，2006）是标准答案。它的思想（[图形学第 8 篇]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})有详细推导）是：设 $\chi$ 为实体的指示函数。它的梯度除表面外处处为零，在表面上指向内部；因此样本的有向法向经平滑后形成的向量场 $\mathbf V$，就是这个梯度的一个采样。求梯度最贴合 $\mathbf V$ 的 $\chi$，

$$
\min_\chi \int \lVert \nabla\chi - \mathbf V \rVert^2 \, d\mathbf x
\quad\Longrightarrow\quad \Delta\chi = \nabla\cdot\mathbf V ,
$$

再提取一个水平集。因为解是全局的，空洞会被尽可能光滑的曲面填补，噪声也被平均掉。

### 4.2 屏蔽项

普通泊松重建有一个弱点：梯度项只约束差值，所以在法向稀疏或不一致的区域，$\chi$ 可能漂离数据，曲面就被拉离点云。**屏蔽泊松重建**（screened Poisson，Kazhdan 与 Hoppe，2013）增加一项，要求 $\chi$ 在输入点处取固定值。取 $\chi$ 内部约为 $+\tfrac12$、外部约为 $-\tfrac12$，表面就是 $\chi = 0$，能量变为

$$
E(\chi) = \int \lVert \nabla\chi - \mathbf V \rVert^2 \, d\mathbf x + \alpha \sum_i \ell_i\, \chi(\mathbf p_i)^2 ,
$$

其中 $\ell\_i$ 是样本 $i$ 代表的曲线长度（三维中是面积），$\alpha$ 控制屏蔽的强度。在网格上，$\nabla$ 变成稀疏差分矩阵 $G$，在样本处取值变成稀疏双线性插值矩阵 $B$，令 $E$ 的梯度为零，得到一个稀疏、对称、正定的方程组：

$$
\big(G^\top G + \alpha\, B^\top L B\big)\,\boldsymbol\chi = G^\top \mathbf v, \qquad L = \operatorname{diag}(\ell_i).
$$

实际实现在自适应八叉树上用多重网格求解；我们 $128 \times 128$ 的网格用 SciPy 的稀疏直接求解器就够了。

### 4.3 代码与结果

这一次相机只覆盖圆周的 210°，场景有些部分从未被看到。有向点直接来自扫描：每个法向是其 60 个最近邻的最小方差方向（Hoppe 等，1992），符号由看到该点的相机决定，因为可见表面必然朝向相机。这种按传感器位置定向的办法，比原始点云所需的生成树传播可靠得多。

```python
import scipy.sparse as sp
from scipy.sparse.linalg import spsolve
from scipy.spatial import cKDTree


def oriented_points(scans, k=60):
    """Merge the back-projected scans; PCA normals from k neighbours, flipped toward the camera
    that saw each point."""
    P, C = [], []
    for R, t, depth in scans:
        X, _ = backproject(R, t, depth)
        P.append(X)
        C.append(np.repeat((-R.T @ t)[None], len(X), 0))
    P, C = np.concatenate(P), np.concatenate(C)
    nb = cKDTree(P).query(P, k)[1]
    Q = P[nb] - P[nb].mean(1, keepdims=True)
    N = np.linalg.eigh(np.einsum("nki,nkj->nij", Q, Q))[1][:, :, 0]   # smallest eigenvector
    N *= np.sign(((C - P) * N).sum(1))[:, None]
    return P, N


def bilinear_matrix(P, xs):
    """Sparse B with B @ g.ravel() = bilinear interpolation of the node values g[i, j] at P."""
    n, h = len(xs), xs[1] - xs[0]
    fx = np.clip((P[:, 0] - xs[0]) / h, 0, n - 1 - 1e-9)
    fz = np.clip((P[:, 1] - xs[0]) / h, 0, n - 1 - 1e-9)
    j, i = np.floor(fx).astype(int), np.floor(fz).astype(int)
    a, b = fx - j, fz - i
    rows = np.repeat(np.arange(len(P)), 4)
    cols = np.stack([i * n + j, i * n + j + 1, (i + 1) * n + j, (i + 1) * n + j + 1], 1).ravel()
    vals = np.stack([(1 - a) * (1 - b), a * (1 - b), (1 - a) * b, a * b], 1).ravel()
    return sp.csr_matrix((vals, (rows, cols)), shape=(len(P), n * n))


def screened_poisson(P, N, xs, alpha=0.0, k=60):
    """Indicator chi (about +1/2 inside, -1/2 outside) whose gradient fits the splatted inward
    normals, screened toward chi = 0 at the points with weight alpha. Returns chi and the iso-value."""
    n, h = len(xs), xs[1] - xs[0]
    ell = 2 * cKDTree(P).query(P, k + 1)[0][:, -1] / k        # curve length each point stands for
    D = sp.diags([-np.ones(n - 1), np.ones(n - 1)], [0, 1], shape=(n - 1, n)) / h
    Gx, Gz = sp.kron(sp.identity(n), D).tocsr(), sp.kron(D, sp.identity(n)).tocsr()
    sig, tree = 1.5 * h, cKDTree(P)

    def splat(Q, comp):                                        # V = -sum ell_i N_i G_sig(x - p_i)
        V = np.zeros(len(Q))
        for q, nb in enumerate(tree.query_ball_point(Q, 4 * sig)):
            if nb:
                d2 = ((P[nb] - Q[q]) ** 2).sum(1)
                V[q] = -(ell[nb] * N[nb, comp] * np.exp(-d2 / (2 * sig ** 2))).sum() / (2 * np.pi * sig ** 2)
        return V
    vx = splat(np.stack(np.meshgrid(xs[:-1] + h / 2, xs), -1).reshape(-1, 2), 0)   # x-edge midpoints
    vz = splat(np.stack(np.meshgrid(xs, xs[:-1] + h / 2), -1).reshape(-1, 2), 1)   # z-edge midpoints
    B = bilinear_matrix(P, xs)
    A = (Gx.T @ Gx + Gz.T @ Gz) * h * h + alpha * (B.T @ sp.diags(ell) @ B) + 1e-9 * sp.identity(n * n)
    chi = spsolve(A.tocsc(), (Gx.T @ vx + Gz.T @ vz) * h * h).reshape(n, n)
    iso = 0.0 if alpha > 0 else np.average(B @ chi.ravel(), weights=ell)
    return chi, iso


arc = orbit(24, start=-60, span=210, rng=rng, jitter=0.15)      # cameras on 210 degrees only
arc_scans = [(R, t, render_depth(R, t, sigma=0.02, rng=rng)) for R, t in arc]
P_arc, N_arc = oriented_points(arc_scans)
xs, _ = make_grid(128)
for alpha in (0.0, 32.0):
    chi, iso = screened_poisson(P_arc, N_arc, xs, alpha)
    pts = sample_segments(marching_squares(chi - iso, xs))
    print("alpha = %4.1f: chi in [%+.2f, %+.2f], iso %.3f, mean |sdf| of the curve %.1f mm"
          % (alpha, chi.min(), chi.max(), iso, 1000 * np.abs(scene_sdf(pts)).mean()))
```

```text
alpha =  0.0: chi in [-0.62, +0.95], iso 0.276, mean |sdf| of the curve 60.5 mm
alpha = 32.0: chi in [-0.54, +0.54], iso 0.000, mean |sdf| of the curve 22.7 mm
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-poisson.svg" localized="true" caption="由 210° 圆弧上 24 次扫描重建（紫色：相机方向）。左：TSDF 融合只保留看到的部分；圆盘左下方和方块左侧仍是开口的（灰：未观测）。中：普通泊松封闭了所有空洞，但指示函数发生漂移（从 $-0.62$ 到 $+0.95$，等值 0.276），方块未观测的一侧鼓成一团；曲线的平均 $\lvert f\rvert$ 为 60.5 mm。右：屏蔽泊松（$\alpha$ = 32）把 $\chi$ 保持在 $\pm 0.54$ 以内，紧贴样本（红），并紧凑地封闭空洞（22.7 mm）。黄色虚线是真值。" %}

这张图很好地概括了其中的取舍。TSDF 融合是诚实的：没有数据的地方就没有表面。泊松是完整的：它总是返回封闭曲面，在没有数据的地方返回最光滑的猜测。屏蔽项让猜测更贴近数据，但它仍然是猜测；第 8 节会展示评测指标如何对待它。实际流水线会裁掉泊松网格中支持最弱的部分，即样本密度低的面片（PoissonRecon 代码中的 `SurfaceTrimmer` 工具，或 Open3D 中的密度阈值）。

### 4.4 其他网格化方法与纹理映射

还有两类方法值得了解。**基于可见性的 Delaunay 网格化**（OpenMVS 和 COLMAP 的 `delaunay_mesher` 采用）先对点做四面体剖分，再用图割（graph cut）把每个四面体标为内部或外部，图割利用了相机的视线（从相机到某点的射线只穿过自由空间）。它保留锐利细节，处理大型室外场景效果好。**滚球法**（ball pivoting）让一个球在点上滚动，连接它同时接触的三个点；它精确插值这些点，但只要采样比球稀疏，就会留下空洞。

最后，用于观看的网格需要**纹理**：每个三角形选择看它最清楚的图像（近、正对、清晰），相邻三角形倾向于选同一张图像以避免接缝（标签上的马尔可夫随机场），再做一次全局颜色调整以掩盖剩余的曝光差异，例如 Waechter、Moehrle 和 Goesele（ECCV 2014）的方法，许多开源流水线都在使用。

## 5. 实践中的经典流水线

用 COLMAP，从图像到网格的整条链只需几条命令（来自 COLMAP 命令行文档；本文没有运行这段代码）：

```bash
colmap feature_extractor --database_path db.db --image_path images
colmap exhaustive_matcher --database_path db.db
mkdir sparse
colmap mapper --database_path db.db --image_path images --output_path sparse
colmap image_undistorter --image_path images --input_path sparse/0 --output_path dense --output_type COLMAP
colmap patch_match_stereo --workspace_path dense --workspace_format COLMAP --PatchMatchStereo.geom_consistency true
colmap stereo_fusion --workspace_path dense --workspace_format COLMAP --input_type geometric --output_path dense/fused.ply
colmap poisson_mesher --input_path dense/fused.ply --output_path dense/meshed-poisson.ply
colmap delaunay_mesher --input_path dense --output_path dense/meshed-delaunay.ply
```

这些阶段与本系列一一对应：特征与匹配（第 3 篇），带光束法平差的增量式 SfM（第 5 篇；`glomap mapper` 是全局式的替代），去畸变（第 1 篇），带几何一致性的 PatchMatch MVS（第 7 篇），融合与网格化。COLMAP 的 `stereo_fusion` 不是 TSDF：它把在多个视图中深度和法向一致的深度图像素合并成点，适合用体素网格会很浪费的无界室外场景。相比之下，Open3D 为 RGB-D 序列提供 TSDF 融合。

这条链在哪里失败？几乎总是在前端。无纹理的墙面、反光和重复图案会破坏匹配；重叠太少或纯旋转会破坏 SfM（第 4 篇解释了这些退化情形）；少数错误的相机随后污染下游的一切。MVS 在同样的无纹理和镜面区域也会吃力，融合点云在那里出现空洞和漂浮物。学习方法攻击的正是这个缺口：在数百万张图像上训练的网络，拥有光度一致性分数所缺乏的、关于墙面、地面和物体形状的先验。

## 6. 神经曲面

### 6.1 为什么不直接用 NeRF 的密度？

NeRF（[神经渲染第 2 篇]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})）拟合一个密度 $\sigma(\mathbf x)$ 和颜色，使体渲染重现图像。可以在某个密度水平上提取网格，但结果很差。光度损失中没有任何东西要求密度集中在表面上：一团能渲染出正确颜色的半透明云同样好，所以水平集噪声很大，合适的阈值也因地而异。神经曲面方法改变了表示：它们存储一个**有符号距离函数** $f$，其零水平集按定义就是表面，再由它导出密度。问题在于怎么导出。

### 6.2 从 SDF 到渲染权重：偏差问题

沿射线 $\mathbf r(t) = \mathbf o + t\,\mathbf d$，体渲染把颜色写成 $C = \int w(t)\,\mathbf c(t)\,dt$，权重 $w(t) = T(t)\,\sigma(t)$，透射率 $T(t) = \exp(-\int\_0^t \sigma)$。我们希望权重具有两个性质：

- **无偏**（unbiased）：对于射线穿过的表面，$w$ 恰好在射线与表面相交处 $f(\mathbf r(t^\ast)) = 0$ 取峰值，使渲染出的深度和颜色来自表面；
- **感知遮挡**（occlusion-aware）：射线遇到两个表面时，近的那个获得（几乎）全部权重。

记 $\Phi\_s(x) = 1/(1 + e^{-sx})$ 为锐度 $s$ 的 sigmoid，$\phi\_s = \Phi\_s'$ 是它的导数，即 logistic 密度，一个宽约 $1/s$ 的鼓包。显而易见的选择是**朴素**密度 $\sigma(t) = \phi\_s(f(\mathbf r(t)))$：表面附近大，别处小。它无偏吗？取一个以入射角 $\theta$ 相交的平面，于是 $f(\mathbf r(t)) = -c\,(t - t^\ast)$，$c = \cos\theta$。权重在 $w' = T(\sigma' - \sigma^2) = 0$ 处取峰，即 $\sigma' = \sigma^2$。记 $\Phi = \Phi\_s(f)$，则 $\sigma = s\Phi(1-\Phi)$，$\sigma' = -c\,s^2\Phi(1-\Phi)(1-2\Phi)$，条件变为

$$
c\,(2\Phi - 1) = \Phi(1-\Phi)
\quad\Longrightarrow\quad
\Phi^\ast = \frac{1 - 2c + \sqrt{4c^2 + 1}}{2},
\qquad
t_{\text{peak}} - t^\ast = -\frac{1}{s\,c}\,\ln\frac{\Phi^\ast}{1 - \Phi^\ast} .
$$

峰值总是在表面**之前**。正对时（$c = 1$），$\Phi^\ast = (\sqrt5 - 1)/2 = 0.618$（恰好是黄金分割比），偏差为 $-0.481/s$；掠射时偏差增长得比 $1/\cos\theta$ 还快：当 $c \to 0$ 时，$\Phi^\ast \approx 1 - c$，偏差趋于 $-\ln(1/c)/(s\,c)$。直观地说：射线到达过零点之前，密度已经开始吸收光线，所以 $\sigma$ 达到峰值时透射率已经下降。另一种简单选择是归一化鼓包 $w = \phi\_s(f)/\int\phi\_s(f)$，它无偏，却不考虑遮挡：射线上每个表面得到相同的权重。

**NeuS**（Wang 等，2021）推导出同时具备两个性质的密度。先看平面上我们想要什么：权重应该就是鼓包本身，$w(t) = c\,\phi\_s(f(\mathbf r(t)))$，它在 $t^\ast$ 处取峰。由于 $\frac{d}{dt}\Phi\_s(f(\mathbf r(t))) = -c\,\phi\_s(f)$，当透射率恰好等于 $T(t) = \Phi\_s(f(\mathbf r(t)))$ 时这一点成立：它在表面前方很远处（$f$ 为大正数）接近 1，在表面之后降到 0。透射率通过 $\sigma = -T'/T$ 决定密度，由此得到**不透明密度**（opaque density）

$$
\rho(t) = \max\left( \frac{-\frac{d}{dt}\Phi_s\big(f(\mathbf r(t))\big)}{\Phi_s\big(f(\mathbf r(t))\big)},\; 0 \right),
$$

其中在零处截断用于一般情形：射线离开物体时 $\Phi\_s$ 又会增大，公式会给出负密度。在两个样本 $t\_i$ 和 $t\_{i+1}$ 之间对 $\rho$ 积分得 $\int \rho\,dt = -\ln(\Phi\_s(f\_{i+1}) / \Phi\_s(f\_i))$，于是一段的不透明度为

$$
\alpha_i = 1 - \exp\Big(-\int_{t_i}^{t_{i+1}} \rho\,dt\Big) = \max\left( \frac{\Phi_s(f_i) - \Phi_s(f_{i+1})}{\Phi_s(f_i)},\; 0 \right),
$$

剩下的交给通常的合成公式 $w\_i = T\_i\alpha\_i$，$T\_i = \prod\_{j<i}(1 - \alpha\_j)$。锐度 $s$ 是一个可学习参数：训练初期 $1/s$ 较大，权重分布较宽，有利于优化；随着表面变清晰，$s$ 增大。

### 6.3 用数值检验这些结论

```python
def sigmoid(x):
    return 0.5 * (1 + np.tanh(0.5 * x))          # = 1 / (1 + exp(-x)), without overflow


def weights_from_alpha(alpha):
    """w_i = T_i alpha_i with T_i = prod_{j<i} (1 - alpha_j), the volume rendering weights."""
    T = np.concatenate([np.ones(alpha.shape[:-1] + (1,)), np.cumprod(1 - alpha, -1)[..., :-1]], -1)
    return T * alpha


def alpha_naive(f, s, dt):
    """Density sigma = phi_s(f), the logistic density of the SDF: alpha = 1 - exp(-sigma dt)."""
    phi = s * sigmoid(s * f) * (1 - sigmoid(s * f))
    return 1 - np.exp(-phi[..., :-1] * dt)


def alpha_neus(f, s):
    """NeuS: alpha_i = max((Phi_s(f_i) - Phi_s(f_{i+1})) / Phi_s(f_i), 0)."""
    Phi = sigmoid(s * f)
    return np.clip((Phi[..., :-1] - Phi[..., 1:]) / np.maximum(Phi[..., :-1], 1e-12), 0, 1)


t = np.linspace(0.0, 4.0, 8001)
dt, t_star, s = t[1] - t[0], 2.0, 20.0
for theta in (0, 60, 80):
    c = np.cos(np.deg2rad(theta))
    f = -c * (t - t_star)                        # SDF along a ray that meets a plane at t* = 2
    peak = {}
    for name, a in (("naive", alpha_naive(f, s, dt)), ("NeuS", alpha_neus(f, s))):
        peak[name] = t[np.argmax(weights_from_alpha(a))] + dt / 2 - t_star
    Phi = (1 - 2 * c + np.sqrt(4 * c * c + 1)) / 2           # the peak condition derived in 6.2
    print("theta = %2d deg: peak - t* = %+.4f (naive), %+.4f (NeuS); theory for naive %+.4f"
          % (theta, peak["naive"], peak["NeuS"], -np.log(Phi / (1 - Phi)) / (s * c)))
```

```text
theta =  0 deg: peak - t* = -0.0237 (naive), +0.0002 (NeuS); theory for naive -0.0241
theta = 60 deg: peak - t* = -0.0877 (naive), +0.0002 (NeuS); theory for naive -0.0881
theta = 80 deg: peak - t* = -0.5122 (naive), +0.0002 (NeuS); theory for naive -0.5124
```

朴素方法的峰值按预测的量落在表面之前（实测 $-0.0237$、$-0.0877$ 和 $-0.5122$ m，公式给出 $-0.0241$、$-0.0881$ 和 $-0.5124$ m，差别在曲线的采样精度之内），而 NeuS 的峰值在任何角度都位于表面上（$+0.0002$ 是半个采样间隔）。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-neus-weights.svg" localized="true" caption="沿一条射线的渲染权重 $w(t)$，$s = 20$。左：位于 $t^\ast = 2$ 的平面，正对（实线）和 60° 入射（虚线）。朴素权重（橙）的峰值分别在表面前 2.4 cm 和 8.8 cm；NeuS 权重（紫）的峰值在表面上。右：30 cm 厚的板之后还有一个位于 $t = 3$ 的表面（绿：SDF $f(t)$，右轴）。朴素密度给前表面 0.612、板的背面 0.237、被遮挡的表面 0.094 的权重；归一化鼓包 $\bar\phi\_s$（点线）把 0.33-0.34 平均分给三处；NeuS 给前表面 0.950、背面 0.000、被遮挡的表面 0.047，这恰好是在这个 $s$ 下穿透板的光。" %}

第二个小部件让你改变 $s$、角度和采样数。注意：只要 $1/s$ 不比采样间隔小太多，离散的 NeuS 权重（柱状）即使采样很少也保持以表面为中心；反之，全部权重落进一个区间，表面位置被量化，这就是 NeuS 要在表面附近分层追加采样的原因。

{% include widget.liquid name="3d-vision-neus-weights" height="520" caption="沿一条射线由 SDF 得到的渲染权重。可选一个平面，或一块板加其后的第二个表面；在图上拖动（左右：锐度 $s$；上下：入射角 $\theta$）或使用滑块。橙：朴素密度 $\sigma = \phi\_s(f)$；紫：NeuS，二者都用 2000 个采样；柱状：只用 $n$ 个采样的 NeuS。读数把朴素峰值与第 6.2 节的闭式偏差比较，并给出两者的总不透明度。" %}

### 6.4 Eikonal 项与迷你 NeuS

输出 $f$ 的网络或网格并不自动成为距离函数。**Eikonal** 正则项 $\mathcal L\_{\text{eik}} = \mathbb E\big[(\lVert\nabla f\rVert - 1)^2\big]$ 由 Gropp 等（IGR，2020）引入隐式曲面学习，它推动梯度模长趋近 1，因为真正的 SDF 几乎处处梯度为单位长度。没有它，$f$ 在表面附近可能变得很陡或很平，$s$ 与权重鼓包宽度之间的关系（以单位梯度为前提）就失效了。

为了看到整个方法的运作，下一段代码在平面国里拟合一个 NeuS。SDF 存储在 $96 \times 96$ 的节点网格上并做双线性插值（代替真实方法中的 MLP 或哈希网格），每台相机每隔一个像素发一条射线，在 1.0 到 4.2 m 之间取 128 个采样，损失比较渲染不透明度 $O = \sum\_i w\_i$ 与轮廓（射线是否击中物体），以及渲染深度 $D = \sum\_i w\_i t\_i$ 与真实距离。NeuS 以颜色为主要信号，掩码项（与我们的类似）是一个选项；在平面国里用深度可以让例子更短。梯度是手写的：对渲染量 $Q = \sum\_k w\_k q\_k$，$\partial Q/\partial\alpha\_k = T\_k(q\_k - A\_{k+1})$，其中 $A\_k = \alpha\_k q\_k + (1 - \alpha\_k)A\_{k+1}$ 是从样本 $k$ 往后渲染得到的值，链式法则再经过 $\alpha\_k = 1 - \Phi\_{k+1}/\Phi\_k$ 和 $\Phi\_k = \Phi\_s(f\_k)$（即 $s f\_k$ 的 sigmoid）传到网格。（与有限差分检验的结果在六位有效数字上一致。）

```python
def neus_render(g, log_s, B, t_mid, n_samp, dO=None, dD=None):
    """Opacity O and depth D of every ray for the grid SDF g. With dO = dL/dO and dD = dL/dD,
    also return dL/dg and dL/dlog_s (backpropagation written out by hand)."""
    s = np.exp(log_s)
    f = (B @ g).reshape(-1, n_samp)                 # SDF at the samples of every ray
    Phi = sigmoid(s * f)
    ratio = Phi[:, 1:] / np.maximum(Phi[:, :-1], 1e-12)
    alpha = np.clip(1 - ratio, 0, 1)
    w = weights_from_alpha(alpha)
    O, D = w.sum(1), (w * t_mid).sum(1)
    if dO is None:
        return O, D, w
    # for C = sum_k w_k c_k:  dC/dalpha_k = T_k (c_k - A_{k+1}),  A_k = alpha_k c_k + (1 - alpha_k) A_{k+1}
    T = np.concatenate([np.ones((len(f), 1)), np.cumprod(1 - alpha, 1)[:, :-1]], 1)
    c = dO[:, None] + dD[:, None] * t_mid           # both outputs at once
    A, acc = np.zeros_like(alpha), np.zeros(len(f))
    for k in range(alpha.shape[1] - 1, -1, -1):
        A[:, k] = acc
        acc = alpha[:, k] * c[:, k] + (1 - alpha[:, k]) * acc
    g_alpha = T * (c - A) * (ratio < 1)             # no gradient where alpha was clipped to 0
    pk = np.maximum(Phi[:, :-1], 1e-12)
    dPhi = np.zeros_like(Phi)
    dPhi[:, :-1] += g_alpha * Phi[:, 1:] / pk ** 2  # alpha_k = 1 - Phi_{k+1} / Phi_k
    dPhi[:, 1:] -= g_alpha / pk
    dx = dPhi * Phi * (1 - Phi)                     # dL/d(s f)
    return O, D, w, B.T @ (dx * s).ravel(), (dx * f).sum() * s


def cell_gradient(n, h):
    """Sparse Cx, Cz: the gradient of a node grid at the (n-1)^2 cell centres."""
    D = sp.diags([-np.ones(n - 1), np.ones(n - 1)], [0, 1], shape=(n - 1, n)) / h
    M = sp.diags([0.5 * np.ones(n - 1), 0.5 * np.ones(n - 1)], [0, 1], shape=(n - 1, n))
    return sp.kron(M, D).tocsr(), sp.kron(D, M).tocsr()


def eikonal(g, Cx, Cz):
    """Mean of (|grad g| - 1)^2 over the cells, and its gradient with respect to g."""
    gx, gz = Cx @ g, Cz @ g
    nrm = np.sqrt(gx ** 2 + gz ** 2) + 1e-12
    r = nrm - 1
    return np.mean(r ** 2), Cx.T @ (2 * r / nrm / len(r) * gx) + Cz.T @ (2 * r / nrm / len(r) * gz)


def fit_neus(cams, n=96, n_samp=128, t_near=1.0, t_far=4.2, iters=800, lam_d=1.0, lam_e=0.3,
             lr=0.01, log_every=(0, 50, 200, 800)):
    # rays through every second pixel, with their true silhouette (hit or not) and range
    pts, m_gt, r_gt = [], [], []
    ts = np.linspace(t_near, t_far, n_samp)
    for R, t in cams:
        u = np.arange(0, W, 2)
        ray = np.stack([(u - CX) / FOC, np.ones(len(u))], 1)
        nrm = np.linalg.norm(ray, axis=1)
        d = render_depth(R, t)[u]
        dirs = (ray / nrm[:, None]) @ R
        pts.append(-R.T @ t + ts[None, :, None] * dirs[:, None, :])
        m_gt.append(np.isfinite(d)); r_gt.append(np.nan_to_num(d * nrm))
    pts = np.concatenate(pts).reshape(-1, 2)
    m_gt, r_gt = np.concatenate(m_gt), np.concatenate(r_gt)
    t_mid = 0.5 * (ts[1:] + ts[:-1])
    xs = np.linspace(-1.6, 1.6, n)                  # SDF values on the nodes of an n x n grid
    B = bilinear_matrix(pts, xs)
    Cx, Cz = cell_gradient(n, xs[1] - xs[0])
    GX, GZ = np.meshgrid(xs, xs)
    theta = [np.sqrt(GX ** 2 + GZ ** 2).ravel() - 1.0, np.array(np.log(10.0))]   # a circle, s = 10
    m1, m2 = [np.zeros_like(p) for p in theta], [np.zeros_like(p) for p in theta]
    log = {}
    for it in range(iters + 1):
        O, D, w = neus_render(theta[0], theta[1], B, t_mid, n_samp)
        loss_e, grad_e = eikonal(theta[0], Cx, Cz)
        loss = np.mean((O - m_gt) ** 2) + lam_d * np.mean((D - r_gt)[m_gt] ** 2) + lam_e * loss_e
        if it in log_every:
            log[it] = (theta[0].reshape(n, n).copy(), float(np.exp(theta[1])), loss)
            print("iter %4d: loss %.5f, s = %6.1f" % (it, loss, np.exp(theta[1])))
        if it == iters:
            break
        dO = 2 * (O - m_gt) / len(O)
        dD = lam_d * 2 * (D - r_gt) * m_gt / m_gt.sum()
        _, _, _, grad_g, grad_s = neus_render(theta[0], theta[1], B, t_mid, n_samp, dO, dD)
        for k, gr in enumerate((grad_g + lam_e * grad_e, np.array(grad_s))):   # Adam
            m1[k] = 0.9 * m1[k] + 0.1 * gr
            m2[k] = 0.999 * m2[k] + 0.001 * gr ** 2
            theta[k] = theta[k] - lr * m1[k] / (1 - 0.9 ** (it + 1)) / (np.sqrt(m2[k] / (1 - 0.999 ** (it + 1))) + 1e-8)
    return xs, theta[0].reshape(n, n), log


xs_n, g_fit, neus_log = fit_neus(orbit(24))
pts = sample_segments(marching_squares(g_fit, xs_n))
err = 1000 * np.abs(scene_sdf(pts))
print("NeuS zero level set: mean |sdf| %.1f mm, median %.1f mm" % (err.mean(), np.median(err)))
```

```text
iter    0: loss 0.60269, s =   10.0
iter   50: loss 0.20917, s =   15.0
iter  200: loss 0.02043, s =   43.3
iter  800: loss 0.00271, s =  223.0
NeuS zero level set: mean |sdf| 16.4 mm, median 8.0 mm
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-neus-fit.svg" localized="true" caption="用 NeuS 方式把 $96 \times 96$ 的 SDF 网格拟合到 24 台相机（紫）的深度和轮廓。颜色：$f$（红为内部，蓝为外部）；黑：零水平集；黄色虚线：真值。拟合从半径 1 m 的圆、$s$ = 10 开始。Adam 迭代 50 步后，圆开始向轮廓变形；200 步后三个物体已经分开；800 步后学到的锐度增长到 $s$ = 223，零水平集到真实表面的距离中位数为 8.0 mm（平均 16.4 mm，被方块内部一些小的伪轮廓拉高，那里没有任何射线能看到）。" %}

图中的演化过程是神经曲面方法的典型表现：粗略形状很快出现，随着表面与观测趋于一致 $s$ 不断增大，细节最后才出现。没有射线约束的区域（这里是物体内部）只受正则项支配，所以 Eikonal 项和良好的初始化如此重要。

### 6.5 Neuralangelo 与高斯路线

使用 MLP 的 NeuS 很慢，还会把细节抹平。**Neuralangelo**（Li 等，2023）把 SDF 存进多分辨率哈希网格（[快速辐射场]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})），并做了两项改动，使它在大场景上也能得到精细细节：用**数值**有限差分计算 Eikonal 项所需的梯度，差分步长在训练中逐渐缩小（哈希网格的解析梯度局限于单个单元，噪声大）；以及**由粗到细**地优化哈希网格的各个层级。VolSDF（Yariv 等，2021）是这一家族的另一篇经典：它把密度定义为 $-f$ 的拉普拉斯累积分布函数乘以一个系数，并给出了其采样的不透明度误差上界。

最新的曲面方法则从高斯泼溅出发。三维高斯沿射线没有明确的深度，因此**二维高斯泼溅**（2DGS，Huang 等，2024）把每个基元压扁成有朝向的圆盘，它与每条射线的交点是精确的，并加入深度失真损失和法向一致性损失；**Gaussian Opacity Fields** 直接由高斯定义一个水平集。[3DGS 前沿一篇]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})解释了两者。这里重要的是 2DGS 如何提取网格：它从训练视角渲染深度图，**用 TSDF 融合它们**，再运行 Marching Cubes。本文第 2、3 节就是一篇 2024 年方法的最后一步。

## 7. 前馈式三维基础模型

### 7.1 从流水线到一个网络

到目前为止的一切都是针对每个场景、用手工设计的目标做优化：重投影误差、光度一致性、渲染损失。2024 年，另一种思路兴起。**DUSt3R**（Wang 等，CVPR 2024）在大量三维数据集的混合上训练了一个 Transformer，直接把两张图像映射为稠密三维几何，不需要已知的内参或位姿。它的后继能一次处理多个视图（VGGT）、加入匹配（MASt3R）、处理视频流（CUT3R 和各种流式变体），并预测度量尺度（MapAnything，以及 Depth Anything 3 的度量模型）。对于只有几张照片的随手拍摄（SfM 会失败或要几分钟），这些模型现在往往给出更好的结果，许多 NeRF 和 3DGS 流水线也用它们的输出初始化或替代 COLMAP。

### 7.2 DUSt3R：点图

DUSt3R 的关键设计在于输出。它不预测深度（需要内参才能变成三维），也不预测相机（需要匹配），而是预测**点图**（pointmap）：对一张 $H \times W$ 像素的图像，一个数组 $X \in \mathbb R^{H\times W\times 3}$，给每个像素赋一个三维点。给定图像 1 和 2，网络输出

- $X^{1,1}$：图像 1 看到的点，位于**相机 1 的坐标系**；
- $X^{2,1}$：图像 2 看到的点，**同样位于相机 1 的坐标系**；
- 两者的置信度图 $C^{1,1}$ 和 $C^{2,1}$。

记号 $X^{n,m}$ 表示"图像 $n$ 的像素，相机 $m$ 的坐标"。由于两个点图在同一坐标系中，两视图的相对几何就隐含在其中：两张图像中看到同一表面点的像素得到相同的三维坐标。匹配、相对位姿和内参都可以从中读出。

在结构上，两张图像经过一个共享的 ViT 编码器，两个解码器在每一层通过交叉注意力交换信息，两个 DPT 式的输出头回归点图和置信度。由于无法从图像得知场景尺度，回归损失比较尺度归一化后的点图：记真值为 $\bar X$，$z$ 和 $\bar z$ 为有效点到原点的平均距离，

$$
\ell_{\text{regr}}(v, i) = \Big\lVert \tfrac{1}{z} X^{v,1}_i - \tfrac{1}{\bar z}\bar X^{v,1}_i \Big\rVert,
\qquad
\mathcal L_{\text{conf}} = \sum_{v\in\{1,2\}} \sum_i C^{v,1}_i\, \ell_{\text{regr}}(v, i) - \beta \log C^{v,1}_i .
$$

置信度项让网络可以说"我不知道"（天空、反光、遮挡），但要付出代价：较小的 $C$ 降低误差的权重，却要付出 $-\beta\log C$。

下面在一个三维玩具场景（地面、两个方块和一个球）上看看能从点图读出什么，两台 $64 \times 48$ 的针孔相机采用第 1 篇的 OpenCV 坐标约定。"网络"是模拟的：它返回尺度未知的真实点图，带 2% 的三维噪声，并有 5% 置信度低的外点。

**焦距。** 设主点在图像中心、像素为正方形，则每个像素 $(u\_i, v\_i)$ 及其在相机坐标系中的三维点 $(X\_i, Y\_i, Z\_i)$ 必须满足 $(u\_i - c\_x, v\_i - c\_y) = f\_x\,(X\_i/Z\_i, Y\_i/Z\_i)$。DUSt3R 通过最小化 $\sum\_i C\_i\,\lVert (u\_i - c\_x, v\_i - c\_y) - f\_x (X\_i, Y\_i)/Z\_i \rVert$ 估计 $f\_x$，这是一个鲁棒的（不平方的）代价，用 Weiszfeld 算法求解：交替进行加权最小二乘，权重为 $C\_i / r\_i$，$r\_i$ 是当前残差。

**相对位姿。** 交换两张图像再运行一次网络，得到 $X^{1,2}$，即图像 1 的点在相机 2 坐标系中的坐标。于是 $X^{1,1}$ 和 $X^{1,2}$ 是同一组点在两个坐标系中的表示，相差一个相似变换，Umeyama（Procrustes）方法用一次 SVD 就能闭式求出它：旋转是确定的，平移确定到一个尺度因子。（另一种做法是在 $X^{2,1}$ 上用 RANSAC 求解 PnP。）

```python
H3, W3, F3 = 48, 64, 56.0                            # a small 64 x 48 pinhole camera
K3 = np.array([[F3, 0, (W3 - 1) / 2], [0, F3, (H3 - 1) / 2], [0, 0, 1]])


def sdf3(p):
    """A ground plane (y = 0.6; the OpenCV world has y down), two boxes and a ball."""
    def box(p, c, b):
        q = np.abs(p - c) - b
        return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(-1), 0)
    ground = 0.6 - p[..., 1]
    b1 = box(p, np.array([-0.5, 0.25, 0.2]), np.array([0.35, 0.35, 0.35]))
    b2 = box(p, np.array([0.55, 0.35, -0.3]), np.array([0.25, 0.25, 0.4]))
    ball = np.linalg.norm(p - np.array([0.2, 0.2, 0.7]), axis=-1) - 0.4
    return np.minimum(np.minimum(ground, ball), np.minimum(b1, b2))


def look_at3(C, target=(0.0, 0.2, 0.0), down=(0.0, 1.0, 0.0)):
    """World-to-camera (R, t) with OpenCV axes: x right, y down, z forward."""
    z = np.asarray(target, float) - C
    z /= np.linalg.norm(z)
    x = np.cross(down, z)
    x /= np.linalg.norm(x)
    R = np.stack([x, np.cross(z, x), z])
    return R, -R @ C


def render_pointmap(R, t):
    """The pointmap X^{v,v}: per pixel, the 3D point in the camera's own frame (NaN for sky)."""
    v, u = np.mgrid[0:H3, 0:W3].astype(float)
    rays = np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(K3).T    # K^-1 (u, v, 1)
    dirs = rays / np.linalg.norm(rays, axis=-1, keepdims=True)
    C, dw = -R.T @ t, dirs @ R
    s = np.zeros((H3, W3))
    for _ in range(160):
        s += np.where(s < 12, sdf3(C + s[..., None] * dw), 0)
    X = s[..., None] * dirs
    X[s >= 12] = np.nan
    return X


def focal_from_pointmap(X, conf, iters=10):
    """argmin_f sum_i C_i || (u_i - c) - f (X_i, Y_i) / Z_i ||, by Weiszfeld (iteratively reweighted LS)."""
    v, u = np.mgrid[0:H3, 0:W3].astype(float)
    a = np.stack([u - (W3 - 1) / 2, v - (H3 - 1) / 2], -1).reshape(-1, 2)   # pixel minus centre
    b = (X[..., :2] / X[..., 2:]).reshape(-1, 2)
    ok = np.isfinite(b).all(1)
    a, b, c = a[ok], b[ok], conf.reshape(-1)[ok]
    f = (c * (a * b).sum(1)).sum() / (c * (b * b).sum(1)).sum()             # least squares
    for _ in range(iters):
        w = c / np.maximum(np.linalg.norm(a - f * b, axis=1), 1e-9)
        f = (w * (a * b).sum(1)).sum() / (w * (b * b).sum(1)).sum()
    return f


def umeyama(A, B, w=None):
    """Similarity (s, R, t) minimizing sum_i w_i || s R A_i + t - B_i ||^2."""
    w = np.ones(len(A)) if w is None else w
    w = w / w.sum()
    ma, mb = w @ A, w @ B
    A0, B0 = A - ma, B - mb
    U, S, Vt = np.linalg.svd((B0 * w[:, None]).T @ A0)
    E = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])
    R = U @ E @ Vt
    s = np.trace(np.diag(S) @ E) / (w @ (A0 ** 2).sum(1))
    return s, R, mb - s * R @ ma


def fake_network(X, scale, rng):
    """Stand-in for DUSt3R's output: unknown scale, 2% 3D noise, 5% wild points with low confidence."""
    r = np.linalg.norm(X, axis=-1, keepdims=True)
    Y = X + 0.02 * r * rng.standard_normal(X.shape)
    wild = rng.random(X.shape[:2]) < 0.05
    Y[wild] += 0.5 * r[wild] * rng.standard_normal((wild.sum(), 3))
    return scale * Y, np.where(wild, 1.1, 3.0)


rng = np.random.default_rng(1)
R1, t1 = look_at3(np.array([0.3, -1.4, -3.0]))
R2, t2 = look_at3(np.array([2.2, -1.2, -2.2]))
R21, t21 = R2 @ R1.T, t2 - R2 @ R1.T @ t1          # camera 1 -> camera 2
X11, X22 = render_pointmap(R1, t1), render_pointmap(R2, t2)
X21 = (X22 - t21) @ R21                             # image 2's points in camera 1's frame
X12 = X11 @ R21.T + t21                             # image 1's points in camera 2's frame
P11, C11 = fake_network(X11, 0.4, rng)
P12, C12 = fake_network(X12, 0.4, rng)
print("focal: true %.1f, least squares %.2f, Weiszfeld %.2f"
      % (F3, focal_from_pointmap(P11, C11, iters=0), focal_from_pointmap(P11, C11)))
ok = np.isfinite(P11).all(-1)
s_, R_, t_ = umeyama(P11[ok], P12[ok], (C11 * C12)[ok])
ang = np.degrees(np.arccos(np.clip((np.trace(R_ @ R21.T) - 1) / 2, -1, 1)))
cosd = t_ @ t21 / np.linalg.norm(t_) / np.linalg.norm(t21)
print("relative pose: rotation error %.2f deg, translation direction error %.1f deg"
      % (ang, np.degrees(np.arccos(cosd))))
```

```text
focal: true 56.0, least squares 12.38, Weiszfeld 55.08
relative pose: rotation error 0.85 deg, translation direction error 7.5 deg
```

普通最小二乘估计的焦距被外点毁掉了（12.38 而不是 56）：深度错误且接近零的点会有很大的 $X/Z$，在平方代价中占据主导。Weiszfeld 估计与真值相差不到 2%。旋转误差在一度以内；平移方向不那么准（7.5°），因为它是从带噪的点本身估计的，而且基线相对场景深度较短，这正是第 4 篇在两视图几何中遇到的病态问题。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-pointmap.svg" localized="true" caption="三维玩具场景的点图。左：两台相机（紫：1，橙：2）及其看到的物体点的俯视图（省略地面）。中：$X^{1,1}$ 和 $X^{2,1}$ 以图像显示，相机 1 坐标系中的 $(X, Y, Z)$ 用同一颜色尺度映射为 RGB（白：天空）。凡是两张图像看到同一表面的地方颜色都一致，尽管像素位置不同：对应关系内置于表示之中。右：模拟网络输出的焦距代价随 $f\_x$ 的变化（每条曲线除以其最小值）。鲁棒的 L1 代价最小值在 55.1 px，紧挨真值（56，黑线）；平方代价被 5% 的外点拉到 12.5 px。" %}

### 7.3 多视图：全局对齐

DUSt3R 一次只看两张图像。对 $N$ 张图像，它在许多图像对（图 $\mathcal E$ 的边）上运行，然后求解**全局对齐**（global alignment）：为每张图像找一个世界点图 $\chi^v$，为每个图像对找一个相似变换 $(\sigma\_e, P\_e)$，使每对的预测移到世界坐标后与世界点图一致：

$$
\min_{\chi, P, \sigma} \sum_{e \in \mathcal E} \sum_{v \in e} \sum_i C^{v,e}_i \,\big\lVert \chi^v_i - \sigma_e P_e X^{v,e}_i \big\rVert
\qquad\text{约束为 } \prod_e \sigma_e = 1 .
$$

约束固定了整体尺度（否则一切都可以缩到零）。DUSt3R 用梯度下降优化，并用深度图和相机来参数化 $\chi^v$，这样相机直接就能得到。我们的玩具版本以最简单的形式保留这个思想，用平方距离和交替的闭式步骤：给定世界点图，用 Umeyama 拟合每对的相似变换；给定相似变换，把每个世界点图设为变换后预测的置信度加权平均；再重新归一化尺度。初始化采用链式拼接：第一对定义世界坐标，之后每一对通过一个已放置的视图接上去。

```python
def global_align(edges, pm, conf, n_views, iters=30):
    """edges[e] = (a, b); pm[e] = (X^{a,e}, X^{b,e}), both in camera a's frame at an unknown scale;
    conf[e] = their confidences. Finds world pointmaps chi[v] and similarities (s_e, R_e, t_e) with
    chi[v] ~ s_e R_e X^{v,e} + t_e, under the gauge prod_e s_e = 1."""
    chi = [None] * n_views
    a, b = edges[0]
    chi[a], chi[b] = pm[0][0].copy(), pm[0][1].copy()    # pair 0 defines the initial world frame
    placed = {a, b}
    while len(placed) < n_views:                         # chain the other pairs onto it
        for e, (a, b) in enumerate(edges):
            if (a in placed) != (b in placed):
                k = 0 if a in placed else 1
                s, R, t = umeyama(pm[e][k], chi[edges[e][k]], conf[e][k])
                chi[edges[e][1 - k]] = s * pm[e][1 - k] @ R.T + t
                placed.add(edges[e][1 - k])
    chi_init, history = [c.copy() for c in chi], []
    for it in range(iters):
        sim = [umeyama(np.concatenate(pm[e]), np.concatenate([chi[a], chi[b]]), np.concatenate(conf[e]))
               for e, (a, b) in enumerate(edges)]       # step 1: every pair's similarity
        g = np.exp(np.mean([np.log(s) for s, _, _ in sim]))
        sim = [(s / g, R, t / g) for s, R, t in sim]     # gauge: geometric mean of the scales = 1
        num = [np.zeros_like(c) for c in chi]
        den = [np.zeros(len(c)) for c in chi]
        res = wsum = 0.0
        for e, (a, b) in enumerate(edges):               # step 2: average the aligned pointmaps
            s, R, t = sim[e]
            for k, v in enumerate((a, b)):
                Y = s * pm[e][k] @ R.T + t
                num[v] += conf[e][k][:, None] * Y
                den[v] += conf[e][k]
                res += (conf[e][k] * ((Y - chi[v] / g) ** 2).sum(1)).sum()
                wsum += conf[e][k].sum()
        chi = [num[v] / den[v][:, None] for v in range(n_views)]
        history.append(np.sqrt(res / wsum))
    return chi_init, chi, sim, history


def small_rotation(deg, rng):
    ax = rng.standard_normal(3)
    ax /= np.linalg.norm(ax)
    Kx = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    th = np.deg2rad(deg)
    return np.eye(3) + np.sin(th) * Kx + (1 - np.cos(th)) * Kx @ Kx


rng = np.random.default_rng(2)
n_views = 8
cams3 = [look_at3(3.2 * np.array([np.cos(a), -0.4, np.sin(a)])) for a in np.deg2rad(-90 + 45 * np.arange(n_views))]
Xw = []                                              # world points of the valid pixels of each view
for R, t in cams3:
    X = render_pointmap(R, t)[::2, ::2].reshape(-1, 3)
    Xw.append((X[np.isfinite(X).all(1)] - t) @ R)
edges = [(k, (k + 1) % n_views) for k in range(n_views)] + [(k, (k + 2) % n_views) for k in range(n_views)]
pm, conf = [], []
for a, b in edges:                                   # simulated pairwise predictions
    Ra, ta = cams3[a]
    E = small_rotation(2.0, rng)                     # this pair's relative pose is 2 degrees off
    pair = []
    for Y in (Xw[a] @ Ra.T + ta, (Xw[b] @ Ra.T + ta) @ E.T):
        Y = Y + 0.01 * np.linalg.norm(Y, axis=1, keepdims=True) * rng.standard_normal(Y.shape)
        pair.append(Y)
    scale = rng.uniform(0.5, 2.0)                    # each pair has its own unknown scale
    pm.append((scale * pair[0], scale * pair[1]))
    conf.append((np.ones(len(pair[0])), np.ones(len(pair[1]))))
world_init, world, sim, history = global_align(edges, pm, conf, n_views)


def rms_to_truth(chi):
    A, B = np.concatenate(chi), np.concatenate(Xw)
    s, R, t = umeyama(A, B)                          # compare up to a similarity
    return np.sqrt(((s * A @ R.T + t - B) ** 2).sum(1).mean())


print("RMS error after chaining: %.3f m, after global alignment: %.3f m"
      % (rms_to_truth(world_init), rms_to_truth(world)))
```

```text
RMS error after chaining: 0.222 m, after global alignment: 0.078 m
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-global-alignment.svg" localized="true" caption="对环绕玩具场景的 8 个视图、16 个模拟成对预测做全局对齐（物体点的俯视图，颜色表示视图）。每一对有各自的随机尺度、1% 的噪声和 2° 的相对位姿误差。左：环上的成对预测，各在自己的坐标系和尺度下。中左：一对接一对地链式拼接会累积位姿误差（与真值做最佳相似对齐后 RMS 误差 0.222 m），方块和球被抹开。中右：全局对齐把误差分摊到所有图像对上（0.078 m）。右：30 次迭代中的加权 RMS 残差；它最终趋平，因为这些 2° 的误差无法与任何单一的世界同时相容。" %}

这与 SLAM 的回环闭合（[第 6 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})）以及全局式 SfM（第 5 篇）是同一个故事：局部估计被串接起来，误差累积，再由一次覆盖所有约束的全局优化把误差分摊开。这也是 DUSt3R 的瓶颈：若取所有图像对，网络前向次数随图像数平方增长（更稀疏的图像对图有帮助，但会丢失约束），优化也要花时间。下一代方法去掉了它。

### 7.4 MASt3R：在三维之上做匹配

**MASt3R**（Leroy、Cabon 与 Revaud，ECCV 2024）增加了一个输出头，为每个像素输出稠密局部描述子，用对比式匹配损失训练，并在数据允许时以度量尺度训练点图。像素匹配来自描述子空间中的最近邻，再经过一种由粗到细的快速互为最近邻匹配方案细化，比仅从点图读出的匹配精确得多。**MASt3R-SfM**（3DV 2025）在这些匹配上搭建了完整的 SfM 流水线，用编码器特征做图像检索，全局优化分两阶段（先三维匹配，再二维重投影），在经典 SfM 失败的情形下也能工作，例如纯旋转或图像极少时。**MASt3R-SLAM**（CVPR 2025）用同样的先验实现了约每秒 15 帧的稠密单目 SLAM。

### 7.5 VGGT：一次前向处理多视图

**VGGT**（Wang 等，CVPR 2025 最佳论文）是一个大型 Transformer，一次接收一张到数百张图像，为每张图像预测相机内参与外参、深度图、点图以及用于点跟踪的特征，不需要任何后处理优化。它的结构在图像块 token 上交替使用两种注意力：每张图像内部的**逐帧**注意力，以及跨所有图像的**全局**注意力，使视图之间在每一层都交换信息；每张图像还有一个相机 token，由一个小输出头回归出相机。第一张图像定义世界坐标系。

论文中有两个发现值得记住。先预测深度和相机再反投影，得到的三维点比它自己的点图输出头更准确，这说明分解式的输出（深度加相机，即第 1、7 篇的经典参数化）比原始点更容易学习。另外，它的预测是经典光束法平差的良好初值，平差能进一步改善结果：前馈与优化是互补的，而不是对手。

### 7.6 2025-2026 年的后继（截至 2026 年 11 月）

这个领域发展很快；下表是一个快照，给出每项工作截至 2026 年 11 月的状态。会议信息已对照会议论文集核实。

| 工作 | 状态 | 思想 |
| --- | --- | --- |
| Fast3R（Yang 等） | CVPR 2025 | 把 DUSt3R 推广为一次前向处理多视图；项目页报告可处理 1000+ 张图像，无需全局对齐 |
| CUT3R（Wang 等） | CVPR 2025 | 带持久状态的循环模型，每来一张新图像就更新状态；在线输出度量尺度点图 |
| MASt3R-SLAM（Murai 等） | CVPR 2025 | 基于 MASt3R 两视图先验的实时稠密 SLAM |
| MonST3R（Zhang 等） | ICLR 2025 | 为动态场景逐时刻预测点图 |
| StreamVGGT（Zhuo 等） | ICLR 2026（arXiv 2025 年 7 月） | 带键值缓存的因果 VGGT，由 VGGT 蒸馏而来，用于流式输入 |
| $\pi^3$（Wang 等） | ICLR 2026 | 置换等变：没有参考视图；预测仿射不变的位姿和尺度不变的局部点图 |
| MapAnything（Keetha 等） | 3DV 2026 | 由图像加任意可选输入（内参、位姿、深度）做度量重建，输出分解为深度图、射线图、位姿和度量尺度 |
| Depth Anything 3（Lin 等） | ICLR 2026（arXiv 2025 年 11 月） | 一个朴素的 Transformer 和单一的深度-射线目标，适用于任意数量、有无位姿的视图 |
| LongStream（Cheng 等） | CVPR 2026 | 用相对关键帧的位姿和解耦的尺度，流式重建公里级序列 |

表中贯穿着三个趋势。**输出参数化**从原始点图转向分解式输出（深度、射线或相机、尺度），呼应了 VGGT 的发现。**参考坐标系**被去掉（$\pi^3$）或改为相对的（LongStream），因为把一切锚定在第一张图像上不利于长的、无序的输入。**流式**变体（CUT3R、StreamVGGT、LongStream 以及 2026 年的一大批预印本）把内存限制在有界范围内，把这些模型带进类似 SLAM 的场景。

### 7.7 前馈模型能给你什么，不能给你什么

它们在几秒内、从少量图像、无需标定，给出相机和稠密几何，其先验还能填补光度一致性无从下手的无纹理区域。它们不能给的是保证。网络在与训练数据差别很大的场景上可能自信地出错，尺度的好坏取决于度量训练数据，在大量高分辨率图像的大场景上，精度通常仍不如精心运行的 COLMAP 加 MVS。2026 年务实的做法是混合式的：用前馈模型初始化，再用光束法平差（第 5 篇）细化；如果需要曲面，再用第 2 至 6 节的某种优化方法。

## 8. 评测

### 8.1 准确度、完整度与 F 值

给定重建曲面 $\mathcal R$ 和真值曲面 $\mathcal G$（二者都稠密采样），两个距离回答两个不同的问题：

$$
\text{acc} = \frac{1}{\lvert\mathcal R\rvert}\sum_{\mathbf r\in\mathcal R} \min_{\mathbf g\in\mathcal G}\lVert\mathbf r - \mathbf g\rVert,
\qquad
\text{comp} = \frac{1}{\lvert\mathcal G\rvert}\sum_{\mathbf g\in\mathcal G} \min_{\mathbf r\in\mathcal R}\lVert\mathbf g - \mathbf r\rVert .
$$

**准确度**（accuracy）问重建出来的东西是否正确；**完整度**（completeness）问是否把一切都重建出来了。二者的平均就是 DTU 上报告的 **Chamfer 距离**。平均距离对少数很远的外点敏感，所以 Tanks and Temples 和 ETH3D 改用阈值：给定容差 $\tau$，

$$
P(\tau) = \frac{\lvert\{\mathbf r \in\mathcal R: d(\mathbf r, \mathcal G) < \tau\}\rvert}{\lvert\mathcal R\rvert},
\qquad
R(\tau) = \frac{\lvert\{\mathbf g \in\mathcal G: d(\mathbf g, \mathcal R) < \tau\}\rvert}{\lvert\mathcal G\rvert},
\qquad
F(\tau) = \frac{2PR}{P + R} .
$$

精确率 $P$ 惩罚不该存在的表面（漂浮物、凭空填补的部分），召回率 $R$ 惩罚缺失的表面，调和平均 $F$ 只有在两者都高时才高。

```python
def evaluate(rec, gt, tau):
    """Accuracy and completeness (mean distances), and precision, recall and F-score at tau."""
    d_rec = cKDTree(gt).query(rec)[0]            # reconstruction -> ground truth
    d_gt = cKDTree(rec).query(gt)[0]             # ground truth -> reconstruction
    P, R = (d_rec < tau).mean(), (d_gt < tau).mean()
    return dict(acc=d_rec.mean(), comp=d_gt.mean(), P=P, R=R, F=2 * P * R / max(P + R, 1e-12))


xs_f, Pf = make_grid(1600)                       # ground truth: the zero level set at 2 mm
gt = sample_segments(marching_squares(scene_sdf(Pf).reshape(1600, 1600), xs_f))
xs, F, Wt = tsdf_fuse(arc_scans)
recs = {"TSDF": sample_segments(marching_squares(F, xs, Wt > 0))}
for alpha in (0.0, 32.0):
    chi, iso = screened_poisson(P_arc, N_arc, xs, alpha)
    recs["Poisson a=%g" % alpha] = sample_segments(marching_squares(chi - iso, xs))
for name, rec in recs.items():
    for tau in (0.01, 0.02, 0.05):
        m = evaluate(rec, gt, tau)
        print("%-13s tau = %2.0f mm: acc %5.1f mm, comp %5.1f mm, P %.3f, R %.3f, F %.3f"
              % (name, 1000 * tau, 1000 * m["acc"], 1000 * m["comp"], m["P"], m["R"], m["F"]))
```

```text
TSDF          tau = 10 mm: acc   4.1 mm, comp  15.4 mm, P 0.935, R 0.853, F 0.892
TSDF          tau = 20 mm: acc   4.1 mm, comp  15.4 mm, P 0.978, R 0.887, F 0.930
TSDF          tau = 50 mm: acc   4.1 mm, comp  15.4 mm, P 0.999, R 0.913, F 0.954
Poisson a=0   tau = 10 mm: acc  60.5 mm, comp  34.1 mm, P 0.466, R 0.483, F 0.474
Poisson a=0   tau = 20 mm: acc  60.5 mm, comp  34.1 mm, P 0.628, R 0.637, F 0.633
Poisson a=0   tau = 50 mm: acc  60.5 mm, comp  34.1 mm, P 0.754, R 0.776, F 0.765
Poisson a=32  tau = 10 mm: acc  22.8 mm, comp  17.6 mm, P 0.738, R 0.759, F 0.748
Poisson a=32  tau = 20 mm: acc  22.8 mm, comp  17.6 mm, P 0.791, R 0.823, F 0.806
Poisson a=32  tau = 50 mm: acc  22.8 mm, comp  17.6 mm, P 0.870, R 0.903, F 0.886
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-fscore.svg" localized="true" caption="评测第 4 节的圆弧重建。左边两图：重建点按到真值的距离着色，灰色是偏差超过 2 cm 而被遗漏的真实表面。TSDF 漏掉了未观测的一侧，但重建出来的部分是准确的；屏蔽泊松封闭了空洞，但封闭部分（黄色）偏离 40 mm 甚至更多。右：精确率（虚线）、召回率（点线）和 F 值（实线）随 $\tau$ 的变化。$\tau$ = 2 cm 时，TSDF 为 P = 0.978、R = 0.887、F = 0.930，屏蔽泊松为 P = 0.791、R = 0.823、F = 0.806。" %}

这些数字把第 4 节的取舍说得很精确。在 2 cm 的容差下，屏蔽泊松填补的空洞并没有换来召回率，因为猜出的表面偏差超过 2 cm，却付出了精确率的代价；即使在 5 cm，它的召回率（0.903）仍略低于 TSDF（0.913）。普通泊松差得多（2 cm 时 F = 0.633）。换句话说，水密网格是产品需求，而不是质量指标；公平的比较总要说明 $\tau$，并同时报告 $P$ 和 $R$。

真实评测还有几个我们的玩具例子不需要的步骤：先把重建与真值**对齐**（用给定的相机，或者对尺度未知的方法用相似变换加 ICP），再**裁剪**到有真值的区域，并且把真值限制在输入相机能看到的部分（否则会凭空补全未见部分的 DUSt3R 类方法会受到不公平的奖励或惩罚）。

### 8.2 基准数据集

| 基准 | 场景 | 真值 | 主要指标 |
| --- | --- | --- | --- |
| DTU（Aanæs 等，IJCV 2016） | 实验室中 124 个桌面场景，每个有 49 或 64 个标定视角，七种光照 | 结构光扫描 | 准确度、完整度及其平均（Chamfer，单位 mm）；神经曲面论文通常报告带物体掩码的 15 个扫描子集 |
| Tanks and Temples（Knapitsch 等，ACM TOG 2017） | 大型室内外场景，视频输入，分 intermediate 和 advanced 两组 | 工业级激光扫描仪 | 每个场景给定 $\tau$ 下的精确率、召回率和 F 值 |
| ETH3D（Schöps 等，CVPR 2017） | 高分辨率单反图像和多相机视频，室内外 | 激光扫描 | 多个容差下的 F1 分数，通常以 2 cm 为主要指标 |

DTU 干净、以物体为中心，因此成为神经曲面的默认基准；Tanks and Temples 和 ETH3D 在真实、大型、杂乱的场景上测试完整流水线。前馈模型通常还会评测其预测相机的质量：视图对之间的相对旋转和平移角误差，用某个阈值以下准确率曲线的面积来汇总（例如 CO3D 或 RealEstate10K 上的 AUC@30），以及经过相似对齐后的点图或深度精度。

## 9. 如何选择方法

| 情形 | 2026 年的合理默认 | 原因 |
| --- | --- | --- |
| RGB-D 相机，实时 | 带体素哈希的 TSDF 融合（KinectFusion 家族、Open3D） | 深度已知；融合是局部的、鲁棒且快速 |
| 大量照片，追求最高精度 | COLMAP 或 GLOMAP、PatchMatch MVS、融合、泊松或 Delaunay 网格化 | 每一级都很成熟；可扩展到数千张图像 |
| 同上，但光滑或细致的曲面比速度更重要 | 在 COLMAP 相机上运行 Neuralangelo、2DGS 或 Gaussian Opacity Fields | 联合优化，用光滑先验填补弱纹理区域 |
| 照片很少、随手拍摄、相机未知 | VGGT、MASt3R(-SfM)、$\pi^3$、MapAnything 或 Depth Anything 3，再做光束法平差 | 先验弥补重叠和纹理的不足；几秒而不是几分钟 |
| 视频流，在线 | MASt3R-SLAM、CUT3R 或流式 VGGT 变体；需要保证时用经典 SLAM（第 6 篇） | 内存有界，增量输出 |
| 用于打印或仿真的封闭网格 | 在有向点上做屏蔽泊松，再裁剪 | 总是水密；屏蔽项使其贴近数据 |

## 动手试试

- 在第 2 节的 **TSDF 小部件**里，只从一侧扫描四次，然后打开"显示权重"：看看场在哪里一无所知。再把 $\mu$ 设为 20 cm 并环绕扫描：看细杆膨胀、失去形状；不重新扫描、只调低 $\mu$，它又会恢复。
- 在第 6 节的 **NeuS 小部件**里，设 $\theta = 70°$，一边改变 $s$，一边比较朴素峰值与理论值。然后切换到板，把 $n$ 减到 16 并增大 $s$：从多大的 $s$ 开始，每个表面把全部权重放进同一个区间，使它的位置只能精确到一个采样间距？
- 首页的[交互实验室]({{ '/' | relative_url }}#lab)包含 Gaussian World，一个三维高斯泼溅查看器：2DGS 以及 [3DGS 前沿一篇]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})中前馈高斯方法所产生的正是这种表示。
- 在一张桌子上放一个物体，拍 30 张照片，运行第 5 节的 COLMAP 命令，比较泊松网格和 Delaunay 网格；再从官方代码仓库取一个前馈模型，在其中 5 张照片上试试。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Marching cubes: a high resolution 3D surface construction algorithm (Lorensen, Cline) | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37422) | 从网格提取等值面 |
| A volumetric method for building complex models from range images (Curless, Levoy) | SIGGRAPH | 1996 | [DOI](https://doi.org/10.1145/237170.237269) | 累积加权有符号距离：TSDF 融合 |
| Poisson surface reconstruction (Kazhdan, Bolitho, Hoppe) | SGP | 2006 | [DOI](https://doi.org/10.2312/SGP/SGP06/061-070) | 由有向点得到水密曲面 |
| KinectFusion: real-time dense surface mapping and tracking (Newcombe et al.) | ISMAR | 2011 | [DOI](https://doi.org/10.1109/ISMAR.2011.6092378) | 带 ICP 跟踪的实时 TSDF 融合 |
| Screened Poisson surface reconstruction (Kazhdan, Hoppe) | ACM TOG | 2013 | [DOI](https://doi.org/10.1145/2487228.2487237) | 在样本处加插值约束 |
| Real-time 3D reconstruction at scale using voxel hashing (Nießner et al.) | ACM TOG (SIGGRAPH Asia) | 2013 | [DOI](https://doi.org/10.1145/2508363.2508374) | 用哈希表存储稀疏 TSDF 块 |
| Large-scale data for multiple-view stereopsis (Aanæs et al.) | IJCV | 2016 | [DOI](https://doi.org/10.1007/s11263-016-0902-9) | DTU 基准 |
| Pixelwise view selection for unstructured multi-view stereo (Schönberger et al.) | ECCV | 2016 | [DOI](https://doi.org/10.1007/978-3-319-46487-9_31) | COLMAP 的 MVS 与深度图融合 |
| Tanks and Temples: benchmarking large-scale scene reconstruction (Knapitsch et al.) | ACM TOG | 2017 | [DOI](https://doi.org/10.1145/3072959.3073599) | 用 F 值评测完整流水线 |
| A multi-view stereo benchmark with high-resolution images and multi-camera videos (Schöps et al.) | CVPR | 2017 | [CVF](https://openaccess.thecvf.com/content_cvpr_2017/html/Schops_A_Multi-View_Stereo_CVPR_2017_paper.html) | ETH3D 基准 |
| Implicit geometric regularization for learning shapes (Gropp et al.) | ICML | 2020 | [arXiv](https://arxiv.org/abs/2002.10099) | Eikonal 正则项 |
| NeuS: learning neural implicit surfaces by volume rendering for multi-view reconstruction (Wang et al.) | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.10689) | 无偏且感知遮挡的 SDF 渲染 |
| Volume rendering of neural implicit surfaces (Yariv et al.) | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.12052) | VolSDF：由 SDF 得到拉普拉斯 CDF 密度 |
| Neuralangelo: high-fidelity neural surface reconstruction (Li et al.) | CVPR | 2023 | [arXiv](https://arxiv.org/abs/2306.03092) | 数值梯度的哈希网格 SDF |
| DUSt3R: geometric 3D vision made easy (Wang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.14132) | 由图像对得到点图，全局对齐 |
| Grounding image matching in 3D with MASt3R (Leroy et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2406.09756) | 在三维模型上加稠密匹配头 |
| 2D Gaussian splatting for geometrically accurate radiance fields (Huang et al.) | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2403.17888) | 面元；用渲染深度的 TSDF 融合得到网格 |
| MASt3R-SfM: a fully-integrated solution for unconstrained structure-from-motion (Duisterhof et al.) | 3DV | 2025 | [arXiv](https://arxiv.org/abs/2409.19152) | 建立在 MASt3R 上的 SfM |
| VGGT: visual geometry grounded transformer (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2503.11651) | 一次前向为多视图预测相机、深度、点和轨迹 |
| Fast3R: towards 3D reconstruction of 1000+ images in one forward pass (Yang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.13928) | 无需全局对齐的多视图 DUSt3R |
| Continuous 3D perception model with persistent state (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.12387) | CUT3R：循环式在线重建 |
| MASt3R-SLAM: real-time dense SLAM with 3D reconstruction priors (Murai et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2412.12392) | SLAM 系统中的前馈先验 |
| $\pi^3$: permutation-equivariant visual geometry learning (Wang et al.) | ICLR | 2026 | [arXiv](https://arxiv.org/abs/2507.13347) | 没有参考视图 |
| MapAnything: universal feed-forward metric 3D reconstruction (Keetha et al.) | 3DV | 2026 | [arXiv](https://arxiv.org/abs/2509.13414) | 度量输出，可选几何输入 |
| Depth Anything 3: recovering the visual space from any views (Lin et al.) | ICLR | 2026 | [arXiv](https://arxiv.org/abs/2511.10647) | 一个 Transformer，深度-射线目标 |
| LongStream: long-sequence streaming autoregressive visual geometry (Cheng et al.) | CVPR | 2026 | [arXiv](https://arxiv.org/abs/2602.13172) | 公里级流式重建 |

## 学习资源

- R. Szeliski，*Computer Vision: Algorithms and Applications*，第 2 版，2022，第 12 章（深度估计）和第 13 章（三维重建：曲面表示、体素融合、基于模型的重建）。个人使用可在 [szeliski.org/Book](https://szeliski.org/Book/) 免费获取。
- COLMAP 文档：[命令行接口](https://colmap.github.io/cli.html)和[教程](https://colmap.github.io/tutorial.html)，描述了第 5 节的每条命令。
- [Open3D](https://www.open3d.org/)：几次调用即可完成 RGB-D 序列的 TSDF 融合、法向估计和泊松重建；[PoissonRecon](https://github.com/mkazhdan/PoissonRecon) 是屏蔽泊松的参考实现，附带裁剪工具。
- 神经方法和前馈方法的代码：[Totoro97/NeuS](https://github.com/Totoro97/NeuS)、[NVlabs/neuralangelo](https://github.com/NVlabs/neuralangelo)、[hbb1/2d-gaussian-splatting](https://github.com/hbb1/2d-gaussian-splatting)、[naver/dust3r](https://github.com/naver/dust3r)、[naver/mast3r](https://github.com/naver/mast3r)、[facebookresearch/vggt](https://github.com/facebookresearch/vggt)。
- 基准：[DTU robot image data](https://roboimagedata.compute.dtu.dk/)、[Tanks and Temples](https://www.tanksandtemples.org/)、[ETH3D](https://www.eth3d.net/)。

## 练习

1. 证明：当深度读数服从标准差为 $\sigma\_k$ 的高斯分布、且都落在截断带内时，取权重 $w\_k = 1/\sigma\_k^2$ 的 TSDF 更新给出体素处有符号距离的最大似然估计。如果有些读数落在截断带之外，会出什么问题？

   <details markdown="1"><summary>提示</summary>

   $F$ 的似然为 $\prod\_k \exp(-(F - \eta\_k)^2/(2\sigma\_k^2))$，最大化它的对数即可。使表面位于体素之前超过 $\mu$ 的读数（$\eta\_k < -\mu$）被跳过，$\eta\_k > \mu$ 的读数被截断，所以剩下的是一个截断样本。对位于表面上的体素，被跳过的读数都是负的，因此均值偏大，融合出的表面向远离相机的方向移动。这就是 $\mu$ 必须是 $\sigma$ 的好几倍的原因。
   </details>

2. 在 `tsdf_integrate` 中，把投影距离换成到反投影扫描点的真实距离（扫描中离体素最近的点，符号取 $\eta$ 的符号）。用两种版本融合 64 次扫描，比较准确度。两个场在哪里差别最大？这对过零点有影响吗？

   <details markdown="1"><summary>提示</summary>

   为每次扫描的反投影点建立一个 `cKDTree`。两个场在表面被掠射观察的地方差别最大（那里投影距离约为真实距离的 $1/\cos\theta$ 倍），在深度不连续处附近也是。过零点几乎不动；差别影响的是截断（投影截断带在倾斜表面上实际上更薄），以及把场值当作距离使用的方法，例如球体追踪。
   </details>

3. 推导朴素密度在平面上的偏差，并验证正对时的 $-0.481/s$。在 60° 入射下，要让偏差小于 1 mm，$s$ 需要多大？为什么这在实践中并不能解决问题？

   <details markdown="1"><summary>提示</summary>

   像第 6.2 节那样使用条件 $\sigma' = \sigma^2$。60° 时 $c = 0.5$，$\Phi^\ast = 0.707$，$\ln(\Phi^\ast/(1 - \Phi^\ast)) = 0.881$，偏差为 $1.76/s$，所以需要 $s > 1760$（每米）。密度这么尖锐时，权重集中在一毫米宽的带内，几乎没有采样点落进去，梯度也就消失了；训练必须从小的 $s$ 开始，而那时偏差恰恰很大。
   </details>

4. 修改 `fit_neus`，只在当前零水平集附近计算 Eikonal 项，或者在物体内部用较小的权重。方块内部的伪轮廓会消失吗？这说明神经 SDF 的哪些部分受数据约束？

   <details markdown="1"><summary>提示</summary>

   如果射线在到达某些单元之前权重已经饱和，这些单元就得不到渲染损失的梯度，只受正则项塑造。处处施加的 Eikonal 项把它们推向某个距离函数，但不一定是正确的那个；大多数真实实现也在整个包围体中采样 Eikonal 项，并用球面初始化，使内部一开始就是负的。
   </details>

5. 在点图代码中，用 PnP 替代 Procrustes 求位姿：把 $X^{2,1}$ 当作相机 1 坐标系中已知的三维点，把图像 2 的像素当作它们的投影，在 RANSAC 循环中用求解 $P$ 的 DLT 求相机 2（第 5 篇讲 PnP）。比较旋转和平移误差与 Procrustes 的结果。

   <details markdown="1"><summary>提示</summary>

   $3\times 4$ 的 DLT 每次采样需要六个点；使用图像 2 的像素网格和已知的 $K$（或 Weiszfeld 估计的焦距）。PnP 使用精确的二维像素位置，而不是第二个点图中带噪的三维点，所以平移方向通常会改善。这就是 DUSt3R 作者同时提到两种做法的原因。
   </details>

6. 对第 6.4 节的 NeuS 重建和同一组相机 24 次扫描的 TSDF 融合，计算 $\tau$ = 2 cm 下的准确度、完整度和 F 值。哪一个更完整？为什么？

   <details markdown="1"><summary>提示</summary>

   使用 `evaluate(sample_segments(marching_squares(g_fit, xs_n)), gt, 0.02)`，以及在 `[(R, t, render_depth(R, t)) for R, t in orbit(24)]` 上运行 `tsdf_fuse`。注意这里 NeuS 用的是无噪声深度，所以也要和无噪声的 TSDF 比较。两者看到的是相同的表面；差别来自网格分辨率（3.4 cm 对 2.5 cm）、NeuS 拟合中的内部伪轮廓，以及 Eikonal 项在方块角点处的平滑作用。
   </details>

**下一篇：**[面向 AR/VR 的三维视觉]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }})：本系列的最后一篇，讲 AR/VR 头显上的三维视觉：由内向外的跟踪、场景理解、空间锚点，以及决定虚拟物体能否稳稳停在原处的延迟预算。
