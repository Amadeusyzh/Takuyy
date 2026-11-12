"""Figures for 3d-vision post 07: depth estimation and multi-view stereo.

Run from anywhere:
    python3 bin/figures/3d-vision/vision3d_07.py            # writes the SVGs
    python3 bin/figures/3d-vision/vision3d_07.py /tmp/prev  # ... and PNG previews into /tmp/prev

Every number shown in a figure (and quoted in the post's captions) is computed here, from the
post's own code, which is copied verbatim below in the order of the post (the ray-cast scene,
backproject, the sensor snippets, the plane sweep, PatchMatch, soft-argmin, monocular alignment,
TSDF fusion), including the print statements whose output the post quotes.
Conventions as in posts 01-03: OpenCV camera frame (x right, y down, z forward), X_c = R X + t,
pixel (x, y) is img[y, x]. The whole script takes about a minute.
"""
import os
import sys
import pathlib

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

PAL = C  # the palette; the post's code below reuses the name C for the cost volume

plt.rcParams["svg.hashsalt"] = "3d-vision-07"  # stable element ids

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
# ---- scene ----------------------------------------------------------------------
import numpy as np
from scipy import ndimage as ndi

W, H, F = 160, 120, 150.0                       # image size and focal length (pixels)
K = np.array([[F, 0, (W - 1) / 2], [0, F, (H - 1) / 2], [0, 0, 1.0]])
LIGHT = np.array([-0.4, -0.7, -0.6]) / np.linalg.norm([-0.4, -0.7, -0.6])
_lat = np.random.default_rng(7).uniform(0, 1, (64, 64))


def value_noise(u, v):
    """Random texture in [0, 1]: 3 octaves of bilinearly interpolated lattice noise."""
    out = np.zeros_like(u)
    for freq, amp in ((3.0, 0.3), (8.0, 0.35), (18.0, 0.35)):
        x, y = u * freq, v * freq
        x0, y0 = np.floor(x), np.floor(y)
        fx, fy = x - x0, y - y0
        i, j = x0.astype(int) % 64, y0.astype(int) % 64
        a, b = _lat[j, i], _lat[j, (i + 1) % 64]
        c, d = _lat[(j + 1) % 64, i], _lat[(j + 1) % 64, (i + 1) % 64]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
    return np.clip(0.5 + 2.0 * (out - 0.5), 0.0, 1.0)              # stretch the contrast


def look_at(C, target, up=(0.0, -1.0, 0.0)):
    """World-to-camera R, t (OpenCV axes: x right, y down, z forward) of a camera at C."""
    z = np.asarray(target, float) - C
    z /= np.linalg.norm(z)
    x = np.cross(z, up)
    x /= np.linalg.norm(x)
    R = np.stack([x, np.cross(z, x), z])
    return R, -R @ C


def wall_albedo(P):
    a = 0.15 + 0.8 * value_noise(0.5 * P[:, 0] + 3.1, 0.5 * P[:, 1] + 5.3)
    poster = (P[:, 0] > 0.2) & (P[:, 0] < 2.2) & (P[:, 1] > -1.8) & (P[:, 1] < -0.7)
    a[poster] = 0.62                                               # textureless poster
    st = (P[:, 0] > -3.0) & (P[:, 0] < -1.1) & (P[:, 1] > -1.8) & (P[:, 1] < -0.4)
    a[st] = 0.3 + 0.4 * (np.sin(2 * np.pi * P[st, 0] / 0.3) > 0)   # vertical stripes
    return a


def intersect(o, d):
    """Ray-cast the scene from o along unit directions d (N, 3): distance, normal, albedo."""
    n = len(d)
    t, nrm, alb = np.full(n, np.inf), np.zeros((n, 3)), np.zeros(n)

    def hit(tc, normal, albedo):
        m = (tc > 1e-6) & (tc < t)
        P = o + tc[m, None] * d[m]
        t[m] = tc[m]
        nrm[m] = normal(P) if callable(normal) else normal
        alb[m] = albedo(P)

    with np.errstate(divide="ignore", invalid="ignore"):
        hit((6.5 - o[2]) / d[:, 2], np.array([0, 0, -1.0]), wall_albedo)        # wall z = 6.5
        hit((1.2 - o[1]) / d[:, 1], np.array([0, -1.0, 0]),                     # floor y = 1.2
            lambda P: 0.2 + 0.7 * value_noise(0.5 * P[:, 0] + 11.0, 0.5 * P[:, 2]))
        lo, hi = np.array([-1.6, 0.2, 3.2]), np.array([-0.5, 1.2, 4.3])         # box
        t1, t2 = (lo - o) / d, (hi - o) / d
        tn, tf = np.minimum(t1, t2).max(1), np.maximum(t1, t2).min(1)

        def box_normal(P):
            q = (P - (lo + hi) / 2) / ((hi - lo) / 2)
            k = np.abs(q).argmax(1)
            N = np.zeros_like(P)
            N[np.arange(len(P)), k] = np.sign(q[np.arange(len(P)), k])
            return N
        hit(np.where((tn < tf) & (tn > 0), tn, np.inf), box_normal,
            lambda P: 0.15 + 0.8 * value_noise(P[:, 0] + P[:, 2] + 20.0, P[:, 1] + 0.6 * P[:, 2]))
        c, r = np.array([1.0, 0.4, 3.6]), 0.8                                   # sphere
        b = d @ (o - c)
        disc = b * b - ((o - c) @ (o - c) - r * r)
        hit(np.where(disc > 0, -b - np.sqrt(np.abs(disc)), np.inf), lambda P: (P - c) / r,
            lambda P: 0.2 + 0.75 * value_noise(1.2 * np.arctan2(P[:, 0] - c[0], P[:, 2] - c[2]) + 30.0,
                                               1.5 * P[:, 1]))
    return t, nrm, alb


def render(R, t, ss=3, noise=0.01, seed=0):
    """Image and z-depth (H, W) of the camera X_c = R X + t; Lambertian, 3x3 supersampled."""
    C = -R.T @ t
    ys, xs = (np.mgrid[0:H * ss, 0:W * ss] + 0.5) / ss - 0.5
    rays = np.linalg.inv(K) @ np.stack([xs.ravel(), ys.ravel(), np.ones(xs.size)])
    d = (R.T @ rays).T
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    tt, nrm, alb = intersect(C, d)
    shade = alb * (0.35 + 0.65 * np.clip(nrm @ LIGHT, 0, 1))
    img = shade.reshape(H, ss, W, ss).mean((1, 3))
    img += np.random.default_rng(seed).normal(0, noise, img.shape)
    depth = (rays[2] * tt / np.linalg.norm(rays, axis=0)).reshape(H * ss, W * ss)  # z = t cos
    return img, depth[ss // 2::ss, ss // 2::ss]                  # depth at pixel centres


TARGET = np.array([0.0, 0.4, 4.5])
C_ref = np.array([0.0, -0.6, 0.0])              # reference camera, 1.8 m above the floor
R_ref, t_ref = look_at(C_ref, TARGET)
I_ref, Z_gt = render(R_ref, t_ref, seed=0)
OFFSETS = [(0.40, 0.0, 0.0), (-0.25, 0.0, 0.0), (0.05, -0.30, 0.0), (-0.10, 0.28, 0.0)]
src = []                                        # (image, R, t) of the 4 source views
for i, off in enumerate(OFFSETS):
    R_s, t_s = look_at(C_ref + off, TARGET)
    src.append((render(R_s, t_s, seed=i + 1)[0], R_s, t_s))
print("depth range of the reference view: %.2f .. %.2f m" % (Z_gt.min(), Z_gt.max()))


# ---- backproject ----------------------------------------------------------------------
def backproject(depth, K):
    """z-depth map (H, W) -> 3D points (H, W, 3) in the camera frame: X = z K^-1 (x, y, 1)."""
    h, w = depth.shape
    ys, xs = np.mgrid[0:h, 0:w]
    rays = np.stack([xs, ys, np.ones_like(xs)], -1) @ np.linalg.inv(K).T   # rays with z = 1
    return rays * depth[..., None]


X_cam = backproject(Z_gt, K)
rng_len = np.linalg.norm(X_cam, axis=-1)                 # distance along the ray ("range")
print("pixel (0, 0):   z = %.3f m, range = %.3f m, ratio %.4f"
      % (Z_gt[0, 0], rng_len[0, 0], rng_len[0, 0] / Z_gt[0, 0]))
print("pixel (80, 60): z = %.3f m, range = %.3f m" % (Z_gt[60, 80], rng_len[60, 80]))
X_world = (X_cam - t_ref) @ R_ref                        # X = R^T (X_c - t), row-wise
print("lowest floor point: world y = %.3f m (the floor is y = 1.2)" % X_world[..., 1].max())


# ---- stereo ----------------------------------------------------------------------
def stereo_depth_sigma(Z, f, B, sigma_d):
    """First-order depth noise of a rectified stereo pair: Z = f B / d -> dZ = Z^2 / (f B) dd."""
    return Z ** 2 / (f * B) * sigma_d


for B in (0.05, 0.12):
    print("B = %.2f m:" % B, ", ".join("Z = %g m -> %.1f cm" % (Z, 100 * stereo_depth_sigma(Z, 600, B, 0.2))
                                       for Z in (1, 2, 5)))


# ---- tof ----------------------------------------------------------------------
c_light = 299_792_458.0


def tof_samples(d, f_mod, A=1.0, B=2.0, sigma=0.0, rng=None):
    """Four correlation samples of an AMCW ToF pixel at phase offsets 0, 90, 180, 270 degrees."""
    phi = 4 * np.pi * f_mod * d / c_light                      # round-trip phase delay
    Q = B + A * np.cos(phi[None] - np.arange(4)[:, None] * np.pi / 2)        # shape (4, n)
    if sigma:
        Q = Q + rng.normal(0, sigma, Q.shape)
    return Q


def tof_decode(Q, f_mod):
    phi = np.arctan2(Q[1] - Q[3], Q[0] - Q[2]) % (2 * np.pi)
    amp = 0.5 * np.hypot(Q[1] - Q[3], Q[0] - Q[2])
    return c_light * phi / (4 * np.pi * f_mod), amp            # distance modulo c / (2 f)


def unwrap_two(d1, d2, f1, f2, max_range):
    """Pick the wrap counts (n1, n2) whose candidate distances agree best."""
    r1, r2 = c_light / (2 * f1), c_light / (2 * f2)
    best = (np.inf, None)
    for n1 in range(int(max_range / r1) + 1):
        for n2 in range(int(max_range / r2) + 1):
            e = abs((d1 + n1 * r1) - (d2 + n2 * r2))
            if e < best[0]:
                best = (e, 0.5 * (d1 + n1 * r1 + d2 + n2 * r2))
    return best[1]


f1, f2 = 80e6, 100e6
print("unambiguous ranges: %.3f m and %.3f m" % (c_light / (2 * f1), c_light / (2 * f2)))
d_true = np.array([5.3])
d1, a1 = tof_decode(tof_samples(d_true, f1), f1)
d2, a2 = tof_decode(tof_samples(d_true, f2), f2)
print("wrapped: %.4f m at 80 MHz, %.4f m at 100 MHz, amplitude %.2f" % (d1[0], d2[0], a1[0]))
print("unwrapped: %.4f m" % unwrap_two(d1[0], d2[0], f1, f2, max_range=7.49))


# ---- phase shift ----------------------------------------------------------------------
def phase_from_three(I1, I2, I3):
    """Three fringe images shifted by -120, 0, +120 degrees -> wrapped phase in [0, 2 pi)."""
    return np.arctan2(np.sqrt(3) * (I1 - I3), 2 * I2 - I1 - I3) % (2 * np.pi)


period = 16.0                                   # projector pixels per fringe
u_proj = np.array([37.0])                       # the projector column that lit this camera pixel
phi = 2 * np.pi * u_proj / period
I1, I2, I3 = (0.5 + 0.4 * np.cos(phi + s) for s in (-2 * np.pi / 3, 0.0, 2 * np.pi / 3))
phi_hat = phase_from_three(I1, I2, I3)
print("decoded phase %.4f rad -> column %.2f + k * %g" % (phi_hat[0], phi_hat[0] / (2 * np.pi) * period, period))


# ---- sweep ----------------------------------------------------------------------
def relative_pose(R_r, t_r, R_s, t_s):
    """(R, t) that map reference-camera coordinates to source-camera coordinates."""
    R = R_s @ R_r.T
    return R, t_s - R @ t_r


def plane_homography(K_r, K_s, R, t, n, d):
    """Reference pixels -> source pixels for the plane n^T X = d (X in reference coordinates)."""
    return K_s @ (R + np.outer(t, n) / d) @ np.linalg.inv(K_r)


def warp(img, Hm):
    """For every reference pixel x, sample img at Hm x (bilinear). NaN where it falls outside."""
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    p = Hm @ np.stack([xs.ravel(), ys.ravel(), np.ones(H * W)])
    out = ndi.map_coordinates(img, [p[1] / p[2], p[0] / p[2]], order=1, cval=np.nan)
    return out.reshape(H, W)


def ncc_cost(a, b, r=2, eps=1e-5):
    """1 - NCC over (2r+1) x (2r+1) windows, per pixel: 0 = perfect match, 2 = worst.
    Windows that touch a NaN of b (outside the source image) get the worst cost."""
    box = lambda x: ndi.uniform_filter(x, 2 * r + 1, mode="nearest")
    outside = np.isnan(b)
    b = np.where(outside, 0.0, b)
    ma, mb = box(a), box(b)
    va, vb, cab = box(a * a) - ma ** 2, box(b * b) - mb ** 2, box(a * b) - ma * mb
    cost = 1 - cab / np.sqrt((np.maximum(va, 0) + eps) * (np.maximum(vb, 0) + eps))
    return np.where(box(outside.astype(float)) > 1e-6, 2.0, cost)


def plane_sweep(I_ref, R_ref, t_ref, views, z_near=2.5, z_far=8.0, D=64, r=2):
    """Cost volume C[view, plane, y, x] for fronto-parallel planes, uniform in 1/z."""
    inv_z = np.linspace(1 / z_near, 1 / z_far, D)
    n = np.array([0.0, 0.0, 1.0])                       # planes z = const in the reference frame
    C = np.empty((len(views), D, H, W))
    for j, (I_s, R_s, t_s) in enumerate(views):
        R, t = relative_pose(R_ref, t_ref, R_s, t_s)
        for i, w in enumerate(inv_z):
            C[j, i] = ncc_cost(I_ref, warp(I_s, plane_homography(K, K, R, t, n, 1 / w)), r)
    return inv_z, C


def wta(inv_z, cost):
    """Winner-take-all over the planes, refined by a parabola through 3 costs; returns z."""
    i = cost.argmin(0)
    ic = np.clip(i, 1, len(inv_z) - 2)
    c0, c1, c2 = (np.take_along_axis(cost, (ic + o)[None], 0)[0] for o in (-1, 0, 1))
    den = c0 - 2 * c1 + c2
    off = np.where((i == ic) & (den > 1e-9), 0.5 * (c0 - c2) / np.maximum(den, 1e-9), 0.0)
    return 1 / np.interp(ic + np.clip(off, -0.5, 0.5), np.arange(len(inv_z)), inv_z)


def depth_errors(z, z_gt):
    e = np.abs(z - z_gt) / z_gt
    return "AbsRel %.3f, |e| < 1%%: %4.1f%%, |e| < 5%%: %4.1f%%" % (
        e.mean(), 100 * np.mean(e < 0.01), 100 * np.mean(e < 0.05))


inv_z, C = plane_sweep(I_ref, R_ref, t_ref, src)          # C: (4 views, 64 planes, H, W)
z_one = wta(inv_z, C[0])                                   # only source view 1 (index 0)
z_mean = wta(inv_z, C.mean(0))                             # average of the 4 views
z_best2 = wta(inv_z, np.sort(C, 0)[:2].mean(0))            # best 2 of 4 views, per pixel and plane
for name, z in (("view 1 only", z_one), ("mean of 4", z_mean), ("best 2 of 4", z_best2)):
    print("%-12s %s" % (name, depth_errors(z, Z_gt)))


# ---- patchmatch ----------------------------------------------------------------------
Kinv = np.linalg.inv(K)
WIN = np.array([(dx, dy) for dy in range(-2, 3) for dx in range(-2, 3)], float)   # 5 x 5 window
NEIGH = [(-1, 0), (1, 0), (0, -1), (0, 1), (-3, 0), (3, 0), (0, -3), (0, 3)]


def plane_cost(z, nrm, xs, ys, I_ref, views, k=2):
    """Best-k mean of 1 - NCC for pixel (xs, ys) carrying the plane through depth z with normal
    nrm; every window pixel is warped by its own plane-induced homography."""
    q = np.stack([xs[:, None] + WIN[:, 0], ys[:, None] + WIN[:, 1]], -1)          # (M, 25, 2)
    a = ndi.map_coordinates(I_ref, [q[..., 1].ravel(), q[..., 0].ravel()], order=1,
                            mode="nearest").reshape(q.shape[:2])
    X = z[:, None] * (np.stack([xs, ys, np.ones_like(xs)], 1) @ Kinv.T)            # 3D point
    d = np.sum(nrm * X, 1)                                                          # n^T X = d
    qh = np.concatenate([q, np.ones(q.shape[:2] + (1,))], -1)
    costs = []
    for I_s, R_s, t_s in views:
        R, t = relative_pose(R_ref, t_ref, R_s, t_s)
        Hm = K @ (R + t[:, None] * nrm[:, None, :] / d[:, None, None]) @ Kinv      # (M, 3, 3)
        p = np.einsum("mij,mkj->mki", Hm, qh)
        b = ndi.map_coordinates(I_s, [(p[..., 1] / p[..., 2]).ravel(), (p[..., 0] / p[..., 2]).ravel()],
                                order=1, cval=np.nan).reshape(q.shape[:2])
        bad = np.isnan(b).any(1)
        a0 = a - a.mean(1, keepdims=True)
        b = np.where(bad[:, None], 0.0, b)                                  # cost 2 below anyway
        b0 = b - b.mean(1, keepdims=True)
        ncc = (a0 * b0).mean(1) / np.sqrt(((a0 ** 2).mean(1) + 1e-5) * ((b0 ** 2).mean(1) + 1e-5))
        costs.append(np.where(bad, 2.0, 1 - ncc))
    return np.sort(np.array(costs), 0)[:k].mean(0)


def facing(nrm, rays):
    nrm = nrm / np.linalg.norm(nrm, axis=1, keepdims=True)
    return np.where(np.sum(nrm * rays, 1, keepdims=True) > 0, -nrm, nrm)   # point at the camera


def patchmatch(I_ref, views, iters=6, z_near=2.5, z_far=8.0, slanted=True, seed=0, history=None):
    """Multi-view PatchMatch with red-black propagation (Gipuma-style); returns z, normals, cost."""
    rng = np.random.default_rng(seed)
    ys, xs = (g.ravel().astype(float) for g in np.mgrid[0:H, 0:W])
    rays = np.stack([xs, ys, np.ones_like(xs)], 1) @ Kinv.T
    w = rng.uniform(1 / z_far, 1 / z_near, H * W)                   # 1. random inverse depth
    N = facing(rng.normal(size=(H * W, 3)), rays) if slanted else np.tile([0, 0, -1.0], (H * W, 1))
    cost = plane_cost(1 / w, N, xs, ys, I_ref, views)
    dw, dn = (1 / z_near - 1 / z_far) / 4, 0.3                       # refinement step sizes
    for it in range(iters + 1):
        if history is not None:
            history.append((1 / w).reshape(H, W).copy())
        if it == iters:
            break
        for color in (0, 1):                                          # red-black halves
            sel = np.nonzero((xs + ys) % 2 == color)[0]
            xi, yi = xs[sel].astype(int), ys[sel].astype(int)
            cands = []
            for dx, dy in NEIGH:                                      # 2. propagation
                j = np.clip(yi + dy, 0, H - 1) * W + np.clip(xi + dx, 0, W - 1)
                # the neighbour's plane, intersected with this pixel's ray: z = n^T X_j / n^T r
                z = np.sum(N[j] * rays[j], 1) / w[j] / np.sum(N[j] * rays[sel], 1)
                ok = (z > 0.9 * z_near) & (z < 1.1 * z_far)
                cands.append((np.where(ok, 1 / np.where(ok, z, 1.0), w[j]), N[j]))
            # 3. random refinement: perturb the depth, and (if slanted) the normal
            cands.append((np.clip(w[sel] + rng.uniform(-dw, dw, len(sel)), 1 / z_far, 1 / z_near), N[sel]))
            if slanted:
                cands.append((w[sel], facing(N[sel] + rng.normal(0, dn, (len(sel), 3)), rays[sel])))
            for cw, cn in cands:
                c = plane_cost(1 / cw, cn, xs[sel], ys[sel], I_ref, views)
                upd = c < cost[sel]                                   # keep the better plane
                better = sel[upd]
                w[better], N[better], cost[better] = cw[upd], cn[upd], c[upd]
        dw, dn = dw / 2, dn / 2
    return (1 / w).reshape(H, W), N.reshape(H, W, 3), cost.reshape(H, W)


pm_hist = []
z_pm, N_pm, cost_pm = patchmatch(I_ref, src, history=pm_hist)
for it, z in enumerate(pm_hist):
    print("PatchMatch iteration %d: %s" % (it, depth_errors(z, Z_gt)))
pm_hist_fp = []
z_pm_fp = patchmatch(I_ref, src, slanted=False, history=pm_hist_fp)[0]   # fronto-parallel planes only
floor = np.abs(X_world[..., 1] - 1.2) < 1e-6                         # pixels that see the floor
for name, z in (("sweep, best 2", z_best2), ("PatchMatch slanted", z_pm), ("PatchMatch fronto", z_pm_fp)):
    e = np.abs(z - Z_gt) / Z_gt
    print("%-19s floor: |e| < 1%%: %4.1f%%   all: %s" % (name, 100 * np.mean(e[floor] < 0.01), depth_errors(z, Z_gt)))


# ---- soft argmin ----------------------------------------------------------------------
def soft_argmin(inv_z, cost, tau=0.05):
    """Expected inverse depth under P(plane) = softmax(-cost / tau), as in GC-Net and MVSNet."""
    logit = -cost / tau
    P = np.exp(logit - logit.max(0))
    P /= P.sum(0)
    return 1 / np.tensordot(inv_z, P, 1), P


agg = np.sort(C, 0)[:2].mean(0)
step = inv_z[0] - inv_z[1]                                           # plane spacing in 1/z
i_gt = (inv_z[0] - 1 / Z_gt) / step                                  # true plane index (real)
inlier = np.abs(agg.argmin(0) - i_gt) <= 2                           # WTA within 2 planes
for name, z in (("integer WTA", 1 / inv_z[agg.argmin(0)]), ("WTA + parabola", z_best2),
                ("soft-argmin tau=0.05", soft_argmin(inv_z, agg, 0.05)[0]),
                ("soft-argmin tau=0.01", soft_argmin(inv_z, agg, 0.01)[0])):
    err = ((inv_z[0] - 1 / z) / step - i_gt)[inlier]                 # error in plane spacings
    print("%-21s RMS error %.3f planes" % (name, np.sqrt(np.mean(err ** 2))))
print("pixels with WTA within 2 planes: %.1f%%" % (100 * inlier.mean()))


# ---- monocular ----------------------------------------------------------------------
def align_scale_shift(pred, target, mask):
    """Least-squares s, t with s * pred + t ~ target on the mask (MiDaS-style alignment)."""
    A = np.stack([pred[mask], np.ones(mask.sum())], 1)
    s, t = np.linalg.lstsq(A, target[mask], rcond=None)[0]
    return s, t


def depth_metrics(z, z_gt):
    ratio = np.maximum(z / z_gt, z_gt / z)
    return dict(AbsRel=np.mean(np.abs(z - z_gt) / z_gt), RMSE=np.sqrt(np.mean((z - z_gt) ** 2)),
                delta1=np.mean(ratio < 1.25))


def fmt(m):
    return "AbsRel %.4f, RMSE %.3f m, delta1 %.3f" % (m["AbsRel"], m["RMSE"], m["delta1"])


def si_log(z, z_gt, lam=1.0):
    """Scale-invariant log error of Eigen et al. (2014); lam = 1 ignores any global scale."""
    g = np.log(z) - np.log(z_gt)
    return np.mean(g ** 2) - lam * np.mean(g) ** 2


rng = np.random.default_rng(3)
smooth = ndi.gaussian_filter(rng.normal(size=(H, W)), 12)
smooth /= smooth.std()
# a stand-in for a relative-depth network: affine in inverse depth, plus smooth and pixel errors
pred = 1.7 / Z_gt + 0.25 + 0.006 * smooth + rng.normal(0, 0.003, (H, W))
everything = np.ones((H, W), bool)
s, t = align_scale_shift(pred, 1 / Z_gt, everything)
z_al = 1 / (s * pred + t)
print("scale-and-shift: s = %.4f, t = %.4f; %s" % (s, t, fmt(depth_metrics(z_al, Z_gt))))
k_med = np.median(Z_gt * pred)                                       # scale only: z = k / pred
print("scale only:      k = %.4f;           %s" % (k_med, fmt(depth_metrics(k_med / pred, Z_gt))))
print("si_log: %.5f, after doubling the depth: %.5f" % (si_log(z_al, Z_gt), si_log(2 * z_al, Z_gt)))
anchor_rel = {}
for n_anchor in (3, 10, 30, 100, 1000):                              # sparse metric anchors
    vals = []
    for trial in range(50):
        m = np.zeros(H * W, bool)
        m[rng.choice(H * W, n_anchor, replace=False)] = True
        s_, t_ = align_scale_shift(pred, 1 / Z_gt, m.reshape(H, W))
        zz = 1 / np.maximum(s_ * pred + t_, 1e-3)
        vals.append(depth_metrics(zz, Z_gt)["AbsRel"])
    anchor_rel[n_anchor] = (np.median(vals), np.percentile(vals, 90))
    print("%4d anchors: median AbsRel %.4f, 90th percentile %.4f" % (n_anchor, *anchor_rel[n_anchor]))


# ---- tsdf ----------------------------------------------------------------------
def sdf_scene(p):
    """2D scene: a disk and a square. Negative inside, positive outside."""
    d_disk = np.linalg.norm(p - [0.45, 0.35], axis=-1) - 0.55
    q = np.abs(p - [-0.5, -0.4]) - 0.4
    d_box = np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(-1), 0)
    return np.minimum(d_disk, d_box)


def camera_axes(ang):
    return np.array([np.cos(ang), np.sin(ang)]), np.array([np.sin(ang), -np.cos(ang)])  # fwd, right


def scan(pos, ang, n=96, fov=np.deg2rad(60), rng=None):
    """1D depth camera at pos looking along ang: z-depth of n pixels (sphere tracing), with noise
    sigma = 2 mm + 5 mm * z^2 that grows with distance like a stereo or structured-light sensor."""
    fwd, right = camera_axes(ang)
    f = (n / 2) / np.tan(fov / 2)
    u = (np.arange(n) + 0.5 - n / 2) / f
    dirs = fwd + u[:, None] * right                                  # z-component 1 along fwd
    z = np.zeros(n)
    for _ in range(200):
        z += sdf_scene(pos + z[:, None] * dirs) / np.linalg.norm(dirs, axis=1)
    z[z > 6] = np.nan                                                # missed everything
    return z + rng.normal(0, 0.002 + 0.005 * z ** 2)


def integrate(T, Wt, grid, pos, ang, z_meas, fov=np.deg2rad(60), mu=0.08):
    """KinectFusion-style update of the TSDF T and weights Wt (arrays over grid points)."""
    n = len(z_meas)
    fwd, right = camera_axes(ang)
    f = (n / 2) / np.tan(fov / 2)
    d = grid - pos
    z, x = d @ fwd, d @ right
    u = np.floor(f * x / np.maximum(z, 1e-9) + n / 2).astype(int)   # pixel of each grid point
    ok = (z > 1e-3) & (u >= 0) & (u < n)
    zm = z_meas[np.clip(u, 0, n - 1)]
    sdf = zm - z                                                     # projective signed distance
    ok &= np.isfinite(zm) & (sdf > -mu)                              # skip far behind the surface
    tsdf = np.clip(sdf / mu, -1.0, 1.0)
    T[ok] = (Wt[ok] * T[ok] + tsdf[ok]) / (Wt[ok] + 1)               # running weighted average
    Wt[ok] += 1


def zero_crossings(T, Wt, xs):
    """Surface points: linear interpolation where T changes sign between observed neighbours."""
    pts = []
    for axis in (0, 1):
        a, b = (T, np.roll(T, -1, axis))
        wa, wb = Wt, np.roll(Wt, -1, axis)
        m = (a * b < 0) & (wa > 0) & (wb > 0)
        if axis == 0:
            m[-1, :] = False
        else:
            m[:, -1] = False
        iy, ix = np.nonzero(m)
        frac = a[m] / (a[m] - b[m])
        px, py = xs[ix], xs[iy]
        h = xs[1] - xs[0]
        pts.append(np.stack([px + (axis == 1) * frac * h, py + (axis == 0) * frac * h], 1))
    return np.concatenate(pts)


def scan_points(pos, ang, z, fov=np.deg2rad(60)):
    """The 2D points measured by one scan."""
    fwd, right = camera_axes(ang)
    n = len(z)
    u = (np.arange(n) + 0.5 - n / 2) / ((n / 2) / np.tan(fov / 2))
    ok = np.isfinite(z)
    return pos + z[ok, None] * (fwd + u[ok, None] * right)


xs_g = np.linspace(-1.5, 1.5, 201)
grid = np.stack(np.meshgrid(xs_g, xs_g), -1).reshape(-1, 2)          # (x, y) of every cell
rng = np.random.default_rng(5)
T, Wt = np.ones(len(grid)), np.zeros(len(grid))
n_scans, poses, tsdf_err = 36, [], {}
for k in range(n_scans):
    th = 2 * np.pi * k / n_scans
    pos = 2.0 * np.array([np.cos(th), np.sin(th)])                   # on a circle of radius 2 m
    ang = th + np.pi + rng.uniform(-0.1, 0.1)                        # look back at the origin
    z_meas = scan(pos, ang, rng=rng)
    integrate(T, Wt, grid, pos, ang, z_meas)
    poses.append((pos, ang, z_meas))
    if k + 1 in (1, 2, 4, 8, 16, 36):
        P = zero_crossings(T.reshape(201, 201), Wt.reshape(201, 201), xs_g)
        tsdf_err[k + 1] = np.sqrt(np.mean(sdf_scene(P) ** 2))
raw = np.concatenate([scan_points(*p) for p in poses])
print("raw points: RMS distance to the surface %.2f mm" % (1000 * np.sqrt(np.mean(sdf_scene(raw) ** 2))))
print("fused TSDF:", ", ".join("%d scans %.2f mm" % (k, 1000 * v) for k, v in tsdf_err.items()))


# ============================================================================================
# Figures
# ============================================================================================
from matplotlib.colors import TwoSlopeNorm  # noqa: E402

GRAY = dict(cmap="gray", vmin=0, vmax=1, interpolation="nearest")
DEPTH = dict(cmap="viridis_r", vmin=2.5, vmax=7.0, interpolation="nearest")


def loc(fig_fn, name):
    """Render a figure with words once per language: name_{en,zh,ja}.svg."""
    res = None
    for lang in LANGS:
        r = fig_fn(lang)
        fig, res = (r if isinstance(r, tuple) else (r, None))
        out(fig, name.replace(".svg", "_%s.svg" % lang))
    return res


def tick_off(ax):
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)


def zticks(ax, axis="x", zs=(2.5, 3, 4, 5, 6, 8)):
    """Axis in inverse depth 1/z, labelled in z (m)."""
    getattr(ax, "set_%sticks" % axis)([1 / z for z in zs])
    getattr(ax, "set_%sticklabels" % axis)([("%g" % z) for z in zs])


# probe pixels (x, y) used by several figures
def find_probes():
    yy, xx = np.mgrid[0:H, 0:W]
    i_true = np.clip(np.round((inv_z[0] - 1 / Z_gt) / (inv_z[0] - inv_z[1])).astype(int), 0, 63)
    c_true = np.take_along_axis(C, np.broadcast_to(i_true, (4, 1, H, W)).copy(), 1)[:, 0]   # (4, H, W)
    Xw = X_world
    wallm = np.abs(Xw[..., 2] - 6.5) < 1e-6
    poster = wallm & (Xw[..., 0] > 0.2) & (Xw[..., 0] < 2.2) & (Xw[..., 1] > -1.8) & (Xw[..., 1] < -0.7)
    stripes = wallm & (Xw[..., 0] > -3.0) & (Xw[..., 0] < -1.1) & (Xw[..., 1] > -1.8) & (Xw[..., 1] < -0.4)
    lvar = ndi.uniform_filter(I_ref ** 2, 5) - ndi.uniform_filter(I_ref, 5) ** 2
    # A: textured wall, every view matches well at the true depth
    okA = wallm & ~poster & ~stripes & (c_true.max(0) < 0.1) & (yy > 25) & (yy < 50) & (xx > 75) & (xx < 100) & (np.abs(z_best2 - Z_gt) < 0.005 * Z_gt)
    A = np.unravel_index(np.argmax(np.where(okA, lvar, -1)), (H, W))
    B = tuple(int(np.median(v)) for v in np.nonzero(poster))
    Cs = tuple(int(np.median(v)) for v in np.nonzero(stripes))
    # D: visible in the reference, occluded in at least one view (large cost there, small in two)
    okD = (c_true.max(0) > 1.0) & (np.sort(c_true, 0)[1] < 0.1) & (yy > 30) & (yy < 110) & (xx > 10) & (xx < 150)
    okD &= (np.abs(z_best2 - Z_gt) / Z_gt < 0.01) & (np.abs(z_mean - Z_gt) / Z_gt > 0.05)
    D = np.unravel_index(np.argmax(np.where(okD, c_true.max(0) - np.sort(c_true, 0)[1], -1)), (H, W))
    return {k: (int(v[1]), int(v[0])) for k, v in zip("ABCD", (A, B, Cs, D))}


PROBES = find_probes()
print("probe D: mean of 4 gives z = %.2f m" % z_mean[PROBES["D"][1], PROBES["D"][0]])
print("probes (x, y):", PROBES)


# --------------------------------------------------------------------------------------------
# F1  image, depth map and back-projected points
# --------------------------------------------------------------------------------------------
def fig_depth_points():
    fig = plt.figure(figsize=(11, 10.5))
    gs = fig.add_gridspec(2, 2, height_ratios=[1, 1.45], width_ratios=[1, 1.12])
    ax = fig.add_subplot(gs[0, 0]); ax.imshow(I_ref, **GRAY); tick_off(ax); ax.set_title("(a) $I_{\\mathrm{ref}}$")
    ax = fig.add_subplot(gs[0, 1]); im = ax.imshow(Z_gt, **DEPTH); tick_off(ax); ax.set_title("(b) $z(x, y)$ (m)")
    fig.colorbar(im, ax=ax, fraction=0.035, pad=0.02)
    ax = fig.add_subplot(gs[1, :], projection="3d")
    P = X_world[::2, ::2].reshape(-1, 3)
    g = np.clip(I_ref[::2, ::2].ravel(), 0, 1)
    ax.scatter(P[:, 0], P[:, 2], -P[:, 1], c=g, cmap="gray", vmin=0, vmax=1, s=1.5, depthshade=False)
    # reference frustum (z = 1.5 m) in world coordinates
    cs = np.array([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]], float)
    corners = (np.c_[cs, np.ones(4)] @ np.linalg.inv(K).T) * 1.5
    Cw = C_ref
    Pw = (corners - t_ref) @ R_ref
    for p in Pw:
        ax.plot([Cw[0], p[0]], [Cw[2], p[2]], [-Cw[1], -p[1]], color=PAL["a"], lw=1.6)
    loop = np.vstack([Pw, Pw[:1]])
    ax.plot(loop[:, 0], loop[:, 2], -loop[:, 1], color=PAL["a"], lw=1.6)
    ax.set_xlabel("$X$"); ax.set_ylabel("$Z$"); ax.set_zlabel("$-Y$")
    ax.set_xlim(-3, 3); ax.set_ylim(0, 7); ax.set_zlim(-1.2, 2.2)
    ax.set_box_aspect((6, 7, 3.4))
    ax.view_init(elev=28, azim=-125)
    ax.set_title("(c) $\\mathbf{X} = R^\\top(z\\,K^{-1}\\tilde{\\mathbf{x}} - \\mathbf{t})$")
    for a in (ax.xaxis, ax.yaxis, ax.zaxis):
        a.set_pane_color((1, 1, 1, 0))
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F2  sensors: stereo depth noise, ToF phase wrapping, phase-shift structured light
# --------------------------------------------------------------------------------------------
def fig_sensors(lang):
    fig = plt.figure(figsize=(11, 10))
    gs = fig.add_gridspec(3, 2, height_ratios=[1.25, 0.6, 0.5])
    axs = [fig.add_subplot(gs[0, 0]), fig.add_subplot(gs[0, 1]), fig.add_subplot(gs[1, :])]
    ax_ph = fig.add_subplot(gs[2, :], sharex=axs[2])
    ax = axs[0]
    Z = np.linspace(0.3, 6, 200)
    for B, col in ((0.05, PAL["b"]), (0.12, PAL["z"])):
        ax.plot(Z, 100 * stereo_depth_sigma(Z, 600, B, 0.2), color=col, label="$B = %g$ cm" % (100 * B))
        for z in (2, 5):
            ax.plot(z, 100 * stereo_depth_sigma(z, 600, B, 0.2), "o", color=col, ms=6)
            ax.annotate("%.1f" % (100 * stereo_depth_sigma(z, 600, B, 0.2)), (z, 100 * stereo_depth_sigma(z, 600, B, 0.2)),
                        textcoords="offset points", xytext=(-26, 6) if B < 0.1 else (8, -16), fontsize=12, color=col)
    ax.set_xlabel("$Z$ (m)"); ax.set_ylabel("$\\sigma_Z$ (cm)")
    ax.set_title("(a) $\\sigma_Z = Z^2\\sigma_d/(fB)$")
    ax.legend(loc="upper left", fontsize=13)
    ax = axs[1]
    d = np.linspace(0, 7.5, 1500)
    for fm, col in ((f1, PAL["b"]), (f2, PAL["z"])):
        ax.plot(d, tof_decode(tof_samples(d, fm), fm)[0], color=col, lw=1.8, label="%d MHz" % (fm / 1e6))
    ax.plot(d, d, color=PAL["gray"], ls="--", lw=1.4)
    ax.axvline(5.3, color=PAL["dark"], lw=1.2, ls=":")
    ax.plot([5.3, 5.3], [d1[0], d2[0]], "o", color=PAL["dark"], ms=6)
    ax.set_xlabel("$d$ (m)"); ax.set_ylabel("$\\hat d$ (m)"); ax.set_ylim(0, 7.5)
    ax.set_title("(b) ToF, $c/(2f)$")
    ax.legend(loc="upper left", fontsize=13)
    ax = axs[2]
    u = np.linspace(0, 48, 600)
    ph = 2 * np.pi * u / period
    for s_, col, lab in ((-2 * np.pi / 3, PAL["x"], "$I_1$"), (0.0, PAL["y"], "$I_2$"), (2 * np.pi / 3, PAL["z"], "$I_3$")):
        ax.plot(u, 0.5 + 0.4 * np.cos(ph + s_), color=col, lw=1.8, label=lab)
    J = [0.5 + 0.4 * np.cos(ph + s_) for s_ in (-2 * np.pi / 3, 0.0, 2 * np.pi / 3)]
    ax_ph.plot(u, phase_from_three(*J), color=PAL["a"], lw=2.4)
    ax_ph.set_ylabel("$\\hat\\varphi$"); ax_ph.set_yticks([0, np.pi, 2 * np.pi]); ax_ph.set_yticklabels(["0", "$\\pi$", "$2\\pi$"])
    for a in (ax, ax_ph):
        a.axvline(37, color=PAL["dark"], ls=":", lw=1.2)
    ax_ph.plot(37, phi_hat[0], "o", color=PAL["dark"], ms=6)
    ax.set_ylim(0, 1.3); ax_ph.set_xlabel(label(lang, en='projector column $u$', zh='投影仪列 u', ja='プロジェクターの列 u')); ax.set_ylabel("$I_k$")
    plt.setp(ax.get_xticklabels(), visible=False)
    ax.set_title(label(lang, en='(c) phase shifting, period 16 px', zh='(c) 相移，周期 16 px', ja='(c) 位相シフト、周期 16 px'))
    ax.legend(loc="upper right", ncol=3, fontsize=12)
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F3  plane-sweep geometry: hypotheses along a ray, and their images in the source view
# --------------------------------------------------------------------------------------------
def fig_sweep_geometry(lang):
    px, py = 120, 60
    fig, axs = plt.subplots(1, 2, figsize=(11, 5.8), gridspec_kw=dict(width_ratios=[0.8, 1.2]))
    ax = axs[0]
    row = X_cam[py]
    ax.plot(row[:, 0], row[:, 2], ".", color=PAL["gray"], ms=4)
    I_s, R_s, t_s = src[0]
    R, t = relative_pose(R_ref, t_ref, R_s, t_s)
    Cs = -R.T @ t                                        # source centre in reference coordinates
    ray = np.linalg.inv(K) @ np.array([px, py, 1.0])
    sel = np.arange(0, 64, 3)
    cols = plt.cm.plasma(np.linspace(0, 0.9, len(sel)))
    for k, i in enumerate(sel):
        z = 1 / inv_z[i]
        ax.plot([-2.6, 2.6], [z, z], color=cols[k], lw=0.6, alpha=0.5)
        Xh = ray * z
        ax.plot([Cs[0], Xh[0]], [Cs[2], Xh[2]], color=cols[k], lw=0.7, alpha=0.6)
        ax.plot(Xh[0], Xh[2], "o", color=cols[k], ms=5)
    ax.plot([0, ray[0] * 8.2], [0, 8.2], color=PAL["dark"], lw=2)
    zt = Z_gt[py, px]
    ax.plot(ray[0] * zt, zt, "*", color=PAL["x"], ms=17, zorder=5)
    ax.plot(0, 0, "s", color=PAL["dark"], ms=9); ax.annotate("$\\mathbf{C}_{\\mathrm{ref}}$", (0.05, -0.05), xytext=(-55, -8), textcoords="offset points")
    ax.plot(Cs[0], Cs[2], "s", color=PAL["b"], ms=9); ax.annotate("$\\mathbf{C}_1$", (Cs[0], Cs[2]), xytext=(8, -8), textcoords="offset points", color=PAL["b"])
    ax.set_xlim(-2.6, 2.6); ax.set_ylim(-0.4, 8.3); ax.set_aspect("equal")
    ax.set_xlabel("$x$ (m)"); ax.set_ylabel("$z$ (m)")
    ax.set_title(label(lang, en='(a) planes $z = 1/w_i$, row $y = %d$', zh='(a) 平面 z = 1/w，第 %d 行', ja='(a) 平面 z = 1/w、行 y = %d') % py)
    ax = axs[1]
    ax.imshow(I_s, **GRAY); tick_off(ax)
    Hs = [plane_homography(K, K, R, t, np.array([0, 0, 1.0]), 1 / inv_z[i]) for i in range(64)]
    pts = np.array([(Hm @ [px, py, 1.0]) for Hm in Hs]); pts = pts[:, :2] / pts[:, 2:]
    ax.plot(pts[:, 0], pts[:, 1], color=PAL["dark"], lw=1)
    for k, i in enumerate(sel):
        ax.plot(*pts[i], "o", color=cols[k], ms=5)
    Ht = plane_homography(K, K, R, t, np.array([0, 0, 1.0]), zt)
    pt = Ht @ [px, py, 1.0]
    ax.plot(pt[0] / pt[2], pt[1] / pt[2], "*", color=PAL["x"], ms=17)
    span = np.linalg.norm(pts[0] - pts[-1])
    ax.set_xlim(pts[:, 0].min() - 45, pts[:, 0].max() + 45); ax.set_ylim(pts[:, 1].max() + 32, pts[:, 1].min() - 32)
    ax.set_title(label(lang, en='(b) $H_i\\tilde{\\mathbf{x}}$ in view 1: %.1f px, %.2f px apart', zh='(b) 视图 1 中的投影点：共 %.1f px，间隔 %.2f px', ja='(b) 視点 1 での投影点：全体 %.1f px、間隔 %.2f px') % (span, span / 63))
    fig.tight_layout()
    return fig, span


# --------------------------------------------------------------------------------------------
# F4  warps at three planes
# --------------------------------------------------------------------------------------------
WARP_Z = (3.3, 4.6, 6.6)


def fig_sweep_warps():
    I_s, R_s, t_s = src[0]
    R, t = relative_pose(R_ref, t_ref, R_s, t_s)
    fig, axs = plt.subplots(4, 2, figsize=(10, 15.2))
    axs[0, 0].imshow(I_ref, **GRAY); axs[0, 0].set_title("$I_{\\mathrm{ref}}$")
    axs[0, 1].imshow(I_s, **GRAY); axs[0, 1].set_title("$I_1$")
    for k, z in enumerate(WARP_Z):
        Wp = warp(I_s, plane_homography(K, K, R, t, np.array([0, 0, 1.0]), z))
        axs[k + 1, 0].imshow(np.nan_to_num(Wp, nan=0.5), **GRAY)
        axs[k + 1, 0].set_title("$I_1(H_z\\tilde{\\mathbf{x}})$, $z = %g$ m" % z)
        diff = np.abs(I_ref - Wp)
        axs[k + 1, 1].imshow(np.nan_to_num(diff, nan=0.6), cmap="magma", vmin=0, vmax=0.6, interpolation="nearest")
        axs[k + 1, 1].contour(np.abs(Z_gt - z) / z < 0.03, levels=[0.5], colors=[PAL["c"]], linewidths=2)
        axs[k + 1, 1].set_title("$|I_{\\mathrm{ref}} - I_1(H_z\\tilde{\\mathbf{x}})|$, $z = %g$ m" % z)
    for a in axs.flat:
        tick_off(a)
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F5  cost curves at four probe pixels
# --------------------------------------------------------------------------------------------
VCOL = (PAL["b"], PAL["z"], PAL["y"], PAL["c"])


def fig_cost_curves(lang):
    fig = plt.figure(figsize=(11, 12.5))
    gs = fig.add_gridspec(3, 4, height_ratios=[1.35, 1, 1])
    ax = fig.add_subplot(gs[0, 1:3]); ax.imshow(I_ref, **GRAY); tick_off(ax)
    for name, (x, y) in PROBES.items():
        ax.plot(x, y, "o", ms=13, mfc="none", mec=PAL["x"], mew=2.5)
        ax.annotate(name, (x, y), xytext=(8, -10), textcoords="offset points", color=PAL["x"], fontsize=17, weight="bold")
    ax.set_title(label(lang, en='$I_{\\mathrm{ref}}$, probes A-D', zh='参考图像，探针 A-D', ja='参照画像、プローブ A-D'))
    res = {}
    for k, (name, (x, y)) in enumerate(PROBES.items()):
        ax = fig.add_subplot(gs[1 + k // 2, 2 * (k % 2):2 * (k % 2) + 2])
        for j in range(4):
            ax.plot(inv_z, C[j, :, y, x], color=VCOL[j], lw=1.3, alpha=0.9, label=label(lang, en='view %d', zh='视图 %d', ja='視点 %d') % (j + 1))
        a2 = np.sort(C[:, :, y, x], 0)[:2].mean(0)
        ax.plot(inv_z, a2, color=PAL["dark"], lw=2.8, label=label(lang, en='best 2', zh='最好 2 个', ja='ベスト 2'))
        ax.axvline(1 / Z_gt[y, x], color=PAL["x"], ls="--", lw=1.6)
        zb = z_best2[y, x]
        ax.plot(1 / zb, a2.min(), "v", color=PAL["dark"], ms=10)
        zticks(ax); ax.set_xlim(inv_z[0], inv_z[-1]); ax.set_ylim(0, 2.0)
        ax.set_title("%s: $z^* = %.2f$, $\\hat z = %.2f$ m" % (name, Z_gt[y, x], zb), fontsize=15)
        if k // 2 == 1:
            ax.set_xlabel(label(lang, en='$z$ (m), spaced in $1/z$', zh='z (m)，按 1/z 等间距', ja='z (m)、1/z で等間隔'))
        if k % 2 == 0:
            ax.set_ylabel("$1 - \\mathrm{NCC}$")
        res[name] = (Z_gt[y, x], zb)
        if k == 0:
            ax.legend(fontsize=11, ncol=2, loc="upper right")
    fig.tight_layout()
    return fig, res


# --------------------------------------------------------------------------------------------
# F6  sweep results
# --------------------------------------------------------------------------------------------
def rel_err(z):
    return np.abs(z - Z_gt) / Z_gt


def fig_sweep_result(lang):
    fig, axs = plt.subplots(2, 2, figsize=(11, 8.6))
    axs = axs.ravel()
    for ax, img, ttl in ((axs[0], Z_gt, label(lang, en='(a) ground truth', zh='(a) 真值', ja='(a) 真値')), (axs[1], z_one, label(lang, en='(b) view 1 only', zh='(b) 只用视图 1', ja='(b) 視点 1 のみ')),
                         (axs[2], z_best2, label(lang, en='(c) best 2 of 4', zh='(c) 4 个中最好 2 个', ja='(c) 4 視点中ベスト 2'))):
        ax.imshow(img, **DEPTH); tick_off(ax); ax.set_title(ttl)
    im = axs[3].imshow(rel_err(z_best2), cmap="magma", vmin=0, vmax=0.05, interpolation="nearest")
    tick_off(axs[3]); axs[3].set_title(label(lang, en='(d) $|\\hat z - z^*|/z^*$ of (c)', zh='(d) (c) 的相对误差', ja='(d) (c) の相対誤差'))
    fig.colorbar(im, ax=axs[3], fraction=0.035, pad=0.02, ticks=[0, 0.01, 0.03, 0.05])
    for ax, z in ((axs[1], z_one), (axs[2], z_best2)):
        ax.set_xlabel(label(lang, en='%.0f%% within 1%%, %.0f%% within 5%%', zh='1%% 以内 %.0f%%，5%% 以内 %.0f%%', ja='1%% 以内 %.0f%%、5%% 以内 %.0f%%') % (100 * np.mean(rel_err(z) < 0.01), 100 * np.mean(rel_err(z) < 0.05)), fontsize=13)
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F7  PatchMatch
# --------------------------------------------------------------------------------------------


def fig_patchmatch(lang):
    fig, axs = plt.subplots(3, 2, figsize=(11, 12.5))
    for ax, it in zip(axs.flat[:4], (0, 1, 2, 6)):
        ax.imshow(pm_hist[it], **DEPTH); tick_off(ax)
        ax.set_title(label(lang, en='iteration %d: %.0f%% within 1%%', zh='第 %d 轮：1%% 以内 %.0f%%', ja='反復 %d：1%% 以内 %.0f%%') % (it, 100 * np.mean(rel_err(pm_hist[it]) < 0.01)))
    ax = axs[2, 0]
    Nc = N_pm.copy()
    ax.imshow(np.clip((Nc * [1, -1, -1] + 1) / 2, 0, 1), interpolation="nearest"); tick_off(ax)
    ax.set_title(label(lang, en='normals $\\mathbf{n}$ (RGB)', zh='法向 n (RGB)', ja='法線 n (RGB)'))
    ax = axs[2, 1]
    its = np.arange(len(pm_hist))
    for hist, col, lab in ((pm_hist, PAL["a"], label(lang, en='slanted', zh='倾斜平面', ja='傾いた平面')), (pm_hist_fp, PAL["b"], label(lang, en='fronto-parallel', zh='正对平面', ja='正対平面'))):
        ax.plot(its, [100 * np.mean(rel_err(z) < 0.01) for z in hist], "o-", color=col, label=lab)
        ax.plot(its, [100 * np.mean(rel_err(z)[floor] < 0.01) for z in hist], "s--", color=col, lw=1.6, ms=5)
    ax.axhline(100 * np.mean(rel_err(z_best2) < 0.01), color=PAL["gray"], ls=":", lw=1.6)
    ax.set_xlabel(label(lang, en='iteration', zh='迭代轮数', ja='反復回数')); ax.set_ylabel(label(lang, en='% with $|e| < 1\\%$', zh='|e| < 1% 的比例 (%)', ja='|e| < 1% の割合 (%)'))
    ax.set_title(label(lang, en='all pixels (solid), floor (dashed)', zh='全部像素（实线），地面（虚线）', ja='全画素（実線）、床（破線）'))
    ax.legend(fontsize=12, loc="lower right")
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F8  soft-argmin
# --------------------------------------------------------------------------------------------
def fig_soft_argmin(lang):
    fig, axs = plt.subplots(2, 2, figsize=(11, 9.4))
    axs = axs.ravel()
    axs[3].axis("off")
    xA, yA = PROBES["A"]
    xC, yC = PROBES["C"]
    for ax, (cost, ttl, zt) in zip(axs[:2], ((agg[:, yA, xA], label(lang, en='(a) probe A, best 2 of 4', zh='(a) 探针 A，4 个中最好 2 个', ja='(a) プローブ A、ベスト 2'), Z_gt[yA, xA]),
                                            (C[0, :, yC, xC], label(lang, en='(b) probe C, view 1 only', zh='(b) 探针 C，只用视图 1', ja='(b) プローブ C、視点 1 のみ'), Z_gt[yC, xC]))):
        ax.plot(inv_z, cost, color=PAL["dark"], lw=1.8, label=label(lang, en='cost', zh='代价', ja='コスト'))
        ax2 = ax.twinx(); ax2.grid(False); ax2.spines["right"].set_visible(True)
        for tau, col in ((0.05, PAL["b"]), (0.01, PAL["a"])):
            zs, P = soft_argmin(inv_z, cost[:, None, None], tau)
            if lang == "en":
                print("%s: soft-argmin tau=%g -> z = %.2f m (argmin %.2f m, truth %.2f m)"
                      % (ttl, tau, zs[0, 0], 1 / inv_z[cost.argmin()], zt))
            ax2.fill_between(inv_z, P[:, 0, 0], step="mid", color=col, alpha=0.35)
            ax2.axvline(1 / zs[0, 0], color=col, lw=2.2, label="soft-argmin $\\tau = %g$" % tau)
        ax.axvline(1 / zt, color=PAL["x"], ls="--", lw=1.6, label=label(lang, en='truth', zh='真值', ja='真値'))
        ax.axvline(inv_z[cost.argmin()], color=PAL["dark"], ls=":", lw=1.6, label="argmin")
        ax2.set_ylim(0, None); ax2.set_ylabel("$P_i$")
        zticks(ax); ax.set_xlim(inv_z[0], inv_z[-1]); ax.set_ylim(0, 2)
        ax.set_xlabel("$z$ (m)"); ax.set_ylabel("$1 - \\mathrm{NCC}$"); ax.set_title(ttl)
        h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
        if ax is axs[0]:
            axs[3].legend(h1 + h2, l1 + l2, fontsize=14, loc="center", frameon=False)
    ax = axs[2]
    names = [label(lang, en='integer\nWTA', zh='整数\nWTA', ja='整数\nWTA'), label(lang, en='WTA +\nparabola', zh='WTA +\n抛物线', ja='WTA +\n放物線'), "soft\n$\\tau=0.05$", "soft\n$\\tau=0.01$"]
    vals = []
    for z in (1 / inv_z[agg.argmin(0)], z_best2, soft_argmin(inv_z, agg, 0.05)[0], soft_argmin(inv_z, agg, 0.01)[0]):
        err = ((inv_z[0] - 1 / z) / step - i_gt)[inlier]
        vals.append(np.sqrt(np.mean(err ** 2)))
    ax.bar(range(4), vals, color=[PAL["gray"], PAL["dark"], PAL["b"], PAL["a"]])
    for i, v in enumerate(vals):
        ax.text(i, v + 0.03, "%.2f" % v, ha="center", fontsize=13)
    ax.set_xticks(range(4)); ax.set_xticklabels(names, fontsize=12)
    ax.set_ylabel(label(lang, en='RMS error (planes)', zh='RMS 误差（平面数）', ja='RMS 誤差（平面数）')); ax.set_title(label(lang, en='(c) %.0f%% of pixels', zh='(c) %.0f%% 的像素', ja='(c) 画素の %.0f%%') % (100 * inlier.mean()))
    fig.tight_layout()
    return fig, vals


# --------------------------------------------------------------------------------------------
# F9  monocular alignment
# --------------------------------------------------------------------------------------------
def fig_mono(lang):
    fig = plt.figure(figsize=(11, 9.4))
    gs = fig.add_gridspec(2, 2)
    axs = [fig.add_subplot(gs[0, 0]), fig.add_subplot(gs[0, 1]), fig.add_subplot(gs[1, :])]
    ax = axs[0]
    sub = np.random.default_rng(0).choice(H * W, 1500, replace=False)
    ax.scatter(pred.ravel()[sub], (1 / Z_gt).ravel()[sub], s=4, color=PAL["gray"], alpha=0.6)
    pp = np.linspace(pred.min(), pred.max(), 10)
    ax.plot(pp, s * pp + t, color=PAL["a"], lw=2.4, label="$w = %.3f\\,p %+.3f$" % (s, t))
    ax.set_xlabel(label(lang, en='prediction $p$', zh='预测 p', ja='予測 p')); ax.set_ylabel("$1/z^*$ (1/m)"); ax.legend(fontsize=13, loc="upper left")
    ax.set_title(label(lang, en='(a) affine in inverse depth', zh='(a) 逆深度上的仿射关系', ja='(a) 逆奥行きでアフィン'))
    ax = axs[1]
    im = ax.imshow(rel_err(z_al), cmap="magma", vmin=0, vmax=0.05, interpolation="nearest"); tick_off(ax)
    fig.colorbar(im, ax=ax, fraction=0.035, pad=0.02, ticks=[0, 0.01, 0.03, 0.05])
    ax.set_title(label(lang, en='(b) $|\\hat z - z^*|/z^*$ after alignment', zh='(b) 对齐后的相对误差', ja='(b) 位置合わせ後の相対誤差'))
    ax = axs[2]
    ns = sorted(anchor_rel)
    ax.plot(ns, [anchor_rel[n][0] for n in ns], "o-", color=PAL["a"], label=label(lang, en='median', zh='中位数', ja='中央値'))
    ax.plot(ns, [anchor_rel[n][1] for n in ns], "s--", color=PAL["b"], label=label(lang, en='90th pct.', zh='第 90 百分位', ja='90 パーセンタイル'))
    ax.axhline(depth_metrics(z_al, Z_gt)["AbsRel"], color=PAL["gray"], ls=":", lw=1.6)
    ax.axhline(depth_metrics(k_med / pred, Z_gt)["AbsRel"], color=PAL["x"], ls=":", lw=1.6)
    ax.text(3.2, depth_metrics(k_med / pred, Z_gt)["AbsRel"] - 0.008, label(lang, en='scale only', zh='只对齐尺度', ja='スケールのみ'), color=PAL["x"], fontsize=12)
    ax.text(150, depth_metrics(z_al, Z_gt)["AbsRel"] + 0.003, label(lang, en='all pixels', zh='全部像素', ja='全画素'), color=PAL["gray"], fontsize=12)
    ax.set_xscale("log"); ax.set_ylim(0, 0.13)
    ax.set_xlabel(label(lang, en='number of metric anchors', zh='度量锚点数', ja='メトリックアンカーの数')); ax.set_ylabel("AbsRel")
    ax.set_title(label(lang, en='(c) alignment from sparse anchors', zh='(c) 用稀疏锚点对齐', ja='(c) 疎なアンカーによる位置合わせ'))
    ax.legend(fontsize=12)
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F10  2D TSDF fusion
# --------------------------------------------------------------------------------------------
def fig_tsdf(lang):
    fig = plt.figure(figsize=(11, 10))
    gs = fig.add_gridspec(2, 2, height_ratios=[1.15, 0.85])
    axs = [fig.add_subplot(gs[0, 0]), fig.add_subplot(gs[0, 1]), fig.add_subplot(gs[1, :])]
    g = xs_g
    gx, gy = np.meshgrid(g, g)
    true_sdf = sdf_scene(np.stack([gx, gy], -1))
    T1, W1 = np.ones(len(grid)), np.zeros(len(grid))
    pos, ang, zm = poses[0]
    integrate(T1, W1, grid, pos, ang, zm)
    for ax, (TT, WW, ttl) in zip(axs[:2], ((T1, W1, label(lang, en='(a) one scan', zh='(a) 一次扫描', ja='(a) 1 回のスキャン')), (T, Wt, label(lang, en='(b) %d scans fused', zh='(b) 融合 %d 次扫描', ja='(b) %d スキャンを統合') % n_scans))):
        img = np.ma.masked_where(WW.reshape(201, 201) == 0, TT.reshape(201, 201))
        ax.imshow(img, origin="lower", extent=(-1.5, 1.5, -1.5, 1.5), cmap="RdBu", norm=TwoSlopeNorm(0, -1, 1),
                  interpolation="nearest")
        ax.contour(gx, gy, true_sdf, levels=[0], colors=[PAL["dark"]], linewidths=1.2, linestyles="--")
        ax.contour(gx, gy, np.where(WW.reshape(201, 201) > 0, TT.reshape(201, 201), np.nan), levels=[0],
                   colors=[PAL["a"]], linewidths=2.2)
        ax.set_aspect("equal"); ax.set_xlim(-2.15, 2.15); ax.set_ylim(-2.15, 2.15); ax.set_title(ttl)
        ax.add_patch(plt.Rectangle((-1.5, -1.5), 3, 3, fill=False, ec=PAL["gray"], lw=1, ls=":"))
        ax.grid(False)
    ax = axs[0]
    fwd, right = camera_axes(ang)
    n = len(zm)
    u = (np.arange(n) + 0.5 - n / 2) / ((n / 2) / np.tan(np.deg2rad(30)))
    for i in range(0, n, 8):
        if np.isfinite(zm[i]):
            p = pos + zm[i] * (fwd + u[i] * right)
            ax.plot([pos[0], p[0]], [pos[1], p[1]], color=PAL["light"], lw=0.8)
    ok = np.isfinite(zm)
    P = pos + zm[ok, None] * (fwd + u[ok, None] * right)
    ax.plot(P[:, 0], P[:, 1], ".", color=PAL["dark"], ms=3)
    ax.plot(*pos, "^", color=PAL["b"], ms=9)
    ax = axs[1]
    for (p_, a_, _) in poses[::3]:
        ax.plot(*p_, "^", color=PAL["b"], ms=6)
    ax = axs[2]
    ks = sorted(tsdf_err)
    ax.plot(ks, [1000 * tsdf_err[k] for k in ks], "o-", color=PAL["a"], label=label(lang, en='fused TSDF', zh='融合的 TSDF', ja='統合した TSDF'))
    ax.axhline(1000 * np.sqrt(np.mean(sdf_scene(raw) ** 2)), color=PAL["gray"], ls=":", lw=1.8, label=label(lang, en='raw points', zh='原始点', ja='生の点'))
    ax.set_xscale("log"); ax.set_xticks(ks); ax.set_xticklabels([str(k) for k in ks])
    ax.set_xlabel(label(lang, en='scans fused', zh='融合的扫描次数', ja='統合したスキャン数')); ax.set_ylabel(label(lang, en='RMS distance to surface (mm)', zh='到表面的 RMS 距离 (mm)', ja='表面までの RMS 距離 (mm)'))
    ax.set_ylim(0, None); ax.legend(fontsize=13); ax.set_title(label(lang, en='(c) error of the zero level set', zh='(c) 零水平集的误差', ja='(c) ゼロ等値線の誤差'))
    fig.tight_layout()
    return fig


if __name__ == "__main__":
    out(fig_depth_points(), "07-depth-and-points.svg")
    loc(fig_sensors, "07-sensors.svg")
    span = loc(fig_sweep_geometry, "07-sweep-geometry.svg")
    print("epipolar span of the 64 planes: %.1f px" % span)
    out(fig_sweep_warps(), "07-sweep-warps.svg")
    res = loc(fig_cost_curves, "07-cost-curves.svg")
    print("probe truth / estimate:", {k: tuple(round(float(x), 2) for x in v) for k, v in res.items()})
    loc(fig_sweep_result, "07-sweep-result.svg")
    loc(fig_patchmatch, "07-patchmatch.svg")
    loc(fig_soft_argmin, "07-soft-argmin.svg")
    loc(fig_mono, "07-mono-align.svg")
    loc(fig_tsdf, "07-tsdf.svg")
