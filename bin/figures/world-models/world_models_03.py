"""Figures for world-models post 03 (video world simulators).

Run:  python3 bin/figures/world-models/world_models_03.py
Needs numpy, matplotlib and torch (CPU; the toy latent action model takes a few minutes).
Writes assets/img/blog/world-models/03-*.svg. Timeline dates are the months of the arXiv
submissions / official announcements cited in the post.
"""
from wm_common import *  # noqa: F401,F403
from matplotlib.patches import Rectangle, Polygon
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401


def frame_icon(ax, x, y, s=0.75, seed=0, fc="#e3f0fa", ec=None, txt=None, fs=14, dot=None):
    """A small 'video frame': a rounded square with a simple scene (ground line, a dot)."""
    ec = ec or C["z"]
    ax.add_patch(FancyBboxPatch((x - s / 2, y - s / 2), s, s, boxstyle="round,pad=0.01,rounding_size=0.06",
                                fc=fc, ec=ec, lw=1.8, zorder=2))
    ax.plot([x - s / 2 + 0.05, x + s / 2 - 0.05], [y - s * 0.2] * 2, color=C["y"], lw=2, zorder=3)
    dx = dot if dot is not None else 0.0
    ax.add_patch(Circle((x - s * 0.15 + dx, y - s * 0.05), s * 0.1, fc=C["b"], ec="none", zorder=3))
    if txt:
        ax.text(x, y - s / 2 - 0.22, txt, ha="center", va="center", fontsize=fs)
    return dict(x=x, y=y, w=s, h=s)


# ============================================================ 1. next-frame prediction loop
def fig_next_frame(lang):
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    fig, ax = diagram(10, 4.6)
    xs = [0.8, 1.9, 3.0, 4.1]
    names = ["$x_{t-3}$", "$x_{t-2}$", "$x_{t-1}$", "$x_t$"]
    for i, (x, n) in enumerate(zip(xs, names)):
        frame_icon(ax, x, 2.6, dot=0.08 * i, txt=n)
        ax.text(x, 1.35, f"$a_{{{['t-3', 't-2', 't-1', 't'][i]}}}$", ha="center", fontsize=15, color=C["b"])
    ax.add_patch(FancyBboxPatch((0.25, 1.05), 4.4, 2.15, boxstyle="round,pad=0.02,rounding_size=0.12", fc="none",
                                ec=C["gray"], lw=1.6, ls="--"))
    mltext(ax, 2.45, 3.65, T_("context: last N frames and actions", "上下文：最近 N 帧与动作", "コンテキスト：直近 N フレームと行動"),
           fs=15, color=C["gray"])
    m = box(ax, 6.3, 2.3, "$p_\\theta(x_{t+1}\\mid x_{\\leq t}, a_{\\leq t})$", w=2.9, h=1.0, fs=15)
    nf = frame_icon(ax, 8.9, 2.6, dot=0.32, fc="#fdebd3", ec=C["b"], txt="$x_{t+1}$")
    arrow(ax, (4.7, 2.3), m)
    arrow(ax, m, nf)
    ax.add_patch(FancyArrowPatch((8.9, 1.75), (4.1, 0.75), connectionstyle="arc3,rad=-0.25", arrowstyle="-|>",
                                 mutation_scale=16, lw=2.2, color=C["b"]))
    mltext(ax, 7.6, 0.35, T_("append and slide the window", "追加到上下文并滑动窗口", "コンテキストに追加し窓をずらす"), fs=15, color=C["b"])
    ax.set_ylim(0.0, 4.2)
    save(fig, out(f"03-next-frame_{lang}.svg"))


# ============================================================ 2. timeline
def fig_timeline():
    ev = [  # (year + (month - 0.5) / 12, name, real-time interactive?, action-conditioned?)
        (2023 + 8.5 / 12, "GAIA-1", False, True),
        (2023 + 9.5 / 12, "UniSim", False, True),
        (2024 + 1.5 / 12, "Genie", False, True),
        (2024 + 1.5 / 12, "Sora report", False, False),
        (2024 + 4.5 / 12, "DIAMOND", False, True),
        (2024 + 6.5 / 12, "Diffusion Forcing", False, True),
        (2024 + 7.5 / 12, "GameNGen", True, True),
        (2024 + 11.5 / 12, "Genie 2", False, True),
        (2025 + 0.5 / 12, "Cosmos", False, True),
        (2025 + 7.5 / 12, "Genie 3", True, True),
    ]
    fig, ax = plt.subplots(figsize=(9.5, 4.2))
    ax.axhline(0, color=C["dark"], lw=2)
    for yr in [2023.5, 2024, 2024.5, 2025, 2025.5]:
        ax.plot([yr, yr], [-0.08, 0.08], color=C["dark"], lw=1.5)
    for yr in [2024, 2025]:
        ax.text(yr, -0.32, str(yr), ha="center", fontsize=15, fontweight="bold")
    levels = [1.0, -1.0, 1.55, -1.55, 0.6, -0.6, 1.0, -1.0, 1.55, -0.6]
    for (x, name, rt, ac), lv in zip(ev, levels):
        col = C["b"] if rt else (C["a"] if ac else C["gray"])
        ax.plot([x, x], [0, lv * 0.85], color=col, lw=1.3)
        ax.plot(x, 0, "o", ms=10 if rt else 8, color=col, mec="white", mew=1.5, zorder=4)
        ax.text(x, lv, name, ha="center", va="center", fontsize=14, color=col,
                bbox=dict(fc="white", ec=col, boxstyle="round,pad=0.25", lw=1.2))
    ax.plot([], [], "o", color=C["b"], ms=10, label="real-time interactive")
    ax.plot([], [], "o", color=C["a"], ms=8, label="action-conditioned")
    ax.plot([], [], "o", color=C["gray"], ms=8, label="no action input")
    ax.legend(frameon=False, loc="lower left", fontsize=12, ncol=3, bbox_to_anchor=(0.0, -0.08))
    ax.set_xlim(2023.45, 2025.85); ax.set_ylim(-2.1, 1.9)
    ax.axis("off")
    save(fig, out("03-timeline.svg"))


# ============================================================ 3. spacetime patches (3D)
def fig_patches():
    Tt, Hh, Ww, pt, ph, pw = 4, 4, 6, 2, 2, 2
    fig = plt.figure(figsize=(9, 6))
    ax = fig.add_subplot(111, projection="3d")
    cmap = plt.get_cmap("tab20")
    gap = 0.35
    idx = 0
    for it in range(Tt // pt):
        for ih in range(Hh // ph):
            for iw in range(Ww // pw):
                col = cmap(idx % 20)
                # x = time, y = width, z = height; patches exploded by `gap` so each token is visible
                cube(ax, it * pt + it * gap, iw * pw + iw * gap, ih * ph + ih * gap, col, size=(pt, pw, ph))
                idx += 1
    ax.set_xlabel("time $t$", labelpad=6); ax.set_ylabel("width $w$", labelpad=6); ax.set_zlabel("height $h$", labelpad=2)
    ax.set_xticks([]); ax.set_yticks([]); ax.set_zticks([])
    ax.set_box_aspect((Tt + gap, Ww + 2 * gap, Hh + gap))
    ax.view_init(elev=22, azim=-58)
    ax.set_title(f"latent video {Tt}x{Hh}x{Ww}, patch {pt}x{ph}x{pw}  $\\rightarrow$  {idx} tokens", fontsize=15)
    save(fig, out("03-spacetime-patches.svg"))


def cube(ax, x, y, z, col, size=(1, 1, 1)):
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    X = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]) * size + [x, y, z]
    faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]]
    ax.add_collection3d(Poly3DCollection([X[f] for f in faces], facecolor=col, edgecolor="white", linewidth=1.0, alpha=1.0))


# ============================================================ 4. Genie pipeline
def fig_genie(lang):
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    fig, ax = diagram(11, 5.6)
    ax.text(0.2, 5.25, T_("training: video only, no action labels", "训练：只有视频，没有动作标签", "学習：動画のみ、行動ラベルなし"),
            fontsize=15, color=C["dark"], fontweight="bold")
    f1 = frame_icon(ax, 0.8, 4.0, txt="$x_{1:t}$", dot=0.0)
    f2 = frame_icon(ax, 0.8, 2.35, txt="$x_{t+1}$", dot=0.15, fc="#fdebd3", ec=C["b"])
    tok = box(ax, 3.1, 4.0, T_("video tokenizer", "视频 tokenizer", "動画トークナイザ") + "\n(ST-VQ)", w=2.5, h=1.0, fs=14)
    lam = box(ax, 3.1, 2.35, T_("latent action\nmodel", "潜在动作\n模型", "潜在行動\nモデル"), w=2.5, h=1.0, fs=14,
              fc="#fdebd3", ec=C["b"])
    dyn = box(ax, 6.6, 3.2, T_("dynamics\n(MaskGIT ST-Transformer)", "动力学模型\n（MaskGIT ST-Transformer）",
                               "ダイナミクス\n（MaskGIT ST-Transformer）"), w=3.0, h=1.1, fs=14, fc="#e3f0fa", ec=C["z"])
    outz = box(ax, 9.6, 3.2, "$\\hat z_{t+1}$", w=1.0, h=0.8, fc="white", ec=C["gray"], fs=16)
    arrow(ax, f1, tok); arrow(ax, f1, lam); arrow(ax, f2, lam)
    arrow(ax, tok, dyn, text="$z_{1:t}$", toff=(0, 0.3))
    arrow(ax, lam, dyn, text="$\\tilde a_{1:t}\\in\\{1..8\\}$", toff=(0.2, -0.38), color=C["b"], tcolor=C["b"])
    arrow(ax, dyn, outz)
    ax.plot([0.2, 10.8], [1.25, 1.25], color=C["gray"], lw=1, ls=":")
    ax.text(0.2, 0.85, T_("playing: the LAM is dropped; the user picks one of 8 codes per step",
                          "游玩：丢弃 LAM；用户每一步从 8 个码中选一个", "プレイ：LAM は使わず、ユーザーが各ステップで 8 個のコードから 1 つ選ぶ"),
            fontsize=15, color=C["dark"], fontweight="bold")
    for k in range(8):
        ax.add_patch(FancyBboxPatch((0.4 + 0.58 * k, 0.05), 0.48, 0.5, boxstyle="round,pad=0.01,rounding_size=0.08",
                                    fc=C["b"] if k == 5 else "white", ec=C["b"], lw=1.5))
        ax.text(0.64 + 0.58 * k, 0.3, str(k + 1), ha="center", va="center", fontsize=13,
                color="white" if k == 5 else C["b"])
    arrow(ax, (5.1, 0.3), (5.6, 0.3), color=C["b"])
    box(ax, 7.25, 0.3, T_("dynamics + decoder", "动力学 + 解码器", "ダイナミクス + デコーダ"), w=3.1, h=0.55, fs=13, fc="#e3f0fa", ec=C["z"])
    frame_icon(ax, 9.65, 0.3, s=0.5, dot=0.05)
    arrow(ax, (8.85, 0.3), (9.35, 0.3))
    ax.set_ylim(-0.2, 5.6); ax.set_xlim(0.1, 11.0)
    save(fig, out(f"03-genie_{lang}.svg"))


# ============================================================ 5. latent action model bottleneck
def fig_lam(lang):
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    fig, ax = diagram(10.5, 4.3)
    p = frame_icon(ax, 0.7, 3.1, txt="$x_{1:t}$")
    n = frame_icon(ax, 0.7, 1.2, txt="$x_{t+1}$", dot=0.18, fc="#fdebd3", ec=C["b"])
    enc = Polygon([[2.0, 3.6], [2.0, 0.8], [3.6, 1.75], [3.6, 2.65]], closed=True, fc=C["fill"], ec=C["a"], lw=2)
    ax.add_patch(enc); mltext(ax, 2.7, 2.2, T_("encoder", "编码器", "エンコーダ"), fs=14)
    vq = box(ax, 4.5, 2.2, "VQ\n$|\\mathcal{A}|=8$", w=1.1, h=1.1, fc="#fdebd3", ec=C["b"], fs=14)
    dec = Polygon([[5.5, 1.75], [5.5, 2.65], [7.1, 3.6], [7.1, 0.8]], closed=True, fc=C["fill"], ec=C["a"], lw=2)
    ax.add_patch(dec); mltext(ax, 6.4, 2.2, T_("decoder", "解码器", "デコーダ"), fs=14)
    o = frame_icon(ax, 8.4, 2.2, txt="$\\hat x_{t+1}$", dot=0.18, fc="white", ec=C["gray"])
    arrow(ax, (1.1, 3.1), (2.0, 2.9)); arrow(ax, (1.1, 1.2), (2.0, 1.5))
    arrow(ax, (3.6, 2.2), vq); arrow(ax, vq, (5.5, 2.2), text="$\\tilde a_t$", toff=(0, 0.3), tcolor=C["b"])
    arrow(ax, (7.1, 2.2), o)
    ax.add_patch(FancyArrowPatch((1.1, 3.35), (5.9, 3.0), connectionstyle="arc3,rad=-0.25", arrowstyle="-|>",
                                 mutation_scale=14, lw=1.8, color=C["z"], ls="--"))
    mltext(ax, 3.9, 4.05, T_("past frames also go to the decoder", "过去的帧也送入解码器", "過去フレームはデコーダにも入る"),
           fs=14, color=C["z"])
    mltext(ax, 4.5, 0.75, T_("3 bits", "3 比特", "3 ビット"), fs=14, color=C["b"])
    mltext(ax, 9.75, 2.2, "$\\Vert x_{t+1}-\\hat x_{t+1}\\Vert^2$", fs=14)
    ax.set_xlim(0, 10.6); ax.set_ylim(0.2, 4.4)
    save(fig, out(f"03-lam_{lang}.svg"))


# ============================================================ 6. GameNGen
def fig_gamengen(lang):
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    fig, ax = diagram(11, 5.0)
    for i in range(4):
        frame_icon(ax, 0.7 + 0.95 * i, 3.9, s=0.7, dot=0.05 * i)
    ax.text(2.1, 4.65, T_("past frames (N = 64 in the paper)", "过去的帧（论文中 N = 64）", "過去フレーム（論文では N = 64）"),
            ha="center", fontsize=14)
    enc = box(ax, 2.1, 2.75, T_("SD encoder E", "SD 编码器 E", "SD エンコーダ E"), w=3.0, h=0.6, fs=14, fc="#e3f0fa", ec=C["z"])
    arrow(ax, (2.1, 3.5), enc)
    nz = box(ax, 2.1, 1.6, "$+\\ \\sigma\\,\\epsilon,\\ \\ \\sigma\\sim\\mathcal{U}$", w=2.4, h=0.65, fs=15, fc="#fdebd3", ec=C["b"])
    arrow(ax, enc, nz)
    mltext(ax, 2.1, 0.6, T_("context noise augmentation\n(sigma is also given to the model)", "上下文噪声增强\n（sigma 也作为输入给模型）",
                            "コンテキストへのノイズ付加\n（sigma もモデルに入力）"), fs=13, color=C["b"])
    tgt = box(ax, 5.2, 3.9, T_("noisy target", "带噪目标", "ノイズ付き目標") + "\n$z^{(k)}_{t+1}$", w=2.0, h=0.95, fs=14,
              fc="white", ec=C["gray"])
    cat = box(ax, 5.2, 2.2, T_("concat\n(channels)", "按通道\n拼接", "チャネル方向\nに連結"), w=1.4, h=0.95, fs=14, fc="white", ec=C["dark"])
    arrow(ax, nz, cat); arrow(ax, tgt, cat)
    unet = box(ax, 7.6, 2.2, "U-Net\n(SD v1.4)", w=1.8, h=1.2, fs=15, fc=C["fill"], ec=C["a"])
    act = box(ax, 7.6, 4.0, T_("actions", "动作", "行動") + "\n$a_{t-N+1:t}$", w=1.8, h=0.95, fs=14, fc="white", ec=C["y"])
    arrow(ax, cat, unet); arrow(ax, act, unet, color=C["y"], text=T_("replaces text", "替代文本", "テキストの代わり"),
                                toff=(0.95, 0), fs=12, tcolor=C["y"])
    out_f = frame_icon(ax, 9.9, 2.2, s=0.75, dot=0.2, fc="#fdebd3", ec=C["b"], txt="$x_{t+1}$")
    arrow(ax, unet, out_f, text=T_("4 DDIM steps", "4 步 DDIM", "DDIM 4 ステップ"), toff=(0, 0.62), fs=13)
    ax.set_xlim(0, 10.8); ax.set_ylim(0.0, 5.0)
    save(fig, out(f"03-gamengen_{lang}.svg"))


# ============================================================ 7. memory failure: context window vs revisit
def fig_memory(lang):
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    s = np.linspace(0, 1, 400)
    # a closed loop: walk east, turn north, come back west and south to near the start
    path = np.stack([3.2 * np.sin(2 * np.pi * s) * (1 - 0.15 * s) + 0.5,
                     1.6 - 1.6 * np.cos(2 * np.pi * s) * (1 - 0.1 * s)], 1)
    fig, ax = plt.subplots(figsize=(9, 5.9))
    fig.subplots_adjust(0, 0, 1, 1)
    # world: a few landmark boxes (what the model must remember)
    marks = [((-2.2, 1.0), C["y"]), ((5.1, 0.6), C["x"]), ((1.0, 3.9), C["c"]), ((-0.2, -0.9), C["a"])]
    for (mx, my), col in marks:
        ax.add_patch(Rectangle((mx - 0.3, my - 0.3), 0.6, 0.6, fc=col, ec="none", alpha=0.85))
    ax.plot(path[:, 0], path[:, 1], color=C["gray"], lw=2)
    k_ctx = 60
    t1, t2 = 30, 385
    ax.plot(path[t2 - k_ctx:t2 + 1, 0], path[t2 - k_ctx:t2 + 1, 1], color=C["b"], lw=7, alpha=0.6, solid_capstyle="round")
    for t, col, nm in [(t1, C["z"], "$t_1$"), (t2, C["b"], "$t_2$")]:
        p = path[t]; d = path[t + 3] - path[t - 3]; d /= np.linalg.norm(d)
        ang = np.arctan2(d[1], d[0])
        if t == t2:
            ang += 0.0
        L, half = 5.3, 0.3
        cone = np.array([p, p + L * np.array([np.cos(ang - half), np.sin(ang - half)]),
                         p + L * np.array([np.cos(ang + half), np.sin(ang + half)])])
        ax.add_patch(Polygon(cone, closed=True, fc=col, alpha=0.18, ec=col, lw=1.5))
        ax.plot(*p, "o", color=col, ms=11, mec="white", mew=2, zorder=5)
        ax.text(p[0] - 0.15, p[1] - 0.45, nm, fontsize=17, color=col, ha="center")
    ax.annotate("", xy=path[60], xytext=path[50], arrowprops=dict(arrowstyle="-|>", color=C["gray"], lw=2))
    ax.text(path[t2 - k_ctx // 2, 0] - 0.2, path[t2 - k_ctx // 2, 1] - 0.55,
            T_("context window", "上下文窗口", "コンテキスト窓"), color=C["b"], fontsize=14, ha="center")
    mltext(ax, 5.1, 1.35, T_("seen at $t_1$", "", "") if lang == "en" else T_("", "在 t1 时见过", "t1 で見た"), fs=14, color=C["z"])
    mltext(ax, 1.2, -1.85, T_("at $t_2$ the same place is in view again, but the frames from $t_1$\nare outside the context window: the model must re-imagine it",
                             "", "") if lang == "en" else T_("", "在 t2 时同一个地方再次进入视野，但 t1 的帧已在上下文窗口之外：\n模型只能重新“想象”它",
                                                             "t2 で同じ場所が再び視界に入るが、t1 のフレームはコンテキスト窓の外：\nモデルはそこを想像し直すしかない"),
           fs=13, color=C["dark"])
    ax.set_aspect("equal"); ax.set_xlim(-3.6, 6.0); ax.set_ylim(-2.4, 4.6)
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    for sp in ax.spines.values():
        sp.set_visible(False)
    save(fig, out(f"03-memory_{lang}.svg"))


# ============================================================ 8. diffusion forcing noise levels
def fig_diffusion_forcing(lang):
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    rng = np.random.default_rng(0)
    F, K, R = 8, 10, 6  # frames, max noise level, rows (training examples)
    full = np.repeat(rng.integers(0, K + 1, (R, 1)), F, 1)
    tf = np.full((R, F), -1.0)
    for r in range(R):
        n = rng.integers(2, F)  # context length
        tf[r, :n] = 0; tf[r, n] = rng.integers(1, K + 1)
    df = rng.integers(0, K + 1, (R, F)).astype(float)
    # causal "pyramid" sampling: frame f is denoised starting at iteration 2 f; rows = sampling iterations
    it = np.arange(0, 2 * (F - 1) + K + 1, 2)
    pyr = np.array([[np.clip(K - (i - 2 * f), 0, K) if i >= 2 * f else K for f in range(F)] for i in it], float)
    fig, axs = plt.subplots(2, 2, figsize=(8.6, 7.6))
    axs = axs.ravel()
    fig.subplots_adjust(hspace=0.55, wspace=0.25)
    cmap = plt.get_cmap("Oranges").copy(); cmap.set_under("#bdbdbd")
    titles = [T_("full-sequence\ndiffusion", "全序列\n扩散", "系列全体の\n拡散"),
              T_("next-frame\n(teacher forcing)", "逐帧预测\n（教师强制）", "次フレーム予測\n（教師強制）"),
              T_("Diffusion Forcing\n(training)", "Diffusion Forcing\n（训练）", "Diffusion Forcing\n（学習）"),
              T_("Diffusion Forcing\n(causal sampling)", "Diffusion Forcing\n（因果采样）", "Diffusion Forcing\n（因果的サンプリング）")]
    for ax, M, ttl in zip(axs, [full, tf, df, pyr], titles):
        ax.imshow(M, cmap=cmap, vmin=0, vmax=K, aspect="auto", interpolation="nearest")
        ax.set_xticks(range(F)); ax.set_xticklabels([str(i + 1) for i in range(F)], fontsize=11)
        ax.set_yticks([]); ax.grid(False)
        ax.set_title(ttl, fontsize=14)
        ax.set_xlabel(T_("frame", "帧", "フレーム"), fontsize=13)
        for sp in ax.spines.values():
            sp.set_visible(False)
    for a_ in axs[:3]:
        a_.set_ylabel(T_("training examples", "训练样本", "学習サンプル"), fontsize=13)
    axs[3].set_ylabel(T_("sampling iteration", "采样迭代", "サンプリング反復"), fontsize=13)
    sm = plt.cm.ScalarMappable(cmap=cmap, norm=plt.Normalize(0, K))
    cb = fig.colorbar(sm, ax=axs, shrink=0.8, pad=0.02); cb.set_label(T_("noise level k", "噪声水平 k", "ノイズレベル k"))
    cb.set_ticks([0, K]); cb.set_ticklabels(["0", "K"])
    save(fig, out(f"03-diffusion-forcing_{lang}.svg"))


# ============================================================ 9. toy latent action model (the post's code)
def run_lam(encoder_kind, steps=3000, seed=0):
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    torch.manual_seed(seed)
    G, K = 12, 8
    MOVES = torch.tensor([[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]])

    def render(pos):
        ys, xs = torch.meshgrid(torch.arange(G), torch.arange(G), indexing="ij")
        d2 = (ys[None] - pos[:, 0, None, None]) ** 2 + (xs[None] - pos[:, 1, None, None]) ** 2
        return torch.exp(-d2.float() / 0.5).reshape(len(pos), -1)

    def sample_transitions(n):
        pos = torch.randint(1, G - 1, (n, 2))
        act = torch.randint(0, 5, (n,))
        nxt = (pos + MOVES[act]).clamp(0, G - 1)
        return render(pos), render(nxt), act

    def mlp(i, o, h=256):
        return nn.Sequential(nn.Linear(i, h), nn.ReLU(), nn.Linear(h, h), nn.ReLU(), nn.Linear(h, o))

    class ConvEncoder(nn.Module):
        def __init__(self):
            super().__init__()
            self.conv = nn.Sequential(nn.Conv2d(2, 32, 3, padding=1), nn.ReLU(), nn.Conv2d(32, 32, 3, padding=1), nn.ReLU())
            self.head = nn.Linear(32, K)

        def forward(self, x, x_next):
            h = self.conv(torch.stack([x, x_next], 1).view(-1, 2, G, G))
            return self.head(h.amax(dim=(2, 3)))

    class MLPEncoder(nn.Module):
        def __init__(self):
            super().__init__()
            self.net = mlp(2 * G * G, K)

        def forward(self, x, x_next):
            return self.net(torch.cat([x, x_next], 1))

    enc = ConvEncoder() if encoder_kind == "conv" else MLPEncoder()
    dec = mlp(G * G + K, G * G)
    opt = torch.optim.Adam([*enc.parameters(), *dec.parameters()], lr=1e-3)
    for step in range(steps):
        x, x_next, _ = sample_transitions(256)
        z = F.gumbel_softmax(enc(x, x_next), tau=1.0, hard=True)
        loss = F.mse_loss(dec(torch.cat([x, z], 1)), x_next) * 100
        opt.zero_grad(); loss.backward(); opt.step()
    with torch.no_grad():
        x, x_next, act = sample_transitions(5000)
        idx = enc(x, x_next).argmax(1)
        conf = np.zeros((5, K))
        for a in range(5):
            conf[a] = torch.bincount(idx[act == a], minlength=K).numpy()
        right = torch.bincount(idx[act == 4], minlength=K).argmax()
        frames = [render(torch.tensor([[6, 3]]))]
        for t in range(4):
            frames.append(dec(torch.cat([frames[-1], F.one_hot(right, K).float()[None]], 1)))
        frames = [f.view(G, G).numpy() for f in frames]
    purity = conf.max(1) / conf.sum(1)
    print(f"LAM {encoder_kind}: final loss {loss.item():.4f}, purity per action {purity.round(2)}")
    return conf, frames, purity


def fig_lam_results():
    names = ["stay", "up", "down", "left", "right"]
    res = {k: run_lam(k) for k in ("conv", "mlp")}
    fig = plt.figure(figsize=(10, 7.4))
    gs = fig.add_gridspec(2, 5, height_ratios=[1.25, 1], hspace=0.45)
    for j, (k, ttl) in enumerate([("conv", "ConvEncoder (translation-invariant)"), ("mlp", "MLP encoder")]):
        ax = fig.add_subplot(gs[0, j * 3 // 1: j * 3 + 2] if j == 0 else gs[0, 3:5])
        conf = res[k][0]
        P = conf / conf.sum(1, keepdims=True)
        ax.imshow(P, cmap="Purples", vmin=0, vmax=1, aspect="auto")
        for a in range(5):
            for c in range(8):
                if P[a, c] > 0.05:
                    ax.text(c, a, f"{P[a, c]:.2f}", ha="center", va="center", fontsize=10,
                            color="white" if P[a, c] > 0.5 else C["dark"])
        ax.set_yticks(range(5)); ax.set_yticklabels(names if j == 0 else [], fontsize=13)
        ax.set_xticks(range(8)); ax.set_xticklabels(range(8), fontsize=12)
        ax.set_xlabel("latent action code"); ax.grid(False)
        ax.set_title(f"{ttl}\nmean purity {res[k][2].mean():.2f}", fontsize=14)
    frames = res["conv"][1]
    for t in range(5):
        ax = fig.add_subplot(gs[1, t])
        ax.imshow(frames[t], cmap="gray_r", vmin=0, vmax=1)
        r, c = np.unravel_index(np.argmax(frames[t]), frames[t].shape)
        ax.set_title("start" if t == 0 else f"'right' x{t}", fontsize=13)
        ax.set_xlabel(f"row {r}, col {c}", fontsize=12)
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    save(fig, out("03-lam-results.svg"))


if __name__ == "__main__":
    for lang in LANGS:
        fig_next_frame(lang); fig_genie(lang); fig_lam(lang); fig_gamengen(lang); fig_memory(lang)
        fig_diffusion_forcing(lang)
    fig_timeline(); fig_patches()
    fig_lam_results()
