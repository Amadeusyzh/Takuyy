---
layout: post
title: "机器人学基础：位姿变换、运动学、控制与规划"
date: 2026-10-27 18:01:00+0900
description: "SE(3)、正/逆运动学、雅可比矩阵、动力学初探、PID 与阻抗控制、A*/RRT 规划，附三连杆机械臂的 NumPy 代码。"
categories: embodied-ai
tags: [robotics, kinematics, control, motion-planning]
series: embodied-ai
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

具身智能（embodied AI）是 AI 中必须驱动一个身体在物理世界中运动的那一部分。现代机器人学习论文里满是"策略"
（policy）、"动作块"（action chunk）、"末端执行器增量"（end-effector delta）这样的词，但它们底下都压着一整套经典
机器人学：坐标系、运动学、动力学、底层控制器与规划器。一个输出 7 维末端执行器指令的视觉-语言-动作模型，
如果没有东西能以 1 kHz 把这条指令转换成关节力矩、同时不撞上关节限位或自身，那它就毫无用处。

这是 **具身智能** 系列的第一篇，面向懂深度学习、图形学和世界模型、但缺少机器人背景的读者，对这套技术栈做一次
紧凑的巡览。如果你做过图形学，其实已经懂了一半：机械臂就是一个由刚体变换组成的场景图（scene graph），而逆运动学
正是动画师给角色绑定（rig）时要解决的同一个问题。

**前置知识**

- 线性代数：矩阵、旋转、最小二乘、奇异值分解（SVD）。
- 微积分：偏导数、链式法则。
- Python 与 NumPy。
- 有帮助但非必需：图形学课程中的齐次坐标。

## 1. 刚体变换与 SE(3)

### 旋转：SO(3)

刚体相对参考系的姿态是一个旋转矩阵 $R \in \mathbb{R}^{3\times3}$，其各列是物体坐标轴在参考系中的表示。
旋转矩阵构成**特殊正交群**（special orthogonal group）

$$
SO(3) = \{ R \in \mathbb{R}^{3\times 3} \;:\; R^\top R = I,\; \det R = 1 \}.
$$

SO(3) 是一个三维流形而不是向量空间：两个旋转相加得不到旋转。常见参数化有欧拉角（最小参数，但在"万向节锁"
处奇异）、单位四元数（4 个数，双重覆盖，无奇异，是仿真器和游戏引擎的标准）以及
**轴角/指数坐标**（axis-angle / exponential coordinates）$\omega\theta$，其中 $\hat\omega$ 为单位轴，$\theta$ 为角度。

对向量 $\omega = (\omega_1, \omega_2, \omega_3)$ 定义反对称矩阵

$$
[\omega] = \begin{bmatrix} 0 & -\omega_3 & \omega_2 \\ \omega_3 & 0 & -\omega_1 \\ -\omega_2 & \omega_1 & 0 \end{bmatrix},
\qquad [\omega]\,v = \omega \times v .
$$

矩阵指数把轴角映射为旋转（Rodrigues 公式）：

$$
R = e^{[\hat\omega]\theta} = I + \sin\theta\,[\hat\omega] + (1-\cos\theta)\,[\hat\omega]^2 .
$$

反对称矩阵的集合是**李代数**（Lie algebra）$\mathfrak{so}(3)$，即 SO(3) 在单位元处的切空间。角速度就住在这里：
若 $R(t)$ 是一条轨迹，则 $\dot R R^\top = [\omega_s]$ 给出固定（空间）坐标系下的角速度，$R^\top \dot R = [\omega_b]$
给出物体坐标系下的角速度。

### 刚体运动：SE(3)

完整的位姿（位置 $p$ 与姿态 $R$）是一个齐次变换

$$
T = \begin{bmatrix} R & p \\ 0 & 1 \end{bmatrix} \in SE(3), \qquad
T^{-1} = \begin{bmatrix} R^\top & -R^\top p \\ 0 & 1 \end{bmatrix}.
$$

这正是图形学里的 4x4 模型矩阵。一个能省去大量 bug 的记号：用 $T_{ab}$ 表示"坐标系 $b$ 在坐标系 $a$ 中的位姿"。
这样复合就像多米诺骨牌一样串起来：

$$
T_{ac} = T_{ab}\,T_{bc}, \qquad p_a = T_{ab}\, p_b \;\text{(in homogeneous coordinates)}.
$$

机器人的整个"场景图"（世界、基座、各连杆、相机、夹爪、物体）就是一棵由这样的变换组成的树。例如手眼标定
（hand-eye calibration）就是估计固定变换 $T_{\text{gripper},\text{camera}}$ 的问题。

### 运动旋量与螺旋

刚体的速度是一个**运动旋量**（twist）$\mathcal{V} = (\omega, v) \in \mathbb{R}^6$，记
$[\mathcal{V}] = \begin{bmatrix}[\omega] & v\\0&0\end{bmatrix} \in \mathfrak{se}(3)$。Chasles 定理指出，任何刚体运动都是
绕某轴的旋转加上沿该轴的平移，即**螺旋运动**（screw motion）；指数映射 $T = e^{[\mathcal{S}]\theta}$ 把单位螺旋轴
$\mathcal{S}$ 与距离 $\theta$ 变为 SE(3) 的元素。这就是 *Modern Robotics* 全书使用的指数积（product of exponentials, PoE）
公式的基础。运动旋量的对偶是**力旋量**（wrench）$\mathcal{F} = (m, f)$（力矩与力），功率为 $\mathcal{F}^\top\mathcal{V}$。

做学习的人为什么要关心？因为动作空间就是位姿。用网络预测旋转意味着要选择表示：欧拉角有不连续性，四元数有
$q \equiv -q$ 的二义性，而 Zhou 等人（CVPR 2019）证明连续的 6 维表示（$R$ 的两列，再做正交化）更容易回归。
很多策略（例如第 4 篇的 Diffusion Policy）都采用它。

## 2. 正运动学

串联机械臂（serial manipulator）是由关节连接的连杆链，关节通常是转动关节（R）或移动关节（P）。**构型**
（configuration）是关节变量组成的向量 $q \in \mathbb{R}^n$，所有构型的集合称为构型空间（C-space）。
**正运动学**（forward kinematics, FK）把 $q$ 映射到末端执行器位姿：

$$
T_{0n}(q) = T_{01}(q_1)\,T_{12}(q_2)\cdots T_{n-1,n}(q_n).
$$

### Denavit-Hartenberg 参数

Denavit 与 Hartenberg（1955）指出，只要巧妙地放置坐标系，每个连杆变换只需要四个数。在**标准 DH 约定**中，
$z_i$ 轴是关节 $i+1$ 的轴线，并且

$$
T_{i-1,i} = \mathrm{Rot}_z(\theta_i)\,\mathrm{Trans}_z(d_i)\,\mathrm{Trans}_x(a_i)\,\mathrm{Rot}_x(\alpha_i)
= \begin{bmatrix}
\cos\theta_i & -\sin\theta_i\cos\alpha_i & \sin\theta_i\sin\alpha_i & a_i\cos\theta_i\\
\sin\theta_i & \cos\theta_i\cos\alpha_i & -\cos\theta_i\sin\alpha_i & a_i\sin\theta_i\\
0 & \sin\alpha_i & \cos\alpha_i & d_i\\
0&0&0&1
\end{bmatrix}.
$$

| 参数 | 含义 |
| --- | --- |
| $a_i$ | 连杆长度：沿 $x_i$ 方向 $z_{i-1}$ 与 $z_i$ 之间的距离 |
| $\alpha_i$ | 连杆扭角：绕 $x_i$ 从 $z_{i-1}$ 转到 $z_i$ 的角度 |
| $d_i$ | 连杆偏距：沿 $z_{i-1}$ 的距离（移动关节时为变量） |
| $\theta_i$ | 绕 $z_{i-1}$ 的关节角（转动关节时为变量） |

注意：还有一种**改进 DH**（modified DH，Craig）约定，例如 Franka Emika 的文档就使用它，四个基本变换的顺序不同。
混用两种约定是经典的 bug 来源。实践中机器人用 URDF 或 MJCF 文件（第 3 篇）描述，每个关节存一个完整变换，
Pinocchio、Drake、MuJoCo、PyBullet 等库会替你算 FK。DH 仍值得掌握，因为它让结构一目了然，而且多数教科书和
数据手册都用它来介绍运动学。

### 用 NumPy 实现平面三连杆机械臂

对平面机械臂，所有 $\alpha_i = d_i = 0$，因此每个 DH 变换就是先旋转 $q_i$，再沿新的 $x$ 轴平移 $a_i$。
记绝对角 $c_i = q_1 + \dots + q_i$，末端执行器为

$$
p_x = \sum_i a_i\cos c_i,\qquad p_y = \sum_i a_i \sin c_i,\qquad \phi = c_n .
$$

```python
import numpy as np

def dh(a, alpha, d, theta):
    """Standard DH transform: Rot_z(theta) Trans_z(d) Trans_x(a) Rot_x(alpha)."""
    ct, st, ca, sa = np.cos(theta), np.sin(theta), np.cos(alpha), np.sin(alpha)
    return np.array([[ct, -st * ca,  st * sa, a * ct],
                     [st,  ct * ca, -ct * sa, a * st],
                     [0.0,     sa,       ca,      d],
                     [0.0,    0.0,      0.0,    1.0]])

LINKS = np.array([1.0, 0.8, 0.5])          # link lengths of a planar 3R arm

def fk(q, links=LINKS):
    """Forward kinematics: returns the 4x4 pose of the end effector and all joint positions."""
    T = np.eye(4)
    pts = [T[:3, 3].copy()]
    for a, theta in zip(links, q):
        T = T @ dh(a, 0.0, 0.0, theta)     # planar arm: alpha = d = 0
        pts.append(T[:3, 3].copy())
    return T, np.array(pts)

def task(q):
    """Task-space coordinates x = (px, py, phi) of the end effector."""
    T, _ = fk(q)
    return np.array([T[0, 3], T[1, 3], np.arctan2(T[1, 0], T[0, 0])])
```

`pts` 给出每个关节的位置，用 matplotlib 画出机械臂只需要它。

## 3. 雅可比矩阵与微分运动学

FK 是非线性的，但它的导数对关节速度是线性的：

$$
\dot x = J(q)\,\dot q, \qquad J(q) = \frac{\partial x}{\partial q} \in \mathbb{R}^{m\times n}.
$$

对我们的平面机械臂（$m = n = 3$），对上面的求和式求导即可得到各列：

$$
J_{1i} = -\sum_{k\ge i} a_k \sin c_k,\qquad J_{2i} = \sum_{k\ge i} a_k\cos c_k, \qquad J_{3i} = 1 .
$$

对一般的空间机械臂，转动关节 $i$（单位轴 $z_{i-1}$ 经过点 $o_{i-1}$，均在基座坐标系下）的**几何雅可比**
（geometric Jacobian）列为

$$
J_i = \begin{bmatrix} z_{i-1}\times(o_n - o_{i-1}) \\ z_{i-1}\end{bmatrix},
$$

上半部分是线速度，下半部分是角速度；移动关节贡献 $(z_{i-1}, 0)$。（*Modern Robotics* 用由螺旋轴构造的空间雅可比和
物体雅可比表达同样的内容。）

雅可比几乎告诉了你所有局部行为：

- **奇异位形**（singularity）：当 $\operatorname{rank} J < m$ 时，末端执行器失去一个运动方向（完全伸直的手臂无法再向外
  移动）。在其附近，微小的笛卡尔运动需要极大的关节速度。
- **可操作度**（manipulability）：Yoshikawa 指标 $w = \sqrt{\det(JJ^\top)}$，即速度椭球
  $\lbrace J\dot q : \lVert\dot q\rVert \le 1 \rbrace$ 的体积，其各轴来自 $J$ 的 SVD。
- **静力学**：由虚功原理，末端执行器上的力旋量 $\mathcal{F}$ 需要关节力矩 $\tau = J^\top(q)\,\mathcal{F}$。
  这一行公式就是力控制与阻抗控制的基础。
- **冗余**（redundancy）：若 $n > m$（例如用 7 自由度手臂实现 6 维位姿），就存在零空间；关节运动 $(I - J^+J)\,z$
  可以移动肘部而不移动手。

手写的雅可比一定要用有限差分检验：

```python
def jacobian(q, links=LINKS):
    """Analytic Jacobian d(px, py, phi)/dq of the planar arm."""
    c = np.cumsum(q)                        # absolute link angles
    J = np.zeros((3, len(q)))
    for i in range(len(q)):
        J[0, i] = -np.sum(links[i:] * np.sin(c[i:]))
        J[1, i] = np.sum(links[i:] * np.cos(c[i:]))
        J[2, i] = 1.0
    return J

q = np.array([0.3, -0.5, 0.8])
eps = 1e-6
J_num = np.stack([(task(q + eps * np.eye(3)[i]) - task(q - eps * np.eye(3)[i])) / (2 * eps)
                  for i in range(3)], axis=1)
print("Jacobian error:", np.abs(J_num - jacobian(q)).max())   # ~1e-10
```

## 4. 逆运动学

**逆运动学**（inverse kinematics, IK）求 $q$ 使得 $x(q) = x^\*$。它可能无解、有有限个解或有无穷多个解。

### 解析 IK

对简单或经过特殊设计的机械臂存在闭式解。对到达 $(p_x, p_y)$ 的平面二连杆，由余弦定理得

$$
\cos q_2 = \frac{p_x^2 + p_y^2 - a_1^2 - a_2^2}{2a_1a_2},\qquad
q_2 = \pm\arccos(\cdot),\qquad
q_1 = \operatorname{atan2}(p_y, p_x) - \operatorname{atan2}(a_2\sin q_2,\; a_1 + a_2\cos q_2),
$$

$\pm$ 选择"肘部向上"或"肘部向下"，当 $\lvert\cos q_2\rvert > 1$ 时无解。带**球形手腕**（spherical wrist，最后三个
轴交于一点）的工业 6 自由度机械臂可以解耦为位置问题和姿态问题（Pieper 准则），最多有 8 组解析解。
IKFast（OpenRAVE）等工具可以自动生成这类求解器。

### 数值 IK：牛顿法、雅可比转置、伪逆

对一般机械臂我们迭代求解。在当前 $q$ 处线性化：$x^\* - x(q) \approx J\,\Delta q$。可选方案：

- **雅可比转置**：$\Delta q = \alpha J^\top e$。计算便宜，对 $\tfrac12\lVert e\rVert^2$ 总是下降方向，但慢。
- **伪逆（高斯-牛顿）**：对宽矩阵 $J$，$\Delta q = J^+ e$，$J^+ = J^\top(JJ^\top)^{-1}$。在解附近很快，但在奇异位形
  附近会爆炸，因为 $J^+$ 含有 $1/\sigma_i$ 项。
- **阻尼最小二乘**（damped least squares, DLS，即 Levenberg-Marquardt）：最小化
  $\lVert J\Delta q - e\rVert^2 + \lambda^2\lVert\Delta q\rVert^2$，得到

$$
\Delta q = J^\top\left(JJ^\top + \lambda^2 I\right)^{-1} e
= \sum_i \frac{\sigma_i}{\sigma_i^2 + \lambda^2}\, v_i u_i^\top e .
$$

SVD 形式说明了 DLS 为何稳健（Nakamura 与 Hanafusa 1986；Wampler 1986）：$\sigma_i \gg \lambda$ 的方向表现得像伪逆，
而 $\sigma_i \to 0$ 的方向被阻尼到零，而不是爆炸。代价是收敛变慢并带来少量偏差。

```python
def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi

def ik_dls(x_goal, q0, lam=0.05, iters=200, tol=1e-6):
    """Damped least-squares IK: dq = J^T (J J^T + lam^2 I)^-1 e."""
    q = q0.astype(float).copy()
    for k in range(iters):
        e = x_goal - task(q)
        e[2] = wrap(e[2])                   # angle error must be wrapped
        if np.linalg.norm(e) < tol:
            break
        J = jacobian(q)
        dq = J.T @ np.linalg.solve(J @ J.T + lam**2 * np.eye(3), e)
        q += dq
    return q, k, np.linalg.norm(e)

x_goal = np.array([1.2, 0.9, np.pi / 4])
q_sol, n, err = ik_dls(x_goal, np.zeros(3))
print(np.round(q_sol, 4), n, err)           # converges in ~8 iterations, residual ~1e-7
print(np.round(task(q_sol), 4))             # [1.2, 0.9, 0.7854]

# unreachable target (total reach is 2.3): with lam=0.5 the arm stretches toward it,
# residual 0.7 = the best achievable. With lam=0.05 the iteration oscillates near the singularity.
q_far, n, err = ik_dls(np.array([3.0, 0.0, 0.0]), np.array([0.1, 0.1, 0.1]), lam=0.5, iters=500)
print(err)                                  # 0.7
```

把最后一次调用改成 `lam=0.05` 试试：迭代会四处游走，残差有好几个单位，因为伸直的手臂处于奇异位形，阻尼不足的
步长会过冲。实用的 IK 求解器会把 DLS 与自适应阻尼、步长限制、关节限位以及零空间中的次要目标结合起来；现代的做法
是每个控制周期求解一个小型**二次规划**（quadratic program, QP），例如"在关节位置和速度限制下最小化任务误差"，
可用 Pink、mink、Drake 等库求解。

## 5. 动力学初探

运动学忽略了力。$n$ 关节刚体系统的运动方程为

$$
M(q)\,\ddot q + C(q,\dot q)\,\dot q + g(q) = \tau + J(q)^\top \mathcal{F}_{\text{ext}},
$$

其中 $M(q)$ 是对称正定的**质量矩阵**（mass matrix），$C\dot q$ 是科氏力与离心力项，$g(q)$ 是重力项，$\tau$ 是关节力矩，
$\mathcal{F}_{\text{ext}}$ 是外部力旋量（例如接触力）。它们来自拉格朗日量 $L = \tfrac12 \dot q^\top M(q)\dot q - V(q)$ 的
欧拉-拉格朗日方程。两个标准问题：

- **逆动力学**（inverse dynamics）：给定 $q, \dot q, \ddot q$，求 $\tau$。递归牛顿-欧拉算法（RNEA）以 $O(n)$ 完成。
- **正动力学**（forward dynamics）：给定 $\tau$，求 $\ddot q = M^{-1}(\tau - C\dot q - g)$。铰接体算法（ABA）同样是
  $O(n)$（Featherstone 2008）。

两个结构性质使控制设计成为可能：$M(q)$ 正定；并且适当选择 $C$ 时，$\dot M - 2C$ 是反对称的（无源性，passivity）。
接触、摩擦和执行器限制让真实动力学困难得多，那是第 3 篇中物理引擎的工作。

## 6. 控制

控制器把期望轨迹变成力矩，通常在机器人上以 0.5 到 1 kHz 运行，而学习得到的策略在其上以 5 到 50 Hz 运行。
清楚你的策略指挥的是哪一层（关节位置目标、关节速度、末端位姿还是力矩），对仿真到现实迁移非常重要。

### PID 与带重力补偿的 PD

主力是每个关节上的 PID：

$$
\tau = K_p\, e + K_i \int_0^t e\, dt' - K_d\,\dot q, \qquad e = q_{\text{ref}} - q .
$$

比例项像弹簧，微分项像阻尼器，积分项消除重力这类恒定扰动造成的稳态误差。更好地利用模型的方式是
**PD 加重力补偿**，$\tau = K_p e - K_d\dot q + g(q)$，对于恒定目标它是全局渐近稳定的（Takegaki 与 Arimoto 1981）。
一个单关节摆就能让差别一目了然：

```python
import numpy as np

# 1-DoF pendulum joint: I*qdd + b*qd + m*g*l*sin(q) = tau
I, b, m, g, l = 0.5, 0.1, 1.0, 9.81, 0.5
dt, T = 1e-3, 3.0

def simulate(Kp, Kd, Ki, gravity_comp, q_ref=np.pi / 3):
    q, qd, integ = 0.0, 0.0, 0.0
    for _ in range(int(T / dt)):
        e = q_ref - q
        integ += e * dt
        tau = Kp * e - Kd * qd + Ki * integ
        if gravity_comp:
            tau += m * g * l * np.sin(q)      # feed-forward model term
        qdd = (tau - b * qd - m * g * l * np.sin(q)) / I
        qd += qdd * dt                        # semi-implicit Euler
        q += qd * dt
    return q_ref - q

print("PD only        error %.4f rad" % simulate(20, 3, 0, False))   # 0.1861
print("PID            error %.4f rad" % simulate(20, 3, 30, False))  # 0.0000
print("PD + gravity   error %.4f rad" % simulate(20, 3, 0, True))    # -0.0001
```

纯 PD 会下垂约 0.19 rad，因为弹簧必须托住重量；积分项或重力模型消除了这个误差。腿式机器人的 RL 策略（第 2 篇）
几乎总是向这样的 PD 回路输出**关节位置目标**而不是直接输出力矩；于是 PD 增益也成了"动作空间"的一部分。

### 计算力矩控制与操作空间控制

如果模型足够好，就可以抵消非线性动力学，强加线性的误差动力学（**计算力矩控制**，computed torque，即反馈线性化）：

$$
\tau = M(q)\left(\ddot q_{\text{ref}} + K_d\dot e + K_p e\right) + C\dot q + g .
$$

Khatib 的**操作空间方法**（operational-space formulation，1987）在任务空间做同样的事。设任务空间惯量
$\Lambda(q) = (J M^{-1} J^\top)^{-1}$，末端执行器就像一个质量为 $\Lambda$ 的物体，并且

$$
\tau = J^\top\left(\Lambda\,\ddot x_{\text{cmd}} + \mu + p\right) + \left(I - J^\top \bar J^{\top}\right)\tau_0,
\qquad \bar J = M^{-1}J^\top\Lambda,
$$

其中 $\mu, p$ 是任务空间的科氏项和重力项，$\tau_0$ 是投影到动力学一致零空间中的次要目标（例如让肘部保持在
休息姿态附近）。

### 阻抗控制

Hogan 的**阻抗控制**（impedance control，1985）不追求刚性地跟踪位置，而是让末端执行器在目标附近表现为一个
质量-弹簧-阻尼系统：

$$
\Lambda_d\,\ddot{\tilde x} + D_d\,\dot{\tilde x} + K_d\,\tilde x = \mathcal{F}_{\text{ext}},\qquad \tilde x = x - x_d .
$$

最简单的实现忽略期望惯量，利用静力关系 $\tau = J^\top\mathcal{F}$ 输出
$\tau = J^\top\left(K_d (x_d - x) - D_d\,\dot x\right) + g(q)$。低刚度带来柔顺、安全的接触（擦拭、插装、与人交互），
高刚度带来精确跟踪。许多学习得到的操作策略以 10 到 20 Hz 向 1 kHz 的笛卡尔阻抗控制器输出目标位姿 $x_d$；有些还会
预测刚度（"变阻抗"，variable impedance）。

## 7. 运动规划

规划要在 C-space 中找到从 $q_{\text{start}}$ 到 $q_{\text{goal}}$ 的无碰撞路径。工作空间里的障碍物在关节空间中变成复杂的
"C-障碍"，因此规划器并不显式构造自由空间，而是查询碰撞检测器（它运行 FK 并做网格-网格测试，用的正是光线追踪里
那套 BVH 机制）。

### 图搜索：A*

在离散化的 C-space（栅格或格子图）上，**A\***（Hart、Nilsson 与 Raphael 1968）按
$f(n) = g(n) + h(n)$ 的顺序扩展节点，即已付代价加上对剩余代价的启发式估计。若 $h$ **可采纳**（admissible，从不高估），
A\* 返回最优路径；若它还**一致**（consistent，$h(n) \le c(n,n') + h(n')$），则任何节点都无需重复扩展。Dijkstra 就是
$h = 0$ 的 A\*。栅格规模随维数指数增长，所以 A\* 用于二维/三维的移动机器人、落脚点规划和离散格子图，而不是
7 自由度机械臂。

### 基于采样的规划：PRM、RRT、RRT\*

基于采样的规划器避免了离散化。**PRM**（Kavraki 等 1996）采样大量无碰撞构型，连接邻近构型，再用图搜索回答查询。
**RRT**（LaValle 1998）从起点生长一棵树：采样 $x_{\text{rand}}$，找到树上最近的节点，朝采样点前进固定距离，若这条边
无碰撞就加入新节点。这一过程的 Voronoi 偏置会把树拉向未探索的空间。RRT 是**概率完备**的（若路径存在，找到它的
概率趋于 1），但不是最优的。**RRT\***（Karaman 与 Frazzoli 2011）增加两步：在收缩半径 $r_n \propto (\log n / n)^{1/d}$
内选择最优父节点，并通过新节点**重连**（rewire）邻居，从而具备渐近最优性。

```python
import numpy as np

rng = np.random.default_rng(0)
OBST = [(np.array([0.5, 0.5]), 0.2), (np.array([0.25, 0.8]), 0.12)]   # circles (center, radius)

def free(p):
    return all(np.linalg.norm(p - c) > r for c, r in OBST)

def edge_free(a, b, n=20):
    return all(free(a + t * (b - a)) for t in np.linspace(0, 1, n))

def rrt(start, goal, step=0.05, iters=5000, goal_bias=0.1):
    nodes, parent = [start], [-1]
    for _ in range(iters):
        x_rand = goal if rng.random() < goal_bias else rng.random(2)   # sample in [0,1]^2
        i = int(np.argmin([np.linalg.norm(n - x_rand) for n in nodes]))
        d = x_rand - nodes[i]
        x_new = nodes[i] + d * min(1.0, step / (np.linalg.norm(d) + 1e-12))  # steer
        if not edge_free(nodes[i], x_new):
            continue
        nodes.append(x_new); parent.append(i)
        if np.linalg.norm(x_new - goal) < step and edge_free(x_new, goal):
            nodes.append(goal); parent.append(len(nodes) - 2)
            path, j = [], len(nodes) - 1
            while j != -1:
                path.append(nodes[j]); j = parent[j]
            return np.array(path[::-1]), len(nodes)
    return None, len(nodes)

path, n = rrt(np.array([0.1, 0.1]), np.array([0.9, 0.9]))
print(f"tree size {n}, path waypoints {len(path)}, "
      f"length {np.sum(np.linalg.norm(np.diff(path, axis=0), axis=1)):.3f}")
```

若要为三连杆机械臂而不是一个点做规划，把采样空间换成 $[-\pi,\pi]^3$，把 `free(q)` 换成"对连杆做 FK 并逐段与障碍物
求交"即可。RRT 路径是锯齿状的，所以实际系统会先做捷径化和平滑，再在速度、加速度限制下做时间参数化
（例如 TOPP-RA）。**轨迹优化**（trajectory optimization）方法如 CHOMP（Ratliff 等 2009）和 TrajOpt（Schulman 等 2013）
则直接对整条轨迹优化平滑度加碰撞代价；NVIDIA cuRobo 这类 GPU 并行规划器把规划时间降到了毫秒级。

### 学习从哪里切入

| 经典模块 | 学习方法的替代或增强（后续文章） |
| --- | --- |
| 手工设计的控制器 | 输出 PD 目标的 RL 策略（第 2 篇） |
| 解析模型 | 带域随机化的仿真器，或学习得到的世界模型（第 3、5 篇） |
| 规划器 + 代价函数 | 模仿示范的策略，例如 ACT、Diffusion Policy（第 4 篇） |
| 用代码写的任务规格 | 给 VLA 模型的语言指令（第 5 篇） |

学习很少会移除底层：OpenVLA 或 pi0 策略依然要把目标发给 IK 求解器和阻抗或 PD 控制器。理解这些层，才能调试一个
"仿真里能用、到了真机上就抖"的策略。

## 动手试试

主页的 **[Lab]({{ '/' | relative_url }}#lab)** 有一个 XPBD 布料演示。基于位置的动力学通过投影位置来满足约束，
这与上面的 IK 迭代把手臂投影到"够到目标"这一约束上非常相似；拖动布料上的一个粒子，本质上就是一条高度冗余链的
IK 问题。一个不错的练习是把 `ik_dls` 移植到 JavaScript，在 canvas 上拖动三连杆机械臂的末端。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Denavit and Hartenberg, *A kinematic notation for lower-pair mechanisms based on matrices* | J. Applied Mechanics | 1955 | [DOI](https://doi.org/10.1115/1.4011045) | DH 约定 |
| Hart, Nilsson, Raphael, *A formal basis for the heuristic determination of minimum cost paths* | IEEE Trans. SSC | 1968 | [DOI](https://doi.org/10.1109/TSSC.1968.300136) | A* 搜索 |
| Hogan, *Impedance control: an approach to manipulation, Part I* | J. Dyn. Sys., Meas., Control | 1985 | [DOI](https://doi.org/10.1115/1.3140702) | 阻抗控制 |
| Nakamura and Hanafusa, *Inverse kinematic solutions with singularity robustness for robot manipulator control* | J. Dyn. Sys., Meas., Control | 1986 | - | 阻尼最小二乘 IK |
| Khatib, *A unified approach for motion and force control of robot manipulators: the operational space formulation* | IEEE J. Robotics and Automation | 1987 | [DOI](https://doi.org/10.1109/JRA.1987.1087068) | 操作空间控制 |
| Kavraki et al., *Probabilistic roadmaps for path planning in high-dimensional configuration spaces* | IEEE Trans. Robotics and Automation | 1996 | [DOI](https://doi.org/10.1109/70.508439) | PRM |
| LaValle, *Rapidly-exploring random trees: a new tool for path planning* | Tech. report, Iowa State | 1998 | - | RRT |
| Karaman and Frazzoli, *Sampling-based algorithms for optimal motion planning* | IJRR | 2011 | [arXiv](https://arxiv.org/abs/1105.1186) | RRT\*、PRM\*，渐近最优性 |
| Schulman et al., *Finding locally optimal, collision-free trajectories with sequential convex optimization* | RSS | 2013 | [PDF](https://www.roboticsproceedings.org/rss09/p31.pdf) | TrajOpt |
| Zhou et al., *On the continuity of rotation representations in neural networks* | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1812.07035) | 许多策略采用的 6 维旋转表示 |

## 学习资源

- K. Lynch 与 F. Park，*Modern Robotics: Mechanics, Planning, and Control*（Cambridge University Press, 2017），
  免费 PDF、视频与代码见[书籍主页](https://hades.mech.northwestern.edu/index.php/Modern_Robotics)。第 3 到 6 章和第 8 到
  11 章用螺旋理论深入讲解了本文内容。
- R. Tedrake，[*Robotic Manipulation*](https://manipulation.csail.mit.edu) 与
  [*Underactuated Robotics*](https://underactuated.csail.mit.edu)，MIT 课程讲义，附可运行的 Drake notebook。
- S. LaValle，[*Planning Algorithms*](https://lavalle.pl/planning/)（Cambridge, 2006），可免费在线阅读。
- R. Featherstone，*Rigid Body Dynamics Algorithms*（Springer, 2008），讲解 RNEA/ABA。
- B. Siciliano、L. Sciavicco、L. Villani、G. Oriolo，*Robotics: Modelling, Planning and Control*（Springer, 2009）。
- 代码：[Pinocchio](https://github.com/stack-of-tasks/pinocchio)（高速刚体动力学）、
  [Drake](https://drake.mit.edu)、[OMPL](https://ompl.kavrakilab.org)（基于采样的规划器）、
  [Peter Corke 的 Robotics Toolbox for Python](https://github.com/petercorke/robotics-toolbox-python)。

## 练习

1. 实现上面的二连杆解析 IK，并用 `fk` 检验两组肘部解。
2. 为由 DH 表给出的三维机械臂编写几何雅可比，并用有限差分验证。画出平面机械臂在工作空间上的可操作度
   $\sqrt{\det JJ^\top}$。
3. 给 `ik_dls` 加上关节限位：先用截断，再用把关节推向行程中点的零空间项。比较两种版本到达随机目标的成功率。
4. 把摆的例子扩展到带 $M(q)$ 的二连杆机械臂，在连杆质量有 10% 误差时比较 PD、PID 和计算力矩控制。
5. 把 `rrt` 改成 RRT\*（选择父节点与重连），并画出路径长度随采样数的变化。

**下一篇：**[面向机器人的强化学习]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})，
控制器将不再靠设计，而是开始被学习出来。
