"""Figures for 3d-vision post 03: features and matching.

Run from anywhere:
    python3 bin/figures/3d-vision/vision3d_03.py            # writes the SVGs
    python3 bin/figures/3d-vision/vision3d_03.py /tmp/prev  # ... and PNG previews into /tmp/prev

Every number shown in a figure (and quoted in the post's captions) is computed here, from the
post's own code, which is copied verbatim below in the order of the post (make_scene, harris,
build_dog, detect_dog, orientations, sift_descriptor, sift, match_descriptors, ransac_homography,
ransac_iterations, robust_line, brief, sinkhorn_dustbin, lk_window, lk_pyramid), including the
print statements whose output the post quotes. Only the OpenCV snippet is not repeated here.
Image coordinates: x to the right, y down, pixel (x, y) is img[y, x].
"""
import os
import sys
import pathlib

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

plt.rcParams["svg.hashsalt"] = "3d-vision-03"  # stable element ids

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


def make_scene(h=240, w=320, n_shapes=120, seed=0):
    """A synthetic 'poster': random rectangles, disks and triangles on a smooth background."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    img = 0.5 + 0.15 * np.sin(xx / 37.0) * np.cos(yy / 23.0)
    for _ in range(n_shapes):
        kind, val = rng.integers(3), rng.uniform(0.0, 1.0)
        cx, cy, r = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(4, 22)
        if kind == 0:                                    # axis-aligned rectangle
            m = (abs(xx - cx) < r) & (abs(yy - cy) < r * rng.uniform(0.4, 1.0))
        elif kind == 1:                                  # disk
            m = (xx - cx) ** 2 + (yy - cy) ** 2 < r * r
        else:                                            # triangle = three half-planes
            a = rng.uniform(0, 2 * np.pi) + np.array([0.0, 2.1, 4.2])
            px, py = cx + r * np.cos(a), cy + r * np.sin(a)
            m = np.ones((h, w), bool)
            for i in range(3):
                j = (i + 1) % 3
                m &= (px[j] - px[i]) * (yy - py[i]) - (py[j] - py[i]) * (xx - px[i]) > 0
        img[m] = val
    return ndi.gaussian_filter(img, 0.7)


def warp_homography(img, H, shape):
    """out(x2) = img(H^-1 x2), bilinear; pixels that fall outside get 0.5 (gray)."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    p = np.linalg.inv(H) @ np.stack([xx.ravel(), yy.ravel(), np.ones(h * w)])
    return ndi.map_coordinates(img, [p[1] / p[2], p[0] / p[2]], order=1, cval=0.5).reshape(h, w)


def apply_h(H, p):
    q = np.c_[p, np.ones(len(p))] @ H.T
    with np.errstate(divide="ignore", invalid="ignore"):   # degenerate hypotheses -> inf / nan
        return q[:, :2] / q[:, 2:]


img = make_scene()                                       # 240 x 320, values in [0, 1]
# image 2: rotate by 25 deg, scale by 0.8 about the centre, add mild perspective, change
# brightness and contrast, add noise. H_true maps pixels of img to pixels of img2.
th, s, c = np.deg2rad(25), 0.8, np.array([160.0, 120.0])
A = s * np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
H_true = np.eye(3); H_true[:2, :2] = A; H_true[:2, 2] = c - A @ c + [10, -6]
H_true[2, :2] = [2e-4, -1e-4]
img2 = 0.85 * warp_homography(img, H_true, img.shape) + 0.1
img2 += np.random.default_rng(1).normal(0, 0.01, img.shape)


# ---- harris ----------------------------------------------------------------------
def structure_tensor(img, sigma_d=1.0, sigma_i=2.0):
    """Gaussian-derivative gradients, then Gaussian-weighted sums of their products."""
    Ix = ndi.gaussian_filter(img, sigma_d, order=(0, 1))   # d/dx (axis 1 = columns)
    Iy = ndi.gaussian_filter(img, sigma_d, order=(1, 0))   # d/dy (axis 0 = rows)
    Sxx = ndi.gaussian_filter(Ix * Ix, sigma_i)
    Sxy = ndi.gaussian_filter(Ix * Iy, sigma_i)
    Syy = ndi.gaussian_filter(Iy * Iy, sigma_i)
    return Sxx, Sxy, Syy


def harris(img, k=0.05, **kw):
    Sxx, Sxy, Syy = structure_tensor(img, **kw)
    det, tr = Sxx * Syy - Sxy ** 2, Sxx + Syy
    R = det - k * tr ** 2                                  # Harris-Stephens response
    lam_min = tr / 2 - np.sqrt((Sxx - Syy) ** 2 / 4 + Sxy ** 2)   # Shi-Tomasi score
    return R, lam_min


def nms_peaks(score, radius=4, rel_thresh=0.01, max_n=None):
    """Local maxima in a (2r+1)^2 window above rel_thresh * max, strongest first, as (x, y)."""
    peak = (score == ndi.maximum_filter(score, size=2 * radius + 1)) & (score > rel_thresh * score.max())
    ys, xs = np.nonzero(peak)
    order = np.argsort(-score[ys, xs])
    return np.stack([xs, ys], 1)[order][:max_n]


R, lam_min = harris(img)
corners = nms_peaks(R, radius=4, rel_thresh=0.01)
print("Harris corners:", len(corners), " strongest at (x, y) =", corners[0])
print("R > 0 (corner-like) pixels: %.1f%%   R < 0 (edge-like): %.1f%%"
      % (100 * np.mean(R > 1e-6), 100 * np.mean(R < -1e-6)))


# ---- dog ----------------------------------------------------------------------
def build_dog(img, n_oct=4, S=3, sigma0=1.6, sigma_in=0.5):
    """Gaussian and difference-of-Gaussian pyramids: octave o has S+3 levels sigma0 * 2^(s/S)."""
    gauss, dogs = [], []
    base = ndi.gaussian_filter(img, np.sqrt(sigma0 ** 2 - sigma_in ** 2))
    for o in range(n_oct):
        sig = sigma0 * 2.0 ** (np.arange(S + 3) / S)
        L = np.stack([base] + [ndi.gaussian_filter(base, np.sqrt(s ** 2 - sigma0 ** 2)) for s in sig[1:]])
        gauss.append(L)
        dogs.append(L[1:] - L[:-1])        # S+2 DoG levels
        base = L[S][::2, ::2]              # blur 2*sigma0 here = sigma0 at half resolution
    return gauss, dogs


def detect_dog(dogs, S=3, sigma0=1.6, contrast=0.015, r_edge=10.0):
    """Scale-space extrema of the DoG, refined to sub-pixel, with low-contrast and edge rejection.
    Returns rows (x, y, sigma) in input-image pixels plus (octave, level)."""
    kps = []
    for o, D in enumerate(dogs):
        ext = (D == ndi.maximum_filter(D, size=3)) | (D == ndi.minimum_filter(D, size=3))
        ext &= np.abs(D) > 0.5 * contrast
        ext[[0, -1]] = False                                  # need a level above and below
        ext[:, :2] = ext[:, -2:] = False; ext[:, :, :2] = ext[:, :, -2:] = False
        for s, y, x in zip(*np.nonzero(ext)):
            c = D[s, y, x]
            g = 0.5 * np.array([D[s, y, x + 1] - D[s, y, x - 1],
                                D[s, y + 1, x] - D[s, y - 1, x],
                                D[s + 1, y, x] - D[s - 1, y, x]])
            dxx = D[s, y, x + 1] + D[s, y, x - 1] - 2 * c
            dyy = D[s, y + 1, x] + D[s, y - 1, x] - 2 * c
            dss = D[s + 1, y, x] + D[s - 1, y, x] - 2 * c
            dxy = 0.25 * (D[s, y + 1, x + 1] - D[s, y + 1, x - 1] - D[s, y - 1, x + 1] + D[s, y - 1, x - 1])
            dxs = 0.25 * (D[s + 1, y, x + 1] - D[s + 1, y, x - 1] - D[s - 1, y, x + 1] + D[s - 1, y, x - 1])
            dys = 0.25 * (D[s + 1, y + 1, x] - D[s + 1, y - 1, x] - D[s - 1, y + 1, x] + D[s - 1, y - 1, x])
            Hm = np.array([[dxx, dxy, dxs], [dxy, dyy, dys], [dxs, dys, dss]])
            try:
                off = -np.linalg.solve(Hm, g)                  # quadratic fit: x_hat = -H^-1 g
            except np.linalg.LinAlgError:
                continue
            if np.abs(off).max() > 0.5:                        # extremum belongs to a neighbour
                continue
            if abs(c + 0.5 * g @ off) < contrast:              # low contrast
                continue
            tr, det = dxx + dyy, dxx * dyy - dxy ** 2          # 2x2 spatial Hessian
            if det <= 0 or tr ** 2 * r_edge >= (r_edge + 1) ** 2 * det:   # edge-like
                continue
            sigma = sigma0 * 2 ** ((s + off[2]) / S)
            kps.append(((x + off[0]) * 2 ** o, (y + off[1]) * 2 ** o, sigma * 2 ** o, o, s))
    return kps


gauss, dogs = build_dog(img)
kps = detect_dog(dogs)
sig = np.array([k[2] for k in kps])
print("DoG keypoints:", len(kps), "  per octave:", np.bincount([k[3] for k in kps]))
print("sigma range: %.2f .. %.2f px" % (sig.min(), sig.max()))


# ---- desc ----------------------------------------------------------------------
def orientations(gx, gy, x, y, sigma, nbins=36, peak_ratio=0.8):
    """Dominant gradient directions (radians) in a Gaussian window of std 1.5*sigma around (x, y)."""
    r = int(round(4.5 * sigma))
    xi, yi = int(round(x)), int(round(y))
    y0, y1 = max(yi - r, 0), min(yi + r + 1, gx.shape[0])
    x0, x1 = max(xi - r, 0), min(xi + r + 1, gx.shape[1])
    yy, xx = np.mgrid[y0:y1, x0:x1]
    w = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * (1.5 * sigma) ** 2))
    mag = np.hypot(gx[y0:y1, x0:x1], gy[y0:y1, x0:x1])
    ang = np.arctan2(gy[y0:y1, x0:x1], gx[y0:y1, x0:x1]) % (2 * np.pi)
    hist = np.bincount((ang / (2 * np.pi) * nbins).astype(int).ravel() % nbins,
                       weights=(w * mag).ravel(), minlength=nbins)
    hist = (np.roll(hist, 1) + 2 * hist + np.roll(hist, -1)) / 4          # smooth once
    out = []
    for i in range(nbins):
        l, c, rr = hist[i - 1], hist[i], hist[(i + 1) % nbins]
        if c > l and c > rr and c >= peak_ratio * hist.max():
            di = 0.5 * (l - rr) / (l - 2 * c + rr)                        # parabolic peak
            out.append(((i + 0.5 + di) / nbins * 2 * np.pi) % (2 * np.pi))
    return out


def sift_descriptor(gx, gy, x, y, sigma, theta, d=4, nb=8):
    """d x d cells x nb orientation bins over a window of d cells, each 3*sigma wide, rotated by theta."""
    n = 4 * d                                                # 16 x 16 samples
    u = ((np.arange(n) + 0.5) / n - 0.5) * d                 # sample coordinates in cell units
    U, V = np.meshgrid(u, u)
    c, s = np.cos(theta), np.sin(theta)
    X = x + 3 * sigma * (c * U - s * V)
    Y = y + 3 * sigma * (s * U + c * V)
    GX = ndi.map_coordinates(gx, [Y, X], order=1, mode="nearest")
    GY = ndi.map_coordinates(gy, [Y, X], order=1, mode="nearest")
    gu, gv = c * GX + s * GY, -s * GX + c * GY               # gradients in the keypoint frame
    mag = np.hypot(gu, gv) * np.exp(-(U ** 2 + V ** 2) / (2 * (d / 2) ** 2))
    ob = (np.arctan2(gv, gu) % (2 * np.pi) / (2 * np.pi) * nb).astype(int) % nb
    ci = np.clip((U + d / 2).astype(int), 0, d - 1)
    cj = np.clip((V + d / 2).astype(int), 0, d - 1)
    desc = np.zeros((d, d, nb))
    np.add.at(desc, (cj, ci, ob), mag)
    desc = desc.ravel() / (np.linalg.norm(desc) + 1e-12)
    desc = np.minimum(desc, 0.2)                              # damp large gradients (illumination)
    return desc / (np.linalg.norm(desc) + 1e-12)


def sift(img, n_oct=4, S=3):
    """Mini-SIFT: returns keypoints (x, y, sigma, theta) and 128-D descriptors."""
    gauss, dogs = build_dog(img, n_oct, S)
    grads = [[np.gradient(L) for L in G] for G in gauss]     # (d/dy, d/dx) of every level
    K, Dsc = [], []
    for x, y, sigma, o, s in detect_dog(dogs, S):
        gy, gx = grads[o][s]
        xo, yo, so = x / 2 ** o, y / 2 ** o, sigma / 2 ** o  # octave pixel units
        for th in orientations(gx, gy, xo, yo, so):
            K.append((x, y, sigma, th))
            Dsc.append(sift_descriptor(gx, gy, xo, yo, so, th))
    return np.array(K), np.array(Dsc)


kp1, d1 = sift(img)
print("keypoints with orientation:", len(kp1), " descriptor shape:", d1.shape)


# ---- brief ----------------------------------------------------------------------
def brief_pattern(n_bits=256, S=31, seed=0):
    """BRIEF test pairs (a_k, b_k), offsets drawn i.i.d. from N(0, S^2/25) inside an S x S patch."""
    rng = np.random.default_rng(seed)
    return np.clip(np.round(rng.normal(0, S / 5, (n_bits, 4))), -(S // 2), S // 2)


def ic_angle(img, x, y, r=15):
    """ORB orientation: direction from the keypoint to the intensity centroid of a disk."""
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    disk = xx ** 2 + yy ** 2 <= r * r
    I = ndi.map_coordinates(img, [y + yy[disk], x + xx[disk]], order=1)
    return np.arctan2(I @ yy[disk], I @ xx[disk])          # atan2(m01, m10)


def brief(img, pts, pattern, steer=False):
    """Bit k = [I(p + a_k) < I(p + b_k)] on a smoothed image, packed into bytes (256 bits = 32 B)."""
    sm = ndi.gaussian_filter(img, 2.0)
    out = []
    for x, y in pts:
        a, b = pattern[:, :2], pattern[:, 2:]
        if steer:                                           # rotate the pattern (steered BRIEF)
            c, s = np.cos(ic_angle(img, x, y)), np.sin(ic_angle(img, x, y))
            Rm = np.array([[c, -s], [s, c]])
            a, b = a @ Rm.T, b @ Rm.T
        Ia = ndi.map_coordinates(sm, [y + a[:, 1], x + a[:, 0]], order=1)
        Ib = ndi.map_coordinates(sm, [y + b[:, 1], x + b[:, 0]], order=1)
        out.append(np.packbits(Ia < Ib))
    return np.array(out)


def hamming(B1, B2):
    """All pairwise Hamming distances: XOR then popcount."""
    return np.unpackbits(B1[:, None] ^ B2[None], axis=2).sum(2)


# Harris corners of image 1 and their true positions in image 2 (25 deg rotation)
pts1 = nms_peaks(harris(img)[0], radius=6, rel_thresh=0.02).astype(float)
pts2 = apply_h(H_true, pts1)
ok = np.all((pts2 > 20) & (pts2 < [300, 220]), axis=1) & np.all((pts1 > 20) & (pts1 < [300, 220]), axis=1)
pts1, pts2 = pts1[ok], pts2[ok]
pat = brief_pattern()
for steer in (False, True):
    Hd = hamming(brief(img, pts1, pat, steer), brief(img2, pts2, pat, steer))
    same, diff = np.diag(Hd), Hd[~np.eye(len(Hd), dtype=bool)]
    correct = np.mean(np.argmin(Hd, axis=1) == np.arange(len(Hd)))
    print("steered=%-5s  Hamming true pairs %.0f, other pairs %.0f, NN correct %.0f%% (%d points)"
          % (steer, np.median(same), np.median(diff), 100 * correct, len(Hd)))


# ---- match ----------------------------------------------------------------------
def match_descriptors(d1, d2, ratio=0.8, mutual=True):
    """Nearest neighbour in L2 with Lowe's ratio test and an optional mutual (cross) check."""
    D = np.sqrt(np.maximum((d1 ** 2).sum(1)[:, None] + (d2 ** 2).sum(1)[None] - 2 * d1 @ d2.T, 0))
    nn = np.argsort(D, axis=1)[:, :2]
    i = np.arange(len(d1))
    r = D[i, nn[:, 0]] / D[i, nn[:, 1]]                   # distance ratio d1 / d2
    keep = r < ratio
    if mutual:
        keep &= np.argmin(D, axis=0)[nn[:, 0]] == i       # j's nearest neighbour is i, too
    return np.stack([i[keep], nn[keep, 0]], 1), r


kp2, d2 = sift(img2)
m, ratio = match_descriptors(d1, d2)
err = np.linalg.norm(apply_h(H_true, kp1[m[:, 0], :2]) - kp2[m[:, 1], :2], axis=1)
print("keypoints: %d / %d   tentative matches: %d   correct (< 3 px): %d"
      % (len(kp1), len(kp2), len(m), (err < 3).sum()))


# ---- ransac ----------------------------------------------------------------------
def normalize_pts(p):
    """Hartley normalization: centroid to the origin, mean distance sqrt(2)."""
    c = p.mean(0)
    s = np.sqrt(2) / np.mean(np.linalg.norm(p - c, axis=1))
    return (p - c) * s, np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])


def homography_dlt(p1, p2):
    """Normalized DLT (post 02): H with p2 ~ H p1 from n >= 4 correspondences."""
    q1, T1 = normalize_pts(p1)
    q2, T2 = normalize_pts(p2)
    A = []
    for (x, y), (u, v) in zip(q1, q2):
        A.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        A.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    H = np.linalg.svd(np.array(A))[2][-1].reshape(3, 3)
    H = np.linalg.inv(T2) @ H @ T1
    return H / H[2, 2]


def ransac_homography(p1, p2, thresh=3.0, conf=0.999, max_iter=10000, seed=0):
    """RANSAC with the adaptive stopping rule N = log(1-p) / log(1-w^4)."""
    rng = np.random.default_rng(seed)
    best, N, it = np.zeros(len(p1), bool), max_iter, 0
    while it < N:
        idx = rng.choice(len(p1), 4, replace=False)          # minimal sample
        H = homography_dlt(p1[idx], p2[idx])                 # hypothesis
        inl = np.linalg.norm(apply_h(H, p1) - p2, axis=1) < thresh   # consensus set
        if inl.sum() > best.sum():
            best = inl
            w = inl.mean()                                   # current inlier-ratio estimate
            N = min(max_iter, np.log(1 - conf) / np.log(max(1 - w ** 4, 1e-12)))
        it += 1
    H = homography_dlt(p1[best], p2[best])                   # refit on all inliers
    return H, np.linalg.norm(apply_h(H, p1) - p2, axis=1) < thresh, it


# plain nearest-neighbour matches (no ratio test): about half of them are wrong
m_nn, _ = match_descriptors(d1, d2, ratio=1.01, mutual=False)
p1, p2 = kp1[m_nn[:, 0], :2], kp2[m_nn[:, 1], :2]
H, inl, iters = ransac_homography(p1, p2)
box = np.array([[0, 0], [319, 0], [319, 239], [0, 239]], float)
print("matches %d, RANSAC inliers %d after %d iterations" % (len(p1), inl.sum(), iters))
print("corner error of H vs ground truth: %.2f px (max)"
      % np.linalg.norm(apply_h(H, box) - apply_h(H_true, box), axis=1).max())
H_ls = homography_dlt(p1, p2)                                # no robustness at all
print("corner error of plain least squares: %.0f px"
      % np.linalg.norm(apply_h(H_ls, box) - apply_h(H_true, box), axis=1).max())


# ---- iters ----------------------------------------------------------------------
def ransac_iterations(eps, s, p=0.99):
    """Samples needed so that, with probability p, at least one of size s is outlier-free."""
    return int(np.ceil(np.log(1 - p) / np.log(1 - (1 - eps) ** s)))


print("outlier ratio:   " + "".join("%8.0f%%" % (100 * e) for e in (0.1, 0.3, 0.5, 0.7, 0.8)))
for s, name in [(2, "line"), (3, "P3P"), (4, "homography"), (5, "essential"), (7, "F 7-pt"), (8, "F 8-pt")]:
    print("s=%d %-11s" % (s, name) + "".join("%9d" % ransac_iterations(e, s) for e in (0.1, 0.3, 0.5, 0.7, 0.8)))


# ---- variants ----------------------------------------------------------------------
def fit_line(P):
    """Total least squares line {x : n.x = d}, |n| = 1."""
    c = P.mean(0)
    n = np.linalg.svd(P - c)[2][-1]
    return n, n @ c


def robust_line(P, t, iters, score="ransac", lo=False, seed=0):
    """RANSAC (inlier count) or MSAC (truncated quadratic) with optional local optimization."""
    rng = np.random.default_rng(seed)
    cost = lambda e: -(e < t).sum() if score == "ransac" else np.minimum(e ** 2, t ** 2).sum()
    best, best_c = None, np.inf
    for _ in range(iters):
        n, d = fit_line(P[rng.choice(len(P), 2, replace=False)])
        c = cost(np.abs(P @ n - d))
        if c < best_c and lo:                        # LO: polish every new best model
            for _ in range(5):
                inl = np.abs(P @ n - d) < t
                if inl.sum() < 3:
                    break
                n2, d2 = fit_line(P[inl])
                c2 = cost(np.abs(P @ n2 - d2))
                if c2 >= c:
                    break
                n, d, c = n2, d2, c2
        if c < best_c:
            best, best_c = (n, d), c
    n, d = best
    return fit_line(P[np.abs(P @ n - d) < t])        # final refit on the consensus set


def line_error(model, truth=(np.array([-0.6, 0.8]), 20.0)):
    """Largest distance between the two lines over x in [0, 100] (in units of the noise sigma = 1)."""
    (n, d), (n0, d0) = model, truth
    xs = np.array([0.0, 100.0])
    ys = (d0 - n0[0] * xs) / n0[1]                    # two points on the true line
    return np.abs(np.c_[xs, ys] @ n - d).max()


def make_line_data(n_pts, eps, rng, sigma=1.0):
    n0, d0 = np.array([-0.6, 0.8]), 20.0              # true line 0.8 y - 0.6 x = 20
    k = int(round(n_pts * (1 - eps)))
    x = rng.uniform(0, 100, k)
    P_in = np.c_[x, (d0 + 0.6 * x) / 0.8] + rng.normal(0, sigma, (k, 2))
    P_out = rng.uniform([0, 0], [100, 100], (n_pts - k, 2))
    return np.r_[P_in, P_out]


rng = np.random.default_rng(0)
eps, t = 0.6, 2.5
N = ransac_iterations(eps, 2)
errs = {k: [] for k in ("LS", "RANSAC", "MSAC", "LO-RANSAC")}
for trial in range(200):
    P = make_line_data(200, eps, rng)
    errs["LS"].append(line_error(fit_line(P)))
    errs["RANSAC"].append(line_error(robust_line(P, t, N, "ransac", seed=trial)))
    errs["MSAC"].append(line_error(robust_line(P, t, N, "msac", seed=trial)))
    errs["LO-RANSAC"].append(line_error(robust_line(P, t, N, "msac", lo=True, seed=trial)))
print("eps = %.1f, N = %d samples; median / 95th-percentile line error:" % (eps, N))
for k, v in errs.items():
    print("  %-10s %6.2f  %6.2f" % (k, np.median(v), np.percentile(v, 95)))


# ---- sinkhorn ----------------------------------------------------------------------
from scipy.special import logsumexp


def sinkhorn_dustbin(S, alpha, iters=100):
    """SuperGlue's partial assignment: append a dustbin row and column with score alpha, then
    alternately normalize rows and columns in the log domain. Real rows/columns get mass 1,
    the dustbins get mass N and M, so every point can be matched at most once or not at all."""
    M, N = S.shape
    Z = np.full((M + 1, N + 1), float(alpha))
    Z[:M, :N] = S
    log_a = np.log(np.r_[np.ones(M), N])                  # row marginals
    log_b = np.log(np.r_[np.ones(N), M])                  # column marginals
    u, v = np.zeros(M + 1), np.zeros(N + 1)
    for _ in range(iters):
        u = log_a - logsumexp(Z + v[None, :], axis=1)
        v = log_b - logsumexp(Z + u[:, None], axis=0)
    return np.exp(Z + u[:, None] + v[None, :])


S = np.array([[12.0, 1.5, 0.6],     # A0 clearly matches B0
              [0.9, 7.8, 8.4],      # A1 is ambiguous between B1 and B2 ...
              [0.3, 1.2, 12.6],     # ... but B2 is clearly taken by A2
              [1.8, 2.7, 2.1]])     # A3 has no partner (occluded)
P = sinkhorn_dustbin(S, alpha=4.0)
np.set_printoptions(precision=2, suppress=True)
print(P)
print("row-wise argmax of S:", S.argmax(1), "  argmax of P (3 = dustbin):", P[:4].argmax(1))


# ---- lk ----------------------------------------------------------------------
def lk_window(I, J, x, y, d0=(0.0, 0.0), half=7, iters=30):
    """Iterative Lucas-Kanade for the (2*half+1)^2 window at integer (x, y):
    find d with J(p + d) = I(p). Returns d and the eigenvalues of the 2x2 matrix M."""
    Iy, Ix = np.gradient(I)
    ys, xs = np.mgrid[y - half:y + half + 1, x - half:x + half + 1]
    gx, gy, T = Ix[ys, xs].ravel(), Iy[ys, xs].ravel(), I[ys, xs].ravel()
    M = np.array([[gx @ gx, gx @ gy], [gx @ gy, gy @ gy]])        # = structure tensor (box window)
    d = np.array(d0, float)
    for _ in range(iters):
        e = ndi.map_coordinates(J, [ys.ravel() + d[1], xs.ravel() + d[0]], order=1) - T
        step = np.linalg.solve(M, -np.array([gx @ e, gy @ e]))   # Gauss-Newton step
        d += step
        if np.linalg.norm(step) < 1e-3:
            break
    return d, np.linalg.eigvalsh(M)


def lk_pyramid(I, J, x, y, levels=3, **kw):
    """Coarse-to-fine LK: solve at 1/4 resolution, double, refine at 1/2, double, refine."""
    PI, PJ = [I], [J]
    for _ in range(levels - 1):
        PI.append(ndi.gaussian_filter(PI[-1], 1.0)[::2, ::2])
        PJ.append(ndi.gaussian_filter(PJ[-1], 1.0)[::2, ::2])
    d = np.zeros(2)
    for l in reversed(range(levels)):
        d, _ = lk_window(PI[l], PJ[l], int(round(x / 2 ** l)), int(round(y / 2 ** l)), d, **kw)
        if l > 0:
            d = 2 * d
    return d


I = ndi.gaussian_filter(img, 1.0)
pts = [(x, y) for x, y in nms_peaks(harris(I)[0], radius=6)[:25] if 30 < x < 290 and 30 < y < 210]
for true_d in ([0.6, -0.4], [5.3, -3.6], [12.0, 7.0]):         # pure translations, in pixels
    J = warp_homography(I, np.array([[1, 0, true_d[0]], [0, 1, true_d[1]], [0, 0, 1.0]]), I.shape)
    ok1 = sum(np.linalg.norm(lk_window(I, J, x, y)[0] - true_d) < 0.1 for x, y in pts)
    ok2 = sum(np.linalg.norm(lk_pyramid(I, J, x, y) - true_d) < 0.1 for x, y in pts)
    print("motion %-12s single-level LK %2d/%d, pyramidal LK %2d/%d within 0.1 px"
          % (true_d, ok1, len(pts), ok2, len(pts)))

# ============================================================================================
# Figures
# ============================================================================================
from matplotlib.patches import Circle, Ellipse, Rectangle  # noqa: E402
from matplotlib.colors import TwoSlopeNorm  # noqa: E402

GRAY = dict(cmap="gray", vmin=0, vmax=1, interpolation="nearest")


def loc(fig_fn, name):
    """Render a figure with words once per language: name_{en,zh,ja}.svg."""
    for lang in LANGS:
        fig = fig_fn(lang)
        out(fig, name.replace(".svg", "_%s.svg" % lang))


def tick_off(ax):
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)


# --------------------------------------------------------------------------------------------
# F1  local auto-correlation E(u, v) for a flat, an edge and a corner window
# --------------------------------------------------------------------------------------------
Is = ndi.gaussian_filter(img, 1.0)                     # the image whose gradients we use
Sxx, Sxy, Syy = structure_tensor(img)
TR = Sxx + Syy
LMIN = TR / 2 - np.sqrt((Sxx - Syy) ** 2 / 4 + Sxy ** 2)
LMAX = TR / 2 + np.sqrt((Sxx - Syy) ** 2 / 4 + Sxy ** 2)
inner = np.zeros(img.shape, bool); inner[25:-25, 25:-25] = True
c_xy = tuple(nms_peaks(harris(img)[0], radius=4)[0])
yy_, xx_ = np.mgrid[0:img.shape[0], 0:img.shape[1]]
far = np.hypot(xx_ - c_xy[0], yy_ - c_xy[1]) > 40                 # not the same shape as the corner
edge_score = np.where(inner & far & (LMIN < 0.02 * LMAX), LMAX, 0)
e_yx = np.unravel_index(np.argmax(edge_score), img.shape)
mid = (ndi.uniform_filter(img, 15) > 0.3) & (ndi.uniform_filter(img, 15) < 0.7)   # mid-gray area
flat_score = np.where(inner & mid, ndi.uniform_filter(TR, 15), np.inf)
f_yx = np.unravel_index(np.argmin(flat_score), img.shape)
F1_PTS = {"flat": (f_yx[1], f_yx[0]), "edge": (e_yx[1], e_yx[0]), "corner": c_xy}


def autocorr(x, y, rng_=6, n=49, sigma_i=2.0):
    """E(u, v) = sum_w w(p) [I(p + (u, v)) - I(p)]^2 with a normalized Gaussian window."""
    r = int(3 * sigma_i)
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    w = np.exp(-(xx ** 2 + yy ** 2) / (2 * sigma_i ** 2)); w /= w.sum()
    base = Is[y + yy, x + xx]
    us = np.linspace(-rng_, rng_, n)
    E = np.zeros((n, n))
    for i, v in enumerate(us):
        for j, u in enumerate(us):
            sh = ndi.map_coordinates(Is, [y + yy + v, x + xx + u], order=1)
            E[i, j] = (w * (sh - base) ** 2).sum()
    return us, E


def fig_autocorr(lang):
    names = {"flat": label(lang, "flat", "平坦区域", "平坦部"),
             "edge": label(lang, "edge", "边缘", "エッジ"),
             "corner": label(lang, "corner", "角点", "コーナー")}
    fig, axs = plt.subplots(2, 3, figsize=(10.5, 7.2), gridspec_kw=dict(height_ratios=[1, 1.08]))
    emax = 0
    data = {}
    for k, (x, y) in F1_PTS.items():
        us, E = autocorr(x, y)
        M = np.array([[Sxx[y, x], Sxy[y, x]], [Sxy[y, x], Syy[y, x]]])
        data[k] = (us, E, M)
        emax = max(emax, E.max())
    for col, (k, (x, y)) in enumerate(F1_PTS.items()):
        us, E, M = data[k]
        ax = axs[0, col]
        h = 15
        ax.imshow(img[y - h:y + h + 1, x - h:x + h + 1], **GRAY, extent=(-h - .5, h + .5, h + .5, -h - .5))
        ax.add_patch(Circle((0, 0), 6, fill=False, ec=C["light"], lw=2.5))
        ax.plot(0, 0, "+", color=C["light"], ms=12, mew=2)
        tick_off(ax)
        ax.set_title("%s  (%d, %d)" % (names[k], x, y), fontsize=15)
        ax = axs[1, col]
        ax.contourf(us, us, E, levels=np.linspace(0, emax, 15), cmap="viridis")
        U, V = np.meshgrid(us, us)
        Q = M[0, 0] * U ** 2 + 2 * M[0, 1] * U * V + M[1, 1] * V ** 2
        lev = [l for l in (np.array([0.05, 0.15, 0.3]) * emax) if l < Q.max()]
        if lev:
            ax.contour(us, us, Q, levels=lev, colors="w", linestyles="--", linewidths=1.8)
        lam = np.linalg.eigvalsh(M)
        ax.set_title(r"$\lambda_1=%.4f,\ \lambda_2=%.4f$" % (lam[1], lam[0]), fontsize=14)
        ax.set_xlabel("$u$"); ax.set_aspect("equal"); ax.grid(False)
        ax.invert_yaxis()
        if col == 0:
            ax.set_ylabel("$v$")
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F2  Harris response, detected corners and the eigenvalue plane
# --------------------------------------------------------------------------------------------
K_H = 0.05
C_R0 = ((1 - 2 * K_H) - np.sqrt((1 - 2 * K_H) ** 2 - 4 * K_H ** 2)) / (2 * K_H)   # R = 0 <=> l2 = c l1
print("Harris R > 0  <=>  lambda_min / lambda_max > %.4f  (k = %.2f)" % (C_R0, K_H))


def fig_harris(lang):
    R, lmin = harris(img)
    hc = nms_peaks(R, radius=4, rel_thresh=0.01)
    st = nms_peaks(lmin, radius=4, rel_thresh=0.05)
    fig = plt.figure(figsize=(10.5, 7.6))
    gs = fig.add_gridspec(2, 2, height_ratios=[1, 1.05])
    ax = fig.add_subplot(gs[0, 0])
    ax.imshow(img, **GRAY)
    ax.plot(hc[:, 0], hc[:, 1], "+", color=C["x"], ms=9, mew=2, label="Harris (%d)" % len(hc))
    ax.plot(st[:, 0], st[:, 1], "o", mfc="none", mec=C["c"], ms=8, mew=1.6, label="Shi-Tomasi (%d)" % len(st))
    ax.legend(loc="lower left", fontsize=13, framealpha=0.9)
    tick_off(ax); ax.set_title(label(lang, "image and detected corners", "图像与检测到的角点", "画像と検出されたコーナー"), fontsize=14)
    ax = fig.add_subplot(gs[0, 1])
    v = np.sign(R) * np.sqrt(np.abs(R))
    a = np.abs(v).max() * 0.6
    ax.imshow(v, cmap="RdBu_r", norm=TwoSlopeNorm(0, -a, a))
    tick_off(ax)
    ax.set_title(label(lang, "sign(R)\u00b7\u221a|R|: red R > 0, blue R < 0",
                       "sign(R)\u00b7\u221a|R|：红 R > 0，蓝 R < 0",
                       "sign(R)\u00b7\u221a|R|：赤 R > 0、青 R < 0"), fontsize=14)
    ax = fig.add_subplot(gs[1, :])
    sel = inner.ravel()
    l1, l2 = LMAX.ravel()[sel], LMIN.ravel()[sel]
    rng_ = np.random.default_rng(0)
    pick = rng_.choice(len(l1), 6000, replace=False)
    l1, l2 = l1[pick], l2[pick]
    Rv = l1 * l2 - K_H * (l1 + l2) ** 2
    thr = 0.01 * R.max()
    cls = np.where(Rv > thr, 2, np.where(Rv < -thr, 1, 0))
    for c_, col, nm in [(0, C["gray"], label(lang, "flat", "平坦", "平坦")),
                        (1, C["z"], label(lang, "edge", "边缘", "エッジ")),
                        (2, C["x"], label(lang, "corner", "角点", "コーナー"))]:
        m_ = cls == c_
        ax.scatter(l1[m_], l2[m_], s=9, color=col, alpha=0.55, label=nm, lw=0, rasterized=True)
    L = np.linspace(0, LMAX.max() * 1.02, 400)
    ax.plot(L, C_R0 * L, color=C["dark"], lw=2, label=r"$R=0$: $\lambda_2=%.3f\,\lambda_1$" % C_R0)
    # R = thr: solve l2 from l1 l2 - k (l1 + l2)^2 = thr (larger root)
    aq, bq, cq = -K_H, L * (1 - 2 * K_H), -K_H * L ** 2 - thr
    disc = bq ** 2 - 4 * aq * cq
    ok = disc >= 0
    r2 = (-bq[ok] + np.sqrt(disc[ok])) / (2 * aq)
    ax.plot(L[ok], r2, "--", color=C["x"], lw=2, label=r"$R=0.01\,R_{\max}$")
    ax.axhline(0.05 * LMIN.max(), color=C["c"], lw=2, ls=":", label=r"$\lambda_2=0.05\,\lambda_{2,\max}$ (Shi-Tomasi)")
    ax.set_xlim(0, L[-1]); ax.set_ylim(0, LMIN.max() * 1.05)
    ax.set_xlabel(label(lang, "\u03bb\u2081 (larger eigenvalue)", "\u03bb\u2081（较大特征值）", "\u03bb\u2081（大きい固有値）"))
    ax.set_ylabel(r"$\lambda_2$")
    ax.legend(fontsize=13, loc="upper left", ncol=2, markerscale=2.5)
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F3  automatic scale selection with the scale-normalized Laplacian
# --------------------------------------------------------------------------------------------
def fig_scale(lang):
    sig = np.linspace(1.0, 16, 151)
    fig, axs = plt.subplots(1, 2, figsize=(10.5, 4.6))
    ax = axs[0]
    yy, xx = np.mgrid[-60:61, -60:61]
    for r, col in [(3, C["x"]), (6, C["y"]), (12, C["z"])]:
        disk = ndi.gaussian_filter((xx ** 2 + yy ** 2 <= r * r).astype(float), 0.5)
        resp = np.array([-s ** 2 * ndi.gaussian_laplace(disk, s)[60, 60] for s in sig])
        ax.plot(sig, resp, color=col, label="$r=%d$" % r)
        i = np.argmax(resp)
        ax.plot(sig[i], resp[i], "o", color=col, ms=8)
        ax.axvline(r / np.sqrt(2), color=col, ls=":", lw=1.6)
        print("disk r=%d: peak of -sigma^2 LoG at sigma=%.2f (r/sqrt2 = %.2f), value %.3f"
              % (r, sig[i], r / np.sqrt(2), resp[i]))
    ax.set_xlabel(r"$\sigma$"); ax.set_ylabel(label(lang, "\u2212\u03c3\u00b2\u2207\u00b2L at the centre", "中心处的 \u2212\u03c3\u00b2\u2207\u00b2L", "中心での \u2212\u03c3\u00b2\u2207\u00b2L"))
    ax.set_title(label(lang, "disks: peaks at \u03c3 = r/\u221a2", "圆盘：峰值在 \u03c3 = r/\u221a2", "円板：ピークは \u03c3 = r/\u221a2"), fontsize=15)
    ax.legend(fontsize=13)
    ax = axs[1]
    s0 = 6.0
    blob = np.exp(-(xx ** 2 + yy ** 2) / (2 * s0 ** 2))
    k = 2 ** (1 / 3)
    num = np.array([-s ** 2 * ndi.gaussian_laplace(blob, s)[60, 60] for s in sig])
    dog = np.array([-(ndi.gaussian_filter(blob, k * s)[60, 60] - ndi.gaussian_filter(blob, s)[60, 60]) / (k - 1) for s in sig])
    ana = 2 * sig ** 2 * s0 ** 2 / (s0 ** 2 + sig ** 2) ** 2
    ax.plot(sig, ana, color=C["dark"], lw=3, label=r"$2\sigma^2 s^2/(s^2+\sigma^2)^2$")
    ax.plot(sig, num, "--", color=C["a"], lw=2.4, label=r"$-\sigma^2\nabla^2 L$")
    ax.plot(sig, dog, ":", color=C["b"], lw=2.8, label=r"$-\mathrm{DoG}/(k-1)$, $k=2^{1/3}$")
    ax.axvline(s0, color=C["gray"], ls=":", lw=1.6)
    ax.set_xlabel(r"$\sigma$")
    ax.set_title(label(lang, "Gaussian blob s = 6: peak at \u03c3 = s", "高斯斑点 s = 6：峰值在 \u03c3 = s", "ガウスブロブ s = 6：ピークは \u03c3 = s"), fontsize=15)
    ax.legend(fontsize=12)
    i = np.argmax(dog)
    print("Gaussian blob s=6: LoG peak at %.2f, DoG/(k-1) peak at %.2f (value %.3f vs 0.5)" % (sig[np.argmax(num)], sig[i], dog[i]))
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F4  DoG keypoints and the SIFT descriptor of one of them
# --------------------------------------------------------------------------------------------
def fig_dog_sift():
    fig = plt.figure(figsize=(10.5, 5.0))
    gs = fig.add_gridspec(1, 3, width_ratios=[1.35, 1, 0.85])
    ax = fig.add_subplot(gs[0])
    ax.imshow(img, **GRAY)
    for x, y, s, th in kp1:
        ax.add_patch(Circle((x, y), np.sqrt(2) * s, fill=False, ec=C["light"], lw=1.4))
        ax.plot([x, x + np.sqrt(2) * s * np.cos(th)], [y, y + np.sqrt(2) * s * np.sin(th)], color=C["x"], lw=1.4)
    tick_off(ax); ax.set_xlim(0, 319); ax.set_ylim(239, 0)
    ax.set_title("DoG: %d keypoints" % len(kp1), fontsize=15)
    # pick a mid-scale keypoint well inside the image; recompute its descriptor exactly as sift() does
    cand = [k for k in kps if 3.5 < k[2] < 6 and 60 < k[0] < 260 and 60 < k[1] < 180]
    x, y, s, o, lev = cand[0]
    gy, gx = np.gradient(gauss[o][lev])
    xo, yo, so = x / 2 ** o, y / 2 ** o, s / 2 ** o
    th = orientations(gx, gy, xo, yo, so)[0]
    desc = sift_descriptor(gx, gy, xo, yo, so, th)
    ax = fig.add_subplot(gs[1])
    h = int(np.ceil(3 * s * 2 * 1.5))
    ax.imshow(img, **GRAY)
    ax.set_xlim(x - h, x + h); ax.set_ylim(y + h, y - h)
    c, sn = np.cos(th), np.sin(th)
    Rm = np.array([[c, -sn], [sn, c]])
    cw = 3 * s
    for t_ in np.linspace(-2, 2, 5):
        for a_, b_ in [((t_, -2), (t_, 2)), ((-2, t_), (2, t_))]:
            p, q = Rm @ (np.array(a_) * cw) + [x, y], Rm @ (np.array(b_) * cw) + [x, y]
            ax.plot([p[0], q[0]], [p[1], q[1]], color=C["light"], lw=1.6)
    D = desc.reshape(4, 4, 8)
    sc = 0.45 * cw / D.max()
    for j in range(4):
        for i in range(4):
            cc = Rm @ (np.array([i - 1.5, j - 1.5]) * cw) + [x, y]
            for b in range(8):
                ang = th + (b + 0.5) / 8 * 2 * np.pi
                L_ = D[j, i, b] * sc
                ax.plot([cc[0], cc[0] + L_ * np.cos(ang)], [cc[1], cc[1] + L_ * np.sin(ang)], color=C["x"], lw=2)
    ax.annotate("", xy=(x + 2.2 * cw * c, y + 2.2 * cw * sn), xytext=(x, y),
                arrowprops=dict(arrowstyle="->", color=C["c"], lw=2.5))
    tick_off(ax)
    ax.set_title(r"$\sigma=%.2f,\ \theta=%.0f^\circ$" % (s, np.rad2deg(th)), fontsize=15)
    ax = fig.add_subplot(gs[2])
    ax.barh(np.arange(128), desc, color=C["a"], height=1.0)
    ax.set_ylim(128, -1); ax.set_xlabel(r"$\|\cdot\|_2=1$, $\leq 0.2$")
    ax.set_yticks([0, 32, 64, 96, 127]); ax.set_title("128-D", fontsize=15)
    print("F4 keypoint: (%.1f, %.1f) sigma %.2f theta %.1f deg; descriptor max %.3f, nonzero %d"
          % (x, y, s, np.rad2deg(th), desc.max(), (desc > 1e-6).sum()))
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F5  FAST segment test, steered BRIEF pattern, Hamming distances
# --------------------------------------------------------------------------------------------
FAST16 = np.array([(0, -3), (1, -3), (2, -2), (3, -1), (3, 0), (3, 1), (2, 2), (1, 3),
                   (0, 3), (-1, 3), (-2, 2), (-3, 1), (-3, 0), (-3, -1), (-2, -2), (-1, -3)])


def fast_arc(I, x, y, t):
    """FAST segment test: classes of the 16 circle pixels and the longest contiguous arc."""
    v = I[y + FAST16[:, 1], x + FAST16[:, 0]]
    cls = np.where(v > I[y, x] + t, 1, np.where(v < I[y, x] - t, -1, 0))
    best = 0
    for sgn in (1, -1):
        run = 0
        for c_ in np.r_[cls, cls]:
            run = run + 1 if c_ == sgn else 0
            best = max(best, min(run, 16))
    return cls, best


def fig_fast_brief(lang):
    t = 0.1
    hc = nms_peaks(harris(img)[0], radius=4, rel_thresh=0.01)
    arcs = [(fast_arc(img, x, y, t)[1], x, y) for x, y in hc[:40] if 10 < x < 310 and 10 < y < 230]
    n_fast = sum(a >= 9 for a, _, _ in arcs)
    arcs.sort(key=lambda a: -a[0])
    _, fx, fy = arcs[0]
    cls, arc = fast_arc(img, fx, fy, t)
    print("FAST t=%.2f: %d of %d strongest Harris corners pass n>=9; shown corner (%d,%d) arc %d"
          % (t, n_fast, len(arcs), fx, fy, arc))
    fig = plt.figure(figsize=(10.5, 4.2))
    gs = fig.add_gridspec(1, 3, width_ratios=[1, 1, 1.35])
    ax = fig.add_subplot(gs[0])
    h = 5
    ax.imshow(img[fy - h:fy + h + 1, fx - h:fx + h + 1], **GRAY, extent=(-h - .5, h + .5, h + .5, -h - .5))
    for (dx, dy), c_ in zip(FAST16, cls):
        col = {1: C["x"], -1: C["z"], 0: C["light"]}[c_]
        ax.add_patch(Rectangle((dx - .5, dy - .5), 1, 1, fill=False, ec=col, lw=3))
    ax.add_patch(Rectangle((-.5, -.5), 1, 1, fill=False, ec=C["y"], lw=3))
    tick_off(ax)
    ax.set_title(r"FAST: $n=%d \geq 9$, $t=%.1f$" % (arc, t), fontsize=14)
    # steered BRIEF on a corner
    ax = fig.add_subplot(gs[1])
    bx, by = pts1[2]
    h = 17
    ax.imshow(img[int(by) - h:int(by) + h + 1, int(bx) - h:int(bx) + h + 1], **GRAY,
              extent=(-h - .5, h + .5, h + .5, -h - .5))
    ang = ic_angle(img, bx, by)
    c, s = np.cos(ang), np.sin(ang)
    Rm = np.array([[c, -s], [s, c]])
    a, b = pat[:48, :2] @ Rm.T, pat[:48, 2:] @ Rm.T
    for (ax_, ay_), (bx_, by_) in zip(a, b):
        ax.plot([ax_, bx_], [ay_, by_], color=C["a"], lw=1.1, alpha=0.8)
    ax.add_patch(Circle((0, 0), 15, fill=False, ec=C["light"], lw=1.8, ls="--"))
    ax.annotate("", xy=(14 * c, 14 * s), xytext=(0, 0), arrowprops=dict(arrowstyle="->", color=C["b"], lw=3))
    tick_off(ax)
    ax.set_title(r"steered BRIEF, $\theta=%.0f^\circ$" % np.rad2deg(ang), fontsize=14)
    ax = fig.add_subplot(gs[2])
    bins = np.arange(0, 200, 8)
    for steer, ls_ in ((False, "--"), (True, "-")):
        Hd = hamming(brief(img, pts1, pat, steer), brief(img2, pts2, pat, steer))
        same, diff = np.diag(Hd), Hd[~np.eye(len(Hd), dtype=bool)]
        tag = label(lang, "steered" if steer else "plain", "旋转校正" if steer else "未校正", "回転補正" if steer else "補正なし")
        ax.hist(same, bins, density=True, histtype="step", lw=2.4, ls=ls_, color=C["y"],
                label=label(lang, "true pairs", "真实对应", "正しい対応") + ", " + tag)
        ax.hist(diff, bins, density=True, histtype="step", lw=2.4, ls=ls_, color=C["x"],
                label=label(lang, "other pairs", "其他点对", "その他の組") + ", " + tag)
    ax.set_xlabel(label(lang, "Hamming distance (of 256 bits)", "汉明距离（256 位）", "ハミング距離（256 ビット）"))
    ax.set_yticks([])
    ax.legend(fontsize=12, loc="upper right")
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F6  matches on the synthetic pair (RANSAC inliers / outliers) and the ratio test statistics
# --------------------------------------------------------------------------------------------
def pooled_ratio_stats(seeds=range(8)):
    r_all, ok_all, mut_all = [], [], []
    for sd in seeds:
        a = make_scene(seed=sd)
        b = 0.85 * warp_homography(a, H_true, a.shape) + 0.1
        b += np.random.default_rng(100 + sd).normal(0, 0.01, a.shape)
        ka, da = sift(a)
        kb, db = sift(b)
        mm, rr = match_descriptors(da, db, ratio=1.01, mutual=False)
        mut, _ = match_descriptors(da, db, ratio=1.01, mutual=True)
        e = np.linalg.norm(apply_h(H_true, ka[mm[:, 0], :2]) - kb[mm[:, 1], :2], axis=1)
        r_all.append(rr); ok_all.append(e < 3)
        mset = set(mut[:, 0])
        mut_all.append(np.array([i in mset for i in mm[:, 0]]))
    return np.concatenate(r_all), np.concatenate(ok_all), np.concatenate(mut_all)


RR, OK, MUT = pooled_ratio_stats()
for th_ in (0.6, 0.7, 0.8, 0.9):
    k_ = RR < th_
    print("ratio < %.1f: precision %.1f%%, recall %.1f%%  | with mutual: precision %.1f%%, recall %.1f%%"
          % (th_, 100 * OK[k_].mean(), 100 * (OK & k_).sum() / OK.sum(),
             100 * OK[k_ & MUT].mean(), 100 * (OK & k_ & MUT).sum() / OK.sum()))
print("pooled NN matches: %d, correct %d (%.1f%%)" % (len(OK), OK.sum(), 100 * OK.mean()))


def fig_matching(lang):
    fig = plt.figure(figsize=(10.5, 8.4))
    gs = fig.add_gridspec(2, 2, height_ratios=[1.15, 1])
    ax = fig.add_subplot(gs[0, :])
    gap = 12
    canvas = np.ones((240, 640 + gap))
    canvas[:, :320] = img; canvas[:, 320 + gap:] = np.clip(img2, 0, 1)
    ax.imshow(canvas, **GRAY)
    for (a_, b_), good in zip(m_nn, inl):
        pa, pb = kp1[a_, :2], kp2[b_, :2] + [320 + gap, 0]
        if good:
            ax.plot([pa[0], pb[0]], [pa[1], pb[1]], color=C["y"], lw=1.1, alpha=0.9)
    for (a_, b_), good in zip(m_nn, inl):
        pa, pb = kp1[a_, :2], kp2[b_, :2] + [320 + gap, 0]
        if not good:
            ax.plot([pa[0], pb[0]], [pa[1], pb[1]], color=C["x"], lw=0.8, alpha=0.55)
    bx = apply_h(H, np.r_[box, box[:1]]) + [320 + gap, 0]
    ax.plot(bx[:, 0], bx[:, 1], color=C["light"], lw=2.5)
    tick_off(ax); ax.set_xlim(0, 640 + gap); ax.set_ylim(239, 0)
    ax.set_title(label(lang, "%d nearest-neighbour matches: %d RANSAC inliers (green), %d outliers (red)",
                       "%d 个最近邻匹配：%d 个 RANSAC 内点（绿），%d 个外点（红）",
                       "最近傍マッチ %d 個：RANSAC インライア %d 個（緑）、アウトライア %d 個（赤）")
                 % (len(m_nn), inl.sum(), len(m_nn) - inl.sum()), fontsize=14)
    ax = fig.add_subplot(gs[1, 0])
    bins = np.linspace(0.2, 1.0, 33)
    ax.hist(RR[OK], bins, color=C["y"], alpha=0.75, label=label(lang, "correct", "正确", "正しい") + " (%d)" % OK.sum())
    ax.hist(RR[~OK], bins, color=C["x"], alpha=0.6, label=label(lang, "wrong", "错误", "誤り") + " (%d)" % (~OK).sum())
    ax.axvline(0.8, color=C["dark"], ls="--", lw=2)
    ax.set_xlabel(r"$d_1/d_2$"); ax.legend(fontsize=12, loc="upper left")
    ax = fig.add_subplot(gs[1, 1])
    ths = np.linspace(0.3, 1.0, 71)
    prec = [OK[RR < t_].mean() if (RR < t_).any() else 1 for t_ in ths]
    rec = [(OK & (RR < t_)).sum() / OK.sum() for t_ in ths]
    ax.plot(ths, prec, color=C["a"], label=label(lang, "precision", "精确率", "適合率"))
    ax.plot(ths, rec, color=C["b"], label=label(lang, "recall", "召回率", "再現率"))
    ax.axvline(0.8, color=C["dark"], ls="--", lw=2)
    ax.set_xlabel(label(lang, "ratio threshold \u03c4", "比值阈值 \u03c4", "比の閾値 \u03c4"))
    ax.set_ylim(0, 1.03); ax.legend(fontsize=12, loc="lower left")
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F7  RANSAC iteration count
# --------------------------------------------------------------------------------------------
def fig_iters(lang):
    fig, ax = plt.subplots(figsize=(9, 5.2))
    eps = np.linspace(0.005, 0.9, 180)
    cols = [C["gray"], C["c"], C["a"], C["y"], C["b"], C["x"]]
    for (s, nm), col in zip([(2, "line"), (3, "P3P"), (4, "H"), (5, "E"), (7, "F 7-pt"), (8, "F 8-pt")], cols):
        N = np.log(0.01) / np.log(1 - (1 - eps) ** s)
        ax.semilogy(eps, np.maximum(N, 1), color=col, label="$s=%d$  (%s)" % (s, nm))
    ax.plot(0.5, 72, "o", color=C["a"], ms=10)
    ax.annotate("$N=72$", (0.5, 72), xytext=(0.3, 900), fontsize=15, arrowprops=dict(arrowstyle="->", lw=1.5))
    ax.set_xlabel(label(lang, "outlier ratio \u03b5", "外点比例 \u03b5", "アウトライア率 \u03b5"))
    ax.set_ylabel(label(lang, "samples N (p = 0.99)", "采样次数 N（p = 0.99）", "サンプル数 N（p = 0.99）"))
    ax.set_ylim(1, 1e7); ax.set_xlim(0, 0.9)
    ax.legend(fontsize=12, loc="upper left")
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F8  RANSAC on a line, step by step
# --------------------------------------------------------------------------------------------
def fig_ransac_steps():
    rng_ = np.random.default_rng(3)
    P = make_line_data(60, 0.4, rng_)
    t = 2.5
    rs = np.random.default_rng(7)
    hyps, best, best_n = [], None, -1
    for it in range(17):                     # N for eps = 0.4, s = 2 (p = 0.99) is 11; run a few more
        idx = rs.choice(len(P), 2, replace=False)
        n, d = fit_line(P[idx])
        inl_ = np.abs(P @ n - d) < t
        hyps.append((it + 1, idx, n, d, inl_))
        if inl_.sum() > best_n:
            best, best_n = hyps[-1], inl_.sum()
    shown = [hyps[0], hyps[1], best]
    fig, axs = plt.subplots(2, 2, figsize=(9.5, 9.6))
    axs = axs.ravel()
    xs = np.array([-5.0, 105.0])

    def draw_line(ax, n, d, **kw):
        ax.plot(xs, (d - n[0] * xs) / n[1], **kw)

    for ax, (it, idx, n, d, inl_) in zip(axs[:3], shown):
        nn_ = n / np.linalg.norm(n)
        for off in (-t, t):
            draw_line(ax, nn_, d + off, color=C["a"], lw=1, ls="--")
        ax.scatter(P[~inl_, 0], P[~inl_, 1], s=16, color=C["gray"])
        ax.scatter(P[inl_, 0], P[inl_, 1], s=18, color=C["y"])
        ax.scatter(P[idx, 0], P[idx, 1], s=110, facecolor="none", edgecolor=C["x"], lw=2.5)
        draw_line(ax, n, d, color=C["a"], lw=2.2)
        ax.set_title(r"$k=%d$: $|\mathcal{I}|=%d$" % (it, inl_.sum()), fontsize=15)
    ax = axs[3]
    n, d = fit_line(P[best[4]])
    nl, dl = fit_line(P)
    ax.scatter(P[:, 0], P[:, 1], s=16, color=C["gray"])
    ax.scatter(P[best[4], 0], P[best[4], 1], s=18, color=C["y"])
    draw_line(ax, n, d, color=C["a"], lw=2.6, label="RANSAC")
    draw_line(ax, nl, dl, color=C["x"], lw=2.2, ls="--", label="LS")
    draw_line(ax, np.array([-0.6, 0.8]), 20.0, color=C["dark"], lw=1.4, ls=":", label="GT")
    ax.legend(fontsize=11, loc="upper left")
    ax.set_title(r"$\max_k |\mathcal{I}_k| = %d$" % best_n, fontsize=15)
    for ax in axs:
        ax.set_xlim(-5, 105); ax.set_ylim(-5, 105); ax.set_aspect("equal")
        ax.set_xticks([0, 50, 100]); ax.set_yticks([0, 50, 100])
    print("F8: best hypothesis k=%d with %d inliers; true inliers 36; refit error %.2f, LS error %.2f"
          % (best[0], best_n, line_error((n, d)), line_error((nl, dl))))
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F9  robust costs, accuracy versus outlier ratio, and success versus samples
# --------------------------------------------------------------------------------------------
def trace_line(P, t, iters, lo, rng_):
    """Same logic as robust_line (MSAC score), but records the refit error after every sample."""
    cost = lambda e: np.minimum(e ** 2, t ** 2).sum()
    best, best_c, errs_ = None, np.inf, []
    for _ in range(iters):
        n, d = fit_line(P[rng_.choice(len(P), 2, replace=False)])
        c = cost(np.abs(P @ n - d))
        if c < best_c and lo:
            for _ in range(5):
                inl_ = np.abs(P @ n - d) < t
                if inl_.sum() < 3:
                    break
                n2, d2 = fit_line(P[inl_])
                c2 = cost(np.abs(P @ n2 - d2))
                if c2 >= c:
                    break
                n, d, c = n2, d2, c2
        if c < best_c:
            best, best_c = (n, d), c
            inl_ = np.abs(P @ best[0] - best[1]) < t
            cur = line_error(fit_line(P[inl_])) if inl_.sum() >= 2 else 1e9
        errs_.append(cur)
    return np.array(errs_)


def variants_data():
    eps_list = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
    res = {k: [] for k in ("LS", "RANSAC", "MSAC", "LO-RANSAC")}
    rng_ = np.random.default_rng(11)
    for e_ in eps_list:
        N = ransac_iterations(e_, 2)
        er = {k: [] for k in res}
        for trial in range(150):
            P = make_line_data(200, e_, rng_)
            er["LS"].append(line_error(fit_line(P)))
            er["RANSAC"].append(line_error(robust_line(P, 2.5, N, "ransac", seed=trial)))
            er["MSAC"].append(line_error(robust_line(P, 2.5, N, "msac", seed=trial)))
            er["LO-RANSAC"].append(line_error(robust_line(P, 2.5, N, "msac", lo=True, seed=trial)))
        for k in res:
            res[k].append((np.median(er[k]), np.percentile(er[k], 95)))
    for k in res:
        print("F9 %-10s" % k + " ".join("%.2f/%.2f" % v for v in res[k]))
    # success versus number of samples, eps = 0.7
    K = 80
    succ = {False: np.zeros(K), True: np.zeros(K)}
    trials = 300
    for trial in range(trials):
        P = make_line_data(200, 0.7, rng_)
        for lo in (False, True):
            succ[lo] += trace_line(P, 2.5, K, lo, np.random.default_rng(trial)) < 1.0
    for lo in succ:
        succ[lo] /= trials
    theo = 1 - (1 - 0.3 ** 2) ** np.arange(1, K + 1)
    print("F9 success at k=17/49/80 (theory %.2f/%.2f/%.2f): plain %.2f/%.2f/%.2f, LO %.2f/%.2f/%.2f"
          % (theo[16], theo[48], theo[79], succ[False][16], succ[False][48], succ[False][79],
             succ[True][16], succ[True][48], succ[True][79]))
    return eps_list, res, succ, theo


VAR = variants_data()


def fig_variants(lang):
    eps_list, res, succ, theo = VAR
    fig = plt.figure(figsize=(10.5, 9.0))
    gs_ = fig.add_gridspec(2, 2)
    axs = [fig.add_subplot(gs_[0, 0]), fig.add_subplot(gs_[1, :]), fig.add_subplot(gs_[0, 1])]
    ax = axs[0]
    t = 1.0
    e = np.linspace(-2.5, 2.5, 501)
    ax.plot(e, e ** 2, color=C["x"], label=r"LS: $e^2$")
    ax.plot(e, np.where(np.abs(e) < t, 0, t ** 2), color=C["gray"], lw=3, label="RANSAC: $t^2[|e|\\geq t]$")
    ax.plot(e, np.minimum(e ** 2, t ** 2), "--", color=C["a"], lw=2.6, label=r"MSAC: $\min(e^2,t^2)$")
    ax.set_ylim(-0.1, 2.2); ax.set_xlabel("$e/t$"); ax.set_ylabel(r"$\rho(e)$")
    ax.legend(fontsize=10.5, loc="upper center")
    ax = axs[1]
    cols = {"LS": C["x"], "RANSAC": C["gray"], "MSAC": C["a"], "LO-RANSAC": C["y"]}
    for k, v in res.items():
        v = np.array(v)
        ax.semilogy(eps_list, v[:, 0], "o-", color=cols[k], label=k)
        ax.semilogy(eps_list, v[:, 1], "s:", color=cols[k], lw=1.6, ms=5)
    ax.set_xlabel(label(lang, "outlier ratio \u03b5", "外点比例 \u03b5", "アウトライア率 \u03b5"))
    ax.set_ylabel(label(lang, "line error (\u03c3 units)", "直线误差（以 \u03c3 为单位）", "直線の誤差（\u03c3 単位）"))
    ax.set_ylim(0.1, 400); ax.legend(fontsize=10.5, loc="upper left", ncol=2)
    ax.set_title(label(lang, "solid: median, dotted: 95th pct.", "实线：中位数；点线：95 分位", "実線：中央値、点線：95 パーセンタイル"), fontsize=13)
    ax = axs[2]
    k = np.arange(1, len(theo) + 1)
    ax.plot(k, theo, color=C["dark"], lw=2, ls="--", label=r"$1-(1-w^2)^k$")
    ax.plot(k, succ[False], color=C["gray"], lw=2.6, label="MSAC")
    ax.plot(k, succ[True], color=C["y"], lw=2.6, label="LO-RANSAC")
    ax.axvline(49, color=C["a"], ls=":", lw=1.6)
    ax.set_xlabel(label(lang, "samples drawn k", "已抽样次数 k", "サンプル数 k"))
    ax.set_ylabel(label(lang, "P(error < 1)", "P（误差 < 1）", "P（誤差 < 1）"))
    ax.set_title(r"$\varepsilon=0.7$", fontsize=14)
    ax.set_ylim(0, 1.02); ax.legend(fontsize=11, loc="lower right")
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F10  Sinkhorn with a dustbin
# --------------------------------------------------------------------------------------------
def fig_sinkhorn():
    S_ = np.array([[12.0, 1.5, 0.6], [0.9, 7.8, 8.4], [0.3, 1.2, 12.6], [1.8, 2.7, 2.1]])
    Z = np.full((5, 4), 4.0); Z[:4, :3] = S_
    P1 = sinkhorn_dustbin(S_, 4.0, iters=1)
    P100 = sinkhorn_dustbin(S_, 4.0, iters=100)
    fig, axs = plt.subplots(1, 3, figsize=(10.5, 4.3))
    rows = ["$A_0$", "$A_1$", "$A_2$", "$A_3$", r"$\varnothing$"]
    colsl = ["$B_0$", "$B_1$", "$B_2$", r"$\varnothing$"]
    for ax, Mx, title, cm in [(axs[0], Z, r"$S$ + dustbin $\alpha=4$", "viridis"),
                              (axs[1], P1, r"$P$, 1 iter.", "magma_r"),
                              (axs[2], P100, r"$P$, 100 iter.", "magma_r")]:
        vmax = Mx.max() if ax is axs[0] else 1.0
        ax.imshow(Mx, cmap=cm, vmin=0, vmax=vmax)
        for i in range(5):
            for j in range(4):
                val = Mx[i, j]
                dark_bg = (val / vmax > 0.55) if cm == "viridis" else (val / vmax > 0.45)
                txt_col = ("k" if dark_bg else "w") if cm == "viridis" else ("w" if dark_bg else "k")
                ax.text(j, i, ("%.1f" if ax is axs[0] else "%.2f") % val, ha="center", va="center",
                        fontsize=13, color=txt_col)
        ax.set_xticks(range(4)); ax.set_xticklabels(colsl)
        ax.set_yticks(range(5)); ax.set_yticklabels(rows)
        ax.axhline(3.5, color="w", lw=3); ax.axvline(2.5, color="w", lw=3)
        ax.grid(False); ax.set_title(title, fontsize=15)
    for i, j in enumerate(P100[:4].argmax(1)):
        axs[2].add_patch(Rectangle((j - .5, i - .5), 1, 1, fill=False, ec=C["c"], lw=3.5))
    print("F10: P after 100 iterations\n", P100.round(3), "\n row sums", P100.sum(1).round(3), " col sums", P100.sum(0).round(3))
    fig.tight_layout()
    return fig


# --------------------------------------------------------------------------------------------
# F11  Lucas-Kanade: constraint lines at a corner and an edge, and coarse-to-fine
# --------------------------------------------------------------------------------------------
def fig_lk(lang):
    I0 = ndi.gaussian_filter(img, 1.0)
    dtrue = np.array([0.6, -0.4])
    J0 = warp_homography(I0, np.array([[1, 0, dtrue[0]], [0, 1, dtrue[1]], [0, 0, 1.0]]), I0.shape)
    gy_, gx_ = np.gradient(I0)
    It = J0 - I0
    # the 15 x 15 box-window matrix M of lk_window at every pixel
    bxx, bxy, byy = (ndi.uniform_filter(a_ * b_, 15) for a_, b_ in ((gx_, gx_), (gx_, gy_), (gy_, gy_)))
    lmn = (bxx + byy) / 2 - np.sqrt((bxx - byy) ** 2 / 4 + bxy ** 2)
    lmx = (bxx + byy) / 2 + np.sqrt((bxx - byy) ** 2 / 4 + bxy ** 2)
    cx_, cy_ = nms_peaks(harris(I0)[0], radius=6)[3]
    esc = np.where(inner & (lmn < 0.005 * lmx), lmx, 0)
    ey_, ex_ = np.unravel_index(np.argmax(esc), esc.shape)
    fig = plt.figure(figsize=(10.5, 9.6))
    gs_ = fig.add_gridspec(2, 2, height_ratios=[1.15, 0.85])
    axs = [fig.add_subplot(gs_[0, 0]), fig.add_subplot(gs_[0, 1]), fig.add_subplot(gs_[1, :])]
    uu = np.linspace(-2, 2, 2)
    for ax, (x, y), nm in [(axs[0], (cx_, cy_), label(lang, "corner", "角点", "コーナー")),
                           (axs[1], (ex_, ey_), label(lang, "edge", "边缘", "エッジ"))]:
        h = 7
        ys, xs = np.mgrid[y - h:y + h + 1, x - h:x + h + 1]
        gx, gy, it = gx_[ys, xs].ravel(), gy_[ys, xs].ravel(), It[ys, xs].ravel()
        mag = np.hypot(gx, gy)
        sel = np.argsort(-mag)[:40]
        for i in sel:
            if abs(gy[i]) > abs(gx[i]):
                vv = (-it[i] - gx[i] * uu) / gy[i]
                ax.plot(uu, vv, color=C["a"], lw=1, alpha=0.6)
            else:
                vv2 = np.linspace(-2, 2, 2)
                ax.plot((-it[i] - gy[i] * vv2) / gx[i], vv2, color=C["a"], lw=1, alpha=0.6)
        M_ = np.array([[gx @ gx, gx @ gy], [gx @ gy, gy @ gy]])
        lam = np.linalg.eigvalsh(M_)
        b_ = -np.array([gx @ it, gy @ it])
        ax.plot(*dtrue, "*", color=C["x"], ms=18, label=label(lang, "true d", "真实 d", "真の d"))
        if lam[0] > 0.05 * lam[1]:
            d_ = np.linalg.solve(M_, b_)
            ax.plot(*d_, "o", mfc="none", mec=C["y"], ms=13, mew=2.5,
                    label=label(lang, "LS solution", "最小二乘解", "最小二乗解"))
        else:                                    # keep only the well-determined direction
            d_ = np.linalg.pinv(M_, rcond=0.05) @ b_
            ax.plot(*d_, "o", mfc="none", mec=C["y"], ms=13, mew=2.5,
                    label=label(lang, "normal flow", "法向光流", "法線方向フロー"))
            ev = np.linalg.eigh(M_)[1][:, 0]     # direction along the edge
            ax.plot(d_[0] + 3 * ev[0] * np.array([-1, 1]), d_[1] + 3 * ev[1] * np.array([-1, 1]),
                    color=C["y"], lw=2.5, ls="--")
        ax.set_xlim(-2, 2); ax.set_ylim(-2, 2); ax.set_aspect("equal")
        ax.set_xlabel("$u$"); ax.set_ylabel("$v$")
        ax.set_title("%s: \u03bb\u2082/\u03bb\u2081 = %.3f" % (nm, lam[0] / lam[1]), fontsize=14)
        ax.legend(fontsize=11, loc="lower left")
        print("F11 %s at (%d,%d): eigenvalues %.4f %.4f, one GN step d = %s" % (nm, x, y, lam[0], lam[1], d_.round(3)))
    ax = axs[2]
    pts_ = [(x, y) for x, y in nms_peaks(harris(I0)[0], radius=6)[:25] if 30 < x < 290 and 30 < y < 210]
    direc = np.array([12.0, 7.0]) / np.hypot(12, 7)
    mags = np.arange(0, 25, 1.5)
    s1, s3 = [], []
    for mg in mags:
        dd = mg * direc
        Jm = warp_homography(I0, np.array([[1, 0, dd[0]], [0, 1, dd[1]], [0, 0, 1.0]]), I0.shape)
        s1.append(np.mean([np.linalg.norm(lk_window(I0, Jm, x, y)[0] - dd) < 0.1 for x, y in pts_]))
        s3.append(np.mean([np.linalg.norm(lk_pyramid(I0, Jm, x, y) - dd) < 0.1 for x, y in pts_]))
    ax.plot(mags, s1, "o-", color=C["gray"], label=label(lang, "single level", "单层", "単一レベル"))
    ax.plot(mags, s3, "s-", color=C["y"], label=label(lang, "3-level pyramid", "3 层金字塔", "3 段ピラミッド"))
    ax.set_xlabel(label(lang, "motion \u2016d\u2016 (px)", "运动 \u2016d\u2016（像素）", "動き \u2016d\u2016（px）"))
    ax.set_ylabel(label(lang, "converged (< 0.1 px)", "收敛比例（< 0.1 px）", "収束率（< 0.1 px）"))
    ax.set_ylim(-0.03, 1.05); ax.legend(fontsize=12, loc="lower left")
    print("F11 success single:", np.round(s1, 2), "\n    pyramid:", np.round(s3, 2), "\n    mags:", mags)
    fig.tight_layout()
    return fig


if __name__ == "__main__":
    loc(fig_autocorr, "03-autocorrelation.svg")
    loc(fig_harris, "03-harris.svg")
    loc(fig_scale, "03-scale-selection.svg")
    out(fig_dog_sift(), "03-dog-sift.svg")
    loc(fig_fast_brief, "03-fast-brief.svg")
    loc(fig_matching, "03-matching.svg")
    loc(fig_iters, "03-ransac-iterations.svg")
    out(fig_ransac_steps(), "03-ransac-steps.svg")
    loc(fig_variants, "03-robust-variants.svg")
    out(fig_sinkhorn(), "03-sinkhorn.svg")
    loc(fig_lk, "03-lucas-kanade.svg")
