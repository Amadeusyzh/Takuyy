---
layout: post
title: "动画与角色：样条、旋转、蒙皮、IK、运动匹配与学习型运动"
date: 2026-10-27 09:09:00+0900
description: "关键帧样条与弧长、slerp 与 squad、骨架与正向运动学、线性混合蒙皮与对偶四元数蒙皮、混合形状、CCD 与 FABRIK、动作捕捉与 SMPL、运动匹配、用强化学习训练的物理角色，以及生成式运动，配有 NumPy 代码。"
categories: graphics
tags: [animation, splines, quaternions, skinning, inverse-kinematics, motion-matching, character-control]
series: graphics
series_order: 9
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[几何处理]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})给了我们网格，本文让它们动起来。角色动画驱动着游戏、电影、VR 虚拟形象和远程临场。同样的数学如今也驱动着人形机器人。关节层级和正向运动学就是[具身智能中的机器人运动学]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})。用[强化学习]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})训练的物理角色，在 2025-2026 年变成了运行在真实人形机器人上的动作跟踪器。而 [XR 中的虚拟形象]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})就是经过蒙皮和重定向的角色。

我们从关键帧一路走到学习型运动。样条在时间上插值数值，四元数插值旋转。骨架和蒙皮让网格变形，逆运动学放置手和脚。捕捉与重定向引入真实运动，而数据驱动、基于物理和生成式的方法则产生新的运动。

## 预备知识

- 矩阵、齐次变换和四元数，包括 slerp（[第 1 篇]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})）。
- 时间积分和类似 PD 的约束力（[第 7 篇]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})）。
- 最后几节需要：强化学习基础（[具身智能第 2 篇]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})）和扩散模型（[世界模型第 2 篇]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})）。

## 1. 关键帧与样条

动画师设置**关键帧（keyframes）**：在时刻 $t_i$ 的取值 $p_i$（位置、角度、混合形状权重）。计算机补出中间的帧，这叫**中间帧生成（in-betweening）**。线性插值是连续的，但有折角：速度在每个关键帧处跳变，运动看起来很机械。三次样条解决了这个问题。

### Hermite 曲线

三次 **Hermite** 段由两个端点值 $p_0, p_1$ 和两个端点切线（速度）$m_0, m_1$ 确定。对局部参数 $t \in [0,1]$，

$$
p(t) = h_{00}(t)\,p_0 + h_{10}(t)\,m_0 + h_{01}(t)\,p_1 + h_{11}(t)\,m_1,
$$

其中 **Hermite 基函数**为

$$
h_{00} = 2t^3 - 3t^2 + 1,\quad h_{10} = t^3 - 2t^2 + t,\quad h_{01} = -2t^3 + 3t^2,\quad h_{11} = t^3 - t^2 .
$$

你可以自己推导。写 $p(t) = a t^3 + b t^2 + c t + d$，施加 $p(0)=p_0$、$p(1)=p_1$、$p'(0)=m_0$、$p'(1)=m_1$。这给出关于 $a, b, c, d$ 的四个线性方程；解出后按 $p_0, p_1, m_0, m_1$ 分别合并同类项，它们各自的系数就是上面的四个基函数。**数值例子**（一维）：$p_0 = 0$，$p_1 = 1$。取平切线 $m_0 = m_1 = 0$，则 $p(0.5) = h_{01}(0.5) = -0.25 + 0.75 = 0.5$，这是一条缓入缓出曲线。若 $m_0 = 2$，则加上 $h_{10}(0.5)\cdot 2 = 0.125 \cdot 2 = 0.25$，得到 $p(0.5) = 0.75$：曲线出发更快，并超出直线。

### 样条家族

家族成员的区别在于如何选取切线，或者等价地说，使用哪组基函数：

- **Bézier**：控制点 $c_0..c_3$，$p(t) = \sum_k \binom{3}{k}(1-t)^{3-k}t^k c_k$。曲线经过 $c_0$ 和 $c_3$，切线为 $m_0 = 3(c_1 - c_0)$ 和 $m_1 = 3(c_3 - c_2)$。动画师直接拖动手柄 $c_1, c_2$；这就是每个 DCC 工具中的曲线编辑器。
- **Catmull–Rom**（Catmull 和 Rom 1974）：经过每个关键帧的 Hermite 样条，切线自动取为 $m_i = \frac{p_{i+1} - p_{i-1}}{2}$（关键帧等间距）。它是插值型的，且为 $C^1$。
- **均匀三次 B 样条**：第 $i$ 段用基函数 $b_0 = \frac{(1-t)^3}{6}$、$b_1 = \frac{3t^3 - 6t^2 + 4}{6}$、$b_2 = \frac{-3t^3 + 3t^2 + 3t + 1}{6}$、$b_3 = \frac{t^3}{6}$ 混合四个相邻控制点。它是 $C^2$ 的，所以加速度也连续，但不经过控制点。它正是[细分]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})所收敛到的曲线。

```python
import numpy as np

def hermite(p0, p1, m0, m1, t):
    t = t[:, None]
    h00, h10 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t
    h01, h11 = -2 * t**3 + 3 * t**2, t**3 - t**2
    return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1

def catmull_rom(P, n=40):
    Q = np.vstack([P[:1], P, P[-1:]])                       # duplicate the end points
    t = np.linspace(0, 1, n)
    return np.vstack([hermite(Q[i], Q[i + 1], (Q[i + 1] - Q[i - 1]) / 2, (Q[i + 2] - Q[i]) / 2, t)
                      for i in range(1, len(Q) - 2)])

keys = np.array([[0, 0], [1, 1.6], [2.2, 1.9], [3, 0.6], [4.2, 0.2], [5, 1.5], [6.2, 1.8]])
curve = catmull_rom(keys)
print(curve.shape, curve[0], curve[-1])                     # starts and ends on the keys
```

如下图所示，用同样的七个关键帧（即上面代码中的 `keys`）分别画出四种曲线，并给出两族基函数。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-spline-family.svg" caption="左：由同样七个点构造的四种插值。线性（虚线）有折角；Catmull–Rom（紫色）平滑地经过每个关键帧；两段三次 Bézier（橙色）只经过 $P_0$、$P_3$ 和 $P_6$，其余点作为手柄；均匀三次 B 样条（绿色）最光滑，但不经过任何控制点。中和右：基函数。B 样条基非负且和为 1，所以曲线位于控制点的凸包内；Hermite 切线基 $h_{10}$ 和 $h_{11}$ 在两端都为零。" %}

### 连续性：$C^1$ 与 $G^1$

两段相接处，**$C^k$ 连续**意味着关于参数的前 $k$ 阶导数一致。**几何连续（geometric continuity）$G^1$** 只要求切线*方向*一致：曲线没有可见的尖角，但速率可以跳变。对于物体要随时间沿着它运动的路径，这个区别很重要。$G^1$ 的接头画出来很光滑，却带来速度跳变，在运动中表现为明显的顿挫。用 Bézier 的语言：设第一段的控制点为 $c_0..c_3$，第二段的第一个控制点（手柄）为 $c_1'$，接点就是 $c_3$。$C^1$ 需要 $c_1' - c_3 = c_3 - c_2$（两个手柄共线*且*等长），而 $G^1$ 只需要共线。下图把 $c_1'$ 取成三种位置来对比。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-continuity.svg" caption="两段三次 Bézier 在 $(3,0)$ 相接，第二段的第一个手柄有三种选择。红色：不共线，曲线有尖角（$C^0$）。橙色：共线但更短（$G^1$）：曲线看起来光滑，但右边的速率图在 $u=1$ 处跳变。紫色：镜像手柄（$C^1$）：没有跳变。只有紫色版本能让物体无顿挫地运动。" %}

### 弧长重参数化

样条的参数 $t$ 不是距离。$t$ 的等步长对应曲线上不等的步长，所以以均匀 $t$ 运动的相机或角色会忽快忽慢。解决办法是**按弧长重参数化（arc-length reparameterization）**

$$
s(t) = \int_0^t \lVert p'(u)\rVert\, du,
$$

改为以均匀 $s$ 运动。这很少有闭式解，所以实践中我们在许多 $t$ 值处制表 $s$，再用插值反查（或者对 $s(t) - s^* = 0$ 用牛顿法，利用 $s'(t) = \lVert p'(t)\rVert$）：

```python
import numpy as np

def bezier(c, t):
    t = np.atleast_1d(t)[:, None]
    return (1 - t)**3 * c[0] + 3 * (1 - t)**2 * t * c[1] + 3 * (1 - t) * t**2 * c[2] + t**3 * c[3]

c = np.array([[0, 0], [0.1, 0.5], [2.2, 3.2], [4, 0]], float)       # short first handle: slow start
t_tab = np.linspace(0, 1, 2000)
pts = bezier(c, t_tab)
s_tab = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]   # s(t) table
L = s_tab[-1]

def point_at_distance(s):
    return bezier(c, np.interp(s, s_tab, t_tab))           # invert s(t) by interpolation

even = point_at_distance(np.linspace(0, L, 17))
gaps = np.linalg.norm(np.diff(even, axis=0), axis=1)
print(f"length {L:.3f}, gap spread {gaps.min():.3f}..{gaps.max():.3f}")   # length 5.304, gap spread 0.330..0.331
```

如下图所示，同一条曲线上，均匀 $t$ 取点与均匀弧长取点的间距差别很大。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-arc-length.svg" caption="左：均匀 $t$ 取的 17 个点（橙色圆）在起点附近挤在一起（第一个手柄很短，曲线在那里运动慢），在终点附近散开（那里运动快），间距从 0.13 到 0.63；按均匀弧长取的 17 个点（紫色方块，略微下移以便两行都可见）间距均匀（每段都是 0.33）。右：弧长表 $s(t)/L$；细线显示每个等间距的 $s$ 值如何映射回对应的 $t$。" %}

## 2. 随时间变化的旋转

[第 1 篇]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})介绍了单位四元数 $q$ 和 **slerp**（球面线性插值，spherical linear interpolation），即两个朝向之间沿大圆的匀速插值：

$$
\mathrm{slerp}(q_0, q_1; t) = q_0\,(q_0^{-1}q_1)^t = q_0 \exp\!\big(t \log(q_0^{-1} q_1)\big).
$$

这里，对于绕 $\hat{\mathbf{n}}$ 旋转 $2\phi$ 的单位四元数 $q = (\cos\phi, \sin\phi\,\hat{\mathbf{n}})$，**对数**是纯四元数 $\log q = (0, \phi\,\hat{\mathbf{n}})$，$\exp$ 是它的逆。始终选取使 $q_0\cdot q_1 \ge 0$ 的 $q_1$ 符号，因为 $q$ 和 $-q$ 表示同一个旋转，符号选错会绕远路。

**nlerp**（归一化线性插值）$\frac{(1-t)q_0 + t q_1}{\lVert\cdot\rVert}$ 走同一条大圆路径，但速度不恒定：中间更快。它便宜、满足交换律，而且很容易混合两个以上的旋转。所以蒙皮（第 4 节）和动画混合用它，而在需要匀速时用 slerp。

### 指数映射与角速度

对数把旋转变成向量：$\mathbf{r} = 2\log q$ 是**旋转向量**（轴乘以角度），即 $SO(3)$ 的**指数映射（exponential map）**。旋转向量是做微积分的好地方。运动朝向 $q(t)$ 在本体坐标系中的角速度 $\boldsymbol\omega$ 为

$$
(0, \boldsymbol\omega) = 2\,q^{-1}\dot q .
$$

对 slerp 而言，$q^{-1}\dot q = \log(q_0^{-1}q_1)$ 是常数，所以角速度恒定，其大小等于两个关键帧之间的总角度除以时间。它也让我们能从采样测量角速度：$\lVert\boldsymbol\omega\rVert \approx 2\lVert\log(q(t)^{-1}q(t+\Delta t))\rVert / \Delta t$。

### 分段 slerp 不是 $C^1$，squad 是

逐段地对多个关键帧 $q_0, q_1, q_2, \dots$ 做 slerp，相当于旋转版的线性插值。每段内角速度恒定，所以它在每个关键帧处的方向和大小都会突变。**Squad**（球面四边形插值，Shoemake 1985）是旋转版的三次 Hermite 或 Bézier 曲线。它像 de Casteljau 算法嵌套线性插值那样嵌套 slerp：

$$
\mathrm{squad}(q_i, q_{i+1}, s_i, s_{i+1}; h) = \mathrm{slerp}\big(\mathrm{slerp}(q_i, q_{i+1}; h),\ \mathrm{slerp}(s_i, s_{i+1}; h);\ 2h(1-h)\big),
$$

内部控制四元数的选取使每个关键帧处的切线匹配：

$$
s_i = q_i \exp\!\Big(-\frac{\log(q_i^{-1}q_{i+1}) + \log(q_i^{-1}q_{i-1})}{4}\Big).
$$

在 $h = 0$ 处求导可知，$q_i$ 处的切线是 $\frac12\big(\log(q_i^{-1}q_{i+1}) - \log(q_i^{-1}q_{i-1})\big)$，从两侧看都一样。这正是 Catmull–Rom 切线 $\frac{p_{i+1}-p_{i-1}}{2}$ 的四元数版本，对等间距关键帧成立。

```python
import numpy as np

def qmul(a, b):
    w1, x1, y1, z1 = a; w2, x2, y2, z2 = b
    return np.array([w1*w2 - x1*x2 - y1*y2 - z1*z2, w1*x2 + x1*w2 + y1*z2 - z1*y2,
                     w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2])
def qconj(q): return q * np.array([1, -1, -1, -1])
def qexp(v):
    a = np.linalg.norm(v)
    return np.array([1.0, 0, 0, 0]) if a < 1e-12 else np.r_[np.cos(a), np.sin(a) * v / a]
def qlog(q):
    s = np.linalg.norm(q[1:])
    return np.zeros(3) if s < 1e-12 else np.arctan2(s, q[0]) * q[1:] / s

def slerp(q0, q1, t):
    if q0 @ q1 < 0: q1 = -q1                                 # shortest arc
    return qmul(q0, qexp(t * qlog(qmul(qconj(q0), q1))))

def squad_controls(Q):                                       # keys must be sign-consistent
    S = [Q[0]]
    for i in range(1, len(Q) - 1):
        qi = qconj(Q[i])
        S.append(qmul(Q[i], qexp(-(qlog(qmul(qi, Q[i + 1])) + qlog(qmul(qi, Q[i - 1]))) / 4)))
    return S + [Q[-1]]

def squad(q0, q1, s0, s1, h):
    return slerp(slerp(q0, q1, h), slerp(s0, s1, h), 2 * h * (1 - h))

rv = [(0, 0, 0), (0.9, 0.2, 0), (0.7, 1.1, 0.3), (-0.2, 1.4, 0.6)]   # rotation vectors (rad)
Q = [qexp(0.5 * np.array(r, float)) for r in rv]                       # q = exp(r / 2)
S = squad_controls(Q)
print(squad(Q[1], Q[2], S[1], S[2], 0.0), Q[1])                       # squad hits the keys
```

下图在单位球上比较分段 slerp 与 squad，并画出两者的角速率。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-squad.svg" caption="六个关键朝向 $q_0..q_5$，每个朝向用它把 $z$ 轴转到的位置来表示（单位球上的黑点）。左：分段 slerp（橙色）沿大圆弧前进，在每个关键帧处有拐角；squad（紫色）平滑地经过相同的关键帧。右：从采样测得的角速率。slerp 的角速率在每个区间内恒定，并在每个关键帧处（虚线）跳变；这里大小的跳变很小，更大的断裂是旋转轴的突变，即左图中的拐角。squad 的角速率变化更大，但它是连续的，旋转轴也平滑地转动。" %}

在生产中，动画曲线常按通道存储。欧拉角分别插值，简单但可能出现万向节锁（gimbal lock）。四元数曲线通常被重采样到每一帧，引擎在相邻帧之间做 nlerp。

## 3. 骨架与正向运动学

**骨架（skeleton）**（绑定，rig）是一棵关节树。每个关节 $j$ 有父关节 $p(j)$、相对父关节的固定**偏移** $\mathbf{o}_j$（骨骼，在父坐标系中表示），以及动画化的**局部旋转** $\mathbf{R}_j$（根关节还有平移，有时还有缩放）。其局部变换为

$$
\mathbf{T}_j^{\text{local}} = \begin{pmatrix}\mathbf{R}_j & \mathbf{o}_j\\ \mathbf{0}^\top & 1\end{pmatrix},
$$

**正向运动学（forward kinematics, FK）**从根向下复合变换：

$$
\mathbf{G}_j = \mathbf{G}_{p(j)}\,\mathbf{T}_j^{\text{local}}, \qquad \mathbf{G}_{\text{root}} = \mathbf{T}_{\text{root}}^{\text{local}} .
$$

如果关节按父在子前的顺序存储，FK 就是一个循环。**绑定姿态（bind pose）**（静止姿态，常为 T 姿态或 A 姿态）是建模网格时的姿态；它的全局变换 $\mathbf{B}_j$ 被保存下来，其逆 $\mathbf{B}_j^{-1}$ 即**逆绑定矩阵（inverse bind matrices）**，把顶点从模型空间映射到关节 $j$ 的局部坐标系。这与[具身智能第 1 篇]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})中机械臂运动链的刚体变换链相同，唯一的区别是角色的树有分支。

```python
import numpy as np

def rot(axis, deg):
    a = np.deg2rad(deg); c, s = np.cos(a), np.sin(a)
    return {"x": np.array([[1, 0, 0], [0, c, -s], [0, s, c]]),
            "y": np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]),
            "z": np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[axis]

# name, parent, offset in the parent's frame (z up, metres); parents come first
skel = [("pelvis", -1, (0, 0, 1.0)), ("spine", 0, (0, 0, 0.22)), ("chest", 1, (0, 0, 0.25)),
        ("l_shoulder", 2, (0.18, 0, 0.18)), ("l_elbow", 3, (0.3, 0, 0)), ("l_wrist", 4, (0.27, 0, 0))]

def forward_kinematics(skel, local_rot):
    G = []
    for j, (_, parent, off) in enumerate(skel):
        T = np.eye(4); T[:3, :3] = local_rot[j]; T[:3, 3] = off
        G.append(T if parent < 0 else G[parent] @ T)
    return G

pose = [np.eye(3) for _ in skel]
pose[3] = rot("y", -90)                                     # raise the upper arm
pose[4] = rot("z", 90)                                      # bend the elbow
for (name, _, _), g in zip(skel, forward_kinematics(skel, pose)):
    print(f"{name:10s}", np.round(g[:3, 3], 3))
```

上臂绕 $y$ 旋转 $-90^\circ$（指向上方）、肘部绕 $z$ 弯曲 $90^\circ$ 后，腕部位于 $(0.18, 0.27, 1.95)$。肩部在 $(0.18, 0, 1.65)$，肘部在它上方 $0.3$ m，前臂指向 $+y$。可以手算验证：$\mathbf{R}_y(-90^\circ)$ 把 $+x$ 转到 $+z$，所以肘部在肩部正上方 $0.3$ m；$\mathbf{R}_y(-90^\circ)\mathbf{R}_z(90^\circ)$ 把 $+x$ 转到 $+y$，所以腕部在肘部的 $+y$ 方向 $0.27$ m 处。下图是完整的 17 关节骨架，分别处于绑定姿态和一个摆好的姿态。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-fk-skeleton.svg" caption="用 `forward_kinematics` 计算的 17 关节骨架。每个关节画出其坐标系的三个轴（$x$ 红、$y$ 绿、$z$ 蓝，即 $\mathbf{G}_j$ 的列）。左：绑定姿态，所有局部旋转都是单位阵，每个坐标系都与世界对齐。右：由十一个局部旋转设定的姿态。骨盆处的旋转会转动树中它下面的一切，而膝盖的旋转只移动小腿和脚。" %}

## 4. 蒙皮

网格（"皮肤"）必须跟随骨架。每个顶点 $\mathbf{v}$ 以**蒙皮权重（skin weights）** $w_{j} \ge 0$、$\sum_j w_j = 1$ 绑定到少数几个关节上。权重由美术绘制，或由工具计算，例如基于热扩散或有界双调和权重。

### 线性混合蒙皮

**线性混合蒙皮（linear blend skinning, LBS）**，也叫骨架子空间变形（skeletal subspace deformation, SSD；早期形式见 Magnenat-Thalmann 等 1988），让顶点随每个关节做刚体变换，再对结果取平均：

$$
\mathbf{v}' = \sum_j w_j\, \mathbf{M}_j\,\mathbf{v}, \qquad \mathbf{M}_j = \mathbf{G}_j\,\mathbf{B}_j^{-1}.
$$

$\mathbf{M}_j$ 是**蒙皮矩阵**：先撤销绑定姿态，再施加当前姿态。每个影响关节只需一次矩阵-向量乘法，所以它很便宜，也很适合顶点着色器。大多数实时角色都用它。

```python
import numpy as np

def skin_lbs(V, W, Ms):
    """V: (n,3) rest vertices, W: (n,k) weights, Ms: k skinning matrices (4x4)."""
    Vh = np.c_[V, np.ones(len(V))]
    return sum(W[:, j:j + 1] * (Vh @ Ms[j].T)[:, :3] for j in range(len(Ms)))
```

### 糖纸（candy-wrapper）伪影

对矩阵取平均并不等于对旋转取平均。扭转前臂：骨骼 0 不动，骨骼 1 绕肢体轴 $x$ 旋转 $\theta$。半径为 $r$、权重为 $w_0, w_1$ 的顶点变为

$$
\mathbf{v}' = w_0 \begin{pmatrix}x\\ y\\ z\end{pmatrix} + w_1\begin{pmatrix}x\\ y\cos\theta - z\sin\theta\\ y\sin\theta + z\cos\theta\end{pmatrix}.
$$

在截面平面内用复数记号，这就是 $r\,(w_0 + w_1 e^{i\theta})$，所以新半径为

$$
r' = r\sqrt{w_0^2 + w_1^2 + 2 w_0 w_1 \cos\theta} .
$$

取 $w_0 = w_1 = \frac12$：$\theta = 90^\circ$ 时 $r' = 0.71\,r$，$\theta = 180^\circ$ 时 $r' = 0$。肢体缩成一个点，就像糖纸被拧紧的一端。弯曲也会在肘部和膝盖内侧造成同样的体积损失。原因在于旋转矩阵的加权平均不是旋转：它包含缩放。

### 对偶四元数蒙皮

Kavan 等（2008）改为混合**单位对偶四元数（dual quaternions）**。对偶四元数 $\hat q = q_r + \varepsilon q_d$（$\varepsilon^2 = 0$）在满足下式时表示一个刚体运动（旋转 $q_r$，平移 $\mathbf{t}$）：

$$
q_d = \tfrac12\,(0, \mathbf{t})\,q_r, \qquad \mathbf{t} = 2\,\big(q_d\, q_r^{*}\big)_{\text{vec}} .
$$

**对偶四元数蒙皮（dual quaternion skinning, DQS）**线性混合对偶四元数（翻转符号使所有 $q_r$ 处于同一半球），再用实部归一化：

$$
\hat b = \sum_j w_j \hat q_j, \qquad \hat q = \frac{\hat b}{\lVert b_r\rVert}, \qquad \mathbf{v}' = q_r\,\mathbf{v}\,q_r^{*} + \mathbf{t}.
$$

结果始终是刚体变换，所以扭转的肢体能保持半径。它比 LBS 稍贵，并可能在弯曲关节附近产生轻微鼓起。Maya、Blender 等常用工具都同时提供 LBS 和 DQS（后者在 Blender 中叫保持体积）。

```python
import numpy as np   # uses qmul / qconj from Section 2

def rotate(q, v): return qmul(qmul(q, np.r_[0, v]), qconj(q))[1:]

def skin_dqs(V, W, qs, ts):
    """qs: unit quaternions (w,x,y,z), ts: translations, one per joint (skinning transforms)."""
    dq = [(q, 0.5 * qmul(np.r_[0, t], q)) for q, t in zip(qs, ts)]
    out = np.zeros_like(V)
    for i, v in enumerate(V):
        br, bd = np.zeros(4), np.zeros(4)
        for j, (qr, qd) in enumerate(dq):
            s = 1.0 if qr @ dq[0][0] >= 0 else -1.0        # same hemisphere
            br += W[i, j] * s * qr; bd += W[i, j] * s * qd
        n = np.linalg.norm(br)
        qr, qd = br / n, bd / n
        out[i] = rotate(qr, v) + 2 * qmul(qd, qconj(qr))[1:]
    return out
```

如下图所示，我们取一个绑定到两根骨骼的圆柱，把第二根骨骼扭转 $160^\circ$，比较 LBS 与 DQS。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-lbs-dqs.svg" caption="一个绑定到两根骨骼的圆柱（权重在 $0.6\le x\le 1.4$ 上平滑过渡），第二根骨骼绕肢体轴扭转 $160^\circ$。条纹显示扭转，颜色表示半径与静止半径之比。LBS（左）在中间收缩成细颈；DQS（中）保持半径。右：沿肢体的环半径，LBS 恰好落在公式 $\sqrt{w_0^2+w_1^2+2w_0w_1\cos\theta}$ 上；图例给出相对静止形状的包围体积。" %}

下面的小部件在二维中展示弯曲和扭转下的同一现象。

{% include widget.liquid name="graphics-skinning" height="460" caption="一个双骨骼肢体，关节附近用平滑权重蒙皮。拖动滑块（或肢体末端）来弯曲，或切换到扭转模式，观察一条绕自身轴扭转的扁平带子。切换 LBS / DQS / 两者：读数显示关节附近皮肤的最小宽度与静止宽度之比。LBS 随角度增大而变窄，扭转模式下在 180° 时塌缩；DQS 保持宽度。" %}

### 修正形状及其他

两种方法都不懂解剖学：肌肉会鼓起，皮肤会滑动，肘部会起褶。生产级绑定会加入**修正混合形状（corrective blendshapes）**：由关节角度触发的雕刻偏移。**姿态空间变形（pose space deformation）**（Lewis 等 2000）用径向基函数在姿态空间上插值这些修正，SMPL（第 7 节）则从扫描数据中学习它们。你还会遇到其他方法：delta mush（先平滑，再把静止姿态的细节加回去）、隐式蒙皮（考虑接触）、物理层（抖动、肌肉模拟、[第 7 篇]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})的布料），以及学习型神经蒙皮。

## 5. 混合形状与面部

面部骨骼很少但变形丰富，所以主要用**混合形状（blendshapes）**（变形目标，morph targets）来做动画。美术雕刻与中性脸 $\mathbf{b}_0$ 顶点数相同的目标网格 $\mathbf{b}_k$（微笑、眨眼、张嘴），面部为

$$
\mathbf{v}(\mathbf{w}) = \mathbf{b}_0 + \sum_k w_k\,(\mathbf{b}_k - \mathbf{b}_0) = \mathbf{b}_0 + \mathbf{D}\mathbf{w},
$$

这是关于权重 $w_k$（通常在 $[0,1]$ 内）的线性模型。这种**增量（delta）**形式让权重可以相加：微笑加张嘴就是一张微笑的张开的嘴。由于模型是线性的，从跟踪点求解权重（面部捕捉）只是一个带边界的小型最小二乘问题。真实的绑定还会加入**组合形状（combination shapes）**，即当两个目标互相干扰时、随 $w_i w_j$ 这类乘积开启的修正。Lewis 等（2014）的综述涵盖了理论与实践。

目标的标准词汇是**面部动作编码系统（Facial Action Coding System, FACS**，Ekman 和 Friesen 1978）。它把表情分解为基于解剖学的*动作单元*（AU12：嘴角上提，AU26：下颌下垂……）。生产级面部绑定围绕 FACS 形状组织。Apple ARKit 的面部跟踪以同样的思路提供大约五十个具名系数（`jawOpen`、`eyeBlinkLeft`、`mouthSmileLeft`……），它们已成为 VR 和直播中虚拟形象面部的事实交换格式。Epic 的 MetaHuman 是高端生产的例子：一套标准化的面部和身体绑定，由基于关节的控制加修正形状构成，而 MetaHuman Animator 则从演员的捕捉视频中求解绑定控制量。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-blendshapes.svg" caption="二维人脸上的增量混合形状，有两个目标：微笑（嘴角上扬，眼睛略眯）和张嘴（下唇和下巴下移）。从左到右：中性、各目标满权重、只是把两个偏移相加的混合 $(0.7, 0.6)$，以及 $w=1.5$ 的外推微笑，它说明了为什么绑定要限制权重范围。" %}

## 6. 角色逆运动学

动画师和游戏常常需要逆问题：把手放到*这里*，把脚踩在*那里*。[具身智能第 1 篇]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})推导了通用的基于雅可比的求解器（伪逆和阻尼最小二乘）；这里介绍在角色动画中占主导的三种方法。

### 解析双骨骼 IK

手臂或腿（上段骨骼 $l_1$、下段骨骼 $l_2$）伸向距根部 $d$ 的目标，构成一个三角形。**余弦定理**给出肘部或膝部的内角，

$$
\cos\gamma = \frac{l_1^2 + l_2^2 - d^2}{2 l_1 l_2}, \qquad \text{弯曲角} = \pi - \gamma,
$$

以及上段骨骼与目标方向的夹角，

$$
\cos\alpha = \frac{l_1^2 + d^2 - l_2^2}{2 l_1 d}.
$$

剩下的自由度，即三角形绕根–目标轴的旋转，由**极向量（pole vector）**（膝盖应指向哪里）确定。**数值例子**：$l_1 = l_2 = 1$，目标在 $(1, 1)$，所以 $d = \sqrt2$。则 $\cos\gamma = (1 + 1 - 2)/2 = 0$，$\gamma = 90^\circ$；$\cos\alpha = (1 + 2 - 1)/(2\sqrt2) = 0.707$，$\alpha = 45^\circ$。目标方向为 $45^\circ$，所以上段骨骼指向 $45^\circ - 45^\circ = 0^\circ$（沿 $x$），下段骨骼竖直向上：$(1,0) + (0,1) = (1,1)$。若 $d > l_1 + l_2$，就截断 $d$，肢体直指目标。

```python
import numpy as np

def two_bone_ik(target, l1, l2):
    """Planar two-bone IK (elbow bending counter-clockwise). Returns (shoulder, elbow) angles."""
    d = np.clip(np.linalg.norm(target), abs(l1 - l2) + 1e-9, l1 + l2 - 1e-9)
    gamma = np.arccos((l1**2 + l2**2 - d**2) / (2 * l1 * l2))
    alpha = np.arccos((l1**2 + d**2 - l2**2) / (2 * l1 * d))
    return np.arctan2(target[1], target[0]) - alpha, np.pi - gamma

a1, a2 = two_bone_ik(np.array([1.0, 1.0]), 1.0, 1.0)
print(np.degrees([a1, a2]))                                 # [ 0. 90.]
```

### CCD 与 FABRIK

对于更长的链（脊柱、尾巴、手指），迭代求解器比雅可比方法更简单，也不需要矩阵求逆。

**循环坐标下降（cyclic coordinate descent, CCD**；Wang 和 Chen 1991）从末端向根部依次访问关节。在每个关节，它旋转一个角度，使末端执行器转到指向目标的直线上。每一步对单个关节是最优的，收敛很快，但它倾向于先卷曲末端关节，没有关节限制时会产生不自然的姿态。

**FABRIK**（Forward And Backward Reaching IK；Aristidou 和 Lasenby 2011）在关节*位置*上工作。后向遍历把末端执行器放到目标上，然后向根部推进，把每个关节放在朝它原位置的直线上、距离为骨长处。前向遍历把根部钉回原位，再用同样方式走到末端。没有角度，没有三角函数，运动自然地分布在整条链上，约束和多个末端执行器也很容易加入。

```python
import numpy as np

def fabrik(P, lengths, target, iters=10):
    P = P.copy(); base = P[0].copy()
    for _ in range(iters):
        P[-1] = target                                       # backward pass
        for i in reversed(range(len(lengths))):
            d = P[i] - P[i + 1]
            P[i] = P[i + 1] + lengths[i] * d / np.linalg.norm(d)
        P[0] = base                                          # forward pass
        for i in range(len(lengths)):
            d = P[i + 1] - P[i]
            P[i + 1] = P[i] + lengths[i] * d / np.linalg.norm(d)
    return P

lengths = np.array([1.0, 0.8, 0.6, 0.4])
P0 = np.c_[np.r_[0, np.cumsum(lengths)], np.zeros(5)]      # straight chain along x
P = fabrik(P0, lengths, np.array([0.6, 1.9]))
print(np.linalg.norm(P[-1] - [0.6, 1.9]), np.linalg.norm(np.diff(P, axis=0), axis=1))
# 5.5e-10 [1.  0.8 0.6 0.4]: on target, bone lengths kept
```

下图让 CCD 和 FABRIK 从同一初始姿态出发，逐次迭代地伸向同一个目标。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-ik-ccd-fabrik.svg" caption="同一条四骨骼链（骨长 1、0.8、0.6、0.4）从同一初始姿态伸向红色星形，分别在 1、2、3 和 20 次迭代之后（灰色为初始姿态，颜色越深迭代越晚）。CCD（左）先甩动外侧关节；FABRIK（中）把运动分布到整条链上。右：两者每次迭代的末端误差（对数坐标）：FABRIK 第 1 次迭代后误差就小得多，约第 4 次迭代之后 CCD 下降更快。这里两种求解器都收敛；收敛快慢取决于链和目标。" %}

{% include widget.liquid name="graphics-ik-chain" height="440" caption="在图中同一条四骨骼链上运行的 CCD（紫色）和 FABRIK（橙色）。用鼠标或手指拖动红色目标。滑块设置从灰色静止姿态出发运行多少次迭代，淡色的链显示中间迭代。试试靠近根部的目标和位于可达圆边缘的目标，比较两种求解器如何弯曲链条，以及误差下降得有多快。" %}

**全身 IK（full-body IK）**把多个末端执行器（双手、双脚、头部的注视目标）与优先级、关节限制和平衡（质心位于支撑多边形上方）结合起来。游戏用它在不平地面上放脚、把手放到武器和门上，以及驱动 VR 虚拟形象。VR 是困难的情形：三个跟踪点（头显和两个手柄）必须生成一个合理的全身姿态，这是欠定的。越来越多地由学习到的先验来补出双腿。

## 7. 动作捕捉与重定向

全部手动设置关键帧代价高昂，所以大多数逼真的运动都是**捕捉**来的：

- **基于光学标记点**的系统（Vicon、OptiTrack）用许多红外相机三角化反光标记点。它们精度达毫米级，是摄影棚的标准，但需要场地，也需要清理遮挡和标记点互换。
- **惯性（IMU）动捕服**（例如 Xsens）对每个身体段上的陀螺仪和加速度计积分。它们在任何地方都能用，但全局位置会漂移。
- **无标记点**捕捉用学习到的姿态估计器从普通视频中估计身体。多视角方案现在已精确到足以用于制作预演，单目方法则支撑着第 9 节中 VideoMimic 式的机器人流水线。

原始标记点或关键点数据会被拟合到人体模型上。**SMPL**（Loper 等 2015）是视觉和学习领域的标准。它是一个蒙皮网格，其静止形状和关节位置依赖于形状参数 $\boldsymbol\beta$，姿态修正依赖于姿态 $\boldsymbol\theta$（24 个关节，轴角表示）：

$$
M(\boldsymbol\beta, \boldsymbol\theta) = \mathrm{LBS}\big(\bar{\mathbf{T}} + B_S(\boldsymbol\beta) + B_P(\boldsymbol\theta),\ J(\boldsymbol\beta),\ \boldsymbol\theta,\ \mathcal{W}\big).
$$

这里 $B_S$ 是从数千次扫描中学到的身体形状线性混合形状空间（又是第 5 节的公式），$B_P$ 是旋转矩阵的线性函数，用来修正 LBS 伪影（学习得到的第 4 节修正形状），$J$ 从变形后的网格回归关节位置，$\mathcal W$ 是蒙皮权重。一切都可微，这就是为什么 SMPL（及其带手部和面部的后继者 SMPL-X）是大多数人体姿态估计器和运动生成器的输出格式。

**重定向（retargeting）**把运动从一个骨架迁移到比例、关节数或静止姿态不同的另一个骨架上。基本做法：按名称或语义对应关节；把每个源旋转表示为相对源静止姿态的旋转，再相对目标静止姿态施加；按腿长比例缩放根平移；然后运行 IK 恢复因比例变化而被破坏的接触（脚踩地面、手握道具）。把人类运动重定向到**人形机器人**还要考虑关节限制、不同的关节轴和物理可行性。GMR（Araújo 等，arXiv 2025 年 10 月）表明重定向伪影会明显损害第 9 节中的强化学习动作跟踪器，并提出了一个更干净的通用重定向器。

## 8. 数据驱动的动画

给定一个大型动捕数据库，如何用手柄驱动游戏角色？

**运动图（motion graphs）**（Kovar、Gleicher 和 Pighin 2002）在数据库中寻找足够相似、可以混合过渡的帧，在那里加入过渡，并在所得图上搜索沿指定路线的路径。图必须离线构建，响应性受限于过渡的位置。

**运动匹配（motion matching）**（由育碧的 Simon Clavet 在 GDC 2016 上介绍，用于《荣耀战魂》（*For Honor*）及之后的许多游戏）抛弃了图。每隔几帧（比如每 0.1 秒），由当前姿态和期望的未来构造查询特征向量，并跳到特征最匹配的数据库帧：

$$
i^* = \arg\min_i \sum_k \Big(\frac{f_{i,k} - q_k}{\sigma_k}\Big)^2 .
$$

其中 $f_{i,k}$ 是数据库第 $i$ 帧的第 $k$ 个特征，$q_k$ 是查询的对应分量。特征通常是若干时间跨度（例如 0.33、0.67 和 1 秒，在角色局部坐标系中）的未来根位置和朝向、当前脚的位置和速度，以及髋部速度。它们按标准差 $\sigma_k$ 归一化，并由设计者加权。姿态随后切换到匹配的片段，**惯性化（inertialization）**通过在几帧内衰减新旧姿态之间的偏移来掩盖不连续。搜索加速（KD 树、包围盒、聚类）让这一切保持廉价。

```python
import numpy as np

def match(F, q, sigma, weights=None):
    """F: (N, d) database features, q: (d,) query. Returns best frame and all costs."""
    w = np.ones(F.shape[1]) if weights is None else weights
    cost = (w * ((F - q) / sigma) ** 2).sum(1)
    return int(np.argmin(cost)), cost
```

下图在一个合成数据库上运行这个搜索，看它如何为一个「边跑边左转」的查询选中帧。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-motion-matching.svg" caption="在一个合成的 50 秒运动数据库（随机转向、步行与跑步速度、30 fps）上做的玩具运动匹配搜索。特征：局部坐标系中 1/3、2/3 和 1 秒之后的根位置，加上当前速度。查询要求边跑边左转。左：数据库路径（灰色）、最佳匹配帧及其之后一秒的运动（紫色），以及放在该帧处的期望未来（橙色）：两者吻合（放大到该帧周围 12 米）。中：每一帧的代价，最小值已标出。右：所有特征向量投影到前两个主成分上，按代价着色，星形为查询，紧挨着最佳匹配（圆圈）。" %}

**学习型运动匹配（learned motion matching）**（Holden 等 2020）保留运动匹配的行为，但用小型神经网络替代大型数据库。*解压器（decompressor）*从特征加潜码重建姿态，*步进器（stepper）*在时间上推进它们，*投影器（projector）*替代最近邻搜索。内存占用从数百 MB 降到几 MB，这在主机上很重要。**相位函数神经网络（phase-functioned neural network, PFNN**，Holden 等 2017）是更早的神经控制器：一个权重是步态相位的循环样条函数的 MLP。它在标注了地形的运动数据上训练，直接把用户控制和地形高度映射到下一帧姿态。

## 9. 物理角色与通往人形机器人的桥梁

运动学方法可能产生违反物理的运动：脚滑、身体漂浮、被推时没有反应。**基于物理的角色（physics-based characters）**是模拟的刚体骨架，与[第 7 篇]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})相同。它们的关节由力矩驱动，通常来自跟踪目标角度的 **PD（比例-微分）控制器**：

$$
\boldsymbol\tau = k_p(\mathbf{q}_{\text{target}} - \mathbf{q}) + k_d(\dot{\mathbf{q}}_{\text{target}} - \dot{\mathbf{q}}).
$$

单靠 PD 跟踪效果很差。它需要误差才能产生力矩，所以重力让肢体下垂，快速运动会滞后。更硬的增益能减小误差，却让角色僵硬、模拟变刚。把参考运动自身的逆动力学力矩作为前馈项加入，可以消除大部分误差。不过完整角色是欠驱动的：没有电机推动根部，平衡只能通过接触获得。所以无法这样计算前馈，而这正是学习到的策略接手的工作。

```python
import numpy as np

def pd_step(q, dq, q_ref, dq_ref, kp, kd):
    return kp * (q_ref - q) + kd * (dq_ref - dq)            # joint torques

# inside the simulation loop (see the figure script for the two-link pendulum dynamics):
#   tau = pd_step(q, dq, q_ref(t), dq_ref(t), kp, kd) [+ inverse-dynamics feedforward]
#   ddq = solve(M(q), Q(tau) - c(q, dq) - g(q));  dq += dt * ddq;  q += dt * dq
```

下图用这个循环模拟一个双连杆摆，让它跟踪正弦参考，比较不同的增益 $k_p$ 和前馈。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-pd-tracking.svg" caption="一个模拟的双连杆摆（0.5 m 连杆末端各有 1 kg 质点，受重力作用）用关节 PD 控制跟踪正弦参考，增益取近似临界阻尼的 $k_d = 2\sqrt{0.3\,k_p}$。左：肘部角度。$k_p=20$ 时手臂下垂并严重滞后；$k_p=500$ 时跟得很紧。右：对数坐标下的跟踪误差。把参考运动的逆动力学力矩作为前馈加入（绿色，仅 $k_p=100$），误差比最硬的纯 PD 还小。" %}

**学习策略。** **DeepMimic**（Peng 等 2018）用强化学习（PPO）训练一个以 30 Hz 输出 PD 目标的神经策略。奖励针对模仿一个参考片段：

$$
\begin{aligned}
r ={}& w_p e^{-k_p\sum\lVert q - \hat q\rVert^2} + w_v e^{-k_v\sum\lVert\dot q - \dot{\hat q}\rVert^2}\\
&+ w_e e^{-k_e\sum\lVert p_e - \hat p_e\rVert^2} + w_c e^{-k_c\lVert c - \hat c\rVert^2}
\end{aligned}
$$

四项分别奖励与片段的关节旋转、关节速度、末端执行器位置和质心相一致。带帽的量是参考片段中的对应值，$w$ 是各项权重，$k$ 是指数中的尺度系数（这里的 $k_p$、$k_v$ 与上面 PD 控制器的增益无关）。让它奏效的两个技巧是：参考状态初始化（从片段的随机帧开始一个回合）和提前终止（角色摔倒就停止）。**AMP**（Peng 等 2021）用 GAN 式判别器替代手工设计的跟踪奖励，判别器区分角色的状态转移和运动数据集中的转移。这样就能把任务奖励（去那里）与"像数据一样运动"结合，而无需挑选片段。**ASE**（Peng 等 2022）用对抗和多样性目标预训练一个大型潜在技能空间，高层控制器只需选择潜变量。**PHC**（Luo 等 2023）是单个策略，能跟踪几乎整个 AMASS，能从摔倒中恢复，并能根据视频或 VR 输入驱动虚拟形象。**MaskedMimic**（Tessler 等 2024）把控制看作运动补全（inpainting）：一个通过蒸馏全身跟踪器训练出的策略，接受任意子集的约束（关节目标、VR 头部和双手、文本、物体目标）。后续工作包括 **PARC**（Xu 等，SIGGRAPH 2025），它迭代运动学运动生成器和物理跟踪器来扩充跑酷数据；以及 **MaskedManipulator**（Tessler 等，SIGGRAPH Asia 2025），它把 MaskedMimic 扩展到全身物体操作。

**通往人形机器人的桥梁（截至 2026 年 11 月）。** 同样的配方在 2024-2026 年移植到了真实硬件上：把人类运动重定向到机器人（第 7 节），在大规模并行模拟器（[具身智能第 3 篇]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})）中配合域随机化训练跟踪策略，再零样本部署。

- **H2O**（He 等，IROS 2024）和 **HumanPlus**（Fu 等，CoRL 2024）用它实现对人类操作员的实时遥操作和影子跟随。
- **ASAP**（He 等，RSS 2025）从真实运行数据中学习残差"增量动作"模型，以弥合敏捷技能的仿真到现实差距。
- **TWIST**（Ze 等，CoRL 2025）基于动捕做全身遥操作；**KungfuBot**（Xie 等，NeurIPS 2025）和 **GMT**（Chen 等，arXiv 2025 年 6 月）跟踪高动态和通用的运动。
- **VideoMimic**（Allshire 等，CoRL 2025）从手机视频中学习上楼梯、坐下等与环境相关的技能。
- **BeyondMimic**（Liao 等，arXiv 2025 年 8 月）把动作跟踪器与引导扩散策略结合。
- 规模是 2026 年的主题。**SONIC**（Luo 等，*Science Robotics* 2026）把跟踪控制器扩展到数千万参数和数百小时动捕数据。**SuperMimic**（Liao 等，已被 CoRL 2026 接收，arXiv 2026 年 10 月）通过一个学习到的可微世界模型训练跟踪器，并报告在单块 GPU 上几小时即可达到大算力强化学习基线的水平。

对图形学的启示：从骨架和重定向到 PD 跟踪和模仿奖励，角色动画技术栈如今已成为机器人学习的一部分。

## 10. 生成式运动

生成模型如今能根据文本、音乐、音频或稀疏约束合成运动。常用表示是 SMPL 式姿态序列，往往带有冗余特征（根速度、关节位置、旋转、脚部接触）。**HumanML3D**（Guo 等，CVPR 2022）是标准的文本到运动基准：AMASS 和 HumanAct12 的运动，每段配有若干文本描述。

- **MDM**，即人体运动扩散模型（Human Motion Diffusion Model，Tevet 等，ICLR 2023），是一个 Transformer [扩散模型]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})，它预测干净的运动 $\hat x_0$ 而非噪声。这样训练时就能对位置、速度和脚部接触施加几何损失。它还无需重新训练就能做补全（填补关键帧之间的帧，或根据上半身补出下半身），这又是中间帧生成，只不过是学习得到的。
- **MoMask**（Guo 等，CVPR 2024）用残差向量量化自编码器把运动离散为 token，再用掩码 Transformer 生成 token。它是当年很强的文本到运动模型。
- **MotionLCM**（Dai 等，ECCV 2024）把潜在扩散蒸馏为少步的一致性模型，实现实时、可控的生成。
- **MotionStreamer**（Xiao 等，ICCV 2025）在因果潜在空间中用基于扩散的自回归模型以在线流的方式生成运动。
- 扩大数据和模型规模。**Go to Zero**（Fan 等，arXiv 2025 年 7 月）构建了百万序列级的数据集用于零样本生成；**HY-Motion 1.0**（腾讯混元，arXiv 2025 年 12 月）把流匹配 Transformer 扩展到约十亿参数；NVIDIA 的 **Kimodo**（Rempe 等，arXiv 2026 年 3 月）在约 700 小时光学动捕数据上训练运动学扩散模型，并用文本、关键帧、路径点和路径来控制它。

物理与生成正在汇合。BeyondMimic 和 MaskedMimic 把生成模型放进基于物理的控制器中，PARC 则用物理跟踪器清理生成的运动。开放问题包括物理合理性、与场景和物体的接触、长时程一致性，以及评估：基于运动特征的 FID 式指标与动画师眼中的好坏只有松散的相关性。

## 动手试试

- 上面的蒙皮小部件：找出 LBS 宽度损失一半时的扭转角，并与等权重下的公式 $r'/r = \lvert\cos(\theta/2)\rvert$ 比较。
- 想通过拖动体验 IK，可以用[具身智能第 1 篇]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})的机械臂小部件，它求解的是第 6 节的雅可比版本。[首页实验室]({{ '/' | relative_url }}#lab)的布料运行的是[第 7 篇]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})的物理，物理角色正是建立在它之上。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Catmull & Rom, *A class of local interpolating splines* | Computer Aided Geometric Design (Academic Press) | 1974 | （书籍章节） | 自动切线的插值样条 |
| Shoemake, *Animating rotation with quaternion curves* | SIGGRAPH | 1985 | [DOI](https://doi.org/10.1145/325165.325242) | 用于动画的四元数、slerp 与 squad |
| Magnenat-Thalmann, Laperrière & Thalmann, *Joint-dependent local deformations for hand animation and object grasping* | Graphics Interface | 1988 | [DOI](https://doi.org/10.20380/GI1988.04) | 早期的骨架驱动皮肤变形 |
| Wang & Chen, *A combined optimization method for solving the inverse kinematics problems of mechanical manipulators* | IEEE Trans. Robotics and Automation | 1991 | [DOI](https://doi.org/10.1109/70.86079) | 循环坐标下降 IK |
| Lewis, Cordner & Fong, *Pose space deformation* | SIGGRAPH | 2000 | [DOI](https://doi.org/10.1145/344779.344862) | 姿态驱动的修正形状 |
| Kovar, Gleicher & Pighin, *Motion graphs* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566605) | 在动捕过渡上做图搜索 |
| Kavan, Collins, Žára & O'Sullivan, *Geometric skinning with approximate dual quaternion blending* | ACM TOG | 2008 | [DOI](https://doi.org/10.1145/1409625.1409627) | 对偶四元数蒙皮 |
| Aristidou & Lasenby, *FABRIK* | Graphical Models | 2011 | [DOI](https://doi.org/10.1016/j.gmod.2011.05.003) | 基于位置的迭代 IK |
| Lewis et al., *Practice and theory of blendshape facial models* | Eurographics STAR | 2014 | [DOI](https://doi.org/10.2312/egst.20141042) | 面部混合形状绑定综述 |
| Loper et al., *SMPL: A skinned multi-person linear model* | ACM TOG | 2015 | [DOI](https://doi.org/10.1145/2816795.2818013) | 学习得到的人体模型；视觉领域的标准 |
| Clavet, *Motion Matching and The Road to Next-Gen Animation* | GDC 演讲 | 2016 | [GDC Vault](https://gdcvault.com/play/1023280/Motion-Matching-and-The-Road) | 生产中的运动匹配 |
| Holden, Komura & Saito, *Phase-functioned neural networks for character control* | ACM TOG | 2017 | [DOI](https://doi.org/10.1145/3072959.3073663) | 神经运动控制器 |
| Peng, Abbeel, Levine & van de Panne, *DeepMimic* | ACM TOG (SIGGRAPH) | 2018 | [arXiv](https://arxiv.org/abs/1804.02717) | 用强化学习模仿动捕片段 |
| Holden, Kanoun, Perepichka & Popa, *Learned motion matching* | ACM TOG | 2020 | [DOI](https://doi.org/10.1145/3386569.3392440) | 用小网络实现运动匹配 |
| Peng et al., *AMP: Adversarial Motion Priors* | ACM TOG (SIGGRAPH) | 2021 | [arXiv](https://arxiv.org/abs/2104.02180) | 来自判别器的风格奖励 |
| Peng et al., *ASE: Adversarial Skill Embeddings* | ACM TOG (SIGGRAPH) | 2022 | [arXiv](https://arxiv.org/abs/2205.01906) | 可复用的潜在技能空间 |
| Guo et al., *Generating Diverse and Natural 3D Human Motions from Text* | CVPR | 2022 | [CVF](https://openaccess.thecvf.com/content/CVPR2022/html/Guo_Generating_Diverse_and_Natural_3D_Human_Motions_From_Text_CVPR_2022_paper.html) | HumanML3D 基准 |
| Tevet et al., *Human Motion Diffusion Model* | ICLR | 2023 | [arXiv](https://arxiv.org/abs/2209.14916) | 用于文本到运动的扩散模型 |
| Luo et al., *Perpetual Humanoid Control for Real-time Simulated Avatars* | ICCV | 2023 | [arXiv](https://arxiv.org/abs/2305.06456) | 能从摔倒中恢复的通用动作跟踪器 |
| Guo et al., *MoMask* | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.00063) | 残差 VQ + 掩码 Transformer |
| He et al., *H2O: Learning Human-to-Humanoid Real-Time Whole-Body Teleoperation* | IROS | 2024 | [arXiv](https://arxiv.org/abs/2403.04436) | 在真实人形机器人上做角色跟踪 |
| Fu et al., *HumanPlus* | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2406.10454) | 跟随并模仿人类 |
| Tessler et al., *MaskedMimic* | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2409.14393) | 把统一控制看作运动补全 |
| He et al., *ASAP* | RSS | 2025 | [arXiv](https://arxiv.org/abs/2502.01143) | 敏捷人形技能的仿真到现实对齐 |
| Xu et al., *PARC* | SIGGRAPH | 2025 | [arXiv](https://arxiv.org/abs/2505.04002) | 生成器 + 物理跟踪器的数据扩充 |
| Ze et al., *TWIST* | CoRL | 2025 | [PMLR](https://proceedings.mlr.press/v305/ze25a.html) | 基于模仿的全身遥操作 |
| Allshire et al., *Visual Imitation Enables Contextual Humanoid Control* (VideoMimic) | CoRL | 2025 | [arXiv](https://arxiv.org/abs/2505.03729) | 从单目视频学习人形技能 |
| Xie et al., *KungfuBot* | NeurIPS | 2025 | [arXiv](https://arxiv.org/abs/2506.12851) | 跟踪高动态的人类技能 |
| Xiao et al., *MotionStreamer* | ICCV | 2025 | [arXiv](https://arxiv.org/abs/2503.15451) | 流式文本到运动 |
| Tessler et al., *MaskedManipulator* | SIGGRAPH Asia | 2025 | [arXiv](https://arxiv.org/abs/2505.19086) | 模拟角色的全身操作 |
| Liao et al., *BeyondMimic* | arXiv 预印本（2025 年 8 月） | 2025 | [arXiv](https://arxiv.org/abs/2508.08241) | 在硬件上结合动作跟踪与引导扩散 |
| Araújo et al., *Retargeting Matters: General Motion Retargeting for Humanoid Motion Tracking* | arXiv 预印本（2025 年 10 月） | 2025 | [arXiv](https://arxiv.org/abs/2510.02252) | 重定向质量对机器人跟踪器的影响 |
| Tencent Hunyuan, *HY-Motion 1.0* | arXiv 预印本（2025 年 12 月） | 2025 | [arXiv](https://arxiv.org/abs/2512.23464) | 十亿参数的流匹配文本到运动 |
| Luo et al., *SONIC: Supersizing Motion Tracking for Natural Humanoid Whole-Body Control* | Science Robotics | 2026 | [arXiv](https://arxiv.org/abs/2511.07820) | 扩大人形动作跟踪的规模 |
| Rempe et al., *Kimodo* | arXiv 预印本（2026 年 3 月） | 2026 | [arXiv](https://arxiv.org/abs/2603.15546) | 大规模可控运动扩散 |
| Liao et al., *SuperMimic* | CoRL（已接收），arXiv 2026 年 10 月 | 2026 | [arXiv](https://arxiv.org/abs/2610.28480) | 通过单个可微世界模型训练跟踪 |

## 学习资源

- Rick Parent，*Computer Animation: Algorithms and Techniques*（第 3 版）：样条、旋转、运动学、蒙皮、动作捕捉。
- **GAMES105**（刘利斌，中文）：角色动画基础，从运动学和运动匹配到物理控制与学习。
- Daniel Holden 的博客 [theorangeduck.com](https://theorangeduck.com/)：关于四元数、弹簧阻尼器、惯性化和运动匹配的清晰、以代码为先的文章。
- Jason Gregory，*Game Engine Architecture*：动画系统一章（骨架、混合树、压缩），连接[图形引擎系列]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})。
- 代码：[SMPL / SMPL-X](https://smpl-x.is.tue.mpg.de/)、NVIDIA 的 [ProtoMotions](https://github.com/NVlabs/ProtoMotions)（MaskedMimic 等物理角色方法）、[MDM](https://github.com/GuyTevet/motion-diffusion-model)。

## 练习

1. 从四个端点条件推导 Hermite 基函数，并证明均匀 Catmull–Rom 样条在关键帧处是 $C^1$ 而非 $C^2$。
2. 实现弧长反查的牛顿法 $t \leftarrow t - (s(t) - s^*)/\lVert p'(t)\rVert$，在曲线求值次数相同的条件下与查表法比较精度。
3. 证明对于绕同一轴旋转的两个关节，DQS（平移为零）退化为归一化四元数混合（nlerp），并且其旋转角并不恰好是 $w_1\theta$。在 $w_1 = 0.25$、$\theta = 160^\circ$ 时误差有多大？
4. 给 CCD 和 FABRIK 加上关节限制（每个关节一个角度区间），比较它们对靠近根部的目标所达到的姿态。
5. 在运动匹配玩具中加入来自合成步态相位的脚位置特征，并赋予较大权重。当查询要求保持当前脚步相位时，选中的帧如何变化？

<details markdown="1"><summary>练习 3 提示</summary>

取 $q_0 = 1$、$q_1 = (\cos\frac\theta2, \sin\frac\theta2\,\hat x)$，混合结果 $w_0 + w_1 q_1$ 的旋转角为 $2\,\mathrm{atan2}\big(w_1\sin\frac\theta2,\ w_0 + w_1\cos\frac\theta2\big)$。与 slerp 给出的 $w_1\theta$ 比较。

</details>

<details markdown="1"><summary>练习 4 提示</summary>

在 CCD 中，每个关节更新后立即截断其角度。在 FABRIK 中，放置关节 $i+1$ 后，把骨骼方向投影到相对前一根骨骼的允许锥体（二维中为角度区间）内。

</details>

本系列下一篇：体积与参与介质（[图形学第 10 篇]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }})）。
