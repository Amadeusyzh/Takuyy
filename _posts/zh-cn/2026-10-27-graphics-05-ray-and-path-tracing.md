---
layout: post
title: "光线追踪与路径追踪：从求交到无偏全局光照"
date: 2026-10-27 09:05:00+0900
description: "光线-球体求交与 Möller-Trumbore 算法、基于 SAH 的 BVH、蒙特卡洛积分、重要性采样、俄罗斯轮盘赌、次事件估计与多重重要性采样，最后实现一个紧凑的 NumPy 路径追踪器。"
categories: graphics
tags: [ray-tracing, path-tracing, monte-carlo, bvh, importance-sampling, mis]
series: graphics
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

在[上一篇]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})中，我们写出了渲染方程并构建了基于物理的 BRDF，但只像光栅化器那样对少数几个点光源求值。渲染方程是对*所有*入射方向的积分，而每个方向上到达的光本身又是另一个渲染方程的解。**路径追踪**（path tracing）用蒙特卡洛采样直接求解这个递归积分：发射随机光线，跟踪它们的弹射，再对结果取平均。它是离线电影渲染背后的参考算法，是实时方法（下一篇）试图逼近的"真值"，也是可微渲染和神经渲染所要反演的前向模型。

本文从零构建每一个部件：光线与图元求交、加速结构、蒙特卡洛估计量、让路径追踪变得实用的方差缩减技巧，最后是一个约 130 行、向量化的 NumPy 路径追踪器。

## 预备知识

- 向量、点积与叉积、正交基（[第 1 篇]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})）。
- 辐射亮度、立体角、渲染方程、BRDF 与 GGX 微表面模型（[第 4 篇]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})）。
- 基础概率：随机变量、期望、方差、概率密度函数（probability density function，pdf）。
- Python 与 NumPy。

## 1. 光线与相机

光线（ray）是一条半直线 $\mathbf{r}(t) = \mathbf{o} + t\,\mathbf{d}$，$t > 0$，原点为 $\mathbf{o}$，单位方向为 $\mathbf{d}$。光栅化问的是"这个三角形覆盖了哪些像素？"；光线追踪问的是反过来的问题："这个像素看到的是哪个表面？"。对于位于 $\mathbf{e}$、朝 $-z$ 方向观察、垂直视场角为 $\phi$ 的针孔相机，穿过 $W \times H$ 图像中像素 $(i, j)$ 的光线（在像素内加一个随机偏移 $\xi \in [0,1)^2$，顺便免费得到抗锯齿）为

$$
x = \frac{2(i+\xi_x)}{W} - 1,\qquad y = 1 - \frac{2(j+\xi_y)}{H},\qquad
\mathbf{d} = \operatorname{normalize}\!\left(x \tan\tfrac{\phi}{2}\,a,\; y \tan\tfrac{\phi}{2},\; -1\right),
$$

其中 $a = W/H$ 为宽高比（我们使用正方形图像，所以 $a = 1$）。Turner Whitted 在 1980 年的光线追踪器追踪的就是这样的光线，并在每个交点处递归地生成阴影光线、反射光线和折射光线。这能得到清晰的镜面和硬阴影，却得不到软阴影、光泽反射或颜色渗透（color bleeding）：这些都需要对方向积分，而这正是本文其余部分的主题。

下图为第 7 节的 Cornell box 画出了一张 $5\times5$ 小图像的这些光线，每条光线都终止于它真正击中的表面。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-camera-rays.svg" caption="针孔相机位于 $\mathbf{e}=(0,0,3.9)$、视场角 40°（y 轴朝上，看向 $-z$）的主光线。每条光线穿过眼前一个单位处紫色成像平面上的一个像素中心，并止于第一个交点（黑点），交点由第 7 节的求交代码算出。" %}

## 2. 光线与图元求交

### 球体

把光线代入 $\lVert \mathbf{x} - \mathbf{c} \rVert^2 = r^2$。记 $\mathbf{oc} = \mathbf{o} - \mathbf{c}$，且 $\lVert \mathbf{d} \rVert = 1$：

$$
t^2 + 2\,b\,t + c' = 0,\qquad b = \mathbf{oc}\cdot\mathbf{d},\quad c' = \mathbf{oc}\cdot\mathbf{oc} - r^2,\qquad
t = -b \pm \sqrt{b^2 - c'} .
$$

判别式为负表示未命中。我们取较小的正根；如果只有较大的根为正，说明光线从球内部出发（折射时会出现这种情况）。

下图展示了从球外出发的三种情况，以及一条从球内出发的光线。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-ray-sphere.svg" caption="左：四条光线与半径为 $r$ 的球。右：每条光线对应的二次函数 $t^2+2bt+c'$，其根就是交点距离。蓝色有两个正根（进入与离开），绿色与球相切（重根），灰色始终不为零（判别式为负，未命中），橙色光线从球内出发，近根为负（空心点），只有远根有效。" %}

### 三角形：Möller-Trumbore 算法

三角形 $(\mathbf{v}_0, \mathbf{v}_1, \mathbf{v}_2)$ 内的点可写为 $(1-u-v)\mathbf{v}_0 + u\mathbf{v}_1 + v\mathbf{v}_2$，其中重心坐标（barycentric coordinates）满足 $u, v \ge 0$、$u + v \le 1$（与[第 2 篇]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})中的坐标相同）。令它等于光线上的点，得到关于 $(t, u, v)$ 的 $3 \times 3$ 线性方程组。记 $\mathbf{e}_1 = \mathbf{v}_1 - \mathbf{v}_0$、$\mathbf{e}_2 = \mathbf{v}_2 - \mathbf{v}_0$、$\mathbf{T} = \mathbf{o} - \mathbf{v}_0$：

$$
\begin{bmatrix} -\mathbf{d} & \mathbf{e}_1 & \mathbf{e}_2 \end{bmatrix}
\begin{bmatrix} t \\ u \\ v \end{bmatrix} = \mathbf{T}.
$$

利用克莱姆法则和标量三重积恒等式 $\det[\mathbf{a}\ \mathbf{b}\ \mathbf{c}] = (\mathbf{a}\times\mathbf{b})\cdot\mathbf{c}$，就得到 Möller-Trumbore 公式（1997）。令 $\mathbf{P} = \mathbf{d}\times\mathbf{e}_2$，$\mathbf{Q} = \mathbf{T}\times\mathbf{e}_1$：

$$
\det = \mathbf{e}_1\cdot\mathbf{P},\qquad
u = \frac{\mathbf{T}\cdot\mathbf{P}}{\det},\qquad
v = \frac{\mathbf{d}\cdot\mathbf{Q}}{\det},\qquad
t = \frac{\mathbf{e}_2\cdot\mathbf{Q}}{\det}.
$$

该算法不需要预先计算平面方程，并且一旦 $u$ 或 $v$ 落在三角形之外就可以提前退出。$\det$ 接近零表示光线与三角形平行。返回的 $u, v$ 恰好就是在交点处插值法线和 UV 所用的权重。

下图使用与下方代码相同的测试光线。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-moller-trumbore.svg" caption="代码中测试用例的 Möller-Trumbore：从 $\mathbf{o}=(0.2,0.3,-1)$ 沿 $+z$ 出发的光线在 $t=1$ 处击中三角形 $\mathbf{v}_0=(0,0,0)$、$\mathbf{v}_1=(1,0,0)$、$\mathbf{v}_2=(0,1,0)$，$(u,v)=(0.2,0.3)$。交点把三角形分成三块，其面积就是重心坐标权重：红色（与 $\mathbf{v}_1$ 相对）为 $u$，绿色（与 $\mathbf{v}_2$ 相对）为 $v$，蓝色为 $1-u-v$。右：同一个交点在 $(u,v)$ 参数域中的位置；虚线光线因 $u+v>1$ 而未命中。" %}

```python
import numpy as np

def ray_sphere(o, d, c, r):
    """Smallest t > eps of o + t d hitting the sphere (|d| = 1), or inf."""
    oc = o - c
    b = np.dot(oc, d)                    # half of the usual 'b'
    disc = b * b - (np.dot(oc, oc) - r * r)
    if disc < 0:
        return np.inf
    s = np.sqrt(disc)
    for t in (-b - s, -b + s):           # near root first, then far root (ray starts inside)
        if t > 1e-6:
            return t
    return np.inf

def moller_trumbore(o, d, v0, v1, v2, eps=1e-9):
    """Ray vs many triangles. v0, v1, v2: (N, 3). Returns t, u, v (t = inf on miss)."""
    e1, e2 = v1 - v0, v2 - v0
    p = np.cross(d, e2)                  # P = D x E2
    det = np.sum(e1 * p, axis=1)
    ok = np.abs(det) > eps               # ray parallel to the triangle plane
    inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    s = o - v0                           # T = O - V0
    u = np.sum(s * p, axis=1) * inv
    q = np.cross(s, e1)                  # Q = T x E1
    v = (q @ d) * inv
    t = np.sum(e2 * q, axis=1) * inv
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > eps)
    return np.where(hit, t, np.inf), u, v

if __name__ == "__main__":
    o, d = np.array([0.2, 0.3, -1.0]), np.array([0.0, 0.0, 1.0])
    v0 = np.array([[0, 0, 0], [0, 0, 2.0]]); v1 = np.array([[1, 0, 0], [1, 0, 2.0]]); v2 = np.array([[0, 1, 0], [0, 1, 2.0]])
    t, u, v = moller_trumbore(o, d, v0, v1, v2)
    print(t, u, v)                       # [1. 3.] [0.2 0.2] [0.3 0.3]
    print(ray_sphere(np.zeros(3), d, np.array([0, 0, 5.0]), 1.0))  # 4.0
    print(ray_sphere(np.zeros(3), d, np.zeros(3), 1.0))            # 1.0 (from inside)
```

## 3. 加速结构：BVH 与 SAH

把每条光线与每个三角形逐一测试，每条光线的代价是 $O(N)$；而一帧电影画面有数百万个三角形和数十亿条光线。**层次包围盒**（bounding volume hierarchy，BVH）是一棵二叉树，每个节点存储一个轴对齐包围盒（axis-aligned bounding box，AABB），包住其下所有图元。光线若没有击中某个包围盒，就可以跳过整棵子树，因此对构建良好的树而言，遍历大约是 $O(\log N)$。

下图展示了用下方 SAH 代码为一个二维玩具场景构建的 BVH，以及一条光线对它的遍历。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-bvh.svg" caption="上：在 24 个盒子上构建的 SAH BVH（叶大小为 2，由下方代码构建）；包围盒轮廓按树深度着色，从深色（根）到浅色（深层）。下：同一棵树。按照 `traverse` 的方式遍历紫色光线：实心节点是光线进入的盒子，空心节点经过 slab 测试后被剔除，淡色节点根本没有被测试。在找到最近交点（橙色盒子）之前，25 个节点中只访问了 5 个。" %}

**光线-包围盒测试（slab 方法）。** AABB 是三个"平板"$l_k \le x_k \le h_k$ 的交集。光线位于第 $k$ 个平板内的区间为 $t \in [\min(t_{0k}, t_{1k}), \max(t_{0k}, t_{1k})]$，其中 $t_{0k} = (l_k - o_k)/d_k$，$t_{1k} = (h_k - o_k)/d_k$。当且仅当最大的进入时间不大于最小的离开时间时，光线击中包围盒。预先计算 $1/d_k$ 后，这只需要寥寥几次乘加；IEEE 无穷大会自动处理与坐标轴平行的光线。

**如何划分：表面积启发式（surface area heuristic，SAH）。** 对于位于凸体 $A$ 内部的凸体 $B$，一条击中 $A$ 的均匀随机直线同时击中 $B$ 的概率是表面积之比 $SA(B)/SA(A)$（积分几何中的经典结论）。Goldsmith 与 Salmon（1987）以及 MacDonald 与 Booth（1990）用它来估计把节点 $P$ 划分为子节点 $L$ 和 $R$ 的期望代价：

$$
C(L, R) = C_{\text{trav}} + \frac{SA(L)}{SA(P)}\,N_L\,C_{\text{isect}} + \frac{SA(R)}{SA(P)}\,N_R\,C_{\text{isect}},
$$

并与把 $P$ 保留为叶节点的代价 $N_P\,C_{\text{isect}}$ 比较。构建器沿每个轴对图元质心排序，用前缀和后缀包围盒扫描所有划分位置，再在最优划分上递归。工业级构建器不排序，而是把质心分到 16-32 个桶（bin）中，并行构建（或用线性 BVH 在 GPU 上构建），并使用更宽的树（4-8 个子节点）来匹配 SIMD 单元。硬件光线追踪（下一篇）就是用固定功能电路实现的 BVH 遍历。

对上面玩具场景的根节点，扫描结果如下：

{% include blog_figure.liquid path="assets/img/blog/graphics/05-sah-cost.svg" caption="把 24 个盒子按质心沿 $x$（上）和 $y$（下）排序后，每个候选划分的 SAH 代价 $C(L,R)$，取 $C_{\text{trav}}=C_{\text{isect}}=1$。靠近两端的划分几乎把所有图元放在一侧，代价接近叶节点（虚线，24）。构建器取全局最小值（橙色星号：沿 $y$ 划分为 11 和 13 个盒子，代价约 10.4）。" %}

```python
import numpy as np

def sah_split(lo, hi, cent, c_trav=1.0, c_isect=1.0):
    """Best SAH split of the primitives with bounds lo/hi (N,3) and centroids cent (N,3).
    Sweeps all N-1 split positions along each axis. Returns (cost, axis, order, k):
    the left child holds order[:k]."""
    n = len(cent)
    def area(l, h):
        e = np.maximum(h - l, 0)
        return 2 * (e[..., 0] * e[..., 1] + e[..., 1] * e[..., 2] + e[..., 2] * e[..., 0])
    parent = area(lo.min(0), hi.max(0))
    best = (c_isect * n, None, None, None)          # cost of making a leaf
    for axis in range(3):
        order = np.argsort(cent[:, axis])
        l, h = lo[order], hi[order]
        # prefix bounds (left side) and suffix bounds (right side)
        a_left = area(np.minimum.accumulate(l), np.maximum.accumulate(h))[:-1]
        a_right = area(np.minimum.accumulate(l[::-1])[::-1], np.maximum.accumulate(h[::-1])[::-1])[1:]
        k = np.arange(1, n)
        cost = c_trav + c_isect * (a_left * k + a_right * (n - k)) / parent
        i = np.argmin(cost)
        if cost[i] < best[0]:
            best = (cost[i], axis, order, i + 1)
    return best

def build(lo, hi, idx, leaf_size=2):
    """Recursive SAH BVH. Node = dict with box and either children or primitive ids."""
    node = {"lo": lo[idx].min(0), "hi": hi[idx].max(0)}
    if len(idx) <= leaf_size:
        node["prims"] = idx; return node
    cost, axis, order, k = sah_split(lo[idx], hi[idx], 0.5 * (lo[idx] + hi[idx]))
    if axis is None:                                 # leaf is cheaper than any split
        node["prims"] = idx; return node
    node["kids"] = (build(lo, hi, idx[order[:k]], leaf_size), build(lo, hi, idx[order[k:]], leaf_size))
    return node

def hit_box(o, inv_d, lo, hi, t_max):
    """Slab test: does the ray enter [lo, hi] before t_max?"""
    t0, t1 = (lo - o) * inv_d, (hi - o) * inv_d
    t_near = np.max(np.minimum(t0, t1)); t_far = np.min(np.maximum(t0, t1))
    return t_near <= t_far and t_far > 0 and t_near < t_max

def traverse(node, o, d, isect):
    """Closest hit. isect(prims, o, d) -> array of t. Uses a stack, nearest-so-far culling."""
    inv_d = 1.0 / np.where(d == 0, 1e-12, d)
    best_t, best_i, stack = np.inf, -1, [node]
    while stack:
        nd = stack.pop()
        if not hit_box(o, inv_d, nd["lo"], nd["hi"], best_t):
            continue
        if "prims" in nd:
            t = isect(nd["prims"], o, d)
            j = np.argmin(t)
            if t[j] < best_t:
                best_t, best_i = t[j], nd["prims"][j]
        else:
            stack.extend(nd["kids"])
    return best_t, best_i

if __name__ == "__main__":
    from mt import moller_trumbore
    rng = np.random.default_rng(1)
    n = 2000                                        # random small triangles in a cube
    v0 = rng.uniform(-1, 1, (n, 3)); v1 = v0 + rng.normal(0, 0.05, (n, 3)); v2 = v0 + rng.normal(0, 0.05, (n, 3))
    lo = np.minimum(np.minimum(v0, v1), v2); hi = np.maximum(np.maximum(v0, v1), v2)
    root = build(lo, hi, np.arange(n))
    isect = lambda p, o, d: moller_trumbore(o, d, v0[p], v1[p], v2[p])[0]
    for _ in range(200):
        o = rng.uniform(-2, 2, 3); d = rng.normal(size=3); d /= np.linalg.norm(d)
        t_bvh, i_bvh = traverse(root, o, d, isect)
        t_all = isect(np.arange(n), o, d)
        assert np.isclose(t_bvh, t_all.min()) or (np.isinf(t_bvh) and np.isinf(t_all.min()))
    print("BVH matches brute force")
```

把它与 `mt.py` 放在同一目录下运行。测试会在 200 条随机光线上将 BVH 与暴力求交的结果对比。

## 4. 我们要解的积分

回顾第 4 篇的渲染方程：

$$
L_o(\mathbf{x}, \omega_o) = L_e(\mathbf{x}, \omega_o) + \int_{\Omega} f_r(\mathbf{x}, \omega_i, \omega_o)\, L_i(\mathbf{x}, \omega_i)\, \cos\theta_i\, d\omega_i ,
$$

其中 $L_i(\mathbf{x}, \omega_i) = L_o(\mathbf{x}', -\omega_i)$，$\mathbf{x}'$ 是从 $\mathbf{x}$ 沿方向 $\omega_i$ 发出的光线击中的第一个表面。把递归展开，辐射亮度就变成对所有长度路径的求和：直接发出的光、反射一次的光、反射两次的光，依此类推。Kajiya（1986）提出了这个方程，同时提出了它的第一个通用蒙特卡洛求解器——路径追踪。被积函数不连续（可见性）、维度很高（每次弹射两维）且没有解析解，因此蒙特卡洛是天然的工具。

## 5. 蒙特卡洛积分

为了估计 $I = \int f(x)\,dx$，从一个在 $f \ne 0$ 处均为正的 pdf $p$ 中抽取 $X_1, \dots, X_N$，然后取平均：

$$
\hat{I}_N = \frac{1}{N}\sum_{k=1}^{N} \frac{f(X_k)}{p(X_k)},\qquad
\mathbb{E}[\hat{I}_N] = I,\qquad
\operatorname{Var}[\hat{I}_N] = \frac{1}{N}\left(\int \frac{f(x)^2}{p(x)}\,dx - I^2\right).
$$

对任何合法的 $p$，这个估计量都是**无偏的**（unbiased），并且其标准差以 $1/\sqrt{N}$ 下降，与维度无关。这就是它在路径空间中胜过数值求积的原因。问题在于常数：噪声减半需要 $4\times$ 的样本。所以关键是**在固定样本数下降低方差**，而最主要的手段就是选择 $p$。若 $p \propto f$，方差为零。我们永远无法精确知道 $f$（它包含未知的 $L_i$），但可以让 $p$ 与已知部分成比例：余弦项、BRDF 或光源。

下图在后面代码片段所用的辐照度积分上展示 $1/\sqrt{N}$ 规律。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-mc-convergence.svg" caption="随着样本数增加，$E=\int L\cos\theta\,d\omega=\pi/2$（下方代码片段）的累积估计 $\hat I_N$ 的误差。细线是 8 次独立运行，粗线是 400 次运行的 RMSE。在双对数坐标中两种方法都沿 $1/\sqrt{N}$ 的斜率（虚线）下降；重要性采样不改变斜率，只把整条线向下平移。在 $N=64$（点线）处，均匀采样的 RMSE 为 0.23，余弦采样为 0.12。" %}

**余弦加权半球采样。** 对朗伯（Lambertian）表面，$f_r = \rho/\pi$，被积函数中含有 $\cos\theta$。按 $p(\omega) = \cos\theta/\pi$ 采样可以同时消去两者：

$$
\frac{f_r\,L_i\cos\theta}{p} = \frac{(\rho/\pi)\,L_i\cos\theta}{\cos\theta/\pi} = \rho\,L_i .
$$

采样时对 CDF 求逆：取均匀随机数 $u_1, u_2$，令 $\cos\theta = \sqrt{1-u_1}$，$\phi = 2\pi u_2$。等价地，在单位圆盘上均匀采样一点（$r = \sqrt{u_1}$），再把它向上投影到半球上（Malley 方法）。下面的代码在相同样本数下，分别用均匀采样和余弦加权采样估计一个辐照度积分：

```python
import numpy as np
rng = np.random.default_rng(0)

# Irradiance E = int_H L(w) cos(theta) dw with a "sky" that is brighter near the zenith:
# L(w) = cos(theta)^2 (exact answer: 2*pi/4 = pi/2)
L = lambda cos_t: cos_t ** 2
exact, N, trials = np.pi / 2, 64, 2000

# (a) uniform hemisphere sampling: cos(theta) = u, pdf = 1 / (2 pi)
u = rng.random((trials, N))
est_uniform = np.mean(L(u) * u / (1 / (2 * np.pi)), axis=1)

# (b) cosine-weighted sampling: cos(theta) = sqrt(u), pdf = cos(theta) / pi
c = np.sqrt(rng.random((trials, N)))
est_cosine = np.mean(L(c) * c / (c / np.pi), axis=1)

for name, e in [("uniform", est_uniform), ("cosine", est_cosine)]:
    print(f"{name:8s} mean {e.mean():.4f} (exact {exact:.4f})  std {e.std():.4f}")
```

输出（64 个样本，2000 次试验）：两者的均值都与 $\pi/2 \approx 1.5708$ 吻合，但标准差从约 $0.22$ 降到 $0.11$。免费让噪声减半，相当于多用 $4\times$ 的样本。

下图展示了两种采样方式把方向放在了哪里，以及由此得到的估计值的分布。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-hemisphere-sampling.svg" caption="上：在法线 $\mathbf{n}$ 朝上的局部坐标系中，均匀半球采样（橙）与余弦加权采样（蓝）各 350 个方向。余弦采样把方向集中在法线附近，那里 $\cos\theta$ 和这片天空都较大，很少浪费在地平线附近。下：代码片段中 2000 个估计值（$N=64$）的直方图。两者都以 $\pi/2$ 为中心（无偏），但余弦采样的直方图宽度只有一半（标准差 0.11 对 0.22）。" %}

### 用可见法线对 GGX 做重要性采样

对于光泽表面，BRDF 波瓣主导了被积函数。直接按 GGX 法线分布 $D(\mathbf{m})$ 采样，会把样本浪费在背对观察者的微表面上。Heitz（2018）给出了一种精确而廉价的**可见法线分布**（distribution of visible normals，VNDF）采样器：

$$
D_{\omega_o}(\mathbf{m}) = \frac{G_1(\omega_o)\,\max(0, \omega_o\cdot\mathbf{m})\,D(\mathbf{m})}{\cos\theta_o},
$$

其依据是 GGX 恰好是一个被拉伸的椭球的法线分布：把观察方向拉伸到椭球变为半球的配置中，对其投影面积（一个圆盘，在不可见的那一半上被压扁）采样，再反拉伸回来。把 $\omega_o$ 关于采样到的 $\mathbf{m}$ 反射得到 $\omega_i$；反射的雅可比 $1/(4\,\omega_o\cdot\mathbf{m})$ 给出立体角 pdf：

$$
p(\omega_i) = \frac{D_{\omega_o}(\mathbf{m})}{4\,(\omega_o\cdot\mathbf{m})} = \frac{G_1(\omega_o)\,D(\mathbf{m})}{4\cos\theta_o}.
$$

对于 Cook-Torrance BRDF $f_r = F\,D\,G_2 / (4\cos\theta_o\cos\theta_i)$，样本权重化简为 $f_r\cos\theta_i / p = F\,G_2/G_1$，它接近 $F$，在掠射角下也不会爆炸。下面的代码将采样器与解析 pdf 进行对照：

```python
import numpy as np

def sample_ggx_vndf(ve, ax, ay, u1, u2):
    """Heitz 2018: sample a microfacet normal from the GGX distribution of visible
    normals. ve: unit view direction in the local frame (z = macro normal)."""
    vh = np.array([ax * ve[0], ay * ve[1], ve[2]]); vh /= np.linalg.norm(vh)  # stretch
    lensq = vh[0] ** 2 + vh[1] ** 2
    t1 = np.array([-vh[1], vh[0], 0.0]) / np.sqrt(lensq) if lensq > 0 else np.array([1.0, 0, 0])
    t2 = np.cross(vh, t1)
    r, phi = np.sqrt(u1), 2 * np.pi * u2                       # uniform point on a disk
    p1, p2 = r * np.cos(phi), r * np.sin(phi)
    s = 0.5 * (1 + vh[2])
    p2 = (1 - s) * np.sqrt(1 - p1 * p1) + s * p2               # squash to the visible part
    nh = p1 * t1 + p2 * t2 + np.sqrt(max(0.0, 1 - p1 * p1 - p2 * p2)) * vh
    ne = np.array([ax * nh[0], ay * nh[1], max(0.0, nh[2])])   # unstretch
    return ne / np.linalg.norm(ne)

def ggx_D(m_z, a):
    return a * a / (np.pi * (m_z ** 2 * (a * a - 1) + 1) ** 2)

def smith_G1(v_z, a):
    tan2 = (1 - v_z ** 2) / v_z ** 2
    return 2 / (1 + np.sqrt(1 + a * a * tan2))

def pdf_reflect(v, l, a):
    """Solid-angle pdf of l = reflect(-v, m) with m ~ D_v:  G1(v) D(m) / (4 v_z)."""
    m = (v + l) / np.linalg.norm(v + l, axis=-1, keepdims=True)
    return smith_G1(v[2], a) * ggx_D(m[..., 2], a) / (4 * v[2])

if __name__ == "__main__":
    rng = np.random.default_rng(0)
    a, v = 0.3, np.array([np.sin(1.0), 0.0, np.cos(1.0)])     # view 57 degrees off the normal
    n = 100_000
    m = np.array([sample_ggx_vndf(v, a, a, rng.random(), rng.random()) for _ in range(n)])
    l = 2 * (m @ v)[:, None] * m - v                           # mirror v about m
    # P(l_z > 0.8) from the sampler vs. integrating the analytic pdf with uniform directions
    p_sampled = np.mean(l[:, 2] > 0.8)
    u = rng.normal(size=(n, 3)); u /= np.linalg.norm(u, axis=1, keepdims=True); u[:, 2] = np.abs(u[:, 2])
    p_analytic = np.mean((u[:, 2] > 0.8) * pdf_reflect(v, u, a)) * 2 * np.pi
    print(f"P(l_z > 0.8): sampled {p_sampled:.4f}, analytic {p_analytic:.4f}")
```

两个概率都约为 $0.211$。

下图画出了这次运行的样本；图后的交互组件可以让你亲手比较三种采样方式。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-ggx-vndf.svg" caption="左：视线方向 $\omega_o$ 与法线成 57° 时，`sample_ggx_vndf`（$\alpha=0.3$）抽取的 250 个微表面法线 $\mathbf{m}$（青色），以及反射后的方向 $\omega_i$（橙色），后者在另一侧的镜面方向附近形成一个波瓣。右：20,000 个采样方向的 $\cos\theta_i$ 分布，与对方位角积分后的解析 pdf $G_1 D/(4\cos\theta_o)$ 一致。约 9% 的反射方向落在地平线以下，被舍弃（权重为 0）。" %}

{% include widget.liquid name="graphics-hemisphere-mc" height="420" caption="交互演示：选择一种采样方式和一个被积函数。每个点是一个采样方向，颜色表示其权重 $f/p$ 相对于真值的大小（蓝：小，橙：大）。均匀采样和余弦采样适合平滑的天空，但在狭窄的 GGX 波瓣上失效；GGX VNDF 采样正好相反。条形图给出三种方法在当前 N 下的相对 RMSE；拖动半球可以旋转视角。" %}

## 6. 路径追踪

在每次弹射时都使用单样本蒙特卡洛估计，就得到了一个像素的路径追踪估计量。从吞吐量（throughput）$\boldsymbol{\beta} = 1$ 的相机光线开始：

1. 找到交点 $\mathbf{x}$，累加 $\boldsymbol{\beta}\, L_e$。
2. 采样 $\omega_i \sim p$，并更新 $\boldsymbol{\beta} \mathrel{\leftarrow} \boldsymbol{\beta}\, f_r \cos\theta_i / p(\omega_i)$。
3. 从 $\mathbf{x}$ 沿方向 $\omega_i$ 继续。

每个像素对许多这样的路径取平均。下面三种技术把这个朴素版本变成实用的渲染器。

### 俄罗斯轮盘赌

在固定深度截断路径会引入偏差（能量丢失）。取而代之的是**俄罗斯轮盘赌**（Russian roulette）：几次弹射之后，以概率 $q$ 继续并除以 $q$：

$$
\hat{L}' = \begin{cases} \hat{L}/q & \text{with probability } q \\ 0 & \text{otherwise}\end{cases}
\qquad\Rightarrow\qquad \mathbb{E}[\hat{L}'] = \hat{L}.
$$

它是无偏的，但会增加方差，所以 $q$ 应当反映路径还能贡献多少；常见的选择是 $q = \operatorname{clamp}(\max_c \beta_c, 0.05, 0.95)$。暗的路径早早终止，亮的路径继续存活。

下图在一个精确值已知的玩具路径上验证了这一点。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-russian-roulette.svg" caption="白炉（white furnace）玩具模型：每次弹射的反照率为 $a=0.73$，并加入 1 个单位的光，因此路径的值为 $\sum_k a^k = 1/(1-a)\approx 3.704$。左：在固定最大深度处截断路径会产生偏低的偏差，大小为 $a^D/(1-a)$。像本文代码那样从第三次弹射开始使用 $q=\operatorname{clamp}(\beta,0.05,0.95)$ 的俄罗斯轮盘赌，均值正确（200,000 条路径的均值为 3.697）。右：轮盘赌路径存活的弹射次数；大多数在第三次弹射处终止，少数会持续 10 次以上。" %}

### 次事件估计

只用 BSDF 采样时，路径只有在恰好击中发光体时才能收集到光。光源很小时这很少发生，图像满是萤火虫噪点（fireflies）；对于点光源则永远不会发生。**次事件估计**（next-event estimation，NEE）在每次弹射时直接在光源上采样一点 $\mathbf{y}$ 并追踪一条阴影光线。写成在光源面积 $A$ 上的积分，直接光照为

$$
L_{\text{dir}}(\mathbf{x}, \omega_o) = \int_A f_r(\mathbf{x}, \omega_i, \omega_o)\,L_e(\mathbf{y}, -\omega_i)\,V(\mathbf{x}, \mathbf{y})\,\frac{\cos\theta_x\cos\theta_y}{\lVert \mathbf{x}-\mathbf{y} \rVert^2}\,dA_y ,
$$

其中 $V$ 是二值可见性，$\theta_y$ 是光源处的夹角。按面积均匀采样 $p_A = 1/A$ 时，估计量为 $f_r L_e V \cos\theta_x\cos\theta_y\,A / \lVert \mathbf{x}-\mathbf{y}\rVert^2$。要把它与 BSDF 采样比较，两个 pdf 必须使用同一测度。从面积到立体角的变量替换是 $d\omega = \cos\theta_y\,dA/\lVert \mathbf{x}-\mathbf{y}\rVert^2$，因此

$$
p_\omega(\omega_i) = p_A\,\frac{\lVert \mathbf{x}-\mathbf{y}\rVert^2}{\cos\theta_y}.
$$

加入 NEE 后，若一条 BSDF 采样的光线之后又击中了光源，就不能再次计入这份发光，否则直接光照会被计算两次。最简单的办法是忽略 BSDF 光线击中的发光（相机直接看到的以及完美镜面弹射之后的除外，因为 NEE 无法处理它们）。更好的办法是 MIS。

下图在场景的一个二维切片中跟随一条路径，并画出 NEE 在每个顶点处添加的阴影光线。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-path-nee.svg" caption="第 7 节 Cornell box 的 $x=0$ 平面中的一条相机路径（相机在右侧 $z=3.9$ 处，光源在天花板上，两个球体以侧面轮廓显示）。在每个顶点 $\mathbf{x}_k$，NEE 在光源上随机选一点（橙点）并发射阴影光线：黄色光线到达光源，贡献 $f_r L_e V\cos\theta_x\cos\theta_y A/\lVert\mathbf{x}-\mathbf{y}\rVert^2$；从 $\mathbf{x}_3$ 出发的虚线被球挡住（$V=0$）。紫色线段是 BSDF 采样得到的路径延续。为便于阅读，方向是手工挑选的；交点和可见性都是实际计算的。" %}

### 多重重要性采样

光源采样擅长小光源和粗糙表面；BSDF 采样擅长大光源和光泽表面，因为此时光源上的随机点几乎不会落进狭窄的波瓣。两者都无法处处取胜。Veach 与 Guibas（1995）展示了如何把多种技术组合为一个无偏估计量，即**多重重要性采样**（multiple importance sampling，MIS）。设技术 $i$ 有 $n_i$ 个样本 $X_{i,j}$，权重 $w_i$ 在 $f \ne 0$ 处之和为一：

$$
\hat{I} = \sum_{i}\frac{1}{n_i}\sum_{j=1}^{n_i} w_i(X_{i,j})\,\frac{f(X_{i,j})}{p_i(X_{i,j})},\qquad
w_i^{\text{balance}}(x) = \frac{n_i\,p_i(x)}{\sum_k n_k\,p_k(x)},\qquad
w_i^{\text{power}}(x) = \frac{\left(n_i\,p_i(x)\right)^2}{\sum_k \left(n_k\,p_k(x)\right)^2}.
$$

直观理解：每个样本按其技术*在该点*的好坏来加权。光源采样 pdf 高的地方，其样本占主导；BSDF pdf 高的地方，BSDF 样本占主导。Veach 证明了平衡启发式（balance heuristic）在所有加权方式中接近最优；幂启发式（power heuristic，$\beta = 2$）在实践中通常略好。在每次弹射使用一个光源样本和一个 BSDF 样本（$n_i = 1$）的路径追踪器中：

- NEE 样本：权重 $w_l = p_l^2/(p_l^2 + p_b^2)$，其中 $p_b$ 是该光源方向的 BSDF pdf。
- 击中光源的 BSDF 样本：权重 $w_b = p_b^2/(p_b^2 + p_l^2)$，其中 $p_l$ 是该方向的光源 pdf（立体角测度）。


下图展示了这些权重，以及它们在一个一维玩具问题上带来的效果。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-mis.svg" caption="上：一个光源样本（$w_l$，实线）与一个 BSDF 样本（$w_b$，虚线）的平衡启发式和幂启发式权重，作为 $p_l/p_b$ 的函数；幂启发式更陡地切换到更好的技术。下：一个一维玩具积分，宽度为 $s$ 的高斯 BSDF 波瓣乘以光源窗口，用两个样本估计。窄波瓣（光泽）有利于 BSDF 采样，宽波瓣（粗糙）有利于光源采样，而 MIS 在事先不知道哪一种更好的情况下，始终接近两者中较好的那一个。" %}

### 渐进式累积

路径追踪天然是**渐进式**（progressive）的：每帧每像素渲染一个样本，并维护一个滑动平均 $\bar{I}_s = \bar{I}_{s-1} + (I_s - \bar{I}_{s-1})/s$。图像起初充满噪声，并以 $1/\sqrt{s}$ 收敛。当相机或场景改变时，累积重新开始（在实时渲染中则做重投影并混合，见下一篇）。

下图用下一节的 NumPy 渲染器展示了这一收敛过程。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-spp.svg" caption="用第 7 节的路径追踪器做渐进式累积（100 x 100 像素，MIS，最多 6 次弹射）：每像素 1、4、16、256 个样本后的累积均值。样本数每增加 4 倍，噪声减半。随着噪声消退，软阴影、红绿色渗（color bleeding）以及只被间接光照亮的天花板逐渐显现。" %}

## 7. 一个紧凑的 NumPy 路径追踪器

下面的渲染器把所有内容组合起来，渲染一个带有两个漫反射球和一个矩形面光源的 Cornell box。它是*在路径上*向量化的：每次弹射时，所有存活光线同时与所有物体求交；未命中、击中光源或被俄罗斯轮盘赌终止的路径由布尔掩码移除（`pix` 记录每条存活路径所属的像素）。表面是朗伯材质，使用余弦加权采样；每次弹射都做带幂启发式 MIS 权重的 NEE，而 BSDF 采样击中光源时获得互补的权重。

```python
import numpy as np

W, H, SPP, MAX_DEPTH = 160, 160, 64, 6
rng = np.random.default_rng(0)

def normalize(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)

# Scene: quads (corner p, edges u, v) and spheres (center, radius).
# Each object has an albedo and an emission. The box spans [-1, 1]^3.
quads, spheres = [], []
def quad(p, u, v, albedo, emit=(0, 0, 0)):
    quads.append((np.array(p, float), np.array(u, float), np.array(v, float),
                  np.array(albedo, float), np.array(emit, float)))
white, red, green = (0.73, 0.73, 0.73), (0.65, 0.05, 0.05), (0.12, 0.45, 0.15)
quad((-1, -1, -1), (2, 0, 0), (0, 0, 2), white)          # floor
quad((-1, 1, -1), (0, 0, 2), (2, 0, 0), white)           # ceiling
quad((-1, -1, -1), (0, 2, 0), (2, 0, 0), white)          # back wall
quad((-1, -1, -1), (0, 0, 2), (0, 2, 0), red)            # left wall
quad((1, -1, -1), (0, 2, 0), (0, 0, 2), green)           # right wall
quad((-0.25, 0.999, -0.25), (0.5, 0, 0), (0, 0, 0.5), (0, 0, 0), (17, 12, 4))  # light (faces -y)
spheres.append((np.array([-0.45, -0.6, -0.3]), 0.4, np.array(white), np.zeros(3)))
spheres.append((np.array([0.45, -0.65, 0.3]), 0.35, np.array([0.8, 0.6, 0.2]), np.zeros(3)))
LIGHT = 5                                                # index of the light quad
lp, lu, lv = quads[LIGHT][:3]
l_n = normalize(np.cross(lu, lv)); l_area = np.linalg.norm(np.cross(lu, lv))
albedo = np.array([q[3] for q in quads] + [s[2] for s in spheres])
emission = np.array([q[4] for q in quads] + [s[3] for s in spheres])

def intersect(o, d):
    """Nearest hit for N rays: returns t (inf on miss), object id, geometric normal."""
    n = len(o)
    t_best = np.full(n, np.inf); obj = np.full(n, -1); nrm = np.zeros((n, 3))
    for i, (p, u, v, _, _) in enumerate(quads):
        qn = normalize(np.cross(u, v))
        denom = d @ qn
        with np.errstate(divide="ignore", invalid="ignore"):
            t = ((p - o) @ qn) / denom
        x = o + t[:, None] * d - p
        a, b = x @ u / (u @ u), x @ v / (v @ v)
        ok = (np.abs(denom) > 1e-9) & (t > 1e-4) & (t < t_best) & (a >= 0) & (a <= 1) & (b >= 0) & (b <= 1)
        t_best[ok], obj[ok], nrm[ok] = t[ok], i, qn
    for j, (c, r, _, _) in enumerate(spheres):
        oc = o - c
        b = np.sum(oc * d, axis=1); disc = b * b - (np.sum(oc * oc, axis=1) - r * r)
        s = np.sqrt(np.maximum(disc, 0))
        t = np.where(-b - s > 1e-4, -b - s, -b + s)
        ok = (disc > 0) & (t > 1e-4) & (t < t_best)
        t_best[ok], obj[ok] = t[ok], len(quads) + j
        nrm[ok] = (o[ok] + t[ok, None] * d[ok] - c) / r
    return t_best, obj, nrm

def onb(n):
    """Orthonormal basis (t, b) around unit normals n (Duff et al. 2017)."""
    s = np.where(n[:, 2] >= 0, 1.0, -1.0)
    a = -1.0 / (s + n[:, 2]); b = n[:, 0] * n[:, 1] * a
    t = np.stack([1 + s * n[:, 0] ** 2 * a, s * b, -s * n[:, 0]], 1)
    bb = np.stack([b, s + n[:, 1] ** 2 * a, -n[:, 1]], 1)
    return t, bb

def cosine_sample(n):
    u1, u2 = rng.random(len(n)), rng.random(len(n))
    r, phi = np.sqrt(u1), 2 * np.pi * u2
    t, b = onb(n)
    return (r * np.cos(phi))[:, None] * t + (r * np.sin(phi))[:, None] * b + np.sqrt(1 - u1)[:, None] * n

def render_sample():
    # pinhole camera at z = 3.9 looking down -z, 40 degree vertical field of view
    jx, jy = rng.random((H, W)), rng.random((H, W))
    px = (np.arange(W)[None, :] + jx) / W * 2 - 1
    py = 1 - (np.arange(H)[:, None] + jy) / H * 2
    th = np.tan(np.radians(20))
    d = normalize(np.stack([px * th, py * th, -np.ones_like(px)], -1).reshape(-1, 3))
    o = np.tile([0.0, 0.0, 3.9], (len(d), 1))
    L, beta = np.zeros_like(d), np.ones_like(d)
    pix = np.arange(len(d))                  # which pixel each live path belongs to
    prev_pdf = np.zeros(len(d))              # solid-angle pdf of the last BSDF sample
    for depth in range(MAX_DEPTH):
        t, obj, n = intersect(o, d)
        alive = obj >= 0
        o, d, t, obj, n, beta, pix, prev_pdf = (a[alive] for a in (o, d, t, obj, n, beta, pix, prev_pdf))
        if len(o) == 0:
            break
        x = o + t[:, None] * d
        # 1) emission found by BSDF sampling, MIS-weighted against light sampling
        hit_l = (obj == LIGHT) & (d @ l_n < 0)
        if depth == 0:
            w = np.ones(hit_l.sum())
        else:
            cos_l = -(d[hit_l] @ l_n)
            pl = t[hit_l] ** 2 / (cos_l * l_area)
            w = prev_pdf[hit_l] ** 2 / (prev_pdf[hit_l] ** 2 + pl ** 2)   # power heuristic
        np.add.at(L, pix[hit_l], beta[hit_l] * emission[obj[hit_l]] * w[:, None])
        keep = obj != LIGHT                  # paths stop at the light
        x, d, obj, n, beta, pix = x[keep], d[keep], obj[keep], n[keep], beta[keep], pix[keep]
        n = np.where((np.sum(n * d, 1) < 0)[:, None], n, -n)   # face the incoming ray
        a = albedo[obj]
        # 2) next-event estimation: one point on the area light, shadow ray
        y = lp + rng.random((len(x), 1)) * lu + rng.random((len(x), 1)) * lv
        to_l = y - x; dist2 = np.sum(to_l ** 2, 1); dist = np.sqrt(dist2); wi = to_l / dist[:, None]
        cos_s, cos_l = np.sum(n * wi, 1), -(wi @ l_n)
        ok = (cos_s > 0) & (cos_l > 0)
        ts, _, _ = intersect(x[ok] + 1e-4 * n[ok], wi[ok])
        vis = np.zeros(len(x), bool); vis[ok] = ts >= dist[ok] - 1e-3
        pl = dist2 / np.maximum(cos_l, 1e-8) / l_area         # light pdf in solid angle
        pb = np.maximum(cos_s, 0) / np.pi                     # BSDF (cosine) pdf
        wl = pl ** 2 / (pl ** 2 + pb ** 2)
        contrib = beta * (a / np.pi) * emission[LIGHT] * (np.maximum(cos_s, 0) * wl / pl)[:, None]
        np.add.at(L, pix[vis], contrib[vis])
        # 3) continue the path by cosine-weighted BSDF sampling: f*cos/pdf = albedo
        d = cosine_sample(n); o = x + 1e-4 * n
        prev_pdf = np.sum(n * d, 1) / np.pi
        beta = beta * a
        # 4) Russian roulette after a few bounces (unbiased: divide by survival prob.)
        if depth >= 2:
            q = np.clip(beta.max(1), 0.05, 0.95)
            survive = rng.random(len(q)) < q
            beta[survive] /= q[survive, None]
            o, d, beta, pix, prev_pdf = o[survive], d[survive], beta[survive], pix[survive], prev_pdf[survive]
    return L.reshape(H, W, 3)

if __name__ == "__main__":
    accum = np.zeros((H, W, 3))
    for s in range(1, SPP + 1):              # progressive accumulation: running mean
        accum += (render_sample() - accum) / s
    img = np.clip(accum, 0, 1) ** (1 / 2.2)
    with open("cornell.ppm", "wb") as f:
        f.write(f"P6 {W} {H} 255\n".encode())
        f.write((img * 255 + 0.5).astype(np.uint8).tobytes())
    print("mean radiance", accum.mean(axis=(0, 1)))
```

在 160 x 160 像素、每像素 64 个样本、最多 6 次弹射的设置下，它在单个 CPU 核心上大约运行 9 秒，并输出 `cornell.ppm`（任何图像查看器都能打开，也可以用 `python -c "from PIL import Image; Image.open('cornell.ppm').save('cornell.png')"` 转换）。你应该能看到球下方的软阴影、地面和球上的红绿颜色渗透，以及只被间接光照亮、较暗的天花板。检验任何 MIS 实现的一个好方法：把权重分别替换为"仅 BSDF"（$w_b = 1$，$w_l = 0$）和"仅 NEE"（$w_b = 0$，$w_l = 1$）。三个版本必须收敛到同一个平均图像，区别只在于噪声。在这个场景中，三个版本的均值在蒙特卡洛噪声范围内一致，而仅 BSDF 的图像明显更嘈杂。

下图正是执行了这个检验。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-estimators.svg" caption="用上面的渲染器、每像素 16 个样本得到的第 6 节的三种估计量：只用 BSDF 采样、只用 NEE、以及使用幂启发式的 MIS（右下：256 spp 的 MIS 作为参考）。光源很小，只用 BSDF 采样几乎没有用（大多数路径永远碰不到它），而 NEE 和 MIS 已经相当干净。图中数字是各估计量在每像素 256 个样本（48 x 48 像素）下的平均辐亮度：三者在蒙特卡洛噪声范围内收敛到同一个值。" %}

自然的扩展：使用第 5 节 VNDF 采样器的 GGX 材质、配合第 3 节 BVH 的三角形网格，以及用于景深的薄透镜相机（在圆盘光圈上采样光线原点，并瞄准焦平面）。

## 动手试试：实验室里的路径追踪器

主页上有同一算法的 GPU 版本：[打开实验室]({{ '/' | relative_url }}#lab)并选择路径追踪标签页。它在 WebGL 2 片元着色器中每帧每像素计算一个样本，并渐进式累积。材质使用 GGX BRDF 和 Heitz 的可见法线采样，玻璃使用精确的电介质菲涅耳项。**采样**开关恰好在第 6 节的三种估计量之间切换：

- **BSDF**：不做光源采样。路径只有在 BSDF 采样的光线恰好击中发光体时才收集到光，此时权重为 1。
- **NEE**：在每次不透明表面的弹射处，向天花板光源上的随机一点发射一条阴影光线。BSDF 采样弹射之后击中发光体的权重为 0，以避免重复计算。相机直接看到的光源以及透过玻璃看到的光源仍以权重 1 计入：演示把折射视为镜面（delta）事件，而 NEE 无法对穿过这种事件的路径采样。
- **MIS**：两者兼用，并以幂启发式组合。光源 pdf 为 $\lVert \mathbf{x}-\mathbf{y}\rVert^2/(\cos\theta_y A)$，正是上面的换算。

值得做的实验：

1. 把**光源大小**拖到最小。演示保持光源总功率不变，所以面积缩小时发出的辐射亮度会增大。在 BSDF 模式下，图像会溶解成萤火虫噪点；NEE 和 MIS 则保持干净。
2. 观察那个小镜面球（它的 GGX 粗糙度极小，波瓣极窄），并把光源调大。此时 NEE 变成了差的一方：它的光源样本几乎从不落入波瓣，所以在 NEE 模式下，镜面中光源的倒影变得又暗又斑驳，而 BSDF 采样能轻松找到它。再选中另一个物体，在不同的**粗糙度**下试试**金属**预设。MIS 在各处都跟随更好的那种技术。
3. 把**弹射次数**设为 1，然后逐渐增大：观察间接光（颜色渗透、被照亮的天花板）出现。演示从第三次弹射起使用俄罗斯轮盘赌，$q = \operatorname{clamp}(\max_c\beta_c, 0.05, 0.95)$，与我们的代码相同。
4. 增大**光圈**并双击对焦：薄透镜相机几乎不增加成本就能产生景深，因为它只是积分的又一个维度。

演示中有两处为了速度而刻意*有偏*：它会钳制过亮的间接样本（萤火虫钳制），并且在你交互时，由法线、深度和反照率缓冲（即"反照率""法线""深度"视图）引导的边缘保持 à-trous 小波降噪器会对图像滤波。降噪将在下一篇介绍。

## 超越基础路径追踪

当光只能通过狭窄通道到达相机时，单向路径追踪会很吃力：透过玻璃的焦散（caustics）、通过门缝照亮的场景。**双向路径追踪**（bidirectional path tracing；Lafortune 与 Willems 1993；Veach 与 Guibas 1994）从相机和光源两端追踪子路径并把它们连接起来，再用 MIS 对所有组合加权。**Metropolis 光传输**（Metropolis light transport；Veach 与 Guibas 1997）对贡献大的路径做变异。**路径引导**（path guiding，例如 Müller 等人 2017 年的 "Practical Path Guiding"）在渲染过程中学习入射辐射亮度的分布并从中采样，是我们之后会遇到的神经方法的直接前身。Veach 的博士论文至今仍是该理论最好的单一参考资料。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Whitted, "An Improved Illumination Model for Shaded Display" | Communications of the ACM | 1980 | [DOI](https://doi.org/10.1145/358876.358882) | 递归光线追踪：阴影、反射、折射 |
| Cook, Porter, Carpenter, "Distributed Ray Tracing" | SIGGRAPH | 1984 | [DOI](https://doi.org/10.1145/800031.808590) | 在镜头、时间和面积上分布光线：软阴影、景深、运动模糊 |
| Kajiya, "The Rendering Equation" | SIGGRAPH | 1986 | [DOI](https://doi.org/10.1145/15922.15902) | 渲染方程与第一个路径追踪器 |
| Goldsmith, Salmon, "Automatic Creation of Object Hierarchies for Ray Tracing" | IEEE CG&A | 1987 | [DOI](https://doi.org/10.1109/MCG.1987.276983) | 带表面积代价模型的层次包围盒 |
| MacDonald, Booth, "Heuristics for Ray Tracing Using Space Subdivision" | The Visual Computer | 1990 | （无链接） | 形式化了表面积启发式 |
| Veach, Guibas, "Optimally Combining Sampling Techniques for Monte Carlo Rendering" | SIGGRAPH | 1995 | [DOI](https://doi.org/10.1145/218380.218498) | 多重重要性采样，平衡与幂启发式 |
| Möller, Trumbore, "Fast, Minimum Storage Ray-Triangle Intersection" | Journal of Graphics Tools | 1997 | [DOI](https://doi.org/10.1080/10867651.1997.10487468) | 标准的光线-三角形求交测试 |
| Veach, "Robust Monte Carlo Methods for Light Transport Simulation" | 博士论文，Stanford | 1997 | [项目页](https://graphics.stanford.edu/papers/veach_thesis/) | 路径空间表述、MIS、BDPT、MLT |
| Heitz, "Sampling the GGX Distribution of Visible Normals" | JCGT 7(4) | 2018 | [论文](https://jcgt.org/published/0007/04/01/) | 精确、廉价的 GGX VNDF 采样 |

## 学习资源

- **PBRT**：Pharr、Jakob、Humphreys 著《Physically Based Rendering: From Theory to Implementation》，可在 [pbr-book.org](https://pbr-book.org/) 免费在线阅读。其中关于形状、BVH、蒙特卡洛和光传输的章节是本文内容的权威参考。
- **Ray Tracing in One Weekend** 系列（Peter Shirley 等），免费见 [raytracing.github.io](https://raytracing.github.io/)：一个周末用 C++ 写出光线追踪器，续作中再加入 BVH、纹理和蒙特卡洛。
- **Scratchapixel**（[scratchapixel.com](https://www.scratchapixel.com/)）：关于光线-三角形求交、加速结构和蒙特卡洛的详细课程。
- **GAMES101**（闫令琪，[课程主页](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html)）：第 13-16 讲涵盖 Whitted 光线追踪、BVH、辐射度量学和路径追踪，并配有作业。
- **Berkeley CS184**（[cs184.eecs.berkeley.edu](https://cs184.eecs.berkeley.edu/)）：其 "PathTracer" 项目一步步实现 BVH、直接光照和全局光照。Stanford CS148 也在入门层面介绍光线追踪。
- **smallpt**（Kevin Beason，[kevinbeason.com/smallpt](https://www.kevinbeason.com/smallpt/)）：99 行 C++ 实现的全局光照路径追踪器。
- 《Real-Time Rendering》（Akenine-Möller 等，第 4 版）中关于光线追踪的章节，可作为通往下一篇的桥梁。

## 练习

1. 证明蒙特卡洛估计量是无偏的，并推导其方差公式。然后证明 $p \propto \lvert f \rvert$ 使方差最小。
2. 通过对 $p(\theta, \phi) = \cos\theta\sin\theta/\pi$ 的边缘 CDF 和条件 CDF 求逆，推导余弦加权采样公式 $\cos\theta = \sqrt{1-u_1}$、$\phi = 2\pi u_2$。
3. 在 NumPy 路径追踪器中加入一个 GGX 金属球，用 `sample_ggx_vndf` 做 BSDF 采样，并在两个 MIS 权重中使用对应的 pdf。检查仅 BSDF、仅 NEE 和 MIS 三种图像收敛到同一均值。
4. 加载一个三角形网格（例如 OBJ 文件），构建 SAH BVH，测量每条光线的包围盒测试和三角形测试次数如何随三角形数量增长。与"中位数划分"构建器进行比较。
5. 在实验室中找到一种 NEE 单独使用比 BSDF 单独使用噪声更大的配置，并用两个 pdf 解释原因。

**下一篇：**[实时光线追踪]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})：硬件 BVH 遍历、降噪（à-trous、SVGF）、ReSTIR 与神经辐射缓存，也就是如何在每像素一个样本的条件下以每秒 60 帧得到这样的图像。
