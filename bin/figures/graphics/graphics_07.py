"""Figures for graphics post 07 (physically based simulation).

Every curve and mesh is computed: the integrator experiment and the XPBD cloth solver are the
post's own code (copied below), run with the post's parameters. Conventions follow the post:
right-handed, y is up, gravity is -y, the cloth starts in the x-y plane (z = 0).

    python3 bin/figures/graphics/graphics_07.py
"""
import pathlib
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib.collections import LineCollection  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics"


def out(name):
    return OUT / f"07-{name}.svg"


# ---------------------------------------------------------------------------
# Section 2: integrators (the post's experiment: k = 100, m = 1, h = 0.01)
# ---------------------------------------------------------------------------
k, m, h = 100.0, 1.0, 0.01
w0 = np.sqrt(k / m)


def energy(x, v):
    return 0.5 * m * v**2 + 0.5 * k * x**2


def explicit_euler(x, v):
    return x + h * v, v + h * (-k / m * x)


def symplectic_euler(x, v):
    v = v + h * (-k / m * x)
    return x + h * v, v


def implicit_euler(x, v):
    A = np.array([[1.0, -h], [h * k / m, 1.0]])
    return tuple(np.linalg.solve(A, [x, v]))


def run(f, steps):
    xs, vs = [1.0], [0.0]
    x, v = 1.0, 0.0
    for _ in range(steps):
        x, v = f(x, v)
        xs.append(x); vs.append(v)
    return np.array(xs), np.array(vs)


def run_verlet(steps):
    x, xp = 1.0, 1.0 - 0.5 * h * h * k / m
    xs, vs = [1.0], [0.0]
    for _ in range(steps):
        x, xp = 2 * x - xp + h * h * (-k / m * x), x
        xs.append(x); vs.append((x - xp) / h)      # backward-difference velocity, as in the post
    return np.array(xs), np.array(vs)


INTEG = [
    ("explicit Euler", explicit_euler, C["x"]),
    ("implicit Euler", implicit_euler, C["z"]),
    ("symplectic Euler", symplectic_euler, C["y"]),
    ("Verlet", None, C["a"]),
]


def fig_phase():
    steps = 300                                      # 3 s = about 4.8 periods
    fig, axs = plt.subplots(2, 2, figsize=(10, 10))
    th = np.linspace(0, 2 * np.pi, 200)
    for ax, (name, f, col) in zip(axs.ravel(), INTEG):
        xs, vs = run_verlet(steps) if f is None else run(f, steps)
        ax.plot(np.cos(th), np.sin(th), "--", color=C["gray"], lw=1.6)
        ax.plot(xs, vs / w0, color=col, lw=1.4)
        ax.plot(xs[0], vs[0] / w0, "o", color=C["dark"], ms=7)
        ax.plot(xs[-1], vs[-1] / w0, "s", color=col, ms=7)
        lim = max(1.25, np.abs(xs).max() * 1.08, np.abs(vs / w0).max() * 1.08)
        ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_aspect("equal")
        ax.set_title(name, color=col)
        ax.set_xlabel("$x$"); ax.set_ylabel(r"$v/\omega$")
        r = energy(xs[-1], vs[-1]) / energy(1.0, 0.0)
        ax.text(0.03, 0.03, f"$E/E_0={r:.3g}$", transform=ax.transAxes, fontsize=14)
    fig.tight_layout()
    save(fig, out("integrators-phase"))


def fig_energy():
    steps = 2000
    t = np.arange(steps + 1) * h
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 4.8))
    for name, f, col in INTEG:
        xs, vs = run_verlet(steps) if f is None else run(f, steps)
        e = energy(xs, vs) / energy(1.0, 0.0)
        ls = ":" if name == "Verlet" else "-"
        a1.semilogy(t, e, ls, color=col, label=name, lw=2.4)
        print(f"  {name:16s} E/E0 at 20 s = {e[-1]:.4g}")
        if name in ("symplectic Euler", "Verlet"):
            a2.plot(t, e, ls, color=col, label=name, lw=1.6)
    a1.semilogy(t, 1.01 ** (t / h), color=C["dark"], lw=1, ls="--", label=r"$1.01^{n}$")
    a1.set_xlabel("$t$ (s)"); a1.set_ylabel("$E/E_0$"); a1.set_ylim(1e-10, 1e10)
    a1.legend(fontsize=13, loc="lower left", ncol=2)
    a2.axhline(1, color=C["gray"], lw=1)
    a2.set_xlabel("$t$ (s)"); a2.set_ylabel("$E/E_0$"); a2.set_xlim(0, 2)
    a2.legend(fontsize=13, loc="lower right")
    fig.tight_layout()
    save(fig, out("integrators-energy"))


def fig_eigen():
    x = np.linspace(0.001, 3, 600)                   # omega * dt
    exp = np.sqrt(1 + x**2)
    imp = 1 / np.sqrt(1 + x**2)
    tr = 2 - x**2                                    # symplectic Euler: trace, det = 1
    disc = np.sqrt(np.maximum(tr**2 - 4, 0))
    sym = np.where(np.abs(tr) <= 2, 1.0, np.abs((np.abs(tr) + disc) / 2))
    fig, ax = plt.subplots(figsize=(9, 4.8))
    ax.plot(x, exp, color=C["x"], label="explicit Euler")
    ax.plot(x, imp, color=C["z"], label="implicit Euler")
    ax.plot(x, sym, color=C["y"], label="symplectic Euler / Verlet")
    ax.axvline(0.1, color=C["gray"], ls=":", lw=1.5)
    ax.text(0.13, 1.85, r"$\omega\Delta t=0.1$", color=C["gray"], fontsize=13)
    ax.axvline(2, color=C["gray"], ls="--", lw=1.5)
    ax.text(2.05, 0.3, r"$\omega\Delta t=2$", color=C["gray"], fontsize=13)
    ax.set_xlabel(r"$\omega\,\Delta t$"); ax.set_ylabel(r"$\max|\lambda(\mathbf{A})|$")
    ax.set_xlim(0, 3); ax.set_ylim(0, 3)
    ax.legend(fontsize=13, loc="upper left")
    save(fig, out("integrators-eigen"))


# ---------------------------------------------------------------------------
# Section 3: mass-spring topology
# ---------------------------------------------------------------------------
def fig_topology():
    n = 5
    P = lambda a, b: np.array([a, -b], float)
    kinds = [
        ([((a, b), (a + 1, b)) for b in range(n) for a in range(n - 1)]
         + [((a, b), (a, b + 1)) for b in range(n - 1) for a in range(n)], C["a"]),
        ([((a, b), (a + 1, b + 1)) for b in range(n - 1) for a in range(n - 1)]
         + [((a + 1, b), (a, b + 1)) for b in range(n - 1) for a in range(n - 1)], C["b"]),
        ([((a, b), (a + 2, b)) for b in range(n) for a in range(n - 2)]
         + [((a, b), (a, b + 2)) for b in range(n - 2) for a in range(n)], C["c"]),
    ]
    titles = [
        dict(en="structural (stretch)", zh="结构弹簧（拉伸）", ja="構造バネ（伸び）"),
        dict(en="shear", zh="剪切弹簧", ja="せん断バネ"),
        dict(en="bending", zh="弯曲弹簧", ja="曲げバネ"),
    ]
    for lang in LANGS:
        fig, axs = plt.subplots(1, 3, figsize=(13, 4.8))
        for ax, (edges, col), tt in zip(axs, kinds, titles):
            gi, gj = np.meshgrid(range(n), range(n))
            for (pa, pb) in edges:
                A, B = P(*pa), P(*pb)
                if abs(pa[0] - pb[0]) == 2 or abs(pa[1] - pb[1]) == 2:
                    # bending springs drawn as arcs so they do not hide the structural edges
                    mid = (A + B) / 2
                    nrm = np.array([-(B - A)[1], (B - A)[0]]) / np.linalg.norm(B - A)
                    s = 1 if (pa[0] if pa[1] == pb[1] else pa[1]) % 2 == 0 else -1
                    tt_ = np.linspace(0, 1, 30)[:, None]
                    curve = (1 - tt_) ** 2 * A + 2 * (1 - tt_) * tt_ * (mid + s * 0.35 * nrm) + tt_**2 * B
                    ax.plot(curve[:, 0], curve[:, 1], color=col, lw=1.8)
                else:
                    ax.plot([A[0], B[0]], [A[1], B[1]], color=col, lw=2.4)
            ax.plot(gi.ravel(), -gj.ravel(), "o", color=C["dark"], ms=7, zorder=5)
            ax.set_title(f"{label(lang, **tt)}  ({len(edges)})", color=col)
            ax.set_aspect("equal"); ax.axis("off")
            ax.set_xlim(-0.6, n - 0.4); ax.set_ylim(-n + 0.4, 0.6)
        fig.tight_layout()
        save(fig, OUT / f"07-cloth-springs_{lang}.svg")


# ---------------------------------------------------------------------------
# Section 4: PBD projection of one distance constraint
# ---------------------------------------------------------------------------
def fig_projection():
    L0 = 1.0
    pa0, pb0 = np.array([1.55, 0.95]), np.array([0.0, 0.0])
    cases = [(1.0, 1.0, r"$w_a=w_b$"), (3.0, 1.0, r"$w_a=3\,w_b$"), (1.0, 0.0, r"$w_b=0$")]
    fig, axs = plt.subplots(1, 3, figsize=(15, 5.2))
    for ax, (wa, wb, title) in zip(axs, cases):
        d = pa0 - pb0; L = np.linalg.norm(d); nh = d / L; C_ = L - L0
        dpa = -wa / (wa + wb) * C_ * nh
        dpb = +wb / (wa + wb) * C_ * nh
        pa, pb = pa0 + dpa, pb0 + dpb
        assert np.isclose(np.linalg.norm(pa - pb), L0)
        ax.plot(*zip(pb0, pa0), color=C["gray"], lw=2, ls="--")
        ax.plot(*zip(pb, pa), color=C["a"], lw=4, solid_capstyle="round")
        for p0, p, nm, wv in [(pa0, pa, "a", wa), (pb0, pb, "b", wb)]:
            ax.plot(*p0, "o", mfc="white", mec=C["gray"], ms=12, mew=2)
            ax.plot(*p, "o", color=C["dark"] if wv > 0 else C["x"], ms=12)
            if np.linalg.norm(p - p0) > 1e-6:
                ax.annotate("", xy=p, xytext=p0, arrowprops=dict(arrowstyle="-|>", color=C["b"], lw=2.6, mutation_scale=20))
                mid = (p + p0) / 2 + np.array([0.12, -0.12])
                ax.text(*mid, rf"$\Delta\mathbf{{p}}_{nm}$", color=C["b"], fontsize=16)
        ax.text(*(pa0 + [0.08, 0.06]), r"$\mathbf{p}_a$", fontsize=16)
        ax.text(*(pb0 + [-0.32, 0.08]), r"$\mathbf{p}_b$", fontsize=16)
        # unit normal at b
        ax.annotate("", xy=pb0 + 0.45 * nh + [0.15, -0.35], xytext=pb0 + [0.15, -0.35],
                    arrowprops=dict(arrowstyle="-|>", color=C["z"], lw=2.2))
        ax.text(*(pb0 + 0.25 * nh + [0.3, -0.45]), r"$\hat{\mathbf{n}}$", color=C["z"], fontsize=16)
        # mass-weighted centre (only defined when both masses are finite)
        if wa > 0 and wb > 0:
            ma, mb = 1 / wa, 1 / wb
            c0 = (ma * pa0 + mb * pb0) / (ma + mb); c1 = (ma * pa + mb * pb) / (ma + mb)
            assert np.allclose(c0, c1)
            ax.plot(*c0, "x", color=C["y"], ms=14, mew=3)
        ax.set_title(title + rf"$:\ \ {wa / (wa + wb):.2f}\,C\ /\ {wb / (wa + wb):.2f}\,C$", fontsize=15)
        ax.set_aspect("equal"); ax.set_xlim(-0.5, 2.0); ax.set_ylim(-0.75, 1.25)
        ax.axis("off")
    fig.tight_layout()
    save(fig, out("pbd-projection"))


# ---------------------------------------------------------------------------
# Section 6: the post's NumPy XPBD cloth (verbatim)
# ---------------------------------------------------------------------------
def make_cloth(n=20, size=1.0, mass=0.2):
    i, j = np.meshgrid(np.arange(n), np.arange(n), indexing="xy")
    x = np.stack([i.ravel() / (n - 1) * size - size / 2,
                  -j.ravel() / (n - 1) * size,
                  np.zeros(n * n)], axis=1)
    w = np.full(n * n, n * n / mass)
    w[[0, n - 1]] = 0.0
    pid = lambda a, b: b * n + a
    cons, kind = [], []
    for b in range(n):
        for a in range(n):
            if a + 1 < n: cons.append((pid(a, b), pid(a + 1, b))); kind.append(0)
            if b + 1 < n: cons.append((pid(a, b), pid(a, b + 1))); kind.append(0)
            if a + 1 < n and b + 1 < n:
                cons += [(pid(a, b), pid(a + 1, b + 1)), (pid(a + 1, b), pid(a, b + 1))]; kind += [1, 1]
            if a + 2 < n: cons.append((pid(a, b), pid(a + 2, b))); kind.append(2)
            if b + 2 < n: cons.append((pid(a, b), pid(a, b + 2))); kind.append(2)
    cons, kind = np.array(cons), np.array(kind)
    rest = np.linalg.norm(x[cons[:, 0]] - x[cons[:, 1]], axis=1)
    return x, np.zeros_like(x), w, cons, kind, rest


def color_constraints(cons, num_particles):
    used = [set() for _ in range(num_particles)]
    color = np.empty(len(cons), dtype=int)
    for c, (a, b) in enumerate(cons):
        k_ = 0
        while k_ in used[a] or k_ in used[b]:
            k_ += 1
        color[c] = k_
        used[a].add(k_); used[b].add(k_)
    return [np.flatnonzero(color == k_) for k_ in range(color.max() + 1)]


SPHERE = (np.array([0.0, -0.7, 0.2]), 0.25)


def xpbd_substep(x, v, w, cons, rest, alpha, colors, h, iters=1,
                 g=np.array([0.0, -9.81, 0.0]), sphere=SPHERE, pbd_k=None):
    """The post's substep. pbd_k (not in the post) switches to original PBD with a stiffness
    factor k: alpha is ignored and each correction is scaled by k (used for the comparison)."""
    free = w > 0
    x_prev = x.copy()
    v[free] += h * g
    x[free] += h * v[free]
    lam = np.zeros(len(cons))
    alpha_t = alpha / h**2
    for _ in range(iters):
        for c in colors:
            a, b = cons[c, 0], cons[c, 1]
            d = x[a] - x[b]
            L = np.linalg.norm(d, axis=1)
            nrm = d / np.maximum(L, 1e-12)[:, None]
            C_ = L - rest[c]
            if pbd_k is None:
                denom = w[a] + w[b] + alpha_t[c]
                dlam = np.where(denom > 0, (-C_ - alpha_t[c] * lam[c]) / np.maximum(denom, 1e-12), 0.0)
            else:
                denom = w[a] + w[b]
                dlam = np.where(denom > 0, -pbd_k * C_ / np.maximum(denom, 1e-12), 0.0)
            lam[c] += dlam
            x[a] += (w[a] * dlam)[:, None] * nrm
            x[b] -= (w[b] * dlam)[:, None] * nrm
    center, r = sphere
    d = x - center
    dist = np.linalg.norm(d, axis=1)
    hit = free & (dist < r)
    x[hit] = center + d[hit] / dist[hit, None] * r
    v[:] = (x - x_prev) / h
    v[~free] = 0.0
    return x, v


def stretch_of(x, cons, rest):
    return np.linalg.norm(x[cons[:, 0]] - x[cons[:, 1]], axis=1) / rest


N_CLOTH, FRAME_DT, SUBSTEPS = 20, 1 / 60, 15
H_SUB = FRAME_DT / SUBSTEPS


def simulate(compliance, frames, iters=1, pbd_k=None, snapshots=()):
    x, v, w, cons, kind, rest = make_cloth(N_CLOTH)
    alpha = np.where(kind == 2, 1e-1, np.where(kind == 1, 4 * compliance, compliance))
    colors = color_constraints(cons, len(x))
    snaps = {0: x.copy()} if 0 in snapshots else {}
    for frame in range(1, frames + 1):
        for _ in range(SUBSTEPS):
            xpbd_substep(x, v, w, cons, rest, alpha, colors, H_SUB, iters=iters, pbd_k=pbd_k)
        if frame in snapshots:
            snaps[frame] = x.copy()
    return x, cons, kind, rest, colors, snaps


def sphere_mesh(c, r, nu=28, nv=16):
    u, vv = np.meshgrid(np.linspace(0, 2 * np.pi, nu), np.linspace(0, np.pi, nv))
    return c[0] + r * np.cos(u) * np.sin(vv), c[1] + r * np.cos(vv), c[2] + r * np.sin(u) * np.sin(vv)


def fig_drape():
    frames = [0, 15, 30, 45, 90, 180]
    x, cons, kind, rest, colors, snaps = simulate(1e-4, max(frames), snapshots=frames)
    st = cons[kind == 0]
    fig = plt.figure(figsize=(12, 8.6))
    for idx, fr in enumerate(frames):
        # camera on the -z side: the cloth is pushed toward -z by the sphere, so it is always in front
        ax = fig.add_subplot(2, 3, idx + 1, projection="3d", computed_zorder=False)
        X = snaps[fr]
        sx, sy, sz = sphere_mesh(*SPHERE)
        ax.plot_surface(sx, sy, sz, color=C["b"], alpha=0.8, linewidth=0, shade=True, zorder=0)
        segs = np.stack([X[st[:, 0]], X[st[:, 1]]], 1)
        for s in segs:
            ax.plot(*s.T, color=C["a"], lw=0.9, zorder=2)
        ax.scatter(*X[[0, N_CLOTH - 1]].T, color=C["x"], s=40, depthshade=False, zorder=3)
        ax.view_init(elev=15, azim=150, vertical_axis="y")
        ax.set_xlim(-0.6, 0.6); ax.set_ylim(-1.1, 0.1); ax.set_zlim(-0.85, 0.35)
        ax.set_box_aspect((1, 1, 1))
        ax.set_xlabel("$x$", labelpad=-8); ax.set_ylabel("$y$", labelpad=-8); ax.set_zlabel("$z$", labelpad=-8)
        ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
        ax.set_title(f"$t={fr * FRAME_DT:.2f}$ s", pad=-4)
    fig.subplots_adjust(left=0, right=1, top=0.95, bottom=0.02, wspace=0.0, hspace=0.08)
    save(fig, out("cloth-drape"))


def fig_stretch_map():
    fig, axs = plt.subplots(1, 3, figsize=(15, 5.6))
    cmap = plt.get_cmap("viridis")
    vmax = 1.20
    for ax, comp, title in zip(axs, [0.0, 1e-4, 1e-2], [r"$\alpha=0$", r"$\alpha=10^{-4}$", r"$\alpha=10^{-2}$"]):
        x, cons, kind, rest, colors, _ = simulate(comp, 180)
        st = cons[kind == 0]
        s = stretch_of(x, st, rest[kind == 0])
        print(f"  alpha={comp:g}: mean {s.mean():.4f} max {s.max():.4f} lowest y {x[:, 1].min():.3f}")
        lc = LineCollection(np.stack([x[st[:, 0], :2], x[st[:, 1], :2]], 1), array=s, cmap=cmap, lw=2.6)
        lc.set_clim(1.0, vmax)
        ax.add_collection(lc)
        c, r = SPHERE
        ax.add_patch(plt.Circle(c[:2], r, color=C["b"], alpha=0.25, zorder=0))
        ax.plot(*x[[0, N_CLOTH - 1], :2].T, "o", color=C["x"], ms=8)
        ax.set_title(title + f"   max {s.max():.3f}", fontsize=15)
        ax.set_aspect("equal"); ax.set_xlim(-0.65, 0.65); ax.set_ylim(-1.1, 0.08)
        ax.set_xlabel("$x$")
    axs[0].set_ylabel("$y$")
    fig.tight_layout()
    cb = fig.colorbar(lc, ax=axs, shrink=0.8, pad=0.015)
    cb.set_label(r"$\ell/\ell_0$")
    save(fig, out("cloth-stretch"))


def fig_iterations():
    its = [1, 2, 4, 8, 16]
    fr = 120                                          # 2 s, as in the post
    xp, pb = [], []
    for it in its:
        x, cons, kind, rest, _, _ = simulate(1e-2, fr, iters=it)
        xp.append(stretch_of(x, cons[kind == 0], rest[kind == 0]).max())
        x, cons, kind, rest, _, _ = simulate(0.0, fr, iters=it, pbd_k=0.25)
        pb.append(stretch_of(x, cons[kind == 0], rest[kind == 0]).max())
    print("  XPBD alpha=1e-2 max stretch vs iters", dict(zip(its, np.round(xp, 3))))
    print("  PBD k=0.25 max stretch vs iters", dict(zip(its, np.round(pb, 3))))
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 5))
    n_ = np.arange(1, 33)
    for kk, col in zip([0.05, 0.25, 0.5], [C["c"], C["b"], C["x"]]):
        a1.plot(n_, 1 - (1 - kk) ** n_, "o-", ms=3, color=col, label=f"$k={kk}$")
    a1.set_xscale("log", base=2); a1.set_xticks([1, 2, 4, 8, 16, 32]); a1.set_xticklabels(["1", "2", "4", "8", "16", "32"])
    a1.set_xlabel("$n$"); a1.set_ylabel(r"$1-(1-k)^n$"); a1.set_ylim(0, 1.05)
    a1.legend(fontsize=13, loc="lower right")
    a2.plot(its, xp, "o-", color=C["a"], ms=8, label=r"XPBD, $\alpha=10^{-2}$")
    a2.plot(its, pb, "s-", color=C["b"], ms=8, label="PBD, $k=0.25$")
    for i_, v_ in zip(its, xp):
        a2.text(i_, v_ - 0.022, f"{v_:.3f}", ha="center", color=C["a"], fontsize=13)
    a2.set_xscale("log", base=2); a2.set_xticks(its); a2.set_xticklabels([str(i) for i in its])
    a2.set_xlabel("iters"); a2.set_ylabel(r"max $\ell/\ell_0$")
    a2.set_ylim(0.98, 1.24)
    a2.legend(fontsize=13, loc="center right")
    fig.tight_layout()
    save(fig, out("pbd-vs-xpbd"))


def fig_coloring():
    n = 6
    x, v, w, cons, kind, rest = make_cloth(n)
    colors = color_constraints(cons, len(x))
    _, _, _, cons20, _, _ = make_cloth(20)
    colors20 = color_constraints(cons20, 400)
    print(f"  n=6: {len(colors)} colors, n=20: {len(colors20)} colors, {len(cons20)} constraints")
    pal = plt.get_cmap("tab20")(np.linspace(0, 1, 20))
    fig, axs = plt.subplots(2, 4, figsize=(14, 7.6))
    for k_, ax in enumerate(axs.ravel()[:7]):
        ax.plot(x[:, 0], x[:, 1], "o", color="#cccccc", ms=5)
        for a, b in cons[colors[k_]]:
            A, B = x[a, :2], x[b, :2]
            if np.isclose(np.linalg.norm(A - B), 2 / (n - 1)):     # bending: draw as an arc
                mid = (A + B) / 2; d = B - A
                off = np.array([-d[1], d[0]]) * 0.18
                tt = np.linspace(0, 1, 20)[:, None]
                cur = (1 - tt) ** 2 * A + 2 * (1 - tt) * tt * (mid + off) + tt**2 * B
                ax.plot(cur[:, 0], cur[:, 1], color=pal[k_ % 20], lw=2.2)
            else:
                ax.plot([A[0], B[0]], [A[1], B[1]], color=pal[k_ % 20], lw=2.6)
            ax.plot(*np.array([A, B]).T, "o", color=C["dark"], ms=4)
        ax.set_title(f"$k={k_}$  ({len(colors[k_])})", fontsize=14)
        ax.set_aspect("equal"); ax.axis("off")
    ax = axs.ravel()[7]
    ax.bar(range(len(colors20)), [len(c) for c in colors20], color=[pal[i % 20] for i in range(len(colors20))])
    ax.set_xlabel("$k$  ($n=20$)"); ax.set_title(f"{len(cons20)} / {len(colors20)}", fontsize=14)
    fig.tight_layout()
    save(fig, out("graph-coloring"))


# ---------------------------------------------------------------------------
# Section 7: collision projection onto a sphere (2D cross-section through the centre)
# ---------------------------------------------------------------------------
def fig_collision():
    c, r = np.array([0.0, 0.0]), 1.0
    rng = np.random.default_rng(3)
    fig, ax = plt.subplots(figsize=(9, 6))
    th = np.linspace(0, 2 * np.pi, 300)
    ax.fill(r * np.cos(th), r * np.sin(th), color=C["b"], alpha=0.18)
    ax.plot(r * np.cos(th), r * np.sin(th), color=C["b"], lw=2.4)
    ax.plot(*c, "+", color=C["b"], ms=14, mew=2.5)
    ax.text(0.05, -0.15, r"$\mathbf{c}$", color=C["b"], fontsize=17)
    ax.annotate("", xy=(r * np.cos(-2.4), r * np.sin(-2.4)), xytext=c,
                arrowprops=dict(arrowstyle="-", color=C["b"], lw=1.5, ls="--"))
    ax.text(-0.5, -0.32, "$r$", color=C["b"], fontsize=17)
    v_fall = np.array([0.18, -0.55])                       # predicted displacement over one substep
    for ang in np.linspace(0.35, 2.8, 6):
        xprev = (r + 0.18 + 0.1 * rng.random()) * np.array([np.cos(ang), np.sin(ang)]) - 0.0 * v_fall
        xpred = xprev + v_fall
        dist = np.linalg.norm(xpred - c)
        ax.plot(*xprev, "o", mfc="white", mec=C["gray"], ms=9, mew=2)
        ax.annotate("", xy=xpred, xytext=xprev, arrowprops=dict(arrowstyle="-|>", color=C["gray"], lw=1.6))
        if dist < r:
            xproj = c + (xpred - c) / dist * r
            ax.plot(*xpred, "o", color=C["x"], ms=8)
            ax.annotate("", xy=xproj, xytext=xpred, arrowprops=dict(arrowstyle="-|>", color=C["y"], lw=2.4))
            ax.plot(*xproj, "o", color=C["dark"], ms=9)
            ax.annotate("", xy=xproj + 0.9 * (xproj - xprev), xytext=xproj,
                        arrowprops=dict(arrowstyle="-|>", color=C["a"], lw=2.0, alpha=0.8))
        else:
            ax.plot(*xpred, "o", color=C["dark"], ms=9)
    handles = [
        Line2D([], [], marker="o", ls="", mfc="white", mec=C["gray"], ms=9, mew=2, label=r"$\mathbf{x}_{\rm prev}$"),
        Line2D([], [], marker="o", ls="", color=C["x"], ms=8, label=r"$\mathbf{p}$ ($C<0$)"),
        Line2D([], [], color=C["y"], lw=2.4, label=r"$\mathbf{c}+r\,(\mathbf{p}-\mathbf{c})/\Vert\mathbf{p}-\mathbf{c}\Vert$"),
        Line2D([], [], color=C["a"], lw=2.0, label=r"$\mathbf{v}=(\mathbf{x}-\mathbf{x}_{\rm prev})/h$"),
    ]
    ax.legend(handles=handles, fontsize=13, loc="lower right", framealpha=0.95)
    ax.set_aspect("equal"); ax.set_xlim(-2.2, 2.6); ax.set_ylim(-1.5, 1.6)
    ax.set_xticks([]); ax.set_yticks([])
    save(fig, out("sphere-collision"))


# ---------------------------------------------------------------------------
# Section 10: SPH kernels of Mueller et al. 2003 (3D normalisation, h = 1)
# ---------------------------------------------------------------------------
def fig_sph():
    hh = 1.0
    r = np.linspace(1e-4, hh, 800)
    poly6 = 315 / (64 * np.pi * hh**9) * (hh**2 - r**2) ** 3
    spiky = 15 / (np.pi * hh**6) * (hh - r) ** 3
    visc = 15 / (2 * np.pi * hh**3) * (-r**3 / (2 * hh**3) + r**2 / hh**2 + hh / (2 * r) - 1)
    for name, W in [("poly6", poly6), ("spiky", spiky), ("viscosity", visc)]:
        integral = np.trapezoid(W * 4 * np.pi * r**2, r)
        print(f"  {name:9s} integral over the ball = {integral:.4f}")
        assert abs(integral - 1) < 5e-3
    g_poly6 = 945 / (32 * np.pi * hh**9) * r * (hh**2 - r**2) ** 2   # |grad W|
    g_spiky = 45 / (np.pi * hh**6) * (hh - r) ** 2
    lap_visc = 45 / (np.pi * hh**6) * (hh - r)
    fig, axs = plt.subplots(1, 3, figsize=(15, 4.8))
    axs[0].plot(r, poly6, color=C["a"], label="poly6")
    axs[0].plot(r, spiky, color=C["b"], label="spiky")
    axs[0].plot(r, visc, color=C["c"], label="viscosity")
    axs[0].set_ylim(0, 5); axs[0].set_ylabel("$W(r,h)$")
    axs[1].plot(r, g_poly6, color=C["a"], label="poly6")
    axs[1].plot(r, g_spiky, color=C["b"], label="spiky")
    axs[1].set_ylabel(r"$\Vert\nabla W\Vert$")
    axs[2].plot(r, lap_visc, color=C["c"], label="viscosity")
    axs[2].set_ylabel(r"$\nabla^2 W$")
    for ax in axs:
        ax.set_xlabel("$r/h$"); ax.set_xlim(0, 1); ax.legend(fontsize=13)
    fig.tight_layout()
    save(fig, out("sph-kernels"))


if __name__ == "__main__":
    fig_phase()
    fig_energy()
    fig_eigen()
    fig_topology()
    fig_projection()
    fig_coloring()
    fig_collision()
    fig_sph()
    fig_drape()
    fig_stretch_map()
    fig_iterations()
