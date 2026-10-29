"""Figures for graphics post 05: ray tracing and path tracing.

Conventions (same as the post): right-handed world, y up, the camera at z = 3.9 looks down -z.
Hemisphere figures use the local shading frame of section 5 (z = surface normal).
3D world-space plots map scene (x, y, z) to matplotlib (x, -z, y), a rotation, so the
picture stays right-handed with y pointing up.

    python3 bin/figures/graphics/graphics_05.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

import numpy as np  # noqa: E402
from matplotlib.patches import Circle, Polygon, Rectangle  # noqa: E402

np.seterr(invalid="ignore")  # inf * 0 in the vectorized quad test, as in the post's code
OUT = pathlib.Path(__file__).resolve().parents[3] / "assets" / "img" / "blog" / "graphics"


def yup(p):
    """Scene (x, y, z) with y up -> matplotlib (x, -z, y); works on (..., 3) arrays."""
    p = np.asarray(p, float)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], -1)


def clean3d(ax):
    ax.set_axis_off()
    ax.set_proj_type("ortho")


def world_axes(ax, origin, length=0.6):
    """Draw scene x, y, z basis arrows at `origin` (scene coordinates) in y-up view."""
    for k, (col, name) in enumerate(zip((C["x"], C["y"], C["z"]), "xyz")):
        e = np.zeros(3); e[k] = length
        s, v = yup(origin), yup(e)
        ax.quiver(*s, *v, color=col, linewidth=2, arrow_length_ratio=0.18)
        ax.text(*(s + v * 1.18), f"${name}$", color=col, fontsize=16)


# ----------------------------------------------------------------------------------------
# The post's NumPy path tracer (section 7), with a `mode` switch for the MIS sanity test:
# "mis" (as in the post), "bsdf" (w_b = 1, w_l = 0) and "nee" (w_b = 0, w_l = 1).
# ----------------------------------------------------------------------------------------
def normalize(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


quads, spheres = [], []


def quad(p, u, v, albedo, emit=(0, 0, 0)):
    quads.append((np.array(p, float), np.array(u, float), np.array(v, float),
                  np.array(albedo, float), np.array(emit, float)))


white, red, green = (0.73, 0.73, 0.73), (0.65, 0.05, 0.05), (0.12, 0.45, 0.15)
quad((-1, -1, -1), (2, 0, 0), (0, 0, 2), white)          # floor
quad((-1, 1, -1), (0, 0, 2), (2, 0, 0), white)           # ceiling
quad((-1, -1, -1), (0, 2, 0), (2, 0, 0), white)          # back wall
quad((-1, -1, -1), (0, 0, 2), (0, 2, 0), red)            # left wall
quad((1, -1, -1), (0, 2, 0), (0, 0, 2), green)           # right wall
quad((-0.25, 0.999, -0.25), (0.5, 0, 0), (0, 0, 0.5), (0, 0, 0), (17, 12, 4))  # light
spheres.append((np.array([-0.45, -0.6, -0.3]), 0.4, np.array(white), np.zeros(3)))
spheres.append((np.array([0.45, -0.65, 0.3]), 0.35, np.array([0.8, 0.6, 0.2]), np.zeros(3)))
LIGHT = 5
lp, lu, lv = quads[LIGHT][:3]
l_n = normalize(np.cross(lu, lv)); l_area = np.linalg.norm(np.cross(lu, lv))
albedo = np.array([q[3] for q in quads] + [s[2] for s in spheres])
emission = np.array([q[4] for q in quads] + [s[3] for s in spheres])


def intersect(o, d):
    n = len(o)
    t_best = np.full(n, np.inf); obj = np.full(n, -1); nrm = np.zeros((n, 3))
    for i, (p, u, v, _, _) in enumerate(quads):
        qn = normalize(np.cross(u, v))
        denom = d @ qn
        with np.errstate(divide="ignore", invalid="ignore"):
            t = ((p - o) @ qn) / denom
        x = o + t[:, None] * d - p
        a, b = x @ u / (u @ u), x @ v / (v @ v)
        ok = (np.abs(denom) > 1e-9) & (t > 1e-4) & (t < t_best) & (a >= 0) & (a <= 1) & (b >= 0) & (b <= 1)
        t_best[ok], obj[ok], nrm[ok] = t[ok], i, qn
    for j, (c, r, _, _) in enumerate(spheres):
        oc = o - c
        b = np.sum(oc * d, axis=1); disc = b * b - (np.sum(oc * oc, axis=1) - r * r)
        s = np.sqrt(np.maximum(disc, 0))
        t = np.where(-b - s > 1e-4, -b - s, -b + s)
        ok = (disc > 0) & (t > 1e-4) & (t < t_best)
        t_best[ok], obj[ok] = t[ok], len(quads) + j
        nrm[ok] = (o[ok] + t[ok, None] * d[ok] - c) / r
    return t_best, obj, nrm


def onb(n):
    s = np.where(n[:, 2] >= 0, 1.0, -1.0)
    a = -1.0 / (s + n[:, 2]); b = n[:, 0] * n[:, 1] * a
    t = np.stack([1 + s * n[:, 0] ** 2 * a, s * b, -s * n[:, 0]], 1)
    bb = np.stack([b, s + n[:, 1] ** 2 * a, -n[:, 1]], 1)
    return t, bb


def render_sample(rng, W, H, mode="mis", max_depth=6):
    def cosine_sample(n):
        u1, u2 = rng.random(len(n)), rng.random(len(n))
        r, phi = np.sqrt(u1), 2 * np.pi * u2
        t, b = onb(n)
        return (r * np.cos(phi))[:, None] * t + (r * np.sin(phi))[:, None] * b + np.sqrt(1 - u1)[:, None] * n

    jx, jy = rng.random((H, W)), rng.random((H, W))
    px = (np.arange(W)[None, :] + jx) / W * 2 - 1
    py = 1 - (np.arange(H)[:, None] + jy) / H * 2
    th = np.tan(np.radians(20))
    d = normalize(np.stack([px * th, py * th, -np.ones_like(px)], -1).reshape(-1, 3))
    o = np.tile([0.0, 0.0, 3.9], (len(d), 1))
    L, beta = np.zeros_like(d), np.ones_like(d)
    pix = np.arange(len(d))
    prev_pdf = np.zeros(len(d))
    for depth in range(max_depth):
        t, obj, n = intersect(o, d)
        alive = obj >= 0
        o, d, t, obj, n, beta, pix, prev_pdf = (a[alive] for a in (o, d, t, obj, n, beta, pix, prev_pdf))
        if len(o) == 0:
            break
        x = o + t[:, None] * d
        hit_l = (obj == LIGHT) & (d @ l_n < 0)
        if depth == 0 or mode == "bsdf":
            w = np.ones(hit_l.sum())
        elif mode == "nee":
            w = np.zeros(hit_l.sum())
        else:
            cos_l = -(d[hit_l] @ l_n)
            pl = t[hit_l] ** 2 / (cos_l * l_area)
            w = prev_pdf[hit_l] ** 2 / (prev_pdf[hit_l] ** 2 + pl ** 2)
        np.add.at(L, pix[hit_l], beta[hit_l] * emission[obj[hit_l]] * w[:, None])
        keep = obj != LIGHT
        x, d, obj, n, beta, pix = x[keep], d[keep], obj[keep], n[keep], beta[keep], pix[keep]
        n = np.where((np.sum(n * d, 1) < 0)[:, None], n, -n)
        a = albedo[obj]
        y = lp + rng.random((len(x), 1)) * lu + rng.random((len(x), 1)) * lv
        to_l = y - x; dist2 = np.sum(to_l ** 2, 1); dist = np.sqrt(dist2); wi = to_l / dist[:, None]
        cos_s, cos_l = np.sum(n * wi, 1), -(wi @ l_n)
        ok = (cos_s > 0) & (cos_l > 0)
        ts, _, _ = intersect(x[ok] + 1e-4 * n[ok], wi[ok])
        vis = np.zeros(len(x), bool); vis[ok] = ts >= dist[ok] - 1e-3
        pl = dist2 / np.maximum(cos_l, 1e-8) / l_area
        pb = np.maximum(cos_s, 0) / np.pi
        wl = {"mis": pl ** 2 / (pl ** 2 + pb ** 2), "nee": np.ones_like(pl), "bsdf": np.zeros_like(pl)}[mode]
        contrib = beta * (a / np.pi) * emission[LIGHT] * (np.maximum(cos_s, 0) * wl / pl)[:, None]
        np.add.at(L, pix[vis], contrib[vis])
        d = cosine_sample(n); o = x + 1e-4 * n
        prev_pdf = np.sum(n * d, 1) / np.pi
        beta = beta * a
        if depth >= 2:
            q = np.clip(beta.max(1), 0.05, 0.95)
            survive = rng.random(len(q)) < q
            beta[survive] /= q[survive, None]
            o, d, beta, pix, prev_pdf = o[survive], d[survive], beta[survive], pix[survive], prev_pdf[survive]
    return L.reshape(H, W, 3)


def tonemap(img):
    return np.clip(img, 0, 1) ** (1 / 2.2)


# ----------------------------------------------------------------------------------------
# 1. Camera rays: pinhole at e = (0, 0, 3.9), 40 degree fov, one ray per pixel centre of a
#    5 x 5 image, ending at its real first hit in the Cornell box.
# ----------------------------------------------------------------------------------------
def fig_camera():
    fig = plt.figure(figsize=(9, 5.6))
    ax = fig.add_subplot(projection="3d"); clean3d(ax)
    e = np.array([0, 0, 3.9]); th = np.tan(np.radians(20)); N = 5
    # Box edges
    for p, u, v, alb, em in quads[:5]:
        corners = np.array([p, p + u, p + u + v, p + v, p])
        ax.plot(*yup(corners).T, color=C["gray"], lw=1.2)
    lc = np.array([lp, lp + lu, lp + lu + lv, lp + lv])
    ax.add_collection3d(__import__("mpl_toolkits.mplot3d.art3d", fromlist=["x"]).Poly3DCollection(
        [yup(lc)], facecolor=C["light"], edgecolor=C["b"], alpha=0.9))
    for c, r, *_ in spheres:  # sphere silhouettes as wireframes
        uu, vv = np.mgrid[0:2 * np.pi:24j, 0:np.pi:12j]
        P = np.stack([np.cos(uu) * np.sin(vv), np.cos(vv), np.sin(uu) * np.sin(vv)], -1) * r + c
        Q = yup(P)
        ax.plot_wireframe(Q[..., 0], Q[..., 1], Q[..., 2], color=C["b"], lw=0.5, alpha=0.6)
    # image plane at distance 1 in front of the eye, with the pixel grid
    xs = np.linspace(-1, 1, N + 1) * th
    for g in xs:
        ax.plot(*yup(np.array([[g, -th, 2.9], [g, th, 2.9]])).T, color=C["a"], lw=1)
        ax.plot(*yup(np.array([[-th, g, 2.9], [th, g, 2.9]])).T, color=C["a"], lw=1)
    centers = (np.arange(N) + 0.5) / N * 2 - 1
    px, py = np.meshgrid(centers, -centers)
    d = normalize(np.stack([px * th, py * th, -np.ones_like(px)], -1).reshape(-1, 3))
    o = np.tile(e, (len(d), 1))
    t, obj, _ = intersect(o, d)
    hit = o + t[:, None] * d
    for h_, k in zip(hit, obj):
        ax.plot(*yup(np.array([e, h_])).T, color=C["a"], lw=1.1, alpha=0.75)
    ax.scatter(*yup(hit).T, color=C["dark"], s=18, depthshade=False)
    ax.scatter(*yup(e), color=C["a"], s=60, depthshade=False)
    ax.text(*yup(e + [0.05, 0.12, 0]), r"$\mathbf{e}$", color=C["a"], fontsize=18)
    world_axes(ax, np.array([-1.0, -1.0, 2.2]), 0.55)
    ax.set_box_aspect((2.2, 5.0, 2.2), zoom=1.2)
    ax.view_init(elev=18, azim=-28)
    ax.set_xlim(-1.1, 1.1); ax.set_ylim(-4.0, 1.1); ax.set_zlim(-1.1, 1.1)
    fig.subplots_adjust(0, 0, 1, 1)
    save(fig, OUT / "05-camera-rays.svg")


# ----------------------------------------------------------------------------------------
# 2. Ray-sphere: the quadratic t^2 + 2 b t + c' for 4 rays (2 hits, tangent, miss, inside).
# ----------------------------------------------------------------------------------------
def fig_ray_sphere():
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8, 9.4), gridspec_kw=dict(height_ratios=[1.0, 0.9]))
    c, r = np.zeros(2), 1.0
    a1.add_patch(Circle(c, r, facecolor=C["fill"], edgecolor=C["a"], lw=2))
    rays = [((-2.6, 0.45), (1, 0), C["z"], "2"), ((-2.6, 1.0), (1, 0), C["y"], "1"),
            ((-2.6, 1.45), (1, 0), C["gray"], "0"), ((0.25, -0.15), (0.6, -0.8), C["b"], "in")]
    ts = np.linspace(-1.5, 5.0, 400)
    for o, d, col, name in rays:
        o, d = np.array(o), np.array(d) / np.linalg.norm(d)
        oc = o - c; b = oc @ d; cp = oc @ oc - r * r; disc = b * b - cp
        a1.annotate("", xy=o + 3.6 * d, xytext=o, arrowprops=dict(arrowstyle="-|>", color=col, lw=2))
        a1.plot(*o, "o", color=col, ms=6)
        roots = [] if disc < 0 else sorted({-b - np.sqrt(disc), -b + np.sqrt(disc)})
        for tr in roots:
            p = o + tr * d
            a1.plot(*p, "o", color=col, ms=9, mfc="white" if tr < 0 else col, mew=2)
        a2.plot(ts, ts ** 2 + 2 * b * ts + cp, color=col, label=name)
        for tr in roots:
            a2.plot(tr, 0, "o", color=col, ms=9, mfc="white" if tr < 0 else col, mew=2)
    a1.text(0, 0, r"$\mathbf{c}$", ha="center", va="center", fontsize=17)
    a1.annotate("", xy=(0.71, -0.71), xytext=(0, 0), arrowprops=dict(arrowstyle="-", color=C["a"], lw=1.5))
    a1.text(0.42, -0.25, "$r$", color=C["a"], fontsize=16)
    a1.text(-2.6, 0.45 - 0.3, r"$\mathbf{o}$", fontsize=16, ha="center")
    a1.set_aspect("equal"); a1.set_xlim(-2.8, 1.8); a1.set_ylim(-1.3, 1.8)
    a1.set_axis_off()
    a2.axhline(0, color=C["dark"], lw=1); a2.axvline(0, color=C["dark"], lw=1, ls=":")
    a2.set_ylim(-3, 6); a2.set_xlim(-1.5, 5)
    a2.set_xlabel("$t$"); a2.set_ylabel(r"$t^2+2bt+c'$")
    a1.legend(*a2.get_legend_handles_labels(), title=r"$\#$ hits ($t>0$)", fontsize=12, title_fontsize=12,
              loc="lower left", frameon=False)
    fig.tight_layout()
    save(fig, OUT / "05-ray-sphere.svg")


# ----------------------------------------------------------------------------------------
# 3. Moller-Trumbore with the post's own test ray: o = (0.2, 0.3, -1), d = +z.
# ----------------------------------------------------------------------------------------
def moller_trumbore(o, d, v0, v1, v2, eps=1e-9):
    e1, e2 = v1 - v0, v2 - v0
    p = np.cross(d, e2)
    det = np.sum(e1 * p, axis=1)
    ok = np.abs(det) > eps
    inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    s = o - v0
    u = np.sum(s * p, axis=1) * inv
    q = np.cross(s, e1)
    v = (q @ d) * inv
    t = np.sum(e2 * q, axis=1) * inv
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > eps)
    return np.where(hit, t, np.inf), u, v


def fig_moller_trumbore():
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    v0, v1, v2 = np.array([0., 0, 0]), np.array([1., 0, 0]), np.array([0., 1, 0])
    o, d = np.array([0.2, 0.3, -1.0]), np.array([0.0, 0.0, 1.0])
    o2 = np.array([0.75, 0.55, -1.0])  # a second ray that misses (u + v > 1)
    t, u, v = (a[0] for a in moller_trumbore(o, d, v0[None], v1[None], v2[None]))
    _, u2, v2b = (a[0] for a in moller_trumbore(o2, d, v0[None], v1[None], v2[None]))
    assert np.isclose(t, 1) and np.isclose(u, 0.2) and np.isclose(v, 0.3)
    x = o + t * d
    fig = plt.figure(figsize=(8, 11))
    ax = fig.add_subplot(2, 1, 1, projection="3d"); clean3d(ax)
    # sub-triangles: the one opposite v1 has area u, opposite v2 has area v, opposite v0 has 1-u-v
    for tri, col in [((v0, x, v2), C["x"]), ((v0, v1, x), C["y"]), ((x, v1, v2), C["z"])]:
        ax.add_collection3d(Poly3DCollection([np.array(tri)], facecolor=col, alpha=0.25, edgecolor=col))
    ax.plot(*np.array([v0, v1, v2, v0]).T, color=C["dark"], lw=2)
    arrow3d(ax, v0, v1 - v0, C["b"], lw=2.5); arrow3d(ax, v0, v2 - v0, C["c"], lw=2.5)
    ax.text(*(v1 * 0.55 + [0, -0.18, 0]), r"$\mathbf{e}_1$", color=C["b"], fontsize=17)
    ax.text(*(v2 * 0.55 + [-0.2, 0, 0]), r"$\mathbf{e}_2$", color=C["c"], fontsize=17)
    for p, s, off in [(v0, r"$\mathbf{v}_0$", (-0.12, -0.12, 0)), (v1, r"$\mathbf{v}_1$", (0.05, -0.05, 0)),
                      (v2, r"$\mathbf{v}_2$", (-0.05, 0.08, 0))]:
        ax.text(*(p + off), s, fontsize=17)
    ax.plot(*np.array([o, x]).T, color=C["a"], lw=2.2)
    arrow3d(ax, x, 0.6 * d, C["a"], lw=2.2)
    ax.scatter(*o, color=C["a"], s=40); ax.text(*(o + [0.05, 0, -0.05]), r"$\mathbf{o}$", color=C["a"], fontsize=17)
    ax.scatter(*x, color=C["dark"], s=50, depthshade=False)
    ax.plot(*np.array([o2, o2 + 1.6 * d]).T, color=C["gray"], lw=1.8, ls="--")
    ax.text(*(o2 + [0.05, 0, 0.0]), "miss", color=C["gray"], fontsize=13)
    ax.view_init(elev=22, azim=-62)
    ax.set_xlim(-0.1, 1.0); ax.set_ylim(-0.1, 1.0); ax.set_zlim(-1.0, 0.6); ax.set_box_aspect((1, 1, 1.4))
    # parameter domain
    b = fig.add_subplot(2, 1, 2)
    b.add_patch(Polygon([[0, 0], [1, 0], [0, 1]], closed=True, facecolor=C["fill"], edgecolor=C["dark"], lw=2))
    b.plot(u, v, "o", color=C["a"], ms=11); b.plot(u2, v2b, "x", color=C["gray"], ms=12, mew=3)
    b.annotate(f"$(u,v)=({u:.1f},{v:.1f})$\n$t={t:.0f}$", (u, v), xytext=(0.06, 0.62), fontsize=14,
               arrowprops=dict(arrowstyle="->", color=C["a"]))
    b.annotate(f"$u+v={u2 + v2b:.2f}>1$", (u2, v2b), xytext=(0.55, 0.88), fontsize=14, color=C["gray"],
               arrowprops=dict(arrowstyle="->", color=C["gray"]))
    b.set_xlabel("$u$"); b.set_ylabel("$v$")
    b.text(0.03, 0.03, r"$\mathbf{v}_0$", fontsize=14); b.text(0.88, 0.03, r"$\mathbf{v}_1$", fontsize=14)
    b.text(0.06, 0.97, r"$\mathbf{v}_2$", fontsize=14)
    b.set_xlim(-0.15, 1.1); b.set_ylim(-0.15, 1.1); b.set_aspect("equal"); b.set_xticks([0, 0.5, 1]); b.set_yticks([0, 0.5, 1])
    fig.tight_layout()
    save(fig, OUT / "05-moller-trumbore.svg")


# ----------------------------------------------------------------------------------------
# 4-5. BVH (the post's SAH builder, unchanged) over a toy 2D scene of 24 boxes (z extent 0).
# ----------------------------------------------------------------------------------------
def area(l, h):
    e = np.maximum(h - l, 0)
    return 2 * (e[..., 0] * e[..., 1] + e[..., 1] * e[..., 2] + e[..., 2] * e[..., 0])


def sah_split(lo, hi, cent, c_trav=1.0, c_isect=1.0, record=None):
    n = len(cent)
    parent = area(lo.min(0), hi.max(0))
    best = (c_isect * n, None, None, None)
    for axis in range(3):
        order = np.argsort(cent[:, axis])
        l, h = lo[order], hi[order]
        a_left = area(np.minimum.accumulate(l), np.maximum.accumulate(h))[:-1]
        a_right = area(np.minimum.accumulate(l[::-1])[::-1], np.maximum.accumulate(h[::-1])[::-1])[1:]
        k = np.arange(1, n)
        cost = c_trav + c_isect * (a_left * k + a_right * (n - k)) / parent
        if record is not None:
            record.append((axis, cent[order, axis], cost))
        i = np.argmin(cost)
        if cost[i] < best[0]:
            best = (cost[i], axis, order, i + 1)
    return best


def build(lo, hi, idx, leaf_size=2, depth=0):
    node = {"lo": lo[idx].min(0), "hi": hi[idx].max(0), "depth": depth}
    if len(idx) <= leaf_size:
        node["prims"] = idx; return node
    cost, axis, order, k = sah_split(lo[idx], hi[idx], 0.5 * (lo[idx] + hi[idx]))
    if axis is None:
        node["prims"] = idx; return node
    node["kids"] = (build(lo, hi, idx[order[:k]], leaf_size, depth + 1),
                    build(lo, hi, idx[order[k:]], leaf_size, depth + 1))
    return node


def slab(o, inv_d, lo, hi):
    t0, t1 = (lo - o) * inv_d, (hi - o) * inv_d
    return np.max(np.minimum(t0, t1)), np.min(np.maximum(t0, t1))


def toy_scene():
    rng = np.random.default_rng(3)
    n = 24
    # two clusters plus scattered boxes, so the SAH has something to find
    cen = np.concatenate([rng.normal([-1.2, 0.6], 0.35, (10, 2)), rng.normal([1.1, -0.5], 0.4, (9, 2)),
                          rng.uniform(-2, 2, (5, 2))])
    half = rng.uniform(0.06, 0.2, (n, 2))
    lo = np.c_[cen - half, np.full(n, -0.01)]; hi = np.c_[cen + half, np.full(n, 0.01)]  # thin in z
    return lo, hi


def fig_bvh():
    lo, hi = toy_scene()
    root = build(lo, hi, np.arange(len(lo)))
    o = np.array([-2.3, -1.6, 0.0]); d = np.array([1.0, 0.62, 0.0]); d /= np.linalg.norm(d)
    inv_d = 1.0 / np.where(d == 0, 1e-12, d)
    # traverse exactly as in the post, recording the fate of each node
    fate, best_t, best_i, stack = {}, np.inf, -1, [root]
    while stack:
        nd = stack.pop()
        tn, tf = slab(o, inv_d, nd["lo"], nd["hi"])
        if not (tn <= tf and tf > 0 and tn < best_t):
            fate[id(nd)] = "culled"; continue
        fate[id(nd)] = "visited"
        if "prims" in nd:
            for p in nd["prims"]:
                a, b = slab(o, inv_d, lo[p], hi[p])
                t = a if (a <= b and b > 0) else np.inf
                if t < best_t:
                    best_t, best_i = t, p
        else:
            stack.extend(nd["kids"])
    nodes = []
    def walk(nd):
        nodes.append(nd)
        for k in nd.get("kids", ()):
            walk(k)
    walk(root)
    maxd = max(n_["depth"] for n_ in nodes)
    cmap = plt.get_cmap("viridis")
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(9, 11.5), gridspec_kw=dict(height_ratios=[1.15, 1]))
    for nd in nodes:
        col = cmap(nd["depth"] / (maxd + 0.5))
        pad = 0.035 * (maxd - nd["depth"])  # slight inflation so nested boxes stay visible
        a1.add_patch(Rectangle(nd["lo"][:2] - pad, *(nd["hi"][:2] - nd["lo"][:2] + 2 * pad), fill=False,
                               edgecolor=col, lw=2.6 - 0.3 * nd["depth"],
                               ls="-" if fate.get(id(nd)) == "visited" else (0, (3, 2))))
    for p in range(len(lo)):
        a1.add_patch(Rectangle(lo[p, :2], *(hi[p, :2] - lo[p, :2]),
                               facecolor=C["b"] if p == best_i else C["gray"], alpha=0.85, edgecolor="none"))
    a1.annotate("", xy=o[:2] + d[:2] * 5.2, xytext=o[:2], arrowprops=dict(arrowstyle="-|>", color=C["a"], lw=2.4))
    xh = o + best_t * d
    a1.plot(*xh[:2], "o", color=C["a"], ms=9)
    a1.text(*(o[:2] + [0.05, -0.22]), r"$\mathbf{o}$", color=C["a"], fontsize=17)
    a1.set_aspect("equal"); a1.set_axis_off()
    a1.set_xlim(-2.6, 2.6); a1.set_ylim(-2.4, 2.3)
    # tree layout: leaves evenly spaced, inner nodes at the mean of their children
    xpos, cnt = {}, [0]
    def layout(nd):
        if "kids" in nd:
            xs = [layout(k) for k in nd["kids"]]; xpos[id(nd)] = np.mean(xs)
        else:
            xpos[id(nd)] = cnt[0]; cnt[0] += 1
        return xpos[id(nd)]
    layout(root)
    for nd in nodes:
        for k in nd.get("kids", ()):
            a2.plot([xpos[id(nd)], xpos[id(k)]], [-nd["depth"], -k["depth"]], color=C["gray"], lw=1.5, zorder=1)
    for nd in nodes:
        f = fate.get(id(nd), "skipped")
        col = cmap(nd["depth"] / (maxd + 0.5))
        has_hit = "prims" in nd and best_i in nd["prims"]
        a2.scatter(xpos[id(nd)], -nd["depth"], s=230 if "kids" in nd else 150, zorder=2,
                   marker="o" if "kids" in nd else "s",
                   facecolor=(C["b"] if has_hit else col) if f == "visited" else "white",
                   edgecolor=col, linewidths=2.2 if f != "skipped" else 1.0, alpha=1 if f != "skipped" else 0.45)
        if "prims" in nd:
            a2.text(xpos[id(nd)], -nd["depth"] - 0.42, str(len(nd["prims"])), ha="center", fontsize=11, color=C["dark"])
    a2.set_axis_off()
    a2.set_ylim(-maxd - 0.8, 0.5)
    fig.tight_layout()
    save(fig, OUT / "05-bvh.svg")
    vis = sum(1 for v in fate.values() if v == "visited")
    print(f"  BVH: {len(nodes)} nodes, depth {maxd}, visited {vis}, culled {sum(1 for v in fate.values() if v == 'culled')}")
    return lo, hi


def fig_sah(lo, hi):
    rec = []
    n = len(lo)
    best = sah_split(lo, hi, 0.5 * (lo + hi), record=rec)
    fig, axs = plt.subplots(2, 1, figsize=(9, 7.4), sharey=True)
    for (axis, c_sorted, cost), ax in zip(rec[:2], axs):
        k = np.arange(1, n)
        split_pos = 0.5 * (c_sorted[:-1] + c_sorted[1:])
        col = C["x"] if axis == 0 else C["y"]
        ax.plot(split_pos, cost, "o-", color=col, ms=6)
        ax.axhline(n, color=C["gray"], ls="--", lw=1.6)
        ax.text(0.5 * (split_pos[0] + split_pos[-1]), n + 0.8, f"leaf: $N_P C_{{isect}}={n}$", color=C["gray"], fontsize=13)
        i = np.argmin(cost)
        ax.plot(split_pos[i], cost[i], "*", color=C["b"] if axis == best[1] else col, ms=22, zorder=5)
        ax.annotate(f"$N_L={k[i]},\\ N_R={n - k[i]}$\n$C={cost[i]:.1f}$", (split_pos[i], cost[i]),
                    xytext=(-60, 38), textcoords="offset points", fontsize=13)
        ax.set_ylabel("$C(L,R)$")
        ax.set_xlabel(f"split position along ${'xy'[axis]}$")
        ax.set_ylim(min(c.min() for _, _, c in rec[:2]) - 2, n + 4)
    fig.tight_layout()
    save(fig, OUT / "05-sah-cost.svg")
    print(f"  SAH root: best axis {'xyz'[best[1]]}, k={best[3]}, cost {best[0]:.2f} (leaf {n})")


# ----------------------------------------------------------------------------------------
# 6-7. Monte Carlo: the post's irradiance integral E = int L cos dw, L = cos^2, exact pi/2.
# ----------------------------------------------------------------------------------------
def fig_mc_convergence():
    rng = np.random.default_rng(0)
    exact, runs, Nmax = np.pi / 2, 8, 4096
    N = np.arange(1, Nmax + 1)
    fig, ax = plt.subplots(figsize=(9, 5.6))
    for name, col in [("uniform", C["b"]), ("cosine", C["z"])]:
        u = rng.random((400, Nmax))
        if name == "uniform":
            f = u ** 2 * u * 2 * np.pi
        else:
            c = np.sqrt(u); f = c ** 2 * np.pi
        run = np.cumsum(f, 1) / N
        err = np.abs(run - exact)
        idx = np.unique(np.round(np.logspace(0, np.log10(Nmax), 260)).astype(int)) - 1  # keep the SVG small
        for r in range(runs):
            ax.loglog(N[idx], err[r, idx], color=col, lw=0.8, alpha=0.35)
        rmse = np.sqrt((err ** 2).mean(0))
        ax.loglog(N[idx], rmse[idx], color=col, lw=3, label=f"{name}: RMSE")
        print(f"  MC {name}: RMSE at N=64 {rmse[63]:.3f}")
    ax.loglog(N, 1.0 / np.sqrt(N), color=C["dark"], ls="--", lw=1.8, label=r"$\propto 1/\sqrt{N}$")
    ax.axvline(64, color=C["gray"], ls=":", lw=1.5)
    ax.set_xlabel("$N$ (samples)"); ax.set_ylabel(r"$|\hat I_N - \pi/2|$")
    ax.set_ylim(1e-4, 5); ax.set_xlim(1, Nmax)
    ax.legend(fontsize=13, loc="lower left")
    fig.tight_layout()
    save(fig, OUT / "05-mc-convergence.svg")


def hemisphere_wire(ax, r=1.0):
    t = np.linspace(0, 2 * np.pi, 120)
    ax.plot(np.cos(t), np.sin(t), 0 * t, color=C["gray"], lw=1.2)
    for phi in np.linspace(0, np.pi, 4, endpoint=False):
        s = np.linspace(0, np.pi, 60)
        ax.plot(np.cos(s) * np.cos(phi), np.cos(s) * np.sin(phi), np.sin(s), color=C["gray"], lw=0.6, alpha=0.6)
    for el in (np.pi / 6, np.pi / 3):
        ax.plot(np.cos(el) * np.cos(t), np.cos(el) * np.sin(t), np.sin(el) + 0 * t, color=C["gray"], lw=0.6, alpha=0.6)


def fig_hemisphere():
    rng = np.random.default_rng(2)
    n = 350
    u1, u2 = rng.random(n), rng.random(n)
    samples = {}
    ct = u1; st = np.sqrt(1 - ct ** 2); ph = 2 * np.pi * u2
    samples["uniform"] = np.c_[st * np.cos(ph), st * np.sin(ph), ct]
    ct = np.sqrt(1 - u1); st = np.sqrt(u1)
    samples["cosine"] = np.c_[st * np.cos(ph), st * np.sin(ph), ct]
    fig = plt.figure(figsize=(9.5, 8.2))
    gs = fig.add_gridspec(2, 2, height_ratios=[1.0, 1], hspace=0.05)
    for k, (name, col, pdf) in enumerate([("uniform", C["b"], r"$p=\frac{1}{2\pi}$"),
                                          ("cosine", C["z"], r"$p=\frac{\cos\theta}{\pi}$")]):
        ax = fig.add_subplot(gs[0, k], projection="3d"); clean3d(ax)
        hemisphere_wire(ax)
        s = samples[name]
        ax.scatter(*s.T, s=9, color=col, depthshade=False)
        ax.quiver(0, 0, 0, 0, 0, 1.25, color=C["dark"], lw=2, arrow_length_ratio=0.12)
        ax.text(0.05, 0, 1.32, r"$\mathbf{n}$", fontsize=16)
        ax.set_xlim(-1, 1); ax.set_ylim(-1, 1); ax.set_zlim(0, 1.3); ax.set_box_aspect((2, 2, 1.3))
        ax.view_init(elev=24, azim=-60)
        ax.set_title(f"{name}  {pdf}", color=col, fontsize=16, y=0.93)
    # histogram of 2000 estimates with N = 64 (the post's experiment)
    ax = fig.add_subplot(gs[1, :])
    rng = np.random.default_rng(0)
    exact, N, trials = np.pi / 2, 64, 2000
    u = rng.random((trials, N)); est_u = np.mean(u ** 2 * u / (1 / (2 * np.pi)), axis=1)
    c = np.sqrt(rng.random((trials, N))); est_c = np.mean(c ** 2 * c / (c / np.pi), axis=1)
    bins = np.linspace(0.8, 2.4, 60)
    for e, col, name in [(est_u, C["b"], "uniform"), (est_c, C["z"], "cosine")]:
        ax.hist(e, bins=bins, color=col, alpha=0.55, label=f"{name}: std {e.std():.2f}")
        print(f"  hemisphere {name}: mean {e.mean():.4f} std {e.std():.4f}")
    ax.axvline(exact, color=C["dark"], lw=2, ls="--")
    ax.text(exact + 0.02, ax.get_ylim()[1] * 0.92, r"$\pi/2$", fontsize=15)
    ax.set_xlabel(r"$\hat E$  ($N=64$, 2000 trials)"); ax.set_yticks([])
    ax.legend(fontsize=13, loc="upper right")
    fig.tight_layout()
    save(fig, OUT / "05-hemisphere-sampling.svg")


# ----------------------------------------------------------------------------------------
# 8. GGX VNDF: the post's sampler, alpha = 0.3, view 1 rad (57 deg) from the normal.
# ----------------------------------------------------------------------------------------
def sample_ggx_vndf(ve, ax, ay, u1, u2):
    vh = np.array([ax * ve[0], ay * ve[1], ve[2]]); vh /= np.linalg.norm(vh)
    lensq = vh[0] ** 2 + vh[1] ** 2
    t1 = np.array([-vh[1], vh[0], 0.0]) / np.sqrt(lensq) if lensq > 0 else np.array([1.0, 0, 0])
    t2 = np.cross(vh, t1)
    r, phi = np.sqrt(u1), 2 * np.pi * u2
    p1, p2 = r * np.cos(phi), r * np.sin(phi)
    s = 0.5 * (1 + vh[2])
    p2 = (1 - s) * np.sqrt(1 - p1 * p1) + s * p2
    nh = p1 * t1 + p2 * t2 + np.sqrt(max(0.0, 1 - p1 * p1 - p2 * p2)) * vh
    ne = np.array([ax * nh[0], ay * nh[1], max(0.0, nh[2])])
    return ne / np.linalg.norm(ne)


def ggx_D(m_z, a):
    return a * a / (np.pi * (m_z ** 2 * (a * a - 1) + 1) ** 2)


def smith_G1(v_z, a):
    tan2 = (1 - v_z ** 2) / v_z ** 2
    return 2 / (1 + np.sqrt(1 + a * a * tan2))


def pdf_reflect(v, l, a):
    m = (v + l) / np.linalg.norm(v + l, axis=-1, keepdims=True)
    return smith_G1(v[2], a) * ggx_D(m[..., 2], a) / (4 * v[2])


def fig_ggx():
    rng = np.random.default_rng(0)
    a, v = 0.3, np.array([np.sin(1.0), 0.0, np.cos(1.0)])
    n = 20000
    m = np.array([sample_ggx_vndf(v, a, a, rng.random(), rng.random()) for _ in range(n)])
    l = 2 * (m @ v)[:, None] * m - v
    print(f"  GGX: P(l_z > 0.8) sampled {np.mean(l[:, 2] > 0.8):.4f}; below horizon {np.mean(l[:, 2] <= 0):.4f}")
    fig = plt.figure(figsize=(8, 10.5))
    ax = fig.add_subplot(2, 1, 1, projection="3d"); clean3d(ax)
    hemisphere_wire(ax)
    k = 250
    ax.scatter(*m[:k].T, s=9, color=C["c"], depthshade=False, label=r"$\mathbf{m}\sim D_{\omega_o}$")
    lk = l[:k][l[:k, 2] > 0]
    ax.scatter(*lk.T, s=9, color=C["b"], depthshade=False, label=r"$\omega_i$")
    ax.quiver(0, 0, 0, *(1.3 * v), color=C["a"], lw=2.5, arrow_length_ratio=0.1)
    ax.text(*(1.4 * v), r"$\omega_o$", color=C["a"], fontsize=17)
    ax.quiver(0, 0, 0, 0, 0, 1.25, color=C["dark"], lw=1.6, arrow_length_ratio=0.1)
    ax.text(0.03, 0, 1.3, r"$\mathbf{n}$", fontsize=15)
    ax.set_xlim(-1, 1); ax.set_ylim(-1, 1); ax.set_zlim(0, 1.3); ax.set_box_aspect((2, 2, 1.3))
    ax.view_init(elev=14, azim=-80)
    ax.legend(loc="upper left", fontsize=13, markerscale=2.5, frameon=False)
    # marginal density of cos(theta_i): samples vs the analytic pdf integrated over phi
    b = fig.add_subplot(2, 1, 2)
    cz = np.linspace(0.002, 0.998, 300)
    phis = np.linspace(0, 2 * np.pi, 721)[:-1]
    CZ, PH = np.meshgrid(cz, phis, indexing="ij")
    S = np.sqrt(1 - CZ ** 2)
    L = np.stack([S * np.cos(PH), S * np.sin(PH), CZ], -1)
    dens = pdf_reflect(v, L, a).sum(1) * (2 * np.pi / len(phis))
    b.hist(l[:, 2][l[:, 2] > 0], bins=60, range=(0, 1), density=False,
           weights=np.full((l[:, 2] > 0).sum(), 60 / n), color=C["b"], alpha=0.55, label="sampler")
    b.plot(cz, dens, color=C["dark"], lw=2.2, label="analytic pdf")
    b.axvline(np.cos(1.0), color=C["a"], ls=":", lw=1.8)
    b.text(np.cos(1.0) - 0.01, dens.max() * 0.25, r"mirror $\cos\theta_o$", color=C["a"], fontsize=13, ha="right")
    b.set_xlabel(r"$\cos\theta_i$"); b.set_ylabel("density"); b.legend(fontsize=13, loc="upper left")
    fig.tight_layout()
    save(fig, OUT / "05-ggx-vndf.svg")


# ----------------------------------------------------------------------------------------
# 9. A light path with NEE in a 2D (flatland) side view of the Cornell box: plane x = 0.
#    Camera at z = 3.9 on the right, light on the ceiling, the two spheres' side profiles.
#    Coordinates of the plot: horizontal = scene z, vertical = scene y.
# ----------------------------------------------------------------------------------------
def fig_path_nee():
    circles = [(np.array([-0.3, -0.6]), 0.4), (np.array([0.3, -0.65]), 0.35)]  # (z, y) centers
    segs = [  # (point, normal) of box walls in (z, y): floor, ceiling, back wall
        ("floor", lambda p: p[1] + 1, np.array([0, 1.0])),
        ("ceil", lambda p: 1 - p[1], np.array([0, -1.0])),
        ("back", lambda p: p[0] + 1, np.array([1.0, 0])),
    ]
    light = (-0.25, 0.25)

    def hit2d(o, d):
        best, nb, kind = np.inf, None, None
        for name, _, nrm in segs:
            denom = d @ nrm
            if abs(denom) < 1e-12:
                continue
            p0 = {"floor": np.array([0, -1.0]), "ceil": np.array([0, 1.0]), "back": np.array([-1.0, 0])}[name]
            t = ((p0 - o) @ nrm) / denom
            x = o + t * d
            if t > 1e-6 and t < best and -1 - 1e-9 <= x[0] <= 1.0 + 1e-9 and -1 - 1e-9 <= x[1] <= 1 + 1e-9:
                best, nb, kind = t, nrm, ("light" if name == "ceil" and light[0] <= x[0] <= light[1] else name)
        for c, r in circles:
            oc = o - c; b = oc @ d; disc = b * b - (oc @ oc - r * r)
            if disc > 0:
                s = np.sqrt(disc)
                for t in (-b - s, -b + s):
                    if 1e-6 < t < best:
                        best, nb, kind = t, (o + t * d - c) / r, "sphere"; break
        return best, nb, kind

    def trace(seed):
        rng = np.random.default_rng(seed)
        o = np.array([3.9, 0.0]); y = rng.uniform(-0.3, 0.1)
        d = np.array([-1.0, y]); d /= np.linalg.norm(d)
        verts, shadows = [o], []
        for depth in range(4):
            t, nrm, kind = hit2d(o, d)
            if not np.isfinite(t):
                return None
            x = o + t * d; verts.append(x)
            if kind == "light":
                return verts, shadows, True
            if nrm @ d > 0:
                nrm = -nrm
            ys = np.array([rng.uniform(*light), 0.999])
            to = ys - x; dist = np.linalg.norm(to); wi = to / dist
            ts, _, kind_s = hit2d(x + 1e-6 * nrm, wi)
            visible = (nrm @ wi > 0) and ts >= dist - 1e-6
            shadows.append((x, ys, visible, nrm))
            # flatland cosine sampling: sin(theta) = 2u - 1 has pdf cos(theta)/2
            sth = 2 * rng.random() - 1; cth = np.sqrt(1 - sth ** 2)
            tang = np.array([-nrm[1], nrm[0]])
            d = cth * nrm + sth * tang; o = x + 1e-6 * nrm
        return verts, shadows, False

    # A hand-picked path (directions chosen for readability); every intersection and every
    # shadow-ray visibility test below is computed with hit2d.
    def path_from(dirs, light_pts):
        o = np.array([3.9, 0.0]); verts, shadows = [o], []
        for k, target in enumerate(dirs):
            d = np.asarray(target, float) - o; d /= np.linalg.norm(d)
            assert k == 0 or d @ shadows[-1][3] > 0, "bounce direction below the surface"
            t, nrm, kind = hit2d(o, d)
            x = o + t * d; verts.append(x)
            if nrm @ d > 0:
                nrm = -nrm
            ys = np.array([light_pts[k], 0.999]); to = ys - x; dist = np.linalg.norm(to); wi = to / dist
            ts, _, _ = hit2d(x + 1e-4 * nrm, wi)
            shadows.append((x, ys, bool(nrm @ wi > 0 and ts >= dist - 1e-3), nrm))
            o = x + 1e-4 * nrm
        return verts, shadows, False
    c2, r2 = circles[1]
    chosen = path_from([c2 + r2 * np.array([np.cos(1.75), np.sin(1.75)]), (-1.0, 0.25), (-0.72, -1.0)],
                       [0.1, -0.15, 0.2])
    verts, shadows, ended = chosen
    fig, ax = plt.subplots(figsize=(10, 5.6))
    ax.add_patch(Rectangle((-1, -1), 2, 2, fill=False, edgecolor=C["dark"], lw=2))
    ax.plot(light, [0.999, 0.999], color=C["light"], lw=9, solid_capstyle="butt")
    for c, r in circles:
        ax.add_patch(Circle(c, r, facecolor=C["fill"], edgecolor=C["a"], lw=1.8, alpha=0.8))
    ax.plot(3.9, 0, "s", color=C["dark"], ms=12)
    ax.text(3.9, 0.15, "camera", ha="center", fontsize=13)
    pts = np.array(verts)
    ax.plot(pts[:, 0], pts[:, 1], "-", color=C["a"], lw=2.6, zorder=3)
    for i in range(1, len(pts)):
        mid = 0.5 * (pts[i - 1] + pts[i]); dd = pts[i] - pts[i - 1]
        ax.annotate("", xy=mid + 0.02 * dd / np.linalg.norm(dd), xytext=mid,
                    arrowprops=dict(arrowstyle="-|>", color=C["a"], lw=2.2), zorder=3)
    for i, (x, ys, vis, nrm) in enumerate(shadows):
        ax.plot([x[0], ys[0]], [x[1], ys[1]], ls="-" if vis else "--", lw=2 if vis else 1.6,
                color=C["light"] if vis else C["gray"], zorder=2)
        ax.plot(*ys, "o", color=C["b"], ms=7, zorder=4)
        ax.annotate("", xy=x + 0.28 * nrm, xytext=x, arrowprops=dict(arrowstyle="-|>", color=C["dark"], lw=1.4))
        ax.plot(*x, "o", color=C["a"], ms=9, zorder=5)
        ax.text(x[0] + 0.06, x[1] - 0.16, f"$\\mathbf{{x}}_{i + 1}$", fontsize=16, zorder=6)
    ax.set_aspect("equal"); ax.set_xlim(-1.2, 4.2); ax.set_ylim(-1.15, 1.2)
    ax.set_xticks([-1, 0, 1, 2, 3, 3.9]); ax.set_yticks([-1, 0, 1])
    ax.set_xlabel("$z$"); ax.set_ylabel("$y$"); ax.grid(False)
    fig.tight_layout()
    save(fig, OUT / "05-path-nee.svg")


# ----------------------------------------------------------------------------------------
# 10. MIS: heuristic weights, and a 1D toy where MIS tracks the better technique.
#     f(x) = lobe(x; s) * 1[x in light window]; technique b samples the lobe (Gaussian, width s),
#     technique l samples the window uniformly; one sample from each, as in the path tracer.
# ----------------------------------------------------------------------------------------
def fig_mis():
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(9, 9.2))
    r = np.logspace(-2, 2, 400)  # p_l / p_b
    a1.semilogx(r, r / (1 + r), color=C["b"], label="balance $w_l$")
    a1.semilogx(r, r ** 2 / (1 + r ** 2), color=C["a"], label="power $w_l$")
    a1.semilogx(r, 1 / (1 + r), color=C["b"], ls="--", label="balance $w_b$")
    a1.semilogx(r, 1 / (1 + r ** 2), color=C["a"], ls="--", label="power $w_b$")
    a1.axvline(1, color=C["gray"], lw=1, ls=":")
    a1.set_xlabel(r"$p_l / p_b$"); a1.set_ylabel("weight"); a1.legend(fontsize=12, ncol=2, loc="center right")
    rng = np.random.default_rng(0)
    lo_, hi_ = -0.3, 0.6
    widths = np.logspace(-2, 0.7, 26)
    trials = 40000
    res = {k: [] for k in ("bsdf", "light", "balance", "power")}
    for s in widths:
        lobe = lambda x: np.exp(-0.5 * (x / s) ** 2) / (s * np.sqrt(2 * np.pi))
        f = lambda x: lobe(x) * ((x >= lo_) & (x <= hi_))
        from math import erf, sqrt
        exact = 0.5 * (erf(hi_ / (s * sqrt(2))) - erf(lo_ / (s * sqrt(2))))
        pb = lobe; pl = lambda x: ((x >= lo_) & (x <= hi_)) / (hi_ - lo_)
        xb = rng.normal(0, s, trials); xl = rng.uniform(lo_, hi_, trials)
        eb = f(xb) / pb(xb)
        el = f(xl) / pl(xl)
        for name, beta in (("balance", 1), ("power", 2)):
            wb = pb(xb) ** beta / (pb(xb) ** beta + pl(xb) ** beta)
            wl = pl(xl) ** beta / (pl(xl) ** beta + pb(xl) ** beta)
            res[name].append(np.std(wb * f(xb) / pb(xb) + wl * f(xl) / pl(xl)) / exact)
        # single-technique estimators also get two samples, for a fair comparison
        res["bsdf"].append(np.std(eb) / np.sqrt(2) / exact)
        res["light"].append(np.std(el) / np.sqrt(2) / exact)
    a2.loglog(widths, res["bsdf"], "o-", color=C["c"], ms=4, label="BSDF only")
    a2.loglog(widths, res["light"], "o-", color=C["light"], ms=4, label="light only")
    a2.loglog(widths, res["balance"], color=C["b"], lw=2.6, label="MIS balance")
    a2.loglog(widths, res["power"], color=C["a"], lw=2.6, ls="--", label="MIS power")
    a2.set_xlabel("lobe width $s$ (narrow = glossy, wide = rough)")
    a2.set_ylabel("rel. std (2 samples)")
    a2.legend(fontsize=12, loc="upper center", ncol=2)
    a2.set_ylim(None, max(max(res["bsdf"]), max(res["light"])) * 6)
    fig.tight_layout()
    save(fig, OUT / "05-mis.svg")


# ----------------------------------------------------------------------------------------
# 11. Russian roulette on a "white furnace" path: every bounce has albedo a and the light
#     adds 1 per bounce, so the path value is sum_k a^k = 1 / (1 - a).
# ----------------------------------------------------------------------------------------
def fig_rr():
    rng = np.random.default_rng(0)
    a, n_paths = 0.73, 200000
    exact = 1 / (1 - a)
    D = np.arange(1, 16)
    trunc = (1 - a ** D) / (1 - a)
    # RR exactly as in the post: from depth >= 2, q = clamp(max beta, 0.05, 0.95)
    est = np.zeros(n_paths); length = np.zeros(n_paths, int)
    beta = np.ones(n_paths); alive = np.ones(n_paths, bool)
    for depth in range(200):
        est[alive] += beta[alive]
        length[alive] += 1
        beta[alive] *= a
        if depth >= 2:
            q = np.clip(beta, 0.05, 0.95)
            surv = rng.random(n_paths) < q
            beta[alive & surv] /= q[alive & surv]
            alive &= surv
        if not alive.any():
            break
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8, 8.6))
    a1.plot(D, trunc, "o-", color=C["b"], label="fixed max depth")
    a1.axhline(exact, color=C["dark"], ls="--", lw=1.8)
    a1.errorbar([16.5], [est.mean()], yerr=[2 * est.std() / np.sqrt(n_paths)], fmt="*", ms=18, color=C["a"],
                label=f"RR: {est.mean():.3f}")
    a1.text(1, exact + 0.12, r"$1/(1-a)=%.3f$" % exact, fontsize=13)
    a1.set_xlabel("max depth"); a1.set_ylabel(r"$\mathbb{E}[\hat L]$"); a1.legend(fontsize=12, loc="lower right")
    a1.set_ylim(0.8, 4.3)
    h = np.bincount(length, minlength=25)[1:25] / n_paths
    a2.bar(np.arange(1, 25), h, color=C["a"], alpha=0.75)
    a2.set_xlabel("bounces before termination"); a2.set_ylabel("fraction of paths")
    a2.text(0.55, 0.85, f"mean {length.mean():.2f}", transform=a2.transAxes, fontsize=13)
    fig.tight_layout()
    save(fig, OUT / "05-russian-roulette.svg")
    print(f"  RR: mean {est.mean():.4f} (exact {exact:.4f}), mean length {length.mean():.2f}")


# ----------------------------------------------------------------------------------------
# 12-13. Path traced images from the post's renderer.
# ----------------------------------------------------------------------------------------
def fig_spp():
    W = H = 100
    rng = np.random.default_rng(0)
    accum = np.zeros((H, W, 3)); snaps = {}
    for s in range(1, 257):
        accum += (render_sample(rng, W, H) - accum) / s
        if s in (1, 4, 16, 256):
            snaps[s] = accum.copy()
    ref = snaps[256]
    fig, axs = plt.subplots(2, 2, figsize=(8.4, 9))
    for ax, s in zip(axs.ravel(), (1, 4, 16, 256)):
        ax.imshow(tonemap(snaps[s]), interpolation="nearest")
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
        ax.set_title(f"{s} spp", fontsize=16)
        for sp in ax.spines.values():
            sp.set_visible(False)
    fig.tight_layout()
    save(fig, OUT / "05-spp.svg")
    print("  spp: mean radiance at 256 spp", ref.mean(axis=(0, 1)))
    return ref


def fig_estimators(imgs_ref):
    W = H = 100; spp = 16
    imgs = {}
    for mode in ("bsdf", "nee", "mis"):
        rng = np.random.default_rng(1)
        acc = np.zeros((H, W, 3))
        for s in range(1, spp + 1):
            acc += (render_sample(rng, W, H, mode) - acc) / s
        imgs[mode] = acc
    # means of each estimator at more samples (lower resolution), to check they agree
    means = {}
    for mode in ("bsdf", "nee", "mis"):
        rng = np.random.default_rng(7)
        acc = np.zeros((48, 48, 3))
        for s in range(1, 257):
            acc += (render_sample(rng, 48, 48, mode) - acc) / s
        means[mode] = acc.mean()
    fig, axs = plt.subplots(2, 2, figsize=(8.4, 9.2))
    axs[1, 1].imshow(tonemap(imgs_ref), interpolation="nearest"); axs[1, 1].set_title("MIS, 256 spp", fontsize=15)
    for ax, mode in zip(axs.ravel(), ("bsdf", "nee", "mis", "ref")):
        if mode == "ref":
            ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
            for sp in ax.spines.values():
                sp.set_visible(False)
            continue
        ax.imshow(tonemap(imgs[mode]), interpolation="nearest")
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
        ax.set_title(f"{mode.upper()}, 16 spp\n256-spp mean {means[mode]:.3f}", fontsize=15)
        for sp in ax.spines.values():
            sp.set_visible(False)
    fig.tight_layout()
    save(fig, OUT / "05-estimators.svg")
    print("  estimator means (256 spp, 48x48):", {k: round(v, 4) for k, v in means.items()})


if __name__ == "__main__":
    only = set(sys.argv[1:])
    figs = [("camera", fig_camera), ("sphere", fig_ray_sphere), ("mt", fig_moller_trumbore),
            ("bvh", None), ("mc", fig_mc_convergence), ("hemi", fig_hemisphere), ("ggx", fig_ggx),
            ("path", fig_path_nee), ("mis", fig_mis), ("rr", fig_rr), ("spp", None)]
    for name, fn in figs:
        if only and name not in only:
            continue
        if name == "bvh":
            fig_sah(*fig_bvh())
        elif name == "spp":
            fig_estimators(fig_spp())
        else:
            fn()
