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
Note: the SVGs committed with the update were hand-written stand-ins with the same content, because the
authoring session had no Python runtime. Running this script replaces them with matplotlib output.
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


if __name__ == "__main__":
    fig_dreamer4()
    fig_forcing()
    fig_exposure_toy()
    fig_memory()
    fig_memory_growth()
    fig_benchmarks()
