"""Figures for graphics post 10 (volumes and participating media).

Every curve, image and point cloud is computed: transmittance by quadrature, Henyey-Greenstein
sampling with the post's inverse CDF, a single-scattering ray marcher over a procedural cloud
stored in a dense grid, delta / ratio / residual ratio tracking as real Monte Carlo runs,
random walks in a slab, a single-scattering atmosphere, the dipole and Burley diffusion profiles,
and alpha compositing as quadrature. Labels are language-neutral (symbols only).

    python3 bin/figures/graphics/graphics_10.py
"""
import pathlib
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics"
INV4PI = 1.0 / (4.0 * np.pi)


def out(name):
    return OUT / f"10-{name}.svg"


# ---------------------------------------------------------------------------
# Shared helpers (the post's functions)
# ---------------------------------------------------------------------------
def density_1d(t):
    """Heterogeneous extinction sigma_t(t) along a ray of length 10 (used in several figures)."""
    return (0.1 + 1.0 * np.exp(-((t - 2.0) / 0.45) ** 2)
            + 0.6 * np.exp(-((t - 5.2) / 0.8) ** 2)
            + 1.6 * np.exp(-((t - 7.4) / 0.25) ** 2))


trapz = getattr(np, "trapezoid", None) or getattr(np, "trapz")   # NumPy 2 renamed trapz


def cumtrapz(y, x):
    return np.concatenate([[0.0], np.cumsum(0.5 * (y[1:] + y[:-1]) * np.diff(x))])


def hg(cos_t, g):
    """Henyey-Greenstein phase function, normalized over the sphere (1/sr)."""
    return INV4PI * (1 - g * g) / (1 + g * g - 2 * g * cos_t) ** 1.5


def sample_hg_cos(g, xi):
    """Inverse-CDF sample of cos(theta) for HG (theta measured from the forward direction)."""
    if abs(g) < 1e-3:
        return 1 - 2 * xi
    s = (1 - g * g) / (1 - g + 2 * g * xi)
    return (1 + g * g - s * s) / (2 * g)


def rayleigh(cos_t):
    return 3.0 / (16.0 * np.pi) * (1 + cos_t ** 2)


def draine(cos_t, g, alpha):
    return hg(cos_t, g) * (1 + alpha * cos_t ** 2) / (1 + alpha * (1 + 2 * g * g) / 3)


def rotate_to(d, cos_t, phi):
    """Directions at angle theta (cos_t) and azimuth phi around unit vectors d (..., 3)."""
    sin_t = np.sqrt(np.clip(1 - cos_t ** 2, 0, None))
    helper = np.where(np.abs(d[..., 0:1]) < 0.9, np.array([1.0, 0.0, 0.0]), np.array([0.0, 1.0, 0.0]))
    u = np.cross(helper, d)
    u /= np.linalg.norm(u, axis=-1, keepdims=True)
    v = np.cross(d, u)
    return ((sin_t * np.cos(phi))[..., None] * u + (sin_t * np.sin(phi))[..., None] * v
            + cos_t[..., None] * d)


def tonemap(x, exposure=1.0):
    y = 1 - np.exp(-np.clip(x, 0, None) * exposure)
    return np.clip(y, 0, 1) ** (1 / 2.2)


# ---------------------------------------------------------------------------
# 1. Beer-Lambert
# ---------------------------------------------------------------------------
def fig_beer_lambert():
    d = np.linspace(0, 6, 400)
    fig, axs = plt.subplots(1, 2, figsize=(10, 4.2))
    cols = [C["c"], C["z"], C["a"], C["x"]]
    for s, c in zip([0.25, 0.5, 1.0, 2.0], cols):
        T = np.exp(-s * d)
        axs[0].plot(d, T, color=c, label=fr"$\sigma_t={s:g}$")
        axs[0].plot([1 / s], [np.exp(-1)], "o", color=c, ms=7)
        axs[1].semilogy(d, T, color=c)
    axs[0].axhline(np.exp(-1), color=C["gray"], ls="--", lw=1.2)
    axs[0].text(5.9, np.exp(-1) + 0.03, r"$e^{-1}$", ha="right", color=C["gray"])
    axs[0].set_xlabel(r"$d$")
    axs[0].set_ylabel(r"$T(d)=e^{-\sigma_t d}$")
    axs[0].legend(frameon=False)
    axs[0].set_title("(a)")
    axs[1].set_xlabel(r"$d$")
    axs[1].set_ylabel(r"$\log\,T$")
    axs[1].set_ylim(1e-5, 1.5)
    axs[1].set_title("(b)")
    fig.tight_layout()
    save(fig, out("beer-lambert"))


# ---------------------------------------------------------------------------
# 2. Heterogeneous transmittance and optical depth
# ---------------------------------------------------------------------------
def fig_heterogeneous():
    t = np.linspace(0, 10, 2001)
    s = density_1d(t)
    tau = cumtrapz(s, t)
    mean = tau[-1] / 10
    fig, axs = plt.subplots(2, 1, figsize=(9, 6.6), sharex=True)
    axs[0].fill_between(t, s, color=C["fill"])
    axs[0].plot(t, s, color=C["a"], label=r"$\sigma_t(t)$")
    axs[0].axhline(mean, color=C["b"], ls="--", lw=1.6, label=r"$\bar\sigma=\tau(10)/10$")
    axs[0].axhline(s.max(), color=C["dark"], ls=":", lw=1.6, label=r"$\max\,\sigma_t$")
    axs[0].set_ylabel(r"$\sigma_t$")
    axs[0].legend(frameon=False, loc="upper left", fontsize=13)
    axs[0].set_title("(a)")
    axs[1].plot(t, np.exp(-tau), color=C["a"], label=r"$T(t)=e^{-\tau(t)}$")
    axs[1].plot(t, np.exp(-mean * t), color=C["b"], ls="--", label=r"$e^{-\bar\sigma t}$")
    ax2 = axs[1].twinx()
    ax2.plot(t, tau, color=C["gray"], lw=1.4)
    ax2.set_ylabel(r"$\tau(t)$", color=C["gray"])
    ax2.grid(False)
    ax2.spines["right"].set_visible(True)
    axs[1].set_xlabel(r"$t$")
    axs[1].set_ylabel(r"$T$")
    axs[1].legend(frameon=False, loc="upper center", bbox_to_anchor=(0.47, 1.0), fontsize=13)
    axs[1].set_title("(b)")
    fig.tight_layout()
    save(fig, out("heterogeneous-transmittance"))
    print("  tau(10) = %.4f, T(10) = %.4f" % (tau[-1], np.exp(-tau[-1])))


# ---------------------------------------------------------------------------
# 3. Henyey-Greenstein lobes (log polar) and 3D samples
# ---------------------------------------------------------------------------
def fig_hg_lobes():
    fig = plt.figure(figsize=(11, 5.2))
    ax = fig.add_subplot(1, 2, 1, projection="polar")
    th = np.linspace(0, 2 * np.pi, 721)
    cols = [C["x"], C["gray"], C["c"], C["z"], C["a"]]
    for g, c in zip([-0.3, 0.0, 0.3, 0.6, 0.85], cols):
        r = np.log10(4 * np.pi * hg(np.cos(th), g)) + 2
        ax.plot(th, np.clip(r, 0, None), color=c, label=fr"$g={g:g}$")
    ax.set_rticks([1, 2, 3])
    ax.set_yticklabels(["0.1", "1", "10"], fontsize=12)
    ax.set_rlim(0, 4.1)
    ax.set_xticks(np.radians([0, 45, 90, 135, 180, 225, 270, 315]))
    ax.annotate("", xy=(np.pi, 0.0), xytext=(np.pi, 4.0),
                arrowprops=dict(arrowstyle="->", color=C["light"], lw=3))
    ax.legend(frameon=False, loc="upper left", bbox_to_anchor=(-0.32, 1.12), fontsize=12)
    ax.set_title(r"(a) $4\pi\,p(\theta)$, log", pad=14)

    ax3 = fig.add_subplot(1, 2, 2, projection="3d")
    rng = np.random.default_rng(3)
    n, g = 500, 0.7
    mu = sample_hg_cos(g, rng.random(n))
    phi = 2 * np.pi * rng.random(n)
    st = np.sqrt(np.clip(1 - mu ** 2, 0, None))
    P = np.stack([st * np.cos(phi), st * np.sin(phi), mu], -1)
    ax3.scatter(P[:, 0], P[:, 1], P[:, 2], c=mu, cmap="viridis", s=10, depthshade=False)
    uu, vv = np.meshgrid(np.linspace(0, 2 * np.pi, 40), np.linspace(0, np.pi, 20))
    ax3.plot_wireframe(np.cos(uu) * np.sin(vv), np.sin(uu) * np.sin(vv), np.cos(vv),
                       color=C["gray"], linewidth=0.3, alpha=0.4)
    arrow3d(ax3, (0, 0, -1.9), (0, 0, 1.75), C["light"], lw=3, label_text=r"$\omega$")
    ax3.set_xlim(-1.1, 1.1); ax3.set_ylim(-1.1, 1.1); ax3.set_zlim(-1.9, 1.1)
    ax3.set_box_aspect((1, 1, 1.36))
    ax3.set_xticklabels([]); ax3.set_yticklabels([]); ax3.set_zticklabels([])
    ax3.view_init(elev=18, azim=-60)
    ax3.set_title(r"(b) $g=0.7$, $N=500$, $\overline{\cos\theta}=%.2f$" % mu.mean())
    fig.tight_layout()
    save(fig, out("hg-lobes"))


# ---------------------------------------------------------------------------
# 4. Phase-function zoo and a histogram check of the HG sampler
# ---------------------------------------------------------------------------
def fig_phase_functions():
    fig = plt.figure(figsize=(11, 5.0))
    ax = fig.add_subplot(1, 2, 1, projection="polar")
    th = np.linspace(0, 2 * np.pi, 1441)
    mu = np.cos(th)
    curves = [
        (rayleigh(mu), C["z"], "Rayleigh"),
        (hg(mu, 0.76), C["b"], r"HG $g=0.76$"),
        (0.9 * hg(mu, 0.8) + 0.1 * hg(mu, -0.3), C["y"], r"$0.9\,\mathrm{HG}_{0.8}+0.1\,\mathrm{HG}_{-0.3}$"),
        (draine(mu, 0.76, 1.0), C["x"], r"Draine $g=0.76,\alpha=1$"),
    ]
    for p, c, lab in curves:
        ax.plot(th, np.clip(np.log10(4 * np.pi * p) + 2, 0, None), color=c, label=lab)
    ax.set_rticks([1, 2, 3])
    ax.set_yticklabels(["0.1", "1", "10"], fontsize=12)
    ax.set_rlim(0, 3.6)
    ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.08), ncol=2, fontsize=11)
    ax.set_title("(a)", pad=14)

    ax2 = fig.add_subplot(1, 2, 2)
    rng = np.random.default_rng(11)
    m = np.linspace(-1, 1, 400)
    for g, c in [(0.6, C["a"]), (-0.3, C["x"]), (0.0, C["gray"])]:
        smp = sample_hg_cos(g, rng.random(200000))
        ax2.hist(smp, bins=60, range=(-1, 1), density=True, color=c, alpha=0.3)
        ax2.plot(m, 2 * np.pi * hg(m, g), color=c,
                 label=fr"$g={g:g}$, $\overline{{\cos\theta}}={smp.mean():.3f}$")
    ax2.set_yscale("log")
    ax2.set_xlabel(r"$\cos\theta$")
    ax2.set_ylabel(r"$2\pi\,p(\cos\theta)$")
    ax2.legend(frameon=False, fontsize=12, loc="upper left")
    ax2.set_title("(b)")
    fig.tight_layout()
    save(fig, out("phase-functions"))


# ---------------------------------------------------------------------------
# Procedural cloud in a dense grid (used by the ray-marching figures)
# ---------------------------------------------------------------------------
_rng_noise = np.random.default_rng(7)
LAT = _rng_noise.random((32, 32, 32))


def vnoise(p):
    """Trilinear value noise with smoothstep weights on a periodic 32^3 lattice."""
    i = np.floor(p).astype(np.int64)
    f = p - i
    f = f * f * (3 - 2 * f)
    acc = 0.0
    for dx in (0, 1):
        wx = f[..., 0] if dx else 1 - f[..., 0]
        for dy in (0, 1):
            wy = f[..., 1] if dy else 1 - f[..., 1]
            for dz in (0, 1):
                wz = f[..., 2] if dz else 1 - f[..., 2]
                acc = acc + wx * wy * wz * LAT[(i[..., 0] + dx) % 32, (i[..., 1] + dy) % 32,
                                               (i[..., 2] + dz) % 32]
    return acc


def fbm(p, octaves=4):
    amp, freq, tot = 0.5, 1.0, 0.0
    for _ in range(octaves):
        tot = tot + amp * vnoise(p * freq)
        amp *= 0.5
        freq *= 2.03
    return tot


BLOBS = np.array([[0.0, 0.0, 0.0, 1.0], [0.85, 0.15, 0.1, 0.7], [-0.8, -0.05, 0.15, 0.75],
                  [0.3, 0.55, -0.2, 0.62], [-0.3, 0.45, 0.3, 0.55]])
SIGMA_MAX, ALBEDO = 5.0, 0.95
BOX_LO = np.array([-1.7, -0.6, -1.3])
BOX_HI = np.array([1.7, 1.3, 1.3])


def cloud_density(p):
    base = np.zeros(p.shape[:-1])
    for cx, cy, cz, r in BLOBS:
        d = np.sqrt((p[..., 0] - cx) ** 2 + (p[..., 1] - cy) ** 2 + (p[..., 2] - cz) ** 2)
        base = np.maximum(base, 1 - d / r)
    base = base * np.clip((p[..., 1] + 0.45) / 0.3, 0, 1)   # flat cloud bottom
    n = fbm(p * 2.2 + 10.0)
    return SIGMA_MAX * np.clip(base * 2.0 - 0.9 * n, 0, 1)


GRID_SHAPE = (96, 56, 72)


def make_grid():
    axes = [np.linspace(BOX_LO[k], BOX_HI[k], GRID_SHAPE[k]) for k in range(3)]
    P = np.stack(np.meshgrid(*axes, indexing="ij"), -1)
    return cloud_density(P)


GRID = None
GRID_FLAT = None


def sample_grid(p):
    """Trilinear lookup in the dense density grid; zero outside the box."""
    n = np.array(GRID_SHAPE)
    u = (p - BOX_LO) / (BOX_HI - BOX_LO) * (n - 1)
    inside = np.all((u >= 0) & (u <= n - 1), axis=-1)
    u = np.clip(u, 0, n - 1 - 1e-6)
    i = u.astype(np.int64)
    f = u - i
    sx, sy = n[1] * n[2], n[2]
    b = i[..., 0] * sx + i[..., 1] * sy + i[..., 2]
    g = GRID_FLAT
    fx, fy, fz = f[..., 0], f[..., 1], f[..., 2]
    c00 = g[b] * (1 - fz) + g[b + 1] * fz
    c01 = g[b + sy] * (1 - fz) + g[b + sy + 1] * fz
    c10 = g[b + sx] * (1 - fz) + g[b + sx + 1] * fz
    c11 = g[b + sx + sy] * (1 - fz) + g[b + sx + sy + 1] * fz
    c0 = c00 * (1 - fy) + c01 * fy
    c1 = c10 * (1 - fy) + c11 * fy
    return np.where(inside, c0 * (1 - fx) + c1 * fx, 0.0)


SUN = np.array([0.55, 0.7, -0.45])
SUN = SUN / np.linalg.norm(SUN)
G_CLOUD = 0.5


def shadow_depth(p, n_shadow=12, length=2.6):
    h = length / n_shadow
    tau = np.zeros(p.shape[:-1])
    for j in range(n_shadow):
        tau += sample_grid(p + ((j + 0.5) * h) * SUN) * h
    return tau


def render_cloud(n_steps, jitter, octaves, W=128, H=88, seed=1):
    rng = np.random.default_rng(seed)
    cam = np.array([0.0, 0.3, 3.4])
    tan_half = np.tan(np.radians(21))
    xs = ((np.arange(W) + 0.5) / W * 2 - 1) * tan_half * W / H
    ys = ((np.arange(H) + 0.5) / H * 2 - 1)[::-1] * tan_half
    X, Y = np.meshgrid(xs, ys)
    d = np.stack([X, Y - 0.06, -np.ones_like(X)], -1)
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    t0, t1 = 1.8, 5.0
    dt = (t1 - t0) / n_steps
    off = rng.random((H, W)) if jitter else np.full((H, W), 0.5)
    cos_t = d @ SUN
    phases = [hg(cos_t, G_CLOUD * 0.5 ** k) for k in range(octaves)]
    T = np.ones((H, W))
    L = np.zeros((H, W))
    for i in range(n_steps):
        p = cam + (t0 + (i + off) * dt)[..., None] * d
        sig = sample_grid(p)
        if not np.any(sig > 0):
            continue
        tau_l = shadow_depth(p)
        S = sum(0.5 ** k * phases[k] * np.exp(-(0.5 ** k) * tau_l) for k in range(octaves))
        Tseg = np.exp(-sig * dt)
        L += T * ALBEDO * (1 - Tseg) * S          # energy-conserving segment integral
        T *= Tseg
    sky = np.array([0.55, 0.70, 0.95]) * (1 - (Y[..., None] / tan_half + 1) / 2 * 0.45)
    sun_rgb = np.array([1.0, 0.97, 0.92]) * 14.0
    img = L[..., None] * sun_rgb + T[..., None] * sky
    return tonemap(img, 1.2)


def fig_ray_march():
    xs = np.linspace(-1.7, 1.7, 340)
    ys = np.linspace(-0.6, 1.3, 190)
    X, Y = np.meshgrid(xs, ys)
    P = np.stack([X, Y, np.zeros_like(X)], -1)
    D = sample_grid(P)
    rng = np.random.default_rng(5)
    o = np.array([-1.65, 0.05])
    w = np.array([1.0, 0.18]); w /= np.linalg.norm(w)
    n_s, t0, t1 = 12, 0.15, 3.3
    dt = (t1 - t0) / n_s
    ts = t0 + (np.arange(n_s) + rng.random(n_s)) * dt
    pts = o + ts[:, None] * w
    l2 = SUN[:2] / np.linalg.norm(SUN[:2])

    fig = plt.figure(figsize=(10, 7.4))
    gs = fig.add_gridspec(2, 1, height_ratios=[2.0, 1.0])
    ax = fig.add_subplot(gs[0])
    ax.imshow(D, origin="lower", extent=[xs[0], xs[-1], ys[0], ys[-1]], cmap="Blues", vmin=0, vmax=SIGMA_MAX * 1.3)
    ax.plot([o[0], o[0] + 3.45 * w[0]], [o[1], o[1] + 3.45 * w[1]], color=C["dark"], lw=1.8)
    for k in range(n_s + 1):
        q = o + (t0 + k * dt) * w
        ax.plot([q[0]], [q[1]], marker="|", color=C["gray"], ms=12, mew=1.5)
    for q in pts:
        ax.plot([q[0], q[0] + 1.2 * l2[0]], [q[1], q[1] + 1.2 * l2[1]], color=C["light"], ls="--", lw=1.4)
    ax.plot(pts[:, 0], pts[:, 1], "o", color=C["b"], ms=7, zorder=5)
    ax.plot([o[0]], [o[1]], "s", color=C["dark"], ms=10)
    ax.text(o[0] + 0.02, o[1] - 0.17, r"$\mathbf{o}$", fontsize=17)
    ax.annotate("", xy=(o[0] + 0.45 * w[0], o[1] + 0.45 * w[1] + 0.12), xytext=(o[0], o[1] + 0.12),
                arrowprops=dict(arrowstyle="->", lw=2, color=C["dark"]))
    ax.text(o[0] + 0.15, o[1] + 0.22, r"$\omega$", fontsize=17)
    ax.annotate("", xy=(1.25 + 0.35 * l2[0], 0.95 + 0.35 * l2[1]), xytext=(1.25, 0.95),
                arrowprops=dict(arrowstyle="->", lw=2.5, color=C["light"]))
    ax.text(1.0, 1.12, r"$\omega_\ell$", fontsize=17, color=C["dark"])
    q0, q1 = o + (t0 + 4 * dt) * w, o + (t0 + 5 * dt) * w
    ax.annotate("", xy=(q1[0], q1[1] - 0.16), xytext=(q0[0], q0[1] - 0.16),
                arrowprops=dict(arrowstyle="<->", lw=1.5, color=C["dark"]))
    ax.text(0.5 * (q0[0] + q1[0]) - 0.08, q0[1] - 0.36, r"$\Delta t$", fontsize=16)
    ax.set_xlim(xs[0], xs[-1]); ax.set_ylim(ys[0], ys[-1])
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    ax.set_title(r"(a) $z=0$ slice of $\sigma_t(\mathbf{x})$")

    ax2 = fig.add_subplot(gs[1])
    tt = np.linspace(0, 3.45, 800)
    sig = sample_grid(np.concatenate([o + tt[:, None] * w, np.zeros((tt.size, 1))], 1))
    tau = cumtrapz(sig, tt)
    ax2.fill_between(tt, sig / SIGMA_MAX, color=C["fill"])
    ax2.plot(tt, sig / SIGMA_MAX, color=C["a"], label=r"$\sigma_t/\sigma_{\max}$")
    ax2.plot(tt, np.exp(-tau), color=C["dark"], label=r"$T(t)$")
    sp = sample_grid(np.concatenate([pts, np.zeros((n_s, 1))], 1))
    ax2.plot(ts, sp / SIGMA_MAX, "o", color=C["b"], ms=7)
    ax2.set_xlabel(r"$t$")
    ax2.legend(frameon=False, fontsize=13, loc="upper right")
    ax2.set_title("(b)")
    fig.tight_layout()
    save(fig, out("ray-march"))


def fig_cloud_render():
    imgs = [
        (render_cloud(8, False, 1), r"(a) $N=8$, fixed"),
        (render_cloud(8, True, 1), r"(b) $N=8$, jittered"),
        (render_cloud(96, True, 1), r"(c) $N=96$, single"),
        (render_cloud(96, True, 4), r"(d) $N=96$, $+$ octaves"),
    ]
    fig, axs = plt.subplots(2, 2, figsize=(10, 7.2))
    for ax, (im, title) in zip(axs.ravel(), imgs):
        ax.imshow(im, interpolation="nearest")
        ax.set_title(title)
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    fig.tight_layout()
    save(fig, out("cloud-render"))


# ---------------------------------------------------------------------------
# 5. Delta, ratio and residual ratio tracking: a real Monte Carlo run
# ---------------------------------------------------------------------------
def poisson_points(rate, d, N, rng):
    n = rng.poisson(rate * d, N)
    m = max(int(n.max()), 1)
    x = rng.random((N, m)) * d
    valid = np.arange(m)[None, :] < n[:, None]
    x = np.where(valid, x, np.inf)
    x.sort(axis=1)                    # invalid (inf) entries move to the end
    return np.where(valid, x, 0.0), valid, n


def fig_tracking():
    rng = np.random.default_rng(2024)
    d, N = 10.0, 20000
    tt = np.linspace(0, d, 20001)
    s = density_1d(tt)
    tau = trapz(s, tt)
    T_true = np.exp(-tau)
    smax = s.max()
    sc = tau / d                       # control extinction for residual ratio tracking
    rmax = np.abs(s - sc).max()
    ks = np.array([1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0])
    res = {m: ([], []) for m in ("delta", "ratio", "residual")}
    for k in ks:
        sb = k * smax
        x, valid, n = poisson_points(sb, d, N, rng)
        sx = density_1d(x)
        acc = valid & (rng.random(x.shape) < sx / sb)
        est_d = (~acc.any(axis=1)).astype(float)
        cost_d = np.where(acc.any(axis=1), acc.argmax(axis=1) + 1, n)
        est_r = np.where(valid, 1 - sx / sb, 1.0).prod(axis=1)
        rb = k * rmax
        x2, valid2, n2 = poisson_points(rb, d, N, rng)
        est_rr = np.exp(-sc * d) * np.where(valid2, 1 - (density_1d(x2) - sc) / rb, 1.0).prod(axis=1)
        for m, e, c in (("delta", est_d, cost_d), ("ratio", est_r, n), ("residual", est_rr, n2)):
            res[m][0].append(e.std())
            res[m][1].append(c.mean())
        print("  k=%.2f  mean: delta %.4f ratio %.4f residual %.4f  (true %.4f)" %
              (k, est_d.mean(), est_r.mean(), est_rr.mean(), T_true))
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.4))
    sty = {"delta": (C["x"], "o", "delta"), "ratio": (C["z"], "s", "ratio"),
           "residual": (C["y"], "^", "residual ratio")}
    for m, (c, mk, lab) in sty.items():
        axs[0].plot(ks, res[m][0], marker=mk, color=c, label=lab)
        axs[1].plot(ks, res[m][1], marker=mk, color=c, label=lab)
    axs[0].axhline(np.sqrt(T_true * (1 - T_true)), color=C["x"], ls=":", lw=1.4)
    axs[0].set_xscale("log"); axs[0].set_yscale("log")
    axs[0].set_xlabel(r"$\bar\sigma / \max\,\sigma_t$")
    axs[0].set_ylabel(r"std of $\langle T\rangle$")
    axs[0].legend(frameon=False, fontsize=12)
    axs[0].set_title(r"(a) $T=%.4f$, $N=%d$" % (T_true, N))
    axs[1].set_xscale("log")
    from matplotlib.ticker import FixedLocator, FixedFormatter, NullLocator
    for a in axs:
        a.xaxis.set_major_locator(FixedLocator([1, 2, 4, 8]))
        a.xaxis.set_major_formatter(FixedFormatter(["1", "2", "4", "8"]))
        a.xaxis.set_minor_locator(NullLocator())
    axs[0].yaxis.set_major_locator(FixedLocator([0.01, 0.02, 0.05, 0.1, 0.2]))
    axs[0].yaxis.set_major_formatter(FixedFormatter(["0.01", "0.02", "0.05", "0.1", "0.2"]))
    axs[0].yaxis.set_minor_locator(NullLocator())
    axs[1].set_xlabel(r"$\bar\sigma / \max\,\sigma_t$")
    axs[1].set_ylabel(r"lookups of $\sigma_t$")
    axs[1].set_title("(b)")
    for ax in axs:
        ax.set_xticks([1, 2, 4, 8]); ax.set_xticklabels(["1", "2", "4", "8"])
    fig.tight_layout()
    save(fig, out("tracking-variance"))


# ---------------------------------------------------------------------------
# 6. Random walks in a slab (multiple scattering)
# ---------------------------------------------------------------------------
def walk(g, albedo, depth, rng, max_events=2000):
    """One analog random walk; light enters at the origin heading down (+z). Returns path, fate."""
    p = np.zeros(3)
    w = np.array([0.0, 0.0, 1.0])
    path = [p.copy()]
    for _ in range(max_events):
        t = -np.log(1 - rng.random())          # sigma_t = 1: distances in mean free paths
        q = p + t * w
        if q[2] < 0 or q[2] > depth:
            tb = (0 - p[2]) / w[2] if q[2] < 0 else (depth - p[2]) / w[2]
            path.append(p + tb * w)
            return np.array(path), ("R" if q[2] < 0 else "T")
        p = q
        path.append(p.copy())
        if rng.random() > albedo:
            return np.array(path), "A"
        mu = np.array([sample_hg_cos(g, rng.random())])
        w = rotate_to(w[None, :], mu, np.array([2 * np.pi * rng.random()]))[0]
    return np.array(path), "A"


def walk_stats(g, albedo, depth, rng, N=20000, max_events=3000):
    p = np.zeros((N, 3))
    w = np.tile([0.0, 0.0, 1.0], (N, 1))
    fate = np.zeros(N, dtype=int)            # 0 alive, 1 R, 2 T, 3 A
    for _ in range(max_events):
        alive = fate == 0
        if not alive.any():
            break
        idx = np.nonzero(alive)[0]
        t = -np.log(1 - rng.random(idx.size))
        q = p[idx] + t[:, None] * w[idx]
        fate[idx[q[:, 2] < 0]] = 1
        fate[idx[q[:, 2] > depth]] = 2
        inside = (q[:, 2] >= 0) & (q[:, 2] <= depth)
        idx, q = idx[inside], q[inside]
        p[idx] = q
        absorbed = rng.random(idx.size) > albedo
        fate[idx[absorbed]] = 3
        idx = idx[~absorbed]
        mu = sample_hg_cos(g, rng.random(idx.size))
        w[idx] = rotate_to(w[idx], mu, 2 * np.pi * rng.random(idx.size))
    fate[fate == 0] = 3
    return [(fate == k).mean() for k in (1, 2, 3)]


def fig_random_walk():
    depth, albedo = 4.0, 0.98
    fig, axs = plt.subplots(1, 2, figsize=(11, 5.2), sharey=True)
    colors = {"R": C["b"], "T": C["z"], "A": C["gray"]}
    for ax, g in zip(axs, [0.0, 0.85]):
        rng = np.random.default_rng(42)
        for _ in range(24):
            path, fate = walk(g, albedo, depth, rng)
            ax.plot(path[:, 0], path[:, 2], color=colors[fate], lw=1.0, alpha=0.8)
            ax.plot(path[-1, 0], path[-1, 2], "o", color=colors[fate], ms=4)
        R, Tt, A = walk_stats(g, albedo, depth, np.random.default_rng(7))
        ax.axhspan(0, depth, color=C["fill"], alpha=0.5, zorder=0)
        ax.axhline(0, color=C["dark"], lw=1.5); ax.axhline(depth, color=C["dark"], lw=1.5)
        ax.annotate("", xy=(0, 0), xytext=(0, -1.0), arrowprops=dict(arrowstyle="->", lw=3, color=C["light"]))
        ax.set_xlim(-6, 6); ax.set_ylim(depth + 1.0, -1.2)
        ax.set_xlabel(r"$x$ (mfp)")
        ax.set_title(fr"$g={g:g}$:  R={R:.2f}  T={Tt:.2f}  A={A:.2f}", fontsize=14)
    axs[0].set_ylabel(r"$z$ (mfp)")
    fig.tight_layout()
    save(fig, out("random-walk"))


# ---------------------------------------------------------------------------
# 7. Single-scattering atmosphere: sky colour versus sun elevation
# ---------------------------------------------------------------------------
R_E, R_A = 6360e3, 6460e3
BETA_R = np.array([5.802, 13.558, 33.1]) * 1e-6
BETA_MS, BETA_ME, G_MIE = 3.996e-6, 4.40e-6, 0.8
BETA_O = np.array([0.650, 1.881, 0.085]) * 1e-6
H_R, H_M = 8000.0, 1200.0


def extinction(h):
    """RGB extinction (1/m) at altitude h (any shape) -> (..., 3)."""
    ozone = np.clip(1 - np.abs(h - 25e3) / 15e3, 0, None)
    return (BETA_R * np.exp(-h / H_R)[..., None] + BETA_ME * np.exp(-h / H_M)[..., None]
            + BETA_O * ozone[..., None])


def ray_sphere_far(o, d, R):
    b = np.sum(o * d, -1)
    c = np.sum(o * o, -1) - R * R
    return -b + np.sqrt(np.clip(b * b - c, 0, None))


def hits_earth(o, d):
    b = np.sum(o * d, -1)
    c = np.sum(o * o, -1) - R_E * R_E
    disc = b * b - c
    return (disc > 0) & (-b - np.sqrt(np.clip(disc, 0, None)) > 0)


def sun_transmittance(p, s, n=24):
    tmax = ray_sphere_far(p, s, R_A)
    u = (np.arange(n) + 0.5) / n
    tau = np.zeros(p.shape[:-1] + (3,))
    for k in range(n):
        t = tmax * u[k] ** 2
        dt = tmax * 2 * u[k] / n
        q = p + t[..., None] * s
        tau += extinction(np.linalg.norm(q, axis=-1) - R_E) * dt[..., None]
    return np.where(hits_earth(p, s)[..., None], 0.0, np.exp(-tau))


def sky(sun_el, view_el, az, n=40):
    """Radiance for every (view elevation, sun elevation) pair, view azimuth az relative to the sun."""
    SE, VE = np.meshgrid(np.radians(sun_el), np.radians(view_el))
    s = np.stack([np.cos(SE), np.sin(SE), np.zeros_like(SE)], -1)
    v = np.stack([np.cos(VE) * np.cos(az), np.sin(VE), np.cos(VE) * np.sin(az)], -1)
    o = np.broadcast_to(np.array([0.0, R_E + 200.0, 0.0]), v.shape)
    tmax = ray_sphere_far(o, v, R_A)
    mu = np.sum(v * s, -1)
    pr, pm = rayleigh(mu), hg(mu, G_MIE)
    tau = np.zeros(v.shape)
    L = np.zeros(v.shape)
    u = (np.arange(n) + 0.5) / n
    for k in range(n):
        t = tmax * u[k] ** 2
        dt = tmax * 2 * u[k] / n
        p = o + t[..., None] * v
        h = np.linalg.norm(p, axis=-1) - R_E
        ext = extinction(h)
        Tv = np.exp(-(tau + 0.5 * ext * dt[..., None]))
        scat = BETA_R * (np.exp(-h / H_R) * pr)[..., None] + BETA_MS * (np.exp(-h / H_M) * pm)[..., None]
        L += Tv * sun_transmittance(p, s) * scat * dt[..., None]
        tau += ext * dt[..., None]
    return L


def fig_sky():
    sun_el = np.linspace(-4, 60, 65)
    view_el = np.linspace(0, 90, 61)
    E_SUN = 20.0
    fig = plt.figure(figsize=(11, 6.4))
    gs = fig.add_gridspec(2, 2, height_ratios=[4, 0.6])
    for j, (az, title) in enumerate([(0.0, r"(a) $\phi=0$"), (np.pi, r"(b) $\phi=\pi$")]):
        ax = fig.add_subplot(gs[0, j])
        img = tonemap(sky(sun_el, view_el, az) * E_SUN, 2.0)
        ax.imshow(img, origin="lower", aspect="auto", interpolation="bilinear", extent=[sun_el[0], sun_el[-1], 0, 90])
        ax.set_xlabel(r"$\theta_{sun}$ (deg)")
        if j == 0:
            ax.set_ylabel(r"$\theta_{view}$ (deg)")
        ax.set_title(title)
        ax.grid(False)
    ax = fig.add_subplot(gs[1, :])
    o = np.tile([0.0, R_E + 200.0, 0.0], (sun_el.size, 1))
    se = np.radians(sun_el)
    s = np.stack([np.cos(se), np.sin(se), np.zeros_like(se)], -1)
    Ts = sun_transmittance(o, s, n=64)
    strip = Ts / np.maximum(Ts.max(axis=-1, keepdims=True), 1e-12)
    strip = np.where(Ts.max(axis=-1, keepdims=True) > 1e-6, strip, 0.0) ** (1 / 2.2)
    ax.imshow(strip[None, :, :], aspect="auto", extent=[sun_el[0], sun_el[-1], 0, 1])
    ax.set_yticks([])
    ax.set_xlabel(r"$\theta_{sun}$ (deg):  $T_{sun}$ / max")
    ax.grid(False)
    fig.tight_layout()
    save(fig, out("rayleigh-sky"))
    print("  zenith Rayleigh optical depth:", BETA_R * H_R)


# ---------------------------------------------------------------------------
# 8. Diffusion profiles: classical dipole and Burley's normalized diffusion
# ---------------------------------------------------------------------------
def dipole_Rd(r, sigma_s_p, sigma_a, eta=1.3):
    sigma_t_p = sigma_a + sigma_s_p
    alpha_p = sigma_s_p / sigma_t_p
    sigma_tr = np.sqrt(3 * sigma_a * sigma_t_p)
    Fdr = -1.440 / eta ** 2 + 0.710 / eta + 0.668 + 0.0636 * eta
    A = (1 + Fdr) / (1 - Fdr)
    zr = 1 / sigma_t_p
    zv = zr * (1 + 4 * A / 3)
    dr = np.sqrt(r ** 2 + zr ** 2)
    dv = np.sqrt(r ** 2 + zv ** 2)
    return alpha_p / (4 * np.pi) * (zr * (1 + sigma_tr * dr) * np.exp(-sigma_tr * dr) / dr ** 3
                                    + zv * (1 + sigma_tr * dv) * np.exp(-sigma_tr * dv) / dv ** 3)


def burley_R(r, A, d):
    return A * (np.exp(-r / d) + np.exp(-r / (3 * d))) / (8 * np.pi * d * r)


def fig_diffusion():
    r = np.logspace(-2, 1, 400)                     # mm
    sp = np.array([0.74, 0.88, 1.01])               # reduced scattering, 1/mm (skin-like, RGB)
    sa = np.array([0.032, 0.17, 0.48])              # absorption, 1/mm
    rgb = [C["x"], C["y"], C["z"]]
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.5))
    for k in range(3):
        axs[0].loglog(r, dipole_Rd(r, sp[k], sa[k]), color=rgb[k], label="RGB"[k])
    axs[0].set_xlabel(r"$r$ (mm)")
    axs[0].set_ylabel(r"$R_d(r)$ (1/mm$^2$)")
    axs[0].legend(frameon=False)
    axs[0].set_title("(a) dipole")
    rl = np.linspace(1e-3, 6, 600)
    for k, (A, d) in enumerate([(0.8, 1.0), (0.55, 0.45), (0.4, 0.25)]):
        f = 2 * np.pi * rl * burley_R(rl, A, d)
        rr = np.linspace(1e-6, 80 * d, 200001)
        area = trapz(2 * np.pi * rr * burley_R(rr, A, d), rr)
        axs[1].plot(rl, f, color=rgb[k], label=fr"$A={A}, d={d}$: $\int={area:.3f}$")
    axs[1].set_xlabel(r"$r$ (mm)")
    axs[1].set_ylabel(r"$2\pi r\,R(r)$")
    axs[1].set_ylim(0, 0.9)
    axs[1].legend(frameon=False, fontsize=12)
    axs[1].set_title("(b) Burley")
    fig.tight_layout()
    save(fig, out("diffusion-profiles"))


# ---------------------------------------------------------------------------
# 9. Alpha compositing as quadrature (the NeRF connection)
# ---------------------------------------------------------------------------
def color_1d(t):
    return 0.5 + 0.4 * np.sin(1.3 * t)


def composite(N, d=10.0, energy=True, jitter=None):
    edges = np.linspace(0, d, N + 1)
    delta = np.diff(edges)
    mid = edges[:-1] + delta * (0.5 if jitter is None else jitter)
    s, c = density_1d(mid), color_1d(mid)
    alpha = 1 - np.exp(-s * delta) if energy else np.clip(s * delta, 0, 1)
    T = np.concatenate([[1.0], np.cumprod(1 - alpha)[:-1]])
    return np.sum(T * alpha * c), T, alpha, mid, delta


def fig_quadrature():
    t = np.linspace(0, 10, 4001)
    s = density_1d(t)
    tau = cumtrapz(s, t)
    w = np.exp(-tau) * s
    ref = trapz(w * color_1d(t), t)
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.4))
    _, T, alpha, mid, delta = composite(16)
    axs[0].bar(mid, T * alpha / delta, width=delta * 0.9, color=C["fill"], edgecolor=C["a"],
               label=r"$T_i\alpha_i/\delta_i$")
    axs[0].plot(t, w, color=C["a"], label=r"$T(t)\sigma_t(t)$")
    axs[0].set_xlabel(r"$t$")
    axs[0].legend(frameon=False, fontsize=13)
    axs[0].set_title(r"(a) $N=16$")
    Ns = np.array([4, 8, 16, 32, 64, 128, 256, 512])
    err_e = [abs(composite(N)[0] - ref) for N in Ns]
    err_n = [abs(composite(N, energy=False)[0] - ref) for N in Ns]
    axs[1].loglog(Ns, err_e, "o-", color=C["a"], label=r"$\alpha=1-e^{-\sigma\delta}$")
    axs[1].loglog(Ns, err_n, "s--", color=C["b"], label=r"$\alpha=\sigma\delta$")
    axs[1].loglog(Ns, 2.0 / Ns ** 2, color=C["gray"], lw=1.2, ls=":", label=r"$\propto N^{-2}$")
    axs[1].set_xlabel(r"$N$")
    axs[1].set_ylabel(r"$|C_N - C|$")
    axs[1].legend(frameon=False, fontsize=12)
    axs[1].set_title("(b)")
    fig.tight_layout()
    save(fig, out("quadrature"))


if __name__ == "__main__":
    fig_beer_lambert()
    fig_heterogeneous()
    fig_hg_lobes()
    fig_phase_functions()
    GRID = make_grid()
    GRID_FLAT = GRID.ravel()
    fig_ray_march()
    fig_cloud_render()
    fig_tracking()
    fig_random_walk()
    fig_sky()
    fig_diffusion()
    fig_quadrature()
