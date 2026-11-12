"""Figures for 3d-vision post 04: two-view geometry.

Run from the repository root:
    python3 bin/figures/3d-vision/vision3d_04.py [preview-dir]

Conventions (as in the post): OpenCV camera frame (x right, y down, z forward), camera 1 at the
origin, X2 = R X1 + t, F maps pixels of image 1 to epipolar lines of image 2. In 3D plots a
camera-1 vector (x, y, z) is drawn at plot position (x, z, -y). The first part of this file is the
post's code, snippet by snippet and verbatim, so every number it prints (and the captions quote) is
what the post's code gives. Only NumPy, SciPy and Matplotlib are needed.
"""
import os
import pathlib
import sys

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

plt.rcParams["svg.hashsalt"] = "3d-vision-04"  # stable element ids

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/3d-vision"
PREV = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] != "-" else None


def out(fig, name):
    if PREV is not None:
        PREV.mkdir(parents=True, exist_ok=True)
        fig.savefig(PREV / name.replace(".svg", ".png"), dpi=70)
    save(fig, OUT / name)


# =============================================================================================
# the post's code
# =============================================================================================
# ---- snippet 1: scene ----
import numpy as np

np.set_printoptions(precision=4, suppress=True)


def rot(axis, deg):
    """Rotation by deg degrees about the x, y or z axis."""
    a = np.deg2rad(deg)
    c, s = np.cos(a), np.sin(a)
    i, j = {"x": (1, 2), "y": (2, 0), "z": (0, 1)}[axis]
    R = np.eye(3)
    R[i, i], R[j, j], R[i, j], R[j, i] = c, c, -s, s
    return R


def skew(v):
    """The cross-product matrix [v]_x, with skew(v) @ w == np.cross(v, w)."""
    return np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])


def hom(x):
    """N x 2 points -> N x 3 homogeneous points (u, v, 1)."""
    return np.c_[x, np.ones(len(x))]


def project(K, R, t, X):
    """Points X (N x 3, camera-1 frame) -> pixels (N x 2) of the camera with X_c = R X + t."""
    p = (X @ R.T + t) @ K.T
    return p[:, :2] / p[:, 2:]


W, H = 640, 480
K = np.array([[500.0, 0.0, 320.0], [0.0, 500.0, 240.0], [0.0, 0.0, 1.0]])
R = rot("y", 10) @ rot("x", -3)            # camera 2 turns 10 deg to the left and 3 deg up
C2 = np.array([0.8, 0.1, 0.3])             # its centre in camera-1 coordinates (metres)
t = -R @ C2                                # so that X2 = R X1 + t

rng = np.random.default_rng(0)
uv = rng.uniform([20, 20], [W - 20, H - 20], (240, 2))           # random pixels of image 1 ...
Z = rng.uniform(2.0, 8.0, 240)                                   # ... at random depths
X = (hom(uv) @ np.linalg.inv(K).T) * Z[:, None]                  # back-projected, camera-1 frame
x2 = project(K, R, t, X)
keep = np.all((x2 > 0) & (x2 < [W, H]), axis=1)                  # keep what camera 2 also sees
X, x2 = X[keep][:200], x2[keep][:200]
x1 = project(K, np.eye(3), np.zeros(3), X)                       # pixels in image 1
print(len(X), "points;  t =", t, " |t| =", round(np.linalg.norm(t), 4))

# ---- snippet 2: essential matrix ----
E = skew(t) @ R
Kinv = np.linalg.inv(K)
n1, n2 = hom(x1) @ Kinv.T, hom(x2) @ Kinv.T          # normalized coordinates (x, y, 1)
print("max |n2^T E n1|    : %.1e" % np.abs(np.sum(n2 * (n1 @ E.T), axis=1)).max())
print("singular values of E:", np.linalg.svd(E)[1])
print("2EE^TE - tr(EE^T)E : %.1e" % np.abs(2 * E @ E.T @ E - np.trace(E @ E.T) * E).max())

# ---- snippet 3: fundamental matrix, epipoles, lines ----
F = Kinv.T @ E @ Kinv
F = F / np.linalg.norm(F)


def null_vector(A):
    """Unit vector v minimizing |A v| (the last right singular vector)."""
    return np.linalg.svd(A)[2][-1]


e1 = null_vector(F)                          # F e1 = 0
e2 = null_vector(F.T)                        # F^T e2 = 0
print("e1 =", e1[:2] / e1[2], " C2 seen by camera 1:", project(K, np.eye(3), np.zeros(3), C2[None])[0])
print("e2 =", e2[:2] / e2[2], " C1 seen by camera 2:", project(K, R, t, np.zeros((1, 3)))[0])


def point_line_distance(l, x):
    """Distance (pixels) of pixel x (2,) from the homogeneous line l = (a, b, c)."""
    return abs(l @ np.append(x, 1.0)) / np.hypot(l[0], l[1])


Xp = np.array([0.5, -0.4, 5.0])               # one point, camera-1 frame
p1 = project(K, np.eye(3), np.zeros(3), Xp[None])[0]
p2 = project(K, R, t, Xp[None])[0]
l2 = F @ np.append(p1, 1.0)                  # epipolar line of p1 in image 2
l1 = F.T @ np.append(p2, 1.0)                # epipolar line of p2 in image 1
print("p1 =", p1, " p2 =", p2)
print("l2 =", l2 / np.hypot(*l2[:2]), " distance of p2: %.1e px" % point_line_distance(l2, p2))
print("l2 passes through e2:", abs(l2 @ e2) < 1e-12, "; l1 through e1:", abs(l1 @ e1) < 1e-12)
print("rank of F:", np.linalg.matrix_rank(F), " singular values:", np.linalg.svd(F)[1])

# ---- snippet 4: normalized eight-point algorithm ----
def normalize_points(x):
    """Hartley normalization: centroid to the origin, mean distance sqrt(2)."""
    c = x.mean(axis=0)
    s = np.sqrt(2) / np.linalg.norm(x - c, axis=1).mean()
    T = np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])
    return hom(x) @ T.T, T


def eight_point(x1, x2, normalize=True, rank2=True):
    """F with x2^T F x1 = 0 from N >= 8 correspondences (N x 2 pixels)."""
    if normalize:
        q1, T1 = normalize_points(x1)
        q2, T2 = normalize_points(x2)
    else:
        q1, q2, T1, T2 = hom(x1), hom(x2), np.eye(3), np.eye(3)
    A = np.einsum("ni,nj->nij", q2, q1).reshape(-1, 9)     # row n = kron(q2_n, q1_n)
    Fq = null_vector(A).reshape(3, 3)
    if rank2:                                              # closest rank-2 matrix (Frobenius)
        U, S, Vt = np.linalg.svd(Fq)
        Fq = U @ np.diag([S[0], S[1], 0.0]) @ Vt
    Fx = T2.T @ Fq @ T1                                    # undo the normalization
    return Fx / np.linalg.norm(Fx)


def sampson(F, x1, x2):
    """Sampson distance (pixels): first-order distance of each correspondence to x2^T F x1 = 0."""
    h1, h2 = hom(x1), hom(x2)
    Fx1, Ftx2 = h1 @ F.T, h2 @ F
    num = np.sum(h2 * Fx1, axis=1)
    den = Fx1[:, 0] ** 2 + Fx1[:, 1] ** 2 + Ftx2[:, 0] ** 2 + Ftx2[:, 1] ** 2
    return np.abs(num) / np.sqrt(den)


def epipolar_error(Fest, x1, x2):
    """Mean distance of the true points x2 from the estimated lines Fest x1 (noise-free x1, x2)."""
    l = hom(x1) @ Fest.T
    return np.mean(np.abs(np.sum(l * hom(x2), axis=1)) / np.hypot(l[:, 0], l[:, 1]))


rng = np.random.default_rng(1)
for sigma in (0.5, 1.0, 2.0):
    err = {"raw": [], "normalized": []}
    for trial in range(200):
        y1 = x1 + rng.normal(0, sigma, x1.shape)
        y2 = x2 + rng.normal(0, sigma, x2.shape)
        err["raw"].append(epipolar_error(eight_point(y1, y2, normalize=False), x1, x2))
        err["normalized"].append(epipolar_error(eight_point(y1, y2), x1, x2))
    print("sigma = %.1f px: epipolar error raw %.3f px, normalized %.3f px"
          % (sigma, np.median(err["raw"]), np.median(err["normalized"])))

A_raw = np.einsum("ni,nj->nij", hom(x2), hom(x1)).reshape(-1, 9)
A_nrm = np.einsum("ni,nj->nij", normalize_points(x2)[0], normalize_points(x1)[0]).reshape(-1, 9)
for name, A in (("raw", A_raw), ("normalized", A_nrm)):
    s = np.linalg.svd(A)[1]
    print("%-10s s1/s8 = %.3g" % (name, s[0] / s[7]))

# ---- snippet 5: seven-point algorithm ----
def seven_point(x1, x2):
    """All real fundamental matrices through exactly 7 correspondences (1 or 3 solutions)."""
    q1, T1 = normalize_points(x1)
    q2, T2 = normalize_points(x2)
    A = np.einsum("ni,nj->nij", q2, q1).reshape(-1, 9)     # 7 x 9: a 2-dimensional null space
    Vt = np.linalg.svd(A)[2]
    F1, F2 = Vt[-1].reshape(3, 3), Vt[-2].reshape(3, 3)
    a = np.array([-1.0, 0.0, 1.0, 2.0])                    # det(a F1 + (1 - a) F2) is a cubic in a:
    d = [np.linalg.det(ai * F1 + (1 - ai) * F2) for ai in a]
    coef = np.polyfit(a, d, 3)                             # four samples determine it exactly
    sols = []
    for r in np.roots(coef):
        if abs(r.imag) < 1e-8:
            Fr = T2.T @ (r.real * F1 + (1 - r.real) * F2) @ T1
            sols.append(Fr / np.linalg.norm(Fr))
    return sols, coef


sols, coef = seven_point(x1[:7], x2[:7])
print("cubic coefficients:", coef)
for Fs in sols:
    print("root: max Sampson distance over all 200 points %.2g px, |F - F_true| = %.2g"
          % (sampson(Fs, x1, x2).max(), min(np.linalg.norm(Fs - F), np.linalg.norm(Fs + F))))

# ---- snippet 6: the five-point idea ----
A5 = np.einsum("ni,nj->nij", n2[:5], n1[:5]).reshape(-1, 9)   # 5 calibrated correspondences
basis = np.linalg.svd(A5)[2][5:]                                # 4 x 9 null-space basis
e_true = E.ravel() / np.linalg.norm(E)
print("null-space dimension:", basis.shape[0],
      " distance of the true E from it: %.1e" % np.linalg.norm(e_true - basis.T @ (basis @ e_true)))
rng = np.random.default_rng(2)
Er = (basis.T @ rng.normal(size=4)).reshape(3, 3)              # a random member of the null space
print("random member: singular values", np.linalg.svd(Er / np.linalg.norm(Er))[1])

# ---- snippet 7: RANSAC with the seven-point solver ----
def ransac_fundamental(x1, x2, thresh, p=0.99, max_iters=10000, seed=0):
    """Robust F: seven-point hypotheses, Sampson inliers, adaptive iteration count, final 8-point."""
    rng = np.random.default_rng(seed)
    best = np.zeros(len(x1), bool)
    n_needed, k = max_iters, 0
    while k < n_needed:
        idx = rng.choice(len(x1), 7, replace=False)
        for Fh in seven_point(x1[idx], x2[idx])[0]:
            inl = sampson(Fh, x1, x2) < thresh
            if inl.sum() > best.sum():
                best = inl
                w = inl.mean()
                n_needed = min(max_iters, int(np.ceil(np.log(1 - p) / np.log(1 - w ** 7))))
        k += 1
    for _ in range(3):                    # refit on the consensus set, re-collect the inliers
        Fb = eight_point(x1[best], x2[best])
        best = sampson(Fb, x1, x2) < thresh
    return eight_point(x1[best], x2[best]), best, k


rng = np.random.default_rng(3)
sigma = 0.5
y1 = x1 + rng.normal(0, sigma, x1.shape)
y2 = x2 + rng.normal(0, sigma, x2.shape)
wrong = rng.choice(200, 80, replace=False)                       # 40% of the matches are wrong
y2[wrong] = rng.uniform([0, 0], [W, H], (80, 2))
is_out = np.zeros(200, bool)
is_out[wrong] = True
thresh = np.sqrt(3.84) * sigma                                  # 95% of inliers pass
F_all = eight_point(y1, y2)
F_rs, inl, iters = ransac_fundamental(y1, y2, thresh)
print("8-point on all matches: epipolar error %.2f px" % epipolar_error(F_all, x1, x2))
print("RANSAC: %d iterations, %d inliers (%d true inliers missed, %d outliers kept), error %.3f px"
      % (iters, inl.sum(), (~inl & ~is_out).sum(), (inl & is_out).sum(), epipolar_error(F_rs, x1, x2)))

# ---- snippet 8: four poses and the cheirality check ----
def decompose_essential(E):
    """The four (R, t) with E ~ [t]_x R and |t| = 1."""
    U, _, Vt = np.linalg.svd(E)
    if np.linalg.det(U) < 0:
        U = -U
    if np.linalg.det(Vt) < 0:
        Vt = -Vt
    Wm = np.array([[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]])
    Ra, Rb, u3 = U @ Wm @ Vt, U @ Wm.T @ Vt, U[:, 2]
    return [(Ra, u3), (Ra, -u3), (Rb, u3), (Rb, -u3)]


def triangulate_dlt(P1, P2, x1, x2):
    """Linear triangulation of N correspondences; returns N x 3 points."""
    A = np.stack([x1[:, :1] * P1[2] - P1[0], x1[:, 1:] * P1[2] - P1[1],
                  x2[:, :1] * P2[2] - P2[0], x2[:, 1:] * P2[2] - P2[1]], axis=1)   # N x 4 x 4
    Xh = np.linalg.svd(A)[2][:, -1]
    return Xh[:, :3] / Xh[:, 3:]


def relative_pose(E, K, x1, x2, verbose=False):
    """Pick the decomposition of E that puts the most points in front of both cameras."""
    P1 = K @ np.c_[np.eye(3), np.zeros(3)]
    best = None
    for Rc, tc in decompose_essential(E):
        Xc = triangulate_dlt(P1, K @ np.c_[Rc, tc], x1, x2)
        n_front = np.sum((Xc[:, 2] > 0) & ((Xc @ Rc.T + tc)[:, 2] > 0))
        if verbose:
            print("  candidate: %3d of %d points in front of both cameras" % (n_front, len(x1)))
        if best is None or n_front > best[0]:
            best = (n_front, Rc, tc, Xc)
    return best[1], best[2], best[3]


def rotation_angle(Ra, Rb):
    """Angle (degrees) of the rotation Ra Rb^T."""
    return np.rad2deg(np.arccos(np.clip((np.trace(Ra @ Rb.T) - 1) / 2, -1, 1)))


def direction_angle(a, b):
    """Angle (degrees) between two vectors."""
    return np.rad2deg(np.arccos(np.clip(a @ b / np.linalg.norm(a) / np.linalg.norm(b), -1, 1)))


E_est = K.T @ F_rs @ K                       # same K in both cameras
R_est, t_est, X_est = relative_pose(E_est, K, y1[inl], y2[inl], verbose=True)
print("rotation error %.3f deg, translation direction error %.3f deg"
      % (rotation_angle(R_est, R), direction_angle(t_est, t)))
scale = np.linalg.norm(t)                    # unknown from images; borrowed from the ground truth
print("3D error after fixing the scale: %.4f m (median)"
      % np.median(np.linalg.norm(X_est * scale - X[inl], axis=1)))

# ---- snippet 9: nonlinear refinement on the five-dimensional manifold ----
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation


def pose_to_F(params, K):
    """Five pose parameters (rotation vector, two angles of the unit t) -> F."""
    Rp = Rotation.from_rotvec(params[:3]).as_matrix()
    th, ph = params[3:]
    tp = np.array([np.sin(th) * np.cos(ph), np.sin(th) * np.sin(ph), np.cos(th)])
    Ki = np.linalg.inv(K)
    return Ki.T @ skew(tp) @ Rp @ Ki, Rp, tp


def refine_pose(R0, t0, K, x1, x2):
    t0 = t0 / np.linalg.norm(t0)
    p0 = np.r_[Rotation.from_matrix(R0).as_rotvec(), np.arccos(t0[2]), np.arctan2(t0[1], t0[0])]
    res = least_squares(lambda p: sampson(pose_to_F(p, K)[0], x1, x2), p0, method="lm")
    return pose_to_F(res.x, K)[1:]


R_ref, t_ref = refine_pose(R_est, t_est, K, y1[inl], y2[inl])
print("refined: rotation error %.3f deg, translation direction error %.3f deg"
      % (rotation_angle(R_ref, R), direction_angle(t_ref, t)))

# ---- snippet 10: three triangulation methods ----
def triangulate_midpoint(K, R, t, x1, x2):
    """Midpoint of the shortest segment between the two back-projected rays (camera-1 frame)."""
    Ki = np.linalg.inv(K)
    d1 = hom(x1) @ Ki.T                       # ray directions from C1 = 0
    d2 = hom(x2) @ Ki.T @ R                   # ray directions of camera 2, rotated into frame 1
    c2 = -R.T @ t                             # camera-2 centre
    # minimize |a d1 - (c2 + b d2)|^2 over the ray parameters a, b (2 x 2 normal equations)
    d11, d12, d22 = (d1 * d1).sum(1), (d1 * d2).sum(1), (d2 * d2).sum(1)
    r1, r2 = d1 @ c2, d2 @ c2
    den = d11 * d22 - d12 ** 2
    a = (r1 * d22 - r2 * d12) / den
    b = (r1 * d12 - r2 * d11) / den
    return 0.5 * (a[:, None] * d1 + c2 + b[:, None] * d2)


def optimal_correction(F, x1, x2):
    """Hartley-Sturm: the closest pair (x1', x2') with x2'^T F x1' = 0, for one correspondence."""
    T1 = np.array([[1, 0, -x1[0]], [0, 1, -x1[1]], [0, 0, 1.0]])   # move both points to the origin
    T2 = np.array([[1, 0, -x2[0]], [0, 1, -x2[1]], [0, 0, 1.0]])
    Fm = np.linalg.inv(T2).T @ F @ np.linalg.inv(T1)
    e1, e2 = null_vector(Fm), null_vector(Fm.T)
    e1, e2 = e1 / np.hypot(e1[0], e1[1]), e2 / np.hypot(e2[0], e2[1])
    R1 = np.array([[e1[0], e1[1], 0], [-e1[1], e1[0], 0], [0, 0, 1]])   # epipoles to (1, 0, f)
    R2 = np.array([[e2[0], e2[1], 0], [-e2[1], e2[0], 0], [0, 0, 1]])
    Fm = R2 @ Fm @ R1.T
    f1, f2 = e1[2], e2[2]
    a, b, c, d = Fm[1, 1], Fm[1, 2], Fm[2, 1], Fm[2, 2]
    # epipolar lines through (0, t, 1) in image 1; g(t) = 0 at the stationary points of the cost
    P = np.polynomial.polynomial
    atb, ctd = np.array([b, a]), np.array([d, c])
    q = P.polyadd(P.polymul(atb, atb), f2 ** 2 * P.polymul(ctd, ctd))
    g = P.polysub(P.polymul([0, 1], P.polymul(q, q)),
                  (a * d - b * c) * P.polymul(P.polymul([1, 0, f1 ** 2], [1, 0, f1 ** 2]),
                                              P.polymul(atb, ctd)))
    cands = [r.real for r in P.polyroots(g) if abs(r.imag) < 1e-9]
    cost = lambda s: s ** 2 / (1 + f1 ** 2 * s ** 2) + (c * s + d) ** 2 / ((a * s + b) ** 2 + f2 ** 2 * (c * s + d) ** 2)
    s = min(cands, key=cost)
    if cost(s) > 1 / f1 ** 2 + c ** 2 / (a ** 2 + f2 ** 2 * c ** 2):   # the asymptote s -> infinity
        s = 1e12
    l1 = np.array([s * f1, 1, -s])
    l2 = np.array([-f2 * (c * s + d), a * s + b, c * s + d])
    foot = lambda l: np.array([-l[0] * l[2], -l[1] * l[2], l[0] ** 2 + l[1] ** 2])   # nearest point to 0
    y1 = np.linalg.inv(T1) @ R1.T @ foot(l1)
    y2 = np.linalg.inv(T2) @ R2.T @ foot(l2)
    return y1[:2] / y1[2], y2[:2] / y2[2]


def triangulate_optimal(K, R, t, x1, x2):
    """Correct each pair onto the epipolar constraint, then intersect the (now meeting) rays."""
    Ki = np.linalg.inv(K)
    Fm = Ki.T @ skew(t) @ R @ Ki
    pairs = [optimal_correction(Fm, a, b) for a, b in zip(x1, x2)]
    c1, c2 = np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs])
    return triangulate_dlt(K @ np.c_[np.eye(3), np.zeros(3)], K @ np.c_[R, t], c1, c2)



def reprojection_rms(K, R, t, Xe, x1, x2):
    """RMS reprojection residual (pixels) in image 1 and in image 2."""
    r1 = project(K, np.eye(3), np.zeros(3), Xe) - x1
    r2 = project(K, R, t, Xe) - x2
    return np.sqrt(np.mean(np.sum(r1 ** 2, 1))), np.sqrt(np.mean(np.sum(r2 ** 2, 1)))


# a second pair: points 1-2 m from camera 1, camera 2 about 4-5 m away, turned 40 degrees
Ra, Ca = rot("y", 40), np.array([3.0, 0.0, -2.0])
ta = -Ra @ Ca
rng = np.random.default_rng(5)
uv = rng.uniform([200, 150], [440, 330], (200, 2))
Xa = (hom(uv) @ np.linalg.inv(K).T) * rng.uniform(1.0, 2.0, 200)[:, None]
configs = {"main pair": (R, t, X), "asymmetric": (Ra, ta, Xa)}

results = {}
for name, (Rp, tp, Xq) in configs.items():
    a1, a2 = project(K, np.eye(3), np.zeros(3), Xq), project(K, Rp, tp, Xq)
    P1, P2 = K @ np.c_[np.eye(3), np.zeros(3)], K @ np.c_[Rp, tp]
    stats = {"midpoint": [], "DLT": [], "optimal": []}
    for trial in range(20):
        o1 = a1 + rng.normal(0, 1.0, a1.shape)          # 1 px of noise in both images
        o2 = a2 + rng.normal(0, 1.0, a2.shape)
        for method, Xe in (("midpoint", triangulate_midpoint(K, Rp, tp, o1, o2)),
                           ("DLT", triangulate_dlt(P1, P2, o1, o2)),
                           ("optimal", triangulate_optimal(K, Rp, tp, o1, o2))):
            stats[method].append(reprojection_rms(K, Rp, tp, Xe, o1, o2)
                                 + (np.sqrt(np.mean(np.sum((Xe - Xq) ** 2, 1))),))
    results[name] = stats
    print(name)
    for method, v in stats.items():
        m1, m2, m3 = np.mean(v, axis=0)
        print("  %-8s residual image 1: %.3f px, image 2: %.3f px, total %.3f px; 3D RMS error %.1f mm"
              % (method, m1, m2, np.hypot(m1, m2), 1000 * m3))

# ---- snippet 12: degenerate configurations ----
def make_pair(R, C2, plane=None, n_pts=200, seed=6):
    """Correspondences for camera 2 = (R, C2); points at random depths or on a plane n.X = 1."""
    rng = np.random.default_rng(seed)
    uv = rng.uniform([20, 20], [W - 20, H - 20], (n_pts, 2))
    rays = hom(uv) @ np.linalg.inv(K).T
    depth = rng.uniform(2.0, 8.0, n_pts) if plane is None else 1.0 / (rays @ plane)
    Xs = rays * depth[:, None]
    return uv, project(K, R, -R @ C2, Xs)


scenes = {
    "general": make_pair(R, C2),
    "planar": make_pair(R, C2, plane=np.array([0.05, -0.03, 0.2])),   # the plane Z = 5 - 0.25 X + 0.15 Y
    "rotation": make_pair(R, np.zeros(3)),
}
for name, (a, b) in scenes.items():
    q1, q2 = normalize_points(a)[0], normalize_points(b)[0]
    s = np.linalg.svd(np.einsum("ni,nj->nij", q2, q1).reshape(-1, 9))[1]
    print("%-8s smallest singular values of A: %s" % (name, np.array2string(s[-4:] / s[0], precision=2)))

rng = np.random.default_rng(7)
for name in ("general", "planar"):
    a, b = scenes[name]
    a, b = a + rng.normal(0, 1.0, a.shape), b + rng.normal(0, 1.0, b.shape)
    Fn = eight_point(a, b)
    Rn, tn, _ = relative_pose(K.T @ Fn @ K, K, a, b)
    print("%-8s 8-point with 1 px noise: rotation error %5.2f deg, translation error %5.1f deg"
          % (name, rotation_angle(Rn, R), direction_angle(tn, t)))

# ---- snippet 13: homography or fundamental matrix? ----
def homography_dlt(x1, x2):
    """Normalized DLT for x2 ~ H x1 (as in post 02)."""
    q1, T1 = normalize_points(x1)
    q2, T2 = normalize_points(x2)
    z = np.zeros_like(q1)
    A = np.r_[np.c_[z, -q1 * q2[:, 2:], q1 * q2[:, 1:2]], np.c_[q1 * q2[:, 2:], z, -q1 * q2[:, :1]]]
    Hm = np.linalg.inv(T2) @ null_vector(A).reshape(3, 3) @ T1
    return Hm / Hm[2, 2]


def transfer(Hm, x):
    p = hom(x) @ Hm.T
    return p[:, :2] / p[:, 2:]


def inlier_ratio(x1, x2, sigma):
    """(# homography inliers) / (# fundamental-matrix inliers), both at 95% of the inliers."""
    Fm, Hm = ransac_fundamental(x1, x2, np.sqrt(3.84) * sigma)[0], homography_dlt(x1, x2)
    n_F = np.sum(sampson(Fm, x1, x2) < np.sqrt(3.84) * sigma)
    n_H = np.sum(np.linalg.norm(transfer(Hm, x1) - x2, axis=1) < np.sqrt(2 * 5.99) * sigma)
    return n_H / n_F


scenes["small baseline"] = make_pair(R, 0.03 * C2 / np.linalg.norm(C2))   # 3 cm instead of 86 cm
for name, (a, b) in scenes.items():
    r = inlier_ratio(a + rng.normal(0, 1.0, a.shape), b + rng.normal(0, 1.0, b.shape), 1.0)
    print("%-15s H/F inlier ratio %.2f" % (name, r))

# ---- snippet 14: rectification as a change of F ----
def rectify_rotation(R, t):
    """Fusiello-style rectifying rotation (post 02): new x axis along the baseline."""
    c2 = -R.T @ t                                   # camera-2 centre in camera-1 coordinates
    r1 = c2 / np.linalg.norm(c2)
    r2 = np.cross([0.0, 0.0, 1.0], r1)
    r2 /= np.linalg.norm(r2)
    return np.array([r1, r2, np.cross(r1, r2)])


Rr = rectify_rotation(R, t)
H1 = K @ Rr @ np.linalg.inv(K)                     # image 1 -> rectified image 1
H2 = K @ Rr @ R.T @ np.linalg.inv(K)               # image 2 -> rectified image 2
F_rect = np.linalg.inv(H2).T @ F @ np.linalg.inv(H1)
print("F_rect / |F_rect| =\n", np.round(F_rect / np.linalg.norm(F_rect), 4) + 0.0)
r1, r2 = transfer(H1, x1), transfer(H2, x2)
print("max |v1 - v2| after rectification: %.2e px" % np.abs(r1[:, 1] - r2[:, 1]).max())
disp = r1[:, 0] - r2[:, 0]                          # disparity d = u1 - u2
b = np.linalg.norm(t)                               # baseline
Z_rect = (X @ Rr.T)[:, 2]                           # depth in the rectified camera-1 frame
print("disparity range %.1f to %.1f px;  max |f b / d - Z| = %.2e m"
      % (disp.min(), disp.max(), np.abs(K[0, 0] * b / disp - Z_rect).max()))

# ---- snippet 15: a synthetic rectified stereo pair ----
from scipy.ndimage import map_coordinates, uniform_filter

SW, SH, sf, sb = 240, 180, 200.0, 0.12          # image size, focal length (px), baseline (m)
scx, scy = (SW - 1) / 2, (SH - 1) / 2
lattice = np.random.default_rng(8).uniform(0, 1, (6, 64, 64))


def noise(s, t, k, cell):
    """Smooth value noise on surface coordinates (s, t) in metres: lattice k, cell size in metres."""
    return map_coordinates(lattice[k], [t / cell, s / cell], order=3, mode="grid-wrap")


# each surface: normal n and offset c of the plane n.P = c, optional X and Y limits, texture of P
SURFACES = [
    ((0.25, 0, 1), 3.4, None, lambda P: 85 + 70 * noise(P[0], P[1], 0, 0.06) + 30 * noise(P[0], P[1], 1, 0.015)),
    ((0, 1, 0), 0.55, None, lambda P: 90 + 90 * noise(P[0], P[2], 2, 0.05)),                  # floor
    ((0, 0, 1), 1.5, ((-0.75, -0.25), (-0.15, 0.55)), lambda P: 60 + 150 * noise(P[0], P[1], 3, 0.02)),
    ((-0.9, 0, 1), 1.73, ((0.15, 0.6), (-0.35, 0.3)), lambda P: 40 + 180 * (noise(P[0], P[1], 4, 0.03) > 0.5)),
    ((0, 0, 1), 1.1, ((-0.05, 0.3), (0.2, 0.55)), lambda P: 200 + 4 * noise(P[0], P[1], 5, 0.05)),   # no texture
]


def cast(cam_x, u, v):
    """Shade and depth Z of the first surface hit by the rays of pixels (u, v), camera at (cam_x, 0, 0)."""
    d = np.stack([(u - scx) / sf, (v - scy) / sf, np.ones_like(u)])     # ray directions with d_z = 1
    depth, shade = np.full(u.shape, np.inf), np.zeros(u.shape)
    for n, c, lim, tex in SURFACES:
        n = np.array(n, float)
        lam = (c - n[0] * cam_x) / np.tensordot(n, d, 1)                 # ray parameter = depth Z
        P = np.array([cam_x, 0.0, 0.0])[:, None, None] + lam * d
        hit = (lam > 0) & (lam < depth)
        if lim is not None:
            hit &= (P[0] >= lim[0][0]) & (P[0] <= lim[0][1]) & (P[1] >= lim[1][0]) & (P[1] <= lim[1][1])
        depth = np.where(hit, lam, depth)
        shade = np.where(hit, tex(P), shade)
    return shade, depth


def render(cam_x, ss=2):
    """Image (ss x ss supersampled) and per-pixel depth of the camera at (cam_x, 0, 0)."""
    u, v = np.meshgrid(np.arange(SW, dtype=float), np.arange(SH, dtype=float))
    offs = (np.arange(ss) + 0.5) / ss - 0.5
    img = sum(cast(cam_x, u + dx, v + dy)[0] for dy in offs for dx in offs) / ss ** 2
    return img, cast(cam_x, u, v)[1]


left, depth_l = render(0.0)
right, depth_r = render(sb)
rng = np.random.default_rng(9)
left = left + rng.normal(0, 1.5, left.shape)            # sensor noise (grey levels 0..255)
right = right + rng.normal(0, 1.5, right.shape)
gt = sf * sb / depth_l                                  # true disparity of every left pixel
gt_r = sf * sb / depth_r
xm = np.arange(SW)[None, :] - np.round(gt).astype(int)  # column of the match in the right image
valid = xm >= 0
occluded = valid & (np.abs(np.take_along_axis(gt_r, np.clip(xm, 0, SW - 1), 1) - gt) > 1.0)
mask = valid & ~occluded                                # pixels whose match is visible
print("disparity %.1f to %.1f px; %.1f%% of the pixels are occluded or leave the right image"
      % (gt.min(), gt.max(), 100 * (1 - mask.mean())))

# ---- snippet 16: block matching ----
DMAX = 32                                               # disparities 0..31


def cost_volume_sad(L, Rimg, win):
    """C[d, y, x] = mean |L(x, y) - R(x - d, y)| over a win x win window."""
    C = np.empty((DMAX, SH, SW))
    for d in range(DMAX):
        diff = np.full((SH, SW), 255.0)                 # no match possible left of column d
        diff[:, d:] = np.abs(L[:, d:] - Rimg[:, :SW - d])
        C[d] = uniform_filter(diff, win, mode="nearest")
    return C


def wta(C):
    """Winner-take-all disparity with parabola subpixel refinement."""
    d = np.argmin(C, axis=0)
    dc = np.clip(d, 1, DMAX - 2)
    c0, c1, c2 = (np.take_along_axis(C, (dc + k)[None], 0)[0] for k in (-1, 0, 1))
    den = c0 - 2 * c1 + c2
    off = np.where((d == dc) & (den > 0), 0.5 * (c0 - c2) / np.where(den > 0, den, 1.0), 0.0)
    return d + off


def bad_pixels(D, thresh=1.0, margin=6):
    """Percentage of visible pixels (away from the border) whose disparity is off by more than thresh."""
    m = mask.copy()
    m[:margin], m[-margin:], m[:, :margin], m[:, -margin:] = False, False, False, False
    return 100 * np.mean(np.abs(D - gt)[m] > thresh)


for win in (3, 7, 15):
    D = wta(cost_volume_sad(left, right, win))
    print("SAD %2dx%-2d: bad pixels (error > 1 px) %.1f%%" % (win, win, bad_pixels(D)))

# ---- snippet 17: semi-global matching and the left-right check ----
def aggregate_path(C, P1, P2, reverse):
    """One SGM path along the first axis of C (steps, D, other):
    L(p, d) = C(p, d) + min(L(p-r, d), L(p-r, d-1) + P1, L(p-r, d+1) + P1, min_k L(p-r, k) + P2) - min_k L(p-r, k)."""
    C = C[::-1] if reverse else C
    L = np.empty_like(C)
    L[0] = C[0]
    inf = np.full((1, C.shape[2]), np.inf)
    for i in range(1, len(C)):
        prev = L[i - 1]                                    # (D, other)
        m = prev.min(axis=0)
        step = np.minimum(np.vstack([prev[1:], inf]), np.vstack([inf, prev[:-1]])) + P1
        L[i] = C[i] + np.minimum(np.minimum(prev, step), m + P2) - m
    return L[::-1] if reverse else L


def sgm(C, P1=2.0, P2=16.0):
    """Sum of the left/right and up/down path costs (Hirschmueller uses 8 or 16 paths)."""
    Cy = np.transpose(C, (1, 0, 2))                        # (y, d, x): scan down or up
    Cx = np.transpose(C, (2, 0, 1))                        # (x, d, y): scan right or left
    S = sum(np.transpose(aggregate_path(Cy, P1, P2, r), (1, 0, 2)) for r in (False, True))
    return S + sum(np.transpose(aggregate_path(Cx, P1, P2, r), (1, 2, 0)) for r in (False, True))


C5 = cost_volume_sad(left, right, 5)
D_sgm = wta(sgm(C5))
print("SAD 5x5 + SGM: bad pixels %.1f%%" % bad_pixels(D_sgm))

# right-image disparities from the same costs: C_R(x, d) = C(x + d, d)
C5_r = np.full_like(C5, 255.0)
for d in range(DMAX):
    C5_r[d, :, :SW - d] = C5[d, :, d:]
D_r = wta(sgm(C5_r))
xr = np.clip(np.round(np.arange(SW)[None, :] - D_sgm).astype(int), 0, SW - 1)
consistent = np.abs(D_sgm - np.take_along_axis(D_r, xr, 1)) <= 1.0
print("left-right check rejects %.1f%% of pixels, %.0f%% of the occluded ones;"
      " bad pixels among the kept ones: %.1f%%"
      % (100 * (1 - consistent.mean()), 100 * (~consistent)[occluded].mean(),
         100 * np.mean((np.abs(D_sgm - gt) > 1)[mask & consistent])))

# =============================================================================================
# figures
# =============================================================================================
from matplotlib.patches import Polygon as MPolygon, Rectangle  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402

PAL = [C["a"], C["b"], C["c"], C["x"], C["y"], C["z"]]
I3, Z3 = np.eye(3), np.zeros(3)


def P3(v):
    """camera-1 vector (x, y, z) -> plot coordinates (x, z, -y)."""
    v = np.atleast_2d(v)
    return v[:, 0], v[:, 2], -v[:, 1]


def clip_line(l, w=W, h=H):
    """End points of the line l (homogeneous) inside the rectangle [0, w] x [0, h]."""
    pts = []
    a, b_, c = l
    for u in (0.0, w):
        if abs(b_) > 1e-12:
            v = -(a * u + c) / b_
            if -1e-9 <= v <= h + 1e-9:
                pts.append((u, v))
    for v in (0.0, h):
        if abs(a) > 1e-12:
            u = -(b_ * v + c) / a
            if -1e-9 <= u <= w + 1e-9:
                pts.append((u, v))
    pts = sorted(set((round(p[0], 6), round(p[1], 6)) for p in pts))
    return np.array(pts[:1] + pts[-1:]) if len(pts) >= 2 else None


def line_points(l, u0, u1):
    """Two points of the line l at u = u0 and u = u1."""
    a, b_, c = l
    return np.array([[u0, -(a * u0 + c) / b_], [u1, -(a * u1 + c) / b_]])


def image_axes(ax, xlim=(-20, W + 20), ylim=(H + 20, -20), frame=True):
    if frame:
        ax.add_patch(Rectangle((0, 0), W, H, fill=False, ec=C["a"], lw=2, zorder=1))
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.set_aspect("equal")
    ax.grid(False)
    ax.set_xlabel("$u$")
    ax.set_ylabel("$v$")


# ---------------------------------------------------------------------------------------------
# 1. epipolar geometry in 3D and in the two images
# ---------------------------------------------------------------------------------------------
def fig_epipolar_geometry():
    pts = np.array([[-0.9, -0.6, 4.0], [0.2, 0.5, 5.0], [0.9, -0.3, 3.2]])
    fig = plt.figure(figsize=(14, 11.5))
    ax = fig.add_axes([0.0, 0.30, 1.0, 0.74], projection="3d")
    s = 0.9                                                   # draw the image planes at depth s
    corners = np.array([[0, 0], [W, 0], [W, H], [0, H]], float)
    cam2_to_1 = lambda Xc: (Xc - t) @ R                       # X1 = R^T (X2 - t)
    for k, (Rc, tc, col, nm) in enumerate(((I3, Z3, C["a"], "C_1"), (R, t, C["z"], "C_2"))):
        cen = -Rc.T @ tc
        rect = (hom(corners) @ np.linalg.inv(K).T) * s
        rect = rect if k == 0 else cam2_to_1(rect)
        ax.add_collection3d(Poly3DCollection([list(zip(*P3(rect)))], facecolor=col, alpha=0.08, edgecolor=col, lw=1.6))
        for c in rect:
            ax.plot(*P3(np.array([cen, c])), color=col, lw=0.8, alpha=0.6)
        ax.scatter(*P3(cen), color=col, s=40)
        ax.text(*[v[0] for v in P3(cen + np.array([0.0, 0.25, -0.15]))], "$\\mathbf{%s}$" % nm, color=col, fontsize=17)
    ax.plot(*P3(np.array([Z3, C2])), color=C["dark"], lw=3)
    for i, Xp_ in enumerate(pts):
        col = PAL[[1, 2, 3][i]]
        tri = np.array([Z3, C2, Xp_])
        ax.add_collection3d(Poly3DCollection([list(zip(*P3(tri)))], facecolor=col, alpha=0.16, edgecolor="none"))
        ax.plot(*P3(np.array([Z3, Xp_])), color=col, lw=1.4)
        ax.plot(*P3(np.array([C2, Xp_])), color=col, lw=1.4)
        ax.scatter(*P3(Xp_), color=col, s=55, depthshade=False)
        # epipolar lines inside both image rectangles, lifted to 3D at depth s
        q1 = project(K, I3, Z3, Xp_[None])[0]
        q2 = project(K, R, t, Xp_[None])[0]
        for k, (l, ok) in enumerate(((F.T @ np.append(q2, 1), 0), (F @ np.append(q1, 1), 1))):
            seg = clip_line(l)
            if seg is None:
                continue
            seg3 = (hom(seg) @ np.linalg.inv(K).T) * s
            seg3 = seg3 if k == 0 else cam2_to_1(seg3)
            ax.plot(*P3(seg3), color=col, lw=2.6)
            q = q1 if k == 0 else q2
            qq = (np.append(q, 1) @ np.linalg.inv(K).T) * s
            qq = qq if k == 0 else cam2_to_1(qq[None])[0]
            ax.scatter(*P3(qq), color=col, s=22, depthshade=False)
    ax.set_box_aspect((2.4, 4.6, 1.6), zoom=1.35)
    ax.set_xlim(-1.2, 1.3)
    ax.set_ylim(-0.2, 5.2)
    ax.set_zlim(-0.8, 0.9)
    ax.view_init(elev=20, azim=-72)
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
    ax.set_xlabel("$x$"); ax.set_ylabel("$z$"); ax.set_zlabel("$-y$")

    for k in range(2):
        a2 = fig.add_axes([0.06 + 0.5 * k, 0.04, 0.42, 0.30])
        image_axes(a2, xlim=(-40, 1760), ylim=(H + 130, -60))
        e = (e1 if k == 0 else e2)
        e = e[:2] / e[2]
        for i, Xp_ in enumerate(pts):
            col = PAL[[1, 2, 3][i]]
            q1 = project(K, I3, Z3, Xp_[None])[0]
            q2 = project(K, R, t, Xp_[None])[0]
            l = F.T @ np.append(q2, 1) if k == 0 else F @ np.append(q1, 1)
            seg = line_points(l, -40, 1760)
            a2.plot(seg[:, 0], seg[:, 1], color=col, lw=2.2)
            q = q1 if k == 0 else q2
            a2.plot(*q, "o", color=col, ms=9)
        if k == 0:
            a2.plot(*e, "s", color=C["dark"], ms=10)
            a2.annotate("$\\mathbf{e}_1=(%.0f,\\ %.0f)$" % tuple(e), e, (1180, 540), fontsize=15,
                        arrowprops=dict(arrowstyle="->", color=C["dark"]))
        else:
            a2.annotate("", (1755, 340), (1450, 300), arrowprops=dict(arrowstyle="->", lw=2, color=C["dark"]))
            a2.text(1020, 580, "$\\mathbf{e}_2=(%.0f,\\ %.0f)\\ \\rightarrow$" % tuple(e), fontsize=15)
        a2.text(10, -18, "$1$" if k == 0 else "$2$", fontsize=16, color=C["a"])
    out(fig, "04-epipolar-geometry.svg")


# ---------------------------------------------------------------------------------------------
# 2. epipolar pencils for three motions
# ---------------------------------------------------------------------------------------------
def fig_motions():
    rng_ = np.random.default_rng(11)
    uv = rng_.uniform([60, 60], [580, 420], (14, 2))
    Xs = (hom(uv) @ np.linalg.inv(K).T) * rng_.uniform(3.0, 7.0, 14)[:, None]
    motions = [(I3, np.array([0.5, 0.0, 0.0])), (I3, np.array([0.0, 0.0, 0.9])), (R, C2)]
    fig, axs = plt.subplots(1, 3, figsize=(18, 5.4))
    for ax, (Rm, Cm) in zip(axs, motions):
        tm = -Rm @ Cm
        Fm = np.linalg.inv(K).T @ skew(tm) @ Rm @ np.linalg.inv(K)
        a1, a2 = project(K, I3, Z3, Xs), project(K, Rm, tm, Xs)
        image_axes(ax)
        for i in range(len(Xs)):
            l = Fm @ np.append(a1[i], 1)
            seg = clip_line(l, W, H)
            if seg is not None:
                ax.plot(seg[:, 0], seg[:, 1], color=C["gray"], lw=1.2, alpha=0.8)
            if np.allclose(Rm, I3):
                ax.annotate("", a2[i], a1[i], arrowprops=dict(arrowstyle="->", color=C["b"], lw=1.8))
                ax.plot(*a1[i], "o", mfc="white", mec=C["b"], ms=6)
            ax.plot(*a2[i], "o", color=C["a"], ms=6)
        ev = null_vector(Fm.T)
        if abs(ev[2]) > 1e-9:
            ep = ev[:2] / ev[2]
            if 0 <= ep[0] <= W and 0 <= ep[1] <= H:
                ax.plot(*ep, "s", color=C["dark"], ms=10)
                ax.text(ep[0] + 14, ep[1] - 14, "$\\mathbf{e}_2$", fontsize=16)
            else:
                ax.set_title("$\\mathbf{e}_2=(%.0f,\\ %.0f)$" % tuple(ep), fontsize=15)
        else:
            ax.set_title("$\\mathbf{e}_2=(%.2f,\\ %.2f,\\ %.0f)^\\top$" % tuple(ev / np.linalg.norm(ev) * np.sign(ev[0] or 1) + 0.0), fontsize=15)
    out(fig, "04-motions.svg")


# ---------------------------------------------------------------------------------------------
# 3. eight-point: rank 2, normalization, seven-point cubic
# ---------------------------------------------------------------------------------------------
def fig_eight_point():
    fig, axs = plt.subplots(1, 3, figsize=(18, 5.6))
    rng_ = np.random.default_rng(12)
    y1_ = x1 + rng_.normal(0, 2.0, x1.shape)
    y2_ = x2 + rng_.normal(0, 2.0, x2.shape)
    F_free = eight_point(y1_, y2_, rank2=False)
    F_r2 = eight_point(y1_, y2_)
    ax = axs[0]
    et = e1[:2] / e1[2]
    sel = np.argsort(x2[:, 1])[::25]
    lines_free = [F_free.T @ np.append(y2_[i], 1) for i in sel]
    for Fm, col, lw in ((F_free, C["b"], 1.3), (F_r2, C["a"], 1.0)):
        for i in sel:
            l = Fm.T @ np.append(y2_[i], 1)
            seg = line_points(l, -50, 2600)
            ax.plot(seg[:, 0], seg[:, 1], color=col, lw=lw, alpha=0.8)
    xs_ = []
    for i in range(len(lines_free)):
        for j in range(i + 1, len(lines_free)):
            p = np.cross(lines_free[i], lines_free[j])
            xs_.append(p[:2] / p[2])
    xs_ = np.array(xs_)
    ax.plot(xs_[:, 0], xs_[:, 1], ".", color=C["b"], ms=7, zorder=4)
    er = null_vector(F_r2)
    er = er[:2] / er[2]
    ax.plot(*et, "s", color=C["dark"], ms=11, zorder=5)
    ax.plot(*er, "o", color=C["a"], ms=10, mec="white", zorder=6)
    ax.set_xlim(1380, 1780)
    ax.set_ylim(560, 260)
    ax.set_aspect("equal")
    ax.set_xlabel("$u$"); ax.set_ylabel("$v$")
    ax.grid(False)
    print("fig 3a: rank-2 epipole estimate", er.round(1), "true", et.round(1),
          "pairwise intersections of the rank-3 lines: u from %.0f to %.0f" % (xs_[:, 0].min(), xs_[:, 0].max()))

    ax = axs[1]
    sig = np.array([0.25, 0.5, 1.0, 2.0, 4.0])
    med = {True: [], False: []}
    for s in sig:
        for nrm in (False, True):
            errs = []
            for trial in range(100):
                a = x1 + rng_.normal(0, s, x1.shape)
                b2 = x2 + rng_.normal(0, s, x2.shape)
                errs.append(epipolar_error(eight_point(a, b2, normalize=nrm), x1, x2))
            med[nrm].append(np.median(errs))
    ax.loglog(sig, med[False], "o-", color=C["b"], label="$\\tilde{\\mathbf{x}}$")
    ax.loglog(sig, med[True], "o-", color=C["a"], label="$T\\tilde{\\mathbf{x}}$")
    ax.set_xticks(sig)
    ax.set_xticklabels(["0.25", "0.5", "1", "2", "4"])
    ax.minorticks_off()
    ax.set_xlabel("$\\sigma$ (px)")
    ax.set_ylabel("$\\bar{e}$ (px)")
    ax.legend(loc="upper left", fontsize=16)
    print("fig 3b medians raw", np.round(med[False], 3), "normalized", np.round(med[True], 3))

    ax = axs[2]
    _, coef_ = seven_point(x1[:7], x2[:7])
    aa = np.linspace(-1.5, 2.6, 400)
    ax.plot(aa, np.polyval(coef_, aa), color=C["a"])
    ax.axhline(0, color=C["gray"], lw=1)
    sols_, _ = seven_point(x1[:7], x2[:7])
    roots = sorted_roots(coef_)                               # same order as the solutions
    good = []
    for r, Fs in zip(roots, sols_):
        ok = min(np.linalg.norm(Fs - F), np.linalg.norm(Fs + F)) < 1e-6
        ax.plot(r, 0, "o", ms=13 if ok else 10, color=C["y"] if ok else C["b"], zorder=5)
        if ok:
            good.append(r)
    ax.set_xlabel("$\\alpha$")
    ax.set_ylabel("$\\det(\\alpha F_1 + (1-\\alpha) F_2)$")
    print("fig 3c roots", np.round(roots, 4), "good", np.round(good, 4))
    fig.subplots_adjust(wspace=0.36)
    out(fig, "04-eight-point.svg")


def sorted_roots(coef_):
    """Real roots in the order seven_point returns them (np.roots order)."""
    return [r.real for r in np.roots(coef_) if abs(r.imag) < 1e-8]


# ---------------------------------------------------------------------------------------------
# 4. the four decompositions
# ---------------------------------------------------------------------------------------------
def camera_glyph(ax, Rc, tc, col, scale):
    cen = -Rc.T @ tc
    fw = Rc.T @ np.array([0, 0, 1.0])
    rt = Rc.T @ np.array([1.0, 0, 0])
    tip = cen + scale * fw
    a = cen + 0.55 * scale * fw - 0.35 * scale * rt
    b_ = cen + 0.55 * scale * fw + 0.35 * scale * rt
    ax.add_patch(MPolygon([[cen[2], cen[0]], [a[2], a[0]], [b_[2], b_[0]]], closed=True, fc=col, ec=col, alpha=0.35))
    ax.annotate("", (tip[2], tip[0]), (cen[2], cen[0]), arrowprops=dict(arrowstyle="->", color=col, lw=2))
    ax.plot(cen[2], cen[0], "o", color=col, ms=7)
    return cen


def fig_four_poses():
    fig, axs = plt.subplots(2, 2, figsize=(14, 6.4))
    axs = axs.ravel()
    Xp_ = np.array([0.5, -0.4, 5.0])
    q1 = project(K, I3, Z3, Xp_[None])
    q2 = project(K, R, t, Xp_[None])
    sc = np.linalg.norm(t)
    for ax, (Rc, tc) in zip(axs, decompose_essential(E)):
        tc = tc * sc
        Xc = triangulate_dlt(K @ np.c_[I3, Z3], K @ np.c_[Rc, tc], q1, q2)[0]
        cen2 = -Rc.T @ tc
        z1 = Xc[2]
        z2 = (Rc @ Xc + tc)[2]
        Xall = triangulate_dlt(K @ np.c_[I3, Z3], K @ np.c_[Rc, tc], x1, x2)
        nf = np.sum((Xall[:, 2] > 0) & ((Xall @ Rc.T + tc)[:, 2] > 0))
        for cen, z in ((Z3, z1), (cen2, z2)):
            ax.plot([cen[2], Xc[2]], [cen[0], Xc[0]], color=C["y"] if z > 0 else C["x"],
                    lw=2, ls="-" if z > 0 else "--")
        camera_glyph(ax, I3, Z3, C["a"], 0.9)
        camera_glyph(ax, Rc, tc, C["z"], 0.9)
        ax.plot(Xc[2], Xc[0], "*", ms=17, color=C["dark"])
        ax.set_aspect("equal")
        ax.set_xlim(-5.8, 5.8)
        ax.set_ylim(2.2, -2.2)
        ax.set_xlabel("$z$")
        ax.set_ylabel("$x$")
        ax.set_title("$%d/%d$" % (nf, len(X)), fontsize=17, color=C["y"] if nf == len(X) else C["x"])
    fig.subplots_adjust(hspace=0.45, wspace=0.18)
    out(fig, "04-four-poses.svg")


# ---------------------------------------------------------------------------------------------
# 5. triangulation: Hartley-Sturm cost, residual split
# ---------------------------------------------------------------------------------------------
def hs_cost_curve(Fm, x1_, x2_):
    """The one-parameter cost s(t) of optimal_correction and the real roots of g (same algebra)."""
    T1 = np.array([[1, 0, -x1_[0]], [0, 1, -x1_[1]], [0, 0, 1.0]])
    T2 = np.array([[1, 0, -x2_[0]], [0, 1, -x2_[1]], [0, 0, 1.0]])
    Fm = np.linalg.inv(T2).T @ Fm @ np.linalg.inv(T1)
    ea, eb = null_vector(Fm), null_vector(Fm.T)
    ea, eb = ea / np.hypot(ea[0], ea[1]), eb / np.hypot(eb[0], eb[1])
    R1 = np.array([[ea[0], ea[1], 0], [-ea[1], ea[0], 0], [0, 0, 1]])
    R2 = np.array([[eb[0], eb[1], 0], [-eb[1], eb[0], 0], [0, 0, 1]])
    Fm = R2 @ Fm @ R1.T
    f1, f2 = ea[2], eb[2]
    a, b_, c, d = Fm[1, 1], Fm[1, 2], Fm[2, 1], Fm[2, 2]
    P = np.polynomial.polynomial
    atb, ctd = np.array([b_, a]), np.array([d, c])
    q = P.polyadd(P.polymul(atb, atb), f2 ** 2 * P.polymul(ctd, ctd))
    g = P.polysub(P.polymul([0, 1], P.polymul(q, q)),
                  (a * d - b_ * c) * P.polymul(P.polymul([1, 0, f1 ** 2], [1, 0, f1 ** 2]), P.polymul(atb, ctd)))
    cost = lambda s: s ** 2 / (1 + f1 ** 2 * s ** 2) + (c * s + d) ** 2 / ((a * s + b_) ** 2 + f2 ** 2 * (c * s + d) ** 2)
    roots = [r.real for r in P.polyroots(g) if abs(r.imag) < 1e-9]
    return cost, roots


def fig_triangulation():
    fig, axs = plt.subplots(2, 2, figsize=(14, 11.5))
    rng_ = np.random.default_rng(13)
    Xq = Xa[3]
    a1 = project(K, I3, Z3, Xq[None])[0] + rng_.normal(0, 1.0, 2)
    a2 = project(K, Ra, ta, Xq[None])[0] + rng_.normal(0, 1.0, 2)
    Fm = np.linalg.inv(K).T @ skew(ta) @ Ra @ np.linalg.inv(K)
    c1, c2 = optimal_correction(Fm, a1, a2)
    Pa, Pb = K @ np.c_[I3, Z3], K @ np.c_[Ra, ta]
    ests = {"mid": (triangulate_midpoint(K, Ra, ta, a1[None], a2[None])[0], C["c"], "^"),
            "DLT": (triangulate_dlt(Pa, Pb, a1[None], a2[None])[0], C["b"], "s"),
            "opt": (triangulate_dlt(Pa, Pb, c1[None], c2[None])[0], C["y"], "o")}
    for k, (ax, obs, cor) in enumerate(((axs[0, 0], a1, c1), (axs[0, 1], a2, c2))):
        l = Fm.T @ np.append(c2, 1) if k == 0 else Fm @ np.append(c1, 1)
        seg = line_points(l, obs[0] - 4, obs[0] + 4)
        ax.plot(seg[:, 0], seg[:, 1], color=C["a"], lw=2)
        ax.plot(*obs, "+", color=C["dark"], ms=18, mew=2.5)
        for nm, (Xe, col, mk) in ests.items():
            pr = project(K, I3, Z3, Xe[None])[0] if k == 0 else project(K, Ra, ta, Xe[None])[0]
            ax.plot(*pr, mk, color=col, ms=12 if nm != "opt" else 14, mfc="none" if nm != "opt" else col, mew=2.2, label=nm)
            ax.plot([obs[0], pr[0]], [obs[1], pr[1]], color=col, lw=1, alpha=0.7)
        ax.set_xlim(obs[0] - 3, obs[0] + 3)
        ax.set_ylim(obs[1] + 3, obs[1] - 3)
        ax.set_aspect("equal")
        ax.set_xlabel("$u$ (px)")
        ax.set_ylabel("$v$ (px)")
        ax.set_title("$\\mathbf{x}_%d$" % (k + 1), fontsize=17)
    axs[0, 0].legend(fontsize=14, loc="lower left")
    for nm, (Xe, col, mk) in ests.items():
        r1_ = np.linalg.norm(project(K, I3, Z3, Xe[None])[0] - a1)
        r2_ = np.linalg.norm(project(K, Ra, ta, Xe[None])[0] - a2)
        print("fig 5a %s: residual image 1 %.2f px, image 2 %.2f px, total %.2f px" % (nm, r1_, r2_, np.hypot(r1_, r2_)))
    for ax, nm in zip(axs[1], ("main pair", "asymmetric")):
        st = results[nm]
        meths = ["midpoint", "DLT", "optimal"]
        vals = np.array([np.mean(st[m], axis=0) for m in meths])
        xx = np.arange(3)
        ax.bar(xx - 0.2, vals[:, 0], 0.38, color=C["a"], label="$\\mathbf{x}_1$")
        ax.bar(xx + 0.2, vals[:, 1], 0.38, color=C["z"], label="$\\mathbf{x}_2$")
        ax.plot(xx, np.hypot(vals[:, 0], vals[:, 1]), "D", color=C["dark"], ms=9, label="$\\sqrt{e_1^2+e_2^2}$")
        ax.axhline(1.0, color=C["gray"], ls="--", lw=1.5)
        ax.set_xticks(xx)
        ax.set_xticklabels(["mid", "DLT", "opt"])
        ax.set_ylim(0, 2.6)
        ax.set_ylabel("RMS (px)")
        ax.legend(fontsize=14, loc="upper center", ncol=3)
    out(fig, "04-triangulation.svg")


# ---------------------------------------------------------------------------------------------
# 6. depth uncertainty of a rectified pair
# ---------------------------------------------------------------------------------------------
def fig_depth_uncertainty():
    fig, axs = plt.subplots(1, 2, figsize=(17, 6.2), gridspec_kw=dict(width_ratios=[1.0, 1.15]))
    ax = axs[0]
    f_, b_ = 6.0, 1.5                                         # a toy camera with huge pixels
    us = np.arange(-9, 10)                                    # pixel edges
    cols = [C["c"], C["b"]]
    for cx_, col in ((0.0, C["a"]), (b_, C["z"])):
        for u in us:
            ax.plot([cx_, cx_ + 12 * u / f_], [0, 12], color=col, lw=0.8, alpha=0.5)
        ax.plot(cx_, 0, "o", color=col, ms=10, zorder=5)
    # the cell seen by left pixel [0, 1] and right pixel [-d, 1 - d]: corners where the edge rays meet;
    # a left ray x = Z ul / f and a right ray x = b + Z ur / f meet at Z = f b / (ul - ur)
    print("fig 6 toy cells (d: Z range):", end=" ")
    for d in range(2, 9):
        quad = [[f_ * b_ / (ul - ur) * ul / f_, f_ * b_ / (ul - ur)]
                for ul, ur in ((0, -d), (1, -d), (1, 1 - d), (0, 1 - d))]
        ax.add_patch(MPolygon(np.array(quad), closed=True, fc=cols[d % 2], ec=C["dark"], alpha=0.75, lw=1, zorder=4))
        print("%d: %.2f-%.2f" % (d, f_ * b_ / (d + 1), f_ * b_ / (d - 1)), end="; ")
    print()
    ax.set_xlim(-3.0, 4.5)
    ax.set_ylim(-1.3, 11)
    ax.set_aspect("equal")
    ax.set_xlabel("$x$")
    ax.set_ylabel("$Z$")
    ax.grid(False)
    ax.text(-0.25, -1.0, "$\\mathbf{C}_1$", color=C["a"], fontsize=17)
    ax.text(b_ - 0.25, -1.0, "$\\mathbf{C}_2$", color=C["z"], fontsize=17)

    ax = axs[1]
    Zs = np.linspace(0.3, 10, 300)
    for bb, col in ((0.06, C["b"]), (0.12, C["a"]), (0.30, C["z"])):
        ax.plot(Zs, 100 * Zs ** 2 / (500 * bb) * 0.25, color=col, label="$b=%.2f$ m" % bb)
    ax.set_xlabel("$Z$ (m)")
    ax.set_ylabel("$\\delta Z$ (cm)")
    ax.set_title("$f=500$ px,  $\\delta d=0.25$ px", fontsize=15)
    ax.legend(fontsize=14, loc="upper left")
    ax.set_ylim(0, 60)
    print("fig 6: dZ at Z=5 m, b=0.12: %.1f cm" % (100 * 25 / (500 * 0.12) * 0.25))
    out(fig, "04-depth-uncertainty.svg")


# ---------------------------------------------------------------------------------------------
# 7. degeneracies
# ---------------------------------------------------------------------------------------------
def fig_degeneracy():
    fig, axs = plt.subplots(1, 2, figsize=(16, 5.6))
    ax = axs[0]
    for (nm, (a, b2)), col in zip(list(scenes.items())[:3], (C["a"], C["b"], C["z"])):
        q1_, q2_ = normalize_points(a)[0], normalize_points(b2)[0]
        s = np.linalg.svd(np.einsum("ni,nj->nij", q2_, q1_).reshape(-1, 9))[1]
        ax.semilogy(np.arange(1, 10), np.maximum(s / s[0], 1e-17), "o-", color=col, label=nm, ms=8)
    ax.set_xlabel("$k$")
    ax.set_ylabel("$s_k / s_1$")
    ax.set_xticks(range(1, 10))
    ax.set_ylim(1e-18, 3)
    ax = axs[1]
    rng_ = np.random.default_rng(14)
    bls = np.array([0.0, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.2, 0.3, 0.5, 0.86])
    for plane, col, mk in ((None, C["a"], "o"), (np.array([0.05, -0.03, 0.2]), C["b"], "s")):
        rat = []
        for bl in bls:
            vals = []
            for seed in range(5):
                Cb = C2 / np.linalg.norm(C2) * bl
                a, b2 = make_pair(R, Cb, plane=plane, seed=100 + seed)
                vals.append(inlier_ratio(a + rng_.normal(0, 1, a.shape), b2 + rng_.normal(0, 1, b2.shape), 1.0))
            rat.append(np.mean(vals))
        ax.plot(100 * bls, rat, mk + "-", color=col, ms=8)
        print("fig 7b", "planar" if plane is not None else "general", np.round(rat, 2))
    ax.set_xscale("symlog", linthresh=1)
    ax.set_xticks([0, 1, 3, 10, 30, 100])
    ax.set_xticklabels(["0", "1", "3", "10", "30", "100"])
    ax.minorticks_off()
    ax.set_xlabel("$\\Vert\\mathbf{C}_2\\Vert$ (cm)")
    ax.set_ylabel("$n_H / n_F$")
    ax.set_ylim(0, 1.05)
    out(fig, "04-degeneracy.svg")


# ---------------------------------------------------------------------------------------------
# 8. rectification of the main pair
# ---------------------------------------------------------------------------------------------
def fig_rectification():
    fig, axs = plt.subplots(2, 2, figsize=(16, 11))
    sel = np.argsort(x1[:, 1])[10::38][:5]
    corners = np.array([[0, 0], [W, 0], [W, H], [0, H]], float)
    q1r, q2r = transfer(H1, corners), transfer(H2, corners)
    allr = np.r_[q1r, q2r]
    xl = (allr[:, 0].min() - 30, allr[:, 0].max() + 30)
    yl = (allr[:, 1].max() + 30, allr[:, 1].min() - 30)
    for col_i, i in enumerate(sel):
        col = PAL[col_i % len(PAL)]
        l2_ = F @ np.append(x1[i], 1)
        l1_ = F.T @ np.append(x2[i], 1)
        for ax, l, p in ((axs[0, 0], l1_, x1[i]), (axs[0, 1], l2_, x2[i])):
            seg = clip_line(l)
            ax.plot(seg[:, 0], seg[:, 1], color=col, lw=2)
            ax.plot(*p, "o", color=col, ms=8)
        p1r, p2r = transfer(H1, x1[i:i + 1])[0], transfer(H2, x2[i:i + 1])[0]
        for ax, p in ((axs[1, 0], p1r), (axs[1, 1], p2r)):
            ax.axhline(p[1], color=col, lw=2)
            ax.plot(*p, "o", color=col, ms=8)
    for ax in axs[0]:
        ax.plot(x1[:, 0] if ax is axs[0, 0] else x2[:, 0], x1[:, 1] if ax is axs[0, 0] else x2[:, 1], ".", color=C["gray"], ms=3)
        image_axes(ax)
    for ax, q in ((axs[1, 0], q1r), (axs[1, 1], q2r)):
        ax.add_patch(MPolygon(q, closed=True, fill=False, ec=C["a"], lw=2))
        pts_ = transfer(H1, x1) if ax is axs[1, 0] else transfer(H2, x2)
        ax.plot(pts_[:, 0], pts_[:, 1], ".", color=C["gray"], ms=3)
        image_axes(ax, xlim=xl, ylim=yl, frame=False)
    out(fig, "04-rectification.svg")


# ---------------------------------------------------------------------------------------------
# 9-11. stereo matching
# ---------------------------------------------------------------------------------------------
def disp_show(ax, D, title=None, invalid=None):
    D = np.array(D, float)
    if invalid is not None:
        D = np.where(invalid, np.nan, D)
    cm = plt.get_cmap("viridis").copy()
    cm.set_bad("#d9d9d9")
    im = ax.imshow(D, cmap=cm, vmin=4, vmax=24, interpolation="nearest")
    ax.set_xticks([]); ax.set_yticks([])
    ax.grid(False)
    if title:
        ax.set_title(title, fontsize=15)
    return im


def fig_stereo_pair():
    fig, axs = plt.subplots(1, 3, figsize=(18, 4.9))
    for ax, img, nm in ((axs[0], left, "L"), (axs[1], right, "R")):
        ax.imshow(img, cmap="gray", vmin=0, vmax=255, interpolation="nearest")
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
        ax.set_title("$I_%s$" % nm, fontsize=16)
    im = disp_show(axs[2], gt, "$d^{\\ast}$", invalid=~mask)
    fig.colorbar(im, ax=axs[2], fraction=0.035, pad=0.02)
    out(fig, "04-stereo-pair.svg")


def error_show(ax, D, title):
    err = np.abs(D - gt) > 1.0
    rgb = np.dstack([np.clip(left / 255, 0, 1)] * 3) * 0.55 + 0.45
    rgb[mask & err] = np.array([0.84, 0.15, 0.16])
    rgb[~mask] = np.array([0.55, 0.55, 0.55])
    ax.imshow(rgb, interpolation="nearest")
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    ax.set_title(title, fontsize=15)


def fig_block_matching():
    fig, axs = plt.subplots(2, 4, figsize=(19, 7.6))
    maps = [("SAD 3×3", wta(cost_volume_sad(left, right, 3))),
            ("SAD 7×7", wta(cost_volume_sad(left, right, 7))),
            ("SAD 15×15", wta(cost_volume_sad(left, right, 15))),
            ("SGM", D_sgm)]
    for k, (nm, D) in enumerate(maps):
        disp_show(axs[0, k], D, nm)
        error_show(axs[1, k], D, "%.1f%%" % bad_pixels(D))
    fig.subplots_adjust(wspace=0.04, hspace=0.12)
    out(fig, "04-block-matching.svg")


def fig_sgm():
    row = 145
    fig = plt.figure(figsize=(18, 8.4))
    gs = fig.add_gridspec(2, 2, width_ratios=[1.35, 1], hspace=0.28, wspace=0.12)
    S = sgm(C5)
    for k, (V, ttl) in enumerate(((C5[:, row, :], "$C(x, d)$"), (S[:, row, :], "$S(x, d)$"))):
        ax = fig.add_subplot(gs[k, 0])
        Vn = V / np.percentile(V, 95, axis=0, keepdims=True)
        ax.imshow(np.minimum(Vn, 1.2), cmap="magma", aspect="auto", origin="lower", interpolation="nearest")
        xx = np.arange(SW)
        g = np.where(mask[row], gt[row], np.nan)
        ax.plot(xx, g, color="white", lw=3)
        dd = np.argmin(V, axis=0)
        ax.plot(xx, dd, ".", color=C["c"], ms=6)
        ax.set_ylabel("$d$")
        ax.set_title(ttl, fontsize=15)
        ax.grid(False)
        ax.set_xlim(0, SW - 1)
        if k == 1:
            ax.set_xlabel("$x$")
    ax = fig.add_subplot(gs[:, 1])
    disp_show(ax, D_sgm, None, invalid=~consistent)
    ax.axhline(row, color="white", lw=1.5, ls="--")
    out(fig, "04-sgm.svg")


if __name__ == "__main__":
    fig_epipolar_geometry()
    fig_motions()
    fig_eight_point()
    fig_four_poses()
    fig_triangulation()
    fig_depth_uncertainty()
    fig_degeneracy()
    fig_rectification()
    fig_stereo_pair()
    fig_block_matching()
    fig_sgm()
