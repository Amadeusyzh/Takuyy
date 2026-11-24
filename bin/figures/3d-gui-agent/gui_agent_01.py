"""Figures for 3D GUI Agent post 01: "3D GUI agents: a research vision".

    python3 bin/figures/3d-gui-agent/gui_agent_01.py

Writes assets/img/blog/3d-gui-agent/01-<name>_{en,zh,ja}.svg:

  01-loop-2d-vs-3d      the GUI-agent loop (observe, ground, act, verify) on a phone and on a headset
  01-operating-cost     published text-entry speeds and selection error rates, each with its source
  01-where-is-the-ui    top-down sketch: field-of-view wedge, five windows, visibility by ray casting
  01-accessibility      VRSight (UIST 2025) and SeeingVR (CHI 2019) menu-task outcomes
  01-autonomy-spectrum  explain ... act with takeover, with example operations and related studies
  01-column-map         how posts 01-05 of the column fit together

Every number comes from the column's dossiers (docs/research/3d-gui-agent/02 and 03), which cite the
primary sources; the post repeats each number with its source. The window layout of 01-where-is-the-ui
is illustrative and is not taken from any study or benchmark.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401,F403

import numpy as np  # noqa: E402
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Wedge, Circle, Polygon  # noqa: E402
from matplotlib.colors import to_rgb  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "assets" / "img" / "blog" / "3d-gui-agent"

GREEN = "#2a9d4b"
ORANGE = C["b"]
RED = C["x"]
GRAY = "#8a8a8a"


def L(lang, en, zh, ja):
    return label(lang, en=en, zh=zh, ja=ja)


def tint(col, a):
    r, g, b = to_rgb(col)
    return (1 - a + a * r, 1 - a + a * g, 1 - a + a * b)


def box(ax, x, y, w, h, text, fc, ec, fs=12, tc="#222222", lw=1.8, ls="-", weight="normal", ha="center", va="center"):
    p = FancyBboxPatch((x - w / 2, y - h / 2), w, h, boxstyle="round,pad=0.02,rounding_size=0.1",
                       fc=fc, ec=ec, lw=lw, ls=ls)
    ax.add_patch(p)
    tx = x if ha == "center" else x - w / 2 + 0.15
    ax.text(tx, y, text, ha=ha, va=va, fontsize=fs, color=tc, weight=weight, linespacing=1.3)
    return p


def arrow(ax, p0, p1, color="#555555", lw=2.0, style="-|>", ls="-", rad=0.0, ms=16):
    a = FancyArrowPatch(p0, p1, arrowstyle=style, color=color, lw=lw, ls=ls, mutation_scale=ms,
                        connectionstyle=f"arc3,rad={rad}", shrinkA=3, shrinkB=3)
    ax.add_patch(a)


def blank(ax):
    ax.set_axis_off()
    ax.grid(False)


# ------------------------------------------------------------------ 1. the loop, 2D vs 3D
def fig_loop():
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(15, 8.4))
        blank(ax)
        ax.set_xlim(-0.6, 15.0)
        ax.set_ylim(0, 8.4)
        stages = [
            ("observe", L(lang, "Observe", "观察", "観察")),
            ("ground", L(lang, "Ground", "定位", "グラウンディング")),
            ("act", L(lang, "Act", "执行", "実行")),
            ("verify", L(lang, "Verify", "验证", "検証")),
        ]
        phone = {
            "observe": L(lang, "screenshot + UI tree\nthe whole screen", "截图 + UI 树\n整个屏幕", "スクリーンショット + UI ツリー\n画面全体"),
            "ground": L(lang, "element -> pixel (x, y)", "元素 -> 像素 (x, y)", "要素 -> ピクセル (x, y)"),
            "act": L(lang, "tap, type, swipe", "点击、输入、滑动", "タップ、入力、スワイプ"),
            "verify": L(lang, "next screenshot;\nthe screen waits", "下一张截图；\n屏幕静止等待", "次のスクリーンショット；\n画面は待ってくれる"),
        }
        head = {
            "observe": L(lang, "per-eye view + scene graph\nonly the field of view,\nchanges with every head turn",
                         "单眼视图 + 场景图\n只有视野内的部分，\n随每次转头而变化",
                         "片目の視界 + シーングラフ\n視野内だけ、\n頭を動かすたびに変わる"),
            "ground": L(lang, "element -> object in 3D\nsmall, far, occluded\nor behind the user",
                        "元素 -> 3D 中的物体\n可能很小、很远、被遮挡\n或在用户身后",
                        "要素 -> 3D 空間の物体\n小さい、遠い、隠れている、\nまたはユーザーの背後"),
            "act": L(lang, "ray, pinch, grab,\n6-DoF pose, turn the head",
                     "射线、捏合、抓取、\n6 自由度位姿、转头",
                     "レイ、ピンチ、グラブ、\n6 自由度の姿勢、頭を回す"),
            "verify": L(lang, "content may have moved;\nthe user waits inside",
                        "内容可能已移动；\n用户在界面里等待",
                        "コンテンツが動いたかも；\nユーザーは中で待つ"),
        }
        for cx, title, desc, col, note_col in ((3.3, L(lang, "Phone GUI agent", "手机 GUI 智能体", "スマートフォンの GUI エージェント"), phone, C["a"], "#333"),
                                               (11.0, L(lang, "3D GUI agent (headset)", "3D GUI 智能体（头显）", "3D GUI エージェント（ヘッドセット）"), head, C["a"], ORANGE)):
            ax.text(cx, 8.05, title, ha="center", va="center", fontsize=16, weight="bold", color=C["dark"])
            dx, dy = (2.1, 1.45) if cx > 7 else (2.0, 1.45)
            w, h = (3.3, 2.0) if cx > 7 else (3.1, 1.6)
            pos = {"observe": (cx - dx, 4.3 + dy), "ground": (cx + dx, 4.3 + dy),
                   "act": (cx + dx, 4.3 - dy), "verify": (cx - dx, 4.3 - dy)}
            for key, name in stages:
                x, y = pos[key]
                box(ax, x, y, w, h, "", tint(col, 0.10), col, lw=2)
                ax.text(x, y + h / 2 - 0.3, name, ha="center", va="center", fontsize=13.5, weight="bold", color=col)
                ax.text(x, y - 0.18, desc[key], ha="center", va="center", fontsize=10.5 if cx > 7 else 11.5,
                        color=note_col, linespacing=1.25)
            gx = cx - dx + w / 2
            arrow(ax, (gx, 4.3 + dy), (cx + dx - w / 2, 4.3 + dy), color=tint(col, 0.7), lw=2.6, ms=18)
            arrow(ax, (cx + dx, 4.3 + dy - h / 2), (cx + dx, 4.3 - dy + h / 2), color=tint(col, 0.7), lw=2.6, ms=18)
            arrow(ax, (cx + dx - w / 2, 4.3 - dy), (gx, 4.3 - dy), color=tint(col, 0.7), lw=2.6, ms=18)
            arrow(ax, (cx - dx, 4.3 - dy + h / 2), (cx - dx, 4.3 + dy - h / 2), color=tint(col, 0.7), lw=2.6, ms=18)
            # ask channel in the middle
            ax.add_patch(Circle((cx, 4.3), 0.45, fc="white", ec=RED, lw=2))
            ax.text(cx, 4.3, L(lang, "ask /\nconfirm", "询问 /\n确认", "質問 /\n確認"), ha="center", va="center",
                    fontsize=9.5, color=RED, linespacing=1.1)
        ax.plot([7.15, 7.15], [0.9, 7.8], color="#bbb", lw=1.2, ls=":")
        ax.text(7.15, 0.45, L(lang, "orange: what changes in 3D", "橙色：在 3D 中改变的部分", "オレンジ：3D で変わる点"),
                ha="center", va="center", fontsize=12.5, color=ORANGE)
        save(fig, OUT / f"01-loop-2d-vs-3d_{lang}.svg")


# ------------------------------------------------------------------ 2. operating cost
def fig_cost():
    for lang in LANGS:
        fig, (a1, a2) = plt.subplots(1, 2, figsize=(14.5, 6.4), gridspec_kw={"width_ratios": [1, 1.05]})
        # (a) text entry, words per minute
        rows = [
            (L(lang, "phone, mean of\n37,370 typists", "手机，37,370 人\n的平均值", "スマートフォン、\n37,370 人の平均"), 36.2, GRAY, "Palin et al. 2019"),
            (L(lang, "XR, mean of\n137 techniques", "XR，137 种\n技术的平均值", "XR、137 手法\nの平均"), 20.36, C["c"], "Bhatia et al. 2025"),
            (L(lang, "VR keyboard,\ncontroller pointing", "VR 键盘，\n手柄指点", "VR キーボード、\nコントローラ指示"), 15.44, C["a"], "Speicher et al. 2018"),
            (L(lang, "VR keyboard,\nfreehand", "VR 键盘，\n徒手", "VR キーボード、\n素手"), 9.77, C["a"], "Speicher et al. 2018"),
        ]
        y = np.arange(len(rows))[::-1]
        for yi, (name, v, col, src) in zip(y, rows):
            a1.barh(yi, v, color=col, height=0.62)
            a1.text(v + 0.6, yi + 0.08, f"{v:g}", va="center", fontsize=14, weight="bold")
            a1.text(v + 0.6, yi - 0.24, src, va="center", fontsize=10.5, color="#555")
        a1.axvline(36.2 / 2, color=C["dark"], ls="--", lw=1.4)
        a1.text(36.2 / 2 + 0.4, len(rows) - 0.45, L(lang, "half of phone", "手机的一半", "スマホの半分"),
                fontsize=11.5, color=C["dark"])
        a1.set_yticks(y)
        a1.set_yticklabels([r[0] for r in rows], fontsize=11.5)
        a1.set_xlim(0, 50)
        a1.set_ylim(-0.6, len(rows) - 0.2)
        a1.set_xlabel(L(lang, "words per minute", "每分钟词数（wpm）", "1 分あたりの単語数（wpm）"))
        a1.set_title(L(lang, "(a) text entry", "(a) 文本输入", "(a) テキスト入力"), loc="left")
        a1.grid(axis="y", visible=False)
        # (b) selection error rates
        rows = [
            (L(lang, "phone typing,\nuncorrected", "手机打字，\n未更正错误", "スマホ入力、\n未修正エラー"), (2.3, 2.3), GRAY, "Palin et al. 2019"),
            (L(lang, "headset in a car,\nstanding still", "车内头显，\n静止", "車内のヘッドセット、\n停車中"), (8.8, 23.5), C["a"], "Sasalovici et al. 2025"),
            (L(lang, "headset in a car,\nmoving", "车内头显，\n行驶中", "車内のヘッドセット、\n走行中"), (20.4, 36.0), RED, "Sasalovici et al. 2025"),
            (L(lang, "ray at 8 m,\ncontroller / hand", "8 m 射线，\n手柄 / 手", "8 m のレイ、\nコントローラ / 手"), (15.2, 32.9), ORANGE, "Qiu et al. 2026"),
        ]
        y = np.arange(len(rows))[::-1]
        for k, (yi, (name, (lo, hi), col, src)) in enumerate(zip(y, rows)):
            if lo == hi:
                a2.barh(yi, lo, color=col, height=0.62)
                a2.text(hi + 0.8, yi + 0.08, f"{lo:g}%", va="center", fontsize=14, weight="bold")
            elif k == 3:
                a2.plot([lo, hi], [yi, yi], color=tint(col, 0.4), lw=3)
                a2.scatter([lo, hi], [yi, yi], s=150, color=col, zorder=3, marker="D")
                a2.text(lo, yi + 0.3, f"{lo:g}%", ha="center", fontsize=12.5, weight="bold")
                a2.text(hi, yi + 0.3, f"{hi:g}%", ha="center", fontsize=12.5, weight="bold")
            else:
                a2.barh(yi, hi - lo, left=lo, color=tint(col, 0.75), edgecolor=col, lw=1.6, height=0.62)
                a2.text(hi + 0.8, yi + 0.08, f"{lo:g}-{hi:g}%", va="center", fontsize=13.5, weight="bold")
            a2.text((hi + 0.8) if k != 3 else hi + 1.4, yi - 0.24, src, va="center", fontsize=10.5, color="#555")
        a2.set_yticks(y)
        a2.set_yticklabels([r[0] for r in rows], fontsize=11.5)
        a2.set_xlim(0, 52)
        a2.set_ylim(-0.6, len(rows) - 0.2)
        a2.set_xlabel(L(lang, "error rate (%), range across techniques", "错误率（%），各技术的范围", "エラー率（%）、手法間の範囲"))
        a2.set_title(L(lang, "(b) selection errors", "(b) 选择错误", "(b) 選択エラー"), loc="left")
        a2.grid(axis="y", visible=False)
        fig.tight_layout(w_pad=3)
        save(fig, OUT / f"01-operating-cost_{lang}.svg")


# ------------------------------------------------------------------ 3. where is the UI (top-down)
FOV = 100.0  # degrees, illustrative
# name, angle from heading (deg, + = left), distance (m), width (m)
WINDOWS = [
    ("browser", 4.0, 1.7, 1.0),
    ("mail", 36.0, 1.1, 0.6),
    ("photos", 30.0, 2.6, 1.0),
    ("settings", -85.0, 1.5, 0.8),
    ("music", 165.0, 1.8, 0.9),
]


def window_segment(ang, d, w):
    a = np.radians(ang)
    c = np.array([-np.sin(a), np.cos(a)]) * d  # heading = +y, positive angle = left (-x)
    t = np.array([np.cos(a), np.sin(a)])       # tangent, perpendicular to the line of sight
    return c - t * w / 2, c + t * w / 2, c


def seg_hit(o, u, p0, p1):
    """Distance t along ray o + t u to segment p0-p1, or None."""
    e = p1 - p0
    m = np.array([[u[0], -e[0]], [u[1], -e[1]]])
    det = np.linalg.det(m)
    if abs(det) < 1e-12:
        return None
    t, s = np.linalg.solve(m, p0 - o)
    return t if (t > 1e-6 and 0 <= s <= 1) else None


def classify(wins, heading=0.0, fov=FOV, ns=60):
    segs = [window_segment(a, d, w) for _, a, d, w in wins]
    res = []
    o = np.zeros(2)
    for i, (p0, p1, c) in enumerate(segs):
        n_in, n_vis = 0, 0
        for s in np.linspace(0, 1, ns):
            q = p0 + (p1 - p0) * s
            ang = np.degrees(np.arctan2(-q[0], q[1])) - heading
            ang = (ang + 180) % 360 - 180
            if abs(ang) <= fov / 2:
                n_in += 1
                dist = np.linalg.norm(q)
                u = q / dist
                blocked = any(seg_hit(o, u, segs[j][0], segs[j][1]) is not None and
                              seg_hit(o, u, segs[j][0], segs[j][1]) < dist - 1e-6 for j in range(len(segs)) if j != i)
                if not blocked:
                    n_vis += 1
        ca = (np.degrees(np.arctan2(-c[0], c[1])) - heading + 180) % 360 - 180
        if n_vis / ns >= 0.5:
            st = "view"
        elif n_in > 0:
            st = "occluded"
        elif abs(ca) <= 110:
            st = "outside"
        else:
            st = "behind"
        res.append((st, n_vis / ns, n_in / ns))
    return res, segs


LABEL_OFF = {"browser": (0.15, 0.42), "mail": (-0.75, -0.2), "photos": (-0.25, 0.5),
             "settings": (1.05, 0.0), "music": (0.0, -0.45)}


def fig_where():
    names = {
        "browser": ("Browser", "浏览器", "ブラウザ"),
        "mail": ("Mail", "邮件", "メール"),
        "photos": ("Photos", "照片", "写真"),
        "settings": ("Settings", "设置", "設定"),
        "music": ("Music", "音乐", "音楽"),
    }
    stcol = {"view": GREEN, "occluded": ORANGE, "outside": GRAY, "behind": RED}
    res, segs = classify(WINDOWS)
    for lang in LANGS:
        stname = {
            "view": L(lang, "in view", "在视野内", "視野内"),
            "occluded": L(lang, "in view but occluded", "在视野内但被遮挡", "視野内だが隠れている"),
            "outside": L(lang, "outside the view", "在视野外", "視野外"),
            "behind": L(lang, "behind the user", "在用户身后", "ユーザーの背後"),
        }
        fig, ax = plt.subplots(figsize=(10, 9))
        ax.set_aspect("equal")
        ax.grid(False)
        for s in ax.spines.values():
            s.set_visible(False)
        ax.set_xticks([])
        ax.set_yticks([])
        R = 3.2
        ax.add_patch(Wedge((0, 0), R, 90 - FOV / 2, 90 + FOV / 2, fc=tint(C["a"], 0.12), ec=C["a"], lw=1.4))
        # sight rays (thin) to show occlusion
        for k in np.linspace(-FOV / 2, FOV / 2, 41):
            a = np.radians(k)
            u = np.array([-np.sin(a), np.cos(a)])
            ts = [seg_hit(np.zeros(2), u, p0, p1) for p0, p1, _ in segs]
            ts = [t for t in ts if t is not None]
            t = min(ts) if ts else R
            ax.plot([0, u[0] * t], [0, u[1] * t], color=tint(C["a"], 0.45), lw=0.9, zorder=1)
        for (key, ang, d, w), (p0, p1, c), (st, fv, fi) in zip(WINDOWS, segs, res):
            ax.plot([p0[0], p1[0]], [p0[1], p1[1]], color=stcol[st], lw=9, solid_capstyle="butt", zorder=3)
            off = LABEL_OFF[key]
            ax.text(c[0] + off[0], c[1] + off[1], f"{L(lang, *names[key])}\n{stname[st]}", ha="center", va="center",
                    fontsize=12.5, color=stcol[st], weight="bold", linespacing=1.2, zorder=4,
                    bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.85))
        # user: head with nose pointing +y
        ax.add_patch(Circle((0, 0), 0.2, fc=C["a"], ec="white", lw=2, zorder=5))
        ax.add_patch(Polygon([[-0.08, 0.17], [0.08, 0.17], [0, 0.34]], fc=C["a"], zorder=5))
        ax.text(0.28, -0.28, L(lang, "user", "用户", "ユーザー"), fontsize=12.5, color=C["a"])
        ax.text(0, R + 0.2, L(lang, f"field of view (here {FOV:.0f}°)", f"视野（此处为 {FOV:.0f}°）",
                              f"視野（ここでは {FOV:.0f}°）"), ha="center", fontsize=12.5, color=C["a"])
        ax.set_xlim(-3.6, 3.6)
        ax.set_ylim(-2.9, 3.7)
        # scale bar
        ax.plot([2.2, 3.2], [-2.6, -2.6], color=C["dark"], lw=2.5)
        ax.text(2.7, -2.5, "1 m", ha="center", va="bottom", fontsize=12)
        save(fig, OUT / f"01-where-is-the-ui_{lang}.svg")
    return res


# ------------------------------------------------------------------ 4. accessibility
def fig_access():
    for lang in LANGS:
        fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 5.6), gridspec_kw={"width_ratios": [1.2, 1]})
        # VRSight: 9 BLV participants in Rec Room
        lab = [L(lang, "found\nthe menu", "找到\n菜单", "メニューを\n見つけた"),
               L(lang, "found and pressed\nthe target button", "找到并按下\n目标按钮", "目的のボタンを\n見つけて押した")]
        vals = [9, 1]
        a1.bar([0, 1], vals, color=[C["c"], RED], width=0.55)
        for k, v in enumerate(vals):
            a1.text(k, v + 0.2, f"{v} / 9", ha="center", fontsize=15, weight="bold")
        a1.set_xticks([0, 1])
        a1.set_xticklabels(lab, fontsize=12.5)
        a1.set_ylim(0, 10.8)
        a1.set_ylabel(L(lang, "participants", "参与者人数", "参加者数"))
        a1.set_title(L(lang, "VRSight, 9 blind and low-vision users\n(UIST 2025): menu trials 11% completed",
                       "VRSight，9 名盲人与低视力用户\n（UIST 2025）：菜单任务完成率 11%",
                       "VRSight、視覚障害のある 9 名\n（UIST 2025）：メニュー課題の完了率 11%"), fontsize=13.5, loc="left")
        a1.grid(axis="x", visible=False)
        # SeeingVR: 11 low-vision users, menu task
        lab = [L(lang, "without\ntools", "不使用\n工具", "ツール\nなし"), L(lang, "with\nSeeingVR", "使用\nSeeingVR", "SeeingVR\nあり")]
        vals = [4, 11]
        a2.bar([0, 1], vals, color=[GRAY, GREEN], width=0.55)
        for k, v in enumerate(vals):
            a2.text(k, v + 0.2, f"{v} / 11", ha="center", fontsize=15, weight="bold")
        a2.set_xticks([0, 1])
        a2.set_xticklabels(lab, fontsize=12.5)
        a2.set_ylim(0, 13.2)
        a2.set_ylabel(L(lang, "completed the menu task", "完成菜单任务的人数", "メニュー課題の完了者数"))
        a2.set_title(L(lang, "SeeingVR, 11 low-vision users\n(CHI 2019)", "SeeingVR，11 名低视力用户\n（CHI 2019）",
                       "SeeingVR、ロービジョンの 11 名\n（CHI 2019）"), fontsize=13.5, loc="left")
        a2.grid(axis="x", visible=False)
        fig.tight_layout(w_pad=3)
        save(fig, OUT / f"01-accessibility_{lang}.svg")


# ------------------------------------------------------------------ 5. autonomy spectrum
def fig_autonomy():
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(16, 8.2))
        blank(ax)
        ax.set_xlim(-0.2, 15.8)
        ax.set_ylim(0, 8.2)
        modes = [
            L(lang, "Explain", "讲解", "説明する"),
            L(lang, "Show where", "指出位置", "場所を示す"),
            L(lang, "Coach", "逐步指导", "コーチする"),
            L(lang, "Reshape\nthe layout", "重排布局", "レイアウトを\n変える"),
            L(lang, "Propose\nand act", "提议后执行", "提案して\n実行"),
            L(lang, "Act with\ntakeover", "代为执行\n（可接管）", "代行する\n（引き継ぎ可）"),
        ]
        examples = [
            L(lang, "\"How do I turn\non Travel Mode?\"", "“怎样打开\n旅行模式？”", "「トラベルモードは\nどう有効にする？」"),
            L(lang, "find the recentre\ncontrol", "找到重新居中\n的控件", "リセンターの\n操作を探す"),
            L(lang, "learn the gesture\nthat moves a window", "学会移动窗口\n的手势", "ウィンドウを動かす\nジェスチャーを覚える"),
            L(lang, "bring the music player\nfrom behind to the front", "把身后的音乐播放器\n拿到面前", "背後の音楽プレーヤーを\n前に持ってくる"),
            L(lang, "arrange three windows\nfor writing a report", "为写报告排列\n三个窗口", "報告書を書くために\n3 つのウィンドウを配置"),
            L(lang, "type a search query;\nchange a buried setting", "输入搜索词；\n修改深藏的设置", "検索語を入力；\n奥深い設定を変える"),
        ]
        xs = np.linspace(1.55, 14.45, 6)
        yl = 4.3
        # gradient line
        for k in range(200):
            x0 = 0.9 + 14.0 * k / 200
            ax.plot([x0, x0 + 14.0 / 200 + 0.01], [yl, yl], color=tint(C["a"], 0.25 + 0.75 * k / 200), lw=6,
                    solid_capstyle="butt")
        arrow(ax, (14.8, yl), (15.5, yl), color=C["a"], lw=3, ms=24)
        for x, m, e in zip(xs, modes, examples):
            ax.add_patch(Circle((x, yl), 0.22, fc="white", ec=C["a"], lw=2.5, zorder=3))
            ax.text(x, yl + 0.75, m, ha="center", va="center", fontsize=14, weight="bold", color=C["dark"], linespacing=1.1)
            box(ax, x, 6.55, 2.45, 1.15, e, fc=tint(C["c"], 0.10), ec=C["c"], fs=10.5, lw=1.4)
            arrow(ax, (x, 5.95), (x, yl + 1.2), color=tint(C["c"], 0.7), lw=1.4, ms=10)
        ax.text(0.15, 6.55, L(lang, "example", "示例", "例"), ha="left", va="center", fontsize=12.5, color=C["c"],
                weight="bold", rotation=90)
        # evidence boxes below
        ev = [
            (2.9, L(lang, "Guided Reality, Sensible Agent,\nAgentHands: spatial guidance",
                    "Guided Reality、Sensible Agent、\nAgentHands：空间引导",
                    "Guided Reality、Sensible Agent、\nAgentHands：空間ガイダンス"), (1.55, 4.13)),
            (8.0, L(lang, "VRCopilot: full automation lowered\nthe sense of agency; DuoZone: confirm,\nthen apply (76-90% of choices accepted)",
                    "VRCopilot：完全自动降低了主体感；\nDuoZone：确认后执行\n（76-90% 的决定被接受）",
                    "VRCopilot：完全自動化で主体感が低下；\nDuoZone：確認してから適用\n（判断の 76-90% が受け入れられた）"), (6.71, 11.87)),
            (13.2, L(lang, "AI companions in VR games:\nautonomous play lowered workload\nbut also enjoyment (preprint)",
                     "VR 游戏中的 AI 伙伴：自主代玩\n降低负荷，也降低了乐趣（预印本）",
                     "VR ゲームの AI コンパニオン：\n自律プレイは負荷を下げたが\n楽しさも下げた（プレプリント）"), (13.16, 14.45)),
        ]
        for cx, t, (xa, xb) in ev:
            box(ax, cx, 2.45, 4.5 if cx != 8.0 else 5.1, 1.35, t, fc=tint(C["light"], 0.15), ec=C["light"], fs=10.5, lw=1.4)
            ax.plot([xa, xb], [3.25, 3.25], color=C["light"], lw=3)
        ax.text(0.15, 2.45, L(lang, "evidence", "证据", "根拠"), ha="left", va="center", fontsize=12.5, color="#b8860b",
                weight="bold", rotation=90)
        # who acts
        ax.text(0.9, 1.15, L(lang, "the user acts; the agent supplies knowledge", "用户操作；智能体提供知识",
                             "ユーザーが操作し、エージェントは知識を補う"), ha="left", fontsize=12, color=C["dark"])
        ax.text(15.3, 1.15, L(lang, "the agent acts; the user supervises", "智能体操作；用户监督",
                              "エージェントが操作し、ユーザーは見守る"), ha="right", fontsize=12, color=C["dark"])
        # ask channel
        ax.add_patch(FancyBboxPatch((0.9, 0.25), 14.4, 0.55, boxstyle="round,pad=0.02,rounding_size=0.15",
                                    fc="white", ec=RED, lw=1.6, ls="--"))
        ax.text(8.1, 0.52, L(lang, "ask: available at every point (which window? overwrite? continue?)",
                             "询问：在每个位置都可用（哪个窗口？是否覆盖？是否继续？）",
                             "質問：どの段階でも使える（どのウィンドウ？上書きする？続ける？）"),
                ha="center", va="center", fontsize=12, color=RED)
        save(fig, OUT / f"01-autonomy-spectrum_{lang}.svg")


# ------------------------------------------------------------------ 6. column map
def fig_map():
    for lang in LANGS:
        fig, ax = plt.subplots(figsize=(13, 7))
        blank(ax)
        ax.set_xlim(-0.2, 13.2)
        ax.set_ylim(0, 7)
        box(ax, 6.5, 3.6, 5.0, 1.55,
            L(lang, "01  Research vision\nthe idea, its scope and motivation,\nthe open questions",
              "01  研究愿景\n想法、范围与动机，\n开放问题",
              "01  研究ビジョン\nアイデア、範囲と動機、\n未解決の問い"),
            fc=tint(C["a"], 0.15), ec=C["a"], fs=13, lw=2.6)
        surveys = [
            (2.0, 6.0, "02", L(lang, "GUI agents on 2D screens\nwhat agents can do on\nphones, desktops, the web",
                                "二维屏幕上的 GUI 智能体\n智能体在手机、桌面、\n网页上能做什么",
                                "2D 画面の GUI エージェント\nスマホ、デスクトップ、\nWeb で何ができるか"), C["z"]),
            (6.5, 6.25, "03", L(lang, "Why 3D interfaces are hard\nmeasured operating costs,\nadoption, accessibility",
                                 "为什么 3D 界面难以操作\n实测操作代价、\n普及与无障碍",
                                 "3D UI はなぜ難しいか\n操作コストの実測、\n普及とアクセシビリティ"), C["b"]),
            (11.0, 6.0, "04", L(lang, "Agents in XR and the gap\nclosest work, platforms,\ndatasets, what is missing",
                                 "XR 中的智能体与空白\n最接近的工作、平台、\n数据集与缺口",
                                 "XR のエージェントとギャップ\n最も近い研究、基盤、\nデータセット、欠けているもの"), C["c"]),
        ]
        for x, y, n, t, col in surveys:
            box(ax, x, y, 3.8, 1.35, f"{n}  {t}", fc=tint(col, 0.12), ec=col, fs=11.5, lw=2)
            arrow(ax, (x, y - 0.7), (6.5 + (x - 6.5) * 0.35, 4.4), color=col, lw=2.2)
        ax.text(1.0, 4.55, L(lang, "evidence: what transfers", "证据：哪些可迁移", "根拠：何が移せるか"), fontsize=11.5, color=C["z"])
        ax.text(12.0, 4.55, L(lang, "evidence: the gap", "证据：空白", "根拠：ギャップ"), fontsize=11.5, color=C["c"], ha="right")
        box(ax, 6.5, 1.0, 5.4, 1.1,
            L(lang, "05  Research plan (password-protected)", "05  研究计划（密码保护）", "05  研究計画（パスワード保護）"),
            fc="#f1f1f1", ec=GRAY, fs=13, lw=2, ls="--")
        arrow(ax, (6.5, 2.85), (6.5, 1.65), color=GRAY, lw=2.4)
        # small lock icon
        ax.add_patch(FancyBboxPatch((9.45, 0.75), 0.34, 0.3, boxstyle="round,pad=0.01,rounding_size=0.04", fc=GRAY, ec=GRAY))
        th = np.linspace(0, np.pi, 30)
        ax.plot(9.62 + 0.12 * np.cos(th), 1.05 + 0.16 * np.sin(th), color=GRAY, lw=2.2)
        save(fig, OUT / f"01-column-map_{lang}.svg")


if __name__ == "__main__":
    fig_loop()
    fig_cost()
    r = fig_where()
    print("visibility:", [(w[0], s[0], round(s[1], 2), round(s[2], 2)) for w, s in zip(WINDOWS, r)])
    fig_access()
    fig_autonomy()
    fig_map()
