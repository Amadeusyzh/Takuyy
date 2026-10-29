"""Figures for neural-rendering post 02 (NeRF).

Everything is computed with NumPy ports of the post's own code: get_rays (OpenGL/NeRF
camera convention: x right, y up, camera looks along -z), pose_spherical, gt_field,
stratified_samples, volume_render and sample_pdf. Run from the repository root:

    python3 bin/figures/neural-rendering/neural-rendering_02.py
"""
import os, sys, pathlib

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")  # the small MLP fit is fastest single-threaded
os.environ.setdefault("OMP_NUM_THREADS", "1")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib.patches import Ellipse, FancyBboxPatch, Polygon, Rectangle  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Line3DCollection, Poly3DCollection  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/neural-rendering"
PREVIEW = None  # set PREVIEW_DIR env var to also write PNG previews

if os.environ.get("PREVIEW_DIR"):
    PREVIEW = pathlib.Path(os.environ["PREVIEW_DIR"])
    PREVIEW.mkdir(parents=True, exist_ok=True)


def out(fig, name):
    if PREVIEW is not None:
        fig.savefig(PREVIEW / (name + ".png"), dpi=70)
    save(fig, OUT / (name + ".svg"))


# ----------------------------------------------------------------------------------------
# NumPy ports of the post's code
# ----------------------------------------------------------------------------------------
def get_rays(H, W, focal, c2w):
    j, i = np.meshgrid(np.arange(H, dtype=float), np.arange(W, dtype=float), indexing="ij")
    dirs = np.stack([(i + 0.5 - W / 2) / focal, -(j + 0.5 - H / 2) / focal, -np.ones_like(i)], -1)
    rays_d = dirs @ c2w[:3, :3].T
    rays_o = np.broadcast_to(c2w[:3, 3], rays_d.shape)
    return rays_o, rays_d


def pose_spherical(theta, phi, radius):
    th, ph = np.radians(theta), np.radians(phi)
    C = np.array([radius * np.cos(ph) * np.sin(th), radius * np.sin(ph), radius * np.cos(ph) * np.cos(th)])
    back = C / np.linalg.norm(C)
    right = np.cross([0.0, 1.0, 0.0], back); right /= np.linalg.norm(right)
    up = np.cross(back, right)
    c2w = np.eye(4); c2w[:3, 0], c2w[:3, 1], c2w[:3, 2], c2w[:3, 3] = right, up, back, C
    return c2w


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def gt_field(x):
    sigma = 30.0 * sigmoid(20.0 * (0.6 - np.linalg.norm(x, axis=-1)))
    rgb = 0.5 + 0.5 * np.tanh(2.0 * x)
    return rgb, sigma


def stratified_samples(near, far, n_rays, n_samples, rng=None):
    bins = np.broadcast_to(np.linspace(0.0, 1.0, n_samples + 1)[:-1], (n_rays, n_samples))
    u = rng.random((n_rays, n_samples)) if rng is not None else np.full((n_rays, n_samples), 0.5)
    return near + (far - near) * (bins + u / n_samples)


def volume_render(rgb, sigma, t, rays_d):
    delta = t[..., 1:] - t[..., :-1]
    delta = np.concatenate([delta, np.full_like(delta[..., :1], 1e10)], -1)
    delta = delta * np.linalg.norm(rays_d, axis=-1, keepdims=True)
    alpha = 1.0 - np.exp(-sigma * delta)
    trans = np.cumprod(np.concatenate([np.ones_like(alpha[..., :1]), 1.0 - alpha + 1e-10], -1), -1)[..., :-1]
    weights = alpha * trans
    color = (weights[..., None] * rgb).sum(-2)
    depth = (weights * t).sum(-1)
    acc = weights.sum(-1)
    return color, depth, acc, weights, alpha, trans


def sample_pdf(bins, weights, n_samples, rng):
    weights = weights + 1e-5
    pdf = weights / weights.sum(-1, keepdims=True)
    cdf = np.cumsum(pdf, -1)
    cdf = np.concatenate([np.zeros_like(cdf[..., :1]), cdf], -1)
    u = rng.random((cdf.shape[0], n_samples))
    idx = np.stack([np.searchsorted(c, uu, side="right") for c, uu in zip(cdf, u)])
    below = np.clip(idx - 1, 0, None)
    above = np.clip(idx, None, cdf.shape[-1] - 1)
    cdf_b, cdf_a = np.take_along_axis(cdf, below, -1), np.take_along_axis(cdf, above, -1)
    bin_b, bin_a = np.take_along_axis(bins, below, -1), np.take_along_axis(bins, above, -1)
    denom = np.where(cdf_a - cdf_b < 1e-5, 1.0, cdf_a - cdf_b)
    return bin_b + (u - cdf_b) / denom * (bin_a - bin_b), u, cdf, pdf


# ----------------------------------------------------------------------------------------
# A didactic 1D field along one ray: a faint orange "fog" bump and a dense blue "surface"
# (the same field is used by the interactive widget's default state)
# ----------------------------------------------------------------------------------------
NEAR, FAR = 2.0, 6.0
ORANGE = np.array([1.0, 0.50, 0.05])
BLUE = np.array([0.12, 0.47, 0.71])
BUMPS = [(3.0, 0.3, 1.2, ORANGE), (4.4, 0.18, 15.0, BLUE)]  # (centre, width, peak, colour)


def field1d(t):
    parts = [h * np.exp(-0.5 * ((t - m) / s) ** 2) for m, s, h, _ in BUMPS]
    sig = sum(parts)
    col = sum(p[..., None] * c for p, (_, _, _, c) in zip(parts, BUMPS)) / np.maximum(sig, 1e-12)[..., None]
    return sig, col


def continuous_render(n=200001):
    t = np.linspace(NEAR, FAR, n)
    sig, col = field1d(t)
    dt = t[1] - t[0]
    tau = np.concatenate([[0.0], np.cumsum(0.5 * (sig[1:] + sig[:-1]) * dt)])
    T = np.exp(-tau)
    p = T * sig
    C = (p[:, None] * col).sum(0) * dt
    return t, sig, col, T, p, C


def rgb_hex(c):
    c = np.clip(c, 0, 1)
    return "#%02x%02x%02x" % tuple(int(round(255 * v)) for v in c)


# ----------------------------------------------------------------------------------------
# Figure: continuous volume rendering along two rays of the post's toy scene
# ----------------------------------------------------------------------------------------
def fig_ray_integral():
    c2w = pose_spherical(0.0, 0.0, 4.0)       # camera at (0, 0, 4) looking at the origin
    o = c2w[:3, 3]
    t = np.linspace(NEAR, FAR, 4001)
    fig, axs = plt.subplots(3, 1, figsize=(9, 8.2), sharex=True)
    for b, col, ytxt in [(0.0, C["z"], 0.62), (0.74, C["b"], 0.42)]:
        d = np.array([b / 4.0, 0.0, -1.0])     # ray whose closest approach to the centre is ~b
        x = o + t[:, None] * d
        _, sig = gt_field(x)
        dt = (t[1] - t[0]) * np.linalg.norm(d)
        tau = np.concatenate([[0.0], np.cumsum(0.5 * (sig[1:] + sig[:-1]) * dt)])
        T = np.exp(-tau)
        p = T * sig * np.linalg.norm(d)
        dist = np.min(np.linalg.norm(x, axis=-1))
        depth = (p * t).sum() * (t[1] - t[0]) / max(p.sum() * (t[1] - t[0]), 1e-9)
        lab = f"min $\\|\\mathbf{{x}}\\|$ = {dist:.2f}"
        axs[0].plot(t, sig, color=col, label=lab)
        axs[1].plot(t, T, color=col)
        axs[1].text(5.95, ytxt, f"$1-T(t_f)$ = {1 - T[-1]:.2f}", color=col, ha="right", va="bottom", fontsize=15)
        axs[2].plot(t, p, color=col)
        axs[2].fill_between(t, p, color=col, alpha=0.18)
        axs[2].axvline(depth, color=col, ls="--", lw=1.6)
        axs[2].text(depth + 0.06, p.max() * 0.75, f"$\\bar t$ = {depth:.2f}", color=col, fontsize=15)
    axs[0].set_ylabel(r"$\sigma(\mathbf{r}(t))$")
    axs[0].legend(loc="upper right", fontsize=13)
    axs[1].set_ylabel(r"$T(t)$"); axs[1].set_ylim(-0.05, 1.15)
    axs[2].set_ylabel(r"$T(t)\,\sigma(t)$"); axs[2].set_xlabel(r"$t$")
    axs[2].set_xlim(NEAR, FAR)
    fig.tight_layout()
    out(fig, "02-ray-integral")


# ----------------------------------------------------------------------------------------
# Figure: piecewise-constant quadrature vs the continuous integral
# ----------------------------------------------------------------------------------------
def fig_quadrature():
    t, sig, col, T, p, Ccont = continuous_render()
    rng = np.random.default_rng(3)
    N = 32
    ts = stratified_samples(NEAR, FAR, 1, N, rng)[0]
    sig_i, col_i = field1d(ts)
    Chat, depth, acc, w, alpha, Ti = [a[0] if np.ndim(a) else a for a in volume_render(col_i[None], sig_i[None], ts[None], np.array([[0, 0, -1.0]]))]
    edges = np.append(ts, FAR)

    fig = plt.figure(figsize=(10, 8.6))
    gs = fig.add_gridspec(3, 2, width_ratios=[6, 1], hspace=0.12, wspace=0.08)
    a0 = fig.add_subplot(gs[0, 0]); a1 = fig.add_subplot(gs[1, 0], sharex=a0); a2 = fig.add_subplot(gs[2, 0], sharex=a0)
    a0.plot(t, sig, color=C["gray"], lw=1.6, label=r"$\sigma(t)$")
    a0.stairs(sig_i, edges, color=C["a"], lw=2.2, label=r"$\sigma_i$ on $[t_i, t_{i+1})$")
    a0.plot(ts, sig_i, "o", color=C["a"], ms=5)
    a0.set_ylabel(r"$\sigma$"); a0.legend(loc="upper left", fontsize=13)
    a1.plot(t, T, color=C["gray"], lw=1.6, label=r"$T(t)$")
    a1.plot(ts, Ti, "o", color=C["a"], ms=6, label=r"$T_i=\prod_{j<i}(1-\alpha_j)$")
    a1.set_ylabel(r"$T$"); a1.legend(loc="upper right", fontsize=13); a1.set_ylim(-0.05, 1.08)
    # weights as coloured bars over each interval (height w_i / delta_i is comparable to T sigma)
    widths = np.diff(edges)
    for i in range(N - 1):
        a2.bar(ts[i], w[i] / widths[i], width=widths[i], align="edge", color=rgb_hex(col_i[i]), alpha=0.85, edgecolor="white", lw=0.6)
    a2.plot(t, p, color=C["dark"], lw=1.6, label=r"$T(t)\sigma(t)$")
    a2.set_ylabel(r"$w_i/\delta_i$"); a2.set_xlabel(r"$t$"); a2.legend(loc="upper left", fontsize=13)
    a2.set_xlim(NEAR, FAR)
    for a in (a0, a1):
        plt.setp(a.get_xticklabels(), visible=False)
    # colour swatches: continuous integral vs N-sample estimate (white background added)
    sw = fig.add_subplot(gs[:, 1]); sw.axis("off"); sw.set_xlim(0, 1); sw.set_ylim(0, 1)
    acc_c = 1 - T[-1]
    for y, c, a, txt in [(0.58, Ccont, acc_c, r"$C(\mathbf{r})$"), (0.18, Chat, acc, r"$\hat C(\mathbf{r})$")]:
        sw.add_patch(Rectangle((0.1, y), 0.8, 0.22, color=rgb_hex(c + (1 - a))))
        sw.text(0.5, y + 0.25, txt, ha="center", fontsize=17)
    sw.text(0.5, 0.02, f"N = {N}", ha="center", fontsize=14)
    out(fig, "02-quadrature")
    print("  quadrature: continuous C", Ccont + (1 - acc_c), " N=32 estimate", Chat + (1 - acc), " sum w", acc)


# ----------------------------------------------------------------------------------------
# Figure: front-to-back alpha compositing, sample by sample
# ----------------------------------------------------------------------------------------
def fig_compositing():
    N = 16
    ts = stratified_samples(NEAR, FAR, 1, N)[0]       # midpoints (perturb=False)
    sig_i, col_i = field1d(ts)
    _, _, acc, w, alpha, Ti = [a[0] if np.ndim(a) else a for a in volume_render(col_i[None], sig_i[None], ts[None], np.array([[0, 0, -1.0]]))]
    run = np.cumsum(w[:, None] * col_i, 0)
    runacc = np.cumsum(w)

    fig, ax = plt.subplots(figsize=(10, 6.2))
    ax.set_xlim(-2.6, N + 0.2); ax.set_ylim(0.15, 5.3); ax.axis("off"); ax.grid(False)
    rows = [4.0, 2.9, 1.8, 0.6]
    names = [r"$\mathbf{c}_i,\ \alpha_i$", r"$T_i$", r"$w_i = T_i\alpha_i$", r"$\sum_{j\leq i} w_j\mathbf{c}_j$"]
    for y, n in zip(rows, names):
        ax.text(-0.3, y + 0.35, n, ha="right", va="center", fontsize=15)
    for i in range(N):
        x = i
        # sample: checkerboard behind a patch of colour c_i with opacity alpha_i
        for cx in range(2):
            for cy in range(2):
                ax.add_patch(Rectangle((x + 0.05 + 0.4 * cx, rows[0] + 0.35 * cy), 0.4, 0.35, color="#cccccc" if (cx + cy) % 2 else "white", lw=0))
        ax.add_patch(Rectangle((x + 0.05, rows[0]), 0.8, 0.7, color=rgb_hex(col_i[i]), alpha=float(alpha[i]), lw=0))
        ax.add_patch(Rectangle((x + 0.05, rows[0]), 0.8, 0.7, fill=False, ec=C["gray"], lw=0.6))
        a_txt = f"{alpha[i]:.2f}"
        ax.text(x + 0.45, rows[0] - 0.2, a_txt[1:] if a_txt[0] == "0" else a_txt, ha="center", va="center", fontsize=11)
        # T_i and w_i bars
        ax.add_patch(Rectangle((x + 0.15, rows[1]), 0.6, 0.8 * Ti[i], color=C["a"], lw=0))
        ax.add_patch(Rectangle((x + 0.15, rows[1]), 0.6, 0.8, fill=False, ec=C["gray"], lw=0.6))
        ax.add_patch(Rectangle((x + 0.15, rows[2]), 0.6, 0.8 * w[i] / w.max(), color=rgb_hex(col_i[i]), lw=0))
        ax.add_patch(Rectangle((x + 0.15, rows[2]), 0.6, 0.8, fill=False, ec=C["gray"], lw=0.6))
        # running composite over a white background: sum w c + (1 - sum w) * white
        ax.add_patch(Rectangle((x + 0.05, rows[3]), 0.8, 0.8, color=rgb_hex(run[i] + (1 - runacc[i])), ec=C["gray"], lw=0.6))
        ax.text(x + 0.45, rows[3] - 0.25, f"{i + 1}", ha="center", va="center", fontsize=10, color=C["gray"])
    ax.annotate("", xy=(N - 0.1, 4.85), xytext=(0.0, 4.85), arrowprops=dict(arrowstyle="-|>", color=C["dark"], lw=1.8))
    ax.text(N / 2, 4.95, r"$t_1 < t_2 < \dots < t_N$", ha="center", va="bottom", fontsize=15)
    out(fig, "02-compositing")


# ----------------------------------------------------------------------------------------
# Figure: positional encoding gamma(p)
# ----------------------------------------------------------------------------------------
def fig_posenc():
    p = np.linspace(-1, 1, 1500)
    fig = plt.figure(figsize=(10, 6.2))
    gs = fig.add_gridspec(1, 2, width_ratios=[1.1, 1], wspace=0.3)
    a = fig.add_subplot(gs[0])
    L = 4
    for k in range(L):
        off = 2.6 * (L - 1 - k)
        a.plot(p, np.sin(2 ** k * np.pi * p) + off, color=C["x"], lw=1.8)
        a.plot(p, np.cos(2 ** k * np.pi * p) + off, color=C["z"], lw=1.8, ls="--")
        a.text(1.05, off, f"$k={k}$", va="center", fontsize=14)
    a.set_yticks([]); a.set_xlabel(r"$p$"); a.set_xlim(-1, 1.32)
    a.set_title(r"$\sin(2^k\pi p)$, $\cos(2^k\pi p)$, $L=4$", fontsize=15)
    # right: gamma(p) for two nearby inputs; they differ only in the high-frequency entries
    b = fig.add_subplot(gs[1])
    L = 10
    k = np.arange(L)
    for p0, col, dy in [(0.30, C["a"], -0.17), (0.32, C["b"], 0.17)]:
        sv, cv = np.sin(2.0 ** k * np.pi * p0), np.cos(2.0 ** k * np.pi * p0)
        b.barh(2 * k + dy - 0.5, sv, height=0.32, color=col, label=f"$p={p0:.2f}$")
        b.barh(2 * k + dy + 0.5, cv, height=0.32, color=col, alpha=0.55)
    b.set_yticks(2 * k); b.set_yticklabels([f"{kk}" for kk in k]); b.invert_yaxis()
    b.set_ylabel(r"$k$  ($\sin$ above, $\cos$ below)"); b.set_xlim(-1.1, 1.1)
    b.axvline(0, color=C["dark"], lw=1)
    b.legend(fontsize=13, loc="lower left", bbox_to_anchor=(0.0, 1.0), ncol=2, frameon=False)
    b.set_xlabel(r"$\gamma(p)$ entries, $L=10$")
    out(fig, "02-posenc")


# ----------------------------------------------------------------------------------------
# Figure: fitting a 2D image with a small MLP, with and without positional encoding.
# A real NumPy MLP (3 hidden ReLU layers of width 128, sigmoid output) trained with Adam.
# ----------------------------------------------------------------------------------------
def target_image(n):
    s = (np.arange(n) + 0.5) / n * 2 - 1
    y, x = np.meshgrid(s, s, indexing="ij")
    r = np.sqrt(x ** 2 + y ** 2)
    img = np.zeros((n, n, 3))
    stripes = 0.5 + 0.5 * np.sign(np.sin(10 * np.pi * (x + 0.3 * y)))
    img[..., 0] = 0.15 + 0.7 * stripes * (x < 0.15)
    img[..., 1] = 0.2 + 0.6 * (r < 0.55) * (0.5 + 0.5 * np.cos(14 * r))
    img[..., 2] = 0.25 + 0.6 * ((np.floor(4 * (x + 1)) + np.floor(4 * (y + 1))) % 2) * (x >= 0.15)
    return np.clip(img, 0, 1), np.stack([x, y], -1).reshape(-1, 2)


def encode(xy, L):
    if L == 0:
        return xy
    f = (2.0 ** np.arange(L)) * np.pi
    xb = (xy[:, None, :] * f[:, None]).reshape(len(xy), -1)
    return np.concatenate([xy, np.sin(xb), np.cos(xb)], -1)


def train_mlp(X, Y, steps, width=128, depth=3, lr=2e-3, seed=0, log_every=50, evalX=None):
    rng = np.random.default_rng(seed)
    dims = [X.shape[1]] + [width] * depth + [3]
    P = []
    for a, b in zip(dims[:-1], dims[1:]):
        P += [rng.normal(0, np.sqrt(2.0 / a), (a, b)).astype(np.float32), np.zeros(b, np.float32)]
    m = [np.zeros_like(q) for q in P]; v = [np.zeros_like(q) for q in P]
    curve = []

    def forward(Xin, keep=False):
        hs = [Xin]; h = Xin
        for li in range(depth):
            h = np.maximum(h @ P[2 * li] + P[2 * li + 1], 0.0); hs.append(h)
        y = sigmoid(h @ P[-2] + P[-1])
        return (y, hs) if keep else y

    for it in range(steps + 1):
        y, hs = forward(X, keep=True)
        err = y - Y
        mse = float(np.mean(err.astype(float) ** 2))
        if it % log_every == 0:
            curve.append((it, -10 * np.log10(mse)))
        if it == steps:
            break
        g = 2 * err / err.size * y * (1 - y)
        grads = [None] * len(P)
        grads[-2] = hs[-1].T @ g; grads[-1] = g.sum(0)
        g = g @ P[-2].T
        for li in reversed(range(depth)):
            g = g * (hs[li + 1] > 0)
            grads[2 * li] = hs[li].T @ g; grads[2 * li + 1] = g.sum(0)
            g = g @ P[2 * li].T
        for k in range(len(P)):
            m[k] = 0.9 * m[k] + 0.1 * grads[k]
            v[k] = 0.999 * v[k] + 0.001 * grads[k] ** 2
            mh = m[k] / (1 - 0.9 ** (it + 1)); vh = v[k] / (1 - 0.999 ** (it + 1))
            P[k] -= lr * mh / (np.sqrt(vh) + 1e-8)
    return forward, np.array(curve)


def fig_pe_fit():
    ntr, nte = 64, 128
    img_tr, xy_tr = target_image(ntr)
    img_te, xy_te = target_image(nte)
    Y = img_tr.reshape(-1, 3)
    configs = [(0, C["gray"]), (4, C["b"]), (8, C["a"])]
    results = []
    for L, col in configs:
        f, curve = train_mlp(encode(xy_tr, L).astype(np.float32), Y.astype(np.float32), steps=1500)
        pred = f(encode(xy_te, L).astype(np.float32)).reshape(nte, nte, 3).astype(float)
        te_psnr = -10 * np.log10(np.mean((pred - img_te) ** 2))
        results.append((L, col, pred, curve, te_psnr))
        print(f"  PE fit L={L}: train PSNR {curve[-1, 1]:.1f} dB, test ({nte}^2) PSNR {te_psnr:.1f} dB")
    fig = plt.figure(figsize=(10, 7.4))
    gs = fig.add_gridspec(2, 4, height_ratios=[1, 0.95], hspace=0.35, wspace=0.08)
    ax = fig.add_subplot(gs[0, 0]); ax.imshow(img_te, interpolation="nearest"); ax.set_title("GT", fontsize=14)
    ax.axis("off")
    for k, (L, col, pred, curve, te) in enumerate(results):
        ax = fig.add_subplot(gs[0, k + 1]); ax.imshow(np.clip(pred, 0, 1), interpolation="nearest"); ax.axis("off")
        ax.set_title(("no PE" if L == 0 else f"$L={L}$") + f"\n{te:.1f} dB", fontsize=14, color=col)
    ax = fig.add_subplot(gs[1, :])
    for L, col, pred, curve, te in results:
        ax.plot(curve[:, 0], curve[:, 1], color=col, label="no PE" if L == 0 else f"$\\gamma$, $L={L}$")
    ax.set_xlabel("step"); ax.set_ylabel("PSNR (dB)"); ax.legend(fontsize=13, loc="lower right")
    out(fig, "02-pe-fit")


# ----------------------------------------------------------------------------------------
# Figure: the NeRF MLP (sizes from the post's NeRF class)
# ----------------------------------------------------------------------------------------
def fig_mlp():
    fig, ax = plt.subplots(figsize=(11, 4.6))
    ax.set_xlim(-0.3, 15.3); ax.set_ylim(-1.6, 3.4); ax.axis("off"); ax.grid(False)

    def box(x, y, w, h, txt, fc, fs=14, tc="black"):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.12", fc=fc, ec=C["dark"], lw=1.2))
        ax.text(x + w / 2, y + h / 2, txt, ha="center", va="center", fontsize=fs, color=tc)

    def arrow(x0, y0, x1, y1, col=C["dark"], **kw):
        ax.annotate("", xy=(x1, y1), xytext=(x0, y0), arrowprops=dict(arrowstyle="-|>", color=col, lw=1.6, shrinkA=0, shrinkB=0, **kw))

    box(0, 0.6, 1.3, 1.3, "$\\mathbf{x}$\n3", "#f3f3f3")
    box(1.7, 0.6, 1.4, 1.3, "$\\gamma(\\mathbf{x})$\n63", C["fill"])
    arrow(1.3, 1.25, 1.7, 1.25)
    xs = [3.6 + 0.92 * i for i in range(8)]
    for i, x in enumerate(xs):
        h = 2.0
        box(x, 0.25, 0.72, h, "256", "#dbe9f6", fs=12)
        ax.text(x + 0.36, 0.05, f"{i + 1}", ha="center", va="top", fontsize=11, color=C["gray"])
        if i > 0:
            arrow(xs[i - 1] + 0.72, 1.25, x, 1.25)
    arrow(3.1, 1.25, xs[0], 1.25)
    # skip connection gamma(x) -> input of layer 5
    ax.plot([2.4, 2.4, xs[4] - 0.12, xs[4] - 0.12], [1.9, 2.95, 2.95, 2.25], color=C["b"], lw=1.8)
    arrow(xs[4] - 0.12, 2.4, xs[4] - 0.12, 2.27, col=C["b"])
    ax.text((2.4 + xs[4]) / 2, 3.05, "skip: concat $\\gamma(\\mathbf{x})$  (256 + 63)", ha="center", va="bottom", fontsize=12, color=C["b"])
    ax.text(xs[0] + 0.3, -0.35, "ReLU", ha="left", va="top", fontsize=11, color=C["gray"])
    # heads
    xe = xs[-1] + 0.72
    box(xe + 0.5, 1.75, 1.05, 0.75, "$\\sigma$", "#fde2c6", fs=17)
    arrow(xe, 1.6, xe + 0.5, 2.1)
    ax.text(xe + 1.6, 2.12, "softplus", fontsize=11, color=C["gray"], va="center")
    box(xe + 0.5, 0.15, 1.05, 0.75, "256", "#dbe9f6", fs=12)
    arrow(xe, 0.9, xe + 0.5, 0.55)
    ax.text(xe + 1.03, -0.05, "feature", ha="center", va="top", fontsize=11, color=C["gray"])
    box(xe - 1.3, -1.45, 1.4, 1.0, "$\\gamma(\\mathbf{d})$\n27", C["fill"])
    box(xe + 2.0, -0.75, 0.75, 1.1, "128", "#dbe9f6", fs=12)
    arrow(xe + 1.55, 0.55, xe + 2.0, 0.0)
    arrow(xe + 0.1, -0.95, xe + 2.0, -0.45)
    box(xe + 3.1, -0.65, 1.1, 0.9, "RGB\n3", "#d8f0d8", fs=13)
    arrow(xe + 2.75, -0.2, xe + 3.1, -0.2)
    ax.text(xe + 3.65, -0.85, "sigmoid", ha="center", va="top", fontsize=11, color=C["gray"])
    out(fig, "02-mlp")


# ----------------------------------------------------------------------------------------
# Figure: hierarchical sampling with the post's sample_pdf
# ----------------------------------------------------------------------------------------
def fig_hierarchical():
    rng = np.random.default_rng(7)
    Nc, Nf = 64, 128
    t_c = stratified_samples(NEAR, FAR, 1, Nc, rng)
    sig, col = field1d(t_c)
    _, _, _, w_c, _, _ = volume_render(col, sig, t_c, np.array([[0, 0, -1.0]]))
    mids = 0.5 * (t_c[:, 1:] + t_c[:, :-1])
    t_f, u, cdf, pdf = sample_pdf(mids, w_c[:, 1:-1], Nf, rng)
    t_all = np.sort(np.concatenate([t_c, t_f], -1), -1)
    m = mids[0]
    fig, axs = plt.subplots(3, 1, figsize=(9.5, 9), sharex=True, gridspec_kw=dict(height_ratios=[1, 1.25, 0.8]))
    a = axs[0]
    a.vlines(t_c[0], 0, w_c[0], color=C["z"], lw=2)
    a.plot(t_c[0], w_c[0], "o", color=C["z"], ms=4)
    a.set_ylabel(r"$w_i$"); a.text(5.95, w_c.max() * 0.85, f"$N_c={Nc}$", ha="right", fontsize=15)
    a = axs[1]
    dens = pdf[0] / np.diff(m)   # pdf mass per bin divided by bin width
    a.stairs(dens / dens.max(), m, color=C["gray"], lw=1.4, fill=True, alpha=0.25, label="pdf (scaled)")
    a.plot(m, cdf[0], color=C["a"], lw=2.4, label="CDF")
    sel = np.argsort(u[0])[:: max(1, Nf // 14)]
    for k in sel:
        a.plot([NEAR, t_f[0, k]], [u[0, k], u[0, k]], color=C["b"], lw=0.9, alpha=0.8)
        a.plot([t_f[0, k], t_f[0, k]], [u[0, k], 0], color=C["b"], lw=0.9, alpha=0.8)
        a.plot(NEAR, u[0, k], ">", color=C["b"], ms=5)
    a.set_ylabel(r"$u \sim \mathcal{U}[0,1)$"); a.legend(loc="center right", fontsize=13); a.set_ylim(-0.02, 1.05)
    a = axs[2]
    a.plot(t_c[0], np.full(Nc, 1.0), "|", color=C["z"], ms=16, mew=1.5)
    a.plot(t_f[0], np.full(Nf, 0.0), "|", color=C["b"], ms=16, mew=1.5)
    a.set_yticks([0, 1]); a.set_yticklabels([f"$N_f={Nf}$", f"$N_c={Nc}$"]); a.set_ylim(-0.6, 1.6)
    a.set_xlabel(r"$t$"); a.set_xlim(NEAR, FAR); a.grid(False)
    fig.tight_layout()
    out(fig, "02-hierarchical")
    near_surf = np.mean((t_f[0] > 4.0) & (t_f[0] < 4.8))
    print(f"  hierarchical: {100 * near_surf:.0f}% of fine samples in [4.0, 4.8]; total samples {t_all.shape[1]}")


# ----------------------------------------------------------------------------------------
# 3D helpers
# ----------------------------------------------------------------------------------------
def sphere_wire(ax, r=0.6, color=C["gray"], n=13):
    u, v = np.meshgrid(np.linspace(0, 2 * np.pi, 2 * n + 1), np.linspace(0, np.pi, n))
    ax.plot_wireframe(r * np.sin(v) * np.cos(u), r * np.sin(v) * np.sin(u), r * np.cos(v), color=color, lw=0.7, alpha=0.6)


def P3(ax, pts, *a, **k):
    """Plot world points with world y up: (x, y, z) -> matplotlib (x, -z, y)."""
    pts = np.asarray(pts)
    return ax.plot(pts[..., 0], -pts[..., 2], pts[..., 1], *a, **k)


def to_mpl(p):
    p = np.asarray(p)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], -1)


def frustum(ax, c2w, focal, H, W, depth, color, lw=1.4):
    o = c2w[:3, 3]
    cs = np.array([[0, 0], [W, 0], [W, H], [0, H]], float)
    d = np.stack([(cs[:, 0] - W / 2) / focal, -(cs[:, 1] - H / 2) / focal, -np.ones(4)], -1) @ c2w[:3, :3].T
    corners = o + depth * d
    for c in corners:
        P3(ax, np.stack([o, c]), color=color, lw=lw)
    P3(ax, np.vstack([corners, corners[:1]]), color=color, lw=lw)
    return corners


def fig_rays3d():
    H = W = 32; focal = 40.0
    c2w = pose_spherical(35.0, -25.0, 4.0)
    o, d = get_rays(H, W, focal, c2w)
    fig = plt.figure(figsize=(9.5, 7.6))
    ax = fig.add_axes([0, 0, 1, 1], projection="3d")
    ax.view_init(elev=24, azim=-5)
    sphere_wire(ax)
    oc = c2w[:3, 3]
    # display box: camera + sphere with a margin; rays are clipped to it (they continue to t_f = 6)
    lo = np.minimum(oc, -0.6) - 0.5; hi = np.maximum(oc, 0.6) + 0.5

    def clip(oo, dd, t0, t1):
        for a in range(3):
            if abs(dd[a]) > 1e-12:
                ta, tb = sorted([(lo[a] - oo[a]) / dd[a], (hi[a] - oo[a]) / dd[a]])
                t0, t1 = max(t0, ta), min(t1, tb)
        return t0, t1
    # image plane at distance 1 (so the pixel grid lies where dirs have z_c = -1)
    corners = frustum(ax, c2w, focal, H, W, 1.0, C["dark"])
    # pixel grid lines every 4 pixels on the image plane
    for k in range(0, W + 1, 4):
        a = np.array([(k - W / 2) / focal, -(0 - H / 2) / focal, -1]) @ c2w[:3, :3].T + oc
        b = np.array([(k - W / 2) / focal, -(H - H / 2) / focal, -1]) @ c2w[:3, :3].T + oc
        P3(ax, np.stack([a, b]), color=C["gray"], lw=0.6)
        a = np.array([(0 - W / 2) / focal, -(k - H / 2) / focal, -1]) @ c2w[:3, :3].T + oc
        b = np.array([(W - W / 2) / focal, -(k - H / 2) / focal, -1]) @ c2w[:3, :3].T + oc
        P3(ax, np.stack([a, b]), color=C["gray"], lw=0.6)
    # a few rays: through pixel centres, from t_n = 2 to t_f = 6, with 16 midpoint samples
    near, far = 2.0, 6.0
    rng = np.random.default_rng(1)
    for (jj, ii) in [(2, 2), (2, 29), (29, 2), (29, 29), (16, 16), (11, 20), (20, 9)]:
        oo, dd = o[jj, ii], d[jj, ii]
        P3(ax, np.stack([oo, oo + near * dd]), color=C["a"], lw=1.0, ls=":")
        t0, t1 = clip(oo, dd, near, far)
        P3(ax, np.stack([oo + t0 * dd, oo + t1 * dd]), color=C["a"], lw=1.6)
        P3(ax, oo + 1.0 * dd, "o", color=C["a"], ms=4)
    # stratified samples along the centre ray, coloured by the toy field's density
    oo, dd = o[16, 16], d[16, 16]
    ts = stratified_samples(near, far, 1, 24, rng)[0]
    ts = ts[(ts >= clip(oo, dd, near, far)[0]) & (ts <= clip(oo, dd, near, far)[1])]
    xs = oo + ts[:, None] * dd
    rgb, sig = gt_field(xs)
    xm = to_mpl(xs)
    ax.scatter(xm[:, 0], xm[:, 1], xm[:, 2], c=[rgb_hex(c) if s > 1 else "#bbbbbb" for c, s in zip(rgb, sig)], s=36, depthshade=False, edgecolors="k", linewidths=0.4)
    # camera axes (OpenGL: x right, y up, looks along -z, so +z points back)
    for k, col, lab in [(0, C["x"], "$x_c$"), (1, C["y"], "$y_c$"), (2, C["z"], "$z_c$")]:
        s = oc; e = oc + 0.7 * c2w[:3, k]
        sm, em = to_mpl(s), to_mpl(e)
        ax.quiver(*sm, *(em - sm), color=col, lw=2.2, arrow_length_ratio=0.18)
        ax.text(*(sm + 1.2 * (em - sm)), lab, color=col, fontsize=15)
    # world axes at the origin (y up)
    for v, col, lab in [((1, 0, 0), C["x"], "$x$"), ((0, 1, 0), C["y"], "$y$"), ((0, 0, 1), C["z"], "$z$")]:
        e = to_mpl(np.array(v, float)); ax.quiver(0, 0, 0, *e, color=col, lw=1.4, arrow_length_ratio=0.12, alpha=0.7)
        ax.text(*(1.1 * e), lab, color=col, fontsize=14)
    ax.text(*to_mpl(oc + np.array([0, 0.25, 0])), "$\\mathbf{o}$", fontsize=16)
    pts = to_mpl(np.vstack([lo, hi]))
    cen, half = 0.5 * (pts.max(0) + pts.min(0)), 0.5 * (pts.max(0) - pts.min(0)).max()
    ax.set_xlim(cen[0] - half, cen[0] + half); ax.set_ylim(cen[1] - half, cen[1] + half); ax.set_zlim(cen[2] - half, cen[2] + half)
    ax.set_box_aspect((1, 1, 1), zoom=1.35); ax.set_axis_off()
    out(fig, "02-rays-3d")


def fig_toy_setup():
    H = W = 32; focal = 40.0; near, far = 2.0, 6.0
    fig = plt.figure(figsize=(10.5, 5.6))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    ax.view_init(elev=22, azim=-55)
    sphere_wire(ax, color=C["a"])
    show = [0, 5, 10, 15]
    for k in range(20):
        c2w = pose_spherical(18.0 * k, -30.0 + 3.0 * k, 4.0)
        col = C["b"] if k in show else C["gray"]
        frustum(ax, c2w, focal, H, W, 0.8, col, lw=1.8 if k in show else 1.0)
        if k in show:
            ax.text(*to_mpl(c2w[:3, 3] * 1.12), f"{k}", color=C["b"], fontsize=13)
    lim = 3.0
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_zlim(-lim, lim); ax.set_box_aspect((1, 1, 1))
    ax.set_axis_off()
    for v, col, lab in [((1, 0, 0), C["x"], "$x$"), ((0, 1, 0), C["y"], "$y$"), ((0, 0, 1), C["z"], "$z$")]:
        e = to_mpl(1.4 * np.array(v, float)); ax.quiver(0, 0, 0, *e, color=col, lw=1.6, arrow_length_ratio=0.15)
        ax.text(*(1.15 * e), lab, color=col, fontsize=15)
    gs = fig.add_gridspec(2, 4, left=0.53, right=0.98, wspace=0.08, hspace=0.25)
    for n, k in enumerate(show):
        c2w = pose_spherical(18.0 * k, -30.0 + 3.0 * k, 4.0)
        o, d = get_rays(H, W, focal, c2w)
        o, d = o.reshape(-1, 3), d.reshape(-1, 3)
        t = stratified_samples(near, far, o.shape[0], 256)
        x = o[:, None] + d[:, None] * t[..., None]
        rgb, sig = gt_field(x)
        img = volume_render(rgb, sig, t, d)[0].reshape(H, W, 3)
        a = fig.add_subplot(gs[n // 2, 2 * (n % 2): 2 * (n % 2) + 2])
        a.imshow(np.clip(img, 0, 1), interpolation="nearest"); a.set_xticks([]); a.set_yticks([]); a.grid(False)
        a.set_title(f"#{k}", fontsize=14, color=C["b"])
    out(fig, "02-toy-setup")


# ----------------------------------------------------------------------------------------
# Figure: Mip-NeRF cone frustums vs NeRF points, and the IPE attenuation
# ----------------------------------------------------------------------------------------
def frustum_gaussian(t0, t1, r):
    mu, hw = (t0 + t1) / 2, (t1 - t0) / 2
    den = 3 * mu ** 2 + hw ** 2
    t_mean = mu + 2 * mu * hw ** 2 / den
    t_var = hw ** 2 / 3 - (4 / 15) * (hw ** 4 * (12 * mu ** 2 - hw ** 2)) / den ** 2
    r_var = r ** 2 * (mu ** 2 / 4 + (5 / 12) * hw ** 2 - (4 / 15) * hw ** 4 / den)
    return t_mean, t_var, r_var


def fig_mipnerf():
    fig = plt.figure(figsize=(10.5, 7.8))
    gs = fig.add_gridspec(2, 1, height_ratios=[1.15, 1], hspace=0.38)
    ax = fig.add_subplot(gs[0])
    r = 0.12  # cone radius at unit distance (exaggerated so the footprints are visible)
    edges = np.array([1.0, 2.0, 3.0, 4.2, 5.4, 6.8, 8.2])
    tt = np.linspace(0, 8.6, 10)
    ax.fill_between(tt, -r * tt, r * tt, color=C["fill"], alpha=0.6, lw=0)
    ax.plot(tt, r * tt, color=C["a"], lw=1.4); ax.plot(tt, -r * tt, color=C["a"], lw=1.4)
    for e in edges:
        ax.plot([e, e], [-r * e, r * e], color=C["a"], lw=1.0)
    for t0, t1 in zip(edges[:-1], edges[1:]):
        tm, tv, rv = frustum_gaussian(t0, t1, r)
        for s, al in [(1, 0.9), (2, 0.4)]:
            ax.add_patch(Ellipse((tm, 0), 2 * s * np.sqrt(tv), 2 * s * np.sqrt(rv), fc="none", ec=C["b"], lw=1.6, alpha=al))
        ax.plot(tm, 0, "o", color=C["b"], ms=4)
    # the NeRF ray below: an infinitely thin line with point samples
    y0 = -1.45
    ax.plot([0, 8.6], [y0, y0], color=C["dark"], lw=1.4)
    ax.plot(0.5 * (edges[:-1] + edges[1:]), np.full(len(edges) - 1, y0), "o", color=C["dark"], ms=6)
    ax.text(-0.15, y0, "NeRF", ha="right", va="center", fontsize=14)
    ax.text(-0.15, 0, "Mip-NeRF", ha="right", va="center", fontsize=14, color=C["a"])
    ax.plot(0, 0, "ko", ms=5); ax.plot(0, y0, "ko", ms=5)
    ax.set_xlim(-2.2, 8.8); ax.set_ylim(-1.8, 1.15); ax.set_aspect("equal"); ax.axis("off")
    ax.text(8.75, 0, "$t$", fontsize=15, va="center")
    # IPE attenuation exp(-(2^k pi)^2 s^2 / 2)
    b = fig.add_subplot(gs[1])
    k = np.arange(10)
    for s, col in [(0.002, C["c"]), (0.01, C["b"]), (0.05, C["x"])]:
        b.plot(k, np.exp(-0.5 * (2.0 ** k * np.pi) ** 2 * s ** 2), "o-", color=col, label=f"$\\sigma = {s}$")
    b.set_xlabel(r"$k$"); b.set_ylabel(r"$e^{-\frac{1}{2}(2^k\pi)^2\sigma^2}$")
    b.set_xticks(k); b.legend(fontsize=13, loc="lower left"); b.set_ylim(-0.05, 1.05)
    out(fig, "02-mipnerf")


# ----------------------------------------------------------------------------------------
# Figure: Mip-NeRF 360 scene contraction
# ----------------------------------------------------------------------------------------
def contract(p):
    n = np.linalg.norm(p, axis=-1, keepdims=True)
    return np.where(n <= 1, p, (2 - 1 / np.maximum(n, 1e-9)) * p / np.maximum(n, 1e-9))


def fig_contraction():
    vals = np.concatenate([-np.geomspace(32, 1, 6), np.linspace(-0.5, 0.5, 3), np.geomspace(1, 32, 6)])
    s = np.concatenate([-np.geomspace(64, 0.01, 300), np.geomspace(0.01, 64, 300)])
    fig, axs = plt.subplots(1, 2, figsize=(10.5, 5.4))
    cmap = plt.get_cmap("viridis")
    for ax, f, lim, ttl in [(axs[0], lambda p: p, 4.2, r"$\mathbf{x}$"), (axs[1], contract, 2.15, r"$\mathrm{contract}(\mathbf{x})$")]:
        for v in vals:
            col = cmap(min(np.log2(abs(v) + 1) / 5.1, 1.0))
            for line in (np.stack([np.full_like(s, v), s], -1), np.stack([s, np.full_like(s, v)], -1)):
                q = f(line)
                ax.plot(q[:, 0], q[:, 1], color=col, lw=1.3)
        th = np.linspace(0, 2 * np.pi, 200)
        for rr, ls in [(1, "--"), (2, "-")]:
            ax.plot(rr * np.cos(th), rr * np.sin(th), color=C["x"], lw=2.0, ls=ls)
        ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_aspect("equal"); ax.set_title(ttl)
    axs[0].text(0.72, -0.95, "$r=1$", color=C["x"], fontsize=14)
    axs[1].text(1.45, -1.55, "$r=2$", color=C["x"], fontsize=14)
    fig.tight_layout()
    out(fig, "02-contraction")


if __name__ == "__main__":
    ALL = [fig_ray_integral, fig_quadrature, fig_compositing, fig_posenc, fig_mlp, fig_hierarchical,
           fig_rays3d, fig_toy_setup, fig_mipnerf, fig_contraction, fig_pe_fit]
    only = sys.argv[1:]  # optional: names of figure functions to (re)build, e.g. fig_mlp
    for fn in ALL:
        if not only or fn.__name__ in only:
            fn()
