"""Figures for graphics post 11 (real-time rendering techniques).

Every image and curve is computed: a ray-cast G-buffer of a tiny scene with a deferred lighting
pass, octahedral normal encoding and its quantization error, clustered light assignment in a
view frustum, cascade split schemes, PCF/PCSS penumbrae, the VSM/EVSM Chebyshev bounds,
Monte Carlo and horizon-based ambient occlusion on a height field, linear and hierarchical-Z
screen-space ray marching, SH irradiance of an environment, tone-mapping curves and the sRGB
transfer function. Labels are language-neutral.

    python3 bin/figures/graphics/graphics_11.py
"""
import pathlib
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics"


def out(name):
    return OUT / f"11-{name}.svg"


def normalize(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def sign_nz(x):
    return np.where(x >= 0, 1.0, -1.0)


def srgb_encode(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


# ---------------------------------------------------------------------------
# Octahedral normal encoding (the post's functions)
# ---------------------------------------------------------------------------
def oct_encode(n):
    n = n / np.abs(n).sum(-1, keepdims=True)
    x, y, z = n[..., 0], n[..., 1], n[..., 2]
    neg = z < 0
    u = np.where(neg, (1 - np.abs(y)) * sign_nz(x), x)
    v = np.where(neg, (1 - np.abs(x)) * sign_nz(y), y)
    return np.stack([u, v], -1)


def oct_decode(e):
    x, y = e[..., 0], e[..., 1]
    z = 1 - np.abs(x) - np.abs(y)
    t = np.clip(-z, 0, None)
    x = x - t * sign_nz(x)
    y = y - t * sign_nz(y)
    return normalize(np.stack([x, y, z], -1))


# ---------------------------------------------------------------------------
# 1. G-buffer of a tiny ray-cast scene + deferred lighting
# ---------------------------------------------------------------------------
SPHERES = [  # center, radius, albedo, roughness, metallic
    ((-0.9, 0.6, 0.0), 0.6, (0.80, 0.20, 0.15), 0.35, 0.0),
    ((0.75, 0.45, 0.45), 0.45, (1.00, 0.78, 0.34), 0.25, 1.0),
    ((0.25, 0.3, -0.9), 0.3, (0.20, 0.35, 0.85), 0.6, 0.0),
]
LIGHTS = [((2.0, 2.5, 2.0), (14.0, 13.0, 12.0)), ((-2.5, 1.5, 1.5), (3.0, 4.0, 7.0)),
          ((0.0, 0.6, -2.5), (6.0, 3.0, 1.5))]


def gbuffer(W=192, H=128):
    cam = np.array([0.0, 1.3, 4.2])
    target = np.array([0.0, 0.45, 0.0])
    fwd = normalize(target - cam)
    right = normalize(np.cross(fwd, [0.0, 1.0, 0.0]))
    up = np.cross(right, fwd)
    tan_h = np.tan(np.radians(25))
    xs = ((np.arange(W) + 0.5) / W * 2 - 1) * tan_h * W / H
    ys = ((np.arange(H) + 0.5) / H * 2 - 1)[::-1] * tan_h
    X, Y = np.meshgrid(xs, ys)
    d = normalize(fwd + X[..., None] * right + Y[..., None] * up)
    t_best = np.full((H, W), np.inf)
    alb = np.zeros((H, W, 3)); nrm = np.zeros((H, W, 3)); rough = np.zeros((H, W)); metal = np.zeros((H, W))
    # ground plane y = 0
    tp = np.where(d[..., 1] < -1e-6, -cam[1] / np.minimum(d[..., 1], -1e-6), np.inf)
    hitp = tp < t_best
    P = cam + tp[..., None] * d
    checker = ((np.floor(P[..., 0] * 2) + np.floor(P[..., 2] * 2)) % 2 == 0)
    t_best = np.where(hitp, tp, t_best)
    alb[hitp] = np.where(checker[hitp][:, None], [0.75, 0.75, 0.72], [0.35, 0.35, 0.33])
    nrm[hitp] = [0.0, 1.0, 0.0]
    rough[hitp] = 0.8
    for c, r, a, ro, me in SPHERES:
        oc = cam - np.array(c)
        b = np.sum(d * oc, -1)
        disc = b * b - (oc @ oc - r * r)
        ts = np.where(disc > 0, -b - np.sqrt(np.clip(disc, 0, None)), np.inf)
        ts = np.where(ts > 1e-4, ts, np.inf)
        hit = ts < t_best
        t_best = np.where(hit, ts, t_best)
        Ph = cam + ts[..., None] * d
        alb[hit] = a
        nrm[hit] = normalize(Ph[hit] - np.array(c))
        rough[hit] = ro
        metal[hit] = me
    valid = np.isfinite(t_best)
    depth = np.where(valid, t_best * np.sum(d * fwd, -1), np.nan)        # view-space z
    pos = cam + np.where(valid, t_best, 0)[..., None] * d
    return dict(alb=alb, nrm=nrm, rough=rough, metal=metal, depth=depth, pos=pos, valid=valid,
                view=-d)


def deferred_shade(g):
    n, v, alb = g["nrm"], g["view"], g["alb"]
    a = np.maximum(g["rough"] ** 2, 1e-3)[..., None]
    F0 = 0.04 * (1 - g["metal"][..., None]) + alb * g["metal"][..., None]
    col = 0.03 * alb
    NoV = np.clip(np.sum(n * v, -1, keepdims=True), 1e-4, 1)
    for lp, li in LIGHTS:
        Lv = np.array(lp) - g["pos"]
        dist2 = np.sum(Lv * Lv, -1, keepdims=True)
        l = Lv / np.sqrt(dist2)
        h = normalize(l + v)
        NoL = np.clip(np.sum(n * l, -1, keepdims=True), 0, 1)
        NoH = np.clip(np.sum(n * h, -1, keepdims=True), 0, 1)
        VoH = np.clip(np.sum(v * h, -1, keepdims=True), 0, 1)
        a2 = a * a
        D = a2 / (np.pi * (NoH * NoH * (a2 - 1) + 1) ** 2)
        Vis = 0.5 / (NoL * np.sqrt(NoV * NoV * (1 - a2) + a2) + NoV * np.sqrt(NoL * NoL * (1 - a2) + a2) + 1e-6)
        F = F0 + (1 - F0) * (1 - VoH) ** 5
        diff = (1 - F) * (1 - g["metal"][..., None]) * alb / np.pi
        col = col + (diff + D * Vis * F) * np.array(li) * NoL / dist2
    col = col / (1 + col)                                                  # Reinhard
    sky = np.array([0.85, 0.88, 0.95])
    return np.where(g["valid"][..., None], srgb_encode(col), sky)


def fig_gbuffer():
    g = gbuffer()
    bg = np.array([1.0, 1.0, 1.0])
    vm = g["valid"][..., None]
    alb = np.where(vm, srgb_encode(g["alb"]), bg)
    nrm = np.where(vm, g["nrm"] * 0.5 + 0.5, bg)
    dep = g["depth"]
    dn = (dep - np.nanmin(dep)) / (np.nanmax(dep) - np.nanmin(dep))
    dimg = np.where(vm, np.repeat(dn[..., None], 3, -1), bg)
    enc = oct_encode(np.where(vm, g["nrm"], [0.0, 0.0, 1.0]))
    octimg = np.where(vm, np.stack([enc[..., 0] * 0.5 + 0.5, enc[..., 1] * 0.5 + 0.5,
                                    np.zeros(enc.shape[:-1])], -1), bg)
    rm = np.where(vm, np.stack([g["rough"], g["metal"], np.zeros_like(g["rough"])], -1), bg)
    lit = deferred_shade(g)
    panels = [(alb, r"(a) albedo  RGB8"), (nrm, r"(b) $\mathbf{n}$  (xyz)"), (dimg, r"(c) depth $z$"),
              (octimg, r"(d) oct($\mathbf{n}$)  RG16"), (rm, r"(e) rough | metal  RG8"),
              (lit, r"(f) $\sum_\ell f_r L_\ell\,(\mathbf{n}\cdot\mathbf{l})$")]
    fig, axs = plt.subplots(2, 3, figsize=(12, 5.7))
    for ax, (im, t) in zip(axs.ravel(), panels):
        ax.imshow(np.clip(im, 0, 1), interpolation="nearest")
        ax.set_title(t, fontsize=14)
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    fig.tight_layout()
    save(fig, out("gbuffer"))


# ---------------------------------------------------------------------------
# 2. Octahedral map and quantization error
# ---------------------------------------------------------------------------
def quant_snorm(x, bits):
    s = 2 ** (bits - 1) - 1
    return np.round(np.clip(x, -1, 1) * s) / s


def fig_octahedral():
    fig = plt.figure(figsize=(11, 4.8))
    ax = fig.add_subplot(1, 2, 1)
    u = np.linspace(-1, 1, 401)
    U, V = np.meshgrid(u, u[::-1])
    n = oct_decode(np.stack([U, V], -1))
    ax.imshow(n * 0.5 + 0.5, extent=[-1, 1, -1, 1])
    ax.plot([1, 0, -1, 0, 1], [0, 1, 0, -1, 0], color="white", lw=2.5)
    ax.text(0, 0, r"$z>0$", ha="center", va="center", fontsize=16, color="white")
    for (x, y) in [(0.75, 0.75), (-0.75, 0.75), (0.75, -0.75), (-0.75, -0.75)]:
        ax.text(x, y, r"$z<0$", ha="center", va="center", fontsize=13, color="white")
    ax.set_xlabel(r"$u$"); ax.set_ylabel(r"$v$")
    ax.set_title("(a)")
    ax.grid(False)
    ax2 = fig.add_subplot(1, 2, 2)
    rng = np.random.default_rng(0)
    nv = normalize(rng.normal(size=(200000, 3)))
    bits = np.array([6, 8, 10, 12, 16])
    res = {"oct": [], "sph": [], "xyz": []}
    for b in bits:
        dec = oct_decode(quant_snorm(oct_encode(nv), b))
        res["oct"].append(np.degrees(np.arccos(np.clip(np.sum(dec * nv, -1), -1, 1))).max())
        th = np.arccos(np.clip(nv[:, 2], -1, 1)); ph = np.arctan2(nv[:, 1], nv[:, 0])
        q = 2 ** b - 1
        thq = np.round(th / np.pi * q) / q * np.pi
        phq = np.round((ph + np.pi) / (2 * np.pi) * q) / q * 2 * np.pi - np.pi
        ds = np.stack([np.sin(thq) * np.cos(phq), np.sin(thq) * np.sin(phq), np.cos(thq)], -1)
        res["sph"].append(np.degrees(np.arccos(np.clip(np.sum(ds * nv, -1), -1, 1))).max())
        dx = normalize(quant_snorm(nv, b))
        res["xyz"].append(np.degrees(np.arccos(np.clip(np.sum(dx * nv, -1), -1, 1))).max())
    ax2.semilogy(2 * bits, res["oct"], "o-", color=C["a"], label=r"oct $(u,v)$")
    ax2.semilogy(2 * bits, res["sph"], "s--", color=C["b"], label=r"$(\theta,\phi)$")
    ax2.semilogy(3 * bits, res["xyz"], "^:", color=C["z"], label=r"$(x,y,z)$")
    ax2.set_xlabel("bits")
    ax2.set_ylabel(r"$\max\,\Delta\theta$ (deg)")
    ax2.legend(frameon=False, fontsize=12)
    ax2.set_title("(b)")
    fig.tight_layout()
    save(fig, out("octahedral"))
    print("  oct max error deg:", dict(zip(bits.tolist(), np.round(res["oct"], 4).tolist())))


# ---------------------------------------------------------------------------
# 3. Clustered light assignment
# ---------------------------------------------------------------------------
def fig_clusters():
    near, far, TX, TY, S = 0.5, 40.0, 16, 9, 16
    tx = np.tan(np.radians(35)); ty = tx * 9 / 16
    zs = near * (far / near) ** (np.arange(S + 1) / S)
    rng = np.random.default_rng(4)
    nl = 30
    lz = near * (far / near) ** rng.uniform(0.15, 0.95, nl)
    lx = rng.uniform(-0.9, 0.9, nl) * lz * tx
    ly = rng.uniform(-0.9, 0.9, nl) * lz * ty
    lr = rng.uniform(0.6, 2.5, nl) * (lz / 10) ** 0.5
    ix = np.arange(TX); iy = np.arange(TY); iz = np.arange(S)
    IX, IY, IZ = np.meshgrid(ix, iy, iz, indexing="ij")
    z0, z1 = zs[IZ], zs[IZ + 1]
    x_lo = np.minimum((2 * IX / TX - 1) * tx * z0, (2 * IX / TX - 1) * tx * z1)
    x_hi = np.maximum((2 * (IX + 1) / TX - 1) * tx * z0, (2 * (IX + 1) / TX - 1) * tx * z1)
    y_lo = np.minimum((2 * IY / TY - 1) * ty * z0, (2 * IY / TY - 1) * ty * z1)
    y_hi = np.maximum((2 * (IY + 1) / TY - 1) * ty * z0, (2 * (IY + 1) / TY - 1) * ty * z1)
    count = np.zeros(IX.shape, dtype=int)
    for k in range(nl):
        dx = np.maximum(0, np.maximum(x_lo - lx[k], lx[k] - x_hi))
        dy = np.maximum(0, np.maximum(y_lo - ly[k], ly[k] - y_hi))
        dz = np.maximum(0, np.maximum(z0 - lz[k], lz[k] - z1))
        count += (dx * dx + dy * dy + dz * dz <= lr[k] ** 2)
    fig = plt.figure(figsize=(12, 5.4))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    zf = 20.0
    for z in zs[zs <= zf + 1e-9]:
        X = np.array([-1, 1, 1, -1, -1]) * tx * z; Y = np.array([-1, -1, 1, 1, -1]) * ty * z
        ax.plot(X, np.full(5, z), Y, color=C["gray"], lw=0.8)
    for sx in (-1, 1):
        for sy in (-1, 1):
            ax.plot([0, sx * tx * zf], [0, zf], [0, sy * ty * zf], color=C["dark"], lw=1.2)
    zt = zs[zs <= zf + 1e-9][-1]
    for i in range(TX + 1):
        x = (2 * i / TX - 1) * tx * zt
        ax.plot([x, x], [zt, zt], [-ty * zt, ty * zt], color=C["gray"], lw=0.5)
    for j in range(TY + 1):
        y = (2 * j / TY - 1) * ty * zt
        ax.plot([-tx * zt, tx * zt], [zt, zt], [y, y], color=C["gray"], lw=0.5)
    sel = (count > 0) & (zs[IZ + 1] <= zf + 1e-9)
    cx = 0.5 * (x_lo + x_hi)[sel]; cy = 0.5 * (y_lo + y_hi)[sel]; cz = 0.5 * (z0 + z1)[sel]
    sc = ax.scatter(cx, cz, cy, c=count[sel], cmap="viridis", s=10, depthshade=False)
    u, v = np.meshgrid(np.linspace(0, 2 * np.pi, 14), np.linspace(0, np.pi, 8))
    for k in range(nl):
        if lz[k] + lr[k] > zf:
            continue
        ax.plot_wireframe(lx[k] + lr[k] * np.cos(u) * np.sin(v), lz[k] + lr[k] * np.sin(u) * np.sin(v),
                          ly[k] + lr[k] * np.cos(v), color=C["light"], linewidth=0.4)
    ax.set_xlabel(r"$x$"); ax.set_ylabel(r"$z$"); ax.set_zlabel(r"$y$")
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
    ax.view_init(elev=22, azim=-58)
    ax.set_box_aspect((1.4, 2.0, 0.9))
    ax.set_title(r"(a) $z_k = n\,(f/n)^{k/S}$")
    fig.colorbar(sc, ax=ax, shrink=0.6, pad=0.02, label=r"$N_\ell$")

    ax2 = fig.add_subplot(1, 2, 2)
    top = count.max(axis=1)              # max over the y tiles: a top-down view (TX, S)
    vmax = max(int(top.max()), 1)
    cmap = plt.get_cmap("viridis")
    for i in range(TX):
        for k in range(S):
            xa0 = (2 * i / TX - 1) * tx; xa1 = (2 * (i + 1) / TX - 1) * tx
            poly = np.array([[xa0 * zs[k], zs[k]], [xa1 * zs[k], zs[k]], [xa1 * zs[k + 1], zs[k + 1]],
                             [xa0 * zs[k + 1], zs[k + 1]]])
            fc = cmap(top[i, k] / vmax) if top[i, k] > 0 else (1, 1, 1, 1)
            ax2.fill(poly[:, 0], poly[:, 1], facecolor=fc, edgecolor=C["gray"], lw=0.3)
    th = np.linspace(0, 2 * np.pi, 60)
    for k in range(nl):
        ax2.plot(lx[k] + lr[k] * np.cos(th), lz[k] + lr[k] * np.sin(th), color=C["x"], lw=1.0)
    ax2.set_xlim(-tx * far * 0.62, tx * far * 0.62); ax2.set_ylim(0, far * 0.62)
    ax2.set_aspect("equal")
    ax2.set_xlabel(r"$x$"); ax2.set_ylabel(r"$z$")
    ax2.set_title(r"(b) $x$-$z$, $\max_y N_\ell$")
    ax2.grid(False)
    fig.tight_layout()
    save(fig, out("clusters"))
    print("  clusters with lights: %d of %d, max %d, mean over non-empty %.2f" %
          ((count > 0).sum(), count.size, count.max(), count[count > 0].mean()))


# ---------------------------------------------------------------------------
# 4. Cascaded shadow map splits
# ---------------------------------------------------------------------------
def csm_splits(n, f, N, lam):
    i = np.arange(N + 1) / N
    return lam * n * (f / n) ** i + (1 - lam) * (n + (f - n) * i)


def fig_csm():
    n, f, N = 0.1, 200.0, 4
    lams = [0.0, 0.5, 0.9, 1.0]
    cols = [C["z"], C["y"], C["b"], C["x"]]
    fig, axs = plt.subplots(1, 2, figsize=(11.5, 4.4))
    for row, lam in enumerate(lams):
        z = csm_splits(n, f, N, lam)
        for i in range(N):
            axs[0].barh(row, z[i + 1] - z[i], left=z[i], height=0.6,
                        color=plt.get_cmap("Blues")(0.35 + 0.15 * i), edgecolor="white")
        for zi in z[1:-1]:
            axs[0].text(zi, row + 0.42, f"{zi:.3g}", ha="center", fontsize=11)
        print("  lambda=%.2f splits:" % lam, np.round(z, 3))
    axs[0].set_xscale("log")
    axs[0].set_yticks(range(len(lams)))
    axs[0].set_yticklabels([fr"$\lambda={l:g}$" for l in lams])
    axs[0].set_xlim(n, f)
    axs[0].set_xlabel(r"$z$")
    axs[0].set_title(r"(a) $n=0.1,\ f=200,\ N=4$")
    axs[0].grid(False)
    zz = np.logspace(np.log10(n), np.log10(f), 800)
    for lam, c in zip(lams, cols):
        z = csm_splits(n, f, N, lam)
        idx = np.clip(np.searchsorted(z, zz, side="right") - 1, 0, N - 1)
        axs[1].loglog(zz, z[idx + 1] / zz, color=c, label=fr"$\lambda={lam:g}$")
    axs[1].axhline(1, color=C["gray"], ls=":", lw=1.4)
    axs[1].set_xlabel(r"$z$")
    axs[1].set_ylabel(r"$z_{i+1}/z$")
    axs[1].legend(frameon=False, fontsize=12)
    axs[1].set_title("(b)")
    fig.tight_layout()
    save(fig, out("csm-splits"))


# ---------------------------------------------------------------------------
# 5. PCF versus PCSS penumbrae
# ---------------------------------------------------------------------------
def fig_pcss():
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.3))
    dl = 10.0                                   # light height above the receiver
    h = np.linspace(0.05, 9.0, 300)             # blocker height above the receiver
    for wl, c in [(0.25, C["c"]), (0.5, C["z"]), (1.0, C["a"])]:
        axs[0].plot(h, h * wl / (dl - h), color=c, label=fr"$w_{{light}}={wl:g}$")
    axs[0].set_ylim(0, 3)
    axs[0].set_xlabel(r"$d_{receiver}-d_{blocker}$")
    axs[0].set_ylabel(r"$w_{penumbra}$")
    axs[0].legend(frameon=False, fontsize=12)
    axs[0].set_title(r"(a) $w_p=(d_r-d_b)\,w_{light}/d_b$, $d_r=10$")
    x = np.linspace(-1.2, 1.2, 1200)
    lsamp = np.linspace(-0.5, 0.5, 2001)        # light segment of width 1 at height 10
    for hb, c in [(2.0, C["z"]), (6.0, C["x"])]:
        # exact: fraction of the light visible past a half-plane blocker x < 0 at height hb
        xb = x[:, None] + (lsamp[None, :] - x[:, None]) * hb / dl
        exact = (xb >= 0).mean(axis=1)
        r_pcf = 0.2
        pcf = np.clip((x + r_pcf) / (2 * r_pcf), 0, 1)
        wp = hb * 1.0 / (dl - hb)
        pcss = np.clip((x + wp / 2) / wp, 0, 1)
        axs[1].plot(x, exact, color=c, lw=3, alpha=0.5, label=fr"$V_{{ref}}$, $h={hb:g}$")
        axs[1].plot(x, pcss, color=c, ls=":", lw=2.2, label="PCSS")
        axs[1].plot(x, pcf, color=c, ls="--", lw=1.6, label="PCF")
    axs[1].set_xlabel(r"$x$")
    axs[1].set_ylabel(r"$V$")
    axs[1].legend(frameon=False, fontsize=10, ncol=2, loc="upper left")
    axs[1].set_title("(b)")
    fig.tight_layout()
    save(fig, out("pcss"))


# ---------------------------------------------------------------------------
# 6. Variance shadow maps: the Chebyshev bound and light bleeding
# ---------------------------------------------------------------------------
def chebyshev(m1, m2, t):
    var = np.maximum(m2 - m1 * m1, 1e-9)
    p = var / (var + (t - m1) ** 2)
    return np.where(t <= m1, 1.0, p)


def evsm(depths_w, t, c):
    """EVSM visibility from warped moments; depths_w are kernel weights x depths (mean over axis -1)."""
    pos = np.exp(c * depths_w); neg = -np.exp(-c * depths_w)
    p1 = chebyshev(pos.mean(-1), (pos ** 2).mean(-1), np.exp(c * t))
    p2 = chebyshev(neg.mean(-1), (neg ** 2).mean(-1), -np.exp(-c * t))
    return np.minimum(p1, p2)


def fig_vsm():
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.3))
    z1, z2, fr = 0.3, 0.7, 0.5
    t = np.linspace(0, 1, 600)
    true = np.where(t <= z1, 1.0, np.where(t <= z2, 1 - fr, 0.0))
    m1 = fr * z1 + (1 - fr) * z2; m2 = fr * z1 ** 2 + (1 - fr) * z2 ** 2
    axs[0].plot(t, true, color=C["dark"], lw=2.5, label=r"$P(z\geq t)$")
    axs[0].plot(t, chebyshev(m1, m2, t), color=C["b"], label=r"VSM: $\sigma^2/(\sigma^2+(t-\mu)^2)$")
    dk = np.array([z1, z2])
    axs[0].plot(t, evsm(np.broadcast_to(dk, (t.size, 2)), t, 10.0), color=C["y"], ls="--", label=r"EVSM, $c=10$")
    axs[0].set_xlabel(r"$t$")
    axs[0].set_ylabel(r"$V$")
    axs[0].legend(frameon=False, fontsize=11)
    axs[0].set_title(r"(a) $\{0.3, 0.7\}$, $\mu=0.5$")
    # light bleeding on a strip: blocker A (0.2) over blocker B (0.5) over a receiver at 0.6
    nx, rad = 1000, 80
    xs = (np.arange(nx) + 0.5) / nx
    dmap = np.where(xs < 0.45, 0.2, np.where(xs < 0.75, 0.5, 0.6))
    tr = 0.6
    idx = np.clip(np.arange(nx)[:, None] + np.arange(-rad, rad + 1)[None, :], 0, nx - 1)
    K = dmap[idx]
    pcf = (K >= tr - 1e-3).mean(-1)
    vsm = chebyshev(K.mean(-1), (K ** 2).mean(-1), tr)
    ev = evsm(K, tr, 10.0)
    axs[1].plot(xs, pcf, color=C["dark"], lw=2.5, label="PCF")
    axs[1].plot(xs, vsm, color=C["b"], label="VSM")
    axs[1].plot(xs, ev, color=C["y"], ls="--", label=r"EVSM, $c=10$")
    axs[1].axvspan(0, 0.45, color=C["fill"], alpha=0.6, lw=0)
    axs[1].text(0.22, 0.85, r"$z=0.2$", ha="center")
    axs[1].text(0.6, 0.85, r"$z=0.5$", ha="center")
    axs[1].text(0.88, 0.5, r"$z=t=0.6$", ha="center")
    axs[1].set_xlabel(r"$x$")
    axs[1].set_ylabel(r"$V$")
    axs[1].set_ylim(-0.03, 1.05)
    axs[1].legend(frameon=False, fontsize=11, loc="center left")
    axs[1].set_title("(b)")
    fig.tight_layout()
    save(fig, out("vsm-chebyshev"))


# ---------------------------------------------------------------------------
# 7. Ambient occlusion on a height field: Monte Carlo vs horizon-based
# ---------------------------------------------------------------------------
def heightfield(n=128):
    u = (np.arange(n) + 0.5) / n
    X, Y = np.meshgrid(u, u)
    h = 0.0 * X
    for cx, cy, r, a in [(0.3, 0.35, 0.12, 0.16), (0.68, 0.3, 0.09, 0.12), (0.55, 0.7, 0.16, 0.2),
                         (0.2, 0.78, 0.07, 0.09)]:
        h += a * np.exp(-((X - cx) ** 2 + (Y - cy) ** 2) / (2 * r * r))
    box = (np.abs(X - 0.82) < 0.08) & (np.abs(Y - 0.75) < 0.12)
    h = np.where(box, np.maximum(h, 0.12), h)
    pit = (X - 0.45) ** 2 + (Y - 0.45) ** 2 < 0.05 ** 2
    h = np.where(pit, h - 0.05, h)
    return h


def hf_lookup(h, x, y):
    n = h.shape[0]
    i = np.clip(np.floor(y * n).astype(int), 0, n - 1)
    j = np.clip(np.floor(x * n).astype(int), 0, n - 1)
    return h[i, j]


AO_R, AO_STEPS = 0.08, 12


def ao_mc(h, N, rng):
    n = h.shape[0]
    u = (np.arange(n) + 0.5) / n
    X, Y = np.meshgrid(u, u)
    vis = np.zeros_like(h)
    for _ in range(N):
        phi = 2 * np.pi * rng.random(h.shape)
        sin_t = np.sqrt(rng.random(h.shape))                  # cosine-weighted
        cot_t = np.sqrt(1 - sin_t ** 2) / np.maximum(sin_t, 1e-9)
        occ = np.zeros(h.shape, dtype=bool)
        for j in range(1, AO_STEPS + 1):
            r = AO_R * j / AO_STEPS
            occ |= hf_lookup(h, X + r * np.cos(phi), Y + r * np.sin(phi)) > h + r * cot_t
        vis += ~occ
    return vis / N


def horizon_elev(h, X, Y, phi):
    e = np.zeros(h.shape)
    for j in range(1, AO_STEPS + 1):
        r = AO_R * j / AO_STEPS
        dh = hf_lookup(h, X + r * np.cos(phi), Y + r * np.sin(phi)) - h
        e = np.maximum(e, np.arctan2(dh, r))
    return e


def ao_horizon(h, S, rng=None):
    n = h.shape[0]
    u = (np.arange(n) + 0.5) / n
    X, Y = np.meshgrid(u, u)
    rot = rng.random(h.shape) if rng is not None else np.zeros(h.shape)
    acc = np.zeros(h.shape)
    for k in range(S):
        phi = np.pi * (k + rot) / S
        e1 = horizon_elev(h, X, Y, phi)
        e2 = horizon_elev(h, X, Y, phi + np.pi)
        acc += 0.5 * (np.cos(e1) ** 2 + np.cos(e2) ** 2)
    return acc / S


def fig_ao():
    h = heightfield()
    ref = ao_horizon(h, 64)
    rng = np.random.default_rng(1)
    mc8 = ao_mc(h, 8, rng)
    mc64 = ao_mc(h, 64, rng)
    hz4 = ao_horizon(h, 4, rng)
    rmse = lambda a: np.sqrt(np.mean((a - ref) ** 2))
    fig = plt.figure(figsize=(11, 9.2))
    ax = fig.add_subplot(2, 2, 1)
    xs = np.linspace(0, 1, 400)
    prof = hf_lookup(h, xs, np.full_like(xs, 0.33))
    ax.fill_between(xs, -0.02, prof, color=C["fill"])
    ax.plot(xs, prof, color=C["a"])
    px = 0.5
    p0 = hf_lookup(h, np.array([px]), np.array([0.33]))[0]
    for sgn, col in [(1, C["b"]), (-1, C["z"])]:
        best, bx = 0.0, None
        for j in range(1, AO_STEPS + 1):
            r = AO_R * j / AO_STEPS
            dh = hf_lookup(h, np.array([px + sgn * r]), np.array([0.33]))[0] - p0
            ang = np.arctan2(dh, r)
            if ang > best:
                best, bx = ang, (px + sgn * r, p0 + dh)
        L = 0.16
        ax.plot([px, px + sgn * L * np.cos(best)], [p0, p0 + L * np.sin(best)], color=col, lw=2.2)
        ax.text(px + sgn * 0.075, p0 + 0.012 + 0.5 * L * np.sin(best),
                r"$e_%d=%.0f^\circ$" % (1 if sgn < 0 else 2, np.degrees(best)), color=col,
                ha="center", fontsize=13)
        for j in range(1, AO_STEPS + 1):
            r = AO_R * j / AO_STEPS
            ax.plot([px + sgn * r], [hf_lookup(h, np.array([px + sgn * r]), np.array([0.33]))[0]], "o",
                    color=col, ms=3)
    ax.plot([px], [p0], "o", color=C["dark"], ms=8)
    ax.text(px, p0 - 0.03, r"$\mathbf{p}$", ha="center", fontsize=16)
    ax.annotate("", xy=(px, p0 + 0.12), xytext=(px, p0), arrowprops=dict(arrowstyle="->", lw=2, color=C["dark"]))
    ax.text(px + 0.01, p0 + 0.12, r"$\mathbf{n}$", fontsize=15)
    ax.set_xlim(0.3, 0.7); ax.set_ylim(-0.02, 0.3)
    ax.set_aspect("equal")
    ax.set_title(r"(a) slice: $a=\frac{1}{2}(\cos^2 e_1+\cos^2 e_2)$")
    for k, (img, t) in enumerate([(mc8, "(b) MC, N=8"), (mc64, "(c) MC, N=64"), (hz4, "(d) horizon, S=4")]):
        a2 = fig.add_subplot(2, 2, k + 2)
        a2.imshow(img, cmap="gray", vmin=0.4, vmax=1.0, origin="lower")
        a2.set_title(t + f",  RMSE {rmse(img):.3f}")
        a2.set_xticks([]); a2.set_yticks([]); a2.grid(False)
    fig.tight_layout()
    save(fig, out("ao-horizon"))
    print("  AO RMSE: mc8 %.4f mc64 %.4f horizon4 %.4f" % (rmse(mc8), rmse(mc64), rmse(hz4)))


# ---------------------------------------------------------------------------
# 8. Screen-space reflections: linear march and hierarchical-Z traversal (1D)
# ---------------------------------------------------------------------------
NPIX = 64
ZBUF = np.full(NPIX, 0.9)
ZBUF[20:24] = 0.55
ZBUF[40:52] = 0.62
X0, Z0, SLOPE, THICK = 4.0, 0.3, 0.009, 0.05


def build_pyramid(z):
    pyr = [z.copy()]
    while len(pyr[-1]) > 1:
        pyr.append(pyr[-1].reshape(-1, 2).min(axis=1))
    return pyr


def hiz_trace(x0, z0, slope, pyr, thickness, max_iter=64):
    lvl, x, path = 0, x0, []
    n = len(pyr[0])
    for _ in range(max_iter):
        size = 2 ** lvl
        cell = int(x // size)
        if cell * size >= n:
            return None, path
        x_exit = (cell + 1) * size
        z_exit = z0 + (x_exit - x0) * slope
        zmin = pyr[lvl][cell]
        path.append((lvl, cell, x, zmin))
        if z_exit < zmin:                            # the ray passes in front of the whole cell
            x = x_exit
            lvl = min(lvl + 1, len(pyr) - 1)
        else:
            x = max(x, x0 + (zmin - z0) / slope)     # advance to where the ray reaches zmin
            if lvl == 0:
                if z0 + (x - x0) * slope - zmin <= thickness:
                    return x, path
                x = x_exit                           # behind a thin object: keep going
            else:
                lvl -= 1
    return None, path


def linear_march(x0, z0, slope, step, thickness):
    xs, x = [], x0
    while x + step < NPIX:
        x += step
        xs.append(x)
        if z0 + (x - x0) * slope >= ZBUF[int(x)]:
            lo, hi = x - step, x                     # binary refinement
            for _ in range(5):
                mid = 0.5 * (lo + hi)
                if z0 + (mid - x0) * slope >= ZBUF[int(mid)]:
                    hi = mid
                else:
                    lo = mid
            hit_ok = z0 + (hi - x0) * slope - ZBUF[int(hi)] <= thickness
            return xs, hi, hit_ok
    return xs, None, False


def fig_ssr():
    fig, axs = plt.subplots(1, 2, figsize=(12, 4.6), sharey=True)
    pyr = build_pyramid(ZBUF)
    xx = np.arange(NPIX + 1)
    for ax in axs:
        ax.fill_between(np.repeat(xx, 2)[1:-1], np.repeat(ZBUF, 2), 1.0, color="#dddddd", step=None)
        ax.step(xx[:-1], ZBUF, where="post", color=C["dark"], lw=1.5)
        ax.plot([X0, NPIX], [Z0, Z0 + (NPIX - X0) * SLOPE], color=C["b"], lw=1.6)
        ax.set_xlim(0, NPIX); ax.set_ylim(1.0, 0.2)
        ax.set_xlabel(r"$x$ (px)")
    axs[0].set_ylabel(r"$z$")
    xs, hit, ok = linear_march(X0, Z0, SLOPE, 7.0, THICK)
    axs[0].plot(xs, [Z0 + (x - X0) * SLOPE for x in xs], "o", color=C["b"], ms=7)
    if hit is not None:
        axs[0].plot([hit], [Z0 + (hit - X0) * SLOPE], "*", color=C["x"], ms=16)
    axs[0].set_title(r"(a) linear, $\Delta x=7$")
    cols = plt.get_cmap("viridis")(np.linspace(0, 0.9, len(pyr)))
    xh, path = hiz_trace(X0, Z0, SLOPE, pyr, THICK)
    for it, (lvl, cell, x, zmin) in enumerate(path):
        size = 2 ** lvl
        axs[1].plot([cell * size, (cell + 1) * size], [zmin, zmin], color=cols[lvl], lw=4, alpha=0.85,
                    solid_capstyle="butt")
        axs[1].plot([x], [Z0 + (x - X0) * SLOPE], "o", color=cols[lvl], ms=5)
    if xh is not None:
        axs[1].plot([xh], [Z0 + (xh - X0) * SLOPE], "*", color=C["x"], ms=16)
    for lvl in range(len(pyr)):
        axs[1].plot([], [], color=cols[lvl], lw=4, label=f"L{lvl}")
    axs[1].legend(frameon=False, fontsize=10, ncol=4, loc="lower left")
    axs[1].set_title(fr"(b) Hi-Z, {len(path)} it.")
    fig.tight_layout()
    save(fig, out("ssr-march"))
    print("  linear hit", hit, ok, "  hiz hit", xh, "steps", len(path))


# ---------------------------------------------------------------------------
# 9. Spherical-harmonic irradiance
# ---------------------------------------------------------------------------
def sh_basis(d):
    """Real SH up to l = 3 (16 functions) for unit vectors d (..., 3), z up."""
    x, y, z = d[..., 0], d[..., 1], d[..., 2]
    return np.stack([
        0.282095 * np.ones_like(x),
        0.488603 * y, 0.488603 * z, 0.488603 * x,
        1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1), 1.092548 * x * z,
        0.546274 * (x * x - y * y),
        0.590044 * y * (3 * x * x - y * y), 2.890611 * x * y * z, 0.457046 * y * (5 * z * z - 1),
        0.373176 * z * (5 * z * z - 3), 0.457046 * x * (5 * z * z - 1), 1.445306 * z * (x * x - y * y),
        0.590044 * x * (x * x - 3 * y * y)], -1)


A_HAT = np.array([np.pi, 2 * np.pi / 3, np.pi / 4, 0.0])
BAND = np.array([0, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3])
SUN_DIR = normalize(np.array([0.5, 0.3, 0.8]))


def env_radiance(d):
    z = d[..., 2]
    sky = np.where(z > 0, 0.25 + 0.35 * np.sqrt(np.clip(z, 0, 1)), 0.08)
    sun = 8.0 * np.exp(200.0 * (d @ SUN_DIR - 1))
    return sky + sun


def latlong(nt, npp):
    th = (np.arange(nt) + 0.5) / nt * np.pi
    ph = (np.arange(npp) + 0.5) / npp * 2 * np.pi - np.pi
    PH, TH = np.meshgrid(ph, th)
    d = np.stack([np.sin(TH) * np.cos(PH), np.sin(TH) * np.sin(PH), np.cos(TH)], -1)
    w = np.sin(TH) * (np.pi / nt) * (2 * np.pi / npp)
    return d, w


def fig_sh():
    d, w = latlong(180, 360)
    L = env_radiance(d)
    B = sh_basis(d)
    coef = np.einsum("ij,ijk->k", L * w, B)
    dn, _ = latlong(36, 72)
    n_flat = dn.reshape(-1, 3)
    dirs, wl = d.reshape(-1, 3), (L * w).reshape(-1)
    E = np.zeros(len(n_flat))
    for s in range(0, len(n_flat), 128):
        E[s:s + 128] = np.clip(n_flat[s:s + 128] @ dirs.T, 0, None) @ wl
    E = E.reshape(dn.shape[:-1])
    Bn = sh_basis(dn)
    approx = []
    for lmax in range(4):
        m = BAND <= lmax
        approx.append(np.einsum("ijk,k->ij", Bn[..., m], (A_HAT[BAND] * coef)[m]))
    rad_err = []
    for lmax in range(4):
        m = BAND <= lmax
        Lr = np.einsum("ijk,k->ij", B[..., m], coef[m])
        rad_err.append(np.sqrt(np.sum((Lr - L) ** 2 * w) / np.sum(L ** 2 * w)))
    irr_err = [np.sqrt(np.mean((a - E) ** 2)) / np.sqrt(np.mean(E ** 2)) for a in approx]
    fig, axs = plt.subplots(2, 3, figsize=(12, 5.8))
    ext = [-180, 180, 180, 0]
    im0 = axs[0, 0].imshow(np.log10(L), extent=ext, cmap="magma", aspect="auto")
    axs[0, 0].set_title(r"(a) $\log_{10} L(\omega)$")
    vmin, vmax = E.min(), E.max()
    for ax, img, t in [(axs[0, 1], E, r"(b) exact $E(\mathbf{n})$"), (axs[0, 2], approx[0], r"(c) $l\leq 0$"),
                       (axs[1, 0], approx[1], r"(d) $l\leq 1$"), (axs[1, 1], approx[2], r"(e) $l\leq 2$")]:
        ax.imshow(img, extent=ext, cmap="inferno", vmin=vmin, vmax=vmax, aspect="auto")
        ax.set_title(t)
    for ax in axs.ravel()[:5]:
        ax.set_xticks([-180, 0, 180]); ax.set_yticks([0, 90, 180]); ax.grid(False)
    fig.colorbar(im0, ax=axs[0, 0], fraction=0.046, pad=0.02)
    ax = axs[1, 2]
    ax.semilogy(range(4), irr_err, "o-", color=C["a"], label=r"$E$")
    ax.semilogy(range(4), rad_err, "s--", color=C["b"], label=r"$L$")
    ax.set_xticks(range(4))
    ax.set_xlabel(r"$l_{\max}$")
    ax.set_ylabel("rel. RMSE")
    ax.legend(frameon=False, fontsize=12)
    ax.set_title("(f)")
    fig.tight_layout()
    save(fig, out("sh-irradiance"))
    print("  irradiance rel. error by lmax:", np.round(irr_err, 4), " radiance:", np.round(rad_err, 3))


# ---------------------------------------------------------------------------
# 10. Tone-mapping curves and 11. the sRGB transfer function
# ---------------------------------------------------------------------------
def reinhard(x):
    return x / (1 + x)


def reinhard_ext(x, w=4.0):
    return x * (1 + x / (w * w)) / (1 + x)


def hable_partial(x):
    A, B, Cc, D, E, F = 0.15, 0.50, 0.10, 0.20, 0.02, 0.30
    return (x * (A * x + Cc * B) + D * E) / (x * (A * x + B) + D * F) - E / F


def hable(x):
    return hable_partial(2.0 * x) / hable_partial(11.2)


def aces_fit(x):
    return np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)


def pbr_neutral(x):
    """Khronos PBR Neutral applied to a gray value x (r = g = b)."""
    start, desat = 0.8 - 0.04, 0.15
    off = np.where(x < 0.08, x - 6.25 * x * x, 0.04)
    c = x - off
    d = 1 - start
    new_peak = 1 - d * d / (c + d - start)
    return np.where(c < start, c, new_peak)


def fig_tonemap():
    fig, axs = plt.subplots(1, 2, figsize=(11.5, 4.5))
    xl = np.linspace(0, 8, 800)
    xg = np.logspace(-3, 2, 800)
    curves = [(lambda x: np.clip(x, 0, 1), C["gray"], "clamp", ":"), (reinhard, C["z"], r"Reinhard $x/(1+x)$", "-"),
              (reinhard_ext, C["c"], r"Reinhard ext., $L_w=4$", "--"), (hable, C["y"], "Hable filmic", "-"),
              (aces_fit, C["x"], "ACES fit", "-"), (pbr_neutral, C["a"], "PBR Neutral", "-.")]
    for f, c, lab, ls in curves:
        axs[0].plot(xl, f(xl), color=c, ls=ls, label=lab)
        axs[1].plot(xg, srgb_encode(f(xg)), color=c, ls=ls)
    axs[0].set_xlabel(r"$x$ (scene)")
    axs[0].set_ylabel(r"$y$ (display)")
    axs[0].set_ylim(0, 1.05)
    axs[0].legend(frameon=False, fontsize=11, loc="lower right")
    axs[0].set_title("(a)")
    axs[1].set_xscale("log")
    axs[1].set_xlabel(r"$x$ (scene, log)")
    axs[1].set_ylabel(r"sRGB$(y)$")
    axs[1].axvline(0.18, color=C["gray"], lw=1, ls=":")
    axs[1].text(0.2, 0.05, "0.18", color=C["gray"], fontsize=12)
    axs[1].set_title("(b)")
    fig.tight_layout()
    save(fig, out("tonemap-curves"))


def fig_srgb():
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.4))
    x = np.linspace(0, 1, 1000)
    axs[0].plot(x, srgb_encode(x), color=C["a"], label="sRGB OETF")
    axs[0].plot(x, x ** (1 / 2.2), color=C["b"], ls="--", label=r"$x^{1/2.2}$")
    axs[0].plot(x, x, color=C["gray"], ls=":", label="linear")
    ins = axs[0].inset_axes([0.55, 0.12, 0.4, 0.4])
    xs = np.linspace(0, 0.01, 200)
    ins.plot(xs, srgb_encode(xs), color=C["a"]); ins.plot(xs, xs ** (1 / 2.2), color=C["b"], ls="--")
    ins.axvline(0.0031308, color=C["gray"], lw=1, ls=":")
    ins.tick_params(labelsize=9)
    axs[0].set_xlabel(r"$L$ (linear)")
    axs[0].set_ylabel(r"$V$ (encoded)")
    axs[0].legend(frameon=False, fontsize=12, loc="upper left")
    axs[0].set_title("(a)")
    codes = np.arange(1, 255)
    lin_lin = codes / 255.0
    rel_lin = (1 / 255.0) / lin_lin
    v = codes / 255.0
    dec = lambda e: np.where(e <= 0.04045, e / 12.92, ((e + 0.055) / 1.055) ** 2.4)
    lin_s = dec(v)
    rel_s = (dec((codes + 1) / 255.0) - lin_s) / lin_s
    axs[1].loglog(lin_lin, rel_lin, color=C["gray"], label="8-bit linear")
    axs[1].loglog(lin_s, rel_s, color=C["a"], label="8-bit sRGB")
    axs[1].axhline(0.01, color=C["x"], ls=":", lw=1.3)
    axs[1].text(1.2e-3, 0.012, "1%", color=C["x"], fontsize=12)
    axs[1].set_xlabel(r"$L$ (linear)")
    axs[1].set_ylabel(r"$\Delta L / L$")
    axs[1].legend(frameon=False, fontsize=12)
    axs[1].set_title("(b)")
    fig.tight_layout()
    save(fig, out("srgb"))


if __name__ == "__main__":
    fig_gbuffer()
    fig_octahedral()
    fig_clusters()
    fig_csm()
    fig_pcss()
    fig_vsm()
    fig_ao()
    fig_ssr()
    fig_sh()
    fig_tonemap()
    fig_srgb()
