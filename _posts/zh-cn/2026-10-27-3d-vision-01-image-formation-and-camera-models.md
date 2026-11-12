---
layout: post
title: "成像与相机模型：射影几何、针孔、镜头与坐标约定"
date: 2026-10-27 11:01:00+0900
description: "「三维视觉基础」系列第 1 篇：齐次坐标、无穷远点与消失点，针孔相机 P = K[R|t] 及其 RQ 分解，Brown-Conrady 与 Kannala-Brandt 畸变，卷帘快门，以及 OpenCV、OpenGL、COLMAP、NeRF 之间的坐标约定换算。"
categories: 3d-vision
tags: [projective-geometry, pinhole-camera, camera-matrix, lens-distortion, fisheye, rolling-shutter, coordinate-conventions]
series: 3d-vision
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

计算机图形学是从场景到图像：几何和相机都已知，我们计算像素。三维视觉则反过来，从图像回到几何：相机在哪里、世界是什么形状、每个像素有多远。这个逆问题的每一步，都从一个精确描述"相机如何把三维点变成像素"的模型出发。只要模型稍有偏差（漏掉一个畸变项、翻转了一根坐标轴、差了半个像素），后面的每一个环节都会继承这个误差：标定、匹配、三角化、SLAM、NeRF 以及 3D 高斯泼溅（3D Gaussian Splatting）。

本文从零搭建这个模型。我们先从射影几何（projective geometry）开始，在这套代数里，"平行线在地平线上相交"是一个精确的命题。然后组装针孔相机 $P = K[R \mid \mathbf t]$，并学会把它重新拆开。接着讨论真实相机偏离针孔模型的几种方式：镜头畸变（lens distortion）、鱼眼光学和卷帘快门（rolling shutter）。最后整理 OpenCV、OpenGL、COLMAP 和 NeRF 的坐标约定，它们造成的隐蔽 bug 比前面所有内容加起来还多。

### 本系列写给谁

**三维视觉基础**是一条从零开始的学习路线，面向懂线性代数、微积分、Python 和基础机器学习，但还没有系统学过多视图几何的读者。每篇文章都按同样的顺序讲一个概念：先给出带图的直觉，再一步步推导公式，然后是一个带具体数字的小例子、能复现它的 NumPy 代码，最后用一张图或一个交互组件在空间中展示结果。如果你在做 NeRF、高斯泼溅、SLAM、机器人或 AR/VR，并且一直把 COLMAP 的位姿当作黑盒，这个系列会帮你打开这个盒子。

本系列位于[图形学系列]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})（从场景到图像）和[神经渲染系列]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})（从图像到辐射场）之间。神经渲染第 1 篇对相机、对极几何、光束法平差和 COLMAP 做了紧凑的概览；本系列则把这些主题一个个放慢、讲深。

### 系列地图

| # | 文章 | 学完后你能做什么 |
| --- | --- | --- |
| 01 | [成像与相机模型]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})（本文） | 写出、分解并换算任意相机模型 |
| 02 | [相机标定]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}) | 用张正友方法估计 $K$ 和畸变，并判断结果是否可信 |
| 03 | [特征与匹配]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}) | 在图像之间检测、描述并稳健地匹配特征点 |
| 04 | [两视图几何]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }}) | 从两张图像恢复相对位姿和深度 |
| 05 | [多视图几何与光束法平差]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}) | 搭建运动恢复结构（SfM）并优化它 |
| 06 | [视觉 SLAM]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }}) | 实时跟踪相机并完成回环 |
| 07 | [深度估计与多视图立体]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) | 把带位姿的图像变成稠密深度 |
| 08 | [三维表示]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }}) | 在点云、网格、体素、SDF、神经场和高斯之间做选择 |
| 09 | [三维重建]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) | 从照片得到表面，靠优化或靠一次网络前向 |
| 10 | [面向 AR/VR 的三维视觉]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }}) | 理解头显的跟踪、延迟和配准误差 |

## 预备知识

- 线性代数：矩阵乘法、逆、行列式、正交矩阵、叉积，以及 QR 分解（我们会用到它的镜像版本 RQ 分解）。
- 旋转与刚体变换。[图形学数学篇]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})讲了旋转矩阵和四元数；[具身智能第 1 篇]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})讲了 $SE(3)$。
- 有帮助但非必需：[光栅化]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})一文中的透视投影矩阵。
- 带 NumPy 和 SciPy 的 Python。下面的每段代码都可以直接运行，文中引用的数字都是它们打印出来的结果。

## 1. 射影几何：成像的语言

相机把三维世界映射到二维图像上。长度、角度和平行性都不保持：铁轨会汇聚，圆会变成椭圆。被保持下来的是：直线仍是直线（对理想镜头而言），直线上的点仍在直线上。射影几何正是只保留这些性质的几何，而它的代数工具——齐次坐标（homogeneous coordinates）——把相机变成了一个矩阵。

### 1.1 平面上的齐次坐标

平面上的点 $(x, y)$ 可以用任意一个三维向量 $\tilde{\mathbf x} = (\lambda x, \lambda y, \lambda)^\top$（$\lambda \neq 0$）来表示。所有非零倍数表示同一个点，记作 $\tilde{\mathbf x} \sim \lambda \tilde{\mathbf x}$。要变回来，就除以最后一个坐标：$(x_1, x_2, x_3) \mapsto (x_1/x_3,\, x_2/x_3)$。

请记住下一张图上半部分的画面。每个齐次向量都是 $\mathbb R^3$ 中**过原点的一条射线**；普通的点就是这条射线与平面 $w = 1$ 的交点。所有这些射线组成的集合就是**射影平面**（projective plane）$\mathbb P^2$。这本身就已经是一台相机：把眼睛放在原点，把图像放在平面 $w=1$ 上，每一条过眼睛的射线就是一个像点。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-projective-plane.svg" width="75%" caption="上：把射影平面看作过原点的射线。黑色射线携带 $(x,y,1)$ 及其所有倍数 $\lambda(x,y,1)$，它们是同一个点。平面 $w=1$ 上的两条平行线 $\mathbf m_1$（橙）和 $\mathbf m_2$（青）对应过原点的两个平面（阴影扇形）。这两个平面相交于红色射线 $(8,4,0)^\top$，它位于 $w=0$ 内，永远到达不了 $w=1$：这就是两条平行线相交的无穷远点。下：第 1.2 节的计算。过 $\mathbf a,\mathbf b$ 的 $\mathbf l_1$ 与过 $\mathbf c,\mathbf d$ 的 $\mathbf l_2$ 相交于 $\mathbf x\sim(2.5,2,1)$；平行线 $x-2y+1=0$ 与 $x-2y-3=0$ 相交于 $(8,4,0)$，即箭头所示的方向 $(2,1)$。" %}

### 1.2 直线、连线与交点

直线 $ax + by + c = 0$ 就是三维向量 $\mathbf l = (a, b, c)^\top$，同样只差一个比例因子。点在直线上，当且仅当

$$
\mathbf l^\top \tilde{\mathbf x} = a x_1 + b x_2 + c x_3 = 0 .
$$

这一个双线性方程带来两个非常有用的构造。过两点 $\tilde{\mathbf a}$ 和 $\tilde{\mathbf b}$ 的直线必须满足 $\mathbf l^\top \tilde{\mathbf a} = \mathbf l^\top \tilde{\mathbf b} = 0$，也就是 $\mathbf l$ 同时与两个向量正交，而叉积恰好做到这一点：

$$
\mathbf l = \tilde{\mathbf a} \times \tilde{\mathbf b}, \qquad \text{因为 } (\tilde{\mathbf a}\times\tilde{\mathbf b})^\top \tilde{\mathbf a} = 0 .
$$

把角色互换，用同样的论证可得：两条直线的交点是 $\tilde{\mathbf x} = \mathbf l_1 \times \mathbf l_2$。点和直线在这些公式里的地位是对称的（这叫**对偶性**，duality）：关于点的每个命题都有一个关于直线的孪生命题。

**算例。** 取 $\mathbf a = (1,1)$、$\mathbf b = (4,3)$、$\mathbf c = (1,3)$、$\mathbf d = (4,1)$。那么 $\mathbf l_1 = \tilde{\mathbf a} \times \tilde{\mathbf b} = (-2, 3, -1)$，即直线 $-2x + 3y - 1 = 0$（验证：$-2 + 3 - 1 = 0$，$-8 + 9 - 1 = 0$）。同理 $\mathbf l_2 = (2, 3, -11)$。它们的交点是 $\mathbf l_1 \times \mathbf l_2 = (-30, -24, -12) \sim (2.5, 2, 1)$，即点 $(2.5, 2)$。

```python
import numpy as np

def hom(p):                      # Euclidean -> homogeneous
    return np.append(np.asarray(p, float), 1.0)

def dehom(x):                    # homogeneous -> Euclidean (needs x[-1] != 0)
    return x[:-1] / x[-1]

a, b = hom([1, 1]), hom([4, 3])
c, d = hom([1, 3]), hom([4, 1])
l1 = np.cross(a, b)              # line through a and b
l2 = np.cross(c, d)              # line through c and d
x = np.cross(l1, l2)             # intersection of the two lines
print("l1 =", l1, " l2 =", l2)
print("x  =", x, "->", dehom(x))
print("incidence:", l1 @ x, l2 @ x)

# two parallel lines x - 2y + 1 = 0 and x - 2y - 3 = 0
m1, m2 = np.array([1.0, -2.0, 1.0]), np.array([1.0, -2.0, -3.0])
print("parallel lines meet at", np.cross(m1, m2))   # last entry 0: a point at infinity
# the line through two points at infinity is the line at infinity
print("line at infinity:", np.cross([2.0, 1.0, 0.0], [1.0, 0.0, 0.0]))
```

输出：`l1 = [-2. 3. -1.]`，`l2 = [2. 3. -11.]`，`x = [-30. -24. -12.] -> [2.5 2.]`，关联检验 `0.0 0.0`，两条平行线相交于 `[8. 4. 0.]`，无穷远直线为 `[0. 0. -1.]`。

### 1.3 无穷远点与无穷远直线

代码最后两行才是有意思的部分。两条平行线 $ax + by + c_1 = 0$ 和 $ax + by + c_2 = 0$ 在欧氏平面里没有交点，但它们的叉积完全有定义：

$$
(a, b, c_1) \times (a, b, c_2) = (c_2 - c_1)\,(b, -a, 0) \sim (b, -a, 0).
$$

结果的 $x_3 = 0$。这是一个**无穷远点**（point at infinity，也叫理想点），而 $(b, -a)$ 正是两条直线的公共方向。在图的上半部分，它就是位于 $w = 0$ 平面内、永远到不了 $w = 1$ 的那条射线。所有无穷远点都满足 $x_3 = 0$，即 $(0, 0, 1)\,\tilde{\mathbf x} = 0$，所以它们都落在同一条直线上，即**无穷远直线**（line at infinity）$\mathbf l_\infty = (0, 0, 1)^\top$（代码打印的是 $(0, 0, -1)$，是同一条直线）。

这不是记号上的小把戏。在图像中，只要相机不是恰好垂直于某个方向去看，这个方向的无穷远点就是一个真实、有限的像素：它就是平行线的像汇聚的**消失点**（vanishing point）。第 1.6 节会把它算出来。

### 1.4 射影空间 $\mathbb P^3$

把同样的构造提升一维，就得到**射影三维空间**：三维点 $(X, Y, Z)$ 写成 $\tilde{\mathbf X} = (X, Y, Z, 1)^\top$（同样只差比例），无穷远点 $(d_x, d_y, d_z, 0)^\top$ 是三维方向，平面 $\boldsymbol\pi^\top \tilde{\mathbf X} = 0$ 是四维向量 $\boldsymbol\pi = (n_x, n_y, n_z, -d)^\top$（单位法向 $\mathbf n$，到原点距离 $d$）。所有无穷远点都位于**无穷远平面** $\boldsymbol\pi_\infty = (0, 0, 0, 1)^\top$ 上。点 $(\mathbf X, 1)$ 与方向 $(\mathbf d, 0)$ 的区别你在图形学里已经见过：平移会移动点，但不会改变方向。

### 1.5 射影变换及其层级

平面上的**射影变换**（projective transformation，也叫单应，homography）是任意一个作用在齐次点上的可逆 $3 \times 3$ 矩阵 $H$：$\tilde{\mathbf x}' = H \tilde{\mathbf x}$。它有 $8$ 个自由度（9 个元素减去整体比例）。它把直线映射为直线：若 $\mathbf l^\top \tilde{\mathbf x} = 0$，则

$$
\mathbf l'^\top \tilde{\mathbf x}' = 0 \quad\text{其中}\quad \mathbf l' = H^{-\top} \mathbf l ,
$$

因为 $(H^{-\top}\mathbf l)^\top H \tilde{\mathbf x} = \mathbf l^\top H^{-1} H \tilde{\mathbf x} = 0$。点按 $H$ 变换，直线按逆转置变换；这与图形学中法向量的变换规则相同。

对 $H$ 加限制，就得到一族嵌套的群。越小的群保持的性质越多：

| 群 | 矩阵形式 | 自由度 | 保持的量 |
| --- | --- | --- | --- |
| 欧氏 $SE(2)$ | $\begin{pmatrix} R & \mathbf t \\\\ \mathbf 0^\top & 1 \end{pmatrix}$ | 3 | 长度、角度、面积 |
| 相似 $\mathrm{Sim}(2)$ | $\begin{pmatrix} sR & \mathbf t \\\\ \mathbf 0^\top & 1 \end{pmatrix}$ | 4 | 角度、长度之比 |
| 仿射 $\mathrm{Aff}(2)$ | $\begin{pmatrix} A & \mathbf t \\\\ \mathbf 0^\top & 1 \end{pmatrix}$ | 6 | 平行性、面积之比、无穷远直线 |
| 射影 $PGL(3)$ | $\begin{pmatrix} A & \mathbf t \\\\ \mathbf v^\top & v \end{pmatrix}$ | 8 | 共线性、关联关系、交比 |

区分射影与仿射的正是最后一行 $\mathbf v^\top$。仿射变换把无穷远点 $(d_1, d_2, 0)$ 映射到另一个无穷远点，所以平行线仍然平行。$\mathbf v \neq \mathbf 0$ 的射影变换把第三个坐标变成 $v\_1 d\_1 + v\_2 d\_2$，除了一个方向之外它都不为零：方向变成了一个有限点，平行线就在那里相交。（例外是仍留在无穷远处的那一个方向，它位于 $\mathbf l_\infty$ 的像上。右下角的元素 $v$ 通常被缩放为 1，但它也可能为 0，所以一般形式保留它。）

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-transform-hierarchy.svg" caption="同一个 $3\times 3$ 网格（虚线正方形、淡灰色线）和圆在每个群的一个变换下的样子；群名后面的数字是自由度。$\mathrm{SE}(2)$ 旋转 25° 并平移；$\mathrm{Sim}(2)$ 改为旋转 −25°，缩放 0.65 倍并平移；仿射变换带有剪切，圆变成椭圆，但红线之间仍然平行。只有射影变换（最后一行为 $(0.2, 0.25, 1)$）让每一族平行线汇聚（虚线延长）到一个有限点：红色族汇聚到 $H(1,0,0)^\top$，蓝色族汇聚到 $H(0,1,0)^\top$。" %}

单应并不只是抽象概念：针孔相机拍到的平面图像与平面本身之间就相差一个单应；同一平面的两张图像（或绕相机中心旋转的相机拍的两张图像）之间也相差一个单应。第 2 篇会用它从棋盘格图像中标定相机。

### 1.6 消失点、地平线以及用它们标定

现在可以解释铁轨为什么会汇聚了。提前借用第 2 节的结果，设相机为 $P = K[R \mid \mathbf t]$。过点 $\mathbf A$、方向为 $\mathbf d$ 的三维直线是 $\mathbf X(\lambda) = \mathbf A + \lambda \mathbf d$。在齐次坐标下

$$
P \begin{pmatrix} \mathbf A + \lambda\mathbf d \\ 1 \end{pmatrix}
= P \begin{pmatrix} \mathbf A \\ 1 \end{pmatrix} + \lambda\, P \begin{pmatrix} \mathbf d \\ 0 \end{pmatrix}
\;\xrightarrow{\;\lambda\to\infty\;}\; \sim P \begin{pmatrix} \mathbf d \\ 0 \end{pmatrix} = K R\,\mathbf d .
$$

所以方向 $\mathbf d$ 的**消失点**是

$$
\mathbf v = K R\, \mathbf d .
$$

它与 $\mathbf A$ 无关：所有方向为 $\mathbf d$ 的直线都汇聚到同一个像点。它与 $\mathbf t$ 也无关：平移相机永远不会移动消失点，这就是开车时月亮好像一直跟着你的原因。世界坐标轴的消失点就是 $P$ 的前三列。

单位法向为 $\mathbf n$ 的平面包含所有满足 $\mathbf d \perp \mathbf n$ 的方向，它们的消失点构成**消失线**（vanishing line）

$$
\mathbf l = K^{-\top} R\, \mathbf n ,
$$

因为 $\mathbf l^\top \mathbf v = \mathbf n^\top R^\top K^{-1} K R\,\mathbf d = \mathbf n^\top \mathbf d = 0$。对地面而言，这条线就是**地平线**（horizon）。

**用消失点标定。** 反投影一个像素，就得到它在相机坐标系中的射线方向：$\mathbf r = K^{-1}\tilde{\mathbf x}$。假设零倾斜、方形像素、主点 $\mathbf c$ 已知（下面会放松这个假设）。那么 $K^{-1}(u, v, 1)^\top = \big((u - c_x)/f,\ (v - c_y)/f,\ 1\big)^\top$，两个**正交**世界方向的消失点 $\mathbf v_1, \mathbf v_2$ 给出两条正交的射线：

$$
\frac{(\mathbf v_1 - \mathbf c)\cdot(\mathbf v_2 - \mathbf c)}{f^2} + 1 = 0
\quad\Longrightarrow\quad
f = \sqrt{-(\mathbf v_1 - \mathbf c)\cdot(\mathbf v_2 - \mathbf c)} .
$$

有三个两两正交的方向（盒子的棱、建筑物的 X、Y、Z 方向）时，就得到三个这样的方程。把其中两个相减得 $(\mathbf v_1 - \mathbf c)\cdot(\mathbf v_2 - \mathbf v_3) = 0$：主点位于三角形 $\mathbf v_1\mathbf v_2\mathbf v_3$ 过 $\mathbf v_1$ 的高线上，由对称性也位于另外两条高线上。**主点就是消失点三角形的垂心**，这是 Caprile 和 Torre（1990）用于标定的经典结论。

```python
import numpy as np

def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])

def rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

def camera_R(yaw, pitch, roll=0.0):
    """World-to-camera rotation. World: X east, Y north, Z up. Camera (OpenCV): x right,
    y down, z forward. yaw > 0 turns left, pitch > 0 looks up, roll > 0 turns the image
    clockwise. With all three zero the camera looks north with a level horizon."""
    R0 = np.array([[1.0, 0, 0], [0, 0, -1], [0, 1, 0]])   # rows: camera axes in world coordinates
    return rot_z(roll).T @ rot_x(-pitch) @ R0 @ rot_z(yaw).T

f, W, H = 800.0, 1280, 720
K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
R = camera_R(np.deg2rad(30), np.deg2rad(-15))     # turned 30 deg left, looking 15 deg down

V = K @ R                     # column i = vanishing point of world axis i (homogeneous)
vx, vy, vz = (V[:, i] / V[2, i] for i in range(3))
print("v_X =", vx[:2].round(1), " v_Y =", vy[:2].round(1), " v_Z =", vz[:2].round(1))

horizon = np.linalg.inv(K).T @ R @ np.array([0, 0, 1.0])   # vanishing line of the ground plane
print("horizon passes through v_X, v_Y:", np.allclose([horizon @ vx, horizon @ vy], 0))

# focal length from two orthogonal vanishing points (square pixels, zero skew, known c)
c = np.array([W / 2, H / 2])
f_est = np.sqrt(-(vx[:2] - c) @ (vy[:2] - c))
print("f from (v_X, v_Y):", f_est.round(3))

# with three finite vanishing points, c is the orthocentre of their triangle
A = np.array([vy[:2] - vz[:2], vx[:2] - vz[:2]])
b = np.array([(vy[:2] - vz[:2]) @ vx[:2], (vx[:2] - vz[:2]) @ vy[:2]])
print("orthocentre:", np.linalg.solve(A, b).round(3))
```

它打印出 $\mathbf v_X = (-794.5, 145.6)$、$\mathbf v_Y = (1118.2, 145.6)$ 和 $\mathbf v_Z = (640, 3345.6)$。三个中有两个落在 $1280\times 720$ 的图像之外，这很正常：像平面比传感器大得多。地平线经过 $\mathbf v_X$ 和 $\mathbf v_Y$（`True`），焦距恰好恢复为 $800.0$，垂心是 $(640, 360)$，即主点。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-vanishing-points.svg" caption="代码中的场景：地面网格和四个盒子，相机向左转 30°、向下倾 15°（$f=800$，黑框为 $1280\times720$ 的图像）。左：沿世界 $X$ 方向的棱（红）汇聚到 $\mathbf v_X=(-794.5,145.6)$，沿 $Y$ 方向的棱（绿）汇聚到 $\mathbf v_Y=(1118.2,145.6)$，两者都在地平线（紫，$v=145.6$）上。由于相机向下看，竖直的棱（蓝）向下汇聚到 $v=3346$ 处的 $\mathbf v_Z$，远在画面之下。右：三个消失点构成的三角形；三条高线（虚线）交于主点 $\mathbf c=(640,360)$。" %}

在下面的组件里动手试试。注意把相机放平（俯仰角为 0）时会发生什么：竖直的棱在图像中变为平行，$\mathbf v_Z$ 移到无穷远，此时用剩下的两个消失点只能恢复 $f$，无法恢复完整的主点。

{% include widget.liquid name="3d-vision-vanishing-points" height="720" caption="盒子场景的消失点。在视图中拖动可转动相机（左右为偏航，上下为俯仰），也可以使用滑块；深色矩形是图像，视图的其余部分是延伸的像平面。读数以齐次形式给出每个 $\mathbf v_i = KR\,\mathbf e_i$；位于无穷远的消失点第三个坐标为 0。比较由 $\mathbf v_X$ 和 $\mathbf v_Y$ 恢复的焦距与真实焦距，并观察消失点三角形的三条高线交于主点。" %}

## 2. 针孔相机

### 2.1 中心投影

把相机中心放在原点，沿 $+z$ 方向看。按照 OpenCV 的约定，相机坐标系的 $x$ 向右、$y$ **向下**、$z$ 向前（其他约定见第 4 节）。该坐标系中的点 $\mathbf X_c = (X, Y, Z)$ 与中心之间连一条射线，这条射线与平面 $z = 1$（**归一化像平面**，normalized image plane）的交点由相似三角形给出：

$$
x = \frac{X}{Z}, \qquad y = \frac{Y}{Z} .
$$

真实的针孔相机在小孔后方距离 $F$ 处形成倒立的像；把一个虚拟像平面放在中心前方，就去掉了翻转而不改变其他任何东西。在齐次坐标下，投影是线性的：

$$
Z \begin{pmatrix} x \\ y \\ 1 \end{pmatrix} = \begin{pmatrix} 1 & 0 & 0 & 0 \\ 0 & 1 & 0 & 0 \\ 0 & 0 & 1 & 0 \end{pmatrix}
\begin{pmatrix} X \\ Y \\ Z \\ 1 \end{pmatrix} = [I \mid \mathbf 0]\, \tilde{\mathbf X}_c .
$$

深度丢失了：射线 $\lambda \mathbf X_c$ 上的每个点都落在同一个 $(x, y)$ 上。把它找回来，正是本系列其余部分要做的事。

### 2.2 内参：从米到像素

传感器测量的是像素，而不是归一化坐标。设镜头焦距为 $F$（单位 mm），方形像素的边长（像元尺寸）为 $p$（单位 mm），那么归一化坐标 $x$ 对应到离光轴 $F x$ mm，也就是 $F x / p$ 个像素。再加上光轴所在的像素位置，得到

$$
u = f_x\, x + s\, y + c_x, \qquad v = f_y\, y + c_y, \qquad
K = \begin{pmatrix} f_x & s & c_x \\ 0 & f_y & c_y \\ 0 & 0 & 1 \end{pmatrix},
$$

其中有五个**内参**（intrinsic parameters）：

- $f_x = F / p_x$ 和 $f_y = F / p_y$：以像素为单位的焦距。只有在像素不是正方形，或图像被各向异性地重采样时，二者才不同。
- $(c_x, c_y)$：**主点**（principal point），光轴与传感器的交点；接近图像中心，但很少恰好在中心。
- $s$：**倾斜**（skew），只有传感器两轴不垂直时才非零。几乎所有现代相机的 $s$ 都是 $0$，但对于被裁剪或带剪切校正过的图像要留个心眼。

于是 $\tilde{\mathbf u} \sim K \mathbf x$；反方向的**反投影**（back-projection）是 $K^{-1}\tilde{\mathbf u}$：一个像素的射线方向。水平视场角可以从图像宽度 $W$ 求出：主点居中时 $\theta_x = 2\arctan\\!\big(W / (2 f_x)\big)$。

**算例。** 焦距 $F = 4.0$ mm 的镜头配上像元为 $1.6\ \mu$m 的传感器，得到 $f = 4.0 / 0.0016 = 2500$ 像素。对于 $4000 \times 3000$、$(c_x, c_y) = (2000, 1500)$ 的图像，水平视场角为 $2\arctan(2000/2500) = 77.3°$。点 $\mathbf X_c = (0.5, -0.2, 4.0)$ m 的归一化坐标为 $(x, y) = (0.125, -0.05)$，落在 $u = 2500 \cdot 0.125 + 2000 = 2312.5$，$v = 2500 \cdot (-0.05) + 1500 = 1375$。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-intrinsics.svg" caption="每个内参对同一块棋盘格（8×6 个 10 cm 方格，距离 1.2 m，转过 25°）在 640×480 图像（紫框）中的像的影响；红色十字是主点。更大的 $f$ 以主点为中心放大；$f_y=0.8f_x$ 在竖直方向压扁；移动 $(c_x,c_y)$ 平移图像而不改变形状；倾斜 $s=150$ 让每一行按 $y$ 成比例地横向错开。最后一幅保持 $K$ 不变而旋转相机（$R$ 是外参）：棋盘格的透视关系改变了，这是改变 $K$ 无论如何也做不到的。" %}

图中最后一幅蕴含一个重要结论。改变 $K$ 只是对图像做一个二维仿射变形（最后一行为 $(0, 0, 1)$ 的单应），除了哪些点落在图像边框之内以外，它永远不会改变哪些三维点位于同一条射线上、哪个表面遮挡哪个表面。改变位姿才会改变透视本身。

### 2.3 外参：相机在哪里

世界中的点很少直接以相机坐标给出。**外参**（extrinsics）是从世界到相机的刚体变换，

$$
\mathbf X_c = R\, \mathbf X_w + \mathbf t ,
$$

其中旋转 $R \in SO(3)$（3 个自由度），平移 $\mathbf t$（3 个自由度）。$R$ 的三行可以读作相机的 $x$、$y$、$z$ 轴在世界坐标中的表示。**相机中心**是映射到相机原点的世界点：$R\mathbf C + \mathbf t = \mathbf 0$，因此 $\mathbf C = -R^\top \mathbf t$。注意 $\mathbf t$ *不是*相机的位置，而是世界原点在相机坐标系中的坐标。把 $\mathbf t$ 和 $\mathbf C$ 搞混是最常见的位姿 bug 之一；另一大类是坐标约定混用，那是第 4 节的主题。

### 2.4 相机矩阵 $P = K[R \mid \mathbf t]$ 及其含义

把三步串起来，就得到完整的针孔相机：

$$
\lambda \begin{pmatrix} u \\ v \\ 1 \end{pmatrix} = K \,[R \mid \mathbf t] \begin{pmatrix} \mathbf X_w \\ 1 \end{pmatrix} = P\,\tilde{\mathbf X}_w,
\qquad \lambda = Z_c \;(\text{深度}).
$$

$P$ 是 $3\times 4$ 矩阵，有 11 个自由度（12 个元素减去比例）：5 个内参，6 个外参。反过来，任何左边 $3\times 3$ 块 $M$ 可逆的 $3\times 4$ 矩阵都是一台有限射影相机，并且可以拆回 $K$、$R$ 和 $\mathbf t$（第 2.5 节）。记 $P = [M \mid \mathbf p_4]$，三行分别为 $\mathbf p^{1\top}, \mathbf p^{2\top}, \mathbf p^{3\top}$。从 $P$ 中可以直接读出很多几何信息：

- **相机中心。** $P\tilde{\mathbf C} = \mathbf 0$：中心是 $P$ 的右零向量，$\mathbf C = -M^{-1}\mathbf p_4$。它是唯一没有像的点。
- **列。** 前三列是 $P(\mathbf e_i, 0)^\top$：世界 $X$、$Y$、$Z$ 轴的消失点（第 1.6 节）。第四列是世界原点的像。
- **行是平面。** $\mathbf p^{1\top}\tilde{\mathbf X} = 0$ 意味着 $u \cdot \lambda = 0$：这是过中心、投影到图像列 $u = 0$ 的平面。同理 $\mathbf p^{2}$ 是图像行 $v = 0$ 对应的平面，$\mathbf p^{3}$ 是过中心且平行于像平面的**主平面**（principal plane），即深度为 $0$ 的点，它们投影到无穷远。
- **主轴。** $M$ 的第三行 $\mathbf m^3$ 是主平面的法向，因此沿光轴方向。由于 $P$ 只确定到比例（包括符号），观察方向是 $\det(M)\,\mathbf m^3$。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-camera-matrix.svg" caption="下一段代码中的相机，$\mathbf C=(1,-0.6,-3)$，朝向世界原点（坐标轴 $X$、$Y$、$Z$；OpenCV 的世界坐标 $y$ 向下，图中把 $-Y$ 画成向上）。紫色四边形是深度为 1 处的图像矩形。红色平面是 $\mathbf p^{1\top}\mathbf X=0$，即过 $\mathbf C$ 和图像左边缘 $u=0$ 的平面；绿色平面是 $\mathbf p^{2\top}\mathbf X=0$，过上边缘 $v=0$；蓝色平面是主平面 $\mathbf p^{3\top}\mathbf X=0$（深度为零）。箭头是主轴 $\mathbf m^3=(-0.311,0.186,0.932)$。绘图脚本断言了每个平面上画出的每一个点都使 $P$ 的对应行为零。" %}

### 2.5 拆开 $P$：RQ 分解

很多时候你手里只有 $P$：来自 DLT 估计（第 2 篇）、来自某个数据集，或者来自 OpenGL 引擎。要恢复 $K$、$R$ 和 $\mathbf t$，先看左边的块：$M = K R$，一个上三角矩阵乘一个正交矩阵。这正是 **RQ 分解**，也就是我们熟悉的 QR 分解的镜像。它在符号意义下唯一：插入 $D = \mathrm{diag}(\pm1, \pm1, \pm1)$ 写成 $M = (KD)(DR)$ 同样是合法的分解，因为 $D^2 = I$。我们通过要求 $K$ 的对角线为正来固定符号。还有一个细节：$P$ 只确定到比例，而这个比例可能是负的。若 $\det M < 0$，就会得到 $\det R = -1$，即一个反射，所以要先把 $P$ 取反。最后由 $\mathbf p_4 = K\mathbf t$ 得到 $\mathbf t$，并把 $K$ 归一化使 $K_{33} = 1$。

```python
import numpy as np
from scipy.linalg import rq

def decompose_P(P):
    """Split a 3x4 camera matrix (known only up to scale and sign) into K, R, t and C."""
    P = P if np.linalg.det(P[:, :3]) > 0 else -P   # det(M) > 0  <=>  det(R) = +1
    K, R = rq(P[:, :3])                            # M = K R, K upper triangular, R orthogonal
    S = np.diag(np.sign(np.diag(K)))               # S @ S = I: flip signs so diag(K) > 0
    K, R = K @ S, S @ R
    t = np.linalg.solve(K, P[:, 3])                # p4 = K t (before rescaling K)
    K = K / K[2, 2]
    C = -R.T @ t                                   # camera centre, also the null vector of P
    return K, R, t, C

# a ground-truth camera: 640x480, fx = 800, fy = 780, skew 2, looking at the origin from C
K_true = np.array([[800.0, 2.0, 330.0], [0, 780.0, 245.0], [0, 0, 1]])
C_true = np.array([1.0, -0.6, -3.0])
z = -C_true / np.linalg.norm(C_true)                       # forward: towards the origin
x = np.cross(z, [0, -1.0, 0]); x /= np.linalg.norm(x)     # right ("up" is -y in OpenCV)
R_true = np.stack([x, np.cross(z, x), z])                 # rows: camera axes in world coordinates
t_true = -R_true @ C_true
P = -3.7 * K_true @ np.c_[R_true, t_true]                 # arbitrary (negative) scale

K, R, t, C = decompose_P(P)
print("K =\n", K.round(4))
print("R error:", np.abs(R - R_true).max(), " det R:", np.linalg.det(R).round(6))
print("C =", C.round(6), " P @ [C, 1] =", (P @ np.append(C, 1)).round(9))
print("principal axis m3 =", R[2].round(4))
```

即使乘上了任意因子 $-3.7$，分解也精确地返回了 $K$（`[[800, 2, 330], [0, 780, 245], [0, 0, 1]]`），$R$ 的误差在 $2\times10^{-16}$ 以内且 $\det R = 1$，中心为 $(1, -0.6, -3)$ 且 $P\tilde{\mathbf C} = \mathbf 0$，主轴为 $(-0.3107, 0.1864, 0.9321)$，与构造一致，从 $\mathbf C$ 指向原点。如果不处理符号，就会得到焦距为负的 $K$，或者行列式为 $-1$ 的"旋转"；这两种情况在处理其他工具导出的矩阵时都会真实发生。

### 2.6 透视减弱时：仿射相机

如果场景的深度范围远小于它的距离（长焦拍摄、卫星图像），所有点的深度都近似为 $Z \approx Z_0$，投影就近似变成线性的：$u \approx (f/Z_0) X + c_x$。这种**弱透视**（weak perspective）相机，或更一般的**仿射相机**（affine camera），其 $P$ 的最后一行为 $(0, 0, 0, 1)$：平行线保持平行，没有有限的消失点。它是经典的运动恢复结构因子分解方法背后的相机模型，也是一个有用的警示信号：如果场景中平行线的像几乎不汇聚（所有消失点都远在图像之外），这些视图就接近仿射，能约束深度的透视线索很弱。

## 3. 镜头畸变

### 3.1 Brown-Conrady 模型

真实镜头不是针孔。尤其是广角镜头，会把图像边缘附近的直线弄弯。标准模型来自 Conrady（1919）和 Brown（1966），OpenCV 以及 COLMAP 的 `OPENCV` 相机都采用它。它在乘 $K$ 之前，对**归一化**坐标 $(x, y) = (X/Z, Y/Z)$ 施加一个非线性映射：

$$
\begin{aligned}
x_d &= x\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + 2p_1 xy + p_2 (r^2 + 2x^2),\\
y_d &= y\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + p_1 (r^2 + 2y^2) + 2p_2 xy,
\end{aligned}
\qquad r^2 = x^2 + y^2,
$$

然后 $u = f_x x_d + s\, y_d + c_x$，$v = f_y y_d + c_y$。**径向**项 $k_i$ 描述关于光轴旋转对称的镜头：$k_1 < 0$ 是**桶形**畸变（点被拉向中心），$k_1 > 0$ 是**枕形**畸变。**切向**项 $p_1, p_2$ 描述相对传感器略有偏心或倾斜的镜头。OpenCV 的完整模型还加入了有理径向因子（$k_4$ 到 $k_6$）、薄棱镜项和传感器倾斜，共 14 个系数。大多数标定只用 $(k_1, k_2, p_1, p_2)$，只有强广角镜头才加 $k_3$。[神经渲染第 1 篇]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})展示了桶形和枕形畸变如何扭曲网格；这里我们关注使用这个模型时真正要紧的性质。

**多项式只在标定过的范围内可信。** 看径向曲线 $r_d = r(1 + k_1 r^2 + k_2 r^4)$。对于桶形畸变，它最终会停止增长并折返，于是两条不同的射线映射到同一个像素，模型不再可逆。取 $k_1 = -0.4$（$k_2 = 0$），折返发生在 $dr_d/dr = 1 + 3k_1 r^2 = 0$ 处，即 $r = 1/\sqrt{1.2} = 0.913$，对应视场角 $\arctan(0.913) = 42.4°$。视场更宽的镜头根本无法用这组系数描述；而一次在数据范围之外外推的标定，可能在图像角落里就出现这种行为。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-distortion-radial.svg" caption="左：径向曲线 $r_d(r)$。无畸变时（灰）$r_d=r$；紫色曲线是下一段代码中的镜头（$k_1=-0.28$，$k_2=0.07$），在整个范围内单调；$k_1=-0.4$（红）在 $r=0.913$ 处折返，超出这一点模型就没有意义；$k_1=+0.2$（蓝）是枕形。点线标出 $f=600$ 时 640×480 图像角点的位置 $r=0.667$。右：对该镜头的三个点，代码中不动点去畸变的误差随迭代次数 $n$ 的变化；收敛是线性的（对数坐标下为直线），离中心越远的点收敛越慢（$r=0.18$、$0.63$、$0.89$）。" %}

### 3.2 点的去畸变与图像的去畸变

"去畸变"有两种不同的操作，它们需要模型的相反方向。

**点**（用于几何计算的特征点位置）：我们观测到畸变后的 $(x_d, y_d)$，需要理想的 $(x, y)$，也就是上面映射的逆，它没有闭式解。一个简单的不动点迭代就很好用：从 $(x, y) = (x_d, y_d)$ 出发，在当前猜测处计算径向因子和切向偏移，把它们固定住后从正向方程中解出 $(x, y)$。OpenCV 的点去畸变也采用同类迭代。

```python
import numpy as np

def distort(x, y, k1=0.0, k2=0.0, p1=0.0, p2=0.0, k3=0.0):
    """Brown-Conrady (OpenCV order k1, k2, p1, p2, k3) on normalized coordinates."""
    r2 = x * x + y * y
    radial = 1 + k1 * r2 + k2 * r2**2 + k3 * r2**3
    xd = x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x)
    yd = y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y
    return xd, yd

def undistort(xd, yd, iters=20, **coef):
    """Invert distort() by fixed-point iteration: x = (x_d - tangential(x)) / radial(x)."""
    x, y = xd, yd                                      # initial guess: no distortion
    for _ in range(iters):
        r2 = x * x + y * y
        radial = 1 + coef.get("k1", 0) * r2 + coef.get("k2", 0) * r2**2 + coef.get("k3", 0) * r2**3
        dx, dy = distort(x, y, p1=coef.get("p1", 0), p2=coef.get("p2", 0))
        x = (xd - (dx - x)) / radial                   # dx - x is the tangential part
        y = (yd - (dy - y)) / radial
    return x, y

coef = dict(k1=-0.28, k2=0.07, p1=0.001, p2=-0.0005)   # a wide-angle lens (illustrative values)
x0, y0 = 0.50, 0.38                   # near the corner of a 640 x 480 image with f = 600
xd, yd = distort(x0, y0, **coef)
for n in (1, 2, 5, 10, 20):
    xu, yu = undistort(xd, yd, iters=n, **coef)
    print(f"{n:2d} iterations: error {np.hypot(xu - x0, yu - y0):.2e}")
print("distorted:", round(xd, 4), round(yd, 4), " shift in pixels at f = 600:",
      round(600 * np.hypot(xd - x0, yd - y0), 1))
```

这个镜头把靠近图像角的点移动了 $37.4$ 像素，移到 $(0.4502, 0.3427)$。迭代 1、2、5、10、20 次后的去畸变误差分别为 $1.2\times10^{-2}$、$2.3\times10^{-3}$、$1.7\times10^{-5}$、$4.9\times10^{-9}$ 和 $5.2\times10^{-16}$：每一步大致缩小一个固定的倍数。在 $f = 600$ 时，迭代 5 次还剩 $10^{-2}$ 像素，对多数用途足够，但对强畸变镜头的外侧角落则不够；所以与其相信固定的迭代次数，不如检查残差。

**图像**（为假设针孔相机的算法准备一张针孔图像，比如原版 3DGS 的光栅化器）：对*输出*（去畸变后）图像的每个像素，计算它来自拍摄图像的哪个位置，再在那里采样。这只需要**正向**模型 `distort`，所以图像去畸变既快又精确（`cv2.initUndistortRectifyMap` 加 `cv2.remap`）。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-distortion-image.svg" caption="代码中的镜头作用在 $f=600$ 的 640×480 图像上。(a) 一张平面棋盘格（方格 40 像素）的合成拍摄图像：桶形畸变把外侧的方格弄弯了。渲染它需要逆模型，每个像素做一次 `undistort`。(b) 校正后的图像，只用正向模型算出：把每个输出像素做畸变，再到拍摄图像 (a) 的对应位置采样；方格又变回了正方形。(c) 以像素为单位的位移 $f\,\Vert\mathbf x_d-\mathbf x\Vert$，等值线为 2、5、10、20、30 像素；角落处达到 44.8 像素，叉号是代码中的那个点（37.4 像素）。" %}

一个实际后果：在桶形畸变下，校正图像的角落来自拍摄画面的*内部*，而拍摄画面的角落映射到校正图像的*外部*。你必须在裁剪（所有输出像素有效）和保留所有输入像素（出现黑边）之间做选择；`cv2.getOptimalNewCameraMatrix` 正是通过 `alpha` 参数暴露这个权衡，并返回校正图像的新 $K$。

### 3.3 鱼眼镜头与 Kannala-Brandt 模型

针孔把与光轴成 $\theta$ 角的射线映射到图像上半径 $r = f\tan\theta$ 处。当 $\theta \to 90°$ 时它发散：取 $f = 300$ 像素，60°、80° 和 89° 的射线分别落在离中心 520、1701 和 17187 像素处。没有传感器能这样容纳 180° 的视野，对 $\tan\theta$ 做多项式修正也无济于事。鱼眼镜头是围绕其他**投影函数** $r(\theta)$ 设计的：

| 投影 | $r(\theta)$ | 典型用途 |
| --- | --- | --- |
| 透视（针孔） | $f\tan\theta$ | 普通镜头；不适合极宽视场 |
| 等距 | $f\theta$ | 很多鱼眼镜头；半径与角度成正比 |
| 等立体角 | $2f\sin(\theta/2)$ | 等面积鱼眼 |
| 体视（球极） | $2f\tan(\theta/2)$ | 保持局部形状（共形） |
| 正交 | $f\sin\theta$ | 限于 180° |

Kannala 和 Brandt（2006）提出用一个关于角度的奇次多项式来描述上述任何一种投影，以及介于它们之间的真实镜头：

$$
r(\theta) = f\,\theta_d, \qquad \theta_d = \theta\,(1 + k_1\theta^2 + k_2\theta^4 + k_3\theta^6 + k_4\theta^8),
\qquad \theta = \operatorname{atan2}\!\big(\sqrt{X^2 + Y^2},\, Z\big),
$$

像素为 $u = f_x\,\theta_d \cos\varphi + c_x$，$v = f_y\,\theta_d \sin\varphi + c_y$，方位角 $\varphi = \operatorname{atan2}(Y, X)$ 保持不变。这正是 OpenCV `cv::fisheye` 模块和 COLMAP `OPENCV_FISHEYE` 相机所用的模型。它之所以有效有两点原因。第一，它是 $\theta$ 的多项式，而不是 $\tan\theta$ 的多项式，所以在 90° 及以外仍然有限。第二，因为 $\theta = \operatorname{atan2}(\rho, Z)$ 是由三维射线而不是由 $X/Z$ 计算的，它能处理 $Z \le 0$、位于像平面后方的射线，而针孔模型连表达都做不到。这是公式本身的性质，并非每个实现都具备：OpenCV 的 `cv::fisheye` 函数以归一化坐标 $(X/Z, Y/Z)$ 为输入，再计算 $\theta = \arctan r$；COLMAP 的鱼眼模型同样先除以 $Z$，并拒绝 $Z \le 0$ 的点。因此在这些库中，该模型只覆盖相机前方的射线（视场小于 180°）。对于更广角的镜头，应像下面的代码那样用 `atan2` 从射线直接投影。

```python
import numpy as np

def project_kb(Xc, K, k):
    """Kannala-Brandt / OpenCV fisheye: r_d = theta (1 + k1 theta^2 + ... + k4 theta^8)."""
    rho = np.hypot(Xc[:, 0], Xc[:, 1])
    theta = np.arctan2(rho, Xc[:, 2])                  # angle to the optical axis, also > 90 deg
    t2 = theta**2
    theta_d = theta * (1 + k[0] * t2 + k[1] * t2**2 + k[2] * t2**3 + k[3] * t2**4)
    phi = np.arctan2(Xc[:, 1], Xc[:, 0])               # the azimuth is unchanged
    xd, yd = theta_d * np.cos(phi), theta_d * np.sin(phi)
    return np.c_[K[0, 0] * xd + K[0, 1] * yd + K[0, 2], K[1, 1] * yd + K[1, 2]]

# a 190-degree equisolid lens r = 2 f sin(theta / 2), fitted by the 4 KB coefficients
f = 300.0
theta = np.linspace(0, np.deg2rad(95), 200)
r_true = 2 * f * np.sin(theta / 2)
A = f * np.stack([theta**3, theta**5, theta**7, theta**9], 1)   # r = f (theta + k1 theta^3 + ...)
k = np.linalg.lstsq(A, r_true - f * theta, rcond=None)[0]
print("k =", k.round(6))
print(f"max fit error: {np.abs(f * theta + A @ k - r_true).max():.1e} px")
print("pinhole radius at 60/80/89 deg:", (f * np.tan(np.deg2rad([60, 80, 89]))).round(0))

# a ray 95 degrees off the axis (behind the plane Z = 0) still lands in the image
K = np.array([[f, 0, 640.0], [0, f, 480.0], [0, 0, 1]])
X = np.array([[np.sin(np.deg2rad(95)), 0.0, np.cos(np.deg2rad(95))]])
print("pixel of a ray at 95 deg:", project_kb(X, K, k).round(1))
```

由于 $r = f(\theta + k_1\theta^3 + \dots)$ 关于 $k_i$ 是线性的，拟合一条镜头曲线就是一个线性最小二乘问题。对于等立体角镜头，拟合结果是 $k = (-0.041667, 0.000521, -0.000003, 0)$，在 0 到 95° 上的最大误差为 $6.2\times10^{-9}$ 像素。在打印的位数内，这正是 $2\sin(\theta/2) = \theta - \theta^3/24 + \theta^5/1920 - \dots$ 的泰勒系数：Kannala-Brandt 就是镜头投影函数的截断泰勒级数。偏离光轴 95° 的射线（$Z < 0$）落在像素 $(1082.4, 480.0)$。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-fisheye-models.svg" caption="左：五种投影函数，纵轴为 $r/f$，横轴为视场角 $\theta$。针孔 $f\tan\theta$ 在 90° 处发散（点线）；鱼眼模型保持有限，正交投影止于 90°。右：四系数 Kannala-Brandt 拟合的最大误差（代码中的最小二乘，$f=300$，0 到 95°）：等立体角镜头为 $6.2\times10^{-9}$ 像素，正交为 $6.1\times10^{-6}$ 像素，体视投影为 $6.3\times10^{-3}$ 像素，因为它的泰勒级数收敛得更慢。三者都远低于任何真实标定的噪声。" %}

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-fisheye-room.svg" caption="相机位于一个立方体中心，六面墙贴着颜色不同的棋盘格，通过对每个像素反投影渲染到 420×420 的传感器上。90° 的针孔（$f=210$）恰好看到正前方的墙。150° 的针孔（$f=56$）也能看到侧墙，但把它们拉伸得非常厉害：$r=f\tan\theta$ 把传感器的大部分面积花在外侧的角度上，而前墙缩成了一个小方块。180° 的等距鱼眼（$f=134$，$r=f\theta$）把传感器平均分配给各个角度，在像圈中显示出五面墙；直的棱变成了曲线。" %}

有了这些投影模型，下面的组件把目前为止的内容全部组合起来：内参、两种畸变模型、棋盘格图像以及三维中的真实视场。

{% include widget.liquid name="3d-vision-camera-model" height="900" caption="交互式相机模型。调节内参和畸变系数，观察 12×9 棋盘格在 640×480 图像中的像；橙色虚线轮廓是同一块棋盘格经过相同 $K$ 的纯针孔投影的结果。3D 视图（宽屏时在左侧，手机上在上方）中的紫色视锥是当前模型真正看到的视场，通过对图像边界反投影求得（Brown-Conrady 用不动点迭代，Kannala-Brandt 用牛顿法）。试试“桶形”预设，并把 $k_1$ 继续调负，直到棋盘格的一部分在多项式折返处消失；再切换到“鱼眼”预设，看水平视场超过 180°：相机能看到自己略微后方的东西。" %}

### 3.4 其他广角模型与通用模型

Kannala-Brandt 不是唯一的选择。**统一相机模型**（unified camera model；Geyer 和 Daniilidis 在 ECCV 2000 中为折反射相机提出，Mei 和 Rives 在 ICRA 2007 中加入畸变项并给出基于平面标定板的标定方法）先把点投影到单位球上，再从沿光轴平移后的一点做透视投影，它也能描述折反射（带反射镜的）相机；**双球模型**（double sphere，Usenko、Demmel、Cremers，3DV 2018）使用两个球，对大视场镜头的拟合效果相当，并且有闭式逆，这在投影和反投影要执行数百万次的视觉里程计中很重要。Devernay 和 Faugeras（2001）利用了我们一开始提到的性质——针孔相机把直线映射为直线——不用标定板就能估计畸变。另一个极端是**通用**（generic）相机模型，它放弃参数化形式，直接存储一个稠密的射线方向网格；Schöps 等人（CVPR 2020）认为，这种拥有数千个参数的模型对真实镜头的标定明显比常用的十二个参数更准确。第 2 篇会回到这些模型如何估计的问题。

### 3.5 卷帘快门

大多数 CMOS 传感器并不同时曝光所有行。**卷帘快门**逐行读出图像，所以第 $v$ 行的拍摄时刻是

$$
t(v) = t_0 + \frac{v}{H}\,\tau ,
$$

其中 $\tau$ 是一帧的读出时间（通常为几毫秒到几十毫秒）。如果相机在读出期间运动，每一行都来自一个略有不同的位姿：$\mathbf X_c(v) = R(t(v))\,\mathbf X_w + \mathbf t(t(v))$。摇镜头时竖直的结构会倾斜，振动时物体会抖动（"果冻效应"），高速旋转的螺旋桨会变成弯曲的桨叶。从几何上说，图像不再是中心投影；Meingast、Geyer 和 Sastry（2005）详细分析了这一模型。

投影变成了一个隐式方程，因为点出现在哪一行取决于位姿，而位姿又取决于行号：$v = \pi_v\big(P(t(v))\,\tilde{\mathbf X}\big)$。对于中等速度的运动，不动点迭代几步就能解出。

```python
import numpy as np

def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

f, W, H = 1000.0, 1920, 1080
K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
readout = 0.030                       # seconds from the first to the last row
omega = np.deg2rad(60.0)              # pan rate (rad/s) about the camera y axis

def project_rs(X, iters=10):
    """Rolling-shutter projection of one world point: row v is exposed at t = readout * v / H,
    so the pixel must satisfy v = proj_v(R(t(v)) X). Solve by fixed-point iteration."""
    v = H / 2
    for _ in range(iters):
        t = readout * v / H
        x = K @ (rot_y(-omega * t) @ X)          # camera turned by omega * t
        u, v = x[0] / x[2], x[1] / x[2]
    return u, v

# a vertical pole 5 m ahead, from 2.5 m above to 2.5 m below the optical axis
for Y in (-2.5, 0.0, 2.5):
    X = np.array([0.0, Y, 5.0])
    u_gs = (K @ X)[0] / 5.0                     # global shutter (t = 0 for every row)
    u, v = project_rs(X)
    print(f"Y = {Y:+.1f} m: row {v:7.1f}, u_global = {u_gs:.1f}, u_rolling = {u:.1f}")
print(f"rotation during readout: {np.rad2deg(omega * readout):.2f} deg = {f * np.tan(omega * readout):.1f} px at the centre")
```

读出时间 30 ms、以 60°/s 的中等速度向右摇镜头时，一根在全局快门下成像于 $u = 960$ 的竖杆，在第 40 行出现在 $u = 958.8$，在第 540 行出现在 $944.3$，在第 $1040.2$ 行出现在 $929.7$：它在 1000 行内倾斜了 29 像素。整个读出期间相机转过 $1.80°$，在图像中心相当于 $31.4$ 像素；$31.4 \cdot 1000/1080 = 29.1$ 像素，正好与倾斜量吻合。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-rolling-shutter.svg" caption="左：1920×1080 图像中前方 8 m 处的七根竖杆（$f=1000$，读出 30 ms），分别为全局快门（灰）、以 60°/s（紫）和 240°/s（橙）向右摇镜头时的卷帘快门。越晚曝光的行看到的场景越靠左。右：代码中那根竖杆相对全局快门图像的水平位移，纵轴为行号（右侧纵轴为该行的曝光时刻），分别对应 60、120、240°/s。在第 40 行和第 1040 行之间，竖杆分别倾斜 29.1、58.3 和 117.3 像素；位移随该行曝光时刻几乎线性增长。" %}

哪怕只有几个像素的系统误差，也会让位姿估计产生偏差，所以只要相机运动得快，卷帘快门就很重要：手机、无人机、头戴相机。考虑卷帘快门的光束法平差（Hedborg 等，CVPR 2012）利用视频中运动的连续性：每一行的位姿在相邻两帧的位姿之间插值，相比经典光束法平差只多出六个参数；视觉惯性系统则用 IMU 预测一帧之内的运动。这也是跟踪相机常常采用全局快门传感器的原因之一。

## 4. 坐标约定

上面的一切都使用 OpenCV 的相机坐标系。其他软件使用其他坐标系，一条不加转换就混用它们的流水线会产生错误、但往往看起来还挺合理的结果。本节是一份你会反复回来查阅的参考。

### 4.1 相机坐标系

| 约定 | $x$ | $y$ | $z$ | 相机朝向 | 使用者 |
| --- | --- | --- | --- | --- | --- |
| OpenCV / COLMAP | 右 | 下 | 前 | $+z$ | OpenCV、COLMAP、3DGS（内部）、ROS 光学坐标系 |
| OpenGL / Blender / NeRF | 右 | 上 | 后 | $-z$ | OpenGL、Blender、NeRF 的 `transforms.json`、nerfstudio |
| LLFF | 下 | 右 | 后 | $-z$ | LLFF 及前向（forward-facing）NeRF 场景的 `poses_bounds.npy` |
| PyTorch3D | 左 | 上 | 前 | $+z$ | PyTorch3D 相机 |

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-conventions.svg" width="80%" caption="同一台物理相机，朝纸面里面看（紫色图像矩形），用四种约定描述。四个坐标系都是右手系；它们的区别只在于把相机的哪根轴叫作 $x$、$y$、$z$。OpenCV 与 OpenGL 之间的转换翻转 $y$ 和 $z$；LLFF 的列依次是（下、右、后）；PyTorch3D 相对 OpenCV 翻转 $x$ 和 $y$。" %}

四个坐标系都是右手系，所以每种转换都是相机自身坐标轴的一个旋转：对相机到世界矩阵右乘（或对世界到相机矩阵左乘）一个固定矩阵。OpenCV 到 OpenGL 是 $\mathrm{diag}(1, -1, -1)$。**世界**坐标系是另一个独立的选择。Blender 和许多机器人软件栈是 $Z$ 轴向上；ROS（REP 103）对机体使用 $x$ 向前、$y$ 向左、$z$ 向上，并为相机单独定义一个使用 OpenCV 坐标轴的 `_optical` 坐标系；COLMAP 的世界坐标系则是重建过程恰好得到的样子。

### 4.2 位姿：世界到相机，还是相机到世界

位姿可以按两个方向之一存储：

$$
T_{w2c} = \begin{pmatrix} R & \mathbf t \\ \mathbf 0^\top & 1 \end{pmatrix},
\qquad
T_{c2w} = T_{w2c}^{-1} = \begin{pmatrix} R^\top & \mathbf C \\ \mathbf 0^\top & 1 \end{pmatrix}, \quad \mathbf C = -R^\top\mathbf t .
$$

$T_{c2w}$ 的各列是相机坐标轴和相机中心在世界坐标中的表示，方便在场景里摆放相机，所以 NeRF 风格的数据集存储 $T_{c2w}$。COLMAP 的 `images.txt` 存储 $T_{w2c}$，形式为单位四元数 `QW QX QY QZ`（标量在前，Hamilton 约定）和平移 `TX TY TZ`。四元数的顺序本身也是个陷阱：SciPy 的 `Rotation.from_quat` 默认期望标量在后的 $(x, y, z, w)$，而 Eigen 的 `Quaternion(w, x, y, z)` 构造函数参数是标量在前，内部存储的系数却是标量在后。

### 4.3 像素与图像坐标

连像素网格都有约定。在 OpenCV 中，整数坐标是像素**中心**：左上角像素的中心在 $(0, 0)$。COLMAP 把图像原点放在左上**角**，所以左上像素的中心是 $(0.5, 0.5)$，同一个镜头满足 $c_x^{\text{COLMAP}} = c_x^{\text{OpenCV}} + 0.5$。OpenGL 的窗口坐标从左下角开始、$y$ 向上，其归一化设备坐标从 $-1$ 到 $1$。这些半像素偏移和翻转在粗略的目视检查中看不出来，只会表现为系统性的亚像素误差，或者一张上下颠倒的图像。

### 4.4 代码：把 COLMAP 转换为 NeRF 和 OpenGL

下面的代码取 COLMAP 中的一张图像（四元数、平移、`PINHOLE` 内参），构建 OpenCV 和 OpenGL 的相机到世界矩阵，构建能复现 $K$ 的 OpenGL 投影矩阵，并检查两条路径把同一个世界点投到同一个像素上。这个 OpenGL 矩阵就是[光栅化]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})一文中的视锥矩阵，只是其元素用 $f_x, f_y, c_x, c_y$ 表示；把 $(x, y, z)\_{\text{CV}} = (x, -y, -z)\_{\text{GL}}$ 代入 $u = f_x x/z + s\,y/z + c_x$，再把 $u \in [0, W]$ 映射到 $x_{\text{ndc}} \in [-1, 1]$、$v \in [0, H]$ 映射到 $y_{\text{ndc}} \in [1, -1]$，就能推出它。

```python
import numpy as np

def qvec2rotmat(q):
    """COLMAP quaternion (QW, QX, QY, QZ) -> rotation matrix (Hamilton convention)."""
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])

CV_TO_GL = np.diag([1.0, -1.0, -1.0, 1.0])   # flip the camera's y and z axes

def colmap_to_c2w(qvec, tvec, convention="opencv"):
    """images.txt stores world-to-camera; NeRF-style loaders want camera-to-world."""
    R = qvec2rotmat(qvec)
    c2w = np.eye(4)
    c2w[:3, :3], c2w[:3, 3] = R.T, -R.T @ tvec      # columns: camera axes and centre in world
    return c2w @ CV_TO_GL if convention == "opengl" else c2w

def gl_projection(K, W, H, near, far):
    """OpenGL clip matrix that reproduces the pinhole K (pixel origin at the image corner,
    pixel centres at +0.5, as in COLMAP) for a camera looking down -z with y up."""
    fx, s, cx, fy, cy = K[0, 0], K[0, 1], K[0, 2], K[1, 1], K[1, 2]
    return np.array([
        [2 * fx / W, -2 * s / W, 1 - 2 * cx / W, 0],
        [0, 2 * fy / H, 2 * cy / H - 1, 0],
        [0, 0, -(far + near) / (far - near), -2 * far * near / (far - near)],
        [0, 0, -1, 0]])

# one COLMAP image: quaternion, translation and a PINHOLE camera 1600 x 1200
qvec, tvec = np.array([0.95, 0.10, -0.25, 0.05]), np.array([0.3, -0.2, 2.5])
K = np.array([[1450.0, 0, 801.5], [0, 1450.0, 598.0], [0, 0, 1]])
W, H = 1600, 1200
Xw = np.array([0.4, -0.3, 1.2, 1.0])                 # a world point (homogeneous)

# (1) OpenCV/COLMAP route: world -> camera -> K
R = qvec2rotmat(qvec)
xc = R @ Xw[:3] + tvec
u_cv = (K @ xc)[:2] / xc[2]

# (2) OpenGL route: inverse of the OpenGL camera-to-world, projection, divide, viewport
c2w_gl = colmap_to_c2w(qvec, tvec, "opengl")
clip = gl_projection(K, W, H, 0.1, 100.0) @ np.linalg.inv(c2w_gl) @ Xw
ndc = clip[:3] / clip[3]
u_gl = np.array([(ndc[0] + 1) * W / 2, (1 - ndc[1]) * H / 2])   # y_ndc points up, v down

print("OpenCV pixel:", u_cv.round(4), " OpenGL pixel:", u_gl.round(4))
print("camera centre:", c2w_gl[:3, 3].round(4), " looks along:", (-c2w_gl[:3, 2]).round(4))

# (3) LLFF's poses_bounds.npy stores camera-to-world columns as [down, right, backwards]
c2w_cv = colmap_to_c2w(qvec, tvec)[:3]                                  # [right, down, forward | C]
llff = np.c_[c2w_cv[:, 1], c2w_cv[:, 0], -c2w_cv[:, 2], c2w_cv[:, 3]]   # [down, right, back | C]
nerf = np.c_[llff[:, 1], -llff[:, 0], llff[:, 2], llff[:, 3]]           # [right, up, back | C]
print("LLFF reordered equals the OpenGL c2w:", np.allclose(nerf, c2w_gl[:3]))
```

两条路径都给出像素 $(849.0957, 306.4640)$，打印出的所有位数都一致。相机中心为 $(-1.4913, -0.1826, -2.0304)$，在 OpenGL 约定下相机沿 $-z$ 看，即世界方向 $(0.4962, 0.1688, 0.8517)$。最后一行执行了 NeRF 的 LLFF 加载器所做的列重排，从（下、右、后）到（右、上、后），并确认它得到同一个 OpenGL 相机到世界矩阵（`True`）。

### 4.5 排错清单

当一个工具输出的位姿在另一个工具里看起来不对时：

1. **把相机画出来。** 把每个相机中心和它的观察方向与稀疏点一起画出来。相机背对场景说明 $z$ 翻转了；场景成了镜像说明有一根轴单独翻转了，也就是某处行列式为 $-1$。
2. **投影一个已知点。** 取一个三维点和它在图像中出现的像素，检查你的完整链路能把它复现到一个像素以内。在 OpenCV 约定下深度 $Z_c$ 必须为正。
3. **检查位姿的方向。** 如果所有相机中心都挤在原点附近，或者构成了预期轨迹的镜像，你很可能把 $\mathbf t$ 当成了 $\mathbf C = -R^\top\mathbf t$，或者把 $T_{w2c}$ 当成了 $T_{c2w}$。
4. **检查四元数的顺序**（标量在前还是在后），以及欧拉角的约定（如果有的话）。
5. **检查主点**是否与图像尺寸相符，包括半像素约定，以及图像在标定之后是否被缩放过（$f_x, f_y, c_x, c_y$ 都会随图像一起缩放）。
6. **检查畸变模型。** 如果数据是带畸变标定的，而你的渲染器假设针孔，就先对图像去畸变，正如 3DGS 的预处理所做的那样。

## 动手试试

- 上面的两个组件：消失点以及用它们标定，以及带 Brown-Conrady 和 Kannala-Brandt 畸变的完整相机模型。
- 首页的[交互实验室]({{ '/' | relative_url }}#lab)使用理想针孔相机渲染。Gaussian World 演示用像素焦距 $f = (H/2)/\tan(\theta_y/2)$ 投影每一个高斯，这就是第 2.2 节的视场角关系应用在竖直方向上；环绕或行走只改变 $R$ 和 $\mathbf t$。
- 用手机拍一张建筑物，用直线求交找出两组互相垂直的棱的消失点，再用第 1.6 节的公式估计相机以像素为单位的焦距。与 EXIF 中的 35 mm 等效焦距 $F_{35}$ 比较：对于横向宽 $W$ 像素的图像，$f \approx F_{35}\, W / 36\,\text{mm}$。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Decentering distortion of lenses (Brown) | Photogrammetric Engineering | 1966 | — | OpenCV 所用的径向加切向畸变模型 |
| Using vanishing points for camera calibration (Caprile, Torre) | IJCV | 1990 | [DOI](https://doi.org/10.1007/BF00127813) | 由消失点求内参；垂心性质 |
| A flexible new technique for camera calibration (Zhang) | TPAMI | 2000 | [DOI](https://doi.org/10.1109/34.888718) | 棋盘格标定，第 2 篇的基础 |
| A unifying theory for central panoramic systems and practical implications (Geyer, Daniilidis) | ECCV | 2000 | [DOI](https://doi.org/10.1007/3-540-45053-X_29) | 中心折反射相机的统一球面模型 |
| Straight lines have to be straight (Devernay, Faugeras) | Machine Vision and Applications | 2001 | [DOI](https://doi.org/10.1007/PL00013269) | 利用直线的"直"估计畸变，无需标定板 |
| Geometric models of rolling-shutter cameras (Meingast, Geyer, Sastry) | arXiv 预印本 | 2005 | [arXiv](https://arxiv.org/abs/cs/0503076) | 运动中卷帘快门相机的投影方程 |
| A generic camera model and calibration method for conventional, wide-angle, and fish-eye lenses (Kannala, Brandt) | TPAMI | 2006 | [DOI](https://doi.org/10.1109/TPAMI.2006.153) | OpenCV 和 COLMAP 采用的以角度为变量的多项式鱼眼模型 |
| Single view point omnidirectional camera calibration from planar grids (Mei, Rives) | ICRA | 2007 | [DOI](https://doi.org/10.1109/ROBOT.2007.364084) | 在统一球面模型上加入畸变并用平面标定板标定，适用于鱼眼和折反射相机 |
| Rolling shutter bundle adjustment (Hedborg, Forssén, Felsberg, Ringaby) | CVPR | 2012 | [DOI](https://doi.org/10.1109/CVPR.2012.6247831) | 卷帘快门视频的光束法平差，逐行位姿在帧间插值 |
| Structure-from-Motion revisited (Schönberger, Frahm) | CVPR | 2016 | [CVF](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) | COLMAP；大多数数据集沿用其相机模型和约定 |
| The double sphere camera model (Usenko, Demmel, Cremers) | 3DV | 2018 | [arXiv](https://arxiv.org/abs/1807.08957) | 有闭式逆的广角模型，并对各模型做了比较 |
| Local light field fusion (Mildenhall et al.) | SIGGRAPH (ACM TOG) | 2019 | [arXiv](https://arxiv.org/abs/1905.00889) | 前向 NeRF 场景使用的 `poses_bounds.npy` 格式 |
| Why having 10,000 parameters in your camera model is better than twelve (Schöps et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1912.02908) | 通用稠密相机模型标定更准确 |

## 学习资源

- R. Hartley、A. Zisserman，*Multiple View Geometry in Computer Vision*，第 2 版，Cambridge University Press，2004。第 2、3 章（二维与三维射影几何）、第 6 章（相机模型）和第 8 章（消失点与单视图几何）是本文第 1、2 节的权威参考。
- R. Szeliski，*Computer Vision: Algorithms and Applications*，第 2 版，2022，第 2 章（成像）。个人使用可在 [szeliski.org/Book](https://szeliski.org/Book/) 免费获取。
- OpenCV 文档：[calib3d 模块](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html)（针孔与 Brown-Conrady 模型）和 [fisheye 模块](https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html)（Kannala-Brandt）。
- COLMAP 文档：[输出格式](https://colmap.github.io/format.html)（`cameras.txt`、`images.txt`）以及相机模型列表。
- 坐标约定参考：[nerfstudio 数据约定](https://docs.nerf.studio/quickstart/data_conventions.html)和 [PyTorch3D 相机坐标系](https://pytorch3d.org/docs/cameras)。

## 练习

1. 用齐次坐标计算竖直线 $x = 1$ 与 $x = 3$ 的交点，以及过无穷远点 $(1, 0, 0)$ 和 $(0, 1, 0)$ 的直线，并解释这两个结果。

   <details markdown="1"><summary>提示</summary>

   两条直线是 $(1, 0, -1)$ 和 $(1, 0, -3)$；它们的叉积为 $(0, 2, 0) \sim (0, 1, 0)$，即竖直方向的无穷远点。过 $(1,0,0)$ 和 $(0,1,0)$ 的直线是它们的叉积 $(0, 0, 1) = \mathbf l_\infty$。
   </details>

2. 证明对零倾斜、方形像素的相机，主点是三个两两正交方向的消失点所成三角形的垂心。当相机水平、$\mathbf v_Z$ 位于无穷远时，还能恢复什么？

   <details markdown="1"><summary>提示</summary>

   对三对消失点分别写出正交条件 $(\mathbf v_i - \mathbf c)\cdot(\mathbf v_j - \mathbf c) = -f^2$，再把其中两个相减。若 $\mathbf v_Z = (a, b, 0)$ 位于无穷远，它的射线 $K^{-1}\mathbf v_Z = (a/f, b/f, 0)$ 必须与 $\mathbf v_X$ 的射线正交，由此得到 $(\mathbf v_X - \mathbf c)\cdot(a, b) = 0$：主点位于地平线上。这样满足 $(\mathbf v_X - \mathbf c)\cdot(\mathbf v_Y - \mathbf c) = -f^2$ 的 $(\mathbf c, f)$ 还剩一个参数的自由度；需要再加一个假设，例如 $c_x$ 位于图像中心（如组件中那样），才能确定 $f$。
   </details>

3. 不用 SciPy，用 `np.linalg.qr` 自己实现 RQ 分解，并在 `decompose_P` 中与 `scipy.linalg.rq` 比较。

   <details markdown="1"><summary>提示</summary>

   设 $J$ 为反对角线上全为 1 的交换矩阵。计算 `Q, U = np.linalg.qr((J @ M).T)`；那么 $K = J U^\top J$ 是上三角矩阵，$R = J Q^\top$ 是正交矩阵，且 $KR = M$。符号的处理与 `decompose_P` 相同。
   </details>

4. 对只有 $k_1 = -0.4$ 的 Brown-Conrady 模型，它能表示的最大视场（全角，方形像素，主点居中）是多少？再对 $k_1 = -0.28$、$k_2 = 0.07$ 计算一次。

   <details markdown="1"><summary>提示</summary>

   模型在 $1 + 3k_1 r^2 + 5k_2 r^4 = 0$ 处折返。对 $k_1 = -0.4$，即 $r = 0.913$，半角 $42.4°$，全角 $84.8°$。对第二个镜头，关于 $s = r^2$ 的二次式 $0.35 s^2 - 0.84 s + 1$ 没有实根，所以它永远不会折返（不过它在标定范围之外很远处的精度是另一回事）。
   </details>

5. 推导摇镜头角速度为 $\omega$ 时竖直线卷帘快门倾斜量的一阶公式，并与代码结果对照。若读出时间为 30 ms、$f = 1000$，要求整帧内的倾斜小于 2 像素，摇镜头最快能多快？

   <details markdown="1"><summary>提示</summary>

   在图像中心附近，小角度旋转 $\delta$ 使图像移动约 $f\delta$，而第 $v$ 行晚 $\tau v/H$ 曝光，所以位移为 $\Delta u(v) \approx f\,\omega\,\tau\,v/H$。整帧为 $f\omega\tau = 1000 \cdot 1.047 \cdot 0.03 = 31.4$ 像素（60°/s 时），与打印结果一致。要小于 2 像素，需要 $\omega < 2/(1000 \cdot 0.03)$ rad/s，约 3.8°/s。
   </details>

6. 你拿到一个 NeRF 的 `transforms.json`，其中是 OpenGL 约定下的相机到世界矩阵，而你要训练 3DGS，它需要 OpenCV 的世界到相机矩阵。写出这个转换，并通过用两者分别投影同一个点来验证。

   <details markdown="1"><summary>提示</summary>

   $T_{w2c}^{\text{CV}} = \big(T_{c2w}^{\text{GL}}\,\mathrm{diag}(1,-1,-1,1)\big)^{-1}$。反过来复用第 4.4 节的投影检查。同时要把 JSON 中的视场角或焦距换算成针对实际图像尺寸的像素焦距 $f_x, f_y$。
   </details>

**下一篇：**[相机标定]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})：如何从棋盘格图像中估计 $K$ 和畸变系数，以及如何判断结果是否可信。
