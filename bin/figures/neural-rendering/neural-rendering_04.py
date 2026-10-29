"""Figures for neural-rendering post 04: 3D Gaussian Splatting, end to end.

Run from the repository root:  python3 bin/figures/neural-rendering/neural-rendering_04.py
Writes assets/img/blog/neural-rendering/04-*.svg. Everything is computed with the post's own
formulas (quat_to_rotmat, sh_basis, project_gaussian, screen_extent, gaussian_alpha, alpha
blending) ported to NumPy; the adaptive density control figures come from a real 2D toy fit.
Camera convention: OpenCV (x right, y down, z forward), as in the post.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F403

import numpy as np  # noqa: E402
from matplotlib.patches import Ellipse, Rectangle  # noqa: E402
from scipy.spatial import cKDTree  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/neural-rendering"
PREVIEW = None  # set to a directory to also write PNG previews


def out(fig, name):
    if PREVIEW:
        pathlib.Path(PREVIEW).mkdir(parents=True, exist_ok=True)
        fig.savefig(pathlib.Path(PREVIEW) / name.replace(".svg", ".png"), dpi=70)
    save(fig, OUT / name)


# ----------------------------------------------------------------------------------------------
# The post's code, ported verbatim to NumPy
# ----------------------------------------------------------------------------------------------
def quat_to_rotmat(q):
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])


def covariance_3d(q, log_scale):
    R = quat_to_rotmat(q)
    M = R @ np.diag(np.exp(log_scale))
    return M @ M.T


C0 = 0.28209479177387814
C1 = 0.4886025119029199
C2 = [1.0925484305920792, -1.0925484305920792, 0.31539156525252005,
      -1.0925484305920792, 0.5462742152960396]
C3 = [-0.5900435899266435, 2.890611442640554, -0.4570457994644658, 0.3731763325901154,
      -0.4570457994644658, 1.445305721320277, -0.5900435899266435]


def sh_basis(d, degree=3):
    x, y, z = d[:, 0], d[:, 1], d[:, 2]
    o = [np.full_like(x, C0)]
    if degree > 0:
        o += [-C1 * y, C1 * z, -C1 * x]
    if degree > 1:
        xx, yy, zz, xy, yz, xz = x * x, y * y, z * z, x * y, y * z, x * z
        o += [C2[0] * xy, C2[1] * yz, C2[2] * (2 * zz - xx - yy), C2[3] * xz, C2[4] * (xx - yy)]
    if degree > 2:
        o += [C3[0] * y * (3 * xx - yy), C3[1] * xy * z, C3[2] * y * (4 * zz - xx - yy),
              C3[3] * z * (2 * zz - 3 * xx - 3 * yy), C3[4] * x * (4 * zz - xx - yy),
              C3[5] * z * (xx - yy), C3[6] * x * (xx - 3 * yy)]
    return np.stack(o, axis=-1)


def sh_to_rgb(sh, d, degree=3):
    B = sh_basis(d, degree)
    rgb = np.einsum("nk,nkc->nc", B, sh[:, :B.shape[1]]) + 0.5
    return np.maximum(rgb, 0.0)


def project_gaussian(mu, Sigma, Rcw, tcw, fx, fy, cx, cy, W, H, dilation=0.3):
    t = Rcw @ mu + tcw
    lim_x, lim_y = 1.3 * (W / 2) / fx, 1.3 * (H / 2) / fy
    tx = np.clip(t[0] / t[2], -lim_x, lim_x) * t[2]
    ty = np.clip(t[1] / t[2], -lim_y, lim_y) * t[2]
    tz = t[2]
    J = np.array([[fx / tz, 0.0, -fx * tx / tz**2],
                  [0.0, fy / tz, -fy * ty / tz**2]])
    T = J @ Rcw
    cov2d = T @ Sigma @ T.T + dilation * np.eye(2)
    mean2d = np.array([fx * t[0] / tz + cx, fy * t[1] / tz + cy])
    return mean2d, cov2d, tz


def screen_extent(cov2d):
    a, b, c = cov2d[0, 0], cov2d[0, 1], cov2d[1, 1]
    det = a * c - b * b
    conic = np.array([c, -b, a]) / det
    mid = 0.5 * (a + c)
    lam_max = mid + np.sqrt(max(0.1, mid * mid - det))
    return conic, int(np.ceil(3.0 * np.sqrt(lam_max)))


def gaussian_alpha(pix, mean2d, conic, opacity):
    d = pix - mean2d
    power = -0.5 * (conic[0] * d[..., 0]**2 + conic[2] * d[..., 1]**2) - conic[1] * d[..., 0] * d[..., 1]
    alpha = np.minimum(0.99, opacity * np.exp(np.minimum(power, 0.0)))
    return np.where(alpha < 1.0 / 255.0, 0.0, alpha)


def look_at(C, target=np.zeros(3), up=np.array([0.0, -1.0, 0.0])):
    """World-to-camera (Rcw, tcw) for an OpenCV camera at C looking at target (as look_at_t in the post)."""
    z = target - C; z /= np.linalg.norm(z)
    x = np.cross(up, z); x /= np.linalg.norm(x)
    R = np.stack([x, np.cross(z, x), z])
    return R, -R @ C


def ellipse_patch(mean, cov, k=1.0, **kw):
    lam, V = np.linalg.eigh(cov)
    ang = np.degrees(np.arctan2(V[1, 1], V[0, 1]))
    return Ellipse(mean, 2 * k * np.sqrt(lam[1]), 2 * k * np.sqrt(lam[0]), angle=ang, **kw)


def ellipsoid_pts(mu, M, n=24):
    """Surface {mu + M u : |u| = 1} (the 1-sigma level set when M = R S)."""
    u, v = np.meshgrid(np.linspace(0, 2 * np.pi, n), np.linspace(0, np.pi, n // 2 + 1))
    sph = np.stack([np.cos(u) * np.sin(v), np.sin(u) * np.sin(v), np.cos(v)], -1)
    P = sph @ M.T + mu
    return P[..., 0], P[..., 1], P[..., 2]


# ----------------------------------------------------------------------------------------------
# 1.1 Covariance from rotation and scale
# ----------------------------------------------------------------------------------------------
def fig_ellipsoid():
    q = np.array([0.80, 0.30, 0.35, 0.40])
    s = np.array([0.9, 0.5, 0.25])
    R = quat_to_rotmat(q)
    Sig = covariance_3d(q, np.log(s))
    ev = np.sort(np.linalg.eigvalsh(Sig))[::-1]
    assert np.allclose(ev, s**2), ev
    stages = [(np.eye(3), r"$\mathbf{u},\ \|\mathbf{u}\|=1$"), (np.diag(s), r"$S\,\mathbf{u}$"),
              (R @ np.diag(s), r"$R(\mathbf{q})\,S\,\mathbf{u}$")]
    fig = plt.figure(figsize=(14, 5.2))
    for i, (M, title) in enumerate(stages):
        ax = fig.add_subplot(1, 3, i + 1, projection="3d", computed_zorder=False)
        X, Y, Z = ellipsoid_pts(np.zeros(3), M, 30)
        ax.plot_surface(X, Y, Z, color=C["fill"], alpha=0.25, linewidth=0, zorder=1)
        ax.plot_wireframe(X, Y, Z, color=C["a"], linewidth=0.5, alpha=0.45, zorder=2)
        cols = (C["x"], C["y"], C["z"])
        if i == 0:
            labs = [r"$\mathbf{e}_1$", r"$\mathbf{e}_2$", r"$\mathbf{e}_3$"]
        elif i == 1:
            labs = [r"$s_x\mathbf{e}_1$", r"$s_y\mathbf{e}_2$", r"$s_z\mathbf{e}_3$"]
        else:
            labs = [r"$s_x\mathbf{r}_1$", r"$s_y\mathbf{r}_2$", r"$s_z\mathbf{r}_3$"]
        for k in range(3):
            v = M[:, k]
            ax.quiver(0, 0, 0, *v, color=cols[k], linewidth=3, arrow_length_ratio=0.15, zorder=10)
            off = [np.array([0.05, -0.1, -0.12]), np.array([0, 0.12, 0.08]), np.array([0, 0, 0.12])][k]
            ax.text(*(v * 1.1 + off), labs[k], color=cols[k], fontsize=16, zorder=11)
        lim = 1.05
        ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_zlim(-lim, lim)
        ax.set_box_aspect((1, 1, 1))
        ax.set_xlabel("$x$", labelpad=-8); ax.set_ylabel("$y$", labelpad=-8); ax.set_zlabel("$z$", labelpad=-8)
        ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
        ax.view_init(elev=22, azim=-55)
        ax.set_title(title, pad=0)
    fig.text(0.5, 0.03, r"$\mathbf{q}=(%.2f, %.2f, %.2f, %.2f)/\|\cdot\|,\quad \mathbf{s}=(%.2f, %.2f, %.2f),"
             r"\quad \mathrm{eig}(\Sigma)=(%.4f, %.4f, %.4f)$" % (*q, *s, *ev), ha="center", fontsize=14)
    fig.subplots_adjust(left=0, right=1, wspace=0.05)
    out(fig, "04-ellipsoid.svg")


# ----------------------------------------------------------------------------------------------
# 1.2 Spherical harmonics
# ----------------------------------------------------------------------------------------------
def fig_sh_basis():
    # orthonormality self-check from the post
    rng = np.random.default_rng(0)
    d = rng.normal(size=(200000, 3)); d /= np.linalg.norm(d, axis=1, keepdims=True)
    B = sh_basis(d)
    G = 4 * np.pi / len(d) * B.T @ B
    assert np.abs(G - np.eye(16)).max() < 0.03, np.abs(G - np.eye(16)).max()

    n = 72
    u, v = np.meshgrid(np.linspace(0, 2 * np.pi, n), np.linspace(0, np.pi, n))
    dirs = np.stack([np.cos(u) * np.sin(v), np.sin(u) * np.sin(v), np.cos(v)], -1).reshape(-1, 3)
    Bv = sh_basis(dirs).reshape(n, n, 16)
    cmap = plt.get_cmap("RdBu_r")
    fig = plt.figure(figsize=(13, 8.4))
    k = 0
    for l in range(4):
        for m in range(-l, l + 1):
            col = 3 + m
            ax = fig.add_subplot(4, 7, l * 7 + col + 1, projection="3d")
            val = Bv[..., k]
            vmax = np.abs(Bv[..., k]).max()
            ax.plot_surface(*[dirs.reshape(n, n, 3)[..., i] for i in range(3)],
                            facecolors=cmap(0.5 + 0.5 * val / vmax), linewidth=0, antialiased=False,
                            rstride=1, cstride=1, shade=False, rasterized=True)
            ax.set_box_aspect((1, 1, 1)); ax.set_axis_off()
            ax.view_init(elev=20, azim=35)
            ax.set_title(f"$k={k}$", fontsize=14, pad=-6)
            k += 1
        fig.text(0.02, 0.86 - l * 0.235, rf"$\ell={l}$", fontsize=17)
    # small axis triad legend
    ax = fig.add_subplot(4, 7, 1, projection="3d")
    for i, (c, l) in enumerate(zip((C["x"], C["y"], C["z"]), "xyz")):
        vv = np.zeros(3); vv[i] = 1
        ax.quiver(0, 0, 0, *vv, color=c, linewidth=2.5, arrow_length_ratio=0.2)
        ax.text(*(vv * 1.25), f"${l}$", color=c, fontsize=15)
    ax.set_xlim(-0.2, 1.2); ax.set_ylim(-0.2, 1.2); ax.set_zlim(-0.2, 1.2)
    ax.set_box_aspect((1, 1, 1)); ax.set_axis_off(); ax.view_init(elev=20, azim=35)
    cax = fig.add_axes([0.80, 0.86, 0.15, 0.025])
    cb = fig.colorbar(plt.cm.ScalarMappable(cmap=cmap, norm=plt.Normalize(-1, 1)), cax=cax, orientation="horizontal")
    cb.set_ticks([-1, 0, 1]); cb.set_ticklabels(["$-$", "0", "$+$"])
    fig.subplots_adjust(left=0.05, right=0.99, top=0.97, bottom=0.02, wspace=0.0, hspace=0.12)
    out(fig, "04-sh-basis.svg")


def sh_fit_demo():
    """Fit SH (degree 1 and 3) to a colour with a highlight; return a function of camera azimuth."""
    rng = np.random.default_rng(1)
    d = rng.normal(size=(20000, 3)); d /= np.linalg.norm(d, axis=1, keepdims=True)
    base = np.array([0.20, 0.32, 0.62])
    spec = np.array([0.75, 0.62, 0.30])
    h = np.array([-np.sin(np.radians(60)), 0.0, np.cos(np.radians(60))])  # highlight direction (d, camera->Gaussian)
    h /= np.linalg.norm(h)

    def target(dd):
        return base + spec * np.maximum(0, dd @ h)[:, None] ** 6

    coeffs = {}
    for deg in (0, 1, 3):
        B = sh_basis(d, deg)
        k, *_ = np.linalg.lstsq(B, target(d) - 0.5, rcond=None)
        sh = np.zeros((1, 16, 3)); sh[0, :B.shape[1]] = k
        coeffs[deg] = sh
    return target, coeffs


def fig_sh_view():
    target, coeffs = sh_fit_demo()
    phi = np.linspace(-180, 180, 361)
    # cameras on a horizontal circle (y is down in OpenCV world, so the circle lies in the x-z plane)
    cam = np.stack([np.sin(np.radians(phi)), np.zeros_like(phi), -np.cos(np.radians(phi))], -1) * 3.0
    d = -cam / np.linalg.norm(cam, axis=1, keepdims=True)  # d = (mu - o_cam)/|.| with mu = 0
    rows = [np.clip(target(d), 0, 1)] + [np.clip(sh_to_rgb(np.repeat(coeffs[g], len(d), 0), d, g), 0, 1) for g in (0, 1, 3)]
    fig = plt.figure(figsize=(14, 5.6))
    ax = fig.add_axes([0.0, 0.05, 0.36, 0.9])
    ax.set_aspect("equal"); ax.grid(False)
    sel = slice(0, 361, 10)
    ax.scatter(cam[sel, 0], cam[sel, 2], c=rows[3][sel], s=240, edgecolors=C["dark"], linewidths=0.8, zorder=3)
    for i in (180, 240, 300):
        ax.annotate("", xy=(0.35 * cam[i, 0] / 3, 0.35 * cam[i, 2] / 3), xytext=(cam[i, 0] * 0.88, cam[i, 2] * 0.88),
                    arrowprops=dict(arrowstyle="->", color=C["gray"], lw=1.6))
    ax.text(0.5 * cam[240, 0] * 0.8, 0.5 * cam[240, 2] * 0.8 + 0.3, r"$\mathbf{d}$", color=C["gray"], fontsize=17)
    ax.add_patch(Ellipse((0, 0), 0.6, 0.6, color=rows[3][180], ec=C["dark"]))
    ax.text(0, 0, r"$\mu$", ha="center", va="center", fontsize=16, color="white")
    ax.set_xlim(-4.2, 4.2); ax.set_ylim(-4.2, 4.2)
    for sp in ax.spines.values():
        sp.set_visible(False)
    ax.set_xticks([]); ax.set_yticks([])
    ax.annotate("", xy=(-3.0, -3.9), xytext=(-4.1, -3.9), arrowprops=dict(arrowstyle="->", color=C["x"], lw=2))
    ax.annotate("", xy=(-4.1, -2.8), xytext=(-4.1, -3.9), arrowprops=dict(arrowstyle="->", color=C["z"], lw=2))
    ax.text(-2.85, -3.95, "$x$", color=C["x"], va="center"); ax.text(-4.1, -2.6, "$z$", color=C["z"], ha="center")
    for a, lab in ((0, "0°"), (90, "90°"), (-90, "-90°"), (180, "180°")):
        p = np.array([np.sin(np.radians(a)), -np.cos(np.radians(a))]) * 3.75
        ax.text(*p, lab, ha="center", va="center", fontsize=13, color=C["dark"])
    ax2 = fig.add_axes([0.45, 0.14, 0.53, 0.78])
    labels = [r"$\mathbf{c}^\star(\mathbf{d})$", r"$\ell\leq 0$", r"$\ell\leq 1$", r"$\ell\leq 3$"]
    for r, (row, lab) in enumerate(zip(rows, labels)):
        ax2.imshow(row[None], extent=(-180, 180, 3.8 - r, 3.8 - r + 0.8), aspect="auto")
    ax2.set_yticks([4.2 - r for r in range(4)]); ax2.set_yticklabels(labels)
    ax2.set_ylim(0.75, 4.65); ax2.set_xlim(-180, 180)
    ax2.set_xticks(range(-180, 181, 90)); ax2.set_xticklabels([f"{t}°" for t in range(-180, 181, 90)])
    ax2.set_xlabel(r"$\varphi$")
    ax2.grid(False); ax2.spines["left"].set_visible(False)
    out(fig, "04-sh-view.svg")
    return target, coeffs


# ----------------------------------------------------------------------------------------------
# 2. EWA projection
# ----------------------------------------------------------------------------------------------
EWA = dict(fx=60.0, fy=60.0, W=96, H=72)


def fig_ewa():
    fx, fy, W, H = EWA["fx"], EWA["fy"], EWA["W"], EWA["H"]
    cx, cy = W / 2, H / 2
    Rcw, tcw = np.eye(3), np.zeros(3)  # camera frame = world frame (OpenCV: x right, y down, z forward)
    mu = np.array([0.35, -0.15, 3.0])
    q = np.array([0.80, 0.20, 0.45, 0.35])
    s = np.array([0.42, 0.13, 0.08])
    Sig = covariance_3d(q, np.log(s))
    m2, cov2, tz = project_gaussian(mu, Sig, Rcw, tcw, fx, fy, cx, cy, W, H, dilation=0.0)
    rng = np.random.default_rng(3)
    X = rng.multivariate_normal(mu, Sig, size=20000)
    uv = np.stack([fx * X[:, 0] / X[:, 2] + cx, fy * X[:, 1] / X[:, 2] + cy], -1)
    emp = np.cov(uv.T)
    print("EWA cov2d (dilation 0):\n", cov2, "\nempirical:\n", emp)

    fig = plt.figure(figsize=(15, 6.6))
    ax = fig.add_axes([-0.04, -0.06, 0.58, 1.12], projection="3d")
    # plot coordinates: (x, z, -y), so the plot's vertical axis is "up" = -y and +y points down
    P = lambda p: (p[..., 0], p[..., 2], -p[..., 1])  # noqa: E731
    zi = 1.0  # draw the image plane at depth 1 (normalized image plane)
    corners = np.array([[(0 - cx) / fx, (0 - cy) / fy, 1], [(W - cx) / fx, (0 - cy) / fy, 1],
                        [(W - cx) / fx, (H - cy) / fy, 1], [(0 - cx) / fx, (H - cy) / fy, 1]]) * zi
    cc = np.vstack([corners, corners[:1]])
    ax.plot(*P(cc), color=C["dark"], lw=1.6)
    for c in corners:
        ax.plot(*P(np.stack([np.zeros(3), c * 3.6])), color=C["gray"], lw=0.8, ls=":")
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    ax.add_collection3d(Poly3DCollection([np.stack(P(corners), -1)], facecolor="#dfe9f5", alpha=0.5))
    # ellipsoid (1 sigma) and some samples
    M = quat_to_rotmat(q) @ np.diag(s)
    Xe, Ye, Ze = ellipsoid_pts(mu, M, 28)
    ax.plot_wireframe(Xe, Ze, -Ye, color=C["a"], lw=0.6, alpha=0.8)
    ax.scatter(*P(X[:400]), s=2, color=C["a"], alpha=0.3, rasterized=True)
    # projected 1-sigma ellipse on the image plane, and the cone back to the ellipsoid
    lam, V = np.linalg.eigh(cov2)
    th = np.linspace(0, 2 * np.pi, 100)
    e2 = m2[:, None] + 1 * V @ (np.sqrt(lam)[:, None] * np.stack([np.cos(th), np.sin(th)]))
    ray = np.stack([(e2[0] - cx) / fx, (e2[1] - cy) / fy, np.ones_like(th)], -1)
    ax.plot(*P(ray * zi), color=C["b"], lw=2.4)
    for i in range(0, 100, 12):
        ax.plot(*P(np.stack([np.zeros(3), ray[i] * mu[2]])), color=C["b"], lw=0.8, alpha=0.8)
    ax.scatter(*P(np.array([0.0, 0, 0])), color=C["dark"], s=40)
    ax.text(*P(np.array([0.1, 0.1, -0.15])), r"$\mathbf{o}$", fontsize=16)
    ax.text(*P(mu + np.array([0.45, -0.2, 0])), r"$\mu,\ \Sigma$", color=C["a"], fontsize=16)
    ax.text(*P(corners[0] + np.array([0.0, -0.12, 0])), r"$z=1$", fontsize=14)
    for i, (c, l) in enumerate(zip((C["x"], C["y"], C["z"]), "xyz")):
        v = np.zeros(3); v[i] = 0.6
        ax.quiver(*P(np.zeros(3)), *P(v), color=c, lw=2.2, arrow_length_ratio=0.2)
        ax.text(*P(v * 1.3), f"${l}$", color=c, fontsize=16)
    ax.set_xlim(-1.2, 1.4); ax.set_ylim(0, 3.6); ax.set_zlim(-1.1, 1.1)
    ax.set_box_aspect((2.6, 3.6, 2.2))
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
    ax.view_init(elev=20, azim=-75)

    ax2 = fig.add_axes([0.56, 0.1, 0.42, 0.82])
    ax2.scatter(uv[:3000, 0], uv[:3000, 1], s=3, color=C["a"], alpha=0.25, lw=0, rasterized=True)
    for k in (1, 2, 3):
        ax2.add_patch(ellipse_patch(m2, cov2, k, fill=False, ec=C["b"], lw=2.4))
    ax2.add_patch(ellipse_patch(uv.mean(0), emp, 3, fill=False, ec=C["dark"], lw=1.6, ls="--"))
    ax2.plot(*m2, "o", color=C["b"])
    ax2.text(m2[0] + 1, m2[1] - 1.5, r"$\mu'$", color=C["b"], fontsize=17)
    ax2.set_xlim(0, W); ax2.set_ylim(H, 0); ax2.set_aspect("equal")
    ax2.set_xlabel("$u$ (px)"); ax2.set_ylabel("$v$ (px)")
    ax2.text(2, H - 14, r"$J W \Sigma W^\top J^\top = (%.1f,\ %.1f,\ %.1f)$" % (cov2[0, 0], cov2[0, 1], cov2[1, 1]),
             color=C["b"], fontsize=14)
    ax2.text(2, H - 5, r"$\mathrm{cov}(\phi(\mathbf{X})) = (%.1f,\ %.1f,\ %.1f)$" % (emp[0, 0], emp[0, 1], emp[1, 1]),
             color=C["dark"], fontsize=14)
    ax2.set_title(r"$f_x=f_y=%d,\ %d\times%d$ px,  $1\sigma,2\sigma,3\sigma$" % (fx, W, H), fontsize=14)
    out(fig, "04-ewa.svg")


def fig_lowpass():
    """Left: total alpha a sub-pixel Gaussian deposits on the pixel grid as its mean moves by sub-pixel
    amounts (sampled at pixel centres), with and without the 0.3 dilation.
    Right: resolution mismatch of the dilation (rendered footprint / correct footprint)."""
    ys, xs = np.mgrid[0:12, 0:12] + 0.5
    pix = np.stack([xs, ys], -1)
    offs = np.linspace(0, 2, 201)
    sig = 0.25
    cov = sig**2 * np.eye(2)
    res = {}
    for dil in (0.0, 0.3):
        tot = []
        for o in offs:
            m = np.array([5.0 + o, 5.0 + 0.5 * o])
            conic, _ = screen_extent(cov + dil * np.eye(2))
            tot.append(gaussian_alpha(pix, m, conic, 1.0).sum())
        res[dil] = np.array(tot)
    s = np.logspace(-np.log10(4), np.log10(4), 200)
    for lang in LANGS:
        fig, axs = plt.subplots(1, 2, figsize=(14, 5))
        ax = axs[0]
        ax.plot(offs, res[0.0], color=C["x"], label=label(lang, "no dilation (Σ')", "无扩张（Σ'）", "拡張なし（Σ'）"))
        ax.plot(offs, res[0.3], color=C["z"], label=r"$\Sigma' + 0.3\,I$")
        ax.set_xlabel(label(lang, "sub-pixel shift of the mean (px)", "均值的亚像素平移（像素）", "平均のサブピクセル移動（ピクセル）"))
        ax.set_ylabel(r"$\sum_{\mathbf{p}}\alpha(\mathbf{p})$")
        ax.set_title(label(lang, "Gaussian with σ = 0.25 px", "σ = 0.25 像素的高斯",
                           "σ = 0.25 ピクセルのガウシアン"))
        ax.set_ylim(0, None); ax.legend(loc="center right", fontsize=13)
        ax = axs[1]
        for sg, c in ((0.3, C["x"]), (1.0, C["b"]), (3.0, C["y"])):
            ratio = np.sqrt((s * sg) ** 2 + 0.3) / (s * np.sqrt(sg**2 + 0.3))
            ax.plot(s, ratio, color=c, label=rf"$\sigma = {sg}$ px")
        ax.axhline(1, color=C["gray"], lw=1); ax.axvline(1, color=C["gray"], lw=1, ls="--")
        ax.set_xscale("log"); ax.set_xticks([0.25, 0.5, 1, 2, 4]); ax.set_xticklabels(["1/4", "1/2", "1", "2", "4"])
        ax.set_xticks([], minor=True)
        ax.set_xlabel(label(lang, "render resolution / training resolution", "渲染分辨率 / 训练分辨率",
                            "描画解像度 / 学習解像度"))
        ax.set_ylabel(label(lang, "rendered / correct footprint", "渲染足迹 / 正确足迹", "描画フットプリント / 正しいフットプリント"))
        ax.text(0.27, 0.93, label(lang, "too fat", "过胖", "太りすぎ"), fontsize=14, transform=ax.transAxes)
        ax.text(0.62, 0.08, label(lang, "too thin", "过瘦", "細りすぎ"), fontsize=14, transform=ax.transAxes)
        ax.legend(fontsize=13, loc="upper right")
        fig.tight_layout()
        out(fig, f"04-lowpass_{lang}.svg")


# ----------------------------------------------------------------------------------------------
# 3. Rasterization: blending and tiles
# ----------------------------------------------------------------------------------------------
def composite(splats, W, H, bg=np.ones(3)):
    """Front-to-back blending (section 3.1) with the reference clamps; returns image and per-splat weights."""
    ys, xs = np.mgrid[0:H, 0:W] + 0.5
    pix = np.stack([xs, ys], -1)
    order = np.argsort([sp["depth"] for sp in splats])
    T = np.ones((H, W)); img = np.zeros((H, W, 3)); ws = {}
    for i in order:
        sp = splats[i]
        conic, r = screen_extent(sp["cov"])
        a = gaussian_alpha(pix, sp["mean"], conic, sp["o"])
        a = np.where(T * (1 - a) < 1e-4, 0.0, a)  # early termination (approximate per-pixel stop)
        w = a * T
        img += w[..., None] * sp["c"]
        T = T * (1 - a)
        ws[i] = w
    img += T[..., None] * bg
    return img, ws, T


def fig_blending():
    W, H = 72, 44
    splats = [  # listed front to back, so the index i is also the blending order
        dict(mean=np.array([38.0, 21.0]), cov=np.array([[40.0, -10.0], [-10.0, 60.0]]), o=0.6, c=np.array([0.17, 0.63, 0.17]), depth=1.2),
        dict(mean=np.array([26.0, 22.0]), cov=np.array([[70.0, 25.0], [25.0, 30.0]]), o=0.9, c=np.array([0.84, 0.15, 0.16]), depth=2.0),
        dict(mean=np.array([48.0, 24.0]), cov=np.array([[90.0, 0.0], [0.0, 25.0]]), o=0.95, c=np.array([0.12, 0.47, 0.71]), depth=3.1),
    ]
    img, ws, T = composite(splats, W, H)
    row = 22
    xs = np.arange(W) + 0.5
    fig, axs = plt.subplots(2, 1, figsize=(10, 9.4), gridspec_kw=dict(height_ratios=[1, 1.05]))
    ax = axs[0]
    ax.imshow(np.clip(img, 0, 1), extent=(0, W, H, 0), interpolation="nearest")
    ax.axhline(row + 0.5, color=C["dark"], lw=1.5, ls="--")
    for i, sp in enumerate(splats):
        ax.add_patch(ellipse_patch(sp["mean"], sp["cov"], 3, fill=False, ec=sp["c"], lw=1.5, ls=":"))
        ax.text(*(sp["mean"] + np.array([0, -11.5])), f"$i={i + 1}$\n$z={sp['depth']}$", ha="center", fontsize=13,
                color=sp["c"])
    ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.grid(False)
    ax.set_xlabel("$u$ (px)"); ax.set_ylabel("$v$ (px)")
    ax = axs[1]
    order = np.argsort([sp["depth"] for sp in splats])
    stack = [ws[i][row] for i in order] + [T[row]]
    colors = [splats[i]["c"] for i in order] + [np.array([0.88, 0.88, 0.88])]
    labs = [rf"$w_{i + 1}=\alpha_{i + 1}T_{i + 1}$" for i in order] + [r"$T_{4}$"]
    ax.stackplot(xs, *stack, colors=colors, labels=labs, alpha=0.9, step="mid")
    ax.set_xlim(0, W); ax.set_ylim(0, 1.0)
    ax.set_xlabel(f"$u$ (px),   $v={row + 0.5}$")
    ax.set_ylabel(r"$w_i,\ T_4$")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.2), ncol=4, fontsize=12, frameon=False)
    fig.tight_layout()
    out(fig, "04-blending.svg")
    # sanity: weights + background transmittance sum to one
    assert np.allclose(sum(stack), 1.0)


def fig_tiles():
    W, H, TS = 128, 80, 16
    fx = fy = 110.0
    cx, cy = W / 2, H / 2
    Rcw, tcw = np.eye(3), np.zeros(3)
    rng = np.random.default_rng(7)
    specs = [  # mean (camera space), quaternion, scales, colour, opacity
        ((-0.55, -0.12, 2.6), (1, 0.2, 0.1, 0.4), (0.22, 0.06, 0.05), (0.84, 0.15, 0.16)),
        ((-0.05, 0.10, 3.4), (1, 0.0, 0.3, -0.5), (0.28, 0.10, 0.06), (0.12, 0.47, 0.71)),
        ((0.55, -0.15, 2.2), (1, 0.5, 0.2, 0.0), (0.06, 0.05, 0.05), (0.17, 0.63, 0.17)),
        ((0.75, 0.22, 4.0), (1, 0.1, 0.1, 0.9), (0.35, 0.08, 0.05), (1.0, 0.5, 0.05)),
        ((0.10, -0.30, 3.0), (1, 0.3, -0.2, 0.2), (0.07, 0.03, 0.03), (0.58, 0.40, 0.74)),
    ]
    splats = []
    for k, (m, q, s, c) in enumerate(specs):
        Sig = covariance_3d(np.array(q, float), np.log(s))
        m2, cov2, tz = project_gaussian(np.array(m), Sig, Rcw, tcw, fx, fy, cx, cy, W, H)
        conic, r = screen_extent(cov2)
        # tiles touched: same rect rule as the reference getRect()
        tmin = np.clip(np.floor((m2 - r) / TS), 0, [W // TS, H // TS]).astype(int)
        tmax = np.clip(np.floor((m2 + r + TS - 1) / TS), 0, [W // TS, H // TS]).astype(int)
        splats.append(dict(id=k + 1, mean=m2, cov=cov2, o=0.9, c=np.array(c), depth=tz, r=r, tmin=tmin, tmax=tmax))
    img, _, _ = composite(splats, W, H)
    lists = {}
    for sp in splats:
        for tx in range(sp["tmin"][0], sp["tmax"][0]):
            for ty in range(sp["tmin"][1], sp["tmax"][1]):
                lists.setdefault((tx, ty), []).append((sp["depth"], sp["id"]))
    fig, ax = plt.subplots(figsize=(12, 8.2))
    ax.imshow(np.clip(img, 0, 1), extent=(0, W, H, 0), interpolation="nearest", alpha=0.85)
    for (tx, ty), L in lists.items():
        ax.add_patch(Rectangle((tx * TS, ty * TS), TS, TS, fc=C["light"], alpha=0.18, ec="none"))
        ids = ",".join(str(i) for _, i in sorted(L))
        ax.text(tx * TS + 1.0, ty * TS + 4.6, ids, fontsize=14, color=C["dark"])
    for x in range(0, W + 1, TS):
        ax.axvline(x, color=C["gray"], lw=0.8)
    for y in range(0, H + 1, TS):
        ax.axhline(y, color=C["gray"], lw=0.8)
    for sp in splats:
        ax.add_patch(ellipse_patch(sp["mean"], sp["cov"], 3, fill=False, ec=sp["c"], lw=2))
        ax.add_patch(Rectangle(sp["mean"] - sp["r"], 2 * sp["r"], 2 * sp["r"], fill=False, ec=sp["c"], lw=1.2, ls="--"))
        ax.text(*sp["mean"], f"{sp['id']}", ha="center", va="center", fontsize=14, color="white",
                fontweight="bold")
    ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.grid(False)
    ax.set_xticks(range(0, W + 1, 16)); ax.set_yticks(range(0, H + 1, 16))
    ax.set_xlabel("$u$ (px)"); ax.set_ylabel("$v$ (px)")
    ax.set_title("  ".join(f"{sp['id']}: $z$={sp['depth']:.1f}" for sp in splats), fontsize=15)
    print("tile lists:", {k: [i for _, i in sorted(v)] for k, v in sorted(lists.items())})
    out(fig, "04-tiles.svg")


# ----------------------------------------------------------------------------------------------
# 5. Initialization from SfM points
# ----------------------------------------------------------------------------------------------
def fig_init():
    rng = np.random.default_rng(5)
    t = rng.random(220) * 2 * np.pi
    obj = np.stack([1.2 * np.cos(t), 0.7 * np.sin(t)], -1) + rng.normal(0, 0.03, (220, 2))  # dense object outline
    t2 = rng.random(60) * 1.0
    wall = np.stack([-3 + 6 * t2, 2.2 + 0.05 * rng.normal(size=60)], -1)  # medium wall
    bgp = rng.uniform([-3.4, -2.6], [3.4, 2.0], (35, 2))  # sparse background points
    bgp = bgp[np.hypot(bgp[:, 0] / 1.4, bgp[:, 1] / 0.9) > 1]
    pts = np.vstack([obj, wall, bgp])
    d, _ = cKDTree(pts).query(pts, k=4)
    scale = d[:, 1:].mean(1)  # mean distance to the 3 nearest neighbours
    fig, ax = plt.subplots(figsize=(11, 7.4))
    cmap = plt.get_cmap("viridis")
    from matplotlib.colors import LogNorm
    norm = LogNorm(scale.min(), scale.max())
    for p, s in zip(pts, scale):
        ax.add_patch(Ellipse(p, 2 * s, 2 * s, fc=cmap(norm(s)), alpha=0.25, ec=cmap(norm(s)), lw=1.2))
    ax.scatter(pts[:, 0], pts[:, 1], s=8, color=C["dark"], zorder=3)
    ax.set_aspect("equal"); ax.set_xlim(-3.6, 3.6); ax.set_ylim(-2.8, 2.8)
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_visible(False)
    sm = plt.cm.ScalarMappable(cmap=cmap, norm=norm)
    cb = fig.colorbar(sm, ax=ax, fraction=0.035, pad=0.02)
    cb.ax.set_title(r"$s$", fontsize=17)
    ax.set_title(r"$s = \frac{1}{3}\sum_{k=1}^{3}\| \mathbf{p} - \mathbf{p}_{(k)}\|$", fontsize=16)
    out(fig, "04-init.svg")


# ----------------------------------------------------------------------------------------------
# 6. Adaptive density control: a real 2D toy fit
# ----------------------------------------------------------------------------------------------
def target_image(H=64, W=64):
    ys, xs = np.mgrid[0:H, 0:W] + 0.5
    img = np.ones((H, W, 3))
    img[(xs - 22) ** 2 + (ys - 24) ** 2 < 11 ** 2] = [0.84, 0.15, 0.16]
    img[np.abs(np.hypot(xs - 44, ys - 42) - 12) < 2.2] = [0.12, 0.47, 0.71]
    img[(np.abs((xs - ys) * 0.7071 + 20) < 1.2) & (xs > 6) & (xs < 30)] = [0.17, 0.63, 0.17]
    img[(np.abs(xs - 50) < 7) & (np.abs(ys - 14) < 5)] = [1.0, 0.5, 0.05]
    return img


def sigm(x):
    return 1 / (1 + np.exp(-x))


def render2d(P, pix, bg=1.0, need_grad=False):
    """2D splats (mean, log-scales, angle, opacity, colour), alpha-blended in index order."""
    s = np.exp(P["ls"]); c, sn = np.cos(P["th"]), np.sin(P["th"])
    dx = pix[None, :, 0] - P["mu"][:, None, 0]
    dy = pix[None, :, 1] - P["mu"][:, None, 1]
    u1 = c[:, None] * dx + sn[:, None] * dy  # u = R^T (p - mu)
    u2 = -sn[:, None] * dx + c[:, None] * dy
    i1, i2 = 1 / s[:, 0:1] ** 2, 1 / s[:, 1:2] ** 2
    g = np.exp(-0.5 * (u1 ** 2 * i1 + u2 ** 2 * i2))
    o = sigm(P["ol"])
    a_raw = o[:, None] * g
    alpha = np.minimum(a_raw, 0.99)
    rgb = sigm(P["cl"])
    T = np.cumprod(np.vstack([np.ones((1, alpha.shape[1])), 1 - alpha]), 0)
    w = alpha * T[:-1]
    img = w.T @ rgb + T[-1][:, None] * bg
    if not need_grad:
        return img
    return img, dict(alpha=alpha, a_raw=a_raw, T=T, w=w, rgb=rgb, u1=u1, u2=u2, i1=i1, i2=i2, g=g, o=o, c=c, sn=sn)


def grads2d(cache, dimg, bg=1.0):
    """Analytic backward pass using dC/dc_i = alpha_i T_i and dC/dalpha_i = T_i (c_i - B_i) (section 3.3)."""
    T, w, rgb = cache["T"], cache["w"], cache["rgb"]
    wc = w[:, :, None] * rgb[:, None, :]
    S = np.cumsum(wc[::-1], 0)[::-1] - wc + T[-1][None, :, None] * bg  # colour behind i (incl. background)
    B = S / np.maximum(T[1:][:, :, None], 1e-10)
    dL_dalpha = np.einsum("npc,pc->np", T[:-1][:, :, None] * (rgb[:, None, :] - B), dimg)
    dL_dalpha = dL_dalpha * (cache["a_raw"] < 0.99)
    dL_dpow = dL_dalpha * cache["a_raw"]
    u1, u2, i1, i2 = cache["u1"], cache["u2"], cache["i1"], cache["i2"]
    dp_du1, dp_du2 = -u1 * i1, -u2 * i2
    c, sn = cache["c"][:, None], cache["sn"][:, None]
    dmu = np.stack([(dL_dpow * -(c * dp_du1 - sn * dp_du2)).sum(1), (dL_dpow * -(sn * dp_du1 + c * dp_du2)).sum(1)], -1)
    return dict(mu=dmu,
                ls=np.stack([(dL_dpow * u1 ** 2 * i1).sum(1), (dL_dpow * u2 ** 2 * i2).sum(1)], -1),
                th=(dL_dpow * u1 * u2 * (i2 - i1)).sum(1),
                ol=(dL_dalpha * cache["g"]).sum(1) * cache["o"] * (1 - cache["o"]),
                cl=np.einsum("np,pc->nc", w, dimg) * rgb * (1 - rgb))


def check_grads2d():
    rng = np.random.default_rng(1)
    ys, xs = np.mgrid[0:10, 0:10] + 0.5
    pix = np.stack([xs.ravel(), ys.ravel()], -1)
    tgt = rng.random((100, 3))
    P = dict(mu=rng.random((4, 2)) * 10, ls=np.log(rng.random((4, 2)) * 3 + 1), th=rng.random(4) * 3,
             ol=rng.normal(size=4), cl=rng.normal(size=(4, 3)))
    L = lambda P: 0.5 * ((render2d(P, pix) - tgt) ** 2).sum()  # noqa: E731
    img, cache = render2d(P, pix, need_grad=True)
    gr = grads2d(cache, img - tgt)
    for k in P:
        f = P[k].ravel()
        for j in range(f.size):
            o = f[j]; f[j] = o + 1e-6; lp = L(P); f[j] = o - 1e-6; lm = L(P); f[j] = o
            assert abs((lp - lm) / 2e-6 - gr[k].ravel()[j]) < 1e-5


TOY = dict(iters=1200, n0=40, densify_from=200, densify_until=900, every=100, reset_at=(700,),
           grad_thresh=6e-5, clone_scale=2.0, min_opacity=0.005, snaps=(0, 300, 600, 1200))


def train_toy(cfg=TOY, seed=0, H=64, W=64):
    """L1 fit of 2D Gaussians with the clone / split / prune rules of section 6, scaled to the toy:
    clone if max scale <= clone_scale px, otherwise split into two children sampled from the parent with
    scales / 1.6; prune opacity < 0.005; one opacity reset to 0.01."""
    rng = np.random.default_rng(seed)
    tgt = target_image(H, W).reshape(-1, 3)
    ys, xs = np.mgrid[0:H, 0:W] + 0.5
    pix = np.stack([xs.ravel(), ys.ravel()], -1)
    n0 = cfg["n0"]
    P = dict(mu=rng.random((n0, 2)) * [W, H], ls=np.full((n0, 2), np.log(4.0)), th=np.zeros(n0),
             ol=np.full(n0, np.log(0.1 / 0.9)), cl=rng.normal(size=(n0, 3)) * 0.3)
    lrs = dict(mu=0.25, ls=0.02, th=0.02, ol=0.05, cl=0.04)
    m1 = {k: np.zeros_like(v) for k, v in P.items()}; m2 = {k: np.zeros_like(v) for k, v in P.items()}
    acc = np.zeros(n0); den = np.zeros(n0)
    hist = dict(loss=[], psnr=[], n=[], events=[], snaps={})
    for it in range(cfg["iters"] + 1):
        img, cache = render2d(P, pix, need_grad=True)
        diff = img - tgt
        hist["loss"].append(np.abs(diff).mean()); hist["psnr"].append(-10 * np.log10((diff ** 2).mean()))
        hist["n"].append(len(P["mu"]))
        if it in cfg["snaps"]:
            hist["snaps"][it] = (img.reshape(H, W, 3).copy(), {k: v.copy() for k, v in P.items()})
        gr = grads2d(cache, np.sign(diff) / diff.size)
        vis = cache["w"].max(1) > 1e-4
        acc += np.linalg.norm(gr["mu"], axis=1) * vis; den += vis
        for k in P:  # Adam
            m1[k] = 0.9 * m1[k] + 0.1 * gr[k]; m2[k] = 0.999 * m2[k] + 0.001 * gr[k] ** 2
            P[k] = P[k] - lrs[k] * (m1[k] / (1 - 0.9 ** (it + 1))) / (np.sqrt(m2[k] / (1 - 0.999 ** (it + 1))) + 1e-15)
        if cfg["densify_from"] <= it <= cfg["densify_until"] and it % cfg["every"] == 0:
            g = acc / np.maximum(den, 1)
            big = g >= cfg["grad_thresh"]
            maxs = np.exp(P["ls"]).max(1)
            clone, split = big & (maxs <= cfg["clone_scale"]), big & (maxs > cfg["clone_scale"])
            clones = {k: v[clone] for k, v in P.items()}
            kids = {k: np.repeat(v[split], 2, axis=0) for k, v in P.items()}
            sd = np.exp(kids["ls"]); c, sn = np.cos(kids["th"]), np.sin(kids["th"])
            z = rng.normal(size=sd.shape) * sd
            kids["mu"] = kids["mu"] + np.stack([c * z[:, 0] - sn * z[:, 1], sn * z[:, 0] + c * z[:, 1]], -1)
            kids["ls"] = kids["ls"] - np.log(1.6)
            keep = ~split
            new = {k: np.concatenate([P[k][keep], clones[k], kids[k]]) for k in P}
            nn = int(clone.sum()) + len(kids["mu"])
            for d in (m1, m2):
                for k in P:
                    d[k] = np.concatenate([d[k][keep], np.zeros((nn,) + P[k].shape[1:])])
            alive = sigm(new["ol"]) > cfg["min_opacity"]
            hist["events"].append(dict(it=it, before={k: v.copy() for k, v in P.items()}, clone=clone, split=split,
                                       kids=kids, pruned={k: v[~alive] for k, v in new.items()},
                                       n_clone=int(clone.sum()), n_split=int(split.sum()), n_prune=int((~alive).sum())))
            P = {k: v[alive] for k, v in new.items()}
            for d in (m1, m2):
                for k in P:
                    d[k] = d[k][alive]
            acc = np.zeros(len(P["mu"])); den = np.zeros(len(P["mu"]))
        if it in cfg["reset_at"]:
            P["ol"] = np.minimum(P["ol"], np.log(0.01 / 0.99))
    hist["P"] = P; hist["tgt"] = tgt.reshape(H, W, 3); hist["pix"] = pix
    for e in hist["events"]:
        print(f"iter {e['it']:5d}: clone {e['n_clone']:3d}  split {e['n_split']:3d}  prune {e['n_prune']:3d}")
    print("final N", len(P["mu"]), "PSNR %.2f dB" % hist["psnr"][-1])
    return hist


def draw_ell2d(ax, P, i, k=1.0, **kw):
    s = np.exp(P["ls"][i]); th = P["th"][i]
    ax.add_patch(Ellipse(P["mu"][i], 2 * k * s[0], 2 * k * s[1], angle=np.degrees(th), fill=False, **kw))


def fig_adc(h):
    H, W = h["tgt"].shape[:2]
    # show a step with a moderate number of clones, one with a moderate number of splits, and the first prune
    evs = h["events"]
    e_cl = min([e for e in evs if e["n_clone"] > 0], key=lambda e: abs(e["n_clone"] - 12))
    e_sp = min([e for e in evs if e["n_split"] > 0], key=lambda e: abs(e["n_split"] - 10))
    e_pr = next(e for e in evs if e["n_prune"] > 0)
    for lang in LANGS:
        fig, axs = plt.subplots(1, 3, figsize=(15, 5.6))
        titles = [label(lang, "clone", "复制（clone）", "複製（clone）"), label(lang, "split", "分裂（split）", "分割（split）"),
                  label(lang, "prune", "剪枝（prune）", "枝刈り（prune）")]
        for ax, e, kind, ttl in zip(axs, (e_cl, e_sp, e_pr), ("clone", "split", "prune"), titles):
            Pb = e["before"]
            img = render2d(Pb, h["pix"]).reshape(H, W, 3)
            ax.imshow(np.clip(img, 0, 1), extent=(0, W, H, 0), alpha=0.45)
            for i in range(len(Pb["mu"])):
                draw_ell2d(ax, Pb, i, ec=C["gray"], lw=0.5, alpha=0.6)
            if kind == "clone":
                for i in np.where(e["clone"])[0]:
                    draw_ell2d(ax, Pb, i, k=2, ec=C["b"], lw=2.4)
                    ax.plot(*Pb["mu"][i], "o", color=C["b"], ms=5)
            elif kind == "split":
                for i in np.where(e["split"])[0]:
                    draw_ell2d(ax, Pb, i, k=2, ec=C["a"], lw=1.6, ls="--")
                K = e["kids"]
                for i in range(len(K["mu"])):
                    draw_ell2d(ax, K, i, k=2, ec=C["a"], lw=2.4)
            else:
                Pp = e["pruned"]
                for i in range(len(Pp["mu"])):
                    draw_ell2d(ax, Pp, i, k=2, ec=C["x"], lw=1.6, ls="--")
                    ax.plot(*Pp["mu"][i], "x", color=C["x"], ms=11, mew=2.5)
            n = {"clone": e["n_clone"], "split": e["n_split"], "prune": e["n_prune"]}[kind]
            ax.set_title(f"{ttl}: {n}   (iter {e['it']})", fontsize=15)
            ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.set_aspect("equal"); ax.grid(False)
            ax.set_xticks([]); ax.set_yticks([])
        fig.tight_layout()
        out(fig, f"04-adc-events_{lang}.svg")

    # progress: target + snapshots, with ellipses
    snaps = sorted(h["snaps"].items())
    fig, axs = plt.subplots(2, len(snaps) + 1, figsize=(15, 7.0))
    axs[0, 0].imshow(h["tgt"], extent=(0, W, H, 0)); axs[0, 0].set_title(r"$I_{\mathrm{gt}}$")
    axs[1, 0].axis("off")
    for j, (it, (img, P)) in enumerate(snaps):
        n_it = h["n"][it]
        axs[0, j + 1].imshow(np.clip(img, 0, 1), extent=(0, W, H, 0))
        axs[0, j + 1].set_title(f"it {it}\n{h['psnr'][it]:.1f} dB", fontsize=14)
        ax = axs[1, j + 1]
        ax.set_facecolor("white")
        op = sigm(P["ol"])
        for i in range(len(P["mu"])):
            s = np.exp(P["ls"][i])
            ax.add_patch(Ellipse(P["mu"][i], 2 * s[0], 2 * s[1], angle=np.degrees(P["th"][i]),
                                 fc=sigm(P["cl"][i]), alpha=float(np.clip(op[i], 0.05, 0.9)), ec="none"))
            draw_ell2d(ax, P, i, ec=C["dark"], lw=0.35, alpha=0.6)
        ax.set_title(f"$N={n_it}$", fontsize=14)
    for ax in axs.ravel():
        ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.set_aspect("equal"); ax.grid(False)
        ax.set_xticks([]); ax.set_yticks([])
    fig.tight_layout()
    out(fig, "04-adc-progress.svg")

    its = np.arange(len(h["loss"]))
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(12, 5))
        ax.plot(its, h["psnr"], color=C["a"], lw=2)
        ax.set_xlabel(label(lang, "iteration", "迭代", "反復"))
        ax.set_ylabel("PSNR (dB)", color=C["a"])
        ax2 = ax.twinx()
        ax2.plot(its, h["n"], color=C["b"], lw=2, drawstyle="steps-post")
        ax2.set_ylabel(label(lang, "number of Gaussians N", "高斯数量 N", "ガウシアン数 N"), color=C["b"])
        ax2.spines["right"].set_visible(True); ax2.grid(False)
        for e in h["events"]:
            ax.axvline(e["it"], color=C["gray"], lw=0.8, ls=":")
        for r in TOY["reset_at"]:
            ax.axvline(r, color=C["x"], lw=1.8, ls="--")
            ax.text(r + 15, min(h["psnr"]) + 1, label(lang, "opacity reset", "不透明度重置", "不透明度リセット"),
                    color=C["x"], fontsize=13)
        ax.text(TOY["densify_from"] + 10, max(h["psnr"]) - 0.5,
                label(lang, "densify every 100 it", "每 100 次迭代致密化", "100 反復ごとに密度化"), fontsize=13,
                color=C["gray"], va="top")
        fig.tight_layout()
        out(fig, f"04-adc-curve_{lang}.svg")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        PREVIEW = sys.argv[1]
    fig_ellipsoid()
    fig_sh_basis()
    fig_sh_view()
    fig_ewa()
    fig_lowpass()
    fig_blending()
    fig_tiles()
    fig_init()
    check_grads2d()
    fig_adc(train_toy())
