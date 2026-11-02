"""Figures for graphics post 08 (geometry processing).

Everything is computed with NumPy from the post's own algorithms: the half-edge structure, the
cotangent Laplacian, angle-defect curvature, Laplacian / Taubin / implicit smoothing, Loop
subdivision, QEM edge collapse, Tutte embedding, marching squares, marching tetrahedra, sphere
tracing and a 2D Poisson reconstruction. Only NumPy and matplotlib are required.

    python3 bin/figures/graphics/graphics_08.py
"""
import heapq
import pathlib
import sys
from collections import defaultdict

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib import cm  # noqa: E402
from matplotlib.colors import Normalize, TwoSlopeNorm, to_rgb  # noqa: E402
from matplotlib.patches import Circle, Polygon  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402,F401

plt.rcParams["savefig.dpi"] = 200  # resolution of the rasterized 3D meshes inside the SVGs

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics"


def out(name):
    return OUT / f"08-{name}.svg"


# ---------------------------------------------------------------------------
# Mesh helpers
# ---------------------------------------------------------------------------
LIGHT = np.array([0.35, -0.55, 0.75])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def smap(norm, cmap):
    s = cm.ScalarMappable(norm=norm, cmap=cmap)
    s.set_array([])
    return s


def face_normals(V, F):
    t = V[F]
    n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-15)


def face_areas(V, F):
    t = V[F]
    return 0.5 * np.linalg.norm(np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]), axis=1)


def corner_angles(V, F):
    """Interior angle at each corner, shape (m, 3)."""
    t = V[F]
    ang = np.zeros(F.shape)
    for k in range(3):
        u = t[:, (k + 1) % 3] - t[:, k]
        w = t[:, (k + 2) % 3] - t[:, k]
        c = (u * w).sum(1) / (np.linalg.norm(u, axis=1) * np.linalg.norm(w, axis=1))
        ang[:, k] = np.arccos(np.clip(c, -1.0, 1.0))
    return ang


def shaded_colors(V, F, base=None, values=None, cmap=None, norm=None):
    n = face_normals(V, F)
    lam = 0.45 + 0.55 * np.abs(n @ LIGHT)
    if values is None:
        rgb = np.tile(np.array(to_rgb(base)), (len(F), 1))
    else:
        rgb = np.asarray(cmap(norm(values)))[:, :3]
    return np.clip(rgb * lam[:, None], 0, 1)


def draw_mesh(ax, V, F, colors, edgecolor=None, lw=0.25, rasterized=True):
    pc = Poly3DCollection(V[F], facecolors=colors,
                          edgecolors=colors if edgecolor is None else edgecolor, linewidths=lw)
    pc.set_rasterized(rasterized)
    ax.add_collection3d(pc)


def frame3d(ax, V, elev=25, azim=-60, pad=1.0):
    c = 0.5 * (V.max(0) + V.min(0))
    r = 0.5 * (V.max(0) - V.min(0)).max() * pad
    ax.set_xlim(c[0] - r, c[0] + r); ax.set_ylim(c[1] - r, c[1] + r); ax.set_zlim(c[2] - r, c[2] + r)
    ax.set_box_aspect((1, 1, 1))
    ax.view_init(elev=elev, azim=azim)
    ax.set_axis_off()


def icosahedron():
    t = (1 + 5 ** 0.5) / 2
    V = np.array([(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t),
                  (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)], float)
    F = np.array([(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4),
                  (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8),
                  (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)])
    return V / np.linalg.norm(V, axis=1, keepdims=True), F


def midpoint_subdivide(V, F):
    V = list(map(np.asarray, V))
    cache, newF = {}, []

    def mid(a, b):
        key = (min(a, b), max(a, b))
        if key not in cache:
            cache[key] = len(V)
            V.append(0.5 * (V[a] + V[b]))
        return cache[key]

    for a, b, c in F:
        ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
        newF += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    return np.array(V), np.array(newF)


def icosphere(level):
    V, F = icosahedron()
    for _ in range(level):
        V, F = midpoint_subdivide(V, F)
        V = V / np.linalg.norm(V, axis=1, keepdims=True)
    return V, F


def torus(nu=48, nv=24, R=1.0, r=0.4):
    u = np.arange(nu) * 2 * np.pi / nu
    v = np.arange(nv) * 2 * np.pi / nv
    U, W = np.meshgrid(u, v, indexing="ij")
    V = np.stack([(R + r * np.cos(W)) * np.cos(U), (R + r * np.cos(W)) * np.sin(U), r * np.sin(W)],
                 -1).reshape(-1, 3)
    idx = lambda i, j: (i % nu) * nv + (j % nv)  # noqa: E731
    F = []
    for i in range(nu):
        for j in range(nv):
            a, b, c, d = idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)
            F += [(a, b, c), (a, c, d)]
    return V, np.array(F), U.ravel(), W.ravel()


# ---------------------------------------------------------------------------
# The post's discrete differential geometry
# ---------------------------------------------------------------------------
def cotan_laplacian(V, F):
    """Dense cotangent Laplacian L with L[i, j] = (cot a_ij + cot b_ij) / 2, rows summing to 0."""
    n = len(V)
    L = np.zeros((n, n))
    ang = corner_angles(V, F)
    for k in range(3):
        i, j = F[:, (k + 1) % 3], F[:, (k + 2) % 3]  # edge opposite corner k
        w = 0.5 / np.tan(ang[:, k])
        np.add.at(L, (i, j), w)
        np.add.at(L, (j, i), w)
    L[np.diag_indices(n)] = -L.sum(1)
    return L


def vertex_areas(V, F):
    A = np.zeros(len(V))
    np.add.at(A, F.ravel(), np.repeat(face_areas(V, F) / 3.0, 3))
    return A


def angle_weighted_normals(V, F):
    N = np.zeros_like(V)
    fn, ang = face_normals(V, F), corner_angles(V, F)
    for k in range(3):
        np.add.at(N, F[:, k], fn * ang[:, k:k + 1])
    return N / np.linalg.norm(N, axis=1, keepdims=True)


def gaussian_curvature(V, F):
    defect = np.full(len(V), 2 * np.pi)
    np.add.at(defect, F.ravel(), -corner_angles(V, F).ravel())
    return defect / vertex_areas(V, F), defect


def mean_curvature(V, F):
    lap = (cotan_laplacian(V, F) @ V) / vertex_areas(V, F)[:, None]  # = -2 H n
    return -0.5 * (lap * angle_weighted_normals(V, F)).sum(1)


# ---------------------------------------------------------------------------
# Figure 1: half-edge structure of a small fan with a boundary
# ---------------------------------------------------------------------------
def build_halfedge(F):
    """Half-edge arrays from a face list: origin, twin, next, face (-1 for boundary)."""
    orig, face, nxt, index = [], [], [], {}
    for f, tri in enumerate(F):
        base = len(orig)
        for k in range(3):
            a, b = tri[k], tri[(k + 1) % 3]
            index[(a, b)] = base + k
            orig.append(a); face.append(f); nxt.append(base + (k + 1) % 3)
    twin = [-1] * len(orig)
    for (a, b), h in list(index.items()):
        if (b, a) in index:
            twin[h] = index[(b, a)]
        else:  # create the boundary half-edge b -> a
            g = len(orig)
            orig.append(b); face.append(-1); nxt.append(-1); twin.append(h)
            twin[h] = g
            index[(b, a)] = g
    out_boundary = {orig[h]: h for h in range(len(orig)) if face[h] == -1}
    for h in range(len(orig)):
        if face[h] == -1:
            nxt[h] = out_boundary[orig[twin[h]]]  # next boundary half-edge starts at our tip
    return dict(orig=orig, twin=twin, next=nxt, face=face)


def one_ring(he, h0):
    ring, h = [], h0
    while True:
        ring.append(h)
        h = he["next"][he["twin"][h]]
        if h == h0:
            return ring


def fig_halfedge():
    ang = np.deg2rad([0, 62, 118, 178, 236, 298])
    rad = np.array([1.0, 0.92, 1.05, 0.95, 1.08, 0.9])
    P = np.vstack([[0.05, -0.02], np.c_[rad * np.cos(ang), rad * np.sin(ang)]])
    F = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 5), (0, 5, 6)]  # one wedge (0, 6, 1) is missing
    he = build_halfedge(F)
    orig, twin, nxt, face = he["orig"], he["twin"], he["next"], he["face"]
    dest = lambda h: orig[twin[h]]  # noqa: E731
    cent = [P[list(t)].mean(0) for t in F]

    fig, ax = plt.subplots(figsize=(9, 8))
    for t in F:
        ax.add_patch(Polygon(P[list(t)], closed=True, fc=C["fill"], ec="none", alpha=0.6))
    h_center = [h for h in range(len(orig)) if orig[h] == 0 and face[h] >= 0][0]
    ring = one_ring(he, h_center)
    bstart = [h for h in range(len(orig)) if face[h] == -1][0]
    bloop, h = [], bstart
    while True:
        bloop.append(h); h = nxt[h]
        if h == bstart:
            break
    for h in range(len(orig)):
        a, b = P[orig[h]], P[dest(h)]
        if face[h] >= 0:
            c = cent[face[h]]
            shrink = lambda p: p + 0.18 * (c - p)  # noqa: E731
        else:  # push boundary half-edges outward
            ev = b - a
            outv = np.array([-ev[1], ev[0]]) / np.linalg.norm(ev)  # left normal of a -> b = outward
            shrink = lambda p, o=outv: p + 0.07 * o  # noqa: E731
        s, e = shrink(a + 0.12 * (b - a)), shrink(b - 0.12 * (b - a))
        if h in ring:
            col, lw = C["a"], 3.0
        elif face[h] == -1:
            col, lw = C["b"], 2.4
        else:
            col, lw = C["gray"], 1.4
        ax.annotate("", xy=e, xytext=s, arrowprops=dict(arrowstyle="-|>", color=col, lw=lw,
                                                         mutation_scale=16))
    # label one half-edge and its neighbours
    h = h_center
    for hh, txt in [(h, "h"), (nxt[h], "next(h)"), (twin[h], "twin(h)")]:
        a, b = P[orig[hh]], P[dest(hh)]
        m = 0.5 * (a + b)
        d_ = b - a
        ref = cent[face[hh]] if face[hh] >= 0 else m + np.array([-d_[1], d_[0]])
        pos = m + 0.28 * (ref - m) / np.linalg.norm(ref - m)
        ax.text(*pos, txt, fontsize=14, ha="center", va="center",
                bbox=dict(fc="white", ec="none", alpha=0.85, pad=1))
    for i, p in enumerate(P):
        ax.plot(*p, "o", ms=13, color=C["dark"], zorder=5)
        ax.text(p[0], p[1], str(i), color="white", fontsize=11, ha="center", va="center", zorder=6)
    for f, c in enumerate(cent):
        ax.text(*c, f"f{f}", fontsize=13, color=C["z"], ha="center", va="center")
    ax.plot([], [], color=C["a"], lw=3, label=f"one-ring of 0: {[dest(x) for x in ring]}")
    ax.plot([], [], color=C["b"], lw=2.4, label=f"boundary loop: {[orig[x] for x in bloop]}")
    ax.plot([], [], color=C["gray"], lw=1.4, label="other half-edges")
    ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.16), ncol=1, frameon=False, fontsize=13)
    ax.set_aspect("equal"); ax.axis("off")
    ax.set_title(f"{len(F)} faces, {len(orig)} half-edges "
                 f"({sum(1 for x in face if x == -1)} on the boundary)")
    save(fig, out("halfedge"))


# ---------------------------------------------------------------------------
# Figure 2: cotangent weights on a flat, irregular one-ring
# ---------------------------------------------------------------------------
def fig_cotan():
    ang = np.deg2rad([5, 50, 120, 165, 215, 290])
    rad = np.array([1.0, 0.7, 1.1, 0.8, 1.15, 0.75])
    P = np.vstack([[0, 0], np.c_[rad * np.cos(ang), rad * np.sin(ang)]])
    k = 6
    F = np.array([(0, 1 + i, 1 + (i + 1) % k) for i in range(k)])
    V3 = np.c_[P, np.zeros(len(P))]
    L = cotan_laplacian(V3, F)
    w = L[0, 1:]
    cot_vec = L[0] @ V3  # sum_j w_ij (x_j - x_i), zero for a flat one-ring
    uni_vec = P[1:].mean(0) - P[0]

    fig, ax = plt.subplots(figsize=(9, 8))
    for t in F:
        ax.add_patch(Polygon(P[t], closed=True, fc="white", ec=C["gray"], lw=1.2))
    # barycentric (1/3) area of the centre vertex
    for t in F:
        a, b, c = P[t]
        ax.add_patch(Polygon([a, 0.5 * (a + b), (a + b + c) / 3, 0.5 * (a + c)], closed=True,
                             fc=C["fill"], ec="none"))
    norm = Normalize(vmin=min(0.0, w.min()), vmax=w.max())
    for j in range(k):
        q = P[1 + j]
        ax.plot([0, q[0]], [0, q[1]], color=cm.viridis(norm(w[j])), lw=max(1.0, 2 + 6 * w[j] / w.max()),
                solid_capstyle="round")
        ax.text(*(0.6 * q), f"{w[j]:.2f}", fontsize=13, ha="center", va="center",
                bbox=dict(fc="white", ec="none", alpha=0.85, pad=1))
    # angles opposite the edge 0-1: in triangles (0,1,2) at vertex 2 and (0,6,1) at vertex 6
    for vtx, nb, lab in [(2, 1, r"$\alpha$"), (k, 1, r"$\beta$")]:
        p = P[vtx]
        d1, d2 = P[0] - p, P[nb] - p
        a1, a2 = np.arctan2(d1[1], d1[0]), np.arctan2(d2[1], d2[0])
        if (a2 - a1) % (2 * np.pi) > np.pi:
            a1, a2 = a2, a1
        ts = np.linspace(a1, a1 + (a2 - a1) % (2 * np.pi), 30)
        ax.plot(p[0] + 0.18 * np.cos(ts), p[1] + 0.18 * np.sin(ts), color=C["x"], lw=2)
        tm = ts[len(ts) // 2]
        ax.text(p[0] + 0.3 * np.cos(tm), p[1] + 0.3 * np.sin(tm), lab, color=C["x"], fontsize=18,
                ha="center", va="center")
    ax.annotate("", xy=uni_vec * 4, xytext=(0, 0),
                arrowprops=dict(arrowstyle="-|>", color=C["b"], lw=3, mutation_scale=18))
    ax.text(*(uni_vec * 4 + np.array([0.04, -0.1])), r"$4\times$ uniform $\Delta$", color=C["b"],
            fontsize=14)
    for i, p in enumerate(P):
        ax.plot(*p, "o", ms=11, color=C["dark"], zorder=5)
        ax.text(p[0], p[1], str(i), color="white", fontsize=10, ha="center", va="center", zorder=6)
    fig.colorbar(smap(norm, cm.viridis), ax=ax, shrink=0.7, label=r"$w_{0j}=\frac{1}{2}(\cot\alpha_{0j}+\cot\beta_{0j})$")
    ax.set_title(r"cotan $\sum_j w_{0j}(x_j-x_0)$ = " + f"({cot_vec[0]:.1e}, {cot_vec[1]:.1e})")
    ax.set_aspect("equal"); ax.axis("off")
    save(fig, out("cotan-weights"))


# ---------------------------------------------------------------------------
# Figure 3: curvature on a torus, checked against the analytic values
# ---------------------------------------------------------------------------
def fig_curvature():
    R, r = 1.0, 0.4
    V, F, U, W = torus(48, 24, R, r)
    K, defect = gaussian_curvature(V, F)
    H = mean_curvature(V, F)
    fig = plt.figure(figsize=(15, 5.6))
    knorm = TwoSlopeNorm(vmin=K.min(), vcenter=0.0, vmax=K.max())
    hnorm = Normalize(vmin=H.min(), vmax=H.max())
    for pos, val, nrm, cmap, title in [(1, K, knorm, cm.RdBu_r, r"Gaussian $K$ (angle defect / area)"),
                                       (2, H, hnorm, cm.viridis, r"mean $H$ (cotan Laplacian)")]:
        ax = fig.add_subplot(1, 3, pos, projection="3d")
        draw_mesh(ax, V, F, shaded_colors(V, F, values=val[F].mean(1), cmap=cmap, norm=nrm), lw=0.2)
        frame3d(ax, V, elev=38, azim=-55, pad=0.72)
        ax.set_title(title, fontsize=14)
        fig.colorbar(smap(nrm, cmap), ax=ax, shrink=0.55, pad=0.0)
    ax = fig.add_subplot(1, 3, 3)
    sel = np.arange(24)  # the ring u = 0, all v
    vv = np.linspace(0, 2 * np.pi, 200)
    ax.plot(vv, np.cos(vv) / (r * (R + r * np.cos(vv))), color=C["x"], lw=1.6, label=r"exact $K$")
    ax.plot(W[sel], K[sel], "o", color=C["x"], ms=6, label=r"discrete $K$")
    ax.plot(vv, (R + 2 * r * np.cos(vv)) / (2 * r * (R + r * np.cos(vv))), color=C["z"], lw=1.6,
            label=r"exact $H$")
    ax.plot(W[sel], H[sel], "s", color=C["z"], ms=5, label=r"discrete $H$")
    ax.set_xlabel(r"$v$ (around the tube)")
    ax.set_xticks([0, np.pi, 2 * np.pi]); ax.set_xticklabels(["0", r"$\pi$", r"$2\pi$"])
    ax.legend(fontsize=12, loc="lower center")
    ax.set_title(r"$\sum_i (2\pi-\sum\theta) = $" + f"{defect.sum():.1e}" + r" $= 2\pi\chi$", fontsize=14)
    save(fig, out("curvature"))


# ---------------------------------------------------------------------------
# Figure 4: smoothing a noisy closed curve: Laplacian vs Taubin vs implicit
# ---------------------------------------------------------------------------
def fig_smoothing():
    rng = np.random.default_rng(3)
    n = 200
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    rr = 1 + 0.25 * np.cos(5 * th) + 0.04 * rng.standard_normal(n)
    X0 = np.c_[rr * np.cos(th), rr * np.sin(th)]
    Lu = -np.eye(n) + 0.5 * (np.roll(np.eye(n), 1, 1) + np.roll(np.eye(n), -1, 1))  # uniform Laplacian

    def area(X):
        x, y = X[:, 0], X[:, 1]
        return 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))

    lam_lap, lam, mu = 0.5, 0.33, -0.34
    shots = [0, 10, 100, 1000]
    runs = {"lap": [X0], "taubin": [X0]}
    areas = {"lap": [area(X0)], "taubin": [area(X0)]}
    X, Y = X0.copy(), X0.copy()
    for it in range(1, shots[-1] + 1):
        X = X + lam_lap * (Lu @ X)
        Y = Y + lam * (Lu @ Y)
        Y = Y + mu * (Lu @ Y)
        areas["lap"].append(area(X)); areas["taubin"].append(area(Y))
        if it in shots:
            runs["lap"].append(X.copy()); runs["taubin"].append(Y.copy())
    impl = [X0]
    Z = X0.copy()
    A_impl = np.linalg.inv(np.eye(n) - 25.0 * Lu)  # one implicit step of size h = 25
    for _ in range(3):
        Z = A_impl @ Z
        impl.append(Z.copy())

    fig, axs = plt.subplots(1, 4, figsize=(18, 5))
    cols = [C["gray"], C["c"], C["a"], C["x"]]
    for ax, key, title in [(axs[0], "lap", r"Laplacian, $\lambda=0.5$"),
                           (axs[1], "taubin", r"Taubin, $\lambda=0.33,\ \mu=-0.34$")]:
        for X_, c, s in zip(runs[key], cols, shots):
            XX = np.vstack([X_, X_[:1]])
            ax.plot(XX[:, 0], XX[:, 1], color=c, lw=1.6 if s == 0 else 2.2, label=f"{s} it.")
        ax.set_title(title, fontsize=14)
    for Z_, c, s in zip(impl, cols, range(4)):
        ZZ = np.vstack([Z_, Z_[:1]])
        axs[2].plot(ZZ[:, 0], ZZ[:, 1], color=c, lw=1.6 if s == 0 else 2.2, label=f"{s} step")
    axs[2].set_title(r"implicit, $(I-hL)x'=x$, $h=25$", fontsize=14)
    for ax in axs[:3]:
        ax.set_aspect("equal"); ax.set_xlim(-1.4, 1.4); ax.set_ylim(-1.4, 1.4)
        ax.legend(fontsize=11, loc="upper right", framealpha=0.9)
        ax.set_xticks([]); ax.set_yticks([])
    it = np.arange(shots[-1] + 1)
    axs[3].plot(it, np.array(areas["lap"]) / areas["lap"][0], color=C["b"], label="Laplacian")
    axs[3].plot(it, np.array(areas["taubin"]) / areas["taubin"][0], color=C["a"], label="Taubin")
    axs[3].set_xscale("symlog", linthresh=10)
    axs[3].set_xlabel("iterations"); axs[3].set_ylabel("area / initial area")
    axs[3].set_ylim(0, 1.1); axs[3].legend(fontsize=12)
    save(fig, out("smoothing"))


# ---------------------------------------------------------------------------
# Figure 5: Loop subdivision of an octahedron
# ---------------------------------------------------------------------------
def loop_subdivide(V, F):
    """One step of Loop subdivision for a closed triangle mesh (the post's code)."""
    n = len(V)
    opp = defaultdict(list)            # edge (a, b), a < b -> vertices opposite to it
    nbr = [set() for _ in range(n)]
    for f in F:
        for k in range(3):
            a, b, c = f[k], f[(k + 1) % 3], f[(k + 2) % 3]
            opp[(min(a, b), max(a, b))].append(c)
            nbr[a].add(b); nbr[b].add(a)
    newV = np.zeros((n + len(opp), 3))
    for i in range(n):                 # even (old) vertices
        k = len(nbr[i])
        beta = (5 / 8 - (3 / 8 + np.cos(2 * np.pi / k) / 4) ** 2) / k
        newV[i] = (1 - k * beta) * V[i] + beta * V[list(nbr[i])].sum(0)
    eid = {}
    for m, ((a, b), cs) in enumerate(opp.items()):  # odd (new edge) vertices
        eid[(a, b)] = n + m
        newV[n + m] = 3 / 8 * (V[a] + V[b]) + 1 / 8 * (V[cs[0]] + V[cs[1]])
    e = lambda a, b: eid[(min(a, b), max(a, b))]  # noqa: E731
    newF = []
    for a, b, c in F:
        ab, bc, ca = e(a, b), e(b, c), e(c, a)
        newF += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    return newV, np.array(newF)


def fig_loop():
    V = np.array([(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)], float)
    V[4] *= 1.6  # stretch one apex so the limit surface is not just a sphere
    F = np.array([(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)])
    fig = plt.figure(figsize=(16, 4.8))
    V0 = V.copy()
    for lvl in range(4):
        ax = fig.add_subplot(1, 4, lvl + 1, projection="3d")
        draw_mesh(ax, V, F, shaded_colors(V, F, base=C["a"] if lvl else C["gray"]),
                  edgecolor=C["dark"], lw=0.6 if lvl < 3 else 0.3)
        if lvl:
            ax.plot(*np.vstack([V0[[0, 2, 1, 3, 0]]]).T, color=C["gray"], lw=1, ls="--")
        frame3d(ax, V0, elev=18, azim=-50, pad=0.62)
        ax.set_title(f"level {lvl}: {len(F)} faces", fontsize=14)
        V, F = loop_subdivide(V, F)
    save(fig, out("loop-subdivision"))


# ---------------------------------------------------------------------------
# Figure 6: QEM simplification of a bumpy sphere
# ---------------------------------------------------------------------------
def qem_simplify(V, F, target):
    """Garland-Heckbert edge collapse (the post's implementation)."""
    V = V.copy()
    F = [list(f) for f in F]
    n = len(V)
    vf = [set() for _ in range(n)]
    for fi, f in enumerate(F):
        for v in f:
            vf[v].add(fi)
    Q = np.zeros((n, 4, 4))
    for f in F:
        a, b, c = V[f]
        nrm = np.cross(b - a, c - a)
        nrm = nrm / np.linalg.norm(nrm)
        p = np.append(nrm, -nrm @ a)
        for v in f:
            Q[v] += np.outer(p, p)
    alive = np.ones(n, bool)
    ver = np.zeros(n, int)
    neighbors = lambda v: {w for fi in vf[v] for w in F[fi]} - {v}  # noqa: E731

    def best(u, w):
        Qs = Q[u] + Q[w]
        A = Qs.copy(); A[3] = [0, 0, 0, 1]
        if np.linalg.cond(A) < 1e8:
            x = np.linalg.solve(A, [0, 0, 0, 1.0])
        else:
            cands = [np.append(V[u], 1), np.append(V[w], 1), np.append(0.5 * (V[u] + V[w]), 1)]
            x = min(cands, key=lambda c: c @ Qs @ c)
        return float(x @ Qs @ x), x[:3]

    heap = []

    def push(u, w):
        cost, x = best(u, w)
        heapq.heappush(heap, (cost, u, w, ver[u], ver[w], tuple(x)))

    for u in range(n):
        for w in neighbors(u):
            if u < w:
                push(u, w)
    faces = len(F)
    while faces > target and heap:
        cost, u, w, vu, vw, x = heapq.heappop(heap)
        if not (alive[u] and alive[w]) or ver[u] != vu or ver[w] != vw:
            continue                                    # stale entry
        if len(neighbors(u) & neighbors(w)) != 2:
            continue                                    # link condition: keep the mesh manifold
        x = np.array(x)
        shared = vf[u] & vf[w]
        flip = False
        for fi in (vf[u] | vf[w]) - shared:             # reject collapses that fold a face over
            old = V[F[fi]]
            new = np.array([x if v in (u, w) else V[v] for v in F[fi]])
            n0 = np.cross(old[1] - old[0], old[2] - old[0])
            n1 = np.cross(new[1] - new[0], new[2] - new[0])
            if n0 @ n1 <= 0.1 * np.linalg.norm(n0) * np.linalg.norm(n1):
                flip = True
                break
        if flip:
            continue
        V[u] = x
        Q[u] = Q[u] + Q[w]
        for fi in shared:
            for v in F[fi]:
                vf[v].discard(fi)
            faces -= 1
        for fi in vf[w]:
            F[fi] = [u if v == w else v for v in F[fi]]
            vf[u].add(fi)
        vf[w] = set(); alive[w] = False
        ver[u] += 1
        for nb in neighbors(u):
            push(u, nb)
    keep = sorted({fi for v in range(n) if alive[v] for fi in vf[v]})
    return V, np.array([F[fi] for fi in keep])


def bumpy_sphere():
    V, F = icosphere(3)
    x, y, z = V.T
    rad = 1 + 0.12 * np.sin(5 * x) * np.sin(5 * y) * np.sin(5 * z) + 0.25 * z ** 2
    return V * rad[:, None], F


def fig_qem():
    V, F = bumpy_sphere()
    targets = [len(F), 400, 150, 60]
    fig = plt.figure(figsize=(16, 4.8))
    for k, t in enumerate(targets):
        Vs, Fs = (V, F) if k == 0 else qem_simplify(V, F, t)
        ax = fig.add_subplot(1, 4, k + 1, projection="3d")
        draw_mesh(ax, Vs, Fs, shaded_colors(Vs, Fs, base=C["c"]), edgecolor=C["dark"],
                  lw=0.25 if k == 0 else 0.5)
        frame3d(ax, V, elev=20, azim=-60, pad=0.62)
        ax.set_title(f"{len(Fs)} faces", fontsize=14)
    save(fig, out("qem"))


# ---------------------------------------------------------------------------
# Figure 7: Tutte embedding (uniform) vs harmonic (cotan) parameterization
# ---------------------------------------------------------------------------
def grid_patch(m=16):
    s = np.linspace(-1, 1, m)
    X, Y = np.meshgrid(s, s, indexing="ij")
    Z = 0.9 * np.exp(-((X - 0.15) ** 2 + (Y + 0.1) ** 2) / 0.18) + 0.25 * X * Y
    V = np.c_[X.ravel(), Y.ravel(), Z.ravel()]
    idx = lambda i, j: i * m + j  # noqa: E731
    F = []
    for i in range(m - 1):
        for j in range(m - 1):
            a, b, c, d = idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)
            F += [(a, b, c), (a, c, d)]
    loop = ([idx(i, 0) for i in range(m - 1)] + [idx(m - 1, j) for j in range(m - 1)] +
            [idx(i, m - 1) for i in range(m - 1, 0, -1)] + [idx(0, j) for j in range(m - 1, 0, -1)])
    return V, np.array(F), loop


def tutte(V, F, loop, weights="uniform"):
    """The post's Tutte / harmonic embedding: boundary on the unit circle, interior = weighted average."""
    n = len(V)
    if weights == "uniform":
        W = np.zeros((n, n))
        for a, b, c in F:
            for i, j in ((a, b), (b, c), (c, a)):
                W[i, j] = W[j, i] = 1.0
    else:
        W = cotan_laplacian(V, F)
        W[np.diag_indices(n)] = 0.0
    L = W - np.diag(W.sum(1))
    seg = np.linalg.norm(V[loop] - V[np.roll(loop, -1)], axis=1)
    t = 2 * np.pi * np.r_[0, np.cumsum(seg)[:-1]] / seg.sum()
    UV = np.zeros((n, 2))
    UV[loop] = np.c_[np.cos(t), np.sin(t)]
    inner = np.setdiff1d(np.arange(n), loop)
    UV[inner] = np.linalg.solve(L[np.ix_(inner, inner)], -L[np.ix_(inner, loop)] @ UV[loop])
    return UV


def fig_tutte():
    V, F, loop = grid_patch(16)
    A3 = face_areas(V, F)
    fig = plt.figure(figsize=(16, 5.4))
    ax = fig.add_subplot(1, 3, 1, projection="3d")
    checker = np.array([((f // 2) % 15 + (f // 30)) % 2 for f in range(len(F))])
    cols = shaded_colors(V, F, values=checker, cmap=cm.Purples, norm=Normalize(-1.2, 1.5))
    draw_mesh(ax, V, F, cols, edgecolor=C["dark"], lw=0.3)
    ax.plot(*V[loop + [loop[0]]].T, color=C["b"], lw=2.5)
    frame3d(ax, V, elev=32, azim=-62, pad=0.62)
    ax.set_title("3D patch (disk topology)", fontsize=14)
    dnorm = TwoSlopeNorm(vmin=-1.5, vcenter=0, vmax=1.5)
    for k, (wts, title) in enumerate([("uniform", "Tutte (uniform weights)"),
                                      ("cotan", "harmonic (cotan weights)")]):
        UV = tutte(V, F, loop, wts)
        UV3 = np.c_[UV, np.zeros(len(UV))]
        A2 = face_areas(UV3, F)
        dist = np.log2((A2 / A2.sum()) / (A3 / A3.sum()))
        ax = fig.add_subplot(1, 3, k + 2)
        for f, tri in enumerate(F):
            ax.add_patch(Polygon(UV[tri], closed=True, fc=cm.RdBu_r(dnorm(dist[f])), ec=C["dark"], lw=0.3))
        ax.plot(*UV[loop + [loop[0]]].T, color=C["b"], lw=2.5)
        ax.set_aspect("equal"); ax.set_xlim(-1.08, 1.08); ax.set_ylim(-1.08, 1.08); ax.axis("off")
        ax.set_title(title + f"\nmax |log2 area ratio| = {np.abs(dist).max():.2f}", fontsize=14)
    fig.colorbar(smap(dnorm, cm.RdBu_r), ax=fig.axes[1:], shrink=0.8,
                 label=r"$\log_2$(2D area / 3D area)")
    save(fig, out("tutte"))


# ---------------------------------------------------------------------------
# Implicit surfaces: a 2D SDF, marching squares, sphere tracing
# ---------------------------------------------------------------------------
def sd_circle(p, c, r):
    return np.hypot(p[..., 0] - c[0], p[..., 1] - c[1]) - r


def sd_box(p, c, b):
    q = np.abs(p - np.asarray(c)) - np.asarray(b)
    outside = np.hypot(np.maximum(q[..., 0], 0), np.maximum(q[..., 1], 0))
    inside = np.minimum(np.maximum(q[..., 0], q[..., 1]), 0)
    return outside + inside


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def sdf2(p):
    p = np.asarray(p, float)
    return smin(sd_circle(p, (-0.35, -0.05), 0.42), sd_box(p, (0.38, 0.12), (0.3, 0.22)), 0.15)


def marching_squares(f, xs, ys):
    """The post's marching squares: one or two segments per cell, saddles decided by the centre."""
    G = f(np.stack(np.meshgrid(xs, ys, indexing="ij"), -1))
    segs = []
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            cx = [xs[i], xs[i + 1], xs[i + 1], xs[i]]
            cy = [ys[j], ys[j], ys[j + 1], ys[j + 1]]
            v = [G[i, j], G[i + 1, j], G[i + 1, j + 1], G[i, j + 1]]
            pts = {}
            for e in range(4):
                a, b = e, (e + 1) % 4
                if (v[a] < 0) != (v[b] < 0):
                    t = v[a] / (v[a] - v[b])
                    pts[e] = (cx[a] + t * (cx[b] - cx[a]), cy[a] + t * (cy[b] - cy[a]))
            if len(pts) == 2:
                segs.append(list(pts.values()))
            elif len(pts) == 4:
                centre = f(np.array([0.5 * (xs[i] + xs[i + 1]), 0.5 * (ys[j] + ys[j + 1])]))
                if (centre < 0) == (v[0] < 0):
                    segs += [[pts[0], pts[1]], [pts[2], pts[3]]]
                else:
                    segs += [[pts[3], pts[0]], [pts[1], pts[2]]]
    return G, segs


def fig_marching_squares():
    fine = np.linspace(-1, 1, 400)
    FX, FY = np.meshgrid(fine, fine, indexing="ij")
    D = sdf2(np.stack([FX, FY], -1))
    fig, axs = plt.subplots(1, 3, figsize=(16, 5.6))
    lim = np.abs(D).max()
    im = axs[0].pcolormesh(FX, FY, D, cmap="RdBu_r", norm=TwoSlopeNorm(vmin=-lim, vcenter=0, vmax=lim),
                           shading="auto", rasterized=True)
    axs[0].contour(FX, FY, D, levels=np.arange(-0.4, 0.8, 0.1), colors="k", linewidths=0.6, alpha=0.5)
    axs[0].contour(FX, FY, D, levels=[0], colors=C["dark"], linewidths=2.5)
    fig.colorbar(im, ax=axs[0], shrink=0.8, label=r"$f(x,y)$")
    axs[0].set_title(r"SDF: smooth union, level sets", fontsize=14)
    for ax, m in [(axs[1], 12), (axs[2], 36)]:
        xs = np.linspace(-1, 1, m)
        G, segs = marching_squares(sdf2, xs, xs)
        for x in xs:
            ax.axvline(x, color=C["gray"], lw=0.4, alpha=0.5); ax.axhline(x, color=C["gray"], lw=0.4, alpha=0.5)
        if m <= 12:
            GX, GY = np.meshgrid(xs, xs, indexing="ij")
            ax.scatter(GX[G < 0], GY[G < 0], s=30, color=C["z"], zorder=3)
            ax.scatter(GX[G >= 0], GY[G >= 0], s=30, facecolors="white", edgecolors=C["x"], zorder=3)
        ax.contour(FX, FY, D, levels=[0], colors=C["gray"], linewidths=1.5, linestyles="--")
        for s in segs:
            ax.plot(*np.array(s).T, color=C["a"], lw=2.6)
        ax.set_title(f"{m - 1}x{m - 1} cells: {len(segs)} segments", fontsize=14)
    for ax in axs:
        ax.set_aspect("equal"); ax.set_xlim(-1, 1); ax.set_ylim(-1, 1)
        ax.set_xticks([-1, 0, 1]); ax.set_yticks([-1, 0, 1]); ax.grid(False)
    save(fig, out("marching-squares"))


def fig_sphere_tracing():
    fine = np.linspace(-1, 1, 300)
    FX, FY = np.meshgrid(fine, fine, indexing="ij")
    D = sdf2(np.stack([FX, FY], -1))
    fig, ax = plt.subplots(figsize=(9, 8))
    ax.contourf(FX, FY, D, levels=[-2, 0], colors=[C["fill"]])
    ax.contour(FX, FY, D, levels=[0], colors=C["dark"], linewidths=2.2)
    o = np.array([-0.95, 0.9])
    rays = [(np.array([0.55, -0.75]), C["a"]), (np.array([1.0, -0.42]), C["b"]), (np.array([1.0, -0.05]), C["y"])]
    for d, col in rays:
        d = d / np.linalg.norm(d)
        t, pts = 0.0, []
        for _ in range(64):
            p = o + t * d
            dist = float(sdf2(p))
            pts.append((p, dist))
            if dist < 1e-3 or t > 3.0:
                break
            t += dist
        for p, dist in pts:
            ax.add_patch(Circle(p, abs(dist), fill=False, ec=col, lw=1.0, alpha=0.6))
        P = np.array([p for p, _ in pts])
        ax.plot(P[:, 0], P[:, 1], "o-", color=col, ms=5, lw=1.8,
                label=f"{len(pts)} steps" + (", hit" if pts[-1][1] < 1e-3 else ", miss"))
    ax.plot(*o, "ks", ms=10)
    ax.set_aspect("equal"); ax.set_xlim(-1, 1.3); ax.set_ylim(-1, 1); ax.grid(False)
    ax.legend(loc="lower left", fontsize=13)
    ax.set_title(r"sphere tracing: $t \leftarrow t + f(o + t\,d)$", fontsize=15)
    save(fig, out("sphere-tracing"))


# ---------------------------------------------------------------------------
# Figure: marching tetrahedra on a 3D SDF (torus smoothly joined with a sphere)
# ---------------------------------------------------------------------------
def sdf3(p):
    q = np.stack([np.hypot(p[..., 0], p[..., 1]) - 0.62, p[..., 2]], -1)
    torus_d = np.hypot(q[..., 0], q[..., 1]) - 0.22
    sphere_d = np.linalg.norm(p - np.array([0.0, 0.0, 0.3]), axis=-1) - 0.38
    return smin(torus_d, sphere_d, 0.18)


CUBE = np.array([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)])
TETS = [(0, 5, 1, 6), (0, 1, 2, 6), (0, 2, 3, 6), (0, 3, 7, 6), (0, 7, 4, 6), (0, 4, 5, 6)]


def marching_tets(f, lo, hi, n):
    s = np.linspace(lo, hi, n)
    h = s[1] - s[0]
    G = f(np.stack(np.meshgrid(s, s, s, indexing="ij"), -1))
    tris = []
    for i in range(n - 1):
        for j in range(n - 1):
            for k in range(n - 1):
                vals = np.array([G[i + a, j + b, k + c] for a, b, c in CUBE])
                if (vals < 0).all() or (vals >= 0).all():
                    continue
                pos = np.array([s[i], s[j], s[k]]) + h * CUBE
                for tet in TETS:
                    v, p = vals[list(tet)], pos[list(tet)]
                    ins = [q for q in range(4) if v[q] < 0]
                    outs = [q for q in range(4) if v[q] >= 0]
                    cut = lambda a, b: p[a] + v[a] / (v[a] - v[b]) * (p[b] - p[a])  # noqa: E731
                    if len(ins) in (1, 3):
                        lone, rest = (ins[0], outs) if len(ins) == 1 else (outs[0], ins)
                        tris.append([cut(lone, r) for r in rest])
                    elif len(ins) == 2:
                        a, b = ins; c, d = outs
                        q0, q1, q2, q3 = cut(a, c), cut(a, d), cut(b, d), cut(b, c)
                        tris += [[q0, q1, q2], [q0, q2, q3]]
    return np.array(tris)


def fig_marching_tets():
    T = marching_tets(sdf3, -1.0, 1.0, 26)
    V = T.reshape(-1, 3)
    F = np.arange(len(V)).reshape(-1, 3)
    fig = plt.figure(figsize=(9, 7.5))
    ax = fig.add_subplot(projection="3d")
    draw_mesh(ax, V, F, shaded_colors(V, F, base=C["a"]), lw=0.15)
    frame3d(ax, V, elev=30, azim=-58, pad=0.6)
    ax.set_title(f"marching tetrahedra, 25^3 cells: {len(F)} triangles", fontsize=14)
    save(fig, out("marching-tets"))


# ---------------------------------------------------------------------------
# Figure: 2D Poisson reconstruction from oriented points
# ---------------------------------------------------------------------------
def fig_poisson():
    rng = np.random.default_rng(7)
    curve = lambda th: 0.55 + 0.13 * np.cos(3 * th) + 0.05 * np.sin(5 * th)  # noqa: E731
    th = np.sort(rng.uniform(0, 2 * np.pi, 140))
    P = np.c_[curve(th) * np.cos(th), curve(th) * np.sin(th)] + 0.008 * rng.standard_normal((140, 2))
    # PCA normals from the 8 nearest neighbours
    D2 = ((P[:, None] - P[None]) ** 2).sum(-1)
    N = np.zeros_like(P)
    for i in range(len(P)):
        nb = P[np.argsort(D2[i])[:8]]
        evals, evecs = np.linalg.eigh(np.cov((nb - nb.mean(0)).T))
        N[i] = evecs[:, 0]                       # smallest eigenvalue = normal direction
    N *= np.sign(((P - P.mean(0)) * N).sum(1))[:, None]  # orient outward (fine for star shapes)
    # splat normals into a vector field and solve  lap(chi) = -div(V)  with FFT (periodic grid)
    M = 128
    xs = np.linspace(-1, 1, M, endpoint=False)
    h = xs[1] - xs[0]
    GX, GY = np.meshgrid(xs, xs, indexing="ij")
    Vx, Vy = np.zeros((M, M)), np.zeros((M, M))
    sig = 2.0 * h
    for p, nrm in zip(P, N):
        g = np.exp(-((GX - p[0]) ** 2 + (GY - p[1]) ** 2) / (2 * sig ** 2))
        Vx += nrm[0] * g; Vy += nrm[1] * g
    div = (np.roll(Vx, -1, 0) - np.roll(Vx, 1, 0) + np.roll(Vy, -1, 1) - np.roll(Vy, 1, 1)) / (2 * h)
    k = np.fft.fftfreq(M) * 2 * np.pi
    lam = (2 * np.cos(k)[:, None] - 2 + 2 * np.cos(k)[None, :] - 2) / h ** 2
    lam[0, 0] = 1.0
    chi_hat = np.fft.fft2(-div) / lam
    chi_hat[0, 0] = 0.0
    chi = np.real(np.fft.ifft2(chi_hat))
    ii = np.clip(np.round((P + 1) / h).astype(int), 0, M - 1)
    iso = chi[ii[:, 0], ii[:, 1]].mean()

    fig, axs = plt.subplots(1, 3, figsize=(16, 5.6))
    axs[0].quiver(P[:, 0], P[:, 1], N[:, 0], N[:, 1], color=C["a"], scale=14, width=0.005)
    axs[0].plot(P[:, 0], P[:, 1], "o", color=C["dark"], ms=3)
    axs[0].set_title(f"{len(P)} points + PCA normals (k=8)", fontsize=14)
    im = axs[1].pcolormesh(GX, GY, chi, cmap="viridis", shading="auto", rasterized=True)
    axs[1].contour(GX, GY, chi, levels=[iso], colors="white", linewidths=2.2)
    fig.colorbar(im, ax=axs[1], shrink=0.8, label=r"$\chi$")
    axs[1].set_title(r"$\Delta\chi = -\nabla\cdot\vec V$, iso = mean $\chi$ at points", fontsize=14)
    tt = np.linspace(0, 2 * np.pi, 400)
    axs[2].plot(curve(tt) * np.cos(tt), curve(tt) * np.sin(tt), "--", color=C["gray"], lw=2, label="true")
    cs = axs[2].contour(GX, GY, chi, levels=[iso], colors=C["a"], linewidths=2.6)
    axs[2].plot([], [], color=C["a"], lw=2.6, label="reconstructed")
    axs[2].plot(P[:, 0], P[:, 1], "o", color=C["dark"], ms=2.5)
    axs[2].legend(fontsize=12, loc="lower right")
    axs[2].set_title(f"{M}x{M} grid", fontsize=14)
    del cs
    for ax in axs:
        ax.set_aspect("equal"); ax.set_xlim(-0.95, 0.95); ax.set_ylim(-0.95, 0.95); ax.grid(False)
        ax.set_xticks([]); ax.set_yticks([])
    save(fig, out("poisson-2d"))


if __name__ == "__main__":
    fig_halfedge()
    fig_cotan()
    fig_curvature()
    fig_smoothing()
    fig_loop()
    fig_qem()
    fig_tutte()
    fig_marching_squares()
    fig_sphere_tracing()
    fig_marching_tets()
    fig_poisson()
