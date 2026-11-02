---
layout: post
title: "Graphics research frontiers 2026: what SIGGRAPH, SIGGRAPH Asia and the latest preprints are doing"
date: 2026-10-27 09:13:00+0900
description: "A verified, topic-by-topic map of 2026 graphics research (SIGGRAPH 2026, SIGGRAPH Asia 2026, EGSR, I3D, SCA and arXiv preprints), with the math behind four recurring ideas and an interactive explorer."
categories: graphics
tags: [research, siggraph, survey, rendering, simulation, gaussian-splatting, holography]
series: graphics
series_order: 13
toc:
  sidebar: left
related_posts: false
---

## How to read this chapter

The previous twelve chapters taught the foundations: from [vectors and transforms]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }}) through [path tracing]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}), [simulation]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}), [geometry processing]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) and [differentiable rendering]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }}). This chapter is different: it is a dated map of where research stands **as of November 2026**. It will go stale, and that is the point. Read it as a snapshot that shows how the ideas you have learned are being pushed today, and as a list of papers you can now read.

How the chapter is organized:

- **Eight topic sections**, each with 5-6 works and a short synthesis of where the area is heading. For each work you get the title (linked to its arXiv page, DOI or project page), the first author, the venue and **status**, the month, and a few sentences on the problem, the key idea and the earlier chapter it builds on.
- **Four "explain one idea" boxes** that derive, compute and plot an idea that recurs in many of these papers: the peak response of a 3D Gaussian along a ray, control variates, the IPC contact barrier and phase-only holograms.
- An **interactive explorer** that holds the same list, a section on **cross-cutting trends**, and a section on **how to follow graphics research** yourself.

Status is stated precisely, following the rules of this blog:

- **Published**: presented at a 2026 venue that has already taken place (for example SIGGRAPH 2026, July 2026, with the paper in ACM TOG 45(4) or the SIGGRAPH 2026 Conference Papers), or published in a journal issue.
- **Accepted / to appear**: accepted to a venue that has not happened yet. On 2 November 2026 this mainly means **SIGGRAPH Asia 2026** (1-4 December 2026, Kuala Lumpur).
- **Preprint**: on arXiv only, with no venue stated by the authors. A preprint is not peer reviewed; treat its claims with more caution.

Every entry was checked against a primary source: the arXiv abstract page (title, authors, comments and journal reference), the Crossref record of its DOI, or the official project page. Where the arXiv comment and the DOI record disagreed, the DOI record won. The numbers in the summaries are the authors' own claims, not results I reproduced. The selection is mine. It aims for breadth and for papers a learner of this series can follow, and it is not a ranking. Many excellent papers are missing.

## Prerequisites

- Chapters 1-7 of this series. Chapters 8-12 help for the geometry, animation and differentiable-rendering sections.
- For the neural sections: [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) and the basics of [diffusion and flow matching]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }}).
- Python with NumPy if you want to run the snippets and the figure script (`bin/figures/graphics/graphics_13.py`).

## 1. The 2026 calendar

Graphics research flows through a handful of venues. The big two are **ACM SIGGRAPH** (North America, summer) and **SIGGRAPH Asia** (winter). Their technical papers appear either in the journal **ACM Transactions on Graphics (TOG)** or in the **Conference Papers** proceedings. Around them sit the European and specialist venues: **Eurographics** (papers in Computer Graphics Forum, CGF), **EGSR** (rendering), **HPG** (high-performance graphics), **I3D** (interactive 3D and games, papers in PACMCGIT, the Proceedings of the ACM on Computer Graphics and Interactive Techniques), **SCA** (animation and simulation), **SGP** (geometry processing) and **Pacific Graphics**. More and more work also appears first, or only, as an **arXiv preprint** in the cs.GR category.

| Venue | 2026 dates | Place | Status on 2 Nov 2026 |
| --- | --- | --- | --- |
| Eurographics 2026 | 4-8 May | Aachen, Germany | held (CGF 45(2)) |
| I3D 2026 | 13-15 May | San Francisco, USA | held (PACMCGIT 9(1)) |
| EGSR 2026 | 1-3 July | Bordeaux, France | held |
| SGP 2026 | 1-3 July | Bern, Switzerland | held |
| SCA 2026 | 8-10 July | Barcelona, Spain | held (CGF 45(8)) |
| HPG 2026 | 17-19 July | Los Angeles, USA | held |
| SIGGRAPH 2026 | 19-23 July | Los Angeles, USA | held (ACM TOG 45(4) + Conference Papers) |
| Pacific Graphics 2026 | October | Singapore | held |
| SIGGRAPH Asia 2026 | 1-4 December | Kuala Lumpur, Malaysia | upcoming; accepted papers are appearing on arXiv |

{% include blog_figure.liquid path="assets/img/blog/graphics/13-venue-timeline.svg" caption="The 2026 venues on a month axis (1 = January). Filled bars have already taken place; the hatched bar (SIGGRAPH Asia, December) is still ahead. The dashed red line is today, 2 November 2026, and the shaded band is the June-November window of arXiv preprints this chapter covers. The bold numbers count the works of this chapter that come from each venue: SIGGRAPH 2026 dominates, and SIGGRAPH Asia 2026 papers are already visible as preprints." %}

The timeline explains the shape of this chapter. The SIGGRAPH 2026 papers were published in July, so they are the most solid layer. SIGGRAPH Asia 2026 papers are accepted, but the conference is a month away, so we know them from the authors' arXiv versions. The preprints are the most recent and the least certain.

{% include blog_figure.liquid path="assets/img/blog/graphics/13-topic-status.svg" localized="true" caption="The 45 works of this chapter by topic and status. Green: published; blue: accepted / to appear (all SIGGRAPH Asia 2026); orange: preprints. Geometry and fabrication are entirely SIGGRAPH 2026 papers here, while light transport and simulation include the most preprints. This reflects my selection as much as the field." %}

{% include blog_figure.liquid path="assets/img/blog/graphics/13-months.svg" localized="true" caption="The same works by month (venue month for conference papers, arXiv month for preprints). The July spike is SIGGRAPH, EGSR and SCA; December is SIGGRAPH Asia. The dashed line is today." %}

## 2. Explore the list

The explorer below holds every work in this chapter. Each row is a topic and each column a month of 2026. Colour shows the topic and shape shows the status: a filled circle is published, a ring is accepted / to appear, and a diamond is a preprint.

<div id="fw-i18n" hidden data-all="All" data-topic="Topic" data-status="Status" data-published="Published" data-accepted="Accepted / to appear" data-preprint="Preprint" data-hint="Tap a dot or a title." data-count="{n} of {m} works" data-jump="Go to this entry in the text" data-today="today" data-t-light="Light" data-t-neural="Neural repr." data-t-geometry="Geometry" data-t-simulation="Simulation" data-t-animation="Animation" data-t-imaging="Displays" data-t-fabrication="Fabrication" data-t-generative="Generative"></div>

{% include widget.liquid name="graphics-frontiers-explorer" height="640" caption="Filter by topic and status with the buttons, then tap a dot (or a title in the list below it) to read that work's summary, its link and the chapter it builds on. On a keyboard, focus the chart and use the left/right arrow keys to step through the filtered works. The red dashed line is 2 November 2026." %}

## 3. Light transport and rendering

The [path tracer]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}) and [ReSTIR]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}) of earlier chapters are both Monte Carlo estimators. Almost all rendering research is about one of two things: lowering the variance of those estimators, or replacing part of the computation by a learned or fitted model that is cheaper to evaluate. 2026 has strong examples of both.

### Explain one idea: control variates

**Intuition.** If you must estimate $I = \int f$, and you know a function $g$ that looks like $f$ and whose integral $G = \int g$ you know exactly, then estimate only the *difference* $f - g$ by Monte Carlo and add $G$ back. The difference is small and smooth, so its estimate is much less noisy.

**Formula.** With $N$ samples $X_i$ drawn uniformly from the domain (here $[0,1]$), the control-variate estimator with coefficient $\beta$ is

$$
\hat I_{\text{CV}} = \frac{1}{N}\sum_{i=1}^{N}\bigl[f(X_i) - \beta\, g(X_i)\bigr] + \beta\,G .
$$

It is unbiased for every $\beta$, because $\mathbb E[g(X)] = G$. Its variance is

$$
\operatorname{Var}[\hat I_{\text{CV}}] = \frac{1}{N}\left(\sigma_f^2 - 2\beta\,\operatorname{Cov}(f,g) + \beta^2\sigma_g^2\right),
$$

a parabola in $\beta$. Setting the derivative to zero gives $\beta^* = \operatorname{Cov}(f,g)/\sigma_g^2$, and substituting back gives $\operatorname{Var} = \sigma_f^2(1-\rho^2)/N$, where $\rho$ is the correlation between $f(X)$ and $g(X)$. The better $g$ tracks $f$, the closer $\rho^2$ is to 1 and the more variance disappears.

**Worked example.** Take $f(x) = e^x$ on $[0,1]$ ($I = e-1 \approx 1.71828$) and $g(x) = 1 + x$ ($G = 1.5$). Then $\sigma_f^2 = \frac{e^2-1}{2} - (e-1)^2 \approx 0.24204$, $\sigma_g^2 = 1/12$, and $\operatorname{Cov}(f,g) = \mathbb E[xe^x] - \tfrac12(e-1) = 1 - 0.85914 = 0.14086$. So $\beta^* \approx 1.690$ and $\rho^2 \approx 0.9837$. With $N = 8$ samples, the plain estimator has standard deviation $\sqrt{0.24204/8} \approx 0.174$, and the control-variate estimator $\sqrt{0.24204 \cdot 0.0163/8} \approx 0.022$: about 60 times less variance for the same samples.

The same numbers from a simulation, with $\beta$ fitted from samples as a renderer would do:

```python
import numpy as np

rng = np.random.default_rng(0)
f = np.exp                      # integrand on [0, 1]
g = lambda x: 1 + x             # control variate with known integral G
I, G = np.e - 1, 1.5

x = rng.random(1_000_000)       # pilot samples to fit beta
beta = np.cov(f(x), g(x))[0, 1] / np.var(g(x), ddof=1)

X = rng.random((100_000, 8))    # 100k independent estimates, N = 8 samples each
mc = f(X).mean(axis=1)
cv = (f(X) - beta * (g(X) - G)).mean(axis=1)
print(round(beta, 3), round(mc.std(), 3), round(cv.std(), 4))   # about 1.69 0.174 0.022
print(round(mc.mean(), 3), round(cv.mean(), 3), round(I, 3))     # 1.718 1.718 1.718: both unbiased
```

{% include blog_figure.liquid path="assets/img/blog/graphics/13-control-variate.svg" caption="Left: the integrand $f(x)=e^x$ and the scaled control variate $\beta g(x)$ with the fitted $\beta\approx1.69$. Only the thin grey gap between them is left for Monte Carlo. Right: histograms of 4000 independent estimates with $N=8$ samples each; the plain estimate (purple) spreads widely around the dashed true value, while the control-variate estimate (orange) is a narrow spike. The standard deviations in the legend match the worked example." %}

In rendering, $g$ is never a toy polynomial. It can be the colour seen at neighbouring pixels or in the previous frame (ReSTCV below), a fitted lighting model, or a neural network's prediction (the neural control variates line of work). The estimator and the reason it helps are exactly the ones above.

### The works

**[A Generalizable Light Transport 3D Embedding for Global Illumination](https://arxiv.org/abs/2510.18189)**: Bing Xu et al., *SIGGRAPH 2026 Conference Papers*, published, July 2026. Most learned shortcuts for global illumination (GI) still need a path tracer or rasterized lighting buffers as input. Here a transformer encodes the scene itself, a point cloud carrying geometry and materials, into a 3D embedding. At render time the lighting at a query point is predicted by gathering nearby embedding points with cross-attention. The embedding is meant to generalize across scenes and to be adapted to other rendering tasks. It builds on the rendering equation of [chapter 4]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}) and the GI problem of [chapter 5]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}).
{: #fw-lt-embedding}

**[Gaussian Light Transport](https://arxiv.org/abs/2609.11430)** ([project](https://patrick-attimont.com/projects/gaussian-light-transport/)): Patrick Attimont et al., *SIGGRAPH Asia 2026 (Conference Track)*, accepted, December 2026. The view-independent part of GI is represented as a mixture of Gaussians over position, direction, normal and material. Their parameters are fitted by making the mixture satisfy the rendering equation, that is, by minimizing the residual between the mixture and one application of the transport operator, in the spirit of Neural Radiosity. A culling step keeps the fit tractable, and evaluating the mixture is fast enough for real-time display. The paper is interesting because the Gaussian primitive, familiar from [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}), is used here to solve the light transport itself rather than to fit photographs. Builds on [chapter 4]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}).
{: #fw-gaussian-lt}

**[Spatio-Temporal Control Variates with ReSTIR for Real-Time Rendering](https://doi.org/10.1145/3799902.3811113)** ([project](https://hercier.github.io/restcv/)): Zhong Shi et al., *SIGGRAPH 2026 Conference Papers*, published, July 2026. ReSTIR keeps one sample per pixel, chosen by a scalar target such as luminance, so scenes with differently coloured lights show colour noise at low sample counts. The paper adds control variates, exactly the estimator derived above: colour estimates accumulated from neighbouring pixels and earlier frames serve as $g$, and the reservoir samples estimate only the difference. The authors report lower and more stable colour variance at modest cost. It is a direct extension of the RIS and reservoir machinery of [chapter 6]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}).
{: #fw-restcv}

**[ToF ReSTIR: Time-of-Flight Rendering with Spatio-temporal Reservoir Resampling](https://arxiv.org/abs/2605.11536)**: Juhyeon Kim et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. Time-of-flight sensors (lidar, gated cameras) record when light arrives, not only how much. When ReSTIR reuses a path from a neighbouring pixel, the reused path generally has a different optical length, which breaks the time constraint. The paper designs a shift mapping that respects path length, so spatiotemporal reuse works for transient and time-gated rendering at interactive rates. It shows how flexible the "shift map + Jacobian" view of [chapter 6]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}) has become, and it matters for simulating sensors for robots and cars.
{: #fw-tof-restir}

**[Neural Caching of Prefiltered Radiance for Specular Lighting](https://arxiv.org/abs/2610.11702)**: Dmitrii Klepikov et al., arXiv preprint, October 2026. Neural radiance caching (an online-trained network that stores indirect light, [chapter 6]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})) handles diffuse light well but struggles with sharp specular lobes. This preprint indexes the cache by the reflection direction and trains it on radiance *prefiltered* by roughness. It then combines the cache with a precomputed BRDF table through the split-sum approximation familiar from image-based lighting in [chapter 4]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}). The authors report better specular quality than standard caching on their test scenes.
{: #fw-prefiltered-nrc}

**[Beyond Positional Encoding: A 5D Spatio-Directional Hash Encoding](https://arxiv.org/abs/2603.05079)**: Philippe Weier et al., arXiv preprint, March 2026. Multiresolution hash grids, the encoding behind fast radiance fields ([neural rendering 3]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})), work well for positions but poorly for directions on the sphere. The paper builds a hierarchical geodesic grid for directions and combines it with the spatial hash grid into one 5D encoding. Its main application is neural **path guiding**, learning where light comes from so that the path tracer of [chapter 5]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}) samples important directions more often. The authors report lower variance at equal sample count.
{: #fw-hash-5d}

**Where the area is heading.** Three directions stand out. First, the ReSTIR family keeps absorbing classic Monte Carlo tools: control variates, path guiding and new shift mappings. Second, "neural inside the renderer" is turning specific: caches, encodings and embeddings tailored to one sub-problem replace generic MLPs. Third, the Gaussian primitive is spreading from scene representation into light transport itself. Spectral and volumetric transport are covered in the [volumes chapter]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }}) and the real-time GI systems in [chapter 11]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }}).

## 4. Neural and hybrid representations

3D Gaussian Splatting (3DGS) made millions of soft, view-dependent ellipsoids a standard scene representation. The 2026 papers ask graphics questions about them: can we *ray trace* them? Can we drop the sort? Which primitive suits hair? In parallel, neural networks are entering the material and texture pipeline of real-time engines.

### Explain one idea: where a ray meets a 3D Gaussian

Rasterizing 3DGS projects each Gaussian to a 2D ellipse ([neural rendering 4]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})). Ray tracing instead evaluates each Gaussian along the ray, which handles distorted cameras, reflections and secondary rays. The question every Gaussian ray tracer must answer is: *where along the ray does this Gaussian contribute most, and how much?*

**Formula.** A Gaussian with mean $\boldsymbol\mu$ and covariance $\Sigma$ has density $G(\mathbf x) = \exp\left(-\tfrac12 q(\mathbf x)\right)$, where $q(\mathbf x) = (\mathbf x-\boldsymbol\mu)^\top\Sigma^{-1}(\mathbf x-\boldsymbol\mu)$ is the squared Mahalanobis distance. On the ray $\mathbf x(t) = \mathbf o + t\mathbf d$, $q$ is a quadratic in $t$:

$$
q(t) = (\mathbf o + t\mathbf d - \boldsymbol\mu)^\top \Sigma^{-1} (\mathbf o + t\mathbf d - \boldsymbol\mu),
\qquad
\frac{dq}{dt} = 2\,\mathbf d^\top\Sigma^{-1}(\mathbf o + t\mathbf d - \boldsymbol\mu).
$$

Setting the derivative to zero gives the peak

$$
t^* = \frac{\mathbf d^\top\Sigma^{-1}(\boldsymbol\mu - \mathbf o)}{\mathbf d^\top\Sigma^{-1}\mathbf d},
\qquad
G_{\max} = \exp\!\left(-\tfrac12\, q(t^*)\right).
$$

$t^*$ is *not* the point of the ray closest to $\boldsymbol\mu$ in ordinary distance. It is the closest point in the metric of the Gaussian, which stretches space along the short axes.

**Worked example.** Let $\boldsymbol\mu = \mathbf 0$, $\Sigma = \operatorname{diag}(4,1,1)$ (standard deviations 2, 1, 1), $\mathbf o = (-4,-1,0)$ and $\mathbf d = (1,1,0)/\sqrt2$. Then $\Sigma^{-1} = \operatorname{diag}(0.25,1,1)$, $\mathbf d^\top\Sigma^{-1}(\boldsymbol\mu-\mathbf o) = (0.25\cdot4 + 1)/\sqrt2 = 1.4142$ and $\mathbf d^\top\Sigma^{-1}\mathbf d = 0.625$, so $t^* = 2.263$. The point is $(-2.4, 0.6, 0)$ with $q = 0.25\cdot5.76 + 0.36 = 1.8$, hence $G_{\max} = e^{-0.9} = 0.407$. The Euclidean closest point, at $t = \mathbf d\cdot(\boldsymbol\mu-\mathbf o) = 3.536$, has only $G = e^{-1.406} = 0.245$.

```python
import numpy as np

Sigma = np.diag([4.0, 1.0, 1.0]); Si = np.linalg.inv(Sigma)
mu = np.zeros(3)
o = np.array([-4.0, -1.0, 0.0]); d = np.array([1.0, 1.0, 0.0]) / np.sqrt(2)

t_star = d @ Si @ (mu - o) / (d @ Si @ d)
x = o + t_star * d - mu
print(t_star, np.exp(-0.5 * x @ Si @ x))      # 2.2627..., 0.4066...

t_e = d @ (mu - o)                             # closest point in Euclidean distance
y = o + t_e * d - mu
print(t_e, np.exp(-0.5 * y @ Si @ y))          # 3.5355..., 0.2451...
```

{% include blog_figure.liquid path="assets/img/blog/graphics/13-gaussian-ray.svg" caption="Left: a rotated anisotropic 3D Gaussian (its 1-sigma ellipsoid) and three parallel rays with increasing offset; the square marks each ray origin and the dot its peak point $t^*$. Right: the response $G(\mathbf o+t\mathbf d)$ along each ray, computed from the formula. Each curve is a 1D Gaussian in $t$ whose maximum sits at $t^*$ (dashed). The value printed at the peak is $G_{\max}$, and it falls quickly with the offset because the ray passes along a short axis." %}

Try the same computation in 2D. The widget starts with exactly the worked example ($\sigma_x = 2$, $\sigma_y = 1$, $\mathbf o = (-4,-1)$, direction $(1,1)/\sqrt2$), so its readout shows $t^* = 2.26$, $G = 0.407$ and, for the Euclidean point, $t = 3.54$, $G = 0.245$.

<div id="gr-i18n" hidden data-drag="Drag the square (ray origin) or the circle (direction); the sliders rotate and stretch the Gaussian." data-rot="Rotation" data-peak="peak" data-eucl="closest point" data-reset="Reset"></div>

{% include widget.liquid name="graphics-gaussian-ray" height="470" caption="Purple: the peak $t^*$, where the ray touches a level ellipse of the Gaussian (dashed purple). Grey: the closest point in ordinary distance, where the ray touches a circle around the mean (dashed grey). The plot below shows $G$ along the ray. Rotate or stretch the Gaussian and watch the two points separate: in general they differ, and they coincide only in special cases such as an isotropic Gaussian, a ray parallel to a principal axis, or a ray through the mean." %}

A Gaussian ray tracer wraps each Gaussian in a bounding proxy (for example a stretched icosahedron) inside a BVH ([chapter 5]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})), collects the hits along the ray, evaluates $G_{\max}$ and the opacity for each, and alpha-composites them in depth order exactly as volume rendering does. The papers below are about making this fast and about alternatives to it.

### The works

**[GRay: Ray Tracing 3D Gaussians Near the Speed of Splats](https://arxiv.org/abs/2606.30869)**: Yohan Poirier-Ginter et al., *I3D 2026 (PACMCGIT 9(1))*, published, May 2026. Ray-traced Gaussians support effects that rasterization cannot, such as wide-angle cameras and secondary rays, but they have been much slower than splatting. GRay is a faster Gaussian ray tracer. The paper also argues that ray tracing *scales better* than rasterization once a scene contains very many small Gaussians, as dense initializations produce. The authors report several-fold faster rendering and optimization than the earlier 3DGRT. It joins the BVH material of [chapter 5]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}) with [3DGS]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}).
{: #fw-gray}

**[Gaussian Point Splatting](https://doi.org/10.1145/3811272)** ([project](https://jorisar.nl/gaussian_point_splatting/)): Joris Rijsdijk et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. Standard 3DGS must sort Gaussians by depth and blend them tile by tile, which scales poorly to huge scenes. This method instead draws random, pixel-sized *opaque* points from the visible Gaussians and writes them with 64-bit atomic depth tests, a form of stochastic transparency with a correction for collisions. Without sorting, the cost grows gracefully, and the project page shows hundreds of millions of Gaussians at interactive rates on one GPU. It connects the visibility and z-buffer ideas of [chapter 2]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }}) to splatting.
{: #fw-gps}

**[Inverse Rendering for Modeling with Line Primitives](https://arxiv.org/abs/2609.00625)** ([project](https://kenji-tojo.github.io/sa26-line-primitives/)): Kenji Tojo et al., *SIGGRAPH Asia 2026 (ACM TOG)*, accepted, December 2026. Hair, fur and fabrics are fuzzy: surfaces cannot represent them, and volumetric Gaussians spend many primitives on them. The paper reconstructs such scenes as explicit line segments, rasterized on a subpixel grid for anti-aliasing. A stochastic differentiable rasterizer supplies gradients for positions, attributes and even connectivity. It is a good example of choosing the primitive to match the content, with the gradient tools of [chapter 12]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }}).
{: #fw-line-primitives}

**[Neural Texture Compression using Hypernetworks](https://arxiv.org/abs/2606.26913)**: Laurent Belcour, *EGSR 2026*, published, July 2026. Neural texture compression stores a material's textures as a small latent grid plus a tiny decoder network. Most methods must run a separate optimization for every material, which slows content pipelines. Here one *hypernetwork*, a network that outputs the weights of another network, predicts both the latents and the decoder weights directly from the input textures. The author reports quality close to per-material optimization and extensions to several decoders and to super-resolution. Builds on the texture pipeline of [chapter 3]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }}).
{: #fw-ntc-hyper}

**[A Hybrid Neural-Microfacet BRDF Model for Real-Time Rendering](https://arxiv.org/abs/2608.09604)** ([project](https://ubisoft-laforge.github.io/world/hybridrdf)): Louis De Oliveira et al., *EGSR 2026 (CGF)*, published, July 2026. Analytic microfacet BRDFs are cheap but fit measured materials imperfectly. Pure neural BRDFs fit well but cost more to evaluate. The hybrid keeps a GGX microfacet model ([chapter 4]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})) and adds a small network that corrects its output. At equal memory the authors report a better fit to measured data than earlier neural models, with modest overhead. The analytic part keeps the familiar structure (and importance sampling), and the network learns only the residual.
{: #fw-hybrid-brdf}

**[Extracting Neural Materials from Images](https://arxiv.org/abs/2606.26715)** ([project](https://nvlabs.github.io/neumatex/)): Kim Youwang et al., arXiv preprint, June 2026. Neural materials are richer than the base-colour/roughness/metallic parameters of [chapter 4]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}), but recovering them from photos is hard. The method first predicts albedo, specular latents and an uncertainty map with a feed-forward network. It then refines them by test-time optimization through a differentiable path tracer ([chapter 12]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})), using the uncertainty to decide how strongly to regularize. It is a template for "learned prior + physically based refinement".
{: #fw-neumatex}

**Where the area is heading.** Gaussians are becoming a first-class primitive of the graphics pipeline: ray-traced, sort-free, or replaced by better-suited primitives such as lines. The [3DGS frontiers chapter]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}) covers the vision side. Inside engines, neural components are entering as *hybrids*: a classic structure (microfacet BRDF, block-compressed texture) plus a learned correction, which keeps performance predictable. The [engine chapter on AI]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }}) follows these components into production.

## 5. Geometry and modeling

The [geometry processing chapter]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) covers meshes, discrete differential geometry, remeshing and implicit surfaces. 2026 geometry research does two things with them: it uses learning to automate tasks that needed an expert (quad layouts, CAD edits), and it builds systems that make geometry algorithms differentiable or much faster.

**[B-repLer: Language-guided Editing of CAD Models](https://arxiv.org/abs/2508.10201)** ([project](https://yilinliu77.github.io/brepler.github.io/)): Yilin Liu et al., *SIGGRAPH 2026 Conference Papers*, published, July 2026. CAD models are stored as boundary representations (B-reps): trimmed parametric surfaces glued along edges. Editing them by text usually requires the construction history, which is often missing. B-repLer maps a text instruction to an edit of the B-rep itself in a learned latent space, trained on a large paired dataset built with CAD tools and multimodal language models. It works on history-free parts, from prismatic to freeform B-spline shapes. Builds on the surface representations of [chapter 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}).
{: #fw-brepler}

**[SQuadGen: Generating Simple Quad Layouts via Chart Distance Fields](https://arxiv.org/abs/2604.27329)** ([project](https://youkang-kong.github.io/squadgen/)): Youkang Kong et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. Artists want quad meshes with few, clean edge loops, but automatic quad remeshing tends to produce complicated layouts. Instead of predicting discrete connectivity, the method trains a diffusion model on a continuous field defined on the surface, the chart distance field, from which a layout is extracted. The authors also define loop-aware simplicity metrics and collect a large layout dataset. Builds on remeshing in [chapter 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}).
{: #fw-squadgen}

**[SAND: Spatially Adaptive Network Depth for Fast Sampling of Neural Implicit Surfaces](https://arxiv.org/abs/2604.25936)**: Chuanxiang Yang et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. A neural signed distance field (SDF) answers every query with the full network, although points far from the surface, or in simple regions, need far less accuracy. SAND attaches early-exit outputs to the hidden layers of the MLP and predicts, per location, how deep evaluation must go. This speeds up sphere tracing and surface extraction. It applies a classic level-of-detail idea to the neural fields of [chapter 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) and [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}).
{: #fw-sand}

**[Points as Tori: Fast Pointwise Signed Distance for Point Clouds](https://doi.org/10.1145/3811385)** ([project](https://nzfeng.github.io/research/PointsAsTori/index.html)): Nicole Feng et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. Computing a signed distance from an oriented point cloud usually needs a grid or a global solve. Here each point gets a small torus fitted to its neighbourhood by a pretrained network. A torus has a closed-form signed distance, and the per-point distances are blended by a kernel average, so evaluation needs no discretization at all. Offsetting and Boolean operations then work directly on raw scans. It is a neat use of the implicit-surface ideas of [chapter 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}).
{: #fw-tori}

**[Iskra: A System for Inverse Geometry Processing](https://arxiv.org/abs/2602.12105)**: Ana Dodik et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. Many geometry algorithms (mean-curvature flow, parameterization, as-rigid-as-possible deformation) are solved with fast special-purpose iterations such as local-global or ADMM solvers. To optimize *through* them, one would normally rewrite them in an autodiff framework and lose their speed. Iskra keeps the existing solver and generates the backward pass automatically with the adjoint method, and it plugs into machine-learning frameworks. It is the geometry counterpart of the differentiable rendering in [chapter 12]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }}).
{: #fw-iskra}

**Where the area is heading.** Learning targets the artist-facing *structure* of geometry (quad loops, CAD features, sewing panels) rather than raw triangles. At the same time, systems work (adjoints, adaptive evaluation, closed-form local primitives) keeps classical geometry processing fast and differentiable, so it can sit inside learning loops.

## 6. Physically based simulation

[Chapter 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}) built an XPBD cloth solver and surveyed rigid bodies and fluids. Research in 2026 is about robustness (contact that never fails), performance on GPUs, and gradients through whole simulations.

### Explain one idea: the IPC contact barrier

Incremental Potential Contact (IPC) guarantees that objects never interpenetrate. It does this by adding to the time-step energy a barrier that grows without bound as the distance $d$ between two primitives (point-triangle or edge-edge) goes to zero, and that vanishes beyond an activation distance $\hat d$:

$$
b(d) =
\begin{cases}
-(d-\hat d)^2 \ln\!\left(\dfrac{d}{\hat d}\right), & 0 < d < \hat d,\\[4pt]
0, & d \ge \hat d .
\end{cases}
$$

Check the properties: $b(\hat d) = 0$ and $b'(\hat d) = 0$, so the barrier switches on smoothly. As $d \to 0$, $-\ln(d/\hat d) \to \infty$, so no step of a line search that starts from a valid state can cross $d = 0$. The repulsive force is

$$
-b'(d) = 2(d-\hat d)\ln\!\left(\frac{d}{\hat d}\right) + \frac{(d-\hat d)^2}{d}.
$$

Numerically, with $\hat d = 1$: $b(0.5) = 0.25\ln 2 = 0.173$, $b(0.1) = 0.81\ln 10 = 1.865$ and $b(0.01) = 0.9801\ln 100 = 4.513$. The energy grows only logarithmically, but the force grows like $\hat d^2/d$.

```python
import numpy as np

def barrier(d, dhat):
    return np.where(d < dhat, -(d - dhat) ** 2 * np.log(d / dhat), 0.0)

print(barrier(np.array([0.01, 0.1, 0.5, 2.0]), 1.0))   # about [4.513 1.865 0.173 0.]
```

{% include blog_figure.liquid path="assets/img/blog/graphics/13-ipc-barrier.svg" caption="Left: the IPC barrier $b(d)$ for two activation distances $\hat d$ (dotted lines). It is exactly zero beyond $\hat d$, joins smoothly at $\hat d$, and rises without bound as $d\to0$. Right: the repulsive force $-b'(d)$, which grows roughly like $\hat d^2/d$. A smaller $\hat d$ lets objects come closer before they feel each other, at the price of a stiffer problem." %}

Compared with XPBD's projection of a penetration constraint, the barrier turns contact into a smooth (if stiff) energy that Newton's method can minimize. The price is a nonlinear solve with many contact pairs per step, which is why so much 2026 work is about GPU solvers and code generation.

### The works

**[YASPS: A Symbolic Framework for Extensible, High-Performance IPC Simulation](https://arxiv.org/abs/2605.23088)**: Xuan Tang et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. Fast IPC solvers are normally hand-written per energy and per primitive type, so trying a new material or contact model means rewriting GPU code. YASPS lets the user describe energies symbolically, derives the Hessian sparsity and compressed layouts automatically, and JIT-compiles CUDA kernels. Examples include cloth, mixed rigid and deformable bodies, and cage-based deformation. Builds on [chapter 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}) and links to [physics engines]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }}).
{: #fw-yasps}

**[Locality-Aware Automatic Differentiation on the GPU for Mesh-Based Computations](https://arxiv.org/abs/2509.00406)**: Ahmed H. Mahmoud et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. General autodiff frameworks build a global computation graph and ignore that a mesh energy is a sum of small terms, each touching only a few vertices. This system differentiates each element in forward mode, in registers and shared memory, and assembles gradients, sparse Jacobians and Hessians directly on the GPU. That makes Newton-type solvers for cloth and elasticity both easier to write and faster than with general tensor frameworks. Relevant to [chapter 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}) and [chapter 12]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }}).
{: #fw-mesh-ad}

**[DiffSurFlow: Efficient and Robust Differentiable Fluid Optimization via Surrogate Strategy on Flow Map](https://doi.org/10.1145/3811337)** ([project](https://illusionarydream.github.io/DiffSurFlowPage/)): Yuhao Quan et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. Differentiating a long fluid simulation (to steer smoke into a target shape, for example) is expensive in time and memory. The authors observe that the links between time steps through the flow map carry most of the gradient. They build a surrogate gradient that keeps those links and prunes redundant adjoint work. Inverse fluid design becomes cheaper and more robust. It extends the fluids of [chapter 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}) with the adjoint ideas of [chapter 12]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }}).
{: #fw-diffsurflow}

**[Learnable Persistent Wrinkle Formation in Cloth Simulation](https://arxiv.org/abs/2609.13707)**: Deshan Gong et al., *SIGGRAPH Asia 2026*, accepted, December 2026. Real fabric keeps creases after being worn or folded, an elasto-plastic effect that standard cloth models (like the elastic springs and constraints of [chapter 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})) do not capture. The authors measured over a hundred fabrics under repeated loading and unloading. They fit a differentiable elasto-plastic cloth model with friction to the measured curves using adjoints. Simulated garments can then keep realistic persistent wrinkles.
{: #fw-wrinkles}

**[Curly Hair Simulation using Curly Finite Elements](https://arxiv.org/abs/2607.22103)**: Xinming Pei et al., arXiv preprint, July 2026. Curly and wavy hair couples strand-scale motion to fine helices and waves, which is expensive to resolve with many small rod segments. The preprint models each strand as a rod whose elements carry analytic wave or helix detail: bending drives the waves and twisting drives the spirals, with an energy split that separates stretching, buckling and bending. Collisions use coarse proxies plus the analytic detail, and guide strands interpolate to dense hair. It extends the rod and constraint models of [chapter 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}).
{: #fw-curly-hair}

**[MPM Lite: Linear Kernels and Integration without Particles](https://arxiv.org/abs/2602.07853)**: Xiang Feng et al., arXiv preprint, February 2026. The material point method (MPM) mixes particles and a grid to simulate snow, sand and other large-deformation materials ([chapter 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})). In implicit MPM, integrating forces over many particles with wide kernels makes each solve expensive. MPM Lite resamples the particle state onto fixed quadrature points of a voxel hexahedral mesh with compact linear kernels, so force computation and time integration never touch particles. The result is a finite-element-like incremental-potential formulation that works with standard nonlinear solvers and preconditioners.
{: #fw-mpm-lite}

**Where the area is heading.** Simulation is turning into *software infrastructure*: symbolic energies, code generation and locality-aware autodiff on GPUs. Measured data (fabric tests) and adjoint methods are used to fit material models rather than tune them by hand. The same solvers sit inside robot simulators, which is why this section connects to [simulation platforms for embodied AI]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}).

## 7. Animation and characters

The [animation chapter]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}) covers skinning, IK, motion matching and physics-based characters. In 2026 the learning methods behind world models (diffusion, autoregressive transformers, large-scale pretraining) arrive in character animation, and GPU simulation makes physics-based skills cheap to learn.

**[ARDY: Autoregressive Diffusion with Hybrid Representation for Interactive Human Motion Generation](https://arxiv.org/abs/2607.08741)**: Kaifeng Zhao et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. Offline text-to-motion models are controllable but too slow for interaction, while online models lose control and long-range coherence. ARDY streams motion with a two-stage autoregressive diffusion transformer over explicit root features plus a latent body embedding, with a variable-length history. It accepts kinematic constraints and new text prompts on the fly, in real time. Builds on [chapter 9]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}) and the [diffusion foundations]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }}).
{: #fw-ardy}

**[GPC: Large-Scale Generative Pretraining for Transferable Motor Control](https://arxiv.org/abs/2606.29148)**: Yi Shi et al., *SIGGRAPH 2026 Conference Papers*, published, July 2026. Physics-based characters are usually trained one task at a time, and the controllers do not transfer. GPC learns a discrete vocabulary of motion codes, using finite scalar quantization, jointly with a reinforcement-learning policy that turns codes into joint actions in simulation. A GPT-style transformer then learns to predict the next code. The result is a pretrained generative controller that can be adapted to new tasks, a "foundation model" recipe for characters. Related to [RL for robots]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }}).
{: #fw-gpc}

**[InstantMimic: A High Performance System for Learning Physics-based Skills in Seconds](https://arxiv.org/abs/2609.09821)**: Ikjun Choi et al., *SIGGRAPH Asia 2026 Conference Papers*, accepted, December 2026. Even with GPU physics, training a character to imitate a motion clip wastes much of the hardware on overhead outside the solver: fragmented kernels and CPU-GPU traffic. InstantMimic runs simulation, environment logic, policy inference and updates in one GPU-native execution flow. The authors report training times of seconds per skill, which makes things like automatic hyperparameter search practical. It is the systems side of [chapter 9]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}) and of [simulation platforms]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}).
{: #fw-instantmimic}

**[Skinned Motion Retargeting via Artifact-driven Kinematic Prior Refinement](https://arxiv.org/abs/2609.06517)**: Seokhyeon Hong et al., *SIGGRAPH Asia 2026 (Journal Track)*, accepted, December 2026. Retargeting moves an animation to a character with a different skeleton and body shape, and neural retargeting often leaves self-penetrations (an arm through the torso). The method trains a transformer autoencoder with a cross-skeleton motion embedding. At refinement time it detects penetrations on the *skinned mesh* and turns them into a correction of the motion through a motion-to-vertex Jacobian. Builds on skinning and IK in [chapter 9]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}).
{: #fw-retarget}

**[Generalized Audio-Driven Synthesis of Precise Drummer Motion](https://arxiv.org/abs/2608.19055)**: Álvaro G. Iñesta et al., *SCA 2026 (Best Paper)*, published, July 2026. Drumming demands precise timing and stick placement, and earlier audio-to-motion methods relied on motion matching or MIDI input and generalized poorly to real recordings. This diffusion model uses two losses, one for skeleton integrity and one for stick precision. It is trained on a purpose-built dataset with augmentation for in-the-wild audio. The paper also proposes metrics for impact accuracy and audio-motion correlation. Builds on [chapter 9]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}).
{: #fw-drummer}

**[Multi-View Face and Gesture Animation with Dynamic Gaussians](https://arxiv.org/abs/2608.04722)**: Alireza Javanmardi et al., *SCA 2026 (CGF 45(8))*, published, July 2026. Avatar systems tend to capture either the head (and ignore the hands) or the whole body (and lose facial and finger detail). This pipeline models face and hands separately, fuses them with a parametric upper-body mesh, and attaches 3D Gaussians to the mesh for appearance. The authors also release a multi-view upper-body capture dataset with controlled expressions and gestures. It combines skinned meshes from [chapter 9]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}) with [Gaussian avatars]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}).
{: #fw-face-gesture}

**Where the area is heading.** Character animation is converging on the recipe of large models: tokenize motion, pretrain, then condition on text, audio or constraints. Physics enters through RL on very fast GPU simulators. Classic tools (skinning Jacobians, motion matching) survive as refinement and control layers on top of the learned models.

## 8. Imaging and displays

This section matters for AR and VR. A headset is a rendering system whose output is consumed by a human visual system, so display optics and perception become part of the rendering problem. Holographic near-eye displays, which reproduce the light *wavefront* and so can show true focus cues, were a strong theme of 2026.

### Explain one idea: a phase-only hologram by Gerchberg-Saxton

**Intuition.** A holographic display uses a spatial light modulator (SLM), a screen of pixels that delay coherent laser light by a programmable phase $\varphi$ but cannot change its amplitude. In the simplest (far-field) setup, the image the viewer sees is the Fourier transform of the field leaving the SLM. So we need a phase pattern whose Fourier transform has a prescribed *amplitude* $A$, and we may choose the image-plane phase freely.

**Formula.** With $\mathcal F$ the 2D Fourier transform, we want $\lvert\mathcal F\{e^{i\varphi}\}\rvert \approx A$. Gerchberg-Saxton alternates between the two planes and in each enforces what is known there:

$$
\varphi^{(k)} = \arg \mathcal F^{-1}\!\left\{A\,e^{i\psi^{(k-1)}}\right\},
\qquad
\psi^{(k)} = \arg \mathcal F\!\left\{e^{i\varphi^{(k)}}\right\}.
$$

The first step keeps the phase at the SLM and sets the amplitude to 1, because the SLM can only show phase. The second keeps the phase in the image and replaces the amplitude by the target. Each step projects onto what is known in that plane. This is the algorithm of Gerchberg and Saxton (1972), the ancestor of today's optimization-based hologram generation.

```python
import numpy as np

def gerchberg_saxton(A, iters, seed=0):
    psi = np.random.default_rng(seed).uniform(0, 2 * np.pi, A.shape)   # image-plane phase
    for _ in range(iters):
        phi = np.angle(np.fft.ifft2(A * np.exp(1j * psi)))   # phase-only SLM pattern
        R = np.fft.fft2(np.exp(1j * phi))                    # what the viewer sees
        psi = np.angle(R)
    return phi, np.abs(R) ** 2
yy, xx = np.mgrid[0:128, 0:128] - 63.5                       # target: ring plus cross
r = np.hypot(xx, yy)
A = ((r > 30) & (r < 38)).astype(float)
A[(abs(xx) < 4) & (abs(yy) < 22)] = 1.0
A[(abs(yy) < 4) & (abs(xx) < 22)] = 1.0
for k in (1, 5, 60):
    amp = np.sqrt(gerchberg_saxton(A, k)[1])
    s = (amp * A).sum() / (amp ** 2).sum()                   # best brightness scale
    print(k, round(np.sqrt(((s * amp - A) ** 2).mean() / (A ** 2).mean()), 3))
# 1 0.444 / 5 0.366 / 60 0.288: the relative error plotted in the figure below
```

{% include blog_figure.liquid path="assets/img/blog/graphics/13-hologram-gs.svg" caption="A real Gerchberg-Saxton run on a 128 × 128 target (ring and cross). Top: the target intensity $\lvert A\rvert^2$, the final phase-only SLM pattern $\varphi$ (cyclic colour map from $-\pi$ to $\pi$), and the relative error per iteration on a log scale. Bottom: the reconstructed intensity after 1, 5 and 60 iterations. The shape appears after one iteration but full of speckle; the error drops fast during the first iterations and then levels off, leaving residual speckle. Removing that speckle, and judging it the way people see it, is what the holography papers below are about." %}

Real systems add near-field propagation (the angular spectrum method), 3D content and camera-calibrated optics, and they replace Gerchberg-Saxton by gradient descent on a loss. That is why the *choice of loss* (HoOPOE) and of the *light transport* model (HoloPathTracer) are research questions.

### The works

**[HoloPathTracer: Fast and Accurate Wave Path Tracing for Holography](https://arxiv.org/abs/2606.14173)**: Wenbin Zhou et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. Computer-generated holograms are usually made in two steps: render radiance (images or layers), then propagate a wave from them. That split loses depth and view continuity and handles glossy or mirror-like surfaces poorly. HoloPathTracer uses Monte Carlo path tracing to solve the rendering equation and the wave-propagation integral together. It reuses paths to produce several time-multiplexed phase holograms cheaply. Hardware results show correct defocus, view-dependent appearance and reflections. It is [path tracing]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}) carried over to wave optics, aimed at the displays of [XR]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }}).
{: #fw-holopathtracer}

**[HoOPOE: A Holography-Optimized Perceptual ObjectivE function](https://arxiv.org/abs/2610.17474)**: Ethan Chen et al., *SIGGRAPH Asia 2026*, accepted, December 2026. Holograms on real SLMs show speckle, the grainy noise visible in the figure above, and ordinary image losses do not reflect how visible it is to people. The authors build a loss around human sensitivity to spatio-temporal frequency and colour, with parameters tuned for holography. In a user study on holograms of 3D scenes, participants preferred results optimized with it over the next-best loss. Any gradient-based hologram pipeline can adopt it. It connects to perception-aware rendering and to [XR]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }}).
{: #fw-hoopoe}

**[Dichoptic Foveation](https://arxiv.org/abs/2609.16385)**: Henry Kam et al., *SIGGRAPH 2026 Conference Papers*, published, July 2026. Foveated rendering lowers quality in the periphery, where the eye is less sensitive, and usually does it identically in both eyes. This work shows each eye *different* frequency content in the periphery, blurring one view and sharpening the other, and measures in a VR headset how the brain fuses the two. The measurements are converted to a just-objectionable-difference (JOD) scale and fitted with a perceptual model, which is then applied to foveated 360-degree video. It adds a binocular cue to the foveation in this site's [lab]({{ '/' | relative_url }}#lab) and to [XR rendering]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }}).
{: #fw-dichoptic}

**[PAColorHolo: A Perceptually-Aware Color Management Framework for Holographic Displays](https://arxiv.org/abs/2601.14766)**: Chun Chen et al., *ACM TOG 45(2)*, published, March 2026. A holographic display mixes red, green and blue lasers, and reproducing colours that *look* right is surprisingly hard. The framework combines a colour-space transform, adaptive control of the illumination, and a neural model of the camera's colour response used in calibration. It is validated in simulation, on an optical prototype and in a user study. Colour management is the display end of the colour pipeline that begins with the shading of [chapter 3]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }}).
{: #fw-pacolorholo}

**[Hybrid Foveated Path Tracing with Peripheral Gaussians for Immersive Anatomy](https://arxiv.org/abs/2601.22026)**: Constantin Kleinbeck et al., *IEEE VR 2026*, published, March 2026. Path tracing volumetric medical data in VR looks excellent but is too slow for a headset, while precomputed Gaussian splats are fast but must be prepared in advance. The system path-traces only the gaze region and shows a Gaussian approximation in the periphery that is rebuilt quickly and refined from the foveal renders. Depth-guided reprojection hides latency. It combines [real-time path tracing]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}) with [3DGS]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) in a gaze-contingent way.
{: #fw-hybrid-foveated}

**Where the area is heading.** Rendering for headsets is becoming *perception-driven and optics-aware*: losses modelled on human vision, binocular and gaze-contingent rendering, and physically based wave optics. For a researcher in AR/VR and HCI, these papers are the bridge between graphics and user studies.

## 9. Fabrication and design

Graphics methods for shape, simulation and optimization also design physical objects: 3D-printed parts, knits, kirigami and garments. Every work in this section is a SIGGRAPH 2026 paper.

**[AtomSlicer: Constant-Thickness Field-Aligned Non-Planar Slicing and Continuous Toolpaths for FFF](https://doi.org/10.1145/3811363)** ([project](https://xavierchermain.github.io/publications/atom-slicer)): Giovanni Cocco et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. Filament (FFF) printers usually print flat layers. Multi-axis printers can follow curved layers, which improves strength and surface quality, but the layers must keep a nearly constant thickness and the nozzle must avoid collisions. From orientation and direction fields on the part, the method builds non-planar layers and toolpaths that are continuous within each layer and as continuous as possible across layers. It also reports when a design cannot be fabricated. Builds on fields on surfaces from [chapter 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}).
{: #fw-atomslicer}

**[Surface Power Diagrams for Knit Singularity Placement](https://rahulmitra.xyz/projects/powerknit/)** (DOI [10.1145/3811401](https://doi.org/10.1145/3811401)): Rahul Mitra et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. Machine knitting a 3D shape needs a "knit graph" whose singularities (where rows start, end or merge) must be placed carefully. The paper generalizes power diagrams, weighted Voronoi diagrams, to curved meshes with modified geodesic heat kernels. It places singularities by a Lloyd-style iteration and adds ordering constraints that make helix-free knit graphs more reliable. Fabricated samples demonstrate the results. Builds on geodesics and Voronoi ideas from [chapter 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}).
{: #fw-powerknit}

**[IsoGami: Rigid-Deployable Kirigami Materials From Isohedral Tilings](https://thomaszewski.com/projects/isogami/index.html)** (DOI [10.1145/3799902.3811127](https://doi.org/10.1145/3799902.3811127)): Guo Han et al., *SIGGRAPH 2026 Conference Papers*, published, July 2026. Kirigami cuts a sheet so that it can expand into a new shape. A *rigid-deployable* design opens through a single motion without bending any tile. The method searches systematically over the isohedral tilings of the plane, varying the joint topology and tile shapes. Linkage analysis keeps only designs with exactly one degree of freedom, and their deployment is then simulated. An interactive browser and 3D-printed prototypes come with the paper. It relates to the constraint view of mechanics in [chapter 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}).
{: #fw-isogami}

**[Shellular Metamaterial Design via Compact Electric Potential Parametrization](https://arxiv.org/abs/2511.04025)**: Tianyi Huang et al., *SIGGRAPH 2026 Conference Papers*, published, July 2026. Shell-based metamaterials, periodic thin-walled structures, are strong at low density but hard to design and expensive to evaluate. Here a design is described by a few dozen electric charges, and the shell geometry is derived from the electric potential they create. A GPU homogenization pipeline computes the effective elastic properties quickly. Together they make interactive and inverse design for target stiffness possible, validated with printed prototypes. It uses implicit surfaces ([chapter 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})) and elasticity ([chapter 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})).
{: #fw-shellular}

**[Learning Sewing Patterns via Latent Flow Matching of Implicit Fields](https://arxiv.org/abs/2601.17740)**: Cong Cao et al., *SIGGRAPH 2026 Conference Papers*, published, July 2026. A garment is made from flat panels sewn together, and panel counts, shapes and stitches vary widely, which makes patterns awkward to generate. Each panel is encoded as a signed distance field for its boundary and an unsigned distance field for its seam endpoints, inside a latent space with differentiable meshing. A flow-matching model generates panel sets, and a separate module predicts the stitching. Applications include pattern estimation from images, completion and refitting. It combines the implicit fields of [chapter 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) with [flow matching]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }}).
{: #fw-sewing}

**Where the area is heading.** Computational design keeps moving from "simulate a given design" to "search or generate the design space": tilings, charge configurations, latent spaces of patterns. Fast GPU evaluation (homogenization, simulation) is what makes that interactive.

## 10. Generative 3D and 4D content

Generative models for 3D were covered from the world-model side in [3D and 4D world generation]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }}). The graphics venues contribute what production needs: native meshes with good topology, controllable Gaussians, layouts that respect rooms, and assets that can be simulated and animated.

**[Nexus: Native Mesh Generation with Diffusion](https://arxiv.org/abs/2607.13563)**: Hanxiao Wang et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. Most mesh generators either emit triangles as tokens one by one, autoregressively, or first generate a field and then extract a mesh. Both struggle with topology. Nexus diffuses the *vertices* directly, as coarse-to-fine sparse octree voxels. A second diffusion model generates per-vertex embeddings from which the connectivity is decoded. The authors report better results than autoregressive and two-stage baselines and a preference by 3D practitioners in a blind study. Builds on meshes ([chapter 8]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})).
{: #fw-nexus}

**[Generative 3D Gaussians with Learned Density Control](https://arxiv.org/abs/2605.16355)**: Runjie Yan et al., *SIGGRAPH 2026 Conference Papers*, published, July 2026. Generative Gaussian models usually place primitives on fixed grids or in fixed-size arrays, which wastes the budget on empty or simple regions. Here the Gaussian centres are sampled from a learnable density over an octree, trained with rendering supervision, and a latent diffusion model generates that representation from one image. A token anchoring scheme based on a Sobol sequence speeds up diffusion training. The number of primitives can be chosen at generation time. It joins the densification problem of [3DGS]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) with [diffusion]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }}).
{: #fw-triposplat}

**[CasLayout: Cascaded 3D Layout Diffusion for Indoor Scene Synthesis with Implicit Relation Modeling](https://arxiv.org/abs/2604.27361)**: Yingrui Wu et al., *SIGGRAPH 2026 (ACM TOG 45(4))*, published, July 2026. A generated room must respect walls, doors and windows and plausible relations between furniture, and dense relation graphs between all objects add noise. The method runs four conditional diffusion stages: object count and categories, sizes, latent relations, and finally oriented bounding boxes, with the architecture as constraints. Sparse relation graphs give control. It also supports zero-shot image-to-scene generation with language and vision-language models. Relevant to [3D world generation]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }}).
{: #fw-caslayout}

**[SIMART: Decomposing Monolithic Meshes into Sim-ready Articulated Assets via MLLM](https://arxiv.org/abs/2603.23386)** ([project](https://simart-mllm.github.io/)): Chuanrui Zhang et al., *SIGGRAPH 2026 Conference Papers*, published, July 2026. Robot simulators need articulated objects (cabinets with doors, drawers that slide), but scanned or generated meshes are single pieces. SIMART uses one multimodal large language model to split a mesh into parts *and* predict their joints together, avoiding error build-up across stages. A sparse 3D VQ-VAE keeps the number of tokens manageable. The paper demonstrates the assets in robot simulation. This is asset generation for [embodied-AI simulators]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}) and [engines]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }}).
{: #fw-simart}

**[R-DMesh: Video-Guided 3D Animation via Rectified Dynamic Mesh Flow](https://arxiv.org/abs/2605.13838)** ([project](https://r-dmesh.github.io/)): Zijie Wu et al., *SIGGRAPH 2026 Conference Papers*, published, July 2026. Animating a user's static mesh to follow a reference video breaks when the mesh starts in a different pose from the video. A VAE splits the input into a base mesh, relative motion and a learned *rectification* offset that aligns the start pose. A rectified-flow diffusion transformer conditioned on the video then generates the mesh animation. The authors built a dataset of over 500k simulated mesh sequences, which also supports retargeting and 4D generation. Builds on [chapter 9]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}) and [4D generation]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }}).
{: #fw-rdmesh}

**[GaussiAnimate: Rig Animatable Categories with Level of Dynamics](https://arxiv.org/abs/2604.08547)**: Jiaxin Wang et al., *SIGGRAPH Asia 2026*, accepted, December 2026. Dynamic 4D captures, stored as sequences of Gaussians or meshes, are hard to re-animate in new poses. The method compresses a sequence into free-form bones with skinning weights and extracts a curvature-based skeleton from the canonical shape. A non-learned, part-wise motion-matching step then retrieves and blends existing motions to synthesize new ones. It is template-free and handles topology changes. It joins the skinning and motion matching of [chapter 9]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}) with dynamic Gaussians from [3DGS frontiers]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}).
{: #fw-gaussianimate}

**Where the area is heading.** "Generate a pretty object" is giving way to "generate a *usable* asset": native meshes with good topology, primitives with a controllable budget, rooms with constraints, and objects that are articulated, rigged and ready for simulation. Graphics venues judge generative models by what a pipeline can do with the output.

## 11. Cross-cutting trends

{% include blog_figure.liquid path="assets/img/blog/graphics/13-trend-map.svg" localized="true" caption="Trend map: each line joins a topic of this chapter (left) to a blog chapter that teaches a prerequisite of one of its works (right); thicker lines mean more works. G = graphics, NR = neural rendering, WM = world models, EA = embodied AI, GE = graphics engine, followed by the chapter number. Node size on the right is the total number of links. Simulation (G07), geometry processing (G08) and animation (G09) are the most-used foundations, and almost every topic also reaches outside the graphics series." %}

Reading across the eight sections, the same few forces appear again and again.

1. **Neural primitives everywhere, but as hybrids.** Gaussians are now ray traced (GRay), point-splatted (Gaussian Point Splatting), used as a light-transport basis (Gaussian Light Transport) and attached to avatar meshes. Networks enter as *corrections* to classic models: a GGX BRDF plus a network, a block-compressed texture plus a decoder, a ReSTIR estimator plus a control variate. The classic structure keeps cost and behaviour predictable.
2. **Differentiability is infrastructure.** Iskra (geometry solvers), locality-aware autodiff (mesh energies), DiffSurFlow (fluids), the wrinkle model fitted by adjoints and the line-primitive rasterizer all treat gradients as something a system provides, not something each paper re-derives. This is the program of [chapter 12]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }}) carried into simulation and geometry.
3. **ML inside shaders and solvers.** Neural caches, hypernetwork-decoded textures and hybrid BRDFs are designed to run per pixel in real time, on the tensor hardware of modern GPUs. The [engine series]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }}) follows how these components land in production engines.
4. **Generative priors meet physical constraints.** Diffusion and flow matching now generate quad layouts, sewing patterns, meshes, rooms and motions, and the value added by graphics is in the constraints: topology, physical validity, seams, kinematics, simulation readiness.
5. **Simulation and rendering converge, and both feed embodied AI.** Time-of-flight ReSTIR simulates sensors, SIMART makes sim-ready assets, InstantMimic and GPC train physics-based skills at scale, and GPU contact solvers are the cores of robot simulators. This is the bridge to [world models]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}) and [embodied AI]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}), and to [physics engines]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }}).
6. **Perception becomes part of rendering.** Dichoptic foveation, holography-specific perceptual losses and perceptual colour management treat the human visual system as the last stage of the pipeline, a theme that matters for anyone building AR/VR systems.

## 12. How to follow graphics research

The field moves fast, but the information sources are stable. A practical routine:

- **Ke-Sen Huang's paper lists** ([kesen.realtimerendering.com](https://kesen.realtimerendering.com/)) collect, for each major venue, paper titles with links to the authors' pages, PDFs, videos and code as they appear. As of this writing there are 2026 pages for SIGGRAPH, SIGGRAPH Asia (conditionally accepted papers), Eurographics and I3D. This is the single best entry point.
- **ACM TOG and the ACM Digital Library** ([dl.acm.org/journal/tog](https://dl.acm.org/journal/tog)) for the definitive versions. SIGGRAPH journal-track papers appear in issue 4 of each volume, SIGGRAPH Asia's in issue 6; conference-track papers appear in separate proceedings. **Crossref** (`api.crossref.org/works/<doi>`) is a quick, open way to check a DOI's venue, volume and date.
- **arXiv cs.GR** ([arxiv.org/list/cs.GR/recent](https://arxiv.org/list/cs.GR/recent)): read the "comments" field. Authors usually write "Accepted to SIGGRAPH Asia 2026" there, and the absence of such a note means *preprint*. Related work also appears in cs.CV and cs.LG.
- **Eurographics Digital Library** ([diglib.eg.org](https://diglib.eg.org/)) for CGF, EGSR, SCA, SGP and HPG papers.
- **Technical Papers Fast Forward and videos.** Each SIGGRAPH and SIGGRAPH Asia opens with a fast-forward session in which every paper gets a very short pitch, and most papers have a supplementary video. Watching them is the fastest way to scan a whole conference. The official sites are [s2026.siggraph.org](https://s2026.siggraph.org/) and [asia.siggraph.org/2026](https://asia.siggraph.org/2026/).
- **Courses.** SIGGRAPH courses (for example the long-running *Physically Based Shading* and *Advances in Real-Time Rendering* series, linked from [blog.selfshadow.com](https://blog.selfshadow.com/)) are written to teach, and they are the best bridge from this blog to papers.
- **Open-source code.** Many papers link GitHub repositories from their project pages. Running the code of one paper per month teaches more than skimming ten.
- **Reading groups.** Pick one session of the fast forward per week, read one paper together, and try to reproduce one figure. The "explain one idea" boxes in this chapter are examples of the depth to aim for.

## Representative papers

A cross-section of this chapter, one or two per topic. All entries are listed with their status as of November 2026.

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Shi et al., *Spatio-Temporal Control Variates with ReSTIR for Real-Time Rendering* | SIGGRAPH 2026 Conference Papers | 2026 | [DOI](https://doi.org/10.1145/3799902.3811113) | Control variates inside ReSTIR; removes colour noise |
| Kim et al., *ToF ReSTIR* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2605.11536) | Path-length-aware reuse for time-of-flight rendering |
| Poirier-Ginter et al., *GRay: Ray Tracing 3D Gaussians Near the Speed of Splats* | I3D 2026 (PACMCGIT 9(1)) | 2026 | [arXiv](https://arxiv.org/abs/2606.30869) | Fast Gaussian ray tracing |
| Rijsdijk et al., *Gaussian Point Splatting* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [DOI](https://doi.org/10.1145/3811272) | Sort-free stochastic splatting of huge scenes |
| Kong et al., *SQuadGen* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2604.27329) | Diffusion on chart distance fields for clean quad layouts |
| Dodik et al., *Iskra: A System for Inverse Geometry Processing* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2602.12105) | Automatic adjoints for existing geometry solvers |
| Tang et al., *YASPS* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2605.23088) | Symbolic, JIT-compiled GPU IPC |
| Zhao et al., *ARDY* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2607.08741) | Real-time controllable autoregressive motion diffusion |
| Zhou et al., *HoloPathTracer* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2606.14173) | Path tracing and wave propagation solved together for holograms |
| Kam et al., *Dichoptic Foveation* | SIGGRAPH 2026 Conference Papers | 2026 | [arXiv](https://arxiv.org/abs/2609.16385) | Binocular perceptual model for foveated VR |
| Cocco et al., *AtomSlicer* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [DOI](https://doi.org/10.1145/3811363) | Constant-thickness non-planar slicing for multi-axis printing |
| Wang et al., *Nexus: Native Mesh Generation with Diffusion* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2607.13563) | Diffusing vertices and connectivity directly |
| Zhang et al., *SIMART* | SIGGRAPH 2026 Conference Papers | 2026 | [arXiv](https://arxiv.org/abs/2603.23386) | Sim-ready articulated assets from single meshes |
| Attimont et al., *Gaussian Light Transport* | SIGGRAPH Asia 2026 (to appear) | 2026 | [arXiv](https://arxiv.org/abs/2609.11430) | Gaussian mixtures as a solver for the rendering equation |

## Learning resources

- [Ke-Sen Huang's paper lists](https://kesen.realtimerendering.com/): the 2026 pages for SIGGRAPH, SIGGRAPH Asia, Eurographics and I3D.
- [ACM Transactions on Graphics](https://dl.acm.org/journal/tog) and the [Eurographics Digital Library](https://diglib.eg.org/).
- [arXiv cs.GR recent listings](https://arxiv.org/list/cs.GR/recent).
- The SIGGRAPH 2026 [technical papers program](https://s2026.siggraph.org/program/technical-papers/) and the SIGGRAPH Asia 2026 [technical papers page](https://asia.siggraph.org/2026/program/technical-papers/).
- For the four "explain one idea" boxes: Veach's thesis and PBRT ([pbr-book.org](https://pbr-book.org/)) on Monte Carlo variance reduction; Li et al., *Incremental Potential Contact* (ACM TOG 39(4), 2020, [DOI](https://doi.org/10.1145/3386569.3392425)); Goodman, *Introduction to Fourier Optics*, for holography.
- The figure script `bin/figures/graphics/graphics_13.py` and the data file `bin/figures/graphics/data/13-frontiers.json`. Update the JSON as papers are published and rerun the script; the explorer widget uses the same fields.

## Exercises

1. **Control variates.** In the worked example, replace $g(x) = 1+x$ by $g(x) = 1 + x + x^2/2$ (the second-order Taylor polynomial of $e^x$). Compute $G$, $\beta^*$ and the variance reduction, analytically or with NumPy.

   <details markdown="1"><summary>Hint</summary>
   $G = 1 + \tfrac12 + \tfrac16 = 5/3$, $\sigma_g^2 \approx 0.1889$ and $\operatorname{Cov}(f,g) \approx 0.2136$ (use $\mathbb E[x^2e^x] = e-2$), so $\beta^* \approx 1.131$ and $\rho^2 \approx 0.9981$. The residual variance is about 9 times smaller than with $1+x$, and roughly 500 times smaller than plain Monte Carlo.
   </details>

2. **Gaussian along a ray.** Prove that $q(t)$ is a convex quadratic in $t$ and that $q(t^*) = q(0) - \frac{(\mathbf d^\top\Sigma^{-1}(\boldsymbol\mu-\mathbf o))^2}{\mathbf d^\top\Sigma^{-1}\mathbf d}$. Then check it numerically with the snippet.

   <details markdown="1"><summary>Hint</summary>
   Write $q(t) = a t^2 - 2bt + c$ with $a = \mathbf d^\top\Sigma^{-1}\mathbf d > 0$, $b = \mathbf d^\top\Sigma^{-1}(\boldsymbol\mu-\mathbf o)$ and $c = q(0)$, and complete the square.
   </details>

3. **IPC barrier.** Show that $b$ is twice continuously differentiable at $d = \hat d$: compute $b'$ and $b''$ as $d \to \hat d$ from below and compare them with the values $0$ from above. Why does Newton's method care?

   <details markdown="1"><summary>Hint</summary>
   With $u = d - \hat d$, $b = -u^2\ln(1 + u/\hat d)$. Expand the logarithm: $b \approx -u^3/\hat d$ near $u = 0$, so $b'$ and $b''$ both tend to 0 from below and the barrier is $C^2$. Newton's method uses the Hessian, so a jump in $b''$ when a pair enters the active set would make the iteration stall or oscillate.
   </details>

4. **Holography.** Run the Gerchberg-Saxton snippet with 1, 5, 20 and 100 iterations on a target of your choice, and plot the error. Then use a *constant* initial phase instead of a random one. What happens, and why does a random phase help?

   <details markdown="1"><summary>Hint</summary>
   With a constant phase, $\mathcal F^{-1}\{A\}$ puts most of its energy into a few low-frequency SLM pixels. Forcing the amplitude to 1 flattens that spectrum, which acts like a strong high-pass filter: mainly the edges of the target survive, and the iteration tends to stagnate. A random phase spreads the energy evenly over the SLM, so the phase-only constraint loses less information, at the price of speckle.
   </details>

5. **Follow the field.** Open Ke-Sen Huang's SIGGRAPH Asia 2026 page, pick two papers that are not in this chapter, verify their status on arXiv or Crossref, and add them to `13-frontiers.json` with a topic, a month and the chapter they build on. Rerun the figure script and check the explorer.

This chapter closes the graphics series for now. From here, the [graphics-engine series]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}) shows how these ideas become software, and the [world-models]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}) and [embodied-AI]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }}) series show where graphics meets learning agents.
