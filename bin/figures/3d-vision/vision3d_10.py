"""Figures for 3d-vision post 10: 3D vision for AR/VR.

Run from the repository root:
    python3 bin/figures/3d-vision/vision3d_10.py [preview-dir]

Conventions (as in the post): camera and eye frames use the OpenCV axes (x right, y down,
z forward); world and room frames are gravity-aligned with z up. T_AB maps coordinates in frame
B to frame A. The functions marked "post" are copied verbatim from the post's snippets, so the
numbers printed here are the numbers quoted in the post and in the captions.
Only NumPy and Matplotlib are needed.
"""
import os
import pathlib
import sys

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

plt.rcParams["svg.hashsalt"] = "3d-vision-10"  # stable element ids

import numpy as np  # noqa: E402
from matplotlib.patches import Ellipse  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/3d-vision"
PREV = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] != "-" else None
ARCMIN = 60 * 180 / np.pi            # radians -> arcminutes
PURPLE, ORANGE, CYAN, GREEN, RED, BLUE = C["a"], C["b"], C["c"], C["y"], C["x"], C["z"]


def plain_log_x(ax, ticks):
    """Readable ticks on a logarithmic x axis."""
    from matplotlib.ticker import FixedLocator, NullFormatter, NullLocator
    ax.xaxis.set_major_locator(FixedLocator(ticks))
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:g}"))
    ax.xaxis.set_minor_locator(NullLocator()); ax.xaxis.set_minor_formatter(NullFormatter())


def out(fig, name):
    if PREV is not None:
        PREV.mkdir(parents=True, exist_ok=True)
        fig.savefig(PREV / name.replace(".svg", ".png"), dpi=70)
    save(fig, OUT / name)


# =============================================================================================
# post, section 1: frames of a headset (figure only)
# =============================================================================================
def rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])


def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def fig_frames():
    """World W (z up), body/IMU B, two tracking cameras, two eyes, an anchor A on a table and the
    virtual cube attached to it. Optical frames (x right, y down, z forward) are built from a
    yaw about world z; the body frame here uses the same optical axes for simplicity."""
    # optical frame looking along world +y when yaw = 0: x -> world +x, y -> world -z, z -> world +y
    R0 = np.array([[1.0, 0, 0], [0, 0, -1], [0, 1, 0]]).T     # columns: optical axes in world
    yaw = np.deg2rad(20)
    R_WB = rot_z(yaw) @ R0
    p_WB = np.array([0.35, -0.55, 1.55])
    frames = {"B": (R_WB, p_WB)}
    for name, off, out_yaw in (("C_L", (-0.08, -0.03, 0.02), 25), ("C_R", (0.08, -0.03, 0.02), -25)):
        R = R_WB @ rot_y(np.deg2rad(-out_yaw)) @ rot_x(np.deg2rad(-20))   # outwards and down
        frames[name] = (R, p_WB + R_WB @ np.array(off))
    for name, x in (("E_L", -0.0315), ("E_R", 0.0315)):
        frames[name] = (R_WB, p_WB + R_WB @ np.array([x, 0.0, -0.06]))
    R_WA = rot_z(np.deg2rad(-10))
    p_WA = np.array([0.55, 0.75, 0.75])
    frames["A"] = (R_WA, p_WA)

    fig = plt.figure(figsize=(15, 7.4))
    ax = fig.add_subplot(121, projection="3d")
    ax.view_init(elev=20, azim=-58)
    # floor grid and table
    for g in np.linspace(-0.2, 1.2, 8):
        ax.plot([g, g], [-0.8, 1.2], [0, 0], color="#dddddd", lw=0.8)
    for g in np.linspace(-0.8, 1.2, 11):
        ax.plot([-0.2, 1.2], [g, g], [0, 0], color="#dddddd", lw=0.8)
    tx, ty = np.array([0.15, 0.95, 0.95, 0.15, 0.15]), np.array([0.45, 0.45, 1.05, 1.05, 0.45])
    ax.plot(tx, ty, np.full(5, 0.75), color=C["gray"], lw=1.5)
    for x_, y_ in zip(tx[:4], ty[:4]):
        ax.plot([x_, x_], [y_, y_], [0, 0.75], color="#bbbbbb", lw=1.2)

    def draw_frame(ax, R, p, L, name, lw=2.2, text_off=(0, 0, 0.03), fs=20):
        for i, col in enumerate((RED, GREEN, BLUE)):
            ax.quiver(*p, *(R[:, i] * L), color=col, linewidth=lw, arrow_length_ratio=0.2)
        ax.text(*(p + np.array(text_off)), f"${name}$", fontsize=fs, color=C["dark"])

    draw_frame(ax, np.eye(3), np.zeros(3), 0.35, "W", text_off=(-0.14, -0.05, 0.02))
    draw_frame(ax, *frames["B"], 0.2, "B", text_off=(-0.1, 0.0, 0.08))
    draw_frame(ax, *frames["A"], 0.18, "A", text_off=(-0.1, -0.04, 0.03))
    s = 0.1                                       # a 10 cm virtual cube placed in the anchor frame
    cube = np.array([[x, y, z] for x in (0, s) for y in (0, s) for z in (0, s)]) + [0.12, 0.05, 0]
    cw = cube @ frames["A"][0].T + frames["A"][1]
    edges = [(0, 1), (0, 2), (0, 4), (1, 3), (1, 5), (2, 3), (2, 6), (3, 7), (4, 5), (4, 6), (5, 7), (6, 7)]
    for i, j in edges:
        ax.plot(*np.c_[cw[i], cw[j]], color=PURPLE, lw=2.4)
    corner = cw[7]
    for a_, b_, col in ((frames["A"][1], np.zeros(3), C["gray"]), (np.zeros(3), p_WB, C["gray"])):
        ax.plot(*np.c_[a_, b_], ls="--", lw=1.4, color=col)
    ax.text(*(0.5 * frames["A"][1] + [0.05, 0, -0.08]), r"$T_{WA}$", fontsize=15, color=C["gray"])
    ax.text(*(0.5 * p_WB + [-0.25, 0, 0]), r"$T_{WB}(t)$", fontsize=15, color=C["gray"])
    ax.plot(*np.c_[frames["E_L"][1], corner], color=ORANGE, lw=1.8)
    ax.text(*(corner + [0.03, 0.0, 0.05]), r"$\mathbf{X}_A$", color=PURPLE, fontsize=20)
    ax.set_xlim(-0.2, 1.2); ax.set_ylim(-0.8, 1.2); ax.set_zlim(0, 1.8)
    ax.set_box_aspect((1.4, 2.0, 1.8))

    # right: the headset itself, in its body frame B (drawn as x, z, -y so that "up" is up)
    bx = fig.add_subplot(122, projection="3d")
    bx.view_init(elev=18, azim=-60)
    Rb, pb = frames["B"]
    def to_plot(R, p):
        Rl, pl = Rb.T @ R, Rb.T @ (p - pb)          # pose relative to B
        M = np.array([[1.0, 0, 0], [0, 0, 1], [0, -1, 0]])
        return M @ Rl, M @ pl
    draw_frame(bx, *to_plot(Rb, pb), 0.05, "B", lw=2.4, text_off=(0.0, -0.01, 0.015))
    for nm, off in (("C_L", (-0.035, 0, 0.012)), ("C_R", (0.006, 0, 0.012)),
                    ("E_L", (-0.03, 0, -0.03)), ("E_R", (0.004, 0, -0.03))):
        R_, p_ = to_plot(*frames[nm])
        draw_frame(bx, R_, p_, 0.03, nm, lw=1.8, text_off=off, fs=19)
        if nm.startswith("C"):
            bx.plot(*np.c_[p_, p_ + R_[:, 2] * 0.09], color=CYAN, lw=1.2, ls=":")
    # headset shell (box, 18 x 10 x 9 cm) for orientation
    xs, ys, zs = (-0.09, 0.09), (-0.075, 0.035), (-0.045, 0.05)
    for x_ in xs:
        for y_ in ys:
            bx.plot([x_, x_], [y_, y_], zs, color="#cccccc", lw=1)
    for x_ in xs:
        for z_ in zs:
            bx.plot([x_, x_], ys, [z_, z_], color="#cccccc", lw=1)
    for y_ in ys:
        for z_ in zs:
            bx.plot(xs, [y_, y_], [z_, z_], color="#cccccc", lw=1)
    bx.set_xlim(-0.1, 0.1); bx.set_ylim(-0.1, 0.1); bx.set_zlim(-0.07, 0.07)
    bx.set_box_aspect((1, 1, 0.7))
    for a3 in (ax, bx):
        a3.grid(False)
        for a in (a3.xaxis, a3.yaxis, a3.zaxis):
            a.pane.set_visible(False); a.line.set_visible(False)
        a3.set_xticks([]); a3.set_yticks([]); a3.set_zticks([])
    fig.subplots_adjust(wspace=0.0, left=0, right=1, top=1, bottom=0)
    out(fig, "10-frames.svg")


# =============================================================================================
# post, section 2.2: IMU dead reckoning (post)
# =============================================================================================
def skew(w):
    return np.array([[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]])


def so3_exp(w):
    """Rodrigues: rotation vector (3,) -> rotation matrix."""
    th = np.linalg.norm(w)
    if th < 1e-12:
        return np.eye(3) + skew(w)
    A = skew(w / th)
    return np.eye(3) + np.sin(th) * A + (1 - np.cos(th)) * A @ A


def dead_reckon(T, dt, b_g, b_a):
    """Strapdown integration for a headset that is really at rest (world z up).
    The gyro reads b_g, the accelerometer reads the specific force -g plus b_a."""
    g = np.array([0.0, 0.0, -9.81])
    R, v, p = np.eye(3), np.zeros(3), np.zeros(3)
    out_ = []
    for _ in range(int(round(T / dt))):
        a = R @ (-g + b_a) + g            # acceleration the integrator believes in (world)
        p = p + v * dt + 0.5 * a * dt**2
        v = v + a * dt
        R = R @ so3_exp(b_g * dt)
        out_.append(p.copy())
    return np.array(out_)


# post, section 2.3: a 1D toy VIO
def vio_1d(T=4.0, dt=1e-3, cam_every=33, b_a=0.01, sa=2e-3, sc=1e-3, seed=1):
    """1D toy VIO. State x = [p, v, b] (position, velocity, accelerometer bias).
    The IMU (1 kHz) propagates the state; a camera position fix (every cam_every ms, std sc)
    corrects it. True motion: head sway p(t) = 5 cm * sin(2 pi 0.5 t)."""
    rng = np.random.default_rng(seed)
    n = int(round(T / dt))
    t = np.arange(1, n + 1) * dt
    w = 2 * np.pi * 0.5
    p_true, a_true = 0.05 * np.sin(w * t), -0.05 * w**2 * np.sin(w * t)
    x = np.array([0.0, 0.05 * w, 0.0])            # starts with the right velocity, unknown bias
    Pc = np.diag([1e-6, 1e-4, 1e-4])
    F = np.array([[1, dt, -0.5 * dt**2], [0, 1, -dt], [0, 0, 1]])
    Gq = np.array([0.5 * dt**2, dt, 0.0])
    Q = np.outer(Gq, Gq) * sa**2 / dt + np.diag([0, 0, 1e-10])
    H = np.array([[1.0, 0, 0]])
    est, sig = np.empty(n), np.empty(n)
    for k in range(n):
        a_meas = a_true[k] + b_a + sa / np.sqrt(dt) * rng.standard_normal()
        x = F @ x + np.array([0.5 * dt**2, dt, 0]) * a_meas      # predict with the IMU
        Pc = F @ Pc @ F.T + Q
        if (k + 1) % cam_every == 0:                               # camera update
            z = p_true[k] + sc * rng.standard_normal()
            S = H @ Pc @ H.T + sc**2
            Kg = Pc @ H.T / S
            x = x + (Kg * (z - x[0])).ravel()
            Pc = (np.eye(3) - Kg @ H) @ Pc
        est[k], sig[k] = x[0], np.sqrt(Pc[0, 0])
    return t, p_true, est, sig, x


def fig_drift():
    dt, T = 1e-3, 10.0
    b_g = np.array([np.deg2rad(0.1), 0.0, 0.0])
    b_a = np.array([0.0, 0.01, 0.0])
    P_a = dead_reckon(T, dt, np.zeros(3), b_a)
    P_g = dead_reckon(T, dt, b_g, np.zeros(3))
    t = np.arange(1, len(P_a) + 1) * dt
    print("== IMU dead reckoning (post section 2.2)")
    for tt in (0.011, 0.033, 0.1, 1.0, 10.0):
        k = int(round(tt / dt)) - 1
        print(f"  t = {tt:6.3f} s  accel bias {np.linalg.norm(P_a[k]) * 1e6:12.2f} um"
              f"   gyro bias {np.linalg.norm(P_g[k]) * 1e6:12.2f} um"
              f"   formulas {0.5 * 0.01 * tt**2 * 1e6:12.2f} / {9.81 * np.deg2rad(0.1) * tt**3 / 6 * 1e6:12.2f}")
    tv, p, est, sig, x = vio_1d()
    e = (est - p)[tv > 2.0] * 1e3
    print(f"  toy VIO after 2 s: RMS {np.sqrt(np.mean(e**2)):.3f} mm, max {np.abs(e).max():.3f} mm,"
          f" bias estimate {x[2]:.4f}")
    t2, p2, est2, _, _ = vio_1d(cam_every=10**9)
    print(f"  IMU only: {abs(est2 - p2)[999] * 1e3:.1f} mm after 1 s, {abs(est2 - p2)[-1] * 1e3:.1f} mm after 4 s")

    fig, axs = plt.subplots(1, 2, figsize=(14, 5.3), gridspec_kw=dict(width_ratios=[1.05, 1]))
    ax = axs[0]
    na, ng = np.linalg.norm(P_a, axis=1), np.linalg.norm(P_g, axis=1)
    ax.loglog(t, na * 1e3, color=ORANGE, label=r"$b_a=0.01\,\mathrm{m/s^2}$")
    ax.loglog(t, ng * 1e3, color=PURPLE, label=r"$b_g=0.1^\circ/\mathrm{s}$")
    ax.loglog(t, 0.5 * 0.01 * t**2 * 1e3, ls=":", color=C["dark"], lw=1.4, label=r"$\frac{1}{2}b_a t^2$")
    ax.loglog(t, 9.81 * np.deg2rad(0.1) * t**3 / 6 * 1e3, ls="--", color=C["dark"], lw=1.4,
              label=r"$\frac{1}{6} g\, b_g t^3$")
    for tt, lab in ((1 / 90, "11 ms"), (1 / 30, "33 ms"), (1.0, "1 s")):
        ax.axvline(tt, color=C["gray"], lw=1, ls="-.")
        ax.text(tt * 1.08, 2e-5, lab, fontsize=13, color=C["gray"], rotation=90, va="bottom")
    ax.set_xlim(1e-3, 10); ax.set_ylim(1e-6, 5e3)
    ax.set_xlabel("$t$ (s)"); ax.set_ylabel(r"$\Vert\delta\mathbf{p}\Vert$ (mm)")
    ax.legend(fontsize=13, loc="upper left")
    ax = axs[1]
    m = (tv >= 2.0) & (tv <= 2.5)
    ax.fill_between(tv[m], -2 * sig[m] * 1e3, 2 * sig[m] * 1e3, color=PURPLE, alpha=0.15, label=r"$\pm 2\sigma$")
    ax.plot(tv[m], (est - p)[m] * 1e3, color=PURPLE, lw=1.6, label=r"$\hat p - p$")
    for k in np.nonzero(m)[0]:
        if (k + 1) % 33 == 0:
            ax.axvline(tv[k], color=C["gray"], lw=0.8, alpha=0.6)
    ax.set_xlabel("$t$ (s)"); ax.set_ylabel("mm")
    ax.set_ylim(-2.2, 2.2)
    ax.legend(fontsize=13, loc="upper right", ncol=2)
    fig.tight_layout()
    out(fig, "10-imu-drift.svg")


# =============================================================================================
# section 3.1: a motion-to-photon timeline (figure only, illustrative 90 Hz pipeline)
# =============================================================================================
def fig_timeline():
    lanes = ["imu", "cam", "track", "app", "gpu", "warp", "scan"]
    names = {
        "imu": ("IMU 1 kHz", "IMU 1 kHz", "IMU 1 kHz"),
        "cam": ("cameras 30 Hz", "相机 30 Hz", "カメラ 30 Hz"),
        "track": ("tracker", "跟踪器", "トラッカー"),
        "app": ("app (CPU)", "应用（CPU）", "アプリ（CPU）"),
        "gpu": ("render (GPU)", "渲染（GPU）", "描画（GPU）"),
        "warp": ("late warp", "后期重投影", "後段リプロジェクション"),
        "scan": ("display scan-out", "显示扫描输出", "ディスプレイ走査"),
    }
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(13, 5.6))
        y = {k: len(lanes) - i for i, k in enumerate(lanes)}
        for k in lanes:
            ax.text(-1.0, y[k], label(lang, *names[k]), ha="right", va="center", fontsize=14)
            ax.axhline(y[k], color="#eeeeee", lw=1, zorder=0)
        for tm in np.arange(0, 40, 1.0):
            ax.plot([tm, tm], [y["imu"] - 0.18, y["imu"] + 0.18], color=C["gray"], lw=0.8)
        for t0 in (-6.0, 27.3):
            ax.add_patch(plt.Rectangle((t0, y["cam"] - 0.25), 4.0, 0.5, color=CYAN, alpha=0.7))
        ax.add_patch(plt.Rectangle((-2.0, y["track"] - 0.25), 5.0, 0.5, color=C["gray"], alpha=0.5))
        ax.add_patch(plt.Rectangle((2.0, y["app"] - 0.25), 5.0, 0.5, color=ORANGE, alpha=0.75))
        ax.add_patch(plt.Rectangle((7.0, y["gpu"] - 0.25), 8.0, 0.5, color=PURPLE, alpha=0.75))
        ax.add_patch(plt.Rectangle((17.5, y["warp"] - 0.25), 1.5, 0.5, color=GREEN, alpha=0.8))
        # scan-out: rows from top to bottom over one 90 Hz frame
        t_s, t_e = 20.0, 20.0 + 1000 / 90
        ax.add_patch(plt.Polygon([[t_s, y["scan"] + 0.3], [t_e, y["scan"] - 0.3], [t_e, y["scan"] + 0.3]],
                                 color=BLUE, alpha=0.25))
        ax.plot([t_s, t_e], [y["scan"] + 0.3, y["scan"] - 0.3], color=BLUE, lw=2)
        t_mid = 0.5 * (t_s + t_e)
        # pose samples: the app samples at 2 ms, the warp at 17.5 ms
        for ts, lane, col in ((2.0, "app", ORANGE), (17.5, "warp", GREEN)):
            ax.plot([ts, ts], [y["imu"], y[lane]], color=col, lw=1.6, ls="--")
            ax.plot(ts, y["imu"], "o", color=col, ms=8)
        ax.plot(t_mid, y["scan"], "*", color=RED, ms=17, zorder=5)
        ax.annotate("", xy=(t_mid, 0.15), xytext=(2.0, 0.15),
                    arrowprops=dict(arrowstyle="<->", color=ORANGE, lw=2))
        ax.text(0.5 * (2.0 + t_mid), -0.25, label(lang, f"{t_mid - 2.0:.1f} ms without late warp",
                                                f"无后期重投影：{t_mid - 2.0:.1f} ms",
                                                f"後段リプロジェクションなし：{t_mid - 2.0:.1f} ms"),
                ha="center", va="top", fontsize=13, color=ORANGE)
        ax.annotate("", xy=(t_mid, -0.85), xytext=(17.5, -0.85),
                    arrowprops=dict(arrowstyle="<->", color=GREEN, lw=2))
        ax.text(t_mid + 0.6, -0.85, label(lang, f"{t_mid - 17.5:.1f} ms with late warp",
                                         f"有后期重投影：{t_mid - 17.5:.1f} ms",
                                         f"後段リプロジェクションあり：{t_mid - 17.5:.1f} ms"),
                ha="left", va="center", fontsize=13, color=GREEN)
        ax.set_xlim(-8, 42); ax.set_ylim(-1.4, len(lanes) + 0.7)
        ax.set_yticks([]); ax.grid(False)
        ax.spines["left"].set_visible(False)
        ax.set_xlabel(label(lang, "time (ms)", "时间（ms）", "時間（ms）"))
        out(fig, f"10-m2p-timeline_{lang}.svg")
    print(f"== timeline: mid scan-out at {t_mid:.2f} ms; latency {t_mid - 2:.2f} ms / {t_mid - 17.5:.2f} ms")


# =============================================================================================
# post, section 3.3: prediction (post)
# =============================================================================================
def min_jerk(t, A, T):
    """Minimum-jerk head turn of amplitude A (deg) and duration T (s): angle, rate, acceleration."""
    s = np.clip(t / T, 0, 1)
    th = A * (10 * s**3 - 15 * s**4 + 6 * s**5)
    om = A / T * (30 * s**2 - 60 * s**3 + 30 * s**4)
    al = A / T**2 * (60 * s - 180 * s**2 + 120 * s**3)
    return th, om, al


A_TURN, T_TURN = 60.0, 0.6


def predict(t, lat, mode, gyro_noise=0.0, h=0.01, rng=None):
    """Yaw the renderer uses at photon time t, from IMU data that is lat seconds old.
    The orientation itself is assumed exact; the gyro rate has white noise (deg/s)."""
    th, om, _ = min_jerk(t - lat, A_TURN, T_TURN)
    if rng is not None:
        om = om + gyro_noise * rng.standard_normal(np.shape(t))
    if mode == "none":
        return th
    if mode == "velocity":
        return th + om * lat
    _, om_old, _ = min_jerk(t - lat - h, A_TURN, T_TURN)       # rate h seconds earlier
    if rng is not None:
        om_old = om_old + gyro_noise * rng.standard_normal(np.shape(t))
    return th + om * lat + 0.5 * (om - om_old) / h * lat**2    # constant acceleration


MODES = ("none", "velocity", "acceleration")
MODE_COL = {"none": RED, "velocity": ORANGE, "acceleration": PURPLE}


def fig_prediction():
    t = np.arange(0, 1.0, 1e-3)
    _, om, al = min_jerk(t, A_TURN, T_TURN)
    print(f"== prediction: peak rate {om.max():.1f} deg/s, peak acceleration {np.abs(al).max():.0f} deg/s^2")
    rng = np.random.default_rng(0)
    truth = min_jerk(t, A_TURN, T_TURN)[0]
    for lat in (0.010, 0.020, 0.040):
        row = []
        for mode in MODES:
            e = 60 * np.abs(predict(t, lat, mode) - truth)
            en = 60 * np.abs(predict(t, lat, mode, 0.2, rng=rng) - truth)
            row.append(f"{mode} {e.max():.1f}' ({en.max():.1f}')")
        print(f"  {lat * 1e3:.0f} ms: " + ", ".join(row))
    turn = t <= T_TURN + 0.02
    e_cv = 60 * (predict(t, 0.02, "velocity") - truth)
    print(f"  RMS of the velocity predictor at 20 ms during the turn: {np.sqrt(np.mean(e_cv[turn]**2)):.2f}'")
    for lat in (0.005, 0.008):
        print(f"  velocity predictor at {lat * 1e3:.0f} ms: max {60 * np.abs(predict(t, lat, 'velocity') - truth).max():.2f}'")

    fig, axs = plt.subplots(1, 2, figsize=(14, 5.3))
    ax = axs[0]
    en = 60 * np.abs(predict(t, 0.02, "acceleration", 0.2, rng=np.random.default_rng(1)) - truth)
    ax.semilogy(t * 1e3, np.maximum(en, 1e-2), color=MODE_COL["acceleration"], lw=0.8, alpha=0.35)
    for mode in MODES:
        e = 60 * np.abs(predict(t, 0.02, mode) - truth)
        ax.semilogy(t * 1e3, np.maximum(e, 1e-2), color=MODE_COL[mode], lw=2.2, label=mode)
    ax2 = ax.twinx()
    ax2.plot(t * 1e3, om, color=C["gray"], lw=1.2, ls="--")
    ax2.set_ylabel(r"$\omega$ (°/s)", color=C["gray"]); ax2.grid(False)
    ax2.spines["right"].set_visible(True)
    ax.set_xlabel("$t$ (ms)"); ax.set_ylabel(r"$|\hat\theta-\theta|$ (′)")
    ax.set_ylim(1e-2, 1e3); ax.set_xlim(0, 800)
    ax.legend(fontsize=13, loc="upper right")
    ax.set_title(r"$\Delta = 20$ ms", fontsize=15)
    ax = axs[1]
    lats = np.linspace(0.001, 0.06, 60)
    for mode in MODES:
        mx = [60 * np.abs(predict(t, L, mode, 0.2, rng=np.random.default_rng(2)) - truth).max() for L in lats]
        ax.semilogy(lats * 1e3, mx, color=MODE_COL[mode], label=mode)
    ax.axhline(60 / 25, color=C["dark"], ls=":", lw=1.4)
    ax.text(1, 60 / 25 * 1.15, "1 px @ 25 px/°", fontsize=13)
    ax.set_xlabel(r"$\Delta$ (ms)"); ax.set_ylabel(r"$\max_t |\hat\theta-\theta|$ (′)")
    ax.set_xlim(0, 60)
    ax.legend(fontsize=13, loc="lower right")
    fig.tight_layout()
    out(fig, "10-prediction.svg")


# =============================================================================================
# section 3.4: late-stage reprojection on a ray-cast toy scene (figure only)
# =============================================================================================
W_IMG, H_IMG, F_IMG = 320, 240, 300.0
K_IMG = np.array([[F_IMG, 0, W_IMG / 2], [0, F_IMG, H_IMG / 2], [0, 0, 1]])


def render(R_wc, C_w, ss=1):
    """Ray-cast a toy scene (OpenCV world = camera 0: x right, y down, z forward).
    Back wall z = 4 (gray checker 0.5 m), pillar plane z = 2, near plate z = 0.6.
    Returns RGB image and depth (along z of this camera)."""
    v, u = (np.mgrid[0:H_IMG * ss, 0:W_IMG * ss] + 0.5) / ss      # ss x ss samples per pixel
    rays_c = np.stack([(u - K_IMG[0, 2]) / F_IMG, (v - K_IMG[1, 2]) / F_IMG, np.ones_like(u)], -1)
    rays_w = rays_c @ R_wc.T
    img = np.ones(u.shape + (3,))
    tbest = np.full(u.shape, np.inf)
    planes = [  # z, x-range, y-range, colour function
        (4.0, (-10, 10), (-10, 10), lambda x, y: np.where(((np.floor(x / 0.5) + np.floor(y / 0.5)) % 2) == 0,
                                                            0.82, 0.62)[..., None] * np.ones(3)),
        (2.0, (0.5, 0.8), (-1.5, 1.5), lambda x, y: np.where((np.floor(y / 0.2) % 2) == 0, 1, 0.7)[..., None]
         * np.array([0.09, 0.75, 0.81])),
        (0.6, (-0.12, 0.08), (-0.05, 0.15), lambda x, y: np.where(((np.floor(x / 0.05) + np.floor(y / 0.05)) % 2) == 0,
                                                                  1, 0.55)[..., None] * np.array([1.0, 0.5, 0.05])),
    ]
    for z0, (x0, x1), (y0, y1), col in planes:
        tt = (z0 - C_w[2]) / rays_w[..., 2]
        P = C_w + tt[..., None] * rays_w
        hit = (tt > 0) & (P[..., 0] >= x0) & (P[..., 0] <= x1) & (P[..., 1] >= y0) & (P[..., 1] <= y1) & (tt < tbest)
        c = col(P[..., 0], P[..., 1])
        img[hit] = c[hit]
        tbest[hit] = tt[hit]
    depth = tbest * rays_c[..., 2]          # rays_c has z = 1, so depth = t
    return img, depth


def warp_homography(img, H):
    """Inverse-map warp: output pixel x' samples the source at H^-1 x' (nearest)."""
    v, u = np.mgrid[0:H_IMG, 0:W_IMG] + 0.5
    p = np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(H).T
    us, vs = p[..., 0] / p[..., 2], p[..., 1] / p[..., 2]
    ui, vi = np.floor(us).astype(int), np.floor(vs).astype(int)
    ok = (ui >= 0) & (ui < W_IMG) & (vi >= 0) & (vi < H_IMG)
    out_ = np.zeros_like(img); out_[...] = (1.0, 0.0, 1.0)
    out_[ok] = img[vi[ok], ui[ok]]
    return out_, ~ok


def warp_depth(img, depth, R_10, t_10, ss=1):
    """Forward warp with per-pixel depth: X1 = R_10 X0 + t_10, splat with a z-buffer.
    The source has ss x ss samples per pixel, so small motions leave no cracks; pixels nobody
    lands on (disocclusions) stay magenta."""
    v, u = (np.mgrid[0:H_IMG * ss, 0:W_IMG * ss] + 0.5) / ss
    X0 = np.stack([(u - K_IMG[0, 2]) / F_IMG, (v - K_IMG[1, 2]) / F_IMG, np.ones_like(u)], -1) * depth[..., None]
    X1 = X0 @ R_10.T + t_10
    p = X1 @ K_IMG.T
    u1, v1 = np.floor(p[..., 0] / p[..., 2]).astype(int), np.floor(p[..., 1] / p[..., 2]).astype(int)
    out_ = np.zeros((H_IMG, W_IMG, 3)); out_[...] = (1.0, 0.0, 1.0)
    zb = np.full((H_IMG, W_IMG), np.inf)
    order = np.argsort(-X1[..., 2].ravel())             # far first, near overwrite
    uu, vv, zz = u1.ravel()[order], v1.ravel()[order], X1[..., 2].ravel()[order]
    src = img.reshape(-1, 3)[order]
    ok = (uu >= 0) & (uu < W_IMG) & (vv >= 0) & (vv < H_IMG)
    out_[vv[ok], uu[ok]] = src[ok]
    zb[vv[ok], uu[ok]] = zz[ok]
    return out_, ~np.isfinite(zb)


def fig_timewarp():
    psi = np.deg2rad(2.0)                    # the head turned 2 deg right during the latency
    C1 = np.array([0.04, 0.0, 0.0])          # and moved 4 cm right
    R_w1 = rot_y(psi)                        # camera-to-world of the new pose
    img0, d0 = render(np.eye(3), np.zeros(3))
    img1, d1 = render(R_w1, C1)
    R_10 = R_w1.T                            # world (= camera 0) to camera 1
    t_10 = -R_w1.T @ C1
    H = K_IMG @ R_10 @ np.linalg.inv(K_IMG)
    rot_only, _ = warp_homography(img0, H)
    img0s, d0s = render(np.eye(3), np.zeros(3), ss=2)
    dep, holes = warp_depth(img0s, d0s, R_10, t_10, ss=2)
    # residual parallax of the rotation-only warp: true pixel of a point vs homography pixel
    print("== late-stage reprojection: residual of rotation-only warp (4 cm sideways)")
    for name, X in (("plate z=0.6", np.array([0.0, 0.05, 0.6])), ("pillar z=2", np.array([0.65, 0.0, 2.0])),
                    ("wall z=4", np.array([-1.0, 0.0, 4.0]))):
        p_true = K_IMG @ (R_10 @ X + t_10); p_true = p_true[:2] / p_true[2]
        p_h = H @ (K_IMG @ X); p_h = p_h[:2] / p_h[2]
        print(f"  {name}: {np.linalg.norm(p_true - p_h):.2f} px  (f b / Z = {F_IMG * 0.04 / X[2]:.2f} px)")
    diff_rot = np.abs(rot_only - img1).sum(-1) > 0.05
    diff_dep = (np.abs(dep - img1).sum(-1) > 0.05) & ~holes
    print(f"  pixels wrong: rotation-only {diff_rot.mean() * 100:.1f}%, depth warp {diff_dep.mean() * 100:.1f}% "
          f"+ holes {holes.mean() * 100:.1f}%")
    fig, axs = plt.subplots(2, 2, figsize=(11, 8.6))
    for ax, im, ttl in zip(axs.ravel(), (img0, img1, rot_only, dep),
                           ("(a)", "(b)", "(c)", "(d)")):
        ax.imshow(im, interpolation="nearest")
        ax.set_title(ttl, fontsize=15, loc="left")
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    # outline of the true near plate in (c) and (d)
    plate = np.isfinite(d1) & (d1 < 1.0)
    for ax in axs[1]:
        ax.contour(plate.astype(float), levels=[0.5], colors=[C["dark"]], linewidths=1.6, linestyles="--")
    fig.tight_layout()
    out(fig, "10-timewarp.svg")


# =============================================================================================
# post, section 4: registration error budget (post)
# =============================================================================================
def parallax(b, d, d0=np.inf):
    """Angular error (rad) of a point at depth d when the image is formed for depth d0
    from a viewpoint displaced by b perpendicular to the line of sight."""
    return b * np.abs(1 / d - 1 / d0)


def budget(d):
    """1-sigma contributions in arcminutes for a virtual object at distance d (metres).
    Illustrative values for a well-engineered optical see-through headset."""
    return {
        "tracking rotation (0.02 deg)": np.full_like(d, 0.02 * 60),
        "tracking translation (1 mm)": parallax(1e-3, d) * ARCMIN,
        "latency after prediction": np.full_like(d, 3.0),
        "display calibration (0.03 deg)": np.full_like(d, 0.03 * 60),
        "eye position (2 mm, focal plane 2 m)": parallax(2e-3, d, 2.0) * ARCMIN,
        "camera-IMU time offset (0.5 ms at 50 deg/s)": np.full_like(d, 0.5e-3 * 50 * 60),
    }


BUDGET_NAMES = [
    ("tracking rotation (0.02°)", "跟踪旋转误差（0.02°）", "トラッキング回転誤差（0.02°）"),
    ("tracking translation (1 mm)", "跟踪平移误差（1 mm）", "トラッキング並進誤差（1 mm）"),
    ("latency after prediction (3′)", "预测后的残余延迟（3′）", "予測後の残留遅延（3′）"),
    ("display calibration (0.03°)", "显示标定（0.03°）", "ディスプレイ較正（0.03°）"),
    ("eye position (2 mm, focal plane 2 m)", "眼睛位置（2 mm，焦平面 2 m）", "眼の位置（2 mm、焦点面 2 m）"),
    ("camera-IMU time offset (0.5 ms)", "相机-IMU 时间偏移（0.5 ms）", "カメラ-IMU 時刻オフセット（0.5 ms）"),
]


def fig_budget():
    d = np.array([0.3, 0.5, 1.0, 2.0, 4.0])
    B = budget(d)
    print("== budget (arcmin) at d =", d)
    for name, v in B.items():
        print(f"  {name:45s}" + "".join(f"{x:7.2f}" for x in v))
    total = np.sqrt(sum(v**2 for v in B.values()))
    print(f"  {'total':45s}" + "".join(f"{x:7.2f}" for x in total))
    print(f"  {'total mm':45s}" + "".join(f"{x:7.2f}" for x in total / ARCMIN * d * 1e3))
    print(f"  {'px @ 25 px/deg':45s}" + "".join(f"{x:7.2f}" for x in total / 60 * 25))
    dd = np.geomspace(0.25, 6, 300)
    Bd = budget(dd)
    tot = np.sqrt(sum(v**2 for v in Bd.values()))
    cols = [BLUE, ORANGE, RED, GREEN, PURPLE, CYAN]
    styles = ["-", "-", "--", "-.", "-", ":"]
    for lang in LANGS:
        fig, axs = plt.subplots(1, 2, figsize=(14, 5.6), gridspec_kw=dict(width_ratios=[1.35, 1]))
        ax = axs[0]
        for (k, v), nm, col, ls in zip(Bd.items(), BUDGET_NAMES, cols, styles):
            ax.loglog(dd, np.maximum(v, 1e-2), color=col, ls=ls, lw=2, label=label(lang, *nm))
        ax.loglog(dd, tot, color=C["dark"], lw=3.2, label=label(lang, "total (RSS)", "总计（平方和开根）", "合計（二乗和平方根）"))
        ax.axhline(60 / 25, color=C["gray"], ls=":", lw=1.4)
        ax.text(0.26, 60 / 25 * 1.06, label(lang, "1 px at 25 px/°", "25 px/° 下的 1 像素", "25 px/° での 1 画素"),
                fontsize=12, color=C["gray"])
        ax.set_ylim(0.3, 60); ax.set_xlim(0.25, 6)
        ax.set_xlabel(label(lang, "distance of the virtual object d (m)", "虚拟物体距离 d（m）", "仮想物体までの距離 d（m）"))
        ax.set_ylabel(label(lang, "angular error (arcmin)", "角度误差（角分）", "角度誤差（分角）"))
        ax.legend(fontsize=11, loc="upper right", framealpha=0.9)
        plain_log_x(ax, [0.3, 0.5, 1, 2, 4])
        ax = axs[1]
        ax.semilogx(dd, tot / ARCMIN * dd * 1e3, color=C["dark"], lw=3)
        ax.set_xlim(0.25, 6); ax.set_ylim(0, 7)
        ax.set_xlabel("d (m)")
        plain_log_x(ax, [0.3, 0.5, 1, 2, 4])
        ax.set_ylabel(label(lang, "error at the object (mm)", "物体处的误差（mm）", "物体上の誤差（mm）"))
        fig.tight_layout()
        out(fig, f"10-budget_{lang}.svg")


# =============================================================================================
# post, section 5: passthrough reprojection (post)
# =============================================================================================
def passthrough_error(X_e, c, d0=None, depth_scale=1.0):
    """Angular error (arcmin) at the eye (origin of the eye frame, OpenCV axes) when a point
    X_e seen by a camera centred at c is reprojected to the eye. The camera is a rotation-free
    offset of the eye here, so camera coordinates are X_e - c. The reprojection either assumes
    a fronto-parallel plane at depth d0 (measured from the eye), or uses the true depth times
    depth_scale."""
    Xc = X_e - c                                   # the point in the camera frame
    ray = Xc / Xc[2]                               # normalized camera ray (x, y, 1) = K^-1 u
    Z = d0 - c[2] if d0 is not None else Xc[2] * depth_scale
    X_rec = c + Z * ray                            # back-projected point, in the eye frame
    a, b = X_e / np.linalg.norm(X_e), X_rec / np.linalg.norm(X_rec)
    return np.arccos(np.clip(a @ b, -1, 1)) * ARCMIN


CAM_OFF = np.array([0.032, 0.0, 0.07])


def fig_passthrough():
    print("== passthrough (camera 3.2 cm to the side, 7 cm in front)")
    for d in (0.3, 0.5, 1.0, 2.0, 5.0):
        X = np.array([0.0, 0.0, d])
        e1 = passthrough_error(X, CAM_OFF, d0=1.0)
        e2 = passthrough_error(X, CAM_OFF, d0=2.0)
        e3 = passthrough_error(X, CAM_OFF, depth_scale=1.03)
        approx = parallax(0.032, d, 1.0) * ARCMIN
        print(f"  d = {d:3.1f} m: plane 1 m {e1:6.1f}' (first order {approx:6.1f}'), plane 2 m {e2:6.1f}', depth +3% {e3:5.1f}'")
    fig, axs = plt.subplots(1, 2, figsize=(14, 5.6), gridspec_kw=dict(width_ratios=[1, 1.15]))
    ax = axs[0]
    X = np.array([-0.05, 0.0, 0.45]); d0 = 1.0
    Xc = X - CAM_OFF; ray = Xc / Xc[2]; P = CAM_OFF + (d0 - CAM_OFF[2]) * ray
    ax.plot([-0.25, 0.25], [d0, d0], color=C["gray"], lw=2, ls="--")
    ax.text(0.26, d0, r"$d_0$", va="center", fontsize=15, color=C["gray"])
    ax.plot([CAM_OFF[0], P[0]], [CAM_OFF[2], P[2]], color=CYAN, lw=2)
    ax.plot([0, X[0] * 2.4], [0, X[2] * 2.4], color=GREEN, lw=2)
    ax.plot([0, P[0]], [0, P[2]], color=RED, lw=2, ls="-")
    ax.plot(*X[[0, 2]], "o", color=C["dark"], ms=10); ax.text(X[0] - 0.035, X[2], r"$\mathbf{X}$", fontsize=16, ha="right")
    ax.plot(*P[[0, 2]], "o", color=RED, ms=9); ax.text(P[0] + 0.015, P[2] + 0.03, r"$\mathbf{X}'$", fontsize=16, color=RED)
    ax.plot(0, 0, "s", color=C["dark"], ms=11); ax.text(-0.02, -0.06, "E", fontsize=15, ha="right")
    ax.plot(*CAM_OFF[[0, 2]], "^", color=CYAN, ms=12); ax.text(CAM_OFF[0] + 0.02, CAM_OFF[2] - 0.05, "C", fontsize=15, color=CYAN)
    ang = np.arccos(X @ P / np.linalg.norm(X) / np.linalg.norm(P)) * ARCMIN
    ax.text(-0.24, 1.12, rf"$\varepsilon = {ang:.0f}'$", fontsize=15, color=RED)
    ax.set_xlim(-0.3, 0.3); ax.set_ylim(-0.12, 1.25); ax.set_aspect("equal")
    ax.set_xlabel("$x$ (m)"); ax.set_ylabel("$z$ (m)")
    print(f"  geometry panel: X = {X}, error {ang:.1f}'")
    ax = axs[1]
    dd = np.geomspace(0.25, 8, 200)
    for d0_, col, ls in ((1.0, ORANGE, "-"), (2.0, PURPLE, "-"), (np.inf, C["gray"], "--")):
        e = [passthrough_error(np.array([0.0, 0.0, d]), CAM_OFF, d0=d0_ if np.isfinite(d0_) else 1e9) for d in dd]
        lab = rf"$d_0 = {d0_:.0f}$ m" if np.isfinite(d0_) else r"$d_0 = \infty$"
        ax.loglog(dd, np.maximum(e, 0.05), color=col, ls=ls, label=lab)
    ax.loglog(dd, np.maximum(parallax(0.032, dd, 1.0) * ARCMIN, 0.05), color=ORANGE, ls=":", lw=1.5,
              label=r"$b_\perp\,|1/d-1/d_0|$")
    for s, col in ((1.03, GREEN), (1.01, CYAN)):
        e = [passthrough_error(np.array([0.0, 0.0, d]), CAM_OFF, depth_scale=s) for d in dd]
        ax.loglog(dd, e, color=col, label=rf"$\hat Z = {s:.2f}\,Z$")
    ax.axhline(60 / 25, color=C["dark"], ls=":", lw=1.2)
    ax.set_ylim(0.1, 1000); ax.set_xlim(0.25, 8)
    ax.set_xlabel("$d$ (m)"); ax.set_ylabel(r"$\varepsilon$ (′)")
    ax.legend(fontsize=12, loc="upper right", ncol=2)
    plain_log_x(ax, [0.3, 0.5, 1, 2, 4, 8])
    fig.tight_layout()
    out(fig, "10-passthrough.svg")


# =============================================================================================
# post, section 6: hand tracking (post)
# =============================================================================================
def triangulate(us, Ps):
    """Linear (DLT) triangulation of one point from pixels us[i] seen by cameras Ps[i] (3x4)."""
    A = []
    for (u, v), P in zip(us, Ps):
        A += [u * P[2] - P[0], v * P[2] - P[1]]
    X = np.linalg.svd(np.array(A))[2][-1]
    return X[:3] / X[3]


def project(P, X):
    x = P @ np.append(X, 1.0)
    return x[:2] / x[2]


def cov_triangulated(X, Ps, sigma_px, eps=1e-6):
    """First-order covariance of the triangulated point: Sigma = J diag(sigma^2) J^T,
    with J the numerical Jacobian of triangulate() with respect to all pixel coordinates."""
    us = [project(P, X) for P in Ps]
    z = np.concatenate(us)
    J = np.zeros((3, z.size))
    for j in range(z.size):
        dz = np.zeros(z.size); dz[j] = eps
        Xp = triangulate((z + dz).reshape(-1, 2), Ps)
        Xm = triangulate((z - dz).reshape(-1, 2), Ps)
        J[:, j] = (Xp - Xm) / (2 * eps)
    return J @ J.T * sigma_px**2


def alpha(cutoff, dt):
    """Smoothing factor of a first-order low-pass filter with this cutoff frequency (Hz)."""
    tau = 1.0 / (2 * np.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)


def one_euro(x, dt, min_cutoff=1.0, beta=0.0, d_cutoff=1.0):
    """1-euro filter (Casiez et al. 2012): the cutoff grows with the filtered speed."""
    y, dy = np.empty_like(x), 0.0
    y[0] = x[0]
    for k in range(1, len(x)):
        d = (x[k] - y[k - 1]) / dt                      # raw speed estimate
        dy = dy + alpha(d_cutoff, dt) * (d - dy)        # smoothed speed
        a = alpha(min_cutoff + beta * abs(dy), dt)      # adaptive cutoff
        y[k] = y[k - 1] + a * (x[k] - y[k - 1])
    return y


def fig_hand():
    f, b = 280.0, 0.10
    K = np.array([[f, 0, 320], [0, f, 240], [0, 0, 1]])
    Ps = [K @ np.c_[np.eye(3), [b / 2, 0, 0]], K @ np.c_[np.eye(3), [-b / 2, 0, 0]]]
    rng = np.random.default_rng(0)
    print("== hand triangulation (f = 280 px, b = 10 cm, 1 px)")
    for Z in (0.3, 0.5, 0.7):
        X = np.array([0.0, 0.1, Z])
        S = cov_triangulated(X, Ps, 1.0)
        sx, sy, sz = np.sqrt(np.diag(S)) * 1e3
        mc = np.array([triangulate([project(P, X) + rng.normal(0, 1.0, 2) for P in Ps], Ps) for _ in range(2000)])
        print(f"  Z = {Z:.1f}: sigma_x {sx:.2f} sigma_y {sy:.2f} sigma_z {sz:.2f} mm,"
              f" sqrt2 Z^2/(f b) = {np.sqrt(2) * Z**2 / (f * b) * 1e3:.2f}, MC {mc[:, 2].std() * 1e3:.2f}")
    dt = 1 / 60.0
    t = np.arange(0, 3, dt)
    s = np.clip((t - 1.0) / 0.3, 0, 1)
    truth = 0.10 * (10 * s**3 - 15 * s**4 + 6 * s**5)
    meas = truth + 0.002 * np.random.default_rng(3).standard_normal(t.size)
    rest, move = t < 1.0, (t >= 1.0) & (t < 1.5)
    runs = [("raw", "原始", "生データ", meas, C["gray"]),
            ("low-pass 1 Hz", "低通 1 Hz", "ローパス 1 Hz", one_euro(meas, dt, 1.0, 0.0), BLUE),
            ("low-pass 5 Hz", "低通 5 Hz", "ローパス 5 Hz", one_euro(meas, dt, 5.0, 0.0), ORANGE),
            ("1€ (1 Hz, β = 30)", "1€（1 Hz，β = 30）", "1€（1 Hz、β = 30）", one_euro(meas, dt, 1.0, 30.0), PURPLE)]
    print("== 1-euro filter")
    stats = []
    for en, _, _, y, _ in runs:
        jit = np.std(y[rest][20:] - truth[rest][20:]) * 1e3
        lag = np.abs(y[move] - truth[move]).max() * 1e3
        stats.append((jit, lag))
        print(f"  {en:20s} jitter {jit:5.2f} mm, max error while moving {lag:5.1f} mm")
    for lang in LANGS:
        fig, axs = plt.subplots(1, 2, figsize=(14, 5.6), gridspec_kw=dict(width_ratios=[1, 1.25]))
        ax = axs[0]
        for xc in (-b / 2, b / 2):
            ax.plot(xc, 0, "^", color=CYAN, ms=12)
            ax.plot([xc, xc - 0.4], [0, 0.75], color=CYAN, lw=0.6, alpha=0.5)
            ax.plot([xc, xc + 0.4], [0, 0.75], color=CYAN, lw=0.6, alpha=0.5)
        mag = 3.0
        for Z in (0.25, 0.4, 0.55, 0.7):
            for x in (-0.15, 0.0, 0.15):
                X = np.array([x, 0.0, Z])
                S = cov_triangulated(X, Ps, 1.0)[np.ix_([0, 2], [0, 2])]
                w_, V = np.linalg.eigh(S)
                angle = np.degrees(np.arctan2(V[1, 1], V[0, 1]))
                ax.add_patch(Ellipse((x, Z), 2 * mag * np.sqrt(w_[1]), 2 * mag * np.sqrt(w_[0]), angle=angle,
                                     facecolor=PURPLE, alpha=0.35, edgecolor=PURPLE, lw=1.5))
                ax.plot(x, Z, ".", color=C["dark"], ms=4)
        ax.set_xlim(-0.32, 0.32); ax.set_ylim(-0.05, 0.8); ax.set_aspect("equal")
        ax.set_xlabel("$x$ (m)"); ax.set_ylabel("$Z$ (m)")
        ax.set_title(label(lang, "1σ ellipses ×3 (σ = 1 px)", "1σ 椭圆 ×3（σ = 1 px）", "1σ 楕円 ×3（σ = 1 px）"),
                     fontsize=14)
        ax = axs[1]
        m = (t > 0.6) & (t < 1.9)
        ax.plot(t[m], truth[m] * 100, color=C["dark"], lw=3, label=label(lang, "truth", "真值", "真値"))
        for (en, zh, ja, y, col), (jit, lag) in zip(runs, stats):
            ax.plot(t[m], y[m] * 100, color=col, lw=1.4 if en == "raw" else 2.0,
                    label=label(lang, en, zh, ja) + f": {jit:.2f} / {lag:.0f} mm")
        ax.set_xlabel(label(lang, "time (s)", "时间（s）", "時間（s）"))
        ax.set_ylabel(label(lang, "fingertip x (cm)", "指尖 x（cm）", "指先 x（cm）"))
        ax.legend(fontsize=11.5, loc="lower right",
                  title=label(lang, "jitter at rest / max lag error", "静止抖动 / 运动时最大误差",
                              "静止時のジッタ / 移動中の最大誤差"), title_fontsize=11.5)
        fig.tight_layout()
        out(fig, f"10-hand_{lang}.svg")


# =============================================================================================
# post, section 7: eye tracking (post)
# =============================================================================================
R_CORNEA, D_CORNEA, D_PUPIL = 7.8e-3, 5.3e-3, 9.5e-3   # model eye (m): cornea radius, distances
                                                         # of cornea centre and pupil centre from
                                                         # the eye's centre of rotation
CAM_EYE = np.array([0.0, 0.015, 0.035])                  # eye camera: 15 mm below, 35 mm in front
LED_EYE = np.array([-0.012, 0.015, 0.035])               # IR LED next to it
_z = -CAM_EYE / np.linalg.norm(CAM_EYE)                  # the camera looks at the eye centre
_x = np.cross([0.0, 1.0, 0.0], _z); _x /= np.linalg.norm(_x)
R_CAM = np.stack([_x, np.cross(_z, _x), _z])             # rows: camera axes in the eye frame
K_EYE = np.array([[600.0, 0, 200], [0, 600.0, 200], [0, 0, 1]])


def look(yaw, pitch):
    """Optical axis for gaze angles in degrees (eye frame: x right, y down, z forward)."""
    h, v = np.deg2rad(yaw), np.deg2rad(pitch)
    return np.array([np.sin(h) * np.cos(v), -np.sin(v), np.cos(h) * np.cos(v)])


def glint(c, cam, led, iters=30):
    """Point on the corneal sphere (centre c) that reflects the LED into the camera:
    there the surface normal bisects the directions to the LED and to the camera."""
    q = c + R_CORNEA * (cam - c) / np.linalg.norm(cam - c)
    for _ in range(iters):
        n = (led - q) / np.linalg.norm(led - q) + (cam - q) / np.linalg.norm(cam - q)
        q = c + R_CORNEA * n / np.linalg.norm(n)
    return q


def eye_image(yaw, pitch, slip=np.zeros(3)):
    """Pixels of the pupil centre and the glint. slip translates the headset (camera and LED)
    relative to the eye after calibration; the camera does not rotate."""
    cam, led = CAM_EYE + slip, LED_EYE + slip
    a = look(yaw, pitch)
    uv = []
    for X in (D_PUPIL * a, glint(D_CORNEA * a, cam, led)):   # pupil (refraction ignored), glint
        x = K_EYE @ (R_CAM @ (X - cam))
        uv.append(x[:2] / x[2])
    return uv


def feature(yaw, pitch, mode, slip=np.zeros(3), noise=0.0, rng=None):
    p, g = eye_image(yaw, pitch, slip)
    if rng is not None:
        p, g = p + noise * rng.standard_normal(2), g + noise * rng.standard_normal(2)
    return p - g if mode == "pccr" else p


def poly2(f):
    x, y = f
    return np.array([1, x, y, x * y, x * x, y * y])


def calibrate(mode, targets):
    F = np.array([poly2(feature(h, v, mode)) for h, v in targets])
    return np.linalg.lstsq(F, np.array(targets, float), rcond=None)[0]   # 6 x 2


EYE_TARGETS = [(h, v) for v in (-15, 0, 15) for h in (-15, 0, 15)]
EYE_GRID = [(h, v) for v in np.linspace(-20, 20, 9) for h in np.linspace(-20, 20, 9)]


def eye_errors(mode, slip_mm, rng):
    Cf = calibrate(mode, EYE_TARGETS)
    slip = np.array([0.0, slip_mm * 1e-3, 0.0])            # the headset slides down
    err = []
    for h, v in EYE_GRID:
        est = poly2(feature(h, v, mode, slip, 0.2, rng)) @ Cf
        err.append(np.hypot(est[0] - h, est[1] - v))
    err = np.array(err)
    inner = np.array([abs(h) <= 15 and abs(v) <= 15 for h, v in EYE_GRID])
    return err, inner


def fig_eye():
    rng = np.random.default_rng(0)
    print("== eye tracking (9-point calibration, 0.2 px noise)")
    table = {}
    for mode in ("pupil", "pccr"):
        for slip in (0.0, 0.5, 1.0):
            err, inner = eye_errors(mode, slip, rng)
            table[(mode, slip)] = err[inner].mean()
            print(f"  {mode:5s} slip {slip:.1f} mm: mean {err[inner].mean():.2f} deg inside +-15,"
                  f" {err.mean():.2f} over +-20, max {err.max():.2f}")
    p, g = eye_image(0, 0)
    p2, g2 = eye_image(10, 0)
    ps, gs = eye_image(0, 0, np.array([0, 1e-3, 0]))
    print(f"  pupil/glint at 0: {p.round(1)} {g.round(1)}; yaw 10: {p2.round(1)} {g2.round(1)};"
          f" 1 mm slip: {ps.round(1)} {gs.round(1)}")
    for lang in LANGS:
        fig, axs = plt.subplots(1, 2, figsize=(14, 5.8), gridspec_kw=dict(width_ratios=[1.1, 1]))
        ax = axs[0]
        for slip, alpha_, mk in ((0.0, 1.0, "o"), (1.0, 0.45, "o")):
            for h, v in EYE_TARGETS:
                pp, gg = eye_image(h, v, np.array([0, slip * 1e-3, 0]))
                ax.plot(*pp, mk, color=PURPLE, alpha=alpha_, ms=8)
                ax.plot(*gg, "x", color=ORANGE, alpha=alpha_, ms=9, mew=2.5)
                ax.plot([pp[0], gg[0]], [pp[1], gg[1]], color=C["gray"], alpha=alpha_ * 0.7, lw=1)
        ax.plot([], [], "o", color=PURPLE, label=label(lang, "pupil centre", "瞳孔中心", "瞳孔中心"))
        ax.plot([], [], "x", color=ORANGE, mew=2.5, label=label(lang, "glint", "角膜反射点（glint）", "角膜反射（グリント）"))
        ax.plot([], [], "o", color=PURPLE, alpha=0.45, label=label(lang, "after 1 mm slip", "头显下滑 1 mm 后", "1 mm ずれた後"))
        ax.invert_yaxis(); ax.set_aspect("equal")
        ax.set_xlabel("$u$ (px)"); ax.set_ylabel("$v$ (px)")
        ax.legend(fontsize=12, loc="lower left")
        ax = axs[1]
        slips = np.array([0.0, 0.5, 1.0])
        w = 0.18
        for k, (mode, col, nm) in enumerate((("pupil", BLUE, ("pupil only", "仅瞳孔", "瞳孔のみ")),
                                             ("pccr", PURPLE, ("pupil − glint (PCCR)", "瞳孔 − 反射点（PCCR）", "瞳孔 − グリント（PCCR）")))):
            vals = [table[(mode, s)] for s in slips]
            ax.bar(slips + (k - 0.5) * w, vals, width=w, color=col, label=label(lang, *nm))
            for s, v in zip(slips, vals):
                ax.text(s + (k - 0.5) * w, v + 0.1, f"{v:.2f}", ha="center", fontsize=12)
        ax.set_xticks(slips); ax.set_xticklabels(["0", "0.5", "1.0"])
        ax.set_xlabel(label(lang, "headset slip after calibration (mm)", "标定后头显滑动（mm）", "較正後のヘッドセットのずれ（mm）"))
        ax.set_ylabel(label(lang, "mean gaze error (°), ±15° field", "平均注视误差（°），±15° 视场", "平均視線誤差（°）、±15° の範囲"))
        ax.legend(fontsize=12, loc="upper left")
        ax.set_ylim(0, 8)
        fig.tight_layout()
        out(fig, f"10-eye_{lang}.svg")


# =============================================================================================
# post, section 8: planes (post)
# =============================================================================================
def make_room(rng, noise=0.005):
    """Synthetic depth-sensor points of a room corner (world: z up, metres):
    floor, two walls, a table top 0.75 m high, plus clutter."""
    def patch(n, f):
        u, v = rng.random(n), rng.random(n)
        return f(u, v)
    parts = [
        patch(3000, lambda u, v: np.c_[3 * u, 3 * v, 0 * u]),                       # floor z = 0
        patch(2000, lambda u, v: np.c_[0 * u, 3 * u, 2.5 * v]),                     # wall x = 0
        patch(1500, lambda u, v: np.c_[3 * u, 0 * u, 2.5 * v]),                     # wall y = 0
        patch(600, lambda u, v: np.c_[1.4 + 1.0 * u, 1.2 + 0.6 * v, 0.75 + 0 * u]),  # table top
        patch(500, lambda u, v: np.c_[3 * u, 3 * v, 2.0 * rng.random(u.size)]),     # clutter
    ]
    P = np.vstack(parts)
    return P + noise * rng.standard_normal(P.shape)


def fit_plane(P):
    """Least-squares plane n.x = d through points P (n = smallest singular vector)."""
    c = P.mean(axis=0)
    n = np.linalg.svd(P - c)[2][-1]
    return n, n @ c


def ransac_plane(P, thr, iters, rng):
    best = None
    for _ in range(iters):
        a, b, c = P[rng.choice(len(P), 3, replace=False)]
        n = np.cross(b - a, c - a)
        if np.linalg.norm(n) < 1e-9:
            continue
        n /= np.linalg.norm(n)
        inl = np.abs(P @ n - n @ a) < thr
        if best is None or inl.sum() > best.sum():
            best = inl
    n, d = fit_plane(P[best])                      # refine on the inliers
    return n, d, np.abs(P @ n - d) < thr


def extract_planes(P, rng, viewpoint=np.array([1.5, 1.5, 1.6]), up=np.array([0.0, 0.0, 1.0])):
    remaining = np.arange(len(P))
    planes = []
    for _ in range(6):
        n, d, inl = ransac_plane(P[remaining], 0.015, 200, rng)
        if inl.sum() < 300:
            break
        if n @ viewpoint - d < 0:                  # orient the normal towards the viewer
            n, d = -n, -d
        c = abs(n @ up)
        kind = "horizontal" if c > np.cos(np.deg2rad(5)) else "vertical" if c < np.sin(np.deg2rad(5)) else "slanted"
        planes.append((n + 0.0, d, remaining[inl], kind))
        remaining = remaining[~inl]
    return planes, remaining


def fig_planes():
    rng = np.random.default_rng(0)
    P = make_room(rng)
    planes, rest = extract_planes(P, rng)
    print("== planes")
    for k, (n, d, idx, kind) in enumerate(planes):
        rms = np.sqrt(np.mean((P[idx] @ n - d) ** 2)) * 1e3
        print(f"  plane {k}: n = {np.round(n, 3) + 0.0}, d = {0.0 if abs(d) < 5e-4 else d:6.3f} m, {len(idx)} inliers, RMS {rms:.1f} mm, {kind}")
    print(f"  {len(rest)} points left")
    fig = plt.figure(figsize=(9.5, 7.5))
    ax = fig.add_subplot(111, projection="3d")
    ax.view_init(elev=24, azim=40)
    cols = [GREEN, RED, BLUE, ORANGE, PURPLE, CYAN]
    sub = np.random.default_rng(1)
    for (n, d, idx, kind), col in zip(planes, cols):
        s = sub.choice(idx, min(len(idx), 900), replace=False)
        ax.scatter(*P[s].T, s=3, color=col, alpha=0.6, depthshade=False)
        c = P[idx].mean(axis=0)
        ax.quiver(*c, *(0.5 * n), color=col, linewidth=3, arrow_length_ratio=0.25)
    s = sub.choice(rest, min(len(rest), 400), replace=False)
    ax.scatter(*P[s].T, s=3, color=C["gray"], alpha=0.5, depthshade=False)
    ax.set_xlim(0, 3); ax.set_ylim(0, 3); ax.set_zlim(0, 2.5)
    ax.set_box_aspect((3, 3, 2.5))
    ax.set_xlabel("$x$"); ax.set_ylabel("$y$"); ax.set_zlabel("$z$")
    ax.set_xticks([0, 1, 2, 3]); ax.set_yticks([0, 1, 2, 3]); ax.set_zticks([0, 1, 2])
    out(fig, "10-planes.svg")


# =============================================================================================
# post, section 9: anchors (post)
# =============================================================================================
def se2(x, y, th):
    c, s = np.cos(th), np.sin(th)
    return np.array([[c, -s, x], [s, c, y], [0, 0, 1.0]])


def walk(rect=(12.0, 6.0), step=0.05, yaw_drift_deg_per_m=0.3):
    """Poses along a rectangular loop: the true path and the path odometry reports with a
    small heading drift per metre walked (2D, world z up)."""
    W, H = rect
    corners = [(0, 0), (W, 0), (W, H), (0, H), (0, 0)]
    true, odo = [], []
    T_odo = se2(0, 0, 0)
    for (x0, y0), (x1, y1) in zip(corners[:-1], corners[1:]):
        L = np.hypot(x1 - x0, y1 - y0)
        th = np.arctan2(y1 - y0, x1 - x0)
        for s in np.arange(0, L, step):
            T = se2(x0 + s * np.cos(th), y0 + s * np.sin(th), th)
            if true:
                dT = np.linalg.inv(true[-1]) @ T                 # true relative motion
                d = np.hypot(dT[0, 2], dT[1, 2])
                dyaw = np.arctan2(dT[1, 0], dT[0, 0]) + np.deg2rad(yaw_drift_deg_per_m) * d
                T_odo = T_odo @ se2(dT[0, 2], dT[1, 2], dyaw)
            true.append(T); odo.append(T_odo.copy())
    return np.array(true), np.array(odo)


def anchors_experiment():
    true, odo = walk()
    n = len(true)
    place = np.arange(25, n, 80)                               # where the user placed content
    offset = np.array([0.0, 1.0, 1.0])                         # 1 m to the left, in the body frame
    content_true = np.array([true[i] @ offset for i in place])
    content_map = np.array([odo[i] @ offset for i in place])   # where the drifting map put it
    anchors = np.arange(0, n, 40)                              # a keyframe anchor every 2 m
    nearest = np.array([anchors[np.argmin(np.abs(anchors - i))] for i in place])
    local = np.array([np.linalg.inv(odo[a]) @ c for a, c in zip(nearest, content_map)])
    # loop closure + pose-graph optimisation: assume it recovers the true keyframe poses
    anchor_pos = np.array([true[a] @ l for a, l in zip(nearest, local)])
    return true, odo, place, content_true, content_map, anchors, nearest, anchor_pos


def fig_anchors():
    true, odo, place, ct, cm, anchors, nearest, ap = anchors_experiment()
    ge = np.linalg.norm(cm[:, :2] - ct[:, :2], axis=1)
    ae = np.linalg.norm(ap[:, :2] - ct[:, :2], axis=1)
    print(f"== anchors: loop end error {np.hypot(*odo[-1][:2, 2]):.2f} m")
    for i, g, a, k in zip(place, ge, ae, nearest):
        print(f"  content at {i * 0.05:5.2f} m walked, anchor {abs(i - k) * 0.05:.2f} m away:"
              f" world {g * 100:6.1f} cm, anchor {a * 100:5.2f} cm")
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(13, 7.4))
        ax.plot(true[:, 0, 2], true[:, 1, 2], color=C["dark"], lw=2, label=label(lang, "true path", "真实路径", "真の経路"))
        ax.plot(odo[:, 0, 2], odo[:, 1, 2], color=ORANGE, lw=2, ls="--",
                label=label(lang, "map before loop closure", "回环前的地图", "ループ閉じ込み前の地図"))
        ax.plot(true[anchors, 0, 2], true[anchors, 1, 2], "s", color=GREEN, ms=6, alpha=0.7,
                label=label(lang, "anchors (every 2 m)", "锚点（每 2 m）", "アンカー（2 m ごと）"))
        ax.plot(ct[:, 0], ct[:, 1], "*", color=C["dark"], ms=15,
                label=label(lang, "where the content belongs", "内容应在的位置", "コンテンツの本来の位置"))
        ax.plot(cm[:, 0], cm[:, 1], "X", color=RED, ms=11,
                label=label(lang, "stored in world coordinates", "以世界坐标保存", "ワールド座標で保存"))
        for a_, b_ in zip(ct, cm):
            ax.annotate("", xy=b_[:2], xytext=a_[:2], arrowprops=dict(arrowstyle="->", color=RED, lw=1.4))
        ax.plot(ap[:, 0], ap[:, 1], "o", mfc="none", mec=GREEN, mew=2.5, ms=14,
                label=label(lang, "stored relative to the nearest anchor", "相对最近锚点保存", "最寄りのアンカー基準で保存"))
        ax.set_aspect("equal")
        ax.set_xlabel("$x$ (m)"); ax.set_ylabel("$y$ (m)")
        ax.set_xlim(-2.5, 14.5); ax.set_ylim(-1.5, 8.6)
        ax.legend(fontsize=11.5, loc="center", framealpha=0.9)
        fig.tight_layout()
        out(fig, f"10-anchors_{lang}.svg")


if __name__ == "__main__":
    fig_frames()
    fig_drift()
    fig_timeline()
    fig_prediction()
    fig_timewarp()
    fig_budget()
    fig_passthrough()
    fig_hand()
    fig_eye()
    fig_planes()
    fig_anchors()
