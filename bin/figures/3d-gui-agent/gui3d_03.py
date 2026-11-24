"""Figures for 3D GUI Agent post 03: why 3D interfaces are hard to operate.

Run from anywhere:
    python3 bin/figures/3d-gui-agent/gui3d_03.py            # writes the SVGs
    python3 bin/figures/3d-gui-agent/gui3d_03.py /tmp/prev  # ... and PNG previews into /tmp/prev

Every number plotted here comes from the research dossier
docs/research/3d-gui-agent/02-3d-ui-and-xr-interaction.md (work IDs such as B09, D13 in the
comments) and is quoted with its source in the post. Two figures use a toy model of our own (the arm
poses of the fatigue figure); its assumptions are written next to the code and in the caption.
All figures have words, so each is written in three variants: name_en.svg, name_zh.svg, name_ja.svg.
"""
import os
import sys
import pathlib

os.environ.setdefault("SOURCE_DATE_EPOCH", "0")  # reproducible SVG metadata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

import numpy as np  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle, Circle  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402

plt.rcParams["svg.hashsalt"] = "3d-gui-agent-03"

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/img/blog/3d-gui-agent"
PREV = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None


def out(fig, name):
    if PREV is not None:
        PREV.mkdir(parents=True, exist_ok=True)
        fig.savefig(PREV / name.replace(".svg", ".png"), dpi=60)
    save(fig, OUT / name)


def L(lang, en, zh, ja):
    return label(lang, en=en, zh=zh, ja=ja)


# ============================================================================================
# 1. Task taxonomy (A01) with today's headset form and the matching agent action
# ============================================================================================
TASKS = [
    dict(c=C["z"],
         name=("Selection", "选择", "選択"),
         classic=("ray, cone, Go-Go,\nimage plane, WIM", "射线、锥体、Go-Go、\n像平面、WIM", "レイ、コーン、Go-Go、\n画像平面、WIM"),
         today=("gaze + pinch, hand ray,\ncontroller ray, poke", "注视+捏合、手部射线、\n手柄射线、直接点按", "視線+ピンチ、ハンドレイ、\nコントローラ、直接タップ"),
         agent="select(id)"),
    dict(c=C["a"],
         name=("Manipulation", "操纵", "操作"),
         classic=("grasp, HOMER,\nbimanual, widgets", "抓取、HOMER、\n双手、控件", "把持、HOMER、\n両手、ウィジェット"),
         today=("pinch-and-drag,\ngrab, two-hand scale", "捏合拖动、\n抓取、双手缩放", "ピンチ＆ドラッグ、\n掴む、両手で拡縮"),
         agent="set_pose(obj, T)"),
    dict(c=C["y"],
         name=("Navigation", "导航", "ナビゲーション"),
         classic=("travel: walk, steer,\nteleport; wayfinding", "移动：行走、转向、\n传送；寻路", "移動：歩行、操縦、\nテレポート；経路探索"),
         today=("walk, teleport,\nrecentre, turn\nto find windows", "行走、传送、\n重新居中、\n转身找窗口", "歩く、テレポート、\n再センタリング、\n振り向いて窓を探す"),
         agent="travel(to)\nfind(x)"),
    dict(c=C["b"],
         name=("System control", "系统控制", "システム制御"),
         classic=("menus, voice, gestures,\ntools, multimodal", "菜单、语音、手势、\n工具、多模态", "メニュー、音声、ジェスチャ、\nツール、マルチモーダル"),
         today=("launcher, settings,\nwindows, Full Space", "启动器、设置、\n窗口、全空间", "ランチャー、設定、\nウィンドウ、Full Space"),
         agent="command(path)"),
    dict(c=C["x"],
         name=("Symbolic input", "符号输入", "記号入力"),
         classic=("virtual keyboards,\nchording, speech", "虚拟键盘、\n和弦键盘、语音", "仮想キーボード、\nコード入力、音声"),
         today=("ray / touch keyboard,\ndictation, EMG writing", "射线/触控键盘、\n听写、肌电手写", "レイ/タッチキーボード、\n音声入力、EMG手書き"),
         agent="type(text)"),
]


def fig_taxonomy(lang):
    fig, ax = plt.subplots(figsize=(15.5, 7.6))
    ax.set_xlim(0, 16.6); ax.set_ylim(0, 8.3); ax.axis("off")
    rows = [L(lang, "classic\ntechniques", "经典\n技术", "古典的な\n手法"),
            L(lang, "on today's\nheadsets", "今天的\n头显", "現在の\nヘッドセット"),
            L(lang, "agent\naction", "智能体\n动作", "エージェント\nの行動")]
    ys = [5.1, 3.05, 1.0]
    for y, r in zip(ys, rows):
        ax.text(0.75, y + 0.75, r, ha="center", va="center", fontsize=13, color=C["dark"])
    # root
    ax.add_patch(FancyBboxPatch((5.3, 7.45), 6.6, 0.7, boxstyle="round,pad=0.05", fc=C["fill"], ec=C["a"], lw=2))
    ax.text(8.6, 7.8, L(lang, "3D interaction tasks (Bowman et al.; LaViola et al.)", "三维交互任务（Bowman 等；LaViola 等）",
                        "3D インタラクションのタスク（Bowman ら；LaViola ら）"), ha="center", va="center", fontsize=14)
    li = {"en": 0, "zh": 1, "ja": 2}[lang]
    for i, t in enumerate(TASKS):
        x0 = 1.55 + i * 3.0
        cx = x0 + 1.4
        ax.plot([8.6, cx], [7.45, 7.0], color=C["gray"], lw=1.4)
        ax.add_patch(FancyBboxPatch((x0, 6.4), 2.8, 0.6, boxstyle="round,pad=0.05", fc=t["c"], ec=t["c"], alpha=0.9))
        ax.text(cx, 6.7, t["name"][li], ha="center", va="center", fontsize=13.5 if lang == "en" else 13, color="white", weight="bold")
        for y, key in zip(ys, ("classic", "today", None)):
            ax.add_patch(FancyBboxPatch((x0, y), 2.8, 1.5, boxstyle="round,pad=0.05",
                                        fc="white" if key else "#f6f6f6", ec=t["c"], lw=1.8))
            txt = t[key][li] if key else t["agent"]
            ax.text(cx, y + 0.75, txt, ha="center", va="center", fontsize=11 if key else 12,
                    family=None if key else "monospace", color=C["dark"])
        for ya, yb in ((6.4, 6.6), (5.1, 4.55), (3.05, 2.5)):
            ax.annotate("", xy=(cx, yb if ya != 6.4 else 6.6), xytext=(cx, ya if ya != 6.4 else 6.4),
                        arrowprops=dict(arrowstyle="-", color=t["c"]))
    ax.text(8.6, 0.35, L(lang, "System control is the task where the user says what and the system decides how; an agent turns every task into it.",
                         "系统控制：用户说“做什么”，系统决定“怎么做”；智能体把每个任务都变成这种形式。",
                         "システム制御では利用者が「何を」を言い、システムが「どうやるか」を決める。エージェントはすべてのタスクをこの形に変える。"),
            ha="center", va="center", fontsize=12, color=C["a"], style="italic")
    out(fig, f"03-taxonomy_{lang}.svg")


# ============================================================================================
# 2. Input techniques: Fitts' law lines (B09, HoloLens 2, 3 deg targets) and error rates (D13)
# ============================================================================================
B09 = [("Handray", -0.27, 0.88, C["x"]), ("HeadCrusher", 0.96, 0.49, C["gray"]),
       ("Gaze&Finger", 0.71, 0.35, C["c"]), ("Gaze&Pinch", 0.63, 0.35, C["a"]),
       ("Gaze&Handray", -0.59, 0.79, C["b"])]
D13 = [("HeadGaze", 8.8), ("Handray", 15.0), ("DirectTouch", 15.6), ("Gaze&Pinch", 23.5)]


def fig_input(lang):
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13.5, 5.6), gridspec_kw=dict(width_ratios=[1.25, 1]))
    ids = np.linspace(np.log2(3.5 / 3 + 1), np.log2(15 / 3 + 1), 50)  # B09: amplitudes 3.5-15 deg, width 3 deg
    for name, a, b, col in B09:
        a1.plot(ids, a + b * ids, color=col, lw=3 if name in ("Handray", "Gaze&Pinch") else 2, label=f"{name}: {a:+.2f} + {b:.2f} ID")
    a1.set_xlabel(L(lang, "index of difficulty ID = log2(A/W + 1)  [bit]", "难度指数 ID = log2(A/W + 1)  [bit]", "難易度指数 ID = log2(A/W + 1)  [bit]"))
    a1.set_ylabel(L(lang, "movement time MT [s]", "移动时间 MT [s]", "移動時間 MT [s]"))
    a1.set_title(L(lang, "(a) fitted Fitts' law lines, HoloLens 2, N = 20", "(a) Fitts 定律拟合直线，HoloLens 2，N = 20", "(a) Fitts の法則の回帰直線、HoloLens 2、N = 20"), fontsize=14)
    a1.legend(fontsize=11, loc="upper left", frameon=False)
    a1.set_ylim(0, 2.4)
    a1.text(2.55, 0.12, L(lang, "slope: Handray 0.88 s/bit\nGaze&Pinch 0.35 s/bit (2.5x flatter)",
                          "斜率：Handray 0.88 s/bit\nGaze&Pinch 0.35 s/bit（平 2.5 倍）",
                          "傾き：Handray 0.88 s/bit\nGaze&Pinch 0.35 s/bit（2.5 倍緩やか）"), ha="right", fontsize=11.5, color=C["dark"])
    names = [n for n, _ in D13]
    vals = [v for _, v in D13]
    y = np.arange(len(names))
    a2.barh(y, vals, color=[C["gray"], C["x"], C["y"], C["a"]], height=0.55,
            label=L(lang, "parked car", "停车状态", "停車中"))
    a2.axvspan(20.4, 36.0, color=C["b"], alpha=0.18, label=L(lang, "driving: 20.4-36.0 (range over techniques)", "行驶中：20.4-36.0（各技术范围）", "走行中：20.4-36.0（手法間の範囲）"))
    for yi, v in zip(y, vals):
        a2.text(v + 0.6, yi, f"{v:.1f}%", va="center", fontsize=12)
    a2.set_yticks(y); a2.set_yticklabels(names)
    a2.set_xlim(0, 40)
    a2.set_xlabel(L(lang, "selection error rate [%]", "选择错误率 [%]", "選択エラー率 [%]"))
    a2.set_title(L(lang, "(b) errors in a car, Varjo XR-3, N = 24", "(b) 车内错误率，Varjo XR-3，N = 24", "(b) 車内でのエラー、Varjo XR-3、N = 24"), fontsize=14)
    a2.legend(fontsize=10.5, loc="lower right", frameon=True)
    a2.grid(axis="y", alpha=0)
    fig.tight_layout()
    out(fig, f"03-input-fitts_{lang}.svg")


# ============================================================================================
# 3. The cost of depth and of the confirm action (A21, A24, A25, A26)
# ============================================================================================
def fig_depth(lang):
    fig, axs = plt.subplots(1, 3, figsize=(15, 5.4), gridspec_kw=dict(width_ratios=[1, 1.05, 1.15]))
    a = axs[0]
    lab = [L(lang, "lateral", "横向", "横方向"), L(lang, "in depth", "深度方向", "奥行き方向")]
    a.bar([0, 1], [100, 125], color=[C["z"], C["x"]], width=0.55)
    a.bar([1], [9], bottom=[100], color="none", edgecolor=C["dark"], hatch="//", width=0.55,
          label=L(lang, "part explained by\nvisual size (9%)", "可由视觉大小\n解释的部分（9%）", "見かけの大きさで\n説明できる分（9%）"))
    a.text(1, 127, "+25%", ha="center", fontsize=14, color=C["x"], weight="bold")
    a.set_xticks([0, 1]); a.set_xticklabels(lab)
    a.set_ylim(0, 145)
    a.set_ylabel(L(lang, "relative movement time [%]", "相对移动时间 [%]", "相対移動時間 [%]"))
    a.set_title(L(lang, "(a) virtual-hand pointing\nat stereo targets", "(a) 虚拟手指向\n立体显示目标", "(a) 立体表示ターゲットへの\n仮想手ポインティング"), fontsize=13.5)
    a.legend(fontsize=10.5, loc="upper left", frameon=False)
    a.grid(axis="x", alpha=0)

    a = axs[1]
    # A25: Quest 3, ray selection at 8 m, N = 24
    tot = np.array([15.20, 32.92])
    heis = tot * np.array([0.8057, 0.7186])
    x = np.arange(2)
    a.bar(x, heis, color=C["b"], width=0.55, label=L(lang, "confirm moved the ray\n(Heisenberg effect)", "确认动作带偏射线\n（海森堡效应）", "確定動作でレイがずれる\n（ハイゼンベルク効果）"))
    a.bar(x, tot - heis, bottom=heis, color=C["gray"], width=0.55, label=L(lang, "other errors", "其他错误", "その他のエラー"))
    for xi, t, f in zip(x, tot, (80.57, 71.86)):
        a.text(xi, t + 1, f"{t:.1f}%\n({f:.0f}% Heis.)", ha="center", fontsize=11.5)
    a.set_xticks(x); a.set_xticklabels([L(lang, "controller", "手柄", "コントローラ"), L(lang, "bare hand", "徒手", "素手")])
    a.set_ylim(0, 45)
    a.set_ylabel(L(lang, "error rate [%]", "错误率 [%]", "エラー率 [%]"))
    a.set_title(L(lang, "(b) ray selection at 8 m,\nQuest 3, N = 24", "(b) 8 m 处射线选择，\nQuest 3，N = 24", "(b) 8 m 先のレイ選択、\nQuest 3、N = 24"), fontsize=13.5)
    a.legend(fontsize=10, loc="upper left", frameon=False)
    a.grid(axis="x", alpha=0)

    a = axs[2]
    rows = [(L(lang, "virtual hand\n(stereo TV)", "虚拟手\n（立体电视）", "仮想手\n（立体TV）"), 0.96, 0.98, "+CTD"),
            (L(lang, "distal ray\n(Quest 2)", "远距射线\n（Quest 2）", "遠距離レイ\n（Quest 2）"), 0.733, 0.9786, "angular ID"),
            (L(lang, "gaze + pinch\n(Quest Pro)", "注视+捏合\n（Quest Pro）", "視線+ピンチ\n（Quest Pro）"), 0.63, 0.93, "+diopter")]
    y = np.arange(len(rows))[::-1]
    a.barh(y + 0.18, [r[1] for r in rows], height=0.34, color=C["gray"],
           label=L(lang, "baseline model", "基线模型", "ベースラインモデル"))
    a.barh(y - 0.18, [r[2] for r in rows], height=0.34, color=C["a"],
           label=L(lang, "model with a depth / angle term", "含深度/角度项的模型", "奥行き/角度項を含むモデル"))
    for yi, r in zip(y, rows):
        a.text(r[1] + 0.01, yi + 0.18, f"{r[1]:.2f}", va="center", fontsize=11)
        a.text(r[2] + 0.01, yi - 0.18, f"{r[2]:.2f}  {r[3]}", va="center", fontsize=11)
    a.set_yticks(y); a.set_yticklabels([r[0] for r in rows], fontsize=12)
    a.set_xlim(0.5, 1.22)
    a.set_xlabel(L(lang, "fit of the movement-time model (R²)", "移动时间模型拟合度（R²）", "移動時間モデルの適合度（R²）"))
    a.set_title(L(lang, "(c) 3D pointing needs depth\nor angle in the model", "(c) 三维指向模型需要\n深度或角度项", "(c) 3D ポインティングには\n奥行き・角度の項が要る"), fontsize=13.5)
    a.legend(fontsize=10, loc="upper center", bbox_to_anchor=(0.4, -0.16), frameon=False, ncol=1)
    a.grid(axis="y", alpha=0)
    fig.tight_layout()
    out(fig, f"03-depth-cost_{lang}.svg")


# ============================================================================================
# 4. Comfort distances in the platform guidelines (C01-C04) and the lab optimum (A21)
# ============================================================================================
def fig_comfort(lang):
    fig, ax = plt.subplots(figsize=(13, 5.8))
    rows = [
        ("Microsoft MR", [(1.25, 5.0, C["y"], L(lang, "optimal hologram zone", "最佳全息区", "最適ホログラム域"))],
         [(0.30, "x", L(lang, "clip", "裁切", "クリップ")), (0.40, "b", L(lang, "fade", "淡出", "フェード")), (2.0, "a", L(lang, "focal", "焦距", "焦点"))], []),
        ("Meta Horizon OS", [(0.42, 0.46, C["z"], L(lang, "touch", "触控", "タッチ")), (0.8, 3.0, C["y"], L(lang, "indirect (ray / gaze)", "间接（射线/注视）", "間接（レイ/視線）"))],
         [], [(0.5, 0.8, L(lang, "avoid", "避免", "避ける"))]),
        ("Android XR", [(0.75, 5.0, C["y"], L(lang, "panel movement limits", "面板移动范围", "パネル移動範囲"))],
         [(1.75, "a", L(lang, "launch", "启动", "起動"))], []),
        ("visionOS", [(1.0, 6.0, C["y"], L(lang, "reading content: 1 m or more", "阅读内容：1 m 以上", "読む内容：1 m 以上"))],
         [(2.0, "a", L(lang, "first window", "第一个窗口", "最初のウィンドウ"))], []),
        (L(lang, "lab (stereo pointing)", "实验（立体指向）", "実験（立体ポインティング）"),
         [(0.5, 0.65, C["z"], L(lang, "best touch distance", "最佳触控距离", "最適なタッチ距離"))], [], []),
    ]
    for i, (name, bars, marks, avoid) in enumerate(rows):
        y = len(rows) - 1 - i
        for lo, hi, col, txt in bars:
            ax.add_patch(Rectangle((lo, y - 0.22), hi - lo, 0.44, fc=col, ec="none", alpha=0.55))
            xm = np.sqrt(lo * hi)
            ax.text(xm, y + 0.32, txt, ha="center", va="bottom", fontsize=11.5, color=C["dark"])
        for x, c, txt in marks:
            ax.plot([x, x], [y - 0.3, y + 0.3], color=C[c], lw=3)
            ax.text(x * 1.03, y - 0.12, f"{txt} {x:g} m", ha="left", va="top", fontsize=11, color=C[c],
                    bbox=dict(fc="white", ec="none", alpha=0.85, pad=1))
        for lo, hi, txt in avoid:
            ax.add_patch(Rectangle((lo, y - 0.22), hi - lo, 0.44, fc="none", ec=C["x"], hatch="xx", lw=1.5))
            ax.text(np.sqrt(lo * hi), y - 0.36, txt, ha="center", va="top", fontsize=11, color=C["x"])
    ax.axvspan(0.25, 0.7, color=C["b"], alpha=0.07)
    ax.text(0.27, -0.45, L(lang, "within arm's reach:\ndirect touch possible", "手臂可及范围：\n可直接触控", "腕の届く範囲：\n直接タッチ可能"),
            fontsize=11, color=C["b"], va="center")
    ax.set_xscale("log")
    ax.xaxis.set_minor_formatter(matplotlib.ticker.NullFormatter())
    ax.set_xlim(0.25, 6.5)
    ax.set_ylim(-0.8, len(rows) - 0.2)
    ax.set_xticks([0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5])
    ax.set_xticklabels(["0.3", "0.5", "0.75", "1", "1.5", "2", "3", "5"])
    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels([r[0] for r in rows][::-1])
    ax.set_xlabel(L(lang, "distance from the eyes [m] (log scale)", "离眼睛的距离 [m]（对数刻度）", "目からの距離 [m]（対数目盛）"))
    ax.grid(axis="y", alpha=0)
    fig.tight_layout()
    out(fig, f"03-comfort-zones_{lang}.svg")


# ============================================================================================
# 5. World-, body-, head-locked and tag-along content when the user turns (C04, C05, C06)
# ============================================================================================
def panel3d(ax, yaw_deg, dist, z, w, h, col, alpha=0.55, ls="-"):
    t = np.radians(yaw_deg)
    fwd = np.array([-np.sin(t), np.cos(t), 0.0])  # yaw > 0 turns left (counter-clockwise from above)
    right = np.array([np.cos(t), np.sin(t), 0.0])
    c = fwd * dist + np.array([0, 0, z])
    up = np.array([0, 0, 1.0])
    P = [c - right * w / 2 - up * h / 2, c + right * w / 2 - up * h / 2, c + right * w / 2 + up * h / 2, c - right * w / 2 + up * h / 2]
    poly = Poly3DCollection([P], facecolor=col, edgecolor=col, alpha=alpha, linewidths=2, linestyles=ls)
    ax.add_collection3d(poly)
    return c


def person(ax, torso_yaw, head_yaw):
    t = np.radians(torso_yaw)
    th = np.linspace(0, 2 * np.pi, 40)
    ex, ey = 0.2 * np.cos(th), 0.11 * np.sin(th)
    rx, ry = ex * np.cos(t) - ey * np.sin(t), ex * np.sin(t) + ey * np.cos(t)
    for zz in (0.95, 1.38):
        ax.plot(rx, ry, zz, color=C["dark"], lw=1.2)
    for k in range(0, 40, 5):
        ax.plot([rx[k], rx[k]], [ry[k], ry[k]], [0.95, 1.38], color="#999999", lw=0.8)
    u, v = np.mgrid[0:2 * np.pi:18j, 0:np.pi:12j]
    ax.plot_surface(0.1 * np.cos(u) * np.sin(v), 0.1 * np.sin(u) * np.sin(v), 1.56 + 0.12 * np.cos(v), color="#bbbbbb", alpha=0.95, linewidth=0)
    h = np.radians(head_yaw)
    for s_ in (-1, 1):  # central 41 deg of the field of view (Android XR guideline, C02)
        a = h + s_ * np.radians(20.5)
        ax.plot([0, -np.sin(a) * 2.5], [0, np.cos(a) * 2.5], [1.56, 1.56], color=C["a"], lw=1.3, ls="--")
    ax.plot([0, -np.sin(h) * 0.45], [0, np.cos(h) * 0.45], [1.56, 1.56], color=C["a"], lw=3.5)


def fig_frames(lang):
    fig = plt.figure(figsize=(14, 7.2))
    names = {"world": L(lang, "world-locked", "世界锁定", "ワールド固定"),
             "body": L(lang, "body-locked", "身体锁定", "ボディ固定"),
             "head": L(lang, "head-locked", "头部锁定", "ヘッド固定"),
             "tag": L(lang, "tag-along", "跟随（tag-along）", "タグアロング")}
    cols = {"world": C["y"], "body": C["b"], "head": C["x"], "tag": C["z"]}
    states = [(0, 0, L(lang, "(a) looking ahead", "(a) 正视前方", "(a) 前を見ている")),
              (60, 20, L(lang, "(b) head turned 60\u00b0 left, torso 20\u00b0", "(b) 头向左转 60\u00b0，躯干 20\u00b0", "(b) 頭を左へ 60\u00b0、胴体 20\u00b0"))]
    # panel definitions: (yaw offset, distance, height, width, height)
    P0 = dict(world=(0, 2.2, 1.55, 1.1, 0.65), body=(-35, 0.8, 1.12, 0.42, 0.28),
              head=(16, 1.1, 1.82, 0.3, 0.18), tag=(-18, 1.5, 1.4, 0.5, 0.32))
    for k, (hy, ty, title) in enumerate(states):
        ax = fig.add_subplot(1, 2, k + 1, projection="3d")
        ax.set_axis_off()
        rr = np.linspace(0, 2 * np.pi, 80)
        for rad in (1.0,):
            ax.plot(rad * np.cos(rr), rad * np.sin(rr), np.full_like(rr, 0.95), color="#dddddd", lw=1)
        person(ax, ty, hy)
        yaw = dict(world=P0["world"][0], body=ty + P0["body"][0], head=hy + P0["head"][0],
                   tag=P0["tag"][0] if k == 0 else hy - 20.5 + 6)  # tag-along: lags, then rests at the edge of the view
        cen = {}
        for key in ("world", "tag", "body", "head"):
            _, d, z, w, hh = P0[key]
            cen[key] = panel3d(ax, yaw[key], d, z, w, hh, cols[key])
            if k == 1 and key != "world":
                aa = np.radians(np.linspace(P0[key][0], yaw[key], 30))
                ax.plot(-np.sin(aa) * d, np.cos(aa) * d, np.full_like(aa, z), color=cols[key], lw=1.8, ls=":")
        for key, dx, dz in (("world", 0, 0.45), ("tag", 0, -0.4), ("body", 0.35, -0.3), ("head", 0, 0.32 if k else 0.2)):
            c = cen[key]
            ax.text(c[0] + dx, c[1], c[2] + dz, names[key], color=cols[key], fontsize=13, ha="center", weight="bold")
        ax.set_xlim(-1.5, 1.4); ax.set_ylim(-0.5, 2.4); ax.set_zlim(0.95, 2.1)
        ax.set_box_aspect((2.9, 2.9, 1.15), zoom=1.35)
        ax.view_init(elev=42, azim=-98)
        ax.set_title(title, fontsize=14, y=0.98)
    fig.text(0.5, 0.04, L(lang, "dashed: central 41\u00b0 of the view (Android XR guideline); dotted arcs: how each panel moved; ring: 1 m",
                          "虚线：视野中央 41\u00b0（Android XR 指南）；点线弧：各面板的移动；圆环：1 m",
                          "破線：視野中央の 41\u00b0（Android XR ガイドライン）；点線の弧：各パネルの動き；円：1 m"), ha="center", fontsize=12, color=C["dark"])
    fig.subplots_adjust(left=0.0, right=1.0, top=0.95, bottom=0.06, wspace=-0.05)
    out(fig, f"03-reference-frames_{lang}.svg")


# ============================================================================================
# 6. Arm fatigue: shoulder load of arm poses (toy model) and Rohmert's endurance curve (D01)
# ============================================================================================
# Toy model (our assumptions, not data from the papers): body mass 70 kg; upper arm 0.30 m, 2.8% of
# body mass, centre of mass at 43.6% of its length; forearm + hand 0.35 m, 2.2% of body mass, centre
# of mass at 68.2% (Winter's anthropometric fractions, rounded); maximum shoulder flexion torque 50 N m.
G, MASS, L1, L2, TMAX = 9.81, 70.0, 0.30, 0.35, 50.0
M1, M2, R1, R2 = 0.028 * MASS, 0.022 * MASS, 0.436, 0.682


def arm_ik(hx, hz):
    """Elbow-down 2-link IK in the sagittal plane; shoulder at the origin, x forward, z up."""
    d = np.clip(np.hypot(hx, hz), 1e-6, L1 + L2 - 1e-6)
    c2 = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2)
    q2 = np.arccos(np.clip(c2, -1, 1))
    q1 = np.arctan2(hz, hx) + np.arctan2(L2 * np.sin(q2), L1 + L2 * np.cos(q2))
    e = np.array([L1 * np.cos(q1), L1 * np.sin(q1)])
    h = e + L2 * np.array([np.cos(q1 - q2), np.sin(q1 - q2)])
    return e, h


def shoulder_load(hx, hz):
    e, h = arm_ik(hx, hz)
    c1 = R1 * e
    c2 = e + R2 * (h - e)
    torque = G * (M1 * abs(c1[0]) + M2 * abs(c2[0]))
    return 100 * torque / TMAX, e, h


def rohmert(f):
    """Endurance time [s] at f percent of maximum (Rohmert's curve as used by Consumed Endurance)."""
    f = np.asarray(f, float)
    with np.errstate(invalid="ignore", divide="ignore"):
        et = 1236.5 / (f - 15.0) ** 0.618 - 72.5
    return np.where(f > 15.0, et, np.inf)


POSES = [  # hand position relative to the shoulder [m]
    ("rest", (0.06, -0.62), C["y"], ("hand at rest\n(gaze + pinch)", "手放在休息位\n（注视+捏合）", "手は休めた位置\n（視線+ピンチ）")),
    ("bent", (0.33, -0.12), C["z"], ("elbow bent\n(hand ray)", "屈肘\n（手部射线）", "肘を曲げる\n（ハンドレイ）")),
    ("reach", (0.62, -0.05), C["b"], ("arm extended\n(touch at 0.6 m)", "手臂伸直\n（0.6 m 处触控）", "腕を伸ばす\n（0.6 m でタッチ）")),
    ("high", (0.45, 0.35), C["x"], ("hand above shoulder\n(high panel)", "手高于肩\n（高处面板）", "肩より上\n（高いパネル）")),
]


def fig_fatigue(lang):
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 6), gridspec_kw=dict(width_ratios=[1.25, 1]))
    li = {"en": 0, "zh": 1, "ja": 2}[lang]
    loads = []
    for i, (key, (hx, hz), col, txt) in enumerate(POSES):
        f, e, h = shoulder_load(hx, hz)
        loads.append((key, f, col))
        ox = i * 1.0
        a1.plot([ox, ox], [0, -0.75], color="#bbbbbb", lw=8, solid_capstyle="round")  # torso
        a1.add_patch(Circle((ox, 0.2), 0.11, fc="#dddddd", ec="#999999"))
        a1.plot([ox, ox + e[0], ox + h[0]], [0, e[1], h[1]], color=col, lw=6, solid_capstyle="round")
        a1.plot([ox], [0], "o", color=C["dark"], ms=7)
        a1.text(ox + 0.18, -1.0, txt[li], ha="center", va="top", fontsize=11.5)
        a1.text(ox + 0.18, 0.55, f"{f:.0f}%", ha="center", fontsize=16, color=col, weight="bold")
    a1.text(-0.3, 0.8, L(lang, "shoulder load (% of max torque, toy model)", "肩部负荷（最大力矩的 %，玩具模型）", "肩の負荷（最大トルクの %、簡易モデル）"), fontsize=13)
    a1.text(3.18, 0.86, L(lang, "torque-only models miss the extra\neffort above the shoulder (NICE, NICER)", "仅基于力矩的模型低估了\n肩部以上的额外负担（NICE、NICER）",
                          "トルクだけのモデルは肩より上の\n追加負担を見落とす（NICE、NICER）"), fontsize=10.5, color=C["x"], ha="center")
    a1.set_xlim(-0.35, 3.85); a1.set_ylim(-1.55, 1.15); a1.set_aspect("equal"); a1.axis("off")

    f = np.linspace(15.3, 100, 400)
    a2.plot(f, rohmert(f), color=C["dark"])
    a2.axvline(15, color=C["x"], ls="--", lw=1.5)
    a2.text(16, 2500, L(lang, "asymptote at 15%:\nbelow it, endurance is\nunlimited and CE = 0", "15% 处的渐近线：\n低于它，耐力无限，\nCE = 0",
                        "15% の漸近線：\nこれ未満は持久時間が\n無限で CE = 0"), fontsize=11.5, color=C["x"], va="top")
    for key, fv, col in loads:
        if fv > 15:
            a2.plot([fv], [rohmert(fv)], "o", color=col, ms=10)
            a2.text(fv + 2, rohmert(fv) * 1.15, f"{fv:.0f}%: {float(rohmert(fv)):.0f} s", color=col, fontsize=12)
        else:
            pass
    low = ", ".join(f"{fv:.0f}%" for _, fv, _ in loads if fv <= 15)
    a2.text(16, 9, L(lang, f"{low}: CE = 0", f"{low}：CE = 0", f"{low}：CE = 0"), fontsize=12, color=C["dark"])
    a2.set_yscale("log")
    a2.set_ylim(5, 5000); a2.set_xlim(0, 100)
    a2.set_xlabel(L(lang, "required force f [% of maximum]", "所需力 f [最大值的 %]", "必要な力 f [最大値の %]"))
    a2.set_ylabel(L(lang, "endurance time [s]", "耐力时间 [s]", "持久時間 [s]"))
    a2.set_title(L(lang, "CE = interaction time / endurance time", "CE = 交互时间 / 耐力时间", "CE = 操作時間 / 持久時間"), fontsize=14)
    fig.tight_layout()
    out(fig, f"03-arm-fatigue_{lang}.svg")
    return loads


# ============================================================================================
# 7. Text entry rates: phone vs VR / AR methods (D04-D12, B02, B19)
# ============================================================================================
def fig_text(lang):
    T = lambda en, zh, ja: L(lang, en, zh, ja)  # noqa: E731
    REF, KB, SEL, HEAD, DEC, OTHER, UB = C["gray"], C["z"], C["a"], C["c"], C["b"], C["y"], C["dark"]
    rows = [
        (T("desktop keyboard, outside VR", "台式键盘（VR 外）", "デスクトップキーボード（VR 外）"), 41.4, REF, "D05"),
        (T("phone keyboard (37,370 people)", "手机键盘（37,370 人）", "スマホのキーボード（37,370 人）"), 36.2, REF, "D12"),
        (T("desktop keyboard inside VR", "VR 中的台式键盘", "VR 内のデスクトップキーボード"), 26.3, KB, "D05"),
        (T("touchscreen keyboard inside VR", "VR 中的触屏键盘", "VR 内のタッチスクリーンキーボード"), 11.6, KB, "D05"),
        (T("field mean of 137 XR techniques", "137 种 XR 技术的均值", "XR 手法 137 種の平均"), 20.36, OTHER, "D11"),
        (T("sEMG wristband handwriting", "肌电腕带手写", "sEMG リストバンド手書き"), 20.9, OTHER, "B19"),
        (T("head gesture typing, after 60 min", "头部手势输入（训练 60 分钟后）", "頭部ジェスチャ入力（60 分練習後）"), 24.73, HEAD, "D08"),
        (T("head gesture typing", "头部手势输入", "頭部ジェスチャ入力"), 19.04, HEAD, "D08"),
        (T("head tap typing", "头部指向+点击", "頭部ポインティング+タップ"), 15.58, HEAD, "D08"),
        (T("head dwell typing", "头部指向+驻留", "頭部ポインティング+ドウェル"), 10.59, HEAD, "D08"),
        (T("AR mid-air touch + decoder", "AR 空中触控 + 解码器", "AR 空中タッチ + デコーダ"), 17.75, DEC, "D09"),
        (T("controller pointing", "手柄指向", "コントローラでポインティング"), 15.44, SEL, "D04"),
        (T("controller tapping", "手柄敲击", "コントローラでタップ"), 12.69, SEL, "D04"),
        (T("head pointing", "头部指向", "頭部ポインティング"), 10.20, SEL, "D04"),
        (T("freehand (7.6% errors)", "徒手（错误率 7.6%）", "素手（エラー 7.6%）"), 9.77, SEL, "D04"),
        (T("continuous cursor", "连续光标", "連続カーソル"), 8.35, SEL, "D04"),
        (T("discrete cursor (d-pad)", "离散光标（方向键）", "離散カーソル（十字キー）"), 5.31, SEL, "D04"),
    ]
    fig, ax = plt.subplots(figsize=(12.5, 9.2))
    y = np.arange(len(rows))[::-1]
    for yi, (name, v, col, src) in zip(y, rows):
        ax.barh(yi, v, color=col, height=0.62)
        ax.text(v + 0.5, yi, f"{v:g}  [{src}]", va="center", fontsize=11.5)
    # simulated upper bounds (D10): ideal tracking + simulated auto-correction
    for v, txt in ((55.6, T("2 fingers on a surface", "表面上两指", "面上で 2 本指")), (34.5, T("10 fingers mid-air", "空中十指", "空中で 10 本指"))):
        ax.axvline(v, color=UB, ls=":", lw=1.6)
        ax.text(v, len(rows) - 0.2, T(f"upper bound:\n{txt} {v}", f"上限：\n{txt} {v}", f"上限：\n{txt} {v}"), ha="right" if v < 40 else "center", va="bottom", fontsize=10.5, color=UB)
    ax.axvline(36.2, color=REF, lw=2, ls="--")
    ax.set_yticks(y); ax.set_yticklabels([r[0] for r in rows], fontsize=12)
    ax.set_xlim(0, 62); ax.set_ylim(-0.7, len(rows) + 1.1)
    ax.set_xlabel(T("words per minute (wpm)", "每分钟单词数（wpm）", "1 分あたりの単語数（wpm）"))
    ax.grid(axis="y", alpha=0)
    handles = [Rectangle((0, 0), 1, 1, color=c) for c in (REF, KB, SEL, HEAD, DEC, OTHER)]
    ax.legend(handles, [T("reference outside VR", "VR 外参考值", "VR 外の参照値"), T("physical keyboard in VR", "VR 中的实体键盘", "VR 内の物理キーボード"),
                        T("selection keyboards, HTC Vive", "选择式键盘，HTC Vive", "選択式キーボード、HTC Vive"), T("head-based, HMD", "头部输入，HMD", "頭部入力、HMD"),
                        T("statistical decoder, AR", "统计解码器，AR", "統計デコーダ、AR"), T("other", "其他", "その他")],
              fontsize=10.5, loc="lower right", frameon=True)
    fig.tight_layout()
    out(fig, f"03-text-entry_{lang}.svg")


# ============================================================================================
# 8. Cybersickness by content (D16) with simulator cut-offs, and sickness dropout
# ============================================================================================
def fig_sickness(lang):
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13.5, 5.2), gridspec_kw=dict(width_ratios=[1.7, 1]))
    rows = [(L(lang, "gaming", "游戏", "ゲーム"), 34.26, (29.57, 38.95), 25),
            (L(lang, "all content (pooled)", "全部内容（合并）", "全コンテンツ（統合）"), 28.00, (24.66, 31.35), 54),
            (L(lang, "360° video", "360° 视频", "360° 動画"), 27.42, None, 10),
            (L(lang, "minimalist", "极简场景", "ミニマル"), 21.71, None, 5),
            (L(lang, "scenic", "风景", "風景"), 17.33, None, 10)]
    y = np.arange(len(rows))[::-1]
    for yi, (name, v, ci, n) in zip(y, rows):
        a1.barh(yi, v, color=C["a"] if n != 54 else C["dark"], height=0.6)
        if ci:
            a1.errorbar(v, yi, xerr=[[v - ci[0]], [ci[1] - v]], color=C["b"], capsize=5, lw=2)
        a1.text((ci[1] if ci else v) + 0.8, yi, f"{v:.1f}  (n = {n})", va="center", fontsize=11.5)
    for x, txt in ((10, L(lang, "significant", "明显", "顕著")), (15, L(lang, "concern", "值得关注", "懸念")), (20, L(lang, "problem", "有问题", "問題あり"))):
        a1.axvline(x, color=C["x"], ls="--", lw=1.4)
    a1.text(47, 0.2, L(lang, "simulator cut-offs:\n> 10 significant\n> 15 concern\n> 20 problem", "模拟器分界值：\n> 10 明显\n> 15 值得关注\n> 20 有问题",
                       "シミュレータの基準：\n> 10 顕著\n> 15 懸念\n> 20 問題あり"), color=C["x"], fontsize=11, ha="right", va="bottom")
    a1.set_yticks(y); a1.set_yticklabels([r[0] for r in rows])
    a1.set_xlim(0, 48); a1.set_ylim(-0.6, len(rows) - 0.4)
    a1.set_xlabel(L(lang, "total SSQ score (55 HMD studies, 3,016 people)", "SSQ 总分（55 项 HMD 研究，3,016 人）", "SSQ 合計点（HMD 研究 55 件、3,016 人）"))
    a1.grid(axis="y", alpha=0)
    # waffle: 15.6 of 100 participants dropped out because of sickness (46 experiments)
    k = 0
    for r in range(10):
        for c in range(10):
            a2.add_patch(Rectangle((c, 9 - r), 0.86, 0.86, fc=C["x"] if k < 16 else "#dcdcdc", ec="none"))
            k += 1
    a2.set_xlim(-0.2, 10); a2.set_ylim(-1.6, 10.1); a2.set_aspect("equal"); a2.axis("off")
    a2.text(5, -0.9, L(lang, "15.6% of participants left studies\nbecause of sickness (46 experiments)",
                       "15.6% 的参与者因晕动退出研究\n（46 项实验）", "参加者の 15.6% が酔いで研究を離脱\n（46 実験）"),
            ha="center", va="center", fontsize=12)
    fig.tight_layout()
    out(fig, f"03-sickness_{lang}.svg")


# ============================================================================================
# 9. Market: shipments on a log scale (E11, E15, E17) and why people did not buy (E18)
# ============================================================================================
def fig_market(lang):
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14.5, 6.2), gridspec_kw=dict(width_ratios=[1.1, 1]))
    yrs = [2021, 2022, 2023, 2024]
    hs = [11.2, 8.8, 6.7, 7.4]
    a1.plot(yrs, hs, color=C["a"], lw=2.5, label=L(lang, "AR/VR headsets (IDC)", "AR/VR 头显（IDC）", "AR/VR ヘッドセット（IDC）"))
    a1.plot(yrs[:2], hs[:2], "o", color=C["a"], ms=9)
    a1.plot(yrs[2:], hs[2:], "o", mfc="white", mec=C["a"], mew=2, ms=9, label=L(lang, "derived from IDC growth rates", "由 IDC 增长率推算", "IDC の伸び率から算出"))
    a1.plot([2025], [14.5], "D", mfc="white", mec=C["c"], mew=2, ms=10, label=L(lang, "all XR incl. glasses, 2025 (IDC forecast, Dec 2025)", "含眼镜的全部 XR，2025（IDC 2025 年 12 月预测）", "グラス含む全 XR、2025（IDC 2025年12月予測）"))
    a1.plot([2025], [7.0], "s", color=C["b"], ms=10, label=L(lang, "Meta AI glasses sold, 2025 (> 7 M)", "Meta AI 眼镜销量，2025（> 700 万）", "Meta AI グラス販売、2025（700 万超）"))
    a1.plot([2023, 2027], [8.1, 28.6], color=C["gray"], ls="--", lw=1.8, label=L(lang, "IDC forecast made in Dec 2023", "IDC 2023 年 12 月的预测", "IDC 2023年12月時点の予測"))
    a1.plot([2024, 2025], [1236.3, 1260.3], "o-", color=C["dark"], ms=8, label=L(lang, "smartphones (IDC)", "智能手机（IDC）", "スマートフォン（IDC）"))
    a1.annotate("", xy=(2025.25, 14.5), xytext=(2025.25, 1260.3), arrowprops=dict(arrowstyle="<->", color=C["x"], lw=1.5))
    a1.text(2025.35, 135, L(lang, "about 1.2%", "约 1.2%", "約 1.2%"), color=C["x"], fontsize=12.5, va="center")
    a1.set_yscale("log")
    a1.set_ylim(3, 3000); a1.set_xlim(2020.6, 2027.4)
    a1.set_ylabel(L(lang, "units shipped per year [millions]", "年出货量 [百万台]", "年間出荷台数 [百万台]"))
    a1.set_xticks(range(2021, 2028))
    a1.legend(fontsize=10, loc="center left", frameon=False, bbox_to_anchor=(0, 0.45))
    a1.set_title(L(lang, "(a) XR stays two orders of magnitude below phones", "(a) XR 比手机低两个数量级", "(a) XR はスマホより 2 桁少ない"), fontsize=14)

    cat = {"price": C["x"], "aware": C["a"], "subst": C["gray"], "comfort": C["b"], "sick": C["c"], "content": C["y"], "social": C["z"]}
    rows = [(L(lang, "price", "价格", "価格"), 65.5, "price"),
            (L(lang, "not aware of its capabilities", "不了解它能做什么", "何ができるか知らない"), 22.3, "aware"),
            (L(lang, "phone, TV or laptop suffice", "手机、电视或笔记本就够了", "スマホ・TV・PC で十分"), 20.9, "subst"),
            (L(lang, "uncomfortable", "不舒适", "快適でない"), 15.0, "comfort"),
            (L(lang, "nausea", "恶心", "吐き気"), 13.5, "sick"),
            (L(lang, "not enough content", "内容不足", "コンテンツ不足"), 12.2, "content"),
            (L(lang, "isolation", "孤立感", "孤立感"), 10.2, "social")]
    y = np.arange(len(rows) + 1)[::-1]
    for yi, (name, v, c) in zip(y[:-1], rows):
        a2.barh(yi, v, color=cat[c], height=0.6)
        a2.text(v + 1, yi, f"{v:.1f}%", va="center", fontsize=11.5)
    a2.barh(y[-1], 70, color="none", edgecolor=C["gray"], hatch="//", height=0.6)
    a2.text(35, y[-1], L(lang, "not offered as an answer", "问卷未提供此选项", "選択肢になかった"), ha="center", va="center", fontsize=11.5, color=C["dark"],
            bbox=dict(fc="white", ec="none"))
    a2.set_yticks(y)
    a2.set_yticklabels([r[0] for r in rows] + [L(lang, "\"too hard to use\"", "“太难用”", "「使いにくい」")])
    a2.set_xlim(0, 78)
    a2.set_xlabel(L(lang, "share of US non-buyers, Feb 2024, N = 1,069 [%]", "美国未购买者占比，2024 年 2 月，N = 1,069 [%]", "米国の非購入者の割合、2024年2月、N = 1,069 [%]"))
    a2.set_title(L(lang, "(b) why not buy a Vision Pro?", "(b) 为什么不买 Vision Pro？", "(b) Vision Pro を買わない理由"), fontsize=14)
    a2.grid(axis="y", alpha=0)
    fig.tight_layout()
    out(fig, f"03-market_{lang}.svg")


# ============================================================================================
# 10. The catalogue of 30 operations: who should act (dossier section 10)
# ============================================================================================
OPS = {  # number: (en, zh, ja, column, needs_access)
    1: ("small far target", "小而远的目标", "小さく遠い対象", 0, True),
    2: ("occluded, cluttered", "被遮挡、杂乱", "隠れた・密集", 0, True),
    3: ("buttons at mixed depths", "不同深度的按钮", "奥行きの違うボタン", 3, False),
    6: ("gaze + pinch button", "注视+捏合按钮", "視線+ピンチのボタン", 0, True),
    7: ("distant 3D object", "远处三维物体", "遠くの 3D 物体", 0, True),
    21: ("select while moving", "移动中选择", "移動中の選択", 1, False),
    5: ("precise rotate / scale", "精确旋转/缩放", "正確な回転・拡縮", 0, False),
    8: ("exact slider value", "精确滑块值", "スライダーの正確な値", 0, False),
    15: ("object onto real table", "物体放到真实桌面", "物体を実物の机へ", 0, False),
    4: ("travel far", "远距离移动", "遠くへ移動", 2, False),
    12: ("window behind you", "身后的窗口", "背後のウィンドウ", 0, True),
    24: ("object behind, seated", "坐姿下身后的物体", "座位で背後の物体", 0, False),
    11: ("open, place, resize", "打开、放置、缩放", "開く・置く・サイズ変更", 0, True),
    13: ("arrange windows", "排列多个窗口", "複数窓の配置", 0, False),
    14: ("pin to a wall", "固定到墙上", "壁に固定", 0, True),
    9: ("scroll to an item", "滚动找条目", "項目までスクロール", 0, False),
    10: ("voice \"that\"", "语音“那个”", "音声「あれ」", 0, True),
    16: ("enter Full Space", "进入全空间", "Full Space に入る", 2, False),
    26: ("open an app", "打开应用", "アプリを開く", 0, False),
    27: ("buried setting", "深层设置", "深い階層の設定", 1, False),
    30: ("control in any 3D app", "任意三维应用中的控件", "任意の 3D アプリの操作", 3, False),
    17: ("type a query", "输入搜索词", "検索語の入力", 1, False),
    18: ("password / PIN", "密码 / PIN", "パスワード / PIN", 3, False),
    19: ("long arm-up task", "长时间抬臂任务", "腕を上げ続ける作業", 0, False),
    20: ("novice first use", "新手首次使用", "初心者の初回利用", 2, False),
    28: ("learn a gesture", "学习手势", "ジェスチャを覚える", 2, False),
    29: ("multi-step procedure", "多步骤流程", "多段階の手順", 2, False),
    22: ("blind: menu button", "盲人：菜单按钮", "全盲：メニューボタン", 1, False),
    23: ("blind: find a seat", "盲人：找座位", "全盲：席を探す", 2, False),
    25: ("low vision: read text", "低视力：读文字", "ロービジョン：文字を読む", 2, False),
}
GROUPS = [
    (("Selection", "选择", "選択"), [1, 2, 6, 7, 3, 21]),
    (("Manipulation", "操纵", "操作"), [5, 8, 15]),
    (("Navigation", "导航", "ナビゲーション"), [12, 24, 4]),
    (("Windows, layout", "窗口与布局", "ウィンドウ・配置"), [11, 13, 14]),
    (("System control", "系统控制", "システム制御"), [9, 10, 26, 27, 16, 30]),
    (("Symbolic input", "符号输入", "記号入力"), [17, 18]),
    (("Body, learning", "身体与学习", "身体・学習"), [19, 20, 28, 29]),
    (("Accessibility", "无障碍", "アクセシビリティ"), [22, 23, 25]),
]


def fig_catalogue(lang):
    li = {"en": 0, "zh": 1, "ja": 2}[lang]
    cols = [L(lang, "agent does it", "智能体代做", "エージェントが行う"),
            L(lang, "does it, user confirms", "代做，用户确认", "行い、利用者が確認"),
            L(lang, "agent guides", "智能体引导", "エージェントが案内"),
            L(lang, "neither (yet)", "都不行（暂时）", "どちらも無理（現状）")]
    ccol = [C["y"], C["c"], C["b"], C["gray"]]
    fig, ax = plt.subplots(figsize=(15, 10.5))
    x0, cw = 2.6, 3.1
    row_h = [max([1] + [sum(1 for n in ids if OPS[n][3] == c) for c in range(4)]) for _, ids in GROUPS]
    total = sum(h * 0.5 + 0.35 for h in row_h)
    ax.set_xlim(0, x0 + 4 * cw + 0.1); ax.set_ylim(-0.9, total + 0.8); ax.axis("off")
    for c in range(4):
        ax.add_patch(Rectangle((x0 + c * cw + 0.05, total + 0.05), cw - 0.1, 0.6, fc=ccol[c], ec="none"))
        ax.text(x0 + c * cw + cw / 2, total + 0.35, cols[c], ha="center", va="center", fontsize=13, color="white", weight="bold")
    ytop = total
    for (gname, ids), h in zip(GROUPS, row_h):
        hh = h * 0.5 + 0.35
        ax.add_patch(Rectangle((0.05, ytop - hh + 0.04), x0 + 4 * cw - 0.05, hh - 0.08, fc="#f7f7f7", ec="#dddddd"))
        ax.text(0.15, ytop - hh / 2, gname[li], ha="left", va="center", fontsize=13, weight="bold", color=C["dark"])
        for c in range(4):
            k = 0
            for n in ids:
                op = OPS[n]
                if op[3] != c:
                    continue
                yy = ytop - 0.38 - k * 0.5
                ax.add_patch(FancyBboxPatch((x0 + c * cw + 0.15, yy - 0.19), cw - 0.3, 0.38, boxstyle="round,pad=0.02",
                                            fc="white", ec=ccol[c], lw=1.6))
                star = " *" if op[4] else ""
                ax.text(x0 + c * cw + 0.25, yy, f"{n:>2}  {op[li]}{star}", ha="left", va="center", fontsize=11.5, color=C["dark"])
                k += 1
        ytop -= hh
    ax.text(0.1, -0.45, L(lang, "* only with scene-graph, accessibility-tree or OS access; otherwise the agent can only guide.   #3: the best move is to re-place the targets on one depth plane.",
                          "* 仅当能访问场景图、无障碍树或系统接口时；否则只能引导。   #3：最佳做法是把目标重新放到同一深度平面上。",
                          "* シーングラフ・アクセシビリティツリー・OS へのアクセスがある場合のみ。なければ案内だけ。   #3：最善策はターゲットを同じ奥行き面に置き直すこと。"),
            fontsize=11, color=C["dark"], va="center")
    out(fig, f"03-catalogue_{lang}.svg")


if __name__ == "__main__":
    for lang in LANGS:
        fig_taxonomy(lang)
        fig_input(lang)
        fig_depth(lang)
        fig_comfort(lang)
        fig_frames(lang)
        loads = fig_fatigue(lang)
        fig_text(lang)
        fig_sickness(lang)
        fig_market(lang)
        fig_catalogue(lang)
    for key, f, _ in loads:
        print(f"shoulder load {key}: {f:.1f}%  endurance {float(rohmert(f)):.0f} s")
