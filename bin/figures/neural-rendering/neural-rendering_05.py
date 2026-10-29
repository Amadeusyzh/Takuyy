"""Figures for neural-rendering post 05 (Beyond 3DGS: a map of the Gaussian splatting frontier).

Run from the repository root:  python3 bin/figures/neural-rendering/neural-rendering_05.py
Writes SVGs to assets/img/blog/neural-rendering/05-*.svg. Optional: PREVIEW=<dir> also writes PNGs.

Conventions: 3D figures use the OpenCV camera convention of the series (x right, y down, z forward
for cameras); world plots are right-handed with z up.
"""
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

import numpy as np  # noqa: E402
from matplotlib.patches import Ellipse, FancyBboxPatch  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/neural-rendering"
PREVIEW = os.environ.get("PREVIEW")


def out(fig, name):
    if PREVIEW:
        pathlib.Path(PREVIEW).mkdir(parents=True, exist_ok=True)
        fig.savefig(pathlib.Path(PREVIEW) / (name + ".png"), dpi=80)
    save(fig, OUT / (name + ".svg"))


# ---------------------------------------------------------------------------------------------
# 1. Taxonomy: which pipeline stage each direction changes (mirrors the table in the intro)
# ---------------------------------------------------------------------------------------------
def fig_taxonomy():
    stages = [
        (dict(en="Primitive", zh="基元", ja="プリミティブ"),
         dict(en="2DGS / SuGaR / GOF\n4D Gaussians\nLangSplat\nRelightable 3DGS",
              zh="2DGS / SuGaR / GOF\n4D 高斯\nLangSplat\n可重光照 3DGS",
              ja="2DGS / SuGaR / GOF\n4D ガウシアン\nLangSplat\nリライト可能 3DGS"), "§2 §3 §9 §10"),
        (dict(en="Projection &\nrasterization", zh="投影与\n光栅化", ja="投影と\nラスタライズ"),
         dict(en="Mip-Splatting\nStopThePop\n3DGRT (ray tracing)",
              zh="Mip-Splatting\nStopThePop\n3DGRT（光线追踪）",
              ja="Mip-Splatting\nStopThePop\n3DGRT（レイトレーシング）"), "§1 §5"),
        (dict(en="Optimization", zh="优化", ja="最適化"),
         dict(en="3DGS-MCMC\nLightGaussian / HAC\nsurface regularizers",
              zh="3DGS-MCMC\nLightGaussian / HAC\n表面正则项",
              ja="3DGS-MCMC\nLightGaussian / HAC\n表面正則化"), "§2 §4 §5"),
        (dict(en="Where parameters\ncome from", zh="参数从何而来", ja="パラメータの\n出どころ"),
         dict(en="SplaTAM / MonoGS\npixelSplat / MVSplat\nLRM / DreamGaussian",
              zh="SplaTAM / MonoGS\npixelSplat / MVSplat\nLRM / DreamGaussian",
              ja="SplaTAM / MonoGS\npixelSplat / MVSplat\nLRM / DreamGaussian"), "§6 §7 §8"),
        (dict(en="What happens\nafter", zh="之后的用途", ja="その後の\n利用"),
         dict(en="PhysGaussian / VR-GS\nediting\nAR / VR viewers",
              zh="PhysGaussian / VR-GS\n编辑\nAR / VR 查看器",
              ja="PhysGaussian / VR-GS\n編集\nAR / VR ビューア"), "§10 §11"),
    ]
    cols = [C["a"], C["z"], C["b"], C["y"], C["x"]]
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(10, 8.2))
        ax.set_xlim(0, 10); ax.set_ylim(-0.2, 8.9); ax.axis("off")
        h, gap = 1.42, 0.2
        for i, ((st, papers, sec), col) in enumerate(zip(stages, cols)):
            y0 = 7.0 - i * (h + gap)
            # stage box (left column = the pipeline, read top to bottom)
            ax.add_patch(FancyBboxPatch((0.05, y0), 2.9, h, boxstyle="round,pad=0.02,rounding_size=0.12",
                                        fc=col, ec="none", alpha=0.9))
            ax.text(1.5, y0 + h / 2, st[lang],
                    ha="center", va="center", color="white", fontsize=14.5, weight="bold")
            if i < 4:
                ax.annotate("", xy=(1.5, y0 - gap - 0.01), xytext=(1.5, y0 + 0.01),
                            arrowprops=dict(arrowstyle="-|>", color=C["dark"], lw=1.6))
            ax.add_patch(FancyBboxPatch((3.25, y0), 6.7, h, boxstyle="round,pad=0.02,rounding_size=0.12",
                                        fc="white", ec=col, lw=2))
            ax.plot([2.95, 3.25], [y0 + h / 2] * 2, color=col, lw=2)
            lines = papers[lang].split("\n")
            txt = "  \u00b7  ".join(lines[:2]) + ("\n" + "  \u00b7  ".join(lines[2:]) if len(lines) > 2 else "")
            ax.text(3.45, y0 + h / 2, txt, ha="left", va="center", fontsize=13, linespacing=1.5, color=C["dark"])
            ax.text(9.85, y0 + 0.2, sec, ha="right", va="bottom", fontsize=12, color=col, weight="bold")
        ax.text(1.5, 8.62, label(lang, en="3DGS pipeline stage", zh="3DGS 流水线阶段",
                                ja="3DGS パイプラインの段階"),
                ha="center", va="center", fontsize=14, color=C["gray"])
        ax.text(6.6, 8.62, label(lang, en="representative follow-ups (section)",
                                 zh="代表性后续工作（本文小节）",
                                 ja="代表的な後続研究（本記事の節）"),
                ha="center", va="center", fontsize=14, color=C["gray"])
        out(fig, f"05-taxonomy_{lang}")


# ---------------------------------------------------------------------------------------------
# 2. Mip-Splatting: footprint and energy vs zoom (formulas from section 1, s = 0.2 and 0.1)
# ---------------------------------------------------------------------------------------------
S3D, S2D, DIL = 0.2, 0.1, 0.3   # smooth_3d(s=0.2), mip_filter_2d(s=0.1), 3DGS dilation 0.3 I
SIG_TRAIN = 0.2                 # screen std of the Gaussian at the training resolution, in pixels


def footprints(m, sig=SIG_TRAIN):
    """Screen-space variance (pixels^2) of an isotropic Gaussian rendered at zoom m (focal m*f).
    The 3D filter variance s/nu^2 with nu = f/d becomes s*m^2 pixels^2 after projection at zoom m."""
    raw = (sig * m) ** 2
    gs = raw + DIL                                   # 3DGS: + 0.3 I
    mip = (sig ** 2 + S3D) * m ** 2 + S2D            # Mip-Splatting: 3D filter, then 2D Mip filter
    return raw, gs, mip


def fig_mip():
    m = np.logspace(np.log10(1 / 8), np.log10(8), 200)
    raw, gs, mip = footprints(m)
    ticks = [1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8]
    tlab = ["1/8", "1/4", "1/2", "1", "2", "4", "8"]
    for lang in LANGS:
        fig, axs = plt.subplots(2, 1, figsize=(8, 8.8))
        ax = axs[0]
        ax.loglog(m, np.sqrt(raw), color=C["gray"], ls=":", label=label(lang, "no filter", "无滤波", "フィルタなし"))
        ax.loglog(m, np.sqrt(gs), color=C["x"], label=r"3DGS: $+0.3\,I$")
        ax.loglog(m, np.sqrt(mip), color=C["z"], label="Mip-Splatting")
        ax.axhline(np.sqrt(1 / 12), color=C["gray"], lw=1.2, ls="--")
        ax.text(1.6, np.sqrt(1 / 12) * 0.68, label(lang, "1-pixel box", "1 像素盒式滤波", "1 画素の箱型"),
                color=C["gray"], fontsize=12)
        ax.set_ylabel(label(lang, "screen std (pixels)", "屏幕空间标准差（像素）", "画面上の標準偏差（画素）"))
        ax.legend(fontsize=13, loc="upper left", frameon=False)
        ax = axs[1]
        # energy = opacity * 2*pi*sqrt(det Sigma_2D), relative to the unfiltered Gaussian;
        # the 2D Mip filter keeps o*sqrt(|S|/|S+sI|) * 2 pi sqrt(|S+sI|) = o * 2 pi sqrt(|S|)
        ax.semilogx(m, gs / raw, color=C["x"], label=r"$+0.3\,I$")
        ax.semilogx(m, np.ones_like(m), color=C["z"], label=r"$\Sigma'+sI,\ o\sqrt{|\Sigma'|/|\Sigma'+sI|}$")
        ax.set_ylim(0, 25)
        ax.set_ylabel(label(lang, "energy / true energy", "能量 / 真实能量", "エネルギー / 真のエネルギー"))
        ax.legend(fontsize=13, loc="upper right", frameon=False)
        for ax, t in zip(axs, ["(a)", "(b)"]):
            ax.axvline(1, color=C["dark"], lw=1, alpha=0.5)
            ax.set_xticks(ticks); ax.set_xticklabels(tlab); ax.minorticks_off()
            ax.set_xlabel(label(lang, "zoom $m$ (render / training resolution)", "缩放 m（渲染 / 训练分辨率）",
                                "ズーム m（描画 / 学習時の解像度）"))
            ax.set_title(t, loc="left")
        axs[0].set_yticks([0.03, 0.1, 0.3, 1, 3]); axs[0].set_yticklabels(["0.03", "0.1", "0.3", "1", "3"])
        fig.tight_layout()
        out(fig, f"05-mip-footprint_{lang}")



# ---------------------------------------------------------------------------------------------
# 3. 3D ellipsoid vs 2D surfel: where along a ray is "the depth"?
# ---------------------------------------------------------------------------------------------
def rot(ax_, ang):
    ax_ = np.asarray(ax_, float); ax_ /= np.linalg.norm(ax_)
    K = np.array([[0, -ax_[2], ax_[1]], [ax_[2], 0, -ax_[0]], [-ax_[1], ax_[0], 0]])
    return np.eye(3) + np.sin(ang) * K + (1 - np.cos(ang)) * K @ K


def fig_surfel():
    R = rot([1, 0.3, 0], 0.5)
    tu, tv, nrm = R[:, 0], R[:, 1], R[:, 2]
    mu = np.zeros(3)
    s3 = np.array([1.0, 0.6, 0.35])             # 3D Gaussian: thin but not flat
    Sigma = R @ np.diag(s3 ** 2) @ R.T
    Si = np.linalg.inv(Sigma)
    su, sv = 1.0, 0.6                            # 2DGS surfel: same tangent scales, zero thickness
    cams = [np.array([-3.2, -3.0, 2.2]), np.array([3.4, -2.6, 1.6])]
    targets = [np.array([x, y, 0.0]) for x in (-0.5, 0.0, 0.5) for y in (-0.3, 0.3)]
    fig = plt.figure(figsize=(11, 5.4))
    for k, kind in enumerate(["3d", "2d"]):
        ax = fig.add_subplot(1, 2, k + 1, projection="3d")
        u = np.linspace(0, 2 * np.pi, 40); v = np.linspace(0, np.pi, 20)
        if kind == "3d":
            sph = np.stack([np.outer(np.cos(u), np.sin(v)), np.outer(np.sin(u), np.sin(v)),
                            np.outer(np.ones_like(u), np.cos(v))], -1)
            E = mu + (sph * s3) @ R.T
            ax.plot_surface(E[..., 0], E[..., 1], E[..., 2], color=C["a"], alpha=0.18, lw=0)
            ax.set_title(r"3DGS: $\mathrm{argmax}_t\ G(\mathbf{o}+t\mathbf{d})$", fontsize=14)
        else:
            rr = np.linspace(0, 1, 8)
            Uu, Rr = np.meshgrid(u, rr)
            D = mu + (Rr * np.cos(Uu))[..., None] * su * tu + (Rr * np.sin(Uu))[..., None] * sv * tv
            ax.plot_surface(D[..., 0], D[..., 1], D[..., 2], color=C["a"], alpha=0.25, lw=0)
            arrow3d(ax, mu, su * tu, C["x"], label_text=r"$s_u\mathbf{t}_u$")
            arrow3d(ax, mu, sv * tv, C["y"], label_text=r"$s_v\mathbf{t}_v$")
            arrow3d(ax, mu, 0.9 * nrm, C["z"], label_text=r"$\mathbf{n}$")
            ax.set_title(r"2DGS: $\mathbf{n}^\top(\mathbf{o}+t\mathbf{d}-\mathbf{p}_k)=0$", fontsize=14)
        hits = []
        for ci, o in enumerate(cams):
            col = [C["b"], C["c"]][ci]
            for tg in targets:
                p_on = mu + tg[0] * tu + tg[1] * tv      # aim rays at points of the disk
                d = p_on - o; d /= np.linalg.norm(d)
                if kind == "3d":
                    # maximum of the Gaussian along the ray (closed form)
                    t = d @ Si @ (mu - o) / (d @ Si @ d)
                else:
                    # exact ray-plane intersection, the 2DGS evaluation
                    t = nrm @ (mu - o) / (nrm @ d)
                hit = o + t * d
                hits.append(hit)
                ax.plot(*np.stack([o + (t - 1.6) * d, o + (t + 0.8) * d]).T, color=col, lw=1.0, alpha=0.7)
                ax.scatter(*hit, color=col, s=55, edgecolor="k", linewidth=0.6, depthshade=False)
        hits = np.array(hits).reshape(2, -1, 3)
        for a_, b_ in zip(hits[0], hits[1]):   # same target point seen by the two cameras
            ax.plot(*np.stack([a_, b_]).T, color=C["dark"], lw=2)
        ax.set_xlim(-1.2, 1.2); ax.set_ylim(-1.2, 1.2); ax.set_zlim(-1.0, 1.0)
        ax.set_box_aspect((1, 1, 0.83))
        ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
        ax.view_init(elev=14, azim=-58)
    fig.tight_layout()
    out(fig, "05-surfel-vs-ellipsoid")
    # report the depth disagreement for the caption sanity check
    o1, o2 = cams
    p = mu + 0.5 * tu
    pts = []
    for o in cams:
        d = (p - o) / np.linalg.norm(p - o)
        t = d @ Si @ (mu - o) / (d @ Si @ d)
        pts.append(o + t * d)
    print("  3DGS: same surface point, two cameras -> points", np.round(pts, 3))


# ---------------------------------------------------------------------------------------------
# 4. Native 4D Gaussians: slicing at time t (slice_4d from section 3)
# ---------------------------------------------------------------------------------------------
def slice_4d(mu4, Sigma4, t):
    S11, S12, S22 = Sigma4[:3, :3], Sigma4[:3, 3], Sigma4[3, 3]
    mu3 = mu4[:3] + S12 / S22 * (t - mu4[3])
    Sigma3 = S11 - np.outer(S12, S12) / S22
    p_t = np.exp(-0.5 * (t - mu4[3]) ** 2 / S22)
    return mu3, Sigma3, p_t


def fig_4d():
    mu4 = np.array([0.0, 0.0, 0.0, 0.5])
    # (x, t) block: std_x = 0.6, std_t = 0.25, correlation 0.9 -> moves in +x over time
    sx, st, rho = 0.6, 0.25, 0.9
    Sigma4 = np.diag([sx ** 2, 0.2 ** 2, 0.2 ** 2, st ** 2])
    Sigma4[0, 3] = Sigma4[3, 0] = rho * sx * st
    ts = [0.2, 0.35, 0.5, 0.65, 0.8]
    cmap = plt.get_cmap("viridis")
    fig, axs = plt.subplots(2, 1, figsize=(8, 8.6))
    ax = axs[0]
    xx, tt = np.meshgrid(np.linspace(-1.6, 1.6, 300), np.linspace(-0.1, 1.1, 300))
    B = Sigma4[np.ix_([0, 3], [0, 3])]
    Bi = np.linalg.inv(B)
    dx, dt = xx - mu4[0], tt - mu4[3]
    q = Bi[0, 0] * dx ** 2 + 2 * Bi[0, 1] * dx * dt + Bi[1, 1] * dt ** 2
    ax.contourf(xx, tt, np.exp(-0.5 * q), levels=12, cmap="Purples")
    line_t = np.linspace(-0.1, 1.1, 2)
    ax.plot(mu4[0] + Sigma4[0, 3] / Sigma4[3, 3] * (line_t - mu4[3]), line_t, color=C["dark"], lw=1.5, ls="--")
    for i, t in enumerate(ts):
        ax.axhline(t, color=cmap(i / (len(ts) - 1)), lw=2)
    ax.set_xlabel("$x$"); ax.set_ylabel("$t$")
    ax.set_title(r"$(x,t)$", loc="left", fontsize=14)
    ax = axs[1]
    x = np.linspace(-1.6, 1.6, 400)
    for i, t in enumerate(ts):
        m3, S3, pt = slice_4d(mu4, Sigma4, t)
        g = pt * np.exp(-0.5 * (x - m3[0]) ** 2 / S3[0, 0])
        ax.plot(x, g, color=cmap(i / (len(ts) - 1)), lw=2.4, label=f"$t={t:g}$")
        ax.plot([m3[0]] * 2, [0, pt], color=cmap(i / (len(ts) - 1)), lw=1, ls=":")
    ax.set_xlim(-1.6, 1.6)
    ax.set_xlabel("$x$")
    ax.set_ylabel(r"$p(t)\,\exp(-\frac{1}{2}(x-\mu_{x|t})^2/\Sigma_{x|t})$", fontsize=15)
    ax.legend(fontsize=13, frameon=False, loc="upper left")
    m3, S3, _ = slice_4d(mu4, Sigma4, 0.5)
    print(f"  4D: conditional std_x = {np.sqrt(S3[0, 0]):.3f} (marginal {sx}), velocity = {Sigma4[0, 3] / Sigma4[3, 3]:.3f}")
    fig.tight_layout()
    out(fig, "05-4d-slice")


# ---------------------------------------------------------------------------------------------
# 5. Canonical Gaussians + deformation over time (designs 1-3 of section 3)
# ---------------------------------------------------------------------------------------------
def deform(x, t):
    """Toy deformation field: a vertical 'arm' that bends about its base as t goes 0 -> 1."""
    h = np.clip(x[:, 2], 0, None)
    ang = 0.9 * np.sin(np.pi * t) * h / 2.0            # bending angle grows with height
    xn = x.copy()
    xn[:, 0] = x[:, 0] * np.cos(ang) + h * np.sin(ang)
    xn[:, 2] = -x[:, 0] * np.sin(ang) + h * np.cos(ang)
    xn[:, 1] = x[:, 1] + 0.25 * t * h
    return xn, ang


def fig_dynamic():
    rng = np.random.default_rng(3)
    n = 40
    can = np.stack([rng.normal(0, 0.12, n), rng.normal(0, 0.12, n), rng.uniform(0, 2.0, n)], 1)
    ts = np.linspace(0, 0.5, 30)
    traj = np.stack([deform(can, t)[0] for t in ts])
    fig = plt.figure(figsize=(9, 6.4))
    ax = fig.add_subplot(projection="3d")
    cmap = plt.get_cmap("viridis")
    for i in range(n):
        for k in range(len(ts) - 1):
            ax.plot(*traj[k:k + 2, i].T, color=cmap(ts[k] / 0.5),
                    lw=1.0, alpha=0.7)
    u = np.linspace(0, 2 * np.pi, 16); v = np.linspace(0, np.pi, 10)
    sph = np.stack([np.outer(np.cos(u), np.sin(v)), np.outer(np.sin(u), np.sin(v)),
                    np.outer(np.ones_like(u), np.cos(v))], -1)
    for t, col in [(0.0, cmap(0.0)), (0.25, cmap(0.5)), (0.5, cmap(1.0))]:
        xt, ang = deform(can, t)
        for i in range(0, n, 3):
            Rt = rot([0, 1, 0], ang[i])            # the Gaussian rotates with the local deformation
            E = xt[i] + (sph * np.array([0.07, 0.07, 0.16])) @ Rt.T
            ax.plot_surface(E[..., 0], E[..., 1], E[..., 2], color=col, alpha=0.55, lw=0)
    ax.text(0.0, 0.0, 2.25, "$t=0$", color=cmap(0.0), fontsize=15)
    xe, _ = deform(np.array([[0, 0, 2.0]]), 0.5)
    ax.text(xe[0, 0] + 0.1, xe[0, 1], xe[0, 2] + 0.1, "$t=0.5$", color=cmap(1.0), fontsize=15)
    ax.set_xlim(-0.6, 1.8); ax.set_ylim(-1.2, 1.2); ax.set_zlim(0, 2.4)
    ax.set_box_aspect((2.4, 2.4, 2.4))
    ax.set_xlabel("$x$"); ax.set_ylabel("$y$"); ax.set_zlabel("$z$")
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
    ax.view_init(elev=16, azim=-70)
    out(fig, "05-dynamic-trajectories")


# ---------------------------------------------------------------------------------------------
# 6. Memory per Gaussian (float32) and per scene
# ---------------------------------------------------------------------------------------------
def fig_memory():
    # attribute counts of vanilla 3DGS: mean 3, scale 3, rotation (quaternion) 4, opacity 1,
    # SH: 3 * (L+1)^2 coefficients for degree L (48 at L = 3)
    parts = [("mean", 3, C["dark"]), ("scale", 3, C["gray"]), ("rotation", 4, C["c"]), ("opacity", 1, C["y"])]
    degs = [3, 2, 1, 0]
    for lang in LANGS:
        fig, axs = plt.subplots(2, 1, figsize=(8.5, 9.2), gridspec_kw=dict(height_ratios=[1.1, 1]))
        ax = axs[0]
        names = {"mean": label(lang, "mean", "均值", "平均"), "scale": label(lang, "scale", "尺度", "スケール"),
                 "rotation": label(lang, "rotation", "旋转", "回転"),
                 "opacity": label(lang, "opacity", "不透明度", "不透明度")}
        for j, L in enumerate(degs):
            left = 0
            for nm, k, col in parts:
                ax.barh(j, 4 * k, left=left, color=col, label=names[nm] if j == 0 else None)
                left += 4 * k
            sh = 3 * (L + 1) ** 2
            ax.barh(j, 4 * sh, left=left, color=C["a"],
                    label=label(lang, "SH colour", "SH 颜色", "SH 色") if j == 0 else None)
            ax.text(left + 4 * sh + 4, j, f"{4 * (left // 4 + sh)} B", va="center", fontsize=13)
        ax.set_yticks(range(len(degs)))
        ax.set_yticklabels([label(lang, f"SH degree {L}", f"SH {L} 阶", f"SH 次数 {L}") + f"\n({3 * (L + 1) ** 2})"
                            for L in degs], fontsize=13.5)
        ax.invert_yaxis()
        ax.set_xlim(0, 280)
        ax.set_xlabel(label(lang, "bytes per Gaussian (float32)", "每个高斯的字节数（float32）",
                            "ガウシアン 1 個あたりのバイト数（float32）"))
        ax.legend(fontsize=12.5, frameon=False, loc="lower right")
        ax.grid(axis="y", visible=False)
        ax = axs[1]
        N = np.linspace(0.1, 6, 100)
        for L, col, ls in [(3, C["a"], "-"), (0, C["gray"], "--")]:
            per = 4 * (11 + 3 * (L + 1) ** 2)
            ax.plot(N, N * 1e6 * per / 1e6, color=col, ls=ls,
                    label=label(lang, f"SH degree {L}", f"SH {L} 阶", f"SH 次数 {L}") + f" ({per} B)")
        ax.axhline(1000, color=C["x"], lw=1.2, ls=":")
        ax.text(0.15, 1030, "1 GB", color=C["x"], fontsize=12)
        ax.set_xlabel(label(lang, "number of Gaussians (millions)", "高斯数量（百万）", "ガウシアン数（百万）"))
        ax.set_ylabel(label(lang, "uncompressed size (MB)", "未压缩大小（MB）", "非圧縮サイズ（MB）"))
        ax.legend(fontsize=13, frameon=False, loc="upper left")
        fig.tight_layout()
        out(fig, f"05-memory_{lang}")


# ---------------------------------------------------------------------------------------------
# 7. SLAM: tracking / mapping alternation (toy 2D top view, computed)
# ---------------------------------------------------------------------------------------------
def fig_slam():
    # a camera moving along an arc in a room (top view, x right, z forward); Gaussians appear as
    # the frustum first covers them (silhouette low -> densify)
    rng = np.random.default_rng(1)
    walls = np.concatenate([
        np.stack([np.linspace(-4, 4, 70), np.full(70, 4.0)], 1),
        np.stack([np.full(50, -4.0), np.linspace(-1, 4, 50)], 1),
        np.stack([np.full(50, 4.0), np.linspace(-1, 4, 50)], 1),
        np.stack([1.0 + 0.5 * np.cos(np.linspace(0, 2 * np.pi, 30)), 1.5 + 0.5 * np.sin(np.linspace(0, 2 * np.pi, 30))], 1),
    ]) + rng.normal(0, 0.03, (200, 2))
    th = np.linspace(-0.9, 0.9, 40)
    cpos = np.stack([2.2 * np.sin(th), -1.6 + 0.6 * np.cos(th) - 0.6], 1)
    yaw = -th * 0.9                       # camera looks towards the room's back wall
    half_fov = np.deg2rad(30)
    seen_at = np.full(len(walls), -1)
    for k in range(len(th)):
        d = walls - cpos[k]
        ang = np.arctan2(d[:, 0], d[:, 1]) - yaw[k]
        vis = (np.abs(ang) < half_fov) & (seen_at < 0)
        seen_at[vis] = k
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(9, 6.6))
        cmap = plt.get_cmap("viridis")
        m = seen_at >= 0
        sc = ax.scatter(walls[m, 0], walls[m, 1], c=seen_at[m] / (len(th) - 1), cmap=cmap, s=40,
                        edgecolor="k", linewidth=0.3, vmin=0, vmax=1)
        ax.scatter(walls[~m, 0], walls[~m, 1], c="#dddddd", s=30)
        ax.plot(cpos[:, 0], cpos[:, 1], color=C["dark"], lw=1.2)
        for k in range(0, len(th), 6):
            f = np.array([np.sin(yaw[k]), np.cos(yaw[k])])
            r = np.array([np.cos(yaw[k]), -np.sin(yaw[k])])
            L = 1.1
            a = cpos[k] + L * (f + np.tan(half_fov) * r); b = cpos[k] + L * (f - np.tan(half_fov) * r)
            ax.fill([cpos[k, 0], a[0], b[0]], [cpos[k, 1], a[1], b[1]], color=cmap(k / (len(th) - 1)),
                    alpha=0.35, ec=C["dark"], lw=1.2)
            ax.scatter(*cpos[k], color=C["b"], s=60, zorder=5, marker="s", edgecolor="k")
        k = 30
        ax.annotate(label(lang, "tracking: optimize pose,\nmap frozen", "跟踪：优化位姿，\n地图冻结",
                          "トラッキング：姿勢を最適化\n（地図は固定）"),
                    xy=cpos[k], xytext=(2.4, -3.6), fontsize=13, ha="left",
                    arrowprops=dict(arrowstyle="->", color=C["b"]), color=C["b"])
        ax.annotate(label(lang, "mapping + densify where\nsilhouette is low", "建图 + 在轮廓（silhouette）\n较低处加密",
                          "マッピング＋シルエットが\n低い所を高密度化"),
                    xy=(-3.95, 0.3), xytext=(-2.6, -2.9), fontsize=13, ha="left",
                    arrowprops=dict(arrowstyle="->", color=C["y"]), color=C["y"])
        ax.text(-4.3, 5.3, label(lang, "grey = not yet in map", "灰色 = 尚未进入地图", "灰色 = まだ地図にない"),
                fontsize=12, color=C["gray"])
        cb = fig.colorbar(sc, ax=ax, shrink=0.7, pad=0.02)
        cb.set_label(label(lang, "time first added", "首次加入的时间", "初めて追加された時刻"))
        ax.set_aspect("equal"); ax.set_xlim(-4.6, 5.6); ax.set_ylim(-4.0, 5.8)
        ax.set_xlabel("$x$"); ax.set_ylabel("$z$")
        out(fig, f"05-slam_{lang}")


# ---------------------------------------------------------------------------------------------
# 8. Feed-forward: pixel-aligned Gaussians from a depth distribution per pixel
# ---------------------------------------------------------------------------------------------
def fig_feedforward():
    # camera at origin, OpenCV convention (x right, y down, z forward); plotted with z as depth axis
    W, H, f = 12, 9, 9.0
    us, vs = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    dirs = np.stack([(us - W / 2) / f, (vs - H / 2) / f, np.ones_like(us)], -1).reshape(-1, 3)
    # scene: sphere (centre (0.2, 0.1, 4), r = 1.3) in front of a wall at z = 6
    c, r = np.array([0.2, 0.1, 4.0]), 1.3
    depth = np.full(len(dirs), 6.0)
    for i, d in enumerate(dirs):
        dn = d / np.linalg.norm(d)
        b = dn @ c; disc = b ** 2 - (c @ c - r ** 2)
        if disc > 0:
            depth[i] = min(6.0, (b - np.sqrt(disc)) * dn[2])   # z-depth of the hit
    pts = dirs * depth[:, None]      # unproject: X = z * K^-1 [u v 1]
    fig = plt.figure(figsize=(12, 5.2))
    gs = fig.add_gridspec(1, 2, width_ratios=[1.5, 1], wspace=0.25)
    ax = fig.add_subplot(gs[0], projection="3d")

    def P(X):  # plot coordinates: (x, z, -y) so that image 'up' is plot up
        X = np.atleast_2d(X)
        return X[:, 0], X[:, 2], -X[:, 1]
    corners = np.array([[0, 0], [W, 0], [W, H], [0, H], [0, 0]], float)
    img = np.stack([(corners[:, 0] - W / 2) / f, (corners[:, 1] - H / 2) / f, np.ones(5)], 1)
    ax.plot(*P(img), color=C["dark"], lw=1.5)
    for cc in img[:4]:
        ax.plot(*P(np.stack([np.zeros(3), cc * 6.3])), color=C["gray"], lw=0.7, alpha=0.6)
    col = np.where(depth < 6, C["b"], C["z"])
    for i in range(0, len(dirs)):
        ax.plot(*P(np.stack([dirs[i], pts[i]])), color=col[i], lw=0.5, alpha=0.4)
    ax.scatter(*P(pts), c=col, s=np.where(depth < 6, 45, 22), alpha=0.85, edgecolor="k", linewidth=0.3)
    ax.scatter(*P(dirs), c=col, s=3)
    ax.scatter(0, 0, 0, color=C["dark"], s=40, marker="s")
    ax.set_xlabel("$x$"); ax.set_ylabel("$z$")
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
    ax.set_box_aspect((1, 1.6, 0.8))
    ax.view_init(elev=12, azim=-38)
    ax.set_title(r"$\boldsymbol{\mu}_{uv} = z_{uv}\,K^{-1}(u,v,1)^\top$", fontsize=14)
    # right: per-pixel depth buckets (pixelSplat-style) for one pixel on the sphere edge
    ax = fig.add_subplot(gs[1])
    buckets = np.linspace(1, 8, 32)
    i = np.argmin(np.abs(depth - 3.6) + 10 * (depth >= 6))
    # an example predicted distribution: most mass near the sphere, some on the wall behind (edge pixel)
    p = 0.8 * np.exp(-0.5 * ((buckets - depth[i]) / 0.35) ** 2) + 0.2 * np.exp(-0.5 * ((buckets - 6.0) / 0.35) ** 2)
    p /= p.sum()
    ax.bar(buckets, p, width=buckets[1] - buckets[0], color=C["a"], alpha=0.7, edgecolor="white")
    ax.axvline(depth[i], color=C["b"], lw=2, ls="--")
    ax.text(depth[i] + 0.1, p.max() * 0.95, f"$z={depth[i]:.2f}$", color=C["b"], fontsize=14)
    ax.set_xlabel("$z$"); ax.set_ylabel("$p(z)$")
    out(fig, "05-pixel-aligned")


# ---------------------------------------------------------------------------------------------
# 9. PhysGaussian: Sigma_t = F Sigma_0 F^T under a bending + shear deformation (2D slice)
# ---------------------------------------------------------------------------------------------
def fig_phys():
    xs, ys = np.meshgrid(np.linspace(0, 3, 7), np.linspace(0, 1, 3))
    P0 = np.stack([xs.ravel(), ys.ravel()], 1)
    S0 = np.diag([0.17 ** 2, 0.09 ** 2])

    def phi(p):  # a cantilever bending downward: x' = x, y' = y - 0.12 x^2 ; plus shear
        x, y = p[..., 0], p[..., 1]
        return np.stack([x + 0.15 * y, y - 0.12 * x ** 2], -1)

    def F(p, h=1e-5):  # deformation gradient by central differences
        J = np.zeros((2, 2))
        for j in range(2):
            e = np.zeros(2); e[j] = h
            J[:, j] = (phi(p + e) - phi(p - e)) / (2 * h)
        return J
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.3), sharey=True)
    for ax, deformed in zip(axs, [False, True]):
        gx = np.linspace(-0.2, 3.2, 18); gy = np.linspace(-0.2, 1.2, 8)
        for g in gx:
            line = np.stack([np.full(40, g), np.linspace(-0.2, 1.2, 40)], 1)
            ax.plot(*(phi(line) if deformed else line).T, color=C["gray"], lw=0.6, alpha=0.6)
        for g in gy:
            line = np.stack([np.linspace(-0.2, 3.2, 60), np.full(60, g)], 1)
            ax.plot(*(phi(line) if deformed else line).T, color=C["gray"], lw=0.6, alpha=0.6)
        for p in P0:
            S = F(p) @ S0 @ F(p).T if deformed else S0
            c = phi(p) if deformed else p
            w, V = np.linalg.eigh(S)
            ang = np.degrees(np.arctan2(V[1, 1], V[0, 1]))
            ax.add_patch(Ellipse(c, 2 * 2 * np.sqrt(w[1]), 2 * 2 * np.sqrt(w[0]), angle=ang,
                                 fc=C["a"], alpha=0.45, ec=C["a"], lw=1.5))
            ax.plot(*c, ".", color=C["dark"], ms=4)
        ax.set_aspect("equal")
        ax.set_xlim(-0.4, 3.5); ax.set_ylim(-1.6, 1.4)
        ax.set_title(r"$\Sigma_t = \mathbf{F}_t\,\Sigma_0\,\mathbf{F}_t^\top$" if deformed else r"$\Sigma_0$",
                     fontsize=15)
        ax.set_xlabel("$x$")
    axs[0].set_ylabel("$y$")
    fig.tight_layout()
    out(fig, "05-physgaussian")


if __name__ == "__main__":
    fig_taxonomy()
    fig_mip()
    fig_surfel()
    fig_4d()
    fig_dynamic()
    fig_memory()
    fig_slam()
    fig_feedforward()
    fig_phys()
