"""Figures for the "2025-2026 update (as of November 2026)" sections of world-models posts 01-05.

    python3 bin/figures/world-models/world_models_updates.py

Writes assets/img/blog/world-models/0N-update-*.svg. All text inside the figures is language-neutral
(symbols, numbers, model names), so there is one SVG per figure. Data:
  - 03-update-memory: context size for 24 fps video with 4x temporal compression (6 latent frames/s),
    a W = 30 frame window and K = 16 retrieved memory frames; the "about one minute" of visual memory is
    the figure stated in the Genie 3 announcement (DeepMind blog, 5 Aug 2025).
  - 04-update-memory-growth: toy model (illustrative numbers, not from any paper).
  - 05-update-benchmarks: which of the five questions of post 5, Section 5, each benchmark names as an
    evaluation dimension in its arXiv abstract (checked November 2026).
  - 02-update-exposure, 05-update-sigreg: real toy runs (PyTorch, CPU, about a minute in total); they are the
    code snippets printed in the update sections of posts 2 and 5, and the numbers quoted in those posts are
    the values this script prints.
  - 01-update-offline-imagination, 03-update-revisit-kymo, 03-update-revisit-error, 04-update-coverage: real
    NumPy toy runs (offline imagination training in a gridworld; a 1D video world model with and without
    pose-indexed memory; a 2D ray-cast explicit memory growing along a camera path). Under 10 s on a CPU; the
    numbers quoted in posts 1, 3 and 4 are the values this script prints.

Run a subset with e.g.  python3 bin/figures/world-models/world_models_updates.py fig_revisit fig_coverage
"""
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets" / "img" / "blog" / "world-models"


def box(ax, x, y, w, h, text, ec, fc="white", fs=15):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.08", ec=ec, fc=fc, lw=2.5,
                                zorder=4))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs, zorder=5)


def arrow(ax, x0, y0, x1, y1, color="#444444"):
    ax.annotate("", xy=(x1, y1), xytext=(x0, y0), arrowprops=dict(arrowstyle="-|>", color=color, lw=2))


def fig_dreamer4():
    fig, ax = plt.subplots(figsize=(10, 4.4))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.4)
    ax.axis("off")
    for i, x0 in enumerate([0.1, 3.45, 6.8]):
        ax.add_patch(FancyBboxPatch((x0, 0.1), 3.1, 3.7, boxstyle="round,pad=0.02,rounding_size=0.15",
                                    ec="#bbbbbb", fc="none", lw=1.5, ls="--"))
        ax.text(x0 + 1.55, 4.1, str(i + 1), ha="center", va="center", fontsize=20, fontweight="bold")
    # phase 1: frames -> tokenizer -> dynamics
    for k in range(3):
        ax.add_patch(Rectangle((0.45 + 0.12 * k, 3.0 - 0.12 * k), 0.8, 0.55, ec=C["z"], fc="#e8f1fa", lw=2))
    ax.text(1.75, 2.95, r"$x_{1:T}$", color=C["z"], fontsize=16)
    ax.text(0.45, 2.35, r"$a_{1:T}$ (few)", color=C["gray"], fontsize=13)
    box(ax, 0.5, 1.45, 2.3, 0.55, r"$E: x \to z$", C["z"])
    box(ax, 0.5, 0.4, 2.3, 0.65, r"$p_\theta(z_{t+1} \mid z_{\leq t}, a_{\leq t})$", C["z"], fs=14)
    arrow(ax, 1.65, 2.25, 1.65, 2.02)
    arrow(ax, 1.65, 1.45, 1.65, 1.07)
    # phase 2: world model + BC policy and reward heads
    box(ax, 4.15, 2.75, 1.7, 0.55, r"$p_\theta$", C["z"], fc="#f3f3f3")
    box(ax, 3.7, 1.35, 1.2, 0.55, r"$\pi(a \mid z)$", C["b"], fc="#fff4e8")
    box(ax, 5.1, 1.35, 1.2, 0.55, r"$\hat r(z)$", C["b"], fc="#fff4e8")
    arrow(ax, 4.7, 2.75, 4.35, 1.92)
    arrow(ax, 5.3, 2.75, 5.65, 1.92)
    ax.text(5.0, 0.85, "BC + reward", ha="center", color="#555555", fontsize=14)
    ax.text(5.0, 0.45, "(offline data)", ha="center", color=C["gray"], fontsize=13)
    # phase 3: imagination loop
    t = np.linspace(0, 2 * np.pi, 200)
    ax.plot(8.35 + 1.05 * np.cos(t), 1.95 + 1.05 * np.sin(t), color=C["y"], lw=3)
    arrow(ax, 9.25, 2.5, 9.38, 2.05, color=C["y"])
    box(ax, 7.75, 2.75, 1.2, 0.48, r"$p_\theta$", C["z"])
    box(ax, 7.75, 0.68, 1.2, 0.48, r"$\pi$", C["b"], fc="#fff4e8")
    ax.text(8.35, 2.05, r"$\hat z_{t+k},\ \hat r$", ha="center", color=C["y"], fontsize=15)
    ax.text(8.35, 1.7, r"$k = 1 \ldots H$", ha="center", color=C["y"], fontsize=13)
    ax.text(8.35, 0.3, "RL, no env.", ha="center", color="#555555", fontsize=14)
    arrow(ax, 3.22, 2.0, 3.43, 2.0)
    arrow(ax, 6.57, 2.0, 6.78, 2.0)
    save(fig, OUT / "01-update-dreamer4.svg")


def fig_forcing():
    sig_df = [0.2, 0.7, 0.1, 0.9, 0.4, 0.6]
    fig, ax = plt.subplots(figsize=(10, 4.3))
    ax.set_xlim(-1.2, 7.0)
    ax.set_ylim(-1.35, 3.0)
    ax.axis("off")

    def cell(i, row, fc, ec, text, tc):
        ax.add_patch(Rectangle((i, row), 0.86, 0.6, fc=fc, ec=ec, lw=2))
        ax.text(i + 0.43, row + 0.3, text, ha="center", va="center", color=tc, fontsize=15)

    for name, row in (("TF", 2.2), ("DF", 1.1), ("SF", 0.0)):
        ax.text(-0.25, row + 0.3, name, ha="right", va="center", fontsize=20, fontweight="bold")
    for i in range(6):
        g = 1.0 - 0.8 * sig_df[i]
        # TF: real clean past, noisy target (last frame)
        if i < 5:
            cell(i, 2.2, "#dbe9f6", C["z"], rf"$x_{i + 1}$", "#1f4e79")
        else:
            cell(i, 2.2, str(1.0 - 0.8 * 0.6), "#333333", r"$x_6{+}\sigma\epsilon$", "white")
        # DF: independent noise level per frame
        cell(i, 1.1, str(g), "#333333", rf"$\sigma$={sig_df[i]}", "white" if sig_df[i] > 0.5 else "#222222")
        # SF: own generated past, autoregressive
        cell(i, 0.0, "#fbe3d0", "#d35400", rf"$\hat x_{i + 1}$", "#a04000")
        if i < 5:
            arrow(ax, i + 0.7, 0.72, i + 1.16, 0.72, color="#d35400")
    ax.plot([0, 0, 5.86, 5.86], [-0.15, -0.3, -0.3, -0.15], color="#a04000", lw=2)
    ax.text(2.93, -0.75, r"$\mathcal{L}(\hat x_{1:6})$   (DMD / GAN)", ha="center", color="#a04000", fontsize=15)
    ax.text(6.25, 1.4, r"$t \rightarrow$", color="#555555", fontsize=15)
    save(fig, OUT / "02-update-forcing.svg")


def fig_exposure_toy():
    """Real toy run: teacher forcing vs training on the model's own rollouts (the snippet in post 2's update)."""
    import torch

    torch.manual_seed(0)
    dt = 0.1


    def true_step(x):                       # damped pendulum, state = (angle, angular velocity)
        th, om = x[..., 0], x[..., 1]
        return torch.stack([th + dt * om, om + dt * (-torch.sin(th) - 0.1 * om)], -1)


    def rollout(step, x0, T):
        xs = [x0]
        for _ in range(T):
            xs.append(step(xs[-1]))
        return torch.stack(xs, 1)            # (batch, T+1, 2)


    x0_train = (torch.rand(256, 2) - 0.5) * torch.tensor([5.0, 3.0])
    x0_test = (torch.rand(256, 2) - 0.5) * torch.tensor([5.0, 3.0])
    X = rollout(true_step, x0_train, 40)


    def make_model():                        # a small model that cannot fit the dynamics exactly
        return torch.nn.Sequential(torch.nn.Linear(2, 8), torch.nn.Tanh(), torch.nn.Linear(8, 2))


    def train(mode, H=20, iters=1500):
        torch.manual_seed(1)
        f = make_model()
        step = lambda x: x + f(x)
        opt = torch.optim.Adam(f.parameters(), lr=3e-3)
        for _ in range(iters):
            if mode == "teacher":            # context = real previous state, one-step target
                loss = ((step(X[:, :-1]) - X[:, 1:]) ** 2).mean()
            else:                            # context = the model's own rollout, loss on the whole clip
                s = torch.randint(0, 40 - H, (1,)).item()
                loss = ((rollout(step, X[:, s], H) - X[:, s:s + H + 1]) ** 2).mean()
            opt.zero_grad()
            loss.backward()
            opt.step()
        return step



    with torch.no_grad():
        Y = rollout(true_step, x0_test, 60)
    models = {m: train(m) for m in ("teacher", "self")}
    errs, trajs = {}, {}
    for m, step in models.items():
        with torch.no_grad():
            R = rollout(step, x0_test, 60)
            errs[m] = (R - Y).pow(2).sum(-1).sqrt().mean(0).numpy()
            one = ((step(Y[:, :-1]) - Y[:, 1:]) ** 2).sum(-1).sqrt().mean().item()
            print(f"{m}: one-step {one:.4f}, rollout t=10 {errs[m][10]:.3f} t=30 {errs[m][30]:.3f} t=60 {errs[m][60]:.3f}")
            trajs[m] = R.numpy()
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.6))
    t = np.arange(61)
    a1.plot(t, errs["teacher"], color=C["z"], lw=3, label="TF")
    a1.plot(t, errs["self"], color="#d35400", lw=3, label="SF")
    a1.set_xlabel(r"$t$  (steps)")
    a1.set_ylabel(r"$\Vert \hat x_t - x_t \Vert$")
    a1.set_xlim(0, 60)
    a1.set_ylim(0, None)
    a1.legend(loc="upper left")
    gap = np.linalg.norm(trajs["teacher"][:, 60] - Y[:, 60].numpy(), axis=-1) - \
        np.linalg.norm(trajs["self"][:, 60] - Y[:, 60].numpy(), axis=-1)
    i = int(np.argmax(gap))  # the test trajectory where the two models differ most (stated in the caption)
    print("shown trajectory", i, "x0", Y[i, 0].numpy().round(2), "gap at t=60", gap[i].round(3),
          "SF better on", (gap > 0).mean().round(3), "of test trajectories")
    trajs = {m: v[i] for m, v in trajs.items()}
    y = Y[i].numpy()
    a2.plot(y[:, 0], y[:, 1], color="#222222", lw=3, label=r"$x_t$")
    a2.plot(trajs["teacher"][:, 0], trajs["teacher"][:, 1], color=C["z"], lw=2.5, ls="--", label="TF")
    a2.plot(trajs["self"][:, 0], trajs["self"][:, 1], color="#d35400", lw=2.5, ls="--", label="SF")
    a2.scatter([y[0, 0]], [y[0, 1]], s=80, color="#222222", zorder=5)
    a2.set_xlabel(r"$\theta$")
    a2.set_ylabel(r"$\dot\theta$")
    a2.legend(loc="best", fontsize=13)
    fig.tight_layout()
    save(fig, OUT / "02-update-exposure.svg")


def fig_memory():
    t = np.linspace(0.2, 120, 600)
    fps_latent, W, K = 6.0, 30, 16
    full = fps_latent * t
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.plot(t, full, color=C["x"], lw=3.5, label=r"$O(T)$")
    ax.plot(t, np.minimum(full, W + K), color=C["y"], lw=3.5, label=r"$O(W+K)$")
    ax.plot(t, np.minimum(full, W), color=C["z"], lw=3.5, ls="--", label=r"$O(W)$")
    ax.axvline(60, color=C["gray"], ls="--", lw=1.5)
    ax.text(61.5, 12, "Genie 3: ~60 s", color="#555555", fontsize=13)
    ax.set_yscale("log")
    ax.set_xlim(0, 120)
    ax.set_ylim(10, 1000)
    ax.set_xticks([0, 30, 60, 90, 120])
    ax.set_xlabel(r"$t$  [s]")
    ax.set_ylabel(r"$N_{ctx}$")
    ax.legend(loc="center right")
    save(fig, OUT / "03-update-memory.svg")


def fig_memory_growth():
    t = np.linspace(0, 120, 1201)
    rate = 6 * 50e3  # Gaussians per second if every latent frame is unprojected
    f_new = 0.25
    exploring = (t < 40) | (t >= 80)
    dt = t[1] - t[0]
    per_frame = rate * t / 1e6
    extent = np.concatenate([[0.0], np.cumsum(np.where(exploring[1:], rate * f_new * dt, 0.0))]) / 1e6
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.axvspan(40, 80, color="#f2f2f2", zorder=0)
    ax.text(60, 37, "↺", ha="center", fontsize=22, color="#666666")
    ax.plot(t, per_frame, color=C["x"], lw=3.5)
    ax.plot(t, extent, color=C["y"], lw=3.5)
    ax.text(100, per_frame[1000] + 3, r"$O(T)$", color=C["x"], fontsize=16)
    ax.text(100, extent[1000] + 2.5, r"$O(|A|)$", color=C["y"], fontsize=16)
    ax.set_xlim(0, 120)
    ax.set_ylim(0, 40)
    ax.set_xticks([0, 40, 80, 120])
    ax.set_xlabel(r"$t$  [s]")
    ax.set_ylabel(r"$N_{prim}$  [$10^6$]")
    print("final per-frame / extent:", per_frame[-1], extent[-1])  # 36 M and 6 M
    save(fig, OUT / "04-update-memory-growth.svg")


def fig_sigreg_toy():
    """Real toy run: SIGReg alone un-collapses a dimensionally collapsed linear encoder (snippet in post 5's update)."""
    import torch
    torch.manual_seed(0)
    N, D_in, D = 2048, 16, 8
    X = torch.randn(N, D_in)
    W = torch.zeros(D_in, D)
    W[:, 0] = 0.05 * torch.randn(D_in)
    W += 1e-3 * torch.randn(D_in, D)
    W.requires_grad_(True)
    tt = torch.linspace(-4, 4, 65)
    w = torch.exp(-tt ** 2 / 2)

    def sigreg(Z, M=64):
        U = torch.randn(Z.shape[1], M)
        U = U / U.norm(dim=0, keepdim=True)
        arg = (Z @ U)[:, :, None] * tt
        re, im = torch.cos(arg).mean(0), torch.sin(arg).mean(0)
        return (((re - torch.exp(-tt ** 2 / 2)) ** 2 + im ** 2) * w).mean()

    opt = torch.optim.Adam([W], lr=1e-2)
    eigs, snaps = [], {}
    g = torch.Generator().manual_seed(7)
    u_fix = torch.randn(D, generator=g)
    u_fix = u_fix / u_fix.norm()
    for it in range(201):
        Z = X @ W
        loss = sigreg(Z)
        opt.zero_grad()
        loss.backward()
        opt.step()
        Zd = Z.detach()
        eigs.append(torch.linalg.eigvalsh(torch.cov(Zd.T)).flip(0).numpy())
        if it in (0, 50, 200):
            snaps[it] = (Zd @ u_fix).numpy()
    eigs = np.array(eigs)
    print("eigenvalues at step 0 / 50 / 200:", eigs[0].round(2), eigs[50].round(2), eigs[200].round(2))
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.6))
    xs = np.linspace(-4, 4, 300)
    a1.plot(xs, np.exp(-xs ** 2 / 2) / np.sqrt(2 * np.pi), color="#222222", lw=3, label=r"$\mathcal{N}(0,1)$")
    for it, col in ((0, C["x"]), (50, C["b"]), (200, C["y"])):
        a1.hist(snaps[it], bins=np.linspace(-4, 4, 41), density=True, histtype="step", lw=2.5, color=col,
                label=f"step {it}")
    a1.set_ylim(0, 1.0)
    a1.set_xlim(-4, 4)
    a1.set_xlabel(r"$u^\top z$")
    a1.legend(loc="upper right", fontsize=13)
    cmap = plt.get_cmap("viridis")
    for k in range(eigs.shape[1]):
        a2.plot(np.arange(len(eigs)), np.maximum(eigs[:, k], 1e-6), color=cmap(k / (eigs.shape[1] - 1)), lw=2.2)
    a2.axhline(1.0, color="#222222", ls="--", lw=1.5)
    a2.set_yscale("log")
    a2.set_ylim(1e-5, 10)
    a2.set_xlim(0, 200)
    a2.set_xlabel("step")
    a2.set_ylabel(r"$\lambda_k(\mathrm{Cov}(z))$")
    fig.tight_layout()
    save(fig, OUT / "05-update-sigreg.svg")


# benchmark -> (year, {question: 1 named dimension, 0.5 partial})
BENCH = [
    ("VBench ('24)", {1: 1}),
    ("Physics-IQ ('25)", {2: 1}),
    ("WorldModelBench ('25)", {2: 1, 3: 0.5}),
    ("VideoPhy-2 ('25)", {2: 1}),
    ("WorldScore ('25)", {1: 1, 2: 0.5, 3: 1}),
    ("IntPhys 2 ('25)", {2: 1}),
    ("World-in-World ('25)", {5: 1}),
    ("WorldMark ('26)", {3: 1}),
    ("WBench ('26)", {1: 1, 2: 1, 3: 1, 4: 1}),
    ("WorldArena 2.0 ('26)", {1: 1, 5: 1}),
    ("WRBench ('26)", {4: 1}),
    ("Last Exam in Physics ('26)", {2: 1}),
]


def fig_benchmarks():
    n = len(BENCH)
    fig, ax = plt.subplots(figsize=(9, 6.2))
    for i, (name, cov) in enumerate(BENCH):
        y = n - 1 - i
        for q, v in cov.items():
            if v == 1:
                ax.scatter([q], [y], s=260, color=C["z"], zorder=3)
            else:
                ax.scatter([q], [y], s=230, facecolor="white", edgecolor=C["z"], lw=2.5, zorder=3)
    ax.axhline(n - 7.5, color=C["gray"], ls="--", lw=1.5)
    ax.set_yticks(range(n))
    ax.set_yticklabels([b[0] for b in BENCH][::-1])
    ax.set_xticks([1, 2, 3, 4, 5])
    ax.set_xticklabels(["5.1", "5.2", "5.3", "5.4", "5.5"], fontweight="bold")
    ax.xaxis.tick_top()
    ax.set_xlim(0.5, 5.5)
    ax.set_ylim(-0.7, n - 0.4)
    counts = [sum(1 for _, c in BENCH if c.get(q) == 1) for q in range(1, 6)]
    for q, c in zip(range(1, 6), counts):
        ax.text(q, -1.25, str(c), ha="center", color="#555555", fontsize=14)
    ax.text(0.55, -1.25, r"$\Sigma$", color="#555555", fontsize=14)
    ax.grid(False)
    for s in ax.spines.values():
        s.set_visible(False)
    print("filled counts per question:", counts)  # [4, 6, 3, 2, 2]
    save(fig, OUT / "05-update-benchmarks.svg")


# ---------------------------------------------------------------------------------------------------------------
# Toy runs added for the learning figures 01-update-offline, 03-update-revisit-*, 04-update-coverage.
# ---------------------------------------------------------------------------------------------------------------

OFF_MAZE = ["...#....G",
            "...#.....",
            "...#..#..",
            "S..#..#..",
            "...#..#..",
            "......#..",
            "......#.."]


def offline_toy(Ns=(25, 50, 100, 200, 400, 800, 1600, 3200), seeds=50, gamma=0.95):
    """Offline imagination training in a gridworld (post 1 update).

    A fixed dataset of N random-walk transitions (episodes of 10 steps from random free cells) is all the agent
    ever gets. Model-free: value iteration restricted to the (s, a) pairs in the dataset (= offline Q-learning run
    to convergence). Model-based ("imagination"): a learned model that (i) memorizes observed transitions,
    (ii) knows every wall it has *seen* in the 3x3 neighbourhood of a visited cell, and (iii) generalizes
    "moves succeed" everywhere else. The policy is trained only inside that model (value iteration = imagination
    training run to convergence) and then evaluated once in the real maze.
    """
    M = OFF_MAZE
    H, W = len(M), len(M[0])
    A = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    free = [(r, c) for r in range(H) for c in range(W) if M[r][c] != "#"]
    cells = [(r, c) for r in range(H) for c in range(W)]
    start, goal = (3, 0), (0, 8)

    def prior(s, a):
        r, c = s[0] + A[a][0], s[1] + A[a][1]
        return (r, c) if (0 <= r < H and 0 <= c < W) else s

    def step(s, a):
        n = prior(s, a)
        return s if M[n[0]][n[1]] == "#" else n

    def collect(N, rng, L=10):
        data, n = {}, 0
        while n < N:
            s = free[rng.integers(len(free))]
            for _ in range(L):
                a = int(rng.integers(4))
                s2 = step(s, a)
                data[(s, a)] = s2
                s, n = s2, n + 1
                if n >= N:
                    break
        return data

    def solve(model, known=None, iters=60):
        Q = np.zeros((H, W, 4))
        for _ in range(iters):
            V = Q.max(2)
            for s in cells:
                if s == goal:
                    continue
                for a in range(4):
                    if known is not None and (s, a) not in known:
                        continue
                    s2 = model(s, a)
                    Q[s][a] = 1.0 if s2 == goal else gamma * V[s2]
        return Q

    def run(Q, rng, model=step, T=40):
        s, path = start, [start]
        for t in range(T):
            q = Q[s]
            a = int(rng.choice(np.flatnonzero(q == q.max())))
            s = model(s, a)
            path.append(s)
            if s == goal:
                return gamma ** t, path
        return 0.0, path

    def learned_model(data):
        seen = {k[0] for k in data} | set(data.values())
        walls = {(r + dr, c + dc) for (r, c) in seen for dr in (-1, 0, 1) for dc in (-1, 0, 1)
                 if 0 <= r + dr < H and 0 <= c + dc < W and M[r + dr][c + dc] == "#"}

        def model(s, a):
            if (s, a) in data:
                return data[(s, a)]
            n = prior(s, a)
            return s if n in walls else n
        return model, walls

    J_opt = solve(step)[start].max()
    res = {"mf": [], "mb": [], "mb_hat": []}
    example = None
    for N in Ns:
        mf, mb, mbh = [], [], []
        for seed in range(seeds):
            rng = np.random.default_rng(seed)
            data = collect(N, rng)
            mf.append(run(solve(lambda s, a: data[(s, a)], known=data), rng)[0] / J_opt)
            model, walls = learned_model(data)
            Q = solve(model)
            j, path = run(Q, rng)
            mb.append(j / J_opt)
            mbh.append(Q[start].max() / J_opt)
            if example is None and N == 50 and j == 0.0:
                _, ipath = run(Q, np.random.default_rng(0), model=model)
                example = dict(walls=walls, real=path, imag=ipath, data=data)
        for k, v in zip(res, (mf, mb, mbh)):
            res[k].append(np.mean(v))
    print("offline toy, J/J* averaged over", seeds, "seeds")
    for i, N in enumerate(Ns):
        print(f"  N={N:5d}  model-free {res['mf'][i]:.2f}  imagination real {res['mb'][i]:.2f}"
              f"  imagined {res['mb_hat'][i]:.2f}")
    return np.array(Ns), res, example, (H, W, start, goal)


def fig_offline_imagination():
    Ns, res, ex, (H, W, start, goal) = offline_toy()
    fig, (ax0, ax1) = plt.subplots(1, 2, figsize=(11, 4.6), gridspec_kw=dict(width_ratios=[1, 1.15]))
    # left: the maze as the model sees it, with the imagined and the real greedy path (one seed, N = 50)
    for r in range(H):
        for c in range(W):
            if OFF_MAZE[r][c] == "#":
                known = (r, c) in ex["walls"]
                ax0.add_patch(Rectangle((c, H - 1 - r), 1, 1, fc="#444444" if known else "white",
                                        ec="#444444", hatch=None if known else "///", lw=1.2))
    visited = {k[0] for k in ex["data"]} | set(ex["data"].values())
    for (r, c) in visited:
        ax0.add_patch(Rectangle((c, H - 1 - r), 1, 1, fc="#e8f1fa", ec="none", zorder=0))

    def xy(p):
        return np.array([[c + 0.5, H - 0.5 - r] for r, c in p])
    ip, rp = xy(ex["imag"]), xy(ex["real"])
    ax0.plot(ip[:, 0], ip[:, 1], color=C["a"], ls="--", lw=3, zorder=3)
    ax0.plot(rp[:, 0] + 0.08, rp[:, 1] - 0.08, color=C["b"], lw=3, zorder=3)
    ax0.scatter([rp[-1, 0] + 0.08], [rp[-1, 1] - 0.08], marker="X", s=200, color=C["b"], zorder=4)
    ax0.text(start[1] + 0.5, H - 0.5 - start[0], "S", ha="center", va="center", fontsize=16, fontweight="bold")
    ax0.text(goal[1] + 0.5, H - 0.5 - goal[0], "G", ha="center", va="center", fontsize=16, fontweight="bold",
             color=C["y"])
    ax0.set_xlim(0, W)
    ax0.set_ylim(0, H)
    ax0.set_aspect("equal")
    ax0.set_xticks([])
    ax0.set_yticks([])
    ax0.grid(False)
    ax0.set_title(r"$N = 50$", fontsize=15)
    for sp in ax0.spines.values():
        sp.set_visible(True)
    # right: real and imagined return against dataset size
    ax1.axhline(1.0, color=C["gray"], ls=":", lw=1.5)
    ax1.plot(Ns, res["mf"], "o-", color=C["z"], lw=3, label=r"$J_{\rm MF}$")
    ax1.plot(Ns, res["mb"], "o-", color=C["y"], lw=3, label=r"$J_{\rm img}$")
    ax1.plot(Ns, res["mb_hat"], "o--", color=C["a"], lw=2.5, mfc="white", label=r"$\hat J_{\rm img}$")
    ax1.set_xscale("log")
    ax1.set_xticks(Ns)
    ax1.set_xticklabels([str(n) for n in Ns], fontsize=12, rotation=45)
    ax1.set_xlabel(r"$N$  (offline transitions)")
    ax1.set_ylabel(r"$J / J^\star$")
    ax1.set_ylim(-0.05, 1.3)
    ax1.legend(loc="center right", fontsize=14)
    save(fig, OUT / "01-update-offline-imagination.svg")


def revisit_toy(seeds=200, F=32, P=4, sig=0.1):
    """1D 'video world model' that walks out and back over a static world (post 3 update).

    World: a 1D texture (AR(1)-smoothed noise). A frame is the F pixels in view; the action moves the view by
    v = +-2 pixels. The toy model has two learned parts, both fit by least squares on a *training* world observed
    with noise sig: an in-view transport kernel (3 taps; it slightly blurs, so errors accumulate) and an AR(P)
    predictor that samples newly revealed pixels. 'Window' keeps only the current frame. 'Memory' also keeps a
    pose-indexed canvas of everything it generated and copies from it when old content re-enters the view.
    """
    def texture(n, rng, a=0.9):
        x, e = np.zeros(n + 200), rng.normal(size=n + 200)
        for i in range(1, n + 200):
            x[i] = a * x[i - 1] + e[i]
        x = x[200:]
        return (x - x.mean()) / x.std()

    rng = np.random.default_rng(0)
    tr = texture(4000, rng)
    obs = tr + sig * rng.normal(size=tr.size)
    X = np.stack([obs[i:i + P] for i in range(len(obs) - P)])
    w_new = np.linalg.lstsq(X, obs[P:], rcond=None)[0]
    res_std = np.std(obs[P:] - X @ w_new)
    Xs = np.stack([obs[i - 1:i + 2] for i in range(1, len(tr) - 2)])
    kern = np.linalg.lstsq(Xs, tr[1:len(tr) - 2] + sig * rng.normal(size=len(Xs)), rcond=None)[0]
    print("revisit toy: AR weights", w_new.round(3), "residual std", round(res_std, 3), "kernel", kern.round(3))

    vel = [2] * 30 + [-2] * 30 + [2] * 60 + [-2] * 60
    poses = np.concatenate([[0], np.cumsum(vel)])
    span = poses.max() + F

    def rollout(world, memory, g):
        canvas = {}
        first = {x: world[x] for x in range(F)}       # value of each world pixel when first shown
        frame = world[:F].copy()
        frames = [frame.copy()]
        cons = [0.0]
        for t, v in enumerate(vel):
            p0, p1 = poses[t], poses[t + 1]
            if memory:
                canvas.update(zip(p0 + np.arange(F), frame))
            pad = np.concatenate([[frame[0]], frame, [frame[-1]]])
            prev = dict(zip(p0 + np.arange(F), np.convolve(pad, kern[::-1], mode="valid")))
            new = np.empty(F)
            for i in (range(F) if v > 0 else range(F - 1, -1, -1)):
                x = p1 + i
                if x in prev:
                    new[i] = prev[x]
                elif memory and x in canvas:
                    new[i] = canvas[x]
                else:
                    ctx = new[i - P:i] if v > 0 else new[i + 1:i + 1 + P][::-1]
                    new[i] = ctx @ w_new + res_std * g.normal()
            frame = new
            frames.append(frame.copy())
            xs = p1 + np.arange(F)
            old = np.array([x in first for x in xs])
            cons.append(np.sqrt(np.mean((frame[old] - np.array([first[x] for x in xs[old]])) ** 2)))
            for x, val in zip(xs, frame):
                first.setdefault(x, val)
        return np.array(frames), np.array(cons)

    errs = {False: [], True: []}
    kymo = None
    for s in range(seeds):
        world = texture(span, np.random.default_rng(1000 + s))
        out = {}
        for mem in (False, True):
            fr, cons = rollout(world, mem, np.random.default_rng(s))
            errs[mem].append(cons)
            out[mem] = fr
        if s == 0:
            kymo = (world, out)
    errs = {k: np.array(v) for k, v in errs.items()}
    for k in (False, True):
        e = errs[k].mean(0)
        print("  memory" if k else "  window", "consistency RMSE at t = 30, 60, 120, 180:",
              e[[30, 60, 120, 180]].round(2))
    return poses, F, kymo, errs


def fig_revisit():
    poses, F, (world, out), errs = revisit_toy()
    T = len(poses)
    span = poses.max() + F
    # kymograph: rows = time step, columns = world coordinate, blank where the camera does not look
    fig, axs = plt.subplots(1, 3, figsize=(10, 5.2), sharey=True)
    gt = np.array([world[p:p + F] for p in poses])
    for ax, fr, title in zip(axs, [gt, out[False], out[True]], [r"$x^\star$", r"$W$", r"$W + M$"]):
        img = np.full((T, span), np.nan)
        for t, p in enumerate(poses):
            img[t, p:p + F] = fr[t]
        ax.imshow(img, aspect="auto", cmap="RdBu_r", vmin=-2.2, vmax=2.2, interpolation="nearest",
                  extent=(0, span, T - 0.5, -0.5))
        ax.set_title(title, fontsize=17)
        ax.set_xlabel(r"$x$")
        ax.grid(False)
        for t in (60, 180):
            ax.axhline(t, color=C["gray"], ls="--", lw=1)
    axs[0].set_ylabel(r"$t$")
    save(fig, OUT / "03-update-revisit-kymo.svg")

    fig, (a0, a1) = plt.subplots(2, 1, figsize=(9, 6), sharex=True, gridspec_kw=dict(height_ratios=[1, 2.2]))
    t = np.arange(T)
    a0.plot(t, poses, color=C["dark"], lw=2.5)
    a0.set_ylabel(r"$p_t$")
    a0.set_yticks([0, 60, 120])
    for k, col, lab in ((False, C["x"], r"$W$"), (True, C["y"], r"$W + M$")):
        e = errs[k]
        a1.fill_between(t, np.percentile(e, 25, 0), np.percentile(e, 75, 0), color=col, alpha=0.18, lw=0)
        a1.plot(t, e.mean(0), color=col, lw=3, label=lab)
    for ax in (a0, a1):
        for tt in (60, 180):
            ax.axvline(tt, color=C["gray"], ls="--", lw=1)
    a1.set_xlabel(r"$t$  (steps)")
    a1.set_ylabel("RMSE")
    a1.set_xlim(0, T - 1)
    a1.set_ylim(0, None)
    a1.legend(loc="upper left")
    save(fig, OUT / "03-update-revisit-error.svg")


def coverage_toy(vox=0.25, n_rays=90, fov=np.pi / 2, rmax=7.0, step=0.12):
    """2D explicit-memory toy (post 4 update): a camera walks through a room with boxes, casts n_rays depth rays per
    frame and adds a surfel (one wall cell of length vox) to the memory only if it is not there yet."""
    def rect(x0, y0, x1, y1):
        return [((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))]
    seg = np.array(rect(0, 0, 24, 12) + rect(4, 3, 8, 6) + rect(11, 0, 12, 7) + rect(15, 5, 17, 9)
                   + rect(19, 2, 21, 4) + rect(4, 8.5, 6, 10), float)
    e = seg[:, 1] - seg[:, 0]
    L = np.linalg.norm(e, axis=1)
    surfels = [(j, k) for j in range(len(seg)) for k in range(int(np.ceil(L[j] / vox - 1e-9)))]

    def cast(o, ang):
        d = np.stack([np.cos(ang), np.sin(ang)], 1)
        den = d[:, None, 0] * e[None, :, 1] - d[:, None, 1] * e[None, :, 0]
        ao = seg[None, :, 0] - o[None, None]
        with np.errstate(divide="ignore", invalid="ignore"):
            t = (ao[..., 0] * e[None, :, 1] - ao[..., 1] * e[None, :, 0]) / den
            u = (ao[..., 0] * d[:, None, 1] - ao[..., 1] * d[:, None, 0]) / den
        t = np.where((np.abs(den) > 1e-9) & (t > 1e-6) & (u >= 0) & (u <= 1), t, np.inf)
        j = t.argmin(1)
        r = np.arange(len(j))
        hit = t[r, j] < rmax
        cell = np.floor(u[r, j] * L[j] / vox).astype(int)
        return {(int(a), int(b)) for a, b in zip(j[hit], cell[hit])}, int(hit.sum())

    wp = np.array([[2, 1.5], [2, 7], [9.5, 7], [9.5, 1.5], [2, 1.5], [2, 7], [9.5, 7], [9.5, 10.5], [14, 10.5],
                   [14, 3], [18, 1.2], [22.5, 6], [22.5, 10.5], [18, 10.8]])
    pts, lap = [], []
    for i, (p, q) in enumerate(zip(wp[:-1], wp[1:])):
        n = int(np.linalg.norm(q - p) / step)
        pts += [p + (q - p) * k / n for k in range(n)]
        lap += [4 <= i <= 5] * n                      # segments 4-5 repeat segments 0-1 exactly
    pts = np.array(pts)
    g = np.gradient(pts, axis=0)
    head = np.arctan2(g[:, 1], g[:, 0])
    mem, cov, newf, naive = {}, [], [], []
    for t, (o, h) in enumerate(zip(pts, head)):
        V, nh = cast(o, h + np.linspace(-fov / 2, fov / 2, n_rays))
        new = [v for v in V if v not in mem]
        newf.append(len(new) / max(1, len(V)))
        mem.update({v: t for v in new})
        cov.append(len(mem) / len(surfels))
        naive.append(nh + (naive[-1] if naive else 0))
    lap = np.array(lap)
    i0, i1 = np.flatnonzero(lap)[[0, -1]]
    print(f"coverage toy: {len(pts)} frames, {len(surfels)} surfels, final coverage {cov[-1]:.2f}, "
          f"coverage before/after revisit {cov[i0]:.2f}/{cov[i1]:.2f}, naive primitives {naive[-1]}, "
          f"deduplicated {len(mem)}, mean new fraction exploring {np.mean(np.array(newf)[1:][~lap[1:]]):.3f}")
    return dict(seg=seg, L=L, vox=vox, pts=pts, mem=mem, surfels=surfels, cov=np.array(cov),
                newf=np.array(newf), naive=np.array(naive), lap=(i0, i1))


def fig_coverage():
    d = coverage_toy()
    T = len(d["pts"])
    fig = plt.figure(figsize=(10, 9.2))
    gs = fig.add_gridspec(2, 2, height_ratios=[1.05, 1], hspace=0.35, wspace=0.35)
    ax = fig.add_subplot(gs[0, :])
    cmap = plt.get_cmap("viridis")
    for (j, k) in d["surfels"]:
        a, b = d["seg"][j]
        u0, u1 = k * d["vox"] / d["L"][j], min(1.0, (k + 1) * d["vox"] / d["L"][j])
        p0, p1 = a + u0 * (b - a), a + u1 * (b - a)
        t = d["mem"].get((j, k))
        ax.plot([p0[0], p1[0]], [p0[1], p1[1]], lw=5, solid_capstyle="butt",
                color="#cccccc" if t is None else cmap(t / T))
    pts = d["pts"]
    ax.scatter(pts[:, 0], pts[:, 1], c=np.arange(T) / T, cmap="viridis", s=4, zorder=3)
    ax.scatter([pts[0, 0]], [pts[0, 1]], s=90, color=C["dark"], zorder=4)
    ax.set_aspect("equal")
    ax.set_xlim(-0.4, 24.4)
    ax.set_ylim(-0.4, 12.4)
    ax.set_xticks([0, 6, 12, 18, 24])
    ax.set_yticks([0, 6, 12])
    ax.grid(False)
    sm = plt.cm.ScalarMappable(cmap="viridis", norm=plt.Normalize(0, T))
    cb = fig.colorbar(sm, ax=ax, fraction=0.03, pad=0.02)
    cb.set_label(r"$t$")
    i0, i1 = d["lap"]
    t = np.arange(T)
    a1 = fig.add_subplot(gs[1, 0])
    a2 = fig.add_subplot(gs[1, 1])
    for a in (a1, a2):
        a.axvspan(i0, i1, color="#f0f0f0", zorder=0)
        a.set_xlabel(r"$t$")
        a.set_xlim(0, T)
    a1.text((i0 + i1) / 2, 0.9, "↺", ha="center", fontsize=20, color="#666666")
    a1.plot(t, d["cov"], color=C["y"], lw=3, label=r"$C_t$")
    kern = np.ones(15) / 15
    a1.plot(t[1:], np.convolve(d["newf"][1:], kern, mode="same"), color=C["z"], lw=2.2, label=r"$f^{new}_t$")
    a1.set_ylim(0, 1)
    a1.legend(loc="center right", fontsize=13)
    a2.plot(t, d["naive"], color=C["x"], lw=3, label=r"$O(T)$")
    nm = np.array([sum(1 for v in d["mem"].values() if v <= tt) for tt in t])
    a2.plot(t, nm, color=C["y"], lw=3, label=r"$O(|A|)$")
    a2.set_yscale("log")
    a2.set_ylim(50, 1e5)
    a2.set_ylabel(r"$N_{prim}$")
    a2.legend(loc="lower right", fontsize=13)
    save(fig, OUT / "04-update-coverage.svg")


if __name__ == "__main__":
    if len(sys.argv) > 1:                         # e.g.  python3 world_models_updates.py fig_coverage
        for name in sys.argv[1:]:
            globals()[name]()
        sys.exit()
    fig_offline_imagination()
    fig_revisit()
    fig_coverage()
    fig_dreamer4()
    fig_forcing()
    fig_exposure_toy()
    fig_memory()
    fig_memory_growth()
    fig_benchmarks()
    fig_sigreg_toy()
