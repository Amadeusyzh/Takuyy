"""Figures for graphics post 01 (roadmap and math toolkit).

Run:  python3 bin/figures/graphics/graphics_01.py
Writes assets/img/blog/graphics/01-*.svg. Every number below comes from the post's own code
(vectors a, b, the TRS example, the Euler/Jacobian check, Rodrigues, slerp, look_at, normals).

Conventions: right-handed coordinates everywhere. Pure math figures draw z up (matplotlib's
default). The coordinate-space figure uses the OpenGL convention of the post (world y up,
camera looks down -z) and maps (x, y, z) -> (x, -z, y) for plotting, which is a proper rotation.
"""
import sys, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: F401,F403

import numpy as np
from matplotlib.patches import Polygon, FancyArrowPatch, Arc
from mpl_toolkits.mplot3d.art3d import Poly3DCollection, Line3DCollection

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/graphics"


# ---------------------------------------------------------------- helpers from the post
def translate(tx, ty, tz):
    M = np.eye(4); M[:3, 3] = [tx, ty, tz]; return M


def scale(sx, sy, sz):
    return np.diag([sx, sy, sz, 1.0])


def rotate_x(deg):
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    return np.array([[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1.0]])


def rotate_y(deg):
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    return np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1.0]])


def rotate_z(deg):
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    return np.array([[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1.0]])


def euler_zyx(yaw, pitch, roll):
    return rotate_z(yaw) @ rotate_y(pitch) @ rotate_x(roll)


def jac_rank(yaw, pitch, roll, h=1e-4):
    f = lambda e: euler_zyx(*e)[:3, :3].ravel()
    e0 = np.array([yaw, pitch, roll], dtype=float)
    J = np.stack([(f(e0 + h * d) - f(e0 - h * d)) / (2 * h) for d in np.eye(3)], axis=1)
    return np.linalg.matrix_rank(J, tol=1e-6)


def skew(k):
    return np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])


def rodrigues(axis, angle):
    k = axis / np.linalg.norm(axis)
    K = skew(k)
    return np.eye(3) + np.sin(angle) * K + (1 - np.cos(angle)) * (K @ K)


def q_from_axis_angle(axis, angle):
    k = axis / np.linalg.norm(axis)
    return np.concatenate([[np.cos(angle / 2)], np.sin(angle / 2) * k])


def slerp(q0, q1, t):
    d = q0 @ q1
    if d < 0:
        q1, d = -q1, -d
    if d > 0.9995:
        q = q0 + t * (q1 - q0)
        return q / np.linalg.norm(q)
    omega = np.arccos(d)
    return (np.sin((1 - t) * omega) * q0 + np.sin(t * omega) * q1) / np.sin(omega)


def look_at(eye, target, up):
    f = target - eye; f = f / np.linalg.norm(f)
    r = np.cross(f, up); r = r / np.linalg.norm(r)
    u = np.cross(r, f)
    V = np.eye(4)
    V[0, :3], V[1, :3], V[2, :3] = r, u, -f
    V[:3, 3] = -V[:3, :3] @ eye
    return V


def perspective(fovy_deg, aspect, n, f):  # post 02's matrix
    t = 1.0 / np.tan(np.radians(fovy_deg) / 2)
    return np.array([[t / aspect, 0, 0, 0], [0, t, 0, 0],
                     [0, 0, (f + n) / (n - f), 2 * f * n / (n - f)], [0, 0, -1, 0]])


def normalize(v):
    return v / np.linalg.norm(v)


# ---------------------------------------------------------------- drawing helpers
def arrow2d(ax, p, v, color, lw=2.6, text=None, off=(0.0, 0.0), fs=17, z=5, ls="-"):
    a = FancyArrowPatch(p, (p[0] + v[0], p[1] + v[1]), arrowstyle="-|>", mutation_scale=20,
                        color=color, lw=lw, zorder=z, linestyle=ls, shrinkA=0, shrinkB=0)
    ax.add_patch(a)
    if text:
        ax.text(p[0] + v[0] + off[0], p[1] + v[1] + off[1], text, color=color, fontsize=fs,
                ha="center", va="center", zorder=z + 1)


def clean3d(ax, elev=22, azim=-60):
    ax.view_init(elev=elev, azim=azim)
    ax.set_proj_type("ortho")
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
    for a in (ax.xaxis, ax.yaxis, ax.zaxis):
        a.pane.set_facecolor((0.97, 0.97, 0.97, 1.0))
        a.pane.set_edgecolor((0.85, 0.85, 0.85, 1.0))
        a._axinfo["grid"]["color"] = (0.85, 0.85, 0.85, 1.0)


def basis3d(ax, L, names=("x", "y", "z"), lw=1.6, origin=(0, 0, 0), alpha=1.0):
    for i, (c, n) in enumerate(zip((C["x"], C["y"], C["z"]), names)):
        v = [0, 0, 0]; v[i] = L
        ax.quiver(*origin, *v, color=c, linewidth=lw, arrow_length_ratio=0.1, alpha=alpha)
        e = np.array(origin, float) + np.array(v) * 1.1
        ax.text(*e, f"${n}$", color=c, fontsize=15, ha="center", va="center", alpha=alpha)


def circle3d(center, normal, radius, n=200):
    normal = normalize(np.asarray(normal, float))
    a = normalize(np.cross(normal, [1, 0, 0] if abs(normal[0]) < 0.9 else [0, 1, 0]))
    b = np.cross(normal, a)
    t = np.linspace(0, 2 * np.pi, n)
    return center + radius * (np.outer(np.cos(t), a) + np.outer(np.sin(t), b))


def arc3d(center, u, v, angle, radius, n=60):
    """Arc from direction u towards v (in the plane of u, v) spanning `angle`."""
    u = normalize(u); w = normalize(v - (v @ u) * u)
    t = np.linspace(0, angle, n)
    return center + radius * (np.outer(np.cos(t), u) + np.outer(np.sin(t), w))


# ================================================================ 1. dot product
def fig_dot():
    a = np.array([1.0, 2.0, 2.0]); b = np.array([3.0, 0.0, 4.0])
    bh = normalize(b)
    proj = (a @ bh) * bh  # (1.32, 0, 1.76)
    theta = np.arccos(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))

    fig = plt.figure(figsize=(9, 7.2))
    ax = fig.add_subplot(projection="3d")
    clean3d(ax, elev=20, azim=18)
    lim = 4.2
    ax.set_xlim(0, lim); ax.set_ylim(0, lim); ax.set_zlim(0, lim); ax.set_box_aspect((1, 1, 1))
    basis3d(ax, 3.8)
    # component boxes for a
    for p, q in [((1, 0, 0), (1, 2, 0)), ((0, 2, 0), (1, 2, 0)), ((1, 2, 0), (1, 2, 2))]:
        ax.plot(*zip(p, q), color=C["a"], lw=1.0, ls=":", alpha=0.8)
    ax.plot(*zip((3, 0, 0), (3, 0, 4)), color=C["b"], lw=1.0, ls=":", alpha=0.8)
    ax.plot(*zip((0, 0, 4), (3, 0, 4)), color=C["b"], lw=1.0, ls=":", alpha=0.8)
    arrow3d(ax, (0, 0, 0), a, C["a"], lw=3.2)
    arrow3d(ax, (0, 0, 0), b, C["b"], lw=3.2)
    ax.text(*(a * 1.08 + [0, 0, 0.15]), r"$\mathbf{a}=(1,2,2)$", color=C["a"], fontsize=17)
    ax.text(*(b * 1.0 + [0.3, 0, 0.15]), r"$\mathbf{b}=(3,0,4)$", color=C["b"], fontsize=17)
    # projection ("shadow") on b and the perpendicular drop
    ax.plot(*zip((0, 0, 0), proj), color=C["dark"], lw=6, alpha=0.55, solid_capstyle="butt")
    ax.plot(*zip(a, proj), color=C["gray"], lw=1.8, ls="--")
    # right-angle mark at proj
    d1 = normalize(a - proj) * 0.22; d2 = -bh * 0.22
    sq = np.array([proj + d1, proj + d1 + d2, proj + d2])
    ax.plot(*sq.T, color=C["gray"], lw=1.4)
    arc = arc3d(np.zeros(3), b, a, theta, 1.15)
    ax.plot(*arc.T, color=C["dark"], lw=1.8)
    mid = arc3d(np.zeros(3), b, a, theta / 2, 1.45)[-1]
    ax.text(*mid, r"$\theta$", fontsize=18, ha="center")
    ax.text(*(proj * 0.5 + np.array([1.6, 0, -0.1])),
            r"$(\mathbf{a}\cdot\hat{\mathbf{b}})\,\hat{\mathbf{b}}$", fontsize=17, color=C["dark"])
    fig.text(0.5, 0.06, r"$\mathbf{a}\cdot\mathbf{b}=1\cdot3+2\cdot0+2\cdot4=11,\quad \|\mathbf{a}\|=3,\ \|\mathbf{b}\|=5,\quad \cos\theta=\frac{11}{15}$",
             ha="center", fontsize=16)
    fig.text(0.5, 0.0, rf"$\theta={np.degrees(theta):.2f}^\circ,\quad \mathbf{{a}}\cdot\hat{{\mathbf{{b}}}}=\frac{{11}}{{5}}=2.2,\quad (\mathbf{{a}}\cdot\hat{{\mathbf{{b}}}})\,\hat{{\mathbf{{b}}}}=({proj[0]:.2f},\,0,\,{proj[2]:.2f})$",
             ha="center", fontsize=16)
    save(fig, OUT / "01-dot-product.svg")


# ================================================================ 2. cross product
def fig_cross():
    p0, p1, p2 = np.array([0., 0, 0]), np.array([1., 0, 0]), np.array([0., 1, 0])
    q = np.array([0.2, 0.2, 0.5])
    fig = plt.figure(figsize=(10.5, 5.6))
    for k, (order, title) in enumerate([((p0, p1, p2), r"$(\mathbf{p}_1-\mathbf{p}_0)\times(\mathbf{p}_2-\mathbf{p}_0)=(0,0,1)$"),
                                        ((p0, p2, p1), r"$(\mathbf{p}_2-\mathbf{p}_0)\times(\mathbf{p}_1-\mathbf{p}_0)=(0,0,-1)$")]):
        ax = fig.add_subplot(1, 2, k + 1, projection="3d")
        clean3d(ax, elev=24, azim=-55)
        ax.set_xlim(-0.3, 1.3); ax.set_ylim(-0.3, 1.3); ax.set_zlim(-1.0, 1.2); ax.set_box_aspect((1, 1, 1.4))
        a, b = order[1] - order[0], order[2] - order[0]
        c = np.cross(a, b)
        par = np.array([p0, a, a + b, b])  # parallelogram: area |c|; triangle: |c| / 2
        ax.add_collection3d(Poly3DCollection([par], facecolor=C["fill"], edgecolor=C["gray"], lw=1, ls="--", alpha=0.5))
        ax.add_collection3d(Poly3DCollection([[p0, p1, p2]], facecolor=C["a"], alpha=0.35, edgecolor=C["a"], lw=1.5))
        arrow3d(ax, p0, a, C["x"], lw=3)
        arrow3d(ax, p0, b, C["y"], lw=3)
        arrow3d(ax, p0, c, C["z"], lw=3.4)
        ax.text(*(a * 1.12), r"$\mathbf{a}$", color=C["x"], fontsize=18)
        ax.text(*(b * 1.12 + [0, 0.05, 0]), r"$\mathbf{b}$", color=C["y"], fontsize=18)
        ax.text(*(c * 1.12 + [0.05, 0, 0]), r"$\mathbf{n}=\mathbf{a}\times\mathbf{b}$", color=C["z"], fontsize=18)
        # winding order p0 -> p1 -> p2 (left) or p0 -> p2 -> p1 (right), seen from +z
        cen = (p0 + p1 + p2) / 3
        sgn = 1 if k == 0 else -1
        t = np.linspace(0.3, 2 * np.pi - 0.4, 80) * sgn
        ring = cen + 0.15 * np.stack([np.cos(t), np.sin(t), 0 * t], 1)
        ax.plot(*ring.T, color=C["dark"], lw=1.8)
        d = ring[-1] - ring[-4]
        ax.quiver(*ring[-1], *(d / np.linalg.norm(d) * 0.07), color=C["dark"], arrow_length_ratio=1.0, lw=1.8)
        for P, nm in zip((p0, p1, p2), (r"$\mathbf{p}_0$", r"$\mathbf{p}_1$", r"$\mathbf{p}_2$")):
            ax.scatter(*P, color=C["dark"], s=20)
            ax.text(*(P + np.array([-0.16, -0.16, -0.12])), nm, fontsize=15)
        ax.scatter(*q, color=C["b"], s=40, depthshade=False)
        ax.plot(*zip(q, [q[0], q[1], 0]), color=C["b"], lw=1.4, ls=":")
        side = (q - p0) @ c
        ax.text(*(q + [0.05, 0.05, 0.08]), rf"$(\mathbf{{q}}-\mathbf{{p}}_0)\cdot\mathbf{{n}}={side:+.1f}$",
                color=C["b"], fontsize=14)
        ax.set_title(title, fontsize=15)
    fig.text(0.5, 0.03, r"$\|\mathbf{a}\times\mathbf{b}\|=1$,   $\frac{1}{2}\|\mathbf{a}\times\mathbf{b}\|=0.5$,   $\mathbf{q}=(0.2,0.2,0.5)$",
             ha="center", fontsize=15)
    save(fig, OUT / "01-cross-product.svg")


# ================================================================ 3. linear maps
def fig_linear():
    th = np.radians(30)
    mats = [
        (np.eye(2), r"$A=I$"),
        (np.diag([2.0, 0.5]), r"$A=S=\mathrm{diag}(2,\,0.5)$"),
        (np.array([[1.0, 1.0], [0.0, 1.0]]), r"$A$: $x'=x+1\cdot y$"),
        (np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]]), r"$A=R(30^\circ)$"),
    ]
    fig, axs = plt.subplots(2, 2, figsize=(10, 9.6))
    g = np.arange(-2, 3)
    for ax, (A, title) in zip(axs.ravel(), mats):
        ax.set_aspect("equal"); ax.set_xlim(-3.2, 3.2); ax.set_ylim(-3.2, 3.2)
        ax.set_xticks(range(-3, 4)); ax.set_yticks(range(-3, 4))
        s = np.linspace(-2, 2, 50)
        for v in g:  # original grid (gray) and its image (purple)
            for line in (np.stack([s, 0 * s + v]), np.stack([0 * s + v, s])):
                ax.plot(*line, color=C["gray"], lw=0.8, alpha=0.35)
                ax.plot(*(A @ line), color=C["a"], lw=1.3, alpha=0.75)
        sq = np.array([[0, 0], [1, 0], [1, 1], [0, 1]]).T
        ax.add_patch(Polygon((A @ sq).T, closed=True, facecolor=C["fill"], edgecolor=C["a"], lw=1.6, alpha=0.9, zorder=3))
        arrow2d(ax, (0, 0), A[:, 0], C["x"], text=r"$A\mathbf{e}_x$", off=(0.3, -0.38))
        arrow2d(ax, (0, 0), A[:, 1], C["y"], text=r"$A\mathbf{e}_y$", off=(-0.25, 0.38))
        ax.set_title(title, fontsize=16)
        ax.text(-3.0, -2.95, rf"$A\mathbf{{e}}_x=({A[0,0]:.2f},{A[1,0]:.2f}),\ A\mathbf{{e}}_y=({A[0,1]:.2f},{A[1,1]:.2f}),\ \det A={np.linalg.det(A):.2f}$",
                fontsize=12.5, color=C["dark"], bbox=dict(fc="white", ec="none", alpha=0.85))
    fig.tight_layout()
    save(fig, OUT / "01-linear-maps.svg")


# ================================================================ 4. homogeneous coordinates
def fig_homogeneous():
    t = np.array([1.5, 1.0])
    H = np.array([[1, 0, t[0]], [0, 1, t[1]], [0, 0, 1.0]])
    for lang in LANGS:
        fig = plt.figure(figsize=(10, 8))
        ax = fig.add_subplot(projection="3d")
        clean3d(ax, elev=20, azim=-58)
        ax.set_xlim(-1, 3.2); ax.set_ylim(-1, 3.2); ax.set_zlim(0, 2.2); ax.set_box_aspect((1, 1, 0.6))
        ax.set_xlabel("$x$", labelpad=-10); ax.set_ylabel("$y$", labelpad=-10); ax.set_zlabel("$w$", labelpad=-10)
        for w, col, txt in [(0, C["gray"], label(lang, "directions", "方向", "方向")),
                            (1, C["a"], label(lang, "points", "点", "点"))]:
            P = np.array([[-1, -1, w], [3.2, -1, w], [3.2, 3.2, w], [-1, 3.2, w]])
            ax.add_collection3d(Poly3DCollection([P], facecolor=col, alpha=0.08, edgecolor=col, lw=0.8))
            ax.text(3.2, -1.0, w + 0.06, f"w = {w}: " + txt, color=col, fontsize=15)
        sq = np.array([[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], float)
        sq2 = (H @ sq.T).T
        ax.add_collection3d(Poly3DCollection([sq], facecolor=C["fill"], edgecolor=C["a"], lw=1.6, alpha=0.7))
        ax.add_collection3d(Poly3DCollection([sq2], facecolor=C["b"], edgecolor=C["b"], lw=1.6, alpha=0.35))
        for p, p2 in zip(sq, sq2):
            ax.quiver(*p, *(p2 - p), color=C["b"], lw=1.2, arrow_length_ratio=0.12, alpha=0.8)
        ax.text(*(sq2[2] + [0.1, 0.1, 0.1]), r"$H\mathbf{p}$", color=C["b"], fontsize=16)
        ax.text(*(sq[3] + [-0.3, 0.1, 0.1]), r"$\mathbf{p}$", color=C["a"], fontsize=16)
        d = np.array([1.0, 0.5, 0.0])  # a direction: H d = d
        arrow3d(ax, (0, 0, 0), d, C["z"], lw=3.2)
        ax.text(*(d + [0.3, -0.5, 0.0]), r"$H\mathbf{d}=\mathbf{d}$", color=C["z"], fontsize=16)
        p = sq2[0]  # projective ray: (2x, 2y, 2) ~ (x, y, 1)
        ax.plot(*np.stack([np.zeros(3), 2 * p]).T, color=C["dark"], lw=1.4, ls="--")
        ax.scatter(*p, color=C["dark"], s=30); ax.scatter(*(2 * p), color=C["dark"], s=30)
        ax.text(*(2 * p + [-0.1, 0, 0.12]), rf"$({2*p[0]:g},{2*p[1]:g},2)\sim({p[0]:g},{p[1]:g},1)$", fontsize=14, ha="right")
        for i, row in enumerate(("1  0  1.5", "0  1  1  ", "0  0  1  ")):
            ax.text2D(0.10, 0.95 - 0.045 * i, "[ " + row + " ]", transform=ax.transAxes, fontsize=15, family="monospace")
        ax.text2D(0.02, 0.905, r"$H=$", transform=ax.transAxes, fontsize=17)
        ax.text2D(0.02, 0.80, label(lang, "= a shear of (x, y, w)-space:", "= (x, y, w) 空间中的剪切：", "= (x, y, w) 空間のせん断："),
                  transform=ax.transAxes, fontsize=14)
        ax.text2D(0.02, 0.75, r"$x'=x+1.5\,w,\ \ y'=y+w$", transform=ax.transAxes, fontsize=15)
        save(fig, OUT / f"01-homogeneous_{lang}.svg")


# ================================================================ 5. TRS order
def fig_trs():
    # object: an asymmetric arrow-house (so rotation and mirroring are visible), in the xy-plane
    shape = np.array([[0, -0.5], [1, -0.5], [1, -0.2], [1.6, 0], [1, 0.2], [1, 0.5], [0, 0.5]], float)
    H = lambda M: (M @ np.c_[shape, np.zeros(len(shape)), np.ones(len(shape))].T).T[:, :2]
    T, R, S = translate(5, 0, 0), rotate_z(90), scale(2, 2, 2)
    p = np.array([1.0, 0, 0, 1])

    fig = plt.figure(figsize=(11, 10))
    gsp = fig.add_gridspec(2, 2, width_ratios=[1.25, 1])
    axs = [fig.add_subplot(gsp[0, 0]), fig.add_subplot(gsp[:, 1]), fig.add_subplot(gsp[1, 0])]
    cases = [
        (axs[0], [S, R @ S, T @ R @ S], ["S", "RS", "TRS"], r"$M=T\,R\,S$", T @ R @ S),
        (axs[1], [T, R @ T, S @ R @ T], ["T", "RT", "SRT"], r"$S\,R\,T$", S @ R @ T),
    ]
    for ax, steps, names, title, M in cases:
        ax.set_aspect("equal")
        ax.add_patch(Polygon(H(np.eye(4)), closed=True, facecolor=C["fill"], edgecolor=C["a"], lw=1.6))
        cols = [C["c"], C["b"], C["x"]]
        for Mk, nm, col in zip(steps, names, cols):
            ax.add_patch(Polygon(H(Mk), closed=True, facecolor=col, alpha=0.18 if Mk is not steps[-1] else 0.45,
                                 edgecolor=col, lw=1.6 if Mk is steps[-1] else 1.0, ls="-" if Mk is steps[-1] else "--"))
            c = H(Mk).mean(0)
            ax.text(c[0], c[1], nm, color=col, fontsize=14, ha="center", va="center", weight="bold")
        pp = np.round(M @ p, 9) + 0.0
        ax.plot(*pp[:2], "o", color=C["dark"], ms=7, zorder=6)
        ax.annotate(rf"$M\mathbf{{p}}=({pp[0]:g},{pp[1]:g})$", pp[:2], xytext=(10, 8), textcoords="offset points", fontsize=15)
        ax.plot(1, 0, "o", color=C["a"], ms=7, zorder=6)
        ax.annotate(r"$\mathbf{p}=(1,0)$", (1, 0), xytext=(-5, -24), textcoords="offset points", fontsize=14, color=C["a"])
        ax.set_title(title, fontsize=17)
        ax.axhline(0, color=C["gray"], lw=0.8); ax.axvline(0, color=C["gray"], lw=0.8)
    axs[0].set_xlim(-1.5, 7); axs[0].set_ylim(-1.5, 4.5)
    axs[1].set_xlim(-4.5, 8); axs[1].set_ylim(-1.5, 14)
    # rotation of T about the world origin in the wrong order: show the swing arc
    arc = np.linspace(0, np.pi / 2, 50)
    axs[1].plot(6 * np.cos(arc), 6 * np.sin(arc), color=C["b"], lw=1.4, ls=":")
    # pivot rotation
    ax = axs[2]; ax.set_aspect("equal")
    piv = translate(1, 1, 0) @ rotate_z(90) @ translate(-1, -1, 0)
    sq = np.array([[1, 1], [2, 1], [2, 1.5], [1, 1.5]])
    Hs = lambda M, P: (M @ np.c_[P, np.zeros(len(P)), np.ones(len(P))].T).T[:, :2]
    ax.add_patch(Polygon(sq, closed=True, facecolor=C["fill"], edgecolor=C["a"], lw=1.6))
    ax.add_patch(Polygon(Hs(piv, sq), closed=True, facecolor=C["x"], alpha=0.4, edgecolor=C["x"], lw=1.6))
    ax.add_patch(Polygon(Hs(rotate_z(90), sq), closed=True, facecolor=C["gray"], alpha=0.15, edgecolor=C["gray"], lw=1.0, ls="--"))
    ax.text(*Hs(rotate_z(90), sq).mean(0), r"$R$", ha="center", va="center", color=C["gray"], fontsize=15)
    ax.plot(1, 1, "s", color=C["dark"], ms=7); ax.annotate(r"$\mathbf{c}=(1,1)$", (1, 1), xytext=(6, -22), textcoords="offset points", fontsize=14)
    ax.plot(2, 1, "o", color=C["a"], ms=7); ax.annotate(r"$(2,1)$", (2, 1), xytext=(6, -18), textcoords="offset points", fontsize=14, color=C["a"])
    pp = np.round(piv @ np.array([2.0, 1, 0, 1]), 9) + 0.0
    ax.plot(*pp[:2], "o", color=C["x"], ms=7); ax.annotate(rf"$({pp[0]:g},{pp[1]:g})$", pp[:2], xytext=(8, 4), textcoords="offset points", fontsize=14, color=C["x"])
    a = np.linspace(0, np.pi / 2, 40)
    ax.plot(1 + np.cos(a), 1 + np.sin(a), color=C["x"], lw=1.4, ls=":")
    ax.axhline(0, color=C["gray"], lw=0.8); ax.axvline(0, color=C["gray"], lw=0.8)
    ax.set_xlim(-2, 3); ax.set_ylim(-0.5, 3); ax.set_title(r"$T(\mathbf{c})\,R\,T(-\mathbf{c})$", fontsize=17)
    fig.tight_layout()
    save(fig, OUT / "01-trs-order.svg")


# ================================================================ 6. gimbal lock
def fig_gimbal():
    fig = plt.figure(figsize=(10.5, 6.2))
    for k, pitch in enumerate((40, 90)):
        yaw, roll = 30, 10
        ax = fig.add_subplot(1, 2, k + 1, projection="3d")
        clean3d(ax, elev=18, azim=-50)
        ax.set_xlim(-1.1, 1.1); ax.set_ylim(-1.1, 1.1); ax.set_zlim(-1.1, 1.1); ax.set_box_aspect((1, 1, 1))
        Rz, Ry = rotate_z(yaw)[:3, :3], rotate_y(pitch)[:3, :3]
        R = euler_zyx(yaw, pitch, roll)[:3, :3]
        # rotation axes of the three nested gimbals for R = Rz(yaw) Ry(pitch) Rx(roll)
        axes = [(np.array([0, 0, 1.0]), 1.0, C["z"]),
                (Rz @ np.array([0, 1.0, 0]), 0.82, C["y"]),
                (Rz @ Ry @ np.array([1.0, 0, 0]), 0.64, C["x"])]
        for ax_dir, rad, col in axes:
            ring = circle3d(np.zeros(3), ax_dir, rad)
            ax.plot(*ring.T, color=col, lw=4.0, alpha=0.85)
            ax.quiver(0, 0, 0, *(ax_dir * (rad + 0.25)), color=col, lw=2.0, arrow_length_ratio=0.12)
        body = np.array([[0.45, 0, 0], [-0.3, 0, 0]])   # small airplane: nose +x, wings y, fin +z
        wing = np.array([[0, -0.3, 0], [0, 0.3, 0]])
        tail = np.array([[-0.3, 0, 0], [-0.3, 0, 0.15]])
        for seg, lw in ((body, 4), (wing, 4), (tail, 3)):
            ax.plot(*(R @ seg.T), color=C["dark"], lw=lw)
        ax.scatter(*(R @ np.array([0.45, 0, 0])), color=C["dark"], s=25)
        rk = jac_rank(yaw, pitch, roll)
        ax.set_title(rf"$(\psi,\theta,\phi)=(30^\circ,{pitch}^\circ,10^\circ)$" + "\n" + rf"$\mathrm{{rank}}\,J={rk}$", fontsize=17)
        ang = np.degrees(np.arccos(np.clip(axes[0][0] @ axes[2][0], -1, 1)))
        ax.text2D(0.03, 0.03, rf"$\angle(\mathbf{{z}},\ R_zR_y\,\mathbf{{x}})={ang:.0f}^\circ$",
                  transform=ax.transAxes, fontsize=15)
    from matplotlib.lines import Line2D
    hs = [Line2D([], [], color=C["z"], lw=4), Line2D([], [], color=C["y"], lw=4), Line2D([], [], color=C["x"], lw=4)]
    fig.legend(hs, [r"$R_z(\psi)$", r"$R_y(\theta)$", r"$R_x(\phi)$"], loc="lower center", ncol=3, frameon=False, fontsize=16)
    fig.subplots_adjust(bottom=0.1, wspace=0.02)
    save(fig, OUT / "01-gimbal-lock.svg")


# ================================================================ 7. Rodrigues
def fig_rodrigues():
    axis = np.array([1.0, 2, 3]); k = normalize(axis); theta = 0.7
    v = np.array([0.3, -1.0, 2.0])
    vpar = (k @ v) * k; vperp = v - vpar; kxv = np.cross(k, v)
    vrot = rodrigues(axis, theta) @ v
    assert np.allclose(vrot, v * np.cos(theta) + kxv * np.sin(theta) + k * (k @ v) * (1 - np.cos(theta)))
    # Draw in a rotated frame where k points up (a rigid rotation Q, so lengths and angles are exact);
    # the world axes are shown rotated by the same Q.
    z = np.array([0, 0, 1.0]); ax_q = np.cross(k, z)
    Q = rodrigues(ax_q, np.arccos(k @ z))
    T = lambda x: Q @ x

    fig = plt.figure(figsize=(9.5, 8.4))
    ax = fig.add_subplot(projection="3d")
    clean3d(ax, elev=32, azim=-70)
    ax.set_xlim(-2, 2); ax.set_ylim(-2, 2); ax.set_zlim(-0.6, 2.6); ax.set_box_aspect((1, 1, 0.8))
    for i, (c, nm) in enumerate(zip((C["x"], C["y"], C["z"]), "xyz")):
        e = np.zeros(3); e[i] = 0.8
        ax.quiver(0, 0, 0, *T(e), color=c, lw=1.4, alpha=0.55, arrow_length_ratio=0.12)
        ax.text(*(T(e) * 1.18), f"${nm}$", color=c, fontsize=14, alpha=0.8)
    ax.plot(*np.stack([-0.5 * z, 1.6 * z]).T, color=C["dark"], lw=1.2, ls="-.")
    arrow3d(ax, (0, 0, 1.6), z * 0.8, C["dark"], lw=3)
    ax.text(0, 0, 2.6, r"$\mathbf{k}$", fontsize=18, ha="center")
    t = np.linspace(0, 2 * np.pi, 200)
    e1 = normalize(T(vperp)); e2 = np.cross(z, e1); r = np.linalg.norm(vperp); c0 = T(vpar)
    ax.plot(*(c0 + r * (np.outer(np.cos(t), e1) + np.outer(np.sin(t), e2))).T, color=C["gray"], lw=1.2, ls=":")
    rot_perp = r * (np.cos(theta) * e1 + np.sin(theta) * e2)
    ax.plot(*np.stack([c0, c0 + rot_perp]).T, color=C["b"], lw=1.6, ls="--")
    tt = np.linspace(0, theta, 40)
    ax.plot(*(c0 + 0.5 * r * (np.outer(np.cos(tt), e1) + np.outer(np.sin(tt), e2))).T, color=C["dark"], lw=2.2)
    ax.text(*(c0 + 0.62 * r * (np.cos(theta / 2) * e1 + np.sin(theta / 2) * e2) + [0, 0, 0.08]), r"$\theta$", fontsize=18)
    arrow3d(ax, (0, 0, 0), T(v), C["a"], lw=3.2)
    ax.text(*(T(v) * 1.06 + [0, 0, 0.1]), r"$\mathbf{v}$", color=C["a"], fontsize=18)
    arrow3d(ax, (0, 0, 0), T(vrot), C["b"], lw=3.2)
    ax.text(*(T(vrot) * 1.08 + [0, 0, 0.1]), r"$\mathbf{v}_{\mathrm{rot}}$", color=C["b"], fontsize=18)
    arrow3d(ax, (0, 0, 0), c0, C["c"], lw=3.4)
    ax.text(*(c0 + [0.1, 0.1, 0.12]), r"$\mathbf{v}_\parallel=(\mathbf{k}\cdot\mathbf{v})\,\mathbf{k}$", color=C["c"], fontsize=16)
    arrow3d(ax, c0, r * e1, C["x"], lw=2.6)
    ax.text(*(c0 + r * e1 * 0.55 + [0, 0, -0.22]), r"$\mathbf{v}_\perp$", color=C["x"], fontsize=17)
    arrow3d(ax, c0, r * e2, C["y"], lw=2.6)
    ax.text(*(c0 + r * e2 * 1.1 + [0, 0, 0.08]), r"$\mathbf{k}\times\mathbf{v}$", color=C["y"], fontsize=17)
    ax.text2D(0.02, 0.96, r"$\mathbf{k}=(1,2,3)/\sqrt{14},\ \ \theta=0.7,\ \ \mathbf{v}=(0.3,-1,2)$", transform=ax.transAxes, fontsize=15)
    ax.text2D(0.02, 0.905, rf"$\mathbf{{v}}_{{\mathrm{{rot}}}}=({vrot[0]:.3f},\,{vrot[1]:.3f},\,{vrot[2]:.3f}),\ \ \|\mathbf{{k}}\times\mathbf{{v}}\|=\|\mathbf{{v}}_\perp\|={r:.3f}$",
              transform=ax.transAxes, fontsize=15)
    save(fig, OUT / "01-rodrigues.svg")


# ================================================================ 8. slerp vs nlerp
def fig_slerp():
    q0 = np.array([1.0, 0, 0, 0])
    q1 = q_from_axis_angle(np.array([0, 1.0, 0]), np.radians(120))
    ts = np.linspace(0, 1, 9)
    S = np.array([slerp(q0, q1, t) for t in ts])
    Lr = np.array([q0 + t * (q1 - q0) for t in ts])
    N = Lr / np.linalg.norm(Lr, axis=1, keepdims=True)
    tt = np.linspace(0, 1, 401)
    ang = lambda Q: np.degrees(2 * np.arccos(np.clip(Q[:, 0], -1, 1)))
    Sl = np.array([slerp(q0, q1, t) for t in tt])
    Nl = (q0 + tt[:, None] * (q1 - q0)); Nl /= np.linalg.norm(Nl, axis=1, keepdims=True)
    for lang in LANGS:
        fig, (a1, a2) = plt.subplots(1, 2, figsize=(11.5, 5.6))
        # q0 and q1 both lie in the (w, y) plane, so the great circle of S^3 through them is the unit circle there
        a1.set_aspect("equal")
        u = np.linspace(0, 2 * np.pi, 300)
        a1.plot(np.cos(u), np.sin(u), color=C["gray"], lw=1, alpha=0.6)
        a1.plot(*Lr[[0, -1]][:, [0, 2]].T, color=C["b"], lw=1.2, ls="--")
        for i in range(len(ts)):
            a1.plot([0, N[i, 0]], [0, N[i, 2]], color=C["b"], lw=0.8, alpha=0.5)
        a1.plot(Lr[:, 0], Lr[:, 2], "o", color=C["b"], ms=5, mfc="white", label="lerp")
        a1.plot(N[:, 0], N[:, 2], "o", color=C["b"], ms=8, label="nlerp")
        a1.plot(S[:, 0], S[:, 2], "o", color=C["a"], ms=13, mfc="none", mew=2.2, label="slerp")
        a1.annotate(r"$q_0=(1,0,0,0)$", (1, 0), xytext=(-20, -26), textcoords="offset points", fontsize=14)
        a1.annotate(r"$q_1=(\cos60^\circ,0,\sin60^\circ,0)$", (q1[0], q1[2]), xytext=(-150, 14), textcoords="offset points", fontsize=14)
        a1.set_xlabel(r"$w$"); a1.set_ylabel(r"$y$")
        a1.set_xlim(-0.3, 1.25); a1.set_ylim(-0.3, 1.15)
        a1.legend(loc="lower left", fontsize=13)
        a1.set_title(r"$t=0,\frac{1}{8},\dots,1$", fontsize=16)
        a2.plot(tt, np.gradient(ang(Sl), tt), color=C["a"], lw=3, label="slerp")
        a2.plot(tt, np.gradient(ang(Nl), tt), color=C["b"], lw=2.4, ls="--", label="nlerp")
        a2.set_xlabel(r"$t$")
        a2.set_ylabel(label(lang, "angular speed  d(angle)/dt  (deg)", "角速度  d(角度)/dt（度）", "角速度  d(角度)/dt（度）"))
        a2.set_xticks([0, 0.25, 0.5, 0.75, 1]); a2.set_ylim(0, 170)
        a2.legend(fontsize=14, loc="lower center")
        a2.set_title(label(lang, "rotation from 0 to 120 deg about y", "绕 y 轴从 0 转到 120 度", "y 軸まわりに 0 から 120 度へ"), fontsize=16)
        fig.tight_layout()
        save(fig, OUT / f"01-slerp_{lang}.svg")


# ================================================================ 9. coordinate spaces
def cube_edges(h=0.5):
    V = np.array([[x, y, z] for x in (-h, h) for y in (-h, h) for z in (-h, h)], float)
    E = [(i, j) for i in range(8) for j in range(i + 1, 8) if np.sum(V[i] != V[j]) == 1]
    return V, E


def fig_spaces():
    V, E = cube_edges(0.5)
    Vh = np.c_[V, np.ones(8)]
    model = translate(1, 0, 0) @ rotate_y(45)
    eye, target, up = np.array([2.0, 2.0, 5.0]), np.zeros(3), np.array([0, 1.0, 0])
    Vm = look_at(eye, target, up)
    fovy, aspect, n, f = 45, 1.0, 1.0, 10.0
    P = perspective(fovy, aspect, n, f)
    W = Hh = 240
    world = (model @ Vh.T).T
    view = (Vm @ world.T).T
    clip = (P @ view.T).T
    ndc = clip[:, :3] / clip[:, 3:]
    scr = np.stack([(ndc[:, 0] + 1) / 2 * W, (1 - ndc[:, 1]) / 2 * Hh], 1)
    # right-handed y-up -> matplotlib z-up: (x, y, z) -> (x, -z, y) is a proper rotation.
    # NDC is left-handed in OpenGL (+z points away from the camera), so it is drawn with (x, z, y):
    # in every panel "away from the camera" points into the picture.
    RH = lambda p: np.stack([p[..., 0], -p[..., 2], p[..., 1]], -1)
    LH = lambda p: np.stack([p[..., 0], p[..., 2], p[..., 1]], -1)

    def frustum_pts(n_, f_):
        tn = n_ * np.tan(np.radians(fovy) / 2); tf = f_ * np.tan(np.radians(fovy) / 2)
        return np.array([[sx * tn, sy * tn, -n_] for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))] +
                        [[sx * tf, sy * tf, -f_] for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    FE = [(0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4), (0, 4), (1, 5), (2, 6), (3, 7)]

    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)
        fig = plt.figure(figsize=(10, 15))
        gs = fig.add_gridspec(3, 2)

        def panel(spec, title, pts_list, T, elev, azim):
            ax = fig.add_subplot(spec, projection="3d")
            clean3d(ax, elev, azim)
            allp = T(np.concatenate(pts_list))
            lo, hi = allp.min(0), allp.max(0)
            c, h = (lo + hi) / 2, (hi - lo).max() / 2 * 1.08
            ax.set_xlim(c[0] - h, c[0] + h); ax.set_ylim(c[1] - h, c[1] + h); ax.set_zlim(c[2] - h, c[2] + h)
            ax.set_box_aspect((1, 1, 1)); ax.set_title(title, fontsize=16)
            return ax

        def cube(ax, pts, T):
            for i, j in E:
                ax.plot(*T(pts[[i, j]]).T, color=C["a"], lw=2.2)
            ax.scatter(*T(pts[7:8]).T, color=C["b"], s=40, depthshade=False)  # corner (+,+,+) of the cube

        def frame(ax, origin, Rm, Ln, names, T):
            o = T(np.asarray(origin, float))
            for i, c in enumerate((C["x"], C["y"], C["z"])):
                dd = T(Rm[:, i] * Ln)
                ax.quiver(*o, *dd, color=c, lw=1.8, arrow_length_ratio=0.15)
                ax.text(*(o + dd * 1.25), names[i], color=c, fontsize=14, ha="center")

        def frustum(ax, F, apex, T):
            for a, b in FE:
                ax.plot(*T(F[[a, b]]).T, color=C["gray"], lw=1.1)
            for a in range(4):
                ax.plot(*T(np.stack([apex, F[a]])).T, color=C["gray"], lw=0.9, ls=":")

        xyz = ("$x$", "$y$", "$z$")
        ax = panel(gs[0, 0], L("object", "物体空间", "オブジェクト空間"), [V * 1.8], RH, 18, -60)
        cube(ax, V, RH); frame(ax, (0, 0, 0), np.eye(3), 0.8, xyz, RH)

        Cam = np.linalg.inv(Vm)
        Fw = (Cam @ np.c_[frustum_pts(n, 6.0), np.ones(8)].T).T[:, :3]
        ax = panel(gs[0, 1], L("world", "世界空间", "ワールド空間") + "  (M)", [world[:, :3], Fw, eye[None], np.zeros((1, 3))], RH, 22, -28)
        frustum(ax, Fw, eye, RH)
        cube(ax, world[:, :3], RH); frame(ax, (0, 0, 0), np.eye(3), 1.0, xyz, RH)
        frame(ax, eye, Cam[:3, :3], 1.0, (r"$\mathbf{r}$", r"$\mathbf{u}$", r"$-\mathbf{f}$"), RH)

        Fv = frustum_pts(n, 7.0)
        ax = panel(gs[1, 0], L("view", "观察空间", "ビュー空間") + "  (V)", [Fv, view[:, :3], np.zeros((1, 3))], RH, 16, -55)
        frustum(ax, Fv, np.zeros(3), RH)
        cube(ax, view[:, :3], RH); frame(ax, (0, 0, 0), np.eye(3), 1.2, xyz, RH)

        Vb, Eb = cube_edges(1.0)
        ax = panel(gs[1, 1], r"NDC  ($P$, $\div w$)", [Vb], LH, 16, -55)
        for i, j in Eb:
            ax.plot(*LH(Vb[[i, j]]).T, color=C["gray"], lw=1.1)
        near = np.array([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1.0]])
        ax.add_collection3d(Poly3DCollection([LH(near)], facecolor=C["c"], alpha=0.12, edgecolor="none"))
        ax.text(*LH(np.array([-1, -1.25, -1.0])), r"$z_{\mathrm{ndc}}=-1$", fontsize=13, color=C["c"])
        ax.text(*LH(np.array([-1, -1.25, 1.0])), r"$z_{\mathrm{ndc}}=+1$", fontsize=13, color=C["gray"])
        cube(ax, ndc, LH); frame(ax, (-1, -1, -1), np.eye(3), 0.5, xyz, LH)

        ax = fig.add_subplot(gs[2, :])
        ax.set_aspect("equal"); ax.set_xlim(0, W); ax.set_ylim(Hh, 0); ax.grid(False)
        ax.add_patch(Polygon([[0, 0], [W, 0], [W, Hh], [0, Hh]], closed=True, fill=False, ec=C["gray"]))
        for i, j in E:
            ax.plot(*scr[[i, j]].T, color=C["a"], lw=2.2)
        ax.plot(*scr[7], "o", color=C["b"], ms=7)
        ax.set_title(L("screen (pixels)", "屏幕（像素）", "スクリーン（ピクセル）"), fontsize=16)
        ax.set_xticks([0, W // 2, W]); ax.set_yticks([0, Hh // 2, Hh])
        fig.text(0.5, 0.01, r"$M=T(1,0,0)\,R_y(45^\circ)$,  eye$=(2,2,5)$, target$=\mathbf{0}$,  fovy$=45^\circ$, $n=1$, $f=10$,  $240\times240$",
                 ha="center", fontsize=14)
        fig.subplots_adjust(wspace=0.05, hspace=0.12, left=0.01, right=0.99, top=0.97, bottom=0.04)
        save(fig, OUT / f"01-coordinate-spaces_{lang}.svg")


# ================================================================ 10. normals: inverse transpose
def fig_normals():
    M = (rotate_z(30) @ scale(3, 1, 1))[:3, :3][:2, :2]
    Mit = np.linalg.inv(M).T
    u = np.linspace(0, 2 * np.pi, 300)
    circ = np.stack([np.cos(u), np.sin(u)])
    angs = np.radians(np.arange(0, 360, 45) + 22.5)
    t = np.array([1.0, 1.0]) / np.sqrt(2); n = np.array([-1.0, 1.0]) / np.sqrt(2)  # the post's example
    t2 = M @ t; nw = M @ n; nr = Mit @ n
    deg = lambda a, b: np.degrees(np.arccos(a @ b / np.linalg.norm(a) / np.linalg.norm(b)))
    for lang in LANGS:
        fig, (a1, a2) = plt.subplots(1, 2, figsize=(11.5, 6.4), gridspec_kw=dict(width_ratios=[1, 1.6]))
        for ax, A in ((a1, np.eye(2)), (a2, M)):
            ax.set_aspect("equal")
            ax.add_patch(Polygon((A @ circ).T, closed=True, fc=C["fill"], ec=C["dark"], lw=2))
            for a in angs:
                p = np.array([np.cos(a), np.sin(a)])  # on the unit circle the normal equals the position
                q = A @ p
                if A is M:
                    arrow2d(ax, q, normalize(M @ p) * 0.6, C["x"], lw=1.8)
                    arrow2d(ax, q, normalize(Mit @ p) * 0.6, C["y"], lw=2.4)
                else:
                    arrow2d(ax, q, p * 0.6, C["y"], lw=2.4)
        a1.set_title(label(lang, "before", "变换前", "変換前"), fontsize=16)
        a2.set_title(label(lang, "after", "变换后", "変換後") + ":  M = Rz(30°) S(3, 1, 1)", fontsize=16)
        s = np.array([-1.0, 1.0])
        a1.plot(s * t[0], s * t[1], color=C["b"], lw=2, ls="--")
        arrow2d(a1, (0, 0), t * 0.9, C["b"], text=r"$\mathbf{t}$", off=(0.12, -0.12))
        arrow2d(a1, (0, 0), n * 0.9, C["y"], text=r"$\mathbf{n}$", off=(-0.1, 0.13))
        a2.plot(s * t2[0], s * t2[1], color=C["b"], lw=2, ls="--")
        arrow2d(a2, (0, 0), t2, C["b"], text=r"$M\mathbf{t}$", off=(0.28, -0.12))
        arrow2d(a2, (0, 0), normalize(nw) * 0.9, C["x"], text=r"$M\mathbf{n}$", off=(-0.15, -0.25))
        arrow2d(a2, (0, 0), normalize(nr) * 0.9, C["y"], text=r"$M^{-\top}\mathbf{n}$", off=(-0.1, 0.28))
        a1.set_xlim(-1.8, 1.8); a1.set_ylim(-1.8, 1.8)
        a2.set_xlim(-3.4, 3.4); a2.set_ylim(-2.4, 2.4)
        a2.text(-3.3, 2.05, rf"$\angle(M\mathbf{{n}},M\mathbf{{t}})={deg(nw, t2):.1f}^\circ$,   $\angle(M^{{-\top}}\mathbf{{n}},M\mathbf{{t}})={deg(nr, t2):.1f}^\circ$",
                fontsize=14, bbox=dict(fc="white", ec="none", alpha=0.85))
        from matplotlib.lines import Line2D
        fig.legend([Line2D([], [], color=C["x"], lw=2), Line2D([], [], color=C["y"], lw=2.4)],
                   [r"$M\mathbf{n}$  ✗", r"$M^{-\top}\mathbf{n}$  ✓"],
                   loc="lower center", ncol=2, frameon=False, fontsize=15)
        fig.subplots_adjust(bottom=0.13, wspace=0.12)
        save(fig, OUT / f"01-normal-transform_{lang}.svg")


if __name__ == "__main__":
    fig_dot()
    fig_cross()
    fig_linear()
    fig_homogeneous()
    fig_trs()
    fig_gimbal()
    fig_rodrigues()
    fig_slerp()
    fig_spaces()
    fig_normals()
