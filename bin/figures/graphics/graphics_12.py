"""Figures for graphics post 12 (differentiable and inverse rendering).

Every curve and image is computed: the 1D edge example, the boundary (Reynolds) term check, the
gradient-noise experiment, the soft-rasterizer maps, the three PyTorch optimizations of the post
(soft rasterizer, hard rasterizer + edge sampling, tiny sphere shader), the loss landscapes, the
Laplacian ("large steps") toy and the volume/splat examples. Pixel convention as in the post:
pixel (i, j) covers [j, j+1) x [i, i+1) in pixel units, its centre is (j + 0.5, i + 0.5), and a
pixel value is the *area average* of the scene over the pixel.

    python3 bin/figures/graphics/graphics_12.py      (CPU, well under a minute)
"""
import pathlib
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
import torch  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics"


def out(name):
    return OUT / f"12-{name}.svg"


np.random.seed(0)
torch.manual_seed(0)


# ---------------------------------------------------------------------------
# 1. Pipeline diagram (localized)
# ---------------------------------------------------------------------------
def fig_pipeline():
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(10, 4.4))
        ax.set_xlim(0, 10); ax.set_ylim(0, 4.4); ax.axis("off")

        def box(x, y, txt, col):
            ax.text(x, y, txt, ha="center", va="center", fontsize=14, linespacing=1.35,
                    bbox=dict(boxstyle="round,pad=0.5", fc=col, ec=C["dark"], lw=1.4))

        def arr(a, b, col=C["dark"], rad=0.0, ls="-"):
            ax.annotate("", xy=b, xytext=a, arrowprops=dict(
                arrowstyle="-|>", lw=2.2, color=col, ls=ls, mutation_scale=18,
                connectionstyle=f"arc3,rad={rad}"))

        box(1.15, 3.3, label(lang, en="scene $\\theta$\nshape, material\nlight, camera",
                             zh="场景参数 $\\theta$\n形状、材质\n光照、相机",
                             ja="シーン $\\theta$\n形状・材質\n照明・カメラ"), C["fill"])
        box(3.9, 3.3, label(lang, en="differentiable\nrenderer $R(\\theta)$", zh="可微渲染器\n$R(\\theta)$",
                            ja="微分可能\nレンダラ $R(\\theta)$"), "#dbeaf7")
        box(6.35, 3.3, label(lang, en="image $I$", zh="渲染图像 $I$", ja="画像 $I$"), "#fde9d4")
        box(8.75, 3.3, label(lang, en="loss\n$\\mathcal{L}(I, I^*)$", zh="损失\n$\\mathcal{L}(I, I^*)$",
                             ja="損失\n$\\mathcal{L}(I, I^*)$"), "#f9d7d7")
        box(8.75, 1.15, label(lang, en="photos $I^*$", zh="照片 $I^*$", ja="写真 $I^*$"), "#e3f2e1")
        arr((2.25, 3.3), (2.85, 3.3)); arr((4.95, 3.3), (5.6, 3.3)); arr((7.1, 3.3), (7.9, 3.3))
        arr((8.75, 1.65), (8.75, 2.75))
        arr((8.0, 2.75), (1.6, 2.55), col=C["x"], rad=-0.32, ls="--")
        ax.text(4.6, 1.05, label(lang, en="backward: $\\partial\\mathcal{L}/\\partial\\theta$, then "
                                          "$\\theta \\leftarrow \\theta - \\eta\\,\\partial\\mathcal{L}/\\partial\\theta$",
                                 zh="反向：$\\partial\\mathcal{L}/\\partial\\theta$，再更新 "
                                    "$\\theta \\leftarrow \\theta - \\eta\\,\\partial\\mathcal{L}/\\partial\\theta$",
                                 ja="逆伝播：$\\partial\\mathcal{L}/\\partial\\theta$ を求めて "
                                    "$\\theta \\leftarrow \\theta - \\eta\\,\\partial\\mathcal{L}/\\partial\\theta$"),
                ha="center", va="center", color=C["x"], fontsize=14)
        ax.text(4.0, 4.15, label(lang, en="forward (rendering)", zh="前向（渲染）", ja="順方向（レンダリング）"),
                ha="center", fontsize=13, color=C["gray"])
        save(fig, OUT / f"12-pipeline_{lang}.svg")


# ---------------------------------------------------------------------------
# 2. 1D edge coverage and its derivative (Section 2)
# ---------------------------------------------------------------------------
def fig_edge_coverage():
    th = np.linspace(-0.4, 1.4, 2001)
    area = np.clip(th, 0, 1)                                    # exact area integral
    center = (th > 0.5).astype(float)                           # one sample at the centre
    xs4 = (np.arange(4) + 0.5) / 4                              # four stratified samples
    four = (th[:, None] > xs4[None]).mean(1)
    h = 0.1
    fd4 = (((th[:, None] + h) > xs4[None]).mean(1) - four) / h  # forward difference of the 4-sample image

    fig, axs = plt.subplots(1, 2, figsize=(12, 4.6))
    ax = axs[0]
    ax.axvspan(0, 1, color=C["fill"], alpha=0.6, lw=0)
    ax.plot(th, area, color=C["a"], lw=3, label=r"$I(\theta)=\int_0^1 H(\theta-x)\,dx$")
    ax.plot(th, center, color=C["c"], lw=2.4, ls="--", label=r"$H(\theta-0.5)$  (1 spp)")
    ax.plot(th, four, color=C["b"], lw=2.2, label="4 spp")
    ax.set_xlabel(r"edge position $\theta$ (pixel $= [0,1]$)"); ax.set_ylabel("pixel value")
    ax.set_ylim(-0.1, 1.25); ax.legend(loc="upper left", fontsize=12.5, frameon=False)
    ax.set_title("value")

    ax = axs[1]
    ax.axvspan(0, 1, color=C["fill"], alpha=0.6, lw=0)
    ax.plot(th, ((th > 0) & (th < 1)).astype(float), color=C["a"], lw=3, label=r"$dI/d\theta$ (exact)")
    ax.plot(th, fd4, color=C["b"], lw=2.0, label=r"FD of 4 spp, $h=0.1$")
    ax.plot(th, np.zeros_like(th), color=C["gray"], lw=2.4, ls=":", label="autodiff of 1 or 4 spp")
    ax.annotate("", xy=(0.5, 2.9), xytext=(0.5, 0.0),
                arrowprops=dict(arrowstyle="-|>", lw=2.6, color=C["c"], mutation_scale=18))
    ax.text(0.53, 2.6, r"$\delta(\theta-0.5)$", color=C["c"], fontsize=15)
    ax.set_xlabel(r"edge position $\theta$"); ax.set_ylabel("derivative")
    ax.set_ylim(-0.2, 3.2); ax.legend(loc="upper right", fontsize=12.5, frameon=False)
    ax.set_title("derivative")
    fig.tight_layout()
    save(fig, out("edge-coverage"))


# ---------------------------------------------------------------------------
# 3. Boundary term in 2D: swept strip and dA/dtheta = edge length (Reynolds check)
# ---------------------------------------------------------------------------
SQUARE = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], float)


def clip_halfplane(poly, n, t):
    """Sutherland-Hodgman: keep the part of polygon `poly` with n . x <= t."""
    res = []
    for k in range(len(poly)):
        a, b = poly[k], poly[(k + 1) % len(poly)]
        da, db = a @ n - t, b @ n - t
        if da <= 0:
            res.append(a)
        if da * db < 0:
            res.append(a + (b - a) * da / (da - db))
    return np.array(res) if res else np.zeros((0, 2))


def poly_area(p):
    if len(p) < 3:
        return 0.0
    x, y = p[:, 0], p[:, 1]
    return 0.5 * abs(x @ np.roll(y, -1) - y @ np.roll(x, -1))


def edge_len_in_square(n, t):
    p = clip_halfplane(SQUARE, n, t)
    L = 0.0
    for k in range(len(p)):
        a, b = p[k], p[(k + 1) % len(p)]
        if abs(a @ n - t) < 1e-9 and abs(b @ n - t) < 1e-9:
            L += np.linalg.norm(b - a)
    return L


def fig_reynolds():
    ang = np.deg2rad(35)
    n = np.array([np.cos(ang), np.sin(ang)])
    t0, dt = 0.62, 0.12
    fig, axs = plt.subplots(1, 2, figsize=(12, 5.2), gridspec_kw=dict(width_ratios=[1, 1.25]))
    ax = axs[0]
    A0, A1 = clip_halfplane(SQUARE, n, t0), clip_halfplane(SQUARE, n, t0 + dt)
    ax.add_patch(plt.Polygon(SQUARE, fc="white", ec=C["dark"], lw=2))
    ax.add_patch(plt.Polygon(A1, fc=C["b"], ec="none", alpha=0.45))
    ax.add_patch(plt.Polygon(A0, fc=C["a"], ec="none", alpha=0.55))
    for t, col, ls in ((t0, C["a"], "-"), (t0 + dt, C["b"], "--")):
        d = np.array([-n[1], n[0]])
        p = n * t
        ax.plot(*np.stack([p - 2 * d, p + 2 * d]).T, color=col, lw=2.6, ls=ls)
    q = n * t0 + np.array([-n[1], n[0]]) * 0.05
    ax.annotate("", xy=q + n * 0.28, xytext=q, arrowprops=dict(arrowstyle="-|>", lw=2.4, color=C["dark"]))
    ax.text(*(q + n * 0.31 + [0.0, 0.02]), r"$\mathbf{n}$", fontsize=17)
    ax.text(0.12, 0.15, r"$f_{\rm in}$", fontsize=18, color="white")
    ax.text(0.88, 0.87, r"$f_{\rm out}$", fontsize=18)
    ax.text(0.54, 0.78, r"$\delta A\approx\ell\,\delta\theta$", fontsize=15, color=C["b"])
    ax.set_xlim(-0.1, 1.1); ax.set_ylim(-0.1, 1.1); ax.set_aspect("equal")
    ax.set_xticks([0, 1]); ax.set_yticks([0, 1]); ax.grid(False)
    ax.set_title(r"edge $\mathbf{n}\cdot\mathbf{x}=\theta$ moves by $\delta\theta$")

    ax = axs[1]
    ts = np.linspace(-0.1, 1.5, 1601)
    A = np.array([poly_area(clip_halfplane(SQUARE, n, t)) for t in ts])
    L = np.array([edge_len_in_square(n, t) for t in ts])
    ax.plot(ts, A, color=C["a"], lw=3, label=r"covered area $A(\theta)$")
    ax.plot(ts[1:], np.diff(A) / np.diff(ts), color=C["b"], lw=5, alpha=0.5, label=r"$dA/d\theta$ (finite diff.)")
    ax.plot(ts, L, color=C["dark"], lw=1.8, ls="--", label=r"edge length $\ell(\theta)$ inside pixel")
    ax.set_xlabel(r"$\theta$"); ax.legend(loc="upper left", fontsize=12.5, frameon=False)
    ax.set_ylim(-0.05, 1.6)
    fig.tight_layout()
    save(fig, out("reynolds"))


# ---------------------------------------------------------------------------
# Shared disc renderer (NumPy) for the gradient-noise experiment
# ---------------------------------------------------------------------------
def disc_cov(cx, cy, r, n=32, ss=4, jitter=None):
    """Hard disc, ss x ss samples per pixel (stratified; optional jitter offsets)."""
    k = (np.arange(ss) + 0.5) / ss
    sx, sy = np.meshgrid(k, k)
    px = np.arange(n)[None, :, None, None] + sx[None, None]
    py = np.arange(n)[:, None, None, None] + sy[None, None]
    if jitter is not None:
        px = px + jitter[0]
        py = py + jitter[1]
    return (((px - cx) ** 2 + (py - cy) ** 2) < r * r).mean(axis=(2, 3))


def edge_grad_r(img, T, cx, cy, r, M, rng, n=32):
    """Edge-sampling estimate of dL/dr for L = mean((img - T)^2), fg = 1, bg = 0."""
    phi = rng.uniform(0, 2 * np.pi, M)
    ex, ey = cx + r * np.cos(phi), cy + r * np.sin(phi)
    j, i = np.floor(ex).astype(int), np.floor(ey).astype(int)
    ok = (i >= 0) & (i < n) & (j >= 0) & (j < n)
    g = np.zeros(M)
    g[ok] = 2.0 * (img[i[ok], j[ok]] - T[i[ok], j[ok]]) / (n * n)
    return g.sum() * 2 * np.pi * r / M          # (f_in - f_out) = 1, v . n = 1 for the radius


def fig_noise():
    n, cx, cy, r = 32, 15.2, 16.9, 8.3
    T = disc_cov(17.3, 15.8, 7.0, n, ss=16)
    I_ref = disc_cov(cx, cy, r, n, ss=32)
    phi =(np.arange(400000) + 0.5) / 400000 * 2 * np.pi                    # dense quadrature
    ex, ey = cx + r * np.cos(phi), cy + r * np.sin(phi)
    j, i = np.floor(ex).astype(int), np.floor(ey).astype(int)
    ref = (2.0 * (I_ref[i, j] - T[i, j]) / (n * n)).sum() * 2 * np.pi * r / len(phi)

    rng = np.random.default_rng(1)
    trials, ss = 300, 4
    est = {}
    for h in (1.0, 0.1, 0.01):
        v = []
        for _ in range(trials):
            jit = rng.uniform(-0.5 / ss, 0.5 / ss, size=(2, n, n, ss, ss))
            L0 = np.mean((disc_cov(cx, cy, r, n, ss, jit) - T) ** 2)
            L1 = np.mean((disc_cov(cx, cy, r + h, n, ss, jit) - T) ** 2)
            v.append((L1 - L0) / h)
        est[f"FD\nh={h:g}"] = np.array(v)
    for M in (16, 64, 256):
        v = []
        for _ in range(trials):
            jit = rng.uniform(-0.5 / ss, 0.5 / ss, size=(2, n, n, ss, ss))
            img = disc_cov(cx, cy, r, n, ss, jit)
            v.append(edge_grad_r(img, T, cx, cy, r, M, rng, n))
        est[f"edge\nM={M}"] = np.array(v)

    names = list(est)
    cols = [C["b"]] * 3 + [C["a"]] * 3
    fig, axs = plt.subplots(1, 2, figsize=(13, 5), gridspec_kw=dict(width_ratios=[1.6, 1]))
    ax = axs[0]
    for k, nm in enumerate(names):
        xj = k + np.random.default_rng(k).uniform(-0.25, 0.25, trials)
        ax.scatter(xj, est[nm], s=9, color=cols[k], alpha=0.45, lw=0)
        ax.plot([k - 0.32, k + 0.32], [est[nm].mean()] * 2, color=C["dark"], lw=2.5)
    ax.axhline(ref, color=C["x"], lw=2, ls="--")
    ax.set_yscale("symlog", linthresh=abs(ref) / 4)
    ax.set_xticks(range(len(names))); ax.set_xticklabels(names, fontsize=12.5)
    ax.set_ylabel(r"estimate of $\partial\mathcal{L}/\partial r$")
    ax.set_title("300 estimates each (black bar = mean, red = reference)", fontsize=13.5)
    ax = axs[1]
    rmse = [np.sqrt(np.mean((est[nm] - ref) ** 2)) / abs(ref) for nm in names]
    ax.bar(range(len(names)), rmse, color=cols)
    ax.set_yscale("log"); ax.set_xticks(range(len(names))); ax.set_xticklabels(names, fontsize=12.5)
    ax.set_title("relative RMSE", fontsize=13.5)
    fig.tight_layout()
    save(fig, out("fd-vs-edge"))
    print("noise experiment: reference dL/dr =", ref, " rel. RMSE:", dict(zip([s.replace("\n", " ") for s in names], np.round(rmse, 3))))


# ---------------------------------------------------------------------------
# 4. Soft rasterizer probability maps (SoftRas, Liu et al. 2019)
# ---------------------------------------------------------------------------
def seg_dist(px, py, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = np.clip(((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy), 0, 1)
    return np.hypot(px - a[0] - t * dx, py - a[1] - t * dy)


def inside_tri(px, py, tri):
    s = []
    for k in range(3):
        a, b = tri[k], tri[(k + 1) % 3]
        s.append((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]))
    s = np.stack(s)
    return np.all(s > 0, 0) | np.all(s < 0, 0)


def softras_map(px, py, tri, sigma):
    d = np.min([seg_dist(px, py, tri[k], tri[(k + 1) % 3]) for k in range(3)], axis=0)
    delta = np.where(inside_tri(px, py, tri), 1.0, -1.0)
    return 1.0 / (1.0 + np.exp(-np.clip(delta * d * d / sigma, -60, 60)))


def fig_softras():
    tri = np.array([[-0.6, -0.55], [0.7, -0.3], [-0.1, 0.65]])
    res = 64
    c = (np.arange(res) + 0.5) / res * 2 - 1                     # NDC pixel centres
    px, py = np.meshgrid(c, c)
    sigmas = (1e-5, 1e-4, 1e-3, 1e-2)
    fig = plt.figure(figsize=(12, 7.4))
    gs = fig.add_gridspec(2, 4, height_ratios=[1, 0.85])
    for k, s in enumerate(sigmas):
        ax = fig.add_subplot(gs[0, k])
        ax.imshow(softras_map(px, py, tri, s), origin="lower", extent=(-1, 1, -1, 1), cmap="magma", vmin=0, vmax=1)
        ax.add_patch(plt.Polygon(tri, fill=False, ec=C["c"], lw=1.6))
        ax.axhline(0.0, color="white", lw=1, ls=":")
        ax.set_title(rf"$\sigma=10^{{{int(round(np.log10(s)))}}}$"); ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    ax = fig.add_subplot(gs[1, :])
    xx = np.linspace(-1, 1, 1000)
    for k, s in enumerate(sigmas):
        ax.plot(xx, softras_map(xx, np.zeros_like(xx), tri, s), lw=2.4,
                color=plt.cm.viridis(k / 3.5), label=rf"$\sigma=10^{{{int(round(np.log10(s)))}}}$")
    ax.set_xlabel(r"$x$ along the dotted line ($y=0$, NDC; one pixel $=2/64$)"); ax.set_ylabel(r"$D(x)$")
    ax.legend(ncol=4, loc="upper center", fontsize=12.5, frameon=False, bbox_to_anchor=(0.5, 1.22))
    fig.tight_layout()
    save(fig, out("softras-sigma"))


# ---------------------------------------------------------------------------
# 5. PyTorch silhouette fit: soft rasterizer vs hard + edge sampling vs hard + autodiff
#    (the post's code, Section 7)
# ---------------------------------------------------------------------------
H = W = 64
ys, xs = torch.meshgrid(torch.arange(H) + 0.5, torch.arange(W) + 0.5, indexing="ij")


def coverage(cx, cy, r, ss=8):
    """Hard disc, area-averaged with ss x ss stratified samples per pixel (no gradients)."""
    o = (torch.arange(ss) + 0.5) / ss - 0.5
    oy, ox = torch.meshgrid(o, o, indexing="ij")
    px, py = xs[..., None, None] + ox, ys[..., None, None] + oy
    return (((px - cx) ** 2 + (py - cy) ** 2) < r ** 2).float().mean(dim=(-1, -2))


def render_soft(p, sigma):
    d = torch.sqrt((xs - p[0]) ** 2 + (ys - p[1]) ** 2 + 1e-12)
    return torch.sigmoid((p[2] - d) / sigma)


def render_hard_autodiff(p):
    d = torch.sqrt((xs - p[0]) ** 2 + (ys - p[1]) ** 2)
    return (torch.sign(p[2] - d) + 1) / 2            # d sign / dx = 0 in PyTorch


class HardDiscEdgeSampled(torch.autograd.Function):
    """Forward: hard supersampled disc. Backward: edge-sampling estimate of the boundary term."""

    @staticmethod
    def forward(ctx, p, n_edge):
        ctx.save_for_backward(p)
        ctx.n_edge = n_edge
        return coverage(*p.tolist(), ss=4)

    @staticmethod
    def backward(ctx, grad_img):                     # grad_img = dL/dI, shape (H, W)
        (p,) = ctx.saved_tensors
        cx, cy, r = p
        phi = torch.rand(ctx.n_edge) * 2 * torch.pi
        nx, ny = torch.cos(phi), torch.sin(phi)      # outward normal at each edge sample
        i = (cy + r * ny).floor().long()
        j = (cx + r * nx).floor().long()
        ok = (i >= 0) & (i < H) & (j >= 0) & (j < W)
        g = torch.zeros(ctx.n_edge)
        g[ok] = grad_img[i[ok], j[ok]]               # (f_in - f_out) = 1 - 0
        w = 2 * torch.pi * r / ctx.n_edge            # arc length per sample
        # velocity . normal of the boundary: d/dcx -> nx, d/dcy -> ny, d/dr -> 1
        return torch.stack([(g * nx).sum(), (g * ny).sum(), g.sum()]) * w, None


TARGET_P = (40.0, 26.0, 12.0)
INIT_P = (30.0, 36.0, 7.0)


def fit_disc(method, iters=150, lr=0.5, n_edge=256, sig0=3.0, sig1=0.5, init=INIT_P, target=None):
    T = coverage(*TARGET_P) if target is None else target
    p = torch.tensor(init, requires_grad=True)
    opt = torch.optim.Adam([p], lr=lr)
    hist, true_loss = [p.detach().clone()], []
    for it in range(iters):
        if method == "soft":
            sigma = sig0 * (sig1 / sig0) ** (it / (iters - 1))
            img = render_soft(p, sigma)
        elif method == "edge":
            img = HardDiscEdgeSampled.apply(p, n_edge)
        else:
            img = render_hard_autodiff(p)
        loss = ((img - T) ** 2).mean()
        opt.zero_grad()
        loss.backward()
        opt.step()
        with torch.no_grad():
            p[2].clamp_(min=0.5)
            true_loss.append(((coverage(*p.tolist()) - T) ** 2).mean().item())
        hist.append(p.detach().clone())
    return torch.stack(hist).numpy(), np.array(true_loss)


def fig_silhouette():
    torch.manual_seed(0)
    runs = {m: fit_disc(m) for m in ("soft", "edge", "hard")}
    for m, (h, l) in runs.items():
        print(f"silhouette fit [{m}]: final (cx, cy, r) =", np.round(h[-1], 2), " final true loss =", f"{l[-1]:.2e}")
    fig, axs = plt.subplots(1, 3, figsize=(15, 5.2), gridspec_kw=dict(width_ratios=[1, 1, 1.25]))
    th = np.linspace(0, 2 * np.pi, 200)
    T = coverage(*TARGET_P).numpy()
    for ax, m, col in ((axs[0], "soft", C["a"]), (axs[1], "edge", C["b"])):
        h, _ = runs[m]
        ax.imshow(T, cmap="Greys", vmin=0, vmax=2.2, extent=(0, W, H, 0))
        for k, it in enumerate((0, 10, 25, 50, 150)):
            cx, cy, r = h[it]
            ax.plot(cx + r * np.cos(th), cy + r * np.sin(th), color=col, lw=1.2 + 0.5 * k, alpha=0.35 + 0.13 * k)
        ax.plot(h[:, 0], h[:, 1], color=C["dark"], lw=1.6)
        ax.plot(h[0, 0], h[0, 1], "o", color=C["dark"], ms=6)
        ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.set_aspect("equal"); ax.grid(False)
        ax.set_xticks([0, 32, 64]); ax.set_yticks([0, 32, 64])
        ax.set_title("soft rasterizer" if m == "soft" else "hard + edge sampling", fontsize=14)
    ax = axs[2]
    for m, col, nm in (("soft", C["a"], "soft"), ("edge", C["b"], "hard + edge sampling"),
                       ("hard", C["gray"], "hard + autodiff")):
        ax.plot(np.arange(1, 151), runs[m][1], color=col, lw=2.4, label=nm)
    ax.set_yscale("log"); ax.set_xlabel("iteration"); ax.set_ylabel("true image loss")
    ax.legend(fontsize=12.5, frameon=False)
    fig.tight_layout()
    save(fig, out("silhouette-fit"))


# ---------------------------------------------------------------------------
# 6. Loss landscapes: plateaus and local minima
# ---------------------------------------------------------------------------
def blur(img, s):
    k = torch.arange(-3 * int(s) - 1, 3 * int(s) + 2, dtype=torch.float32)
    g = torch.exp(-k ** 2 / (2 * s * s)); g = (g / g.sum())[None, None]
    x = img[None, None]
    x = torch.nn.functional.conv2d(x, g[..., None, :], padding=(0, len(k) // 2))
    x = torch.nn.functional.conv2d(x, g[..., :, None], padding=(len(k) // 2, 0))
    return x[0, 0]


def fig_landscape():
    T = coverage(32.0, 32.0, 6.0)
    cs = np.linspace(4, 60, 225)
    curves = {"hard": [], "soft1": [], "soft4": [], "blur": []}
    Tb = blur(T, 6.0)
    for c in cs:
        I = coverage(float(c), 32.0, 6.0)
        curves["hard"].append(((I - T) ** 2).mean().item())
        curves["blur"].append(((blur(I, 6.0) - Tb) ** 2).mean().item())
        p = torch.tensor([float(c), 32.0, 6.0])
        curves["soft1"].append(((render_soft(p, 1.0) - T) ** 2).mean().item())
        curves["soft4"].append(((render_soft(p, 4.0) - T) ** 2).mean().item())

    fig, axs = plt.subplots(1, 2, figsize=(13, 5.2))
    ax = axs[0]
    for key, col, nm in (("hard", C["dark"], "hard"), ("soft1", C["a"], r"soft $\sigma=1$"),
                         ("soft4", C["c"], r"soft $\sigma=4$"), ("blur", C["b"], "hard, both images blurred")):
        v = np.array(curves[key])
        ax.plot(cs, v / v.max(), color=col, lw=2.4, label=nm)
    ax.axvspan(32 - 12, 32 + 12, color=C["fill"], alpha=0.5, lw=0)
    ax.set_xlabel(r"disc centre $c_x$ (pixels); target at 32"); ax.set_ylabel("loss / max")
    ax.legend(fontsize=12, frameon=False, loc="lower left")

    # 2D: target has a big and a small disc; the model is one disc of fixed radius
    T2 = torch.clamp(coverage(20.0, 32.0, 8.0) + coverage(46.0, 32.0, 5.0), 0, 1)
    g = np.linspace(8, 58, 101)
    Lg = np.zeros((len(g), len(g)))
    for a, cy in enumerate(g):
        cx_t = torch.tensor(g, dtype=torch.float32)[:, None, None]
        d = torch.sqrt((xs[None] - cx_t) ** 2 + (ys[None] - float(cy)) ** 2)
        Lg[a] = ((torch.sigmoid((6.5 - d) / 1.5) - T2[None]) ** 2).mean(dim=(1, 2)).numpy()
    ax = axs[1]
    cf = ax.contourf(g, g, Lg, levels=24, cmap="viridis")
    fig.colorbar(cf, ax=ax, shrink=0.85)
    for (sx, sy), col in (((26.0, 40.0), "white"), ((40.0, 25.0), C["light"])):
        p = torch.tensor([sx, sy, 6.5], requires_grad=True)
        opt = torch.optim.Adam([p], lr=0.4)
        tr = [p.detach().numpy()[:2].copy()]
        for _ in range(200):
            loss = ((render_soft(p, 1.5) - T2) ** 2).mean()
            opt.zero_grad(); loss.backward(); p.grad[2] = 0; opt.step()
            tr.append(p.detach().numpy()[:2].copy())
        tr = np.array(tr)
        ax.plot(tr[:, 0], tr[:, 1], color=col, lw=2.4)
        ax.plot(tr[0, 0], tr[0, 1], "o", color=col, ms=7)
        ax.plot(tr[-1, 0], tr[-1, 1], "*", color=col, ms=15, mec=C["dark"])
        print("landscape run from", (sx, sy), "ends at", np.round(tr[-1], 2))
    for (cx, cy, r) in ((20, 32, 8), (46, 32, 5)):
        th = np.linspace(0, 2 * np.pi, 100)
        ax.plot(cx + r * np.cos(th), cy + r * np.sin(th), color="white", lw=1, ls=":")
    ax.set_xlabel(r"$c_x$"); ax.set_ylabel(r"$c_y$"); ax.set_aspect("equal"); ax.grid(False)
    ax.set_title(r"soft loss ($\sigma=1.5$), model radius 6.5", fontsize=13.5)
    fig.tight_layout()
    save(fig, out("loss-landscape"))


# ---------------------------------------------------------------------------
# 7. "Large steps" toy: naive gradient descent vs Laplacian reparameterization (2D curve)
# ---------------------------------------------------------------------------
def fig_large_steps():
    N, lam, eta, iters = 100, 5.0, 0.3, 300
    phi0 = np.linspace(0, 2 * np.pi, N, endpoint=False)
    target_r = lambda a: 1 + 0.25 * np.cos(5 * a)
    Lap = 2 * np.eye(N) - np.roll(np.eye(N), 1, 0) - np.roll(np.eye(N), -1, 0)
    Minv = np.linalg.inv(np.eye(N) + lam * Lap)
    rng = np.random.default_rng(3)
    v0 = 0.5 * np.stack([np.cos(phi0), np.sin(phi0)], 1)
    res, errs = {}, {}
    for mode in ("naive", "large"):
        v, e_hist = v0.copy(), []
        rng = np.random.default_rng(3)
        for _ in range(iters):
            rad = np.linalg.norm(v, axis=1)
            e = rad - target_r(np.arctan2(v[:, 1], v[:, 0]))
            g = e[:, None] * v / rad[:, None]
            g *= (rng.random(N) < 0.3)[:, None]                   # only 30 % of vertices get a gradient
            g += rng.normal(0, 0.02, size=g.shape)                # noisy gradient estimate
            v = v - eta * (g if mode == "naive" else Minv @ (Minv @ g))
            e_hist.append(np.abs(e).mean())
        res[mode], errs[mode] = v, np.array(e_hist)
    fig, axs = plt.subplots(1, 3, figsize=(15, 5.2), gridspec_kw=dict(width_ratios=[1, 1, 1.15]))
    a = np.linspace(0, 2 * np.pi, 400)
    for ax, mode, col, nm in ((axs[0], "naive", C["x"], r"naive: $x \leftarrow x-\eta g$"),
                              (axs[1], "large", C["z"], r"$x \leftarrow x-\eta (I+\lambda L)^{-2} g$")):
        ax.plot(target_r(a) * np.cos(a), target_r(a) * np.sin(a), color=C["gray"], lw=2, ls="--")
        ax.plot(0.5 * np.cos(a), 0.5 * np.sin(a), color=C["gray"], lw=1, ls=":")
        v = np.vstack([res[mode], res[mode][:1]])
        ax.plot(v[:, 0], v[:, 1], color=col, lw=1.8, marker="o", ms=3)
        ax.set_aspect("equal"); ax.set_xlim(-1.4, 1.4); ax.set_ylim(-1.4, 1.4)
        ax.set_title(nm, fontsize=14)
    ax = axs[2]
    ax.plot(errs["naive"], color=C["x"], label="naive")
    ax.plot(errs["large"], color=C["z"], label=r"large steps ($\lambda=5$)")
    ax.set_yscale("log"); ax.set_xlabel("iteration"); ax.set_ylabel("mean radial error")
    ax.legend(frameon=False)
    fig.tight_layout()
    save(fig, out("large-steps"))


# ---------------------------------------------------------------------------
# 8. Tiny differentiable sphere shader: fit albedo and roughness (the post's code)
# ---------------------------------------------------------------------------
def sphere_setup(res=64):
    c = (torch.arange(res) + 0.5) / res * 2 - 1
    y, x = torch.meshgrid(-c, c, indexing="ij")            # image row 0 is the top (y = +1)
    mask = (x ** 2 + y ** 2) < 1
    z = torch.sqrt(torch.clamp(1 - x ** 2 - y ** 2, min=0))
    n = torch.stack([x, y, z], -1) * mask[..., None]       # unit normal inside the disc, 0 outside
    return n, mask


def shade(n, mask, albedo, rough, light=(-0.4, 0.5, 0.75), E=3.0):
    l = torch.tensor(light); l = l / l.norm()
    v = torch.tensor([0.0, 0.0, 1.0])                      # orthographic camera looking down -z
    h = (l + v) / (l + v).norm()
    nl = (n @ l).clamp(min=0)[..., None]
    nv = (n @ v).clamp(min=1e-4)[..., None]
    nh = (n @ h).clamp(min=0)[..., None]
    a2 = (rough ** 2) ** 2                                 # alpha = rough^2
    D = a2 / (torch.pi * (nh ** 2 * (a2 - 1) + 1) ** 2)
    G1 = lambda c: 2 * c / (c + torch.sqrt(a2 + (1 - a2) * c ** 2))
    F = 0.04 + 0.96 * (1 - (h @ v)) ** 5
    spec = D * G1(nl.clamp(min=1e-4)) * G1(nv) * F / (4 * nl.clamp(min=1e-4) * nv)
    rgb = (albedo / torch.pi + spec) * E * nl + 0.05 * albedo
    return rgb * mask[..., None]


def fig_brdf_fit():
    n, mask = sphere_setup()
    alb_t, rough_t = torch.tensor([0.80, 0.35, 0.20]), torch.tensor(0.35)
    target = shade(n, mask, alb_t, rough_t)
    a_raw = torch.zeros(3, requires_grad=True)                      # albedo = sigmoid(a_raw) = 0.5
    r_raw = torch.tensor(1.2, requires_grad=True)                   # rough = 0.05 + 0.95 sigmoid(r_raw)
    opt = torch.optim.Adam([a_raw, r_raw], lr=0.05)
    hist, losses, snaps = [], [], {}
    for it in range(201):
        alb, rough = torch.sigmoid(a_raw), 0.05 + 0.95 * torch.sigmoid(r_raw)
        img = shade(n, mask, alb, rough)
        loss = ((img - target) ** 2).mean()
        hist.append(np.r_[alb.detach().numpy(), rough.item()]); losses.append(loss.item())
        if it in (0, 25, 200):
            snaps[it] = img.detach()
        if it == 200:
            break
        opt.zero_grad(); loss.backward(); opt.step()
    hist = np.array(hist)
    print("brdf fit: final albedo", np.round(hist[-1, :3], 3), "roughness", round(hist[-1, 3], 3), "loss", f"{losses[-1]:.2e}")

    def disp(img):
        return np.clip(img.numpy(), 0, 1) ** (1 / 2.2)

    fig = plt.figure(figsize=(13, 7.6))
    gs = fig.add_gridspec(2, 4, height_ratios=[1, 1.15])
    for k, (key, ttl) in enumerate(((0, "it 0"), (25, "it 25"), (200, "it 200"), ("t", "target"))):
        ax = fig.add_subplot(gs[0, k])
        ax.imshow(disp(target if key == "t" else snaps[key]))
        ax.set_title(ttl); ax.axis("off")
    ax = fig.add_subplot(gs[1, :3])
    for k, (nm, col) in enumerate(((r"albedo R", C["x"]), ("albedo G", C["y"]), ("albedo B", C["z"]), (r"roughness $\rho$", C["a"]))):
        ax.plot(hist[:, k], color=col, lw=2.6, label=nm)
        ax.axhline([0.80, 0.35, 0.20, 0.35][k], color=col, lw=1.2, ls="--")
    ax.set_xlabel("Adam iteration"); ax.set_ylim(0, 1); ax.legend(ncol=2, fontsize=12.5, frameon=False)
    ax = fig.add_subplot(gs[1, 3])
    ax.plot(losses, color=C["dark"]); ax.set_yscale("log"); ax.set_xlabel("iteration"); ax.set_title("loss")
    fig.tight_layout()
    save(fig, out("brdf-fit"))


# ---------------------------------------------------------------------------
# 9. Volumes are smooth; sorted splats pop
# ---------------------------------------------------------------------------
def fig_volume_splat():
    p = np.linspace(-2, 2, 2001)                     # lateral position of the occluder (its width 1)
    surf = 1 - (np.abs(p) < 0.5)                     # opaque box: pixel sees white bg or black occluder
    tau = 3.0
    vol = np.exp(-tau * np.exp(-p ** 2 / (2 * 0.35 ** 2)))   # Gaussian blob: T = exp(-optical depth)
    dvol = np.gradient(vol, p)

    beta = np.linspace(-1, 1, 801)                   # camera rotation: the two depths swap at beta = 0
    a, s = 0.7, 0.8
    k = -np.log(1 - a) / (s * np.sqrt(2 * np.pi))   # density peak so that each blob alone has alpha = a
    t = np.linspace(-2, 12, 3000); dtt = t[1] - t[0]
    sorted_c, vol_c = [], []
    for b in beta:
        t1, t2 = 5 - b, 5 + b                        # blob 1 (red, c = 1), blob 2 (c = 0)
        sorted_c.append(a * 1 + (1 - a) * a * 0 if t1 < t2 else a * 0 + (1 - a) * a * 1)
        s1 = k * np.exp(-(t - t1) ** 2 / (2 * s * s)); s2 = k * np.exp(-(t - t2) ** 2 / (2 * s * s))
        Tt = np.exp(-np.cumsum(s1 + s2) * dtt)
        vol_c.append(np.sum(Tt * s1 * 1.0) * dtt)
    fig, axs = plt.subplots(1, 2, figsize=(13, 4.8))
    ax = axs[0]
    ax.plot(p, surf, color=C["dark"], lw=2.6, label="opaque surface")
    ax.plot(p, vol, color=C["a"], lw=2.6, label=r"volume: $e^{-\tau(p)}$")
    ax.plot(p, dvol / np.abs(dvol).max(), color=C["a"], lw=1.6, ls="--", label=r"its derivative (scaled)")
    ax.set_xlabel(r"occluder position $p$"); ax.set_ylabel("pixel value"); ax.legend(fontsize=12, frameon=False, loc="lower left")
    ax.set_ylim(-1.1, 1.15)
    ax = axs[1]
    ax.plot(beta, sorted_c, color=C["x"], lw=2.6, label="splats sorted by centre depth")
    ax.plot(beta, vol_c, color=C["z"], lw=2.6, label="exact volume integral")
    ax.set_xlabel(r"camera rotation $\beta$ (depth order swaps at 0)"); ax.set_ylabel("red channel")
    ax.legend(fontsize=12, frameon=False, loc="upper left"); ax.set_ylim(0, 1)
    fig.tight_layout()
    save(fig, out("volume-vs-splat"))


if __name__ == "__main__":
    fig_pipeline()
    fig_edge_coverage()
    fig_reynolds()
    fig_noise()
    fig_softras()
    fig_silhouette()
    fig_landscape()
    fig_large_steps()
    fig_brdf_fit()
    fig_volume_splat()
