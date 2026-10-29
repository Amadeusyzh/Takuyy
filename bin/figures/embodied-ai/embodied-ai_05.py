"""Figures for embodied-ai post 05 (vision-language-action models).

The tokenization figures use the post's own 7-D action chunk, binning and DCT code; the flow-matching
figure retrains the post's toy action expert (same code and seed, about 15 s on a CPU) and records the
Euler integration. The timeline places models by the month of their first arXiv version, read from the
arXiv identifiers cited in the posts (YYMM.number).

    python3 bin/figures/embodied-ai/embodied-ai_05.py
"""
import math
import pathlib
import sys

import numpy as np
from scipy.fft import dct, idct

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/embodied-ai"


# ================================================================= the post's tokenization code
def to_bins(a, low, high, n_bins=256):
    a = np.clip(a, low, high)
    return np.minimum(((a - low) / (high - low) * n_bins).astype(int), n_bins - 1)


def from_bins(b, low, high, n_bins=256):
    return low + (b + 0.5) * (high - low) / n_bins


t = np.linspace(0, 1, 50)[:, None]
CHUNK = np.concatenate([0.05 * np.sin(2 * np.pi * t * [1, 0.5, 0.25]),
                        0.1 * np.cos(np.pi * t * [1, 2, 3]),
                        (t > 0.5).astype(float)], axis=1)
LOW, HIGH = CHUNK.min(0) - 1e-3, CHUNK.max(0) + 1e-3
DIMS = ["x", "y", "z", "roll", "pitch", "yaw", "grip"]


def fig_binning():
    tokens = to_bins(CHUNK, LOW, HIGH)
    rec = from_bins(tokens, LOW, HIGH)
    print("binning: tokens", tokens.size, "max error %.5f" % np.abs(rec - CHUNK).max())
    fig, axs = plt.subplots(2, 1, figsize=(9, 9))
    ax = axs[0]
    cm = plt.get_cmap("tab10")
    for j in range(7):
        ax.plot(np.arange(50), CHUNK[:, j] / (np.abs(CHUNK[:, j]).max()) * 0.45 + 6 - j, color=cm(j), lw=2.2)
        ax.text(-1.5, 6 - j, DIMS[j], ha="right", va="center", fontsize=13, color=cm(j))
        for s in range(0, 50, 1):
            pass
    ax.set_xlim(-6, 50); ax.set_yticks([]); ax.set_xlabel("time step (50 Hz, 1 s)")
    ax.set_title("one action chunk: 50 steps x 7 dimensions = 350 numbers", fontsize=15)
    # zoom into dimension x around its peak to show the 256 bins
    ax = axs[1]
    j = 0
    w = (HIGH[j] - LOW[j]) / 256
    sl = slice(6, 20)
    tt = np.arange(50)[sl]
    lo, hi = CHUNK[sl, j].min() - 2 * w, CHUNK[sl, j].max() + 2 * w
    edges = LOW[j] + w * np.arange(257)
    for e in edges[(edges > lo) & (edges < hi)]:
        ax.axhline(e, color=C["gray"], lw=0.6, alpha=0.6)
    ax.plot(tt, CHUNK[sl, j], "o-", color=cm(0), lw=2, ms=6, label="continuous action")
    ax.step(tt, rec[sl, j], where="mid", color=C["x"], lw=2.2, label="bin centre (decoded token)")
    for x, b, v in zip(tt[::3], tokens[sl, j][::3], rec[sl, j][::3]):
        ax.text(x, v + 0.55 * w, str(b), ha="center", fontsize=12, color=C["x"])
    ax.set_ylim(lo, hi); ax.set_xlabel("time step"); ax.set_ylabel("x [m]")
    ax.legend(fontsize=13, loc="lower right")
    ax.set_title(f"zoom on x: 256 bins of width {w * 1000:.2f} mm (grey lines), numbers = token ids", fontsize=14)
    fig.tight_layout()
    save(fig, OUT / "05-binning.svg")


def fig_dct():
    coef = dct(CHUNK, axis=0, norm="ortho")
    fig = plt.figure(figsize=(10, 8.6))
    gs = fig.add_gridspec(2, 3, height_ratios=[1, 1])
    ax = fig.add_subplot(gs[0, 0])
    im = ax.imshow(np.log10(np.abs(coef) + 1e-6), aspect="auto", cmap="magma", vmin=-4, vmax=0.5)
    ax.set_xticks(range(7)); ax.set_xticklabels(DIMS, rotation=90, fontsize=12)
    ax.set_ylabel("frequency index"); ax.set_title(r"$\log_{10}\vert$DCT$\vert$", fontsize=14)
    ax.grid(False)
    for k, scale in enumerate((10.0, 50.0, 200.0)):
        q = np.round(coef * scale).astype(int)
        recon = idct(q / scale, axis=0, norm="ortho")
        print(f"DCT scale {scale:5.0f}: {np.count_nonzero(q):3d} non-zero, mean error {np.abs(recon - CHUNK).mean():.4f}")
        if k < 2:
            ax = fig.add_subplot(gs[0, k + 1])
            ax.imshow(q != 0, aspect="auto", cmap="Greys", vmin=0, vmax=1.3)
            ax.set_xticks(range(7)); ax.set_xticklabels(DIMS, rotation=90, fontsize=12); ax.set_yticks([])
            ax.set_title(f"scale {scale:.0f}: {np.count_nonzero(q)} non-zero", fontsize=14); ax.grid(False)
    ax = fig.add_subplot(gs[1, :])
    for j, col in ((0, plt.get_cmap("tab10")(0)), (3, plt.get_cmap("tab10")(3)), (6, plt.get_cmap("tab10")(6))):
        ax.plot(CHUNK[:, j], color=col, lw=3, alpha=0.45)
        q = np.round(coef * 10.0).astype(int)
        ax.plot(idct(q / 10.0, axis=0, norm="ortho")[:, j], "--", color=col, lw=2, label=f"{DIMS[j]}: scale 10")
    ax.set_xlabel("time step"); ax.set_ylabel("action")
    ax.legend(fontsize=13, loc="center left")
    ax.set_title("original (thick) vs. reconstruction from 35 integers (dashed)", fontsize=14)
    fig.tight_layout()
    save(fig, OUT / "05-dct-fast.svg")


# ================================================================= flow matching (the post's toy)
def run_flow():
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    torch.set_num_threads(4)
    torch.manual_seed(0)
    H, A, C_ = 8, 2, 64

    class ActionExpert(nn.Module):
        def __init__(self, hidden=256):
            super().__init__()
            self.net = nn.Sequential(nn.Linear(H * A + C_ + 32, hidden), nn.SiLU(),
                                     nn.Linear(hidden, hidden), nn.SiLU(),
                                     nn.Linear(hidden, hidden), nn.SiLU(),
                                     nn.Linear(hidden, H * A))

        def forward(self, a_t, t, c):
            freqs = torch.exp(torch.arange(16) * (-math.log(1000.0) / 16))
            emb = 1000 * t[:, None] * freqs[None]
            x = torch.cat([a_t.flatten(1), c, emb.sin(), emb.cos()], -1)
            return self.net(x).view(-1, H, A)

    def flow_matching_loss(model, actions, ctx):
        eps = torch.randn_like(actions)
        t = torch.rand(actions.shape[0])
        a_t = (1 - t)[:, None, None] * eps + t[:, None, None] * actions
        return F.mse_loss(model(a_t, t, ctx), actions - eps)

    instr = torch.randn(2, C_)

    def batch(n):
        side = torch.randint(0, 2, (n,))
        tt = torch.linspace(0, 1, H)
        y = (side.float() * 2 - 1)[:, None] * torch.sin(math.pi * tt) * 0.5
        return torch.stack([tt.expand(n, H), y], -1), instr[side], side

    model = ActionExpert()
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3)
    for it in range(3000):
        act, ctx, _ = batch(128)
        loss = flow_matching_loss(model, act, ctx)
        opt.zero_grad(); loss.backward(); opt.step()
    print(f"flow matching: final loss {loss.item():.4f}")
    torch.manual_seed(5)
    n = 40
    side = torch.tensor([0] * (n // 2) + [1] * (n // 2))
    ctx = instr[side]
    a = torch.randn(n, H, A); traj = [a.numpy().copy()]
    with torch.no_grad():
        for i in range(10):
            tt = torch.full((n,), i / 10)
            a = a + model(a, tt, ctx) / 10
            traj.append(a.numpy().copy())
    ok = (np.sign(traj[-1][:, H // 2, 1]) == (side.numpy() * 2 - 1)).mean()
    print(f"flow matching figure batch: follows the instruction in {ok:.0%}")
    return np.array(traj), side.numpy()


def fig_flow(traj, side):
    fig, axs = plt.subplots(1, 4, figsize=(10.5, 3.9), sharey=True)
    for ax, i in zip(axs, (0, 3, 6, 10)):
        for c, sd in zip(traj[i], side):
            ax.plot(c[:, 0], c[:, 1], "-o", ms=2.5, lw=1.2, color=C["z"] if sd == 0 else C["b"], alpha=0.6)
        ax.set_title(f"$t = {i / 10:.1f}$" + (" (noise)" if i == 0 else "") + (" (actions)" if i == 10 else ""), fontsize=14)
        ax.set_xlim(-2.6, 3); ax.set_ylim(-2.6, 2.6); ax.set_xticks([0, 1])
    axs[0].set_ylabel("$y$")
    axs[0].plot([], [], color=C["z"], label="go left"); axs[0].plot([], [], color=C["b"], label="go right")
    axs[0].legend(fontsize=12, loc="lower left", handlelength=1.2)
    fig.tight_layout()
    save(fig, OUT / "05-flow-matching.svg")


# ================================================================= diagrams (localized)
def box(ax, xy, w, h, text, fc, fs=13, ec=C["dark"], ls="-"):
    ax.add_patch(FancyBboxPatch(xy, w, h, boxstyle="round,pad=0.02,rounding_size=0.08", fc=fc, ec=ec, lw=1.6, ls=ls))
    lines = text.split("\n")
    for i, ln in enumerate(lines):
        ax.text(xy[0] + w / 2, xy[1] + h / 2 + ((len(lines) - 1) / 2 - i) * 0.36, ln, ha="center", va="center", fontsize=fs)


def arrow(ax, a, b, color=C["dark"], lw=1.8):
    ax.annotate("", xy=b, xytext=a, arrowprops=dict(arrowstyle="-|>", lw=lw, color=color, shrinkA=1, shrinkB=1))


def fig_architectures():
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)
        fig, axs = plt.subplots(1, 2, figsize=(10.5, 6.6))
        for ax in axs:
            ax.set_xlim(0, 5.05); ax.set_ylim(0, 8.4); ax.axis("off")
        # (a) discrete tokens
        ax = axs[0]
        ax.set_title(L("(a) actions as tokens\n(RT-2, OpenVLA)", "(a) 动作即 token\n（RT-2、OpenVLA）", "(a) 行動をトークンに\n（RT-2、OpenVLA）"), fontsize=14)
        box(ax, (0.1, 0.2), 2.2, 1.0, L("camera\nimages", "相机图像", "カメラ画像"), "#e3f2fb")
        box(ax, (2.7, 0.2), 2.2, 1.0, L("instruction", "语言指令", "言語指示"), "#e3f2fb")
        box(ax, (0.3, 1.9), 4.4, 1.9, L("VLM backbone\npre-trained on web data", "VLM 主干\n在网络数据上预训练", "VLM バックボーン\nWeb データで事前学習"), "#efe7fb", fs=14)
        arrow(ax, (1.2, 1.25), (1.2, 1.85)); arrow(ax, (3.8, 1.25), (3.8, 1.85))
        for k in range(7):
            ax.add_patch(Rectangle((0.35 + k * 0.62, 4.45), 0.52, 0.55, fc=C["a"], ec="white"))
            ax.text(0.61 + k * 0.62, 4.72, str([128, 77, 201, 140, 12, 255, 3][k]), ha="center", va="center", fontsize=10.5, color="white")
        ax.text(2.5, 5.25, L("7 tokens, decoded one by one", "7 个 token，逐个解码", "7 トークンを 1 つずつデコード"), ha="center", fontsize=12.5)
        arrow(ax, (2.5, 3.85), (2.5, 4.4))
        box(ax, (0.6, 5.9), 3.8, 0.9, L("de-tokenize: bin centres", "反 token 化：取箱中心", "逆トークン化：ビンの中心"), "#fdf0df")
        arrow(ax, (2.5, 5.55), (2.5, 5.85))
        box(ax, (0.6, 7.25), 3.8, 0.9, L("one action per\nforward pass", "每次前向传播\n输出一个动作", "1 回の順伝播で\n1 つの行動"), "#e9f6e7")
        arrow(ax, (2.5, 6.85), (2.5, 7.2))
        # (b) action expert with flow matching
        ax = axs[1]
        ax.set_title(L("(b) VLM + action expert\n(pi0-style flow matching)", "(b) VLM + 动作专家\n（pi0 式流匹配）", "(b) VLM + 行動エキスパート\n（pi0 型フローマッチング）"), fontsize=14)
        box(ax, (0.05, 0.2), 1.5, 1.0, L("images", "图像", "画像"), "#e3f2fb")
        box(ax, (1.65, 0.2), 1.5, 1.0, L("instruction", "指令", "指示"), "#e3f2fb")
        box(ax, (3.25, 0.2), 1.7, 1.0, L("proprio +\nnoisy chunk", "本体感知 +\n含噪动作块", "固有感覚 +\nノイズ付きチャンク"), "#fdf0df", fs=12)
        box(ax, (0.05, 1.9), 3.1, 1.9, L("VLM backbone\n(pre-trained)", "VLM 主干\n（预训练）", "VLM バックボーン\n（事前学習済み）"), "#efe7fb", fs=14)
        box(ax, (3.25, 1.9), 1.7, 1.9, L("action\nexpert", "动作\n专家", "行動\nエキスパート"), "#fbe4e4", fs=14)
        arrow(ax, (0.8, 1.25), (0.8, 1.85)); arrow(ax, (2.4, 1.25), (2.4, 1.85)); arrow(ax, (4.1, 1.25), (4.1, 1.85))
        arrow(ax, (3.15, 2.85), (3.25, 2.85), lw=2.4)
        ax.text(3.2, 3.95, L("attends to\nVLM tokens", "关注 VLM\n的 token", "VLM トークン\nに注意"), ha="center", fontsize=11.5, color=C["gray"])
        box(ax, (2.6, 4.7), 2.35, 1.0, r"$v_\theta(A^t, t, c)$", "#fbe4e4", fs=14)
        arrow(ax, (4.1, 3.85), (4.1, 4.65))
        box(ax, (2.6, 5.95), 2.35, 0.9, L("10 Euler steps", "10 步欧拉积分", "オイラー法 10 ステップ"), "#fdf0df")
        arrow(ax, (3.75, 5.75), (3.75, 5.9))
        box(ax, (1.5, 7.25), 3.45, 0.9, L("chunk of 50 actions", "50 个动作的块", "50 行動のチャンク"), "#e9f6e7")
        arrow(ax, (3.75, 6.9), (3.75, 7.2))
        fig.subplots_adjust(wspace=0.08, left=0.02, right=0.98, top=0.88, bottom=0.02)
        save(fig, OUT / f"05-vla-architectures_{lang}.svg")


def fig_cross_embodiment():
    rng = np.random.default_rng(0)
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)
        fig = plt.figure(figsize=(10, 8.4))
        gs = fig.add_gridspec(2, 2, height_ratios=[1, 0.95])
        ax = fig.add_subplot(gs[0, :])
        rows = [(L("single arm (EE delta + gripper)", "单臂（末端增量 + 夹爪）", "単腕（手先差分 + グリッパ）"), [7], [C["z"]]),
                (L("bimanual arms", "双臂", "双腕"), [7, 7], [C["z"], C["c"]]),
                (L("mobile manipulator", "移动操作机器人", "移動マニピュレータ"), [7, 3], [C["z"], C["y"]]),
                (L("humanoid upper body", "人形机器人上半身", "ヒューマノイド上半身"), [7, 7, 12], [C["z"], C["c"], C["b"]])]
        D = 32
        for r, (name, segs, cols) in enumerate(rows):
            y = 3 - r
            k = 0
            for n, c in zip(segs, cols):
                for _ in range(n):
                    ax.add_patch(Rectangle((k, y), 0.92, 0.7, fc=c, ec="white")); k += 1
            while k < D:
                ax.add_patch(Rectangle((k, y), 0.92, 0.7, fc="white", ec=C["gray"], lw=0.8, hatch="//")); k += 1
            ax.text(-0.4, y + 0.35, name, ha="right", va="center", fontsize=13)
        ax.text(D / 2, 4.05, L("one padded 32-D action vector per step (example layout)\nhatched = padding, masked in the loss",
                               "每步一个补齐到 32 维的动作向量（示例布局）\n斜线 = 填充，在损失中被屏蔽",
                               "1 ステップごとに 32 次元へパディングした行動ベクトル（例）\n斜線 = パディング、損失ではマスク"),
                ha="center", fontsize=13)
        ax.set_xlim(-12.5, D + 0.5); ax.set_ylim(-0.3, 4.9); ax.axis("off")
        # per-dataset quantile normalization
        dsets = [(rng.normal(0.02, 0.01, 4000), "dataset A [m]", C["a"]), (rng.gamma(2.0, 0.08, 4000) - 0.1, "dataset B [rad]", C["b"])]
        ax1 = fig.add_subplot(gs[1, 0]); ax2 = fig.add_subplot(gs[1, 1])
        for x, name, c in dsets:
            lo, hi = np.percentile(x, [1, 99])
            ax1.hist(x, bins=80, color=c, alpha=0.5, density=True, label=name)
            ax2.hist(np.clip(2 * (x - lo) / (hi - lo) - 1, -1.6, 1.6), bins=80, color=c, alpha=0.5, density=True)
        ax1.set_title(L("raw actions: different units and ranges", "原始动作：单位和范围各不相同", "生の行動：単位も範囲もばらばら"), fontsize=13.5)
        ax2.set_title(L("after mapping the 1st/99th percentiles to -1/+1", "把第 1/99 百分位映射到 -1/+1 之后", "1/99 パーセンタイルを -1/+1 に写した後"), fontsize=13.5)
        for v in (-1, 1):
            ax2.axvline(v, color=C["dark"], ls="--", lw=1.2)
        ax1.legend(fontsize=12); ax1.set_yticks([]); ax2.set_yticks([])
        fig.tight_layout()
        save(fig, OUT / f"05-cross-embodiment_{lang}.svg")


# ================================================================= timeline (arXiv first-version month)
TIMELINE = [  # (name, arXiv id, lane)  lane 0: policies / VLAs, lane 1: world models and video
    ("SayCan", "2204.01691", 0), ("Gato", "2205.06175", 0), ("DayDreamer", "2206.14176", 1), ("VIMA", "2210.03094", 0),
    ("RT-1", "2212.06817", 0), ("UniPi", "2302.00111", 1), ("PaLM-E", "2303.03378", 0), ("RoboCat", "2306.11706", 0),
    ("RT-2", "2307.15818", 0), ("Open X-Embodiment (RT-X)", "2310.08864", 0), ("UniSim", "2310.06114", 1), ("GR-1", "2312.13139", 1),
    ("Genie", "2402.15391", 1), ("Octo", "2405.12213", 0), ("OpenVLA", "2406.09246", 0), ("RDT-1B", "2410.07864", 0),
    ("pi0", "2410.24164", 0), ("FAST", "2501.09747", 0), ("Cosmos", "2501.03575", 1), ("OpenVLA-OFT", "2502.19645", 0),
    ("GR00T N1", "2503.14734", 0), ("Gemini Robotics", "2503.20020", 0), ("pi0.5", "2504.16054", 0), ("SmolVLA", "2506.01844", 0),
    ("V-JEPA 2", "2506.09985", 1), ("Gemini Robotics 1.5", "2510.03342", 0),
]


def fig_timeline():
    def month(aid):
        yy, mm = int(aid[:2]), int(aid[2:4])
        return 2000 + yy + (mm - 0.5) / 12
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)
        fig, ax = plt.subplots(figsize=(10, 7.2))
        ax.axhline(0, color=C["dark"], lw=1.6)
        for yr in range(2022, 2027):
            ax.plot([yr, yr], [-0.12, 0.12], color=C["dark"], lw=1.4)
            ax.text(yr, -0.35, str(yr), ha="center", fontsize=14)
        items = sorted(TIMELINE, key=lambda r: month(r[1]))
        up, down = [], []
        for name, aid, lane in items:
            (up if lane == 0 else down).append((month(aid), name, aid))
        for group, sign, col in ((up, 1, C["a"]), (down, -1, C["b"])):
            for i, (x, name, aid) in enumerate(group):
                level = (i % 6 + 1) * 0.55 if sign > 0 else (i % 3 + 1) * 0.6
                y = sign * level + (0 if sign > 0 else -0.45)
                ax.plot([x, x], [0, y], color=col, lw=1, alpha=0.6, zorder=1)
                ax.plot(x, 0, "o", color=col, ms=6, zorder=2)
                ax.text(x, y + 0.05 * sign, name, ha="center", va="bottom" if sign > 0 else "top", fontsize=12.5, color=C["dark"],
                        bbox=dict(fc="white", ec=col, lw=1, boxstyle="round,pad=0.2"), zorder=3)
        ax.text(2022.02, 3.75, L("robot policies and VLAs", "机器人策略与 VLA", "ロボット方策と VLA"), fontsize=14, color=C["a"], weight="bold")
        ax.text(2022.02, -2.85, L("world models and video models for robots", "面向机器人的世界模型与视频模型", "ロボットのための世界モデルと動画モデル"),
                fontsize=14, color=C["b"], weight="bold")
        ax.set_xlim(2021.85, 2026.1); ax.set_ylim(-3.0, 4.0)
        ax.axis("off")
        save(fig, OUT / f"05-timeline_{lang}.svg")


if __name__ == "__main__":
    fig_binning()
    fig_dct()
    fig_architectures()
    fig_cross_embodiment()
    fig_timeline()
    fig_flow(*run_flow())
