"""Figures for embodied-ai post 02 (reinforcement learning for robots).

Everything is computed: value iteration on a small gridworld (the same one as the interactive
widget), a Gaussian policy-gradient bandit, GAE weights and a bias/variance experiment, the PPO
clipped objective, maximum-entropy policies, and real training runs of the post's own PPO code on
PointReach / RandomizedPointReach (about 2-3 minutes per run on one CPU core; results are cached in
the system temp dir).

    python3 bin/figures/embodied-ai/embodied-ai_02.py
"""
import multiprocessing as mp
import pathlib
import pickle
import sys
import tempfile

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/embodied-ai"
CACHE = pathlib.Path(tempfile.gettempdir()) / "embodied-ai-02-ppo.pkl"


# ================================================================= the post's PPO code (verbatim)
def ppo_code():
    import torch
    import torch.nn as nn

    class ActorCritic(nn.Module):
        def __init__(self, obs_dim, act_dim, hidden=64):
            super().__init__()
            self.pi = nn.Sequential(nn.Linear(obs_dim, hidden), nn.Tanh(),
                                    nn.Linear(hidden, hidden), nn.Tanh(), nn.Linear(hidden, act_dim))
            self.v = nn.Sequential(nn.Linear(obs_dim, hidden), nn.Tanh(),
                                   nn.Linear(hidden, hidden), nn.Tanh(), nn.Linear(hidden, 1))
            self.log_std = nn.Parameter(torch.full((act_dim,), -0.5))

        def dist(self, obs):
            return torch.distributions.Normal(self.pi(obs), self.log_std.exp())

    def gae(rew, val, done, last_val, gamma=0.99, lam=0.95):
        T = rew.shape[0]
        adv = torch.zeros_like(rew)
        next_val, running = last_val, torch.zeros_like(last_val)
        for t in reversed(range(T)):
            mask = 1.0 - done[t]
            delta = rew[t] + gamma * next_val * mask - val[t]
            running = delta + gamma * lam * mask * running
            adv[t] = running
            next_val = val[t]
        return adv, adv + val

    def ppo_update(model, opt, obs, act, logp_old, adv, ret,
                   clip=0.2, vf_coef=0.5, ent_coef=0.0, epochs=10, minibatch=256):
        adv = (adv - adv.mean()) / (adv.std() + 1e-8)
        B = obs.shape[0]
        for _ in range(epochs):
            for idx in torch.randperm(B).split(minibatch):
                d = model.dist(obs[idx])
                logp = d.log_prob(act[idx]).sum(-1)
                ratio = (logp - logp_old[idx]).exp()
                surr = torch.min(ratio * adv[idx], ratio.clamp(1 - clip, 1 + clip) * adv[idx])
                v_loss = (model.v(obs[idx]).squeeze(-1) - ret[idx]).pow(2).mean()
                loss = -surr.mean() + vf_coef * v_loss - ent_coef * d.entropy().sum(-1).mean()
                opt.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), 0.5)
                opt.step()

    class PointReach:
        def __init__(self, n, horizon=50):
            self.n, self.H = n, horizon
            self.damp, self.gain = 0.9, 0.1

        def reset(self):
            self.pos = torch.rand(self.n, 2) * 2 - 1
            self.vel = torch.zeros(self.n, 2)
            self.t = torch.zeros(self.n)
            return torch.cat([self.pos, self.vel], -1)

        def step(self, a):
            a = a.clamp(-1, 1)
            self.vel = self.damp * self.vel + self.gain * a
            self.pos = self.pos + 0.1 * self.vel
            self.t += 1
            rew = -self.pos.norm(dim=-1) - 0.01 * a.pow(2).sum(-1)
            done = (self.t >= self.H).float()
            if done.any():
                k = done.bool()
                self.pos[k] = torch.rand(int(k.sum()), 2) * 2 - 1
                self.vel[k] = 0.0
                self.t[k] = 0
            return torch.cat([self.pos, self.vel], -1), rew, done

    class RandomizedPointReach(PointReach):
        def reset(self):
            self.damp = torch.empty(self.n, 1).uniform_(0.8, 0.97)
            self.gain = torch.empty(self.n, 1).uniform_(0.05, 0.2)
            return super().reset()

    return dict(torch=torch, ActorCritic=ActorCritic, gae=gae, ppo_update=ppo_update,
                PointReach=PointReach, RandomizedPointReach=RandomizedPointReach)


def train(cfg):
    """The post's training loop, with the per-iteration mean reward recorded."""
    name, randomized, lam = cfg
    P = ppo_code(); torch = P["torch"]
    torch.set_num_threads(1)
    torch.manual_seed(0)
    env, T = (P["RandomizedPointReach"] if randomized else P["PointReach"])(n=64), 128
    model = P["ActorCritic"](4, 2)
    opt = torch.optim.Adam(model.parameters(), lr=3e-4)
    obs = env.reset()
    curve = []
    for it in range(150):
        buf = {k: [] for k in ["obs", "act", "logp", "rew", "val", "done"]}
        with torch.no_grad():
            for t in range(T):
                d = model.dist(obs)
                a = d.sample()
                buf["obs"].append(obs); buf["act"].append(a)
                buf["logp"].append(d.log_prob(a).sum(-1))
                buf["val"].append(model.v(obs).squeeze(-1))
                obs, r, done = env.step(a)
                buf["rew"].append(r); buf["done"].append(done)
            last_val = model.v(obs).squeeze(-1)
        b = {k: torch.stack(v) for k, v in buf.items()}
        adv, ret = P["gae"](b["rew"], b["val"], b["done"], last_val, lam=lam)
        flat = lambda x: x.reshape(T * env.n, *x.shape[2:])
        P["ppo_update"](model, opt, flat(b["obs"]), flat(b["act"]), flat(b["logp"]), flat(adv), flat(ret))
        curve.append(b["rew"].mean().item())
    print(f"{name}: first {curve[0]:.3f}, last {curve[-1]:.3f}", flush=True)
    return name, np.array(curve), {k: v.clone() for k, v in model.state_dict().items()}


RUNS = [("nominal", False, 0.95), ("randomized", True, 0.95), ("lam0", False, 0.0), ("lam1", False, 1.0)]


def get_runs():
    if CACHE.exists():
        return pickle.loads(CACHE.read_bytes())
    with mp.get_context("spawn").Pool(4) as pool:
        res = pool.map(train, RUNS)
    out = {n: (c, sd) for n, c, sd in res}
    CACHE.write_bytes(pickle.dumps(out))
    return out


def load_model(sd):
    P = ppo_code()
    m = P["ActorCritic"](4, 2); m.load_state_dict(sd); m.eval()
    return m


def evaluate(model, damp, gain, n=256, H=50, seed=0):
    """Mean reward per step of the deterministic policy (mean action) on given physics."""
    import torch
    g = torch.Generator().manual_seed(seed)
    pos = torch.rand(n, 2, generator=g) * 2 - 1
    vel = torch.zeros(n, 2); tot = 0.0
    with torch.no_grad():
        for _ in range(H):
            a = model.pi(torch.cat([pos, vel], -1)).clamp(-1, 1)
            vel = damp * vel + gain * a
            pos = pos + 0.1 * vel
            tot += (-pos.norm(dim=-1) - 0.01 * a.pow(2).sum(-1)).mean().item()
    return tot / H


# ================================================================= gridworld (same as the widget)
GW, GH = 6, 5
WALLS = {(1, 1), (1, 2), (3, 2), (3, 3)}
TERM = {(5, 4): 1.0, (5, 3): -1.0}
ACTS = [(0, 1), (1, 0), (0, -1), (-1, 0)]  # up, right, down, left (x right, y up)
SLIP = 0.1


def gw_step(s, a):
    nx, ny = s[0] + a[0], s[1] + a[1]
    if not (0 <= nx < GW and 0 <= ny < GH) or (nx, ny) in WALLS:
        return s
    return (nx, ny)


def gw_trans(s, i):
    """Intended move with prob 0.8, each perpendicular move with prob 0.1."""
    out = {}
    for j, p in ((i, 1 - 2 * SLIP), ((i + 1) % 4, SLIP), ((i + 3) % 4, SLIP)):
        s2 = gw_step(s, ACTS[j]); out[s2] = out.get(s2, 0) + p
    return out


def value_iteration(gamma=0.9, iters=100):
    V = np.zeros((GH, GW)); hist = [V.copy()]
    for _ in range(iters):
        Vn = np.zeros_like(V)
        for x in range(GW):
            for y in range(GH):
                if (x, y) in WALLS or (x, y) in TERM:
                    continue
                Vn[y, x] = max(sum(p * (TERM.get(s2, 0.0) + gamma * V[s2[1], s2[0]]) for s2, p in gw_trans((x, y), i).items())
                               for i in range(4))
        V = Vn; hist.append(V.copy())
    return hist


def greedy(V, gamma=0.9):
    pol = {}
    for x in range(GW):
        for y in range(GH):
            if (x, y) in WALLS or (x, y) in TERM:
                continue
            q = [sum(p * (TERM.get(s2, 0.0) + gamma * V[s2[1], s2[0]]) for s2, p in gw_trans((x, y), i).items()) for i in range(4)]
            pol[(x, y)] = int(np.argmax(q)) if max(q) - min(q) > 1e-9 else None
    return pol


def draw_grid(ax, V, title):
    M = np.ma.masked_array(V, mask=np.zeros_like(V, bool))
    for (x, y) in WALLS:
        M.mask[y, x] = True
    ax.imshow(M, origin="lower", cmap="RdYlGn", vmin=-1, vmax=1, extent=[-.5, GW - .5, -.5, GH - .5])
    for (x, y) in WALLS:
        ax.add_patch(Rectangle((x - .5, y - .5), 1, 1, color=C["dark"]))
    for (x, y), r in TERM.items():
        ax.add_patch(Rectangle((x - .5, y - .5), 1, 1, fc=C["z"] if r > 0 else C["x"], ec="white", lw=2))
        ax.text(x, y, f"{r:+.0f}", ha="center", va="center", color="white", fontsize=18, weight="bold")
    pol = greedy(V)
    for (x, y), i in pol.items():
        ax.text(x, y - 0.28, f"{V[y, x]:.2f}", ha="center", va="center", fontsize=12.5)
        if i is not None:
            dx, dy = ACTS[i]
            ax.annotate("", xy=(x + 0.27 * dx, y + 0.1 + 0.27 * dy), xytext=(x - 0.13 * dx, y + 0.1 - 0.13 * dy),
                        arrowprops=dict(arrowstyle="-|>", lw=2, color=C["dark"]))
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    ax.set_title(title)
    for s in ax.spines.values():
        s.set_visible(True)


def fig_value_iteration():
    hist = value_iteration()
    print("value iteration converged V(0,0) =", round(hist[-1][0, 0], 4))
    fig, axs = plt.subplots(2, 2, figsize=(9.5, 8.3))
    for ax, k in zip(axs.flat, (1, 3, 6, 100)):
        draw_grid(ax, hist[k], f"$k = {k}$" if k < 100 else r"$k \to \infty$ ($V^\ast$)")
    fig.tight_layout()
    save(fig, OUT / "02-value-iteration.svg")


# ================================================================= RL loop diagram (localized)
def mtext(ax, x, y, text, fs=15, dy=0.42, **kw):
    """Multi-line text drawn line by line, so CJK lines and $math$ lines never share one mathtext string."""
    lines = text.split("\n")
    for i, ln in enumerate(lines):
        ax.text(x, y + (len(lines) - 1) / 2 * dy - i * dy, ln, ha=kw.pop("ha", "center") if i == 0 else "center",
                va="center", fontsize=fs, **kw)


def box(ax, xy, w, h, text, fc, fs=15):
    ax.add_patch(FancyBboxPatch(xy, w, h, boxstyle="round,pad=0.02,rounding_size=0.08", fc=fc, ec=C["dark"], lw=1.8))
    mtext(ax, xy[0] + w / 2, xy[1] + h / 2, text, fs=fs)


def arrow(ax, a, b, text=None, off=(0, 0), color=C["dark"], fs=14, rad=0.0, ha="center"):
    ax.annotate("", xy=b, xytext=a, arrowprops=dict(arrowstyle="-|>", lw=2.2, color=color, shrinkA=2, shrinkB=2,
                                                     connectionstyle=f"arc3,rad={rad}"))
    if text:
        ax.text((a[0] + b[0]) / 2 + off[0], (a[1] + b[1]) / 2 + off[1], text, ha=ha, va="center", fontsize=fs, color=color)


def fig_rl_loop():
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)
        fig, ax = plt.subplots(figsize=(9, 5.6))
        ax.set_xlim(0, 10); ax.set_ylim(0, 6.2); ax.axis("off")
        box(ax, (0.3, 3.6), 3.0, 1.6, L("Policy", "策略", "方策") + "\n" + r"$\pi_\theta(a\mid o)$" + "\n50 Hz", "#efe7fb")
        box(ax, (6.3, 3.5), 3.6, 1.8, L("PD controller", "PD 控制器", "PD 制御器") + "\n200 Hz - 1 kHz\n"
            + r"$\tau = K_p(q^{\mathrm{des}}-q) - K_d\dot q$", "#e3f2fb", fs=14)
        box(ax, (6.5, 0.4), 3.2, 1.7, L("Robot or\nsimulator", "机器人或\n仿真器", "ロボットまたは\nシミュレータ"), "#e9f6e7")
        box(ax, (0.3, 0.4), 3.0, 1.7, L("PPO update\n(GAE, clipping)", "PPO 更新\n（GAE、裁剪）", "PPO 更新\n（GAE、クリップ）"), "#fdf0df")
        arrow(ax, (3.35, 4.4), (6.25, 4.4), r"$a_t = q^{\mathrm{des}}_t$", off=(0, 0.35))
        arrow(ax, (8.1, 3.45), (8.1, 2.15), r"$\tau$", off=(0.15, 0), ha="left", fs=17)
        arrow(ax, (6.45, 1.6), (3.35, 4.0), None, rad=-0.0)
        ax.text(5.15, 2.95, r"$o_{t+1},\ r_{t+1}$", fontsize=15, rotation=0)
        arrow(ax, (6.45, 0.9), (3.35, 0.9))
        ax.text(4.9, 0.55, L("trajectories", "轨迹", "軌跡"), ha="center", fontsize=14)
        ax.text(4.9, 1.2, r"$(o_t, a_t, r_t)$", ha="center", fontsize=14)
        arrow(ax, (1.8, 2.15), (1.8, 3.55), r"$\theta \leftarrow \theta + \alpha\,\hat g$", off=(0.15, 0), ha="left")
        ax.text(5.0, 5.85, L("thousands of parallel environments", "上千个并行环境", "数千の並列環境"), ha="center",
                fontsize=14, color=C["gray"], style="italic")
        save(fig, OUT / f"02-rl-loop_{lang}.svg")


# ================================================================= policy gradient on a bandit
def fig_policy_gradient():
    rng = np.random.default_rng(0)
    r = lambda a: -(a - 1.5) ** 2
    mu, ls, lr, N = 0.0, 0.0, 0.1, 64
    hist = []
    for it in range(60):
        sig = np.exp(ls)
        a = rng.normal(mu, sig, N)
        A = r(a) - r(a).mean()  # advantage = reward minus a baseline
        if it == 0:
            a0, A0 = a.copy(), A.copy()
            g_mu0 = np.mean(A * (a - mu) / sig ** 2)
        hist.append((mu, sig))
        g_mu = np.mean(A * (a - mu) / sig ** 2)              # d log N / d mu
        g_ls = np.mean(A * ((a - mu) ** 2 / sig ** 2 - 1))   # d log N / d log sigma
        mu += lr * g_mu
        ls += 0.5 * lr * g_ls
    print("policy gradient bandit: final mu %.3f sigma %.3f" % (mu, np.exp(ls)))
    xs = np.linspace(-3, 3.5, 400)
    fig, axs = plt.subplots(2, 1, figsize=(9, 8.5), sharex=True)
    ax = axs[0]
    ax.plot(xs, r(xs) / 16, color=C["gray"], lw=1.6, ls="--", label=r"$r(a)/16 = -(a-1.5)^2/16$")
    ax.plot(xs, np.exp(-xs ** 2 / 2) / np.sqrt(2 * np.pi), color=C["a"], lw=3, label=r"$\pi_\theta = \mathcal{N}(0, 1)$")
    for ai, Ai in zip(a0, A0):
        ax.plot([ai, ai], [0, Ai / 16], color=C["y"] if Ai > 0 else C["x"], lw=2, alpha=0.8)
        ax.plot(ai, Ai / 16, "o", ms=4, color=C["y"] if Ai > 0 else C["x"])
    ax.annotate("", xy=(lr * g_mu0, 0.47), xytext=(0, 0.47), arrowprops=dict(arrowstyle="-|>", lw=3, color=C["a"]))
    ax.text(-2.9, 0.53, r"$\mu \leftarrow \mu + 0.1\,\frac{1}{N}\sum_i \hat A_i\,(a_i-\mu)/\sigma^2$" + f"$\\ = {lr * g_mu0:.2f}$",
            fontsize=15, color=C["a"])
    ax.axhline(0, color=C["dark"], lw=1)
    ax.set_ylim(-1.15, 0.68); ax.legend(fontsize=13, loc="lower right")
    ax.set_title(r"iteration 0: $N=64$ samples, stems $\propto \hat A_i = r(a_i) - \bar r$")
    ax = axs[1]
    cm = plt.get_cmap("viridis")
    for k in (0, 5, 10, 20, 40, 59):
        m, s = hist[k]
        ax.plot(xs, np.exp(-(xs - m) ** 2 / (2 * s ** 2)) / (s * np.sqrt(2 * np.pi)), color=cm(k / 59), lw=2.5,
                label=f"it {k}: $\\mu={m:.2f}, \\sigma={s:.2f}$")
    ax.axvline(1.5, color=C["gray"], ls="--", lw=1.5)
    ax.text(1.6, 1.2, r"$a^\ast = 1.5$", fontsize=15, color=C["gray"])
    ax.set_xlabel("$a$"); ax.set_ylabel(r"$\pi_\theta(a)$"); ax.legend(fontsize=12, loc="upper left")
    ax.set_title(r"REINFORCE with baseline, lr $=0.1$")
    fig.tight_layout()
    save(fig, OUT / "02-policy-gradient.svg")


# ================================================================= GAE
def fig_gae():
    gamma = 0.99
    fig, axs = plt.subplots(2, 1, figsize=(9, 8.5))
    ax = axs[0]
    l = np.arange(0, 60)
    for lam, col in ((0.0, C["x"]), (0.5, C["b"]), (0.9, C["y"]), (0.95, C["z"]), (1.0, C["a"])):
        ax.plot(l, (gamma * lam) ** l, "-o", ms=3.5, color=col, label=rf"$\lambda={lam}$")
    ax.set_xlabel(r"$l$ (steps ahead)"); ax.set_ylabel(r"weight $(\gamma\lambda)^l$ of $\delta_{t+l}$")
    ax.legend(fontsize=13, ncol=5, loc="upper center", bbox_to_anchor=(0.5, 1.2), columnspacing=0.8, handlelength=1.2)
    ax.set_ylim(0, 1.05)
    # bias / variance experiment on a chain with noisy rewards and an imperfect critic
    rng = np.random.default_rng(0)
    T, E = 300, 4000
    t = np.arange(T + 1)
    V = (1 - gamma ** (T - t)) / (1 - gamma)                  # true value with r = 1 + noise
    Vhat = V + 4.0 * np.sin(0.15 * t) + 2.0                   # biased critic
    Vhat[-1] = 0.0
    lams = np.linspace(0, 1, 21)
    rew = 1 + 2.0 * rng.standard_normal((E, T))
    delta = rew + gamma * Vhat[None, 1:] - Vhat[None, :-1]
    bias2, var = [], []
    for lam in lams:
        w = (gamma * lam) ** np.arange(T)
        A0 = delta @ w                                        # GAE estimate at t = 0
        # lambda = 1 is the Monte-Carlo target G_0 - Vhat(s_0), whose mean is V(s_0) - Vhat(s_0)
        bias2.append((A0.mean() - (V[0] - Vhat[0])) ** 2); var.append(A0.var())
    ax = axs[1]
    ax.plot(lams, bias2, color=C["x"], label=r"bias$^2$")
    ax.plot(lams, var, color=C["z"], label="variance")
    ax.plot(lams, np.array(bias2) + np.array(var), color=C["dark"], ls="--", label="MSE")
    ax.set_yscale("log"); ax.set_xlabel(r"$\lambda$"); ax.set_ylabel(r"error of $\hat A_0$")
    ax.axvline(0.95, color=C["gray"], ls=":", lw=1.5)
    ax.legend(fontsize=13, loc="lower left")
    ax.set_title(r"chain, $r_t = 1 + \mathcal{N}(0, 2^2)$, critic off by $2 + 4\sin(0.15t)$")
    fig.tight_layout()
    save(fig, OUT / "02-gae.svg")


# ================================================================= PPO clip
def fig_ppo_clip():
    eps = 0.2
    r = np.linspace(0, 2, 801)
    fig, axs = plt.subplots(1, 2, figsize=(10, 4.6), sharey=False)
    for ax, A in zip(axs, (1.0, -1.0)):
        unclipped = r * A
        L = np.minimum(r * A, np.clip(r, 1 - eps, 1 + eps) * A)
        ax.plot(r, unclipped, color=C["gray"], ls="--", lw=1.8, label=r"$\rho\hat A$")
        ax.plot(r, L, color=C["a"], lw=3.2, label=r"$L^{\mathrm{CLIP}}$")
        flat = (r > 1 + eps) if A > 0 else (r < 1 - eps)
        ax.fill_between(r, -2.2, 2.2, where=flat, color=C["x"], alpha=0.08)
        ax.axvline(1, color=C["dark"], lw=1, ls=":")
        for v in (1 - eps, 1 + eps):
            ax.axvline(v, color=C["gray"], lw=1)
        ax.plot(1, A, "o", color=C["dark"], ms=8)
        ax.set_xlabel(r"ratio $\rho = \pi_\theta / \pi_{\theta_{\mathrm{old}}}$")
        ax.set_xticks([0, 0.8, 1.2, 2])
        ax.set_title(rf"$\hat A {'>' if A > 0 else '<'} 0$")
        ax.set_ylim(-2.1, 2.1) if A < 0 else ax.set_ylim(-0.3, 2.1)
        if A < 0:
            ax.set_ylim(-2.1, 0.3)
        ax.legend(fontsize=13, loc="upper left" if A > 0 else "lower left")
        ax.text(1.55 if A > 0 else 0.4, 0.5 * A + (0.45 if A > 0 else -0.15), r"$\partial L/\partial\theta = 0$",
                ha="center", fontsize=14, color=C["x"])
    axs[0].set_ylabel(r"objective for one sample, $\vert\hat A\vert = 1$")
    fig.tight_layout()
    save(fig, OUT / "02-ppo-clip.svg")


# ================================================================= SAC / max entropy
def fig_entropy():
    a = np.linspace(-1, 1, 801)
    Q = np.exp(-(a - 0.5) ** 2 / 0.02) + 0.8 * np.exp(-(a + 0.5) ** 2 / 0.05)
    fig, axs = plt.subplots(2, 1, figsize=(9, 8.6))
    ax = axs[0]
    ax.plot(a, Q, color=C["dark"], ls="--", lw=2, label=r"$Q(s, a)$")
    da = a[1] - a[0]
    for alpha, col in ((0.03, C["x"]), (0.2, C["a"]), (1.0, C["z"])):
        p = np.exp(Q / alpha); p /= p.sum() * da
        H = -np.sum(p * np.log(p + 1e-300)) * da
        ax.plot(a, p / p.max() * 1.0, color=col, lw=2.6, label=rf"$\pi \propto e^{{Q/\alpha}}$, $\alpha={alpha}$, $\mathcal{{H}}={H:.2f}$")
    ax.set_xlabel("$a$"); ax.set_ylim(0, 1.75)
    ax.legend(fontsize=13, loc="upper left")
    ax.set_title("maximum entropy: larger $\\alpha$ keeps both modes (curves scaled to peak 1)")
    ax = axs[1]
    rng = np.random.default_rng(0)
    for mu, sig, col in ((0.8, 1.0, C["a"]), (0.0, 0.4, C["b"]), (-1.5, 1.5, C["c"])):
        u = rng.normal(mu, sig, 200000)
        ax.hist(np.tanh(u), bins=120, range=(-1, 1), density=True, color=col, alpha=0.3)
        x = np.linspace(-0.999, 0.999, 800)
        uu = np.arctanh(x)
        dens = np.exp(-(uu - mu) ** 2 / (2 * sig ** 2)) / (sig * np.sqrt(2 * np.pi)) / (1 - x ** 2)
        ax.plot(x, dens, color=col, lw=2.4, label=rf"$u\sim\mathcal{{N}}({mu}, {sig}^2)$")
    ax.set_ylim(0, 3.2); ax.set_xlabel(r"$\tilde a = \tanh(u)$")
    ax.set_ylabel("density")
    ax.legend(fontsize=13, loc="upper center")
    ax.set_title(r"tanh-squashed Gaussian: $\mathcal{N}(u;\mu,\sigma)\,/\,(1-\tanh^2 u)$ vs. samples")
    fig.tight_layout()
    save(fig, OUT / "02-max-entropy.svg")


# ================================================================= PPO training runs
def fig_ppo_training(runs):
    import torch
    fig = plt.figure(figsize=(9, 9))
    gs = fig.add_gridspec(2, 2, height_ratios=[1, 1.05])
    ax = fig.add_subplot(gs[0, :])
    for name, col, lab in (("nominal", C["a"], r"PointReach, $\lambda=0.95$ (the post's run)"),
                           ("lam0", C["x"], r"$\lambda=0$"), ("lam1", C["b"], r"$\lambda=1$"),
                           ("randomized", C["y"], r"RandomizedPointReach, $\lambda=0.95$")):
        c = runs[name][0]
        ax.plot(np.arange(len(c)), c, color=col, lw=2.4 if name == "nominal" else 1.6, label=lab,
                alpha=1 if name == "nominal" else 0.85)
    ax.axhline(runs["nominal"][0][0], color=C["gray"], ls=":", lw=1.2)
    ax.set_xlabel("PPO iteration (64 envs x 128 steps each)"); ax.set_ylabel("mean reward per step")
    ax.legend(fontsize=12.5, loc="lower right")
    ax.set_ylim(-1.0, 0.0)
    # rollouts of the trained nominal policy from 12 start states
    model = load_model(runs["nominal"][1])
    ax = fig.add_subplot(gs[1, 0])
    ang = np.linspace(0, 2 * np.pi, 12, endpoint=False)
    pos = torch.tensor(np.stack([0.9 * np.cos(ang), 0.9 * np.sin(ang)], 1), dtype=torch.float32)
    vel = torch.zeros_like(pos); path = [pos.numpy().copy()]
    with torch.no_grad():
        for _ in range(50):
            a = model.pi(torch.cat([pos, vel], -1)).clamp(-1, 1)
            vel = 0.9 * vel + 0.1 * a; pos = pos + 0.1 * vel
            path.append(pos.numpy().copy())
    path = np.array(path)
    for i in range(12):
        ax.plot(path[:, i, 0], path[:, i, 1], color=plt.get_cmap("hsv")(i / 12), lw=2)
        ax.plot(*path[0, i], "o", ms=6, color=plt.get_cmap("hsv")(i / 12))
    ax.plot(0, 0, "*", ms=18, color=C["b"], mec=C["dark"])
    ax.set_aspect("equal"); ax.set_xlim(-1.1, 1.1); ax.set_ylim(-1.1, 1.1)
    ax.set_title("trained policy, 50 steps", fontsize=14)
    ax.set_xticks([-1, 0, 1]); ax.set_yticks([-1, 0, 1])
    ax2 = fig.add_subplot(gs[1, 1])
    d = np.linalg.norm(path, axis=2)
    ax2.plot(d, color=C["a"], lw=1.4, alpha=0.7)
    ax2.set_xlabel("step $t$"); ax2.set_ylabel(r"$\Vert p_t\Vert$")
    ax2.set_title("distance to the origin", fontsize=14)
    fig.tight_layout()
    save(fig, OUT / "02-ppo-training.svg")


def fig_domain_randomization(runs):
    import torch
    damps = np.linspace(0.6, 0.99, 27); gains = np.linspace(0.02, 0.3, 29)
    maps = {}
    for name in ("nominal", "randomized"):
        m = load_model(runs[name][1])
        maps[name] = np.array([[evaluate(m, d, g) for d in damps] for g in gains])
    real = (0.94, 0.06)
    for name in maps:
        print(f"DR map {name}: at nominal {evaluate(load_model(runs[name][1]), 0.9, 0.1):.3f}, "
              f"at 'real' {evaluate(load_model(runs[name][1]), *real):.3f}, worst in box "
              f"{maps[name][(gains[:, None] >= 0.05) & (gains[:, None] <= 0.2) & (damps[None] >= 0.8) & (damps[None] <= 0.97)].min():.3f}")
    rng = np.random.default_rng(1)
    samp = np.stack([rng.uniform(0.8, 0.97, 64), rng.uniform(0.05, 0.2, 64)], 1)
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)
        fig = plt.figure(figsize=(9.5, 9.6))
        gs = fig.add_gridspec(2, 2, height_ratios=[0.8, 1])
        ax = fig.add_subplot(gs[0, :])
        ax.add_patch(Rectangle((0.8, 0.05), 0.17, 0.15, fc=C["fill"], ec=C["a"], lw=2))
        ax.scatter(samp[:, 0], samp[:, 1], s=26, color=C["a"], label=L("randomized simulators (one per env)", "随机化的仿真器（每个环境一个）", "ランダム化したシミュレータ（環境ごとに 1 つ）"))
        ax.plot(0.9, 0.1, "s", ms=13, color=C["b"], mec=C["dark"], label=L("nominal simulator", "标称仿真器", "公称シミュレータ"))
        ax.plot(*real, "*", ms=22, color=C["x"], mec=C["dark"], label=L("real robot (unknown)", "真实机器人（未知）", "実機（未知）"))
        ax.set_xlim(0.6, 0.99); ax.set_ylim(0.02, 0.3)
        ax.set_xlabel(L("damping", "阻尼", "減衰") + " (damp)"); ax.set_ylabel(L("actuator gain", "执行器增益", "アクチュエータゲイン") + " (gain)")
        ax.legend(fontsize=13, loc="upper left", framealpha=0.95)
        for k, (name, ttl) in enumerate((("nominal", L("trained on nominal", "在标称环境训练", "公称環境で学習")),
                                        ("randomized", L("trained with randomization", "用域随机化训练", "ランダム化して学習")))):
            ax = fig.add_subplot(gs[1, k])
            im = ax.imshow(maps[name], origin="lower", extent=[damps[0], damps[-1], gains[0], gains[-1]], aspect="auto",
                           cmap="viridis", vmin=-0.6, vmax=-0.1)
            ax.contour(damps, gains, maps[name], levels=[-0.2], colors="white", linewidths=1.6)
            ax.add_patch(Rectangle((0.8, 0.05), 0.17, 0.15, fill=False, ec="white", lw=2, ls="--"))
            ax.plot(0.9, 0.1, "s", ms=10, color=C["b"], mec="white")
            ax.plot(*real, "*", ms=17, color=C["x"], mec="white")
            ax.set_title(ttl, fontsize=14.5)
            ax.set_xlabel("damp")
            if k == 0:
                ax.set_ylabel("gain")
            ax.grid(False)
        cb = fig.colorbar(im, ax=fig.axes[1:], fraction=0.04, pad=0.03, orientation="horizontal")
        cb.set_label(L("mean reward per step (white: -0.2 contour)", "每步平均奖励（白线：-0.2 等值线）", "1 ステップあたりの平均報酬（白線：-0.2 の等高線）"))
        fig.subplots_adjust(hspace=0.35, bottom=0.2)
        save(fig, OUT / f"02-domain-randomization_{lang}.svg")


if __name__ == "__main__":
    fig_rl_loop()
    fig_value_iteration()
    fig_policy_gradient()
    fig_gae()
    fig_ppo_clip()
    fig_entropy()
    runs = get_runs()
    fig_ppo_training(runs)
    fig_domain_randomization(runs)
