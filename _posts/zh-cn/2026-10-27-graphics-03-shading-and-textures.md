---
layout: post
title: "着色与纹理：光照模型、法线贴图、纹理过滤与阴影"
date: 2026-10-27 09:03:00+0900
description: "Lambert、Phong 与 Blinn-Phong，平面/Gouraud/Phong 着色，UV 与切线空间，Mipmap 与各向异性过滤，以及带偏移和 PCF 的阴影映射，附 NumPy 与 GLSL 代码。"
categories: graphics
tags: [shading, blinn-phong, normal-mapping, texture-filtering, mipmap, shadow-mapping, glsl]
series: graphics
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

在[上一篇]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})中，我们把三角形变成了像素：对每个被覆盖的像素，光栅化器都会交给我们经过透视校正插值的属性（位置、法线、UV）。本文回答接下来的问题：**这个像素应该是什么颜色？** 我们将构建经典的局部光照（local illumination）模型（Lambert、Phong、Blinn-Phong），学习纹理如何为它们提供随空间变化的输入（反照率、法线），如何在不产生走样的情况下采样纹理（Mipmap、三线性与各向异性过滤），以及如何用阴影映射（shadow mapping）加入第一个非局部效果——阴影。这些“经验”模型正是基于物理的渲染（PBR，[下一篇]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})）要用物理来替换的对象，而本文中的每个概念（切线坐标系、Mip 层级、深度比较、G-buffer）都会延续到 PBR、光线追踪乃至神经渲染中。

## 前置知识

- 点积与叉积，以及为什么法线要用逆转置矩阵变换（[第 01 篇]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})）。
- MVP 管线、重心坐标、透视校正插值，以及顶点/片元着色器的分工（[第 02 篇]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})）。
- NumPy；懂一点 GLSL 会有帮助，但下面的每个着色器都有注释。

## 1. 着色用到的向量

局部着色只关注一个表面点 $\mathbf{p}$ 和若干**单位**向量，它们必须表示在同一个空间中（世界空间或观察空间；混用空间是最常见的着色 bug）：

| 符号 | 含义 |
| --- | --- |
| $\mathbf{n}$ | $\mathbf{p}$ 处的表面法线 |
| $\mathbf{l}$ | 从 $\mathbf{p}$ **指向**光源的方向 |
| $\mathbf{v}$ | 从 $\mathbf{p}$ **指向**眼睛的方向 |
| $\mathbf{r}$ | $\mathbf{l}$ 关于 $\mathbf{n}$ 的镜面反射方向 |
| $\mathbf{h}$ | $\mathbf{l}$ 与 $\mathbf{v}$ 之间的半程向量（half vector） |

它们全都*背离*表面。对方向光而言 $\mathbf{l}$ 是常量；对位于 $\mathbf{x}_L$ 的点光源，$\mathbf{l} = (\mathbf{x}_L - \mathbf{p})/\lVert\mathbf{x}_L - \mathbf{p}\rVert$，接收到的强度随距离 $d$ 按 $1/d^2$ 衰减。

## 2. 局部光照模型

### 2.1 Lambert：漫反射

完全哑光的（漫反射，diffuse）表面会把入射光均匀地散射到所有方向，因此它的亮度与 $\mathbf{v}$ 无关。它依赖的是自己*接收*了多少光：截面积为 $A$ 的光束以与法线成 $\theta$ 的角度照到表面上，会铺开到面积 $A/\cos\theta$ 上，所以单位面积上的能量正比于 $\cos\theta = \mathbf{n}\cdot\mathbf{l}$（Lambert 余弦定律）。截断为零可以去掉来自背面的光：

$$
L_\text{diffuse} = k_d \, I_L \, \max(0,\ \mathbf{n}\cdot\mathbf{l})
$$

其中 $k_d$ 是漫反射颜色（反照率，albedo），$I_L$ 是光源强度。在 PBR 中我们会看到，物理上正确的漫反射 BRDF 是 $k_d/\pi$，这里的 $\pi$ 被吸收进了光源的单位里。

### 2.2 Phong：围绕镜面方向的高光波瓣

光滑的表面还会出现随观察者移动的高光。Phong（1975）把它建模为围绕镜面反射方向的一个波瓣（lobe）：

$$
\mathbf{r} = 2(\mathbf{n}\cdot\mathbf{l})\,\mathbf{n} - \mathbf{l},
$$

推导方法是把 $\mathbf{l}$ 分解为沿 $\mathbf{n}$ 的分量 $(\mathbf{n}\cdot\mathbf{l})\mathbf{n}$ 和切向的剩余部分，再把剩余部分翻转。完整的 Phong 反射模型为

$$
L = k_a I_a + k_d I_L \max(0,\ \mathbf{n}\cdot\mathbf{l}) + k_s I_L \max(0,\ \mathbf{r}\cdot\mathbf{v})^{s},
$$

其中环境光项 $k_a I_a$ 是对所有间接光的一个粗糙的常数替代，$k_s$ 是高光颜色，$s$ 是**高光指数**（shininess）：$s$ 越大，高光越集中、越小。

### 2.3 Blinn-Phong：半程向量

Blinn（1977）用 $\mathbf{n}\cdot\mathbf{h}$ 取代了 $\mathbf{r}\cdot\mathbf{v}$，其中

$$
\mathbf{h} = \frac{\mathbf{l} + \mathbf{v}}{\lVert\mathbf{l} + \mathbf{v}\rVert}, \qquad
L_\text{spec} = k_s I_L \max(0,\ \mathbf{n}\cdot\mathbf{h})^{s'} .
$$

直觉：$\mathbf{h}$ 是一面微小镜子要把 $\mathbf{l}$ 恰好反射到 $\mathbf{v}$ 所需的朝向；$\mathbf{n}\cdot\mathbf{h}$ 衡量实际法线与这个理想镜面朝向有多接近。这正是下一篇中**微表面**（microfacet）理论的核心思想：$\mathbf{h}$ 成为微表面法线，$(\mathbf{n}\cdot\mathbf{h})^{s'}$ 成为法线分布函数。

为什么更喜欢 Blinn-Phong？

1. **更便宜**：对方向光和远处的观察者，$\mathbf{h}$ 在整个物体上都是常量。
2. **表现更好**：当 $\mathbf{r}$ 与 $\mathbf{v}$ 的夹角超过 $90^\circ$ 时 $\mathbf{r}\cdot\mathbf{v}$ 变为负数，这会让粗糙（$s$ 较小）表面在掠射角下的高光被突然截断；而只要 $\mathbf{l}$ 和 $\mathbf{v}$ 都在表面上方，$\mathbf{n}\cdot\mathbf{h}$ 就始终为正。
3. **更接近测量数据**：高光在掠射角下会被拉长，与真实表面一致。

两个指数并不相同。当 $\mathbf{v}$ 位于 $\mathbf{n}$ 与 $\mathbf{l}$ 所在平面内时，$\mathbf{n}$ 与 $\mathbf{h}$ 的夹角恰好是 $\mathbf{r}$ 与 $\mathbf{v}$ 夹角 $\alpha$ 的一半。利用 $\ln\cos x \approx -x^2/2$，

$$
(\cos\tfrac{\alpha}{2})^{s'} \approx e^{-s'\alpha^2/8}, \qquad (\cos\alpha)^{s} \approx e^{-s\alpha^2/2}
\quad\Rightarrow\quad s' \approx 4s .
$$

最后留一句给以后：原始模型并不满足能量守恒（$s$ 越大，高光越小，*总体*也越暗）。实时渲染中常见的修正是给高光项乘上 $(s'+8)/(8\pi)$，这是一个近似的归一化因子；PBR 会严格地解决这个问题。

下面的 NumPy 代码在一个球上计算 Lambert + Phong / Blinn-Phong，并写出 PPM 图像（任何图片查看器都能打开）。取 $s' = 4s$ 时两张图几乎相同，验证了上面的推导（平均亮度 0.418 对 0.416）。

```python
import numpy as np

def normalize(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)

def shade(n, l, v, model="blinn", kd=0.8, ks=0.5, shininess=32.0, ka=0.05):
    """n, l, v: (..., 3) unit vectors pointing away from the surface."""
    ndotl = np.clip(np.sum(n * l, -1), 0.0, None)
    diffuse = kd * ndotl                                   # Lambert
    if model == "phong":
        r = 2.0 * np.sum(n * l, -1, keepdims=True) * n - l  # mirror l about n
        spec = np.clip(np.sum(r * v, -1), 0.0, None) ** shininess
    else:                                                  # Blinn-Phong
        h = normalize(l + v)
        spec = np.clip(np.sum(n * h, -1), 0.0, None) ** shininess
    spec = np.where(ndotl > 0.0, spec, 0.0)                # no highlight on the back side
    return ka + diffuse + ks * spec

# Render a unit sphere seen by an orthographic camera looking down -z.
W = H = 256
y, x = np.mgrid[1:-1:H*1j, -1:1:W*1j]
inside = x**2 + y**2 < 1.0
z = np.sqrt(np.clip(1.0 - x**2 - y**2, 0.0, None))
n = np.stack([x, y, z], -1)                    # the normal of a unit sphere is its position
l = normalize(np.array([1.0, 1.0, 1.0]))       # directional light
v = np.array([0.0, 0.0, 1.0])                  # orthographic viewer

for model, s in [("phong", 16.0), ("blinn", 64.0)]:
    img = np.where(inside, shade(n, l, v, model, shininess=s), 0.0)
    rgb = (np.clip(img, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)   # crude gamma
    with open(f"sphere_{model}.ppm", "wb") as f:
        f.write(b"P6 %d %d 255\n" % (W, H))
        f.write(np.repeat(rgb[..., None], 3, -1).tobytes())
    print(model, "max", img.max().round(3), "mean", img[inside].mean().round(3))
```

## 3. 着色频率：平面、Gouraud 与 Phong 着色

光照*模型*说明如何由 $(\mathbf{n},\mathbf{l},\mathbf{v})$ 计算颜色；着色*频率*说明**在哪里**计算它。不要把 Phong 反射模型和 Phong 着色（插值方式）混为一谈：它们出自同一篇论文，却是相互独立的选择。

| 方法 | 计算位置 | 使用的法线 | 优点 | 缺点 |
| --- | --- | --- | --- | --- |
| 平面着色（flat） | 每个三角形一次 | 面法线 | 便宜，可刻意做出多面体风格 | 曲面上出现棱面感 |
| Gouraud（1971） | 每个顶点，插值颜色 | 顶点法线 | 便宜、平滑 | 三角形内部的高光会丢失或被抹开；马赫带 |
| Phong 着色（1975） | 每个像素 | 插值后的顶点法线，**重新归一化** | 高光正确 | 片元计算更多（如今可以忽略） |

在现代 GPU 上，逐像素着色是默认做法：顶点着色器输出法线，光栅化器对其做（透视校正的）插值，片元着色器再把它重新归一化，因为单位向量的线性混合会比单位长度短。

对于没有法线的网格，**顶点法线**通常通过对相邻面的法线取平均来计算。按三角形面积加权是免费的：两条边的叉积长度正好是面积的两倍。

```python
import numpy as np

def vertex_normals(P, F):
    """P: (V,3) positions, F: (T,3) triangle indices -> (V,3) area-weighted normals."""
    e1 = P[F[:, 1]] - P[F[:, 0]]
    e2 = P[F[:, 2]] - P[F[:, 0]]
    fn = np.cross(e1, e2)                 # length = 2 * triangle area -> area weighting for free
    N = np.zeros_like(P)
    for k in range(3):
        np.add.at(N, F[:, k], fn)         # scatter-add each face normal to its 3 vertices
    return N / np.linalg.norm(N, axis=1, keepdims=True)

def vertex_tangents(P, UV, F, N):
    """Per-vertex tangent frame (T.xyz, handedness w) from positions and UVs."""
    e1 = P[F[:, 1]] - P[F[:, 0]]
    e2 = P[F[:, 2]] - P[F[:, 0]]
    d1 = UV[F[:, 1]] - UV[F[:, 0]]
    d2 = UV[F[:, 2]] - UV[F[:, 0]]
    det = d1[:, 0] * d2[:, 1] - d2[:, 0] * d1[:, 1]
    r = 1.0 / np.where(np.abs(det) < 1e-12, 1e-12, det)
    t = (e1 * d2[:, 1:2] - e2 * d1[:, 1:2]) * r[:, None]   # dP/du
    b = (e2 * d1[:, 0:1] - e1 * d2[:, 0:1]) * r[:, None]   # dP/dv
    T = np.zeros_like(P); B = np.zeros_like(P)
    for k in range(3):
        np.add.at(T, F[:, k], t)
        np.add.at(B, F[:, k], b)
    T = T - N * np.sum(N * T, 1, keepdims=True)            # Gram-Schmidt against N
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    w = np.sign(np.sum(np.cross(N, T) * B, 1))             # +1 or -1 (mirrored UVs)
    return T, w

# A unit quad in the xy-plane with a standard UV layout
P  = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], float)
UV = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], float)
F  = np.array([[0, 1, 2], [0, 2, 3]])
N = vertex_normals(P, F)
T, w = vertex_tangents(P, UV, F, N)
print("N", N[0], "T", T[0], "w", w[0])        # expect N=(0,0,1), T=(1,0,0), w=+1
UVm = UV.copy(); UVm[:, 0] = 1 - UVm[:, 0]   # mirror the texture horizontally
print("mirrored w", vertex_tangents(P, UVm, F, N)[1][0])   # expect -1
```

第二个函数计算切线，我们在第 6 节会用到。如果想在着色器中不借助逐面数据实现平面着色，可以利用插值位置的屏幕空间导数，它们张成三角形所在的平面：

```glsl
#version 330 core
in vec3 vWorldPos;
out vec4 fragColor;
uniform vec3 uLightDir;
void main() {
    // flat shading without per-face data: the screen-space derivatives of the
    // position span the triangle's plane, so their cross product is the face normal
    vec3 Nf = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    fragColor = vec4(vec3(max(dot(Nf, normalize(uLightDir)), 0.0)), 1.0);
}
```

## 4. 纹理与 UV 映射

真实的表面逐点变化。我们不在每个顶点上存储 $k_d$，而是把它存进一张图像，即**纹理**（texture），并给每个顶点一个**纹理坐标** $(u,v)\in[0,1]^2$。Catmull 在 1974 年的博士论文中提出了纹理映射；如今纹理中存放着反照率、法线、粗糙度、金属度、环境光遮蔽、位移等各种数据。

- **UV 映射（参数化，parameterization）**是从三维表面到二维纹理正方形的映射。封闭曲面必须**沿接缝（seam）切开**才能展平；美术人员或工具（xatlas、Blender 的展开器）会尽量减小拉伸与扭曲。在接缝处，一个顶点会被复制成两个，各自带有不同的 UV。
- UV 像其他属性一样在三角形上插值，而且**必须**做透视校正插值（[第 02 篇]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})）；仿射插值会让大三角形上的纹理游移、弯曲。
- **环绕模式**（wrap mode）决定 $[0,1]$ 之外如何处理：重复（平铺）、钳制到边缘、镜像重复。
- **纹素中心**：宽度为 $W$ 的纹理中，第 $i$ 个纹素（texel）覆盖 $[i, i+1)/W$，中心位于 $(i + 0.5)/W$。把 $u$ 映射到连续的纹素空间是 $x = uW - 0.5$；忘掉这个 $0.5$ 会让所有纹理偏移半个纹素。
- **色彩空间**：反照率纹理通常以 sRGB 存储，光照计算前必须解码到线性空间（对 `SRGB8_ALPHA8` 等格式 GPU 会自动完成）；法线、粗糙度等数据纹理则是线性的。

## 5. 纹理过滤

一个像素很少恰好对应一个纹素。分两种情况：

- **放大**（magnification）：一个纹素覆盖许多像素（特写）。我们需要*插值*。
- **缩小**（minification）：一个像素覆盖许多纹素（远处的地板）。我们需要在像素的覆盖区域（footprint）上*求平均*，否则就会出现走样：摩尔纹和闪烁，这与第 02 篇中锯齿边缘是同一个采样问题。

### 5.1 最近邻与双线性

最近邻（nearest）选取包含采样点的纹素，看起来呈块状。**双线性**（bilinear）过滤混合最近的四个纹素中心。设 $x = uW - 0.5$，$y = vH - 0.5$，$x_0 = \lfloor x\rfloor$，$f_x = x - x_0$（$y_0$、$f_y$ 同理）：

$$
T(u,v) = (1-f_y)\big[(1-f_x)\,T_{x_0,y_0} + f_x\,T_{x_0+1,y_0}\big] + f_y\big[(1-f_x)\,T_{x_0,y_0+1} + f_x\,T_{x_0+1,y_0+1}\big].
$$

### 5.2 Mipmap

在运行时对每个像素平均数百个纹素太慢了。Williams（1983）提出预先计算 **Mipmap**（源自拉丁语 *multum in parvo*，“小中见多”）：一个金字塔，第 $k+1$ 层是第 $k$ 层在每个方向上降采样一半的结果。额外内存为

$$
\frac14 + \frac1{16} + \frac1{64} + \dots = \frac13,
$$

即带 Mipmap 的纹理占用原始纹理的 $4/3$。为了选择层级，我们需要估计屏幕上移动一个像素会跨过多少纹素。GPU 以 $2\times2$ 的**像素四元组**（quad）为单位着色，因此可以在相邻像素之间对 $(u,v)$ 做有限差分（在 GLSL 中即 `dFdx`、`dFdy`）。把 $u, v$ 换算到纹素单位后，

$$
\rho = \max\!\left(\sqrt{\left(\tfrac{\partial u}{\partial x}\right)^2 + \left(\tfrac{\partial v}{\partial x}\right)^2},\ \sqrt{\left(\tfrac{\partial u}{\partial y}\right)^2 + \left(\tfrac{\partial v}{\partial y}\right)^2}\right),
\qquad \lambda = \log_2 \rho .
$$

在第 $\lambda$ 层，一个纹素大约有一个像素宽，因此一次双线性查询就近似等于覆盖区域上的平均。$\lambda < 0$ 表示放大（使用第 0 层）。

### 5.3 三线性过滤

直接选取最近的整数层级，会在 $\lambda$ 跨过整数的地方出现明显的接缝。**三线性**（trilinear）过滤在第 $\lfloor\lambda\rfloor$ 层和第 $\lfloor\lambda\rfloor + 1$ 层各做一次双线性查询，再以权重 $\lambda - \lfloor\lambda\rfloor$ 线性混合：每次采样读取 8 个纹素。下面的代码构建 Mip 金字塔，并比较不使用和使用 Mipmap 时采样细密棋盘格的结果。不用 Mipmap 时得到的是看似随机的 0/1 图案（标准差 0.48）：这就是走样。三线性过滤则返回正确的平均灰度 0.5。

```python
import numpy as np

def build_mips(tex):
    """tex: (S,S,C), S a power of two -> [level 0, level 1, ...], each level half the size."""
    levels = [tex]
    while levels[-1].shape[0] > 1:
        t = levels[-1]                                       # 2x2 box filter
        levels.append(0.25 * (t[0::2, 0::2] + t[1::2, 0::2] + t[0::2, 1::2] + t[1::2, 1::2]))
    return levels

def bilinear(tex, u, v):
    """Repeat wrapping; u, v arrays in UV units; texel centers sit at (i + 0.5) / size."""
    h, w = tex.shape[:2]
    x = u * w - 0.5
    y = v * h - 0.5
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    x0, y0 = x0 % w, y0 % h
    x1, y1 = (x0 + 1) % w, (y0 + 1) % h
    top = tex[y0, x0] * (1 - fx) + tex[y0, x1] * fx
    bot = tex[y1, x0] * (1 - fx) + tex[y1, x1] * fx
    return top * (1 - fy) + bot * fy

def mip_lod(size, dudx, dvdx, dudy, dvdy):
    """Derivatives in UV units per pixel (what dFdx/dFdy return in a shader)."""
    rho = np.maximum(np.hypot(dudx, dvdx), np.hypot(dudy, dvdy)) * size   # texels per pixel
    return np.log2(np.maximum(rho, 1e-8))

def trilinear(mips, u, v, lod):
    lod = np.clip(lod, 0, len(mips) - 1)
    l0 = np.floor(lod).astype(int)
    l1 = np.minimum(l0 + 1, len(mips) - 1)
    t = (lod - l0)[..., None]
    out = np.zeros(u.shape + mips[0].shape[2:])
    for L in range(len(mips)):                # simple, not fast: blend the two nearest levels
        s = bilinear(mips[L], u, v)
        out += np.where((l0 == L)[..., None], (1 - t) * s, 0.0)
        out += np.where((l1 == L)[..., None], t * s, 0.0)
    return out

# Checkerboard texture, 256 x 256, 8 x 8 texel squares
S = 256
i, j = np.mgrid[0:S, 0:S]
tex = (((i // 8) + (j // 8)) % 2).astype(float)[..., None]
mips = build_mips(tex)
print(len(mips), "levels; memory overhead", sum(m.size for m in mips[1:]) / tex.size)

# A row of 64 screen pixels that covers the texture 7.3 times: ~29 texels per pixel
u = (np.arange(64) + 0.5) / 64 * 7.3
v = np.full_like(u, 0.3)
du = np.full_like(u, 7.3 / 64)                # du/dx; the other derivatives are zero
zero = np.zeros_like(u)
lod = mip_lod(S, du, zero, zero, zero)
point = bilinear(tex, u, v)[:, 0]
filt = trilinear(mips, u, v, lod)[:, 0]
print("lod %.2f" % lod[0])                    # log2(29.2) = 4.87
print("no mipmap : mean %.3f std %.3f" % (point.mean(), point.std()))   # random-looking 0/1 pattern
print("trilinear: mean %.3f std %.3f" % (filt.mean(), filt.std()))     # ~0.5 grey, as it should be
```

### 5.4 各向异性过滤

Mipmap 假设像素在纹理空间中的覆盖区域是正方形。但以掠射角观察地板时，它是一个细长的椭圆：沿一个屏幕轴的 $\rho$ 远大于另一个轴。各向同性的 Mipmap 只能采用较大的那个，于是纹理在另一个方向上变得模糊。**各向异性过滤**（anisotropic filtering）在更精细的层级上沿覆盖区域的长轴做多次探测。一种常见的表述（OpenGL 各向异性过滤扩展中的做法）是

$$
N = \min\!\left(\left\lceil \frac{\rho_{\max}}{\rho_{\min}} \right\rceil,\ N_{\max}\right), \qquad \lambda = \log_2\frac{\rho_{\max}}{N},
$$

然后沿长轴对 $N$ 个三线性采样取平均；$N_{\max}$ 就是游戏设置菜单里的“16x”。求和面积表（summed-area table，Crow 1984）和 EWA 过滤（Greene 与 Heckbert 1986）是质量更高的替代方案；椭圆加权平均（elliptical weighted average）的思想会在我们泼溅（splat）三维高斯时再次出现。

在 OpenGL 中，这些选择都是采样器状态：

```c
glBindTexture(GL_TEXTURE_2D, tex);
glGenerateMipmap(GL_TEXTURE_2D);                                   // build the pyramid
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR); // trilinear
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);               // bilinear
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
glTexParameterf(GL_TEXTURE_2D, GL_TEXTURE_MAX_ANISOTROPY, 16.0f);  // core in GL 4.6 (EXT before)
```

## 6. 法线贴图与切线空间

### 6.1 从凹凸贴图到法线贴图

几何体很昂贵；细小的细节（划痕、毛孔、砖缝）主要通过改变**着色**来体现，而着色取决于法线。Blinn（1978）提出了**凹凸贴图**（bump mapping）：保留粗略的表面，但扰动其法线，就好像表面被高度场 $h(u,v)$ 位移过一样。对于一个局部平坦、具有正交归一的切线 $\mathbf{T}$、副切线 $\mathbf{B}$ 和法线 $\mathbf{N}$ 的表面，位移后的表面 $\mathbf{p} + h\,\mathbf{N}$ 在一阶近似下的法线为

$$
\mathbf{n}' \propto \mathbf{N} - \frac{\partial h}{\partial u}\,\mathbf{T} - \frac{\partial h}{\partial v}\,\mathbf{B}.
$$

**法线贴图**（normal map）只是为每个纹素预先计算好 $\mathbf{n}'$ 并存进 RGB 纹理，通常由高模雕刻烘焙（bake）到低模网格上。$[-1,1]$ 范围的分量被编码为颜色 $c = (\mathbf{n}+1)/2$；平坦区域为 $(0.5, 0.5, 1)$，这就是切线空间法线贴图看起来是淡蓝色的原因。

### 6.2 切线空间

存储的法线表示在**切线空间**（tangent space）中，即局部坐标系 $(\mathbf{T}, \mathbf{B}, \mathbf{N})$，其中 $\mathbf{T}$ 沿表面上 $u$ 增大的方向，$\mathbf{B}$ 沿 $v$ 增大的方向。这使得贴图与网格的姿态和形变无关，也让同一张贴图可以平铺或在多个网格间复用。在着色器中，矩阵 $\text{TBN} = [\mathbf{T}\ \mathbf{B}\ \mathbf{N}]$（按列排列）把切线空间向量变换到世界空间：

$$
\mathbf{n}_\text{world} = \operatorname{normalize}\big(\text{TBN}\,(2\mathbf{c} - 1)\big).
$$

**推导 $\mathbf{T}$ 和 $\mathbf{B}$。** 对于顶点位置为 $\mathbf{p}_0,\mathbf{p}_1,\mathbf{p}_2$、UV 为 $(u_i, v_i)$ 的三角形，令 $\mathbf{E}_1 = \mathbf{p}_1 - \mathbf{p}_0$，$\mathbf{E}_2 = \mathbf{p}_2 - \mathbf{p}_0$，$\Delta u_1 = u_1 - u_0$，依此类推。由于 $\mathbf{T} = \partial\mathbf{p}/\partial u$ 和 $\mathbf{B} = \partial\mathbf{p}/\partial v$ 在平坦三角形上是常量，

$$
\begin{bmatrix} \mathbf{E}_1 & \mathbf{E}_2 \end{bmatrix}
= \begin{bmatrix} \mathbf{T} & \mathbf{B} \end{bmatrix}
\begin{bmatrix} \Delta u_1 & \Delta u_2 \\ \Delta v_1 & \Delta v_2 \end{bmatrix}
\quad\Rightarrow\quad
\begin{bmatrix} \mathbf{T} & \mathbf{B} \end{bmatrix}
= \frac{1}{\Delta u_1 \Delta v_2 - \Delta u_2 \Delta v_1}
\begin{bmatrix} \mathbf{E}_1 & \mathbf{E}_2 \end{bmatrix}
\begin{bmatrix} \Delta v_2 & -\Delta u_2 \\ -\Delta v_1 & \Delta u_1 \end{bmatrix}.
$$

逐三角形的结果在顶点处累加（与法线一样），然后用 Gram-Schmidt 正交化使 $\mathbf{T}$ 垂直于 $\mathbf{N}$：$\mathbf{T} \leftarrow \operatorname{normalize}(\mathbf{T} - (\mathbf{N}\cdot\mathbf{T})\mathbf{N})$；最后只存储一个**手性**（handedness）符号 $w = \operatorname{sign}((\mathbf{N}\times\mathbf{T})\cdot\mathbf{B})$，在着色器中再重建 $\mathbf{B} = w\,(\mathbf{N}\times\mathbf{T})$。在 UV 被镜像的地方 $w = -1$（美术人员会镜像 UV 来节省纹理空间）。第 3 节中的 `vertex_tangents` 正是这样实现的，并检查了这两种情况。

实践中的陷阱：

- **烘焙器和渲染器必须使用一致的切线基**，否则光照会出现接缝。事实标准是 MikkTSpace（Mikkelsen 2008），Blender、Unity、Unreal 和 glTF 都采用它。
- **绿色通道约定**：OpenGL 风格的贴图以 $+Y$ 为上，DirectX 风格为 $-Y$。如果凹凸看起来是反的，就翻转绿色通道。
- **坐标系的变换**：$\mathbf{T}$ 和 $\mathbf{B}$ 是表面上的*方向*，用模型矩阵变换；$\mathbf{N}$ 用逆转置矩阵变换（第 01 篇）。在非均匀缩放下二者不同，这就是下面的顶点着色器要重新正交化的原因。

## 7. 阴影映射

到目前为止一切都是**局部**的：一个点的颜色只取决于它自己和光源。阴影则取决于是否有*其他*几何体挡住了光。Williams（1978）注意到，“$\mathbf{p}$ 从光源看是否可见？”是一个可见性问题，而 z-buffer 已经回答了它，只不过是从另一台相机看。

### 7.1 两遍算法

1. **阴影遍**（shadow pass）：从光源的位置渲染场景（方向光用正交投影，聚光灯用透视投影），只保留深度缓冲。结果 $D(s,t)$ 就是**阴影贴图**（shadow map）：沿每条光线最近表面的深度。
2. **主渲染遍**（main pass）：对每个着色点，用同样的光源矩阵变换它，除以齐次坐标 $w$，再把 NDC 映射到 $[0,1]$。如果它在光源空间中的深度 $z$ 通过了与存储深度的比较测试，则该点被照亮：

$$
\mathbf{q} = P_L V_L\,\mathbf{p}_{\text{world}}, \qquad
(s, t, z) = \tfrac12\,\frac{(q_x, q_y, q_z)}{q_w} + \tfrac12, \qquad
z - b \le D(s, t),
$$

其中 $b$ 是一个小的**偏移**（bias）。点光源使用立方体贴图（六张阴影贴图）。

### 7.2 阴影痤疮与偏移

没有偏移时，被照亮的表面上会布满虚假阴影的条纹，即**阴影痤疮**（shadow acne）。阴影贴图只在纹素*中心*存储深度。一个纹素在接收面上覆盖宽度为 $w$ 的区域；如果接收面相对光线倾斜了角度 $\theta$（$\cos\theta = \mathbf{n}\cdot\mathbf{l}$），它的深度在这片区域内会变化 $w\tan\theta$，于是位于纹素中心后方的大约一半的点，会在与自身表面的比较中失败。深度量化还会再引入一点误差。因此标准的偏移为

$$
b = b_0 + b_s \tan\theta, \qquad \tan\theta = \frac{\sqrt{1 - (\mathbf{n}\cdot\mathbf{l})^2}}{\mathbf{n}\cdot\mathbf{l}},
$$

即一个常数部分加上一个**按斜率缩放**（slope-scaled）的部分（GPU 在阴影遍中通过 `glPolygonOffset(factor, units)` 直接支持）。偏移过大则会导致相反的瑕疵——**彼得·潘现象**（Peter Panning）：由于接触区域被判定为受光，阴影与投射物分离。其他补救方法包括**法线偏移**（normal offset，把查询点沿 $\mathbf{n}$ 移动一个纹素的若干分之一）、把背面渲染进阴影贴图，以及收紧光源视锥以提高深度精度。

### 7.3 百分比渐近过滤（PCF）

阴影贴图的纹素往往比屏幕像素大，所以阴影边缘呈锯齿状。你不能简单地对深度图做双线性过滤：把投射物和接收面的深度平均，得到的是一个毫无意义的深度，而比较结果仍然是二值的。Reeves、Salesin 和 Cook（1987）注意到必须交换顺序：**先比较，再过滤**二值结果。

$$
V(\mathbf{p}) = \frac{1}{\lvert K\rvert} \sum_{\boldsymbol{\delta} \in K} \big[\, z - b \le D\big((s,t) + \boldsymbol{\delta}\big) \big],
$$

其中 $K$ 是偏移量组成的核（例如 $3\times3$ 个纹素），$[\cdot]$ 在条件成立时为 1，否则为 0。$V \in [0,1]$ 是邻域中受光部分所占的比例，从而得到抗锯齿、看起来柔和的边缘。硬件直接支持这一点：设置 `GL_TEXTURE_COMPARE_MODE = GL_COMPARE_REF_TO_TEXTURE` 并使用 `sampler2DShadow`，一次 `texture()` 调用就会做四次比较，并返回它们的双线性加权平均。

下面的玩具示例为倾斜地面（斜率 0.4）上方的一个球渲染阴影贴图，并精确地测量各种瑕疵。使用最近邻查询且没有偏移时，受光地面中**恰好 50%** 处于虚假阴影中，原因如上所述。0.002 的常数偏移小于最坏情况误差 $\tfrac{w}{2}\tan\theta = 0.0156 \cdot 0.4 = 0.00625$，只能部分缓解；按斜率缩放的偏移 $w\tan\theta$ 则完全消除了痤疮；0.5 这样巨大的常数偏移虽然消除了痤疮，却在接触区域附近“丢失”了 10.9% 的真实阴影（彼得·潘现象；其他几行中的 2-4% 主要来自阴影边缘的走样，这正是 PCF 要解决的问题）。最后，$3\times3$ 的 PCF 核会多探出一个纹素，所以在相同偏移下痤疮又出现了；**偏移必须随核半径增大**。

```python
import numpy as np

# Scene: a tilted ground y = 0.4 x and a sphere above it, lit by a directional
# light pointing straight down (-y). Light space: (x, z) -> shadow-map texel,
# depth = distance below the light plane y = 2.
R, SLOPE, Y0 = 64, 0.4, 2.0
C, RAD = np.array([0.0, 0.45, 0.0]), 0.3

def surface_height(x, z):
    """Height of the first surface the light sees above (x, z)."""
    y = SLOPE * x
    d2 = (x - C[0])**2 + (z - C[2])**2
    cap = C[1] + np.sqrt(np.clip(RAD**2 - d2, 0, None))
    return np.where(d2 < RAD**2, np.maximum(y, cap), y)

# Pass 1: render the shadow map (depth from the light at each texel center)
texel = 2.0 / R
centers = -1 + (np.arange(R) + 0.5) * texel
X, Z = np.meshgrid(centers, centers, indexing="xy")
shadow_map = (Y0 - surface_height(X, Z)).astype(np.float32)

def visibility(px, pz, depth, bias, pcf=0):
    """Fraction of (2*pcf+1)^2 shadow-map tests that the receiver passes."""
    ix = np.floor((px + 1) / texel).astype(int)
    iz = np.floor((pz + 1) / texel).astype(int)
    lit = np.zeros_like(depth)
    for dz in range(-pcf, pcf + 1):
        for dx in range(-pcf, pcf + 1):
            m = shadow_map[np.clip(iz + dz, 0, R - 1), np.clip(ix + dx, 0, R - 1)]
            lit += depth <= m + bias          # compare first, then average (PCF)
    return lit / (2 * pcf + 1)**2

# Pass 2: shade ground points on a finer grid than the shadow map
g = -1 + (np.arange(512) + 0.5) * (2.0 / 512)
PX, PZ = np.meshgrid(g, g, indexing="xy")
depth = Y0 - SLOPE * PX
r = np.hypot(PX - C[0], PZ - C[2])
far_lit = r > RAD + 3 * texel          # clearly outside the shadow (ignore the aliased rim)
in_shadow = r < RAD

cos_t = 1.0 / np.sqrt(1 + SLOPE**2)            # n . l for the tilted ground
tan_t = np.sqrt(1 - cos_t**2) / cos_t          # = SLOPE
for name, bias in [("no bias", 0.0), ("const 0.002", 0.002),
                   ("slope-scaled", 1.0 * texel * tan_t), ("const 0.5", 0.5)]:
    vis = visibility(PX, PZ, depth, bias)
    acne = np.mean(vis[far_lit] < 1)       # lit points wrongly in shadow
    lost = np.mean(vis[in_shadow] == 1)    # shadowed points wrongly lit
    print(f"{name:13s} bias={bias:.4f}  acne {acne:6.1%}  lost shadow {lost:6.1%}")

# PCF: a 3x3 kernel reaches one texel further, so the slope bias must grow with it
for bias in [1.0 * texel * tan_t, 2.0 * texel * tan_t]:
    vis = visibility(PX, PZ, depth, bias, pcf=1)
    print("PCF 3x3 bias=%.4f  acne %5.1f%%  penumbra pixels %5.2f%%" % (
        bias, 100 * np.mean(vis[far_lit] < 1), 100 * np.mean((vis > 0) & (vis < 1))))
img = (255 * (0.15 + 0.85 * vis)).astype(np.uint8)
with open("shadow_pcf.pgm", "wb") as f:
    f.write(b"P5 512 512 255\n" + img.tobytes())
```

输出：

```text
no bias       bias=0.0000  acne  50.0%  lost shadow   2.0%
const 0.002   bias=0.0020  acne  37.5%  lost shadow   2.4%
slope-scaled  bias=0.0125  acne   0.0%  lost shadow   3.9%
const 0.5     bias=0.5000  acne   0.0%  lost shadow  10.9%
PCF 3x3 bias=0.0125  acne  49.1%  penumbra pixels 48.41%
PCF 3x3 bias=0.0250  acne   0.0%  penumbra pixels  3.91%
```

在基础阴影贴图之外，你还会遇到级联阴影贴图（cascaded shadow maps，为大型室外场景的不同深度范围使用多张贴图）、方差阴影贴图（variance shadow maps，Donnelly 与 Lauritzen 2006，存储深度的矩，因此贴图*可以*被过滤），以及 PCSS（Fernando 2005），它估计遮挡物距离来改变 PCF 核的大小，从而产生“接触处变硬”的软阴影。从物理上说，软阴影来自面光源，而路径追踪可以自然地处理它（[第 05 篇]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})）。

## 8. 用 GLSL 组合起来

顶点着色器变换位置、构建 TBN 坐标系，并计算光源裁剪空间中的位置；片元着色器采样反照率和法线贴图，计算 Blinn-Phong，并把直接光照乘以 PCF 可见性。阴影遍本身是一个极简的只写深度的着色器，输出 `gl_Position = uLightViewProj * uModel * vec4(aPos, 1.0)`。

```glsl
#version 330 core
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aTangent;   // xyz = tangent, w = handedness (+1 / -1)
layout(location = 3) in vec2 aUV;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat3 uNormalMatrix;   // transpose(inverse(mat3(uModel))), see post 01
uniform mat4 uLightViewProj;  // light's view-projection, used for shadow mapping

out vec3 vWorldPos;
out vec2 vUV;
out mat3 vTBN;
out vec4 vLightClip;

void main() {
    vec4 world = uModel * vec4(aPos, 1.0);
    vec3 N = normalize(uNormalMatrix * aNormal);
    vec3 T = normalize(mat3(uModel) * aTangent.xyz);
    T = normalize(T - dot(T, N) * N);              // Gram-Schmidt: keep T perpendicular to N
    vec3 B = cross(N, T) * aTangent.w;
    vWorldPos = world.xyz;
    vUV = aUV;
    vTBN = mat3(T, B, N);                          // columns: tangent-space -> world
    vLightClip = uLightViewProj * world;
    gl_Position = uProj * uView * world;
}
```

```glsl
#version 330 core
in vec3 vWorldPos;
in vec2 vUV;
in mat3 vTBN;
in vec4 vLightClip;

uniform sampler2D uAlbedo;     // sRGB texture, decoded to linear by the sampler
uniform sampler2D uNormalMap;  // tangent-space normal, OpenGL (Y+) convention
uniform sampler2D uShadowMap;  // depth from the light, in [0,1]
uniform vec3 uLightDir;        // unit vector from the surface toward the light
uniform vec3 uLightColor;
uniform vec3 uCamPos;
uniform float uShininess;      // Blinn-Phong exponent
uniform float uSpecular;       // k_s

out vec4 fragColor;

float shadowPCF(vec4 lightClip, float ndotl) {
    vec3 p = lightClip.xyz / lightClip.w * 0.5 + 0.5;   // NDC -> [0,1] texture/depth space
    if (p.z > 1.0) return 1.0;                          // beyond the light's far plane
    vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
    float tanTheta = sqrt(max(1.0 - ndotl * ndotl, 0.0)) / max(ndotl, 1e-3);
    float bias = clamp(0.0005 + 0.001 * tanTheta, 0.0, 0.01);  // constant + slope-scaled
    float lit = 0.0;
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x) {
            float d = texture(uShadowMap, p.xy + vec2(x, y) * texel).r;
            lit += (p.z - bias <= d) ? 1.0 : 0.0;          // compare, then average
        }
    return lit / 9.0;
}

void main() {
    vec3 albedo = texture(uAlbedo, vUV).rgb;
    vec3 nTangent = texture(uNormalMap, vUV).xyz * 2.0 - 1.0;  // [0,1] -> [-1,1]
    vec3 N = normalize(vTBN * nTangent);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 H = normalize(L + V);

    float ndotl = max(dot(N, L), 0.0);
    float spec = ndotl > 0.0 ? pow(max(dot(N, H), 0.0), uShininess) : 0.0;
    float vis = shadowPCF(vLightClip, ndotl);

    vec3 ambient = 0.03 * albedo;
    vec3 color = ambient + vis * uLightColor * (albedo * ndotl + uSpecular * spec);
    fragColor = vec4(color, 1.0);   // linear; let an sRGB framebuffer encode it
}
```

有三个细节值得注意：光照在**线性**颜色空间中计算（反照率由采样器从 sRGB 解码，帧缓冲再重新编码）；当 $\mathbf{n}\cdot\mathbf{l} \le 0$ 时高光项被置零，以免背光表面出现高光；偏移被钳制，以免在 $\tan\theta \to \infty$ 的掠射角处爆炸。

## 动手试试

[主页实验室]({{ '/' | relative_url }}#lab)中的路径追踪器有**反照率**和**法线**两种视图。这些图像就是 **G-buffer**：延迟渲染器在第一遍中存下的逐像素输入（纹理颜色和着色法线），随后用本文的模型对其进行光照计算；降噪器也把它们用作保边的引导。把它们与**最终**视图对比：所有无法用“反照率乘以 $\mathbf{n}\cdot\mathbf{l}$”解释的东西（软阴影、颜色渗透、光泽反射），正是本系列后续文章要讨论的内容。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Gouraud, *Continuous Shading of Curved Surfaces* | IEEE Trans. Computers | 1971 | [DOI](https://doi.org/10.1109/T-C.1971.223313) | 通过插值顶点颜色实现平滑着色 |
| Catmull, *A Subdivision Algorithm for Computer Display of Curved Surfaces*（博士论文，犹他大学） | 学位论文 | 1974 | | 提出了纹理映射和 z-buffer |
| Phong, *Illumination for Computer Generated Pictures* | Communications of the ACM | 1975 | [DOI](https://doi.org/10.1145/360825.360839) | 环境光 + 漫反射 + 高光模型；逐像素法线插值 |
| Blinn, *Models of Light Reflection for Computer Synthesized Pictures* | SIGGRAPH | 1977 | [PDF（Microsoft Research）](https://www.microsoft.com/en-us/research/wp-content/uploads/1977/01/p192-blinn.pdf) | 半程向量高光；把 Torrance-Sparrow 微表面模型引入图形学 |
| Blinn, *Simulation of Wrinkled Surfaces* | SIGGRAPH | 1978 | [SIGGRAPH history](https://history.siggraph.org/?p=103267) | 凹凸贴图：扰动法线而不是几何 |
| Williams, *Casting Curved Shadows on Curved Surfaces* | SIGGRAPH | 1978 | [SIGGRAPH history](https://history.siggraph.org/?p=120268) | 阴影映射算法 |
| Williams, *Pyramidal Parametrics* | SIGGRAPH | 1983 | | Mipmap 与三线性过滤 |
| Reeves, Salesin, Cook, *Rendering Antialiased Shadows with Depth Maps* | SIGGRAPH | 1987 | [Pixar Graphics](https://graphics.pixar.com/library/ShadowMaps) | 百分比渐近过滤（PCF） |
| Donnelly, Lauritzen, *Variance Shadow Maps* | I3D | 2006 | | 基于深度矩的可过滤阴影贴图 |
| Mikkelsen, *Simulation of Wrinkled Surfaces Revisited*（硕士论文，哥本哈根大学） | 学位论文 | 2008 | | MikkTSpace 切线标准的基础 |

## 学习资源

- **GAMES101**（闫令琪），第 7-9 讲：着色、纹理映射与过滤：[课程主页](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html)。**GAMES202** 深入讲解实时阴影（PCF、PCSS、VSM）。
- **LearnOpenGL**，章节 *Lighting*、*Advanced Lighting → Normal Mapping* 和 *Shadow Mapping*：[learnopengl.com](https://learnopengl.com/)，是本文最实用的配套教程。
- **Berkeley CS184** 和 **Stanford CS148** 讲授纹理过滤与着色，并配有编程作业。
- **Scratchapixel**：[scratchapixel.com](https://www.scratchapixel.com/)，从第一性原理讲解着色与纹理的系列课程。
- **Real-Time Rendering** 第 4 版（Akenine-Möller 等），第 5 章（着色基础）、第 6 章（纹理）和第 7 章（阴影）：[realtimerendering.com](https://www.realtimerendering.com/)。

## 练习

1. 证明当 $\mathbf{v}$ 位于 $\mathbf{n}$ 与 $\mathbf{l}$ 所在平面内时，$\mathbf{n}$ 与 $\mathbf{h}$ 的夹角是 $\mathbf{r}$ 与 $\mathbf{v}$ 夹角的一半。然后分别用 $s=16$ 的 Phong 和 $s'=16, 64$ 的 Blinn-Phong 渲染，在掠射光方向（例如 $\mathbf{l} = (1, 0, 0.1)$）下比较高光。
2. 为球体渲染器加入 Gouraud 着色：在一个粗糙 UV 球网格的顶点上计算光照模型，再用重心坐标插值颜色。高光在哪里出了问题？
3. 利用第 5 节的纹理过滤代码，为 $\partial u/\partial x = 8/64$、$\partial v/\partial y = 1/64$ 的覆盖区域实现各向异性过滤，并与普通三线性过滤比较沿 $v$ 方向的清晰度。
4. 用凹凸贴图公式从高度场 $h(u,v) = 0.05\sin(20u)$ 生成法线贴图，再用 `vertex_tangents` 得到的 TBN 为一个平面四边形着色。
5. 把阴影玩具示例中的 $3\times3$ 盒式 PCF 换成泊松圆盘（Poisson disk）核，并实现接收面深度偏移（receiver-plane depth bias，利用屏幕空间导数估计深度在核内的变化），使偏移不再需要随核增大。

**下一篇：**[基于物理的渲染]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})，辐射度量学将把这些经验方法变成渲染方程，而 $\mathbf{n}\cdot\mathbf{h}$ 将变成 GGX 微表面分布。
