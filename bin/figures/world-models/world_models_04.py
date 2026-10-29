"""Figures for world-models post 04 (explicit 3D and 4D world generation).

Run:  python3 bin/figures/world-models/world_models_04.py
Needs numpy, matplotlib and torch (CPU, about two minutes for the SDS toy).
Writes assets/img/blog/world-models/04-*.svg. Camera convention for the depth figure is the one of
the post's code (OpenCV / pinhole): x right, y down, z forward along the optical axis.
"""
from wm_common import *  # noqa: F401,F403
from matplotlib.patches import Ellipse, Rectangle, Polygon
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401
from mpl_toolkits.mplot3d.art3d import Poly3DCollection


# ============================================================ 1. SDS loop
def fig_sds_loop(lang):
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    fig, ax = diagram(11, 5.0)
    th = box(ax, 1.1, 3.6, T_("3D scene", "3D 场景", "3D シーン") + "\n$\\theta$", w=1.7, h=1.1, fc="#e3f0fa", ec=C["z"], fs=15)
    cam = box(ax, 1.1, 1.6, T_("random\ncamera", "随机\n相机", "ランダムな\nカメラ"), w=1.7, h=1.1, fc="white", ec=C["gray"], fs=14)
    ren = box(ax, 3.6, 3.6, T_("renderer", "渲染器", "レンダラ") + "\n$x=g(\\theta)$", w=1.9, h=1.1, fs=15)
    noi = box(ax, 6.1, 3.6, "$x_t=\\alpha_t x+\\sigma_t\\epsilon$", w=2.2, h=0.9, fc="#fdebd3", ec=C["b"], fs=15)
    dm = box(ax, 9.0, 3.6, T_("frozen diffusion\nmodel", "冻结的扩散\n模型", "固定した\n拡散モデル") + "\n$\\hat\\epsilon_\\phi(x_t;y,t)$",
             w=2.3, h=1.5, fc=C["fill"], ec=C["a"], fs=14)
    res = box(ax, 9.0, 1.2, "$w(t)\\,(\\hat\\epsilon_\\phi-\\epsilon)$", w=2.4, h=0.8, fc="white", ec=C["x"], fs=15)
    arrow(ax, th, ren); arrow(ax, cam, ren); arrow(ax, ren, noi); arrow(ax, noi, dm)
    arrow(ax, dm, res, color=C["x"])
    ax.text(6.3, 4.75, T_("prompt y", "提示词 y", "プロンプト y"), ha="center", va="center", fontsize=14, color=C["y"])
    arrow(ax, (7.1, 4.75), (7.8, 4.45), color=C["y"])
    ax.add_patch(FancyArrowPatch((7.75, 1.2), (1.3, 2.95), connectionstyle="arc3,rad=-0.18", arrowstyle="-|>",
                                 mutation_scale=16, lw=2.6, color=C["x"]))
    mltext(ax, 4.6, 0.75, T_("times dx/dtheta: gradient to the scene only\n(the U-Net Jacobian is skipped)",
                             "乘以 dx/dtheta：梯度只回传给场景\n（跳过 U-Net 的雅可比）",
                             "dx/dtheta を掛ける：勾配はシーンにだけ戻る\n（U-Net のヤコビアンは省略）"), fs=14, color=C["x"])
    ax.set_ylim(0.1, 5.0)
    save(fig, out(f"04-sds-loop_{lang}.svg"))


# ============================================================ 2. SDS toy (the post's code)
def fig_sds_toy():
    import math
    import torch
    import torch.nn as nn
    torch.manual_seed(0)
    T = 1000
    betas = torch.linspace(1e-4, 0.02, T)
    alpha_bar = torch.cumprod(1 - betas, dim=0)
    ang = torch.arange(8).float() * (2 * math.pi / 8)
    CENTERS = 2.0 * torch.stack([torch.cos(ang), torch.sin(ang)], dim=1)

    def sample_data(n):
        return CENTERS[torch.randint(0, 8, (n,))] + 0.1 * torch.randn(n, 2)

    def temb(t, dim=32):
        freqs = torch.exp(-math.log(10000.0) * torch.arange(dim // 2) / (dim // 2))
        a = t.float()[:, None] * freqs[None]
        return torch.cat([torch.sin(a), torch.cos(a)], 1)

    net = nn.Sequential(nn.Linear(34, 256), nn.SiLU(), nn.Linear(256, 256), nn.SiLU(),
                        nn.Linear(256, 256), nn.SiLU(), nn.Linear(256, 2))
    eps_model = lambda x, t: net(torch.cat([x, temb(t)], 1))
    opt = torch.optim.Adam(net.parameters(), lr=1e-3)
    for step in range(4000):
        x0, t = sample_data(512), torch.randint(0, T, (512,))
        eps = torch.randn_like(x0)
        ab = alpha_bar[t][:, None]
        loss = ((eps_model(ab.sqrt() * x0 + (1 - ab).sqrt() * eps, t) - eps) ** 2).mean()
        opt.zero_grad(); loss.backward(); opt.step()
    net.requires_grad_(False)

    def sds(anneal, seed=1):
        torch.manual_seed(seed)
        theta = (0.5 * torch.randn(512, 2)).requires_grad_(True)
        init = theta.detach().clone()
        opt = torch.optim.Adam([theta], lr=1e-2)
        snaps = {}
        for step in range(2000):
            t_max = int(980 - 930 * step / 2000) if anneal else 980
            t = torch.randint(20, t_max, (512,))
            eps = torch.randn_like(theta)
            ab = alpha_bar[t][:, None]
            with torch.no_grad():
                x_t = ab.sqrt() * theta + (1 - ab).sqrt() * eps
                grad = eps_model(x_t, t) - eps
            opt.zero_grad(); theta.grad = grad; opt.step()
            if step in (300, 1000):
                snaps[step] = theta.detach().clone().numpy()
        return init.numpy(), snaps, theta.detach().numpy()

    def spread(x):
        x = torch.tensor(x)
        d = torch.cdist(x, CENTERS); idx = d.argmin(1)
        return (x - CENTERS[idx]).norm(dim=1).mean().item(), idx.unique().numel()

    init, snaps, th_a = sds(True)
    _, _, th_u = sds(False)
    real = sample_data(512).numpy()
    fig, axs = plt.subplots(2, 3, figsize=(9.6, 6.9), sharex=True, sharey=True)
    panels = [(init, "init $\\theta$", C["gray"]), (snaps[300], "SDS, step 300", C["b"]), (snaps[1000], "SDS, step 1000", C["b"]),
              (th_a, "SDS, annealed $t$", C["b"]), (th_u, "SDS, uniform $t$", C["x"]), (real, "real samples", C["a"])]
    for ax, (x, ttl, col) in zip(axs.ravel(), panels):
        ax.scatter(x[:, 0], x[:, 1], s=4, color=col, alpha=0.6, rasterized=True)
        ax.scatter(CENTERS[:, 0], CENTERS[:, 1], marker="+", s=90, color=C["dark"], lw=1.6, zorder=5)
        s_, m_ = spread(x)
        ax.set_title(ttl, fontsize=14)
        ax.text(-2.9, -2.85, f"{s_:.3f}, {m_}/8", fontsize=13, bbox=dict(fc="white", ec="none", alpha=0.85))
        ax.set_xlim(-3, 3); ax.set_ylim(-3, 3); ax.set_aspect("equal")
    for nm, x in [("real", real), ("SDS annealed", th_a), ("SDS uniform", th_u)]:
        print(nm, "mean distance to nearest mode, modes covered:", spread(x),
              "mean radius", np.linalg.norm(x, axis=1).mean().round(3))
    save(fig, out("04-sds-toy.svg"))


# ============================================================ 3. scene growing loop
def fig_scene_loop(lang):
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    fig, ax = diagram(10, 5.6)
    steps = [T_("1 render from\na new camera", "1 从新相机\n渲染", "1 新しいカメラ\nから描画"),
             T_("2 inpaint the\nholes (mask M)", "2 修复空洞\n（掩码 M）", "2 穴を修復\n（マスク M）"),
             T_("3 monocular\ndepth", "3 单目深度\n估计", "3 単眼深度\n推定"),
             T_("4 align depth\n(scale, shift)", "4 对齐深度\n（尺度、偏移）", "4 深度を整列\n（スケール、シフト）"),
             T_("5 unproject\nand fuse", "5 反投影\n并融合", "5 逆投影\nして統合")]
    cx, cy, r = 5.0, 2.8, 2.05
    angs = np.pi / 2 - np.arange(5) * 2 * np.pi / 5
    nodes = []
    cols = [C["z"], C["b"], C["c"], C["a"], C["y"]]
    for a, s_, c in zip(angs, steps, cols):
        nodes.append(box(ax, cx + 1.55 * r * np.cos(a), cy + r * np.sin(a), s_, w=2.3, h=1.05, fc="white", ec=c, fs=14))
    for i in range(5):
        arrow(ax, nodes[i], nodes[(i + 1) % 5], rad=-0.15, lw=2.2)
    mltext(ax, cx, cy, T_("persistent\n3D scene", "持久的\n3D 场景", "永続的な\n3D シーン"), fs=16, color=C["z"])
    ax.set_xlim(0, 10); ax.set_ylim(0.2, 5.5)
    save(fig, out(f"04-scene-loop_{lang}.svg"))


# ============================================================ 4. depth alignment + unprojection (the post's code)
def fig_depth_align():
    rng = np.random.default_rng(0)
    H, W = 48, 64
    K = np.array([[60.0, 0, W / 2], [0, 60.0, H / 2], [0, 0, 1]])
    v, u = np.mgrid[0:H, 0:W]
    d_true = 3.0 + 0.02 * u + 0.01 * v
    d_mono = (d_true - 1.2) / 2.5 + 0.01 * rng.standard_normal((H, W))
    known = u < W // 2
    A = np.stack([d_mono[known], np.ones(known.sum())], axis=1)
    s, b = np.linalg.lstsq(A, d_true[known], rcond=None)[0]
    d_aligned = s * d_mono + b
    err_new = np.abs(d_aligned - d_true)[~known].mean(); err_un = np.abs(d_mono - d_true)[~known].mean()
    print(f"scale {s:.3f}, shift {b:.3f}; error on new pixels {err_new:.4f} (unaligned {err_un:.3f})")

    def unproject(depth, mask):
        vv, uu = np.mgrid[0:depth.shape[0], 0:depth.shape[1]]
        pix = np.stack([uu, vv, np.ones_like(uu)], axis=-1).reshape(-1, 3).astype(float)
        rays = pix @ np.linalg.inv(K).T
        pts = rays * depth.reshape(-1, 1)
        return pts[mask.reshape(-1)]

    fig = plt.figure(figsize=(8.5, 10.5))
    ax1 = fig.add_axes([0.12, 0.66, 0.84, 0.32])
    ax1.scatter(d_mono[known][::5], d_true[known][::5], s=6, color=C["z"], alpha=0.5, label="known pixels")
    xx = np.linspace(d_mono.min(), d_mono.max(), 10)
    ax1.plot(xx, s * xx + b, color=C["x"], lw=2.4, label=f"fit: $s={s:.2f}$, $b={b:.2f}$")
    ax1.plot(xx, xx, color=C["gray"], lw=1.5, ls=":", label="unaligned ($s=1$, $b=0$)")
    ax1.set_xlabel("monocular depth $\\hat d$"); ax1.set_ylabel("scene depth $d$")
    ax1.legend(frameon=False, fontsize=12, loc="center right")
    ax2 = fig.add_axes([0.0, 0.0, 1.0, 0.6], projection="3d")
    pk = unproject(d_true, known)[::7]
    pn = unproject(d_aligned, ~known)[::7]
    pu = unproject(d_mono, ~known)[::7]
    # plot with z (optical axis) as the depth axis of the plot and -y up, so the image is upright
    P = lambda p: (p[:, 0], p[:, 2], -p[:, 1])
    ax2.scatter(*P(pk), s=7, color=C["z"], alpha=0.6)
    ax2.scatter(*P(pn), s=7, color=C["b"], alpha=0.6)
    ax2.scatter(*P(pu), s=7, color=C["gray"], alpha=0.5)
    # camera frustum (image corners at depth 1)
    corners = np.array([[0, 0, 1], [W, 0, 1], [W, H, 1], [0, H, 1]], float) @ np.linalg.inv(K).T * 0.9
    for c in corners:
        ax2.plot([0, c[0]], [0, c[2]], [0, -c[1]], color=C["dark"], lw=1.2)
    cc = np.vstack([corners, corners[:1]])
    ax2.plot(cc[:, 0], cc[:, 2], -cc[:, 1], color=C["dark"], lw=1.2)
    ax2.set_xlabel("$x$", labelpad=-6); ax2.set_ylabel("$z$ (forward)", labelpad=2); ax2.set_zlabel("$-y$", labelpad=-6)
    ax2.set_xticklabels([]); ax2.set_zticklabels([])
    ax2.view_init(elev=18, azim=-60)
    ax2.set_box_aspect((1.3, 1.8, 1.0))
    ax2.scatter([], [], color=C["z"], label="existing (known)")
    ax2.scatter([], [], color=C["b"], label="new, aligned")
    ax2.scatter([], [], color=C["gray"], label="new, unaligned")
    ax2.legend(frameon=False, fontsize=13, loc="upper left", bbox_to_anchor=(0.05, 0.95))
    save(fig, out("04-depth-align.svg"))


# ============================================================ 5. 4D: deformable Gaussians
def fig_4d():
    rng = np.random.default_rng(2)
    n = 10
    mu = np.stack([rng.uniform(-1, 1, n), rng.uniform(-1, 1, n)], 1)
    sc = rng.uniform(0.12, 0.24, (n, 2)); rot = rng.uniform(0, np.pi, n)
    cols = plt.get_cmap("tab10")(np.arange(n))

    def deform(m, t):
        """A hand-written stand-in for D_psi(mu, t): a swirl whose angle grows with time and radius."""
        r = np.linalg.norm(m, axis=-1, keepdims=True)
        a = 1.4 * t * (1.2 - 0.5 * r)
        c, s = np.cos(a), np.sin(a)
        return np.concatenate([c * m[..., :1] - s * m[..., 1:], s * m[..., :1] + c * m[..., 1:]], -1) + [0.25 * t, 0]

    fig = plt.figure(figsize=(9, 6.6))
    ax = fig.add_subplot(111, projection="3d")
    ts = np.linspace(0, 1, 40)
    for i in range(n):
        tr = np.array([deform(mu[i], t) for t in ts])
        ax.plot(tr[:, 0], tr[:, 1], ts, color=cols[i], lw=1.4, alpha=0.8)
    phi = np.linspace(0, 2 * np.pi, 40)
    for t in (0.0, 0.5, 1.0):
        # plane at time t
        ax.add_collection3d(Poly3DCollection([[(-1.6, -1.6, t), (1.9, -1.6, t), (1.9, 1.6, t), (-1.6, 1.6, t)]],
                                             facecolor="#f2f2f2", edgecolor="#bbbbbb", alpha=0.35))
        for i in range(n):
            m = deform(mu[i], t)
            # rotate the ellipse with the local swirl angle (rotation part of the deformation)
            r = np.linalg.norm(mu[i]); a = rot[i] + 1.4 * t * (1.2 - 0.5 * r)
            E = np.stack([sc[i, 0] * np.cos(phi), sc[i, 1] * np.sin(phi)], 1)
            R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
            E = E @ R.T + m
            ax.add_collection3d(Poly3DCollection([np.c_[E, np.full(len(E), t)]], facecolor=cols[i], edgecolor=cols[i], alpha=0.75))
    ax.set_xlabel("$x$"); ax.set_ylabel("$y$"); ax.set_zlabel("time $t$")
    ax.set_xlim(-1.6, 1.9); ax.set_ylim(-1.6, 1.6); ax.set_zlim(0, 1)
    ax.set_xticklabels([]); ax.set_yticklabels([])
    ax.view_init(elev=20, azim=-62)
    ax.set_box_aspect((1.1, 1.0, 1.2))
    save(fig, out("04-4d-gaussians.svg"))


# ============================================================ 6. pixel-space vs explicit world
def fig_explicit_vs_pixel(lang):
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    fig, ax = diagram(10.4, 6.0)
    # top row: pixel-space
    ax.text(0.15, 5.65, T_("pixel-space world model", "像素空间世界模型", "ピクセル空間の世界モデル"), fontsize=16, fontweight="bold", color=C["b"])
    for i in range(4):
        ax.add_patch(FancyBboxPatch((0.3 + 0.55 * i, 4.15), 0.5, 0.6, boxstyle="round,pad=0.01,rounding_size=0.05",
                                    fc="#fdebd3", ec=C["b"], lw=1.5))
    mltext(ax, 1.4, 3.75, T_("state = context window", "状态 = 上下文窗口", "状態 = コンテキスト窓"), fs=13, color=C["b"])
    nn_ = box(ax, 4.4, 4.45, T_("large network\nper frame", "每帧一次\n大型网络", "フレームごとの\n大規模ネットワーク"), w=2.2, h=1.0, fc="#fdebd3", ec=C["b"], fs=14)
    fr = box(ax, 7.0, 4.45, T_("next frame", "下一帧", "次フレーム"), w=1.6, h=0.7, fc="white", ec=C["b"], fs=14)
    arrow(ax, (2.55, 4.45), nn_); arrow(ax, nn_, fr)
    ax.add_patch(FancyArrowPatch((7.0, 4.05), (1.4, 4.1), connectionstyle="arc3,rad=0.35", arrowstyle="-|>",
                                 mutation_scale=14, lw=1.6, color=C["b"], ls="--"))
    mltext(ax, 9.05, 4.45, T_("revisit:\nregenerated,\nmay differ", "重访：\n重新生成，\n可能不同", "再訪：\n再生成され、\n変わりうる"), fs=13, color=C["x"])
    # bottom row: explicit
    ax.text(0.15, 2.65, T_("explicit 3D / 4D world", "显式 3D / 4D 世界", "明示的な 3D / 4D 世界"), fontsize=16, fontweight="bold", color=C["z"])
    rng = np.random.default_rng(1)
    for _ in range(26):
        x, y = rng.uniform(0.4, 2.4), rng.uniform(0.6, 2.0)
        ax.add_patch(Ellipse((x, y), rng.uniform(0.12, 0.3), rng.uniform(0.08, 0.2), angle=rng.uniform(0, 180),
                             fc=plt.get_cmap("Blues")(rng.uniform(0.3, 0.8)), ec="none", alpha=0.8))
    mltext(ax, 1.4, 0.3, T_("state = Gaussians / mesh (persistent)", "状态 = 高斯 / 网格（持久）", "状態 = ガウス / メッシュ（永続）"), fs=13, color=C["z"])
    rd = box(ax, 4.4, 1.35, T_("renderer\n(splatting)", "渲染器\n（splatting）", "レンダラ\n（スプラッティング）"), w=2.2, h=1.0, fc="#e3f0fa", ec=C["z"], fs=14)
    fr2 = box(ax, 7.0, 1.35, T_("any view", "任意视角", "任意の視点"), w=1.6, h=0.7, fc="white", ec=C["z"], fs=14)
    arrow(ax, (2.55, 1.35), rd); arrow(ax, rd, fr2)
    cam = box(ax, 4.4, 2.55, T_("camera", "相机", "カメラ"), w=1.3, h=0.5, fc="white", ec=C["gray"], fs=13)
    arrow(ax, cam, rd, color=C["gray"])
    mltext(ax, 9.05, 1.35, T_("revisit:\nidentical\nby construction", "重访：\n按构造\n完全一致", "再訪：\n構造上\n同一"), fs=13, color=C["y"])
    ax.add_patch(FancyArrowPatch((3.2, 0.55), (2.3, 0.75), connectionstyle="arc3,rad=-0.3", arrowstyle="-|>",
                                 mutation_scale=12, lw=1.4, color=C["gray"]))
    mltext(ax, 4.0, 0.45, T_("edits, physics", "编辑、物理", "編集、物理"), fs=12, color=C["gray"])
    ax.set_xlim(0, 10.4); ax.set_ylim(0, 6.0)
    save(fig, out(f"04-explicit-vs-pixel_{lang}.svg"))


# ============================================================ 7. procedural Gaussian terrain + local edit
def value_noise(x, y, rng, octaves=5):
    h = np.zeros_like(x)
    amp, freq = 1.0, 1.0
    for _ in range(octaves):
        phase = rng.uniform(0, 2 * np.pi, 4)
        kx, ky = rng.normal(0, 1, 2)
        h += amp * (np.sin(freq * (x * 1.3 + kx) + phase[0]) * np.cos(freq * (y * 1.1 + ky) + phase[1])
                    + 0.5 * np.sin(freq * (0.7 * x - 0.9 * y) + phase[2]))
        amp *= 0.5; freq *= 2.0
    return h


def fig_terrain():
    rng = np.random.default_rng(3)
    n = 3200
    x = rng.uniform(-3, 3, n); y = rng.uniform(-3, 3, n)
    h = 0.45 * value_noise(x, y, np.random.default_rng(10))
    edit_c, edit_r, edit_a = np.array([1.0, -0.8]), 0.45, 1.2
    d2 = (x - edit_c[0]) ** 2 + (y - edit_c[1]) ** 2
    h2 = h + edit_a * np.exp(-d2 / (2 * edit_r ** 2))
    changed = np.abs(h2 - h) > 0.05 * edit_a
    print(f"terrain: {changed.sum()} of {n} Gaussians changed by the edit ({100 * changed.mean():.1f}%)")

    def colour(hh):
        c = np.empty((len(hh), 4))
        c[:] = plt.get_cmap("terrain")(np.clip((hh + 0.9) / 2.6, 0, 1))
        return c
    fig = plt.figure(figsize=(10, 4.8))
    for k, (hh, ttl) in enumerate([(h, "procedural: $h(x, y) = \\sum_o 2^{-o} f(2^o x, 2^o y)$"),
                                   (h2, "after a local sculpt edit")]):
        ax = fig.add_subplot(1, 2, k + 1, projection="3d")
        col = colour(hh)
        if k == 1:
            col[changed] = matplotlib.colors.to_rgba(C["x"])
        ax.scatter(x, y, hh, c=col, s=7, depthshade=False, edgecolor="none", rasterized=True)
        ax.set_zlim(-1.2, 2.0); ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
        ax.view_init(elev=32, azim=-55)
        ax.set_title(ttl, fontsize=13)
        ax.set_box_aspect((1, 1, 0.45))
    save(fig, out("04-terrain-edit.svg"))


if __name__ == "__main__":
    for lang in LANGS:
        fig_sds_loop(lang); fig_scene_loop(lang); fig_explicit_vs_pixel(lang)
    fig_depth_align(); fig_4d(); fig_terrain()
    fig_sds_toy()
