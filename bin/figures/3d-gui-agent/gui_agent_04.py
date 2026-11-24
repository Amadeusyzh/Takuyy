"""Figures for 3D GUI Agent post 04: "AI agents in XR: the closest work, the platforms, and the gap".

    python3 bin/figures/3d-gui-agent/gui_agent_04.py

Writes assets/img/blog/3d-gui-agent/04-<name>_{en,zh,ja}.svg:

  04-map          map of the area: eight neighbouring lines of work around the 3D GUI agent
  04-timeline     papers, infrastructure and products, 2023 to November 2026, in three lanes
  04-capability   heat map: closest works x {perceive 3D UI, NL intent, operate, evaluated}
  04-pieces       the numbers of the pieces: Orienter, ComboBench, SIAgent, Embodied Web Agents
  04-latency      seconds per agent decision (log scale) against interactive time budgets
  04-loop         the agent loop with each closest work placed on the stages it covers
  04-channels     observation / action layers of an XR device and which agent levels reach them
  04-feasibility  the platform feasibility matrix (observe, structure, inject, automate, emulate)
  04-datasets     XR datasets vs 2D GUI agent datasets: size and contents
  04-gap          three-set diagram (perceive / NL intent / operate) with the empty centre

All numbers come from the column's research dossiers (docs/research/3d-gui-agent/03 and 04),
which cite the primary sources; the post repeats every number with its source. The ratings in
04-capability are the author's reading of those sources with the rubric stated in the post.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

import numpy as np  # noqa: E402
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Circle, Rectangle  # noqa: E402
from matplotlib.colors import to_rgb  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets" / "img" / "blog" / "3d-gui-agent"

LIGHT = "#f4f4f4"


def L(lang, en, zh, ja):
    return label(lang, en=en, zh=zh, ja=ja)


def box(ax, x, y, w, h, text, fc, ec, fs=12, tc="#222222", lw=1.6, ls="-", weight="normal", ha="center"):
    p = FancyBboxPatch((x - w / 2, y - h / 2), w, h, boxstyle="round,pad=0.02,rounding_size=0.08",
                       fc=fc, ec=ec, lw=lw, ls=ls)
    ax.add_patch(p)
    tx = x if ha == "center" else x - w / 2 + 0.12
    ax.text(tx, y, text, ha=ha, va="center", fontsize=fs, color=tc, weight=weight, linespacing=1.3)
    return p


def arrow(ax, p0, p1, color="#555555", lw=1.8, style="-|>", ls="-", rad=0.0, ms=14):
    a = FancyArrowPatch(p0, p1, arrowstyle=style, color=color, lw=lw, ls=ls, mutation_scale=ms,
                        connectionstyle=f"arc3,rad={rad}", shrinkA=2, shrinkB=2)
    ax.add_patch(a)


def blank(ax):
    ax.set_axis_off()
    ax.grid(False)


def tint(col, a):
    r, g, b = to_rgb(col)
    return (1 - a + a * r, 1 - a + a * g, 1 - a + a * b)


# ------------------------------------------------------------------------ 1. map of the area
def fig_map():
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(13, 8.2))
        blank(ax)
        ax.set_xlim(-0.3, 12.3)
        ax.set_ylim(0, 8.2)
        centre = (6, 4.1)
        box(ax, *centre, 4.1, 1.6,
            L(lang, "3D GUI agent\nperceive the 3D UI + understand intent\n+ operate or guide",
              "3D GUI 智能体\n感知 3D 界面 + 理解意图\n+ 代为操作或引导",
              "3D GUI エージェント\n3D UI の知覚 + 意図理解\n+ 代行操作またはガイド"),
            fc=C["fill"], ec=C["a"], fs=13, lw=2.6, weight="bold")
        # (x, y, colour, title, examples, contribution, arrow style)
        nodes = [
            (2.0, 7.2, C["a"],
             L(lang, "A. XR-UI grounding & operation", "A. XR 界面定位与操作", "A. XR UI の接地と操作"),
             "Orienter, ComboBench, NavAI,\nSIAgent, Put-That-There, DuoZone",
             L(lang, "pieces of the loop", "闭环的各个片段", "ループの部品"), "-"),
            (6.0, 7.45, C["b"],
             L(lang, "B. LLMs build / edit XR worlds", "B. LLM 生成 / 编辑 XR 世界", "B. LLM による XR 世界の生成・編集"),
             "LLMR, LLMER, VRCopilot,\nXR Blocks, GenXR-Bench",
             L(lang, "edits the world, not the UI", "改世界，不操作界面", "世界を編集、UI は操作しない"), "--"),
            (10.0, 7.2, C["c"],
             L(lang, "C. XR assistants answer / guide", "C. 回答 / 引导型 XR 助手", "C. 回答・ガイド型 XR アシスタント"),
             "GazePointAR, EmBARDiment,\nSatori, Sensible Agent",
             L(lang, "answers or guides only", "只回答或引导", "回答・ガイドのみ"), "--"),
            (10.35, 4.1, C["z"],
             L(lang, "D. Automated XR app testing", "D. XR 应用自动化测试", "D. XR アプリの自動テスト"),
             "VRExplorer, XRintTest,\nAUTOVR, ExploreAI, VRScout",
             L(lang, "perceive + act, no intent", "能感知与操作，无用户意图", "知覚+操作、意図なし"), "-"),
            (10.0, 1.0, C["y"],
             L(lang, "E. Agents acting in 3D from pixels", "E. 从像素在 3D 中行动的智能体", "E. 画素から 3D で行動するエージェント"),
             "SIMA 1/2, Cradle, Lumine,\nGame-TARS, Embodied Web Agents",
             L(lang, "3D action from pixels", "从像素到 3D 动作", "画素から 3D 行動"), "-"),
            (6.0, 0.75, C["x"],
             L(lang, "F. Headset / glasses assistants", "F. 头显 / 眼镜助手", "F. ヘッドセット・グラス上のアシスタント"),
             "Gemini on Galaxy XR, Siri (visionOS 27),\nMeta AI / Muse, VisionClaw",
             L(lang, "deployed, little UI action", "已部署，界面操作有限", "製品化、UI 操作は限定的"), "-"),
            (2.0, 1.0, C["gray"],
             L(lang, "G. 3D & spatial understanding", "G. 3D 与空间理解", "G. 3D・空間理解"),
             "3D-LLM, LEO, SpatialVLM,\nVSI-Bench, ConceptGraphs",
             L(lang, "grounding in space", "空间中的定位", "空間での接地"), "-"),
            (1.65, 4.1, C["light"],
             L(lang, "H. Agent infrastructure for XR", "H. 面向 XR 的智能体基础设施", "H. XR 向けエージェント基盤"),
             "Meta XR Operator (MCP),\nIWSDK MCP, XARP Tools",
             L(lang, "the action channel", "动作通道", "行動チャネル"), "-"),
        ]
        for x, y, col, title, ex, contrib, ls in nodes:
            w, h = 3.75, 1.15
            box(ax, x, y, w, h, "", fc=tint(col, 0.12), ec=col, lw=2.0)
            ax.text(x, y + 0.27, title, ha="center", va="center", fontsize=12.5, weight="bold", color="#222")
            ax.text(x, y - 0.2, ex, ha="center", va="center", fontsize=10.5, color="#333", linespacing=1.25)
            # arrow from node edge to centre box edge
            v = np.array(centre) - np.array([x, y])
            d = v / np.linalg.norm(v)
            # start on node border, end on centre border (ellipse-ish approximations)
            s = np.array([x, y]) + d * np.array([w / 2 * 0.9 if abs(d[0]) > 0.6 else w / 4, h / 2 + 0.05])
            horiz = abs(d[1]) < 0.05
            if horiz:
                s = np.array([x + np.sign(d[0]) * w / 2, y])
                e = np.array([centre[0] - np.sign(d[0]) * 2.05, y])
            else:
                e = np.array(centre) - d * np.array([1.6 if abs(d[0]) > 0.6 else 0.9, 0.85])
            arrow(ax, tuple(s), tuple(e), color=col, lw=2.0, ls=ls)
            m = np.array([x, y - 0.85]) if horiz else (s + e) / 2
            ax.text(m[0], m[1], contrib, ha="center", va="center", fontsize=10, color=col,
                    bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.9))
        save(fig, OUT / f"04-map_{lang}.svg")


# ------------------------------------------------------------------------ 2. timeline
TIMELINE = {
    # lane 0: research (first arXiv submission or publication month)
    0: [("LLMR", 2023.70), ("Voice2Action", 2023.75), ("SIMA", 2024.21), ("GazePointAR", 2024.29),
        ("EmBARDiment", 2024.62), ("Orienter", 2024.71), ("Satori", 2024.79),
        ("Embodied Web Agents", 2025.46), ("VRSight", 2025.62), ("Sensible Agent", 2025.71),
        ("ComboBench", 2025.79), ("Put-That-There", 2025.87), ("DuoZone", 2025.88), ("SIMA 2", 2025.96),
        ("NavAI", 2026.04), ("XRintTest", 2026.05), ("SIAgent", 2026.21), ("VisionClaw", 2026.29),
        ("ExploreAI", 2026.62), ("GenXR-Bench", 2026.79)],
    # lane 1: infrastructure and tools
    1: [("OpenXR 1.1", 2024.29), ("IWER", 2024.54), ("XARP Tools", 2025.62), ("XR Blocks", 2025.71),
        ("IWSDK MCP", 2026.20), ("Meta XR Operator", 2026.62), ("Jetpack XR + emulator stable", 2026.85)],
    # lane 2: products
    2: [("Ray-Ban Display", 2025.71), ("Galaxy XR + Gemini", 2025.80),
        ("Gemini UI automation (phones)", 2026.12), ("Siri AI (WWDC26)", 2026.44),
        ("Meta VR Glasses / Muse", 2026.73), ("XREAL AURA", 2026.82)],
}


def _levels(items, char_w=0.036, pad=0.04):
    """Greedy: put each label (sorted by time) on the lowest level where it does not overlap."""
    ends = []
    out = []
    for name, t in sorted(items, key=lambda it: it[1]):
        half = len(name) * char_w / 2 + pad
        for lv, e in enumerate(ends):
            if t - half > e:
                ends[lv] = t + half
                out.append((name, t, lv))
                break
        else:
            ends.append(t + half)
            out.append((name, t, len(ends) - 1))
    return out, len(ends)


def fig_timeline():
    lanes_col = [C["a"], C["light"], C["x"]]
    step = 0.42
    for lang in LANGS:
        lane_names = [L(lang, "research", "研究", "研究"),
                      L(lang, "infrastructure", "基础设施", "基盤・ツール"),
                      L(lang, "products", "产品", "製品")]
        placed = {k: _levels(v) for k, v in TIMELINE.items()}
        base = {}
        y = 0.3
        for lane in (2, 1, 0):
            base[lane] = y
            y += (placed[lane][1] + 1) * step + 0.55
        top = y
        fig, ax = plt.subplots(figsize=(13, 0.9 * top + 0.8))
        for lane in (0, 1, 2):
            items, nlev = placed[lane]
            y0 = base[lane]
            col = lanes_col[lane]
            ax.axhspan(y0 - 0.2, y0 + (nlev + 0.9) * step, color=col, alpha=0.07, lw=0)
            ax.text(2022.93, y0 + 0.05, lane_names[lane], ha="left", va="bottom", fontsize=14, weight="bold",
                    color=col if lane != 1 else "#b07d10")
            ax.plot([2023.5, 2027.0], [y0, y0], color=col, lw=1.2, alpha=0.6)
            for name, t, lv in items:
                h = (lv + 1) * step
                ax.plot([t, t], [y0, y0 + h], color=col, lw=1.0, alpha=0.7)
                ax.plot(t, y0, "o", color=col, ms=7, zorder=3)
                ax.text(t, y0 + h, name, ha="center", va="center", fontsize=10, color="#222",
                        bbox=dict(boxstyle="round,pad=0.15", fc="white", ec=col, lw=0.8))
        for yr in range(2024, 2027):
            ax.axvline(yr, color="#999", lw=0.8, ls=":")
        ax.axvline(2026.9, color=C["dark"], lw=1.4, ls="--")
        ax.text(2026.88, top - 0.1, L(lang, "Nov 2026", "2026 年 11 月", "2026 年 11 月"), ha="right", va="top",
                fontsize=11, color=C["dark"])
        ax.set_xlim(2022.9, 2027.2)
        ax.set_ylim(0.0, top)
        ax.set_xticks([2023.5, 2024, 2024.5, 2025, 2025.5, 2026, 2026.5])
        ax.set_xticklabels(["2023-07", "2024", "2024-07", "2025", "2025-07", "2026", "2026-07"])
        ax.set_yticks([])
        ax.spines["left"].set_visible(False)
        ax.grid(False)
        save(fig, OUT / f"04-timeline_{lang}.svg")


# ------------------------------------------------------------------------ 3. capability heat map
# P: perceive the 3D UI of existing XR apps; I: understand a natural-language user intent;
# O: operate (2) / act partly or guide (1); E: evaluated with numbers (2) / preliminary (1).
CAP = [
    # name, category letter, P, I, O, E, note (shown in the last column)
    ("Orienter (FSE 2026)", "A", 2, 0, 1, 2, "IGE F1 44%"),
    ("ComboBench", "A", 0, 2, 1, 2, "11.7% exact"),
    ("NavAI", "A", 1, 2, 1, 2, "16/18, 49 s/turn"),
    ("SIAgent", "A", 1, 1, 2, 2, "97.2% intent"),
    ("Put-That-There LLM", "A", 1, 2, 2, 0, "no study yet"),
    ("DuoZone (TVCG 2026)", "A", 1, 2, 2, 2, "N=16, 34.5% faster"),
    ("Voice2Action", "A", 1, 2, 2, 1, "synthetic data"),
    ("LLMR (CHI 2024)", "B", 1, 2, 1, 2, "builds content"),
    ("EmBARDiment", "C", 1, 2, 0, 1, "answers"),
    ("GazePointAR", "C", 0, 2, 0, 1, "answers"),
    ("Satori", "C", 0, 1, 1, 2, "guides, N=16"),
    ("Sensible Agent", "C", 0, 1, 1, 1, "asks, N=10"),
    ("VRExplorer", "D", 1, 0, 2, 2, "coverage"),
    ("XRintTest", "D", 1, 0, 2, 2, "93% of 456"),
    ("AUTOVR", "D", 1, 0, 2, 2, "366 Quest apps"),
    ("VRSight / DISCOVR", "D", 2, 0, 0, 2, "describes"),
    ("SIMA 2", "E", 1, 2, 1, 2, "3D games"),
    ("Embodied Web Agents", "E", 1, 2, 1, 2, "not XR"),
    ("VisionClaw", "F", 0, 2, 1, 2, "acts via services"),
    ("Gemini on Galaxy XR", "F", 1, 2, 2, 0, "claimed, undisclosed"),
    ("Siri AI, visionOS 27", "F", 1, 2, 1, 0, "App Intents only"),
    ("Meta XR Operator", "H", 2, 1, 2, 0, "dev tool, no eval"),
    ("GenXR-Bench actors", "H", 1, 1, 2, 1, "own apps, tests"),
]
CAT_COL = {"A": C["a"], "B": C["b"], "C": C["c"], "D": C["z"], "E": C["y"], "F": C["x"], "H": "#b07d10"}


def fig_capability():
    cmap = ["#f3f3f3", "#c9b8e6", "#6a3d9a"]
    n = len(CAP)
    for lang in LANGS:
        cols = [L(lang, "perceive\n3D UI", "感知\n3D 界面", "3D UI の\n知覚"),
                L(lang, "NL\nintent", "自然语言\n意图", "自然言語\nの意図"),
                L(lang, "operate\n/ guide", "操作\n/ 引导", "操作\n/ ガイド"),
                L(lang, "evaluated", "有评测", "評価")]
        fig, ax = plt.subplots(figsize=(10.5, 0.42 * (n + 2) + 1.4))
        blank(ax)
        x0 = 4.2
        for i, (name, cat, *vals, note) in enumerate(CAP):
            y = n - i
            ax.text(x0 - 0.15, y, name, ha="right", va="center", fontsize=12, color=CAT_COL[cat])
            for j, v in enumerate(vals):
                ax.add_patch(Rectangle((x0 + j * 1.15, y - 0.42), 1.1, 0.84, fc=cmap[v], ec="white", lw=1))
                ax.text(x0 + j * 1.15 + 0.55, y, "●" if v == 2 else ("◐" if v == 1 else ""), ha="center",
                        va="center", fontsize=12, color="white" if v == 2 else "#5b3f8c")
            ax.text(x0 + 4 * 1.15 + 0.15, y, note, ha="left", va="center", fontsize=10.5, color="#444")
        # target row
        y = 0
        ax.text(x0 - 0.15, y, L(lang, "3D GUI agent (target)", "3D GUI 智能体（目标）", "3D GUI エージェント（目標）"),
                ha="right", va="center", fontsize=12.5, weight="bold", color=C["dark"])
        for j in range(4):
            ax.add_patch(Rectangle((x0 + j * 1.15, y - 0.42), 1.1, 0.84, fc="white", ec=C["a"], lw=2.2, ls="--"))
            ax.text(x0 + j * 1.15 + 0.55, y, "●", ha="center", va="center", fontsize=12, color=C["a"])
        ax.text(x0 + 4 * 1.15 + 0.15, y, L(lang, "no work has all four", "尚无工作四项齐备", "4 つを満たす研究はまだない"),
                ha="left", va="center", fontsize=10.5, color=C["a"], weight="bold")
        ax.plot([0.2, x0 + 7.4], [0.55, 0.55], color="#999", lw=0.8)
        for j, c in enumerate(cols):
            ax.text(x0 + j * 1.15 + 0.55, n + 0.75, c, ha="center", va="bottom", fontsize=11.5, linespacing=1.15)
        ax.set_xlim(0.2, x0 + 7.6)
        ax.set_ylim(-0.7, n + 2.0)
        # legend
        lx = 0.3
        ly = n + 1.55
        for v, t in ((2, L(lang, "full", "完整", "完全")), (1, L(lang, "partial", "部分", "部分的")),
                     (0, L(lang, "none", "无", "なし"))):
            ax.add_patch(Rectangle((lx, ly - 0.2), 0.4, 0.4, fc=cmap[v], ec="#aaa", lw=0.6))
            ax.text(lx + 0.5, ly, t, va="center", fontsize=11)
            lx += 1.15
        save(fig, OUT / f"04-capability_{lang}.svg")


# ------------------------------------------------------------------------ 4. the numbers of the pieces
def fig_pieces():
    for lang in LANGS:
        fig, axs = plt.subplots(2, 2, figsize=(12.5, 8.6))
        # (a) Orienter: interactability F1 at IoU 0.75 (app split)
        ax = axs[0, 0]
        names = ["Orienter\n(Gemini 1.5 Pro)", "Faster R-CNN\n(trained)", "OmniParser"]
        vals = [44.10, 32.69, 2.21]
        ax.bar(range(3), vals, color=[C["a"], C["gray"], C["gray"]], width=0.6)
        for k, v in enumerate(vals):
            ax.text(k, v + 1, f"{v:.1f}", ha="center", fontsize=13)
        ax.set_xticks(range(3))
        ax.set_xticklabels(names, fontsize=11.5)
        ax.set_ylim(0, 55)
        ax.set_ylabel("F1 (%)")
        ax.set_title(L(lang, "(a) perceive: interactable elements in VR frames\nF1 at IoU 0.75 (Orienter, FSE 2026)",
                       "(a) 感知：VR 画面中的可交互元素\nIoU 0.75 下的 F1（Orienter，FSE 2026）",
                       "(a) 知覚：VR 画面の操作可能要素\nIoU 0.75 での F1（Orienter、FSE 2026）"), fontsize=13)
        ax.grid(axis="x", visible=False)
        # (b) ComboBench: exact sequence match
        ax = axs[0, 1]
        names = ["Gemini-1.5-Pro\n5-shot", "GPT-4o", "GPT-4", L(lang, "best\nzero-shot", "最佳\n零样本", "最良\nゼロショット")]
        vals = [11.7, 10.9, 8.8, 5.8]
        ax.bar(range(4), vals, color=[C["b"], C["b"], C["b"], tint(C["b"], 0.45)], width=0.6)
        for k, v in enumerate(vals):
            ax.text(k, v + 0.4, f"{v:.1f}", ha="center", fontsize=13)
        ax.set_xticks(range(4))
        ax.set_xticklabels(names, fontsize=11.5)
        ax.set_ylim(0, 100)
        ax.set_ylabel(L(lang, "exact sequence match (%)", "完全匹配的序列 (%)", "系列の完全一致 (%)"))
        ax.set_title(L(lang, "(b) act: semantic action to controller/HMD steps\n262 VR game scenarios (ComboBench)",
                       "(b) 行动：语义动作 → 手柄/头显操作序列\n262 个 VR 游戏场景（ComboBench）",
                       "(b) 行動：意味的行動 → コントローラ/HMD 操作列\nVR ゲーム 262 シナリオ（ComboBench）"), fontsize=13)
        ax.grid(axis="x", visible=False)
        # (c) SIAgent top-1 intent accuracy by LLM, plus gaze-only vs gaze+hand
        ax = axs[1, 0]
        names = ["GLM-4", "GPT-4o", "GPT-3.5", L(lang, "gaze\nonly", "仅注视", "視線\nのみ"),
                 L(lang, "gaze\n+ hand", "注视\n+ 手", "視線\n+ 手")]
        vals = [83.3, 72.2, 46.3, 30.2, 58.3]
        ax.bar(range(5), vals, color=[C["c"]] * 3 + [tint(C["c"], 0.45), tint(C["c"], 0.75)], width=0.6)
        for k, v in enumerate(vals):
            ax.text(k, v + 1.2, f"{v:.1f}", ha="center", fontsize=13)
        ax.axvline(2.5, color="#999", lw=1, ls=":")
        ax.set_xticks(range(5))
        ax.set_xticklabels(names, fontsize=11.5)
        ax.set_ylim(0, 100)
        ax.set_ylabel(L(lang, "top-1 intent accuracy (%)", "Top-1 意图准确率 (%)", "Top-1 意図正解率 (%)"))
        ax.set_title(L(lang, "(c) intent: from eye-hand motion in VR\n(SIAgent, preprint 2026)",
                       "(c) 意图：从 VR 中的眼手运动推断\n（SIAgent，2026 年预印本）",
                       "(c) 意図：VR での目と手の動きから推定\n（SIAgent、2026 年プレプリント）"), fontsize=13)
        ax.grid(axis="x", visible=False)
        # (d) Embodied Web Agents: best model vs human
        ax = axs[1, 1]
        tasks = [L(lang, "navigation", "导航", "ナビゲーション"), L(lang, "shopping", "购物", "買い物"),
                 L(lang, "traveling", "旅行", "旅行"), L(lang, "cooking", "烹饪", "料理")]
        best = [34.72, 25.46, 30.91, 6.4]
        hum = [90.28, 92.59, 91.82, 77.08]
        xx = np.arange(4)
        ax.bar(xx - 0.18, best, 0.36, color=C["y"], label=L(lang, "best model", "最佳模型", "最良モデル"))
        ax.bar(xx + 0.18, hum, 0.36, color="#bbbbbb", label=L(lang, "human", "人类", "人間"))
        for k in range(4):
            ax.text(xx[k] - 0.18, best[k] + 1.2, f"{best[k]:.0f}", ha="center", fontsize=12)
            ax.text(xx[k] + 0.18, hum[k] + 1.2, f"{hum[k]:.0f}", ha="center", fontsize=12)
        ax.set_xticks(xx)
        ax.set_xticklabels(tasks, fontsize=11.5)
        ax.set_ylim(0, 110)
        ax.set_ylabel(L(lang, "success (%)", "成功率 (%)", "成功率 (%)"))
        ax.legend(loc="upper right", fontsize=11, frameon=False, ncol=2)
        ax.set_title(L(lang, "(d) 3D world + 2D panels in one task\n(Embodied Web Agents, NeurIPS 2025 D&B)",
                       "(d) 同一任务中的 3D 世界 + 2D 面板\n（Embodied Web Agents，NeurIPS 2025 D&B）",
                       "(d) 1 タスク内の 3D 世界 + 2D パネル\n（Embodied Web Agents、NeurIPS 2025 D&B）"), fontsize=13)
        ax.grid(axis="x", visible=False)
        fig.tight_layout(h_pad=2.2)
        save(fig, OUT / f"04-pieces_{lang}.svg")


# ------------------------------------------------------------------------ 5. latency
def fig_latency():
    # (label, low, high, colour, kind)  seconds per decision
    for lang in LANGS:
        rows = [
            ("Lumine " + L(lang, "(first action, no / with reasoning)", "（首个动作，无 / 有推理）", "（最初の行動、推論なし / あり）"),
             0.114, 0.234, C["y"]),
            ("Satori " + L(lang, "(per guidance step)", "（每个引导步骤）", "（ガイド 1 ステップ）"), 2.0, 3.0, C["c"]),
            ("DuoZone " + L(lang, "(per layout request)", "（每次布局请求）", "（レイアウト要求 1 回）"), 4.0, 4.0, C["a"]),
            ("SIAgent " + L(lang, "(LLM time per intent)", "（每次意图的 LLM 时间）", "（意図 1 回の LLM 時間）"), 9.1, 9.1, C["a"]),
            ("ControlAnything " + L(lang, "(generate a control, median)", "（生成一个控件，中位数）", "（コントロール生成、中央値）"),
             32.5, 32.5, C["b"]),
            ("NavAI " + L(lang, "(per turn)", "（每轮）", "（1 ターン）"), 49.0, 49.0, C["a"]),
            ("NavAI " + L(lang, "(per task, about 8 turns)", "（每个任务，约 8 轮）", "（1 タスク、約 8 ターン）"), 395.0, 395.0, C["a"]),
        ]
        fig, ax = plt.subplots(figsize=(12, 6.4))
        n = len(rows)
        ax.axvspan(0.1, 0.25, color=C["y"], alpha=0.12, lw=0)
        ax.text(0.158, -0.95, L(lang, "real-time\n3D control", "实时 3D\n控制", "リアルタイム\n3D 制御"),
                ha="center", va="bottom", fontsize=10.5, color="#2a7a2a")
        ax.axvline(0.02, color=C["x"], lw=1.6, ls="--")
        ax.text(0.0215, -0.95, L(lang, "≈20 ms motion-\nto-photon (often cited)", "≈20 ms 运动到\n成像（常被引用）",
                                "≈20 ms モーション・\nトゥ・フォトン（よく引用）"),
                ha="left", va="bottom", fontsize=10.5, color=C["x"])
        ax.axvline(4.0, color=C["dark"], lw=1.6, ls="--")
        ax.text(4.3, -0.95, L(lang, "4 s: VR users' quality of\nexperience drops (CUI 2025)",
                              "4 s：VR 用户体验质量下降\n（CUI 2025）", "4 s：VR 利用者の体験品質が低下\n（CUI 2025）"),
                ha="left", va="bottom", fontsize=10.5, color=C["dark"])
        for i, (name, lo, hi, col) in enumerate(rows):
            y = n - 1 - i
            if hi > lo:
                ax.plot([lo, hi], [y, y], color=col, lw=7, solid_capstyle="round")
                txt = f"{lo:g}–{hi:g} s"
            else:
                ax.plot(lo, y, "o", color=col, ms=11)
                txt = f"{lo:g} s"
            ax.text(hi * 1.25, y, txt, va="center", fontsize=12)
        ax.set_xscale("log")
        ax.set_xlim(0.01, 3000)
        ax.set_ylim(-1.1, n - 0.4)
        ax.set_yticks([n - 1 - i for i in range(n)])
        ax.set_yticklabels([r[0] for r in rows], fontsize=11.5)
        ax.tick_params(axis="y", length=0)
        ax.spines["left"].set_visible(False)
        ax.set_xlabel(L(lang, "seconds per agent decision (log scale)", "每次智能体决策所需秒数（对数坐标）",
                        "エージェントの 1 回の判断にかかる秒数（対数軸）"))
        ax.grid(axis="y", visible=False)
        save(fig, OUT / f"04-latency_{lang}.svg")


# ------------------------------------------------------------------------ 6. the loop
def fig_loop():
    for lang in LANGS:
        stages = [
            (L(lang, "observe", "观察", "観測"), "NavAI (FOV shots)\nMeta XR Operator\nIWSDK capture_canvas"),
            (L(lang, "ground the 3D UI", "定位 3D 界面", "3D UI を接地"), "Orienter\nVRSight / DISCOVR"),
            (L(lang, "understand intent", "理解意图", "意図を理解"), "SIAgent (eye + hand)\nGazePointAR, EmBARDiment\nPut-That-There"),
            (L(lang, "plan", "规划", "計画"), "DuoZone (zones)\nComboBench (text plans)"),
            (L(lang, "act (6-DoF input)", "行动（6 自由度输入）", "行動（6 自由度入力）"), "XRintTest, VRExplorer\nAUTOVR, Operator"),
            (L(lang, "verify", "验证", "検証"), "Orienter reflection\nXRI events (XRintTest)"),
        ]
        fig, ax = plt.subplots(figsize=(11.5, 9.2))
        blank(ax)
        ax.set_xlim(-6.6, 6.6)
        ax.set_ylim(-5.3, 5.3)
        R = 4.0
        k = len(stages)
        pts = []
        for i in range(k):
            th = np.pi / 2 - 2 * np.pi * i / k
            pts.append((R * np.cos(th), R * np.sin(th)))
        for i in range(k):
            a = np.array(pts[i])
            b = np.array(pts[(i + 1) % k])
            arrow(ax, tuple(a + (b - a) * 0.3), tuple(a + (b - a) * 0.7), color=C["a"], lw=2.6, rad=-0.15, ms=20)
        for (name, works), (x, y) in zip(stages, pts):
            box(ax, x, y, 3.0, 1.45, "", fc=tint(C["a"], 0.10), ec=C["a"], lw=2.0)
            ax.text(x, y + 0.48, name, ha="center", va="center", fontsize=13.5, weight="bold", color=C["a"])
            ax.text(x, y - 0.18, works, ha="center", va="center", fontsize=10.2, color="#333", linespacing=1.25)
        ax.add_patch(Circle((0, 0), 1.75, fc="white", ec=C["x"], lw=2.2, ls="--"))
        ax.text(0, 0.1, L(lang, "the whole loop on the\n3D GUIs of existing\napps, from a user's\nrequest, evaluated:\nnot found",
                          "在现有应用的 3D 界面上、\n从用户请求出发、\n经过评测的完整闭环：\n尚未发现",
                          "既存アプリの 3D GUI 上で\nユーザーの依頼から始まり\n評価された完全なループ：\n見つからない"),
              ha="center", va="center", fontsize=11, color=C["x"], linespacing=1.3)
        save(fig, OUT / f"04-loop_{lang}.svg")


# ------------------------------------------------------------------------ 7. observation/action channels
def fig_channels():
    for lang in LANGS:
        layers = [
            (L(lang, "semantic actions", "语义动作", "意味的アクション"), "App Intents / App Schemas, AppFunctions,\nWebMCP, MCP tools"),
            (L(lang, "app UI & accessibility", "应用界面与无障碍信息", "アプリ UI とアクセシビリティ"),
             "2D panel trees, subspace semantics,\nRealityKit AccessibilityComponent"),
            (L(lang, "engine scene graph / ECS", "引擎场景图 / ECS", "エンジンのシーングラフ / ECS"),
             "Unity hierarchy (Operator), RealityKit,\nSceneCore, IWSDK ecs_snapshot"),
            (L(lang, "compositor / capture", "合成器 / 截屏", "コンポジタ / キャプチャ"),
             "MediaProjection, ReplayKit (+license),\ncapture_canvas, simulator screenshots"),
            (L(lang, "XR runtime", "XR 运行时", "XR ランタイム"),
             "OpenXR API layers, Monado, Meta XR\nSimulator, IWER (WebXR)"),
            (L(lang, "device sensors", "设备传感器", "デバイスのセンサー"),
             "cameras, head pose, hands,\ngaze (withheld from apps)"),
        ]
        levels = [L(lang, "L0 test harness\nin own app", "L0 自有应用内的\n测试框架", "L0 自作アプリ内の\nテストハーネス"),
                  L(lang, "L1 agent inside\nown app", "L1 自有应用内的\n智能体", "L1 自作アプリ内の\nエージェント"),
                  L(lang, "L2 OS\nassistant", "L2 系统级\n助手", "L2 OS\nアシスタント"),
                  L(lang, "L3 third-party\ncross-app agent", "L3 第三方\n跨应用智能体", "L3 サードパーティの\nアプリ横断エージェント")]
        # 2 = yes, 1 = partial / restricted, 0 = no  (rows follow `layers`)
        M = np.array([
            [1, 1, 2, 0],   # semantic actions: own tools; own intents; system assistants; AppFunctions privileged
            [2, 2, 2, 1],   # UI/accessibility: L3 only 2D panel trees on Android XR (unverified), prohibited on Quest store
            [2, 2, 1, 0],   # scene graph: own app only
            [2, 1, 2, 1],   # capture: consent dialogs / licenses for L1, L3
            [2, 0, 2, 1],   # runtime: layers in dev setups; L3 only on PC OpenXR
            [1, 1, 2, 0],   # sensors: gaze withheld; Full Space needed
        ])
        cols = ["#f3f3f3", "#f7d9a8", "#2ca02c"]
        fig, ax = plt.subplots(figsize=(13, 7.6))
        blank(ax)
        n = len(layers)
        for i, (name, ex) in enumerate(layers):
            y = n - 1 - i
            ax.add_patch(FancyBboxPatch((0, y + 0.08), 5.9, 0.84, boxstyle="round,pad=0.0,rounding_size=0.08",
                                        fc=tint(C["z"], 0.06 + 0.04 * i), ec=C["z"], lw=1.4))
            ax.text(0.15, y + 0.67, name, ha="left", va="center", fontsize=12.5, weight="bold", color=C["z"])
            ax.text(0.15, y + 0.32, ex, ha="left", va="center", fontsize=9.8, color="#333", linespacing=1.15)
            for j in range(4):
                v = M[i, j]
                ax.add_patch(Rectangle((6.2 + j * 1.6, y + 0.08), 1.5, 0.84, fc=cols[v], ec="white", lw=1))
                sym = {2: "✔", 1: "◐", 0: "✘"}[v]
                ax.text(6.95 + j * 1.6, y + 0.5, sym, ha="center", va="center", fontsize=15,
                        color="white" if v == 2 else ("#9a5b00" if v == 1 else "#999"))
        for j, lv in enumerate(levels):
            ax.text(6.95 + j * 1.6, n + 0.1, lv, ha="center", va="bottom", fontsize=10.5, linespacing=1.2)
        ax.annotate("", xy=(-0.25, n - 0.05), xytext=(-0.25, 0.05),
                    arrowprops=dict(arrowstyle="-|>", color="#666", lw=1.6))
        ax.text(-0.45, n / 2, L(lang, "more semantic", "语义层次更高", "より意味的"), rotation=90, ha="center",
                va="center", fontsize=11, color="#666")
        ax.text(6.2, -0.35, L(lang, "✔ available   ◐ partial, consent, license or own app only   ✘ not available",
                              "✔ 可用   ◐ 部分可用、需同意或许可、或仅限自有应用   ✘ 不可用",
                              "✔ 利用可   ◐ 部分的・同意やライセンスが必要・自作アプリのみ   ✘ 利用不可"),
                ha="left", va="center", fontsize=10.5, color="#444")
        ax.set_xlim(-0.7, 12.8)
        ax.set_ylim(-0.6, n + 1.1)
        save(fig, OUT / f"04-channels_{lang}.svg")


# ------------------------------------------------------------------------ 8. feasibility matrix
FEAS_ROWS = ["Apple visionOS", "Android XR", "Meta Horizon OS", "WebXR (IWER / IWSDK)",
             "OpenXR desktop", "Unity XRI", "Godot (OpenXR)", "Unreal (OpenXR)"]
# 2 = works and documented, 1 = partial / restricted / own app only, 0 = not available, -1 = undocumented
FEAS = np.array([
    [1, 1, 0, 0, 1],
    [2, 1, 1, 1, 2],
    [2, 1, 1, 1, 2],
    [2, 2, 2, 2, 2],
    [1, 0, 2, 1, 2],
    [2, 1, 2, 2, 2],
    [2, 1, 1, -1, 1],
    [2, 1, 1, 1, 1],
])
FEAS_NOTE = [
    ["sim.; device: license", "own app only", "no injection", "no XCUITest", "Device Hub (Mac)"],
    ["emulator; consent", "2D panels ?", "emulator; a11y ?", "Compose XR tests", "XR emulator"],
    ["MediaProjection", "own app", "Operator", "Operator, CI", "XR Simulator"],
    ["capture_canvas", "ECS, ui_inspect", "IWER device", "Playwright, MCP", "IWER / IWSDK"],
    ["via API layer", "none", "layer, Monado", "build your own", "Monado, Sim."],
    ["RenderTexture", "scene graph", "XRI simulator", "Test Framework", "editor sim."],
    ["render target", "AccessKit (exp.)", "custom", "none found", "via Monado"],
    ["render target", "Slate (exp.)", "custom", "Gauntlet", "XR Simulator"],
]


def fig_feasibility():
    cols = {2: "#2ca02c", 1: "#f7d9a8", 0: "#f1c6c6", -1: "#e6e6e6"}
    for lang in LANGS:
        heads = [L(lang, "observe\npixels", "观察\n像素", "画素の\n観測"),
                 L(lang, "observe UI\nstructure", "观察界面\n结构", "UI 構造の\n観測"),
                 L(lang, "inject\ninput", "注入\n输入", "入力の\n注入"),
                 L(lang, "automation\nframework", "自动化\n框架", "自動化\nフレームワーク"),
                 L(lang, "emulator for\ndata collection", "用于采集数据\n的模拟器", "データ収集用\nエミュレータ")]
        fig, ax = plt.subplots(figsize=(14, 7.0))
        blank(ax)
        n = len(FEAS_ROWS)
        cw = 2.45
        for i, r in enumerate(FEAS_ROWS):
            y = n - 1 - i
            ax.text(-0.1, y + 0.5, r, ha="right", va="center", fontsize=12.5)
            for j in range(5):
                v = FEAS[i, j]
                ax.add_patch(Rectangle((j * cw, y + 0.06), cw - 0.06, 0.88, fc=cols[v], ec="white"))
                sym = {2: "✔", 1: "◐", 0: "✘", -1: "?"}[v]
                ax.text(j * cw + 0.18, y + 0.5, sym, ha="left", va="center", fontsize=14,
                        color="white" if v == 2 else "#444")
                ax.text(j * cw + 0.5, y + 0.5, FEAS_NOTE[i][j], ha="left", va="center", fontsize=9.4,
                        color="white" if v == 2 else "#333")
        for j, h in enumerate(heads):
            ax.text(j * cw + cw / 2, n + 0.12, h, ha="center", va="bottom", fontsize=11.5, linespacing=1.15)
        ax.text(0, -0.45, L(lang, "✔ works, documented   ◐ partial, restricted or own app only   ✘ not available   ? undocumented, test first",
                            "✔ 可用且有文档   ◐ 部分可用、受限或仅限自有应用   ✘ 不可用   ? 无文档，需先测试",
                            "✔ 動作・文書化済み   ◐ 部分的・制限付き・自作アプリのみ   ✘ 利用不可   ? 文書なし、要検証"),
                ha="left", va="center", fontsize=10.5, color="#444")
        ax.set_xlim(-3.4, 5 * cw + 0.1)
        ax.set_ylim(-0.8, n + 1.1)
        save(fig, OUT / f"04-feasibility_{lang}.svg")


# ------------------------------------------------------------------------ 9. datasets
DATA = [
    # name, size, unit key, xr?, contents flags: frames, UI labels, NL instructions, actions, executable
    ("Orienter IGE set", 1552, "img", True, (1, 1, 0, 0, 0)),
    ("DISCOVR (VRSight)", 17691, "img", True, (1, 1, 0, 0, 0)),
    ("StereoID screenshots", 171000, "img", True, (1, 0, 0, 0, 0)),
    ("GUI-World XR subset", 393, "vid", True, (1, 0, 0.5, 0, 0)),
    ("ComboBench", 262, "task", True, (0, 0, 1, 1, 0)),
    ("XRBench3D", 456, "inter", True, (0, 1, 0, 1, 1)),
    ("MineXR", 695, "widget", True, (0, 1, 0, 0, 0)),
    ("GenXR-Bench", 112, "task", True, (1, 1, 0.5, 0.5, 1)),
    ("AITW (2D)", 715142, "ep", False, (1, 1, 1, 1, 0)),
    ("AndroidControl (2D)", 15283, "ep", False, (1, 1, 1, 1, 0)),
    ("Mind2Web (2D)", 2000, "task+", False, (1, 1, 1, 1, 0)),
    ("AndroidWorld (2D)", 116, "task", False, (1, 1, 1, 1, 1)),
    ("OSWorld (2D)", 369, "task", False, (1, 1, 1, 1, 1)),
]


def fig_datasets():
    for lang in LANGS:
        units = {"img": L(lang, "images", "图像", "画像"), "vid": L(lang, "videos", "视频", "動画"),
                 "task": L(lang, "tasks", "任务", "タスク"), "task+": L(lang, "tasks (2,000+)", "任务（2,000+）", "タスク（2,000+）"), "inter": L(lang, "interactions", "交互", "インタラクション"),
                 "widget": L(lang, "widgets", "控件", "ウィジェット"), "ep": L(lang, "episodes", "轨迹", "エピソード")}
        heads = [L(lang, "frames", "画面", "画面"), L(lang, "UI labels", "界面标注", "UI ラベル"),
                 L(lang, "NL tasks", "自然语言任务", "自然言語タスク"), L(lang, "actions", "动作", "行動"),
                 L(lang, "executable", "可执行", "実行可能")]
        fig, (a1, a2) = plt.subplots(1, 2, figsize=(13.5, 7.2), gridspec_kw=dict(width_ratios=[1.35, 1]), sharey=True)
        n = len(DATA)
        for i, (name, size, unit, xr, flags) in enumerate(DATA):
            y = n - 1 - i
            col = C["a"] if xr else C["gray"]
            a1.barh(y, size, color=col, height=0.62, left=1)
            a1.text(size * 1.3, y, units[unit] if unit == "task+" else f"{size:,} {units[unit]}", va="center", fontsize=10.5)
            for j, f in enumerate(flags):
                if f == 0.5:
                    a2.add_patch(Circle((j, y), 0.24, fc="white", ec=col, lw=2.2))
                else:
                    a2.add_patch(Circle((j, y), 0.27 if f else 0.07, color=col if f else "#cccccc"))
        a1.set_xscale("log")
        a1.set_xlim(50, 2e7)
        a1.set_yticks(range(n))
        a1.set_yticklabels([d[0] for d in DATA][::-1], fontsize=11.5)
        for tl, d in zip(a1.get_yticklabels(), DATA[::-1]):
            tl.set_color(C["a"] if d[3] else "#555")
        a1.set_xlabel(L(lang, "size (log scale; units differ)", "规模（对数坐标；单位不同）", "規模（対数軸、単位は異なる）"))
        a1.axhline(n - 8.5, color="#999", lw=1, ls="--")
        a1.grid(axis="y", visible=False)
        a2.set_xlim(-0.6, 4.6)
        a2.set_aspect("equal")
        a2.set_xticks(range(5))
        a2.set_xticklabels(heads, rotation=40, ha="left", rotation_mode="anchor", fontsize=11.5)
        a2.xaxis.tick_top()
        a2.axhline(n - 8.5, color="#999", lw=1, ls="--")
        a2.grid(False)
        for s in a2.spines.values():
            s.set_visible(False)
        a2.tick_params(length=0)
        a2.set_ylim(-0.7, n - 0.3)
        a2.text(2, -1.25, L(lang, "XR (purple) vs 2D GUI-agent datasets (grey). Ring: partial\n(QA instead of tasks; developer tasks; scripted test actors).\nNo XR set pairs user tasks with actions on existing apps.",
                            "XR 数据集（紫）与 2D GUI 智能体数据集（灰）。空心圈：部分具备\n（问答而非任务；开发任务；脚本化测试演员）。\n没有 XR 数据集把用户任务与现有应用上的动作配对。",
                            "XR データセット（紫）と 2D GUI エージェントのデータセット（灰）。輪：部分的\n（タスクではなく QA、開発タスク、スクリプト化されたテスト用アクター）。\n既存アプリ上のユーザータスクと行動を対にした XR データはない。"),
                ha="center", va="top", fontsize=10.5, color="#333")
        fig.tight_layout()
        save(fig, OUT / f"04-datasets_{lang}.svg")


# ------------------------------------------------------------------------ 10. gap diagram
def fig_gap():
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(11, 10))
        blank(ax)
        ax.set_xlim(-5.6, 5.6)
        ax.set_ylim(-5.4, 5.4)
        r = 2.9
        cP, cI, cO = (-1.55, 1.0), (1.55, 1.0), (0.0, -1.6)
        for (cx, cy), col in ((cP, C["z"]), (cI, C["b"]), (cO, C["y"])):
            ax.add_patch(Circle((cx, cy), r, fc=col, alpha=0.11, ec=col, lw=2.4))
        ax.text(cP[0] - 1.6, cP[1] + 2.75, L(lang, "perceives the 3D UI\nof existing XR apps", "感知现有 XR 应用\n的 3D 界面",
                                               "既存 XR アプリの\n3D UI を知覚"),
                ha="center", va="bottom", fontsize=13, weight="bold", color=C["z"])
        ax.text(cI[0] + 1.6, cI[1] + 2.75, L(lang, "understands a natural-\nlanguage user intent", "理解自然语言\n用户意图",
                                               "自然言語による\nユーザーの意図を理解"),
                ha="center", va="bottom", fontsize=13, weight="bold", color="#c25e00")
        ax.text(cO[0], cO[1] - 3.05, L(lang, "operates the XR UI (windows, widgets, interactables)",
                                         "操作 XR 界面（窗口、控件、可交互物体）",
                                         "XR UI を操作（ウィンドウ、ウィジェット、インタラクタブル）"),
                ha="center", va="top", fontsize=13, weight="bold", color="#2a7a2a")
        t = dict(ha="center", va="center", fontsize=11, color="#222", linespacing=1.3)
        ax.text(-3.0, 2.0, "Orienter*\nVRSight\nQi et al.", **t)
        ax.text(3.0, 2.0, "ComboBench\nGazePointAR\nEmBARDiment\nLLMR, VisionClaw\nSiri (App Intents)", **t)
        ax.text(0.0, -3.0, "VRExplorer\nXRintTest\nAUTOVR\nSIAgent", **t)
        ax.text(0.0, 2.75, "NavAI\n" + L(lang, "(locomotion)", "（移动）", "（移動）"), **t)
        ax.text(-2.15, -1.05, "Meta XR\nOperator\n" + L(lang, "(dev tests)", "（开发测试）", "（開発テスト）"), **t)
        ax.text(2.2, -1.05, "Put-That-There\nDuoZone\nVoice2Action", **t)
        ax.add_patch(Circle((0, 0.15), 0.62, fc="white", ec=C["x"], lw=2.2, ls="--"))
        ax.text(0, 0.15, "?", ha="center", va="center", fontsize=30, color=C["x"], weight="bold")
        ax.text(0, -0.75, L(lang, "Gemini on Galaxy XR: claimed,\nmechanism and evaluation undisclosed",
                            "Galaxy XR 上的 Gemini：有宣称，\n机制与评测未公开",
                            "Galaxy XR の Gemini：主張のみ、\n仕組みと評価は非公開"),
                ha="center", va="top", fontsize=9.6, color=C["x"], style="italic")
        ax.text(-5.4, -5.2, L(lang, "* Orienter's interactions are simulated for test exploration.",
                              "* Orienter 的交互是为测试探索而模拟的。",
                              "* Orienter の操作はテスト探索のための模擬操作。"),
                ha="left", va="bottom", fontsize=10, color="#555")
        save(fig, OUT / f"04-gap_{lang}.svg")


if __name__ == "__main__":
    fig_map()
    fig_timeline()
    fig_capability()
    fig_pieces()
    fig_latency()
    fig_loop()
    fig_channels()
    fig_feasibility()
    fig_datasets()
    fig_gap()
