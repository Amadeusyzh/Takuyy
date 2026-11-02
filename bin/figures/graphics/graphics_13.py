"""Figures for graphics post 13 (research frontiers 2026).

The survey figures (timeline, counts, trend map) are computed from the curated list in
data/13-frontiers.json, which is also the data behind the widget
assets/js/widgets/graphics-frontiers-explorer.js. The four explanatory figures are small, real
computations of ideas that recur in the chapter: the peak response of a 3D Gaussian along a ray
(Gaussian ray tracing), control variates (ReSTIR with control variates), the IPC barrier
(contact simulation) and Gerchberg-Saxton phase retrieval (holographic displays).

    python3 bin/figures/graphics/graphics_13.py
"""
import datetime as dt
import json
import pathlib
import sys

sys.dont_write_bytecode = True
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from style import *  # noqa: E402,F401,F403

import numpy as np  # noqa: E402
from mpl_toolkits.mplot3d import Axes3D  # noqa: E402,F401

OUT = HERE.parents[2] / "assets/img/blog/graphics"
DATA = json.loads((HERE / "data/13-frontiers.json").read_text(encoding="utf-8"))
TODAY = "2026-11-02"

TOPICS = DATA["topics"]
TOPIC_LABEL = {
    "light": ("Light transport", "光传输与渲染", "光輸送とレンダリング"),
    "neural": ("Neural & hybrid repr.", "神经与混合表示", "ニューラル・ハイブリッド表現"),
    "geometry": ("Geometry & modeling", "几何与建模", "幾何とモデリング"),
    "simulation": ("Simulation", "物理模拟", "シミュレーション"),
    "animation": ("Animation & characters", "动画与角色", "アニメーションとキャラクター"),
    "imaging": ("Imaging & displays", "成像与显示", "イメージングとディスプレイ"),
    "fabrication": ("Fabrication & design", "制造与设计", "ファブリケーションとデザイン"),
    "generative": ("Generative 3D/4D", "生成式 3D/4D", "3D/4D 生成"),
}
TCOL = dict(light="#f2b134", neural="#9467bd", geometry="#1f77b4", simulation="#17becf",
            animation="#d62728", imaging="#e377c2", fabrication="#8c564b", generative="#2ca02c")
STATUS = ("published", "accepted", "preprint")
STATUS_LABEL = {
    "published": ("Published", "已发表", "発表済み"),
    "accepted": ("Accepted / to appear", "已接收 / 待发表", "採択済み / 発表予定"),
    "preprint": ("Preprint", "预印本", "プレプリント"),
}
SCOL = dict(published=C["y"], accepted=C["z"], preprint=C["b"])


def out(name, lang=None):
    return OUT / (f"13-{name}_{lang}.svg" if lang else f"13-{name}.svg")


def frac_month(iso):
    """2026-07-19 -> 7.58 (month number plus the fraction of the month already elapsed)."""
    d = dt.date.fromisoformat(iso)
    first = dt.date(d.year, d.month, 1)
    nxt = dt.date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    return d.month + (d.day - 1) / (nxt - first).days


def status_matrix(key):
    """Counts of works per (key value, status); key is 'topic' or 'month'."""
    rows = TOPICS if key == "topic" else list(range(1, 13))
    M = np.zeros((len(rows), len(STATUS)), dtype=int)
    for w in DATA["works"]:
        M[rows.index(w[key]), STATUS.index(w["status"])] += 1
    return rows, M


# ---------------------------------------------------------------------------
# 1. Venue timeline (language-neutral)
# ---------------------------------------------------------------------------
def fig_timeline():
    vs = DATA["venues"]
    n = len(vs)
    fig, ax = plt.subplots(figsize=(10, 5.4))
    today = frac_month(TODAY)
    ax.axvspan(frac_month("2026-06-01"), today, color=C["fill"], lw=0, zorder=0)
    ax.text((frac_month("2026-06-01") + today) / 2, -0.95, "arXiv cs.GR", ha="center", va="center",
            color=C["a"], fontsize=14)
    for i, v in enumerate(vs):
        y = n - 1 - i
        x0, x1 = frac_month(v["start"]), frac_month(v["end"]) + 1 / 30
        done = v["end"] < TODAY
        ax.barh(y, max(x1 - x0, 0.14), left=x0, height=0.56, color=C["a"] if done else "white",
                edgecolor=C["a"], lw=2, hatch=None if done else "///", zorder=3)
        k = sum(1 for w in DATA["works"] if w["venue"].startswith(v["key"] + " 2026"))
        if k:
            ax.text(x1 + 0.18, y, str(k), va="center", fontsize=14, color=C["dark"], fontweight="bold")
    ax.axvline(today, ls="--", color=C["x"], lw=2, zorder=4)
    ax.text(today, n - 0.35, TODAY, color=C["x"], ha="center", va="bottom", fontsize=13)
    ax.set_yticks(range(n))
    ax.set_yticklabels([v["key"] for v in vs][::-1])
    ax.set_xticks(range(1, 13))
    ax.set_xlim(1, 13)
    ax.set_ylim(-1.4, n + 0.3)
    ax.set_xlabel("2026")
    ax.grid(axis="y", visible=False)
    save(fig, out("venue-timeline"))


# ---------------------------------------------------------------------------
# 2. Works per topic and status (localized)
# ---------------------------------------------------------------------------
def fig_topic_status():
    rows, M = status_matrix("topic")
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(10, 5.8))
        y = np.arange(len(rows))[::-1]
        left = np.zeros(len(rows))
        for j, s in enumerate(STATUS):
            ax.barh(y, M[:, j], left=left, height=0.62, color=SCOL[s], label=label(lang, *STATUS_LABEL[s]))
            for yi, l0, m in zip(y, left, M[:, j]):
                if m:
                    ax.text(l0 + m / 2, yi, str(m), ha="center", va="center", color="white",
                            fontsize=14, fontweight="bold")
            left = left + M[:, j]
        ax.set_yticks(y)
        ax.set_yticklabels([label(lang, *TOPIC_LABEL[t]) for t in rows])
        ax.set_xlim(0, M.sum(axis=1).max() + 0.5)
        ax.set_xlabel(label(lang, "number of works in this chapter", "本章收录的工作数", "本章で紹介する件数"))
        ax.legend(loc="lower center", bbox_to_anchor=(0.4, 1.0), ncol=3, frameon=False, fontsize=13)
        ax.grid(axis="y", visible=False)
        save(fig, out("topic-status", lang))


# ---------------------------------------------------------------------------
# 3. Works per month and status (localized legend)
# ---------------------------------------------------------------------------
def fig_months():
    months, M = status_matrix("month")
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(10, 4.8))
        bottom = np.zeros(len(months))
        for j, s in enumerate(STATUS):
            ax.bar(months, M[:, j], bottom=bottom, width=0.7, color=SCOL[s], label=label(lang, *STATUS_LABEL[s]))
            bottom = bottom + M[:, j]
        ax.axvline(frac_month(TODAY) - 0.5, ls="--", color=C["x"], lw=2)
        ax.set_xticks(months)
        ax.set_xlabel("2026")
        ax.set_ylabel(label(lang, "works", "工作数", "件数"))
        ax.legend(loc="upper left", frameon=False, fontsize=13)
        ax.grid(axis="x", visible=False)
        save(fig, out("months", lang))


# ---------------------------------------------------------------------------
# 4. Trend map: topics -> blog chapters that teach the prerequisites (localized)
# ---------------------------------------------------------------------------
PREFIX = (("graphics-engine-", "GE"), ("graphics-", "G"), ("neural-rendering-", "NR"),
          ("world-models-", "WM"), ("embodied-ai-", "EA"))


def chapter_code(slug):
    for i, (p, c) in enumerate(PREFIX):
        if slug.startswith(p):
            num = slug[len(p):len(p) + 2]
            return (i if c != "GE" else 1.5), int(num), c + num
    raise ValueError(slug)


def fig_trend_map():
    edges = {}
    for w in DATA["works"]:
        for s in w["builds_on"]:
            edges[(w["topic"], s)] = edges.get((w["topic"], s), 0) + 1
    chapters = sorted({s for _, s in edges}, key=lambda s: chapter_code(s)[:2])
    yt = {t: 1 - i / (len(TOPICS) - 1) for i, t in enumerate(TOPICS)}
    yc = {s: 1 - i / (len(chapters) - 1) for i, s in enumerate(chapters)}
    tb = np.linspace(0, 1, 60)
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(10, 8))
        for (t, s), k in sorted(edges.items(), key=lambda e: e[1]):
            y0, y1 = yt[t], yc[s]
            x = 3 * (1 - tb) ** 2 * tb * 0.5 + 3 * (1 - tb) * tb ** 2 * 0.5 + tb ** 3
            y = (1 - tb) ** 3 * y0 + 3 * (1 - tb) ** 2 * tb * y0 + 3 * (1 - tb) * tb ** 2 * y1 + tb ** 3 * y1
            ax.plot(x, y, color=TCOL[t], lw=1.2 + 1.6 * k, alpha=0.55, solid_capstyle="round")
        for t in TOPICS:
            ax.scatter([0], [yt[t]], s=160, color=TCOL[t], zorder=3)
            ax.text(-0.03, yt[t], label(lang, *TOPIC_LABEL[t]), ha="right", va="center", fontsize=15)
        for s in chapters:
            deg = sum(k for (_, s2), k in edges.items() if s2 == s)
            ax.scatter([1], [yc[s]], s=40 + 22 * deg, color=C["dark"], zorder=3)
            ax.text(1.04, yc[s], chapter_code(s)[2], ha="left", va="center", fontsize=14, family="DejaVu Sans Mono")
        ax.set_xlim(-0.02, 1.02)
        ax.set_ylim(-0.04, 1.04)
        ax.axis("off")
        save(fig, out("trend-map", lang))


# ---------------------------------------------------------------------------
# 5. Gaussian ray tracing: the peak response of a 3D Gaussian along a ray
# ---------------------------------------------------------------------------
def gaussian_along_ray(o, d, mu, Si, t):
    """G(o + t d) = exp(-q/2) with q the squared Mahalanobis distance."""
    x = o[None, :] + t[:, None] * d[None, :] - mu[None, :]
    return np.exp(-0.5 * np.einsum("ni,ij,nj->n", x, Si, x))


def t_star(o, d, mu, Si):
    """Ray parameter of the peak response (minimum Mahalanobis distance)."""
    return d @ Si @ (mu - o) / (d @ Si @ d)


def fig_gaussian_ray():
    mu = np.zeros(3)
    s = np.array([1.5, 0.6, 0.45])
    a, b = np.deg2rad(35), np.deg2rad(20)
    Rz = np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
    Rx = np.array([[1, 0, 0], [0, np.cos(b), -np.sin(b)], [0, np.sin(b), np.cos(b)]])
    R = Rz @ Rx
    Sigma = R @ np.diag(s ** 2) @ R.T
    Si = np.linalg.inv(Sigma)
    d = np.array([1.0, -0.55, 0.15])
    d /= np.linalg.norm(d)
    e = np.cross(d, [0, 0, 1.0])
    e /= np.linalg.norm(e)
    offsets = (0.0, 0.5, 1.0)
    cols = (C["x"], C["b"], C["z"])
    T = 6.4
    t = np.linspace(0, T, 400)

    fig = plt.figure(figsize=(11.5, 5))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    u, v = np.meshgrid(np.linspace(0, 2 * np.pi, 40), np.linspace(0, np.pi, 20))
    P = np.stack([np.cos(u) * np.sin(v), np.sin(u) * np.sin(v), np.cos(v)], -1) * s
    P = P @ R.T + mu
    ax.plot_surface(P[..., 0], P[..., 1], P[..., 2], color=C["a"], alpha=0.25, lw=0)
    ax.plot_wireframe(P[..., 0], P[..., 1], P[..., 2], color=C["a"], lw=0.4, alpha=0.5, rstride=2, cstride=4)
    for off, c in zip(offsets, cols):
        o = mu - 3.2 * d + off * e
        line = o[None, :] + t[t <= 5.6, None] * d[None, :]
        ax.plot(line[:, 0], line[:, 1], line[:, 2], color=c, lw=2.4)
        ts = t_star(o, d, mu, Si)
        p = o + ts * d
        ax.scatter([p[0]], [p[1]], [p[2]], color=c, s=50, depthshade=False)
        ax.scatter([o[0]], [o[1]], [o[2]], color=c, s=25, marker="s", depthshade=False)
    lim = 2.4
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_zlim(-lim, lim)
    ax.set_box_aspect((1, 1, 1))
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
    ax.view_init(elev=24, azim=-58)
    ax.set_title(r"$\Sigma=R\,S^2R^\top$")

    ax2 = fig.add_subplot(1, 2, 2)
    for off, c in zip(offsets, cols):
        o = mu - 3.2 * d + off * e
        g = gaussian_along_ray(o, d, mu, Si, t)
        ts = t_star(o, d, mu, Si)
        gs = gaussian_along_ray(o, d, mu, Si, np.array([ts]))[0]
        ax2.plot(t, g, color=c, lw=2.4, label=f"offset {off:.1f}")
        ax2.plot([ts, ts], [0, gs], color=c, ls="--", lw=1.6)
        ax2.scatter([ts], [gs], color=c, s=50, zorder=3)
        ax2.annotate(f"{gs:.2f}", (ts, gs), xytext=(4.6, gs), color=c, fontsize=14, va="center",
                     arrowprops=dict(arrowstyle="-", color=c, lw=0.8, ls=":"))
    ax2.legend(frameon=False, loc="upper left", fontsize=12)
    ax2.set_xlabel(r"$t$")
    ax2.set_ylabel(r"$G(\mathbf{o}+t\,\mathbf{d})$")
    ax2.set_ylim(0, 1.12)
    ax2.set_title(r"$t^*=\frac{\mathbf{d}^\top\Sigma^{-1}(\mu-\mathbf{o})}{\mathbf{d}^\top\Sigma^{-1}\mathbf{d}}$")
    fig.tight_layout()
    save(fig, out("gaussian-ray"))


# ---------------------------------------------------------------------------
# 6. Control variates: subtract a correlated function whose integral is known
# ---------------------------------------------------------------------------
def fig_control_variate():
    f = np.exp                       # integrand on [0, 1], exact integral e - 1
    g = lambda x: 1 + x              # control variate, exact integral 3/2
    I, G = np.e - 1, 1.5
    rng = np.random.default_rng(13)
    xs = rng.random(200_000)
    beta = np.cov(f(xs), g(xs))[0, 1] / np.var(g(xs), ddof=1)   # optimal coefficient
    N, trials = 8, 4000
    X = rng.random((trials, N))
    mc = f(X).mean(1)
    cv = (f(X) - beta * (g(X) - G)).mean(1)

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11.5, 4.6))
    x = np.linspace(0, 1, 200)
    a1.plot(x, f(x), color=C["a"], label=r"$f(x)=e^x$")
    a1.plot(x, beta * g(x), color=C["b"], label=rf"$\beta g(x),\ \beta={beta:.2f}$")
    a1.fill_between(x, f(x), beta * g(x), color=C["gray"], alpha=0.25)
    a1.set_xlabel(r"$x$")
    a1.legend(frameon=False)
    bins = np.linspace(I - 0.45, I + 0.45, 61)
    a2.hist(mc, bins=bins, color=C["a"], alpha=0.55, label=rf"MC  $\sigma={mc.std():.3f}$")
    a2.hist(cv, bins=bins, color=C["b"], alpha=0.75, label=rf"CV  $\sigma={cv.std():.4f}$")
    a2.axvline(I, color=C["dark"], ls="--", lw=1.6)
    a2.set_xlabel(rf"$\hat I\ \ (N={N})$")
    a2.legend(frameon=False, loc="upper left")
    a2.grid(axis="y", visible=False)
    fig.tight_layout()
    save(fig, out("control-variate"))


# ---------------------------------------------------------------------------
# 7. The IPC log barrier and its repulsive force
# ---------------------------------------------------------------------------
def ipc_barrier(d, dh):
    b = -(d - dh) ** 2 * np.log(d / dh)
    return np.where(d < dh, b, 0.0)


def ipc_force(d, dh):
    """-db/dd: positive = pushes the two primitives apart."""
    f = 2 * (d - dh) * np.log(d / dh) + (d - dh) ** 2 / d
    return np.where(d < dh, f, 0.0)


def fig_ipc_barrier():
    d = np.linspace(0.004, 1.5, 800)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11.5, 4.4))
    for dh, c in ((0.5, C["b"]), (1.0, C["a"])):
        a1.plot(d, ipc_barrier(d, dh), color=c, label=rf"$\hat d={dh}$")
        a2.plot(d, ipc_force(d, dh), color=c, label=rf"$\hat d={dh}$")
        for ax in (a1, a2):
            ax.axvline(dh, color=c, ls=":", lw=1.4)
    a1.set_ylim(0, 4)
    a2.set_ylim(0, 12)
    a1.set_xlabel(r"$d$"); a2.set_xlabel(r"$d$")
    a1.set_title(r"$b(d)=-(d-\hat d)^2\ln(d/\hat d)$")
    a2.set_title(r"$-b'(d)$")
    a1.legend(frameon=False); a2.legend(frameon=False)
    fig.tight_layout()
    save(fig, out("ipc-barrier"))


# ---------------------------------------------------------------------------
# 8. Phase-only hologram by Gerchberg-Saxton (far-field / FFT propagation)
# ---------------------------------------------------------------------------
def gerchberg_saxton(A, iters, seed=0):
    rng = np.random.default_rng(seed)
    phi = rng.uniform(0, 2 * np.pi, A.shape)          # phase in the image plane
    errs, recons, holo = [], {}, None
    for k in range(1, iters + 1):
        holo = np.angle(np.fft.ifft2(A * np.exp(1j * phi)))   # SLM can only show a phase
        R = np.fft.fft2(np.exp(1j * holo))                    # what the viewer sees
        amp = np.abs(R)
        sc = (amp * A).sum() / (amp ** 2).sum()                # best brightness scale
        errs.append(np.sqrt(((sc * amp - A) ** 2).mean() / (A ** 2).mean()))
        recons[k] = (sc * amp) ** 2
        phi = np.angle(R)                                     # keep phase, reset amplitude
    return holo, recons, np.array(errs)


def gs_target(N=128):
    yy, xx = np.mgrid[0:N, 0:N] - (N - 1) / 2
    r = np.hypot(xx, yy)
    A = ((r > 30) & (r < 38)).astype(float)
    A[(np.abs(xx) < 4) & (np.abs(yy) < 22)] = 1.0
    A[(np.abs(yy) < 4) & (np.abs(xx) < 22)] = 1.0
    return A


def fig_hologram():
    A = gs_target()
    iters = 60
    holo, recons, errs = gerchberg_saxton(A, iters)
    fig, axs = plt.subplots(2, 3, figsize=(11, 7.4))
    panels = [(A ** 2, r"$|A|^2$", "gray"), (holo, r"$\varphi_{\mathrm{SLM}}$", "twilight"), None,
              (recons[1], r"$k=1$", "gray"), (recons[5], r"$k=5$", "gray"), (recons[iters], rf"$k={iters}$", "gray")]
    for ax, p in zip(axs.flat, panels):
        if p is None:
            continue
        img, title, cmap = p
        if cmap == "gray":
            ax.imshow(img, cmap=cmap, vmin=0, vmax=1.5)
        else:
            ax.imshow(img, cmap=cmap, vmin=-np.pi, vmax=np.pi)
        ax.set_title(title)
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    ax = axs[0, 2]
    ax.semilogy(np.arange(1, iters + 1), errs, color=C["a"])
    ax.set_xlabel(r"$k$")
    ax.set_title("RMSE")
    fig.tight_layout()
    save(fig, out("hologram-gs"))
    print("GS relative RMSE: k=1 %.3f, k=5 %.3f, k=%d %.3f" % (errs[0], errs[4], iters, errs[-1]))


if __name__ == "__main__":
    fig_timeline()
    fig_topic_status()
    fig_months()
    fig_trend_map()
    fig_gaussian_ray()
    fig_control_variate()
    fig_ipc_barrier()
    fig_hologram()
