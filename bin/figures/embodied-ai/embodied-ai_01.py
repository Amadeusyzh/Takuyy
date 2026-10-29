"""Figures for embodied-ai post 01 (robotics foundations).

Conventions (same as the post): right-handed frames, z up in 3D figures; the planar arm moves in
the x-y plane (joint axes along +z, angles counter-clockwise), link lengths LINKS = [1.0, 0.8, 0.5].
All numbers come from the post's own code (dh, fk, jacobian, ik_dls, the pendulum PID, rrt).

    python3 bin/figures/embodied-ai/embodied-ai_01.py
"""
import heapq
import pathlib
import sys

import numpy as np
from scipy.linalg import expm

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401
plt.rcParams["svg.hashsalt"] = "embodied-ai"  # deterministic SVG ids, so regenerated files do not churn
from matplotlib.patches import Circle, Rectangle, Ellipse  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/embodied-ai"


# ----------------------------------------------------------------- the post's code
def dh(a, alpha, d, theta):
    ct, st, ca, sa = np.cos(theta), np.sin(theta), np.cos(alpha), np.sin(alpha)
    return np.array([[ct, -st * ca, st * sa, a * ct],
                     [st, ct * ca, -ct * sa, a * st],
                     [0.0, sa, ca, d],
                     [0.0, 0.0, 0.0, 1.0]])


LINKS = np.array([1.0, 0.8, 0.5])


def fk(q, links=LINKS):
    T = np.eye(4)
    pts = [T[:3, 3].copy()]
    for a, theta in zip(links, q):
        T = T @ dh(a, 0.0, 0.0, theta)
        pts.append(T[:3, 3].copy())
    return T, np.array(pts)


def task(q):
    T, _ = fk(q)
    return np.array([T[0, 3], T[1, 3], np.arctan2(T[1, 0], T[0, 0])])


def jacobian(q, links=LINKS):
    c = np.cumsum(q)
    J = np.zeros((3, len(q)))
    for i in range(len(q)):
        J[0, i] = -np.sum(links[i:] * np.sin(c[i:]))
        J[1, i] = np.sum(links[i:] * np.cos(c[i:]))
        J[2, i] = 1.0
    return J


def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi


def ik_dls_hist(x_goal, q0, lam=0.05, iters=200, tol=1e-6):
    """ik_dls from the post, additionally returning the iterates and residuals."""
    q = q0.astype(float).copy()
    qs, errs = [q.copy()], []
    for k in range(iters):
        e = x_goal - task(q)
        e[2] = wrap(e[2])
        errs.append(np.linalg.norm(e))
        if np.linalg.norm(e) < tol:
            break
        J = jacobian(q)
        q += J.T @ np.linalg.solve(J @ J.T + lam**2 * np.eye(3), e)
        qs.append(q.copy())
    return np.array(qs), np.array(errs)


def draw_arm(ax, q, color=C["dark"], lw=4, alpha=1.0, joints=True, z=3):
    _, p = fk(q)
    ax.plot(p[:, 0], p[:, 1], "-", color=color, lw=lw, alpha=alpha, solid_capstyle="round", zorder=z)
    if joints:
        ax.plot(p[:-1, 0], p[:-1, 1], "o", ms=7, mfc="white", mec=color, mew=2, alpha=alpha, zorder=z + 1)
        ax.plot(p[-1, 0], p[-1, 1], "o", ms=6, color=color, alpha=alpha, zorder=z + 1)
    return p


def triad(ax, T, s=0.18, lw=2.4, name=None, off=(0.03, 0.03, 0.03)):
    o = T[:3, 3]
    for i, c in enumerate((C["x"], C["y"], C["z"])):
        ax.quiver(*o, *(T[:3, i] * s), color=c, linewidth=lw, arrow_length_ratio=0.25)
    if name:
        ax.text(*(o + np.array(off)), name, fontsize=15, color=C["dark"])


def clean3d(fig, ax, aspect=(1, 1, 1), zoom=1.3):
    """Diagram-style 3D axes: no panes or ticks, little white space. Call after setting limits."""
    ax.set_axis_off()
    ax.set_box_aspect(aspect, zoom=zoom)
    fig.subplots_adjust(left=0, right=1, bottom=0, top=1)


# ----------------------------------------------------------------- 1. axis-angle rotation
def fig_rotation():
    w = np.array([0.35, 0.25, 1.0]); w /= np.linalg.norm(w)
    v = np.array([0.95, 0.0, 0.35])
    W = np.array([[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]])
    R = lambda th: np.eye(3) + np.sin(th) * W + (1 - np.cos(th)) * W @ W
    th = np.deg2rad(110)
    fig = plt.figure(figsize=(8, 7))
    ax = fig.add_subplot(projection="3d")
    axes3d(ax, lim=1.1)
    ax.view_init(elev=22, azim=-58)
    arrow3d(ax, (0, 0, 0), w * 1.05, C["a"], lw=3, label_text=r"$\hat\omega$")
    arrow3d(ax, (0, 0, 0), v, C["b"], lw=3)
    ax.text(*(v + np.array([0.05, 0.05, -0.15])), r"$v$", color=C["b"], fontsize=18)
    Rv = R(th) @ v
    arrow3d(ax, (0, 0, 0), Rv, C["c"], lw=3)
    ax.text(*(Rv * 1.12), r"$e^{[\hat\omega]\theta} v$", color=C["c"], fontsize=16)
    ts = np.linspace(0, th, 60)
    arc = np.array([R(t) @ v for t in ts])
    ax.plot(*arc.T, color=C["gray"], lw=2.2)
    full = np.array([R(t) @ v for t in np.linspace(0, 2 * np.pi, 120)])
    ax.plot(*full.T, color=C["gray"], lw=1, ls=":")
    par = (w @ v) * w  # component along the axis is unchanged
    ax.plot(*np.stack([par, v]).T, color=C["gray"], lw=1.2, ls="--")
    ax.plot(*np.stack([par, Rv]).T, color=C["gray"], lw=1.2, ls="--")
    ax.plot(*np.stack([[0, 0, 0], par]).T, color=C["a"], lw=5, alpha=0.35)
    mid = arc[len(arc) // 2]
    ax.text(*(mid + (mid - par) * 0.18), r"$\theta$", fontsize=18, color=C["dark"])
    ax.text(*(par * 0.5 + np.array([-0.55, 0.0, -0.05])), r"$(\hat\omega^\top v)\,\hat\omega$", fontsize=15, color=C["a"])
    ax.set_xlim(-0.6, 1.0); ax.set_ylim(-0.6, 1.0); ax.set_zlim(-0.15, 1.15)
    clean3d(fig, ax, aspect=(1.6, 1.6, 1.3), zoom=1.3)
    save(fig, OUT / "01-rotation-axis-angle.svg")


# ----------------------------------------------------------------- 2. frame chain of a spatial arm
SPATIAL_DH = [(0.0, np.pi / 2, 0.45), (0.55, 0.0, 0.0), (0.45, 0.0, 0.0)]  # (a, alpha, d)


def fig_frame_chain():
    q = np.array([0.6, 0.55, -1.1])
    T_w0 = np.eye(4); T_w0[:3, :3] = expm(np.array([[0, -1, 0], [1, 0, 0], [0, 0, 0]]) * 0.35)
    T_w0[:3, 3] = [0.35, -0.25, 0.0]
    Ts = [T_w0]
    for (a, al, d), th in zip(SPATIAL_DH, q):
        Ts.append(Ts[-1] @ dh(a, al, d, th))
    T_ee_cam = np.eye(4); T_ee_cam[:3, 3] = [-0.12, 0.0, 0.2]
    T_cam = Ts[-1] @ T_ee_cam
    fig = plt.figure(figsize=(9, 7.5))
    ax = fig.add_subplot(projection="3d")
    ax.view_init(elev=20, azim=-62)
    triad(ax, np.eye(4), s=0.25, name=r"$\{w\}$", off=(-0.12, -0.08, -0.08))
    # base pedestal and links
    pts = np.array([T[:3, 3] for T in Ts])
    ax.plot(*np.stack([pts[0], pts[0]]).T, color=C["gray"])
    ax.plot(*pts.T, "-", color=C["gray"], lw=9, alpha=0.45, solid_capstyle="round")
    names = [r"$\{0\}$", r"$\{1\}$", r"$\{2\}$", r"$\{3\}$"]
    offs = [(0.04, -0.12, -0.06), (-0.16, 0.0, 0.06), (0.03, 0.03, 0.05), (0.06, 0.0, -0.08)]
    for T, n, o in zip(Ts, names, offs):
        triad(ax, T, s=0.2, name=n, off=o)
    triad(ax, T_cam, s=0.12, lw=1.8, name=r"$\{c\}$", off=(-0.1, 0.0, 0.08))
    # transform labels between consecutive origins
    allT = [np.eye(4)] + Ts
    labs = [r"$T_{w0}$", r"$T_{01}(q_1)$", r"$T_{12}(q_2)$", r"$T_{23}(q_3)$"]
    for A, B, l in zip(allT[:-1], allT[1:], labs):
        a, b = A[:3, 3], B[:3, 3]
        ax.plot(*np.stack([a, b]).T, ls="--", color=C["a"], lw=1.4)
        m = (a + b) / 2
        ax.text(m[0] + 0.02, m[1] - 0.12, m[2] - 0.02, l, color=C["a"], fontsize=14)
    # ground grid
    g = np.linspace(-0.3, 1.2, 6)
    for x in g:
        ax.plot([x, x], [-0.6, 0.9], [0, 0], color=C["gray"], lw=0.6, alpha=0.4)
    for y in np.linspace(-0.6, 0.9, 6):
        ax.plot([-0.3, 1.2], [y, y], [0, 0], color=C["gray"], lw=0.6, alpha=0.4)
    ax.set_xlim(-0.3, 1.2); ax.set_ylim(-0.6, 0.9); ax.set_zlim(-0.05, 0.95)
    clean3d(fig, ax, aspect=(1.5, 1.5, 1.0), zoom=1.3)
    ax.text2D(0.02, 0.95, r"$T_{w3} = T_{w0}\,T_{01}\,T_{12}\,T_{23}$", transform=ax.transAxes, fontsize=17)
    ax.text2D(0.02, 0.88, r"$T_{wc} = T_{w3}\,T_{3c}$", transform=ax.transAxes, fontsize=17)
    save(fig, OUT / "01-frame-chain.svg")


# ----------------------------------------------------------------- 3. screw motion
def fig_screw():
    # unit screw axis along z through the point (0.6, 0, 0), pitch h: S = (w, -w x p + h w)
    w = np.array([0, 0, 1.0]); p = np.array([0.6, 0, 0]); h = 0.12
    v = -np.cross(w, p) + h * w
    S = np.zeros((4, 4))
    S[:3, :3] = np.array([[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]]); S[:3, 3] = v
    T0 = np.eye(4); T0[:3, 3] = [0.0, 0.0, 0.0]
    fig = plt.figure(figsize=(8, 7.5))
    ax = fig.add_subplot(projection="3d")
    ax.view_init(elev=18, azim=-55)
    th = np.linspace(0, 2 * np.pi * 1.25, 300)
    path = np.array([(expm(S * t) @ T0)[:3, 3] for t in th])
    ax.plot(*path.T, color=C["a"], lw=2.4)
    for t in np.linspace(0, 2 * np.pi * 1.25, 9):
        triad(ax, expm(S * t) @ T0, s=0.16, lw=2)
    ax.plot([0.6, 0.6], [0, 0], [-0.1, 1.15], color=C["dark"], lw=1.6, ls="-.")
    ax.text(0.62, 0.02, 1.18, r"$\mathcal{S} = (\omega, v)$", fontsize=16)
    ax.text(0.0, -0.25, -0.05, r"$\theta=0$", fontsize=15)
    Te = expm(S * th[-1]) @ T0
    ax.text(*(Te[:3, 3] + [0.05, 0.05, 0.08]), r"$e^{[\mathcal{S}]\theta}$", fontsize=16, color=C["a"])
    ax.set_xlim(-0.2, 1.4); ax.set_ylim(-0.8, 0.8); ax.set_zlim(-0.1, 1.05)
    clean3d(fig, ax, aspect=(1.6, 1.6, 1.15), zoom=1.3)
    ax.text2D(0.02, 0.93, r"$h = 0.12\ \mathrm{per\ rad}$", transform=ax.transAxes, fontsize=15)
    save(fig, OUT / "01-screw-motion.svg")


# ----------------------------------------------------------------- 4. DH parameters
def arc3(center, u, v, ang, r, n=40):
    t = np.linspace(0, ang, n)
    return center[None] + r * (np.cos(t)[:, None] * u[None] + np.sin(t)[:, None] * v[None])


def fig_dh():
    a, al, d, th = 0.9, np.deg2rad(50), 0.6, np.deg2rad(55)
    T = dh(a, al, d, th)
    o0 = np.zeros(3); x0 = np.array([1.0, 0, 0]); y0 = np.array([0, 1.0, 0]); z0 = np.array([0, 0, 1.0])
    P = o0 + d * z0  # foot of the common normal on z_{i-1}
    xi, yi, zi, oi = T[:3, 0], T[:3, 1], T[:3, 2], T[:3, 3]
    assert np.allclose(oi, P + a * xi)
    fig = plt.figure(figsize=(9, 8))
    ax = fig.add_subplot(projection="3d")
    ax.view_init(elev=20, azim=-70)
    # joint axes as long lines
    ax.plot(*np.stack([o0 - 0.25 * z0, o0 + 1.35 * z0]).T, color=C["z"], lw=1.3, ls="-.")
    ax.plot(*np.stack([oi - 0.7 * zi, oi + 0.75 * zi]).T, color=C["z"], lw=1.3, ls="-.")
    ax.text(*(o0 + 1.4 * z0), "joint $i$", fontsize=14, color=C["z"])
    ax.text(*(oi + 0.8 * zi), "joint $i{+}1$", fontsize=14, color=C["z"])
    # frames
    s = 0.35
    for vec, c, l in ((x0, C["x"], r"$x_{i-1}$"), (z0, C["z"], r"$z_{i-1}$")):
        ax.quiver(*o0, *(vec * s), color=c, linewidth=2.6, arrow_length_ratio=0.2)
        ax.text(*(o0 + vec * s * 1.1 + np.array([0.0, 0.1, -0.05]) * float(vec[2] > 0)), l, color=c, fontsize=16)
    ax.quiver(*o0, *(y0 * s * 0.7), color=C["y"], linewidth=1.6, arrow_length_ratio=0.2, alpha=0.6)
    for vec, c, l in ((xi, C["x"], r"$x_i$"), (zi, C["z"], r"$z_i$")):
        ax.quiver(*oi, *(vec * s), color=c, linewidth=2.6, arrow_length_ratio=0.2)
        ax.text(*(oi + vec * s * 1.3), l, color=c, fontsize=16)
    ax.quiver(*oi, *(yi * s * 0.7), color=C["y"], linewidth=1.6, arrow_length_ratio=0.2, alpha=0.6)
    # d_i along z_{i-1}
    ax.plot(*np.stack([o0, P]).T, color=C["b"], lw=5, alpha=0.85)
    ax.text(*(o0 + 0.5 * d * z0 + np.array([-0.2, 0.0, 0])), r"$d_i$", color=C["b"], fontsize=19)
    # a_i along x_i (common normal)
    ax.plot(*np.stack([P, oi]).T, color=C["a"], lw=5, alpha=0.85)
    ax.text(*((P + oi) / 2 + np.array([0.0, 0.0, 0.07])), r"$a_i$", color=C["a"], fontsize=19)
    # theta_i: about z_{i-1}, from x_{i-1} (copied to P) to x_i
    ax.plot(*np.stack([P, P + 0.55 * x0]).T, color=C["x"], lw=1.4, ls="--")
    arc = arc3(P, x0, y0, th, 0.42)
    ax.plot(*arc.T, color=C["dark"], lw=2.2)
    m = arc[len(arc) // 2]
    ax.text(*(m + (m - P) * 0.25), r"$\theta_i$", fontsize=19)
    # alpha_i: about x_i, from z_{i-1} (copied to o_i) to z_i
    ax.plot(*np.stack([oi, oi + 0.55 * z0]).T, color=C["z"], lw=1.4, ls="--")
    arc = arc3(oi, z0, np.cross(xi, z0), al, 0.45)
    ax.plot(*arc.T, color=C["dark"], lw=2.2)
    m = arc[len(arc) // 2]
    ax.text(*(m + (m - oi) * 0.3), r"$\alpha_i$", fontsize=19)
    ax.plot(*o0, "o", color=C["dark"]); ax.plot(*oi, "o", color=C["dark"]); ax.plot(*P, "o", ms=4, color=C["gray"])
    ax.text(*(o0 + np.array([0.05, -0.05, -0.12])), r"$o_{i-1}$", fontsize=15)
    ax.text(*(oi + np.array([0.06, 0.0, -0.13])), r"$o_i$", fontsize=15)
    ax.set_xlim(-0.3, 1.1); ax.set_ylim(-0.3, 1.1); ax.set_zlim(-0.2, 1.3)
    clean3d(fig, ax, aspect=(1.4, 1.4, 1.5), zoom=1.3)
    ax.text2D(0.0, 0.97, r"$T_{i-1,i}=\mathrm{Rot}_z(\theta_i)\,\mathrm{Trans}_z(d_i)\,\mathrm{Trans}_x(a_i)\,\mathrm{Rot}_x(\alpha_i)$",
              transform=ax.transAxes, fontsize=15)
    save(fig, OUT / "01-dh-parameters.svg")


# ----------------------------------------------------------------- 5. workspace
def fig_workspace():
    rng = np.random.default_rng(1)
    fig, axs = plt.subplots(1, 2, figsize=(10, 5.1))
    # 2-link arm (first two links)
    q2 = rng.uniform(-np.pi, np.pi, (6000, 2))
    c = np.cumsum(q2, 1)
    p2 = np.stack([LINKS[0] * np.cos(c[:, 0]) + LINKS[1] * np.cos(c[:, 1]),
                   LINKS[0] * np.sin(c[:, 0]) + LINKS[1] * np.sin(c[:, 1])], 1)
    axs[0].scatter(*p2.T, s=2, color=C["z"], alpha=0.35, lw=0)
    for r in (0.2, 1.8):
        axs[0].add_patch(Circle((0, 0), r, fill=False, color=C["dark"], lw=1.6, ls="--"))
    axs[0].text(0.0, -0.45, r"$r=a_1-a_2=0.2$", ha="center", fontsize=14)
    axs[0].text(0.55, 1.95, r"$r=a_1+a_2=1.8$", fontsize=14)
    for q in ([0.5, 0.9], [2.2, -1.4]):
        qq = np.array([q[0], q[1], 0.0]); _, p = fk(qq, links=np.array([1.0, 0.8, 0.0]))
        axs[0].plot(p[:3, 0], p[:3, 1], "-o", color=C["dark"], lw=3.5, ms=6, mfc="white")
    axs[0].set_title(r"2-link: $a=(1.0,\,0.8)$")
    # 3-link arm, colour = orientation phi
    q3 = rng.uniform(-np.pi, np.pi, (12000, 3))
    X = np.array([task(q) for q in q3])
    sc = axs[1].scatter(X[:, 0], X[:, 1], c=X[:, 2], cmap="twilight", s=2, lw=0, alpha=0.6, vmin=-np.pi, vmax=np.pi)
    axs[1].add_patch(Circle((0, 0), 2.3, fill=False, color=C["dark"], lw=1.6, ls="--"))
    for r in (0.7, 1.3):
        axs[1].add_patch(Circle((0, 0), r, fill=False, color=C["b"], lw=2.2))
    axs[1].text(1.55, 1.85, r"$r=2.3$", fontsize=14)
    axs[1].text(0.0, -1.62, r"$0.7\leq r\leq 1.3$", fontsize=14, color=C["b"], ha="center",
                bbox=dict(fc="white", ec=C["b"], alpha=0.9, pad=2))
    draw_arm(axs[1], np.array([0.4, 0.7, 0.9]))
    cb = fig.colorbar(sc, ax=axs[1], fraction=0.045, pad=0.03, ticks=[-np.pi, 0, np.pi])
    cb.ax.set_yticklabels([r"$-\pi$", "0", r"$\pi$"]); cb.set_label(r"$\phi$")
    axs[1].set_title(r"3-link: $a=(1.0,\,0.8,\,0.5)$")
    for ax in axs:
        ax.set_aspect("equal"); ax.set_xlim(-2.45, 2.45); ax.set_ylim(-2.45, 2.45)
        ax.plot(0, 0, "s", color=C["dark"], ms=8)
        ax.set_xlabel("$p_x$"); ax.set_ylabel("$p_y$")
    save(fig, OUT / "01-workspace.svg")


# ----------------------------------------------------------------- 6. manipulability
def fig_manipulability():
    fig, axs = plt.subplots(1, 2, figsize=(10, 5), gridspec_kw=dict(width_ratios=[1.15, 1]))
    ax = axs[0]
    configs = [np.array([0.2, 1.7, 1.2]), np.array([0.25, 1.0, 0.7]), np.array([0.3, 0.45, 0.3]),
               np.array([0.32, 0.08, 0.05])]
    cols = [C["z"], C["c"], C["b"], C["x"]]
    scale = 0.22
    for q, col in zip(configs, cols):
        p = draw_arm(ax, q, color=col, lw=3.5)
        Jp = jacobian(q)[:2]
        U, S, _ = np.linalg.svd(Jp)
        ang = np.degrees(np.arctan2(U[1, 0], U[0, 0]))
        ax.add_patch(Ellipse(p[-1, :2], 2 * scale * S[0], 2 * scale * max(S[1], 1e-3), angle=ang,
                             fc=col, ec=col, alpha=0.25, lw=2))
        ax.add_patch(Ellipse(p[-1, :2], 2 * scale * S[0], 2 * scale * max(S[1], 1e-3), angle=ang,
                             fill=False, ec=col, lw=2))
        w = abs(np.linalg.det(jacobian(q)))
        off = {C["z"]: (-0.75, 0.25), C["c"]: (-0.62, 0.3), C["b"]: (-0.2, 0.5), C["x"]: (0.12, -0.25)}[col]
        ax.text(p[-1, 0] + off[0], p[-1, 1] + off[1], f"$w={w:.2f}$", color=col, fontsize=15)
    ax.set_aspect("equal"); ax.set_xlim(-0.6, 2.75); ax.set_ylim(-0.35, 2.1)
    ax.plot(0, 0, "s", color=C["dark"], ms=8)
    ax.set_xlabel("$p_x$"); ax.set_ylabel("$p_y$")
    ax.set_title(r"$\{J_p\dot q:\ \Vert\dot q\Vert\leq 1\}$  (x0.22)")
    # w = |det J| for the full 3x3 Jacobian, evaluated numerically on a (q2, q3) grid: it equals
    # a1 a2 |sin q2| and does not depend on q1 or q3 (the last link only adds orientation).
    ax = axs[1]
    g = np.linspace(-np.pi, np.pi, 401)
    rng = np.random.default_rng(0)
    for q3 in rng.uniform(-np.pi, np.pi, 6):
        w = [abs(np.linalg.det(jacobian(np.array([0.0, a, q3])))) for a in g]
        ax.plot(g, w, color=C["gray"], lw=5, alpha=0.25)
    ax.plot(g, LINKS[0] * LINKS[1] * np.abs(np.sin(g)), color=C["dark"], lw=1.8, ls="--",
            label=r"$a_1a_2\,\vert\sin q_2\vert$")
    for q, col in zip(configs, cols):
        ax.plot(q[1], abs(np.linalg.det(jacobian(q))), "o", ms=12, mfc=col, mec="white", mew=2, zorder=5)
    for s in (-np.pi, 0, np.pi):
        ax.axvline(s, color=C["x"], lw=1.2, ls=":")
    ax.set_xticks([-np.pi, -np.pi / 2, 0, np.pi / 2, np.pi])
    ax.set_xticklabels([r"$-\pi$", r"$-\pi/2$", "0", r"$\pi/2$", r"$\pi$"])
    ax.set_xlabel("$q_2$"); ax.set_ylabel("$w$")
    ax.legend(fontsize=14, loc="upper right", framealpha=0.95)
    ax.set_ylim(0, 1.0)
    ax.set_title(r"$w=\sqrt{\det JJ^\top}$, any $q_1, q_3$")
    save(fig, OUT / "01-manipulability.svg")


# ----------------------------------------------------------------- 7. damped least-squares IK
def fig_ik():
    x_goal = np.array([1.2, 0.9, np.pi / 4])
    qs, errs = ik_dls_hist(x_goal, np.zeros(3))
    print("ik_dls reachable target: iterations", len(errs) - 1, "residual", errs[-1])
    fig = plt.figure(figsize=(9, 9.5))
    gs = fig.add_gridspec(2, 2, height_ratios=[1.2, 1])
    ax = fig.add_subplot(gs[0, :])
    cmap = plt.get_cmap("viridis")
    n = len(qs)
    ees = []
    for k, q in enumerate(qs):
        p = draw_arm(ax, q, color=cmap(k / (n - 1)), lw=3 if k in (0, n - 1) else 2, alpha=1 if k in (0, n - 1) else 0.75,
                     joints=k in (0, n - 1))
        ees.append(p[-1, :2])
        if k < 3:
            ax.text(p[-1, 0] + 0.05, p[-1, 1] - 0.16, f"$k={k}$", fontsize=15, color=cmap(k / (n - 1)))
    ees = np.array(ees)
    ax.plot(*ees.T, ":", color=C["dark"], lw=1.5)
    ax.plot(*x_goal[:2], "*", ms=22, color=C["b"], mec=C["dark"], zorder=6)
    ax.annotate("", xy=x_goal[:2] + 0.35 * np.array([np.cos(x_goal[2]), np.sin(x_goal[2])]), xytext=x_goal[:2],
                arrowprops=dict(arrowstyle="-|>", color=C["b"], lw=2.5))
    ax.text(2.05, 1.08, r"$x^\ast=(1.2,\,0.9,\,\pi/4)$", fontsize=15, color=C["b"])
    ax.text(0.2, 1.1, f"$k={n - 1}$", fontsize=15, color="#b5a300")
    allp = np.concatenate([fk(q)[1][:, :2] for q in qs])
    ax.set_aspect("equal"); ax.set_xlim(allp[:, 0].min() - 0.15, 3.2); ax.set_ylim(allp[:, 1].min() - 0.15, allp[:, 1].max() + 0.2)
    ax.plot(0, 0, "s", color=C["dark"], ms=8)
    ax.set_xlabel("$p_x$"); ax.set_ylabel("$p_y$")
    ax.set_title(r"ik_dls: $q_0=0$, $\lambda=0.05$")
    ax2 = fig.add_subplot(gs[1, 0])
    for lam, col in ((0.05, C["a"]), (0.2, C["b"]), (0.5, C["c"])):
        _, e = ik_dls_hist(x_goal, np.zeros(3), lam=lam, iters=60)
        ax2.semilogy(e, "-o", ms=4, color=col, label=rf"$\lambda={lam}$")
    ax2.axhline(1e-6, color=C["gray"], ls="--", lw=1.2)
    ax2.set_xlabel("$k$"); ax2.set_ylabel(r"$\Vert e\Vert$"); ax2.legend(fontsize=13)
    ax2.set_title(r"reachable $x^\ast$")
    ax3 = fig.add_subplot(gs[1, 1])
    for lam, col in ((0.05, C["x"]), (0.5, C["z"])):
        _, e = ik_dls_hist(np.array([3.0, 0.0, 0.0]), np.array([0.1, 0.1, 0.1]), lam=lam, iters=500, tol=0)
        ax3.plot(e, color=col, lw=1.0 if lam < 0.1 else 3, alpha=0.7 if lam < 0.1 else 1, label=rf"$\lambda={lam}$")
        print(f"unreachable target lam={lam}: final residual {e[-1]:.3f}, max over last 100 {e[-100:].max():.2f}")
    ax3.set_ylim(0, 5.6)
    ax3.set_xlabel("$k$"); ax3.set_ylabel(r"$\Vert e\Vert$"); ax3.legend(fontsize=13, loc="upper right", ncol=2, framealpha=0.95)
    ax3.set_title(r"unreachable $x^\ast=(3,0,0)$")
    fig.tight_layout()
    save(fig, OUT / "01-ik-dls.svg")


# ----------------------------------------------------------------- 8. PID on the pendulum
def fig_pid():
    I, b, m, g, l = 0.5, 0.1, 1.0, 9.81, 0.5
    dt, T = 1e-3, 3.0

    def simulate(Kp, Kd, Ki, gravity_comp, q_ref=np.pi / 3):
        q, qd, integ = 0.0, 0.0, 0.0
        out = []
        for _ in range(int(T / dt)):
            e = q_ref - q
            integ += e * dt
            tau = Kp * e - Kd * qd + Ki * integ
            if gravity_comp:
                tau += m * g * l * np.sin(q)
            qdd = (tau - b * qd - m * g * l * np.sin(q)) / I
            qd += qdd * dt
            q += qd * dt
            out.append(q)
        return np.array(out)

    t = np.arange(1, int(T / dt) + 1) * dt
    fig, axs = plt.subplots(2, 1, figsize=(9, 9))
    ax = axs[0]
    for (Kp, Kd, Ki, gc, lab, col) in ((20, 3, 0, False, "PD", C["x"]), (20, 3, 30, False, "PID", C["z"]),
                                        (20, 3, 0, True, "PD + $g(q)$", C["y"])):
        q = simulate(Kp, Kd, Ki, gc)
        ax.plot(t, q, color=col, label=f"{lab}: $e(3)={np.pi / 3 - q[-1]:+.4f}$")
    ax.axhline(np.pi / 3, color=C["dark"], ls="--", lw=1.4)
    ax.text(0.05, np.pi / 3 + 0.04, r"$q_{\mathrm{ref}}=\pi/3$", fontsize=14)
    ax.set_xlabel("t [s]"); ax.set_ylabel("q [rad]"); ax.legend(fontsize=13, loc="lower right")
    ax.set_title(r"$K_p=20,\ K_d=3,\ K_i\in\{0,30\}$")
    ax = axs[1]
    cm = plt.get_cmap("plasma")
    for i, Kp in enumerate((5, 20, 80)):
        for Kd, ls in ((1, ":"), (6, "-")):
            q = simulate(Kp, Kd, 0, True)
            ax.plot(t, q, ls=ls, color=cm(i / 3), label=f"$K_p={Kp},K_d={Kd}$")
    ax.axhline(np.pi / 3, color=C["dark"], ls="--", lw=1.4)
    ax.set_xlabel("t [s]"); ax.set_ylabel("q [rad]"); ax.legend(fontsize=13, ncol=3, loc="upper center", columnspacing=1.0)
    ax.set_title("PD + $g(q)$")
    ax.set_ylim(0, 2.15)
    fig.tight_layout()
    save(fig, OUT / "01-pid-step.svg")


# ----------------------------------------------------------------- 9. impedance control
def spring_pts(a, b, n=8, w=0.06):
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a; L = np.linalg.norm(d); u = d / L; nrm = np.array([-u[1], u[0]])
    s = np.linspace(0, 1, 2 * n + 3)
    off = np.zeros_like(s); off[2:-2:2] = w; off[3:-2:2] = -w
    return a[None] + s[:, None] * d[None] + off[:, None] * nrm[None]


def fig_impedance():
    fig, axs = plt.subplots(2, 1, figsize=(8.5, 9), gridspec_kw=dict(height_ratios=[0.8, 1]))
    ax = axs[0]
    q = np.array([0.9, -1.2, 0.3])
    p = draw_arm(ax, q, color=C["dark"])
    x = p[-1, :2]
    xd = x + np.array([0.75, 0.0])
    sp = 0.1  # vertical offset of spring (above) and damper (below)
    ax.plot(*np.stack([x, x + [0.06, 0]]).T, color=C["dark"], lw=2)
    ax.plot([x[0] + 0.06] * 2, [x[1] - sp, x[1] + sp], color=C["dark"], lw=2)
    ax.plot([xd[0] - 0.06] * 2, [xd[1] - sp, xd[1] + sp], color=C["dark"], lw=2)
    pts = spring_pts(x + [0.06, sp], xd + [-0.06, sp], n=7, w=0.05)
    ax.plot(*pts.T, color=C["a"], lw=2.2)
    y0 = x[1] - sp; xa, xb = x[0] + 0.06, xd[0] - 0.06
    ax.plot([xa, xa + 0.3], [y0, y0], color=C["c"], lw=2.2)
    ax.plot([xa + 0.3] * 2, [y0 - 0.035, y0 + 0.035], color=C["c"], lw=3)          # piston
    ax.plot([xa + 0.24, xa + 0.42, xa + 0.42, xa + 0.24], [y0 + 0.055, y0 + 0.055, y0 - 0.055, y0 - 0.055],
            color=C["c"], lw=2.2)                                                    # cylinder
    ax.plot([xa + 0.42, xb], [y0, y0], color=C["c"], lw=2.2)
    ax.plot(*xd, "x", ms=14, mew=3, color=C["b"], zorder=6)
    ax.text(xd[0] + 0.06, xd[1] - 0.06, "$x_d$", fontsize=18, color=C["b"])
    ax.text(x[0] - 0.22, x[1] + 0.05, "$x$", fontsize=18)
    ax.text((x[0] + xd[0]) / 2 - 0.08, x[1] + sp + 0.08, "$K_d$", color=C["a"], fontsize=17)
    ax.text((x[0] + xd[0]) / 2 - 0.08, x[1] - sp - 0.2, "$D_d$", color=C["c"], fontsize=17)
    ax.annotate("", xy=x + [0.55, 0.45], xytext=x + [0.0, 0.45], arrowprops=dict(arrowstyle="-|>", lw=2.8, color=C["x"]))
    ax.text(x[0] - 0.55, x[1] + 0.58, r"$\mathcal{F}=K_d(x_d-x)-D_d\dot x$", fontsize=15, color=C["x"])
    ax.text(0.0, -0.55, r"$\tau = J^\top \mathcal{F} + g(q)$", fontsize=17)
    ax.set_aspect("equal"); ax.set_xlim(-0.3, 2.95); ax.set_ylim(-0.75, 1.3)
    ax.plot(0, 0, "s", color=C["dark"], ms=8)
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    for s in ax.spines.values():
        s.set_visible(False)
    # 1-D response to an external push: Lambda x'' + D x' + K x = F_ext
    ax = axs[1]
    Lam, dt = 2.0, 1e-3
    t = np.arange(0, 3, dt)
    Fext = np.where((t > 0.5) & (t < 1.5), 10.0, 0.0)
    for K, col in ((100, C["a"]), (1000, C["b"])):
        D = 2 * 0.7 * np.sqrt(K * Lam)
        x, v, xs = 0.0, 0.0, []
        for f in Fext:
            a_ = (f - D * v - K * x) / Lam
            v += a_ * dt; x += v * dt; xs.append(x)
        ax.plot(t, 100 * np.array(xs), color=col, label=f"$K_d={K}$ N/m")
        ax.axhline(100 * 10 / K, color=col, ls=":", lw=1.3)
    ax2 = ax.twinx()
    ax2.fill_between(t, Fext, color=C["gray"], alpha=0.15, step="mid")
    ax2.set_ylim(0, 40); ax2.set_ylabel(r"$\mathcal{F}_{\mathrm{ext}}$ [N]", color=C["gray"])
    ax2.grid(False); ax2.spines["right"].set_visible(True)
    ax.set_xlabel("t [s]"); ax.set_ylabel(r"$\tilde x$ [cm]")
    ax.legend(fontsize=13, loc="upper right")
    ax.set_title(r"$\Lambda_d=2$ kg, $\zeta=0.7$, push 10 N")
    ax.set_zorder(ax2.get_zorder() + 1); ax.patch.set_visible(False)
    fig.tight_layout()
    save(fig, OUT / "01-impedance.svg")


# ----------------------------------------------------------------- 10. A* versus Dijkstra
def make_grid():
    G = np.zeros((30, 40), bool)  # rows = y, cols = x
    G[5:25, 12:14] = True
    G[0:18, 24:26] = True
    G[22:30, 24:26] = True
    G[12:14, 26:35] = True
    return G


def astar(G, start, goal, use_h=True):
    H, W = G.shape
    h = (lambda n: np.hypot(n[0] - goal[0], n[1] - goal[1])) if use_h else (lambda n: 0.0)
    g = {start: 0.0}; parent = {start: None}; closed = {}
    pq = [(h(start), 0, start)]; cnt = 0
    nbrs = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]
    while pq:
        f, _, n = heapq.heappop(pq)
        if n in closed:
            continue
        closed[n] = len(closed)
        if n == goal:
            break
        for dx, dy in nbrs:
            m = (n[0] + dx, n[1] + dy)
            if not (0 <= m[0] < W and 0 <= m[1] < H) or G[m[1], m[0]]:
                continue
            if dx and dy and (G[n[1], m[0]] or G[m[1], n[0]]):
                continue  # no corner cutting
            ng = g[n] + (np.sqrt(2) if dx and dy else 1.0)
            if ng < g.get(m, np.inf):
                g[m] = ng; parent[m] = n; cnt += 1
                heapq.heappush(pq, (ng + h(m), cnt, m))
    path = [goal]
    while parent[path[-1]] is not None:
        path.append(parent[path[-1]])
    return closed, np.array(path[::-1]), g[goal]


def fig_astar():
    G = make_grid(); start, goal = (3, 4), (37, 26)
    fig, axs = plt.subplots(1, 2, figsize=(10, 4.4))
    for ax, use_h, name in ((axs[0], False, "Dijkstra ($h=0$)"), (axs[1], True, r"A* ($h=\Vert n-n_{goal}\Vert$)")):
        closed, path, cost = astar(G, start, goal, use_h)
        order = np.full(G.shape, np.nan)
        for (x, y), k in closed.items():
            order[y, x] = k
        ax.imshow(np.where(G, 1, np.nan), origin="lower", cmap="Greys", vmin=0, vmax=1.2, extent=[-.5, 39.5, -.5, 29.5])
        im = ax.imshow(order, origin="lower", cmap="viridis", alpha=0.85, extent=[-.5, 39.5, -.5, 29.5])
        ax.plot(path[:, 0], path[:, 1], color=C["x"], lw=3.2)
        ax.plot(*start, "o", ms=12, color="white", mec=C["dark"], mew=2)
        ax.plot(*goal, "*", ms=20, color=C["b"], mec=C["dark"])
        ax.set_title(f"{name}\n{len(closed)} expanded, cost {cost:.2f}", fontsize=15)
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
        print(name, "expanded", len(closed), "cost", round(cost, 3))
    cb = fig.colorbar(im, ax=axs, fraction=0.025, pad=0.02); cb.set_label("expansion order")
    save(fig, OUT / "01-astar.svg")


# ----------------------------------------------------------------- 11. RRT (the post's code) and RRT*
OBST = [(np.array([0.5, 0.5]), 0.2), (np.array([0.25, 0.8]), 0.12)]


def free(p):
    return all(np.linalg.norm(p - c) > r for c, r in OBST)


def edge_free(a, b, n=20):
    return all(free(a + t * (b - a)) for t in np.linspace(0, 1, n))


def rrt(rng, start, goal, step=0.05, iters=5000, goal_bias=0.1):
    nodes, parent = [start], [-1]
    for _ in range(iters):
        x_rand = goal if rng.random() < goal_bias else rng.random(2)
        i = int(np.argmin([np.linalg.norm(n - x_rand) for n in nodes]))
        d = x_rand - nodes[i]
        x_new = nodes[i] + d * min(1.0, step / (np.linalg.norm(d) + 1e-12))
        if not edge_free(nodes[i], x_new):
            continue
        nodes.append(x_new); parent.append(i)
        if np.linalg.norm(x_new - goal) < step and edge_free(x_new, goal):
            nodes.append(goal); parent.append(len(nodes) - 2)
            path, j = [], len(nodes) - 1
            while j != -1:
                path.append(nodes[j]); j = parent[j]
            return np.array(path[::-1]), np.array(nodes), parent
    return None, np.array(nodes), parent


def rrt_star(rng, start, goal, n_samples, step=0.05, gamma=0.5, goal_r=0.05):
    """RRT* with choose-parent and rewiring in a radius r_n = min(gamma (log n / n)^(1/2), step*2)."""
    nodes = [start]; parent = [-1]; cost = [0.0]
    best, best_len, hist = None, np.inf, []
    for it in range(n_samples):
        x_rand = rng.random(2)
        P = np.array(nodes)
        dist = np.linalg.norm(P - x_rand, axis=1)
        i = int(np.argmin(dist))
        d = x_rand - nodes[i]
        x_new = nodes[i] + d * min(1.0, step / (np.linalg.norm(d) + 1e-12))
        if not edge_free(nodes[i], x_new):
            hist.append(best_len); continue
        n = len(nodes) + 1
        r = min(gamma * np.sqrt(np.log(n) / n), 2 * step)
        dn = np.linalg.norm(P - x_new, axis=1)
        near = np.where(dn < r)[0]
        bp, bc = i, cost[i] + np.linalg.norm(x_new - nodes[i])
        for j in near:
            c = cost[j] + dn[j]
            if c < bc and edge_free(nodes[j], x_new):
                bp, bc = j, c
        nodes.append(x_new); parent.append(bp); cost.append(bc); k = len(nodes) - 1
        for j in near:
            c = bc + dn[j]
            if c < cost[j] - 1e-12 and edge_free(x_new, nodes[j]):
                parent[j] = k
                delta = cost[j] - c
                # propagate the cost decrease to the subtree of j
                stack = [j]
                while stack:
                    u = stack.pop(); cost[u] -= delta
                    for w, pw in enumerate(parent):
                        if pw == u:
                            stack.append(w)
        # goal connection: best node within goal_r
        Pn = np.array(nodes)
        dg = np.linalg.norm(Pn - goal, axis=1)
        cand = np.where(dg < goal_r)[0]
        for j in cand:
            if cost[j] + dg[j] < best_len and edge_free(nodes[j], goal):
                best_len, best = cost[j] + dg[j], j
        if best is not None:
            best_len = cost[best] + np.linalg.norm(nodes[best] - goal)
        hist.append(best_len)
    path = None
    if best is not None:
        path, j = [goal], best
        while j != -1:
            path.append(nodes[j]); j = parent[j]
        path = np.array(path[::-1])
    return path, np.array(nodes), parent, np.array(hist)


def plot_tree(ax, nodes, parent, col):
    segs = [(nodes[p], nodes[i]) for i, p in enumerate(parent) if p >= 0]
    from matplotlib.collections import LineCollection
    ax.add_collection(LineCollection(segs, colors=col, linewidths=0.9, alpha=0.8))


def fig_rrt():
    start, goal = np.array([0.1, 0.1]), np.array([0.9, 0.9])
    path, nodes, parent = rrt(np.random.default_rng(0), start, goal)
    L = np.sum(np.linalg.norm(np.diff(path, axis=0), axis=1))
    print(f"RRT (post code, seed 0): tree size {len(nodes)}, waypoints {len(path)}, length {L:.3f}")
    ps, nodes_s, parent_s, hist = rrt_star(np.random.default_rng(3), start, goal, 2500)
    Ls = np.sum(np.linalg.norm(np.diff(ps, axis=0), axis=1))
    print(f"RRT*: nodes {len(nodes_s)}, length {Ls:.3f}")
    # optimal length: straight line is blocked; compute a lower bound reference via a fine visibility estimate
    fig = plt.figure(figsize=(9, 9.6))
    gs = fig.add_gridspec(2, 2, height_ratios=[1, 0.85])
    axs = [fig.add_subplot(gs[0, 0]), fig.add_subplot(gs[0, 1]), fig.add_subplot(gs[1, :])]
    for ax, (pth, nd, par, name, l) in zip(axs[:2], ((path, nodes, parent, "RRT", L), (ps, nodes_s, parent_s, "RRT*", Ls))):
        for c, r in OBST:
            ax.add_patch(Circle(c, r, color=C["gray"], alpha=0.55))
        plot_tree(ax, nd, par, C["z"])
        ax.plot(pth[:, 0], pth[:, 1], color=C["x"], lw=3)
        ax.plot(*start, "o", ms=12, color="white", mec=C["dark"], mew=2)
        ax.plot(*goal, "*", ms=20, color=C["b"], mec=C["dark"])
        ax.set_aspect("equal"); ax.set_xlim(0, 1); ax.set_ylim(0, 1)
        ax.set_title(f"{name}: {len(nd)} nodes\nL = {l:.3f}", fontsize=15)
        ax.set_xticks([0, 0.5, 1]); ax.set_yticks([0, 0.5, 1])
    ax = axs[2]
    for seed in range(5):
        _, _, _, h = rrt_star(np.random.default_rng(10 + seed), start, goal, 2500)
        ax.plot(np.arange(1, len(h) + 1), h, color=C["a"], lw=1.4, alpha=0.75, label="RRT*" if seed == 0 else None)
    Lr = []
    for seed in range(20):
        p_, _, _ = rrt(np.random.default_rng(100 + seed), start, goal)
        Lr.append(np.sum(np.linalg.norm(np.diff(p_, axis=0), axis=1)))
    ax.axhline(np.mean(Lr), color=C["x"], ls="--", lw=2, label=f"RRT (mean of 20) {np.mean(Lr):.2f}")
    ax.set_xscale("log"); ax.set_xlabel("samples $n$"); ax.set_ylabel("path length")
    ax.set_xticks([100, 300, 1000, 2500]); ax.set_xticklabels(["100", "300", "1000", "2500"])
    ax.minorticks_off(); ax.set_xlim(100, 2600)
    ax.set_ylim(1.15, 1.6); ax.legend(fontsize=13)
    ax.set_title("cost vs. samples")
    fig.tight_layout()
    save(fig, OUT / "01-rrt.svg")


if __name__ == "__main__":
    fig_rotation()
    fig_frame_chain()
    fig_screw()
    fig_dh()
    fig_workspace()
    fig_manipulability()
    fig_ik()
    fig_pid()
    fig_impedance()
    fig_astar()
    fig_rrt()
