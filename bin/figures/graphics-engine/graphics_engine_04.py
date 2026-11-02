"""Figures for graphics-engine post 04 (inside production engines).

All figures are computed: the 1D Nanite-style hierarchy and LOD cut use the post's own code
(copied below), cracks compare independently simplified levels with the locked-boundary
hierarchy, triangle sizes come from projecting a tessellated sphere, surface-cache cards and the
virtual-shadow-map pages come from ray casting with the models described in the post.

    python3 bin/figures/graphics-engine/graphics_engine_04.py
"""
import pathlib
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib.collections import PatchCollection  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics-engine"


def out(name):
    return OUT / f"04-{name}.svg"


# ---------------------------------------------------------------------------
# The post's 1D hierarchy (verbatim)
# ---------------------------------------------------------------------------
xs = np.linspace(0.0, 16.0, 129)
h = (1.2 * np.sin(0.45 * xs) + 0.5 * np.sin(1.7 * xs + 1)
     + 0.18 * np.sin(4.3 * xs + 2) + 0.07 * np.sin(9.1 * xs + 0.5))


def max_dev(a, b):
    t = (xs[a:b + 1] - xs[a]) / (xs[b] - xs[a])
    return float(np.max(np.abs(h[a:b + 1] - (h[a] + t * (h[b] - h[a])))))


def simplify(verts, target_segments):
    verts = list(verts)
    while len(verts) - 1 > target_segments:
        costs = [max_dev(verts[i - 1], verts[i + 1]) for i in range(1, len(verts) - 1)]
        del verts[1 + int(np.argmin(costs))]
    err = max(max_dev(verts[i], verts[i + 1]) for i in range(len(verts) - 1))
    return verts, err


levels = [[dict(verts=list(range(8 * c, 8 * c + 9)), err=0.0, children=[]) for c in range(16)]]
while len(levels[-1]) > 1:
    prev, nxt = levels[-1], []
    for g in range(0, len(prev), 2):
        a, b = prev[g], prev[g + 1]
        verts, err = simplify(a["verts"] + b["verts"][1:], 8)
        nxt.append(dict(verts=verts, err=max(err, a["err"], b["err"]), children=[a, b]))
    levels.append(nxt)
LEVEL_OF = {id(c): i for i, lv in enumerate(levels) for c in lv}
ROOT = levels[-1][0]

K = 1080 / (2 * np.tan(np.radians(30)))


def select_cut(node, cam, tau=1.0):
    v = node["verts"]
    lo, hi = v[0], v[-1]
    hmin, hmax = h[lo:hi + 1].min(), h[lo:hi + 1].max()
    cx, cy = (xs[lo] + xs[hi]) / 2, (hmin + hmax) / 2
    r = 0.5 * np.hypot(xs[hi] - xs[lo], hmax - hmin)
    d = max(np.hypot(cx - cam[0], cy - cam[1]) - r, 1e-3)
    if node["err"] * K / d <= tau or not node["children"]:
        return [node]
    return [c for child in node["children"] for c in select_cut(child, cam, tau)]


def lvl_color(L):
    return plt.cm.viridis(0.05 + 0.8 * L / (len(levels) - 1))


# ---------------------------------------------------------------------------
# 1. Hierarchy
# ---------------------------------------------------------------------------
def fig_hierarchy():
    fig, ax = plt.subplots(figsize=(12, 8))
    gap = 3.4
    for L, lv in enumerate(levels):
        off = L * gap
        ax.plot(xs, h + off, "--", color=C["gray"], lw=1.0, alpha=0.6)
        for i, c in enumerate(lv):
            v = c["verts"]
            ax.plot(xs[v], h[v] + off, "-", color=C["a"] if i % 2 == 0 else C["b"], lw=2.2)
            ax.plot(xs[v], h[v] + off, "o", color=C["a"] if i % 2 == 0 else C["b"], ms=2.8)
            ax.plot([xs[v[0]]] * 2, [h[v[0]] + off - 0.35, h[v[0]] + off + 0.35], color=C["dark"], lw=1.6)
        ax.plot([xs[-1]] * 2, [h[-1] + off - 0.35, h[-1] + off + 0.35], color=C["dark"], lw=1.6)
        emax = max(c["err"] for c in lv)
        ax.text(16.4, off, f"L{L}: {len(lv)} × 8 seg\nε = {emax:.3f} m", fontsize=12, va="center")
    ax.set_xlim(-0.3, 19.5)
    ax.set_yticks([])
    ax.set_xlabel("x (m)")
    ax.grid(False)
    ax.spines["left"].set_visible(False)
    save(fig, out("cluster-hierarchy"))


# ---------------------------------------------------------------------------
# 2. LOD cut at two distances
# ---------------------------------------------------------------------------
def draw_cut(ax_top, ax_tree, D):
    cut = select_cut(ROOT, cam=(-D, 2.0))
    sel = {id(c) for c in cut}
    for c in cut:
        v = c["verts"]
        ax_top.plot(xs[v], h[v], "-o", color=lvl_color(LEVEL_OF[id(c)]), lw=2.6, ms=3)
    ax_top.plot(xs, h, "--", color=C["gray"], lw=0.8, alpha=0.6)
    nseg = sum(len(c["verts"]) - 1 for c in cut)
    ax_top.set_title(f"D = {D:g} m:  {len(cut)} clusters, {nseg} seg", fontsize=14)
    ax_top.annotate("", xy=(0.0, 2.6), xytext=(-1.6, 2.6), arrowprops=dict(arrowstyle="-|>", color=C["dark"], lw=2))
    ax_top.text(-1.6, 2.85, "cam", fontsize=12)
    ax_top.set_xlim(-1.8, 16.2); ax_top.set_ylim(-2.6, 3.2)
    ax_top.set_xticks([0, 4, 8, 12, 16])

    def cx(c):
        return (xs[c["verts"][0]] + xs[c["verts"][-1]]) / 2

    def visit(c, below):
        L = LEVEL_OF[id(c)]
        on = id(c) in sel
        for ch in c["children"]:
            ax_tree.plot([cx(c), cx(ch)], [L, L - 1], color=C["gray"], lw=1.0, alpha=0.4 if below else 0.9)
            visit(ch, below or on)
        ax_tree.plot(cx(c), L, "s", ms=11 if on else 7,
                     color=lvl_color(L) if on else ("#dddddd" if below else "white"),
                     mec=C["dark"] if on else C["gray"], mew=1.6 if on else 1.0)

    visit(ROOT, False)
    ax_tree.set_ylim(-0.6, len(levels) - 0.4); ax_tree.set_xlim(-1.8, 16.2)
    ax_tree.set_yticks(range(len(levels))); ax_tree.set_yticklabels([f"L{i}" for i in range(len(levels))])
    ax_tree.set_xticks([]); ax_tree.grid(False)


def fig_lod_cut():
    fig, axs = plt.subplots(2, 2, figsize=(14, 8), gridspec_kw=dict(height_ratios=[1.1, 1]))
    for j, D in enumerate((5.0, 60.0)):
        draw_cut(axs[0, j], axs[1, j], D)
    save(fig, out("lod-cut"))


# ---------------------------------------------------------------------------
# 3. Error versus distance
# ---------------------------------------------------------------------------
def fig_error_distance():
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 5.6))
    d = np.logspace(0, 3.5, 200)
    for L in range(1, len(levels)):
        e = max(c["err"] for c in levels[L])
        a1.plot(d, e * K / d, color=lvl_color(L), lw=2.4, label=f"L{L}: ε = {e:.3f} m")
    a1.axhline(1.0, ls="--", color=C["dark"], lw=1.4)
    a1.text(1.2, 1.15, "τ = 1 px", fontsize=13)
    a1.set_xscale("log"); a1.set_yscale("log")
    a1.set_xlabel("d (m)"); a1.set_ylabel(r"$\varepsilon K / d$ (px)")
    a1.legend(fontsize=11)
    Ds = np.logspace(0, 3.3, 80)
    segs = [sum(len(c["verts"]) - 1 for c in select_cut(ROOT, cam=(-D, 2.0))) for D in Ds]
    a2.step(Ds, segs, where="post", color=C["a"], lw=2.4)
    a2.set_xscale("log")
    a2.set_xlabel("D (m)"); a2.set_ylabel("segments in cut")
    a2.set_ylim(0, 136)
    save(fig, out("error-distance"))


# ---------------------------------------------------------------------------
# 4. Cracks: independent levels versus locked boundaries
# ---------------------------------------------------------------------------
def fig_cracks():
    glob = [list(range(129))]
    for L in range(1, len(levels)):
        glob.append(simplify(glob[-1], 128 >> L)[0])

    def g_at(L, x):
        v = glob[L]
        return np.interp(x, xs[v], h[v])

    bounds = np.arange(1, 16).astype(float)
    mism = [abs(g_at(1, b) - g_at(3, b)) for b in bounds]
    xb = bounds[int(np.argmax(mism))]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 5.4), sharey=True)
    for ax in (a1, a2):
        ax.plot(xs, h, "--", color=C["gray"], lw=1.0, alpha=0.7)
        ax.axvline(xb, color=C["gray"], lw=1, ls=":")
        ax.set_xlim(xb - 1.6, xb + 1.6)
        ax.set_xlabel("x (m)")
    xl = np.linspace(xb - 1, xb, 50)
    xr = np.linspace(xb, xb + 1, 50)
    a1.plot(xl, g_at(1, xl), color=lvl_color(1), lw=3, label="L1")
    a1.plot(xr, g_at(3, xr), color=lvl_color(3), lw=3, label="L3")
    y1, y3 = g_at(1, xb), g_at(3, xb)
    a1.plot([xb, xb], [y1, y3], color=C["x"], lw=5, solid_capstyle="butt")
    a1.set_title(f"Δh = {abs(y1 - y3) * 100:.1f} cm", color=C["x"], fontsize=14)
    a1.legend(fontsize=12)
    # hierarchy: the level-1 cluster ending at xb and the level-3 cluster starting at xb, if they exist,
    # otherwise the finest clusters touching xb from each side
    def cluster_touching(L, side):
        for c in levels[L]:
            v = c["verts"]
            if (side == "left" and abs(xs[v[-1]] - xb) < 1e-9) or (side == "right" and abs(xs[v[0]] - xb) < 1e-9):
                return c
        return None

    left, right = None, None
    for L in (1, 0):
        left = left or cluster_touching(L, "left")
    for L in (3, 2, 1, 0):
        right = right or cluster_touching(L, "right")
    for c in (left, right):
        v = c["verts"]
        a2.plot(xs[v], h[v], "-o", color=lvl_color(LEVEL_OF[id(c)]), lw=3, ms=4, label=f"L{LEVEL_OF[id(c)]}")
    a2.plot(xb, h[int(round(xb * 8))], "o", ms=12, mfc="none", mec=C["y"], mew=2.5)
    a2.set_title("Δh = 0", color=C["y"], fontsize=14)
    a2.legend(fontsize=12)
    save(fig, out("cracks"))
    return xb, abs(y1 - y3)


# ---------------------------------------------------------------------------
# 5. Triangle sizes on screen
# ---------------------------------------------------------------------------
def fig_triangle_sizes():
    nu, nv = 512, 256
    u = np.linspace(0, 2 * np.pi, nu + 1)
    v = np.linspace(0, np.pi, nv + 1)
    U, V = np.meshgrid(u, v)                          # (nv+1, nu+1)
    P = np.stack([np.sin(V) * np.cos(U), np.cos(V), np.sin(V) * np.sin(U)], -1).reshape(-1, 3)
    idx = np.arange((nv + 1) * (nu + 1)).reshape(nv + 1, nu + 1)
    a, b, c, d = idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, :-1].ravel(), idx[1:, 1:].ravel()
    tris = np.concatenate([np.stack([a, c, b], 1), np.stack([b, c, d], 1)])
    ntri = len(tris)
    fig, ax = plt.subplots(figsize=(11, 5.8))
    bins = np.logspace(-3, 3, 70)
    for dist, col in ((3.0, C["a"]), (10.0, C["b"]), (30.0, C["y"])):
        cam = np.array([0.0, 0.0, dist])
        cen = P[tris].mean(1)
        front = np.einsum("ij,ij->i", cen, cam - cen) > 0   # outward normal of a unit sphere = position
        T = P[tris[front]]                                    # (n, 3, 3)
        depth = dist - T[..., 2]
        S = K * T[..., :2] / depth[..., None]                 # screen coordinates in pixels
        e = np.stack([np.linalg.norm(S[:, 0] - S[:, 1], axis=1), np.linalg.norm(S[:, 1] - S[:, 2], axis=1),
                      np.linalg.norm(S[:, 2] - S[:, 0], axis=1)], 1).max(1)
        frac = np.mean(e < 32)
        ax.hist(e, bins=bins, histtype="step", lw=2.4, color=col, label=f"d = {dist:g} m: {100 * frac:.1f} % < 32 px")
    ax.axvline(32, ls="--", color=C["dark"], lw=1.4)
    ax.text(36, ax.get_ylim()[1] * 0.9, "32 px", fontsize=13)
    ax.set_xscale("log")
    ax.set_xlabel("longest edge on screen (px)"); ax.set_ylabel("triangles")
    ax.set_title(f"{ntri:,} triangles", fontsize=14)
    ax.legend(fontsize=12, loc="upper left")
    save(fig, out("triangle-sizes"))


# ---------------------------------------------------------------------------
# 6. Lumen pipeline diagram (Lumen's own feature names)
# ---------------------------------------------------------------------------
def fig_lumen_pipeline():
    fig, ax = plt.subplots(figsize=(14, 7.2))

    def box(x, y, text, fc, w=2.9, hh=0.95, ls="-"):
        ax.add_patch(FancyBboxPatch((x - w / 2, y - hh / 2), w, hh, boxstyle="round,pad=0.02,rounding_size=0.1",
                                    fc=fc, ec=C["dark"], lw=1.5, linestyle=ls))
        ax.text(x, y, text, ha="center", va="center", fontsize=12)

    def arr(p0, p1, ls="-", col="#555555"):
        ax.annotate("", xy=p1, xytext=p0, arrowprops=dict(arrowstyle="-|>", color=col, lw=1.5, linestyle=ls,
                                                          shrinkA=0, shrinkB=0, mutation_scale=14))

    S, T, G = "#dbe9f6", "#fde0c5", "#d9f0d3"
    A, B, Cx = 0.0, 4.6, 9.2
    box(A, 6, "screen\n(depth, color)", S)
    box(A, 4.6, "Mesh SDFs", S)
    box(A, 3.2, "Global SDF", S)
    box(A, 1.8, "HW RT (BVH)", S, ls="--")
    box(A, 0.2, "Surface Cache\ncards: albedo, normal,\ndepth, lighting", S, hh=1.4)
    box(B, 6, "screen trace", T)
    box(B, 4.6, "mesh SDF trace\n(near, ~2 m)", T)
    box(B, 3.2, "global SDF trace\n(far)", T)
    box(B, 1.6, "hit: sample\nSurface Cache", T)
    box(B, 0.2, "miss: radiance\ncache / sky", T)
    box(Cx, 6, "screen probes", G)
    box(Cx, 3.9, "final gather\n(integrate + filter)", G)
    box(Cx, 1.6, "indirect diffuse\n+ reflections", G)
    for y in (6, 4.6, 3.2):
        arr((A + 1.45, y), (B - 1.45, y))
    arr((A + 1.45, 1.8), (B - 1.45, 1.8), ls="--")
    arr((A + 1.45, 0.2), (B - 1.45, 1.4))
    for y0, y1 in ((6, 4.6), (4.6, 3.2)):
        arr((B, y0 - 0.48), (B, y1 + 0.48), col=C["b"])
        ax.text(B + 0.12, (y0 + y1) / 2, "miss", fontsize=11, color=C["b"])
    arr((B, 3.2 - 0.48), (B, 1.6 + 0.48), col=C["b"])
    arr((B - 0.9, 3.2 - 0.48), (B - 0.9, 0.2 + 0.48), col=C["gray"])
    arr((Cx - 1.45, 6), (B + 1.45, 6))
    ax.text((Cx + B) / 2, 6.2, "rays", fontsize=11, ha="center")
    arr((B + 1.45, 1.6), (Cx - 1.45, 3.7))
    arr((B + 1.45, 0.2), (Cx - 1.45, 3.6))
    arr((Cx, 3.9 - 0.48), (Cx, 1.6 + 0.48))
    ax.set_xlim(-1.7, 10.9); ax.set_ylim(-0.7, 6.8)
    ax.axis("off")
    save(fig, out("lumen-pipeline"))


# ---------------------------------------------------------------------------
# 7. Surface-cache cards
# ---------------------------------------------------------------------------
BOX_LO, BOX_HI = np.array([-1.0, 0.0, -0.6]), np.array([1.0, 0.8, 0.6])
SC, SR = np.array([0.3, 1.2, 0.0]), 0.45
BB_LO = np.minimum(BOX_LO, SC - SR)
BB_HI = np.maximum(BOX_HI, SC + SR)


def cast_obj(o, d):
    with np.errstate(divide="ignore", invalid="ignore"):
        t1 = (BOX_LO - o) / d
        t2 = (BOX_HI - o) / d
        tmin = np.max(np.minimum(t1, t2), axis=1)
        tmax = np.min(np.maximum(t1, t2), axis=1)
    hit = (tmax >= tmin) & (tmin > 0)
    t = np.where(hit, tmin, np.inf)
    oc = o - SC
    b = oc @ d
    cc = np.einsum("ij,ij->i", oc, oc) - SR ** 2
    disc = b * b - cc
    ts = -b - np.sqrt(np.maximum(disc, 0))
    return np.where((disc >= 0) & (ts > 0), np.minimum(t, ts), t)


def W3(p):
    p = np.asarray(p, float)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)


def fig_cards():
    fig = plt.figure(figsize=(15, 7))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    lo, hi = BOX_LO, BOX_HI
    cs = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
    for i in range(8):
        for j in range(i + 1, 8):
            if np.sum(cs[i] != cs[j]) == 1:
                q = W3(np.array([cs[i], cs[j]]))
                ax.plot(q[:, 0], q[:, 1], q[:, 2], color=C["dark"], lw=1.6)
    uu, vv = np.meshgrid(np.linspace(0, 2 * np.pi, 22), np.linspace(0, np.pi, 12))
    sp = W3(SC + SR * np.stack([np.sin(vv) * np.cos(uu), np.cos(vv), np.sin(vv) * np.sin(uu)], -1))
    ax.plot_wireframe(sp[..., 0], sp[..., 1], sp[..., 2], color=C["z"], lw=0.6)
    N = 48
    cards = []
    for axis in range(3):
        for sgn in (1, -1):
            o_ax = [a for a in range(3) if a != axis]
            g0 = BB_LO[o_ax[0]] + (np.arange(N) + 0.5) / N * (BB_HI[o_ax[0]] - BB_LO[o_ax[0]])  # cell centers
            g1 = BB_LO[o_ax[1]] + (np.arange(N) + 0.5) / N * (BB_HI[o_ax[1]] - BB_LO[o_ax[1]])
            G0, G1 = np.meshgrid(g0, g1)
            o = np.zeros((N * N, 3))
            plane = BB_HI[axis] + 0.05 if sgn > 0 else BB_LO[axis] - 0.05
            o[:, axis] = plane
            o[:, o_ax[0]] = G0.ravel(); o[:, o_ax[1]] = G1.ravel()
            d = np.zeros(3); d[axis] = -sgn
            t = cast_obj(o, d).reshape(N, N)
            cards.append((axis, sgn, o_ax, np.where(np.isfinite(t), t, np.nan)))
            # card outline in 3D, pushed outwards so it is visible
            pl = plane + 0.25 * sgn
            corners = []
            for a0, a1 in ((0, 0), (1, 0), (1, 1), (0, 1), (0, 0)):
                p = np.zeros(3); p[axis] = pl
                p[o_ax[0]] = (BB_LO, BB_HI)[a0][o_ax[0]]
                p[o_ax[1]] = (BB_LO, BB_HI)[a1][o_ax[1]]
                corners.append(p)
            q = W3(np.array(corners))
            ax.plot(q[:, 0], q[:, 1], q[:, 2], color=C["a"], lw=1.8)
    ax.set_box_aspect((1, 1, 1))
    ax.set_xlim(-1.6, 1.6); ax.set_ylim(-1.6, 1.6); ax.set_zlim(-0.6, 2.6)
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
    ax.view_init(elev=24, azim=-55)
    names = {0: "x", 1: "y", 2: "z"}
    cmap = plt.cm.gray.copy(); cmap.set_bad("white")
    for k, (axis, sgn, o_ax, t) in enumerate(cards):
        a2 = fig.add_subplot(2, 6, [4, 5, 6, 10, 11, 12][k])      # right half: 2 rows x 3 cards
        a2.imshow(t, origin="lower", cmap=cmap, vmin=0, vmax=np.nanmax(t),
                  extent=[BB_LO[o_ax[0]], BB_HI[o_ax[0]], BB_LO[o_ax[1]], BB_HI[o_ax[1]]])
        a2.set_title(("+" if sgn > 0 else "−") + names[axis], fontsize=14, color=C["a"])
        a2.set_xticks([]); a2.set_yticks([]); a2.grid(False)
        a2.set_xlabel(names[o_ax[0]], fontsize=11); a2.set_ylabel(names[o_ax[1]], fontsize=11)
    save(fig, out("surface-cache-cards"))


# ---------------------------------------------------------------------------
# 8. Virtual shadow map pages (model of Section 1.3)
# ---------------------------------------------------------------------------
def fig_vsm():
    Hpx, Wpx, fov = 1080, 1920, np.radians(60)
    tf = np.tan(fov / 2)
    cam_h = 1.7
    px = (np.arange(0, Wpx, 4) + 0.5) / Wpx * 2 - 1
    py = 1 - (np.arange(0, Hpx, 4) + 0.5) / Hpx * 2
    PX, PY = np.meshgrid(px, py)
    dirs = np.stack([PX * tf * Wpx / Hpx, PY * tf, np.ones_like(PX)], -1).reshape(-1, 3)
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    down = dirs[:, 1] < 0
    t = cam_h / -dirs[down, 1]
    keep = t < 150
    t = t[keep]
    hit = dirs[down][keep] * t[:, None]
    phi_cm = t * 2 * tf / Hpx * 100
    k = np.clip(np.floor(np.log2(16384 * phi_cm)) - 1, 6, 22).astype(int)
    s_cm = 2.0 ** (k + 1) / 16384
    page_m = 128 * s_cm / 100
    pi = np.floor(hit[:, 0] / page_m).astype(int)
    pj = np.floor(hit[:, 2] / page_m).astype(int)
    pages = sorted(set(zip(k.tolist(), pi.tolist(), pj.tolist())))
    lv = sorted(set(k.tolist()))
    cmap = plt.cm.viridis
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 6.4), gridspec_kw=dict(width_ratios=[1.3, 1]))
    patches, cols = [], []
    for (kk, i, j) in sorted(pages, key=lambda p: -p[0]):      # coarse first, fine pages on top
        ps = 128 * 2.0 ** (kk + 1) / 16384 / 100
        patches.append(Rectangle((i * ps, j * ps), ps, ps))
        cols.append(cmap((kk - lv[0]) / max(1, lv[-1] - lv[0]) * 0.9))
    pc = PatchCollection(patches, facecolor=cols, edgecolor="white", linewidth=0.3)
    a1.add_collection(pc)
    zz = np.array([0, 150])
    half = tf * Wpx / Hpx
    a1.plot(zz * 0, zz * 0, "o", color=C["x"], ms=8)
    a1.plot(-half * zz, zz, color=C["x"], lw=1.4); a1.plot(half * zz, zz, color=C["x"], lw=1.4)
    a1.set_xlim(-60, 60); a1.set_ylim(-2, 80)
    a1.set_aspect("equal")
    a1.set_xlabel("x (m)"); a1.set_ylabel("z (m)")
    a1.grid(False)
    counts = [sum(1 for p in pages if p[0] == kk) for kk in lv]
    a2.bar([str(kk) for kk in lv], counts, color=[cmap((kk - lv[0]) / max(1, lv[-1] - lv[0]) * 0.9) for kk in lv])
    a2.axhline(16384, ls="--", color=C["dark"], lw=1.4)
    a2.text(0, 16384 * 1.15, "16k × 16k = 16,384 pages", fontsize=12)
    a2.set_yscale("log"); a2.set_ylim(1, 1e5)
    a2.set_xlabel("clipmap level k"); a2.set_ylabel("pages")
    save(fig, out("vsm-pages"))
    return dict(zip(lv, counts))


if __name__ == "__main__":
    for i, lv in enumerate(levels):
        print(f"level {i}: {len(lv):2d} clusters, max error {max(c['err'] for c in lv):.4f} m")
    fig_hierarchy()
    fig_lod_cut()
    fig_error_distance()
    print("crack at x, size:", fig_cracks())
    fig_triangle_sizes()
    fig_lumen_pipeline()
    fig_cards()
    print("VSM pages per level:", fig_vsm())
