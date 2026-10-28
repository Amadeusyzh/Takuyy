---
layout: post
title: "3D 高斯泼溅：从头到尾"
date: 2026-10-27 12:04:00+0900
description: "完整的 3DGS 方法：高斯参数、由旋转与缩放构造协方差、基于雅可比矩阵的 EWA 投影、0.3 低通滤波、基于图块的可微光栅化、α 混合与梯度、自适应密度控制以及训练配方，附 Python 代码。"
categories: neural-rendering
tags: [3d-gaussian-splatting, ewa-splatting, differentiable-rendering, spherical-harmonics, pytorch]
series: neural-rendering
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第 3 篇]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})让辐射场的训练缩短到了几分钟，但渲染时仍然要在体积中做光线步进（ray marching），并对每个像素的大量采样点查询特征。**3D 高斯泼溅**（3D Gaussian Splatting）（Kerbl, Kopanas, Leimkühler & Drettakis, ACM Transactions on Graphics 42(4), SIGGRAPH 2023）改变的是表示本身：场景是数百万个显式的、各向异性（anisotropic）的 3D 高斯的集合，每个高斯都有位置、形状、不透明度（opacity）和随视角变化的颜色；图像则通过对它们进行**光栅化（rasterization）**得到——把每个高斯投影成一个 2D 椭圆、排序，再做 α 混合（alpha blending）。由于光栅化器是可微的，这些高斯可以像 NeRF 一样直接从照片中优化，但结果能以实时帧率渲染（论文报告 1080p 下达到 30 fps 或更高），并且质量达到当时最先进的水平。

3DGS 如今已是照片级真实感采集的默认表示，也是第 5 篇中大多数工作的基础：动态场景、SLAM、前馈（feed-forward）重建、生成以及 VR。本文将从头到尾讲解这一方法，并为每个部分提供代码。

## 前置知识

- 体渲染（volume rendering）与 α 合成（alpha compositing），尤其是 $w_i = T_i \alpha_i$（第 2 篇）。
- 针孔投影（pinhole projection）与相机约定（第 1 篇）。
- 图形学系列中的光栅化、深度排序（depth sorting）与 GPU 管线。
- 多元高斯分布（multivariate Gaussian）、四元数（quaternion）以及 PyTorch 自动求导（autograd）。

## 1. 表示

场景是 $N$ 个高斯的集合。第 $i$ 个高斯包含：

| 参数 | 符号 | 存储形式 | 激活 | 大小 |
| --- | --- | --- | --- | --- |
| 均值（中心） | $\boldsymbol\mu_i \in \mathbb R^3$ | 原始值 | — | 3 |
| 旋转 | $\mathbf q_i$ | 四元数 | 归一化 | 4 |
| 缩放 | $\mathbf s_i \in \mathbb R^3_{>0}$ | $\log \mathbf s_i$ | $\exp$ | 3 |
| 不透明度 | $o_i \in (0,1)$ | logit | sigmoid | 1 |
| 颜色 | SH 系数 $\mathbf k_i$ | 原始值 | SH 求值 $+\,0.5$，截断 | $16\times 3 = 48$ |

也就是每个高斯 59 个浮点数；一个典型的户外场景包含 300–600 万个高斯，以 float32 `.ply` 存储时要占用几百兆字节到一吉字节以上，这也是压缩自成一个研究方向的原因（第 5 篇）。

高斯在空间中定义了一个密度

$$
G_i(\mathbf x) = \exp\!\Big( -\tfrac12 (\mathbf x - \boldsymbol\mu_i)^\top \Sigma_i^{-1} (\mathbf x - \boldsymbol\mu_i) \Big),
$$

没有归一化常数：其峰值为 1，并由不透明度 $o_i$ 进行缩放。与 NeRF 相比：

- 它是**显式的**（explicit）：渲染时不需要对任何网络求值。所有参数都直接通过梯度下降优化。
- 它是**稀疏且自适应的**：高斯只存在于有内容的地方，其数量和大小在训练过程中自适应变化（第 6 节）。
- 它仍然是一种**体积式的、柔性的**表示：相互重叠的半透明团块被混合在一起，这使得梯度表现良好。它没有硬表面，也没有法线。

### 1.1 由旋转与缩放构造协方差

协方差矩阵（covariance matrix）必须是对称半正定的（symmetric positive semi-definite），而直接对 $\Sigma$ 的 6 个元素做朴素梯度下降会破坏这一约束。因此 3DGS 把高斯参数化为一个椭球：先做缩放 $S = \operatorname{diag}(s_x, s_y, s_z)$，再做旋转 $R(\mathbf q)$，

$$
\Sigma = R\, S\, S^\top R^\top .
$$

以这种方式构造的任何 $\Sigma$ 都是合法的，而且参数直观：$\mathbf s$ 是沿椭球各主轴方向的标准差，而这些主轴就是 $R$ 的各列。单位四元数 $\mathbf q = (w, x, y, z)$ 对应的旋转矩阵为

$$
R(\mathbf q) =
\begin{pmatrix}
1 - 2(y^2 + z^2) & 2(xy - wz) & 2(xz + wy) \\
2(xy + wz) & 1 - 2(x^2 + z^2) & 2(yz - wx) \\
2(xz - wy) & 2(yz + wx) & 1 - 2(x^2 + y^2)
\end{pmatrix}.
$$

四元数在前向传播内部进行归一化，因此优化器可以在 $\mathbb R^4$ 中自由地移动它。

```python
import numpy as np

def quat_to_rotmat(q):
    """Unit quaternion (w, x, y, z) -> 3x3 rotation matrix. q is normalized first."""
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z),     2 * (x * z + w * y)],
        [2 * (x * y + w * z),     1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y),     2 * (y * z + w * x),     1 - 2 * (x * x + y * y)]])

def covariance_3d(q, log_scale):
    """Sigma = R S S^T R^T with S = diag(exp(log_scale)); always symmetric positive semi-definite."""
    R = quat_to_rotmat(q)
    M = R @ np.diag(np.exp(log_scale))
    return M @ M.T
```

对任意 $\mathbf q$，`covariance_3d(q, np.log([0.3, 0.1, 0.02]))` 的特征值都恰好是 $0.3^2, 0.1^2, 0.02^2$，这是一个简便的单元测试。

### 1.2 用球谐函数表示随视角变化的颜色

颜色是方向球面上的函数，用实**球谐函数（spherical harmonics）**展开到 3 阶：

$$
\mathbf c_i(\mathbf d) = \max\!\Big(0,\ \tfrac12 + \sum_{\ell=0}^{3}\sum_{m=-\ell}^{\ell} \mathbf k_{i,\ell m}\, Y_{\ell m}(\mathbf d)\Big),
\qquad
\mathbf d = \frac{\boldsymbol\mu_i - \mathbf o_{\text{cam}}}{\lVert \boldsymbol\mu_i - \mathbf o_{\text{cam}}\rVert},
$$

即每个颜色通道 $(3+1)^2 = 16$ 个系数。0 阶是一个常数（$Y_{00} = \tfrac{1}{2\sqrt\pi} \approx 0.2821$），也就是“漫反射”颜色；1–3 阶则加入越来越尖锐的随视角变化，例如高光。注意方向是逐高斯的（从相机中心指向高斯的均值），而不是逐像素的。下面的常数取自参考实现（继承自 Plenoxels 和 PlenOctrees）：

```python
C0 = 0.28209479177387814
C1 = 0.4886025119029199
C2 = [1.0925484305920792, -1.0925484305920792, 0.31539156525252005,
      -1.0925484305920792, 0.5462742152960396]
C3 = [-0.5900435899266435, 2.890611442640554, -0.4570457994644658, 0.3731763325901154,
      -0.4570457994644658, 1.445305721320277, -0.5900435899266435]

def sh_basis(d, degree=3):
    """Real SH basis in the ordering/sign convention of the 3DGS code. d: (N, 3) unit vectors."""
    x, y, z = d[:, 0], d[:, 1], d[:, 2]
    out = [np.full_like(x, C0)]
    if degree > 0:
        out += [-C1 * y, C1 * z, -C1 * x]
    if degree > 1:
        xx, yy, zz, xy, yz, xz = x * x, y * y, z * z, x * y, y * z, x * z
        out += [C2[0] * xy, C2[1] * yz, C2[2] * (2 * zz - xx - yy), C2[3] * xz, C2[4] * (xx - yy)]
    if degree > 2:
        out += [C3[0] * y * (3 * xx - yy), C3[1] * xy * z, C3[2] * y * (4 * zz - xx - yy),
                C3[3] * z * (2 * zz - 3 * xx - 3 * yy), C3[4] * x * (4 * zz - xx - yy),
                C3[5] * z * (xx - yy), C3[6] * x * (xx - 3 * yy)]
    return np.stack(out, axis=-1)                   # (N, (degree + 1)^2)

def sh_to_rgb(sh, d, degree=3):
    """sh: (N, 16, 3) coefficients, d: (N, 3) unit view directions -> (N, 3) colours."""
    B = sh_basis(d, degree)                          # (N, K)
    rgb = np.einsum("nk,nkc->nc", B, sh[:, :B.shape[1]]) + 0.5
    return np.maximum(rgb, 0.0)
```

一个不错的自检方法：随机抽取大量单位向量，验证 $\frac{4\pi}{M}\sum_m B(\mathbf d_m)^\top B(\mathbf d_m) \approx I_{16}$（正交归一性）。3DGS 写出的 `ply` 文件把 0 阶系数存为 `f_dc_0..2`，其余 45 个存为 `f_rest_0..44`，按通道优先（channel-major）排列。要把 RGB 颜色转换成 DC 系数，使用 $k_{00} = (c - 0.5)/C_0$。

## 2. 投影：EWA 泼溅

为了进行光栅化，每个 3D 高斯都必须变成图像上的一个 2D 高斯。如果相机映射是仿射的（affine），这一步就是精确的：高斯经过仿射变换后仍是高斯。透视投影不是仿射的，因此 3DGS 沿用了 **EWA 泼溅**（EWA splatting）（Zwicker, Pfister, van Baar & Gross, IEEE TVCG 2002），在高斯均值附近对投影进行线性化。

设 $W$ 为世界到相机的旋转，$\mathbf t = W\boldsymbol\mu + \mathbf t_{cw}$ 为相机坐标系下的均值。透视映射 $\phi(\mathbf t) = (f_x t_x/t_z + c_x,\ f_y t_y/t_z + c_y)$ 的雅可比矩阵（Jacobian）为

$$
J = \frac{\partial \phi}{\partial \mathbf t} =
\begin{pmatrix}
\dfrac{f_x}{t_z} & 0 & -\dfrac{f_x t_x}{t_z^2} \\[8pt]
0 & \dfrac{f_y}{t_z} & -\dfrac{f_y t_y}{t_z^2}
\end{pmatrix},
$$

一阶泰勒展开给出**屏幕空间协方差（screen-space covariance）**

$$
\Sigma' = J\, W\, \Sigma\, W^\top J^\top \in \mathbb R^{2\times 2},
$$

2D 均值为 $\boldsymbol\mu' = \phi(\mathbf t)$。（论文中用的是 $3\times3$ 雅可比矩阵，然后去掉第三行和第三列；$2\times3$ 的形式与之等价。）对于小高斯，这一近似非常好；而对于相对其距离而言很大的高斯，近似会变差，这导致了一些伪影，后续工作用光线追踪或精确投影来解决这些问题。

### 2.1 0.3 低通滤波

在使用之前，3DGS 会加上一个小的各向同性项：

$$
\Sigma'_{\text{2D}} = \Sigma' + 0.3\, I.
$$

在 EWA 泼溅中，屏幕空间的足迹（footprint）会与一个像素重建/低通滤波器（low-pass filter）做卷积，使得一个泼溅点（splat）永远不会小于约一个像素，从而在高斯投影到亚像素尺寸时避免走样（aliasing）和空洞。加上 $0.3 I$ 正是与一个方差为 0.3 像素² 的高斯做卷积。这也是麻烦的来源：这种膨胀是以像素为单位的，因此在某一分辨率下优化好的高斯，在另一分辨率下渲染时会显得过细或过胖，这正是 Mip-Splatting（第 5 篇）背后的主要观察。

### 2.2 代码：投影与逐像素 alpha

```python
def project_gaussian(mu, Sigma, Rcw, tcw, fx, fy, cx, cy, W, H, dilation=0.3):
    """EWA projection of one 3D Gaussian (OpenCV camera: x right, y down, z forward).
    Returns the 2D mean (pixels), the 2x2 screen-space covariance and the depth."""
    t = Rcw @ mu + tcw                             # camera-space mean
    # clamp the point to a slightly enlarged frustum before linearizing (as the official code does)
    lim_x, lim_y = 1.3 * (W / 2) / fx, 1.3 * (H / 2) / fy
    tx = np.clip(t[0] / t[2], -lim_x, lim_x) * t[2]
    ty = np.clip(t[1] / t[2], -lim_y, lim_y) * t[2]
    tz = t[2]
    J = np.array([[fx / tz, 0.0, -fx * tx / tz**2],  # Jacobian of the perspective map at t
                  [0.0, fy / tz, -fy * ty / tz**2]])
    T = J @ Rcw                                     # world -> screen linearization
    cov2d = T @ Sigma @ T.T + dilation * np.eye(2)  # low-pass: at least ~one pixel wide
    mean2d = np.array([fx * t[0] / tz + cx, fy * t[1] / tz + cy])
    return mean2d, cov2d, tz

def screen_extent(cov2d):
    """Conic (inverse covariance) and a 3-sigma radius in pixels, used to find covered tiles."""
    a, b, c = cov2d[0, 0], cov2d[0, 1], cov2d[1, 1]
    det = a * c - b * b
    conic = np.array([c, -b, a]) / det             # entries of Sigma'^{-1}: (A, B, C)
    mid = 0.5 * (a + c)
    lam_max = mid + np.sqrt(max(0.1, mid * mid - det))
    return conic, int(np.ceil(3.0 * np.sqrt(lam_max)))

def gaussian_alpha(pix, mean2d, conic, opacity):
    """alpha = o * exp(-0.5 d^T Sigma'^{-1} d), clamped like the reference rasterizer."""
    d = pix - mean2d
    power = -0.5 * (conic[0] * d[..., 0]**2 + conic[2] * d[..., 1]**2) - conic[1] * d[..., 0] * d[..., 1]
    alpha = np.minimum(0.99, opacity * np.exp(np.minimum(power, 0.0)))
    return np.where(alpha < 1.0 / 255.0, 0.0, alpha)
```

可以用数值方法验证 `project_gaussian`：从 $\mathcal N(\boldsymbol\mu, \Sigma)$ 中采样大量点，用针孔模型对它们做精确投影，再把这些 2D 点的经验协方差与 `cov2d`（取 `dilation=0`）进行比较。对于深度为 5 的小高斯，两者大约有三位有效数字一致。把 $t_x/t_z$ 截断到半视场角的 $1.3\times$ 与参考 CUDA 代码一致，可以防止远在图像之外的高斯的雅可比矩阵数值爆炸。

## 3. 光栅化

### 3.1 α 混合

对于像素 $\mathbf p$，取与之重叠的高斯，按深度从前到后排序。每个高斯贡献一个不透明度

$$
\alpha_i(\mathbf p) = o_i \exp\!\Big( -\tfrac12 (\mathbf p - \boldsymbol\mu'_i)^\top {\Sigma'_{\text{2D},i}}^{-1} (\mathbf p - \boldsymbol\mu'_i) \Big),
$$

颜色的合成方式与 NeRF 的数值积分（quadrature）完全相同：

$$
C(\mathbf p) = \sum_{i=1}^{N_{\mathbf p}} \mathbf c_i\, \alpha_i \prod_{j=1}^{i-1} (1 - \alpha_j) = \sum_i \mathbf c_i\, \alpha_i\, T_i .
$$

公式是一样的；变化的是采样点从何而来。NeRF 沿光线采样点并对一个场求值；3DGS 则按排序后的顺序取一个像素所重叠的基元（primitive）。正因为这一等价性，3DGS 可以原封不动地复用 NeRF 的数据集、损失函数和评价指标。

参考光栅化器额外加入了三条数值规则：$\alpha$ 最多截断为 0.99；$\alpha < 1/255$ 的贡献被跳过；一旦 $T$ 将要降到 $10^{-4}$ 以下，该像素就停止计算，这称为 **提前终止**（early termination）。

### 3.2 基于图块的排序

朴素的实现会对每个像素分别排序高斯，代价高得令人望而却步。3DGS 使用一个用 CUDA 编写的基于图块（tile）的软件光栅化器：

1. **预处理**（每个高斯一个线程）：对高斯做视锥剔除（frustum culling）（近平面，以及保护带（guard band）之外），计算 $\boldsymbol\mu'$、$\Sigma'_{\text{2D}}$、conic、SH 颜色和 3$\sigma$ 半径，并统计该半径覆盖了多少个 $16\times16$ 的**图块**。
2. **带键复制**：为每个（高斯，图块）对生成一个条目，附带一个 64 位键，其高 32 位是图块索引，低 32 位是视空间深度（以浮点数的位模式表示，对正数而言可以正确排序）。
3. **一次全局基数排序**（radix sort），对所有键排序（使用 CUB 中的 GPU 基数排序）。排序之后，条目按图块分组，并在每个图块内按深度排序。
4. **查找范围**：对每个图块，找到其条目在排序列表中的起始和结束位置。
5. **混合**（每个图块一个线程块，每个像素一个线程）：线程协作把一批批高斯加载到共享内存中，每个像素从前到后遍历列表，累积颜色和 $T$，直到饱和。

按图块而不是按像素排序是一种近似：在一个图块内，所有像素都使用同一个高斯中心的深度顺序，当相机移动导致顺序变化时，可能出现“跳变（popping）”。后续工作（例如 StopThePop, Radl et al., SIGGRAPH 2024）实现了更精确的逐像素排序。

### 3.3 反向传播与梯度

训练需要 $\partial \mathcal L / \partial$ 每一个参数。混合阶段的反向传播以**从后到前**的顺序访问同样的逐图块列表。它从最终透射率 $T_{N+1}$（在前向传播中保存）出发，通过除法 $T_i = T_{i+1}/(1-\alpha_i)$ 恢复每个 $T_i$，因此无需为每个像素保存中间值列表。设 $C = \sum_i \mathbf c_i \alpha_i T_i$，并令 $B_i = \sum_{j>i} \mathbf c_j \alpha_j T_j / T_{i+1}$ 为高斯 $i$ 之后累积的颜色（经过归一化），则

$$
\frac{\partial C}{\partial \mathbf c_i} = \alpha_i T_i,
\qquad
\frac{\partial C}{\partial \alpha_i} = T_i\,\big(\mathbf c_i - B_i\big).
$$

直观地说，让高斯 $i$ 更不透明会加入它自己的颜色，但同时遮住它后面的内容。从 $\partial/\partial\alpha_i$ 出发，链式法则传递到不透明度 $o_i$、conic 和 2D 均值 $\boldsymbol\mu'_i$，再经过 EWA 投影传到 $\Sigma$、$\mathbf q$、$\mathbf s$ 和 $\boldsymbol\mu$，并经过 SH 求值传到系数（以及通过视线方向传到 $\boldsymbol\mu$）。参考实现在 CUDA 中手写了所有这些导数；自动求导框架（如下面的代码）可以自动得到它们，但要慢得多。

### 3.4 PyTorch 中的稠密可微泼溅渲染器

为了让方法更具体，下面是一个约 40 行的完整可微渲染器。它跳过图块，在每个像素上对每个高斯求值，这对于 $64\times64$ 的图像和几百个高斯来说完全够用；它每张图像只按深度排序一次（与上文相同的近似）。它使用相同的参数化、EWA 投影、0.3 低通滤波和混合方式，为了保持简短，用普通 RGB 代替 SH。

```python
import math, torch, torch.nn.functional as F

def quat_to_rotmat_t(q):
    q = F.normalize(q, dim=-1)
    w, x, y, z = q.unbind(-1)
    return torch.stack([1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
                        2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
                        2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)], -1).view(-1, 3, 3)

def render(params, Rcw, tcw, fx, fy, W, H, bg=1.0):
    """Dense differentiable splatting (no tiles): every Gaussian is evaluated at every pixel.
    params: dict with means (N,3), quats (N,4), log_scales (N,3), opacity_logits (N,), rgb_logits (N,3)."""
    mu = params["means"]
    t = mu @ Rcw.T + tcw                                         # camera space (OpenCV)
    tz = t[:, 2].clamp(min=1e-3)
    J = torch.zeros(len(mu), 2, 3)
    J[:, 0, 0], J[:, 0, 2] = fx / tz, -fx * t[:, 0] / tz**2
    J[:, 1, 1], J[:, 1, 2] = fy / tz, -fy * t[:, 1] / tz**2
    M = quat_to_rotmat_t(params["quats"]) * torch.exp(params["log_scales"])[:, None, :]   # R S
    Sigma = M @ M.transpose(1, 2)
    T = J @ Rcw
    cov = T @ Sigma @ T.transpose(1, 2) + 0.3 * torch.eye(2)    # EWA + low-pass
    mean2d = torch.stack([fx * t[:, 0] / tz + W / 2, fy * t[:, 1] / tz + H / 2], -1)
    conic = torch.linalg.inv(cov)                                # (N, 2, 2)
    ys, xs = torch.meshgrid(torch.arange(H) + 0.5, torch.arange(W) + 0.5, indexing="ij")
    pix = torch.stack([xs, ys], -1).reshape(-1, 2)              # (P, 2)
    d = pix[None] - mean2d[:, None]                              # (N, P, 2)
    power = -0.5 * torch.einsum("npi,nij,npj->np", d, conic, d)
    alpha = (torch.sigmoid(params["opacity_logits"])[:, None] * torch.exp(power)).clamp(max=0.99)
    alpha = alpha * (t[:, 2:3] > 0.2)                            # cull Gaussians behind the camera
    order = torch.argsort(tz)                                    # front to back
    alpha, rgb = alpha[order], torch.sigmoid(params["rgb_logits"])[order]
    trans = torch.cumprod(torch.cat([torch.ones_like(alpha[:1]), 1 - alpha[:-1]], 0), 0)
    w = alpha * trans                                            # (N, P): w_i = T_i alpha_i
    img = w.T @ rgb + (1 - w.sum(0))[:, None] * bg
    return img.reshape(H, W, 3)
```

## 4. 损失函数

3DGS 对每张训练图像最小化

$$
\mathcal L = (1 - \lambda)\, \mathcal L_1 + \lambda\, \mathcal L_{\text{D-SSIM}},
\qquad \lambda = 0.2,
\qquad \mathcal L_{\text{D-SSIM}} = 1 - \operatorname{SSIM}(\hat I, I).
$$

L1 项对离群值鲁棒，能保持颜色准确；结构相似性（structural similarity）项在 $11\times11$ 高斯窗口中比较局部均值、方差和协方差，对模糊和结构敏感。与 NeRF 的 L2 损失相比，这能得到更锐利的结果。

```python
def ssim(x, y, C1=0.01**2, C2=0.03**2):
    """SSIM with an 11x11 Gaussian window (sigma 1.5), images (H, W, 3) in [0, 1]."""
    g = torch.exp(-((torch.arange(11) - 5.0) ** 2) / (2 * 1.5**2)); g = g / g.sum()
    win = (g[:, None] * g[None, :]).expand(3, 1, 11, 11)
    x, y = x.permute(2, 0, 1)[None], y.permute(2, 0, 1)[None]
    f = lambda z: F.conv2d(z, win, padding=5, groups=3)
    mx, my = f(x), f(y)
    sxx, syy, sxy = f(x * x) - mx**2, f(y * y) - my**2, f(x * y) - mx * my
    s = ((2 * mx * my + C1) * (2 * sxy + C2)) / ((mx**2 + my**2 + C1) * (sxx + syy + C2))
    return s.mean()

def loss_fn(pred, gt, lam=0.2):
    return (1 - lam) * (pred - gt).abs().mean() + lam * (1 - ssim(pred, gt))
```

现在我们可以把高斯拟合到多视角图像上了。我们随机生成一组包含 150 个高斯的“真值”集合，从五个相机渲染它，再用 Adam 和逐参数的学习率优化另一组随机初始化的高斯：

```python
torch.manual_seed(0)

def look_at_t(C, target=torch.zeros(3)):
    z = F.normalize(target - C, dim=0); x = F.normalize(torch.linalg.cross(torch.tensor([0., -1., 0.]), z), dim=0)
    R = torch.stack([x, torch.linalg.cross(z, x), z]); return R, -R @ C

def random_gaussians(n, spread):
    return {"means": (torch.rand(n, 3) - 0.5) * spread, "quats": torch.randn(n, 4),
            "log_scales": torch.full((n, 3), math.log(0.08)) + 0.3 * torch.randn(n, 3),
            "opacity_logits": torch.full((n,), 2.0), "rgb_logits": torch.randn(n, 3) * 2}

W = H = 64; fx = fy = 70.0
cams = [look_at_t(torch.tensor([3 * math.sin(a), -0.6, -3 * math.cos(a)])) for a in torch.linspace(-0.8, 0.8, 5)]
gt_scene = random_gaussians(150, 1.6)
with torch.no_grad():
    targets = [render(gt_scene, R, t, fx, fy, W, H) for R, t in cams]

model = {k: v.clone().requires_grad_(True) for k, v in random_gaussians(150, 1.6).items()}
model["opacity_logits"].data.fill_(-2.2)                       # sigmoid(-2.2) ~ 0.1, as in 3DGS
lrs = {"means": 1e-2, "quats": 1e-2, "log_scales": 5e-3, "opacity_logits": 5e-2, "rgb_logits": 2.5e-2}
opt = torch.optim.Adam([{"params": [model[k]], "lr": lr} for k, lr in lrs.items()], eps=1e-15)
for it in range(601):
    k = it % len(cams)
    pred = render(model, *cams[k], fx, fy, W, H)
    loss = loss_fn(pred, targets[k])
    opt.zero_grad(); loss.backward(); opt.step()
    if it % 150 == 0:
        with torch.no_grad():
            mse = torch.stack([((render(model, R, t, fx, fy, W, H) - g) ** 2).mean()
                               for (R, t), g in zip(cams, targets)]).mean()
        print(f"iter {it:4d}  loss {loss.item():.4f}  PSNR {-10 * torch.log10(mse).item():.1f} dB")
```

在单个 CPU 线程上运行大约需要一分钟，训练视角的 PSNR 在 600 次迭代内从 12.0 dB 提升到 33.2 dB（150 次迭代后为 27.6 dB）。由于没有致密化（densification），它只能移动并重塑一开始的 150 个高斯；真正的方法还会改变高斯的数量。

## 5. 初始化

3DGS 从 COLMAP 在估计相机时得到的**稀疏 SfM 点云（sparse SfM point cloud）**出发（第 1 篇）：每个点一个高斯，其中

- 均值位于该点处，SH 的 DC 分量取自该点的颜色（高阶 SH 为零）；
- 各向同性的缩放等于该点到其三个最近邻的平均距离（以对数形式存储）；
- 旋转为单位旋转，不透明度为 0.1。

在包围盒内随机初始化对合成场景同样可行，但在真实的无界（unbounded）采集场景上效果明显更差；优质的 SfM 点很重要，尤其是在背景区域。

## 6. 自适应密度控制

初始点数量太少且分布不佳。每 100 次迭代（在 500 次迭代的预热之后，直到第 15,000 次迭代为止），3DGS 都会利用一个简单的信号来调整高斯集合：损失对每个高斯的 **2D 投影均值**的梯度大小，并在该高斯可见的各视角上取平均。较大的视空间位置梯度意味着优化器正在努力移动这个高斯，这通常发生在尚未重建好的区域。对于平均值超过 $\tau_{\text{pos}} = 0.0002$ 的高斯：

- **克隆（clone）**小高斯（最大缩放小于场景范围的 1%）：对应**欠重建**（under-reconstruction），即一个小高斯不得不覆盖缺失的几何。添加一个副本，之后优化器会沿梯度方向把两者拉开。
- **分裂（split）**大高斯：对应**过重建**（over-reconstruction），即一个大高斯覆盖了一个方差很大的区域。它被两个新高斯取代，新高斯的均值以原高斯为概率密度（PDF）进行采样，缩放除以 $\phi = 1.6$。

在同样的步骤中，**剪枝（prune）**不透明度低于 $\epsilon_\alpha = 0.005$ 的高斯，以及（在第一次不透明度重置之后）在世界空间或屏幕空间中非常大的高斯。

每 3000 次迭代，**不透明度重置（opacity reset）**会把所有不透明度设为至多 0.01。靠近相机的漂浮物（floaters）往往会被致密化保留下来；重置之后，真正需要的高斯会很快重新获得不透明度，而其他高斯则保持透明并被剪枝。这些阈值中使用的场景“范围”是根据相机中心的分布半径计算的。

下面是一个作用于 3.4 节参数字典的紧凑实现：

```python
def densify_and_prune(params, grad_accum, denom, extent, grad_thresh=2e-4,
                      percent_dense=0.01, min_opacity=0.005, n_split=2):
    """One adaptive density control step in the spirit of 3DGS.
    grad_accum: (N,) sum of view-space positional gradient norms; denom: (N,) number of views."""
    grads = grad_accum / denom.clamp(min=1)
    big_grad = grads >= grad_thresh
    max_scale = torch.exp(params["log_scales"]).max(-1).values
    clone = big_grad & (max_scale <= percent_dense * extent)    # under-reconstruction: copy
    split = big_grad & (max_scale > percent_dense * extent)     # over-reconstruction: split

    new = {k: [v.detach()] for k, v in params.items()}
    for k, v in params.items():                                  # clones are exact copies
        new[k].append(v.detach()[clone])
    # splits: sample n_split new means from the parent Gaussian, shrink scales by 1.6
    std = torch.exp(params["log_scales"].detach()[split]).repeat(n_split, 1)
    R = quat_to_rotmat_t(params["quats"].detach()[split]).repeat(n_split, 1, 1)
    offset = (R @ (torch.randn_like(std) * std)[..., None]).squeeze(-1)
    for k, v in params.items():
        child = v.detach()[split].repeat(n_split, *[1] * (v.dim() - 1))
        if k == "means":
            child = child + offset
        elif k == "log_scales":
            child = child - math.log(1.6)
        new[k].append(child)
    keep_parent = torch.cat([~split, torch.ones(int(clone.sum()) + n_split * int(split.sum()), dtype=torch.bool)])
    out = {k: torch.cat(v)[keep_parent] for k, v in new.items()}  # parents of splits are removed
    alive = torch.sigmoid(out["opacity_logits"]) > min_opacity   # prune transparent Gaussians
    return {k: v[alive].clone().requires_grad_(True) for k, v in out.items()}

def reset_opacity(params, value=0.01):
    """Every 3000 iterations: clamp opacities down so that floaters must 'earn' their opacity back."""
    with torch.no_grad():
        cap = torch.logit(torch.tensor(value))
        params["opacity_logits"].copy_(torch.minimum(params["opacity_logits"], cap))
```

两个实践细节：视空间梯度是在 `loss.backward()` 之后从 2D 均值上读取的（官方代码中，通过对一个保存屏幕空间均值的占位张量调用 `retain_grad()` 来实现）；并且每次致密化之后，都必须为新高斯扩展优化器状态（Adam 的矩估计），并为被移除的高斯过滤掉相应状态；参考代码通过就地修改优化器的状态张量来做到这一点。基于阈值的致密化是一种启发式方法，后续有多项工作取代了它，例如把高斯视为 MCMC 样本并使用固定预算（3DGS-MCMC, NeurIPS 2024）。

## 7. 训练配方

综合起来，参考实现以批大小 1（每次迭代随机取一张训练图像）训练 **30,000 次迭代**：

| 组成部分 | 参考代码中的设置 |
| --- | --- |
| 优化器 | Adam，每个参数组使用单独的学习率 |
| 位置学习率 | $1.6\times10^{-4}$ 乘以场景范围，在 30k 次迭代内指数衰减到 $1.6\times10^{-6}$ |
| 其他学习率 | SH DC $2.5\times10^{-3}$（高阶 $/20$），不透明度 $0.05$（后续版本有所降低），缩放 $5\times10^{-3}$，旋转 $10^{-3}$ |
| SH 调度 | 从 0 阶开始，每 1000 次迭代增加一阶，直到 3 阶 |
| 致密化 | 从第 500 到第 15,000 次迭代，每 100 次迭代一次；每 3000 次迭代重置不透明度 |
| 损失 | $0.8\,\mathcal L_1 + 0.2\,\mathcal L_{\text{D-SSIM}}$ |
| 背景 | 黑色或白色（对合成数据可选用随机背景） |

SH 调度很重要：如果随视角变化的系数从一开始就是自由的，模型就可能把几何误差“画”进随视角变化的颜色中来解释它们，这样从训练视角看是对的，从其他视角看就错了。论文还报告了一个 7,000 次迭代的设置，几分钟内就能得到不错的质量，而完整的 30k 次训练在单张高端 GPU 上需要几十分钟。最终结果通常是一百万到几百万个高斯。

在标准基准（Mip-NeRF 360、Tanks and Temples、Deep Blending）上，论文报告的质量与 Mip-NeRF 360 相当或更好，训练时间与第 3 篇中最快的网格方法相当，并能在 1080p 下实时渲染。它的主要弱点（下一篇会进行综述）包括：内存占用；渲染分辨率与训练分辨率不同时的走样；几何对生成图像而言足够好，但并非精确的表面；近似排序导致的跳变；以及对优质 SfM 的依赖。

## 8. 动手试试：“高斯世界”演示

主页上的[交互实验室]({{ '/' | relative_url }}#lab)有一个名为 **“高斯世界”** 的标签页：一个由约二十万个 3D 高斯构成、可编辑的开放世界，基于 WebGL 2 运行，没有任何依赖。它实现了本文的*渲染部分*：

- 每个高斯都有中心、旋转坐标系、三个缩放、一个颜色和一个不透明度，其 3D 协方差通过透视映射的雅可比矩阵投影为屏幕空间的椭圆（第 2 节），并在顶点着色器中对 2D 协方差加上同样的 $0.3$ 膨胀；
- 泼溅点每帧都按深度排序（在 Web Worker 中使用 16 位计数排序，而不是基于图块的基数排序），并从后到前进行 α 合成；在使用预乘 alpha（premultiplied alpha）时，这在数学上与 3.1 节中从前到后的求和完全相同；
- 调试视图（“椭球”“中心点”“重叠热图”“深度”）可以让你看到单个高斯、它们的中心、每个像素上重叠了多少个泼溅点以及深度，很像官方 SIBR 查看器的椭球模式。

它与 3DGS 有一个重要区别：**其中没有任何东西是训练出来的。** 这些高斯是由一个关键词驱动的生成器（地形、湖泊、树木、村庄、天气）根据文本提示程序化生成的，用来代替一个学习得到的文本到世界（text-to-world）模型。而且，每个高斯携带的不是烘焙好的球谐辐射，而是反照率（albedo）和法线，并在 GPU 上针对一天中的任意时刻进行**重光照**（relighting），带有来自泼溅阴影贴图的太阳阴影、风的动画和四季变化。地形高斯每帧都会根据一个可编辑的高度场（heightfield）重新推导其高度、法线和材质，因此你可以对世界进行雕刻和绘制。一个采集得到的 3DGS 场景如果没有第 5 篇中的重光照与编辑方面的研究，就做不到这些：它的颜色中烘焙了采集时的光照。

用这个演示来建立直觉：放大直到能看到单个椭圆，观察细长的高斯如何与表面对齐，并留意排序顺序的变化如何偶尔引起跳变——这正是 3.2 节讨论的那种伪影。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Surface Splatting (Zwicker, Pfister, van Baar & Gross) | SIGGRAPH | 2001 | — | 使用椭圆高斯泼溅点的基于点的渲染 |
| EWA Splatting (Zwicker, Pfister, van Baar & Gross) | IEEE TVCG | 2002 | [DOI](https://doi.org/10.1109/TVCG.2002.1021576) | 带低通滤波的高斯核投影 |
| Plenoxels: Radiance Fields without Neural Networks (Fridovich-Keil, Yu et al.) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2112.05131) | SH 颜色与显式优化，直接的前身 |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al.) | ACM TOG 42(4) / SIGGRAPH | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) · [DOI](https://doi.org/10.1145/3592433) | 本文讲解的方法 |
| gsplat: An Open-Source Library for Gaussian Splatting (Ye et al.) | arXiv | 2024 | [arXiv](https://arxiv.org/abs/2409.06765) | nerfstudio 使用的模块化 CUDA 光栅化器 |
| 3D Gaussian Splatting as Markov Chain Monte Carlo (Kheradmand et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2404.09591) | 有理论依据地取代克隆/分裂启发式 |
| 3D Gaussian Ray Tracing: Fast Tracing of Particle Scenes (Moenne-Loccoz et al.) | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2407.07090) | 光线追踪的高斯：畸变相机、次级光线 |

## 学习资源

- 官方[项目主页](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)与[代码](https://github.com/graphdeco-inria/gaussian-splatting)（PyTorch 训练、`diff-gaussian-rasterization` 中的 CUDA 光栅化器、SIBR 查看器）。把 `gaussian_model.py`、`train.py` 和 `forward.cu` / `backward.cu` 与本文对照阅读，是学习细节的最佳方式。
- [gsplat](https://github.com/nerfstudio-project/gsplat) 及其文档，其中包含梯度的推导以及简洁的 Python 参考实现。
- [nerfstudio splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html)，一个文档完善的重新实现。
- M. Zwicker 等人，"EWA Splatting"（2002）中关于重采样滤波器（resampling filter）的章节，是第 2 节背后的理论。

## 练习

1. 证明 $\Sigma = R S S^\top R^\top$ 是半正定的，且其特征向量是 $R$ 的各列。
2. 通过对 $u = f_x t_x / t_z$ 和 $v = f_y t_y/t_z$ 求导推导出 $J$，并用有限差分验证 `project_gaussian`。
3. 在 PyTorch 渲染器中，把膨胀从 0.3 改为 0，并在 $64\times64$ 下训练；然后在 $256\times256$ 下渲染（把 $f_x, f_y$ 乘以 4）。你看到了什么？0.3 的膨胀又如何改变这一结果？
4. 为渲染器加入 1 阶 SH：存储形状为 `(N, 4, 3)` 的 `sh`，并用从相机中心指向每个均值的视线方向对其求值。使用第 7 节的 SH 调度进行训练。
5. 把 `densify_and_prune` 集成到训练循环中：累积 `mean2d.grad.norm(dim=-1)`（调用 `mean2d.retain_grad()`），每 100 次迭代致密化一次，重新创建优化器，并将最终 PSNR 与固定数量的版本进行比较。

**下一篇：** [第 5 篇]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})将综述 3DGS 之后的发展：抗锯齿、表面、动态、压缩、SLAM、前馈模型、生成、重光照、物理以及 AR/VR。
