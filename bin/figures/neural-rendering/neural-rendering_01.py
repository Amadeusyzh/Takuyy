"""Figures for neural-rendering post 01: cameras and multi-view geometry.

Run from the repository root:
    python3 bin/figures/neural-rendering/neural-rendering_01.py

Conventions (as in the post): OpenCV / COLMAP camera frame, x right, y down, z forward
(right-handed). The world frame of the post's toy scene uses the same axes, so world "up" is -y.
In every 3D plot we draw a vector v = (x, y, z) at plot position (x, z, -y), so that "down" in the
data is drawn downwards and the viewing direction +z goes into the page.
All numbers come from the post's own code (K, look_at, project, eight_point, triangulate,
pose_from_essential, ba_residuals), which is copied verbatim below.
"""
import os, sys, pathlib

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

plt.rcParams["svg.hashsalt"] = "neural-rendering-01"  # stable element ids

import numpy as np  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402
from scipy.optimize import least_squares  # noqa: E402
from scipy.sparse import lil_matrix  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/neural-rendering"
PREV = None  # set to a folder to also write PNG previews
if len(sys.argv) > 1 and sys.argv[1] != "-":
    PREV = pathlib.Path(sys.argv[1])


def out(fig, name):
    if PREV is not None:
        PREV.mkdir(parents=True, exist_ok=True)
        fig.savefig(PREV / (name.replace(".svg", ".png")), dpi=70)
    save(fig, OUT / name)


# --------------------------------------------------------------------------------------------
# The post's code (section 1.4, 2.2, 3, 4), verbatim
# --------------------------------------------------------------------------------------------
def look_at(C, target, up=np.array([0.0, -1.0, 0.0])):
    """World-to-camera (R, t) in the OpenCV convention: x right, y down, z forward."""
    z = target - C; z /= np.linalg.norm(z)
    x = np.cross(z, up); x /= np.linalg.norm(x)   # (the post's corrected version)
    y = np.cross(z, x)
    R = np.stack([x, y, z])
    t = -R @ C
    return R, t


def project(K, R, t, X, dist=None):
    Xc = X @ R.T + t
    x, y = Xc[:, 0] / Xc[:, 2], Xc[:, 1] / Xc[:, 2]
    if dist is not None:
        k1, k2, p1, p2, k3 = dist
        r2 = x * x + y * y
        radial = 1 + k1 * r2 + k2 * r2**2 + k3 * r2**3
        x, y = (x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x),
                y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y)
    u = K[0, 0] * x + K[0, 1] * y + K[0, 2]
    v = K[1, 1] * y + K[1, 2]
    return np.stack([u, v], axis=1), Xc[:, 2]


W, H, fov = 640, 480, np.deg2rad(60)
f = W / (2 * np.tan(fov / 2))
K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])

rng = np.random.default_rng(0)
X = rng.uniform(-1, 1, size=(200, 3))
C1_true, C2_true = np.array([0.0, -0.5, -4.0]), np.array([2.0, -0.8, -3.5])
R1, t1 = look_at(C1_true, np.zeros(3))
R2, t2 = look_at(C2_true, np.zeros(3))
x1, d1 = project(K, R1, t1, X)
x2, d2 = project(K, R2, t2, X)


def normalize(pts):
    c = pts.mean(0)
    s = np.sqrt(2) / np.linalg.norm(pts - c, axis=1).mean()
    T = np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])
    ph = np.c_[pts, np.ones(len(pts))] @ T.T
    return ph, T


def eight_point(x1, x2):
    p1, T1 = normalize(x1)
    p2, T2 = normalize(x2)
    A = np.einsum("ni,nj->nij", p2, p1).reshape(-1, 9)
    F = np.linalg.svd(A)[2][-1].reshape(3, 3)
    U, S, Vt = np.linalg.svd(F)
    F = U @ np.diag([S[0], S[1], 0]) @ Vt
    F = T2.T @ F @ T1
    return F / np.linalg.norm(F)


noise = rng.normal(scale=0.5, size=x1.shape)
F_est = eight_point(x1 + noise, x2)


def triangulate(P1, P2, x1, x2):
    Xs = []
    for (u1, v1), (u2, v2) in zip(x1, x2):
        A = np.stack([u1 * P1[2] - P1[0], v1 * P1[2] - P1[1],
                      u2 * P2[2] - P2[0], v2 * P2[2] - P2[1]])
        Xh = np.linalg.svd(A)[2][-1]
        Xs.append(Xh[:3] / Xh[3])
    return np.array(Xs)


def pose_from_essential(E, K, x1, x2):
    U, _, Vt = np.linalg.svd(E)
    if np.linalg.det(U) < 0: U = -U
    if np.linalg.det(Vt) < 0: Vt = -Vt
    Wm = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]])
    P1 = K @ np.c_[np.eye(3), np.zeros(3)]
    best = None
    for R in (U @ Wm @ Vt, U @ Wm.T @ Vt):
        for t in (U[:, 2], -U[:, 2]):
            P2 = K @ np.c_[R, t]
            Xt = triangulate(P1, P2, x1, x2)
            n_front = ((Xt[:, 2] > 0) & ((Xt @ R.T + t)[:, 2] > 0)).sum()
            if best is None or n_front > best[0]:
                best = (n_front, R, t, Xt)
    return best[1:]


def rodrigues(r):
    th = np.linalg.norm(r)
    if th < 1e-12: return np.eye(3)
    k = r / th
    Kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + np.sin(th) * Kx + (1 - np.cos(th)) * Kx @ Kx


def axis_angle(R):
    th = np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1))
    if th < 1e-12: return np.zeros(3)
    return th / (2 * np.sin(th)) * np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])


def ba_residuals(params, n_cams, n_pts, cam_idx, pt_idx, obs, K):
    cams = params[:n_cams * 6].reshape(n_cams, 6)
    pts = params[n_cams * 6:].reshape(n_pts, 3)
    res = np.empty((len(obs), 2))
    for c in range(n_cams):
        m = cam_idx == c
        uv, _ = project(K, rodrigues(cams[c, :3]), cams[c, 3:], pts[pt_idx[m]])
        res[m] = uv - obs[m]
    return res.ravel()


def ba_sparsity(n_cams, n_pts, cam_idx, pt_idx):
    A = lil_matrix((2 * len(cam_idx), 6 * n_cams + 3 * n_pts), dtype=int)
    i = np.arange(len(cam_idx))
    for k in range(6):
        A[2 * i, 6 * cam_idx + k] = 1; A[2 * i + 1, 6 * cam_idx + k] = 1
    for k in range(3):
        A[2 * i, 6 * n_cams + 3 * pt_idx + k] = 1; A[2 * i + 1, 6 * n_cams + 3 * pt_idx + k] = 1
    return A


def skew(v):
    return np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])


# --------------------------------------------------------------------------------------------
# 3D drawing helpers: data (x, y-down, z-forward) -> plot (x, z, -y)
# --------------------------------------------------------------------------------------------
def P(v):
    v = np.asarray(v, float)
    return np.stack([v[..., 0], v[..., 2], -v[..., 1]], axis=-1)


def line(ax, a, b, **kw):
    a, b = P(a), P(b)
    ax.plot([a[0], b[0]], [a[1], b[1]], [a[2], b[2]], **kw)


def arrow(ax, start, vec, color, text=None, lw=2.5, toff=1.12, fs=16):
    s, v = P(start), P(vec)
    ax.quiver(*s, *v, color=color, linewidth=lw, arrow_length_ratio=0.15)
    if text:
        ax.text(*(s + v * toff), text, color=color, fontsize=fs, ha="center", va="center")


def text3(ax, p, s, **kw):
    ax.text(*P(p), s, **kw)


def poly(ax, pts, fc, ec="none", alpha=0.25, lw=1.0):
    pc = Poly3DCollection([P(np.asarray(pts))], facecolor=fc, edgecolor=ec, alpha=alpha, linewidths=lw)
    ax.add_collection3d(pc)


def frustum(ax, R, t, depth, color, lw=1.6, fill=True, alpha=0.12):
    """Camera pyramid: centre and the image rectangle at depth `depth` (world coordinates)."""
    Cw = -R.T @ t
    cs = np.array([[0, 0], [W, 0], [W, H], [0, H]], float)
    Kinv = np.linalg.inv(K)
    corners = [Cw + R.T @ (Kinv @ np.r_[c, 1.0]) * depth for c in cs]
    for c in corners:
        line(ax, Cw, c, color=color, lw=lw)
    for i in range(4):
        line(ax, corners[i], corners[(i + 1) % 4], color=color, lw=lw)
    if fill:
        poly(ax, corners, color, alpha=alpha)
    return Cw, corners


def setup3d(ax, center, radius, elev=18, azim=-60, zoom=1.35):
    c = P(center)
    ax.set_xlim(c[0] - radius, c[0] + radius)
    ax.set_ylim(c[1] - radius, c[1] + radius)
    ax.set_zlim(c[2] - radius, c[2] + radius)
    ax.set_box_aspect((1, 1, 1), zoom=zoom)
    ax.view_init(elev=elev, azim=azim)
    ax.set_axis_off()


# --------------------------------------------------------------------------------------------
# Fig 1: pinhole projection in 3D + the resulting pixel
# --------------------------------------------------------------------------------------------
def fig_pinhole():
    Xc = np.array([0.6, -0.3, 2.5])
    xn = Xc / Xc[2]
    uv = K[:2, :2] @ xn[:2] + K[:2, 2]
    hw, hh = W / 2 / f, H / 2 / f  # half extents of the image rectangle on the plane Z_c = 1

    fig = plt.figure(figsize=(15, 6.4))
    gs = fig.add_gridspec(1, 2, width_ratios=[1.35, 1])
    ax = fig.add_subplot(gs[0, 0], projection="3d")
    O = np.zeros(3)
    corners = [np.array([sx * hw, sy * hh, 1.0]) for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    poly(ax, corners, C["fill"], ec=C["a"], alpha=0.35, lw=1.8)
    for c in corners:
        line(ax, O, c, color=C["gray"], lw=0.8, ls=":")
    # camera axes
    arrow(ax, O, [0.4, 0, 0], C["x"], "$x_c$", toff=1.3)
    arrow(ax, O, [0, 0.35, 0], C["y"], "$y_c$", toff=1.35)
    arrow(ax, O, [0, 0, 0.45], C["z"], None)
    line(ax, [0, 0, 0.45], [0, 0, 3.0], color=C["z"], lw=1.2, ls="--")
    text3(ax, [0, -0.08, 3.12], "$z_c$", color=C["z"], fontsize=17)
    # pixel axes u, v start at the top-left image corner
    tl = corners[0]
    arrow(ax, tl, [0.3, 0, 0], C["dark"], None, lw=1.8)
    text3(ax, tl + [0.3, -0.1, 0], "$u$", fontsize=16)
    arrow(ax, tl, [0, 0.25, 0], C["dark"], None, lw=1.8)
    text3(ax, tl + [-0.1, 0.28, 0], "$v$", fontsize=16)
    # ray, point, projection
    line(ax, O, Xc, color=C["b"], lw=2.4)
    ax.scatter(*P(Xc), color=C["b"], s=70, depthshade=False)
    text3(ax, Xc + [0.0, -0.22, 0], r"$\mathbf{X}_c=(X_c,Y_c,Z_c)$", color=C["b"], fontsize=16, ha="center")
    ax.scatter(*P(xn), color=C["a"], s=60, depthshade=False)
    text3(ax, xn + [0.0, -0.2, 0], r"$(x,y,1)$", color=C["a"], fontsize=15, ha="center")
    ax.scatter(*P([0, 0, 1]), color=C["dark"], s=40, depthshade=False)
    text3(ax, [0.02, 0.1, 1], "$(c_x,c_y)$", color=C["dark"], fontsize=14)
    ax.scatter(*P(O), color="k", s=50, depthshade=False)
    text3(ax, [-0.12, -0.12, 0], r"$\mathbf{C}$", fontsize=18)
    # focal length: dimension line along the optical axis, below the image
    yb = hh + 0.3
    line(ax, [0, yb, 0], [0, yb, 1], color=C["dark"], lw=1.6)
    for zz in (0, 1):
        line(ax, [0, yb - 0.05, zz], [0, yb + 0.05, zz], color=C["dark"], lw=1.6)
    line(ax, [0, 0.4, 0], [0, yb, 0], color=C["gray"], lw=0.8, ls=":")
    line(ax, [0, hh, 1], [0, yb, 1], color=C["gray"], lw=0.8, ls=":")
    text3(ax, [0, yb + 0.15, 0.5], "$f$", fontsize=18, ha="center")
    text3(ax, [hw + 0.05, hh, 1], "$Z_c=1$", color=C["a"], fontsize=14)
    setup3d(ax, [0.0, 0.05, 1.45], 1.3, elev=16, azim=-36, zoom=1.55)

    # right: the image in pixels
    ax2 = fig.add_subplot(gs[0, 1])
    ax2.add_patch(plt.Rectangle((0, 0), W, H, fc=C["fill"], ec=C["a"], lw=2))
    ax2.plot(*uv, "o", color=C["a"], ms=11)
    ax2.plot([K[0, 2]], [K[1, 2]], "+", color=C["dark"], ms=16, mew=2.5)
    ax2.plot([uv[0], uv[0]], [0, uv[1]], ls="--", color=C["gray"], lw=1.4)
    ax2.plot([0, uv[0]], [uv[1], uv[1]], ls="--", color=C["gray"], lw=1.4)
    ax2.annotate("", xy=(uv[0], K[1, 2]), xytext=(K[0, 2], K[1, 2]),
                 arrowprops=dict(arrowstyle="->", color=C["x"], lw=2))
    ax2.text((uv[0] + K[0, 2]) / 2 + 10, K[1, 2] - 14, r"$f_x\,X_c/Z_c$", color=C["x"], ha="center", fontsize=15)
    ax2.annotate("", xy=(K[0, 2], uv[1]), xytext=(K[0, 2], K[1, 2]),
                 arrowprops=dict(arrowstyle="->", color=C["y"], lw=2))
    ax2.text(K[0, 2] - 12, (uv[1] + K[1, 2]) / 2, r"$f_y\,Y_c/Z_c$", color=C["y"], ha="right", va="center", fontsize=15)
    ax2.text(K[0, 2] - 60, K[1, 2] + 45, "$(c_x,c_y)=(320,240)$", fontsize=14)
    ax2.text(uv[0] + 14, uv[1] - 14, f"$(u,v)=({uv[0]:.1f},{uv[1]:.1f})$", color=C["a"], fontsize=15)
    ax2.set_xlim(-10, W + 10); ax2.set_ylim(H + 10, -10)
    ax2.set_aspect("equal")
    ax2.set_xlabel("$u$ (px)"); ax2.set_ylabel("$v$ (px)")
    ax2.xaxis.set_label_position("top"); ax2.xaxis.tick_top()
    ax2.spines["top"].set_visible(True); ax2.spines["bottom"].set_visible(False)
    ax2.set_xticks([0, 160, 320, 480, 640]); ax2.set_yticks([0, 120, 240, 360, 480])
    fig.subplots_adjust(wspace=0.02)
    out(fig, "01-pinhole.svg")
    return uv


# --------------------------------------------------------------------------------------------
# Fig 2: the post's two cameras, their extrinsics and the OpenCV vs OpenGL axes
# --------------------------------------------------------------------------------------------
def fig_extrinsics():
    fig = plt.figure(figsize=(15, 5.4))
    gs = fig.add_gridspec(1, 2, width_ratios=[1.4, 1])
    ax = fig.add_subplot(gs[0, 0], projection="3d")
    ax.scatter(*P(X).T, s=6, color=C["gray"], alpha=0.5, depthshade=False)
    arrow(ax, [0, 0, 0], [1.5, 0, 0], C["x"], "$X$", lw=2.4)
    arrow(ax, [0, 0, 0], [0, 1.5, 0], C["y"], "$Y$", lw=2.4)
    arrow(ax, [0, 0, 0], [0, 0, 1.5], C["z"], "$Z$", lw=2.4)
    for i, (R, t, col) in enumerate([(R1, t1, C["a"]), (R2, t2, C["b"])], 1):
        Cw, _ = frustum(ax, R, t, 1.3, col, lw=1.8)
        for row, c, name in zip(R, (C["x"], C["y"], C["z"]), "xyz"):
            arrow(ax, Cw, 0.8 * row, c, None, lw=2.6)
        ax.scatter(*P(Cw), color=col, s=60, depthshade=False)
        text3(ax, Cw + np.array([-0.15, -0.45, 0.0]), rf"$\mathbf{{C}}_{i}$", color=col, fontsize=18, ha="center")
    setup3d(ax, [0.8, -0.3, -1.9], 2.4, elev=28, azim=-24, zoom=1.5)

    # right: one camera in both conventions
    ax2 = fig.add_subplot(gs[0, 1], projection="3d")
    for k, (shift, flip, name) in enumerate([(-1.1, 1, "OpenCV / COLMAP"), (1.1, -1, "OpenGL / Blender")]):
        o = np.array([shift, 0, 0])
        corners = [o + np.array([sx * 0.42, sy * 0.32, 0.9]) for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
        for c in corners:
            line(ax2, o, c, color=C["gray"], lw=1.2)
        poly(ax2, corners, C["gray"], ec=C["gray"], alpha=0.12)
        arrow(ax2, o, [0.6, 0, 0], C["x"], "$x$", toff=1.25)
        arrow(ax2, o, [0, 0.6 * flip, 0], C["y"], "$y$", toff=1.25)
        arrow(ax2, o, [0, 0, 0.75 * flip], C["z"], "$z$", toff=1.25)
        text3(ax2, o + [0, -1.0, 0.45], name, fontsize=14, ha="center")
    setup3d(ax2, [0, 0.1, 0.2], 1.6, elev=18, azim=-62, zoom=1.3)
    fig.subplots_adjust(0, 0, 1, 1, wspace=0.0)
    out(fig, "01-extrinsics.svg")


# --------------------------------------------------------------------------------------------
# Fig 3: Brown-Conrady distortion of a grid
# --------------------------------------------------------------------------------------------
def fig_distortion():
    cases = [((-0.2, 0, 0, 0, 0), r"$k_1=-0.2$"), ((0.2, 0, 0, 0, 0), r"$k_1=+0.2$"),
             ((0, 0, 0.02, 0.02, 0), r"$p_1=p_2=0.02$")]
    us = np.linspace(0, W, 9); vs = np.linspace(0, H, 7)
    dense = np.linspace(0, 1, 50)
    fig, axs = plt.subplots(1, 3, figsize=(15, 4.4))
    for ax, (dist, title) in zip(axs, cases):
        def warp(uv):
            xn = np.c_[(uv[:, 0] - K[0, 2]) / f, (uv[:, 1] - K[1, 2]) / f, np.ones(len(uv))]
            return project(K, np.eye(3), np.zeros(3), xn, dist)[0]
        for u in us:
            pts = np.c_[np.full_like(dense, u), dense * H]
            ax.plot(*pts.T, color=C["gray"], lw=0.8, alpha=0.6)
            ax.plot(*warp(pts).T, color=C["z"], lw=1.8)
        for v in vs:
            pts = np.c_[dense * W, np.full_like(dense, v)]
            ax.plot(*pts.T, color=C["gray"], lw=0.8, alpha=0.6)
            ax.plot(*warp(pts).T, color=C["z"], lw=1.8)
        ax.plot([K[0, 2]], [K[1, 2]], "+", color=C["x"], ms=14, mew=2.5)
        ax.set_xlim(-130, W + 130); ax.set_ylim(H + 110, -110)
        ax.set_aspect("equal"); ax.set_title(title)
        ax.set_xticks([0, 320, 640]); ax.set_yticks([0, 240, 480])
        ax.grid(False)
    fig.tight_layout()
    out(fig, "01-distortion.svg")


# --------------------------------------------------------------------------------------------
# Fig 4/5: epipolar geometry in 3D and in both images (ground-truth poses)
# --------------------------------------------------------------------------------------------
Rrel = R2 @ R1.T
trel = t2 - Rrel @ t1
E_true = skew(trel) @ Rrel
F_true = np.linalg.inv(K).T @ E_true @ np.linalg.inv(K)
e1 = np.linalg.svd(F_true)[2][-1]; e1 = e1 / e1[2]            # F e1 = 0
e2 = np.linalg.svd(F_true.T)[2][-1]; e2 = e2 / e2[2]          # F^T e2 = 0
Cw1, Cw2 = -R1.T @ t1, -R2.T @ t2
assert np.allclose(Cw1, C1_true) and np.allclose(Cw2, C2_true)
# check: the epipole in image 1 is the projection of camera centre 2, and vice versa
assert np.allclose(project(K, R1, t1, Cw2[None])[0][0], e1[:2])
assert np.allclose(project(K, R2, t2, Cw1[None])[0][0], e2[:2])

# three points with well separated epipolar lines: rows near v = 120, 250, 380 in image 1
EPI_IDX = [int(np.argmin(np.abs(x1[:, 1] - v) + 0.3 * np.abs(x1[:, 0] - u)))
           for u, v in ((380, 130), (300, 260), (220, 390))]
EPI_COL = [C["a"], C["b"], C["y"]]


def back(R, t, uv, depth):
    """World point at camera depth `depth` along the pixel ray uv."""
    return -R.T @ t + R.T @ (np.linalg.inv(K) @ np.r_[uv, 1.0]) * depth


def clip_line(l):
    """Segment of the image line l = (a, b, c), a u + b v + c = 0, inside [0, W] x [0, H]."""
    pts = []
    for u in (0, W):
        v = -(l[0] * u + l[2]) / l[1]
        if 0 <= v <= H: pts.append((u, v))
    for v in (0, H):
        u = -(l[1] * v + l[2]) / l[0]
        if 0 <= u <= W: pts.append((u, v))
    return np.array(pts[:2], float)


def fig_epipolar_3d():
    fig = plt.figure(figsize=(10, 7))
    ax = fig.add_subplot(1, 1, 1, projection="3d")
    D = 1.1  # depth at which the image planes are drawn
    j = EPI_IDX[0]
    Xj = X[j]
    poly(ax, [Cw1, Cw2, Xj], C["light"], alpha=0.3)
    line(ax, Cw1, Cw2, color=C["dark"], lw=2.6)
    for (R, t, Cw, col, name, l) in [(R1, t1, Cw1, C["a"], "1", F_true.T @ np.r_[x2[j], 1]),
                                     (R2, t2, Cw2, C["b"], "2", F_true @ np.r_[x1[j], 1])]:
        frustum(ax, R, t, D, col, lw=1.2, alpha=0.1)
        xj = project(K, R, t, Xj[None])[0][0]
        pj = back(R, t, xj, D)
        line(ax, Cw, Xj, color=col, lw=2.2)
        ax.scatter(*P(pj), color=col, s=60, depthshade=False)
        text3(ax, pj + [0.0, -0.22, 0], rf"$\mathbf{{x}}_{name}$", color=col, fontsize=18, ha="center")
        seg = clip_line(l)
        a3, b3 = back(R, t, seg[0], D), back(R, t, seg[1], D)
        line(ax, a3, b3, color=col, lw=2.6, ls="--")
        ax.scatter(*P(Cw), color=col, s=70, depthshade=False)
        text3(ax, Cw + [0.0, 0.3, -0.1], rf"$\mathbf{{C}}_{name}$", color=col, fontsize=18, ha="center")
    ax.scatter(*P(Xj), color=C["dark"], s=80, depthshade=False)
    text3(ax, Xj + [0.12, -0.12, 0], r"$\mathbf{X}$", fontsize=20)
    setup3d(ax, [0.9, -0.3, -2.0], 2.1, elev=42, azim=-48, zoom=1.45)
    fig.subplots_adjust(0, 0, 1, 1)
    out(fig, "01-epipolar-3d.svg")


def fig_epipolar_images():
    fig, axs = plt.subplots(2, 1, figsize=(13, 9.5))
    for k, (ax, xs, name) in enumerate(zip(axs, (x1, x2), ("1", "2"))):
        e = (e1, e2)[k]
        xlo, xhi = min(-80, e[0] - 150), max(W + 80, e[0] + 150)
        ax.add_patch(plt.Rectangle((0, 0), W, H, fc=C["fill"], ec=C["dark"], lw=2, zorder=0))
        ax.plot(*xs.T, ".", color=C["gray"], ms=3, alpha=0.7)
        for j, col in zip(EPI_IDX, EPI_COL):
            # the line in image k induced by the match in the other image
            l = F_true @ np.r_[x1[j], 1] if k == 1 else F_true.T @ np.r_[x2[j], 1]
            us = np.array([xlo, xhi])
            ax.plot(us, -(l[0] * us + l[2]) / l[1], color=col, lw=2)
            ax.plot(*xs[j], "o", color=col, ms=10, mec="k")
        ax.plot(e[0], e[1], "s", color=C["dark"], ms=10)
        ax.text(e[0], e[1] - 45, rf"$\mathbf{{e}}_{name}=({e[0]:.0f},{e[1]:.0f})$", fontsize=16, ha="center")
        ax.text(W / 2, -25, rf"$I_{name}$", fontsize=18, ha="center")
        ax.set_xlim(xlo, xhi)
        ax.set_ylim(H + 150, -150 if k == 0 else -80)
        ax.set_ylim(max(H, e[1]) + 160, min(0, e[1]) - 90)
        ax.set_aspect("equal")
        ax.set_xticks([0, 640] + [round(e[0], -2)]); ax.set_yticks([0, 480])
    fig.tight_layout()
    out(fig, "01-epipolar-images.svg")


# --------------------------------------------------------------------------------------------
# Fig 6: Hartley normalization (before / after) for image 1
# --------------------------------------------------------------------------------------------
def fig_normalization():
    ph, T = normalize(x1 + noise)
    fig, axs = plt.subplots(1, 2, figsize=(13, 5.2))
    a = axs[0]
    a.plot(*(x1 + noise).T, ".", color=C["z"], ms=6)
    c = (x1 + noise).mean(0)
    a.plot(*c, "+", color=C["x"], ms=18, mew=3)
    a.set_xlim(0, W); a.set_ylim(H, 0); a.set_aspect("equal")
    a.set_title(r"$\tilde{\mathbf{x}}_1=(u,v,1)$")
    b = axs[1]
    b.plot(*ph[:, :2].T, ".", color=C["z"], ms=6)
    th = np.linspace(0, 2 * np.pi, 200)
    b.plot(np.sqrt(2) * np.cos(th), np.sqrt(2) * np.sin(th), color=C["x"], lw=1.8, ls="--")
    b.plot(0, 0, "+", color=C["x"], ms=18, mew=3)
    b.text(1.15, 1.45, r"$r=\sqrt{2}$", color=C["x"], fontsize=15)
    b.set_xlim(-3, 3); b.set_ylim(2.6, -2.6); b.set_aspect("equal")
    b.set_title(r"$T_1\,\tilde{\mathbf{x}}_1$")
    fig.tight_layout()
    out(fig, "01-normalization.svg")


# --------------------------------------------------------------------------------------------
# Fig 7: the four (R, t) candidates from E and the cheirality check (top view, camera-1 frame)
# --------------------------------------------------------------------------------------------
def fig_four_poses():
    E = K.T @ F_est @ K
    U, _, Vt = np.linalg.svd(E)
    if np.linalg.det(U) < 0: U = -U
    if np.linalg.det(Vt) < 0: Vt = -Vt
    Wm = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]])
    P1 = K @ np.c_[np.eye(3), np.zeros(3)]
    j = EPI_IDX[0]
    fig, axs = plt.subplots(2, 2, figsize=(10, 10.5), sharex=True, sharey=True)
    axs = axs.ravel()
    k = 0
    for R in (U @ Wm @ Vt, U @ Wm.T @ Vt):
        for t in (U[:, 2], -U[:, 2]):
            ax = axs[k]; k += 1
            P2 = K @ np.c_[R, t]
            Xt = triangulate(P1, P2, x1, x2)
            front = (Xt[:, 2] > 0) & ((Xt @ R.T + t)[:, 2] > 0)
            Cc2 = -R.T @ t
            for Cc, Rc, col, nm in [(np.zeros(3), np.eye(3), C["a"], "1"), (Cc2, R, C["b"], "2")]:
                # draw the camera as a wedge in the x-z plane (top view)
                for s in (-1, 1):
                    d = Rc.T @ np.array([s * 0.5, 0, 1.0]) * 0.55
                    ax.plot([Cc[0], Cc[0] + d[0]], [Cc[2], Cc[2] + d[2]], color=col, lw=2.2)
                fwd = Rc.T @ np.array([0, 0, 1.0]) * 0.75
                ax.annotate("", xy=(Cc[0] + fwd[0], Cc[2] + fwd[2]), xytext=(Cc[0], Cc[2]),
                            arrowprops=dict(arrowstyle="->", color=col, lw=2))
                ax.plot(Cc[0], Cc[2], "o", color=col, ms=8)
            ax.plot(Xt[:, 0], Xt[:, 2], ".", color=C["y"] if front.mean() > 0.5 else C["x"], ms=3, alpha=0.7)
            for Cc in (np.zeros(3), Cc2):
                ax.plot([Cc[0], Xt[j, 0]], [Cc[2], Xt[j, 2]], color=C["gray"], lw=1, ls=":")
            Rn = "UWV^\\top" if k in (1, 2) else "UW^\\top V^\\top"
            tn = "+" if k in (1, 3) else "-"
            ax.set_title(rf"${Rn},\ {tn}\mathbf{{u}}_3$" + "\n" + rf"${front.sum()}/{len(Xt)}$",
                         fontsize=15, color=C["y"] if front.mean() > 0.5 else C["x"])
            ax.set_aspect("equal")
            ax.set_xlabel("$x$")
            ax.set_ylabel("$z$")
    axs[0].set_xlim(-2.2, 2.2); axs[0].set_ylim(-2.6, 2.6)
    fig.tight_layout()
    out(fig, "01-four-poses.svg")


# --------------------------------------------------------------------------------------------
# Fig 8: triangulation uncertainty vs triangulation angle (Monte Carlo with the post's DLT)
# --------------------------------------------------------------------------------------------
def fig_triangulation():
    Xp = np.array([0.0, 0.0, 0.0])
    sigma = 2.0  # pixels (scatter panels)
    rs = np.random.default_rng(1)
    fig = plt.figure(figsize=(13, 5.4))
    gs = fig.add_gridspec(1, 3, width_ratios=[0.8, 0.8, 1.3])
    for k, (C2x, title) in enumerate([(2.0, "wide"), (0.25, "narrow")]):
        ax = fig.add_subplot(gs[0, k])
        Ca, Cb = np.array([0.0, -0.5, -4.0]), np.array([C2x, -0.5, -4.0])
        Ra, ta = look_at(Ca, Xp); Rb, tb = look_at(Cb, Xp)
        Pa, Pb = K @ np.c_[Ra, ta], K @ np.c_[Rb, tb]
        xa = project(K, Ra, ta, Xp[None])[0]; xb = project(K, Rb, tb, Xp[None])[0]
        n = 400
        est = triangulate(Pa, Pb, xa + rs.normal(scale=sigma, size=(n, 2)), xb + rs.normal(scale=sigma, size=(n, 2)))
        ang = np.degrees(np.arccos((Xp - Ca) @ (Xp - Cb) / np.linalg.norm(Xp - Ca) / np.linalg.norm(Xp - Cb)))
        for Cc, col in [(Ca, C["a"]), (Cb, C["b"])]:
            ax.plot([Cc[0], Xp[0] + 1.3 * (Xp[0] - Cc[0])], [Cc[2], Xp[2] + 1.3 * (Xp[2] - Cc[2])], color=col, lw=1.5)
            ax.plot(Cc[0], Cc[2], "o", color=col, ms=9)
        ax.plot(est[:, 0], est[:, 2], ".", color=C["dark"], ms=4, alpha=0.45)
        ax.plot(Xp[0], Xp[2], "*", color=C["light"], ms=16, mec="k")
        ax.set_xlim(-0.5, 0.5); ax.set_ylim(-0.9, 0.9); ax.set_aspect("equal")
        ax.set_title(rf"$\alpha={ang:.1f}^\circ$")
        ax.set_xlabel("$X$"); ax.set_ylabel("$Z$")
    # right: depth error vs triangulation angle
    ax = fig.add_subplot(gs[0, 2])
    xs = np.geomspace(0.03, 4.0, 18)
    angs, errs = [], []
    for C2x in xs:
        Ca, Cb = np.array([0.0, -0.5, -4.0]), np.array([C2x, -0.5, -4.0])
        Ra, ta = look_at(Ca, Xp); Rb, tb = look_at(Cb, Xp)
        Pa, Pb = K @ np.c_[Ra, ta], K @ np.c_[Rb, tb]
        xa = project(K, Ra, ta, Xp[None])[0]; xb = project(K, Rb, tb, Xp[None])[0]
        est = triangulate(Pa, Pb, xa + rs.normal(scale=1.0, size=(1000, 2)), xb + rs.normal(scale=1.0, size=(1000, 2)))
        angs.append(np.degrees(np.arccos((Xp - Ca) @ (Xp - Cb) / np.linalg.norm(Xp - Ca) / np.linalg.norm(Xp - Cb))))
        errs.append(np.median(np.linalg.norm(est - Xp, axis=1)))
    ax.loglog(angs, errs, "o-", color=C["a"])
    ax.axvline(1.5, color=C["x"], ls="--", lw=1.5)
    ax.text(1.65, max(errs) * 0.6, r"$1.5^\circ$", color=C["x"])
    ax.set_xlabel(r"$\alpha$ (deg)"); ax.set_ylabel(r"median $\|\hat{\mathbf{X}}-\mathbf{X}\|$")
    fig.tight_layout()
    out(fig, "01-triangulation.svg")


# --------------------------------------------------------------------------------------------
# Fig 9: bundle adjustment (the post's two-view problem): residuals before / after
# Fig 10: sparsity of J and of J^T J for a small multi-camera problem
# --------------------------------------------------------------------------------------------
def fig_ba():
    E = K.T @ F_est @ K
    R, t, Xt = pose_from_essential(E, K, x1, x2)
    obs = np.r_[x1 + noise, x2]
    cam_idx = np.r_[np.zeros(len(X), int), np.ones(len(X), int)]
    pt_idx = np.r_[np.arange(len(X)), np.arange(len(X))]
    x0 = np.r_[np.zeros(6), axis_angle(R), t, Xt.ravel()]
    args = (2, len(X), cam_idx, pt_idx, obs, K)
    r0 = ba_residuals(x0, *args)
    sol = least_squares(ba_residuals, x0, jac_sparsity=ba_sparsity(2, len(X), cam_idx, pt_idx),
                        x_scale="jac", method="trf", loss="linear", args=args)
    r1 = sol.fun
    rms0, rms1 = np.sqrt(np.mean(r0 ** 2)), np.sqrt(np.mean(r1 ** 2))
    print(f"BA RMS before {rms0:.3f} after {rms1:.3f}")
    R0 = r0.reshape(-1, 2); Rf = r1.reshape(-1, 2)
    for lang in LANGS:
        before = label(lang, en="before BA", zh="BA 之前", ja="BA 前")
        after = label(lang, en="after BA", zh="BA 之后", ja="BA 後")
        fig, axs = plt.subplots(1, 3, figsize=(16, 5.0), gridspec_kw=dict(width_ratios=[1, 1, 0.9]))
        scale = 60
        for ax, res, title in [(axs[0], R0, f"{before}: RMS {rms0:.2f} px"), (axs[1], Rf, f"{after}: RMS {rms1:.2f} px")]:
            m = cam_idx == 0
            ax.add_patch(plt.Rectangle((0, 0), W, H, fc="white", ec=C["dark"], lw=1.5))
            ax.quiver(obs[m, 0], obs[m, 1], res[m, 0], res[m, 1], angles="xy", scale_units="xy",
                      scale=1 / scale, color=C["x"], width=0.004)
            ax.plot(obs[m, 0], obs[m, 1], ".", color=C["dark"], ms=3)
            ax.set_xlim(60, 580); ax.set_ylim(440, 40); ax.set_aspect("equal")
            ax.set_title(title, fontsize=15)
            ax.set_xticks([]); ax.set_yticks([])
        for a_ in axs[:2]:
            a_.set_xlabel(rf"$\mathbf{{r}}_{{ij}}\times{scale}$", color=C["x"], fontsize=16)
        ax = axs[2]
        bins = np.linspace(0, 1.6, 33)
        ax.hist(np.linalg.norm(R0, axis=1), bins=bins, color=C["gray"], alpha=0.7, label=before)
        ax.hist(np.linalg.norm(Rf, axis=1), bins=bins, color=C["a"], alpha=0.8, label=after)
        ax.set_xlabel(r"$\|\pi(\cdot)-\mathbf{x}_{ij}\|$ (px)")
        ax.legend(frameon=False)
        fig.tight_layout()
        out(fig, f"01-ba-residuals_{lang}.svg")
    return rms0, rms1


def fig_ba_sparsity():
    n_cams, n_pts = 4, 12
    rs = np.random.default_rng(3)
    cam_idx, pt_idx = [], []
    for j in range(n_pts):
        seen = sorted(rs.choice(n_cams, size=rs.integers(2, 4), replace=False))
        for c in seen:
            cam_idx.append(c); pt_idx.append(j)
    order = np.lexsort((pt_idx, cam_idx))
    cam_idx, pt_idx = np.array(cam_idx)[order], np.array(pt_idx)[order]
    J = ba_sparsity(n_cams, n_pts, cam_idx, pt_idx).toarray()
    JtJ = (J.T @ J) > 0
    fig, axs = plt.subplots(1, 2, figsize=(14, 6.2), gridspec_kw=dict(width_ratios=[1, 1.15]))
    nc = 6 * n_cams
    for ax, M, title in [(axs[0], J, r"$J$"), (axs[1], JtJ, r"$J^\top J$")]:
        cols = np.zeros(M.shape + (3,)) + 1.0
        rows_, cols_ = np.nonzero(M)
        for r, c in zip(rows_, cols_):
            cols[r, c] = matplotlib.colors.to_rgb(C["z"] if c < nc else C["b"])
            if M is JtJ and r < nc and c < nc:
                cols[r, c] = matplotlib.colors.to_rgb(C["a"])
            if M is JtJ and r >= nc and c < nc:
                cols[r, c] = matplotlib.colors.to_rgb(C["y"])
            if M is JtJ and r < nc and c >= nc:
                cols[r, c] = matplotlib.colors.to_rgb(C["y"])
        ax.imshow(cols, interpolation="nearest", aspect="auto" if M is J else "equal")
        ax.axvline(nc - 0.5, color=C["dark"], lw=1.5)
        if M is JtJ:
            ax.axhline(nc - 0.5, color=C["dark"], lw=1.5)
            n = M.shape[0]
            for txt, (xx, yy) in [("$B$", (nc / 2, nc / 2)), ("$C$", ((nc + n) / 2, nc / 2)),
                                  (r"$C^\top$", (nc / 2, (nc + n) / 2)), ("$P$", ((nc + n) / 2 + 6, (nc + n) / 2 - 6))]:
                ax.text(xx, yy, txt, fontsize=24, ha="center", va="center",
                        bbox=dict(fc="white", ec="none", alpha=0.8))
        ax.set_title(title)
        ax.set_xticks([nc / 2, nc + 3 * n_pts / 2]); ax.set_xticklabels([r"$\delta_c$", r"$\delta_p$"], fontsize=20)
        ax.set_yticks([]); ax.grid(False)
    fig.tight_layout()
    out(fig, "01-ba-sparsity.svg")


# --------------------------------------------------------------------------------------------
# Fig 11: a toy incremental SfM run (two-view init, PnP registration, triangulation, BA)
# --------------------------------------------------------------------------------------------
def pnp_dlt(Xw, uv):
    """Linear PnP with known K: DLT for [R | t] on calibrated coordinates, then re-orthonormalize."""
    xn = np.c_[uv, np.ones(len(uv))] @ np.linalg.inv(K).T
    mu = Xw.mean(0); sc = np.sqrt(3) / np.linalg.norm(Xw - mu, axis=1).mean()   # condition the 3D points
    Xn = (Xw - mu) * sc
    A = []
    for (Xx, Yy, Zz), (u, v, _) in zip(Xn, xn):
        Xh = np.array([Xx, Yy, Zz, 1.0])
        A.append(np.r_[Xh, np.zeros(4), -u * Xh])
        A.append(np.r_[np.zeros(4), Xh, -v * Xh])
    M = np.linalg.svd(np.array(A))[2][-1].reshape(3, 4)
    U_, S_, Vt_ = np.linalg.svd(M[:, :3])
    R = U_ @ Vt_
    t = M[:, 3] / S_.mean()
    if np.linalg.det(R) < 0:
        R, t = -R, -t
    # undo the conditioning: R (sc (X - mu)) + t = sc (R X + t / sc - R mu)
    return R, t / sc - R @ mu


def umeyama(src, dst):
    mu_s, mu_d = src.mean(0), dst.mean(0)
    S, D = src - mu_s, dst - mu_d
    U_, sig, Vt_ = np.linalg.svd(D.T @ S / len(src))
    Sg = np.eye(3)
    if np.linalg.det(U_) * np.linalg.det(Vt_) < 0:
        Sg[2, 2] = -1
    R = U_ @ Sg @ Vt_
    s = np.trace(np.diag(sig) @ Sg) / S.var(0).sum()
    return s, R, mu_d - s * R @ mu_s


def sfm_toy():
    rs = np.random.default_rng(7)
    # object: points on a bumpy sphere; normals for visibility
    n_pts = 400
    d = rs.normal(size=(n_pts, 3)); d /= np.linalg.norm(d, axis=1, keepdims=True)
    rad = 1.0 + 0.15 * np.sin(3 * d[:, 0]) * np.cos(2 * d[:, 2]) + 0.1 * d[:, 1]
    Xg = d * rad[:, None] * np.array([1.0, 0.8, 1.0])
    n_cams = 12
    angs = np.linspace(0, 2 * np.pi, n_cams, endpoint=False)
    cams = []
    for a in angs:
        Cc = np.array([4.0 * np.sin(a), -1.2 - 0.4 * np.sin(2 * a), -4.0 * np.cos(a)])
        cams.append(look_at(Cc, np.zeros(3)))
    obs = {}  # (cam, pt) -> uv
    for c, (R, t) in enumerate(cams):
        Cc = -R.T @ t
        vis = np.einsum("ij,ij->i", d, Cc - Xg) > 0.2
        uv, z = project(K, R, t, Xg)
        inside = (uv[:, 0] > 0) & (uv[:, 0] < W) & (uv[:, 1] > 0) & (uv[:, 1] < H) & (z > 0)
        for j in np.nonzero(vis & inside)[0]:
            obs[(c, j)] = uv[j] + rs.normal(scale=0.5, size=2)

    def seen(c):
        return {j for (cc, j) in obs if cc == c}

    # 1) initialization from cameras 0 and 1 (eight point + cheirality, as in the post)
    common = sorted(seen(0) & seen(1))
    a = np.array([obs[(0, j)] for j in common]); b = np.array([obs[(1, j)] for j in common])
    Fm = eight_point(a, b)
    R, t, Xt = pose_from_essential(K.T @ Fm @ K, K, a, b)
    est_cams = {0: (np.eye(3), np.zeros(3)), 1: (R, t)}
    est_pts = {j: Xt[i] for i, j in enumerate(common)}

    def ba(est_cams, est_pts):
        cl, pl = sorted(est_cams), sorted(est_pts)
        ci = {c: i for i, c in enumerate(cl)}; pi = {j: i for i, j in enumerate(pl)}
        keys = [(c, j) for (c, j) in obs if c in ci and j in pi]
        cam_idx = np.array([ci[c] for c, _ in keys]); pt_idx = np.array([pi[j] for _, j in keys])
        ob = np.array([obs[k] for k in keys])
        x0 = np.r_[np.concatenate([np.r_[axis_angle(est_cams[c][0]), est_cams[c][1]] for c in cl]),
                   np.concatenate([est_pts[j] for j in pl])]
        args = (len(cl), len(pl), cam_idx, pt_idx, ob, K)
        # fix the gauge partly: camera 0 stays at the identity (its 6 parameters are not optimized)
        fixed = x0[:6]
        fun = lambda p: ba_residuals(np.r_[fixed, p], *args)
        sp = ba_sparsity(len(cl), len(pl), cam_idx, pt_idx).tocsc()[:, 6:]
        sol = least_squares(fun, x0[6:], jac_sparsity=sp, x_scale="jac", method="trf",
                            loss="huber", f_scale=1.0, max_nfev=60)
        sol.x = np.r_[fixed, sol.x]
        cp = sol.x[:6 * len(cl)].reshape(-1, 6); pp = sol.x[6 * len(cl):].reshape(-1, 3)
        return ({c: (rodrigues(cp[i, :3]), cp[i, 3:]) for i, c in enumerate(cl)},
                {j: pp[i] for i, j in enumerate(pl)}, np.sqrt(np.mean(sol.fun ** 2)))

    est_cams, est_pts, rms = ba(est_cams, est_pts)
    print(f"SfM toy init: {len(est_pts)} points, RMS after two-view BA {rms:.3f} px")
    snapshots = [(dict(est_cams), dict(est_pts))]

    # 2) register cameras 2, 11, 3, 10, ... (neighbours first), triangulate, local BA
    order = [2, 11, 3, 10, 4, 9, 5, 8, 6, 7]
    for k, c in enumerate(order):
        known = sorted(seen(c) & set(est_pts))
        Xk = np.array([est_pts[j] for j in known]); uk = np.array([obs[(c, j)] for j in known])
        R, t = pnp_dlt(Xk, uk)
        for _ in range(3):  # re-fit on the inliers (a stand-in for PnP inside RANSAC)
            err = np.linalg.norm(project(K, R, t, Xk)[0] - uk, axis=1)
            inl = err < max(4.0, np.percentile(err, 70))
            R, t = pnp_dlt(Xk[inl], uk[inl])
        est_cams[c] = (R, t)
        for c2 in est_cams:
            if c2 == c:
                continue
            new = sorted((seen(c) & seen(c2)) - set(est_pts))
            if not new:
                continue
            Ra, ta = est_cams[c2]; Rb, tb = est_cams[c]
            Xn = triangulate(K @ np.c_[Ra, ta], K @ np.c_[Rb, tb],
                             np.array([obs[(c2, j)] for j in new]), np.array([obs[(c, j)] for j in new]))
            Ca, Cb = -Ra.T @ ta, -Rb.T @ tb
            for j, Xj in zip(new, Xn):
                u1, u2 = Xj - Ca, Xj - Cb
                ang = np.degrees(np.arccos(u1 @ u2 / np.linalg.norm(u1) / np.linalg.norm(u2)))
                if ang > 1.5 and (Ra @ Xj + ta)[2] > 0 and (Rb @ Xj + tb)[2] > 0:
                    est_pts[j] = Xj
        est_cams, est_pts, rms = ba(est_cams, est_pts)
        # filter points with a large reprojection error in any view, then re-run BA
        bad = {j for (cc, j) in obs if cc in est_cams and j in est_pts and
               np.linalg.norm(project(K, *est_cams[cc], est_pts[j][None])[0][0] - obs[(cc, j)]) > 3.0}
        for j in bad:
            del est_pts[j]
        if bad:
            est_cams, est_pts, rms = ba(est_cams, est_pts)
        if k in (1, 5):
            snapshots.append((dict(est_cams), dict(est_pts)))
    snapshots.append((dict(est_cams), dict(est_pts)))
    print(f"SfM toy: {len(est_cams)} cameras, {len(est_pts)} points, final RMS {rms:.3f} px")

    # align the final reconstruction to ground truth with a similarity (gauge freedom)
    pl = sorted(est_pts)
    s, Ra, ta = umeyama(np.array([est_pts[j] for j in pl]), Xg[pl])
    err = np.linalg.norm((s * np.array([est_pts[j] for j in pl]) @ Ra.T + ta) - Xg[pl], axis=1)
    cerr = [np.linalg.norm(s * Ra @ (-est_cams[c][0].T @ est_cams[c][1]) + ta - (-cams[c][0].T @ cams[c][1]))
            for c in est_cams]
    print(f"  after similarity alignment: mean point error {err.mean():.4f}, mean camera-centre error {np.mean(cerr):.4f}")

    for lang in LANGS:
        fig = plt.figure(figsize=(11, 9.5))
        for k, (ec, ep) in enumerate(snapshots):
            ax = fig.add_subplot(2, 2, k + 1, projection="3d")
            pl = sorted(ep)
            est = np.array([ep[j] for j in pl])
            sk, Rk, tk = umeyama(est, Xg[pl])         # each snapshot has its own gauge
            pts = sk * est @ Rk.T + tk
            ax.scatter(*P(pts).T, s=5, c=C["z"], depthshade=False)
            for c in range(n_cams):
                if c in ec:
                    Rc, tc = ec[c]
                    Rw = Rc @ Rk.T                    # aligned rotation (world-to-camera)
                    Cw = sk * Rk @ (-Rc.T @ tc) + tk
                    frustum(ax, Rw, -Rw @ Cw, 0.7, C["a"] if c in (0, 1) else C["b"], lw=1.6, alpha=0.2)
                else:
                    Rg, tg = cams[c]
                    frustum(ax, Rg, tg, 0.7, C["gray"], lw=0.7, fill=False)
            ax.set_title(label(lang, en=f"{len(ec)} cameras, {len(ep)} points",
                               zh=f"{len(ec)} 台相机，{len(ep)} 个点",
                               ja=f"カメラ {len(ec)} 台、点 {len(ep)} 個"), fontsize=16)
            setup3d(ax, [0, -0.7, 0], 3.9, elev=32, azim=-70, zoom=1.4)
        fig.subplots_adjust(0, 0, 1, 0.95, wspace=0, hspace=0.05)
        out(fig, f"01-sfm-toy_{lang}.svg")


# --------------------------------------------------------------------------------------------
# Fig 12: plane sweeping in a 2D world (x-z plane) with 1D cameras: NCC cost vs depth
# --------------------------------------------------------------------------------------------
def fig_plane_sweep():
    # surface z = s(x), texture tex(x); cameras looking along +z
    def surf(x):
        return 3.0 + 0.35 * np.sin(1.3 * x) + 0.15 * x

    tex_rng = np.random.default_rng(5)
    tex_grid = np.arange(-6, 6, 0.03)
    tex_val = tex_rng.normal(size=len(tex_grid))

    def tex(x):  # a random (non-repeating) texture painted on the surface
        return np.interp(x, tex_grid, tex_val)

    fpx, cx, npx = 300.0, 160.0, 320
    cams = {"ref": 0.0, "src": 0.8}   # camera x positions (both at z = 0, no rotation)
    xs_dense = np.linspace(-4, 4, 20001)
    zs_dense = surf(xs_dense)

    def render(cxw):
        # for each pixel, intersect its ray with the surface by sampling
        img = np.zeros(npx)
        us = (xs_dense - cxw) / zs_dense * fpx + cx
        for p in range(npx):
            k = np.argmin(np.abs(us - (p + 0.5)) + 0 * zs_dense)
            img[p] = tex(xs_dense[k])
        return img

    ref, src = render(cams["ref"]), render(cams["src"])
    p0 = 200
    half = 7
    depths = np.linspace(2.0, 4.5, 400)

    def sample(img, u):
        return np.interp(u - 0.5, np.arange(npx), img)

    ncc = []
    patch_ref = ref[p0 - half:p0 + half + 1]
    for dpt in depths:
        # fronto-parallel plane at depth dpt: pixel u in ref -> world x -> pixel in src
        us = np.arange(p0 - half, p0 + half + 1) + 0.5
        xw = (us - cx) / fpx * dpt + cams["ref"]
        usrc = (xw - cams["src"]) / dpt * fpx + cx
        ps = sample(src, usrc)
        a = patch_ref - patch_ref.mean(); b = ps - ps.mean()
        ncc.append(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
    ncc = np.array(ncc)
    # true depth of the reference pixel
    us_ref = (xs_dense - cams["ref"]) / zs_dense * fpx + cx
    ktrue = np.argmin(np.abs(us_ref - (p0 + 0.5)))
    dtrue = zs_dense[ktrue]

    fig, axs = plt.subplots(1, 2, figsize=(15, 5.4), gridspec_kw=dict(width_ratios=[1.1, 1]))
    ax = axs[0]
    m = (xs_dense > -1.8) & (xs_dense < 2.8)
    ax.scatter(xs_dense[m][::9], zs_dense[m][::9], c=tex(xs_dense[m][::9]), cmap="gray", s=22, lw=0, zorder=3)
    for dpt in np.linspace(2.2, 4.4, 9):
        ax.plot([-1.8, 2.8], [dpt, dpt], color=C["c"], lw=1, alpha=0.6)
    xw = (p0 + 0.5 - cx) / fpx * depths[[0, -1]] + cams["ref"]
    ax.plot([cams["ref"], xw[1]], [0, depths[-1]], color=C["a"], lw=2)
    xw_best = (p0 + 0.5 - cx) / fpx * depths[np.argmax(ncc)] + cams["ref"]
    ax.plot([cams["src"], xw_best], [0, depths[np.argmax(ncc)]], color=C["b"], lw=2, ls="--")
    ax.plot(xw_best, depths[np.argmax(ncc)], "o", color=C["x"], ms=10, zorder=5)
    for nm, cxw, col in [("ref", cams["ref"], C["a"]), ("src", cams["src"], C["b"])]:
        ax.plot([cxw - 0.5, cxw, cxw + 0.5], [0.55, 0, 0.55], color=col, lw=2.5)
        ax.text(cxw, -0.35, nm, color=col, ha="center", fontsize=15)
    ax.set_xlim(-1.8, 2.8); ax.set_ylim(-0.6, 4.8); ax.set_aspect("equal")
    ax.set_xlabel("$x$"); ax.set_ylabel("$z$")
    ax = axs[1]
    ax.plot(depths, ncc, color=C["z"])
    ax.axvline(dtrue, color=C["x"], ls="--", lw=1.6)
    ax.text(dtrue + 0.04, -0.9, "$d^*$", color=C["x"], fontsize=18)
    ax.set_xlabel("$d$"); ax.set_ylabel("NCC")
    ax.set_ylim(-1.05, 1.05)
    fig.tight_layout()
    out(fig, "01-plane-sweep.svg")
    print(f"plane sweep: best depth {depths[np.argmax(ncc)]:.3f}, true {dtrue:.3f}")


FIGS = dict(pinhole=lambda: fig_pinhole(), extrinsics=lambda: fig_extrinsics(),
            distortion=lambda: fig_distortion(), epi3d=lambda: fig_epipolar_3d(),
            epiimg=lambda: fig_epipolar_images(), norm=lambda: fig_normalization(),
            four=lambda: fig_four_poses(), tri=lambda: fig_triangulation(), ba=lambda: fig_ba(),
            sparsity=lambda: fig_ba_sparsity(), sfm=lambda: sfm_toy(), sweep=lambda: fig_plane_sweep())

if __name__ == "__main__":
    # usage: neural-rendering_01.py [preview_dir [figure names...]]
    print("f =", f, "camera centres", Cw1, Cw2, "epipoles", e1[:2], e2[:2])
    for name in (sys.argv[2:] or FIGS):
        FIGS[name]()
