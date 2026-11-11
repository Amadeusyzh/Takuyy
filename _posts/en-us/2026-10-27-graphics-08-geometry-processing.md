---
layout: post
title: "Geometry processing: meshes, curvature, smoothing, subdivision and reconstruction"
date: 2026-10-27 09:08:00+0900
description: "Mesh representations and the half-edge structure, discrete curvature with the cotangent Laplacian, smoothing, Loop subdivision, QEM simplification, Tutte parameterization, marching squares and cubes, and Poisson reconstruction, all in NumPy."
categories: graphics
tags: [geometry-processing, meshes, laplacian, subdivision, simplification, marching-cubes, poisson]
series: graphics
series_order: 8
toc:
  sidebar: left
related_posts: false
---

## Why this matters

[Rasterization]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }}) and [path tracing]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}) take a triangle mesh as given. This post is about where those meshes come from and how we operate on them. Triangle meshes are the common language of film, games, CAD, 3D scanning and 3D printing, and now of 3D generation too. A scanner or a neural field gives you points or an implicit function, and you have to turn them into a mesh. An artist's mesh has to be smoothed, refined, simplified for level of detail, and unwrapped for texturing. Neural reconstruction ([surfaces from Gaussians]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})) ends with the same tools: marching cubes, Poisson reconstruction and mesh simplification.

We will build each tool from scratch in NumPy: a half-edge structure, curvature from the cotangent Laplacian, smoothing, Loop subdivision, quadric error simplification, Tutte embedding, marching squares and tetrahedra, sphere tracing, and Poisson reconstruction.

## Prerequisites

- Vectors, cross products, matrices and least squares ([post 1]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})).
- Triangles, barycentric coordinates and indexed meshes ([post 2]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})).
- A little calculus on surfaces: normals, gradients, and the idea of a Laplacian $\Delta f = \partial^2 f/\partial x^2 + \partial^2 f/\partial y^2$.
- Python with NumPy. Sparse linear algebra helps but is not required: every example here is small enough for dense matrices.

## 1. Representations of shape

There is no single best way to store a 3D shape. Each representation makes some operations cheap and others hard.

| Representation | What is stored | Cheap | Hard |
| --- | --- | --- | --- |
| Polygon soup | a list of triangles, each with its own 3 positions | rendering | anything that needs neighbors |
| Indexed mesh | vertex array $V \in \mathbb{R}^{n\times 3}$ + face array $F \in \mathbb{N}^{m\times 3}$ | rendering, storage | adjacency queries (need extra structure) |
| Half-edge mesh | indexed mesh + oriented edge records | local traversal and editing | arbitrary non-manifold input |
| Point cloud | samples $\mathbf{p}_i$, maybe normals $\mathbf{n}_i$ | capture (LiDAR, depth, SfM) | topology, rendering without holes |
| Implicit / SDF | a function $f:\mathbb{R}^3\to\mathbb{R}$, surface $=\\{f=0\\}$ | inside tests, booleans, blending | rendering needs root finding, sharp features |
| Voxels | $f$ or occupancy on a grid | simple, GPU friendly | memory grows as $N^3$ |
| Parametric | patches $\mathbf{x}(u,v)$ (Bézier, B-spline, NURBS) | exact smooth CAD surfaces | stitching patches, arbitrary topology |

An **indexed mesh** is what [post 2]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }}) rasterized: positions once, and triangles as triples of indices. Two topological ideas are needed before we can process it.

**Manifoldness.** A mesh is a (2-)**manifold** if every point has a neighborhood that looks like a disk (or a half-disk on the boundary). On a triangle mesh this means: every edge belongs to one or two triangles (one on the boundary), and the triangles around every vertex form a single fan, closed for interior vertices and open for boundary vertices. A "bow-tie" vertex where two fans touch at one point, or an edge shared by three triangles, is non-manifold. Most algorithms below assume a manifold, consistently oriented mesh (every face lists its vertices counter-clockwise when seen from outside).

**Euler characteristic.** For a mesh with $V$ vertices, $E$ edges and $F$ faces,

$$
\chi = V - E + F = 2 - 2g - b,
$$

where $g$ is the genus (number of handles) and $b$ the number of boundary loops. A cube has $8 - 12 + 6 = 2$ (a sphere). A triangulated $48\times 24$ torus grid has $V = 1152$, $E = 3 \cdot 1152 = 3456$ (each grid cell contributes a horizontal, a vertical and a diagonal edge) and $F = 2304$, so $\chi = 0$ ($g = 1$). The Euler characteristic will come back as a check of our curvature code. A useful consequence for closed triangle meshes: every face has 3 edges and every edge 2 faces, so $2E = 3F$, and with $\chi$ small, $F \approx 2V$ and $E \approx 3V$. The average vertex has **valence** (number of neighbors) close to 6.

## 2. The half-edge data structure

Most geometry processing asks local questions: "which vertices surround vertex $i$?", "which faces share this edge?", "walk along the boundary". An indexed face list answers them only by searching. The **half-edge** structure stores each edge twice, once per direction, and links the records so that every local query takes constant time per step.

Each half-edge $h$ stores:

- `orig[h]`: the vertex it starts from;
- `twin[h]`: the half-edge going the other way along the same edge;
- `next[h]`: the next half-edge around the same face (counter-clockwise);
- `face[h]`: the face to its left, or $-1$ for a boundary half-edge.

From these, everything else follows: the tip of $h$ is `orig[twin[h]]`, and the previous half-edge in a triangle is `next[next[h]]`. The key traversal is rotating around a vertex: if $h$ leaves vertex $v$, then `next[twin[h]]` also leaves $v$, one face further around. Here is the construction from a face list, with boundary half-edges linked into loops so that the same rotation also works at the boundary:

```python
def build_halfedge(F):
    """Half-edge arrays from a face list: origin, twin, next, face (-1 for boundary)."""
    orig, face, nxt, index = [], [], [], {}
    for f, tri in enumerate(F):
        base = len(orig)
        for k in range(3):
            a, b = tri[k], tri[(k + 1) % 3]
            index[(a, b)] = base + k
            orig.append(a); face.append(f); nxt.append(base + (k + 1) % 3)
    twin = [-1] * len(orig)
    for (a, b), h in list(index.items()):
        if (b, a) in index:
            twin[h] = index[(b, a)]
        else:  # create the boundary half-edge b -> a
            g = len(orig)
            orig.append(b); face.append(-1); nxt.append(-1); twin.append(h)
            twin[h] = g
            index[(b, a)] = g
    out_boundary = {orig[h]: h for h in range(len(orig)) if face[h] == -1}
    for h in range(len(orig)):
        if face[h] == -1:
            nxt[h] = out_boundary[orig[twin[h]]]  # next boundary half-edge starts at our tip
    return dict(orig=orig, twin=twin, next=nxt, face=face)

def one_ring(he, h0):
    ring, h = [], h0
    while True:
        ring.append(h)
        h = he["next"][he["twin"][h]]
        if h == h0:
            return ring

F = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 5), (0, 5, 6)]   # a fan with one wedge missing
he = build_halfedge(F)
tip = lambda h: he["orig"][he["twin"][h]]
print(len(he["orig"]), "half-edges")                        # 22
print("one-ring of 0:", [tip(h) for h in one_ring(he, 0)])  # [1, 6, 5, 4, 3, 2]
b0 = he["face"].index(-1)
loop, h = [], b0
while True:
    loop.append(he["orig"][h]); h = he["next"][h]
    if h == b0: break
print("boundary loop:", loop)                               # [1, 0, 6, 5, 4, 3, 2]
```

The fan has 7 vertices, 11 edges and 5 faces ($\chi = 1$: a disk). Its 15 interior half-edges plus 7 boundary half-edges give 22. The figure draws exactly these records, from the same code.

{% include blog_figure.liquid path="assets/img/blog/graphics/08-halfedge.svg" caption="The half-edge structure of the fan built by `build_halfedge`. Each arrow is one half-edge, drawn slightly inside the face to its left; boundary half-edges (orange) sit outside and are chained by `next` into the boundary loop. Purple: the outgoing half-edges of vertex 0 visited by `one_ring` (one of them is a boundary half-edge, which is how the rotation passes the missing wedge). The labels show one half-edge $h$ (from 0 to 1), its `next` (black) and its `twin` (on the boundary)." %}

Production libraries (OpenMesh, CGAL's `Surface_mesh`, geometry-central, Blender's BMesh) store the same idea with integer handles in arrays, plus a per-vertex "one outgoing half-edge" and per-face "one half-edge". Edge collapse, edge flip and edge split, the three local operations of remeshing, become a few pointer updates.

## 3. Discrete differential geometry

On a smooth surface, curvature describes how the surface bends. At each point there are two **principal curvatures** $\kappa_1, \kappa_2$ (the extreme curvatures of curves cut by normal planes). Their mean $H = (\kappa_1 + \kappa_2)/2$ is the **mean curvature** and their product $K = \kappa_1\kappa_2$ the **Gaussian curvature**. A sphere of radius $r$ has $\kappa_1 = \kappa_2 = 1/r$, so $H = 1/r$ and $K = 1/r^2$; a cylinder has $K = 0$; a saddle has $K < 0$. A mesh is flat inside every triangle, so all curvature lives at edges and vertices. Discrete differential geometry defines curvature on meshes so that the classical theorems remain exactly true.

### Vertex normals

A face normal is $\mathbf{n}_f = (\mathbf{b}-\mathbf{a})\times(\mathbf{c}-\mathbf{a}) / \lVert\cdot\rVert$, and its unnormalized length is twice the triangle area. A vertex normal averages the normals of the incident faces. Three common weights:

- **uniform**: $\sum_f \mathbf{n}_f$; depends on how the surface is triangulated;
- **area-weighted**: $\sum_f A_f \mathbf{n}_f$ (just sum the unnormalized cross products); cheap and the usual default;
- **angle-weighted**: $\sum_f \theta_f \mathbf{n}_f$, with $\theta_f$ the corner angle of face $f$ at the vertex; independent of how a flat region is split into triangles (Thürmer and Wüthrich).

### The cotangent Laplacian

The **Laplace–Beltrami operator** $\Delta_S$ generalizes the Laplacian to functions on a surface. Applied to the position function $\mathbf{x}$ itself, it gives curvature:

$$
\Delta_S \mathbf{x} = -2H\,\mathbf{n}.
$$

For a sphere of radius $r$, $\Delta_S\mathbf{x}$ points to the center with length $2/r$. So if we can discretize $\Delta_S$, we get the **mean-curvature normal** for free.

The standard discretization comes from minimizing the Dirichlet energy $\frac12\int_S \lVert\nabla f\rVert^2$ for functions $f$ that are linear on each triangle (the "hat" basis of finite elements). Inside one triangle with vertices $i,j,k$ and corner angles $\alpha_i, \alpha_j, \alpha_k$, a short computation with the gradients of the hat functions gives

$$
\int_T \lVert\nabla f\rVert^2 = \tfrac12\big(\cot\alpha_k (f_i - f_j)^2 + \cot\alpha_i (f_j - f_k)^2 + \cot\alpha_j (f_k - f_i)^2\big),
$$

so each edge is weighted by the cotangent of the angle *opposite* to it. Summing over the two triangles that share the edge $ij$, with opposite angles $\alpha_{ij}$ and $\beta_{ij}$, and differentiating with respect to $f_i$ gives the **cotangent Laplacian** (Pinkall and Polthier 1993; Meyer et al. 2003):

$$
(\mathbf{L}f)_i = \sum_{j \in N(i)} w_{ij}\,(f_j - f_i), \qquad w_{ij} = \tfrac12\big(\cot\alpha_{ij} + \cot\beta_{ij}\big).
$$

Here $N(i)$ is the set of neighbours of vertex $i$, and the gradient of the Dirichlet energy with respect to $f$ is $-\mathbf{L}f$, so $\mathbf{L}$ is negative semi-definite. $\mathbf{L}$ is also symmetric and its rows sum to zero. To get a pointwise value we divide by an area $A_i$ associated with vertex $i$: one third of the incident triangle areas (the **barycentric** area), or the more accurate **mixed Voronoi** area of Meyer et al. Then

$$
\Delta_S\mathbf{x}_i \approx \frac{1}{A_i}\sum_{j} w_{ij}(\mathbf{x}_j - \mathbf{x}_i) = -2H_i\mathbf{n}_i, \qquad H_i = -\tfrac12\,(\Delta_S\mathbf{x}_i)\cdot\mathbf{n}_i.
$$

**Worked example.** For a mesh of equilateral triangles every angle is $60^\circ$ and $\cot 60^\circ = 1/\sqrt3 \approx 0.577$, so every interior edge gets $w_{ij} = \frac12(0.577 + 0.577) = 0.577$: on a perfectly regular mesh the cotan Laplacian is a multiple of the uniform one. On irregular meshes they differ, and that is the point. The uniform ("umbrella") Laplacian $\frac1{|N(i)|}\sum_j(\mathbf{x}_j-\mathbf{x}_i)$ is just "the vector to the centroid of the neighbors". On a *flat* but irregular one-ring it is not zero, so smoothing with it slides vertices sideways. The cotan version is exactly zero for any flat one-ring: it only "sees" bending. The figure shows both on the same one-ring.

{% include blog_figure.liquid path="assets/img/blog/graphics/08-cotan-weights.svg" caption="Cotangent weights on a flat, irregular one-ring, computed with `cotan_laplacian`. Each spoke $0j$ is colored and thickened by $w_{0j}$ (the number on it); for the spoke $0$–$1$ the two opposite angles $\alpha$ and $\beta$ are marked in red. Lilac: the barycentric area of vertex 0. The orange arrow is the uniform Laplacian (scaled 4 times): it points sideways although the surface is flat. The title shows the cotan sum $\sum_j w_{0j}(\mathbf{x}_j-\mathbf{x}_0)$, zero up to rounding." %}

```python
import numpy as np

def corner_angles(V, F):
    t = V[F]
    ang = np.zeros(F.shape)
    for k in range(3):
        u, w = t[:, (k + 1) % 3] - t[:, k], t[:, (k + 2) % 3] - t[:, k]
        c = (u * w).sum(1) / (np.linalg.norm(u, axis=1) * np.linalg.norm(w, axis=1))
        ang[:, k] = np.arccos(np.clip(c, -1, 1))
    return ang

def cotan_laplacian(V, F):
    """Dense L with L[i, j] = (cot a_ij + cot b_ij) / 2 and rows summing to zero."""
    n, L = len(V), np.zeros((len(V), len(V)))
    ang = corner_angles(V, F)
    for k in range(3):
        i, j = F[:, (k + 1) % 3], F[:, (k + 2) % 3]      # edge opposite corner k
        w = 0.5 / np.tan(ang[:, k])
        np.add.at(L, (i, j), w); np.add.at(L, (j, i), w)
    L[np.diag_indices(n)] = -L.sum(1)
    return L

def vertex_areas(V, F):                                   # barycentric: 1/3 of incident areas
    t = V[F]
    A = 0.5 * np.linalg.norm(np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]), axis=1)
    out = np.zeros(len(V)); np.add.at(out, F.ravel(), np.repeat(A / 3, 3))
    return out
```

For a real mesh use a sparse matrix (`scipy.sparse.coo_matrix` with the same triplets); the dense version is only for clarity.

Two cautions. Cotangents become negative for angles above $90^\circ$, so on meshes with obtuse triangles some weights are negative, which breaks maximum principles (a smoothed function can overshoot). Intrinsic Delaunay triangulations (Sharp, Soliman and Crane) fix this without changing the geometry. And the weights blow up for nearly degenerate triangles, so remeshing to well-shaped triangles is often the first step of a pipeline.

### Gaussian curvature from the angle defect

Gaussian curvature has an even simpler discrete form. Flatten the triangles around an interior vertex $i$ into the plane: if the corner angles add up ($\sum\theta$) to exactly $2\pi$ the vertex is flat. The **angle defect**

$$
\delta_i = 2\pi - \sum_{f \ni i} \theta_f^{(i)}
$$

is the integrated Gaussian curvature in the vertex's area, so $K_i \approx \delta_i / A_i$. A cone tip has a positive defect, a saddle vertex (angles summing to more than $2\pi$) a negative one. At a boundary vertex one uses $\pi - \sum\theta$ instead.

The **discrete Gauss–Bonnet theorem** holds exactly, not approximately:

$$
\sum_i \delta_i = 2\pi\chi .
$$

Worked example: on an octahedron, each vertex has four equilateral corners, so $\delta = 2\pi - 4\cdot\frac{\pi}{3} = \frac{2\pi}{3}$, and the six vertices sum to $4\pi = 2\pi\cdot 2$. The proof is pure counting: the corner angles of each triangle add up to $\pi$, so $\sum_i\delta_i = 2\pi V - \pi F$, and with $2E = 3F$ (that is, $F/2 = E - F$) this is $2\pi(V - E + F)$.

```python
def gaussian_curvature(V, F):
    defect = np.full(len(V), 2 * np.pi)
    np.add.at(defect, F.ravel(), -corner_angles(V, F).ravel())
    return defect / vertex_areas(V, F), defect

def mean_curvature(V, F, normals):
    lap = (cotan_laplacian(V, F) @ V) / vertex_areas(V, F)[:, None]   # = -2 H n
    return -0.5 * (lap * normals).sum(1)
```

A torus is the ideal test because both curvatures are known in closed form. With tube radius $r$, center radius $R$ and $v$ the angle around the tube,

$$
K(v) = \frac{\cos v}{r\,(R + r\cos v)}, \qquad H(v) = \frac{R + 2r\cos v}{2r\,(R + r\cos v)}.
$$

The outer half ($\cos v > 0$) is sphere-like with $K > 0$; the inner half is saddle-like with $K < 0$; and Gauss–Bonnet says the two must cancel exactly, since $\chi = 0$. On the $48\times24$ torus below, the sum of all angle defects is $-3\times10^{-13}$ (rounding), and the largest pointwise errors against the formulas are $0.03$ for $K$ (which ranges from $-4.2$ to $1.8$) and $0.006$ for $H$ (with the exact normals).

{% include blog_figure.liquid path="assets/img/blog/graphics/08-curvature.svg" caption="Discrete curvature on a $48\times24$ torus ($R=1$, $r=0.4$), computed with the code above. Left: Gaussian curvature from the angle defect, red where $K>0$ (outside) and blue where $K<0$ (inside the hole). Middle: mean curvature from the cotan Laplacian. Right: the values along one ring of the tube against the exact formulas (red: $K$, blue: $H$; dots and squares are the discrete values, curves the exact formulas); the markers should sit close to the curves. The title prints the sum of all angle defects, zero up to rounding, as Gauss–Bonnet requires for $\chi=0$." %}

## 4. Smoothing and fairing

Scanned meshes are noisy. Treat the vertex positions as a signal on the mesh and apply diffusion, $\partial\mathbf{x}/\partial t = \Delta_S\mathbf{x}$. Since $\Delta_S\mathbf{x} = -2H\mathbf{n}$, this moves every vertex along its normal with speed proportional to its mean curvature: it is **mean curvature flow**, which irons out bumps.

### Explicit Laplacian smoothing and shrinkage

The simplest discretization is one explicit Euler step per iteration:

$$
\mathbf{x} \leftarrow \mathbf{x} + \lambda\,\mathbf{L}\mathbf{x}, \qquad 0 < \lambda \le 1
$$

(with $\mathbf{L}$ the uniform or cotan Laplacian, normalized so that its diagonal is $-1$). To see what it does, expand the shape in eigenvectors of $\mathbf{L}$. They play the role of Fourier modes: $\mathbf{L}\mathbf{e}_k = -\kappa_k\mathbf{e}_k$ with "frequency" $\kappa_k \ge 0$. For a closed polygon with $n$ vertices and the uniform Laplacian, the modes are sines and cosines and $\kappa_k = 1 - \cos(2\pi k/n) \in [0, 2]$. One iteration multiplies mode $k$ by the **transfer function**

$$
f(\kappa) = 1 - \lambda\kappa .
$$

High frequencies (noise, $\kappa$ near 2) are damped strongly, as intended. But every non-constant mode is damped, including the lowest ones that carry the overall size: a circle is the mode $k=1$ and it shrinks a little at every iteration. Run long enough and any closed shape shrinks to a point. This is **shrinkage**.

### Taubin's $\lambda\vert\mu$ smoothing

Taubin (1995) alternates a shrinking step with $\lambda > 0$ and an inflating step with $\mu < -\lambda$:

$$
f(\kappa) = (1 - \lambda\kappa)(1 - \mu\kappa).
$$

The factor is close to 1 for small $\kappa$ (the shape keeps its size) and small for large $\kappa$ (noise is removed): a low-pass filter. The **pass-band frequency** where $f$ crosses 1 again is $k_{PB} = 1/\lambda + 1/\mu$; Taubin suggests $k_{PB} \approx 0.1$. With $\lambda = 0.33$ and $\mu = -0.34$, $k_{PB} = 3.03 - 2.94 = 0.09$. A numeric example: at $\kappa = 1$ (a mid frequency), $f = 0.67 \times 1.34 = 0.90$, and at $\kappa = 2$ (the jaggiest mode), $f = 0.34 \times 1.68 = 0.57$, while explicit smoothing with $\lambda = 0.5$ gives $0.5$ and $0$. For $\kappa$ below $k_{PB}$, $f$ is slightly *above* 1, so Taubin smoothing gently amplifies the lowest frequencies: it is meant for tens to hundreds of iterations, not thousands.

### Implicit fairing

Desbrun et al. (1999) use **implicit** (backward) Euler, as in [post 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}):

$$
(\mathbf{I} - h\,\mathbf{L})\,\mathbf{x}' = \mathbf{x}, \qquad f(\kappa) = \frac{1}{1 + h\kappa}.
$$

It is unconditionally stable, so one large step $h$ replaces many small explicit ones, at the cost of a sparse linear solve. They also showed that the cotan Laplacian is the right operator here, because it moves vertices only along the normal, and they rescale to preserve volume.

```python
import numpy as np

rng = np.random.default_rng(3)
n = 200
th = np.linspace(0, 2 * np.pi, n, endpoint=False)
r = 1 + 0.25 * np.cos(5 * th) + 0.04 * rng.standard_normal(n)
X0 = np.c_[r * np.cos(th), r * np.sin(th)]                  # a noisy closed curve
I = np.eye(n)
L = -I + 0.5 * (np.roll(I, 1, 1) + np.roll(I, -1, 1))       # uniform Laplacian of a polygon

def area(X):
    x, y = X[:, 0], X[:, 1]
    return 0.5 * abs(x @ np.roll(y, -1) - y @ np.roll(x, -1))

X, Y = X0.copy(), X0.copy()
for _ in range(1000):
    X = X + 0.5 * (L @ X)                                   # Laplacian smoothing
    Y = Y + 0.33 * (L @ Y); Y = Y - 0.34 * (L @ Y)          # Taubin lambda|mu
Z = np.linalg.solve(I - 25.0 * L, X0)                       # one implicit step
for name, S in [("laplacian", X), ("taubin", Y), ("implicit", Z)]:
    print(f"{name:9s} area ratio = {area(S) / area(X0):.3f}")
# laplacian area ratio = 0.593
# taubin    area ratio = 1.029
# implicit  area ratio = 0.949
```

The curve case is a 1D mesh, so you can see the filters act on a shape. The same code works on a triangle mesh by replacing `L` with the mesh Laplacian.

The figure below applies the three filters to the same noisy curve; grey is the initial curve, and cyan, purple and red correspond to more and more iterations (more steps in the implicit panel).

{% include blog_figure.liquid path="assets/img/blog/graphics/08-smoothing.svg" caption="Smoothing the noisy five-lobed curve of the script. Explicit Laplacian smoothing ($\lambda=0.5$) removes the noise within 10 iterations, then erases the lobes and keeps shrinking the whole curve. Taubin smoothing removes the noise but keeps the lobes and the size. Implicit fairing with $h=25$ smooths heavily in a single step. Right: enclosed area relative to the start; the Laplacian curve keeps falling (0.59 after 1,000 iterations), while the Taubin curve stays near 1 and ends 3% above it, the slight low-frequency gain predicted by its transfer function." %}

## 5. Subdivision surfaces

Subdivision goes the other way: from a coarse **control mesh** to a smooth surface, by repeatedly splitting faces and moving vertices with fixed local averaging rules. In the limit the mesh converges to a smooth **limit surface**. Artists model a light cage; the renderer subdivides it.

The 1D case explains everything, and the widget below lets you play with it. **Chaikin's** corner cutting replaces each edge $\mathbf{p}\_i\mathbf{p}\_{i+1}$ with the two points $\frac34\mathbf{p}\_i + \frac14\mathbf{p}\_{i+1}$ and $\frac14\mathbf{p}\_i + \frac34\mathbf{p}\_{i+1}$; its limit is the uniform quadratic B-spline. The **cubic B-spline** scheme inserts edge midpoints and moves old points to $\frac18(\mathbf{p}\_{i-1} + 6\mathbf{p}\_i + \mathbf{p}\_{i+1})$. Both are **approximating**: the curve does not pass through the control points. The **4-point** scheme of Dyn, Levin and Gregory keeps the old points and inserts $\frac{9}{16}(\mathbf{p}\_i + \mathbf{p}\_{i+1}) - \frac1{16}(\mathbf{p}\_{i-1} + \mathbf{p}\_{i+2})$; it is **interpolating** and its limit is $C^1$.

{% include widget.liquid name="graphics-subdivision" height="460" caption="Drag the control points (black) of the closed polygon with the mouse or a finger, pick a scheme and move the level slider. Chaikin and cubic B-spline cut the corners and approach a smooth curve that does not pass through the control points; the 4-point scheme passes through them and can overshoot. The readout shows the number of points at the current level." %}

### Loop subdivision (triangles)

Loop (1987) generalizes the quartic box spline to triangle meshes. Each step splits every triangle into four by inserting one **odd** vertex per edge, and updates the old **even** vertices:

- odd vertex on an interior edge $ab$ with opposite vertices $c, d$: $\;\frac38(\mathbf{a}+\mathbf{b}) + \frac18(\mathbf{c}+\mathbf{d})$;
- even vertex of valence $k$ with neighbors $\mathbf{p}_j$: $\;(1 - k\beta)\,\mathbf{v} + \beta\sum_j \mathbf{p}_j$, with
  $\beta = \frac1k\Big(\frac58 - \big(\frac38 + \frac14\cos\frac{2\pi}{k}\big)^2\Big)$.

For the regular valence $k = 6$, $\cos(\pi/3) = \frac12$, so $\beta = \frac16(\frac58 - \frac14) = \frac1{16}$: the vertex keeps $\frac{10}{16}$ of itself and takes $\frac1{16}$ from each neighbor. Away from **extraordinary** vertices ($k \ne 6$) the limit surface is $C^2$; at extraordinary vertices it is $C^1$. Boundaries and creases use the 1D cubic B-spline rules along the boundary curve.

```python
from collections import defaultdict
import numpy as np

def loop_subdivide(V, F):
    """One step of Loop subdivision for a closed triangle mesh."""
    n = len(V)
    opp = defaultdict(list)                     # edge (a, b), a < b -> opposite vertices
    nbr = [set() for _ in range(n)]
    for f in F:
        for k in range(3):
            a, b, c = f[k], f[(k + 1) % 3], f[(k + 2) % 3]
            opp[(min(a, b), max(a, b))].append(c)
            nbr[a].add(b); nbr[b].add(a)
    newV = np.zeros((n + len(opp), 3))
    for i in range(n):                          # even vertices
        k = len(nbr[i])
        beta = (5 / 8 - (3 / 8 + np.cos(2 * np.pi / k) / 4) ** 2) / k
        newV[i] = (1 - k * beta) * V[i] + beta * V[list(nbr[i])].sum(0)
    eid = {}
    for m, ((a, b), cs) in enumerate(opp.items()):   # odd vertices
        eid[(a, b)] = n + m
        newV[n + m] = 3 / 8 * (V[a] + V[b]) + 1 / 8 * (V[cs[0]] + V[cs[1]])
    e = lambda a, b: eid[(min(a, b), max(a, b))]
    newF = []
    for a, b, c in F:
        ab, bc, ca = e(a, b), e(b, c), e(c, a)
        newF += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    return newV, np.array(newF)

V = np.array([(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1.6), (0, 0, -1)], float)
F = np.array([(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)])
for level in range(3):
    V, F = loop_subdivide(V, F)
    print(level + 1, len(V), "vertices", len(F), "faces")   # 18/32, 66/128, 258/512
```

As the figure below shows, every subdivision step multiplies the face count by 4 while the surface shrinks inside the control mesh.

{% include blog_figure.liquid path="assets/img/blog/graphics/08-loop-subdivision.svg" caption="Loop subdivision of an octahedron whose top vertex is pulled up, computed with `loop_subdivide`. Each level multiplies the face count by 4. The surface shrinks inside the control cage (dashed: the level-0 octahedron), because Loop is approximating, and quickly becomes smooth; the six original vertices have valence 4 and stay extraordinary at every level." %}

### Catmull–Clark (quads)

Catmull and Clark (1978) generalize bicubic B-splines to meshes of arbitrary topology, and are the standard for quad-dominant modeling. One step creates:

- a **face point** for every face: the average of its vertices;
- an **edge point** for every edge: the average of its two endpoints and the two adjacent face points;
- a new position for each old vertex of valence $k$: $\;\frac{\mathbf{Q} + 2\mathbf{R} + (k-3)\mathbf{S}}{k}$, where $\mathbf{Q}$ is the average of the adjacent face points, $\mathbf{R}$ the average of the adjacent edge midpoints and $\mathbf{S}$ the old position.

After one step every face is a quad. The limit is $C^2$ except at extraordinary vertices (valence $\ne 4$), where it is $C^1$. Pixar's OpenSubdiv evaluates Catmull–Clark (and Loop) surfaces on the GPU, and DeRose, Kass and Truong added semi-sharp creases for film characters. Stam (1998) showed that the limit surface can be evaluated exactly at any parameter value, with no subdivision at all, using the eigenstructure of the subdivision matrix. CAD tends to prefer NURBS, which represent conics exactly, but subdivision surfaces dominate character modeling.

## 6. Simplification with quadric error metrics

The inverse problem is reducing a mesh with a million triangles to ten thousand for level of detail (LOD), streaming or collision. Garland and Heckbert (1997) made **edge collapse** with **quadric error metrics** (QEM) the standard: repeatedly collapse the edge $(\mathbf{u}, \mathbf{w})$ whose merged vertex $\bar{\mathbf{v}}$ adds the least error.

The error is measured against the planes of the original faces around each vertex. A plane is $\mathbf{n}^\top\mathbf{x} + d = 0$ with $\lVert\mathbf{n}\rVert = 1$; in homogeneous coordinates $\mathbf{p} = (\mathbf{n}, d)$ and $\tilde{\mathbf{x}} = (\mathbf{x}, 1)$, the squared distance from $\mathbf{x}$ to the plane is

$$
(\mathbf{p}^\top\tilde{\mathbf{x}})^2 = \tilde{\mathbf{x}}^\top(\mathbf{p}\mathbf{p}^\top)\tilde{\mathbf{x}} = \tilde{\mathbf{x}}^\top\mathbf{K}_p\,\tilde{\mathbf{x}}.
$$

The trick is that a *sum* of squared distances to many planes is still a single quadratic form: $\mathbf{Q}\_v = \sum_{p \ni v}\mathbf{K}\_p$, a symmetric $4\times4$ matrix (10 numbers). When $\mathbf{u}$ and $\mathbf{w}$ merge, the new quadric is simply $\mathbf{Q}\_u + \mathbf{Q}\_w$, and the best position minimizes $\tilde{\mathbf{x}}^\top(\mathbf{Q}\_u+\mathbf{Q}\_w)\tilde{\mathbf{x}}$. Setting the gradient with respect to $\mathbf{x}$ to zero gives a $3\times3$ linear system. Written as Garland and Heckbert do: replace the last row of $\mathbf{Q}$ by $(0,0,0,1)$ and solve

$$
\begin{pmatrix} q_{11} & q_{12} & q_{13} & q_{14}\\ q_{12} & q_{22} & q_{23} & q_{24}\\ q_{13} & q_{23} & q_{33} & q_{34}\\ 0&0&0&1 \end{pmatrix}\tilde{\mathbf{x}} = \begin{pmatrix}0\\0\\0\\1\end{pmatrix}.
$$

If the matrix is singular (all planes nearly parallel, as on a flat region), choose the best of the endpoints and the midpoint.

**Worked example.** A vertex at a cube corner touches the planes $x=0$, $y=0$, $z=0$. Then $\mathbf{p}_1 = (1,0,0,0)$ etc., so $\mathbf{Q} = \mathrm{diag}(1,1,1,0)$ and the error of a point is $x^2+y^2+z^2$: the corner itself has zero error and any move costs its squared distance. A vertex on a flat region sees only one plane, $\mathbf{Q} = \mathbf{p}\mathbf{p}^\top$ has rank 1, and moving within the plane is free. That is exactly why QEM removes vertices from flat areas first and keeps corners and creases.

The algorithm:

1. Compute $\mathbf{Q}_v$ for every vertex.
2. For every edge compute the optimal $\bar{\mathbf{v}}$ and its cost; put all edges in a min-heap.
3. Pop the cheapest edge, check that the collapse is valid (below), move $\mathbf{u}$ to $\bar{\mathbf{v}}$, delete $\mathbf{w}$ and the two triangles on the edge, set $\mathbf{Q}_u \leftarrow \mathbf{Q}_u+\mathbf{Q}_w$, and push new costs for the edges around $\mathbf{u}$.
4. Repeat until the target face count is reached.

Two validity checks keep the mesh clean. The **link condition**: $\mathbf{u}$ and $\mathbf{w}$ must share exactly two neighbors (the apexes of the two triangles on the edge); otherwise the collapse would create a non-manifold edge. And a **flip check**: no surviving triangle may have its normal turned over by the move.

```python
import heapq
import numpy as np

def qem_simplify(V, F, target):
    V = V.copy(); F = [list(f) for f in F]; n = len(V)
    vf = [set() for _ in range(n)]                    # vertex -> incident faces
    for fi, f in enumerate(F):
        for v in f: vf[v].add(fi)
    Q = np.zeros((n, 4, 4))
    for f in F:
        a, b, c = V[f]
        nrm = np.cross(b - a, c - a); nrm /= np.linalg.norm(nrm)
        p = np.append(nrm, -nrm @ a)
        for v in f: Q[v] += np.outer(p, p)
    alive, ver = np.ones(n, bool), np.zeros(n, int)
    neighbors = lambda v: {w for fi in vf[v] for w in F[fi]} - {v}

    def best(u, w):
        Qs = Q[u] + Q[w]
        A = Qs.copy(); A[3] = [0, 0, 0, 1]
        if np.linalg.cond(A) < 1e8:
            x = np.linalg.solve(A, [0, 0, 0, 1.0])
        else:
            cands = [np.append(V[u], 1), np.append(V[w], 1), np.append((V[u] + V[w]) / 2, 1)]
            x = min(cands, key=lambda c: c @ Qs @ c)
        return float(x @ Qs @ x), x[:3]

    heap = []
    def push(u, w):
        cost, x = best(u, w)
        heapq.heappush(heap, (cost, u, w, ver[u], ver[w], tuple(x)))
    for u in range(n):
        for w in neighbors(u):
            if u < w: push(u, w)
    faces = len(F)
    while faces > target and heap:
        cost, u, w, vu, vw, x = heapq.heappop(heap)
        if not (alive[u] and alive[w]) or ver[u] != vu or ver[w] != vw:
            continue                                  # stale heap entry
        if len(neighbors(u) & neighbors(w)) != 2:
            continue                                  # link condition
        x, shared = np.array(x), vf[u] & vf[w]
        flip = False
        for fi in (vf[u] | vf[w]) - shared:           # normal flip check
            old = V[F[fi]]
            new = np.array([x if v in (u, w) else V[v] for v in F[fi]])
            n0 = np.cross(old[1] - old[0], old[2] - old[0])
            n1 = np.cross(new[1] - new[0], new[2] - new[0])
            if n0 @ n1 <= 0.1 * np.linalg.norm(n0) * np.linalg.norm(n1):
                flip = True; break
        if flip:
            continue
        V[u], Q[u] = x, Q[u] + Q[w]                   # collapse w into u
        for fi in shared:
            for v in F[fi]: vf[v].discard(fi)
            faces -= 1
        for fi in vf[w]:
            F[fi] = [u if v == w else v for v in F[fi]]; vf[u].add(fi)
        vf[w], alive[w] = set(), False
        ver[u] += 1                                   # invalidates old entries of u
        for nb in neighbors(u): push(u, nb)
    keep = sorted({fi for v in range(n) if alive[v] for fi in vf[v]})
    return V, np.array([F[fi] for fi in keep])
```

The per-vertex version counter `ver` is a standard lazy-deletion trick: instead of updating entries inside the heap, we push fresh ones and ignore any popped entry whose vertices changed since it was pushed. Production implementations (meshoptimizer, PyMeshLab's quadric decimation, CGAL's `Surface_mesh_simplification`) add attribute-aware quadrics for UVs and normals, boundary-preserving planes, and protection of thin parts.

The figure below shows where the vertices end up when the same mesh is simplified to fewer and fewer faces.

{% include blog_figure.liquid path="assets/img/blog/graphics/08-qem.svg" caption="QEM edge collapse with `qem_simplify` on a bumpy, elongated sphere (an icosphere with 1,280 faces), down to 400, 150 and 60 faces. Strongly curved regions keep more vertices, because collapsing there moves the surface away from many different planes; flatter regions are simplified first and end up with large triangles." %}

## 7. Parameterization

**Parameterization** maps a surface patch to the plane, $\mathbf{x}_i \mapsto \mathbf{u}_i \in \mathbb{R}^2$, so that a 2D texture can be painted on a 3D surface (the UVs of [post 3]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})), or so that remeshing and fitting can work in 2D. Only developable surfaces (zero Gaussian curvature) flatten without distortion, so every method chooses what to preserve: angles (**conformal**), areas (**equiareal**), or as much rigidity as possible.

### Tutte embedding

Tutte (1963) proved a remarkable theorem for graphs, which Floater brought to meshes: take a disk-topology mesh, pin its boundary vertices to a convex polygon in order, and place every interior vertex at a convex combination of its neighbors,

$$
\mathbf{u}_i = \sum_{j \in N(i)} \lambda_{ij}\,\mathbf{u}_j, \qquad \lambda_{ij} > 0, \quad \sum_j\lambda_{ij} = 1 .
$$

Then the result is a valid embedding: no triangle is flipped and none overlap. Computationally it is one sparse linear solve, $\mathbf{L}\_{II}\mathbf{U}\_I = -\mathbf{L}\_{IB}\mathbf{U}\_B$ (interior rows of the Laplacian, boundary positions moved to the right side). With uniform weights it is the "barycentric" or Tutte embedding; with cotan weights it is a discrete **harmonic map**, which preserves the mesh shape better but can flip triangles where weights become negative. Floater's **mean-value coordinates** give weights that are always positive and still shape-aware.

```python
import numpy as np

def tutte(V, F, loop, L):
    """Pin the boundary `loop` to the unit circle (by arc length), solve for interior UVs.
    L: a Laplacian with positive off-diagonal weights (uniform or cotan) and rows summing to 0."""
    n = len(V)
    seg = np.linalg.norm(V[loop] - V[np.roll(loop, -1)], axis=1)
    t = 2 * np.pi * np.r_[0, np.cumsum(seg)[:-1]] / seg.sum()
    UV = np.zeros((n, 2))
    UV[loop] = np.c_[np.cos(t), np.sin(t)]
    inner = np.setdiff1d(np.arange(n), loop)
    UV[inner] = np.linalg.solve(L[np.ix_(inner, inner)], -L[np.ix_(inner, loop)] @ UV[loop])
    return UV
```

With uniform weights, `L` is $\mathbf{A}-\mathbf{D}$ ($\mathbf{A}$ the adjacency matrix, $\mathbf{D}$ the diagonal matrix of valences); with cotan weights it is the `cotan_laplacian` of the previous section. The figure below compares the two on a patch with a bump.

{% include blog_figure.liquid path="assets/img/blog/graphics/08-tutte.svg" caption="A $16\times16$ grid patch with a bump (left; orange: its boundary) flattened with the boundary pinned to the unit circle by arc length. Middle: Tutte embedding with uniform weights; right: harmonic map with cotan weights. Each triangle is colored by $\log_2$ of its area ratio (2D over 3D, both normalized): blue triangles shrank, red ones grew. The bump, which has much more 3D area than its footprint, is compressed in both maps; compare where the two weightings put the remaining distortion. Each title reports the largest absolute $\log_2$ area ratio of its map." %}

### LSCM and ARAP

Fixing the boundary to a circle is what causes much of the distortion. **Least squares conformal maps** (LSCM, Lévy et al. 2002) let the boundary go free. A map is conformal when, in each triangle, the gradients of $u$ and $v$ are orthogonal and of equal length, $\nabla v = \mathbf{n}\times\nabla u$ (the Cauchy–Riemann equations). LSCM minimizes the squared violation summed over triangles, a quadratic energy, so the solution is again a sparse linear system; pinning two vertices removes the similarity-transform null space. **ARAP parameterization** (Liu et al. 2008) instead asks that each triangle's 2D image be a rotated copy of the 3D triangle. It alternates a *local* step (for each triangle, find the best rotation by a $2\times 2$ SVD, as in Sorkine and Alexa's ARAP surface modeling) and a *global* step (one sparse solve with a fixed cotan Laplacian matrix). It preserves both angles and areas as well as possible. In practice, texture atlases first cut the surface into charts (seams), then flatten each chart with LSCM or ARAP and pack the charts into a texture. Blender's "Unwrap" offers both "Angle Based" and "Conformal" (LSCM).

## 8. Implicit surfaces

An implicit surface is the zero set $S = \\{\mathbf{x} : f(\mathbf{x}) = 0\\}$ of a function, with $f < 0$ inside. A **signed distance function** (SDF) is the special case $\lvert f(\mathbf{x})\rvert = $ distance to $S$, so $\lVert\nabla f\rVert = 1$ almost everywhere. SDFs make some operations trivial:

| Operation | Formula |
| --- | --- |
| sphere / circle | $f(\mathbf{x}) = \lVert\mathbf{x} - \mathbf{c}\rVert - r$ |
| union, intersection | $\min(f_1, f_2)$, $\;\max(f_1, f_2)$ |
| subtraction | $\max(f_1, -f_2)$ |
| smooth union | $\mathrm{smin}_k(f_1, f_2) = f_2(1-h) + f_1 h - k\,h(1-h)$, $\;h = \mathrm{clamp}\big(\tfrac12 + \tfrac{f_2-f_1}{2k}, 0, 1\big)$ |
| offset / rounding | $f - r$ |
| normal | $\mathbf{n} = \nabla f / \lVert\nabla f\rVert$ |

(After a min, max or smooth min the result is only a bound on the distance, not an exact SDF, but it remains safe for the sphere tracing below.) Neural fields such as DeepSDF, NeuS and Neuralangelo represent $f$ with a network, and everything in this section applies to them unchanged.

### Marching squares and marching cubes

To get a mesh, sample $f$ on a grid and find where it changes sign. In 2D, **marching squares** looks at each cell independently. Its four corners are inside or outside, giving $2^4 = 16$ cases. On each edge whose endpoints differ in sign, the crossing point is placed by linear interpolation:

$$
\mathbf{x} = \mathbf{x}_a + t(\mathbf{x}_b - \mathbf{x}_a), \qquad t = \frac{f_a}{f_a - f_b}.
$$

For example, $f_a = -0.2$ and $f_b = 0.3$ give $t = 0.2/0.5 = 0.4$. A cell with two crossings gets one segment. The two **saddle** cases (diagonal corners inside) have four crossings and two possible pairings; sampling $f$ at the cell center picks one consistently.

```python
import numpy as np

def marching_squares(f, xs, ys):
    G = f(np.stack(np.meshgrid(xs, ys, indexing="ij"), -1))
    segs = []
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            cx = [xs[i], xs[i + 1], xs[i + 1], xs[i]]        # corners counter-clockwise
            cy = [ys[j], ys[j], ys[j + 1], ys[j + 1]]
            v = [G[i, j], G[i + 1, j], G[i + 1, j + 1], G[i, j + 1]]
            pts = {}
            for e in range(4):                                # edge e joins corners e, e+1
                a, b = e, (e + 1) % 4
                if (v[a] < 0) != (v[b] < 0):
                    t = v[a] / (v[a] - v[b])
                    pts[e] = (cx[a] + t * (cx[b] - cx[a]), cy[a] + t * (cy[b] - cy[a]))
            if len(pts) == 2:
                segs.append(list(pts.values()))
            elif len(pts) == 4:                               # saddle: ask the cell centre
                c = f(np.array([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2]))
                if (c < 0) == (v[0] < 0):                     # corners 0 and 2 connected
                    segs += [[pts[0], pts[1]], [pts[2], pts[3]]]
                else:
                    segs += [[pts[3], pts[0]], [pts[1], pts[2]]]
    return segs

circle = lambda p: np.hypot(p[..., 0], p[..., 1]) - 0.6
segs = marching_squares(circle, np.linspace(-1, 1, 12), np.linspace(-1, 1, 12))
print(len(segs), "segments")                                  # 24
```

The figure below runs this code on a 2D SDF and compares two cell counts.

{% include blog_figure.liquid path="assets/img/blog/graphics/08-marching-squares.svg" caption="Left: a 2D SDF (smooth union of a circle and a box) with its level sets; the thick line is $f=0$. Middle: marching squares on $11\times11$ cells; filled blue dots are inside ($f<0$), open red dots outside, purple segments are the output and the dashed gray curve the true zero set. Right: on $35\times35$ cells the output is visually exact. Linear interpolation, not the grid, sets the accuracy along the curve; the grid sets which details can be resolved at all." %}

You can run the same algorithm live. In the widget the SDF is a smooth union of three circles.

{% include widget.liquid name="graphics-marching-squares" height="440" caption="Marching squares on a live SDF. Drag the three circle centres with the mouse or a finger and change the number of cells. Blue dots are inside ($f<0$), open red dots outside, purple segments are the output and the dashed curve is a fine-grid reference. Untick linear interpolation to put every crossing at the edge midpoint and see the staircase it causes. With very few cells, small necks between the blobs disappear or break apart: the grid sets which features can be resolved at all." %}

**Marching cubes** (Lorensen and Cline 1987) is the same idea in 3D: 8 corners give $2^8 = 256$ cases, reduced by symmetry to 15 classes, each stored as a table of triangles. The original table has ambiguous faces that can leave holes; later versions (asymptotic decider, Marching Cubes 33) fix them. A simpler cousin, **marching tetrahedra**, splits each cube into 6 tetrahedra; a tetrahedron has only 3 cases up to symmetry (one corner inside: a triangle; two inside: a quad; none inside: nothing; three or four inside are the complements of these), so there are no ambiguities, at the cost of more triangles. The figure uses it because the whole algorithm fits in 25 lines of the figure script.

{% include blog_figure.liquid path="assets/img/blog/graphics/08-marching-tets.svg" caption="A 3D isosurface extracted with marching tetrahedra from an SDF, a torus smoothly united with a sphere, sampled on $26^3$ grid points. Every triangle comes from one tetrahedron in one cell that the surface crosses; shading uses the triangle normals." %}

Marching cubes places vertices on grid edges, so it rounds off sharp features. **Dual contouring** (Ju et al. 2002) instead puts one vertex *inside* each cell that the surface crosses, at the point minimizing a QEF (quadratic error function; the same quadric idea as QEM) built from the crossing points and their normals (Hermite data), and connects vertices of neighboring cells. It reproduces sharp corners and edges and supports adaptive octrees. Neural Dual Contouring (Chen et al. 2022) learns where to place these vertices.

### Sphere tracing

You can also render an SDF directly, without a mesh, by ray marching, extending the ray casting of [post 5]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }}). The SDF value at a point is the radius of a ball that contains no surface, so a ray $\mathbf{o} + t\mathbf{d}$ can safely advance by that amount (Hart 1996):

$$
t_{k+1} = t_k + f(\mathbf{o} + t_k\mathbf{d}),
$$

stopping when $f < \varepsilon$ (hit) or $t > t_{\max}$ (miss). Far from surfaces the steps are large; near grazing angles they become tiny, which is the method's weakness. Shadertoy-style demos and many neural-field renderers are built on this loop.

The figure below traces three rays through the same SDF; watch how the step length follows the distance to the surface.

{% include blog_figure.liquid path="assets/img/blog/graphics/08-sphere-tracing.svg" caption="Sphere tracing three rays from the black square through the SDF of the marching-squares figure. Each circle has radius $f$ at the current point and touches the surface without crossing it, so the next point lies on its rim. The purple ray hits head-on in a few steps; the orange ray approaches the top of the box at a shallow angle, so its steps shrink as it runs along the surface; the green ray misses and leaves the domain. The legend counts the steps." %}

## 9. Reconstruction from points

A scanner, a depth camera or a structure-from-motion pipeline ([neural-rendering post 1]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})) produces points, not meshes. Reconstruction recovers a watertight surface.

**Normal estimation.** For each point take its $k$ nearest neighbors and fit a plane: the normal is the eigenvector of the neighbors' $3\times3$ covariance matrix with the smallest eigenvalue (PCA, Hoppe et al. 1992). PCA only gives a line, not a direction, so normals must then be **oriented** consistently, classically by propagating along a minimum spanning tree of the neighborhood graph, flipping each normal to agree with its neighbor.

**Poisson reconstruction** (Kazhdan, Bolitho and Hoppe 2006). Let $\chi$ be the indicator function of the solid: 1 inside, 0 outside (this $\chi$ is unrelated to the Euler characteristic above). Its gradient is zero everywhere except on the surface, where it points inward. So the oriented normals, smoothed into a vector field $\vec V$ (pointing outward), are a sample of $-\nabla\chi$. Find $\chi$ whose gradient best matches:

$$
\min_\chi \int \lVert\nabla\chi + \vec V\rVert^2 \quad\Longrightarrow\quad \Delta\chi = -\nabla\cdot\vec V .
$$

This is a Poisson equation: one global, sparse, well-conditioned linear system. It is solved on an adaptive octree in 3D. The surface is the level set $\chi = \bar\chi$, with $\bar\chi$ the average of $\chi$ at the input points, extracted with marching cubes. Because the solution is global, holes in the data are filled smoothly and noise averages out. **Screened Poisson** (Kazhdan and Hoppe 2013) adds a term $\alpha\sum_i\chi(\mathbf{p}_i)^2$ that pulls the zero level set toward the points ($\chi$ is shifted so that the surface is at 0). That keeps more detail and avoids oversmoothing. It is the version in MeshLab, Open3D and CloudCompare.

In 2D the whole method fits on a page. A periodic grid lets the FFT solve the Poisson equation exactly:

```python
import numpy as np

rng = np.random.default_rng(7)
curve = lambda th: 0.55 + 0.13 * np.cos(3 * th) + 0.05 * np.sin(5 * th)
th = np.sort(rng.uniform(0, 2 * np.pi, 140))
P = np.c_[curve(th) * np.cos(th), curve(th) * np.sin(th)] + 0.008 * rng.standard_normal((140, 2))

# 1. PCA normals from the 8 nearest neighbours, oriented away from the centroid
D2 = ((P[:, None] - P[None]) ** 2).sum(-1)
N = np.array([np.linalg.eigh(np.cov(P[np.argsort(d)[:8]].T))[1][:, 0] for d in D2])
N *= np.sign(((P - P.mean(0)) * N).sum(1))[:, None]

# 2. splat the normals into a smooth vector field V on an M x M grid
M = 128
xs = np.linspace(-1, 1, M, endpoint=False); h = xs[1] - xs[0]
GX, GY = np.meshgrid(xs, xs, indexing="ij")
Vx, Vy = np.zeros((M, M)), np.zeros((M, M))
for p, n in zip(P, N):
    g = np.exp(-((GX - p[0]) ** 2 + (GY - p[1]) ** 2) / (2 * (2 * h) ** 2))
    Vx += n[0] * g; Vy += n[1] * g

# 3. solve lap(chi) = -div(V) with the FFT (5-point Laplacian eigenvalues)
div = (np.roll(Vx, -1, 0) - np.roll(Vx, 1, 0) + np.roll(Vy, -1, 1) - np.roll(Vy, 1, 1)) / (2 * h)
k = np.fft.fftfreq(M) * 2 * np.pi
lam = (2 * np.cos(k)[:, None] + 2 * np.cos(k)[None, :] - 4) / h ** 2
lam[0, 0] = 1.0
chi_hat = np.fft.fft2(-div) / lam; chi_hat[0, 0] = 0.0
chi = np.real(np.fft.ifft2(chi_hat))

# 4. iso-value = mean of chi at the samples; extract with marching squares
idx = np.clip(np.round((P + 1) / h).astype(int), 0, M - 1)
iso = chi[idx[:, 0], idx[:, 1]].mean()
print("iso-value", round(float(iso), 4))                     # 0.0485
```

The centroid trick for orientation only works for star-shaped shapes like this one; it stands in for the spanning-tree propagation described above.

The figure below shows what this code produces.

{% include blog_figure.liquid path="assets/img/blog/graphics/08-poisson-2d.svg" caption="Poisson reconstruction in 2D with the script. Left: 140 noisy samples and their PCA normals. Middle: the solution $\chi$ of $\Delta\chi=-\nabla\cdot\vec V$, low outside and high inside, with the level set through the samples (white). Right: that level set (purple) against the true curve (dashed): a closed, smooth curve, even where the random samples are sparse." %}

### Neural implicit surfaces

Multi-view reconstruction now often goes through a neural field. **NeuS** (Wang et al. 2021) represents the surface as the zero level set of an SDF network and converts the SDF into a volume density with a logistic function, chosen so that [NeRF-style volume rendering]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) is unbiased at the surface. It adds an **eikonal** loss $(\lVert\nabla f\rVert - 1)^2$ to keep $f$ a distance function. **Neuralangelo** (Li et al. 2023) uses multi-resolution hash grids ([fast radiance fields]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})) with numerical gradients and coarse-to-fine training for large scenes. On the Gaussian side, [2D Gaussian Splatting and Gaussian Opacity Fields]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}) make splats surface-like and then extract meshes, with TSDF fusion plus marching cubes, or with marching tetrahedra on the Gaussian centers. Every one of these pipelines ends with Section 8's extraction and, usually, Section 6's simplification.

A newer direction skips the field: autoregressive transformers generate meshes token by token, as an artist would. MeshGPT (CVPR 2024) learns a vocabulary of triangle tokens. MeshAnything (ICLR 2025), EdgeRunner (ICLR 2025) and Meshtron (a December 2024 preprint) scale this to artist-like meshes with thousands of faces, conditioned on point clouds or images. They exist because marching-cubes meshes are dense and irregular, while artists and game engines need compact, well-structured topology.

## 10. Tools

You rarely write all of this yourself. The standard libraries:

| Library | Language | Good for |
| --- | --- | --- |
| [libigl](https://libigl.github.io/) | C++ header-only, Python bindings | Laplacians, curvature, parameterization (LSCM, ARAP), booleans; matrix-style API close to this post |
| [CGAL](https://www.cgal.org/) | C++ | robust exact predicates, Delaunay, simplification, remeshing, Poisson, booleans |
| [OpenMesh](https://www.graphics.rwth-aachen.de/software/openmesh/) | C++, Python | half-edge data structure, decimation, subdivision |
| [geometry-central](https://geometry-central.net/) + [Polyscope](https://polyscope.run/) | C++, Python | intrinsic triangulations, DDG operators; quick 3D viewer |
| [PyMeshLab](https://pymeshlab.readthedocs.io/) | Python | all MeshLab filters: screened Poisson, quadric decimation, cleaning |
| [trimesh](https://trimesh.org/) | Python | loading, repair, ray queries, booleans, convenience |
| [Open3D](https://www.open3d.org/) | C++, Python | point clouds, normal estimation, Poisson, TSDF fusion |
| Blender (`bpy`, `bmesh`) | Python | modeling operators, subdivision, decimation and UV unwrap from scripts |

For example, Open3D does Section 9 in three calls (normal estimation, normal orientation, Poisson reconstruction); the first two lines only prepare a sample point cloud:

```python
import open3d as o3d  # pip install open3d

mesh = o3d.io.read_triangle_mesh(o3d.data.BunnyMesh().path)          # downloads a sample
pcd = mesh.sample_points_poisson_disk(5000)
pcd.estimate_normals(o3d.geometry.KDTreeSearchParamKNN(knn=20))     # PCA normals
pcd.orient_normals_consistent_tangent_plane(15)                     # spanning-tree orientation
rec, density = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pcd, depth=8)
print(rec)
```

## Try it

- The subdivision widget above shows the 1D versions of Loop and Catmull–Clark. Compare how the 4-point scheme overshoots at sharp control corners while the B-spline schemes stay inside the control polygon.
- The [home page lab]({{ '/' | relative_url }}#lab) renders meshes and Gaussians; the Gaussian World tab is the representation whose surfaces Section 9 extracts.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Tutte, *How to draw a graph* | Proc. London Math. Soc. | 1963 | [DOI](https://doi.org/10.1112/plms/s3-13.1.743) | Convex-combination embeddings never flip; basis of Tutte parameterization |
| Catmull & Clark, *Recursively generated B-spline surfaces on arbitrary topological meshes* | Computer-Aided Design | 1978 | [DOI](https://doi.org/10.1016/0010-4485(78)90110-0) | Quad subdivision, the standard for film modeling |
| Loop, *Smooth Subdivision Surfaces Based on Triangles* | MS thesis, Univ. of Utah | 1987 | [MSR page](https://www.microsoft.com/en-us/research/publication/smooth-subdivision-surfaces-based-on-triangles/) | Triangle subdivision with $C^2$ limit in regular regions |
| Lorensen & Cline, *Marching cubes: A high resolution 3D surface construction algorithm* | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37422) | Isosurface extraction from grids |
| Hoppe et al., *Surface reconstruction from unorganized points* | SIGGRAPH | 1992 | [DOI](https://doi.org/10.1145/133994.134011) | PCA normals, MST orientation, signed distance from points |
| Pinkall & Polthier, *Computing discrete minimal surfaces and their conjugates* | Experimental Mathematics | 1993 | [DOI](https://doi.org/10.1080/10586458.1993.10504266) | The cotangent formula |
| Taubin, *A signal processing approach to fair surface design* | SIGGRAPH | 1995 | [DOI](https://doi.org/10.1145/218380.218473) | Mesh smoothing as filtering; $\lambda\vert\mu$ without shrinkage |
| Hart, *Sphere tracing* | The Visual Computer | 1996 | [DOI](https://doi.org/10.1007/s003710050084) | Safe ray marching of distance functions |
| Garland & Heckbert, *Surface simplification using quadric error metrics* | SIGGRAPH | 1997 | [DOI](https://doi.org/10.1145/258734.258849) | QEM edge collapse, still the default decimator |
| Desbrun, Meyer, Schröder & Barr, *Implicit fairing of irregular meshes using diffusion and curvature flow* | SIGGRAPH | 1999 | [DOI](https://doi.org/10.1145/311535.311576) | Implicit integration and the cotan Laplacian for smoothing |
| Lévy, Petitjean, Ray & Maillot, *Least squares conformal maps* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566590) | Free-boundary conformal parameterization, one linear solve |
| Ju, Losasso, Schaefer & Warren, *Dual contouring of Hermite data* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566586) | Sharp features from implicit data via QEF vertices |
| Meyer, Desbrun, Schröder & Barr, *Discrete differential-geometry operators for triangulated 2-manifolds* | VisMath (Springer) | 2003 | [DOI](https://doi.org/10.1007/978-3-662-05105-4_2) | Mixed Voronoi areas, curvature operators |
| Kazhdan, Bolitho & Hoppe, *Poisson surface reconstruction* | SGP | 2006 | [DOI](https://doi.org/10.2312/SGP/SGP06/061-070) | Reconstruction as a Poisson problem |
| Sorkine & Alexa, *As-rigid-as-possible surface modeling* | SGP | 2007 | [DOI](https://doi.org/10.2312/SGP/SGP07/109-116) | Local/global rotation fitting |
| Liu, Zhang, Xu, Gotsman & Gortler, *A local/global approach to mesh parameterization* | Computer Graphics Forum | 2008 | [DOI](https://doi.org/10.1111/j.1467-8659.2008.01290.x) | ARAP parameterization |
| Kazhdan & Hoppe, *Screened Poisson surface reconstruction* | ACM TOG | 2013 | [DOI](https://doi.org/10.1145/2487228.2487237) | Point constraints; the version used in practice |
| Wang et al., *NeuS* | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.10689) | SDF + unbiased volume rendering for multi-view surfaces |
| Chen, Tagliasacchi, Funkhouser & Zhang, *Neural Dual Contouring* | ACM TOG (SIGGRAPH) | 2022 | [arXiv](https://arxiv.org/abs/2202.01999) | Learned dual contouring |
| Li et al., *Neuralangelo* | CVPR | 2023 | [arXiv](https://arxiv.org/abs/2306.03092) | Hash-grid neural surfaces at scene scale |
| Siddiqui et al., *MeshGPT* | CVPR | 2024 | [DOI](https://doi.org/10.1109/CVPR52733.2024.01855) | Meshes as token sequences |
| Huang et al., *2D Gaussian Splatting for Geometrically Accurate Radiance Fields* | SIGGRAPH | 2024 | [DOI](https://doi.org/10.1145/3641519.3657428) | Surfel Gaussians for accurate meshes |
| Yu, Sattler & Geiger, *Gaussian Opacity Fields* | ACM TOG (SIGGRAPH Asia) | 2024 | [DOI](https://doi.org/10.1145/3687937) | Mesh extraction from Gaussians with marching tetrahedra |
| Chen et al., *MeshAnything* | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2406.10163) | Artist-like mesh generation conditioned on shapes |
| Tang et al., *EdgeRunner* | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2409.18114) | Compact mesh tokenization with an autoregressive auto-encoder |
| Hao et al., *Meshtron* | arXiv preprint (Dec 2024) | 2024 | [arXiv](https://arxiv.org/abs/2412.09548) | Scales mesh generation to tens of thousands of faces |

## Learning resources

- Botsch, Kobbelt, Pauly, Alliez and Lévy, *Polygon Mesh Processing* (A K Peters/CRC, 2010, [DOI](https://doi.org/10.1201/b10688)): the textbook for Sections 2-7.
- Keenan Crane, [*Discrete Differential Geometry: An Applied Introduction*](https://www.cs.cmu.edu/~kmcrane/Projects/DDG/) (CMU 15-458/858 notes and lecture videos): the clearest derivation of the cotan Laplacian and discrete curvature.
- **GAMES102** (Ligang Liu, in Chinese): geometric modeling and processing, splines, subdivision and parameterization.
- The [libigl tutorial](https://libigl.github.io/tutorial/): every concept of this post with a short C++/Python example.
- Hoppe's and Kazhdan's project pages for Poisson reconstruction code; [meshoptimizer](https://github.com/zeux/meshoptimizer) for production simplification.

## Exercises

1. Prove the discrete Gauss–Bonnet theorem for a mesh with boundary, using the boundary defect $\pi - \sum\theta$. Check it numerically on the `grid_patch` of the figure script (`bin/figures/graphics/graphics_08.py`).
2. Replace the barycentric areas in `mean_curvature` with mixed Voronoi areas (Meyer et al.: the Voronoi area for non-obtuse triangles, half or a quarter of the triangle area otherwise) and compare the error against the exact torus curvature.
3. Implement Catmull–Clark subdivision for a closed quad mesh and apply it to a cube. After a few levels, how far is the surface from a sphere?
4. Add a boundary-preserving term to `qem_simplify`: for each boundary edge, add the quadric of a plane through the edge perpendicular to its face, with a large weight. Simplify the grid patch and compare the boundary.
5. Run the 2D Poisson code with half of the samples removed from one side. What does the reconstruction do in the gap, and why does a global solve behave this way?

<details markdown="1"><summary>Hint for exercise 3</summary>

Store the cube as 6 quads. The face points are the face centers. The edge points are averages of 4 points. The vertex rule uses $k = 3$ for all cube corners, so $(\mathbf{Q} + 2\mathbf{R})/3$. The limit surface is not a sphere: compare the distance from the center to an original corner and to a face center.

</details>

<details markdown="1"><summary>Hint for exercise 5</summary>

The Poisson equation only gets a source where there are samples; in the gap, $\chi$ is harmonic, so the level set closes the hole with the smoothest possible curve that joins the two sides.

</details>

Next: [animation and characters]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}), where meshes get skeletons, skin weights and motion.
