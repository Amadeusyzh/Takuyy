"""Figures for neural-rendering post 03: fast radiance fields (grids, tensors, hash encodings).

    python3 bin/figures/neural-rendering/neural-rendering_03.py            # all figures
    python3 bin/figures/neural-rendering/neural-rendering_03.py hash_fit   # one figure

Everything is computed: FLOP counts from the post's numbers, real trilinear weights, a 1D DVGO
activation fit, CP / VM factorizations of a real volume, the Instant-NGP level resolutions and
spatial hash, a NumPy re-implementation of the post's 2D hash-grid image fit, an occupancy-grid
ray march and Zip-NeRF's erf downweighting. Conventions: right-handed, z up in the 3D plots.
"""
import math
import os
import pathlib
import sys

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")   # tiny matmuls: threading only adds overhead
os.environ.setdefault("OMP_NUM_THREADS", "1")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402
from scipy.optimize import minimize  # noqa: E402
from scipy.special import erf  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/neural-rendering"
PREVIEW = None  # set to a directory to also write PNG previews


def out(fig, name):
    if PREVIEW:
        pathlib.Path(PREVIEW).mkdir(parents=True, exist_ok=True)
        fig.savefig(pathlib.Path(PREVIEW) / (name.replace(".svg", ".png")), dpi=80)
    save(fig, OUT / name)


# ---------------------------------------------------------------- 1. cost of NeRF
def ray_weights(t, sigma):
    delta = np.append(np.diff(t), 1e10)
    alpha = 1 - np.exp(-sigma * delta)
    T = np.cumprod(np.append(1.0, 1 - alpha[:-1] + 1e-10))
    return T * alpha, T


def fig_cost():
    # numbers of section 1 of the post
    flops_eval = 8 * 256**2 * 2                     # one evaluation of the 8x256 trunk
    evals_batch = 4096 * (64 + 192)                 # 4096 rays x 256 samples
    flops_batch = evals_batch * flops_eval
    flops_train = flops_batch * 200_000
    evals_frame = 800 * 800 * (64 + 192)
    flops_frame = evals_frame * flops_eval
    vals = [flops_eval, flops_batch, flops_frame, flops_train]

    # a toy ray: one opaque surface at t = 0.62 (plus a faint blob) seen through 256 samples
    t = np.linspace(0.0, 1.0, 256)
    sigma = 400 * np.exp(-0.5 * ((t - 0.62) / 0.012) ** 2) + 2 * np.exp(-0.5 * ((t - 0.3) / 0.03) ** 2)
    w, T = ray_weights(t, sigma)
    useful = w > 1e-3

    for lang in LANGS:
        fig, (a0, a1) = plt.subplots(2, 1, figsize=(9, 9.6))
        names = [label(lang, "1 MLP eval", "1 次 MLP 求值", "MLP 1 回"),
                 label(lang, "1 batch\n4096 rays", "1 个批次\n4096 条光线", "1 バッチ\n4096 レイ"),
                 label(lang, "1 frame\n800x800", "1 帧\n800x800", "1 フレーム\n800x800"),
                 label(lang, "training\n200k iters", "训练\n20 万次迭代", "学習\n20 万反復")]
        cols = [C["gray"], C["a"], C["b"], C["x"]]
        y = np.arange(4)[::-1]
        a0.barh(y, np.log10(vals), color=cols, height=0.62)
        for yi, v in zip(y, vals):
            e = math.floor(math.log10(v)); m = v / 10**e
            a0.text(math.log10(v) + 0.25, yi, rf"${m:.1f}\times10^{{{e}}}$", va="center", fontsize=15)
        a0.set_yticks(y); a0.set_yticklabels(names)
        a0.set_xlim(0, 21.5)
        a0.set_xlabel(label(lang, "forward FLOPs (log10)", "前向 FLOPs（log10）", "順伝播 FLOPs（log10）"))
        a0.grid(axis="y", visible=False)

        a1.fill_between(t, 0, sigma / sigma.max(), color=C["fill"], label=r"$\sigma/\max\sigma$")
        a1.plot(t, T, color=C["z"], label=r"$T(t)$")
        a1.vlines(t[~useful], 0, 0.06, color=C["gray"], lw=1.0)
        a1.vlines(t[useful], 0, 0.06, color=C["x"], lw=1.6)
        a1.plot(t, w / w.max(), color=C["x"], label=r"$w_i/\max w$")
        a1.set_xlabel("$t$"); a1.set_ylim(-0.02, 1.08)
        a1.text(0.02, 0.62, label(lang, f"only {useful.sum()} of 256 samples have",
                                  f"256 个采样中只有 {useful.sum()} 个满足",
                                  f"256 サンプル中 {useful.sum()} 個だけが"),
                 transform=a1.transAxes, fontsize=15, color=C["x"])
        a1.text(0.02, 0.52, r"$w_i>10^{-3}$", transform=a1.transAxes, fontsize=16, color=C["x"])
        a1.legend(loc="upper right", fontsize=13, frameon=False)
        fig.tight_layout()
        out(fig, f"03-nerf-cost_{lang}.svg")


# ---------------------------------------------------------------- 2. trilinear + sparse grid
def cube_faces(o, s):
    x, y, z = o
    v = np.array([[x, y, z], [x + s, y, z], [x + s, y + s, z], [x, y + s, z],
                  [x, y, z + s], [x + s, y, z + s], [x + s, y + s, z + s], [x, y + s, z + s]])
    return [v[[0, 1, 2, 3]], v[[4, 5, 6, 7]], v[[0, 1, 5, 4]], v[[2, 3, 7, 6]], v[[1, 2, 6, 5]], v[[0, 3, 7, 4]]]


def fig_trilinear():
    p = np.array([0.3, 0.65, 0.4])          # fractional position inside the cell
    fig = plt.figure(figsize=(12, 6))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    ax.add_collection3d(Poly3DCollection(cube_faces((0, 0, 0), 1), facecolor=(0.58, 0.40, 0.74, 0.05),
                                         edgecolor=C["gray"], lw=1.2))
    tot = 0
    for c in np.ndindex(2, 2, 2):
        c = np.array(c)
        w = np.prod(np.where(c == 1, p, 1 - p))
        tot += w
        ax.scatter(*c, s=2400 * w + 30, color=C["a"], alpha=0.85, depthshade=False)
        ax.plot(*zip(p, c), color=C["a"], lw=0.8 + 6 * w, alpha=0.5)
        off = (c - 0.5) * 0.28
        ax.text(*(c + off), f"{w:.3f}", fontsize=14, ha="center", color=C["dark"])
    ax.scatter(*p, s=120, color=C["x"], depthshade=False, zorder=10)
    ax.text(p[0] - 0.12, p[1], p[2] + 0.08, r"$\mathbf{x}$", color=C["x"], fontsize=20)
    ax.set_xlim(-0.2, 1.2); ax.set_ylim(-0.2, 1.2); ax.set_zlim(-0.2, 1.2); ax.set_box_aspect((1, 1, 1))
    ax.set_xlabel("$x$", color=C["x"]); ax.set_ylabel("$y$", color=C["y"]); ax.set_zlabel("$z$", color=C["z"])
    ax.set_xticks([0, 1]); ax.set_yticks([0, 1]); ax.set_zticks([0, 1])
    ax.view_init(elev=20, azim=-58)
    ax.set_title(rf"$\mathbf{{x}}$ = ({p[0]}, {p[1]}, {p[2]}),  $\sum w$ = {tot:.3f}", fontsize=15)
    assert abs(tot - 1) < 1e-12

    # sparse grid: voxels of a 16^3 grid that intersect a spherical shell (the surface)
    n = 16
    ax2 = fig.add_subplot(1, 2, 2, projection="3d")
    g = (np.arange(n + 1) / n) * 2 - 1
    X, Y, Z = np.meshgrid(g, g, g, indexing="ij")
    sd = np.sqrt(X**2 + Y**2 + Z**2) - 0.75            # signed distance at vertices
    anypos = np.zeros((n, n, n), bool); anyneg = np.zeros((n, n, n), bool)
    for c in np.ndindex(2, 2, 2):
        sl = tuple(slice(ci, ci + n) for ci in c)
        anypos |= sd[sl] > 0; anyneg |= sd[sl] <= 0
    surf = anypos & anyneg                               # voxels the surface passes through
    vis = surf.copy()
    vis[:, : n // 2, n // 2:] = False                    # cut away an octant-ish wedge to see inside
    ax2.voxels(vis, facecolors=(0.58, 0.40, 0.74, 0.55), edgecolors=(0.25, 0.15, 0.35, 0.5), linewidth=0.3)
    ax2.set_box_aspect((1, 1, 1))
    ax2.set_xticks([]); ax2.set_yticks([]); ax2.set_zticks([])
    ax2.set_title(rf"$16^3$: {surf.sum()} / {n**3} ({100 * surf.sum() / n**3:.0f}%)", fontsize=15)
    ax2.view_init(elev=22, azim=-58)
    fig.tight_layout()
    out(fig, "03-trilinear-sparse.svg")


# ---------------------------------------------------------------- 3. DVGO post-activation (1D)
def softplus(x):
    return np.logaddexp(0, x)


def fig_post_activation():
    ncell = 8
    xv = np.linspace(0, 1, ncell + 1)                    # grid vertices
    xs = np.linspace(0, 1, 801)
    delta = 1.0 / 64                                     # ray-marching step used for alpha
    target = (xs >= 0.56).astype(float)                  # an opaque surface inside cell [0.5, 0.625)
    i0 = np.minimum((xs * ncell).astype(int), ncell - 1)
    fr = xs * ncell - i0

    def lerp(v):
        return v[i0] * (1 - fr) + v[i0 + 1] * fr

    schemes = {
        "pre": lambda r: lerp(1 - np.exp(-softplus(r) * delta)),           # interpolate alpha
        "in": lambda r: 1 - np.exp(-lerp(softplus(r)) * delta),            # interpolate density
        "post": lambda r: 1 - np.exp(-softplus(lerp(r)) * delta),          # interpolate raw value
    }
    fits = {}
    for k, f in schemes.items():
        best = None
        inits = [np.random.default_rng(seed).uniform(-5, 5, ncell + 1) for seed in range(4)]
        inits += [(xv - 0.5) * 400, (xv - 0.56) * 1e5, (xv - 0.625) * 400]   # step-like starts
        for r0 in inits:
            res = minimize(lambda r: np.mean((f(r) - target) ** 2), r0, method="L-BFGS-B",
                           bounds=[(-1e5, 1e5)] * (ncell + 1))
            if best is None or res.fun < best.fun:
                best = res
        fits[k] = (f(best.x), best.fun)

    fig, ax = plt.subplots(figsize=(10, 4.8))
    for xvi in xv:
        ax.axvline(xvi, color=C["gray"], lw=0.8, alpha=0.5)
    ax.axvspan(0.5, 0.625, color=C["fill"], alpha=0.7)
    ax.plot(xs, target, color=C["dark"], lw=1.5, ls=":", label=r"$\alpha^\ast$")
    st = {"pre": (C["b"], r"$\mathrm{interp}(\alpha)$"), "in": (C["z"], r"$\alpha(\mathrm{interp}(\sigma))$"),
          "post": (C["x"], r"$\alpha(\mathrm{softplus}(\mathrm{interp}(\sigma_{\mathrm{raw}})))$")}
    for k, (y, mse) in fits.items():
        col, name = st[k]
        ax.plot(xs, y, color=col, lw=2.6 if k == "post" else 2.0, label=f"{name}   MSE {mse:.4f}")
    ax.set_xlim(0.25, 0.875)
    ax.set_xlabel("$x$")
    ax.set_ylabel(r"$\alpha$")
    ax.legend(loc="upper left", fontsize=13, frameon=True)
    ax.set_ylim(-0.03, 1.12)
    fig.tight_layout()
    out(fig, "03-post-activation.svg")
    return {k: v[1] for k, v in fits.items()}


# ---------------------------------------------------------------- 4. TensoRF CP / VM
def torus_volume(n=32):
    g = (np.arange(n) + 0.5) / n * 2 - 1
    X, Y, Z = np.meshgrid(g, g, g, indexing="ij")
    # tilt the object by 30 deg about the x axis so it is not aligned with the grid axes
    c, s = np.cos(np.pi / 6), np.sin(np.pi / 6)
    Y, Z = c * Y + s * Z, -s * Y + c * Z
    q = np.sqrt(X**2 + Y**2) - 0.55
    d1 = np.sqrt(q**2 + Z**2) - 0.22
    d2 = np.sqrt((X - 0.1) ** 2 + (Y + 0.1) ** 2 + (Z - 0.35) ** 2) - 0.3   # a ball on top
    d = np.minimum(d1, d2)
    return 1 / (1 + np.exp(d / 0.04))                     # soft occupancy in [0, 1]


def cp_als(V, R, iters=60, seed=0):
    rng = np.random.default_rng(seed)
    n = V.shape
    A = [rng.standard_normal((n[k], R)) for k in range(3)]
    for _ in range(iters):
        A[0] = np.einsum("ijk,jr,kr->ir", V, A[1], A[2]) @ np.linalg.pinv((A[1].T @ A[1]) * (A[2].T @ A[2]))
        A[1] = np.einsum("ijk,ir,kr->jr", V, A[0], A[2]) @ np.linalg.pinv((A[0].T @ A[0]) * (A[2].T @ A[2]))
        A[2] = np.einsum("ijk,ir,jr->kr", V, A[0], A[1]) @ np.linalg.pinv((A[0].T @ A[0]) * (A[1].T @ A[1]))
    return np.einsum("ir,jr,kr->ijk", *A)


def vm_backfit(V, R, iters=30):
    """sum_r v^X_r M^YZ_r + v^Y_r M^XZ_r + v^Z_r M^XY_r. Each term is a rank-R matrix in one unfolding,
    so block-coordinate descent = truncated SVD of the residual in that unfolding."""
    n = V.shape[0]
    terms = [np.zeros_like(V) for _ in range(3)]
    for _ in range(iters):
        for k in range(3):
            Rk = V - sum(terms[j] for j in range(3) if j != k)
            Mk = np.moveaxis(Rk, k, 0).reshape(n, -1)
            U, s, Vt = np.linalg.svd(Mk, full_matrices=False)
            approx = (U[:, :R] * s[:R]) @ Vt[:R]
            terms[k] = np.moveaxis(approx.reshape(n, n, n), 0, k)
    return sum(terms)


def psnr(a, b):
    return -10 * np.log10(np.mean((a - b) ** 2))


def fig_tensorf():
    n = 32
    V = torus_volume(n)
    cp_R = [1, 2, 4, 8, 16, 32, 64]
    vm_R = [1, 2, 3, 4, 6, 8]
    cp = [(R * 3 * n, psnr(cp_als(V, R), V)) for R in cp_R]
    vm = [(R * 3 * (n + n * n), psnr(vm_backfit(V, R), V)) for R in vm_R]
    cp_show, vm_show = cp_als(V, 16), vm_backfit(V, 2)

    fig = plt.figure(figsize=(15, 9.2))
    # (a) one VM component as geometry: vector along x times a matrix on the yz plane
    ax = fig.add_subplot(2, 3, 1, projection="3d")
    m = 12
    yy, zz = np.meshgrid(np.linspace(0, 1, m), np.linspace(0, 1, m), indexing="ij")
    M = np.sin(3 * yy) * np.cos(2.5 * zz - 0.5) * 0.5 + 0.5
    ax.plot_surface(np.zeros_like(yy), yy, zz, facecolors=plt.cm.viridis(M), shade=False, alpha=0.9)
    xv = np.linspace(0, 1, m)
    vx = 0.5 + 0.4 * np.sin(4 * xv)
    ax.scatter(xv, np.full(m, -0.05), np.zeros(m), c=plt.cm.viridis(vx), s=90, depthshade=False)
    ax.plot([0, 1], [-0.05, -0.05], [0, 0], color=C["x"], lw=2)
    ax.text(0.35, -0.1, -0.32, r"$v^X_r(x)$", color=C["x"], fontsize=16)
    ax.text(-0.1, 0.55, 1.1, r"$M^{YZ}_r(y,z)$", color=C["z"], fontsize=16)
    ax.add_collection3d(Poly3DCollection(cube_faces((0, 0, 0), 1), facecolor=(0, 0, 0, 0), edgecolor=C["gray"], lw=0.6))
    ax.set_xlim(0, 1.1); ax.set_ylim(-0.1, 1); ax.set_zlim(0, 1.1); ax.set_box_aspect((1, 1, 1))
    ax.set_ylabel("$y$", labelpad=-8); ax.set_zlabel("$z$", labelpad=-8)
    ax.set_xticks([]); ax.set_yticks([]); ax.set_zticks([])
    ax.view_init(elev=22, azim=-50)
    ax.set_title(r"$v^X_r \otimes M^{YZ}_r$", fontsize=15)

    # (b) error vs parameter count
    ax = fig.add_subplot(2, 3, (2, 3))
    ax.plot([c[0] for c in cp], [c[1] for c in cp], "o-", color=C["b"], label="CP")
    for (p_, s_), R in zip(cp, cp_R):
        ax.annotate(f"R={R}", (p_, s_), textcoords="offset points", xytext=(0, -20), ha="center", fontsize=12, color=C["b"])
    ax.plot([c[0] for c in vm], [c[1] for c in vm], "s-", color=C["a"], label="VM")
    for (p_, s_), R in zip(vm, vm_R):
        ax.annotate(f"R={R}", (p_, s_), textcoords="offset points", xytext=(0, 10), ha="center", fontsize=12, color=C["a"])
    ax.axvline(n**3, color=C["dark"], ls="--", lw=1.5)
    ax.text(n**3 * 0.93, ax.get_ylim()[0] + 1, rf"$32^3$ = {n**3}", rotation=90, ha="right", va="bottom", fontsize=13)
    ax.set_xscale("log")
    ax.set_xlabel("# params"); ax.set_ylabel("PSNR (dB)")
    ax.legend(loc="upper left", frameon=False)

    # (c) slices
    k = n // 2 + 5
    for i, (vol, title) in enumerate([(V, "GT"), (cp_show, f"CP R=16: {psnr(cp_show, V):.1f} dB"),
                                      (vm_show, f"VM R=2: {psnr(vm_show, V):.1f} dB")]):
        a = fig.add_subplot(2, 3, 4 + i)
        a.imshow(np.clip(vol[:, :, k].T, 0, 1), origin="lower", cmap="magma", vmin=0, vmax=1, extent=[-1, 1, -1, 1])
        a.set_title(title, fontsize=15); a.set_xticks([]); a.set_yticks([]); a.grid(False)
        a.set_xlabel("$x$"); a.set_ylabel("$y$")
    fig.tight_layout()
    out(fig, "03-tensorf.svg")
    return cp, vm


# ---------------------------------------------------------------- 5. hash grid levels
PRIMES = [1, 2654435761, 805459861]


def levels(L=16, N_min=16, N_max=512):
    b = math.exp((math.log(N_max) - math.log(N_min)) / (L - 1))
    return [math.floor(N_min * b**l) for l in range(L)], b


def hash2(i0, i1, T):
    return ((i0.astype(np.int64) * PRIMES[0]) ^ (i1.astype(np.int64) * PRIMES[1])) & (T - 1)


def target_image(n=512):
    yy, xx = np.meshgrid(np.linspace(0, 1, n), np.linspace(0, 1, n), indexing="ij")
    return np.stack([0.5 + 0.5 * np.sin(40 * xx * yy), ((np.floor(xx * 16) + np.floor(yy * 16)) % 2),
                     0.5 + 0.5 * np.cos(60 * (xx - 0.5) ** 2 + 60 * (yy - 0.5) ** 2)], -1)


def fig_hash_levels():
    T = 2**15
    res, b = levels()
    nv = np.array([(r + 1) ** 2 for r in res])
    dense = nv <= T
    img = target_image()

    fig = plt.figure(figsize=(11, 11))
    ax = fig.add_subplot(2, 2, (1, 2))
    ax.bar(np.arange(16), nv, color=[C["y"] if d else C["b"] for d in dense])
    ax.axhline(T, color=C["x"], lw=2)
    ax.text(0.2, T * 1.25, r"$T=2^{15}$", color=C["x"], fontsize=15)
    ax.set_yscale("log"); ax.set_xlabel("$l$"); ax.set_ylabel(r"$(N_l+1)^2$")
    for l in (0, 5, 10, 15):
        ax.text(l, nv[l] * 1.4, f"{res[l]}", ha="center", fontsize=12)
    ax.set_title(rf"$N_l=\lfloor 16\,b^l\rfloor$, $b={b:.3f}$", fontsize=15)
    ax.grid(axis="x", visible=False)

    # grids of three levels over a crop of the target
    ax = fig.add_subplot(2, 2, 3)
    crop = 0.125
    m = int(512 * crop)
    ax.imshow(img[:m, :m].mean(-1), origin="lower", extent=[0, crop, 0, crop], cmap="Greys", vmin=-0.6, vmax=1.6)
    for l, col, lw in ((10, C["c"], 1.0), (5, C["b"], 2.0), (0, C["x"], 3.4)):
        g = np.arange(0, res[l] * crop + 1) / res[l]
        for v in g:
            ax.axvline(v, color=col, lw=lw); ax.axhline(v, color=col, lw=lw)
    for l, col in ((0, C["x"]), (5, C["b"]), (10, C["c"])):
        ax.plot([], [], color=col, lw=3, label=f"$l$={l}: $N$={res[l]}")
    ax.set_xlim(0, crop); ax.set_ylim(0, crop); ax.grid(False)
    ax.set_xticks([0, crop]); ax.set_yticks([0, crop])
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.06), fontsize=13, ncol=1, frameon=False)

    # finest level: which vertices share a table slot
    ax = fig.add_subplot(2, 2, 4)
    N = res[-1]
    i0, i1 = np.meshgrid(np.arange(N + 1), np.arange(N + 1), indexing="ij")
    h = hash2(i0, i1, T)
    counts = np.bincount(h.ravel(), minlength=T)
    sel = h[37, 211]
    same = np.argwhere(h == sel)
    ax.imshow(img.mean(-1), origin="lower", extent=[0, 1, 0, 1], cmap="Greys", vmin=-0.6, vmax=1.6)
    ax.scatter(same[:, 0] / N, same[:, 1] / N, s=140, color=C["x"], edgecolor="white", lw=1.5, zorder=5)
    ax.scatter([37 / N], [211 / N], s=320, facecolor="none", edgecolor=C["dark"], lw=2.2, zorder=6)
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.grid(False)
    ax.set_title(rf"$l$=15: $(N+1)^2/T$ = {(N + 1) ** 2} / {T} = {(N + 1) ** 2 / T:.1f}", fontsize=14)
    ax.text(0.02, 0.02, rf"slot {sel}: {len(same)} $\times$",
            fontsize=13, transform=ax.transAxes, bbox=dict(facecolor="white", alpha=0.85, edgecolor="none"))
    fig.tight_layout()
    out(fig, "03-hash-levels.svg")
    return res, nv, dense, counts


# ---------------------------------------------------------------- 6. NumPy hash-grid image fit
class HashFit:
    """NumPy port of the post's HashEncoding (D=2) + Linear(32,64)-ReLU-Linear(64,3), trained with Adam.
    A dense level only ever touches its first (N_l+1)^2 table rows, and Adam leaves rows with zero
    gradient history at exactly zero update, so we store just min(T, ~(N_l+1)^2) rows per level:
    the same optimisation as the post's PyTorch code, with less memory traffic."""

    def __init__(self, log2_T, L=16, F=2, N_min=16, N_max=512, seed=0):
        rng = np.random.default_rng(seed)
        self.T, self.L, self.F = 2**log2_T, L, F
        self.res, _ = levels(L, N_min, N_max)
        full = rng.uniform(-1e-4, 1e-4, (L, self.T, F)).astype(np.float32)
        # (the dense index reaches (N+1)(N+2) at x = 1, i.e. one row past the grid, exactly as in PyTorch)
        self.tab = [full[l, :min(self.T, (r + 1) * (r + 2) + 1)].copy() for l, r in enumerate(self.res)]
        # PyTorch default Linear init: U(-1/sqrt(fan_in), 1/sqrt(fan_in))
        k1, k2 = 1 / math.sqrt(L * F), 1 / math.sqrt(64)
        self.p = dict(W1=rng.uniform(-k1, k1, (L * F, 64)), b1=rng.uniform(-k1, k1, 64),
                      W2=rng.uniform(-k2, k2, (64, 3)), b2=rng.uniform(-k2, k2, 3))
        self.p = {k: v.astype(np.float32) for k, v in self.p.items()}
        self.m = {k: np.zeros_like(v) for k, v in self.p.items()}; self.v = {k: np.zeros_like(v) for k, v in self.p.items()}
        self.mt = [np.zeros_like(t) for t in self.tab]; self.vt = [np.zeros_like(t) for t in self.tab]; self.t = 0

    def index(self, i0, i1, l):
        n = self.res[l] + 1
        if n * n <= self.T:
            return i0 + i1 * n
        return hash2(i0, i1, self.T)

    def encode(self, x):
        feats, cache = [], []
        for l in range(self.L):
            xs = x * self.res[l]
            x0 = np.floor(xs); w = (xs - x0).astype(np.float32); x0 = x0.astype(np.int64)
            idx, cw = [], []
            for c0 in (0, 1):
                for c1 in (0, 1):
                    idx.append(self.index(x0[:, 0] + c0, x0[:, 1] + c1, l))
                    cw.append((w[:, 0] if c0 else 1 - w[:, 0]) * (w[:, 1] if c1 else 1 - w[:, 1]))
            idx, cw = np.stack(idx, 1), np.stack(cw, 1)
            feats.append((cw[..., None] * self.tab[l][idx]).sum(1))
            cache.append((idx, cw))
        return np.concatenate(feats, -1), cache

    def predict(self, x, chunk=65536):
        out_ = []
        for s in range(0, len(x), chunk):
            e, _ = self.encode(x[s:s + chunk])
            hdn = np.maximum(e @ self.p["W1"] + self.p["b1"], 0)
            out_.append(hdn @ self.p["W2"] + self.p["b2"])
        return np.concatenate(out_)

    def step(self, x, y, lr=1e-2, b1=0.9, b2=0.99, eps=1e-15, wd=1e-6):
        e, cache = self.encode(x)
        a = e @ self.p["W1"] + self.p["b1"]; hdn = np.maximum(a, 0)
        pred = hdn @ self.p["W2"] + self.p["b2"]
        g = (2 * (pred - y) / pred.size).astype(np.float32)
        grads = dict(W2=hdn.T @ g, b2=g.sum(0))
        gh = (g @ self.p["W2"].T) * (a > 0)
        grads["W1"] = e.T @ gh; grads["b1"] = gh.sum(0)
        ge = gh @ self.p["W1"].T                              # (B, L*F)
        self.t += 1
        bc1, bc2 = 1 - b1**self.t, 1 - b2**self.t
        for k in self.p:                                      # PyTorch Adam: weight decay added to the gradient
            gk = grads[k] + (wd * self.p[k])
            self.m[k] = b1 * self.m[k] + (1 - b1) * gk; self.v[k] = b2 * self.v[k] + (1 - b2) * gk**2
            self.p[k] -= lr * (self.m[k] / bc1) / (np.sqrt(self.v[k] / bc2) + eps)
        for l, (idx, cw) in enumerate(cache):                 # scatter-add the table gradients, then Adam
            gl = ge[:, l * self.F:(l + 1) * self.F]
            rows = len(self.tab[l])
            gt = np.stack([np.bincount(idx.ravel(), weights=(cw * gl[:, f:f + 1]).ravel(), minlength=rows)
                           for f in range(self.F)], -1).astype(np.float32)
            self.mt[l] *= b1; self.mt[l] += (1 - b1) * gt
            self.vt[l] *= b2; self.vt[l] += (1 - b2) * gt * gt
            self.tab[l] -= lr * (self.mt[l] / bc1) / (np.sqrt(self.vt[l] / bc2) + eps)
        return np.mean((pred - y) ** 2)


def fig_hash_fit(steps=300, every=25):
    n = 512
    img = target_image(n)
    yy, xx = np.meshgrid(np.linspace(0, 1, n), np.linspace(0, 1, n), indexing="ij")
    coords, colors = np.stack([xx, yy], -1).reshape(-1, 2), img.reshape(-1, 3)
    ev = (np.arange(n)[:, None] % 2 == 0) & (np.arange(n)[None, :] % 2 == 0)
    ev_x, ev_y = coords[ev.ravel()], colors[ev.ravel()]
    curves, recon = {}, None
    for log2_T in (10, 12, 15, 19):
        model = HashFit(log2_T)
        rng = np.random.default_rng(1)
        xs, ps = [], []
        for s in range(steps + 1):
            if s % every == 0:                               # PSNR on every other pixel (65k of 262k)
                mse = np.mean((model.predict(ev_x) - ev_y) ** 2)
                xs.append(s); ps.append(-10 * np.log10(mse))
                print(f"  log2_T={log2_T} step {s}: {ps[-1]:.1f} dB", flush=True)
            if s < steps:
                idx = rng.integers(0, len(coords), 2**14)
                model.step(coords[idx], colors[idx])
        curves[log2_T] = (xs, ps)
        if log2_T == 15:
            recon = np.clip(model.predict(coords).reshape(n, n, 3), 0, 1)

    fig = plt.figure(figsize=(10, 10.5))
    a = fig.add_subplot(2, 2, 1); a.imshow(img, origin="lower"); a.set_title("GT 512x512", fontsize=15)
    a.set_xticks([]); a.set_yticks([]); a.grid(False)
    a = fig.add_subplot(2, 2, 2); a.imshow(recon, origin="lower")
    a.set_title(rf"$T=2^{{15}}$, step {steps}: {curves[15][1][-1]:.1f} dB", fontsize=15)
    a.set_xticks([]); a.set_yticks([]); a.grid(False)
    a = fig.add_subplot(2, 2, (3, 4))
    cols = {10: C["gray"], 12: C["b"], 15: C["a"], 19: C["y"]}
    for k, (xs, ps) in curves.items():
        a.plot(xs, ps, "o-", ms=4, color=cols[k], label=rf"$T=2^{{{k}}}$")
    a.set_xlabel("step"); a.set_ylabel("PSNR (dB)"); a.legend(fontsize=13, frameon=False, loc="lower right")
    fig.tight_layout()
    out(fig, "03-hash-fit.svg")
    return {k: v[1][-1] for k, v in curves.items()}


# ---------------------------------------------------------------- 7. occupancy grid + early stop
def fig_occupancy():
    # 2D scene: two blobs; a 32x32 occupancy grid marks cells whose max density exceeds a threshold
    def sigma(p):
        d1 = np.linalg.norm(p - np.array([0.62, 0.55]), axis=-1)
        d2 = np.linalg.norm(p - np.array([0.30, 0.78]), axis=-1)
        return 300 / (1 + np.exp((d1 - 0.13) / 0.006)) + 300 / (1 + np.exp((d2 - 0.08) / 0.006))

    G = 32
    sub = (np.arange(4) + 0.5) / 4
    occ = np.zeros((G, G), bool)
    for i in range(G):
        for j in range(G):
            pts = np.stack(np.meshgrid((i + sub) / G, (j + sub) / G, indexing="ij"), -1).reshape(-1, 2)
            occ[i, j] = sigma(pts).max() > 0.01
    o = np.array([0.05, 0.12]); d = np.array([0.62, 0.55]) - o; d /= np.linalg.norm(d)
    tmax = 1.25
    dt = tmax / 512
    t = (np.arange(512) + 0.5) * dt
    P = o + t[:, None] * d
    inside = (P >= 0).all(1) & (P < 1).all(1)
    cell = np.clip((P * G).astype(int), 0, G - 1)
    keep = inside & occ[cell[:, 0], cell[:, 1]]
    # march only kept samples, stop when transmittance < 1e-4
    Tr, used = 1.0, []
    for k in np.nonzero(keep)[0]:
        used.append(k)
        Tr *= np.exp(-sigma(P[k]) * dt)
        if Tr < 1e-4:
            break
    used = np.array(used)

    fig, ax = plt.subplots(figsize=(8.4, 8))
    gx = np.linspace(0, 1, 400)
    S = sigma(np.stack(np.meshgrid(gx, gx, indexing="ij"), -1))
    for i in range(G):
        for j in range(G):
            if occ[i, j]:
                ax.add_patch(Rectangle((i / G, j / G), 1 / G, 1 / G, facecolor=C["fill"], edgecolor=C["a"], lw=0.6, alpha=0.6))
    ax.imshow(np.ma.masked_less(S.T, 1), origin="lower", extent=[0, 1, 0, 1], cmap="YlOrBr", vmin=-150, vmax=320, alpha=0.95, zorder=3)
    Pi = P[inside]
    ax.plot(Pi[:, 0], Pi[:, 1], ".", color=C["gray"], ms=2.5, zorder=4)
    ax.plot(P[used, 0], P[used, 1], "o", color=C["x"], ms=5, zorder=5)
    ax.annotate("", xy=o + 0.12 * d, xytext=o, arrowprops=dict(arrowstyle="-|>", color=C["dark"], lw=2.2))
    ax.text(*(o + np.array([0.02, -0.05])), r"$\mathbf{o}$", fontsize=18)
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.set_aspect("equal"); ax.grid(False)
    ax.set_xticks([]); ax.set_yticks([])
    ax.set_title(rf"{inside.sum()} $\rightarrow$ {len(used)}    ({occ.sum()}/{G * G}, $T<10^{{-4}}$)", fontsize=16)
    fig.tight_layout()
    out(fig, "03-occupancy.svg")
    return inside.sum(), len(used), occ.sum()


# ---------------------------------------------------------------- 8. Zip-NeRF multisampling + erf weights
def fig_zipnerf():
    fig = plt.figure(figsize=(10, 10))
    ax = fig.add_subplot(2, 1, 1, projection="3d")
    # cone along +x with apex at the camera; half-angle radius r(t) = rdot * t
    rdot = 0.18
    t0, t1 = 2.0, 2.8
    th = np.linspace(0, 2 * np.pi, 48)
    tl = np.linspace(0.0, 3.6, 30)
    TT, TH = np.meshgrid(tl, th, indexing="ij")
    ax.plot_surface(TT, rdot * TT * np.cos(TH), rdot * TT * np.sin(TH), color=C["z"], alpha=0.06, lw=0)
    tf = np.linspace(t0, t1, 12)
    TT, TH = np.meshgrid(tf, th, indexing="ij")
    ax.plot_surface(TT, rdot * TT * np.cos(TH), rdot * TT * np.sin(TH), color=C["a"], alpha=0.25, lw=0)
    for tt in (t0, t1):
        ax.plot(np.full_like(th, tt), rdot * tt * np.cos(th), rdot * tt * np.sin(th), color=C["a"], lw=1.5)
    ax.plot([0, 3.8], [0, 0], [0, 0], color=C["dark"], lw=1.5, ls="--")
    # 6 points on a spiral: 2 full turns spread linearly over [t0, t1] at radius ~ r(t)/sqrt(2)
    k = np.arange(6)
    tj = t0 + (k + 0.5) / 6 * (t1 - t0)
    ang = 2 * np.pi * 2 * (k + 0.5) / 6
    rj = rdot * tj / np.sqrt(2)
    sp = np.stack([tj, rj * np.cos(ang), rj * np.sin(ang)], 1)
    ts = np.linspace(t0, t1, 120); angs = 2 * np.pi * 2 * (ts - t0) / (t1 - t0)
    ax.plot(ts, rdot * ts / np.sqrt(2) * np.cos(angs), rdot * ts / np.sqrt(2) * np.sin(angs), color=C["x"], lw=1, alpha=0.6)
    ax.scatter(*sp.T, color=C["x"], s=60, depthshade=False)
    ax.scatter([0], [0], [0], color=C["dark"], s=40)
    ax.text(0, 0, -0.25, r"$\mathbf{o}$", fontsize=16)
    ax.set_xlim(0, 3.8); ax.set_ylim(-0.8, 0.8); ax.set_zlim(-0.8, 0.8); ax.set_box_aspect((3.8, 1.6, 1.6), zoom=1.45)
    ax.set_xticks([]); ax.set_yticks([]); ax.set_zticks([])
    ax.view_init(elev=18, azim=-70)

    ax = fig.add_subplot(2, 1, 2)
    sn = np.logspace(-2, 1, 400)
    wgt = erf(1 / np.sqrt(8 * sn**2))
    ax.semilogx(sn, wgt, color=C["a"], lw=2.6)
    res, _ = levels(16, 16, 512)
    sig = 1 / 64
    for r in res:
        ax.plot(sig * r, erf(1 / np.sqrt(8 * (sig * r) ** 2)), "o", color=C["b"], ms=7)
    ax.set_xlabel(r"$\sigma\, n$")
    ax.set_ylabel(r"$\mathrm{erf}(1/\sqrt{8\sigma^2 n^2})$")
    ax.text(0.012, 0.25, r"$n=N_l,\ l=0,\dots,15,\ \sigma=1/64$", fontsize=13, color=C["b"])
    ax.set_ylim(0, 1.05)
    fig.tight_layout()
    out(fig, "03-zipnerf.svg")


FIGS = dict(cost=fig_cost, trilinear=fig_trilinear, post_activation=fig_post_activation, tensorf=fig_tensorf,
            hash_levels=fig_hash_levels, hash_fit=fig_hash_fit, occupancy=fig_occupancy, zipnerf=fig_zipnerf)

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for a in sys.argv[1:]:
        if a.startswith("--preview="):
            PREVIEW = a.split("=", 1)[1]
    for name in (args or FIGS):
        r = FIGS[name]()
        if r is not None:
            print(name, r)
