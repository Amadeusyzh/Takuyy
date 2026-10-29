---
layout: post
title: "Ray tracing and path tracing: from intersections to unbiased global illumination"
date: 2026-10-27 09:05:00+0900
description: "Ray-sphere and Möller-Trumbore intersection, BVHs with the SAH, Monte Carlo integration, importance sampling, Russian roulette, next-event estimation and MIS, ending in a compact NumPy path tracer."
categories: graphics
tags: [ray-tracing, path-tracing, monte-carlo, bvh, importance-sampling, mis]
series: graphics
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## Why this matters

In the [previous post]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}) we wrote down the rendering equation and built physically based BRDFs, but we only evaluated them for a handful of point lights, the way a rasterizer does. The rendering equation is an integral over *all* incoming directions, and the light arriving from each direction is itself the solution of another rendering equation. **Path tracing** solves that recursive integral directly with Monte Carlo sampling: it shoots random rays, follows them as they bounce, and averages the results. It is the reference algorithm behind offline film rendering, the "ground truth" that real-time methods (next post) try to approximate, and the forward model that differentiable and neural renderers invert.

This post builds every piece from scratch: ray-primitive intersection, acceleration structures, Monte Carlo estimators, the variance-reduction tricks that make path tracing practical, and finally a ~130-line vectorized path tracer in NumPy.

## Prerequisites

- Vectors, dot and cross products, orthonormal bases ([post 1]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})).
- Radiance, solid angle, the rendering equation, BRDFs and the GGX microfacet model ([post 4]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})).
- Basic probability: random variables, expectation, variance, probability density functions (pdfs).
- Python with NumPy.

## 1. Rays and cameras

A ray is a half-line $\mathbf{r}(t) = \mathbf{o} + t\,\mathbf{d}$, $t > 0$, with origin $\mathbf{o}$ and unit direction $\mathbf{d}$. Rasterization asks "which pixels does this triangle cover?"; ray tracing asks the inverse question, "which surface does this pixel see?". For a pinhole camera at $\mathbf{e}$ looking down $-z$ with vertical field of view $\phi$, the ray through the pixel $(i, j)$ of a $W \times H$ image (with a random offset $\xi \in [0,1)^2$ inside the pixel, which gives anti-aliasing for free) is

$$
x = \frac{2(i+\xi_x)}{W} - 1,\qquad y = 1 - \frac{2(j+\xi_y)}{H},\qquad
\mathbf{d} = \operatorname{normalize}\!\left(x \tan\tfrac{\phi}{2}\,a,\; y \tan\tfrac{\phi}{2},\; -1\right),
$$

where $a = W/H$ is the aspect ratio (we use square images, so $a = 1$). Turner Whitted's 1980 ray tracer traced such rays, and at each hit recursively spawned shadow, reflection and refraction rays. That gave sharp mirrors and hard shadows, but no soft shadows, glossy reflections or color bleeding: those require integrating over directions, which is what the rest of this post is about.

The figure below draws these rays for a tiny $5\times5$ image of the Cornell box used in section 7, each one ending at the surface it actually hits.

{% include blog_figure.liquid path="assets/img/blog/graphics/05-camera-rays.svg" caption="Primary rays of a pinhole camera at $\mathbf{e}=(0,0,3.9)$ with a 40° field of view (y up, looking down $-z$). Each ray passes through one pixel centre of the purple image plane one unit in front of the eye and ends at its first hit (black dots), computed with the section 7 intersection code." %}

## 2. Ray-primitive intersection

### Spheres

Substitute the ray into $\lVert \mathbf{x} - \mathbf{c} \rVert^2 = r^2$. With $\mathbf{oc} = \mathbf{o} - \mathbf{c}$ and $\lVert \mathbf{d} \rVert = 1$:

$$
t^2 + 2\,b\,t + c' = 0,\qquad b = \mathbf{oc}\cdot\mathbf{d},\quad c' = \mathbf{oc}\cdot\mathbf{oc} - r^2,\qquad
t = -b \pm \sqrt{b^2 - c'} .
$$

A negative discriminant means a miss. We take the smaller positive root; if only the larger one is positive, the ray started inside the sphere (which happens for refraction).

The figure shows the three cases for rays starting outside the sphere, plus one ray that starts inside it.

{% include blog_figure.liquid path="assets/img/blog/graphics/05-ray-sphere.svg" caption="Left: four rays against a sphere of radius $r$. Right: the quadratic $t^2+2bt+c'$ of each ray; its roots are the hit distances. Blue has two positive roots (enter and exit), green touches the sphere (double root), gray never reaches zero (negative discriminant, a miss), and the orange ray starts inside, so its near root is negative (hollow dot) and only the far root counts." %}

### Triangles: the Möller-Trumbore algorithm

A point inside triangle $(\mathbf{v}_0, \mathbf{v}_1, \mathbf{v}_2)$ is $(1-u-v)\mathbf{v}_0 + u\mathbf{v}_1 + v\mathbf{v}_2$ with barycentric coordinates $u, v \ge 0$, $u + v \le 1$ (the same coordinates as in [post 2]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})). Setting it equal to the ray gives a $3 \times 3$ linear system in $(t, u, v)$. With $\mathbf{e}_1 = \mathbf{v}_1 - \mathbf{v}_0$, $\mathbf{e}_2 = \mathbf{v}_2 - \mathbf{v}_0$ and $\mathbf{T} = \mathbf{o} - \mathbf{v}_0$:

$$
\begin{bmatrix} -\mathbf{d} & \mathbf{e}_1 & \mathbf{e}_2 \end{bmatrix}
\begin{bmatrix} t \\ u \\ v \end{bmatrix} = \mathbf{T}.
$$

Cramer's rule and the scalar triple product identity $\det[\mathbf{a}\ \mathbf{b}\ \mathbf{c}] = (\mathbf{a}\times\mathbf{b})\cdot\mathbf{c}$ turn this into the Möller-Trumbore formulas (1997). With $\mathbf{P} = \mathbf{d}\times\mathbf{e}_2$ and $\mathbf{Q} = \mathbf{T}\times\mathbf{e}_1$:

$$
\det = \mathbf{e}_1\cdot\mathbf{P},\qquad
u = \frac{\mathbf{T}\cdot\mathbf{P}}{\det},\qquad
v = \frac{\mathbf{d}\cdot\mathbf{Q}}{\det},\qquad
t = \frac{\mathbf{e}_2\cdot\mathbf{Q}}{\det}.
$$

The algorithm needs no precomputed plane equation, and it can exit early as soon as $u$ or $v$ falls outside the triangle. A $\det$ close to zero means the ray is parallel to the triangle. The returned $u, v$ are exactly the weights used to interpolate normals and UVs at the hit point.

The figure uses the same test ray as the code below.

{% include blog_figure.liquid path="assets/img/blog/graphics/05-moller-trumbore.svg" caption="Möller-Trumbore on the test case of the code: the ray from $\mathbf{o}=(0.2,0.3,-1)$ along $+z$ hits the triangle $\mathbf{v}_0=(0,0,0)$, $\mathbf{v}_1=(1,0,0)$, $\mathbf{v}_2=(0,1,0)$ at $t=1$ with $(u,v)=(0.2,0.3)$. The hit point splits the triangle into three parts whose areas are the barycentric weights: red (opposite $\mathbf{v}_1$) is $u$, green (opposite $\mathbf{v}_2$) is $v$, blue is $1-u-v$. Right: the same hit in the $(u,v)$ parameter domain; the dashed ray misses because $u+v>1$." %}

```python
import numpy as np

def ray_sphere(o, d, c, r):
    """Smallest t > eps of o + t d hitting the sphere (|d| = 1), or inf."""
    oc = o - c
    b = np.dot(oc, d)                    # half of the usual 'b'
    disc = b * b - (np.dot(oc, oc) - r * r)
    if disc < 0:
        return np.inf
    s = np.sqrt(disc)
    for t in (-b - s, -b + s):           # near root first, then far root (ray starts inside)
        if t > 1e-6:
            return t
    return np.inf

def moller_trumbore(o, d, v0, v1, v2, eps=1e-9):
    """Ray vs many triangles. v0, v1, v2: (N, 3). Returns t, u, v (t = inf on miss)."""
    e1, e2 = v1 - v0, v2 - v0
    p = np.cross(d, e2)                  # P = D x E2
    det = np.sum(e1 * p, axis=1)
    ok = np.abs(det) > eps               # ray parallel to the triangle plane
    inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    s = o - v0                           # T = O - V0
    u = np.sum(s * p, axis=1) * inv
    q = np.cross(s, e1)                  # Q = T x E1
    v = (q @ d) * inv
    t = np.sum(e2 * q, axis=1) * inv
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > eps)
    return np.where(hit, t, np.inf), u, v

if __name__ == "__main__":
    o, d = np.array([0.2, 0.3, -1.0]), np.array([0.0, 0.0, 1.0])
    v0 = np.array([[0, 0, 0], [0, 0, 2.0]]); v1 = np.array([[1, 0, 0], [1, 0, 2.0]]); v2 = np.array([[0, 1, 0], [0, 1, 2.0]])
    t, u, v = moller_trumbore(o, d, v0, v1, v2)
    print(t, u, v)                       # [1. 3.] [0.2 0.2] [0.3 0.3]
    print(ray_sphere(np.zeros(3), d, np.array([0, 0, 5.0]), 1.0))  # 4.0
    print(ray_sphere(np.zeros(3), d, np.zeros(3), 1.0))            # 1.0 (from inside)
```

## 3. Acceleration structures: BVH and the SAH

Testing every ray against every triangle costs $O(N)$ per ray; a film frame has millions of triangles and billions of rays. A **bounding volume hierarchy** (BVH) is a binary tree in which each node stores an axis-aligned bounding box (AABB) enclosing all primitives below it. A ray that misses a box skips its whole subtree, so traversal is roughly $O(\log N)$ for well-built trees.

The figure shows a BVH built with the SAH code below over a toy 2D scene, and one ray traversing it.

{% include blog_figure.liquid path="assets/img/blog/graphics/05-bvh.svg" caption="Top: a SAH BVH (leaf size 2, built with the code below) over 24 boxes; outlines are coloured by tree depth, from dark (root) to light (deep). Bottom: the same tree. Traversing the purple ray as `traverse` does, filled nodes are boxes the ray entered, open nodes were tested and rejected by the slab test, and faded nodes were never tested at all. Only 5 of 25 nodes are visited before the closest hit (orange box) is found." %}

**Ray-box test (slab method).** An AABB is the intersection of three slabs $l_k \le x_k \le h_k$. The ray is inside slab $k$ for $t \in [\min(t_{0k}, t_{1k}), \max(t_{0k}, t_{1k})]$ with $t_{0k} = (l_k - o_k)/d_k$ and $t_{1k} = (h_k - o_k)/d_k$. The ray hits the box iff the largest entry time is not larger than the smallest exit time. Precomputing $1/d_k$ makes this a handful of multiply-adds; IEEE infinities handle axis-parallel rays.

**How to split: the surface area heuristic (SAH).** For a convex body $B$ inside a convex body $A$, the probability that a uniformly random line hitting $A$ also hits $B$ is $SA(B)/SA(A)$, the ratio of surface areas (a classic result from integral geometry). Goldsmith and Salmon (1987) and MacDonald and Booth (1990) used this to estimate the expected cost of a split of node $P$ into children $L$ and $R$:

$$
C(L, R) = C_{\text{trav}} + \frac{SA(L)}{SA(P)}\,N_L\,C_{\text{isect}} + \frac{SA(R)}{SA(P)}\,N_R\,C_{\text{isect}},
$$

and compare it with the cost $N_P\,C_{\text{isect}}$ of keeping $P$ as a leaf. A builder sorts primitive centroids along each axis, sweeps all split positions with prefix and suffix bounding boxes, and recurses on the best one. Production builders bin centroids into 16-32 buckets instead of sorting, build in parallel (or on the GPU with linear BVHs), and use wider trees (4-8 children) to match SIMD units. Hardware ray tracing (next post) is BVH traversal in fixed-function silicon.

For the root of the toy scene above, the sweep looks like this:

{% include blog_figure.liquid path="assets/img/blog/graphics/05-sah-cost.svg" caption="SAH cost $C(L,R)$ of every candidate split of the 24 boxes, sorted by centroid along $x$ (top) and $y$ (bottom), with $C_{\text{trav}}=C_{\text{isect}}=1$. Splits near the ends put almost everything on one side and cost nearly as much as a leaf (dashed line, 24). The builder takes the overall minimum (orange star, a split along $y$ into 11 and 13 boxes, cost about 10.4)." %}

```python
import numpy as np

def sah_split(lo, hi, cent, c_trav=1.0, c_isect=1.0):
    """Best SAH split of the primitives with bounds lo/hi (N,3) and centroids cent (N,3).
    Sweeps all N-1 split positions along each axis. Returns (cost, axis, order, k):
    the left child holds order[:k]."""
    n = len(cent)
    def area(l, h):
        e = np.maximum(h - l, 0)
        return 2 * (e[..., 0] * e[..., 1] + e[..., 1] * e[..., 2] + e[..., 2] * e[..., 0])
    parent = area(lo.min(0), hi.max(0))
    best = (c_isect * n, None, None, None)          # cost of making a leaf
    for axis in range(3):
        order = np.argsort(cent[:, axis])
        l, h = lo[order], hi[order]
        # prefix bounds (left side) and suffix bounds (right side)
        a_left = area(np.minimum.accumulate(l), np.maximum.accumulate(h))[:-1]
        a_right = area(np.minimum.accumulate(l[::-1])[::-1], np.maximum.accumulate(h[::-1])[::-1])[1:]
        k = np.arange(1, n)
        cost = c_trav + c_isect * (a_left * k + a_right * (n - k)) / parent
        i = np.argmin(cost)
        if cost[i] < best[0]:
            best = (cost[i], axis, order, i + 1)
    return best

def build(lo, hi, idx, leaf_size=2):
    """Recursive SAH BVH. Node = dict with box and either children or primitive ids."""
    node = {"lo": lo[idx].min(0), "hi": hi[idx].max(0)}
    if len(idx) <= leaf_size:
        node["prims"] = idx; return node
    cost, axis, order, k = sah_split(lo[idx], hi[idx], 0.5 * (lo[idx] + hi[idx]))
    if axis is None:                                 # leaf is cheaper than any split
        node["prims"] = idx; return node
    node["kids"] = (build(lo, hi, idx[order[:k]], leaf_size), build(lo, hi, idx[order[k:]], leaf_size))
    return node

def hit_box(o, inv_d, lo, hi, t_max):
    """Slab test: does the ray enter [lo, hi] before t_max?"""
    t0, t1 = (lo - o) * inv_d, (hi - o) * inv_d
    t_near = np.max(np.minimum(t0, t1)); t_far = np.min(np.maximum(t0, t1))
    return t_near <= t_far and t_far > 0 and t_near < t_max

def traverse(node, o, d, isect):
    """Closest hit. isect(prims, o, d) -> array of t. Uses a stack, nearest-so-far culling."""
    inv_d = 1.0 / np.where(d == 0, 1e-12, d)
    best_t, best_i, stack = np.inf, -1, [node]
    while stack:
        nd = stack.pop()
        if not hit_box(o, inv_d, nd["lo"], nd["hi"], best_t):
            continue
        if "prims" in nd:
            t = isect(nd["prims"], o, d)
            j = np.argmin(t)
            if t[j] < best_t:
                best_t, best_i = t[j], nd["prims"][j]
        else:
            stack.extend(nd["kids"])
    return best_t, best_i

if __name__ == "__main__":
    from mt import moller_trumbore
    rng = np.random.default_rng(1)
    n = 2000                                        # random small triangles in a cube
    v0 = rng.uniform(-1, 1, (n, 3)); v1 = v0 + rng.normal(0, 0.05, (n, 3)); v2 = v0 + rng.normal(0, 0.05, (n, 3))
    lo = np.minimum(np.minimum(v0, v1), v2); hi = np.maximum(np.maximum(v0, v1), v2)
    root = build(lo, hi, np.arange(n))
    isect = lambda p, o, d: moller_trumbore(o, d, v0[p], v1[p], v2[p])[0]
    for _ in range(200):
        o = rng.uniform(-2, 2, 3); d = rng.normal(size=3); d /= np.linalg.norm(d)
        t_bvh, i_bvh = traverse(root, o, d, isect)
        t_all = isect(np.arange(n), o, d)
        assert np.isclose(t_bvh, t_all.min()) or (np.isinf(t_bvh) and np.isinf(t_all.min()))
    print("BVH matches brute force")
```

Run it next to `mt.py`. The test checks the BVH against brute force on 200 random rays.

## 4. The integral we need to solve

Recall the rendering equation from post 4:

$$
L_o(\mathbf{x}, \omega_o) = L_e(\mathbf{x}, \omega_o) + \int_{\Omega} f_r(\mathbf{x}, \omega_i, \omega_o)\, L_i(\mathbf{x}, \omega_i)\, \cos\theta_i\, d\omega_i ,
$$

with $L_i(\mathbf{x}, \omega_i) = L_o(\mathbf{x}', -\omega_i)$, where $\mathbf{x}'$ is the first surface hit by the ray from $\mathbf{x}$ in direction $\omega_i$. Expanding the recursion turns radiance into a sum over paths of every length: light emitted, then reflected once, twice, and so on. Kajiya (1986) introduced the equation together with path tracing, its first general Monte Carlo solver. The integrand is discontinuous (visibility), high-dimensional (two dimensions per bounce) and has no closed form, so Monte Carlo is the natural tool.

## 5. Monte Carlo integration

To estimate $I = \int f(x)\,dx$, draw $X_1, \dots, X_N$ from a pdf $p$ that is positive wherever $f \ne 0$, and average:

$$
\hat{I}_N = \frac{1}{N}\sum_{k=1}^{N} \frac{f(X_k)}{p(X_k)},\qquad
\mathbb{E}[\hat{I}_N] = I,\qquad
\operatorname{Var}[\hat{I}_N] = \frac{1}{N}\left(\int \frac{f(x)^2}{p(x)}\,dx - I^2\right).
$$

The estimator is **unbiased** for any valid $p$, and its standard deviation falls as $1/\sqrt{N}$ regardless of the dimension. That is why it beats quadrature in the path space. The catch is the constant: halving the noise costs $4\times$ the samples. So the game is to **reduce the variance at a fixed sample count**, and the main lever is the choice of $p$. If $p \propto f$, the variance is zero. We never know $f$ exactly (it contains the unknown $L_i$), but we can make $p$ proportional to the parts we know: the cosine, the BRDF, or the light.

The next figure makes the $1/\sqrt{N}$ law visible on the irradiance integral used in the snippet below.

{% include blog_figure.liquid path="assets/img/blog/graphics/05-mc-convergence.svg" caption="Error of the running estimate $\hat I_N$ for $E=\int L\cos\theta\,d\omega=\pi/2$ (the snippet below) as the number of samples grows. Thin lines are 8 individual runs, thick lines the RMSE over 400 runs. On log-log axes both techniques follow the $1/\sqrt{N}$ slope (dashed); importance sampling does not change the slope, only shifts the whole line down. At $N=64$ (dotted) the RMSE is 0.23 for uniform and 0.12 for cosine sampling." %}

**Cosine-weighted hemisphere sampling.** For a Lambertian surface, $f_r = \rho/\pi$, and the integrand contains $\cos\theta$. Sampling $p(\omega) = \cos\theta/\pi$ cancels both:

$$
\frac{f_r\,L_i\cos\theta}{p} = \frac{(\rho/\pi)\,L_i\cos\theta}{\cos\theta/\pi} = \rho\,L_i .
$$

To sample it, invert the CDF: with uniform $u_1, u_2$, set $\cos\theta = \sqrt{1-u_1}$ and $\phi = 2\pi u_2$. Equivalently, sample a uniform point on the unit disk ($r = \sqrt{u_1}$) and project it up onto the hemisphere (Malley's method). The next snippet estimates an irradiance integral with uniform and cosine-weighted sampling at the same sample count:

```python
import numpy as np
rng = np.random.default_rng(0)

# Irradiance E = int_H L(w) cos(theta) dw with a "sky" that is brighter near the zenith:
# L(w) = cos(theta)^2 (exact answer: 2*pi/4 = pi/2)
L = lambda cos_t: cos_t ** 2
exact, N, trials = np.pi / 2, 64, 2000

# (a) uniform hemisphere sampling: cos(theta) = u, pdf = 1 / (2 pi)
u = rng.random((trials, N))
est_uniform = np.mean(L(u) * u / (1 / (2 * np.pi)), axis=1)

# (b) cosine-weighted sampling: cos(theta) = sqrt(u), pdf = cos(theta) / pi
c = np.sqrt(rng.random((trials, N)))
est_cosine = np.mean(L(c) * c / (c / np.pi), axis=1)

for name, e in [("uniform", est_uniform), ("cosine", est_cosine)]:
    print(f"{name:8s} mean {e.mean():.4f} (exact {exact:.4f})  std {e.std():.4f}")
```

Output (64 samples, 2000 trials): both means match $\pi/2 \approx 1.5708$, but the standard deviation drops from about $0.22$ to $0.11$. Halving the noise for free is worth the same as $4\times$ more samples.

The figure shows where the two samplers put their directions and the resulting spread of the estimates.

{% include blog_figure.liquid path="assets/img/blog/graphics/05-hemisphere-sampling.svg" caption="Top: 350 directions from uniform hemisphere sampling (orange) and cosine-weighted sampling (blue), in the local frame with the normal $\mathbf{n}$ up. Cosine sampling concentrates directions near the normal, where $\cos\theta$ and this sky are large, and wastes few on the horizon. Bottom: histograms of the 2000 estimates of the snippet ($N=64$). Both are centred on $\pi/2$ (unbiased), but the cosine histogram is half as wide (std 0.11 vs 0.22)." %}

### Importance sampling GGX with visible normals

For glossy surfaces, the BRDF lobe dominates the integrand. Sampling the GGX normal distribution $D(\mathbf{m})$ directly wastes samples on microfacets that face away from the viewer. Heitz (2018) gives an exact and cheap sampler for the **distribution of visible normals**,

$$
D_{\omega_o}(\mathbf{m}) = \frac{G_1(\omega_o)\,\max(0, \omega_o\cdot\mathbf{m})\,D(\mathbf{m})}{\cos\theta_o},
$$

based on the fact that GGX is the distribution of normals of a stretched ellipsoid: stretch the view direction into the configuration where the ellipsoid becomes a hemisphere, sample its projected area (a disk, squashed on the half that is not visible), and unstretch. Reflecting $\omega_o$ about the sampled $\mathbf{m}$ gives $\omega_i$; the Jacobian of reflection $1/(4\,\omega_o\cdot\mathbf{m})$ yields the solid-angle pdf

$$
p(\omega_i) = \frac{D_{\omega_o}(\mathbf{m})}{4\,(\omega_o\cdot\mathbf{m})} = \frac{G_1(\omega_o)\,D(\mathbf{m})}{4\cos\theta_o}.
$$

For the Cook-Torrance BRDF $f_r = F\,D\,G_2 / (4\cos\theta_o\cos\theta_i)$, the sample weight becomes simply $f_r\cos\theta_i / p = F\,G_2/G_1$, which is close to $F$ and never explodes at grazing angles. The code below checks the sampler against the analytic pdf:

```python
import numpy as np

def sample_ggx_vndf(ve, ax, ay, u1, u2):
    """Heitz 2018: sample a microfacet normal from the GGX distribution of visible
    normals. ve: unit view direction in the local frame (z = macro normal)."""
    vh = np.array([ax * ve[0], ay * ve[1], ve[2]]); vh /= np.linalg.norm(vh)  # stretch
    lensq = vh[0] ** 2 + vh[1] ** 2
    t1 = np.array([-vh[1], vh[0], 0.0]) / np.sqrt(lensq) if lensq > 0 else np.array([1.0, 0, 0])
    t2 = np.cross(vh, t1)
    r, phi = np.sqrt(u1), 2 * np.pi * u2                       # uniform point on a disk
    p1, p2 = r * np.cos(phi), r * np.sin(phi)
    s = 0.5 * (1 + vh[2])
    p2 = (1 - s) * np.sqrt(1 - p1 * p1) + s * p2               # squash to the visible part
    nh = p1 * t1 + p2 * t2 + np.sqrt(max(0.0, 1 - p1 * p1 - p2 * p2)) * vh
    ne = np.array([ax * nh[0], ay * nh[1], max(0.0, nh[2])])   # unstretch
    return ne / np.linalg.norm(ne)

def ggx_D(m_z, a):
    return a * a / (np.pi * (m_z ** 2 * (a * a - 1) + 1) ** 2)

def smith_G1(v_z, a):
    tan2 = (1 - v_z ** 2) / v_z ** 2
    return 2 / (1 + np.sqrt(1 + a * a * tan2))

def pdf_reflect(v, l, a):
    """Solid-angle pdf of l = reflect(-v, m) with m ~ D_v:  G1(v) D(m) / (4 v_z)."""
    m = (v + l) / np.linalg.norm(v + l, axis=-1, keepdims=True)
    return smith_G1(v[2], a) * ggx_D(m[..., 2], a) / (4 * v[2])

if __name__ == "__main__":
    rng = np.random.default_rng(0)
    a, v = 0.3, np.array([np.sin(1.0), 0.0, np.cos(1.0)])     # view 57 degrees off the normal
    n = 100_000
    m = np.array([sample_ggx_vndf(v, a, a, rng.random(), rng.random()) for _ in range(n)])
    l = 2 * (m @ v)[:, None] * m - v                           # mirror v about m
    # P(l_z > 0.8) from the sampler vs. integrating the analytic pdf with uniform directions
    p_sampled = np.mean(l[:, 2] > 0.8)
    u = rng.normal(size=(n, 3)); u /= np.linalg.norm(u, axis=1, keepdims=True); u[:, 2] = np.abs(u[:, 2])
    p_analytic = np.mean((u[:, 2] > 0.8) * pdf_reflect(v, u, a)) * 2 * np.pi
    print(f"P(l_z > 0.8): sampled {p_sampled:.4f}, analytic {p_analytic:.4f}")
```

Both probabilities come out at about $0.211$.

The figure plots the samples from this run, and the widget after it lets you compare all three samplers yourself.

{% include blog_figure.liquid path="assets/img/blog/graphics/05-ggx-vndf.svg" caption="Left: 250 microfacet normals $\mathbf{m}$ drawn by `sample_ggx_vndf` (cyan, $\alpha=0.3$) for a view direction $\omega_o$ 57° from the normal, and the reflected directions $\omega_i$ (orange), which form a lobe around the mirror direction on the far side. Right: the distribution of $\cos\theta_i$ of 20,000 sampled directions matches the analytic pdf $G_1 D/(4\cos\theta_o)$ integrated over the azimuth. About 9% of the reflected directions fall below the horizon and are discarded (weight 0)." %}

{% include widget.liquid name="graphics-hemisphere-mc" height="420" caption="Interactive: pick a sampling technique and an integrand. Each dot is one sample direction, coloured by its weight $f/p$ relative to the true value (blue: small, orange: large). Uniform and cosine sampling are good for the smooth sky but fail on a narrow GGX lobe; GGX VNDF sampling is the opposite. The bars give the relative RMSE of all three at the current N; drag the hemisphere to rotate it." %}

## 6. Path tracing

Applying a one-sample Monte Carlo estimate at every bounce gives the path tracing estimator for a pixel. Starting from a camera ray with throughput $\boldsymbol{\beta} = 1$:

1. Find the hit $\mathbf{x}$. Add $\boldsymbol{\beta}\, L_e$.
2. Sample $\omega_i \sim p$, and update $\boldsymbol{\beta} \mathrel{\leftarrow} \boldsymbol{\beta}\, f_r \cos\theta_i / p(\omega_i)$.
3. Continue from $\mathbf{x}$ in direction $\omega_i$.

Each pixel averages many such paths. Three techniques turn this naive version into a practical renderer.

### Russian roulette

Truncating paths at a fixed depth introduces bias (energy is lost). Instead, after a few bounces continue with probability $q$ and divide by $q$:

$$
\hat{L}' = \begin{cases} \hat{L}/q & \text{with probability } q \\ 0 & \text{otherwise}\end{cases}
\qquad\Rightarrow\qquad \mathbb{E}[\hat{L}'] = \hat{L}.
$$

It is unbiased but adds variance, so $q$ should track how much the path can still contribute; a common choice is $q = \operatorname{clamp}(\max_c \beta_c, 0.05, 0.95)$. Dark paths die early, bright ones live on.

The figure checks this on a toy path whose exact value we know.

{% include blog_figure.liquid path="assets/img/blog/graphics/05-russian-roulette.svg" caption="A white furnace toy: every bounce has albedo $a=0.73$ and adds 1 unit of light, so the path is worth $\sum_k a^k = 1/(1-a)\approx 3.704$. Left: cutting paths at a fixed maximum depth is biased low, by $a^D/(1-a)$. Russian roulette with $q=\operatorname{clamp}(\beta,0.05,0.95)$ from the third bounce, as in the post's code, has the right mean (3.697 over 200,000 paths). Right: how many bounces the roulette paths survive; most stop at the third bounce, a few run for 10 or more." %}

### Next-event estimation

With pure BSDF sampling, a path only collects light when it happens to hit an emitter. For a small light this is rare and the image is full of fireflies; for a point light it never happens. **Next-event estimation** (NEE) samples a point $\mathbf{y}$ on the light directly at every bounce and traces a shadow ray. The direct-lighting integral, written over the light's area $A$, is

$$
L_{\text{dir}}(\mathbf{x}, \omega_o) = \int_A f_r(\mathbf{x}, \omega_i, \omega_o)\,L_e(\mathbf{y}, -\omega_i)\,V(\mathbf{x}, \mathbf{y})\,\frac{\cos\theta_x\cos\theta_y}{\lVert \mathbf{x}-\mathbf{y} \rVert^2}\,dA_y ,
$$

where $V$ is binary visibility and $\theta_y$ is the angle at the light. With uniform area sampling $p_A = 1/A$, the estimator is $f_r L_e V \cos\theta_x\cos\theta_y\,A / \lVert \mathbf{x}-\mathbf{y}\rVert^2$. To compare it with BSDF sampling we need both pdfs in the same measure. The change of variables from area to solid angle is $d\omega = \cos\theta_y\,dA/\lVert \mathbf{x}-\mathbf{y}\rVert^2$, so

$$
p_\omega(\omega_i) = p_A\,\frac{\lVert \mathbf{x}-\mathbf{y}\rVert^2}{\cos\theta_y}.
$$

If we add NEE, a BSDF-sampled ray that later hits the light must not count that emission again, or direct light is counted twice. The simplest fix ignores emission hit by BSDF rays (except from the camera and after perfectly specular bounces, which NEE cannot handle). The better fix is MIS.

The figure follows one path through a 2D slice of the scene and shows the shadow rays NEE adds at each vertex.

{% include blog_figure.liquid path="assets/img/blog/graphics/05-path-nee.svg" caption="One camera path in the plane $x=0$ of the section 7 Cornell box (camera on the right at $z=3.9$, light on the ceiling, the two spheres in profile). At every vertex $\mathbf{x}_k$ NEE picks a random point on the light (orange dots) and traces a shadow ray: yellow rays reach the light and contribute $f_r L_e V\cos\theta_x\cos\theta_y A/\lVert\mathbf{x}-\mathbf{y}\rVert^2$; the dashed ray from $\mathbf{x}_3$ is blocked by a sphere ($V=0$). The purple segments are the BSDF-sampled continuation. Directions were hand-picked for readability; the hits and visibility are computed." %}

### Multiple importance sampling

Light sampling is excellent for small lights and rough surfaces; BSDF sampling is excellent for large lights and glossy surfaces, where a random point on the light almost never falls inside the narrow lobe. Neither wins everywhere. Veach and Guibas (1995) showed how to combine several techniques in one unbiased estimator. With $n_i$ samples $X_{i,j}$ from technique $i$ and weights $w_i$ that sum to one wherever $f \ne 0$:

$$
\hat{I} = \sum_{i}\frac{1}{n_i}\sum_{j=1}^{n_i} w_i(X_{i,j})\,\frac{f(X_{i,j})}{p_i(X_{i,j})},\qquad
w_i^{\text{balance}}(x) = \frac{n_i\,p_i(x)}{\sum_k n_k\,p_k(x)},\qquad
w_i^{\text{power}}(x) = \frac{\left(n_i\,p_i(x)\right)^2}{\sum_k \left(n_k\,p_k(x)\right)^2}.
$$

The intuition: each sample is weighted by how good its technique is *at that point*. Where light sampling has a high pdf, its samples dominate; where the BSDF has a high pdf, the BSDF samples dominate. Veach proved the balance heuristic is close to optimal among all weightings; the power heuristic ($\beta = 2$) is usually a bit better in practice. In a path tracer with one light sample and one BSDF sample per bounce ($n_i = 1$):

- NEE sample: weight $w_l = p_l^2/(p_l^2 + p_b^2)$, where $p_b$ is the BSDF pdf of the light direction.
- BSDF sample that hits the light: weight $w_b = p_b^2/(p_b^2 + p_l^2)$, where $p_l$ is the light pdf (in solid angle) of that direction.


The figure shows the weights and what they buy on a 1D toy problem.

{% include blog_figure.liquid path="assets/img/blog/graphics/05-mis.svg" caption="Top: balance and power heuristic weights for one light sample ($w_l$, solid) and one BSDF sample ($w_b$, dashed) as a function of $p_l/p_b$; the power heuristic switches more sharply to the better technique. Bottom: a 1D toy integral, a Gaussian BSDF lobe of width $s$ times a light window, estimated with two samples. Narrow lobes (glossy) favour BSDF sampling, wide lobes (rough) favour light sampling, and MIS stays close to the better of the two without knowing in advance which one that is." %}

### Progressive accumulation

A path tracer is naturally **progressive**: render one sample per pixel per frame and keep a running mean, $\bar{I}_s = \bar{I}_{s-1} + (I_s - \bar{I}_{s-1})/s$. The image starts noisy and converges as $1/\sqrt{s}$. When the camera or the scene changes, the accumulation restarts (or, in real time, is reprojected and blended, see the next post).

The figure shows this convergence with the NumPy renderer of the next section.

{% include blog_figure.liquid path="assets/img/blog/graphics/05-spp.svg" caption="Progressive accumulation with the section 7 path tracer (100 x 100 pixels, MIS, up to 6 bounces): the running mean after 1, 4, 16 and 256 samples per pixel. Each 4x more samples halves the noise. Soft shadows, red and green colour bleeding and the indirectly lit ceiling emerge as the noise fades." %}

## 7. A compact path tracer in NumPy

The renderer below puts everything together for a Cornell box with two diffuse spheres and a rectangular area light. It is vectorized *over paths*: each bounce intersects all live rays with all objects at once, and paths that miss, hit the light or are killed by Russian roulette are removed by boolean masks (`pix` remembers the pixel each surviving path belongs to). Surfaces are Lambertian with cosine-weighted sampling; at each bounce it does NEE with a power-heuristic MIS weight, and BSDF-sampled light hits receive the complementary weight.

```python
import numpy as np

W, H, SPP, MAX_DEPTH = 160, 160, 64, 6
rng = np.random.default_rng(0)

def normalize(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)

# Scene: quads (corner p, edges u, v) and spheres (center, radius).
# Each object has an albedo and an emission. The box spans [-1, 1]^3.
quads, spheres = [], []
def quad(p, u, v, albedo, emit=(0, 0, 0)):
    quads.append((np.array(p, float), np.array(u, float), np.array(v, float),
                  np.array(albedo, float), np.array(emit, float)))
white, red, green = (0.73, 0.73, 0.73), (0.65, 0.05, 0.05), (0.12, 0.45, 0.15)
quad((-1, -1, -1), (2, 0, 0), (0, 0, 2), white)          # floor
quad((-1, 1, -1), (0, 0, 2), (2, 0, 0), white)           # ceiling
quad((-1, -1, -1), (0, 2, 0), (2, 0, 0), white)          # back wall
quad((-1, -1, -1), (0, 0, 2), (0, 2, 0), red)            # left wall
quad((1, -1, -1), (0, 2, 0), (0, 0, 2), green)           # right wall
quad((-0.25, 0.999, -0.25), (0.5, 0, 0), (0, 0, 0.5), (0, 0, 0), (17, 12, 4))  # light (faces -y)
spheres.append((np.array([-0.45, -0.6, -0.3]), 0.4, np.array(white), np.zeros(3)))
spheres.append((np.array([0.45, -0.65, 0.3]), 0.35, np.array([0.8, 0.6, 0.2]), np.zeros(3)))
LIGHT = 5                                                # index of the light quad
lp, lu, lv = quads[LIGHT][:3]
l_n = normalize(np.cross(lu, lv)); l_area = np.linalg.norm(np.cross(lu, lv))
albedo = np.array([q[3] for q in quads] + [s[2] for s in spheres])
emission = np.array([q[4] for q in quads] + [s[3] for s in spheres])

def intersect(o, d):
    """Nearest hit for N rays: returns t (inf on miss), object id, geometric normal."""
    n = len(o)
    t_best = np.full(n, np.inf); obj = np.full(n, -1); nrm = np.zeros((n, 3))
    for i, (p, u, v, _, _) in enumerate(quads):
        qn = normalize(np.cross(u, v))
        denom = d @ qn
        with np.errstate(divide="ignore", invalid="ignore"):
            t = ((p - o) @ qn) / denom
        x = o + t[:, None] * d - p
        a, b = x @ u / (u @ u), x @ v / (v @ v)
        ok = (np.abs(denom) > 1e-9) & (t > 1e-4) & (t < t_best) & (a >= 0) & (a <= 1) & (b >= 0) & (b <= 1)
        t_best[ok], obj[ok], nrm[ok] = t[ok], i, qn
    for j, (c, r, _, _) in enumerate(spheres):
        oc = o - c
        b = np.sum(oc * d, axis=1); disc = b * b - (np.sum(oc * oc, axis=1) - r * r)
        s = np.sqrt(np.maximum(disc, 0))
        t = np.where(-b - s > 1e-4, -b - s, -b + s)
        ok = (disc > 0) & (t > 1e-4) & (t < t_best)
        t_best[ok], obj[ok] = t[ok], len(quads) + j
        nrm[ok] = (o[ok] + t[ok, None] * d[ok] - c) / r
    return t_best, obj, nrm

def onb(n):
    """Orthonormal basis (t, b) around unit normals n (Duff et al. 2017)."""
    s = np.where(n[:, 2] >= 0, 1.0, -1.0)
    a = -1.0 / (s + n[:, 2]); b = n[:, 0] * n[:, 1] * a
    t = np.stack([1 + s * n[:, 0] ** 2 * a, s * b, -s * n[:, 0]], 1)
    bb = np.stack([b, s + n[:, 1] ** 2 * a, -n[:, 1]], 1)
    return t, bb

def cosine_sample(n):
    u1, u2 = rng.random(len(n)), rng.random(len(n))
    r, phi = np.sqrt(u1), 2 * np.pi * u2
    t, b = onb(n)
    return (r * np.cos(phi))[:, None] * t + (r * np.sin(phi))[:, None] * b + np.sqrt(1 - u1)[:, None] * n

def render_sample():
    # pinhole camera at z = 3.9 looking down -z, 40 degree vertical field of view
    jx, jy = rng.random((H, W)), rng.random((H, W))
    px = (np.arange(W)[None, :] + jx) / W * 2 - 1
    py = 1 - (np.arange(H)[:, None] + jy) / H * 2
    th = np.tan(np.radians(20))
    d = normalize(np.stack([px * th, py * th, -np.ones_like(px)], -1).reshape(-1, 3))
    o = np.tile([0.0, 0.0, 3.9], (len(d), 1))
    L, beta = np.zeros_like(d), np.ones_like(d)
    pix = np.arange(len(d))                  # which pixel each live path belongs to
    prev_pdf = np.zeros(len(d))              # solid-angle pdf of the last BSDF sample
    for depth in range(MAX_DEPTH):
        t, obj, n = intersect(o, d)
        alive = obj >= 0
        o, d, t, obj, n, beta, pix, prev_pdf = (a[alive] for a in (o, d, t, obj, n, beta, pix, prev_pdf))
        if len(o) == 0:
            break
        x = o + t[:, None] * d
        # 1) emission found by BSDF sampling, MIS-weighted against light sampling
        hit_l = (obj == LIGHT) & (d @ l_n < 0)
        if depth == 0:
            w = np.ones(hit_l.sum())
        else:
            cos_l = -(d[hit_l] @ l_n)
            pl = t[hit_l] ** 2 / (cos_l * l_area)
            w = prev_pdf[hit_l] ** 2 / (prev_pdf[hit_l] ** 2 + pl ** 2)   # power heuristic
        np.add.at(L, pix[hit_l], beta[hit_l] * emission[obj[hit_l]] * w[:, None])
        keep = obj != LIGHT                  # paths stop at the light
        x, d, obj, n, beta, pix = x[keep], d[keep], obj[keep], n[keep], beta[keep], pix[keep]
        n = np.where((np.sum(n * d, 1) < 0)[:, None], n, -n)   # face the incoming ray
        a = albedo[obj]
        # 2) next-event estimation: one point on the area light, shadow ray
        y = lp + rng.random((len(x), 1)) * lu + rng.random((len(x), 1)) * lv
        to_l = y - x; dist2 = np.sum(to_l ** 2, 1); dist = np.sqrt(dist2); wi = to_l / dist[:, None]
        cos_s, cos_l = np.sum(n * wi, 1), -(wi @ l_n)
        ok = (cos_s > 0) & (cos_l > 0)
        ts, _, _ = intersect(x[ok] + 1e-4 * n[ok], wi[ok])
        vis = np.zeros(len(x), bool); vis[ok] = ts >= dist[ok] - 1e-3
        pl = dist2 / np.maximum(cos_l, 1e-8) / l_area         # light pdf in solid angle
        pb = np.maximum(cos_s, 0) / np.pi                     # BSDF (cosine) pdf
        wl = pl ** 2 / (pl ** 2 + pb ** 2)
        contrib = beta * (a / np.pi) * emission[LIGHT] * (np.maximum(cos_s, 0) * wl / pl)[:, None]
        np.add.at(L, pix[vis], contrib[vis])
        # 3) continue the path by cosine-weighted BSDF sampling: f*cos/pdf = albedo
        d = cosine_sample(n); o = x + 1e-4 * n
        prev_pdf = np.sum(n * d, 1) / np.pi
        beta = beta * a
        # 4) Russian roulette after a few bounces (unbiased: divide by survival prob.)
        if depth >= 2:
            q = np.clip(beta.max(1), 0.05, 0.95)
            survive = rng.random(len(q)) < q
            beta[survive] /= q[survive, None]
            o, d, beta, pix, prev_pdf = o[survive], d[survive], beta[survive], pix[survive], prev_pdf[survive]
    return L.reshape(H, W, 3)

if __name__ == "__main__":
    accum = np.zeros((H, W, 3))
    for s in range(1, SPP + 1):              # progressive accumulation: running mean
        accum += (render_sample() - accum) / s
    img = np.clip(accum, 0, 1) ** (1 / 2.2)
    with open("cornell.ppm", "wb") as f:
        f.write(f"P6 {W} {H} 255\n".encode())
        f.write((img * 255 + 0.5).astype(np.uint8).tobytes())
    print("mean radiance", accum.mean(axis=(0, 1)))
```

At 160 x 160 pixels with 64 samples per pixel and up to 6 bounces, it runs in about 9 seconds on one CPU core and writes `cornell.ppm` (any image viewer, or `python -c "from PIL import Image; Image.open('cornell.ppm').save('cornell.png')"`, can open it). You should see soft shadows under the spheres, red and green color bleeding on the floor and on the spheres, and a darker ceiling lit only by indirect light. A good sanity test for any MIS implementation: replace the weights with "BSDF only" ($w_b = 1$, $w_l = 0$) and "NEE only" ($w_b = 0$, $w_l = 1$). All three versions must converge to the same mean image; only the noise differs. In this scene, the means of the three versions agree to within the Monte Carlo noise, and the BSDF-only image is visibly noisier.

The figure runs exactly this sanity test.

{% include blog_figure.liquid path="assets/img/blog/graphics/05-estimators.svg" caption="The three estimators of section 6 with the renderer above at 16 samples per pixel: BSDF sampling only, NEE only, and MIS with the power heuristic (bottom right: MIS at 256 spp for reference). The small light makes BSDF-only sampling almost useless (most paths never hit it), while NEE and MIS are already clean. The numbers are the mean radiance of each estimator at 256 spp (48 x 48 pixels): all three converge to the same answer within the Monte Carlo noise." %}

Natural extensions: GGX materials with the VNDF sampler from section 5, a triangle mesh with the BVH from section 3, and a thin-lens camera (sample the ray origin on a disk aperture, aim it at the focal plane) for depth of field.

## Try it: the lab path tracer

The home page has a GPU version of the same algorithm: [open the lab]({{ '/' | relative_url }}#lab) and choose the path tracer tab. It runs one sample per pixel per frame in a WebGL 2 fragment shader and accumulates progressively. Its materials use the GGX BRDF with Heitz's visible-normal sampling, and glass uses exact dielectric Fresnel. The **Sampling** toggle switches between exactly the three estimators of section 6:

- **BSDF**: no light sampling. Paths only collect light when a BSDF-sampled ray happens to hit the emitter, which is counted with weight 1.
- **NEE**: one shadow ray to a random point on the ceiling light at every opaque bounce. Emitter hits after a BSDF-sampled bounce get weight 0 to avoid double counting. Hits seen directly by the camera or through glass are still counted with weight 1: the demo treats refraction as a specular (delta) event, and NEE cannot sample a path through one.
- **MIS**: both, combined with the power heuristic. The light pdf is $\lVert \mathbf{x}-\mathbf{y}\rVert^2/(\cos\theta_y A)$, exactly the conversion above.

Experiments worth doing:

1. Drag **Light size** to the minimum. The demo keeps the light's total power constant, so the emitted radiance grows as the area shrinks. In BSDF mode, the image dissolves into fireflies; NEE and MIS stay clean.
2. Look at the small mirror sphere (its GGX roughness is tiny, so its lobe is extremely narrow) and make the light large. Now NEE is the bad one: its light samples almost never fall inside the lobe, so in NEE mode the reflection of the light in the mirror turns dark and speckled, while BSDF sampling finds it easily. Select another object and try the **Metal** preset at different **Roughness** values. MIS tracks the better technique everywhere.
3. Set **Bounces** to 1, then increase it: watch the indirect light (color bleeding, the lit ceiling) appear. The demo applies Russian roulette from the third bounce with $q = \operatorname{clamp}(\max_c\beta_c, 0.05, 0.95)$, as in our code.
4. Increase **Aperture** and double-click to focus: a thin-lens camera gives depth of field at no extra cost, since it is just another dimension of the integral.

Two things in the demo are deliberately *biased* for speed: it clamps very bright indirect samples (firefly clamping), and while you interact, an edge-avoiding à-trous wavelet denoiser guided by the normal, depth and albedo buffers (the Albedo, Normals and Depth views) filters the image. We cover denoising in the next post.

## Beyond the basic path tracer

Unidirectional path tracing struggles when light reaches the camera only through narrow passages: caustics through glass, scenes lit through a door gap. **Bidirectional path tracing** (Lafortune and Willems 1993; Veach and Guibas 1994) traces subpaths from both the camera and the lights and connects them, weighting all combinations with MIS. **Metropolis light transport** (Veach and Guibas 1997) mutates paths that contribute strongly. **Path guiding** (e.g. Müller et al. 2017, "Practical Path Guiding") learns the incident radiance distribution during rendering and samples from it, a direct ancestor of the neural approaches we will meet later. Veach's thesis remains the best single reference for the theory.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Whitted, "An Improved Illumination Model for Shaded Display" | Communications of the ACM | 1980 | [DOI](https://doi.org/10.1145/358876.358882) | Recursive ray tracing: shadows, reflection, refraction |
| Cook, Porter, Carpenter, "Distributed Ray Tracing" | SIGGRAPH | 1984 | [DOI](https://doi.org/10.1145/800031.808590) | Distributing rays over lens, time and area: soft shadows, depth of field, motion blur |
| Kajiya, "The Rendering Equation" | SIGGRAPH | 1986 | [DOI](https://doi.org/10.1145/15922.15902) | The rendering equation and the first path tracer |
| Goldsmith, Salmon, "Automatic Creation of Object Hierarchies for Ray Tracing" | IEEE CG&A | 1987 | [DOI](https://doi.org/10.1109/MCG.1987.276983) | Bounding volume hierarchies with a surface-area cost model |
| MacDonald, Booth, "Heuristics for Ray Tracing Using Space Subdivision" | The Visual Computer | 1990 | (no link) | Formalized the surface area heuristic |
| Veach, Guibas, "Optimally Combining Sampling Techniques for Monte Carlo Rendering" | SIGGRAPH | 1995 | [DOI](https://doi.org/10.1145/218380.218498) | Multiple importance sampling, balance and power heuristics |
| Möller, Trumbore, "Fast, Minimum Storage Ray-Triangle Intersection" | Journal of Graphics Tools | 1997 | [DOI](https://doi.org/10.1080/10867651.1997.10487468) | The standard ray-triangle test |
| Veach, "Robust Monte Carlo Methods for Light Transport Simulation" | PhD thesis, Stanford | 1997 | [Project page](https://graphics.stanford.edu/papers/veach_thesis/) | Path-space formulation, MIS, BDPT, MLT |
| Heitz, "Sampling the GGX Distribution of Visible Normals" | JCGT 7(4) | 2018 | [Paper](https://jcgt.org/published/0007/04/01/) | Exact, cheap VNDF sampling for GGX |

## Learning resources

- **PBRT**: Pharr, Jakob, Humphreys, *Physically Based Rendering: From Theory to Implementation*, free online at [pbr-book.org](https://pbr-book.org/). Chapters on shapes, BVHs, Monte Carlo and light transport are the definitive reference for this post.
- **Ray Tracing in One Weekend** series by Peter Shirley et al., free at [raytracing.github.io](https://raytracing.github.io/): build a ray tracer in C++ in a weekend, then BVHs, textures and Monte Carlo in the sequels.
- **Scratchapixel** ([scratchapixel.com](https://www.scratchapixel.com/)): detailed lessons on ray-triangle intersection, acceleration structures and Monte Carlo.
- **GAMES101** by Lingqi Yan ([course page](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html)): lectures 13-16 cover Whitted ray tracing, BVHs, radiometry and path tracing, with assignments.
- **Berkeley CS184** ([cs184.eecs.berkeley.edu](https://cs184.eecs.berkeley.edu/)): its "PathTracer" project implements BVHs, direct lighting and global illumination step by step. Stanford CS148 also covers ray tracing at an introductory level.
- **smallpt** by Kevin Beason ([kevinbeason.com/smallpt](https://www.kevinbeason.com/smallpt/)): a global-illumination path tracer in 99 lines of C++.
- *Real-Time Rendering* (Akenine-Möller et al., 4th ed.), chapters on ray tracing, as a bridge to the next post.

## Exercises

1. Prove that the Monte Carlo estimator is unbiased and derive its variance formula. Then show that $p \propto \lvert f \rvert$ minimizes the variance.
2. Derive the cosine-weighted sampling formulas $\cos\theta = \sqrt{1-u_1}$, $\phi = 2\pi u_2$ by inverting the marginal and conditional CDFs of $p(\theta, \phi) = \cos\theta\sin\theta/\pi$.
3. Add a GGX metal sphere to the NumPy path tracer, using `sample_ggx_vndf` for BSDF sampling and the matching pdf in both MIS weights. Check that the BSDF-only, NEE-only and MIS images converge to the same mean.
4. Load a triangle mesh (e.g. an OBJ file), build the SAH BVH and measure how the number of box and triangle tests per ray grows with the triangle count. Compare against a "median split" builder.
5. In the lab, find a configuration in which NEE alone is noisier than BSDF alone, and explain why using the two pdfs.

**Next:** [Real-time ray tracing]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }}): hardware BVH traversal, denoising (à-trous, SVGF), ReSTIR and neural radiance caching, or how to get this image at 60 frames per second with one sample per pixel.
