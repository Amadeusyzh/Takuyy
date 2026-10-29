"""Figures for graphics post 02 (rasterization).

Conventions match the post: right-handed view space, camera at the origin looking down -z,
y up; OpenGL NDC cube [-1, 1]^3; pixel row 0 at the top (y down in screen space).
Run:  python3 bin/figures/graphics/graphics_02.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib.patches import Polygon, Rectangle, FancyArrowPatch  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection, Line3DCollection  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics"


# ---------------------------------------------------------------- the post's own math
def look_at(eye, target, up):
    f = target - eye; f = f / np.linalg.norm(f)
    s = np.cross(f, up); s = s / np.linalg.norm(s)
    u = np.cross(s, f)
    V = np.eye(4)
    V[0, :3], V[1, :3], V[2, :3] = s, u, -f
    V[:3, 3] = -V[:3, :3] @ eye
    return V


def perspective(fovy_deg, aspect, n, f):
    t = 1.0 / np.tan(np.radians(fovy_deg) / 2)
    return np.array([[t / aspect, 0, 0, 0], [0, t, 0, 0],
                     [0, 0, (f + n) / (n - f), 2 * f * n / (n - f)], [0, 0, -1, 0]])


def edge_up(a, b, px, py):
    """E_ab(p) of the post, in a y-up frame: > 0 when p is left of a->b."""
    return (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])


def edge_down(a, b, px, py):
    """The post's code version for y-down pixel coordinates."""
    return (px - a[0]) * (b[1] - a[1]) - (py - a[1]) * (b[0] - a[0])


def clean2d(ax):
    ax.set_aspect("equal")
    ax.grid(False)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_xticks([]); ax.set_yticks([])


def pixel_grid(ax, W, H, color="#cccccc", lw=0.8):
    for i in range(W + 1):
        ax.plot([i, i], [0, H], color=color, lw=lw, zorder=1)
    for j in range(H + 1):
        ax.plot([0, W], [j, j], color=color, lw=lw, zorder=1)


def tag(ax, s, x=0.0, y=1.02):
    ax.text(x, y, s, transform=ax.transAxes, fontsize=17, fontweight="bold", va="bottom")


VCOL = np.array([[0.90, 0.20, 0.20], [0.20, 0.70, 0.25], [0.20, 0.40, 0.90]])  # a, b, c colours


# ---------------------------------------------------------------- 1. pipeline (localized)
def fig_pipeline():
    # One tilted triangle, really pushed through M, P, the divide, the viewport and rasterization.
    tri_obj = np.array([[-1.3, -0.9, 0.6], [1.5, -0.5, -0.8], [-0.1, 1.2, 0.0]])
    model = np.eye(4); model[:3, 3] = [0, 0, -2.5]
    P = perspective(60, 4 / 3, 0.5, 4.0)
    view = np.c_[tri_obj, np.ones(3)] @ model.T
    clip = view @ P.T
    w = clip[:, 3]
    ndc = clip[:, :3] / w[:, None]
    W, H = 20, 15
    sx = (ndc[:, 0] + 1) / 2 * W; sy = (1 - ndc[:, 1]) / 2 * H; sz = ndc[:, 2] * 0.5 + 0.5
    v = np.stack([sx, sy], 1)
    px, py = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    area = edge_down(v[0], v[1], v[2, 0], v[2, 1])
    lam = np.stack([edge_down(v[1], v[2], px, py), edge_down(v[2], v[0], px, py),
                    edge_down(v[0], v[1], px, py)], -1) / area
    inside = (lam >= 0).all(-1)
    beta = lam / w; beta = beta / beta.sum(-1, keepdims=True)   # perspective-correct weights
    depth = lam @ sz                                             # depth: plain screen-space lambda

    for lang in LANGS:
        fig, axs = plt.subplots(2, 3, figsize=(13.5, 8.6))
        axs = axs.ravel()
        titles = [
            label(lang, "1  vertices (view space)", "1  顶点（观察空间）", "1  頂点（ビュー空間）"),
            label(lang, "2  clip → divide → NDC", "2  裁剪 → 除法 → NDC", "2  クリップ → 除算 → NDC"),
            label(lang, "3  viewport (pixels)", "3  视口（像素）", "3  ビューポート（ピクセル）"),
            label(lang, "4  coverage", "4  覆盖测试", "4  カバレッジ"),
            label(lang, "5  fragment shading", "5  片元着色", "5  フラグメントシェーディング"),
            label(lang, "6  depth (z-buffer)", "6  深度（z-buffer）", "6  深度（Z バッファ）"),
        ]
        # 1: side view (z horizontal, y vertical) with frustum
        ax = axs[0]
        n_, f_ = 0.5, 4.0
        ty = np.tan(np.radians(30))
        ax.fill([0, -f_, -f_, 0], [0, f_ * ty, -f_ * ty, 0], color=C["fill"], alpha=0.7, lw=0)
        ax.plot([0, -f_], [0, f_ * ty], color=C["gray"], lw=1.2)
        ax.plot([0, -f_], [0, -f_ * ty], color=C["gray"], lw=1.2)
        ax.plot([-n_, -n_], [-n_ * ty, n_ * ty], color=C["gray"], lw=2)
        ax.add_patch(Polygon(view[:, [2, 1]], fc=C["a"], alpha=0.35, ec=C["a"], lw=2.5))
        ax.plot(view[:, 2], view[:, 1], "o", color=C["a"], ms=7)
        ax.plot(0, 0, "ks", ms=8)
        ax.annotate("", xy=(-1.0, 0), xytext=(0, 0), arrowprops=dict(arrowstyle="->", lw=2))
        ax.text(-1.0, -0.45, "$-z$", fontsize=15)
        ax.set_xlim(-4.2, 0.3); ax.set_ylim(-2.4, 2.4)
        clean2d(ax)
        # 2: NDC square
        ax = axs[1]
        ax.add_patch(Rectangle((-1, -1), 2, 2, fc="#f6f6f6", ec=C["dark"], lw=1.5))
        ax.add_patch(Polygon(ndc[:, :2], fc=C["a"], alpha=0.35, ec=C["a"], lw=2.5))
        ax.plot([-1.2, 1.25], [0, 0], color=C["x"], lw=1); ax.plot([0, 0], [-1.2, 1.25], color=C["y"], lw=1)
        ax.text(1.0, 1.08, "$+1$", fontsize=14); ax.text(-1.3, -1.28, "$-1$", fontsize=14)
        ax.set_xlim(-1.4, 1.4); ax.set_ylim(-1.4, 1.4)
        clean2d(ax)
        # 3: pixels (y down)
        ax = axs[2]
        pixel_grid(ax, W, H)
        ax.add_patch(Polygon(v, fc="none", ec=C["a"], lw=2.5, zorder=3))
        ax.plot(px, py, ".", color=C["gray"], ms=3)
        # 4: coverage
        ax = axs[3]
        img = np.ones((H, W, 3)); img[inside] = [0.75, 0.68, 0.88]
        ax.imshow(img, extent=(0, W, H, 0), interpolation="nearest", zorder=0)
        pixel_grid(ax, W, H)
        ax.add_patch(Polygon(v, fc="none", ec=C["a"], lw=2.0, zorder=3))
        ax.plot(px[inside], py[inside], "o", color=C["a"], ms=4, zorder=4)
        # 5: shaded with (perspective-correct) barycentric colour
        ax = axs[4]
        img = np.ones((H, W, 3)); img[inside] = beta[inside] @ VCOL
        ax.imshow(img, extent=(0, W, H, 0), interpolation="nearest", zorder=0)
        pixel_grid(ax, W, H)
        # 6: depth buffer
        ax = axs[5]
        dimg = np.ones((H, W, 3)); g = (depth[inside] - sz.min()) / (sz.max() - sz.min())
        dimg[inside] = (0.15 + 0.75 * g)[:, None]
        ax.imshow(dimg, extent=(0, W, H, 0), interpolation="nearest", zorder=0)
        pixel_grid(ax, W, H)
        for k in (2, 3, 4, 5):
            axs[k].set_xlim(-0.3, W + 0.3); axs[k].set_ylim(H + 0.3, -0.3)
            clean2d(axs[k])
        for a_, t_ in zip(axs, titles):
            a_.set_title(t_, fontsize=16, loc="left")
        fig.tight_layout(w_pad=3.5, h_pad=2.5)
        for k in (0, 1, 3, 4):
            b0 = axs[k].get_position(); b1 = axs[k + 1].get_position()
            ym = (b0.y0 + b0.y1) / 2
            fig.add_artist(FancyArrowPatch((b0.x1 + 0.004, ym), (b1.x0 - 0.004, ym),
                                           transform=fig.transFigure, arrowstyle="-|>",
                                           mutation_scale=22, lw=2, color=C["dark"]))
        save(fig, OUT / f"02-pipeline_{lang}.svg")


# ---------------------------------------------------------------- 2. look-at basis
def fig_view_basis():
    eye = np.array([2.5, 1.6, 3.5]); target = np.array([0, 0.4, 0]); up0 = np.array([0, 1.0, 0])
    f = target - eye; f /= np.linalg.norm(f)
    s = np.cross(f, up0); s /= np.linalg.norm(s)
    u = np.cross(s, f)
    fig = plt.figure(figsize=(9.5, 6.4))
    ax = fig.add_subplot(111, projection="3d")
    # world (x, y, z) -> plot (x, -z, y): a proper rotation, so the right-handed frame is kept and y is up
    sw = lambda p: (p[0], -p[2], p[1])
    for a in np.linspace(-0.5, 3.0, 8):
        ax.plot(*zip(sw([a, 0, -0.5]), sw([a, 0, 4.0])), color="#dddddd", lw=0.9)
    for a in np.linspace(-0.5, 4.0, 10):
        ax.plot(*zip(sw([-0.5, 0, a]), sw([3.0, 0, a])), color="#dddddd", lw=0.9)
    for vec, col, nm in ((np.array([1.3, 0, 0]), C["x"], "x"), (np.array([0, 1.3, 0]), C["y"], "y"),
                         (np.array([0, 0, 1.3]), C["z"], "z")):
        ax.quiver(*sw(np.zeros(3)), *sw(vec), color=col, lw=1.8, arrow_length_ratio=0.12)
        ax.text(*sw(vec * 1.15), f"${nm}$", color=col, fontsize=16)
    ax.scatter(*sw(target), color=C["dark"], s=45, depthshade=False)
    ax.text(*sw(target + [-0.35, 0.1, 0]), r"$\mathbf{t}$", fontsize=21)
    ax.scatter(*sw(eye), color=C["dark"], s=45, depthshade=False)
    ax.text(*sw(eye - 0.35 * s + [0, -0.3, 0]), r"$\mathbf{e}$", fontsize=21)
    ax.plot(*zip(sw(eye), sw(target)), color=C["gray"], ls="--", lw=1.3)
    for p_ in (eye, target):  # drop lines to the floor y = 0 show the heights
        ax.plot(*zip(sw(p_), sw(p_ * [1, 0, 1])), color=C["gray"], ls=":", lw=1.5)
        ax.scatter(*sw(p_ * [1, 0, 1]), color=C["gray"], s=12, depthshade=False)
    # a small viewing pyramid along f (what the camera sees)
    corners = [eye + 0.9 * f + 0.35 * (i * s) + 0.26 * (j * u) for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for k in range(4):
        ax.plot(*zip(sw(eye), sw(corners[k])), color=C["gray"], lw=0.8)
        ax.plot(*zip(sw(corners[k]), sw(corners[(k + 1) % 4])), color=C["gray"], lw=0.8)
    L = 1.15
    for vec, col, nm in ((f, C["b"], r"$\mathbf{f}$"), (s, C["x"], r"$\mathbf{s}$"),
                         (u, C["y"], r"$\mathbf{u}$"), (up0 * 0.8, C["gray"], r"$\mathbf{u}_0$")):
        ax.quiver(*sw(eye), *sw(vec * L), color=col, lw=3, arrow_length_ratio=0.15)
        off = -0.35 * s if nm.endswith("_0$") else (0.25 * u if "f" in nm else (-0.3 * u if "s" in nm else 0))
        ax.text(*sw(eye + vec * L * 1.2 + off), nm, color=col, fontsize=21)
    ax.quiver(*sw(eye), *sw(-f * 0.8), color=C["z"], lw=2, ls=":", arrow_length_ratio=0.18)
    ax.text(*sw(eye - f * 0.8 * 1.3), r"$-\mathbf{f}$", color=C["z"], fontsize=17)
    ax.set_xlim(-1.0, 3.5); ax.set_ylim(-4.5, 1.0); ax.set_zlim(0, 2.8)
    ax.set_box_aspect((4.5, 5.5, 2.8), zoom=1.15)
    ax.set_axis_off()
    ax.view_init(elev=24, azim=-20)
    ax.set_position([-0.16, -0.3, 1.32, 1.6])
    with plt.rc_context({"savefig.bbox": "standard"}):  # crop to the figure, not the empty 3D box
        save(fig, OUT / "02-view-basis.svg")


# ---------------------------------------------------------------- 3. similar triangles
def fig_similar_triangles():
    n = 1.0
    y, z = 1.3, -3.0
    yp = n * y / -z
    fig, ax = plt.subplots(figsize=(9.5, 4.8))
    ax.annotate("", xy=(-3.75, 0), xytext=(0.5, 0), arrowprops=dict(arrowstyle="->", lw=1.5, color=C["z"]))
    ax.text(-3.95, 0.1, "$-z$", color=C["z"], fontsize=16)
    ax.annotate("", xy=(0, 1.75), xytext=(0, -0.45), arrowprops=dict(arrowstyle="->", lw=1.5, color=C["y"]))
    ax.text(0.08, 1.62, "$y$", color=C["y"], fontsize=16)
    ax.plot([-n, -n], [-0.45, 1.6], color=C["a"], lw=3)
    ax.text(-n + 0.06, 1.45, "$z=-n$", color=C["a"], fontsize=15)
    ax.fill([0, z, z], [0, 0, y], color=C["b"], alpha=0.15)
    ax.fill([0, -n, -n], [0, 0, yp], color=C["a"], alpha=0.35)
    ax.plot([0, z], [0, y], color=C["dark"], lw=2)
    ax.plot([z, z], [0, y], color=C["b"], lw=3)
    ax.plot([-n, -n], [0, yp], color=C["a"], lw=5)
    ax.plot(z, y, "o", color=C["b"], ms=10); ax.plot(-n, yp, "o", color=C["a"], ms=10)
    ax.text(z, y + 0.12, "$(y, z)$", fontsize=16, ha="center")
    ax.text(-n - 0.32, yp + 0.08, "$y'$", fontsize=18, color=C["a"])
    ax.text(z + 0.08, y / 2, "$y$", fontsize=17, color=C["b"])
    ax.annotate("", xy=(z, -0.75), xytext=(0, -0.75), arrowprops=dict(arrowstyle="<->", lw=1.3))
    ax.text(z / 2, -0.98, "$-z$", ha="center", fontsize=15)
    ax.annotate("", xy=(-n, -0.32), xytext=(0, -0.32), arrowprops=dict(arrowstyle="<->", lw=1.3))
    ax.text(-n / 2, -0.55, "$n$", ha="center", fontsize=15)
    ax.plot(0, 0, "ks", ms=10)
    ax.text(-2.45, 1.45, r"$\dfrac{y'}{n}=\dfrac{y}{-z}$", fontsize=19)
    ax.set_xlim(-4.1, 0.6); ax.set_ylim(-1.15, 1.9)
    clean2d(ax)
    save(fig, OUT / "02-similar-triangles.svg")


# ---------------------------------------------------------------- 4. frustum -> NDC cube
def fig_frustum_ndc():
    fov, aspect, n, f = 60, 1.0, 1.0, 5.0
    P = perspective(fov, aspect, n, f)
    t = n * np.tan(np.radians(fov / 2)); r = aspect * t
    depths = np.linspace(-n, -f, 5)  # equally spaced slices in view space
    cols = plt.cm.viridis(np.linspace(0.05, 0.85, len(depths)))

    def slice_rect(z):
        s = -z / n
        return np.array([[-r * s, -t * s, z], [r * s, -t * s, z], [r * s, t * s, z], [-r * s, t * s, z]])

    def to_ndc(p):
        c = np.c_[p, np.ones(len(p))] @ P.T
        return c[:, :3] / c[:, 3:]

    fig = plt.figure(figsize=(14, 6.0))
    # view space -> plot (x, -z, y) (a rotation: keeps right-handedness, y up, depth into the page)
    sw = lambda p: (p[:, 0], -p[:, 2], p[:, 1])
    ax = fig.add_axes([0.0, -0.06, 0.40, 1.12], projection="3d")
    nr, fr = slice_rect(-n), slice_rect(-f)
    for k in range(4):
        ax.plot([0, fr[k, 0]], [0, f], [0, fr[k, 1]], color=C["gray"], lw=1.0, ls=":")
        ax.plot([nr[k, 0], fr[k, 0]], [n, f], [nr[k, 1], fr[k, 1]], color=C["dark"], lw=1.4)
    for z, col in zip(depths, cols):
        q = slice_rect(z)
        ax.add_collection3d(Poly3DCollection([list(zip(*sw(q)))], fc=col, alpha=0.22, ec=col, lw=2.2))
    ax.scatter([0], [0], [0], color="k", s=40)
    ax.quiver(0, 0, 0, 1.2, 0, 0, color=C["x"], lw=1.8, arrow_length_ratio=0.15)
    ax.quiver(0, 0, 0, 0, 0, 1.2, color=C["y"], lw=1.8, arrow_length_ratio=0.15)
    ax.quiver(0, 0, 0, 0, -1.2, 0, color=C["z"], lw=1.8, arrow_length_ratio=0.15)
    ax.text(1.3, 0, 0, "$x$", color=C["x"], fontsize=16)
    ax.text(0, 0, 1.32, "$y$", color=C["y"], fontsize=16)
    ax.text(0, -1.5, 0, "$z$", color=C["z"], fontsize=16)
    ax.set_xlim(-3, 3); ax.set_ylim(-1, 5.2); ax.set_zlim(-3, 3)
    ax.set_box_aspect((6, 6.2, 6), zoom=1.2)
    ax.view_init(elev=20, azim=-48)
    ax.set_axis_off()

    ax = fig.add_axes([0.62, -0.02, 0.38, 1.04], projection="3d")
    cube = np.array([[x, y, z] for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)], float)
    edges = [(i, j) for i in range(8) for j in range(i + 1, 8) if np.sum(np.abs(cube[i] - cube[j])) == 2]
    ax.add_collection3d(Line3DCollection([[(cube[i][0], cube[i][2], cube[i][1]),
                                           (cube[j][0], cube[j][2], cube[j][1])] for i, j in edges],
                                         colors=C["dark"], lw=1.4))
    for z, col in zip(depths, cols):
        q = to_ndc(slice_rect(z))
        ax.add_collection3d(Poly3DCollection([list(zip(q[:, 0], q[:, 2], q[:, 1]))], fc=col, alpha=0.22, ec=col, lw=2.2))
    ax.quiver(-1, -1, -1, 0.7, 0, 0, color=C["x"], lw=1.8, arrow_length_ratio=0.15)
    ax.quiver(-1, -1, -1, 0, 0, 0.7, color=C["y"], lw=1.8, arrow_length_ratio=0.15)
    ax.quiver(-1, -1, -1, 0, 0.7, 0, color=C["z"], lw=1.8, arrow_length_ratio=0.15)
    ax.text(-0.25, -1, -1.1, r"$x_{ndc}$", color=C["x"], fontsize=15)
    ax.text(-1.1, -1, -0.2, r"$y_{ndc}$", color=C["y"], fontsize=15)
    ax.text(-1, -0.2, -1.15, r"$z_{ndc}$", color=C["z"], fontsize=15)
    ax.set_xlim(-1.1, 1.1); ax.set_ylim(-1.1, 1.1); ax.set_zlim(-1.1, 1.1)
    ax.set_box_aspect((1, 1, 1), zoom=1.15)
    ax.view_init(elev=20, azim=-48)
    ax.set_axis_off()
    # legend: equally spaced view depths and where they land in NDC
    for k, (z, col) in enumerate(zip(depths, cols)):
        zn = to_ndc(slice_rect(z))[0, 2]
        fig.text(0.405, 0.84 - 0.085 * k, rf"$z={z:g}\ \rightarrow\ {zn:+.3f}$", color=col, fontsize=19)
    fig.add_artist(FancyArrowPatch((0.42, 0.26), (0.58, 0.26), transform=fig.transFigure,
                                   arrowstyle="-|>", mutation_scale=25, lw=2.5, color=C["dark"]))
    fig.text(0.50, 0.30, r"$P,\ \div w$", fontsize=21, ha="center")
    fig.text(0.50, 0.92, r"$z_{view}\ \rightarrow\ z_{ndc}$", fontsize=19, ha="center")
    with plt.rc_context({"savefig.bbox": "standard"}):
        save(fig, OUT / "02-frustum-to-ndc.svg")


# ---------------------------------------------------------------- 5. depth non-linearity
def fig_depth():
    n, f = 0.1, 100.0
    A = (f + n) / (n - f); B = 2 * f * n / (n - f)
    d = np.geomspace(n, f, 600)  # d = -z_view = w
    zndc = (A * -d + B) / d
    fig, axs = plt.subplots(1, 2, figsize=(13, 4.8))
    ax = axs[0]
    ax.plot(d, zndc, color=C["a"], lw=3)
    pts = np.array([0.1, 0.2, 1.0, 10.0, 100.0])
    zp = (A * -pts + B) / pts
    ax.plot(pts, zp, "o", color=C["b"], ms=8, zorder=5)
    for p_, z_ in zip(pts[1:4], zp[1:4]):
        ax.annotate(f"{z_:.3f}", (p_, z_), textcoords="offset points", xytext=(8, -18), fontsize=13)
    ax.set_xscale("log")
    ax.set_xlabel(r"$w=-z_{view}$  (log)")
    ax.set_ylabel(r"$z_{ndc}$")
    ax.set_ylim(-1.1, 1.1)
    ax.axhline(0, color=C["gray"], lw=1, ls="--")
    tag(ax, "(a)")
    ax = axs[1]
    inv = 1 / d
    ax.plot(inv, zndc, color=C["c"], lw=3)
    ax.plot(1 / pts, zp, "o", color=C["b"], ms=8, zorder=5)
    ax.set_xlabel(r"$1/w$")
    ax.set_ylabel(r"$z_{ndc}$")
    ax.text(4.0, -0.2, r"$z_{ndc}=-A+B\,(1/w)$", fontsize=16)
    ax.set_ylim(-1.1, 1.1)
    tag(ax, "(b)")
    fig.tight_layout()
    save(fig, OUT / "02-depth-nonlinear.svg")


# ---------------------------------------------------------------- 6. near-plane clipping
def clip_near(poly):
    out = []
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        dp, dq = p[2] + p[3], q[2] + q[3]
        if dp >= 0:
            out.append(p)
        if (dp >= 0) != (dq >= 0):
            t = dp / (dp - dq)
            out.append(p + t * (q - p))
    return out


def fig_clipping():
    n, f = 0.5, 10.0
    P = perspective(90, 1.0, n, f)
    # triangle in view space (y = -0.6, below the eye); vertex c is behind the camera (z > 0)
    tri = np.array([[-2.0, -0.6, -4.0], [2.5, -0.6, -3.0], [0.6, -0.6, 1.5]])
    clip = np.c_[tri, np.ones(3)] @ P.T
    poly = np.array(clip_near(list(clip)))
    pv = poly @ np.linalg.inv(P).T
    pv = pv[:, :3] / pv[:, 3:]  # clipped polygon back in view space, for the top view

    fig, axs = plt.subplots(1, 3, figsize=(16, 5.6), gridspec_kw=dict(width_ratios=[1.2, 1, 1]))
    ax = axs[0]  # top view: x to the right, -z up the page (the camera looks up)
    ax.fill([0, -f, f], [0, f, f], color=C["fill"], alpha=0.6, lw=0)
    ax.axhspan(-2.2, 0, color=C["x"], alpha=0.07)
    ax.plot([-6, 6], [n, n], color=C["a"], lw=2.5)
    ax.text(3.3, n + 0.18, "$z=-n$", color=C["a"], fontsize=15)
    ax.add_patch(Polygon(np.c_[tri[:, 0], -tri[:, 2]], fc="none", ec=C["gray"], lw=2, ls="--"))
    ax.add_patch(Polygon(np.c_[pv[:, 0], -pv[:, 2]], fc=C["b"], alpha=0.35, ec=C["b"], lw=2.5))
    for k in range(1, len(pv) - 1):
        ax.plot([pv[0, 0], pv[k + 1, 0]], [-pv[0, 2], -pv[k + 1, 2]], color=C["b"], lw=1.4, ls=":")
    for p_, nm in zip(tri, "abc"):
        ax.plot(p_[0], -p_[2], "o", color=C["dark"], ms=7)
        ax.text(p_[0] + 0.18, -p_[2] + 0.1, f"${nm}$", fontsize=17)
    ax.plot(0, 0, "ks", ms=9)
    ax.annotate("", xy=(1.6, 0), xytext=(0, 0), arrowprops=dict(arrowstyle="->", lw=1.8, color=C["x"]))
    ax.annotate("", xy=(0, -1.6), xytext=(0, 0), arrowprops=dict(arrowstyle="->", lw=1.8, color=C["z"]))
    ax.text(1.65, -0.35, "$x$", color=C["x"], fontsize=16)
    ax.text(0.15, -1.75, "$z$", color=C["z"], fontsize=16)
    ax.text(-5.6, -1.2, "$w=-z<0$", fontsize=15, color=C["x"])
    ax.set_xlim(-6, 6); ax.set_ylim(-2.2, 5)
    clean2d(ax)
    tag(ax, "(a)")

    def screen(ax, verts_clip, title_tag, fill, label_text):
        ndc = verts_clip[:, :2] / verts_clip[:, 3:]
        ax.add_patch(Rectangle((-1, -1), 2, 2, fc="#f6f6f6", ec=C["dark"], lw=1.5, zorder=0))
        ax.add_patch(Polygon(ndc, fc=fill, alpha=0.4, ec=fill, lw=2.5, zorder=2))
        ax.text(-2.4, 2.05, label_text, fontsize=16)
        ax.set_xlim(-2.5, 2.5); ax.set_ylim(-2.5, 2.5)
        clean2d(ax)
        tag(ax, title_tag)
        return ndc

    ndc_bad = screen(axs[1], clip, "(b)", C["x"], r"$a,b,c\ \rightarrow\ (x,y)/w$")
    for p_, nm in zip(ndc_bad, "abc"):
        axs[1].plot(*p_, "o", color=C["dark"], ms=7, zorder=3)
        axs[1].text(p_[0] + 0.08, p_[1] + 0.1, f"${nm}'$", fontsize=17, zorder=3)
    screen(axs[2], poly, "(c)", C["b"], r"$\mathrm{clip}(a,b,c)\ \rightarrow\ (x,y)/w$")
    fig.tight_layout()
    save(fig, OUT / "02-clipping.svg")


# ---------------------------------------------------------------- 7. viewport transform
def fig_viewport():
    W, H = 12, 8
    tri = np.array([[-0.7, -0.6], [0.8, -0.2], [-0.1, 0.75]])
    sx = (tri[:, 0] + 1) / 2 * W; sy = (1 - tri[:, 1]) / 2 * H
    fig, axs = plt.subplots(1, 2, figsize=(14, 5.2), gridspec_kw=dict(width_ratios=[1, 1.45]))
    ax = axs[0]
    ax.add_patch(Rectangle((-1, -1), 2, 2, fc="#f6f6f6", ec=C["dark"], lw=1.5))
    ax.add_patch(Polygon(tri, fc=C["a"], alpha=0.3, ec=C["a"], lw=2.5))
    ax.annotate("", xy=(1.35, 0), xytext=(-1.25, 0), arrowprops=dict(arrowstyle="->", color=C["x"], lw=1.6))
    ax.annotate("", xy=(0, 1.35), xytext=(0, -1.25), arrowprops=dict(arrowstyle="->", color=C["y"], lw=1.6))
    ax.text(1.38, -0.12, r"$x_{ndc}$", color=C["x"], fontsize=15)
    ax.text(0.05, 1.33, r"$y_{ndc}$", color=C["y"], fontsize=15)
    for (x, y), lab in (((-1, -1), "(-1,-1)"), ((1, 1), "(1,1)"), ((-1, 1), "(-1,1)")):
        ax.plot(x, y, "o", color=C["dark"], ms=6)
        ax.text(x + (0.05 if x > 0 else -0.05), y + (0.08 if y > 0 else -0.2), lab, fontsize=13,
                ha="right" if x < 0 else "left")
    ax.set_xlim(-1.6, 1.8); ax.set_ylim(-1.5, 1.5)
    clean2d(ax)
    ax = axs[1]
    pixel_grid(ax, W, H)
    ax.add_patch(Polygon(np.c_[sx, sy], fc=C["a"], alpha=0.3, ec=C["a"], lw=2.5, zorder=3))
    px, py = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    ax.plot(px, py, ".", color=C["gray"], ms=4)
    ax.annotate("", xy=(W + 0.9, 0), xytext=(0, 0), arrowprops=dict(arrowstyle="->", color=C["x"], lw=1.6))
    ax.annotate("", xy=(0, H + 0.9), xytext=(0, 0), arrowprops=dict(arrowstyle="->", color=C["y"], lw=1.6))
    ax.text(W + 0.6, -0.35, "$x_s$", color=C["x"], fontsize=15)
    ax.text(-0.85, H + 0.8, "$y_s$", color=C["y"], fontsize=15)
    ax.text(-0.25, -0.25, "(0,0)", fontsize=12, ha="right")
    ax.text(W + 0.1, H + 0.55, f"(W,H)=({W},{H})", fontsize=12)
    i, j = 1, 1
    ax.add_patch(Rectangle((i, j), 1, 1, fc=C["light"], alpha=0.7, ec=C["b"], lw=2, zorder=2))
    ax.plot(i + 0.5, j + 0.5, "o", color=C["b"], ms=7, zorder=4)
    ax.text(i + 1.25, j + 0.62, r"$(i+\frac{1}{2},\ j+\frac{1}{2})$", fontsize=15, zorder=5,
            bbox=dict(fc="white", ec="none", alpha=0.9, pad=1))
    ax.set_xlim(-1.2, W + 1.4); ax.set_ylim(H + 1.2, -1.6)
    clean2d(ax)
    fig.text(0.39, 0.5, r"$x_s=\frac{x+1}{2}W$" + "\n" + r"$y_s=\frac{1-y}{2}H$", fontsize=16, ha="center", va="center")
    fig.tight_layout(w_pad=6)
    save(fig, OUT / "02-viewport.svg")


# ---------------------------------------------------------------- 8. edge function sign maps (y up)
def fig_edge_functions():
    W, H = 16, 12
    a, b, c = np.array([2.3, 1.6]), np.array([14.2, 4.1]), np.array([6.1, 10.7])  # CCW in y-up
    px, py = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    Es = [edge_up(a, b, px, py), edge_up(b, c, px, py), edge_up(c, a, px, py)]
    names = [r"$E_{ab}$", r"$E_{bc}$", r"$E_{ca}$"]
    pairs = [(a, b), (b, c), (c, a)]
    fig, axs = plt.subplots(2, 2, figsize=(11, 8.6))
    axs = axs.ravel()
    pos, neg = np.array([0.80, 0.90, 0.80]), np.array([0.97, 0.82, 0.82])
    for k in range(3):
        ax = axs[k]
        img = np.where(Es[k][..., None] >= 0, pos, neg)
        ax.imshow(img, extent=(0, W, 0, H), origin="lower", interpolation="nearest")
        pixel_grid(ax, W, H, color="white", lw=0.8)
        p, q = pairs[k]
        d = (q - p) / np.linalg.norm(q - p)
        ax.plot(*np.c_[p - 30 * d, q + 30 * d], color=C["dark"], lw=1, ls="--")
        ax.add_patch(Polygon(np.array([a, b, c]), fc="none", ec=C["gray"], lw=1.2))
        ax.annotate("", xy=q, xytext=p, arrowprops=dict(arrowstyle="-|>", lw=3, color=C["a"], mutation_scale=22))
        for v_, nm, off in zip((a, b, c), "abc", ((-0.9, -0.9), (0.2, -0.9), (0.2, 0.3))):
            ax.plot(*v_, "o", color=C["dark"], ms=6)
            ax.text(v_[0] + off[0], v_[1] + off[1], f"${nm}$", fontsize=17)
        nl = np.array([-d[1], d[0]])  # left normal of the directed edge (y up)
        m = (p + q) / 2
        ax.text(*(m + 2.3 * nl), "+", fontsize=30, color="#1a7f1a", fontweight="bold", ha="center", va="center")
        ax.text(*(m - 2.3 * nl), "−", fontsize=30, color=C["x"], fontweight="bold", ha="center", va="center")
        ax.set_xlim(0, W); ax.set_ylim(0, H)
        clean2d(ax)
        ax.set_title(names[k], fontsize=19)
    ax = axs[3]
    inside = (Es[0] >= 0) & (Es[1] >= 0) & (Es[2] >= 0)
    img = np.ones((H, W, 3)); img[inside] = [0.75, 0.68, 0.88]
    ax.imshow(img, extent=(0, W, 0, H), origin="lower", interpolation="nearest")
    pixel_grid(ax, W, H)
    ax.add_patch(Polygon(np.array([a, b, c]), fc="none", ec=C["a"], lw=2.5))
    ax.plot(px[inside], py[inside], "o", color=C["a"], ms=5)
    for v_, nm, off in zip((a, b, c), "abc", ((-0.9, -0.9), (0.2, -0.9), (0.2, 0.3))):
        ax.plot(*v_, "o", color=C["dark"], ms=6)
        ax.text(v_[0] + off[0], v_[1] + off[1], f"${nm}$", fontsize=17)
    ax.set_xlim(0, W); ax.set_ylim(0, H)
    clean2d(ax)
    ax.set_title(r"$E_{ab},E_{bc},E_{ca}\geq 0$", fontsize=19)
    fig.tight_layout()
    save(fig, OUT / "02-edge-functions.svg")


# ---------------------------------------------------------------- 9. barycentric areas + interpolation
def fig_barycentric():
    a, b, c = np.array([1.0, 1.0]), np.array([11.0, 2.5]), np.array([4.5, 9.5])
    p = np.array([4.3, 3.4])
    A = edge_up(a, b, *c)
    la, lb, lc = edge_up(b, c, *p) / A, edge_up(c, a, *p) / A, edge_up(a, b, *p) / A
    fig, axs = plt.subplots(1, 2, figsize=(14, 6.2))
    ax = axs[0]
    # the sub-triangle opposite a is (p, b, c); its area fraction is lambda_a, drawn in a's colour
    for (q1, q2), col in (((b, c), VCOL[0]), ((c, a), VCOL[1]), ((a, b), VCOL[2])):
        ax.add_patch(Polygon(np.array([p, q1, q2]), fc=col, alpha=0.35, ec="white", lw=2))
    ax.add_patch(Polygon(np.array([a, b, c]), fc="none", ec=C["dark"], lw=2.5))
    for v_, nm, col, off in zip((a, b, c), "abc", VCOL, ((-0.7, -0.6), (0.2, -0.5), (-0.2, 0.3))):
        ax.plot(*v_, "o", color=col, ms=11)
        ax.text(v_[0] + off[0], v_[1] + off[1], rf"$\mathbf{{{nm}}}$", fontsize=20, color=col)
    ax.plot(*p, "ko", ms=8)
    ax.text(p[0] + 0.2, p[1] + 0.2, r"$\mathbf{p}$", fontsize=19)
    for q1, q2, lam, nm in ((b, c, la, "a"), (c, a, lb, "b"), (a, b, lc, "c")):
        cen = (p + q1 + q2) / 3
        ax.text(*cen, rf"$\lambda_{nm}={lam:.2f}$", fontsize=15, ha="center", va="center", color="k")
    ax.set_xlim(0, 12.5); ax.set_ylim(0, 10.5)
    clean2d(ax)
    tag(ax, "(a)")
    ax = axs[1]
    W, H = 25, 21
    sc = W / 12.5
    A2, B2, C2, p2 = a * sc, b * sc, c * sc, p * sc
    px, py = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    AA = edge_up(A2, B2, *C2)
    lam = np.stack([edge_up(B2, C2, px, py), edge_up(C2, A2, px, py), edge_up(A2, B2, px, py)], -1) / AA
    inside = (lam >= 0).all(-1)
    img = np.ones((H, W, 3)); img[inside] = lam[inside] @ VCOL
    ax.imshow(img, extent=(0, W, 0, H), origin="lower", interpolation="nearest")
    pixel_grid(ax, W, H, color="#e0e0e0", lw=0.6)
    ax.add_patch(Polygon(np.array([A2, B2, C2]), fc="none", ec=C["dark"], lw=1.5))
    ax.plot(*p2, "o", mfc=np.array([la, lb, lc]) @ VCOL, mec="k", mew=2, ms=11)
    ax.set_xlim(0, W); ax.set_ylim(0, H)
    clean2d(ax)
    tag(ax, "(b)")
    fig.tight_layout()
    save(fig, OUT / "02-barycentric.svg")
    return la, lb, lc


# ---------------------------------------------------------------- 10. perspective-correct interpolation
def fig_persp_correct():
    # side view: a segment whose endpoints have w = 1 and w = 10, screen (near plane) at z = -n
    n = 0.5
    z0, z1 = -1.0, -10.0
    y0, y1 = -1.0, 3.0
    w = np.array([1.0, 10.0])
    fig, axs = plt.subplots(1, 2, figsize=(14, 5.4), gridspec_kw=dict(width_ratios=[1.35, 1]))
    ax = axs[0]
    ax.plot([z0, z1], [y0, y1], color=C["dark"], lw=3)
    ax.plot([-n, -n], [-0.75, 0.45], color=C["a"], lw=3)
    s0, s1 = n * y0 / -z0, n * y1 / -z1  # screen positions of the endpoints
    for lam in np.linspace(0, 1, 9):
        s = (1 - lam) * s0 + lam * s1            # equal steps on screen
        beta1 = (lam / w[1]) / ((1 - lam) / w[0] + lam / w[1])
        zz = (1 - beta1) * z0 + beta1 * z1; yy = (1 - beta1) * y0 + beta1 * y1
        col = plt.cm.plasma(0.05 + 0.8 * lam)
        ax.plot([0, zz], [0, yy], color=col, lw=1, alpha=0.8)
        ax.plot(-n, s, "o", color=col, ms=7, zorder=4)
        ax.plot(zz, yy, "o", color=col, ms=9, zorder=4)
        za = (1 - lam) * z0 + lam * z1; ya = (1 - lam) * y0 + lam * y1  # equal 3D steps
        ax.plot(za, ya, "|", color=C["gray"], ms=16, mew=2.5)
    ax.plot(0, 0, "ks", ms=9)
    ax.text(-n + 0.15, 0.5, "$z=-n$", fontsize=14, color=C["a"])
    # magnified view of the screen: the samples are equally spaced there
    ins = ax.inset_axes([0.86, 0.5, 0.1, 0.48])
    ins.plot([0, 0], [s0 - 0.02, s1 + 0.02], color=C["a"], lw=3)
    for lam in np.linspace(0, 1, 9):
        ins.plot(0, (1 - lam) * s0 + lam * s1, "o", color=plt.cm.plasma(0.05 + 0.8 * lam), ms=9)
    ins.set_xlim(-0.05, 0.05); ins.set_ylim(s0 - 0.04, s1 + 0.04)
    ins.set_xticks([]); ins.set_yticks([]); ins.grid(False)
    for sp in ins.spines.values():
        sp.set_color(C["a"]); sp.set_visible(True)
    ax.text(0.91, 0.44, r"$\lambda_1$", transform=ax.transAxes, ha="center", fontsize=16)
    ax.text(z0 - 0.2, y0 - 0.45, "$w=1$", fontsize=15)
    ax.text(z1 + 0.15, y1 + 0.2, "$w=10$", fontsize=15)
    ax.set_xlim(-10.8, 2.6); ax.set_ylim(-1.7, 3.6)
    ax.set_aspect("auto")
    ax.grid(False); ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_visible(False)
    tag(ax, "(a)")
    ax = axs[1]
    lam = np.linspace(0, 1, 200)
    for w1, col in ((2.0, C["c"]), (10.0, C["b"])):
        beta = (lam / w1) / ((1 - lam) / 1.0 + lam / w1)
        ax.plot(lam, beta, color=col, lw=3, label=f"$w_0=1,\\ w_1={w1:g}$")
    ax.plot(lam, lam, color=C["gray"], ls="--", lw=2, label=r"$\beta_1=\lambda_1$")
    ax.plot(0.5, 1 / 11, "o", color=C["b"], ms=10, zorder=5)
    ax.annotate(r"$\beta_1=0.091$", (0.5, 1 / 11), xytext=(0.55, 0.28), fontsize=15,
                arrowprops=dict(arrowstyle="->"))
    ax.set_xlabel(r"$\lambda_1$")
    ax.set_ylabel(r"$\beta_1$")
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.set_aspect("equal")
    ax.legend(fontsize=13, loc="upper left")
    tag(ax, "(b)")
    fig.tight_layout()
    save(fig, OUT / "02-persp-correct.svg")


# ---------------------------------------------------------------- 11. z-buffer
def fig_zbuffer():
    W, H = 48, 36
    # two triangles in screen space (y up) with per-vertex depth in [0, 1]; they interpenetrate
    T1 = np.array([[4, 4, 0.2], [40, 10, 0.8], [12, 32, 0.5]])
    T2 = np.array([[44, 4, 0.3], [30, 33, 0.3], [6, 16, 0.9]])
    px, py = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    color = np.ones((H, W, 3)); depth = np.full((H, W), np.inf)
    cols = [np.array([0.58, 0.40, 0.74]), np.array([1.0, 0.50, 0.05])]
    shade = lambda col, z: np.clip(col * (1.15 - 0.6 * z[..., None]), 0, 1)  # brighter = nearer
    layers = []
    for T, col in zip((T1, T2), cols):
        v = T[:, :2]
        area = edge_up(v[0], v[1], *v[2])
        l = np.stack([edge_up(v[1], v[2], px, py), edge_up(v[2], v[0], px, py), edge_up(v[0], v[1], px, py)], -1) / area
        inside = (l >= 0).all(-1)
        z = l @ T[:, 2]
        layers.append((inside, z))
        m = inside & (z < depth)          # the z-buffer test
        depth[m] = z[m]
        color[m] = shade(col, z)[m]
    fig, axs = plt.subplots(2, 2, figsize=(11, 8.8))
    axs = axs.ravel()
    for k, ((inside, z), col) in enumerate(zip(layers, cols)):
        img = np.ones((H, W, 3))
        img[inside] = shade(col, z)[inside]
        axs[k].imshow(img, origin="lower", extent=(0, W, 0, H), interpolation="nearest")
        axs[k].set_title(f"$T_{k + 1}$", fontsize=19)
    dimg = np.where(np.isinf(depth), 1.0, depth)
    im = axs[2].imshow(dimg, origin="lower", extent=(0, W, 0, H), cmap="gray", vmin=0, vmax=1, interpolation="nearest")
    axs[2].set_title(r"$z$-buffer", fontsize=19)
    axs[3].imshow(color, origin="lower", extent=(0, W, 0, H), interpolation="nearest")
    axs[3].set_title(r"$z < z_{buf}$", fontsize=19)
    for ax in axs:
        clean2d(ax)
        ax.add_patch(Rectangle((0, 0), W, H, fc="none", ec=C["gray"], lw=1))
    cb = fig.colorbar(im, ax=axs[2], fraction=0.04, pad=0.03, ticks=[0, 0.5, 1])
    cb.ax.tick_params(labelsize=14)
    fig.tight_layout()
    save(fig, OUT / "02-zbuffer.svg")


# ---------------------------------------------------------------- 12. aliasing + sample patterns
def fig_aliasing():
    W, H = 16, 10
    a, b, c = np.array([0.6, 0.8]), np.array([15.4, 3.2]), np.array([3.0, 9.4])  # CCW, y up
    patterns = {
        "1x": np.array([[0.5, 0.5]]),
        "2x2 SSAA": np.array([[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]),
        "4x MSAA (RGSS)": (np.array([[-2, -6], [6, -2], [-6, 2], [2, 6]]) / 16.0) + 0.5,
    }

    def coverage(samples):
        img = np.zeros((H, W))
        for sxo, syo in samples:
            px, py = np.meshgrid(np.arange(W) + sxo, np.arange(H) + syo)
            ins = (edge_up(a, b, px, py) >= 0) & (edge_up(b, c, px, py) >= 0) & (edge_up(c, a, px, py) >= 0)
            img += ins
        return img / len(samples)

    # exact area coverage via 32x32 supersampling, for reference
    g = (np.arange(32) + 0.5) / 32
    ref = coverage([(x, y) for x in g for y in g])

    fig, axs = plt.subplots(2, 4, figsize=(17, 8.2), gridspec_kw=dict(height_ratios=[1, 1.35]))
    # top row: one pixel with an edge crossing it and the sample positions
    e0, e1 = np.array([-0.1, 0.15]), np.array([1.1, 0.95])  # edge through the pixel, inside = left/above
    for k, (nm, smp) in enumerate(patterns.items()):
        ax = axs[0, k]
        ax.add_patch(Polygon(np.array([e0, e1, [1.1, 1.1], [-0.1, 1.1]]), fc=C["fill"], ec="none"))
        ax.plot(*np.c_[e0, e1], color=C["a"], lw=2.5)
        ax.add_patch(Rectangle((0, 0), 1, 1, fc="none", ec=C["dark"], lw=2))
        cov = 0
        for s in smp:
            ins = edge_up(e0, e1, *s) >= 0
            cov += ins
            ax.plot(*s, "o", ms=13, mfc=C["a"] if ins else "white", mec=C["dark"], mew=2)
        ax.text(0.5, -0.2, f"{cov}/{len(smp)}", ha="center", fontsize=16)
        ax.set_xlim(-0.15, 1.15); ax.set_ylim(-0.3, 1.15)
        clean2d(ax)
        ax.set_title(nm, fontsize=15)
    ax = axs[0, 3]
    ax.add_patch(Polygon(np.array([e0, e1, [1.1, 1.1], [-0.1, 1.1]]), fc=C["fill"], ec="none"))
    ax.plot(*np.c_[e0, e1], color=C["a"], lw=2.5)
    ax.add_patch(Rectangle((0, 0), 1, 1, fc="none", ec=C["dark"], lw=2))
    # exact area of the pixel above the line y = 0.15 + (x+0.1)*(0.8/1.2)
    xs = np.linspace(0, 1, 10001); yl = 0.15 + (xs + 0.1) * (0.8 / 1.2)
    exact = np.mean(1 - np.clip(yl, 0, 1))
    ax.text(0.5, -0.2, f"{exact:.2f}", ha="center", fontsize=16)
    ax.set_xlim(-0.15, 1.15); ax.set_ylim(-0.3, 1.15)
    clean2d(ax)
    ax.set_title("\u221e", fontsize=18)
    # bottom row: the rendered triangle
    for k, (nm, smp) in enumerate(list(patterns.items()) + [("inf", None)]):
        ax = axs[1, k]
        cov = ref if smp is None else coverage(smp)
        img = 1 - cov[..., None] * (1 - np.array([0.42, 0.26, 0.60]))
        ax.imshow(img, origin="lower", extent=(0, W, 0, H), interpolation="nearest")
        pixel_grid(ax, W, H, color="#dddddd", lw=0.6)
        ax.add_patch(Polygon(np.array([a, b, c]), fc="none", ec=C["b"], lw=1.2))
        ax.set_xlim(0, W); ax.set_ylim(0, H)
        clean2d(ax)
    fig.tight_layout()
    save(fig, OUT / "02-aliasing.svg")


if __name__ == "__main__":
    fig_pipeline()
    fig_view_basis()
    fig_similar_triangles()
    fig_frustum_ndc()
    fig_depth()
    fig_clipping()
    fig_viewport()
    fig_edge_functions()
    print("barycentrics (a):", fig_barycentric())
    fig_persp_correct()
    fig_zbuffer()
    fig_aliasing()
