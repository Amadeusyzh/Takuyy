---
layout: post
title: "物理与仿真引擎：从游戏物理到机器人模拟器"
date: 2026-10-27 13:05:00+0900
description: "拆开物理引擎的一步：粗测阶段、GJK 与 EPA、接触流形、PGS/TGS/soft step/XPBD 求解器、关节体；再看 Isaac、MuJoCo、Newton、Genesis 如何把引擎变成机器人模拟器，以及 OpenUSD 与域随机化。"
categories: graphics-engine
tags: [physics-engine, gjk, epa, collision-detection, constraint-solver, articulations, isaac-sim, mujoco, newton, openusd, domain-randomization]
series: graphics-engine
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[引擎解剖]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})一文把物理画成引擎帧里的一个方框，由固定时间步长驱动。本文打开这个方框。里面是一条流水线：先找出哪些物体可能接触，再精确算出接触位置，最后在几百微秒内求解接触力和关节力。同一条流水线一旦变得更精确、可微、并且大规模并行，就成了如今机器人和具身智能体学习所用的模拟器的核心。这就是为什么一个讲图形引擎的系列以机器人模拟器收尾，也是为什么下一篇能把读者交给世界模型。

积分器、PBD/XPBD 与布料的数学见[图形学第 07 篇]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})，从机器人角度看模拟器与基准测试见[具身智能第 03 篇]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})。本文采用引擎内部视角：数据结构、算法与设计取舍。

## 前置知识

- 向量、点积与叉积；凸集（任意两点之间的线段都包含在集合内）。
- 牛顿定律与冲量（冲量 $\mathbf{J}$ 产生 $\Delta \mathbf{v} = \mathbf{J}/m$）。
- [图形学第 07 篇]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})中的辛欧拉法与 XPBD；[引擎第 01 篇]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})中的固定时间步长循环。
- Python 与 NumPy。

## 1. 物理的一步

刚体（rigid body）保存质量 $m$、惯性张量 $\mathbf{I}$、位置 $\mathbf{x}$、朝向 $\mathbf{q}$、线速度 $\mathbf{v}$ 和角速度 $\boldsymbol{\omega}$，外加一个或多个碰撞**形状**（shape）：球、盒、胶囊、凸包、三角网格、高度场。每次调用 `step(dt)` 都运行相同的阶段（见图）：

1. **积分外力**：$\mathbf{v} \mathrel{+}= h\,\mathbf{M}^{-1}\mathbf{f}_{\text{ext}}$（重力、用户施加的力）。
2. **粗测阶段**（broad phase）：找出包围盒重叠的物体对。代价低，结果保守。
3. **细测阶段**（narrow phase）：对每一对做精确几何计算：是否接触？在哪里？有多深？
4. **接触流形**（contact manifold）：若干个共享同一法线和穿透深度的接触点，并与上一帧的接触点匹配。
5. **热启动与求解**：计算接触冲量和关节冲量，使物体不相互穿透、摩擦力成立、关节保持连接。
6. **积分位置**：$\mathbf{x} \mathrel{+}= h\,\mathbf{v}$，$\mathbf{q} \leftarrow \text{normalize}\big(\mathbf{q} + \tfrac{h}{2}(0,\boldsymbol{\omega})\otimes\mathbf{q}\big)$。
7. **岛、休眠、连续碰撞检测、事件**。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-step-pipeline.svg" caption="物理的一步。上排把形状变成接触（AABB → 候选对 → 接触流形），下排把接触变成运动。现代引擎（Box2D v3、PhysX TGS、XPBD 求解器）在子步循环（紫色虚线框）中重复求解与积分阶段，其中 $h = dt/n$。" %}

这一步总是使用**固定的** $dt$（通常为 $1/60$ 秒），由[第 01 篇]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})的累加器循环驱动。可变步长会让求解器的行为逐帧变化，并破坏确定性。

## 2. 粗测阶段：哪些物体对可能接触？

$n$ 个物体共有 $n(n-1)/2$ 对。$n = 10{,}000$ 时，每一步约需 5000 万次精确测试，太多了。粗测阶段为每个物体维护一个**轴对齐包围盒**（axis-aligned bounding box, AABB），只报告 AABB 重叠的物体对。两个 AABB 重叠，当且仅当它们在每个轴上的区间都重叠：

$$
\text{overlap}(a,b) \iff \bigwedge_{k \in \{x,y,z\}} \big(\text{lo}_{a,k} \le \text{hi}_{b,k}\ \wedge\ \text{lo}_{b,k} \le \text{hi}_{a,k}\big).
$$

### 扫描与剪枝

**扫描与剪枝**（sweep and prune, SAP，也叫 sort and sweep）沿一个轴对区间端点排序，从左向右扫描，同时维护一个"活动"列表，记录已开始但未结束的区间。某个区间开始时，每个仍处于活动状态的区间都与它构成一个候选对：

```python
import numpy as np

def sweep_and_prune(lo, hi):
    """Pairs whose x-intervals overlap. lo, hi: (n, 2) box corners."""
    order = np.argsort(lo[:, 0])
    active, pairs = [], []
    for i in order:
        active = [j for j in active if hi[j, 0] >= lo[i, 0]]   # drop intervals that ended
        pairs += [(j, i) for j in active]
        active.append(i)
    return pairs

rng = np.random.default_rng(0)
n, L = 400, 100.0
c = rng.uniform(0, L, (n, 2)); r = rng.uniform(0.4, 1.2, (n, 2))
lo, hi = c - r, c + r
cand = sweep_and_prune(lo, hi)
true = [(a, b) for a, b in cand if lo[a, 1] <= hi[b, 1] and lo[b, 1] <= hi[a, 1]]
print(n * (n - 1) // 2, len(cand), len(true))   # all pairs, x-candidates, true AABB overlaps
# -> 79800 2468 93
```

为什么这样有效？若盒子均匀分布在宽度为 $L$ 的世界中，平均半宽为 $\bar r$，则两个区间在 $x$ 上重叠的概率约为 $4\bar r / L$，候选对的期望数量约为 $\tfrac{n^2}{2}\cdot\tfrac{4\bar r}{L}$。如果世界随物体数量增长而保持密度不变（二维中 $L \propto \sqrt{n}$），候选对的增长是 $n^{1.5}$ 而不是 $n^2$，而真正的重叠只随 $n$ 线性增长。

实践中有两个工程技巧让 SAP 很快。帧与帧之间物体只移动一点点，排好序的列表几乎仍然有序，**插入排序**能以接近 $O(n)$ 的代价修复它。此外，引擎并不重新扫描，而是在两个端点交换位置时记录重叠的开始和结束事件。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-sweep-and-prune.svg" caption="随机盒子上的扫描与剪枝（脚本实际运行结果）。左：40 个盒子；场景下方的灰色条是它们按扫描顺序排列的 x 区间，红色盒子至少参与一个真正的 AABB 重叠。右：密度不变时各类物体对数量随 $n$ 的变化（双对数坐标）。全部物体对按 $n^2$ 增长；SAP 的 x 候选对沿虚线估计 $\frac{n^2}{2}\frac{4\bar r}{L}\propto n^{1.5}$ 增长；真正的重叠大致线性增长。蓝线与红线之间的差距是细测阶段的无用功，第二个轴或一棵树可以把它去掉。" %}

### 动态 AABB 树

当许多物体沿扫描轴排成一列（例如一长排箱子）时，SAP 会退化。因此大多数现代引擎（Box2D、Bullet、Jolt；PhysX 提供 SAP 等多种选项）使用**动态 AABB 树**：一种层次包围体（bounding volume hierarchy, BVH，见[图形学第 05 篇]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})），叶子是按边距和预测运动放大过的**胖** AABB（fat AABB）。只有当物体离开自己的胖盒时才重新插入。插入时选择使表面积增量最小的兄弟节点（表面积启发式），并通过树旋转保持平衡。物体对查询就是对树的同步下降。开放世界还会为粒子和大量等尺寸物体加上**空间哈希**（spatial hashing）或均匀网格。

## 3. 细测阶段：精确接触

对每个候选对，细测阶段回答三个问题：形状是否相交？**穿透深度** $d$ 是多少？**接触法线** $\mathbf{n}$ 是什么？球-球、胶囊-胶囊、盒-盒有专用例程；一般凸形状使用分离轴定理或 GJK。

### 分离轴定理（SAT）

两个凸多面体不相交，当且仅当存在一个轴，使它们的投影在该轴上不重叠。对二维多边形，只需测试两个多边形的边法线。对三维多面体，需要测试两者的面法线，再加上每对边的叉积。重叠最小的轴直接给出 $\mathbf{n}$ 和 $d$。SAT 是盒子和小凸包的标准选择，但边-边轴的数量会随形状复杂度迅速增长。

### GJK：通过闵可夫斯基差求距离

形状 $A$ 与 $B$ 的**闵可夫斯基差**（Minkowski difference）为

$$
A \ominus B = \{\, \mathbf{a} - \mathbf{b} \;:\; \mathbf{a}\in A,\ \mathbf{b}\in B \,\}.
$$

当 $A$、$B$ 为凸集时它也是凸集，并且 $A$ 与 $B$ 相交**当且仅当原点位于 $A \ominus B$ 中**（存在 $\mathbf{a} = \mathbf{b}$）。更一般地，$A$ 与 $B$ 的距离等于原点到 $A \ominus B$ 的距离。于是碰撞检测变成了一个问题："这个凸集包含原点吗？"

我们从不显式构造 $A \ominus B$。**Gilbert–Johnson–Keerthi**（GJK）算法只需要一个**支撑函数**（support function），即形状在方向 $\mathbf{d}$ 上最远的点：

$$
s_A(\mathbf{d}) = \arg\max_{\mathbf{a}\in A} \mathbf{a}\cdot\mathbf{d}, \qquad s_{A\ominus B}(\mathbf{d}) = s_A(\mathbf{d}) - s_B(-\mathbf{d}).
$$

多边形的支撑点是点积最大的顶点；球的支撑点是 $\mathbf{c} + r\,\mathbf{d}/\lVert\mathbf{d}\rVert$；胶囊的支撑点是线段的支撑点加上球的支撑点。这就是 GJK 能用同一段代码处理任意凸形状的原因。

GJK 用支撑点构建一个不断增长的**单纯形**（simplex）：点、线段、三角形，三维中还有四面体。

1. 任选方向 $\mathbf{d}$，令单纯形 $S = \{ s(\mathbf{d}) \}$；再令 $\mathbf{d} = -S_0$（指向原点）。
2. 取新点 $\mathbf{p} = s_{A\ominus B}(\mathbf{d})$。若 $\mathbf{p}\cdot\mathbf{d} \le 0$，说明 $A\ominus B$ 在方向 $\mathbf{d}$ 上最远的点都没有到达原点，原点在外部：**无碰撞**。
3. 把 $\mathbf{p}$ 加入 $S$。只保留其区域包含原点的子单纯形（顶点、边或整个单纯形），并令 $\mathbf{d}$ 从该特征指向原点。
4. 若单纯形包围了原点：**碰撞**。否则回到第 2 步。

在二维中，"垂直于边 $\mathbf{ab}$ 并指向原点"的方向用向量三重积计算：$(\mathbf{ab}\times\mathbf{ao})\times\mathbf{ab} = \mathbf{ao}\,(\mathbf{ab}\cdot\mathbf{ab}) - \mathbf{ab}\,(\mathbf{ab}\cdot\mathbf{ao})$。整个算法一屏就能写完：

```python
import numpy as np

def support(P, d):
    return P[np.argmax(P @ d)]

def support_md(A, B, d):                 # support point of A - B
    return support(A, d) - support(B, -d)

def cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]

def triple(a, b, c):                     # (a x b) x c = b (a.c) - a (b.c)
    return b * np.dot(a, c) - a * np.dot(b, c)

def do_simplex(s):
    """Keep the feature closest to the origin. Returns (contains_origin, simplex, new_direction)."""
    if len(s) == 2:
        b, a = s                         # a is the newest point
        ab, ao = b - a, -a
        if np.dot(ab, ao) > 0:
            d = triple(ab, ao, ab)       # normal of ab towards the origin
            if np.dot(d, d) < 1e-20:     # origin lies on the segment
                return True, [b, a], None
            return False, [b, a], d
        return False, [a], ao
    c, b, a = s
    ab, ac, ao = b - a, c - a, -a
    if abs(cross2(ab, ac)) < 1e-12:      # degenerate triangle
        return do_simplex([b, a])
    ab_perp = triple(ac, ab, ab)         # normal of ab, away from c
    ac_perp = triple(ab, ac, ac)         # normal of ac, away from b
    if np.dot(ab_perp, ao) > 0:
        return False, [b, a], ab_perp
    if np.dot(ac_perp, ao) > 0:
        return False, [c, a], ac_perp
    return True, s, None                 # origin inside the triangle

def gjk(A, B, max_iter=32):
    d = A.mean(0) - B.mean(0)
    if np.dot(d, d) < 1e-20:
        d = np.array([1.0, 0.0])
    simplex = [support_md(A, B, d)]
    d = -simplex[0]
    for _ in range(max_iter):
        if np.dot(d, d) < 1e-20:
            return True, simplex
        p = support_md(A, B, d)
        if np.dot(p, d) <= 0:            # p did not pass the origin: separated
            return False, simplex
        hit, simplex, d = do_simplex(simplex + [p])
        if hit:
            return True, simplex
    return False, simplex

A = np.array([[0.0, 0.0], [3.0, 0.5], [3.5, 2.5], [1.0, 3.0]])
B = np.array([[2.5, 1.5], [5.0, 1.0], [4.0, 3.5]])
print(gjk(A, B)[0], gjk(A, B + [3.0, 0.0])[0])   # True (overlap), False (B moved right)
```

第二个测试把 $B$ 向右平移 3 个单位，它最左边的顶点到了 $x = 5.5$，超过 $A$ 最右边的点 $3.5$，所以两个答案都直接由几何决定。下图展示了重叠的那一对形状上单纯形的演化。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-gjk-simplex.svg" caption="在代码中的两个多边形上运行 GJK（由脚本计算）。左：世界空间中的 $A$（蓝）和 $B$（橙）。之后每个面板对应一次迭代，显示 $A\ominus B$（紫）和原点（黑点）：红色是当前单纯形，绿色是下一个搜索方向 $\mathbf{d}$。每个新支撑点都是 $A\ominus B$ 沿 $\mathbf{d}$ 最远的顶点；当三角形包围原点时循环停止。GJK 从不构造紫色多边形本身，只访问它需要的少数几个顶点。" %}

生产级 GJK（Bullet、Jolt、PhysX 以及 Box2D 的距离例程）在形状分离时还会返回**最近点**。它在略微膨胀（带一个圆角半径，即 **margin**）的形状上运行，这样静止接触就变成廉价的"间距小于 margin"查询，而不是深度穿透问题。

### EPA：多深？朝哪个方向？

GJK 报告碰撞后，我们还需要 $\mathbf{n}$ 和 $d$。穿透深度是原点到 $A\ominus B$ **边界**的距离，分开两个形状的最小平移是 $d\,\mathbf{n}$，其中 $d\,\mathbf{n}$ 就是边界上离原点最近的点。**扩展多胞形算法**（Expanding Polytope Algorithm, EPA，van den Bergen 2001）从 GJK 最后得到的、包含原点的单纯形出发，反复执行三步：

1. 找到离原点最近的多胞形边（三维中为面），其外法线为 $\mathbf{n}$、距离为 $d$；
2. 查询 $\mathbf{p} = s_{A\ominus B}(\mathbf{n})$；
3. 若 $\mathbf{p}\cdot\mathbf{n} - d < \varepsilon$，这条边就在 $A\ominus B$ 的边界上，算法结束；否则插入 $\mathbf{p}$（它把这条边一分为二），然后重复。

```python
def epa(A, B, simplex, tol=1e-9, max_iter=64):
    """Penetration normal n and depth: moving B by depth * n makes A and B touch."""
    poly = [np.asarray(p, float) for p in simplex]
    while len(poly) < 3:                 # origin on an edge: add a support point
        e = poly[-1] - poly[0] if len(poly) == 2 else np.array([1.0, 0.0])
        poly.append(support_md(A, B, np.array([-e[1], e[0]])))
    if cross2(poly[1] - poly[0], poly[2] - poly[0]) < 0:
        poly[1], poly[2] = poly[2], poly[1]          # counter-clockwise
    for _ in range(max_iter):
        best = None
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            e = b - a
            n = np.array([e[1], -e[0]]) / np.linalg.norm(e)   # outward normal (CCW)
            if best is None or np.dot(n, a) < best[0]:
                best = (np.dot(n, a), n, i)
        dist, n, i = best
        p = support_md(A, B, n)
        if np.dot(p, n) - dist < tol:
            return n, dist
        poly.insert(i + 1, p)
    return n, dist

hit, s = gjk(A, B)
n, depth = epa(A, B, s)
print(n, depth)   # -> [ 0.9701425  -0.24253563] 0.7276068751089989
```

用一个简单情形检查符号约定。若 $A$ 在左，$B$ 从右侧与它重叠，则 $A\ominus B$ 大部分位于 $x$ 负半轴，只在 $+x$ 一侧稍稍越过原点。EPA 返回 $\mathbf{n} = (+1, 0)$，把 $B$ 推动 $d\,\mathbf{n}$ 就是把它向右推出 $A$。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-epa.svg" caption="同一对形状上的 EPA（脚本输出）。第一个面板：初始多胞形就是 GJK 最后的三角形（红）。中间：最终多胞形，其最近的边位于 $A\ominus B$ 的边界上；从原点出发的绿色箭头是穿透向量 $d\,\mathbf{n}$。右：把 $B$（虚线为原位置）平移 $d\,\mathbf{n}$ 后，两个形状恰好接触。" %}

亲手试试：拖动形状，逐步执行 GJK。

{% include widget.liquid name="graphics-engine-gjk" height="420" caption="在世界视图中用鼠标或手指拖动 $A$ 或 $B$。第二个视图显示 $A\ominus B$（紫）和原点 O。用单步按钮回放 GJK：红色是单纯形，绿色是搜索方向 $\mathbf{d}$。形状重叠时，最后一步还会显示 EPA 的多胞形（红色虚线）、穿透向量，以及世界视图中被推出 $d\,\mathbf{n}$ 后的 $B$（虚线）。“换 B”切换 $B$ 的形状。观察：形状开始接触的那一刻，原点恰好穿过 $A\ominus B$ 的边界。" %}

GJK 与 EPA 快速且通用，但 EPA 在三维中数值上比较脆弱：必须保持多胞形为凸，近乎共面的面会带来麻烦。因此引擎常对盒子和凸包使用 SAT，并通过裁剪面得到多个接触点。

## 4. 接触流形与热启动

一个放在地面上的盒子是沿一个面接触的，而不是一个点；只有一个接触点的话它会摇晃。因此细测阶段构建**接触流形**：三维中最多 4 个点（二维中 2 个），共享一个法线 $\mathbf{n}$，每个点有自己的深度 $d_i$。对两个盒子，标准做法是取与 $\mathbf{n}$ 最一致的**参考面**（reference face），把另一个盒子的**入射面**（incident face）用参考面的侧平面裁剪（Sutherland–Hodgman 裁剪），并丢弃位于参考面上方的点。曲面形状每帧只有一个接触点，因此使用**持久流形**（persistent manifold）：只要以前帧的点仍然有效，引擎就保留它们。

每个接触点带有一个**特征 ID**（例如"盒 A 的顶点 2 对盒 B 的面 0"）。如果下一帧存在相同的特征对，求解器就从上一帧的冲量出发：这就是**热启动**（warm starting）。对于静止的堆叠，冲量帧与帧之间几乎不变，所以从上次的答案出发，少量迭代就能和大量冷启动迭代一样好。

## 5. 约束求解器

### 把接触写成速度约束

对于法线为 $\mathbf{n}$ 的接触点，间隙 $C \ge 0$ 必须保持非负。它的变化率对堆叠起来的速度 $\mathbf{u} = (\mathbf{v}_A, \boldsymbol{\omega}_A, \mathbf{v}_B, \boldsymbol{\omega}_B)$ 是线性的：

$$
\dot C = \mathbf{J}\mathbf{u}, \qquad \mathbf{J} = \big(-\mathbf{n}^\top,\ -(\mathbf{r}_A\times\mathbf{n})^\top,\ \mathbf{n}^\top,\ (\mathbf{r}_B\times\mathbf{n})^\top\big),
$$

其中 $\mathbf{r}_A, \mathbf{r}_B$ 是从各自质心指向接触点的向量。接触只能推、不能拉，所以其冲量 $\lambda$ 满足**互补**（complementarity）条件

$$
\lambda \ge 0, \qquad \mathbf{J}\mathbf{u}^+ + b \ge 0, \qquad \lambda\,(\mathbf{J}\mathbf{u}^+ + b) = 0,
$$

其中 $\mathbf{u}^+$ 是施加冲量后的速度，$b$ 是偏置项。用文字说：要么物体分离、冲量为零，要么保持接触、冲量为正。把所有接触放在一起就得到一个**线性互补问题**（linear complementarity problem, LCP）。摩擦为每个接触增加两个切向行，满足 $\lvert\lambda_t\rvert \le \mu\lambda_n$（库仑摩擦锥的盒形近似）。

### 顺序冲量 = 投影 Gauss–Seidel（PGS）

一次处理一个约束就够了。施加冲量 $\Delta\lambda$ 会让速度改变 $\mathbf{M}^{-1}\mathbf{J}^\top\Delta\lambda$。要求 $\mathbf{J}\mathbf{u}^+ + b = 0$，得到

$$
\Delta\lambda = -\frac{\mathbf{J}\mathbf{u} + b}{\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^\top} = -m_{\text{eff}}\,(\mathbf{J}\mathbf{u} + b), \qquad m_{\text{eff}} = \big(\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^\top\big)^{-1}.
$$

然后对**累积**冲量而不是增量做截断：$\lambda \leftarrow \max(0, \lambda + \Delta\lambda)$，只施加实际发生的变化。对所有约束反复扫描几遍，就是在 LCP 上做**投影 Gauss–Seidel**（projected Gauss–Seidel）。Catto 在 GDC 2005 的演讲以**顺序冲量**（sequential impulses）之名使它流行开来。偏置 $b = \tfrac{\beta}{h}\min(0, C)$ 称为 **Baumgarte 稳定化**，$\beta \approx 0.1$ 到 $0.2$，它把相互穿透的物体推开。

取一个质量 $m = 1$ kg 的盒子静止在地面上，$h = 1/60$ 秒，没有穿透。重力使 $v = -9.81/60 \approx -0.1635$ m/s。此时 $\mathbf{J} = (1)$、$m_{\text{eff}} = 1$，$\Delta\lambda = -(-0.1635) = 0.1635$ N·s，恰好是 $m g h$：地面在这一步中提供了重量。一个盒子一次迭代就收敛，一摞盒子却不行。

### 箱子堆叠实验

下面是 $n$ 个高度为 1 的盒子组成的一维堆叠的求解器，接触 $k$ 连接盒子 $k-1$（或地面）与盒子 $k$。后面两张图就来自这个玩具实验：

```python
import numpy as np

def stack(n=10, top_mass=10.0, iters=10, substeps=1, warm=False, frames=120, dt=1/60, beta=0.2):
    m = np.ones(n); m[-1] = top_mass; w = 1 / m          # inverse masses
    y = np.arange(n) + 0.5; v = np.zeros(n); lam = np.zeros(n)
    h = dt / substeps
    for _ in range(frames * substeps):
        v -= 9.81 * h                                     # integrate gravity
        gap = np.concatenate([[y[0] - 0.5], np.diff(y) - 1.0])
        if warm:                                          # re-apply last impulses
            v += w * lam; v[:-1] -= w[:-1] * lam[1:]
        else:
            lam[:] = 0
        for _ in range(iters):                            # projected Gauss-Seidel
            for k in range(n):
                jv = v[k] - (v[k - 1] if k else 0.0)      # relative normal velocity
                keff = w[k] + (w[k - 1] if k else 0.0)    # J M^-1 J^T
                dl = -(jv + beta / h * min(0.0, gap[k])) / keff
                new = max(0.0, lam[k] + dl)               # clamp the accumulated impulse
                dl, lam[k] = new - lam[k], new
                v[k] += w[k] * dl
                if k: v[k - 1] -= w[k - 1] * dl
        y = y + h * v                                     # integrate positions
    gap = np.concatenate([[y[0] - 0.5], np.diff(y) - 1.0])
    return max(0.0, -gap.min())                           # worst penetration (m)

for kw in [dict(iters=10), dict(iters=10, warm=True), dict(iters=1, substeps=10, warm=True)]:
    print(kw, f"{stack(**kw) * 1000:.3f} mm")
# -> {'iters': 10} 22.307 mm
#    {'iters': 10, 'warm': True} 0.000 mm
#    {'iters': 1, 'substeps': 10, 'warm': True} 0.000 mm
```

为什么堆叠很难？Gauss–Seidel 每扫描一遍只把信息传递一个接触。顶部盒子的重量必须穿过下面的每一个接触才能到达地面，所以 $n$ 个盒子的堆叠大约需要 $n$ 遍扫描；质量不同时还要多得多。重盒子压在轻盒子上时，有效质量之比让每一遍扫描只能传递所需修正的一小部分。剩下的部分表现为下沉，然后 Baumgarte 再把它推回去。下图对此做了测量。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-stack-solvers.svg" caption="10 个盒子的玩具堆叠，所有求解器都使用相同的代价：每个 1/60 秒的帧扫描约束 10 遍（脚本输出）。左：顶部盒子重 10 倍时，2 秒内的最大穿透。右：静止时的穿透（最后 0.5 秒的平均值），质量比分别为 1:1、1:10、1:100（对数坐标）。比较普通 PGS（红）、加热启动（橙）、子步（蓝，每个子步扫描一遍，类似 TGS 和 Box2D 的 soft step）与 XPBD（紫）：热启动和子步是引擎对付信息传播缓慢的两种工具。在这次运行中，普通 PGS 留下 10、22 和 142 mm 的穿透；热启动和子步都收敛到零（标为 0 的柱）；XPBD 直接修正位置，但每个子步只扫描一遍，留下 0.25 到 2.6 mm。" %}

### TGS、soft step 与 XPBD：又是小步长

现代求解器以不同方式花费同样的预算。它们不再做一步加 $N$ 次迭代，而是做 $N$ 个大小为 $h = dt/N$ 的**子步**（substep），每个子步一次（或几次）迭代，并在每个子步用最新位置重新计算间隙 $C$。PhysX 称之为 **Temporal Gauss–Seidel**（TGS），其文档说明 TGS 在大质量比下更好，每次迭代的开销略高于 PGS。Box2D v3 的求解器叫 **soft step**，它用**软约束**（soft constraint）做同样的事。小步长的 XPBD（[图形学第 07 篇]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})）则是同一思想的位置层面版本。Erin Catto 的博客文章 *Solver2D*（2024）在同一组测试场景上比较了八种这样的求解器（PGS、各种 TGS 变体、soft step、XPBD 等），是这个话题最好的实践读物。

**软约束**把刚性约束替换为一个隐式弹簧-阻尼器，其固有频率为 $\omega = 2\pi f$，阻尼比为 $\zeta$，因此它的行为与步长和迭代次数无关。对有效质量 $m$，弹簧参数写成 $k = m\omega^2$、$c = 2m\zeta\omega$。在一步 $h$ 上对它做隐式积分，即冲量使用步末的间隙 $C + h\,\mathbf{J}\mathbf{u}^+$ 和步末速度 $\mathbf{J}\mathbf{u}^+$，其中 $\mathbf{J}\mathbf{u}^+ = \mathbf{J}\mathbf{u} + \lambda/m$：

$$
\lambda = -h\Big(k\,(C + h\,\mathbf{J}\mathbf{u}^+) + c\,\mathbf{J}\mathbf{u}^+\Big).
$$

对 $\lambda$ 求解，经过几行代数得到

$$
\lambda = -m\,\underbrace{\frac{a}{1+a}}_{\text{mass scale}}\Big(\mathbf{J}\mathbf{u} + \underbrace{\frac{\omega}{2\zeta + h\omega}}_{\text{bias rate}}\, C\Big), \qquad a = h\omega\,(2\zeta + h\omega).
$$

与 PGS 对比：偏置率（bias rate）取代了随意选定的 $\beta/h$，小于 1 的质量缩放（mass scale）让响应变软。Box2D v3 用以赫兹为单位的刚度和阻尼比计算这些系数，所以接触略微有点软，但在任何步长下都表现良好。把频率提高到子步频率的一定比例，约束实际上就是刚性的。

下图在每帧扫描次数相同、且不使用热启动的条件下，单独考察子步的效果。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-substeps-vs-iterations.svg" caption="相同预算，不同分配（脚本输出，无热启动，顶部盒子重 10 倍）。左：静止时的穿透随每帧约束扫描次数 $N$ 的变化，预算要么用作一步 $N$ 次迭代（红），要么用作 $N$ 个子步、每步一次迭代（蓝）。右：$N=8$ 时 2 秒后的两个堆叠；虚线标出顶部盒子精确的静止高度。" %}

{% include widget.liquid name="graphics-engine-stack" height="600" caption="自己动手试试。这个小部件以每秒 60 帧实时运行与上面两张图相同的玩具堆叠。选择求解器，调整盒子数、顶部盒子的质量比和每帧约束扫描次数 $N$，观察右侧的穿透曲线（对数坐标）。在堆叠上向下拖动（鼠标或手指）可以按压顶部盒子。先用默认值（普通 PGS、10 个盒子、1:10、$N=10$）：最差的接触重叠约 22 mm；切换到热启动或子步，穿透就会收敛到零。然后把 $N$ 设为 1，比较 PGS 与 XPBD，或把质量比提高到 1:100。这里能看到玩具模型的一个简化：即使出现小间隙，接触仍保持有效，所以热启动的堆叠可能停在比静止高度*高*几厘米的位置。真实引擎用推测接触（speculative contact）避免这一点：只有当间隙会在本步内闭合时才施加推力。" %}

### 这一步的其余部分

- **岛与休眠。** 由接触或关节连在一起的物体构成一个**岛**（island），用并查集在约束图上求得。当岛中每个物体的速度都在阈值以下保持一段时间（约 0.5 秒）后，整个岛进入休眠，在被触碰之前不再消耗计算。岛也是多线程的天然单位。
- **连续碰撞检测（CCD）。** 每步移动 1 米的子弹会穿过 10 厘米厚的墙，这叫**隧穿**（tunneling）。引擎使用**推测接触**（speculative contacts）：如果间隙小于本步移动的距离，就提前加入接触。它们还沿运动轨迹扫掠形状，用保守推进（conservative advancement）求出**碰撞时间**（time of impact, TOI），再对快速物体做子步。Box2D v3 对"子弹"物体同时使用推测接触和 TOI。
- **确定性。** 锁步多人游戏和回放需要逐位一致的结果。这要求固定 $dt$、固定的约束顺序（按物体 ID 排序，而不是按指针或线程完成顺序）、确定性的并行归约，并且在不同编译器之间小心处理融合乘加（FMA）和超越函数。Box2D v3 和 Jolt 在文档所述条件下宣称支持跨平台确定性。

### 你会遇到的引擎

截至 2026 年 11 月（版本来自各项目的发布页面）：

| 引擎 | 语言 | 许可证 | 说明 |
| --- | --- | --- | --- |
| **NVIDIA PhysX 5**（5.x） | C++ | BSD-3-Clause | PGS 与 TGS 求解器、GPU 刚体、降维坐标关节体、粒子/PBD；Omniverse 和 Isaac Sim 的物理引擎 |
| **Havok Physics** | C++ | 商业许可（自 2015 年起归微软所有） | 老牌 AAA 中间件，也提供 Unreal 插件 |
| **Jolt Physics**（5.6.0，2026 年 7 月） | C++17 | MIT | 多线程、确定性；用于《地平线 西之绝境》和《死亡搁浅 2》；自 Godot 4.4 起作为可选项内置 |
| **Chaos** | C++ | Unreal Engine 的一部分（Epic EULA） | Unreal Engine 5 的默认物理：刚体、破坏、布料、载具、网络物理 |
| **Box2D v3**（3.2.0，2026 年 10 月） | C17 | MIT | 2D；soft step 求解器、SIMD、多线程、跨平台确定性 |
| **Rapier**（0.36，2026 年 10 月） | Rust | Apache-2.0 | 2D 与 3D；可原生运行，也可通过 WebAssembly 在浏览器中运行 |

[第 04 篇]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})介绍了 Unreal、Unity 和 Godot 如何把这些引擎暴露给玩法代码。

## 6. 关节与关节体

**关节**（joint）是两个刚体之间的约束。铰链移除 6 个相对自由度中的 5 个；球关节移除 3 个；滑动关节同样移除 5 个，但允许平移。游戏引擎对待关节和对待接触完全一样：在 $\mathbf{J}$ 中增加几行，用同一个 PGS/TGS 循环求解。这就是**最大坐标**（maximal coordinates）：每个刚体保留 6 个自由度，由约束努力把它们连在一起。

机器人是长链：7 自由度机械臂、30 多个关节的人形机器人、20 个自由度的手。它们常常有很大的质量比，比如沉重的基座与轻巧的手指，或者轻的连杆承载重的负载。在最大坐标下，每个关节误差都必须由迭代求解器消除，残余误差表现为**关节漂移**：连杆明显分开，或链条在负载下被拉长。

**降维**（广义）**坐标**（reduced / generalized coordinates）从构造上消除了这个问题。状态就是关节角向量 $\mathbf{q}$（加上基座位姿），所以关节不可能散开。运动方程变为

$$
\mathbf{M}(\mathbf{q})\,\ddot{\mathbf{q}} + \mathbf{c}(\mathbf{q},\dot{\mathbf{q}}) = \boldsymbol{\tau} + \mathbf{J}_c^\top\boldsymbol{\lambda}_c,
$$

其中质量矩阵依赖于构型，$\mathbf{M}(\mathbf{q}) = \sum_i m_i\,\mathbf{J}_i^\top\mathbf{J}_i$（再加上转动项）；$\mathbf{c}$ 为科里奥利项与重力项，$\boldsymbol{\tau}$ 为关节力矩，$\boldsymbol{\lambda}_c$ 为接触冲量。**Featherstone** 的关节体算法（articulated-body algorithm, ABA）对 $n$ 个连杆组成的树以 $O(n)$ 计算 $\ddot{\mathbf{q}}$，无需构造 $\mathbf{M}$。复合刚体算法（CRBA）以 $O(n^2)$ 构造 $\mathbf{M}$，递归牛顿-欧拉算法（RNEA）计算逆动力学。控制器也需要这些量：质量矩阵、重力力矩和雅可比矩阵正是机器人控制器的工作对象。

下图在一个连杆轻、末端质量重的 4 连杆摆上运行两种表述。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-articulated-chain.svg" caption="4 连杆链（连杆质量 1、1、1，末端 50 kg），从与竖直方向成 69° 的伸直状态释放。紫色圆点：降维坐标（关节角，RK4，连杆长度精确）。橙色方块：最大坐标（质点加距离约束，零柔度 XPBD，每帧一步、一次迭代），时刻相同。右：最大坐标链在每步 1、4、32 次迭代下的最大相对连杆长度误差。降维链的误差从构造上就是零，而最大坐标链需要很多次迭代才能接近它：3 秒内的最大误差在 1 次迭代时为 31%，4 次时为 7.8%，32 次时为 0.87%。" %}

这就是机器人模拟器与游戏引擎不同的原因。MuJoCo 和 Drake 在广义坐标下工作；PhysX 有单独的**降维坐标关节体**（reduced-coordinate articulation）类型，Isaac Sim 用它表示机器人；Unity 则以 `ArticulationBody` 的形式提供它。而游戏角色很少需要精确的关节：伸长 1% 的布娃娃（ragdoll）是看不出来的。机器人学习需要相反的取舍：精确的关节、准确的执行器与接触，以及计算 $\mathbf{M}(\mathbf{q})$ 及其导数的能力。其背后的机器人运动学见[具身智能第 01 篇]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})。

## 7. 动画运行时

驱动角色运动的不只是物理。引擎的**动画系统**通常在一帧中先于物理运行：

- **状态机**（state machine）根据玩法状态（待机、行走、奔跑、跳跃）选择当前动画片段，包含带混合时间和条件的过渡。
- **混合树**（blend tree）按参数混合片段：按速度在行走和奔跑之间做一维混合；按速度方向做二维混合空间。关节旋转用四元数插值混合。
- **逆运动学**（inverse kinematics, IK）在混合后修正姿态：双骨骼 IK 让脚贴合不平的地面，look-at 控制头部朝向，FABRIK 或 CCD 处理更长的链。
- **运动匹配**（motion matching）用搜索取代手工搭建的图。每隔几帧，它在大型动作捕捉数据库中寻找姿态和未来轨迹与当前状态及玩家输入最匹配的帧，并混合过去。学习型变体用神经网络压缩数据库。
- **基于物理的动画**把两个世界结合起来：主动布娃娃用 PD 控制器跟随动画目标；强化学习得到的控制器（[具身智能第 02 篇]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})）驱动模拟角色。

其数学（样条、四元数混合、蒙皮、IK 求解器、运动匹配特征）见[图形学第 09 篇]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})。对引擎而言，重要的是一帧内的顺序：动画产生目标姿态，物理（布娃娃、布料、头发）做出反应，渲染器对最终姿态做蒙皮。

## 8. 把引擎当作机器人与 AI 的模拟器

机器人学习栈需要游戏引擎所拥有的东西（场景、资产、渲染、步进循环、工具），还需要游戏引擎并不优先考虑的三件事：

1. **精度与保真度**：精确的关节，执行器模型（电机、减速比、PD 增益、力矩限制），与真实机器人相符的摩擦和接触模型，以及带真实噪声的传感器（相机、深度、激光雷达、IMU、力/力矩）。
2. **吞吐量**：强化学习需要数十亿步，所以要在 GPU 上同时步进成千上万个世界副本，观测和动作都留在 GPU 张量中。
3. **可微性**：下一状态对当前状态、动作或参数的梯度，用于系统辨识、轨迹优化和学习。

截至 2026 年 11 月（版本来自发布页面和官方公告，许可证来自代码仓库）：

| 平台 | 基于 | 增加了什么 | 现状（2026 年 11 月） |
| --- | --- | --- | --- |
| **Isaac Sim**（NVIDIA） | Omniverse Kit、PhysX 5、RTX 渲染器、OpenUSD | 照片级 RTX 传感器（相机、激光雷达、雷达）、Replicator 合成数据、机器人导入器（URDF/MJCF 转 USD） | v6.2（2026 年 10 月）；源代码在 GitHub 上（仓库代码为 Apache-2.0；它依赖的 Omniverse Kit SDK 另有许可） |
| **Isaac Lab**（NVIDIA） | Isaac Sim；Newton 后端 | GPU 并行的强化学习与模仿学习环境、任务、传感器、sim-to-real 工作流 | v3.0（2026 年 10 月），BSD-3-Clause |
| **MuJoCo**（Google DeepMind） | 自有引擎 | 广义坐标、凸软接触、肌腱、执行器；在 CPU 上非常精确且快速 | 3.17（2026 年 10 月），Apache-2.0 |
| **MJX** | JAX 版 MuJoCo，或基于 MuJoCo Warp | 在加速器上批量、`jit` 编译的 MuJoCo；JAX 后端可微，Warp 后端不可微 | 随 MuJoCo 发布 |
| **MuJoCo Warp** | NVIDIA Warp | 能扩展到大量接触场景的 GPU 版 MuJoCo；由 Google DeepMind 与 NVIDIA 开发，也集成在 Newton 中 | 版本号与 MuJoCo 同步（3.17） |
| **MuJoCo Playground** | MJX | 带 sim-to-real 方案的运动与操作环境 | arXiv 2502.08844（2025） |
| **Newton** | NVIDIA Warp、OpenUSD | 开放、可扩展的 GPU 物理：多种求解器（包括 MuJoCo Warp）、可微组件、面向机器人 | 由 Disney Research、Google DeepMind 和 NVIDIA 贡献给 Linux 基金会（2025 年 9 月）；1.0 于 2026 年 3 月发布，v1.7 于 2026 年 10 月发布；Apache-2.0 |
| **Genesis** | 自有引擎（Python 前端） | 刚体、MPM、SPH、FEM、PBD 求解器集于一个框架，自带渲染器，GPU 并行 | v1.4（2026 年 10 月），Apache-2.0；没有论文，引用代码仓库 |
| **ManiSkill3** | SAPIEN（PhysX） | 面向操作基准的 GPU 并行仿真*与*渲染 | v3.0.1（2026 年 4 月）；arXiv 2410.00425 |
| **Habitat 3.0**（Meta） | Habitat-Sim（Bullet + 自有渲染器） | 快速的室内导航与重排、人形化身、人在回路 | ICLR 2024；habitat-sim 0.3.3（2026 年 2 月） |
| **CARLA** | Unreal Engine | 自动驾驶：城镇、交通、天气、传感器套件 | 0.10.0 迁移到 Unreal Engine 5.5（2024 年 12 月）；0.9.16（2025 年 9 月）是最新的基于 UE4 的版本 |
| **Unity ML-Agents** | Unity | 把任意 Unity 场景变成带 Python API 的强化学习环境 | Release 23（2025 年 9 月） |

它们从游戏引擎借来的东西：场景图和资产格式（USD、glTF、URDF 导入器）、实时渲染器（RTX、Unreal、Unity）、编辑器与工具，以及本文讲的步进流水线。它们各自增加的东西：

- **精度**：MuJoCo 的凸接触模型与广义坐标；Isaac 中的 PhysX 关节体；隐式执行器模型。
- **大规模并行**：Isaac Gym 的"张量留在 GPU 上"设计（Isaac Lab、ManiSkill3、MJX、MuJoCo Warp、Genesis、Newton）。一万个四足机器人世界并行运行，一个运动策略几分钟就能训练出来。**批维度**（batch dimension）是关键的设计变化：采用数据导向布局（[第 01 篇]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})），每个阶段用一个内核处理所有世界，而不是让对象各自步进。
- **可微性**：MJX（JAX）、Warp 的自动微分、Genesis 以及 Newton 的部分组件。接触让梯度充满噪声或不连续，这个问题与[可微渲染]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})中的可见性不连续相对应。

[具身智能第 03 篇]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})给出了 MuJoCo/MJX 的动手示例以及构建在这些平台上的基准。

## 9. OpenUSD：场景描述

机器人模拟器、数字孪生和电影管线都需要 glTF（一种交付格式，见[第 03 篇]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})）不提供的一样东西：许多人和工具编辑同一个大型场景，**而不互相覆盖**。**OpenUSD**（Universal Scene Description，通用场景描述，Pixar 于 2016 年开源）用层和组合解决了这个问题。

- **舞台**（stage）是组合后的场景，是一棵由 **prim** 组成的树（路径如 `/World/Robot/base_link`），每个 prim 带有**属性**（有类型的值，可以随时间采样）和**关系**。
- **层**（layer）是一个文件（`.usda` 文本、`.usdc` 二进制或 `.usdz` 包），保存关于 prim 的**意见**（opinion）。层可以堆叠，较强层的意见胜出。灯光师的层和布景师的层是不同的文件，作为子层（sublayer）汇入同一个根层。较强层中非破坏性的 **over** 可以修改一个属性而不触碰资产本身。
- **组合弧**（composition arcs）把其他文件和备选项引入场景：**引用**（references，实例化一个资产文件）、**载荷**（payloads，可以不加载的引用，用于超大场景）、**变体集**（variant sets，可切换的备选项，例如夹爪类型或损坏/完好状态）、**继承**（inherits）与**特化**（specializes，类似类的共享）。它们按 **LIVRPS** 强度顺序解析：Local、Inherits、Variants、References、Payloads、Specializes。当前的术语表写作 LIVERPS，增加了 **relocates**。
- **模式**（schemas）赋予 prim 有类型的含义：`UsdGeom`（网格、变换）、`UsdShade`（材质）、`UsdLux`（灯光）以及 **`UsdPhysics`**（刚体、碰撞体、质量、关节、关节体、碰撞组）。引擎和模拟器会扩展它们，例如 PhysX 专用的模式。

```usda
#usda 1.0
(
    subLayers = [@./lighting.usda@, @./layout.usda@]
)

over "World"
{
    over "Robot" (
        prepend apiSchemas = ["PhysicsRigidBodyAPI", "PhysicsMassAPI"]
        variants = { string gripper = "parallel" }
    )
    {
        float physics:mass = 3.0
    }
}
```

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-usd-composition.svg" caption="一个 prim `/Robot` 的组合。层栈（上）从最强（会话层）到最弱排列。`layout.usda` 引用了资产 `robot.usd`，后者有自己的质量、一个变体集和一个载荷。解析后的 prim（右下）的 `physics:mass = 3.0` 来自根层的 `over`，它胜过被引用资产中的 2.0；颜色来自会话层。同一个 prim 内，各组合弧按 LIVRPS 顺序解析。" %}

机器人领域为什么采用它：一个 USD 舞台可以同时容纳来自 CAD 的工厂几何、用于 RTX 渲染的材质、用于仿真的物理属性、传感器定义以及合成数据所需的语义标签。每个团队编辑自己的层。NVIDIA 在 USD 之上构建了 Omniverse 和 Isaac Sim，Newton 也读取 USD。**OpenUSD 联盟**（Alliance for OpenUSD, AOUSD，2023 年由 Pixar、Adobe、Apple、Autodesk 和 NVIDIA 在 Linux 基金会下成立）于 2025 年 12 月发布了 **Core Specification 1.0**，这是对数据模型和组合的第一份规范性定义。OpenUSD 本身现在使用"年.月"版本号（2026 年 10 月为 v26.11）。

## 10. 合成数据与域随机化

引擎也是**数据工厂**：渲染器天然知道真值，因此可以在输出 RGB 的同时，输出深度、法线、分割、2D/3D 框、位姿和光流，标注完美，规模不限。问题在于**仿真到现实的差距**（sim-to-real gap）：渲染图像的统计特性与照片不同，在渲染图上训练的网络可能在照片上失败。从图形学角度看，差距有具体的来源：

- **材质**：手工设定的反照率和粗糙度，而不是测量得到的 BRDF；缺少磨损、灰尘、指纹和次表面散射。
- **光照**：一个太阳加一个环境项，而不是复杂的间接光、面光源和真实的 HDR 环境；缺少画面外物体投下的阴影。
- **相机与传感器**：没有镜头畸变、运动模糊、卷帘快门、噪声、自动曝光、白平衡和 JPEG 伪影；深度传感器在边缘和光亮表面没有缺失像素。
- **几何与内容**：太干净、不同物体太少、摆放不真实。

有两种策略，实践中两者结合使用。**照片级真实感**缩小差距：路径追踪的 RTX 渲染（[图形学第 05 篇]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})）、测量材质、扫描资产，以及真实场景的 3D 高斯泼溅采集（[神经渲染第 06 篇]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})）。**域随机化**（domain randomization；Tobin et al. 2017；Tremblay et al. 2018）反其道而行之：把纹理、颜色、灯光、相机位姿、干扰物体和噪声随机化到很宽的范围，使真实世界在网络看来"只是又一种变化"。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-domain-randomization.svg" caption="用一个极小的 NumPy 光线投射器（脚本中的 `render`）做域随机化：棋盘格地面上的一个球和一个盒子，带硬阴影。左上角加框的是标准场景。其余 11 张图随机化了相机环绕角、高度和视场角，物体大小和位置，所有反照率，棋盘格尺度，光照方向，太阳光与环境光强度，色调，曝光和高斯传感器噪声。在这样的图像上训练的检测器无法依赖任何一种颜色、光照或视角。" %}

随机化本身只是在每次渲染前对场景参数采样：

```python
import numpy as np

def random_scene(rng):
    return dict(
        camera_yaw=rng.uniform(-0.6, 0.6), camera_height=rng.uniform(1.0, 3.5), fov_deg=rng.uniform(40, 60),
        albedo_object=rng.uniform(0.05, 1.0, 3), checker_scale=rng.uniform(0.5, 4.0),
        light_dir=rng.normal(size=3) * [1, 0, 1] + [0, rng.uniform(0.3, 1.2), 0],   # keep the sun above the floor
        ambient=rng.uniform(0.05, 0.4), exposure=rng.uniform(0.7, 1.3), noise_sigma=rng.uniform(0.0, 0.06))

rng = np.random.default_rng(0)
for i in range(3):
    print({k: np.round(v, 2).tolist() for k, v in random_scene(rng).items()})
```

在 Isaac Sim 中，这就是 **Replicator**：随机化器挂在 USD prim 上（材质、位姿、灯光、相机参数），逐帧驱动，再由"writer"导出图像和标注。在物理方面，同样的思路随机化质量、摩擦、电机增益、延迟和外部推力，这就是**动力学随机化**（dynamics randomization），它是足式运动 sim-to-real 的主要工具。强化学习方面见[具身智能第 02 篇]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})，平台方面见[具身智能第 03 篇]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})。[下一篇]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})会介绍生成模型（Cosmos 式的"世界基础模型"）如何被用来让渲染数据看起来更真实，甚至取代渲染器。

## 动手试试

- 上面的 GJK 小部件：找到原点恰好穿过 $A\ominus B$ 边界的那一刻，并把 EPA 给出的深度和你看到的进行比较。
- [主页实验室]({{ '/' | relative_url }}#lab)的 **Cloth · XPBD** 标签页运行一个子步 XPBD 求解器，它是第 5 节中 TGS/soft step 求解器在位置层面的亲戚。
- 用 `top_mass=100` 运行 `stack` 函数，并以不同方式分配 10 次扫描，观察堆叠下沉。

## 代表性论文

| 论文 | 发表于 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Gilbert, Johnson & Keerthi, *A fast procedure for computing the distance between complex objects in three-dimensional space* | IEEE J. Robotics and Automation | 1988 | [DOI](https://doi.org/10.1109/56.2083) | GJK 算法 |
| van den Bergen, *Proximity Queries and Penetration Depth Computation on 3D Game Objects* | GDC | 2001 | — | 提出用 EPA 求穿透深度 |
| Catto, *Iterative Dynamics* | GDC | 2005 | [PDF](https://box2d.org/files/ErinCatto_IterativeDynamics_GDC2005.pdf) | 顺序冲量、累积截断、热启动 |
| Featherstone, *Rigid Body Dynamics Algorithms* | Springer（专著） | 2008 | [DOI](https://doi.org/10.1007/978-1-4899-7560-7) | 空间代数、ABA、CRBA、RNEA |
| Todorov, Erez & Tassa, *MuJoCo: A physics engine for model-based control* | IROS | 2012 | [DOI](https://doi.org/10.1109/IROS.2012.6386109) | 面向控制的广义坐标 + 凸接触 |
| Tobin et al., *Domain Randomization for Transferring Deep Neural Networks from Simulation to the Real World* | IROS | 2017 | [arXiv](https://arxiv.org/abs/1703.06907) | 面向 sim-to-real 的域随机化 |
| Dosovitskiy et al., *CARLA: An Open Urban Driving Simulator* | CoRL | 2017 | [arXiv](https://arxiv.org/abs/1711.03938) | 基于游戏引擎的驾驶模拟器 |
| Tremblay et al., *Training Deep Networks with Synthetic Data: Bridging the Reality Gap by Domain Randomization* | CVPR Workshops | 2018 | [arXiv](https://arxiv.org/abs/1804.06516) | 用于检测的随机化合成数据 |
| Juliani et al., *Unity: A General Platform for Intelligent Agents* | arXiv | 2018 | [arXiv](https://arxiv.org/abs/1809.02627) | Unity ML-Agents |
| Macklin et al., *Small Steps in Physics Simulation* | SCA | 2019 | [DOI](https://doi.org/10.1145/3309486.3340247) | 子步胜过迭代 |
| Macklin et al., *Non-Smooth Newton Methods for Deformable Multi-Body Dynamics* | ACM TOG | 2019 | [arXiv](https://arxiv.org/abs/1907.04587) | 处理接触、摩擦和可变形体的牛顿型求解器 |
| Müller et al., *Detailed Rigid Body Simulation with Extended Position Based Dynamics* | Computer Graphics Forum | 2020 | [DOI](https://doi.org/10.1111/cgf.14105) | 用于刚体与关节的 XPBD |
| Puig et al., *Habitat 3.0: A Co-Habitat for Humans, Avatars and Robots* | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2310.13724) | 人形化身与人在回路 |
| Tao et al., *ManiSkill3: GPU Parallelized Robotics Simulation and Rendering for Generalizable Embodied AI* | RSS（演示轨道） | 2025 | [arXiv](https://arxiv.org/abs/2410.00425) | GPU 并行仿真与渲染 |
| Zakka et al., *MuJoCo Playground* | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2502.08844) | 带 sim-to-real 的 MJX 环境 |
| Mittal et al., *Isaac Lab: A GPU-Accelerated Simulation Framework for Multi-Modal Robot Learning* | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2511.04831) | Isaac Lab 的设计 |

## 学习资源

- Erin Catto 的 [Box2D 出版物](https://box2d.org/publications/)（关于约束、GJK、连续碰撞的 GDC 演讲），以及比较八种求解器的博客文章 [Solver2D](https://box2d.org/posts/2024/02/solver2d/)。
- Christer Ericson，*Real-Time Collision Detection*（Morgan Kaufmann，2004）：粗测阶段、SAT、GJK、BVH；标准教材。
- Gino van den Bergen，*Collision Detection in Interactive 3D Environments*（Morgan Kaufmann，2003）。
- Ian Millington，*Game Physics Engine Development*（第 2 版，2010）：从零构建完整引擎。
- Roy Featherstone 的专著（见上表）以及 MuJoCo 文档的 *Computation* 一章，讲广义坐标与接触。
- 值得阅读的代码：[Box2D v3](https://github.com/erincatto/box2d)（紧凑的 C 代码）、[Jolt Physics](https://github.com/jrouwe/JoltPhysics)、[PhysX](https://github.com/NVIDIA-Omniverse/PhysX) 及其[刚体文档](https://nvidia-omniverse.github.io/PhysX/physx/5.6.0/docs/RigidBodyDynamics.html)（PGS 与 TGS）、[Rapier](https://github.com/dimforge/rapier)、[MuJoCo](https://github.com/google-deepmind/mujoco)、[Newton](https://github.com/newton-physics/newton)、[Genesis](https://github.com/Genesis-Embodied-AI/Genesis)、[Isaac Lab](https://github.com/isaac-sim/IsaacLab)。
- [OpenUSD 文档](https://openusd.org/release/index.html)，尤其是术语表中关于组合弧的条目，以及 [UsdPhysics](https://openusd.org/release/api/usd_physics_page_front.html) 模式概览。

## 练习

1. 给 `sweep_and_prune` 加第二个轴：先在 $x$ 上扫描，再按 $y$ 过滤；比较所有盒子排成一条水平线时的候选对数量。应该在哪个轴上扫描？引擎如何自动选择（提示：盒子中心的方差）？
2. 为圆写一个支撑函数，把二维 GJK 扩展到圆，并测试圆与多边形。为什么 `gjk` 的其他部分完全不用改？
3. 给 `gjk` 加一个"最近点"模式：形状分离时，返回原点到最终单纯形的距离。用两个轴对齐正方形验证它与真实距离一致。
4. 在 `stack` 中用第 5 节的软约束系数替换 Baumgarte 偏置（取 $f$ = 30 Hz，$\zeta = 1$），与 PGS 版本比较穿透和抖动。
5. 写一个 USD 层，在不编辑资产文件的情况下覆盖 `/World/Props` 下所有碰撞体的摩擦。是哪种组合特性让这成为可能？

<details markdown="1"><summary>提示</summary>

1. 在 AABB 中心方差最大的轴上扫描；水平线在 $y$ 上几乎没有方差，所以在 $x$ 上扫描。2. GJK 只通过 `support` 接触形状；圆的支撑点是 $\mathbf{c} + r\,\mathbf{d}/\lVert\mathbf{d}\rVert$。3. 追踪当前单纯形上的最近点；当 $\mathbf{p}\cdot\mathbf{d}$ 对距离的改进不再超过 $\varepsilon$ 时停止。4. 对穿透的接触使用 $\lambda = -m_{\text{eff}}\,\tfrac{a}{1+a}(\mathbf{J}\mathbf{u} + \tfrac{\omega}{2\zeta+h\omega}C)$。5. 一个较强的层用 `over` prim（或让道具继承的类 prim）携带新的 `physics:dynamicFriction` 意见；LIVRPS 让本地意见胜出。

</details>

[下一篇]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})为本系列收尾：引擎中的神经网络、生成式内容、编辑器中的 LLM 智能体，以及用学习得到的世界模型取代本文整条流水线的神经"游戏引擎"。
