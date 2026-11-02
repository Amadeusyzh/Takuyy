"""Figures for graphics post 09 (animation and characters).

Everything is computed with NumPy from the post's own code: splines and their bases, arc-length
reparameterization, slerp vs squad on the sphere, forward kinematics, linear blend vs dual
quaternion skinning, delta blendshapes, CCD vs FABRIK, a toy motion-matching search and a
PD-tracked two-link pendulum. Conventions: z is up in 3D figures.

    python3 bin/figures/graphics/graphics_09.py
"""
import pathlib
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib import cm  # noqa: E402
from matplotlib.colors import Normalize, to_rgb  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402

plt.rcParams["savefig.dpi"] = 200

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics"


def out(name):
    return OUT / f"09-{name}.svg"


# ---------------------------------------------------------------------------
# 1. Splines
# ---------------------------------------------------------------------------
KEYS = np.array([[0.0, 0.0], [1.0, 1.6], [2.2, 1.9], [3.0, 0.6], [4.2, 0.2], [5.0, 1.5], [6.2, 1.8]])


def hermite(p0, p1, m0, m1, t):
    t = t[:, None]
    h00, h10 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t
    h01, h11 = -2 * t**3 + 3 * t**2, t**3 - t**2
    return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1


def catmull_rom(P, n=40):
    Q = np.vstack([P[:1], P, P[-1:]])  # duplicate the end points
    t = np.linspace(0, 1, n)
    segs = [hermite(Q[i], Q[i + 1], (Q[i + 1] - Q[i - 1]) / 2, (Q[i + 2] - Q[i]) / 2, t)
            for i in range(1, len(Q) - 2)]
    return np.vstack(segs)


def bspline(P, n=40):
    t = np.linspace(0, 1, n)[:, None]
    b0, b1 = (1 - t) ** 3 / 6, (3 * t**3 - 6 * t**2 + 4) / 6
    b2, b3 = (-3 * t**3 + 3 * t**2 + 3 * t + 1) / 6, t**3 / 6
    return np.vstack([b0 * P[i - 1] + b1 * P[i] + b2 * P[i + 1] + b3 * P[i + 2] for i in range(1, len(P) - 2)])


def bezier(c, t):
    t = t[:, None]
    return (1 - t) ** 3 * c[0] + 3 * (1 - t) ** 2 * t * c[1] + 3 * (1 - t) * t**2 * c[2] + t**3 * c[3]


def fig_spline_family():
    fig, axs = plt.subplots(1, 3, figsize=(17, 4.8), gridspec_kw=dict(width_ratios=[1.8, 1, 1]))
    ax = axs[0]
    ax.plot(*KEYS.T, "--", color=C["gray"], lw=1.4, label="linear")
    t = np.linspace(0, 1, 60)
    bz = np.vstack([bezier(KEYS[0:4], t), bezier(KEYS[3:7], t)])
    ax.plot(*bz.T, color=C["b"], label="Bézier ($P_0..P_3$, $P_3..P_6$)")
    ax.plot(*catmull_rom(KEYS).T, color=C["a"], lw=2.6, label="Catmull-Rom")
    ax.plot(*bspline(KEYS).T, color=C["y"], label="cubic B-spline")
    ax.plot(*KEYS.T, "o", color=C["dark"], ms=8, zorder=5)
    for i, p in enumerate(KEYS):
        ax.text(p[0] + 0.08, p[1] + 0.1, f"$P_{i}$", fontsize=14)
    ax.legend(fontsize=11, loc="lower center", ncol=2)
    ax.set_aspect("equal"); ax.set_ylim(-0.9, 2.4)
    tt = np.linspace(0, 1, 200)
    ax = axs[1]
    for y, lab, col in [(2 * tt**3 - 3 * tt**2 + 1, r"$h_{00}$", C["a"]), (tt**3 - 2 * tt**2 + tt, r"$h_{10}$", C["b"]),
                        (-2 * tt**3 + 3 * tt**2, r"$h_{01}$", C["z"]), (tt**3 - tt**2, r"$h_{11}$", C["y"])]:
        ax.plot(tt, y, color=col, label=lab)
    ax.set_title("Hermite basis"); ax.set_xlabel("$t$"); ax.legend(fontsize=12)
    ax = axs[2]
    for y, lab, col in [((1 - tt) ** 3 / 6, r"$b_0$", C["a"]), ((3 * tt**3 - 6 * tt**2 + 4) / 6, r"$b_1$", C["b"]),
                        ((-3 * tt**3 + 3 * tt**2 + 3 * tt + 1) / 6, r"$b_2$", C["z"]), (tt**3 / 6, r"$b_3$", C["y"])]:
        ax.plot(tt, y, color=col, label=lab)
    ax.set_title("uniform cubic B-spline basis"); ax.set_xlabel("$t$"); ax.legend(fontsize=12)
    save(fig, out("spline-family"))


def fig_continuity():
    a = np.array([[0, 0], [1, 1], [2, 1], [3, 0]], float)
    t = np.linspace(0, 1, 200)
    fig, axs = plt.subplots(1, 2, figsize=(15, 4.8))
    variants = [("$C^0$", a[3] + np.array([0.7, 0.9]), C["x"]),
                ("$G^1$", a[3] + 0.3 * (a[3] - a[2]), C["b"]),
                ("$C^1$", a[3] + 1.0 * (a[3] - a[2]), C["a"])]
    A = bezier(a, t)
    dA = 3 * ((1 - t[:, None]) ** 2 * (a[1] - a[0]) + 2 * (1 - t[:, None]) * t[:, None] * (a[2] - a[1]) + t[:, None] ** 2 * (a[3] - a[2]))
    axs[0].plot(*A.T, color=C["dark"], lw=2.6)
    for lab, b1, col in variants:
        b = np.array([a[3], b1, [5, -1.2], [6, 0]])
        B = bezier(b, t)
        dB = 3 * ((1 - t[:, None]) ** 2 * (b[1] - b[0]) + 2 * (1 - t[:, None]) * t[:, None] * (b[2] - b[1]) + t[:, None] ** 2 * (b[3] - b[2]))
        axs[0].plot(*B.T, color=col, label=lab)
        axs[0].plot(*b[:2].T, "o--", color=col, ms=6, lw=1)
        axs[1].plot(np.r_[t, 1 + t], np.r_[np.linalg.norm(dA, axis=1), np.linalg.norm(dB, axis=1)], color=col, label=lab)
    axs[0].plot(*a.T, "o--", color=C["gray"], ms=6, lw=1)
    axs[0].set_aspect("equal"); axs[0].legend(fontsize=12, loc="lower left")
    axs[0].set_title("two cubic segments joined at $(3,0)$")
    axs[1].axvline(1, color=C["gray"], ls=":")
    axs[1].set_xlabel("global parameter $u$"); axs[1].set_ylabel(r"speed $\Vert dp/du \Vert$")
    axs[1].legend(fontsize=12)
    save(fig, out("continuity"))


def fig_arc_length():
    c = np.array([[0, 0], [0.3, 2.4], [3.4, 2.4], [4, 0]], float)
    curve = lambda t: bezier(c, np.atleast_1d(t))  # noqa: E731
    t_tab = np.linspace(0, 1, 2000)
    p = curve(t_tab)
    s_tab = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    n = 17
    t_uni = np.linspace(0, 1, n)
    t_arc = np.interp(np.linspace(0, s_tab[-1], n), s_tab, t_tab)
    fig, axs = plt.subplots(1, 2, figsize=(15, 5))
    axs[0].plot(*p.T, color=C["gray"], lw=1.5)
    pu, pa = curve(t_uni), curve(t_arc)
    axs[0].plot(*pu.T, "o", color=C["b"], ms=9, label="uniform $t$")
    axs[0].plot(pa[:, 0], pa[:, 1] - 0.25, "s", color=C["a"], ms=8, label="uniform $s$ (shifted down)")
    axs[0].plot(*c.T, "--", color=C["gray"], lw=1)
    axs[0].set_aspect("equal"); axs[0].legend(fontsize=12, loc="lower center")
    axs[0].set_title(f"{n} samples on a cubic Bézier")
    axs[1].plot(t_tab, s_tab / s_tab[-1], color=C["a"], label=r"$s(t)/L$")
    axs[1].plot(t_tab, t_tab, ":", color=C["gray"])
    for ta in t_arc:
        sa = np.interp(ta, t_tab, s_tab) / s_tab[-1]
        axs[1].plot([0, ta, ta], [sa, sa, 0], color=C["a"], lw=0.6, alpha=0.6)
    axs[1].set_xlabel("$t$"); axs[1].set_ylabel("$s/L$")
    axs[1].set_title(f"arc-length table, $L$ = {s_tab[-1]:.3f}")
    axs[1].legend(fontsize=12)
    save(fig, out("arc-length"))


# ---------------------------------------------------------------------------
# 2. Quaternions: slerp vs squad
# ---------------------------------------------------------------------------
def qmul(a, b):
    w1, x1, y1, z1 = a
    w2, x2, y2, z2 = b
    return np.array([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                     w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2])


def qconj(q):
    return q * np.array([1, -1, -1, -1])


def qexp(v):
    a = np.linalg.norm(v)
    if a < 1e-12:
        return np.array([1.0, *v])
    return np.r_[np.cos(a), np.sin(a) * v / a]


def qlog(q):
    v = q[1:]
    s = np.linalg.norm(v)
    if s < 1e-12:
        return np.zeros(3)
    return np.arctan2(s, q[0]) * v / s


def qpow_rel(q0, q1, t):  # slerp along the shortest arc
    if q0 @ q1 < 0:
        q1 = -q1
    return qmul(q0, qexp(t * qlog(qmul(qconj(q0), q1))))


def squad_ctrl(Q):
    S = [Q[0]]
    for i in range(1, len(Q) - 1):
        qi = qconj(Q[i])
        S.append(qmul(Q[i], qexp(-(qlog(qmul(qi, Q[i + 1])) + qlog(qmul(qi, Q[i - 1]))) / 4)))
    S.append(Q[-1])
    return S


def squad(q0, q1, s0, s1, h):
    return qpow_rel(qpow_rel(q0, q1, h), qpow_rel(s0, s1, h), 2 * h * (1 - h))


def rotate(q, v):
    return qmul(qmul(q, np.r_[0, v]), qconj(q))[1:]


def axis_angle(rv):
    return qexp(0.5 * np.asarray(rv, float))


def fig_squad():
    R = [(0, 0, 0), (0.9, 0.2, 0), (0.7, 1.1, 0.3), (-0.2, 1.4, 0.6), (-0.7, 0.6, 1.0), (-0.4, -0.3, 0.8)]
    Q = [axis_angle(r) for r in R]
    for i in range(1, len(Q)):
        if Q[i] @ Q[i - 1] < 0:
            Q[i] = -Q[i]
    S = squad_ctrl(Q)
    v = np.array([0.0, 0.0, 1.0])
    m = 60
    paths = {"slerp": [], "squad": []}
    qs = {"slerp": [], "squad": []}
    for i in range(len(Q) - 1):
        for h in np.linspace(0, 1, m, endpoint=False):
            a = qpow_rel(Q[i], Q[i + 1], h)
            b = squad(Q[i], Q[i + 1], S[i], S[i + 1], h)
            qs["slerp"].append(a); qs["squad"].append(b)
            paths["slerp"].append(rotate(a, v)); paths["squad"].append(rotate(b, v))
    fig = plt.figure(figsize=(15, 6))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    u, w = np.meshgrid(np.linspace(0, 2 * np.pi, 36), np.linspace(0, np.pi, 18))
    ax.plot_wireframe(np.cos(u) * np.sin(w), np.sin(u) * np.sin(w), np.cos(w), color=C["gray"], lw=0.3, alpha=0.35)
    for key, col in [("slerp", C["b"]), ("squad", C["a"])]:
        P = np.array(paths[key])
        ax.plot(*P.T, color=col, lw=2.6, label=key)
    K = np.array([rotate(q, v) for q in Q])
    ax.scatter(*K.T, color=C["dark"], s=50, depthshade=False)
    for i, k in enumerate(K):
        ax.text(*(k * 1.12), f"$q_{i}$", fontsize=14)
    ax.set_box_aspect((1, 1, 1)); ax.set_axis_off(); ax.view_init(elev=28, azim=35)
    ax.legend(loc="upper left", fontsize=12)
    ax.set_title(r"path of $R(t)\,\hat z$ on the unit sphere", fontsize=14)
    ax = fig.add_subplot(1, 2, 2)
    dt = 1.0 / m
    for key, col in [("slerp", C["b"]), ("squad", C["a"])]:
        qq = qs[key] + [Q[-1]]
        speed = [2 * np.linalg.norm(qlog(qmul(qconj(qq[k]), qq[k + 1] if qq[k] @ qq[k + 1] >= 0 else -qq[k + 1]))) / dt
                 for k in range(len(qq) - 1)]
        tt = (np.arange(len(speed)) + 0.5) * dt
        ax.plot(tt, speed, color=col, label=key)
    for i in range(1, len(Q) - 1):
        ax.axvline(i, color=C["gray"], ls=":", lw=1)
    ax.set_xlabel("time (one unit per key interval)")
    ax.set_ylabel(r"angular speed $\Vert\omega\Vert$ (rad / unit)")
    ax.legend(fontsize=12)
    save(fig, out("squad"))


# ---------------------------------------------------------------------------
# 3. Forward kinematics of a small skeleton
# ---------------------------------------------------------------------------
def rot(axis, deg):
    a = np.deg2rad(deg)
    c, s = np.cos(a), np.sin(a)
    if axis == "x":
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == "y":
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


SKEL = [  # name, parent, offset in parent frame
    ("pelvis", -1, (0, 0, 1.0)), ("spine", 0, (0, 0, 0.22)), ("chest", 1, (0, 0, 0.25)),
    ("neck", 2, (0, 0, 0.22)), ("head", 3, (0, 0, 0.16)),
    ("l_shoulder", 2, (0.18, 0, 0.18)), ("l_elbow", 5, (0.3, 0, 0)), ("l_wrist", 6, (0.27, 0, 0)),
    ("r_shoulder", 2, (-0.18, 0, 0.18)), ("r_elbow", 8, (-0.3, 0, 0)), ("r_wrist", 9, (-0.27, 0, 0)),
    ("l_hip", 0, (0.11, 0, 0)), ("l_knee", 11, (0, 0, -0.46)), ("l_ankle", 12, (0, 0, -0.43)),
    ("r_hip", 0, (-0.11, 0, 0)), ("r_knee", 14, (0, 0, -0.46)), ("r_ankle", 15, (0, 0, -0.43)),
]


def forward_kinematics(skel, local_rot):
    G = []
    for j, (_, parent, off) in enumerate(skel):
        T = np.eye(4)
        T[:3, :3] = local_rot[j]
        T[:3, 3] = off
        G.append(T if parent < 0 else G[parent] @ T)
    return G


def fig_fk():
    n = len(SKEL)
    bind = [np.eye(3)] * n
    pose = [np.eye(3) for _ in range(n)]
    pose[0] = rot("z", 25)
    pose[1] = rot("x", 12)
    pose[2] = rot("z", -20)
    pose[5] = rot("y", -55) @ rot("z", 20)
    pose[6] = rot("z", 75)
    pose[8] = rot("y", -50)
    pose[9] = rot("z", -40)
    pose[11] = rot("x", 35)
    pose[12] = rot("x", -60)
    pose[14] = rot("x", -15)
    pose[15] = rot("x", -20)
    fig = plt.figure(figsize=(15, 7))
    for k, (R, title) in enumerate([(bind, "bind pose"), (pose, "posed")]):
        G = forward_kinematics(SKEL, R)
        P = np.array([g[:3, 3] for g in G])
        ax = fig.add_subplot(1, 2, k + 1, projection="3d")
        for j, (_, parent, _) in enumerate(SKEL):
            if parent >= 0:
                ax.plot(*np.array([P[parent], P[j]]).T, color=C["dark"], lw=3)
        for g in G:
            for c, col in enumerate((C["x"], C["y"], C["z"])):
                ax.plot(*np.array([g[:3, 3], g[:3, 3] + 0.09 * g[:3, c]]).T, color=col, lw=2)
        ax.scatter(*P.T, color=C["a"], s=25, depthshade=False)
        ax.set_xlim(-0.8, 0.8); ax.set_ylim(-0.8, 0.8); ax.set_zlim(0, 1.6)
        ax.set_box_aspect((1, 1, 1)); ax.view_init(elev=12, azim=-65)
        ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
        ax.set_title(title + f": {n} joints", fontsize=14)
    save(fig, out("fk-skeleton"))


# ---------------------------------------------------------------------------
# 4. Skinning: LBS vs DQS on a twisted cylinder
# ---------------------------------------------------------------------------
def dq_from_rt(q, t):
    return q, 0.5 * qmul(np.r_[0, t], q)


def dq_apply(real, dual, p):
    t = 2 * qmul(dual, qconj(real))[1:]
    return rotate(real, p) + t


def skin_lbs(P, W, Rs, ts):
    return sum(W[:, k:k + 1] * (P @ Rs[k].T + ts[k]) for k in range(len(Rs)))


def skin_dqs(P, W, qs, ts):
    dqs = [dq_from_rt(q, t) for q, t in zip(qs, ts)]
    out_ = np.zeros_like(P)
    for i, p in enumerate(P):
        r, d = np.zeros(4), np.zeros(4)
        for k, (qr, qd) in enumerate(dqs):
            s = 1.0 if qr @ dqs[0][0] >= 0 else -1.0  # same hemisphere as bone 0
            r += W[i, k] * s * qr
            d += W[i, k] * s * qd
        nrm = np.linalg.norm(r)
        out_[i] = dq_apply(r / nrm, d / nrm, p)
    return out_


def quat_to_mat(q):
    w, x, y, z = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
                     [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
                     [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])


def cylinder(nx=48, nt=32, r=0.3, length=2.0):
    x = np.linspace(0, length, nx)
    th = np.linspace(0, 2 * np.pi, nt, endpoint=False)
    X, T = np.meshgrid(x, th, indexing="ij")
    P = np.stack([X, r * np.cos(T), r * np.sin(T)], -1).reshape(-1, 3)
    quads = []
    for i in range(nx - 1):
        for j in range(nt):
            a, b = i * nt + j, i * nt + (j + 1) % nt
            quads.append([a, b, b + nt, a + nt])
    return P, np.array(quads), x


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def fig_lbs_dqs():
    P, Fq, xs = cylinder()
    r0 = 0.3
    w1 = smoothstep(0.6, 1.4, P[:, 0])
    W = np.c_[1 - w1, w1]
    theta = 160.0
    q1 = axis_angle(np.deg2rad(theta) * np.array([1.0, 0, 0]))
    qs = [np.array([1.0, 0, 0, 0]), q1]
    Rs = [np.eye(3), quat_to_mat(q1)]
    ts = [np.zeros(3), np.zeros(3)]   # twist axis = x axis, through both joints
    L = skin_lbs(P, W, Rs, ts)
    D = skin_dqs(P, W, qs, ts)
    fig = plt.figure(figsize=(17, 5.2))
    norm = Normalize(0, 1)
    for k, (X, title) in enumerate([(L, "LBS"), (D, "DQS")]):
        ax = fig.add_subplot(1, 3, k + 1, projection="3d")
        rad = np.hypot(X[:, 1], X[:, 2]) / r0
        stripe = ((np.arange(len(P)) % 32) // 4) % 2  # stripes reveal the twist
        cols = np.asarray(cm.viridis(norm(rad[Fq].mean(1))))[:, :3] * (0.75 + 0.25 * stripe[Fq[:, 0]])[:, None]
        pc = Poly3DCollection(X[Fq], facecolors=cols, edgecolors=cols, linewidths=0.2)
        pc.set_rasterized(True)
        ax.add_collection3d(pc)
        ax.set_xlim(0, 2); ax.set_ylim(-1, 1); ax.set_zlim(-1, 1)
        ax.set_box_aspect((1, 1, 1)); ax.view_init(elev=18, azim=-70); ax.set_axis_off()
        ax.set_title(f"{title}, twist {theta:.0f}°", fontsize=14)
    ax = fig.add_subplot(1, 3, 3)
    nt = 32
    for X, lab, col in [(L, "LBS", C["b"]), (D, "DQS", C["a"])]:
        rad = np.hypot(X[:, 1], X[:, 2]).reshape(len(xs), nt).mean(1)
        area = np.pi * rad**2
        vol = np.sum(0.5 * (area[1:] + area[:-1]) * np.diff(xs)) / (np.pi * r0**2 * xs[-1])
        ax.plot(xs, rad / r0, color=col, label=f"{lab}: volume {vol:.2f}")
    ww = smoothstep(0.6, 1.4, xs)
    ax.plot(xs, np.sqrt((1 - ww) ** 2 + ww**2 + 2 * (1 - ww) * ww * np.cos(np.deg2rad(theta))), ":",
            color=C["dark"], lw=1.5, label=r"$\sqrt{w_0^2+w_1^2+2w_0w_1\cos\theta}$")
    ax.axhline(1, color=C["gray"], ls="--", lw=1)
    ax.set_xlabel("$x$ along the limb"); ax.set_ylabel("radius / rest radius")
    ax.set_ylim(0, 1.15); ax.legend(fontsize=11, loc="lower left")
    save(fig, out("lbs-dqs"))


# ---------------------------------------------------------------------------
# 5. Blendshapes on a 2D face
# ---------------------------------------------------------------------------
def face_parts():
    th = np.linspace(0, 2 * np.pi, 80)
    outline = np.c_[0.95 * np.cos(th), 1.15 * np.sin(th)]
    xm = np.linspace(-0.42, 0.42, 21)
    upper = np.c_[xm, -0.42 + 0.03 * (1 - (xm / 0.42) ** 2)]
    lower = np.c_[xm, -0.42 - 0.03 * (1 - (xm / 0.42) ** 2)]
    eye = np.c_[0.12 * np.cos(th), 0.07 * np.sin(th)]
    brow = np.c_[np.linspace(-0.16, 0.16, 9), 0.33 + 0.02 * (1 - (np.linspace(-1, 1, 9)) ** 2)]
    return dict(outline=outline, upper=upper, lower=lower, leye=eye + [-0.35, 0.18], reye=eye + [0.35, 0.18],
                lbrow=brow + [-0.35, 0], rbrow=brow + [0.35, 0])


def face_deltas(parts):
    D = {"smile": {}, "jaw": {}}
    for k, p in parts.items():
        D["smile"][k] = np.zeros_like(p)
        D["jaw"][k] = np.zeros_like(p)
    for lip in ("upper", "lower"):
        x = parts[lip][:, 0]
        D["smile"][lip][:, 1] = 0.16 * (x / 0.42) ** 2
        D["smile"][lip][:, 0] = 0.08 * x / 0.42
    x = parts["lower"][:, 0]
    D["jaw"]["lower"][:, 1] = -0.28 * (1 - (x / 0.42) ** 2) - 0.05
    o = parts["outline"]
    D["jaw"]["outline"][:, 1] = -0.18 * np.clip(-o[:, 1] / 1.15, 0, 1) ** 2
    for eye in ("leye", "reye"):  # smiling squints the eyes a little
        e = parts[eye]
        D["smile"][eye][:, 1] = -0.35 * (e[:, 1] - e[:, 1].mean()) * (e[:, 1] < e[:, 1].mean())
    return D


def fig_blendshapes():
    parts = face_parts()
    D = face_deltas(parts)
    weights = [(0, 0), (1, 0), (0, 1), (0.7, 0.6), (1.5, 0)]
    fig, axs = plt.subplots(1, 5, figsize=(18, 4.4))
    for ax, (ws, wj) in zip(axs, weights):
        for k, p in parts.items():
            q = p + ws * D["smile"][k] + wj * D["jaw"][k]
            closed = k in ("outline", "leye", "reye")
            if closed:
                q = np.vstack([q, q[:1]])
            ax.plot(*q.T, color=C["dark"] if k == "outline" else (C["x"] if k in ("upper", "lower") else C["a"]), lw=2.2)
        ax.set_aspect("equal"); ax.axis("off")
        ax.set_xlim(-1.1, 1.1); ax.set_ylim(-1.45, 1.25)
        ax.set_title(f"$w = ({ws:g},\\ {wj:g})$", fontsize=15)
    save(fig, out("blendshapes"))


# ---------------------------------------------------------------------------
# 6. IK: CCD vs FABRIK
# ---------------------------------------------------------------------------
LENGTHS = np.array([1.0, 0.8, 0.6, 0.4])
TARGET = np.array([0.6, 1.9])


def fk2(angles):
    a = np.cumsum(angles)
    return np.vstack([[0, 0], np.cumsum(np.c_[LENGTHS * np.cos(a), LENGTHS * np.sin(a)], axis=0)])


def ccd(angles, target, iters):
    angles = angles.copy()
    hist = [fk2(angles)]
    for _ in range(iters):
        for j in reversed(range(len(angles))):
            P = fk2(angles)
            to_end, to_tgt = P[-1] - P[j], target - P[j]
            angles[j] += np.arctan2(to_end[0] * to_tgt[1] - to_end[1] * to_tgt[0], to_end @ to_tgt)
        hist.append(fk2(angles))
    return hist


def fabrik(P, target, iters):
    P = P.copy()
    base = P[0].copy()
    hist = [P.copy()]
    for _ in range(iters):
        P[-1] = target                                   # backward: from the end effector
        for i in reversed(range(len(LENGTHS))):
            d = P[i] - P[i + 1]
            P[i] = P[i + 1] + LENGTHS[i] * d / np.linalg.norm(d)
        P[0] = base                                      # forward: from the root
        for i in range(len(LENGTHS)):
            d = P[i + 1] - P[i]
            P[i + 1] = P[i] + LENGTHS[i] * d / np.linalg.norm(d)
        hist.append(P.copy())
    return hist


def fig_ik():
    a0 = np.array([0.2, -0.3, -0.3, -0.2])
    hc = ccd(a0, TARGET, 20)
    hf = fabrik(fk2(a0), TARGET, 20)
    fig, axs = plt.subplots(1, 3, figsize=(17, 5.2))
    for ax, hist, title in [(axs[0], hc, "CCD"), (axs[1], hf, "FABRIK")]:
        show = [0, 1, 2, 3, 20]
        for k, it in enumerate(show):
            P = hist[it]
            al = 0.25 + 0.75 * k / (len(show) - 1)
            col = C["gray"] if it == 0 else (C["a"] if title == "CCD" else C["b"])
            ax.plot(*P.T, "-o", color=col, alpha=al, lw=2.4 if it == 20 else 1.6, ms=5, label=f"iter {it}")
        ax.plot(*TARGET, "*", color=C["x"], ms=18)
        ax.plot(0, 0, "ks", ms=9)
        ax.set_aspect("equal"); ax.set_xlim(-0.6, 3.0); ax.set_ylim(-1.0, 2.4)
        ax.legend(fontsize=11, loc="lower right"); ax.set_title(title)
    err_c = [np.linalg.norm(P[-1] - TARGET) for P in hc]
    err_f = [np.linalg.norm(P[-1] - TARGET) for P in hf]
    axs[2].semilogy(err_c, "o-", color=C["a"], label="CCD")
    axs[2].semilogy(err_f, "s-", color=C["b"], label="FABRIK")
    axs[2].set_xlabel("iteration"); axs[2].set_ylabel("end-effector error")
    axs[2].legend(fontsize=12)
    save(fig, out("ik-ccd-fabrik"))


# ---------------------------------------------------------------------------
# 7. Toy motion matching
# ---------------------------------------------------------------------------
def make_database(n=1500, dt=1 / 30, seed=2):
    rng = np.random.default_rng(seed)
    turn = np.convolve(rng.standard_normal(n + 60) * 2.2, np.ones(60) / 60, mode="same")[:n]
    speed = 1.2 + 2.3 * (np.convolve(rng.random(n + 90), np.ones(90) / 90, mode="same")[:n] > 0.5)
    speed = np.convolve(np.r_[np.full(15, speed[0]), speed, np.full(15, speed[-1])], np.ones(31) / 31, mode="valid")
    heading = np.cumsum(turn * dt)
    pos = np.cumsum(np.c_[speed * np.cos(heading), speed * np.sin(heading)] * dt, axis=0)
    return pos, heading, speed


def features(pos, heading, speed, horizons=(10, 20, 30)):
    n = len(pos) - max(horizons)
    F = []
    for i in range(n):
        c, s = np.cos(-heading[i]), np.sin(-heading[i])
        Rm = np.array([[c, -s], [s, c]])
        fut = [Rm @ (pos[i + h] - pos[i]) for h in horizons]
        F.append(np.r_[np.concatenate(fut), speed[i]])
    return np.array(F)


def fig_motion_matching():
    pos, heading, speed = make_database()
    F = features(pos, heading, speed)
    mu, sd = F.mean(0), F.std(0) + 1e-9
    # query: currently at 1.5 m/s, stick asks to run (3 m/s) while turning left at 1.0 rad/s
    v, wr = 3.0, 1.0
    q = []
    for h in (10, 20, 30):
        T = h / 30
        q += [v / wr * np.sin(wr * T), v / wr * (1 - np.cos(wr * T))]
    q = np.r_[q, 1.5]
    cost = (((F - q) / sd) ** 2).sum(1)
    best = int(np.argmin(cost))
    fig, axs = plt.subplots(1, 3, figsize=(17, 5.2), gridspec_kw=dict(width_ratios=[1.2, 1.2, 1]))
    ax = axs[0]
    ax.plot(*pos.T, color=C["gray"], lw=0.8)
    ax.plot(*pos[best:best + 31].T, color=C["a"], lw=3.5, label=f"best frame {best}")
    c, s = np.cos(heading[best]), np.sin(heading[best])
    Rw = np.array([[c, -s], [s, c]])
    qq = np.array([Rw @ q[2 * k:2 * k + 2] + pos[best] for k in range(3)])
    ax.plot(*np.vstack([pos[best], qq]).T, "o--", color=C["b"], ms=7, lw=2, label="desired future")
    ax.plot(*pos[best], "ko", ms=7)
    ax.set_aspect("equal"); ax.legend(fontsize=11, loc="best"); ax.set_title("database (top view, m)")
    ax = axs[1]
    ax.semilogy(cost, color=C["dark"], lw=0.8)
    ax.semilogy(best, cost[best], "o", color=C["a"], ms=10)
    ax.set_xlabel("database frame"); ax.set_ylabel("matching cost")
    ax = axs[2]
    Z = (F - mu) / sd
    U, S_, Vt = np.linalg.svd(Z, full_matrices=False)
    Y = Z @ Vt[:2].T
    yq = ((q - mu) / sd) @ Vt[:2].T
    sc = ax.scatter(Y[:, 0], Y[:, 1], c=np.log10(cost), cmap="viridis_r", s=6)
    ax.plot(*yq, "*", color=C["x"], ms=18, mec="white")
    ax.plot(*Y[best], "o", mfc="none", mec=C["a"], ms=14, mew=2.5)
    fig.colorbar(sc, ax=ax, shrink=0.8, label=r"$\log_{10}$ cost")
    ax.set_title("features, first two PCs"); ax.set_xticks([]); ax.set_yticks([])
    save(fig, out("motion-matching"))


# ---------------------------------------------------------------------------
# 8. PD tracking of a two-link pendulum
# ---------------------------------------------------------------------------
M1 = M2 = 1.0
L1 = L2 = 0.5
GRAV = 9.81


def dyn_terms(th, dth):
    d = th[0] - th[1]
    M = np.array([[(M1 + M2) * L1**2, M2 * L1 * L2 * np.cos(d)], [M2 * L1 * L2 * np.cos(d), M2 * L2**2]])
    c = np.array([M2 * L1 * L2 * np.sin(d) * dth[1] ** 2, -M2 * L1 * L2 * np.sin(d) * dth[0] ** 2])
    g = np.array([(M1 + M2) * GRAV * L1 * np.sin(th[0]), M2 * GRAV * L2 * np.sin(th[1])])
    return M, c, g


def reference(t):
    q = np.array([0.8 * np.sin(np.pi * t), 0.6 + 0.5 * np.sin(2 * np.pi * t)])          # relative angles
    dq = np.array([0.8 * np.pi * np.cos(np.pi * t), 0.5 * 2 * np.pi * np.cos(2 * np.pi * t)])
    ddq = np.array([-0.8 * np.pi**2 * np.sin(np.pi * t), -0.5 * (2 * np.pi) ** 2 * np.sin(2 * np.pi * t)])
    return q, dq, ddq


def simulate(kp, kd, feedforward=False, T=4.0, dt=1e-3):
    q0, dq0, _ = reference(0.0)
    th = np.array([q0[0], q0[0] + q0[1]])        # absolute angles from the downward vertical
    dth = np.array([dq0[0], dq0[0] + dq0[1]])
    ts, qs, refs = [], [], []
    for k in range(int(T / dt)):
        t = k * dt
        qr, dqr, ddqr = reference(t)
        q = np.array([th[0], th[1] - th[0]]); dq = np.array([dth[0], dth[1] - dth[0]])
        tau = kp * (qr - q) + kd * (dqr - dq)
        if feedforward:                          # inverse dynamics of the reference motion
            thr = np.array([qr[0], qr[0] + qr[1]]); dthr = np.array([dqr[0], dqr[0] + dqr[1]])
            ddthr = np.array([ddqr[0], ddqr[0] + ddqr[1]])
            Mr, cr, gr = dyn_terms(thr, dthr)
            Qff = Mr @ ddthr + cr + gr
            tau = tau + np.array([Qff[0] + Qff[1], Qff[1]])
        Qgen = np.array([tau[0] - tau[1], tau[1]])
        M, c, g = dyn_terms(th, dth)
        ddth = np.linalg.solve(M, Qgen - c - g)
        dth = dth + dt * ddth                    # symplectic Euler
        th = th + dt * dth
        ts.append(t); qs.append(q); refs.append(qr)
    return np.array(ts), np.array(qs), np.array(refs)


def fig_pd():
    fig, axs = plt.subplots(1, 2, figsize=(16, 5))
    runs = [(20, "kp = 20", C["c"], False), (100, "kp = 100", C["b"], False), (500, "kp = 500", C["a"], False),
            (100, "kp = 100 + inverse dynamics", C["y"], True)]
    for kp, lab, col, ff in runs:
        kd = 2 * np.sqrt(kp * 0.3)
        t, q, r = simulate(kp, kd, ff)
        axs[0].plot(t, q[:, 1], color=col, label=lab)
        axs[1].semilogy(t, np.linalg.norm(q - r, axis=1) + 1e-6, color=col, label=lab)
    axs[0].plot(t, r[:, 1], "--", color=C["dark"], lw=1.5, label="reference")
    axs[0].set_xlabel("time (s)"); axs[0].set_ylabel(r"elbow angle $q_2$ (rad)")
    axs[0].legend(fontsize=10, loc="lower left", ncol=2)
    axs[1].set_xlabel("time (s)"); axs[1].set_ylabel(r"tracking error $\Vert q - q_{ref}\Vert$ (rad)")
    axs[1].legend(fontsize=10, loc="lower right")
    save(fig, out("pd-tracking"))


if __name__ == "__main__":
    fig_spline_family()
    fig_continuity()
    fig_arc_length()
    fig_squad()
    fig_fk()
    fig_lbs_dqs()
    fig_blendshapes()
    fig_ik()
    fig_motion_matching()
    fig_pd()
