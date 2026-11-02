---
layout: post
title: "Inside production engines: Unreal Engine 5, Unity 6, Godot 4, Bevy and others"
description: "How modern engines solve the hard problems: Nanite's cluster hierarchy and LOD cut, Lumen's surface cache and distance-field tracing, virtual shadow maps, temporal upscaling, Unity's render graph and GPU Resident Drawer, Godot's RenderingDevice, Bevy's extract phase, and how to read their source."
date: 2026-10-27 13:04:00+0900
categories: graphics-engine
tags: [unreal-engine, nanite, lumen, virtual-shadow-maps, unity, godot, bevy, engine]
series: graphics-engine
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## Why this matters

In the [previous post]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }}) we built a mini engine: one loop, one shadow map, a constant ambient term, and a CPU loop that issues one draw call per object. Production engines face the same problems at a scale where those simple answers break: billions of source triangles, dynamic global illumination, shadows sharp at every distance, open worlds that do not fit in memory, and teams of hundreds who need tools. This post opens four engines and a few others to see *how* they solve these problems, using their official documentation and the talks in which their authors explained them. Where an algorithm is the key idea (the Nanite LOD cut, sphere tracing, virtual shadow map pages), we rebuild a toy version so that you can see it work.

All version information is **as of November 2026**; engines move fast, so check the linked release notes.

## Prerequisites

- [Post 01]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}) (engine layers, ECS), [post 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}) (render graphs, visibility buffers, GPU-driven rendering) and [post 03]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }}) (a working pipeline).
- Level of detail and mesh simplification from [graphics post 08]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}); global illumination from [graphics post 05]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}) and the real-time techniques of [graphics post 11]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }}).
- Python with NumPy for the toy experiments.

## 1. Unreal Engine 5

Unreal Engine 5 (UE5) is written in C++, with Blueprint visual scripting on top, and its full source code is available on GitHub to anyone who accepts the Unreal Engine EULA. Its rendering is built around three systems introduced together in 2021-2022: **Nanite** (virtualized geometry), **Lumen** (dynamic global illumination) and **Virtual Shadow Maps**. They are designed as a set: Nanite produces a visibility buffer of micro-detailed geometry, Virtual Shadow Maps render that same geometry into very high-resolution shadow pages, and Lumen lights it without precomputation.

### 1.1 Nanite: virtualized geometry

**The problem.** A film-quality asset may have millions of triangles. Drawing all of them wastes work when an object covers a few hundred pixels, and classic discrete LODs (a few precomputed versions per mesh, switched by distance) pop visibly and still cannot simplify a *large* object whose near end needs full detail while its far end needs almost none. Nanite's answer, presented by Karis, Stubbe and Wihlidal in the SIGGRAPH 2021 Advances course ([*A Deep Dive into Nanite Virtualized Geometry*](https://advances.realtimerendering.com/s2021/index.html)), is to make level of detail **per cluster** and choose it every frame on the GPU, so that the number of triangles drawn tracks the number of pixels, not the size of the source asset.

**Building the hierarchy (offline).** The mesh is split into **clusters** of up to 128 triangles. Then, level by level:

1. adjacent clusters are put together into **groups**;
2. each group is merged and **simplified to about half** its triangle count, with the group's outer boundary **locked** (boundary vertices may not move);
3. the simplified group is split again into new, coarser clusters, which become the input of the next level.

Because the next level forms *different* groups, a boundary that was locked at one level lies in the interior of a group at the next level and is simplified there. That is why locking does not leave the boundaries at full resolution forever. It is also why a coarse cluster can have several parent groups: the hierarchy is a **directed acyclic graph** (DAG), not a tree. Each cluster stores the **geometric error** of the simplification that created it (in world units), and errors are made **monotonic**: a parent's error is never smaller than its children's.

We can rebuild the essence of this in 1D. Our "mesh" is a terrain profile with 128 segments (each segment plays the role of a triangle), cut into 16 clusters of 8 segments. Each level merges sibling pairs, halves the segment count by greedy vertex removal with the two group ends locked, and records the maximum vertical distance to the original profile as the error.

```python
import numpy as np

xs = np.linspace(0.0, 16.0, 129)                 # 128 segments, 8 per cluster
h = (1.2 * np.sin(0.45 * xs) + 0.5 * np.sin(1.7 * xs + 1)
     + 0.18 * np.sin(4.3 * xs + 2) + 0.07 * np.sin(9.1 * xs + 0.5))

def max_dev(a, b):
    """Largest vertical distance between the original samples a..b and the segment a-b."""
    t = (xs[a:b + 1] - xs[a]) / (xs[b] - xs[a])
    return float(np.max(np.abs(h[a:b + 1] - (h[a] + t * (h[b] - h[a])))))

def simplify(verts, target_segments):
    """Greedy vertex removal; the first and last vertex are locked."""
    verts = list(verts)
    while len(verts) - 1 > target_segments:
        costs = [max_dev(verts[i - 1], verts[i + 1]) for i in range(1, len(verts) - 1)]
        del verts[1 + int(np.argmin(costs))]
    err = max(max_dev(verts[i], verts[i + 1]) for i in range(len(verts) - 1))
    return verts, err

# Level 0: 16 clusters of 8 segments with error 0. Each level: merge pairs, halve, lock the ends.
levels = [[dict(verts=list(range(8 * c, 8 * c + 9)), err=0.0, children=[]) for c in range(16)]]
while len(levels[-1]) > 1:
    prev, nxt = levels[-1], []
    for g in range(0, len(prev), 2):
        a, b = prev[g], prev[g + 1]
        verts, err = simplify(a["verts"] + b["verts"][1:], 8)
        nxt.append(dict(verts=verts, err=max(err, a["err"], b["err"]), children=[a, b]))
    levels.append(nxt)

for i, lv in enumerate(levels):
    print(f"level {i}: {len(lv):2d} clusters, max error {max(c['err'] for c in lv):.4f} m")
```

In 1D each group's interior is a single vertex, so our hierarchy happens to be a tree; on a surface the regrouping across old boundaries creates the DAG. The two properties that matter for correctness, **locked group boundaries** and **monotonic error**, are the same. The figure below draws the hierarchy this code builds: read it bottom to top to see the cluster count halve, and note where the black ticks sit on each level, since they mark the locked boundaries.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-cluster-hierarchy.svg" caption="The toy hierarchy computed by the script: level 0 (bottom) has 16 clusters of 8 segments, each level above has half as many clusters, each again with 8 segments. Purple and orange alternate per cluster; black ticks are cluster ends, which are always original vertices because group boundaries are locked. The number on each row is the level's largest error in meters; the dashed gray curve is the original profile." %}

**Selecting the cut (every frame, on the GPU).** A cluster's world-space error $\varepsilon$ becomes a screen-space error by perspective projection. With a vertical resolution $H$ pixels and field of view $\theta$, one world unit at distance $d$ covers $K/d$ pixels, where $K = H / (2 \tan(\theta/2))$. So

$$
\varepsilon_{\text{px}} = \frac{\varepsilon\, K}{d}, \qquad d = \max\big(\lVert \mathbf{c} - \mathbf{e} \rVert - r,\ d_{\min}\big),
$$

using the distance from the eye $\mathbf{e}$ to the nearest point of the cluster's bounding sphere (center $\mathbf{c}$, radius $r$), which is conservative; $d_{\min}$ is a small lower bound that avoids dividing by zero when the camera is inside the sphere. A cluster is drawn exactly when its own error is small enough but its parent's is not:

$$
\varepsilon_{\text{px}}(\text{cluster}) \le \tau \;<\; \varepsilon_{\text{px}}(\text{parent}),
$$

with a threshold $\tau$ of about one pixel. The set of drawn clusters is called the **cut** through the DAG. Because errors are monotonic, every path from the root to a leaf crosses the cut exactly once, so each part of the surface is drawn once, at one resolution. And because the clusters of one group share their parent error, they always switch together (provided the clusters of a group use the same bounding sphere to compute $d$), so the locked boundaries line up: **no cracks**. Crucially, this test is *local*: each cluster can be evaluated independently in a compute shader thread, with no traversal from the root (Nanite still uses a hierarchy over cluster bounds to cull quickly).

**Worked example.** With $H = 1080$ and $\theta = 60°$, $K = 1080/(2 \tan 30°) \approx 935$ pixels. A cluster with $\varepsilon = 0.05$ m projects to 1 pixel at $d = 0.05 \cdot 935 \approx 47$ m. Closer than that it must be refined into its children; farther away its parent (with, say, $\varepsilon = 0.12$ m, switching at 112 m) may take over.

```python
K = 1080 / (2 * np.tan(np.radians(30)))         # pixels per world unit at distance 1

def select_cut(node, cam, tau=1.0):
    v = node["verts"]
    lo, hi = v[0], v[-1]
    hmin, hmax = h[lo:hi + 1].min(), h[lo:hi + 1].max()
    cx, cy = (xs[lo] + xs[hi]) / 2, (hmin + hmax) / 2
    r = 0.5 * np.hypot(xs[hi] - xs[lo], hmax - hmin)
    d = max(np.hypot(cx - cam[0], cy - cam[1]) - r, 1e-3)
    if node["err"] * K / d <= tau or not node["children"]:
        return [node]
    return [c for child in node["children"] for c in select_cut(child, cam, tau)]

for D in (5.0, 60.0, 500.0):                     # camera to the left of the terrain, 2 m high
    cut = select_cut(levels[-1][0], cam=(-D, 2.0))
    print(f"camera {D:5.0f} m away: {len(cut):2d} clusters, {sum(len(c['verts']) - 1 for c in cut):3d} segments")
```

For a 1D toy we traverse from the root; the GPU version evaluates the same inequality per cluster in parallel. Run the script: the near camera keeps fine clusters close to it and coarse ones at the far end, and the segment count drops as the camera recedes. In the first figure below, look at the top polylines, colored by the level of each selected cluster (darker = finer), and match them to the highlighted squares of the hierarchy underneath. The second figure plots the inequality $\varepsilon K / d \le \tau$: look at the distance where each level's line crosses the dashed $\tau = 1$ px line.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-lod-cut.svg" caption="The cut selected by `select_cut` for a camera 25 m (left) and 100 m (right) to the left of the terrain, with τ = 1 px. Top: the drawn polyline, colored by the level of each selected cluster (dark = fine). Bottom: the hierarchy with the cut highlighted; every root-to-leaf path crosses it exactly once. The farther camera uses coarser levels everywhere (5 clusters and 40 segments at 100 m, versus 13 clusters and 104 segments at 25 m). Within one view the level depends on each cluster's own error, not only on distance: at 25 m the flat stretch at x = 6-8 is already simplified to level 1, while rougher stretches farther away (x = 8-10, 12-14) still need level 0." %}

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-error-distance.svg" caption="Left: projected error $\varepsilon K / d$, computed from each level's largest error $\varepsilon$, versus distance (log-log, so each level is a straight line of slope −1); a level becomes acceptable where its line drops below τ = 1 px (dashed). Right: the number of segments in the selected cut versus camera distance, computed with `select_cut`. Detail falls smoothly with distance instead of in a few large discrete LOD steps." %}

Now play with it. The widget runs the same construction in JavaScript. Move the camera and the threshold, and switch to *independent LOD levels*: each 1 m region then picks its level from a separately simplified copy of the whole profile, which is what naive per-object or per-chunk LOD does, and cracks appear wherever neighbours choose different levels. The static figure after the widget zooms in on one such crack.

{% include widget.liquid name="graphics-engine-nanite-lod" height="520" caption="A 1D Nanite-style hierarchy. Drag the camera slider (log scale) and the error threshold τ in pixels; the selected cut (top, colored by level), the hierarchy (bottom) and the segment count update live. Switch to independent LOD levels to see cracks (red) at region boundaries where neighbours disagree; with the locked-boundary hierarchy no crack can occur." %}

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-cracks.svg" caption="Why boundaries must be locked, computed. Left: two neighbouring regions take their geometry from two independently simplified versions of the profile (levels 1 and 3, in different colors). At the shared x the two versions have different heights, leaving a vertical gap (red line; the title gives its height Δh). Right: the same regions from the hierarchy, where cluster ends are locked original vertices; the two polylines meet exactly." %}

**Culling, rasterization and shading.** After LOD selection, Nanite culls clusters against the frustum and against a hierarchical depth buffer (HZB) in **two passes**: first against the previous frame's depth (things visible last frame are probably visible now), then the remaining clusters are retested against the depth of what was just drawn, so nothing newly disoccluded is lost. Visible clusters are then rasterized into a **visibility buffer** (post 02): per pixel, a 64-bit value with depth plus the cluster and triangle IDs, written with atomics. Material shading happens later, once per pixel, by reading those IDs.

Rasterization is split. GPU hardware rasterizers are efficient for large triangles but waste work on tiny ones: they shade in 2x2 pixel quads and have per-triangle setup costs, so a triangle covering one pixel costs nearly as much as one covering many. Nanite therefore rasterizes clusters with **small triangles in a compute shader** (a software rasterizer, writing the visibility buffer with 64-bit atomics) and sends clusters with large triangles to the hardware path. The talk describes an edge-length threshold of 32 pixels ([summary](https://www.thecandidstartup.org/2023/04/03/nanite-graphics-pipeline.html)), which we use in the next figure.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-triangle-sizes.svg" caption="Triangle sizes on screen for a sphere tessellated into about 260 thousand triangles, at 3, 10 and 30 m (1080 p, 60° field of view), computed by projecting every front-facing triangle. Histogram of the longest edge in pixels (log scale); the dashed line is 32 px. With dense geometry every triangle falls below the line, even at 3 m (most are 1-10 px, and at 30 m most are below one pixel), which is exactly where a compute-shader rasterizer beats the fixed-function one." %}

Finally, Nanite **streams** its data: the DAG is cut into pages, and only the pages needed by the current cut are resident in GPU memory, with coarser data always present as a fallback. This is the "virtualized" in the name, by analogy with virtual memory. The [Nanite documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine) lists its current limits (for example, only opaque and masked materials, and no support for the forward renderer, MSAA or morph targets) and the features added since 2021, such as skeletal meshes.

### 1.2 Lumen: dynamic global illumination

Lumen computes indirect diffuse lighting and reflections every frame, with no baking, so lights, geometry and time of day can change freely. It was presented by Wright, Narkowicz and Kelly in the SIGGRAPH 2022 Advances course ([*Lumen: Real-time Global Illumination in Unreal Engine 5*](https://advances.realtimerendering.com/s2022/index.html)), and the [Lumen Technical Details](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine) page documents the current behaviour. The core difficulty is that GI needs rays that hit *anything* in the scene, including what is off screen, and then needs the *lit* color at the hit point, both within a few milliseconds. The diagram below shows the whole flow; read it left to right: the left column is what rays can hit (scene representations), the middle column is how they are traced, and the right column turns the result into per-pixel lighting.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-lumen-pipeline.svg" caption="A simplified Lumen pipeline, after the SIGGRAPH 2022 talk and the technical-details documentation. Left: the scene representations (screen, per-mesh distance fields, the merged global distance field, optional hardware ray-tracing structures) and the surface cache that stores material and lighting on cards. Middle: the tracing cascade for software ray tracing. Right: the final gather that turns traced radiance into indirect diffuse and reflections." %}

**Tracing without triangles.** With software ray tracing (the default on hardware without ray-tracing units), Lumen traces against **signed distance fields** (SDFs). Each mesh has a precomputed **mesh distance field**: a small 3D texture storing, at each point, the distance to the nearest surface. Lumen traces the first couple of meters (2 m, according to the documentation) against individual mesh SDFs, and farther rays against a merged, coarser **global distance field**. Before either, it tries a cheap **screen trace** against the depth buffer. With hardware ray tracing enabled, ray-triangle tracing replaces the distance-field steps.

Tracing an SDF uses **sphere tracing** (Hart 1996): at point $\mathbf{p}$ the distance $f(\mathbf{p})$ to the nearest surface means a sphere of that radius is empty, so the ray can safely advance by $f(\mathbf{p})$:

$$
\mathbf{p}_{k+1} = \mathbf{p}_k + f(\mathbf{p}_k)\, \boldsymbol{\omega}, \qquad \text{stop when } f(\mathbf{p}_k) < \epsilon .
$$

Here $\boldsymbol{\omega}$ is the unit direction of the ray and $\epsilon$ is the tolerance that counts as a hit (unrelated to the geometric error $\varepsilon$ above).

**Worked example.** A unit sphere at the origin, $f(\mathbf{p}) = \lVert\mathbf{p}\rVert - 1$, and a ray from $(-3, 0.5, 0)$ along $+x$. The steps are $2.041,\ 0.081,\ 0.0099,\ 0.0013$, reaching $x \approx -0.8662$ after four steps, against the exact hit at $x = -\sqrt{0.75} = -0.86603$. Far from surfaces the steps are large; near them convergence is fast. Grazing rays that pass close to a surface without hitting it are the slow case, and SDFs of thin walls are inaccurate, which is why the documentation asks for walls at least 10 cm thick.

```python
import numpy as np

def sphere_trace(f, origin, direction, eps=1e-3, max_steps=64):
    p = np.asarray(origin, float)
    d = np.asarray(direction, float) / np.linalg.norm(direction)
    for k in range(max_steps):
        dist = f(p)
        if dist < eps:
            return p, k
        p = p + dist * d
    return None, max_steps

unit_sphere = lambda p: np.linalg.norm(p) - 1.0
hit, steps = sphere_trace(unit_sphere, (-3.0, 0.5, 0.0), (1.0, 0.0, 0.0))
print(hit, steps)   # about [-0.8662, 0.5, 0.0] after 4 steps
```

**What is at the hit point? The surface cache.** A distance field tells you *where* a ray hits but not the material there. Lumen keeps a **surface cache**: each mesh is covered by a few **cards**, orthographic captures of the mesh from several directions (the documentation gives a default of 12 cards per static mesh and 6 per skeletal mesh), storing albedo, normal, depth and the computed *lighting*. A ray hit looks up the nearest cards and reads their cached lighting, so a hit costs a few texture fetches instead of a full material evaluation. The cache is relit incrementally over several frames, and because the cached lighting includes indirect light from the previous frame, multiple bounces accumulate over time. The figure below shows cards on a toy object: each small panel on the right is the depth captured by one card, where darker gray means closer to the card and white means the ray hit nothing.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-surface-cache-cards.svg" caption="Surface-cache cards on a toy object (a box with a sphere on top), computed by orthographic ray casting. Left: the object (black lines for the box, blue wireframe for the sphere) and its six axis-aligned card planes (purple outlines, pushed outwards so they are visible). Right: the depth captured by each of the six cards, titled +x, −x, +y, −y, +z, −z by the card's facing (darker = closer to the card, white = no hit). Every visible surface point appears in at least one card, so a ray hit can find its material and cached lighting by projecting into the cards that face it." %}

**Final gather.** Tracing rays for every pixel would be too expensive, so, according to the talk, Lumen traces from a sparse set of **screen-space probes** placed on the visible surfaces, importance-samples their directions using the previous frame's lighting, caches distant radiance in a coarser **world-space radiance cache**, and then integrates and filters the probe radiance into per-pixel indirect diffuse lighting. Reflections reuse the same tracing machinery with rays along the specular lobe. This "trace sparse, cache, interpolate" structure is the same idea as irradiance probes and DDGI (graphics post 11), made adaptive to what is on screen.

UE 5.8 (June 2026) added **Lumen Lite** (beta), a cheaper Lumen mode, according to the [UE 5.8 release notes](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes).

### 1.3 Virtual Shadow Maps

The single shadow map of post 03 has one texel density for the whole scene: blurry near the camera, wasted far away. Cascaded shadow maps improve this with a few maps at different scales. **Virtual Shadow Maps** (VSM) go much further. According to the [documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-shadow-maps-in-unreal-engine), each light gets a **virtual** shadow map of 16k × 16k texels, divided into pages of 128 × 128 texels. Only the pages that some visible pixel actually needs are allocated in a physical page pool and rendered (with Nanite, so the geometry detail matches the texel density), and pages are **cached** across frames unless something in them moves. Directional lights use a **clipmap**: a stack of such virtual maps centered on the camera, where each level covers twice the radius of the previous one; the documented levels range from about 64 cm to about 40 km.

**Choosing the level.** A pixel at distance $d$ covers a world footprint of about $\varphi = d \cdot 2\tan(\theta/2)/H$. Clipmap level $k$ covers radius $2^k$ cm with $16384$ texels across its diameter, so its texel size is $s_k = 2^{k+1}/16384$ cm. To have at least one shadow texel per pixel, the pixel needs the coarsest level whose texels are no larger than its footprint, $s_k \le \varphi$, that is $k = \lfloor \log_2(16384\, \varphi / 1\,\text{cm}) \rfloor - 1$ (clamped to the available levels), and its page is $\lfloor \mathbf{x} / (128\, s_k) \rfloor$ ($\mathbf{x}$ is the point's world coordinate in the clipmap plane, in cm; a page has 128 texels, so it is $128\, s_k$ wide).

**Worked example.** At $d = 10$ m with $H = 1080$ and $\theta = 60°$, $\varphi \approx 1.07$ cm. Level 14 has $s_{14} = 2^{15}/16384 = 2$ cm, too coarse; level 13 has $s_{13} = 1$ cm, so pixels at 10 m sample level 13, whose pages are $128 \times 1$ cm $= 1.28$ m wide. (Unreal's real level selection also depends on the distance to the clipmap center and on quality settings; this is the principle.) The figure below applies the same choice to the whole visible ground: in the left panel see how the color changes with distance, in the right panel how many pages each level needs.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-vsm-pages.svg" caption="Virtual shadow map page allocation for a toy view, computed with the model above: a camera 1.7 m above a ground plane, looking along +z, 1080 p and 60°. Left: top view of the pages requested by the visible ground within 150 m of the camera (red dot = camera, red lines = frustum), colored by clipmap level k; pages grow by 2× per level as the footprint grows with distance. Right: pages requested per level, against the 16,384 pages of a fully resident 16k map (log scale)." %}

Move and turn the camera in the widget below, which runs the same model. Pages outlined in red were not requested in the previous update: with page caching, only those would need to be rendered, which is why a slowly moving camera costs far less than the total page count suggests.

{% include widget.liquid name="graphics-engine-vsm-pages" height="560" caption="Virtual shadow map pages requested by a camera 1.7 m above the ground (top view, the red lines are the frustum). Drag to move the camera and use the slider to turn it. Colors are clipmap levels; red outlines mark pages that are new since the last update, the only ones a page cache would have to render." %}

### 1.4 Temporal Super Resolution, World Partition and MetaHuman

- **Temporal Super Resolution (TSR)** is UE5's built-in temporal upscaler: it renders at a lower internal resolution with a different sub-pixel jitter each frame, reprojects a high-resolution history with motion vectors, and accumulates samples, rejecting history where it no longer matches. Its ancestor is Karis's temporal anti-aliasing from UE4 (SIGGRAPH 2014 Advances). The [TSR documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/temporal-super-resolution-in-unreal-engine) explains its settings, for example the history sample count of 16 and how many frames it needs to converge at 50 % screen percentage. Temporal accumulation is also what makes Lumen and VSM affordable: all three spread work over frames.
- **World Partition** replaces manually split levels with a single persistent world divided into a grid and **streamed by distance**, with *One File Per Actor* so that many people can edit the same map without conflicts, *Data Layers* for variants, and automatically generated **HLODs** (hierarchical LOD proxies) for distant cells ([documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine)).
- **MetaHuman**: since UE 5.6, MetaHuman Creator, the tool for realistic digital humans, runs inside the engine, together with MetaHuman Animator for facial performance capture ([documentation](https://dev.epicgames.com/documentation/en-us/metahuman/metahuman-workflow-changes)).

### 1.5 What changed from UE 5.4 to 5.8

| Version | Released | Rendering highlights |
| --- | --- | --- |
| 5.4 | April 2024 | Experimental Nanite tessellation; motion matching production-ready |
| 5.5 | November 2024 | **MegaLights** (experimental: many shadowed dynamic lights); Substrate materials in beta; path tracer production-ready |
| 5.6 | June 2025 | MetaHuman Creator in the engine; performance work aimed at 60 Hz open worlds |
| 5.7 | November 2025 | Substrate and PCG (procedural content generation) production-ready; MegaLights beta; Nanite foliage |
| 5.8 | June 2026 | MegaLights production-ready; Lumen Lite (beta) |

Sources: Epic's [5.8 release notes](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes) and per-release coverage ([5.4](https://gamefromscratch.com/unreal-engine-5-4-released/), [5.5](https://gamefromscratch.com/unreal-engine-5-5-released/), [5.7](https://gamefromscratch.com/unreal-engine-5-7-released/)). As of November 2026, 5.8 is the latest released version.

## 2. Unity 6

Unity is a C++ engine scripted in C#, with a closed-source core. Unity 6 began with 6.0 LTS in 2024 and now ships a regular stream of updates: [6.3 LTS](https://unity.com/blog/unity-6-3-lts-is-now-available) (December 2025) is the current long-term-support release, and [6.6](https://unity.com/releases/editor/whats-new/6000.6.0) (August 2026) the latest supported update. In 2024 Unity [cancelled the runtime fee](https://unity.com/blog/unity-is-canceling-the-runtime-fee) that had caused a backlash in 2023 and returned to seat-based pricing.

**Scriptable Render Pipeline.** Unity's rendering loop itself is written in C# on top of the [Scriptable Render Pipeline](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/scriptable-render-pipeline-introduction) (SRP), a thin API for scheduling and configuring rendering commands. Two pipelines ship with it: the **Universal Render Pipeline** (URP), which scales from phones to PCs, and the **High Definition Render Pipeline** (HDRP) for high-end platforms. Unity's [render pipeline strategy for 2026](https://unity.com/topics/render-pipelines-strategy-for-2026) puts the new work into URP (including planned real-time GI and screen-space reflections), keeps HDRP in maintenance with no new features, and deprecates the old Built-in pipeline from 6.5.

**Render Graph.** In Unity 6, URP's passes are written against a [render graph](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/universal-render-pipeline/customizing-urp/render-graph/introduction): each pass declares its resources, and the system removes passes whose outputs are unused, allocates each resource just before its first write and frees it after its last read, and merges compatible passes into native render passes on tile-based mobile GPUs. These are precisely the three jobs of the toy `PassList` in post 03.

**GPU Resident Drawer.** The [GPU Resident Drawer](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/universal-render-pipeline/urp-whats-new) keeps instance data on the GPU (built on the BatchRendererGroup API) and draws compatible renderers with GPU instancing, cutting CPU cost for scenes with many objects, the knee in our frame-budget figure of post 03. It requires the Forward+ path and compute-capable graphics APIs. On top of it, [GPU occlusion culling](https://docs.unity.com/en-us/engine/6000.3/manual/analysis/graphics-performance-profiling/in-urp/gpu-culling) tests bounding spheres against a downsampled depth buffer from the current and previous frame, the same two-phase idea as Nanite's HZB culling. The **STP** (Spatial-Temporal Post-processing) upscaler plays the role of TSR, and Adaptive Probe Volumes provide per-pixel baked probe lighting.

**DOTS and Entities.** Unity's data-oriented stack (the Entities ECS, the Burst compiler and the C# Job System) is the production example of post 01's ideas. Since [Unity 6.4](https://unity.com/releases/editor/whats-new/6000.4.0) (March 2026), Entities, Entities Graphics and Collections are **core packages** versioned with the editor, and 6.5 moved Netcode for Entities into the engine.

## 3. Godot 4

Godot is a fully **open-source** engine under the [MIT license](https://godotengine.org/license/), written in C++ and scripted in GDScript, C# or native extensions. As of November 2026 the latest stable release is [4.7.2](https://godotengine.org/article/maintenance-release-godot-4-7-2/) (August 2026), after the [4.7](https://godotengine.org/releases/4.7/) feature release in June 2026 (HDR output, area lights, Vulkan foveated-rendering support).

**RenderingDevice.** Godot 4 rewrote its renderer around [RenderingDevice](https://docs.godotengine.org/en/stable/classes/class_renderingdevice.html), a low-level abstraction over modern explicit APIs, the same kind of render hardware interface (RHI) that Unreal calls RHI and that post 02 described. Behind it are Vulkan, Direct3D 12 (since [4.3](https://godotengine.org/releases/4.3/)) and Metal (since [4.4](https://godotengine.org/releases/4.4/), Apple silicon). RenderingDevice is also exposed to scripts, so you can write compute shaders from GDScript.

**Three renderers.** [Forward+](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html) (clustered forward rendering for desktop) and Mobile both run on RenderingDevice; **Compatibility** runs on OpenGL and is the only choice on the web. That one engine maintains three renderers is a good lesson in itself: the feature set is a function of the platform.

**Global illumination options.** Godot offers a [menu of GI techniques](https://docs.godotengine.org/en/stable/tutorials/3d/global_illumination/introduction_to_global_illumination.html) with different trade-offs: **VoxelGI** (real-time, voxel-based, for bounded areas), **SDFGI** (signed-distance-field GI with cascades around the camera, introduced by Juan Linietsky [in 2020](https://godotengine.org/article/godot-40-gets-sdf-based-real-time-global-illumination); it needs no UV unwrapping or baking; dynamic objects receive its light but do not contribute to it), screen-space indirect lighting (SSIL), baked **LightmapGI**, and reflection probes. Comparing SDFGI with Lumen is instructive: both use distance fields to trace cheaply, but Lumen adds the surface cache and screen probes to reach higher quality and dynamic contribution.

**Why study Godot.** Godot's renderer is small enough to read. The RenderingDevice-based renderers live in `servers/rendering/renderer_rd/` in the [repository](https://github.com/godotengine/godot), and every design decision is discussed in public pull requests and proposals.

## 4. Bevy

[Bevy](https://github.com/bevyengine/bevy) is an engine written in Rust, dual-licensed MIT or Apache-2.0, and **ECS-first**: everything, including rendering, is entities, components, resources and systems. Its latest release as of November 2026 is [Bevy 0.20](https://bevy.org/news/bevy-0-20/) (October 2026); it is still pre-1.0 and breaks its API every release.

**wgpu.** Bevy renders through [wgpu](https://github.com/gfx-rs/wgpu), the Rust implementation of the WebGPU API (post 03's API) that runs on Vulkan, Metal, D3D12, OpenGL and in browsers through WebGPU or WebGL2.

**The render app and the extract phase.** Bevy runs rendering in a separate **sub-app** with its own ECS world. Each frame, a short [`ExtractSchedule`](https://docs.rs/bevy_render/latest/bevy_render/struct.ExtractSchedule.html) copies the data that rendering needs (transforms, mesh handles, lights, cameras) from the main world into the render world; then the main world can start simulating frame $n+1$ while the render world prepares and submits frame $n$. This is **pipelining**: with simulation time $S$ and render-preparation time $R$, the frame time drops from $S + R$ to about $\max(S, R)$, at the cost of one frame of latency. The documentation asks that extraction be kept short, since it is the only point where the two worlds are synchronized. Our mini engine's `render(world, ...)` reads the ECS directly; extraction is how you would make it run in parallel.

Bevy's recent rendering work shows where an open engine can go quickly: experimental virtual geometry (meshlets) since [0.14](https://bevy.org/news/bevy-0-14/), the experimental ray-traced lighting project **Solari** since [0.17](https://bevy.org/news/bevy-0-17/), render passes turned into ordinary ECS systems in [0.19](https://bevy.org/news/bevy-0-19/), and mesh shaders in 0.20. To study it, start in `crates/bevy_render` and `crates/bevy_pbr`.

## 5. Other engines worth knowing

- **O3DE** ([Open 3D Engine](https://github.com/o3de/o3de)), the open-sourced successor of Amazon Lumberyard, is Apache-2.0 / MIT licensed; its modular renderer is called [Atom](https://www.docs.o3de.org/docs/atom-guide/).
- **Filament** ([GitHub](https://github.com/google/filament), Apache-2.0) is Google's real-time PBR engine for Android, iOS, desktop and WebGL2. Its [design document](https://google.github.io/filament/Filament.md.html) is the best free text on implementing PBR (we used it in post 03).
- **Frostbite** (EA) is not public, but its talks shaped the industry: the [FrameGraph](https://www.gdcvault.com/play/1024612/FrameGraph-Extensible-Rendering-Architecture-in) talk (GDC 2017) popularized render graphs, and *Moving Frostbite to Physically Based Rendering* ([SIGGRAPH 2014 course](https://blog.selfshadow.com/publications/s2014-shading-course/)) is a reference for PBR in production.
- **id Tech 8**, id Software's engine for *DOOM: The Dark Ages* (2025), is built around ray tracing: the game renders with ray tracing natively, with a path-tracing mode added later ([NVIDIA](https://www.nvidia.com/en-us/geforce/news/doom-the-dark-ages-dlss-4-multi-frame-generation-out-now)), a sign that hardware ray tracing is becoming a baseline.
- **NVIDIA Falcor** ([GitHub](https://github.com/NVIDIAGameWorks/Falcor)) is a research framework on D3D12 and Vulkan designed for prototyping real-time rendering research, a good bridge between papers and engines.
- **RTX Remix** ([GitHub](https://github.com/NVIDIAGameWorks/rtx-remix)) intercepts the draw calls of old fixed-function DirectX 8/9 games, rebuilds the scene and re-renders it with path tracing, so modders can replace assets and lights. Its runtime is open source, a fascinating example of an engine built *around* someone else's engine.

## 6. Comparison

| | Unreal Engine 5 | Unity 6 | Godot 4 | Bevy |
| --- | --- | --- | --- | --- |
| Core language | C++ | C++ core, C# scripting | C++ | Rust |
| License | Source available (Unreal EULA) | Proprietary | MIT | MIT or Apache-2.0 |
| Renderer architecture | Deferred + visibility buffer (Nanite); RDG render graph | SRP in C#: URP (forward, Forward+, deferred) and HDRP; render graph | RenderingDevice; Forward+, Mobile, Compatibility (OpenGL) | wgpu; render sub-app with extract phase |
| Dynamic GI | Lumen (software SDF or hardware RT) | Baked probes (APV), lightmaps; real-time GI planned for URP | SDFGI, VoxelGI, SSIL; LightmapGI | Experimental (Solari) |
| Geometry pipeline | Nanite virtualized geometry, HLOD | GPU Resident Drawer, GPU occlusion culling, LOD groups | Classic LOD, auto mesh LOD, occlusion culling | Experimental meshlets, mesh shaders |
| Scripting | C++, Blueprint | C# | GDScript, C#, GDExtension | Rust |
| ECS | Mass (for crowds) | Entities (core package since 6.4) | Node tree, not ECS | ECS everywhere |
| Platforms | PC, consoles, mobile, XR | PC, consoles, mobile, XR, web | PC, mobile, web, XR | PC, web, mobile (less mature) |

Two cells deserve care. "Unreal's render graph" is the Render Dependency Graph (RDG), the production version of post 02's graph. Unity's ECS and its GameObject world still coexist; most Unity projects use GameObjects.

## 7. What to learn from each, and how to read their source

- **From Unreal**: how to make cost proportional to *pixels*, not *content* (Nanite, VSM), and how far temporal amortization goes (Lumen, TSR, VSM caching). Read the SIGGRAPH talks first, then the shaders: in the GitHub source, `Engine/Shaders/Private/Nanite/` and `Engine/Shaders/Private/Lumen/` are more readable than the C++ that drives them. The Nanite and Lumen visualization modes of the editor viewport are the fastest way to see the cut, clusters and overdraw live.
- **From Unity**: how to expose a renderer as an *API* so that users can write their own pipelines and passes (SRP, render graph), and how to retrofit data-oriented design onto an object-oriented engine (Entities, GPU Resident Drawer). URP's C# source ships with the package and is easy to step through in a debugger.
- **From Godot**: how a small team keeps a portable renderer understandable, and how to offer several GI methods with honest trade-offs. Start from `RenderingDevice`, then one renderer in `servers/rendering/renderer_rd/`.
- **From Bevy**: how far "everything is ECS" can go, and how extraction and pipelining decouple simulation from rendering. Its examples folder is a test suite of small programs, and its release notes explain each design change.

**How to read an engine's source.** Do not start at `main`. Pick one *frame* and one *feature*: capture a frame with RenderDoc (post 03), list its passes, then find the code that issues each pass by searching for its debug label (every engine labels its passes). Follow one resource (for example the shadow map) from creation to last use. Keep the official talk next to the code: the talk explains *why*, the code shows the hundreds of special cases the talk left out.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Hoppe, *Progressive Meshes* | SIGGRAPH | 1996 | [DOI](https://doi.org/10.1145/237170.237216) | Continuous LOD by edge collapses; the ancestor of view-dependent refinement |
| Garland & Heckbert, *Surface Simplification Using Quadric Error Metrics* | SIGGRAPH | 1997 | [DOI](https://doi.org/10.1145/258734.258849) | The simplification error used to build cluster hierarchies |
| Cignoni et al., *Batched Multi Triangulation* | IEEE Visualization | 2005 | [DOI](https://doi.org/10.1109/VISUAL.2005.1532797) | DAG of patches with consistent boundaries; the closest precursor of Nanite |
| Burns & Hunt, *The Visibility Buffer: A Cache-Friendly Approach to Deferred Shading* | JCGT | 2013 | [Paper](https://jcgt.org/published/0002/02/04/paper.pdf) | Store triangle IDs, shade later; Nanite's output format |
| Karis, Stubbe & Wihlidal, *A Deep Dive into Nanite Virtualized Geometry* | SIGGRAPH Advances course | 2021 | [Course page](https://advances.realtimerendering.com/s2021/index.html) | The Nanite design: cluster DAG, LOD cut, culling, software rasterization |
| Hart, *Sphere Tracing* | The Visual Computer | 1996 | [DOI](https://doi.org/10.1007/s003710050084) | Ray marching signed distance fields, the basis of Lumen's software tracing and Godot's SDFGI |
| Crassin et al., *Interactive Indirect Illumination Using Voxel Cone Tracing* | Computer Graphics Forum (PG) | 2011 | [DOI](https://doi.org/10.1111/j.1467-8659.2011.02063.x) | Real-time GI from a voxel scene; the idea behind Godot's VoxelGI |
| Majercik et al., *Dynamic Diffuse Global Illumination with Ray-Traced Irradiance Fields* | JCGT | 2019 | [Paper](http://jcgt.org/published/0008/02/01/) | Probe-based dynamic GI (DDGI) |
| Wright, Narkowicz & Kelly, *Lumen: Real-time Global Illumination in Unreal Engine 5* | SIGGRAPH Advances course | 2022 | [Course page](https://advances.realtimerendering.com/s2022/index.html) | Surface cache, distance-field tracing, screen probes |
| Fernando et al., *Adaptive Shadow Maps* | SIGGRAPH | 2001 | [DOI](https://doi.org/10.1145/383259.383302) | Hierarchical, view-driven shadow-map resolution; an ancestor of VSM |
| Lefohn, Sengupta & Owens, *Resolution-Matched Shadow Maps* | ACM TOG | 2007 | [DOI](https://doi.org/10.1145/1289603.1289611) | Allocate shadow pages only where the view needs them |
| Karis, *High Quality Temporal Supersampling* | SIGGRAPH Advances course | 2014 | [Course page](https://advances.realtimerendering.com/s2014/index.html) | The temporal accumulation behind TAA and TSR |
| Bitterli et al., *Spatiotemporal Reservoir Resampling for Real-Time Ray Tracing with Dynamic Direct Lighting* | ACM TOG (SIGGRAPH) | 2020 | [DOI](https://doi.org/10.1145/3386569.3392481) | ReSTIR: reservoir resampling for many dynamic lights, the start of a family of stochastic many-light methods |

## Learning resources

- The SIGGRAPH [Advances in Real-Time Rendering](https://advances.realtimerendering.com/) course pages (2021 Nanite, 2022 Lumen, and every year since): the primary source for production rendering.
- Official documentation: [Nanite](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine), [Lumen technical details](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine), [Virtual Shadow Maps](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-shadow-maps-in-unreal-engine); Unity's [URP render graph](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/universal-render-pipeline/customizing-urp/render-graph/introduction); Godot's [rendering docs](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html); Bevy's [news posts](https://bevy.org/news/), which explain each release's design.
- Source code: [Godot](https://github.com/godotengine/godot), [Bevy](https://github.com/bevyengine/bevy), [O3DE](https://github.com/o3de/o3de), [Filament](https://github.com/google/filament), [Falcor](https://github.com/NVIDIAGameWorks/Falcor); Unreal Engine on GitHub after linking an Epic account.
- *Real-Time Rendering* (4th ed.) by Akenine-Möller et al., and Jason Gregory's *Game Engine Architecture* for the surrounding systems.
- The [meshoptimizer](https://github.com/zeux/meshoptimizer) library by Arseny Kapoulkine, whose clusterizer and simplifier are the most common open building blocks for Nanite-like pipelines.

## Exercises

1. **Monotonic error.** Remove `max(err, a["err"], b["err"])` from the hierarchy builder (keep only `err`) and search for camera positions where the cut becomes inconsistent (a cluster and one of its ancestors both selected, or neither). Why does monotonicity prevent this?
   <details markdown="1"><summary>Hint</summary>
   With the per-cluster test $\varepsilon(c) \le \tau < \varepsilon(\text{parent})$, a root-to-leaf path crosses the cut once only if $\varepsilon$ decreases along the path. If a parent's error is smaller than its child's, both inequalities can hold (or fail) at the same time on one path.
   </details>
2. **Groups as a DAG.** Change the builder so that each level merges *four* clusters, simplifies to half, and splits into *two* clusters, and shift the grouping by one cluster on alternate levels. Draw the resulting graph: which clusters now have two parents?
3. **Sphere tracing cost.** Count the steps `sphere_trace` needs for rays that pass the unit sphere at distances 0.01, 0.1 and 1 from its surface. Plot steps against miss distance and explain the result.
   <details markdown="1"><summary>Hint</summary>
   Near a surface the safe step is the small distance to it, so grazing rays creep forward; the step count grows roughly like the inverse square root of the miss distance for a smooth surface.
   </details>
4. **VSM budget.** Extend the page-allocation model to count physical pages for a camera that turns 90° per second, with a cache that keeps pages for 30 frames. How many new pages per frame must be rendered?
5. **Read the source.** In Godot's repository, find where Forward+ builds its clustered light list, or in Bevy, find the system that extracts point lights. Write down the data that crosses from the scene to the renderer.

The [next post]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }}) turns from rendering to simulation: the physics pipeline of a game engine, and how engines such as Isaac, MuJoCo, Newton and Genesis became simulators for robots and AI.
