"""Figures for embodied-ai post 06 (embodied AI meets XR and HCI).

Computed: linear blend skinning of a 2-bone strip, keypoint retargeting of a human arm motion onto the
planar 3-link arm of post 1 (damped Gauss-Newton with a smoothness term), fingertip retargeting for a
pinch (absolute positions vs. relative vectors), the post's ClutchTeleop + 1 Euro filter run, and
pinhole projections for head and wrist cameras. 3D figures: right-handed, z up.

    python3 bin/figures/embodied-ai/embodied-ai_06.py
"""
import pathlib
import sys

import numpy as np
from scipy.optimize import least_squares

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401
from matplotlib.patches import Polygon, Rectangle  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/embodied-ai"


def rot2(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s], [s, c]])


# ================================================================= 1. linear blend skinning
def fig_lbs():
    L1, L2, W = 1.0, 1.0, 0.25
    xs = np.linspace(0, L1 + L2, 41)
    top = np.stack([xs, np.full_like(xs, W / 2)], 1); bot = np.stack([xs, np.full_like(xs, -W / 2)], 1)
    verts = np.vstack([top, bot])
    # skinning weight of bone 2: smooth ramp around the joint at x = L1
    w2 = np.clip((verts[:, 0] - (L1 - 0.3)) / 0.6, 0, 1)
    w2 = w2 * w2 * (3 - 2 * w2)
    w1 = 1 - w2

    def G(theta):
        """Rigid transforms of the two bones (bone 2 rotates about the joint at (L1, 0))."""
        R = rot2(theta); j = np.array([L1, 0.0])
        return (np.eye(2), np.zeros(2)), (R, j - R @ j)

    fig, axs = plt.subplots(1, 3, figsize=(10.5, 4.4))
    for ax, theta, mode, title in ((axs[0], 0.0, "lbs", r"rest pose, weight $w_{i2}$"),
                                   (axs[1], np.deg2rad(100), "rigid", "nearest bone only"),
                                   (axs[2], np.deg2rad(100), "lbs", r"LBS $\sum_k w_{ik} G_k v_i$")):
        (R1, t1), (R2, t2) = G(theta)
        p1 = verts @ R1.T + t1; p2 = verts @ R2.T + t2
        if mode == "lbs":
            P = w1[:, None] * p1 + w2[:, None] * p2
        else:
            P = np.where((verts[:, 0] < L1)[:, None], p1, p2)
        n = len(xs)
        poly = np.vstack([P[:n], P[n:][::-1]])
        ax.add_patch(Polygon(poly, closed=True, fc=C["fill"], ec=C["a"], lw=1.5))
        for i in range(n):
            ax.plot([P[i, 0], P[n + i, 0]], [P[i, 1], P[n + i, 1]], color=C["a"], lw=0.6, alpha=0.5)
        ax.scatter(P[:, 0], P[:, 1], c=w2, cmap="coolwarm", s=12, zorder=3, vmin=0, vmax=1)
        b = np.array([[0, 0], [L1, 0], [L1 + L2 * np.cos(theta), L2 * np.sin(theta)]])
        ax.plot(b[:, 0], b[:, 1], "-o", color=C["dark"], lw=2.5, ms=6, mfc="white")
        ax.set_aspect("equal"); ax.set_xlim(-0.3, 2.2); ax.set_ylim(-0.4, 1.4)
        ax.set_xticks([]); ax.set_yticks([]); ax.set_title(title, fontsize=14)
    save(fig, OUT / "06-lbs.svg")


# ================================================================= 2. arm retargeting onto the 3-link arm of post 1
LINKS = np.array([1.0, 0.8, 0.5])


def fk_pts(q, links=LINKS):
    c = np.cumsum(q)
    p = np.cumsum(np.stack([links * np.cos(c), links * np.sin(c)], 1), 0)
    return np.vstack([[0, 0], p])


def human_motion(T=120):
    """A planar shoulder-elbow-wrist-fingertip motion (upper arm 0.30, forearm 0.25, hand 0.15 m)."""
    t = np.linspace(0, 1, T)
    a1 = 0.2 + 0.9 * np.sin(np.pi * t) ** 2
    a2 = 1.4 - 1.2 * t + 0.25 * np.sin(4 * np.pi * t)
    a3 = -0.3 + 0.6 * np.sin(3 * np.pi * t)
    rng = np.random.default_rng(0)
    return np.array([fk_pts(np.array([x, y, z]), np.array([0.30, 0.25, 0.15])) for x, y, z in zip(a1, a2, a3)]) + \
        rng.normal(0, 0.002, (T, 4, 2))


def retarget(P_h, keys, s, lam=0.3, iters=15):
    """min_q sum_k ||s p_h,k - p_r,k(q)||^2 + lam ||q - q_prev||^2, solved per frame by Gauss-Newton."""
    q = np.array([0.3, 0.8, 0.0]); out = []
    for P in P_h:
        target = s * P[keys]; q_prev = q.copy()
        for _ in range(iters):
            r = (fk_pts(q)[keys] - target).ravel()
            J = np.zeros((len(r), 3)); eps = 1e-6
            for j in range(3):
                dq = np.zeros(3); dq[j] = eps
                J[:, j] = ((fk_pts(q + dq)[keys] - target).ravel() - r) / eps
            A = J.T @ J + lam * np.eye(3)
            q = q - np.linalg.solve(A, J.T @ r + lam * (q - q_prev))
        out.append(q.copy())
    return np.array(out)


def fig_retarget():
    P_h = human_motion()
    s = LINKS.sum() / 0.70
    Q_ee = retarget(P_h, [3], s)
    Q_all = retarget(P_h, [1, 2, 3], s)
    err = lambda Q, k: np.array([np.linalg.norm(fk_pts(q)[k] - s * P[k]) for q, P in zip(Q, P_h)])
    print("retarget: elbow error, EE-only %.3f vs keypoints %.3f; hand error %.3f vs %.3f" % (
        err(Q_ee, 1).mean(), err(Q_all, 1).mean(), err(Q_ee, 3).mean(), err(Q_all, 3).mean()))
    fig = plt.figure(figsize=(10, 8.6))
    gs = fig.add_gridspec(2, 2, height_ratios=[1.15, 0.8])
    for k, (Q, ttl) in enumerate(((Q_ee, "match the hand only"), (Q_all, "match elbow, wrist and hand"))):
        ax = fig.add_subplot(gs[0, k])
        for i, fr in enumerate((10, 45, 80, 115)):
            col = plt.get_cmap("viridis")(i / 3)
            ph = s * P_h[fr]
            ax.plot(ph[:, 0], ph[:, 1], "--", color=col, lw=2, alpha=0.9)
            ax.plot(ph[1:, 0], ph[1:, 1], "o", ms=7, mfc="none", mec=col, mew=2)
            pr = fk_pts(Q[fr])
            ax.plot(pr[:, 0], pr[:, 1], "-", color=col, lw=4, solid_capstyle="round", alpha=0.9)
            ax.plot(pr[1:, 0], pr[1:, 1], "o", ms=5, color=col)
        ax.plot(*(s * P_h[:, 3]).T, ":", color=C["gray"], lw=1.2)
        ax.plot(0, 0, "s", color=C["dark"], ms=8)
        ax.set_aspect("equal"); ax.set_xlim(-1.0, 2.4); ax.set_ylim(-0.4, 2.4)
        ax.set_title(ttl, fontsize=14); ax.set_xticks([]); ax.set_yticks([])
    ax = fig.add_subplot(gs[1, :])
    tt = np.arange(len(P_h))
    ax.plot(tt, err(Q_ee, 1), color=C["x"], label="elbow error, hand-only IK")
    ax.plot(tt, err(Q_all, 1), color=C["z"], label="elbow error, all keypoints")
    ax.plot(tt, err(Q_all, 3), color=C["z"], ls="--", label="hand error, all keypoints")
    ax.plot(tt, err(Q_ee, 3), color=C["x"], ls="--", label="hand error, hand-only IK")
    ax.set_xlabel("frame"); ax.set_ylabel("distance [robot units]"); ax.legend(fontsize=12, ncol=2, loc="upper left")
    ax.set_ylim(0, 0.32)
    fig.axes[0].plot([], [], "--o", color=C["gray"], mfc="none", label="scaled human")
    fig.axes[0].plot([], [], "-o", color=C["gray"], lw=4, label="robot")
    fig.axes[0].legend(fontsize=12, loc="upper right")
    fig.tight_layout()
    save(fig, OUT / "06-retargeting.svg")


# ================================================================= 3. fingertip retargeting for a pinch
def finger(base, q, links):
    c = np.cumsum(q) + np.pi / 2
    p = base + np.cumsum(np.stack([links * np.cos(c), links * np.sin(c)], 1), 0)
    return np.vstack([base, p])


def fig_hand():
    # human: index (3 links) from (0, 0) bending toward -x, thumb (2 links) from (-0.035, -0.035) bending toward +x
    hi_base, ht_base = np.array([0.0, 0.0]), np.array([-0.045, -0.03])
    hi_L, ht_L = np.array([0.045, 0.025, 0.02]), np.array([0.04, 0.032])
    # find a human pinch: tips touch
    sol = least_squares(lambda x: finger(hi_base, x[:3], hi_L)[-1] - finger(ht_base, -x[3:], ht_L)[-1],
                        x0=[0.6, 0.6, 0.4, 0.7, 0.6], bounds=([0, 0, 0, 0, 0], [1.7] * 5))
    qi_h, qt_h = sol.x[:3], -sol.x[3:]
    Hi, Ht = finger(hi_base, qi_h, hi_L), finger(ht_base, qt_h, ht_L)
    # robot: two 2-link fingers, wider palm, joint limits [0, 1.6] (flexion toward the other finger)
    ri_base, rt_base = np.array([0.0, 0.0]), np.array([-0.09, 0.0])
    r_L = np.array([0.07, 0.06]); s = 1.4

    def robot(x):
        return finger(ri_base, x[:2], r_L), finger(rt_base, -x[2:], r_L)

    def absolute(x):
        Ri, Rt = robot(x)
        return np.concatenate([Ri[-1] - s * Hi[-1], Rt[-1] - s * Ht[-1], 0.5 * (Ri[1] - s * Hi[1]), 0.5 * (Rt[1] - s * Ht[1])])

    def relative(x):
        Ri, Rt = robot(x)
        return np.concatenate([3.0 * ((Ri[-1] - Rt[-1]) - s * (Hi[-1] - Ht[-1])),
                               0.5 * ((Ri[-1] - ri_base) - s * (Hi[-1] - hi_base)), 0.5 * ((Rt[-1] - rt_base) - s * (Ht[-1] - ht_base))])

    bnd = ([0, 0, 0, 0], [1.6] * 4)
    xa = least_squares(absolute, [0.5] * 4, bounds=bnd).x
    xr = least_squares(relative, [0.5] * 4, bounds=bnd).x
    gaps = {}
    fig, axs = plt.subplots(1, 3, figsize=(10.5, 4.2))
    ax = axs[0]
    ax.plot(*Hi.T, "-o", color=C["a"], lw=4, ms=6, mfc="white"); ax.plot(*Ht.T, "-o", color=C["b"], lw=4, ms=6, mfc="white")
    ax.set_title(f"human pinch\ngap {1000 * np.linalg.norm(Hi[-1] - Ht[-1]):.1f} mm", fontsize=14)
    ax.text(0.005, -0.012, "index", color=C["a"], fontsize=12); ax.text(-0.075, -0.045, "thumb", color=C["b"], fontsize=12)
    for ax, x, ttl in ((axs[1], xa, "match keypoints"), (axs[2], xr, "match tip-to-tip vector")):
        Ri, Rt = robot(x)
        g = np.linalg.norm(Ri[-1] - Rt[-1]); gaps[ttl] = g
        ax.add_patch(Rectangle((-0.11, -0.03), 0.13, 0.03, fc=C["gray"], alpha=0.4))
        ax.plot(*Ri.T, "-o", color=C["a"], lw=5, ms=6, mfc="white"); ax.plot(*Rt.T, "-o", color=C["b"], lw=5, ms=6, mfc="white")
        ax.plot(*(s * Hi[-1]), "x", color=C["a"], ms=10, mew=2.5); ax.plot(*(s * Ht[-1]), "x", color=C["b"], ms=10, mew=2.5)
        ax.set_title(f"robot: {ttl}\ngap {1000 * g:.1f} mm", fontsize=14)
    for ax in axs:
        ax.set_aspect("equal"); ax.set_xlim(-0.13, 0.08); ax.set_ylim(-0.05, 0.16); ax.set_xticks([]); ax.set_yticks([])
    print("hand retargeting gaps (mm):", {k: round(1000 * v, 1) for k, v in gaps.items()})
    save(fig, OUT / "06-hand-retargeting.svg")


# ================================================================= 4. teleoperation frames (the post's numbers)
def rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def fig_teleop_frames():
    R, t = rot_z(np.pi / 2), np.array([0.5, 0.0, -0.8])
    hand0 = np.array([0.3, 1.2, -0.4]); hand1 = hand0 + np.array([0.2, 0, 0])
    h0, h1 = R @ hand0 + t, R @ hand1 + t
    ee0 = np.array([0.4, 0.0, 0.3]); ee1 = ee0 + 0.5 * (h1 - h0)
    print("teleop frames: hand in robot frame", h0, "->", h1, "; EE", ee0, "->", ee1)
    fig = plt.figure(figsize=(9, 7.5))
    ax = fig.add_subplot(projection="3d")
    ax.view_init(elev=18, azim=-55)
    def triad(o, Rm, s, name, off):
        for i, c in enumerate((C["x"], C["y"], C["z"])):
            ax.quiver(*o, *(Rm[:, i] * s), color=c, linewidth=2.6, arrow_length_ratio=0.2)
        ax.text(*(o + off), name, fontsize=15)
    triad(np.zeros(3), np.eye(3), 0.35, r"robot base $\{r\}$", np.array([0.05, 0.05, -0.15]))
    triad(t, R, 0.35, r"headset frame $\{h\}$", np.array([0.1, 0.05, 0.42]))
    ax.plot(*np.stack([t, h0]).T, ls=":", color=C["b"], lw=1.5)
    ax.plot(*np.stack([np.zeros(3), t]).T, ls="--", color=C["a"], lw=1.5)
    ax.text(*(t / 2 + [0.05, 0.05, 0]), r"$T_{rh}$", fontsize=16, color=C["a"])
    ax.plot(*np.stack([h0, h1]).T, color=C["b"], lw=4)
    ax.quiver(*h0, *(h1 - h0), color=C["b"], linewidth=3, arrow_length_ratio=0.25)
    ax.text(*(h0 + [-0.1, -0.05, -0.18]), "hand: +20 cm along $x_h$", fontsize=13, color=C["b"])
    ax.quiver(*ee0, *(ee1 - ee0), color=C["a"], linewidth=3, arrow_length_ratio=0.3)
    ax.scatter(*ee0, s=50, color=C["a"])
    ax.text(*(ee0 + [0.05, 0.0, 0.1]), "EE: +10 cm along $y_r$", fontsize=13, color=C["a"])
    # a simple robot pedestal and arm to the EE
    ax.plot([0, 0], [0, 0], [0, 0.25], color=C["dark"], lw=5)
    ax.plot([0, 0.2, 0.4], [0, 0, 0], [0.25, 0.45, 0.3], color=C["dark"], lw=4)
    ax.set_xlim(-0.8, 0.7); ax.set_ylim(-0.2, 0.7); ax.set_zlim(-1.3, 0.6)
    ax.set_box_aspect((1.5, 0.9, 1.9), zoom=1.2); ax.set_axis_off()
    fig.subplots_adjust(0, 0, 1, 1)
    save(fig, OUT / "06-teleop-frames.svg")


# ================================================================= 5. the post's 1 Euro filter run
class OneEuroFilter:
    def __init__(self, freq, min_cutoff=1.0, beta=0.05, d_cutoff=1.0):
        self.freq, self.min_cutoff, self.beta, self.d_cutoff = freq, min_cutoff, beta, d_cutoff
        self.x_prev, self.dx_prev = None, None
        self.cutoffs = []

    def _alpha(self, cutoff):
        tau = 1.0 / (2 * np.pi * cutoff)
        return 1.0 / (1.0 + tau * self.freq)

    def __call__(self, x):
        if self.x_prev is None:
            self.x_prev, self.dx_prev = x, np.zeros_like(x)
            self.cutoffs.append(self.min_cutoff)
            return x
        dx = (x - self.x_prev) * self.freq
        a_d = self._alpha(self.d_cutoff)
        dx_hat = a_d * dx + (1 - a_d) * self.dx_prev
        cutoff = self.min_cutoff + self.beta * np.linalg.norm(dx_hat)
        self.cutoffs.append(cutoff)
        a = self._alpha(cutoff)
        x_hat = a * x + (1 - a) * self.x_prev
        self.x_prev, self.dx_prev = x_hat, dx_hat
        return x_hat


def fig_one_euro():
    rng = np.random.default_rng(0)
    freq = 90.0
    t = np.arange(0, 3, 1 / freq)
    true = np.stack([0.2 * np.clip(t - 1, 0, 1), 0 * t, 0 * t], 1) + np.array([0.3, 1.2, -0.4])
    noisy = true + rng.normal(0, 0.003, true.shape)
    R, tr = rot_z(np.pi / 2), np.array([0.5, 0.0, -0.8])
    anchor = R @ noisy[0] + tr
    ee0 = np.array([0.4, 0.0, 0.3])
    target = lambda p: ee0 + 0.5 * ((R @ p + tr) - anchor)
    f = OneEuroFilter(freq, min_cutoff=1.0, beta=5.0)
    raw = np.array([target(x) for x in noisy])
    filt = np.array([target(f(x)) for x in noisy])
    ideal = np.array([target(x) for x in true]) - (anchor - (R @ true[0] + tr)) * 0.5
    still = t < 1.0; moving = (t > 1.0) & (t < 2.0)
    print("1 Euro: jitter at rest raw %.2f mm, filtered %.2f mm; max |filtered - raw| while moving %.1f mm" % (
        1e3 * raw[still].std(0).max(), 1e3 * filt[still].std(0).max(), 1e3 * np.abs(filt[moving] - raw[moving]).max()))
    fig, axs = plt.subplots(2, 1, figsize=(9, 8), sharex=True, gridspec_kw=dict(height_ratios=[1.3, 0.7]))
    ax = axs[0]
    ax.plot(t, 1e3 * raw[:, 1], color=C["gray"], lw=1, label="raw target")
    ax.plot(t, 1e3 * filt[:, 1], color=C["a"], lw=2.4, label="1 Euro filtered")
    ax.plot(t, 1e3 * ideal[:, 1], color=C["dark"], lw=1.2, ls="--", label="noise-free hand")
    ax.set_ylabel(r"EE target $y_r$ [mm]"); ax.legend(fontsize=13, loc="upper left")
    ins = ax.inset_axes([0.62, 0.08, 0.35, 0.38])
    m = t < 0.9
    ins.plot(t[m], 1e3 * raw[m, 1], color=C["gray"], lw=1); ins.plot(t[m], 1e3 * filt[m, 1], color=C["a"], lw=2)
    ins.set_title("at rest (zoom)", fontsize=11); ins.tick_params(labelsize=10)
    ax = axs[1]
    ax.plot(t, f.cutoffs, color=C["b"])
    ax.set_ylabel("cutoff [Hz]"); ax.set_xlabel("t [s]"); ax.set_ylim(0, 6)
    for a_ in axs:
        a_.axvspan(1, 2, color=C["b"], alpha=0.06)
    fig.tight_layout()
    save(fig, OUT / "06-one-euro.svg")


# ================================================================= 6. egocentric and wrist cameras
def look_at(eye, target, up=np.array([0, 0, 1.0])):
    f = target - eye; f /= np.linalg.norm(f)
    r = np.cross(f, up); r /= np.linalg.norm(r)
    u = np.cross(r, f)
    return np.stack([r, -u, f], 1)  # camera axes in world: x right, y down, z forward (OpenCV convention)


def project(P, eye, Rwc, fpx=300, W=640, H=480):
    Pc = (P - eye) @ Rwc
    z = Pc[:, 2]
    return np.stack([fpx * Pc[:, 0] / z + W / 2, fpx * Pc[:, 1] / z + H / 2], 1), z


def cube(c, s):
    v = np.array([[x, y, z] for x in (-s, s) for y in (-s, s) for z in (0, 2 * s)]) + c
    E = [(i, j) for i in range(8) for j in range(i + 1, 8) if np.sum(np.abs(v[i] - v[j]) > 1e-9) == 1]
    return v, E


def fig_egocentric():
    objs = [(np.array([0.55, 0.15, 0.75]), 0.04, C["x"]), (np.array([0.6, -0.12, 0.75]), 0.06, C["z"]),
            (np.array([0.42, 0.0, 0.75]), 0.03, C["y"])]
    head = np.array([0.0, 0.0, 1.55]); R_head = look_at(head, np.array([0.55, 0.0, 0.75]))
    wrist = np.array([0.38, 0.05, 0.98]); R_wrist = look_at(wrist, np.array([0.55, 0.12, 0.75]))
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)
        fig = plt.figure(figsize=(10, 8.4))
        gs = fig.add_gridspec(2, 2, height_ratios=[1.3, 0.8])
        ax = fig.add_subplot(gs[0, :], projection="3d")
        tbl = np.array([[0.2, -0.4, 0.75], [0.9, -0.4, 0.75], [0.9, 0.4, 0.75], [0.2, 0.4, 0.75]])
        from mpl_toolkits.mplot3d.art3d import Poly3DCollection
        ax.add_collection3d(Poly3DCollection([tbl], fc=C["gray"], alpha=0.15, ec=C["gray"]))
        for c, s, col in objs:
            v, E = cube(c, s)
            for i, j in E:
                ax.plot(*np.stack([v[i], v[j]]).T, color=col, lw=2)
        for eye, Rwc, col, name in ((head, R_head, C["a"], L("head camera", "头戴相机", "頭部カメラ")),
                                    (wrist, R_wrist, C["b"], L("wrist camera", "腕部相机", "手首カメラ"))):
            d = 0.25
            corners = [eye + d * (Rwc @ np.array([x * 640 / 2 / 300, y * 480 / 2 / 300, 1.0])) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            for c_ in corners:
                ax.plot(*np.stack([eye, c_]).T, color=col, lw=1.4)
            ax.plot(*np.array(corners + [corners[0]]).T, color=col, lw=2)
            ax.scatter(*eye, s=40, color=col)
            ax.text(*(eye + [0, 0, 0.08]), name, fontsize=17, color=col)
        ax.set_xlim(-0.1, 0.9); ax.set_ylim(-0.5, 0.5); ax.set_zlim(0.6, 1.65)
        ax.set_box_aspect((1, 1, 1.05), zoom=1.25); ax.set_axis_off(); ax.view_init(elev=18, azim=-120)
        for k, (eye, Rwc, col, name) in enumerate(((head, R_head, C["a"], L("head camera view", "头戴相机视图", "頭部カメラの画像")),
                                                    (wrist, R_wrist, C["b"], L("wrist camera view", "腕部相机视图", "手首カメラの画像")))):
            ax2 = fig.add_subplot(gs[1, k])
            uv, z = project(tbl, eye, Rwc)
            ax2.add_patch(Polygon(uv, closed=True, fc=C["gray"], alpha=0.15, ec=C["gray"]))
            for c, s, ocol in objs:
                v, E = cube(c, s)
                uv, z = project(v, eye, Rwc)
                for i, j in E:
                    ax2.plot(*np.stack([uv[i], uv[j]]).T, color=ocol, lw=2)
            ax2.set_xlim(0, 640); ax2.set_ylim(480, 0); ax2.set_aspect("equal")
            ax2.set_xticks([]); ax2.set_yticks([]); ax2.set_title(name, fontsize=17, color=col)
            for sp in ax2.spines.values():
                sp.set_visible(True); sp.set_color(col); sp.set_linewidth(2)
        fig.tight_layout()
        save(fig, OUT / f"06-egocentric_{lang}.svg")


# ================================================================= 7. research map (localized)
def fig_research_map():
    fields = {"en": ["Embodied AI", "World models", "AR / VR", "HCI", "Graphics"],
              "zh": ["具身智能", "世界模型", "AR / VR", "人机交互", "图形学"],
              "ja": ["身体性 AI", "世界モデル", "AR / VR", "HCI", "グラフィックス"]}
    rows = [
        (("XR-native data engines", "XR 原生数据引擎", "XR ネイティブなデータエンジン"), [1, 0, 1, 1, 0]),
        (("Egocentric world models", "第一人称世界模型", "一人称視点の世界モデル"), [1, 1, 1, 0, 0]),
        (("Closing the embodiment gap", "弥合本体差异", "身体性ギャップを埋める"), [1, 0, 0, 0, 1]),
        (("Mixed-reality supervision of VLAs", "用混合现实监督 VLA", "複合現実による VLA の監督"), [1, 0, 1, 1, 0]),
        (("Photoreal, physical digital twins", "照片级、带物理的数字孪生", "写実的で物理を備えたデジタルツイン"), [1, 1, 1, 0, 1]),
        (("Haptics and multisensory feedback", "触觉与多感官反馈", "触覚と多感覚フィードバック"), [1, 0, 1, 1, 0]),
        (("Human-centred evaluation", "以人为本的评估", "人間中心の評価"), [1, 0, 0, 1, 0]),
        (("Characters and robots", "虚拟角色与机器人", "キャラクターとロボット"), [1, 0, 1, 0, 1]),
    ]
    cols = [C["a"], C["b"], C["z"], C["y"], C["x"]]
    for li, lang in enumerate(LANGS):
        fig, ax = plt.subplots(figsize=(10, 6.4))
        n = len(rows)
        for i, (names, m) in enumerate(rows):
            y = n - 1 - i
            ax.text(-0.4, y, f"{i + 1}. {names[li]}", ha="right", va="center", fontsize=14)
            ax.axhline(y, xmin=0.0, xmax=1, color=C["gray"], lw=0.5, alpha=0.4)
            xs = [j for j in range(5) if m[j]]
            ax.plot([min(xs), max(xs)], [y, y], color=C["dark"], lw=2, alpha=0.5)
            for j in range(5):
                ax.plot(j, y, "o", ms=17 if m[j] else 7, color=cols[j] if m[j] else "white",
                        mec=cols[j] if m[j] else C["gray"], mew=1.5)
        for j, fname in enumerate(fields[lang]):
            ax.text(j, n - 0.35, fname, ha="center", va="bottom", fontsize=13.5, color=cols[j], rotation=0)
        ax.set_xlim(-0.6, 4.5); ax.set_ylim(-0.6, n + 0.2); ax.axis("off")
        fig.subplots_adjust(left=0.42, right=0.98, top=0.95, bottom=0.03)
        save(fig, OUT / f"06-research-map_{lang}.svg")


if __name__ == "__main__":
    fig_lbs()
    fig_retarget()
    fig_hand()
    fig_teleop_frames()
    fig_one_euro()
    fig_egocentric()
    fig_research_map()
