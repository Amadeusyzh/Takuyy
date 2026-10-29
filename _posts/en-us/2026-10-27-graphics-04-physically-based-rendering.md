---
layout: post
title: "Physically based rendering: radiometry, the rendering equation and GGX"
date: 2026-10-27 09:04:00+0900
description: "From watts to radiance, the rendering equation, BRDF properties, the GGX microfacet model, the metallic-roughness workflow and split-sum image-based lighting, with numerical checks and a GLSL shader."
categories: graphics
tags: [pbr, radiometry, rendering-equation, brdf, microfacet, ggx, ibl]
series: graphics
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## Why this matters

In the [previous post]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }}) we shaded surfaces with Lambert, Phong and Blinn-Phong. Those models look plausible, but their parameters (a "shininess" exponent, a specular color) have no physical meaning, they do not conserve energy, and an asset tuned under one light looks wrong under another. **Physically based rendering (PBR)** replaces them with quantities you can measure: radiance, a reflectance function that obeys physics, and a small set of material parameters that behave consistently under any lighting. This post is the theoretical core of the series: the rendering equation defined here is exactly what the path tracer in the [next post]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}) solves, and it is also the image formation model that neural renderers such as NeRF and 3D Gaussian Splatting approximate.

## Prerequisites

- Vectors, dot products and local frames from [post 1]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }}); the half vector and normal mapping from [post 3]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }}).
- Double integrals in spherical coordinates.
- Basic probability (expectation, probability density) helps for the split-sum section.

## 1. Radiometry: measuring light

Rendering is the simulation of how light energy moves through a scene, so we first need units. Light is treated with geometric optics: it travels in straight lines, and we ignore wave effects such as diffraction and interference.

### Solid angle

A planar angle is arc length divided by radius. A **solid angle** is the area that a set of directions covers on the unit sphere, measured in steradians (sr). The whole sphere is $4\pi$ sr and a hemisphere is $2\pi$ sr. In spherical coordinates (polar angle $\theta$ from the normal, azimuth $\phi$) the differential solid angle is

$$
d\omega = \sin\theta \, d\theta \, d\phi .
$$

A small surface patch of area $dA$ at distance $r$, whose normal makes an angle $\theta'$ with the line of sight, subtends

$$
d\omega = \frac{dA \cos\theta'}{r^2}.
$$

This identity lets us switch between integrating over directions and integrating over surfaces. We will use it for the area form of the rendering equation and again for light sampling in the next post.

The figure shows both formulas at work.

{% include blog_figure.liquid path="assets/img/blog/graphics/04-solid-angle.svg" caption="Left: the solid angle $d\omega=\sin\theta\,d\theta\,d\phi$ is the area of a small patch on the unit sphere; the $\sin\theta$ factor makes patches near the pole smaller. Right (2D slice): a surface patch $dA$ at distance $r$, tilted by $\theta'$, covers the solid angle $dA\cos\theta'/r^2$." %}

A useful integral appears everywhere in shading:

$$
\int_{\Omega} \cos\theta \, d\omega = \int_0^{2\pi}\!\!\int_0^{\pi/2} \cos\theta \sin\theta \, d\theta\, d\phi = \pi .
$$

This $\pi$ is the reason a Lambertian BRDF is $\rho/\pi$ and not $\rho$.

### Flux, irradiance, intensity, radiance

| Quantity | Symbol | Definition | Unit |
| --- | --- | --- | --- |
| Radiant flux (power) | $\Phi$ | energy per unit time | W |
| Irradiance (incoming) / radiant exitance (outgoing) | $E$, $M$ | $d\Phi / dA$ | W m$^{-2}$ |
| Radiant intensity | $I$ | $d\Phi / d\omega$ | W sr$^{-1}$ |
| Radiance | $L$ | $\dfrac{d^2\Phi}{dA\,\cos\theta\,d\omega}$ | W m$^{-2}$ sr$^{-1}$ |

**Radiance** is the quantity a camera pixel or your eye measures: power per unit *projected* area per unit solid angle. Two properties make it the right quantity to put on rays:

1. In a vacuum, radiance is **constant along a ray**. Moving a sensor away from a wall makes each pixel see a bigger patch, but that patch subtends a smaller solid angle, and the two effects cancel. This is why ray tracing can simply carry a radiance value along a path.
2. Every other quantity is an integral of radiance. For example, irradiance at a point with normal $n$ is

$$
E(x) = \int_{\Omega} L_i(x,\omega_i) \cos\theta_i \, d\omega_i .
$$

The $\cos\theta_i$ is Lambert's cosine law: a beam that arrives at a grazing angle spreads over a larger area.

As the figure shows, the same beam of width $w$ covers a strip of length $w/\cos\theta$, so the power per unit area drops by $\cos\theta$.

{% include blog_figure.liquid path="assets/img/blog/graphics/04-cosine-law.svg" caption="Lambert's cosine law. A beam of fixed width $w$ (and fixed power) arriving at $\theta=0^\circ$, $45^\circ$ and $70^\circ$ spreads over a footprint $w/\cos\theta$, so the irradiance $E$ falls off as $\cos\theta$." %}

A **point light** with intensity $I$ at distance $r$ produces irradiance $E = I\cos\theta / r^2$ (the inverse-square law). This is the `E = I * NoL / dist2` line in the shader at the end of this post. Note that "light color times intensity" in a real-time engine is usually exactly this $I$, possibly with photometric units (candela) instead of watts.

## 2. The BRDF

Light that arrives at a point either reflects, is transmitted, or is absorbed. For opaque surfaces, the **bidirectional reflectance distribution function (BRDF)** says how much of the irradiance arriving from direction $\omega_i$ is reflected as radiance toward $\omega_o$:

$$
f_r(x, \omega_i, \omega_o) = \frac{dL_o(x,\omega_o)}{dE_i(x,\omega_i)} = \frac{dL_o(x,\omega_o)}{L_i(x,\omega_i)\cos\theta_i \, d\omega_i} \quad [\text{sr}^{-1}].
$$

A physically plausible BRDF satisfies three properties:

- **Positivity:** $f_r \ge 0$.
- **Helmholtz reciprocity:** $f_r(\omega_i,\omega_o) = f_r(\omega_o,\omega_i)$. Light paths can be traced in either direction, which bidirectional algorithms rely on.
- **Energy conservation:** for every outgoing direction, the **directional albedo** is at most one,

$$
\rho(\omega_o) = \int_{\Omega} f_r(\omega_i,\omega_o)\cos\theta_i \, d\omega_i \le 1 .
$$

For the Lambertian BRDF $f_r = \rho/\pi$ we get $\rho(\omega_o) = (\rho/\pi)\cdot\pi = \rho$, so any albedo $\rho \le 1$ conserves energy. The classic Phong model, by contrast, violates both reciprocity and energy conservation for some parameter choices. The normalized Blinn-Phong lobe $\frac{s+8}{8\pi}(n\cdot h)^s$ was an early fix (see *Real-Time Rendering*), but microfacet theory gives a principled answer.

Generalizations: a BTDF describes transmission, a BSDF combines both, and a BSSRDF lets light enter at one point and exit at another (subsurface scattering in skin, marble and milk).

## 3. The rendering equation

The **reflection equation** follows directly from the BRDF definition: sum up reflected radiance over all incoming directions. Adding emission gives the **rendering equation**, introduced to graphics by Kajiya (SIGGRAPH 1986) and, in the same year, by Immel, Cohen and Greenberg:

$$
L_o(x,\omega_o) = L_e(x,\omega_o) + \int_{\Omega} f_r(x,\omega_i,\omega_o)\, L_i(x,\omega_i)\, \cos\theta_i \, d\omega_i .
$$

What makes it hard is that $L_i$ is not given. In a vacuum, the radiance that arrives at $x$ from $\omega_i$ is the radiance leaving the first surface point hit by the ray, $L_i(x,\omega_i) = L_o(\mathrm{trace}(x,\omega_i), -\omega_i)$. The unknown $L$ appears on both sides, so this is a Fredholm integral equation of the second kind.

The figure draws the integrand for one point $x$ under a toy sky with a sun.

{% include blog_figure.liquid path="assets/img/blog/graphics/04-rendering-eq.svg" caption="The integrand of the rendering equation at a point $x$ under a toy sky with a sun (star), drawn as incoming directions $\omega_i$ on the hemisphere; arrow length and color are proportional to the value. Left: $L_i\cos\theta_i$, whose integral is the irradiance $E$. Right: the same multiplied by a glossy GGX BRDF ($\alpha=0.3$) for the viewer $\omega_o$: only directions near the mirror direction of $\omega_o$ (here the sun) still contribute." %}

Kajiya wrote it in a **three-point (area) form**. Using $d\omega = dA\cos\theta'/r^2$ we can integrate over all scene surfaces $M$ instead of directions:

$$
L_o(x' \to x) = L_e(x' \to x) + \int_{M} f_r(x'' \to x' \to x)\, L_o(x'' \to x')\, G(x'', x')\, dA(x''),
$$

$$
G(x'',x') = V(x'',x')\,\frac{\cos\theta''\cos\theta'}{\lVert x''-x'\rVert^2},
$$

where $V$ is the binary visibility term. The area form is the natural starting point for light sampling ("next-event estimation") in the next post.

Writing the integral as a linear transport operator $\mathcal{T}$, the equation becomes $L = L_e + \mathcal{T}L$, and its solution is the Neumann series

$$
L = L_e + \mathcal{T}L_e + \mathcal{T}^2L_e + \cdots
$$

Each term is one more bounce: $L_e$ is light you see directly, $\mathcal{T}L_e$ is direct illumination, and higher terms are indirect (global) illumination. Rasterization with a local shading model computes only the first two terms. A path tracer estimates the whole series with Monte Carlo integration.

## 4. Microfacet theory

Real surfaces are rough at a scale smaller than a pixel but larger than the wavelength of light. Microfacet theory models such a surface as a large number of tiny, perfectly smooth mirrors (microfacets) with a statistical distribution of orientations. Three ingredients describe how this microsurface reflects light toward the viewer:

- $D(m)$: the **normal distribution function (NDF)**, the density of microfacet normals $m$;
- $F(\omega, m)$: the **Fresnel** reflectance of each smooth microfacet;
- $G_2(\omega_i,\omega_o,m)$: the **masking-shadowing** function, the fraction of microfacets that are visible from both the light and the viewer.

The figure shows all three on a real 2D height profile.

{% include blog_figure.liquid path="assets/img/blog/graphics/04-microfacet.svg" localized="true" caption="A random microfacet surface (2D profile; light at $70^\circ$ from the left, viewer at $50^\circ$ on the right). Only facets whose normal $m$ is close to the half vector $h$ (purple arrows) can mirror light from $\omega_i$ into $\omega_o$; $D$ measures how many there are. Some of them are shadowed (the ray to the light hits the surface, red) or masked (the ray to the viewer hits the surface, blue), which is what $G_2$ accounts for. Visibility is computed by tracing the rays against the profile." %}

### The Cook-Torrance specular BRDF

Only microfacets whose normal is the half vector $h = (\omega_i+\omega_o)/\lVert\omega_i+\omega_o\rVert$ can mirror light from $\omega_i$ into $\omega_o$. Following Walter et al. (EGSR 2007), the macroscopic BRDF is the integral over microfacets of each facet's contribution, weighted by its projected area and visibility:

$$
f_r(\omega_i,\omega_o) = \int_{\Omega} \frac{\lvert \omega_i\cdot m\rvert}{\lvert \omega_i\cdot n\rvert}\, f_\mu(\omega_i,\omega_o,m)\, \frac{\lvert \omega_o\cdot m\rvert}{\lvert \omega_o\cdot n\rvert}\, G_2(\omega_i,\omega_o,m)\, D(m)\, d\omega_m .
$$

For a perfect-mirror microfacet, $f_\mu$ is a delta distribution in $\omega_o$. Converting it into a delta over $m$ requires the Jacobian of the half-vector mapping,

$$
\left\lVert \frac{\partial \omega_h}{\partial \omega_o} \right\rVert = \frac{1}{4\,\lvert \omega_o\cdot h\rvert},
$$

which gives $f_\mu = F(\omega_i,m)\,\delta_\omega(m,h) / (4(\omega_i\cdot h)^2)$. Substituting and using $\omega_i\cdot h = \omega_o\cdot h$ collapses the integral:

$$
f_{\text{spec}}(\omega_i,\omega_o) = \frac{F(\omega_i,h)\; G_2(\omega_i,\omega_o,h)\; D(h)}{4\,\lvert n\cdot\omega_i\rvert\,\lvert n\cdot\omega_o\rvert}.
$$

This is the **Cook-Torrance** form (Cook and Torrance, TOG 1982, used a Beckmann NDF and a V-cavity $G$). The $4$ comes from the Jacobian, not from an arbitrary normalization. The two cosines in the denominator come from converting between projected microsurface and macrosurface areas. Real-time code often folds $G_2$ and the denominator together into a **visibility term** $V = G_2 / (4\lvert n\cdot\omega_i\rvert\lvert n\cdot\omega_o\rvert)$.

The figure plots the resulting lobes in 3D, using the GGX $D$ and the Smith visibility term defined below.

{% include blog_figure.liquid path="assets/img/blog/graphics/04-brdf-lobes.svg" localized="true" caption="3D lobes of $f_r(\omega_i,\omega_o)\cos\theta_o$ over all outgoing directions $\omega_o$, for light arriving at $\theta_i=45^\circ$ (each lobe scaled to the same size; $F=1$, height-correlated Smith $G_2$). Lambert is a sphere touching the surface. The GGX lobes concentrate around the mirror direction (dashed) as $\alpha$ decreases, and the perfect mirror is the delta-function limit. At $\alpha=1$ the microfacet normals are uniform and the lobe is broad and almost diffuse." %}

### The NDF must be normalized

$D$ is a density of *areas*. The projected area of all microfacets onto the macro surface must equal the macro area, which gives the normalization condition

$$
\int_{\Omega} D(m)\,(n\cdot m)\, d\omega_m = 1 .
$$

### GGX / Trowbridge-Reitz

The most widely used NDF today was derived by Trowbridge and Reitz (JOSA 1975) for ellipsoidal microfacets and rediscovered for graphics by Walter et al. (2007), who named it **GGX**:

$$
D_{\text{GGX}}(h) = \frac{\alpha^2}{\pi\left((n\cdot h)^2(\alpha^2-1)+1\right)^2}.
$$

Here $\alpha$ is the roughness. As $\alpha\to 0$, $D$ approaches a delta (a mirror). At $\alpha=1$ it becomes $D = 1/\pi$, a uniform distribution of microfacet normals. Compared with the Gaussian-like Beckmann distribution, GGX has a sharp peak and a **long tail**, which produces the bright highlight with a soft halo that measured materials show.

The figure compares the two distributions at the same $\alpha$.

{% include blog_figure.liquid path="assets/img/blog/graphics/04-ndf.svg" caption="GGX vs Beckmann NDF at $\alpha=0.2$ and $0.5$, as a function of the angle $\theta_h$ between $h$ and $n$. Near the peak they are similar (left), but on a log scale (right) Beckmann falls off like a Gaussian while GGX keeps a long tail, which gives highlights their soft halo. Both satisfy $\int D\,(n\cdot m)\,d\omega_m=1$ (checked numerically in the figure script)." %}

For anisotropic surfaces such as brushed metal, with tangent-frame components $h_x,h_y,h_z$ and roughness $\alpha_x,\alpha_y$:

$$
D(h) = \frac{1}{\pi\,\alpha_x\alpha_y\left(\frac{h_x^2}{\alpha_x^2}+\frac{h_y^2}{\alpha_y^2}+h_z^2\right)^2}.
$$

### Smith masking-shadowing

Heitz (JCGT 2014) showed that a consistent masking function is fixed by the NDF and by a microsurface profile assumption. Under the **Smith** assumption, which says that heights and normals are uncorrelated, the masking function for a direction $\omega$ is

$$
G_1(\omega,m) = \frac{\chi^+(\omega\cdot m)}{1+\Lambda(\omega)},
\qquad
\Lambda_{\text{GGX}}(\omega) = \frac{-1+\sqrt{1+\alpha^2\tan^2\theta}}{2},
$$

where $\chi^+$ is 1 for positive arguments and 0 otherwise. The function is consistent with the NDF in the sense that the visible projected area of microfacets always equals the projected area of the macrosurface:

$$
\int_{\Omega} G_1(\omega,m)\,\max(0,\omega\cdot m)\, D(m)\, d\omega_m = n\cdot\omega .
$$

There are two common ways to combine masking (view) and shadowing (light) into $G_2$:

- **Separable:** $G_2 = G_1(\omega_i)\,G_1(\omega_o)$. This treats the two events as independent and overestimates occlusion.
- **Height-correlated:** $G_2 = \dfrac{1}{1+\Lambda(\omega_i)+\Lambda(\omega_o)}$. A microfacet high on the surface is more likely to be both visible and lit, and Heitz recommends this form as more accurate. It costs about the same.

Substituting $\Lambda_{\text{GGX}}$ into the height-correlated $G_2$ and dividing by $4(n\cdot\omega_i)(n\cdot\omega_o)$ gives a compact visibility term (used by Filament and many engines):

$$
V(\omega_i,\omega_o) = \frac{0.5}{(n\cdot\omega_i)\sqrt{(n\cdot\omega_o)^2(1-\alpha^2)+\alpha^2} + (n\cdot\omega_o)\sqrt{(n\cdot\omega_i)^2(1-\alpha^2)+\alpha^2}} .
$$

To derive it, write $\tan^2\theta = (1-\cos^2\theta)/\cos^2\theta$, so that $1+\Lambda = \frac{1}{2}\left(1+\sqrt{\cos^2\theta(1-\alpha^2)+\alpha^2}/\cos\theta\right)$, and simplify.

The figure plots both forms.

{% include blog_figure.liquid path="assets/img/blog/graphics/04-smith-g.svg" localized="true" caption="Left: Smith masking $G_1$ for GGX. Smooth surfaces mask almost nothing until grazing angles, rough ones mask much earlier. Right: the separable product $G_1(\omega_i)G_1(\omega_o)$ (dashed) always lies below the height-correlated $G_2$ (solid), i.e. it overestimates occlusion." %}

### Fresnel and Schlick's approximation

The fraction of light that a smooth interface reflects increases toward grazing angles. Even a matte floor becomes mirror-like when you look along it. The exact Fresnel equations depend on the complex index of refraction and on polarization. Schlick (Computer Graphics Forum 1994) proposed the approximation

$$
F(\omega,h) \approx F_0 + (1-F_0)\,(1-\omega\cdot h)^5,
$$

where $F_0$ is the reflectance at normal incidence. For a dielectric with index of refraction $\eta$ in air,

$$
F_0 = \left(\frac{\eta-1}{\eta+1}\right)^2 ,
$$

so glass and most plastics ($\eta\approx 1.5$) give $F_0 = 0.04$, and water ($\eta\approx 1.33$) gives about $0.02$. Metals have a high $F_0$ that varies with wavelength, which is why gold and copper reflections are colored.

The figure compares Schlick's formula with the exact Fresnel equations.

{% include blog_figure.liquid path="assets/img/blog/graphics/04-fresnel.svg" localized="true" caption="Exact unpolarized Fresnel reflectance (solid) vs Schlick's approximation (dashed). Left: glass ($\eta=1.5$) and water ($\eta=1.33$) reflect only 2-4% head-on but everything at grazing angles. Right: gold, using approximate complex indices for R, G and B (after Johnson and Christy 1972): a high, colored $F_0$. Schlick misses the slight dip of the exact red curve near $80^\circ$, but is otherwise close." %}

To see how $D$, $V$ and $F$ work together, use the explorer below: drag inside it to move the light, and change roughness and metallic with the sliders.

{% include widget.liquid name="graphics-brdf-lobe" height="440" caption="BRDF lobe explorer: a cross-section of $f_r(\omega_i,\omega_o)\cos\theta_o$ in the plane of incidence for the metallic-roughness model of section 6 (GGX, height-correlated Smith, Schlick). Drag to move the light; the dashed line is the mirror direction." %}

## 5. Checking the math numerically

Before writing a shader, let us verify the normalization identities and run a **white furnace test**. In a furnace test the surface sits inside a uniform environment of radiance 1 with $F=1$, so the reflected radiance equals the directional albedo. A perfect specular model would return exactly 1 for every roughness.

```python
import numpy as np

def D_ggx(cos_h, alpha):
    """GGX / Trowbridge-Reitz NDF, isotropic. cos_h = n.h"""
    a2 = alpha * alpha
    d = cos_h * cos_h * (a2 - 1.0) + 1.0
    return a2 / (np.pi * d * d)

def Lambda_ggx(cos_v, alpha):
    """Smith Lambda for GGX: (-1 + sqrt(1 + alpha^2 tan^2 theta)) / 2"""
    tan2 = (1.0 - cos_v * cos_v) / (cos_v * cos_v)
    return 0.5 * (-1.0 + np.sqrt(1.0 + alpha * alpha * tan2))

def G1(cos_v, alpha):
    return 1.0 / (1.0 + Lambda_ggx(cos_v, alpha))

def G2_correlated(cos_l, cos_v, alpha):
    return 1.0 / (1.0 + Lambda_ggx(cos_l, alpha) + Lambda_ggx(cos_v, alpha))

# Midpoint quadrature grid over the upper hemisphere (theta, phi)
nt, nphi = 2048, 512
theta = (np.arange(nt) + 0.5) * (0.5 * np.pi / nt)
phi = (np.arange(nphi) + 0.5) * (2.0 * np.pi / nphi)
T, P = np.meshgrid(theta, phi, indexing="ij")
dw = np.sin(T) * (0.5 * np.pi / nt) * (2.0 * np.pi / nphi)   # d(omega) = sin(theta) dtheta dphi
dirs = np.stack([np.sin(T) * np.cos(P), np.sin(T) * np.sin(P), np.cos(T)], axis=-1)

print("1) projected-area normalization  int D(h) (n.h) dw_h  (should be 1)")
for alpha in [0.05, 0.2, 0.5, 1.0]:
    print(f"   alpha={alpha:4.2f}: {np.sum(D_ggx(np.cos(T), alpha) * np.cos(T) * dw):.5f}")

print("2) visible-normal normalization  int G1(v) <v.h> D(h) dw_h  vs  n.v")
alpha = 0.5
for theta_v in [0.0, 0.6, 1.2]:
    v = np.array([np.sin(theta_v), 0.0, np.cos(theta_v)])
    vh = np.clip(dirs @ v, 0.0, None)
    lhs = G1(np.cos(theta_v), alpha) * np.sum(vh * D_ggx(np.cos(T), alpha) * dw)
    print(f"   theta_v={theta_v:.1f}: lhs={lhs:.5f}  n.v={np.cos(theta_v):.5f}")

print("3) white furnace: directional albedo of the specular lobe with F = 1")
def spec_albedo(theta_v, alpha, correlated=True):
    v = np.array([np.sin(theta_v), 0.0, np.cos(theta_v)])
    l = dirs                                  # integrate over incident directions
    cos_l, cos_v = l[..., 2], np.cos(theta_v)
    h = l + v
    h /= np.linalg.norm(h, axis=-1, keepdims=True)
    D = D_ggx(h[..., 2], alpha)
    G = G2_correlated(cos_l, cos_v, alpha) if correlated else G1(cos_l, alpha) * G1(cos_v, alpha)
    f = D * G / (4.0 * cos_l * cos_v)         # Cook-Torrance with F = 1
    return np.sum(f * cos_l * dw)

for alpha in [0.1, 0.3, 0.6, 1.0]:
    a = [spec_albedo(t, alpha) for t in (0.0, 1.0, 1.4)]
    print(f"   alpha={alpha:3.1f}: E(theta_v=0, 1.0, 1.4) = " + ", ".join(f"{x:.3f}" for x in a))
print("   separable G at alpha=1.0, theta_v=1.4:", f"{spec_albedo(1.4, 1.0, correlated=False):.3f}")
```

Output (it runs in about two seconds):

```text
1) projected-area normalization  int D(h) (n.h) dw_h  (should be 1)
   alpha=0.05: 1.00002
   alpha=0.20: 1.00000
   alpha=0.50: 1.00000
   alpha=1.00: 1.00000
2) visible-normal normalization  int G1(v) <v.h> D(h) dw_h  vs  n.v
   theta_v=0.0: lhs=1.00000  n.v=1.00000
   theta_v=0.6: lhs=0.82534  n.v=0.82534
   theta_v=1.2: lhs=0.36236  n.v=0.36236
3) white furnace: directional albedo of the specular lobe with F = 1
   alpha=0.1: E(theta_v=0, 1.0, 1.4) = 0.988, 0.973, 0.894
   alpha=0.3: E(theta_v=0, 1.0, 1.4) = 0.877, 0.826, 0.850
   alpha=0.6: E(theta_v=0, 1.0, 1.4) = 0.592, 0.634, 0.781
   alpha=1.0: E(theta_v=0, 1.0, 1.4) = 0.307, 0.434, 0.672
   separable G at alpha=1.0, theta_v=1.4: 0.525
```

I cross-checked these albedos with an independent Monte Carlo estimate that samples visible normals (Heitz 2018), and the two agree to three decimals. Two lessons follow:

- The NDF and the Smith $G_1$ are exactly consistent, so the model *never creates* energy.
- It does **lose** energy at high roughness: up to 70% at $\alpha=1$. The lost light is the light that bounces more than once between microfacets, which a single-scattering model ignores. Rough metals therefore render too dark. Energy-compensation methods (Kulla and Conty, "Revisiting Physically Based Shading at Imageworks", SIGGRAPH 2017 course; Turquin 2019) add back a multiple-scattering lobe that is precomputed from tables such as `spec_albedo`. The separable $G_2$ loses even more energy (0.525 vs 0.672 in the last line).

The figure plots `spec_albedo` over all viewing angles; the dots are the values printed above.

{% include blog_figure.liquid path="assets/img/blog/graphics/04-furnace.svg" localized="true" caption="White furnace test of the GGX specular lobe ($F=1$): directional albedo vs viewing angle, computed with the quadrature code above (dots: the printed values). A lossless model would follow the line at 1. The gap is the energy lost to the ignored multiple scattering, and the separable $G_2$ (dashed) loses even more." %}

## 6. The metallic-roughness workflow

Artists should not have to type indices of refraction. Burley's Disney "principled" BRDF (SIGGRAPH 2012 course) and Karis's Unreal Engine 4 adaptation (SIGGRAPH 2013 course) popularized a small, intuitive parameter set, now standardized in glTF 2.0:

| Parameter | Range | Meaning |
| --- | --- | --- |
| `baseColor` | RGB in $[0,1]$ | albedo for dielectrics, $F_0$ for metals |
| `metallic` | $[0,1]$, almost always 0 or 1 | conductor or dielectric |
| `roughness` | $[0,1]$ | *perceptual* roughness $r$, with $\alpha = r^2$ |

The material is a blend of two physical cases:

- **Dielectric** (plastic, wood, skin): a white specular lobe with $F_0=0.04$, plus a diffuse lobe with albedo `baseColor`.
- **Metal**: free electrons absorb refracted light almost immediately, so there is **no diffuse lobe**, and `baseColor` becomes a colored $F_0$.

In code:

$$
F_0 = \mathrm{lerp}(0.04,\ \text{baseColor},\ \text{metallic}), \qquad c_{\text{diff}} = (1-\text{metallic})\,\text{baseColor},
$$

$$
f_r = \underbrace{(1-F)\,\frac{c_{\text{diff}}}{\pi}}_{\text{diffuse}} + \underbrace{D\,V\,F}_{\text{specular}} .
$$

The factor $(1-F)$ is a cheap way to keep energy that was already reflected specularly out of the diffuse lobe. It is an approximation; more careful layered models use the specular albedo instead. Squaring the roughness ($\alpha=r^2$) makes the slider perceptually linear. Burley observed that without it, most of the visible change would be packed into the low end of the slider.

The figure runs the shader from section 8 on a grid of spheres.

{% include blog_figure.liquid path="assets/img/blog/graphics/04-sphere-grid.svg" caption="The metallic-roughness model on a grid of spheres, rendered in NumPy with the shader of section 8 (one light from the upper left plus a uniform environment through the split-sum LUT; baseColor $=(0.95, 0.45, 0.12)$, $\alpha=r^2$). Top: dielectric, colored diffuse with a white highlight. Bottom: metal, no diffuse and a colored reflection. The highlight widens and dims as $r$ grows, and rough metals turn darker because of the single-scattering energy loss." %}

Two practical rules: textures for `baseColor` are stored in sRGB and must be decoded to linear before lighting, and all lighting math happens in linear HDR values, with tone mapping applied at the end.

## 7. Image-based lighting and the split-sum approximation

Point lights are only part of the story. A real environment surrounds the object with light from every direction, usually captured as an HDR environment map $L_{\text{env}}(\omega)$. Shading a pixel then requires the full reflection integral

$$
L_o(\omega_o) = \int_{\Omega} f_r(\omega_i,\omega_o)\, L_{\text{env}}(\omega_i)\cos\theta_i\, d\omega_i ,
$$

which is far too expensive to evaluate with hundreds of samples per pixel per frame.

**Diffuse part.** For a Lambertian lobe, $L_o = \frac{c_{\text{diff}}}{\pi}E(n)$, which depends only on the normal. We precompute an **irradiance map** $E(n)/\pi$ once per environment. In practice we store nine spherical-harmonic coefficients (Ramamoorthi and Hanrahan, SIGGRAPH 2001) or a tiny cubemap.

**Specular part.** The specular integral depends on $\omega_o$, $n$, roughness and $F_0$, which is too many dimensions to tabulate. Karis (2013) starts from the importance-sampled Monte Carlo estimator and splits it into a product of two sums:

$$
\frac{1}{N}\sum_{k=1}^{N} \frac{L_{\text{env}}(\omega_k)\, f_r(\omega_k,\omega_o)\cos\theta_k}{p(\omega_k)}
\;\approx\;
\left(\frac{1}{N}\sum_{k=1}^{N} L_{\text{env}}(\omega_k)\right)
\left(\frac{1}{N}\sum_{k=1}^{N}\frac{f_r(\omega_k,\omega_o)\cos\theta_k}{p(\omega_k)}\right).
$$

1. **Pre-filtered environment map.** The first factor is the environment convolved with the GGX lobe. Karis weights it by $\cos\theta_k$, which improves the result. To make it depend only on the reflection direction $r$, we assume $n = \omega_o = r$. One cubemap is stored per roughness level, using the mip chain: mip 0 holds the sharp mirror and the last mip holds the blurriest lobe. The assumption loses the stretched highlights you see at grazing angles, which is the main visible artifact of the method.
2. **Environment BRDF.** The second factor is the specular directional albedo under white light. With Schlick's Fresnel, $F_0$ factors out of the integral:

$$
\int_{\Omega} f_r\cos\theta_i\, d\omega_i = F_0 \underbrace{\int_{\Omega} \frac{f_r}{F}\left(1-(1-\omega_o\cdot h)^5\right)\cos\theta_i\, d\omega_i}_{A} \; + \; \underbrace{\int_{\Omega} \frac{f_r}{F}(1-\omega_o\cdot h)^5\cos\theta_i\, d\omega_i}_{B} .
$$

$A$ and $B$ depend only on $(n\cdot\omega_o,\ \text{roughness})$, so they fit in a small two-channel 2D lookup table (LUT). At runtime the specular IBL is just `prefiltered(r, roughness) * (F0 * A + B)`.

Here is the LUT integration in NumPy. It importance-samples the GGX NDF exactly as a GPU baking shader would. With $p(h) = D(h)(n\cdot h)$ and $p(\omega_i) = p(h)/(4\,\omega_o\cdot h)$, the NDF cancels in the weight:

```python
import numpy as np

def lambda_ggx(c, alpha):
    return 0.5 * (-1.0 + np.sqrt(1.0 + alpha**2 * (1.0 - c * c) / (c * c)))

def hammersley(n):
    i = np.arange(n, dtype=np.uint32)
    b = i.copy()                                   # radical inverse base 2 (bit reversal)
    b = ((b << 16) | (b >> 16)).astype(np.uint32)
    b = (((b & 0x55555555) << 1) | ((b & 0xAAAAAAAA) >> 1)).astype(np.uint32)
    b = (((b & 0x33333333) << 2) | ((b & 0xCCCCCCCC) >> 2)).astype(np.uint32)
    b = (((b & 0x0F0F0F0F) << 4) | ((b & 0xF0F0F0F0) >> 4)).astype(np.uint32)
    b = (((b & 0x00FF00FF) << 8) | ((b & 0xFF00FF00) >> 8)).astype(np.uint32)
    return (i + 0.5) / n, b * 2.3283064365386963e-10

def integrate_brdf(n_dot_v, roughness, n=4096):
    """Split-sum LUT entry (A, B): int f*cos = F0 * A + B for a Schlick-Fresnel GGX lobe."""
    alpha = roughness * roughness                  # perceptual roughness -> alpha
    v = np.array([np.sqrt(1.0 - n_dot_v**2), 0.0, n_dot_v])
    u1, u2 = hammersley(n)
    # sample h proportional to D(h) (n.h)  (GGX NDF importance sampling)
    cos_h = np.sqrt((1.0 - u1) / (1.0 + (alpha**2 - 1.0) * u1))
    sin_h = np.sqrt(1.0 - cos_h**2)
    phi = 2.0 * np.pi * u2
    h = np.stack([sin_h * np.cos(phi), sin_h * np.sin(phi), cos_h], axis=-1)
    v_dot_h = h @ v
    l = 2.0 * v_dot_h[:, None] * h - v             # reflect v about h
    n_dot_l = l[:, 2]
    ok = n_dot_l > 0.0
    nl, vh, nh = n_dot_l[ok], v_dot_h[ok], cos_h[ok]
    G2 = 1.0 / (1.0 + lambda_ggx(nl, alpha) + lambda_ggx(n_dot_v, alpha))
    # f*cos/pdf with pdf(l) = D (n.h) / (4 v.h):  D cancels
    w = G2 * vh / (nh * n_dot_v)
    fc = (1.0 - vh) ** 5
    return np.sum((1.0 - fc) * w) / n, np.sum(fc * w) / n

if __name__ == "__main__":
    for r in [0.25, 0.5, 1.0]:
        for nv in [0.1, 0.5, 1.0]:
            A, B = integrate_brdf(nv, r)
            print(f"roughness={r:4.2f} n.v={nv:3.1f}  A={A:.3f} B={B:.3f}  A+B={A+B:.3f}")
```

```text
roughness=0.25 n.v=0.1  A=0.510 B=0.391  A+B=0.901
roughness=0.25 n.v=0.5  A=0.955 B=0.033  A+B=0.988
roughness=0.25 n.v=1.0  A=0.996 B=0.000  A+B=0.996
roughness=0.50 n.v=0.1  A=0.747 B=0.140  A+B=0.887
roughness=0.50 n.v=0.5  A=0.834 B=0.022  A+B=0.857
roughness=0.50 n.v=1.0  A=0.916 B=0.000  A+B=0.916
roughness=1.00 n.v=0.1  A=0.737 B=0.024  A+B=0.760
roughness=1.00 n.v=0.5  A=0.448 B=0.003  A+B=0.451
roughness=1.00 n.v=1.0  A=0.307 B=0.000  A+B=0.307
```

$A+B$ is the furnace albedo with $F_0=1$. It matches the quadrature from section 5: roughness 1 and $n\cdot v = 1$ gives 0.307 in both. Notice how $B$, the Fresnel boost, grows at grazing angles for smooth surfaces. That is the bright rim you see on real objects. Karis's original code uses a Schlick-GGX approximation of $G$ with $k=\alpha/2$ for IBL, so its LUT differs slightly from this height-correlated version. Pick one $G$ and use it both for analytic lights and for the LUT.

The figure shows the complete LUT computed with `integrate_brdf`.

{% include blog_figure.liquid path="assets/img/blog/graphics/04-split-sum-lut.svg" caption="The split-sum environment-BRDF LUT computed with `integrate_brdf` above ($32\times32$ entries, 1024 samples each). $A$, the scale of $F_0$, is close to 1 for smooth surfaces seen head-on and drops for rough ones. $B$, the Fresnel bias, is large only at grazing angles ($n\cdot\omega_o\to 0$) on smooth surfaces: the bright rim." %}

## 8. A complete GLSL implementation

The fragment shader below implements everything above: GGX, the height-correlated Smith visibility term, Schlick's Fresnel, the metallic-roughness parameterization, point lights with the inverse-square law, and split-sum IBL. It compiles as GLSL 3.30 (and as GLSL ES 3.00 for WebGL 2 if you change the version line and add `precision highp float;`).

```glsl
#version 330 core
// Metallic-roughness PBR: GGX + height-correlated Smith + Schlick, plus split-sum IBL.
in vec3 vWorldPos;
in vec3 vNormal;
out vec4 fragColor;

uniform vec3  uCamPos;
uniform vec3  uBaseColor;     // linear RGB
uniform float uMetallic;      // 0 = dielectric, 1 = metal
uniform float uRoughness;     // perceptual roughness in [0, 1]
uniform int   uNumLights;
uniform vec3  uLightPos[4];
uniform vec3  uLightIntensity[4];   // radiant intensity I (W/sr), RGB
uniform samplerCube uIrradianceMap; // E(n)/pi, i.e. cosine-convolved radiance
uniform samplerCube uPrefilterMap;  // GGX-prefiltered radiance, roughness -> mip
uniform sampler2D   uBrdfLut;       // (A, B) indexed by (n.v, roughness)
uniform float uMaxMip;

const float PI = 3.14159265359;

float D_GGX(float NoH, float a) {
    float a2 = a * a;
    float d = NoH * NoH * (a2 - 1.0) + 1.0;
    return a2 / (PI * d * d);
}

// V = G2 / (4 NoL NoV) with the height-correlated Smith G2 for GGX
float V_SmithGGXCorrelated(float NoV, float NoL, float a) {
    float a2 = a * a;
    float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
    float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
    return 0.5 / (gv + gl);
}

vec3 F_Schlick(float VoH, vec3 F0) {
    return F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
}

void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(uCamPos - vWorldPos);
    float NoV = max(dot(n, v), 1e-4);
    float a = max(uRoughness * uRoughness, 1e-3);   // alpha = roughness^2
    vec3 F0 = mix(vec3(0.04), uBaseColor, uMetallic);
    vec3 diffuseColor = (1.0 - uMetallic) * uBaseColor;

    vec3 Lo = vec3(0.0);
    for (int i = 0; i < 4; ++i) {
        if (i >= uNumLights) break;
        vec3 toLight = uLightPos[i] - vWorldPos;
        float dist2 = dot(toLight, toLight);
        vec3 l = toLight * inversesqrt(dist2);
        vec3 h = normalize(v + l);
        float NoL = max(dot(n, l), 0.0);
        if (NoL <= 0.0) continue;
        float NoH = max(dot(n, h), 0.0);
        float VoH = max(dot(v, h), 0.0);

        vec3  F = F_Schlick(VoH, F0);
        vec3  spec = D_GGX(NoH, a) * V_SmithGGXCorrelated(NoV, NoL, a) * F;
        vec3  diff = (1.0 - F) * diffuseColor / PI;
        vec3  E = uLightIntensity[i] * NoL / dist2;  // irradiance from a point light
        Lo += (diff + spec) * E;
    }

    // image-based lighting (split sum)
    vec3 r = reflect(-v, n);
    vec3 prefiltered = textureLod(uPrefilterMap, r, uRoughness * uMaxMip).rgb;
    vec2 AB = texture(uBrdfLut, vec2(NoV, uRoughness)).rg;
    vec3 specIBL = prefiltered * (F0 * AB.x + AB.y);
    vec3 diffIBL = diffuseColor * texture(uIrradianceMap, n).rgb;
    Lo += diffIBL + specIBL;

    fragColor = vec4(Lo, 1.0);   // linear HDR; tone map + sRGB encode in a later pass
}
```

Notes on the details:

- `a` is clamped to $10^{-3}$. At $\alpha=0$, the NDF becomes a delta that a point light can never hit, and `V` divides by zero.
- The analytic lights are evaluated as $f_r \cdot E$, where $E = I\cos\theta/r^2$. This is the rendering equation integral collapsed by a delta light, and the reason PBR shaders have no "multiply by $\pi$" fudge factors.
- Mapping roughness linearly to mip level is the simplest choice. Engines often use a nonlinear mapping matched to how the prefilter was baked.
- In a production engine you would add normal mapping (post 3), ambient and specular occlusion, and the multiple-scattering compensation from section 5.

## Try it

The path tracer in the [lab on the home page]({{ '/' | relative_url }}#lab) uses exactly this GGX microfacet BRDF, with visible-normal sampling (Heitz 2018). Click a sphere to select it, then:

- Switch between the **diffuse**, **plastic** and **metal** presets. Plastic adds a white $F_0=0.04$ lobe on top of a colored diffuse base, while metal has no diffuse lobe and a colored reflection.
- Drag the **roughness** slider. The highlight widens and dims as $\alpha$ grows, because the integral of $D$ stays fixed while it spreads. **Mirror** is the $\alpha\to 0$ limit.
- Try **glass** and **frosted**. Frosted glass is the rough *transmission* case of microfacet theory (Walter et al. 2007).
- Look at a rough metal sphere against the walls. It looks slightly darker than you might expect, which is the single-scattering energy loss measured in section 5.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Kajiya, *The Rendering Equation* | SIGGRAPH | 1986 | [DOI](https://doi.org/10.1145/15922.15902) | Unifies rendering algorithms as solutions of one integral equation; introduces path tracing |
| Cook & Torrance, *A Reflectance Model for Computer Graphics* | ACM TOG 1(1) | 1982 | [DOI](https://doi.org/10.1145/357290.357293) | The $DFG/(4\cos\cos)$ microfacet BRDF used to this day |
| Trowbridge & Reitz, *Average irregularity representation of a rough surface for ray reflection* | JOSA | 1975 | — | Origin of the distribution now called GGX |
| Schlick, *An Inexpensive BRDF Model for Physically-based Rendering* | Computer Graphics Forum 13(3) | 1994 | [DOI](https://doi.org/10.1111/1467-8659.1330233) | The $(1-\cos)^5$ Fresnel approximation |
| Walter, Marschner, Li & Torrance, *Microfacet Models for Refraction through Rough Surfaces* | EGSR | 2007 | [DOI](https://doi.org/10.2312/EGWR/EGSR07/195-206) | GGX, the general microfacet derivation, rough transmission |
| Burley, *Physically-Based Shading at Disney* | SIGGRAPH course | 2012 | [page](https://disneyanimation.com/publications/physically-based-shading-at-disney) | Principled, artist-friendly parameters; $\alpha = r^2$ |
| Karis, *Real Shading in Unreal Engine 4* | SIGGRAPH course | 2013 | [course page](https://blog.selfshadow.com/publications/s2013-shading-course/) | The real-time metallic-roughness model and split-sum IBL |
| Heitz, *Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs* | JCGT 3(2) | 2014 | [JCGT](https://jcgt.org/published/0003/02/03/) | Derives Smith $G_1$ and height-correlated $G_2$ rigorously |
| Heitz, *Sampling the GGX Distribution of Visible Normals* | JCGT 7(4) | 2018 | [JCGT](https://jcgt.org/published/0007/04/01/) | Low-variance sampling of GGX, used in every modern path tracer |
| Kulla & Conty, *Revisiting Physically Based Shading at Imageworks* | SIGGRAPH course | 2017 | — | Energy compensation for multiple scattering |

## Learning resources

- **GAMES101** (Lingqi Yan), lectures on radiometry, the rendering equation and materials: [course page](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html). **GAMES202** covers real-time PBR materials, the split sum and multiple-scattering compensation: [course page](https://sites.cs.ucsb.edu/~lingqi/teaching/games202.html).
- **Physically Based Rendering: From Theory to Implementation** (PBRT, 4th ed., free online): chapter 4 for radiometry and [section 9.6 on microfacet theory](https://pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory).
- **Real-Time Rendering**, 4th ed., chapters 9 (physically based shading) and 10 (local illumination and IBL): [realtimerendering.com](https://www.realtimerendering.com/).
- **LearnOpenGL** PBR chapters, a complete working implementation: [Theory](https://learnopengl.com/PBR/Theory) and [Specular IBL](https://learnopengl.com/PBR/IBL/Specular-IBL).
- **Filament** documentation by Google, a very clear derivation-heavy engine document: [Physically Based Rendering in Filament](https://google.github.io/filament/Filament.md.html).
- **Berkeley CS184** lectures on radiometry and material models: [cs184.eecs.berkeley.edu](https://cs184.eecs.berkeley.edu/).

## Exercises

1. Show that $\int_\Omega D_{\text{GGX}}(m)(n\cdot m)\,d\omega_m = 1$ analytically. Hint: substitute $u = \cos^2\theta$.
2. Extend `D_ggx` to the anisotropic form and verify its normalization numerically for $\alpha_x=0.2$, $\alpha_y=0.6$.
3. Run the furnace test with Schlick's Fresnel and a plastic material (diffuse $\rho=1$ plus specular $F_0=0.04$). Does the total albedo exceed 1 at grazing angles with the $(1-F)$ coupling? Without it?
4. Bake the full $32\times 32$ split-sum LUT with `integrate_brdf`, save it as a PNG, and compare it with the one in LearnOpenGL. Explain the differences that come from the choice of $G$.
5. (Harder) Implement Kulla-Conty energy compensation: tabulate $E(\mu)$ with `spec_albedo`, compute its cosine-weighted average $E_{\text{avg}} = 2\int_0^1 E(\mu)\,\mu\,d\mu$, and add the lobe $f_{\text{ms}} = \frac{(1-E(\mu_o))(1-E(\mu_i))}{\pi(1-E_{\text{avg}})}$. Check that the furnace test now returns 1.

**Next:** in [post 5]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}) we stop approximating and solve the rendering equation with Monte Carlo path tracing: importance sampling, next-event estimation and multiple importance sampling.
