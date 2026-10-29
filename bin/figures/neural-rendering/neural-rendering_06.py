"""Figures for neural-rendering post 06: from phone capture to VR.

Run from the repository root:  python3 bin/figures/neural-rendering/neural-rendering_06.py
Writes SVGs to assets/img/blog/neural-rendering/06-*.svg (and PNG previews if PREVIEW_DIR is set).

Conventions: plots of 3D scenes use a z-up world frame; cameras use the OpenCV / COLMAP
convention of the post (x right, y down, looking along +z). Every figure is computed from a toy
scene with NumPy (ray casting, projection, DLT triangulation, the post's clean() thresholds).
"""
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/neural-rendering"
PREVIEW = os.environ.get("PREVIEW_DIR")


def out(fig, name):
    if PREVIEW:
        pathlib.Path(PREVIEW).mkdir(parents=True, exist_ok=True)
        fig.savefig(pathlib.Path(PREVIEW) / (name + ".png"), dpi=70)
    save(fig, OUT / (name + ".svg"))


# ----------------------------------------------------------------------------- camera helpers
def lookat(C, target, up=(0.0, 0.0, 1.0)):
    """World-to-camera rotation (rows: right, down, forward), OpenCV convention."""
    f = np.asarray(target, float) - C
    f /= np.linalg.norm(f)
    r = np.cross(f, up)
    r /= np.linalg.norm(r)
    d = np.cross(f, r)
    return np.stack([r, d, f])


def frustum_lines(C, R, hfov_deg, aspect=4 / 3, depth=0.4):
    """Line segments of a camera pyramid (centre to the 4 corners plus the image rectangle)."""
    tx = np.tan(np.radians(hfov_deg) / 2)
    ty = tx / aspect
    corners = [np.array([sx * tx, sy * ty, 1.0]) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    P = [C + depth * R.T @ c for c in corners]
    segs = [(C, p) for p in P] + [(P[i], P[(i + 1) % 4]) for i in range(4)]
    return segs, P


def draw_frustum(ax, C, R, color, hfov=60, depth=0.35, lw=1.0, alpha=0.9):
    segs, P = frustum_lines(C, R, hfov, depth=depth)
    for a, b in segs:
        ax.plot(*zip(a, b), color=color, lw=lw, alpha=alpha)
    # mark the "top" edge (camera -y) so the orientation is visible
    ax.plot(*zip(P[0], P[1]), color=C_("dark"), lw=lw * 1.6, alpha=alpha)


def C_(k):
    return C[k]


def sphere_mesh(ax, center, r, color, alpha=0.25, n=24):
    u, v = np.meshgrid(np.linspace(0, 2 * np.pi, n), np.linspace(0, np.pi, n // 2))
    x = center[0] + r * np.cos(u) * np.sin(v)
    y = center[1] + r * np.sin(u) * np.sin(v)
    z = center[2] + r * np.cos(v)
    ax.plot_surface(x, y, z, color=color, alpha=alpha, linewidth=0, shade=True)


def clean3d(ax):
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
    for a in (ax.xaxis, ax.yaxis, ax.zaxis):
        a.pane.set_alpha(0.0)


# ============================================================================ 1. pipeline diagram
def fig_pipeline():
    stages = [
        (dict(en="Capture", zh="采集", ja="撮影"), "input/*.jpg", "§1", C["light"]),
        (dict(en="Poses (COLMAP)", zh="位姿 (COLMAP)", ja="姿勢 (COLMAP)"), "sparse/0/*.bin", "§2", C["c"]),
        (dict(en="Train 3DGS", zh="训练 3DGS", ja="3DGS の学習"), "point_cloud.ply", "§3", C["a"]),
        (dict(en="Clean & convert", zh="清理与转换", ja="クリーンアップと変換"), "scene_clean.ply", "§4", C["b"]),
        (dict(en="Web viewer", zh="网页查看器", ja="Web ビューア"), "index.html", "§5", C["y"]),
        (dict(en="VR (WebXR)", zh="VR (WebXR)", ja="VR (WebXR)"), "Enter VR", "§6", C["z"]),
    ]
    tools = ["phone / ffmpeg", "extractor, matcher\nmapper, undistorter",
             "train.py / gsplat\n/ splatfacto", "clean_ply.py\nSuperSplat", "Spark + three.js", "headset browser\nadb reverse"]
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(10, 6.2))
        ax.set_xlim(0, 3); ax.set_ylim(0, 2); ax.axis("off")
        # 3 x 2 snake layout, read left-to-right then right-to-left (keeps it legible on phones)
        pos = [(0.5, 1.5), (1.5, 1.5), (2.5, 1.5), (2.5, 0.5), (1.5, 0.5), (0.5, 0.5)]
        for i, ((name, art, sec, col), tool, (x, y)) in enumerate(zip(stages, tools, pos)):
            box = FancyBboxPatch((x - 0.43, y - 0.36), 0.86, 0.72, boxstyle="round,pad=0.02,rounding_size=0.06",
                                 fc=col, ec=C["dark"], lw=1.6, alpha=0.22)
            ax.add_patch(box)
            ax.add_patch(FancyBboxPatch((x - 0.43, y - 0.36), 0.86, 0.72, boxstyle="round,pad=0.02,rounding_size=0.06",
                                        fc="none", ec=col, lw=2.4))
            ax.text(x - 0.38, y + 0.27, f"{i + 1}", fontsize=14, color=col, weight="bold", va="center")
            ax.text(x + 0.38, y + 0.27, sec, fontsize=13, color=C["gray"], ha="right", va="center")
            ax.text(x, y + 0.13, name[lang], ha="center", va="center", fontsize=16, weight="bold", color=C["dark"])
            ax.text(x, y - 0.04, tool, ha="center", va="top", fontsize=11.5, color=C["gray"], linespacing=1.15)
            ax.text(x, y - 0.31, art, ha="center", va="center", fontsize=12, family="monospace", color=col)
        arrows = [((0.95, 1.5), (1.05, 1.5)), ((1.95, 1.5), (2.05, 1.5)), ((2.5, 1.12), (2.5, 0.88)),
                  ((2.05, 0.5), (1.95, 0.5)), ((1.05, 0.5), (0.95, 0.5))]
        for a, b in arrows:
            ax.annotate("", xy=b, xytext=a, arrowprops=dict(arrowstyle="-|>", lw=2.4, color=C["dark"], mutation_scale=20))
        out(fig, f"06-pipeline_{lang}")


# ============================================================================ 2. capture paths
SPHERE_C = np.array([0.0, 0.0, 0.0])
SPHERE_R = 0.6


def surface_samples(n=1500, seed=0):
    """Points and normals on the object (a sphere resting on a table: z > -0.35)."""
    rng = np.random.default_rng(seed)
    v = rng.normal(size=(n * 2, 3))
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    v = v[v[:, 2] > -0.35 / SPHERE_R][:n]
    return SPHERE_C + SPHERE_R * v, v


def visible(P, N, C, R, hfov=60, aspect=4 / 3):
    """Front-facing and inside the image (the sphere is convex, so this is exact)."""
    front = np.einsum("ij,ij->i", N, C - P) > 0
    Xc = (P - C) @ R.T
    tx = np.tan(np.radians(hfov) / 2)
    ok = Xc[:, 2] > 1e-6
    inside = ok & (np.abs(Xc[:, 0] / np.maximum(Xc[:, 2], 1e-9)) < tx) & (np.abs(Xc[:, 1] / np.maximum(Xc[:, 2], 1e-9)) < tx / aspect)
    return front & inside


def coverage(P, N, cams, min_angle=5.0):
    """Fraction of surface points seen by two cameras whose rays meet at >= min_angle degrees."""
    vis = np.stack([visible(P, N, C, R) for C, R in cams])  # (ncam, npts)
    good = np.zeros(len(P), bool)
    for k in range(len(P)):
        idx = np.nonzero(vis[:, k])[0]
        if len(idx) < 2:
            continue
        rays = np.stack([cams[i][0] for i in idx]) - P[k]
        rays /= np.linalg.norm(rays, axis=1, keepdims=True)
        cosmin = (rays @ rays.T).min()
        good[k] = np.degrees(np.arccos(np.clip(cosmin, -1, 1))) >= min_angle
    return good


def capture_rigs():
    rigs = {}
    # good: three orbits (low / eye level / above) of 40 photos each = 120 photos
    cams = []
    for h, r in ((-0.15, 2.0), (0.5, 2.0), (1.5, 1.6)):
        for phi in np.linspace(0, 2 * np.pi, 40, endpoint=False):
            Cc = np.array([r * np.cos(phi), r * np.sin(phi), h])
            cams.append((Cc, lookat(Cc, SPHERE_C)))
    rigs["orbit"] = cams
    # bad 1: pure rotation from one spot (panning across the object), 40 photos
    Cc = np.array([2.0, 0.0, 0.5])
    cams = []
    for yaw in np.radians(np.linspace(-25, 25, 40)):
        tgt = Cc + np.array([-np.cos(yaw), np.sin(yaw), -0.2])
        cams.append((Cc.copy(), lookat(Cc, tgt)))
    rigs["rotate"] = cams
    # bad 2: one straight pass on one side, always facing the same direction, 40 photos
    cams = []
    for y in np.linspace(-1.8, 1.8, 40):
        Cc = np.array([2.0, y, 0.5])
        cams.append((Cc, lookat(Cc, Cc + np.array([-1.0, 0.0, -0.25]))))
    rigs["line"] = cams
    return rigs


def fig_capture_paths():
    P, N = surface_samples()
    rigs = capture_rigs()
    covs = {k: coverage(P, N, v) for k, v in rigs.items()}
    titles = {
        "orbit": dict(en="3 orbits (good)", zh="3 圈环绕（好）", ja="3 周の周回（良い）"),
        "rotate": dict(en="rotate in place (bad)", zh="原地旋转（差）", ja="その場で回転（悪い）"),
        "line": dict(en="one straight pass (bad)", zh="单条直线（差）", ja="1 本の直線（悪い）"),
    }
    cols = {"orbit": C["y"], "rotate": C["x"], "line": C["b"]}
    for lang in LANGS:
        fig = plt.figure(figsize=(10, 4.0))
        for i, key in enumerate(("orbit", "rotate", "line")):
            ax = fig.add_subplot(1, 3, i + 1, projection="3d")
            cams = rigs[key]
            good = covs[key]
            ax.scatter(*P[~good].T, s=4, color=C["gray"], alpha=0.35, depthshade=False, rasterized=True)
            ax.scatter(*P[good].T, s=5, color=C["a"], alpha=0.9, depthshade=False, rasterized=True)
            step = 2 if key == "orbit" else 3
            for Cc, R in cams[::step]:
                draw_frustum(ax, Cc, R, cols[key], hfov=60, depth=0.6 if key == "rotate" else 0.32, lw=0.8)
            centers = np.stack([c for c, _ in cams])
            ax.scatter(*centers.T, s=6, color=cols[key], depthshade=False)
            ax.set_xlim(-2.0, 2.2); ax.set_ylim(-2.0, 2.0); ax.set_zlim(-0.9, 1.8)
            ax.set_box_aspect((4.2, 4.0, 2.7), zoom=1.5)
            ax.view_init(elev=22, azim=-62)
            ax.set_axis_off()
            ax.set_title(titles[key][lang] + f"\n{100 * good.mean():.0f}%", fontsize=20, y=1.0)
        fig.subplots_adjust(left=0, right=1, wspace=0.0, top=0.86, bottom=-0.12)
        fig.set_dpi(200)  # rasterized point layers stay sharp, SVG stays small
        out(fig, f"06-capture-paths_{lang}")
    return {k: v.mean() for k, v in covs.items()}


# ============================================================================ 3. overlap vs step
ROOM_R, FLOOR, CEIL = 5.0, -0.6, 2.4


def raycast(o, d):
    """First hit of rays (o + t d) with the toy room: sphere object, floor, ceiling, cylinder wall."""
    o = np.broadcast_to(o, d.shape)
    t = np.full(len(d), np.inf)
    # sphere
    oc = o - SPHERE_C
    b = np.einsum("ij,ij->i", oc, d)
    c = np.einsum("ij,ij->i", oc, oc) - SPHERE_R ** 2
    disc = b * b - c
    m = disc > 0
    ts = -b[m] - np.sqrt(disc[m])
    ts = np.where(ts > 1e-6, ts, np.inf)
    t[m] = np.minimum(t[m], ts)
    # floor / ceiling
    for zp, sgn in ((FLOOR, -1), (CEIL, 1)):
        m = d[:, 2] * sgn > 1e-9
        tp = (zp - o[m, 2]) / d[m, 2]
        t[m] = np.minimum(t[m], np.where(tp > 1e-6, tp, np.inf))
    # cylinder wall (from inside)
    a = d[:, 0] ** 2 + d[:, 1] ** 2
    bb = o[:, 0] * d[:, 0] + o[:, 1] * d[:, 1]
    cc = o[:, 0] ** 2 + o[:, 1] ** 2 - ROOM_R ** 2
    tw = (-bb + np.sqrt(np.maximum(bb * bb - a * cc, 0))) / np.maximum(a, 1e-12)
    t = np.minimum(t, np.where(a > 1e-12, tw, np.inf))
    return t


def pixel_rays(R, hfov=60, aspect=4 / 3, nx=64):
    ny = int(round(nx / aspect))
    tx = np.tan(np.radians(hfov) / 2)
    xs = (np.arange(nx) + 0.5) / nx * 2 - 1
    ys = (np.arange(ny) + 0.5) / ny * 2 - 1
    X, Y = np.meshgrid(xs * tx, ys * tx / aspect)
    dc = np.stack([X.ravel(), Y.ravel(), np.ones(X.size)], -1)
    dw = dc @ R  # R.T @ dc for each row
    return dw / np.linalg.norm(dw, axis=1, keepdims=True)


def overlap(C1, R1, C2, R2, hfov=60):
    d = pixel_rays(R1, hfov)
    t = raycast(C1, d)
    X = C1 + t[:, None] * d
    Xc = (X - C2) @ R2.T
    tx = np.tan(np.radians(hfov) / 2)
    z = Xc[:, 2]
    inside = (z > 1e-6) & (np.abs(Xc[:, 0] / z) < tx) & (np.abs(Xc[:, 1] / z) < tx * 3 / 4)
    v = X - C2
    dist = np.linalg.norm(v, axis=1)
    t2 = raycast(C2, v / dist[:, None])
    unocc = t2 > dist - 1e-3
    return np.mean(inside & unocc)


def orbit_cam(phi, r=2.0, h=0.3):
    Cc = np.array([r * np.cos(phi), r * np.sin(phi), h])
    return Cc, lookat(Cc, SPHERE_C)


def fig_overlap():
    steps = np.arange(1, 61)
    curves = {}
    for r in (1.5, 2.0, 3.0):
        C1, R1 = orbit_cam(0.0, r)
        curves[r] = np.array([overlap(C1, R1, *orbit_cam(np.radians(s), r)) for s in steps])
    res = {}
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(9, 5.2))
        ax.axhspan(0.6, 0.8, color=C["y"], alpha=0.15)
        ax.text(59, 0.7, "60–80%", ha="right", va="center", color=C["y"], fontsize=15, weight="bold")
        for (r, ov), col in zip(curves.items(), (C["x"], C["a"], C["z"])):
            ax.plot(steps, ov, color=col, lw=2.6, label=f"r = {r:g}")
            ok = steps[(ov >= 0.6) & (ov <= 0.8)]
            res[r] = (ok.min(), ok.max()) if len(ok) else None
            if len(ok):
                ax.plot([ok.min(), ok.max()], [0.03 + 0.04 * list(curves).index(r)] * 2, color=col, lw=6, solid_capstyle="butt")
        ax.set_xlim(0, 60); ax.set_ylim(0, 1.0)
        ax.set_xlabel(label(lang, en="angle between consecutive photos  Δφ (°)", zh="相邻两张照片的夹角  Δφ (°)",
                            ja="連続する写真の間の角度  Δφ (°)"))
        ax.set_ylabel(label(lang, en="overlap with previous photo", zh="与上一张照片的重叠比例", ja="直前の写真との重なり"))
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{100 * v:.0f}%"))
        top = ax.secondary_xaxis("top", functions=(lambda s: 360 / np.maximum(s, 1e-3), lambda n: 360 / np.maximum(n, 1e-3)))
        top.set_xticks([60, 30, 20, 12, 9, 6])
        top.set_xlabel(label(lang, en="photos per orbit  360°/Δφ", zh="每圈照片数  360°/Δφ", ja="1 周あたりの枚数  360°/Δφ"))
        ax.legend(loc="lower left", bbox_to_anchor=(0.0, 0.14), fontsize=14, frameon=False)
        out(fig, f"06-overlap_{lang}")
    return res


# ============================================================================ 4. blur score
def laplacian_var(g):
    """cv2.Laplacian(g, CV_64F) with ksize=1 uses the kernel [[0,1,0],[1,-4,1],[0,1,0]] (reflect-101 border)."""
    p = np.pad(g.astype(np.float64), 1, mode="reflect")
    lap = p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] - 4 * p[1:-1, 1:-1]
    return lap.var()


def motion_blur(img, L, angle):
    """Average of the image shifted along a line of length L pixels (a linear motion-blur kernel)."""
    if L < 1:
        return img
    n = max(int(np.ceil(L)), 1) * 2 + 1
    acc = np.zeros_like(img)
    for s in np.linspace(-L / 2, L / 2, n):
        dx, dy = s * np.cos(angle), s * np.sin(angle)
        ix, fx = int(np.floor(dx)), dx - np.floor(dx)
        iy, fy = int(np.floor(dy)), dy - np.floor(dy)
        a = np.roll(img, (iy, ix), (0, 1))
        b = np.roll(img, (iy, ix + 1), (0, 1))
        c = np.roll(img, (iy + 1, ix), (0, 1))
        d = np.roll(img, (iy + 1, ix + 1), (0, 1))
        acc += (1 - fy) * ((1 - fx) * a + fx * b) + fy * ((1 - fx) * c + fx * d)
    return acc / n


def toy_texture(n=160, seed=3):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:n, 0:n] / n
    img = 0.5 + 0.18 * np.sign(np.sin(2 * np.pi * 6 * x) * np.sin(2 * np.pi * 6 * y))
    for _ in range(12):
        k = rng.uniform(4, 30, 2)
        img += 0.06 * np.sin(2 * np.pi * (k[0] * x + k[1] * y) + rng.uniform(0, 6.3))
    for _ in range(25):  # a few small "features"
        cx, cy, r = rng.uniform(0.05, 0.95, 2).tolist() + [rng.uniform(0.01, 0.04)]
        img[(x - cx) ** 2 + (y - cy) ** 2 < r * r] = rng.uniform(0.05, 0.95)
    return np.clip(img, 0, 1)


def fig_blur():
    rng = np.random.default_rng(7)
    base = toy_texture()
    nframes = 60  # 30 s of walking at 2 frames per second
    blur = np.abs(rng.normal(0, 0.8, nframes))
    jerk = rng.choice(nframes, 7, replace=False)  # moments of fast camera motion
    blur[jerk] += rng.uniform(3, 7, len(jerk))
    frames, scores = [], []
    for i in range(nframes):
        shifted = np.roll(base, (int(3 * np.sin(i / 5)), 2 * i), (0, 1))
        f = motion_blur(shifted, blur[i], rng.uniform(0, np.pi))
        g = np.round(255 * f)  # 8-bit grayscale like cv2.imread(..., IMREAD_GRAYSCALE)
        frames.append(g)
        scores.append(laplacian_var(g))
    scores = np.array(scores)
    order = np.argsort(scores)
    worst = order[: max(1, nframes // 10)]  # the post's "blurriest 10%"
    picks = [order[-1], order[nframes // 2], order[0]]
    fig = plt.figure(figsize=(10, 6.4))
    gs = fig.add_gridspec(2, 3, height_ratios=[1.0, 1.15], hspace=0.35, wspace=0.08)
    for j, k in enumerate(picks):
        a = fig.add_subplot(gs[0, j])
        a.imshow(frames[k][:96, :96], cmap="gray", vmin=0, vmax=255, interpolation="nearest")
        a.set_xticks([]); a.set_yticks([]); a.grid(False)
        for s in a.spines.values():
            s.set_visible(True); s.set_color(C["x"] if k in worst else C["y"]); s.set_linewidth(3)
        a.set_title(f"#{k}:  {scores[k]:.0f}", fontsize=14)
    ax = fig.add_subplot(gs[1, :])
    cols = [C["x"] if i in worst else C["a"] for i in range(nframes)]
    ax.bar(np.arange(nframes), scores, color=cols, width=0.8)
    thr = scores[order[len(worst) - 1]]
    ax.axhline(thr, color=C["x"], lw=1.6, ls="--")
    ax.set_xlabel("frame")
    ax.set_ylabel(r"Var$(\nabla^2 I)$")
    ax.set_xlim(-1, nframes)
    out(fig, "06-blur-score")
    return blur[worst].min(), blur[np.setdiff1d(np.arange(nframes), worst)].max()


# ============================================================================ 5. toy COLMAP sparse model
BOX_LO, BOX_HI = np.array([-0.45, -0.45, -0.6]), np.array([0.45, 0.45, -0.1])
BALL_C, BALL_R = np.array([0.0, 0.0, 0.32]), 0.42


def seg_blocked(Cc, P):
    """Is the segment Cc->P blocked by the ball or the pedestal before reaching P?"""
    d = P - Cc
    L = np.linalg.norm(d, axis=1)
    d = d / L[:, None]
    oc = Cc - BALL_C
    b = d @ oc
    c = oc @ oc - BALL_R ** 2
    disc = b * b - c
    tb = np.where(disc > 0, -b - np.sqrt(np.maximum(disc, 0)), np.inf)
    blocked = (tb > 1e-6) & (tb < L - 1e-4)
    with np.errstate(divide="ignore", invalid="ignore"):
        t1 = (BOX_LO - Cc) / d
        t2 = (BOX_HI - Cc) / d
    tmin = np.nanmax(np.minimum(t1, t2), axis=1)
    tmax = np.nanmin(np.maximum(t1, t2), axis=1)
    hitbox = (tmax >= tmin) & (tmin > 1e-6) & (tmin < L - 1e-4)
    return blocked | hitbox


def toy_scene_points(seed=1):
    rng = np.random.default_rng(seed)
    pts, nrm, grp = [], [], []
    v = rng.normal(size=(700, 3)); v /= np.linalg.norm(v, axis=1, keepdims=True)
    v = v[v[:, 2] > -0.6]
    pts.append(BALL_C + BALL_R * v); nrm.append(v); grp += [0] * len(v)
    for axis in range(3):
        for side in (0, 1):
            if axis == 2 and side == 0:
                continue  # bottom face rests on the floor
            n = 90
            p = rng.uniform(BOX_LO, BOX_HI, (n, 3))
            p[:, axis] = (BOX_LO, BOX_HI)[side][axis]
            nn = np.zeros((n, 3)); nn[:, axis] = 1 if side else -1
            pts.append(p); nrm.append(nn); grp += [1] * n
    r = np.sqrt(rng.uniform(0, 1, 900)) * 2.2
    th = rng.uniform(0, 2 * np.pi, 900)
    p = np.stack([r * np.cos(th), r * np.sin(th), np.full(900, -0.6)], -1)
    keep = ~((np.abs(p[:, 0]) < 0.45) & (np.abs(p[:, 1]) < 0.45))
    pts.append(p[keep]); nrm.append(np.tile([0, 0, 1.0], (keep.sum(), 1))); grp += [2] * keep.sum()
    return np.concatenate(pts), np.concatenate(nrm), np.array(grp)


FOC, W, H = 1000.0, 1600, 1200  # pixels; hfov = 2 atan(800/1000) = 77 deg


def project(Pw, Cc, R):
    Xc = (Pw - Cc) @ R.T
    uv = FOC * Xc[:, :2] / Xc[:, 2:3] + np.array([W / 2, H / 2])
    return uv, Xc[:, 2]


def triangulate(Ps, uvs):
    """Linear (DLT) triangulation from 3x4 projection matrices and pixel observations."""
    A = []
    for Pm, (u, v) in zip(Ps, uvs):
        A.append(u * Pm[2] - Pm[0])
        A.append(v * Pm[2] - Pm[1])
    _, _, Vt = np.linalg.svd(np.asarray(A))
    X = Vt[-1]
    return X[:3] / X[3]


def fig_colmap():
    rng = np.random.default_rng(11)
    P, N, G = toy_scene_points()
    K = np.array([[FOC, 0, W / 2], [0, FOC, H / 2], [0, 0, 1]])
    cams = []
    for h, r, n in ((0.3, 2.4, 24), (1.4, 2.0, 18)):
        for phi in np.linspace(0, 2 * np.pi, n, endpoint=False) + 0.1 * h:
            Cc = np.array([r * np.cos(phi), r * np.sin(phi), h])
            cams.append((Cc, lookat(Cc, np.array([0, 0, -0.1]))))
    obs = [[] for _ in range(len(P))]
    sigma = 0.5  # pixel noise of the feature detector
    for ci, (Cc, R) in enumerate(cams):
        uv, z = project(P, Cc, R)
        inimg = (z > 0) & (uv[:, 0] >= 0) & (uv[:, 0] < W) & (uv[:, 1] >= 0) & (uv[:, 1] < H)
        front = np.einsum("ij,ij->i", N, Cc - P) > 0
        vis = inimg & front & ~seg_blocked(Cc, P)
        for k in np.nonzero(vis)[0]:
            obs[k].append((ci, uv[k] + rng.normal(0, sigma, 2)))
    Pmats = [K @ np.hstack([R, (-R @ Cc)[:, None]]) for Cc, R in cams]
    Xs, tl, errs, grp = [], [], [], []
    for k, o in enumerate(obs):
        if len(o) < 3:  # like COLMAP's default, keep tracks seen in >= 3 images
            continue
        X = triangulate([Pmats[ci] for ci, _ in o], [uv for _, uv in o])
        Xs.append(X); tl.append(len(o)); grp.append(G[k])
        for ci, uv in o:
            pr, _ = project(X[None], *cams[ci])
            errs.append(np.linalg.norm(pr[0] - uv))
    Xs, tl, errs = np.array(Xs), np.array(tl), np.array(errs)
    for lang in LANGS:
        fig = plt.figure(figsize=(10, 5.0))
        ax = fig.add_axes([0.0, 0.08, 0.52, 0.92], projection="3d")
        sc = ax.scatter(*Xs.T, c=np.minimum(tl, 25), cmap="viridis", s=5, depthshade=False, rasterized=True)
        for Cc, R in cams:
            draw_frustum(ax, Cc, R, C["x"], hfov=77, depth=0.28, lw=0.8)
        ax.set_xlim(-2.3, 2.3); ax.set_ylim(-2.3, 2.3); ax.set_zlim(-0.8, 1.6)
        ax.set_box_aspect((4.6, 4.6, 2.4), zoom=1.3); ax.view_init(elev=28, azim=-55)
        ax.set_axis_off()
        cax = fig.add_axes([0.1, 0.1, 0.32, 0.03])
        cb = fig.colorbar(sc, cax=cax, orientation="horizontal")
        cb.set_label(label(lang, en="images observing each point", zh="观测到该点的图像数", ja="各点を観測した画像の数"), fontsize=13)
        ax2 = fig.add_axes([0.6, 0.18, 0.38, 0.72])
        ax2.hist(errs, bins=np.linspace(0, 2.0, 41), color=C["a"], alpha=0.85)
        ax2.axvline(errs.mean(), color=C["dark"], lw=2.2)
        ax2.text(errs.mean() + 0.04, ax2.get_ylim()[1] * 0.92, f"{label(lang, en='mean', zh='均值', ja='平均')} {errs.mean():.2f} px", fontsize=14)
        ax2.axvline(1.0, color=C["x"], lw=2.2, ls="--")
        ax2.text(1.04, ax2.get_ylim()[1] * 0.7, "1 px", color=C["x"], fontsize=14)
        ax2.set_xlabel(label(lang, en="reprojection error (px)", zh="重投影误差 (px)", ja="再投影誤差 (px)"))
        ax2.set_yticks([])
        fig.set_dpi(200)
        out(fig, f"06-colmap-sparse_{lang}")
    return len(cams), len(Xs), errs.mean(), tl.mean()


# ============================================================================ 6. registration gap
def fig_gap():
    rng = np.random.default_rng(5)
    wall = np.stack([rng.uniform(-1, 13, 4000), np.zeros(4000), rng.uniform(0, 2.5, 4000)], -1)
    wn = np.tile([0, 1.0, 0], (4000, 1))

    def cams_at(xs):
        out_ = []
        for x in xs:
            Cc = np.array([x, 2.0, 1.4])
            out_.append((Cc, lookat(Cc, Cc + np.array([0, -1.0, 0]))))
        return out_

    xs_all = np.arange(0.5, 11.51, 0.25)
    gap = (xs_all > 4.9) & (xs_all < 7.6)
    configs = {"gap": xs_all[~gap], "bridged": xs_all}
    res = {}
    fig, axes = plt.subplots(2, 2, figsize=(10, 7.2), gridspec_kw=dict(width_ratios=[1.6, 1.0]))
    for row, (name, xs) in enumerate(configs.items()):
        cams = cams_at(xs)
        vis = np.stack([visible(wall, wn, Cc, R, hfov=60) for Cc, R in cams])
        inter = vis.astype(float) @ vis.T.astype(float)
        cnt = vis.sum(1)
        share = inter / np.minimum.outer(cnt, cnt)
        adj = share >= 0.2
        # connected components of the co-visibility graph (what incremental SfM can chain together)
        comp = -np.ones(len(cams), int)
        c = 0
        for s in range(len(cams)):
            if comp[s] >= 0:
                continue
            stack = [s]
            comp[s] = c
            while stack:
                i = stack.pop()
                for j in np.nonzero(adj[i] & (comp < 0))[0]:
                    comp[j] = c
                    stack.append(j)
            c += 1
        res[name] = c
        palette = [C["z"], C["b"], C["y"]]
        ax = axes[row, 0]
        ax.plot([-1, 13], [0, 0], color=C["dark"], lw=5, solid_capstyle="butt")
        tx = np.tan(np.radians(30))
        for (Cc, R), k in zip(cams, comp):
            col = palette[k % 3]
            ax.fill([Cc[0], Cc[0] - 2 * tx, Cc[0] + 2 * tx], [2, 0, 0], color=col, alpha=0.05, lw=0)
            ax.plot([Cc[0], Cc[0] - 0.25], [2, 2.35], color=col, lw=0)  # keep limits
            ax.plot(Cc[0], 2.0, "v", color=col, ms=7)
        for k in range(c):
            xk = xs[comp == k]
            ax.text(xk.mean(), 2.45, f"sparse/{k}", ha="center", color=palette[k % 3], fontsize=14, family="monospace")
        ax.set_xlim(-1, 13); ax.set_ylim(-0.3, 2.9)
        ax.set_aspect("equal")
        ax.set_yticks([0, 2]); ax.set_xlabel("x (m)" if row else "")
        ax.set_ylabel("y (m)")
        ax2 = axes[row, 1]
        ax2.imshow(share, cmap="Purples", vmin=0, vmax=1, interpolation="nearest")
        ax2.set_xticks([]); ax2.set_yticks([]); ax2.grid(False)
        ax2.set_xlabel("$j$" if row else ""); ax2.set_ylabel("$i$")
    fig.tight_layout()
    out(fig, "06-registration-gap")
    return res


# ============================================================================ 7. .ply layout
def fig_ply():
    groups = [("x y z", 3, C["dark"], ""), ("nx ny nz", 3, C["gray"], "unused"),
              ("f_dc_0..2", 3, C["b"], r"$0.5+C_0\,f_{dc}$"), ("f_rest_0..44", 45, C["light"], "SH 1–3"),
              ("opacity", 1, C["a"], r"$\sigma(\cdot)$"), ("scale_0..2", 3, C["y"], r"$\exp(\cdot)$"),
              ("rot_0..3", 4, C["z"], r"$q/\Vert q\Vert$")]
    unused = dict(en="unused", zh="未使用", ja="未使用")
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(10, 5.6))
        ax.axis("off")
        total = sum(g[1] for g in groups)
        x = 0
        for i, (name, n, col, act) in enumerate(groups):
            for k in range(n):
                ax.add_patch(Rectangle((x + k, 0), 1, 1.6, fc=col, ec="white", lw=0.8, alpha=0.85))
            # table row below the bar
            ty = -1.2 - 1.0 * i
            ax.add_patch(Rectangle((2, ty - 0.35), 2.2, 0.7, fc=col, alpha=0.85, ec="none"))
            ax.plot([x + n / 2, x + n / 2], [0, -0.35], color=col, lw=2)
            ax.text(6, ty, name, va="center", fontsize=14, family="monospace", color=C["dark"])
            ax.text(28, ty, f"{n}", va="center", ha="right", fontsize=14, color=C["dark"])
            sub = unused[lang] if act == "unused" else act
            ax.text(32, ty, sub, va="center", fontsize=15, color=C["dark"])
            x += n
        ax.text(total / 2, 2.25, f"{total} × float32 = {4 * total} B / Gaussian    "
                + label(lang, en="(1M Gaussians ≈ 248 MB)", zh="（100 万个高斯 ≈ 248 MB）", ja="（100 万個のガウシアン ≈ 248 MB）"),
                ha="center", va="center", fontsize=15)
        ax.set_xlim(-0.5, total + 0.5); ax.set_ylim(-8.0, 2.7)
        out(fig, f"06-ply-layout_{lang}")
    return total


# ============================================================================ 8. cleaning
def clean(xyz, opacity, scales, min_opacity=0.02, max_scale_pct=99.5, keep_radius_pct=99.0):
    """The post's clean(): the same three tests, also returning which test removed each Gaussian."""
    center = np.median(xyz, 0)
    dist = np.linalg.norm(xyz - center, axis=1)
    k_op = opacity > min_opacity
    k_sc = scales.max(1) < np.percentile(scales.max(1), max_scale_pct)
    k_di = dist < np.percentile(dist, keep_radius_pct)
    return k_op & k_sc & k_di, k_op, k_sc, k_di, dist


def fig_clean():
    rng = np.random.default_rng(21)
    n_obj = 18000
    # object: Gaussians on a sphere and a box-like base, mostly opaque and small
    v = rng.normal(size=(n_obj, 3)); v /= np.linalg.norm(v, axis=1, keepdims=True)
    obj = np.where(rng.uniform(size=(n_obj, 1)) < 0.6, v * 0.6, rng.uniform(-0.8, 0.8, (n_obj, 3)) * [1, 1, 0.3] - [0, 0, 0.75])
    obj_op = rng.beta(5, 1.5, n_obj)
    obj_sc = np.exp(rng.normal(np.log(0.012), 0.45, (n_obj, 3)))
    # floaters close to the cameras (orbit radius 2): semi-transparent, low opacity
    nf = 900
    ang = rng.uniform(0, 2 * np.pi, nf)
    fl = np.stack([1.6 * np.cos(ang), 1.6 * np.sin(ang), rng.uniform(-0.2, 0.8, nf)], -1) + rng.normal(0, 0.12, (nf, 3))
    fl_op = rng.uniform(0.0, 0.03, nf)
    fl_sc = np.exp(rng.normal(np.log(0.03), 0.5, (nf, 3)))
    # a few huge blobs and far-away outliers (background the optimizer could not explain)
    nb = 120
    bl = rng.normal(0, 0.9, (nb, 3))
    bl_op = rng.uniform(0.1, 0.9, nb)
    bl_sc = np.exp(rng.normal(np.log(0.6), 0.3, (nb, 3)))
    no = 260
    d = rng.normal(size=(no, 3)); d /= np.linalg.norm(d, axis=1, keepdims=True)
    ou = d * rng.uniform(4, 12, (no, 1))
    ou_op = rng.uniform(0.05, 0.9, no)
    ou_sc = np.exp(rng.normal(np.log(0.05), 0.5, (no, 3)))
    xyz = np.concatenate([obj, fl, bl, ou]); op = np.concatenate([obj_op, fl_op, bl_op, ou_op])
    sc = np.concatenate([obj_sc, fl_sc, bl_sc, ou_sc])
    keep, k_op, k_sc, k_di, dist = clean(xyz, op, sc)
    reason = np.where(~k_op, 1, np.where(~k_sc, 2, np.where(~k_di, 3, 0)))
    names = {
        1: dict(en="opacity ≤ 0.02", zh="不透明度 ≤ 0.02", ja="不透明度 ≤ 0.02"),
        2: dict(en="largest 0.5% scale", zh="尺度最大的 0.5%", ja="スケール上位 0.5%"),
        3: dict(en="farthest 1%", zh="最远的 1%", ja="最も遠い 1%"),
        0: dict(en="kept", zh="保留", ja="保持"),
    }
    cols = {0: C["gray"], 1: C["x"], 2: C["b"], 3: C["z"]}
    stats = (len(xyz), int(keep.sum()), [(reason == r).sum() for r in (1, 2, 3)])
    for lang in LANGS:
        fig = plt.figure(figsize=(10, 5.4))
        gs = fig.add_gridspec(3, 2, width_ratios=[1.25, 1.0], hspace=0.9, wspace=0.25)
        ax = fig.add_subplot(gs[:, 0])
        for r in (0, 1, 2, 3):
            m = reason == r
            ax.scatter(xyz[m, 0], xyz[m, 1], s=1.5 if r == 0 else 9, color=cols[r], alpha=0.35 if r == 0 else 0.9,
                       label=f"{names[r][lang]}  ({m.sum()})", lw=0, rasterized=(r == 0))
        ax.set_xlim(-6, 6); ax.set_ylim(-6, 6); ax.set_aspect("equal")
        ax.set_xlabel("x"); ax.set_ylabel("y")
        ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.13), fontsize=12, markerscale=2.5, frameon=False, ncol=2,
                  handletextpad=0.2, columnspacing=0.8)
        a1 = fig.add_subplot(gs[0, 1])
        a1.hist(op, bins=np.linspace(0, 1, 51), color=C["gray"])
        a1.axvline(0.02, color=C["x"], lw=2.2)
        a1.set_yscale("log"); a1.set_xlabel(label(lang, en="opacity  σ(logit)", zh="不透明度  σ(logit)", ja="不透明度  σ(logit)"), fontsize=13)
        a2 = fig.add_subplot(gs[1, 1])
        ms = sc.max(1)
        a2.hist(np.log10(ms), bins=50, color=C["gray"])
        a2.axvline(np.log10(np.percentile(ms, 99.5)), color=C["b"], lw=2.2)
        a2.set_yscale("log"); a2.set_xlabel(r"$\log_{10}$ max-scale", fontsize=13)
        a3 = fig.add_subplot(gs[2, 1])
        a3.hist(dist, bins=50, color=C["gray"])
        a3.axvline(np.percentile(dist, 99.0), color=C["z"], lw=2.2)
        a3.set_yscale("log"); a3.set_xlabel(label(lang, en="distance to median centre", zh="到中位数中心的距离", ja="中央値中心からの距離"), fontsize=13)
        for a in (a1, a2, a3):
            a.tick_params(labelsize=11)
        fig.set_dpi(200)  # resolution of the rasterized layer of 18k kept points (keeps the SVG small)
        out(fig, f"06-clean_{lang}")
    return stats


# ============================================================================ 9. y-down to y-up
def house_points():
    """A small scene in a COLMAP-like frame: y points DOWN (floor at y = +1, roof towards -y)."""
    segs = []
    fl = [(-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)]
    top = [(x, -0.2, z) for x, _, z in fl]
    for i in range(4):
        segs.append((fl[i], fl[(i + 1) % 4], "floor"))
        segs.append((top[i], top[(i + 1) % 4], "wall"))
        segs.append((fl[i], top[i], "wall"))
        segs.append((top[i], (0, -1.0, 0), "roof"))
    return [(np.array(a, float), np.array(b, float), k) for a, b, k in segs]


def fig_updown():
    Rx = np.diag([1.0, -1.0, -1.0])  # three.js quaternion (x, y, z, w) = (1, 0, 0, 0): 180 deg about x
    q = np.array([1.0, 0, 0, 0])  # (x, y, z, w)
    x, y, z, w = q
    Rq = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                   [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                   [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    assert np.allclose(Rq, Rx)
    segs = house_points()
    colk = {"floor": C["b"], "wall": C["dark"], "roof": C["x"]}
    # a camera of the capture, upright in the real world: its y axis (down) along +y of the COLMAP frame
    camC = np.array([0.0, 0.0, 2.6])
    camR = lookat(camC, np.array([0, 0.0, 0]), up=(0, -1.0, 0))  # world "up" is -y in COLMAP
    for lang in LANGS:
        fig = plt.figure(figsize=(10, 5.0))
        titles = [label(lang, en="COLMAP frame shown y-up", zh="COLMAP 坐标直接按 y 朝上显示", ja="COLMAP 座標をそのまま y 上向きで表示"),
                  label(lang, en="after splat.quaternion = (1,0,0,0)", zh="应用 splat.quaternion = (1,0,0,0) 之后",
                        ja="splat.quaternion = (1,0,0,0) を適用後")]
        for i, Rm in enumerate((np.eye(3), Rx)):
            ax = fig.add_subplot(1, 2, i + 1, projection="3d")
            # draw with three.js axes: x right, y up, z towards the viewer -> matplotlib (x, -z, y)
            M = lambda p: np.array([p[0], -p[2], p[1]])  # noqa: E731
            for a, b, k in segs:
                A, B = M(Rm @ a), M(Rm @ b)
                ax.plot(*zip(A, B), color=colk[k], lw=2.4)
            fp = [M(Rm @ np.array(p, float)) for p in [(-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)]]
            ax.add_collection3d(Poly3DCollection([fp], color=C["b"], alpha=0.25))
            Cw = Rm @ camC
            Rw = camR @ Rm.T  # world-to-camera after rotating the world
            segsF, _ = frustum_lines(Cw, Rw, 60, depth=0.7)
            for a, b in segsF:
                ax.plot(*zip(M(a), M(b)), color=C["a"], lw=1.4)
            # camera "down" axis (+y_cam) in world
            down = Rw.T @ np.array([0, 1.0, 0])
            ax.quiver(*M(Cw), *M(0.6 * down), color=C["a"], lw=2, arrow_length_ratio=0.25)
            ax.text(*(M(Cw + 0.75 * down)), r"$y_{cam}$", color=C["a"], fontsize=14)
            o = np.array([-1.9, -1.9, -1.5])
            for v, c_, t in (((1.2, 0, 0), C["x"], "x"), ((0, 0, 1.2), C["y"], "y"), ((0, -1.2, 0), C["z"], "z")):
                ax.quiver(*o, *v, color=c_, lw=2.2, arrow_length_ratio=0.2)
                ax.text(*(o + 1.25 * np.array(v)), f"${t}$", color=c_, fontsize=15)
            ax.set_xlim(-2, 2); ax.set_ylim(-2, 2); ax.set_zlim(-1.5, 1.8)
            ax.set_box_aspect((4, 4, 3.3)); ax.view_init(elev=14, azim=-62)
            clean3d(ax)
            ax.set_title(titles[i], fontsize=14)
        fig.subplots_adjust(left=0, right=1, wspace=0.0)
        out(fig, f"06-y-down-to-y-up_{lang}")


# ============================================================================ 10. VR stereo
IPD = 0.063  # m, average adult interpupillary distance


def fig_stereo():
    zs = np.linspace(0.3, 10, 400)

    def disp_arcmin(z_true, k=1.0):
        z = k * z_true  # a world scaled by k puts every point at k times its true depth
        return np.degrees(2 * np.arctan(IPD / (2 * z))) * 60

    for lang in LANGS:
        fig, (a, b) = plt.subplots(1, 2, figsize=(10, 4.8), gridspec_kw=dict(width_ratios=[0.85, 1.25]))
        # (a) top view, exaggerated horizontal axis around the eyes
        P = np.array([0.0, 0.6])
        for sx, col, nm in ((-1, C["z"], "L"), (1, C["x"], "R")):
            e = np.array([sx * IPD / 2, 0.0])
            a.plot([e[0], P[0]], [e[1], P[1]], color=col, lw=2)
            a.plot(*e, "o", color=col, ms=9)
            a.text(e[0] + sx * 0.012, -0.07, nm, color=col, ha="center", fontsize=15, weight="bold")
        a.plot(*P, "*", color=C["dark"], ms=16)
        a.annotate("", xy=(IPD / 2, -0.13), xytext=(-IPD / 2, -0.13), arrowprops=dict(arrowstyle="<->", lw=1.6))
        a.text(0, -0.2, "IPD = 63 mm", ha="center", fontsize=14)
        a.text(0.012, 0.62, r"$z$", fontsize=16)
        a.set_xlim(-0.16, 0.16); a.set_ylim(-0.26, 0.9)
        a.set_xticks([-0.1, 0, 0.1]); a.set_xlabel("x (m)"); a.set_ylabel("z (m)")
        # (b) angular disparity vs true depth, and what a wrong SfM scale does to it
        for k, col, nm in ((1.0, C["dark"], label(lang, en="correct scale", zh="尺度正确", ja="正しいスケール")),
                           (0.25, C["b"], label(lang, en="scene ×0.25 (doll house)", zh="场景 ×0.25（玩偶屋）", ja="シーン ×0.25（ドールハウス）")),
                           (4.0, C["z"], label(lang, en="scene ×4 (cathedral)", zh="场景 ×4（大教堂）", ja="シーン ×4（大聖堂）"))):
            b.plot(zs, disp_arcmin(zs, k), color=col, lw=2.6, label=nm)
        b.set_yscale("log")
        b.set_xlabel(label(lang, en="true depth z (m)", zh="真实深度 z (m)", ja="真の奥行き z (m)"))
        b.set_ylabel(label(lang, en="disparity (arcmin)", zh="视差角（角分）", ja="視差角（分角）"))
        b.legend(fontsize=13, frameon=False, loc="upper right")
        fig.tight_layout()
        out(fig, f"06-vr-stereo_{lang}")
    return disp_arcmin(np.array([1.0, 2.0, 5.0]))


if __name__ == "__main__":
    fig_pipeline()
    print("coverage", fig_capture_paths())
    print("overlap 60-80% steps", fig_overlap())
    print("blur (min blur in flagged, max blur in kept)", fig_blur())
    print("colmap (cams, pts, mean err, mean track)", fig_colmap())
    print("components", fig_gap())
    print("ply floats", fig_ply())
    print("clean (n, kept, by reason)", fig_clean())
    fig_updown()
    print("disparity arcmin at 1,2,5 m", fig_stereo())
