---
layout: post
title: "Volumes and participating media: fog, smoke, clouds, sky and skin"
date: 2026-10-27 09:10:00+0900
description: "Extinction and albedo, Beer-Lambert transmittance, the radiative transfer equation, phase functions with sampling code, ray marching, delta and ratio tracking, volumetric path tracing, OpenVDB, real-time fog, sky and clouds, subsurface scattering, and why NeRF's alpha compositing is a quadrature of the same integral."
categories: graphics
tags: [volume-rendering, participating-media, phase-function, delta-tracking, subsurface-scattering, sky]
series: graphics
series_order: 10
toc:
  sidebar: left
related_posts: false
---

## Why this matters

Until now every ray in this series travelled through a vacuum and interacted with light only at surfaces. Real scenes are full of **participating media** (light-carrying volumes): fog, smoke, fire, clouds, the atmosphere that colours the sky, murky water, and the inside of skin, marble and milk. In these media light is absorbed and scattered *everywhere along the ray*, not just at a boundary. This chapter extends the rendering equation of [post 04]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}) and the Monte Carlo machinery of [post 05]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}) to volumes. It is also the physics underneath neural rendering. The volume rendering integral of [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) and the alpha blending of [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) are special cases of what we derive here (Section 11).

## Prerequisites

- Radiance, the BRDF and the rendering equation ([post 04]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})).
- Monte Carlo integration, importance sampling, next-event estimation and Russian roulette ([post 05]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})).
- Basic probability: exponential distributions, inverse-CDF sampling, Poisson processes (we recall what we need).

## 1. What happens to light inside a medium

Picture a thin beam of light passing through a cloud of tiny particles. Over a small distance $dt$ three things can happen to the photons in the beam, and one thing can add photons to it:

1. **Absorption**: a particle swallows the photon and turns its energy into heat. The probability per unit length is the **absorption coefficient** $\sigma_a(\mathbf{x})$, in units of 1/m.
2. **Out-scattering**: a particle deflects the photon into another direction. It leaves *this* beam, with probability per unit length $\sigma_s(\mathbf{x})$, the **scattering coefficient**.
3. **In-scattering**: photons from other beams are deflected *into* this beam. This is how fog glows when a headlight shines through it.
4. **Emission**: the medium itself emits light (fire, hot gas), with emitted radiance $L_e$.

Absorption and out-scattering both remove energy from the beam, so they combine into the **extinction coefficient** (attenuation coefficient)

$$
\sigma_t = \sigma_a + \sigma_s .
$$

Two derived quantities are used everywhere. The **single-scattering albedo** $\rho = \sigma_s/\sigma_t \in [0,1]$ is the probability that an interaction is a scattering event rather than absorption: clouds have $\rho \approx 0.99$ or higher, soot is close to $0$. The **mean free path** $1/\sigma_t$ is the average distance between interactions. A coefficient is "per unit length", so its value depends on the scene's units: $\sigma_t = 0.05\ \text{m}^{-1}$ is light fog (mean free path 20 m), while $\sigma_t = 50\ \text{m}^{-1}$ is a thick cloud (2 cm).

Physically, $\sigma = n\,C$: the number density $n$ of particles times their cross-section $C$. Renderers usually store a **density** field $d(\mathbf{x})$ and multiply it by per-material coefficients, $\sigma_t(\mathbf{x}) = d(\mathbf{x})\,\sigma_t^{\text{mat}}$. Coefficients can depend on wavelength (RGB triples here), which is why the sky is blue (Section 9).

## 2. Transmittance and the Beer-Lambert law

### 2.1 Derivation

Follow a beam of radiance $L$ along a ray $\mathbf{x}(t) = \mathbf{o} + t\boldsymbol{\omega}$, ignoring in-scattering and emission for now. Over a step $dt$ a fraction $\sigma_t\,dt$ of the beam is removed:

$$
dL = -\sigma_t(t)\,L\,dt
\quad\Longrightarrow\quad
\frac{dL}{L} = -\sigma_t(t)\,dt
\quad\Longrightarrow\quad
\ln L(t) - \ln L(0) = -\int_0^t \sigma_t(s)\,ds .
$$

Exponentiating gives the fraction that survives, the **transmittance**:

$$
T(t) = \frac{L(t)}{L(0)} = \exp\!\big(-\tau(t)\big),
\qquad
\tau(t) = \int_0^t \sigma_t(s)\,ds .
$$

$\tau$ is the **optical depth** (optical thickness): a dimensionless count of how many mean free paths the ray crosses. In a **homogeneous** medium (constant $\sigma_t$), $\tau = \sigma_t t$ and we get the **Beer-Lambert law** $T = e^{-\sigma_t t}$.

Two properties matter for everything that follows:

- **Multiplicativity**: $T(0 \to b) = T(0 \to a)\,T(a \to b)$, because optical depths add. This is what lets us march along a ray and update $T$ step by step.
- **Order independence**: only the integral of $\sigma_t$ matters, not where along the ray the density sits.

{% include blog_figure.liquid path="assets/img/blog/graphics/10-beer-lambert.svg" caption="Beer-Lambert transmittance for four extinction coefficients. (a) Linear axes: the dots mark one mean free path d = 1/σt, where every curve passes through e⁻¹ ≈ 0.37 (dashed). (b) Log axis: exponential decay becomes a straight line with slope −σt, so doubling σt doubles the slope." %}

**Worked example.** Fog with $\sigma_t = 0.5\ \text{m}^{-1}$: after $d = 2$ m, $T = e^{-1} = 0.368$; after 10 m, $T = e^{-5} = 0.0067$, which is why objects 10 m away vanish. Now a heterogeneous ray made of three 1 m segments with $\sigma_t = 0.2, 1.0, 0.4$: $\tau = 0.2 + 1.0 + 0.4 = 1.6$ and $T = e^{-1.6} = 0.202$. Shuffle the segments and $T$ stays the same.

### 2.2 Heterogeneous media

For smoke or clouds $\sigma_t(\mathbf{x})$ varies, and $\tau$ is an integral we have to evaluate numerically. The figure below shows a one-dimensional density with three bumps, its optical depth and its transmittance. Most of the drop in $T$ happens inside the bumps. A homogeneous medium with the same *average* extinction ends at the same $T(10)$ but follows a different path in between, so averaging density loses information about *where* light gets attenuated.

{% include blog_figure.liquid path="assets/img/blog/graphics/10-heterogeneous-transmittance.svg" caption="A heterogeneous ray. (a) Extinction σt(t) with three bumps; the dashed line is the mean, the dotted line the maximum (used later as a majorant). (b) Transmittance T = e^−τ (purple) falls in steps where the density is high; the optical depth τ(t) (gray, right axis) is the running integral. The homogeneous curve with the same mean (orange, dashed) meets it only at the end." %}

```python
import numpy as np

def sigma_t(t):
    """Heterogeneous extinction along a ray of length 10 (1/m)."""
    return (0.1 + 1.0 * np.exp(-((t - 2.0) / 0.45) ** 2)
            + 0.6 * np.exp(-((t - 5.2) / 0.8) ** 2)
            + 1.6 * np.exp(-((t - 7.4) / 0.25) ** 2))

t = np.linspace(0.0, 10.0, 10001)
s = sigma_t(t)
tau = np.concatenate([[0.0], np.cumsum(0.5 * (s[1:] + s[:-1]) * np.diff(t))])  # trapezoid rule
T = np.exp(-tau)
print(f"tau(10) = {tau[-1]:.3f}, T(10) = {T[-1]:.4f}")   # tau(10) = 3.357, T(10) = 0.0348
print(np.exp(-(0.2 + 1.0 + 0.4)))                        # 0.2019, the three-segment example
```

Each Gaussian bump integrates to amplitude × width × $\sqrt{\pi}$, so the exact optical depth is $1.0 + (0.45 + 0.48 + 0.40)\sqrt{\pi} = 3.357$: the quadrature agrees.

## 3. The radiative transfer equation

Now put all four processes together. Let $L(\mathbf{x}, \boldsymbol{\omega})$ be the radiance at $\mathbf{x}$ travelling in direction $\boldsymbol{\omega}$. The change of $L$ per unit length along $\boldsymbol{\omega}$ is the **radiative transfer equation** (RTE):

$$
(\boldsymbol{\omega}\cdot\nabla) L(\mathbf{x},\boldsymbol{\omega})
= \underbrace{-\sigma_t(\mathbf{x})\,L(\mathbf{x},\boldsymbol{\omega})}_{\text{absorption + out-scattering}}
+ \underbrace{\sigma_a(\mathbf{x})\,L_e(\mathbf{x},\boldsymbol{\omega})}_{\text{emission}}
+ \underbrace{\sigma_s(\mathbf{x}) \int_{S^2} p(\boldsymbol{\omega}', \boldsymbol{\omega})\, L(\mathbf{x},\boldsymbol{\omega}')\, d\boldsymbol{\omega}'}_{\text{in-scattering}} .
$$

Here $S^2$ is the sphere of directions, $\boldsymbol{\omega}'$ is the direction in which incoming light travels, and the **phase function** $p(\boldsymbol{\omega}', \boldsymbol{\omega})$ (Section 4) is the probability density (per steradian) that light travelling along $\boldsymbol{\omega}'$ continues along $\boldsymbol{\omega}$ after scattering. It plays the role the BRDF plays at surfaces. Writing emission as $\sigma_a L_e$ follows pbrt's convention: a medium that absorbs well also emits well. We abbreviate the in-scattered radiance as

$$
L_s(\mathbf{x},\boldsymbol{\omega}) = \int_{S^2} p(\boldsymbol{\omega}', \boldsymbol{\omega})\, L(\mathbf{x},\boldsymbol{\omega}')\, d\boldsymbol{\omega}' .
$$

### 3.1 The integral form: the volume rendering equation

The RTE is a linear first-order ODE along the ray, $\frac{dL}{dt} = -\sigma_t L + q$ with source $q = \sigma_a L_e + \sigma_s L_s$. Solving it with the integrating factor $e^{\tau}$, exactly as one solves $y' + a y = q$, gives the **volume rendering equation**. A camera at $\mathbf{o}$ looks along $\boldsymbol{\omega}$, the ray hits a surface at distance $d$, and $\mathbf{x}_t = \mathbf{o} + t\boldsymbol{\omega}$:

$$
L(\mathbf{o}, -\boldsymbol{\omega}) =
\int_0^{d} T(t)\,\Big[\sigma_a(\mathbf{x}_t)\,L_e(\mathbf{x}_t) + \sigma_s(\mathbf{x}_t)\,L_s(\mathbf{x}_t, -\boldsymbol{\omega})\Big]\,dt
\;+\; T(d)\,L_{\text{surf}}(\mathbf{x}_d, -\boldsymbol{\omega}),
$$

with $T(t) = \exp(-\int_0^t \sigma_t\,ds)$ measured from the camera. Read it as: *the light that reaches the eye is the light added at every point along the ray, each contribution dimmed by the transmittance between that point and the eye, plus the background surface dimmed by the transmittance of the whole segment*. This was introduced to graphics by Kajiya and Von Herzen (1984); Max (1995) surveys the optical models used in scientific volume visualization.

Two special cases are worth naming now:

- **Emission-absorption only** ($\sigma_s = 0$): $L = \int T\,\sigma_a L_e\,dt + T(d)L_{\text{surf}}$. No recursion, so the integral can be computed in one pass. This is exactly the model of NeRF (Section 11).
- **Single scattering**: approximate $L_s$ using only light that arrives *directly* from the light sources, attenuated by a **shadow ray** transmittance. This is what real-time fog and many sky models compute (Sections 5 and 9).

The full equation is recursive, since $L_s$ contains $L$ itself. It describes **multiple scattering**, which is what makes clouds white and soft instead of grey and hard-edged (Section 7).

## 4. Phase functions

### 4.1 Intuition and normalization

When a photon scatters, where does it go next? For media that are statistically the same in every orientation (randomly oriented particles), the answer depends only on the **scattering angle** $\theta$ between the incoming travel direction $\boldsymbol{\omega}'$ and the outgoing one $\boldsymbol{\omega}$: $p(\boldsymbol{\omega}', \boldsymbol{\omega}) = p(\cos\theta)$ with $\cos\theta = \boldsymbol{\omega}'\cdot\boldsymbol{\omega}$. Unlike a BRDF, a phase function is a probability density, so it integrates to one:

$$
\int_{S^2} p(\boldsymbol{\omega}'\cdot\boldsymbol{\omega})\,d\boldsymbol{\omega} = 2\pi\int_{-1}^{1} p(\mu)\,d\mu = 1, \qquad \mu = \cos\theta .
$$

Energy loss is handled by the albedo, not by the phase function. The simplest choice is **isotropic** scattering, $p = 1/(4\pi)$: all directions are equally likely.

The **mean cosine** $g = \langle\cos\theta\rangle = 2\pi\int_{-1}^{1} \mu\, p(\mu)\,d\mu$ summarizes the shape. $g>0$ means **forward scattering** (most photons keep going roughly straight, as in clouds and fog, with $g \approx 0.8$-$0.9$), $g<0$ means **back scattering**, and $g=0$ is isotropic on average.

### 4.2 Henyey-Greenstein

The workhorse of graphics is the **Henyey-Greenstein** (HG) phase function, introduced in 1941 for interstellar dust:

$$
p_{HG}(\mu; g) = \frac{1}{4\pi}\,\frac{1-g^2}{\left(1+g^2-2g\mu\right)^{3/2}}, \qquad -1 < g < 1 .
$$

Its single parameter is exactly the mean cosine $g$, which makes it easy to fit to measurements. It reduces to isotropic for $g=0$, and the ratio of forward to backward scattering is $p(1)/p(-1) = \big((1+g)/(1-g)\big)^3$.

**Worked example** ($g = 0.6$): $p(0) = \frac{1}{4\pi}\cdot\frac{0.64}{0.16^{3/2}}$ $= 0.0796 \cdot 0.64 / 0.064 = 0.796$ and $p(\pi) = 0.0796 \cdot 0.64/2.56^{3/2} = 0.0124$. The ratio is $64 = (1.6/0.4)^3$. Compare with $1/(4\pi) = 0.0796$ for isotropic scattering.

{% include blog_figure.liquid path="assets/img/blog/graphics/10-hg-lobes.svg" caption="Henyey-Greenstein lobes. (a) 4π·p(θ) on a logarithmic radius for g from −0.3 to 0.85. Light travels from left to right (yellow arrow); the isotropic g = 0 curve is the circle at radius 1. Positive g stretches the lobe forward, negative g backward. (b) 500 directions sampled with the inverse CDF below for g = 0.7, drawn on the unit sphere: they crowd around the direction of travel, and their mean cosine is close to 0.7." %}

**Importance sampling HG.** In a path tracer we need to *sample* a new direction with density $p$. The azimuth $\phi$ is uniform in $[0, 2\pi)$. For $\mu$ we invert the CDF of the marginal density $2\pi p(\mu)$:

$$
P(\mu) = 2\pi\int_{-1}^{\mu} p_{HG}(\mu')\,d\mu'
= \frac{1-g^2}{2g}\left[\frac{1}{\sqrt{1+g^2-2g\mu}} - \frac{1}{1+g}\right].
$$

Check the endpoints: $P(-1) = 0$, and at $\mu = 1$ the bracket is $\frac{1}{1-g} - \frac{1}{1+g} = \frac{2g}{1-g^2}$, so $P(1) = 1$. Setting $P(\mu) = \xi$ with $\xi$ uniform in $[0,1)$ and solving:

$$
\sqrt{1+g^2-2g\mu} = \frac{1-g^2}{1-g+2g\xi}
\quad\Longrightarrow\quad
\mu = \frac{1}{2g}\left[1 + g^2 - \left(\frac{1-g^2}{1-g+2g\xi}\right)^2\right] .
$$

For $\vert g\vert \approx 0$ use $\mu = 1-2\xi$ to avoid dividing by zero. Since the sample is drawn exactly from $p$, the path-tracing weight $p/\text{pdf}$ is 1. **Worked example**: $g = 0.6$, $\xi = 0.5$ gives $\frac{0.64}{1.0} = 0.64$, then $\mu = (1.36 - 0.4096)/1.2 = 0.792$: half of all scattered photons deviate by less than $37.6^\circ$.

```python
import numpy as np

def hg(cos_t, g):
    return (1 - g * g) / (4 * np.pi * (1 + g * g - 2 * g * cos_t) ** 1.5)

def sample_hg(g, xi):
    """Inverse-CDF sample of cos(theta); theta is measured from the direction of travel."""
    if abs(g) < 1e-3:
        return 1 - 2 * xi
    s = (1 - g * g) / (1 - g + 2 * g * xi)
    return (1 + g * g - s * s) / (2 * g)

rng = np.random.default_rng(0)
g = 0.6
mu = sample_hg(g, rng.random(1_000_000))
print(mu.mean())           # ~0.600: the mean cosine of HG is exactly g
print(sample_hg(g, 0.5))   # 0.792 (median angle ~37.6 degrees)
m = (np.arange(200000) + 0.5) / 100000 - 1          # midpoints in (-1, 1)
print(2 * np.pi * np.sum(hg(m, g)) * (2 / 200000))  # ~1.0: normalized
```

Sign conventions are a classic bug: pbrt measures $\theta$ between $\boldsymbol{\omega}_o$ and $\boldsymbol{\omega}_i$ when *both point away from the scattering point*, which flips the sign of $g$ relative to the travel-direction convention used here. Pick one and test with an asymmetric $g$.

### 4.3 Rayleigh, Mie and the Draine function

The right phase function depends on the particle size $r$ compared with the wavelength $\lambda$:

- **Rayleigh scattering** ($r \ll \lambda$: air molecules) has $p_R(\mu) = \frac{3}{16\pi}(1+\mu^2)$, symmetric front-to-back, and a scattering coefficient proportional to $\lambda^{-4}$. Blue light ($\approx 440$ nm) scatters $(680/440)^4 \approx 5.7$ times more than red ($\approx 680$ nm).
- **Mie scattering** ($r \sim \lambda$: haze, fog and cloud droplets) has an exact but complicated solution with a very strong forward peak, a broad side region and features such as the glory and fogbow. Renderers approximate it.
- A cheap approximation is a **mixture of HG lobes**, $w\,p_{HG}(\mu; g_1) + (1-w)\,p_{HG}(\mu; g_2)$, with a strong forward lobe and a weak backward lobe. A mixture is still normalized, and it is sampled by choosing a lobe with probability $w$.
- The **Draine** phase function (Draine 2003) adds one parameter $\alpha$ to HG:
  $p_D(\mu; g, \alpha) = p_{HG}(\mu; g)\,\frac{1+\alpha\mu^2}{1+\alpha(1+2g^2)/3}$.
  With $\alpha = 0$ it is HG; with $\alpha = 1$ it is the Cornette-Shanks function. Jendersie and d'Eon (2023) fitted a blend of an HG lobe and a Draine lobe to Lorenz-Mie theory for water droplets as a function of droplet diameter, which gives a cheap, sampleable fog and cloud phase function. The fitted formulas are in their paper and supplement.

{% include blog_figure.liquid path="assets/img/blog/graphics/10-phase-functions.svg" caption="(a) Four phase functions on the same log-radius polar plot (light travels left to right): Rayleigh (peanut-shaped, symmetric), HG with g = 0.76, a two-lobe HG mixture with some back-scattering, and Draine with α = 1, which adds the 1 + μ² shape to HG. (b) Histograms of 200,000 cos θ samples from the inverse CDF overlaid on the exact density 2π p(cos θ) for three values of g (log scale). Bars and curves agree, and the sample means match g." %}

The widget below lets you feel these shapes. Drag on the plot to change where the light comes from and move the $g$ slider. The dots are live samples: 3D unit vectors drawn with the sampler above (or by rejection sampling for Rayleigh and Draine), projected onto the screen.

{% include widget.liquid name="graphics-phase-function" height="560" caption="Phase-function explorer. Drag on the polar plot (mouse or finger) to set where the light comes from; the slider sets g. The purple lobe is p(θ) around the direction of travel (dashed circle: isotropic 1/4π), the orange dots are sampled 3D directions projected onto the page, and the strip below compares the cos θ histogram with the exact pdf. Try g = 0.9 with the log scale on, then g = −0.5, then Rayleigh: the measured mean cos θ follows g for HG and stays near 0 for Rayleigh." %}

## 5. Single scattering by ray marching

### 5.1 The algorithm

The most direct way to evaluate the volume rendering equation is a Riemann sum along the ray, called **ray marching**. Split $[0, d]$ into $N$ segments of length $\Delta t$ and take one sample point $\mathbf{x}_i$ per segment. Keep a running transmittance $T$ and a running radiance $L$:

1. Look up $\sigma_t(\mathbf{x}_i)$ and $\sigma_s(\mathbf{x}_i)$.
2. **Shadow ray**: march from $$\mathbf{x}_i$$ toward the light to get the light's transmittance $$T_\ell(\mathbf{x}_i) = e^{-\tau_\ell}$$.
3. Single-scattered source: $$S_i = p(\cos\theta)\,T_\ell(\mathbf{x}_i)\,L_{\text{light}}$$, where $\theta$ is the angle between the light's travel direction $$-\boldsymbol{\omega}_\ell$$ and the direction toward the camera, $-\boldsymbol{\omega}$, so $$\cos\theta = \boldsymbol{\omega}_\ell\cdot\boldsymbol{\omega}$$.
4. Accumulate and attenuate:

$$
L \mathrel{+}= T\,\frac{\sigma_s}{\sigma_t}\,\big(1 - e^{-\sigma_t\Delta t}\big)\,S_i,
\qquad
T \mathrel{\ast}= e^{-\sigma_t\Delta t}.
$$

The factor $\frac{\sigma_s}{\sigma_t}(1 - e^{-\sigma_t\Delta t})$ is the exact integral $\int_0^{\Delta t}\sigma_s e^{-\sigma_t s}\,ds$ over a segment with constant coefficients. The naive Riemann term $\sigma_s\Delta t$ exceeds 1 when $\sigma_t\Delta t > 1$ and creates energy. This "energy-conserving" form was popularized for real-time fog by Hillaire (2015).

**Worked example.** A segment with $\sigma_t = 2$, $\sigma_s = 1.8$, $\Delta t = 0.1$, current $T = 0.7$ and $S_i = 0.5$: $1 - e^{-0.2} = 0.1813$, so $L$ grows by $0.7 \times 0.9 \times 0.1813 \times 0.5 = 0.0571$ and $T$ becomes $0.7\,e^{-0.2} = 0.573$. The naive term would add $0.7 \times 1.8 \times 0.1 \times 0.5 = 0.063$, about 10% too much.

{% include blog_figure.liquid path="assets/img/blog/graphics/10-ray-march.svg" caption="Ray marching through a procedural cloud. (a) A slice of the density (blue). The camera ray from o along ω is cut into segments of length Δt (ticks); each segment gets one jittered sample (orange) and a shadow ray toward the light ω_ℓ (dashed yellow). (b) Density along the ray (purple, filled) and the camera transmittance T(t) (black), which drops wherever the ray crosses dense material. Samples beyond the point where T ≈ 0 contribute nothing and can be skipped (early termination)." %}

### 5.2 Code

A complete single-scattering renderer for a soft, wobbly sphere fits in about 40 lines:

```python
import numpy as np

def density(p):
    """Soft sphere of radius ~1 with a sine 'noise'; sigma_t up to 4 per unit length."""
    r = np.linalg.norm(p, axis=-1)
    wobble = 0.15 * np.sin(5 * p[..., 0]) * np.sin(4 * p[..., 1] + 1) * np.sin(6 * p[..., 2])
    return 4.0 * np.clip((1.0 - r + wobble) / 0.3, 0.0, 1.0)

def hg(cos_t, g):
    return (1 - g * g) / (4 * np.pi * (1 + g * g - 2 * g * cos_t) ** 1.5)

def march(n_steps=64, n_shadow=16, jitter=True, res=96, albedo=0.9, g=0.5, seed=0):
    rng = np.random.default_rng(seed)
    light = np.array([0.6, 0.7, 0.4]); light /= np.linalg.norm(light)  # direction TO the light
    u = (np.arange(res) + 0.5) / res * 3.0 - 1.5                       # orthographic camera
    X, Y = np.meshgrid(u, -u)
    o = np.stack([X, Y, np.full_like(X, 2.0)], -1)
    w = np.array([0.0, 0.0, -1.0])                                      # looking down -z
    dt = 4.0 / n_steps
    offset = rng.random(X.shape) if jitter else np.full(X.shape, 0.5)
    phase = hg(w @ light, g)   # cos(theta) between light travel (-light) and view (-w)
    T, L = np.ones(X.shape), np.zeros(X.shape)
    for i in range(n_steps):
        x = o + ((i + offset) * dt)[..., None] * w
        sig = density(x)
        tau_l, h = np.zeros(X.shape), 2.0 / n_shadow
        for j in range(n_shadow):                                       # shadow ray
            tau_l += density(x + ((j + 0.5) * h) * light) * h
        T_seg = np.exp(-sig * dt)
        L += T * albedo * (1 - T_seg) * phase * np.exp(-tau_l)         # light radiance 1
        T *= T_seg
    return L, T

L, T = march()
img = 1 - np.exp(-(120.0 * L + 0.1 * T))     # exposure; dark background radiance 0.1
print(img.shape, round(float(T.min()), 4))    # (96, 96) 0.0011
import matplotlib.pyplot as plt
plt.imsave("sphere_volume.png", img, cmap="gray", vmin=0, vmax=1)
```

### 5.3 Banding, jitter and cost

With a fixed sample position per segment (`jitter=False`), every pixel samples the density at the same depths. Smooth density gradients then turn into **banding**: contour lines that sit at the same place in every frame. In the very soft cloud below they are faint (panel a); in hard-edged media or with fewer steps they become obvious stripes. **Jittering** the start offset per pixel (and per frame, in real time) converts that structured error into noise, which the eye tolerates better and which temporal accumulation and denoisers (as in [post 06]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})) can average away. Blue-noise offsets are better still. The cost is $N_{\text{steps}} \times N_{\text{shadow}}$ density lookups per pixel. Practical renderers cut it with **early termination** when $T < 10^{-3}$, **empty-space skipping** with a coarse occupancy grid (Section 8) and adaptive step sizes.

{% include blog_figure.liquid path="assets/img/blog/graphics/10-cloud-render.svg" caption="A procedural cloud (value-noise fBm eroding a union of spheres, stored in a 96×56×72 grid) rendered by the figure script's ray marcher, with the sun above and to the right behind the cloud. (a) 8 steps at fixed positions: the image looks smooth, but its error is structured (faint step contours along the dark lower lobes) and identical in every frame, so it never averages out. (b) The same 8 steps with per-pixel jitter: the structured error becomes visible per-pixel noise, which temporal accumulation removes. (c) 96 steps, single scattering only: the side facing away from the sun is almost black, because light needs several bounces to get there. (d) The same render plus the multiple-scattering octave approximation of Section 7: the shadowed regions fill with soft light, much closer to how real clouds look." %}

## 6. Unbiased distance sampling: delta, ratio and residual tracking

Ray marching is **biased**: with a finite step the Riemann sum does not converge to the true integral, and thin features between samples are missed. Production path tracers instead estimate transmittance and sample collision distances with **unbiased** Monte Carlo methods that only need *point evaluations* of $\sigma_t$.

### 6.1 Free-flight sampling in a homogeneous medium

In a homogeneous medium the distance to the next collision has density $p(t) = \sigma_t e^{-\sigma_t t}$, the exponential distribution with mean $1/\sigma_t$. Its CDF is $1 - e^{-\sigma_t t}$, and inverting gives

$$
t = -\frac{\ln(1-\xi)}{\sigma_t}.
$$

For example, $\sigma_t = 2$ and $\xi = 0.5$ give $t = \ln 2/2 = 0.347$. Sampling this way makes the transmittance term cancel against the pdf, so the path throughput does not change (except for the albedo). The difficulty is heterogeneous media, where $\int\sigma_t$ cannot be inverted in closed form.

### 6.2 Delta (Woodcock) tracking

The trick, from neutron transport (Woodcock et al., 1965), is to **fill the medium with fictitious "null" particles** so that it becomes homogeneous. Pick a **majorant** $\bar\sigma \ge \sigma_t(\mathbf{x})$ everywhere along the ray and define the null coefficient $\sigma_n = \bar\sigma - \sigma_t \ge 0$. The combined medium has constant extinction $\bar\sigma$, so we can sample tentative collisions with the formula above. At each tentative collision:

- with probability $\sigma_t(\mathbf{x})/\bar\sigma$ it is a **real** collision: stop (and absorb or scatter);
- otherwise it is a **null** collision: the photon continues in the same direction, unchanged.

**Why it is unbiased.** Tentative collisions on $[0, d]$ form a Poisson process with rate $\bar\sigma$: the number of points $n$ is Poisson with mean $\bar\sigma d$, and the points are uniform. The photon passes the segment only if every point is null, so

$$
P(\text{pass}) = \sum_{n=0}^{\infty} e^{-\bar\sigma d}\frac{(\bar\sigma d)^n}{n!}
\left(\frac{1}{d}\int_0^d \Big(1 - \frac{\sigma_t(s)}{\bar\sigma}\Big) ds\right)^{\!n}
= e^{-\bar\sigma d}\, e^{\int_0^d (\bar\sigma - \sigma_t)\,ds} = e^{-\tau(d)} .
$$

Delta tracking therefore returns a binary transmittance estimate (0 or 1) whose mean is exactly $T$. Its variance is that of a Bernoulli variable, $T(1-T)$, whatever the majorant. A loose majorant only costs time, because there are more null collisions.

### 6.3 Ratio tracking

When we only need the transmittance (for a shadow ray, say), terminating at the first real collision throws information away. **Ratio tracking** (Novák, Selle and Jarosz 2014) walks through *all* tentative collisions to the end of the segment and multiplies the probability of being null at each one:

$$
\langle T\rangle = \prod_{i=1}^{n}\left(1 - \frac{\sigma_t(\mathbf{x}_i)}{\bar\sigma}\right).
$$

The sum above shows that its expectation is again $e^{-\tau}$. Its variance is lower and keeps falling as the majorant grows. For a homogeneous medium the second moment is $\sum_n e^{-\bar\sigma d}\frac{(\bar\sigma d)^n}{n!}(1-\sigma/\bar\sigma)^{2n} = e^{-2\sigma d + \sigma^2 d/\bar\sigma}$, so

$$
\mathrm{Var}\,\langle T\rangle = e^{-2\sigma d}\left(e^{\sigma^2 d/\bar\sigma} - 1\right) \xrightarrow{\ \bar\sigma\to\infty\ } 0 .
$$

**Worked example**: $\sigma = 1$, $d = 1$, so $T = 0.368$. Delta tracking has variance $0.368 \times 0.632 = 0.233$. Ratio tracking with $\bar\sigma = 2$ has $e^{-2}(e^{0.5}-1) = 0.088$, and with $\bar\sigma = 4$ it has $e^{-2}(e^{0.25}-1) = 0.038$. The cost is $\bar\sigma d$ lookups on average.

### 6.4 Residual ratio tracking

**Residual ratio tracking** (also Novák et al. 2014) splits the extinction into a **control** part $\sigma_c$ whose optical depth is known analytically (for example the mean over a grid node) and a residual $\sigma_r = \sigma_t - \sigma_c$:

$$
\langle T\rangle = e^{-\sigma_c d}\prod_{i}\left(1 - \frac{\sigma_r(\mathbf{x}_i)}{\bar\sigma_r}\right),
$$

where the tentative points now come from the residual majorant $\bar\sigma_r \ge \vert\sigma_r\vert$. Only the residual is estimated stochastically, so variance and cost both shrink when the control is good. The factors may exceed 1 where $\sigma_r<0$; the estimator stays unbiased.

```python
import numpy as np
rng = np.random.default_rng(1)

def sigma_t(t):   # the same medium as in Section 2
    return (0.1 + 1.0 * np.exp(-((t - 2.0) / 0.45) ** 2)
            + 0.6 * np.exp(-((t - 5.2) / 0.8) ** 2)
            + 1.6 * np.exp(-((t - 7.4) / 0.25) ** 2))

SIGMA_BAR, D = 1.8, 10.0          # majorant >= max sigma_t (about 1.70)

def delta_tracking():
    t = 0.0
    while True:
        t -= np.log(1 - rng.random()) / SIGMA_BAR
        if t >= D:
            return 1.0                                  # passed the segment
        if rng.random() < sigma_t(t) / SIGMA_BAR:
            return 0.0                                  # real collision

def ratio_tracking():
    t, T = 0.0, 1.0
    while True:
        t -= np.log(1 - rng.random()) / SIGMA_BAR
        if t >= D:
            return T
        T *= 1 - sigma_t(t) / SIGMA_BAR

N = 20000
d = np.array([delta_tracking() for _ in range(N)])
r = np.array([ratio_tracking() for _ in range(N)])
print(f"exact {np.exp(-3.357364):.4f}")                       # 0.0348
print(f"delta {d.mean():.4f} +- {d.std() / np.sqrt(N):.4f}")
print(f"ratio {r.mean():.4f} +- {r.std() / np.sqrt(N):.4f}")  # same mean, much smaller error
```

The figure below runs all three estimators on this medium for majorants from $1\times$ to $8\times$ the maximum extinction, with 20,000 estimates each.

{% include blog_figure.liquid path="assets/img/blog/graphics/10-tracking-variance.svg" caption="A real Monte Carlo run of the three transmittance estimators on the medium of Section 2 (true T = 0.0348). (a) Standard deviation of a single estimate versus the majorant. Delta tracking stays at the Bernoulli value √(T(1−T)) (dotted) however loose the majorant is. Ratio tracking is much lower and keeps improving as the majorant grows. Residual ratio tracking, with the mean extinction as control, is lower still. (b) The price: the number of density lookups grows linearly with the majorant (delta tracking stops early at the first real collision)." %}

The widget below shows the geometry behind both estimators. Each tentative collision is drawn at height $\xi\bar\sigma$ above the axis, so "real with probability $\sigma_t/\bar\sigma$" becomes "the point lies under the density curve". This is rejection sampling along the ray.

{% include widget.liquid name="graphics-volume-tracking" height="520" caption="Delta versus ratio tracking on the medium of Section 2. Top: one delta-tracking walk; each tentative collision is drawn at height ξσ̄, gray rings above the density curve are null collisions, and the first red dot below it is a real collision that ends the walk (estimate 0); reaching t = 10 gives estimate 1. Bottom: the exact T(t) (black) and one ratio-tracking walk (blue), which multiplies by 1 − σt/σ̄ at every point. Tap the plot for a new ray; the statistics below accumulate thousands of walks. Raise the majorant: delta tracking's standard deviation stays near 0.18, ratio tracking's shrinks, and both pay with more lookups." %}

### 6.5 Null-scattering path integrals and beyond

Delta and ratio tracking are two members of a larger family. Novák, Georgiev, Hanika and Jarosz (2018) survey them in a Eurographics state-of-the-art report: tracking, spectral tracking for chromatic media, decomposition tracking (Kutz et al. 2017), and how to choose majorants. Miller, Georgiev and Jarosz (2019) then wrote the **null-scattering path integral formulation**. Null collisions become explicit vertices of a path, with their own path-space measure. This lets tracking estimators be combined with multiple importance sampling (MIS, [post 05]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})), including spectral MIS and bidirectional methods, which earlier tracking estimators could not do because their pdfs were not computable.

## 7. Volumetric path tracing with multiple scattering

A volumetric path tracer extends the surface path tracer of post 05 with one new decision per segment: *does the path hit the next surface, or does it collide in the medium first?* With delta tracking:

1. From the current vertex, delta-track along the direction to find the first real collision (or reach the surface or escape).
2. At a real medium collision: with probability $\sigma_a/\sigma_t$ the path is absorbed (add emission if any). Otherwise it scatters. Equivalently, multiply the throughput by the albedo $\rho$ and always scatter, using Russian roulette to stop.
3. **Next-event estimation**: sample a point on a light, estimate the transmittance toward it with **ratio tracking**, and add $\text{throughput}\times\rho\times p(\cos\theta)$ $\times\, T_\ell\times L_{\text{light}}/\text{pdf}_{\text{light}}$.
4. Sample the new direction from the phase function (HG sampling gives weight 1) and continue.

The code below strips this to the essentials: photons enter a heterogeneous slab at the top, delta tracking finds real collisions, and HG sampling picks new directions. The output is the fraction reflected, transmitted and absorbed, the kind of quantity a material-appearance model needs.

```python
import numpy as np
rng = np.random.default_rng(2)
SIGMA_BAR, ALBEDO, G, DEPTH = 1.8, 0.95, 0.7, 4.0

def sigma_t(p):   # slab 0 <= z <= 4, denser in a wavy layer around z = 2 (max exactly 1.8)
    return 1.0 + 0.8 * np.sin(2.0 * p[0]) * np.exp(-(p[2] - 2.0) ** 2)

def sample_hg(g, xi):
    if abs(g) < 1e-3:
        return 1 - 2 * xi
    s = (1 - g * g) / (1 - g + 2 * g * xi)
    return (1 + g * g - s * s) / (2 * g)

def scatter(w, g):
    cos_t = sample_hg(g, rng.random())
    sin_t = np.sqrt(max(0.0, 1 - cos_t * cos_t))
    phi = 2 * np.pi * rng.random()
    a = np.array([1.0, 0.0, 0.0]) if abs(w[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u = np.cross(a, w); u /= np.linalg.norm(u)
    v = np.cross(w, u)
    return sin_t * np.cos(phi) * u + sin_t * np.sin(phi) * v + cos_t * w

def trace(max_bounces=1000):
    p, w = np.zeros(3), np.array([0.0, 0.0, 1.0])   # enter at the top, heading down (+z)
    for _ in range(max_bounces):
        while True:                                  # delta tracking to a REAL collision
            p = p - np.log(1 - rng.random()) / SIGMA_BAR * w
            if p[2] < 0:
                return "R"
            if p[2] > DEPTH:
                return "T"
            if rng.random() < sigma_t(p) / SIGMA_BAR:
                break
        if rng.random() > ALBEDO:                    # analog absorption
            return "A"
        w = scatter(w, G)
    return "A"

fates = [trace() for _ in range(5000)]
print({k: fates.count(k) / len(fates) for k in "RTA"})   # {'R': 0.2436, 'T': 0.4724, 'A': 0.284}
```

The random walks in the figure below show the paths themselves. High-albedo media scatter photons dozens of times, which spreads light sideways and lets it reach regions the sun never sees directly. That is the physical reason panel (c) of the cloud figure is too dark.

{% include blog_figure.liquid path="assets/img/blog/graphics/10-random-walk.svg" caption="Random walks in a slab four mean free paths thick with albedo 0.98, light entering at the top (yellow arrow); 24 paths each, projected onto the x-z plane, coloured by fate: reflected (orange), transmitted (blue), absorbed (gray). The fractions R, T, A in the titles come from 20,000 walks. Isotropic scattering (left) sends many photons back out of the top; forward scattering with g = 0.85 (right) carries them deeper and transmits more, because each bounce changes the direction only a little." %}

**Similarity and the octave trick.** Two approximations make multiple scattering affordable. The **similarity relation** says a forward-scattering medium with $(\sigma_s, g)$ behaves, after many bounces, like an isotropic one with reduced scattering $\sigma_s' = \sigma_s(1-g)$; this reappears in the diffusion models of Section 10. In real time and in film, a popular heuristic (Wrenninge, Kulla and Lundqvist's 2013 talk *Oz: The Great and Volumetric*) approximates multiple scattering by summing single-scattering terms with progressively weaker extinction, scattering and anisotropy:

$$
L_{ms} \approx \sum_{k=0}^{K-1} a^k\,\sigma_s\,p(\cos\theta;\, c^k g)\, e^{-b^k \tau_\ell},
\qquad a, b, c < 1 .
$$

Panel (d) of the cloud figure uses $a=b=c=\tfrac12$ and $K=4$. It is not physically exact, but it captures the main effect: light leaking into shadowed regions.

## 8. Data structures: OpenVDB and NanoVDB

Production volumes (explosions, clouds, fluid simulations) are large and **sparse**: most of the bounding box is empty. A dense $2048^3$ float grid would need 32 GB. **OpenVDB** (Museth 2013) stores only the active regions in a shallow, fixed-depth tree. The standard configuration has a hash-map root, two levels of internal nodes with $32^3$ and $16^3$ children, and leaf nodes holding $8^3$ voxels. Bit masks mark the active children, so lookups are fast and random access costs $O(1)$, with cached paths making coherent access even cheaper.

**NanoVDB** (Museth 2021) is a read-only, pointer-free linearization of the same tree into one contiguous buffer, so it can be uploaded to a GPU and traversed in CUDA, OptiX, HLSL or GLSL. For rendering, a useful detail is that the tree also stores per-node statistics such as minimum and maximum values. They give **local majorants**: delta and ratio tracking can use a tight $\bar\sigma$ per node instead of one global maximum, which (as the figure in Section 6 showed) directly cuts the number of lookups. Empty nodes are skipped entirely, which is the empty-space skipping of Section 5.

## 9. Real time: froxel fog, sky and clouds

### 9.1 Froxel volumetric fog

A game cannot march every pixel through every light. **Froxel**-based fog (Wronski 2014, *Volumetric Fog*, at the SIGGRAPH Advances in Real-Time Rendering course; extended by Hillaire 2015 for Frostbite) works in a 3D texture aligned with the view frustum. A froxel is a frustum voxel: for example $160\times 90$ tiles in screen space times 64 depth slices, with slices spaced exponentially, $z_k = z_n (z_f/z_n)^{k/N}$, so that resolution follows perspective.

1. **Inject**: a compute shader writes $\sigma_s$, $\sigma_t$ and emission into each froxel (global fog, height fog, local fog volumes, particles).
2. **Light**: for each froxel, sum the in-scattering of all lights, using shadow maps for visibility and the phase function for the view angle.
3. **Integrate**: walk front to back along each froxel column, accumulating scattered light and transmittance with the energy-conserving segment formula of Section 5.
4. **Apply**: when shading a pixel at depth $z$, fetch the accumulated $(L_{\text{in}}, T)$ at $z$ and output $T\,L_{\text{surface}} + L_{\text{in}}$. Transparent objects can fetch it too.

The grid is coarse, so froxel positions are jittered every frame and blended with the reprojected previous frame, the same temporal reuse as TAA in [post 06]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}).

### 9.2 Sky and atmosphere

The atmosphere is a spherical shell of air (Rayleigh, scale height about 8 km), aerosols (Mie, scale height about 1.2 km) and ozone (pure absorption, which keeps the twilight sky blue). Densities fall off exponentially with altitude $h$: $\sigma(h) = \sigma(0)\,e^{-h/H}$. Single scattering of sunlight along each view ray already explains the main colours. Short wavelengths are scattered more strongly, so the sky away from the sun is blue. Near sunset the light reaching us has crossed so much air that the blue has been scattered out, leaving orange and red.

**Worked example.** With the sea-level Rayleigh coefficients used by Hillaire (2020), $\beta_R = (5.80, 13.56, 33.1)\times10^{-6}\ \text{m}^{-1}$ for (R, G, B), the zenith optical depth is $\beta_R H_R = (0.046, 0.108, 0.265)$. The direct sun at noon keeps $e^{-0.265} = 77\%$ of its blue. At the horizon the path is roughly 35-40 times longer, so blue drops to $e^{-9.3}\approx 10^{-4}$ while red keeps about $e^{-1.6} \approx 0.2$.

{% include blog_figure.liquid path="assets/img/blog/graphics/10-rayleigh-sky.svg" caption="Single-scattering sky computed by the figure script (Rayleigh + Mie + ozone, spherical Earth, quadrature along each view ray and each sun ray). Each column is one sun elevation, each row one view elevation, looking toward the sun (a) and away from it (b). Note the bright Mie glow around the sun's direction (the diagonal in a), the deepening blue toward the zenith, and the darkening and reddening as the sun approaches and drops below the horizon. The strip shows the hue of the direct sun disk, T_sun normalized per column: white at high elevations, orange then red near the horizon." %}

Computing this per pixel per frame is too expensive, and multiple scattering matters, especially at twilight. **Bruneton and Neyret (2008)** precompute single and multiple scattering into 4D lookup tables (altitude, view zenith, sun zenith, view-sun angle), adding scattering orders one at a time. **Hillaire (2020)** proposed a lighter, fully dynamic scheme, now used in Unreal Engine. It uses a small transmittance LUT, a multiple-scattering LUT and a low-resolution sky-view LUT, plus a froxel volume for aerial perspective. The multiple-scattering LUT assumes isotropic scattering for orders two and higher and sums the infinite series of orders in closed form as a geometric series. All LUTs are cheap enough to recompute every frame, so atmospheres can change at run time.

### 9.3 Clouds

Real-time cloudscapes took off with Schneider's 2015 Advances talk, *The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn*. The ingredients have since become standard:

- **Modelling**: low-frequency 3D Perlin-Worley noise defines the cloud shapes. A higher-frequency Worley noise erodes their edges. A 2D **weather map** sets coverage and cloud type, and height gradients per type give flat bases and billowing tops.
- **Lighting**: Beer-Lambert transmittance toward the sun, an HG phase function (often two lobes for the silver lining), and an extra darkening of edges facing the sun, the "powder" effect: thin edges have not yet built up in-scattered light. The multi-octave trick of Section 7 approximates multiple scattering.
- **Performance**: large steps in empty space and small steps inside clouds, low-resolution rendering with temporal reprojection that refreshes only part of the pixels each frame, and early termination.

The later Nubis talks by the same studio describe how the system evolved, including fly-through clouds and voxel-based cloud authoring.

## 10. Subsurface scattering

Skin, marble, wax, milk and leaves are **translucent**: light enters at one point, scatters many times inside, and exits somewhere else. A BRDF assumes entry and exit at the same point. The general description is the **BSSRDF** $S(\mathbf{x}_i, \boldsymbol{\omega}_i; \mathbf{x}_o, \boldsymbol{\omega}_o)$, which relates radiance leaving $\mathbf{x}_o$ to light arriving at a *different* point $\mathbf{x}_i$:

$$
L_o(\mathbf{x}_o, \boldsymbol{\omega}_o) = \int_A \int_{H^2} S(\mathbf{x}_i, \boldsymbol{\omega}_i; \mathbf{x}_o, \boldsymbol{\omega}_o)\, L_i(\mathbf{x}_i, \boldsymbol{\omega}_i)\,\cos\theta_i\, d\boldsymbol{\omega}_i\, dA(\mathbf{x}_i).
$$

### 10.1 Diffusion and the dipole

In a dense, high-albedo medium light has scattered so often that its direction is nearly random. The radiance is then almost isotropic, and the RTE simplifies to a **diffusion equation** for the fluence. **Jensen, Marschner, Levoy and Hanrahan (2001)** solved it for a semi-infinite slab by placing a positive point source a depth $z_r = 1/\sigma_t'$ below the surface and a negative mirror source above it, which enforces the boundary condition. This is the **dipole**. The result is a radial **diffuse reflectance profile** $R_d(r)$, the fraction of light exiting at distance $r$ from the entry point:

$$
R_d(r) = \frac{\alpha'}{4\pi}\left[ z_r\,(1+\sigma_{tr} d_r)\,\frac{e^{-\sigma_{tr} d_r}}{d_r^3} + z_v\,(1+\sigma_{tr} d_v)\,\frac{e^{-\sigma_{tr} d_v}}{d_v^3}\right],
$$

with reduced coefficients $\sigma_s' = \sigma_s(1-g)$ and $\sigma_t' = \sigma_a + \sigma_s'$, reduced albedo $\alpha' = \sigma_s'/\sigma_t'$, effective transport coefficient $\sigma_{tr} = \sqrt{3\sigma_a\sigma_t'}$, source depths $z_r = 1/\sigma_t'$ and $z_v = z_r(1+\tfrac{4}{3}A)$, and distances $d_{r,v} = \sqrt{r^2 + z_{r,v}^2}$. The constant $A = \frac{1+F_{dr}}{1-F_{dr}}$ accounts for internal reflection at the boundary through the diffuse Fresnel reflectance $F_{dr}$, a fitted polynomial in the relative index of refraction $\eta$.

### 10.2 Burley's normalized diffusion

Christensen and Burley (2015, Pixar technical memo) observed that profiles from brute-force Monte Carlo simulation are fitted very well by a simple sum of two exponentials, which Burley used in the Disney BSDF:

$$
R(r) = A\,s\,\frac{e^{-s r} + e^{-s r/3}}{8\pi r}.
$$

Here $A$ is the surface albedo and $d = 1/s$ is a user-facing **scattering distance**. It is **normalized**: $\int_0^\infty R(r)\,2\pi r\,dr = \frac{A s}{4}\left(\frac{1}{s} + \frac{3}{s}\right) = A$, so artists set the colour $A$ and the blur radius $d$ independently. Even better, $2\pi r R(r) = A\left[\tfrac14\,\tfrac{e^{-r/d}}{d} + \tfrac34\,\tfrac{e^{-r/(3d)}}{3d}\right]$ is a mixture of two exponential distributions. Sampling a radius is therefore trivial: with probability $\tfrac14$ draw $r = -d\ln\xi$, otherwise $r = -3d\ln\xi$.

```python
import numpy as np

def burley(r, A, d):
    return A * (np.exp(-r / d) + np.exp(-r / (3 * d))) / (8 * np.pi * d * r)

r = np.linspace(1e-6, 60.0, 600001)                         # mm
for A, d in [(0.8, 1.0), (0.55, 0.45), (0.4, 0.25)]:        # red spreads furthest in skin
    f = 2 * np.pi * r * burley(r, A, d)
    print(A, d, round(float(np.sum(0.5 * (f[1:] + f[:-1]) * np.diff(r))), 4))   # ~A

rng = np.random.default_rng(0)                              # sampling the radius
d, n = 1.0, 200000
xi, pick = rng.random(n), rng.random(n) < 0.25
radii = np.where(pick, -d * np.log(1 - xi), -3 * d * np.log(1 - xi))
print(radii.mean(), 0.25 * d + 0.75 * 3 * d)                 # both ~2.5
```

{% include blog_figure.liquid path="assets/img/blog/graphics/10-diffusion-profiles.svg" caption="Diffusion profiles. (a) The dipole R_d(r) for skin-like RGB coefficients (listed in the figure script) on log-log axes: red light, which is absorbed least, spreads furthest, which is why backlit ears glow red and why skin looks soft. (b) Burley's normalized profile as a radial density 2πr R(r) for three (A, d) pairs; the legend shows the numerically integrated area, which equals A." %}

### 10.3 Real time and production

- **Separable subsurface scattering** (Jimenez et al. 2015) does SSS as a screen-space post-process. The irradiance of skin pixels is blurred with the diffusion profile, and the 2D kernel is approximated by two 1D passes (horizontal, then vertical) with a separable, rank-1 approximation. The kernel radius is scaled by depth so the blur has a constant world-space size.
- **Random-walk SSS.** Production path tracers (for example Arnold, RenderMan and Blender Cycles) now offer modes that skip the diffusion approximation. They path trace the interior as a volume, with the same delta tracking and phase sampling as Section 7, inside the mesh boundary. This handles thin geometry, back-lighting and complex shapes correctly, at higher cost.

## 11. Back to neural rendering: alpha compositing is quadrature

Take the volume rendering equation with **emission-absorption only** and call the emitted colour $\mathbf{c}(\mathbf{x}, \boldsymbol{\omega})$ (folding $\sigma_a L_e$ into $\sigma\,\mathbf{c}$):

$$
C = \int_0^{d} T(t)\,\sigma(t)\,\mathbf{c}(t)\,dt, \qquad T(t) = e^{-\int_0^t \sigma\,ds}.
$$

This is the NeRF rendering integral. Now evaluate it like the ray marcher of Section 5: split the ray at points $t_i$ with spacing $\delta_i$ and assume $\sigma$ and $\mathbf{c}$ constant within each segment. The exact integral over segment $i$ is $T_i\,(1 - e^{-\sigma_i\delta_i})\,\mathbf{c}_i$, so

$$
\hat C = \sum_i T_i\,\alpha_i\,\mathbf{c}_i,
\qquad \alpha_i = 1 - e^{-\sigma_i \delta_i},
\qquad T_i = \prod_{j<i}(1 - \alpha_j).
$$

This is **front-to-back alpha compositing**, the "over" operator. NeRF's formula is the energy-conserving segment rule of Section 5 with $\sigma_s/\sigma_t$ replaced by an emitted colour. 3D Gaussian Splatting uses the same sum, but each $\alpha_i$ comes from a projected Gaussian instead of a density sample. The weights $w_i = T_i\alpha_i$ sum to $1 - T_N \le 1$, so they behave like a probability distribution over depth. NeRF's hierarchical sampling uses exactly this to place fine samples.

**Worked example.** Two samples with $\sigma = (1, 3)$, $\delta = 0.5$ and colours $c = (0.9, 0.2)$: $\alpha = (0.393, 0.777)$, $T = (1, 0.607)$, $w = (0.393, 0.471)$. Their sum is $0.865 = 1 - e^{-2}$, exactly one minus the total transmittance, and $\hat C = 0.9(0.393) + 0.2(0.471) = 0.448$.

```python
import numpy as np
sigma, delta, c = np.array([1.0, 3.0]), np.array([0.5, 0.5]), np.array([0.9, 0.2])
alpha = 1 - np.exp(-sigma * delta)
T = np.concatenate([[1.0], np.cumprod(1 - alpha)[:-1]])
w = T * alpha
print(alpha.round(4), T.round(4), w.round(4), w.sum().round(4), (w * c).sum().round(4))
# [0.3935 0.7769] [1.     0.6065] [0.3935 0.4712] 0.8647 0.4484
```

{% include blog_figure.liquid path="assets/img/blog/graphics/10-quadrature.svg" caption="Alpha compositing as quadrature on the medium of Section 2. (a) The continuous weight T(t)σt(t) (purple) and the discrete weights T_iα_i/δ_i from 16 segments (bars): the bars follow the curve, including the shadowing of the last bump by the earlier ones. (b) Error of the rendered colour against the exact integral as the number of samples N grows. The exponential α = 1 − e^−σδ (energy-conserving) converges about quadratically (dotted line ∝ N⁻²). The naive α = σδ (clamped to 1) converges only at first order (∝ 1/N), because it overestimates the opacity of every segment; at N = 512 its error is several hundred times larger." %}

Everything in this chapter carries over. Transmittance-based sampling becomes NeRF's importance sampling, empty-space skipping becomes occupancy grids in [fast radiance fields]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }}), and the banding-versus-noise trade-off is why NeRF jitters its sample positions during training.

## Try it

- The phase-function widget above: compare HG, Draine and Rayleigh, and watch the sample mean converge to $g$.
- The volume-ray widget of the [NeRF post]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) shows emission-absorption compositing along one ray.
- The path tracer in the [Interactive Lab]({{ '/' | relative_url }}#lab) is a surface path tracer. Adding the delta-tracking loop of Section 7 to its inner loop is a good exercise in WebGL.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Henyey & Greenstein, *Diffuse Radiation in the Galaxy* | Astrophysical Journal | 1941 | [DOI](https://doi.org/10.1086/144246) | The one-parameter phase function still used everywhere |
| Kajiya & Von Herzen, *Ray Tracing Volume Densities* | SIGGRAPH | 1984 | [DOI](https://doi.org/10.1145/964965.808594) | Brought the radiative transfer equation and volume ray tracing to graphics |
| Nishita, Sirai, Tadamura & Nakamae, *Display of the Earth Taking into Account Atmospheric Scattering* | SIGGRAPH | 1993 | [DOI](https://doi.org/10.1145/166117.166140) | Physically based single-scattering sky from space and ground |
| Max, *Optical Models for Direct Volume Rendering* | IEEE TVCG | 1995 | [DOI](https://doi.org/10.1109/2945.468400) | Emission-absorption and scattering models; the ancestor of NeRF's rendering integral |
| Jensen, Marschner, Levoy & Hanrahan, *A Practical Model for Subsurface Light Transport* | SIGGRAPH | 2001 | [DOI](https://doi.org/10.1145/383259.383319) | The dipole BSSRDF; made translucent materials practical |
| Draine, *Scattering by Interstellar Dust Grains. I. Optical and Ultraviolet* | Astrophysical Journal | 2003 | [DOI](https://doi.org/10.1086/379118) | Introduces the Draine phase function used in modern Mie fits |
| Bruneton & Neyret, *Precomputed Atmospheric Scattering* | CGF (EGSR) | 2008 | [DOI](https://doi.org/10.1111/j.1467-8659.2008.01245.x) | Multiple-scattering sky from 4D lookup tables, in real time |
| Museth, *VDB: High-Resolution Sparse Volumes with Dynamic Topology* | ACM TOG | 2013 | [DOI](https://doi.org/10.1145/2487228.2487235) | The sparse volume format behind OpenVDB |
| Novák, Selle & Jarosz, *Residual Ratio Tracking for Estimating Attenuation in Participating Media* | ACM TOG (SIGGRAPH Asia) | 2014 | [DOI](https://doi.org/10.1145/2661229.2661292) | Ratio and residual ratio tracking: low-variance unbiased transmittance |
| Wronski, *Volumetric Fog: Unified Compute Shader-Based Solution to Atmospheric Scattering* | SIGGRAPH Advances in Real-Time Rendering | 2014 | [course page](https://advances.realtimerendering.com/s2014/index.html) | Froxel-based volumetric fog in games |
| Schneider, *The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn* | SIGGRAPH Advances in Real-Time Rendering | 2015 | [course page](https://advances.realtimerendering.com/s2015/index.html) | The template for real-time ray-marched clouds |
| Hillaire, *Towards Unified and Physically-Based Volumetric Lighting in Frostbite* | SIGGRAPH Advances in Real-Time Rendering | 2015 | [course page](https://advances.realtimerendering.com/s2015/index.html) | Energy-conserving froxel integration, unified participating media |
| Jimenez et al., *Separable Subsurface Scattering* | CGF | 2015 | [DOI](https://doi.org/10.1111/cgf.12529) | Real-time screen-space SSS with separable kernels |
| Christensen & Burley, *Approximate Reflectance Profiles for Efficient Subsurface Scattering* | Pixar Technical Memo 15-04 | 2015 | — | Normalized diffusion: a two-exponential profile, trivially sampled |
| Kutz, Habel, Li & Novák, *Spectral and Decomposition Tracking for Rendering Heterogeneous Volumes* | ACM TOG (SIGGRAPH) | 2017 | [DOI](https://doi.org/10.1145/3072959.3073665) | Tracking for chromatic media and control/residual decomposition |
| Novák, Georgiev, Hanika & Jarosz, *Monte Carlo Methods for Volumetric Light Transport Simulation* | CGF (Eurographics STAR) | 2018 | [DOI](https://doi.org/10.1111/cgf.13383) | The survey to read on volumetric Monte Carlo |
| Miller, Georgiev & Jarosz, *A Null-Scattering Path Integral Formulation of Light Transport* | ACM TOG (SIGGRAPH) | 2019 | [DOI](https://doi.org/10.1145/3306346.3323025) | Null collisions in path space; MIS for tracking estimators |
| Hillaire, *A Scalable and Production Ready Sky and Atmosphere Rendering Technique* | CGF (EGSR) | 2020 | [DOI](https://doi.org/10.1111/cgf.14050) | Dynamic LUT-based sky with a closed-form multiple-scattering approximation |
| Mildenhall et al., *NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis* | ECCV | 2020 | [arXiv](https://arxiv.org/abs/2003.08934) | Emission-absorption volume rendering as a differentiable scene representation |
| Museth, *NanoVDB: A GPU-Friendly and Portable VDB Data Structure for Real-Time Rendering and Simulation* | SIGGRAPH Talks | 2021 | [DOI](https://doi.org/10.1145/3450623.3464653) | VDB on the GPU |
| Jendersie & d'Eon, *An Approximate Mie Scattering Function for Fog and Cloud Rendering* | SIGGRAPH Talks | 2023 | [DOI](https://doi.org/10.1145/3587421.3595409) | HG + Draine blend fitted to Mie theory for water droplets |

## Learning resources

- Pharr, Jakob & Humphreys, *Physically Based Rendering*, 4th edition, free online at [pbr-book.org](https://pbr-book.org/4ed/contents). Chapter 11 (volume scattering) and chapter 14 (volume light transport) implement everything in Sections 1-7 with null-scattering path tracing.
- Fong, Wrenninge, Kulla & Habel, *Production Volume Rendering*, SIGGRAPH 2017 course ([DOI](https://doi.org/10.1145/3084873.3084907)): how film renderers handle volumes in practice.
- The Novák et al. 2018 survey above is the best single reference on tracking estimators.
- Sébastien Hillaire's open-source sky sample [UnrealEngineSkyAtmosphere](https://github.com/sebh/UnrealEngineSkyAtmosphere) and Eric Bruneton's [precomputed_atmospheric_scattering](https://github.com/ebruneton/precomputed_atmospheric_scattering), both with readable shader code.
- [OpenVDB](https://github.com/AcademySoftwareFoundation/openvdb), which includes NanoVDB, and [Mitsuba 3](https://github.com/mitsuba-renderer/mitsuba3), whose volumetric path tracer is short enough to read.
- [Scratchapixel](https://www.scratchapixel.com/) has a gentle multi-part introduction to volume rendering with C++ code.

## Exercises

1. Show that the mean cosine of the HG phase function is $g$. Substitute $u = 1 + g^2 - 2g\mu$ in $2\pi\int\mu\,p_{HG}\,d\mu$.

   <details markdown="1"><summary>Hint</summary>
   With $\mu = (1+g^2-u)/(2g)$ and $d\mu = -du/(2g)$, the integral becomes a combination of $\int u^{-3/2}du$ and $\int u^{-1/2}du$ between $(1-g)^2$ and $(1+g)^2$. Collecting the terms leaves exactly $g$.
   </details>

2. Extend the sphere ray marcher of Section 5 with early termination ($T < 10^{-3}$) and an emission term $\sigma_a L_e$ that is bright in the core. How many density lookups does early termination save at `res=96`?

3. Implement a two-lobe HG mixture sampler (pick a lobe with probability $w$, then sample it) and verify with a histogram that it matches $w\,p_{HG}(g_1) + (1-w)\,p_{HG}(g_2)$.

   <details markdown="1"><summary>Hint</summary>
   The mixture density is a convex combination, so "choose a component, then sample it" draws exactly from it. No weight correction is needed because pdf and function are identical.
   </details>

4. Replace the global majorant in the ratio-tracking code with a **piecewise** majorant: split $[0, 10]$ into 10 cells, use the maximum of $\sigma_t$ in each, and restart the exponential sampling at each cell boundary (the memoryless property makes this valid). Compare the number of lookups with the global majorant at equal variance.

5. Derive the homogeneous ratio-tracking variance $e^{-2\sigma d}(e^{\sigma^2 d/\bar\sigma} - 1)$ from the Poisson sum, and check it against a simulation with $\sigma = 1$, $d = 1$, $\bar\sigma \in \{1, 2, 4, 8\}$.

   <details markdown="1"><summary>Hint</summary>
   $E[\langle T\rangle^2] = \sum_n e^{-\bar\sigma d}\frac{(\bar\sigma d)^n}{n!}(1-\sigma/\bar\sigma)^{2n}$ $= \exp\big(-\bar\sigma d + \bar\sigma d (1-\sigma/\bar\sigma)^2\big)$. Expand the square and subtract $T^2 = e^{-2\sigma d}$.
   </details>

Next: [real-time rendering techniques]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }}). It covers how games fit deferred shading, soft shadows, ambient occlusion, reflections, global illumination and tone mapping into a 16 ms frame.
