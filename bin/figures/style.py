"""Shared matplotlib style for blog figures (import from the per-series scripts).

    import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
    from style import *

Figures are drawn on a white background and saved as SVG with text converted to paths, so
they look identical everywhere (no font dependency on the reader's machine). Keep labels
language-neutral (math symbols, numbers, short code-like names). If a figure needs real words,
call `for lang in LANGS:` and save `name_{lang}.svg` with `label(lang, en=..., zh=..., ja=...)`.
"""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

LANGS = ("en", "zh", "ja")

# Palette: colour-blind-friendly, readable on white, consistent across all series.
C = dict(
    x="#d62728",  # x axis / red
    y="#2ca02c",  # y axis / green
    z="#1f77b4",  # z axis / blue
    a="#9467bd",  # primary vector / purple (site accent)
    b="#ff7f0e",  # secondary vector / orange
    c="#17becf",  # tertiary / cyan
    light="#f2b134",  # light / energy / yellow
    gray="#7f7f7f",
    dark="#222222",
    fill="#e8e0f5",
)

_cjk = None
for name in ("Noto Sans CJK SC", "Noto Sans CJK JP", "Noto Sans SC", "WenQuanYi Zen Hei", "IPAGothic"):
    if any(f.name == name for f in font_manager.fontManager.ttflist):
        _cjk = name
        break

plt.rcParams.update(
    {
        "figure.dpi": 100,
        "savefig.bbox": "tight",
        "savefig.pad_inches": 0.15,
        "savefig.facecolor": "white",
        "svg.fonttype": "path",
        "font.size": 15,  # large enough to stay legible on phones
        "axes.titlesize": 16,
        "axes.labelsize": 15,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.alpha": 0.25,
        "lines.linewidth": 2.2,
        "mathtext.fontset": "cm",
        "font.family": ["DejaVu Sans"] + ([_cjk] if _cjk else []),
    }
)


def label(lang, en, zh=None, ja=None):
    """Pick the label for a language (falls back to English)."""
    return {"en": en, "zh": zh or en, "ja": ja or en}[lang]


def save(fig, path):
    """Save as SVG (or PNG if the path ends in .png) and close."""
    import pathlib

    pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    print("wrote", path)


def arrow3d(ax, start, vec, color, lw=2.5, label_text=None, **kw):
    """Draw a 3D arrow on an mplot3d axis."""
    ax.quiver(*start, *vec, color=color, linewidth=lw, arrow_length_ratio=0.12, **kw)
    if label_text:
        end = [s + v * 1.08 for s, v in zip(start, vec)]
        ax.text(*end, label_text, color=color, fontsize=16)


def axes3d(ax, lim=1.2, labels=("x", "y", "z")):
    """Clean 3D axes with coloured basis arrows and equal aspect."""
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_zlim(-lim, lim)
    ax.set_box_aspect((1, 1, 1))
    for i, (c, l) in enumerate(zip((C["x"], C["y"], C["z"]), labels)):
        v = [0, 0, 0]; v[i] = lim * 0.9
        arrow3d(ax, (0, 0, 0), v, c, lw=1.6, label_text=f"${l}$")
    ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
