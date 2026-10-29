"""Figures for embodied-ai post 03 (simulation platforms).

The MuJoCo figures run the post's own MJCF and controller with the `mujoco` Python package
(pip install mujoco; tested with 3.17). Conventions follow the MJCF: right-handed, z up, the arm's
hinges rotate about +y (a positive angle turns +x toward -z).

    python3 bin/figures/embodied-ai/embodied-ai_03.py
"""
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401
plt.rcParams["svg.hashsalt"] = "embodied-ai"  # deterministic SVG ids, so regenerated files do not churn
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/embodied-ai"

XML = """
<mujoco model="arm_and_box">
  <option timestep="0.002" gravity="0 0 -9.81"/>
  <worldbody>
    <light pos="0 0 3"/>
    <geom name="floor" type="plane" size="2 2 0.1"/>
    <body name="link1" pos="0 0 0.5">
      <joint name="shoulder" type="hinge" axis="0 1 0" damping="0.5"/>
      <geom type="capsule" fromto="0 0 0 0.5 0 0" size="0.04" mass="1"/>
      <body name="link2" pos="0.5 0 0">
        <joint name="elbow" type="hinge" axis="0 1 0" damping="0.5"/>
        <geom type="capsule" fromto="0 0 0 0.4 0 0" size="0.035" mass="0.6"/>
        <site name="ee" pos="0.4 0 0"/>
      </body>
    </body>
    <body name="box" pos="0.6 0.4 0.3">
      <freejoint/>
      <geom name="box" type="box" size="0.05 0.05 0.05" mass="0.2" friction="0.8 0.005 0.0001"/>
    </body>
  </worldbody>
  <actuator>
    <motor name="m_shoulder" joint="shoulder" gear="1" ctrlrange="-30 30"/>
    <motor name="m_elbow" joint="elbow" gear="1" ctrlrange="-30 30"/>
  </actuator>
  <sensor>
    <jointpos joint="shoulder"/>
    <jointpos joint="elbow"/>
    <framepos objtype="site" objname="ee"/>
  </sensor>
</mujoco>
"""


# ================================================================= 1. what happens in one control step
def fig_sim_step():
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)
        fig, ax = plt.subplots(figsize=(10, 5.4))
        ax.set_xlim(-0.6, 21.2); ax.set_ylim(-0.4, 6.6); ax.axis("off")
        # time axis: one 20 ms control step = 10 physics steps of 2 ms
        ax.annotate("", xy=(20.9, 0.6), xytext=(-0.2, 0.6), arrowprops=dict(arrowstyle="-|>", lw=1.8))
        for k in range(11):
            ax.plot([2 * k, 2 * k], [0.45, 0.75], color=C["dark"], lw=1.5)
            ax.text(2 * k, 0.05, f"{2 * k}", ha="center", fontsize=13)
        ax.text(20.9, 0.05, "ms", fontsize=13)
        # physics substeps
        cols = [C["b"], C["a"], C["y"]]
        for k in range(10):
            x0 = 2 * k + 0.12
            for j, c in enumerate(cols):
                ax.add_patch(Rectangle((x0 + j * 0.59, 1.0), 0.55, 1.0, fc=c, ec="white", alpha=0.85))
        ax.text(10, 2.35, L(r"10 physics steps, $\Delta t$ = 2 ms", "10 个物理步，每步 2 ms", "10 回の物理ステップ（各 2 ms）"),
                ha="center", fontsize=14) if lang != "en" else ax.text(10, 2.35, r"10 physics steps of $\Delta t = 2$ ms", ha="center", fontsize=14)
        # legend of the three stages
        names = [L("collision detection", "碰撞检测", "衝突検出"), L("contact + constraint solve", "接触与约束求解", "接触・拘束の求解"),
                 L("integrate q, v", "积分 q, v", "q, v の積分")]
        for j, (c, n) in enumerate(zip(cols, names)):
            xs_ = (0.2, 6.6, 15.0)[j]
            ax.add_patch(Rectangle((xs_, 2.95), 0.6, 0.45, fc=c, alpha=0.85))
            ax.text(xs_ + 0.8, 3.17, n, va="center", fontsize=13.5)
        # control-rate events
        for x, txt, c in ((0, L("policy reads sensors\nand renders cameras", "策略读取传感器\n并渲染相机图像", "方策がセンサを読み\nカメラ画像を描画"), C["z"]),
                          (20, L("next policy step", "下一次策略步", "次の方策ステップ"), C["z"])):
            ax.annotate("", xy=(x, 0.8), xytext=(x, 4.4), arrowprops=dict(arrowstyle="-|>", lw=2.4, color=c))
            ax.text(x + (0.3 if x == 0 else -0.3), 4.85, txt, ha="left" if x == 0 else "right", fontsize=14, color=c, va="bottom")
        ax.text(10, 4.1, L("ctrl held constant (zero-order hold)", "ctrl 保持不变（零阶保持）", "ctrl は一定に保持（0 次ホールド）"),
                ha="center", fontsize=14, color=C["gray"], style="italic")
        ax.plot([0.3, 19.7], [3.8, 3.8], color=C["gray"], lw=1.2, ls="--")
        save(fig, OUT / f"03-sim-step_{lang}.svg")


# ================================================================= 2. integrators
def fig_integrators():
    g_l, dt, T = 9.81, 0.05, 12.0
    n = int(T / dt)
    q0, v0 = 2.0, 0.0
    E = lambda q, v: 0.5 * v ** 2 + g_l * (1 - np.cos(q))
    acc = lambda q: -g_l * np.sin(q)

    def run(kind):
        q, v, qs, vs = q0, v0, [q0], [v0]
        for _ in range(n):
            if kind == "explicit":
                q, v = q + dt * v, v + dt * acc(q)
            elif kind == "semi":
                v = v + dt * acc(q); q = q + dt * v
            else:  # RK4
                def f(s):
                    return np.array([s[1], acc(s[0])])
                s = np.array([q, v]); k1 = f(s); k2 = f(s + dt / 2 * k1); k3 = f(s + dt / 2 * k2); k4 = f(s + dt * k3)
                q, v = s + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
            qs.append(q); vs.append(v)
        return np.array(qs), np.array(vs)

    fig, axs = plt.subplots(2, 1, figsize=(9, 9.5))
    t = np.arange(n + 1) * dt
    for kind, col, lab in (("explicit", C["x"], "explicit Euler"), ("semi", C["z"], "semi-implicit Euler"), ("rk4", C["y"], "RK4")):
        qs, vs = run(kind)
        axs[0].plot(qs, vs, color=col, lw=1.8 if kind != "rk4" else 3, label=lab, alpha=0.9)
        axs[1].plot(t, E(qs, vs) / E(q0, v0), color=col, lw=2.2, label=lab)
    qq, vv = np.meshgrid(np.linspace(-np.pi, np.pi, 300), np.linspace(-8, 8, 300))
    axs[0].contour(qq, vv, E(qq, vv), levels=[E(q0, v0)], colors=[C["dark"]], linestyles="--", linewidths=1.2)
    axs[0].set_xlabel("$q$ [rad]"); axs[0].set_ylabel(r"$\dot q$ [rad/s]")
    axs[0].set_xlim(-np.pi, np.pi); axs[0].set_ylim(-8, 8)
    axs[0].legend(fontsize=13, loc="upper right")
    axs[0].set_title(r"pendulum $\ddot q = -(g/l)\sin q$, $q_0 = 2$, $\Delta t = 50$ ms")
    axs[1].set_xlabel("t [s]"); axs[1].set_ylabel(r"energy $E(t)/E(0)$")
    axs[1].set_ylim(0, 3); axs[1].axhline(1, color=C["dark"], ls="--", lw=1)
    axs[1].legend(fontsize=13, loc="upper left")
    fig.tight_layout()
    save(fig, OUT / "03-integrators.svg")


# ================================================================= 3. contact model and friction cone
def fig_contact():
    fig = plt.figure(figsize=(10, 5.2))
    ax = fig.add_subplot(1, 2, 1)
    ax.plot([0, 0], [0, 3], color=C["a"], lw=4, label="rigid: $0\\leq\\lambda_n\\perp\\phi\\geq 0$", solid_capstyle="butt")
    ax.plot([0, 3], [0, 0], color=C["a"], lw=4, solid_capstyle="butt")
    phi = np.linspace(-0.6, 3, 400)
    k, w = 1.0, 0.12
    soft = k * w * np.log1p(np.exp(-phi / w))  # a smooth, convex, monotone soft-contact law (illustrative)
    ax.plot(phi, soft * 6, color=C["b"], lw=2.5, ls="--", label="soft / regularized\n(illustrative)")
    ax.axvline(0, color=C["gray"], lw=0.8); ax.axhline(0, color=C["gray"], lw=0.8)
    ax.fill_betweenx([0, 3], -0.6, 0, color=C["x"], alpha=0.07)
    ax.text(-0.55, 2.7, "$\\phi<0$", color=C["x"], fontsize=14)
    ax.set_xlim(-0.6, 3); ax.set_ylim(-0.2, 3)
    ax.set_xlabel(r"gap $\phi(q)$"); ax.set_ylabel(r"normal force $\lambda_n$")
    ax.set_xticks([0]); ax.set_yticks([0])
    ax.legend(fontsize=12.5, loc="upper right")
    # friction cone in 3D
    ax = fig.add_subplot(1, 2, 2, projection="3d")
    mu = 0.6
    th = np.linspace(0, 2 * np.pi, 60); h = np.linspace(0, 1, 2)
    TH, Hh = np.meshgrid(th, h)
    ax.plot_surface(mu * Hh * np.cos(TH), mu * Hh * np.sin(TH), Hh, color=C["a"], alpha=0.18, lw=0)
    ax.plot(mu * np.cos(th), mu * np.sin(th), np.ones_like(th), color=C["a"], lw=2)
    # pyramidal (4-sided) approximation: |f_x| + |f_y| <= mu f_n inscribed... use the outer square |f_x|,|f_y| <= mu f_n / sqrt2? draw inscribed pyramid
    sq = np.array([[mu, 0], [0, mu], [-mu, 0], [0, -mu], [mu, 0]])
    ax.plot(sq[:, 0], sq[:, 1], np.ones(5), color=C["b"], lw=2, ls="--")
    for p in sq[:4]:
        ax.plot([0, p[0]], [0, p[1]], [0, 1], color=C["b"], lw=1.2, ls="--")
    # plane patch (the contact surface)
    P = np.array([[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]])
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    ax.add_collection3d(Poly3DCollection([np.c_[P, np.zeros(4)]], fc=C["gray"], alpha=0.15))
    ax.quiver(0, 0, 0, 0, 0, 1.25, color=C["z"], linewidth=2.5, arrow_length_ratio=0.1)
    ax.text(0.05, 0.05, 1.32, r"$n$", fontsize=16, color=C["z"])
    f_in = np.array([0.3, 0.2, 0.85]); f_out = np.array([0.75, -0.35, 0.7])
    ax.quiver(0, 0, 0, *f_in, color=C["y"], linewidth=3, arrow_length_ratio=0.12)
    ax.quiver(0, 0, 0, *f_out, color=C["x"], linewidth=3, arrow_length_ratio=0.12)
    ax.text(*(f_in * 1.12), "stick", fontsize=13, color=C["y"])
    ax.text(*(f_out * 1.08), "infeasible", fontsize=13, color=C["x"])
    ax.text(-0.75, 0.3, 1.12, r"$\Vert\lambda_t\Vert=\mu\lambda_n$", fontsize=14, color=C["a"])
    ax.view_init(elev=18, azim=-60)
    ax.set_xlim(-0.8, 0.8); ax.set_ylim(-0.8, 0.8); ax.set_zlim(0, 1.3)
    ax.set_box_aspect((1, 1, 1), zoom=1.2); ax.set_axis_off()
    fig.subplots_adjust(wspace=0.05, left=0.08, right=0.98)
    save(fig, OUT / "03-contact-model.svg")


# ================================================================= 4. the post's MuJoCo example, plotted
def fig_mujoco():
    import mujoco
    model = mujoco.MjModel.from_xml_string(XML)
    data = mujoco.MjData(model)
    q_ref = np.array([-0.6, 1.2]); Kp, Kd = 60.0, 4.0
    arm = [model.joint("shoulder").qposadr[0], model.joint("elbow").qposadr[0]]
    arm_v = [model.joint("shoulder").dofadr[0], model.joint("elbow").dofadr[0]]
    T, Q, Z, U = [], [], [], []
    for step in range(1500):
        q, qd = data.qpos[arm], data.qvel[arm_v]
        data.ctrl[:] = Kp * (q_ref - q) - Kd * qd + data.qfrc_bias[arm_v]
        mujoco.mj_step(model, data)
        T.append(data.time); Q.append(data.qpos[arm].copy()); Z.append(data.body("box").xpos[2]); U.append(data.ctrl.copy())
    T, Q, Z, U = map(np.array, (T, Q, Z, U))
    print("box lowest z during impact", round(Z.min(), 4))
    print("mujoco", mujoco.__version__, "joint error", np.round(q_ref - data.qpos[arm], 4),
          "ee", np.round(data.sensordata[2:5], 3), "box z", round(data.body("box").xpos[2], 4))
    f = np.zeros(6); contacts = []
    for i in range(data.ncon):
        c = data.contact[i]
        mujoco.mj_contactForce(model, data, i, f)
        contacts.append((c.pos.copy(), c.frame[:3].copy(), f[0]))
        print(f"  contact at {np.round(c.pos, 3)}  normal {np.round(c.frame[:3], 3)}  force {f[0]:.3f} N")
    print("  sum of normal forces", round(sum(c[2] for c in contacts), 3), "N; m g =", round(0.2 * 9.81, 3))

    fig = plt.figure(figsize=(10, 10))
    gs = fig.add_gridspec(2, 2, height_ratios=[1.25, 1])
    ax = fig.add_subplot(gs[0, :], projection="3d")
    # floor grid
    for v in np.linspace(-0.2, 1.0, 7):
        ax.plot([v, v], [-0.3, 0.7], [0, 0], color=C["gray"], lw=0.6, alpha=0.5)
    for v in np.linspace(-0.3, 0.7, 6):
        ax.plot([-0.2, 1.0], [v, v], [0, 0], color=C["gray"], lw=0.6, alpha=0.5)
    # arm from body frames
    p0 = data.body("link1").xpos; p1 = data.body("link2").xpos; p2 = data.site("ee").xpos
    ax.plot(*np.stack([[0, 0, 0], p0]).T, color=C["gray"], lw=3)
    ax.plot(*np.stack([p0, p1, p2]).T, color=C["dark"], lw=7, solid_capstyle="round")
    for p in (p0, p1):
        ax.scatter(*p, s=60, color="white", edgecolor=C["dark"], linewidth=2, depthshade=False)
    ax.text(*(p2 + [0.03, 0, 0.04]), "ee", fontsize=14)
    ax.text(*(p0 + [-0.15, 0, 0.03]), "shoulder", fontsize=13)
    ax.text(*(p1 + [0.02, 0, 0.05]), "elbow", fontsize=13)
    # box wireframe from its pose
    R = data.body("box").xmat.reshape(3, 3); c = data.body("box").xpos; h = 0.05
    corners = np.array([[sx, sy, sz] for sx in (-h, h) for sy in (-h, h) for sz in (-h, h)])
    W = c + corners @ R.T
    for i in range(8):
        for j in range(i + 1, 8):
            if np.sum(np.abs(corners[i] - corners[j]) > 1e-9) == 1:
                ax.plot(*np.stack([W[i], W[j]]).T, color=C["b"], lw=2)
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    faces = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]
    ax.add_collection3d(Poly3DCollection([W[f] for f in faces], fc=C["b"], alpha=0.25, ec=C["b"]))
    for pos, n, fn in contacts:
        ax.quiver(*pos, *(n * fn * 0.35), color=C["x"], linewidth=2.6, arrow_length_ratio=0.25)
        ax.scatter(*pos, s=20, color=C["x"], depthshade=False)
    ax.text(c[0] + 0.1, c[1] + 0.05, 0.08, "4 x 0.49 N", color=C["x"], fontsize=14)
    ax.plot([0.6, 0.6], [0.4, 0.4], [0.05, 0.3], color=C["b"], ls=":", lw=1.5)
    ax.text(0.62, 0.42, 0.31, "box start z = 0.3", color=C["b"], fontsize=13)
    ax.set_xlim(-0.1, 0.9); ax.set_ylim(-0.1, 0.6); ax.set_zlim(0, 0.85)
    ax.set_box_aspect((1.0, 0.7, 0.85), zoom=1.35); ax.set_axis_off()
    ax.view_init(elev=16, azim=-52)
    ax.text2D(0.0, 0.95, "t = 3 s", transform=ax.transAxes, fontsize=15)
    ax = fig.add_subplot(gs[1, 0])
    ax.plot(T, Q[:, 0], color=C["a"], label="shoulder"); ax.plot(T, Q[:, 1], color=C["b"], label="elbow")
    for v, col in zip(q_ref, (C["a"], C["b"])):
        ax.axhline(v, color=col, ls="--", lw=1.2)
    ax.set_xlabel("t [s]"); ax.set_ylabel("q [rad]"); ax.legend(fontsize=13, loc="center right")
    ax.set_title("PD + qfrc_bias", fontsize=15)
    ax = fig.add_subplot(gs[1, 1])
    ax.plot(T, Z, color=C["b"])
    ax.axhline(0.05, color=C["dark"], ls="--", lw=1.2)
    ax.set_xlabel("t [s]"); ax.set_ylabel("box z [m]")
    ax.set_title("free box falls and rests", fontsize=15)
    ax.set_xlim(0, 1.0)
    fig.tight_layout()
    save(fig, OUT / "03-mujoco-example.svg")


# ================================================================= 5. batched worlds (CPU stand-in for MJX vmap)
def fig_batched():
    import mujoco
    model = mujoco.MjModel.from_xml_string(XML)
    N = 64
    q0s = np.linspace(-1.0, 1.0, N)
    traj = np.zeros((N, 501))
    for i, q0 in enumerate(q0s):
        d = mujoco.MjData(model)
        d.qpos[:] = model.qpos0; d.qpos[0] = q0
        mujoco.mj_forward(model, d)
        traj[i, 0] = d.qpos[0]
        for k in range(500):
            mujoco.mj_step(model, d)
            traj[i, k + 1] = d.qpos[0]
    t = np.arange(501) * model.opt.timestep
    fig, axs = plt.subplots(1, 2, figsize=(10, 4.6), gridspec_kw=dict(width_ratios=[1.6, 1]))
    cm = plt.get_cmap("coolwarm")
    for i in range(N):
        axs[0].plot(t, traj[i], color=cm(i / (N - 1)), lw=1.1)
    axs[0].set_xlabel("t [s]"); axs[0].set_ylabel("shoulder angle [rad]")
    axs[0].set_title("64 worlds, 500 steps, no control", fontsize=15)
    axs[1].scatter(q0s, traj[:, -1], c=q0s, cmap="coolwarm", s=22)
    axs[1].set_xlabel("initial shoulder angle"); axs[1].set_ylabel("angle at t = 1 s")
    axs[1].set_title("final state per world", fontsize=15)
    fig.tight_layout()
    save(fig, OUT / "03-batched-worlds.svg")


# ================================================================= 6. XPBD vs PBD
def chain_sim(n_iter, method, compliance=1e-3, k_pbd=1.0, N=11, rest=0.1, dt=1 / 60, steps=600, g=9.81):
    """Hanging chain: particle 0 fixed, unit masses, distance constraints, one substep per frame."""
    x = np.zeros((N, 2)); x[:, 0] = np.arange(N) * rest  # start horizontal
    v = np.zeros_like(x); w = np.ones(N); w[0] = 0.0
    at = compliance / dt ** 2
    for _ in range(steps):
        v[:, 1] -= g * dt * (w > 0)
        p = x + dt * v
        lam = np.zeros(N - 1)
        for _ in range(n_iter):
            for i in range(N - 1):
                d = p[i + 1] - p[i]; L = np.linalg.norm(d); nrm = d / L
                C_ = L - rest
                wsum = w[i] + w[i + 1]
                if method == "xpbd":
                    dl = (-C_ - at * lam[i]) / (wsum + at)
                    lam[i] += dl
                else:
                    dl = -k_pbd * C_ / wsum
                p[i] -= w[i] * nrm * dl
                p[i + 1] += w[i + 1] * nrm * dl
        v = (p - x) / dt; x = p
        v *= 0.99  # light damping to reach a steady state
    return x


def fig_xpbd():
    iters = [1, 2, 4, 8, 16, 32]
    fig, axs = plt.subplots(1, 2, figsize=(10, 5.0), gridspec_kw=dict(width_ratios=[0.9, 1.2]))
    res = {}
    for method, col in (("pbd", C["x"]), ("xpbd", C["z"])):
        L = []
        for it in iters:
            x = chain_sim(it, method)
            L.append(np.sum(np.linalg.norm(np.diff(x, axis=0), axis=1)))
            if it in (1, 32):
                k = {("pbd", 1): 0, ("pbd", 32): 1, ("xpbd", 1): 2, ("xpbd", 32): 3}[(method, it)]
                axs[0].plot(np.full(len(x), k), x[:, 1], "-o", ms=5, color=col, lw=2.5, alpha=0.55 if it == 1 else 1)
        res[method] = L
        axs[1].plot(iters, L, "-o", color=col, label=method.upper())
        print(method, "chain length vs iterations:", np.round(L, 3))
    # reference: static solution of a chain of springs with stiffness 1/compliance
    k = 1 / 1e-3; N = 11; tension = 9.81 * np.arange(N - 1, 0, -1)
    L_ref = np.sum(0.1 + tension / k)
    axs[1].axhline(L_ref, color=C["dark"], ls="--", lw=1.4, label="springs $k = 1/\\alpha$")
    axs[1].axhline(1.0, color=C["gray"], ls=":", lw=1.4, label="rest length")
    axs[1].set_xscale("log", base=2); axs[1].set_xticks(iters); axs[1].set_xticklabels([str(i) for i in iters])
    axs[1].set_xlabel("solver iterations per step"); axs[1].set_ylabel("hanging chain length")
    axs[1].legend(fontsize=12.5)
    axs[0].axhline(-1.0, color=C["gray"], ls=":", lw=1.4)
    axs[0].set_xticks(range(4)); axs[0].set_xticklabels(["PBD\n1 it.", "PBD\n32 it.", "XPBD\n1 it.", "XPBD\n32 it."], fontsize=13)
    axs[0].set_xlim(-0.6, 3.6); axs[0].set_ylabel("y"); axs[0].set_title(r"hanging chains, $\alpha = 10^{-3}$", fontsize=15)
    axs[1].set_title("stretch vs. iterations", fontsize=15)
    fig.tight_layout()
    save(fig, OUT / "03-xpbd.svg")


# ================================================================= 7. gradients through contact
G, E_REST, Z0, T_END, TARGET = 9.81, 0.6, 0.5, 1.0, 0.3


def bounce_exact(v0):
    """Event-exact bouncing ball: ballistic flight, impacts with restitution e."""
    z, v, t = Z0, v0, 0.0
    while True:
        t_hit = (v + np.sqrt(v * v + 2 * G * z)) / G
        if t + t_hit >= T_END or (z <= 0 and v < 1e-9):
            tau = T_END - t
            return max(z + v * tau - 0.5 * G * tau * tau, 0.0) if not (z <= 0 and v < 1e-9) else 0.0
        t += t_hit
        v = E_REST * (G * t_hit - v)   # upward speed after impact
        z = 0.0


def bounce_stepped(v0, dt=1e-3):
    """Time-stepped simulation with forward-mode derivative d/dv0 carried through every step,
    i.e. the gradient a differentiable simulator would return."""
    z, v, dz, dv = Z0, v0, 0.0, 1.0
    for _ in range(int(round(T_END / dt))):
        v -= G * dt
        z += v * dt; dz += dv * dt
        if z < 0:
            z, v, dz, dv = -E_REST * z, -E_REST * v, -E_REST * dz, -E_REST * dv
    return z, dz


def fig_contact_gradient():
    v0s = np.linspace(-3, 4, 1401)
    z_ex = np.array([bounce_exact(v) for v in v0s])
    st = np.array([bounce_stepped(v) for v in v0s])
    L_ex = (z_ex - TARGET) ** 2
    g_fd = np.gradient(L_ex, v0s)
    g_ad = 2 * (st[:, 0] - TARGET) * st[:, 1]
    agree = np.mean(np.sign(g_fd) == np.sign(g_ad))
    print(f"contact gradient: sign agreement between true and simulator gradient {agree:.2f}")
    fig, axs = plt.subplots(3, 1, figsize=(9, 10.5), gridspec_kw=dict(height_ratios=[1, 0.8, 0.9]))
    ax = axs[0]
    cm = plt.get_cmap("viridis")
    tt = np.linspace(0, 1, 1001)
    for i, v0 in enumerate((-2.0, -0.5, 1.0, 2.5, 3.5)):
        z, v, zs = Z0, v0, [Z0]
        for _ in range(1000):
            v -= G * 1e-3; z += v * 1e-3
            if z < 0:
                z, v = -E_REST * z, -E_REST * v
            zs.append(z)
        ax.plot(tt, zs, color=cm(i / 4), label=f"$v_0={v0}$")
    ax.axvline(1.0, color=C["dark"], ls="--", lw=1.2)
    ax.axhline(TARGET, color=C["x"], ls=":", lw=1.4)
    ax.text(0.01, TARGET + 0.04, "target $z^*=0.3$", color=C["x"], fontsize=13)
    ax.set_xlabel("t [s]"); ax.set_ylabel("z [m]")
    ax.legend(fontsize=12, ncol=5, loc="upper center", bbox_to_anchor=(0.5, 1.25), columnspacing=0.8, handlelength=1.2)
    ax.set_ylim(0, 1.25)
    axs[1].plot(v0s, L_ex, color=C["a"])
    axs[1].set_ylabel(r"$L=(z_T-z^*)^2$")
    axs[2].plot(v0s, g_fd, color=C["dark"], lw=2.2, label="true $dL/dv_0$")
    axs[2].plot(v0s, g_ad, color=C["x"], lw=1.4, alpha=0.85, label="autodiff through the stepped simulator")
    axs[2].set_ylabel(r"$dL/dv_0$"); axs[2].set_xlabel(r"initial velocity $v_0$ [m/s]")
    axs[2].set_ylim(-1.2, 1.2); axs[2].legend(fontsize=12.5, loc="lower left")
    for ax in axs[1:]:
        ax.set_xlim(v0s[0], v0s[-1])
    fig.tight_layout()
    save(fig, OUT / "03-contact-gradient.svg")


if __name__ == "__main__":
    fig_sim_step()
    fig_integrators()
    fig_contact()
    fig_mujoco()
    fig_batched()
    fig_xpbd()
    fig_contact_gradient()
