"""Figures for embodied-ai post 04 (imitation learning).

The diffusion figures train the post's own Diffusion Policy toy (same code, same seed; about 20 s on
a CPU) and then record the reverse process. The covariate-shift figure runs behaviour cloning and
DAgger on a small path-following task with an RBF policy.

    python3 bin/figures/embodied-ai/embodied-ai_04.py
"""
import math
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401
plt.rcParams["svg.hashsalt"] = "embodied-ai"  # deterministic SVG ids, so regenerated files do not churn
from matplotlib.patches import Circle, FancyBboxPatch, Rectangle  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/embodied-ai"


# ================================================================= diagrams
def box(ax, xy, w, h, text, fc, fs=14):
    ax.add_patch(FancyBboxPatch(xy, w, h, boxstyle="round,pad=0.02,rounding_size=0.08", fc=fc, ec=C["dark"], lw=1.6))
    lines = text.split("\n")
    for i, ln in enumerate(lines):
        ax.text(xy[0] + w / 2, xy[1] + h / 2 + ((len(lines) - 1) / 2 - i) * 0.38, ln, ha="center", va="center", fontsize=fs)


def arrow(ax, a, b, color=C["dark"], rad=0.0, lw=2.2):
    ax.annotate("", xy=b, xytext=a, arrowprops=dict(arrowstyle="-|>", lw=lw, color=color, shrinkA=2, shrinkB=2,
                                                     connectionstyle=f"arc3,rad={rad}"))


def fig_dagger_loop():
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)
        fig, ax = plt.subplots(figsize=(9, 5.4))
        ax.set_xlim(0, 10); ax.set_ylim(0, 6); ax.axis("off")
        box(ax, (0.2, 4.1), 2.9, 1.5, L("expert demos\nD", "专家示范\nD", "専門家のデモ\nD"), "#fdf0df")
        box(ax, (3.6, 4.1), 2.9, 1.5, L("train policy\non D", "在 D 上\n训练策略", "D で方策を\n学習"), "#efe7fb")
        box(ax, (7.0, 4.1), 2.8, 1.5, L("run the policy:\nits own states", "运行策略：\n它自己的状态", "方策を実行：\n自分が訪れる状態"), "#e9f6e7")
        box(ax, (7.0, 0.5), 2.8, 1.5, L("expert labels\nthose states", "专家标注\n这些状态", "専門家がその\n状態にラベル付け"), "#e3f2fb")
        box(ax, (3.6, 0.5), 2.9, 1.5, L("aggregate\nD = D + new", "聚合\nD = D + 新数据", "集約\nD = D + 新データ"), "#fdf0df")
        arrow(ax, (3.15, 4.85), (3.55, 4.85)); arrow(ax, (6.55, 4.85), (6.95, 4.85))
        arrow(ax, (8.4, 4.05), (8.4, 2.05)); arrow(ax, (6.95, 1.25), (6.55, 1.25)); arrow(ax, (5.05, 2.05), (5.05, 4.05))
        ax.text(5.25, 3.05, L("repeat", "重复", "繰り返す"), fontsize=14, color=C["gray"], style="italic")
        ax.text(0.25, 2.6, L("plain BC stops after\nthe first training step:\nit never sees its own\nmistakes", "普通 BC 在第一次训练后\n就停止了：它从未见过\n自己犯错后的状态",
                             "通常の BC は最初の学習で\n終わるので、自分の\n誤りの後の状態を\n一度も見ません"),
                fontsize=13, color=C["x"], va="center")
        save(fig, OUT / f"04-dagger-loop_{lang}.svg")


def fig_data_pipeline():
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)
        fig, ax = plt.subplots(figsize=(10, 5.0))
        ax.set_xlim(0, 11); ax.set_ylim(0, 5.6); ax.axis("off")
        ys = (4.1, 2.45, 0.8)
        names = (L("leader arms\n(ALOHA, GELLO)", "主从臂\n（ALOHA、GELLO）", "リーダーアーム\n（ALOHA、GELLO）"),
                 L("VR / AR hand\ntracking", "VR / AR\n手部追踪", "VR / AR の\nハンドトラッキング"),
                 L("hand-held gripper\n(UMI)", "手持式夹爪\n（UMI）", "手持ちグリッパ\n（UMI）"))
        for y, n in zip(ys, names):
            box(ax, (0.1, y), 2.6, 1.2, n, "#fdf0df", fs=13)
            arrow(ax, (2.75, y + 0.6), (3.55, 2.95))
        box(ax, (3.6, 2.2), 2.4, 1.5, L("synchronized\nrecording", "同步记录", "同期して\n記録") + "\n50 Hz", "#efe7fb", fs=13)
        box(ax, (6.5, 2.2), 1.9, 1.5, L("dataset", "数据集", "データセット") + "\n$(o_t, a_t)$", "#e3f2fb", fs=13)
        box(ax, (8.9, 3.6), 2.0, 1.3, L("train policy", "训练策略", "方策の学習"), "#efe7fb", fs=13)
        box(ax, (8.9, 0.9), 2.0, 1.3, L("robot", "机器人", "ロボット"), "#e9f6e7", fs=13)
        arrow(ax, (6.05, 2.95), (6.45, 2.95)); arrow(ax, (8.45, 3.2), (8.85, 4.0)); arrow(ax, (9.9, 3.55), (9.9, 2.25))
        ax.text(5.5, 0.35, L("same observation (cameras) and same action (EE pose, gripper) on both sides",
                             "两侧使用相同的观测（相机）和相同的动作（末端位姿、夹爪）",
                             "両側で同じ観測（カメラ）と同じ行動（手先姿勢・グリッパ）を使う"),
                ha="center", fontsize=13, color=C["gray"], style="italic")
        save(fig, OUT / f"04-data-pipeline_{lang}.svg")


# ================================================================= covariate shift: BC vs DAgger
DT, SPEED, NSTEP = 1.0, 0.04, 100


def y_ref(x):
    return 0.35 * np.sin(2 * np.pi * x / 2.0)


def expert(x, y):
    """Feedback plus feed-forward: move halfway back to the path and follow its slope."""
    return 0.5 * (y_ref(x + SPEED) - y) + (y_ref(x + SPEED) - y_ref(x))


CX = np.linspace(0, 4.2, 43); CE = np.linspace(-0.25, 0.25, 21)
DEMO_NOISE, RUN_NOISE = 0.002, 0.015  # clean demonstrations, noisier deployment


def feats(x, y):
    e = y - y_ref(x)
    fx = np.exp(-((x[:, None] - CX[None]) ** 2) / (2 * 0.06 ** 2))
    fe = np.exp(-((e[:, None] - CE[None]) ** 2) / (2 * 0.015 ** 2))
    return (fx[:, :, None] * fe[:, None, :]).reshape(len(x), -1)


def fit(X, Y):
    F = feats(X[:, 0], X[:, 1])
    return np.linalg.solve(F.T @ F + 1e-3 * np.eye(F.shape[1]), F.T @ Y)


def rollout(policy, rng, noise=RUN_NOISE, n=NSTEP):
    x, y = 0.0, 0.0; xs, ys = [x], [y]
    for _ in range(n):
        u = policy(np.array([x]), np.array([y]))[0]
        x += SPEED; y += u + rng.normal(0, noise)
        xs.append(x); ys.append(y)
    return np.array(xs), np.array(ys)


def fig_covariate_shift():
    rng = np.random.default_rng(0)
    X, Y = [], []
    for _ in range(10):  # expert demonstrations with small execution noise
        xs, ys = rollout(lambda x, y: expert(x, y), rng, noise=DEMO_NOISE)
        X += list(zip(xs[:-1], ys[:-1])); Y += list(expert(xs[:-1], ys[:-1]))
    X, Y = np.array(X), np.array(Y)
    results = {}
    W = fit(X, Y)
    pol = lambda W: (lambda x, y: feats(x, y) @ W)
    results[0] = [rollout(pol(W), np.random.default_rng(100 + i)) for i in range(20)]
    Xa, Ya = X.copy(), Y.copy()
    for it in range(1, 6):  # DAgger: label the learner's own states with the expert
        for i in range(10):
            xs, ys = rollout(pol(W), np.random.default_rng(1000 * it + i))
            Xa = np.vstack([Xa, np.stack([xs[:-1], ys[:-1]], 1)]); Ya = np.concatenate([Ya, expert(xs[:-1], ys[:-1])])
        W = fit(Xa, Ya)
        results[it] = [rollout(pol(W), np.random.default_rng(100 + i)) for i in range(20)]
    err = {k: np.mean([np.abs(ys - y_ref(xs)) for xs, ys in v], axis=0) for k, v in results.items()}
    ex = [rollout(lambda x, y: expert(x, y), np.random.default_rng(100 + i)) for i in range(20)]
    err["expert"] = np.mean([np.abs(ys - y_ref(xs)) for xs, ys in ex], axis=0)
    for k in results:
        print(f"DAgger iteration {k}: mean |error| over the episode {err[k].mean():.3f}, at the end {err[k][-1]:.3f}")
    fig, axs = plt.subplots(2, 1, figsize=(9, 9.2), gridspec_kw=dict(height_ratios=[1.15, 1]))
    ax = axs[0]
    xx = np.linspace(0, 4, 400)
    ax.fill_between(xx, y_ref(xx) - 0.03, y_ref(xx) + 0.03, color=C["gray"], alpha=0.25, lw=0)
    ax.plot(xx, y_ref(xx), color=C["dark"], lw=2.5, label="expert path")
    ax.scatter(X[::3, 0], X[::3, 1], s=4, color=C["dark"], alpha=0.5)
    for i, (xs, ys) in enumerate(results[0][:8]):
        ax.plot(xs, ys, color=C["x"], lw=1.6, alpha=0.8, label="BC rollouts" if i == 0 else None)
    for i, (xs, ys) in enumerate(results[5][:8]):
        ax.plot(xs, ys, color=C["z"], lw=1.6, alpha=0.8, label="after 5 DAgger iterations" if i == 0 else None)
    ax.set_xlim(0, 4); ax.set_ylim(-0.9, 0.9)
    ax.set_xlabel("$x$"); ax.set_ylabel("$y$"); ax.legend(fontsize=13, loc="lower left", ncol=1)
    ax = axs[1]
    cm = plt.get_cmap("viridis")
    for k in results:
        if k in (2, 4):
            continue
        ax.plot(np.arange(NSTEP + 1), err[k], color=C["x"] if k == 0 else cm(k / 6), lw=2.6 if k in (0, 5) else 1.6,
                label="BC" if k == 0 else f"DAgger {k}")
    ax.plot(np.arange(NSTEP + 1), err["expert"], color=C["dark"], lw=1.8, ls="--", label="expert")
    ax.set_yscale("log"); ax.set_ylim(1e-3, 1.5)
    ax.set_xlabel("time step $t$"); ax.set_ylabel(r"mean $\vert y_t - y_{\mathrm{ref}}(x_t)\vert$")
    ax.legend(fontsize=12.5, ncol=3, loc="upper left")
    fig.tight_layout()
    save(fig, OUT / "04-covariate-shift.svg")


# ================================================================= the post's Diffusion Policy toy (verbatim) + recording
def train_post_model():
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    torch.set_num_threads(4)
    torch.manual_seed(0)
    H, A, O = 8, 2, 2
    K = 100

    def make_demos(n):
        obs = torch.randn(n, O) * 0.05
        side = torch.randint(0, 2, (n, 1)).float() * 2 - 1
        t = torch.linspace(0, 1, H)
        x = t.expand(n, H)
        y = side * torch.sin(math.pi * t) * 0.5
        act = torch.stack([x, y], -1) + obs[:, None, :]
        return obs, act

    s = 0.008
    f = torch.cos((torch.arange(K + 1) / K + s) / (1 + s) * math.pi / 2) ** 2
    alpha_bar = (f / f[0])[1:]
    alphas = alpha_bar / torch.cat([torch.ones(1), alpha_bar[:-1]])
    betas = (1 - alphas).clamp(max=0.999)

    class NoisePredictor(nn.Module):
        def __init__(self, hidden=256):
            super().__init__()
            self.net = nn.Sequential(nn.Linear(H * A + O + 32, hidden), nn.Mish(),
                                     nn.Linear(hidden, hidden), nn.Mish(),
                                     nn.Linear(hidden, H * A))

        def forward(self, a_noisy, k, obs):
            freqs = torch.exp(torch.arange(16) * (-math.log(1000.0) / 16))
            emb = k[:, None].float() * freqs[None]
            emb = torch.cat([emb.sin(), emb.cos()], -1)
            x = torch.cat([a_noisy.flatten(1), obs, emb], -1)
            return self.net(x).view(-1, H, A)

    def train_step(model, opt, obs, act):
        B = act.shape[0]
        k = torch.randint(0, K, (B,))
        eps = torch.randn_like(act)
        ab = alpha_bar[k].view(B, 1, 1)
        a_noisy = ab.sqrt() * act + (1 - ab).sqrt() * eps
        loss = F.mse_loss(model(a_noisy, k, obs), eps)
        opt.zero_grad(); loss.backward(); opt.step()
        return loss.item()

    model = NoisePredictor()
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-6)
    bc = nn.Sequential(nn.Linear(O, 256), nn.Mish(), nn.Linear(256, H * A))
    opt_bc = torch.optim.Adam(bc.parameters(), lr=1e-3)
    for it in range(3000):
        obs, act = make_demos(256)
        loss = train_step(model, opt, obs, act)
        l_bc = F.mse_loss(bc(obs).view(-1, H, A), act)
        opt_bc.zero_grad(); l_bc.backward(); opt_bc.step()
    print(f"trained: diffusion loss {loss:.4f}, BC loss {l_bc.item():.4f}")

    @torch.no_grad()
    def sample_record(obs, keep):
        a = torch.randn(obs.shape[0], H, A)
        rec = {K: a.clone()}
        for k in reversed(range(K)):
            kk = torch.full((obs.shape[0],), k)
            eps = model(a, kk, obs)
            a = (a - betas[k] / (1 - alpha_bar[k]).sqrt() * eps) / alphas[k].sqrt()
            if k > 0:
                a = a + betas[k].sqrt() * torch.randn_like(a)
            if k in keep:
                rec[k] = a.clone()
        return rec

    torch.manual_seed(1)
    rec = sample_record(torch.zeros(400, O), keep={30, 15, 5, 0})
    with torch.no_grad():
        bc_pred = bc(torch.zeros(1, O)).view(H, A).numpy()
    torch.manual_seed(2)
    demo_obs, demos = make_demos(200)
    return dict(rec={k: v.numpy() for k, v in rec.items()}, bc=bc_pred, demos=demos.numpy(),
                alpha_bar=alpha_bar.numpy(), H=H)


def fig_diffusion(res):
    rec, demos, ab, H = res["rec"], res["demos"], res["alpha_bar"], res["H"]
    mid = rec[0][:, H // 2, 1]
    print(f"figure samples: fraction left {np.mean(mid < -0.25):.2f}, right {np.mean(mid > 0.25):.2f}, "
          f"mean |y| {np.abs(mid).mean():.3f}; BC mid y {res['bc'][H // 2, 1]:.3f}")
    # ---- forward process on demonstration chunks
    rng = np.random.default_rng(0)
    fig = plt.figure(figsize=(10, 7.6))
    gs = fig.add_gridspec(2, 4, height_ratios=[1, 0.9])
    for j, k in enumerate((0, 20, 50, 100)):
        ax = fig.add_subplot(gs[0, j])
        a0 = demos[:40]
        if k == 0:
            ak = a0
        else:
            abk = ab[k - 1]
            ak = np.sqrt(abk) * a0 + np.sqrt(1 - abk) * rng.standard_normal(a0.shape)
        for c in ak:
            ax.plot(c[:, 0], c[:, 1], "-o", ms=2.5, lw=1, color=C["a"], alpha=0.55)
        ax.set_xlim(-2.8, 3.8); ax.set_ylim(-3.3, 3.3); ax.set_aspect("equal")
        ax.set_title(f"$k={k}$" + ("" if k == 0 else f"\n$\\bar\\alpha_k={ab[k - 1]:.3f}$"), fontsize=14)
        ax.set_xticks([0, 1]); ax.set_yticks([-2, 0, 2] if j == 0 else [])
        if j == 0:
            ax.set_ylabel("$y$")
        ax.set_xlabel("$x$")
    ax = fig.add_subplot(gs[1, :])
    ks = np.arange(1, 101)
    ax.plot(ks, ab, color=C["a"], label=r"$\bar\alpha_k$ (signal)")
    ax.plot(ks, 1 - ab, color=C["b"], label=r"$1-\bar\alpha_k$ (noise variance)")
    ax.set_xlabel("diffusion step $k$"); ax.legend(fontsize=13); ax.set_title("cosine schedule, $K=100$", fontsize=15)
    fig.tight_layout()
    save(fig, OUT / "04-diffusion-forward.svg")
    # ---- reverse process with the trained model
    fig, axs = plt.subplots(1, 5, figsize=(10.5, 3.9), sharey=True)
    for ax, k in zip(axs, (100, 30, 15, 5, 0)):
        a = rec[k][:60]
        side = np.sign(rec[0][:60, H // 2, 1])
        for c, sd in zip(a, side):
            ax.plot(c[:, 0], c[:, 1], "-", lw=1, color=C["z"] if sd < 0 else C["b"], alpha=0.5)
        ax.set_title(f"$k={k}$", fontsize=15)
        ax.set_xlim(-2.5, 3.5); ax.set_ylim(-3, 3)
        ax.set_xticks([0, 1])
    axs[0].set_ylabel("$y$")
    axs[-1].plot(res["bc"][:, 0], res["bc"][:, 1], "-o", color=C["x"], lw=2.5, ms=4)
    axs[-1].text(0.0, -1.0, "MSE BC", color=C["x"], fontsize=13)
    fig.tight_layout()
    save(fig, OUT / "04-diffusion-reverse.svg")
    # ---- multimodality picture
    fig, axs = plt.subplots(1, 2, figsize=(10, 4.8), gridspec_kw=dict(width_ratios=[1.35, 1]))
    ax = axs[0]
    ax.add_patch(Circle((0.5, 0.0), 0.22, color=C["gray"], alpha=0.5))
    for c in demos[:60]:
        ax.plot(c[:, 0], c[:, 1], "-", lw=1.2, color=C["dark"], alpha=0.35)
    samp = rec[0][:40]
    for c in samp:
        ax.plot(c[:, 0], c[:, 1], "-", lw=1.4, color=C["a"], alpha=0.55)
    ax.plot(res["bc"][:, 0], res["bc"][:, 1], "-o", color=C["x"], lw=3, ms=5)
    ax.plot([], [], color=C["dark"], label="demonstrations")
    ax.plot([], [], color=C["a"], label="Diffusion Policy samples")
    ax.plot([], [], "-o", color=C["x"], label="MSE behaviour cloning")
    ax.set_aspect("equal"); ax.set_xlim(-0.15, 1.15); ax.set_ylim(-0.7, 1.15)
    ax.set_xlabel("$x$"); ax.set_ylabel("$y$"); ax.legend(fontsize=12, loc="upper center", framealpha=0.95, ncol=1)
    ax.text(0.5, -0.12, "obstacle", ha="center", va="center", fontsize=12)
    ax = axs[1]
    bins = np.linspace(-0.8, 0.8, 41)
    ax.hist(demos[:, H // 2, 1], bins=bins, color=C["dark"], alpha=0.35, density=True, label="demos")
    ax.hist(mid, bins=bins, color=C["a"], alpha=0.55, density=True, label="diffusion")
    ax.axvline(res["bc"][H // 2, 1], color=C["x"], lw=3, label="MSE BC")
    ax.set_xlabel(r"lateral offset $y$ at step $H/2$"); ax.set_ylabel("density")
    ax.legend(fontsize=12, loc="upper center")
    fig.tight_layout()
    save(fig, OUT / "04-multimodal.svg")


# ================================================================= action chunking and temporal ensembling
def fig_chunking():
    rng = np.random.default_rng(3)
    Tn, k, m = 60, 10, 0.1
    t = np.arange(Tn + k)
    truth = np.sin(2 * np.pi * t / 40) + 0.3 * np.sin(2 * np.pi * t / 13)
    preds = {}
    for s in range(Tn):  # chunk predicted at step s for steps s..s+k-1: truth + an error that grows along the chunk
        i = np.arange(k)
        preds[s] = truth[s:s + k] + rng.normal(0, 0.12) + rng.normal(0, 0.05) * i
    # execute every chunk to the end (replan every k steps) versus temporal ensembling (query every step)
    chunked = np.concatenate([preds[s] for s in range(0, Tn, k)])[:Tn]
    ens = []
    for tt in range(Tn):
        srcs = [s for s in range(max(0, tt - k + 1), tt + 1)]          # oldest first, i = 0 is the oldest
        vals = np.array([preds[s][tt - s] for s in srcs])
        w = np.exp(-m * np.arange(len(srcs)))
        ens.append(np.sum(w * vals) / np.sum(w))
    ens = np.array(ens)
    print("chunking: mean |jump| between steps, chunked %.3f, ensembled %.3f, truth %.3f" % (
        np.abs(np.diff(chunked)).mean(), np.abs(np.diff(ens)).mean(), np.abs(np.diff(truth[:Tn])).mean()))
    fig, axs = plt.subplots(2, 1, figsize=(9.5, 8.5), sharex=True)
    ax = axs[0]
    cm = plt.get_cmap("viridis")
    for s in range(0, Tn, 1):
        ax.plot(np.arange(s, s + k), preds[s], color=cm(s / Tn), lw=1, alpha=0.6)
    ax.plot(t[:Tn + k], truth, color=C["dark"], lw=2.2, ls="--", label="ideal action")
    tt = 30
    for s in range(tt - k + 1, tt + 1):
        ax.plot(tt, preds[s][tt - s], "o", ms=6, color=C["x"], zorder=5)
    ax.axvline(tt, color=C["x"], lw=1, ls=":")
    ax.text(tt + 0.7, 1.55, f"$k={k}$ predictions for $t={tt}$", color=C["x"], fontsize=14)
    ax.set_ylabel("action"); ax.legend(fontsize=13, loc="lower left")
    ax.set_title("a new chunk of $k = 10$ actions is predicted at every step", fontsize=15)
    ax.set_ylim(-1.9, 1.9)
    ax = axs[1]
    ax.plot(t[:Tn], truth[:Tn], color=C["dark"], lw=2.2, ls="--", label="ideal action")
    ax.plot(t[:Tn], chunked, color=C["b"], lw=2, drawstyle="default", label="execute each chunk fully")
    ax.plot(t[:Tn], ens, color=C["a"], lw=2.6, label=r"temporal ensemble, $w_i=e^{-0.1 i}$")
    for s in range(0, Tn, k):
        ax.axvline(s, color=C["b"], lw=0.8, ls=":")
    ax.set_xlabel("time step $t$"); ax.set_ylabel("executed action"); ax.legend(fontsize=13, loc="lower left")
    ax.set_ylim(-1.9, 1.9)
    fig.tight_layout()
    save(fig, OUT / "04-temporal-ensembling.svg")


def fig_receding_horizon():
    To, Tp, Ta = 2, 16, 8
    fig, ax = plt.subplots(figsize=(10, 4.2))
    ax.set_xlim(-4.2, 25); ax.set_ylim(-1.0, 4.4); ax.axis("off")
    for (yo, t0) in ((2.6, 0), (0.5, Ta)):
        for tau in range(t0 - To + 1, t0 + 1):                # observation window
            ax.add_patch(Rectangle((tau - 0.45, yo + 0.75), 0.9, 0.45, fc=C["c"], ec="white"))
        for i in range(Tp):                                   # predicted chunk, first Ta executed
            ax.add_patch(Rectangle((t0 + i - 0.45, yo), 0.9, 0.65, fc=C["a"] if i < Ta else C["fill"], ec="white"))
        ax.text(t0 - To - 0.2, yo + 0.5, f"$t={t0}$", ha="right", va="center", fontsize=15)
    ax.text(-1.5 + 0.0, 3.85, r"$T_o=2$", ha="center", fontsize=14, color=C["c"])
    ax.annotate("", xy=(Tp - 0.5, 4.05), xytext=(-0.5, 4.05), arrowprops=dict(arrowstyle="<->", lw=1.5))
    ax.text((Tp - 1) / 2, 4.15, r"$T_p = 16$ predicted", ha="center", fontsize=14)
    ax.annotate("", xy=(Ta - 0.5, 2.4), xytext=(-0.5, 2.4), arrowprops=dict(arrowstyle="<->", lw=1.5, color=C["a"]))
    ax.text((Ta - 1) / 2, 2.0, r"$T_a = 8$ executed", ha="center", fontsize=14, color=C["a"])
    ax.annotate("", xy=(Ta, 1.75), xytext=(Ta - 0.5, 2.55), arrowprops=dict(arrowstyle="-|>", lw=1.8, color=C["x"]))
    for tau in range(0, 25, 4):
        ax.text(tau, -0.6, str(tau), ha="center", fontsize=13, color=C["gray"])
    ax.text(24.6, -0.6, "t", fontsize=13, color=C["gray"])
    save(fig, OUT / "04-receding-horizon.svg")


if __name__ == "__main__":
    fig_dagger_loop()
    fig_data_pipeline()
    fig_covariate_shift()
    fig_chunking()
    fig_receding_horizon()
    fig_diffusion(train_post_model())
