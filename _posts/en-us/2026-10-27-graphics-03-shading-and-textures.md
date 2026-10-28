---
layout: post
title: "Shading and textures: lighting models, normal maps, filtering and shadows"
date: 2026-10-27 09:03:00+0900
description: "Lambert, Phong and Blinn-Phong, flat/Gouraud/Phong shading, UVs and tangent space, mipmaps and anisotropic filtering, and shadow mapping with bias and PCF, with NumPy and GLSL code."
categories: graphics
tags: [shading, blinn-phong, normal-mapping, texture-filtering, mipmap, shadow-mapping, glsl]
series: graphics
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## Why this matters

In the [previous post]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }}) we turned triangles into pixels: for every covered pixel the rasterizer hands us perspective-correct interpolated attributes (position, normal, UV). This post answers the next question: **what color should that pixel be?** We build the classic local illumination models (Lambert, Phong, Blinn-Phong), learn how textures feed them spatially varying inputs (albedo, normals), how to sample textures without aliasing (mipmaps, trilinear and anisotropic filtering), and how to add the first non-local effect, shadows, with shadow mapping. These "empirical" models are exactly what physically based rendering (PBR, [next post]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})) replaces with physics, and every concept here (tangent frames, mip levels, depth comparisons, G-buffers) survives into PBR, ray tracing and even neural rendering.

## Prerequisites

- Dot and cross products, and why normals transform with the inverse-transpose ([post 01]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})).
- The MVP pipeline, barycentric coordinates, perspective-correct interpolation and the vertex/fragment shader split ([post 02]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})).
- NumPy; a little GLSL helps but every shader below is commented.

## 1. The shading vectors

Local shading looks at a single surface point $\mathbf{p}$ and a handful of **unit** vectors, all expressed in the same space (world space or view space; mixing spaces is the most common shading bug):

| Symbol | Meaning |
| --- | --- |
| $\mathbf{n}$ | surface normal at $\mathbf{p}$ |
| $\mathbf{l}$ | direction from $\mathbf{p}$ **toward** the light |
| $\mathbf{v}$ | direction from $\mathbf{p}$ **toward** the eye |
| $\mathbf{r}$ | mirror reflection of $\mathbf{l}$ about $\mathbf{n}$ |
| $\mathbf{h}$ | half vector between $\mathbf{l}$ and $\mathbf{v}$ |

All of them point *away* from the surface. For a directional light $\mathbf{l}$ is constant; for a point light at $\mathbf{x}_L$ it is $\mathbf{l} = (\mathbf{x}_L - \mathbf{p})/\lVert\mathbf{x}_L - \mathbf{p}\rVert$ and the received intensity falls off as $1/d^2$ with the distance $d$.

## 2. Local illumination models

### 2.1 Lambert: diffuse reflection

A perfectly matte (diffuse) surface scatters incoming light equally in all directions, so its brightness does not depend on $\mathbf{v}$. What it does depend on is how much light it *receives*: a beam of cross-section $A$ hitting the surface at angle $\theta$ to the normal spreads over an area $A/\cos\theta$, so the energy per unit area is proportional to $\cos\theta = \mathbf{n}\cdot\mathbf{l}$ (Lambert's cosine law). Clamping removes light from behind:

$$
L_\text{diffuse} = k_d \, I_L \, \max(0,\ \mathbf{n}\cdot\mathbf{l})
$$

where $k_d$ is the diffuse color (albedo) and $I_L$ the light intensity. In PBR we will see that the physically correct diffuse BRDF is $k_d/\pi$, and the $\pi$ is absorbed into the light units here.

### 2.2 Phong: a specular lobe around the mirror direction

Shiny surfaces add a highlight that moves with the viewer. Phong (1975) modelled it as a lobe around the mirror direction

$$
\mathbf{r} = 2(\mathbf{n}\cdot\mathbf{l})\,\mathbf{n} - \mathbf{l},
$$

which you get by decomposing $\mathbf{l}$ into a component along $\mathbf{n}$, $(\mathbf{n}\cdot\mathbf{l})\mathbf{n}$, and a tangential remainder, then flipping the remainder. The full Phong reflection model is

$$
L = k_a I_a + k_d I_L \max(0,\ \mathbf{n}\cdot\mathbf{l}) + k_s I_L \max(0,\ \mathbf{r}\cdot\mathbf{v})^{s},
$$

with ambient term $k_a I_a$ (a crude constant stand-in for all indirect light), specular color $k_s$ and **shininess** $s$: larger $s$ means a tighter, smaller highlight.

### 2.3 Blinn-Phong: the half vector

Blinn (1977) replaced $\mathbf{r}\cdot\mathbf{v}$ with $\mathbf{n}\cdot\mathbf{h}$, where

$$
\mathbf{h} = \frac{\mathbf{l} + \mathbf{v}}{\lVert\mathbf{l} + \mathbf{v}\rVert}, \qquad
L_\text{spec} = k_s I_L \max(0,\ \mathbf{n}\cdot\mathbf{h})^{s'} .
$$

Intuition: $\mathbf{h}$ is the orientation a tiny mirror would need to reflect $\mathbf{l}$ exactly into $\mathbf{v}$; $\mathbf{n}\cdot\mathbf{h}$ measures how close the actual normal is to that ideal mirror orientation. This is precisely the idea behind **microfacet** theory in the next post, where $\mathbf{h}$ becomes the microfacet normal and $(\mathbf{n}\cdot\mathbf{h})^{s'}$ becomes a normal distribution function.

Why prefer Blinn-Phong?

1. **Cheaper** for a directional light and a distant viewer: $\mathbf{h}$ is then constant over the whole object.
2. **Better behaved**: $\mathbf{r}\cdot\mathbf{v}$ becomes negative when the angle between $\mathbf{r}$ and $\mathbf{v}$ exceeds $90^\circ$, which clips the highlight abruptly for rough (small $s$) surfaces at grazing angles; $\mathbf{n}\cdot\mathbf{h}$ stays positive whenever both $\mathbf{l}$ and $\mathbf{v}$ are above the surface.
3. **Closer to measured data**: highlights stretch at grazing angles as on real surfaces.

The two exponents are not the same. When $\mathbf{v}$ lies in the plane of $\mathbf{n}$ and $\mathbf{l}$, the angle between $\mathbf{n}$ and $\mathbf{h}$ is exactly half the angle $\alpha$ between $\mathbf{r}$ and $\mathbf{v}$. Using $\ln\cos x \approx -x^2/2$,

$$
(\cos\tfrac{\alpha}{2})^{s'} \approx e^{-s'\alpha^2/8}, \qquad (\cos\alpha)^{s} \approx e^{-s\alpha^2/2}
\quad\Rightarrow\quad s' \approx 4s .
$$

A last remark for later: the raw model is not energy conserving (a larger $s$ makes the highlight smaller *and* dimmer in total). A common fix in real-time rendering multiplies the specular term by $(s'+8)/(8\pi)$, an approximate normalization; PBR does this properly.

The NumPy code below evaluates Lambert + Phong / Blinn-Phong on a sphere and writes PPM images (open them with any image viewer). With $s' = 4s$ the two images are nearly identical, confirming the derivation (mean brightness 0.418 vs 0.416).

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

## 3. Shading frequency: flat, Gouraud and Phong shading

A lighting *model* says how to compute a color from $(\mathbf{n},\mathbf{l},\mathbf{v})$; a shading *frequency* says **where** we evaluate it. Do not confuse the Phong reflection model with Phong shading (interpolation); they come from the same paper but are independent choices.

| Method | Evaluated | Normal used | Pros | Cons |
| --- | --- | --- | --- | --- |
| Flat | once per triangle | face normal | cheap, faceted look on purpose | faceting on curved surfaces |
| Gouraud (1971) | per vertex, colors interpolated | vertex normals | cheap, smooth | highlights inside a triangle are missed or smeared; Mach bands |
| Phong shading (1975) | per pixel | interpolated vertex normal, **renormalized** | correct highlights | more fragment work (negligible today) |

On modern GPUs per-pixel shading is the default: the vertex shader outputs the normal, the rasterizer interpolates it (perspective-correctly), and the fragment shader renormalizes it, because a linear blend of unit vectors is shorter than unit length.

**Vertex normals** for a mesh that has none are usually computed by averaging the normals of the adjacent faces. Weighting by triangle area is free: the cross product of two edges has length twice the area.

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

The second function computes tangents, which we will need in Section 6. If you want flat shading in a shader without per-face data, the screen-space derivatives of the interpolated position span the triangle's plane:

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

## 4. Textures and UV mapping

Real surfaces vary from point to point. Instead of storing $k_d$ per vertex we store it in an image, a **texture**, and give every vertex a **texture coordinate** $(u,v)\in[0,1]^2$. Catmull introduced texture mapping in his 1974 thesis; today textures hold albedo, normals, roughness, metalness, ambient occlusion, displacement and more.

- **UV mapping (parameterization)** is the map from the 3D surface to the 2D texture square. Closed surfaces must be **cut along seams** to be flattened; artists or tools (xatlas, Blender's unwrapper) minimize stretch and distortion. At a seam a vertex is duplicated with two different UVs.
- UVs are interpolated across the triangle like any attribute, and they **must** be interpolated perspective-correctly ([post 02]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})); affine interpolation makes textures swim and bend on large triangles.
- **Wrap modes** decide what happens outside $[0,1]$: repeat (tiling), clamp-to-edge, mirrored repeat.
- **Texel centers**: texel $i$ of a texture of width $W$ covers $[i, i+1)/W$ and its center is at $(i + 0.5)/W$. Mapping $u$ to continuous texel space is $x = uW - 0.5$; forgetting the $0.5$ shifts every texture by half a texel.
- **Color space**: albedo textures are usually stored in sRGB and must be decoded to linear before lighting (GPUs do this for `SRGB8_ALPHA8` formats); normal, roughness and other data textures are linear.

## 5. Texture filtering

A pixel rarely maps to exactly one texel. Two cases:

- **Magnification**: one texel covers many pixels (a close-up). We need *interpolation*.
- **Minification**: one pixel covers many texels (a distant floor). We need *averaging* over the pixel's footprint, otherwise we get aliasing: moiré and shimmering, the same sampling problem as jagged edges in post 02.

### 5.1 Nearest and bilinear

Nearest-neighbour picks the texel containing the sample and looks blocky. **Bilinear** filtering blends the four nearest texel centers. With $x = uW - 0.5$, $y = vH - 0.5$, $x_0 = \lfloor x\rfloor$, $f_x = x - x_0$ (similarly $y_0$, $f_y$):

$$
T(u,v) = (1-f_y)\big[(1-f_x)\,T_{x_0,y_0} + f_x\,T_{x_0+1,y_0}\big] + f_y\big[(1-f_x)\,T_{x_0,y_0+1} + f_x\,T_{x_0+1,y_0+1}\big].
$$

### 5.2 Mipmaps

Averaging hundreds of texels per pixel at run time is too slow. Williams (1983) proposed precomputing a **mipmap** (from Latin *multum in parvo*, "much in little"): a pyramid where level $k+1$ is level $k$ downsampled by 2 in each direction. The extra memory is

$$
\frac14 + \frac1{16} + \frac1{64} + \dots = \frac13,
$$

i.e. a mipmapped texture costs $4/3$ of the original. To choose a level we estimate how many texels one pixel step covers. The GPU shades pixels in $2\times2$ **quads**, so it can take finite differences of $(u,v)$ between neighbours (exposed in GLSL as `dFdx`, `dFdy`). With $u, v$ scaled to texel units,

$$
\rho = \max\!\left(\sqrt{\left(\tfrac{\partial u}{\partial x}\right)^2 + \left(\tfrac{\partial v}{\partial x}\right)^2},\ \sqrt{\left(\tfrac{\partial u}{\partial y}\right)^2 + \left(\tfrac{\partial v}{\partial y}\right)^2}\right),
\qquad \lambda = \log_2 \rho .
$$

At level $\lambda$ one texel is about one pixel wide, so a single bilinear lookup is roughly the footprint average. $\lambda < 0$ means magnification (use level 0).

### 5.3 Trilinear filtering

Picking the nearest integer level causes visible seams where $\lambda$ crosses an integer. **Trilinear** filtering does a bilinear lookup in levels $\lfloor\lambda\rfloor$ and $\lfloor\lambda\rfloor + 1$ and blends them linearly with weight $\lambda - \lfloor\lambda\rfloor$: 8 texels per sample. The code builds a mip pyramid and compares sampling a fine checkerboard without and with mipmaps. Without mipmaps the result is a random-looking pattern of 0s and 1s (standard deviation 0.48): that is aliasing. Trilinear filtering returns the correct average grey 0.5.

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

### 5.4 Anisotropic filtering

The mipmap assumes the pixel footprint in texture space is a square. On a floor seen at a grazing angle it is a long thin ellipse: $\rho$ along one screen axis is much larger than along the other. Isotropic mipmapping must use the larger one, so the texture becomes blurry in the other direction. **Anisotropic filtering** takes several probes along the major axis of the footprint at a finer level. A common formulation (the one in the OpenGL anisotropic filtering extension) is

$$
N = \min\!\left(\left\lceil \frac{\rho_{\max}}{\rho_{\min}} \right\rceil,\ N_{\max}\right), \qquad \lambda = \log_2\frac{\rho_{\max}}{N},
$$

then $N$ trilinear samples are averaged along the major axis; $N_{\max}$ is the user setting "16x" in a game's options menu. Summed-area tables (Crow 1984) and EWA filtering (Greene and Heckbert 1986) are higher-quality alternatives; the elliptical weighted average idea will reappear when we splat 3D Gaussians.

In OpenGL these choices are sampler states:

```c
glBindTexture(GL_TEXTURE_2D, tex);
glGenerateMipmap(GL_TEXTURE_2D);                                   // build the pyramid
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR); // trilinear
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);               // bilinear
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
glTexParameterf(GL_TEXTURE_2D, GL_TEXTURE_MAX_ANISOTROPY, 16.0f);  // core in GL 4.6 (EXT before)
```

## 6. Normal mapping and tangent space

### 6.1 From bump mapping to normal maps

Geometry is expensive; small details (scratches, pores, bricks) mostly matter through how they change **shading**, which depends on the normal. Blinn (1978) proposed **bump mapping**: keep the coarse surface but perturb its normal as if it were displaced by a height field $h(u,v)$. For a locally flat surface with orthonormal tangent $\mathbf{T}$, bitangent $\mathbf{B}$ and normal $\mathbf{N}$, the displaced surface $\mathbf{p} + h\,\mathbf{N}$ has, to first order,

$$
\mathbf{n}' \propto \mathbf{N} - \frac{\partial h}{\partial u}\,\mathbf{T} - \frac{\partial h}{\partial v}\,\mathbf{B}.
$$

A **normal map** simply precomputes $\mathbf{n}'$ for every texel and stores it in an RGB texture, typically baked from a high-polygon sculpt onto a low-polygon mesh. Components in $[-1,1]$ are encoded as colors $c = (\mathbf{n}+1)/2$; flat areas are $(0.5, 0.5, 1)$, which is why tangent-space normal maps look light blue.

### 6.2 Tangent space

The stored normals are expressed in **tangent space**, the local frame $(\mathbf{T}, \mathbf{B}, \mathbf{N})$ where $\mathbf{T}$ points along increasing $u$ and $\mathbf{B}$ along increasing $v$ on the surface. This makes the map independent of the mesh's pose and deformation, and lets one map tile or be reused across meshes. In the shader, the matrix $\text{TBN} = [\mathbf{T}\ \mathbf{B}\ \mathbf{N}]$ (columns) takes a tangent-space vector to world space:

$$
\mathbf{n}_\text{world} = \operatorname{normalize}\big(\text{TBN}\,(2\mathbf{c} - 1)\big).
$$

**Deriving $\mathbf{T}$ and $\mathbf{B}$.** For a triangle with positions $\mathbf{p}_0,\mathbf{p}_1,\mathbf{p}_2$ and UVs $(u_i, v_i)$, let $\mathbf{E}_1 = \mathbf{p}_1 - \mathbf{p}_0$, $\mathbf{E}_2 = \mathbf{p}_2 - \mathbf{p}_0$, $\Delta u_1 = u_1 - u_0$ and so on. Because $\mathbf{T} = \partial\mathbf{p}/\partial u$ and $\mathbf{B} = \partial\mathbf{p}/\partial v$ are constant over a flat triangle,

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

Per-triangle results are accumulated at vertices (like normals), then $\mathbf{T}$ is made orthogonal to $\mathbf{N}$ by Gram-Schmidt, $\mathbf{T} \leftarrow \operatorname{normalize}(\mathbf{T} - (\mathbf{N}\cdot\mathbf{T})\mathbf{N})$, and only a **handedness** sign $w = \operatorname{sign}((\mathbf{N}\times\mathbf{T})\cdot\mathbf{B})$ is stored, with $\mathbf{B} = w\,(\mathbf{N}\times\mathbf{T})$ rebuilt in the shader. $w = -1$ where the UVs are mirrored (artists mirror UVs to save texture space). `vertex_tangents` in Section 3 implements exactly this and checks both cases.

Practical pitfalls:

- **The baker and the renderer must agree on the tangent basis**, otherwise lighting shows seams. The de-facto standard is MikkTSpace (Mikkelsen 2008), used by Blender, Unity, Unreal and glTF.
- **Green channel convention**: OpenGL-style maps use $+Y$ up, DirectX-style maps $-Y$. If bumps look inverted, flip the green channel.
- **Transforming the frame**: $\mathbf{T}$ and $\mathbf{B}$ are surface *directions* and transform with the model matrix; $\mathbf{N}$ transforms with the inverse-transpose (post 01). Under non-uniform scaling these differ, which is why the vertex shader below re-orthogonalizes.

## 7. Shadow mapping

Everything so far is **local**: a point's color depends only on itself and the light. Shadows depend on whether *other* geometry blocks the light. Williams (1978) observed that "is $\mathbf{p}$ visible from the light?" is a visibility question, which the z-buffer already answers, just from a different camera.

### 7.1 The two-pass algorithm

1. **Shadow pass**: render the scene from the light (orthographic for a directional light, perspective for a spot light) with only a depth buffer. The result $D(s,t)$ is the **shadow map**: the depth of the closest surface along each light ray.
2. **Main pass**: for each shaded point, transform it with the same light matrices, divide by the homogeneous coordinate $w$, and map NDC to $[0,1]$. The point is lit if its light-space depth $z$ passes the test against the stored depth:

$$
\mathbf{q} = P_L V_L\,\mathbf{p}_{\text{world}}, \qquad
(s, t, z) = \tfrac12\,\frac{(q_x, q_y, q_z)}{q_w} + \tfrac12, \qquad
z - b \le D(s, t),
$$

where $b$ is a small **bias**. Point lights use a cube map (six shadow maps).

### 7.2 Shadow acne and bias

Without bias, lit surfaces are covered with stripes of false shadow, **shadow acne**. The shadow map stores depth only at texel *centers*. A texel covers a footprint of width $w$ on the receiver; if the receiver is tilted by angle $\theta$ to the light ($\cos\theta = \mathbf{n}\cdot\mathbf{l}$), its depth varies by $w\tan\theta$ across that footprint, so about half of the points behind the texel center fail the test against their own surface. Depth quantization adds a bit more error. Hence the standard bias

$$
b = b_0 + b_s \tan\theta, \qquad \tan\theta = \frac{\sqrt{1 - (\mathbf{n}\cdot\mathbf{l})^2}}{\mathbf{n}\cdot\mathbf{l}},
$$

a constant part plus a **slope-scaled** part (GPUs support it directly via `glPolygonOffset(factor, units)` in the shadow pass). Too much bias causes the opposite artifact, **Peter Panning**: shadows detach from their casters because contact regions are now considered lit. Other remedies are **normal offset** (move the lookup point along $\mathbf{n}$ by a fraction of a texel), rendering back faces into the shadow map, and tight light frusta to increase depth precision.

### 7.3 Percentage-closer filtering (PCF)

Shadow-map texels are often larger than screen pixels, so shadow edges are jagged. You cannot simply bilinearly filter the depth map: averaging the depths of a caster and a receiver gives a depth of nothing in particular, and the comparison remains binary. Reeves, Salesin and Cook (1987) noticed that the order must be swapped: **compare first, then filter** the binary results.

$$
V(\mathbf{p}) = \frac{1}{\lvert K\rvert} \sum_{\boldsymbol{\delta} \in K} \big[\, z - b \le D\big((s,t) + \boldsymbol{\delta}\big) \big],
$$

where $K$ is a kernel of offsets (e.g. $3\times3$ texels) and $[\cdot]$ is 1 if true and 0 otherwise. $V \in [0,1]$ is the fraction of the neighbourhood that is lit, giving antialiased, soft-looking edges. Hardware supports it: with `GL_TEXTURE_COMPARE_MODE = GL_COMPARE_REF_TO_TEXTURE` and a `sampler2DShadow`, a single `texture()` call does four comparisons and returns their bilinearly weighted average.

The toy below renders a shadow map of a sphere over a tilted ground plane (slope 0.4) and measures the artifacts exactly. With nearest lookup and no bias, **exactly 50%** of the lit ground is in false shadow, for the reason given above. A constant bias of 0.002 is smaller than the worst-case error $\tfrac{w}{2}\tan\theta = 0.0156 \cdot 0.4 = 0.00625$ and only partly helps; the slope-scaled bias $w\tan\theta$ removes acne completely; a huge constant bias of 0.5 removes acne but "loses" 10.9% of the true shadow near the contact region (Peter Panning; the 2-4% in the other rows is mostly the aliased rim of the shadow, the problem PCF addresses). Finally, a $3\times3$ PCF kernel reaches one texel further, so with the same bias acne reappears; **the bias must grow with the kernel radius**.

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

Output:

```text
no bias       bias=0.0000  acne  50.0%  lost shadow   2.0%
const 0.002   bias=0.0020  acne  37.5%  lost shadow   2.4%
slope-scaled  bias=0.0125  acne   0.0%  lost shadow   3.9%
const 0.5     bias=0.5000  acne   0.0%  lost shadow  10.9%
PCF 3x3 bias=0.0125  acne  49.1%  penumbra pixels 48.41%
PCF 3x3 bias=0.0250  acne   0.0%  penumbra pixels  3.91%
```

Beyond basic shadow maps you will meet cascaded shadow maps (several maps for different depth ranges of a large outdoor scene), variance shadow maps (Donnelly and Lauritzen 2006, which store depth moments so the map *can* be filtered), and PCSS (Fernando 2005), which estimates the blocker distance to vary the PCF kernel size and produce contact-hardening soft shadows. Physically, soft shadows come from area lights, which path tracing handles naturally ([post 05]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})).

## 8. Putting it together in GLSL

The vertex shader transforms positions, builds the TBN frame and computes the position in light clip space; the fragment shader samples albedo and the normal map, evaluates Blinn-Phong and multiplies the direct light by the PCF visibility. The shadow pass itself is a trivial depth-only shader that outputs `gl_Position = uLightViewProj * uModel * vec4(aPos, 1.0)`.

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

Three details worth noticing: lighting is done in **linear** color (the albedo is decoded from sRGB by the sampler and the framebuffer re-encodes it), the specular term is zeroed when $\mathbf{n}\cdot\mathbf{l} \le 0$ to avoid highlights on surfaces facing away from the light, and the bias is clamped so it does not explode at grazing angles where $\tan\theta \to \infty$.

## Try it

The path tracer on the [home page lab]({{ '/' | relative_url }}#lab) has **Albedo** and **Normals** view modes. Those images are a **G-buffer**: exactly the per-pixel inputs (texture color and shading normal) that a deferred renderer stores in its first pass and then lights with the models from this post, and that the denoiser uses as edge-stopping guides. Compare them with the **Final** view: everything that is not explained by albedo times $\mathbf{n}\cdot\mathbf{l}$ (soft shadows, color bleeding, glossy reflections) is what the remaining posts of this series are about.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Gouraud, *Continuous Shading of Curved Surfaces* | IEEE Trans. Computers | 1971 | [DOI](https://doi.org/10.1109/T-C.1971.223313) | Smooth shading by interpolating vertex colors |
| Catmull, *A Subdivision Algorithm for Computer Display of Curved Surfaces* (PhD thesis, Univ. of Utah) | Thesis | 1974 | | Introduced texture mapping and the z-buffer |
| Phong, *Illumination for Computer Generated Pictures* | Communications of the ACM | 1975 | [DOI](https://doi.org/10.1145/360825.360839) | Ambient + diffuse + specular model; per-pixel normal interpolation |
| Blinn, *Models of Light Reflection for Computer Synthesized Pictures* | SIGGRAPH | 1977 | [PDF (Microsoft Research)](https://www.microsoft.com/en-us/research/wp-content/uploads/1977/01/p192-blinn.pdf) | Half-vector specular; brought the Torrance-Sparrow microfacet model into graphics |
| Blinn, *Simulation of Wrinkled Surfaces* | SIGGRAPH | 1978 | [SIGGRAPH history](https://history.siggraph.org/?p=103267) | Bump mapping: perturb normals instead of geometry |
| Williams, *Casting Curved Shadows on Curved Surfaces* | SIGGRAPH | 1978 | [SIGGRAPH history](https://history.siggraph.org/?p=120268) | The shadow-mapping algorithm |
| Williams, *Pyramidal Parametrics* | SIGGRAPH | 1983 | | Mipmaps and trilinear filtering |
| Reeves, Salesin, Cook, *Rendering Antialiased Shadows with Depth Maps* | SIGGRAPH | 1987 | [Pixar Graphics](https://graphics.pixar.com/library/ShadowMaps) | Percentage-closer filtering |
| Donnelly, Lauritzen, *Variance Shadow Maps* | I3D | 2006 | | Filterable shadow maps from depth moments |
| Mikkelsen, *Simulation of Wrinkled Surfaces Revisited* (MSc thesis, Univ. of Copenhagen) | Thesis | 2008 | | Basis of the MikkTSpace tangent standard |

## Learning resources

- **GAMES101** (Lingqi Yan), lectures 7-9 on shading, texture mapping and filtering: [course page](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html). **GAMES202** covers real-time shadows (PCF, PCSS, VSM) in depth.
- **LearnOpenGL**, chapters *Lighting*, *Advanced Lighting → Normal Mapping* and *Shadow Mapping*: [learnopengl.com](https://learnopengl.com/), the most practical companion to this post.
- **Berkeley CS184** and **Stanford CS148** cover texture filtering and shading with programming assignments.
- **Scratchapixel**: [scratchapixel.com](https://www.scratchapixel.com/), lessons on shading and texturing written from first principles.
- **Real-Time Rendering**, 4th ed. (Akenine-Möller et al.), chapters 5 (shading basics), 6 (texturing) and 7 (shadows): [realtimerendering.com](https://www.realtimerendering.com/).

## Exercises

1. Show that for $\mathbf{v}$ in the plane of $\mathbf{n}$ and $\mathbf{l}$, the angle between $\mathbf{n}$ and $\mathbf{h}$ is half the angle between $\mathbf{r}$ and $\mathbf{v}$. Then render Phong with $s=16$ and Blinn-Phong with $s'=16, 64$ and compare the highlights at a grazing light direction such as $\mathbf{l} = (1, 0, 0.1)$.
2. Extend the sphere renderer with Gouraud shading: evaluate the model at the vertices of a coarse UV-sphere mesh and interpolate colors with barycentrics. Where does the highlight go wrong?
3. Using the texture-filtering code from Section 5, implement anisotropic filtering for the footprint with $\partial u/\partial x = 8/64$ and $\partial v/\partial y = 1/64$, and compare its sharpness along $v$ with plain trilinear filtering.
4. Generate a normal map from a height field $h(u,v) = 0.05\sin(20u)$ using the bump-mapping formula, then shade a flat quad with it using the TBN from `vertex_tangents`.
5. Replace the $3\times3$ box PCF in the shadow toy with a Poisson-disk kernel and implement receiver-plane depth bias (estimate how depth varies across the kernel from the screen-space derivatives) so the bias no longer has to grow with the kernel.

**Next:** [Physically based rendering]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}), where radiometry turns these heuristics into the rendering equation and $\mathbf{n}\cdot\mathbf{h}$ becomes the GGX microfacet distribution.
