"""Figures for 3d-vision post 01: image formation and camera models.

Run from anywhere:
    python3 bin/figures/3d-vision/vision3d_01.py            # writes the SVGs
    python3 bin/figures/3d-vision/vision3d_01.py /tmp/prev  # ... and PNG previews into /tmp/prev

Every number shown in a figure (and quoted in the post's captions) is computed here, from the
post's own code, which is copied verbatim below (hom/dehom, camera_R, decompose_P, distort,
undistort, project_kb, project_rs, qvec2rotmat, colmap_to_c2w, gl_projection); the only change is
that the rolling-shutter constants f, W, H, K are renamed RS_f, RS_W, RS_H, RS_K here.
Camera frames follow OpenCV (x right, y down, z forward) unless a panel says otherwise.
"""
import os
import sys
import pathlib

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

plt.rcParams["svg.hashsalt"] = "3d-vision-01"  # stable element ids

import numpy as np  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402
from scipy.linalg import rq  # noqa: E402

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
def hom(p):                      # Euclidean -> homogeneous
    return np.append(np.asarray(p, float), 1.0)


def dehom(x):                    # homogeneous -> Euclidean (needs x[-1] != 0)
    return x[:-1] / x[-1]


def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def camera_R(yaw, pitch, roll=0.0):
    """World-to-camera rotation. World: X east, Y north, Z up. Camera (OpenCV): x right,
    y down, z forward. yaw > 0 turns left, pitch > 0 looks up, roll > 0 turns the image
    clockwise. With all three zero the camera looks north with a level horizon."""
    R0 = np.array([[1.0, 0, 0], [0, 0, -1], [0, 1, 0]])   # rows: camera axes in world coordinates
    return rot_z(roll).T @ rot_x(-pitch) @ R0 @ rot_z(yaw).T


def decompose_P(P):
    """Split a 3x4 camera matrix (known only up to scale and sign) into K, R, t and C."""
    P = P if np.linalg.det(P[:, :3]) > 0 else -P   # det(M) > 0  <=>  det(R) = +1
    K, R = rq(P[:, :3])                            # M = K R, K upper triangular, R orthogonal
    S = np.diag(np.sign(np.diag(K)))               # S @ S = I: flip signs so diag(K) > 0
    K, R = K @ S, S @ R
    t = np.linalg.solve(K, P[:, 3])                # p4 = K t (before rescaling K)
    K = K / K[2, 2]
    C = -R.T @ t                                   # camera centre, also the null vector of P
    return K, R, t, C


def distort(x, y, k1=0.0, k2=0.0, p1=0.0, p2=0.0, k3=0.0):
    """Brown-Conrady (OpenCV order k1, k2, p1, p2, k3) on normalized coordinates."""
    r2 = x * x + y * y
    radial = 1 + k1 * r2 + k2 * r2**2 + k3 * r2**3
    xd = x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x)
    yd = y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y
    return xd, yd


def undistort(xd, yd, iters=20, **coef):
    """Invert distort() by fixed-point iteration: x = (x_d - tangential(x)) / radial(x)."""
    x, y = xd, yd                                      # initial guess: no distortion
    for _ in range(iters):
        r2 = x * x + y * y
        radial = 1 + coef.get("k1", 0) * r2 + coef.get("k2", 0) * r2**2 + coef.get("k3", 0) * r2**3
        dx, dy = distort(x, y, p1=coef.get("p1", 0), p2=coef.get("p2", 0))
        x = (xd - (dx - x)) / radial                   # dx - x is the tangential part
        y = (yd - (dy - y)) / radial
    return x, y


def project_kb(Xc, K, k):
    """Kannala-Brandt / OpenCV fisheye: r_d = theta (1 + k1 theta^2 + ... + k4 theta^8)."""
    rho = np.hypot(Xc[:, 0], Xc[:, 1])
    theta = np.arctan2(rho, Xc[:, 2])                  # angle to the optical axis, also > 90 deg
    t2 = theta**2
    theta_d = theta * (1 + k[0] * t2 + k[1] * t2**2 + k[2] * t2**3 + k[3] * t2**4)
    phi = np.arctan2(Xc[:, 1], Xc[:, 0])               # the azimuth is unchanged
    xd, yd = theta_d * np.cos(phi), theta_d * np.sin(phi)
    return np.c_[K[0, 0] * xd + K[0, 1] * yd + K[0, 2], K[1, 1] * yd + K[1, 2]]


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


RS_f, RS_W, RS_H = 1000.0, 1920, 1080
RS_K = np.array([[RS_f, 0, RS_W / 2], [0, RS_f, RS_H / 2], [0, 0, 1]])
readout = 0.030                       # seconds from the first to the last row
omega = np.deg2rad(60.0)              # pan rate (rad/s) about the camera y axis


def project_rs(X, iters=10):
    """Rolling-shutter projection of one world point: row v is exposed at t = readout * v / H,
    so the pixel must satisfy v = proj_v(R(t(v)) X). Solve by fixed-point iteration."""
    v = RS_H / 2
    for _ in range(iters):
        t = readout * v / RS_H
        x = RS_K @ (rot_y(-omega * t) @ X)          # camera turned by omega * t
        u, v = x[0] / x[2], x[1] / x[2]
    return u, v


def qvec2rotmat(q):
    """COLMAP quaternion (QW, QX, QY, QZ) -> rotation matrix (Hamilton convention)."""
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])


CV_TO_GL = np.diag([1.0, -1.0, -1.0, 1.0])   # flip the camera's y and z axes


def colmap_to_c2w(qvec, tvec, convention="opencv"):
    """images.txt stores world-to-camera; NeRF-style loaders want camera-to-world."""
    R = qvec2rotmat(qvec)
    c2w = np.eye(4)
    c2w[:3, :3], c2w[:3, 3] = R.T, -R.T @ tvec      # columns: camera axes and centre in world
    return c2w @ CV_TO_GL if convention == "opengl" else c2w


def gl_projection(K, W, H, near, far):
    """OpenGL clip matrix that reproduces the pinhole K (pixel origin at the image corner,
    pixel centres at +0.5, as in COLMAP) for a camera looking down -z with y up."""
    fx, s, cx, fy, cy = K[0, 0], K[0, 1], K[0, 2], K[1, 1], K[1, 2]
    return np.array([
        [2 * fx / W, -2 * s / W, 1 - 2 * cx / W, 0],
        [0, 2 * fy / H, 2 * cy / H - 1, 0],
        [0, 0, -(far + near) / (far - near), -2 * far * near / (far - near)],
        [0, 0, -1, 0]])


# ============================================================================================
# helpers
# ============================================================================================
def poly3(ax, pts, fc, ec="none", alpha=0.25, lw=1.0):
    ax.add_collection3d(Poly3DCollection([pts], facecolor=fc, edgecolor=ec, alpha=alpha, linewidths=lw))


def clean3d(ax):
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
    for a in (ax.xaxis, ax.yaxis, ax.zaxis):
        a.pane.set_facecolor((1, 1, 1, 0)); a.pane.set_edgecolor((0.85, 0.85, 0.85, 1))
    ax.grid(False)


def checker_img(ax, W, H):
    ax.add_patch(plt.Rectangle((0, 0), W, H, fill=False, ec=C["dark"], lw=2.0))


# ============================================================================================
# 1. the projective plane: points are rays, lines are planes, parallel lines meet at w = 0
# ============================================================================================
def fig_projective_plane():
    a, b = hom([1, 1]), hom([4, 3])
    c, d = hom([1, 3]), hom([4, 1])
    l1, l2 = np.cross(a, b), np.cross(c, d)
    x = np.cross(l1, l2)
    m1, m2 = np.array([1.0, -2.0, 1.0]), np.array([1.0, -2.0, -3.0])
    ideal = np.cross(m1, m2)
    assert np.allclose(dehom(x), [2.5, 2.0]) and np.allclose(ideal, [8, 4, 0])

    fig = plt.figure(figsize=(10.5, 13.5))
    ax = fig.add_axes([-0.06, 0.5, 1.12, 0.52], projection="3d")
    X0, X1, Y0, Y1 = -3.0, 3.0, -2.5, 2.5
    poly3(ax, [(X0, Y0, 1), (X1, Y0, 1), (X1, Y1, 1), (X0, Y1, 1)], C["fill"], ec=C["a"], alpha=0.45, lw=1.5)
    for m, col in ((m1, C["b"]), (m2, C["c"])):
        # line x - 2y + c0 = 0 on w = 1, clipped to the plane patch
        c0 = m[2]
        xa, xb = max(X0, 2 * Y0 - c0), min(X1, 2 * Y1 - c0)
        P0, P1 = np.array([xa, (xa + c0) / 2, 1]), np.array([xb, (xb + c0) / 2, 1])
        ax.plot(*np.c_[P0, P1], color=col, lw=3)
        poly3(ax, [(0, 0, 0), tuple(P0 * 1.0), tuple(P1 * 1.0)], col, alpha=0.18)
    # the two planes through the origin share the ray (2, 1, 0): the point at infinity
    dirn = ideal / np.linalg.norm(ideal) * 3.2
    ax.quiver(0, 0, 0, *dirn, color=C["x"], lw=3, arrow_length_ratio=0.1)
    ax.text(*(dirn * 1.08), r"$(8,4,0)^\top$", color=C["x"], fontsize=15)
    # an ordinary point: the ray through (-1.5, 1.2, 1), with several representatives
    p = np.array([-1.5, 1.2, 1.0])
    ax.plot(*np.c_[np.zeros(3), p * 1.7], color=C["dark"], lw=1.6)
    for lam, s in ((0.5, 25), (1.0, 70), (1.6, 25)):
        ax.scatter(*(p * lam), color=C["dark"], s=s, depthshade=False)
    ax.text(*(p * 1.0 + np.array([-1.3, 0.0, 0.0])), r"$(x,y,1)$", fontsize=14)
    ax.text(*(p * 1.6 + np.array([-0.2, 0.2, 0.1])), r"$\lambda(x,y,1)$", fontsize=14)
    for i, (col, lab) in enumerate(((C["x"], "x"), (C["y"], "y"), (C["z"], "w"))):
        v = np.zeros(3); v[i] = 1.6 if i == 2 else 3.3
        ax.quiver(0, 0, 0, *v, color=col, lw=1.2, arrow_length_ratio=0.08, alpha=0.6)
        ax.text(*(v * 1.07), f"${lab}$", color=col, fontsize=16)
    ax.text(X1 - 0.4, Y1 - 0.3, 1.08, r"$w=1$", color=C["a"], fontsize=15)
    ax.scatter(0, 0, 0, color=C["dark"], s=30)
    ax.set_xlim(-3, 3.4); ax.set_ylim(-2.6, 2.6); ax.set_zlim(0, 1.8)
    ax.set_box_aspect((6.4, 5.2, 4.2))
    ax.view_init(elev=13, azim=-60)
    ax.set_axis_off()

    ax = fig.add_axes([0.1, 0.04, 0.86, 0.46])
    t = np.linspace(-1, 6.5, 2)
    for l, col, name in ((l1, C["a"], r"$\mathbf{l}_1$"), (l2, C["z"], r"$\mathbf{l}_2$")):
        ax.plot(t, -(l[0] * t + l[2]) / l[1], color=col, lw=2.6)
        ax.text(5.15, -(l[0] * 5.15 + l[2]) / l[1] + 0.25, name, color=col, fontsize=17)
    for m, col in ((m1, C["b"]), (m2, C["c"])):
        ax.plot(t, -(m[0] * t + m[2]) / m[1], color=col, lw=2.2, ls="--")
    for P, name, off in ((a, "a", (-0.45, 0.1)), (b, "b", (0.12, 0.12)), (c, "c", (-0.45, 0.05)), (d, "d", (0.1, -0.4))):
        ax.scatter(*P[:2], color=C["dark"], s=55, zorder=5)
        ax.text(P[0] + off[0], P[1] + off[1], rf"$\mathbf{{{name}}}$", fontsize=17)
    ax.scatter(*dehom(x), marker="*", s=380, color=C["x"], zorder=6)
    ax.annotate(r"$\mathbf{x}=\mathbf{l}_1\times\mathbf{l}_2\sim(2.5,2,1)$", xy=(2.45, 2.12), xytext=(-0.6, 4.9),
                fontsize=15, color=C["x"], arrowprops=dict(arrowstyle="-|>", color=C["x"], lw=1.6))
    ax.annotate("", xy=(6.0, -0.9), xytext=(4.0, -1.9),
                arrowprops=dict(arrowstyle="-|>", color=C["x"], lw=2.6, mutation_scale=24))
    ax.text(2.2, -2.55, r"$\mathbf{m}_1\times\mathbf{m}_2=(8,4,0)^\top$", fontsize=15, color=C["x"])
    ax.text(5.3, 1.75, r"$\mathbf{m}_1$", color=C["b"], fontsize=16)
    ax.text(5.6, 0.55, r"$\mathbf{m}_2$", color=C["c"], fontsize=16)
    ax.set_xlim(-0.8, 6.2); ax.set_ylim(-2.8, 5.5); ax.set_aspect("equal")
    ax.set_xlabel("$x$"); ax.set_ylabel("$y$")
    out(fig, "01-projective-plane.svg")


# ============================================================================================
# 2. the hierarchy of plane transformations
# ============================================================================================
def fig_hierarchy():
    th = np.deg2rad(25)
    Rm = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
    Hs = {
        r"$\mathrm{SE}(2)$: 3": np.block([[Rm, np.array([[1.0], [0.4]])], [np.zeros((1, 2)), np.ones((1, 1))]]),
        r"$\mathrm{Sim}(2)$: 4": np.block([[0.65 * Rm.T, np.array([[0.6], [1.2]])], [np.zeros((1, 2)), np.ones((1, 1))]]),
        r"$\mathrm{Aff}(2)$: 6": np.array([[1.0, 0.55, 0.3], [0.25, 0.75, 0.4], [0, 0, 1]]),
        r"$\mathrm{PGL}(3)$: 8": np.array([[1.0, 0.15, 0.2], [0.05, 1.0, 0.2], [0.2, 0.25, 1.0]]),
    }
    fig, axs = plt.subplots(1, 4, figsize=(17, 4.9))
    g = np.linspace(0, 3, 4)
    s = np.linspace(0, 3, 40)
    for ax, (name, Hm) in zip(axs, Hs.items()):
        def tr(xx, yy):
            p = Hm @ np.vstack([xx, yy, np.ones_like(xx)])
            return p[0] / p[2], p[1] / p[2]
        for v in g:
            ax.plot(*tr(np.full_like(s, v), s), color=C["gray"], lw=1, alpha=0.35)  # original (faint)
        for v in g:
            ax.plot(*tr(s, np.full_like(s, v)), color=C["x"], lw=2.2)
            ax.plot(*tr(np.full_like(s, v), s), color=C["z"], lw=2.2)
        ax.plot(g[[0, 3, 3, 0, 0]], g[[0, 0, 3, 3, 0]], color=C["gray"], lw=1.2, ls=":")
        circ = np.linspace(0, 2 * np.pi, 100)
        ax.plot(*tr(1.5 + 0.6 * np.cos(circ), 1.5 + 0.6 * np.sin(circ)), color=C["a"], lw=2.2)
        if "PGL" in name:
            for dvec, col in (((1.0, 0.0, 0.0), C["x"]), ((0.0, 1.0, 0.0), C["z"])):
                v = Hm @ np.array(dvec)
                vp = v[:2] / v[2]
                for w in g:
                    st = np.array(tr(np.array([3.0 if dvec[0] else w]), np.array([w if dvec[0] else 3.0])))
                    ax.plot([st[0, 0], vp[0]], [st[1, 0], vp[1]], color=col, lw=1, ls="--", alpha=0.7)
                ax.scatter(*vp, color=col, s=70, zorder=5)
        ax.set_xlim(-0.6, 5.4); ax.set_ylim(-0.4, 4.6)
        ax.set_aspect("equal")
        ax.set_title(name)
        ax.tick_params(labelsize=11)
    fig.tight_layout()
    out(fig, "01-transform-hierarchy.svg")


# ============================================================================================
# 3. vanishing points, the horizon and calibration from vanishing points (post section 2.4)
# ============================================================================================
def boxes_and_ground():
    segs = []
    for (cx, cy, sx, sy, sz) in ((-2.8, 7.0, 2.0, 2.0, 1.0), (-6.5, 9.5, 2.5, 2.0, 3.2),
                                 (-1.0, 12.0, 2.0, 2.5, 2.6), (-8.5, 15.0, 3.0, 3.0, 4.5)):
        xs, ys, zs = (cx - sx / 2, cx + sx / 2), (cy - sy / 2, cy + sy / 2), (0.0, sz)
        corners = np.array([[x, y, z] for x in xs for y in ys for z in zs])
        for i in range(8):
            for j in range(i + 1, 8):
                if np.sum(np.abs(corners[i] - corners[j]) > 1e-9) == 1:
                    segs.append((corners[i], corners[j], int(np.argmax(np.abs(corners[i] - corners[j])))))
    ground = []
    for gx in np.arange(-16, 7, 2.0):
        ground.append((np.array([gx, 1.0, 0]), np.array([gx, 40.0, 0]), 1))
    for gy in np.arange(2, 41, 2.0):
        ground.append((np.array([-18.0, gy, 0]), np.array([8.0, gy, 0]), 0))
    return segs, ground


def project_seg(K, R, Cc, p, q, near=0.2, n=2):
    a, b = R @ (p - Cc), R @ (q - Cc)
    if a[2] < near and b[2] < near:
        return None
    if a[2] < near:
        a = a + (b - a) * (near - a[2]) / (b[2] - a[2])
    if b[2] < near:
        b = b + (a - b) * (near - b[2]) / (a[2] - b[2])
    pts = np.linspace(a, b, n)
    uv = (K @ pts.T).T
    return uv[:, :2] / uv[:, 2:]


def fig_vanishing():
    f, W, H = 800.0, 1280, 720
    K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
    R = camera_R(np.deg2rad(30), np.deg2rad(-15))
    V = K @ R
    vx, vy, vz = (V[:, i] / V[2, i] for i in range(3))
    horizon = np.linalg.inv(K).T @ R @ np.array([0, 0, 1.0])
    cpp = np.array([W / 2, H / 2])
    f_est = np.sqrt(-(vx[:2] - cpp) @ (vy[:2] - cpp))
    print(f"  VPs: vX={vx[:2].round(1)} vY={vy[:2].round(1)} vZ={vz[:2].round(1)}, f from VPs = {f_est:.3f}")
    Cc = np.array([0.0, 0.0, 1.6])
    segs, ground = boxes_and_ground()
    col_axis = (C["x"], C["y"], C["z"])
    vps = (vx, vy, vz)

    fig, (ax, bx) = plt.subplots(1, 2, figsize=(17, 6.4), gridspec_kw=dict(width_ratios=[1.75, 1]))
    for p, q, k in ground:
        uv = project_seg(K, R, Cc, p, q)
        if uv is not None:
            ax.plot(uv[:, 0], uv[:, 1], color=col_axis[k], lw=0.9, alpha=0.45)
    for p, q, k in segs:
        uv = project_seg(K, R, Cc, p, q)
        if uv is None:
            continue
        ax.plot(uv[:, 0], uv[:, 1], color=col_axis[k], lw=2.4)
        if k < 2 and p[2] > 0:  # extend the top edges of the boxes to their vanishing point
            far = uv[np.argmin(np.linalg.norm(uv - vps[k][:2], axis=1))]
            ax.plot([far[0], vps[k][0]], [far[1], vps[k][1]], color=col_axis[k], lw=0.8, ls="--", alpha=0.6)
    # horizon line a u + b v + c = 0
    us = np.array([-1100, 1500])
    ax.plot(us, -(horizon[0] * us + horizon[2]) / horizon[1], color=C["a"], lw=2.4)
    ax.text(-1050, -(horizon[0] * -1050 + horizon[2]) / horizon[1] - 25, r"$\mathbf{l}=K^{-\top}R\,\mathbf{n}$",
            color=C["a"], fontsize=16)
    ax.add_patch(plt.Rectangle((0, 0), W, H, fill=False, ec=C["dark"], lw=2.6))
    for v, name, col in ((vx, r"$\mathbf{v}_X$", C["x"]), (vy, r"$\mathbf{v}_Y$", C["y"])):
        ax.scatter(*v[:2], s=120, color=col, zorder=6, edgecolor="white")
        ax.text(v[0] - 60, v[1] + 70, name, color=col, fontsize=18)
    ax.annotate(r"$\mathbf{v}_Z$: $v=%.0f$" % vz[1], xy=(vz[0], 1040), xytext=(vz[0] + 40, 860),
                color=C["z"], fontsize=15, arrowprops=dict(arrowstyle="-|>", color=C["z"], lw=2))
    ax.scatter(*cpp, marker="+", s=150, color=C["dark"], zorder=6)
    ax.set_xlim(-1150, 1550); ax.set_ylim(1060, -160); ax.set_aspect("equal")
    ax.set_xlabel("$u$ (px)"); ax.set_ylabel("$v$ (px)")
    ax.tick_params(labelsize=12)

    tri = np.array([vx[:2], vy[:2], vz[:2], vx[:2]])
    bx.plot(tri[:, 0], tri[:, 1], color=C["dark"], lw=1.8)
    for i, (v, col) in enumerate(zip(vps, col_axis)):
        o1, o2 = vps[(i + 1) % 3][:2], vps[(i + 2) % 3][:2]
        e = (o2 - o1) / np.linalg.norm(o2 - o1)
        foot = o1 + e * ((v[:2] - o1) @ e)
        bx.plot([v[0], foot[0]], [v[1], foot[1]], color=col, lw=1.6, ls="--")
        bx.scatter(*v[:2], s=110, color=col, zorder=5, edgecolor="white")
    bx.text(vx[0] - 120, vx[1] - 140, r"$\mathbf{v}_X$", color=C["x"], fontsize=17)
    bx.text(vy[0] - 60, vy[1] - 140, r"$\mathbf{v}_Y$", color=C["y"], fontsize=17)
    bx.text(vz[0] + 90, vz[1] + 40, r"$\mathbf{v}_Z$", color=C["z"], fontsize=17)
    bx.add_patch(plt.Rectangle((0, 0), W, H, fill=False, ec=C["dark"], lw=2.0))
    bx.scatter(*cpp, marker="+", s=200, color=C["dark"], zorder=6)
    bx.text(cpp[0] + 70, cpp[1] + 250, r"$\mathbf{c}$", fontsize=17)
    bx.set_xlim(-1100, 1450); bx.set_ylim(3550, -400); bx.set_aspect("equal")
    bx.tick_params(labelsize=11)
    fig.tight_layout()
    out(fig, "01-vanishing-points.svg")


# ============================================================================================
# 4. what each intrinsic (and the rotation) does to the image of a checkerboard
# ============================================================================================
def board_points(nx=8, ny=6, sq=0.1, Z=1.2, tilt=25):
    R = rot_y(np.deg2rad(tilt))
    quads = []
    for i in range(nx):
        for j in range(ny):
            x0, y0 = (i - nx / 2) * sq, (j - ny / 2) * sq
            q = np.array([[x0, y0, 0], [x0 + sq, y0, 0], [x0 + sq, y0 + sq, 0], [x0, y0 + sq, 0]])
            quads.append(((i + j) % 2, q @ R.T + np.array([0, 0, Z])))
    return quads


def fig_intrinsics():
    W, H = 640, 480
    base = dict(fx=500.0, fy=500.0, cx=320.0, cy=240.0, s=0.0)
    variants = [
        (r"$f_x=f_y=500$", {}, None),
        (r"$f_x=f_y=750$", dict(fx=750.0, fy=750.0), None),
        (r"$f_y=0.8\,f_x$", dict(fy=400.0), None),
        (r"$(c_x,c_y)=(400,180)$", dict(cx=400.0, cy=180.0), None),
        (r"$s=150$", dict(s=150.0), None),
        (r"$R=R_z(15^\circ)R_y(10^\circ)$", {}, rot_z(np.deg2rad(15)) @ rot_y(np.deg2rad(10))),
    ]
    quads = board_points()
    fig, axs = plt.subplots(2, 3, figsize=(15, 8.6))
    for ax, (title, ch, Rr) in zip(axs.ravel(), variants):
        p = dict(base); p.update(ch)
        K = np.array([[p["fx"], p["s"], p["cx"]], [0, p["fy"], p["cy"]], [0, 0, 1]])
        for parity, q in quads:
            Xc = q if Rr is None else q @ Rr.T
            uv = (K @ Xc.T).T
            uv = uv[:, :2] / uv[:, 2:]
            ax.fill(uv[:, 0], uv[:, 1], color=C["dark"] if parity else "#f4f4f4", ec=C["gray"], lw=0.4)
        ax.add_patch(plt.Rectangle((0, 0), W, H, fill=False, ec=C["a"], lw=2.4))
        ax.scatter(p["cx"], p["cy"], marker="+", s=180, color=C["x"], zorder=6, lw=2.5)
        ax.set_xlim(-20, W + 20); ax.set_ylim(H + 20, -20); ax.set_aspect("equal")
        ax.set_title(title)
        ax.set_xticks([0, 320, 640]); ax.set_yticks([0, 240, 480]); ax.tick_params(labelsize=11)
        ax.grid(False)
    fig.tight_layout()
    out(fig, "01-intrinsics.svg")


# ============================================================================================
# 5. the geometry hidden in P: centre, principal axis and the three row planes
# ============================================================================================
def fig_camera_matrix():
    K_true = np.array([[800.0, 2.0, 330.0], [0, 780.0, 245.0], [0, 0, 1]])
    C_true = np.array([1.0, -0.6, -3.0])
    z = -C_true / np.linalg.norm(C_true)
    x = np.cross(z, [0, -1.0, 0]); x /= np.linalg.norm(x)
    R_true = np.stack([x, np.cross(z, x), z])
    t_true = -R_true @ C_true
    P = -3.7 * K_true @ np.c_[R_true, t_true]
    K, R, t, Cc = decompose_P(P)
    print("  decompose_P: K =", K.round(3).tolist(), " C =", Cc.round(6))
    Kinv = np.linalg.inv(K)

    def ray(u, v, s):
        return Cc + s * (R.T @ (Kinv @ np.array([u, v, 1.0])))

    def pl(p):  # data (x, y down, z) -> plot (x, z, -y)
        p = np.atleast_2d(p)
        return p[:, 0], p[:, 2], -p[:, 1]

    fig = plt.figure(figsize=(10, 8.2))
    ax = fig.add_axes([0, 0, 1, 1], projection="3d")
    W, H = 640, 480
    corners = [(0, 0), (W, 0), (W, H), (0, H)]
    img = [ray(u, v, 1.0) for u, v in corners]
    poly3(ax, [tuple(np.array(pl(p)).ravel()) for p in img], C["fill"], ec=C["a"], alpha=0.6, lw=2)
    for p in img:
        ax.plot(*pl(np.array([Cc, Cc + 3.2 * (p - Cc)])), color=C["gray"], lw=1, ls=":")
    # row planes of P: p1 (u = 0), p2 (v = 0), p3 (principal plane, depth 0)
    S = 3.0
    pl1 = [Cc, ray(0, 0, S), ray(0, H, S)]
    pl2 = [Cc, ray(0, 0, S), ray(W, 0, S)]
    a = 1.2
    pl3 = [Cc + a * (sx * R[0] + sy * R[1]) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for row, (pts, col) in enumerate(((pl1, C["x"]), (pl2, C["y"]), (pl3, C["z"]))):
        for p in pts:   # every point on a row plane makes that row of P vanish
            assert abs(P[row] @ np.append(p, 1)) < 1e-6 * np.abs(P).max()
        poly3(ax, [tuple(np.array(pl(p)).ravel()) for p in pts], col, ec=col, alpha=0.16, lw=1.2)
    ax.text(*np.array(pl(ray(0, H * 0.6, 2.9))).ravel(), r"$\mathbf{p}^{1\top}\mathbf{X}=0$", color=C["x"], fontsize=15)
    ax.text(*np.array(pl(ray(W * 0.75, 0, 2.6))).ravel(), r"$\mathbf{p}^{2\top}\mathbf{X}=0$", color=C["y"], fontsize=15)
    ax.text(*np.array(pl(Cc - 1.25 * R[0] + 1.3 * R[1])).ravel(), r"$\mathbf{p}^{3\top}\mathbf{X}=0$", color=C["z"], fontsize=15)
    m3 = R[2]
    ax.quiver(*np.array(pl(Cc)).ravel(), *np.array(pl(2.2 * m3)).ravel(), color=C["dark"], lw=2.5, arrow_length_ratio=0.1)
    ax.text(*np.array(pl(Cc + 2.35 * m3)).ravel(), r"$\mathbf{m}^3$", fontsize=16)
    ax.scatter(*pl(Cc), s=60, color=C["dark"])
    ax.text(*np.array(pl(Cc + np.array([0.15, 0.25, -0.1]))).ravel(), r"$\mathbf{C}$", fontsize=17)
    for i, col in enumerate((C["x"], C["y"], C["z"])):
        e = np.zeros(3); e[i] = 0.7
        ax.quiver(*np.array(pl(np.zeros(3))).ravel(), *np.array(pl(e)).ravel(), color=col, lw=2, arrow_length_ratio=0.15)
        ax.text(*np.array(pl(e * 1.25)).ravel(), ["$X$", "$Y$", "$Z$"][i], color=col, fontsize=14)
    ax.set_xlim(-1.2, 3.2); ax.set_ylim(-3.4, 1.0); ax.set_zlim(-1.9, 2.5)
    ax.set_box_aspect((1, 1, 1), zoom=1.45)
    ax.view_init(elev=24, azim=-118)
    ax.set_axis_off()
    fig.tight_layout()
    out(fig, "01-camera-matrix.svg")


# ============================================================================================
# 6. radial profiles, fold-back, and convergence of the fixed-point undistortion
# ============================================================================================
def fig_distortion_radial():
    coef = dict(k1=-0.28, k2=0.07, p1=0.001, p2=-0.0005)
    r = np.linspace(0, 1.2, 400)
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(15, 5.8))
    cases = [((0.0, 0.0), C["gray"], "-"), ((-0.28, 0.07), C["a"], "-"), ((-0.4, 0.0), C["x"], "-"),
             ((0.2, 0.0), C["z"], "-")]
    for (k1, k2), col, ls in cases:
        rd = r * (1 + k1 * r**2 + k2 * r**4)
        ax.plot(r, rd, color=col, ls=ls, lw=2.6, label=rf"$k_1={k1:g},\ k_2={k2:g}$")
    rf = np.sqrt(1 / (3 * 0.4))           # d r_d / d r = 1 - 1.2 r^2 = 0
    rdf = rf * (1 - 0.4 * rf**2)
    ax.scatter([rf], [rdf], color=C["x"], s=90, zorder=5)
    ax.annotate(rf"$r={rf:.3f}$", xy=(rf, rdf), xytext=(0.72, 0.9), color=C["x"], fontsize=15,
                arrowprops=dict(arrowstyle="-|>", color=C["x"]))
    ax.axvline(np.hypot(320, 240) / 600, color=C["dark"], ls=":", lw=1.5)
    ax.text(np.hypot(320, 240) / 600 + 0.015, 0.08, r"$r_\mathrm{corner}$", fontsize=14)
    ax.set_xlabel(r"$r$"); ax.set_ylabel(r"$r_d$")
    ax.legend(fontsize=13, loc="upper left")
    ax.set_xlim(0, 1.2); ax.set_ylim(0, 1.45)

    for (x0, y0), col in (((0.15, 0.10), C["c"]), ((0.50, 0.38), C["a"]), ((0.70, 0.55), C["b"])):
        xd, yd = distort(x0, y0, **coef)
        its = np.arange(0, 21)
        errs = []
        for n in its:
            xu, yu = undistort(xd, yd, iters=n, **coef)
            errs.append(max(np.hypot(xu - x0, yu - y0), 1e-17))
        bx.semilogy(its, errs, "o-", color=col, ms=5, label=rf"$r={np.hypot(x0, y0):.2f}$")
    bx.set_xlabel(r"$n$"); bx.set_ylabel(r"$\Vert\hat{\mathbf{x}}-\mathbf{x}\Vert$")
    bx.set_ylim(1e-17, 1)
    bx.legend(fontsize=13)
    fig.tight_layout()
    out(fig, "01-distortion-radial.svg")


# ============================================================================================
# 7. a distorted "capture", its rectification by the forward model, and the displacement field
# ============================================================================================
def fig_distortion_image():
    coef = dict(k1=-0.28, k2=0.07, p1=0.001, p2=-0.0005)
    f, W, H = 600.0, 640, 480
    cx, cy = W / 2, H / 2
    vv, uu = np.mgrid[0:H, 0:W] + 0.5

    def checker(u, v):
        return ((np.floor(u / 40) + np.floor(v / 40)) % 2).astype(float)

    # (a) capture: pixel in the distorted image -> undistort -> ideal pixel -> board colour
    x, y = undistort((uu - cx) / f, (vv - cy) / f, iters=30, **coef)
    cap = checker(f * x + cx, f * y + cy)
    # (b) rectify: ideal pixel -> distort (forward model only) -> sample the capture
    xd, yd = distort((uu - cx) / f, (vv - cy) / f, **coef)
    ud, vd = f * xd + cx, f * yd + cy
    inside = (ud >= 0) & (ud < W) & (vd >= 0) & (vd < H)
    from scipy.ndimage import map_coordinates
    rect = map_coordinates(cap, [vd - 0.5, ud - 0.5], order=1, cval=0.5)
    # (c) displacement in pixels
    disp = f * np.hypot(xd - (uu - cx) / f, yd - (vv - cy) / f)
    x0, y0 = 0.50, 0.38
    xd0, yd0 = distort(x0, y0, **coef)
    d0 = 600 * np.hypot(xd0 - x0, yd0 - y0)
    print(f"  displacement: corner max {disp.max():.1f} px, snippet point {d0:.1f} px")

    fig, axs = plt.subplots(1, 3, figsize=(17, 4.9))
    cmap = matplotlib.colors.LinearSegmentedColormap.from_list("chk", ["#f4f4f4", C["dark"]])
    axs[0].imshow(cap, cmap=cmap, vmin=0, vmax=1, interpolation="nearest", extent=(0, W, H, 0))
    axs[1].imshow(rect, cmap=cmap, vmin=0, vmax=1, interpolation="nearest", extent=(0, W, H, 0))
    im = axs[2].imshow(disp, cmap="viridis", extent=(0, W, H, 0))
    cs = axs[2].contour(uu, vv, disp, levels=[2, 5, 10, 20, 30], colors="white", linewidths=1.2)
    axs[2].clabel(cs, fmt="%d", fontsize=11)
    axs[2].scatter(f * x0 + cx, f * y0 + cy, marker="x", s=120, color=C["x"], lw=3)
    cb = fig.colorbar(im, ax=axs[2], fraction=0.046, pad=0.03)
    cb.set_label("px"); cb.ax.tick_params(labelsize=11)
    for ax, ttl in zip(axs, ("(a)", "(b)", "(c)")):
        ax.set_title(ttl); ax.grid(False)
        ax.set_xticks([0, 320, 640]); ax.set_yticks([0, 240, 480]); ax.tick_params(labelsize=11)
        ax.scatter(cx, cy, marker="+", s=120, color=C["x"], lw=2.2)
    fig.tight_layout()
    out(fig, "01-distortion-image.svg")
    return disp.max(), d0


# ============================================================================================
# 8. fisheye projection functions and the Kannala-Brandt fit
# ============================================================================================
def fig_fisheye_models():
    th = np.linspace(0, np.pi, 600)
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(15, 5.8), gridspec_kw=dict(width_ratios=[1.35, 1]))
    models = [
        (np.where(th < np.pi / 2 - 1e-3, np.tan(np.minimum(th, 1.56)), np.nan), C["dark"], r"$f\tan\theta$"),
        (th, C["a"], r"$f\theta$"),
        (2 * np.sin(th / 2), C["b"], r"$2f\sin(\theta/2)$"),
        (2 * np.tan(th / 2), C["z"], r"$2f\tan(\theta/2)$"),
        (np.where(th <= np.pi / 2, np.sin(th), np.nan), C["y"], r"$f\sin\theta$"),
    ]
    for r, col, name in models:
        ax.plot(np.rad2deg(th), r, color=col, lw=2.6, label=name)
    ax.axvline(90, color=C["gray"], ls=":", lw=1.4)
    ax.set_xlim(0, 180); ax.set_ylim(0, 4.2)
    ax.set_xticks([0, 30, 60, 90, 120, 150, 180])
    ax.set_xlabel(r"$\theta$ (deg)"); ax.set_ylabel(r"$r/f$")
    ax.legend(fontsize=14, loc="upper left")

    f = 300.0
    theta = np.linspace(0, np.deg2rad(95), 200)
    A = f * np.stack([theta**3, theta**5, theta**7, theta**9], 1)
    res = {}
    for name, r_true, col in ((r"$2f\sin(\theta/2)$", 2 * f * np.sin(theta / 2), C["b"]),
                              (r"$2f\tan(\theta/2)$", 2 * f * np.tan(theta / 2), C["z"]),
                              (r"$f\sin\theta$", f * np.sin(theta), C["y"])):
        k = np.linalg.lstsq(A, r_true - f * theta, rcond=None)[0]
        err = np.abs(f * theta + A @ k - r_true)
        res[name] = (k, err.max())
        bx.semilogy(np.rad2deg(theta), np.maximum(err, 1e-12), color=col, lw=2.4, label=name)
        print(f"  KB fit to {name}: k = {k.round(6)}, max error {err.max():.2e} px")
    bx.set_xlabel(r"$\theta$ (deg)"); bx.set_ylabel("px")
    bx.set_xlim(0, 95); bx.set_ylim(1e-12, 1e2)
    bx.legend(fontsize=12, loc="upper center", ncol=3, handlelength=1.2, columnspacing=0.8)
    fig.tight_layout()
    out(fig, "01-fisheye-models.svg")
    return res


# ============================================================================================
# 9. the inside of a checkered cube seen by a 90-degree pinhole, a 150-degree pinhole and a
#    180-degree equidistant fisheye
# ============================================================================================
FACE_TINT = {(2, 1): (0.55, 0.55, 0.55), (0, 1): (0.84, 0.15, 0.16), (0, -1): (0.17, 0.63, 0.17),
             (1, -1): (0.12, 0.47, 0.71), (1, 1): (1.0, 0.5, 0.05), (2, -1): (0.58, 0.40, 0.74)}


def shade_cube(d):
    m = np.abs(d)
    ax_ = np.argmax(m, axis=-1)
    p = d / np.take_along_axis(m, ax_[..., None], -1)
    sign = np.sign(np.take_along_axis(d, ax_[..., None], -1))[..., 0]
    img = np.ones(d.shape[:-1] + (3,))
    for (a, s), tint in FACE_TINT.items():
        sel = (ax_ == a) & (sign == s)
        o = [i for i in range(3) if i != a]
        chk = ((np.floor((p[..., o[0]] + 1) * 4) + np.floor((p[..., o[1]] + 1) * 4)) % 2)[sel]
        col = np.array(tint)
        img[sel] = np.where(chk[:, None] > 0, col, 0.55 * col + 0.45)
    return img


def fig_fisheye_room():
    N = 420
    vv, uu = np.mgrid[0:N, 0:N] + 0.5
    c = N / 2
    fig, axs = plt.subplots(1, 3, figsize=(16, 5.6))
    for ax, hfov in zip(axs[:2], (90, 150)):
        f = c / np.tan(np.deg2rad(hfov / 2))
        d = np.stack([(uu - c) / f, (vv - c) / f, np.ones_like(uu)], -1)
        ax.imshow(shade_cube(d), extent=(0, N, N, 0), interpolation="bilinear")
        ax.set_title(rf"$f\tan\theta$, $2\theta_\max={hfov}^\circ$, $f={f:.0f}$")
    f = c / (np.pi / 2)
    r = np.hypot(uu - c, vv - c)
    th, ph = r / f, np.arctan2(vv - c, uu - c)
    d = np.stack([np.sin(th) * np.cos(ph), np.sin(th) * np.sin(ph), np.cos(th)], -1)
    img = shade_cube(d)
    img[th > np.pi / 2] = 1.0
    axs[2].imshow(img, extent=(0, N, N, 0), interpolation="bilinear")
    axs[2].set_title(rf"$f\theta$, $2\theta_\max=180^\circ$, $f={f:.0f}$")
    for ax in axs:
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
        for s in ax.spines.values():
            s.set_visible(True)
    fig.tight_layout()
    out(fig, "01-fisheye-room.svg")


# ============================================================================================
# 10. rolling shutter while panning
# ============================================================================================
def fig_rolling_shutter():
    global omega
    rates = (60.0, 240.0)
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(16, 5.6), gridspec_kw=dict(width_ratios=[1.5, 1]))
    Ys = np.linspace(-3.5, 3.5, 30)
    for Xp in np.arange(-6, 6.1, 2.0):
        pts = [np.array([Xp, Y, 8.0]) for Y in Ys]
        gs = np.array([(RS_K @ p)[:2] / p[2] for p in pts])
        ax.plot(gs[:, 0], gs[:, 1], color=C["gray"], lw=3, alpha=0.6)
        for rate, col in zip(rates, (C["a"], C["b"])):
            omega = np.deg2rad(rate)
            rs = np.array([project_rs(p) for p in pts])
            ax.plot(rs[:, 0], rs[:, 1], color=col, lw=2.4)
    ax.add_patch(plt.Rectangle((0, 0), RS_W, RS_H, fill=False, ec=C["dark"], lw=2))
    ax.set_xlim(-60, RS_W + 60); ax.set_ylim(RS_H + 40, -40); ax.set_aspect("equal")
    ax.set_xlabel("$u$ (px)"); ax.set_ylabel("$v$ (px)"); ax.tick_params(labelsize=12)

    pts = [np.array([0.0, Y, 5.0]) for Y in np.linspace(-2.7, 2.7, 60)]
    slants = {}
    for rate, col in zip((60.0, 120.0, 240.0), (C["a"], C["c"], C["b"])):
        omega = np.deg2rad(rate)
        rs = np.array([project_rs(p) for p in pts])
        bx.plot(rs[:, 0] - RS_W / 2, rs[:, 1], color=col, lw=2.6, label=rf"$\omega={rate:.0f}^\circ/\mathrm{{s}}$")
        top, bot = project_rs(np.array([0.0, -2.5, 5.0])), project_rs(np.array([0.0, 2.5, 5.0]))
        slants[rate] = (top, bot)
        print(f"  rolling shutter {rate:.0f} deg/s: top u={top[0]:.1f} (v={top[1]:.1f}), bottom u={bot[0]:.1f} (v={bot[1]:.1f})")
    omega = np.deg2rad(60.0)
    bx.axvline(0, color=C["gray"], lw=2)
    bx.set_ylim(RS_H, 0); bx.set_xlabel(r"$u_\mathrm{RS}-u_\mathrm{GS}$ (px)"); bx.set_ylabel("$v$ (px)")
    ax2 = bx.twinx()
    ax2.set_ylim(readout * 1000, 0); ax2.set_ylabel("$t$ (ms)"); ax2.grid(False)
    ax2.spines["right"].set_visible(True)
    bx.legend(fontsize=13, loc="lower left")
    fig.tight_layout()
    out(fig, "01-rolling-shutter.svg")
    return slants


# ============================================================================================
# 11. one physical camera in four conventions
# ============================================================================================
def fig_conventions():
    # plot frame: right = +x, forward = +y, up = +z ; the camera looks forward
    right, fwd, up = np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0])
    conv = [
        ("OpenCV / COLMAP", (right, -up, fwd)),
        ("OpenGL / Blender / NeRF", (right, up, -fwd)),
        ("LLFF", (-up, right, -fwd)),
        ("PyTorch3D", (-right, up, fwd)),
    ]
    fig = plt.figure(figsize=(10, 9.4))
    for i, (name, axes_) in enumerate(conv):
        ax = fig.add_subplot(2, 2, i + 1, projection="3d")
        hw, hh, dd = 0.55, 0.42, 1.25
        cs = [dd * fwd + sx * hw * right + sy * hh * up for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        poly3(ax, [tuple(c) for c in cs], C["fill"], ec=C["a"], alpha=0.55, lw=1.6)
        for c in cs:
            ax.plot(*np.c_[np.zeros(3), c], color=C["gray"], lw=1)
        for vec, col, lab in zip(axes_, (C["x"], C["y"], C["z"]), ("x", "y", "z")):
            ax.quiver(0, 0, 0, *(0.9 * vec), color=col, lw=3, arrow_length_ratio=0.18)
            ax.text(*(1.08 * vec + np.array([0.0, 0.0, 0.05])), f"${lab}$", color=col, fontsize=18)
        assert np.isclose(np.dot(np.cross(axes_[0], axes_[1]), axes_[2]), 1.0)  # all right-handed
        ax.set_xlim(-1, 1); ax.set_ylim(-1, 1.3); ax.set_zlim(-1, 1)
        ax.set_box_aspect((1, 1.15, 1), zoom=1.25)
        ax.view_init(elev=14, azim=-48)
        ax.set_axis_off()
        ax.set_title(name, fontsize=17)
    fig.tight_layout()
    out(fig, "01-conventions.svg")


if __name__ == "__main__":
    fig_projective_plane()
    fig_hierarchy()
    fig_vanishing()
    fig_intrinsics()
    fig_camera_matrix()
    fig_distortion_radial()
    fig_distortion_image()
    fig_fisheye_models()
    fig_fisheye_room()
    fig_rolling_shutter()
    fig_conventions()
