"""Figures for world-models post 01 (What is a world model?).

Run:  python3 bin/figures/world-models/world_models_01.py
Needs numpy, matplotlib and torch (CPU). Writes assets/img/blog/world-models/01-*.svg and the
weights of the toy pendulum dynamics model used by assets/js/widgets/world-models-latent-rollout.js
(written between the BEGIN/END WEIGHTS markers of that file).
"""
import json
import pathlib

from wm_common import *  # noqa: F401,F403
from matplotlib.patches import Ellipse, Rectangle
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401

HERE = pathlib.Path(__file__).resolve().parent


# ============================================================ 1. agent-environment loop + MDP graph
def fig_mdp(lang):
    fig, ax = diagram(11, 5.0)
    ag = box(ax, 2.2, 3.6, label(lang, "agent", "智能体", "エージェント") + "\n$\\pi(a\\mid s)$",
             w=3.4, h=0.9)
    env = box(ax, 2.2, 0.9, label(lang, "environment", "环境", "環境") + "\n$P,\\ R$",
              w=3.4, h=0.9, fc="#e3f0fa", ec=C["z"])
    # action: right side down
    ax.add_patch(FancyArrowPatch((3.9, 3.6), (3.9, 0.9), connectionstyle="arc3,rad=-0.6",
                                 arrowstyle="-|>", mutation_scale=16, lw=2.2, color=C["b"]))
    ax.text(4.55, 2.25, "$a_t$", fontsize=19, color=C["b"], ha="center", va="center")
    # state + reward: left side up
    ax.add_patch(FancyArrowPatch((0.5, 0.9), (0.5, 3.6), connectionstyle="arc3,rad=-0.6",
                                 arrowstyle="-|>", mutation_scale=16, lw=2.2, color=C["z"]))
    ax.text(-0.45, 2.25, "$s_{t+1}$\n$r_t$", fontsize=19, color=C["z"], ha="center", va="center")

    # small MDP: three states, two actions in s1
    s1 = circ(ax, 6.6, 2.3, "$s_1$", r=0.45, fc="#e3f0fa", ec=C["z"])
    s2 = circ(ax, 9.6, 3.7, "$s_2$", r=0.45, fc="#e3f0fa", ec=C["z"])
    s3 = circ(ax, 9.6, 0.8, "$s_3$", r=0.45, fc="#e3f0fa", ec=C["z"])
    a1 = (8.0, 3.2); a2 = (8.0, 1.3)
    for a, nm in ((a1, "$a_1$"), (a2, "$a_2$")):
        ax.plot(*a, "o", ms=11, color=C["b"], zorder=3)
        ax.text(a[0] - 0.42, a[1] + (0.12 if a is a1 else -0.32), nm, fontsize=17, color=C["b"], ha="center")
    arrow(ax, s1, a1, color=C["b"]); arrow(ax, s1, a2, color=C["b"])
    arrow(ax, a1, s2, color=C["gray"], text="0.9, $r{=}1$", toff=(0.0, 0.3), fs=15, tcolor=C["dark"])
    arrow(ax, a1, s3, color=C["gray"], text="0.1", tpos=0.45, toff=(0.3, 0.05), fs=15, tcolor=C["dark"])
    arrow(ax, a2, s3, color=C["gray"], text="1.0, $r{=}0$", toff=(-0.1, -0.32), fs=15, tcolor=C["dark"])
    ax.text(8.0, 4.75, "$P(s'\\mid s,a)$", fontsize=15, ha="center", color=C["dark"])
    ax.set_xlim(-1.0, 10.3); ax.set_ylim(0.1, 5.0)
    save(fig, out(f"01-mdp-loop_{lang}.svg"))


# ============================================================ 2. Dyna diagram
def fig_dyna_diagram(lang):
    fig, ax = diagram(11.0, 5.0)
    T = lambda en, zh, ja: label(lang, en, zh, ja)
    vp = box(ax, 5.25, 4.2, T("value / policy", "价值 / 策略", "価値 / 方策") + "\n$Q(s,a)$", w=3.4, h=0.85)
    exp = box(ax, 5.25, 0.8, T("real experience", "真实经验", "実経験"), w=3.0, h=0.85, fc="#e3f0fa", ec=C["z"])
    mdl = box(ax, 8.9, 2.2, T("model", "模型", "モデル") + "\n$(s,a)\\to(r,s')$",
              w=3.4, h=0.85, fc="#fdebd3", ec=C["b"])
    arrow(ax, vp, exp, color=C["dark"], rad=0.45, text=T("acting", "行动", "行動"), tpos=0.5, toff=(-1.25, 0))
    arrow(ax, exp, vp, color=C["z"], text=T("direct RL\n(model-free)", "直接 RL\n（无模型）", "直接 RL\n（モデルフリー）"),
          toff=(0.0, 0), lw=2.6)
    arrow(ax, exp, mdl, color=C["b"], rad=0.25, text=T("model learning", "模型学习", "モデル学習"), toff=(0.75, -0.35))
    arrow(ax, mdl, vp, color=C["b"], rad=0.25, ls="--", lw=2.6,
          text=T("planning: n simulated\nupdates per real step", "规划：每个真实步\n做 n 次模拟更新", "プランニング：実ステップ毎に\nn 回の模擬更新"),
          toff=(1.6, 0.55))
    ax.set_xlim(0.2, 11.0)
    save(fig, out(f"01-dyna_{lang}.svg"))


# ============================================================ 3. Dyna-Q run (the post's code, verbatim logic)
MAZE = ["........G", "..#....#.", "S.#....#.", "..#....#.", ".....#...", "........."]
H_, W_ = len(MAZE), len(MAZE[0])
ACTIONS = [(-1, 0), (1, 0), (0, -1), (0, 1)]
START = next((r, c) for r in range(H_) for c in range(W_) if MAZE[r][c] == "S")


def step(s, a):
    r, c = s[0] + ACTIONS[a][0], s[1] + ACTIONS[a][1]
    if not (0 <= r < H_ and 0 <= c < W_) or MAZE[r][c] == "#":
        r, c = s
    done = MAZE[r][c] == "G"
    return (r, c), float(done), done


def dyna_q(n_planning, episodes=50, alpha=0.1, gamma=0.95, eps=0.1, seed=0):
    rng = np.random.default_rng(seed)
    Q = np.zeros((H_, W_, 4))
    model = {}
    steps_per_episode = []
    for _ in range(episodes):
        s, done, n = START, False, 0
        while not done:
            if rng.random() < eps:
                a = int(rng.integers(4))
            else:
                q = Q[s]
                a = int(rng.choice(np.flatnonzero(q == q.max())))
            s2, r, done = step(s, a)
            Q[s][a] += alpha * (r + gamma * (0.0 if done else Q[s2].max()) - Q[s][a])
            model[(s, a)] = (r, s2, done)
            keys = list(model.keys())
            for _ in range(n_planning):
                ps, pa = keys[rng.integers(len(keys))]
                pr, ps2, pdone = model[(ps, pa)]
                target = pr + gamma * (0.0 if pdone else Q[ps2].max())
                Q[ps][pa] += alpha * (target - Q[ps][pa])
            s, n = s2, n + 1
        steps_per_episode.append(n)
    return steps_per_episode, Q


def fig_dyna_q():
    ns, cols = [0, 5, 50], [C["gray"], C["z"], C["b"]]
    seeds = range(20)
    fig, (axm, axc) = plt.subplots(2, 1, figsize=(8, 9.2), gridspec_kw=dict(height_ratios=[1, 1.1]))
    for n, c in zip(ns, cols):
        runs = np.array([dyna_q(n, seed=s)[0] for s in seeds])
        m = runs.mean(0)
        ep = np.arange(1, len(m) + 1)
        axc.plot(ep[1:], m[1:], color=c, lw=2.6, label=f"n_planning = {n}")
        print(f"n={n}: mean steps ep 2-10 {m[1:10].round(0)}")
    axc.axhline(10, color=C["dark"], lw=1.4, ls=":")
    axc.text(49, 10.6, "shortest path = 10", ha="right", fontsize=13)
    axc.set_yscale("log"); axc.set_xlabel("episode"); axc.set_ylabel("steps per episode")
    axc.set_xlim(2, 50); axc.set_ylim(8, 500); axc.legend(frameon=False)
    # maze + greedy path for n = 50 after 50 episodes
    _, Q = dyna_q(50, seed=0)
    grid = np.array([[1.0 if ch == "#" else 0.0 for ch in row] for row in MAZE])
    axm.imshow(grid, cmap="Greys", vmin=0, vmax=1.6)
    V = Q.max(-1)
    for r in range(H_):
        for c in range(W_):
            if MAZE[r][c] != "#":
                axm.add_patch(Rectangle((c - 0.5, r - 0.5), 1, 1, color=C["a"], alpha=0.08 + 0.8 * V[r, c], lw=0))
    s, path = START, [START]
    for _ in range(40):
        a = int(np.argmax(Q[s]))
        s, _, done = step(s, a)
        path.append(s)
        if done:
            break
    p = np.array(path)
    axm.plot(p[:, 1], p[:, 0], "-o", color=C["b"], lw=2.6, ms=6)
    axm.text(START[1], START[0], "S", ha="center", va="center", fontsize=15, fontweight="bold", color="white",
             bbox=dict(boxstyle="circle", fc=C["dark"], ec="none", pad=0.15))
    axm.text(8, 0, "G", ha="center", va="center", fontsize=15, fontweight="bold", color="white",
             bbox=dict(boxstyle="circle", fc=C["y"], ec="none", pad=0.15))
    axm.set_xticks(range(W_)); axm.set_yticks(range(H_)); axm.grid(False)
    axm.set_title("$\\max_a Q(s,a)$, greedy path (n = 50)")
    print("greedy path length", len(path) - 1)
    save(fig, out("01-dyna-q.svg"))


# ============================================================ 4. toy pendulum dynamics model
DT, GL, DAMP = 0.05, 9.81, 0.1


def pend_true(th, om, u, sub=10):
    h = DT / sub
    for _ in range(sub):
        om = om + h * (-GL * np.sin(th) - DAMP * om + u)
        th = th + h * om
    return th, om


def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi


def train_pendulum_model(n_data=300, steps=1500, seed=0):
    import torch
    import torch.nn as nn
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    th = rng.uniform(-np.pi, np.pi, n_data); om = rng.uniform(-8, 8, n_data); u = rng.uniform(-2, 2, n_data)
    th2, om2 = pend_true(th, om, u)
    X = np.stack([np.cos(th), np.sin(th), om / 4, u / 2], 1)
    Y = np.stack([(th2 - th) / DT / 4, (om2 - om) / DT / 10], 1)   # scaled finite differences
    net = nn.Sequential(nn.Linear(4, 32), nn.Tanh(), nn.Linear(32, 32), nn.Tanh(), nn.Linear(32, 2))
    opt = torch.optim.Adam(net.parameters(), lr=3e-3)
    Xt, Yt = torch.tensor(X, dtype=torch.float32), torch.tensor(Y, dtype=torch.float32)
    for i in range(steps):
        idx = torch.randint(0, n_data, (256,))
        loss = ((net(Xt[idx]) - Yt[idx]) ** 2).mean()
        opt.zero_grad(); loss.backward(); opt.step()
    print("pendulum model final loss", loss.item())
    W = [p.detach().numpy().astype(float) for p in net.parameters()]
    return W


def model_step(W, th, om, u):
    x = np.stack([np.cos(th), np.sin(th), om / 4, u / 2 + 0 * th], -1)
    h = np.tanh(x @ W[0].T + W[1]); h = np.tanh(h @ W[2].T + W[3]); y = h @ W[4].T + W[5]
    return th + DT * 4 * y[..., 0], om + DT * 10 * y[..., 1]


def rollout(fn, th, om, us):
    tr = [(th, om)]
    for u in us:
        th, om = fn(th, om, u); tr.append((th, om))
    return np.array(tr)


def fig_model_error(W):
    fig, (ax, axe) = plt.subplots(1, 2, figsize=(10, 4.6))
    starts = [(2.2, 0.0), (0.6, 2.5), (-1.0, -4.0)]
    Hn = 80
    for (th0, om0), c in zip(starts, [C["a"], C["b"], C["c"]]):
        us = np.zeros(Hn)
        tr = rollout(lambda a, b, u: pend_true(a, b, u), th0, om0, us)
        pr = rollout(lambda a, b, u: model_step(W, a, b, u), th0, om0, us)
        ax.plot(tr[:, 0], tr[:, 1], color=c, lw=2.6)
        ax.plot(pr[:, 0], pr[:, 1], color=c, lw=2.0, ls="--")
        ax.plot(th0, om0, "o", color=c, ms=9, mec="white", mew=1.5)
    ax.plot([], [], color=C["dark"], lw=2.6, label="true $P$")
    ax.plot([], [], color=C["dark"], lw=2.0, ls="--", label="model $\\hat P_\\theta$")
    ax.legend(frameon=False, loc="upper right", fontsize=13)
    ax.set_xlabel("$\\theta$ (rad)"); ax.set_ylabel("$\\omega$ (rad/s)")
    ax.set_title(f"$u=0$, {Hn} steps")
    # error growth over horizon: many random starts and random actions
    rng = np.random.default_rng(1)
    N, Hh = 500, 100
    th0 = rng.uniform(-np.pi, np.pi, N); om0 = rng.uniform(-4, 4, N)
    us = rng.uniform(-2, 2, (Hh, N))
    tr = rollout(lambda a, b, u: pend_true(a, b, u), th0, om0, us)
    pr = rollout(lambda a, b, u: model_step(W, a, b, u), th0, om0, us)
    err = np.sqrt(wrap(tr[:, 0] - pr[:, 0]) ** 2 + ((tr[:, 1] - pr[:, 1]) / 4) ** 2)
    k = np.arange(Hh + 1)
    med, lo, hi = np.median(err, 1), np.percentile(err, 25, 1), np.percentile(err, 75, 1)
    axe.fill_between(k[1:], lo[1:], hi[1:], color=C["a"], alpha=0.2, lw=0)
    axe.plot(k[1:], med[1:], color=C["a"], lw=2.6, label="median, 25-75%")
    axe.plot(k[1:], med[1] * k[1:], color=C["gray"], ls=":", lw=1.8, label="$k\\,\\epsilon_1$")
    axe.set_yscale("log"); axe.set_xscale("log")
    axe.set_xlabel("horizon $k$ (steps)"); axe.set_ylabel("state error")
    axe.legend(frameon=False, fontsize=13, loc="lower right")
    axe.set_title("compounding model error")
    print("error at k=1,10,50,100:", med[[1, 10, 50, 100]].round(4))
    save(fig, out("01-model-error.svg"))


def fig_imagination(W):
    rng = np.random.default_rng(3)
    T_real, Hh = 60, 15
    us = 1.5 * np.sin(np.arange(T_real) * 0.15)
    real = rollout(lambda a, b, u: pend_true(a, b, u), 0.3, 0.0, us)
    fig = plt.figure(figsize=(9, 6.4))
    ax = fig.add_subplot(111, projection="3d")
    ax.plot(np.arange(T_real + 1) * DT, real[:, 0], real[:, 1], color=C["dark"], lw=3.0, zorder=5)
    cols = [C["a"], C["b"], C["c"], C["z"]]
    for j, t0 in enumerate([5, 20, 35, 48]):
        for _ in range(5):
            a = np.clip(np.cumsum(rng.normal(0, 0.6, Hh)), -2, 2)
            im = rollout(lambda x, y, u: model_step(W, x, y, u), real[t0, 0], real[t0, 1], a)
            ax.plot((t0 + np.arange(Hh + 1)) * DT, im[:, 0], im[:, 1], color=cols[j], lw=1.6, alpha=0.9)
        ax.scatter([t0 * DT], [real[t0, 0]], [real[t0, 1]], color=cols[j], s=70, depthshade=False,
                   edgecolor="white", zorder=6)
    ax.set_xlabel("time $t$ (s)", labelpad=10); ax.set_ylabel("$\\theta$", labelpad=8); ax.set_zlabel("$\\omega$", labelpad=6)
    ax.view_init(elev=22, azim=-55)
    ax.locator_params(axis="y", nbins=4); ax.locator_params(axis="z", nbins=5)
    ax.set_box_aspect((2.2, 1, 1))
    save(fig, out("01-imagination.svg"))


# ============================================================ 5. V-M-C
def fig_vmc(lang):
    fig, ax = diagram(11, 4.4)
    T = lambda en, zh, ja: label(lang, en, zh, ja)
    o = box(ax, 0.9, 2.2, "$o_t$\n64x64", w=1.3, h=1.3, fc="#e3f0fa", ec=C["z"], fs=16)
    V = box(ax, 3.1, 2.2, T("V\nVAE encoder", "V\nVAE 编码器", "V\nVAE エンコーダ"), w=2.0, h=1.3)
    M = box(ax, 6.2, 3.3, T("M\nMDN-RNN", "M\nMDN-RNN", "M\nMDN-RNN"), w=2.0, h=1.2, fc="#fdebd3", ec=C["b"])
    Cc = box(ax, 6.2, 1.0, T("C  linear", "C  线性", "C  線形") + "\n$a_t=W_c[z_t;h_t]+b_c$", w=3.3, h=1.2, fc="#e6f4e6", ec=C["y"])
    env = box(ax, 9.8, 1.0, T("env", "环境", "環境"), w=1.3, h=0.9, fc="white", ec=C["gray"])
    nxt = box(ax, 9.8, 3.3, "$p(z_{t+1}\\mid a_t,z_t,h_t)$", w=2.4, h=0.9, fc="white", ec=C["b"], fs=15)
    arrow(ax, o, V)
    arrow(ax, V, M, text="$z_t$", toff=(-0.25, 0.15))
    arrow(ax, V, Cc, text="$z_t$", toff=(0.2, 0.25))
    arrow(ax, M, Cc, text="$h_t$", toff=(0.3, 0))
    arrow(ax, Cc, env, text="$a_t$", color=C["y"])
    arrow(ax, M, nxt)
    ax.add_patch(FancyArrowPatch((8.4, 1.0), (7.25, 2.95), connectionstyle="arc3,rad=0.2", arrowstyle="-|>",
                                 mutation_scale=14, lw=1.8, color=C["y"], ls="--"))
    ax.text(8.2, 2.05, "$a_t$", color=C["y"], fontsize=15)
    ax.text(2.6, 0.75, T("trained without reward", "无需奖励训练", "報酬なしで学習"), ha="center", fontsize=15, color=C["gray"])
    ax.text(6.2, 0.05, T("~1k params, CMA-ES", "约 1k 参数，CMA-ES", "約 1k パラメータ，CMA-ES"),
            ha="center", fontsize=15, color=C["gray"])
    save(fig, out(f"01-vmc_{lang}.svg"))


# ============================================================ 6. RSSM unrolled graph
def fig_rssm(lang):
    fig, ax = diagram(11.3, 6.0)
    T = lambda en, zh, ja: label(lang, en, zh, ja)
    xs = [2.1, 4.6, 7.1, 9.6]
    hs, zs, os_ = [], [], []
    for i, x in enumerate(xs):
        obs = i < 2
        hs.append(box(ax, x, 3.0, f"$h_{{{i + 1}}}$", w=0.95, h=0.75, round_=False, fc="#e3e3e3", ec=C["dark"], fs=18))
        zs.append(circ(ax, x + 0.9, 1.75, f"$z_{{{i + 1}}}$" if obs else f"$\\hat z_{{{i + 1}}}$", r=0.42,
                       ec=C["a"] if obs else C["b"], fs=18))
        if obs:
            os_.append(circ(ax, x + 0.9, 0.45, f"$o_{{{i + 1}}}$", r=0.38, fc="#d4e6f5", ec=C["z"], fs=15))
            arrow(ax, os_[-1], zs[-1], color=C["a"], lw=2.4)
        arrow(ax, hs[-1], zs[-1], color=C["b"] if not obs else C["a"], lw=2.2, ls="-" if obs else "--")
        rr = box(ax, x + 0.9, 4.65, f"$\\hat r_{{{i + 1}}}$" + (f", $\\hat o_{{{i + 1}}}$" if obs else ""), w=1.3, h=0.6,
                 fc="white", ec=C["gray"], fs=16)
        arrow(ax, hs[-1], rr, color=C["gray"], lw=1.4)
        arrow(ax, zs[-1], rr, color=C["gray"], lw=1.4, rad=0.25)
        if i > 0:
            arrow(ax, hs[i - 1], hs[i], color=C["dark"], lw=2.6, text=f"$a_{{{i}}}$", toff=(0.55, 0.32), tcolor=C["y"])
            arrow(ax, zs[i - 1], hs[i], color=C["dark"], lw=1.6)
    ax.axvline(6.75, ymin=0.02, ymax=0.98, color=C["gray"], ls=":", lw=1.6)
    mltext(ax, 3.6, 5.3, T("filtering: posterior", "滤波：后验", "フィルタリング：事後") + "\n$q(z_t\\mid h_t,o_t)$", fs=16, color=C["a"])
    mltext(ax, 9.0, 5.3, T("imagination: prior", "想象：先验", "想像：事前") + "\n$p(\\hat z_t\\mid h_t)$", fs=16, color=C["b"])
    ax.text(0.15, 3.0, T("deterministic\n(GRU)", "确定性\n（GRU）", "決定論的\n（GRU）"), fontsize=15, va="center", color=C["dark"])
    ax.text(0.15, 1.75, T("stochastic", "随机", "確率的"), fontsize=15, va="center", color=C["dark"])
    ax.set_xlim(-0.1, 11.2); ax.set_ylim(0, 6.0)
    save(fig, out(f"01-rssm_{lang}.svg"))


# ============================================================ 7. CEM in a 2D action space
def fig_cem():
    def R(a):  # toy predicted return of a length-2 action sequence (a_1, a_2)
        return (np.exp(-((a[..., 0] - 1.2) ** 2 + (a[..., 1] + 0.6) ** 2) / 0.35)
                + 0.6 * np.exp(-((a[..., 0] + 1.0) ** 2 + (a[..., 1] - 1.0) ** 2) / 0.25))
    rng = np.random.default_rng(4)
    mu, sd = np.zeros(2), np.ones(2) * 1.2
    J, K = 64, 8
    g = np.linspace(-2.6, 2.6, 90); GX, GY = np.meshgrid(g, g)
    Z = R(np.stack([GX, GY], -1))
    fig, axs = plt.subplots(2, 2, figsize=(8.5, 8.4), sharex=True, sharey=True)
    axs = axs.ravel()
    for it, ax in enumerate(axs):
        a = mu + sd * rng.standard_normal((J, 2))
        r = R(a)
        el = a[np.argsort(-r)[:K]]
        ax.imshow(Z, extent=(-2.6, 2.6, -2.6, 2.6), origin="lower", cmap="Purples", alpha=0.75, interpolation="bilinear")
        ax.contour(GX, GY, Z, levels=[0.2, 0.5, 0.8], colors=C["a"], linewidths=0.8, alpha=0.6)
        ax.add_patch(Ellipse(mu, 4 * sd[0], 4 * sd[1], fc="none", ec=C["b"], lw=2.2))
        ax.scatter(a[:, 0], a[:, 1], s=16, color=C["gray"], zorder=3)
        ax.scatter(el[:, 0], el[:, 1], s=40, color=C["b"], edgecolor="white", zorder=4)
        ax.plot(*mu, "x", color=C["dark"], ms=11, mew=2.5)
        mu, sd = el.mean(0), el.std(0) + 1e-3
        ax.set_title(f"iteration {it + 1}")
        ax.set_xlim(-2.6, 2.6); ax.set_ylim(-2.6, 2.6); ax.set_aspect("equal")
    for ax in axs[2:]:
        ax.set_xlabel("$a_1$")
    for ax in axs[::2]:
        ax.set_ylabel("$a_2$")
    print("CEM final mean", mu.round(3))
    save(fig, out("01-cem.svg"))


# ============================================================ 8. lambda-return weights
def fig_lambda():
    Hh, gamma = 15, 1.0  # gamma = 1 so the weights on n-step returns are read off directly
    fig, ax = plt.subplots(figsize=(9.5, 4.6))
    for lam, c, off in [(0.0, C["gray"], -0.27), (0.95, C["a"], 0.0), (1.0, C["b"], 0.27)]:
        # V^lambda_0 is linear in the values v_1..v_H; get each coefficient by recursion with one-hot values.
        w = []
        for n in range(1, Hh + 1):
            v = np.zeros(Hh + 1); v[n] = 1.0
            last = v[Hh]
            for t in reversed(range(Hh)):
                last = 0.0 + gamma * ((1 - lam) * v[t + 1] + lam * last)
            w.append(last)
        w = np.array(w)
        assert abs(w.sum() - 1) < 1e-9
        ax.bar(np.arange(1, Hh + 1) + off, w, width=0.27, color=c, label=f"$\\lambda = {lam:g}$")
    ax.set_xlabel("$n$: critic bootstrap after $n$ imagined steps")
    ax.set_ylabel("weight"); ax.set_xticks(range(1, Hh + 1))
    ax.legend(frameon=False)
    ax.set_title("weight of $G^{(n)}$ in $V^\\lambda_0$,  $H=15$")
    save(fig, out("01-lambda-return.svg"))


# ============================================================ 9. symlog + two-hot
def fig_symlog():
    symlog = lambda x: np.sign(x) * np.log1p(np.abs(x))
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 4.3))
    x = np.linspace(-1000, 1000, 4001)
    a1.plot(x, symlog(x), color=C["a"], lw=2.8, label="symlog$(x)$")
    a1.set_xscale("symlog", linthresh=1); a1.set_xlabel("$x$"); a1.set_ylabel("network target")
    for v, off in [(0.01, (10, -28)), (1, (-80, 14)), (1000, (-120, 0))]:
        a1.plot(v, symlog(v), "o", color=C["b"], ms=8)
        a1.annotate(f"{v:g} $\\to$ {symlog(v):.2f}", (v, symlog(v)), textcoords="offset points", xytext=off, fontsize=13)
    a1.set_xticks([-1000, -10, 0, 10, 1000]); a1.set_xticklabels(["$-10^3$", "$-10$", "0", "10", "$10^3$"])
    a1.legend(frameon=False, loc="upper left")
    bins = np.linspace(-20, 20, 255)
    y = 3.7; sy = symlog(y)
    k = np.searchsorted(bins, sy) - 1
    wk1 = (sy - bins[k]) / (bins[k + 1] - bins[k])
    sel = slice(k - 4, k + 6)
    a2.bar(bins[sel], 0 * bins[sel], width=0.12, color=C["gray"])
    a2.bar([bins[k], bins[k + 1]], [1 - wk1, wk1], width=0.12, color=C["a"])
    for b_ in bins[sel]:
        a2.axvline(b_, color=C["gray"], lw=0.8, alpha=0.5)
    a2.axvline(sy, color=C["b"], lw=2.2, ls="--")
    a2.text(sy + 0.04, 1.03, f"symlog(3.7)\n= {sy:.3f}", color=C["b"], ha="left", va="top", fontsize=13)
    a2.set_ylim(0, 1.12); a2.set_xlabel("bin centre (symlog space)")
    a2.set_ylabel("two-hot target")
    for xx, val in [(bins[k], 1 - wk1), (bins[k + 1], wk1)]:
        a2.text(xx - 0.09, val + 0.02, f"{val:.2f}", ha="right", fontsize=13)
    save(fig, out("01-symlog.svg"))


# ============================================================ 10. MuZero unrolled
def fig_muzero():
    fig, ax = diagram(9.9, 4.4)
    ob = box(ax, 0.9, 2.3, "$o_1..o_t$", w=1.4, h=0.8, fc="#e3f0fa", ec=C["z"])
    s = [circ(ax, 2.9 + 3.0 * k, 2.3, f"$s^{k}$", r=0.45, ec=C["a"], fs=18) for k in range(3)]
    arrow(ax, ob, s[0], text="$h_\\theta$", toff=(0, 0.3), tcolor=C["a"])
    for k in range(2):
        arrow(ax, s[k], s[k + 1], lw=2.6, text=f"$g_\\theta(\\cdot, a^{k + 1})$", toff=(0, 0.35), tcolor=C["dark"])
        rb = box(ax, 2.9 + 3.0 * k + 1.5, 0.75, f"$r^{k + 1}$", w=0.8, h=0.55, fc="white", ec=C["b"], fs=16)
        arrow(ax, (2.9 + 3.0 * k + 1.5, 2.2), rb, color=C["b"], lw=1.6)
    for k in range(3):
        pv = box(ax, 2.9 + 3.0 * k, 3.95, f"$\\mathbf{{p}}^{k}, v^{k}$", w=1.25, h=0.6, fc="white", ec=C["y"], fs=16)
        arrow(ax, s[k], pv, color=C["y"], lw=1.6, text="$f_\\theta$", toff=(0.32, 0), tcolor=C["y"])
    ax.set_xlim(0, 9.9)
    save(fig, out("01-muzero.svg"))


def export_weights(W):
    """Write the trained weights into the widget file, between its BEGIN/END WEIGHTS markers."""
    js = ROOT / "assets" / "js" / "widgets" / "world-models-latent-rollout.js"
    src = js.read_text()
    a = src.index("// BEGIN WEIGHTS"); a = src.index("\n", a) + 1
    b = src.index("  // END WEIGHTS")
    data = json.dumps({"dt": DT, "g": GL, "damp": DAMP, "W": [np.round(w, 4).tolist() for w in W]},
                      separators=(",", ":"))
    js.write_text(src[:a] + "  var MODEL = " + data + ";\n" + src[b:])
    print("wrote weights into", js)


if __name__ == "__main__":
    for lang in LANGS:
        fig_mdp(lang); fig_dyna_diagram(lang); fig_vmc(lang); fig_rssm(lang)
    fig_dyna_q(); fig_cem(); fig_lambda(); fig_symlog(); fig_muzero()
    W = train_pendulum_model()
    export_weights(W)
    fig_model_error(W); fig_imagination(W)
