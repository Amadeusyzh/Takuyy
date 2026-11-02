---
layout: post
title: "几何处理：网格、曲率、平滑、细分与重建"
date: 2026-10-27 09:08:00+0900
description: "网格表示与半边结构、用余切拉普拉斯计算离散曲率、平滑、Loop 细分、QEM 简化、Tutte 参数化、Marching Squares 与 Marching Cubes，以及泊松重建，全部用 NumPy 实现。"
categories: graphics
tags: [geometry-processing, meshes, laplacian, subdivision, simplification, marching-cubes, poisson]
series: graphics
series_order: 8
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[光栅化]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})和[路径追踪]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})都把三角网格当作给定输入。本文讨论这些网格从哪里来、我们如何对它们进行操作。三角网格是电影、游戏、CAD、三维扫描和 3D 打印的通用语言，如今也是三维生成的通用语言。扫描仪或神经场给出的是点或隐式函数，必须把它们变成网格；美术制作的网格需要平滑、细分、为细节层次（LOD）做简化，还要展开以便贴图。神经重建（[从高斯得到表面]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})）最后用到的也是同样的工具：Marching Cubes、泊松重建和网格简化。

我们会用 NumPy 从零实现每一个工具：半边结构、基于余切拉普拉斯的曲率、平滑、Loop 细分、二次误差简化、Tutte 嵌入、Marching Squares 与 Marching Tetrahedra、球体追踪（sphere tracing）以及泊松重建。

## 预备知识

- 向量、叉积、矩阵和最小二乘（[第 1 篇]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})）。
- 三角形、重心坐标和索引网格（[第 2 篇]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})）。
- 少量曲面上的微积分知识：法线、梯度，以及拉普拉斯算子 $\Delta f = \partial^2 f/\partial x^2 + \partial^2 f/\partial y^2$ 的概念。
- 会用 NumPy 的 Python。稀疏线性代数有帮助但不是必需的：本文所有例子都足够小，用稠密矩阵即可。

## 1. 形状的表示

存储三维形状没有唯一最好的方式。每种表示都让某些操作变得便宜，另一些变得困难。

| 表示 | 存储内容 | 容易 | 困难 |
| --- | --- | --- | --- |
| 多边形汤（polygon soup） | 三角形列表，每个三角形各自存 3 个位置 | 渲染 | 任何需要邻接关系的操作 |
| 索引网格（indexed mesh） | 顶点数组 $V \in \mathbb{R}^{n\times 3}$ + 面数组 $F \in \mathbb{N}^{m\times 3}$ | 渲染、存储 | 邻接查询（需要额外结构） |
| 半边网格（half-edge mesh） | 索引网格 + 有向边记录 | 局部遍历和编辑 | 任意非流形输入 |
| 点云（point cloud） | 采样点 $\mathbf{p}_i$，可能带法线 $\mathbf{n}_i$ | 采集（LiDAR、深度相机、SfM） | 拓扑、无孔洞渲染 |
| 隐式 / SDF | 函数 $f:\mathbb{R}^3\to\mathbb{R}$，表面 $=\{f=0\}$ | 内外判断、布尔运算、融合 | 渲染需要求根、尖锐特征 |
| 体素（voxels） | 网格上的 $f$ 或占据值 | 简单、适合 GPU | 内存按 $N^3$ 增长 |
| 参数曲面（parametric） | 曲面片 $\mathbf{x}(u,v)$（Bézier、B 样条、NURBS） | 精确光滑的 CAD 曲面 | 曲面片拼接、任意拓扑 |

**索引网格**就是[第 2 篇]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})光栅化的对象：位置只存一次，三角形是索引三元组。处理它之前需要两个拓扑概念。

**流形性（manifoldness）。** 如果每个点都有一个看起来像圆盘的邻域（在边界上是半圆盘），网格就是（二维）**流形**。对三角网格而言，这意味着：每条边属于一个或两个三角形（边界上为一个），每个顶点周围的三角形组成单个扇形，内部顶点的扇形闭合，边界顶点的扇形开放。两个扇形在一点相接的"蝴蝶结"顶点，或被三个三角形共享的边，都是非流形的。下面的大多数算法都假设网格是流形且朝向一致（从外面看，每个面按逆时针列出顶点）。

**欧拉示性数（Euler characteristic）。** 对于有 $V$ 个顶点、$E$ 条边、$F$ 个面的网格，

$$
\chi = V - E + F = 2 - 2g - b,
$$

其中 $g$ 是亏格（柄的数量），$b$ 是边界环的数量。立方体是 $8 - 12 + 6 = 2$（球面）。三角化的 $48\times 24$ 环面网格有 $V = 1152$、$E = 3 \cdot 1152 = 3456$（每个网格单元贡献一条横边、一条竖边和一条对角边）、$F = 2304$，所以 $\chi = 0$（$g = 1$）。欧拉示性数稍后会被用来检验我们的曲率代码。对封闭三角网格有一个有用的推论：每个面有 3 条边，每条边属于 2 个面，所以 $2E = 3F$；又因为 $\chi$ 很小，$F \approx 2V$、$E \approx 3V$。平均顶点的**度数**（valence，邻居个数）接近 6。

## 2. 半边数据结构

大多数几何处理问的是局部问题："顶点 $i$ 周围有哪些顶点？""哪些面共享这条边？""沿着边界走一圈"。索引面列表只能靠搜索来回答。**半边（half-edge）** 结构把每条边按两个方向各存一次，并把记录互相链接，使每个局部查询每一步都是常数时间。

每条半边 $h$ 存储：

- `orig[h]`：它的起点顶点；
- `twin[h]`：沿同一条边反方向的半边；
- `next[h]`：同一个面中的下一条半边（逆时针）；
- `face[h]`：它左侧的面，边界半边为 $-1$。

其余一切都由此推出：$h$ 的终点是 `orig[twin[h]]`，三角形中的前一条半边是 `next[next[h]]`。关键的遍历是绕顶点旋转：如果 $h$ 从顶点 $v$ 出发，那么 `next[twin[h]]` 也从 $v$ 出发，并且转到了下一个面。下面从面列表构建半边结构，并把边界半边连成环，使同样的旋转在边界上也能工作：

```python
def build_halfedge(F):
    """Half-edge arrays from a face list: origin, twin, next, face (-1 for boundary)."""
    orig, face, nxt, index = [], [], [], {}
    for f, tri in enumerate(F):
        base = len(orig)
        for k in range(3):
            a, b = tri[k], tri[(k + 1) % 3]
            index[(a, b)] = base + k
            orig.append(a); face.append(f); nxt.append(base + (k + 1) % 3)
    twin = [-1] * len(orig)
    for (a, b), h in list(index.items()):
        if (b, a) in index:
            twin[h] = index[(b, a)]
        else:  # create the boundary half-edge b -> a
            g = len(orig)
            orig.append(b); face.append(-1); nxt.append(-1); twin.append(h)
            twin[h] = g
            index[(b, a)] = g
    out_boundary = {orig[h]: h for h in range(len(orig)) if face[h] == -1}
    for h in range(len(orig)):
        if face[h] == -1:
            nxt[h] = out_boundary[orig[twin[h]]]  # next boundary half-edge starts at our tip
    return dict(orig=orig, twin=twin, next=nxt, face=face)

def one_ring(he, h0):
    ring, h = [], h0
    while True:
        ring.append(h)
        h = he["next"][he["twin"][h]]
        if h == h0:
            return ring

F = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 5), (0, 5, 6)]   # a fan with one wedge missing
he = build_halfedge(F)
tip = lambda h: he["orig"][he["twin"][h]]
print(len(he["orig"]), "half-edges")                        # 22
print("one-ring of 0:", [tip(h) for h in one_ring(he, 0)])  # [1, 6, 5, 4, 3, 2]
b0 = he["face"].index(-1)
loop, h = [], b0
while True:
    loop.append(he["orig"][h]); h = he["next"][h]
    if h == b0: break
print("boundary loop:", loop)                               # [1, 0, 6, 5, 4, 3, 2]
```

这个扇形有 7 个顶点、11 条边、5 个面（$\chi = 1$：圆盘）。15 条内部半边加上 7 条边界半边共 22 条。下图用同一份代码画出了这些记录。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-halfedge.svg" caption="`build_halfedge` 构建的扇形半边结构。每个箭头是一条半边，画在它左侧的面内略偏一点；边界半边（橙色）位于外侧，由 `next` 串成边界环。紫色：`one_ring` 访问到的顶点 0 的出半边（其中一条是边界半边，旋转正是借此越过缺失的楔形）。标签标出了一条半边 $h$（从 0 到 1）、它的 `next`（黑色）和 `twin`（在边界上）。" %}

生产级库（OpenMesh、CGAL 的 `Surface_mesh`、geometry-central、Blender 的 BMesh）用数组中的整数句柄存储同样的思想，并为每个顶点存"一条出半边"、为每个面存"一条半边"。重网格化的三种局部操作——边坍缩（edge collapse）、边翻转（edge flip）和边分裂（edge split）——都只需更新几个指针。

## 3. 离散微分几何

在光滑曲面上，曲率描述曲面如何弯曲。每一点有两个**主曲率（principal curvatures）** $\kappa_1, \kappa_2$（用法平面切出的曲线的极值曲率）。它们的平均 $H = (\kappa_1 + \kappa_2)/2$ 是**平均曲率（mean curvature）**，乘积 $K = \kappa_1\kappa_2$ 是**高斯曲率（Gaussian curvature）**。半径为 $r$ 的球面有 $\kappa_1 = \kappa_2 = 1/r$，所以 $H = 1/r$、$K = 1/r^2$；圆柱面 $K = 0$；鞍面 $K < 0$。网格在每个三角形内部都是平的，所以全部曲率都集中在边和顶点上。离散微分几何（discrete differential geometry）在网格上定义曲率，使经典定理依然精确成立。

### 顶点法线

面法线是 $\mathbf{n}_f = (\mathbf{b}-\mathbf{a})\times(\mathbf{c}-\mathbf{a}) / \lVert\cdot\rVert$，未归一化时的长度是三角形面积的两倍。顶点法线是相邻面法线的平均。常见的三种权重：

- **均匀**：$\sum_f \mathbf{n}_f$；结果依赖于曲面如何三角化；
- **面积加权**：$\sum_f A_f \mathbf{n}_f$（直接把未归一化的叉积相加）；便宜，是通常的默认选择；
- **角度加权**：$\sum_f \theta_f \mathbf{n}_f$，$\theta_f$ 是面 $f$ 在该顶点处的角；与平坦区域如何被剖分成三角形无关（Thürmer 和 Wüthrich）。

### 余切拉普拉斯

**拉普拉斯–贝尔特拉米算子（Laplace–Beltrami operator）** $\Delta_S$ 把拉普拉斯算子推广到曲面上的函数。把它作用在位置函数 $\mathbf{x}$ 本身上，就得到曲率：

$$
\Delta_S \mathbf{x} = -2H\,\mathbf{n}.
$$

对半径为 $r$ 的球面，$\Delta_S\mathbf{x}$ 指向球心，长度为 $2/r$。所以只要能离散化 $\Delta_S$，就免费得到了**平均曲率法向（mean-curvature normal）**。

标准离散化来自最小化 Dirichlet 能量 $\frac12\int_S \lVert\nabla f\rVert^2$，其中 $f$ 在每个三角形上是线性的（有限元中的"帽子"基函数）。在顶点为 $i,j,k$、内角为 $\alpha_i, \alpha_j, \alpha_k$ 的单个三角形中，用帽子函数的梯度做一个简短计算得到

$$
\int_T \lVert\nabla f\rVert^2 = \tfrac12\big(\cot\alpha_k (f_i - f_j)^2 + \cot\alpha_i (f_j - f_k)^2 + \cot\alpha_j (f_k - f_i)^2\big),
$$

即每条边的权重是它*对角*的余切。对共享边 $ij$ 的两个三角形求和（对角为 $\alpha_{ij}$ 和 $\beta_{ij}$），再对 $f_i$ 求导，就得到**余切拉普拉斯（cotangent Laplacian）**（Pinkall 和 Polthier 1993；Meyer 等 2003）：

$$
(\mathbf{L}f)_i = \sum_{j \in N(i)} w_{ij}\,(f_j - f_i), \qquad w_{ij} = \tfrac12\big(\cot\alpha_{ij} + \cot\beta_{ij}\big).
$$

其中 $N(i)$ 是顶点 $i$ 的邻居集合；Dirichlet 能量对 $f$ 的梯度就是 $-\mathbf{L}f$，所以 $\mathbf{L}$ 是负半定的。$\mathbf{L}$ 还是对称的，各行之和为零。要得到逐点的值，需要除以与顶点 $i$ 相关的面积 $A_i$：相邻三角形面积的三分之一（**重心面积**），或者 Meyer 等人更精确的**混合 Voronoi 面积**。于是

$$
\Delta_S\mathbf{x}_i \approx \frac{1}{A_i}\sum_{j} w_{ij}(\mathbf{x}_j - \mathbf{x}_i) = -2H_i\mathbf{n}_i, \qquad H_i = -\tfrac12\,(\Delta_S\mathbf{x}_i)\cdot\mathbf{n}_i.
$$

**数值例子。** 在由等边三角形组成的网格中，每个角都是 $60^\circ$，$\cot 60^\circ = 1/\sqrt3 \approx 0.577$，所以每条内部边的 $w_{ij} = \frac12(0.577 + 0.577) = 0.577$：在完全规则的网格上，余切拉普拉斯是均匀拉普拉斯的倍数。在不规则网格上两者不同，而这正是关键。均匀（"伞形"）拉普拉斯 $\frac1{|N(i)|}\sum_j(\mathbf{x}_j-\mathbf{x}_i)$ 只是"指向邻居质心的向量"。在一个*平坦*但不规则的一环邻域上它不为零，所以用它平滑会让顶点沿切向滑动。余切版本对任何平坦的一环邻域都恰好为零：它只"看见"弯曲。下图在同一个一环邻域上展示了两者。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-cotan-weights.svg" caption="平坦、不规则一环邻域上的余切权重，用 `cotan_laplacian` 计算。每条辐边 $0j$ 的颜色和粗细表示 $w_{0j}$（边上的数字）；对辐边 $0$–$1$，两个对角 $\alpha$ 和 $\beta$ 用红色标出。淡紫色：顶点 0 的重心面积。橙色箭头是均匀拉普拉斯（放大 4 倍）：尽管曲面是平的，它仍指向侧面。标题显示余切和 $\sum_j w_{0j}(\mathbf{x}_j-\mathbf{x}_0)$，在舍入误差范围内为零。" %}

```python
import numpy as np

def corner_angles(V, F):
    t = V[F]
    ang = np.zeros(F.shape)
    for k in range(3):
        u, w = t[:, (k + 1) % 3] - t[:, k], t[:, (k + 2) % 3] - t[:, k]
        c = (u * w).sum(1) / (np.linalg.norm(u, axis=1) * np.linalg.norm(w, axis=1))
        ang[:, k] = np.arccos(np.clip(c, -1, 1))
    return ang

def cotan_laplacian(V, F):
    """Dense L with L[i, j] = (cot a_ij + cot b_ij) / 2 and rows summing to zero."""
    n, L = len(V), np.zeros((len(V), len(V)))
    ang = corner_angles(V, F)
    for k in range(3):
        i, j = F[:, (k + 1) % 3], F[:, (k + 2) % 3]      # edge opposite corner k
        w = 0.5 / np.tan(ang[:, k])
        np.add.at(L, (i, j), w); np.add.at(L, (j, i), w)
    L[np.diag_indices(n)] = -L.sum(1)
    return L

def vertex_areas(V, F):                                   # barycentric: 1/3 of incident areas
    t = V[F]
    A = 0.5 * np.linalg.norm(np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]), axis=1)
    out = np.zeros(len(V)); np.add.at(out, F.ravel(), np.repeat(A / 3, 3))
    return out
```

对真实网格请使用稀疏矩阵（用同样的三元组构造 `scipy.sparse.coo_matrix`）；稠密版本只是为了清晰。

两点注意。角度大于 $90^\circ$ 时余切为负，因此在含钝角三角形的网格上，有些权重是负的，这会破坏最大值原理（平滑后的函数可能过冲）。内蕴 Delaunay 三角化（Sharp、Soliman 和 Crane）可以在不改变几何的情况下解决这个问题。另外，对于接近退化的三角形，权重会爆炸，所以流水线的第一步往往是重网格化成形状良好的三角形。

### 由角亏得到高斯曲率

高斯曲率的离散形式更简单。把内部顶点 $i$ 周围的三角形摊平到平面上：如果各角之和 $\sum\theta$ 恰好是 $2\pi$，这个顶点就是平的。**角亏（angle defect）**

$$
\delta_i = 2\pi - \sum_{f \ni i} \theta_f^{(i)}
$$

是该顶点面积内高斯曲率的积分，所以 $K_i \approx \delta_i / A_i$。锥顶的角亏为正，鞍点顶点（角之和大于 $2\pi$）的角亏为负。边界顶点改用 $\pi - \sum\theta$。

**离散高斯–博内定理（Gauss–Bonnet theorem）** 精确成立，而非近似成立：

$$
\sum_i \delta_i = 2\pi\chi .
$$

数值例子：正八面体每个顶点有四个等边三角形的角，所以 $\delta = 2\pi - 4\cdot\frac{\pi}{3} = \frac{2\pi}{3}$，六个顶点之和为 $4\pi = 2\pi\cdot 2$。证明纯粹是计数：每个三角形三个角之和为 $\pi$，所以 $\sum_i\delta_i = 2\pi V - \pi F$，再利用 $2E = 3F$（即 $F/2 = E - F$）就得到 $2\pi(V - E + F)$。

```python
def gaussian_curvature(V, F):
    defect = np.full(len(V), 2 * np.pi)
    np.add.at(defect, F.ravel(), -corner_angles(V, F).ravel())
    return defect / vertex_areas(V, F), defect

def mean_curvature(V, F, normals):
    lap = (cotan_laplacian(V, F) @ V) / vertex_areas(V, F)[:, None]   # = -2 H n
    return -0.5 * (lap * normals).sum(1)
```

环面是理想的测试对象，因为两种曲率都有闭式解。设管半径为 $r$、中心圆半径为 $R$，$v$ 为绕管的角度，

$$
K(v) = \frac{\cos v}{r\,(R + r\cos v)}, \qquad H(v) = \frac{R + 2r\cos v}{2r\,(R + r\cos v)}.
$$

外半部分（$\cos v > 0$）像球面，$K > 0$；内半部分像鞍面，$K < 0$；而高斯–博内定理说两者必须恰好抵消，因为 $\chi = 0$。在下面的 $48\times24$ 环面上，所有角亏之和为 $-3\times10^{-13}$（舍入误差），与公式相比的最大逐点误差：$K$ 为 $0.03$（$K$ 的取值范围是 $-4.2$ 到 $1.8$），$H$ 为 $0.006$（使用精确法向）。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-curvature.svg" caption="$48\times24$ 环面（$R=1$，$r=0.4$）上的离散曲率，用上面的代码计算。左：由角亏得到的高斯曲率，红色为 $K>0$（外侧），蓝色为 $K<0$（洞的内侧）。中：由余切拉普拉斯得到的平均曲率。右：沿管的一圈的数值与精确公式的比较（红色为 $K$，蓝色为 $H$；圆点和方块是离散值，曲线是精确公式）；标记点应当紧贴曲线。标题打印出所有角亏之和，在舍入误差内为零，正如 $\chi=0$ 时高斯–博内定理所要求的。" %}

## 4. 平滑与光顺

扫描得到的网格有噪声。把顶点位置看作网格上的信号，施加扩散 $\partial\mathbf{x}/\partial t = \Delta_S\mathbf{x}$。由于 $\Delta_S\mathbf{x} = -2H\mathbf{n}$，这会让每个顶点沿法线方向、以与平均曲率成正比的速度移动：这就是**平均曲率流（mean curvature flow）**，它会熨平凸起。

### 显式拉普拉斯平滑与收缩

最简单的离散化是每次迭代做一步显式欧拉：

$$
\mathbf{x} \leftarrow \mathbf{x} + \lambda\,\mathbf{L}\mathbf{x}, \qquad 0 < \lambda \le 1
$$

（$\mathbf{L}$ 为均匀或余切拉普拉斯，归一化使对角线为 $-1$）。为了看清它做了什么，把形状展开到 $\mathbf{L}$ 的特征向量上。它们扮演傅里叶模态的角色：$\mathbf{L}\mathbf{e}_k = -\kappa_k\mathbf{e}_k$，"频率" $\kappa_k \ge 0$。对于有 $n$ 个顶点的闭合多边形和均匀拉普拉斯，模态是正弦和余弦，$\kappa_k = 1 - \cos(2\pi k/n) \in [0, 2]$。一次迭代把模态 $k$ 乘以**传递函数（transfer function）**

$$
f(\kappa) = 1 - \lambda\kappa .
$$

高频（噪声，$\kappa$ 接近 2）被强烈衰减，这正是我们想要的。但每个非常数模态都会被衰减，包括承载整体尺寸的最低频模态：圆就是模态 $k=1$，它每次迭代都会缩小一点。运行足够久，任何闭合形状都会缩成一个点。这就是**收缩（shrinkage）**。

### Taubin 的 $\lambda\vert\mu$ 平滑

Taubin（1995）交替进行 $\lambda > 0$ 的收缩步和 $\mu < -\lambda$ 的膨胀步：

$$
f(\kappa) = (1 - \lambda\kappa)(1 - \mu\kappa).
$$

对小 $\kappa$ 该因子接近 1（形状保持尺寸），对大 $\kappa$ 它很小（去除噪声）：这是一个低通滤波器。$f$ 再次穿过 1 的**通带频率**为 $k_{PB} = 1/\lambda + 1/\mu$；Taubin 建议 $k_{PB} \approx 0.1$。取 $\lambda = 0.33$、$\mu = -0.34$，则 $k_{PB} = 3.03 - 2.94 = 0.09$。数值例子：在 $\kappa = 1$（中频），$f = 0.67 \times 1.34 = 0.90$；在 $\kappa = 2$（最锯齿的模态），$f = 0.34 \times 1.68 = 0.57$；而 $\lambda = 0.5$ 的显式平滑分别给出 $0.5$ 和 $0$。当 $\kappa$ 低于 $k_{PB}$ 时，$f$ 略*大于* 1，所以 Taubin 平滑会轻微放大最低频：它适合运行几十到几百次迭代，而不是几千次。

### 隐式光顺

Desbrun 等（1999）使用**隐式**（后向）欧拉，与[第 7 篇]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})相同：

$$
(\mathbf{I} - h\,\mathbf{L})\,\mathbf{x}' = \mathbf{x}, \qquad f(\kappa) = \frac{1}{1 + h\kappa}.
$$

它无条件稳定，所以一个大步长 $h$ 可以替代许多显式小步，代价是一次稀疏线性求解。他们还证明了余切拉普拉斯才是这里的正确算子，因为它只沿法线移动顶点，并通过缩放来保持体积。

```python
import numpy as np

rng = np.random.default_rng(3)
n = 200
th = np.linspace(0, 2 * np.pi, n, endpoint=False)
r = 1 + 0.25 * np.cos(5 * th) + 0.04 * rng.standard_normal(n)
X0 = np.c_[r * np.cos(th), r * np.sin(th)]                  # a noisy closed curve
I = np.eye(n)
L = -I + 0.5 * (np.roll(I, 1, 1) + np.roll(I, -1, 1))       # uniform Laplacian of a polygon

def area(X):
    x, y = X[:, 0], X[:, 1]
    return 0.5 * abs(x @ np.roll(y, -1) - y @ np.roll(x, -1))

X, Y = X0.copy(), X0.copy()
for _ in range(1000):
    X = X + 0.5 * (L @ X)                                   # Laplacian smoothing
    Y = Y + 0.33 * (L @ Y); Y = Y - 0.34 * (L @ Y)          # Taubin lambda|mu
Z = np.linalg.solve(I - 25.0 * L, X0)                       # one implicit step
for name, S in [("laplacian", X), ("taubin", Y), ("implicit", Z)]:
    print(f"{name:9s} area ratio = {area(S) / area(X0):.3f}")
# laplacian area ratio = 0.593
# taubin    area ratio = 1.029
# implicit  area ratio = 0.949
```

曲线是一维网格，所以能直观看到滤波器作用在形状上。把 `L` 换成网格拉普拉斯，同样的代码就能用于三角网格。

下图把三种滤波器作用在同一条带噪声的曲线上，灰色是初始曲线，青、紫、红依次对应更多的迭代（隐式一栏对应更多步）。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-smoothing.svg" caption="平滑脚本中带噪声的五瓣曲线。显式拉普拉斯平滑（$\lambda=0.5$）在 10 次迭代内去掉噪声，然后抹平花瓣并让整条曲线不断收缩。Taubin 平滑去掉噪声，但保留了花瓣和尺寸。$h=25$ 的隐式光顺一步就做了强烈平滑。右：相对初始值的围合面积；拉普拉斯的曲线持续下降（1000 次迭代后为 0.59），Taubin 的曲线保持在 1 附近，最终高出 3%，这正是其传递函数预言的轻微低频增益。" %}

## 5. 细分曲面

细分（subdivision）走的是相反方向：从粗糙的**控制网格**出发，按照固定的局部平均规则反复分裂面、移动顶点，得到光滑曲面。在极限下网格收敛到光滑的**极限曲面（limit surface）**。美术建一个轻量的笼子，渲染器负责细分。

一维情形就能解释一切，下面的小部件可以让你动手试。**Chaikin** 割角法把每条边 $\mathbf{p}\_i\mathbf{p}\_{i+1}$ 替换为两个点 $\frac34\mathbf{p}\_i + \frac14\mathbf{p}\_{i+1}$ 和 $\frac14\mathbf{p}\_i + \frac34\mathbf{p}\_{i+1}$；它的极限是均匀二次 B 样条。**三次 B 样条**格式插入边中点，并把旧点移到 $\frac18(\mathbf{p}\_{i-1} + 6\mathbf{p}\_i + \mathbf{p}\_{i+1})$。两者都是**逼近型（approximating）**：曲线不经过控制点。Dyn、Levin 和 Gregory 的 **4 点格式**保留旧点，并插入 $\frac{9}{16}(\mathbf{p}\_i + \mathbf{p}\_{i+1}) - \frac1{16}(\mathbf{p}\_{i-1} + \mathbf{p}\_{i+2})$；它是**插值型（interpolating）**，极限为 $C^1$。

{% include widget.liquid name="graphics-subdivision" height="460" caption="用鼠标或手指拖动闭合多边形的控制点（黑色），选择一种格式并移动层级滑块。Chaikin 和三次 B 样条割去角点，逼近一条不经过控制点的光滑曲线；4 点格式经过控制点，并可能过冲。读数显示当前层级的点数。" %}

### Loop 细分（三角形）

Loop（1987）把四次箱样条推广到三角网格。每一步在每条边上插入一个**奇（odd）** 顶点，把每个三角形分成四个，并更新旧的**偶（even）** 顶点：

- 内部边 $ab$（对顶点为 $c, d$）上的奇顶点：$\;\frac38(\mathbf{a}+\mathbf{b}) + \frac18(\mathbf{c}+\mathbf{d})$；
- 度数为 $k$、邻居为 $\mathbf{p}_j$ 的偶顶点：$\;(1 - k\beta)\,\mathbf{v} + \beta\sum_j \mathbf{p}_j$，其中
  $\beta = \frac1k\Big(\frac58 - \big(\frac38 + \frac14\cos\frac{2\pi}{k}\big)^2\Big)$。

对规则度数 $k = 6$，$\cos(\pi/3) = \frac12$，所以 $\beta = \frac16(\frac58 - \frac14) = \frac1{16}$：顶点保留自身的 $\frac{10}{16}$，并从每个邻居取 $\frac1{16}$。远离**奇异顶点（extraordinary vertices）**（$k \ne 6$）处，极限曲面是 $C^2$；在奇异顶点处是 $C^1$。边界和折痕沿边界曲线使用一维三次 B 样条规则。

```python
from collections import defaultdict
import numpy as np

def loop_subdivide(V, F):
    """One step of Loop subdivision for a closed triangle mesh."""
    n = len(V)
    opp = defaultdict(list)                     # edge (a, b), a < b -> opposite vertices
    nbr = [set() for _ in range(n)]
    for f in F:
        for k in range(3):
            a, b, c = f[k], f[(k + 1) % 3], f[(k + 2) % 3]
            opp[(min(a, b), max(a, b))].append(c)
            nbr[a].add(b); nbr[b].add(a)
    newV = np.zeros((n + len(opp), 3))
    for i in range(n):                          # even vertices
        k = len(nbr[i])
        beta = (5 / 8 - (3 / 8 + np.cos(2 * np.pi / k) / 4) ** 2) / k
        newV[i] = (1 - k * beta) * V[i] + beta * V[list(nbr[i])].sum(0)
    eid = {}
    for m, ((a, b), cs) in enumerate(opp.items()):   # odd vertices
        eid[(a, b)] = n + m
        newV[n + m] = 3 / 8 * (V[a] + V[b]) + 1 / 8 * (V[cs[0]] + V[cs[1]])
    e = lambda a, b: eid[(min(a, b), max(a, b))]
    newF = []
    for a, b, c in F:
        ab, bc, ca = e(a, b), e(b, c), e(c, a)
        newF += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    return newV, np.array(newF)

V = np.array([(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1.6), (0, 0, -1)], float)
F = np.array([(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)])
for level in range(3):
    V, F = loop_subdivide(V, F)
    print(level + 1, len(V), "vertices", len(F), "faces")   # 18/32, 66/128, 258/512
```

如下图所示，每细分一次面数乘以 4，曲面同时向控制网格内部收缩。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-loop-subdivision.svg" caption="对顶部顶点被拉高的八面体做 Loop 细分，用 `loop_subdivide` 计算。每一层面数乘以 4。由于 Loop 是逼近型，曲面收缩到控制笼（虚线：第 0 层的八面体）内部，并很快变得光滑；原来的六个顶点度数为 4，在每一层都保持为奇异顶点。" %}

### Catmull–Clark（四边形）

Catmull 和 Clark（1978）把双三次 B 样条推广到任意拓扑的网格，是以四边形为主的建模的标准。一步生成：

- 每个面一个**面点**：面上顶点的平均；
- 每条边一个**边点**：两个端点和两个相邻面点的平均；
- 每个度数为 $k$ 的旧顶点的新位置：$\;\frac{\mathbf{Q} + 2\mathbf{R} + (k-3)\mathbf{S}}{k}$，其中 $\mathbf{Q}$ 是相邻面点的平均，$\mathbf{R}$ 是相邻边中点的平均，$\mathbf{S}$ 是旧位置。

一步之后每个面都是四边形。极限曲面除奇异顶点（度数 $\ne 4$）处为 $C^1$ 外都是 $C^2$。Pixar 的 OpenSubdiv 在 GPU 上计算 Catmull–Clark（和 Loop）曲面，DeRose、Kass 和 Truong 为电影角色加入了半锐折痕。Stam（1998）证明了利用细分矩阵的特征结构，可以在任意参数值处精确计算极限曲面，完全不需要细分。CAD 倾向于使用能精确表示圆锥曲线的 NURBS，但细分曲面主导了角色建模。

## 6. 用二次误差度量做简化

反过来的问题是把一百万个三角形的网格减少到一万个，用于细节层次（LOD）、流式传输或碰撞。Garland 和 Heckbert（1997）让基于**二次误差度量（quadric error metrics, QEM）** 的**边坍缩**成为标准：反复坍缩那条合并后顶点 $\bar{\mathbf{v}}$ 增加误差最少的边 $(\mathbf{u}, \mathbf{w})$。

误差是相对每个顶点周围原始面所在平面来度量的。平面为 $\mathbf{n}^\top\mathbf{x} + d = 0$，$\lVert\mathbf{n}\rVert = 1$；用齐次坐标 $\mathbf{p} = (\mathbf{n}, d)$、$\tilde{\mathbf{x}} = (\mathbf{x}, 1)$，$\mathbf{x}$ 到平面的平方距离为

$$
(\mathbf{p}^\top\tilde{\mathbf{x}})^2 = \tilde{\mathbf{x}}^\top(\mathbf{p}\mathbf{p}^\top)\tilde{\mathbf{x}} = \tilde{\mathbf{x}}^\top\mathbf{K}_p\,\tilde{\mathbf{x}}.
$$

诀窍在于：到许多平面的平方距离之*和*仍然是单个二次型：$\mathbf{Q}\_v = \sum_{p \ni v}\mathbf{K}\_p$，一个对称 $4\times4$ 矩阵（10 个数）。当 $\mathbf{u}$ 和 $\mathbf{w}$ 合并时，新的二次型就是 $\mathbf{Q}\_u + \mathbf{Q}\_w$，最佳位置最小化 $\tilde{\mathbf{x}}^\top(\mathbf{Q}\_u+\mathbf{Q}\_w)\tilde{\mathbf{x}}$。令关于 $\mathbf{x}$ 的梯度为零，得到一个 $3\times3$ 线性方程组。按 Garland 和 Heckbert 的写法：把 $\mathbf{Q}$ 的最后一行换成 $(0,0,0,1)$ 并求解

$$
\begin{pmatrix} q_{11} & q_{12} & q_{13} & q_{14}\\ q_{12} & q_{22} & q_{23} & q_{24}\\ q_{13} & q_{23} & q_{33} & q_{34}\\ 0&0&0&1 \end{pmatrix}\tilde{\mathbf{x}} = \begin{pmatrix}0\\0\\0\\1\end{pmatrix}.
$$

如果矩阵奇异（所有平面几乎平行，比如在平坦区域），就在两个端点和中点中选最好的。

**数值例子。** 立方体角上的顶点接触平面 $x=0$、$y=0$、$z=0$。于是 $\mathbf{p}_1 = (1,0,0,0)$ 等，$\mathbf{Q} = \mathrm{diag}(1,1,1,0)$，一个点的误差是 $x^2+y^2+z^2$：角点自身误差为零，任何移动都要付出其平方距离的代价。平坦区域上的顶点只看到一个平面，$\mathbf{Q} = \mathbf{p}\mathbf{p}^\top$ 的秩为 1，在平面内移动没有代价。这正是 QEM 先从平坦区域删除顶点、保留角点和折痕的原因。

算法：

1. 为每个顶点计算 $\mathbf{Q}_v$。
2. 为每条边计算最优 $\bar{\mathbf{v}}$ 及其代价；把所有边放进最小堆。
3. 弹出代价最小的边，检查坍缩是否合法（见下），把 $\mathbf{u}$ 移到 $\bar{\mathbf{v}}$，删除 $\mathbf{w}$ 和这条边上的两个三角形，令 $\mathbf{Q}_u \leftarrow \mathbf{Q}_u+\mathbf{Q}_w$，并为 $\mathbf{u}$ 周围的边压入新代价。
4. 重复直到达到目标面数。

两项合法性检查保持网格干净。**链接条件（link condition）**：$\mathbf{u}$ 和 $\mathbf{w}$ 必须恰好共享两个邻居（这条边上两个三角形的顶点）；否则坍缩会产生非流形边。以及**翻转检查**：坍缩后保留下来的三角形，法线都不能被翻过来。

```python
import heapq
import numpy as np

def qem_simplify(V, F, target):
    V = V.copy(); F = [list(f) for f in F]; n = len(V)
    vf = [set() for _ in range(n)]                    # vertex -> incident faces
    for fi, f in enumerate(F):
        for v in f: vf[v].add(fi)
    Q = np.zeros((n, 4, 4))
    for f in F:
        a, b, c = V[f]
        nrm = np.cross(b - a, c - a); nrm /= np.linalg.norm(nrm)
        p = np.append(nrm, -nrm @ a)
        for v in f: Q[v] += np.outer(p, p)
    alive, ver = np.ones(n, bool), np.zeros(n, int)
    neighbors = lambda v: {w for fi in vf[v] for w in F[fi]} - {v}

    def best(u, w):
        Qs = Q[u] + Q[w]
        A = Qs.copy(); A[3] = [0, 0, 0, 1]
        if np.linalg.cond(A) < 1e8:
            x = np.linalg.solve(A, [0, 0, 0, 1.0])
        else:
            cands = [np.append(V[u], 1), np.append(V[w], 1), np.append((V[u] + V[w]) / 2, 1)]
            x = min(cands, key=lambda c: c @ Qs @ c)
        return float(x @ Qs @ x), x[:3]

    heap = []
    def push(u, w):
        cost, x = best(u, w)
        heapq.heappush(heap, (cost, u, w, ver[u], ver[w], tuple(x)))
    for u in range(n):
        for w in neighbors(u):
            if u < w: push(u, w)
    faces = len(F)
    while faces > target and heap:
        cost, u, w, vu, vw, x = heapq.heappop(heap)
        if not (alive[u] and alive[w]) or ver[u] != vu or ver[w] != vw:
            continue                                  # stale heap entry
        if len(neighbors(u) & neighbors(w)) != 2:
            continue                                  # link condition
        x, shared = np.array(x), vf[u] & vf[w]
        flip = False
        for fi in (vf[u] | vf[w]) - shared:           # normal flip check
            old = V[F[fi]]
            new = np.array([x if v in (u, w) else V[v] for v in F[fi]])
            n0 = np.cross(old[1] - old[0], old[2] - old[0])
            n1 = np.cross(new[1] - new[0], new[2] - new[0])
            if n0 @ n1 <= 0.1 * np.linalg.norm(n0) * np.linalg.norm(n1):
                flip = True; break
        if flip:
            continue
        V[u], Q[u] = x, Q[u] + Q[w]                   # collapse w into u
        for fi in shared:
            for v in F[fi]: vf[v].discard(fi)
            faces -= 1
        for fi in vf[w]:
            F[fi] = [u if v == w else v for v in F[fi]]; vf[u].add(fi)
        vf[w], alive[w] = set(), False
        ver[u] += 1                                   # invalidates old entries of u
        for nb in neighbors(u): push(u, nb)
    keep = sorted({fi for v in range(n) if alive[v] for fi in vf[v]})
    return V, np.array([F[fi] for fi in keep])
```

每个顶点的版本计数器 `ver` 是一种标准的惰性删除技巧：不去更新堆内的条目，而是压入新条目，并忽略弹出时顶点在压入之后已经变化过的条目。生产实现（meshoptimizer、PyMeshLab 的二次误差抽取、CGAL 的 `Surface_mesh_simplification`）还加入了考虑 UV 和法线的属性二次型、保护边界的平面，以及对细薄部分的保护。

下图展示同一个网格被简化到越来越少的面时，顶点集中在哪里。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-qem.svg" caption="用 `qem_simplify` 对一个凹凸、拉长的球（1,280 个面的 icosphere）做 QEM 边坍缩，简化到 400、150 和 60 个面。强弯曲区域保留更多顶点，因为在那里坍缩会让曲面偏离许多不同的平面；较平坦的区域先被简化，最后只剩大三角形。" %}

## 7. 参数化

**参数化（parameterization）** 把曲面片映射到平面，$\mathbf{x}_i \mapsto \mathbf{u}_i \in \mathbb{R}^2$，使二维纹理能画在三维曲面上（[第 3 篇]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})的 UV），或让重网格化和拟合在二维中进行。只有可展曲面（高斯曲率为零）能无失真地摊平，所以每种方法都要选择保持什么：角度（**共形**，conformal）、面积（**保面积**，equiareal），或尽可能保持刚性。

### Tutte 嵌入

Tutte（1963）为图证明了一个了不起的定理，Floater 把它带到了网格上：取一个圆盘拓扑的网格，把边界顶点按顺序固定在一个凸多边形上，并把每个内部顶点放在其邻居的凸组合处，

$$
\mathbf{u}_i = \sum_{j \in N(i)} \lambda_{ij}\,\mathbf{u}_j, \qquad \lambda_{ij} > 0, \quad \sum_j\lambda_{ij} = 1 .
$$

那么结果是一个合法嵌入：没有三角形翻转，也没有重叠。计算上只是一次稀疏线性求解 $\mathbf{L}\_{II}\mathbf{U}\_I = -\mathbf{L}\_{IB}\mathbf{U}\_B$（拉普拉斯的内部行，边界位置移到右边）。用均匀权重时它就是"重心"嵌入或 Tutte 嵌入；用余切权重时它是离散**调和映射（harmonic map）**，能更好地保持网格形状，但在权重为负的地方可能翻转三角形。Floater 的**均值坐标（mean-value coordinates）** 给出始终为正、同时感知形状的权重。

```python
import numpy as np

def tutte(V, F, loop, L):
    """Pin the boundary `loop` to the unit circle (by arc length), solve for interior UVs.
    L: a Laplacian with positive off-diagonal weights (uniform or cotan) and rows summing to 0."""
    n = len(V)
    seg = np.linalg.norm(V[loop] - V[np.roll(loop, -1)], axis=1)
    t = 2 * np.pi * np.r_[0, np.cumsum(seg)[:-1]] / seg.sum()
    UV = np.zeros((n, 2))
    UV[loop] = np.c_[np.cos(t), np.sin(t)]
    inner = np.setdiff1d(np.arange(n), loop)
    UV[inner] = np.linalg.solve(L[np.ix_(inner, inner)], -L[np.ix_(inner, loop)] @ UV[loop])
    return UV
```

用均匀权重时，`L` 就是 $\mathbf{A}-\mathbf{D}$（$\mathbf{A}$ 为邻接矩阵，$\mathbf{D}$ 为度数对角矩阵）；用余切权重时就是上一节的 `cotan_laplacian`。下图在一个带凸起的曲面片上比较这两种权重。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-tutte.svg" caption="一个带凸起的 $16\times16$ 网格曲面片（左；橙色为其边界），按弧长把边界固定在单位圆上后摊平。中：均匀权重的 Tutte 嵌入；右：余切权重的调和映射。每个三角形按面积比（二维比三维，均已归一化）的 $\log_2$ 着色：蓝色三角形缩小，红色变大。凸起的三维面积远大于它的投影面积，在两种映射中都被压缩；比较两种权重把剩余失真放在了哪里。各标题给出该映射中 $\log_2$ 面积比绝对值的最大值。" %}

### LSCM 与 ARAP

把边界固定在圆上正是很大一部分失真的来源。**最小二乘共形映射（least squares conformal maps, LSCM，Lévy 等 2002）** 让边界自由。当每个三角形中 $u$ 和 $v$ 的梯度正交且长度相等，即 $\nabla v = \mathbf{n}\times\nabla u$（柯西–黎曼方程）时，映射是共形的。LSCM 最小化各三角形违背量的平方和，这是二次能量，所以解仍是一个稀疏线性方程组；固定两个顶点即可消除相似变换的零空间。**ARAP 参数化**（Liu 等 2008）则要求每个三角形的二维像是三维三角形的旋转副本。它交替进行*局部*步（对每个三角形用 $2\times 2$ SVD 求最佳旋转，与 Sorkine 和 Alexa 的 ARAP 曲面建模相同）和*全局*步（用固定的余切拉普拉斯矩阵做一次稀疏求解），尽可能同时保持角度和面积。实践中，纹理图集先把曲面切成若干图表（接缝），再用 LSCM 或 ARAP 摊平每个图表，最后把它们打包进一张纹理。Blender 的"展开（Unwrap）"同时提供"基于角度（Angle Based）"和"共形（Conformal，即 LSCM）"两种方法。

## 8. 隐式曲面

隐式曲面是函数的零集 $S = \{\mathbf{x} : f(\mathbf{x}) = 0\}$，内部 $f < 0$。**有符号距离函数（signed distance function, SDF）** 是特例：$\lvert f(\mathbf{x})\rvert = $ 到 $S$ 的距离，所以几乎处处有 $\lVert\nabla f\rVert = 1$。SDF 让一些操作变得非常简单：

| 操作 | 公式 |
| --- | --- |
| 球 / 圆 | $f(\mathbf{x}) = \lVert\mathbf{x} - \mathbf{c}\rVert - r$ |
| 并、交 | $\min(f_1, f_2)$，$\;\max(f_1, f_2)$ |
| 差 | $\max(f_1, -f_2)$ |
| 平滑并 | $\mathrm{smin}_k(f_1, f_2) = f_2(1-h) + f_1 h - k\,h(1-h)$，$\;h = \mathrm{clamp}\big(\tfrac12 + \tfrac{f_2-f_1}{2k}, 0, 1\big)$ |
| 偏移 / 倒圆 | $f - r$ |
| 法线 | $\mathbf{n} = \nabla f / \lVert\nabla f\rVert$ |

（经过 min、max 或平滑 min 之后，结果只是距离的一个界而不是精确的 SDF，但对下面的球体追踪仍然安全。）DeepSDF、NeuS 和 Neuralangelo 等神经场用网络表示 $f$，本节的一切对它们同样适用。

### Marching Squares 与 Marching Cubes

要得到网格，就在规则格点上采样 $f$ 并寻找变号的位置。在二维中，**Marching Squares** 独立地处理每个单元。四个角点各自在内或在外，共 $2^4 = 16$ 种情况。在端点符号不同的每条边上，用线性插值放置交点：

$$
\mathbf{x} = \mathbf{x}_a + t(\mathbf{x}_b - \mathbf{x}_a), \qquad t = \frac{f_a}{f_a - f_b}.
$$

例如 $f_a = -0.2$、$f_b = 0.3$ 给出 $t = 0.2/0.5 = 0.4$。有两个交点的单元得到一条线段。两种**鞍点**情况（对角的角点在内部）有四个交点和两种可能的配对；在单元中心采样 $f$ 可以一致地选出一种。

```python
import numpy as np

def marching_squares(f, xs, ys):
    G = f(np.stack(np.meshgrid(xs, ys, indexing="ij"), -1))
    segs = []
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            cx = [xs[i], xs[i + 1], xs[i + 1], xs[i]]        # corners counter-clockwise
            cy = [ys[j], ys[j], ys[j + 1], ys[j + 1]]
            v = [G[i, j], G[i + 1, j], G[i + 1, j + 1], G[i, j + 1]]
            pts = {}
            for e in range(4):                                # edge e joins corners e, e+1
                a, b = e, (e + 1) % 4
                if (v[a] < 0) != (v[b] < 0):
                    t = v[a] / (v[a] - v[b])
                    pts[e] = (cx[a] + t * (cx[b] - cx[a]), cy[a] + t * (cy[b] - cy[a]))
            if len(pts) == 2:
                segs.append(list(pts.values()))
            elif len(pts) == 4:                               # saddle: ask the cell centre
                c = f(np.array([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2]))
                if (c < 0) == (v[0] < 0):                     # corners 0 and 2 connected
                    segs += [[pts[0], pts[1]], [pts[2], pts[3]]]
                else:
                    segs += [[pts[3], pts[0]], [pts[1], pts[2]]]
    return segs

circle = lambda p: np.hypot(p[..., 0], p[..., 1]) - 0.6
segs = marching_squares(circle, np.linspace(-1, 1, 12), np.linspace(-1, 1, 12))
print(len(segs), "segments")                                  # 24
```

下图把这段代码用在一个二维 SDF 上，并比较两种单元数。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-marching-squares.svg" caption="左：一个二维 SDF（圆与方框的平滑并）及其等值线；粗线为 $f=0$。中：在 $11\times11$ 个单元上做 Marching Squares；蓝色实心点在内部（$f<0$），红色空心点在外部，紫色线段是输出，灰色虚线是真实零集。右：在 $35\times35$ 个单元上，输出在视觉上已经精确。沿曲线方向的精度由线性插值而不是网格决定；网格决定的是哪些细节根本能被分辨出来。" %}

你可以实时运行同一个算法。小部件中的 SDF 是三个圆的平滑并。

{% include widget.liquid name="graphics-marching-squares" height="440" caption="在实时 SDF 上运行的 Marching Squares。用鼠标或手指拖动三个圆心，并改变单元数。蓝点在内部（$f<0$），红色空心点在外部，紫色线段是输出，虚线是细网格得到的参考曲线。取消勾选线性插值，每个交点都会放在边的中点，可以看到由此产生的阶梯。单元很少时，圆团之间的细颈会消失或断开：网格决定了哪些特征根本能被分辨出来。" %}

**Marching Cubes**（Lorensen 和 Cline 1987）是同样的思想推广到三维：8 个角点给出 $2^8 = 256$ 种情况，按对称性约化为 15 类，每类存成一张三角形表。原始表中有歧义面，可能留下孔洞；后来的版本（渐近判定、Marching Cubes 33）修复了这一点。一个更简单的近亲 **Marching Tetrahedra** 把每个立方体分成 6 个四面体；四面体在对称意义下只有 3 种情况（一个角在内：一个三角形；两个在内：一个四边形；没有在内：什么都不输出；三个或四个在内的情况与它们互为补集），因此没有歧义，代价是三角形更多。图中使用它，是因为整个算法在图形脚本里只占 25 行。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-marching-tets.svg" caption="用 Marching Tetrahedra 从 SDF（一个环面与一个球的平滑并）中提取的三维等值面，在 $26^3$ 个网格点上采样。每个三角形都来自曲面穿过的某个单元中的一个四面体；着色使用三角形法线。" %}

Marching Cubes 把顶点放在网格边上，所以会把尖锐特征磨圆。**对偶轮廓（dual contouring）**（Ju 等 2002）则在曲面穿过的每个单元*内部*放一个顶点，位置是最小化由交点及其法线（Hermite 数据）构成的 QEF（二次误差函数，quadratic error function；与 QEM 相同的二次型思想）的点，再把相邻单元的顶点连起来。它能重现尖锐的角和棱，并支持自适应八叉树。Neural Dual Contouring（Chen 等 2022）学习这些顶点该放在哪里。

### 球体追踪

也可以不经过网格，直接用光线步进（ray marching）渲染 SDF，这是[第 5 篇]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})光线投射的延伸。某点处的 SDF 值是一个不包含任何表面的球的半径，所以光线 $\mathbf{o} + t\mathbf{d}$ 可以安全地前进这么远（Hart 1996）：

$$
t_{k+1} = t_k + f(\mathbf{o} + t_k\mathbf{d}),
$$

当 $f < \varepsilon$（命中）或 $t > t_{\max}$（未命中）时停止。远离表面时步长很大；接近掠射角时步长变得很小，这是该方法的弱点。Shadertoy 风格的演示和许多神经场渲染器都建立在这个循环之上。

下图在同一个 SDF 中追踪三条光线，注意步长如何随到表面的距离变化。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-sphere-tracing.svg" caption="从黑色方块出发、穿过 Marching Squares 图中 SDF 的三条球体追踪光线。每个圆的半径是当前点的 $f$，它与表面相切而不穿过表面，所以下一个点位于圆周上。紫色光线正面命中，只需几步；橙色光线以浅角度接近方框顶部，沿表面前进时步长逐渐变小；绿色光线未命中并离开区域。图例给出步数。" %}

## 9. 从点重建

扫描仪、深度相机或运动恢复结构（structure from motion，SfM）流水线（[神经渲染第 1 篇]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})）产生的是点，而不是网格。重建要恢复出一个水密（watertight）的表面。

**法线估计。** 对每个点取 $k$ 个最近邻并拟合平面：法线是邻居 $3\times3$ 协方差矩阵最小特征值对应的特征向量（PCA，Hoppe 等 1992）。PCA 只给出一条直线而非方向，所以法线还必须一致地**定向**，经典做法是沿邻域图的最小生成树传播，翻转每条法线使之与邻居一致。

**泊松重建（Poisson reconstruction）**（Kazhdan、Bolitho 和 Hoppe 2006）。设 $\chi$ 为实体的指示函数：内部为 1，外部为 0（这里的 $\chi$ 与前面的欧拉示性数无关）。它的梯度除表面外处处为零，在表面上指向内部。所以把有向法线（指向外部）平滑后得到的向量场 $\vec V$，就是 $-\nabla\chi$ 的一个采样。求梯度与 $-\vec V$ 最接近的 $\chi$：

$$
\min_\chi \int \lVert\nabla\chi + \vec V\rVert^2 \quad\Longrightarrow\quad \Delta\chi = -\nabla\cdot\vec V .
$$

这是一个泊松方程：一个全局、稀疏、条件良好的线性方程组，三维中在自适应八叉树上求解。表面取等值集 $\chi = \bar\chi$（$\bar\chi$ 为 $\chi$ 在输入点处的平均），用 Marching Cubes 提取。由于解是全局的，数据中的孔洞会被平滑地填补，噪声也会被平均掉。**屏蔽泊松（screened Poisson）**（Kazhdan 和 Hoppe 2013）加入一项 $\alpha\sum_i\chi(\mathbf{p}_i)^2$，把零等值集拉向点（$\chi$ 被平移使表面位于 0），从而保留更多细节、避免过度平滑。MeshLab、Open3D 和 CloudCompare 中用的就是这个版本。

在二维中整个方法一页就能写完。周期网格让 FFT 能精确求解泊松方程：

```python
import numpy as np

rng = np.random.default_rng(7)
curve = lambda th: 0.55 + 0.13 * np.cos(3 * th) + 0.05 * np.sin(5 * th)
th = np.sort(rng.uniform(0, 2 * np.pi, 140))
P = np.c_[curve(th) * np.cos(th), curve(th) * np.sin(th)] + 0.008 * rng.standard_normal((140, 2))

# 1. PCA normals from the 8 nearest neighbours, oriented away from the centroid
D2 = ((P[:, None] - P[None]) ** 2).sum(-1)
N = np.array([np.linalg.eigh(np.cov(P[np.argsort(d)[:8]].T))[1][:, 0] for d in D2])
N *= np.sign(((P - P.mean(0)) * N).sum(1))[:, None]

# 2. splat the normals into a smooth vector field V on an M x M grid
M = 128
xs = np.linspace(-1, 1, M, endpoint=False); h = xs[1] - xs[0]
GX, GY = np.meshgrid(xs, xs, indexing="ij")
Vx, Vy = np.zeros((M, M)), np.zeros((M, M))
for p, n in zip(P, N):
    g = np.exp(-((GX - p[0]) ** 2 + (GY - p[1]) ** 2) / (2 * (2 * h) ** 2))
    Vx += n[0] * g; Vy += n[1] * g

# 3. solve lap(chi) = -div(V) with the FFT (5-point Laplacian eigenvalues)
div = (np.roll(Vx, -1, 0) - np.roll(Vx, 1, 0) + np.roll(Vy, -1, 1) - np.roll(Vy, 1, 1)) / (2 * h)
k = np.fft.fftfreq(M) * 2 * np.pi
lam = (2 * np.cos(k)[:, None] + 2 * np.cos(k)[None, :] - 4) / h ** 2
lam[0, 0] = 1.0
chi_hat = np.fft.fft2(-div) / lam; chi_hat[0, 0] = 0.0
chi = np.real(np.fft.ifft2(chi_hat))

# 4. iso-value = mean of chi at the samples; extract with marching squares
idx = np.clip(np.round((P + 1) / h).astype(int), 0, M - 1)
iso = chi[idx[:, 0], idx[:, 1]].mean()
print("iso-value", round(float(iso), 4))                     # 0.0485
```

用质心定向的技巧只适用于像这样的星形形状；它在这里代替上面描述的生成树传播。

下图是这段代码的运行结果。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-poisson-2d.svg" caption="用脚本做的二维泊松重建。左：140 个带噪声的采样点及其 PCA 法线。中：$\Delta\chi=-\nabla\cdot\vec V$ 的解 $\chi$，外部低、内部高，白线为穿过采样点的等值线。右：该等值线（紫色）与真实曲线（虚线）的对比：即使在随机采样稀疏的地方，它也是一条闭合、光滑的曲线。" %}

### 神经隐式曲面

如今多视图重建常常经由神经场完成。**NeuS**（Wang 等 2021）把表面表示为 SDF 网络的零等值集，并用 logistic 函数把 SDF 转换为体密度，使 [NeRF 式体渲染]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})在表面处无偏。它加入 **eikonal** 损失 $(\lVert\nabla f\rVert - 1)^2$ 让 $f$ 保持为距离函数。**Neuralangelo**（Li 等 2023）使用多分辨率哈希网格（[快速辐射场]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})），配合数值梯度和由粗到细的训练来处理大场景。在高斯这一侧，[2D Gaussian Splatting 和 Gaussian Opacity Fields]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}) 让高斯变得更像表面，再提取网格：用 TSDF 融合加 Marching Cubes，或在高斯中心上做 Marching Tetrahedra。所有这些流水线最终都落到第 8 节的提取，通常还有第 6 节的简化。

一个较新的方向绕开了场：自回归 Transformer 像美术师一样逐个 token 生成网格。MeshGPT（CVPR 2024）学习三角形 token 的词表。MeshAnything（ICLR 2025）、EdgeRunner（ICLR 2025）和 Meshtron（2024 年 12 月的预印本）把它扩展到有数千个面、类似美术制作的网格，以点云或图像为条件。它们之所以出现，是因为 Marching Cubes 得到的网格稠密且不规则，而美术和游戏引擎需要紧凑、结构良好的拓扑。

## 10. 工具

这些东西很少需要全部自己写。标准库有：

| 库 | 语言 | 擅长 |
| --- | --- | --- |
| [libigl](https://libigl.github.io/) | C++ 纯头文件，Python 绑定 | 拉普拉斯、曲率、参数化（LSCM、ARAP）、布尔运算；矩阵风格的 API，与本文很接近 |
| [CGAL](https://www.cgal.org/) | C++ | 稳健的精确谓词、Delaunay、简化、重网格化、泊松、布尔运算 |
| [OpenMesh](https://www.graphics.rwth-aachen.de/software/openmesh/) | C++、Python | 半边数据结构、简化、细分 |
| [geometry-central](https://geometry-central.net/) + [Polyscope](https://polyscope.run/) | C++、Python | 内蕴三角化、DDG 算子；快速三维查看器 |
| [PyMeshLab](https://pymeshlab.readthedocs.io/) | Python | MeshLab 的全部滤镜：屏蔽泊松、二次误差简化、清理 |
| [trimesh](https://trimesh.org/) | Python | 加载、修复、射线查询、布尔运算、各种便利功能 |
| [Open3D](https://www.open3d.org/) | C++、Python | 点云、法线估计、泊松、TSDF 融合 |
| Blender（`bpy`、`bmesh`） | Python | 用脚本调用建模算子、细分、简化和 UV 展开 |

例如，Open3D 用三个调用（法线估计、法线定向、泊松重建）就完成了第 9 节，前两行只是准备一份示例点云：

```python
import open3d as o3d  # pip install open3d

mesh = o3d.io.read_triangle_mesh(o3d.data.BunnyMesh().path)          # downloads a sample
pcd = mesh.sample_points_poisson_disk(5000)
pcd.estimate_normals(o3d.geometry.KDTreeSearchParamKNN(knn=20))     # PCA normals
pcd.orient_normals_consistent_tangent_plane(15)                     # spanning-tree orientation
rec, density = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pcd, depth=8)
print(rec)
```

## 动手试试

- 上面的细分小部件展示了 Loop 和 Catmull–Clark 的一维版本。比较 4 点格式在尖锐控制角处的过冲，以及 B 样条格式始终留在控制多边形内部。
- [首页实验室]({{ '/' | relative_url }}#lab)渲染网格和高斯；Gaussian World 标签页里的表示，正是第 9 节从中提取表面的那种。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Tutte, *How to draw a graph* | Proc. London Math. Soc. | 1963 | [DOI](https://doi.org/10.1112/plms/s3-13.1.743) | 凸组合嵌入永不翻转；Tutte 参数化的基础 |
| Catmull & Clark, *Recursively generated B-spline surfaces on arbitrary topological meshes* | Computer-Aided Design | 1978 | [DOI](https://doi.org/10.1016/0010-4485(78)90110-0) | 四边形细分，电影建模的标准 |
| Loop, *Smooth Subdivision Surfaces Based on Triangles* | 硕士论文，犹他大学 | 1987 | [MSR 页面](https://www.microsoft.com/en-us/research/publication/smooth-subdivision-surfaces-based-on-triangles/) | 三角形细分，规则区域极限为 $C^2$ |
| Lorensen & Cline, *Marching cubes: A high resolution 3D surface construction algorithm* | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37422) | 从网格数据提取等值面 |
| Hoppe et al., *Surface reconstruction from unorganized points* | SIGGRAPH | 1992 | [DOI](https://doi.org/10.1145/133994.134011) | PCA 法线、MST 定向、由点得到有符号距离 |
| Pinkall & Polthier, *Computing discrete minimal surfaces and their conjugates* | Experimental Mathematics | 1993 | [DOI](https://doi.org/10.1080/10586458.1993.10504266) | 余切公式 |
| Taubin, *A signal processing approach to fair surface design* | SIGGRAPH | 1995 | [DOI](https://doi.org/10.1145/218380.218473) | 把网格平滑看作滤波；无收缩的 $\lambda\vert\mu$ |
| Hart, *Sphere tracing* | The Visual Computer | 1996 | [DOI](https://doi.org/10.1007/s003710050084) | 距离函数的安全光线步进 |
| Garland & Heckbert, *Surface simplification using quadric error metrics* | SIGGRAPH | 1997 | [DOI](https://doi.org/10.1145/258734.258849) | QEM 边坍缩，至今仍是默认的简化算法 |
| Desbrun, Meyer, Schröder & Barr, *Implicit fairing of irregular meshes using diffusion and curvature flow* | SIGGRAPH | 1999 | [DOI](https://doi.org/10.1145/311535.311576) | 隐式积分与用于平滑的余切拉普拉斯 |
| Lévy, Petitjean, Ray & Maillot, *Least squares conformal maps* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566590) | 自由边界的共形参数化，一次线性求解 |
| Ju, Losasso, Schaefer & Warren, *Dual contouring of Hermite data* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566586) | 通过 QEF 顶点从隐式数据得到尖锐特征 |
| Meyer, Desbrun, Schröder & Barr, *Discrete differential-geometry operators for triangulated 2-manifolds* | VisMath (Springer) | 2003 | [DOI](https://doi.org/10.1007/978-3-662-05105-4_2) | 混合 Voronoi 面积、曲率算子 |
| Kazhdan, Bolitho & Hoppe, *Poisson surface reconstruction* | SGP | 2006 | [DOI](https://doi.org/10.2312/SGP/SGP06/061-070) | 把重建表述为泊松问题 |
| Sorkine & Alexa, *As-rigid-as-possible surface modeling* | SGP | 2007 | [DOI](https://doi.org/10.2312/SGP/SGP07/109-116) | 局部/全局旋转拟合 |
| Liu, Zhang, Xu, Gotsman & Gortler, *A local/global approach to mesh parameterization* | Computer Graphics Forum | 2008 | [DOI](https://doi.org/10.1111/j.1467-8659.2008.01290.x) | ARAP 参数化 |
| Kazhdan & Hoppe, *Screened Poisson surface reconstruction* | ACM TOG | 2013 | [DOI](https://doi.org/10.1145/2487228.2487237) | 点约束；实践中使用的版本 |
| Wang et al., *NeuS* | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.10689) | SDF + 无偏体渲染用于多视图表面重建 |
| Chen, Tagliasacchi, Funkhouser & Zhang, *Neural Dual Contouring* | ACM TOG (SIGGRAPH) | 2022 | [arXiv](https://arxiv.org/abs/2202.01999) | 学习型对偶轮廓 |
| Li et al., *Neuralangelo* | CVPR | 2023 | [arXiv](https://arxiv.org/abs/2306.03092) | 场景尺度的哈希网格神经表面 |
| Siddiqui et al., *MeshGPT* | CVPR | 2024 | [DOI](https://doi.org/10.1109/CVPR52733.2024.01855) | 把网格当作 token 序列 |
| Huang et al., *2D Gaussian Splatting for Geometrically Accurate Radiance Fields* | SIGGRAPH | 2024 | [DOI](https://doi.org/10.1145/3641519.3657428) | 面元高斯，得到精确网格 |
| Yu, Sattler & Geiger, *Gaussian Opacity Fields* | ACM TOG (SIGGRAPH Asia) | 2024 | [DOI](https://doi.org/10.1145/3687937) | 用 Marching Tetrahedra 从高斯中提取网格 |
| Chen et al., *MeshAnything* | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2406.10163) | 以形状为条件生成类美术网格 |
| Tang et al., *EdgeRunner* | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2409.18114) | 用自回归自编码器做紧凑的网格 token 化 |
| Hao et al., *Meshtron* | arXiv 预印本（2024 年 12 月） | 2024 | [arXiv](https://arxiv.org/abs/2412.09548) | 把网格生成扩展到数万个面 |

## 学习资源

- Botsch、Kobbelt、Pauly、Alliez 和 Lévy，*Polygon Mesh Processing*（A K Peters/CRC，2010，[DOI](https://doi.org/10.1201/b10688)）：第 2-7 节的教科书。
- Keenan Crane，[*Discrete Differential Geometry: An Applied Introduction*](https://www.cs.cmu.edu/~kmcrane/Projects/DDG/)（CMU 15-458/858 讲义和课程视频）：对余切拉普拉斯和离散曲率最清晰的推导。
- **GAMES102**（刘利刚，中文）：几何建模与处理，样条、细分和参数化。
- [libigl 教程](https://libigl.github.io/tutorial/)：本文每个概念都有简短的 C++/Python 示例。
- Hoppe 和 Kazhdan 的项目主页提供泊松重建代码；[meshoptimizer](https://github.com/zeux/meshoptimizer) 用于生产级简化。

## 练习

1. 用边界角亏 $\pi - \sum\theta$ 证明带边界网格的离散高斯–博内定理，并在图形脚本（`bin/figures/graphics/graphics_08.py`）的 `grid_patch` 上数值验证。
2. 把 `mean_curvature` 中的重心面积换成混合 Voronoi 面积（Meyer 等：非钝角三角形用 Voronoi 面积，否则用三角形面积的一半或四分之一），并与环面的精确曲率比较误差。
3. 为封闭四边形网格实现 Catmull–Clark 细分并应用到立方体上。细分几层之后，曲面离球面有多远？
4. 给 `qem_simplify` 加一个保护边界的项：对每条边界边，加入一个经过该边、垂直于其所在面的平面的二次型，并赋予较大权重。简化网格曲面片并比较边界。
5. 运行二维泊松代码，但从一侧去掉一半采样点。重建在缺口处会怎样？为什么全局求解会有这种表现？

<details markdown="1"><summary>练习 3 提示</summary>

把立方体存为 6 个四边形。面点就是面中心。边点是 4 个点的平均。顶点规则对立方体所有角点都用 $k = 3$，即 $(\mathbf{Q} + 2\mathbf{R})/3$。极限曲面不是球：比较中心到原角点方向和到面中心方向的距离。

</details>

<details markdown="1"><summary>练习 5 提示</summary>

泊松方程只在有采样的地方有源项；在缺口里 $\chi$ 是调和函数，所以等值线会用连接两侧的最光滑曲线把孔洞封上。

</details>

下一篇：[动画与角色]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})，网格将获得骨架、蒙皮权重和运动。
