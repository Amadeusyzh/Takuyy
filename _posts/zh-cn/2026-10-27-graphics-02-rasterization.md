---
layout: post
title: "光栅化：从三角形到像素"
date: 2026-10-27 09:02:00+0900
description: "MVP 管线、逐步推导透视投影矩阵、裁剪、边函数、透视校正插值、z-buffer 与抗锯齿，并用 NumPy 实现一个完整的软件光栅化器。"
categories: graphics
tags: [rasterization, perspective-projection, z-buffer, anti-aliasing, glsl]
series: graphics
series_order: 2
toc:
  sidebar: left
related_posts: false
mermaid:
  enabled: true
  zoomable: true
---

## 为什么重要

你见过的几乎所有实时画面都是通过光栅化（rasterization）生成的：游戏、VR 头显、CAD 工具，以及每个 3D 编辑器的视口。它以极快的速度回答一个问题：*这个三角形覆盖了哪些像素？每个像素上最近的表面是什么？* 在[上一篇]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})中，我们搭建了数学工具箱（齐次坐标、变换、坐标空间）。这一篇我们把它们用起来，从零构建一个完整的渲染器。这些思想会在路线图的后段再次出现：3D 高斯泼溅（3D Gaussian Splatting）本质上是一个椭球的光栅化器，而可微光栅化器（differentiable rasterizer）正是神经网络从网格图像中学习的途径。

**前置知识**

- 矩阵、齐次坐标，以及第 1 篇中的 物体 → 世界 → 观察 → 裁剪 → NDC → 屏幕 坐标链。
- NumPy 基础（广播、布尔掩码）。
- 可选：任何 OpenGL / WebGL “hello triangle” 的经验，便于理解 GPU 一节。

## 1. 管线概览

光栅化管线（pipeline）把一组 3D 三角形变成一张 2D 图像。下面的每个阶段既存在于我们的 Python 代码中，也存在于 GPU 硬件中：

```mermaid
flowchart LR
  A["顶点<br/>（物体空间）"] --> B["顶点阶段<br/>MVP 变换"]
  B --> C["裁剪空间<br/>(x, y, z, w)"]
  C --> D["裁剪<br/>-w ≤ x, y, z ≤ w"]
  D --> E["透视除法<br/>NDC"]
  E --> F["视口变换<br/>像素"]
  F --> G["光栅化<br/>覆盖 + 重心坐标"]
  G --> H["片元阶段<br/>着色"]
  H --> I["深度测试<br/>z-buffer"]
  I --> J["帧缓冲"]
```

顶点位置乘以**模型-观察-投影**（model-view-projection, MVP）矩阵

$$
\mathbf{p}_{\text{clip}} = P\,V\,M\,\mathbf{p}_{\text{obj}},
$$

其中 $M$ 把物体放到世界中，$V$ 把世界变换到相机坐标系（相机位于原点、朝 $-z$ 方向看，这是我们全文采用的 OpenGL 约定），$P$ 是投影。此后的一切都是按三角形、按像素执行的固定功能（fixed-function）工作。

## 2. 观察矩阵

给定相机位置 $\mathbf{e}$、目标点 $\mathbf{t}$ 和一个近似的上方向 $\mathbf{u}_0$，我们构造相机的正交基：

$$
\mathbf{f} = \frac{\mathbf{t}-\mathbf{e}}{\lVert\mathbf{t}-\mathbf{e}\rVert},\quad
\mathbf{s} = \frac{\mathbf{f}\times\mathbf{u}_0}{\lVert\mathbf{f}\times\mathbf{u}_0\rVert},\quad
\mathbf{u} = \mathbf{s}\times\mathbf{f}.
$$

相机的右、上、后三个轴分别是 $\mathbf{s}$、$\mathbf{u}$ 和 $-\mathbf{f}$。观察矩阵（view matrix）是相机摆放变换的逆：先平移 $-\mathbf{e}$，再把世界坐标轴旋转到相机坐标轴上。由于旋转是正交的，其逆等于转置，所以 $V$ 的各行就是相机的坐标轴：

$$
V = \begin{bmatrix}
s_x & s_y & s_z & -\mathbf{s}\cdot\mathbf{e}\\
u_x & u_y & u_z & -\mathbf{u}\cdot\mathbf{e}\\
-f_x & -f_y & -f_z & \mathbf{f}\cdot\mathbf{e}\\
0 & 0 & 0 & 1
\end{bmatrix}.
$$

## 3. 推导透视投影矩阵

### 3.1 相似三角形

针孔相机通过相似三角形，把观察空间中 $z<0$ 的点 $(x, y, z)$ 映射到近平面 $z=-n$ 上：

$$
x' = \frac{n\,x}{-z},\qquad y' = \frac{n\,y}{-z}.
$$

正是这个除以 $-z$ 的操作让远处的物体变小。矩阵无法做除法，但齐次坐标可以：如果令输出的 $w$ 分量等于 $-z$，那么之后的**透视除法**（perspective divide）$(x, y, z)/w$ 会替我们完成除法。这就确定了 $P$ 的最后一行为 $(0, 0, -1, 0)$。

### 3.2 归一化 x 和 y

近平面上的可见窗口为 $[-r, r]\times[-t, t]$，其中对竖直视场角 $\theta_y$ 有 $t = n\tan(\theta_y/2)$，对宽高比 $a = W/H$ 有 $r = a\,t$。我们希望这个窗口落在归一化设备坐标（normalized device coordinates, NDC）的 $[-1,1]^2$ 上，因此

$$
x_{\text{ndc}} = \frac{x'}{r} = \frac{n}{r}\cdot\frac{x}{-z},\qquad
y_{\text{ndc}} = \frac{n}{t}\cdot\frac{y}{-z}.
$$

记 $n/t = 1/\tan(\theta_y/2) =: c$，则 $P$ 的前两行为 $(c/a, 0, 0, 0)$ 和 $(0, c, 0, 0)$。

### 3.3 映射深度

我们还需要一个供 z-buffer 使用的深度值。它所在的行必须形如 $(0, 0, A, B)$（不能依赖 $x$ 或 $y$），于是透视除法之后

$$
z_{\text{ndc}} = \frac{A z + B}{-z}.
$$

要求 $z=-n \mapsto -1$，$z=-f \mapsto +1$：

$$
\frac{-An + B}{n} = -1,\qquad \frac{-Af + B}{f} = 1
\;\;\Longrightarrow\;\;
A = \frac{f+n}{n-f},\quad B = \frac{2fn}{n-f}.
$$

（把两个方程 $-An+B=-n$ 与 $-Af+B=f$ 相减即得 $A$，再代回求 $B$。）合起来：

$$
P = \begin{bmatrix}
\dfrac{c}{a} & 0 & 0 & 0\\[4pt]
0 & c & 0 & 0\\[4pt]
0 & 0 & \dfrac{f+n}{n-f} & \dfrac{2fn}{n-f}\\[4pt]
0 & 0 & -1 & 0
\end{bmatrix},\qquad c = \frac{1}{\tan(\theta_y/2)}.
$$

这正是 `gluPerspective` 和 `glm::perspective` 生成的矩阵。Direct3D 和 Vulkan 使用 $[0,1]$ 而非 $[-1,1]$ 的深度范围，Vulkan 还会翻转 $y$，但推导过程完全相同，只是目标值不同。

### 3.4 深度不是线性的

注意 $z_{\text{ndc}} = -A + B/w$（其中 $w = -z$）：它关于 $1/w$ 是线性的，而不是关于 $z$。我们用数值验证一下：

```python
import numpy as np

def perspective(fovy_deg, aspect, n, f):
    t = 1.0 / np.tan(np.radians(fovy_deg) / 2)
    return np.array([[t / aspect, 0, 0, 0], [0, t, 0, 0],
                     [0, 0, (f + n) / (n - f), 2 * f * n / (n - f)], [0, 0, -1, 0]])

n, f = 0.1, 100.0
P = perspective(60, 16 / 9, n, f)
for z in (-n, -0.2, -1.0, -10.0, -f):
    c = P @ np.array([0.0, 0.0, z, 1.0])
    print(f"z_view = {z:7.1f}   w = {c[3]:6.1f}   z_ndc = {c[2] / c[3]: .6f}")
```

```text
z_view =    -0.1   w =    0.1   z_ndc = -1.000000
z_view =    -0.2   w =    0.2   z_ndc =  0.001001
z_view =    -1.0   w =    1.0   z_ndc =  0.801802
z_view =   -10.0   w =   10.0   z_ndc =  0.981982
z_view =  -100.0   w =  100.0   z_ndc =  1.000000
```

整个深度范围的一半都花在了距相机 0.1 到 0.2 个单位之间，而 10 个单位以外的所有东西只共享最后 2%。这就是为什么过小的近平面会导致远处的**深度冲突**（z-fighting），也是现代引擎采用 *reversed-Z*（把近处映射为 1、远处映射为 0，并配合浮点深度缓冲，使浮点精度与 $1/w$ 的精度分布相互抵消）的原因。好消息是同一事实的另一面：由于 $z_{\text{ndc}}$ 是 $1/w$ 的仿射函数，而 $1/w$ 在屏幕空间中是仿射的（第 6 节），**深度可以在屏幕上线性插值**。

## 4. 裁剪

投影之后，一个点可见当且仅当

$$
-w \le x \le w,\qquad -w \le y \le w,\qquad -w \le z \le w.
$$

我们在除法*之前*裁剪（clipping）是有充分理由的。位于相机后方的顶点有 $w<0$；除以负的 $w$ 会把它关于投影中心镜像过去，于是一个有顶点在相机后方的三角形会被画成一大片翻转的乱码。在齐次裁剪空间中，六个裁剪平面都是线性的，因此裁剪只是一系列线性插值。

经典算法是 **Sutherland-Hodgman**：每次只用一个平面裁剪多边形。对于有符号距离为 $d(\mathbf{p})$ 的平面（近平面为 $d = z + w$），遍历多边形的各条边 $(\mathbf{p}, \mathbf{q})$：

- 若 $\mathbf{p}$ 在内侧（$d(\mathbf{p}) \ge 0$），保留它；
- 若该边穿过平面，输出交点 $\mathbf{p} + t(\mathbf{q}-\mathbf{p})$，其中 $t = d(\mathbf{p}) / (d(\mathbf{p}) - d(\mathbf{q}))$。

顶点属性（颜色、UV）用同一个 $t$ 插值。这是正确的，因为裁剪空间仍然是物体空间的线性像。一个三角形被一个平面裁剪后最多变成四个顶点的多边形，我们再把它按扇形（fan）重新三角化。

实践中只有**近平面**是必不可少的。侧面四个平面可以用*保护带*（guard band）代替：我们只需把三角形的像素包围盒限制在屏幕范围内，其余部分由边函数剔除。GPU 也是这么做的：只有当三角形会超出光栅化器的定点数范围时，才进行几何裁剪。（远平面也可以省略，交给深度测试丢弃那些片元。）

## 5. 视口变换

$[-1,1]$ 范围的 NDC 坐标被映射到宽 $W$、高 $H$ 的图像的像素坐标。图像的第 0 行在最上方，所以 $y$ 需要翻转：

$$
x_s = \frac{x_{\text{ndc}}+1}{2}\,W,\qquad
y_s = \frac{1-y_{\text{ndc}}}{2}\,H,\qquad
z_s = \frac{z_{\text{ndc}}+1}{2} \in [0,1].
$$

像素 $(i, j)$ 覆盖正方形 $[i, i+1)\times[j, j+1)$，我们在其中心 $(i+\tfrac12, j+\tfrac12)$ 处采样。

## 6. 光栅化一个三角形

### 6.1 边函数

对于从 $\mathbf{a}$ 到 $\mathbf{b}$ 的二维边，定义**边函数**（edge function，Pineda, 1988）

$$
E_{ab}(\mathbf{p}) = (b_x - a_x)(p_y - a_y) - (b_y - a_y)(p_x - a_x),
$$

即二维叉积 $(\mathbf{b}-\mathbf{a})\times(\mathbf{p}-\mathbf{a})$ 的 z 分量。在 y 轴向上的坐标系中，当 $\mathbf{p}$ 位于有向边左侧时它为正，在直线上为零，在右侧为负。一个点位于逆时针三角形 $(\mathbf{a}, \mathbf{b}, \mathbf{c})$ 内部，当且仅当 $E_{ab}$、$E_{bc}$、$E_{ca}$ 三者均非负。

边函数有两个性质，使它非常适合硬件实现：

1. 它关于 $\mathbf{p}$ 是**仿射**的。向右移动一个像素就加上常数 $a_y - b_y$；向下移动一个像素就加上 $b_x - a_x$。光栅化器可以只用加法增量地计算它们，也可以并行地计算一整块（tile）像素。
2. 它的符号还给出了朝向：$E_{ab}(\mathbf{c})$ 是三角形有符号面积的两倍。面积为负意味着三角形背对相机，因此**背面剔除**（back-face culling）几乎是免费的。

在像素坐标中 $y$ 朝下，这会翻转所有符号。因此我们的代码使用取反后的表达式，使得在 NDC 中逆时针的三角形（正面）面积仍为正。

*边界情况：* 恰好落在两个三角形公共边上的像素中心必须且只能被其中一个三角形绘制，否则混合或模板效果会重复计算它。硬件使用**左上规则**（top-left rule）：边上的像素只有在该边是上边或左边时才算被覆盖。我们简单的 `>= 0` 测试会把这类像素画两次，对于带深度测试的不透明几何体来说无害。

### 6.2 重心坐标

把边函数除以总面积，就得到 $\mathbf{p}$ 的**重心坐标**（barycentric coordinates）：

$$
\lambda_a = \frac{E_{bc}(\mathbf{p})}{E_{ab}(\mathbf{c})},\qquad
\lambda_b = \frac{E_{ca}(\mathbf{p})}{E_{ab}(\mathbf{c})},\qquad
\lambda_c = \frac{E_{ab}(\mathbf{p})}{E_{ab}(\mathbf{c})},\qquad
\lambda_a+\lambda_b+\lambda_c = 1.
$$

从几何上看，$\lambda_a$ 是 $\mathbf{a}$ 对面的子三角形面积与总面积之比。它们满足 $\mathbf{p} = \lambda_a\mathbf{a} + \lambda_b\mathbf{b} + \lambda_c\mathbf{c}$，而“在内部”等价于所有 $\lambda \ge 0$。所以同样三个数回答了光栅化器要问的两个问题：*这个像素被覆盖了吗？* 以及 *在这里该如何混合顶点属性？*

### 6.3 透视校正插值

接下来是最微妙的部分。上面的 $\lambda$ 是**屏幕空间**中的重心坐标。但颜色和 UV 是在 **3D 中**沿三角形线性变化的，而透视除法不是线性的。用屏幕空间的 $\lambda$ 插值会让纹理游动、弯曲，这就是初代 PlayStation 著名的瑕疵。

设 $\beta_i$ 为某个表面点真实的（3D 的，等价地也是裁剪空间的）重心坐标，于是它的裁剪空间位置是 $\sum_i \beta_i \mathbf{P}_i$，其中 $\mathbf{P}_i = (x_i, y_i, z_i, w_i)$。它的屏幕位置为

$$
\mathbf{s} = \frac{\sum_i \beta_i (x_i, y_i)}{\sum_j \beta_j w_j}
= \sum_i \underbrace{\frac{\beta_i w_i}{\sum_j \beta_j w_j}}_{\lambda_i}\,\mathbf{s}_i,
\qquad \mathbf{s}_i = \frac{(x_i, y_i)}{w_i}.
$$

所以 $\lambda_i \propto \beta_i w_i$，反解得到

$$
\beta_i = \frac{\lambda_i / w_i}{\sum_j \lambda_j / w_j}.
$$

做法是：在**屏幕空间中线性地**插值 $u/w$ 和 $1/w$，然后相除。特别地，$1/w = \sum_j \lambda_j / w_j$ 在屏幕空间中是仿射的，这正是我们在 3.4 节中处理深度时用到的事实。这个效应有多大？取一条端点 $w = 1$ 和 $w = 10$ 的线段，看屏幕上位于两者正中间的像素：

```python
import numpy as np

w = np.array([1.0, 10.0])     # clip-space w (= -z_view) of the two endpoints
lam = np.array([0.5, 0.5])    # the pixel halfway between them on screen
beta = (lam / w) / (lam / w).sum()
print(beta.round(3))          # [0.909 0.091]
```

屏幕线段正中间的像素，在 3D 中只沿线段走了 9%。深度是唯一可以直接用 $\lambda$ 插值的量，因为 $z_{\text{ndc}}$ 本身在屏幕空间中就是仿射的。

### 6.4 z-buffer

为了解决可见性问题，我们维护一个**深度缓冲**（depth buffer），每个像素一个值，初始化为 $+\infty$（或 1）。对每个片元（fragment），把它的深度与已存的深度比较，只有更近时才写入颜色和深度。这就是 z-buffer 算法，由 Catmull（1974）以及 Straßer（1974）分别独立提出。对不透明表面而言它与绘制顺序无关，只需要 $O(\text{像素数})$ 的内存，而且天然并行，这就是它在硬件中击败所有基于排序的可见性算法的原因。它的弱点是：透明物体仍需要排序（或使用顺序无关透明 OIT 技巧），而有限精度会导致深度冲突（3.4 节）。

## 7. 走样与抗锯齿

每个像素只在一个点上采样，相当于对一个边缘无限锐利的信号做*点采样*。根据采样定理，高于采样率一半的频率无法被表示，会折叠回来形成**走样**（aliasing）：锯齿边（jaggies）、运动中闪烁爬动的边缘，以及细密纹理上的摩尔纹。解决办法有：

- **SSAA（超采样，supersampling）**：以 $s\times s$ 倍分辨率渲染，再对每个 $s\times s$ 块取平均（盒式滤波）。正确且简单，但着色、内存和带宽开销都变成 $s^2$ 倍。我们的光栅化器只用一行 `reshape(...).mean(...)` 就做到了。
- **MSAA（多重采样，multisample）**：每个像素存储 $N$ 个覆盖与深度样本（通常为 4 或 8 个，按旋转网格排布），但片元着色器**每个像素每个三角形只运行一次**，结果复制到被覆盖的样本上。最后由 *resolve* 步骤对样本取平均。边缘得到 $N$ 个样本的质量，而内部着色成本仍为 1 倍。MSAA 只能修复几何边缘；表面内部的走样（高光、高频纹理）需要靠纹理过滤（下一篇）或更高频率的着色来处理。
- **后处理与时域方法**（FXAA、SMAA、TAA，以及 DLSS 这样的学习型超分辨率）作用于最终图像，时域方法还会复用前几帧的样本。由于延迟着色（deferred shading）使 MSAA 变得昂贵，如今它们占据主导地位；我们将在[第 6 篇]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})中介绍它们。

## 8. 用 NumPy 实现完整的软件光栅化器

上面的所有内容大约 115 行就能写完。下面的渲染器用 MVP 变换顶点，用 Sutherland-Hodgman 对近平面裁剪，执行透视除法和视口变换，在每个三角形的包围盒上用向量化的边函数进行光栅化，透视校正地插值属性，用 z-buffer 解决可见性，用 2×2 SSAA 抗锯齿，并输出 PPM 图像（大多数图片查看器都能打开，也可以用 `python -c "from PIL import Image; Image.open('persp.ppm').save('persp.png')"` 转换）。

场景是一个放在 40 × 40 棋盘格地面上的 RGB 彩色立方体。地面故意做得足够大，以至于延伸到相机后方，这样近平面裁剪才真正被用到：没有裁剪的话，程序会画出一堆乱码。

```python
import numpy as np

# ---------- transforms ----------
def look_at(eye, target, up):
    f = target - eye; f = f / np.linalg.norm(f)          # forward
    s = np.cross(f, up); s = s / np.linalg.norm(s)        # right
    u = np.cross(s, f)                                    # true up
    V = np.eye(4)
    V[0, :3], V[1, :3], V[2, :3] = s, u, -f               # camera looks down -z
    V[:3, 3] = -V[:3, :3] @ eye
    return V

def perspective(fovy_deg, aspect, n, f):
    t = 1.0 / np.tan(np.radians(fovy_deg) / 2)
    return np.array([[t / aspect, 0, 0, 0],
                     [0, t, 0, 0],
                     [0, 0, (f + n) / (n - f), 2 * f * n / (n - f)],
                     [0, 0, -1, 0]])

def rot_y(deg):
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    return np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]])

# ---------- clipping against the near plane (z >= -w) ----------
def clip_near(poly):
    """poly: list of (clip_pos[4], attrs[k]). Sutherland-Hodgman, one plane."""
    out = []
    for i in range(len(poly)):
        (p, pa), (q, qa) = poly[i], poly[(i + 1) % len(poly)]
        dp, dq = p[2] + p[3], q[2] + q[3]                 # signed distance to plane
        if dp >= 0:
            out.append((p, pa))
        if (dp >= 0) != (dq >= 0):                        # edge crosses the plane
            t = dp / (dp - dq)
            out.append((p + t * (q - p), pa + t * (qa - pa)))
    return out

# ---------- rasterization ----------
def edge(a, b, px, py):
    # > 0 when p is to the right of a->b in y-down pixel coordinates
    return (px - a[0]) * (b[1] - a[1]) - (py - a[1]) * (b[0] - a[0])

def draw_triangle(clip, attrs, shade, color, depth, persp=True):
    H, W = depth.shape
    w = clip[:, 3]
    ndc = clip[:, :3] / w[:, None]                        # perspective divide
    sx = (ndc[:, 0] + 1) * 0.5 * W                        # viewport transform
    sy = (1 - ndc[:, 1]) * 0.5 * H
    sz = ndc[:, 2] * 0.5 + 0.5                            # depth in [0, 1]
    v = np.stack([sx, sy], 1)
    area = edge(v[0], v[1], v[2, 0], v[2, 1])
    if area <= 0:                                         # back-facing or degenerate
        return
    x0, x1 = max(int(np.floor(sx.min())), 0), min(int(np.ceil(sx.max())), W)
    y0, y1 = max(int(np.floor(sy.min())), 0), min(int(np.ceil(sy.max())), H)
    if x0 >= x1 or y0 >= y1:
        return
    px, py = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)  # pixel centers
    l0 = edge(v[1], v[2], px, py) / area                  # barycentric coordinates
    l1 = edge(v[2], v[0], px, py) / area
    l2 = edge(v[0], v[1], px, py) / area
    inside = (l0 >= 0) & (l1 >= 0) & (l2 >= 0)
    z = l0 * sz[0] + l1 * sz[1] + l2 * sz[2]              # z_ndc is affine in screen space
    zb = depth[y0:y1, x0:x1]
    mask = inside & (z < zb)                              # z-buffer test
    if not mask.any():
        return
    b = np.stack([l0[mask], l1[mask], l2[mask]], 1)       # (N, 3)
    if persp:                                             # perspective-correct weights
        b = b / w
        b = b / b.sum(1, keepdims=True)
    a = b @ attrs                                         # interpolated attributes (N, k)
    zb[mask] = z[mask]
    color[y0:y1, x0:x1][mask] = shade(a)

def render(meshes, mvp, W, H, ssaa=1, persp=True):
    Ws, Hs = W * ssaa, H * ssaa
    color = np.zeros((Hs, Ws, 3)); color[:] = (0.08, 0.09, 0.12)
    depth = np.full((Hs, Ws), np.inf)
    for verts, attrs, tris, shade, model in meshes:
        vh = np.c_[verts, np.ones(len(verts))] @ (mvp @ model).T   # vertex "shader"
        for tri in tris:
            poly = clip_near([(vh[i], attrs[i]) for i in tri])
            for k in range(1, len(poly) - 1):                       # fan-triangulate
                p = [poly[0], poly[k], poly[k + 1]]
                draw_triangle(np.array([q[0] for q in p]), np.array([q[1] for q in p]),
                              shade, color, depth, persp)
    # SSAA resolve: box-filter each ssaa x ssaa block down to one pixel
    return color.reshape(H, ssaa, W, ssaa, 3).mean((1, 3))

def save_ppm(path, img):
    img8 = (np.clip(img, 0, 1) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)
    with open(path, "wb") as f:
        f.write(b"P6 %d %d 255\n" % (img.shape[1], img.shape[0]))
        f.write(img8.tobytes())

# ---------- scene ----------
cube_v = np.array([[x, y, z] for z in (-.5, .5) for y in (-.5, .5) for x in (-.5, .5)], float)
cube_q = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
cube_t = [t for a, b, c, d in cube_q for t in ((a, b, c), (a, c, d))]
S = 20.0                                                   # big floor: crosses the near plane
floor_v = np.array([[-S, 0, -S], [-S, 0, S], [S, 0, S], [S, 0, -S]])
floor_uv = np.array([[0, 0], [0, 2 * S], [2 * S, 2 * S], [2 * S, 0]], float)
checker = lambda uv: np.where(((np.floor(uv[:, 0]) + np.floor(uv[:, 1])) % 2)[:, None] > 0, 0.8, 0.2) * np.ones(3)
model_cube = np.array([[1, 0, 0, 0], [0, 1, 0, 0.5], [0, 0, 1, 0], [0, 0, 0, 1.]]) @ rot_y(30)

if __name__ == "__main__":
    W, H = 320, 240
    V = look_at(np.array([2.5, 1.6, 3.5]), np.array([0, 0.4, 0]), np.array([0, 1., 0]))
    P = perspective(60, W / H, 0.1, 100)
    meshes = [(floor_v, floor_uv, [(0, 1, 2), (0, 2, 3)], checker, np.eye(4)),
              (cube_v, cube_v + 0.5, cube_t, lambda c: c, model_cube)]
    save_ppm("persp.ppm", render(meshes, P @ V, W, H, ssaa=2))
    save_ppm("affine.ppm", render(meshes, P @ V, W, H, ssaa=2, persp=False))
    print("wrote persp.ppm and affine.ppm")
```

关于设计的几点说明：

- **网格**是元组 `(顶点, 逐顶点属性, 三角形, 着色函数, 模型矩阵)`。立方体的属性是 RGB 颜色（位置 + 0.5）；地面的属性是 UV 坐标，由 `checker` 这个“片元着色器”转换成棋盘格。立方体的面从外部看按逆时针顺序列出，因此背面会被 `area <= 0` 测试剔除。
- **向量化**：我们不逐像素循环，而是让每个三角形在覆盖其包围盒的 NumPy 网格上计算三个边函数。这相当于 GPU 一次处理一个 tile 中多个像素的软件版本。
- **先深度测试后着色**：只有通过 z 测试的片元才会调用 `shade`，这就是 GPU 中所谓的 *early-z*。
- **Gamma**：PPM 写入函数施加了 $1/2.2$ 次幂，因为显示器期望 sRGB 编码的值，而着色计算在线性空间中进行（后续文章会详细讲）。

运行它会把同一场景渲染两次，一次使用透视校正插值，一次使用朴素的屏幕空间（仿射）插值：

![左：透视校正插值；右：同一场景的仿射插值]({{ '/assets/img/blog/graphics/02-persp-vs-affine.png' | relative_url }})

左图中棋盘格正确地向地平线汇聚。右图中地面在裁剪后只由几个巨大的三角形组成，它的 UV 在屏幕空间中插值，纹理坍缩成一片模糊，只剩下一条可见的接缝。立方体在两幅图中几乎一样，因为它的深度范围很小：误差随三角形上 $w$ 的比值增大而增大。没有透视校正的老硬件靠细分大三角形来掩盖这个问题。

在 NumPy 中以 2×2 SSAA 渲染 320 × 240 只需不到一秒。同样循环的 C++ 版本每秒可以处理数百万个三角形；GPU 每秒能处理数十亿个片元，因为每个阶段都是大规模并行的。

## 9. GPU 如何对应这些步骤

GPU 管线是同一个算法，只是其中两个阶段变成了可编程的：

| 我们的代码 | GPU（OpenGL / Vulkan / Direct3D） | 可编程？ |
| --- | --- | --- |
| `verts @ (mvp @ model).T` | **顶点着色器**（vertex shader）写出 `gl_Position`（裁剪空间） | 是 |
| `clip_near`、扇形三角化 | 图元装配、裁剪、保护带 | 否 |
| 除以 `w`、视口 | 透视除法、视口变换 | 否（可配置） |
| `area <= 0` | 面剔除（`glCullFace`） | 可配置 |
| 网格上的边函数 | 光栅化器、像素 tile、左上规则 | 否 |
| `b / w`、重新归一化 | 透视校正的 varying（默认 `smooth`） | 仅限限定符 |
| `shade(a)` | **片元（像素）着色器**（fragment shader） | 是 |
| `z < zb` | 深度测试、early-z、层次 z | 可配置 |
| SSAA `reshape().mean()` | MSAA 样本 + resolve | 可配置 |

为我们的彩色立方体写一个最小的 GLSL 程序，只需要这两个可编程阶段：

```glsl
// vertex shader
#version 330 core
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
out vec3 vColor;            // a "varying": interpolated per fragment

void main() {
    vColor = aColor;
    gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);   // clip space
}
```

```glsl
// fragment shader
#version 330 core
in vec3 vColor;             // perspective-correct by default
out vec4 fragColor;

void main() {
    fragColor = vec4(vColor, 1.0);
}
```

这两个函数之间的一切，包括裁剪、除法、视口、边函数、重心坐标和深度测试，都是我们刚刚亲手写过的固定功能硬件。把 varying 声明为 `noperspective out vec3 vColor;`（片元着色器中相应地写 `noperspective in`），硬件就会切换成上图右半部分那种仿射插值；默认的 `smooth` 是透视校正的。

阅读 GPU 相关论文时，还有两个事实很有帮助：

- 真实的 GPU 按 **tile**（例如 8 × 8 或 16 × 16 像素）进行光栅化，先用边函数测试整个 tile，再以 **2 × 2 的 quad** 为单位着色像素，这样硬件可以对 UV 取有限差分来选择纹理的 mip 层级（下一篇）。
- 移动 GPU 是**基于 tile 的延迟渲染器**（tile-based deferred renderer）：先把所有三角形分配（binning）到屏幕 tile 中，再完全在片上内存中光栅化每个 tile，以节省带宽。

## 10. 光栅化的下一步

光栅化回答的是*主可见性*（primary visibility）：相机直接看到了什么。它不知道阴影、反射或间接光照。实时引擎要么用技巧来补充这些（阴影贴图、屏幕空间反射，见下一篇），要么用光线追踪（[第 5 篇]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})和[第 6 篇]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})）。光栅化对基于学习的图形学同样重要。nvdiffrast 这样的可微光栅化器使图像成为网格顶点和纹理的可微函数，而 3D 高斯泼溅则是一个基于 tile 的光栅化器，它排序并 alpha 混合的是数以百万计的投影高斯，而不是三角形。

## 动手试试

主页上的[实验室]({{ '/' | relative_url }}#lab)中的所有演示都运行在本文描述的 GPU 管线上：顶点着色器变换布料网格，Gaussian World 由光栅化器泼溅绘制，甚至路径追踪器也使用一个全屏三角形，让它的片元着色器对每个像素运行一次。

## 代表性论文

| 论文 | 发表 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Sutherland & Hodgman, *Reentrant Polygon Clipping* | Communications of the ACM 17(1) | 1974 | [DOI](https://doi.org/10.1145/360767.360802) | 每次用一个平面裁剪；至今仍是标准的多边形裁剪算法 |
| Catmull, *A Subdivision Algorithm for Computer Display of Curved Surfaces*（犹他大学博士论文） | 博士论文 | 1974 | n/a | 提出了 z-buffer（以及纹理映射） |
| Blinn & Newell, *Clipping Using Homogeneous Coordinates* | SIGGRAPH | 1978 | [SIGGRAPH history](https://history.siggraph.org/?p=103260) | 说明为什么要在除法之前于 4D 中以 $-w \le x \le w$ 裁剪 |
| Pineda, *A Parallel Algorithm for Polygon Rasterization* | SIGGRAPH | 1988 | [SIGGRAPH history](https://history.siggraph.org/?p=119557) | 边函数：所有现代硬件光栅化器的基础 |
| Heckbert & Moreton, *Interpolation for Polygon Texture Mapping and Shading* | State of the Art in Computer Graphics（Springer） | 1991 | n/a | 对透视校正插值的清晰推导 |
| Akeley, *RealityEngine Graphics* | SIGGRAPH | 1993 | [SIGGRAPH history](https://history.siggraph.org/?p=118597) | 硬件多重采样抗锯齿，MSAA 的前身 |
| Olano & Greer, *Triangle Scan Conversion using 2D Homogeneous Coordinates* | Graphics Hardware (HWWS) | 1997 | [DOI](https://doi.org/10.1145/258694.258723) | 用齐次边函数实现无需显式裁剪的光栅化 |
| Laine & Karras, *High-Performance Software Rasterization on GPUs* | High-Performance Graphics | 2011 | [DOI](https://doi.org/10.1145/2018323.2018337) | 用 CUDA 实现的完整软件管线，揭示了硬件在做什么 |
| Laine et al., *Modular Primitives for High-Performance Differentiable Rendering*（nvdiffrast） | ACM TOG 39(6) / SIGGRAPH Asia | 2020 | [arXiv](https://arxiv.org/abs/2011.03277) | 面向逆渲染与学习的可微光栅化 |
| Kerbl et al., *3D Gaussian Splatting for Real-Time Radiance Field Rendering* | ACM TOG 42(4) / SIGGRAPH | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) | 面向高斯的 tile 光栅化器；通往神经渲染的桥梁 |

## 学习资源

- **GAMES101**（闫令琪），第 5-7 讲介绍光栅化、抗锯齿和 z-buffer：[课程主页](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html)。
- **Berkeley CS184**，作业 1 是一个带超采样的光栅化器：[cs184.eecs.berkeley.edu](https://cs184.eecs.berkeley.edu/)。
- **Scratchapixel**，“Rasterization: a practical implementation”：[课程](https://scratchapixel.com/lessons/3d-basic-rendering/rasterization-practical-implementation/overview-rasterization-algorithm.html)。
- **tinyrenderer**（Dmitry Sokolov），一个约 500 行 C++ 的软件光栅化器，以课程形式编写：[GitHub](https://github.com/ssloy/tinyrenderer)。
- **LearnOpenGL**，GPU 一侧（着色器、缓冲、深度测试、MSAA）：[learnopengl.com](https://learnopengl.com/)。
- Fabian Giesen，“Triangle rasterization in practice” 及其后续优化系列文章（The ryg blog，2013）。
- *Real-Time Rendering* 第 4 版（Akenine-Möller 等），第 2-3 章和第 23 章介绍图形管线与硬件：[realtimerendering.com](https://www.realtimerendering.com/)。

## 练习

1. **推导 Direct3D 矩阵。** 以 $[0, 1]$ 为目标深度范围重做 3.3 节，并用 3.4 节的代码片段数值验证你的 $A$、$B$。然后实现 reversed-Z（$n \mapsto 1$，$f \mapsto 0$），打印同样的表格。
2. **左上规则。** 用加法混合（`color += 0.5` 而不是覆盖）渲染两个共享一条边的三角形，观察那条亮缝。在 `draw_triangle` 中实现左上规则来修复它。
3. **完整裁剪。** 把 `clip_near` 扩展到全部六个平面，验证图像不变（保护带已经处理了侧平面）。什么情况下图像会改变？
4. **MSAA。** 用 4× MSAA 替换 SSAA：每个像素保留 4 个深度与覆盖样本，但每个像素每个三角形只调用一次 `shade`。比较边缘质量和 `shade` 的调用次数。
5. **法线可视化。** 给立方体添加逐顶点法线，并输出 `0.5 * n + 0.5` 作为颜色。然后思考应该用哪个矩阵变换法线（第 1 篇中的逆转置）。

**下一篇：** 三角形已经可见了，但还是平的。在[第 3 篇]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})中，我们会用 Lambert 和 Blinn-Phong 为它们打光，加入带 mipmap 的纹理，并用阴影贴图投射阴影。
