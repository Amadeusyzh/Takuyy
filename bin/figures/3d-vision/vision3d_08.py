"""Figures for 3d-vision post 08: 3D representations.

Run from anywhere:
    python3 bin/figures/3d-vision/vision3d_08.py            # writes the SVGs
    python3 bin/figures/3d-vision/vision3d_08.py /tmp/prev  # ... and PNG previews into /tmp/prev

The post's code is copied verbatim below in the order of the post (sdf_torus, sample_torus,
look_at, render_depth, backproject, depth_normals, mpi_planes, composite, chamfer_fscore,
farthest_point_sampling, torus_mesh, sample_mesh, grid_centres, octree_levels, logodds,
sdf_grid, trilinear, zero_crossings, the 2D neural field, fit_gaussians, pointnet), including
the print statements whose output the post quotes. Every number in a caption is printed here.
Camera convention: OpenCV (x right, y down, z forward), world-to-camera X_c = R X_w + t.
"""
import os
import sys
import pathlib

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

plt.rcParams["svg.hashsalt"] = "3d-vision-08"  # stable element ids

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/3d-vision"
PREV = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None


def out(fig, name):
    if PREV is not None:
        PREV.mkdir(parents=True, exist_ok=True)
        fig.savefig(PREV / name.replace(".svg", ".png"), dpi=60)
    save(fig, OUT / name)


def loc(fig_fn, name):
    """Render a figure with words once per language: name_{en,zh,ja}.svg."""
    for lang in LANGS:
        out(fig_fn(lang), name.replace(".svg", "_%s.svg" % lang))


# ============================================================================================
# The post's code, verbatim
# ============================================================================================
# ---- section 1.2: the running example -----------------------------------------------------
import numpy as np

R_MAJ, R_MIN = 1.0, 0.4          # torus around the z axis: ring radius R, tube radius r


def sdf_torus(p):
    """Exact signed distance to the torus (negative inside); p has shape (..., 3)."""
    q = np.hypot(p[..., 0], p[..., 1]) - R_MAJ     # distance from the ring circle, in its plane
    return np.hypot(q, p[..., 2]) - R_MIN


def sample_torus(n, rng):
    """n points uniformly distributed over the surface, with their exact unit normals."""
    phi = rng.uniform(0, 2 * np.pi, 4 * n)          # angle around the ring
    th = rng.uniform(0, 2 * np.pi, 4 * n)           # angle around the tube
    # the area element is r (R + r cos th) dth dphi, so accept th with probability ~ R + r cos th
    keep = rng.uniform(0, R_MAJ + R_MIN, 4 * n) < R_MAJ + R_MIN * np.cos(th)
    phi, th = phi[keep][:n], th[keep][:n]
    nrm = np.stack([np.cos(th) * np.cos(phi), np.cos(th) * np.sin(phi), np.sin(th)], -1)
    ring = np.stack([R_MAJ * np.cos(phi), R_MAJ * np.sin(phi), np.zeros_like(phi)], -1)
    return ring + R_MIN * nrm, nrm


AREA = 4 * np.pi ** 2 * R_MAJ * R_MIN
VOLUME = 2 * np.pi ** 2 * R_MAJ * R_MIN ** 2
rng = np.random.default_rng(0)
P_true, N_true = sample_torus(200_000, rng)
print("area %.4f  volume %.4f" % (AREA, VOLUME))
print("max |sdf| at the samples: %.1e" % np.abs(sdf_torus(P_true)).max())


# ---- section 2: depth maps --------------------------------------------------------------
def look_at(C, target, up=(0.0, 0.0, 1.0)):
    """World-to-camera R, t (OpenCV: x right, y down, z forward) for a camera at C."""
    z = target - C; z = z / np.linalg.norm(z)
    x = np.cross(z, up); x = x / np.linalg.norm(x)
    y = np.cross(z, x)
    R = np.stack([x, y, z])                          # rows = camera axes in world coordinates
    return R, -R @ C


def render_depth(K, R, t, W, H, sdf, n_steps=96, s_max=10.0):
    """Depth map Z(u, v) by sphere tracing the SDF; inf where the ray misses."""
    u, v = np.meshgrid(np.arange(W, dtype=float), np.arange(H, dtype=float))
    rays = np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(K).T   # K^-1 (u, v, 1): z = 1
    d = rays @ R                                     # R^T * ray: directions in the world frame
    norm = np.linalg.norm(d, axis=-1, keepdims=True)
    d = d / norm
    C = -R.T @ t
    s = np.zeros((H, W))                             # distance travelled along each ray
    for _ in range(n_steps):
        s = s + sdf(C + s[..., None] * d)            # safe step: the SDF is 1-Lipschitz
    hit = np.abs(sdf(C + s[..., None] * d)) < 1e-4
    hit &= s < s_max
    return np.where(hit, s / norm[..., 0], np.inf), np.where(hit, s, np.inf)   # depth Z, range


def backproject(depth, K, R, t):
    """Pixels with finite depth -> world points: X_w = R^T (Z K^-1 (u, v, 1) - t)."""
    v, u = np.nonzero(np.isfinite(depth))
    Z = depth[v, u]
    Xc = (np.linalg.inv(K) @ np.stack([u, v, np.ones_like(u)])) * Z    # 3 x M, camera frame
    return (R.T @ (Xc - t[:, None])).T                                  # M x 3, world frame


def depth_normals(depth, K):
    """Camera-frame normals from a depth map: cross product of neighbouring 3D points."""
    H, W = depth.shape
    v, u = np.mgrid[0:H, 0:W]
    X = np.linalg.inv(K) @ np.stack([u.ravel(), v.ravel(), np.ones(H * W)])
    X = (X * depth.ravel()).T.reshape(H, W, 3)
    du = X[1:-1, 2:] - X[1:-1, :-2]                  # along +u (right)
    dv = X[2:, 1:-1] - X[:-2, 1:-1]                  # along +v (down)
    n = -np.cross(du, dv)                            # right x down points away: flip to the camera
    n = n / np.linalg.norm(n, axis=-1, keepdims=True)
    out_ = np.full((H, W, 3), np.nan)
    out_[1:-1, 1:-1] = n
    return out_


def sdf_box(p, c, half):
    """Exact SDF of an axis-aligned box with centre c and half-sizes half."""
    q = np.abs(p - c) - half
    return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(-1), 0)


def sdf_scene(p):
    """The torus resting on a 4 m x 4 m slab (a table top)."""
    return np.minimum(sdf_torus(p), sdf_box(p, np.array([0, 0, -0.45]), np.array([2.0, 2.0, 0.05])))


W_IMG, H_IMG = 160, 120
K = np.array([[140.0, 0, 79.5], [0, 140.0, 59.5], [0, 0, 1]])
C_cam = np.array([0.6, -3.0, 1.8])
R_cam, t_cam = look_at(C_cam, np.zeros(3))
depth, rng_map = render_depth(K, R_cam, t_cam, W_IMG, H_IMG, sdf_scene)
pts = backproject(depth, K, R_cam, t_cam)
valid = np.isfinite(depth)
print("pixels hit: %d of %d, depth %.3f..%.3f m" % (valid.sum(), valid.size, depth[valid].min(), depth[valid].max()))
print("max |sdf| of back-projected points: %.1e" % np.abs(sdf_scene(pts)).max())
print("range / depth at the corner pixel: %.4f" % np.linalg.norm(np.linalg.inv(K) @ [0, 0, 1]))
with np.errstate(invalid="ignore"):
    nc = depth_normals(depth, K)                     # camera frame, NaN at the border and misses


def grad(f, p, e=1e-5):
    return np.stack([(f(p + e * d) - f(p - e * d)) / (2 * e) for d in np.eye(3)], -1)


v_, u_ = np.nonzero(valid)
n_true_c = np.full((H_IMG, W_IMG, 3), np.nan)
n_true_c[v_, u_] = grad(sdf_scene, pts) @ R_cam.T    # world -> camera: n_c = R n_w
ok = np.isfinite(nc).all(-1) & valid
ang = np.degrees(np.arccos(np.clip(np.sum(nc[ok] * n_true_c[ok], -1), -1, 1)))
print("normal error from depth: median %.2f deg, %.1f%% of pixels above 10 deg" % (np.median(ang), 100 * np.mean(ang > 10)))
print("float32 depth map: %.1f kB" % (W_IMG * H_IMG * 4 / 1000))


# ---- section 2.4: multi-plane images ---------------------------------------------------
def mpi_planes(near, far, D):
    """D fronto-parallel planes, evenly spaced in inverse depth (disparity)."""
    return 1.0 / np.linspace(1.0 / near, 1.0 / far, D)


def composite(rgb, alpha):
    """Front-to-back 'over' compositing of D layers (index 0 = nearest)."""
    T = np.cumprod(np.concatenate([[1.0], 1.0 - alpha[:-1]]))   # transmittance in front of layer i
    w = T * alpha
    return (w[:, None] * rgb).sum(0), w


d_planes = mpi_planes(1.0, 100.0, 32)
print("plane depths:", np.round(d_planes[:4], 3), "...", np.round(d_planes[-3:], 1))
f_px, base = 500.0, 0.1
print("disparity step between planes: %.2f px" % (f_px * base * (1 / d_planes[0] - 1 / d_planes[1])))
c_ray, w_ray = composite(np.array([[1.0, 0, 0], [0, 1.0, 0], [0, 0, 1.0]]), np.array([0.3, 0.5, 1.0]))
print("composited colour:", c_ray, "weights:", w_ray)


# ---- section 3: point clouds -------------------------------------------------------------
from scipy.spatial import cKDTree


def chamfer_fscore(A, B, tau):
    """Symmetric Chamfer distance and F-score at threshold tau between point sets A and B."""
    d_ab = cKDTree(B).query(A)[0]                    # every point of A to its nearest point in B
    d_ba = cKDTree(A).query(B)[0]
    precision = np.mean(d_ab < tau)                  # how much of A lies near B (accuracy)
    recall = np.mean(d_ba < tau)                     # how much of B is covered by A (completeness)
    f = 2 * precision * recall / max(precision + recall, 1e-12)
    return 0.5 * (d_ab.mean() + d_ba.mean()), precision, recall, f


ref = P_true                                          # 200k exact samples stand in for the surface
rng = np.random.default_rng(1)
cases = {
    "2k exact": sample_torus(2_000, rng)[0],
    "20k exact": sample_torus(20_000, rng)[0],
    "20k noisy": sample_torus(20_000, rng)[0] + rng.normal(0, 0.02, (20_000, 3)),
}
hole = sample_torus(20_000, rng)[0]
cases["20k, hole"] = hole[hole[:, 0] < 0.8]          # a scanner never saw the +x side
for name, A in cases.items():
    cd, p, r, f = chamfer_fscore(A, ref, tau=0.02)
    print("%-10s n=%6d  CD=%.4f  precision=%.3f recall=%.3f F=%.3f" % (name, len(A), cd, p, r, f))


def farthest_point_sampling(P, m, first=0):
    """Greedy FPS: each new sample is the point farthest from all samples chosen so far."""
    idx = np.zeros(m, dtype=int); idx[0] = first
    d = np.linalg.norm(P - P[first], axis=1)
    for i in range(1, m):
        idx[i] = np.argmax(d)
        d = np.minimum(d, np.linalg.norm(P - P[idx[i]], axis=1))
    return idx


cloud = sample_torus(20_000, np.random.default_rng(2))[0]
i_fps = farthest_point_sampling(cloud, 256)
i_rnd = np.random.default_rng(3).choice(len(cloud), 256, replace=False)
for name, idx in (("random", i_rnd), ("FPS", i_fps)):
    gap = cKDTree(cloud[idx]).query(cloud)[0]        # distance of every point to its nearest sample
    print("%-6s 256 samples: mean gap %.3f, largest gap %.3f" % (name, gap.mean(), gap.max()))


# ---- section 4: meshes -------------------------------------------------------------------
def torus_mesh(n, m):
    """Triangle mesh of the torus: n segments around the ring, m around the tube."""
    PH, TH = np.meshgrid(2 * np.pi * np.arange(n) / n, 2 * np.pi * np.arange(m) / m, indexing="ij")
    rho = R_MAJ + R_MIN * np.cos(TH)
    V = np.stack([rho * np.cos(PH), rho * np.sin(PH), R_MIN * np.sin(TH)], -1).reshape(-1, 3)
    i, j = np.meshgrid(np.arange(n), np.arange(m), indexing="ij")
    a, b = i * m + j, (i + 1) % n * m + j            # the four corners of quad (i, j)
    c, d = (i + 1) % n * m + (j + 1) % m, i * m + (j + 1) % m
    F = np.concatenate([np.stack([a, b, c], -1).reshape(-1, 3), np.stack([a, c, d], -1).reshape(-1, 3)])
    return V, F


def sample_mesh(V, F, n, rng):
    """n points uniformly distributed over the mesh area (area-weighted face choice)."""
    A, B, C = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(B - A, C - A), axis=1)
    f = rng.choice(len(F), n, p=area / area.sum())
    s, t = np.sqrt(rng.uniform(size=n)), rng.uniform(size=n)   # sqrt makes it uniform in area
    return ((1 - s)[:, None] * A[f] + (s * (1 - t))[:, None] * B[f] + (s * t)[:, None] * C[f]), area.sum()


rng = np.random.default_rng(4)
for n, m in ((12, 6), (24, 12), (48, 24), (96, 48)):
    V, F = torus_mesh(n, m)
    S, area = sample_mesh(V, F, 200_000, rng)
    sag = (R_MAJ + R_MIN) * (1 - np.cos(np.pi / n)) + R_MIN * (1 - np.cos(np.pi / m))
    print("n=%2d m=%2d  V=%5d F=%5d  %6.1f kB  area err %+.2f%%  max dev %.4f (sag bound %.4f)  mean dev %.4f"
          % (n, m, len(V), len(F), (12 * len(V) + 12 * len(F)) / 1000, 100 * (area / AREA - 1),
             np.abs(sdf_torus(S)).max(), sag, np.abs(sdf_torus(S)).mean()))
V, F = torus_mesh(24, 12)
E = np.unique(np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1), axis=0)
print("Euler characteristic V - E + F = %d - %d + %d = %d" % (len(V), len(E), len(F), len(V) - len(E) + len(F)))


# ---- section 5: voxels and octrees -----------------------------------------------------------
import itertools

LO, HI = -1.5, 1.5                                   # the cube that holds the torus


def grid_centres(N):
    h = (HI - LO) / N
    c = LO + h * (np.arange(N) + 0.5)
    return np.stack(np.meshgrid(c, c, c, indexing="ij"), -1), h


for N in (16, 32, 64, 128):
    X, h = grid_centres(N)
    occ = sdf_torus(X) < 0                           # occupancy: is the voxel centre inside?
    pad = np.pad(occ, 1)
    nb_empty = sum(~np.roll(pad, s, a)[1:-1, 1:-1, 1:-1] for a in range(3) for s in (-1, 1))
    surf = occ & (nb_empty > 0)                      # occupied with an empty face neighbour
    print("N=%3d  occupied %7d (%.2f%%)  surface %6d  volume err %+.2f%%  bits %7.1f kB  floats %8.1f kB"
          % (N, occ.sum(), 100 * occ.mean(), surf.sum(), 100 * (occ.sum() * h ** 3 / VOLUME - 1),
             N ** 3 / 8 / 1000, 4 * N ** 3 / 1000))

OFFS = np.array(list(itertools.product((-1, 1), repeat=3)), float)   # the 8 child directions


def octree_levels(sdf, max_depth):
    """Node count per level of an octree that only splits cells the surface may cross."""
    centres, half = np.zeros((1, 3)), (HI - LO) / 2
    counts = []
    for depth_ in range(max_depth + 1):
        counts.append(len(centres))
        if depth_ == max_depth:
            break
        # 1-Lipschitz SDF: if |f(centre)| > half-diagonal, the surface cannot enter the cell
        cross = np.abs(sdf(centres)) <= np.sqrt(3) * half
        centres = (centres[cross][:, None, :] + 0.5 * half * OFFS[None]).reshape(-1, 3)
        half = half / 2
    return counts


cnt = octree_levels(sdf_torus, 8)
print("octree nodes per level:", cnt)
print("total %d nodes vs %d dense voxels at 256^3 (%.2f%%)" % (sum(cnt), 256 ** 3, 100 * sum(cnt) / 256 ** 3))


def logodds(p):
    return np.log(p / (1 - p))


l_hit, l_miss = logodds(0.7), logodds(0.4)           # sensor model: P(occ | hit), P(occ | pass-through)
l = 0.0                                              # prior p = 0.5
for z in ("hit", "hit", "hit", "miss"):
    l = np.clip(l + (l_hit if z == "hit" else l_miss), -2.0, 3.5)
    print("%-4s l = %+.3f  p = %.3f" % (z, l, 1 / (1 + np.exp(-l))))


# ---- section 6: signed distance fields --------------------------------------------------------
def sdf_grid(N):
    """The SDF sampled at the (N+1)^3 vertices of an N^3 grid."""
    g = np.linspace(LO, HI, N + 1)
    return sdf_torus(np.stack(np.meshgrid(g, g, g, indexing="ij"), -1)), (HI - LO) / N


def trilinear(G, h, p):
    """Trilinear interpolation of grid values G at points p (M x 3)."""
    s = (p - LO) / h
    i = np.clip(np.floor(s).astype(int), 0, G.shape[0] - 2)
    f = s - i
    val = 0.0
    for c in itertools.product((0, 1), repeat=3):
        w = np.prod([f[:, k] if c[k] else 1 - f[:, k] for k in range(3)], axis=0)
        val = val + w * G[i[:, 0] + c[0], i[:, 1] + c[1], i[:, 2] + c[2]]
    return val


def zero_crossings(G, h):
    """Points where the field changes sign along grid edges: the vertices marching cubes places."""
    out_ = []
    for ax in range(3):
        f0 = np.take(G, np.arange(G.shape[ax] - 1), axis=ax)
        f1 = np.take(G, np.arange(1, G.shape[ax]), axis=ax)
        idx = np.argwhere((f0 < 0) != (f1 < 0))
        a, b = f0[tuple(idx.T)], f1[tuple(idx.T)]
        p = idx.astype(float)
        p[:, ax] += a / (a - b)                      # linear interpolation along the edge
        out_.append(LO + h * p)
    return np.concatenate(out_)


G16, h16 = sdf_grid(16)
x_q = np.array([[0.62, 0.05, 0.11]])
print("at", x_q[0], ": trilinear %.4f, exact %.4f" % (trilinear(G16, h16, x_q)[0], sdf_torus(x_q)[0]))
for N in (16, 32, 64, 128):
    G, h = sdf_grid(N)
    Z = zero_crossings(G, h)
    print("N=%3d  h=%.4f  crossings %6d  mean |sdf| %.5f  max %.5f  |f_hat| at true surface: mean %.5f"
          % (N, h, len(Z), np.abs(sdf_torus(Z)).mean(), np.abs(sdf_torus(Z)).max(),
             np.abs(trilinear(G, h, P_true)).mean()))
print("TSDF band: voxels with |sdf| < 3h at N=128: %.2f%% of the grid"
      % (100 * np.mean(np.abs(sdf_grid(128)[0]) < 3 * 3.0 / 128)))


# ---- section 7: a neural field in 2D --------------------------------------------------------
def sdf_polygon(p, Vp):
    """Exact SDF of a closed polygon Vp (k x 2) at points p (M x 2); negative inside."""
    d = np.full(len(p), np.inf); inside = np.zeros(len(p), bool)
    for a, b in zip(Vp, np.roll(Vp, 1, axis=0)):
        e, w = b - a, p - a
        t = np.clip(w @ e / (e @ e), 0, 1)
        d = np.minimum(d, np.linalg.norm(w - t[:, None] * e, axis=1))
        crosses = (a[1] > p[:, 1]) != (b[1] > p[:, 1])                  # even-odd rule
        x_hit = a[0] + (p[:, 1] - a[1]) * e[0] / (e[1] + 1e-300)
        inside ^= crosses & (p[:, 0] < x_hit)
    return np.where(inside, -d, d)


a_g = 2 * np.pi * (np.arange(64) + 0.5) / 64          # a gear with 16 teeth: 64 corners
GEAR = np.stack([np.cos(a_g), np.sin(a_g)], 1) * np.where(np.arange(64) // 2 % 2, 0.62, 0.8)[:, None]


def encode(x, L):
    """NeRF-style positional encoding: x, sin(2^k pi x), cos(2^k pi x) for k < L."""
    feats = [x]
    for k in range(L):
        feats += [np.sin(2 ** k * np.pi * x), np.cos(2 ** k * np.pi * x)]
    return np.concatenate(feats, 1)


def train_field(L, width=64, steps=4000, batch=1024, lr=3e-3, seed=0):
    """f(x) = W3 relu(W2 relu(W1 enc(x) + b1) + b2) + b3, fitted to the SDF with Adam."""
    rng = np.random.default_rng(seed)
    dims = [2 + 4 * L, width, width, 1]
    params = []
    for i in range(3):
        params += [rng.normal(0, np.sqrt(2 / dims[i]), (dims[i], dims[i + 1])), np.zeros(dims[i + 1])]
    m = [np.zeros_like(q) for q in params]; v = [np.zeros_like(q) for q in params]
    for it in range(1, steps + 1):
        x = rng.uniform(-1, 1, (batch, 2))
        y = sdf_polygon(x, GEAR)[:, None]
        h0 = encode(x, L)
        z1 = h0 @ params[0] + params[1]; h1 = np.maximum(z1, 0)
        z2 = h1 @ params[2] + params[3]; h2 = np.maximum(z2, 0)
        pred = h2 @ params[4] + params[5]
        g = 2 * (pred - y) / batch                                     # d(MSE)/d(pred)
        g2 = (g @ params[4].T) * (z2 > 0); g1 = (g2 @ params[2].T) * (z1 > 0)
        grads = [h0.T @ g1, g1.sum(0), h1.T @ g2, g2.sum(0), h2.T @ g, g.sum(0)]
        a_t = lr * (0.05 ** (it / steps))                              # exponential decay to 5%
        for q, gq, mq, vq in zip(params, grads, m, v):                 # Adam
            mq *= 0.9; mq += 0.1 * gq; vq *= 0.999; vq += 0.001 * gq ** 2
            q -= a_t * (mq / (1 - 0.9 ** it)) / (np.sqrt(vq / (1 - 0.999 ** it)) + 1e-8)

    def f(x):
        h = np.maximum(encode(x, L) @ params[0] + params[1], 0)
        return (np.maximum(h @ params[2] + params[3], 0) @ params[4] + params[5])[:, 0]
    return f, sum(q.size for q in params)


g2d = np.linspace(-1, 1, 201)
XY = np.stack(np.meshgrid(g2d, g2d, indexing="xy"), -1).reshape(-1, 2)
SDF_GEAR = sdf_polygon(XY, GEAR)
band = np.abs(SDF_GEAR) < 0.05                       # points within 0.05 of the boundary


def report(name, pred, n_floats):
    err = np.abs(pred - SDF_GEAR)
    iou = np.mean((pred < 0) & (SDF_GEAR < 0)) / np.mean((pred < 0) | (SDF_GEAR < 0))
    print("%-14s %5d floats  mean |error| %.4f  near the boundary %.4f  IoU %.4f"
          % (name, n_floats, err.mean(), err[band].mean(), iou))


FIELDS = {}
for L in (0, 2, 6):
    f, n_par = train_field(L)
    FIELDS[L] = f
    report("MLP, L=%d" % L, f(XY), n_par)

from scipy.interpolate import RegularGridInterpolator

gn = np.linspace(-1, 1, 70)                          # 70 x 70 = 4900 floats, like the L=2 MLP
GN = np.stack(np.meshgrid(gn, gn, indexing="ij"), -1).reshape(-1, 2)
grid_f = RegularGridInterpolator((gn, gn), sdf_polygon(GN, GEAR).reshape(70, 70))
report("grid 70x70", grid_f(XY), 70 * 70)


# ---- section 8: Gaussians ---------------------------------------------------------------------
from scipy.cluster.vq import kmeans2


def fit_gaussians(P, k, seed=0):
    """k anisotropic Gaussians fitted to a point cloud: k-means, then each cluster's covariance."""
    mu, lab = kmeans2(P, k, minit="++", seed=seed)
    cov = np.stack([np.cov(P[lab == j].T) + 1e-6 * np.eye(3) for j in range(k)])
    w = np.bincount(lab, minlength=k) / len(P)
    return mu, cov, w


Pg = sample_torus(20_000, np.random.default_rng(5))[0]
mu_g, cov_g, w_g = fit_gaussians(Pg, 100)
evals, evecs = np.linalg.eigh(cov_g)                 # ascending: column 0 = thinnest axis
n_at_mu = grad(sdf_torus, mu_g)
cosang = np.abs(np.sum(evecs[:, :, 0] * n_at_mu, 1)) / np.linalg.norm(n_at_mu, axis=1)
ang_g = np.degrees(np.arccos(np.clip(cosang, -1, 1)))
flat = np.sqrt(evals[:, 0] / evals[:, 2])
print("thinnest axis vs surface normal: median %.1f deg, max %.1f deg" % (np.median(ang_g), ang_g.max()))
print("thickness / length sigma ratio: median %.3f" % np.median(flat))
print("centres inside the tube by: median %.4f" % np.median(-sdf_torus(mu_g)))


# ---- section 12: PointNet and sparse convolution ---------------------------------------------
def pointnet_feature(P, Ws):
    """Shared per-point MLP (the same weights for every point), then max-pooling over points."""
    h = P
    for W_, b_ in Ws:
        h = np.maximum(h @ W_ + b_, 0)
    return h.max(axis=0), h.argmax(axis=0)          # global feature, which point won each channel


rng = np.random.default_rng(6)
Ws = [(rng.normal(0, 1, (3, 64)), rng.normal(0, 0.1, 64)),
      (rng.normal(0, 0.18, (64, 256)), rng.normal(0, 0.1, 256))]
cloud2 = sample_torus(2_000, rng)[0]
g1, winners = pointnet_feature(cloud2, Ws)
g2, _ = pointnet_feature(cloud2[rng.permutation(2_000)], Ws)
crit = np.unique(winners)
g3, _ = pointnet_feature(cloud2[crit], Ws)
print("permuted input, same feature:", np.allclose(g1, g2))
print("critical points: %d of 2000; feature from them alone equal: %s" % (len(crit), np.allclose(g1, g3)))

from scipy import ndimage as ndi

X64, h64 = grid_centres(64)
active = np.abs(sdf_torus(X64)) < h64 / 2           # a thin shell of occupied voxels, like a scan
k3 = np.ones((3, 3, 3), bool)
counts_reg, a_ = [int(active.sum())], active
for layer in range(3):
    a_ = ndi.binary_dilation(a_, k3)                 # a regular sparse conv activates every site it touches
    counts_reg.append(int(a_.sum()))
print("active sites, regular sparse conv over 3 layers:", counts_reg)
print("submanifold sparse conv keeps %d; dense grid has %d" % (active.sum(), 64 ** 3))


# ============================================================================================
# Figure-only helpers (not in the post)
# ============================================================================================
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402
from matplotlib.colors import LightSource  # noqa: E402

LIGHT = np.array([0.4, -0.5, 0.75]); LIGHT = LIGHT / np.linalg.norm(LIGHT)


def view3d(ax, lim=1.45, elev=32, azim=-62, zlim=None):
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim)
    zl = zlim if zlim is not None else (-lim * 0.55, lim * 0.55)
    ax.set_zlim(*zl)
    ax.set_box_aspect((2 * lim, 2 * lim, zl[1] - zl[0]))
    ax.view_init(elev=elev, azim=azim)
    ax.set_xticks([]); ax.set_yticks([]); ax.set_zticks([])
    ax.xaxis.pane.set_alpha(0.0); ax.yaxis.pane.set_alpha(0.0); ax.zaxis.pane.set_alpha(0.0)
    ax.grid(False)


def shade_faces(Vt, base):
    """Lambert shading of triangles Vt (F x 3 x 3) with a base RGB colour."""
    n = np.cross(Vt[:, 1] - Vt[:, 0], Vt[:, 2] - Vt[:, 0])
    n = n / np.linalg.norm(n, axis=1, keepdims=True)
    k = 0.35 + 0.65 * np.clip(n @ LIGHT, 0, 1)
    return np.clip(np.asarray(base)[None] * k[:, None], 0, 1)


def hex2rgb(h):
    return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def ellipsoid_mesh(mu, cov, scale=1.5, nu=10, nv=6):
    w, Q = np.linalg.eigh(cov)
    u = np.linspace(0, 2 * np.pi, nu); v = np.linspace(0, np.pi, nv)
    xs = np.outer(np.cos(u), np.sin(v)); ys = np.outer(np.sin(u), np.sin(v)); zs = np.outer(np.ones(nu), np.cos(v))
    S = np.stack([xs, ys, zs], -1) * (scale * np.sqrt(w))
    return S @ Q.T + mu


def slice_xz(f2d, n=301, lim=1.5):
    g = np.linspace(-lim, lim, n)
    XX, ZZ = np.meshgrid(g, g, indexing="xy")
    return g, f2d(np.stack([XX, np.zeros_like(XX), ZZ], -1))


def circles_xz(ax, **kw):
    t = np.linspace(0, 2 * np.pi, 200)
    for cx in (-R_MAJ, R_MAJ):
        ax.plot(cx + R_MIN * np.cos(t), R_MIN * np.sin(t), **kw)


# ---- shaded colour images of the depth scene (for the MPI figure) ----------------------------
SKY = np.array([0.93, 0.95, 1.0])


def render_rgb(K_, R_, t_, W, H):
    depth_, range_ = render_depth(K_, R_, t_, W, H, sdf_scene)
    u, v = np.meshgrid(np.arange(W, dtype=float), np.arange(H, dtype=float))
    rays = np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(K_).T @ R_
    rays = rays / np.linalg.norm(rays, axis=-1, keepdims=True)
    C_ = -R_.T @ t_
    img = np.tile(SKY, (H, W, 1))
    hit = np.isfinite(depth_)
    X = C_ + range_[hit][:, None] * rays[hit]
    n = grad(sdf_scene, X); n = n / np.linalg.norm(n, axis=1, keepdims=True)
    on_torus = sdf_torus(X) < 1e-3
    checker = ((np.floor(X[:, 0] / 0.4) + np.floor(X[:, 1] / 0.4)) % 2)[:, None]
    albedo = np.where(on_torus[:, None], hex2rgb(C["b"]), 0.55 + 0.3 * checker * np.ones(3))
    img[hit] = np.clip(albedo * (0.3 + 0.7 * np.clip(n @ LIGHT, 0, 1))[:, None], 0, 1)
    return img, depth_


def mpi_from_rgbd(img, depth_, planes):
    """MPI from an RGB-D image: a pixel between planes i and i+1 (in inverse depth) gets alpha w on
    plane i and alpha 1 on plane i+1, both with its colour, so the reference view is reproduced."""
    D = len(planes)
    rgba = np.zeros((D,) + img.shape[:2] + (4,))
    disp = 1 / planes                                 # decreasing: plane 0 is the nearest
    v, u = np.indices(depth_.shape)
    hit = np.isfinite(depth_)
    dz = np.clip(np.where(hit, 1 / np.where(hit, depth_, 1), disp[-1]), disp[-1], disp[0])
    i = np.clip(np.searchsorted(-disp, -dz, side="right") - 1, 0, D - 2)   # disp[i] >= dz >= disp[i+1]
    w = (dz - disp[i + 1]) / (disp[i] - disp[i + 1])
    w = np.where(hit, w, 0.0)
    rgba[i, v, u, :3] = img; rgba[i, v, u, 3] = w
    rgba[i + 1, v, u, :3] = img; rgba[i + 1, v, u, 3] = 1.0
    return rgba


def render_mpi(rgba, planes, K_, R_rel, t_rel, W, H):
    """Novel view: intersect target rays with each plane z = d (reference frame), sample, composite."""
    u, v = np.meshgrid(np.arange(W, dtype=float), np.arange(H, dtype=float))
    rays = np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(K_).T     # target camera frame
    d_ref = rays @ R_rel                     # to reference frame: X_ref = R_rel^T (X_tgt - t_rel)
    o_ref = -R_rel.T @ t_rel
    acc = np.zeros((H, W, 3)); T = np.ones((H, W))
    for i, d in enumerate(planes):           # front to back
        s = (d - o_ref[2]) / d_ref[..., 2]
        X = o_ref + s[..., None] * d_ref
        uv = X @ K_.T
        ui = np.round(uv[..., 0] / uv[..., 2]).astype(int); vi = np.round(uv[..., 1] / uv[..., 2]).astype(int)
        inb = (ui >= 0) & (ui < W) & (vi >= 0) & (vi < H) & (s > 0)
        a = np.zeros((H, W)); c = np.zeros((H, W, 3))
        a[inb] = rgba[i, vi[inb], ui[inb], 3]; c[inb] = rgba[i, vi[inb], ui[inb], :3]
        acc += (T * a)[..., None] * c
        T *= 1 - a
    return acc, T


# ---- evaluation of the memory / accuracy trade-off ------------------------------------------------
P_eval = P_true[:50_000]
PHI_E = np.arctan2(P_eval[:, 1], P_eval[:, 0]) % (2 * np.pi)
TH_E = np.arctan2(P_eval[:, 2], np.hypot(P_eval[:, 0], P_eval[:, 1]) - R_MAJ) % (2 * np.pi)


def eval_points(n, seed=10):
    S = sample_torus(n, np.random.default_rng(seed))[0]
    gap = cKDTree(S).query(P_eval)[0]
    return 0.5 * (np.abs(sdf_torus(S)).mean() + gap.mean()), 12 * n


def eval_mesh(n, m, seed=11):
    V_, F_ = torus_mesh(n, m)
    S, _ = sample_mesh(V_, F_, 100_000, np.random.default_rng(seed))
    d_rep = np.abs(sdf_torus(S)).mean()
    s_, t_ = PHI_E / (2 * np.pi) * n, TH_E / (2 * np.pi) * m
    i, j = np.floor(s_).astype(int) % n, np.floor(t_).astype(int) % m
    fs, ft = s_ - np.floor(s_), t_ - np.floor(t_)
    a, b = i * m + j, (i + 1) % n * m + j
    c, d = (i + 1) % n * m + (j + 1) % m, i * m + (j + 1) % m
    third = np.where(fs >= ft, b, d)                 # triangle abc if s >= t, else acd
    A, B, Cc = V_[a], V_[third], V_[c]
    nn = np.cross(B - A, Cc - A); nn = nn / np.linalg.norm(nn, axis=1, keepdims=True)
    d_true = np.abs(np.sum((P_eval - A) * nn, 1)).mean()
    return 0.5 * (d_rep + d_true), 12 * len(V_) + 12 * len(F_)


OFF5 = np.array(list(itertools.product(range(-2, 3), repeat=3)))


def eval_occupancy(N, seed=12):
    X, h = grid_centres(N)
    occ = sdf_torus(X) < 0
    rng_ = np.random.default_rng(seed)
    S = []
    for ax in range(3):
        a_ = np.take(occ, np.arange(N - 1), axis=ax); b_ = np.take(occ, np.arange(1, N), axis=ax)
        idx = np.argwhere(a_ != b_)
        ctr = LO + h * (idx + 0.5); ctr[:, ax] += h / 2
        for _ in range(4):
            j = ctr + rng_.uniform(-h / 2, h / 2, ctr.shape) * (np.arange(3) != ax)
            S.append(j)
    S = np.concatenate(S)
    d_rep = np.abs(sdf_torus(S)).mean()
    cell = np.floor((P_eval - LO) / h).astype(int)
    d_true = np.empty(len(P_eval))
    for k0 in range(0, len(P_eval), 10_000):
        cc = cell[k0:k0 + 10_000]
        own = occ[cc[:, 0], cc[:, 1], cc[:, 2]]
        nb = np.clip(cc[:, None, :] + OFF5[None], 0, N - 1)
        other = occ[nb[..., 0], nb[..., 1], nb[..., 2]] != own[:, None]
        box_c = LO + h * (nb + 0.5)
        dd = np.linalg.norm(np.maximum(np.abs(P_eval[k0:k0 + 10_000, None] - box_c) - h / 2, 0), axis=-1)
        d_true[k0:k0 + 10_000] = np.where(other, dd, np.inf).min(1)
    return 0.5 * (d_rep + d_true.mean()), N ** 3 / 8


def eval_sdf(N):
    G, h = sdf_grid(N)
    Z = zero_crossings(G, h)
    e = 0.5 * (np.abs(sdf_torus(Z)).mean() + np.abs(trilinear(G, h, P_eval)).mean())
    neg = G < 0                                       # cells whose 8 corners do not share a sign
    cross = np.zeros((N, N, N), bool)
    for c in itertools.product((0, 1), repeat=3):
        cross |= neg[c[0]:c[0] + N, c[1]:c[1] + N, c[2]:c[2] + N] != neg[:N, :N, :N]
    blocks = np.unique(np.argwhere(cross) // 8, axis=0)
    return e, 4 * (N + 1) ** 3, len(blocks) * 8 ** 3 * 4


# ============================================================================================
# Figures
# ============================================================================================
def fig_overview(lang):
    fig = plt.figure(figsize=(13.5, 8.6))
    T = [label(lang, "point cloud (3000 points)", "点云（3000 个点）", "点群（3000 点）"),
         label(lang, "triangle mesh (576 triangles)", "三角网格（576 个三角形）", "三角形メッシュ（三角形 576 枚）"),
         label(lang, "voxels (16³ grid)", "体素（16³ 网格）", "ボクセル（16³ グリッド）"),
         label(lang, "SDF on the plane z = 0", "SDF 在 z = 0 平面上", "z = 0 平面上の SDF"),
         label(lang, "100 anisotropic Gaussians", "100 个各向异性高斯", "異方性ガウシアン 100 個"),
         label(lang, "depth map Z(u, v)", "深度图 Z(u, v)", "デプスマップ Z(u, v)")]
    # (a) points
    ax = fig.add_subplot(2, 3, 1, projection="3d")
    S = sample_torus(3000, np.random.default_rng(20))[0]
    ax.scatter(*S.T, s=2.5, c=S[:, 2], cmap="viridis", depthshade=False, rasterized=True)
    view3d(ax); ax.set_title(T[0], fontsize=14)
    # (b) mesh
    ax = fig.add_subplot(2, 3, 2, projection="3d")
    V_, F_ = torus_mesh(24, 12)
    Vt = V_[F_]
    pc = Poly3DCollection(Vt, facecolors=shade_faces(Vt, hex2rgb(C["a"]) * 0.6 + 0.4), edgecolors="#333", linewidths=0.3)
    pc.set_rasterized(True); ax.add_collection3d(pc)
    view3d(ax); ax.set_title(T[1], fontsize=14)
    # (c) voxels
    ax = fig.add_subplot(2, 3, 3, projection="3d")
    X16, _ = grid_centres(16)
    occ16 = sdf_torus(X16) < 0
    e_ = np.linspace(LO, HI, 17)
    xg, yg, zg = np.meshgrid(e_, e_, e_, indexing="ij")
    arts = ax.voxels(xg, yg, zg, occ16, facecolors=C["c"], edgecolors="#245", linewidth=0.3, shade=True,
                     lightsource=LightSource(azdeg=315, altdeg=50))
    for a_ in arts.values():
        a_.set_rasterized(True)
    view3d(ax); ax.set_title(T[2], fontsize=14)
    # (d) SDF slice z = 0
    ax = fig.add_subplot(2, 3, 4, projection="3d")
    g = np.linspace(-1.5, 1.5, 61)
    XX, YY = np.meshgrid(g, g)
    Fz = sdf_torus(np.stack([XX, YY, np.zeros_like(XX)], -1))
    cols = plt.get_cmap("RdBu")(0.5 + 0.5 * np.clip(Fz / 0.6, -1, 1))
    sf = ax.plot_surface(XX, YY, np.zeros_like(XX), facecolors=cols, shade=False, rstride=1, cstride=1, linewidth=0)
    sf.set_rasterized(True)
    t = np.linspace(0, 2 * np.pi, 200)
    for rr in (R_MAJ - R_MIN, R_MAJ + R_MIN):
        ax.plot(rr * np.cos(t), rr * np.sin(t), 0.01, color="k", lw=1.8)
    for lev in (0.2, 0.4):
        for rr in (R_MAJ - R_MIN - lev, R_MAJ + R_MIN + lev):
            if rr > 0:
                ax.plot(rr * np.cos(t), rr * np.sin(t), 0.01, color="k", lw=0.8, ls="--")
    view3d(ax); ax.set_title(T[3], fontsize=14)
    # (e) Gaussians
    ax = fig.add_subplot(2, 3, 5, projection="3d")
    hues = plt.get_cmap("tab20")(np.arange(100) % 20)
    for k in range(100):
        E = ellipsoid_mesh(mu_g[k], cov_g[k])
        s_ = ax.plot_surface(E[..., 0], E[..., 1], E[..., 2], color=hues[k], alpha=0.85, linewidth=0, shade=True)
        s_.set_rasterized(True)
    view3d(ax); ax.set_title(T[4], fontsize=14)
    # (f) depth map
    ax = fig.add_subplot(2, 3, 6)
    im = ax.imshow(np.where(valid, depth, np.nan), cmap="magma_r", interpolation="nearest")
    ax.set_xticks([0, 50, 100, 150]); ax.set_yticks([0, 50, 100])
    ax.set_xlabel("u"); ax.set_ylabel("v"); ax.grid(False)
    cb = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.03); cb.set_label("Z (m)")
    ax.set_title(T[5], fontsize=14)
    fig.tight_layout()
    return fig


def fig_depth():
    fig = plt.figure(figsize=(15, 4.6))
    gs = fig.add_gridspec(1, 3, width_ratios=[1, 1, 1.35])
    ax = fig.add_subplot(gs[0])
    im = ax.imshow(np.where(valid, depth, np.nan), cmap="magma_r", interpolation="nearest")
    ax.grid(False); ax.set_xlabel("$u$"); ax.set_ylabel("$v$")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.03).set_label("$Z$ (m)")
    ax.set_title("$Z(u, v)$")
    ax = fig.add_subplot(gs[1])
    nm = np.where(np.isfinite(nc) & valid[..., None], 0.5 + 0.5 * nc * np.array([1, -1, -1]), 1.0)
    ax.imshow(np.clip(nm, 0, 1), interpolation="nearest")
    bad = np.zeros_like(valid); bad[ok] = ang > 10
    vv, uu = np.nonzero(bad)
    ax.scatter(uu, vv, s=2, color="k", label="> 10°")
    ax.legend(loc="lower left", fontsize=11, markerscale=4)
    ax.grid(False); ax.set_xlabel("$u$"); ax.set_ylabel("$v$")
    ax.set_title(r"$\mathbf{n}(u, v)$")
    ax = fig.add_subplot(gs[2], projection="3d")
    sel = np.random.default_rng(21).choice(len(pts), 5000, replace=False)
    ax.scatter(*pts[sel].T, s=1.2, c=depth[valid][sel], cmap="magma_r", depthshade=False, rasterized=True)
    cs = np.array([[0, 0, 1], [W_IMG - 1, 0, 1], [W_IMG - 1, H_IMG - 1, 1], [0, H_IMG - 1, 1]], float)
    Xc = (np.linalg.inv(K) @ cs.T) * 0.8              # image corners at depth 0.8
    Xw = (R_cam.T @ (Xc - t_cam[:, None])).T
    for k in range(4):
        ax.plot(*np.stack([C_cam, Xw[k]]).T, color=C["a"], lw=1.4)
        ax.plot(*np.stack([Xw[k], Xw[(k + 1) % 4]]).T, color=C["a"], lw=1.4)
    for i_, col in enumerate((C["x"], C["y"], C["z"])):
        ax.quiver(*C_cam, *(0.5 * R_cam[i_]), color=col, lw=2, arrow_length_ratio=0.2)
    ax.set_xlim(-2, 2); ax.set_ylim(-3.1, 2); ax.set_zlim(-0.6, 1.9)
    ax.set_box_aspect((4, 5.1, 2.5), zoom=1.35); ax.view_init(elev=24, azim=-35)
    ax.set_xticks([]); ax.set_yticks([]); ax.set_zticks([])
    ax.set_title(r"$\mathbf{X}_w = R^\top(Z\,K^{-1}\tilde{\mathbf{u}} - \mathbf{t})$", fontsize=14)
    fig.tight_layout()
    return fig


def fig_mpi():
    planes = mpi_planes(2.2, 6.0, 16)
    img0, dep0 = render_rgb(K, R_cam, t_cam, W_IMG, H_IMG)
    rgba = mpi_from_rgbd(img0, dep0, planes)
    C1 = C_cam + 0.5 * R_cam[0]                       # move 0.5 m to the camera's right
    t1 = -R_cam @ C1
    img1, _ = render_rgb(K, R_cam, t1, W_IMG, H_IMG)
    t_rel = t1 - t_cam                                # X_tgt = X_ref + t_rel (R_rel = I)
    mpi1, Tleft = render_mpi(rgba, planes, K, np.eye(3), t_rel, W_IMG, H_IMG)
    hole = Tleft > 0.5
    err = np.abs(mpi1 - img1).mean(-1)
    print("MPI: %d planes at" % len(planes), np.round(planes, 2))
    print("MPI novel view (0.5 m right): holes %.1f%% of pixels, mean |error| elsewhere %.3f, "
          "pixels with error > 0.1: %.1f%%" % (100 * hole.mean(), err[~hole].mean(), 100 * np.mean(err[~hole] > 0.1)))
    fig, axs = plt.subplots(1, 4, figsize=(15, 3.6), gridspec_kw=dict(width_ratios=[1, 1.15, 1, 1]))
    axs[0].imshow(img0); axs[0].set_title("$I_{\\mathrm{ref}}$")
    ax = axs[1]
    chk = ((np.indices((H_IMG, W_IMG)) // 8).sum(0) % 2)[..., None] * 0.15 + 0.8
    tiles = []
    for i in (2, 6, 10, 15):
        a_ = rgba[i, ..., 3:4]
        tiles.append(rgba[i, ..., :3] * a_ + chk * (1 - a_))
    mosaic = np.concatenate([np.concatenate(tiles[:2], 1), np.concatenate(tiles[2:], 1)], 0)
    ax.imshow(mosaic)
    for i, (yy, xx) in zip((2, 6, 10, 15), ((0, 0), (0, 1), (1, 0), (1, 1))):
        ax.text(xx * W_IMG + 6, yy * H_IMG + 18, "$d_{%d} = %.2f$" % (i, planes[i]), fontsize=11,
                bbox=dict(fc="white", ec="none", alpha=0.8, pad=1))
    ax.set_title("$(\\mathbf{c}_i, \\alpha_i)$")
    show = mpi1.copy(); show[hole] = [1.0, 0.0, 1.0]
    axs[2].imshow(np.clip(show, 0, 1)); axs[2].set_title("MPI $\\rightarrow I_{\\mathrm{new}}$")
    axs[3].imshow(img1); axs[3].set_title("$I_{\\mathrm{new}}$ (ray traced)")
    for ax in axs:
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    fig.tight_layout()
    return fig


def fig_points(lang):
    fig = plt.figure(figsize=(14, 4.8))
    for k, (nm, idx) in enumerate(((label(lang, "random, 256", "随机，256 个", "ランダム、256 点"), i_rnd),
                                    (label(lang, "farthest point sampling, 256", "最远点采样，256 个", "最遠点サンプリング、256 点"), i_fps))):
        ax = fig.add_subplot(1, 3, k + 1, projection="3d")
        gap = cKDTree(cloud[idx]).query(cloud)[0]
        ax.scatter(*cloud[::4].T, s=1, c=gap[::4], cmap="Greys", vmin=0, vmax=0.35, depthshade=False, rasterized=True)
        ax.scatter(*cloud[idx].T, s=14, color=C["x"], depthshade=False)
        view3d(ax, elev=55)
        ax.set_title("%s\n%s %.3f, max %.3f" % (nm, label(lang, "mean gap", "平均间隙", "平均ギャップ"), gap.mean(), gap.max()), fontsize=13)
    ax = fig.add_subplot(1, 3, 3)
    names = list(cases.keys())
    vals = np.array([chamfer_fscore(cases[nm_], ref, 0.02)[1:] for nm_ in names])
    x = np.arange(len(names)); wb = 0.26
    for j, (lab_, col) in enumerate(zip((label(lang, "precision", "精确率", "適合率"), label(lang, "recall", "召回率", "再現率"), "F"),
                                        (C["z"], C["b"], C["a"]))):
        ax.bar(x + (j - 1) * wb, vals[:, j], wb, color=col, label=lab_)
    disp_names = {"2k exact": label(lang, "2k exact", "2k 精确", "2k 正確"), "20k exact": label(lang, "20k exact", "20k 精确", "20k 正確"),
                  "20k noisy": label(lang, "20k noisy", "20k 加噪", "20k ノイズ"), "20k, hole": label(lang, "20k, hole", "20k 有缺口", "20k 欠損")}
    ax.set_xticks(x); ax.set_xticklabels([disp_names[n_] for n_ in names], fontsize=12)
    ax.set_ylim(0, 1.15); ax.legend(fontsize=11, ncol=3, loc="upper center")
    ax.set_title(label(lang, "against the surface, τ = 0.02", "与真实表面比较，τ = 0.02", "真の表面と比較、τ = 0.02"), fontsize=13)
    fig.tight_layout()
    return fig


def fig_mesh():
    fig = plt.figure(figsize=(15, 4.4))
    norm = plt.Normalize(0, 0.1)
    for k, (n, m) in enumerate(((12, 6), (24, 12), (48, 24))):
        ax = fig.add_subplot(1, 4, k + 1, projection="3d")
        V_, F_ = torus_mesh(n, m)
        Vt = V_[F_]
        dev = np.abs(sdf_torus(Vt.mean(1)))          # sag at the triangle centroid
        col = plt.get_cmap("viridis")(norm(dev))[:, :3] * (0.55 + 0.45 * shade_faces(Vt, np.ones(3)))
        pc = Poly3DCollection(Vt, facecolors=col, edgecolors="#222", linewidths=0.25)
        pc.set_rasterized(True); ax.add_collection3d(pc)
        view3d(ax)
        ax.set_title("$%d \\times %d$, $F = %d$" % (n, m, len(F_)), fontsize=14)
    ax = fig.add_subplot(1, 4, 4)
    ns = np.array([6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192])
    Fs, dmax, bound = [], [], []
    rng_ = np.random.default_rng(30)
    for n in ns:
        V_, F_ = torus_mesh(n, n // 2)
        S, _ = sample_mesh(V_, F_, 100_000, rng_)
        Fs.append(len(F_)); dmax.append(np.abs(sdf_torus(S)).max())
        bound.append((R_MAJ + R_MIN) * (1 - np.cos(np.pi / n)) + R_MIN * (1 - np.cos(np.pi / (n // 2))))
    Fs = np.array(Fs, float)
    ax.loglog(Fs, dmax, "o-", color=C["a"], label="max $|d|$")
    ax.loglog(Fs, bound, "--", color=C["gray"], label="sag")
    ax.loglog(Fs, 60.0 / Fs, ":", color="k", lw=1.5, label="$\\propto F^{-1}$")
    ax.set_xlabel("$F$"); ax.legend(fontsize=12)
    print("mesh max deviation:", dict(zip(Fs.astype(int), np.round(dmax, 5))))
    sm = plt.cm.ScalarMappable(norm=norm, cmap="viridis")
    fig.tight_layout()
    fig.colorbar(sm, ax=fig.axes[:3], fraction=0.02, pad=0.01, location="left").set_label("$|d|$")
    return fig


def quadtree_2d(f2d, centre, half, depth_, max_depth, leaves):
    if depth_ == max_depth or abs(f2d(centre)) > np.sqrt(2) * half:
        leaves.append((centre, half, depth_, f2d(centre) < 0))
        return
    for o in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        quadtree_2d(f2d, centre + 0.5 * half * np.array(o), half / 2, depth_ + 1, max_depth, leaves)


def fig_octree(lang):
    from matplotlib.patches import Rectangle
    fig, axs = plt.subplots(1, 2, figsize=(13, 5.4), gridspec_kw=dict(width_ratios=[1.25, 1]))
    ax = axs[0]
    f2d = lambda q: float(sdf_torus(np.array([q[0], 0.0, q[1]])))
    leaves = []
    quadtree_2d(f2d, np.zeros(2), 1.5, 0, 6, leaves)
    for c_, hh, d_, ins in leaves:
        ax.add_patch(Rectangle(c_ - hh, 2 * hh, 2 * hh, fc=C["a"] if ins else "white", alpha=0.55 if ins else 1,
                               ec="#555", lw=0.5))
    circles_xz(ax, color="k", lw=1.5)
    ax.set_xlim(-1.5, 1.5); ax.set_ylim(-1.5, 1.5); ax.set_aspect("equal"); ax.grid(False)
    ax.set_xlabel("$x$"); ax.set_ylabel("$z$")
    ax.set_title(label(lang, "slice y = 0: %d quadtree leaves (64² = 4096 dense cells)",
                       "切片 y = 0：%d 个四叉树叶子（稠密为 64² = 4096 格）",
                       "断面 y = 0：四分木の葉 %d 個（密なら 64² = 4096 セル）") % len(leaves), fontsize=13)
    print("quadtree leaves (depth 6):", len(leaves))
    ax = axs[1]
    Ls = np.arange(len(cnt))
    ax.semilogy(Ls, 8.0 ** Ls, "s--", color=C["gray"], label=label(lang, "dense grid: 8^L", "稠密网格：8^L", "密グリッド：8^L"))
    ax.semilogy(Ls, cnt, "o-", color=C["a"], label=label(lang, "octree nodes at level L", "第 L 层的八叉树节点", "レベル L の八分木ノード"))
    ax.semilogy(Ls[3:], cnt[-1] * 4.0 ** (Ls[3:] - Ls[-1]), ":", color="k", label="∝ 4^L")
    for L_, c_ in zip(Ls[2::2], np.array(cnt)[2::2]):
        ax.annotate("%d" % c_, (L_, c_), textcoords="offset points", xytext=(6, -16), fontsize=11, color=C["a"])
    ax.set_xlabel(label(lang, "level L (cell size 3/2^L)", "层级 L（格子边长 3/2^L）", "レベル L（セル幅 3/2^L）"))
    ax.set_ylabel(label(lang, "number of cells", "格子数", "セル数"))
    ax.legend(fontsize=11, loc="upper left")
    fig.tight_layout()
    return fig


TRADE = {}


def compute_tradeoff():
    TRADE["points"] = [eval_points(n) for n in (500, 1000, 2000, 5000, 10_000, 20_000, 50_000)]
    TRADE["mesh"] = [eval_mesh(n, n // 2) for n in (8, 12, 16, 24, 32, 48, 64, 96, 128)]
    TRADE["occ"] = [eval_occupancy(N) for N in (16, 24, 32, 48, 64, 96, 128)]
    sd = [eval_sdf(N) for N in (8, 12, 16, 24, 32, 48, 64, 96, 128)]
    TRADE["sdf"] = [(e, m) for e, m, _ in sd]
    TRADE["sparse"] = [(e, b) for e, _, b in sd]
    for k, v in TRADE.items():
        print("trade-off %-6s" % k, ["%.5f@%.1fkB" % (e, m / 1000) for e, m in v])


def fig_sdf_occ(lang):
    fig, axs = plt.subplots(1, 3, figsize=(15, 4.6))
    N = 16
    X16, h = grid_centres(N)
    occ = sdf_torus(X16) < 0
    sl = occ[:, N // 2, :]                            # cells just beside y = 0 (centres at y = h/2)
    ax = axs[0]
    ax.imshow(sl.T, origin="lower", extent=(LO, HI, LO, HI), cmap="Purples", vmin=0, vmax=1.6, interpolation="nearest")
    for g_ in np.linspace(LO, HI, N + 1):
        ax.axvline(g_, color="#ccc", lw=0.5); ax.axhline(g_, color="#ccc", lw=0.5)
    circles_xz(ax, color="k", lw=1.6)
    ax.set_title(label(lang, "occupancy 16³: is the centre inside?", "占据栅格 16³：中心在内部吗？", "占有グリッド 16³：中心は内側か"), fontsize=13)
    ax = axs[1]
    G, h = sdf_grid(N)
    S2 = G[:, N // 2, :]                              # the node plane y = 0
    g = np.linspace(LO, HI, N + 1)
    fine = np.linspace(LO, HI, 321)
    interp = RegularGridInterpolator((g, g), S2)
    FX, FZ = np.meshgrid(fine, fine, indexing="ij")
    Fv = interp(np.stack([FX, FZ], -1))
    ax.imshow(Fv.T, origin="lower", extent=(LO, HI, LO, HI), cmap="RdBu", vmin=-0.8, vmax=0.8, interpolation="bilinear")
    GX, GZ = np.meshgrid(g, g, indexing="ij")
    ax.scatter(GX, GZ, s=7, c="k")
    ax.contour(FX, FZ, Fv, levels=[0], colors=[C["b"]], linewidths=2.4)
    circles_xz(ax, color="k", lw=1.2, ls="--")
    ax.set_title(label(lang, "SDF at 17² nodes and its zero level", "17² 个节点上的 SDF 及其零水平集", "17² 節点の SDF とそのゼロ等値線"), fontsize=13)
    for a_ in axs[:2]:
        a_.set_xlim(LO, HI); a_.set_ylim(-0.9, 0.9); a_.set_aspect("equal"); a_.grid(False)
        a_.set_xlabel("$x$"); a_.set_ylabel("$z$")
    ax = axs[2]
    No = np.array([16, 24, 32, 48, 64, 96, 128]); Ns = np.array([8, 12, 16, 24, 32, 48, 64, 96, 128])
    eo = np.array([e for e, _ in TRADE["occ"]]); es = np.array([e for e, _ in TRADE["sdf"]])
    ax.loglog(3.0 / No, eo, "s-", color=C["c"], label=label(lang, "occupancy", "占据栅格", "占有グリッド"))
    ax.loglog(3.0 / Ns, es, "o-", color=C["b"], label=label(lang, "SDF + interpolation", "SDF + 插值", "SDF + 補間"))
    hh = 3.0 / Ns
    ax.loglog(hh, 0.25 * hh, ":", color="k", lw=1.4, label="$h/4$")
    ax.loglog(hh, 0.2 * hh ** 2, "--", color=C["gray"], lw=1.4, label="$0.2\\,h^2$")
    ax.set_xticks([0.025, 0.05, 0.1, 0.2, 0.4]); ax.set_xticklabels(["0.025", "0.05", "0.1", "0.2", "0.4"])
    ax.minorticks_off()
    ax.set_xlabel(label(lang, "voxel size h", "体素边长 h", "ボクセル幅 h"))
    ax.set_ylabel(label(lang, "mean surface error", "平均表面误差", "平均表面誤差"))
    ax.legend(fontsize=11)
    fig.tight_layout()
    return fig


def fig_neural(lang):
    fig, axs = plt.subplots(1, 4, figsize=(15, 4.3))
    GX = XY[:, 0].reshape(201, 201); GY = XY[:, 1].reshape(201, 201)
    items = [("MLP, L = 0", FIELDS[0](XY)), ("MLP, L = 2", FIELDS[2](XY)), ("MLP, L = 6", FIELDS[6](XY)),
             (label(lang, "grid 70×70", "网格 70×70", "グリッド 70×70"), grid_f(XY))]
    for ax, (nm, pr) in zip(axs, items):
        err = np.abs(pr - SDF_GEAR).reshape(201, 201)
        im = ax.imshow(err, origin="lower", extent=(-1, 1, -1, 1), cmap="Greys", vmin=0, vmax=0.04)
        ax.contour(GX, GY, SDF_GEAR.reshape(201, 201), levels=[0], colors="k", linewidths=1.0)
        ax.contour(GX, GY, pr.reshape(201, 201), levels=[0], colors=[C["x"]], linewidths=1.6)
        iou = np.mean((pr < 0) & (SDF_GEAR < 0)) / np.mean((pr < 0) | (SDF_GEAR < 0))
        ax.set_title("%s\nIoU %.3f" % (nm, iou), fontsize=13)
        ax.set_xlim(-0.95, 0.95); ax.set_ylim(-0.95, 0.95)
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    cb = fig.colorbar(im, ax=axs, fraction=0.015, pad=0.01)
    cb.set_label("$|f_\\theta - f|$")
    return fig


def fig_gaussians():
    fig = plt.figure(figsize=(15, 4.6))
    ax = fig.add_subplot(1, 3, 1, projection="3d")
    hues = plt.get_cmap("tab20")(np.arange(100) % 20)
    for k in range(100):
        E = ellipsoid_mesh(mu_g[k], cov_g[k], scale=2.0)
        s_ = ax.plot_surface(E[..., 0], E[..., 1], E[..., 2], color=hues[k], alpha=0.9, linewidth=0, shade=True)
        s_.set_rasterized(True)
    view3d(ax, elev=40); ax.set_title("$\\pm 2\\sigma$", fontsize=14)
    ax = fig.add_subplot(1, 3, 2)
    g = np.linspace(-1.5, 1.5, 241)
    XX, ZZ = np.meshgrid(g, g, indexing="xy")
    Q = np.stack([XX, np.zeros_like(XX), ZZ], -1).reshape(-1, 3)
    dens = np.zeros(len(Q))
    for k in range(100):
        d_ = Q - mu_g[k]
        Ci = np.linalg.inv(cov_g[k])
        dens += w_g[k] * np.exp(-0.5 * np.einsum("ni,ij,nj->n", d_, Ci, d_)) / np.sqrt((2 * np.pi) ** 3 * np.linalg.det(cov_g[k]))
    ax.imshow(np.log10(dens.reshape(241, 241) + 1e-3), origin="lower", extent=(-1.5, 1.5, -1.5, 1.5), cmap="magma")
    circles_xz(ax, color="w", lw=1.0, ls="--")
    ax.set_xlim(-1.5, 1.5); ax.set_ylim(-0.75, 0.75); ax.grid(False)
    ax.set_xlabel("$x$"); ax.set_ylabel("$z$")
    ax.set_title("$\\log_{10} \\sum_k w_k \\mathcal{N}(\\mathbf{x}; \\boldsymbol{\\mu}_k, \\Sigma_k)$, $y = 0$", fontsize=13)
    ax = fig.add_subplot(1, 3, 3)
    ax.hist(ang_g, bins=np.arange(0, 6.5, 0.5), color=C["a"], alpha=0.85)
    ax.set_xlabel("$\\angle(\\mathbf{e}_{\\min}, \\mathbf{n})$ (°)")
    ax.axvline(np.median(ang_g), color="k", ls="--", lw=1.4)
    ax.set_title("median %.1f°, $\\sigma_{\\min}/\\sigma_{\\max}$ = %.2f" % (np.median(ang_g), np.median(flat)), fontsize=13)
    fig.tight_layout()
    return fig


def fig_tradeoff(lang):
    fig, ax = plt.subplots(figsize=(10, 6.2))
    spec = [("points", label(lang, "point cloud (12 B/point)", "点云（每点 12 B）", "点群（1 点 12 B）"), C["b"], "o"),
            ("mesh", label(lang, "triangle mesh (12 B/vertex + 12 B/face)", "三角网格（每顶点 12 B + 每面 12 B）", "三角形メッシュ（頂点 12 B + 面 12 B）"), C["a"], "^"),
            ("occ", label(lang, "occupancy grid, 1 bit/voxel", "占据栅格，每体素 1 bit", "占有グリッド、1 ボクセル 1 bit"), C["c"], "s"),
            ("sdf", label(lang, "dense SDF grid, float32", "稠密 SDF 网格，float32", "密な SDF グリッド、float32"), C["x"], "D"),
            ("sparse", label(lang, "sparse SDF, 8³ blocks near the surface", "稀疏 SDF，仅表面附近的 8³ 块", "疎な SDF、表面付近の 8³ ブロックのみ"), C["y"], "v")]
    for key, nm, col, mk in spec:
        e = np.array([v[0] for v in TRADE[key]]); m = np.array([v[1] for v in TRADE[key]])
        ax.loglog(m, e, mk + "-", color=col, label=nm, ms=7)
    ax.set_xlabel(label(lang, "memory (bytes)", "内存（字节）", "メモリ（バイト）"))
    ax.set_ylabel(label(lang, "mean two-sided surface error", "双向平均表面误差", "双方向の平均表面誤差"))
    ax.legend(fontsize=11, loc="lower left")
    ax.grid(True, which="both", alpha=0.2)
    fig.tight_layout()
    return fig


def fig_sparse(lang):
    from matplotlib.colors import ListedColormap
    fig, axs = plt.subplots(1, 2, figsize=(13, 5.0), gridspec_kw=dict(width_ratios=[1.2, 1]))
    ax = axs[0]
    a0 = active; a1 = ndi.binary_dilation(a0, k3); a2 = ndi.binary_dilation(a1, k3)
    zc = 32                                            # the voxel layer just above z = 0
    img = np.zeros((64, 64))
    img[a2[:, :, zc]] = 1; img[a1[:, :, zc]] = 2; img[a0[:, :, zc]] = 3
    cmap = ListedColormap(["white", "#f6d7a7", C["b"], C["dark"]])
    ax.imshow(img.T, origin="lower", cmap=cmap, vmin=-0.5, vmax=3.5, extent=(LO, HI, LO, HI), interpolation="nearest")
    ax.set_xlabel("$x$"); ax.set_ylabel("$y$"); ax.grid(False)
    ax.set_title(label(lang, "slice z = h/2: input (black), after 1 and 2 convs", "切片 z = h/2：输入（黑），1 层与 2 层卷积之后",
                       "断面 z = h/2：入力（黒）、畳み込み 1 層後と 2 層後"), fontsize=13)
    ax = axs[1]
    Ls = np.arange(4)
    ax.semilogy(Ls, counts_reg, "o-", color=C["b"], label=label(lang, "regular sparse conv", "普通稀疏卷积", "通常のスパース畳み込み"))
    ax.semilogy(Ls, [counts_reg[0]] * 4, "s-", color=C["dark"], label=label(lang, "submanifold sparse conv", "子流形稀疏卷积", "サブマニフォールド・スパース畳み込み"))
    ax.semilogy(Ls, [64 ** 3] * 4, "--", color=C["gray"], label=label(lang, "dense 64³ grid", "稠密 64³ 网格", "密な 64³ グリッド"))
    for L_, c_ in zip(Ls, counts_reg):
        ax.annotate("%d" % c_, (L_, c_), textcoords="offset points", xytext=(6, -16) if L_ == 0 else (4, 8),
                    fontsize=11, color=C["b"])
    ax.set_xticks(Ls); ax.set_xlabel(label(lang, "number of 3×3×3 layers", "3×3×3 卷积层数", "3×3×3 層の数"))
    ax.set_ylabel(label(lang, "active sites", "活跃位置数", "アクティブなサイト数"))
    ax.set_ylim(3e3, 4e6); ax.legend(fontsize=11, loc="upper left")
    fig.tight_layout()
    return fig


if __name__ == "__main__":
    only = os.environ.get("FIGS")                    # e.g. FIGS=mpi,depth renders only those
    want = (lambda k: True) if not only else (lambda k: k in only.split(","))
    compute_tradeoff()
    if want("overview"): loc(fig_overview, "08-overview.svg")
    if want("depth"): out(fig_depth(), "08-depth.svg")
    if want("mpi"): out(fig_mpi(), "08-mpi.svg")
    if want("points"): loc(fig_points, "08-point-clouds.svg")
    if want("mesh"): out(fig_mesh(), "08-mesh.svg")
    if want("octree"): loc(fig_octree, "08-octree.svg")
    if want("sdf"): loc(fig_sdf_occ, "08-sdf-vs-occupancy.svg")
    if want("neural"): loc(fig_neural, "08-neural-field.svg")
    if want("gaussians"): out(fig_gaussians(), "08-gaussians.svg")
    if want("tradeoff"): loc(fig_tradeoff, "08-tradeoff.svg")
    if want("sparse"): loc(fig_sparse, "08-sparse-conv.svg")
