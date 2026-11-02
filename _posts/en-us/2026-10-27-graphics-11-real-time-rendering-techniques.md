---
layout: post
title: "Real-time rendering techniques: G-buffers, soft shadows, AO, reflections, real-time GI and tone mapping"
date: 2026-10-27 09:11:00+0900
description: "The algorithms behind a 16 ms frame: deferred shading and octahedral normals, clustered light culling, cascaded and soft shadows (PCSS, VSM, EVSM), SSAO/HBAO/GTAO with the horizon integral, Hi-Z screen-space reflections, light maps, SH irradiance probes, DDGI and voxel cone tracing, temporal rectification, HDR tone mapping and the sRGB curve, and how to think about GPU performance."
categories: graphics
tags: [real-time, deferred-shading, shadows, ambient-occlusion, global-illumination, tone-mapping]
series: graphics
series_order: 11
toc:
  sidebar: left
related_posts: false
---

## Why this matters

A game at 60 fps has **16.7 ms** per frame, and at 120 fps only 8.3 ms. That budget must cover geometry, shadows, lighting, reflections, indirect light, transparency, post-processing and the UI. [Post 03]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }}) built a forward renderer with basic shadow mapping and PCF. [Post 06]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}) added hardware ray tracing, denoising, ReSTIR, TAA and learned upscaling. This chapter fills the gap between them: the classic *rasterization-era* techniques that every modern engine still runs, often alongside ray tracing. We focus on the **algorithms and their mathematics**. How engines organize them into render graphs and GPU-driven pipelines is the topic of [graphics-engine 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}). How Unreal Engine 5's Nanite, Lumen and virtual shadow maps package them is covered in [graphics-engine 04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}).

## Prerequisites

- The rasterization pipeline, depth buffers and shadow mapping with bias and PCF ([post 02]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }}), [post 03]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})).
- Radiance, irradiance, the rendering equation and the metallic-roughness BRDF ([post 04]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})).
- Temporal accumulation, reprojection and TAA basics ([post 06]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})).
- For Section 5.4, the alpha compositing of [post 10]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }}).

## 1. Anatomy of a deferred frame

### 1.1 Forward versus deferred

A **forward** renderer shades each triangle's fragments as they are rasterized: for every fragment it loops over the lights. The cost is roughly (fragments shaded, including overdraw) × (lights). A **deferred** renderer (Saito and Takahashi's 1990 "G-buffer" idea) splits the frame in two:

1. **Geometry pass**: rasterize all opaque geometry once and write the *inputs* to shading into several render targets, the **G-buffer**: albedo, normal, roughness, metalness, depth and so on. No lighting happens yet.
2. **Lighting pass**: for each pixel, read the G-buffer and accumulate the contribution of each light, with the BRDF of post 04.

Shading now costs (pixels) × (lights per pixel), independent of overdraw, and materials and lights are decoupled. The price is memory bandwidth and some flexibility:

| | Forward | Deferred |
| --- | --- | --- |
| Overdraw cost | shading repeated per layer (a depth pre-pass helps) | only the G-buffer write is repeated |
| Many lights | expensive without culling | natural, and cheap with tiled/clustered culling |
| Transparency | natural | needs a separate forward pass |
| MSAA | cheap | expensive (G-buffer per sample); engines use TAA instead |
| Material variety | any shader | limited to what the G-buffer stores |
| Bandwidth | low | high: several full-screen targets written and read |

{% include blog_figure.liquid path="assets/img/blog/graphics/11-gbuffer.svg" caption="A real G-buffer from the figure script: three spheres on a checkered plane, ray-cast in NumPy. (a) Albedo, (b) world normal as colour, (c) linear view depth, (d) the normal packed into two channels with octahedral encoding, (e) roughness in red and metalness in green (the gold sphere is metallic), (f) the deferred lighting pass: three point lights shaded per pixel with the GGX BRDF of post 04, reading only (a)-(e)." %}

**A typical layout.** Engines pack the G-buffer tightly. One common arrangement uses four 32-bit targets plus depth: RGBA8 for albedo and AO, RGB10A2 or RG16 for the normal, RGBA8 for roughness, metalness and material ID, and RG16F for motion vectors. **Worked example**: at 1920 × 1080 that is $2.07\text{M px} \times 16\ \text{B} = 33\ \text{MB}$ written in the geometry pass and read back in the lighting pass, which is about 4 GB/s at 60 fps before any lighting work. This is why G-buffer size is fought over bit by bit.

### 1.2 Octahedral normal encoding

A unit normal has two degrees of freedom, so storing three floats wastes space. **Octahedral encoding** (surveyed by Cigolle et al. 2014) projects the sphere onto the octahedron $\vert x\vert + \vert y\vert + \vert z\vert = 1$ and then unfolds the lower half ($z<0$) outward into the corners of a square:

$$
(u, v) = \begin{cases} (x', y') & z' \ge 0\\ \big((1-\vert y'\vert)\,\mathrm{sgn}\,x',\ (1-\vert x'\vert)\,\mathrm{sgn}\,y'\big) & z' < 0 \end{cases},
\qquad (x',y',z') = \frac{\mathbf{n}}{\vert x\vert+\vert y\vert+\vert z\vert}.
$$

The map is continuous, fills the square $[-1,1]^2$ almost uniformly, and decodes with a few instructions:

```python
import numpy as np

def sgn(x):
    return np.where(x >= 0, 1.0, -1.0)

def oct_encode(n):
    n = n / np.abs(n).sum(-1, keepdims=True)
    x, y, z = n[..., 0], n[..., 1], n[..., 2]
    u = np.where(z < 0, (1 - np.abs(y)) * sgn(x), x)
    v = np.where(z < 0, (1 - np.abs(x)) * sgn(y), y)
    return np.stack([u, v], -1)

def oct_decode(e):
    x, y = e[..., 0], e[..., 1]
    z = 1 - np.abs(x) - np.abs(y)
    t = np.clip(-z, 0, None)                  # fold the corners back to z < 0
    n = np.stack([x - t * sgn(x), y - t * sgn(y), z], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)

n = np.array([0.3, -0.5, -0.81]); n /= np.linalg.norm(n)
e = oct_encode(n)
q = np.round(e * 32767) / 32767               # store as two 16-bit snorm values
err = np.degrees(np.arccos(np.clip(oct_decode(q) @ n, -1, 1)))
print(e, err)                                 # error well below 0.01 degrees
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-octahedral.svg" caption="(a) The octahedral map: each point of the square decodes to a unit normal (shown as colour). The inner diamond holds the upper hemisphere z > 0; the four corners are the folded lower hemisphere. (b) Maximum angular error over 200,000 random normals after quantization, versus the total number of bits: octahedral (u, v) beats spherical angles at equal bits, and three quantized xyz channels need 50% more bits for a comparable error." %}

### 1.3 Tiled and clustered light culling

Looping over *all* lights per pixel does not scale to hundreds of lights. Each point or spot light has a finite range: a sphere of radius $r_\ell$ beyond which its contribution is negligible. **Tiled shading** splits the screen into tiles (e.g. 16 × 16 pixels), builds for each tile a list of the lights whose spheres overlap the tile's sub-frustum (bounded by the tile's min/max depth), and loops only over that list. **Clustered shading** (Olsson, Billeter and Assarsson 2012) also subdivides in depth, which avoids the "depth discontinuity" problem where a tile spanning foreground and background collects lights from both. Slices are exponential so that clusters stay roughly cube-shaped in perspective:

$$
z_k = z_n \left(\frac{z_f}{z_n}\right)^{k/S},
\qquad
k(z) = \left\lfloor S\,\frac{\ln(z/z_n)}{\ln(z_f/z_n)} \right\rfloor .
$$

**Worked example**: $z_n = 0.1$, $z_f = 1000$, $S = 24$ slices. A pixel at depth $z = 10$ falls into slice $\lfloor 24 \cdot \ln 100/\ln 10^4\rfloor = \lfloor 24 \cdot 0.5\rfloor = 12$. The cluster lookup for a pixel is two divisions and a logarithm. The light lists are built once per frame on the GPU by testing each light's sphere against each cluster's bounding box.

{% include blog_figure.liquid path="assets/img/blog/graphics/11-clusters.svg" caption="Clustered light assignment, computed. (a) A view frustum cut into 16 × 9 tiles and 16 exponentially spaced depth slices (gray outlines, near part shown) with 30 point lights (yellow spheres); every dot is a cluster touched by at least one light, coloured by its light count. (b) Top view: each cell is coloured by the largest light count over its column of tiles; red circles are the lights' ranges. Most clusters see only a few lights, which is what makes per-pixel loops cheap." %}

How the cluster grid is built and consumed in a render graph, and how forward+ and visibility-buffer renderers use the same lists, is covered in [graphics-engine 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}).

## 2. Shadows beyond the basics

Post 03 covered one shadow map, bias and PCF. Three problems remain: **resolution** over large view distances, **soft penumbrae** that widen with distance from the occluder, and **filtering** without acne.

### 2.1 Cascaded shadow maps and split schemes

A single shadow map for a directional light (the sun) covering 200 m of view distance has the same texel size near the camera, where a pixel covers millimetres, as far away, where it covers metres. **Perspective aliasing** is the result: blocky shadows up close. **Cascaded shadow maps** (CSM; parallel-split shadow maps, Zhang et al. 2006) cut the view frustum into $N$ depth ranges $[z_i, z_{i+1}]$ and give each its own shadow map fitted tightly around that slice.

Where to put the splits? Look at the ratio between a shadow texel's footprint and a screen pixel's footprint. A cascade covering $[z_i, z_{i+1}]$ is as wide as the frustum at $z_{i+1}$, so its texel size is proportional to $z_{i+1}$, while a pixel's footprint at depth $z$ is proportional to $z$. With equal resolutions the ratio is about $z_{i+1}/z$, worst at the near end of each cascade. Making the worst case equal for all cascades gives **logarithmic** splits, with ratio $(z_f/z_n)^{1/N}$ everywhere. **Uniform** splits waste resolution far away and starve the near cascade. The **practical split scheme** blends the two with a parameter $\lambda$:

$$
z_i^{\log} = z_n\Big(\frac{z_f}{z_n}\Big)^{i/N},\qquad
z_i^{\text{uni}} = z_n + (z_f - z_n)\frac{i}{N},\qquad
z_i = \lambda\, z_i^{\log} + (1-\lambda)\, z_i^{\text{uni}} .
$$

Pure log splits make the first cascade tiny, so near-camera detail is excellent but cascades switch often. **Worked example**: $z_n = 0.1$, $z_f = 200$, $N = 4$. Log splits are $0.669, 4.47, 29.9$; uniform splits are $50.1, 100, 150$; with $\lambda = 0.9$ we get $5.61, 14.0, 41.9$.

```python
import numpy as np

def csm_splits(n, f, N, lam):
    i = np.arange(N + 1) / N
    return lam * n * (f / n) ** i + (1 - lam) * (n + (f - n) * i)

for lam in [0.0, 0.5, 0.9, 1.0]:
    print(lam, np.round(csm_splits(0.1, 200.0, 4, lam), 3))
# 0.9 -> [  0.1    5.61   14.03   41.92  200.  ]
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-csm-splits.svg" caption="Cascade splits for n = 0.1, f = 200, four cascades. (a) The four depth ranges for λ from 0 (uniform) to 1 (logarithmic) on a log axis, with split depths labelled. (b) The approximate texel-to-pixel footprint ratio z_{i+1}/z across the view depth: uniform splits leave the nearest metres hundreds of times under-resolved, logarithmic splits keep the ratio at (f/n)^{1/4} ≈ 6.7 everywhere, and λ = 0.9 is a compromise." %}

Production details: **stabilization**, which snaps each cascade's projection to whole texels and keeps its size constant so that shadows do not shimmer as the camera moves; **blending** across cascade borders; and **sample distribution shadow maps** (Lauritzen, Salvi and Lefohn 2011), which read the depth buffer to fit the cascades to the depth range actually visible.

### 2.2 PCF and percentage-closer soft shadows

PCF (Reeves, Salesin and Cook 1987; post 03) averages the *results* of several depth comparisons, which turns a hard edge into a ramp. The width of that ramp is set by the kernel, not by the scene. Real penumbrae come from area lights and grow with the distance between occluder and receiver: a pole's shadow is sharp at its foot and blurry at its tip.

**PCSS** (Fernando 2005) estimates the penumbra per pixel in three steps:

1. **Blocker search**: average the shadow-map depths in a search region that are closer to the light than the receiver. This gives $d_{\text{blocker}}$.
2. **Penumbra estimate** from similar triangles between the light of width $w_{\text{light}}$, the blocker and the receiver:
   $$ w_{\text{penumbra}} = \frac{(d_{\text{receiver}} - d_{\text{blocker}})\, w_{\text{light}}}{d_{\text{blocker}}} . $$
3. **PCF** with a kernel of width proportional to $w_{\text{penumbra}}$.

**Worked example**: a 0.5 m wide light, a blocker 8 m from the light and a receiver at 10 m: $w_p = 2 \times 0.5/8 = 0.125$ m. Move the blocker to 4 m from the light and the penumbra grows to $6 \times 0.5/4 = 0.75$ m.

```glsl
uniform sampler2D uShadowDepth;   // distance from the light, normalized to [0,1]
uniform float uLightSizeUV;       // light width / shadow frustum width
uniform float uNear;              // light near plane, same normalization
const int N = 16;
uniform vec2 uPoisson[N];         // Poisson-disk offsets in the unit disk

float pcss(vec2 uv, float dReceiver) {
    // 1. blocker search
    float searchR = uLightSizeUV * (dReceiver - uNear) / dReceiver;
    float sum = 0.0; int count = 0;
    for (int i = 0; i < N; ++i) {
        float d = texture(uShadowDepth, uv + uPoisson[i] * searchR).r;
        if (d < dReceiver) { sum += d; ++count; }
    }
    if (count == 0) return 1.0;                        // nothing in front: fully lit
    float dBlocker = sum / float(count);
    // 2. penumbra width by similar triangles
    float wPenumbra = (dReceiver - dBlocker) * uLightSizeUV / dBlocker;
    // 3. PCF with that kernel
    float lit = 0.0;
    for (int i = 0; i < N; ++i) {
        float d = texture(uShadowDepth, uv + uPoisson[i] * wPenumbra).r;
        lit += (dReceiver - 0.002 <= d) ? 1.0 : 0.0;
    }
    return lit / float(N);
}
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-pcss.svg" caption="(a) PCSS penumbra width versus the blocker-receiver distance for three light sizes (receiver 10 units from the light): the width grows slowly at first and explodes as the blocker approaches the light. (b) Visibility across a shadow edge cast by a straight blocker at height h = 2 (blue) and h = 6 (red): the exact fraction of a 1-unit light that is visible (thick, faint), PCSS (dotted), which reproduces both ramps, and fixed-kernel PCF (dashed), which gives the same 0.4-wide ramp regardless of h." %}

### 2.3 Variance and moment shadow maps

PCF cannot be pre-filtered: you cannot blur a depth map, because averaging depths and *then* comparing is not the same as comparing and then averaging. **Variance shadow maps** (VSM; Donnelly and Lauritzen 2006) store the first two **moments** of depth, $M_1 = E[z]$ and $M_2 = E[z^2]$. Moments *can* be filtered with mipmaps, separable blurs and anisotropic filtering. At lookup time, with mean $\mu = M_1$ and variance $\sigma^2 = M_2 - M_1^2$ over the filter region, the one-sided **Chebyshev (Cantelli) inequality** bounds the fraction of the region at depth at least $t$, which is the fraction that does *not* occlude a receiver at depth $t$:

$$
P(z \ge t) \;\le\; p_{\max}(t) = \frac{\sigma^2}{\sigma^2 + (t-\mu)^2}, \qquad t > \mu .
$$

VSM uses $p_{\max}$ as the visibility. For a single planar occluder in front of a planar receiver the bound is exact. **Worked example**: a kernel half at depth 0.3 and half at 0.7 has $\mu = 0.5$ and $\sigma^2 = 0.04$. For a receiver just behind the second surface, at $t = 0.7$, $p_{\max} = 0.04/(0.04+0.04) = 0.5$, exactly right. For $t = 0.9$ the truth is 0 but $p_{\max} = 0.04/(0.04+0.16) = 0.2$. This is **light bleeding**: when two occluders overlap, the variance is large and the bound becomes loose.

```python
import numpy as np

def chebyshev(m1, m2, t):
    var = np.maximum(m2 - m1 * m1, 1e-6)
    return np.where(t <= m1, 1.0, var / (var + (t - m1) ** 2))

def evsm(z, t, c=10.0):
    """Exponential VSM: Chebyshev on warped depths exp(c z) and -exp(-c z), take the min."""
    p, n = np.exp(c * z), -np.exp(-c * z)
    return np.minimum(chebyshev(p.mean(), (p * p).mean(), np.exp(c * t)),
                      chebyshev(n.mean(), (n * n).mean(), -np.exp(-c * t)))

z = np.array([0.3, 0.7])                    # depths inside the filter kernel
for t in [0.7, 0.9]:
    print(t, chebyshev(z.mean(), (z * z).mean(), t), evsm(z, t))
# VSM: 0.5 at t = 0.7 (exact), 0.2 at t = 0.9 (bleeding); EVSM is far lower at 0.9
```

Remedies:

- **Light-bleeding reduction** remaps $p_{\max}$ so that small values become 0, at the cost of darker penumbrae.
- **Exponential shadow maps** (ESM, Annen et al. 2008) store $e^{cz}$.
- **Exponential VSM** (EVSM, from Lauritzen's work on layered and warped VSMs) applies Chebyshev to the warped moments $e^{cz}$ and $-e^{-cz}$ and keeps the smaller bound. The warp compresses the occluders' depths relative to the receiver, which makes the bound much tighter.
- **Moment shadow maps** (Peters and Klein 2015) store four moments and reconstruct the tightest distribution consistent with them (a Hamburger moment problem), which almost eliminates bleeding.

{% include blog_figure.liquid path="assets/img/blog/graphics/11-vsm-chebyshev.svg" caption="(a) For a filter region with half its depths at 0.3 and half at 0.7, the true fraction P(z ≥ t) (black steps) versus the VSM Chebyshev bound (orange) and EVSM with c = 10 (green): the bound touches the truth at t = 0.7 but stays high behind it. (b) Light bleeding on a strip: blocker A (z = 0.2, shaded) partly covers blocker B (z = 0.5), and the receiver is at t = 0.6. True PCF visibility (black) is 0 left of x = 0.75, but VSM lets light leak where the filter straddles both blockers; EVSM suppresses most of it." %}

### 2.4 Contact shadows and virtual shadow maps

Even good shadow maps miss small-scale occlusion: a cup's contact with a table, or wrinkles. **Contact shadows** march a few steps from each pixel toward the light *in screen space*, through the depth buffer, and mark the pixel shadowed if the ray goes behind a surface within a small distance. This is the same marcher as screen-space reflections (Section 4), just with a short ray. At the other extreme, **virtual shadow maps** use a single huge shadow texture (for example $16\text{k}\times16\text{k}$ per light), allocated sparsely in pages only where visible pixels need them, with clipmap levels for directional lights. They replace cascades in Unreal Engine 5 and are discussed in [graphics-engine 04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}).

## 3. Ambient occlusion

### 3.1 Definition

Ambient light reaching a point in a crease is reduced by nearby geometry. **Ambient occlusion** is the cosine-weighted fraction of the hemisphere around the normal that is *not* blocked within a radius $R$:

$$
A(\mathbf{p}) = \frac{1}{\pi}\int_{\Omega} V(\mathbf{p}, \boldsymbol{\omega})\,(\mathbf{n}\cdot\boldsymbol{\omega})\, d\boldsymbol{\omega},
$$

where $V = 1$ if the ray from $\mathbf{p}$ in direction $\boldsymbol{\omega}$ escapes within $R$. The $1/\pi$ normalizes it so that $A = 1$ when nothing blocks. Multiplying ambient or indirect diffuse light by $A$ is an approximation, since occluders also reflect light. It is still the single most effective "grounding" effect in real-time rendering.

### 3.2 SSAO and HBAO

**SSAO** (Mittring 2007, CryEngine 2) estimates occlusion from the depth buffer alone. Around each pixel it takes a handful of random 3D sample points within radius $R$, projects them to the screen, and counts how many lie *behind* the stored depth. Later variants sample a normal-oriented hemisphere, use a per-pixel random rotation (noise) followed by a bilateral blur, and add a range check so that distant foreground objects do not darken the background.

**HBAO** (Bavoil, Sainz and Dimitrov 2008) reinterprets the depth buffer as a height field. For a set of directions in screen space it marches outward and finds the **horizon angle**, the highest elevation at which the height field is seen. Everything below the horizon is occluded and everything above is open, so one march per direction replaces many independent visibility tests.

### 3.3 GTAO: the horizon integral, solved

**GTAO** (Jimenez, Wu, Pesce and Jarabo 2016) writes the AO integral in exactly that slice form and integrates the cosine weight analytically. Parameterize the hemisphere by a slice angle $\phi \in [0, \pi)$ in the screen plane and an angle $\theta \in [-\pi/2, \pi/2]$ from the normal within the slice. Take the simple case where the normal points at the viewer. Then $d\boldsymbol{\omega} = \vert\sin\theta\vert\, d\theta\, d\phi$ and

$$
A = \frac{1}{\pi}\int_0^{\pi}\!\int_{-\pi/2}^{\pi/2} V(\phi,\theta)\,\cos\theta\,\vert\sin\theta\vert\, d\theta\, d\phi .
$$

In each slice the visible range is between the two horizons, $\theta \in [-h_1, h_2]$, where $h_{1,2}$ are measured from the normal. With elevations $e = \pi/2 - h$ above the tangent plane, the inner integral is elementary:

$$
\int_0^{h}\cos\theta\sin\theta\,d\theta = \frac{\sin^2 h}{2}
\quad\Longrightarrow\quad
a(\phi) = \frac{\sin^2 h_1 + \sin^2 h_2}{2} = \frac{\cos^2 e_1 + \cos^2 e_2}{2},
\qquad A = \frac{1}{\pi}\int_0^{\pi} a(\phi)\,d\phi .
$$

Check: with no occluders $e_1 = e_2 = 0$, $a = 1$ and $A = 1$. **Worked example**: horizons at $e_1 = 30^\circ$ and $e_2 = 10^\circ$ give $a = (0.75 + 0.970)/2 = 0.860$. The paper generalizes this to a normal that is tilted within the slice (the projected-normal angle enters the closed form) and adds a cheap multi-bounce correction that brightens AO on light-coloured surfaces. Each pixel uses one or two slices with a random rotation per pixel and per frame, and the noise is removed spatially and temporally.

```python
import numpy as np

def horizon_ao(h, R=0.08, steps=12, slices=4, rng=None):
    """GTAO-style AO on a height field h (n x n over [0,1]^2), normal assumed +z."""
    n = h.shape[0]
    u = (np.arange(n) + 0.5) / n
    X, Y = np.meshgrid(u, u)
    def look(x, y):
        i = np.clip((y * n).astype(int), 0, n - 1); j = np.clip((x * n).astype(int), 0, n - 1)
        return h[i, j]
    rot = rng.random(h.shape) if rng is not None else 0.0
    A = np.zeros_like(h)
    for k in range(slices):
        phi = np.pi * (k + rot) / slices
        a = 0.0
        for s in (1, -1):                               # the two sides of the slice
            e = np.zeros_like(h)
            for j in range(1, steps + 1):
                r = R * j / steps
                dh = look(X + s * r * np.cos(phi), Y + s * r * np.sin(phi)) - h
                e = np.maximum(e, np.arctan2(dh, r))    # horizon elevation
            a = a + 0.5 * np.cos(e) ** 2
        A += a
    return A / slices

xx, yy = np.meshgrid(np.linspace(0, 1, 128), np.linspace(0, 1, 128))
hill = 0.2 * np.exp(-((xx - 0.5) ** 2 + (yy - 0.5) ** 2) / 0.02)
ao = horizon_ao(hill)
print(ao.min().round(3), ao.max().round(3))           # dark ring at the hill's foot, 1.0 on flat ground
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-ao-horizon.svg" caption="Ambient occlusion on a height field (hills, a box and a pit). (a) One slice through the point p: the marcher samples the height field on both sides (dots) and keeps the highest elevation, the horizons e₁ and e₂; the slice's visible fraction is ½(cos²e₁ + cos²e₂). (b) Monte Carlo with 8 cosine-weighted rays per pixel is very noisy. (c) 64 rays is better but still grainy. (d) The horizon form with only 4 slices (8 marches) and a random rotation per pixel already has a lower error than (c). RMSE is measured against the horizon method with 64 slices." %}

## 4. Screen-space reflections

**Screen-space reflections** (SSR) reuse the already-shaded frame as the source of reflected light. For each pixel with a glossy surface:

1. Reconstruct the view-space position from depth, reflect the view vector about the normal: $\mathbf{r} = \mathbf{v} - 2(\mathbf{v}\cdot\mathbf{n})\mathbf{n}$.
2. March the reflected ray **in screen space**, step by step through the depth buffer, until the ray's depth passes behind the stored depth.
3. Accept the hit if the ray is within a **thickness** $\Delta$ of the surface. A depth buffer stores only the front surface, so without a thickness test every object would look infinitely deep.
4. Return the colour of the previous frame at the hit (reprojected), faded near the screen edges.

McGuire and Mara (2014) showed how to march in screen space with a DDA that interpolates $1/z$ (which is linear in screen space under perspective). This visits every pixel exactly once, instead of stepping in 3D and oversampling near the camera.

**Hierarchical-Z tracing.** A linear march with step size $\Delta x$ either costs many steps or skips thin objects. A **Hi-Z pyramid** stores, at level $L$, the *minimum* depth over $2^L \times 2^L$ pixels (the nearest surface). The tracer walks the ray through this quadtree. If the ray stays in front of a coarse cell's nearest depth until it exits the cell, it skips the whole cell and moves up a level. Otherwise it advances to where it reaches that depth and refines one level down. A hit is declared at level 0. The cost becomes logarithmic in the distance travelled. Uludag's chapter *Hi-Z Screen-Space Cone-Traced Reflections* (GPU Pro 5, 2014) popularized this for SSR. Here is a 1D version that reproduces the figure:

```python
import numpy as np

zbuf = np.full(64, 0.9); zbuf[20:24] = 0.55; zbuf[40:52] = 0.62     # 1D depth buffer
pyr = [zbuf]
while len(pyr[-1]) > 1:
    pyr.append(pyr[-1].reshape(-1, 2).min(axis=1))                  # min-depth pyramid

def hiz_trace(x0, z0, slope, pyr, thickness=0.05, max_iter=64):
    lvl, x = 0, x0
    for it in range(max_iter):
        size = 2 ** lvl
        cell = int(x // size)
        if cell * size >= len(pyr[0]):
            return None, it                            # left the screen
        x_exit = (cell + 1) * size
        zmin = pyr[lvl][cell]
        if z0 + (x_exit - x0) * slope < zmin:          # in front of the whole cell: skip, go coarser
            x, lvl = x_exit, min(lvl + 1, len(pyr) - 1)
        else:
            x = max(x, x0 + (zmin - z0) / slope)       # advance to where the ray reaches zmin
            if lvl == 0:
                if z0 + (x - x0) * slope - zmin <= thickness:
                    return x, it                       # hit
                x = x_exit                             # passed behind a thin object
            else:
                lvl -= 1                               # refine
    return None, max_iter

print(hiz_trace(4.0, 0.3, 0.009, pyr))   # hits the front of the box at x ~ 40
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-ssr-march.svg" caption="Screen-space ray marching through a 1D depth buffer (gray: the scene behind the stored depth; camera at the top). (a) A linear march with steps of 7 pixels (dots) jumps over the pillar, overshoots behind the box, and needs a bisection refinement to find the hit (star). (b) Hierarchical-Z: coloured bars show the min-depth cells visited at each pyramid level; the ray skips large empty cells at coarse levels and refines only near the box." %}

**Failure cases** come from the fact that the depth buffer is a single layer of what the camera sees:

- rays that leave the screen or point toward the camera find nothing;
- surfaces facing away from the camera, or hidden behind others, are not in the buffer at all;
- thin objects are either missed or smeared, depending on the thickness value.

Engines therefore blend SSR with a fallback: reflection probes, or hardware-traced rays as in post 06. Rough surfaces use a wider cone, or importance-sample the GGX lobe per pixel and filter the result over space and time.

## 5. Real-time global illumination

Direct light is the easy half. Indirect light (bounces off walls, colour bleeding, sky light in interiors) is what makes images believable. Real-time GI is a spectrum from fully precomputed to fully dynamic.

### 5.1 Light maps

**Light maps** precompute the incident irradiance on static surfaces into a second, non-overlapping UV layout, with an offline path tracer (as in post 05) or a GPU baker. At run time a texture fetch gives perfect soft indirect light at almost no cost. To keep normal maps working, bakers store *directional* irradiance: a dominant direction, low-order SH or an H-basis per texel. The limits are static geometry and lights, memory, and baking time.

### 5.2 Irradiance probes and spherical harmonics

For dynamic objects, and for scenes where light maps are impractical, engines place **probes** in space. Each probe stores the irradiance arriving from every direction, $E(\mathbf{n})$, compactly. Diffuse irradiance is very smooth over directions, because it is radiance convolved with a clamped cosine. **Spherical harmonics** (SH) are the natural basis for it.

**Real SH** $Y_{lm}$ are an orthonormal basis of functions on the sphere, organized in bands $l = 0, 1, 2, \dots$ with $2l+1$ functions each, like a Fourier series where $l$ is the angular frequency. Bands $l \le 2$ give 9 functions. In Cartesian form for a unit vector $(x, y, z)$:

$$
\begin{aligned}
Y_{00} &= 0.282095, \qquad (Y_{1,-1}, Y_{10}, Y_{11}) = 0.488603\,(y,\ z,\ x),\\
(Y_{2,-2}, Y_{2,-1}, Y_{21}) &= 1.092548\,(xy,\ yz,\ xz),\quad Y_{20} = 0.315392\,(3z^2-1),\quad Y_{22} = 0.546274\,(x^2-y^2).
\end{aligned}
$$

**Projection** of the environment radiance $L(\boldsymbol{\omega})$ onto the basis gives coefficients (orthonormality makes this a plain inner product):

$$
L_{lm} = \int_{S^2} L(\boldsymbol{\omega})\,Y_{lm}(\boldsymbol{\omega})\,d\boldsymbol{\omega},
\qquad L(\boldsymbol{\omega}) \approx \sum_{l\le l_{\max}}\sum_m L_{lm} Y_{lm}(\boldsymbol{\omega}).
$$

**Irradiance by convolution.** Irradiance is $E(\mathbf{n}) = \int L(\boldsymbol{\omega})\max(0, \mathbf{n}\cdot\boldsymbol{\omega})\,d\boldsymbol{\omega}$, a convolution with the clamped cosine. By the Funk-Hecke theorem, convolving with a rotationally symmetric kernel simply scales each band. Ramamoorthi and Hanrahan (2001) computed the factors:

$$
E(\mathbf{n}) = \sum_{l,m} \hat A_l\, L_{lm}\, Y_{lm}(\mathbf{n}),
\qquad \hat A_0 = \pi,\quad \hat A_1 = \frac{2\pi}{3},\quad \hat A_2 = \frac{\pi}{4},\quad \hat A_3 = 0,\quad \hat A_4 = -\frac{\pi}{24},\ \dots
$$

The factors fall off quickly ($\hat A_l$ is zero for odd $l > 1$ and decays like $l^{-5/2}$ for even $l$). That is why **9 coefficients per colour channel** reproduce irradiance to within a few percent on average, even for environments with a sharp sun. The radiance itself would need many more bands.

```python
import numpy as np

def sh9(d):
    x, y, z = d[..., 0], d[..., 1], d[..., 2]
    return np.stack([0.282095 * np.ones_like(x),
                     0.488603 * y, 0.488603 * z, 0.488603 * x,
                     1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1),
                     1.092548 * x * z, 0.546274 * (x * x - y * y)], -1)

A_HAT = np.array([np.pi] + [2 * np.pi / 3] * 3 + [np.pi / 4] * 5)

def project(radiance_fn, n_theta=256, n_phi=512):
    th = (np.arange(n_theta) + 0.5) / n_theta * np.pi
    ph = (np.arange(n_phi) + 0.5) / n_phi * 2 * np.pi
    PH, TH = np.meshgrid(ph, th)
    d = np.stack([np.sin(TH) * np.cos(PH), np.sin(TH) * np.sin(PH), np.cos(TH)], -1)
    dw = np.sin(TH) * (np.pi / n_theta) * (2 * np.pi / n_phi)      # solid angle of each cell
    return np.einsum("ij,ijk->k", radiance_fn(d) * dw, sh9(d))

def irradiance(coef, n):
    return sh9(n) @ (A_HAT * coef)

c = project(lambda d: np.ones(d.shape[:-1]))                      # constant sky, L = 1
print(c[0].round(4), irradiance(c, np.array([0.0, 0.0, 1.0])).round(4))   # 3.5449 3.1416 (= pi)
c = project(lambda d: (d[..., 2] > 0).astype(float))              # sky above, black below
for nz in [1.0, 0.0, -1.0]:
    n = np.array([np.sqrt(1 - nz * nz), 0.0, nz])
    print(nz, irradiance(c, n).round(4), round(np.pi * (1 + nz) / 2, 4))   # matches pi(1+n_z)/2
```

The two checks have exact answers. A constant environment $L = 1$ gives $L_{00} = 4\pi \cdot 0.282095 = 3.5449$ and $E = \pi$ for every normal. A white upper hemisphere gives $E(\mathbf{n}) = \pi(1 + n_z)/2$. Because that is linear in $n_z$, bands $l \le 1$ already reproduce it exactly.

{% include blog_figure.liquid path="assets/img/blog/graphics/11-sh-irradiance.svg" caption="SH irradiance of an environment with a sky gradient, a dark ground and a small bright sun, as lat-long maps (θ down, φ across). (a) Radiance (log scale): the sun is a tiny spot. (b) Exact irradiance by brute-force integration: a broad, smooth lobe. (c)-(e) SH approximations with bands l ≤ 0, 1, 2 (1, 4 and 9 coefficients): l ≤ 2 is visually indistinguishable from (b). (f) Relative RMS error: irradiance error drops fast and l = 3 adds nothing, because Â₃ = 0; the radiance itself is still badly approximated at the same orders." %}

The widget below puts this in your hands. The left sphere is lit by the exact irradiance of a sky, a ground and a disc-shaped sun, and the right sphere by its SH approximation. Below them, the environment and its SH reconstruction at the same order show that the *radiance* rings and smears long before the *irradiance* does.

{% include widget.liquid name="graphics-sh-lighting" height="560" caption="SH lighting. Drag on the canvas (mouse or finger) to move the sun; choose the SH order l_max (0-3) and the sun's angular radius (its total power stays fixed). Left: exact irradiance; right: SH irradiance with bands up to l_max. Bottom: environment radiance and its SH reconstruction. With order 2 the spheres match within a few percent even for a 2° sun, while the reconstructed environment is a blurry blob with ringing; order 3 changes nothing on the spheres because Â₃ = 0." %}

**Probes in practice.** Probes are placed in grids or by hand. Each shaded point interpolates its neighbouring probes (trilinearly in a grid) and evaluates $E(\mathbf{n})$ with 9 multiply-adds per channel. Probes that are updated at run time can be relit when lights change. The classic failure is **leaking**: a probe outside a wall lights the inside of a room.

### 5.3 DDGI: ray-traced irradiance probes

**Dynamic Diffuse Global Illumination** (DDGI; Majercik, Guertin, Nowrouzezahrai and McGuire 2019) makes probe grids fully dynamic and leak-resistant:

- every frame, each probe traces a fixed budget of rays (hardware ray tracing) and shades the hits, including the previous frame's probe irradiance at the hit, so bounces accumulate over frames;
- the results are blended into small **octahedral** irradiance textures per probe (Section 1.2) with hysteresis, an exponential moving average;
- each probe also stores the mean and mean-squared **distance** to the geometry per direction. At shading time a **Chebyshev test**, the same inequality as VSM in Section 2.3, down-weights probes that are probably occluded from the shaded point. That stops most leaks through walls.

### 5.4 Voxel cone tracing

**Voxel cone tracing** (Crassin et al. 2011) voxelizes the scene into a 3D texture (a sparse voxel octree in the original paper) holding opacity and the outgoing radiance from direct lighting, then builds a 3D mip pyramid. A **cone** of aperture $\alpha$ from a surface point is traced by stepping along its axis. At distance $t$ the cone's diameter is $d = 2t\tan(\alpha/2)$, so the tracer samples the mip level whose voxel size matches, $\log_2(d/v_0)$, and accumulates colour and opacity front to back. This is exactly the alpha compositing of [post 10]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }}). A few wide cones gather diffuse GI, one narrow cone gathers glossy reflections. The costs are voxelization, memory, and light leaking through thin walls at coarse mip levels.

### 5.5 SDF and surface-cache GI, and ReSTIR GI

Two further families power current engines:

- **Signed distance fields** (SDFs) of meshes allow fast software ray marching for GI and shadows. A **surface cache** stores lighting on simplified "cards" around meshes. Together they are the core of Unreal Engine 5's Lumen, explained in [graphics-engine 04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}).
- With hardware ray tracing, **ReSTIR GI** resamples one-bounce indirect paths across pixels and frames, as described in [post 06]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}).

## 6. Temporal reuse in depth

Post 06 introduced TAA and temporal accumulation. Almost every effect in this chapter (SSAO, SSR, PCSS, volumetric fog, probes) is now rendered *noisy* at low sample counts and cleaned up by reusing the previous frames, so it is worth stating the machinery precisely.

1. **Reprojection.** For a pixel with world position $\mathbf{x}$ (from depth), its position in the previous frame is $\mathbf{p}_{t-1} = P_{t-1}V_{t-1}\mathbf{x}$, using the previous view-projection matrices. For moving objects, a **motion-vector** target written in the geometry pass stores the screen-space displacement per pixel instead.
2. **Disocclusion.** If the previous frame's depth or normal at $\mathbf{p}_{t-1}$ does not match (or $\mathbf{p}_{t-1}$ is off screen), the history belongs to another surface and must be discarded. The pixel then restarts accumulation with a higher blend weight.
3. **Accumulation.** $c_t = \alpha\,x_t + (1-\alpha)\,c_{t-1}$, an exponential moving average. Its weights decay over roughly $1/\alpha$ frames, and at equilibrium its noise variance equals that of a plain mean of $(2-\alpha)/\alpha$ frames: 19 frames for $\alpha = 0.1$.
4. **History rectification.** Lighting changes and imperfect reprojection still leave stale history, which shows up as ghosting. Neighbourhood **clamping** (post 06) limits the history to the min-max box of the current 3 × 3 neighbourhood. **Variance clipping** (Salvi 2016) instead builds the box from the neighbourhood's mean and standard deviation, $\mu \pm \gamma\sigma$, usually in the YCoCg colour space where luma and chroma are decorrelated. It then *clips* the history along the line toward $\mu$ instead of clamping each channel independently, which avoids colour shifts. The statistical box is tighter than min-max when the neighbourhood is noisy.

```python
import numpy as np

def variance_clip(history, neigh, gamma=1.0):
    """history: (3,) colour; neigh: (k, 3) current-frame neighbourhood (YCoCg recommended)."""
    mu, sigma = neigh.mean(0), neigh.std(0)
    half = gamma * sigma + 1e-6
    d = history - mu
    t = np.max(np.abs(d) / half)            # > 1 means outside the box
    return history if t <= 1 else mu + d / t   # move toward mu until on the box surface

neigh = np.array([[0.4, 0, 0], [0.5, 0, 0], [0.6, 0, 0]] * 3)
print(variance_clip(np.array([0.9, 0.0, 0.0]), neigh))   # [0.5816 0. 0.]  (= 0.5 + 1 sigma)
```

## 7. HDR, exposure and tone mapping

### 7.1 A linear HDR workflow

Lighting must be computed in **linear** radiometric units. Values range from $10^{-3}$ in shadow to $10^{5}$ at the sun's disc and are stored in floating-point (RGBA16F) targets. Textures authored in sRGB are decoded to linear on load (post 03). The final image has to fit into a display's range, and that takes three steps:

1. **Exposure**: scale by $2^{EV}$ so that the scene's middle grey lands around 0.18. **Automatic exposure** computes the log-average luminance $\bar L = \exp\big(\tfrac{1}{N}\sum\ln(\delta + L_i)\big)$ (Reinhard et al. 2002), or a luminance histogram that ignores the darkest and brightest few percent. It then adapts smoothly over time, like the eye.
2. **Tone mapping**: a curve that compresses $[0, \infty)$ into $[0, 1)$ with a gentle shoulder for highlights and, optionally, a toe for shadows.
3. **Output encoding**: the sRGB transfer function for SDR displays, or PQ for HDR10.

### 7.2 Tone-mapping operators

- **Reinhard**: $y = x/(1+x)$, the simplest operator. Its *extended* form $y = x(1 + x/L_w^2)/(1+x)$ maps a chosen white point $L_w$ to 1. **Worked example**: middle grey $0.18 \mapsto 0.153$.
- **Filmic (Hable, *Uncharted 2*)**: a rational curve with a toe and a shoulder,
  $f(x) = \frac{x(Ax + CB) + DE}{x(Ax+B) + DF} - \frac{E}{F}$,
  normalized by $f(W)$. The constants are $A=0.15$, $B=0.50$, $C=0.10$, $D=0.20$, $E=0.02$, $F=0.30$ and the white point is $W = 11.2$.
- **ACES**: the Academy Color Encoding System defines a reference rendering transform and output transforms for film. Games often use Narkowicz's (2016) one-line fit, $y = \frac{x(2.51x + 0.03)}{x(2.43x + 0.59) + 0.14}$, applied per channel. It gives punchy contrast, but bright saturated colours shift in hue and desaturate (a saturated orange drifts toward yellow), because each channel saturates separately. **Worked example**: $0.18 \mapsto 0.267$.
- **AgX** (introduced as a view transform in Blender 4.0) applies its curve in a carefully chosen, slightly desaturated working space. Very bright saturated lights then roll smoothly toward white instead of clipping to pure hues.
- **Khronos PBR Neutral** (released in 2024) is designed for product visualization. It leaves base colours untouched up to about 0.8 so that a material looks like its albedo under neutral lighting, then compresses only the highlights and desaturates them toward white.

```python
import numpy as np

def reinhard(x): return x / (1 + x)

def hable(x):
    A, B, C, D, E, F, W = 0.15, 0.50, 0.10, 0.20, 0.02, 0.30, 11.2
    f = lambda v: (v * (A * v + C * B) + D * E) / (v * (A * v + B) + D * F) - E / F
    return f(2.0 * x) / f(W)                   # 2.0 = exposure bias used in the original talk

def aces_fit(x):
    return np.clip(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)

def srgb_encode(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * x ** (1 / 2.4) - 0.055)

for f in (reinhard, hable, aces_fit):
    print(f.__name__, np.round(srgb_encode(f(np.array([0.18, 1.0, 4.0, 16.0]))), 3))
print(round(float(srgb_encode(0.18)) * 255))   # 118: middle grey in 8-bit sRGB
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-tonemap-curves.svg" caption="Tone-mapping curves for grey input. (a) Linear axes: clamping (dotted) clips everything above 1, Reinhard approaches 1 slowly, the extended Reinhard reaches 1 at L_w = 4, Hable and the ACES fit have a toe and a steeper midtone, and PBR Neutral is the identity up to about 0.76 before its shoulder. (b) The same curves after sRGB encoding on a log axis spanning five decades of scene luminance; the dotted line marks middle grey 0.18. The ACES fit has the most contrast around middle grey; Reinhard keeps the most highlight detail." %}

The widget below applies these operators to an HDR test chart of six hues, each ramping over 12 stops. Watch what happens to saturated colours as they get brighter.

{% include widget.liquid name="graphics-tonemap" height="440" caption="Tone-mapping explorer. Each row of the chart is one hue ramping from 6 stops below to 6 stops above middle grey (left to right); the slider sets the exposure in EV and the menu picks the operator. The curve below shows the operator for grey input (dashed: plain clamping). Compare clamp (hues clip abruptly to yellow and cyan), the ACES fit (strong contrast, hue shifts in bright reds and blues) and PBR Neutral (colours preserved, then a smooth roll-off to white)." %}

### 7.3 The sRGB transfer function and HDR output

Displays and 8-bit images are not linear in light. The **sRGB** encoding (the "OETF" used for storage and SDR output) is

$$
V = \begin{cases} 12.92\,L & L \le 0.0031308\\ 1.055\,L^{1/2.4} - 0.055 & L > 0.0031308 \end{cases},
$$

a linear toe joined to a power curve. The pair is close to, but not the same as, $L^{1/2.2}$. Its purpose is perceptual: the eye is sensitive to *relative* changes, so codes should be spaced closer together in the darks. With 8 bits, linear encoding wastes most codes on highlights and bands visibly in the shadows. **Worked example**: middle grey 0.18 encodes to $V = 1.055 \cdot 0.18^{1/2.4} - 0.055 = 0.461$, code 118 of 255. Linear storage would put it at code 46.

{% include blog_figure.liquid path="assets/img/blog/graphics/11-srgb.svg" caption="(a) The sRGB encoding curve against a pure 2.2 power and the identity; the inset shows the linear segment below 0.0031308, which avoids an infinite slope at 0. (b) The relative step ΔL/L between adjacent 8-bit codes: linear encoding gives steps of 10-100% in the darks (visible banding), while sRGB keeps them within a few percent over most of the range (the dotted line marks 1% for reference)." %}

The rules of a **linear workflow**:

- decode sRGB textures before filtering and lighting (the GPU does this for `*_SRGB` formats);
- light and blend in linear space;
- tone map in linear space;
- encode once at the very end, or write to an `*_SRGB` render target and let the hardware encode.

Blending in sRGB space, or applying the curve twice, gives the classic "too dark, too saturated" look.

**HDR output** replaces the last step. **HDR10** uses the **PQ** transfer function (SMPTE ST 2084), which encodes *absolute* luminance up to 10,000 cd/m², with the wide **Rec. 2020** primaries in 10 bits per channel. The renderer then tone maps to the actual peak brightness of the display (often 600-1500 nits) instead of to 1.0. It converts from its working primaries (often Rec. 709/sRGB, sometimes a wider space such as ACEScg) to Rec. 2020, and lets the UI be composited at a "paper white" level. Windows' scRGB (linear FP16 with sRGB primaries, values above 1 allowed) is an alternative swap-chain format that leaves the PQ encoding to the OS.

## 8. Performance thinking

Algorithms decide what is *possible*, but whether they fit into 16 ms depends on how they use the GPU.

- **Bandwidth versus ALU (the roofline).** A pass is **bandwidth-bound** if its arithmetic intensity (FLOPs per byte moved) is below the GPU's ratio of peak compute to peak bandwidth, and **compute-bound** otherwise. **Worked example** with a hypothetical GPU of 20 TFLOP/s and 500 GB/s (ridge at 40 FLOP/byte): a full-screen 1080p pass reading 16 bytes per pixel and doing 100 FLOPs per pixel has an intensity of about 6 FLOP/byte, so it is bandwidth-bound and takes at least $33\ \text{MB}/500\ \text{GB/s} \approx 66\ \mu s$. Halving its G-buffer reads helps; optimizing its math does not.
- **Overdraw.** Fragments that are shaded and then overwritten are wasted work. Front-to-back sorting, a depth pre-pass, deferred shading, and visibility buffers ([graphics-engine 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})) all attack it.
- **Occupancy and latency hiding.** GPUs hide memory latency by switching between many resident warps or waves. A shader that uses many registers or much shared memory allows fewer resident waves, so stalls show. Large loops over lights or samples, big local arrays and divergent branches are the usual culprits.
- **Resolution and rate.** Many effects run at half or quarter resolution (AO, SSR, volumetric fog, clouds) and are upsampled with depth-aware filters. Variable-rate shading and temporal upscaling (post 06) push this further.
- **Measure, don't guess.** **RenderDoc** (open source, cross-API frame capture: inspect every draw, texture and pipeline state), **PIX** (Direct3D 12 on Windows and Xbox, with GPU timing and occupancy), **NVIDIA Nsight Graphics** (hardware counters, "GPU Trace" showing which unit is the limiter), as well as AMD's Radeon GPU Profiler and Xcode's Metal tools. Timestamp queries around every pass in your own engine make regressions visible immediately.

## Try it

- The two widgets above: SH lighting (try a 2° sun at order 1, then 2) and tone mapping (push the exposure to +3 EV with clamping and then with PBR Neutral).
- The path tracer in the [Interactive Lab]({{ '/' | relative_url }}#lab) shows the converged ground truth that every approximation in this chapter tries to imitate in a fraction of the time.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Reeves, Salesin & Cook, *Rendering Antialiased Shadows with Depth Maps* | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37435) | Percentage-closer filtering |
| Saito & Takahashi, *Comprehensible Rendering of 3-D Shapes* | SIGGRAPH | 1990 | [DOI](https://doi.org/10.1145/97880.97901) | The G-buffer idea behind deferred shading |
| Ramamoorthi & Hanrahan, *An Efficient Representation for Irradiance Environment Maps* | SIGGRAPH | 2001 | [DOI](https://doi.org/10.1145/383259.383317) | 9 SH coefficients reproduce diffuse lighting |
| Sloan, Kautz & Snyder, *Precomputed Radiance Transfer for Real-Time Rendering in Dynamic, Low-Frequency Lighting Environments* | SIGGRAPH | 2002 | [DOI](https://doi.org/10.1145/566570.566612) | SH-based precomputed transfer with shadows and interreflections |
| Reinhard, Stark, Shirley & Ferwerda, *Photographic Tone Reproduction for Digital Images* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566575) | Log-average key, the Reinhard operator |
| Fernando, *Percentage-Closer Soft Shadows* | SIGGRAPH Sketches | 2005 | [DOI](https://doi.org/10.1145/1187112.1187153) | Blocker search and penumbra estimation |
| Donnelly & Lauritzen, *Variance Shadow Maps* | I3D | 2006 | [DOI](https://doi.org/10.1145/1111411.1111440) | Filterable shadows via moments and Chebyshev's inequality |
| Zhang, Sun, Xu & Lun, *Parallel-Split Shadow Maps for Large-Scale Virtual Environments* | VRCIA | 2006 | [DOI](https://doi.org/10.1145/1128923.1128975) | Cascades and the practical split scheme |
| Mittring, *Finding Next Gen: CryEngine 2* | SIGGRAPH Courses | 2007 | [DOI](https://doi.org/10.1145/1281500.1281671) | Introduced screen-space ambient occlusion |
| Annen, Mertens, Seidel, Flerackers & Kautz, *Exponential Shadow Maps* | Graphics Interface | 2008 | [GI](https://graphicsinterface.org/proceedings/gi2008/gi2008-20) | Exponential warp for filterable shadows |
| Bavoil, Sainz & Dimitrov, *Image-Space Horizon-Based Ambient Occlusion* | SIGGRAPH Talks | 2008 | [DOI](https://doi.org/10.1145/1401032.1401061) | Horizon angles from the depth buffer |
| Lauritzen, Salvi & Lefohn, *Sample Distribution Shadow Maps* | I3D | 2011 | [DOI](https://doi.org/10.1145/1944745.1944761) | Fit cascades to the visible depth range |
| Crassin, Neyret, Sainz, Green & Eisemann, *Interactive Indirect Illumination Using Voxel Cone Tracing* | CGF (PG) | 2011 | [DOI](https://doi.org/10.1111/j.1467-8659.2011.02063.x) | Real-time GI by cone tracing a voxel mip pyramid |
| Olsson, Billeter & Assarsson, *Clustered Deferred and Forward Shading* | HPG | 2012 | [DOI](https://doi.org/10.2312/EGGH/HPG12/087-096) | 3D light clusters for thousands of lights |
| Cigolle, Donow, Evangelakos, Mara, McGuire & Meyer, *A Survey of Efficient Representations for Independent Unit Vectors* | JCGT | 2014 | [JCGT](https://jcgt.org/published/0003/02/01/) | Octahedral normal encoding and its error analysis |
| McGuire & Mara, *Efficient GPU Screen-Space Ray Tracing* | JCGT | 2014 | [JCGT](https://jcgt.org/published/0003/04/04/) | Perspective-correct DDA marching for SSR |
| Peters & Klein, *Moment Shadow Mapping* | I3D | 2015 | [DOI](https://doi.org/10.1145/2699276.2699277) | Four moments, far less light bleeding |
| Jimenez, Wu, Pesce & Jarabo, *Practical Realtime Strategies for Accurate Indirect Occlusion* | Activision Tech. Report ATVI-TR-16-01 | 2016 | [report](https://research.activision.com/publications/archives/atvi-tr-16-01practical-realtime-strategies-for-accurate-indirect-occlusion) | GTAO: analytic horizon integral, multi-bounce AO |
| Majercik, Guertin, Nowrouzezahrai & McGuire, *Dynamic Diffuse Global Illumination with Ray-Traced Irradiance Fields* | JCGT | 2019 | [JCGT](https://jcgt.org/published/0008/02/01/) | DDGI probes with Chebyshev visibility |

Also influential, as talks without papers: Salvi, *An Excursion in Temporal Supersampling* (GDC 2016), which introduced variance clipping; Hable's *Uncharted 2: HDR Lighting* (GDC 2010), the filmic curve; Narkowicz's [ACES filmic tone mapping curve](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/) (2016); and the [Khronos PBR Neutral](https://github.com/KhronosGroup/ToneMapping) specification (2024).

## Learning resources

- Akenine-Möller, Haines, Hoffman et al., *Real-Time Rendering*, 4th edition (2018): chapters on shadows, AO, global illumination and tone mapping, with exhaustive references.
- **GAMES202** (Lingqi Yan): real-time high-quality rendering, covering shadows (PCSS, VSM, MSM), environment lighting with SH, SSAO/SSDO/SSR and real-time GI, in Chinese with English slides.
- The SIGGRAPH **Advances in Real-Time Rendering** course archive at [advances.realtimerendering.com](https://advances.realtimerendering.com/): where most of these techniques were first presented by the engine teams.
- [LearnOpenGL](https://learnopengl.com/): approachable deferred shading, SSAO, HDR and PBR chapters with code.
- Google's [Filament documentation](https://google.github.io/filament/Filament.html): a production PBR engine's design notes, including exposure, tone mapping and image-based lighting.
- [RenderDoc](https://renderdoc.org/): learn the frame structure of real games and of your own renderer by capturing frames.

## Exercises

1. Derive the GTAO slice integral $a = \tfrac12(\cos^2 e_1 + \cos^2 e_2)$ from the cosine-weighted AO definition, then compare it numerically with the Monte Carlo estimator on the height field in Section 3 at 4, 16 and 64 samples.

   <details markdown="1"><summary>Hint</summary>
   In slice coordinates $d\boldsymbol{\omega} = \vert\sin\theta\vert\,d\theta\,d\phi$, so the weight is $\cos\theta\vert\sin\theta\vert = \tfrac12\vert\sin 2\theta\vert$. Integrate from 0 to $h_i = \pi/2 - e_i$ on each side.
   </details>

2. For $n = 0.05$, $f = 500$ and $N = 4$ cascades, find the $\lambda$ that makes the first cascade end at 2 m. What is the worst texel-to-pixel ratio in each cascade?

3. Show that the VSM bound is exact for one planar occluder at depth $z_1$ covering a fraction $f$ of the kernel, over a receiver plane at depth $t$ (the rest of the kernel). Then show where it fails with two occluders.

   <details markdown="1"><summary>Hint</summary>
   With depths $z_1$ (fraction $f$) and $t$ (fraction $1-f$), compute $\mu$ and $\sigma^2$ and substitute into $\sigma^2/(\sigma^2 + (t-\mu)^2)$: the result is $1-f$. With two occluders the distribution has three atoms and two moments no longer determine it.
   </details>

4. Extend the SH code to bands $l \le 4$ (25 coefficients, using $\hat A_4 = -\pi/24$) and measure how much the irradiance error drops for an environment with a sun of 1° radius. Is it worth 16 more coefficients per channel?

5. Implement variance clipping in YCoCg and in RGB for a history colour that is a saturated red while the current neighbourhood is grey-blue. Compare the clipped colours and explain the difference.

   <details markdown="1"><summary>Hint</summary>
   In RGB the box is axis-aligned in a space where the channels are strongly correlated, so it contains colours the neighbourhood never had. YCoCg decorrelates luma from chroma, so the box hugs the neighbourhood more tightly.
   </details>

Next: [differentiable and inverse rendering]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }}). It covers how to take gradients through everything we have built so far, and how that turns rendering into an optimization problem.
