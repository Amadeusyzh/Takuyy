"""Figures for 3d-vision post 09: 3D reconstruction, from the classical pipeline to feed-forward models.

Run from anywhere:
    python3 bin/figures/3d-vision/vision3d_09.py            # writes the SVGs
    python3 bin/figures/3d-vision/vision3d_09.py /tmp/prev  # ... and PNG previews into /tmp/prev

Every number shown in a figure (and quoted in the post's captions) is computed here. The post's
code is copied verbatim below, in the order of the post (blocks marked "# == post block N"),
including the print statements whose output the post quotes. Only the COLMAP command lines of the
post are not repeated here.

Flatland: the world is the horizontal plane (x, z) of an OpenCV world frame (y down), seen from
above; a camera keeps the x (right) and z (forward) axes of its 3D frame and has a 1D image.
"""
import os
import sys
import pathlib

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

plt.rcParams["svg.hashsalt"] = "3d-vision-09"  # stable element ids

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
# == post block 1: flatland ==================================================================
import numpy as np

W, FOC = 160, 160.0                 # a 1D image: 160 pixels, focal length 160 px
CX = (W - 1) / 2                    # principal point at the image centre (pixel centres at 0..W-1)


def sd_box(p, c, half, ang):
    """Signed distance to a box with centre c, half sizes `half`, rotated by `ang`."""
    ca, sa = np.cos(ang), np.sin(ang)
    d = p - c
    q = np.stack([ca * d[..., 0] + sa * d[..., 1], -sa * d[..., 0] + ca * d[..., 1]], -1)
    a = np.abs(q) - half
    return np.linalg.norm(np.maximum(a, 0), axis=-1) + np.minimum(a.max(-1), 0)


def scene_sdf(p):
    """Signed distance (m) to the flatland scene; p[..., :] = (x, z) world coordinates."""
    disk = np.linalg.norm(p - np.array([-0.55, 0.25]), axis=-1) - 0.45
    box = sd_box(p, np.array([0.5, -0.4]), np.array([0.45, 0.28]), np.deg2rad(20))
    bar = sd_box(p, np.array([0.45, 0.65]), np.array([0.38, 0.04]), np.deg2rad(-10))
    return np.minimum(np.minimum(disk, box), bar)


def look_at(C, target=(0.0, 0.0)):
    """World-to-camera (R, t) of a 2D camera at C looking at target (OpenCV: x right, z forward)."""
    fwd = np.asarray(target, float) - C
    fwd /= np.linalg.norm(fwd)
    R = np.array([[fwd[1], -fwd[0]],     # row 1: the camera x axis (right) in world coordinates
                  [fwd[0], fwd[1]]])     # row 2: the camera z axis (forward)
    return R, -R @ C


def render_depth(R, t, sigma=0.0, rng=None, max_range=8.0):
    """z-depth of every pixel by sphere tracing scene_sdf; NaN where the ray escapes."""
    C = -R.T @ t
    rays_c = np.stack([(np.arange(W) - CX) / FOC, np.ones(W)], 1)   # K^-1 (u, 1): z = 1
    norm = np.linalg.norm(rays_c, axis=1)
    dirs = (rays_c / norm[:, None]) @ R                              # R^T d for each ray
    s = np.zeros(W)
    for _ in range(200):
        dist = scene_sdf(C + s[:, None] * dirs)
        s = np.where(dist > 1e-6, s + dist, s)
    depth = np.where(s < max_range, s / norm, np.nan)                 # range -> z-depth
    if sigma > 0:
        depth = depth + sigma * rng.standard_normal(W)
    return depth


def orbit(n, radius=2.6, start=0.0, span=360.0, rng=None, jitter=0.0):
    """n cameras on a circle around the origin, looking at (a jittered point near) the origin."""
    step = span / n if span == 360 else span / max(n - 1, 1)
    cams = []
    for a in np.deg2rad(start + step * np.arange(n)):
        C = radius * np.array([np.cos(a), np.sin(a)])
        target = (0.0, 0.0) if rng is None else jitter * rng.standard_normal(2)
        cams.append(look_at(C, target))
    return cams


def backproject(R, t, depth):
    """World points of the valid pixels: X_w = R^T (d K^-1 (u, 1) - t)."""
    u = np.arange(W)
    pc = np.stack([(u - CX) / FOC * depth, depth], 1)
    ok = np.isfinite(depth)
    return (pc[ok] - t) @ R, ok


rng = np.random.default_rng(0)
cams = orbit(64, rng=rng, jitter=0.15)            # 64 cameras on a circle of radius 2.6 m
scans = [(R, t, render_depth(R, t, sigma=0.02, rng=rng)) for R, t in cams]
d0 = scans[0][2]
print("scan 0: %d of %d pixels hit, depth %.2f to %.2f m"
      % (np.isfinite(d0).sum(), W, np.nanmin(d0), np.nanmax(d0)))
X0, _ = backproject(*cams[0], render_depth(*cams[0]))
print("noise-free back-projection: max |sdf| = %.1e m" % np.abs(scene_sdf(X0)).max())
# == end ======================================================================================


# == post block 2: TSDF fusion ================================================================
def make_grid(n=128, extent=1.6):
    """Voxel centres of an n x n grid over [-extent, extent]^2; grid[i, j] is (xs[j], xs[i])."""
    h = 2 * extent / n
    xs = -extent + h * (np.arange(n) + 0.5)
    X, Z = np.meshgrid(xs, xs)
    return xs, np.stack([X, Z], -1).reshape(-1, 2)


def tsdf_integrate(F, Wt, P, R, t, depth, mu, w_max=np.inf):
    """Fuse one depth scan into the TSDF values F and weights Wt of the voxel centres P."""
    pc = P @ R.T + t                                 # voxel centres in camera coordinates
    z = pc[:, 1]
    u = np.full(len(P), -1)
    front = z > 1e-6
    u[front] = np.round(FOC * pc[front, 0] / z[front] + CX).astype(int)   # nearest pixel
    ok = front & (u >= 0) & (u < W)
    sdf = np.full(len(P), np.nan)
    sdf[ok] = depth[u[ok]] - z[ok]                   # projective signed distance along the ray
    ok &= np.isfinite(sdf) & (sdf > -mu)             # skip voxels far behind the surface
    f = np.minimum(1.0, sdf[ok] / mu)                # truncate in front, normalize to [-1, 1]
    F[ok] = (Wt[ok] * F[ok] + f) / (Wt[ok] + 1.0)    # running weighted average
    Wt[ok] = np.minimum(Wt[ok] + 1.0, w_max)


def tsdf_fuse(scans, n=128, extent=1.6, mu=0.06):
    xs, P = make_grid(n, extent)
    F, Wt = np.ones(len(P)), np.zeros(len(P))
    for R, t, depth in scans:
        tsdf_integrate(F, Wt, P, R, t, depth, mu)
    return xs, F.reshape(n, n), Wt.reshape(n, n)


# one voxel 2.00 m in front of the camera, three depth readings of the surface behind it
F1, W1, mu = 1.0, 0.0, 0.06
for d in (2.03, 1.98, 2.05):
    f = min(1.0, (d - 2.00) / mu)
    F1, W1 = (W1 * F1 + f) / (W1 + 1), W1 + 1
    print("reading %.2f: f = %+.3f  ->  F = %+.3f, W = %d, mu F = %+.1f mm" % (d, f, F1, W1, 1000 * mu * F1))

for n_scans in (1, 4, 16, 64):
    xs, F, Wt = tsdf_fuse(scans[::64 // n_scans])
    print("%2d scans: %4.1f%% of the voxels observed" % (n_scans, 100 * np.mean(Wt > 0)))
# == end ======================================================================================


# == post block 3: marching squares ===========================================================
def marching_squares(F, xs, valid=None, interp=True):
    """Zero crossings of F[i, j] (sampled at (xs[j], xs[i])) as an array of segments (m, 2, 2)."""
    v = [F[:-1, :-1], F[:-1, 1:], F[1:, 1:], F[1:, :-1]]          # corners c0..c3 of every cell
    lo = np.minimum(np.minimum(v[0], v[1]), np.minimum(v[2], v[3]))
    hi = np.maximum(np.maximum(v[0], v[1]), np.maximum(v[2], v[3]))
    cell = (lo < 0) & (hi >= 0)
    if valid is not None:                                           # all four corners observed
        cell &= valid[:-1, :-1] & valid[:-1, 1:] & valid[1:, 1:] & valid[1:, :-1]
    off = [(0, 0), (0, 1), (1, 1), (1, 0)]                          # (di, dj) of c0..c3
    segs = []
    for i, j in zip(*np.nonzero(cell)):
        val = [F[i + di, j + dj] for di, dj in off]
        pos = [np.array([xs[j + dj], xs[i + di]]) for di, dj in off]
        pts = {}
        for e in range(4):                                          # edge e joins corners e, e+1
            a, b = e, (e + 1) % 4
            if (val[a] < 0) != (val[b] < 0):
                s = val[a] / (val[a] - val[b]) if interp else 0.5
                pts[e] = pos[a] + s * (pos[b] - pos[a])
        if len(pts) == 2:
            segs.append(list(pts.values()))
        elif len(pts) == 4:                                         # saddle: decide by the centre
            if (np.mean(val) < 0) == (val[0] < 0):
                segs += [[pts[0], pts[1]], [pts[2], pts[3]]]
            else:
                segs += [[pts[3], pts[0]], [pts[1], pts[2]]]
    return np.array(segs).reshape(-1, 2, 2)


def sample_segments(segs, step=0.004):
    """Points along the segments, about `step` apart."""
    out = []
    for p, q in segs:
        k = max(1, int(np.ceil(np.linalg.norm(q - p) / step)))
        out.append(p + ((np.arange(k) + 0.5) / k)[:, None] * (q - p))
    return np.concatenate(out) if out else np.zeros((0, 2))


for n_scans in (1, 4, 16, 64):
    xs, F, Wt = tsdf_fuse(scans[::64 // n_scans])
    pts = sample_segments(marching_squares(F, xs, Wt > 0))
    print("%2d scans: mean distance of the extracted curve to the true surface %.1f mm"
          % (n_scans, 1000 * np.abs(scene_sdf(pts)).mean()))

for n in (16, 32, 64, 128, 256):
    xs, P = make_grid(n)
    G = scene_sdf(P).reshape(n, n)                    # exact SDF samples, no noise
    e = [1000 * np.abs(scene_sdf(sample_segments(marching_squares(G, xs, interp=i)))).mean()
         for i in (True, False)]
    print("h = %5.1f mm: interpolated %.3f mm, midpoint %.2f mm" % (3200 / n, e[0], e[1]))
# == end ======================================================================================


# == post block 4: screened Poisson ===========================================================
import scipy.sparse as sp
from scipy.sparse.linalg import spsolve
from scipy.spatial import cKDTree


def oriented_points(scans, k=60):
    """Merge the back-projected scans; PCA normals from k neighbours, flipped toward the camera
    that saw each point."""
    P, C = [], []
    for R, t, depth in scans:
        X, _ = backproject(R, t, depth)
        P.append(X)
        C.append(np.repeat((-R.T @ t)[None], len(X), 0))
    P, C = np.concatenate(P), np.concatenate(C)
    nb = cKDTree(P).query(P, k)[1]
    Q = P[nb] - P[nb].mean(1, keepdims=True)
    N = np.linalg.eigh(np.einsum("nki,nkj->nij", Q, Q))[1][:, :, 0]   # smallest eigenvector
    N *= np.sign(((C - P) * N).sum(1))[:, None]
    return P, N


def bilinear_matrix(P, xs):
    """Sparse B with B @ g.ravel() = bilinear interpolation of the node values g[i, j] at P."""
    n, h = len(xs), xs[1] - xs[0]
    fx = np.clip((P[:, 0] - xs[0]) / h, 0, n - 1 - 1e-9)
    fz = np.clip((P[:, 1] - xs[0]) / h, 0, n - 1 - 1e-9)
    j, i = np.floor(fx).astype(int), np.floor(fz).astype(int)
    a, b = fx - j, fz - i
    rows = np.repeat(np.arange(len(P)), 4)
    cols = np.stack([i * n + j, i * n + j + 1, (i + 1) * n + j, (i + 1) * n + j + 1], 1).ravel()
    vals = np.stack([(1 - a) * (1 - b), a * (1 - b), (1 - a) * b, a * b], 1).ravel()
    return sp.csr_matrix((vals, (rows, cols)), shape=(len(P), n * n))


def screened_poisson(P, N, xs, alpha=0.0, k=60):
    """Indicator chi (about +1/2 inside, -1/2 outside) whose gradient fits the splatted inward
    normals, screened toward chi = 0 at the points with weight alpha. Returns chi and the iso-value."""
    n, h = len(xs), xs[1] - xs[0]
    ell = 2 * cKDTree(P).query(P, k + 1)[0][:, -1] / k        # curve length each point stands for
    D = sp.diags([-np.ones(n - 1), np.ones(n - 1)], [0, 1], shape=(n - 1, n)) / h
    Gx, Gz = sp.kron(sp.identity(n), D).tocsr(), sp.kron(D, sp.identity(n)).tocsr()
    sig, tree = 1.5 * h, cKDTree(P)

    def splat(Q, comp):                                        # V = -sum ell_i N_i G_sig(x - p_i)
        V = np.zeros(len(Q))
        for q, nb in enumerate(tree.query_ball_point(Q, 4 * sig)):
            if nb:
                d2 = ((P[nb] - Q[q]) ** 2).sum(1)
                V[q] = -(ell[nb] * N[nb, comp] * np.exp(-d2 / (2 * sig ** 2))).sum() / (2 * np.pi * sig ** 2)
        return V
    vx = splat(np.stack(np.meshgrid(xs[:-1] + h / 2, xs), -1).reshape(-1, 2), 0)   # x-edge midpoints
    vz = splat(np.stack(np.meshgrid(xs, xs[:-1] + h / 2), -1).reshape(-1, 2), 1)   # z-edge midpoints
    B = bilinear_matrix(P, xs)
    A = (Gx.T @ Gx + Gz.T @ Gz) * h * h + alpha * (B.T @ sp.diags(ell) @ B) + 1e-9 * sp.identity(n * n)
    chi = spsolve(A.tocsc(), (Gx.T @ vx + Gz.T @ vz) * h * h).reshape(n, n)
    iso = 0.0 if alpha > 0 else np.average(B @ chi.ravel(), weights=ell)
    return chi, iso


arc = orbit(24, start=-60, span=210, rng=rng, jitter=0.15)      # cameras on 210 degrees only
arc_scans = [(R, t, render_depth(R, t, sigma=0.02, rng=rng)) for R, t in arc]
P_arc, N_arc = oriented_points(arc_scans)
xs, _ = make_grid(128)
for alpha in (0.0, 32.0):
    chi, iso = screened_poisson(P_arc, N_arc, xs, alpha)
    pts = sample_segments(marching_squares(chi - iso, xs))
    print("alpha = %4.1f: chi in [%+.2f, %+.2f], iso %.3f, mean |sdf| of the curve %.1f mm"
          % (alpha, chi.min(), chi.max(), iso, 1000 * np.abs(scene_sdf(pts)).mean()))
# == end ======================================================================================


# == post block 5: NeuS weights ===============================================================
def sigmoid(x):
    return 0.5 * (1 + np.tanh(0.5 * x))          # = 1 / (1 + exp(-x)), without overflow


def weights_from_alpha(alpha):
    """w_i = T_i alpha_i with T_i = prod_{j<i} (1 - alpha_j), the volume rendering weights."""
    T = np.concatenate([np.ones(alpha.shape[:-1] + (1,)), np.cumprod(1 - alpha, -1)[..., :-1]], -1)
    return T * alpha


def alpha_naive(f, s, dt):
    """Density sigma = phi_s(f), the logistic density of the SDF: alpha = 1 - exp(-sigma dt)."""
    phi = s * sigmoid(s * f) * (1 - sigmoid(s * f))
    return 1 - np.exp(-phi[..., :-1] * dt)


def alpha_neus(f, s):
    """NeuS: alpha_i = max((Phi_s(f_i) - Phi_s(f_{i+1})) / Phi_s(f_i), 0)."""
    Phi = sigmoid(s * f)
    return np.clip((Phi[..., :-1] - Phi[..., 1:]) / np.maximum(Phi[..., :-1], 1e-12), 0, 1)


t = np.linspace(0.0, 4.0, 8001)
dt, t_star, s = t[1] - t[0], 2.0, 20.0
for theta in (0, 60, 80):
    c = np.cos(np.deg2rad(theta))
    f = -c * (t - t_star)                        # SDF along a ray that meets a plane at t* = 2
    peak = {}
    for name, a in (("naive", alpha_naive(f, s, dt)), ("NeuS", alpha_neus(f, s))):
        peak[name] = t[np.argmax(weights_from_alpha(a))] + dt / 2 - t_star
    Phi = (1 - 2 * c + np.sqrt(4 * c * c + 1)) / 2           # the peak condition derived in 6.2
    print("theta = %2d deg: peak - t* = %+.4f (naive), %+.4f (NeuS); theory for naive %+.4f"
          % (theta, peak["naive"], peak["NeuS"], -np.log(Phi / (1 - Phi)) / (s * c)))
# == end ======================================================================================


# == post block 6: a tiny NeuS ================================================================
def neus_render(g, log_s, B, t_mid, n_samp, dO=None, dD=None):
    """Opacity O and depth D of every ray for the grid SDF g. With dO = dL/dO and dD = dL/dD,
    also return dL/dg and dL/dlog_s (backpropagation written out by hand)."""
    s = np.exp(log_s)
    f = (B @ g).reshape(-1, n_samp)                 # SDF at the samples of every ray
    Phi = sigmoid(s * f)
    ratio = Phi[:, 1:] / np.maximum(Phi[:, :-1], 1e-12)
    alpha = np.clip(1 - ratio, 0, 1)
    w = weights_from_alpha(alpha)
    O, D = w.sum(1), (w * t_mid).sum(1)
    if dO is None:
        return O, D, w
    # for C = sum_k w_k c_k:  dC/dalpha_k = T_k (c_k - A_{k+1}),  A_k = alpha_k c_k + (1 - alpha_k) A_{k+1}
    T = np.concatenate([np.ones((len(f), 1)), np.cumprod(1 - alpha, 1)[:, :-1]], 1)
    c = dO[:, None] + dD[:, None] * t_mid           # both outputs at once
    A, acc = np.zeros_like(alpha), np.zeros(len(f))
    for k in range(alpha.shape[1] - 1, -1, -1):
        A[:, k] = acc
        acc = alpha[:, k] * c[:, k] + (1 - alpha[:, k]) * acc
    g_alpha = T * (c - A) * (ratio < 1)             # no gradient where alpha was clipped to 0
    pk = np.maximum(Phi[:, :-1], 1e-12)
    dPhi = np.zeros_like(Phi)
    dPhi[:, :-1] += g_alpha * Phi[:, 1:] / pk ** 2  # alpha_k = 1 - Phi_{k+1} / Phi_k
    dPhi[:, 1:] -= g_alpha / pk
    dx = dPhi * Phi * (1 - Phi)                     # dL/d(s f)
    return O, D, w, B.T @ (dx * s).ravel(), (dx * f).sum() * s


def cell_gradient(n, h):
    """Sparse Cx, Cz: the gradient of a node grid at the (n-1)^2 cell centres."""
    D = sp.diags([-np.ones(n - 1), np.ones(n - 1)], [0, 1], shape=(n - 1, n)) / h
    M = sp.diags([0.5 * np.ones(n - 1), 0.5 * np.ones(n - 1)], [0, 1], shape=(n - 1, n))
    return sp.kron(M, D).tocsr(), sp.kron(D, M).tocsr()


def eikonal(g, Cx, Cz):
    """Mean of (|grad g| - 1)^2 over the cells, and its gradient with respect to g."""
    gx, gz = Cx @ g, Cz @ g
    nrm = np.sqrt(gx ** 2 + gz ** 2) + 1e-12
    r = nrm - 1
    return np.mean(r ** 2), Cx.T @ (2 * r / nrm / len(r) * gx) + Cz.T @ (2 * r / nrm / len(r) * gz)


def fit_neus(cams, n=96, n_samp=128, t_near=1.0, t_far=4.2, iters=800, lam_d=1.0, lam_e=0.3,
             lr=0.01, log_every=(0, 50, 200, 800)):
    # rays through every second pixel, with their true silhouette (hit or not) and range
    pts, m_gt, r_gt = [], [], []
    ts = np.linspace(t_near, t_far, n_samp)
    for R, t in cams:
        u = np.arange(0, W, 2)
        ray = np.stack([(u - CX) / FOC, np.ones(len(u))], 1)
        nrm = np.linalg.norm(ray, axis=1)
        d = render_depth(R, t)[u]
        dirs = (ray / nrm[:, None]) @ R
        pts.append(-R.T @ t + ts[None, :, None] * dirs[:, None, :])
        m_gt.append(np.isfinite(d)); r_gt.append(np.nan_to_num(d * nrm))
    pts = np.concatenate(pts).reshape(-1, 2)
    m_gt, r_gt = np.concatenate(m_gt), np.concatenate(r_gt)
    t_mid = 0.5 * (ts[1:] + ts[:-1])
    xs = np.linspace(-1.6, 1.6, n)                  # SDF values on the nodes of an n x n grid
    B = bilinear_matrix(pts, xs)
    Cx, Cz = cell_gradient(n, xs[1] - xs[0])
    GX, GZ = np.meshgrid(xs, xs)
    theta = [np.sqrt(GX ** 2 + GZ ** 2).ravel() - 1.0, np.array(np.log(10.0))]   # a circle, s = 10
    m1, m2 = [np.zeros_like(p) for p in theta], [np.zeros_like(p) for p in theta]
    log = {}
    for it in range(iters + 1):
        O, D, w = neus_render(theta[0], theta[1], B, t_mid, n_samp)
        loss_e, grad_e = eikonal(theta[0], Cx, Cz)
        loss = np.mean((O - m_gt) ** 2) + lam_d * np.mean((D - r_gt)[m_gt] ** 2) + lam_e * loss_e
        if it in log_every:
            log[it] = (theta[0].reshape(n, n).copy(), float(np.exp(theta[1])), loss)
            print("iter %4d: loss %.5f, s = %6.1f" % (it, loss, np.exp(theta[1])))
        if it == iters:
            break
        dO = 2 * (O - m_gt) / len(O)
        dD = lam_d * 2 * (D - r_gt) * m_gt / m_gt.sum()
        _, _, _, grad_g, grad_s = neus_render(theta[0], theta[1], B, t_mid, n_samp, dO, dD)
        for k, gr in enumerate((grad_g + lam_e * grad_e, np.array(grad_s))):   # Adam
            m1[k] = 0.9 * m1[k] + 0.1 * gr
            m2[k] = 0.999 * m2[k] + 0.001 * gr ** 2
            theta[k] = theta[k] - lr * m1[k] / (1 - 0.9 ** (it + 1)) / (np.sqrt(m2[k] / (1 - 0.999 ** (it + 1))) + 1e-8)
    return xs, theta[0].reshape(n, n), log


xs_n, g_fit, neus_log = fit_neus(orbit(24))
pts = sample_segments(marching_squares(g_fit, xs_n))
err = 1000 * np.abs(scene_sdf(pts))
print("NeuS zero level set: mean |sdf| %.1f mm, median %.1f mm" % (err.mean(), np.median(err)))
# == end ======================================================================================


# == post block 7: pointmaps ==================================================================
H3, W3, F3 = 48, 64, 56.0                            # a small 64 x 48 pinhole camera
K3 = np.array([[F3, 0, (W3 - 1) / 2], [0, F3, (H3 - 1) / 2], [0, 0, 1]])


def sdf3(p):
    """A ground plane (y = 0.6; the OpenCV world has y down), two boxes and a ball."""
    def box(p, c, b):
        q = np.abs(p - c) - b
        return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(-1), 0)
    ground = 0.6 - p[..., 1]
    b1 = box(p, np.array([-0.5, 0.25, 0.2]), np.array([0.35, 0.35, 0.35]))
    b2 = box(p, np.array([0.55, 0.35, -0.3]), np.array([0.25, 0.25, 0.4]))
    ball = np.linalg.norm(p - np.array([0.2, 0.2, 0.7]), axis=-1) - 0.4
    return np.minimum(np.minimum(ground, ball), np.minimum(b1, b2))


def look_at3(C, target=(0.0, 0.2, 0.0), down=(0.0, 1.0, 0.0)):
    """World-to-camera (R, t) with OpenCV axes: x right, y down, z forward."""
    z = np.asarray(target, float) - C
    z /= np.linalg.norm(z)
    x = np.cross(down, z)
    x /= np.linalg.norm(x)
    R = np.stack([x, np.cross(z, x), z])
    return R, -R @ C


def render_pointmap(R, t):
    """The pointmap X^{v,v}: per pixel, the 3D point in the camera's own frame (NaN for sky)."""
    v, u = np.mgrid[0:H3, 0:W3].astype(float)
    rays = np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(K3).T    # K^-1 (u, v, 1)
    dirs = rays / np.linalg.norm(rays, axis=-1, keepdims=True)
    C, dw = -R.T @ t, dirs @ R
    s = np.zeros((H3, W3))
    for _ in range(160):
        s += np.where(s < 12, sdf3(C + s[..., None] * dw), 0)
    X = s[..., None] * dirs
    X[s >= 12] = np.nan
    return X


def focal_from_pointmap(X, conf, iters=10):
    """argmin_f sum_i C_i || (u_i - c) - f (X_i, Y_i) / Z_i ||, by Weiszfeld (iteratively reweighted LS)."""
    v, u = np.mgrid[0:H3, 0:W3].astype(float)
    a = np.stack([u - (W3 - 1) / 2, v - (H3 - 1) / 2], -1).reshape(-1, 2)   # pixel minus centre
    b = (X[..., :2] / X[..., 2:]).reshape(-1, 2)
    ok = np.isfinite(b).all(1)
    a, b, c = a[ok], b[ok], conf.reshape(-1)[ok]
    f = (c * (a * b).sum(1)).sum() / (c * (b * b).sum(1)).sum()             # least squares
    for _ in range(iters):
        w = c / np.maximum(np.linalg.norm(a - f * b, axis=1), 1e-9)
        f = (w * (a * b).sum(1)).sum() / (w * (b * b).sum(1)).sum()
    return f


def umeyama(A, B, w=None):
    """Similarity (s, R, t) minimizing sum_i w_i || s R A_i + t - B_i ||^2."""
    w = np.ones(len(A)) if w is None else w
    w = w / w.sum()
    ma, mb = w @ A, w @ B
    A0, B0 = A - ma, B - mb
    U, S, Vt = np.linalg.svd((B0 * w[:, None]).T @ A0)
    E = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])
    R = U @ E @ Vt
    s = np.trace(np.diag(S) @ E) / (w @ (A0 ** 2).sum(1))
    return s, R, mb - s * R @ ma


def fake_network(X, scale, rng):
    """Stand-in for DUSt3R's output: unknown scale, 2% 3D noise, 5% wild points with low confidence."""
    r = np.linalg.norm(X, axis=-1, keepdims=True)
    Y = X + 0.02 * r * rng.standard_normal(X.shape)
    wild = rng.random(X.shape[:2]) < 0.05
    Y[wild] += 0.5 * r[wild] * rng.standard_normal((wild.sum(), 3))
    return scale * Y, np.where(wild, 1.1, 3.0)


rng = np.random.default_rng(1)
R1, t1 = look_at3(np.array([0.3, -1.4, -3.0]))
R2, t2 = look_at3(np.array([2.2, -1.2, -2.2]))
R21, t21 = R2 @ R1.T, t2 - R2 @ R1.T @ t1          # camera 1 -> camera 2
X11, X22 = render_pointmap(R1, t1), render_pointmap(R2, t2)
X21 = (X22 - t21) @ R21                             # image 2's points in camera 1's frame
X12 = X11 @ R21.T + t21                             # image 1's points in camera 2's frame
P11, C11 = fake_network(X11, 0.4, rng)
P12, C12 = fake_network(X12, 0.4, rng)
print("focal: true %.1f, least squares %.2f, Weiszfeld %.2f"
      % (F3, focal_from_pointmap(P11, C11, iters=0), focal_from_pointmap(P11, C11)))
ok = np.isfinite(P11).all(-1)
s_, R_, t_ = umeyama(P11[ok], P12[ok], (C11 * C12)[ok])
ang = np.degrees(np.arccos(np.clip((np.trace(R_ @ R21.T) - 1) / 2, -1, 1)))
cosd = t_ @ t21 / np.linalg.norm(t_) / np.linalg.norm(t21)
print("relative pose: rotation error %.2f deg, translation direction error %.1f deg"
      % (ang, np.degrees(np.arccos(cosd))))
# == end ======================================================================================


# == post block 8: global alignment ===========================================================
def global_align(edges, pm, conf, n_views, iters=30):
    """edges[e] = (a, b); pm[e] = (X^{a,e}, X^{b,e}), both in camera a's frame at an unknown scale;
    conf[e] = their confidences. Finds world pointmaps chi[v] and similarities (s_e, R_e, t_e) with
    chi[v] ~ s_e R_e X^{v,e} + t_e, under the gauge prod_e s_e = 1."""
    chi = [None] * n_views
    a, b = edges[0]
    chi[a], chi[b] = pm[0][0].copy(), pm[0][1].copy()    # pair 0 defines the initial world frame
    placed = {a, b}
    while len(placed) < n_views:                         # chain the other pairs onto it
        for e, (a, b) in enumerate(edges):
            if (a in placed) != (b in placed):
                k = 0 if a in placed else 1
                s, R, t = umeyama(pm[e][k], chi[edges[e][k]], conf[e][k])
                chi[edges[e][1 - k]] = s * pm[e][1 - k] @ R.T + t
                placed.add(edges[e][1 - k])
    chi_init, history = [c.copy() for c in chi], []
    for it in range(iters):
        sim = [umeyama(np.concatenate(pm[e]), np.concatenate([chi[a], chi[b]]), np.concatenate(conf[e]))
               for e, (a, b) in enumerate(edges)]       # step 1: every pair's similarity
        g = np.exp(np.mean([np.log(s) for s, _, _ in sim]))
        sim = [(s / g, R, t / g) for s, R, t in sim]     # gauge: geometric mean of the scales = 1
        num = [np.zeros_like(c) for c in chi]
        den = [np.zeros(len(c)) for c in chi]
        res = wsum = 0.0
        for e, (a, b) in enumerate(edges):               # step 2: average the aligned pointmaps
            s, R, t = sim[e]
            for k, v in enumerate((a, b)):
                Y = s * pm[e][k] @ R.T + t
                num[v] += conf[e][k][:, None] * Y
                den[v] += conf[e][k]
                res += (conf[e][k] * ((Y - chi[v] / g) ** 2).sum(1)).sum()
                wsum += conf[e][k].sum()
        chi = [num[v] / den[v][:, None] for v in range(n_views)]
        history.append(np.sqrt(res / wsum))
    return chi_init, chi, sim, history


def small_rotation(deg, rng):
    ax = rng.standard_normal(3)
    ax /= np.linalg.norm(ax)
    Kx = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    th = np.deg2rad(deg)
    return np.eye(3) + np.sin(th) * Kx + (1 - np.cos(th)) * Kx @ Kx


rng = np.random.default_rng(2)
n_views = 8
cams3 = [look_at3(3.2 * np.array([np.cos(a), -0.4, np.sin(a)])) for a in np.deg2rad(-90 + 45 * np.arange(n_views))]
Xw = []                                              # world points of the valid pixels of each view
for R, t in cams3:
    X = render_pointmap(R, t)[::2, ::2].reshape(-1, 3)
    Xw.append((X[np.isfinite(X).all(1)] - t) @ R)
edges = [(k, (k + 1) % n_views) for k in range(n_views)] + [(k, (k + 2) % n_views) for k in range(n_views)]
pm, conf = [], []
for a, b in edges:                                   # simulated pairwise predictions
    Ra, ta = cams3[a]
    E = small_rotation(2.0, rng)                     # this pair's relative pose is 2 degrees off
    pair = []
    for Y in (Xw[a] @ Ra.T + ta, (Xw[b] @ Ra.T + ta) @ E.T):
        Y = Y + 0.01 * np.linalg.norm(Y, axis=1, keepdims=True) * rng.standard_normal(Y.shape)
        pair.append(Y)
    scale = rng.uniform(0.5, 2.0)                    # each pair has its own unknown scale
    pm.append((scale * pair[0], scale * pair[1]))
    conf.append((np.ones(len(pair[0])), np.ones(len(pair[1]))))
world_init, world, sim, history = global_align(edges, pm, conf, n_views)


def rms_to_truth(chi):
    A, B = np.concatenate(chi), np.concatenate(Xw)
    s, R, t = umeyama(A, B)                          # compare up to a similarity
    return np.sqrt(((s * A @ R.T + t - B) ** 2).sum(1).mean())


print("RMS error after chaining: %.3f m, after global alignment: %.3f m"
      % (rms_to_truth(world_init), rms_to_truth(world)))
# == end ======================================================================================


# == post block 9: evaluation =================================================================
def evaluate(rec, gt, tau):
    """Accuracy and completeness (mean distances), and precision, recall and F-score at tau."""
    d_rec = cKDTree(gt).query(rec)[0]            # reconstruction -> ground truth
    d_gt = cKDTree(rec).query(gt)[0]             # ground truth -> reconstruction
    P, R = (d_rec < tau).mean(), (d_gt < tau).mean()
    return dict(acc=d_rec.mean(), comp=d_gt.mean(), P=P, R=R, F=2 * P * R / max(P + R, 1e-12))


xs_f, Pf = make_grid(1600)                       # ground truth: the zero level set at 2 mm
gt = sample_segments(marching_squares(scene_sdf(Pf).reshape(1600, 1600), xs_f))
xs, F, Wt = tsdf_fuse(arc_scans)
recs = {"TSDF": sample_segments(marching_squares(F, xs, Wt > 0))}
for alpha in (0.0, 32.0):
    chi, iso = screened_poisson(P_arc, N_arc, xs, alpha)
    recs["Poisson a=%g" % alpha] = sample_segments(marching_squares(chi - iso, xs))
for name, rec in recs.items():
    for tau in (0.01, 0.02, 0.05):
        m = evaluate(rec, gt, tau)
        print("%-13s tau = %2.0f mm: acc %5.1f mm, comp %5.1f mm, P %.3f, R %.3f, F %.3f"
              % (name, 1000 * tau, 1000 * m["acc"], 1000 * m["comp"], m["P"], m["R"], m["F"]))
# == end ======================================================================================


# ============================================================================================
# Figures
# ============================================================================================
from matplotlib.patches import Polygon as MplPolygon  # noqa: E402
from matplotlib.colors import TwoSlopeNorm  # noqa: E402


def loc(fig_fn, name):
    for lang in LANGS:
        out(fig_fn(lang), name.replace(".svg", "_%s.svg" % lang))


def tick_off(ax):
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)


EXT = 1.6
xs_gt = np.linspace(-EXT, EXT, 801)
SDF_GT = scene_sdf(np.stack(np.meshgrid(xs_gt, xs_gt), -1))


def draw_truth(ax, **kw):
    kw.setdefault("colors", C["dark"]); kw.setdefault("linestyles", "--"); kw.setdefault("linewidths", 1.3)
    ax.contour(xs_gt, xs_gt, SDF_GT, [0], **kw)


def draw_scene_fill(ax, color="#d9d9d9"):
    ax.contourf(xs_gt, xs_gt, SDF_GT, [-10, 0], colors=[color])


def draw_segs(ax, segs, color, lw=2.2, **kw):
    from matplotlib.collections import LineCollection
    ax.add_collection(LineCollection(segs, colors=color, linewidths=lw, **kw))


def cam_glyph(ax, R, t, size=0.16, color=C["a"], lw=1.6, alpha=1.0):
    """A small triangle for a 2D camera: apex at the centre, opening along +z."""
    Cc = -R.T @ t
    half = np.tan(np.arctan(CX / FOC))                 # half field of view
    corners = [Cc, Cc + R.T @ np.array([-half, 1]) * size, Cc + R.T @ np.array([half, 1]) * size]
    ax.add_patch(MplPolygon(corners, closed=True, fc=color, ec=color, lw=lw, alpha=alpha))


def setup_map(ax, lim=EXT):
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_aspect("equal")
    ax.grid(False)


TSDF_CMAP = plt.get_cmap("RdBu")


def show_tsdf(ax, F, Wt, xs, extent=EXT):
    img = np.where(Wt > 0, F, np.nan)
    cmap = TSDF_CMAP.copy(); cmap.set_bad("#efefef")
    h = xs[1] - xs[0]
    return ax.imshow(img, origin="lower", extent=[xs[0] - h / 2, xs[-1] + h / 2] * 2, cmap=cmap,
                     vmin=-1, vmax=1, interpolation="nearest")


# --------------------------------------------------------------------------------------------
# F1  flatland: the scene, the orbit, one depth scan
# --------------------------------------------------------------------------------------------
def fig_flatland(lang):
    fig = plt.figure(figsize=(12, 5.4))
    ax = fig.add_axes([0.0, 0.05, 0.48, 0.9])
    draw_scene_fill(ax)
    draw_truth(ax, linestyles="-", linewidths=1.5)
    for k, (R, t) in enumerate(cams):
        cam_glyph(ax, R, t, size=0.13, color=C["gray"], alpha=0.55)
    k0 = 8
    R, t, d = scans[k0]
    dn = render_depth(R, t)
    Cc = -R.T @ t
    Xn, okn = backproject(R, t, dn)
    for x in Xn[::8]:
        ax.plot([Cc[0], x[0]], [Cc[1], x[1]], color=C["b"], lw=0.6, alpha=0.6)
    Xs, _ = backproject(R, t, d)
    ax.plot(Xs[:, 0], Xs[:, 1], ".", color=C["x"], ms=4)
    cam_glyph(ax, R, t, size=0.22, color=C["b"])
    ax.text(Cc[0] + 0.1, Cc[1] + 0.12, "$k=%d$" % k0, color=C["b"], fontsize=15)
    ax.text(-0.55, 0.25, label(lang, "disk", "圆盘", "円板"), ha="center", va="center", fontsize=13, color=C["dark"])
    ax.text(0.5, -0.4, label(lang, "box", "方块", "箱"), ha="center", va="center", fontsize=13, color=C["dark"])
    ax.text(0.95, 0.88, label(lang, "bar", "细杆", "細い棒"), ha="center", va="center", fontsize=13, color=C["dark"])
    setup_map(ax, 2.95)
    ax.set_xlabel("$x$ (m)"); ax.set_ylabel("$z$ (m)")
    ax.grid(True, alpha=0.2)
    ax2 = fig.add_axes([0.58, 0.16, 0.4, 0.72])
    u = np.arange(W)
    ax2.plot(u, dn, color=C["dark"], lw=2, label=label(lang, "true depth", "真实深度", "真の深度"))
    ax2.plot(u, d, ".", color=C["x"], ms=5, label=label(lang, "measured, \u03c3 = 2 cm", "测量值，\u03c3 = 2 cm", "計測値、\u03c3 = 2 cm"))
    ax2.set_xlabel(label(lang, "pixel u", "像素 u", "画素 u"))
    ax2.set_ylabel(label(lang, "depth d(u) (m)", "深度 d(u)（m）", "深度 d(u)（m）"))
    ax2.set_title(label(lang, "depth scan of camera k = %d" % k0, "相机 k = %d 的深度扫描" % k0, "カメラ k = %d の深度スキャン" % k0))
    ax2.legend(fontsize=12, loc="upper right")
    ax2.invert_yaxis()
    print("F1 scan %d: %d pixels hit, depth range %.2f..%.2f" % (k0, np.isfinite(dn).sum(), np.nanmin(dn), np.nanmax(dn)))
    return fig


# --------------------------------------------------------------------------------------------
# F2  TSDF after 1, 4, 16, 64 scans + accuracy / completeness vs scans
# --------------------------------------------------------------------------------------------
def tsdf_curve():
    rows = []
    for n_s in (1, 2, 4, 8, 16, 32, 64):
        xs_, F_, W_ = tsdf_fuse(scans[::64 // n_s])
        m = evaluate(sample_segments(marching_squares(F_, xs_, W_ > 0)), gt, 0.02)
        rows.append((n_s, m["acc"], m["comp"], m["F"]))
    return np.array(rows)


CURVE = tsdf_curve()
print("F2 curve (n, acc, comp, F):\n", np.round(CURVE, 4))


def fig_tsdf(lang):
    fig = plt.figure(figsize=(13, 6.6))
    for k, n_s in enumerate((1, 4, 16, 64)):
        ax = fig.add_axes([0.0 + 0.27 * (k % 2), 0.5 - 0.48 * (k // 2), 0.25, 0.42])
        xs_, F_, W_ = tsdf_fuse(scans[::64 // n_s])
        im = show_tsdf(ax, F_, W_, xs_)
        draw_segs(ax, marching_squares(F_, xs_, W_ > 0), C["dark"], lw=1.8)
        for R, t in cams[::64 // n_s]:
            Cc = -R.T @ t
            ax.plot(*(0.6 * Cc), marker=(3, 0, np.degrees(np.arctan2(-Cc[1], -Cc[0])) - 90), color=C["a"], ms=9)
        setup_map(ax, 1.6); tick_off(ax)
        ax.set_title(label(lang, "%d scan%s" % (n_s, "" if n_s == 1 else "s"), "%d 次扫描" % n_s, "スキャン %d 回" % n_s), fontsize=15)
    cax = fig.add_axes([0.535, 0.12, 0.012, 0.7])
    cb = fig.colorbar(im, cax=cax)
    cb.set_label("$F$")
    ax = fig.add_axes([0.7, 0.1, 0.3, 0.78])
    ax.loglog(CURVE[:, 0], 1000 * CURVE[:, 1], "o-", color=C["a"], label=label(lang, "accuracy", "准确度", "精度（accuracy）"))
    ax.loglog(CURVE[:, 0], 1000 * CURVE[:, 2], "s-", color=C["b"], label=label(lang, "completeness", "完整度", "完全性"))
    ax.axhline(20, color=C["x"], ls=":", lw=1.8)
    ax.text(1.1, 22, label(lang, "per-scan noise \u03c3", "单次扫描噪声 \u03c3", "1 回の雑音 \u03c3"), color=C["x"], fontsize=13)
    ax.set_xlabel(label(lang, "number of scans", "扫描次数", "スキャン数"))
    ax.set_ylabel(label(lang, "mean distance (mm)", "平均距离（mm）", "平均距離（mm）"))
    ax.set_xticks([1, 2, 4, 8, 16, 32, 64]); ax.set_xticklabels(["1", "2", "4", "8", "16", "32", "64"])
    ax.legend(fontsize=12, loc="upper right")
    ax.set_ylim(1, 1000)
    return fig


# --------------------------------------------------------------------------------------------
# F3  truncation distance
# --------------------------------------------------------------------------------------------
MUS = [0.02, 0.03, 0.045, 0.06, 0.09, 0.12, 0.18]
bar_gt = gt[sd_box(gt, np.array([0.45, 0.65]), np.array([0.38, 0.04]), np.deg2rad(-10)) < 1e-3]
TRUNC = []
for mu_ in MUS:
    xs_, F_, W_ = tsdf_fuse(scans, mu=mu_)
    rec_ = sample_segments(marching_squares(F_, xs_, W_ > 0))
    TRUNC.append((mu_, evaluate(rec_, gt, 0.02)["F"], evaluate(rec_, bar_gt, 0.02)["R"], evaluate(rec_, gt, 0.02)["acc"]))
TRUNC = np.array(TRUNC)
print("F3 truncation (mu, F, bar recall, acc):\n", np.round(TRUNC, 4))
VOX = {}
for n_ in (32, 64, 128, 256):
    xs_, F_, W_ = tsdf_fuse(scans, n=n_)
    VOX[n_] = evaluate(sample_segments(marching_squares(F_, xs_, W_ > 0)), gt, 0.02)["F"]
print("F3b voxel sizes (n: F at 2 cm):", {k: round(float(v), 3) for k, v in VOX.items()})


def fig_trunc(lang):
    fig = plt.figure(figsize=(13, 4.9))
    gs = fig.add_gridspec(1, 3, width_ratios=[1, 1, 1.25], wspace=0.28)
    for k, mu_ in enumerate((0.045, 0.15)):
        ax = fig.add_subplot(gs[0, k])
        xs_, F_, W_ = tsdf_fuse(scans, mu=mu_)
        show_tsdf(ax, F_, W_, xs_)
        draw_truth(ax, colors=C["y"], linewidths=2.0)
        draw_segs(ax, marching_squares(F_, xs_, W_ > 0), C["dark"], lw=2.2)
        ax.set_xlim(-0.05, 0.95); ax.set_ylim(0.2, 1.05); ax.set_aspect("equal"); tick_off(ax)
        ax.set_title("$\\mu$ = %.3g m" % mu_, fontsize=15)
        bf = evaluate(sample_segments(marching_squares(F_, xs_, W_ > 0)), bar_gt, 0.02)["R"]
        print("F3 panel mu=%.3f bar recall %.3f" % (mu_, bf))
    ax = fig.add_subplot(gs[0, 2])
    ax.plot(100 * TRUNC[:, 0], TRUNC[:, 1], "o-", color=C["a"], label=label(lang, "F-score, whole scene", "F 值（全场景）", "F 値（シーン全体）"))
    ax.plot(100 * TRUNC[:, 0], TRUNC[:, 2], "s-", color=C["b"], label=label(lang, "recall on the bar", "细杆上的召回率", "細い棒の再現率"))
    ax.axvline(2, color=C["x"], ls=":", lw=1.8)
    ax.text(2.3, 0.72, "\u03c3", color=C["x"], fontsize=15)
    ax.axvline(8, color=C["gray"], ls=":", lw=1.8)
    ax.text(8.3, 0.72, label(lang, "bar\nthickness", "杆厚", "棒の\n厚さ"), color=C["gray"], fontsize=13)
    ax.set_xlabel("$\\mu$ (cm)"); ax.set_ylim(0.35, 1.03)
    ax.set_ylabel(label(lang, "at \u03c4 = 2 cm", "\u03c4 = 2 cm 时", "\u03c4 = 2 cm で"))
    ax.legend(fontsize=12, loc="lower left")
    return fig


# --------------------------------------------------------------------------------------------
# F4  vertex placement in marching squares: interpolation vs midpoints
# --------------------------------------------------------------------------------------------
NS = [16, 32, 64, 128, 256]
EXTR = []
for n_ in NS:
    xs_, P_ = make_grid(n_)
    G_ = scene_sdf(P_).reshape(n_, n_)
    EXTR.append([np.abs(scene_sdf(sample_segments(marching_squares(G_, xs_, interp=i)))).mean() for i in (True, False)])
EXTR = np.array(EXTR)
print("F4 extraction errors (interp, mid):\n", EXTR)


def fig_extract(lang):
    fig, axs = plt.subplots(1, 2, figsize=(12, 5.2), gridspec_kw=dict(width_ratios=[1, 1.15]))
    ax = axs[0]
    n_ = 16
    xs_, P_ = make_grid(n_)
    G_ = scene_sdf(P_).reshape(n_, n_)
    draw_scene_fill(ax)
    draw_truth(ax, linestyles="-", colors=C["dark"], linewidths=1.6)
    gx, gz = np.meshgrid(xs_, xs_)
    ins = G_ < 0
    ax.plot(gx[ins], gz[ins], "o", color=C["z"], ms=6)
    ax.plot(gx[~ins], gz[~ins], "o", mfc="white", mec=C["gray"], ms=6)
    for i_, col, ls in ((True, C["a"], "-"), (False, C["b"], "--")):
        draw_segs(ax, marching_squares(G_, xs_, interp=i_), col, lw=2.6, linestyles=ls)
    ax.plot([], [], color=C["a"], lw=2.6, label=label(lang, "interpolated", "线性插值", "線形補間"))
    ax.plot([], [], color=C["b"], lw=2.6, ls="--", label=label(lang, "edge midpoints", "边中点", "辺の中点"))
    ax.set_xlim(-1.15, 0.05); ax.set_ylim(-0.3, 0.85); ax.set_aspect("equal")
    ax.set_xticks(xs_[(xs_ > -1.15) & (xs_ < 0.05)]); ax.set_yticks(xs_[(xs_ > -0.3) & (xs_ < 0.85)])
    ax.set_xticklabels([]); ax.set_yticklabels([])
    ax.grid(True, alpha=0.5)
    ax.legend(fontsize=12, loc="lower left", framealpha=0.95)
    ax.set_title("$h$ = 20 cm", fontsize=15)
    ax = axs[1]
    hh = 3.2 / np.array(NS) * 1000
    ax.loglog(hh, 1000 * EXTR[:, 0], "o-", color=C["a"], label=label(lang, "interpolated", "线性插值", "線形補間"))
    ax.loglog(hh, 1000 * EXTR[:, 1], "s--", color=C["b"], label=label(lang, "edge midpoints", "边中点", "辺の中点"))
    ax.loglog(hh, 1000 * EXTR[2, 1] * (hh / hh[2]), ":", color=C["gray"], lw=1.6)
    ax.loglog(hh, 1000 * EXTR[2, 0] * (hh / hh[2]) ** 2, ":", color=C["gray"], lw=1.6)
    ax.text(hh[1], 1000 * EXTR[2, 1] * hh[1] / hh[2] * 0.45, "$\\propto h$", fontsize=16, color=C["gray"])
    ax.text(hh[1], 1000 * EXTR[2, 0] * (hh[1] / hh[2]) ** 2 * 0.3, "$\\propto h^2$", fontsize=16, color=C["gray"])
    from matplotlib.ticker import FixedLocator, NullLocator, FixedFormatter
    ax.xaxis.set_major_locator(FixedLocator(hh)); ax.xaxis.set_minor_locator(NullLocator())
    ax.xaxis.set_major_formatter(FixedFormatter(["%g" % v for v in hh]))
    ax.set_xlabel(label(lang, "voxel size h (mm)", "体素边长 h（mm）", "ボクセルサイズ h（mm）"))
    ax.set_ylabel(label(lang, "mean |SDF| of the curve (mm)", "曲线的平均 |SDF|（mm）", "曲線の平均 |SDF|（mm）"))
    ax.legend(fontsize=12, loc="lower right")
    return fig


# --------------------------------------------------------------------------------------------
# F5  arc capture: TSDF vs Poisson vs screened Poisson
# --------------------------------------------------------------------------------------------
def fig_poisson(lang):
    fig, axs = plt.subplots(1, 3, figsize=(14, 5.2))
    xs_, F_, W_ = tsdf_fuse(arc_scans)
    ax = axs[0]
    show_tsdf(ax, F_, W_, xs_)
    draw_truth(ax, colors=C["y"], linewidths=2.0)
    draw_segs(ax, marching_squares(F_, xs_, W_ > 0), C["dark"], lw=2.2)
    for R, t in arc:
        Cc = -R.T @ t
        ax.plot(*(0.58 * Cc), marker=(3, 0, np.degrees(np.arctan2(-Cc[1], -Cc[0])) - 90), color=C["a"], ms=9)
    ax.set_title("TSDF", fontsize=15)
    for ax, alpha in zip(axs[1:], (0.0, 32.0)):
        chi_, iso_ = screened_poisson(P_arc, N_arc, xs_, alpha)
        h = xs_[1] - xs_[0]
        ax.imshow(chi_ - iso_, origin="lower", extent=[xs_[0] - h / 2, xs_[-1] + h / 2] * 2, cmap="PuOr_r",
                  norm=TwoSlopeNorm(0, -0.8, 0.8), interpolation="nearest")
        draw_truth(ax, colors=C["y"], linewidths=2.0)
        draw_segs(ax, marching_squares(chi_ - iso_, xs_), C["dark"], lw=2.2)
        ax.plot(P_arc[::6, 0], P_arc[::6, 1], ".", color=C["x"], ms=2)
        ax.set_title(label(lang, "Poisson" if alpha == 0 else "screened Poisson, \u03b1 = 32",
                           "泊松" if alpha == 0 else "屏蔽泊松，\u03b1 = 32",
                           "ポアソン" if alpha == 0 else "スクリーン付きポアソン、\u03b1 = 32"), fontsize=15)
    for ax in axs:
        setup_map(ax, 1.6); tick_off(ax)
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F6  NeuS weights
# --------------------------------------------------------------------------------------------
def fig_neus_weights(lang):
    fig, axs = plt.subplots(1, 2, figsize=(13, 5.2))
    tt = np.linspace(0.0, 4.0, 8001)
    dtt = tt[1] - tt[0]
    tm = tt[:-1] + dtt / 2
    ax = axs[0]
    for th, ls in ((0, "-"), (60, "--")):
        c_ = np.cos(np.deg2rad(th))
        f_ = -c_ * (tt - 2.0)
        for nm, a_, col in ((label(lang, "naive", "朴素", "素朴"), alpha_naive(f_, 20.0, dtt), C["b"]), ("NeuS", alpha_neus(f_, 20.0), C["a"])):
            w_ = weights_from_alpha(a_) / dtt
            ax.plot(tm, w_, ls=ls, color=col, label="%s, \u03b8 = %d\u00b0" % (nm, th))
    ax.axvline(2.0, color=C["dark"], lw=1.2)
    ax.text(2.02, 0.92, "$t^*$", fontsize=16, transform=ax.get_xaxis_transform())
    ax.set_xlim(1.5, 2.5); ax.set_xlabel("$t$ (m)"); ax.set_ylabel("$w(t)$")
    ax.set_title(label(lang, "one plane, s = 20", "单个平面，s = 20", "1 枚の平面、s = 20"), fontsize=15)
    ax.legend(fontsize=12, loc="upper left")
    ax.set_ylim(0, 7.2)
    ax = axs[1]
    # a slab [2.0, 2.3] and a second object starting at 3.0, ray head-on
    f2 = np.where(tt < 2.65, np.where(tt < 2.15, 2.0 - tt, tt - 2.3), 3.0 - tt)
    f2 = np.minimum(f2, np.maximum(2.0 - tt, tt - 2.3))
    f2 = np.where(tt > 3.0, 3.0 - tt, f2)
    s2 = 20.0
    phi = s2 * sigmoid(s2 * f2) * (1 - sigmoid(s2 * f2))
    norm_w = phi[:-1] / (phi[:-1].sum() * dtt)
    curves = ((label(lang, "naive", "朴素", "素朴"), weights_from_alpha(alpha_naive(f2, s2, dtt)) / dtt, C["b"], "-"),
              ("$\\bar\\phi_s$", norm_w, C["gray"], ":"),
              ("NeuS", weights_from_alpha(alpha_neus(f2, s2)) / dtt, C["a"], "-"))
    for nm, w_, col, ls in curves:
        ax.plot(tm, w_, color=col, ls=ls, label=nm, lw=2.4)
    ax2 = ax.twinx()
    ax2.plot(tt, f2, color=C["y"], lw=1.5, alpha=0.8)
    ax2.axhline(0, color=C["y"], lw=0.8, alpha=0.6)
    ax2.set_ylabel("$f(t)$", color=C["y"]); ax2.set_ylim(-0.6, 0.6); ax2.grid(False)
    for x0 in (2.0, 2.3, 3.0):
        ax.axvline(x0, color=C["dark"], lw=1.0, alpha=0.6)
    ax.set_xlim(1.6, 3.5); ax.set_xlabel("$t$ (m)"); ax.set_ylabel("$w(t)$")
    ax.set_title(label(lang, "a slab, then a second surface", "一块板，后面还有一个表面", "板と、その奥のもう 1 つの表面"), fontsize=15)
    ax.legend(fontsize=13, loc="upper right")
    for nm, w_, _, _ in curves:
        seg = lambda a, b: (w_[(tm > a) & (tm < b)].sum() * dtt)
        print("F6 %s: weight near 2.0: %.3f, near 2.3: %.3f, near 3.0: %.3f" % (nm, seg(1.7, 2.15), seg(2.15, 2.65), seg(2.65, 3.4)))
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F7  the tiny NeuS fit
# --------------------------------------------------------------------------------------------
def fig_neus_fit(lang):
    fig = plt.figure(figsize=(14, 4.4))
    its = sorted(neus_log)
    for k, it in enumerate(its):
        ax = fig.add_axes([0.005 + 0.245 * k, 0.04, 0.235, 0.82])
        g_, s_k, loss_k = neus_log[it]
        h = xs_n[1] - xs_n[0]
        ax.imshow(g_, origin="lower", extent=[xs_n[0] - h / 2, xs_n[-1] + h / 2] * 2, cmap="RdBu",
                  norm=TwoSlopeNorm(0, -0.5, 1.5), interpolation="bilinear")
        draw_truth(ax, colors=C["y"], linewidths=2.0)
        draw_segs(ax, marching_squares(g_, xs_n), C["dark"], lw=2.2)
        setup_map(ax, 1.6); tick_off(ax)
        ax.set_title(label(lang, "iter %d, s = %.0f" % (it, s_k), "第 %d 步，s = %.0f" % (it, s_k), "%d 回目、s = %.0f" % (it, s_k)), fontsize=14)
        if k == 0:
            for R, t in orbit(24):
                Cc = -R.T @ t
                ax.plot(*(0.58 * Cc), marker=(3, 0, np.degrees(np.arctan2(-Cc[1], -Cc[0])) - 90), color=C["a"], ms=9)
    return fig


# --------------------------------------------------------------------------------------------
# F8  pointmaps and focal recovery
# --------------------------------------------------------------------------------------------
def pm_rgb(X, lo, hi):
    img = (X - lo) / (hi - lo)
    img = np.clip(img, 0, 1)
    img[~np.isfinite(X).all(-1)] = 1.0
    return img


def fig_pointmap(lang):
    fig = plt.figure(figsize=(14, 4.6))
    ax = fig.add_axes([0.0, 0.1, 0.22, 0.78])
    for X, (R, t), col in ((X11, (R1, t1), C["a"]), (X22, (R2, t2), C["b"])):
        Xw_ = (X[::2, ::2].reshape(-1, 3) - t) @ R
        Xw_ = Xw_[np.isfinite(Xw_).all(1)]
        Xw_ = Xw_[Xw_[:, 1] < 0.58]                       # objects only, not the ground
        ax.plot(Xw_[:, 0], Xw_[:, 2], ".", ms=2.5, color=col, alpha=0.6)
        Cc = -R.T @ t
        for uv in ((0, (H3 - 1) / 2), (W3 - 1, (H3 - 1) / 2)):
            r = R.T @ (np.linalg.inv(K3) @ np.array([uv[0], uv[1], 1.0]))
            r = r / np.linalg.norm(r[[0, 2]]) * 1.2
            ax.plot([Cc[0], Cc[0] + r[0]], [Cc[2], Cc[2] + r[2]], color=col, lw=1.4)
        ax.plot(Cc[0], Cc[2], "o", color=col, ms=8)
    ax.text(0.3, -3.0 - 0.35, "1", color=C["a"], fontsize=15, ha="center", va="top")
    ax.text(2.2 + 0.2, -2.2 - 0.25, "2", color=C["b"], fontsize=15, ha="left", va="top")
    ax.set_aspect("equal"); ax.set_xlim(-1.2, 2.8); ax.set_ylim(-3.6, 1.3)
    ax.set_xlabel("$x$ (m)"); ax.set_ylabel("$z$ (m)")
    ax.set_title(label(lang, "top view", "俯视图", "上から見た図"), fontsize=14)
    both = np.concatenate([X11.reshape(-1, 3), X21.reshape(-1, 3)])
    both = both[np.isfinite(both).all(1)]
    lo, hi = np.percentile(both, 2, 0), np.percentile(both, 98, 0)
    for k, (X, ttl) in enumerate(((X11, "$X^{1,1}$"), (X21, "$X^{2,1}$"))):
        ax = fig.add_axes([0.27 + 0.235 * k, 0.12, 0.22, 0.74])
        ax.imshow(pm_rgb(X, lo, hi), interpolation="nearest")
        tick_off(ax)
        ax.set_title(ttl, fontsize=16)
    ax = fig.add_axes([0.79, 0.17, 0.2, 0.68])
    v, u = np.mgrid[0:H3, 0:W3].astype(float)
    a = np.stack([u - (W3 - 1) / 2, v - (H3 - 1) / 2], -1).reshape(-1, 2)
    b = (P11[..., :2] / P11[..., 2:]).reshape(-1, 2)
    okk = np.isfinite(b).all(1)
    fs = np.linspace(5, 90, 400)
    cost_l1 = [(C11.reshape(-1)[okk] * np.linalg.norm(a[okk] - f_ * b[okk], axis=1)).sum() for f_ in fs]
    cost_l2 = [(C11.reshape(-1)[okk] * (np.linalg.norm(a[okk] - f_ * b[okk], axis=1) ** 2)).sum() for f_ in fs]
    ax.plot(fs, np.array(cost_l1) / min(cost_l1), color=C["a"], label="L1")
    ax.plot(fs, np.array(cost_l2) / min(cost_l2), color=C["b"], ls="--", label="L2")
    ax.axvline(F3, color=C["dark"], lw=1.2)
    ax.set_xlabel("$f$ (px)"); ax.set_ylim(0.9, 3); ax.legend(fontsize=13, loc="upper right")
    ax.set_title(label(lang, "focal cost (min = 1)", "焦距代价（最小值 = 1）", "焦点距離のコスト（最小 = 1）"), fontsize=13)
    print("F8 argmin L1 %.2f, argmin L2 %.2f" % (fs[np.argmin(cost_l1)], fs[np.argmin(cost_l2)]))
    return fig


# --------------------------------------------------------------------------------------------
# F9  global alignment
# --------------------------------------------------------------------------------------------
def fig_global(lang):
    fig = plt.figure(figsize=(15, 4.5))
    cols = plt.get_cmap("tab10").colors
    B_all = np.concatenate(Xw)
    obj = [x[:, 1] < 0.55 for x in Xw]                    # show the objects, not the ground
    panels = ((None, label(lang, "pairwise outputs", "成对输出", "ペアごとの出力")),
              (world_init, label(lang, "chained", "链式拼接", "連鎖でつなぐ")),
              (world, label(lang, "global alignment", "全局对齐", "大域整列")))
    for k, (ch, ttl) in enumerate(panels):
        ax = fig.add_axes([0.0 + 0.24 * k, 0.04, 0.22, 0.82])
        if ch is None:
            for e in range(n_views):                  # the ring pairs, each in its own frame
                a_, b_ = edges[e]
                for kk, v in enumerate((a_, b_)):
                    Y = pm[e][kk][obj[v]]
                    ax.plot(Y[:, 0], Y[:, 2], ".", ms=1.5, color=cols[v % 10], alpha=0.5)
            ax.set_aspect("equal")
        else:
            A = np.concatenate(ch)
            s_, R_, t_ = umeyama(A, B_all)
            for v in range(n_views):
                Y = s_ * ch[v][obj[v]] @ R_.T + t_
                ax.plot(Y[:, 0], Y[:, 2], ".", ms=1.5, color=cols[v % 10], alpha=0.5)
            for R, t in cams3:
                Cc = -R.T @ t
                ax.plot(Cc[0] * 0.5, Cc[2] * 0.5, marker=(3, 0, np.degrees(np.arctan2(-Cc[2], -Cc[0])) - 90),
                        color=C["dark"], ms=8)
            ax.set_xlim(-1.75, 1.75); ax.set_ylim(-1.75, 1.75); ax.set_aspect("equal")
            ax.set_xlabel("RMS %.3f m" % rms_to_truth(ch), fontsize=14)
        ax.set_title(ttl, fontsize=14); tick_off(ax)
    ax = fig.add_axes([0.78, 0.17, 0.21, 0.69])
    ax.plot(np.arange(1, len(history) + 1), history, "o-", color=C["a"], ms=4)
    ax.set_xlabel(label(lang, "iteration", "迭代次数", "反復回数"))
    ax.set_ylabel(label(lang, "weighted RMS residual", "加权 RMS 残差", "重み付き RMS 残差"))
    print("F9 history first/last", history[0], history[-1])
    return fig


# --------------------------------------------------------------------------------------------
# F10 evaluation: distance-coloured reconstructions and P / R / F against tau
# --------------------------------------------------------------------------------------------
def fig_fscore(lang):
    fig = plt.figure(figsize=(14, 5.0))
    taus = np.linspace(0.002, 0.08, 40)
    names = ["TSDF", "Poisson a=32"]
    for k, nm in enumerate(names):
        ax = fig.add_axes([0.0 + 0.3 * k, 0.05, 0.29, 0.83])
        rec = recs[nm]
        d = cKDTree(gt).query(rec)[0]
        dg = cKDTree(rec).query(gt)[0]
        miss = gt[dg > 0.02]
        ax.plot(miss[:, 0], miss[:, 1], ".", color=C["gray"], ms=3, alpha=0.6)
        sc = ax.scatter(rec[:, 0], rec[:, 1], c=1000 * d, s=3, cmap="viridis", vmin=0, vmax=40)
        setup_map(ax, 1.25); tick_off(ax)
        ax.set_title("TSDF" if k == 0 else label(lang, "screened Poisson", "屏蔽泊松", "スクリーン付きポアソン"), fontsize=15)
    cb = fig.colorbar(sc, ax=fig.axes[:2], fraction=0.03, pad=0.01)
    cb.set_label(label(lang, "distance to truth (mm)", "到真值的距离（mm）", "真値までの距離（mm）"))
    ax = fig.add_axes([0.7, 0.17, 0.29, 0.72])
    for nm, col in zip(names, (C["a"], C["b"])):
        ms = [evaluate(recs[nm], gt, tau) for tau in taus]
        lab = "TSDF" if nm == "TSDF" else label(lang, "screened Poisson", "屏蔽泊松", "スクリーン付きポアソン")
        ax.plot(100 * taus, [m["P"] for m in ms], color=col, ls="--", lw=1.8)
        ax.plot(100 * taus, [m["R"] for m in ms], color=col, ls=":", lw=1.8)
        ax.plot(100 * taus, [m["F"] for m in ms], color=col, lw=2.6, label=lab + " F")
    ax.plot([], [], color=C["gray"], ls="--", label=label(lang, "precision", "精确率", "適合率"))
    ax.plot([], [], color=C["gray"], ls=":", label=label(lang, "recall", "召回率", "再現率"))
    ax.set_xlabel("$\\tau$ (cm)"); ax.set_ylim(0.4, 1.02)
    ax.legend(fontsize=11, loc="lower right")
    return fig


if __name__ == "__main__":
    loc(fig_flatland, "09-flatland.svg")
    loc(fig_tsdf, "09-tsdf-fusion.svg")
    loc(fig_trunc, "09-truncation.svg")
    loc(fig_extract, "09-extraction.svg")
    loc(fig_poisson, "09-poisson.svg")
    loc(fig_neus_weights, "09-neus-weights.svg")
    loc(fig_neus_fit, "09-neus-fit.svg")
    loc(fig_pointmap, "09-pointmap.svg")
    loc(fig_global, "09-global-alignment.svg")
    loc(fig_fscore, "09-fscore.svg")
