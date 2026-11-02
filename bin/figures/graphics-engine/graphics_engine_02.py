"""Figures for graphics-engine post 02 (GPU APIs and render graphs).

    python3 bin/figures/graphics-engine/graphics_engine_02.py

The render-graph figures come from the toy frame-graph compiler printed in the post
(`compile_graph`), the frames-in-flight timeline from a two-line CPU/GPU simulation, and the
clustered-lighting, HZB and meshlet figures from real runs of those algorithms on toy data.
"""
import pathlib
import sys
from dataclasses import dataclass

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from style import *  # noqa: E402,F401

import numpy as np  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle, Polygon, Circle  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[3] / "assets/img/blog/graphics-engine"


def out(name):
    return OUT / name


# ============================================================ the toy frame-graph compiler (as in the post)
@dataclass
class Pass:
    name: str
    reads: list
    writes: list


SIZES = {"shadow_map": 16, "depth": 8, "gbuf_albedo": 8, "gbuf_normal": 8,
         "ssao": 2, "hdr": 16, "taa_out": 16, "bloom": 4, "debug_view": 8}
DEPTH_LIKE = {"shadow_map", "depth"}
IMPORTED = {"backbuffer"}

PASSES = [
    Pass("shadow", [], ["shadow_map"]),
    Pass("gbuffer", [], ["depth", "gbuf_albedo", "gbuf_normal"]),
    Pass("ssao", ["depth", "gbuf_normal"], ["ssao"]),
    Pass("lighting", ["gbuf_albedo", "gbuf_normal", "depth", "ssao", "shadow_map"], ["hdr"]),
    Pass("debug_normals", ["gbuf_normal"], ["debug_view"]),
    Pass("taa", ["hdr", "depth"], ["taa_out"]),
    Pass("bloom", ["taa_out"], ["bloom"]),
    Pass("tonemap", ["taa_out", "bloom"], ["backbuffer"]),
]


def compile_graph(passes, outputs):
    writer = {r: p for p in passes for r in p.writes}
    needed, stack = set(), list(outputs)
    while stack:
        r = stack.pop()
        p = writer.get(r)
        if p is not None and p.name not in needed:
            needed.add(p.name)
            stack.extend(p.reads)
    live = [p for p in passes if p.name in needed]
    deps = {p.name: {writer[r].name for r in p.reads if r in writer} for p in live}
    order, done = [], set()
    while len(order) < len(live):
        p = next(p for p in live if p.name not in done and deps[p.name] <= done)
        order.append(p)
        done.add(p.name)
    life = {}
    for i, p in enumerate(order):
        for r in p.reads + p.writes:
            if r not in IMPORTED:
                a, b = life.get(r, (i, i))
                life[r] = (min(a, i), max(b, i))
    placed = {}
    for r in sorted(life, key=lambda r: (-SIZES[r], life[r][0], r)):
        a, b = life[r]
        busy = sorted((placed[q][0], placed[q][0] + SIZES[q]) for q in placed
                      if not (life[q][1] < a or b < life[q][0]))
        off = 0
        for lo, hi in busy:
            if off + SIZES[r] <= lo:
                break
            off = max(off, hi)
        placed[r] = (off, off + SIZES[r])
    state = {r: "UNDEFINED" for r in life} | {r: "PRESENT" for r in IMPORTED}
    barriers = []
    for i, p in enumerate(order):
        want = [(r, "SRV") for r in p.reads] + \
               [(r, "DEPTH_WRITE" if r in DEPTH_LIKE else "RT") for r in p.writes]
        for r, s in want:
            if state[r] != s:
                barriers.append((i, r, state[r], s))
                state[r] = s
    for r in IMPORTED:
        if state[r] != "PRESENT":
            barriers.append((len(order), r, state[r], "PRESENT"))
    return order, life, placed, barriers


RES_COL = {"shadow_map": "#8c564b", "depth": "#7f7f7f", "gbuf_albedo": "#ff7f0e", "gbuf_normal": "#9467bd",
           "ssao": "#17becf", "hdr": "#d62728", "taa_out": "#1f77b4", "bloom": "#e6b800", "debug_view": "#bbbbbb"}


# ============================================================ 1. API object graph
def fig_api_objects():
    fig, ax = plt.subplots(figsize=(12, 6.6))
    ax.axis("off"); ax.set_xlim(0, 12); ax.set_ylim(0, 7)
    nodes = {
        "Instance": (1.2, 6.2, "#dddddd"), "Adapter /\nPhysicalDevice": (1.2, 4.7, "#dddddd"),
        "Device": (4.0, 4.7, "#e8e0f5"), "Queue\n(graphics, compute,\ncopy)": (1.2, 2.9, "#e8e0f5"),
        "Surface /\nSwapchain": (4.0, 6.2, "#dddddd"),
        "CommandPool /\nAllocator": (6.8, 6.2, "#fde9d2"), "CommandBuffer /\nEncoder": (9.6, 6.2, "#fde9d2"),
        "ShaderModule\n(SPIR-V, DXIL,\nMSL, WGSL)": (6.8, 4.7, "#dff2df"),
        "PipelineLayout /\nRootSignature": (9.6, 3.1, "#dff2df"), "Pipeline (PSO)": (9.6, 4.7, "#dff2df"),
        "DescriptorSetLayout /\nBindGroupLayout": (6.8, 3.1, "#dbeaf7"),
        "DescriptorSet /\nBindGroup": (6.8, 1.5, "#dbeaf7"),
        "Buffer / Texture\n+ Memory (heap)": (4.0, 1.5, "#fff6cc"),
        "Fence / Semaphore /\nTimeline": (1.2, 1.5, "#f4d7d7"), "Query (timestamps)": (9.6, 1.5, "#f4f4f4"),
    }
    W, H = 2.35, 1.0
    for name, (x, y, fc) in nodes.items():
        ax.add_patch(FancyBboxPatch((x - W / 2, y - H / 2), W, H, boxstyle="round,pad=0.02,rounding_size=0.08",
                                    fc=fc, ec=C["dark"], lw=1.2))
        ax.text(x, y, name, ha="center", va="center", fontsize=12)
    edges = [("Instance", "Adapter /\nPhysicalDevice"), ("Adapter /\nPhysicalDevice", "Device"),
             ("Instance", "Surface /\nSwapchain"), ("Device", "Surface /\nSwapchain"),
             ("Device", "Queue\n(graphics, compute,\ncopy)"), ("Device", "CommandPool /\nAllocator"),
             ("CommandPool /\nAllocator", "CommandBuffer /\nEncoder"), ("Device", "ShaderModule\n(SPIR-V, DXIL,\nMSL, WGSL)"),
             ("ShaderModule\n(SPIR-V, DXIL,\nMSL, WGSL)", "Pipeline (PSO)"),
             ("PipelineLayout /\nRootSignature", "Pipeline (PSO)"),
             ("DescriptorSetLayout /\nBindGroupLayout", "PipelineLayout /\nRootSignature"),
             ("DescriptorSetLayout /\nBindGroupLayout", "DescriptorSet /\nBindGroup"),
             ("Buffer / Texture\n+ Memory (heap)", "DescriptorSet /\nBindGroup"),
             ("Device", "Buffer / Texture\n+ Memory (heap)"),
             ("Queue\n(graphics, compute,\ncopy)", "Fence / Semaphore /\nTimeline")]

    def exit_point(cx, cy, dx, dy):
        # where the ray from the box centre along (dx, dy) leaves the box (plus a small gap)
        t = min((W / 2 + 0.06) / abs(dx) if dx else 1e9, (H / 2 + 0.06) / abs(dy) if dy else 1e9)
        return cx + t * dx, cy + t * dy

    for a, b in edges:
        (x0, y0, _), (x1, y1, _) = nodes[a], nodes[b]
        dx, dy = x1 - x0, y1 - y0
        p0 = exit_point(x0, y0, dx, dy)
        p1 = exit_point(x1, y1, -dx, -dy)
        ax.annotate("", xy=p1, xytext=p0,
                    arrowprops=dict(arrowstyle="-|>", color=C["dark"], lw=1.4, shrinkA=0, shrinkB=0,
                                    mutation_scale=16))
    ax.text(0.1, 0.3, "Vulkan / D3D12 / WebGPU names; arrows: 'creates', 'is built from' or 'signals'",
            fontsize=11, color=C["gray"])
    save(fig, out("02-api-objects.svg"))


# ============================================================ 2. frames in flight
def simulate_frames(n_flight, c=9.0, g=12.0, frames=7):
    cpu_end, gpu_end, rows = [], [], []
    for i in range(frames):
        prev_cpu = cpu_end[-1] if cpu_end else 0.0
        fence = gpu_end[i - n_flight] if i - n_flight >= 0 else 0.0
        s = max(prev_cpu, fence)
        ce = s + c
        gs = max(ce, gpu_end[-1] if gpu_end else 0.0)
        ge = gs + g
        rows.append((i, prev_cpu, s, ce, gs, ge))
        cpu_end.append(ce); gpu_end.append(ge)
    return rows


def fig_frames_in_flight():
    fig, axs = plt.subplots(3, 1, figsize=(11, 7.4), sharex=True)
    cols = [C["a"], C["b"], C["c"], C["y"], C["x"]]
    for ax, n in zip(axs, (1, 2, 3)):
        rows = simulate_frames(n)
        for i, pc, s, ce, gs, ge in rows:
            col = cols[i % len(cols)]
            if s > pc + 1e-9:
                ax.add_patch(Rectangle((pc, 0.65), s - pc, 0.7, fc="none", ec=C["gray"], hatch="///", lw=0.8))
            ax.add_patch(Rectangle((s, 0.65), ce - s, 0.7, fc=col, ec="white"))
            ax.text((s + ce) / 2, 1.0, str(i), ha="center", va="center", color="white", weight="bold")
            ax.add_patch(Rectangle((gs, -0.35), ge - gs, 0.7, fc=col, ec="white"))
            ax.text((gs + ge) / 2, 0.0, str(i), ha="center", va="center", color="white", weight="bold")
        period = (rows[-1][5] - rows[2][5]) / (len(rows) - 3)
        lat = rows[-1][5] - rows[-1][2]          # steady state: last frame, CPU start -> GPU end
        ax.set_yticks([0, 1]); ax.set_yticklabels(["GPU", "CPU"])
        ax.set_ylim(-0.6, 1.6); ax.grid(False)
        ax.set_title(f"{n} frame(s) in flight: {period:.0f} ms per frame, CPU start -> GPU done {lat:.0f} ms",
                     fontsize=13, loc="left")
    axs[-1].set_xlim(0, 100); axs[-1].set_xlabel("t (ms)   CPU 9 ms/frame, GPU 12 ms/frame, hatched = waiting on a fence")
    fig.tight_layout()
    save(fig, out("02-frames-in-flight.svg"))


# ============================================================ 3. barrier / state lanes from the compiler
STATE_COL = {"UNDEFINED": "#ffffff", "RT": "#f4a261", "DEPTH_WRITE": "#8d99ae", "SRV": "#90be6d", "PRESENT": "#cdb4db"}


def fig_barrier_states():
    order, life, placed, barriers = compile_graph(PASSES, ["backbuffer"])
    res = list(life) + ["backbuffer"]
    n = len(order)
    fig, ax = plt.subplots(figsize=(12, 5.6))
    state = {r: "UNDEFINED" for r in life} | {"backbuffer": "PRESENT"}
    trans = {}
    for i, r, a, b in barriers:
        trans.setdefault(i, []).append((r, a, b))
    for i in range(n + 1):
        for r, a, b in trans.get(i, []):
            state[r] = b
            y = len(res) - 1 - res.index(r)
            ax.plot(i, y, marker="|", color=C["x"], ms=26, mew=3)
        if i == n:
            break
        for r in res:
            y = len(res) - 1 - res.index(r)
            touched = r in order[i].reads or r in order[i].writes
            ax.add_patch(Rectangle((i + 0.04, y - 0.36), 0.92, 0.72, fc=STATE_COL[state[r]],
                                   ec=C["dark"] if touched else "#dddddd", lw=1.6 if touched else 0.6))
            if touched:
                ax.text(i + 0.5, y, "W" if r in order[i].writes else "R", ha="center", va="center",
                        fontsize=11, weight="bold")
    ax.set_yticks(range(len(res))); ax.set_yticklabels(res[::-1])
    ax.set_xticks([i + 0.5 for i in range(n)]); ax.set_xticklabels([p.name for p in order], rotation=20)
    ax.set_xlim(-0.2, n + 0.4); ax.set_ylim(-0.7, len(res) - 0.3); ax.grid(False)
    for k, (s, c) in enumerate(STATE_COL.items()):
        ax.add_patch(Rectangle((k * 1.5, len(res) - 0.05), 0.35, 0.35, fc=c, ec=C["dark"], clip_on=False))
        ax.text(k * 1.5 + 0.45, len(res) + 0.12, s, fontsize=10.5, va="center")
    ax.set_xlabel(f"red | = barrier before the pass ({len(barriers)} in total); R = read, W = write", fontsize=12)
    save(fig, out("02-barrier-states.svg"))


# ============================================================ 4. render-graph DAG
def fig_graph_dag():
    order, life, placed, barriers = compile_graph(PASSES, ["backbuffer"])
    alive = {p.name for p in order}
    pos = {"shadow": (0, 2.1), "gbuffer": (0, -0.6), "ssao": (3.2, -0.6), "debug_normals": (3.2, -2.4),
           "lighting": (5.8, 1.2), "taa": (8.2, 1.2), "bloom": (10.2, -0.6), "tonemap": (12.2, 1.2),
           "backbuffer": (12.2, -2.4), "unused": (6.4, -2.4)}
    edges = [("shadow", "lighting", "shadow_map", 0.5), ("gbuffer", "ssao", "depth,\ngbuf_normal", 0.5),
             ("gbuffer", "lighting", "gbuf_*, depth", 0.3), ("ssao", "lighting", "ssao", 0.25),
             ("gbuffer", "taa", "depth", 0.86),
             ("gbuffer", "debug_normals", "gbuf_normal", 0.5), ("debug_normals", "unused", "debug_view", 0.5),
             ("lighting", "taa", "hdr", 0.5), ("taa", "bloom", "taa_out", 0.5), ("taa", "tonemap", "taa_out", 0.5),
             ("bloom", "tonemap", "bloom", 0.5), ("tonemap", "backbuffer", "", 0.5)]
    HW, HH = 0.8, 0.34

    def exit_point(cx, cy, dx, dy):
        t = min((HW + 0.05) / abs(dx) if dx else 1e9, (HH + 0.05) / abs(dy) if dy else 1e9)
        return cx + t * dx, cy + t * dy

    fig, ax = plt.subplots(figsize=(14, 5.8))
    ax.axis("off"); ax.set_xlim(-0.9, 13.1); ax.set_ylim(-2.9, 2.6)
    for a, b, lab, f in edges:
        dead = (a not in alive and a != "backbuffer") or b == "unused" or (b not in alive and b not in ("backbuffer",))
        (x0, y0), (x1, y1) = pos[a], pos[b]
        dx, dy = x1 - x0, y1 - y0
        p0, p1 = exit_point(x0, y0, dx, dy), exit_point(x1, y1, -dx, -dy)
        ax.annotate("", xy=p1, xytext=p0,
                    arrowprops=dict(arrowstyle="-|>", color="#bbbbbb" if dead else C["dark"], lw=1.6,
                                    ls="--" if dead else "-", shrinkA=0, shrinkB=0, mutation_scale=16))
        if lab:
            mx, my = p0[0] + f * (p1[0] - p0[0]), p0[1] + f * (p1[1] - p0[1])
            ax.text(mx, my, lab, ha="center", va="center", fontsize=11,
                    color=C["gray"] if dead else C["z"],
                    bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="none"))
    for name, (x, y) in pos.items():
        if name in ("backbuffer", "unused"):
            ax.add_patch(FancyBboxPatch((x - HW, y - HH), 2 * HW, 2 * HH, boxstyle="round,pad=0.02,rounding_size=0.1",
                                        fc="#fff6cc" if name == "backbuffer" else "white",
                                        ec=C["dark"] if name == "backbuffer" else "#bbbbbb",
                                        ls="-" if name == "backbuffer" else "--"))
            ax.text(x, y, "backbuffer\n(imported)" if name == "backbuffer" else "(nobody reads)", ha="center",
                    va="center", fontsize=12, color=C["dark"] if name == "backbuffer" else C["gray"])
            continue
        on = name in alive
        ax.add_patch(FancyBboxPatch((x - HW, y - HH), 2 * HW, 2 * HH, boxstyle="round,pad=0.02,rounding_size=0.1",
                                    fc=C["fill"] if on else "white", ec=C["a"] if on else "#bbbbbb",
                                    lw=2 if on else 1.2, ls="-" if on else "--"))
        ax.text(x, y, name if on else name + "\nculled", ha="center", va="center", fontsize=12.5,
                color=C["dark"] if on else C["gray"])
    save(fig, out("02-graph-dag.svg"))


# ============================================================ 5. lifetimes and aliased memory
def fig_lifetimes():
    order, life, placed, barriers = compile_graph(PASSES, ["backbuffer"])
    n = len(order)
    fig, axs = plt.subplots(1, 2, figsize=(14, 5.6), gridspec_kw=dict(width_ratios=[1, 1.1]))
    ax = axs[0]
    res = list(life)
    for k, r in enumerate(res):
        a, b = life[r]
        y = len(res) - 1 - k
        ax.barh(y, b - a + 1, left=a, color=RES_COL[r], height=0.62, ec="white")
        ax.text(b + 1.08, y, f"{SIZES[r]} MB", va="center", fontsize=10.5)
    ax.set_yticks(range(len(res))); ax.set_yticklabels(res[::-1])
    ax.set_xticks([i + 0.5 for i in range(n)]); ax.set_xticklabels([p.name for p in order], rotation=35, fontsize=11)
    ax.set_xlim(0, n + 1.2); ax.grid(axis="y", visible=False)
    ax.set_title("lifetimes (first use .. last use)", fontsize=13)
    ax = axs[1]
    for r, (lo, hi) in placed.items():
        a, b = life[r]
        ax.add_patch(Rectangle((a, lo), b - a + 1, hi - lo, fc=RES_COL[r], ec="white", lw=1.5, alpha=0.9))
        ax.text(a + (b - a + 1) / 2, (lo + hi) / 2, r if hi - lo >= 4 else "", ha="center", va="center",
                fontsize=10, color="white", weight="bold")
    total = sum(SIZES[r] for r in life)
    heap = max(hi for _, hi in placed.values())
    ax.axhline(heap, color=C["x"], ls="--", lw=1.5)
    ax.text(0.1, heap + 1, f"aliased heap = {heap} MB (no aliasing: {total} MB)", color=C["x"], fontsize=12)
    ax.set_xticks([i + 0.5 for i in range(n)]); ax.set_xticklabels([p.name for p in order], rotation=35, fontsize=11)
    ax.set_xlim(0, n); ax.set_ylim(0, total * 0.95)
    ax.set_ylabel("memory offset (MB)")
    ax.set_title("placement in one transient heap", fontsize=13)
    fig.tight_layout()
    save(fig, out("02-lifetimes-aliasing.svg"))


# ============================================================ 6. clustered light assignment
def fig_clustered():
    rng = np.random.default_rng(5)
    near, far, half_fov = 0.5, 50.0, np.radians(30)
    S, Ccols = 12, 8
    zs = near * (far / near) ** (np.arange(S + 1) / S)          # exponential depth slices
    t = np.tan(half_fov)
    xs_ndc = np.linspace(-1, 1, Ccols + 1)                        # screen columns
    L = 48
    lz = rng.uniform(2, 45, L)
    lx = rng.uniform(-0.9, 0.9, L) * lz * t
    lr = rng.uniform(1.5, 4.0, L)

    def hits(xa, xb, za, zb):
        """Lights whose sphere touches the cell bounded by z in [za, zb] and the two column planes."""
        # cell corners in x-z; use its bounding box for a conservative sphere-box test
        xs = [xa * za * t, xa * zb * t, xb * za * t, xb * zb * t]
        bx0, bx1 = min(xs), max(xs)
        dx = np.maximum(0, np.maximum(bx0 - lx, lx - bx1))
        dz = np.maximum(0, np.maximum(za - lz, lz - zb))
        return dx * dx + dz * dz <= lr * lr

    counts = np.zeros((S, Ccols), int)
    tile = np.zeros(Ccols, int)
    for j in range(Ccols):
        tile[j] = hits(xs_ndc[j], xs_ndc[j + 1], near, far).sum()
        for k in range(S):
            counts[k, j] = hits(xs_ndc[j], xs_ndc[j + 1], zs[k], zs[k + 1]).sum()
    # lights evaluated per pixel for random visible surfaces (depth log-uniform in [1, 45])
    samples = 4000
    sj = rng.integers(0, Ccols, samples)
    sz = np.exp(rng.uniform(np.log(1.0), np.log(45.0), samples))
    sk = np.clip(np.searchsorted(zs, sz) - 1, 0, S - 1)
    per_tiled = tile[sj].mean()
    per_clustered = counts[sk, sj].mean()
    print(f"clustered: lights per pixel tiled {per_tiled:.1f}, clustered {per_clustered:.1f}")

    fig, axs = plt.subplots(1, 2, figsize=(14, 6.2), gridspec_kw=dict(width_ratios=[1.6, 1]))
    ax = axs[0]
    cmap = plt.cm.YlOrRd
    vmax = max(1, counts.max())
    for j in range(Ccols):
        for k in range(S):
            za, zb = zs[k], zs[k + 1]
            xa, xb = xs_ndc[j], xs_ndc[j + 1]
            quad = [(xa * za * t, za), (xb * za * t, za), (xb * zb * t, zb), (xa * zb * t, zb)]
            ax.add_patch(Polygon(quad, closed=True, fc=cmap(counts[k, j] / vmax), ec="#999999", lw=0.5))
    for x, z, r in zip(lx, lz, lr):
        ax.add_patch(Circle((x, z), r, fc="none", ec=C["z"], lw=1.0, alpha=0.8))
        ax.plot(x, z, ".", color=C["z"], ms=4)
    ax.plot(0, 0, "k^", ms=10)
    ax.set_aspect("equal"); ax.set_xlim(-30, 30); ax.set_ylim(-1, far + 1)
    ax.set_xlabel("x (view space)"); ax.set_ylabel("z (depth)")
    ax.set_title(f"{Ccols} columns x {S} exponential slices, max {counts.max()} lights per cluster", fontsize=12)
    sm = plt.cm.ScalarMappable(cmap=cmap, norm=plt.Normalize(0, vmax)); sm.set_array([])
    fig.colorbar(sm, ax=ax, fraction=0.035, pad=0.02, label="lights in cluster")
    ax = axs[1]
    ax.bar([0, 1], [per_tiled, per_clustered], color=[C["b"], C["z"]], width=0.6)
    for i, v in enumerate([per_tiled, per_clustered]):
        ax.text(i, v + 0.2, f"{v:.1f}", ha="center", fontsize=14, weight="bold")
    ax.set_xticks([0, 1]); ax.set_xticklabels(["2D tiles", "3D clusters"])
    ax.set_ylabel("lights evaluated per pixel")
    ax.set_title(f"{L} lights, {samples} random surface points", fontsize=12)
    fig.tight_layout()
    save(fig, out("02-clustered-lights.svg"))


# ============================================================ 7. bytes per pixel: forward, G-buffer, visibility buffer
def fig_gbuffer_bytes():
    layouts = {
        "forward": [("depth", 4), ("HDR color", 8)],
        "deferred\n(G-buffer)": [("depth", 4), ("albedo", 4), ("normal", 4), ("material", 4), ("HDR color", 8)],
        "visibility\nbuffer": [("depth", 4), ("tri+inst ID", 4), ("HDR color", 8)],
    }
    colors = {"depth": "#7f7f7f", "HDR color": "#d62728", "albedo": "#ff7f0e", "normal": "#9467bd",
              "material": "#2ca02c", "tri+inst ID": "#1f77b4"}
    fig, axs = plt.subplots(1, 2, figsize=(13, 4.8))
    ax = axs[0]
    for i, (name, parts) in enumerate(layouts.items()):
        b = 0
        for lab, size in parts:
            ax.bar(i, size, bottom=b, color=colors[lab], ec="white", width=0.6)
            ax.text(i, b + size / 2, f"{lab} {size}", ha="center", va="center", fontsize=10, color="white")
            b += size
        ax.text(i, b + 0.5, f"{b} B", ha="center", fontsize=13, weight="bold")
    ax.set_xticks(range(3)); ax.set_xticklabels(list(layouts)); ax.set_ylabel("bytes per pixel")
    ax.set_ylim(0, 28)
    ax = axs[1]
    res = {"1080p": 1920 * 1080, "1440p": 2560 * 1440, "4K": 3840 * 2160}
    w = 0.26
    for k, (name, parts) in enumerate(layouts.items()):
        bpp = sum(s for _, s in parts)
        vals = [bpp * px / 2 ** 20 for px in res.values()]
        ax.bar(np.arange(3) + (k - 1) * w, vals, w, label=name.replace("\n", " "),
               color=[C["gray"], C["b"], C["z"]][k])
    ax.set_xticks(range(3)); ax.set_xticklabels(list(res)); ax.set_ylabel("MB per frame (no MSAA)")
    ax.legend(fontsize=11)
    fig.tight_layout()
    save(fig, out("02-gbuffer-bytes.svg"))


# ============================================================ 8. HZB occlusion culling
def fig_hzb():
    rng = np.random.default_rng(2)
    N = 64
    D = np.ones((N, N))                                      # 1 = far plane
    for (x0, y0, x1, y1, z) in [(4, 8, 30, 40, 0.30), (26, 30, 60, 52, 0.40), (40, 4, 58, 26, 0.35),
                                (10, 46, 24, 62, 0.50)]:
        D[y0:y1, x0:x1] = np.minimum(D[y0:y1, x0:x1], z)
    mips = [D]
    while mips[-1].shape[0] > 1:
        m = mips[-1]
        mips.append(m.reshape(m.shape[0] // 2, 2, m.shape[1] // 2, 2).max(axis=(1, 3)))   # conservative: farthest
    objs = []
    for _ in range(60):
        w, h = rng.integers(2, 12, 2)
        x, y = rng.integers(0, N - w), rng.integers(0, N - h)
        z = rng.uniform(0.2, 0.95)
        objs.append((x, y, w, h, z))
    res = []
    for x, y, w, h, z in objs:
        lvl = int(np.ceil(np.log2(max(w, h))))               # footprint covers at most 2x2 texels here
        s = 2 ** lvl
        tx0, ty0, tx1, ty1 = x // s, y // s, (x + w - 1) // s, (y + h - 1) // s
        hz = mips[lvl][ty0:ty1 + 1, tx0:tx1 + 1].max()
        culled = z > hz
        truly = z > D[y:y + h, x:x + w].max()
        res.append((culled, truly, lvl, (tx1 - tx0 + 1) * (ty1 - ty0 + 1)))
    n_cull = sum(r[0] for r in res)
    n_true = sum(r[1] for r in res)
    assert all(r[1] for r in res if r[0]), "HZB must be conservative"
    print(f"HZB: {n_cull} culled of {len(objs)}, {n_true} truly hidden, max texels read {max(r[3] for r in res)}")
    fig = plt.figure(figsize=(9, 12.5))
    gs = fig.add_gridspec(4, 3, height_ratios=[1.25, 1.25, 1, 1])
    ax = fig.add_subplot(gs[0:2, :])
    ax.imshow(D, cmap="gray", vmin=0, vmax=1, origin="upper")
    for (x, y, w, h, z), (culled, truly, _, _) in zip(objs, res):
        col = C["x"] if culled else (C["b"] if truly else C["y"])
        ax.add_patch(Rectangle((x - 0.5, y - 0.5), w, h, fc="none", ec=col, lw=2))
    ax.set_title(f"depth buffer + 60 boxes: {n_cull} culled by HZB (red),\n"
                 f"{n_true - n_cull} hidden but kept (orange), {len(objs) - n_true} visible (green)", fontsize=15)
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    for k, lvl in enumerate([1, 2, 3, 4, 5, 6]):
        a = fig.add_subplot(gs[2 + k // 3, k % 3])
        a.imshow(mips[lvl], cmap="gray", vmin=0, vmax=1, interpolation="nearest")
        a.set_title(f"mip {lvl}: {mips[lvl].shape[0]}x{mips[lvl].shape[1]}", fontsize=15)
        a.set_xticks([]); a.set_yticks([]); a.grid(False)
    fig.tight_layout()
    save(fig, out("02-hzb-culling.svg"))


# ============================================================ 9. meshlets
def torus(nu=48, nv=24, R=1.0, r=0.42):
    u = np.linspace(0, 2 * np.pi, nu, endpoint=False)
    v = np.linspace(0, 2 * np.pi, nv, endpoint=False)
    U, V = np.meshgrid(u, v, indexing="ij")
    P = np.stack([(R + r * np.cos(V)) * np.cos(U), (R + r * np.cos(V)) * np.sin(U), r * np.sin(V)], -1).reshape(-1, 3)
    idx = lambda i, j: (i % nu) * nv + (j % nv)  # noqa: E731
    tris = []
    for i in range(nu):
        for j in range(nv):
            a, b, c, d = idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)
            tris += [(a, b, c), (a, c, d)]
    return P, np.array(tris)


def build_meshlets(tris, max_v=64, max_t=124):
    """Greedy meshlet builder: grow each meshlet over edge-adjacent triangles (BFS)."""
    from collections import defaultdict, deque
    edge_tris = defaultdict(list)
    for t, (a, b, c) in enumerate(tris):
        for e in ((a, b), (b, c), (c, a)):
            edge_tris[tuple(sorted(e))].append(t)
    nbr = [[] for _ in tris]
    for ts in edge_tris.values():
        for t in ts:
            nbr[t] += [s for s in ts if s != t]
    owner = -np.ones(len(tris), int)
    meshlets = []
    for seed in range(len(tris)):
        if owner[seed] >= 0:
            continue
        verts, mt, q = set(), [], deque([seed])
        while q and len(mt) < max_t:
            t = q.popleft()
            if owner[t] >= 0:
                continue
            new = set(tris[t]) - verts
            if len(verts) + len(new) > max_v:
                continue
            owner[t] = len(meshlets)
            verts |= new
            mt.append(t)
            q.extend(s for s in nbr[t] if owner[s] < 0)
        meshlets.append((mt, verts))
    return owner, meshlets


def fig_meshlets():
    P, tris = torus()
    owner, meshlets = build_meshlets(tris)
    nv = [len(v) for _, v in meshlets]
    nt = [len(t) for t, _ in meshlets]
    print(f"meshlets: {len(meshlets)} for {len(tris)} triangles, mean {np.mean(nv):.1f} verts, {np.mean(nt):.1f} tris")
    fig = plt.figure(figsize=(13, 5.6))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    rng = np.random.default_rng(0)
    perm = rng.permutation(len(meshlets))
    cols = plt.cm.tab20(np.linspace(0, 1, 20))
    fc = [cols[perm[o] % 20] for o in owner]
    ax.add_collection3d(Poly3DCollection(P[tris], facecolors=fc, edgecolors=(0, 0, 0, 0.15), linewidths=0.3))
    ax.set_xlim(-1.4, 1.4); ax.set_ylim(-1.4, 1.4); ax.set_zlim(-0.7, 0.7)
    ax.set_box_aspect((2.8, 2.8, 1.4)); ax.view_init(38, -60); ax.set_axis_off()
    ax.set_title(f"{len(tris)} triangles -> {len(meshlets)} meshlets (<= 64 verts, <= 124 tris)", fontsize=12)
    ax2 = fig.add_subplot(1, 2, 2)
    order = np.argsort(nt)[::-1]
    ax2.bar(range(len(meshlets)), np.array(nt)[order], color=C["z"], label="triangles")
    ax2.bar(range(len(meshlets)), np.array(nv)[order], color=C["b"], alpha=0.7, label="vertices")
    ax2.axhline(64, color=C["b"], ls="--", lw=1.2); ax2.axhline(124, color=C["z"], ls="--", lw=1.2)
    ax2.set_xlabel("meshlet (sorted)"); ax2.set_ylabel("count"); ax2.legend(fontsize=11)
    ax2.set_title(f"mean {np.mean(nt):.0f} tris and {np.mean(nv):.0f} verts per meshlet", fontsize=12)
    fig.tight_layout()
    save(fig, out("02-meshlets.svg"))


if __name__ == "__main__":
    order, life, placed, barriers = compile_graph(PASSES, ["backbuffer"])
    print("order:", [p.name for p in order])
    for r in life:
        print(f"{r:12s} life {life[r]}  memory [{placed[r][0]:2d}, {placed[r][1]:2d}) MB")
    fig_api_objects()
    fig_frames_in_flight()
    fig_barrier_states()
    fig_graph_dag()
    fig_lifetimes()
    fig_clustered()
    fig_gbuffer_bytes()
    fig_hzb()
    fig_meshlets()
