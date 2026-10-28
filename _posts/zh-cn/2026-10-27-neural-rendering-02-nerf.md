---
layout: post
title: "NeRF：神经辐射场与可微体渲染"
date: 2026-10-27 12:02:00+0900
description: "体渲染方程及其数值求积、位置编码、NeRF 的 MLP、分层采样与光度损失，附一个最小的 PyTorch NeRF 实现，以及后续工作 Mip-NeRF、Mip-NeRF 360 和 NeRF in the Wild。"
categories: neural-rendering
tags: [nerf, volume-rendering, positional-encoding, pytorch, mip-nerf]
series: neural-rendering
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

在[第 1 篇]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})中，我们从照片中恢复出了标定好的相机。NeRF（Mildenhall et al., ECCV 2020）回答了下一个问题：给定这些相机和图像，什么样的 3D 表示能把它们重新渲染出来？它的答案是**神经辐射场**（neural radiance field）：一个把 3D 点和观察方向映射为密度和颜色的小型 MLP，并用经典的**体渲染**（volume rendering）进行渲染。由于每一步都是可微的，整个场景只需光度损失（photometric loss）和梯度下降就能拟合出来。

NeRF 是本系列几乎所有内容在概念上的源头：快速的基于网格的场（第 3 篇）保留了它的渲染方程，只是替换掉了 MLP；3D 高斯泼溅（3D Gaussian Splatting，第 4 篇）保留了同样的 α 合成公式，只是把光线步进（ray marching）换成了光栅化（rasterization）。理解第 2 节中的数值求积（quadrature）是本文最重要的收获。

## 前置知识

- 相机、内参（intrinsics）与相机到世界（camera-to-world）矩阵（第 1 篇）。
- 图形学系列中的光线追踪（ray tracing）与蒙特卡洛估计（Monte Carlo estimation）；辐射亮度（radiance）的概念。
- PyTorch：`nn.Module`、自动求导（autograd）、Adam。

## 1. 把场景看作辐射场

NeRF 把静态场景表示为一个连续函数

$$
F_\Theta : (\mathbf x, \mathbf d) \mapsto (\mathbf c, \sigma),
$$

其中 $\mathbf x \in \mathbb R^3$ 是位置，$\mathbf d$ 是单位观察方向，$\mathbf c \in [0,1]^3$ 是沿方向 $\mathbf d$ 发出的 RGB 辐射亮度，$\sigma \ge 0$ 是**体密度**（volume density）：光线在 $\mathbf x$ 处被阻挡的微分概率，单位为长度的倒数。$\Theta$ 是 MLP 的权重。

有两个建模选择至关重要：

1. **密度只依赖于位置。** 几何必须在每个视点下都相同；否则网络就可以“作弊”，在每个训练视图中放置不同的表面。颜色同时依赖于 $\mathbf x$ 和 $\mathbf d$，这让场能够重现镜面高光（specular highlight）和其他视角相关（view-dependent）的效果。
2. **没有显式表面。** 这里没有网格（mesh）或法线，只有一个柔和的密度场。表面出现在 $\sigma$ 变大的地方。正是这一点使该表示易于优化：梯度会流向光线上的每一个采样点，而不只是单个交点。

这里也没有光照模型：$\mathbf c$ 是出射辐射亮度，光照已经“烘焙”在其中。用图形学系列的语言来说，NeRF 直接学习 $L_o(\mathbf x, \omega_o)$，而不是 BRDF 和光源。这就是为什么不做进一步的工作，NeRF 就无法重新打光（relight）。

## 2. 体渲染

### 2.1 连续方程

从相机中心穿过一个像素投射一条光线 $\mathbf r(t) = \mathbf o + t\mathbf d$，近、远边界分别为 $t_n, t_f$。在发射–吸收模型（emission–absorption model，无散射；Max, 1995；Kajiya & Von Herzen, 1984）下，期望颜色为

$$
C(\mathbf r) = \int_{t_n}^{t_f} T(t)\, \sigma(\mathbf r(t))\, \mathbf c(\mathbf r(t), \mathbf d)\, dt,
\qquad
T(t) = \exp\!\left( -\int_{t_n}^{t} \sigma(\mathbf r(s))\, ds \right).
$$

$T(t)$ 是**透射率**（transmittance）：光线从 $t_n$ 传播到 $t$ 而未被吸收的概率。乘积 $T(t)\sigma(t)$ 是光线恰好终止于 $t$ 的概率密度，因此 $C$ 是终止点处颜色的期望。它还给出了深度估计 $\int T\sigma\, t\, dt$ 和不透明度（opacity）$1 - T(t_f)$。

### 2.2 数值求积：从积分到 α 合成

我们在 $N$ 个采样点 $t_1 < \dots < t_N$ 处求值场，并令 $\delta_i = t_{i+1} - t_i$。假设在区间 $[t_i, t_{i+1}]$ 上 $\sigma$ 和 $\mathbf c$ 为常数 $\sigma_i$ 和 $\mathbf c_i$。在该区间上，从 $t_i$ 起的透射率按 $e^{-\sigma_i (t - t_i)}$ 衰减，因此该区间的贡献为

$$
\int_{t_i}^{t_{i+1}} T(t)\sigma_i \mathbf c_i\, dt
= T_i\, \mathbf c_i \int_0^{\delta_i} \sigma_i e^{-\sigma_i s}\, ds
= T_i \left(1 - e^{-\sigma_i \delta_i}\right) \mathbf c_i,
$$

其中 $T_i = T(t_i) = \exp(-\sum_{j<i} \sigma_j \delta_j)$。定义区间的**不透明度** $\alpha_i = 1 - e^{-\sigma_i\delta_i}$，就得到了 NeRF 的估计量：

$$
\hat C(\mathbf r) = \sum_{i=1}^{N} w_i\, \mathbf c_i,
\qquad
w_i = T_i\, \alpha_i,
\qquad
T_i = \prod_{j=1}^{i-1} (1 - \alpha_j).
$$

这恰好就是图形学系列中使用 “over” 算子的从前到后 **α 合成**（alpha compositing）：每个采样点覆盖仍然可见部分中的 $\alpha_i$ 比例，而 $T_i$ 是它前方剩余的可见度。请记住这个公式：在第 4 篇中，3D 高斯泼溅用*完全相同*的表达式来合成排好序的高斯，只不过 $\alpha_i$ 来自投影后的 2D 高斯，而不是来自 $\sigma_i\delta_i$。

几个实践细节：

- 权重满足 $\sum_i w_i = 1 - T_{N+1} \le 1$。剩余部分是光线逃逸的概率；加上 $(1-\sum_i w_i)\,\mathbf c_{\text{bg}}$ 即可合成背景色（Blender 合成场景使用白色）。
- 如果光线方向未归一化，要把 $\delta_i$ 乘以 $\lVert \mathbf d \rVert$，使密度以世界单位计量。
- 最后一个区间设为一个巨大的值（$10^{10}$），使最后一个采样点吸收剩下的全部。
- 采样是**分层随机**的（stratified）：$t_i \sim \mathcal U\!\left[t_n + \tfrac{i-1}{N}(t_f - t_n),\, t_n + \tfrac{i}{N}(t_f - t_n)\right]$。每次迭代对位置进行抖动，使 MLP 看到的是连续的位置集合而非固定的网格，从而避免对采样位置产生混叠（aliasing）。

## 3. 位置编码

直接以 $(x, y, z, \theta, \phi)$ 为输入的普通 MLP 会产生模糊的结果。神经网络偏向于低频函数（即**频谱偏置**，spectral bias），因此精细纹理和锐利边缘的学习极其缓慢。NeRF 先把每个输入坐标 $p$ 通过一个固定的**位置编码**（positional encoding）进行映射：

$$
\gamma(p) = \big( \sin(2^0\pi p), \cos(2^0\pi p), \sin(2^1\pi p), \cos(2^1\pi p), \dots, \sin(2^{L-1}\pi p), \cos(2^{L-1}\pi p) \big),
$$

位置使用 $L = 10$（输入大致归一化到 $[-1,1]$），方向使用 $L = 4$。原始代码还会拼接原始输入 $p$，并省略了因子 $\pi$；两种变体都可行。Tancik et al.（NeurIPS 2020）解释了这为什么有效：从神经正切核（neural tangent kernel）的角度看，傅里叶特征映射（Fourier feature mapping）把网络的等效核变成一个平稳核，其带宽由频率决定，因此高频细节变得可以学习。频率过多会导致带噪声、过拟合的结果；编码本质上是一个带宽旋钮。

## 4. 网络结构

论文中的 MLP：

- 8 个宽度为 256、使用 ReLU 的全连接层，输入为 $\gamma(\mathbf x)$（包含原始输入时为 63 个数），并通过一个**跳跃连接**（skip connection）把 $\gamma(\mathbf x)$ 再次拼接到第五层。
- 一个线性头输出 $\sigma$（经过 ReLU，使 $\sigma\ge 0$），以及一个 256 维的特征向量。
- 该特征与 $\gamma(\mathbf d)$（27 个数）拼接后，经过一个宽度为 128 的层，再接 sigmoid 输出 RGB。

这一结构强制实现了第一个建模选择：$\sigma$ 在看到方向之前就已计算出来。

## 5. 分层采样

均匀采样会把大部分求值浪费在空白空间和被遮挡区域上。NeRF 训练**两个**网络：

1. 一个**粗**（coarse）网络，在 $N_c = 64$ 个分层随机采样点上求值。它的权重 $w_i$ 构成沿光线的分段常数 PDF：$\hat w_i = w_i / \sum_j w_j$。
2. 通过**逆变换采样**（inverse transform sampling）从该 PDF 中再抽取 $N_f = 128$ 个采样点（抽取 $u\sim\mathcal U[0,1)$，找到包含 $u$ 的 CDF 区间，在区间内线性插值）。这与路径追踪一文中用于 BRDF 的重要性采样（importance sampling）是同一个思想。
3. 一个**细**（fine）网络在全部 $N_c + N_f$ 个排好序的采样点上求值，并产生最终颜色。

两个网络都受到监督，因此粗网络能持续提供有用的 PDF。后来的工作（Mip-NeRF 360）用一个很小的“提议”（proposal）网络取代了粗 NeRF，它只被训练来为细网络的权重提供上界。

## 6. 训练

对于从所有训练像素中随机采样的一批光线 $\mathcal R$，损失为

$$
\mathcal L = \sum_{\mathbf r \in \mathcal R} \Big( \big\lVert \hat C_c(\mathbf r) - C(\mathbf r) \big\rVert_2^2 + \big\lVert \hat C_f(\mathbf r) - C(\mathbf r) \big\rVert_2^2 \Big).
$$

论文使用每批 4096 条光线、学习率从 $5\times 10^{-4}$ 指数衰减到 $5\times 10^{-5}$ 的 Adam，以及 10 万到 30 万次迭代，每个场景在单张 NVIDIA V100 上大约需要一到两天。渲染一张 $800\times800$ 的图像需要 $800^2 \times (64 + 192) \approx 1.6\times 10^8$ 次 MLP 求值，这就是 NeRF 渲染一帧需要数秒的原因，也是下一篇存在的原因。

评估在留出视图（held-out views）上使用 **PSNR**（对 $[0,1]$ 范围内的图像为 $-10\log_{10}\mathrm{MSE}$）、**SSIM** 和 **LPIPS**（一种学习得到的感知距离）。标准数据集是八个 Blender 合成场景（360° 渲染，$800\times800$）以及前向拍摄（forward-facing）的 LLFF 数据；对后者，NeRF 把空间变换到**归一化设备坐标**（normalized device coordinates，NDC）中，使无界的深度映射到有限区间。

## 7. 用 PyTorch 实现最小 NeRF

下面的代码是一个完整、自包含的 NeRF：光线生成、位置编码、论文中的 MLP、分层随机采样与分层采样，以及体渲染。它紧密遵循原始结构，同时保持可读性。

### 7.1 光线

```python
import torch, torch.nn as nn, torch.nn.functional as F

def get_rays(H, W, focal, c2w):
    """Rays for every pixel. c2w: 4x4 camera-to-world in the OpenGL/NeRF convention
    (x right, y up, camera looks along -z). Returns origins and directions, (H, W, 3)."""
    j, i = torch.meshgrid(torch.arange(H, dtype=torch.float32),
                          torch.arange(W, dtype=torch.float32), indexing="ij")
    dirs = torch.stack([(i + 0.5 - W / 2) / focal,
                        -(j + 0.5 - H / 2) / focal,
                        -torch.ones_like(i)], dim=-1)
    rays_d = dirs @ c2w[:3, :3].T                      # rotate into world space
    rays_o = c2w[:3, 3].expand(rays_d.shape)
    return rays_o, rays_d
```

负号来自 NeRF 的 `transforms.json` 所使用的 OpenGL 相机约定（见第 1 篇中的表格）：图像的行向下增长，而相机的 $y$ 轴朝上，且相机沿 $-z$ 方向观察。对于 COLMAP（OpenCV）位姿，需要去掉这两个负号。

### 7.2 编码与网络

```python
def positional_encoding(x, n_freqs, include_input=True):
    """gamma(p) = (sin(2^k pi p), cos(2^k pi p)), k = 0..L-1, applied per coordinate."""
    freqs = 2.0 ** torch.arange(n_freqs, dtype=x.dtype, device=x.device) * torch.pi
    xb = x[..., None, :] * freqs[:, None]              # (..., L, D)
    enc = torch.cat([torch.sin(xb), torch.cos(xb)], dim=-1).flatten(-2)
    return torch.cat([x, enc], dim=-1) if include_input else enc

class NeRF(nn.Module):
    """The original architecture: 8x256 trunk with a skip at layer 5, density head,
    then a 128-wide branch that also sees the encoded view direction."""
    def __init__(self, L_x=10, L_d=4, width=256, depth=8, skip=4):
        super().__init__()
        self.L_x, self.L_d, self.skip = L_x, L_d, skip
        in_x, in_d = 3 + 6 * L_x, 3 + 6 * L_d
        self.trunk = nn.ModuleList(
            [nn.Linear(in_x, width)] +
            [nn.Linear(width + (in_x if i == skip else 0), width) for i in range(1, depth)])
        self.sigma = nn.Linear(width, 1)
        self.feat = nn.Linear(width, width)
        self.rgb = nn.Sequential(nn.Linear(width + in_d, width // 2), nn.ReLU(),
                                 nn.Linear(width // 2, 3), nn.Sigmoid())

    def forward(self, x, d):
        ex = positional_encoding(x, self.L_x)
        ed = positional_encoding(F.normalize(d, dim=-1), self.L_d)
        h = ex
        for i, layer in enumerate(self.trunk):
            if i == self.skip:
                h = torch.cat([h, ex], dim=-1)         # skip connection
            h = F.relu(layer(h))
        sigma = F.softplus(self.sigma(h) - 1.0).squeeze(-1)  # density: position only (paper: ReLU)
        rgb = self.rgb(torch.cat([self.feat(h), ed], dim=-1))
        return rgb, sigma
```

当 $L_x = 10$ 时，位置编码有 $3 + 60 = 63$ 维；当 $L_d = 4$ 时，方向编码有 $3 + 24 = 27$ 维，与论文一致。我们对密度使用平移后的 softplus 而不是 ReLU：使用 ReLU 时，不走运的初始化可能导致处处 $\sigma = 0$，此时梯度无法到达密度头（原始代码通过在训练时向原始密度添加噪声来缓解这一问题；Mip-NeRF 则改用了 softplus）。

### 7.3 采样与渲染

```python
def stratified_samples(near, far, n_rays, n_samples, perturb=True):
    """t_i = near + (far - near) * (i + u_i) / N with u_i ~ U[0, 1)."""
    bins = torch.linspace(0.0, 1.0, n_samples + 1)[:-1].expand(n_rays, n_samples)
    u = torch.rand(n_rays, n_samples) if perturb else torch.full((n_rays, n_samples), 0.5)
    return near + (far - near) * (bins + u / n_samples)

def volume_render(rgb, sigma, t, rays_d, white_bkgd=False):
    """Quadrature of the volume rendering integral.
    rgb: (R, N, 3), sigma: (R, N), t: (R, N) sample distances along each ray."""
    delta = t[..., 1:] - t[..., :-1]
    delta = torch.cat([delta, torch.full_like(delta[..., :1], 1e10)], dim=-1)
    delta = delta * rays_d.norm(dim=-1, keepdim=True)        # distances in world units
    alpha = 1.0 - torch.exp(-sigma * delta)                   # opacity of each segment
    # T_i = prod_{j<i} (1 - alpha_j): exclusive cumulative product
    trans = torch.cumprod(torch.cat([torch.ones_like(alpha[..., :1]),
                                     1.0 - alpha + 1e-10], dim=-1), dim=-1)[..., :-1]
    weights = alpha * trans                                   # w_i = T_i * alpha_i
    color = (weights[..., None] * rgb).sum(dim=-2)
    depth = (weights * t).sum(dim=-1)
    acc = weights.sum(dim=-1)                                 # 1 - final transmittance
    if white_bkgd:
        color = color + (1.0 - acc[..., None])
    return color, depth, acc, weights

def sample_pdf(bins, weights, n_samples, deterministic=False):
    """Inverse-transform sampling of the piecewise-constant PDF given by `weights`
    on the intervals `bins` (R, N+1). Returns (R, n_samples) new sample positions."""
    weights = weights + 1e-5                                  # avoid NaNs on empty rays
    pdf = weights / weights.sum(dim=-1, keepdim=True)
    cdf = torch.cumsum(pdf, dim=-1)
    cdf = torch.cat([torch.zeros_like(cdf[..., :1]), cdf], dim=-1)   # (R, N+1)
    if deterministic:
        u = torch.linspace(0.0, 1.0, n_samples).expand(cdf.shape[0], n_samples).contiguous()
    else:
        u = torch.rand(cdf.shape[0], n_samples)
    idx = torch.searchsorted(cdf, u, right=True)
    below = (idx - 1).clamp(min=0)
    above = idx.clamp(max=cdf.shape[-1] - 1)
    cdf_b, cdf_a = cdf.gather(-1, below), cdf.gather(-1, above)
    bin_b, bin_a = bins.gather(-1, below), bins.gather(-1, above)
    denom = torch.where(cdf_a - cdf_b < 1e-5, torch.ones_like(cdf_a), cdf_a - cdf_b)
    return bin_b + (u - cdf_b) / denom * (bin_a - bin_b)

def render_rays(coarse, fine, rays_o, rays_d, near, far, n_coarse=64, n_fine=128, perturb=True):
    R = rays_o.shape[0]
    t_c = stratified_samples(near, far, R, n_coarse, perturb)
    x_c = rays_o[:, None] + rays_d[:, None] * t_c[..., None]
    rgb_c, sig_c = coarse(x_c, rays_d[:, None].expand_as(x_c))
    col_c, _, _, w_c = volume_render(rgb_c, sig_c, t_c, rays_d)
    # hierarchical sampling: draw fine samples where the coarse weights are large
    mids = 0.5 * (t_c[:, 1:] + t_c[:, :-1])
    t_f = sample_pdf(mids, w_c[:, 1:-1].detach(), n_fine, deterministic=not perturb)
    t_all, _ = torch.sort(torch.cat([t_c, t_f], dim=-1), dim=-1)
    x_f = rays_o[:, None] + rays_d[:, None] * t_all[..., None]
    rgb_f, sig_f = fine(x_f, rays_d[:, None].expand_as(x_f))
    col_f, depth_f, acc_f, _ = volume_render(rgb_f, sig_f, t_all, rays_d)
    return col_c, col_f, depth_f
```

有两个细节很容易出错。累积乘积必须是**排他的**（exclusive，$T_1 = 1$），因此要在前面补 1 并丢弃最后一个元素。另外，粗网络的权重在重采样前要被**分离**（detach）：不对细采样点的位置求导。

### 7.4 在玩具场景上训练

为了保持完全自包含，我们用解析方式构造一个真值场景（一个柔和的彩色球体），用同样的数值求积渲染它的 20 个小视图，再用 NeRF 去拟合它们。如果使用真实数据集，你需要改为从 `transforms.json` 中加载图像和 `transform_matrix` 条目。

```python
import math
torch.manual_seed(0)

def pose_spherical(theta, phi, radius):
    """Camera on a sphere looking at the origin (OpenGL convention), like the NeRF synthetic data."""
    th, ph = math.radians(theta), math.radians(phi)
    C = torch.tensor([radius * math.cos(ph) * math.sin(th), radius * math.sin(ph),
                      radius * math.cos(ph) * math.cos(th)])
    back = C / C.norm()                                  # camera +z points away from the target
    right = torch.linalg.cross(torch.tensor([0.0, 1.0, 0.0]), back); right = right / right.norm()
    up = torch.linalg.cross(back, right)
    c2w = torch.eye(4); c2w[:3, 0], c2w[:3, 1], c2w[:3, 2], c2w[:3, 3] = right, up, back, C
    return c2w

# ground-truth "scene": a soft sphere with a colour gradient, rendered by the same quadrature
def gt_field(x, d):
    sigma = 30.0 * torch.sigmoid(20.0 * (0.6 - x.norm(dim=-1)))
    rgb = 0.5 + 0.5 * torch.tanh(2.0 * x)
    return rgb, sigma

H = W = 32; focal = 40.0; near, far = 2.0, 6.0
images, poses = [], []
for k in range(20):
    c2w = pose_spherical(18.0 * k, -30.0 + 3.0 * k, 4.0)
    o, d = get_rays(H, W, focal, c2w)
    o, d = o.reshape(-1, 3), d.reshape(-1, 3)
    t = stratified_samples(near, far, o.shape[0], 256, perturb=False)
    x = o[:, None] + d[:, None] * t[..., None]
    rgb, sig = gt_field(x, d)
    images.append(volume_render(rgb, sig, t, d)[0]); poses.append((o, d))

rays_o = torch.cat([p[0] for p in poses]); rays_d = torch.cat([p[1] for p in poses])
target = torch.cat(images)
# a smaller network than the paper's so that this runs on a CPU in a few minutes
coarse, fine = NeRF(L_x=6, L_d=2, width=64, depth=4), NeRF(L_x=6, L_d=2, width=64, depth=4)
opt = torch.optim.Adam(list(coarse.parameters()) + list(fine.parameters()), lr=1e-3)
for step in range(1001):
    idx = torch.randint(0, rays_o.shape[0], (512,))
    col_c, col_f, _ = render_rays(coarse, fine, rays_o[idx], rays_d[idx], near, far, 32, 32)
    loss = F.mse_loss(col_c, target[idx]) + F.mse_loss(col_f, target[idx])
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 250 == 0:
        psnr = -10.0 * torch.log10(F.mse_loss(col_f, target[idx]))
        print(f"step {step:4d}  loss {loss.item():.4f}  PSNR(fine) {psnr.item():.1f} dB")
```

在 4 核 CPU 上这大约需要一分半钟。训练批次上打印的 PSNR 从约 7 dB 升到第 250 步的 19.9 dB、第 750 步的 30.6 dB 和第 1000 步的 35.5 dB：球体的几何先出现，然后才是颜色渐变。与真实的 NeRF 一样，这个玩具模型在密度还几乎均匀时起步较慢；如果在 CPU 上使用完整的 $8\times256$ 网络，这个平台期会持续得更久，所以玩具实验使用了 `depth=4` 和 `width=64`。

要从这里走向真正的 NeRF：使用全尺寸网络以及 $L_x = 10$、$N_c = 64$、$N_f = 128$，每批 4096 条光线，加上学习率调度和 GPU，并在 `torch.no_grad()` 下分块渲染留出视图。

## 8. 后续工作

NeRF 引发了数以千计的论文。下面三项后续工作针对它最明显的失效模式，并引入了在 3DGS 中再次出现的思想。

### 8.1 Mip-NeRF：用圆锥实现抗锯齿

NeRF 在点上对无限细的光线进行采样，因此无论一个像素覆盖的是某个 3D 点周围一毫米还是一米的范围，这个点的编码都完全相同。于是，在多种分辨率的图像上训练（或在远离训练距离的位置渲染）时就会产生混叠和模糊。**Mip-NeRF**（Barron et al., ICCV 2021）为每个像素投射一个**圆锥**（cone），把它切分为圆锥截头体（conical frustum），并用均值为 $\boldsymbol\mu$、协方差为 $\Sigma$ 的高斯来近似每个截头体。然后它对该高斯上位置编码的*期望*进行编码，即**积分位置编码**（integrated positional encoding，IPE）。对于 $x\sim\mathcal N(\mu, \sigma^2)$，

$$
\mathbb E[\sin(x)] = \sin(\mu)\, e^{-\sigma^2/2},
\qquad
\mathbb E[\cos(x)] = \cos(\mu)\, e^{-\sigma^2/2},
$$

因此周期小于截头体覆盖范围的频率会被平滑地衰减，这就是预滤波（prefiltering），类似于 mipmap。这样单个 MLP 就能在所有尺度上表示场景。同样的“用高斯覆盖范围替代点并对其做低通滤波”的思想会在 Mip-Splatting（第 5 篇）中再次出现。

### 8.2 Mip-NeRF 360：无界场景

对整个环境的真实拍摄包含各种距离上的内容。**Mip-NeRF 360**（Barron et al., CVPR 2022）引入了一种**场景收缩**（scene contraction），把整个空间映射到半径为 2 的球内，

$$
\operatorname{contract}(\mathbf x) =
\begin{cases}
\mathbf x & \lVert \mathbf x\rVert \le 1, \\[2pt]
\left(2 - \dfrac{1}{\lVert \mathbf x\rVert}\right)\dfrac{\mathbf x}{\lVert \mathbf x\rVert} & \lVert \mathbf x\rVert > 1,
\end{cases}
$$

一个通过“在线蒸馏”（online distillation）训练、用于为 NeRF 权重提供上界的小型**提议 MLP**（proposal MLP，取代粗网络），以及一个**失真损失**（distortion loss），它促使每条光线上的权重保持紧凑，从而消除漂浮物（floaters）。它包含九个无界场景（bicycle、garden、stump、room、counter、kitchen、bonsai 等）的数据集是标准基准，3DGS 也在其上报告结果。

### 8.3 NeRF in the Wild

互联网照片集违背了 NeRF 的假设：照片之间的曝光、白平衡和天气各不相同，而且游客会走动。**NeRF-W**（Martin-Brualla et al., CVPR 2021）增加了：

- 一个学习得到的逐图像**外观嵌入**（appearance embedding）$\boldsymbol\ell^{(a)}_i$，输入到颜色分支中，在保持几何共享的同时吸收光度上的变化；
- 一个**瞬态**（transient）头，具有自己的密度、颜色和逐光线的**不确定性**（uncertainty）$\beta$，并以逐图像的瞬态嵌入为条件，使遮挡物被“解释掉”而不是被烘焙进场景；损失变为 $\frac{\lVert C - \hat C\rVert^2}{2\beta^2} + \log\beta^2$，再加上对瞬态密度的稀疏项。

逐图像外观嵌入至今仍是一个标准技巧；nerfstudio 的 `nerfacto` 和若干 3DGS 变体都在使用它。

### 8.4 其他方向简述

- **表面：** NeuS（Wang et al., NeurIPS 2021）用有符号距离函数（signed distance function）和一个无偏的权重函数取代密度，从而得到干净的网格。
- **生成：** DreamFusion（Poole et al., ICLR 2023）优化一个 NeRF，使其渲染结果在 2D 文本到图像扩散模型看来是合理的（分数蒸馏采样，score distillation sampling），这是文本到 3D（text-to-3D）的起点。
- **速度：** 网格、哈希编码和烘焙（第 3 篇），以及最终的高斯（第 4 篇）。

## 动手试试

[交互实验室]({{ '/' | relative_url }}#lab)里没有 NeRF，但其中的 Gaussian World 演示合成泼溅点时使用的正是第 2.2 节中的权重 $w_i = T_i\alpha_i$，只不过是按像素排序，而不是沿光线采样。在阅读第 4 篇时可以使用它的调试视图来体会两者的联系。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Optical Models for Direct Volume Rendering (Max) | IEEE TVCG | 1995 | — | 渲染方程背后的发射–吸收模型 |
| NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis (Mildenhall et al.) | ECCV | 2020 | [arXiv](https://arxiv.org/abs/2003.08934) | 本文介绍的方法 |
| Fourier Features Let Networks Learn High Frequency Functions in Low Dimensional Domains (Tancik et al.) | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.10739) | 解释了位置编码为何有效 |
| NeRF in the Wild (Martin-Brualla et al.) | CVPR | 2021 | [arXiv](https://arxiv.org/abs/2008.02268) | 外观嵌入与瞬态物体 |
| Mip-NeRF: A Multiscale Representation for Anti-Aliasing Neural Radiance Fields (Barron et al.) | ICCV | 2021 | [arXiv](https://arxiv.org/abs/2103.13415) | 圆锥追踪与积分位置编码 |
| NeuS: Learning Neural Implicit Surfaces by Volume Rendering (Wang et al.) | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.10689) | 面向表面的基于 SDF 的体渲染 |
| Mip-NeRF 360: Unbounded Anti-Aliased Neural Radiance Fields (Barron et al.) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2111.12077) | 收缩、提议网络、标准基准 |
| DreamFusion: Text-to-3D using 2D Diffusion (Poole et al.) | ICLR | 2023 | [arXiv](https://arxiv.org/abs/2209.14988) | 分数蒸馏：从文本生成 NeRF |

## 学习资源

- [NeRF 项目主页](https://www.matthewtancik.com/nerf)以及位于 [github.com/bmild/nerf](https://github.com/bmild/nerf) 的原始 TensorFlow 代码；忠实的 PyTorch 移植版是 [yenchenlin/nerf-pytorch](https://github.com/yenchenlin/nerf-pytorch)。
- [nerfstudio](https://docs.nerf.studio/)，第 3 篇和第 6 篇使用的框架，包含 `vanilla-nerf`、`mipnerf` 和 `nerfacto` 的简洁实现。
- Scratchapixel 关于体渲染的课程，对应第 2 节的图形学部分。
- Brown 大学的 [neural fields](https://neuralfields.cs.brown.edu/) 综述与数据库（Xie et al., "Neural Fields in Visual Computing and Beyond", Eurographics STAR 2022）。
- Stanford CS231N，用于补充深度学习背景知识（MLP、优化）。

## 练习

1. 证明权重 $w_i = T_i\alpha_i$ 之和为 $1 - \prod_{i}(1-\alpha_i)$。剩余部分在物理上意味着什么？
2. 在玩具实验中去掉位置编码（`L_x = 0`），比较相同步数后的 PSNR。然后尝试 `L_x = 16`。
3. 让 `render_rays` 返回期望深度，并渲染玩具场景的深度图。图像中心处的深度是否接近 $4 - 0.6 = 3.4$？
4. 在训练时用固定的中点（`perturb=False`）替代分层随机采样。以不同分辨率渲染时会出现什么伪影？
5. 为对角高斯实现积分位置编码，并数值验证它等于在 $\mathbf x$ 的采样上对 $\gamma(\mathbf x)$ 求的蒙特卡洛平均。

**下一篇：** NeRF 训练需要一天，渲染一帧需要数秒。[第 3 篇]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})将展示显式网格和哈希编码如何让辐射场在几分钟内完成训练。
