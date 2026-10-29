"""Figures for world-models post 02 (the generative toolkit).

Run:  python3 bin/figures/world-models/world_models_02.py
Needs numpy, matplotlib and torch (CPU, about two minutes). Writes assets/img/blog/world-models/02-*.svg.
The 2D toy is the post's own: a mixture of 8 Gaussians (radius 2, std 0.1) with the DDPM linear
schedule beta = linspace(1e-4, 0.02, 1000). The DDPM is trained with the post's code; the
classifier-free guidance and flow-matching figures use the exact (analytic) score / velocity of
this mixture, so they show the ideal fields a network would learn.
"""
import math

from wm_common import *  # noqa: F401,F403
from matplotlib.patches import Ellipse, Rectangle

import torch
import torch.nn as nn

BETAS, ALPHAS, AB = ddpm_schedule()
T = 1000
RNG = np.random.default_rng(0)
LIM = 3.2


def toy_ax(ax, lim=LIM, ticks=True):
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_aspect("equal")
    if not ticks:
        ax.set_xticks([]); ax.set_yticks([])


def modes(ax, **kw):
    ax.scatter(CENTERS8[:, 0], CENTERS8[:, 1], marker="+", s=90, color=C["dark"], lw=1.6, zorder=5, **kw)


# ============================================================ VAE on a toy 1D "image" dataset
def vae_data(n, rng):
    """16-pixel signals with one Gaussian bump: position c in [3, 13], width w in [0.8, 2.5]."""
    c = rng.uniform(3, 13, n); w = rng.uniform(0.8, 2.5, n)
    u = np.arange(16)
    return np.exp(-0.5 * ((u[None] - c[:, None]) / w[:, None]) ** 2), c, w


def train_vae(beta, steps=4000, seed=0):
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    enc = nn.Sequential(nn.Linear(16, 128), nn.ReLU(), nn.Linear(128, 128), nn.ReLU(), nn.Linear(128, 4))
    dec = nn.Sequential(nn.Linear(2, 128), nn.ReLU(), nn.Linear(128, 128), nn.ReLU(), nn.Linear(128, 16))
    opt = torch.optim.Adam([*enc.parameters(), *dec.parameters()], lr=1e-3)
    sx = 0.1  # decoder std: -ln p(x|z) = |x - xhat|^2 / (2 sx^2) + const
    for i in range(steps):
        x = torch.tensor(vae_data(256, rng)[0], dtype=torch.float32)
        mu, logvar = enc(x).chunk(2, -1)
        z = mu + torch.exp(0.5 * logvar) * torch.randn_like(mu)          # reparameterization
        rec = ((dec(z) - x) ** 2).sum(-1) / (2 * sx ** 2)
        kl = 0.5 * (mu ** 2 + logvar.exp() - 1 - logvar).sum(-1)
        loss = (rec + beta * kl).mean()
        opt.zero_grad(); loss.backward(); opt.step()
    print(f"VAE beta={beta}: rec {rec.mean().item():.2f}  KL {kl.mean().item():.2f}")
    return enc, dec


def fig_vae():
    fig, axs = plt.subplots(1, 2, figsize=(10, 5.0))
    rng = np.random.default_rng(5)
    xt, c, w = vae_data(70, rng)
    for ax, beta in zip(axs, [1.0, 0.05]):
        enc, dec = train_vae(beta)
        with torch.no_grad():
            mu, logvar = enc(torch.tensor(xt, dtype=torch.float32)).chunk(2, -1)
        mu, sd = mu.numpy(), np.exp(0.5 * logvar.numpy())
        cmap = plt.get_cmap("viridis")
        for i in range(len(mu)):
            col = cmap((c[i] - 3) / 10)
            ax.add_patch(Ellipse(mu[i], 2 * sd[i, 0], 2 * sd[i, 1], fc=col, ec=col, alpha=0.25, lw=1.2))
        sc = ax.scatter(mu[:, 0], mu[:, 1], c=c, cmap="viridis", vmin=3, vmax=13, s=18, zorder=3)
        ax.add_patch(Ellipse((0, 0), 2, 2, fc="none", ec=C["dark"], lw=1.8, ls="--"))
        ax.add_patch(Ellipse((0, 0), 4, 4, fc="none", ec=C["gray"], lw=1.2, ls=":"))
        ax.set_xlim(-3, 3); ax.set_ylim(-3, 3); ax.set_aspect("equal")
        ax.set_xlabel("$z_1$"); ax.set_title(f"$\\beta = {beta:g}$, KL = {0.5 * (mu ** 2 + sd ** 2 - 1 - 2 * np.log(sd)).sum(1).mean():.1f} nats")
    axs[0].set_ylabel("$z_2$")
    cb = fig.colorbar(sc, ax=axs, shrink=0.8, pad=0.02)
    cb.set_label("bump position $c$")
    save(fig, out("02-vae-latent.svg"))


def fig_reparam(lang):
    fig, ax = diagram(10, 3.8)
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    x = circ(ax, 0.6, 1.9, "$x$", r=0.4, fc="#d4e6f5", ec=C["z"], fs=18)
    enc = box(ax, 2.5, 1.9, T_("encoder", "编码器", "エンコーダ") + "\n$q_\\phi$", w=1.6, h=1.2)
    mu = circ(ax, 4.5, 2.7, "$\\mu$", r=0.38, fs=18)
    sg = circ(ax, 4.5, 1.1, "$\\sigma$", r=0.38, fs=18)
    eps = circ(ax, 6.2, 0.45, "$\\epsilon$", r=0.38, fc="#fdebd3", ec=C["b"], fs=18, ls="--")
    z = circ(ax, 6.2, 1.9, "$z$", r=0.42, fs=18)
    dec = box(ax, 8.1, 1.9, T_("decoder", "解码器", "デコーダ") + "\n$p_\\theta$", w=1.6, h=1.2)
    arrow(ax, x, enc); arrow(ax, enc, mu); arrow(ax, enc, sg)
    arrow(ax, mu, z, text="$+$", toff=(0, 0.25)); arrow(ax, sg, z, text="$\\odot$", toff=(-0.25, 0.1))
    arrow(ax, eps, z, color=C["b"], ls="--")
    arrow(ax, z, dec)
    ax.text(6.2, -0.2, "$\\epsilon\\sim\\mathcal{N}(0,I)$", ha="center", fontsize=15, color=C["b"])
    ax.add_patch(FancyArrowPatch((7.3, 3.25), (2.9, 3.25), arrowstyle="-|>", mutation_scale=15, lw=2.0,
                                 color=C["x"], connectionstyle="arc3,rad=0.12"))
    mltext(ax, 5.2, 3.75, T_("gradient flows through $\\mu$, $\\sigma$", "梯度经由 μ、σ 回传", "勾配は μ, σ を通って流れる")
           if lang != "en" else "gradient flows through $\\mu$ and $\\sigma$", fs=15, color=C["x"])
    ax.set_ylim(-0.6, 4.1)
    save(fig, out(f"02-reparam_{lang}.svg"))


# ============================================================ VQ codebook / Voronoi cells
def fig_vq():
    rng = np.random.default_rng(2)
    # "encoder outputs": a ring plus a blob (2D so we can draw the cells)
    n = 2000
    ang = rng.uniform(0, 2 * np.pi, n)
    ring = np.stack([1.6 * np.cos(ang), 1.0 * np.sin(ang)], 1) + 0.12 * rng.standard_normal((n, 2))
    blob = np.array([0.0, 0.0]) + 0.25 * rng.standard_normal((n // 4, 2))
    ze = np.concatenate([ring, blob])
    K = 12
    e = torch.tensor(rng.uniform(-0.3, 0.3, (K, 2)), dtype=torch.float32, requires_grad=True)
    opt = torch.optim.Adam([e], lr=2e-2)
    Z = torch.tensor(ze, dtype=torch.float32)
    for i in range(1500):
        idx = torch.randint(0, len(Z), (256,))
        zb = Z[idx]
        k = torch.cdist(zb, e).argmin(1)
        loss = ((zb.detach() - e[k]) ** 2).sum(1).mean()   # codebook term ||sg[z_e] - e||^2
        opt.zero_grad(); loss.backward(); opt.step()
        if i % 300 == 0:   # restart dead codes at random encoder outputs (a common practical fix)
            with torch.no_grad():
                used = torch.bincount(torch.cdist(Z, e).argmin(1), minlength=K)
                for j in torch.nonzero(used == 0).flatten():
                    e[j] = Z[torch.randint(0, len(Z), (1,))][0]
    E = e.detach().numpy()
    g = np.linspace(-2.4, 2.4, 400); GX, GY = np.meshgrid(g, g)
    lab = np.argmin(((np.stack([GX, GY], -1)[..., None, :] - E) ** 2).sum(-1), -1)
    fig, ax = plt.subplots(figsize=(8, 6.2))
    ax.imshow(lab, extent=(-2.4, 2.4, -2.4, 2.4), origin="lower", cmap="tab20", alpha=0.35, interpolation="nearest")
    ax.contour(GX, GY, lab, levels=np.arange(K + 1) - 0.5, colors="white", linewidths=1.6)
    ax.scatter(ze[::4, 0], ze[::4, 1], s=4, color=C["gray"], alpha=0.6)
    ax.scatter(E[:, 0], E[:, 1], s=140, color=C["dark"], marker="*", zorder=5)
    for i, j in enumerate(rng.choice(len(ze), 6, replace=False)):
        k = np.argmin(((E - ze[j]) ** 2).sum(1))
        ax.plot(*ze[j], "o", color=C["b"], ms=8, zorder=6)
        ax.annotate("", xy=E[k], xytext=ze[j], arrowprops=dict(arrowstyle="-|>", color=C["b"], lw=2), zorder=6)
    ax.plot([], [], "o", color=C["b"], label="$z_e(x)$ $\\to$ $z_q(x)=e_{k^*}$")
    ax.plot([], [], "*", color=C["dark"], ms=12, label="codebook $e_k$, $K=12$")
    ax.legend(loc="upper right", frameon=True, fontsize=13)
    ax.set_xlim(-2.4, 2.4); ax.set_ylim(-2.4, 2.4); ax.set_aspect("equal")
    save(fig, out("02-vq-voronoi.svg"))


# ============================================================ autoregressive mask with frames + actions
def fig_ar_mask():
    toks = ["f1"] * 4 + ["a1"] + ["f2"] * 4 + ["a2"] + ["f3"] * 4
    names = [f"$x^{{1}}_{i}$" for i in range(1, 5)] + ["$a_1$"] + [f"$x^{{2}}_{i}$" for i in range(1, 5)] + ["$a_2$"] + \
            [f"$x^{{3}}_{i}$" for i in range(1, 5)]
    col = {"f1": C["z"], "f2": C["c"], "f3": C["a"], "a1": C["b"], "a2": C["b"]}
    N = len(toks)
    fig, ax = plt.subplots(figsize=(8.4, 8.4))
    for i in range(N):
        for j in range(N):
            if j <= i:
                ax.add_patch(Rectangle((j, N - 1 - i), 1, 1, fc=col[toks[j]], alpha=0.75, ec="white", lw=1.2))
            else:
                ax.add_patch(Rectangle((j, N - 1 - i), 1, 1, fc="#f3f3f3", ec="white", lw=1.2))
    r = 9  # query row a_2: its output predicts the first token of frame 3
    ax.add_patch(Rectangle((0, N - 1 - r), r + 1, 1, fc="none", ec=C["dark"], lw=2.6))
    ax.set_xticks(np.arange(N) + 0.5); ax.set_xticklabels(names, rotation=90, fontsize=14)
    ax.set_yticks(np.arange(N) + 0.5); ax.set_yticklabels(names[::-1], fontsize=14)
    ax.set_xlim(0, N); ax.set_ylim(0, N); ax.set_aspect("equal"); ax.grid(False)
    ax.set_xlabel("key (attended to)"); ax.set_ylabel("query $i$ (predicts token $i+1$)")
    ax.tick_params(length=0)
    for sp in ax.spines.values():
        sp.set_visible(False)
    save(fig, out("02-ar-mask.svg"))


# ============================================================ forward process + schedule
def fig_forward():
    ts = [0, 50, 100, 200, 400, 999]
    rng = np.random.default_rng(1)
    x0, k = sample8(1500, rng)
    eps = rng.standard_normal(x0.shape)
    fig, axs = plt.subplots(2, 3, figsize=(9, 6.6), sharex=True, sharey=True)
    for ax, t in zip(axs.ravel(), ts):
        ab = AB[t]
        xt = np.sqrt(ab) * x0 + np.sqrt(1 - ab) * eps if t > 0 else x0
        ax.scatter(xt[:, 0], xt[:, 1], s=3, c=k, cmap="tab10", vmin=0, vmax=9, alpha=0.7)
        ax.set_title("data $x_0$" if t == 0 else f"$t={t}$,  $\\bar\\alpha_t={ab:.2f}$", fontsize=15)
        toy_ax(ax)
    save(fig, out("02-forward.svg"))


def fig_schedule():
    t = np.arange(1, T + 1)
    fig, ax = plt.subplots(figsize=(9, 4.4))
    ax.plot(t, np.sqrt(AB), color=C["a"], lw=2.8, label="$\\sqrt{\\bar\\alpha_t}$ (signal)")
    ax.plot(t, np.sqrt(1 - AB), color=C["b"], lw=2.8, label="$\\sqrt{1-\\bar\\alpha_t}$ (noise)")
    ax.plot(t, AB, color=C["a"], lw=1.6, ls="--", label="$\\bar\\alpha_t$")
    ax.plot(t, BETAS / 0.02, color=C["gray"], lw=1.6, ls=":", label="$\\beta_t / 0.02$")
    for tt in [50, 100, 200, 400]:
        ax.axvline(tt, color=C["gray"], lw=0.8, alpha=0.6)
    tc = t[np.argmin(np.abs(AB - 0.5))]
    ax.plot(tc, np.sqrt(0.5), "o", color=C["dark"])
    ax.annotate(f"SNR = 1 at $t\\approx{tc}$", (tc, np.sqrt(0.5)), xytext=(tc + 90, 0.9), fontsize=14,
                arrowprops=dict(arrowstyle="-", color=C["dark"]))
    ax.set_xlabel("timestep $t$"); ax.set_xlim(0, T); ax.set_ylim(0, 1.05)
    ax.legend(frameon=False, loc="center right", fontsize=14)
    print("alpha_bar_T =", AB[-1])
    save(fig, out("02-schedule.svg"))


# ============================================================ train the post's DDPM
def time_embedding(t, dim=32):
    half = dim // 2
    freqs = torch.exp(-math.log(10000.0) * torch.arange(half) / half)
    args = t.float()[:, None] * freqs[None]
    return torch.cat([torch.sin(args), torch.cos(args)], dim=1)


class Denoiser(nn.Module):
    def __init__(self, hidden=256):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(2 + 32, hidden), nn.SiLU(), nn.Linear(hidden, hidden), nn.SiLU(),
                                 nn.Linear(hidden, hidden), nn.SiLU(), nn.Linear(hidden, 2))

    def forward(self, x, t):
        return self.net(torch.cat([x, time_embedding(t)], dim=1))


def train_ddpm(steps=4000):
    torch.manual_seed(0)
    ab_t = torch.tensor(AB, dtype=torch.float32)
    model = Denoiser()
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    rng = np.random.default_rng(0)
    for step in range(steps):
        x0 = torch.tensor(sample8(512, rng)[0], dtype=torch.float32)
        t = torch.randint(0, T, (512,))
        eps = torch.randn_like(x0)
        ab = ab_t[t][:, None]
        loss = ((model(ab.sqrt() * x0 + (1 - ab).sqrt() * eps, t) - eps) ** 2).mean()
        opt.zero_grad(); loss.backward(); opt.step()
    print("DDPM final loss", loss.item())
    return model


def eps_np(model, x, t):
    with torch.no_grad():
        return model(torch.tensor(x, dtype=torch.float32), torch.full((len(x),), int(t))).numpy()


def ddpm_sample(model, n, keep, seed=0):
    rng = np.random.default_rng(seed)
    x = rng.standard_normal((n, 2)); snaps = {}
    traj = [x.copy()]
    for t in reversed(range(T)):
        e = eps_np(model, x, t)
        mean = (x - BETAS[t] / np.sqrt(1 - AB[t]) * e) / np.sqrt(ALPHAS[t])
        x = mean + (np.sqrt(BETAS[t]) * rng.standard_normal(x.shape) if t > 0 else 0)
        traj.append(x.copy())
        if t in keep:
            snaps[t] = x.copy()
    return snaps, np.array(traj)


def ddim_sample(eps_fn, x, steps=50):
    ts = np.linspace(T - 1, 0, steps).round().astype(int)
    traj = [x.copy()]
    for i, t in enumerate(ts):
        ab = AB[t]; ab_prev = AB[ts[i + 1]] if i + 1 < steps else 1.0
        e = eps_fn(x, t)
        x0h = (x - np.sqrt(1 - ab) * e) / np.sqrt(ab)
        x = np.sqrt(ab_prev) * x0h + np.sqrt(1 - ab_prev) * e
        traj.append(x.copy())
    return x, np.array(traj)


def coverage(x):
    d = np.linalg.norm(x[:, None] - CENTERS8[None], axis=-1)
    near = d.min(1) < 0.5
    return near.mean(), len(np.unique(d.argmin(1)[near]))


def fig_reverse(model):
    keep = [999, 600, 300, 150, 50, 0]
    snaps, _ = ddpm_sample(model, 1500, set(keep))
    fig, axs = plt.subplots(2, 3, figsize=(9, 6.6), sharex=True, sharey=True)
    for ax, t in zip(axs.ravel(), keep):
        x = snaps[t]
        ax.scatter(x[:, 0], x[:, 1], s=3, color=C["a"], alpha=0.6)
        modes(ax)
        ax.set_title(f"$x_{{{t}}}$" if t > 0 else "$x_0$ (samples)")
        toy_ax(ax)
    frac, m = coverage(snaps[0])
    print(f"DDPM 1000 steps: {100 * frac:.1f}% near a mode, {m}/8 modes")
    save(fig, out("02-reverse.svg"))
    return frac, m


def fig_score(model):
    ts = [30, 200, 600]
    g = np.linspace(-3, 3, 15); GX, GY = np.meshgrid(g, g); P = np.stack([GX.ravel(), GY.ravel()], 1)
    rng = np.random.default_rng(3)
    x0, _ = sample8(800, rng); eps = rng.standard_normal(x0.shape)
    fig, axs = plt.subplots(2, 3, figsize=(9.6, 6.8), sharex=True, sharey=True)
    for j, t in enumerate(ts):
        ab = AB[t]
        xt = np.sqrt(ab) * x0 + np.sqrt(1 - ab) * eps
        learned = -eps_np(model, P, t)
        exact = np.sqrt(1 - ab) * mix_score(P, ab)        # = -E[eps | x_t]
        for i, (V, name) in enumerate([(learned, "learned"), (exact, "exact")]):
            ax = axs[i, j]
            ax.scatter(xt[:, 0], xt[:, 1], s=2, color=C["gray"], alpha=0.35)
            U = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)   # direction only
            ax.quiver(P[:, 0], P[:, 1], U[:, 0], U[:, 1], color=C["a"] if i == 0 else C["b"],
                      angles="xy", scale_units="xy", scale=3.2, width=0.008)
            toy_ax(ax, lim=3.2)
            if i == 0:
                ax.set_title(f"$t = {t}$")
        cos = (learned * exact).sum(1) / (np.linalg.norm(learned, axis=1) * np.linalg.norm(exact, axis=1) + 1e-9)
        print(f"score t={t}: mean cosine learned vs exact {cos.mean():.3f}")
    axs[0, 0].set_ylabel("$-\\epsilon_\\theta(x_t,t)$")
    axs[1, 0].set_ylabel("$-\\mathbb{E}[\\epsilon\\mid x_t]$")
    save(fig, out("02-score-field.svg"))


def fig_ddim_vs_ddpm(model):
    rng = np.random.default_rng(11)
    starts = rng.standard_normal((6, 2))[[0, 2, 4, 5]] * 1.0
    fig, axs = plt.subplots(1, 2, figsize=(10, 5.0), sharey=True)
    cols = [C["a"], C["b"], C["c"], C["z"], C["x"], C["y"]]
    # DDPM ancestral (stochastic), 1000 steps
    for s, c in zip(starts, cols):
        x = s[None].copy(); tr = [x.copy()]
        r2 = np.random.default_rng(int(abs(s[0]) * 1000))
        for t in reversed(range(T)):
            e = eps_np(model, x, t)
            x = (x - BETAS[t] / np.sqrt(1 - AB[t]) * e) / np.sqrt(ALPHAS[t]) + (np.sqrt(BETAS[t]) * r2.standard_normal(x.shape) if t > 0 else 0)
            tr.append(x.copy())
        tr = np.array(tr)[:, 0]
        axs[0].plot(tr[:, 0], tr[:, 1], color=c, lw=0.8, alpha=0.8)
        axs[0].plot(*tr[0], "o", color=c, ms=7, mec="white"); axs[0].plot(*tr[-1], "s", color=c, ms=7, mec="white")
        _, trd = ddim_sample(lambda x, t: eps_np(model, x, t), s[None].copy(), steps=50)
        trd = trd[:, 0]
        axs[1].plot(trd[:, 0], trd[:, 1], "-", color=c, lw=2.2)
        axs[1].plot(trd[:, 0], trd[:, 1], ".", color=c, ms=4)
        axs[1].plot(*trd[0], "o", color=c, ms=7, mec="white"); axs[1].plot(*trd[-1], "s", color=c, ms=7, mec="white")
    for ax, ttl in zip(axs, ["DDPM, 1000 steps ($\\eta = 1$)", "DDIM, 50 steps ($\\eta = 0$)"]):
        modes(ax); toy_ax(ax); ax.set_title(ttl)
    xs, _ = ddim_sample(lambda x, t: eps_np(model, x, t), np.random.default_rng(0).standard_normal((2000, 2)))
    frac, m = coverage(xs)
    print(f"DDIM 50 steps: {100 * frac:.1f}% near a mode, {m}/8 modes")
    save(fig, out("02-ddim-vs-ddpm.svg"))


# ============================================================ latent diffusion diagram
def fig_ldm(lang):
    fig, ax = diagram(11, 4.6)
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    rng = np.random.default_rng(0)
    img = rng.uniform(0.3, 1, (12, 12, 3)); img[:, :, 2] *= 0.6
    ax.imshow(img, extent=(0.2, 1.8, 1.4, 3.0), zorder=2, interpolation="nearest")
    ax.text(1.0, 1.05, "$x$\n256x256x3", ha="center", va="top", fontsize=14)
    E = box(ax, 2.9, 2.2, "$\\mathcal{E}$", w=0.9, h=1.0, fc="#e3f0fa", ec=C["z"], fs=18)
    for i in range(4):
        ax.add_patch(Rectangle((4.0 + 0.12 * i, 1.75 + 0.12 * i), 0.8, 0.8, fc=plt.get_cmap("Purples")(0.3 + 0.15 * i),
                               ec=C["a"], lw=1.2, zorder=2))
    ax.text(4.55, 1.05, "$z$\n32x32x4", ha="center", va="top", fontsize=14)
    dif = box(ax, 7.0, 2.2, T_("diffusion in latent space", "在潜空间中扩散", "潜在空間での拡散") +
              "\n$\\epsilon_\\theta(z_t, t, \\tau_\\theta(c))$", w=2.9, h=1.3, fc="#fdebd3", ec=C["b"], fs=15)
    D = box(ax, 9.25, 2.2, "$\\mathcal{D}$", w=0.9, h=1.0, fc="#e3f0fa", ec=C["z"], fs=18)
    img2 = box(ax, 10.45, 2.2, "$\\hat x$", w=0.9, h=1.0, fc="white", ec=C["gray"], fs=18)
    cond = box(ax, 7.0, 4.05, T_("condition c", "条件 c", "条件 c"), w=2.0, h=0.75, fc="white", ec=C["y"], fs=15)
    arrow(ax, (1.85, 2.2), E); arrow(ax, E, (3.95, 2.2)); arrow(ax, (5.25, 2.2), dif)
    arrow(ax, dif, D); arrow(ax, D, img2)
    arrow(ax, cond, dif, color=C["y"], text="$\\tau_\\theta$", toff=(0.35, 0), tcolor=C["y"])
    ax.text(2.9, 1.4, T_("trained once", "只训练一次", "一度だけ学習"), ha="center", fontsize=14, color=C["gray"])
    ax.set_ylim(0.0, 4.6); ax.set_xlim(0, 11)
    save(fig, out(f"02-latent-diffusion_{lang}.svg"))


# ============================================================ classifier-free guidance (exact scores)
def guided_eps(x, t, c, w):
    ab = AB[t]
    var = ab * STD8 ** 2 + (1 - ab)
    s_u = mix_score(x, ab)
    s_c = -(x - np.sqrt(ab) * CENTERS8[c]) / var
    s = s_u + w * (s_c - s_u)
    return -np.sqrt(1 - ab) * s


def fig_cfg():
    ws = [0, 1, 3, 7]
    rng = np.random.default_rng(4)
    z = rng.standard_normal((600, 2))
    fig, axs = plt.subplots(2, 4, figsize=(10, 5.6), gridspec_kw=dict(height_ratios=[1, 1]))
    for j, w in enumerate(ws):
        ax, az = axs[0, j], axs[1, j]
        for c in (0, 3):
            x, _ = ddim_sample(lambda x, t: guided_eps(x, t, c, w), z.copy(), steps=200)
            col = C["a"] if c == 0 else C["b"]
            if w == 0:
                col = C["gray"]
            ax.scatter(x[:, 0], x[:, 1], s=3, color=col, alpha=0.5)
            if c == 0:
                az.scatter(x[:, 0], x[:, 1], s=4, color=col, alpha=0.5)
            if w >= 1:
                d = x - CENTERS8[c]
                print(f"CFG w={w} class {c}: mean |x - mu_c| {np.linalg.norm(d, axis=1).mean():.3f}, "
                      f"mean offset {d.mean(0).round(3)}, std {x.std(0).round(3)}")
        modes(ax)
        ax.set_title("unconditional" if w == 0 else f"$w = {w}$")
        toy_ax(ax, lim=2.8); ax.set_xticks([-2, 0, 2])
        if j:
            ax.set_yticklabels([]); az.set_yticklabels([])
        az.add_patch(Ellipse(CENTERS8[0], 4 * STD8, 4 * STD8, fc="none", ec=C["dark"], lw=1.4, ls="--"))
        az.plot(*CENTERS8[0], "+", color=C["dark"], ms=12, mew=2)
        az.set_xlim(1.55, 2.65); az.set_ylim(-0.55, 0.55); az.set_aspect("equal"); az.set_xticks([1.6, 2.0, 2.4])
    axs[1, 0].set_ylabel("zoom on mode 0")
    save(fig, out("02-cfg.svg"))


# ============================================================ flow matching vs diffusion paths (exact fields)
def fm_velocity(x, t, s=STD8):
    V = t ** 2 * s ** 2 + (1 - t) ** 2
    d = x[:, None, :] - t * CENTERS8[None]
    logw = -0.5 * (d ** 2).sum(-1) / V
    logw -= logw.max(1, keepdims=True); w = np.exp(logw); w /= w.sum(1, keepdims=True)
    vk = CENTERS8[None] + ((t * s ** 2 - (1 - t)) / V) * d
    return (w[..., None] * vk).sum(1)


def fm_path(x, steps=200):
    tr = [x.copy()]
    for i in range(steps):
        x = x + fm_velocity(x, i / steps) / steps
        tr.append(x.copy())
    return np.array(tr)


def exact_eps(x, t):
    return -np.sqrt(1 - AB[t]) * mix_score(x, AB[t])


def fig_flow_vs_diffusion():
    """Per-pair (conditional) interpolation paths between the same noise and data points.
    Dots are placed at equal steps of the time variable, so their spacing shows the speed."""
    rng = np.random.default_rng(7)
    eps = rng.standard_normal((10, 2)) * 1.1
    x1, _ = sample8(10, rng)
    fig, axs = plt.subplots(1, 2, figsize=(10, 5.1), sharey=True)
    tt = np.arange(T - 1, -1, -1)                  # diffusion: t = 999 ... 0 (noise -> data)
    vp = np.sqrt(AB[tt])[:, None, None] * x1[None] + np.sqrt(1 - AB[tt])[:, None, None] * eps[None]
    s = np.linspace(0, 1, 201)                     # flow matching: t = 0 ... 1 (noise -> data)
    fm = (1 - s)[:, None, None] * eps[None] + s[:, None, None] * x1[None]
    for ax, tr, every, name, col in [(axs[0], vp, 50, r"diffusion: $\sqrt{\bar\alpha_t}\,x_0+\sqrt{1-\bar\alpha_t}\,\epsilon$", C["b"]),
                                     (axs[1], fm, 10, r"flow matching: $(1-t)\,x_0+t\,x_1$", C["a"])]:
        for i in range(tr.shape[1]):
            ax.plot(tr[:, i, 0], tr[:, i, 1], color=col, lw=1.8, alpha=0.9)
            ax.plot(tr[::every, i, 0], tr[::every, i, 1], ".", color=col, ms=6)
        ax.scatter(eps[:, 0], eps[:, 1], s=40, color=C["dark"], zorder=4)
        ax.scatter(x1[:, 0], x1[:, 1], s=60, color=col, marker="s", edgecolor="white", zorder=4)
        ax.set_title(name, fontsize=14)
        modes(ax); toy_ax(ax, lim=3.0)
    save(fig, out("02-flow-vs-diffusion.svg"))


def fig_few_step():
    """End points of N-step samplers on the exact fields: Euler for flow matching, DDIM for diffusion."""
    rng = np.random.default_rng(8)
    z = rng.standard_normal((1500, 2))
    fig, axs = plt.subplots(2, 3, figsize=(9, 6.4), sharex=True, sharey=True)
    for j, n in enumerate([1, 4, 16]):
        xd, _ = ddim_sample(exact_eps, z.copy(), steps=n)
        xf = fm_path(z.copy(), steps=n)[-1]
        for i, (x, col) in enumerate([(xd, C["b"]), (xf, C["a"])]):
            ax = axs[i, j]
            ax.scatter(x[:, 0], x[:, 1], s=3, color=col, alpha=0.5)
            modes(ax); toy_ax(ax, lim=3.0)
            frac, _ = coverage(x)
            ax.text(-2.85, -2.75, f"{100 * frac:.0f}% near a mode", fontsize=13, bbox=dict(fc="white", ec="none", alpha=0.8))
        axs[0, j].set_title(f"{n} step" + ("s" if n > 1 else ""))
    axs[0, 0].set_ylabel("DDIM ($\\eta=0$)"); axs[1, 0].set_ylabel("flow matching (Euler)")
    save(fig, out("02-few-step.svg"))


# ============================================================ DiT patchify
def fig_dit():
    fig, ax = diagram(11, 5.6)
    rng = np.random.default_rng(3)
    cmap = plt.get_cmap("Purples")
    # 8x8 latent, patch size 2 -> 4x4 = 16 tokens
    g0x, g0y, cs = 0.3, 0.9, 0.42
    vals = rng.uniform(0.25, 0.85, (8, 8))
    for i in range(8):
        for j in range(8):
            ax.add_patch(Rectangle((g0x + j * cs, g0y + (7 - i) * cs), cs, cs, fc=cmap(vals[i, j]), ec="white", lw=0.8))
    for k in range(5):
        ax.plot([g0x + 2 * k * cs] * 2, [g0y, g0y + 8 * cs], color=C["b"], lw=2.2)
        ax.plot([g0x, g0x + 8 * cs], [g0y + 2 * k * cs] * 2, color=C["b"], lw=2.2)
    ax.text(g0x + 4 * cs, g0y - 0.35, "$z_t$: $I\\times I\\times C$,  $p=2$", ha="center", fontsize=15)
    # token row
    tx, ty, tw = 4.6, 4.7, 0.34
    for k in range(16):
        r, c = divmod(k, 4)
        ax.add_patch(Rectangle((tx + k * tw, ty), tw * 0.9, 0.5, fc=cmap(vals[2 * r:2 * r + 2, 2 * c:2 * c + 2].mean()),
                               ec=C["b"], lw=1.2))
    ax.text(tx + 8 * tw, ty + 0.75, "$(I/p)^2 = 16$ tokens  + pos. emb.", ha="center", fontsize=15)
    arrow(ax, (g0x + 8 * cs + 0.1, g0y + 7 * cs), (tx - 0.1, ty + 0.25), color=C["b"], rad=-0.2, text="patchify", toff=(-0.1, 0.25), fs=15)
    blk = box(ax, 7.3, 2.75, "N x DiT block\n(attention + MLP)", w=3.6, h=1.3, fc="#e8e0f5", fs=15)
    arrow(ax, (tx + 8 * tw, ty - 0.05), blk)
    cond = box(ax, 4.4, 1.0, "$t$, $c$", w=1.1, h=0.6, fc="white", ec=C["y"], fs=15)
    ada = box(ax, 7.3, 1.0, "MLP $\\to$ $\\gamma, \\beta, \\alpha$  (adaLN-Zero)", w=3.9, h=0.6, fc="white", ec=C["y"], fs=14)
    arrow(ax, cond, ada, color=C["y"]); arrow(ax, ada, blk, color=C["y"])
    outb = box(ax, 10.4, 2.75, "unpatchify\n$\\hat\\epsilon$, $\\Sigma$", w=1.2, h=1.3, fc="white", ec=C["gray"], fs=14)
    arrow(ax, blk, outb)
    ax.set_xlim(0, 11.1); ax.set_ylim(0.2, 5.7)
    save(fig, out("02-dit.svg"))


if __name__ == "__main__":
    for lang in LANGS:
        fig_reparam(lang); fig_ldm(lang)
    fig_vae(); fig_vq(); fig_ar_mask(); fig_forward(); fig_schedule()
    model = train_ddpm()
    fig_reverse(model); fig_score(model); fig_ddim_vs_ddpm(model)
    fig_cfg(); fig_flow_vs_diffusion(); fig_few_step(); fig_dit()
