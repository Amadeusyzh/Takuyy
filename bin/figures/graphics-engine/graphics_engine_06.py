"""Figures for graphics-engine post 06 (AI meets graphics engines).

The frame-time/latency figure is computed from the simple model stated in the post (the same model
as the frame-budget widget). The texture-compression bars and the world-model charts plot only
numbers reported by the cited sources (see DATA below; "n/s" items are left out). The other
figures are schematics drawn from the post's text.

    python3 bin/figures/graphics-engine/graphics_engine_06.py
"""
import pathlib
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Rectangle  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics-engine"


def out(name, lang=None):
    return OUT / (f"06-{name}_{lang}.svg" if lang else f"06-{name}.svg")


# ---------------------------------------------------------------------------
# 1. The classical-to-neural spectrum (localized: row and column labels are words)
# ---------------------------------------------------------------------------
ROWS = [  # (en, zh, ja, level 0..3 as of Nov 2026, research-level reach 0..3)
    ("upscaling / anti-aliasing", "超分辨率 / 抗锯齿", "アップスケーリング / AA", 2, 2),
    ("frame generation", "帧生成", "フレーム生成", 2, 2),
    ("denoising (ray tracing)", "降噪（光线追踪）", "デノイズ（レイトレ）", 2, 2),
    ("global illumination cache", "全局光照缓存", "GI キャッシュ", 1, 2),
    ("materials / textures", "材质 / 纹理", "マテリアル / テクスチャ", 1, 2),
    ("scene representation", "场景表示", "シーン表現", 1, 3),
    ("asset creation", "资产创建", "アセット制作", 1, 2),
    ("animation / characters", "动画 / 角色", "アニメーション / キャラクター", 1, 2),
    ("NPC behaviour / dialogue", "NPC 行为 / 对话", "NPC の行動 / 会話", 1, 2),
    ("physics / game logic", "物理 / 游戏逻辑", "物理 / ゲームロジック", 0, 3),
]
COLS = {
    "en": ["classical", "ML-assisted", "hybrid (neural\ninside pipeline)", "fully neural"],
    "zh": ["经典", "ML 辅助", "混合（管线内\n神经组件）", "完全神经"],
    "ja": ["従来手法", "ML 支援", "ハイブリッド（パイプ\nライン内のニューラル）", "完全ニューラル"],
}


def fig_spectrum():
    for li, lang in enumerate(LANGS):
        fig, ax = plt.subplots(figsize=(10, 6.6))
        n = len(ROWS)
        for i, row in enumerate(ROWS):
            y = n - 1 - i
            ship, reach = row[3], row[4]
            ax.add_patch(Rectangle((-0.45, y - 0.32), ship + 0.9, 0.64, fc=C["a"], alpha=0.85, ec="none"))
            if reach > ship:
                ax.add_patch(Rectangle((ship + 0.45, y - 0.32), reach - ship, 0.64, fc=C["a"], alpha=0.22,
                                       ec=C["a"], ls="--", lw=1.2))
            ax.text(-0.6, y, row[li], ha="right", va="center", fontsize=13)
        ax.set_xlim(-0.6, 3.6); ax.set_ylim(-0.7, n - 0.3)
        ax.set_xticks(range(4)); ax.set_xticklabels(COLS[lang], fontsize=12)
        ax.xaxis.tick_top(); ax.set_yticks([]); ax.grid(False)
        for s in ("left", "bottom"):
            ax.spines[s].set_visible(False)
        for x in range(5):   # cell boundaries: a bar fills every column up to its level
            ax.axvline(x - 0.5, color=C["gray"], lw=0.6, alpha=0.4)
        ax.set_ylim(-1.15, n - 0.3)
        ax.text(3.55, -0.98, label(lang, en="solid: shipping in games/engines   dashed: research / demos",
                                   zh="实色：已在游戏/引擎中发布   虚线：研究 / 演示",
                                   ja="塗り：ゲーム/エンジンで出荷済み   破線：研究 / デモ"),
                ha="right", fontsize=11.5, color=C["gray"])
        save(fig, out("spectrum", lang))


# ---------------------------------------------------------------------------
# 2. Upscaling + frame generation timeline (schematic, symbols only)
# ---------------------------------------------------------------------------
def fig_pipeline():
    fig, ax = plt.subplots(figsize=(11, 4.6))
    T, k = 25.0, 4                                     # rendered-frame interval (ms), frame-gen factor
    for f in range(3):
        t0 = f * T
        ax.add_patch(Rectangle((t0, 2.6), 15, 0.7, fc=C["z"], alpha=0.8))       # render at low res
        ax.text(t0 + 7.5, 2.95, f"R{f}", ha="center", va="center", color="white", fontsize=13)
        ax.add_patch(Rectangle((t0 + 15, 2.6), 2.5, 0.7, fc=C["b"], alpha=0.9))  # upscaler
        ax.add_patch(Rectangle((t0 + 17.5, 2.6), 4.5, 0.7, fc=C["y"], alpha=0.8))  # frame generation
        if f == 2:      # R2's in-between frames would need R3, which is off the chart
            continue
        for j in range(k):  # display slots: interpolating R_f -> R_f+1 must wait until R_f+1 is done
            td = t0 + T + 22.0 + j * T / k
            col = C["z"] if j == 0 else C["y"]
            ax.add_patch(Rectangle((td, 1.0), T / k - 0.5, 0.7, fc=col, alpha=0.8 if j == 0 else 0.45))
            ax.text(td + T / k / 2, 1.35, f"{f}" if j == 0 else f"{f}+{j}/{k}", ha="center", va="center",
                    fontsize=9)
    ax.annotate("", xy=(T + 22, 0.55), xytext=(0, 0.55),
                arrowprops=dict(arrowstyle="<->", color=C["x"], lw=2))
    ax.annotate("", xy=(22, 0.0), xytext=(0, 0.0),
                arrowprops=dict(arrowstyle="<->", color=C["gray"], lw=1.5))
    ax.text(T + 25, 0.55, "with frame gen: R0 waits until R1 is done (+1 rendered frame)",
            va="center", fontsize=11, color=C["x"])
    ax.text(25, 0.0, "without: R0 shown right after upscaling", va="center", fontsize=11, color=C["gray"])
    ax.text(-1, 2.95, "GPU", ha="right", va="center", fontsize=13)
    ax.text(-1, 1.35, "display", ha="right", va="center", fontsize=13)
    for x, txt, col in [(0, "render (internal res)", C["z"]), (32, "upscale", C["b"]),
                        (52, "generate k-1 frames", C["y"])]:
        ax.add_patch(Rectangle((x, 3.75), 2.5, 0.35, fc=col)); ax.text(x + 3.2, 3.92, txt, va="center", fontsize=12)
    ax.set_xlim(-12, 102); ax.set_ylim(-0.45, 4.3); ax.set_yticks([])
    ax.set_xlabel("time (ms)"); ax.grid(False)
    ax.spines["left"].set_visible(False)
    save(fig, out("upscale-framegen"))


# ---------------------------------------------------------------------------
# 3. Frame time, displayed fps and latency from the post's simple model
# ---------------------------------------------------------------------------
def frame_model(scale, k, t_native=20.0, t_fixed=2.0, t_up=1.0, t_gen=1.0, t_cpu=4.0, refresh=1000.0):
    """Model of the post (same as the widget). Times in ms.
    render = t_fixed + (t_native - t_fixed) * scale^2      (pixel-bound part scales with pixel count)
    gpu    = render + (t_up if scale < 1) + (k - 1) * t_gen (per rendered frame)
    frame  = max(gpu, t_cpu)                               (CPU and GPU run in parallel, pipelined)
    shown fps = min(k * 1000 / frame, refresh)
    latency = t_cpu + gpu + (frame if k > 1 else 0) + 0.5 * (1000 / shown fps)"""
    render = t_fixed + (t_native - t_fixed) * scale ** 2
    gpu = render + (t_up if scale < 0.999 else 0.0) + (k - 1) * t_gen
    frame = max(gpu, t_cpu)
    fps = min(k * 1000.0 / frame, refresh)
    lat = t_cpu + gpu + (frame if k > 1 else 0.0) + 0.5 * 1000.0 / fps
    return 1000.0 / frame, fps, lat


def fig_fps_latency():
    ks = np.arange(1, 7)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 5.0))
    for scale, col in [(1.0, C["dark"]), (0.67, C["z"]), (0.5, C["a"]), (0.33, C["b"])]:
        r = np.array([frame_model(scale, int(k)) for k in ks])
        a1.plot(ks, r[:, 1], "o-", color=col, label=f"scale {scale:.2f}")
        a2.plot(ks, r[:, 2], "o-", color=col, label=f"scale {scale:.2f}")
        print(f"  scale {scale:.2f}: " + "  ".join(f"k={k}: {f:.0f} fps / {l:.1f} ms" for k, (_, f, l) in zip(ks, r)))
    a1.set_xlabel("frame-generation factor $k$"); a1.set_ylabel("displayed fps")
    a2.set_xlabel("frame-generation factor $k$"); a2.set_ylabel("estimated input latency (ms)")
    a1.legend(fontsize=12); a2.legend(fontsize=12)
    a1.set_xticks(ks); a2.set_xticks(ks)
    a1.set_title(r"$t_{native}$ = 20 ms, upscaler 1 ms, 1 ms per generated frame", fontsize=12.5)
    fig.tight_layout()
    save(fig, out("fps-latency"))


# ---------------------------------------------------------------------------
# 4. Neural texture compression: decoding schematic + reported bits per pixel per channel
# ---------------------------------------------------------------------------
def fig_ntc():
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 5.0), gridspec_kw=dict(width_ratios=[1.35, 1]))
    rng = np.random.default_rng(1)
    for lvl, (x0, n, s) in enumerate([(0.0, 8, 0.36), (3.3, 4, 0.36)]):     # two latent grids
        for c in range(3):
            g = rng.normal(size=(n, n))
            a1.imshow(g, extent=(x0 + c * 0.25, x0 + c * 0.25 + n * s, c * 0.25, c * 0.25 + n * s),
                      cmap="viridis", alpha=0.9, zorder=3 - c)
    a1.plot([1.5], [1.6], "o", ms=12, mfc="none", mec=C["x"], mew=3, zorder=10)
    a1.plot([3.95], [1.0], "o", ms=12, mfc="none", mec=C["x"], mew=3, zorder=10)
    a1.text(1.4, -0.45, "latent grid 0", ha="center", fontsize=12)
    a1.text(4.3, -0.45, "latent grid 1", ha="center", fontsize=12)
    a1.add_patch(FancyArrowPatch((5.5, 1.3), (6.5, 1.3), arrowstyle="-|>", mutation_scale=20, lw=2, color=C["dark"]))
    xs = [6.8, 7.6, 8.4, 9.2]
    sizes = [6, 8, 8, 5]
    for x, m in zip(xs, sizes):
        ys = np.linspace(0.2, 2.6, m)
        for xn, mn in zip(xs, sizes):
            pass
        a1.plot([x] * m, ys, "o", color=C["a"], ms=8, zorder=5)
    for x0, m0, x1, m1 in zip(xs[:-1], sizes[:-1], xs[1:], sizes[1:]):
        for y0 in np.linspace(0.2, 2.6, m0):
            for y1 in np.linspace(0.2, 2.6, m1):
                a1.plot([x0, x1], [y0, y1], color=C["gray"], lw=0.4, alpha=0.5)
    a1.text(8.0, 3.0, "tiny MLP (in shader)", ha="center", fontsize=12)
    labels = ["albedo r,g,b", "normal x,y", "roughness", "metal", "AO"]
    for i, t in enumerate(labels):
        a1.text(9.5, 2.5 - i * 0.55, t, fontsize=11, va="center", family="monospace")
    a1.text(0.0, 3.6, "uv  ->  sample latents (bilinear)  ->  decode all channels at once", fontsize=12)
    a1.set_xlim(-0.3, 11.6); a1.set_ylim(-0.8, 3.9); a1.set_aspect("equal"); a1.axis("off")
    # reported numbers (Vaidyanathan et al. 2023): NTC 0.2-1.0 BPPC; their BC-High baseline ~4 BPPC
    a2.barh([1], [4.0], color=C["gray"], height=0.5)
    a2.barh([0], [1.0 - 0.2], left=[0.2], color=C["a"], height=0.5)
    a2.set_yticks([0, 1]); a2.set_yticklabels(["NTC profiles", "BCn ('BC High')"])
    a2.set_xlabel("bits per pixel per channel (BPPC)")
    a2.text(1.05, 0, "0.2 - 1.0", va="center", fontsize=13, color=C["a"])
    a2.text(4.05, 1, "~4", va="center", fontsize=13, color=C["gray"])
    a2.set_xlim(0, 5); a2.set_ylim(-0.6, 1.6)
    fig.tight_layout()
    save(fig, out("neural-textures"))


# ---------------------------------------------------------------------------
# 5. Hybrid mesh + Gaussian-splat frame (schematic)
# ---------------------------------------------------------------------------
def fig_hybrid():
    fig, ax = plt.subplots(figsize=(11, 4.6))
    ax.set_xlim(0, 11); ax.set_ylim(0, 4.6); ax.axis("off")
    boxes = [
        (0.2, 2.8, "mesh pass", "G-buffer + depth Z", C["z"]),
        (0.2, 0.6, "splats: cull + project", "3D Gaussians -> 2D", C["a"]),
        (3.9, 0.6, "sort by depth", "per tile / global", C["a"]),
        (3.9, 2.8, "deferred lighting", "shadows, GI", C["z"]),
        (7.6, 1.7, "composite", "alpha-blend splats\nwhere z_splat < Z", C["b"]),
    ]
    for x, y, t, s, col in boxes:
        ax.add_patch(FancyBboxPatch((x, y), 3.1, 1.25, boxstyle="round,pad=0.03,rounding_size=0.12",
                                    fc="white", ec=col, lw=2.5))
        ax.text(x + 1.55, y + 0.85, t, ha="center", fontsize=13)
        ax.text(x + 1.55, y + 0.38, s, ha="center", fontsize=11, color=col, va="center")
    kw = dict(arrowstyle="-|>", mutation_scale=18, lw=2, color=C["dark"])
    for a, b in [((3.3, 3.42), (3.9, 3.42)), ((3.3, 1.22), (3.9, 1.22)), ((7.0, 3.42), (7.6, 2.6)),
                 ((7.0, 1.22), (7.6, 2.0))]:
        ax.add_patch(FancyArrowPatch(a, b, **kw))
    ax.add_patch(FancyArrowPatch((1.75, 2.8), (1.75, 1.85), arrowstyle="-|>", mutation_scale=16, lw=1.6,
                                 color=C["x"], ls="--"))
    ax.text(1.9, 2.3, "Z for occlusion", fontsize=11, color=C["x"])
    save(fig, out("hybrid-splat-mesh"))


# ---------------------------------------------------------------------------
# 6-7. Neural game engines / interactive world models: verified data only
# ---------------------------------------------------------------------------
# (name, date as year + (month-1)/12, kind) ; kind: p = paper/preprint, b = product/blog announcement
TIMELINE = [
    ("DIAMOND", 2024 + 4 / 12, "p"), ("GameNGen", 2024 + 7 / 12, "p"), ("Oasis", 2024 + 9 / 12, "b"),
    ("Genie 2", 2024 + 11 / 12, "b"), ("Muse / WHAM", 2025 + 1 / 12, "p"), ("Hunyuan-GameCraft", 2025 + 5 / 12, "p"),
    ("Mirage", 2025 + 6 / 12, "b"), ("MirageLSD", 2025 + 6.6 / 12, "b"), ("Genie 3", 2025 + 7 / 12, "b"),
    ("Yan", 2025 + 7.3 / 12, "p"), ("Matrix-Game 2.0", 2025 + 7.6 / 12, "p"), ("Dreamer 4", 2025 + 8 / 12, "p"),
    ("RTFM", 2025 + 9 / 12, "b"), ("Marble", 2025 + 10 / 12, "b"), ("GameCraft-2", 2025 + 10.8 / 12, "p"),
    ("GWM-1", 2025 + 11 / 12, "b"), ("HY-World 1.5", 2025 + 11.4 / 12, "p"), ("Project Genie", 2026 + 0 / 12, "b"),
    ("Waymo World Model", 2026 + 1 / 12, "b"), ("Matrix-Game 3.0", 2026 + 3 / 12, "p"),
    ("Odyssey-2 Max", 2026 + 3.6 / 12, "b"), ("GWM Worlds 2", 2026 + 8 / 12, "b"), ("Genie 4", 2026 + 9.8 / 12, "b"),
]

# (name, vertical resolution, fps) where the source states both
RES_FPS = [("Genie 3", 720, 24), ("Matrix-Game 3.0 (5B, up to)", 720, 40), ("Yan", 1080, 60),
           ("HY-World 1.5", 720, 24), ("GWM Worlds 2", 720, 24)]
FPS_ONLY = [("GameNGen", 20), ("Oasis", 20), ("Matrix-Game 2.0", 25), ("DIAMOND CS:GO", 10)]
# (name, stated horizon in seconds, what the source says)
HORIZON = [("Oasis", 3, "~3 s memory"), ("Genie 2", 60, "up to a minute"), ("Genie 3 (visual memory)", 60, "~1 min back"),
           ("Muse / WHAM", 120, "up to ~2 min generated"), ("GWM-1", 120, "up to 2 min"),
           ("Odyssey-2 Max", 120, "120+ s"), ("Genie 3 (consistency)", 180, "'a few minutes'")]


def fig_timeline():
    fig, ax = plt.subplots(figsize=(17, 6.4))
    ax.axhline(0, color=C["dark"], lw=1.5)
    levels = [1, -1, 2, -2, 3, -3, 4, -4]       # label heights (x 0.6), tried in this order
    right_end = {lv: -1e9 for lv in levels}
    for i, (name, t, kind) in enumerate(sorted(TIMELINE, key=lambda r: r[1])):
        half = 0.0085 * len(name) + 0.02            # half label width in years (fontsize 11, 17 in wide)
        lv = next((l for l in levels if right_end[l] < t - half), levels[-1])
        right_end[lv] = t + half
        y = lv * 0.6
        col = C["z"] if kind == "p" else C["b"]
        ax.plot([t, t], [0, y], color=col, lw=1.2)
        ax.plot(t, 0, "o", color=col, ms=7)
        ax.text(t, y + (0.08 if y > 0 else -0.08), name, ha="center", va="bottom" if y > 0 else "top",
                fontsize=11, color=col)
    for yr in (2024, 2025, 2026):
        ax.axvline(yr, color=C["gray"], lw=0.8, ls=":")
    ax.set_xlim(2024.2, 2027.0); ax.set_ylim(-2.95, 2.95); ax.set_yticks([])
    ax.set_xticks([2024.5, 2025, 2025.5, 2026, 2026.5])
    ax.set_xticklabels(["2024-07", "2025-01", "2025-07", "2026-01", "2026-07"])
    ax.plot([], [], "o", color=C["z"], label="paper / preprint"); ax.plot([], [], "o", color=C["b"], label="product / blog")
    ax.legend(loc="lower left", bbox_to_anchor=(0.0, 1.0), fontsize=11, ncol=2, frameon=False); ax.grid(False)
    ax.spines["left"].set_visible(False)
    save(fig, out("neural-engines-timeline"))


def fig_world_models():
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 5.4), gridspec_kw=dict(width_ratios=[1, 1.15]))
    groups = {}                                         # one label per identical (res, fps) point
    for name, res, fps in RES_FPS:
        groups.setdefault((res, fps), []).append(name)
    for name, fps in FPS_ONLY:
        groups.setdefault((300, fps), []).append(name)
    for (res, fps), names in groups.items():
        a1.plot(res, fps, "o" if res > 300 else "s", color=C["a"] if res > 300 else C["gray"],
                ms=10 if res > 300 else 8)
        dy = -6 if fps in (20, 22) else 6                     # Odyssey (22 fps) below the 24 fps cluster
        a1.annotate("\n".join(names) + f"  ({fps} fps)", (res, fps), textcoords="offset points",
                    xytext=(10, dy), fontsize=10, va="top" if dy < 0 else "bottom")
    a1.axvline(400, color=C["gray"], lw=0.8, ls=":")
    a1.text(300, 66, "res. not stated", ha="center", fontsize=10, color=C["gray"])
    a1.set_xlim(250, 1250); a1.set_ylim(0, 70)
    a1.set_xticks([300, 480, 720, 1080]); a1.set_xticklabels(["n/s", "480p", "720p", "1080p"])
    a1.set_xlabel("output resolution (as stated)"); a1.set_ylabel("frames per second (as stated)")
    names = [h[0] for h in HORIZON]
    a2.barh(range(len(HORIZON)), [h[1] for h in HORIZON], color=C["z"], alpha=0.8)
    for i, h in enumerate(HORIZON):
        a2.text(h[1] * 1.08, i, h[2], va="center", fontsize=10.5)
    a2.set_yticks(range(len(HORIZON))); a2.set_yticklabels(names, fontsize=11)
    a2.set_xscale("log"); a2.set_xlim(1, 3000); a2.set_xlabel("stated memory / consistency horizon (s)")
    fig.tight_layout()
    save(fig, out("world-models"))


# ---------------------------------------------------------------------------
# 8. Engines as data factories (schematic)
# ---------------------------------------------------------------------------
def fig_data_factory():
    fig, ax = plt.subplots(figsize=(11.4, 4.9))
    ax.set_xlim(0, 11.4); ax.set_ylim(0, 4.9); ax.axis("off")
    boxes = [
        (0.1, 2.6, "engine / simulator", "USD scene, physics,\nrandomizers", C["z"]),
        (3.0, 2.6, "render + ground truth", "RGB, depth, seg,\nposes, actions", C["z"]),
        (3.0, 0.4, "generative 'transfer'", "sim render -> photoreal\n(Cosmos-Transfer-style)", C["a"]),
        (6.0, 2.6, "world model", "video / latent\nprediction", C["b"]),
        (6.0, 0.4, "policy (VLA)", "imitation + RL", C["y"]),
        (8.75, 1.5, "real robot", "deploy, log,\nfine-tune", C["x"]),
    ]
    for x, y, t, s, col in boxes:
        ax.add_patch(FancyBboxPatch((x, y), 2.4, 1.4, boxstyle="round,pad=0.03,rounding_size=0.12",
                                    fc="white", ec=col, lw=2.4))
        ax.text(x + 1.2, y + 1.03, t, ha="center", fontsize=12)
        ax.text(x + 1.2, y + 0.45, s, ha="center", va="center", fontsize=10.5, color=col)
    kw = dict(arrowstyle="-|>", mutation_scale=16, lw=1.8, color=C["dark"])
    for a, b in [((2.5, 3.3), (3.0, 3.3)), ((4.2, 2.6), (4.2, 1.8)), ((5.4, 3.3), (6.0, 3.3)), ((5.4, 1.1), (6.0, 1.1)),
                 ((5.4, 3.0), (6.0, 1.4)), ((7.2, 2.6), (7.2, 1.8)), ((8.4, 1.1), (8.75, 1.9))]:
        ax.add_patch(FancyArrowPatch(a, b, **kw))
    ax.plot([9.95, 9.95, 1.3], [2.92, 4.3, 4.3], color=C["gray"], lw=1.4, ls="--")
    ax.add_patch(FancyArrowPatch((1.3, 4.3), (1.3, 4.03), arrowstyle="-|>", mutation_scale=16, lw=1.4,
                                 color=C["gray"]))
    ax.text(5.6, 4.45, "real-to-sim: scans, splats, system identification", ha="center", fontsize=11, color=C["gray"])
    save(fig, out("data-factory"))


if __name__ == "__main__":
    fig_spectrum()
    fig_pipeline()
    fig_fps_latency()
    fig_ntc()
    fig_hybrid()
    fig_timeline()
    fig_world_models()
    fig_data_factory()
