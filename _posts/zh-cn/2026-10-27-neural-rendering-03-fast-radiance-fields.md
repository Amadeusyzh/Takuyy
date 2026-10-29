---
layout: post
title: "快速辐射场：网格、张量与哈希编码"
date: 2026-10-27 12:03:00+0900
description: "NeRF 为什么慢，显式与混合表示又是如何解决这一问题的：Plenoxels、DVGO、TensoRF、Instant-NGP 的多分辨率哈希编码（附 PyTorch 代码）、Zip-NeRF 以及 nerfstudio 工具箱。"
categories: neural-rendering
tags: [instant-ngp, hash-encoding, plenoxels, tensorf, zip-nerf, nerfstudio]
series: neural-rendering
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第 2 篇]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})中的 NeRF 每个场景需要一整天的 GPU 时间，渲染一帧也要好几秒。从 2021 年末到 2022 年，一系列论文把训练时间缩短到了几分钟，Instant-NGP 更是缩短到几秒。它们都保留了 NeRF 的体渲染方程（volume rendering equation），改变的是**场的存储方式**：从一个每个采样点都必须穿过的大型 MLP，变成以查表和插值为主的显式数据结构。这种从隐式（implicit）到显式（explicit）的转变，正是通往 3D 高斯泼溅（3D Gaussian Splatting，第 4 篇）的桥梁——后者走到了尽头，让基元（primitive）本身也成为显式的。

## 前置知识

- 体渲染、位置编码（positional encoding）与分层采样（hierarchical sampling）（第 2 篇）。
- 三线性插值（trilinear interpolation）、球谐函数（spherical harmonics）（这里会回顾基础，第 4 篇会深入讲解）、哈希（hashing）。
- PyTorch。

## 1. NeRF 为什么慢

先算一算工作量。一个训练批次有 4096 条光线，每条光线 $64 + 192$ 个采样点，约合一百万次 MLP 求值；$8\times256$ 主干网络每次前向求值大约需要 $8 \times 256^2 \times 2 \approx 10^6$ FLOPs。仅前向传播每次迭代就约为 $10^{12}$ FLOPs，再乘以 20 万次迭代。渲染一帧 $800\times800$ 的图像又需要 $\sim 1.6\times10^8$ 次网络求值。

有三个特性使这种做法非常浪费：

1. **每个采样点都要为整个网络买单。** 场景的全部信息都存放在共享的 MLP 权重中，因此无法只求值“模型中靠近这个点的那一部分”。
2. **大多数采样点毫无用处。** 空白空间和被遮挡的空间占了绝大多数，但分层随机采样（stratified sampling）仍然会对它们求值。分层采样有所帮助，但它本身也要额外进行一次粗网络的计算。
3. **全局权重收敛缓慢。** 更新某一区域会改变整个函数；在大型 MLP 上做梯度下降需要很多小步。

解决方案与这些问题一一对应：把特征**局部地**存储（网格、平面、哈希表），使一个采样点只触及少量参数；用占据结构（occupancy structure）**跳过空白空间**，并在透射率（transmittance）可以忽略时提前终止光线；再把剩下的网络做得**极小**。

下图把这些数字放在一起比较（上），并在一条玩具光线上演示第二个问题（下）：256 个采样中只有一小部分得到不可忽略的权重。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-nerf-cost.svg" localized="true" caption="上：NeRF 前向计算的 FLOPs（对数坐标），由本节的数字算出（一次 $8\times256$ MLP 求值、4096 条光线且每条 256 个采样的一个批次、一帧 $800\times800$ 图像、20 万次训练迭代）。下：一条玩具光线，上面有一个不透明表面和一团很淡的介质，用 256 个均匀采样点采样。透射率 $T(t)$ 在表面处降为零，只有红色刻度（256 个中的 43 个）的权重 $w_i>10^{-3}$：每个灰色刻度都要付出一次完整网络求值的代价，却几乎没有贡献。" %}

一个有用的思维模型是，混合辐射场（hybrid radiance field）可以写成

$$
(\sigma, \mathbf c)(\mathbf x, \mathbf d) = g_\phi\big(\, \operatorname{interp}(\mathcal G, \mathbf x),\ \mathbf d \,\big),
$$

其中 $\mathcal G$ 是某种由可学习特征构成的显式结构，$\operatorname{interp}$ 是带（三）线性插值的廉价查找，$g_\phi$ 是一个小型解码器，或者干脆没有网络。

## 2. 纯网格：Plenoxels 与 DVGO

### 2.1 Plenoxels

**Plenoxels**（Fridovich-Keil、Yu 等，CVPR 2022）提出的问题是：神经网络到底是否必要？它在**稀疏体素网格（sparse voxel grid）**的顶点上存储密度以及表示颜色的**球谐函数（SH）**系数。采样点的值由周围 8 个顶点三线性插值得到，视角相关的颜色由 SH 求值：

$$
\mathbf c(\mathbf x, \mathbf d) = \operatorname{sigmoid}\!\Big( \sum_{\ell=0}^{\ell_{\max}} \sum_{m=-\ell}^{\ell} \mathbf k_{\ell m}(\mathbf x)\, Y_{\ell m}(\mathbf d) \Big),
$$

阶数为 $\ell_{\max} = 2$（每个通道 9 个系数，每个顶点 27 个）。渲染采用 NeRF 的数值积分（quadrature）；优化直接在网格值上进行，并使用**全变分（total variation）**正则项

$$
\mathcal L_{TV} = \frac{1}{|\mathcal V|}\sum_{\mathbf v\in\mathcal V} \sqrt{\Delta_x^2(\mathbf v) + \Delta_y^2(\mathbf v) + \Delta_z^2(\mathbf v)}
$$

（相邻体素之间的差分）来抑制未观测区域中的噪声，同时采用由粗到细（coarse-to-fine）的上采样并剪除空体素。论文报告的优化速度比 NeRF 快约两个数量级，而质量相当。它传达的信息是：关键要素是**可微体渲染器（differentiable volumetric renderer）**，而不是神经网络——这恰恰是 3DGS 后来用另一种基元所下的赌注。Plenoxels 建立在 PlenOctrees（Yu 等，ICCV 2021）之上，后者把一个以 SH 为输出训练好的 NeRF 烘焙（bake）进八叉树（octree），以实现实时渲染。

下图展示了这一做法的两半：一个采样点的三线性权重，以及剪除空白空间后保留下来的体素。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-trilinear-sparse.svg" caption="左：单个体素内的三线性插值。采样点 $\mathbf x$ 在体素内的相对位置为 (0.3, 0.65, 0.4)，每个角点的值以权重 $\prod_k (x_k \text{ 或 } 1-x_k)$ 参与插值；角点处圆点的大小和数字就是这个权重，八个权重之和为 1。右：围绕一个球面的 $16^3$ 网格，只保留表面穿过的体素（4096 个中的 680 个，17%；切掉一块楔形，可以看到内部同样是空的）。这就是 Plenoxels 剪除空体素的思路；真实方法在高得多的分辨率上维护稀疏网格。" %}

### 2.2 DVGO

**DVGO**（Direct Voxel Grid Optimization，直接体素网格优化；Sun 等，CVPR 2022）同样直接优化网格，但保留了一个小网络：一个稠密的**密度网格（density grid）**和一个**特征网格（feature grid）**，后者插值得到的特征（加上视角方向）由一个浅层 MLP 解码。它的两个发现具有广泛的参考价值：

- **后激活（post-activation）。** 先对原始网格值进行插值，再施加密度激活（softplus，然后 $\alpha = 1 - e^{-\sigma\delta}$）。三线性插值后的激活前值能够在单个体素内表示一个锐利的表面，而对已激活的密度进行插值则做不到。
- **对抗不良几何的先验。** 直接优化的密度网格很容易过拟合而产生漂浮物（floaters），因此 DVGO 将密度初始化为较低的值，并在粗阶段使用基于可见视角数的学习率。

下图在一维中重现了后激活的论证（练习 4 要求你亲手实现它）。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-post-activation.svg" caption="一维中的 DVGO 后激活。一个 8 单元的网格（竖线为顶点）需要表示位于 $x=0.56$ 的不透明表面，它落在阴影单元内部（点线为目标）。每种方案的 9 个顶点值都用最小二乘拟合。插值不透明度（橙色）或插值已激活的密度（蓝色）只能在整个单元内逐渐爬升，而先插值原始值、再做激活（红色）能恰好在 0.56 处给出一个锐利的阶跃。激活为 softplus，然后 $\alpha = 1-e^{-\sigma\delta}$，其中 $\delta=1/64$。" %}

DVGO 报告称，在单块 GPU 上从零开始约 15 分钟即可达到与 NeRF 相当的质量。

纯网格的代价是内存：一个每顶点 28 个浮点数的稠密 $512^3$ 网格需要 15 GB。因此，稀疏结构、剪枝和因式分解必不可少。

## 3. 因式分解网格：TensoRF 与 K-Planes

**TensoRF**（Chen 等，ECCV 2022）把特征网格视为一个 4D 张量（三个空间轴加特征维），并对其进行因式分解。在 **CP 分解（CP decomposition）**中，密度是若干秩一分量之和，

$$
\sigma(\mathbf x) = \sum_{r=1}^{R} v^X_r(x)\, v^Y_r(y)\, v^Z_r(z),
$$

其中 $v_r$ 是沿各轴的可学习 1D 向量。表达能力更强的**向量–矩阵（vector–matrix，VM）**分解把每个 1D 向量与另外两个轴上的 2D 矩阵配对：

$$
\sigma(\mathbf x) = \sum_{r=1}^{R} \Big( v^X_r(x)\, M^{YZ}_r(y,z) + v^Y_r(y)\, M^{XZ}_r(x,z) + v^Z_r(z)\, M^{XY}_r(x,y) \Big).
$$

外观（appearance）使用同样的因式分解得到特征向量，再由小型 MLP 或 SH 解码。内存从 $O(N^3)$ 降到 $O(N^2)$（VM）或 $O(N)$（CP）；论文报告 CP 模型小于 4 MB，训练时间不到 30 分钟。

下图把两种分解拟合到一个小体积上，可以直观地看到其中的取舍。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-tensorf.svg" caption="在真实体积上比较 CP 与 VM：一个倾斜的圆环加上顶部的小球，在 $32^3$ 网格上采样，分别用 CP（交替最小二乘）和 VM（三项中的每一项都是某个展开（unfolding）下的秩 $R$ 矩阵，用截断 SVD 拟合）分解。左上：一个 VM 项，即沿 $x$ 的向量乘以 $yz$ 平面上的矩阵。右上：重建 PSNR 与参数量的关系，虚线为稠密网格。下：目标以及两个质量相当的重建的 $z$ 切片：CP 需要 16 个分量（1536 个参数），VM 只需 2 个（6336 个参数）。按分量计 VM 的表达力强得多；按参数计，在这个平滑的玩具体积上 CP 非常紧凑。" %}

**K-Planes**（Fridovich-Keil 等，CVPR 2023）把平面的思路推广到 $d$ 维：一个 $d$ 维的场由 $\binom{d}{2}$ 个平面表示，各平面插值得到的特征相**乘**。对于动态场景 $(x, y, z, t)$，这意味着六个平面：三个空间平面（$xy, xz, yz$）和三个时空平面（$xt, yt, zt$）。许多动态 3DGS 方法都基于同样的因式分解平面思想（例如 4D Gaussian Splatting 中的 HexPlane 形变场，见第 5 篇）。

## 4. Instant-NGP：多分辨率哈希编码

**Instant Neural Graphics Primitives**（Müller、Evans、Schied & Keller，ACM TOG / SIGGRAPH 2022）是这些方法中影响最大的一个。它用一个可学习的、多分辨率的、哈希化的特征网格取代了 NeRF 的频率编码（frequency encoding），用完全融合（fully fused）的 CUDA 内核实现，能在几秒到几分钟内训练出一个 NeRF。

### 4.1 编码

选取 $L$ 个分辨率层级。第 $l$ 层的网格分辨率在 $N_{\min}$ 与 $N_{\max}$ 之间按几何级数增长：

$$
N_l = \big\lfloor N_{\min}\, b^{\,l} \big\rfloor,
\qquad
b = \exp\!\left( \frac{\ln N_{\max} - \ln N_{\min}}{L - 1} \right).
$$

每一层拥有一张包含 $T$ 个维度为 $F$ 的特征向量的表。要对点 $\mathbf x\in[0,1]^d$ 进行编码：

1. 在每一层，把 $\mathbf x$ 乘以 $N_l$，找到包含它的单元的 $2^d$ 个整数角点。
2. 把每个角点 $\mathbf i$ 映射为表索引。如果该层的完整网格放得下，即 $(N_l+1)^d \le T$，就使用一一对应的稠密索引；否则使用**空间哈希（spatial hash）**
   $$
   h(\mathbf i) = \Big( \bigoplus_{k=1}^{d} i_k\, \pi_k \Big) \bmod T,
   \qquad \pi_1 = 1,\ \pi_2 = 2\,654\,435\,761,\ \pi_3 = 805\,459\,861,
   $$
   其中 $\oplus$ 表示按位异或（XOR）。
3. 查出这 $2^d$ 个特征向量，并根据点在单元内的小数位置对它们进行插值（$d=3$ 时为三线性插值）。
4. 把 $L$ 个插值得到的向量（以及可选的辅助输入）拼接成 $L\cdot F$ 维的编码，送入一个极小的 MLP。

论文的典型配置为 $L = 16$、$F = 2$、$T = 2^{14}$ 到 $2^{24}$（例如 NeRF 使用 $2^{19}$）、$N_{\min} = 16$。表项从 $\mathcal U(-10^{-4}, 10^{-4})$ 初始化。

下图展示了这些层级在 4.4 节二维测试中的样子。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-hash-levels.svg" caption="4.4 节二维测试配置（$L=16$，$N$ 从 16 到 512，$T=2^{15}$）的各个层级，由上面的公式算出。上：每个层级的顶点数（对数坐标）；绿色层级能放进表中，使用稠密索引，橙色层级（从 $N=203$ 起）使用哈希。左下：第 0、5、10 层的网格叠加在测试图像的左下角。右下：在最精细的层级，263169 个顶点共享 32768 个槽位（平均每个槽位 8 个，且所有槽位都被用到）；红点是空间哈希映射到与圈出顶点同一槽位的 9 个顶点，它们伪随机地散布在整幅图像上。" %}

### 4.2 为什么哈希冲突无妨

在精细层级上，网格顶点远多于表项，因此不同顶点会冲突到同一个槽位。Instant-NGP 干脆放任冲突，依赖以下三个事实：

- **梯度平均会偏向重要的部分。** 一个由可见表面上的顶点和空白空间中的顶点共享的槽位会同时接收两者的梯度，但表面顶点接收到的梯度更多也更大（它的采样点具有较大的权重 $w_i$），因此存储的特征服务于表面。
- **多分辨率消歧。** 粗层级没有冲突（稠密索引），而两个点在*所有*精细层级上同时冲突的可能性非常小。MLP 看到的是拼接后的结果，能够把它们区分开。
- **免费的自适应性。** 不需要显式的稀疏结构或剪枝；表的容量会自然流向细节所在之处。

$T$ 是一个显式的内存–质量调节旋钮：论文表明质量随 $\log T$ 上升，直至饱和。

在 4.4 节的二维测试中可以清楚地看到这个旋钮：那里画出了 $T$ 从 $2^{10}$ 到 $2^{19}$ 的 NumPy 复现结果。

### 4.3 系统的其余部分

- **极小的 MLP。** 对于 NeRF，密度 MLP 只有一个含 64 个神经元的隐藏层，输出 16 个值，其中第一个被解释为对数密度（log-density）；颜色 MLP 有两个含 64 个神经元的隐藏层，输入为这 16 个值加上用最高 4 阶球谐函数编码的视角方向（16 个系数）。
- **占据网格（occupancy grid）。** 一个多尺度二值网格标记出密度不可忽略的单元。光线步进（ray marching）跳过空单元，并在透射率低于阈值时停止，因此大多数光线只需求值少数几个采样点。该网格会根据当前密度定期更新。
- **优化器。** Adam，$\beta_1 = 0.9$，$\beta_2 = 0.99$，$\epsilon = 10^{-15}$（极小的 $\epsilon$ 很重要，因为许多哈希表项只会偶尔收到很小的梯度），并只对 MLP 权重施加较弱的 L2 正则化。
- **完全融合的 CUDA。** MLP 由 `tiny-cuda-nn` 库求值，所有层融合在一个内核中，激活值保存在片上内存（on-chip memory）中。

下图展示了在一条玩具光线上，占据网格与提前终止能节省多少计算。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-occupancy.svg" caption="二维玩具场景中的空域跳过（empty-space skipping），场景中有两团介质。$32\times32$ 的占据网格标记出密度超过 0.01 的 216 个单元（紫色）。一条光线在场景内有 487 个均匀采样，但只对占据单元中的采样求值，并在透射率低于 $10^{-4}$ 时停止：实际只求值了 37 个采样（红色），全部位于它遇到的第一个表面附近。" %}

同样的编码还能用于拟合十亿像素（gigapixel）图像、符号距离函数（signed distance function）和神经辐射缓存（neural radiance cache），这正是论文称之为“图形基元（graphics primitives）”的原因。

### 4.4 代码：PyTorch 中的哈希编码

下面是一个适用于 $d \le 3$ 的、易读（而非高效）的 PyTorch 实现，随后是一个测试：用 2D 哈希网格和单隐藏层 MLP 拟合一张 $512\times512$ 的图像。

```python
import math, torch, torch.nn as nn

PRIMES = [1, 2654435761, 805459861]        # from the Instant-NGP paper (pi_1 = 1)

class HashEncoding(nn.Module):
    """Multiresolution hash encoding (Mueller et al. 2022) for inputs in [0, 1]^D, D <= 3."""
    def __init__(self, D=3, L=16, F=2, log2_T=19, N_min=16, N_max=2048):
        super().__init__()
        self.D, self.L, self.F, self.T = D, L, F, 2 ** log2_T
        b = math.exp((math.log(N_max) - math.log(N_min)) / (L - 1))    # per-level growth factor
        self.register_buffer("res", torch.tensor([math.floor(N_min * b ** l) for l in range(L)]))
        # one table per level, initialised U(-1e-4, 1e-4) as in the paper
        self.tables = nn.Parameter(torch.empty(L, self.T, F).uniform_(-1e-4, 1e-4))
        # all 2^D corners of a cell as 0/1 offsets, shape (2^D, D)
        corners = torch.stack(torch.meshgrid(*[torch.arange(2)] * D, indexing="ij"), -1)
        self.register_buffer("corners", corners.reshape(-1, D))
        self.register_buffer("primes", torch.tensor(PRIMES[:D], dtype=torch.int64))

    def index(self, ic, l):
        """Grid vertex (..., D) at level l -> table index. Dense indexing where the grid fits."""
        n = int(self.res[l]) + 1                          # vertices per axis
        if n ** self.D <= self.T:                         # coarse level: 1:1 mapping, no collisions
            stride = torch.tensor([n ** k for k in range(self.D)], device=ic.device)
            return (ic * stride).sum(-1)
        h = ic[..., 0] * self.primes[0]
        for k in range(1, self.D):
            h = h ^ (ic[..., k] * self.primes[k])         # spatial hash: XOR of coordinate * prime
        return h & (self.T - 1)                           # mod T (T is a power of two)

    def forward(self, x):                                 # x: (B, D) in [0, 1]
        feats = []
        for l in range(self.L):
            xs = x * self.res[l]
            x0 = torch.floor(xs)
            w = xs - x0                                   # position inside the cell
            ic = x0.long()[:, None, :] + self.corners     # (B, 2^D, D) integer corners
            # (d-)linear interpolation weights of each corner
            cw = torch.where(self.corners.bool(), w[:, None, :], 1 - w[:, None, :]).prod(-1)
            f = self.tables[l][self.index(ic, l)]         # (B, 2^D, F)
            feats.append((cw[..., None] * f).sum(1))
        return torch.cat(feats, -1)                       # (B, L * F)
```

```python
torch.manual_seed(0)
# target: a 512x512 procedural image with sharp detail
n = 512
yy, xx = torch.meshgrid(torch.linspace(0, 1, n), torch.linspace(0, 1, n), indexing="ij")
img = torch.stack([0.5 + 0.5 * torch.sin(40 * xx * yy), ((xx * 16).floor() + (yy * 16).floor()) % 2,
                   0.5 + 0.5 * torch.cos(60 * (xx - 0.5) ** 2 + 60 * (yy - 0.5) ** 2)], -1)
coords, colors = torch.stack([xx, yy], -1).reshape(-1, 2), img.reshape(-1, 3)

enc = HashEncoding(D=2, L=16, F=2, log2_T=15, N_min=16, N_max=512)
mlp = nn.Sequential(nn.Linear(32, 64), nn.ReLU(), nn.Linear(64, 3))
opt = torch.optim.Adam([{"params": enc.parameters()}, {"params": mlp.parameters(), "weight_decay": 1e-6}],
                       lr=1e-2, betas=(0.9, 0.99), eps=1e-15)
for step in range(1001):
    idx = torch.randint(0, coords.shape[0], (2 ** 14,))
    loss = ((mlp(enc(coords[idx])) - colors[idx]) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 250 == 0:
        with torch.no_grad():
            mse = ((mlp(enc(coords)) - colors) ** 2).mean()
        print(f"step {step:4d}  full-image PSNR {-10 * torch.log10(mse).item():.1f} dB")
```

在 CPU（单线程）上，这段代码在几百步之内就能超过 40 dB（我们的运行在第 250 步输出了 45.8 dB），尽管最精细的层级中顶点数约为表项数的八倍。关于代码有两点说明：

- 像 $511 \times 2\,654\,435\,761$ 这样的整数乘积完全可以放进 `int64`；CUDA 实现使用带回绕（wrap-around）的 `uint32` 运算，得到的哈希值不同，但同样好用。
- 对层级的循环会启动许多小内核。真正的实现（[tiny-cuda-nn](https://github.com/NVlabs/tiny-cuda-nn)，或 nerfstudio 和 nerfacc 中对纯 PyTorch 友好的变体）会在一个融合内核中处理所有层级和角点，并手写反向传播。

下图是这个测试在 NumPy 中的复现，并比较了不同的表大小。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-hash-fit.svg" caption="上面二维测试的 NumPy 复现（相同的编码、MLP、Adam 设置和批大小；300 步；PSNR 在隔行隔列的像素上计算）。左上：$512\times512$ 的目标图像。右上：$T=2^{15}$ 训练 300 步后的重建（46.0 dB；正文中的 PyTorch 版本在第 250 步输出 45.8 dB）。下：四种表大小下 PSNR 随步数的变化。$T=2^{19}$ 时所有层级都放得下、没有任何冲突，因此它与 $T=2^{15}$ 之间的差距就是哈希的代价；$T=2^{10}$ 与 $2^{12}$ 展示了 4.2 节所说的内存–质量旋钮。" %}

要把它用在第 2 篇的 NeRF 中，需要把采样位置归一化到 $[0,1]^3$（对于无界场景使用场景收缩（scene contraction）），用 `HashEncoding(D=3)(x)` 替换 `positional_encoding(x, L_x)`，并把 MLP 缩小为一到两个宽度为 64 的隐藏层。

## 5. Zip-NeRF：抗锯齿与网格的结合

网格方法速度快，但会产生**混叠（alias）**：哈希网格是在点上查询的，因此 Mip-NeRF 基于圆锥的预滤波（集成位置编码，integrated positional encoding）无法直接适用。**Zip-NeRF**（Barron 等，ICCV 2023）把 Mip-NeRF 360 与 Instant-NGP 风格的网格结合了起来：

- **多重采样（multisampling）。** 每个圆锥截头体（conical frustum）由其内部沿螺旋线排列的一小组点表示，对这些点的哈希特征取平均，以近似特征在截头体上的积分。
- **尺度感知的降权（scale-aware downweighting）。** 来自单元尺寸小于截头体覆盖范围（footprint）的网格层级的特征会被衰减：分辨率为 $n$ 的层级上的特征乘以 $\operatorname{erf}\!\big(1/\sqrt{8\sigma^2 n^2}\big)$，其中 $\sigma$ 是截头体所对应高斯的标准差。这是 IPE 中 $e^{-\sigma^2/2}$ 因子的软化版本。
- **抗锯齿的层间损失（interlevel loss）**，作用于提议网络（proposal network）与 NeRF 之间，消除了 Mip-NeRF 360 提议监督中的 z 向混叠（“条带”，banding）。

下图展示了前两个想法。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-zipnerf.svg" caption="上：Zip-NeRF 多重采样的示意图：一段光线区间对应的圆锥截头体（紫色）用其内部沿螺旋线排列的 6 个点表示，并对这些点的哈希特征取平均。下：降权因子 $\mathrm{erf}(1/\sqrt{8\sigma^2 n^2})$ 随 $\sigma n$（以网格单元为单位的截头体标准差）的变化。橙色点：二维测试的 16 个层级（$n$ 从 16 到 512），截头体覆盖范围为 $\sigma=1/64$。粗层级几乎不受影响，单元远小于覆盖范围的层级被衰减到接近 0。" %}

论文报告其错误率比 Mip-NeRF 360 或基于网格的基线低 8%–77%，训练速度比 Mip-NeRF 360 快 24 倍。即使进入高斯泼溅时代很久之后，Zip-NeRF 仍是 Mip-NeRF 360 基准上最强的质量参照之一。

## 6. 为实时渲染而烘焙

即便是 Instant-NGP 模型，在大尺寸图像上也只能达到交互级帧率，因为每个像素仍需步进一条光线。有一系列工作把训练好的场**烘焙**成适合光栅化（rasterization）的资产：带小型延迟解码器的稀疏网格（SNeRG，Hedman 等，ICCV 2021）、带微型视角相关着色器的纹理多边形（MobileNeRF，Chen 等，CVPR 2023）、面向 Web 的低内存混合网格（MERF，Reiser 等，SIGGRAPH 2023），以及由 SDF 得到的网格（BakedSDF，Yariv 等，SIGGRAPH 2023）。它们能在手机上达到实时帧率，但每种方法都需要单独的优化阶段，而且往往要牺牲质量。3DGS（第 4 篇）通过直接在一种可实时光栅化的表示中训练，消除了这种取舍。

## 7. 工具：nerfstudio 及其伙伴

你很少需要从零实现这些系统。**nerfstudio**（Tancik 等，SIGGRAPH 2023 会议论文）是一个模块化的 PyTorch 框架，提供统一的数据格式、Web 查看器、针对 COLMAP 和手机采集应用的数据处理封装，以及导出工具。它的默认方法 **nerfacto** 结合了本篇和第 2 篇中的思想：哈希网格编码、带场景收缩的提议网络、逐图像外观嵌入（appearance embedding，来自 NeRF-W）以及相机位姿优化（camera pose refinement）。

```bash
pip install nerfstudio
ns-download-data nerfstudio --capture-name=poster        # a sample capture
ns-train nerfacto --data data/nerfstudio/poster          # opens the web viewer
ns-render camera-path --load-config outputs/poster/nerfacto/<timestamp>/config.yml \
    --camera-path-filename camera_path.json --output-path renders/poster.mp4
```

`ns-process-data images --data <folder> --output-dir <out>` 会对你自己的照片运行 COLMAP。同一框架还以 **splatfacto**（基于 gsplat 库构建）的形式提供高斯泼溅，我们将在第 6 篇中使用它。其他有用的工具：[instant-ngp](https://github.com/NVlabs/instant-ngp)（原始实现，带 GUI 和 VR 模式）、[nerfacc](https://github.com/nerfstudio-project/nerfacc)（以 PyTorch 库形式提供的占据网格采样）以及 [tiny-cuda-nn](https://github.com/NVlabs/tiny-cuda-nn)。

## 动手试试

快速场“局部显式参数 + 廉价渲染器”的思想，正是[交互实验室]({{ '/' | relative_url }}#lab)中的 Gaussian World 演示得以在浏览器中运行的原因：每一帧它只对基元进行排序和光栅化，无需任何网络求值。建议在阅读第 4 篇之前先试试这个实验室，并把它的帧率与在你的机器上用第 2 篇的代码渲染一帧 NeRF 所需的时间做个比较。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| PlenOctrees for Real-time Rendering of Neural Radiance Fields (Yu et al.) | ICCV | 2021 | [arXiv](https://arxiv.org/abs/2103.14024) | SH 输出 + 八叉树烘焙，实时 NeRF 渲染 |
| Plenoxels: Radiance Fields without Neural Networks (Fridovich-Keil, Yu et al.) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2112.05131) | 稀疏 SH 体素网格，无 MLP |
| Direct Voxel Grid Optimization (Sun et al.) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2111.11215) | 密度 + 特征网格，后激活 |
| TensoRF: Tensorial Radiance Fields (Chen et al.) | ECCV | 2022 | [arXiv](https://arxiv.org/abs/2203.09517) | CP / VM 张量分解 |
| Instant Neural Graphics Primitives with a Multiresolution Hash Encoding (Müller et al.) | ACM TOG (SIGGRAPH) | 2022 | [arXiv](https://arxiv.org/abs/2201.05989) | 哈希网格 + 融合的极小 MLP，秒级 NeRF |
| K-Planes: Explicit Radiance Fields in Space, Time, and Appearance (Fridovich-Keil et al.) | CVPR | 2023 | [arXiv](https://arxiv.org/abs/2301.10241) | 面向静态与动态场景的平面因式分解 |
| Nerfstudio: A Modular Framework for Neural Radiance Field Development (Tancik et al.) | SIGGRAPH (Conf.) | 2023 | [arXiv](https://arxiv.org/abs/2302.04264) | 标准工具箱，nerfacto |
| Zip-NeRF: Anti-Aliased Grid-Based Neural Radiance Fields (Barron et al.) | ICCV | 2023 | [arXiv](https://arxiv.org/abs/2304.06706) | 哈希网格的抗锯齿，质量参照 |

## 学习资源

- [Instant-NGP 项目主页](https://nvlabs.github.io/instant-ngp/)与[代码](https://github.com/NVlabs/instant-ngp)；融合 MLP 与各种编码见 [tiny-cuda-nn](https://github.com/NVlabs/tiny-cuda-nn)。
- [nerfstudio 文档](https://docs.nerf.studio/)，尤其是讲解各方法组成部分的 “Nerfology” 页面。
- [Plenoxels (svox2)](https://github.com/sxyu/svox2)、[DVGO](https://github.com/sunset1995/DirectVoxGO) 和 [TensoRF](https://github.com/apchenstu/TensoRF) 的官方代码，每个都只有几千行，且易于阅读。
- [Zip-NeRF 项目主页](https://jonbarron.info/zipnerf/)。
- 面向图形学的球谐函数：P.-P. Sloan, "Stupid Spherical Harmonics (SH) Tricks"（GDC 2008），以及 R. Green, "Spherical Harmonic Lighting: The Gritty Details"（2003）。

## 练习

1. 计算一个稠密 $256^3$ Plenoxels 网格（float32，含密度与 2 阶 SH）的内存占用，以及同一分辨率下每个轴 $R=16$ 个分量的 TensoRF VM 模型的内存占用。
2. 在 2D 测试中，用第 2 篇的频率编码（`positional_encoding`，$L=10$）替换哈希编码，并搭配一个宽度为 128 的 4 层 MLP。需要多少步才能达到 30 dB？
3. 在 2D 测试中分别设置 `log2_T = 10` 和 `log2_T = 20`，绘制 PSNR 随表大小变化的曲线。它在哪里饱和？
4. 在 1D 中实现 DVGO 式的后激活：在 $[0,1]$ 上取一个有 8 个单元的原始密度网格，证明在激活之前插值可以比在激活之后插值产生更锐利的不透明度阶跃。
5. 把 `HashEncoding` 接入第 2 篇的 NeRF，配合单隐藏层的密度 MLP，在玩具场景上比较达到相同 PSNR 所需的训练速度。

**下一篇：** [第 4 篇]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})将彻底抛弃光线步进：3D 高斯泼溅用数百万个显式的各向异性高斯来表示场景，并对其进行实时光栅化。
