"""Figures for graphics-engine post 01 (anatomy of a game engine).

    python3 bin/figures/graphics-engine/graphics_engine_01.py

Every plot is computed: the timestep figures run real simulations, the benchmark is timed on the
machine that runs this script, the job Gantt chart comes from the toy list scheduler of the post,
and the BVH figure builds and traverses a real BVH.
"""
import pathlib
import sys
import timeit

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle, Polygon  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics-engine"
FRAME_COLORS = [C["a"], C["b"], C["c"], C["y"], C["x"]]


def out(name):
    return OUT / name


def box(ax, x, y, w, h, text, fc, ec=C["dark"], fs=13, tc=C["dark"], lw=1.4, round_=0.02):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={round_}",
                                fc=fc, ec=ec, lw=lw))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs, color=tc, wrap=True)


# ---------------------------------------------------------------- 1. layered architecture
def fig_layers():
    for lang in LANGS:
        L = lambda en, zh, ja: label(lang, en, zh, ja)  # noqa: E731
        fig, ax = plt.subplots(figsize=(10, 6.4))
        ax.set_xlim(0, 10); ax.set_ylim(0, 6.6); ax.axis("off")
        rows = [
            (0.2, L("Platform layer: OS, drivers, GPU API, file system, threads",
                    "平台层：操作系统、驱动、GPU API、文件系统、线程",
                    "プラットフォーム層：OS・ドライバ・GPU API・ファイル・スレッド"), "#dddddd"),
            (1.2, L("Core: math, memory allocators, containers, job system, logging",
                    "核心层：数学库、内存分配器、容器、任务系统、日志",
                    "コア層：数学・メモリアロケータ・コンテナ・ジョブ・ログ"), "#e8e0f5"),
            (2.2, L("Resources: asset registry, loading, streaming, serialization",
                    "资源层：资源注册表、加载、流式传输、序列化",
                    "リソース層：アセット管理・ロード・ストリーミング・シリアライズ"), "#dbeaf7"),
        ]
        for y, t, fc in rows:
            box(ax, 0.2, y, 7.3, 0.8, t, fc, fs=12.5)
        subs = [L("Rendering", "渲染", "描画"), L("Physics", "物理", "物理"), L("Animation", "动画", "アニメ"),
                L("Audio", "音频", "オーディオ"), L("Input / Net", "输入/网络", "入力/通信")]
        w = 7.3 / len(subs)
        for i, t in enumerate(subs):
            box(ax, 0.2 + i * w + 0.04, 3.2, w - 0.08, 0.9, t, "#fde9d2", fs=12.5)
        box(ax, 0.2, 4.3, 7.3, 0.8, L("Gameplay: entities/ECS, scripting, AI, UI",
                                         "玩法层：实体/ECS、脚本、AI、UI",
                                         "ゲームプレイ層：エンティティ/ECS・スクリプト・AI・UI"), "#dff2df", fs=12.5)
        box(ax, 0.2, 5.4, 7.3, 0.8, L("Your game: levels, rules, content",
                                         "你的游戏：关卡、规则、内容",
                                         "あなたのゲーム：レベル・ルール・コンテンツ"), "#fff6cc", fs=12.5)
        box(ax, 7.8, 0.2, 2.0, 6.0, L("Editor\n&\ntools\n\nimport\ncook\nprofile\ndebug",
                                         "编辑器\n与\n工具\n\n导入\n烘焙\n性能分析\n调试",
                                         "エディタ\nと\nツール\n\nインポート\nクック\nプロファイル\nデバッグ"),
            "#f4f4f4", fs=12.5)
        ax.text(0.2, 6.35, L("runtime (ships with the game)", "运行时（随游戏发布）", "ランタイム（ゲームと一緒に出荷）"),
                fontsize=12, color=C["gray"])
        ax.text(7.8, 6.35, L("offline", "离线", "オフライン"), fontsize=12, color=C["gray"])
        save(fig, out(f"01-layers_{lang}.svg"))


# ---------------------------------------------------------------- 2. frame timeline
def fig_frame_timeline():
    P = 1000 / 60  # vsync period (ms)
    main, rend, gpu = 10.0, 6.0, 12.0
    fig, ax = plt.subplots(figsize=(10, 4.2))
    lanes = {"CPU main": 3, "CPU render": 2, "GPU": 1, "display": 0}
    for i in range(5):
        col = FRAME_COLORS[i % len(FRAME_COLORS)]
        t0 = i * P
        segs = [("CPU main", t0, main), ("CPU render", t0 + P, rend), ("GPU", t0 + P + rend, gpu)]
        gpu_end = t0 + P + rend + gpu
        shown = np.ceil(gpu_end / P - 1e-9) * P
        segs.append(("display", shown, P))
        for lane, s, d in segs:
            ax.add_patch(Rectangle((s, lanes[lane] - 0.35), d, 0.7, fc=col, ec="white", alpha=0.85))
            if s + d / 2 < 5.2 * P:
                ax.text(s + d / 2, lanes[lane], f"{i}", ha="center", va="center", color="white",
                        fontsize=13, weight="bold")
    for k in range(7):
        ax.axvline(k * P, color=C["gray"], lw=1, ls="--", alpha=0.6)
    # latency of frame 0: input sampled at t = 0, first photons at its display slot
    lat_end = np.ceil((P + rend + gpu) / P - 1e-9) * P
    ax.annotate("", xy=(lat_end, -0.75), xytext=(0, -0.75),
                arrowprops=dict(arrowstyle="<->", color=C["dark"], lw=1.6))
    ax.text(lat_end / 2, -1.1, f"input -> photon  {lat_end:.1f} ms", ha="center", va="center", fontsize=13)
    ax.set_yticks(list(lanes.values())); ax.set_yticklabels(list(lanes.keys()))
    ax.set_xlim(0, 5.2 * P); ax.set_ylim(-1.4, 3.6)
    ax.set_xlabel("t (ms), vsync every 16.7 ms"); ax.grid(False)
    save(fig, out("01-frame-timeline.svg"))


# ---------------------------------------------------------------- 3. timestep: determinism and energy
def jump(dt, v0=5.0, g=-9.81, T=1.1):
    t, y, v, ts, ys = 0.0, 0.0, v0, [0.0], [0.0]
    while t < T:
        v += g * dt; y += v * dt; t += dt  # semi-implicit Euler
        ts.append(t); ys.append(y)
    return np.array(ts), np.array(ys)


def frame_times(n, rng):
    ft = rng.uniform(0.008, 0.034, n)
    hitch = rng.random(n) < 0.05
    ft[hitch] = 0.060
    return ft


def spring_runs(ft, k, DT=1 / 120):
    E = lambda x, v: 0.5 * v * v + 0.5 * k * x * x  # noqa: E731
    xv, vv = 1.0, 0.0                       # variable step
    xf, vf, acc = 1.0, 0.0, 0.0             # fixed step + accumulator
    t, T, Ev, Ef = 0.0, [0.0], [1.0], [1.0]
    E0 = E(1.0, 0.0)
    for dt in ft:
        vv -= k * xv * dt; xv += vv * dt
        acc += dt
        while acc >= DT:
            vf -= k * xf * DT; xf += vf * DT; acc -= DT
        t += dt
        T.append(t); Ev.append(E(xv, vv) / E0); Ef.append(E(xf, vf) / E0)
    return np.array(T), np.array(Ev), np.array(Ef)


def fig_timestep():
    fig, axs = plt.subplots(1, 2, figsize=(13, 4.8))
    ax = axs[0]
    tt = np.linspace(0, 1.1, 300)
    ax.plot(tt, 5 * tt - 0.5 * 9.81 * tt ** 2, color=C["dark"], lw=1.4, ls="--", label="exact: apex 1.274 m")
    for fps, col in ((30, C["x"]), (60, C["b"]), (144, C["z"])):
        ts, ys = jump(1 / fps)
        ax.plot(ts, ys, ".-", ms=4, lw=1.4, color=col, label=f"{fps} fps: apex {ys.max():.3f} m")
    ax.set_ylim(-0.2, 1.5); ax.set_xlabel("t (s)"); ax.set_ylabel("y (m)")
    ax.set_title("jump with dt = frame time")
    ax.legend(fontsize=11, loc="lower center")
    ax = axs[1]
    rng = np.random.default_rng(3)
    k = (2 * np.pi * 1.5) ** 2
    T, Ev, Ef = spring_runs(frame_times(600, rng), k)
    ax.plot(T, Ev, color=C["x"], lw=1.3, label="variable dt = frame time")
    ax.plot(T, Ef, color=C["z"], lw=1.6, label="fixed dt = 1/120 s + accumulator")
    ax.axhline(1, color=C["dark"], lw=1, ls="--")
    ax.set_xlabel("t (s)"); ax.set_ylabel("$E/E_0$")
    ax.set_title("spring, jittered frames (8-34 ms, 5% hitches)")
    ax.legend(fontsize=11, loc="upper left")
    fig.tight_layout()
    save(fig, out("01-timestep.svg"))


# ---------------------------------------------------------------- 4. the accumulator over frames
def fig_accumulator():
    rng = np.random.default_rng(7)
    DT = 1 / 120
    ft = rng.uniform(0.006, 0.030, 30)
    acc, steps, alpha = 0.0, [], []
    for dt in ft:
        acc += dt
        n = 0
        while acc >= DT:
            acc -= DT; n += 1
        steps.append(n); alpha.append(acc / DT)
    f = np.arange(len(ft))
    fig, axs = plt.subplots(3, 1, figsize=(10, 7.2), sharex=True)
    axs[0].bar(f, ft * 1000, color=C["gray"])
    axs[0].axhline(DT * 1000, color=C["z"], ls="--", lw=1.5)
    axs[0].text(29.6, DT * 1000 + 0.8, "DT = 8.33 ms", color=C["z"], ha="right", fontsize=12,
                bbox=dict(fc="white", ec="none", alpha=0.85))
    axs[0].set_ylabel("frame (ms)")
    axs[1].bar(f, steps, color=C["z"])
    axs[1].set_ylabel("steps"); axs[1].set_yticks(range(0, max(steps) + 1))
    axs[2].plot(f, alpha, "o-", color=C["a"])
    axs[2].set_ylim(0, 1); axs[2].set_ylabel(r"$\alpha$ = acc/DT")
    axs[2].set_xlabel("frame")
    fig.tight_layout()
    save(fig, out("01-accumulator.svg"))


# ---------------------------------------------------------------- 5. interpolation removes judder
def fig_interpolation():
    FRAME, STEP = 5, 6          # units of 1/300 s: 60 Hz render, 50 Hz physics
    acc, xp, x = 0, 0.0, 0.0
    raw, lerp = [0.0], [0.0]
    for _ in range(24):
        acc += FRAME
        while acc >= STEP:
            xp, x = x, x + STEP / 300
            acc -= STEP
        a = acc / STEP
        raw.append(x); lerp.append(xp + a * (x - xp))
    raw, lerp = np.array(raw), np.array(lerp)
    t = np.arange(len(raw)) / 60
    fig, axs = plt.subplots(1, 2, figsize=(13, 4.5))
    axs[0].step(t, raw, where="post", color=C["x"], label="no interpolation")
    axs[0].step(t, lerp, where="post", color=C["z"], label="interpolated")
    axs[0].plot(t, t, color=C["dark"], lw=1, ls="--", label="true x = t")
    axs[0].set_xlim(0, 0.25); axs[0].set_ylim(0, 0.25)
    axs[0].set_xlabel("t (s)"); axs[0].set_ylabel("x shown on screen")
    axs[0].legend(fontsize=11)
    f = np.arange(1, len(raw))
    axs[1].plot(f, np.diff(raw) * 1000, "s-", color=C["x"], label="no interpolation")
    axs[1].plot(f, np.diff(lerp) * 1000, "o-", color=C["z"], label="interpolated")
    axs[1].axhline(1000 / 60, color=C["dark"], lw=1, ls="--")
    axs[1].set_xlabel("frame"); axs[1].set_ylabel("dx per frame (mm), v = 1 m/s")
    axs[1].set_ylim(-1, 23); axs[1].legend(fontsize=11, loc="lower right")
    fig.suptitle("physics 50 Hz, display 60 Hz", fontsize=15)
    fig.tight_layout()
    save(fig, out("01-interpolation.svg"))


# ---------------------------------------------------------------- 6. cache lines: AoS vs SoA
FIELDS = ["px", "py", "pz", "vx", "vy", "vz", "hp", "mass", "r", "g", "b", "a", "u", "v", "w", "flags"]
USED = {"px", "py", "pz", "vx", "vy", "vz"}


def fig_cache_lines():
    fig, ax = plt.subplots(figsize=(11, 6.2))
    ax.axis("off"); ax.set_xlim(-2.6, 20.2); ax.set_ylim(-0.6, 11.0)
    cw = 1.0
    ax.text(-2.5, 10.5,"AoS: struct Entity { 16 x float32 } = 64 B = 1 cache line", fontsize=13, weight="bold")
    for row in range(4):
        y = 8.4 - row * 1.0
        ax.text(-0.3, y + 0.4, f"line {row}", ha="right", va="center", fontsize=12)
        for j, fn in enumerate(FIELDS):
            used = fn in USED
            col = (C["x"] if fn[0] == "p" else C["b"]) if used else "#e4e4e4"
            ax.add_patch(Rectangle((j * cw, y), cw * 0.96, 0.8, fc=col, ec="white"))
            if row == 0:
                ax.text(j * cw + 0.48, y + 1.05, fn, ha="center", fontsize=9.5, rotation=60)
            ax.text(j * cw + 0.48, y + 0.4, f"e{row}", ha="center", va="center", fontsize=9,
                    color="white" if used else C["gray"])
    ax.text(16.3, 7.4, "24 / 64 B\nused\n= 37.5%", ha="left", va="center", fontsize=12, color=C["dark"])
    ax.text(-2.5, 4.3, "SoA: one array per field", fontsize=13, weight="bold")
    for row, fn in enumerate(["px", "py", "pz", "vx"]):
        y = 3.0 - row * 1.0
        ax.text(-0.3, y + 0.4, fn + "[ ]", ha="right", va="center", fontsize=12)
        col = C["x"] if fn[0] == "p" else C["b"]
        for j in range(16):
            ax.add_patch(Rectangle((j * cw, y), cw * 0.96, 0.8, fc=col, ec="white"))
            ax.text(j * cw + 0.48, y + 0.4, f"e{j}", ha="center", va="center", fontsize=9, color="white")
    ax.text(16.3, 1.9, "64 / 64 B\nused\n= 100%", ha="left", va="center", fontsize=12, color=C["dark"])
    save(fig, out("01-cache-lines.svg"))


# ---------------------------------------------------------------- 7. AoS vs SoA benchmark (real timing)
def bench(N, number=5, repeat=5):
    aos = np.zeros(N, dtype=[(n, np.float32) for n in FIELDS])
    soa = {n: np.zeros(N, np.float32) for n in FIELDS}
    dt = np.float32(1 / 60)

    def update_aos():
        for c in "xyz":
            aos["p" + c] += aos["v" + c] * dt

    def update_soa():
        for c in "xyz":
            soa["p" + c] += soa["v" + c] * dt

    ta = min(timeit.repeat(update_aos, number=number, repeat=repeat)) / number
    ts = min(timeit.repeat(update_soa, number=number, repeat=repeat)) / number
    return ta / N * 1e9, ts / N * 1e9


def fig_bench():
    Ns = [10_000, 100_000, 1_000_000, 2_000_000]
    res = np.array([bench(N) for N in Ns])
    for N, (a, s) in zip(Ns, res):
        print(f"N={N}: AoS {a:.2f} ns/entity, SoA {s:.2f} ns/entity, speedup {a / s:.1f}x")
    fig, ax = plt.subplots(figsize=(10, 4.8))
    x = np.arange(len(Ns)); w = 0.38
    ax.bar(x - w / 2, res[:, 0], w, color=C["x"], label="AoS (structured array, 64 B stride)")
    ax.bar(x + w / 2, res[:, 1], w, color=C["z"], label="SoA (one float32 array per field)")
    for i, (a, s) in enumerate(res):
        ax.text(i, max(a, s) * 1.04, f"{a / s:.1f}x", ha="center", fontsize=13, weight="bold")
    ax.set_xticks(x); ax.set_xticklabels([f"N = {N:,}" for N in Ns])
    ax.set_ylabel("ns per entity (lower is better)")
    ax.set_ylim(0, res.max() * 1.22)
    ax.set_title("p += v * dt for x, y, z (NumPy, measured on the build machine)")
    ax.legend(fontsize=11, loc="upper left")
    save(fig, out("01-aos-soa-bench.svg"))


# ---------------------------------------------------------------- 8. ECS storage: archetypes vs sparse set
def table(ax, x0, y0, cols, ents, hl_cols, title):
    cw, rh = 1.55, 0.55
    ax.text(x0, y0 + 0.75, title, fontsize=12, weight="bold")
    allc = ["entity"] + cols
    for j, c in enumerate(allc):
        on = c in hl_cols
        ax.add_patch(Rectangle((x0 + j * cw, y0), cw, rh, fc=C["a"] if on else "#cccccc", ec="white"))
        ax.text(x0 + j * cw + cw / 2, y0 + rh / 2, c, ha="center", va="center", fontsize=10.5,
                color="white" if on else C["dark"])
        for i, e in enumerate(ents):
            y = y0 - (i + 1) * rh
            ax.add_patch(Rectangle((x0 + j * cw, y), cw, rh, fc=C["fill"] if on else "#f3f3f3", ec="white"))
            txt = f"e{e}" if j == 0 else f"{c[0].lower()}{e}"
            ax.text(x0 + j * cw + cw / 2, y + rh / 2, txt, ha="center", va="center", fontsize=10.5)


def fig_ecs():
    fig, ax = plt.subplots(figsize=(12, 7.4))
    ax.axis("off"); ax.set_xlim(-0.2, 17.2); ax.set_ylim(-4.4, 4.9)
    q = {"Position", "Velocity"}
    ax.text(0, 4.5, "archetype tables (Unity Entities, Bevy tables, flecs)   query<Position, Velocity>",
            fontsize=13)
    table(ax, 0.0, 3.0, ["Position", "Velocity"], [1, 3, 6], q, "A1 = {P, V}   match")
    table(ax, 5.2, 3.0, ["Position", "Velocity", "Health"], [2, 5], q, "A2 = {P, V, H}   match")
    table(ax, 12.0, 3.0, ["Position", "Mesh"], [4, 7], set(), "A3 = {P, M}   skip")
    # sparse set for Velocity (EnTT style)
    y = -1.6
    ax.text(0, -0.4, "sparse set for Velocity (EnTT): sparse[entity] -> index in dense", fontsize=13)
    dense = [1, 3, 6, 2, 5]
    sparse = {e: i for i, e in enumerate(dense)}
    for e in range(8):
        ax.add_patch(Rectangle((e * 1.2, y), 1.15, 0.6, fc="#f3f3f3", ec=C["gray"]))
        ax.text(e * 1.2 + 0.57, y + 0.3, str(sparse[e]) if e in sparse else "-", ha="center", va="center")
        ax.text(e * 1.2 + 0.57, y + 0.85, f"e{e}", ha="center", fontsize=10, color=C["gray"])
    ax.text(9.9, y + 0.3, "sparse", va="center", fontsize=12)
    yd = -3.6
    for i, e in enumerate(dense):
        ax.add_patch(Rectangle((i * 1.2 + 1.2, yd), 1.15, 0.6, fc=C["fill"], ec=C["a"]))
        ax.text(i * 1.2 + 1.77, yd + 0.3, f"e{e}: v{e}", ha="center", va="center", fontsize=10)
        ax.annotate("", xy=(i * 1.2 + 1.77, yd + 0.62), xytext=(e * 1.2 + 0.57, y - 0.02),
                    arrowprops=dict(arrowstyle="-|>", color=C["a"], lw=1.1, alpha=0.8))
    ax.text(7.5, yd + 0.3, "dense (packed)", va="center", fontsize=12)
    save(fig, out("01-ecs-storage.svg"))


# ---------------------------------------------------------------- 9. transform hierarchy
def T2(tx, ty, ang_deg):
    a = np.radians(ang_deg)
    return np.array([[np.cos(a), -np.sin(a), tx], [np.sin(a), np.cos(a), ty], [0, 0, 1.0]])


def chain(root_angle):
    locals_ = [("root", T2(2.0, 1.0, root_angle)), ("arm", T2(1.5, 0.0, 40.0)), ("hand", T2(1.2, 0.0, -30.0))]
    M, res = np.eye(3), []
    for name, Lm in locals_:
        M = M @ Lm
        res.append((name, M.copy()))
    return res


def fig_hierarchy():
    fig, ax = plt.subplots(figsize=(9, 6.4))
    for ang, alpha_, ls in ((30.0, 0.35, "--"), (20.0, 1.0, "-")):
        nodes = chain(ang)
        pts = [M[:2, 2] for _, M in nodes]
        ax.plot([p[0] for p in pts], [p[1] for p in pts], color=C["gray"], lw=5, alpha=0.3 * alpha_, ls=ls)
        for name, M in nodes:
            o = M[:2, 2]
            for k, col in ((0, C["x"]), (1, C["y"])):
                d = M[:2, k] * 0.55
                ax.annotate("", xy=(o[0] + d[0], o[1] + d[1]), xytext=(o[0], o[1]),
                            arrowprops=dict(arrowstyle="-|>", color=col, lw=2.0, alpha=alpha_))
            ax.plot(*o, "o", color=C["dark"], ms=7, alpha=alpha_)
            if alpha_ == 1.0:
                ax.text(o[0] + 0.08, o[1] - 0.32, f"{name}\n({o[0]:.3f}, {o[1]:.3f})", fontsize=11)
    ax.annotate("", xy=(0.55, 0), xytext=(0, 0), arrowprops=dict(arrowstyle="-|>", color=C["x"], lw=2))
    ax.annotate("", xy=(0, 0.55), xytext=(0, 0), arrowprops=dict(arrowstyle="-|>", color=C["y"], lw=2))
    ax.text(0.05, -0.35, "world", fontsize=11)
    ax.text(0.9, -0.8, r"$M_{hand} = L_{root}\,L_{arm}\,L_{hand}$", fontsize=16)
    ax.text(0.9, -1.25, "dashed: root rotated 20° -> 30°, children follow", fontsize=12, color=C["gray"])
    ax.set_xlim(-0.3, 5.0); ax.set_ylim(-1.45, 3.9); ax.set_aspect("equal")
    ax.set_xlabel("x"); ax.set_ylabel("y")
    save(fig, out("01-transform-hierarchy.svg"))


# ---------------------------------------------------------------- 10. BVH frustum culling
def build_bvh(lo, hi, idx, leaf=4, depth=0, nodes=None):
    if nodes is None:
        nodes = []
    blo, bhi = lo[idx].min(0), hi[idx].max(0)
    node = dict(lo=blo, hi=bhi, depth=depth, items=None, kids=[])
    nodes.append(node)
    if len(idx) <= leaf:
        node["items"] = idx
        return node, nodes
    axis = int(np.argmax(bhi - blo))
    c = (lo[idx, axis] + hi[idx, axis]) / 2
    order = idx[np.argsort(c)]
    m = len(order) // 2
    for part in (order[:m], order[m:]):
        kid, _ = build_bvh(lo, hi, part, leaf, depth + 1, nodes)
        node["kids"].append(kid)
    return node, nodes


def box_outside(blo, bhi, planes):
    """2D AABB vs convex region given as half-planes n.x <= d. Conservative test."""
    for n, d in planes:
        # the box corner that is furthest along -n (most 'inside')
        p = np.where(n > 0, blo, bhi)
        if n @ p > d:
            return True
    return False


def fig_bvh():
    rng = np.random.default_rng(11)
    M = 200
    centers = rng.uniform(2, 98, (M, 2))
    half = rng.uniform(0.6, 2.2, (M, 2))
    lo, hi = centers - half, centers + half
    root, nodes = build_bvh(lo, hi, np.arange(M))
    cam, ang, far = np.array([4.0, 30.0]), np.radians(18), 55.0
    dirs = [np.array([np.cos(a), np.sin(a)]) for a in (np.radians(15) + ang, np.radians(15) - ang)]
    fwd = np.array([np.cos(np.radians(15)), np.sin(np.radians(15))])
    planes = []
    for dvec, sgn in ((dirs[0], 1), (dirs[1], -1)):
        n = sgn * np.array([-dvec[1], dvec[0]])  # outward normal of the side plane
        planes.append((n, n @ cam))
    planes.append((fwd, fwd @ cam + far))
    planes.append((-fwd, -(fwd @ cam)))
    tests, visible, visited = 0, [], []

    def walk(node):
        nonlocal tests
        tests += 1
        visited.append(node)
        if box_outside(node["lo"], node["hi"], planes):
            return
        if node["items"] is not None:
            for i in node["items"]:
                tests += 1
                if not box_outside(lo[i], hi[i], planes):
                    visible.append(i)
            return
        for k in node["kids"]:
            walk(k)

    walk(root)
    vis = set(visible)
    print(f"BVH: {len(nodes)} nodes, {tests} box tests (brute force: {M}), {len(vis)} visible")
    fig, ax = plt.subplots(figsize=(9, 7.2))
    for i in range(M):
        ax.add_patch(Rectangle(lo[i], *(hi[i] - lo[i]), fc=C["b"] if i in vis else "#d0d0d0", ec="none"))
    for node in visited:
        if node["depth"] <= 6:
            ax.add_patch(Rectangle(node["lo"], *(node["hi"] - node["lo"]), fc="none", ec=C["a"],
                                   lw=max(0.6, 2.4 - 0.3 * node["depth"]), alpha=0.8))
    tri = [cam, cam + dirs[0] * far / np.cos(ang), cam + dirs[1] * far / np.cos(ang)]
    ax.add_patch(Polygon(tri, closed=True, fc=C["z"], alpha=0.10, ec=C["z"], lw=2))
    ax.plot(*cam, "k^", ms=12)
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.set_aspect("equal")
    ax.set_title(f"{len(vis)} visible of {M}: {tests} box tests with the BVH vs {M} brute force", fontsize=13)
    save(fig, out("01-bvh-culling.svg"))


# ---------------------------------------------------------------- 11. job graph + list scheduler
JOBS = {  # name: (duration in ms, dependencies) -- same table as in the post
    "input": (1, []),
    "anim_a": (3, ["input"]),
    "anim_b": (3, ["input"]),
    "physics": (4, ["input"]),
    "gameplay": (2, ["physics"]),
    "skinning": (2, ["anim_a", "anim_b"]),
    "particles": (3, ["physics"]),
    "audio": (2, ["gameplay"]),
    "cull": (2, ["gameplay", "skinning"]),
    "build_1": (2, ["cull"]),
    "build_2": (2, ["cull", "particles"]),
    "submit": (1, ["build_1", "build_2"]),
}


def schedule(jobs, workers):
    """Greedy list scheduling, priority = longest path to the end (identical to the post)."""
    import heapq
    children = {n: [] for n in jobs}
    for n, (_, deps) in jobs.items():
        for d in deps:
            children[d].append(n)
    prio = {}

    def bottom(n):
        if n not in prio:
            prio[n] = jobs[n][0] + max((bottom(c) for c in children[n]), default=0)
        return prio[n]

    for n in jobs:
        bottom(n)
    missing = {n: len(deps) for n, (_, deps) in jobs.items()}
    ready = [n for n in jobs if missing[n] == 0]
    free, running, t, out_ = list(range(workers)), [], 0, []
    while ready or running:
        ready.sort(key=lambda n: (-prio[n], n))
        free.sort()
        while ready and free:
            n, w = ready.pop(0), free.pop(0)
            heapq.heappush(running, (t + jobs[n][0], w, n))
            out_.append((n, w, t, t + jobs[n][0]))
        t = running[0][0]
        while running and running[0][0] == t:
            _, w, n = heapq.heappop(running)
            free.append(w)
            for c in children[n]:
                missing[c] -= 1
                if missing[c] == 0:
                    ready.append(c)
    return t, out_, prio


def fig_jobs():
    for p in (1, 2, 3, 4):
        print(p, "workers: makespan", schedule(JOBS, p)[0], "ms")
    span, sched, prio = schedule(JOBS, 4)
    level = {}

    def lev(n):
        if n not in level:
            level[n] = 1 + max((lev(d) for d in JOBS[n][1]), default=-1)
        return level[n]

    for n in JOBS:
        lev(n)
    crit, n = [], "input"
    children = {m: [c for c in JOBS if m in JOBS[c][1]] for m in JOBS}
    while True:
        crit.append(n)
        if not children[n]:
            break
        n = max(children[n], key=lambda c: prio[c])
    cols = {}
    for i, n in enumerate(JOBS):
        cols[n] = plt.cm.tab20(i % 20)
    fig, axs = plt.subplots(2, 1, figsize=(10, 10), gridspec_kw=dict(height_ratios=[1.15, 1]))
    ax = axs[0]
    bylev = {}
    for n in JOBS:
        bylev.setdefault(level[n], []).append(n)
    pos = {}
    for lv, names in bylev.items():
        for i, n in enumerate(names):
            pos[n] = (lv, (len(names) - 1) / 2 - i)
    for n, (_, deps) in JOBS.items():
        for d in deps:
            on = d in crit and n in crit
            ax.annotate("", xy=pos[n], xytext=pos[d],
                        arrowprops=dict(arrowstyle="-|>", color=C["x"] if on else C["gray"],
                                        lw=2.4 if on else 1.2, shrinkA=34, shrinkB=34))
    for n, (x, y) in pos.items():
        ax.add_patch(FancyBboxPatch((x - 0.42, y - 0.22), 0.84, 0.44, boxstyle="round,pad=0.02",
                                    fc=cols[n], ec=C["x"] if n in crit else C["dark"],
                                    lw=2.2 if n in crit else 1))
        ax.text(x, y, f"{n}\n{JOBS[n][0]} ms", ha="center", va="center", fontsize=12)
    ax.set_xlim(-0.6, max(level.values()) + 0.6); ax.set_ylim(-1.6, 1.6)
    ax.axis("off")
    ax.set_title("job DAG (red: critical path, 12 ms)", fontsize=15)
    ax = axs[1]
    for n, w, s, e in sched:
        ax.barh(w, e - s, left=s, color=cols[n], ec="white", height=0.7)
        ax.text((s + e) / 2, w, n, ha="center", va="center", fontsize=12 if e - s >= 2 else 10.5,
                rotation=0 if e - s >= 2 else 90)
    ax.set_yticks(range(4)); ax.set_yticklabels([f"worker {i}" for i in range(4)])
    ax.invert_yaxis(); ax.set_xlabel("t (ms)")
    total = sum(d for d, _ in JOBS.values())
    ax.set_title(f"4 workers: makespan {span} ms (1 worker: {total} ms)", fontsize=15)
    ax.set_xlim(0, span + 0.5); ax.grid(axis="y", visible=False)
    fig.tight_layout()
    save(fig, out("01-job-graph.svg"))


if __name__ == "__main__":
    fig_layers()
    fig_frame_timeline()
    fig_timestep()
    fig_accumulator()
    fig_interpolation()
    fig_cache_lines()
    fig_ecs()
    fig_hierarchy()
    fig_bvh()
    fig_jobs()
    fig_bench()
