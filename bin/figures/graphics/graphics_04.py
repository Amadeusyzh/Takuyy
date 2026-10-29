"""Figures for graphics post 04 (physically based rendering).

Conventions match the post: local shading frame with the normal n = +z, polar angle theta from n,
azimuth phi; alpha is the GGX roughness parameter (alpha = r^2 for the perceptual roughness r of the
metallic-roughness workflow); G2 is the height-correlated Smith term unless stated otherwise.

    python3 bin/figures/graphics/graphics_04.py
"""
import functools
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/graphics"
PREVIEW = os.environ.get("PREVIEW")  # optional folder for PNG previews


def out(fig, name):
    if PREVIEW:
        fig.savefig(pathlib.Path(PREVIEW) / name.replace(".svg", ".png"), dpi=70)
    save(fig, OUT / name)


# ---------------------------------------------------------------- BRDF pieces (same as the post)
def D_ggx(cos_h, alpha):
    a2 = alpha * alpha
    d = cos_h * cos_h * (a2 - 1.0) + 1.0
    return a2 / (np.pi * d * d)


def D_beckmann(cos_h, alpha):
    c2 = cos_h * cos_h
    tan2 = (1.0 - c2) / c2
    return np.exp(-tan2 / (alpha * alpha)) / (np.pi * alpha * alpha * c2 * c2)


def Lambda_ggx(cos_v, alpha):
    cos_v = np.clip(cos_v, 1e-9, 1.0)
    tan2 = (1.0 - cos_v * cos_v) / (cos_v * cos_v)
    return 0.5 * (-1.0 + np.sqrt(1.0 + alpha * alpha * tan2))


def G1(cos_v, alpha):
    return 1.0 / (1.0 + Lambda_ggx(cos_v, alpha))


def G2_correlated(cos_l, cos_v, alpha):
    return 1.0 / (1.0 + Lambda_ggx(cos_l, alpha) + Lambda_ggx(cos_v, alpha))


def V_smith(NoV, NoL, a):
    a2 = a * a
    gv = NoL * np.sqrt(NoV * NoV * (1.0 - a2) + a2)
    gl = NoV * np.sqrt(NoL * NoL * (1.0 - a2) + a2)
    return 0.5 / (gv + gl)


def F_schlick(VoH, F0):
    return F0 + (1.0 - F0) * (1.0 - VoH) ** 5


def fresnel_exact(cos_i, eta):
    """Unpolarized Fresnel reflectance from air into a medium with (complex) index eta."""
    cos_i = np.asarray(cos_i, dtype=complex)
    sin2_t = (1.0 - cos_i**2) / eta**2
    cos_t = np.sqrt(1.0 - sin2_t)
    rs = (cos_i - eta * cos_t) / (cos_i + eta * cos_t)
    rp = (eta * cos_i - cos_t) / (eta * cos_i + cos_t)
    return 0.5 * (np.abs(rs) ** 2 + np.abs(rp) ** 2)


def sph(theta, phi):
    return np.stack([np.sin(theta) * np.cos(phi), np.sin(theta) * np.sin(phi), np.cos(theta)], axis=-1)


def hemisphere_wire(ax, r=1.0, color="#bbbbbb"):
    for th in np.radians([30, 60, 90]):
        p = np.linspace(0, 2 * np.pi, 120)
        ax.plot(r * np.sin(th) * np.cos(p), r * np.sin(th) * np.sin(p), r * np.cos(th) + 0 * p, color=color, lw=0.9)
    for ph in np.radians(np.arange(0, 360, 30)):
        t = np.linspace(0, np.pi / 2, 60)
        ax.plot(r * np.sin(t) * np.cos(ph), r * np.sin(t) * np.sin(ph), r * np.cos(t), color=color, lw=0.9)


def clean3d(ax, lim=1.1, elev=22, azim=-60):
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_zlim(0, lim)
    ax.set_box_aspect((2, 2, 1))
    ax.view_init(elev=elev, azim=azim)
    ax.set_axis_off()


def disk(ax, r=1.1, color="#d9d9d9"):
    p = np.linspace(0, 2 * np.pi, 80)
    rr = np.linspace(0, r, 2)
    P, RR = np.meshgrid(p, rr)
    ax.plot_surface(RR * np.cos(P), RR * np.sin(P), 0 * P, color=color, alpha=0.35, linewidth=0, shade=False)


# ---------------------------------------------------------------- 1. solid angle
def fig_solid_angle():
    fig = plt.figure(figsize=(11, 5.2))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    hemisphere_wire(ax)
    t0, t1 = np.radians(48), np.radians(66)
    p0, p1 = np.radians(20), np.radians(50)
    T, P = np.meshgrid(np.linspace(t0, t1, 10), np.linspace(p0, p1, 10))
    S = sph(T, P)
    ax.plot_surface(S[..., 0], S[..., 1], S[..., 2], color=C["a"], alpha=0.85, linewidth=0, shade=False)
    # edges: d theta along a meridian, sin(theta) d phi along a parallel
    tm = np.linspace(t0, t1, 20)
    e = sph(tm, p1 + 0 * tm)
    ax.plot(e[:, 0], e[:, 1], e[:, 2], color=C["b"], lw=3.5)
    pm = np.linspace(p0, p1, 20)
    e = sph(t1 + 0 * pm, pm)
    ax.plot(e[:, 0], e[:, 1], e[:, 2], color=C["c"], lw=3.5)
    mid = sph((t0 + t1) / 2, p1 + 0.1)
    ax.text(*(mid * 1.1 + np.array([0, 0, 0.02])), r"$d\theta$", color=C["b"], fontsize=18)
    mid = sph(t1 + 0.12, (p0 + p1) / 2)
    ax.text(*(mid * 1.08 + np.array([0, 0, -0.12])), r"$\sin\theta\,d\phi$", color=C["c"], fontsize=17)
    # normal, theta arc, phi arc
    arrow3d(ax, (0, 0, 0), (0, 0, 1.25), C["z"], label_text=r"$n$")
    c = sph((t0 + t1) / 2, (p0 + p1) / 2)
    ax.plot([0, c[0]], [0, c[1]], [0, c[2]], color=C["dark"], lw=1.4, ls="--")
    ta = np.linspace(0, (t0 + t1) / 2, 30)
    a = sph(ta, (p0 + p1) / 2 + 0 * ta) * 0.45
    ax.plot(a[:, 0], a[:, 1], a[:, 2], color=C["dark"], lw=1.6)
    ax.text(*(sph(0.35, (p0 + p1) / 2) * 0.55), r"$\theta$", fontsize=17)
    pa = np.linspace(0, (p0 + p1) / 2, 30)
    a = sph(np.pi / 2 + 0 * pa, pa) * 0.55
    ax.plot(a[:, 0], a[:, 1], a[:, 2], color=C["dark"], lw=1.6)
    ax.plot([0, 1.15], [0, 0], [0, 0], color=C["gray"], lw=1.2)
    proj = np.array([c[0], c[1], 0]) / np.hypot(c[0], c[1])
    ax.plot([0, proj[0]], [0, proj[1]], [0, 0], color=C["gray"], lw=1.2, ls="--")
    ax.text(0.62, 0.12, 0.0, r"$\phi$", fontsize=17)
    ax.text(*(sph(t0 - 0.1, p0) * 1.05 + np.array([0, 0, 0.1])), r"$d\omega$", color=C["a"], fontsize=19)
    clean3d(ax, lim=1.05, elev=24, azim=-35)

    # right: a remote patch dA at distance r subtends dA cos(theta')/r^2
    ax = fig.add_subplot(1, 2, 2)
    ax.set_aspect("equal")
    r, half = 3.2, 0.6
    d = np.array([np.cos(np.radians(20)), np.sin(np.radians(20))])        # line of sight
    centre = r * d
    tilt = np.radians(20 + 180 + 40)                                       # patch normal points back, 40 deg off
    nprime = np.array([np.cos(tilt), np.sin(tilt)])
    tang = np.array([-nprime[1], nprime[0]])
    A, B = centre - half * tang, centre + half * tang
    ax.plot(*np.c_[A, B], color=C["a"], lw=5)
    ax.text(*(B + np.array([0.08, 0.05])), r"$dA$", color=C["a"], fontsize=18)
    # projected patch, perpendicular to the line of sight
    perp = np.array([-d[1], d[0]])
    hp = half * abs(tang @ perp)
    Ap, Bp = centre - hp * perp, centre + hp * perp
    ax.plot(*np.c_[Ap, Bp], color=C["b"], lw=3, ls="--")
    ax.text(*(Ap + np.array([0.05, -0.38])), r"$dA\cos\theta'$", color=C["b"], fontsize=16)
    for P_ in (A, B):
        ax.plot([0, P_[0]], [0, P_[1]], color=C["gray"], lw=1.2)
    # unit circle arc = the solid angle (2D slice)
    ax.plot(np.cos(np.linspace(0, np.pi / 2, 100)), np.sin(np.linspace(0, np.pi / 2, 100)), color="#bbbbbb", lw=1.2)
    a0, a1 = np.arctan2(A[1], A[0]), np.arctan2(B[1], B[0])
    aa = np.linspace(min(a0, a1), max(a0, a1), 30)
    ax.plot(np.cos(aa), np.sin(aa), color=C["c"], lw=6)
    ax.text(0.75, 0.62, r"$d\omega$", color=C["c"], fontsize=18)
    ax.annotate("", xy=centre + 0.9 * nprime, xytext=centre, arrowprops=dict(arrowstyle="-|>", color=C["z"], lw=2.2))
    ax.text(*(centre + 1.0 * nprime + np.array([-0.15, -0.25])), r"$n'$", color=C["z"], fontsize=17)
    # theta' between n' and the direction back to x
    back = -d
    ang_n, ang_b = np.arctan2(nprime[1], nprime[0]), np.arctan2(back[1], back[0])
    aa = np.linspace(ang_b, ang_n, 20) if abs(ang_n - ang_b) < np.pi else np.linspace(ang_b, ang_n + 2 * np.pi, 20)
    ax.plot(centre[0] + 0.5 * np.cos(aa), centre[1] + 0.5 * np.sin(aa), color=C["dark"], lw=1.5)
    mid = (aa[0] + aa[-1]) / 2
    ax.text(centre[0] + 0.62 * np.cos(mid) - 0.1, centre[1] + 0.62 * np.sin(mid) - 0.1, r"$\theta'$", fontsize=16)
    ax.plot(0, 0, "o", color=C["dark"], ms=7)
    ax.text(-0.15, -0.3, r"$x$", fontsize=17)
    ax.text(1.4, 0.15, r"$r$", fontsize=17)
    ax.text(0.2, 2.25, r"$d\omega=\dfrac{dA\cos\theta'}{r^2}$", fontsize=19)
    ax.set_xlim(-0.4, 4.0); ax.set_ylim(-0.6, 2.8)
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    for s in ax.spines.values():
        s.set_visible(False)
    fig.tight_layout()
    out(fig, "04-solid-angle.svg")


# ---------------------------------------------------------------- 2. cosine law
def fig_cosine_law():
    fig, axs = plt.subplots(1, 3, figsize=(11, 4.2))
    for ax, deg in zip(axs, (0, 45, 70)):
        th = np.radians(deg)
        w = 1.0                                   # beam width
        foot = w / np.cos(th)
        ax.fill_between([-2.2, 2.2], -0.25, 0, color="#dddddd")
        ax.plot([-2.2, 2.2], [0, 0], color=C["dark"], lw=1.5)
        dirv = np.array([np.sin(th), -np.cos(th)])   # propagation direction (towards the surface)
        perp = np.array([np.cos(th), np.sin(th)])
        for s in np.linspace(-0.5, 0.5, 6):
            hit = np.array([s * foot, 0.0])
            start = hit - 2.4 * dirv
            ax.annotate("", xy=hit, xytext=start, arrowprops=dict(arrowstyle="-|>", color=C["light"], lw=2.0))
        # beam cross-section of width w
        c0 = np.array([0.0, 0.0]) - 1.7 * dirv
        ax.plot(*np.c_[c0 - 0.5 * w * perp, c0 + 0.5 * w * perp], color=C["b"], lw=3)
        ax.text(*(c0 + 0.5 * w * perp + np.array([0.08, 0.05])), r"$w$", color=C["b"], fontsize=17)
        ax.plot([-foot / 2, foot / 2], [0, 0], color=C["a"], lw=6, solid_capstyle="butt")
        ax.text(0, -0.55, r"$w/\cos\theta=%.2f\,w$" % foot, ha="center", color=C["a"], fontsize=16)
        ax.annotate("", xy=(-1.85, 1.0), xytext=(-1.85, 0), arrowprops=dict(arrowstyle="-|>", color=C["z"], lw=2))
        ax.text(-1.75, 0.85, r"$n$", color=C["z"], fontsize=16)
        ax.set_title(r"$\theta=%d^\circ:\ E\propto\cos\theta=%.2f$" % (deg, np.cos(th)))
        ax.set_xlim(-2.2, 2.2); ax.set_ylim(-0.8, 2.4); ax.set_aspect("equal")
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
        for s in ax.spines.values():
            s.set_visible(False)
    fig.tight_layout()
    out(fig, "04-cosine-law.svg")


# ---------------------------------------------------------------- 3. rendering equation integrand
def fib_hemisphere(n):
    i = np.arange(n) + 0.5
    z = 1 - i / n                                  # uniform in z on the hemisphere = uniform solid angle
    phi = np.pi * (1 + 5**0.5) * i
    r = np.sqrt(1 - z * z)
    return np.stack([r * np.cos(phi), r * np.sin(phi), z], axis=-1)


def env_radiance(w):
    """Toy sky: soft gradient plus a bright sun at theta = 40 deg, phi = 180 deg."""
    sun = sph(np.radians(40), np.radians(180))
    return 0.25 + 0.25 * w[..., 2] + 3.0 * np.exp((w @ sun - 1) / 0.02)


def fig_rendering_eq():
    w = fib_hemisphere(72)
    Li = env_radiance(w)
    cos_i = w[:, 2]
    wo = sph(np.radians(40), 0.0)                  # viewer on the +x side: mirror of the sun direction
    alpha = 0.3
    h = w + wo; h /= np.linalg.norm(h, axis=1, keepdims=True)
    f = D_ggx(h[:, 2], alpha) * V_smith(wo[2], cos_i, alpha)   # F = 1 for the picture
    titles = [r"$L_i(\omega_i)\cos\theta_i$", r"$f_r(\omega_i,\omega_o)\,L_i(\omega_i)\cos\theta_i$"]
    weights = [Li * cos_i, f * Li * cos_i]
    fig = plt.figure(figsize=(11, 5.4))
    cmap = plt.get_cmap("plasma")
    for k in range(2):
        ax = fig.add_subplot(1, 2, k + 1, projection="3d")
        hemisphere_wire(ax, color="#d0d0d0")
        disk(ax)
        val = weights[k] / weights[k].max()
        order = np.argsort(val)
        for j in order:
            L = 0.05 + 0.9 * val[j]                   # arrow length proportional to the integrand
            ax.quiver(*w[j], *(-w[j] * L), color=cmap(0.1 + 0.75 * val[j]), linewidth=0.8 + 3.0 * val[j],
                      arrow_length_ratio=0.3, alpha=0.45 + 0.55 * val[j])
        arrow3d(ax, (0, 0, 0), (0, 0, 1.3), C["z"], lw=2.5, label_text=r"$n$")
        if k == 1:
            arrow3d(ax, (0, 0, 0), wo * 1.3, C["y"], lw=3.2, label_text=r"$\omega_o$")
        sun = sph(np.radians(40), np.radians(180))
        ax.text(*(sun * 1.2), r"$\bigstar$", color=C["light"], fontsize=24, ha="center")
        ax.plot([0], [0], [0], "o", color=C["dark"], ms=5)
        ax.text(0.05, -0.15, -0.05, r"$x$", fontsize=16)
        ax.set_title(titles[k], fontsize=17, y=0.98)
        clean3d(ax, lim=1.0, elev=24, azim=-75)
    fig.subplots_adjust(left=0, right=1, wspace=0.0, top=0.92, bottom=0.0)
    out(fig, "04-rendering-eq.svg")


# ---------------------------------------------------------------- 4. microfacet profile
def fig_microfacet():
    rng = np.random.default_rng(39)
    n = 46
    xs = np.linspace(0, 12, n + 1)
    slopes = rng.normal(0, 0.7, n)
    slopes -= slopes.mean()
    ys = np.concatenate([[0], np.cumsum(slopes * np.diff(xs))])
    ys -= ys.mean()
    th_i, th_o = np.radians(-70), np.radians(50)    # angles from n (negative = left side)
    wi = np.array([np.sin(th_i), np.cos(th_i)])     # towards the light
    wo = np.array([np.sin(th_o), np.cos(th_o)])     # towards the viewer
    h = (wi + wo) / np.linalg.norm(wi + wo)

    def hit(p, d):
        """First t > 0 where the ray p + t d goes below the height profile (None if it escapes)."""
        t = np.linspace(1e-3, 30, 12000)
        q = p[None] + t[:, None] * d[None]
        inside = (q[:, 0] > xs[0]) & (q[:, 0] < xs[-1])
        below = inside & (q[:, 1] < np.interp(q[:, 0], xs, ys) - 1e-6)
        return t[np.argmax(below)] if below.any() else None

    seg = []
    for k in range(n):
        a, b = np.array([xs[k], ys[k]]), np.array([xs[k + 1], ys[k + 1]])
        t = (b - a) / np.linalg.norm(b - a)
        m = np.array([-t[1], t[0]])
        mid = (a + b) / 2
        state, tl, tv = None, None, None
        if np.degrees(np.arccos(np.clip(m @ h, -1, 1))) < 6:
            tl, tv = hit(mid + 1e-3 * m, wi), hit(mid + 1e-3 * m, wo)
            state = "ok" if tl is None and tv is None else ("shadow" if tl is not None else "mask")
        seg.append((a, b, m, mid, state, tl, tv))

    from matplotlib.lines import Line2D
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(10, 5.6))
        ax.fill_between(xs, ys, -2.2, color="#e6e6e6")
        ax.plot(xs, ys, color=C["dark"], lw=1.8)
        for a, b, m, mid, state, tl, tv in seg:
            ax.annotate("", xy=mid + 0.42 * m, xytext=mid, arrowprops=dict(arrowstyle="-|>", color="#a0a0a0", lw=1.0))
            if not state:
                continue
            col = {"ok": C["b"], "shadow": C["x"], "mask": C["z"]}[state]
            ax.plot(*np.c_[a, b], color=col, lw=7, solid_capstyle="butt")
            ax.annotate("", xy=mid + 0.8 * h, xytext=mid, arrowprops=dict(arrowstyle="-|>", color=C["a"], lw=2.2))
            if state == "ok":
                ax.plot(*np.c_[mid, mid + 3.0 * wi], color=C["light"], lw=1.6)
                ax.plot(*np.c_[mid, mid + 3.0 * wo], color=C["y"], lw=1.6)
            elif state == "shadow":
                ax.plot(*np.c_[mid, mid + tl * wi], color=C["light"], lw=2.0, ls=":")
                ax.plot(*(mid + tl * wi), "x", color=C["x"], ms=11, mew=3)
            else:
                ax.plot(*np.c_[mid, mid + tv * wo], color=C["y"], lw=2.0, ls=":")
                ax.plot(*(mid + tv * wo), "x", color=C["z"], ms=11, mew=3)
        o = np.array([1.6, 2.4])
        for v, c, s in ((wi, C["light"], r"$\omega_i$"), (wo, C["y"], r"$\omega_o$"), (h, C["a"], r"$h$")):
            ax.annotate("", xy=o + 1.2 * v, xytext=o, arrowprops=dict(arrowstyle="-|>", color=c, lw=2.8))
            ax.text(*(o + 1.42 * v + np.array([0, -0.1])), s, color=c, fontsize=19, ha="center")
        ax.annotate("", xy=o + np.array([0, 1.2]), xytext=o, arrowprops=dict(arrowstyle="-|>", color=C["z"], lw=1.6))
        ax.text(o[0] - 0.1, o[1] + 1.35, r"$n$", color=C["z"], fontsize=17)
        handles = [
            Line2D([], [], color=C["b"], lw=7, label=label(lang, "m = h, lit and visible", "m = h，被照亮且可见", "m = h、照らされて見える")),
            Line2D([], [], color=C["x"], lw=7, label=label(lang, "m = h, shadowed (light blocked)", "m = h，被阴影遮挡（光线被挡）", "m = h、シャドウイング（光が遮られる）")),
            Line2D([], [], color=C["z"], lw=7, label=label(lang, "m = h, masked (view blocked)", "m = h，被遮蔽（视线被挡）", "m = h、マスキング（視線が遮られる）")),
        ]
        ax.legend(handles=handles, loc="upper center", bbox_to_anchor=(0.5, 0.0), fontsize=16, frameon=False)
        ax.set_xlim(0, 12); ax.set_ylim(-1.5, 4.3); ax.set_aspect("equal")
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
        for s in ax.spines.values():
            s.set_visible(False)
        out(fig, f"04-microfacet_{lang}.svg")
    return [s[4] for s in seg if s[4]]


# ---------------------------------------------------------------- 5. NDF curves
def fig_ndf():
    th = np.radians(np.linspace(0, 89.5, 600))
    c = np.cos(th)
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.6))
    for alpha, ls in ((0.2, "-"), (0.5, "--")):
        for D, col, name in ((D_ggx, C["a"], "GGX"), (D_beckmann, C["b"], "Beckmann")):
            for ax in axs:
                ax.plot(np.degrees(th), D(c, alpha), color=col, ls=ls, label=r"%s, $\alpha=%.1f$" % (name, alpha))
    axs[0].set_xlim(0, 60); axs[0].set_ylim(0, 8.5)
    axs[1].set_yscale("log"); axs[1].set_ylim(1e-6, 30); axs[1].set_xlim(0, 90)
    for ax in axs:
        ax.set_xlabel(r"$\theta_h$ (deg)")
        ax.set_ylabel(r"$D(h)$")
    axs[0].legend(fontsize=13)
    axs[1].set_title("log scale: GGX has a long tail", fontsize=15) if False else axs[1].set_title(r"$\log D$")
    axs[0].set_title(r"$D(h)$")
    fig.tight_layout()
    out(fig, "04-ndf.svg")


# ---------------------------------------------------------------- 6. 3D BRDF lobes
def fig_lobes(lang):
    th_i = np.radians(45)
    wi = np.array([-np.sin(th_i), 0, np.cos(th_i)])          # light on the -x side
    wr = np.array([np.sin(th_i), 0, np.cos(th_i)])           # mirror direction
    T, P = np.meshgrid(np.linspace(0, np.pi / 2, 181), np.linspace(-np.pi, np.pi, 361), indexing="ij")
    wo = sph(T, P)
    cos_o = np.clip(wo[..., 2], 1e-6, 1)
    panels = [("Lambert", None), (r"GGX $\alpha=0.1$", 0.1), (r"GGX $\alpha=0.3$", 0.3),
              (r"GGX $\alpha=0.6$", 0.6), (r"GGX $\alpha=1.0$", 1.0),
              (label(lang, "mirror", "镜面", "鏡面") + " (\u03b1 \u2192 0)", "mirror")]
    fig = plt.figure(figsize=(10, 5.6))
    for k, (title, a) in enumerate(panels):
        ax = fig.add_subplot(2, 3, k + 1, projection="3d")
        disk(ax, 1.0)
        if a == "mirror":
            arrow3d(ax, (0, 0, 0), wr * 1.15, C["b"], lw=4)
        else:
            if a is None:
                g = cos_o / np.pi                                  # f_r cos(theta_o) for Lambert
            else:
                h = wo + wi; h /= np.linalg.norm(h, axis=-1, keepdims=True)
                g = D_ggx(h[..., 2], a) * V_smith(cos_o, wi[2], a) * cos_o   # F = 1
            r = g / g.max()
            X = wo * r[..., None]
            colors = plt.get_cmap("plasma")(0.15 + 0.8 * r)
            ax.plot_surface(X[..., 0], X[..., 1], X[..., 2], facecolors=colors, rstride=3, cstride=3,
                            linewidth=0, antialiased=False, shade=False)
            ax.plot(*np.c_[np.zeros(3), wr * 1.15], color=C["dark"], lw=1.4, ls="--")
        ax.quiver(*(wi * 1.25), *(-wi * 1.25), color=C["light"], linewidth=3, arrow_length_ratio=0.12)
        ax.text(*(wi * 1.3), r"$\omega_i$", color=C["light"], fontsize=17)
        ax.plot([0, 0], [0, 0], [0, 1.05], color=C["z"], lw=1.5)
        ax.set_title(title, fontsize=17, y=0.86)
        ax.set_xlim(-1, 1); ax.set_ylim(-1, 1); ax.set_zlim(0, 1)
        ax.set_box_aspect((2, 2, 1), zoom=1.45); ax.view_init(elev=16, azim=-90); ax.set_axis_off()
    fig.subplots_adjust(left=0, right=1, top=1.02, bottom=-0.05, wspace=0, hspace=-0.15)
    out(fig, f"04-brdf-lobes_{lang}.svg")


# ---------------------------------------------------------------- 7. Smith G1 / G2
def fig_smith(lang):
    th = np.radians(np.linspace(0, 89.9, 400))
    c = np.cos(th)
    cols = [C["c"], C["z"], C["a"], C["x"]]
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.6))
    for a, col in zip((0.1, 0.3, 0.6, 1.0), cols):
        axs[0].plot(np.degrees(th), G1(c, a), color=col, label=r"$\alpha=%.1f$" % a)
    axs[0].set_title(r"$G_1(\omega)=1/(1+\Lambda(\omega))$")
    axs[0].set_xlabel(r"$\theta$ (deg)"); axs[0].set_ylim(0, 1.03); axs[0].set_xlim(0, 90)
    axs[0].legend(fontsize=13, loc="lower left")
    for a, col in ((0.6, C["a"]), (1.0, C["x"])):
        axs[1].plot(np.degrees(th), G2_correlated(c, c, a), color=col, label=label(lang, "height-correlated", "高度相关", "高さ相関") + ", \u03b1 = %.1f" % a)
        axs[1].plot(np.degrees(th), G1(c, a) ** 2, color=col, ls="--", label=label(lang, "separable", "可分离", "分離形") + ", \u03b1 = %.1f" % a)
    axs[1].set_title(r"$G_2(\omega_i,\omega_o)$, $\theta_i=\theta_o=\theta$")
    axs[1].set_xlabel(r"$\theta$ (deg)"); axs[1].set_ylim(0, 1.03); axs[1].set_xlim(0, 90)
    axs[1].legend(fontsize=12, loc="lower left")
    fig.tight_layout()
    out(fig, f"04-smith-g_{lang}.svg")


# ---------------------------------------------------------------- 8. Fresnel
# Approximate complex IOR of gold at about 650 / 550 / 450 nm (R, G, B), after Johnson & Christy (1972).
GOLD = np.array([0.17 + 3.6j, 0.43 + 2.4j, 1.44 + 1.9j])


def fig_fresnel(lang):
    ex, sc = label(lang, "exact", "精确", "厳密"), "Schlick"
    th = np.radians(np.linspace(0, 90, 400))
    c = np.cos(th)
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.6))
    for eta, col in ((1.5, C["z"]), (1.33, C["c"])):
        F0 = ((eta - 1) / (eta + 1)) ** 2
        axs[0].plot(np.degrees(th), fresnel_exact(c, eta), color=col, label=ex + ", \u03b7 = %.2f" % eta)
        axs[0].plot(np.degrees(th), F_schlick(c, F0), color=col, ls="--", label=sc + ", F\u2080 = %.3f" % F0)
    axs[0].set_title(label(lang, "dielectric", "电介质", "誘電体"))
    axs[0].legend(fontsize=13, loc="upper left")
    for eta, col, ch in zip(GOLD, (C["x"], C["y"], C["z"]), "RGB"):
        F0 = fresnel_exact(1.0, eta)
        axs[1].plot(np.degrees(th), fresnel_exact(c, eta), color=col)
        axs[1].plot(np.degrees(th), F_schlick(c, F0), color=col, ls="--")
        axs[1].text(3, F0 - 0.075, "%s: \u03b7 = %.2f + %.1fi, F\u2080 = %.2f" % (ch, eta.real, eta.imag, F0), color=col, fontsize=12.5)
    from matplotlib.lines import Line2D
    axs[1].legend(handles=[Line2D([], [], color=C["dark"], label=ex), Line2D([], [], color=C["dark"], ls="--", label=sc)],
                  fontsize=13, loc="lower right")
    axs[1].set_title(label(lang, "gold (conductor)", "金（导体）", "金（導体）"))
    for ax in axs:
        ax.set_xlabel(r"$\theta$ (deg)"); ax.set_ylabel(r"$F$"); ax.set_xlim(0, 90); ax.set_ylim(0, 1.02)
    fig.tight_layout()
    out(fig, f"04-fresnel_{lang}.svg")


# ---------------------------------------------------------------- 9. white furnace (post section 5 code)
@functools.lru_cache(maxsize=None)
def spec_albedo_curve(theta_v, alpha, correlated=True, nt=768, nphi=256):
    theta = (np.arange(nt) + 0.5) * (0.5 * np.pi / nt)
    phi = (np.arange(nphi) + 0.5) * (2.0 * np.pi / nphi)
    T, P = np.meshgrid(theta, phi, indexing="ij")
    dw = np.sin(T) * (0.5 * np.pi / nt) * (2.0 * np.pi / nphi)
    l = sph(T, P)
    v = np.array([np.sin(theta_v), 0.0, np.cos(theta_v)])
    cos_l, cos_v = l[..., 2], np.cos(theta_v)
    h = l + v
    h /= np.linalg.norm(h, axis=-1, keepdims=True)
    D = D_ggx(h[..., 2], alpha)
    G = G2_correlated(cos_l, cos_v, alpha) if correlated else G1(cos_l, alpha) * G1(cos_v, alpha)
    return np.sum(D * G / (4.0 * cos_l * cos_v) * cos_l * dw)


def fig_furnace(lang):
    tv = [float(t) for t in np.radians(np.linspace(0, 85, 35))]
    fig, ax = plt.subplots(figsize=(9, 5.2))
    cols = [C["c"], C["z"], C["a"], C["x"]]
    post = {0.1: (0.988, 0.973, 0.894), 0.3: (0.877, 0.826, 0.850), 0.6: (0.592, 0.634, 0.781), 1.0: (0.307, 0.434, 0.672)}
    for a, col in zip((0.1, 0.3, 0.6, 1.0), cols):
        E = [spec_albedo_curve(t, a) for t in tv]
        ax.plot(np.degrees(tv), E, color=col, label=r"$\alpha=%.1f$" % a)
        ax.plot(np.degrees([0, 1.0, 1.4]), post[a], "o", color=col, ms=7)
    E = [spec_albedo_curve(t, 1.0, correlated=False) for t in tv]
    ax.plot(np.degrees(tv), E, color=C["x"], ls="--", label="\u03b1 = 1.0, " + label(lang, "separable", "可分离", "分離形") + " G\u2082")
    ax.plot([np.degrees(1.4)], [0.525], "o", color=C["x"], ms=7, mfc="white")
    ax.axhline(1.0, color=C["dark"], lw=1.2)
    ax.set_xlabel(r"$\theta_v$ (deg)"); ax.set_ylabel(r"$\int f_{spec}\cos\theta_i\,d\omega_i$  $(F=1)$")
    ax.set_xlim(0, 85); ax.set_ylim(0, 1.05)
    ax.legend(fontsize=12, loc="lower right", ncol=2)
    fig.tight_layout()
    out(fig, f"04-furnace_{lang}.svg")


# ---------------------------------------------------------------- 10. split-sum LUT (post section 7 code)
def lambda_ggx_lut(c, alpha):
    return 0.5 * (-1.0 + np.sqrt(1.0 + alpha**2 * (1.0 - c * c) / (c * c)))


def hammersley(n):
    i = np.arange(n, dtype=np.uint32)
    b = i.copy()
    b = ((b << 16) | (b >> 16)).astype(np.uint32)
    b = (((b & 0x55555555) << 1) | ((b & 0xAAAAAAAA) >> 1)).astype(np.uint32)
    b = (((b & 0x33333333) << 2) | ((b & 0xCCCCCCCC) >> 2)).astype(np.uint32)
    b = (((b & 0x0F0F0F0F) << 4) | ((b & 0xF0F0F0F0) >> 4)).astype(np.uint32)
    b = (((b & 0x00FF00FF) << 8) | ((b & 0xFF00FF00) >> 8)).astype(np.uint32)
    return (i + 0.5) / n, b * 2.3283064365386963e-10


def integrate_brdf(n_dot_v, roughness, n=1024):
    alpha = roughness * roughness
    v = np.array([np.sqrt(1.0 - n_dot_v**2), 0.0, n_dot_v])
    u1, u2 = hammersley(n)
    cos_h = np.sqrt((1.0 - u1) / (1.0 + (alpha**2 - 1.0) * u1))
    sin_h = np.sqrt(1.0 - cos_h**2)
    phi = 2.0 * np.pi * u2
    h = np.stack([sin_h * np.cos(phi), sin_h * np.sin(phi), cos_h], axis=-1)
    v_dot_h = h @ v
    l = 2.0 * v_dot_h[:, None] * h - v
    n_dot_l = l[:, 2]
    ok = n_dot_l > 0.0
    nl, vh, nh = n_dot_l[ok], v_dot_h[ok], cos_h[ok]
    G2 = 1.0 / (1.0 + lambda_ggx_lut(nl, alpha) + lambda_ggx_lut(n_dot_v, alpha))
    w = G2 * vh / (nh * n_dot_v)
    fc = (1.0 - vh) ** 5
    return np.sum((1.0 - fc) * w) / n, np.sum(fc * w) / n


LUT_N = 32
_lut = None


def brdf_lut():
    global _lut
    if _lut is None:
        nv = (np.arange(LUT_N) + 0.5) / LUT_N
        rough = (np.arange(LUT_N) + 0.5) / LUT_N
        _lut = np.array([[integrate_brdf(a, r) for a in nv] for r in rough])   # [rough, nv, 2]
    return _lut


def lut_lookup(nv, rough):
    """Bilinear lookup of (A, B) with texel centres at (i + 0.5) / N, clamped at the border."""
    lut = brdf_lut()
    x = np.clip(nv * LUT_N - 0.5, 0, LUT_N - 1)
    y = np.clip(rough * LUT_N - 0.5, 0, LUT_N - 1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    x1, y1 = np.minimum(x0 + 1, LUT_N - 1), np.minimum(y0 + 1, LUT_N - 1)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    return ((lut[y0, x0] * (1 - fx) + lut[y0, x1] * fx) * (1 - fy) + (lut[y1, x0] * (1 - fx) + lut[y1, x1] * fx) * fy)


def fig_lut():
    lut = brdf_lut()
    fig, axs = plt.subplots(1, 2, figsize=(10.5, 4.5))
    for k, (ax, name) in enumerate(zip(axs, ("A", "B"))):
        im = ax.imshow(lut[..., k], origin="lower", extent=(0, 1, 0, 1), cmap="magma", interpolation="bilinear", vmin=0, vmax=1 if k == 0 else lut[..., 1].max())
        ax.set_xlabel(r"$n\cdot\omega_o$"); ax.set_ylabel(r"$r$ (roughness)")
        ax.set_title(r"$%s(n\cdot\omega_o,\ r)$" % name)
        ax.grid(False)
        fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    out(fig, "04-split-sum-lut.svg")


# ---------------------------------------------------------------- 11. metallic-roughness sphere grid
def shade_sphere(base, metallic, rough, res=150, env=0.18):
    """The post's GLSL fragment shader on an orthographic sphere: one point light + uniform-environment IBL."""
    s = np.linspace(-1, 1, res)
    X, Y = np.meshgrid(s, -s)
    mask = X**2 + Y**2 < 1
    Z = np.sqrt(np.clip(1 - X**2 - Y**2, 0, 1))
    n = np.stack([X, Y, Z], axis=-1)
    v = np.array([0.0, 0.0, 1.0])                   # orthographic camera on +z
    NoV = np.maximum(n @ v, 1e-4)
    a = max(rough * rough, 1e-3)
    F0 = 0.04 * (1 - metallic) + base * metallic
    diffuse = (1 - metallic) * base
    light = np.array([-2.0, 2.5, 3.0]); dist2 = light @ light
    l = light / np.sqrt(dist2)                      # distant-ish light: same direction for every pixel
    I = 2.4 * dist2                                 # so that E = 2.4 * NoL
    h = (v + l) / np.linalg.norm(v + l)
    NoL = np.maximum(n @ l, 0)
    NoH = np.maximum(n @ h, 0)
    VoH = max(v @ h, 0)
    F = F_schlick(VoH, F0)
    spec = (D_ggx(NoH, a) * V_smith(NoV, np.maximum(NoL, 1e-6), a))[..., None] * F
    diff = (1 - F) * diffuse / np.pi
    Lo = (diff + spec) * (I * NoL / dist2)[..., None]
    AB = lut_lookup(NoV, rough)
    Lo = Lo + diffuse * env + env * (F0 * AB[..., :1] + AB[..., 1:])   # uniform environment: prefiltered = env
    col = np.clip(Lo, 0, 1)                                             # exposure 1, clip highlights
    col = np.where(col <= 0.0031308, 12.92 * col, 1.055 * np.power(np.clip(col, 0, 1), 1 / 2.4) - 0.055)
    img = np.ones((res, res, 4)); img[..., :3] = np.clip(col, 0, 1); img[..., 3] = mask
    return img


def fig_spheres():
    base = np.array([0.95, 0.45, 0.12])
    roughs = [0.1, 0.3, 0.5, 0.7, 0.9, 1.0]
    fig, axs = plt.subplots(2, 6, figsize=(10.5, 4.2))
    for i, m in enumerate((0.0, 1.0)):
        for j, r in enumerate(roughs):
            ax = axs[i, j]
            ax.imshow(shade_sphere(base, m, r), interpolation="bilinear")
            ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
            for s in ax.spines.values():
                s.set_visible(False)
            if i == 0:
                ax.set_title(r"$r=%.1f$" % r)
        axs[i, 0].set_ylabel("metallic = %d" % m, fontsize=15)
    fig.tight_layout()
    out(fig, "04-sphere-grid.svg")


def checks():
    th = (np.arange(4000) + 0.5) * (0.5 * np.pi / 4000)
    dth = 0.5 * np.pi / 4000
    for a in (0.2, 0.5):
        for D in (D_ggx, D_beckmann):
            val = np.sum(D(np.cos(th), a) * np.cos(th) * np.sin(th)) * dth * 2 * np.pi
            print(f"  check: int {D.__name__}(alpha={a}) cos dw = {val:.4f}")
    print("  check: furnace alpha=1, theta_v=0:", round(spec_albedo_curve(0.0, 1.0), 3), "(post: 0.307)")
    A, B = integrate_brdf(0.5, 0.5, 4096)
    print(f"  check: LUT r=0.5 n.v=0.5 A={A:.3f} B={B:.3f} (post: 0.834, 0.022)")
    print("  check: gold F0 =", np.round(fresnel_exact(np.ones(3), GOLD), 3))


if __name__ == "__main__":
    checks()
    fig_solid_angle()
    fig_cosine_law()
    fig_rendering_eq()
    print("  microfacet states:", fig_microfacet())
    fig_ndf()
    for lang in LANGS:
        fig_lobes(lang)
        fig_smith(lang)
        fig_fresnel(lang)
        fig_furnace(lang)
    fig_lut()
    fig_spheres()
