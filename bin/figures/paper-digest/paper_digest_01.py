"""Figures for Paper Digest issue 01 (October - early November 2026).

    python3 bin/figures/paper-digest/paper_digest_01.py

Reads the curated, hand-verified entries in data/01-papers.json and writes
assets/img/blog/paper-digest/01-*.svg:

  01-overview_{en,zh,ja}.svg   entries per category, split by status (accepted / preprint) and open code
  01-cg-matrix.svg             papers x {representation, rendering, geometry, simulation, animation, interaction}
  01-timeline.svg              first-submission dates across the window, one lane per category
  01-form-factor.svg           the radiosity form factor behind RADIANT (entry 19), computed with NumPy
  01-engine-vs-generator.svg   schematic: end-to-end world model vs engine + generative renderer (23, 26)
  01-latent-gaussian-memory.svg  schematic: latent 3D Gaussian memory of L3G-World (28)

The schematics are my own drawings of the ideas, not copies of paper figures. Numbers in the
data-driven figures are counts of this issue's entries, nothing else.

Note: the SVGs committed with issue 01 were hand-written to the same layout because Python was not
available in the authoring session; running this script replaces them with matplotlib output.
"""
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

import numpy as np  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Circle, Ellipse  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / "assets" / "img" / "blog" / "paper-digest"
DATA = json.loads((HERE / "data" / "01-papers.json").read_text(encoding="utf-8"))

CATS = DATA["categories"]  # list of dicts: key, color, en, zh, ja
PAPERS = DATA["papers"]
TAGS = ["representation", "rendering", "geometry", "simulation", "animation", "interaction"]
TAG_SHORT = ["repr.", "render", "geom.", "sim.", "anim.", "interact."]


def day(s):
    return dt.date.fromisoformat(s)


# ---------------------------------------------------------------- 1. overview (localized)
def fig_overview():
    n = len(CATS)
    acc = np.zeros(n, int)
    pre = np.zeros(n, int)
    code = np.zeros(n, int)
    for p in PAPERS:
        (acc if p["status"] == "accepted" else pre)[p["cat"]] += 1
        code[p["cat"]] += 1 if p.get("code") else 0
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(9, 4.6))
        y = np.arange(n)[::-1]
        ax.barh(y, acc, color=C["a"], height=0.62, label=label(lang, "accepted / published", "已录用 / 已发表", "採択・出版済み"))
        ax.barh(y, pre, left=acc, color="#cdbfe3", height=0.62, label=label(lang, "preprint", "预印本", "プレプリント"))
        for yi, k, tot in zip(y, code, acc + pre):
            ax.plot(np.arange(k) + 0.5, np.full(k, yi + 0.42), "v", color=C["dark"], ms=7)
            ax.text(tot + 0.15, yi, str(tot), va="center", fontsize=15)
        ax.plot([], [], "v", color=C["dark"], ms=7, label=label(lang, "open code (one mark each)", "开源代码（每个标记一篇）", "コード公開（1 本につき 1 個）"))
        ax.set_yticks(y)
        ax.set_yticklabels([c[lang] for c in CATS])
        ax.set_xlabel(label(lang, "entries in this issue", "本期条目数", "本号の掲載数"))
        ax.set_xlim(0, max(acc + pre) + 1.2)
        ax.grid(axis="y", visible=False)
        ax.legend(loc="lower right", fontsize=12, frameon=False)
        save(fig, OUT / f"01-overview_{lang}.svg")


# ---------------------------------------------------------------- 2. relation-to-CG matrix
def fig_matrix():
    rows = sorted(PAPERS, key=lambda p: (p["cat"], p["n"]))
    m = len(rows)
    fig, ax = plt.subplots(figsize=(8.6, 0.33 * m + 1.6))
    for i, p in enumerate(rows):
        yi = m - 1 - i
        col = CATS[p["cat"]]["color"]
        ax.axhspan(yi - 0.5, yi + 0.5, color=col, alpha=0.06 if p["cat"] % 2 else 0.12, lw=0)
        for j, t in enumerate(TAGS):
            if t in p["cg"]:
                ax.add_patch(Circle((j, yi), 0.3, color=col))
            else:
                ax.add_patch(Circle((j, yi), 0.06, color="#cccccc"))
    ax.set_xlim(-0.6, len(TAGS) - 0.4)
    ax.set_ylim(-0.6, m - 0.4)
    ax.set_aspect("equal")
    ax.set_xticks(range(len(TAGS)))
    ax.set_xticklabels(TAG_SHORT, fontsize=13)
    ax.xaxis.tick_top()
    ax.set_yticks([m - 1 - i for i in range(m)])
    ax.set_yticklabels([f"{p['n']:02d} {p['short']}" for p in rows], fontsize=11)
    for tl, p in zip(ax.get_yticklabels()[::-1], rows[::-1]):
        tl.set_color(CATS[p["cat"]]["color"])
    totals = [sum(t in p["cg"] for p in rows) for t in TAGS]
    for j, k in enumerate(totals):
        ax.text(j, -1.2, str(k), ha="center", va="center", fontsize=13, color=C["dark"])
    ax.set_ylim(-1.7, m - 0.4)
    ax.grid(False)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(length=0)
    save(fig, OUT / "01-cg-matrix.svg")


# ---------------------------------------------------------------- 3. timeline
def fig_timeline():
    d0, d1 = day(DATA["window"][0]), day(DATA["window"][1])
    fig, ax = plt.subplots(figsize=(10, 4.8))
    groups = {}
    for p in sorted(PAPERS, key=lambda p: p["n"]):
        groups.setdefault((p["cat"], (day(p["date"]) - d0).days), []).append(p)
    for (cat, x), ps in groups.items():
        m = len(ps)
        for k, p in enumerate(ps):
            # papers on the same day in the same lane are stacked vertically, centred on the lane
            yi = len(CATS) - 1 - cat - (k - (m - 1) / 2) * 0.25
            ax.scatter(x, yi, s=120, color=CATS[cat]["color"], edgecolor="white", lw=1.2, zorder=3)
            if m == 1:
                ax.text(x, yi + 0.17, f"{p['n']:02d}", ha="center", va="bottom", fontsize=9, color=C["dark"])
            else:
                ax.text(x + 0.4, yi, f"{p['n']:02d}", ha="left", va="center", fontsize=9, color=C["dark"])
    ax.set_yticks(range(len(CATS)))
    ax.set_yticklabels([c["key"] for c in CATS][::-1])
    for tl, c in zip(ax.get_yticklabels(), CATS[::-1]):
        tl.set_color(c["color"])
        tl.set_fontweight("bold")
    ticks = [d0 + dt.timedelta(days=k) for k in range(0, (d1 - d0).days + 1, 7)]
    ax.set_xticks([(t - d0).days for t in ticks])
    ax.set_xticklabels([f"{t.month}/{t.day}" for t in ticks])
    ax.set_xlim(-1, (d1 - d0).days + 1)
    ax.set_ylim(-0.6, len(CATS) - 0.3)
    ax.grid(axis="y", visible=False)
    save(fig, OUT / "01-timeline.svg")


# ---------------------------------------------------------------- 4. form factor (RADIANT, entry 19)
def form_factor(xi, ni, xj, nj, Aj):
    d = xj - xi
    r2 = d @ d
    w = d / np.sqrt(r2)
    return max(ni @ w, 0.0) * max(nj @ -w, 0.0) * Aj / (np.pi * r2)


def fig_form_factor():
    ni, nj, Aj = np.array([0.0, 0.0, 1.0]), np.array([0.0, 0.0, -1.0]), 0.1
    fig, (a0, a1) = plt.subplots(1, 2, figsize=(10, 4.2), gridspec_kw=dict(width_ratios=[1, 1.15]))
    # left: side view (y horizontal, z up)
    a0.plot([-0.5, 0.5], [0, 0], color=C["z"], lw=7, solid_capstyle="butt")
    a0.plot([1.67, 2.33], [2, 2], color=C["x"], lw=7, solid_capstyle="butt")
    a0.plot([-0.33, 0.33], [2, 2], color=C["gray"], lw=5, ls="--")
    a0.plot([0, 2], [0, 2], color=C["a"], ls="--")
    a0.annotate("", (0, 1.0), (0, 0), arrowprops=dict(arrowstyle="-|>", color=C["dark"], lw=2))
    a0.annotate("", (2, 1.0), (2, 2), arrowprops=dict(arrowstyle="-|>", color=C["dark"], lw=2))
    t = np.linspace(0, np.pi / 4, 20)
    a0.plot(0.5 * np.sin(t), 0.5 * np.cos(t), color=C["b"])
    a0.plot(2 - 0.5 * np.sin(t), 2 - 0.5 * np.cos(t), color=C["b"])
    for x, y, s in [(-0.75, 0.0, "$i$"), (2.45, 2.05, "$j$"), (-0.45, 0.85, "$n_i$"), (2.1, 1.0, "$n_j$"),
                    (0.25, 0.65, r"$\theta_i$"), (1.45, 1.45, r"$\theta_j$"), (1.15, 0.85, "$r$"), (2.45, 1.7, "$A_j=0.1$")]:
        a0.text(x, y, s, fontsize=15)
    a0.set_xlim(-1.2, 3.4)
    a0.set_ylim(-0.4, 2.6)
    a0.set_aspect("equal")
    a0.set_xticks([0, 2])
    a0.set_yticks([])
    a0.set_xlabel("$y$")
    a0.grid(False)
    # right: F as patch j slides along y at height 2
    ys = np.linspace(-4, 4, 401)
    F = [form_factor(np.zeros(3), ni, np.array([0.0, y, 2.0]), nj, Aj) for y in ys]
    a1.plot(ys, F, color=C["a"], lw=3)
    for y in (0.0, 2.0):
        f = form_factor(np.zeros(3), ni, np.array([0.0, y, 2.0]), nj, Aj)
        a1.plot(y, f, "o", color=C["x"], ms=9)
        a1.text(y + 0.2, f + 0.0002, f"{f:.5f}", color=C["x"], fontsize=13)
    a1.set_xlabel("$y$")
    a1.set_title(r"$F_{i\to j}=4A_j/(\pi r^4)$")
    a1.set_ylim(0, 0.0085)
    save(fig, OUT / "01-form-factor.svg")


# ---------------------------------------------------------------- 5. engine vs generator (entries 23, 26)
def box(ax, x, y, w, h, text, fc, ec, fs=18):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.12", fc=fc, ec=ec, lw=2.5))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs)


def arrow(ax, p, q, color=C["dark"], ls="-", rad=0.0):
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle="-|>", mutation_scale=16, color=color, lw=2, ls=ls,
                                 connectionstyle=f"arc3,rad={rad}"))


def fig_engine_vs_generator():
    fig, ax = plt.subplots(figsize=(10, 4.9))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.9)
    ax.axis("off")
    ax.axhline(2.55, color="#dddddd", lw=1.5)
    ax.text(0.1, 4.55, "(a)", fontweight="bold", fontsize=17)
    box(ax, 0.6, 3.3, 1.4, 0.75, r"$x_{\leq t}$", "#eef5fb", C["gray"])
    box(ax, 3.6, 3.2, 1.8, 0.95, r"$G_\theta$", C["fill"], C["a"], 22)
    box(ax, 7.1, 3.3, 1.4, 0.75, r"$x_{t+1}$", "#eef5fb", C["gray"])
    arrow(ax, (2.05, 3.67), (3.55, 3.67))
    arrow(ax, (5.45, 3.67), (7.05, 3.67))
    arrow(ax, (4.5, 4.75), (4.5, 4.2))
    ax.text(4.62, 4.5, "$a_t$", fontsize=16)
    ax.text(4.5, 2.85, r"$s_t=?$", ha="center", color=C["gray"], fontsize=16)
    ax.text(0.1, 2.2, "(b)", fontweight="bold", fontsize=17)
    box(ax, 0.6, 0.75, 2.1, 1.0, r"$s_{t+1}=f(s_t,a_t)$", "#fff3e6", C["b"], 15)
    box(ax, 3.3, 0.8, 1.65, 0.9, r"$r(s_{t+1})$", "#f4f4f4", C["gray"], 16)
    box(ax, 5.55, 0.75, 1.65, 1.0, r"$G_\theta$", C["fill"], C["a"], 22)
    box(ax, 7.8, 0.8, 1.65, 0.9, r"$x_{t+1}$", "#eef5fb", C["gray"], 16)
    arrow(ax, (1.65, 2.45), (1.65, 1.8))
    ax.text(1.77, 2.15, "$a_t$", fontsize=16)
    arrow(ax, (2.75, 1.25), (3.25, 1.25))
    arrow(ax, (5.0, 1.25), (5.5, 1.25))
    arrow(ax, (7.25, 1.25), (7.75, 1.25))
    arrow(ax, (6.375, 0.1), (6.375, 0.7))
    ax.text(6.5, 0.15, r"$x_{\leq t}$", fontsize=15)
    arrow(ax, (2.5, 1.8), (6.1, 1.8), color=C["a"], ls="--", rad=-0.25)
    ax.text(4.3, 2.3, "$s_{t+1}$", color=C["a"], ha="center", fontsize=15)
    save(fig, OUT / "01-engine-vs-generator.svg")


# ---------------------------------------------------------------- 6. latent Gaussian memory (entry 28)
def fig_latent_memory():
    rng = np.random.default_rng(1)
    fig, ax = plt.subplots(figsize=(10, 4.6))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.6)
    ax.axis("off")
    gs = [((1.15, 3.0), 0.95, 0.38, 20, C["z"]), ((2.05, 3.5), 0.66, 0.29, -25, C["y"]),
          ((1.8, 2.4), 1.0, 0.36, -8, C["a"]), ((2.7, 2.85), 0.62, 0.44, 35, C["b"])]
    for (c, w, h, ang, col) in gs:
        ax.add_patch(Ellipse(c, w, h, angle=ang, fc=col, ec=col, alpha=0.5, lw=1.5))
        f = rng.uniform(0.1, 0.3, 4)
        ax.bar(c[0] + w / 2 + 0.08 + 0.09 * np.arange(4), f, width=0.08, bottom=c[1] - 0.3, color=["#444", "#888"] * 2)
    for c, w, h, ang in [((3.3, 3.6), 0.58, 0.27, -15), ((3.35, 2.1), 0.66, 0.29, 10)]:
        ax.add_patch(Ellipse(c, w, h, angle=ang, fill=False, ec=C["y"], lw=2, ls="--"))
    ax.text(0.2, 4.1, r"$G_k=(\mu_k,\Sigma_k,\alpha_k,f_k)$", fontsize=15)
    # latent map z: a 4 x 6 grid of composited features
    z = rng.uniform(0.2, 0.8, (4, 6))
    ax.imshow(z, extent=(4.3, 5.65, 1.95, 2.85), cmap="Purples", vmin=0, vmax=1)
    ax.text(4.97, 3.0, "$z$", ha="center", fontsize=17)
    arrow(ax, (3.75, 2.4), (4.25, 2.4))
    box(ax, 6.3, 1.95, 1.2, 0.9, "DiT", C["fill"], C["a"], 18)
    arrow(ax, (5.7, 2.4), (6.25, 2.4))
    arrow(ax, (6.9, 3.4), (6.9, 2.9))
    ax.text(7.0, 3.2, "$a_t$", fontsize=16)
    for i in range(4):
        ax.add_patch(FancyBboxPatch((8.1 + 0.18 * i, 2.55 - 0.12 * i), 0.8, 0.6, boxstyle="square,pad=0", fc="#dbe9f6", ec=C["gray"]))
    arrow(ax, (7.55, 2.4), (8.05, 2.4))
    ax.text(8.8, 1.6, r"$x_{t+1..t+4}$", ha="center", fontsize=15)
    arrow(ax, (8.8, 1.45), (3.4, 1.85), color=C["y"], rad=-0.35)
    ax.text(6.0, 0.75, "+ / ↻", color=C["y"], ha="center", fontsize=18)
    ax.text(5.0, 0.15, r"$z(p)=\sum_k T_k\,\alpha_k G_k(p)\,f_k$", ha="center", fontsize=17)
    save(fig, OUT / "01-latent-gaussian-memory.svg")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    fig_overview()
    fig_matrix()
    fig_timeline()
    fig_form_factor()
    fig_engine_vs_generator()
    fig_latent_memory()
