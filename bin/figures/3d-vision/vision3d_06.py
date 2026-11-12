"""Figures for 3d-vision post 06: visual SLAM.

Run from anywhere:
    python3 bin/figures/3d-vision/vision3d_06.py            # writes the SVGs
    python3 bin/figures/3d-vision/vision3d_06.py /tmp/prev  # ... and PNG previews into /tmp/prev

Every number quoted in the post (text and captions) is printed by this script. The post's code
blocks are copied verbatim below, in the order of the post, including the print statements whose
output the post quotes. Poses: T_i = T_{w c_i} (camera-to-world, OpenCV camera axes), tangent
vectors xi = (rho, phi) with the translation part first, right perturbations T <- T Exp(xi).
"""
import os
import sys
import pathlib

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

plt.rcParams["svg.hashsalt"] = "3d-vision-06"  # stable element ids

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/3d-vision"
PREV = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None


def out(fig, name):
    if PREV is not None:
        PREV.mkdir(parents=True, exist_ok=True)
        fig.savefig(PREV / name.replace(".svg", ".png"), dpi=60)
    save(fig, OUT / name)


# ============================================================================================
# The post's code, verbatim
# ============================================================================================
# ---- drift ---------------------------------------------------------------------------------
import numpy as np


def dead_reckon(n, sigma_d, sigma_th, trials, rng, step=1.0):
    """Integrate n odometry steps of a robot driving straight ahead. Each step moves `step`
    metres with noise sigma_d and turns by a noisy angle (sigma_th). Returns the end-point
    errors of all trials (the true end point is (n * step, 0))."""
    th = np.cumsum(rng.normal(0, sigma_th, (trials, n)), axis=1)       # heading after each step
    d = step + rng.normal(0, sigma_d, (trials, n))
    x, y = (d * np.cos(th)).sum(1), (d * np.sin(th)).sum(1)
    return np.hypot(x - n * step, y)


rng = np.random.default_rng(0)
for n in (10, 100, 1000):
    e_d = dead_reckon(n, 0.02, 0.0, 2000, rng)                 # only distance noise (2 cm/step)
    e_th = dead_reckon(n, 0.0, np.deg2rad(0.5), 2000, rng)     # only heading noise (0.5 deg/step)
    print(f"n = {n:4d}: RMS error, distance noise {np.sqrt(np.mean(e_d**2)):7.3f} m"
          f" (theory {0.02 * np.sqrt(n):6.3f}),  heading noise {np.sqrt(np.mean(e_th**2)):7.2f} m"
          f" (theory {np.deg2rad(0.5) * np.sqrt(n * (n + 1) * (2 * n + 1) / 6):6.2f})")


# ---- map1d ---------------------------------------------------------------------------------
# State x = (x0, x1, x2, l): three robot positions on a line and one landmark.
# Every factor is linear: a row a with a @ x = b + noise of standard deviation s.
factors = [  # (row a,               b,    s,    name)
    (np.array([1., 0, 0, 0]),   0.0, 0.01, "prior x0 = 0"),
    (np.array([-1., 1, 0, 0]),  1.1, 0.10, "odometry x1 - x0"),
    (np.array([0., -1, 1, 0]),  1.1, 0.10, "odometry x2 - x1"),
    (np.array([-1., 0, 0, 1]),  3.0, 0.05, "landmark l - x0"),
    (np.array([0., 0, -1, 1]),  1.0, 0.05, "landmark l - x2"),
]
A = np.array([a / s for a, b, s, _ in factors])       # whitened Jacobian
b = np.array([b / s for a, b, s, _ in factors])       # whitened measurements
H = A.T @ A                                           # information matrix
x_map = np.linalg.solve(H, A.T @ b)                   # MAP = weighted least squares
cov = np.linalg.inv(H)
x_odo = np.array([0.0, 1.1, 2.2, 3.0])                # odometry only (and l from x0)
print("MAP estimate  :", x_map.round(4))
print("odometry only :", x_odo)
print("std devs      :", np.sqrt(np.diag(cov)).round(4))
print("H zero pattern:\n", (np.abs(H) > 1e-12).astype(int))


# ---- marg ----------------------------------------------------------------------------------
def schur_marginalize(H, keep, drop):
    """Information matrix of the variables `keep` after marginalizing out `drop`:
    H_kk - H_kd H_dd^-1 H_dk (the Schur complement)."""
    Hkk, Hkd, Hdd = H[np.ix_(keep, keep)], H[np.ix_(keep, drop)], H[np.ix_(drop, drop)]
    return Hkk - Hkd @ np.linalg.solve(Hdd, Hkd.T)


def toy_slam_information(n_poses=20, n_lm=30, fov=3, seed=0):
    """Scalar 'information pattern' of a toy SLAM problem: poses in a chain (odometry), each pose
    observing the landmarks within `fov` index steps of its own position along the path."""
    rng = np.random.default_rng(seed)
    n = n_poses + n_lm
    H = np.eye(n) * 1e-3
    def add(i, j, w):                                  # a factor between variables i and j
        H[i, i] += w; H[j, j] += w; H[i, j] -= w; H[j, i] -= w
    for k in range(n_poses - 1):
        add(k, k + 1, 1.0 + rng.random())              # odometry
    for k in range(n_poses):
        c = k * n_lm / n_poses
        for m in range(n_lm):
            if abs(m - c) <= fov:
                add(k, n_poses + m, 0.5 + rng.random())   # observation of landmark m
    H[0, 0] += 10.0                                    # prior on the first pose (the gauge)
    return H


H_toy = toy_slam_information()
P, L = list(range(20)), list(range(20, 50))                      # pose and landmark indices
H_filter = schur_marginalize(H_toy, keep=[19] + L, drop=P[:-1])   # EKF-SLAM: only the last pose
H_rcs = schur_marginalize(H_toy, keep=P, drop=L)                    # BA: reduced camera system
nnz = lambda M: int((np.abs(M) > 1e-12 * np.abs(M).max()).sum())     # count nonzeros (relative threshold)
print("full smoothing:", H_toy.shape, "nonzeros", nnz(H_toy), f"({nnz(H_toy) / H_toy.size:.0%})")
print("filter (last pose + landmarks):", H_filter.shape, "nonzeros", nnz(H_filter),
      f"({nnz(H_filter) / H_filter.size:.0%})")
print("poses only (landmarks marginalized):", H_rcs.shape, "nonzeros", nnz(H_rcs),
      f"({nnz(H_rcs) / H_rcs.size:.0%})")


# ---- direct --------------------------------------------------------------------------------
from scipy import ndimage as ndi

def make_signal(n=400, seed=0, width=5):
    """A 1D 'image row': random intensity steps every `width` pixels, slightly blurred."""
    rng = np.random.default_rng(seed)
    steps = np.repeat(rng.uniform(0, 1, n // width + 1), width)[:n]
    return ndi.gaussian_filter1d(steps, 1.0)


def sample(I, x):
    return np.interp(x, np.arange(len(I)), I)


def align_1d(I_ref, I_cur, s0=0.0, sigmas=(0.0,), iters=15, margin=40):
    """Gauss-Newton on the photometric error E(s) = sum_x (I_cur(x + s) - I_ref(x))^2,
    coarse to fine: each stage blurs both signals with the given sigma (0 = no blur)."""
    s, xs = s0, np.arange(margin, len(I_ref) - margin, dtype=float)
    for sg in sigmas:
        R = ndi.gaussian_filter1d(I_ref, sg) if sg > 0 else I_ref
        C = ndi.gaussian_filter1d(I_cur, sg) if sg > 0 else I_cur
        G = np.gradient(C)                                # dI_cur / dx
        for _ in range(iters):
            r = sample(C, xs + s) - sample(R, xs)         # photometric residuals
            J = sample(G, xs + s)                         # d r / d s
            s -= (J @ r) / (J @ J)                        # Gauss-Newton step (1 unknown)
    return s


I_ref = make_signal()
s_true = 13.0
I_cur = sample(I_ref, np.arange(400) - s_true) + np.random.default_rng(4).normal(0, 0.01, 400)
print("single level from s = 0  :", round(align_1d(I_ref, I_cur), 3))
print("pyramid 8, 4, 2, 1, 0    :", round(align_1d(I_ref, I_cur, sigmas=(8, 4, 2, 1, 0)), 3))
print("single level from s = 10 :", round(align_1d(I_ref, I_cur, s0=10.0), 3))


# ---- lie -----------------------------------------------------------------------------------
def hat(w):
    return np.array([[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]])


def so3_exp(w):
    th = np.linalg.norm(w)
    if th < 1e-10:
        return np.eye(3) + hat(w)
    K = hat(w / th)
    return np.eye(3) + np.sin(th) * K + (1 - np.cos(th)) * K @ K        # Rodrigues


def so3_log(R):
    c = np.clip((np.trace(R) - 1) / 2, -1, 1)
    th = np.arccos(c)
    v = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    if th < 1e-10:
        return v / 2
    if th > np.pi - 1e-6:                     # near 180 deg: (R + I) / 2 = k k^T
        B = (R + np.eye(3)) / 2
        i = np.argmax(np.diag(B))
        return th * B[:, i] / np.sqrt(B[i, i])
    return th / (2 * np.sin(th)) * v


def so3_left_jacobian(w):
    th = np.linalg.norm(w)
    K = hat(w)
    if th < 1e-8:
        return np.eye(3) + 0.5 * K
    return (np.eye(3) + (1 - np.cos(th)) / th**2 * K + (th - np.sin(th)) / th**3 * K @ K)


def se3_exp(xi):
    """xi = (rho, phi) -> 4x4 pose. The translation is J_l(phi) rho, not rho itself."""
    T = np.eye(4)
    T[:3, :3] = so3_exp(xi[3:])
    T[:3, 3] = so3_left_jacobian(xi[3:]) @ xi[:3]
    return T


def se3_log(T):
    phi = so3_log(T[:3, :3])
    rho = np.linalg.solve(so3_left_jacobian(phi), T[:3, 3])
    return np.r_[rho, phi]


def se3_inv(T):
    Ti = np.eye(4)
    Ti[:3, :3] = T[:3, :3].T
    Ti[:3, 3] = -T[:3, :3].T @ T[:3, 3]
    return Ti


def se3_adjoint(T):
    """Ad_T with xi = (rho, phi):  T Exp(xi) T^-1 = Exp(Ad_T xi)."""
    R, t = T[:3, :3], T[:3, 3]
    Ad = np.zeros((6, 6))
    Ad[:3, :3] = R; Ad[3:, 3:] = R; Ad[:3, 3:] = hat(t) @ R
    return Ad


xi = np.array([0.3, -0.2, 0.5, 0.4, 0.1, -0.7])
T = se3_exp(xi)
print("log(exp(xi)) == xi:", np.allclose(se3_log(T), xi))
print("translation of exp(xi):", T[:3, 3].round(4), " vs rho:", xi[:3])
A_ = se3_exp(np.array([0.1, 0.2, -0.1, 0.05, -0.02, 0.03]))
d = np.array([0.01, -0.02, 0.01, 0.02, 0.01, -0.01])
print("adjoint check:", np.allclose(A_ @ se3_exp(d) @ se3_inv(A_), se3_exp(se3_adjoint(A_) @ d)))


# ---- pgo3d ---------------------------------------------------------------------------------
import scipy.sparse as sp
import scipy.sparse.linalg as spla


def ad_se3(xi):
    """The small adjoint ad(xi) of se(3), xi = (rho, phi)."""
    M = np.zeros((6, 6))
    M[:3, :3] = hat(xi[3:]); M[3:, 3:] = hat(xi[3:]); M[:3, 3:] = hat(xi[:3])
    return M


def edge_residual(Ti, Tj, Zij):
    """r = Log(Z_ij^-1 T_i^-1 T_j): zero when the poses agree with the measurement."""
    return se3_log(se3_inv(Zij) @ se3_inv(Ti) @ Tj)


def edge_jacobians(Ti, Tj, r):
    """Jacobians of r w.r.t. right perturbations T_i Exp(d_i) and T_j Exp(d_j).
    Uses J_r^-1(r) ~ I + ad(r)/2, accurate to second order in the (small) residual."""
    Jr_inv = np.eye(6) + 0.5 * ad_se3(r)
    Jj = Jr_inv
    Ji = -Jr_inv @ se3_adjoint(se3_inv(Tj) @ Ti)
    return Ji, Jj


def optimize_pose_graph(T, edges, iters=10, kernel=None, c=1.0, verbose=False):
    """Gauss-Newton on sum_e w(e) r_e^T Omega_e r_e over poses T (list of 4x4), with pose 0 fixed.
    edges: list of (i, j, Z_ij, Omega_ij). kernel='cauchy' turns on IRLS with scale c."""
    T = [t.copy() for t in T]
    n = len(T)
    history = []
    for it in range(iters):
        rows, cols, vals = [], [], []
        g = np.zeros(6 * n)
        cost = 0.0
        for i, j, Z, Om in edges:
            r = edge_residual(T[i], T[j], Z)
            e2 = r @ Om @ r                                   # squared Mahalanobis error
            w = 1.0 / (1.0 + e2 / c**2) if kernel == "cauchy" else 1.0
            cost += c**2 * np.log1p(e2 / c**2) if kernel == "cauchy" else e2
            Ji, Jj = edge_jacobians(T[i], T[j], r)
            for a, Ja in ((i, Ji), (j, Jj)):
                g[6 * a:6 * a + 6] += w * Ja.T @ Om @ r
                for bb, Jb in ((i, Ji), (j, Jj)):
                    blk = w * Ja.T @ Om @ Jb
                    rr, cc = np.meshgrid(np.arange(6 * a, 6 * a + 6), np.arange(6 * bb, 6 * bb + 6), indexing="ij")
                    rows.append(rr.ravel()); cols.append(cc.ravel()); vals.append(blk.ravel())
        history.append(cost)
        Hs = sp.csc_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))),
                           shape=(6 * n, 6 * n))
        dx = np.zeros(6 * n)
        dx[6:] = spla.spsolve(Hs[6:, 6:], -g[6:])            # gauge: pose 0 stays fixed
        for a in range(1, n):
            T[a] = T[a] @ se3_exp(dx[6 * a:6 * a + 6])        # retraction on SE(3)
        if verbose:
            print(f"iter {it}: cost {cost:.4g}, |dx| {np.linalg.norm(dx):.2e}")
        if np.linalg.norm(dx) < 1e-8:
            break
    return T, history


# ---- pgo-data ------------------------------------------------------------------------------
def camera_pose(p, forward, up=np.array([0.0, 0.0, 1.0])):
    """T_wc of an OpenCV camera at p looking along `forward` (x right, y down, z forward)."""
    f = forward / np.linalg.norm(forward)
    r = np.cross(f, up); r /= np.linalg.norm(r)       # right = forward x up
    T = np.eye(4)
    T[:3, :3] = np.c_[r, np.cross(f, r), f]            # columns: camera axes in the world
    T[:3, 3] = p
    return T


def simulate_pose_graph(path, sig_odo, sig_loop, loop_radius=1.0, min_gap=20, stride=8, seed=0):
    """Ground-truth poses along `path` (k x 3 points), noisy odometry between consecutive poses,
    and, every `stride` poses, a loop-closure edge to the nearest pose more than min_gap steps older
    if it is closer than loop_radius.
    sig_* = (sigma_rho [m], sigma_phi [rad]). Returns truth, dead-reckoned initial guess, edges."""
    rng = np.random.default_rng(seed)
    fwd = np.gradient(path, axis=0)
    truth = [camera_pose(p, f) for p, f in zip(path, fwd)]
    def measure(i, j, sig):
        noise = np.r_[rng.normal(0, sig[0], 3), rng.normal(0, sig[1], 3)]
        Z = se3_inv(truth[i]) @ truth[j] @ se3_exp(noise)
        Om = np.diag(np.r_[np.full(3, sig[0] ** -2), np.full(3, sig[1] ** -2)])
        return (i, j, Z, Om)
    edges = [measure(i, i + 1, sig_odo) for i in range(len(path) - 1)]
    init = [truth[0]]
    for i, j, Z, Om in edges:
        init.append(init[-1] @ Z)                          # dead reckoning: chain the odometry
    for j in range(min_gap + 1, len(path), stride):        # a place-recognition query every `stride`
        dist = np.linalg.norm(path[:j - min_gap] - path[j], axis=1)
        if dist.min() < loop_radius:
            edges.append(measure(int(dist.argmin()), j, sig_loop))
    return truth, init, edges


def ate_rmse(est, truth):
    """Absolute trajectory error: RMS distance between estimated and true camera centres."""
    d = np.array([e[:3, 3] - t[:3, 3] for e, t in zip(est, truth)])
    return np.sqrt(np.mean(np.sum(d ** 2, 1)))


# a ground robot: two laps of a 24 m x 12 m rounded rectangle, poses 0.65 m apart on average
s = np.linspace(0, 2, 200, endpoint=False) * 2 * np.pi
path_2d = np.c_[12 * np.sign(np.cos(s)) * np.abs(np.cos(s)) ** 0.4,
                6 * np.sign(np.sin(s)) * np.abs(np.sin(s)) ** 0.4,
                np.zeros_like(s)]
truth, init, edges = simulate_pose_graph(path_2d, sig_odo=(0.02, np.deg2rad(0.6)),
                                         sig_loop=(0.05, np.deg2rad(1.0)))
n_loop = len(edges) - (len(truth) - 1)
print(f"{len(truth)} poses, {len(truth) - 1} odometry edges, {n_loop} loop closures")
est, hist = optimize_pose_graph(init, edges, iters=10)
print(f"ATE: dead reckoning {ate_rmse(init, truth):.3f} m -> optimized {ate_rmse(est, truth):.3f} m")
print("cost per iteration:", np.array(hist[:6]).round(1))


# ---- robust --------------------------------------------------------------------------------
i_bad, j_bad = 25, 170                    # two different places that "look the same"
Z_bad = np.eye(4); Z_bad[:3, 3] = [0.0, 0.0, 0.5]
edges_bad = edges + [(i_bad, j_bad, Z_bad, edges[-1][3])]
est_l2, hist_l2 = optimize_pose_graph(init, edges_bad, iters=100)
print(f"L2 with the false loop: {len(hist_l2)} iterations, cost {hist_l2[0]:.0f} -> {hist_l2[-1]:.0f}")
est_ca, _ = optimize_pose_graph(init, edges_bad, iters=15, kernel="cauchy", c=3.0)
def edge_err(T, e):
    r = edge_residual(T[e[0]], T[e[1]], e[2]); return np.sqrt(r @ e[3] @ r)
print(f"false loop between places {np.linalg.norm(path_2d[i_bad] - path_2d[j_bad]):.1f} m apart")
print(f"one false loop closure, L2:     ATE {ate_rmse(est_l2, truth):.3f} m")
print(f"one false loop closure, Cauchy: ATE {ate_rmse(est_ca, truth):.3f} m,"
      f" weight of the false edge {1 / (1 + edge_err(est_ca, edges_bad[-1])**2 / 9):.2e}")


# ---- jaccheck ------------------------------------------------------------------------------
rng = np.random.default_rng(1)
Ti, Tj = se3_exp(rng.normal(0, 1, 6)), se3_exp(rng.normal(0, 1, 6))
Z = se3_inv(Ti) @ Tj @ se3_exp(rng.normal(0, 0.05, 6))           # a slightly inconsistent edge
r0 = edge_residual(Ti, Tj, Z)
Ji, Jj = edge_jacobians(Ti, Tj, r0)
eps = 1e-6
Ji_num = np.array([(edge_residual(Ti @ se3_exp(eps * e), Tj, Z) - r0) / eps for e in np.eye(6)]).T
Jj_num = np.array([(edge_residual(Ti, Tj @ se3_exp(eps * e), Z) - r0) / eps for e in np.eye(6)]).T
print(f"|r| = {np.linalg.norm(r0):.3f};  max Jacobian error: J_i {np.abs(Ji - Ji_num).max():.1e},"
      f" J_j {np.abs(Jj - Jj_num).max():.1e}")


# ---- pgo3d-run -----------------------------------------------------------------------------
# a drone: three laps of a 16 m x 10 m ellipse, climbing and descending 1.5 m four times
s = np.linspace(0, 3, 240, endpoint=False) * 2 * np.pi
path_3d = np.c_[8 * np.cos(s), 5 * np.sin(s), 2.0 + 1.5 * np.sin(s / 1.5) ** 2]
truth3, init3, edges3 = simulate_pose_graph(path_3d, sig_odo=(0.02, np.deg2rad(0.5)),
                                            sig_loop=(0.05, np.deg2rad(1.0)), loop_radius=0.8,
                                            stride=6, seed=2)
est3, hist3 = optimize_pose_graph(init3, edges3, iters=10)
rot_err = lambda A, B: np.rad2deg(np.linalg.norm(so3_log(A[:3, :3].T @ B[:3, :3])))
print(f"{len(truth3)} poses, {len(edges3) - len(truth3) + 1} loop closures, {len(hist3)} iterations")
print(f"ATE {ate_rmse(init3, truth3):.3f} m -> {ate_rmse(est3, truth3):.3f} m;"
      f" max rotation error {max(rot_err(a, b) for a, b in zip(init3, truth3)):.2f} deg"
      f" -> {max(rot_err(a, b) for a, b in zip(est3, truth3)):.2f} deg")


# ---- umeyama -------------------------------------------------------------------------------
def umeyama(X, Y, with_scale=True):
    """s, R, t minimizing sum ||Y_k - (s R X_k + t)||^2 (Umeyama 1991); X, Y are n x 3."""
    mx, my = X.mean(0), Y.mean(0)
    Xc, Yc = X - mx, Y - my
    U, D, Vt = np.linalg.svd(Yc.T @ Xc / len(X))
    S = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])     # no reflections
    R = U @ S @ Vt
    s = np.trace(np.diag(D) @ S) / Xc.var(0).sum() if with_scale else 1.0
    return s, R, my - s * R @ mx


# a monocular estimate lives in its own frame and scale: simulate one from est3
P_true = np.array([T[:3, 3] for T in truth3])
P_est = np.array([T[:3, 3] for T in est3])
Rg = so3_exp(np.array([0.2, -0.4, 1.0]))
P_mono = 0.37 * P_est @ Rg.T + np.array([3.0, -1.0, 0.5])
s_, R_, t_ = umeyama(P_mono, P_true)
ate = lambda P: np.sqrt(np.mean(np.sum((P - P_true) ** 2, 1)))
print(f"ATE without alignment {ate(P_mono):.2f} m;  Sim(3)-aligned {ate(s_ * P_mono @ R_.T + t_):.3f} m"
      f" (scale {s_:.3f} = 1/{1 / s_:.2f})")


# ---- bow -----------------------------------------------------------------------------------
def simulate_bow(place_seq, n_words=2000, words_per_place=80, clutter=40, seed=0):
    """Each place owns a random set of visual words; neighbouring places share some of them.
    A frame at place p sees 70% of its pool plus `clutter` frequent words (Zipf-distributed)."""
    rng = np.random.default_rng(seed)
    n_places = max(place_seq) + 1
    own = [rng.choice(n_words, words_per_place, replace=False) for _ in range(n_places)]
    zipf = 1.0 / np.arange(1, n_words + 1); zipf /= zipf.sum()
    frames = []
    for p in place_seq:
        pool = np.r_[own[p], own[max(p - 1, 0)][:words_per_place // 4],
                     own[min(p + 1, n_places - 1)][:words_per_place // 4]]
        seen = pool[rng.random(len(pool)) < 0.7]
        frames.append(np.r_[seen, rng.choice(n_words, clutter, p=zipf)])
    return frames, n_words


def tfidf_vectors(frames, n_words):
    """Rows: L2-normalized tf-idf vectors, idf_w = log(N / n_w) over the N frames."""
    tf = np.array([np.bincount(f, minlength=n_words) for f in frames], float)
    tf /= tf.sum(1, keepdims=True)
    n_w = np.maximum((tf > 0).sum(0), 1)
    v = tf * np.log(len(frames) / n_w)
    return v / np.linalg.norm(v, axis=1, keepdims=True)


# the robot drives through places 0..69, explores 70..99, revisits 15..54, then explores 100..119
place_seq = list(range(70)) + list(range(70, 100)) + list(range(15, 55)) + list(range(100, 120))
frames, n_words = simulate_bow(place_seq)
V = tfidf_vectors(frames, n_words)
S = V @ V.T                                               # cosine similarity of all frame pairs
hits, false_hits, missed = 0, 0, 0
for t in range(31, len(frames)):
    older = np.arange(t - 30)                             # ignore the last 30 frames
    k = older[np.argmax(S[t, older])]
    score = S[t, k] / S[t, t - 1]                         # normalized by the previous frame (DBoW2)
    revisit = place_seq[t] in place_seq[:t - 30]
    if score > 1.0:
        if abs(place_seq[k] - place_seq[t]) <= 1: hits += 1
        else: false_hits += 1
    elif revisit:
        missed += 1
print(f"{len(frames)} frames: {hits} correct loop detections, {false_hits} false, {missed} missed")
print(f"mean similarity: same place {np.mean([S[t, place_seq.index(place_seq[t])] for t in range(100, 140)]):.3f},"
      f" neighbouring frame {np.mean([S[t, t - 1] for t in range(1, len(frames))]):.3f},"
      f" unrelated {np.mean(S[100:140, 70:100]):.3f}")


# ---- imu -----------------------------------------------------------------------------------
g = np.array([0.0, 0.0, -9.81])                           # gravity in the world frame (z up)


def right_jacobian_so3(w):
    return so3_left_jacobian(-w)


def imu_trajectory(t, spin=True):
    """A smooth hand-held motion: position p(t), velocity, acceleration and body rotation R(t).
    With spin=False the body keeps a constant, level orientation."""
    w0 = 0.8
    p = np.c_[np.cos(w0 * t), 0.6 * np.sin(w0 * t), 0.2 * np.sin(2 * w0 * t)]
    v = np.c_[-w0 * np.sin(w0 * t), 0.6 * w0 * np.cos(w0 * t), 0.4 * w0 * np.cos(2 * w0 * t)]
    a = np.c_[-w0**2 * np.cos(w0 * t), -0.6 * w0**2 * np.sin(w0 * t), -0.8 * w0**2 * np.sin(2 * w0 * t)]
    rv = np.c_[0.3 * np.sin(0.7 * t), 0.2 * np.sin(0.5 * t + 1), 0.5 * t] * spin   # rotation vector
    R = np.array([so3_exp(r) for r in rv])
    return p, v, a, R


def simulate_imu(dt=0.005, T_end=10.0, bg=np.zeros(3), ba=np.zeros(3), sg=0.0, sa=0.0, spin=True, seed=0):
    """Ideal IMU readings plus constant biases and white noise: gyro w_m = w + bg + n_g,
    accelerometer a_m = R^T (a - g) + ba + n_a (specific force, body frame)."""
    rng = np.random.default_rng(seed)
    t = np.arange(0, T_end + dt / 2, dt)
    p, v, a, R = imu_trajectory(t, spin)
    w_body = np.array([so3_log(R[k].T @ R[k + 1]) / dt for k in range(len(t) - 1)])
    f_body = np.einsum("kji,kj->ki", R[:-1], a[:-1] - g)
    w_m = w_body + bg + rng.normal(0, sg / np.sqrt(dt), w_body.shape)
    a_m = f_body + ba + rng.normal(0, sa / np.sqrt(dt), f_body.shape)
    return t, p, v, R, w_m, a_m


def integrate_imu(R0, v0, p0, w_m, a_m, dt):
    """Strapdown dead reckoning in the world frame (what you get with an IMU and nothing else)."""
    R, v, p = R0.copy(), v0.copy(), p0.copy()
    P = [p.copy()]
    for w, f in zip(w_m, a_m):
        acc = R @ f + g
        p = p + v * dt + 0.5 * acc * dt**2
        v = v + acc * dt
        R = R @ so3_exp(w * dt)
        P.append(p.copy())
    return np.array(P)


def preintegrate(w_m, a_m, dt, bg=np.zeros(3), ba=np.zeros(3)):
    """Delta R, Delta v, Delta p between two keyframes (body frame of the first one, gravity and
    initial velocity left out), and their Jacobians w.r.t. the biases (Forster et al. 2017)."""
    dR, dv, dp = np.eye(3), np.zeros(3), np.zeros(3)
    dR_bg, dv_bg, dv_ba, dp_bg, dp_ba = (np.zeros((3, 3)) for _ in range(5))
    for w, f in zip(w_m, a_m):
        wc, fc = w - bg, f - ba
        # Jacobians first: they use the values of dR, dv at step k
        dp_ba += dv_ba * dt - 0.5 * dR * dt**2
        dp_bg += dv_bg * dt - 0.5 * dR @ hat(fc) @ dR_bg * dt**2
        dv_ba += -dR * dt
        dv_bg += -dR @ hat(fc) @ dR_bg * dt
        dR_bg = so3_exp(wc * dt).T @ dR_bg - right_jacobian_so3(wc * dt) * dt
        # then the deltas
        dp = dp + dv * dt + 0.5 * dR @ fc * dt**2
        dv = dv + dR @ fc * dt
        dR = dR @ so3_exp(wc * dt)
    return dR, dv, dp, dict(dR_bg=dR_bg, dv_bg=dv_bg, dv_ba=dv_ba, dp_bg=dp_bg, dp_ba=dp_ba)


dt = 0.005
for name, kw, theory in [("noise only", dict(sg=1.7e-4, sa=2e-3), None),
                         ("accel bias 0.05 m/s^2", dict(ba=np.array([0.05, 0, 0])), 0.5 * 0.05 * 10**2),
                         ("gyro bias 0.5 deg/s", dict(bg=np.deg2rad([0.5, 0, 0])),
                          9.81 * np.deg2rad(0.5) * 10**3 / 6)]:
    t, p, v, R, w_m, a_m = simulate_imu(dt=dt, spin=False, **kw)      # level body, no rotation
    P = integrate_imu(R[0], v[0], p[0], w_m, a_m, dt)
    e = np.linalg.norm(P - p, axis=1)
    msg = f"  (theory {theory:.1f} m)" if theory else ""
    print(f"{name:22s}: position error after 1 s {e[200]:.3f} m, after 10 s {e[-1]:.2f} m{msg}")

# preintegration between two keyframes 0.5 s apart (samples 400..500), noise-free IMU
t, p, v, R, w_m, a_m = simulate_imu(dt=dt)
i, j = 400, 500
Dt = (j - i) * dt
dR, dv, dp, Jb = preintegrate(w_m[i:j], a_m[i:j], dt)
dR_true = R[i].T @ R[j]
dv_true = R[i].T @ (v[j] - v[i] - g * Dt)
dp_true = R[i].T @ (p[j] - p[i] - v[i] * Dt - 0.5 * g * Dt**2)
print(f"preintegration errors: rotation {np.rad2deg(np.linalg.norm(so3_log(dR.T @ dR_true))):.1e} deg,"
      f" velocity {np.linalg.norm(dv - dv_true):.1e} m/s, position {np.linalg.norm(dp - dp_true):.1e} m")

# bias update: first-order correction versus re-integrating from scratch
dbg, dba = np.deg2rad([0.3, -0.2, 0.4]), np.array([0.04, -0.03, 0.02])
dR2, dv2, dp2, _ = preintegrate(w_m[i:j], a_m[i:j], dt, bg=dbg, ba=dba)
dp_lin = dp + Jb["dp_bg"] @ dbg + Jb["dp_ba"] @ dba
dR_lin = dR @ so3_exp(Jb["dR_bg"] @ dbg)
print(f"bias change: Delta p moves {1000 * np.linalg.norm(dp2 - dp):.2f} mm; first-order update error"
      f" {1000 * np.linalg.norm(dp_lin - dp2):.4f} mm; rotation error"
      f" {np.rad2deg(np.linalg.norm(so3_log(dR_lin.T @ dR2))):.1e} deg")


# ============================================================================================
# Figures
# ============================================================================================
from matplotlib.patches import Rectangle, Circle  # noqa: E402

TXT = {
    "truth": dict(en="ground truth", zh="真值", ja="真値"),
    "dr": dict(en="dead reckoning", zh="航位推算", ja="デッドレコニング"),
    "opt": dict(en="optimized", zh="优化后", ja="最適化後"),
    "loop": dict(en="loop closure", zh="回环", ja="ループ閉じ込み"),
    "false": dict(en="false loop", zh="错误回环", ja="誤ったループ"),
    "iter": dict(en="Gauss-Newton iteration", zh="高斯-牛顿迭代", ja="ガウス・ニュートン反復"),
    "cost": dict(en="cost", zh="代价", ja="コスト"),
    "steps": dict(en="steps n", zh="步数 n", ja="ステップ数 n"),
    "rms": dict(en="RMS end-point error [m]", zh="终点误差 RMS [m]", ja="終点誤差 RMS [m]"),
    "dist_only": dict(en="distance noise only", zh="仅距离噪声", ja="距離ノイズのみ"),
    "head_only": dict(en="heading noise only", zh="仅航向噪声", ja="方位ノイズのみ"),
    "theory": dict(en="theory", zh="理论值", ja="理論値"),
    "pose_idx": dict(en="pose index", zh="位姿编号", ja="姿勢番号"),
    "pos_err": dict(en="position error [m]", zh="位置误差 [m]", ja="位置誤差 [m]"),
    "rot_err": dict(en="rotation error [deg]", zh="旋转误差 [deg]", ja="回転誤差 [deg]"),
    "before": dict(en="before", zh="优化前", ja="最適化前"),
    "after": dict(en="after", zh="优化后", ja="最適化後"),
    "weight": dict(en="Cauchy weight w", zh="Cauchy 权重 w", ja="Cauchy 重み w"),
    "loop_edges": dict(en="loop-closure edges", zh="回环边", ja="ループ閉じ込みエッジ"),
    "frame_t": dict(en="frame t", zh="帧 t", ja="フレーム t"),
    "frame": dict(en="frame", zh="帧", ja="フレーム"),
    "score": dict(en="normalized score", zh="归一化得分", ja="正規化スコア"),
    "revisit": dict(en="revisit", zh="重访", ja="再訪"),
    "time": dict(en="time t [s]", zh="时间 t [s]", ja="時間 t [s]"),
    "noise": dict(en="white noise only", zh="仅白噪声", ja="白色ノイズのみ"),
    "abias": dict(en="accel bias 0.05 m/s²", zh="加速度计零偏 0.05 m/s²", ja="加速度計バイアス 0.05 m/s²"),
    "gbias": dict(en="gyro bias 0.5°/s", zh="陀螺零偏 0.5°/s", ja="ジャイロバイアス 0.5°/s"),
    "bias_scale": dict(en="bias change scale k", zh="零偏变化倍数 k", ja="バイアス変化の倍率 k"),
    "dp_err": dict(en="error of Δp [m]", zh="Δp 的误差 [m]", ja="Δp の誤差 [m]"),
    "no_upd": dict(en="no update", zh="不更新", ja="更新なし"),
    "first": dict(en="first-order update", zh="一阶更新", ja="1 次の更新"),
    "single": dict(en="single level", zh="单层", ja="単一レベル"),
    "pyr": dict(en="pyramid", zh="金字塔", ja="ピラミッド"),
    "shift": dict(en="shift s [px]", zh="平移 s [px]", ja="シフト s [px]"),
    "pixel": dict(en="pixel x", zh="像素 x", ja="画素 x"),
    "intensity": dict(en="intensity", zh="亮度", ja="輝度"),
    "odo_only": dict(en="odometry only", zh="仅里程计", ja="オドメトリのみ"),
    "map": dict(en="MAP", zh="MAP", ja="MAP"),
}


def T_(key, lang):
    return TXT[key][lang]


def loc(fig_fn, name):
    for lang in LANGS:
        fig = fig_fn(lang)
        out(fig, name.replace(".svg", "_%s.svg" % lang))


# ---- 1. drift ------------------------------------------------------------------------------
def drift_paths(n, sigma_d, sigma_th, trials, rng):
    th = np.cumsum(rng.normal(0, sigma_th, (trials, n)), axis=1)
    d = 1.0 + rng.normal(0, sigma_d, (trials, n))
    x = np.c_[np.zeros(trials), np.cumsum(d * np.cos(th), 1)]
    y = np.c_[np.zeros(trials), np.cumsum(d * np.sin(th), 1)]
    return x, y


rng_f = np.random.default_rng(7)
DR_D = drift_paths(100, 0.02, 0.0, 12, rng_f)
DR_H = drift_paths(100, 0.0, np.deg2rad(0.5), 12, rng_f)
NS = np.unique(np.logspace(0, 3, 13).astype(int))
rng_f = np.random.default_rng(8)
RMS_D = [np.sqrt(np.mean(dead_reckon(n, 0.02, 0.0, 1500, rng_f) ** 2)) for n in NS]
RMS_H = [np.sqrt(np.mean(dead_reckon(n, 0.0, np.deg2rad(0.5), 1500, rng_f) ** 2)) for n in NS]


def fig_drift(lang):
    fig, ax = plt.subplots(1, 2, figsize=(13, 4.8), gridspec_kw=dict(width_ratios=[1.35, 1]))
    a = ax[0]
    for k in range(12):
        a.plot(DR_D[0][k], DR_D[1][k], color=C["z"], lw=1.4, alpha=0.8,
               label=T_("dist_only", lang) if k == 0 else None)
        a.plot(DR_H[0][k], DR_H[1][k], color=C["x"], lw=1.4, alpha=0.8,
               label=T_("head_only", lang) if k == 0 else None)
    a.plot([0, 100], [0, 0], color=C["dark"], lw=2.5, ls="--", label=T_("truth", lang))
    a.set_xlabel("x [m]"); a.set_ylabel("y [m]")
    a.set_ylim(-11, 11); a.legend(loc="upper left", fontsize=13)
    a.set_title("n = 100")
    b = ax[1]
    b.loglog(NS, RMS_D, "o", color=C["z"], label=T_("dist_only", lang))
    b.loglog(NS, RMS_H, "s", color=C["x"], label=T_("head_only", lang))
    nn = np.logspace(0, 3, 100)
    b.loglog(nn, 0.02 * np.sqrt(nn), color=C["z"], lw=1.5)
    b.loglog(nn, np.deg2rad(0.5) * np.sqrt(nn * (nn + 1) * (2 * nn + 1) / 6), color=C["x"], lw=1.5)
    b.text(300, 0.02 * np.sqrt(300) * 0.45, r"$\sigma_d\sqrt{n}$", color=C["z"], fontsize=16)
    b.text(40, np.deg2rad(0.5) * np.sqrt(40**3 / 3) * 2.2, r"$\approx\sigma_\theta\, n^{3/2}/\sqrt{3}$",
           color=C["x"], fontsize=16)
    b.set_xlabel(T_("steps", lang)); b.set_ylabel(T_("rms", lang))
    b.legend(loc="upper left", fontsize=13)
    fig.tight_layout()
    return fig


# ---- 2. the 1D factor graph ----------------------------------------------------------------
def fig_factor_graph():
    fig, ax = plt.subplots(1, 3, figsize=(15, 4.6), gridspec_kw=dict(width_ratios=[1.5, 1, 1.25]))
    a = ax[0]
    pos = {"x_0": (0, 0), "x_1": (2, 0), "x_2": (4, 0), "l": (2, 2.2)}
    for k, (x, y) in pos.items():
        a.add_patch(Circle((x, y), 0.42, fc="white", ec=C["a"] if k != "l" else C["b"], lw=2.5, zorder=3))
        a.text(x, y, "$%s$" % k, ha="center", va="center", fontsize=19, zorder=4)
    facs = [("prior", [(-1.3, 0)], (-1.3, 0)), ("u_1", [(0, 0), (2, 0)], (1, 0)),
            ("u_2", [(2, 0), (4, 0)], (3, 0)), ("z_0", [(0, 0), (2, 2.2)], (0.75, 1.3)),
            ("z_2", [(4, 0), (2, 2.2)], (3.25, 1.3))]
    for name, ends, (fx, fy) in facs:
        for ex, ey in ends:
            a.plot([fx, ex], [fy, ey], color=C["gray"], lw=2, zorder=1)
        if name == "prior":
            a.plot([fx, 0], [fy, 0], color=C["gray"], lw=2, zorder=1)
        a.add_patch(Rectangle((fx - 0.17, fy - 0.17), 0.34, 0.34, fc=C["dark"], zorder=3))
        a.text(fx, fy - 0.45 if fy < 1 else fy + 0.38, "$%s$" % name if name != "prior" else "$p_0$",
               ha="center", va="center", fontsize=16, color=C["dark"])
    a.set_xlim(-1.9, 4.7); a.set_ylim(-0.9, 2.9); a.set_aspect("equal"); a.axis("off")
    a.set_title("(a)")
    b = ax[1]
    Hn = H / np.abs(H).max()
    b.imshow(np.where(np.abs(H) > 1e-12, 0.25 + 0.75 * np.abs(Hn), 0), cmap="Purples", vmin=0, vmax=1)
    for r_ in range(4):
        for c_ in range(4):
            b.text(c_, r_, "%.0f" % H[r_, c_], ha="center", va="center", fontsize=12,
                   color="white" if abs(Hn[r_, c_]) > 0.5 else C["dark"])
    names = ["$x_0$", "$x_1$", "$x_2$", "$l$"]
    b.set_xticks(range(4)); b.set_xticklabels(names); b.set_yticks(range(4)); b.set_yticklabels(names)
    b.grid(False); b.set_title(r"(b)  $H = A^\top A$")
    c = ax[2]
    sd = np.sqrt(np.diag(cov))
    c.errorbar(x_map, np.arange(4) - 0.12, xerr=sd, fmt="o", color=C["a"], capsize=5, ms=8, label=r"MAP $\pm 1\sigma$")
    c.plot(x_odo, np.arange(4) + 0.12, "s", color=C["x"], ms=8, label=r"$p_0, u_1, u_2, z_0$")
    c.set_yticks(range(4)); c.set_yticklabels(names); c.invert_yaxis()
    c.set_xlabel("x [m]"); c.set_title("(c)")
    c.legend(loc="lower left", fontsize=12)
    fig.tight_layout()
    return fig


# ---- 3. marginalization fill-in ------------------------------------------------------------
def fig_marg():
    fig, ax = plt.subplots(1, 3, figsize=(15, 5.4), gridspec_kw=dict(width_ratios=[50, 20, 31]))
    mats = [(H_toy, r"(a)  $[\,x_{1..20}\ \vert\ l_{1..30}\,]$", 20),
            (H_rcs, r"(b)  $H_{xx} - H_{xl}H_{ll}^{-1}H_{lx}$", None),
            (H_filter, r"(c)  $[\,x_{20}\ \vert\ l_{1..30}\,]$", 1)]
    for a, (M, title, split) in zip(ax, mats):
        a.imshow(np.abs(M) > 1e-12 * np.abs(M).max(), cmap="Greys", interpolation="nearest", vmin=0, vmax=1.4)
        if split:
            a.axhline(split - 0.5, color=C["b"], lw=2); a.axvline(split - 0.5, color=C["b"], lw=2)
        a.set_title("%s\n%d×%d, nnz %d%%" % (title, M.shape[0], M.shape[1], round(100 * nnz(M) / M.size)),
                    fontsize=14)
        a.set_xticks([]); a.set_yticks([]); a.grid(False)
    fig.tight_layout()
    return fig


# ---- 4. direct alignment -------------------------------------------------------------------
def align_trace(I_ref, I_cur, s0, sigmas, iters=15, margin=40):
    s, xs, tr = s0, np.arange(margin, len(I_ref) - margin, dtype=float), [s0]
    for sg in sigmas:
        R = ndi.gaussian_filter1d(I_ref, sg) if sg > 0 else I_ref
        C_ = ndi.gaussian_filter1d(I_cur, sg) if sg > 0 else I_cur
        G = np.gradient(C_)
        for _ in range(iters):
            r = sample(C_, xs + s) - sample(R, xs)
            J = sample(G, xs + s)
            s -= (J @ r) / (J @ J)
            tr.append(s)
    return np.array(tr)


def cost_curve(sg, shifts, margin=40):
    R = ndi.gaussian_filter1d(I_ref, sg) if sg > 0 else I_ref
    C_ = ndi.gaussian_filter1d(I_cur, sg) if sg > 0 else I_cur
    xs = np.arange(margin, 400 - margin, dtype=float)
    return np.array([np.mean((sample(C_, xs + s) - sample(R, xs)) ** 2) for s in shifts])


SHIFTS = np.linspace(-10, 35, 451)
BASIN = {}
for sg in (0, 2, 8):
    ok = [abs(align_1d(I_ref, I_cur, s0=s0, sigmas=(sg, 0)) - s_true) < 0.1 for s0 in np.arange(-10, 36)]
    BASIN[sg] = np.arange(-10, 36)[np.array(ok)]
for sg in (0, 2, 8):
    b_ = BASIN[sg]
    print(f"blur sigma {sg}: GN converges to s_true from s0 in [{b_.min()}, {b_.max()}] ({len(b_)} of 46 integer starts)")
print(f"single level from s = 0 after 75 iterations: {align_1d(I_ref, I_cur, iters=75):.3f}")
_step = np.linalg.norm(np.diff(path_2d, axis=0), axis=1)
print(f"ground robot: pose spacing mean {_step.mean():.2f} m (min {_step.min():.2f}, max {_step.max():.2f});"
      f" drone path extent {np.ptp(path_3d, 0).round(1)} m")
_eb = np.linalg.norm(np.array([T[:3, 3] - G[:3, 3] for T, G in zip(est3, truth3)]), axis=1)
print(f"drone after optimization: largest position error {_eb.max():.2f} m")
print(f"BoW normalized score at frames 100 and 140: {S[100, :70].max() / S[100, 99]:.1f}, "
      f"{S[140, :110].max() / S[140, 139]:.1f}")


def fig_direct(lang):
    fig, ax = plt.subplots(1, 3, figsize=(16, 4.6))
    a = ax[0]
    xs = np.arange(400)
    a.plot(xs, I_ref, color=C["dark"], lw=1.8, label=r"$I_{\rm ref}(x)$")
    a.plot(xs, I_cur, color=C["b"], lw=1.6, label=r"$I_{\rm cur}(x)$")
    a.set_xlim(100, 220); a.set_xlabel(T_("pixel", lang)); a.set_ylabel(T_("intensity", lang))
    a.legend(loc="upper right", fontsize=12); a.set_title("(a)  $s^* = %g$" % s_true)
    b = ax[1]
    for sg, col in ((0, C["dark"]), (2, C["z"]), (8, C["a"])):
        cc = cost_curve(sg, SHIFTS)
        b.plot(SHIFTS, cc / cc.max(), color=col, label=r"$\sigma = %d$" % sg)
    b.axvline(s_true, color=C["x"], ls="--", lw=1.5)
    b.set_xlabel(T_("shift", lang)); b.set_ylabel(r"$E(s)\ /\ \max E$")
    b.legend(loc="lower left", fontsize=12); b.set_title("(b)")
    c = ax[2]
    t1 = align_trace(I_ref, I_cur, 0.0, (0,), iters=75)
    t2 = align_trace(I_ref, I_cur, 0.0, (8, 4, 2, 1, 0))
    c.plot(t1, "o-", color=C["dark"], ms=4, lw=1.4, label=T_("single", lang))
    c.plot(t2, "s-", color=C["a"], ms=4, lw=1.4, label=T_("pyr", lang) + " \u03c3 = 8,4,2,1,0")
    c.axhline(s_true, color=C["x"], ls="--", lw=1.5)
    c.set_xlabel(T_("iter", lang)); c.set_ylabel("s [px]"); c.legend(loc="center right", fontsize=12)
    c.set_title("(c)")
    fig.tight_layout()
    return fig


# ---- 5. pose graph (ground robot) ----------------------------------------------------------
def xy(Ts):
    return np.array([T[:3, 3] for T in Ts])[:, :2]


def fig_pgo(lang):
    fig, ax = plt.subplots(1, 3, figsize=(17, 5.0), gridspec_kw=dict(width_ratios=[1.25, 1.25, 0.9]))
    G, I0, E = xy(truth), xy(init), xy(est)
    for a, P_, col, lab, title in ((ax[0], I0, C["x"], T_("dr", lang), "(a)"),
                                   (ax[1], E, C["a"], T_("opt", lang), "(b)")):
        a.plot(G[:, 0], G[:, 1], color=C["gray"], lw=5, alpha=0.35, label=T_("truth", lang))
        a.plot(P_[:, 0], P_[:, 1], color=col, lw=1.8, label=lab)
        for k, (i, j, Z, Om) in enumerate(edges[len(truth) - 1:]):
            a.plot(P_[[i, j], 0], P_[[i, j], 1], color=C["y"], lw=2.2,
                   label=T_("loop", lang) if k == 0 else None)
        a.plot(*P_[0], "ko", ms=7)
        a.set_aspect("equal"); a.set_xlabel("x [m]"); a.set_ylabel("y [m]")
        a.set_title("%s  ATE %.2f m" % (title, ate_rmse(init if a is ax[0] else est, truth)))
    ax[0].legend(loc="center", fontsize=12)
    c = ax[2]
    c.semilogy(range(len(hist)), hist, "o-", color=C["a"])
    c.set_xlabel(T_("iter", lang)); c.set_ylabel(T_("cost", lang))
    c.set_title("(c)")
    fig.tight_layout()
    return fig


# ---- 6. robust kernel ----------------------------------------------------------------------
def fig_robust(lang):
    fig, ax = plt.subplots(1, 3, figsize=(17, 5.0), gridspec_kw=dict(width_ratios=[1.25, 1.25, 0.9]))
    G = xy(truth)
    for a, Ts, title in ((ax[0], est_l2, "(a)  L2"), (ax[1], est_ca, "(b)  Cauchy, c = 3")):
        P_ = xy(Ts)
        a.plot(G[:, 0], G[:, 1], color=C["gray"], lw=5, alpha=0.35, label=T_("truth", lang))
        a.plot(P_[:, 0], P_[:, 1], color=C["a"], lw=1.8, label=T_("opt", lang))
        a.plot(P_[[i_bad, j_bad], 0], P_[[i_bad, j_bad], 1], color=C["x"], lw=3, ls="--",
               label=T_("false", lang))
        a.plot(G[[i_bad, j_bad], 0], G[[i_bad, j_bad], 1], "x", color=C["x"], ms=12, mew=3)
        a.set_aspect("equal"); a.set_xlabel("x [m]"); a.set_ylabel("y [m]")
        a.set_title("%s   ATE %.2f m" % (title, ate_rmse(Ts, truth)))
    ax[0].legend(loc="upper left", fontsize=12)
    c = ax[2]
    loops = edges_bad[len(truth) - 1:]
    w = [1 / (1 + edge_err(est_ca, e) ** 2 / 9.0) for e in loops]
    c.bar(range(len(w)), w, color=[C["y"]] * (len(w) - 1) + [C["x"]])
    c.set_yscale("log"); c.set_ylim(1e-5, 2)
    c.set_xlabel(T_("loop_edges", lang)); c.set_ylabel(T_("weight", lang)); c.set_title("(c)")
    fig.tight_layout()
    return fig


# ---- 7. pose graph in 3D -------------------------------------------------------------------
def fig_pgo3d(lang):
    fig = plt.figure(figsize=(16, 5.6))
    G, I0, E = (np.array([T[:3, 3] for T in Ts]) for Ts in (truth3, init3, est3))
    for k, (P_, col, title) in enumerate(((I0, C["x"], "(a)  " + T_("before", lang)),
                                          (E, C["a"], "(b)  " + T_("after", lang)))):
        a = fig.add_subplot(1, 3, k + 1, projection="3d")
        a.plot(*G.T, color=C["gray"], lw=4, alpha=0.4)
        a.plot(*P_.T, color=col, lw=1.6)
        for i, j, Z, Om in edges3[len(truth3) - 1:]:
            a.plot(*P_[[i, j]].T, color=C["y"], lw=2.2)
        for idx in range(0, len(P_), 20):                     # camera axes every 20 poses
            Ts = (init3 if k == 0 else est3)[idx]
            for ax_i, cc in enumerate((C["x"], C["y"], C["z"])):
                a.plot(*np.c_[Ts[:3, 3], Ts[:3, 3] + 1.0 * Ts[:3, ax_i]], color=cc, lw=1.2)
        a.set_xlim(-9, 9); a.set_ylim(-9, 9); a.set_zlim(-1.5, 5.5)
        a.set_box_aspect((18, 18, 7), zoom=1.4); a.view_init(30, -60)
        a.set_xticklabels([]); a.set_yticklabels([]); a.set_zticklabels([])
        a.set_title(title)
    c = fig.add_subplot(1, 3, 3)
    eb = np.linalg.norm(I0 - G, axis=1); ea = np.linalg.norm(E - G, axis=1)
    c.plot(eb, color=C["x"], label=T_("before", lang)); c.plot(ea, color=C["a"], label=T_("after", lang))
    for i, j, Z, Om in edges3[len(truth3) - 1:]:
        c.axvline(j, color=C["y"], lw=1, alpha=0.6)
    c.set_xlabel(T_("pose_idx", lang)); c.set_ylabel(T_("pos_err", lang)); c.legend(fontsize=12)
    c.set_title("(c)")
    fig.tight_layout()
    return fig


# ---- 8. bag of words -----------------------------------------------------------------------
SCORES = np.full(len(frames), np.nan)
for t in range(31, len(frames)):
    older = np.arange(t - 30)
    SCORES[t] = S[t, older].max() / S[t, t - 1]


def fig_bow(lang):
    fig, ax = plt.subplots(1, 2, figsize=(14, 5.4), gridspec_kw=dict(width_ratios=[1, 1.35]))
    a = ax[0]
    im = a.imshow(S, cmap="magma_r", vmin=0, vmax=0.6, interpolation="nearest")
    a.set_xlabel(T_("frame", lang)); a.set_ylabel(T_("frame_t", lang)); a.grid(False)
    fig.colorbar(im, ax=a, fraction=0.046, pad=0.04, label=r"$\cos(\mathbf{v}_t, \mathbf{v}_k)$")
    a.set_title("(a)")
    b = ax[1]
    b.axvspan(100, 139.5, color=C["y"], alpha=0.15, label=T_("revisit", lang))
    b.plot(SCORES, color=C["a"], lw=1.8)
    b.axhline(1.0, color=C["x"], ls="--", lw=1.5)
    b.set_xlabel(T_("frame_t", lang)); b.set_ylabel(T_("score", lang)); b.legend(loc="upper left", fontsize=12)
    b.set_title(r"(b)  $\max_{k<t-30} s(t,k)\,/\,s(t,t-1)$", fontsize=15)
    fig.tight_layout()
    return fig


# ---- 9. IMU --------------------------------------------------------------------------------
IMU_CASES = []
for key, kw in (("noise", dict(sg=1.7e-4, sa=2e-3)), ("abias", dict(ba=np.array([0.05, 0, 0]))),
                ("gbias", dict(bg=np.deg2rad([0.5, 0, 0])))):
    t_, p_, v_, R_i, w_m_, a_m_ = simulate_imu(dt=dt, spin=False, **kw)
    IMU_CASES.append((key, t_, np.linalg.norm(integrate_imu(R_i[0], v_[0], p_[0], w_m_, a_m_, dt) - p_, axis=1)))
KS = np.logspace(-1, 1.3, 12)
ERR0, ERR1 = [], []
for k_ in KS:
    _, _, dp_k, _ = preintegrate(w_m[i:j], a_m[i:j], dt, bg=k_ * dbg, ba=k_ * dba)
    ERR0.append(np.linalg.norm(dp - dp_k))
    ERR1.append(np.linalg.norm(dp + Jb["dp_bg"] @ (k_ * dbg) + Jb["dp_ba"] @ (k_ * dba) - dp_k))


def fig_imu(lang):
    fig, ax = plt.subplots(1, 2, figsize=(14, 5.0))
    a = ax[0]
    cols = {"noise": C["gray"], "abias": C["z"], "gbias": C["x"]}
    tt = np.linspace(0.05, 10, 200)
    for key, t_, e_ in IMU_CASES:
        a.loglog(t_[10:], e_[10:], color=cols[key], label=T_(key, lang))
    a.loglog(tt, 0.5 * 0.05 * tt**2, color=C["z"], ls=":", lw=2)
    a.loglog(tt, 9.81 * np.deg2rad(0.5) * tt**3 / 6, color=C["x"], ls=":", lw=2)
    a.text(0.25, 0.5 * 0.05 * 0.25**2 * 3, r"$\frac{1}{2} b_a t^2$", color=C["z"], fontsize=17)
    a.text(1.2, 9.81 * np.deg2rad(0.5) * 1.2**3 / 6 * 4, r"$\frac{1}{6} g\, b_g t^3$", color=C["x"], fontsize=17)
    a.set_ylim(1e-6, 50)
    a.set_xlabel(T_("time", lang)); a.set_ylabel(T_("pos_err", lang)); a.legend(loc="lower right", fontsize=12)
    a.set_title("(a)")
    b = ax[1]
    b.loglog(KS, ERR0, "o-", color=C["x"], label=T_("no_upd", lang))
    b.loglog(KS, ERR1, "s-", color=C["a"], label=T_("first", lang))
    b.loglog(KS, ERR1[0] * (KS / KS[0]) ** 2, color=C["gray"], ls=":", lw=1.5)
    b.text(KS[6], ERR1[0] * (KS[6] / KS[0]) ** 2 * 0.15, r"$\propto k^2$", color=C["gray"], fontsize=16)
    b.axvline(1.0, color=C["dark"], lw=1, ls="--")
    b.set_xlabel(T_("bias_scale", lang)); b.set_ylabel(T_("dp_err", lang)); b.legend(fontsize=12)
    b.set_title(r"(b)  $\delta\mathbf{b} = k\,(\delta\mathbf{b}_g, \delta\mathbf{b}_a)$")
    fig.tight_layout()
    return fig


if __name__ == "__main__":
    loc(fig_drift, "06-drift.svg")
    out(fig_factor_graph(), "06-factor-graph.svg")
    out(fig_marg(), "06-marginalization.svg")
    loc(fig_direct, "06-direct-alignment.svg")
    loc(fig_pgo, "06-pose-graph.svg")
    loc(fig_robust, "06-robust-kernel.svg")
    loc(fig_pgo3d, "06-pose-graph-3d.svg")
    loc(fig_bow, "06-bag-of-words.svg")
    loc(fig_imu, "06-imu.svg")
