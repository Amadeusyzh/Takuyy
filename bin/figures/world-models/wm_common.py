"""Helpers shared by the world-models figure scripts (box-and-arrow diagrams, paths, 2D toy data).

Imported by world_models_0N.py from the same folder. Uses the palette from bin/figures/style.py.
"""
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

import numpy as np  # noqa: E402

# dense point clouds / surfaces are drawn with rasterized=True; render those layers at 200 dpi
plt.rcParams["savefig.dpi"] = 200
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Circle, Ellipse  # noqa: E402,F401

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets" / "img" / "blog" / "world-models"


def out(name):
    return OUT / name


# ---------------------------------------------------------------- diagrams
def mltext(ax, x, y, s, fs=14, color=None, ha="center", zorder=3, bbox=None, lh=1.35):
    """Multi-line text drawn one line per Text object (data units = inches, as in `diagram`).

    Matplotlib's mathtext has no CJK fallback, so a line must never mix CJK words and $math$:
    put them on separate lines. Each line is its own Text, so this is safe."""
    lines = s.split("\n")
    step = fs * lh / 72.0 / getattr(ax, "_wm_scale", 1.0)
    y0 = y + step * (len(lines) - 1) / 2
    for i, line in enumerate(lines):
        ax.text(x, y0 - i * step, line, ha=ha, va="center", fontsize=fs, color=color or C["dark"],
                zorder=zorder, bbox=bbox)


MAX_W = 8.5  # inches; wider diagrams are scaled down so that text stays legible on phones


def diagram(w=10, h=5):
    """A blank axis for box-and-arrow diagrams. Data units are inches before scaling: a diagram wider
    than MAX_W is drawn at scale MAX_W / w (fonts keep their size, so they grow relative to boxes)."""
    sc = min(1.0, MAX_W / w)
    fig, ax = plt.subplots(figsize=(w * sc, h * sc))
    fig.subplots_adjust(0, 0, 1, 1)
    ax._wm_scale = sc
    ax.set_xlim(0, w); ax.set_ylim(0, h)
    ax.set_aspect("equal"); ax.axis("off")
    return fig, ax


def box(ax, x, y, text, w=1.8, h=0.8, fc=None, ec=None, fs=14, round_=True, lw=2.0, tc=None, style=None):
    """Box centred at (x, y). Returns the box geometry for arrow anchoring."""
    fc = fc or C["fill"]; ec = ec or C["a"]
    bs = style or ("round,pad=0.02,rounding_size=0.15" if round_ else "square,pad=0.02")
    p = FancyBboxPatch((x - w / 2, y - h / 2), w, h, boxstyle=bs, fc=fc, ec=ec, lw=lw, zorder=2)
    ax.add_patch(p)
    if text:
        mltext(ax, x, y, text, fs=fs, color=tc)
    return dict(x=x, y=y, w=w, h=h)


def circ(ax, x, y, text, r=0.38, fc="white", ec=None, fs=15, lw=2.0, ls="-"):
    ec = ec or C["a"]
    ax.add_patch(Circle((x, y), r, fc=fc, ec=ec, lw=lw, ls=ls, zorder=2))
    mltext(ax, x, y, text, fs=fs)
    return dict(x=x, y=y, r=r)


def _edge(g, toward):
    """Point on the border of box/circle g in the direction of point `toward`."""
    x, y = g["x"], g["y"]
    dx, dy = toward[0] - x, toward[1] - y
    if dx == 0 and dy == 0:
        return x, y
    if "r" in g:
        n = math.hypot(dx, dy)
        return x + g["r"] * dx / n, y + g["r"] * dy / n
    sx = (g["w"] / 2 + 0.04) / abs(dx) if dx else float("inf")
    sy = (g["h"] / 2 + 0.04) / abs(dy) if dy else float("inf")
    s = min(sx, sy)
    return x + dx * s, y + dy * s


def arrow(ax, a, b, color=None, lw=2.0, ls="-", rad=0.0, text=None, tpos=0.5, toff=(0, 0.18), fs=13,
          tcolor=None, head=14, shrink=0.0):
    """Arrow from node a to node b (dicts from box/circ) or between raw points (tuples)."""
    pa = (a["x"], a["y"]) if isinstance(a, dict) else a
    pb = (b["x"], b["y"]) if isinstance(b, dict) else b
    s = _edge(a, pb) if isinstance(a, dict) else pa
    e = _edge(b, pa) if isinstance(b, dict) else pb
    color = color or C["dark"]
    ar = FancyArrowPatch(s, e, arrowstyle="-|>", mutation_scale=head, color=color, lw=lw, ls=ls,
                         connectionstyle=f"arc3,rad={rad}", zorder=1, shrinkA=shrink, shrinkB=shrink)
    ax.add_patch(ar)
    if text:
        mx, my = s[0] + (e[0] - s[0]) * tpos, s[1] + (e[1] - s[1]) * tpos
        mltext(ax, mx + toff[0], my + toff[1], text, fs=fs, color=tcolor or color, zorder=4,
               bbox=dict(fc="white", ec="none", pad=0.5, alpha=0.85))
    return ar


# ---------------------------------------------------------------- 2D toy data (post 02 / 04 code)
ANG8 = np.arange(8) * (2 * np.pi / 8)
CENTERS8 = 2.0 * np.stack([np.cos(ANG8), np.sin(ANG8)], 1)
STD8 = 0.1


def sample8(n, rng):
    k = rng.integers(0, 8, n)
    return CENTERS8[k] + STD8 * rng.standard_normal((n, 2)), k


def ddpm_schedule(T=1000):
    betas = np.linspace(1e-4, 0.02, T)
    alphas = 1 - betas
    return betas, alphas, np.cumprod(alphas)


def mix_score(x, ab, centers=CENTERS8, std=STD8, weights=None, return_post=False):
    """Exact score of the noised mixture q(x_t) = sum_k w_k N(sqrt(ab) mu_k, (ab std^2 + 1 - ab) I)."""
    var = ab * std ** 2 + (1 - ab)
    mu = np.sqrt(ab) * centers
    d = x[:, None, :] - mu[None]
    logw = -0.5 * (d ** 2).sum(-1) / var
    if weights is not None:
        logw = logw + np.log(weights)[None]
    logw -= logw.max(1, keepdims=True)
    w = np.exp(logw); w /= w.sum(1, keepdims=True)
    s = -(w[..., None] * d).sum(1) / var
    return (s, w) if return_post else s
