"""Figures for graphics post 03 (shading and textures).

Every image is computed with NumPy from the formulas and code of the post:
Lambert / Phong / Blinn-Phong on a sphere, a tiny software rasterizer for flat / Gouraud /
Phong shading, a cube UV atlas, the mipmap code of Section 5 on a perspective checkerboard,
a tangent frame on a curved patch, a normal map from a height field, and the shadow-map toy
of Section 7 run verbatim.

    python3 bin/figures/graphics/graphics_03.py
Set PREVIEW=<dir> to also write PNG previews.
"""
import os
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: F401,F403

import numpy as np
from matplotlib.patches import Arc, Polygon, Rectangle

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets" / "img" / "blog" / "graphics"
PREVIEW = os.environ.get("PREVIEW")


def out(fig, name):
    if PREVIEW:
        pathlib.Path(PREVIEW).mkdir(parents=True, exist_ok=True)
        fig.savefig(pathlib.Path(PREVIEW) / (name + ".png"), dpi=80)
    save(fig, OUT / f"03-{name}.svg")


def normalize(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


# The shading function of Section 2, unchanged.
def shade(n, l, v, model="blinn", kd=0.8, ks=0.5, shininess=32.0, ka=0.05):
    ndotl = np.clip(np.sum(n * l, -1), 0.0, None)
    diffuse = kd * ndotl
    if model == "phong":
        r = 2.0 * np.sum(n * l, -1, keepdims=True) * n - l
        spec = np.clip(np.sum(r * v, -1), 0.0, None) ** shininess
    else:
        h = normalize(l + v)
        spec = np.clip(np.sum(n * h, -1), 0.0, None) ** shininess
    spec = np.where(ndotl > 0.0, spec, 0.0)
    return ka + diffuse + ks * spec


def sphere_grid(W=256):
    y, x = np.mgrid[1:-1:W * 1j, -1:1:W * 1j]
    inside = x**2 + y**2 < 1.0
    z = np.sqrt(np.clip(1.0 - x**2 - y**2, 0.0, None))
    return np.stack([x, y, z], -1), inside


def to_display(img, inside, bg=1.0):
    """Clamp, crude gamma 1/2.2 (as in the post), white background outside the sphere."""
    return np.where(inside, np.clip(img, 0, 1) ** (1 / 2.2), bg)


def vec2(ax, origin, d, color, text=None, lw=2.6, off=(0, 0), fs=19):
    ax.annotate("", xy=(origin[0] + d[0], origin[1] + d[1]), xytext=origin,
                arrowprops=dict(arrowstyle="-|>", color=color, lw=lw, mutation_scale=22))
    if text:
        ax.text(origin[0] + d[0] * 1.13 + off[0], origin[1] + d[1] * 1.13 + off[1], text,
                color=color, fontsize=fs, ha="center", va="center")


def clean(ax):
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)
    ax.grid(False)


# ---------------------------------------------------------------------------
# 1. Lambert: beam spreading, cosine polar plot, shaded sphere
# ---------------------------------------------------------------------------
def fig_lambert():
    fig = plt.figure(figsize=(10, 8.6))
    gs = fig.add_gridspec(2, 2, height_ratios=[1, 1.1])
    # (a) a beam of width A hitting the surface at theta spreads over A / cos(theta)
    ax = fig.add_subplot(gs[0, 0])
    th = np.radians(60)
    l = np.array([np.sin(th), np.cos(th)])            # toward the light
    perp = np.array([np.cos(th), -np.sin(th)])        # across the beam
    A = 1.0
    foot = A / np.cos(th)                               # = 2 A
    ax.plot([-1.7, 1.7], [0, 0], color=C["dark"], lw=3)
    ax.add_patch(Rectangle((-foot / 2, -0.12), foot, 0.12, color=C["light"], alpha=0.8, lw=0))
    for s in np.linspace(-0.5, 0.5, 6):
        p = np.array([s * foot, 0.0])
        q = p + 2.1 * l
        ax.annotate("", xy=p, xytext=q, arrowprops=dict(arrowstyle="-|>", color=C["light"], lw=2))
    # beam cross-section A, drawn perpendicular to the rays
    c = 1.6 * l
    a0, a1 = c - perp * A / 2, c + perp * A / 2
    ax.annotate("", xy=a0, xytext=a1, arrowprops=dict(arrowstyle="<->", color=C["dark"], lw=1.8))
    ax.text(*(c + 0.18 * l + 0.05 * perp), "$A$", fontsize=19, ha="center", va="center")
    ax.annotate("", xy=(-foot / 2, -0.32), xytext=(foot / 2, -0.32),
                arrowprops=dict(arrowstyle="<->", color=C["dark"], lw=1.8))
    ax.text(0, -0.52, r"$A/\cos\theta$", fontsize=19, ha="center")
    vec2(ax, (0, 0), (0, 1.25), C["z"], r"$\mathbf{n}$")
    vec2(ax, (0, 0), 1.25 * l, C["b"], r"$\mathbf{l}$", off=(-0.12, 0.12))
    ax.add_patch(Arc((0, 0), 0.9, 0.9, theta1=90 - 60, theta2=90, color=C["dark"], lw=1.6))
    ax.text(0.2, 0.6, r"$\theta$", fontsize=18)
    ax.set_xlim(-1.8, 2.2); ax.set_ylim(-0.75, 2.3); ax.set_aspect("equal"); clean(ax)
    ax.set_title(r"$E \propto \cos\theta$")

    # (b) polar plot of max(0, cos theta), theta measured from the normal (up)
    ax = fig.add_subplot(gs[0, 1], projection="polar")
    t = np.linspace(-np.pi, np.pi, 721)
    ax.set_theta_zero_location("N")
    ax.set_theta_direction(-1)
    ax.plot(t, np.clip(np.cos(t), 0, None), color=C["a"], lw=3)
    ax.fill(t, np.clip(np.cos(t), 0, None), color=C["a"], alpha=0.15)
    for deg in (0, 30, 60):
        tt = np.radians(deg)
        ax.plot([tt, tt], [0, np.cos(tt)], color=C["b"], lw=1.8, ls="--")
        ax.plot([tt], [np.cos(tt)], "o", color=C["b"], ms=7)
    ax.set_thetamin(-90); ax.set_thetamax(90)
    ax.set_rticks([0.5, 1.0]); ax.set_rlim(0, 1.05)
    ax.set_xticks(np.radians([-90, -60, -30, 0, 30, 60, 90]))
    ax.set_title(r"$\max(0,\cos\theta)$", pad=12)

    # (c) sphere lit by l = normalize(1,1,1), Lambert only, with iso-lines of n.l
    ax = fig.add_subplot(gs[1, :])
    n, inside = sphere_grid(300)
    l3 = normalize(np.array([1.0, 1.0, 1.0]))
    ndl = np.sum(n * l3, -1)
    img = to_display(np.clip(ndl, 0, None), inside)
    ax.imshow(img, cmap="gray", vmin=0, vmax=1, extent=(-1, 1, -1, 1))
    ndl_m = np.where(inside, ndl, np.nan)
    cs = ax.contour(np.linspace(-1, 1, 300), np.linspace(1, -1, 300), ndl_m,
                    levels=[0.25, 0.5, 0.75], colors=[C["b"]], linewidths=1.4)
    ax.clabel(cs, fmt="%.2f", fontsize=12)
    ax.contour(np.linspace(-1, 1, 300), np.linspace(1, -1, 300), ndl_m, levels=[0.0],
               colors=[C["x"]], linewidths=2, linestyles="--")
    ax.add_patch(plt.Circle((0, 0), 1, fill=False, color=C["gray"], lw=1))
    vec2(ax, (0.0, 0.0), (0.62, 0.62), C["light"], r"$\mathbf{l}$", off=(0.05, 0))
    ax.set_xlim(-1.08, 1.08); ax.set_ylim(-1.08, 1.08); ax.set_aspect("equal"); clean(ax)
    ax.set_title(r"$\mathbf{n}\cdot\mathbf{l}$")
    fig.tight_layout()
    out(fig, "lambert")


# ---------------------------------------------------------------------------
# 2. Phong vs Blinn-Phong geometry and the lobe shapes (s' ~ 4s)
# ---------------------------------------------------------------------------
def fig_phong_blinn_geometry():
    fig = plt.figure(figsize=(10, 8.4))
    gs = fig.add_gridspec(2, 2, height_ratios=[1, 1.05])
    ang = lambda deg: np.array([np.sin(np.radians(deg)), np.cos(np.radians(deg))])
    al, av = -60.0, 10.0                     # angles from n (negative = left)
    ar = -al                                 # mirror direction
    ah = (al + av) / 2                       # half vector
    alpha = ar - av
    for k, which in enumerate(("phong", "blinn")):
        ax = fig.add_subplot(gs[0, k])
        ax.add_patch(Polygon([[-1.4, 0], [1.4, 0], [1.4, -0.18], [-1.4, -0.18]], color="#dddddd"))
        ax.plot([-1.4, 1.4], [0, 0], color=C["dark"], lw=2.5)
        vec2(ax, (0, 0), ang(0), C["z"], r"$\mathbf{n}$")
        vec2(ax, (0, 0), ang(al), C["b"], r"$\mathbf{l}$")
        vec2(ax, (0, 0), ang(av), C["a"], r"$\mathbf{v}$")
        if which == "phong":
            vec2(ax, (0, 0), ang(ar), C["c"], r"$\mathbf{r}$")
            # decomposition of l: (n.l) n and the tangential part that gets flipped
            nl = np.cos(np.radians(al))
            ax.plot([ang(al)[0], 0], [ang(al)[1], nl], color=C["gray"], ls=":", lw=1.8)
            ax.plot([ang(ar)[0], 0], [ang(ar)[1], nl], color=C["gray"], ls=":", lw=1.8)
            ax.plot([0], [nl], "o", color=C["gray"], ms=5)
            ax.add_patch(Arc((0, 0), 1.25, 1.25, theta1=90 - ar, theta2=90 - av, color=C["x"], lw=2.4))
            mid = ang((ar + av) / 2) * 0.76
            ax.text(*mid, r"$\alpha$", color=C["x"], fontsize=20, ha="center", va="center")
            ax.set_title(r"Phong: $(\mathbf{r}\cdot\mathbf{v})^{s}=\cos^{s}\alpha$")
        else:
            vec2(ax, (0, 0), ang(ah), C["y"], r"$\mathbf{h}$", off=(-0.05, 0.02))
            ax.add_patch(Arc((0, 0), 1.35, 1.35, theta1=90, theta2=90 - ah, color=C["x"], lw=2.4))
            ax.text(*(ang(ah / 2) * 0.9), r"$\frac{\alpha}{2}$", color=C["x"], fontsize=20,
                    ha="center", va="center")
            ax.set_title(r"Blinn: $(\mathbf{n}\cdot\mathbf{h})^{s'}=\cos^{s'}\!\frac{\alpha}{2}$")
        ax.set_xlim(-1.35, 1.35); ax.set_ylim(-0.25, 1.45); ax.set_aspect("equal"); clean(ax)

    ax = fig.add_subplot(gs[1, :])
    a = np.linspace(0, np.radians(60), 400)
    d = np.degrees(a)
    ax.plot(d, np.cos(a) ** 16, color=C["c"], lw=3, label=r"$\cos^{16}\alpha$")
    ax.plot(d, np.cos(a / 2) ** 64, color=C["y"], lw=3, ls="--", label=r"$\cos^{64}(\alpha/2)$")
    ax.plot(d, np.cos(a / 2) ** 16, color=C["y"], lw=2, ls=":", label=r"$\cos^{16}(\alpha/2)$")
    ax.plot(d, np.exp(-16 * a**2 / 2), color=C["gray"], lw=1.4, label=r"$e^{-16\alpha^2/2}$")
    ax.set_xlabel(r"$\alpha$ (deg)"); ax.set_ylim(0, 1.05); ax.set_xlim(0, 60)
    ax.legend(fontsize=13, frameon=False)
    ax.set_title(r"$s' \approx 4s$")
    fig.tight_layout()
    out(fig, "phong-blinn-geometry")


# ---------------------------------------------------------------------------
# 3. The post's sphere renders: Phong s=16 vs Blinn-Phong s'=64 / 16, two lights
# ---------------------------------------------------------------------------
def fig_phong_blinn_spheres():
    n, inside = sphere_grid(256)
    v = np.array([0.0, 0.0, 1.0])
    lights = [(np.array([1.0, 1.0, 1.0]), r"$\mathbf{l}\propto(1,1,1)$"),
              (np.array([1.0, 0.0, 0.1]), r"$\mathbf{l}\propto(1,0,0.1)$")]
    rows = [("phong", 16.0, r"Phong, $s=16$"), ("blinn", 64.0, r"Blinn-Phong, $s'=64$"),
            ("blinn", 16.0, r"Blinn-Phong, $s'=16$")]
    fig, axs = plt.subplots(2, 3, figsize=(10, 7.4))
    for i, (lv, ltxt) in enumerate(lights):
        l = normalize(lv)
        for j, (model, s, rtxt) in enumerate(rows):
            img = shade(n, l, v, model, shininess=s)
            ax = axs[i, j]
            ax.imshow(to_display(img, inside), cmap="gray", vmin=0, vmax=1, extent=(-1, 1, -1, 1))
            clean(ax)
            mean = img[inside].mean()
            ax.text(0.0, -1.12, rf"$\bar{{L}}={mean:.3f}$", ha="center", va="top", fontsize=13, color=C["gray"])
            if i == 0:
                ax.set_title(rtxt, fontsize=15)
            if j == 0:
                ax.set_ylabel(ltxt, fontsize=15)
            ax.set_xlim(-1.05, 1.05); ax.set_ylim(-1.3, 1.05)
    fig.tight_layout()
    out(fig, "phong-blinn-spheres")


# ---------------------------------------------------------------------------
# 4. Flat / Gouraud / Phong shading of the same low-poly sphere (tiny rasterizer)
# ---------------------------------------------------------------------------
def uv_sphere(nlon=12, nlat=7):
    P = [[0, 1, 0]]
    for i in range(1, nlat):
        th = np.pi * i / nlat
        for j in range(nlon):
            ph = 2 * np.pi * j / nlon
            P.append([np.sin(th) * np.cos(ph), np.cos(th), np.sin(th) * np.sin(ph)])
    P.append([0, -1, 0])
    P = np.array(P, float)
    ring = lambda i, j: 1 + (i - 1) * nlon + (j % nlon)
    F = []
    for j in range(nlon):
        F.append([0, ring(1, j), ring(1, j + 1)])
        F.append([len(P) - 1, ring(nlat - 1, j + 1), ring(nlat - 1, j)])
    for i in range(1, nlat - 1):
        for j in range(nlon):
            a, b, c, d = ring(i, j), ring(i, j + 1), ring(i + 1, j + 1), ring(i + 1, j)
            F += [[a, d, c], [a, c, b]]
    F = np.array(F)
    # make every triangle wind counter-clockwise seen from outside
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    flip = np.sum(fn * P[F].mean(1), 1) < 0
    F[flip] = F[flip][:, ::-1]
    return P, F


def vertex_normals(P, F):
    e1 = P[F[:, 1]] - P[F[:, 0]]
    e2 = P[F[:, 2]] - P[F[:, 0]]
    fn = np.cross(e1, e2)
    N = np.zeros_like(P)
    for k in range(3):
        np.add.at(N, F[:, k], fn)
    return N / np.linalg.norm(N, axis=1, keepdims=True)


def rasterize_sphere(mode, W=300, s=64.0):
    P, F = uv_sphere()
    ca, sa = np.cos(np.radians(25)), np.sin(np.radians(25))
    Rx = np.array([[1, 0, 0], [0, ca, -sa], [0, sa, ca]])     # tilt so the top cap is visible
    P = P @ Rx.T
    N = vertex_normals(P, F)
    l = normalize(np.array([1.0, 1.0, 1.0]))
    v = np.array([0.0, 0.0, 1.0])
    Cv = shade(N, l, v, "blinn", shininess=s)                  # per-vertex colours (Gouraud)
    img = np.ones((W, W))
    zbuf = np.full((W, W), -np.inf)
    ext = 1.1
    xs = np.linspace(-ext, ext, W)
    X, Y = np.meshgrid(xs, -xs)
    for f in F:
        p = P[f]
        e1, e2 = p[1] - p[0], p[2] - p[0]
        fn = np.cross(e1, e2)
        if fn[2] <= 0:                                         # back-face culling
            continue
        x0, x1 = p[:, 0].min(), p[:, 0].max()
        y0, y1 = p[:, 1].min(), p[:, 1].max()
        cols = np.where((xs >= x0 - 1e-9) & (xs <= x1 + 1e-9))[0]
        rws = np.where((-xs >= y0 - 1e-9) & (-xs <= y1 + 1e-9))[0]
        if len(cols) == 0 or len(rws) == 0:
            continue
        sx, sy = X[np.ix_(rws, cols)], Y[np.ix_(rws, cols)]
        area = e1[0] * e2[1] - e1[1] * e2[0]
        # barycentric coordinates from 2D edge functions (post 02)
        w0 = ((p[1, 0] - sx) * (p[2, 1] - sy) - (p[1, 1] - sy) * (p[2, 0] - sx)) / area
        w1 = ((p[2, 0] - sx) * (p[0, 1] - sy) - (p[2, 1] - sy) * (p[0, 0] - sx)) / area
        w2 = 1 - w0 - w1
        m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        z = w0 * p[0, 2] + w1 * p[1, 2] + w2 * p[2, 2]
        sub = zbuf[np.ix_(rws, cols)]
        m &= z > sub
        if not m.any():
            continue
        if mode == "flat":
            col = shade(normalize(fn), l, v, "blinn", shininess=s) * np.ones_like(z)
        elif mode == "gouraud":
            col = w0 * Cv[f[0]] + w1 * Cv[f[1]] + w2 * Cv[f[2]]
        else:
            nn = normalize(w0[..., None] * N[f[0]] + w1[..., None] * N[f[1]] + w2[..., None] * N[f[2]])
            col = shade(nn, l, v, "blinn", shininess=s)
        blk = img[np.ix_(rws, cols)]
        blk[m] = np.clip(col[m], 0, 1) ** (1 / 2.2)
        sub[m] = z[m]
        img[np.ix_(rws, cols)] = blk
        zbuf[np.ix_(rws, cols)] = sub
    return img, P, F


def fig_shading_frequency():
    fig, axs = plt.subplots(1, 3, figsize=(10, 3.9))
    for ax, mode, title in zip(axs, ("flat", "gouraud", "phong"), ("Flat", "Gouraud", "Phong")):
        img, P, F = rasterize_sphere(mode)
        ax.imshow(img, cmap="gray", vmin=0, vmax=1, extent=(-1.1, 1.1, -1.1, 1.1))
        for f in F:
            p = P[f]
            if np.cross(p[1] - p[0], p[2] - p[0])[2] > 0:
                q = np.vstack([p, p[:1]])
                ax.plot(q[:, 0], q[:, 1], color=C["z"], lw=0.5, alpha=0.35)
        clean(ax); ax.set_title(title)
    fig.tight_layout()
    out(fig, "shading-frequency")


# ---------------------------------------------------------------------------
# 5. UV unwrapping of a cube into a cross-shaped atlas, with seams
# ---------------------------------------------------------------------------
# face: (name, origin, A (s axis), B (t axis), atlas cell (col, row))
FACES = [
    ("+z", (-1, -1, 1), (2, 0, 0), (0, 2, 0), (1, 1)),
    ("+x", (1, -1, 1), (0, 0, -2), (0, 2, 0), (2, 1)),
    ("-z", (1, -1, -1), (-2, 0, 0), (0, 2, 0), (3, 1)),
    ("-x", (-1, -1, -1), (0, 0, 2), (0, 2, 0), (0, 1)),
    ("+y", (-1, 1, 1), (2, 0, 0), (0, 0, -2), (1, 2)),
    ("-y", (-1, -1, -1), (2, 0, 0), (0, 0, 2), (1, 0)),
]
FACE_COL = {"+z": C["z"], "+x": C["x"], "-z": C["c"], "-x": C["b"], "+y": C["y"], "-y": C["a"]}


def face_texture(name, s, t):
    """Face colour, lightened on a 4x4 checker so orientation and stretch are visible."""
    import matplotlib.colors as mc
    base = np.array(mc.to_rgb(FACE_COL[name]))
    chk = ((np.floor(s * 4) + np.floor(t * 4)) % 2)[..., None]
    col = base * (0.55 + 0.45 * chk) + (1 - base) * 0.45 * chk
    # a dark wedge in the (s,t) = (0,0) corner marks the texture orientation
    corner = ((s + t) < 0.22)[..., None]
    return np.where(corner, 0.15, col)


def fig_uv_unwrap():
    fig = plt.figure(figsize=(10, 4.6))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    to_plot = lambda p: np.stack([p[..., 0], -p[..., 2], p[..., 1]], -1)   # world y up -> plot z
    g = np.linspace(0, 1, 17)
    S, T = np.meshgrid(g, g)
    for name, O, A, B, _ in FACES:
        O, A, B = map(np.array, (O, A, B))
        if name not in ("+z", "+x", "+y"):
            continue
        P = O + S[..., None] * A + T[..., None] * B
        Q = to_plot(P)
        sc, tc = 0.5 * (S[1:, 1:] + S[:-1, :-1]), 0.5 * (T[1:, 1:] + T[:-1, :-1])
        ax.plot_surface(Q[..., 0], Q[..., 1], Q[..., 2], facecolors=face_texture(name, sc, tc),
                        shade=False, rstride=1, cstride=1, linewidth=0, antialiased=False)
        c = to_plot(O + 0.5 * A + 0.5 * B + 0.12 * np.cross(A, B) / 4)
        ax.text(*c, name, fontsize=20, ha="center", va="center", color="white",
                fontweight="bold", zorder=10)
    # seams: edge +y|+x (x=1, y=1) and edge +y|-z (y=1, z=-1)
    e1 = to_plot(np.array([[1, 1, 1], [1, 1, -1]], float))
    e2 = to_plot(np.array([[-1, 1, -1], [1, 1, -1]], float))
    ax.plot(*e1.T, color=C["x"], lw=5, zorder=11)
    ax.plot(*e2.T, color=C["dark"], lw=5, ls=(0, (2, 1)), zorder=11)
    for i, (col, lab) in enumerate(zip((C["x"], C["y"], C["z"]), ("x", "y", "z"))):
        d = np.zeros(3); d[i] = 1.0
        o = np.array([1.3, -1.3, -1.3])
        a, b = to_plot(o), to_plot(o + 0.9 * d)
        ax.quiver(*a, *(b - a), color=col, lw=2, arrow_length_ratio=0.2)
        ax.text(*(a + 1.2 * (b - a)), f"${lab}$", color=col, fontsize=17)
    ax.set_box_aspect((1, 1, 1)); ax.view_init(elev=24, azim=-58)
    for setl in (ax.set_xlim, ax.set_ylim, ax.set_zlim):
        setl(-1.3, 1.3)
    ax.set_axis_off()

    ax = fig.add_subplot(1, 2, 2)
    cell = 0.25
    for name, O, A, B, (ci, ri) in FACES:
        n = 64
        gg = (np.arange(n) + 0.5) / n
        s, t = np.meshgrid(gg, gg)
        tex = face_texture(name, s, t)
        x0, y0 = ci * cell, ri * cell
        ax.imshow(tex, origin="lower", extent=(x0, x0 + cell, y0, y0 + cell), interpolation="nearest")
        ax.add_patch(Rectangle((x0, y0), cell, cell, fill=False, color="white", lw=1.5))
        ax.text(x0 + cell / 2, y0 + cell / 2, name, fontsize=20, ha="center", va="center",
                color="white", fontweight="bold")
    # the +y|+x seam appears twice: right edge of +y, top edge of +x
    ax.plot([0.5, 0.5], [0.5, 0.75], color=C["x"], lw=5)
    ax.plot([0.5, 0.75], [0.5, 0.5], color=C["x"], lw=5)
    # the +y|-z seam: top edge of +y and top edge of -z
    ax.plot([0.25, 0.5], [0.75, 0.75], color=C["dark"], lw=5, ls=(0, (2, 1)))
    ax.plot([0.75, 1.0], [0.5, 0.5], color=C["dark"], lw=5, ls=(0, (2, 1)))
    ax.add_patch(Rectangle((0, 0), 1, 1, fill=False, color=C["gray"], lw=1.2, ls="--"))
    ax.set_xlim(-0.03, 1.03); ax.set_ylim(-0.03, 1.03); ax.set_aspect("equal")
    ax.set_xticks([0, 0.25, 0.5, 0.75, 1]); ax.set_yticks([0, 0.25, 0.5, 0.75, 1])
    ax.set_xlabel("$u$"); ax.set_ylabel("$v$"); ax.grid(False)
    fig.tight_layout()
    out(fig, "uv-unwrap")


# ---------------------------------------------------------------------------
# Section 5 code (unchanged): mip pyramid, bilinear, LOD, trilinear
# ---------------------------------------------------------------------------
def build_mips(tex):
    levels = [tex]
    while levels[-1].shape[0] > 1:
        t = levels[-1]
        levels.append(0.25 * (t[0::2, 0::2] + t[1::2, 0::2] + t[0::2, 1::2] + t[1::2, 1::2]))
    return levels


def bilinear(tex, u, v):
    h, w = tex.shape[:2]
    x = u * w - 0.5
    y = v * h - 0.5
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    x0, y0 = x0 % w, y0 % h
    x1, y1 = (x0 + 1) % w, (y0 + 1) % h
    top = tex[y0, x0] * (1 - fx) + tex[y0, x1] * fx
    bot = tex[y1, x0] * (1 - fx) + tex[y1, x1] * fx
    return top * (1 - fy) + bot * fy


def mip_lod(size, dudx, dvdx, dudy, dvdy):
    rho = np.maximum(np.hypot(dudx, dvdx), np.hypot(dudy, dvdy)) * size
    return np.log2(np.maximum(rho, 1e-8))


def trilinear(mips, u, v, lod):
    lod = np.clip(lod, 0, len(mips) - 1)
    l0 = np.floor(lod).astype(int)
    l1 = np.minimum(l0 + 1, len(mips) - 1)
    t = (lod - l0)[..., None]
    out_ = np.zeros(u.shape + mips[0].shape[2:])
    for L in range(len(mips)):
        s = bilinear(mips[L], u, v)
        out_ += np.where((l0 == L)[..., None], (1 - t) * s, 0.0)
        out_ += np.where((l1 == L)[..., None], t * s, 0.0)
    return out_


S_TEX = 256
_i, _j = np.mgrid[0:S_TEX, 0:S_TEX]
CHECKER = (((_i // 8) + (_j // 8)) % 2).astype(float)[..., None]
MIPS = build_mips(CHECKER)


def fig_mip_pyramid():
    # the 64-pixel row of the post: covers the texture 7.3 times (~29 texels per pixel)
    u = (np.arange(64) + 0.5) / 64 * 7.3
    v = np.full_like(u, 0.3)
    du = np.full_like(u, 7.3 / 64)
    zero = np.zeros_like(u)
    lod = mip_lod(S_TEX, du, zero, zero, zero)
    point = bilinear(CHECKER, u, v)[:, 0]
    filt = trilinear(MIPS, u, v, lod)[:, 0]
    print(f"  mip row: lod {lod[0]:.2f}, no mip std {point.std():.3f}, trilinear mean {filt.mean():.3f}")
    for lang in LANGS:
        fig = plt.figure(figsize=(10, 6.8))
        ax = fig.add_axes([0.02, 0.42, 0.96, 0.55])
        x = 0.0
        for k in range(5):
            m = MIPS[k][..., 0]
            size = 256 / 2**k
            ax.imshow(m, cmap="gray", vmin=0, vmax=1, interpolation="nearest",
                      extent=(x, x + size, 0, size))
            ax.add_patch(Rectangle((x, 0), size, size, fill=False, color=C["a"], lw=1.5))
            ax.text(x + size / 2, -14, f"$k={k}$", ha="center", va="top", fontsize=16)
            ax.text(x + size / 2, -44, f"${m.shape[0]}^2$", ha="center", va="top", fontsize=14,
                    color=C["gray"])
            x += size + 34
        ax.text(x + 4, 4, r"$\cdots\ 1^2$", fontsize=16, va="bottom")
        ax.text(x - 10, 200, r"$\frac{1}{4}+\frac{1}{16}+\dots=\frac{1}{3}$", fontsize=20, ha="right",
                va="center", color=C["a"])
        ax.set_xlim(-4, x + 60); ax.set_ylim(-75, 262); ax.set_aspect("equal"); clean(ax)

        ax = fig.add_axes([0.08, 0.08, 0.88, 0.27])
        px = np.arange(64)
        ax.step(px, point, where="mid", color=C["x"], lw=1.6,
                label=label(lang, en=f"no mipmap (std {point.std():.2f})",
                            zh=f"无 Mipmap（标准差 {point.std():.2f}）",
                            ja=f"ミップマップなし（標準偏差 {point.std():.2f}）"))
        ax.plot(px, filt, color=C["y"], lw=3.5,
                label=label(lang, en=f"trilinear, \u03bb={lod[0]:.2f} (mean {filt.mean():.2f})",
                            zh=f"三线性，\u03bb={lod[0]:.2f}（均值 {filt.mean():.2f}）",
                            ja=f"トライリニア、\u03bb={lod[0]:.2f}（平均 {filt.mean():.2f}）"))
        ax.set_xlim(0, 63); ax.set_ylim(-0.08, 1.45); ax.set_yticks([0, 0.5, 1])
        ax.set_xlabel(label(lang, en="screen pixel", zh="屏幕像素", ja="スクリーンピクセル"))
        ax.legend(loc="upper center", ncol=2, fontsize=13, frameon=False)
        out(fig, f"mip-pyramid_{lang}")


# ---------------------------------------------------------------------------
# 6. A checkerboard floor in perspective: nearest vs trilinear vs anisotropic vs reference
# ---------------------------------------------------------------------------
def floor_uv(W, H, ss=1):
    """UVs of an infinite floor y = -1 seen by a pinhole camera looking down -z (y up)."""
    tan_half = 0.5
    aspect = W / H
    xs = ((np.arange(W * ss) + 0.5) / (W * ss) * 2 - 1) * aspect * tan_half
    ys = 0.12 - (np.arange(H * ss) + 0.5) / (H * ss) * 1.12   # horizon (dir y = 0) near the top
    dx, dy = np.meshgrid(xs, ys)
    ground = dy < -1e-4
    t = np.where(ground, 1.0 / np.maximum(-dy, 1e-4), np.nan)     # camera height 1
    X, Z = t * dx, -t
    k = 0.244                                                     # UV units per world unit
    return k * X, k * (-Z), ground


def fig_minification():
    W, H = 360, 200
    u, v, ground = floor_uv(W, H)
    uu, vv = np.where(ground, u, 0.0), np.where(ground, v, 0.0)
    dudx = np.gradient(uu, axis=1); dvdx = np.gradient(vv, axis=1)
    dudy = np.gradient(uu, axis=0); dvdy = np.gradient(vv, axis=0)
    lod = mip_lod(S_TEX, dudx, dvdx, dudy, dvdy)

    near = CHECKER[np.floor(vv * S_TEX).astype(int) % S_TEX, np.floor(uu * S_TEX).astype(int) % S_TEX, 0]
    tri = trilinear(MIPS, uu, vv, lod)[..., 0]

    # anisotropic: N probes along the major axis of the footprint, at level log2(rho_max / N)
    rx = np.hypot(dudx, dvdx) * S_TEX
    ry = np.hypot(dudy, dvdy) * S_TEX
    rmax, rmin = np.maximum(rx, ry), np.maximum(np.minimum(rx, ry), 1e-8)
    Nmax = 16
    N = np.clip(np.ceil(rmax / rmin), 1, Nmax).astype(int)
    rmax = np.maximum(rmax, 1e-8)
    lam = np.log2(np.maximum(rmax / N, 1e-8))
    ax_u = np.where(rx >= ry, dudx, dudy)
    ax_v = np.where(rx >= ry, dvdx, dvdy)
    aniso = np.zeros_like(uu)
    for k in range(Nmax):
        off = (k + 0.5) / N - 0.5
        smp = trilinear(MIPS, uu + off * ax_u, vv + off * ax_v, lam)[..., 0]
        aniso += np.where(k < N, smp, 0.0)
    aniso /= N

    ss = 8                                                        # 64 samples per pixel
    us, vs, gs = floor_uv(W, H, ss)
    ref = CHECKER[np.floor(np.nan_to_num(vs) * S_TEX).astype(int) % S_TEX,
                  np.floor(np.nan_to_num(us) * S_TEX).astype(int) % S_TEX, 0]
    ref = np.where(gs, ref, 1.0).reshape(H, ss, W, ss).mean((1, 3))

    bg = lambda a: np.where(ground, a, 1.0)
    panels = [(bg(near), "nearest"), (bg(tri), "trilinear"), (bg(aniso), "aniso"), (ref, "ref")]
    names = {
        "nearest": dict(en="nearest (no mipmap)", zh="最近邻（无 Mipmap）", ja="ニアレスト（ミップマップなし）"),
        "trilinear": dict(en="trilinear mipmap", zh="三线性 Mipmap", ja="トライリニア・ミップマップ"),
        "aniso": dict(en="anisotropic 16x", zh="各向异性 16x", ja="異方性 16x"),
        "ref": dict(en="reference (64 samples/pixel)", zh="参考（每像素 64 个样本）",
                    ja="参照（1 ピクセル 64 サンプル）"),
    }
    for lang in LANGS:
        fig, axs = plt.subplots(3, 2, figsize=(10, 9.0))
        for ax, (img, key) in zip(axs.flat[:4], panels):
            ax.imshow(img, cmap="gray", vmin=0, vmax=1, interpolation="nearest")
            clean(ax); ax.set_title(names[key][lang], fontsize=15)
        ax = axs[2, 0]
        im = ax.imshow(np.where(ground, np.clip(lod, 0, 8), np.nan), cmap="viridis", vmin=0, vmax=8)
        clean(ax); ax.set_title(r"$\lambda=\log_2\rho$", fontsize=16)
        ax.set_xlabel(label(lang, en="mip level", zh="Mip 层级", ja="ミップレベル"), fontsize=14)
        fig.colorbar(im, ax=ax, fraction=0.03, pad=0.02)
        ax = axs[2, 1]
        im = ax.imshow(np.where(ground, N, np.nan), cmap="magma", vmin=1, vmax=16)
        clean(ax); ax.set_title(r"$N=\min(\lceil\rho_{\max}/\rho_{\min}\rceil, 16)$", fontsize=16)
        ax.set_xlabel(label(lang, en="anisotropic probes", zh="各向异性探测数", ja="異方性プローブ数"), fontsize=14)
        fig.colorbar(im, ax=ax, fraction=0.03, pad=0.02)
        fig.tight_layout()
        out(fig, f"minification_{lang}")


# ---------------------------------------------------------------------------
# 7. Tangent frames (T, B, N) on a curved patch with a UV checker
# ---------------------------------------------------------------------------
def patch(u, v):
    return np.stack([u, v, 0.35 * np.sin(np.pi * u / 2) * np.cos(np.pi * v / 2.5)], -1)


def fig_tbn():
    fig = plt.figure(figsize=(9, 7.4))
    ax = fig.add_subplot(1, 1, 1, projection="3d")
    ax.computed_zorder = False          # draw the frames on top of the surface
    g = np.linspace(-1, 1, 33)
    U, V = np.meshgrid(g, g)
    P = patch(U, V)
    uc, vc = 0.5 * (U[1:, 1:] + U[:-1, :-1]), 0.5 * (V[1:, 1:] + V[:-1, :-1])
    chk = ((np.floor((uc + 1) * 4) + np.floor((vc + 1) * 4)) % 2)
    fc = np.where(chk[..., None] > 0, np.array([0.93, 0.90, 0.97]), np.array([0.78, 0.72, 0.88]))
    ax.plot_surface(P[..., 0], P[..., 1], P[..., 2], facecolors=fc, shade=False, rstride=1,
                    cstride=1, linewidth=0, antialiased=False, zorder=1)
    h = 1e-4
    for uu in (-0.6, 0.0, 0.6):
        for vv in (-0.6, 0.0, 0.6):
            p = patch(np.array(uu), np.array(vv))
            pu = (patch(np.array(uu + h), np.array(vv)) - patch(np.array(uu - h), np.array(vv))) / (2 * h)
            pv = (patch(np.array(uu), np.array(vv + h)) - patch(np.array(uu), np.array(vv - h))) / (2 * h)
            Nn = np.cross(pu, pv); Nn /= np.linalg.norm(Nn)
            T = pu - Nn * (Nn @ pu); T /= np.linalg.norm(T)          # Gram-Schmidt
            B = np.cross(Nn, T)                                      # w = +1
            L = 0.32
            lab = (uu, vv) == (0.6, 0.6)
            arrow3d(ax, p, L * T, C["x"], lw=2.6, label_text=r"$\mathbf{T}$" if lab else None, zorder=5)
            arrow3d(ax, p, L * B, C["y"], lw=2.6, label_text=r"$\mathbf{B}$" if lab else None, zorder=5)
            arrow3d(ax, p, L * Nn, C["z"], lw=2.6, label_text=r"$\mathbf{N}$" if lab else None, zorder=5)
            ax.scatter(*p, color=C["dark"], s=14, zorder=6)
    # u and v directions on the parameter domain
    ax.text(1.12, -1.08, -0.05, r"$u\rightarrow$", fontsize=17)
    ax.text(-1.25, 1.0, -0.05, r"$v\rightarrow$", fontsize=17)
    ax.set_xlim(-1.1, 1.1); ax.set_ylim(-1.1, 1.1); ax.set_zlim(-0.6, 0.8)
    ax.set_box_aspect((2.2, 2.2, 1.4)); ax.view_init(elev=32, azim=-62)
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
    ax.set_xlabel("$x$", color=C["x"]); ax.set_ylabel("$y$", color=C["y"]); ax.set_zlabel("$z$", color=C["z"])
    out(fig, "tbn")


# ---------------------------------------------------------------------------
# 8. Normal mapping: profile of perturbed normals, the encoded map, a shaded flat quad
# ---------------------------------------------------------------------------
def fig_normal_map():
    fig = plt.figure(figsize=(10, 8.2))
    # (a) cross-section at sin(20 v) = 1: h(u) = 0.05 sin(20 u), n' ~ N - h_u T
    ax = fig.add_axes([0.03, 0.55, 0.94, 0.43])
    uline = np.linspace(0, 0.63, 400)
    ax.fill_between(uline, -0.06, 0, color="#dddddd")
    ax.plot(uline, 0 * uline, color=C["dark"], lw=2.5)
    ax.plot(uline, 0.05 * np.sin(20 * uline), color=C["gray"], lw=2, ls="--")
    for u0 in np.linspace(0.02, 0.61, 13):
        hu = 0.05 * 20 * np.cos(20 * u0)
        n2 = np.array([-hu, 1.0]); n2 /= np.linalg.norm(n2)
        ax.annotate("", xy=(u0, 0.075), xytext=(u0, 0),
                    arrowprops=dict(arrowstyle="-|>", color=C["z"], lw=1.4, alpha=0.45, mutation_scale=14))
        ax.annotate("", xy=(u0 + 0.075 * n2[0], 0.075 * n2[1]), xytext=(u0, 0),
                    arrowprops=dict(arrowstyle="-|>", color=C["a"], lw=2.4, mutation_scale=16))
    ax.text(0.005, 0.098, r"$\mathbf{N}$", color=C["z"], fontsize=17)
    ax.text(0.40, 0.112, r"$\mathbf{n}'\propto\mathbf{N}-h_u\mathbf{T}$", color=C["a"], fontsize=17)
    ax.text(0.20, -0.08, r"$h=0.05\sin 20u$", color=C["gray"], fontsize=15, va="center")
    ax.annotate("", xy=(0.62, -0.075), xytext=(0.5, -0.075),
                arrowprops=dict(arrowstyle="-|>", color=C["x"], lw=2))
    ax.text(0.625, -0.075, r"$\mathbf{T}$", color=C["x"], fontsize=16, va="center")
    ax.set_xlim(-0.01, 0.66); ax.set_ylim(-0.09, 0.13); ax.set_aspect("equal"); clean(ax)

    # (b) the tangent-space normal map of h(u, v) = 0.05 sin(20u) sin(20v), c = (n + 1) / 2
    n_px = 256
    g = (np.arange(n_px) + 0.5) / n_px
    U, V = np.meshgrid(g, g)
    hu = 0.05 * 20 * np.cos(20 * U) * np.sin(20 * V)
    hv = 0.05 * 20 * np.sin(20 * U) * np.cos(20 * V)
    nt = normalize(np.stack([-hu, -hv, np.ones_like(U)], -1))
    ax = fig.add_axes([0.07, 0.06, 0.40, 0.42])
    ax.imshow((nt + 1) / 2, origin="lower", extent=(0, 1, 0, 1))
    ax.set_xlabel("$u$"); ax.set_ylabel("$v$", labelpad=-6); ax.grid(False)
    ax.set_xticks([0, 1]); ax.set_yticks([0, 1])
    ax.set_title(r"$\mathbf{c}=(\mathbf{n}'+1)/2$")

    # (c) a flat quad (TBN = identity) lit with Lambert using the decoded normals
    l = normalize(np.array([-1.0, 0.45, 1.0]))
    img = 0.05 + 0.85 * np.clip(np.sum(nt * l, -1), 0, None)
    ax = fig.add_axes([0.55, 0.06, 0.40, 0.42])
    ax.imshow(np.clip(img, 0, 1) ** (1 / 2.2), origin="lower", extent=(0, 1, 0, 1), cmap="gray",
              vmin=0, vmax=1)
    ax.annotate("", xy=(0.08, 0.86), xytext=(0.3, 0.76),
                arrowprops=dict(arrowstyle="-|>", color=C["light"], lw=3))
    ax.text(0.32, 0.70, r"$\mathbf{l}$", color=C["light"], fontsize=18)
    ax.set_xlabel("$u$"); ax.set_xticks([0, 1]); ax.set_yticks([]); ax.grid(False)
    ax.set_title(r"$\max(0,\mathbf{n}'\cdot\mathbf{l})$")
    out(fig, "normal-map")


# ---------------------------------------------------------------------------
# Section 7 shadow-map toy (verbatim from the post)
# ---------------------------------------------------------------------------
R_SM, SLOPE, Y0 = 64, 0.4, 2.0
C_SPH, RAD = np.array([0.0, 0.45, 0.0]), 0.3


def surface_height(x, z):
    y = SLOPE * x
    d2 = (x - C_SPH[0])**2 + (z - C_SPH[2])**2
    cap = C_SPH[1] + np.sqrt(np.clip(RAD**2 - d2, 0, None))
    return np.where(d2 < RAD**2, np.maximum(y, cap), y)


TEXEL = 2.0 / R_SM
_centers = -1 + (np.arange(R_SM) + 0.5) * TEXEL
_X, _Z = np.meshgrid(_centers, _centers, indexing="xy")
SHADOW_MAP = (Y0 - surface_height(_X, _Z)).astype(np.float32)


def visibility(px, pz, depth, bias, pcf=0):
    ix = np.floor((px + 1) / TEXEL).astype(int)
    iz = np.floor((pz + 1) / TEXEL).astype(int)
    lit = np.zeros_like(depth)
    for dz in range(-pcf, pcf + 1):
        for dx in range(-pcf, pcf + 1):
            m = SHADOW_MAP[np.clip(iz + dz, 0, R_SM - 1), np.clip(ix + dx, 0, R_SM - 1)]
            lit += depth <= m + bias
    return lit / (2 * pcf + 1)**2


def fig_acne_geometry():
    """Side view (x, height) of 4 shadow-map texels over the tilted ground y = 0.4 x."""
    tan_t = SLOPE
    x0 = -2 * TEXEL
    xs = np.linspace(x0, x0 + 4 * TEXEL, 800)
    for lang in LANGS:
        fig, axs = plt.subplots(1, 2, figsize=(10, 3.8))
        for ax, bias, ttl in zip(axs, (0.0, TEXEL * tan_t),
                                 (r"$b=0$", r"$b=w\tan\theta$")):
            for i in range(4):
                xa = x0 + i * TEXEL
                xc = xa + TEXEL / 2
                hc = SLOPE * xc                          # stored: height at the texel centre
                ax.plot([xa, xa + TEXEL], [hc - bias, hc - bias], color=C["dark"], lw=3)
                ax.plot([xc], [hc], "o", color=C["dark"], ms=7)
                ax.axvline(xa, color=C["gray"], lw=0.8, ls=":")
                ax.annotate("", xy=(xc, hc + 0.004), xytext=(xc, hc + 0.03),
                            arrowprops=dict(arrowstyle="-|>", color=C["light"], lw=2))
            # ground points: lit iff their depth <= stored depth + b, i.e. height >= stored - b
            ix = np.floor((xs + 1) / TEXEL).astype(int)
            hc = SLOPE * (-1 + (ix + 0.5) * TEXEL)
            ok = SLOPE * xs >= hc - bias - 1e-12
            ax.scatter(xs[::16], SLOPE * xs[::16], c=np.where(ok[::16], C["y"], C["x"]), s=26, zorder=5)
            ax.set_title(ttl)
            ax.set_xlim(x0 - 0.004, x0 + 4 * TEXEL + 0.004)
            ax.set_ylim(SLOPE * x0 - 0.02, SLOPE * (x0 + 4 * TEXEL) + 0.035)
            ax.set_aspect("equal"); ax.set_xticks([]); ax.set_yticks([])
            frac = 1 - ok.mean()
            ax.text(0.03, 0.95, label(lang, en=f"false shadow: {frac:.0%}", zh=f"虚假阴影：{frac:.0%}",
                                      ja=f"偽の影：{frac:.0%}"),
                    transform=ax.transAxes, va="top", fontsize=15, color=C["x"] if frac else C["y"])
        # annotate texel width w on the first panel
        ax = axs[0]
        ax.annotate("", xy=(x0, SLOPE * x0 - 0.012), xytext=(x0 + TEXEL, SLOPE * x0 - 0.012),
                    arrowprops=dict(arrowstyle="<->", color=C["dark"], lw=1.6))
        ax.text(x0 + TEXEL / 2, SLOPE * x0 - 0.017, "$w$", ha="center", va="top", fontsize=17)
        ax.text(x0 + 3.0 * TEXEL, SLOPE * (x0 + 3.0 * TEXEL) - 0.016,
                r"$y=0.4\,x$", fontsize=15, color=C["gray"], rotation=21.8)
        fig.tight_layout()
        out(fig, f"shadow-acne-geometry_{lang}")


def fig_shadow_results():
    g = -1 + (np.arange(512) + 0.5) * (2.0 / 512)
    PX, PZ = np.meshgrid(g, g, indexing="xy")
    depth = Y0 - SLOPE * PX
    r = np.hypot(PX - C_SPH[0], PZ - C_SPH[2])
    far_lit, in_shadow = r > RAD + 3 * TEXEL, r < RAD
    tan_t = SLOPE
    cfgs = [("nobias", 0.0, 0), ("slope", TEXEL * tan_t, 0), ("const", 0.5, 0),
            ("pcf1", TEXEL * tan_t, 1), ("pcf2", 2 * TEXEL * tan_t, 1)]
    vis = {}
    for key, bias, pcf in cfgs:
        vis[key] = visibility(PX, PZ, depth, bias, pcf)
        a = np.mean(vis[key][far_lit] < 1); lost = np.mean(vis[key][in_shadow] == 1)
        print(f"  {key:7s} bias={bias:.4f} pcf={pcf}  acne {a:6.1%}  lost {lost:6.1%}")
    names = {
        "nobias": dict(en="no bias", zh="无偏移", ja="バイアスなし"),
        "slope": dict(en="slope-scaled", zh="按斜率缩放", ja="傾斜スケール"),
        "const": dict(en="constant 0.5", zh="常数 0.5", ja="定数 0.5"),
        "pcf1": dict(en="PCF 3\u00d73", zh="PCF 3\u00d73", ja="PCF 3\u00d73"),
        "pcf2": dict(en="PCF 3\u00d73", zh="PCF 3\u00d73", ja="PCF 3\u00d73"),
    }
    sub = {"nobias": "$b=0$", "slope": r"$b=w\tan\theta$", "const": "$b=0.5$",
           "pcf1": r"$b=w\tan\theta$", "pcf2": r"$b=2w\tan\theta$"}
    lo, hi = 128, 384                       # show x, z in [-0.5, 0.5]
    ext = (g[lo] - 1 / 512, g[hi - 1] + 1 / 512, g[lo] - 1 / 512, g[hi - 1] + 1 / 512)
    for lang in LANGS:
        fig, axs = plt.subplots(2, 3, figsize=(10, 7.6))
        ax = axs[0, 0]
        im = ax.imshow(SHADOW_MAP, origin="lower", extent=(-1, 1, -1, 1), cmap="viridis",
                       interpolation="nearest")
        fig.colorbar(im, ax=ax, fraction=0.045, pad=0.03)
        ax.set_title(label(lang, en="shadow map D(s,t)", zh="阴影贴图 D(s,t)",
                           ja="シャドウマップ D(s,t)"), fontsize=15)
        ax.set_xticks([-1, 0, 1]); ax.set_yticks([-1, 0, 1]); ax.grid(False)
        ax.add_patch(Rectangle((-0.5, -0.5), 1, 1, fill=False, color="white", lw=1.5, ls="--"))
        for ax, (key, bias, pcf) in zip(axs.flat[1:], cfgs):
            img = 0.15 + 0.85 * vis[key][lo:hi, lo:hi]
            ax.imshow(img, origin="lower", extent=ext, cmap="gray", vmin=0, vmax=1,
                      interpolation="nearest")
            ax.add_patch(plt.Circle((0, 0), RAD, fill=False, color=C["x"], lw=1.6, ls="--"))
            ax.add_patch(Rectangle((ext[0], ext[2]), ext[1] - ext[0], ext[3] - ext[2], fill=False,
                                   color=C["gray"], lw=1.5))
            ax.set_title(names[key][lang], fontsize=15)
            a = np.mean(vis[key][far_lit] < 1)
            clean(ax)
            ax.set_xlabel(sub[key] + ",  " + f"${a * 100:.1f}\\%$", fontsize=15)
        fig.tight_layout()
        out(fig, f"shadow-map_{lang}")


if __name__ == "__main__":
    fig_lambert()
    fig_phong_blinn_geometry()
    fig_phong_blinn_spheres()
    fig_shading_frequency()
    fig_uv_unwrap()
    fig_mip_pyramid()
    fig_minification()
    fig_tbn()
    fig_normal_map()
    fig_acne_geometry()
    fig_shadow_results()
