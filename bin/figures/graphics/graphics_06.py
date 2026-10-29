"""Figures for graphics post 06 (real-time ray tracing).

    python3 bin/figures/graphics/graphics_06.py

Writes assets/img/blog/graphics/06-*.svg. Every plot is computed: the a-trous and RIS panels run
the post's own code (same seeds, same toy scenes), so the numbers match the text.
Screen-space figures use image coordinates (u to the right, v down), as in the post.
"""
import sys, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401
import numpy as np  # noqa: E402
from matplotlib.patches import Rectangle, Circle, FancyArrowPatch, Polygon, FancyBboxPatch, ConnectionPatch  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/graphics"


_LANG = ["en"]


def T(en, zh, ja):
    """Label in the language currently being rendered (no '$' math inside CJK strings)."""
    return label(_LANG[0], en, zh, ja)


def out(name):
    return OUT / f"06-{name}.svg"


def outl(name):
    """Localized figure: 06-<name>_<lang>.svg."""
    return OUT / f"06-{name}_{_LANG[0]}.svg"


def clean_ax(ax):
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    for s in ax.spines.values():
        s.set_visible(False)


def arrow(ax, p, q, color, lw=2.2, style="-|>", ms=16, ls="-", **kw):
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle=style, mutation_scale=ms, color=color, lw=lw,
                                 linestyle=ls, shrinkA=0, shrinkB=0, **kw))


# ---------------------------------------------------------------------------------------------
# 1. TLAS / BLAS: two meshes (object space) with their BVHs, three instances in world space
# ---------------------------------------------------------------------------------------------
def tri_bvh(tris, depth=0, maxd=2):
    """Median-split BVH over 2D triangles (list of 3x2 arrays). Returns list of (lo, hi, depth)."""
    pts = np.concatenate(tris)
    lo, hi = pts.min(0), pts.max(0)
    boxes = [(lo, hi, depth)]
    if len(tris) > 1 and depth < maxd:
        cent = np.array([t.mean(0) for t in tris])
        ax_ = np.argmax(hi - lo)
        order = np.argsort(cent[:, ax_])
        k = len(tris) // 2
        boxes += tri_bvh([tris[i] for i in order[:k]], depth + 1, maxd)
        boxes += tri_bvh([tris[i] for i in order[k:]], depth + 1, maxd)
    return boxes


def fig_tlas_blas():
    tree = [np.array(t, float) for t in (
        [[-0.6, 0.6], [0.6, 0.6], [0, 1.4]], [[-0.5, 1.1], [0.5, 1.1], [0, 1.8]],
        [[-0.4, 1.55], [0.4, 1.55], [0, 2.2]], [[-0.12, 0], [0.12, 0], [0.12, 0.6]],
        [[-0.12, 0], [0.12, 0.6], [-0.12, 0.6]])]
    rock = [np.array(t, float) for t in (
        [[-0.7, 0], [0.1, 0], [-0.4, 0.5]], [[0.1, 0], [0.7, 0], [0.4, 0.45]],
        [[0.1, 0], [0.4, 0.45], [-0.05, 0.75]], [[0.1, 0], [-0.05, 0.75], [-0.4, 0.5]])]
    blas = {"A": tree, "B": rock}
    bcol = {"A": C["y"], "B": C["b"]}

    def M(tx, ty, ang, s):
        c, si = np.cos(np.radians(ang)), np.sin(np.radians(ang))
        return np.array([[s * c, -s * si, tx], [s * si, s * c, ty]])

    inst = [("A", M(-2.4, 0.0, 0, 1.0)), ("A", M(0.2, 0.0, -12, 1.35)), ("B", M(2.6, 0.0, 0, 1.3))]
    dcol = [C["dark"], C["z"], C["gray"]]

    fig = plt.figure(figsize=(10, 9.6))
    gs = fig.add_gridspec(2, 2, height_ratios=[1, 1.05], width_ratios=[1, 1.7], hspace=0.15, wspace=0.08)

    # (a) object space BLAS with BVH boxes
    axo = fig.add_subplot(gs[0, 0])
    for k, (name, off) in enumerate([("A", 0.0), ("B", 2.0)]):
        for t in blas[name]:
            axo.add_patch(Polygon(t + [off, 0], closed=True, fc=bcol[name], ec="k", lw=1, alpha=0.6))
        for lo, hi, d in tri_bvh(blas[name]):
            pad = 0.05 * (2 - d)
            axo.add_patch(Rectangle(lo + [off - pad, -pad], *(hi - lo + 2 * pad), fill=False,
                                    ec=dcol[d], lw=2.2 - 0.5 * d))
        axo.text(off, -0.55, f"BLAS {name}", ha="center", fontsize=15, color=bcol[name], weight="bold")
    axo.set_xlim(-1.0, 3.0); axo.set_ylim(-0.8, 2.5); axo.set_aspect("equal"); clean_ax(axo)
    axo.set_title(T("(a) object space", "(a) 物体空间", "(a) オブジェクト空間"), fontsize=15)

    # (b) world space: instances = BLAS + transform, TLAS boxes over transformed BLAS bounds
    axw = fig.add_subplot(gs[0, 1])
    axw.axhline(0, color=C["gray"], lw=1.5)
    world_boxes = []
    for i, (name, Mi) in enumerate(inst):
        A, t = Mi[:, :2], Mi[:, 2]
        for tr in blas[name]:
            axw.add_patch(Polygon(tr @ A.T + t, closed=True, fc=bcol[name], ec="k", lw=1, alpha=0.6))
        lo, hi, _ = tri_bvh(blas[name])[0]
        corners = np.array([[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]]) @ A.T + t
        axw.add_patch(Polygon(corners, closed=True, fill=False, ec=bcol[name], lw=1.4, ls=":"))
        wlo, whi = corners.min(0), corners.max(0)
        world_boxes.append((wlo, whi))
        axw.add_patch(Rectangle(wlo, *(whi - wlo), fill=False, ec=C["a"], lw=2, ls="--"))
        axw.text(wlo[0] + 0.05, whi[1] + 0.12, f"$M_{i}$", color=C["a"], fontsize=16)
    allb = np.array([b for pair in world_boxes for b in pair])
    lo, hi = allb.min(0) - 0.15, allb.max(0) + 0.15
    axw.add_patch(Rectangle(lo, *(hi - lo), fill=False, ec=C["dark"], lw=2.6))
    axw.text(hi[0] - 0.05, hi[1] + 0.1, "TLAS", ha="right", fontsize=15, weight="bold")
    axw.set_xlim(lo[0] - 0.2, hi[0] + 0.2); axw.set_ylim(-0.9, hi[1] + 0.6); axw.set_aspect("equal")
    clean_ax(axw); axw.set_title(T("(b) world space", "(b) 世界空间", "(b) ワールド空間"), fontsize=15)

    # (c) the two-level tree
    axt = fig.add_subplot(gs[1, :]); clean_ax(axt)
    axt.set_xlim(0, 10); axt.set_ylim(0, 6.2)

    def node(x, y, txt, fc, w=1.7, h=0.7):
        axt.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h, boxstyle="round,pad=0.05",
                                     fc=fc, ec="k", lw=1.5))
        axt.text(x, y, txt, ha="center", va="center", fontsize=15)

    node(5, 5.6, "TLAS", "#dddddd")
    ix = [2.0, 5.0, 8.0]
    for i, x in enumerate(ix):
        node(x, 4.2, f"inst {i}: $M_{i}$", C["fill"], w=2.2)
        arrow(axt, (5, 5.2), (x, 4.6), C["dark"], lw=1.6)
    bx = {"A": 3.5, "B": 8.0}
    for i, (name, _) in enumerate(inst):
        arrow(axt, (ix[i], 3.8), (bx[name], 3.0), bcol[name], lw=2.2)
    for name, x in bx.items():
        node(x, 2.7, f"BLAS {name}", bcol[name], w=1.9)
        # BLAS BVH: root -> 2 -> 4 boxes (structure from tri_bvh)
        boxes = tri_bvh(blas[name])
        lv1 = [x - 0.9, x + 0.9]
        for xx in lv1:
            axt.plot([x, xx], [2.35, 1.6], color=C["gray"], lw=1.5)
            axt.add_patch(Rectangle((xx - 0.3, 1.35), 0.6, 0.35, fc="white", ec=dcol[1], lw=1.8))
        n2 = sum(1 for b in boxes if b[2] == 2)
        lv2 = np.linspace(x - 1.35, x + 1.35, n2)
        for j, xx in enumerate(lv2):
            par = lv1[0] if j < n2 / 2 else lv1[1]
            axt.plot([par, xx], [1.35, 0.75], color=C["gray"], lw=1.2)
            axt.add_patch(Rectangle((xx - 0.18, 0.45), 0.36, 0.3, fc="white", ec=dcol[2], lw=1.6))
    axt.text(0.2, 1.1, "BVH", fontsize=15, color=C["gray"], va="center")
    axt.set_title(T("(c) TLAS → instances → shared BLAS", "(c) TLAS → 实例 → 共享的 BLAS", "(c) TLAS → インスタンス → 共有 BLAS"), fontsize=15)
    save(fig, outl("tlas-blas"))


# ---------------------------------------------------------------------------------------------
# 2. Temporal reprojection: motion vectors and disocclusion on a toy 2D frame pair
# ---------------------------------------------------------------------------------------------
def fig_reprojection():
    W, H = 48, 30
    yy, xx = np.mgrid[0:H, 0:W] + 0.5
    bg = 0.75 + 0.15 * (((xx // 4) + (yy // 4)) % 2)        # static checker floor, depth 5
    c_prev, c_cur, r = np.array([16.0, 15.0]), np.array([26.0, 15.0]), 7.0

    def frame(c):
        disc = (xx - c[0]) ** 2 + (yy - c[1]) ** 2 < r * r
        col = np.where(disc, 0.35, bg); depth = np.where(disc, 2.0, 5.0)
        return disc, col, depth

    d_prev, col_prev, z_prev = frame(c_prev)
    d_cur, col_cur, z_cur = frame(c_cur)
    m = np.zeros((H, W, 2)); m[d_cur] = c_cur - c_prev            # motion vector m(u) (static camera)
    up = np.stack([xx, yy], -1) - m                               # u_prev = u - m(u)
    ix = np.clip(up[..., 0].astype(int), 0, W - 1); iy = np.clip(up[..., 1].astype(int), 0, H - 1)
    zp = z_prev[iy, ix]
    valid = np.abs(zp - z_cur) < 0.1 * z_cur                      # depth test
    disocc = ~valid

    fig, axs = plt.subplots(1, 3, figsize=(13, 3.6))
    ext = (0, W, H, 0)
    for ax, img, title in [(axs[0], col_prev, "$t-1$"), (axs[1], col_cur, r"$t$:  $\mathbf{u}_{prev}=\mathbf{u}-\mathbf{m}(\mathbf{u})$")]:
        ax.imshow(img, cmap="gray", vmin=0, vmax=1, extent=ext, interpolation="nearest")
        ax.set_title(title, fontsize=15); clean_ax(ax)
    for u in [(22, 10), (30, 15), (25, 20)]:
        p = np.array(u, float); q = p - (c_cur - c_prev)
        axs[1].plot(*p, "o", color=C["b"], ms=6)
        arrow(axs[1], tuple(p), tuple(q), C["b"], lw=2.2, ms=14)
    axs[1].add_patch(Circle(c_prev, r, fill=False, ec=C["b"], ls="--", lw=1.6))
    rgb = np.ones((H, W, 3)) * col_cur[..., None]
    rgb[disocc] = 0.55 * rgb[disocc] + 0.45 * np.array([0.84, 0.15, 0.16])
    rgb[valid & d_cur] = 0.6 * rgb[valid & d_cur] + 0.4 * np.array([0.17, 0.63, 0.17])
    axs[2].imshow(rgb, extent=ext, interpolation="nearest")
    axs[2].add_patch(Circle(c_prev, r, fill=False, ec=C["b"], ls="--", lw=1.6))
    axs[2].set_title(r"$|z - z_{prev}| < \epsilon$ ?", fontsize=15); clean_ax(axs[2])
    axs[2].text(9.0, 15, "✗", fontsize=26, color=C["x"], ha="center", va="center", weight="bold")
    fig.tight_layout()
    save(fig, out("reprojection"))
    return disocc.sum()


# ---------------------------------------------------------------------------------------------
# 3. EMA: steady-state variance and lag / history reset
# ---------------------------------------------------------------------------------------------
def fig_ema():
    rng = np.random.default_rng(3)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 4.3), gridspec_kw=dict(width_ratios=[1, 1.5]))
    al = np.linspace(0.01, 1, 400)
    a1.plot(al, (2 - al) / al, color=C["a"])
    a1.set_yscale("log"); a1.set_xlabel(r"$\alpha$"); a1.set_ylabel(r"$\sigma^2/\mathrm{Var}[\bar c] = (2-\alpha)/\alpha$")
    for a in (0.05, 0.1, 0.2):
        v = (2 - a) / a
        a1.plot(a, v, "o", color=C["b"], ms=8)
        a1.annotate(f"α={a}: {v:.0f}", (a, v), (a + 0.08, v * 1.1), fontsize=14)
    a1.set_title(T("equivalent frames", "等效帧数", "等価フレーム数"), fontsize=15)

    # pixel that is background for 60 frames, then a different surface appears (disocclusion)
    NF, t0, sigma = 120, 60, 0.25
    mean = np.where(np.arange(NF) < t0, 0.3, 0.8)
    c = mean + sigma * rng.standard_normal(NF)
    ema, hl = np.zeros(NF), np.zeros(NF)
    alpha, amin = 0.1, 0.1
    n = 0
    for t in range(NF):
        ema[t] = c[t] if t == 0 else (1 - alpha) * ema[t - 1] + alpha * c[t]
        n = 1 if t == t0 or t == 0 else n + 1                    # history rejected at t0
        a = max(1 / n, amin)
        hl[t] = c[t] if n == 1 else (1 - a) * hl[t - 1] + a * c[t]
    t = np.arange(NF)
    a2.plot(t, c, ".", color=C["gray"], ms=5, label=r"$c_t$ (1 spp)")
    a2.plot(t, mean, color=C["dark"], lw=1.2, ls=":", label=T("truth", "真值", "真値"))
    a2.plot(t, ema, color=C["x"], label="EMA α=0.1, " + T("no rejection", "不拒绝", "棄却なし"))
    a2.plot(t, hl, color=C["z"], label=T("reject at t₀, α=max(1/n, 0.1)", "在 t₀ 拒绝，α=max(1/n, 0.1)", "t₀ で棄却、α=max(1/n, 0.1)"))
    sd = sigma * np.sqrt(alpha / (2 - alpha))
    for lo_, hi_, mu in [(20, t0, 0.3), (t0 + 30, NF, 0.8)]:
        a2.fill_between([lo_, hi_], mu - sd, mu + sd, color=C["z"], alpha=0.15, lw=0)
    a2.axvline(t0, color=C["gray"], ls="--", lw=1.2); a2.text(t0 + 1, 1.25, "$t_0$", fontsize=15)
    a2.set_xlabel(T("frame", "帧", "フレーム")); a2.set_ylim(-0.4, 1.4); a2.legend(fontsize=11.5, loc="upper left", ncol=2)
    a2.set_title(T("lag vs. history reset", "滞后 vs. 历史重置", "遅れ vs. 履歴リセット"), fontsize=15)
    fig.tight_layout()
    save(fig, outl("ema"))


# ---------------------------------------------------------------------------------------------
# 4. a-trous taps at steps 1, 2, 4, 8 and the effective kernel after each level
# ---------------------------------------------------------------------------------------------
H5 = np.array([1, 4, 6, 4, 1]) / 16.0


def fig_atrous_taps():
    R, R2 = 32, 17
    fig = plt.figure(figsize=(10, 12.6))
    gs = fig.add_gridspec(3, 4, height_ratios=[1, 1, 0.5], hspace=0.18, wspace=0.08)
    top = [fig.add_subplot(gs[r, 2 * c:2 * c + 2]) for r in range(2) for c in range(2)]
    bot = [fig.add_subplot(gs[2, c]) for c in range(4)]
    eff = np.zeros((2 * R + 1, 2 * R + 1)); eff[R, R] = 1.0
    K = np.outer(H5, H5)
    for col, step in enumerate([1, 2, 4, 8]):
        ax = top[col]
        ax.add_patch(Rectangle((-R2 - 0.5, -R2 - 0.5), 2 * R2 + 1, 2 * R2 + 1, fc="#f7f7f7", ec="none"))
        for gx in np.arange(-R2, R2 + 2) - 0.5:
            ax.axvline(gx, color="#e4e4e4", lw=0.5); ax.axhline(gx, color="#e4e4e4", lw=0.5)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                wgt = H5[dy + 2] * H5[dx + 2]
                ax.add_patch(Rectangle((dx * step - 0.5, dy * step - 0.5), 1, 1, fc=plt.cm.viridis(wgt / K.max()),
                                       ec="k", lw=0.8, zorder=3))
        ax.add_patch(Rectangle((-0.5, -0.5), 1, 1, fill=False, ec=C["x"], lw=2.5, zorder=4))
        ax.set_xlim(-R2 - 0.5, R2 + 0.5); ax.set_ylim(R2 + 0.5, -R2 - 0.5); ax.set_aspect("equal"); clean_ax(ax)
        ax.set_title(f"$2^i = {step}$", fontsize=16)
        # effective kernel = dilated kernels convolved (no edge-stopping)
        new = np.zeros_like(eff)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                new += K[dy + 2, dx + 2] * np.roll(np.roll(eff, dy * step, 0), dx * step, 1)
        eff = new
        ax = bot[col]
        ax.imshow(eff, cmap="magma_r", extent=(-R - 0.5, R + 0.5, R + 0.5, -R - 0.5), interpolation="nearest")
        span = 1 + 4 * (2 * step - 1)
        ax.set_title(f"$i \\leq {col}$: {span}²", fontsize=15); clean_ax(ax)
    save(fig, out("atrous-taps"))


# ---------------------------------------------------------------------------------------------
# 5. The post's a-trous code on its own toy image
# ---------------------------------------------------------------------------------------------
def atrous_level(c, nrm, z, step, s_c=0.5, s_n=128.0, s_z=1.0, ret_w_at=None):
    h, w, _ = c.shape
    acc = np.zeros_like(c); wsum = np.zeros((h, w, 1)); taps = []
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            ys = np.clip(np.arange(h) + dy * step, 0, h - 1)
            xs = np.clip(np.arange(w) + dx * step, 0, w - 1)
            cq, nq, zq = c[ys][:, xs], nrm[ys][:, xs], z[ys][:, xs]
            w_c = np.exp(-((c - cq) ** 2).sum(-1) / s_c**2)
            w_n = np.maximum((nrm * nq).sum(-1), 0.0) ** s_n
            w_z = np.exp(-np.abs(z - zq) / (s_z * step + 1e-6))
            wk = (H5[dy + 2] * H5[dx + 2] * w_c * w_n * w_z)[..., None]
            if ret_w_at is not None:
                py, px = ret_w_at
                taps.append((dy, dx, H5[dy + 2] * H5[dx + 2], w_n[py, px] * w_z[py, px], wk[py, px, 0]))
            acc += wk * cq; wsum += wk
    res = acc / np.maximum(wsum, 1e-12)
    return (res, taps) if ret_w_at is not None else res


def atrous(c, nrm, z, levels=5, s_c=4.0, **kw):
    for i in range(levels):
        c = atrous_level(c, nrm, z, 2**i, s_c=s_c, **kw)
        s_c *= 0.5
    return c


def fig_atrous_demo():
    rng = np.random.default_rng(1)
    h, w = 64, 96
    xx = np.mgrid[0:h, 0:w][1]
    left = xx < w // 2
    nrm = np.where(left[..., None], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0])
    z = np.where(left, 2.0, 3.0)
    clean = np.where(left[..., None], [0.8, 0.3, 0.2], [0.2, 0.4, 0.8])
    noisy = clean * rng.exponential(1.0, (h, w, 1))
    out_g = atrous(noisy, nrm, z)
    out_u = atrous(noisy, nrm, z, s_n=0.0, s_z=1e9)
    rmse = lambda a: np.sqrt(((a - clean) ** 2).mean())
    edge = lambda a: np.abs(a[:, w // 2 - 2:w // 2 + 2] - clean[:, w // 2 - 2:w // 2 + 2]).mean()
    nums = dict(rmse_noisy=rmse(noisy), rmse_g=rmse(out_g), edge_g=edge(out_g), edge_u=edge(out_u))
    print("a-trous toy:", {k: round(v, 3) for k, v in nums.items()})

    fig = plt.figure(figsize=(11, 7.0))
    gs = fig.add_gridspec(2, 3, height_ratios=[0.72, 1], hspace=0.25, wspace=0.12)
    panels = [(noisy, T("noisy", "含噪", "ノイズあり") + f" (RMSE {nums['rmse_noisy']:.3f})"),
              (out_g, T("guided", "有引导", "ガイドあり") + f" (RMSE {nums['rmse_g']:.3f})"),
              (out_u, T("unguided", "无引导", "ガイドなし") + f" (RMSE {rmse(out_u):.3f})")]
    for k, (img, t) in enumerate(panels):
        ax = fig.add_subplot(gs[0, k])
        ax.imshow(np.clip(img, 0, 1), interpolation="nearest"); ax.set_title(t, fontsize=14); clean_ax(ax)
    # profile across the crease (red channel, mean over rows)
    ax = fig.add_subplot(gs[1, :2])
    xs = np.arange(w)
    ax.plot(xs, clean[..., 0].mean(0), color=C["dark"], lw=1.5, ls=":", label=T("clean", "无噪声", "ノイズなし"))
    ax.plot(xs, out_g[..., 0].mean(0), color=C["z"], label=T("guided", "有引导", "ガイドあり") + T(", edge err ", "，边缘误差 ", "、エッジ誤差 ") + f"{nums['edge_g']:.3f}")
    ax.plot(xs, out_u[..., 0].mean(0), color=C["x"], label=T("unguided", "无引导", "ガイドなし") + T(", edge err ", "，边缘误差 ", "、エッジ誤差 ") + f"{nums['edge_u']:.3f}")
    ax.axvspan(w // 2 - 2, w // 2 + 2, color=C["light"], alpha=0.3, lw=0)
    ax.set_xlabel(T("pixel x", "像素 x", "ピクセル x")); ax.set_ylabel(T("red channel (row mean)", "红色通道（行平均）", "赤チャンネル（行平均）")); ax.set_xlim(20, 76)
    ax.legend(fontsize=12, loc="upper right"); ax.set_ylim(0.1, 1.0)
    # G-buffer weights of the 5x5 taps of one pixel next to the crease, level 2 (step 2)
    py, px = h // 2, w // 2 - 2
    _, taps = atrous_level(noisy, nrm, z, 2, ret_w_at=(py, px))
    ax = fig.add_subplot(gs[1, 2])
    ax.imshow(np.where(left, 0.82, 0.62), cmap="gray", vmin=0, vmax=1, extent=(-0.5 - px, w - 0.5 - px, h - 0.5 - py, -0.5 - py))
    for dy, dx, hk, wg, _ in taps:
        if wg * hk < 1e-6:
            ax.add_patch(Circle((dx * 2, dy * 2), 0.42, fc="white", ec="k", lw=0.8))
            ax.plot(dx * 2, dy * 2, "x", color=C["gray"], ms=7, mew=1.5)
        else:
            ax.add_patch(Circle((dx * 2, dy * 2), 0.42, fc=plt.cm.viridis(wg * hk / (H5[2] ** 2)), ec="k", lw=0.8))
    ax.plot(0, 0, "x", color=C["x"], ms=10, mew=2.5)
    ax.text(-5.6, -5.4, r"$\mathbf{n}=x$", fontsize=13); ax.text(2.3, -5.4, r"$\mathbf{n}=z$", fontsize=13)
    ax.set_xlim(-6, 6); ax.set_ylim(6, -6); clean_ax(ax); ax.set_aspect("equal")
    ax.set_title(r"$h\cdot w_{\mathbf{n}} w_z$  ($p$)", fontsize=14)
    save(fig, outl("atrous-demo"))
    return nums


# ---------------------------------------------------------------------------------------------
# 6. RIS in 1D: candidates, resampling weights, chosen sample, and the distribution of y vs M
# ---------------------------------------------------------------------------------------------
def p_hat_1d(x):
    return 0.15 + 2.0 * np.exp(-((x - 0.28) / 0.06) ** 2) + 1.2 * np.exp(-((x - 0.72) / 0.09) ** 2)


def ris_1d(M, n, rng):
    """n independent RIS selections from M uniform candidates on [0,1] (source pdf p = 1)."""
    x = rng.random((n, M))
    w = p_hat_1d(x)                                  # w = p_hat / p, p = 1
    cdf = np.cumsum(w, 1); u = rng.random((n, 1)) * cdf[:, -1:]
    z = (cdf < u).sum(1)
    return x[np.arange(n), z]


def fig_ris():
    rng = np.random.default_rng(4)
    xs = np.linspace(0, 1, 600)
    V = ~((xs > 0.64) & (xs < 0.7))
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 4.6))
    a1.plot(xs, p_hat_1d(xs), color=C["a"], label=r"$\hat p$")
    a1.fill_between(xs, 0, p_hat_1d(xs) * V, color=C["a"], alpha=0.15, lw=0, label=r"$f=\hat p\,V$")
    a1.plot(xs, np.ones_like(xs), color=C["gray"], ls="--", label=r"$p=1$")
    M, r8 = 8, np.random.default_rng(19)             # seed picked so the 8 candidates spread out
    cand = r8.random(M); w = p_hat_1d(cand)
    z = r8.choice(M, p=w / w.sum())
    for i in range(M):
        col = C["b"] if i == z else C["dark"]
        a1.plot([cand[i], cand[i]], [0, w[i]], color=col, lw=3 if i == z else 1.8)
        a1.plot(cand[i], w[i], "o", color=col, ms=11 if i == z else 7)
    a1.annotate(f"$y=x_z$, P = {w[z] / w.sum():.2f}", (cand[z], w[z]), (cand[z] + 0.1, w[z] + 0.35),
                fontsize=14, color=C["b"], arrowprops=dict(arrowstyle="->", color=C["b"]))
    a1.set_ylim(0, 2.75); a1.set_xlabel("$x$"); a1.set_title(T("M = 8 candidates; height = resampling weight", "M = 8 个候选；高度 = 重采样权重", "M = 8 個の候補；高さ = リサンプリング重み"), fontsize=14)
    a1.legend(fontsize=12, loc="upper right")
    target = p_hat_1d(xs) / np.trapezoid(p_hat_1d(xs), xs)
    bins = np.linspace(0, 1, 51)
    for Mi, col in [(1, C["gray"]), (4, C["c"]), (32, C["b"])]:
        y = ris_1d(Mi, 200_000, rng)
        hist, _ = np.histogram(y, bins, density=True)
        a2.step(bins[:-1], hist, where="post", color=col, label=f"$M={Mi}$")
    a2.plot(xs, target, color=C["a"], lw=2.5, ls="--", label=r"$\hat p/\int\hat p$")
    a2.set_xlabel("$y$"); a2.set_ylabel(T("density of y", "y 的密度", "y の密度")); a2.legend(fontsize=12)
    a2.set_title(T("distribution of the selected sample", "被选样本的分布", "選ばれたサンプルの分布"), fontsize=14)
    fig.tight_layout()
    save(fig, outl("ris"))


# ---------------------------------------------------------------------------------------------
# 7. The post's many-lights RIS experiment: scene and variance vs M
# ---------------------------------------------------------------------------------------------
def fig_ris_variance():
    rng = np.random.default_rng(0)
    N = 4096
    light_pos = np.c_[rng.uniform(-8, 8, N), rng.uniform(0.5, 4, N), rng.uniform(-8, 8, N)]
    light_I = rng.lognormal(0.0, 1.0, N)
    x, n = np.zeros(3), np.array([0.0, 1.0, 0.0])
    d = light_pos - x
    dist2 = (d * d).sum(1)
    cos = np.maximum((d @ n) / np.sqrt(dist2), 0.0)
    visible = ~((light_pos[:, 0] > 0) & (light_pos[:, 0] < 1.5))
    f = light_I * cos / dist2 * visible
    p_hat = light_I * cos / dist2
    exact = f.sum()

    def ris_vec(M, trials, rng):
        idx = rng.integers(N, size=(trials, M))
        w = p_hat[idx] * N
        cdf = np.cumsum(w, 1); u = rng.random((trials, 1)) * cdf[:, -1:]
        z = np.minimum((cdf < u).sum(1), M - 1)
        y = idx[np.arange(trials), z]
        W = cdf[:, -1] / (M * p_hat[y])
        return f[y] * W

    Ms = [1, 2, 4, 8, 16, 32, 64, 128, 256]
    rel = [ris_vec(M, 100_000, np.random.default_rng(10 + M)).std() / exact for M in Ms]
    print("RIS rel std vs M:", dict(zip(Ms, np.round(rel, 3))))
    # the post's own printed per-sample numbers
    post = {"uniform": 3.38, "RIS M=32": 0.92, "4 merged (128)": 0.74}
    # limit: perfect sampling of p_hat (M -> inf)
    q = p_hat / p_hat.sum()
    lim = np.sqrt((q * (f / q) ** 2).sum() - exact ** 2) / exact

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12.5, 5), gridspec_kw=dict(width_ratios=[1, 1.25]))
    s = a1.scatter(light_pos[:, 0], light_pos[:, 2], c=np.log10(p_hat), s=4, cmap="viridis")
    a1.axvspan(0, 1.5, color=C["x"], alpha=0.18, lw=0)
    a1.plot(0, 0, "*", color=C["b"], ms=20, mec="k")
    a1.set_xlabel("$x$"); a1.set_ylabel("$z$"); a1.set_aspect("equal"); a1.set_xlim(-8, 8); a1.set_ylim(-8, 8)
    cb = fig.colorbar(s, ax=a1, fraction=0.046, pad=0.03); cb.set_label(r"$\log_{10}\hat p$")
    a1.set_title(T("4096 lights (top view)", "4096 个光源（俯视）", "4096 個の光源（上面図）"), fontsize=15)
    a2.loglog(Ms, rel, "o-", color=C["a"], label=T("RIS, M candidates", "RIS，M 个候选", "RIS、M 個の候補"))
    a2.axhline(lim, color=C["gray"], ls="--", lw=1.5, label=T("M → ∞ (sampling ∝ target)", "M → ∞（按目标函数采样）", "M → ∞（目標関数に比例）"))
    a2.plot([1], [post["uniform"]], "s", color=C["x"], ms=11, label=T("post: uniform 3.38", "正文：均匀 3.38", "本文：一様 3.38"))
    a2.plot([32], [post["RIS M=32"]], "D", color=C["b"], ms=10, label=T("post: RIS M=32  0.92", "正文：RIS M=32  0.92", "本文：RIS M=32  0.92"))
    a2.plot([128], [post["4 merged (128)"]], "^", color=C["y"], ms=12, label=T("post: 4 merged  0.74", "正文：合并 4 个  0.74", "本文：4 個を統合  0.74"))
    a2.set_xlabel(T("candidates M", "候选数 M", "候補数 M")); a2.set_ylabel(T("rel. std per sample", "单样本相对标准差", "1 サンプルの相対標準偏差"))
    a2.set_xticks(Ms); a2.set_xticklabels([str(m) for m in Ms]); a2.minorticks_off()
    a2.set_yticks([0.6, 1, 2, 3, 4]); a2.set_yticklabels(["0.6", "1", "2", "3", "4"])
    a2.legend(fontsize=11.5); a2.set_title(T("noise vs. candidate count", "噪声 vs. 候选数", "ノイズ vs. 候補数"), fontsize=15)
    fig.tight_layout()
    save(fig, outl("ris-variance"))
    return dict(zip(Ms, rel)), lim


# ---------------------------------------------------------------------------------------------
# 8. ReSTIR reuse: temporal (reprojected reservoir) and spatial (neighbours, rejection)
# ---------------------------------------------------------------------------------------------
def fig_restir_reuse():
    W, H = 30, 20
    rng = np.random.default_rng(7)
    fig, axs = plt.subplots(1, 2, figsize=(13, 4.9))
    shift = np.array([3.0, 0.0])                       # camera pan: the floor moves 3 px between frames
    obj_c = {0: np.array([19.0, 9.0]), 1: np.array([22.0, 9.0])}
    p = np.array([14.5, 12.5])
    for k, ax in enumerate(axs):
        yy, xx = np.mgrid[0:H, 0:W] + 0.5
        obj = (xx - obj_c[k][0]) ** 2 / 25 + (yy - obj_c[k][1]) ** 2 / 36 < 1
        img = np.where(obj[..., None], np.array([0.80, 0.72, 0.92]), np.array([0.93, 0.93, 0.93]))
        ax.imshow(img, extent=(0, W, H, 0), interpolation="nearest")
        for g in range(W + 1):
            ax.axvline(g, color="white", lw=0.6)
        for g in range(H + 1):
            ax.axhline(g, color="white", lw=0.6)
        ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.set_aspect("equal"); clean_ax(ax)
        if k == 0:
            pp = p - shift
            ax.add_patch(Rectangle(pp - 0.5, 1, 1, fc=C["z"], ec="k"))
            ax.text(pp[0], pp[1] + 1.6, r"$\mathbf{p}_{prev}$", ha="center", fontsize=15, color=C["z"])
            ax.text(pp[0], pp[1] - 1.4, "$r_{t-1}$", ha="center", fontsize=15, color=C["z"])
            ax.set_title("$t-1$", fontsize=16)
        else:
            ax.set_title(r"$t$:  $k=5$", fontsize=16)
            R = 6.0
            ax.add_patch(Circle(p, R, fill=False, ec=C["b"], lw=2, ls="--"))
            ang = rng.uniform(0, 2 * np.pi, 5); rad = R * np.sqrt(rng.uniform(0.15, 1, 5))
            ang[0], rad[0] = 0.0, 5.0                     # make one neighbour land on the object
            for a_, r_ in zip(ang, rad):
                q = np.floor(p + r_ * np.array([np.cos(a_), np.sin(a_)])) + 0.5
                ok = not ((q[0] - obj_c[1][0]) ** 2 / 25 + (q[1] - obj_c[1][1]) ** 2 / 36 < 1)
                col = C["y"] if ok else C["x"]
                ax.add_patch(Rectangle(q - 0.5, 1, 1, fc=col, ec="k"))
                arrow(ax, tuple(q), tuple(p), col, lw=1.8, ms=12, ls="-" if ok else ":")
                if not ok:
                    ax.text(q[0] + 0.8, q[1] - 0.7, "✗", fontsize=20, color=C["x"], weight="bold")
            ax.add_patch(Rectangle(p - 0.5, 1, 1, fc=C["b"], ec="k", lw=1.5))
            ax.text(p[0] - 2.0, p[1] + 0.4, r"$\mathbf{p}$", fontsize=17, color=C["b"])
            ax.text(p[0] - R + 0.3, p[1] + R - 0.2, "$R$", fontsize=15, color=C["b"])
    # temporal arrow across the panels
    con = ConnectionPatch(xyA=tuple(p), xyB=tuple(p - shift + [0.6, 0]), coordsA=axs[1].transData,
                          coordsB=axs[0].transData, arrowstyle="-|>", mutation_scale=18,
                          color=C["z"], lw=2.2, connectionstyle="arc3,rad=-0.25")
    fig.add_artist(con)
    fig.text(0.5, 0.06, r"$\mathbf{p}_{prev}=\mathbf{p}-\mathbf{m}(\mathbf{p}),\quad M_{t-1}\leq 20\,M$",
             ha="center", fontsize=15, color=C["z"])
    fig.subplots_adjust(wspace=0.05, bottom=0.12)
    save(fig, out("restir-reuse"))


# ---------------------------------------------------------------------------------------------
# 9. TAA: Halton(2,3) jitter and pixel-coverage error vs frames
# ---------------------------------------------------------------------------------------------
def halton(i, b):
    f, r = 1.0, 0.0
    while i > 0:
        f /= b; r += f * (i % b); i //= b
    return r


def fig_halton():
    pts = np.array([[halton(i, 2), halton(i, 3)] for i in range(1, 65)])
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 5.1), gridspec_kw=dict(width_ratios=[1, 1.35]))
    a1.add_patch(Rectangle((0, 0), 1, 1, fill=False, ec="k", lw=2))
    for g in (0.25, 0.5, 0.75):
        a1.axvline(g, color="#dddddd", lw=1); a1.axhline(g, color="#dddddd", lw=1)
    a1.plot(pts[8:16, 0], pts[8:16, 1], "o", color=C["c"], ms=9, mec="k")
    a1.plot(pts[:8, 0], pts[:8, 1], "o", color=C["a"], ms=11, mec="k")
    for i in range(16):
        a1.text(pts[i, 0] + 0.025, pts[i, 1] + 0.02, str(i + 1), fontsize=12)
    a1.set_xlim(-0.03, 1.08); a1.set_ylim(-0.03, 1.08); a1.set_aspect("equal"); a1.grid(False)
    a1.set_xticks([0, 0.5, 1]); a1.set_yticks([0, 0.5, 1])
    a1.set_title("Halton(2,3): 1–8, 9–16", fontsize=14)

    # coverage of a random edge (half-plane) inside the pixel, estimated from the first N jitters
    rng = np.random.default_rng(5)
    E = 3000
    th = rng.uniform(0, 2 * np.pi, E); c0 = rng.uniform(0.2, 0.8, (E, 2))
    nrm = np.c_[np.cos(th), np.sin(th)]
    g = (np.arange(256) + 0.5) / 256
    gx, gy = np.meshgrid(g, g)
    G = np.c_[gx.ravel(), gy.ravel()]
    true = np.array([np.mean((G - c0[e]) @ nrm[e] > 0) for e in range(E)])
    Ns = np.arange(1, 65)

    def err(P):
        inside = ((P[None, :, :] - c0[:, None, :]) * nrm[:, None, :]).sum(-1) > 0   # (E, N)
        est = np.cumsum(inside, 1) / Ns
        return np.sqrt(np.mean((est - true[:, None]) ** 2, 0))

    e_h = err(pts)
    e_r = np.mean([err(rng.random((64, 2))) for _ in range(8)], 0)
    a2.loglog(Ns, e_r, color=C["gray"], label=T("uniform random jitter", "均匀随机抖动", "一様ランダムなジッター"))
    a2.loglog(Ns, e_h, color=C["a"], label="Halton(2,3)")
    a2.loglog(Ns, 0.5 / np.sqrt(Ns), color=C["gray"], ls=":", lw=1.4, label=r"$\propto N^{-1/2}$")
    a2.loglog(Ns, 0.5 / Ns, color=C["a"], ls=":", lw=1.4, label=r"$\propto N^{-1}$")
    a2.set_xlabel(T("frames N", "帧数 N", "フレーム数 N")); a2.set_ylabel(T("RMS coverage error", "覆盖率 RMS 误差", "被覆率の RMS 誤差"))
    a2.set_xticks([1, 2, 4, 8, 16, 32, 64]); a2.set_xticklabels(["1", "2", "4", "8", "16", "32", "64"]); a2.minorticks_off()
    a2.legend(fontsize=12); a2.set_title(T("edge coverage of one pixel", "一个像素内的边缘覆盖率", "1 ピクセル内のエッジ被覆率"), fontsize=14)
    fig.tight_layout()
    save(fig, outl("halton"))


# ---------------------------------------------------------------------------------------------
# 10. ReSTIR GI reconnection geometry and its Jacobian
# ---------------------------------------------------------------------------------------------
def fig_restir_gi():
    xq, xr = np.array([-1.6, 0.0]), np.array([0.9, 0.0])
    xs = np.array([2.3, 2.8])
    ns = np.array([0.0, -1.0])                         # x_s lies on the ceiling
    dq, dr = xq - xs, xr - xs
    cq = abs(ns @ dq) / np.linalg.norm(dq); cr = abs(ns @ dr) / np.linalg.norm(dr)
    J = cr / cq * (dq @ dq) / (dr @ dr)
    fig, ax = plt.subplots(figsize=(9, 5.4))
    ax.plot([-3, 3.2], [0, 0], color=C["dark"], lw=3)
    wall_t = np.array([-ns[1], ns[0]])
    wall = np.array([xs - 1.5 * wall_t, xs + 1.0 * wall_t])
    ax.plot(wall[:, 0], wall[:, 1], color=C["dark"], lw=3)
    arrow(ax, tuple(xs), tuple(xs + 0.9 * ns), C["dark"], lw=2.2)
    ax.text(*(xs + 0.9 * ns + [0.1, -0.1]), r"$\mathbf{n}_s$", fontsize=16)
    for p, col, nm in [(xq, C["z"], "q"), (xr, C["b"], "r")]:
        ax.plot([p[0], xs[0]], [p[1], xs[1]], color=col, lw=2.5, ls="-" if nm == "q" else "--")
        ax.plot(*p, "o", color=col, ms=11, mec="k")
        ax.text(p[0] - 0.15, p[1] - 0.38, rf"$\mathbf{{x}}_{nm}$", fontsize=17, color=col)
        # angle arc at x_s between n_s and direction to p
        a0 = np.degrees(np.arctan2(ns[1], ns[0])); a1_ = np.degrees(np.arctan2(*(p - xs)[::-1]))
        rr = 1.25 if nm == "q" else 0.75
        t = np.radians(np.linspace(min(a0, a1_), max(a0, a1_), 30))
        ax.plot(xs[0] + rr * np.cos(t), xs[1] + rr * np.sin(t), color=col, lw=1.8)
        tm = t[len(t) // 5] if nm == "q" else t[len(t) // 2]   # keep phi_q clear of the orange ray
        ax.text(xs[0] + (rr + 0.3) * np.cos(tm), xs[1] + (rr + 0.3) * np.sin(tm),
                rf"$\phi_{nm}$", fontsize=16, color=col, ha="center", va="center")
        # camera ray to the visible point
        cam = np.array([p[0] - 0.9, 2.3])
        ax.plot([cam[0], p[0]], [cam[1], p[1]], color=C["gray"], lw=1.2, ls=":")
        ax.plot(*cam, "s", color=C["gray"], ms=9)
    ax.plot(*xs, "o", color=C["a"], ms=12, mec="k")
    ax.text(xs[0] + 0.15, xs[1] + 0.12, r"$\mathbf{x}_s$", fontsize=17, color=C["a"])
    ax.text(-2.9, 3.45, rf"$|J_{{q\to r}}| = \frac{{|\cos\phi_r|}}{{|\cos\phi_q|}}\,\frac{{\|x_q-x_s\|^2}}{{\|x_r-x_s\|^2}}"
            rf" = \frac{{{cr:.2f}}}{{{cq:.2f}}}\cdot\frac{{{dq @ dq:.2f}}}{{{dr @ dr:.2f}}} = {J:.2f}$", fontsize=15)
    ax.set_xlim(-3.1, 3.6); ax.set_ylim(-0.7, 4.0); ax.set_aspect("equal"); clean_ax(ax)
    save(fig, out("restir-gi"))
    return J


# ---------------------------------------------------------------------------------------------
# 11. Neural radiance cache: short rendering paths, extended training paths (localized)
# ---------------------------------------------------------------------------------------------
def fig_nrc():
    cam = np.array([-1.2, 2.6])
    xs = np.array([[3.0, 0.0], [10.0, 2.4], [7.5, 5.4], [0.0, 3.2], [6.0, 0.0]])   # x0..x4
    for lang in [_LANG[0]]:
        fig, ax = plt.subplots(figsize=(10, 6.2))
        ax.add_patch(Rectangle((0, 0), 10, 5.4, fill=False, ec=C["dark"], lw=2.5))
        ax.plot([4.2, 5.8], [5.4, 5.4], color=C["light"], lw=8)
        ax.add_patch(Polygon([cam + [-0.5, -0.35], cam + [-0.5, 0.35], cam + [0.15, 0]], fc=C["gray"]))
        rp = np.vstack([cam, xs[:3]])
        ax.plot(rp[:, 0], rp[:, 1], color=C["z"], lw=3, marker="o", ms=8,
                label=label(lang, "rendering: short prefix", "渲染：短前缀", "描画：短いプレフィックス"))
        tp = xs[2:]
        ax.plot(tp[:, 0], tp[:, 1], color=C["b"], lw=2.4, ls="--", marker="o", ms=8,
                label=label(lang, "training: extended suffix", "训练：延长的后缀", "学習：延長したサフィックス"))
        offs = [(-0.45, -0.45), (0.5, 0.0), (0.0, 0.3), (-0.55, 0.0), (-0.45, -0.45)]
        for k, (p, o) in enumerate(zip(xs, offs)):
            ax.text(p[0] + o[0], p[1] + o[1], rf"$\mathbf{{x}}_{k}$", fontsize=16, ha="center", va="center")
        for p, col, off in [(xs[2], C["z"], (0.0, -0.75)), (xs[4], C["b"], (0.75, -0.75))]:
            q = p + np.array(off)
            ax.add_patch(Circle(q, 0.38, fc="white", ec=col, lw=2.5))
            ax.text(*q, r"$\hat L_\theta$", ha="center", va="center", fontsize=14, color=col)
            arrow(ax, tuple(p), tuple(q + (0.38 * (p - q) / np.linalg.norm(p - q))), col, lw=1.5, ms=10)
        # NEE shadow rays on the training suffix
        for p in xs[3:5]:
            ax.plot([p[0], 5.0], [p[1], 5.4], color=C["light"], lw=1.6, ls=":")
        ax.text(7.5, 3.75, r"$L \approx \beta\,\hat L_\theta(\mathbf{x}_2,\omega)$", fontsize=15, color=C["z"], ha="center")
        ax.text(2.6, -1.75, label(lang, "target for", "训练目标：", "学習目標："), fontsize=14, color=C["b"], ha="right")
        ax.text(2.7, -1.75, r"$\hat L_\theta(\mathbf{x}_2,\omega)$ = NEE + $\hat L_\theta(\mathbf{x}_4)$", fontsize=14, color=C["b"], ha="left")
        ax.set_xlim(-2.0, 10.8); ax.set_ylim(-2.2, 6.4); ax.set_aspect("equal"); clean_ax(ax)
        ax.legend(loc="upper left", fontsize=13, ncol=2, bbox_to_anchor=(0.0, 1.06), frameon=False)
        save(fig, OUT / f"06-nrc_{lang}.svg")


if __name__ == "__main__":
    print("disoccluded pixels:", fig_reprojection())
    fig_atrous_taps()
    fig_restir_reuse()
    print("ReSTIR GI |J| =", round(fig_restir_gi(), 3))
    for lang in LANGS:                      # figures with words: one SVG per language
        _LANG[0] = lang
        fig_tlas_blas()
        fig_ema()
        fig_atrous_demo()
        fig_ris()
        rel, lim = fig_ris_variance()
        fig_halton()
        fig_nrc()
    print("M->inf rel std:", round(lim, 3))
