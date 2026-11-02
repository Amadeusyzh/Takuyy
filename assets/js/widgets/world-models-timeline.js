// Filterable timeline of world models, late 2024 to November 2026 (world-models posts 03-05, "2025-2026 update").
// Every entry was checked against a primary source (arXiv abstract page or API, official blog / press release)
// in November 2026. Status: pub = published at a venue, acc = accepted / to appear, pre = arXiv preprint,
// ann = company announcement or product page (capability statements are the company's own claims).
// Entry summaries are in English for all three languages; the UI text is localized.
(function () {
  "use strict";
  var TYPES = ["iv", "g3", "rl", "je", "ev"];
  var COL = { iv: "#1f77b4", g3: "#2ca02c", rl: "#ff7f0e", je: "#9467bd", ev: "#d62728" };
  var X0 = 2024.75, X1 = 2026.95;

  var TXT = {
    en: { all: "All", iv: "interactive video", g3: "3D/4D generation", rl: "latent RL / agents", je: "JEPA", ev: "evaluation",
      hint: "Tap a dot (or use \u25c0 \u25b6) to read an entry; the buttons filter by type.",
      pre: "preprint", pub: "published", acc: "accepted / to appear", ann: "announcement / product (company claims)",
      open: "open link", count: "entries shown", note: "" },
    zh: { all: "\u5168\u90e8", iv: "\u4ea4\u4e92\u5f0f\u89c6\u9891", g3: "3D/4D \u751f\u6210",
      rl: "\u6f5c\u5728\u7a7a\u95f4 RL / \u667a\u80fd\u4f53", je: "JEPA", ev: "\u8bc4\u6d4b",
      hint: "\u70b9\u51fb\u5706\u70b9\uff08\u6216\u7528 \u25c0 \u25b6\uff09\u67e5\u770b\u6761\u76ee\uff1b\u6309\u94ae\u6309\u7c7b\u578b\u7b5b\u9009\u3002",
      pre: "\u9884\u5370\u672c", pub: "\u5df2\u53d1\u8868", acc: "\u5df2\u63a5\u6536",
      ann: "\u516c\u544a / \u4ea7\u54c1\uff08\u516c\u53f8\u81ea\u8ff0\uff09",
      open: "\u6253\u5f00\u94fe\u63a5", count: "\u663e\u793a\u6761\u76ee\u6570", note: "\uff08\u6458\u8981\u4e3a\u82f1\u6587\uff09" },
    ja: { all: "\u3059\u3079\u3066", iv: "\u5bfe\u8a71\u578b\u52d5\u753b", g3: "3D/4D \u751f\u6210",
      rl: "\u6f5c\u5728\u7a7a\u9593 RL / \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8", je: "JEPA", ev: "\u8a55\u4fa1",
      hint: "\u70b9\u3092\u30bf\u30c3\u30d7\uff08\u307e\u305f\u306f \u25c0 \u25b6\uff09\u3059\u308b\u3068\u9805\u76ee\u3092\u8868\u793a\u3057\u307e\u3059\u3002" +
        "\u30dc\u30bf\u30f3\u3067\u7a2e\u985e\u3092\u7d5e\u308a\u8fbc\u3081\u307e\u3059\u3002",
      pre: "\u30d7\u30ec\u30d7\u30ea\u30f3\u30c8", pub: "\u767a\u8868\u6e08\u307f", acc: "\u63a1\u629e\u6e08\u307f",
      ann: "\u767a\u8868\u30fb\u88fd\u54c1\uff08\u4f01\u696d\u306e\u4e3b\u5f35\uff09",
      open: "\u30ea\u30f3\u30af\u3092\u958b\u304f", count: "\u8868\u793a\u4e2d\u306e\u9805\u76ee", note: "\uff08\u8981\u7d04\u306f\u82f1\u8a9e\uff09" }
  };

  var AX = "https://arxiv.org/abs/";
  // [year, month, type, name, status kind, status text, url, two-line summary]
  var D = [
    // interactive video world models and real-time video backbones
    [2024, 12, "iv", "Genie 2", "ann", "Google DeepMind blog", "https://deepmind.google/discover/blog/genie-2-a-large-scale-foundation-world-model/",
      "Autoregressive latent diffusion world model prompted by one image; keyboard/mouse control, about a minute of consistency."],
    [2025, 1, "iv", "Cosmos WFM platform", "pre", "arXiv 2501.03575", AX + "2501.03575",
      "NVIDIA's open world foundation models (diffusion and autoregressive), tokenizers and data pipeline for physical AI."],
    [2025, 3, "iv", "GAIA-2", "pre", "arXiv 2503.20523", AX + "2503.20523",
      "Wayve's multi-view, controllable latent diffusion world model for driving: ego actions, agents, weather and road layout."],
    [2025, 6, "iv", "Self Forcing", "pub", "NeurIPS 2025", AX + "2506.08009",
      "Trains a causal video diffusion model on its own rollouts (with KV cache) to close the train-test gap; real-time streaming."],
    [2025, 6, "iv", "Hunyuan-GameCraft", "pre", "arXiv 2506.17201", AX + "2506.17201",
      "Game-video world model: keyboard/mouse mapped to a shared camera space, hybrid history conditioning, distilled for speed."],
    [2025, 8, "iv", "Genie 3", "ann", "Google DeepMind blog", "https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/",
      "Text-prompted worlds, real time at 720p / 24 fps, consistent for a few minutes; promptable world events."],
    [2025, 8, "iv", "Yan", "pre", "arXiv 2508.08601", AX + "2508.08601",
      "Interactive video generation framework covering real-time simulation, multimodal prompting and text-driven editing of a game world."],
    [2025, 8, "iv", "Matrix-Game 2.0", "pre", "arXiv 2508.13009", AX + "2508.13009",
      "Open-source real-time streaming world model: few-step autoregressive diffusion distilled with a Self-Forcing-style recipe."],
    [2025, 9, "iv", "LongLive", "pre", "arXiv 2509.22622", AX + "2509.22622",
      "Frame-level AR video model with prompt switching; 1.3B model at 20.7 fps on one H100, videos up to 240 s."],
    [2025, 10, "iv", "RTFM (World Labs)", "ann", "World Labs blog", "https://worldlabs.ai/blog/rtfm",
      "Real-time frame model without explicit 3D: posed frames act as spatial memory ('context juggling'); runs on one H100."],
    [2025, 10, "iv", "Cosmos-Predict2.5 / Transfer2.5", "pre", "arXiv 2511.00062", AX + "2511.00062",
      "NVIDIA's second-generation Cosmos world simulation models: flow-based video model unifying text/image/video-to-world."],
    [2025, 12, "iv", "Runway GWM-1", "ann", "Runway research page", "https://runway.com/research/introducing-runway-gwm-1",
      "Autoregressive world model family on Gen-4.5: Worlds, Avatars and Robotics variants; 720p, up to 2 minutes."],
    [2025, 12, "iv", "WorldPlay", "pre", "arXiv 2512.14614", AX + "2512.14614",
      "Streaming video diffusion for real-time interaction: dual action representation, reconstituted context memory, context forcing."],
    [2026, 1, "iv", "Project Genie", "ann", "Google blog", "https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/",
      "Web prototype built on Genie 3, Nano Banana Pro and Gemini for AI Ultra subscribers; generations limited to 60 s."],
    [2026, 2, "iv", "Waymo World Model", "ann", "Waymo blog", "https://waymo.com/blog/2026/02/the-waymo-world-model-a-new-frontier-for-autonomous-driving-simulation",
      "Genie 3 post-trained for driving: generates camera and lidar, with action, layout and language control."],
    [2026, 2, "iv", "Causal Forcing", "pub", "ICML 2026", AX + "2602.02214",
      "Fixes the bidirectional-teacher gap of Self Forcing by initializing from an autoregressive teacher before DMD distillation."],
    [2026, 4, "iv", "Matrix-Game 3.0", "pre", "arXiv 2604.08995", AX + "2604.08995",
      "720p streaming world model with camera-aware memory retrieval; 5B model up to 40 fps, minute-long memory consistency."],
    [2026, 6, "iv", "Cosmos 3", "ann", "NVIDIA press release", "https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Launches-Cosmos-3-the-Open-Frontier-Foundation-Model-for-Physical-AI/default.aspx",
      "Open mixture-of-transformers 'omnimodel': reasoning transformer plus generation expert; text, video, sound and actions."],
    [2026, 7, "iv", "AlayaWorld", "pre", "arXiv 2607.18367", AX + "2607.18367",
      "15B AR video DiT at 24 fps (540p/720p): sink frame, compressed history, spatial memory, 4-step distilled chunks."],
    [2026, 8, "iv", "GAIA-4 (Wayve)", "ann", "Wayve blog", "https://wayve.ai/thinking/gaia-4/",
      "Closed-loop driving simulation from recorded logs: the driving policy stays in the loop; generates camera and radar."],
    [2026, 8, "iv", "ReWorld", "pre", "arXiv 2608.23565", AX + "2608.23565",
      "Bounded KV cache plus a pose-indexed landmark bank; 4-step streaming at 704x1280, revisits the start after 64 s rollouts."],
    [2026, 10, "iv", "Genie 4", "ann", "Google DeepMind blog", "https://deepmind.google/blog/genie-4-a-new-generation-of-world-simulation/",
      "Research preview with native audio and language steering via Gemini; coherent over short sessions (no specs published)."],
    // 3D / 4D world generation and feed-forward geometry
    [2025, 3, "g3", "VGGT", "pub", "CVPR 2025", AX + "2503.11651",
      "Feed-forward transformer predicting cameras, depth, point maps and tracks from many views in one pass."],
    [2025, 3, "g3", "GEN3C", "pub", "CVPR 2025", AX + "2503.03751",
      "Video generation guided by a 3D cache of unprojected depth: precise camera control and world consistency."],
    [2025, 3, "g3", "Bolt3D", "pub", "ICCV 2025", AX + "2503.14445",
      "Latent diffusion that directly outputs splatter images (Gaussians) for a scene in seconds, no per-scene optimization."],
    [2025, 6, "g3", "Voyager", "pre", "arXiv 2506.04225", AX + "2506.04225",
      "Jointly generates RGB and depth video along a camera path with a world cache, for explorable 3D scenes."],
    [2025, 7, "g3", "HunyuanWorld 1.0", "pre", "arXiv 2507.21809", AX + "2507.21809",
      "Text or image to explorable 3D worlds via a panoramic proxy, layered decomposition and mesh export."],
    [2025, 8, "g3", "Matrix-3D", "pre", "arXiv 2508.08086", AX + "2508.08086",
      "Omnidirectional explorable worlds: panoramic video diffusion then feed-forward or optimized 3D reconstruction."],
    [2025, 8, "g3", "4DNeX", "pre", "arXiv 2508.13154", AX + "2508.13154",
      "Feed-forward image-to-4D: fine-tunes a video model to output RGB plus XYZ point-map sequences."],
    [2025, 9, "g3", "Lyra", "pre", "arXiv 2509.19296", AX + "2509.19296",
      "Self-distills a camera-controlled video model into a 3D Gaussian decoder: 3D (and 4D) scenes without multi-view data."],
    [2025, 10, "g3", "FlashWorld", "pre", "arXiv 2510.13678", AX + "2510.13678",
      "Generates 3D Gaussian scenes directly in seconds, distilling multi-view-consistent quality into a 3D-oriented generator."],
    [2025, 11, "g3", "Marble (general release)", "ann", "World Labs blog", "https://worldlabs.ai/blog/marble-world-model",
      "Text, images, video or coarse 3D layout to editable worlds; exports Gaussian splats, meshes and video."],
    [2025, 11, "g3", "Depth Anything 3", "pre", "arXiv 2511.10647", AX + "2511.10647",
      "A plain transformer predicting depth and rays from any number of views; consistent geometry for reconstruction."],
    [2025, 11, "g3", "SAM 3D", "pre", "arXiv 2511.16624", AX + "2511.16624",
      "Meta's image-to-3D object model: shape, texture and layout from a single natural image."],
    [2026, 1, "g3", "Gen3R", "pre", "arXiv 2601.04090", AX + "2601.04090",
      "Aligns VGGT geometry latents with video-diffusion latents; outputs video plus cameras, depth and point clouds."],
    [2026, 4, "g3", "HY-World 2.0", "pre", "arXiv 2604.14268", AX + "2604.14268",
      "Tencent's reconstruct / generate / simulate framework producing navigable 3DGS worlds; feed-forward WorldMirror 2.0."],
    [2026, 6, "g3", "FLAT", "pre", "arXiv 2606.24876", AX + "2606.24876",
      "Decodes triangle splats directly from video-diffusion latents for geometrically accurate, engine-ready scenes."],
    [2026, 9, "g3", "Atlas (World Labs)", "ann", "World Labs blog", "https://worldlabs.ai/blog/atlas",
      "Multimodal AR diffusion transformer over posed images; outputs video, panoramas, point clouds or Gaussian splats."],
    [2026, 10, "g3", "L3G-World", "pre", "arXiv 2610.40614", AX + "2610.40614",
      "Latent 3D Gaussian memory that grows with scene extent, not stream length; real-time world generation at 9 fps."],
    // latent RL, agents and robot world models
    [2024, 11, "rl", "DINO-WM", "pre", "arXiv 2411.04983", AX + "2411.04983",
      "Dynamics model on frozen DINOv2 patch features; plans by optimizing actions toward a goal image's features."],
    [2025, 4, "rl", "DreamerV3 (Nature)", "pub", "Nature 2025", "https://doi.org/10.1038/s41586-025-08744-2",
      "Journal version of DreamerV3: one set of hyperparameters across 150+ tasks, diamonds in Minecraft from scratch."],
    [2025, 5, "rl", "DreamGen", "pre", "arXiv 2505.12705", AX + "2505.12705",
      "Fine-tunes video world models on a robot, generates 'neural trajectories', labels actions, trains policies on them."],
    [2025, 9, "rl", "Dreamer 4", "pre", "arXiv 2509.24527", AX + "2509.24527",
      "Scalable transformer world model with shortcut forcing; RL purely in imagination gets Minecraft diamonds from offline data."],
    [2025, 10, "rl", "Ctrl-World", "pre", "arXiv 2510.10125", AX + "2510.10125",
      "Multi-view action-conditioned world model on DROID for evaluating and improving generalist robot policies in imagination."],
    [2026, 2, "rl", "DreamZero", "pre", "arXiv 2602.15922", AX + "2602.15922",
      "World action model on a video diffusion backbone that predicts video and actions jointly; 14B model, 7 Hz control."],
    [2026, 3, "rl", "Fast-WAM", "pre", "arXiv 2603.16666", AX + "2603.16666",
      "Keeps video co-training but skips future-frame generation at test time; competitive and over 4x faster."],
    // JEPA family
    [2025, 6, "je", "V-JEPA 2 / V-JEPA 2-AC", "pre", "arXiv 2506.09985", AX + "2506.09985",
      "Video JEPA pretrained on 1M+ hours; an action-conditioned head on <62 h of robot video plans zero-shot pick-and-place."],
    [2025, 7, "je", "DINO-world", "pre", "arXiv 2507.19468", AX + "2507.19468",
      "Generalist video world model that predicts future frames in the latent space of a frozen DINOv2 encoder."],
    [2025, 11, "je", "LeJEPA", "pre", "arXiv 2511.08544", AX + "2511.08544",
      "JEPA without heuristics: SIGReg pushes embeddings toward an isotropic Gaussian; no EMA teacher or stop-gradient."],
    [2025, 12, "je", "VL-JEPA", "pre", "arXiv 2512.10942", AX + "2512.10942",
      "Vision-language JEPA that predicts continuous text embeddings instead of tokens; decodes text only when needed."],
    [2026, 3, "je", "LeWorldModel", "pre", "arXiv 2603.19312", AX + "2603.19312",
      "End-to-end JEPA world model from pixels with two loss terms; ~15M parameters, plans up to 48x faster."],
    [2026, 3, "je", "V-JEPA 2.1", "pre", "arXiv 2603.14482", AX + "2603.14482",
      "Adds dense prediction losses and joint image-video training; better dense features and robot grasping than V-JEPA 2-AC."],
    // evaluation
    [2025, 1, "ev", "Physics-IQ", "pub", "WACV 2026", AX + "2501.09038",
      "Real videos of physical experiments; models must continue them. Physical understanding is limited and unrelated to realism."],
    [2025, 2, "ev", "WorldModelBench", "pre", "arXiv 2502.20694", AX + "2502.20694",
      "Judges video generators as world models: instruction following and physics adherence, with a fine-tuned VLM judge."],
    [2025, 3, "ev", "VideoPhy-2", "pre", "arXiv 2503.06800", AX + "2503.06800",
      "Action-centric physical-commonsense benchmark for video generation with human and automatic evaluation."],
    [2025, 4, "ev", "WorldScore", "pub", "ICCV 2025", AX + "2504.00983",
      "Unified benchmark for world generation as camera-specified next-scene generation: controllability, quality, dynamics."],
    [2025, 6, "ev", "IntPhys 2", "pre", "arXiv 2506.09849", AX + "2506.09849",
      "Violation-of-expectation benchmark for intuitive physics in complex synthetic scenes; models near chance."],
    [2025, 9, "ev", "Video models are zero-shot learners", "pre", "arXiv 2509.20328", AX + "2509.20328",
      "Probes Veo 3 on perception, modeling, manipulation and reasoning tasks it was never trained for."],
    [2025, 10, "ev", "World-in-World", "pub", "ICLR 2026 (oral)", AX + "2510.18135",
      "Closed-loop evaluation: world models judged by the task success they give an embodied agent, not by visual quality."],
    [2026, 4, "ev", "WorldMark", "pre", "arXiv 2604.21686", AX + "2604.21686",
      "Same WASD-style controls for ten interactive models via adapters; control metrics such as latency and stability."],
    [2026, 5, "ev", "WBench", "pre", "arXiv 2605.25874", AX + "2605.25874",
      "Multi-turn interactive benchmark: 289 cases, 1,058 turns, 22 sub-metrics; no model leads on every dimension."],
    [2026, 5, "ev", "WorldArena 2.0", "pre", "arXiv 2605.17912", AX + "2605.17912",
      "Embodied world-model benchmark extended to visuotactile input, world models as RL environments and many robots."],
    [2026, 6, "ev", "WRBench (persistent state)", "pre", "arXiv 2606.20545", AX + "2606.20545",
      "Uses camera motion to hide events: 23 models usually resume a hidden event where it was left instead of advancing it."],
    [2026, 6, "ev", "Echo-Memory", "pre", "arXiv 2606.09803", AX + "2606.09803",
      "Controlled study of memory designs in action world models: raw context strong, block-wise SSM recurrence best for return."],
    [2026, 10, "ev", "World Models' Last Exam in Physics", "pre", "arXiv 2610.08791", AX + "2610.08791",
      "40 measurement-based physics tasks without reference videos; best of eight generators scores 57.76 / 100."]
  ];
  D.forEach(function (d) { d.t = d[0] + (d[1] - 0.5) / 12; });
  D.sort(function (a, b) { return a.t - b.t; });

  function init(el) {
    var L = TXT[el.dataset.lang] || TXT.en;
    el.innerHTML = ""; el.style.background = "#fff"; el.style.color = "#222";
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;padding:10px 10px 4px;font:13px sans-serif";
    el.appendChild(bar);
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;margin:0 auto;max-width:100%;touch-action:manipulation;cursor:pointer";
    el.appendChild(canvas);
    var nav = document.createElement("div");
    nav.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:4px 10px;font:13px sans-serif;color:#555";
    el.appendChild(nav);
    var info = document.createElement("div");
    info.style.cssText = "padding:4px 12px 12px;font:14px/1.5 sans-serif;min-height:96px";
    el.appendChild(info);

    var filter = "all", sel = -1, W = 400, H = 300, pts = [], lastW = -1;
    var ctx = canvas.getContext("2d");
    var btns = {};
    function mkBtn(key, label, col) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      b.style.cssText = "border:1.5px solid " + col + ";border-radius:14px;padding:3px 10px;font:13px sans-serif;cursor:pointer;background:#fff;color:" + col;
      b.addEventListener("click", function () { filter = key; sel = -1; lastW = -1; resize(); });
      bar.appendChild(b); btns[key] = [b, col];
    }
    mkBtn("all", L.all, "#333");
    TYPES.forEach(function (k) { mkBtn(k, L[k], COL[k]); });
    function mkNav(label, dir) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      b.style.cssText = "border:1px solid #bbb;border-radius:6px;padding:2px 12px;background:#f7f7f7;font:14px sans-serif;cursor:pointer";
      b.addEventListener("click", function () { step(dir); });
      nav.appendChild(b);
    }
    mkNav("\u25c0", -1); mkNav("\u25b6", 1);
    var cnt = document.createElement("span"); nav.appendChild(cnt);

    function visible() { return D.filter(function (d) { return filter === "all" || d[2] === filter; }); }
    function xOf(t) { return 10 + (t - X0) / (X1 - X0) * (W - 20); }

    function layout() {
      W = Math.max(260, (el.clientWidth || 400) - 2);
      var r = W < 500 ? 6 : 7, lanes = filter === "all" ? TYPES : [filter];
      var y = 8; pts = [];
      lanes.forEach(function (k) {
        var items = D.filter(function (d) { return d[2] === k; }), rows = [];
        var top = y + 16;
        items.forEach(function (d) {
          var x = xOf(d.t), row = 0;
          while (rows[row] !== undefined && rows[row] > x - 2 * r - 3) row++;
          rows[row] = x;
          pts.push({ d: d, x: x, y: top + r + row * (2 * r + 3), r: r, lane: k });
        });
        pts.push({ laneLabel: k, y: y + 11 });
        y = top + Math.max(1, rows.length) * (2 * r + 3) + 8;
      });
      H = y + 26;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      Object.keys(btns).forEach(function (k) {
        var b = btns[k][0], c = btns[k][1], on = k === filter;
        b.style.background = on ? c : "#fff"; b.style.color = on ? "#fff" : c;
      });
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      // quarter grid and year labels
      for (var yr = 2025; yr <= 2026; yr++) {
        for (var q = 0; q < 4; q++) {
          var x = xOf(yr + q / 4);
          ctx.strokeStyle = q === 0 ? "#bbb" : "#eee"; ctx.lineWidth = q === 0 ? 1.5 : 1;
          ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, H - 20); ctx.stroke();
        }
        ctx.fillStyle = "#444"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(String(yr), xOf(yr) + 3, H - 6);
      }
      var xn = xOf(2026 + 10.07 / 12);
      ctx.strokeStyle = "#999"; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(xn, 4); ctx.lineTo(xn, H - 20); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#777"; ctx.font = "11px sans-serif"; ctx.textAlign = "right"; ctx.fillText("2026-11", xn - 2, H - 6);
      pts.forEach(function (p) {
        if (p.laneLabel) {
          ctx.fillStyle = COL[p.laneLabel]; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "left";
          ctx.fillText(L[p.laneLabel], 10, p.y);
          return;
        }
        var c = COL[p.d[2]], s = p.d === (sel >= 0 ? D[sel] : null);
        ctx.beginPath(); ctx.arc(p.x, p.y, s ? p.r + 2 : p.r, 0, 2 * Math.PI);
        ctx.fillStyle = p.d[4] === "ann" ? "#fff" : c; ctx.fill();
        ctx.lineWidth = s ? 3 : 1.8; ctx.strokeStyle = s ? "#111" : c; ctx.stroke();
      });
      var vis = visible();
      cnt.textContent = L.count + ": " + vis.length + "   \u25cf " + L.pre + "/" + L.pub + "   \u25cb " + L.ann.split(" ")[0];
      if (sel < 0) { info.innerHTML = '<span style="color:#666">' + L.hint + "</span>"; return; }
      var d = D[sel], kind = L[d[4]];
      info.innerHTML = '<b style="color:' + COL[d[2]] + '">' + d[3] + "</b> &nbsp;<span style=\"color:#666\">" +
        d[0] + "-" + (d[1] < 10 ? "0" : "") + d[1] + " \u00b7 " + L[d[2]] + "</span><br>" +
        "<span style=\"font-size:13px\">" + kind + ": " + d[5] + "</span><br>" + d[7] +
        (L.note ? ' <span style="color:#888;font-size:12px">' + L.note + "</span>" : "") +
        '<br><a href="' + d[6] + '" target="_blank" rel="noopener">' + L.open + " \u2197</a>";
    }

    function step(dir) {
      var vis = visible(); if (!vis.length) return;
      var i = sel >= 0 ? vis.indexOf(D[sel]) : -1;
      i = i < 0 ? (dir > 0 ? 0 : vis.length - 1) : (i + dir + vis.length) % vis.length;
      sel = D.indexOf(vis[i]); draw();
    }
    function pick(ev) {
      var rc = canvas.getBoundingClientRect(), sc = rc.width > 0 ? W / rc.width : 1;
      var x = (ev.clientX - rc.left) * sc, y = (ev.clientY - rc.top) * sc;
      var best = -1, bd = 18 * 18;
      pts.forEach(function (p) {
        if (p.laneLabel) return;
        var dd = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (dd < bd) { bd = dd; best = D.indexOf(p.d); }
      });
      if (best >= 0) { sel = best; draw(); }
    }
    canvas.addEventListener("pointerdown", pick);
    function resize() { var w = el.clientWidth || 400; if (w === lastW) return; lastW = w; layout(); draw(); }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el); else window.addEventListener("resize", resize);
    resize();
  }

  function boot() {
    var els = document.querySelectorAll('[data-widget="world-models-timeline"]');
    for (var i = 0; i < els.length; i++) init(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
