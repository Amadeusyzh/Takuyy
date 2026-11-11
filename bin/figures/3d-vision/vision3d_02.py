"""Figures for 3d-vision post 02: camera calibration.

Run from the repository root:
    python3 bin/figures/3d-vision/vision3d_02.py [preview-dir]

Conventions (as in the post): OpenCV camera frame, x right, y down, z forward. In 3D plots a
camera-frame vector (x, y, z) is drawn at plot position (x, z, -y), so "down" is drawn downwards
and the viewing direction goes into the page. The functions marked "post" are copied verbatim
from the post, so every number printed here (and quoted in captions) is what the post's code gives.
Only NumPy, SciPy and Matplotlib are needed (the post's OpenCV cross-checks are not repeated here).
"""
import os
import pathlib
import sys

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

plt.rcParams["svg.hashsalt"] = "3d-vision-02"  # stable element ids

import numpy as np  # noqa: E402
from matplotlib.patches import Ellipse, Polygon  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402
from scipy.ndimage import gaussian_filter, map_coordinates, sobel  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/3d-vision"
PREV = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] != "-" else None


def out(fig, name):
    if PREV is not None:
        PREV.mkdir(parents=True, exist_ok=True)
        fig.savefig(PREV / name.replace(".svg", ".png"), dpi=70)
    save(fig, OUT / name)


# =============================================================================================
# post, section 1: synthetic data
# =============================================================================================
W, H = 640, 480
K_true = np.array([[600.0, 0.0, 322.0],
                   [0.0, 596.0, 236.0],
                   [0.0, 0.0, 1.0]])
dist_true = np.array([-0.28, 0.07, 0.0008, -0.0005, 0.0])   # k1, k2, p1, p2, k3 (OpenCV order)

sq = 0.03
ii, jj = np.meshgrid(np.arange(6), np.arange(9), indexing="ij")
obj = np.stack([jj.ravel() * sq, ii.ravel() * sq, np.zeros(54)], axis=1)   # 54 x 3, metres


def rodrigues(r):
    """Axis-angle vector (3,) -> rotation matrix."""
    th = np.linalg.norm(r)
    if th < 1e-12:
        return np.eye(3)
    k = np.asarray(r, float) / th
    Kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + np.sin(th) * Kx + (1 - np.cos(th)) * Kx @ Kx


def project(K, dist, R, t, X):
    """Board points X (N x 3) -> pixels (N x 2): pinhole + Brown-Conrady distortion."""
    Xc = X @ R.T + t
    x, y = Xc[:, 0] / Xc[:, 2], Xc[:, 1] / Xc[:, 2]
    k1, k2, p1, p2, k3 = dist
    r2 = x * x + y * y
    rad = 1 + k1 * r2 + k2 * r2**2 + k3 * r2**3
    xd = x * rad + 2 * p1 * x * y + p2 * (r2 + 2 * x * x)
    yd = y * rad + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y
    return np.stack([K[0, 0] * xd + K[0, 1] * yd + K[0, 2], K[1, 1] * yd + K[1, 2]], axis=1)


def board_pose(tilt_x, tilt_y, roll, centre):
    """Board-to-camera (R, t): rotate the board about its centre, then move the centre to `centre`."""
    d = np.deg2rad
    R = rodrigues([0, 0, d(roll)]) @ rodrigues([d(tilt_x), 0, 0]) @ rodrigues([0, d(tilt_y), 0])
    return R, np.asarray(centre, float) - R @ obj.mean(axis=0)


POSES = [(0, 0, 0, (0, 0, 0.55)), (0, 0, 0, (0, 0, 0.40)), (0, 0, 20, (0.06, 0.05, 0.80)),
         (0, 35, 0, (0, 0, 0.55)), (0, -35, 0, (0, 0, 0.55)), (35, 0, 0, (0, 0, 0.55)),
         (-35, 0, 0, (0, 0, 0.55)), (20, -25, 10, (-0.16, -0.115, 0.60)),
         (20, 25, -10, (0.16, -0.115, 0.60)), (-20, -25, -10, (-0.16, 0.115, 0.60)),
         (-20, 25, 10, (0.16, 0.115, 0.60)), (25, 20, 40, (0, 0, 0.50))]
views = [board_pose(*p) for p in POSES]

rng = np.random.default_rng(0)
sigma = 0.3
obs = [project(K_true, dist_true, R, t, obj) + rng.normal(0, sigma, (54, 2)) for R, t in views]


# =============================================================================================
# post, section 2: homographies and the normalized DLT
# =============================================================================================
def normalizing_transform(p):
    c = p.mean(axis=0)
    d = np.linalg.norm(p - c, axis=1).mean()
    k = np.sqrt(2) / d
    return np.array([[k, 0, -k * c[0]], [0, k, -k * c[1]], [0, 0, 1]])


def homography_dlt(X, x, normalize=True):
    T1 = normalizing_transform(X) if normalize else np.eye(3)
    T2 = normalizing_transform(x) if normalize else np.eye(3)
    Xh = np.c_[X, np.ones(len(X))] @ T1.T
    xh = np.c_[x, np.ones(len(x))] @ T2.T
    A = []
    for (X_, Y_, _), (u, v, _) in zip(Xh, xh):
        A.append([X_, Y_, 1, 0, 0, 0, -u * X_, -u * Y_, -u])
        A.append([0, 0, 0, X_, Y_, 1, -v * X_, -v * Y_, -v])
    A = np.array(A)
    _, S, Vt = np.linalg.svd(A)
    Hn = Vt[-1].reshape(3, 3)
    Hm = np.linalg.inv(T2) @ Hn @ T1
    return Hm / Hm[2, 2], S


def apply_h(Hm, X):
    p = np.c_[X, np.ones(len(X))] @ Hm.T
    return p[:, :2] / p[:, 2:]


# =============================================================================================
# post, section 3: Zhang's closed form
# =============================================================================================
def v_ij(Hm, i, j):
    a, c = Hm[:, i], Hm[:, j]
    return np.array([a[0] * c[0], a[0] * c[1] + a[1] * c[0], a[1] * c[1],
                     a[2] * c[0] + a[0] * c[2], a[2] * c[1] + a[1] * c[2], a[2] * c[2]])


def zhang_intrinsics(Hs):
    V = np.array([row for Hm in Hs for row in (v_ij(Hm, 0, 1), v_ij(Hm, 0, 0) - v_ij(Hm, 1, 1))])
    _, S, Vt = np.linalg.svd(V)
    b = Vt[-1]
    B = np.array([[b[0], b[1], b[3]], [b[1], b[2], b[4]], [b[3], b[4], b[5]]])
    if B[0, 0] < 0:
        B = -B
    L = np.linalg.cholesky(B)
    K = np.linalg.inv(L.T)
    return K / K[2, 2], S


def zhang_extrinsics(K, Hm):
    M = np.linalg.inv(K) @ Hm
    lam = 1.0 / np.linalg.norm(M[:, 0])
    if M[2, 2] < 0:
        lam = -lam
    r1, r2, t = lam * M[:, 0], lam * M[:, 1], lam * M[:, 2]
    U, _, Vt = np.linalg.svd(np.c_[r1, r2, np.cross(r1, r2)])
    return U @ Vt, t


# =============================================================================================
# post, section 4: Levenberg-Marquardt refinement
# =============================================================================================
def rvec_of(R):
    th = np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1))
    if th < 1e-12:
        return np.zeros(3)
    w = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    return th * w / (2 * np.sin(th))


def pack(K, dist, poses):
    return np.r_[K[0, 0], K[1, 1], K[0, 2], K[1, 2], dist,
                 np.concatenate([np.r_[rvec_of(R), t] for R, t in poses])]


def unpack(p):
    K = np.array([[p[0], 0, p[2]], [0, p[1], p[3]], [0, 0, 1]])
    return K, p[4:9], [(rodrigues(q[:3]), q[3:]) for q in p[9:].reshape(-1, 6)]


def residuals(p, observations):
    K, dist, poses = unpack(p)
    return np.concatenate([(project(K, dist, R, t, obj) - o).ravel()
                           for (R, t), o in zip(poses, observations)])


def jacobian(f, p, r0, eps=1e-6):
    J = np.empty((len(r0), len(p)))
    for k in range(len(p)):
        dp = np.zeros_like(p)
        dp[k] = eps * max(1.0, abs(p[k]))
        J[:, k] = (f(p + dp) - r0) / dp[k]
    return J


def levenberg_marquardt(f, p, iters=100, lam=1e-3, tol=1e-12, jac=jacobian):
    r = f(p)
    log = [(r @ r, lam)]
    for _ in range(iters):
        J = jac(f, p, r)
        A, g = J.T @ J, J.T @ r
        while True:
            step = np.linalg.solve(A + lam * np.diag(np.diag(A)), -g)
            r_new = f(p + step)
            if r_new @ r_new < r @ r:
                break
            lam *= 4
            if lam > 1e10:
                return p, jac(f, p, r), log
        converged = (r @ r - r_new @ r_new) < tol * (r @ r)
        p, r, lam = p + step, r_new, lam / 3
        log.append((r @ r, lam))
        if converged:
            break
    return p, jac(f, p, r), log


def calibrate(observations, fix_k3=False, jac=jacobian):
    Hs = [homography_dlt(obj[:, :2], o)[0] for o in observations]
    K0, _ = zhang_intrinsics(Hs)
    p0 = pack(K0, np.zeros(5), [zhang_extrinsics(K0, Hm) for Hm in Hs])
    free = np.ones(len(p0), bool)
    free[8] = not fix_k3

    def f(q):
        p = p0.copy()
        p[free] = q
        return residuals(p, observations)

    q, J, log = levenberg_marquardt(f, p0[free], jac=jac)
    p = p0.copy()
    p[free] = q
    return p, J, free, log


def covariance(p, J, free, observations):
    r = residuals(p, observations)
    sigma2 = r @ r / (J.shape[0] - J.shape[1])
    Cov = np.zeros((len(p), len(p)))
    Cov[np.ix_(free, free)] = sigma2 * np.linalg.inv(J.T @ J)
    return Cov, np.sqrt(sigma2)


# =============================================================================================
# post, section 5: projection uncertainty
# =============================================================================================
def project_ray(theta, q):
    K = np.array([[theta[0], 0, theta[2]], [0, theta[1], theta[3]], [0, 0, 1]])
    return project(K, theta[4:9], np.eye(3), np.zeros(3), np.c_[q, np.ones(len(q))])


def undistort(theta, uv, iters=50):
    q = np.c_[(uv[:, 0] - theta[2]) / theta[0], (uv[:, 1] - theta[3]) / theta[1]]
    with np.errstate(all="ignore"):
        for _ in range(iters):
            d = project_ray(theta, q)
            q = q + np.c_[(uv[:, 0] - d[:, 0]) / theta[0], (uv[:, 1] - d[:, 1]) / theta[1]]
        bad = ~(np.linalg.norm(project_ray(theta, q) - uv, axis=1) <= 1e-3)
    q[bad] = np.nan
    return q


def projection_std(theta, Cov9, uv, eps=1e-6):
    q = undistort(theta, uv)
    ok = ~np.isnan(q[:, 0])
    q = q[ok]
    base = project_ray(theta, q)
    G = np.empty((len(q), 2, 9))
    for k in range(9):
        dt = np.zeros(9)
        dt[k] = eps * max(1.0, abs(theta[k]))
        G[:, :, k] = (project_ray(theta + dt, q) - base) / dt[k]
    A = np.empty((len(q), 2, 3))
    for k in range(3):
        w = np.zeros(3)
        w[k] = eps
        Xr = np.c_[q, np.ones(len(q))] @ rodrigues(w).T
        A[:, :, k] = (project_ray(theta, Xr[:, :2] / Xr[:, 2:]) - base) / eps
    G, A = G.reshape(-1, 9), A.reshape(-1, 3)
    G = G - A @ np.linalg.lstsq(A, G, rcond=None)[0]
    out_ = np.full(len(uv), np.nan)
    out_[ok] = np.sqrt(np.einsum("nk,kl,nl->n", G, Cov9, G).reshape(-1, 2).sum(axis=1))
    return out_


# =============================================================================================
# post, section 6: subpixel corners
# =============================================================================================
def render_corner(c, a1, a2, n=31, ss=8, blur=1.0, noise=0.02, seed=3):
    g = (np.arange(n * ss) + 0.5) / ss - 0.5
    X, Y = np.meshgrid(g, g)
    s1 = np.sign(-np.sin(a1) * (X - c[0]) + np.cos(a1) * (Y - c[1]))
    s2 = np.sign(-np.sin(a2) * (X - c[0]) + np.cos(a2) * (Y - c[1]))
    img = 0.5 + 0.4 * s1 * s2
    img = img.reshape(n, ss, n, ss).mean(axis=(1, 3))
    img = gaussian_filter(img, blur)
    return img + np.random.default_rng(seed).normal(0, noise, img.shape)


def saddle_pixel(img):
    sm = gaussian_filter(img, 1.5)
    Iyy, Ixx = np.gradient(np.gradient(sm, axis=0), axis=0), np.gradient(np.gradient(sm, axis=1), axis=1)
    Ixy = np.gradient(np.gradient(sm, axis=0), axis=1)
    det = Ixx * Iyy - Ixy**2
    det[:4], det[-4:], det[:, :4], det[:, -4:] = 0, 0, 0, 0
    y, x = np.unravel_index(np.argmin(det), det.shape)
    return np.array([x, y], float)


def refine_corner(img, p, half=5, iters=10):
    gx, gy = sobel(img, axis=1) / 8, sobel(img, axis=0) / 8
    track = [p.copy()]
    for _ in range(iters):
        xi, yi = int(round(p[0])), int(round(p[1]))
        ys, xs = np.mgrid[yi - half:yi + half + 1, xi - half:xi + half + 1]
        w = np.exp(-((xs - p[0])**2 + (ys - p[1])**2) / (2 * (half / 2)**2))
        Gx, Gy = gx[ys, xs] * w, gy[ys, xs] * w
        A = np.array([[(Gx * gx[ys, xs]).sum(), (Gx * gy[ys, xs]).sum()],
                      [(Gy * gx[ys, xs]).sum(), (Gy * gy[ys, xs]).sum()]])
        bvec = np.array([(Gx * gx[ys, xs] * xs + Gx * gy[ys, xs] * ys).sum(),
                         (Gy * gx[ys, xs] * xs + Gy * gy[ys, xs] * ys).sum()])
        p = np.linalg.solve(A, bvec)
        track.append(p.copy())
    return p, np.array(track)


# =============================================================================================
# post, section 8: hand-eye calibration
# =============================================================================================
def se3(R, t):
    T = np.eye(4)
    T[:3, :3], T[:3, 3] = R, t
    return T


def hand_eye_park_martin(As, Bs):
    alpha = np.array([rvec_of(A[:3, :3]) for A in As])
    beta = np.array([rvec_of(B[:3, :3]) for B in Bs])
    U, _, Vt = np.linalg.svd(beta.T @ alpha)
    D = np.diag([1, 1, np.linalg.det(Vt.T @ U.T)])
    R_X = Vt.T @ D @ U.T
    C = np.vstack([A[:3, :3] - np.eye(3) for A in As])
    d = np.concatenate([R_X @ B[:3, 3] - A[:3, 3] for A, B in zip(As, Bs)])
    return se3(R_X, np.linalg.lstsq(C, d, rcond=None)[0])


# =============================================================================================
# helpers for the figures only
# =============================================================================================
def fast_calibrate(observations, p_start=None):
    """LM with a block-sparse finite-difference Jacobian (the numbers match `calibrate`)."""
    if p_start is None:
        Hs = [homography_dlt(obj[:, :2], o)[0] for o in observations]
        K0, _ = zhang_intrinsics(Hs)
        p_start = pack(K0, np.zeros(5), [zhang_extrinsics(K0, Hm) for Hm in Hs])
    n = len(observations)

    def view_res(p, i):
        K = np.array([[p[0], 0, p[2]], [0, p[1], p[3]], [0, 0, 1]])
        q = p[9 + 6 * i: 15 + 6 * i]
        return (project(K, p[4:9], rodrigues(q[:3]), q[3:], obj) - observations[i]).ravel()

    def jac(f, p, r0, eps=1e-6):
        J = np.zeros((len(r0), len(p)))
        for k in range(9):
            dp = np.zeros_like(p)
            dp[k] = eps * max(1.0, abs(p[k]))
            J[:, k] = (f(p + dp) - r0) / dp[k]
        for i in range(n):
            rows = slice(108 * i, 108 * (i + 1))
            for k in range(9 + 6 * i, 15 + 6 * i):
                dp = np.zeros_like(p)
                dp[k] = eps * max(1.0, abs(p[k]))
                J[rows, k] = (view_res(p + dp, i) - r0[rows]) / dp[k]
        return J

    return levenberg_marquardt(lambda p: residuals(p, observations), p_start, jac=jac)


VIEW_COL = [plt.cm.tab20(i) for i in (0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 1, 5)]


def cam3(v):
    """camera-frame (x, y, z) -> plot coordinates (x, z, -y)."""
    v = np.atleast_2d(v)
    return np.c_[v[:, 0], v[:, 2], -v[:, 1]]


def draw_frustum(ax, K, R=np.eye(3), C=np.zeros(3), depth=0.18, color=C["dark"], lw=1.6):
    """Camera pyramid; R rows are the camera axes in the drawing frame, C the centre."""
    Ki = np.linalg.inv(K)
    corners = np.array([[0, 0, 1], [W, 0, 1], [W, H, 1], [0, H, 1]], float) @ Ki.T * depth
    pts = corners @ R + C
    for p in pts:
        ax.plot(*cam3(np.array([C, p])).T, color=color, lw=lw)
    loop = cam3(np.vstack([pts, pts[:1]]))
    ax.plot(*loop.T, color=color, lw=lw)


def image_axes(ax, title=None):
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.set_aspect("equal")
    ax.add_patch(Polygon([[0, 0], [W, 0], [W, H], [0, H]], closed=True, fill=False, ec=C["gray"], lw=1.2))
    ax.set_xlabel("$u$ (px)")
    ax.set_ylabel("$v$ (px)")
    ax.set_xticks([0, 160, 320, 480, 640])
    ax.set_yticks([0, 120, 240, 360, 480])
    if title:
        ax.set_title(title)


# =============================================================================================
# the post's main run
# =============================================================================================
Hs = [homography_dlt(obj[:, :2], o)[0] for o in obs]
K0, S_V = zhang_intrinsics(Hs)
poses0 = [zhang_extrinsics(K0, Hm) for Hm in Hs]
print("closed-form K:", np.round(K0, 1).tolist())
p_opt, J, free, log = calibrate(obs)
n_corners = 54 * len(obs)
print("LM rms per iteration:", [round(float(np.sqrt(c / n_corners)), 4) for c, _ in log])
print("p_opt intrinsics:", np.round(p_opt[:9], 4))
Cov, sigma_hat = covariance(p_opt, J, free, obs)
std = np.sqrt(np.diag(Cov))
print("std:", np.round(std[:9], 4), "sigma_hat", round(float(sigma_hat), 4))


# ---------------------------------------------------------------------------------------------
# 01: the synthetic setup
# ---------------------------------------------------------------------------------------------
def fig_setup():
    fig = plt.figure(figsize=(13, 5.6))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    draw_frustum(ax, K_true, depth=0.3)
    ax.text(*cam3([0, 0.03, -0.03])[0], "$\\mathbf{C}$", fontsize=15)
    for i, (R, t) in enumerate(views):
        quad = obj[[0, 8, 53, 45]] @ R.T + t
        ax.add_collection3d(Poly3DCollection([cam3(quad)], facecolor=VIEW_COL[i], edgecolor="k",
                                             alpha=0.55, lw=0.8))
        c = obj.mean(0) @ R.T + t
        ax.text(*cam3(c + np.array([0, -0.02, 0]))[0], str(i + 1), fontsize=12, ha="center")
    ax.set_xlim(-0.3, 0.3); ax.set_ylim(0, 0.85); ax.set_zlim(-0.3, 0.3)
    ax.set_box_aspect((0.6, 0.85, 0.6))
    ax.set_xlabel("$x$"); ax.set_ylabel("$z$"); ax.set_zlabel("$-y$")
    ax.view_init(elev=24, azim=-38)
    ax.tick_params(labelsize=10)
    ax2 = fig.add_subplot(1, 2, 2)
    image_axes(ax2)
    for i, o in enumerate(obs):
        ax2.plot(o[:, 0], o[:, 1], ".", color=VIEW_COL[i], ms=5)
        q = o[[0, 8, 53, 45, 0]]
        ax2.plot(q[:, 0], q[:, 1], "-", color=VIEW_COL[i], lw=1)
    fig.tight_layout()
    out(fig, "02-setup.svg")


# ---------------------------------------------------------------------------------------------
# 02: one homography, and why it cannot follow distortion
# ---------------------------------------------------------------------------------------------
def fig_homography():
    v = 7                                          # view 8: top-left corner, strong distortion
    Hm, _ = homography_dlt(obj[:, :2], obs[v])
    pred = apply_h(Hm, obj[:, :2])
    rms = np.sqrt(((pred - obs[v])**2).sum(1).mean())
    clean = project(K_true, dist_true, *views[v], obj)       # the same view without noise
    Hc, _ = homography_dlt(obj[:, :2], clean)
    pred_c = apply_h(Hc, obj[:, :2])
    rms_c = np.sqrt(((pred_c - clean)**2).sum(1).mean())
    print("noise-free view 8: homography rms %.2f px, max %.2f px"
          % (rms_c, np.linalg.norm(pred_c - clean, axis=1).max()))
    pred0 = apply_h(Hs[0], obj[:, :2])
    rms0 = np.sqrt(((pred0 - obs[0])**2).sum(1).mean())
    print("homography rms transfer error: view 1 %.2f px, view 8 %.2f px" % (rms0, rms))
    fig, axs = plt.subplots(1, 2, figsize=(13, 5.0), gridspec_kw=dict(width_ratios=[1, 1.45]))
    ax = axs[0]
    X = obj[:, :2] * 1000
    for k in range(6):
        ax.plot(X[k * 9:(k + 1) * 9, 0], X[k * 9:(k + 1) * 9, 1], color=C["gray"], lw=1)
    for k in range(9):
        ax.plot(X[k::9, 0], X[k::9, 1], color=C["gray"], lw=1)
    ax.plot(X[:, 0], X[:, 1], "o", color=C["a"], ms=6)
    ax.annotate("", xy=(60, 0), xytext=(0, 0), arrowprops=dict(arrowstyle="-|>", color=C["x"], lw=2.5))
    ax.annotate("", xy=(0, 60), xytext=(0, 0), arrowprops=dict(arrowstyle="-|>", color=C["y"], lw=2.5))
    ax.text(64, -6, "$X$", color=C["x"]); ax.text(-18, 66, "$Y$", color=C["y"])
    ax.set_xlim(-25, 265); ax.set_ylim(175, -25); ax.set_aspect("equal")
    ax.set_xlabel("$X$ (mm)"); ax.set_ylabel("$Y$ (mm)")
    ax.set_title("$Z=0$")
    ax = axs[1]
    image_axes(ax)
    # straight grid lines mapped by H (a homography maps lines to lines)
    s = np.linspace(-0.5, 8.5, 50) * sq
    for k in range(6):
        L = apply_h(Hm, np.c_[s, np.full_like(s, k * sq)])
        ax.plot(L[:, 0], L[:, 1], color=C["b"], lw=1.2)
    s = np.linspace(-0.5, 5.5, 40) * sq
    for k in range(9):
        L = apply_h(Hm, np.c_[np.full_like(s, k * sq), s])
        ax.plot(L[:, 0], L[:, 1], color=C["b"], lw=1.2)
    Hm = Hc
    ax.plot(clean[:, 0], clean[:, 1], "o", color=C["a"], ms=5)
    sc = 20
    for a, b in zip(pred_c, clean):
        ax.annotate("", xy=a + sc * (b - a), xytext=a,
                    arrowprops=dict(arrowstyle="-|>", color=C["x"], lw=1.4, mutation_scale=9))
    ax.set_xlim(0, 360); ax.set_ylim(240, 0)
    ax.set_xticks([0, 120, 240, 360]); ax.set_yticks([0, 120, 240])
    ax.set_title("$\\tilde{\\mathbf{x}} \\simeq H\\,(X, Y, 1)^\\top$, residuals $\\times 20$")
    fig.tight_layout()
    out(fig, "02-homography.svg")
    return rms0, rms, rms_c


# ---------------------------------------------------------------------------------------------
# 03: why normalize
# ---------------------------------------------------------------------------------------------
def fig_normalization():
    _, S_raw = homography_dlt(obj[:, :2], obs[0], normalize=False)
    _, S_nrm = homography_dlt(obj[:, :2], obs[0], normalize=True)
    print("cond s1/s8 raw %.2e normalized %.2e" % (S_raw[0] / S_raw[-2], S_nrm[0] / S_nrm[-2]))
    # Monte Carlo on the undistorted pinhole (so that only the DLT is tested), view 8
    Hgt_views = [K_true @ np.c_[R[:, 0], R[:, 1], t] for R, t in views]
    sigmas = np.array([0.1, 0.2, 0.5, 1.0, 2.0, 3.0])
    rng_n = np.random.default_rng(5)
    cases = (("nm", 1.0, True), ("m", 1.0, False), ("mm", 1000.0, False))
    errs = {k: [] for k, _, _ in cases}
    for s in sigmas:
        e = {k: [] for k, _, _ in cases}
        for trial in range(300):
            v = trial % 12
            clean = apply_h(Hgt_views[v], obj[:, :2])
            noisy = clean + rng_n.normal(0, s, clean.shape)
            for key, unit, nz in cases:
                X = obj[:, :2] * unit                  # board coordinates in metres or millimetres
                Hm, _ = homography_dlt(X, noisy, normalize=nz)
                e[key].append(np.sqrt(((apply_h(Hm, X) - clean)**2).sum(1).mean()))
        for key in errs:
            errs[key].append(np.mean(e[key]))
    errs = {k: np.array(v) for k, v in errs.items()}
    print("DLT error vs truth (px):", {k: np.round(v, 3).tolist() for k, v in errs.items()})
    fig, axs = plt.subplots(1, 2, figsize=(13, 4.8))
    ax = axs[0]
    k = np.arange(1, 10)
    ax.semilogy(k, S_raw, "o-", color=C["x"], label="normalize=False (m)")
    ax.semilogy(k, S_nrm, "s-", color=C["z"], label="normalize=True")
    ax.set_xticks(k)
    ax.set_xlabel("$i$")
    ax.set_ylabel("$s_i(A)$")
    ax.legend(fontsize=13)
    ax = axs[1]
    ax.loglog(sigmas, errs["mm"], "^-", color=C["b"], label="normalize=False (mm)")
    ax.loglog(sigmas, errs["m"], "o-", color=C["x"], label="normalize=False (m)")
    ax.loglog(sigmas, errs["nm"], "s-", color=C["z"], label="normalize=True")
    ax.loglog(sigmas, sigmas * np.sqrt(8 / 54), "--", color=C["gray"], lw=1.5,
              label="$\\sigma\\sqrt{8/54}$")
    ax.set_xlabel("$\\sigma$ (px)")
    ax.set_ylabel("$e_H$ (px)")
    ax.legend(fontsize=13)
    fig.tight_layout()
    out(fig, "02-normalization.svg")
    return S_raw, S_nrm, sigmas, errs


# ---------------------------------------------------------------------------------------------
# 04: closed form vs number of views and vs tilt
# ---------------------------------------------------------------------------------------------
def closed_form_fx_error(poses_, s, rng_):
    o = [project(K_true, np.zeros(5), R, t, obj) + rng_.normal(0, s, (54, 2)) for R, t in poses_]
    try:
        K, _ = zhang_intrinsics([homography_dlt(obj[:, :2], oo)[0] for oo in o])
        return abs(K[0, 0] - K_true[0, 0]) / K_true[0, 0] * 100
    except np.linalg.LinAlgError:                  # B not positive definite: the closed form failed
        return np.nan


def fig_views_tilt():
    rng_t = np.random.default_rng(6)
    Ns = np.arange(3, 16)
    med_N = []
    for N in Ns:
        e = []
        for trial in range(200):
            ps = []
            for _ in range(N):
                ang = rng_t.uniform(0, 2 * np.pi)
                tilt = rng_t.uniform(20, 45)
                ps.append(board_pose(tilt * np.sin(ang), tilt * np.cos(ang), rng_t.uniform(-30, 30),
                                     (rng_t.uniform(-0.05, 0.05), rng_t.uniform(-0.04, 0.04), 0.55)))
            e.append(closed_form_fx_error(ps, 0.3, rng_t))
        med_N.append(np.nanmedian(e))
    tilts = np.array([2, 5, 10, 15, 20, 30, 40, 50, 60, 70])
    med_T, fail_T = [], []
    for th in tilts:
        e = []
        for trial in range(200):
            ps = [board_pose(th * np.sin(a), th * np.cos(a), 0, (0, 0, 0.55))
                  for a in np.deg2rad([0, 120, 240])]
            e.append(closed_form_fx_error(ps, 0.3, rng_t))
        e = np.array(e)
        med_T.append(np.nanmedian(e))
        fail_T.append(np.isnan(e).mean() * 100)
    med_N, med_T = np.array(med_N), np.array(med_T)
    print("closed form median |dfx|/fx (%) vs N:", dict(zip(Ns.tolist(), np.round(med_N, 3).tolist())))
    print("closed form median |dfx|/fx (%) vs tilt:", dict(zip(tilts.tolist(), np.round(med_T, 3).tolist())))
    print("closed form failure rate (%) vs tilt:", dict(zip(tilts.tolist(), np.round(fail_T, 1).tolist())))
    fig, axs = plt.subplots(1, 2, figsize=(13, 4.8))
    ax = axs[0]
    ax.semilogy(Ns, med_N, "o-", color=C["a"])
    ax.set_xlabel("$N$")
    ax.set_ylabel("median $|\\hat f_x - f_x| / f_x$ (%)")
    ax.set_xticks(Ns[::2])
    ax = axs[1]
    ax.semilogy(tilts, med_T, "o-", color=C["b"])
    ax.set_xlabel("$\\theta$ (deg)")
    ax.set_ylabel("median $|\\hat f_x - f_x| / f_x$ (%)")
    ax2 = ax.twinx()
    ax2.bar(tilts, fail_T, width=3, color=C["gray"], alpha=0.35)
    ax2.set_ylim(0, 100)
    ax2.set_ylabel("$P_{\\mathrm{fail}}$ (%)", color=C["gray"])
    ax2.grid(False)
    ax2.spines["right"].set_visible(True)
    fig.tight_layout()
    out(fig, "02-views-and-tilt.svg")
    return Ns, med_N, tilts, med_T, fail_T


# ---------------------------------------------------------------------------------------------
# 05: Jacobian sparsity and LM convergence
# ---------------------------------------------------------------------------------------------
def fig_lm():
    fig, axs = plt.subplots(1, 2, figsize=(13, 5.0), gridspec_kw=dict(width_ratios=[1, 1.25]))
    ax = axs[0]
    nz = (np.abs(J) > 1e-9).astype(float)
    ax.imshow(1 - nz, cmap="gray", aspect="auto", interpolation="nearest", vmin=0, vmax=1)
    ax.axvline(8.5, color=C["x"], lw=1.5)
    ax.set_xlabel("$j$")
    ax.set_ylabel("$i$")
    ax.set_xticks([0, 9, 27, 45, 63, 80])
    ax.set_yticks([0, 216, 432, 648, 864, 1080, 1295])
    ax.grid(False)
    ax = axs[1]
    it = np.arange(len(log))
    rms = np.sqrt(np.array([c for c, _ in log]) / n_corners)
    ax.plot(it, rms, "o-", color=C["a"], ms=8)
    ax.axhline(sigma * np.sqrt(2), color=C["gray"], lw=1.2, ls=":")
    ax.text(5, sigma * np.sqrt(2) + 0.12, "$\\sqrt{2}\\,\\sigma$", ha="center", color=C["gray"])
    ax.set_ylabel("RMS (px)", color=C["a"])
    ax.set_ylim(0, 4.5)
    ax.set_xlabel("$k$")
    ax.set_xticks(it)
    ax2 = ax.twinx()
    ax2.semilogy(it, [l for _, l in log], "s--", color=C["b"], ms=6)
    ax2.set_ylabel("$\\lambda$", color=C["b"])
    ax2.grid(False)
    ax2.spines["right"].set_visible(True)
    fig.tight_layout()
    out(fig, "02-lm.svg")
    return rms


# ---------------------------------------------------------------------------------------------
# 06: residuals before and after refinement
# ---------------------------------------------------------------------------------------------
def fig_residuals():
    p0 = pack(K0, np.zeros(5), poses0)
    r0 = residuals(p0, obs).reshape(-1, 2)
    r1 = residuals(p_opt, obs).reshape(-1, 2)
    pts = np.concatenate(obs)
    rms0 = np.sqrt((r0**2).sum(1).mean())
    rms1 = np.sqrt((r1**2).sum(1).mean())
    print("residual rms closed form %.3f px, after LM %.4f px; max |r| closed %.2f px" %
          (rms0, rms1, np.linalg.norm(r0, axis=1).max()))
    fig, axs = plt.subplots(1, 2, figsize=(13, 5.0))
    for ax, r, sc, ttl, ref in ((axs[0], r0, 8, "(a)  $\\times 8$", 5), (axs[1], r1, 100, "(b)  $\\times 100$", 0.5)):
        image_axes(ax, ttl)
        tail = pts + r                         # residual = predicted - observed: draw from observed to predicted
        ax.quiver(pts[:, 0], pts[:, 1], sc * r[:, 0], sc * r[:, 1], angles="xy", scale_units="xy", scale=1,
                  color=C["x"], width=0.003, headwidth=4)
        ax.plot(pts[:, 0], pts[:, 1], ".", color=C["gray"], ms=2)
        ax.quiver([30], [455], [sc * ref], [0], angles="xy", scale_units="xy", scale=1, color=C["dark"],
                  width=0.005)
        ax.text(30 + sc * ref / 2, 440, f"{ref} px", ha="center", fontsize=13)
        del tail
    fig.tight_layout()
    out(fig, "02-residuals.svg")
    return rms0, rms1


# ---------------------------------------------------------------------------------------------
# 07: predicted covariance vs Monte Carlo
# ---------------------------------------------------------------------------------------------
def ellipse(ax, mean, C2, nsig, **kw):
    w, V = np.linalg.eigh(C2)
    ang = np.degrees(np.arctan2(V[1, 1], V[0, 1]))
    ax.add_patch(Ellipse(mean, 2 * nsig * np.sqrt(w[1]), 2 * nsig * np.sqrt(w[0]), angle=ang, fill=False, **kw))


def fig_uncertainty():
    rng_mc = np.random.default_rng(1)
    clean = [project(K_true, dist_true, R, t, obj) for R, t in views]
    est = []
    for trial in range(200):
        o = [c + rng_mc.normal(0, sigma, c.shape) for c in clean]
        p, _, _ = fast_calibrate(o)
        est.append(p[:9])
    est = np.array(est)
    mc_std = est.std(axis=0)
    print("MC std:", np.round(mc_std, 4))
    print("predicted std:", np.round(std[:9], 4))
    print("MC corr(fx,fy) %.3f corr(k2,k3) %.3f" % (np.corrcoef(est[:, 0], est[:, 1])[0, 1],
                                                     np.corrcoef(est[:, 5], est[:, 8])[0, 1]))
    fig, axs = plt.subplots(1, 2, figsize=(13, 5.2))
    for ax, (a, b), labs in ((axs[0], (0, 1), ("$f_x$ (px)", "$f_y$ (px)")),
                             (axs[1], (5, 8), ("$k_2$", "$k_3$"))):
        ax.plot(est[:, a], est[:, b], ".", color=C["gray"], ms=5, alpha=0.8)
        C2 = Cov[np.ix_([a, b], [a, b])]
        mean = np.array([p_opt[a], p_opt[b]])
        tr = np.array([np.r_[K_true[0, 0], K_true[1, 1], K_true[0, 2], K_true[1, 2], dist_true][i] for i in (a, b)])
        # centre the predicted ellipse on the truth: it describes the spread of estimates around it
        for ns, ls in ((1, "-"), (2, "--")):
            ellipse(ax, tr, C2, ns, ec=C["a"], lw=2.2, ls=ls)
        ax.plot(*tr, "*", color=C["x"], ms=16, mec="k", zorder=5)
        ax.plot(*mean, "D", color=C["b"], ms=8, mec="k", zorder=5)
        ax.set_xlabel(labs[0]); ax.set_ylabel(labs[1])
    fig.tight_layout()
    out(fig, "02-uncertainty.svg")
    return est, mc_std


# ---------------------------------------------------------------------------------------------
# 08: projection uncertainty maps
# ---------------------------------------------------------------------------------------------
def fig_projection_uncertainty():
    from matplotlib.colors import LogNorm
    gu, gv = np.meshgrid(np.linspace(4, W - 4, 81), np.linspace(4, H - 4, 61))
    grid = np.c_[gu.ravel(), gv.ravel()]
    central = [0, 1, 2, 3, 4, 5, 6, 11]
    cases = [(range(12), False, "(a)", C["a"]), (central, False, "(b)", C["x"]),
             (central, True, "(c)  $k_3=0$", C["b"])]
    # the diagonal from the image centre to the top-left corner, for panel (d)
    s_ = np.linspace(0, 1, 120)
    diag = np.c_[W / 2 - s_ * (W / 2 - 4), H / 2 - s_ * (H / 2 - 4)]
    fig, axs = plt.subplots(2, 2, figsize=(12.5, 9.6), layout="constrained")
    axs = axs.ravel()
    norm = LogNorm(0.05, 10)
    res = []
    for ax, (idx, fix, ttl, col) in zip(axs, cases):
        ob = [obs[i] for i in idx]
        p_s, J_s, free_s, _ = calibrate(ob, fix_k3=fix)
        Cov_s, _ = covariance(p_s, J_s, free_s, ob)
        th = p_s[:9]
        m = projection_std(th, Cov_s[:9, :9], grid).reshape(gu.shape)
        # profile along the diagonal, read from the map (the rotation is fitted over the whole image)
        md = map_coordinates(m, [(diag[:, 1] - 4) / ((H - 8) / 60), (diag[:, 0] - 4) / ((W - 8) / 80)], order=1, mode="nearest")
        rmax = np.hypot(*(np.concatenate(ob) - [W / 2, H / 2]).T).max()
        res.append((ttl, p_s[8], np.sqrt(Cov_s[8, 8]), m, md))
        print("%s: k3 %.3f +- %.3f, std at centre %.3f px, at the corner %.2f px, max %.2f, invalid %.1f%%, "
              "share > 1 px %.1f%%, data up to r = %.0f px" % (
                  ttl, p_s[8], np.sqrt(Cov_s[8, 8]), md[0], md[-1], np.nanmax(m), np.isnan(m).mean() * 100,
                  (np.nan_to_num(m, nan=99) > 1).mean() * 100, rmax))
        image_axes(ax, ttl)
        im = ax.imshow(np.clip(m, 0.05, 10), extent=(0, W, H, 0), cmap="magma_r", norm=norm,
                       interpolation="bilinear")
        bad = np.isnan(m)
        if bad.any():
            ax.contourf(gu, gv, bad.astype(float), levels=[0.5, 1.5], colors="white", hatches=["//"])
            ax.contour(gu, gv, bad.astype(float), levels=[0.5], colors=C["dark"], linewidths=1.2)
        cs = ax.contour(gu, gv, np.nan_to_num(m, nan=99), levels=[0.2, 1.0], colors=[C["z"], C["c"]],
                        linewidths=2)
        ax.clabel(cs, fmt={0.2: "0.2", 1.0: "1"}, fontsize=12)
        pts = np.concatenate(ob)
        ax.plot(pts[:, 0], pts[:, 1], ".", color=C["dark"], ms=1.5, alpha=0.6)
        ax.plot([W / 2, 1], [H / 2, 1], ":", color=col, lw=2.5)
        ax.set_xlim(0, W); ax.set_ylim(H, 0)
    ax = axs[3]
    rr = np.hypot(diag[:, 0] - W / 2, diag[:, 1] - H / 2)
    for (ttl, _, _, _, md), (_, _, _, col) in zip(res, cases):
        ax.semilogy(rr, md, color=col, lw=2.6, label=ttl)
    ax.set_xlabel("$\\|(u, v) - (320, 240)\\|$ (px)")
    ax.set_ylabel("$\\sigma_{\\mathrm{proj}}$ (px)")
    ax.set_xlim(0, 400); ax.set_ylim(0.03, 30)
    ax.legend(fontsize=13, loc="upper left")
    ax.set_title("(d)")
    cb = fig.colorbar(im, ax=[axs[0], axs[1]], extend="both", pad=0.02, shrink=0.9)
    cb.set_label("$\\sigma_{\\mathrm{proj}}$ (px)")
    out(fig, "02-projection-uncertainty.svg")
    return res


# ---------------------------------------------------------------------------------------------
# 09: subpixel corner refinement
# ---------------------------------------------------------------------------------------------
def fig_subpixel():
    c_true = np.array([15.37, 14.62])
    img = render_corner(c_true, np.deg2rad(20), np.deg2rad(115))
    p_int = saddle_pixel(img)
    p_sub, track = refine_corner(img, p_int)
    err = np.linalg.norm(track - c_true, axis=1)
    print("subpixel: integer error %.3f, refined %.4f px, per iteration %s"
          % (err[0], err[-1], np.round(err, 4).tolist()))
    fig, axs = plt.subplots(1, 2, figsize=(12, 5.2), gridspec_kw=dict(width_ratios=[1, 1.1]))
    ax = axs[0]
    ax.imshow(img, cmap="gray", vmin=0, vmax=1, extent=(-0.5, 30.5, 30.5, -0.5))
    gx, gy = sobel(img, axis=1) / 8, sobel(img, axis=0) / 8
    ys, xs = np.mgrid[10:21, 10:21]
    m = np.hypot(gx[ys, xs], gy[ys, xs]) > 0.06
    ax.quiver(xs[m], ys[m], gx[ys, xs][m], gy[ys, xs][m], color=C["b"], angles="xy", scale=0.25,
              scale_units="xy", width=0.008)
    ax.plot(*c_true, "*", color=C["y"], ms=24, mec="k", label="$\\mathbf{p}^\\ast$", zorder=4)
    ax.plot(*p_int, "o", color=C["x"], ms=11, mec="k", label="$\\mathbf{p}_0$", zorder=5)
    ax.plot(track[:, 0], track[:, 1], "-", color=C["c"], lw=1.5, zorder=5)
    ax.plot(*p_sub, "+", color=C["c"], ms=16, mew=3, label="$\\mathbf{p}_{10}$", zorder=6)
    ax.set_xlim(8.5, 22.5); ax.set_ylim(21.5, 7.5)
    ax.set_xlabel("$u$ (px)"); ax.set_ylabel("$v$ (px)")
    ax.legend(fontsize=14, loc="lower left", framealpha=0.9)
    ax.grid(False)
    ax = axs[1]
    ax.semilogy(np.arange(len(err)), err, "o-", color=C["a"])
    ax.set_xlabel("$k$")
    ax.set_ylabel("$\\|\\mathbf{p}_k - \\mathbf{p}^\\ast\\|$ (px)")
    ax.set_xticks(range(0, len(err), 2))
    fig.tight_layout()
    out(fig, "02-subpixel.svg")
    return err


# ---------------------------------------------------------------------------------------------
# 10: stereo rectification
# ---------------------------------------------------------------------------------------------
K2_true = np.array([[605.0, 0, 318.0], [0, 601.0, 242.0], [0, 0, 1]])
dist2_true = np.array([-0.26, 0.06, 0.0, 0.0, 0.0])
R_s = rodrigues(np.deg2rad([2.0, 8.0, 4.0]))
t_s = -R_s @ np.array([0.12, 0.0, 0.0])


def mean_rotation(Rs_):
    U, _, Vt = np.linalg.svd(sum(Rs_))
    return U @ np.diag([1, 1, np.linalg.det(U @ Vt)]) @ Vt


def fig_rectification():
    rng2 = np.random.default_rng(2)
    both, obs_l, obs_r = [], [], []
    for i, (R, t) in enumerate(views):
        uv2 = project(K2_true, dist2_true, R_s @ R, R_s @ t + t_s, obj)
        if (uv2 > 5).all() and (uv2[:, 0] < W - 5).all() and (uv2[:, 1] < H - 5).all():
            both.append(i)
            obs_l.append(obs[i])
            obs_r.append(uv2 + rng2.normal(0, sigma, uv2.shape))
    pl, _, _, _ = calibrate(obs_l)
    pr, _, _, _ = calibrate(obs_r)
    K1, d1, P1s = unpack(pl)
    K2, d2, P2s = unpack(pr)
    # stereo extrinsics from the per-view poses: R_s,i = R2_i R1_i^T, t_s,i = t2_i - R_s,i t1_i
    R_e = mean_rotation([Rb @ Ra.T for (Ra, _), (Rb, _) in zip(P1s, P2s)])
    t_e = np.mean([tb - R_e @ ta for (Ra, ta), (Rb, tb) in zip(P1s, P2s)], axis=0)
    ang = np.rad2deg(np.linalg.norm(rvec_of(R_e @ R_s.T)))
    print("numpy stereo from averaged per-view poses (%d views): rotation error %.2f deg, baseline %.2f mm"
          % (len(both), ang, 1000 * np.linalg.norm(t_e)))
    # rectifying rotation (Fusiello et al. 2000): the new x axis is the baseline
    C2 = -R_e.T @ t_e
    e1 = C2 / np.linalg.norm(C2)
    e2 = np.cross([0, 0, 1.0], e1); e2 /= np.linalg.norm(e2)
    e3 = np.cross(e1, e2)
    R_rect = np.stack([e1, e2, e3])
    Rr = [R_rect, R_rect @ R_e.T]
    Kn = np.array([[(K1[0, 0] + K2[0, 0]) / 2, 0, W / 2], [0, (K1[1, 1] + K2[1, 1]) / 2, H / 2], [0, 0, 1]])

    def rectify(K, d, Rri, uv):
        th = np.r_[K[0, 0], K[1, 1], K[0, 2], K[1, 2], d]
        q = undistort(th, uv)
        X = np.c_[q, np.ones(len(q))] @ Rri.T
        return X[:, :2] / X[:, 2:] * np.diag(Kn)[:2] + Kn[:2, 2]

    k = both.index(11)                        # view 12: rolled 40 degrees and tilted
    L, Rt = obs_l[k], obs_r[k]
    Lr, Rr_ = rectify(K1, d1, Rr[0], L), rectify(K2, d2, Rr[1], Rt)
    dv_before = np.abs(L[:, 1] - Rt[:, 1]).mean()
    dv_after = np.abs(Lr[:, 1] - Rr_[:, 1]).mean()
    allL = np.concatenate([rectify(K1, d1, Rr[0], o) for o in obs_l])
    allR = np.concatenate([rectify(K2, d2, Rr[1], o) for o in obs_r])
    print("view 12: mean |dv| before %.2f px, after %.3f px; all shared views after %.3f px"
          % (dv_before, dv_after, np.abs(allL[:, 1] - allR[:, 1]).mean()))
    sel = [0, 8, 45, 53]                       # the four outer corners of the board
    cols = [C["x"], C["y"], C["z"], C["b"]]
    th1 = np.r_[K1[0, 0], K1[1, 1], K1[0, 2], K1[1, 2], d1]
    fig, axs = plt.subplots(2, 2, figsize=(12, 9.4))
    for j, cc in zip(sel, cols):
        # epipolar curve of a left pixel in the raw right image: its ray seen from camera 2
        q = undistort(th1, L[j:j + 1])[0]
        depth = np.geomspace(0.12, 50.0, 400)
        cur = project(K2, d2, R_e, t_e, np.c_[q[0] * depth, q[1] * depth, depth])
        axs[0, 1].plot(cur[:, 0], cur[:, 1], color=cc, lw=1.8)
        axs[0, 0].plot(*L[j], "o", color=cc, ms=10, mec="k", zorder=5)
        axs[0, 1].plot(*Rt[j], "o", color=cc, ms=10, mec="k", zorder=5)
        for ax, pt in ((axs[1, 0], Lr[j]), (axs[1, 1], Rr_[j])):
            ax.axhline(Lr[j, 1], color=cc, lw=1.6)
            ax.plot(*pt, "o", color=cc, ms=10, mec="k", zorder=5)
    for ax, pts, ttl in ((axs[0, 0], L, "(a)"), (axs[0, 1], Rt, "(b)"),
                         (axs[1, 0], Lr, "(c)"), (axs[1, 1], Rr_, "(d)")):
        image_axes(ax, ttl)
        ax.plot(pts[:, 0], pts[:, 1], ".", color=C["gray"], ms=6)
    fig.tight_layout()
    out(fig, "02-rectification.svg")
    return ang, 1000 * np.linalg.norm(t_e), dv_before, dv_after


# ---------------------------------------------------------------------------------------------
# 11: hand-eye calibration
# ---------------------------------------------------------------------------------------------
X_true = se3(rodrigues(np.deg2rad([5.0, -10.0, 90.0])), np.array([0.05, -0.03, 0.08]))
T_bt = se3(np.eye(3), np.array([0.6, 0.0, 0.0]))


def hand_eye_trial(n, rng_, planar=False, rot_noise=0.05, t_noise=0.0005):
    T_bg, T_ct = [], []
    for i in range(n):
        if planar:                                  # every rotation about the same (vertical) axis
            ang = np.deg2rad([0, 0, rng_.uniform(-60, 60)])
        else:
            ang = np.deg2rad(rng_.uniform(-30, 30, 3))
        Tg = se3(rodrigues(ang) @ rodrigues([0, np.pi, 0]), np.array([0.6, 0.0, 0.45]) + rng_.uniform(-0.1, 0.1, 3))
        Tc = np.linalg.inv(Tg @ X_true) @ T_bt
        noise = se3(rodrigues(np.deg2rad(rng_.normal(0, rot_noise, 3))), rng_.normal(0, t_noise, 3))
        T_bg.append(Tg)
        T_ct.append(Tc @ noise)
    As = [np.linalg.inv(T_bg[j]) @ T_bg[i] for i in range(n) for j in range(i + 1, n)]
    Bs = [T_ct[j] @ np.linalg.inv(T_ct[i]) for i in range(n) for j in range(i + 1, n)]
    X = hand_eye_park_martin(As, Bs)
    return (np.rad2deg(np.linalg.norm(rvec_of(X[:3, :3] @ X_true[:3, :3].T))),
            1000 * np.linalg.norm(X[:3, 3] - X_true[:3, 3]), T_bg)


def fig_hand_eye():
    rng_h = np.random.default_rng(7)
    Ns = np.array([3, 4, 5, 6, 8, 10, 15, 20])
    res = {False: [], True: []}
    for planar in (False, True):
        for n in Ns:
            e = np.array([hand_eye_trial(n, rng_h, planar)[:2] for _ in range(100)])
            res[planar].append(np.median(e, axis=0))
    res = {k: np.array(v) for k, v in res.items()}
    print("hand-eye median rot err (deg) general:", np.round(res[False][:, 0], 3).tolist())
    print("hand-eye median trans err (mm) general:", np.round(res[False][:, 1], 2).tolist())
    print("hand-eye median rot err (deg) one axis:", np.round(res[True][:, 0], 3).tolist())
    print("hand-eye median trans err (mm) one axis:", np.round(res[True][:, 1], 1).tolist())
    fig = plt.figure(figsize=(13.5, 5.4))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    _, _, T_bg = hand_eye_trial(4, np.random.default_rng(11))
    L = 0.06
    for k, (c, lab) in enumerate(((C["x"], "x"), (C["y"], "y"), (C["z"], "z"))):
        v = np.zeros(3); v[k] = 0.12
        ax.quiver(0, 0, 0, *v, color=c, lw=2.2, arrow_length_ratio=0.15)
    ax.text(0.0, 0.0, -0.06, "$\\{b\\}$", fontsize=15)
    for Tg in T_bg:
        Tc = Tg @ X_true
        for T, lw in ((Tg, 2.4), (Tc, 1.4)):
            o = T[:3, 3]
            for k, c in enumerate((C["x"], C["y"], C["z"])):
                ax.quiver(*o, *(T[:3, k] * L), color=c, lw=lw, arrow_length_ratio=0.2)
        ax.plot(*np.c_[Tg[:3, 3], Tc[:3, 3]], color=C["b"], lw=2.5)
        ray = np.c_[Tc[:3, 3], T_bt[:3, 3]]
        ax.plot(*ray, color=C["gray"], lw=0.8, ls=":")
    tgt = T_bt[:3, 3] + np.array([[-0.12, -0.075, 0], [0.12, -0.075, 0], [0.12, 0.075, 0], [-0.12, 0.075, 0]])
    ax.add_collection3d(Poly3DCollection([tgt], facecolor=C["fill"], edgecolor=C["a"], lw=1.5))
    ax.text(*(T_bt[:3, 3] + [0.0, 0.1, 0.0]), "$\\{t\\}$", fontsize=15)
    ax.set_xlim(0, 0.8); ax.set_ylim(-0.3, 0.3); ax.set_zlim(-0.05, 0.6)
    ax.set_box_aspect((0.8, 0.6, 0.65))
    ax.view_init(elev=20, azim=-55)
    ax.tick_params(labelsize=10)
    ax.set_xlabel("$x$"); ax.set_ylabel("$y$"); ax.set_zlabel("$z$")
    ax = fig.add_subplot(1, 2, 2)
    ax.semilogy(Ns, res[False][:, 0], "o-", color=C["a"], label="$\\angle(\\hat R_X, R_X)$ (deg)")
    ax.semilogy(Ns, res[False][:, 1], "s-", color=C["b"], label="$\\|\\hat{\\mathbf{t}}_X - \\mathbf{t}_X\\|$ (mm)")
    ax.semilogy(Ns, res[True][:, 0], "o--", color=C["a"], alpha=0.6)
    ax.semilogy(Ns, res[True][:, 1], "s--", color=C["b"], alpha=0.6)
    ax.set_xlabel("$n$")
    ax.set_xticks(Ns)
    ax.legend(fontsize=13)
    fig.tight_layout()
    out(fig, "02-hand-eye.svg")
    return Ns, res


if __name__ == "__main__":
    FIGS = [fig_setup, fig_homography, fig_normalization, fig_views_tilt, fig_lm, fig_residuals,
            fig_uncertainty, fig_projection_uncertainty, fig_subpixel, fig_rectification, fig_hand_eye]
    only = os.environ.get("ONLY")              # e.g. ONLY=fig_lm,fig_subpixel for a quick preview
    for fn in FIGS:
        if not only or fn.__name__ in only.split(","):
            fn()
