"""Figures for the "2025-2026 update (as of November 2026)" sections of the embodied-AI series.

Writes
  assets/img/blog/embodied-ai/02-update-tracking-reward.svg       (language-neutral)
  assets/img/blog/embodied-ai/04-update-dataset-scale_{lang}.svg  (localized legend/axis text)
  assets/img/blog/embodied-ai/05-update-vla-timeline_{lang}.svg   (localized lane/axis text)

All numbers are the ones quoted (with sources) in the posts: dataset sizes from each paper or official page,
model dates from the first arXiv version or the official announcement. The VLA list mirrors the data inside
assets/js/widgets/embodied-ai-vla-explorer.js.

Run:  python3 bin/figures/embodied-ai/embodied_ai_updates.py
"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets" / "img" / "blog" / "embodied-ai"


# ---------------------------------------------------------------------------------------------
# Post 02: the exponential tracking reward r = exp(-e^2 / sigma^2) and what sigma does on a toy run
# ---------------------------------------------------------------------------------------------
def fig_tracking_reward():
    sigmas = [0.1, 0.25, 0.5]
    cols = [C["x"], C["a"], C["z"]]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.4))

    e = np.linspace(-1.0, 1.0, 801)
    for s, c in zip(sigmas, cols):
        a1.plot(e, np.exp(-(e / s) ** 2), color=c, label=r"$\sigma=%.2g$" % s)
    a1.set_xlabel(r"$e = q - \hat q$  [rad]")
    a1.set_ylabel(r"$r = \exp(-e^2/\sigma^2)$")
    a1.set_ylim(-0.03, 1.05)
    a1.legend(loc="upper right", fontsize=13)

    # toy run: a reference joint trajectory and a tracker that lags by 40 ms and has small noise
    rng = np.random.default_rng(0)
    t = np.linspace(0.0, 2.0, 401)
    q_ref = 0.6 * np.sin(2 * np.pi * 0.75 * t)
    q = 0.6 * np.sin(2 * np.pi * 0.75 * (t - 0.04)) + 0.03 * rng.standard_normal(t.size)
    err = q - q_ref
    a2.plot(t, err, color=C["gray"], lw=1.6, label=r"$e(t)$")
    for s, c in zip(sigmas, cols):
        r = np.exp(-(err / s) ** 2)
        a2.plot(t, r, color=c, label=r"$r(t),\ \sigma=%.2g$ (mean %.2f)" % (s, r.mean()))
    a2.set_xlabel(r"$t$  [s]")
    a2.set_ylim(-0.25, 1.1)
    a2.legend(loc="lower right", fontsize=11, ncol=1)
    fig.tight_layout()
    save(fig, OUT / "02-update-tracking-reward.svg")


# ---------------------------------------------------------------------------------------------
# Post 04: dataset scale. Hours (log) by data source, and trajectories vs. number of embodiments.
# ---------------------------------------------------------------------------------------------
HOURS = [  # name, hours, kind ("robot", "umi", "human"); ">=" values are plotted at the stated lower bound
    ("Nymeria", 300, "human"),
    ("DROID", 350, "robot"),
    ("Galaxea Open-World", 500, "robot"),
    ("MolmoAct2 data", 720, "robot"),
    ("EgoDex", 829, "human"),
    ("Xu et al. 2026", 1500, "robot"),
    ("TRI LBM mix", 1700, "robot"),
    ("RDT2 (UMI)", 10000, "umi"),
    ("EgoScale", 20854, "human"),
    ("UniHand-2.0", 35000, "human"),
]
TRAJ = [  # name, trajectories, embodiments
    ("BridgeData V2", 60096, 1),
    ("DROID", 76000, 1),
    ("RoboMIND", 107000, 4),
    ("AgiBot World", 1000000, 1),
    ("Open X-Embodiment", 1000000, 22),
]
KIND_COL = {"robot": C["z"], "umi": C["b"], "human": C["y"]}


def fig_dataset_scale(lang):
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12.5, 5.2), gridspec_kw=dict(width_ratios=[1.25, 1]))
    names = [h[0] for h in HOURS]
    vals = np.array([h[1] for h in HOURS], float)
    y = np.arange(len(HOURS))
    a1.barh(y, vals, color=[KIND_COL[h[2]] for h in HOURS], height=0.65)
    a1.set_xscale("log")
    a1.set_yticks(y)
    a1.set_yticklabels(names, fontsize=13)
    a1.set_xlim(100, 1e5)
    for yi, v in zip(y, vals):
        a1.text(v * 1.08, yi, "%d h" % v if v < 1e4 else "%.1fk h" % (v / 1e3), va="center", fontsize=12)
    a1.set_xlabel(label(lang, en="hours of data (log scale)", zh="数据小时数（对数坐标）", ja="データ時間（対数軸）"))
    handles = [
        Line2D([], [], marker="s", ls="", ms=12, color=KIND_COL["robot"],
               label=label(lang, en="robot teleoperation", zh="机器人遥操作", ja="ロボット遠隔操作")),
        Line2D([], [], marker="s", ls="", ms=12, color=KIND_COL["umi"],
               label=label(lang, en="handheld gripper (UMI)", zh="手持夹爪（UMI）", ja="ハンドヘルドグリッパー（UMI）")),
        Line2D([], [], marker="s", ls="", ms=12, color=KIND_COL["human"],
               label=label(lang, en="human egocentric", zh="人类第一人称", ja="人間の一人称視点")),
    ]
    a1.legend(handles=handles, loc="lower right", fontsize=12)
    a1.grid(axis="y", alpha=0)

    for name, n, k in TRAJ:
        a2.scatter(n, k, s=160, color=C["a"], edgecolor=C["dark"], zorder=3)
        below = name in ("BridgeData V2",)          # BridgeData V2 and DROID sit close together at k = 1
        a2.annotate(name, (n, k), xytext=(0, -22 if below else 11), textcoords="offset points",
                    ha="center", fontsize=12)
    a2.set_xscale("log")
    a2.set_xlim(3e4, 3e6)
    a2.set_ylim(-3, 25)
    a2.set_xlabel(label(lang, en="trajectories (log scale)", zh="轨迹数（对数坐标）", ja="軌道数（対数軸）"))
    a2.set_ylabel(label(lang, en="robot embodiments", zh="机器人本体数", ja="ロボットの身体の数"))
    fig.tight_layout()
    save(fig, OUT / ("04-update-dataset-scale_%s.svg" % lang))


# ---------------------------------------------------------------------------------------------
# Post 05: VLA timeline (lanes by lab, colour by action head, filled = open weights) and head share per year
# ---------------------------------------------------------------------------------------------
VLA = [  # label, lane, YYYY-MM, head, open
    ("RT-1", 0, "2022-12", "tok", 0), ("RT-2", 0, "2023-07", "tok", 0), ("RT-X", 0, "2023-10", "tok", 1),
    ("Gemini Rob.", 0, "2025-03", "other", 0), ("On-Device", 0, "2025-06", "other", 0),
    ("GR 1.5", 0, "2025-10", "other", 0), ("GR 2", 0, "2026-07", "other", 0),
    ("pi0", 1, "2024-10", "flow", 1), ("pi0-FAST", 1, "2025-01", "tok", 1), ("pi0.5", 1, "2025-04", "flow", 1),
    ("KI", 1, "2025-05", "flow", 0), ("pi*0.6", 1, "2025-11", "flow", 0), ("pi0.7", 1, "2026-04", "flow", 0),
    ("GR00T N1", 2, "2025-03", "flow", 1), ("N1.5", 2, "2025-06", "flow", 1), ("N1.6", 2, "2025-12", "flow", 1),
    ("N1.7", 2, "2026-03", "flow", 1),
    ("Octo", 3, "2024-05", "diff", 1), ("OpenVLA", 3, "2024-06", "tok", 1), ("RDT-1B", 3, "2024-10", "diff", 1),
    ("OpenVLA-OFT", 3, "2025-02", "other", 1), ("UniVLA", 3, "2025-05", "tok", 1), ("X-VLA", 3, "2025-10", "flow", 1),
    ("RDT2", 3, "2026-02", "flow", 1), ("MolmoAct2", 3, "2026-05", "flow", 1),
    ("Helix", 4, "2025-02", "other", 0), ("SmolVLA", 4, "2025-06", "flow", 1), ("GR-3", 4, "2025-07", "flow", 0),
    ("WALL-OSS", 4, "2025-09", "flow", 1), ("Helix 02", 4, "2026-01", "other", 0), ("Helix 2.5", 4, "2026-09", "other", 0),
    ("DreamGen", 5, "2025-05", "other", 1), ("V-JEPA 2-AC", 5, "2025-06", "other", 1), ("UniVLA-AR", 5, "2025-06", "tok", 0),
    ("WorldVLA", 5, "2025-06", "tok", 0), ("Genie Env.", 5, "2025-08", "flow", 0), ("Cosmos Policy", 5, "2026-01", "diff", 1),
    ("DreamZero", 5, "2026-02", "diff", 0),
]
HEAD_COL = {"tok": "#1f77b4", "diff": "#ff7f0e", "flow": "#2ca02c", "other": "#9467bd"}


def _t(s):
    y, m = s.split("-")
    return int(y) + (int(m) - 0.5) / 12.0


def fig_vla_timeline(lang):
    lanes = ["Google DeepMind", "Physical Intelligence", "NVIDIA",
             label(lang, en="academia", zh="学术界", ja="学術"),
             label(lang, en="other industry", zh="其他公司", ja="その他の企業"),
             label(lang, en="world-action models", zh="世界动作模型", ja="世界行動モデル")]
    heads = {"tok": label(lang, en="discrete tokens", zh="离散 token", ja="離散トークン"),
             "diff": label(lang, en="diffusion", zh="扩散", ja="拡散"),
             "flow": label(lang, en="flow matching", zh="流匹配", ja="フローマッチング"),
             "other": label(lang, en="other / undisclosed", zh="其他 / 未公开", ja="その他 / 非公開")}
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(11, 9.5), gridspec_kw=dict(height_ratios=[2.2, 1]))

    # top: timeline; labels alternate above/below inside each lane to limit overlap
    for lane in range(len(lanes)):
        if lane % 2:
            a1.axhspan(lane - 0.5, lane + 0.5, color="#f1f1f4", zorder=0)
        items = sorted([v for v in VLA if v[1] == lane], key=lambda v: v[2])
        for i, (name, _, date, head, op) in enumerate(items):
            x = _t(date)
            a1.scatter(x, lane, s=110, zorder=3, color=HEAD_COL[head] if op else "white",
                       edgecolor=C["dark"] if op else HEAD_COL[head], linewidth=1.2 if op else 2.5)
            a1.text(x, lane + (0.24 if i % 2 == 0 else -0.36), name, ha="center", fontsize=10.5)
    a1.set_yticks(range(len(lanes)))
    a1.set_yticklabels(lanes, fontsize=12)
    a1.set_ylim(len(lanes) - 0.5, -0.5)
    a1.set_xlim(2022.8, 2027.0)
    a1.set_xticks([2023, 2024, 2025, 2026, 2027])
    a1.grid(axis="y", alpha=0)
    hs = [Line2D([], [], marker="o", ls="", ms=10, color=HEAD_COL[k], label=heads[k]) for k in heads]
    hs.append(Line2D([], [], marker="o", ls="", ms=10, markerfacecolor="white", markeredgecolor=C["dark"],
                     markeredgewidth=2, label=label(lang, en="hollow = closed weights", zh="空心 = 未开放权重",
                                                    ja="白抜き = 非公開ウェイト")))
    a1.legend(handles=hs, loc="upper left", fontsize=10.5, ncol=1, framealpha=0.95)

    # bottom: number of entries per year by action head (stacked)
    years = [2023, 2024, 2025, 2026]
    bottom = np.zeros(len(years))
    for k in ["tok", "diff", "flow", "other"]:
        cnt = np.array([sum(1 for v in VLA if v[3] == k and int(v[2][:4]) == yr
                            or (yr == 2023 and v[3] == k and v[2][:4] == "2022")) for yr in years], float)
        a2.bar(years, cnt, bottom=bottom, color=HEAD_COL[k], width=0.6, label=heads[k])
        bottom += cnt
    a2.set_xticks(years)
    a2.set_xticklabels(["2022-23", "2024", "2025", "2026"])
    a2.set_ylabel(label(lang, en="models in this list", zh="列表中的模型数", ja="一覧中のモデル数"))
    a2.grid(axis="x", alpha=0)
    fig.tight_layout()
    save(fig, OUT / ("05-update-vla-timeline_%s.svg" % lang))


if __name__ == "__main__":
    fig_tracking_reward()
    for lang in LANGS:
        fig_dataset_scale(lang)
        fig_vla_timeline(lang)
