---
layout: post
title: "Physics and simulation engines: from game physics to robot simulators"
date: 2026-10-27 13:05:00+0900
description: "Inside a physics engine step: broad phase, GJK and EPA, contact manifolds, PGS/TGS/soft-step/XPBD solvers, articulated bodies, then how Isaac, MuJoCo, Newton and Genesis turn engines into robot simulators, with OpenUSD and domain randomization."
categories: graphics-engine
tags: [physics-engine, gjk, epa, collision-detection, constraint-solver, articulations, isaac-sim, mujoco, newton, openusd, domain-randomization]
series: graphics-engine
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## Why this matters

The [anatomy post]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}) showed physics as one box in the engine's frame, ticked by a fixed timestep. This post opens that box. Inside it is a pipeline that finds which objects might touch, computes exactly where they touch, and solves for contact and joint forces in a few hundred microseconds. The same pipeline, made more accurate, differentiable and massively parallel, is the core of the simulators in which robots and embodied agents now learn. That is why a graphics-engine series ends with robot simulators, and why the next post can hand over to world models.

The mathematics of integrators, PBD/XPBD and cloth is in [graphics post 07]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}), and the robotics view of simulators and benchmarks is in [embodied-ai post 03]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}). Here we take the engine-internals view: data structures, algorithms and design trade-offs.

## Prerequisites

- Vectors, dot and cross products; convex sets (a set that contains the segment between any two of its points).
- Newton's laws and impulses (an impulse $\lambda$, the integral of force over time, changes the velocity of a body of mass $m$ by $\Delta v = \lambda/m$).
- Symplectic Euler and XPBD from [graphics 07]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}); the fixed-timestep loop from [engine post 01]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}).
- Python with NumPy.

## 1. The physics step

A rigid body stores its mass $m$, inertia tensor $\mathbf{I}$, position $\mathbf{x}$, orientation $\mathbf{q}$, linear velocity $\mathbf{v}$ and angular velocity $\boldsymbol{\omega}$, plus one or more collision **shapes** (sphere, box, capsule, convex hull, triangle mesh, height field). Every call of `step(dt)` runs the same stages, shown in the figure:

1. **Integrate forces**: $\mathbf{v} \mathrel{+}= h\,\mathbf{M}^{-1}\mathbf{f}_{\text{ext}}$ (gravity, user forces; $h$ is this step's time step and $\mathbf{M}$ the mass matrix built from $m$ and $\mathbf{I}$).
2. **Broad phase**: find pairs whose bounding boxes overlap. Cheap, conservative.
3. **Narrow phase**: for each pair, exact geometry: are they touching, where, how deep?
4. **Contact manifolds**: a few contact points with a shared normal and penetration depth, matched with last frame's contacts.
5. **Warm start and solve**: compute contact and joint impulses so that bodies do not interpenetrate, friction holds and joints stay attached.
6. **Integrate positions**: $\mathbf{x} \mathrel{+}= h\,\mathbf{v}$, $\mathbf{q} \leftarrow \text{normalize}\big(\mathbf{q} + \tfrac{h}{2}(0,\boldsymbol{\omega})\otimes\mathbf{q}\big)$.
7. **Islands, sleeping, continuous collision, events**.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-step-pipeline.svg" caption="One physics step. The top row turns shapes into contacts (AABBs, then candidate pairs, then contact manifolds); the bottom row turns contacts into motion. Modern engines (Box2D v3, PhysX TGS, XPBD solvers) repeat the solve and integrate stages inside a substep loop (dashed purple box) with $h = dt/n$." %}

The step always uses a **fixed** $dt$, typically $1/60$ s, driven by the accumulator loop of [post 01]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}). A variable time step changes the solver's behaviour from frame to frame and breaks determinism.

## 2. Broad phase: which pairs might touch?

With $n$ bodies there are $n(n-1)/2$ pairs. At $n = 10{,}000$ that is about 50 million exact tests per step, which is far too many. The broad phase keeps an **axis-aligned bounding box** (AABB) for each body and reports only pairs whose AABBs overlap. Two AABBs overlap if and only if their intervals overlap on every axis:

$$
\text{overlap}(a,b) \iff \bigwedge_{k \in \{x,y,z\}} \big(\text{lo}_{a,k} \le \text{hi}_{b,k}\ \wedge\ \text{lo}_{b,k} \le \text{hi}_{a,k}\big).
$$

### Sweep and prune

**Sweep and prune** (SAP, also called sort and sweep) sorts the interval endpoints along one axis and sweeps from left to right while keeping an "active" list of intervals that have started but not ended. Every interval that starts while another is active forms a candidate pair:

```python
import numpy as np

def sweep_and_prune(lo, hi):
    """Pairs whose x-intervals overlap. lo, hi: (n, 2) box corners."""
    order = np.argsort(lo[:, 0])
    active, pairs = [], []
    for i in order:
        active = [j for j in active if hi[j, 0] >= lo[i, 0]]   # drop intervals that ended
        pairs += [(j, i) for j in active]
        active.append(i)
    return pairs

rng = np.random.default_rng(0)
n, L = 400, 100.0
c = rng.uniform(0, L, (n, 2)); r = rng.uniform(0.4, 1.2, (n, 2))
lo, hi = c - r, c + r
cand = sweep_and_prune(lo, hi)
true = [(a, b) for a, b in cand if lo[a, 1] <= hi[b, 1] and lo[b, 1] <= hi[a, 1]]
print(n * (n - 1) // 2, len(cand), len(true))   # all pairs, x-candidates, true AABB overlaps
# -> 79800 2468 93
```

Why does this help? If the boxes are spread uniformly over a world of width $L$ and have mean half-width $\bar r$, two intervals overlap on $x$ with probability about $4\bar r / L$. So the expected number of candidates is about $\tfrac{n^2}{2}\cdot\tfrac{4\bar r}{L}$. If the world grows with the number of objects at constant density ($L \propto \sqrt{n}$ in 2D), candidates grow like $n^{1.5}$ instead of $n^2$, and true overlaps grow like $n$.

Two engine tricks make SAP fast in practice. Between frames objects move a little, so the sorted list is almost sorted and **insertion sort** fixes it in close to $O(n)$. And instead of re-sweeping, engines track overlap begin and end events whenever two endpoints swap. The figure below tests the estimate above on random boxes: on the left, see which boxes truly overlap; on the right, compare how fast the three kinds of pair counts grow.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-sweep-and-prune.svg" caption="Sweep and prune on random boxes (a real run of the script). Left: 40 boxes; the gray bars below the scene are their x-intervals in sweep order, and red boxes are in at least one true AABB overlap. Right: pair counts against $n$ at constant density, on log-log axes. All pairs grow as $n^2$. SAP's x-candidates follow the dotted estimate $\frac{n^2}{2}\frac{4\bar r}{L}\propto n^{1.5}$, and true overlaps grow roughly linearly. The gap between the blue and red curves is wasted narrow-phase work, which a second axis or a tree removes." %}

### Dynamic AABB trees

SAP degrades when many objects line up on the sweep axis, for example a long row of crates. Most modern engines (Box2D, Bullet, Jolt; PhysX offers SAP and others) therefore use a **dynamic AABB tree**: a bounding volume hierarchy (BVH, see [graphics 05]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})) whose leaves are **fat** AABBs, enlarged by a margin and by the predicted motion. A body is reinserted only when it leaves its fat box. Insertion chooses the sibling that minimizes the increase in surface area (the surface area heuristic), and tree rotations keep the tree balanced. A pair query is a simultaneous descent of the tree. Open worlds add **spatial hashing** or uniform grids for particles and many equal-sized objects.

## 3. Narrow phase: exact contact

For each candidate pair the narrow phase answers three questions: do the shapes intersect, what is the **penetration depth** $d$, and what is the **contact normal** $\mathbf{n}$? Specialized routines handle sphere-sphere, capsule-capsule and box-box. General convex shapes use the separating axis theorem or GJK.

### Separating axis theorem (SAT)

Two convex polytopes are disjoint if and only if there is an axis on which their projections do not overlap. For 2D polygons it is enough to test the edge normals of both polygons. For 3D polyhedra you test the face normals of both, plus the cross products of every pair of edges. The axis with the smallest overlap gives $\mathbf{n}$ and $d$ directly. SAT is the standard choice for boxes and small hulls, but the number of edge-edge axes grows quickly with shape complexity.

### GJK: distance through the Minkowski difference

The **Minkowski difference** of shapes $A$ and $B$ is

$$
A \ominus B = \{\, \mathbf{a} - \mathbf{b} \;:\; \mathbf{a}\in A,\ \mathbf{b}\in B \,\}.
$$

It is convex when $A$ and $B$ are convex, and $A$ and $B$ intersect **if and only if the origin lies in $A \ominus B$** (some $\mathbf{a} = \mathbf{b}$). More generally, the distance between $A$ and $B$ equals the distance from the origin to $A \ominus B$. So collision detection becomes the question "does this convex set contain the origin?"

We never build $A \ominus B$ explicitly. The **Gilbert–Johnson–Keerthi** (GJK) algorithm only needs a **support function**: the farthest point of a shape in a direction $\mathbf{d}$,

$$
s_A(\mathbf{d}) = \arg\max_{\mathbf{a}\in A} \mathbf{a}\cdot\mathbf{d}, \qquad s_{A\ominus B}(\mathbf{d}) = s_A(\mathbf{d}) - s_B(-\mathbf{d}).
$$

The second equality holds because $(\mathbf{a}-\mathbf{b})\cdot\mathbf{d} = \mathbf{a}\cdot\mathbf{d} + \mathbf{b}\cdot(-\mathbf{d})$, so the two terms can be maximized separately. For a polygon the support point is the vertex with the largest dot product. For a sphere it is $\mathbf{c} + r\,\mathbf{d}/\lVert\mathbf{d}\rVert$. For a capsule it is the support of a segment plus that of a sphere. That is why GJK handles any convex shape with the same code.

GJK grows a **simplex** (a point, a segment, a triangle, and in 3D a tetrahedron) of support points:

1. Start with any direction $\mathbf{d}$ and the simplex $S = \\{ s(\mathbf{d}) \\}$; set $\mathbf{d} = -S_0$ (towards the origin).
2. Get a new point $\mathbf{p} = s_{A\ominus B}(\mathbf{d})$. If $\mathbf{p}\cdot\mathbf{d} \le 0$, the farthest point of $A\ominus B$ in direction $\mathbf{d}$ does not even reach the origin, so the origin is outside: **no collision**.
3. Add $\mathbf{p}$ to $S$. Keep only the sub-simplex (vertex, edge or the full simplex) whose region contains the origin, and set $\mathbf{d}$ to point from that feature towards the origin.
4. If the simplex encloses the origin: **collision**. Otherwise go to 2.

In 2D, "perpendicular to edge $\mathbf{ab}$, towards the origin" is computed with the vector triple product $(\mathbf{ab}\times\mathbf{ao})\times\mathbf{ab}$ $= \mathbf{ao}\,(\mathbf{ab}\cdot\mathbf{ab}) - \mathbf{ab}\,(\mathbf{ab}\cdot\mathbf{ao})$. For a triangle $\mathbf{abc}$ ($\mathbf{a}$ the newest point), the same computation is applied to the two edges $\mathbf{ab}$ and $\mathbf{ac}$ (`ab_perp` and `ac_perp` in the code point away from the third vertex): if the origin lies outside an edge, drop the opposite vertex and continue along that normal; if it lies inside both, the origin is inside the triangle and the shapes collide. Edge $\mathbf{bc}$ was already ruled out in the previous iteration. The whole algorithm fits on one screen:

```python
import numpy as np

def support(P, d):
    return P[np.argmax(P @ d)]

def support_md(A, B, d):                 # support point of A - B
    return support(A, d) - support(B, -d)

def cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]

def triple(a, b, c):                     # (a x b) x c = b (a.c) - a (b.c)
    return b * np.dot(a, c) - a * np.dot(b, c)

def do_simplex(s):
    """Keep the feature closest to the origin. Returns (contains_origin, simplex, new_direction)."""
    if len(s) == 2:
        b, a = s                         # a is the newest point
        ab, ao = b - a, -a
        if np.dot(ab, ao) > 0:
            d = triple(ab, ao, ab)       # normal of ab towards the origin
            if np.dot(d, d) < 1e-20:     # origin lies on the segment
                return True, [b, a], None
            return False, [b, a], d
        return False, [a], ao
    c, b, a = s
    ab, ac, ao = b - a, c - a, -a
    if abs(cross2(ab, ac)) < 1e-12:      # degenerate triangle
        return do_simplex([b, a])
    ab_perp = triple(ac, ab, ab)         # normal of ab, away from c
    ac_perp = triple(ab, ac, ac)         # normal of ac, away from b
    if np.dot(ab_perp, ao) > 0:
        return False, [b, a], ab_perp
    if np.dot(ac_perp, ao) > 0:
        return False, [c, a], ac_perp
    return True, s, None                 # origin inside the triangle

def gjk(A, B, max_iter=32):
    d = A.mean(0) - B.mean(0)
    if np.dot(d, d) < 1e-20:
        d = np.array([1.0, 0.0])
    simplex = [support_md(A, B, d)]
    d = -simplex[0]
    for _ in range(max_iter):
        if np.dot(d, d) < 1e-20:
            return True, simplex
        p = support_md(A, B, d)
        if np.dot(p, d) <= 0:            # p did not pass the origin: separated
            return False, simplex
        hit, simplex, d = do_simplex(simplex + [p])
        if hit:
            return True, simplex
    return False, simplex

A = np.array([[0.0, 0.0], [3.0, 0.5], [3.5, 2.5], [1.0, 3.0]])
B = np.array([[2.5, 1.5], [5.0, 1.0], [4.0, 3.5]])
print(gjk(A, B)[0], gjk(A, B + [3.0, 0.0])[0])   # True (overlap), False (B moved right)
```

The second test moves $B$ three units to the right. Its leftmost vertex is then at $x = 5.5$, beyond $A$'s rightmost point at $3.5$, so the two answers follow from the geometry. The figure shows the simplex evolving for the overlapping pair.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-gjk-simplex.svg" caption="GJK on the two polygons of the code, computed by the script. Left: $A$ (blue) and $B$ (orange) in world space. Then $A\ominus B$ (purple) with the origin (black dot), one panel per iteration: red is the current simplex, green the next search direction $\mathbf{d}$. Each new support point is the vertex of $A\ominus B$ farthest along $\mathbf{d}$; the loop stops when the triangle encloses the origin. GJK never builds the purple polygon itself; it only visits the few vertices it needs." %}

Production GJK, as in Bullet, Jolt, PhysX and Box2D's distance routine, also returns the **closest points** when the shapes are separated. It runs on shapes inflated by a small **margin** (a rounded radius), so that resting contact is a cheap "separated by less than the margin" query instead of a deep-penetration problem.

### EPA: how deep, and in which direction?

When GJK reports a collision we still need $\mathbf{n}$ and $d$. The penetration depth is the distance from the origin to the **boundary** of $A\ominus B$, and the minimum translation that separates the shapes is $d\,\mathbf{n}$, where $d\,\mathbf{n}$ is the closest boundary point. The **Expanding Polytope Algorithm** (EPA, van den Bergen 2001) starts from GJK's final simplex, which contains the origin, and repeatedly does three things:

1. find the polytope edge (in 3D, face) closest to the origin, with outward normal $\mathbf{n}$ and distance $d$;
2. query $\mathbf{p} = s_{A\ominus B}(\mathbf{n})$;
3. if $\mathbf{p}\cdot\mathbf{n} - d < \varepsilon$, that edge lies on the boundary of $A\ominus B$ and we are done; otherwise insert $\mathbf{p}$, which splits the edge, and repeat.

```python
def epa(A, B, simplex, tol=1e-9, max_iter=64):
    """Penetration normal n and depth: moving B by depth * n makes A and B touch."""
    poly = [np.asarray(p, float) for p in simplex]
    while len(poly) < 3:                 # origin on an edge: add a support point
        e = poly[-1] - poly[0] if len(poly) == 2 else np.array([1.0, 0.0])
        poly.append(support_md(A, B, np.array([-e[1], e[0]])))
    if cross2(poly[1] - poly[0], poly[2] - poly[0]) < 0:
        poly[1], poly[2] = poly[2], poly[1]          # counter-clockwise
    for _ in range(max_iter):
        best = None
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            e = b - a
            n = np.array([e[1], -e[0]]) / np.linalg.norm(e)   # outward normal (CCW)
            if best is None or np.dot(n, a) < best[0]:
                best = (np.dot(n, a), n, i)
        dist, n, i = best
        p = support_md(A, B, n)
        if np.dot(p, n) - dist < tol:
            return n, dist
        poly.insert(i + 1, p)
    return n, dist

hit, s = gjk(A, B)
n, depth = epa(A, B, s)
print(n, depth)   # -> [ 0.9701425  -0.24253563] 0.7276068751089989
```

Check the sign convention on a simple case. If $A$ is on the left and $B$ overlaps it from the right, $A\ominus B$ lies mostly at negative $x$ and pokes past the origin a little on the $+x$ side. EPA returns $\mathbf{n} = (+1, 0)$, and pushing $B$ by $d\,\mathbf{n}$ moves it to the right, out of $A$. In general, $A\ominus(B + d\,\mathbf{n}) = (A\ominus B) - d\,\mathbf{n}$, which moves the boundary point $d\,\mathbf{n}$ exactly onto the origin, so after the push the shapes just touch. The figure below runs EPA on the same pair.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-epa.svg" caption="EPA on the same pair (script output). First panel: the starting polytope is GJK's final triangle (red). Middle: the final polytope, whose closest edge lies on the boundary of $A\ominus B$; the green arrow from the origin is the penetration vector $d\,\mathbf{n}$. Right: moving $B$ (dashed, original position) by $d\,\mathbf{n}$ leaves the shapes exactly touching." %}

Try it yourself: drag the shapes and step through GJK.

{% include widget.liquid name="graphics-engine-gjk" height="420" caption="Drag $A$ or $B$ in the world view (mouse or finger). The second view shows $A\ominus B$ (purple), with the origin O. Use the step buttons to replay GJK: red is the simplex, green the search direction $\mathbf{d}$. When the shapes overlap, the final step also shows EPA's polytope (dashed red), the penetration vector and, in the world view, $B$ pushed out by $d\,\mathbf{n}$ (dashed). 'New B' switches the shape of $B$. Watch how the origin crosses the boundary of $A\ominus B$ at the moment the shapes start to touch." %}

GJK and EPA are fast and general, but EPA is numerically delicate in 3D: you have to keep the polytope convex, and nearly coplanar faces cause trouble. Engines therefore often prefer SAT for boxes and convex hulls, and clip faces to get several contact points.

## 4. Contact manifolds and warm starting

A box resting on the ground touches along a face, not at one point. A single contact point would let it rock. The narrow phase therefore builds a **contact manifold**: up to 4 points in 3D (2 in 2D) sharing one normal $\mathbf{n}$, each with its own depth $d_i$. For two boxes, the standard approach takes the **reference face** most aligned with $\mathbf{n}$ and clips the **incident face** of the other box against the side planes of the reference face (Sutherland–Hodgman clipping). Points above the reference face are discarded. Curved shapes, which have only one contact point per frame, use **persistent manifolds**: the engine keeps points from previous frames while they remain valid.

Each contact point gets a **feature ID** (for example "vertex 2 of box A against face 0 of box B"). If the same feature pair exists in the next frame, the solver starts from last frame's impulse: this is **warm starting**. For a resting stack the impulses barely change from frame to frame, so starting from the previous answer makes a few iterations as good as many cold ones.

## 5. Constraint solvers

### Contacts as velocity constraints

For a contact point with normal $\mathbf{n}$, the gap $C \ge 0$ must stay non-negative. Its rate of change is linear in the stacked velocities $\mathbf{u} = (\mathbf{v}_A, \boldsymbol{\omega}_A, \mathbf{v}_B, \boldsymbol{\omega}_B)$:

$$
\dot C = \mathbf{J}\mathbf{u}, \qquad \mathbf{J} = \big(-\mathbf{n}^\top,\ -(\mathbf{r}_A\times\mathbf{n})^\top,\ \mathbf{n}^\top,\ (\mathbf{r}_B\times\mathbf{n})^\top\big),
$$

where $\mathbf{J}$ is the Jacobian row of this contact, $\mathbf{r}_A, \mathbf{r}_B$ are the vectors from each center of mass to the contact point, and the mass matrix matching $\mathbf{u}$ is $\mathbf{M} = \operatorname{diag}(m_A\mathbf{1}, \mathbf{I}_A, m_B\mathbf{1}, \mathbf{I}_B)$. The contact can only push, so its impulse $\lambda$ satisfies the **complementarity** conditions

$$
\lambda \ge 0, \qquad \mathbf{J}\mathbf{u}^+ + b \ge 0, \qquad \lambda\,(\mathbf{J}\mathbf{u}^+ + b) = 0,
$$

where $\mathbf{u}^+$ is the velocity after the impulse and $b$ is a bias. In words: either the bodies separate and the impulse is zero, or they stay in contact and the impulse is positive. Collecting all contacts gives a **linear complementarity problem** (LCP). Friction adds two tangent rows per contact, with $\lvert\lambda_t\rvert \le \mu\lambda_n$ (a box approximation of the Coulomb cone).

### Sequential impulses = projected Gauss–Seidel (PGS)

Solving one constraint at a time is enough. Applying an impulse $\Delta\lambda$ changes the velocity by $\mathbf{M}^{-1}\mathbf{J}^\top\Delta\lambda$. Hence $\mathbf{u}^+ = \mathbf{u} + \mathbf{M}^{-1}\mathbf{J}^\top\Delta\lambda$, and requiring $\mathbf{J}\mathbf{u}^+ + b = 0$, i.e. $\mathbf{J}\mathbf{u} + b + \mathbf{J}\mathbf{M}^{-1}\mathbf{J}^\top\Delta\lambda = 0$, gives

$$
\Delta\lambda = -\frac{\mathbf{J}\mathbf{u} + b}{\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^\top} = -m_{\text{eff}}\,(\mathbf{J}\mathbf{u} + b), \qquad m_{\text{eff}} = \big(\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^\top\big)^{-1}.
$$

Then clamp the **accumulated** impulse, not the increment: $\lambda \leftarrow \max(0, \lambda + \Delta\lambda)$, and apply only the change that actually happened. Sweeping over all constraints several times is **projected Gauss–Seidel** on the LCP. Catto's GDC 2005 talk popularized it as **sequential impulses**. The bias $b = \tfrac{\beta}{h}\min(0, C)$, called **Baumgarte stabilization** with $\beta \approx 0.1$ to $0.2$, pushes penetrating bodies apart.

Take one box of mass $m = 1$ kg resting on the ground, with $h = 1/60$ s and no penetration. Gravity gives $v = -9.81/60 \approx -0.1635$ m/s. Then $\mathbf{J} = (1)$, $m_{\text{eff}} = 1$, and $\Delta\lambda = -(-0.1635) = 0.1635$ N·s, which is exactly $m g h$: the ground supplies the weight over the step. One box converges in one iteration. A stack does not.

### A box-stack experiment

Here is the solver for a 1D stack of $n$ boxes of height 1, where contact $k$ joins box $k-1$ (or the ground) to box $k$. This is the toy run behind the next two figures:

```python
import numpy as np

def stack(n=10, top_mass=10.0, iters=10, substeps=1, warm=False, frames=120, dt=1/60, beta=0.2):
    m = np.ones(n); m[-1] = top_mass; w = 1 / m          # inverse masses
    y = np.arange(n) + 0.5; v = np.zeros(n); lam = np.zeros(n)
    h = dt / substeps
    for _ in range(frames * substeps):
        v -= 9.81 * h                                     # integrate gravity
        gap = np.concatenate([[y[0] - 0.5], np.diff(y) - 1.0])
        if warm:                                          # re-apply last impulses
            v += w * lam; v[:-1] -= w[:-1] * lam[1:]
        else:
            lam[:] = 0
        for _ in range(iters):                            # projected Gauss-Seidel
            for k in range(n):
                jv = v[k] - (v[k - 1] if k else 0.0)      # relative normal velocity
                keff = w[k] + (w[k - 1] if k else 0.0)    # J M^-1 J^T
                dl = -(jv + beta / h * min(0.0, gap[k])) / keff
                new = max(0.0, lam[k] + dl)               # clamp the accumulated impulse
                dl, lam[k] = new - lam[k], new
                v[k] += w[k] * dl
                if k: v[k - 1] -= w[k - 1] * dl
        y = y + h * v                                     # integrate positions
    gap = np.concatenate([[y[0] - 0.5], np.diff(y) - 1.0])
    return max(0.0, -gap.min())                           # worst penetration (m)

for kw in [dict(iters=10), dict(iters=10, warm=True), dict(iters=1, substeps=10, warm=True)]:
    print(kw, f"{stack(**kw) * 1000:.3f} mm")
# -> {'iters': 10} 22.307 mm
#    {'iters': 10, 'warm': True} 0.000 mm
#    {'iters': 1, 'substeps': 10, 'warm': True} 0.000 mm
```

Why is a stack hard? Gauss–Seidel moves information one contact per sweep. The weight of the top box must reach the ground through every contact below it, so a stack of $n$ boxes needs on the order of $n$ sweeps, or many more when masses differ. With a heavy box on light ones, the effective-mass ratios make each sweep transmit only a small part of the needed correction. Whatever is left over shows up as sinking, which Baumgarte then pushes back. The figure measures it.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-stack-solvers.svg" caption="Toy 10-box stack, all solvers at the same cost of 10 constraint sweeps per 1/60 s frame (script output). Left: worst penetration over 2 s with the top box 10 times heavier. Right: penetration at rest, averaged over the last 0.5 s, for mass ratios 1:1, 1:10 and 1:100 (log scale). Compare plain PGS (red) with warm starting (orange), with substepping (blue, one sweep per substep, like TGS and Box2D's soft step) and with XPBD (purple): warm starting and substepping are the two tools engines use against slow propagation. In this run plain PGS leaves 10, 22 and 142 mm of penetration; warm starting and substepping both settle to zero (bars marked 0); XPBD, which corrects positions directly but sees only one sweep per substep, leaves 0.25 to 2.6 mm." %}

### TGS, soft step and XPBD: small steps again

Modern solvers spend the same budget differently. Instead of one step with $N$ iterations, they take $N$ **substeps** of size $h = dt/N$ with one (or a few) iterations each, and re-evaluate the gap $C$ with the latest positions at every substep. PhysX calls this **Temporal Gauss–Seidel** (TGS). Its documentation describes TGS as better at high mass ratios and slightly more expensive per iteration than PGS. Box2D v3's solver, called **soft step**, does the same with **soft constraints**. XPBD with small steps ([graphics 07]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})) is the position-level version of the same idea. Erin Catto's *Solver2D* blog post (2024) compares eight such solvers (PGS, TGS variants, soft step, XPBD and others) on the same test scenes, and is the best practical reading on this topic.

A **soft constraint** replaces the rigid constraint by an implicit spring-damper with natural frequency $\omega = 2\pi f$ and damping ratio $\zeta$, so its behaviour does not depend on the step size or the iteration count. Write the spring force for an effective mass $m$ as $k = m\omega^2$, $c = 2m\zeta\omega$. Integrate it implicitly over a step $h$, so that the impulse uses the end-of-step gap $C + h\,\mathbf{J}\mathbf{u}^+$ and velocity $\mathbf{J}\mathbf{u}^+$, where $\mathbf{J}\mathbf{u}^+ = \mathbf{J}\mathbf{u} + \lambda/m$:

$$
\lambda = -h\Big(k\,(C + h\,\mathbf{J}\mathbf{u}^+) + c\,\mathbf{J}\mathbf{u}^+\Big).
$$

Solve for $\lambda$. Expand the brackets, substitute $\mathbf{J}\mathbf{u}^+ = \mathbf{J}\mathbf{u} + \lambda/m$, $k = m\omega^2$ and $c = 2m\zeta\omega$, and use $(h^2 k + h c)/m = h^2\omega^2 + 2\zeta h\omega$. With $a = h\omega\,(2\zeta + h\omega)$ this gives $\lambda\,(1 + a) = -m\,(h\omega^2 C + a\,\mathbf{J}\mathbf{u})$. Dividing by $1 + a$ and factoring $a$ out of the bracket (since $h\omega^2/a = \omega/(2\zeta + h\omega)$) yields

$$
\lambda = -m\,\underbrace{\frac{a}{1+a}}_{\text{mass scale}}\Big(\mathbf{J}\mathbf{u} + \underbrace{\frac{\omega}{2\zeta + h\omega}}_{\text{bias rate}}\, C\Big), \qquad a = h\omega\,(2\zeta + h\omega).
$$

Compare this with PGS: the bias rate replaces the ad hoc $\beta/h$, and the mass scale (less than 1) softens the response. Box2D v3 computes these coefficients from a stiffness in hertz and a damping ratio, so contacts are slightly soft but well behaved at any step. Push the frequency to a fraction of the substep rate and the constraint is effectively rigid.

The next figure isolates the effect of substepping, without warm starting, at an equal number of sweeps per frame.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-substeps-vs-iterations.svg" caption="Same budget, different split (script output, no warm starting, top box 10 times heavier). Left: penetration at rest against the number of constraint sweeps per frame $N$, spent either as one step with $N$ iterations (red) or as $N$ substeps with one iteration each (blue). Right: the two stacks after 2 s for $N=8$; the dotted line marks the exact rest height of the top box." %}

{% include widget.liquid name="graphics-engine-stack" height="600" caption="Try it yourself. The widget runs the same toy stack as the two figures above, live, at 60 frames per second. Pick a solver, change the number of boxes, the mass ratio of the top box and the number of constraint sweeps per frame $N$, and watch the penetration plot on the right (log scale). Drag down on the stack (mouse or finger) to push the top box. Start with the defaults (plain PGS, 10 boxes, 1:10, $N=10$): the worst contact overlaps by about 22 mm; switch to warm starting or substepping and it settles to zero. Then set $N=1$ and compare PGS with XPBD, or raise the mass ratio to 1:100. One simplification of the toy shows up here: a contact stays active even after a small gap opens, so a warm-started stack can come to rest a few centimetres *above* its rest height. Real engines avoid this with speculative contacts, which only push once the gap would close within the step." %}

### The rest of the step

- **Islands and sleeping.** Bodies connected by contacts or joints form an **island** (found with union-find over the constraint graph). When every body in an island has stayed below a velocity threshold for a while (about 0.5 s), the island goes to sleep and costs nothing until something touches it. Islands are also natural units for multithreading.
- **Continuous collision detection (CCD).** A bullet moving 1 m per step passes through a 10 cm wall: this is **tunneling**. Engines use **speculative contacts**, which add the contact before it happens if the gap is less than the distance travelled this step. They also sweep the shape along its motion and find the **time of impact** (TOI) by conservative advancement, then substep fast bodies. Box2D v3 uses speculative contacts plus TOI for "bullet" bodies.
- **Determinism.** Lockstep multiplayer and replays need bit-identical results. That requires a fixed $dt$, a fixed constraint order (sort pairs by body ID, not by pointer or thread finish order), deterministic parallel reductions and care with fused multiply-add and transcendental functions across compilers. Box2D v3 and Jolt advertise cross-platform determinism under documented conditions.

### Engines you will meet

As of November 2026 (versions from the projects' release pages):

| Engine | Language | License | Notes |
| --- | --- | --- | --- |
| **NVIDIA PhysX 5** (5.9.1, Oct 2026) | C++ | BSD-3-Clause | PGS and TGS solvers, GPU rigid bodies, reduced-coordinate articulations, particles/PBD; the physics of Omniverse and Isaac Sim |
| **Havok Physics** | C++ | commercial (owned by Microsoft since 2015) | long-standing AAA middleware; also offered as a plugin for Unreal |
| **Jolt Physics** (5.6.0, Jul 2026) | C++17 | MIT | multithreaded, deterministic; used in *Horizon Forbidden West* and *Death Stranding 2*; built into Godot since 4.4 as an option |
| **Chaos** | C++ | part of Unreal Engine (Epic EULA) | default physics of Unreal Engine 5: rigid bodies, destruction, cloth, vehicles, networked physics |
| **Box2D v3** (3.2.0, Oct 2026) | C17 | MIT | 2D; soft step solver, SIMD, multithreading, cross-platform determinism |
| **Rapier** (0.36, Oct 2026) | Rust | Apache-2.0 | 2D and 3D; runs natively and in the browser via WebAssembly |

[Post 04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}) shows how Unreal, Unity and Godot expose these engines to gameplay code.

## 6. Joints and articulated bodies

A **joint** is a constraint between two bodies. A hinge removes 5 of the 6 relative degrees of freedom; a ball joint removes 3; a prismatic joint removes 5 but allows sliding. Game engines treat joints exactly like contacts: extra rows in $\mathbf{J}$, solved by the same PGS/TGS loop. This is **maximal coordinates**: every body keeps its 6 DOF, and constraints try to hold them together.

Robots are long chains: a 7-DOF arm, a humanoid with 30+ joints, a hand with 20. They often have large mass ratios, such as a heavy base and a light finger, or a light link carrying a heavy payload. In maximal coordinates every joint error is something the iterative solver must remove, and residual error shows up as **joint drift**: links visibly separate, or chains stretch under load.

**Reduced** (generalized) **coordinates** remove the problem by construction. The state is the vector of joint angles $\mathbf{q}$ (plus the base pose), so the joints cannot come apart. The equations of motion become

$$
\mathbf{M}(\mathbf{q})\,\ddot{\mathbf{q}} + \mathbf{c}(\mathbf{q},\dot{\mathbf{q}}) = \boldsymbol{\tau} + \mathbf{J}_c^\top\boldsymbol{\lambda}_c,
$$

with the configuration-dependent mass matrix $\mathbf{M}(\mathbf{q}) = \sum_i m_i\,\mathbf{J}_i^\top\mathbf{J}_i$ (with $\mathbf{J}_i$ the position Jacobian of link $i$'s center of mass, plus rotational terms), Coriolis and gravity terms $\mathbf{c}$, joint torques $\boldsymbol{\tau}$ and contact impulses $\boldsymbol{\lambda}_c$. **Featherstone's** articulated-body algorithm (ABA) computes $\ddot{\mathbf{q}}$ in $O(n)$ for a tree of $n$ links, without forming $\mathbf{M}$. The composite-rigid-body algorithm (CRBA) builds $\mathbf{M}$ in $O(n^2)$, and recursive Newton–Euler (RNEA) does inverse dynamics. Controllers also need these quantities: the mass matrix, the gravity torque and the Jacobians are what a robot controller works with.

The figure runs both formulations on a 4-link pendulum with light links and a heavy end mass.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-articulated-chain.svg" caption="A 4-link chain (link masses 1, 1, 1 and 50 kg at the end), released straight at 69° from vertical. Purple circles: reduced coordinates (joint angles, RK4, so link lengths are exact). Orange squares: maximal coordinates (point masses and distance constraints, XPBD with zero compliance, one step and one iteration per frame) at the same times. Right: the worst relative link-length error of the maximal chain for 1, 4 and 32 iterations per step. The reduced chain has zero error by construction, and the maximal chain needs many iterations to approach it: over 3 s its worst error is 31% with 1 iteration, 7.8% with 4 and 0.87% with 32." %}

That is why robot simulators differ from game engines. MuJoCo and Drake work in generalized coordinates; PhysX has a separate **reduced-coordinate articulation** type, which Isaac Sim uses for robots; and Unity exposes it as `ArticulationBody`. Game characters, meanwhile, rarely need exact joints: a ragdoll that stretches by 1 % is invisible. Robot learning needs the opposite trade-off: exact joints, accurate actuators and contacts, and the ability to compute $\mathbf{M}(\mathbf{q})$ and its derivatives. [Embodied-ai 01]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }}) covers the robot kinematics behind this.

## 7. The animation runtime

Physics is not the only thing that moves characters. The **animation system** of an engine usually runs before physics in the frame:

- **State machines** pick the current animation clip from gameplay state (idle, walk, run, jump). They include transitions with blend times and conditions.
- **Blend trees** mix clips by parameters. A 1D blend between walk and run by speed; a 2D blend space by velocity direction. Joint rotations are blended with quaternion interpolation.
- **Inverse kinematics (IK)** corrects the pose after blending: two-bone IK for feet on uneven ground, look-at for heads, FABRIK or CCD for longer chains.
- **Motion matching** replaces hand-built graphs by a search. Every few frames it finds the frame in a large motion-capture database whose pose and future trajectory best match the current state and the player's input, and it blends to that frame. Learned variants compress the database with neural networks.
- **Physics-based animation** blends the two worlds: active ragdolls follow animation targets with PD controllers, and reinforcement-learned controllers ([embodied-ai 02]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})) drive simulated characters.

The mathematics (splines, quaternion blending, skinning, IK solvers, motion matching features) is in [graphics 09]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }}). For the engine, the important fact is the order inside a frame: animation produces a target pose, physics (ragdolls, cloth, hair) reacts, and the renderer skins the final pose.

## 8. Engines as simulators for robots and AI

A robot learning stack needs what a game engine has (scenes, assets, rendering, a step loop, tools) and three things a game engine does not prioritize:

1. **Accuracy and fidelity**: exact joints, actuator models (motors, gear ratios, PD gains, torque limits), friction and contact models that match the real robot, and sensors (cameras, depth, lidar, IMU, force/torque) with realistic noise.
2. **Throughput**: reinforcement learning needs billions of steps, so thousands of copies of a world are stepped together on a GPU, with observations and actions staying in GPU tensors.
3. **Differentiability**: gradients of the next state with respect to the current state, actions or parameters, for system identification, trajectory optimization and learning.

As of November 2026 (versions from release pages and official announcements; licenses from the repositories):

| Platform | Built on | What it adds | Status (Nov 2026) |
| --- | --- | --- | --- |
| **Isaac Sim** (NVIDIA) | Omniverse Kit, PhysX 5, RTX renderer, OpenUSD | photoreal RTX sensors (camera, lidar, radar), Replicator synthetic data, robot importers (URDF/MJCF to USD) | v6.2 (Oct 2026); the source is on GitHub (Apache-2.0 for the repository code; the Omniverse Kit SDK it depends on has its own license) |
| **Isaac Lab** (NVIDIA) | Isaac Sim; Newton backend | GPU-parallel RL and imitation learning environments, tasks, sensors, sim-to-real workflows | v3.0 (Oct 2026), BSD-3-Clause |
| **MuJoCo** (Google DeepMind) | own engine | generalized coordinates, convex soft contact, tendons, actuators; very accurate and fast on the CPU | 3.17 (Oct 2026), Apache-2.0 |
| **MJX** | MuJoCo in JAX, or on top of MuJoCo Warp | batched, `jit`-compiled MuJoCo on accelerators. The JAX backend is differentiable; the Warp backend is not | ships with MuJoCo |
| **MuJoCo Warp** | NVIDIA Warp | GPU MuJoCo that scales to contact-rich scenes; developed by Google DeepMind and NVIDIA, also inside Newton | versioned with MuJoCo (3.17) |
| **MuJoCo Playground** | MJX | locomotion and manipulation environments with sim-to-real recipes | arXiv 2502.08844 (2025) |
| **Newton** | NVIDIA Warp, OpenUSD | open, extensible GPU physics: multiple solvers (including MuJoCo Warp), differentiable components, robotics focus | contributed to the Linux Foundation by Disney Research, Google DeepMind and NVIDIA (Sep 2025); 1.0 in Mar 2026, v1.7 in Oct 2026; Apache-2.0 |
| **Genesis** | own engine (Python front end) | rigid, MPM, SPH, FEM and PBD solvers in one framework, its own renderer, GPU-parallel | v1.4 (Oct 2026), Apache-2.0; no paper, cite the repository |
| **ManiSkill3** | SAPIEN (PhysX) | GPU-parallel simulation *and* rendering for manipulation benchmarks | v3.0.1 (Apr 2026); arXiv 2410.00425 |
| **Habitat 3.0** (Meta) | Habitat-Sim (Bullet + own renderer) | fast indoor navigation and rearrangement, humanoid avatars, human-in-the-loop | ICLR 2024; habitat-sim 0.3.3 (Feb 2026) |
| **CARLA** | Unreal Engine | autonomous driving: towns, traffic, weather, sensor suites | 0.10.0 moved to Unreal Engine 5.5 (Dec 2024); 0.9.16 (Sep 2025) is the latest UE4-based release |
| **Unity ML-Agents** | Unity | turns any Unity scene into an RL environment with a Python API | Release 23 (Sep 2025) |

What each borrows from game engines: the scene graph and asset formats (USD, glTF, URDF importers), real-time renderers (RTX, Unreal, Unity), editors and tools, and the step pipeline of this post. What each adds:

- **Accuracy**: MuJoCo's convex contact model and generalized coordinates; PhysX articulations in Isaac; implicit actuator models.
- **Massive parallelism**: Isaac Gym's tensors-on-GPU design (Isaac Lab, ManiSkill3, MJX, MuJoCo Warp, Genesis, Newton). Ten thousand worlds of a quadruped run in parallel, and a locomotion policy trains in minutes. The **batch dimension** is the design change: data-oriented layouts ([post 01]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})) with one kernel per stage over all worlds, instead of objects stepping themselves.
- **Differentiability**: MJX (JAX), Warp's automatic differentiation, Genesis and parts of Newton. Contacts make gradients noisy or discontinuous, a problem that mirrors visibility discontinuities in [differentiable rendering]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }}).

[Embodied-ai 03]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}) gives a hands-on MuJoCo/MJX example and the benchmarks built on these platforms.

## 9. OpenUSD as the scene description

Robot simulators, digital twins and film pipelines all need one thing that glTF (a delivery format, see [post 03]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})) does not offer: many people and tools editing the same large scene **without overwriting each other**. **OpenUSD** (Universal Scene Description, open-sourced by Pixar in 2016) solves this with layers and composition.

- A **stage** is the composed scene. It is a tree of **prims** (paths like `/World/Robot/base_link`), each with **attributes** (typed, possibly time-sampled values) and **relationships**.
- A **layer** is one file (`.usda` text, `.usdc` binary or `.usdz` package) holding **opinions** about prims. Layers stack: a stronger layer's opinion wins. The lighting artist's layer and the layout artist's layer are separate files, sublayered into one root. A non-destructive **over** in a stronger layer changes one attribute without touching the asset.
- **Composition arcs** bring other files and alternatives into the scene: **references** (instance an asset file), **payloads** (references that can be left unloaded, for huge scenes), **variant sets** (switchable alternatives, such as a gripper type or a damaged versus intact state), **inherits** and **specializes** (class-like sharing). They resolve in the strength order **LIVRPS**: Local, Inherits, Variants, References, Payloads, Specializes. The current glossary writes LIVERPS, adding **relocates**.
- **Schemas** give prims typed meaning: `UsdGeom` (meshes, transforms), `UsdShade` (materials), `UsdLux` (lights) and **`UsdPhysics`** (rigid bodies, colliders, mass, joints, articulations, collision groups). Engines and simulators extend them, for example with PhysX-specific schemas.

```usda
#usda 1.0
(
    subLayers = [@./lighting.usda@, @./layout.usda@]
)

over "World"
{
    over "Robot" (
        prepend apiSchemas = ["PhysicsRigidBodyAPI", "PhysicsMassAPI"]
        variants = { string gripper = "parallel" }
    )
    {
        float physics:mass = 3.0
    }
}
```

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-usd-composition.svg" caption="Composition of one prim, `/Robot`. The layer stack (top) is ordered from strongest (session layer) to weakest. `layout.usda` references the asset `robot.usd`, which has its own mass, a variant set and a payload. The resolved prim (bottom right) takes `physics:mass = 3.0` from the root layer's `over`, which beats the 2.0 inside the referenced asset, and the color from the session layer. Within one prim, arcs resolve in LIVRPS order." %}

Why robotics adopted it: one USD stage can hold a factory's CAD-derived geometry, materials for RTX rendering, physics properties for simulation, sensor definitions and semantic labels for synthetic data. Every team edits its own layer. NVIDIA built Omniverse and Isaac Sim on USD, and Newton reads it too. The **Alliance for OpenUSD** (AOUSD, founded in 2023 by Pixar, Adobe, Apple, Autodesk and NVIDIA under the Linux Foundation) published **Core Specification 1.0** in December 2025, the first normative definition of the data model and composition. OpenUSD itself now uses year.month versions (v26.11 in October 2026).

## 10. Synthetic data and domain randomization

Engines are also **data factories**: a renderer that knows the ground truth for free can output RGB together with depth, normals, segmentation, 2D/3D boxes, poses and optical flow, perfectly labelled, at any scale. The catch is the **sim-to-real gap**: a network trained on rendered images may fail on photos because the renderer's statistics differ. Seen from graphics, the gap has concrete sources:

- **Materials**: hand-set albedo and roughness instead of measured BRDFs; missing wear, dust, fingerprints, subsurface scattering.
- **Lighting**: a single sun and ambient term instead of complex indirect light, area lights and real HDR environments; missing shadows from off-screen objects.
- **Camera and sensor**: no lens distortion, motion blur, rolling shutter, noise, auto-exposure, white balance, JPEG artefacts; for depth sensors, no missing pixels at edges or on shiny surfaces.
- **Geometry and content**: too clean, too few distinct objects, unrealistic placement.

There are two strategies, and practice combines them. **Photorealism** shrinks the gap: path-traced RTX rendering ([graphics 05]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})), measured materials, scanned assets, and 3D Gaussian splat captures of real scenes ([neural-rendering 06]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})). **Domain randomization** (Tobin et al. 2017; Tremblay et al. 2018) goes the other way: randomize textures, colors, lights, camera poses, distractor objects and noise so widely that the real world looks like "just another variation" to the network.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-domain-randomization.svg" caption="Domain randomization with a tiny NumPy ray caster (the script's `render`): a sphere and a box on a checkered floor with a hard shadow. Top left, framed: the canonical scene. The other 11 images randomize camera orbit, height and field of view, object sizes and positions, all albedos, checker scale, light direction, sun and ambient intensity, a color tint, exposure and Gaussian sensor noise. A detector trained on such images cannot rely on any one color, light or viewpoint." %}

The randomization itself is just sampling scene parameters before each render:

```python
import numpy as np

def random_scene(rng):
    return dict(
        camera_yaw=rng.uniform(-0.6, 0.6), camera_height=rng.uniform(1.0, 3.5), fov_deg=rng.uniform(40, 60),
        albedo_object=rng.uniform(0.05, 1.0, 3), checker_scale=rng.uniform(0.5, 4.0),
        light_dir=rng.normal(size=3) * [1, 0, 1] + [0, rng.uniform(0.3, 1.2), 0],   # keep the sun above the floor
        ambient=rng.uniform(0.05, 0.4), exposure=rng.uniform(0.7, 1.3), noise_sigma=rng.uniform(0.0, 0.06))

rng = np.random.default_rng(0)
for i in range(3):
    print({k: np.round(v, 2).tolist() for k, v in random_scene(rng).items()})
```

In Isaac Sim this is **Replicator**: randomizers attached to USD prims (materials, poses, lights, camera parameters) driven per frame, with "writers" that export images plus labels. On the physics side, the same idea randomizes masses, friction, motor gains, latencies and pushes. That is **dynamics randomization**, and it is the main sim-to-real tool for locomotion. See [embodied-ai 02]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }}) for the reinforcement-learning side, and [embodied-ai 03]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}) for the platforms. The [next post]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }}) shows how generative models (Cosmos-style "world foundation models") are now used to make rendered data look real, and even to replace the renderer.

## Try it

- The GJK widget above: find the exact moment where the origin crosses the boundary of $A\ominus B$, and compare EPA's depth with what you see.
- The **Cloth · XPBD** tab of the [home-page lab]({{ '/' | relative_url }}#lab) runs a substepped XPBD solver, the position-level relative of the TGS/soft-step solvers of Section 5.
- Run the `stack` function with `top_mass=100` and different splits of 10 sweeps, and watch the stack sink.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Gilbert, Johnson & Keerthi, *A fast procedure for computing the distance between complex objects in three-dimensional space* | IEEE J. Robotics and Automation | 1988 | [DOI](https://doi.org/10.1109/56.2083) | The GJK algorithm |
| van den Bergen, *Proximity Queries and Penetration Depth Computation on 3D Game Objects* | GDC | 2001 | — | Introduced EPA for penetration depth |
| Catto, *Iterative Dynamics* | GDC | 2005 | [PDF](https://box2d.org/files/ErinCatto_IterativeDynamics_GDC2005.pdf) | Sequential impulses, accumulated clamping, warm starting |
| Featherstone, *Rigid Body Dynamics Algorithms* | Springer (book) | 2008 | [DOI](https://doi.org/10.1007/978-1-4899-7560-7) | Spatial algebra, ABA, CRBA, RNEA |
| Todorov, Erez & Tassa, *MuJoCo: A physics engine for model-based control* | IROS | 2012 | [DOI](https://doi.org/10.1109/IROS.2012.6386109) | Generalized coordinates + convex contact for control |
| Tobin et al., *Domain Randomization for Transferring Deep Neural Networks from Simulation to the Real World* | IROS | 2017 | [arXiv](https://arxiv.org/abs/1703.06907) | Domain randomization for sim-to-real |
| Dosovitskiy et al., *CARLA: An Open Urban Driving Simulator* | CoRL | 2017 | [arXiv](https://arxiv.org/abs/1711.03938) | A driving simulator built on a game engine |
| Tremblay et al., *Training Deep Networks with Synthetic Data: Bridging the Reality Gap by Domain Randomization* | CVPR Workshops | 2018 | [arXiv](https://arxiv.org/abs/1804.06516) | Randomized synthetic data for detection |
| Juliani et al., *Unity: A General Platform for Intelligent Agents* | arXiv | 2018 | [arXiv](https://arxiv.org/abs/1809.02627) | Unity ML-Agents |
| Macklin et al., *Small Steps in Physics Simulation* | SCA | 2019 | [DOI](https://doi.org/10.1145/3309486.3340247) | Substeps beat iterations |
| Macklin et al., *Non-Smooth Newton Methods for Deformable Multi-Body Dynamics* | ACM TOG | 2019 | [arXiv](https://arxiv.org/abs/1907.04587) | Newton-type solver for contact, friction and deformables |
| Müller et al., *Detailed Rigid Body Simulation with Extended Position Based Dynamics* | Computer Graphics Forum | 2020 | [DOI](https://doi.org/10.1111/cgf.14105) | XPBD for rigid bodies and joints |
| Puig et al., *Habitat 3.0: A Co-Habitat for Humans, Avatars and Robots* | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2310.13724) | Humanoids and humans in the loop |
| Tao et al., *ManiSkill3: GPU Parallelized Robotics Simulation and Rendering for Generalizable Embodied AI* | RSS (demo track) | 2025 | [arXiv](https://arxiv.org/abs/2410.00425) | GPU-parallel simulation and rendering |
| Zakka et al., *MuJoCo Playground* | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2502.08844) | MJX environments with sim-to-real |
| Mittal et al., *Isaac Lab: A GPU-Accelerated Simulation Framework for Multi-Modal Robot Learning* | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2511.04831) | Design of Isaac Lab |

## Learning resources

- Erin Catto's [Box2D publications](https://box2d.org/publications/) (GDC talks on constraints, GJK, continuous collision) and the [Solver2D](https://box2d.org/posts/2024/02/solver2d/) blog post comparing eight solvers.
- Christer Ericson, *Real-Time Collision Detection* (Morgan Kaufmann, 2004): broad phase, SAT, GJK, BVHs; the standard book.
- Gino van den Bergen, *Collision Detection in Interactive 3D Environments* (Morgan Kaufmann, 2003).
- Ian Millington, *Game Physics Engine Development* (2nd ed., 2010): build a complete engine.
- Roy Featherstone's book (above) and the MuJoCo documentation's *Computation* chapter for generalized coordinates and contact.
- Code to read: [Box2D v3](https://github.com/erincatto/box2d) (compact C), [Jolt Physics](https://github.com/jrouwe/JoltPhysics), [PhysX](https://github.com/NVIDIA-Omniverse/PhysX) and its [rigid-body docs](https://nvidia-omniverse.github.io/PhysX/physx/5.6.0/docs/RigidBodyDynamics.html) (PGS vs TGS), [Rapier](https://github.com/dimforge/rapier), [MuJoCo](https://github.com/google-deepmind/mujoco), [Newton](https://github.com/newton-physics/newton), [Genesis](https://github.com/Genesis-Embodied-AI/Genesis), [Isaac Lab](https://github.com/isaac-sim/IsaacLab).
- [OpenUSD documentation](https://openusd.org/release/index.html), especially the glossary entries on composition arcs, and the [UsdPhysics](https://openusd.org/release/api/usd_physics_page_front.html) schema overview.

## Exercises

1. Add a second axis to `sweep_and_prune`: sweep on $x$, then filter by $y$, and compare the candidate counts when all boxes lie along a horizontal line. Which axis should you sweep on, and how could an engine choose it automatically (hint: variance of the box centers)?
2. Extend the 2D GJK to circles by writing their support function, and test circle against polygon. Why does nothing else in `gjk` need to change?
3. Give `gjk` a "closest points" mode: when the shapes are separated, return the distance from the origin to the final simplex. Check it against the true distance for two axis-aligned squares.
4. In `stack`, replace the Baumgarte bias by the soft-constraint coefficients of Section 5 (choose $f$ = 30 Hz, $\zeta = 1$). Compare penetration and jitter with the PGS version.
5. Write a USD layer that overrides the friction of every collider under `/World/Props` without editing the asset files. Which composition feature makes this possible?

<details markdown="1"><summary>Hints</summary>

1. Sweep on the axis with the largest variance of AABB centers; a horizontal line has almost no variance in $y$, so sweep on $x$. 2. GJK only touches shapes through `support`; a circle's support is $\mathbf{c} + r\,\mathbf{d}/\lVert\mathbf{d}\rVert$. 3. Track the closest point on the current simplex; stop when $\mathbf{p}\cdot\mathbf{d}$ no longer improves the distance by more than $\varepsilon$. 4. Use $\lambda = -m_{\text{eff}}\,\tfrac{a}{1+a}(\mathbf{J}\mathbf{u} + \tfrac{\omega}{2\zeta+h\omega}C)$ for penetrating contacts. 5. A stronger layer with `over` prims (or a class prim that the props inherit from) carries the new `physics:dynamicFriction` opinion; LIVRPS lets the local opinion win.

</details>

The [next post]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }}) closes the series: neural networks inside engines, generative content, LLM agents in editors, and neural "game engines" that replace the whole pipeline of this post with a learned world model.
