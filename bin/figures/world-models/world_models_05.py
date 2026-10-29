"""Figures for world-models post 05 (JEPA, evaluation, open problems).

Run:  python3 bin/figures/world-models/world_models_05.py
Needs numpy, matplotlib and torch (CPU, about two minutes for the collapse toy).
Writes assets/img/blog/world-models/05-*.svg.
"""
from wm_common import *  # noqa: F401,F403
from matplotlib.patches import Rectangle, Polygon
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401


# ============================================================ 1. LeCun's architecture
def fig_arch(lang):
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    fig, ax = diagram(10, 5.6)
    cfg = box(ax, 5.0, 5.0, T_("configurator", "配置器", "コンフィギュレータ"), w=2.6, h=0.7, fc="white", ec=C["gray"], fs=15)
    per = box(ax, 1.4, 2.9, T_("perception", "感知", "知覚"), w=2.0, h=0.9, fc="#e3f0fa", ec=C["z"], fs=15)
    wm = box(ax, 5.0, 2.9, T_("world model", "世界模型", "世界モデル"), w=2.4, h=1.0, fc=C["fill"], ec=C["a"], fs=16)
    cost = box(ax, 8.6, 2.9, T_("cost\nintrinsic + critic", "代价\n内在代价 + critic", "コスト\n内在コスト + critic"), w=2.4, h=1.1, fc="#fde2e2", ec=C["x"], fs=14)
    mem = box(ax, 5.0, 1.1, T_("short-term memory", "短期记忆", "短期記憶"), w=2.8, h=0.7, fc="white", ec=C["gray"], fs=14)
    act = box(ax, 1.4, 1.1, T_("actor", "执行器（actor）", "アクター"), w=2.0, h=0.8, fc="#fdebd3", ec=C["b"], fs=15)
    arrow(ax, per, wm, text="$s_0$", toff=(0, 0.25))
    arrow(ax, wm, cost, text="$\\hat s_k$", toff=(0, 0.25))
    arrow(ax, act, wm, text="$a_{1:H}$", toff=(0.45, -0.15), color=C["b"], tcolor=C["b"])
    arrow(ax, wm, mem, color=C["gray"]); arrow(ax, cost, mem, color=C["gray"], rad=-0.2)
    ax.add_patch(FancyArrowPatch((8.6, 2.3), (2.45, 0.95), connectionstyle="arc3,rad=-0.3", arrowstyle="-|>",
                                 mutation_scale=15, lw=2.0, color=C["x"], ls="--"))
    mltext(ax, 7.6, 0.25, T_("Mode 2: minimize total cost over the actions", "模式 2：对动作最小化总代价", "モード 2：行動について総コストを最小化"),
           fs=13, color=C["x"])
    for b in (per, wm, cost, act):
        arrow(ax, cfg, b, color=C["gray"], lw=1.0, ls=":")
    ax.text(0.1, 4.1, T_("world", "世界", "世界"), fontsize=13, color=C["z"])
    arrow(ax, (0.35, 3.9), per, color=C["z"], lw=1.4)
    ax.set_ylim(0, 5.5)
    save(fig, out(f"05-architecture_{lang}.svg"))


# ============================================================ 2. JEPA vs generative
def fig_jepa_vs_gen(lang):
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    fig, ax = diagram(10.8, 5.6)
    ax.text(2.6, 5.25, T_("generative: predict pixels", "生成式：预测像素", "生成型：ピクセルを予測"), ha="center", fontsize=16,
            fontweight="bold", color=C["b"])
    ax.text(8.2, 5.25, "JEPA: " + T_("predict embeddings", "预测表示", "表現を予測"), ha="center", fontsize=16,
            fontweight="bold", color=C["a"])
    ax.plot([5.3, 5.3], [0.2, 5.0], color=C["gray"], lw=1, ls=":")
    # generative
    x1 = box(ax, 0.8, 1.0, "$x$", w=0.8, h=0.7, fc="#e3f0fa", ec=C["z"], fs=16)
    e1 = box(ax, 0.8, 2.6, T_("encoder", "编码器", "エンコーダ"), w=1.4, h=0.7, fs=14)
    d1 = box(ax, 2.6, 3.9, T_("decoder", "解码器", "デコーダ"), w=1.6, h=0.7, fs=14, fc="#fdebd3", ec=C["b"])
    yh = box(ax, 4.4, 3.9, "$\\hat y$", w=0.8, h=0.7, fc="white", ec=C["b"], fs=16)
    y1 = box(ax, 4.4, 1.0, "$y$", w=0.8, h=0.7, fc="#e3f0fa", ec=C["z"], fs=16)
    arrow(ax, x1, e1); arrow(ax, e1, d1); arrow(ax, d1, yh)
    l1 = box(ax, 4.4, 2.45, "$\\Vert y-\\hat y\\Vert$", w=1.5, h=0.65, fc="white", ec=C["x"], fs=14)
    arrow(ax, yh, l1, color=C["x"]); arrow(ax, y1, l1, color=C["x"])
    mltext(ax, 2.6, 0.35, T_("every pixel of y must be predicted", "y 的每个像素都要预测", "y のすべてのピクセルを予測する"), fs=13, color=C["b"])
    # JEPA
    x2 = box(ax, 6.2, 1.0, "$x$", w=0.8, h=0.7, fc="#e3f0fa", ec=C["z"], fs=16)
    ex = box(ax, 6.2, 2.6, "$\\mathrm{Enc}_x$", w=1.2, h=0.7, fs=15)
    pr = box(ax, 7.6, 3.9, "$\\mathrm{Pred}(s_x, z)$", w=1.8, h=0.7, fs=14, fc=C["fill"], ec=C["a"])
    y2 = box(ax, 10.0, 1.0, "$y$", w=0.8, h=0.7, fc="#e3f0fa", ec=C["z"], fs=16)
    ey = box(ax, 10.0, 2.6, "$\\mathrm{Enc}_y$", w=1.2, h=0.7, fs=15, fc="#f2f2f2", ec=C["gray"])
    l2 = box(ax, 9.4, 3.9, "$D(s_y, \\hat s_y)$", w=1.5, h=0.65, fc="white", ec=C["x"], fs=14)
    arrow(ax, x2, ex); arrow(ax, ex, pr, text="$s_x$", toff=(-0.3, 0.1))
    arrow(ax, pr, l2, text="$\\hat s_y$", toff=(0, 0.42), color=C["x"])
    arrow(ax, y2, ey); arrow(ax, ey, l2, text="$s_y$", toff=(0.35, 0), color=C["x"])
    mltext(ax, 10.0, 0.25, T_("EMA copy,\nstop-gradient", "EMA 副本，\n停止梯度", "EMA コピー、\n勾配停止"), fs=12, color=C["gray"])
    mltext(ax, 7.6, 0.3, T_("loss lives in representation space", "损失在表示空间中", "損失は表現空間にある"), fs=13, color=C["a"])
    ax.set_xlim(0, 10.8); ax.set_ylim(-0.1, 5.6)
    save(fig, out(f"05-jepa-vs-generative_{lang}.svg"))


# ============================================================ 3. energy landscape
def fig_energy():
    g = np.linspace(-2, 2, 120)
    Y1, Y2 = np.meshgrid(g, g)
    # predictions Pred(s_x, z) for z in [-1, 1] trace an arc of compatible futures
    zs = np.linspace(-1, 1, 200)
    arc = np.stack([1.1 * np.cos(1.3 * zs + 0.3), 1.1 * np.sin(1.3 * zs + 0.3)], 1)
    d2 = ((np.stack([Y1, Y2], -1)[..., None, :] - arc) ** 2).sum(-1)
    E = np.minimum(d2.min(-1), 4.5)  # E(x, y) = min_z D(s_y, Pred(s_x, z)), clipped for display
    fig = plt.figure(figsize=(10, 4.8))
    for k, (Z, ttl) in enumerate([(E, "$E(x,y)=\\min_z\\,\\Vert y-\\mathrm{Pred}(s_x,z)\\Vert^2$"),
                                  (np.zeros_like(E), "collapsed encoder: $E \\equiv 0$")]):
        ax = fig.add_subplot(1, 2, k + 1, projection="3d")
        ax.plot_surface(Y1, Y2, Z, cmap="viridis", vmin=0, vmax=4, rstride=3, cstride=3, linewidth=0, alpha=0.9, rasterized=True)
        if k == 0:
            ax.plot(arc[:, 0], arc[:, 1], 0.02 + 0 * zs, color=C["b"], lw=3.5, zorder=10)
            for zv in (-1, 0, 1):
                i = np.argmin(np.abs(zs - zv))
                ax.scatter([arc[i, 0]], [arc[i, 1]], [0.05], color=C["b"], s=40, depthshade=False, zorder=11)
        ax.set_zlim(0, 4.5)
        ax.set_xlabel("$y_1$", labelpad=-4); ax.set_ylabel("$y_2$", labelpad=-4); ax.set_zlabel("$E$", labelpad=-6)
        ax.set_xticklabels([]); ax.set_yticklabels([]); ax.set_zticklabels([])
        ax.view_init(elev=35, azim=-60)
        ax.set_title(ttl, fontsize=14)
    save(fig, out("05-energy.svg"))


# ============================================================ 4. I-JEPA masks
def ijepa_masks(rng, n=16, ntarg=4, tscale=(0.15, 0.2), tar=(0.75, 1.5), cscale=(0.85, 1.0)):
    """Block sampling as described in the I-JEPA paper: M = 4 target blocks with scale in (0.15, 0.2) and
    aspect ratio in (0.75, 1.5); one context block with scale in (0.85, 1.0) and unit aspect ratio,
    from which the target regions are removed."""
    def block(scale, ar):
        area = rng.uniform(*scale) * n * n
        a = np.exp(rng.uniform(np.log(ar[0]), np.log(ar[1])))
        h = int(round(np.sqrt(area * a))); w = int(round(np.sqrt(area / a)))
        h, w = min(max(h, 1), n), min(max(w, 1), n)
        r, c = rng.integers(0, n - h + 1), rng.integers(0, n - w + 1)
        m = np.zeros((n, n), bool); m[r:r + h, c:c + w] = True
        return m
    targets = [block(tscale, tar) for _ in range(ntarg)]
    ctx = block(cscale, (1, 1))
    for t in targets:
        ctx &= ~t
    return ctx, targets


def fig_ijepa():
    rng = np.random.default_rng(4)
    fig, axs = plt.subplots(1, 3, figsize=(10, 3.7))
    tcols = [C["b"], C["x"], C["y"], C["c"]]
    for ax in axs:
        ctx, tg = ijepa_masks(rng)
        img = np.ones((16, 16, 3)) * 0.93
        img[ctx] = matplotlib.colors.to_rgb(C["z"])
        for m, c in zip(tg, tcols):
            img[m] = 0.55 * np.array(matplotlib.colors.to_rgb(c)) + 0.45 * img[m]
        ax.imshow(img, interpolation="nearest")
        for m, c in zip(tg, tcols):
            rr, cc = np.where(m)
            ax.add_patch(Rectangle((cc.min() - 0.5, rr.min() - 0.5), cc.max() - cc.min() + 1, rr.max() - rr.min() + 1,
                                   fc="none", ec=c, lw=2.6))
        ax.set_xticks(np.arange(-0.5, 16, 1), minor=True); ax.set_yticks(np.arange(-0.5, 16, 1), minor=True)
        ax.grid(which="minor", color="white", lw=0.6); ax.grid(which="major", visible=False)
        ax.set_xticks([]); ax.set_yticks([])
        ax.set_title(f"context: {ctx.sum()} / 256 patches", fontsize=13)
    save(fig, out("05-ijepa-masks.svg"))


# ============================================================ 5. latent planning with CEM and an L1 goal
def fig_latent_plan():
    rng = np.random.default_rng(5)
    goal = np.array([1.6, 1.2]); s0 = np.array([-1.5, -1.0])
    obstacle_c, obstacle_r = np.array([0.0, 0.1]), 0.75

    def rollout(s, A):  # toy latent predictor: s_k = s_{k-1} + a_k, pushed out of a "forbidden" disc
        tr = [np.broadcast_to(s, A.shape[:-2] + (2,)).copy()]
        for k in range(A.shape[-2]):
            n = tr[-1] + A[..., k, :]
            d = n - obstacle_c; r = np.linalg.norm(d, axis=-1, keepdims=True)
            n = np.where(r < obstacle_r, obstacle_c + d / np.maximum(r, 1e-6) * obstacle_r, n)
            tr.append(n)
        return np.stack(tr, -2)

    H, J, K = 8, 200, 20
    mu = np.zeros((H, 2)); sd = np.full((H, 2), 0.5)
    fig, axs = plt.subplots(1, 2, figsize=(10, 4.9), sharey=True)
    g = np.linspace(-2.2, 2.4, 200); GX, GY = np.meshgrid(g, g)
    L1 = np.abs(GX - goal[0]) + np.abs(GY - goal[1])
    for ax in axs:
        ax.contour(GX, GY, L1, levels=np.arange(0.5, 6, 0.5), colors=C["gray"], linewidths=0.8, alpha=0.6)
        ax.add_patch(plt.Circle(obstacle_c, obstacle_r, fc="#eeeeee", ec=C["gray"], lw=1.2))
        ax.plot(*goal, "*", color=C["y"], ms=20, mec="white", zorder=6)
        ax.plot(*s0, "o", color=C["dark"], ms=10, zorder=6)
        ax.set_aspect("equal"); ax.set_xlim(-2.2, 2.4); ax.set_ylim(-2.0, 2.2)
    for it in range(8):
        A = mu + sd * rng.standard_normal((J, H, 2))
        A = np.clip(A, -0.45, 0.45)
        tr = rollout(s0, A)
        cost = np.abs(tr[:, -1] - goal).sum(-1)
        el = np.argsort(cost)[:K]
        if it == 0:
            for i in range(0, J, 4):
                axs[0].plot(tr[i, :, 0], tr[i, :, 1], color=C["gray"], lw=0.7, alpha=0.5)
        mu, sd = A[el].mean(0), A[el].std(0) + 1e-3
    best = rollout(s0, mu[None])[0]
    for i in el:
        axs[0].plot(tr[i, :, 0], tr[i, :, 1], color=C["b"], lw=1.2, alpha=0.8)
    axs[0].plot(best[:, 0], best[:, 1], "-o", color=C["a"], lw=2.8, ms=5)
    axs[0].set_title("CEM: samples (grey), elites (orange), mean (purple)", fontsize=13)
    print("CEM plan final L1 distance", np.abs(best[-1] - goal).sum().round(3))
    # MPC: execute the first action, replan
    s = s0.copy(); path = [s.copy()]; mu = np.zeros((H, 2))
    for step in range(25):
        mu = np.r_[mu[1:], np.zeros((1, 2))]; sd = np.full((H, 2), 0.5)   # warm start: shift last plan
        for it in range(8):
            A = np.clip(mu + sd * rng.standard_normal((J, H, 2)), -0.45, 0.45)
            tr = rollout(s, A); cost = np.abs(tr[:, -1] - goal).sum(-1)
            el = np.argsort(cost)[:K]; mu, sd = A[el].mean(0), A[el].std(0) + 1e-3
        s = rollout(s, mu[None, :1])[0, -1]
        path.append(s.copy())
    path = np.array(path)
    axs[1].plot(path[:, 0], path[:, 1], "-o", color=C["a"], lw=2.6, ms=6)
    axs[1].set_title("MPC: execute first action, re-plan", fontsize=13)
    print("MPC final L1 distance", np.abs(path[-1] - goal).sum().round(3))
    for ax in axs:
        ax.set_xlabel("latent dim 1")
    axs[0].set_ylabel("latent dim 2")
    save(fig, out("05-latent-planning.svg"))


# ============================================================ 6. collapse toy (the post's code + logging)
def fig_collapse():
    import copy
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    L, D = 32, 16

    def batch(n):
        omega = torch.rand(n, 1) * 2.5 + 0.5
        phi = torch.rand(n, 1) * 6.283
        u = torch.arange(2 * L).float()[None]
        s = torch.sin(omega * u * 0.25 + phi) + 0.05 * torch.randn(n, 2 * L)
        return s[:, :L], s[:, L:], omega

    def encoder():
        return nn.Sequential(nn.Linear(L, 128), nn.ReLU(), nn.Linear(128, D))

    def evaluate(enc):
        with torch.no_grad():
            x, _, omega = batch(4000)
            s = enc(x)
            feats = torch.cat([s, torch.ones(len(s), 1)], 1)
            w = torch.linalg.lstsq(feats[:3000], omega[:3000]).solution
            res = omega[3000:] - feats[3000:] @ w
            r2 = 1 - res.pow(2).mean() / omega[3000:].var()
        return s.std(0).mean().item(), r2.item(), s.numpy(), omega.numpy()[:, 0]

    def train(variant, steps=3000):
        torch.manual_seed(0)
        enc = encoder()
        pred = nn.Sequential(nn.Linear(D, 128), nn.ReLU(), nn.Linear(128, D))
        target = copy.deepcopy(enc).requires_grad_(False)
        opt = torch.optim.Adam([*enc.parameters(), *pred.parameters()], lr=1e-3)
        log = []
        for i in range(steps):
            x, y, _ = batch(256)
            s_x = enc(x)
            if variant == "shared, no stop-grad":
                s_y = enc(y)
            else:
                with torch.no_grad():
                    s_y = target(y)
            loss = F.mse_loss(pred(s_x), s_y)
            if variant == "EMA + variance reg.":
                loss = loss + F.relu(1 - s_x.std(0)).mean()
            opt.zero_grad(); loss.backward(); opt.step()
            with torch.no_grad():
                for p_t, p in zip(target.parameters(), enc.parameters()):
                    p_t.mul_(0.99).add_(0.01 * p)
            if i % 50 == 0 or i == steps - 1:
                log.append((i, s_x.std(0).mean().item()))
        return enc, np.array(log)

    variants = ["shared, no stop-grad", "EMA target", "EMA + variance reg."]
    cols = [C["x"], C["b"], C["a"]]
    fig = plt.figure(figsize=(10, 7.4))
    gs = fig.add_gridspec(2, 3, height_ratios=[1, 1.05], hspace=0.45, wspace=0.3)
    axl = fig.add_subplot(gs[0, :])
    for j, (v, c) in enumerate(zip(variants, cols)):
        enc, log = train(v)
        std, r2, s, om = evaluate(enc)
        print(f"{v:>22}: embedding std {std:.4f}, linear-probe R^2 {r2:.2f}")
        axl.plot(log[:, 0], log[:, 1], color=c, lw=2.4, label=f"{v}  (R$^2$ = {r2:.2f})")
        ax = fig.add_subplot(gs[1, j])
        sc = s - s.mean(0)
        U, S_, Vt = np.linalg.svd(sc[:1500], full_matrices=False)
        pc = sc[:1500] @ Vt[:2].T
        ax.scatter(pc[:, 0], pc[:, 1], c=om[:1500], cmap="viridis", s=4, vmin=0.5, vmax=3.0, rasterized=True)
        ax.set_title(v, fontsize=13, color=c)
        ax.set_xticks([]); ax.set_yticks([])
        ax.set_xlabel(f"PC1/PC2, std {std:.3f}", fontsize=12)
        lim = max(np.abs(pc).max(), 1e-3) * 1.05
        ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_aspect("equal")
    axl.set_yscale("log"); axl.set_xlabel("training step"); axl.set_ylabel("per-dim std of $s_x$")
    axl.legend(frameon=False, fontsize=12, loc="lower left")
    save(fig, out("05-collapse.svg"))


# ============================================================ 7. evaluation radar (qualitative)
def fig_radar(lang):
    T_ = lambda en, zh, ja: label(lang, en, zh, ja)
    axes_ = [T_("looks right", "看起来对", "見た目"), T_("physics", "物理", "物理"),
             T_("controllability", "可控性", "可制御性"), T_("consistency /\nmemory", "一致性 /\n记忆", "一貫性 /\n記憶"),
             T_("usefulness\n(planning)", "有用性\n（规划）", "有用性\n（プランニング）")]
    # 0 = not applicable / weak, 1 = limited, 2 = moderate, 3 = strong. Qualitative reading of posts 3-5.
    prof = [(T_("pixel video world model", "像素视频世界模型", "ピクセル動画世界モデル"), [3, 1, 2, 1, 2], C["b"]),
            (T_("explicit 3D world", "显式 3D 世界", "明示的 3D 世界"), [2, 1, 1, 3, 1], C["z"]),
            (T_("JEPA latent model", "JEPA 隐空间模型", "JEPA 潜在モデル"), [0, 2, 2, 1, 3], C["a"])]
    ang = np.linspace(0, 2 * np.pi, len(axes_), endpoint=False)
    fig = plt.figure(figsize=(8.6, 7.2))
    ax = fig.add_subplot(111, polar=True)
    ax.set_theta_offset(np.pi / 2); ax.set_theta_direction(-1)
    for name, v, c in prof:
        vv = np.r_[v, v[:1]]; aa = np.r_[ang, ang[:1]]
        ax.plot(aa, vv, color=c, lw=2.6, label=name); ax.fill(aa, vv, color=c, alpha=0.12)
    ax.set_xticks(ang); ax.set_xticklabels(axes_, fontsize=14)
    ax.set_yticks([1, 2, 3]); ax.set_yticklabels([T_("limited", "有限", "限定的"), T_("moderate", "中等", "中程度"),
                                                  T_("strong", "强", "強い")], fontsize=11, color=C["gray"])
    ax.set_ylim(0, 3.2)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.07), ncol=3, frameon=False, fontsize=12)
    ax.set_title(T_("qualitative, not measured", "定性示意，非实测", "定性的な目安（実測値ではない）"), fontsize=14, color=C["gray"], pad=24)
    save(fig, out(f"05-eval-radar_{lang}.svg"))


# ============================================================ 8. Delta-PSNR toy (the post's code)
def fig_delta_psnr():
    import torch
    torch.manual_seed(0)

    def psnr(a, b, max_val=1.0):
        mse = torch.mean((a - b) ** 2, dim=tuple(range(1, a.dim())))
        return 10 * torch.log10(max_val ** 2 / mse.clamp(min=1e-10))

    def toy_model(ctx, acts):
        out, f = [], ctx[:, 0]
        for k in range(acts.shape[1]):
            f = torch.stack([torch.roll(fi, shifts=int(a), dims=-1) for fi, a in zip(f, acts[:, k])])
            out.append(f)
        return torch.stack(out, 1)

    B, T = 8, 5
    acts = torch.randint(-2, 3, (B, T))
    first = torch.rand(B, 1, 1, 16, 16)
    frames = torch.cat([first, toy_model(first, acts)], 1)
    rand_acts = torch.randint(-2, 3, acts.shape)
    pred_true = toy_model(frames[:, :1], acts)[:, -1]
    pred_rand = toy_model(frames[:, :1], rand_acts)[:, -1]
    ignore = frames[:, 0]
    target = frames[:, T]
    # first example whose random actions give a different total shift than both the true actions and "no shift"
    i = next(j for j in range(B) if (rand_acts[j].sum() - acts[j].sum()) % 16 != 0 and rand_acts[j].sum() % 16 != 0
             and acts[j].sum() % 16 != 0)
    fig, axs = plt.subplots(1, 4, figsize=(10, 3.3))
    panels = [(target[i, 0], "real $x_5$", None), (pred_true[i, 0], "true actions", psnr(pred_true[i:i + 1], target[i:i + 1]).item()),
              (pred_rand[i, 0], "random actions", psnr(pred_rand[i:i + 1], target[i:i + 1]).item()),
              (ignore[i, 0], "ignores actions", psnr(ignore[i:i + 1], target[i:i + 1]).item())]
    for ax, (img, ttl, p) in zip(axs, panels):
        ax.imshow(img.numpy(), cmap="viridis", vmin=0, vmax=1, interpolation="nearest")
        ax.set_title(ttl, fontsize=14)
        ax.set_xlabel("" if p is None else (f"PSNR {p:.0f} dB (MSE floor)" if p > 99 else f"PSNR {p:.1f} dB"), fontsize=13)
        ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    print(f"true action shifts of sample {i}:", acts[i].tolist(), "random:", rand_acts[i].tolist())
    save(fig, out("05-delta-psnr.svg"))


if __name__ == "__main__":
    for lang in LANGS:
        fig_arch(lang); fig_jepa_vs_gen(lang); fig_radar(lang)
    fig_energy(); fig_ijepa(); fig_latent_plan(); fig_delta_psnr()
    fig_collapse()
