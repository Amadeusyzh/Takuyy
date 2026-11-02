"""Figures for graphics-engine post 03 (build a mini engine).

Everything is computed: the module graph from the post's import lines, the fixed-timestep run with
the post's loop, the pass-list compiler (a line-by-line port of `PassList.compile`), the orbit
camera and light matrices with the post's `lookAt`/`ortho`, the shadow depth map by ray casting,
and the frame-budget chart from an explicit CPU cost model (constants below, not measurements).

    python3 bin/figures/graphics-engine/graphics_engine_03.py
"""
import pathlib
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Patch  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics-engine"


def out(name):
    return OUT / f"03-{name}.svg"


def box(ax, x, y, w, h, text, fc="white", ec=C["dark"], fs=12, ls="-", tc=None):
    ax.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h, boxstyle="round,pad=0.02,rounding_size=0.08",
                                fc=fc, ec=ec, lw=1.6, linestyle=ls))
    ax.text(x, y, text, ha="center", va="center", fontsize=fs, color=tc or C["dark"])


def arrow(ax, p0, p1, color=C["dark"], ls="-", lw=1.5):
    ax.annotate("", xy=p1, xytext=p0,
                arrowprops=dict(arrowstyle="-|>", color=color, lw=lw, linestyle=ls,
                                shrinkA=0, shrinkB=0, mutation_scale=14))


# ---------------------------------------------------------------------------
# 1. Module dependency graph (from the import lines of the post)
# ---------------------------------------------------------------------------
IMPORTS = {
    "main.js": ["gpu/device.js", "gpu/resources.js", "assets/gltf.js", "ecs/world.js", "scene/transform.js",
                "scene/camera.js", "core/input.js", "core/loop.js", "core/math.js", "render/renderer.js",
                "debug/timing.js", "debug/panel.js"],
    "render/renderer.js": ["render/passes.js"],
    "scene/transform.js": ["core/math.js"],
    "scene/camera.js": ["core/math.js"],
    "render/passes.js": [], "debug/timing.js": [], "debug/panel.js": [], "assets/gltf.js": [],
    "ecs/world.js": [], "gpu/device.js": [], "gpu/resources.js": [], "core/input.js": [],
    "core/loop.js": [], "core/math.js": [],
}
DIR_COLOR = {"core": "#dbe9f6", "gpu": "#fde0c5", "ecs": "#d9f0d3", "scene": "#e8e0f5", "assets": "#fff2b3",
             "render": "#f8d7da", "debug": "#e6e6e6", "main.js": "#ffffff"}


def fig_modules():
    level = {}

    def lv(m):
        if m not in level:
            level[m] = 0 if not IMPORTS[m] else 1 + max(lv(c) for c in IMPORTS[m])
        return level[m]

    for m in IMPORTS:
        lv(m)
    nlev = max(level.values()) + 1
    pos = {}
    for L in range(nlev):
        mods = sorted([m for m in IMPORTS if level[m] == L])
        xs = (np.arange(len(mods)) - (len(mods) - 1) / 2) * 1.95
        for m, x in zip(mods, xs):
            pos[m] = (x, 2.2 * L)
    xmin = min(p[0] for p in pos.values()) - 1.0
    xmax = max(p[0] for p in pos.values()) + 1.0
    fig, ax = plt.subplots(figsize=(15, 5.6))
    w, h = 1.75, 0.62
    for m, deps in IMPORTS.items():
        for d in deps:
            (x0, y0), (x1, y1) = pos[m], pos[d]
            arrow(ax, (x0, y0 - h / 2), (x1, y1 + h / 2), color="#555555", lw=1.2)
    for m, (x, y) in pos.items():
        key = m.split("/")[0] if "/" in m else m
        box(ax, x, y, w, h, m.replace("/", "/\n") if "/" in m else m, fc=DIR_COLOR[key], fs=11)
    for L in range(nlev):
        ax.text(xmin - 0.3, 2.2 * L, f"L{L}", ha="center", va="center", fontsize=14, color=C["gray"])
    ax.set_xlim(xmin - 0.7, xmax); ax.set_ylim(-0.8, 2.2 * (nlev - 1) + 0.8)
    ax.axis("off")
    save(fig, out("modules"))
    return nlev


# ---------------------------------------------------------------------------
# 2. Fixed timestep: the post's loop on simulated frame times
# ---------------------------------------------------------------------------
def run_loop(frame_times, dt, max_frame=0.25):
    acc, t = 0.0, 0.0
    rows = []
    for ft in frame_times:
        ft = min(ft, max_frame)
        acc += ft
        t += ft
        steps = 0
        while acc >= dt:
            acc -= dt
            steps += 1
        rows.append((t, steps, acc, acc / dt))
    return rows


def fig_fixed_timestep():
    rng = np.random.default_rng(3)
    n = 40
    ft = 1.0 / rng.uniform(60, 120, n) + rng.normal(0, 0.0008, n)
    ft = np.clip(ft, 0.006, None)
    ft[22] = 0.080                                   # one 80 ms hitch
    dt = 1 / 50
    rows = run_loop(ft, dt)
    t = np.array([r[0] for r in rows]) * 1000
    steps = np.array([r[1] for r in rows])
    acc = np.array([r[2] for r in rows]) * 1000
    alpha = np.array([r[3] for r in rows])
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(11, 7), sharex=True, gridspec_kw=dict(height_ratios=[1, 1.3]))
    a1.vlines(t, 0, 4.6, color=C["gray"], lw=1.0, alpha=0.7)
    for ti, s in zip(t, steps):
        for k in range(s):
            a1.plot(ti, k + 1, "o", color=C["a"], ms=7)
    a1.set_ylim(0, 4.8); a1.set_yticks([0, 1, 2, 3, 4])
    a1.set_ylabel("steps")
    hi = int(np.argmax(steps))
    a1.annotate(f"{ft[22]*1000:.0f} ms", xy=(t[hi], steps[hi]), xytext=(t[hi] + 40, 4.2), fontsize=13,
                arrowprops=dict(arrowstyle="->", color=C["dark"]))
    a2.step(t, acc, where="post", color=C["z"], label=r"$A$ (ms)")
    a2.axhline(dt * 1000, ls="--", color=C["z"], lw=1.4)
    a2.text(t[0], dt * 1000 + 0.6, r"$\Delta t = 20$ ms", color=C["z"], fontsize=13)
    a2.set_ylabel(r"$A$ (ms)", color=C["z"]); a2.set_ylim(0, 24)
    a2.set_xlabel("t (ms)")
    b2 = a2.twinx()
    b2.plot(t, alpha, "s", color=C["b"], ms=5, label=r"$\alpha$")
    b2.set_ylim(0, 1.2); b2.set_ylabel(r"$\alpha = A/\Delta t$", color=C["b"]); b2.grid(False)
    b2.spines["right"].set_visible(True)
    save(fig, out("fixed-timestep"))
    return steps.max()


# ---------------------------------------------------------------------------
# 3. glTF structure and 4. accessor byte layout
# ---------------------------------------------------------------------------
def fig_gltf_structure():
    fig, ax = plt.subplots(figsize=(12, 8.6))
    G, M = "#dbe9f6", "#e8e0f5"
    w, h = 1.9, 0.78
    nodes = {
        "scene": (1.5, 8, "scenes[0]\nnodes: [0]", G),
        "n0": (1.5, 6.9, "nodes[0]\nchildren: [1]", G),
        "n1": (1.5, 5.8, "nodes[1]\nmesh: 0, T R S", G),
        "mesh": (1.5, 4.7, "meshes[0]", G),
        "prim": (1.5, 3.6, "primitives[0]\nmode: 4", G),
        "a0": (-1.0, 2.3, "accessors[0]\nPOSITION\nVEC3 5126", G),
        "a1": (1.0, 2.3, "accessors[1]\nNORMAL\nVEC3 5126", G),
        "a2": (3.0, 2.3, "accessors[2]\nTEXCOORD_0\nVEC2 5126", G),
        "a3": (5.0, 2.3, "accessors[3]\nindices\nSCALAR 5123", G),
        "bv0": (1.0, 1.0, "bufferViews[0]\nbyteStride: 32", G),
        "bv1": (5.0, 1.0, "bufferViews[1]\n(packed)", G),
        "buf": (3.0, -0.2, "buffers[0]\nGLB BIN chunk", G),
        "mat": (8.0, 3.6, "materials[0]\npbrMetallicRoughness", M),
        "t0": (7.0, 2.3, "textures[0]\nbaseColor", M),
        "t1": (9.1, 2.3, "textures[1]\nmetallicRoughness", M),
        "s0": (8.05, 1.0, "samplers[0]\nREPEAT", M),
        "i0": (7.0, -0.2, "images[0]\nimage/png", M),
        "i1": (9.1, -0.2, "images[1]\nimage/png", M),
    }

    def hgt(k):
        return h * 1.25 if nodes[k][2].count("\n") == 2 else h
    edges = [("scene", "n0"), ("n0", "n1"), ("n1", "mesh"), ("mesh", "prim"), ("prim", "a0"), ("prim", "a1"),
             ("prim", "a2"), ("prim", "a3"), ("a0", "bv0"), ("a1", "bv0"), ("a2", "bv0"), ("a3", "bv1"),
             ("bv0", "buf"), ("bv1", "buf"), ("prim", "mat"), ("mat", "t0"), ("mat", "t1"), ("t0", "i0"),
             ("t1", "i1"), ("t0", "s0"), ("t1", "s0")]
    for a, b in edges:
        xa, ya, _, ca = nodes[a]
        xb, yb, _, cb = nodes[b]
        col = C["z"] if cb == G else C["a"]
        wa = 2.5 if a == "mat" else w
        wb = 2.5 if b == "mat" else w
        if abs(ya - yb) < 1e-6:                       # same row: horizontal arrow
            sgn = 1 if xb > xa else -1
            arrow(ax, (xa + sgn * wa / 2, ya), (xb - sgn * wb / 2, yb), color=col)
        elif yb < ya:                                 # child below
            arrow(ax, (xa, ya - hgt(a) / 2), (xb, yb + hgt(b) / 2), color=col)
        else:                                         # child above
            arrow(ax, (xa, ya + hgt(a) / 2), (xb, yb - hgt(b) / 2), color=col)
    for k, (x, y, text, fc) in nodes.items():
        box(ax, x, y, 2.5 if k == "mat" else w, hgt(k), text, fc=fc, fs=11)
    ax.set_xlim(-2.2, 10.4); ax.set_ylim(-0.8, 8.6)
    ax.axis("off")
    save(fig, out("gltf-structure"))


def fig_accessor_layout():
    fig, ax = plt.subplots(figsize=(13, 4.2))
    names = ["p.x", "p.y", "p.z", "n.x", "n.y", "n.z", "u", "v"]
    cols = [C["x"]] * 3 + [C["y"]] * 3 + [C["b"]] * 2
    cw = 0.5                                          # width of one 4-byte cell
    for vtx in range(3):
        for k in range(8):
            byte = 32 * vtx + 4 * k
            x = byte / 4 * cw
            hl = byte == 84
            ax.add_patch(plt.Rectangle((x, 1.0), cw, 0.8, fc=cols[k], alpha=0.85 if hl else 0.28,
                                       ec=C["dark"], lw=2.6 if hl else 0.8))
            ax.text(x + cw / 2, 1.4, names[k], ha="center", va="center", fontsize=9.5)
        x0 = 32 * vtx / 4 * cw
        ax.text(x0 + 4 * cw, 2.25, f"vertex {vtx}", ha="center", fontsize=12)
        ax.plot([x0, x0], [0.9, 2.05], color=C["dark"], lw=1.4)
    ax.plot([12, 12], [0.9, 2.05], color=C["dark"], lw=1.4)
    for b in range(0, 97, 8):
        ax.text(b / 4 * cw, 0.72, str(b), ha="center", va="top", fontsize=10, color=C["gray"])
    ax.text(-0.25, 0.72, "byte", ha="right", va="top", fontsize=10, color=C["gray"])
    for off, lab, col, y in [(0, "POSITION  byteOffset 0", C["x"], 3.0), (12, "NORMAL  byteOffset 12", C["y"], 3.5),
                             (24, "TEXCOORD_0  byteOffset 24", C["b"], 4.0)]:
        xs = [(off + 32 * v) / 4 * cw for v in range(3)]
        for xa in xs:
            ax.plot([xa, xa], [y - 0.12, 1.85], color=col, lw=1.2, ls=":")
        ax.plot([xs[0], xs[-1]], [y - 0.12, y - 0.12], color=col, lw=1.6)
        ax.text(12.3, y - 0.12, lab + "  stride 32", color=col, fontsize=11, va="center")
    ax.annotate("84 = 0 + 12 + 2*32 + 2*4", xy=(84 / 4 * cw + cw / 2, 1.0), xytext=(7.0, -0.4), fontsize=12,
                ha="center", arrowprops=dict(arrowstyle="->", color=C["dark"]))
    ax.set_xlim(-1.2, 17.5); ax.set_ylim(-0.8, 4.4)
    ax.axis("off")
    save(fig, out("accessor-layout"))


# ---------------------------------------------------------------------------
# Shared math (ports of src/core/math.js)
# ---------------------------------------------------------------------------
def normalize(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def look_at_basis(eye, target, up):
    z = normalize(np.asarray(eye, float) - np.asarray(target, float))
    x = normalize(np.cross(up, z))
    y = np.cross(z, x)
    return x, y, z


def W(p):
    """World (x, y-up, z) -> matplotlib 3D (x, -z, y): right-handed, y drawn vertically."""
    p = np.asarray(p, float)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)


def plot3(ax, pts, **kw):
    q = W(np.asarray(pts, float))
    ax.plot(q[:, 0], q[:, 1], q[:, 2], **kw)


def quiver3(ax, start, vec, color, label=None):
    s, v = W(start), W(vec)
    ax.quiver(*s, *v, color=color, linewidth=2.6, arrow_length_ratio=0.15)
    if label:
        e = W(np.asarray(start) + 1.15 * np.asarray(vec))
        ax.text(*e, label, color=color, fontsize=16)


def clean3d(ax):
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
    ax.set_box_aspect((1, 1, 1))


# ---------------------------------------------------------------------------
# 5. Orbit camera
# ---------------------------------------------------------------------------
def fig_orbit_camera():
    r, yaw, pitch = 4.0, 0.6, 0.35
    target = np.zeros(3)
    eye = target + r * np.array([np.cos(pitch) * np.sin(yaw), np.sin(pitch), np.cos(pitch) * np.cos(yaw)])
    x, y, z = look_at_basis(eye, target, [0, 1, 0])
    fig = plt.figure(figsize=(9, 8.5))
    ax = fig.add_subplot(projection="3d")
    u, v = np.meshgrid(np.linspace(0, 2 * np.pi, 25), np.linspace(-np.pi / 2, np.pi / 2, 13))
    S = r * np.stack([np.cos(v) * np.sin(u), np.sin(v), np.cos(v) * np.cos(u)], -1)
    q = W(S)
    ax.plot_wireframe(q[..., 0], q[..., 1], q[..., 2], color=C["gray"], lw=0.4, alpha=0.35)
    for i, (c, l) in enumerate(zip((C["x"], C["y"], C["z"]), ("x", "y", "z"))):
        e = np.zeros(3); e[i] = 1.6
        plot3(ax, [np.zeros(3), e], color=c, lw=1.2, ls="--")
        ax.text(*W(e * 1.12), l, color=c, fontsize=13)
    ax.scatter(*W(target), color=C["dark"], s=50)
    ax.text(*W(target + [0.15, -0.45, 0]), r"$\mathbf{t}$", fontsize=16)
    plot3(ax, [target, eye], color=C["a"], lw=1.6)
    ground = np.array([eye[0], 0, eye[2]])
    plot3(ax, [target, ground, eye], color=C["a"], lw=1.2, ls=":")
    th = np.linspace(0, yaw, 30)                    # yaw arc on the ground (from +z)
    plot3(ax, np.stack([1.2 * np.sin(th), 0 * th, 1.2 * np.cos(th)], -1), color=C["b"], lw=2)
    ax.text(*W([1.3 * np.sin(yaw / 2), 0, 1.3 * np.cos(yaw / 2)]), r"$\psi$", color=C["b"], fontsize=16)
    ph = np.linspace(0, pitch, 30)                  # pitch arc in the vertical plane
    hd = normalize(ground)
    plot3(ax, np.stack([2.0 * np.cos(ph) * hd[0], 2.0 * np.sin(ph), 2.0 * np.cos(ph) * hd[2]], -1), color=C["b"], lw=2)
    ax.text(*W([2.2 * np.cos(pitch / 2) * hd[0], 2.2 * np.sin(pitch / 2), 2.2 * np.cos(pitch / 2) * hd[2]]),
            r"$\phi$", color=C["b"], fontsize=16)
    ax.scatter(*W(eye), color=C["a"], s=60)
    ax.text(*W(eye + [0.0, 0.3, 0.3]), r"$\mathbf{e}$", color=C["a"], fontsize=16)
    quiver3(ax, eye, 1.2 * x, C["x"], r"$x_c$")
    quiver3(ax, eye, 1.2 * y, C["y"], r"$y_c$")
    quiver3(ax, eye, 1.2 * z, C["z"], r"$z_c$")
    d, aspect, tf = 1.5, 16 / 9, np.tan(np.radians(30))
    corners = [eye - d * z + d * tf * (sx * aspect * x + sy * y) for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    for cc in corners:
        plot3(ax, [eye, cc], color=C["dark"], lw=1.0)
    plot3(ax, corners + [corners[0]], color=C["dark"], lw=1.4)
    lim = 4.2
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_zlim(-lim, lim)
    ax.view_init(elev=18, azim=-62)
    clean3d(ax)
    save(fig, out("orbit-camera"))


# ---------------------------------------------------------------------------
# 6. Shadow-map geometry (light frustum + ray-cast depth map)
# ---------------------------------------------------------------------------
SPH_C, SPH_R = np.array([0.0, 0.7, 0.0]), 0.5
BOX_LO, BOX_HI = np.array([0.6, 0.0, -0.9]), np.array([1.3, 0.6, -0.2])
GROUND = 2.0


def cast(o, d):
    """Ray cast against ground square, sphere and box. o: (N,3), d: (3,). Returns t (inf if no hit)."""
    t = np.full(len(o), np.inf)
    tg = -o[:, 1] / d[1]
    pg = o + tg[:, None] * d
    ok = (tg > 0) & (np.abs(pg[:, 0]) <= GROUND) & (np.abs(pg[:, 2]) <= GROUND)
    t = np.where(ok, np.minimum(t, tg), t)
    oc = o - SPH_C
    b = oc @ d
    cc = np.einsum("ij,ij->i", oc, oc) - SPH_R ** 2
    disc = b * b - cc
    ts = -b - np.sqrt(np.maximum(disc, 0))
    t = np.where((disc >= 0) & (ts > 0), np.minimum(t, ts), t)
    t1 = (BOX_LO - o) / d
    t2 = (BOX_HI - o) / d
    tmin = np.max(np.minimum(t1, t2), axis=1)
    tmax = np.min(np.maximum(t1, t2), axis=1)
    hit = (tmax >= np.maximum(tmin, 0)) & (tmin > 0)
    t = np.where(hit, np.minimum(t, tmin), t)
    return t


def fig_shadow_geometry():
    d = normalize([-0.5, -1.0, -0.3])
    c = np.array([0.0, 0.4, 0.0])
    R = 2.9
    eye = c - 2 * R * d
    up = [1, 0, 0] if abs(d[1]) > 0.99 else [0, 1, 0]
    X, Y, Z = look_at_basis(eye, c, up)              # Z = -d
    N = 128
    s = (np.arange(N) + 0.5) / N
    U, V = np.meshgrid(s, s)                          # u to the right, v downwards
    xl, yl = (2 * U - 1) * R, (1 - 2 * V) * R
    o = eye + xl.reshape(-1, 1) * X + yl.reshape(-1, 1) * Y
    t = cast(o, d)
    depth = np.where(np.isfinite(t), (t - R) / (2 * R), 1.0).reshape(N, N)
    # receiver p: the ground point in the sphere's shadow, slightly off-center
    p = SPH_C + d * (SPH_C[1] / -d[1]) + np.array([0.12, 0.0, 0.08])
    p[1] = 0.0
    xp, yp, tp = (p - eye) @ X, (p - eye) @ Y, (p - eye) @ d
    up_, vp_ = (xp / R + 1) / 2, (1 - yp / R) / 2
    dp = (tp - R) / (2 * R)
    ts = cast((eye + xp * X + yp * Y)[None, :], d)[0]
    stored = (ts - R) / (2 * R)
    occ = eye + xp * X + yp * Y + ts * d             # first hit on the ray: the occluder

    fig = plt.figure(figsize=(14, 6.6))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    g = np.linspace(-GROUND, GROUND, 9)
    for gv in g:
        plot3(ax, [[gv, 0, -GROUND], [gv, 0, GROUND]], color=C["gray"], lw=0.6)
        plot3(ax, [[-GROUND, 0, gv], [GROUND, 0, gv]], color=C["gray"], lw=0.6)
    uu, vv = np.meshgrid(np.linspace(0, 2 * np.pi, 20), np.linspace(0, np.pi, 11))
    sp = SPH_C + SPH_R * np.stack([np.sin(vv) * np.cos(uu), np.cos(vv), np.sin(vv) * np.sin(uu)], -1)
    q = W(sp)
    ax.plot_wireframe(q[..., 0], q[..., 1], q[..., 2], color=C["z"], lw=0.7)
    lo, hi = BOX_LO, BOX_HI
    cs = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
    for i in range(8):
        for j in range(i + 1, 8):
            if np.sum(cs[i] != cs[j]) == 1:
                plot3(ax, [cs[i], cs[j]], color=C["y"], lw=1.6)
    lc = [eye + sx * R * X + sy * R * Y + tt * d for tt in (R, 3 * R) for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    for k in range(4):
        plot3(ax, [lc[k], lc[(k + 1) % 4]], color=C["light"], lw=1.8)
        plot3(ax, [lc[4 + k], lc[4 + (k + 1) % 4]], color=C["light"], lw=1.8)
        plot3(ax, [lc[k], lc[4 + k]], color=C["light"], lw=1.0)
    start = eye + xp * X + yp * Y + R * d               # ray from the near plane of the light box
    plot3(ax, [start, occ], color=C["b"], lw=2.2)
    plot3(ax, [occ, p], color=C["b"], lw=2.2, ls="--")
    ax.scatter(*W(occ), color=C["b"], s=40)
    ax.scatter(*W(p), color=C["dark"], s=60)
    ax.text(*W(p + [0.1, -0.5, 0.0]), r"$\mathbf{p}$", fontsize=17)
    quiver3(ax, c + 3.2 * normalize(-d) , 1.2 * d, C["light"], r"$\mathbf{d}$")
    lim = 3.6
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_zlim(-1.2, 2 * lim - 1.2)
    ax.view_init(elev=22, azim=-58)
    clean3d(ax)
    ax2 = fig.add_subplot(1, 2, 2)
    im = ax2.imshow(depth, cmap="gray", extent=[0, 1, 1, 0], vmin=depth.min(), vmax=1.0)
    ax2.plot(up_, vp_, "o", ms=10, mfc="none", mec=C["b"], mew=2.5)
    ax2.set_xlabel("u"); ax2.set_ylabel("v"); ax2.grid(False)
    ax2.set_title(rf"$z_{{map}}(u,v) = {stored:.3f} < z_p = {dp:.3f}$", fontsize=15)
    fig.colorbar(im, ax=ax2, fraction=0.046, pad=0.04, label=r"$z$")
    save(fig, out("shadow-geometry"))
    return stored, dp


# ---------------------------------------------------------------------------
# 7. Shadow acne and bias
# ---------------------------------------------------------------------------
def fig_shadow_bias():
    th = np.radians(30)
    w = 1.0
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 5.4), gridspec_kw=dict(width_ratios=[1.25, 1]))
    xs = np.linspace(0, 8, 400)
    a1.plot(xs, xs * np.tan(th), color=C["dark"], lw=2.2, label="receiver")
    for i in range(8):
        xc = (i + 0.5) * w
        a1.plot([i * w, (i + 1) * w], [xc * np.tan(th)] * 2, color=C["light"], lw=3)
        a1.axvline(i * w, color=C["gray"], lw=0.6, alpha=0.5)
    pts = np.linspace(0.03, 7.97, 90)
    stored = (np.floor(pts / w) + 0.5) * w * np.tan(th)
    h = pts * np.tan(th)
    shadowed = h < stored                              # behind its own texel's stored surface (bias 0)
    a1.scatter(pts[shadowed], h[shadowed], color=C["x"], s=18, zorder=3)
    a1.scatter(pts[~shadowed], h[~shadowed], color=C["y"], s=18, zorder=3)
    for xa in (1.0, 5.0):
        a1.annotate("", xy=(xa + 0.25, 4.6), xytext=(xa + 0.25, 5.4),
                    arrowprops=dict(arrowstyle="-|>", color=C["light"], lw=2))
    a1.set_xlim(0, 8); a1.set_ylim(-0.2, 5.6)
    a1.set_xlabel(r"$x$ (texels, $w = 1$)"); a1.set_ylabel("height")
    a1.set_aspect("equal")
    a1.legend(handles=[Line2D([], [], color=C["light"], lw=3, label="shadow map"),
                       Line2D([], [], marker="o", ls="", color=C["x"], label="acne"),
                       Line2D([], [], marker="o", ls="", color=C["y"], label="lit")], loc="upper left", fontsize=12)
    ang = np.radians(np.linspace(0, 85, 300))
    need = 0.5 * w * np.tan(ang)
    a2.plot(np.degrees(ang), need, color=C["dark"], lw=2.4, label=r"$b_{\min} = \frac{w}{2}\tan\theta$")
    b0 = 0.5 * np.tan(np.radians(30))
    a2.axhline(b0, color=C["x"], lw=2, ls="--", label=r"$b = b_0$")
    a2.plot(np.degrees(ang), 0.05 + 0.6 * np.tan(ang), color=C["y"], lw=2, label=r"$b = b_0' + k\tan\theta$")
    a2.fill_between(np.degrees(ang), b0, need, where=need > b0, color=C["x"], alpha=0.12)
    a2.axvline(30, color=C["gray"], lw=1, ls=":")
    a2.set_ylim(0, 3); a2.set_xlim(0, 85)
    a2.set_xlabel(r"$\theta$ (deg)"); a2.set_ylabel(r"bias (texels $\times \tan$)")
    a2.set_ylabel("bias (depth units, w = 1)")
    a2.legend(loc="upper left", fontsize=12)
    save(fig, out("shadow-bias"))


# ---------------------------------------------------------------------------
# 8./9. Pass list: port of PassList.compile, DAG and lifetimes
# ---------------------------------------------------------------------------
PASSES = [
    ("shadow", [], ["shadowMap"]),
    ("depthPrepass", [], ["depth"]),
    ("ssao", ["depth"], ["aoRaw"]),
    ("ssaoBlur", ["aoRaw"], ["ao"]),
    ("opaque", ["shadowMap", "ao", "depth"], ["hdr"]),
    ("sky", ["depth", "hdr"], ["hdr"]),
    ("bloomDown", ["hdr"], ["bloomA"]),
    ("bloomUp", ["bloomA"], ["bloomB"]),
    ("tonemap", ["hdr", "bloomB"], ["ldr"]),
    ("ui", ["ldr"], ["backbuffer"]),
    ("ssaoDebug", ["aoRaw"], ["debugView"]),
]
PERSISTENT = {"shadowMap", "backbuffer"}


def compile_passes(passes, outputs=("backbuffer",)):
    names = [p[0] for p in passes]
    P = {p[0]: p for p in passes}
    writers = {}
    for n, _, ws in passes:
        for r in ws:
            writers.setdefault(r, []).append(n)
    indeg = {n: 0 for n in names}
    nxt = {n: [] for n in names}
    edges = []
    for n, rs, _ in passes:
        for r in rs:
            for w in writers.get(r, []):
                if w != n:
                    nxt[w].append(n); indeg[n] += 1; edges.append((w, n, r))
    ready = [n for n in names if indeg[n] == 0]
    order = []
    while ready:
        n = ready.pop(0)
        order.append(n)
        for q in nxt[n]:
            indeg[q] -= 1
            if indeg[q] == 0:
                ready.append(q)
    assert len(order) == len(names), "cycle"
    needed = set(outputs)
    kept = []
    for n in reversed(order):
        if any(r in needed for r in P[n][2]):
            kept.insert(0, n)
            needed.update(P[n][1])
    life = {}
    for i, n in enumerate(kept):
        for r in P[n][2] + P[n][1]:
            if r in life:
                life[r][1] = i
            else:
                life[r] = [i, i]
    culled = [n for n in order if n not in kept]
    return order, kept, culled, life, edges


def alias_slots(life):
    """Greedy interval allocation: a slot is free if its last user ended strictly before."""
    items = sorted([(f, l, r) for r, (f, l) in life.items() if r not in PERSISTENT])
    slot_end, assign = [], {}
    for f, l, r in items:
        for s, e in enumerate(slot_end):
            if e < f:
                slot_end[s] = l; assign[r] = s
                break
        else:
            slot_end.append(l); assign[r] = len(slot_end) - 1
    return assign, len(slot_end), len(items)


def fig_frame_graph():
    order, kept, culled, life, edges = compile_passes(PASSES)
    ylane = {"shadow": 2.0, "depthPrepass": 0.0, "ssao": -1.2, "ssaoBlur": -1.2, "ssaoDebug": -2.5,
             "opaque": 1.0, "sky": 1.0, "bloomDown": -0.2, "bloomUp": -0.2, "tonemap": 1.0, "ui": 1.0}
    xpos = {n: 1.55 * i for i, n in enumerate(order)}
    fig, ax = plt.subplots(figsize=(15, 5.8))
    w, h = 1.3, 0.55
    for a, b, r in edges:
        cul = a in culled or b in culled
        x0, y0, x1, y1 = xpos[a] + w / 2, ylane[a], xpos[b] - w / 2, ylane[b]
        arrow(ax, (x0, y0), (x1, y1), color=C["gray"] if cul else "#555555", ls="--" if cul else "-", lw=1.3)
        ax.text((x0 + x1) / 2, (y0 + y1) / 2 + 0.13, r, fontsize=10, color=C["gray"], ha="center",
                bbox=dict(fc="white", ec="none", pad=0.5, alpha=0.85))
    for n in order:
        cul = n in culled
        box(ax, xpos[n], ylane[n], w, h, n, fc="#f2f2f2" if cul else "#e8e0f5", ec=C["gray"] if cul else C["a"],
            ls="--" if cul else "-", fs=11, tc=C["gray"] if cul else None)
    xb = xpos["ui"] + 1.5
    ax.text(xb, ylane["ui"], "backbuffer", fontsize=11, va="center", color=C["dark"])
    arrow(ax, (xpos["ui"] + w / 2, ylane["ui"]), (xb - 0.05, ylane["ui"]), color="#555555")
    ax.set_xlim(-1.0, xb + 1.6); ax.set_ylim(-3.0, 2.6)
    ax.axis("off")
    save(fig, out("frame-graph"))
    return kept, culled


def fig_resource_lifetime():
    order, kept, culled, life, edges = compile_passes(PASSES)
    assign, nslots, ntrans = alias_slots(life)
    res = sorted(life, key=lambda r: (life[r][0], life[r][1]))
    pal = [C["a"], C["b"], C["c"], C["y"], C["x"], C["z"], C["light"]]
    fig, ax = plt.subplots(figsize=(12, 5.6))
    for i, r in enumerate(res):
        f, l = life[r]
        if r in PERSISTENT:
            ax.barh(i, l - f + 0.8, left=f - 0.4, color="white", ec=C["gray"], hatch="//", lw=1.2)
            ax.text(l + 0.55, i, "ext", va="center", fontsize=11, color=C["gray"])
        else:
            s = assign[r]
            ax.barh(i, l - f + 0.8, left=f - 0.4, color=pal[s % len(pal)], alpha=0.85, ec=C["dark"], lw=0.8)
            ax.text(l + 0.55, i, f"slot {s}", va="center", fontsize=11)
    ax.set_yticks(range(len(res))); ax.set_yticklabels(res, fontsize=12)
    ax.invert_yaxis()
    ax.set_xticks(range(len(kept))); ax.set_xticklabels(kept, rotation=35, ha="right", fontsize=11)
    ax.set_xlim(-0.7, len(kept) + 0.9)
    ax.set_title(f"{ntrans} → {nslots} slots", fontsize=14)
    ax.grid(axis="y", alpha=0)
    save(fig, out("resource-lifetime"))
    return nslots, ntrans


# ---------------------------------------------------------------------------
# 10. Frame budget from a CPU cost model (assumed constants, in milliseconds)
# ---------------------------------------------------------------------------
COST = dict(
    systems_base=0.6, systems_per_obj=0.00015,      # input, camera, transforms (dirty-flag path)
    write_per_call=0.004, bindgroup_create=0.006,   # naive: one writeBuffer + one bind group per object
    batched_write_base=0.05, batched_per_obj=0.00025,
    encode_per_draw=0.0015,                         # setBindGroup + setVertexBuffer + setIndexBuffer + draw
    instanced_meshes=20, instanced_per_obj=0.0001, instanced_per_draw=0.002,
    submit=0.2,
)


def model(n, strategy):
    k = COST
    systems = k["systems_base"] + k["systems_per_obj"] * n
    if strategy == 0:
        upload = (k["write_per_call"] + k["bindgroup_create"]) * n
        enc = k["encode_per_draw"] * n
    elif strategy == 1:
        upload = k["batched_write_base"] + k["batched_per_obj"] * n
        enc = k["encode_per_draw"] * n
    else:
        upload = k["batched_write_base"] + k["instanced_per_obj"] * n
        enc = k["instanced_per_draw"] * k["instanced_meshes"] * np.ones_like(np.asarray(n, float))
    return dict(systems=systems, upload=upload, shadow=enc, opaque=enc, submit=k["submit"] + 0 * systems)


def fig_frame_budget():
    labels = {
        "en": (["per-object writes", "batched (this engine)", "instanced"],
               ["systems", "upload", "encode shadow", "encode opaque", "submit"], "objects", "CPU frame time (ms)",
               "ms at 3,000 objects"),
        "zh": (["逐对象写入", "批量写入（本引擎）", "实例化"],
               ["系统", "上传", "编码阴影", "编码不透明", "提交"], "对象数", "CPU 帧时间（ms）", "3,000 个对象时的 ms"),
        "ja": (["オブジェクトごとの書き込み", "一括書き込み（本エンジン）", "インスタンシング"],
               ["システム", "アップロード", "シャドウ記録", "不透明記録", "サブミット"], "オブジェクト数",
               "CPU フレーム時間（ms）", "3,000 オブジェクトでの ms"),
    }
    n = np.logspace(2, 4.3, 120)
    cols = [C["x"], C["a"], C["y"]]
    stage_cols = [C["gray"], C["b"], C["z"], C["c"], C["dark"]]
    for lang in LANGS:
        strat, stages, xl, yl, tl = labels[lang]
        fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 5.6), gridspec_kw=dict(width_ratios=[1.2, 1]))
        for s in range(3):
            m = model(n, s)
            a1.plot(n, sum(m.values()), color=cols[s], lw=2.4, label=strat[s])
        a1.axhline(1000 / 60, color=C["dark"], ls="--", lw=1.3)
        a1.axhline(1000 / 120, color=C["gray"], ls="--", lw=1.3)
        a1.text(110, 1000 / 60 * 1.08, "60 Hz", fontsize=12)
        a1.text(110, 1000 / 120 * 1.08, "120 Hz", fontsize=12, color=C["gray"])
        a1.set_xscale("log"); a1.set_yscale("log")
        a1.set_xlabel(xl); a1.set_ylabel(yl)
        a1.set_ylim(0.5, 300)
        a1.legend(fontsize=12, loc="upper left")
        for s in range(3):
            m = model(np.array(3000.0), s)
            left = 0.0
            for j, key in enumerate(["systems", "upload", "shadow", "opaque", "submit"]):
                v = float(m[key])
                a2.barh(s, v, left=left, color=stage_cols[j], ec="white",
                        label=stages[j] if s == 0 else None)
                left += v
            a2.text(left + 0.6, s, f"{left:.1f}", va="center", fontsize=12)
        a2.set_yticks(range(3)); a2.set_yticklabels(strat, fontsize=12)
        a2.invert_yaxis()
        a2.set_xlabel(tl)
        a2.set_xlim(0, 50)
        a2.legend(fontsize=11, loc="lower right")
        a2.grid(axis="y", alpha=0)
        save(fig, OUT / f"03-frame-budget_{lang}.svg")


if __name__ == "__main__":
    print("module levels:", fig_modules())
    print("max steps in one frame:", fig_fixed_timestep())
    fig_gltf_structure()
    fig_accessor_layout()
    fig_orbit_camera()
    print("stored depth vs receiver depth:", fig_shadow_geometry())
    fig_shadow_bias()
    print("kept / culled:", fig_frame_graph())
    print("slots / transient resources:", fig_resource_lifetime())
    fig_frame_budget()
