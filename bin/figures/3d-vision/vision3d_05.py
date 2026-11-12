"""Figures for 3d-vision post 05: multi-view geometry and bundle adjustment.

Run from the repository root:
    python3 bin/figures/3d-vision/vision3d_05.py [preview-dir]
    ONLY=fig_ba,fig_gauge python3 bin/figures/3d-vision/vision3d_05.py   # a subset

Conventions (as in the post): OpenCV frames, x right, y down, z forward; the world is y-down too,
so the ground is y = 0 and "up" is -y. In 3D plots a world point (x, y, z) is drawn at plot
position (x, z, -y). The first part of this file is the post's code, verbatim and in order (all
snippets of the post form one script), so every number printed here is the number quoted in the
post. Only NumPy, SciPy and Matplotlib are needed.
"""
import os
import pathlib
import sys

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

plt.rcParams["svg.hashsalt"] = "3d-vision-05"  # stable element ids

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/3d-vision"
PREV = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] != "-" else None


def out(fig, name):
    if PREV is not None:
        PREV.mkdir(parents=True, exist_ok=True)
        fig.savefig(PREV / name.replace(".svg", ".png"), dpi=70)
    save(fig, OUT / name)


# =============================================================================================
# the post's code (snippets 1-15), verbatim
# =============================================================================================
# ===== snippet 1: scene =====
import numpy as np

def skew(v):
    return np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])

def rodrigues(w):
    """Axis-angle vector -> rotation matrix (as in post 02)."""
    th = np.linalg.norm(w)
    if th < 1e-12:
        return np.eye(3) + skew(w)
    k = skew(np.asarray(w, float) / th)
    return np.eye(3) + np.sin(th) * k + (1 - np.cos(th)) * k @ k

def look_at(C, target=(0.0, 0.0, 0.0)):
    """World-to-camera (R, t) of a camera at C looking at target. World and camera are
    OpenCV-style (y down), so the world 'up' direction is -y."""
    z = np.asarray(target, float) - C
    z /= np.linalg.norm(z)
    x = np.cross(z, [0.0, -1.0, 0.0]); x /= np.linalg.norm(x)
    R = np.stack([x, np.cross(z, x), z])          # rows: camera axes in world coordinates
    return R, -R @ C

def project(K, R, t, X):
    """World points X (N x 3) -> pixels (N x 2) and depths (N,)."""
    Xc = X @ R.T + t
    return (Xc[:, :2] / Xc[:, 2:]) @ K[:2, :2].T + K[:2, 2], Xc[:, 2]

def box_points(lo, hi, n, rng):
    """n random points on the surface of an axis-aligned box."""
    lo, hi = np.asarray(lo, float), np.asarray(hi, float)
    P = rng.uniform(lo, hi, (n, 3))
    axis = rng.integers(0, 3, n)
    side = rng.integers(0, 2, n)
    P[np.arange(n), axis] = np.where(side == 1, hi[axis], lo[axis])
    return P

rng = np.random.default_rng(5)
W, H = 640, 480
K = np.array([[500.0, 0, 320], [0, 500.0, 240], [0, 0, 1]])
X_true = np.vstack([                          # world y points down: the ground is y = 0
    np.c_[rng.uniform(-2, 2, 40), np.zeros(40), rng.uniform(-2, 2, 40)],    # ground
    box_points([-1.3, -1.0, -0.6], [-0.3, 0.0, 0.4], 40, rng),              # low box
    box_points([0.3, -1.6, -0.9], [1.3, 0.0, 0.1], 40, rng)])               # tall box
cams_true = [look_at(5.0 * np.array([np.sin(a), -0.4, -np.cos(a)]), (0, -0.5, 0))
             for a in np.deg2rad(np.linspace(-60, 60, 8))]

sigma = 0.5                                   # pixel noise
obs = []                                      # (camera i, point j, observed pixel)
for i, (R, t) in enumerate(cams_true):
    uv, depth = project(K, R, t, X_true)
    for j in range(len(X_true)):
        if depth[j] > 0 and 0 <= uv[j, 0] < W and 0 <= uv[j, 1] < H:
            obs.append((i, j, uv[j] + rng.normal(0, sigma, 2)))
cam_idx = np.array([o[0] for o in obs]); pt_idx = np.array([o[1] for o in obs])
uv_obs = np.array([o[2] for o in obs])
m, n, L = len(cams_true), len(X_true), len(obs)
print(f"{m} cameras, {n} points, {L} observations")
print(f"unknowns 6m + 3n = {6 * m + 3 * n}, residuals 2L = {2 * L}, gauge 7")

# ===== snippet 2: P3P (Grunert) =====
def absolute_orientation(A, B):
    """R, t minimizing sum |R A_k + t - B_k|^2 (Kabsch / Horn), A and B are N x 3."""
    a, b = A.mean(0), B.mean(0)
    U, _, Vt = np.linalg.svd((B - b).T @ (A - a))
    D = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])
    R = U @ D @ Vt
    return R, b - R @ a

def p3p(Xw, f):
    """Grunert's P3P. Xw: 3 world points (3 x 3); f: their unit bearing vectors in the
    camera frame (3 x 3). Returns up to 4 candidate poses (R, t) with X_c = R X_w + t."""
    a = np.linalg.norm(Xw[1] - Xw[2]); b = np.linalg.norm(Xw[0] - Xw[2]); c = np.linalg.norm(Xw[0] - Xw[1])
    ca, cb, cg = f[1] @ f[2], f[0] @ f[2], f[0] @ f[1]      # cosines of the angles between rays
    P = np.polynomial.polynomial                             # coefficient arrays, lowest power first
    # with s2 = u s1 and s3 = v s1, two of the cosine-law equations give u = N(v) / D(v)
    N = (a * a - c * c) * np.array([1, -2 * cb, 1]) - b * b * np.array([-1, 0, 1])
    D = 2 * b * b * np.array([cg, -ca])
    # substitute into b^2 (1 + u^2 - 2 u cos(gamma)) = c^2 (1 + v^2 - 2 v cos(beta)), times D^2
    quartic = P.polyadd(b * b * P.polysub(P.polyadd(P.polymul(D, D), P.polymul(N, N)),
                                          2 * cg * P.polymul(N, D)),
                        -c * c * P.polymul([1, -2 * cb, 1], P.polymul(D, D)))
    poses = []
    for v in P.polyroots(quartic):
        if abs(v.imag) > 1e-8 or v.real <= 0:
            continue
        v = v.real
        u = P.polyval(v, N) / P.polyval(v, D)
        if u <= 0:
            continue
        s1 = b / np.sqrt(1 + v * v - 2 * v * cb)            # distance of point 1 from the centre
        Xc = np.array([s1, u * s1, v * s1])[:, None] * f    # the three points in the camera frame
        poses.append(absolute_orientation(Xw, Xc))
    return poses, quartic

def bearings(K, uv):
    """Pixels -> unit ray directions in the camera frame."""
    r = np.c_[uv, np.ones(len(uv))] @ np.linalg.inv(K).T
    return r / np.linalg.norm(r, axis=1, keepdims=True)

R0, t0 = cams_true[3]
sel = [17, 87, 8]                                           # two ground points, one on the tall box
uv3, _ = project(K, R0, t0, X_true[sel])
poses, quartic = p3p(X_true[sel], bearings(K, uv3))
print("quartic coefficients (v^0..v^4):", quartic.round(3))
uv4 = project(K, R0, t0, X_true[[60]])[0]                  # a fourth point decides
for R, t in poses:
    e4 = np.linalg.norm(project(K, R, t, X_true[[60]])[0] - uv4)
    print("centre", (-R.T @ t).round(3), " |R - R_true| = %.1e" % np.linalg.norm(R - R0),
          " 4th point off by %.1f px" % e4)
print("true centre", (-R0.T @ t0).round(3))

# ===== snippet 3: EPnP and DLT =====
def epnp(Xw, uv, K):
    """EPnP with the single-null-vector solution (the paper's N = 1 case)."""
    cw = Xw.mean(0)                                          # control points: centroid ...
    U, S, Vt = np.linalg.svd(Xw - cw, full_matrices=False)
    C = np.vstack([cw, cw + (S[:, None] / np.sqrt(len(Xw))) * Vt])   # ... plus principal axes
    alpha = np.linalg.solve(np.vstack([C.T, np.ones(4)]), np.vstack([Xw.T, np.ones(len(Xw))])).T
    xn = (uv - K[:2, 2]) / np.diag(K)[:2]                    # normalized image coordinates
    M = np.zeros((2 * len(Xw), 12))
    for k in range(4):                                       # x c_z - c_x = 0, y c_z - c_y = 0, summed
        M[0::2, 3 * k] = alpha[:, k]; M[0::2, 3 * k + 2] = -alpha[:, k] * xn[:, 0]
        M[1::2, 3 * k + 1] = alpha[:, k]; M[1::2, 3 * k + 2] = -alpha[:, k] * xn[:, 1]
    v = np.linalg.svd(M)[2][-1].reshape(4, 3)                # camera-frame control points, up to scale
    dc = [np.linalg.norm(v[i] - v[j]) for i in range(4) for j in range(i)]
    dw = [np.linalg.norm(C[i] - C[j]) for i in range(4) for j in range(i)]
    Xc = alpha @ (v * (np.dot(dc, dw) / np.dot(dc, dc)))     # scale from the control-point distances
    if np.mean(Xc[:, 2]) < 0:
        Xc = -Xc                                              # points must be in front of the camera
    return absolute_orientation(Xw, Xc)

def dlt_pnp(Xw, uv, K):
    """Linear DLT for P = K[R|t] (post 02's DLT, one dimension up), then project onto SO(3)."""
    xn = (uv - K[:2, 2]) / np.diag(K)[:2]
    A = []
    for (X, Y, Z), (x, y) in zip(Xw, xn):
        A.append([X, Y, Z, 1, 0, 0, 0, 0, -x * X, -x * Y, -x * Z, -x])
        A.append([0, 0, 0, 0, X, Y, Z, 1, -y * X, -y * Y, -y * Z, -y])
    Pn = np.linalg.svd(np.array(A))[2][-1].reshape(3, 4)     # normalized [R|t] up to scale
    U, S, Vt = np.linalg.svd(Pn[:, :3])
    s = np.sign(np.linalg.det(U @ Vt))
    return s * U @ Vt, s * Pn[:, 3] / S.mean()

def pose_error(R, t, R0, t0):
    """Rotation error (deg) and camera-centre error."""
    ang = np.degrees(np.arccos(np.clip((np.trace(R @ R0.T) - 1) / 2, -1, 1)))
    return ang, np.linalg.norm(R.T @ t - R0.T @ t0)

rng_pnp = np.random.default_rng(0)
R0, t0 = cams_true[5]
uv_clean, _ = project(K, R0, t0, X_true)
for s_px in (0.5, 2.0):
    uvn = uv_clean + rng_pnp.normal(0, s_px, uv_clean.shape)
    for name, solver in (("DLT ", dlt_pnp), ("EPnP", epnp)):
        e = pose_error(*solver(X_true, uvn, K), R0, t0)
        print(f"sigma {s_px} px, {name}: rotation {e[0]:.3f} deg, centre {e[1]:.4f}")

# ===== snippet 4: motion-only refinement and RANSAC =====
def project_jac(K, R, t, X):
    """Pixels of X (N x 3) and their Jacobians w.r.t. the pose update (N x 2 x 6) and X (N x 2 x 3).
    Pose update: R <- exp([dw]x) R, t <- exp([dw]x) t + dt, i.e. Xc <- Xc + dw x Xc + dt."""
    Xc = X @ R.T + t
    x, y, z = Xc.T
    fx, fy = K[0, 0], K[1, 1]
    dpi = np.zeros((len(X), 2, 3))                           # d pixel / d Xc
    dpi[:, 0, 0] = fx / z; dpi[:, 0, 2] = -fx * x / z**2
    dpi[:, 1, 1] = fy / z; dpi[:, 1, 2] = -fy * y / z**2
    dXc_dw = -np.array([skew(p) for p in Xc])                # d (dw x Xc) / d dw = -[Xc]x
    J_pose = np.concatenate([dpi @ dXc_dw, dpi], axis=2)
    J_point = dpi @ R
    uv = (Xc[:, :2] / Xc[:, 2:]) @ K[:2, :2].T + K[:2, 2]
    return uv, J_pose, J_point

def refine_pose(R, t, Xw, uv, K, iters=10):
    """Gauss-Newton on the reprojection error of one camera (points fixed): motion-only BA."""
    for _ in range(iters):
        pred, Jp, _ = project_jac(K, R, t, Xw)
        r = (pred - uv).ravel()
        J = Jp.reshape(-1, 6)
        d = np.linalg.solve(J.T @ J, -J.T @ r)
        dR = rodrigues(d[:3])
        R, t = dR @ R, dR @ t + d[3:]
    return R, t

def ransac_pnp(Xw, uv, K, thresh=2.0, p=0.99, max_iters=1000, rng=np.random.default_rng(1)):
    f = bearings(K, uv)
    best, best_inl, N, k = None, np.zeros(len(uv), bool), max_iters, 0
    while k < N:
        k += 1
        sample = rng.choice(len(uv), 3, replace=False)
        for R, t in p3p(Xw[sample], f[sample])[0]:          # up to 4 hypotheses per sample
            pred, depth = project(K, R, t, Xw)
            inl = (np.linalg.norm(pred - uv, axis=1) < thresh) & (depth > 0)
            if inl.sum() > best_inl.sum():
                best, best_inl = (R, t), inl
                w = inl.mean()                                # adaptive stopping (post 03)
                N = min(max_iters, int(np.ceil(np.log(1 - p) / np.log(1 - w**3))))
    R, t = best
    for _ in range(2):                                       # refit on all inliers, re-score
        R, t = refine_pose(R, t, Xw[best_inl], uv[best_inl], K)
        pred, depth = project(K, R, t, Xw)
        best_inl = (np.linalg.norm(pred - uv, axis=1) < thresh) & (depth > 0)
    return (R, t), best_inl, k

uvn = uv_clean + rng_pnp.normal(0, 1.0, uv_clean.shape)
bad = rng_pnp.random(len(uvn)) < 0.4                         # 40% gross outliers
uvn[bad] = rng_pnp.uniform([0, 0], [W, H], (bad.sum(), 2))
(R, t), inl, k = ransac_pnp(X_true, uvn, K)
e = pose_error(R, t, R0, t0)
print(f"RANSAC: {k} samples, {inl.sum()} inliers (true {(~bad).sum()}), "
      f"wrongly accepted {np.sum(inl & bad)}, rotation {e[0]:.3f} deg, centre {e[1]:.4f}")
e = pose_error(*epnp(X_true, uvn, K), R0, t0)
print(f"EPnP on all points: rotation {e[0]:.1f} deg, centre {e[1]:.2f}")

# ===== snippet 5: Jacobian check =====
R0, t0 = cams_true[3]
Xs = X_true[:5]
_, Jp, Jx = project_jac(K, R0, t0, Xs)
eps = 1e-6
num_pose = np.zeros((5, 2, 6)); num_pt = np.zeros((5, 2, 3))
for k in range(6):
    d = np.zeros(6); d[k] = eps
    dR = rodrigues(d[:3])
    num_pose[:, :, k] = (project(K, dR @ R0, dR @ t0 + d[3:], Xs)[0] - project(K, R0, t0, Xs)[0]) / eps
for k in range(3):
    d = np.zeros(3); d[k] = eps
    num_pt[:, :, k] = (project(K, R0, t0, Xs + d)[0] - project(K, R0, t0, Xs)[0]) / eps
print("max |analytic - numeric|: pose %.1e, point %.1e (largest entry %.0f)"
      % (np.abs(Jp - num_pose).max(), np.abs(Jx - num_pt).max(), np.abs(Jp).max()))

# ===== snippet 6: bundle adjustment with the Schur complement =====
def robust_weight(s, kernel, delta):
    """rho(s) and w = rho'(s) for squared residual norms s (Ceres-style kernels)."""
    if kernel == "l2":
        return s, np.ones_like(s)
    if kernel == "huber":
        r = np.sqrt(s)
        return (np.where(r <= delta, s, 2 * delta * r - delta**2),
                np.where(r <= delta, 1.0, delta / np.maximum(r, 1e-12)))
    if kernel == "cauchy":
        return delta**2 * np.log1p(s / delta**2), 1.0 / (1.0 + s / delta**2)

def residuals(cams, X, obs_set):
    ci, pj, uv = obs_set
    r = np.zeros_like(uv)
    for i, (R, t) in enumerate(cams):
        sel = ci == i
        r[sel] = project(K, R, t, X[pj[sel]])[0] - uv[sel]
    return r

def ba_cost(cams, X, obs_set, kernel="l2", delta=1.0):
    r = residuals(cams, X, obs_set)
    return robust_weight((r * r).sum(1), kernel, delta)[0].sum()

def ba_step(cams, X, obs_set, lam, fixed, kernel="l2", delta=1.0):
    """One damped Gauss-Newton step: build the normal equations block by block,
    eliminate the points with the Schur complement, solve for the cameras, back-substitute."""
    ci, pj, uv = obs_set
    m, n = len(cams), len(X)
    Jc = np.zeros((len(ci), 2, 6)); Jx = np.zeros((len(ci), 2, 3)); r = np.zeros((len(ci), 2))
    for i, (R, t) in enumerate(cams):
        sel = ci == i
        pred, Jc[sel], Jx[sel] = project_jac(K, R, t, X[pj[sel]])
        r[sel] = pred - uv[sel]
    w = robust_weight((r * r).sum(1), kernel, delta)[1]      # IRLS weight of each observation
    B = np.zeros((m, 6, 6)); gc = np.zeros((m, 6))          # camera blocks  B_i = sum J_c^T J_c
    C = np.zeros((n, 3, 3)); gp = np.zeros((n, 3))          # point blocks   C_j = sum J_x^T J_x
    np.add.at(B, ci, np.einsum("k,kai,kaj->kij", w, Jc, Jc))
    np.add.at(gc, ci, np.einsum("k,kai,ka->ki", w, Jc, r))
    np.add.at(C, pj, np.einsum("k,kai,kaj->kij", w, Jx, Jx))
    np.add.at(gp, pj, np.einsum("k,kai,ka->ki", w, Jx, r))
    E = np.zeros((m, 6, n, 3))                               # coupling blocks E_ij = J_c^T J_x
    E[ci, :, pj, :] = np.einsum("k,kai,kaj->kij", w, Jc, Jx) # (stored densely here for clarity)
    B += lam * np.einsum("kii->ki", B)[:, :, None] * np.eye(6)   # Marquardt damping
    C += lam * np.einsum("kii->ki", C)[:, :, None] * np.eye(3)
    Cinv = np.linalg.inv(C)                                  # n independent 3 x 3 inverses
    E = E.reshape(6 * m, 3 * n)
    ECinv = np.einsum("ajk,jkl->ajl", E.reshape(6 * m, n, 3), Cinv).reshape(6 * m, 3 * n)
    S = -ECinv @ E.T                                         # S = B - E C^-1 E^T
    for i in range(m):
        S[6 * i:6 * i + 6, 6 * i:6 * i + 6] += B[i]
    b = -gc.ravel() + ECinv @ gp.ravel()                     # b = -g_c + E C^-1 g_p
    free = np.ones(6 * m, bool)
    for i in fixed:
        free[6 * i:6 * i + 6] = False                       # hold these cameras still
    dc = np.zeros(6 * m)
    dc[free] = np.linalg.solve(S[np.ix_(free, free)], b[free])
    dX = -gp - (E.T @ dc).reshape(n, 3)                      # back-substitution, point by point:
    dX = np.einsum("kij,kj->ki", Cinv, dX)                   # dX_j = C_j^-1 (-g_pj - sum_i E_ij^T dc_i)
    new_cams = []
    for (R, t), d in zip(cams, dc.reshape(m, 6)):
        dR = rodrigues(d[:3])
        new_cams.append((dR @ R, dR @ t + d[3:]))
    return new_cams, X + dX, S

def bundle_adjust(cams, X, obs_set, fixed=(0,), iters=50, lam=1e-3, kernel="l2", delta=1.0):
    """Levenberg-Marquardt on the (robust) reprojection error, as in post 02."""
    cost = ba_cost(cams, X, obs_set, kernel, delta)
    log = [(cost, lam)]
    for it in range(iters):
        while True:
            new_cams, new_X, S = ba_step(cams, X, obs_set, lam, fixed, kernel, delta)
            new_cost = ba_cost(new_cams, new_X, obs_set, kernel, delta)
            if new_cost < cost:
                break
            lam *= 4                                         # reject: damp harder
            if lam > 1e10:
                return cams, X, log
        done = cost - new_cost < 1e-10 * cost
        cams, X, cost, lam = new_cams, new_X, new_cost, lam / 3
        log.append((cost, lam))
        if done:
            break
    return cams, X, log

obs_all = (cam_idx, pt_idx, uv_obs)
rng_init = np.random.default_rng(3)                           # a perturbed start:
cams0 = [cams_true[0]]                                       # rotations off by ~2 deg,
for R, t in cams_true[1:]:                                   # centres and points by ~0.15
    dR = rodrigues(rng_init.normal(0, np.deg2rad(2.0), 3))
    Cc = -R.T @ t + rng_init.normal(0, 0.15, 3)
    cams0.append((dR @ R, -(dR @ R) @ Cc))
X0 = X_true + rng_init.normal(0, 0.15, X_true.shape)

cams_ba, X_ba, log = bundle_adjust(cams0, X0, obs_all)
S = ba_step(cams_ba, X_ba, obs_all, 0.0, (0,))[2]
print("normal equations %d x %d, Schur complement %d x %d" % (6 * m + 3 * n, 6 * m + 3 * n, *S.shape))
for it in (0, 1, 2, 3, len(log) - 1):
    print("iteration %2d: rms %.4f px  lambda %.1e" % (it, np.sqrt(log[it][0] / L), log[it][1]))
dof = 2 * L - (6 * m + 3 * n - 7)
print("expected rms at the optimum: sigma * sqrt(dof / L) = %.4f px" % (sigma * np.sqrt(dof / L)))
print("rms with the true cameras and points: %.4f px" % np.sqrt(ba_cost(cams_true, X_true, obs_all) / L))

# ===== snippet 7: accuracy after a similarity alignment =====
def umeyama(A, B):
    """Similarity (s, R, t) minimizing sum |s R A_k + t - B_k|^2 (Umeyama 1991)."""
    a, b = A.mean(0), B.mean(0)
    U, D, Vt = np.linalg.svd((B - b).T @ (A - a) / len(A))
    S = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])
    R = U @ S @ Vt
    s = np.trace(np.diag(D) @ S) / ((A - a) ** 2).sum(1).mean()
    return s, R, b - s * R @ a

def centres(cams):
    return np.array([-R.T @ t for R, t in cams])

def errors(cams, X):
    """Camera-centre and point RMSE after aligning (cameras + points) to the truth."""
    s, Ra, ta = umeyama(np.vstack([centres(cams), X]), np.vstack([centres(cams_true), X_true]))
    ec = centres(cams) @ (s * Ra).T + ta - centres(cams_true)
    ex = X @ (s * Ra).T + ta - X_true
    return np.sqrt((ec**2).sum(1).mean()), np.sqrt((ex**2).sum(1).mean())

print("start: centre RMSE %.4f, point RMSE %.4f" % errors(cams0, X0))
print("after BA: centre RMSE %.4f, point RMSE %.4f" % errors(cams_ba, X_ba))

# ===== snippet 8: the gauge =====
def full_jacobian(cams, X, obs_set):
    ci, pj, _ = obs_set
    J = np.zeros((2 * len(ci), 6 * len(cams) + 3 * len(X)))
    for i, (R, t) in enumerate(cams):
        sel = np.flatnonzero(ci == i)
        _, Jc, Jx = project_jac(K, R, t, X[pj[sel]])
        for k, o in enumerate(sel):
            J[2 * o:2 * o + 2, 6 * i:6 * i + 6] = Jc[k]
            J[2 * o:2 * o + 2, 6 * len(cams) + 3 * pj[o]:6 * len(cams) + 3 * pj[o] + 3] = Jx[k]
    return J

J = full_jacobian(cams_ba, X_ba, obs_all)
ev = np.linalg.eigvalsh(J.T @ J)
print("J is %d x %d, rank %d" % (*J.shape, np.linalg.matrix_rank(J)))
print("eigenvalues of J^T J: 7 smallest all below %.0e, then %.0f, %.0f, ..., largest %.1e"
      % (np.abs(ev[:7]).max(), ev[7], ev[8], ev[-1]))

# ===== snippet 9: robust kernels =====
rng_out = np.random.default_rng(7)
uv_bad = uv_obs.copy()
bad_obs = rng_out.random(L) < 0.05                           # 5% of the observations are wrong:
nb = bad_obs.sum()                                           # bad matches 10-60 px away
uv_bad[bad_obs] += rng_out.uniform(10, 60, (nb, 2)) * rng_out.choice([-1, 1], (nb, 2))
obs_bad = (cam_idx, pt_idx, uv_bad)
print("outlier observations:", bad_obs.sum())
for kernel in ("l2", "huber", "cauchy"):
    c, X_, log_ = bundle_adjust(cams0, X0, obs_bad, kernel=kernel, delta=1.0)
    r = np.linalg.norm(residuals(c, X_, obs_bad), axis=1)
    print("%-6s centre RMSE %.4f, point RMSE %.4f, median inlier residual %.3f px, %d iterations"
          % (kernel, *errors(c, X_), np.median(r[~bad_obs]), len(log_) - 1))

# ===== snippet 10: two-view tools from post 04, in brief =====
def essential_8pt(f1, f2):
    """Linear 8-point estimate of E (f2^T E f1 = 0) from unit bearings, projected to rank 2."""
    A = np.einsum("ni,nj->nij", f2, f1).reshape(-1, 9)
    U, _, Vt = np.linalg.svd(np.linalg.svd(A)[2][-1].reshape(3, 3))
    return U @ np.diag([1.0, 1.0, 0.0]) @ Vt

def triangulate(poses, f):
    """Multi-view DLT: poses [(R, t)], f the matching bearings (one per view)."""
    A = []
    for (R, t), b in zip(poses, f):
        P = np.c_[R, t]
        A += [b[0] * P[2] - b[2] * P[0], b[1] * P[2] - b[2] * P[1]]
    Xh = np.linalg.svd(np.array(A))[2][-1]
    return Xh[:3] / Xh[3]

def pose_from_E(E, f1, f2):
    """The four (R, t) of E; keep the one that puts most points in front of both cameras."""
    U, _, Vt = np.linalg.svd(E)
    U, Vt = U * np.sign(np.linalg.det(U)), Vt * np.sign(np.linalg.det(Vt))
    Wm = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1.0]])
    best, best_n = None, -1
    for R in (U @ Wm @ Vt, U @ Wm.T @ Vt):
        for t in (U[:, 2], -U[:, 2]):
            Xs = np.array([triangulate([(np.eye(3), np.zeros(3)), (R, t)], [a, b]) for a, b in zip(f1, f2)])
            n_front = np.sum((Xs[:, 2] > 0) & ((Xs @ R.T + t)[:, 2] > 0))   # cheirality
            if n_front > best_n:
                best, best_n = (R, t), n_front
    return best

# ===== snippet 11: a corridor scene and incremental SfM =====
rng_c = np.random.default_rng(11)
Xw_c = np.c_[rng_c.uniform(-4, 26, 900), rng_c.uniform(-1.5, 1.5, 900), rng_c.uniform(4, 12, 900)]
cams_c = []                                                  # 30 cameras walking along x,
for k in range(30):                                         # looking at points 4-12 m away
    R = rodrigues([0, np.deg2rad(rng_c.normal(0, 4)), 0])
    cams_c.append((R, -R @ np.array([0.7 * k, 0, 0])))
obs_c = {}                                                   # (i, j) -> observed pixel
for i, (R, t) in enumerate(cams_c):
    uv, depth = project(K, R, t, Xw_c)
    for j in np.flatnonzero((depth > 0) & (uv[:, 0] >= 0) & (uv[:, 0] < W) & (uv[:, 1] >= 0) & (uv[:, 1] < H)):
        obs_c[i, j] = uv[j] + rng_c.normal(0, 1.0, 2)
print("corridor: %d cameras, %d points, %d observations" % (len(cams_c), len(Xw_c), len(obs_c)))

def obs_arrays(reg, pts):
    """Observations among registered cameras and triangulated points, re-indexed for BA."""
    ci = {c: k for k, c in enumerate(reg)}; pj = {p: k for k, p in enumerate(pts)}
    keys = [(i, j) for (i, j) in obs_c if i in ci and j in pj]
    return (np.array([ci[i] for i, _ in keys]), np.array([pj[j] for _, j in keys]),
            np.array([obs_c[k] for k in keys]))

def incremental_sfm(init=(0, 4), use_ba=True, min_angle=2.0):
    i0, i1 = init
    common = [j for j in range(len(Xw_c)) if (i0, j) in obs_c and (i1, j) in obs_c]
    f0 = bearings(K, np.array([obs_c[i0, j] for j in common]))
    f1 = bearings(K, np.array([obs_c[i1, j] for j in common]))
    poses = {i0: (np.eye(3), np.zeros(3)), i1: pose_from_E(essential_8pt(f0, f1), f0, f1)}
    points, order = {}, [i0, i1]

    def add_points():
        for j in range(len(Xw_c)):
            if j in points:
                continue
            seen = [i for i in poses if (i, j) in obs_c]
            if len(seen) < 2:
                continue
            f = [bearings(K, obs_c[i, j][None])[0] for i in seen]
            X = triangulate([poses[i] for i in seen], f)
            rays = [poses[i][0].T @ fi for i, fi in zip(seen, f)]           # world-frame rays
            angle = max(np.degrees(np.arccos(np.clip(a @ b, -1, 1))) for a in rays for b in rays)
            ok = angle >= min_angle
            for i in seen:
                uv, d = project(K, *poses[i], X[None])
                ok &= d[0] > 0 and np.linalg.norm(uv[0] - obs_c[i, j]) < 4.0
            if ok:
                points[j] = X

    def run_ba():
        reg, pts = list(poses), list(points)
        cams, X, _ = bundle_adjust([poses[i] for i in reg], np.array([points[j] for j in pts]),
                                   obs_arrays(reg, pts), fixed=(0,), kernel="huber", delta=2.0)
        poses.update(zip(reg, cams)); points.update(zip(pts, X))

    add_points()
    if use_ba:
        run_ba()
    while len(poses) < len(cams_c):
        counts = {i: sum((i, j) in obs_c for j in points) for i in range(len(cams_c)) if i not in poses}
        i = max(counts, key=counts.get)                    # next view: sees most 3D points
        js = [j for j in points if (i, j) in obs_c]
        Xw = np.array([points[j] for j in js]); uv = np.array([obs_c[i, j] for j in js])
        R, t = epnp(Xw, uv, K)
        poses[i] = refine_pose(R, t, Xw, uv, K)
        order.append(i)
        add_points()
        if use_ba:
            run_ba()                                        # COLMAP: local BA here, global BA now and then
    return poses, points, order

def trajectory_errors(poses):
    """Centre errors after aligning the initial pair (gauge of the reconstruction) to the truth."""
    est = np.array([-poses[i][0].T @ poses[i][1] for i in range(len(cams_c))])
    tru = np.array([-R.T @ t for R, t in cams_c])
    R0 = cams_c[0][0]                                       # camera 0 defines the frame,
    s = np.linalg.norm(tru[4] - tru[0]) / np.linalg.norm(est[4])   # the initial baseline the scale
    aligned = (s * est - cams_c[0][1]) @ R0                 # camera-0 frame -> world: R0^T (X - t0)
    return np.linalg.norm(aligned - tru, axis=1), aligned

runs = {}
for use_ba in (False, True):
    runs[use_ba] = poses, points, order = incremental_sfm(use_ba=use_ba)
    err, _ = trajectory_errors(poses)
    print("BA %-5s: %d points, order %s..., centre error at cameras 0, 10, 20, 29: %s m"
          % (use_ba, len(points), order[:8], err[[0, 10, 20, 29]].round(3)))

# ===== snippet 12: a view graph with noisy and wrong relative rotations =====
def rot_angle(R):
    return np.degrees(np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1)))

rng_g = np.random.default_rng(21)
mg = 40                                                      # 40 cameras on a full circle
cams_g = [look_at(5.0 * np.array([np.sin(a), -0.4, -np.cos(a)]), (0, -0.5, 0))
          for a in np.linspace(0, 2 * np.pi, mg, endpoint=False)]
edges, R_rel = [], []
for i in range(mg):
    for j in range(i + 1, mg):
        if min(j - i, mg - (j - i)) <= 5:                  # neighbours up to 45 deg apart
            Rij = cams_g[j][0] @ cams_g[i][0].T              # R_ij = R_j R_i^T maps frame i to frame j
            if rng_g.random() < 0.08:                        # 8% of the pairs are simply wrong
                Rij = rodrigues(rng_g.normal(0, 1, 3)) @ Rij
            else:
                Rij = rodrigues(rng_g.normal(0, np.deg2rad(1.5), 3)) @ Rij
            edges.append((i, j)); R_rel.append(Rij)
print("%d cameras, %d relative rotations" % (mg, len(edges)))

# ===== snippet 13: rotation averaging =====
def project_so3(M):
    U, _, Vt = np.linalg.svd(M)
    return U @ np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))]) @ Vt

def rotation_averaging(m, edges, R_rel, iters=0, scale_deg=5.0):
    """Spectral relaxation of the chordal cost, then optional IRLS with Cauchy weights."""
    w = np.ones(len(edges))
    for it in range(iters + 1):
        G = np.zeros((3 * m, 3 * m)); deg = np.zeros(m)
        for (i, j), Rij, wk in zip(edges, R_rel, w):
            G[3 * j:3 * j + 3, 3 * i:3 * i + 3] = wk * Rij       # block (j, i) should be R_j R_i^T
            G[3 * i:3 * i + 3, 3 * j:3 * j + 3] = wk * Rij.T
            deg[[i, j]] += wk
        G = G / np.repeat(deg, 3)[:, None]                    # normalize each block row by its degree
        vals, vecs = np.linalg.eig(G)
        V = vecs[:, np.argsort(-vals.real)[:3]].real         # top 3 eigenvectors ~ [R_1; ...; R_m] O
        if np.sum([np.linalg.det(V[3 * k:3 * k + 3]) for k in range(m)]) < 0:
            V[:, 0] *= -1                                    # remove a global reflection
        Rs = [project_so3(V[3 * k:3 * k + 3]) for k in range(m)]
        res = np.array([rot_angle(Rs[j] @ Rs[i].T @ Rij.T) for (i, j), Rij in zip(edges, R_rel)])
        w = 1.0 / (1.0 + (res / scale_deg) ** 2)             # Cauchy IRLS weights for the next round
    return Rs, res

def chain_rotations(m, edges, R_rel):
    """Naive alternative: walk a spanning tree from camera 0 and compose relative rotations."""
    Rs = {0: np.eye(3)}
    while len(Rs) < m:
        for (i, j), Rij in zip(edges, R_rel):
            if i in Rs and j not in Rs:
                Rs[j] = Rij @ Rs[i]
            elif j in Rs and i not in Rs:
                Rs[i] = Rij.T @ Rs[j]
    return [Rs[k] for k in range(m)]

def rotation_errors(Rs):
    """Per-camera errors (deg) after removing the global rotation gauge."""
    O = project_so3(sum(Ri.T @ Rt for Ri, Rt in zip(Rs, (c[0] for c in cams_g))))
    return np.array([rot_angle(Ri @ O @ Rt.T) for Ri, (Rt, _) in zip(Rs, cams_g)])

for name, Rs in (("spanning tree", chain_rotations(mg, edges, R_rel)),
                 ("spectral L2", rotation_averaging(mg, edges, R_rel)[0]),
                 ("spectral + IRLS", rotation_averaging(mg, edges, R_rel, iters=10)[0])):
    e = rotation_errors(Rs)
    print("%-16s median %.2f deg, max %.2f deg" % (name, np.median(e), e.max()))

# ===== snippet 14: global positioning of cameras and points (GLOMAP-style) =====
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix

Rs_avg, res = rotation_averaging(mg, edges, R_rel, iters=10)
Og = project_so3(sum(Ri.T @ Rt for Ri, (Rt, _) in zip(Rs_avg, cams_g)))
Rs_avg = [Ri @ Og for Ri in Rs_avg]                           # express in the true frame, for plotting
obs_g = []
for i, (R, t) in enumerate(cams_g):
    uv, depth = project(K, R, t, X_true)
    for j in np.flatnonzero(depth > 0):
        f = bearings(K, (uv[j] + rng_g.normal(0, 0.5, 2))[None])[0]
        obs_g.append((i, j, Rs_avg[i].T @ f))                # the ray in world orientation
gi = np.array([o[0] for o in obs_g]); gj = np.array([o[1] for o in obs_g])
v = np.array([o[2] for o in obs_g]); Lg = len(obs_g)

def positioning_residuals(z):
    Cg, Xg, dg = z[:3 * mg].reshape(-1, 3), z[3 * mg:3 * (mg + n)].reshape(-1, 3), z[3 * (mg + n):]
    return (v - dg[:, None] * (Xg[gj] - Cg[gi])).ravel()     # v_ij - d_ij (X_j - c_i)

sparsity = lil_matrix((3 * Lg, 3 * (mg + n) + Lg), dtype=int)
for k in range(Lg):
    for a in range(3):
        sparsity[3 * k + a, 3 * gi[k] + a] = 1
        sparsity[3 * k + a, 3 * mg + 3 * gj[k] + a] = 1
        sparsity[3 * k + a, 3 * (mg + n) + k] = 1
z0 = np.r_[np.random.default_rng(0).uniform(-1, 1, 3 * (mg + n)), np.ones(Lg)]   # random start
lo = np.r_[np.full(3 * (mg + n), -np.inf), np.zeros(Lg)]     # d_ij >= 0
sol = least_squares(positioning_residuals, z0, jac_sparsity=sparsity, bounds=(lo, np.inf),
                    loss="soft_l1", f_scale=0.1, x_scale="jac")
Cg = sol.x[:3 * mg].reshape(-1, 3); Xg = sol.x[3 * mg:3 * (mg + n)].reshape(-1, 3)
Ctrue_g = np.array([-R.T @ t for R, t in cams_g])
s, Ra, ta = umeyama(np.vstack([Cg, Xg]), np.vstack([Ctrue_g, X_true]))
err_c = np.linalg.norm(Cg @ (s * Ra).T + ta - Ctrue_g, axis=1)
err_x = np.linalg.norm(Xg @ (s * Ra).T + ta - X_true, axis=1)
print("%d observations, %d function evaluations; after a similarity alignment: centre error "
      "median %.3f, max %.3f; point error median %.3f" % (Lg, sol.nfev, np.median(err_c), err_c.max(), np.median(err_x)))

# ===== snippet 15: the scale gauge =====
for s_ in (0.1, 1.0, 37.0):
    cams_s = [(R, s_ * t) for R, t in cams_ba]              # scale every translation ...
    print("scale %5.1f: rms %.6f px" % (s_, np.sqrt(ba_cost(cams_s, s_ * X_ba, obs_all) / L)))  # ... and every point

def drift_scale(poses):
    """Ratio of estimated to true distance between consecutive cameras (initial baseline = 1)."""
    est = np.array([-poses[i][0].T @ poses[i][1] for i in range(len(cams_c))])
    tru = np.array([-R.T @ t for R, t in cams_c])
    s = np.linalg.norm(tru[4] - tru[0]) / np.linalg.norm(est[4] - est[0])
    return s * np.linalg.norm(np.diff(est, axis=0), axis=1) / np.linalg.norm(np.diff(tru, axis=0), axis=1)

for use_ba in (False, True):
    ratio = drift_scale(runs[use_ba][0])
    print("BA %-5s: local scale at steps 1, 15, 28: %s" % (use_ba, ratio[[0, 14, 27]].round(3)))


# =============================================================================================
# figures
# =============================================================================================
from matplotlib.patches import Polygon  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402

P3P_SEL = [17, 87, 8]
GROUPS = [(slice(0, 40), C["gray"]), (slice(40, 80), C["b"]), (slice(80, 120), C["a"])]


def w3(P):
    """world (x, y, z), y down -> plot (x, z, -y)."""
    P = np.atleast_2d(P)
    return np.c_[P[:, 0], P[:, 2], -P[:, 1]]


def draw_frustum(ax, R, t, depth=0.7, color=C["z"], lw=1.4, label=None):
    Cc = -R.T @ t
    corners = np.array([[0, 0, 1], [W, 0, 1], [W, H, 1], [0, H, 1]], float) @ np.linalg.inv(K).T * depth
    pts = (corners - t) @ R                                  # camera frame -> world
    for p in pts:
        ax.plot(*w3(np.array([Cc, p])).T, color=color, lw=lw)
    ax.plot(*w3(np.vstack([pts, pts[:1]])).T, color=color, lw=lw)
    if label:
        ax.text(*w3(Cc + np.array([0, -0.35, 0]))[0], label, fontsize=13, color=color, ha="center")


def image_axes(ax, title=None):
    ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.set_aspect("equal")
    ax.add_patch(Polygon([[0, 0], [W, 0], [W, H], [0, H]], closed=True, fill=False, ec=C["gray"], lw=1.2))
    ax.set_xlabel("$u$ (px)"); ax.set_ylabel("$v$ (px)")
    ax.set_xticks([0, 160, 320, 480, 640]); ax.set_yticks([0, 120, 240, 360, 480])
    if title:
        ax.set_title(title)


def apply_delta(cams, X, d):
    """Apply a stacked update (6 per camera, then 3 per point) with the post's update rule."""
    m_ = len(cams)
    new = []
    for (R, t), dd in zip(cams, d[:6 * m_].reshape(-1, 6)):
        dR = rodrigues(dd[:3])
        new.append((dR @ R, dR @ t + dd[3:]))
    return new, X + d[6 * m_:].reshape(-1, 3)


# ---------------------------------------------------------------------------------------------
def fig_scene():
    fig = plt.figure(figsize=(11.5, 5.0))
    gs = fig.add_gridspec(1, 2, width_ratios=[1.35, 1])
    ax = fig.add_subplot(gs[0], projection="3d")
    for sl, col in GROUPS:
        ax.scatter(*w3(X_true[sl]).T, s=14, color=col, depthshade=False)
    for i, (R, t) in enumerate(cams_true):
        draw_frustum(ax, R, t, depth=1.0, label=str(i + 1))
    for j in P3P_SEL:                                   # three observation rays of camera 4
        Cc = -cams_true[3][0].T @ cams_true[3][1]
        ax.plot(*w3(np.array([Cc, X_true[j]])).T, color=C["x"], lw=1.0, ls="--")
    ax.set_xlim(-5, 5); ax.set_ylim(-5.2, 2.8); ax.set_zlim(0, 3)
    ax.set_zticks([0, 1, 2, 3])
    ax.set_box_aspect((10, 8, 3))
    ax.set_xlabel("$x$"); ax.set_ylabel("$z$"); ax.set_zlabel("$-y$")
    ax.view_init(elev=32, azim=-58)
    ax.tick_params(labelsize=10)
    ax2 = fig.add_subplot(gs[1])
    image_axes(ax2, None)
    sel = cam_idx == 3
    for sl, col in GROUPS:
        idx = sel & (pt_idx >= sl.start) & (pt_idx < sl.stop)
        ax2.plot(uv_obs[idx, 0], uv_obs[idx, 1], "o", color=col, ms=5)
    for j in P3P_SEL:
        k = np.flatnonzero(sel & (pt_idx == j))[0]
        ax2.plot(*uv_obs[k], "o", ms=13, mfc="none", mec=C["x"], mew=2)
    ax2.set_title("$i = 4$")
    fig.tight_layout()
    out(fig, "05-scene.svg")


# ---------------------------------------------------------------------------------------------
def fig_p3p():
    R0, t0 = cams_true[3]
    sel = P3P_SEL
    uv3, _ = project(K, R0, t0, X_true[sel])
    f = bearings(K, uv3)
    poses, quartic = p3p(X_true[sel], f)
    fig = plt.figure(figsize=(11.5, 5.0))
    gs = fig.add_gridspec(1, 2, width_ratios=[1.25, 1])
    ax = fig.add_subplot(gs[0], projection="3d")
    P3 = X_true[sel]
    ax.add_collection3d(Poly3DCollection([w3(P3)], facecolor=C["fill"], edgecolor=C["dark"], lw=1.5, alpha=0.8))
    for k, p in enumerate(P3):
        ax.text(*(w3(p)[0] + [0.05, 0, -0.55]), f"$\\mathbf{{X}}_{k + 1}$", fontsize=15)
    cols = [C["a"], C["b"], C["c"], C["y"]]
    for k, (R, t) in enumerate(poses):
        Cc = -R.T @ t
        for p in P3:
            ax.plot(*w3(np.array([Cc, p])).T, color=cols[k], lw=1.6)
        ax.scatter(*w3(Cc).T, s=50, color=cols[k], depthshade=False)
        off = ([-0.5, 0, 0.35], [0.1, 0, 0.45], [0.25, 0, -0.1], [0.2, 0, 0.3])[k]
        ax.text(*(w3(Cc)[0] + off), f"$\\mathbf{{C}}^{{({k + 1})}}$", fontsize=16, color=cols[k])
    ax.set_box_aspect((5.5, 7.5, 5.5))
    ax.set_xlim(-3, 2.5); ax.set_ylim(-5.5, 2); ax.set_zlim(-2.5, 3)
    ax.set_xlabel("$x$"); ax.set_ylabel("$z$"); ax.set_zlabel("$-y$")
    ax.view_init(elev=14, azim=-72)
    ax.tick_params(labelsize=10)
    ax2 = fig.add_subplot(gs[1])
    vv = np.linspace(0.3, 1.8, 400)
    ax2.plot(vv, np.polynomial.polynomial.polyval(vv, quartic), color=C["dark"])
    ax2.axhline(0, color=C["gray"], lw=1)
    roots = np.polynomial.polynomial.polyroots(quartic)
    ylim = 1.3 * np.abs(np.polynomial.polynomial.polyval(vv, quartic)[(vv > 0.45) & (vv < 1.7)]).max()
    real = sorted(r.real for r in roots if abs(r.imag) < 1e-8 and r.real > 0)
    for k, r in enumerate(real):
        ax2.plot(r, 0, "o", ms=11, color=cols[k])
        ax2.annotate(f"$v_{k + 1}={r:.3f}$", (r, 0), (r - 0.12, (0.5 if k % 2 else -0.6) * ylim), fontsize=14,
                     color=cols[k], arrowprops=dict(arrowstyle="-", color=cols[k]))
    ax2.set_xlabel("$v = s_3 / s_1$"); ax2.set_ylabel("$q(v)$")
    ax2.set_ylim(-ylim, ylim)
    fig.tight_layout()
    out(fig, "05-p3p.svg")
    print("p3p roots:", np.round(real, 4), "all roots", np.round(roots, 4))


# ---------------------------------------------------------------------------------------------
def fig_pnp():
    rng_f = np.random.default_rng(42)
    sigmas = [0.25, 0.5, 1, 2, 4]
    R0, t0 = cams_true[5]
    uv_c, _ = project(K, R0, t0, X_true)
    res = {}
    for npts in (120, 12):
        for name in ("DLT", "EPnP", "EPnP+GN"):
            res[name, npts] = []
        for s_px in sigmas:
            errs = {k: [] for k in ("DLT", "EPnP", "EPnP+GN")}
            for trial in range(200):
                idx = rng_f.choice(120, npts, replace=False)
                uvn = uv_c[idx] + rng_f.normal(0, s_px, (npts, 2))
                Rd, td = dlt_pnp(X_true[idx], uvn, K)
                Re, te = epnp(X_true[idx], uvn, K)
                Rg, tg = refine_pose(Re, te, X_true[idx], uvn, K)
                errs["DLT"].append(pose_error(Rd, td, R0, t0)[0])
                errs["EPnP"].append(pose_error(Re, te, R0, t0)[0])
                errs["EPnP+GN"].append(pose_error(Rg, tg, R0, t0)[0])
            for k in errs:
                res[k, npts].append(np.median(errs[k]))
    fig, axs = plt.subplots(1, 2, figsize=(11.5, 5.0))
    ax = axs[0]
    cols = {"DLT": C["x"], "EPnP": C["b"], "EPnP+GN": C["a"]}
    for (name, npts), vals in res.items():
        ax.loglog(sigmas, vals, "o-" if npts == 120 else "s--", color=cols[name],
                  label=f"{name}, $n={npts}$")
    ax.set_xlabel("$\\sigma$ (px)"); ax.set_ylabel("median $\\Delta R$ (deg)")
    ax.set_xticks(sigmas); ax.set_xticklabels(["0.25", "0.5", "1", "2", "4"])
    ax.xaxis.set_minor_formatter(plt.NullFormatter())
    ax.set_ylim(0.01, 100)
    ax.legend(fontsize=12, ncol=2, loc="upper left")
    print("PnP medians:", {k: np.round(v, 3).tolist() for k, v in res.items()})
    ax = axs[1]
    eps_t = np.linspace(0.05, 0.8, 100)
    for s_, col in ((3, C["a"]), (4, C["c"]), (6, C["x"])):
        ax.semilogy(eps_t, [np.log(0.01) / np.log(1 - (1 - e) ** s_) for e in eps_t], color=col,
                    label=f"$s={s_}$")
    eps_m, ks = [0.2, 0.4, 0.6, 0.7], []
    for e in eps_m:
        kk = []
        for trial in range(20):
            uvn = uv_c + rng_f.normal(0, 1.0, uv_c.shape)
            bad = rng_f.random(120) < e
            uvn[bad] = rng_f.uniform([0, 0], [W, H], (bad.sum(), 2))
            kk.append(ransac_pnp(X_true, uvn, K, max_iters=5000, rng=rng_f)[2])
        ks.append(np.mean(kk))
    ax.semilogy(eps_m, ks, "o", color=C["a"], ms=10, mfc="white", mew=2.2)
    ax.set_xlabel("$\\varepsilon$"); ax.set_ylabel("$N$")
    ax.legend(fontsize=13)
    fig.tight_layout()
    out(fig, "05-pnp.svg")
    print("RANSAC mean samples at eps", eps_m, ":", np.round(ks, 1),
          "theory s=3:", [int(np.ceil(np.log(0.01) / np.log(1 - (1 - e) ** 3))) for e in eps_m])


# ---------------------------------------------------------------------------------------------
def fig_sparsity():
    reg = list(range(30))
    js = sorted({j for (i, j) in obs_c if j % 4 == 0 and sum((k, j) in obs_c for k in reg) >= 2},
                key=lambda j: Xw_c[j, 0])
    keys = sorted([(i, j) for (i, j) in obs_c if i in reg and j in js], key=lambda k: (k[0], Xw_c[k[1], 0]))
    pj_map = {j: k for k, j in enumerate(js)}
    ci = np.array([i for i, _ in keys]); pj = np.array([pj_map[j] for _, j in keys])
    uvs = np.array([project(K, *cams_c[i], Xw_c[j][None])[0][0] for i, j in keys])
    cams = [cams_c[i] for i in reg]; X = Xw_c[js]
    J = full_jacobian(cams, X, (ci, pj, uvs))
    Hm = J.T @ J
    S = ba_step(cams, X, (ci, pj, uvs), 0.0, ())[2]
    m_, n_ = len(reg), len(js)
    fig = plt.figure(figsize=(11.5, 4.6))
    gs = fig.add_gridspec(1, 3, width_ratios=[1.0, 1.25, 1.0])
    ax = fig.add_subplot(gs[0])
    ax.imshow(J != 0, cmap="Greys", aspect="auto", interpolation="nearest")
    ax.axvline(6 * m_ - 0.5, color=C["x"], lw=1.5)
    ax.set_title(f"$J$: ${J.shape[0]}\\times{J.shape[1]}$")
    ax.set_xticks([3 * m_, 6 * m_ + 3 * n_ / 2]); ax.set_xticklabels(["$\\mathbf{c}$", "$\\mathbf{X}$"])
    ax.set_yticks([])
    ax = fig.add_subplot(gs[1])
    ax.imshow(Hm != 0, cmap="Greys", interpolation="nearest")
    ax.axvline(6 * m_ - 0.5, color=C["x"], lw=1.5); ax.axhline(6 * m_ - 0.5, color=C["x"], lw=1.5)
    for txt, (x, y) in (("$B$", (6 * m_ / 2, 6 * m_ / 2)), ("$E$", (6 * m_ + 3 * n_ * 0.75, 6 * m_ / 2)),
                        ("$E^\\top$", (6 * m_ / 2, 6 * m_ + 3 * n_ * 0.75)), ("$C$", (6 * m_ + 3 * n_ * 0.2, 6 * m_ + 3 * n_ * 0.75))):
        ax.text(x, y, txt, fontsize=20, color=C["x"], ha="center", va="center",
                bbox=dict(fc="white", ec="none", alpha=0.85))
    ax.set_title(f"$H=J^\\top J$: ${Hm.shape[0]}\\times{Hm.shape[1]}$")
    ax.set_xticks([]); ax.set_yticks([])
    ax = fig.add_subplot(gs[2])
    shared = np.zeros((m_, m_), int)                          # points seen by both cameras
    for j in range(n_):
        cs = np.unique(ci[pj == j])
        shared[np.ix_(cs, cs)] += 1
    ax.imshow(np.where(shared > 0, shared, np.nan), cmap="Purples", interpolation="nearest",
              vmin=-10, vmax=shared.max())
    ax.set_title(f"$S$: ${S.shape[0]}\\times{S.shape[1]}$ ($6\\times 6$)")
    ax.set_xticks(range(0, m_, 5)); ax.set_yticks(range(0, m_, 5)); ax.tick_params(labelsize=11)
    ax.grid(False)
    fig.tight_layout()
    out(fig, "05-sparsity.svg")
    blocks = [(i, k) for i in range(m_) for k in range(m_)
              if np.abs(S[6 * i:6 * i + 6, 6 * k:6 * k + 6]).max() > 1e-9 * np.abs(S).max()]
    print("sparsity: %d cameras, %d points, %d observations; J %s, nnz(J) %.2f%%, nnz(H) %.2f%%, "
          "S nonzero blocks %d of %d, shared>0 %d" % (m_, n_, len(keys), J.shape, 100 * np.mean(J != 0),
                                         100 * np.mean(Hm != 0), len(blocks), m_ * m_, (shared > 0).sum()))


# ---------------------------------------------------------------------------------------------
def top_view(ax, cams, X, col, label=None, ms=9, zorder=3, lw=None):
    Cc = centres(cams)
    ax.plot(X[:, 0], X[:, 2], ".", color=col, ms=4, alpha=0.8, zorder=zorder)
    ax.plot(Cc[:, 0], Cc[:, 2], "^", color=col, ms=ms, label=label, zorder=zorder + 1)
    for R, t in cams:                                        # viewing direction
        c, d = -R.T @ t, R[2] * 0.8
        ax.plot([c[0], c[0] + d[0]], [c[2], c[2] + d[2]], color=col, lw=1.4, zorder=zorder)


def aligned(cams, X):
    s, Ra, ta = umeyama(np.vstack([centres(cams), X]), np.vstack([centres(cams_true), X_true]))
    return [(R @ Ra.T, s * t - R @ Ra.T @ ta) for R, t in cams], s * X @ Ra.T + ta


def fig_ba():
    fig = plt.figure(figsize=(10, 8.6))
    gs = fig.add_gridspec(2, 2, height_ratios=[0.8, 1])
    axs = [fig.add_subplot(gs[0, :]), fig.add_subplot(gs[1, 0]), fig.add_subplot(gs[1, 1])]
    ax = axs[0]
    rmss = [np.sqrt(c / L) for c, _ in log]
    ax.semilogy(range(len(log)), rmss, "o-", color=C["a"], label="RMS (px)")
    ax.axhline(sigma * np.sqrt(dof / L), color=C["dark"], ls=":", lw=1.5)
    ax.set_xlabel("$k$"); ax.set_ylabel("RMS (px)", color=C["a"])
    ax2 = ax.twinx()
    ax2.semilogy(range(len(log)), [l_ for _, l_ in log], "s--", color=C["b"])
    ax2.set_ylabel("$\\lambda$", color=C["b"]); ax2.grid(False)
    ax2.spines["right"].set_visible(True)
    for k, r in enumerate(rmss[:3]):
        ax.annotate(f"{r:.2f}", (k, r), (k + 0.3, r * (0.55 if k == 0 else 1.25)), fontsize=13, color=C["a"])
    for ax, (cams, X), ttl in ((axs[1], aligned(cams0, X0), "$k=0$"),
                               (axs[2], aligned(cams_ba, X_ba), f"$k={len(log) - 1}$")):
        for j in range(n):
            ax.plot([X_true[j, 0], X[j, 0]], [X_true[j, 2], X[j, 2]], color=C["x"], lw=1.2, zorder=2)
        top_view(ax, cams_true, X_true, C["gray"], zorder=1)
        top_view(ax, cams, X, C["a"], zorder=3)
        ax.set_aspect("equal"); ax.set_xlim(-5, 5); ax.set_ylim(-5.6, 2.6)
        ax.set_xlabel("$x$"); ax.set_ylabel("$z$"); ax.set_title(ttl)
    fig.tight_layout()
    out(fig, "05-ba.svg")


# ---------------------------------------------------------------------------------------------
def fig_gauge():
    w_, V = np.linalg.eigh(J.T @ J)
    fig, axs = plt.subplots(1, 2, figsize=(11.5, 4.8))
    ax = axs[0]
    k = np.arange(1, len(w_) + 1)
    ax.semilogy(k[7:], np.abs(w_[7:]), ".", color=C["a"], ms=5)
    ax.semilogy(k[:7], np.maximum(np.abs(w_[:7]), 1e-12), "o", color=C["x"], ms=8)
    ax.axhspan(1e-13, 1e-6, color=C["x"], alpha=0.07)
    ax.set_xlabel("$k$"); ax.set_ylabel("$\\lambda_k(J^\\top J)$")
    ax.set_xscale("log")
    ax.set_ylim(1e-12, 1e9)
    ax = axs[1]
    al = np.linspace(-1, 1, 41)
    curves = []
    for a in al:
        s_ = np.exp(0.7 * a)
        c_s = [(R, s_ * t) for R, t in cams_ba]
        Rg = rodrigues([0, 0.6 * a, 0])                      # rotate the whole world about its y axis
        c_r = [(R @ Rg.T, t) for R, t in cams_ba]
        c_v, X_v = apply_delta(cams_ba, X_ba, a * V[:, 7])
        c_w, X_w = apply_delta(cams_ba, X_ba, a * V[:, 40])
        curves.append([np.sqrt(ba_cost(c, Xx, obs_all) / L) for c, Xx in
                       ((c_s, s_ * X_ba), (c_r, X_ba @ Rg.T), (c_v, X_v), (c_w, X_w))])
    curves = np.array(curves)
    labels = ["$s=e^{0.7\\alpha}$", "$R_y(0.6\\alpha)$", "$\\alpha\\,\\mathbf{v}_8$", "$\\alpha\\,\\mathbf{v}_{41}$"]
    for c_, lab, col, ls in zip(curves.T, labels, (C["x"], C["b"], C["a"], C["c"]), ("-", "--", "-", "-")):
        ax.plot(al, c_, ls, color=col, label=lab)
    ax.set_xlabel("$\\alpha$"); ax.set_ylabel("RMS (px)")
    ax.legend(fontsize=13)
    fig.tight_layout()
    out(fig, "05-gauge.svg")
    print("gauge: eigenvalues 8 and 41: %.0f, %.0f; rms at alpha=1 along v8: %.3f, v41: %.3f"
          % (w_[7], w_[40], curves[-1, 2], curves[-1, 3]))


# ---------------------------------------------------------------------------------------------
def fig_robust():
    rr = np.linspace(0, 6, 300)
    fig = plt.figure(figsize=(10, 8.4))
    gs = fig.add_gridspec(2, 2)
    axs = [fig.add_subplot(gs[0, 0]), fig.add_subplot(gs[0, 1]), fig.add_subplot(gs[1, :])]
    cols = {"l2": C["x"], "huber": C["b"], "cauchy": C["a"]}
    names = {"l2": "$L_2$", "huber": "Huber", "cauchy": "Cauchy"}
    for kern in ("l2", "huber", "cauchy"):
        rho, w = robust_weight(rr**2, kern, 1.0)
        axs[0].plot(rr, rho, color=cols[kern], label=names[kern])
        axs[1].plot(rr, w, color=cols[kern], label=names[kern])
    axs[0].set_ylim(0, 12); axs[0].set_xlabel("$\\|\\mathbf{r}\\|$ (px)"); axs[0].set_ylabel("$\\rho(\\|\\mathbf{r}\\|^2)$")
    axs[1].set_xlabel("$\\|\\mathbf{r}\\|$ (px)"); axs[1].set_ylabel("$w=\\rho'$")
    axs[0].legend(fontsize=13); axs[1].set_ylim(0, 1.08)
    ax = axs[2]
    vals = []
    for kern in ("l2", "huber", "cauchy"):
        c, X_, _ = bundle_adjust(cams0, X0, obs_bad, kernel=kern, delta=1.0)
        vals.append(errors(c, X_)[0])
    ref = errors(cams_ba, X_ba)[0]
    xs = np.arange(4)
    ax.bar(xs, [ref] + vals, color=[C["gray"], cols["l2"], cols["huber"], cols["cauchy"]])
    ax.set_yscale("log")
    for x_, v_ in zip(xs, [ref] + vals):
        ax.text(x_, v_ * 1.15, f"{v_:.4f}", ha="center", fontsize=12)
    ax.set_xticks(xs); ax.set_xticklabels(["$L_2$\n(0%)", "$L_2$", "Huber", "Cauchy"])
    ax.set_ylabel("RMSE $\\mathbf{C}_i$"); ax.set_ylim(1e-3, 0.3)
    fig.tight_layout()
    out(fig, "05-robust.svg")


# ---------------------------------------------------------------------------------------------
def fig_incremental():
    lab = dict(
        truth=dict(en="truth", zh="真值", ja="真値"),
        nob=dict(en="no BA", zh="不做 BA", ja="BA なし"),
        ba=dict(en="BA after every image", zh="每注册一张图像后做 BA", ja="画像を登録するたびに BA"),
        err=dict(en="centre error (m)", zh="相机中心误差 (m)", ja="カメラ中心の誤差 (m)"),
        idx=dict(en="camera index", zh="相机编号", ja="カメラ番号"),
        scale=dict(en="local scale", zh="局部尺度", ja="局所スケール"),
    )
    tru = np.array([-R.T @ t for R, t in cams_c])
    res = {b: trajectory_errors(runs[b][0]) for b in (False, True)}
    for lang in LANGS:
        fig = plt.figure(figsize=(11.5, 5.6))
        gs = fig.add_gridspec(2, 2, width_ratios=[1.35, 1])
        ax = fig.add_subplot(gs[:, 0])
        ax.plot(tru[:, 0], tru[:, 2], "^-", color=C["dark"], ms=7, label=lab["truth"][lang])
        for b, col, key in ((False, C["b"], "nob"), (True, C["a"], "ba")):
            A = res[b][1]
            ax.plot(A[:, 0], A[:, 2], "o-", color=col, ms=5, label=label(lang, **lab[key]))
        for k in (0, 4, 29):
            ax.annotate(str(k), (tru[k, 0], tru[k, 2]), (tru[k, 0] - 0.2, tru[k, 2] + 0.12), fontsize=13)
        ax.set_xlabel("$x$ (m)"); ax.set_ylabel("$z$ (m)")
        ax.set_xlim(-1, 22.5); ax.set_ylim(-1.1, 0.5)
        ax.legend(fontsize=12, loc="lower left")
        ax = fig.add_subplot(gs[0, 1])
        for b, col in ((False, C["b"]), (True, C["a"])):
            ax.semilogy(range(1, 30), res[b][0][1:], "o-", color=col, ms=4)
        ax.set_ylabel(label(lang, **lab["err"]))
        ax.set_xticklabels([])
        ax = fig.add_subplot(gs[1, 1])
        for b, col in ((False, C["b"]), (True, C["a"])):
            ax.plot(range(1, 30), drift_scale(runs[b][0]), "o-", color=col, ms=4)
        ax.axhline(1, color=C["dark"], lw=1, ls=":")
        ax.set_xlabel(label(lang, **lab["idx"])); ax.set_ylabel(label(lang, **lab["scale"]))
        fig.tight_layout()
        out(fig, f"05-incremental_{lang}.svg")


# ---------------------------------------------------------------------------------------------
def fig_rotation_averaging():
    lab = dict(
        tree=dict(en="spanning tree", zh="生成树串联", ja="全域木で連結"),
        l2=dict(en="spectral (L2)", zh="谱方法 (L2)", ja="スペクトル法 (L2)"),
        irls=dict(en="spectral + IRLS", zh="谱方法 + IRLS", ja="スペクトル法 + IRLS"),
        idx=dict(en="camera index", zh="相机编号", ja="カメラ番号"),
        err=dict(en="rotation error (deg)", zh="旋转误差 (度)", ja="回転誤差 (度)"),
        res=dict(en="edge residual (deg)", zh="边残差 (度)", ja="辺の残差 (度)"),
        cnt=dict(en="edges", zh="边数", ja="辺の数"),
        good=dict(en="correct pairs", zh="正确的图像对", ja="正しいペア"),
        bad=dict(en="wrong pairs", zh="错误的图像对", ja="誤ったペア"),
    )
    sols = {"tree": chain_rotations(mg, edges, R_rel), "l2": rotation_averaging(mg, edges, R_rel)[0]}
    sols["irls"], res = rotation_averaging(mg, edges, R_rel, iters=10)
    truth_rel = [cams_g[j][0] @ cams_g[i][0].T for i, j in edges]
    wrong = np.array([rot_angle(Rr @ Rt.T) > 10 for Rr, Rt in zip(R_rel, truth_rel)])
    print("rotation averaging: %d wrong edges; IRLS residual of wrong edges min %.1f deg, "
          "of correct edges max %.2f deg" % (wrong.sum(), res[wrong].min(), res[~wrong].max()))
    for lang in LANGS:
        fig, axs = plt.subplots(1, 2, figsize=(11.5, 4.8))
        ax = axs[0]
        for key, col, mk in (("tree", C["x"], "s"), ("l2", C["b"], "^"), ("irls", C["a"], "o")):
            ax.semilogy(range(mg), rotation_errors(sols[key]), mk + "-", color=col, ms=5, lw=1.6,
                        label=label(lang, **lab[key]))
        ax.set_xlabel(label(lang, **lab["idx"])); ax.set_ylabel(label(lang, **lab["err"]))
        ax.legend(fontsize=12)
        ax = axs[1]
        bins = np.logspace(-1.5, 2.3, 40)
        ax.hist(res[~wrong], bins=bins, color=C["a"], alpha=0.8, label=label(lang, **lab["good"]))
        ax.hist(res[wrong], bins=bins, color=C["x"], alpha=0.8, label=label(lang, **lab["bad"]))
        ax.set_xscale("log")
        ax.set_xlabel(label(lang, **lab["res"])); ax.set_ylabel(label(lang, **lab["cnt"]))
        ax3 = ax.twinx()
        th = np.logspace(-1.5, 2.3, 200)
        ax3.plot(th, 1 / (1 + (th / 5.0) ** 2), color=C["dark"], lw=1.6, ls="--")
        ax3.set_ylabel("$w$"); ax3.set_ylim(0, 1.05); ax3.grid(False)
        ax3.spines["right"].set_visible(True)
        ax.legend(fontsize=12, loc="upper right")
        fig.tight_layout()
        out(fig, f"05-rotation-averaging_{lang}.svg")


# ---------------------------------------------------------------------------------------------
def fig_positioning():
    stops = [0, 3, 8, 15, 25, None]
    fig, axs = plt.subplots(2, 3, figsize=(10.5, 7.6))
    for ax, k in zip(axs.ravel(), stops):
        if k == 0:
            z = z0
        else:
            z = least_squares(positioning_residuals, z0, jac_sparsity=sparsity, bounds=(lo, np.inf),
                              loss="soft_l1", f_scale=0.1, x_scale="jac", max_nfev=k).x
        Cz = z[:3 * mg].reshape(-1, 3); Xz = z[3 * mg:3 * (mg + n)].reshape(-1, 3)
        s_, Ra_, ta_ = umeyama(np.vstack([Cz, Xz]), np.vstack([Ctrue_g, X_true]))
        Ca, Xa = Cz @ (s_ * Ra_).T + ta_, Xz @ (s_ * Ra_).T + ta_
        ax.plot(Xz[:, 0], Xz[:, 2], ".", color=C["gray"], ms=3)
        ax.scatter(Cz[:, 0], Cz[:, 2], c=np.arange(mg), cmap="hsv", s=40, marker="^", zorder=3)
        e = np.median(np.linalg.norm(Ca - Ctrue_g, axis=1))
        ax.set_title(("$n_{\\mathrm{eval}}=%d$" % k if k is not None else "$n_{\\mathrm{eval}}=%d$" % sol.nfev)
                     + "\n$\\tilde e=%.2f$" % e, fontsize=14)
        ax.set_aspect("equal", adjustable="datalim")
        ax.tick_params(labelsize=10)
    fig.tight_layout()
    out(fig, "05-global-positioning.svg")


Ctrue_g = np.array([-R.T @ t for R, t in cams_g])

if __name__ == "__main__":
    FIGS = [fig_scene, fig_p3p, fig_pnp, fig_sparsity, fig_ba, fig_gauge, fig_robust, fig_incremental,
            fig_rotation_averaging, fig_positioning]
    only = os.environ.get("ONLY")
    for fn in FIGS:
        if not only or fn.__name__ in only.split(","):
            fn()
