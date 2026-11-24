"""Figures for 3d-gui-agent post 02: GUI agents on 2D screens, a survey to November 2026.

Run from anywhere:
    python3 bin/figures/3d-gui-agent/gui_agent_02.py            # writes the SVGs
    python3 bin/figures/3d-gui-agent/gui_agent_02.py /tmp/prev  # ... and PNG previews

All numbers plotted here are copied from the post's tables, which take them from the column's
research dossier (docs/research/3d-gui-agent/01-gui-agents-2d.md) and the cited papers and vendor
pages. "Secondary" numbers (press or aggregator only) are drawn with hollow markers.
Figures with words are rendered three times (name_en.svg, name_zh.svg, name_ja.svg).
"""
import os
import sys
import pathlib

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

import numpy as np  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle, Polygon  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402

plt.rcParams["svg.hashsalt"] = "3d-gui-agent-02"

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/3d-gui-agent"
PREV = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None


def out(fig, name):
    if PREV is not None:
        PREV.mkdir(parents=True, exist_ok=True)
        fig.savefig(PREV / name.replace(".svg", ".png"), dpi=70)
    save(fig, OUT / name)


def ym(y, m):
    """Year + month as a float (month 1 -> y + 0.0, month 12 -> y + 0.917)."""
    return y + (m - 1) / 12.0


# ================================================================================================
# 1. Timeline 2016-2026 (localized)
# ================================================================================================
STRANDS = {
    "data": (C["z"], dict(en="UI data and UI understanding", zh="UI 数据与 UI 理解", ja="UI データと UI 理解")),
    "rl": (C["y"], dict(en="RL on synthetic UIs", zh="合成 UI 上的强化学习", ja="合成 UI 上の強化学習")),
    "agent": (C["a"], dict(en="LLM / VLM agent systems", zh="LLM / VLM 智能体系统", ja="LLM / VLM エージェント")),
    "model": (C["b"], dict(en="grounding and native models", zh="定位模型与原生模型", ja="グラウンディング・ネイティブモデル")),
    "bench": (C["gray"], dict(en="benchmarks", zh="基准", ja="ベンチマーク")),
    "prod": (C["x"], dict(en="commercial computer use", zh="商用 computer use", ja="商用 computer use")),
}
EVENTS = [  # (year, month, strand, en, zh, ja)
    (2016, 10, "data", "ERICA: interaction mining of apps", "ERICA：挖掘应用的交互数据", "ERICA：アプリの操作データを収集"),
    (2017, 8, "rl", "World of Bits / MiniWoB", "World of Bits / MiniWoB", "World of Bits / MiniWoB"),
    (2017, 10, "data", "Rico: 72k Android screens + view trees", "Rico：7.2 万个 Android 界面 + 视图树", "Rico：7.2 万の Android 画面 + ビュー階層"),
    (2018, 2, "rl", "MiniWoB++: workflow-guided exploration", "MiniWoB++：工作流引导的探索", "MiniWoB++：ワークフロー誘導探索"),
    (2020, 5, "data", "Seq2Act / PixelHelp: instruction to UI actions", "Seq2Act / PixelHelp：指令到 UI 动作", "Seq2Act / PixelHelp：指示から UI 操作へ"),
    (2021, 5, "rl", "AndroidEnv: RL on the Android emulator", "AndroidEnv：在 Android 模拟器上做 RL", "AndroidEnv：Android エミュレータで RL"),
    (2022, 2, "rl", "CC-Net: human-level MiniWoB++ (2.4M demos)", "CC-Net：MiniWoB++ 达到人类水平（240 万演示）", "CC-Net：MiniWoB++ で人間並み（240 万デモ）"),
    (2022, 9, "data", "Spotlight, Pix2Struct: pixels beat view trees", "Spotlight、Pix2Struct：像素胜过视图树", "Spotlight、Pix2Struct：画素がビュー階層に勝つ"),
    (2023, 6, "bench", "Mind2Web, WebArena, AITW (715k episodes)", "Mind2Web、WebArena、AITW（71.5 万条）", "Mind2Web、WebArena、AITW（71.5 万エピソード）"),
    (2023, 12, "agent", "AppAgent, CogAgent; Set-of-Mark (Oct)", "AppAgent、CogAgent；Set-of-Mark（10 月）", "AppAgent、CogAgent；Set-of-Mark（10 月）"),
    (2024, 1, "model", "SeeClick + ScreenSpot; SeeAct; WebVoyager", "SeeClick + ScreenSpot；SeeAct；WebVoyager", "SeeClick + ScreenSpot；SeeAct；WebVoyager"),
    (2024, 4, "bench", "OSWorld (best 12.2% vs human 72.4%)", "OSWorld（最佳 12.2%，人类 72.4%）", "OSWorld（最高 12.2%、人間 72.4%）"),
    (2024, 5, "bench", "AndroidWorld (best 30.6%)", "AndroidWorld（最佳 30.6%）", "AndroidWorld（最高 30.6%）"),
    (2024, 6, "agent", "Mobile-Agent-v2; DigiRL (online RL)", "Mobile-Agent-v2；DigiRL（在线 RL）", "Mobile-Agent-v2；DigiRL（オンライン RL）"),
    (2024, 10, "prod", "Anthropic computer use (OSWorld 14.9%)", "Anthropic computer use（OSWorld 14.9%）", "Anthropic computer use（OSWorld 14.9%）"),
    (2024, 10, "model", "UGround, OS-Atlas: synthetic grounding data", "UGround、OS-Atlas：合成定位数据", "UGround、OS-Atlas：合成グラウンディングデータ"),
    (2025, 1, "model", "UI-TARS: native end-to-end agent model", "UI-TARS：原生端到端智能体模型", "UI-TARS：ネイティブなエンドツーエンドモデル"),
    (2025, 1, "prod", "OpenAI CUA / Operator (OSWorld 38.1%)", "OpenAI CUA / Operator（OSWorld 38.1%）", "OpenAI CUA / Operator（OSWorld 38.1%）"),
    (2025, 3, "model", "UI-R1, GUI-R1: R1-style RL for GUIs", "UI-R1、GUI-R1：面向 GUI 的 R1 式 RL", "UI-R1、GUI-R1：GUI 向け R1 型 RL"),
    (2025, 4, "bench", "ScreenSpot-Pro (best 18.9%); Online-Mind2Web", "ScreenSpot-Pro（最佳 18.9%）；Online-Mind2Web", "ScreenSpot-Pro（最高 18.9%）；Online-Mind2Web"),
    (2025, 9, "model", "UI-TARS-2: multi-turn RL at scale", "UI-TARS-2：大规模多轮 RL", "UI-TARS-2：大規模な多ターン RL"),
    (2025, 10, "prod", "Gemini 2.5 Computer Use", "Gemini 2.5 Computer Use", "Gemini 2.5 Computer Use"),
    (2025, 12, "agent", "Agent S3: OSWorld 72.6% > human", "Agent S3：OSWorld 72.6%，超过人类", "Agent S3：OSWorld 72.6%、人間超え"),
    (2026, 3, "prod", "GPT-5.4: native computer use (75.0%)", "GPT-5.4：原生 computer use（75.0%）", "GPT-5.4：ネイティブ computer use（75.0%）"),
    (2026, 6, "bench", "OSWorld 2.0: long workflows, best 20.6%", "OSWorld 2.0：长流程，最佳 20.6%", "OSWorld 2.0：長いワークフロー、最高 20.6%"),
    (2026, 7, "model", "Qwen-UI-Agent: GUI + CLI, 10k+ RL envs", "Qwen-UI-Agent：GUI + CLI，1 万+ RL 环境", "Qwen-UI-Agent：GUI + CLI、1 万超の RL 環境"),
    (2026, 9, "model", "BlueLM-GUI: AndroidWorld 84.9", "BlueLM-GUI：AndroidWorld 84.9", "BlueLM-GUI：AndroidWorld 84.9"),
    (2026, 11, "model", "GroundCascade: ScreenSpot-Pro 85.3", "GroundCascade：ScreenSpot-Pro 85.3", "GroundCascade：ScreenSpot-Pro 85.3"),
]


def fig_timeline():
    for lang in LANGS:
        n = len(EVENTS)
        fig, ax = plt.subplots(figsize=(10, 11.5))
        ax.set_xlim(0, 10)
        ax.set_ylim(n + 0.2, -2.3)
        ax.axis("off")
        ax.plot([1.6, 1.6], [-0.4, n - 0.4], color=C["dark"], lw=2)
        prev_year = None
        for i, (y, m, s, en, zh, ja) in enumerate(EVENTS):
            col = STRANDS[s][0]
            text = label(lang, en, zh, ja)
            ax.scatter([1.6], [i], s=110, color=col, zorder=3, edgecolor="white", linewidth=1.5)
            ax.text(1.95, i, text, va="center", fontsize=13.5, color=C["dark"])
            if y != prev_year:
                ax.text(1.25, i, str(y), va="center", ha="right", fontsize=15, fontweight="bold", color=C["dark"])
                ax.plot([1.45, 1.6], [i, i], color=C["dark"], lw=1.5)
                prev_year = y
        # legend at the top
        xs = [0.2, 3.6, 6.9]
        for k, (key, (col, names)) in enumerate(STRANDS.items()):
            x = xs[k % 3]
            yy = -2.0 + 0.7 * (k // 3)
            ax.scatter([x], [yy], s=110, color=col)
            ax.text(x + 0.25, yy, names[lang], va="center", fontsize=13)
        out(fig, f"02-timeline_{lang}.svg")


# ================================================================================================
# 2. Agent loop and anatomy (localized)
# ================================================================================================
def box(ax, x, y, w, h, text, fc, ec, fs=13.5, bold=False, tc=None):
    p = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.12", fc=fc, ec=ec, lw=2)
    ax.add_patch(p)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs, color=tc or C["dark"],
            fontweight="bold" if bold else "normal", linespacing=1.25)


def arrow(ax, a, b, col=C["dark"], lw=2, style="-|>", ls="-", rad=0.0):
    ax.annotate("", xy=b, xytext=a, arrowprops=dict(arrowstyle=style, color=col, lw=lw, ls=ls,
                                                     shrinkA=2, shrinkB=2, connectionstyle=f"arc3,rad={rad}"))


def fig_loop():
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)  # noqa: E731
        fig, ax = plt.subplots(figsize=(10, 7.2))
        ax.set_xlim(0, 10)
        ax.set_ylim(-0.1, 7.2)
        ax.axis("off")
        # user, ask/confirm and the device
        box(ax, 0.1, 5.9, 2.4, 1.2, L("User\ninstruction", "用户指令", "ユーザーの指示"), "#fff4e5", C["b"], bold=True)
        box(ax, 0.1, 3.0, 2.4, 1.9, L("Ask / confirm\nask user, pause,\nhand over", "询问 / 确认\n问用户、暂停、\n交还控制", "質問 / 確認\n尋ねる・一時停止・\n引き継ぎ"),
            "#fdecec", C["x"], fs=12)
        box(ax, 3.2, 0.55, 4.05, 1.3, L("Device: phone, PC, browser, VM", "设备：手机、电脑、浏览器、虚拟机", "デバイス：スマホ・PC・ブラウザ・VM"),
            "#eef6ee", C["y"], fs=12.5)
        # native-model envelope
        env = FancyBboxPatch((2.95, 2.75), 4.5, 4.35, boxstyle="round,pad=0.02,rounding_size=0.2",
                             fc="none", ec=C["a"], lw=2, ls="--")
        ax.add_patch(env)
        ax.text(5.2, 6.8, L("one VLM in a native agent model", "原生智能体模型：一个 VLM 完成", "ネイティブモデルでは 1 つの VLM が担当"),
                ha="center", fontsize=12.5, color=C["a"], style="italic")
        box(ax, 3.2, 5.2, 1.9, 1.2, L("Plan\n(reason)", "规划\n（推理）", "計画\n（推論）"), C["fill"], C["a"])
        box(ax, 5.35, 5.2, 1.9, 1.2, L("Ground\n(where?)", "定位\n（在哪里？）", "グラウンディング\n（どこ？）"), C["fill"], C["a"], fs=12.5)
        box(ax, 5.35, 3.0, 1.9, 1.2, L("Act\n(tap, type, ...)", "执行\n（点击、输入…）", "実行\n（タップ・入力…）"), C["fill"], C["a"])
        box(ax, 3.2, 3.0, 1.9, 1.2, L("Observe\n+ parse", "观测\n+ 解析", "観測\n+ 解析"), C["fill"], C["a"])
        # side modules
        box(ax, 7.85, 5.2, 2.05, 1.6, L("Memory\nnotes, app docs,\nshortcuts", "记忆\n进度笔记、\n应用文档、快捷方式", "メモリ\n進捗メモ・\nアプリ文書・\nショートカット"),
            "#e8f4fb", C["z"], fs=11.5)
        box(ax, 7.85, 2.8, 2.05, 1.6, L("Reflect / verify\ndid it work?", "反思 / 验证\n成功了吗？", "振り返り / 検証\nうまくいった？"),
            "#e8f4fb", C["z"], fs=12)
        # main loop arrows
        arrow(ax, (2.5, 6.5), (3.2, 6.0), C["b"])
        arrow(ax, (4.15, 4.2), (4.15, 5.2))
        arrow(ax, (5.1, 5.8), (5.35, 5.8))
        arrow(ax, (6.3, 5.2), (6.3, 4.2))
        arrow(ax, (6.3, 3.0), (6.3, 1.85), C["y"], lw=2.5)
        ax.text(6.45, 2.3, L("action", "动作", "アクション"), fontsize=12, color=C["y"])
        arrow(ax, (4.15, 1.85), (4.15, 3.0), C["y"], lw=2.5)
        ax.text(4.0, 2.3, L("next screen", "下一屏", "次の画面"), fontsize=12, color=C["y"], ha="right")
        # side links
        arrow(ax, (7.85, 6.0), (7.45, 6.0), C["z"], style="<|-|>")
        arrow(ax, (7.85, 3.6), (7.45, 3.6), C["z"], style="<|-|>")
        arrow(ax, (2.95, 3.95), (2.5, 3.95), C["x"], style="<|-|>")
        arrow(ax, (1.3, 4.9), (1.3, 5.9), C["x"], style="<|-|>", ls="--")
        ax.text(1.45, 5.3, L("question", "提问", "質問"), fontsize=12, color=C["x"])
        ax.text(5.2, 0.12, L("stop: done, infeasible, or step limit", "终止：完成、不可行或达到步数上限", "終了：完了・実行不能・ステップ上限"),
                fontsize=12.5, ha="center", color=C["gray"])
        out(fig, f"02-agent-loop_{lang}.svg")


# ================================================================================================
# 3. Observation types on one toy screen (localized titles; screen content is English in all)
# ================================================================================================
SCREEN = [  # (role, text, x, y, w, h) in a 360 x 640 phone, y down
    ("header", "Settings", 0, 0, 360, 56),
    ("textbox", "Search settings", 16, 68, 328, 40),
    ("switch", "Wi-Fi", 16, 124, 328, 52),
    ("switch", "Bluetooth", 16, 182, 328, 52),
    ("button", "Display", 16, 240, 328, 52),
    ("button", "Sound", 16, 298, 328, 52),
    ("button", "Battery", 16, 356, 328, 52),
    ("button", "Alarms", 16, 414, 328, 52),
    ("button", "Apps", 16, 472, 328, 52),
]


def draw_phone(ax, marks=False):
    ax.set_xlim(-12, 372)
    ax.set_ylim(652, -12)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.add_patch(FancyBboxPatch((-8, -8), 376, 656, boxstyle="round,pad=0,rounding_size=22", fc="white", ec=C["dark"], lw=2.5))
    for k, (role, text, x, y, w, h) in enumerate(SCREEN):
        if role == "header":
            ax.add_patch(Rectangle((x, y), w, h, fc="#ede7f6", ec="none"))
            ax.text(18, y + h / 2, text, va="center", fontsize=17, fontweight="bold")
            continue
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=8", fc="#f6f6f6", ec="#d0d0d0", lw=1))
        col = "#999999" if role == "textbox" else C["dark"]
        ax.text(x + (32 if marks else 14), y + h / 2, text, va="center", fontsize=14, color=col)
        if role == "switch":
            on = text == "Bluetooth"
            ax.add_patch(FancyBboxPatch((x + w - 62, y + 15), 44, 22, boxstyle="round,pad=0,rounding_size=11",
                                        fc=C["a"] if on else "#c8c8c8", ec="none"))
            cx = x + w - 62 + (33 if on else 11)
            ax.add_patch(plt.Circle((cx, y + 26), 9, fc="white", ec="none"))
        if role == "button":
            ax.text(x + w - 22, y + h / 2, ">", va="center", fontsize=14, color="#888888")
        if marks:
            ax.add_patch(Rectangle((x, y), w, h, fc="none", ec=C["x"], lw=1.8))
            ax.add_patch(Rectangle((x, y), 26, 20, fc=C["x"], ec="none"))
            ax.text(x + 13, y + 10, str(k), ha="center", va="center", fontsize=12, color="white", fontweight="bold")


def fig_observations():
    tree = ["window  \"Settings\"", "  textbox \"Search settings\"", "    [16,68,344,108]",
            "  switch \"Wi-Fi\" checked=false", "    clickable [16,124,344,176]",
            "  switch \"Bluetooth\" checked=true", "    clickable [16,182,344,234]",
            "  button \"Display\" [16,240,344,292]", "  button \"Sound\" [16,298,344,350]",
            "  button \"Battery\" [16,356,344,408]", "  button \"Alarms\" [16,414,344,466]",
            "  button \"Apps\" [16,472,344,524]"]
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)  # noqa: E731
        fig = plt.figure(figsize=(11, 6.8))
        ax1 = fig.add_axes([0.0, 0.0, 0.27, 0.88])
        ax2 = fig.add_axes([0.30, 0.0, 0.27, 0.88])
        ax3 = fig.add_axes([0.60, 0.0, 0.40, 0.88])
        draw_phone(ax1)
        draw_phone(ax2, marks=True)
        ax3.axis("off")
        ax3.set_xlim(0, 1)
        ax3.set_ylim(1, 0)
        ax3.add_patch(Rectangle((0, 0.02), 1, 0.96, fc="#fafafa", ec="#cccccc"))
        for i, line in enumerate(tree):
            ax3.text(0.03, 0.07 + i * 0.072, line, family="DejaVu Sans Mono", fontsize=11.5, va="center",
                     color=C["z"] if "checked" in line or "clickable" in line else C["dark"])
        fig.text(0.135, 0.93, L("(a) screenshot", "(a) 截图", "(a) スクリーンショット"), ha="center", fontsize=15)
        fig.text(0.435, 0.93, L("(b) Set-of-Mark labels", "(b) Set-of-Mark 标记", "(b) Set-of-Mark ラベル"), ha="center", fontsize=15)
        fig.text(0.80, 0.93, L("(c) accessibility tree (serialized)", "(c) 无障碍树（序列化）", "(c) アクセシビリティツリー（直列化）"),
                 ha="center", fontsize=15)
        out(fig, f"02-observations_{lang}.svg")


# ================================================================================================
# 4. Evidence on input modality (localized)
# ================================================================================================
def fig_inputs():
    groups = [  # (label, [(kind, value)])
        ("OSWorld\nGPT-4V", [("shot", 5.26), ("tree", None), ("hyb", 12.17)]),
        ("OSWorld\nGPT-4o", [("shot", 5.03), ("tree", 11.36), ("hyb", None)]),
        ("AndroidWorld\nGPT-4 Turbo", [("shot", None), ("tree", 30.6), ("som", 25.4)]),
        ("EntWorld\ntrained agent", [("shot", 15.6), ("tree", 35.2), ("hyb", 53.7)]),
    ]
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)  # noqa: E731
        kinds = {
            "shot": (C["b"], L("screenshot only", "仅截图", "スクリーンショットのみ")),
            "tree": (C["z"], L("accessibility tree only", "仅无障碍树", "アクセシビリティツリーのみ")),
            "som": (C["c"], L("screenshot + Set-of-Mark", "截图 + Set-of-Mark", "スクリーンショット + SoM")),
            "hyb": (C["a"], L("screenshot + tree", "截图 + 树", "スクリーンショット + ツリー")),
        }
        fig, ax = plt.subplots(figsize=(10, 5.6))
        seen = set()
        for gi, (g, items) in enumerate(groups):
            vals = [(k, v) for k, v in items if v is not None]
            for j, (k, v) in enumerate(vals):
                x = gi + (j - (len(vals) - 1) / 2) * 0.26
                col, name = kinds[k]
                ax.bar(x, v, width=0.24, color=col, label=None if k in seen else name)
                seen.add(k)
                ax.text(x, v + 1.0, f"{v:g}", ha="center", fontsize=12.5)
        ax.set_xticks(range(len(groups)))
        ax.set_xticklabels([g for g, _ in groups], fontsize=13)
        ax.set_ylabel(L("task success (%)", "任务成功率 (%)", "タスク成功率 (%)"))
        ax.set_ylim(0, 62)
        ax.grid(axis="x", visible=False)
        ax.legend(loc="upper left", fontsize=12.5, frameon=False)
        out(fig, f"02-input-evidence_{lang}.svg")


# ================================================================================================
# 5. The grounding gap: ScreenSpot(-v2) vs ScreenSpot-Pro, and ScreenSpot-Pro over time (localized)
# ================================================================================================
PAIRS = [  # model, ScreenSpot or -v2 (which), ScreenSpot-Pro
    ("OS-Atlas\n7B\n(2024-10)", 82.47, "SS", 18.9),
    ("GUI-Actor\n7B\n(2025-06)", 92.1, "v2", 44.6),
    ("Ferret-UI\nLite 3B\n(2025-09)", 91.6, "v2", 53.3),
    ("Qwen-UI-\nAgent\n(2026-07)", 97.5, "v2", 81.5),
]
SSPRO = [  # (date, value, kind, name) kind: single / search / cascade / unclear
    (ym(2025, 4), 18.9, "single", "best at release"),
    (ym(2025, 4), 48.1, "search", "ScreenSeekeR"),
    (ym(2025, 4.6), 61.6, "single", "UI-TARS-1.5"),
    (ym(2025, 8), 61.9, "single", "UI-Venus-72B"),
    (ym(2025, 11), 66.1, "single", "Holo2-30B"),
    (ym(2025, 12), 67.9, "single", "MAI-UI"),
    (ym(2025, 12.4), 73.5, "search", "MAI-UI zoom"),
    (ym(2026, 2), 69.6, "single", "UI-Venus-1.5"),
    (ym(2026, 2.5), 80.3, "unclear", "GUI-Owl-1.5"),
    (ym(2026, 7), 81.5, "search", "Qwen-UI-Agent zoom"),
    (ym(2026, 8), 74.1, "single", "UI-Venus-2-27B"),
    (ym(2026, 11), 85.33, "cascade", "GroundCascade"),
]


def fig_grounding():
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)  # noqa: E731
        fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 5.6), gridspec_kw=dict(width_ratios=[1, 1.15]))
        x = np.arange(len(PAIRS))
        ss = [p[1] for p in PAIRS]
        pro = [p[3] for p in PAIRS]
        a1.bar(x - 0.19, ss, 0.36, color=C["c"], label="ScreenSpot / -v2")
        a1.bar(x + 0.19, pro, 0.36, color=C["x"], label="ScreenSpot-Pro")
        for i in range(len(PAIRS)):
            a1.text(x[i] - 0.19, ss[i] + 1.2, f"{ss[i]:.1f}", ha="center", fontsize=11.5)
            a1.text(x[i] + 0.19, pro[i] + 1.2, f"{pro[i]:.1f}", ha="center", fontsize=11.5)
        a1.set_xticks(x)
        a1.set_xticklabels([p[0] for p in PAIRS], fontsize=11.5)
        a1.set_ylim(0, 118)
        a1.set_ylabel(L("grounding accuracy (%)", "定位准确率 (%)", "グラウンディング精度 (%)"))
        a1.legend(loc="upper left", fontsize=12, frameon=False, ncol=2)
        a1.grid(axis="x", visible=False)
        a1.set_title(L("(a) same model, two benchmarks", "(a) 同一模型，两个基准", "(a) 同じモデル、2 つのベンチマーク"), fontsize=15)
        sty = {
            "single": ("o", C["a"], L("single pass", "单次预测", "1 回の予測")),
            "search": ("s", C["b"], L("zoom / search", "放大 / 搜索", "ズーム / 探索")),
            "cascade": ("D", C["x"], L("cascade of grounders", "定位模型级联", "グラウンダーのカスケード")),
            "unclear": ("^", C["gray"], L("setting not stated", "设置未说明", "設定の記載なし")),
        }
        done = set()
        for d, v, k, name in SSPRO:
            mk, col, nm = sty[k]
            a2.scatter(d, v, marker=mk, s=95, color=col, zorder=3, label=None if k in done else nm)
            done.add(k)
            off = {"UI-TARS-1.5": (-12, 9), "UI-Venus-72B": (-22, -17), "MAI-UI": (-14, -19), "Holo2-30B": (-66, 7),
                   "MAI-UI zoom": (-92, 7), "UI-Venus-1.5": (6, -16), "GUI-Owl-1.5": (-76, 9),
                   "Qwen-UI-Agent zoom": (-70, -20), "UI-Venus-2-27B": (7, -14), "GroundCascade": (-62, 10),
                   "best at release": (8, -4), "ScreenSeekeR": (8, -4)}[name]
            a2.annotate(name, (d, v), xytext=off, textcoords="offset points", fontsize=10.5, color=C["dark"])
        single = sorted([(d, v) for d, v, k, _ in SSPRO if k == "single"])
        best = np.maximum.accumulate([v for _, v in single])
        a2.step([d for d, _ in single] + [ym(2026, 12)], list(best) + [best[-1]], where="post", color=C["a"], lw=1.6, alpha=0.6)
        a2.set_xlim(ym(2025, 2), ym(2026, 12.5))
        a2.set_ylim(0, 100)
        a2.set_xticks([2025.25, 2025.5, 2025.75, 2026.0, 2026.25, 2026.5, 2026.75])
        a2.set_xticklabels(["25-04", "25-07", "25-10", "26-01", "26-04", "26-07", "26-10"], fontsize=12)
        a2.set_ylabel("ScreenSpot-Pro (%)")
        a2.legend(loc="lower right", fontsize=11.5, frameon=False)
        a2.set_title(L("(b) ScreenSpot-Pro over time", "(b) ScreenSpot-Pro 随时间的进展", "(b) ScreenSpot-Pro の推移"), fontsize=15)
        fig.tight_layout()
        out(fig, f"02-grounding_{lang}.svg")


# ================================================================================================
# 6. Design levers: action space and docs (AppAgent), grounding (SeeAct, Jedi) (localized)
# ================================================================================================
def fig_levers():
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)  # noqa: E731
        fig, axs = plt.subplots(1, 3, figsize=(12.5, 5.4), gridspec_kw=dict(width_ratios=[2.3, 1, 1]))
        a = axs[0]
        names = [L("raw\nactions", "原始\n动作", "生の\n操作"), L("element\nactions", "元素级\n动作", "要素\n単位"),
                 L("+ explored\ndocs", "+ 探索\n文档", "+ 探索\n文書"), L("+ demo\ndocs", "+ 演示\n文档", "+ デモ\n文書"),
                 L("+ manual\ndocs", "+ 人工\n文档", "+ 手書き\n文書")]
        vals = [2.2, 48.9, 73.3, 84.4, 95.6]
        cols = [C["gray"], C["b"], C["a"], C["a"], C["z"]]
        a.bar(range(5), vals, color=cols, width=0.62)
        for i, v in enumerate(vals):
            a.text(i, v + 1.5, f"{v:g}", ha="center", fontsize=12.5)
        a.set_xticks(range(5))
        a.set_xticklabels(names, fontsize=12)
        a.set_ylim(0, 108)
        a.set_ylabel(L("task success (%)", "任务成功率 (%)", "タスク成功率 (%)"))
        a.set_title(L("(a) AppAgent: action space and app docs", "(a) AppAgent：动作空间与应用文档", "(a) AppAgent：行動空間とアプリ文書"), fontsize=14)
        a.grid(axis="x", visible=False)
        b = axs[1]
        b.bar([0, 1], [37.8, 51.1], color=[C["b"], C["y"]], width=0.6)
        for i, v in enumerate([37.8, 51.1]):
            b.text(i, v + 1.5, f"{v:g}", ha="center", fontsize=12.5)
        b.set_xticks([0, 1])
        b.set_xticklabels([L("best\npractical", "最佳\n实用定位", "実用上\n最良"), L("oracle\ngrounding", "理想\n定位", "正解\n位置")], fontsize=12)
        b.set_ylim(0, 108)
        b.set_title(L("(b) SeeAct, live web", "(b) SeeAct，真实网站", "(b) SeeAct、実サイト"), fontsize=14)
        b.grid(axis="x", visible=False)
        c = axs[2]
        c.bar([0, 1], [23, 51], color=[C["b"], C["y"]], width=0.6)
        for i, v in enumerate([23, 51]):
            c.text(i, v + 1.5, f"{v:g}", ha="center", fontsize=12.5)
        c.set_xticks([0, 1])
        c.set_xticklabels(["o3", "o3 +\nJedi"], fontsize=12)
        c.set_ylim(0, 108)
        c.set_title(L("(c) OSWorld", "(c) OSWorld", "(c) OSWorld"), fontsize=14)
        c.grid(axis="x", visible=False)
        fig.tight_layout()
        out(fig, f"02-design-levers_{lang}.svg")


# ================================================================================================
# 7. Training map (localized)
# ================================================================================================
def fig_training():
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)  # noqa: E731
        fig, ax = plt.subplots(figsize=(13.5, 7.8))
        ax.set_xlim(0, 12)
        ax.set_ylim(0, 7.6)
        ax.axis("off")
        cols = [0.1, 3.05, 6.0, 8.95]
        w = 2.8
        heads = [L("1. Data", "1. 数据", "1. データ"), L("2. SFT", "2. 监督微调", "2. SFT"),
                 L("3. Grounding RL", "3. 定位强化学习", "3. グラウンディング RL"), L("4. Online multi-turn RL", "4. 在线多轮 RL", "4. オンライン多ターン RL")]
        body = [
            L("human demos (AITW 715k,\nAndroidControl 15k)\ntutorials -> trajectories\n($0.03-1 each)\nexplore, then name the task\n(OS-Genesis)\nDOM -> 10M grounding labels",
              "人类演示（AITW 71.5 万、\nAndroidControl 1.5 万）\n教程 -> 轨迹\n（每条 0.03-1 美元）\n先探索再命名任务\n（OS-Genesis）\nDOM -> 1000 万定位标注",
              "人のデモ（AITW 71.5 万、\nAndroidControl 1.5 万）\nチュートリアル -> 軌跡\n（1 本 0.03-1 ドル）\n探索してからタスク命名\n（OS-Genesis）\nDOM -> 1000 万の位置ラベル"),
            L("grounding first,\nthen trajectories with\nreasoning traces\n(Aguvis, UI-TARS)\n\nreflection tuning on\ncorrected mistakes",
              "先学定位，\n再学带推理过程的轨迹\n（Aguvis、UI-TARS）\n\n用纠正后的错误\n做反思微调",
              "まず位置合わせ、\n次に推論付きの軌跡\n（Aguvis、UI-TARS）\n\n修正した失敗で\nリフレクション学習"),
            L("GRPO, rule reward:\npoint inside the box?\n136-3k samples\n(UI-R1, GUI-R1, SE-GUI)\nGaussian rewards (GUI-G²)\nbox-size checks (GUI-G1)",
              "GRPO，规则奖励：\n点落在框内？\n136-3000 个样本\n（UI-R1、GUI-R1、SE-GUI）\n高斯奖励（GUI-G²）\n框大小约束（GUI-G1）",
              "GRPO、ルール報酬：\n点が枠内か？\n136-3000 サンプル\n（UI-R1、GUI-R1、SE-GUI）\nガウス報酬（GUI-G²）\n枠サイズ制約（GUI-G1）"),
            L("emulators / VMs in parallel\n(1k-20k instances,\nhundreds of real phones)\nVLM judge or checker reward\ncurriculum from failures\n(DigiRL, WebRL, UI-TARS-2)",
              "并行模拟器 / 虚拟机\n（1000-20000 个实例、\n数百台真机）\nVLM 评判或检查器奖励\n由失败生成课程\n（DigiRL、WebRL、UI-TARS-2）",
              "並列エミュレータ / VM\n（1000-20000 インスタンス、\n数百台の実機）\nVLM 判定・チェッカー報酬\n失敗からカリキュラム\n（DigiRL、WebRL、UI-TARS-2）"),
        ]
        three = [
            L("3D: engine renders any\nobject from any view,\nwith exact labels", "3D：引擎可从任意视角\n渲染任意物体，\n标签精确", "3D：エンジンは任意の物体を\n任意の視点から描画、\nラベルは正確"),
            L("3D: no XR trajectory\ncorpus exists yet", "3D：尚无 XR\n轨迹语料", "3D：XR の軌跡\nコーパスはまだない"),
            L("3D: reward = did the ray\nhit the collider? (free)", "3D：奖励 = 射线是否\n命中碰撞体？（免费）", "3D：報酬 = レイが\nコライダーに当たったか（無料）"),
            L("3D: XR simulators need\na GPU per instance", "3D：每个 XR 模拟器\n实例都需要 GPU", "3D：XR シミュレータは\nインスタンスごとに GPU"),
        ]
        for i in range(4):
            x = cols[i]
            box(ax, x, 6.6, w, 0.75, heads[i], C["a"], C["a"], fs=14, bold=True, tc="white")
            box(ax, x, 3.15, w, 3.25, body[i], C["fill"], C["a"], fs=11.5)
            box(ax, x, 0.15, w, 1.25, three[i], "#fff4e5", C["b"], fs=11.2)
            if i < 3:
                arrow(ax, (x + w, 4.8), (cols[i + 1], 4.8), C["a"], lw=2.5)
        box(ax, 3.05, 1.55, 8.7, 1.4, L("world models: predict the next screen as text, HTML / code or pixels\n(WMA, WebDreamer, Code2World, NeuralOS)\nused for look-ahead before acting, as imagined RL environments, and for data synthesis",
                                          "世界模型：以文本、HTML / 代码或像素预测下一屏\n（WMA、WebDreamer、Code2World、NeuralOS）\n用于行动前的前瞻、作为想象中的 RL 环境，以及数据合成",
                                          "世界モデル：次の画面をテキスト・HTML / コード・画素で予測\n（WMA、WebDreamer、Code2World、NeuralOS）\n行動前の先読み、想像上の RL 環境、データ合成に利用"),
            "#e8f4fb", C["z"], fs=11.2)
        arrow(ax, (7.4, 2.95), (7.4, 3.15), C["z"])
        arrow(ax, (10.35, 2.95), (10.35, 3.15), C["z"])
        out(fig, f"02-training-map_{lang}.svg")


# ================================================================================================
# 8. Benchmark progress (localized legend)
# ================================================================================================
BENCH = {
    "OSWorld": dict(col=C["a"], human=72.36, pts=[  # (date, value, primary?, label)
        (ym(2024, 4), 12.24, True, ""), (ym(2024, 10), 14.9, True, "Claude 3.5"), (ym(2025, 1), 38.1, True, "OpenAI CUA"),
        (ym(2025, 9), 61.4, True, "Sonnet 4.5"), (ym(2025, 12), 72.6, True, "Agent S3"), (ym(2026, 3), 75.0, True, ""),
        (ym(2026, 4), 78.7, True, ""), (ym(2026, 5), 83.4, False, ""), (ym(2026, 7), 79.5, True, ""),
        (ym(2026, 8), 80.5, True, "")]),
    "AndroidWorld": dict(col=C["y"], human=80.0, pts=[
        (ym(2024, 5), 30.6, True, "M3A"), (ym(2024, 10), 44.0, True, ""), (ym(2025, 1), 46.6, True, "UI-TARS"),
        (ym(2025, 4), 54.3, True, ""), (ym(2025, 8), 73.3, True, ""), (ym(2025, 10), 77.2, True, ""),
        (ym(2025, 12), 76.7, True, ""), (ym(2026, 6), 78.9, True, ""), (ym(2026, 9), 84.9, True, "")]),
    "WebArena": dict(col=C["b"], human=78.24, pts=[
        (ym(2023, 7), 14.41, True, "GPT-4"), (ym(2025, 1), 58.1, True, "OpenAI CUA"), (ym(2026, 2), 71.6, True, ""),
        (ym(2026, 7), 73.6, True, ""), (ym(2026, 9), 86.1, False, "")]),
}


def fig_progress():
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)  # noqa: E731
        fig, ax = plt.subplots(figsize=(10.5, 6.4))
        for name, d in BENCH.items():
            pts = sorted(d["pts"])
            prim = [(t, v) for t, v, p, _ in pts if p]
            best = np.maximum.accumulate([v for _, v in prim])
            ax.step([t for t, _ in prim] + [ym(2026, 11.5)], list(best) + [best[-1]], where="post", color=d["col"], lw=2.4, label=name)
            for t, v, p, lab in pts:
                ax.scatter(t, v, s=60, color=d["col"] if p else "white", edgecolor=d["col"], linewidth=2, zorder=3)
                if lab:
                    ax.annotate(lab, (t, v), xytext=(5, -15 if name != "WebArena" else 6), textcoords="offset points", fontsize=10.5, color=d["col"])
            ax.axhline(d["human"], color=d["col"], ls=":", lw=1.6)
        ax.text(ym(2023, 6.2), 94, L("human: OSWorld 72.4, WebArena 78.2, AndroidWorld 80.0 (secondary)",
                                       "人类：OSWorld 72.4、WebArena 78.2、AndroidWorld 80.0（二手来源）",
                                       "人間：OSWorld 72.4、WebArena 78.2、AndroidWorld 80.0（二次情報）"), fontsize=11, color=C["gray"])
        ax.scatter(ym(2026, 6), 20.6, marker="*", s=320, color=C["x"], zorder=4, label="OSWorld 2.0")
        ax.annotate(L("OSWorld 2.0 (long workflows)", "OSWorld 2.0（长流程）", "OSWorld 2.0（長いワークフロー）"), (ym(2026, 6), 20.6),
                    xytext=(-210, -4), textcoords="offset points", fontsize=11.5, color=C["x"])
        ax.axvline(ym(2025, 7.9), color=C["gray"], lw=1, ls="--")
        ax.text(ym(2025, 8.1), 4, L("OSWorld-Verified", "OSWorld-Verified", "OSWorld-Verified"), fontsize=10.5, color=C["gray"])
        ax.scatter([], [], s=60, color="white", edgecolor=C["dark"], linewidth=2,
                   label=L("self-reported / secondary", "自报 / 二手来源", "自己申告 / 二次情報"))
        ax.set_xlim(ym(2023, 5), ym(2026, 12))
        ax.set_ylim(0, 100)
        ax.set_ylabel(L("best reported task success (%)", "已报告的最佳任务成功率 (%)", "報告された最高タスク成功率 (%)"))
        ax.set_xticks([2023.5, 2024, 2024.5, 2025, 2025.5, 2026, 2026.5])
        ax.set_xticklabels(["23-07", "24-01", "24-07", "25-01", "25-07", "26-01", "26-07"])
        ax.legend(loc="center left", bbox_to_anchor=(0.0, 0.58), fontsize=12, frameon=False)
        out(fig, f"02-benchmark-progress_{lang}.svg")


# ================================================================================================
# 9. 2D screen vs 3D space: a real frustum test (localized legend)
# ================================================================================================
def panel_corners(center, normal, w, h):
    n = np.asarray(normal, float)
    n /= np.linalg.norm(n)
    up = np.array([0, 0, 1.0])
    r = np.cross(up, n)
    r /= np.linalg.norm(r)
    u = np.cross(n, r)
    c = np.asarray(center, float)
    return np.array([c - r * w / 2 - u * h / 2, c + r * w / 2 - u * h / 2, c + r * w / 2 + u * h / 2, c - r * w / 2 + u * h / 2])


def in_frustum(p, fov_h=np.radians(64), fov_v=np.radians(50)):
    # head at origin looking along +y, z up
    x, y, z = p
    if y <= 0.05:
        return False
    return abs(np.arctan2(x, y)) <= fov_h / 2 and abs(np.arctan2(z, y)) <= fov_v / 2


def ray_box_hit(o, d, lo, hi):
    """Slab test; returns entry distance or None."""
    t0, t1 = -np.inf, np.inf
    for k in range(3):
        if abs(d[k]) < 1e-9:
            if o[k] < lo[k] or o[k] > hi[k]:
                return None
            continue
        a, b = (lo[k] - o[k]) / d[k], (hi[k] - o[k]) / d[k]
        t0, t1 = max(t0, min(a, b)), min(t1, max(a, b))
    return t0 if t1 >= max(t0, 0) else None


def fig_2d3d():
    # scene (metres): head at origin, looking +y
    panels = {
        "A": dict(c=(-0.2, 1.6, 0.05), n=(0, -1, 0), w=0.8, h=0.5),       # in front
        "B": dict(c=(0.55, 2.6, -0.05), n=(-0.3, -1, 0), w=0.7, h=0.45),  # behind the box
        "C": dict(c=(1.4, 0.8, 0.1), n=(-1, -0.5, 0), w=0.7, h=0.45),     # to the right, outside FOV
        "D": dict(c=(0.2, -1.3, 0.1), n=(0, 1, 0), w=0.8, h=0.5),         # behind the user
    }
    box_lo, box_hi = np.array([0.25, 1.85, -0.45]), np.array([0.75, 2.25, 0.25])  # a virtual object
    status = {}
    rng = np.random.default_rng(0)
    for k, p in panels.items():
        corners = panel_corners(p["c"], p["n"], p["w"], p["h"])
        # sample the panel surface, count samples visible (in frustum and not blocked by the box)
        s = rng.uniform(0, 1, size=(400, 2))
        pts = corners[0] + s[:, :1] * (corners[1] - corners[0]) + s[:, 1:] * (corners[3] - corners[0])
        vis = 0
        inf = 0
        for q in pts:
            if not in_frustum(q):
                continue
            inf += 1
            dist = np.linalg.norm(q)
            t = ray_box_hit(np.zeros(3), q / dist, box_lo, box_hi)
            if t is None or t > dist:
                vis += 1
        status[k] = (vis / len(pts), inf / len(pts))
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)  # noqa: E731
        fig = plt.figure(figsize=(12, 6.2))
        a = fig.add_axes([0.0, 0.05, 0.26, 0.85])
        a.set_xlim(-10, 370)
        a.set_ylim(650, -10)
        a.set_aspect("equal")
        a.axis("off")
        a.add_patch(FancyBboxPatch((-6, -6), 372, 652, boxstyle="round,pad=0,rounding_size=22", fc="white", ec=C["dark"], lw=2.5))
        for j in range(8):
            a.add_patch(FancyBboxPatch((16, 70 + 62 * j), 328, 50, boxstyle="round,pad=0,rounding_size=8", fc="#f6f6f6", ec="#d0d0d0"))
        a.add_patch(FancyBboxPatch((16, 70 + 62 * 2), 328, 50, boxstyle="round,pad=0,rounding_size=8", fc="#d9f2d9", ec=C["y"], lw=2.5))
        a.scatter([210], [70 + 62 * 2 + 25], s=160, marker="x", color=C["x"], linewidths=3, zorder=3)
        a.text(222, 70 + 62 * 2 + 12, "(x, y)", fontsize=14, color=C["x"])
        a.set_title(L("2D: every target is on screen,\none point = one element", "2D：目标都在屏幕上，\n一个点 = 一个元素",
                      "2D：対象は全部画面内、\n1 点 = 1 要素"), fontsize=14)
        ax = fig.add_axes([0.27, 0.0, 0.73, 0.95], projection="3d")
        ax.view_init(elev=24, azim=-118)
        # frustum
        far = 2.9
        fh, fv = np.tan(np.radians(32)) * far, np.tan(np.radians(25)) * far
        fr = np.array([[-fh, far, -fv], [fh, far, -fv], [fh, far, fv], [-fh, far, fv]])
        for q in fr:
            ax.plot([0, q[0]], [0, q[1]], [0, q[2]], color=C["gray"], lw=1, alpha=0.7)
        ax.add_collection3d(Poly3DCollection([fr], facecolor=C["fill"], edgecolor=C["gray"], alpha=0.18))
        for gx in np.linspace(-1.6, 1.6, 9):
            ax.plot([gx, gx], [-1.8, 3.0], [-0.9, -0.9], color="#dddddd", lw=0.8)
        for gy in np.linspace(-1.8, 3.0, 13):
            ax.plot([-1.6, 1.6], [gy, gy], [-0.9, -0.9], color="#dddddd", lw=0.8)
        # virtual box
        bx = [[box_lo[0], box_hi[0]], [box_lo[1], box_hi[1]], [box_lo[2], box_hi[2]]]
        faces = []
        for axis in range(3):
            for s in range(2):
                f = []
                for a_ in range(2):
                    for b_ in ([0, 1] if a_ == 0 else [1, 0]):
                        v = [0, 0, 0]
                        v[axis] = bx[axis][s]
                        o1, o2 = [i for i in range(3) if i != axis]
                        v[o1] = bx[o1][a_]
                        v[o2] = bx[o2][b_]
                        f.append(v)
                faces.append(f)
        ax.add_collection3d(Poly3DCollection(faces, facecolor="#c9b8a6", edgecolor="#7a6a58", alpha=0.85))
        cols = {"vis": C["y"], "occ": C["b"], "out": C["x"]}
        for k, p in panels.items():
            vis, inf = status[k]
            kind = "vis" if vis > 0.9 else ("occ" if inf > 0.5 else "out")
            corners = panel_corners(p["c"], p["n"], p["w"], p["h"])
            ax.add_collection3d(Poly3DCollection([corners], facecolor=cols[kind], edgecolor=C["dark"], alpha=0.95))
            off = {"A": (-0.55, 0, 0.3), "B": (0.1, 0, 0.32), "C": (0.1, 0, 0.32), "D": (0.45, 0, 0.32)}[k]
            ax.text(*(np.asarray(p["c"]) + np.array(off)), f"{k}: {100 * vis:.0f}%", fontsize=12.5, ha="center", zorder=10)
        # head and hand ray to panel A
        ax.scatter([0], [0], [0], s=220, color=C["dark"])
        ax.text(-0.75, 0.0, 0.1, L("user", "用户", "ユーザー"), fontsize=13)
        hand = np.array([0.18, 0.25, -0.35])
        tgt = np.array([-0.1, 1.6, 0.0])
        ax.plot(*np.c_[hand, tgt], color=C["x"], lw=2.5)
        ax.scatter(*tgt, s=60, color=C["x"])
        ax.set_xlim(-1.6, 1.6)
        ax.set_ylim(-1.8, 3.0)
        ax.set_zlim(-0.9, 0.9)
        ax.set_box_aspect((3.2, 4.8, 1.8))
        ax.set_axis_off()
        from matplotlib.patches import Patch
        hdl = [Patch(color=cols["vis"], label=L("visible", "可见", "見える")),
               Patch(color=cols["occ"], label=L("in view, occluded", "在视野内但被遮挡", "視野内だが遮蔽")),
               Patch(color=cols["out"], label=L("outside the field of view", "在视野外", "視野外"))]
        ax.legend(handles=hdl, loc="upper left", fontsize=12, frameon=False, bbox_to_anchor=(0.02, 0.98))
        ax.set_title(L("3D: targets at depth, occluded, beside or behind the user", "3D：目标有深度、会被遮挡、在用户侧面或身后",
                       "3D：対象は奥行きを持ち、遮られ、横や背後にもある"), fontsize=14)
        out(fig, f"02-2d-vs-3d_{lang}.svg")
    return status


# ================================================================================================
# 10. Latency: per-step times of agents vs the XR frame budget (localized)
# ================================================================================================
def fig_latency():
    rows = [  # (seconds, en, zh, ja, colour key)
        (1 / 90, "XR frame at 90 Hz (11 ms)", "90 Hz 的 XR 一帧（11 ms）", "90 Hz の XR 1 フレーム（11 ms）", "ref"),
        (0.114, "Lumine game agent: first action (114 ms)", "Lumine 游戏智能体：首个动作（114 ms）", "Lumine ゲームエージェント：最初の行動（114 ms）", "game"),
        (0.234, "Lumine with reasoning (234 ms)", "Lumine 含推理（234 ms）", "Lumine 推論あり（234 ms）", "game"),
        (2.5, "UI-TARS-2 per step, W4A8 (2.5 s)", "UI-TARS-2 每步，W4A8（2.5 s）", "UI-TARS-2 1 ステップ、W4A8（2.5 s）", "gui"),
        (4.0, "UI-TARS-2 per step, full (4.0 s)", "UI-TARS-2 每步，全精度（4.0 s）", "UI-TARS-2 1 ステップ、フル精度（4.0 s）", "gui"),
        (4.0, "DuoZone XR window layout, per turn (~4 s)", "DuoZone XR 窗口布局，每轮（约 4 s）", "DuoZone XR ウィンドウ配置、1 ターン（約 4 s）", "xr"),
        (9.1, "SIAgent VR intent agent, LLM (~9.1 s)", "SIAgent VR 意图智能体，LLM（约 9.1 s）", "SIAgent VR 意図エージェント、LLM（約 9.1 s）", "xr"),
        (49, "NavAI VR navigation, per turn (~49 s)", "NavAI VR 导航，每轮（约 49 s）", "NavAI VR ナビゲーション、1 ターン（約 49 s）", "xr"),
    ]
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)  # noqa: E731
        ck = {"ref": C["gray"], "game": C["y"], "gui": C["a"], "xr": C["b"]}
        fig, ax = plt.subplots(figsize=(10.5, 5.8))
        ys = np.arange(len(rows))[::-1]
        for y, (s, en, zh, ja, k) in zip(ys, rows):
            ax.barh(y, s, color=ck[k], height=0.62, left=0.005)
            ax.text(s * 1.25 + 0.005, y, label(lang, en, zh, ja), va="center", fontsize=12)
        ax.set_xscale("log")
        ax.set_xlim(0.005, 3000)
        ax.set_yticks([])
        ax.set_xlabel(L("seconds (log scale)", "秒（对数刻度）", "秒（対数目盛）"))
        ax.axvline(1 / 90, color=C["gray"], ls=":")
        ax.grid(axis="y", visible=False)
        from matplotlib.patches import Patch
        hdl = [Patch(color=ck["game"], label=L("real-time 3D game agent", "实时 3D 游戏智能体", "リアルタイム 3D ゲームエージェント")),
               Patch(color=ck["gui"], label=L("2D GUI agent", "2D GUI 智能体", "2D GUI エージェント")),
               Patch(color=ck["xr"], label=L("XR research prototypes", "XR 研究原型", "XR 研究プロトタイプ"))]
        ax.legend(handles=hdl, loc="upper right", fontsize=11.5, frameon=False)
        out(fig, f"02-latency_{lang}.svg")


if __name__ == "__main__":
    fig_timeline()
    fig_loop()
    fig_observations()
    fig_inputs()
    fig_grounding()
    fig_levers()
    fig_training()
    fig_progress()
    st = fig_2d3d()
    print("panel visibility (visible fraction, in-frustum fraction):", {k: (round(a, 2), round(b, 2)) for k, (a, b) in st.items()})
    fig_latency()
