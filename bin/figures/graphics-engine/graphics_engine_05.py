"""Figures for graphics-engine post 05 (physics and simulation engines).

Everything that looks like data is computed here: the sweep-and-prune counts come from a real run on
random boxes, GJK/EPA run the post's own 2D code on two polygons, the box-stack curves come from the
post's toy 1D contact solvers, the chain comparison integrates a reduced-coordinate pendulum and a
maximal-coordinate (XPBD) chain, and the domain-randomization grid is ray cast in NumPy.

    python3 bin/figures/graphics-engine/graphics_engine_05.py
"""
import pathlib
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Polygon, Rectangle  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics-engine"


def out(name):
    return OUT / f"05-{name}.svg"


# ---------------------------------------------------------------------------
# 1. The physics step pipeline (schematic; labels are code names)
# ---------------------------------------------------------------------------
def fig_pipeline():
    stages = [
        ("integrate_forces", "v += h M^-1 f_ext", C["gray"]),
        ("broad_phase", "AABB tree / SAP", C["z"]),
        ("narrow_phase", "SAT, GJK + EPA", C["z"]),
        ("build_manifolds", "points, normal, depth", C["c"]),
        ("warm_start", "apply last lambda", C["b"]),
        ("solve_constraints", "PGS / TGS / XPBD", C["b"]),
        ("integrate_positions", "x += h v, q += ...", C["gray"]),
        ("islands_and_sleep", "CCD, sleep, events", C["y"]),
    ]
    fig, ax = plt.subplots(figsize=(10, 6.4))
    ax.set_xlim(0, 10); ax.set_ylim(0, 6.6); ax.axis("off")
    # two rows of four boxes, snake order
    pos = [(0.05 + 2.5 * i, 4.3) for i in range(4)] + [(0.05 + 2.5 * (3 - i), 1.5) for i in range(4)]
    bw, bh = 2.3, 1.35
    for (name, sub, col), (x, y) in zip(stages, pos):
        ax.add_patch(FancyBboxPatch((x, y), bw, bh, boxstyle="round,pad=0.04,rounding_size=0.12",
                                    fc="white", ec=col, lw=2.6))
        ax.text(x + bw / 2, y + bh * 0.64, name, ha="center", va="center", fontsize=11,
                family="monospace", color=C["dark"])
        ax.text(x + bw / 2, y + bh * 0.28, sub, ha="center", va="center", fontsize=11, color=col)
    kw = dict(arrowstyle="-|>", color=C["dark"], lw=1.8, mutation_scale=18)
    from matplotlib.patches import FancyArrowPatch
    for i in range(7):
        (x0, y0), (x1, y1) = pos[i], pos[i + 1]
        if i == 3:   # down the right side
            a = FancyArrowPatch((x0 + bw / 2, y0 - 0.05), (x1 + bw / 2, y1 + bh + 0.05), **kw)
        elif i < 3:
            a = FancyArrowPatch((x0 + bw + 0.03, y0 + bh / 2), (x1 - 0.03, y1 + bh / 2), **kw)
        else:
            a = FancyArrowPatch((x0 - 0.03, y0 + bh / 2), (x1 + bw + 0.03, y1 + bh / 2), **kw)
        ax.add_patch(a)
    # substep loop around the solver/integrate boxes (bottom row: indices 4..6)
    xl, xr = pos[6][0] - 0.1, pos[4][0] + bw + 0.1
    ax.add_patch(FancyBboxPatch((xl, 1.25), xr - xl, bh + 0.5, boxstyle="round,pad=0.02,rounding_size=0.2",
                                fc="none", ec=C["a"], lw=1.8, ls="--"))
    ax.text((xl + xr) / 2, 0.95, "for s in range(substeps):  # h = dt / substeps", ha="center",
            fontsize=12, family="monospace", color=C["a"])
    ax.text(5, 6.25, "step(dt)   (fixed dt, e.g. 1/60 s; post 01: accumulator loop)", ha="center",
            fontsize=12.5, family="monospace", color=C["dark"])
    # data labels on the first arrows
    ax.text(2.4, 5.85, "AABBs", ha="center", fontsize=11, color=C["gray"])
    ax.text(4.9, 5.85, "pairs", ha="center", fontsize=11, color=C["gray"])
    ax.text(7.4, 5.85, "contacts", ha="center", fontsize=11, color=C["gray"])
    save(fig, out("step-pipeline"))


# ---------------------------------------------------------------------------
# 2. Broad phase: sweep and prune on random boxes (real run)
# ---------------------------------------------------------------------------
def random_boxes(n, rng, density=0.04, rmin=0.4, rmax=1.2):
    """n boxes with half-sizes in [rmin, rmax]; the world grows with n (constant density)."""
    L = np.sqrt(n / density)
    c = rng.uniform(0, L, size=(n, 2))
    r = rng.uniform(rmin, rmax, size=(n, 2))
    return c - r, c + r, L


def sweep_and_prune(lo, hi):
    """Candidate pairs whose x-intervals overlap (sort once, sweep with an active list)."""
    order = np.argsort(lo[:, 0])
    active, pairs = [], []
    for i in order:
        active = [j for j in active if hi[j, 0] >= lo[i, 0]]   # drop intervals that ended
        pairs += [(j, i) for j in active]
        active.append(i)
    return pairs


def overlaps_y(lo, hi, pairs):
    return [(a, b) for a, b in pairs if lo[a, 1] <= hi[b, 1] and lo[b, 1] <= hi[a, 1]]


def fig_sap():
    rng = np.random.default_rng(3)
    lo, hi, L = random_boxes(40, rng)
    cand = sweep_and_prune(lo, hi)
    real = overlaps_y(lo, hi, cand)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 5.6), gridspec_kw=dict(width_ratios=[1.05, 1]))
    inreal = {i for p in real for i in p}
    for i in range(len(lo)):
        col = C["x"] if i in inreal else C["z"]
        a1.add_patch(Rectangle(lo[i], *(hi[i] - lo[i]), fc=col, alpha=0.18, ec=col, lw=1.6))
    for k, i in enumerate(np.argsort(lo[:, 0])):      # x-intervals stacked below the scene
        yb = -2.0 - 0.3 * (k % 8)
        a1.plot([lo[i, 0], hi[i, 0]], [yb, yb], color=C["gray"], lw=2.2, solid_capstyle="butt")
    a1.axhline(-1.5, color=C["dark"], lw=1)
    a1.set_xlim(-0.5, L + 0.5); a1.set_ylim(-4.6, L + 0.5); a1.set_aspect("equal")
    a1.set_xlabel("$x$"); a1.set_ylabel("$y$"); a1.set_yticks([0, 10, 20, 30])
    a1.set_title(f"n = 40:  {len(cand)} x-overlaps,  {len(real)} true pairs,  {40 * 39 // 2} all pairs",
                 fontsize=13)
    print(f"  SAP n=40: candidates={len(cand)} true={len(real)} brute={40 * 39 // 2}")

    ns = np.array([25, 50, 100, 200, 400, 800, 1600])
    nc, nr = [], []
    for n in ns:
        lo, hi, L = random_boxes(int(n), rng)
        cand = sweep_and_prune(lo, hi)
        nc.append(len(cand)); nr.append(len(overlaps_y(lo, hi, cand)))
    nc, nr = np.array(nc), np.array(nr)
    brute = ns * (ns - 1) / 2
    rbar = 0.8                                          # mean half-size
    Ls = np.sqrt(ns / 0.04)
    a2.loglog(ns, brute, "-", color=C["dark"], label="all pairs  n(n-1)/2")
    a2.loglog(ns, nc, "o-", color=C["z"], label="SAP candidates (x only)")
    a2.loglog(ns, brute * 4 * rbar / Ls, ":", color=C["z"], lw=1.8, label=r"$\frac{n^2}{2}\,\frac{4\bar r}{L}$")
    a2.loglog(ns, nr, "s-", color=C["x"], label="true AABB overlaps")
    a2.set_xlabel("number of boxes $n$"); a2.set_ylabel("pairs")
    a2.legend(fontsize=12, loc="upper left")
    for n, b, c, r in zip(ns, brute, nc, nr):
        print(f"  n={n:5d} brute={int(b):8d} sap={c:7d} true={r:6d}")
    fig.tight_layout()
    save(fig, out("sweep-and-prune"))


# ---------------------------------------------------------------------------
# 3-4. GJK and EPA in 2D (the post's code)
# ---------------------------------------------------------------------------
def support(P, d):
    return P[np.argmax(P @ d)]


def support_md(A, B, d):
    """Support point of the Minkowski difference A - B in direction d."""
    return support(A, d) - support(B, -d)


def cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]


def triple(a, b, c):
    """(a x b) x c for 2D vectors embedded in 3D: b (a.c) - a (b.c)."""
    return b * np.dot(a, c) - a * np.dot(b, c)


def do_simplex(s):
    """Reduce the simplex to the feature closest to the origin; return (contains, simplex, new_dir)."""
    if len(s) == 2:
        b, a = s                                        # a is the newest point
        ab, ao = b - a, -a
        if np.dot(ab, ao) > 0:
            d = triple(ab, ao, ab)                      # perpendicular to ab, towards the origin
            if np.dot(d, d) < 1e-20:                    # origin lies on the segment
                return True, [b, a], None
            return False, [b, a], d
        return False, [a], ao
    c, b, a = s
    ab, ac, ao = b - a, c - a, -a
    if abs(cross2(ab, ac)) < 1e-12:                     # degenerate triangle
        return do_simplex([b, a])
    ab_perp = triple(ac, ab, ab)                        # normal of ab, pointing away from c
    ac_perp = triple(ab, ac, ac)                        # normal of ac, pointing away from b
    if np.dot(ab_perp, ao) > 0:
        return False, [b, a], ab_perp
    if np.dot(ac_perp, ao) > 0:
        return False, [c, a], ac_perp
    return True, s, None                                # origin inside the triangle


def gjk(A, B, max_iter=32):
    d = A.mean(0) - B.mean(0)
    if np.dot(d, d) < 1e-20:
        d = np.array([1.0, 0.0])
    simplex = [support_md(A, B, d)]
    d = -simplex[0]
    history = [([p.copy() for p in simplex], d.copy())]
    for _ in range(max_iter):
        if np.dot(d, d) < 1e-20:
            return True, simplex, history
        p = support_md(A, B, d)
        if np.dot(p, d) <= 0:                           # p did not pass the origin: separated
            return False, simplex, history
        simplex = simplex + [p]
        hit, simplex, d = do_simplex(simplex)
        history.append(([q.copy() for q in simplex], None if d is None else d.copy()))
        if hit:
            return True, simplex, history
    return False, simplex, history


def epa(A, B, simplex, tol=1e-9, max_iter=64):
    """Expanding polytope: returns (normal n, depth, polygons per iteration)."""
    poly = [np.asarray(p, float) for p in simplex]
    while len(poly) < 3:                                # origin on an edge: add a support point
        e = poly[-1] - poly[0] if len(poly) == 2 else np.array([1.0, 0.0])
        poly.append(support_md(A, B, np.array([-e[1], e[0]])))
    if cross2(poly[1] - poly[0], poly[2] - poly[0]) < 0:
        poly[1], poly[2] = poly[2], poly[1]             # make it counter-clockwise
    stages = [list(poly)]
    for _ in range(max_iter):
        best = None
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            e = b - a
            n = np.array([e[1], -e[0]]) / np.linalg.norm(e)   # outward normal of a CCW edge
            dist = np.dot(n, a)
            if best is None or dist < best[0]:
                best = (dist, n, i)
        dist, n, i = best
        p = support_md(A, B, n)
        if np.dot(p, n) - dist < tol:                   # the closest edge is on the boundary
            return n, dist, stages
        poly.insert(i + 1, p)
        stages.append(list(poly))
    return n, dist, stages


def convex_hull(P):
    P = sorted(map(tuple, P))
    def half(pts):
        h = []
        for p in pts:
            while len(h) >= 2 and cross2(np.subtract(h[-1], h[-2]), np.subtract(p, h[-2])) <= 0:
                h.pop()
            h.append(p)
        return h
    lower, upper = half(P), half(P[::-1])
    return np.array(lower[:-1] + upper[:-1])


POLY_A = np.array([[0.0, 0.0], [3.0, 0.5], [3.5, 2.5], [1.0, 3.0]])
POLY_B = np.array([[2.5, 1.5], [5.0, 1.0], [4.0, 3.5]])


def draw_md(ax, MD, lim):
    ax.add_patch(Polygon(MD, closed=True, fc=C["fill"], ec=C["a"], lw=2))
    ax.axhline(0, color=C["gray"], lw=1); ax.axvline(0, color=C["gray"], lw=1)
    ax.plot(0, 0, "o", color=C["dark"], ms=8, zorder=6)
    ax.set_xlim(*lim[0]); ax.set_ylim(*lim[1]); ax.set_aspect("equal")


def fig_gjk():
    A, B = POLY_A, POLY_B
    MD = convex_hull([a - b for a in A for b in B])
    hit, simplex, hist = gjk(A, B)
    print(f"  GJK: hit={hit}, iterations={len(hist) - 1}")
    lim = ((MD[:, 0].min() - 0.6, MD[:, 0].max() + 0.6), (MD[:, 1].min() - 0.6, MD[:, 1].max() + 0.6))
    k = len(hist)
    fig, axs = plt.subplots(1, k + 1, figsize=(4.0 * (k + 1), 4.6))
    ax = axs[0]
    ax.add_patch(Polygon(A, closed=True, fc=C["z"], alpha=0.25, ec=C["z"], lw=2))
    ax.add_patch(Polygon(B, closed=True, fc=C["b"], alpha=0.25, ec=C["b"], lw=2))
    ax.text(*A.mean(0) - [0.6, 0.4], "A", color=C["z"], fontsize=18)
    ax.text(*B.mean(0) + [0.2, 0.0], "B", color=C["b"], fontsize=18)
    ax.set_xlim(-0.5, 5.5); ax.set_ylim(-0.7, 4.0); ax.set_aspect("equal"); ax.set_title("world")
    for it, (s, d) in enumerate(hist):
        ax = axs[it + 1]
        draw_md(ax, MD, lim)
        S = np.array(s)
        if len(S) >= 2:
            ax.add_patch(Polygon(S, closed=len(S) == 3, fill=len(S) == 3, fc=C["x"], alpha=0.18,
                                 ec=C["x"], lw=2.5))
        ax.plot(S[:, 0], S[:, 1], "o", color=C["x"], ms=9, zorder=7)
        if d is not None:
            dn = d / np.linalg.norm(d) * 1.4
            ax.annotate("", xy=dn, xytext=(0, 0),
                        arrowprops=dict(arrowstyle="-|>", color=C["y"], lw=2.4, mutation_scale=18))
        title = f"iter {it}: |S| = {len(S)}"
        if it == k - 1 and hit:
            title += "  (origin inside)"
        ax.set_title(title, fontsize=14)
    axs[1].text(0.03, 0.04, "A - B", transform=axs[1].transAxes, color=C["a"], fontsize=15)
    fig.tight_layout()
    save(fig, out("gjk-simplex"))
    return hit, simplex


def fig_epa(simplex):
    A, B = POLY_A, POLY_B
    MD = convex_hull([a - b for a in A for b in B])
    n, depth, stages = epa(A, B, simplex)
    print(f"  EPA: normal=({n[0]:.3f}, {n[1]:.3f}) depth={depth:.3f} polytopes={len(stages)}")
    lim = ((MD[:, 0].min() - 0.6, MD[:, 0].max() + 0.6), (MD[:, 1].min() - 0.6, MD[:, 1].max() + 0.6))
    show = [0, len(stages) - 1] if len(stages) > 1 else [0]
    fig, axs = plt.subplots(1, len(show) + 1, figsize=(4.4 * (len(show) + 1), 4.8))
    for ax, si in zip(axs, show):
        draw_md(ax, MD, lim)
        P = np.array(stages[si])
        ax.add_patch(Polygon(P, closed=True, fc=C["x"], alpha=0.15, ec=C["x"], lw=2.4))
        ax.plot(P[:, 0], P[:, 1], "o", color=C["x"], ms=7)
        ax.set_title(f"EPA polytope {si} ({len(P)} vertices)", fontsize=14)
    ax = axs[len(show) - 1]
    ax.annotate("", xy=n * depth, xytext=(0, 0),
                arrowprops=dict(arrowstyle="-|>", color=C["y"], lw=3, mutation_scale=20))
    ax.text(*(n * depth * 0.5 + np.array([-n[1], n[0]]) * 0.35), f"d = {depth:.2f}", color=C["y"], fontsize=14)
    ax = axs[-1]
    ax.add_patch(Polygon(A, closed=True, fc=C["z"], alpha=0.25, ec=C["z"], lw=2))
    ax.add_patch(Polygon(B, closed=True, fc=C["b"], alpha=0.10, ec=C["b"], lw=1.5, ls="--"))
    ax.add_patch(Polygon(B + n * depth, closed=True, fc=C["b"], alpha=0.25, ec=C["b"], lw=2))
    c = B.mean(0)
    ax.annotate("", xy=c + n * depth, xytext=c,
                arrowprops=dict(arrowstyle="-|>", color=C["y"], lw=3, mutation_scale=20))
    ax.set_xlim(-0.5, 6.0); ax.set_ylim(-0.7, 4.6); ax.set_aspect("equal")
    ax.set_title(r"B moved by $d\,\mathbf{n}$: touching", fontsize=14)
    fig.tight_layout()
    save(fig, out("epa"))


# ---------------------------------------------------------------------------
# 5-6. Box stack: PGS (sequential impulses), warm starting, substeps, XPBD
# ---------------------------------------------------------------------------
G = 9.81


def stack_sim(n=10, top_mass=1.0, method="pgs", iters=10, substeps=1, warm=False,
              frames=120, dt=1 / 60, beta=0.2):
    """1D stack of n unit boxes (height 1) resting on the ground at y = 0.
    Contact k joins box k-1 (or the ground for k = 0) and box k; gap C_k >= 0.
    Returns the maximum penetration (m) after each frame."""
    m = np.ones(n); m[-1] = top_mass
    w = 1.0 / m
    y = np.arange(n) + 0.5                              # exactly touching
    v = np.zeros(n)
    lam = np.zeros(n)
    h = dt / substeps
    pen = []

    def gaps(y):
        return np.concatenate([[y[0] - 0.5], np.diff(y) - 1.0])

    for _ in range(frames):
        for _ in range(substeps):
            if method == "xpbd":
                y_prev = y.copy()
                v -= G * h
                y = y + h * v
                for _ in range(iters):
                    for k in range(n):
                        if k == 0:
                            Ck = y[0] - 0.5
                            if Ck < 0:
                                y[0] -= Ck              # the ground has zero inverse mass
                        else:
                            Ck = y[k] - y[k - 1] - 1.0
                            if Ck < 0:
                                dl = -Ck / (w[k] + w[k - 1])
                                y[k] += w[k] * dl; y[k - 1] -= w[k - 1] * dl
                v = (y - y_prev) / h
            else:
                v -= G * h
                Cg = gaps(y)
                if warm:                                # re-apply last step's impulses
                    v += w * lam
                    v[:-1] -= w[:-1] * lam[1:]
                else:
                    lam[:] = 0.0
                for _ in range(iters):
                    for k in range(n):
                        jv = v[k] - (v[k - 1] if k else 0.0)
                        keff = w[k] + (w[k - 1] if k else 0.0)
                        bias = beta / h * min(0.0, Cg[k])   # Baumgarte: push out of penetration
                        dl = -(jv + bias) / keff
                        new = max(0.0, lam[k] + dl)        # contacts only push
                        dl, lam[k] = new - lam[k], new
                        v[k] += w[k] * dl
                        if k:
                            v[k - 1] -= w[k - 1] * dl
                y = y + h * v
        pen.append(max(0.0, -gaps(y).min()))
    return np.array(pen)


SOLVERS = [
    ("PGS 1x10", dict(method="pgs", iters=10, substeps=1, warm=False), C["x"]),
    ("PGS 1x10 + warm start", dict(method="pgs", iters=10, substeps=1, warm=True), C["b"]),
    ("substeps 10x1 + warm (TGS-like)", dict(method="pgs", iters=1, substeps=10, warm=True), C["z"]),
    ("XPBD 10x1", dict(method="xpbd", iters=1, substeps=10), C["a"]),
]


def fig_stack():
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 5.0))
    t = np.arange(1, 121) / 60
    for name, kw, col in SOLVERS:
        p = stack_sim(top_mass=10.0, **kw)
        a1.semilogy(t, np.maximum(p * 1000, 1e-3), color=col, label=name)
    a1.set_xlabel("$t$ (s)"); a1.set_ylabel("max penetration (mm)")
    a1.set_title("10 boxes, top box 10x heavier", fontsize=14); a1.set_ylim(1e-3, 1e3)
    a1.legend(fontsize=11, loc="lower right")
    ratios = [1, 10, 100]
    width = 0.2
    for j, (name, kw, col) in enumerate(SOLVERS):
        vals = [stack_sim(top_mass=float(r), **kw)[-30:].mean() * 1000 for r in ratios]
        print(f"  {name:34s} mean penetration (mm) over last 0.5 s for ratios {ratios}: "
              + ", ".join(f"{v:.3g}" for v in vals))
        xs = np.arange(3) + (j - 1.5) * width
        a2.bar(xs, np.maximum(vals, 1e-3), width, color=col, label=name)
        for xv, v in zip(xs, vals):
            if v < 1e-3:
                a2.text(xv, 1.4e-3, "0", ha="center", fontsize=12, color=col)
    a2.set_yscale("log"); a2.set_ylim(1e-3, 1e3)
    a2.set_xticks(range(3)); a2.set_xticklabels([f"1 : {r}" for r in ratios])
    a2.set_xlabel("mass ratio  (box : top box)"); a2.set_ylabel("penetration at rest (mm)")
    fig.tight_layout()
    save(fig, out("stack-solvers"))


def fig_substeps():
    budgets = np.array([1, 2, 4, 8, 16, 32])
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 5.0))
    for subst, col, name in [(False, C["x"], "1 step x N iterations"), (True, C["z"], "N substeps x 1 iteration")]:
        vals = []
        for N in budgets:
            kw = dict(iters=1, substeps=int(N)) if subst else dict(iters=int(N), substeps=1)
            vals.append(stack_sim(n=10, top_mass=10.0, method="pgs", warm=False, **kw)[-30:].mean() * 1000)
        a1.loglog(budgets, np.maximum(vals, 1e-7), "o-", color=col, label=name)
        print(f"  {name:26s}: " + ", ".join(f"N={N}: {v:.3g} mm" for N, v in zip(budgets, vals)))
    a1.set_xlabel("constraint sweeps per frame $N$"); a1.set_ylabel("penetration at rest (mm)")
    a1.set_xticks(budgets); a1.set_xticklabels([str(b) for b in budgets])
    a1.legend(fontsize=12)
    # right: the two stacks after 2 s for N = 8, penetration magnified
    for xoff, kw, col in [(0, dict(iters=8, substeps=1), C["x"]), (2.2, dict(iters=1, substeps=8), C["z"])]:
        y = stack_heights(n=10, top_mass=10.0, **kw)
        for k, yk in enumerate(y):
            a2.add_patch(Rectangle((xoff, yk - 0.5), 1.6, 1.0, fc=col, alpha=0.12 + 0.05 * (k == 9),
                                   ec=col, lw=1.6))
        a2.text(xoff + 0.8, -0.8, f"top y = {y[-1]:.3f}", ha="center", fontsize=12, color=col)
    a2.axhline(0, color=C["dark"], lw=2)
    a2.axhline(9.5, color=C["gray"], lw=1, ls=":")
    a2.set_xlim(-0.4, 4.2); a2.set_ylim(-1.3, 10.6); a2.set_xticks([])
    a2.set_ylabel("$y$ (m)"); a2.set_title("N = 8 after 2 s (rest: top y = 9.5)", fontsize=14)
    fig.tight_layout()
    save(fig, out("substeps-vs-iterations"))


def stack_heights(n=10, top_mass=10.0, iters=8, substeps=1, frames=120, dt=1 / 60, beta=0.2):
    """Same as stack_sim (PGS, no warm start) but returns final box centers."""
    m = np.ones(n); m[-1] = top_mass
    w = 1.0 / m
    y = np.arange(n) + 0.5
    v = np.zeros(n)
    h = dt / substeps
    for _ in range(frames * substeps):
        v -= G * h
        Cg = np.concatenate([[y[0] - 0.5], np.diff(y) - 1.0])
        lam = np.zeros(n)
        for _ in range(iters):
            for k in range(n):
                jv = v[k] - (v[k - 1] if k else 0.0)
                keff = w[k] + (w[k - 1] if k else 0.0)
                dl = -(jv + beta / h * min(0.0, Cg[k])) / keff
                new = max(0.0, lam[k] + dl)
                dl, lam[k] = new - lam[k], new
                v[k] += w[k] * dl
                if k:
                    v[k - 1] -= w[k - 1] * dl
        y = y + h * v
    return y


# ---------------------------------------------------------------------------
# 7. Articulated chain: reduced coordinates vs maximal coordinates (XPBD)
# ---------------------------------------------------------------------------
LINK, MASSES = 1.0, np.array([1.0, 1.0, 1.0, 50.0])   # light links, heavy end effector


def chain_points(th):
    steps = LINK * np.stack([np.sin(th), -np.cos(th)], axis=1)
    return np.cumsum(steps, axis=0)


def reduced_step(th, om, h):
    """One RK4 step of the n-link pendulum in joint angles (generalized coordinates)."""
    def acc(th, om):
        n = len(th)
        J = np.zeros((n, 2, n)); Jd_qd = np.zeros((n, 2))
        for i in range(n):
            for k in range(i + 1):
                J[i, :, k] = LINK * np.array([np.cos(th[k]), np.sin(th[k])])
                Jd_qd[i] += LINK * om[k] ** 2 * np.array([-np.sin(th[k]), np.cos(th[k])])
        M = sum(MASSES[i] * J[i].T @ J[i] for i in range(n))
        f = sum(J[i].T @ (MASSES[i] * (np.array([0.0, -G]) - Jd_qd[i])) for i in range(n))
        return np.linalg.solve(M, f)
    k1t, k1o = om, acc(th, om)
    k2t, k2o = om + 0.5 * h * k1o, acc(th + 0.5 * h * k1t, om + 0.5 * h * k1o)
    k3t, k3o = om + 0.5 * h * k2o, acc(th + 0.5 * h * k2t, om + 0.5 * h * k2o)
    k4t, k4o = om + h * k3o, acc(th + h * k3t, om + h * k3o)
    return th + h / 6 * (k1t + 2 * k2t + 2 * k3t + k4t), om + h / 6 * (k1o + 2 * k2o + 2 * k3o + k4o)


def maximal_run(th0, frames, dt, iters):
    """Particles + distance constraints (XPBD with zero compliance), one step per frame."""
    x = chain_points(th0); v = np.zeros_like(x)
    w = 1.0 / MASSES
    traj, err = [x.copy()], []
    for _ in range(frames):
        xp = x.copy()
        v[:, 1] -= G * dt
        x = x + dt * v
        for _ in range(iters):
            for i in range(len(x)):
                a = np.zeros(2) if i == 0 else x[i - 1]
                wa = 0.0 if i == 0 else w[i - 1]
                d = x[i] - a
                L = np.linalg.norm(d)
                Cc = L - LINK
                dl = -Cc / (w[i] + wa)
                x[i] += w[i] * dl * d / L
                if i:
                    x[i - 1] -= wa * dl * d / L
        v = (x - xp) / dt
        traj.append(x.copy())
        anchors = np.vstack([[0.0, 0.0], x[:-1]])
        err.append(np.abs(np.linalg.norm(x - anchors, axis=1) - LINK).max() / LINK)
    return np.array(traj), np.array(err)


def fig_chain():
    th0 = np.array([1.2, 1.2, 1.2, 1.2])               # straight chain, 69 degrees from vertical
    dt, frames = 1 / 60, 180
    th, om = th0.copy(), np.zeros(4)
    red = [chain_points(th)]
    for _ in range(frames):
        for _ in range(20):
            th, om = reduced_step(th, om, dt / 20)
        red.append(chain_points(th))
    red = np.array(red)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 5.6))
    trajs = {}
    for it, col in [(1, C["b"]), (4, C["x"]), (32, C["y"])]:
        trajs[it] = maximal_run(th0, frames, dt, it)
    for f, alpha in [(0, 0.35), (20, 0.6), (40, 1.0)]:
        P = np.vstack([[0, 0], red[f]])
        a1.plot(P[:, 0], P[:, 1], "o-", color=C["a"], alpha=alpha, lw=2.6, ms=5)
        Q = np.vstack([[0, 0], trajs[1][0][f]])
        a1.plot(Q[:, 0], Q[:, 1], "s--", color=C["b"], alpha=alpha, lw=2.0, ms=5)
        a1.plot(*red[f][-1], "o", color=C["a"], ms=12, alpha=alpha)
        a1.plot(*trajs[1][0][f][-1], "s", color=C["b"], ms=11, alpha=alpha)
    a1.plot(0, 0, "k^", ms=12)
    a1.set_aspect("equal"); a1.set_xlim(-0.6, 4.6); a1.set_ylim(-4.2, 0.6)
    a1.set_title("t = 0, 1/3, 2/3 s: reduced (o) vs maximal 1 iter (s)", fontsize=13)
    t = np.arange(1, frames + 1) * dt
    for it, col in [(1, C["b"]), (4, C["x"]), (32, C["y"])]:
        a2.semilogy(t, np.maximum(trajs[it][1], 1e-9), color=col, label=f"maximal, {it} iter/step")
        print(f"  maximal chain, {it:2d} iterations: max joint error {trajs[it][1].max():.3%}")
    a2.axhline(1e-9, color=C["a"], lw=3, label="reduced: 0 by construction")
    a2.set_xlabel("$t$ (s)"); a2.set_ylabel(r"max $|\,\ell-\ell_0| / \ell_0$")
    a2.legend(fontsize=12, loc="center right")
    fig.tight_layout()
    save(fig, out("articulated-chain"))


# ---------------------------------------------------------------------------
# 8. OpenUSD composition (schematic; labels are file names and USD syntax)
# ---------------------------------------------------------------------------
def fig_usd():
    fig, ax = plt.subplots(figsize=(11, 6.6))
    ax.set_xlim(0, 11); ax.set_ylim(0, 6.8); ax.axis("off")
    layers = [
        ("session layer (viewer edits)", 'color = (1, 0, 0)', C["x"]),
        ("scene.usda  (root layer)", 'over "Robot" { physics:mass = 3.0 }', C["a"]),
        ("  sublayer: lighting.usda", 'def DomeLight "Sky" {...}', C["light"]),
        ("  sublayer: layout.usda", 'def "Robot" ( references = @robot.usd@ )', C["z"]),
    ]
    for i, (name, opinion, col) in enumerate(layers):
        y = 5.6 - i * 1.05
        ax.add_patch(FancyBboxPatch((0.2, y), 6.0, 0.82, boxstyle="round,pad=0.02,rounding_size=0.1",
                                    fc="white", ec=col, lw=2.4))
        ax.text(0.4, y + 0.56, name, fontsize=12.5, family="monospace", color=C["dark"], va="center")
        ax.text(0.4, y + 0.22, opinion, fontsize=11, family="monospace", color=col, va="center")
    # referenced asset with variants and payload
    ax.add_patch(FancyBboxPatch((0.2, 0.25), 6.0, 1.3, boxstyle="round,pad=0.02,rounding_size=0.1",
                                fc="#f6f6f6", ec=C["gray"], lw=2))
    ax.text(0.4, 1.27, "robot.usd  (referenced asset)", fontsize=12.5, family="monospace", color=C["dark"])
    ax.text(0.4, 0.92, "physics:mass = 2.0   (UsdPhysics.MassAPI)", fontsize=11, family="monospace", color=C["gray"])
    ax.text(0.4, 0.58, 'variantSet "gripper" = {parallel, suction}', fontsize=11, family="monospace", color=C["gray"])
    ax.text(0.4, 0.30, "payload = @robot_meshes.usd@", fontsize=11, family="monospace", color=C["gray"])
    from matplotlib.patches import FancyArrowPatch
    ax.add_patch(FancyArrowPatch((6.55, 1.0), (6.55, 6.3), arrowstyle="-|>", color=C["dark"], lw=2,
                                 mutation_scale=20))
    ax.text(6.75, 3.6, "stronger", rotation=90, fontsize=13, va="center", color=C["dark"])
    # LIVRPS
    ax.text(7.4, 6.2, "LIVRPS strength order (+ relocates)", fontsize=12, color=C["dark"])
    for i, (letter, word) in enumerate([("L", "local (layer stack)"), ("I", "inherits"), ("V", "variants"),
                                        ("R", "references"), ("P", "payloads"), ("S", "specializes")]):
        ax.text(7.5, 5.6 - 0.48 * i, letter, fontsize=16, family="monospace", color=C["a"], weight="bold")
        ax.text(7.95, 5.6 - 0.48 * i, word, fontsize=12, family="monospace", color=C["dark"])
    ax.add_patch(FancyBboxPatch((7.3, 0.25), 3.5, 1.9, boxstyle="round,pad=0.02,rounding_size=0.1",
                                fc=C["fill"], ec=C["a"], lw=2))
    ax.text(7.45, 1.75, "composed /Robot", fontsize=12.5, family="monospace", color=C["dark"])
    ax.text(7.45, 1.30, "physics:mass = 3.0", fontsize=11.5, family="monospace", color=C["a"])
    ax.text(7.45, 0.92, "color = (1, 0, 0)", fontsize=11.5, family="monospace", color=C["x"])
    ax.text(7.45, 0.54, "gripper = parallel", fontsize=11.5, family="monospace", color=C["gray"])
    save(fig, out("usd-composition"))


# ---------------------------------------------------------------------------
# 9. Domain randomization: a tiny NumPy ray caster with randomized scene parameters
# ---------------------------------------------------------------------------
def look_at(eye, target, W, fov=50.0):
    f = target - eye; f = f / np.linalg.norm(f)
    r = np.cross(f, [0.0, 1.0, 0.0]); r /= np.linalg.norm(r)
    u = np.cross(r, f)
    s = np.tan(np.radians(fov) / 2)
    j, i = np.mgrid[0:W, 0:W]
    px = (2 * (i + 0.5) / W - 1) * s
    py = (1 - 2 * (j + 0.5) / W) * s
    d = px[..., None] * r + py[..., None] * u + f
    return d.reshape(-1, 3) / np.linalg.norm(d.reshape(-1, 3), axis=1, keepdims=True)


def hit_sphere(o, d, c, r):
    oc = o - c
    b = (d * oc).sum(-1)
    disc = b * b - ((oc * oc).sum(-1) - r * r)
    t = -b - np.sqrt(np.maximum(disc, 0))
    return np.where((disc > 0) & (t > 1e-4), t, np.inf)


def hit_box(o, d, bmin, bmax):
    dd = np.where(np.abs(d) < 1e-9, 1e-9, d)
    t0, t1 = (bmin - o) / dd, (bmax - o) / dd
    tmin = np.minimum(t0, t1).max(-1); tmax = np.maximum(t0, t1).min(-1)
    ok = (tmax >= tmin) & (tmax > 1e-4)
    t = np.where(tmin > 1e-4, tmin, tmax)
    return np.where(ok, t, np.inf)


def hit_plane(o, d):
    oy = o[..., 1] if np.ndim(o) > 1 else o[1]
    t = -oy / np.where(np.abs(d[:, 1]) < 1e-9, -1e-9, d[:, 1])
    return np.where(t > 1e-4, t, np.inf)


def render(params, W=112):
    eye = params["eye"]
    d = look_at(eye, np.array([0.0, 0.5, 0.0]), W, params["fov"])
    o = np.broadcast_to(eye, d.shape)
    sc, sr = params["sphere"]
    bmin, bmax = params["box"]
    ts = np.stack([hit_plane(o, d), hit_sphere(o, d, sc, sr), hit_box(o, d, bmin, bmax)], axis=1)
    idx = ts.argmin(1); t = ts.min(1)
    p = o + d * np.where(np.isfinite(t), t, 0)[:, None]
    n = np.zeros_like(p); n[:, 1] = 1.0
    ms = idx == 1
    n[ms] = (p[ms] - sc) / sr
    mb = idx == 2
    bc, bh = (bmin + bmax) / 2, (bmax - bmin) / 2
    q = (p[mb] - bc) / bh
    ax_ = np.abs(q).argmax(1)
    nb = np.zeros_like(q); nb[np.arange(len(q)), ax_] = np.sign(q[np.arange(len(q)), ax_])
    n[mb] = nb
    # albedo: checker floor with random scale and colors, solid objects
    chk = ((np.floor(p[:, 0] * params["chk"]) + np.floor(p[:, 2] * params["chk"])) % 2)[:, None]
    alb = np.where(chk > 0, params["floor"][0], params["floor"][1])
    alb[ms] = params["sphere_col"]; alb[mb] = params["box_col"]
    L = params["light"]
    ndl = np.clip((n * L).sum(1), 0, None)
    po = p + n * 1e-3
    lo_ = np.broadcast_to(L, p.shape)
    shadow = np.isfinite(np.minimum(hit_sphere(po, lo_, sc, sr), hit_box(po, lo_, bmin, bmax)))
    col = alb * (params["amb"] + params["sun"] * ndl * ~shadow)[:, None] * params["tint"]
    sky = (np.array([0.75, 0.85, 1.0]) * (0.6 + 0.4 * np.clip(d[:, 1:2], 0, 1))) * params["sky"]
    col = np.where(np.isfinite(t)[:, None], col, sky)
    img = col.reshape(W, W, 3) * params["exposure"]
    img = img + params["rng"].normal(0, params["noise"], img.shape)    # sensor noise
    return np.clip(img, 0, 1) ** (1 / 2.2)


def random_params(rng, canonical=False):
    def unit(v):
        return v / np.linalg.norm(v)
    if canonical:
        return dict(eye=np.array([0.0, 2.2, 5.0]), fov=50.0, sphere=(np.array([-0.8, 0.6, 0.0]), 0.6),
                    box=(np.array([0.3, 0.0, -0.5]), np.array([1.3, 1.0, 0.5])), chk=1.0,
                    floor=(np.array([0.8, 0.8, 0.8]), np.array([0.35, 0.35, 0.35])),
                    sphere_col=np.array([0.8, 0.2, 0.2]), box_col=np.array([0.2, 0.4, 0.8]),
                    light=unit(np.array([0.5, 1.0, 0.6])), amb=0.25, sun=0.9, tint=np.ones(3), sky=1.0,
                    exposure=1.0, noise=0.0, rng=rng)
    ang = rng.uniform(-0.6, 0.6); dist = rng.uniform(4.0, 6.0); hgt = rng.uniform(1.0, 3.5)
    sx = rng.uniform(-1.4, -0.4); bx = rng.uniform(0.0, 0.9); bs = rng.uniform(0.7, 1.2)
    return dict(eye=np.array([dist * np.sin(ang), hgt, dist * np.cos(ang)]), fov=rng.uniform(40, 60),
                sphere=(np.array([sx, rng.uniform(0.4, 0.8), rng.uniform(-0.5, 0.5)]), rng.uniform(0.4, 0.8)),
                box=(np.array([bx, 0.0, -bs / 2]), np.array([bx + bs, bs, bs / 2])), chk=rng.uniform(0.5, 4.0),
                floor=(rng.uniform(0.2, 1.0, 3), rng.uniform(0.0, 0.5, 3)),
                sphere_col=rng.uniform(0.05, 1.0, 3), box_col=rng.uniform(0.05, 1.0, 3),
                light=unit(np.array([rng.uniform(-1, 1), rng.uniform(0.3, 1.2), rng.uniform(-1, 1)])),
                amb=rng.uniform(0.05, 0.4), sun=rng.uniform(0.5, 1.4), tint=rng.uniform(0.75, 1.0, 3),
                sky=rng.uniform(0.5, 1.1), exposure=rng.uniform(0.7, 1.3), noise=rng.uniform(0.0, 0.06),
                rng=rng)


def fig_domain_randomization():
    rng = np.random.default_rng(7)
    fig, axs = plt.subplots(3, 4, figsize=(10, 7.6))
    for k, ax in enumerate(axs.ravel()):
        img = render(random_params(rng, canonical=(k == 0)))
        ax.imshow(img, interpolation="nearest")
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
        for s in ax.spines.values():
            s.set_visible(True); s.set_color(C["a"] if k == 0 else "#cccccc"); s.set_linewidth(3 if k == 0 else 1)
    axs[0, 0].set_title("canonical", fontsize=13, color=C["a"])
    fig.tight_layout(pad=0.4)
    save(fig, out("domain-randomization"))


if __name__ == "__main__":
    fig_pipeline()
    fig_sap()
    hit, simplex = fig_gjk()
    if hit:
        fig_epa(simplex)
    fig_stack()
    fig_substeps()
    fig_chain()
    fig_usd()
    fig_domain_randomization()
