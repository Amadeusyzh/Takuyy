// Paper Digest explorer (paper-digest issue 01, October - early November 2026).
// Filter the papers of this issue by category and by their connection to computer graphics,
// scrub along the timeline, and tap a paper to read its summary and open its links.
// The metadata below mirrors bin/figures/paper-digest/data/01-papers.json. The localized summary
// shown in the card is read from the post itself (heading id "pd-NN"); the English text "s" is a fallback.
(function () {
  "use strict";
  // BEGIN DATA
  var ISSUE = { start: "2026-10-01", end: "2026-11-02" };
  // g: connection to CG. R representation, N rendering, G geometry, S simulation, A animation, I interaction.
  var AX = "https://arxiv.org/abs/";
  var P = [
    { n: 1, c: 0, t: "Tabula Rasa: Monte Carlo estimation of unit-variance noise with controlled spatio-temporal correlation", a: "T. Ritschel et al.", v: "SIGGRAPH Asia 2026", d: "2026-10-08", g: "N", u: AX + "2610.11653", code: "https://github.com/facebookresearch/Tabula-Rasa",
      s: "Generates unit-variance noise with controlled spatio-temporal correlation by jointly estimating a reconstruction and its variance with sketching." },
    { n: 2, c: 0, t: "DiffGIPC: Differentiable Mixed-Coordinate Contact Dynamics on GPU", a: "K. Huang et al.", v: "preprint", d: "2026-10-13", g: "GS", u: AX + "2610.19091",
      s: "Differentiable IPC on the GPU with affine bodies coupled to FEM through one adjoint system per frame." },
    { n: 3, c: 0, t: "Neuroll: Real-Time Neural Strand-Based Hair Simulation via Simulator-in-the-Loop Unrolling", a: "G. W.-C. Lin et al.", v: "preprint", d: "2026-10-03", g: "SA", u: AX + "2610.04689",
      s: "A neural time integrator for hair strands, trained with the simulator in the loop over random unroll horizons." },
    { n: 4, c: 0, t: "PhysSkin++: Real-Time and Generalizable Physics-Based Animation via Self-Supervised Neural Skinning", a: "Y. Lei et al.", v: "preprint", d: "2026-10-19", g: "RSA", u: AX + "2610.26067", proj: "https://zju3dv.github.io/PhysSkin_plus/",
      s: "Predicts a neural skinning field, and so a reduced elastic subspace, for unseen shapes in one forward pass." },
    { n: 5, c: 0, t: "Total Deformation-based MPM for Perfectly Elastic Solid Simulation with Strong Deformations", a: "T. B\u00f6ttcher et al.", v: "preprint", d: "2026-10-27", g: "S", u: AX + "2610.36945",
      s: "MPM that derives deformation from particle positions against a reference grid, avoiding numerical fracture." },
    { n: 6, c: 0, t: "Walk on Multiscale Media: Compiling Editable and Composable Transport Medium Prefabs for Monte Carlo PDE Solvers", a: "Y. Liao et al.", v: "preprint", d: "2026-10-24", g: "GS", u: AX + "2610.35952",
      s: "Precompiled medium prefabs let Walk-on-Spheres jump across fine-scale heterogeneous media and support interactive edits." },
    { n: 7, c: 0, t: "Dynamic Skinning: Kinematics-Driven Cartoon Effects for Articulated Characters", a: "D. Rohmer et al.", v: "IEEE TVCG 2026", d: "2026-10-29", g: "GA", u: AX + "2610.40976", proj: "https://velocityskinning.com/",
      s: "Closed-form deformers driven by vertex velocities add jiggle and waves on top of skinning, without simulation." },
    { n: 8, c: 1, t: "Windfoil: Closed-Form Coverage for Real-Time and Differentiable Vector Graphics", a: "M. DesLauriers", v: "preprint", d: "2026-10-01", g: "NG", u: AX + "2610.02468",
      s: "Closed-form box-filtered winding numbers of quadratic Bezier contours on WebGPU, for rendering and optimization." },
    { n: 9, c: 1, t: "SteadySplats: Resampling of Low-Variance Gaussians for High-Fidelity Stochastic Rendering", a: "F. Windisch et al.", v: "preprint", d: "2026-10-04", g: "RN", u: AX + "2610.05576",
      s: "Sort-free stochastic transparency for 3DGS with spatial and temporal resampling and a variance regularizer." },
    { n: 10, c: 1, t: "Real-time Rendering of Pre-integrated Neural Emitters", a: "A. Coomans et al.", v: "preprint", d: "2026-10-05", g: "RN", u: AX + "2610.06762",
      s: "Neural Emission Fields bake the direct lighting of complex emitters into a network evaluated once per shading point." },
    { n: 11, c: 1, t: "Masking Judder in Foveated Rendering with Phase-Shifted Noise", a: "V. Cantory et al.", v: "preprint", d: "2026-10-07", g: "NI", u: AX + "2610.10811",
      s: "Phase-shifted Gabor noise hides judder from reduced peripheral frame rates in foveated rendering." },
    { n: 12, c: 1, t: "Neural Caching of Prefiltered Radiance for Specular Lighting", a: "D. Klepikov, V. Frolov", v: "preprint", d: "2026-10-08", g: "RN", u: AX + "2610.11702",
      s: "A neural radiance cache that predicts prefiltered radiance and uses the split-sum approximation for glossy surfaces." },
    { n: 13, c: 1, t: "A Hybrid and Hierarchical Ray Tracing Method for Efficient 3D Gaussian Rendering", a: "T. Zhao et al.", v: "preprint", d: "2026-10-09", g: "RN", u: AX + "2610.13498",
      s: "H2-Ray: algorithm-hardware co-design for ray-traced Gaussians on RT-core-style units." },
    { n: 14, c: 1, t: "Geometric Queries on Tessellation-Free Displaced Surfaces", a: "B. Xu et al.", v: "preprint", d: "2026-10-15", g: "NG", u: AX + "2610.21584",
      s: "Affine height planes with residual bounds answer sampling, specular and closest-point queries on displaced surfaces." },
    { n: 15, c: 2, t: "X-Splat: Unified Gaussian Splatting for Joint RGB and X-ray 3D Reconstruction", a: "W. Xu et al.", v: "SIGGRAPH Asia 2026", d: "2026-10-16", g: "RNG", u: AX + "2610.23237", proj: "https://zezeaaa.github.io/X-Splat/",
      s: "One Gaussian geometry explains both RGB photos and X-ray images of an object." },
    { n: 16, c: 2, t: "SwitchSplat: Learning Discrete Object States from Casually Captured Scenes", a: "Y. Xie et al.", v: "SIGGRAPH Asia 2026", d: "2026-10-17", g: "RNI", u: AX + "2610.24812", proj: "https://switchsplat.github.io",
      s: "Gaussian scenes whose objects can be switched between discrete states learned from casual captures." },
    { n: 17, c: 2, t: "Holo4D: Holistic 4D Reconstruction as Geometric Control for Video Diffusion", a: "Y. Lan et al.", v: "NeurIPS 2026", d: "2026-10-18", g: "NGA", u: AX + "2610.25276", proj: "https://nirvanalan.github.io/projects/holo4d/",
      s: "A reconstructed 4D point scaffold, projected into a new camera, guides video diffusion to reshoot a video." },
    { n: 18, c: 2, t: "RealMe: Immersive Volumetric Video from Minimal Captures", a: "C. Zhou et al.", v: "SIGGRAPH Asia 2026", d: "2026-10-21", g: "RNA", u: AX + "2610.30023", proj: "https://zju3dv.github.io/realme",
      s: "Video diffusion densifies sparse low-resolution captures into 2K multi-view video for volumetric reconstruction." },
    { n: 19, c: 2, t: "RADIANT: Object-Centric Feed-Forward Global Illumination", a: "S. Zhang et al.", v: "preprint", d: "2026-10-23", g: "RNG", u: AX + "2610.32075",
      s: "A transformer with SE(3)-invariant form-factor attention over per-object patch tokens predicts global illumination." },
    { n: 20, c: 2, t: "FL4N: Feed-forward Latent Model for 4D Novel View Synthesis", a: "E. Hong et al.", v: "preprint", d: "2026-10-26", g: "RNA", u: AX + "2610.35854", code: "https://cvlab-kaist.github.io/FL4N/",
      s: "Feed-forward 4D novel view synthesis with a space-time latent built as residuals on a static prior." },
    { n: 21, c: 2, t: "LucidLyra: Feed-Forward Generative 3D Scene Reconstruction and Joint Understanding via Multi-Task Distillation", a: "O. Hahn et al.", v: "preprint", d: "2026-10-29", g: "RNG", u: AX + "2610.40495", proj: "https://research.nvidia.com/labs/sil/projects/lucidlyra",
      s: "One forward pass predicts Gaussians with geometry, colour, semantics and instance features from video latents." },
    { n: 22, c: 3, t: "Orbia: Do Generated Videos Form a Consistent 3D World?", a: "D. Lu et al.", v: "technical report", d: "2026-10-14", g: "NG", u: AX + "2610.20693", code: "https://github.com/worldbench/Orbia", proj: "https://orbia-bench.github.io/",
      s: "A benchmark that measures 3D consistency of world models under explore-and-revisit camera paths." },
    { n: 23, c: 3, t: "Matrix-Game 4.0: Harnessing Video Models for Real-Time Playable Game Worlds", a: "J. Zhang et al.", v: "preprint", d: "2026-10-20", g: "NSI", u: AX + "2610.27999", code: "https://github.com/SkyworkAI/Matrix-Game", proj: "https://matrix-game-v4-0.github.io/page/",
      s: "An explicit game engine holds state and rules; a distilled video model re-renders its low-poly proxies in real time." },
    { n: 24, c: 3, t: "Rethinking Video Autoencoders for Interactive World Models", a: "A. Ramanana Rahary et al.", v: "preprint", d: "2026-10-21", g: "RI", u: AX + "2610.30129", proj: "https://kyutai.org/blog/2026-10-21-cadre",
      s: "CADRE autoencoders map the latency-quality frontier of world models across compression levels." },
    { n: 25, c: 3, t: "World-in-Context: Interactive Video World Modeling with In-Context Conditioning", a: "H. H. Chen et al.", v: "preprint", d: "2026-10-23", g: "SI", u: AX + "2610.33169", proj: "https://haroldchen19.github.io/WiC-site/",
      s: "View, action and camera controls become tokens in one attention space, with a control-aware RoPE." },
    { n: 26, c: 3, t: "BoxWorld: Let World Engines Control and Video Generators Render", a: "Z. Wu et al.", v: "preprint", d: "2026-10-26", g: "NSI", u: AX + "2610.36371", proj: "https://boxworld-web.github.io",
      s: "An agent-written box engine owns object states; a generative renderer turns the box stream into video." },
    { n: 27, c: 3, t: "SWIM: Learning What Matters from Behaviors for JEPA World Models", a: "J. Hu et al.", v: "preprint", d: "2026-10-27", g: "RS", u: AX + "2610.36662",
      s: "Inverse dynamics learns per-feature state weights for state-supervised JEPA world models." },
    { n: 28, c: 3, t: "L3G-World: Real-Time Infinite World Generation with Latent 3D Gaussian Memory", a: "J. Choi et al.", v: "preprint", d: "2026-10-29", g: "RNGI", u: AX + "2610.40614", proj: "https://cvlab-kaist.github.io/L3G-World/",
      s: "A memory of Gaussians carrying VAE latents is splatted straight into the video DiT's latent space." },
    { n: 29, c: 4, t: "Splat2Act: From Captured Scenes to Personalized VLA Manipulation", a: "X. Ye et al.", v: "preprint", d: "2026-10-09", g: "RNS", u: AX + "2610.13945", proj: "https://splat2act.github.io",
      s: "Phone scans become 3DGS digital twins in which a VLA is personalized to the user's own building." },
    { n: 30, c: 4, t: "Learning Adaptable Dexterous Skills via Hybrid Dexterous Mimicking", a: "Y. Kuang et al.", v: "preprint", d: "2026-10-20", g: "SA", u: AX + "2610.28628", proj: "https://yuxuank.com/AdaDex/",
      s: "One policy trained in tracking and generalization environments turns a single hand-object clip into an adaptable skill." },
    { n: 31, c: 4, t: "SuperMimic: Scaling Humanoid Whole-Body Control with One Differentiable World Model", a: "Q. Liao et al.", v: "CoRL 2026 (oral)", d: "2026-10-20", g: "SA", u: AX + "2610.28480", proj: "https://supermimic.github.io",
      s: "A learned differentiable world model gives analytic policy gradients for tracking over 129k human motions." },
    { n: 32, c: 4, t: "HyperDrone: Simulation-to-Reality Transfer at Millions of Frames per Second", a: "J. Eschmann et al.", v: "CoRL 2026", d: "2026-10-20", g: "NS", u: AX + "2610.28950",
      s: "A batched GPU quadrotor simulator with a built-in ray-tracing renderer for vision-based policies." },
    { n: 33, c: 4, t: "Real2Sem2Real: 3D Semantic Augmentations for Robot Learning from a Single Human RGB Demonstration", a: "M. Strong et al.", v: "preprint", d: "2026-10-20", g: "RGS", u: AX + "2610.28880", proj: "https://real2sem2real.github.io/",
      s: "Feature-distilled splats and part-aligned digital cousins turn one human video into thousands of robot demos." },
    { n: 34, c: 4, t: "Zero-HLM: Generalizable Humanoid Loco-Manipulation without Real Robot Data", a: "D. Yang et al.", v: "preprint", d: "2026-10-26", g: "RGS", u: AX + "2610.35075", proj: "https://young-bit.github.io/zero-hlm/",
      s: "Smartphone captures and simulated demonstrations train a humanoid policy that transfers zero-shot to a Unitree G1." },
    { n: 35, c: 4, t: "TAPESTRY: A Single Backbone for Video Generation and Robot Control", a: "J. A. Collins et al.", v: "CoRL 2026", d: "2026-10-27", g: "RS", u: AX + "2610.36823", proj: "https://tapestry-wam.github.io",
      s: "Actions become one-patch tokens of a video diffusion backbone; one DDIM step yields an action chunk." },
    { n: 36, c: 5, t: "HoOPOE: A Holography-Optimized Perceptual ObjectivE function", a: "E. Chen et al.", v: "SIGGRAPH Asia 2026", d: "2026-10-12", g: "NI", u: AX + "2610.17474",
      s: "A perceptual loss for computer-generated holography that targets visible speckle." },
    { n: 37, c: 5, t: "FlowAvatar: Real-Time Full-Body Avatars from Sparse Egocentric Inputs on Consumer XR Devices", a: "C. Gao et al.", v: "IEEE ISMAR 2026", d: "2026-10-12", g: "RAI", u: AX + "2610.16277", code: "https://github.com/SPICExLAB/FlowAvatar",
      s: "Full-body, face and gaze avatars on a standalone headset from sparse egocentric signals." },
    { n: 38, c: 5, t: "SplatXR: A Toolkit for Multi-Layered Extended Reality via On-Headset 3D Gaussian Splatting", a: "C. Vachha et al.", v: "UIST 2026", d: "2026-10-19", g: "RNGSI", u: AX + "2610.26338", proj: "https://splatxr.github.io",
      s: "A Unity toolkit that makes splats first-class XR content with meshes for shadows and physics." },
    { n: 39, c: 5, t: "V-JEPA Hand: Simple, Accurate and Fast 3D Hand and Camera Trajectory Recovery from Egocentric Videos", a: "R. Li et al.", v: "preprint", d: "2026-10-19", g: "GAI", u: AX + "2610.26780", proj: "https://qft-333.github.io/V-JEPA-Hand-Page/",
      s: "A V-JEPA encoder and query predictor recover both hands and the camera in a world frame in one pass." },
    { n: 40, c: 5, t: "Bringing physics-based controller policies to virtual reality", a: "J. Llobera et al.", v: "preprint", d: "2026-10-19", g: "SAI", u: AX + "2610.26278",
      s: "DeepMimic, AMP and ADD trained in MuJoCo-MJX and exported to Unity3D and WebXR." },
    { n: 41, c: 5, t: "GenXR-Bench: Benchmarking Coding Agents for Interactive XR Development", a: "W. Huang et al.", v: "preprint", d: "2026-10-21", g: "I", u: AX + "2610.29014", code: "https://github.com/whuang37/genxr-bench",
      s: "112 XR development tasks with interaction tests for coding agents." },
    { n: 42, c: 5, t: "DomeGS: Perceptually Consistent Background Completion for Unbounded 3D Gaussian Splatting in Virtual Reality", a: "A. Pechko et al.", v: "preprint", d: "2026-10-27", g: "RNI", u: AX + "2610.37172",
      s: "Completes sky and horizon inside the 3DGS scene instead of a skybox, evaluated by presence in VR." }
  ];
  // END DATA

  var CATS = [
    { k: "GFX", col: "#9467bd" }, { k: "ENG", col: "#ff7f0e" }, { k: "NR", col: "#1f77b4" },
    { k: "WM", col: "#2ca02c" }, { k: "EAI", col: "#d62728" }, { k: "XR", col: "#0f9fb0" }
  ];
  var TAGS = ["R", "N", "G", "S", "A", "I"];
  var TXT = {
    en: {
      help: "Tap categories or a CG link to filter. Tap or drag across the dots, or tap a title, to read the summary.",
      all: "All", cg: "CG link:", none: "No paper matches this filter.", shown: "papers shown",
      jump: "Jump to entry", code: "Code", proj: "Project", paper: "Paper",
      cats: ["Graphics", "Engines & real-time", "Neural rendering", "World models", "Embodied AI", "HCI / XR"],
      tags: ["representation", "rendering", "geometry", "simulation", "animation", "interaction"]
    },
    // Non-ASCII text is written as @XXXX (hex UTF-16 code unit) and decoded by dec() below,
    // which keeps this file ASCII-only.
    zh: {
      help: "\u70b9\u51fb\u7c7b\u522b\u6216 CG \u5173\u8054\u8fdb\u884c\u7b5b\u9009\uff1b\u70b9\u51fb\u6216\u6ed1\u8fc7\u5706\u70b9\u3001\u6216\u70b9\u51fb\u6807\u9898\u67e5\u770b\u6458\u8981\u3002",
      all: "\u5168\u90e8", cg: "CG \u5173\u8054\uff1a", none: "\u6ca1\u6709\u7b26\u5408\u7b5b\u9009\u7684\u8bba\u6587\u3002",
      shown: "\u7bc7\u8bba\u6587", jump: "\u8df3\u5230\u6b63\u6587\u6761\u76ee", code: "\u4ee3\u7801",
      proj: "\u9879\u76ee\u9875", paper: "\u8bba\u6587",
      cats: ["\u56fe\u5f62\u5b66", "\u5f15\u64ce\u4e0e\u5b9e\u65f6", "\u795e\u7ecf\u6e32\u67d3", "\u4e16\u754c\u6a21\u578b",
        "\u5177\u8eab\u667a\u80fd", "HCI / XR"],
      tags: ["\u8868\u793a", "\u6e32\u67d3", "\u51e0\u4f55", "\u4eff\u771f", "\u52a8\u753b", "\u4ea4\u4e92"]
    },
    ja: {
      help: "\u30ab\u30c6\u30b4\u30ea\u3084 CG \u3068\u306e\u95a2\u4fc2\u3092\u30bf\u30c3\u30d7\u3057\u3066\u7d5e\u308a\u8fbc\u307f\u307e\u3059\u3002" +
        "\u70b9\u3092\u30bf\u30c3\u30d7\u307e\u305f\u306f\u30c9\u30e9\u30c3\u30b0\u3059\u308b\u304b\u3001\u30bf\u30a4\u30c8\u30eb\u3092" +
        "\u30bf\u30c3\u30d7\u3059\u308b\u3068\u8981\u7d04\u304c\u8868\u793a\u3055\u308c\u307e\u3059\u3002",
      all: "\u3059\u3079\u3066", cg: "CG \u3068\u306e\u95a2\u4fc2\uff1a",
      none: "\u6761\u4ef6\u306b\u5408\u3046\u8ad6\u6587\u306f\u3042\u308a\u307e\u305b\u3093\u3002", shown: "\u672c\u3092\u8868\u793a",
      jump: "\u672c\u6587\u306e\u9805\u76ee\u3078", code: "\u30b3\u30fc\u30c9", proj: "\u30d7\u30ed\u30b8\u30a7\u30af\u30c8",
      paper: "\u8ad6\u6587",
      cats: ["\u30b0\u30e9\u30d5\u30a3\u30c3\u30af\u30b9", "\u30a8\u30f3\u30b8\u30f3\u30fb\u30ea\u30a2\u30eb\u30bf\u30a4\u30e0",
        "\u30cb\u30e5\u30fc\u30e9\u30eb\u30ec\u30f3\u30c0\u30ea\u30f3\u30b0", "\u4e16\u754c\u30e2\u30c7\u30eb",
        "\u8eab\u4f53\u6027 AI", "HCI / XR"],
      tags: ["\u8868\u73fe", "\u30ec\u30f3\u30c0\u30ea\u30f3\u30b0", "\u5e7e\u4f55", "\u30b7\u30df\u30e5\u30ec\u30fc\u30b7\u30e7\u30f3",
        "\u30a2\u30cb\u30e1\u30fc\u30b7\u30e7\u30f3", "\u30a4\u30f3\u30bf\u30e9\u30af\u30b7\u30e7\u30f3"]
    }
  };
  function dec(s) {
    return s.replace(/@([0-9a-f]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
  }
  function decAll(o) {
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (typeof o[k] === "string") o[k] = dec(o[k]);
      else if (o[k] && typeof o[k] === "object") decAll(o[k]);
    }
  }
  decAll(TXT);
  P.forEach(function (p) { p.a = dec(p.a); });
  var DOT = dec(" \u00b7 ");
  var SVGNS = "http://www.w3.org/2000/svg";

  function dayIndex(s) {
    var p = s.split("-");
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000;
  }
  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }
  function sv(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function chip(label, color) {
    var b = el("button", "font:inherit;font-size:13px;line-height:1.2;padding:5px 10px;border-radius:999px;" +
      "border:1.5px solid " + color + ";cursor:pointer;touch-action:manipulation;white-space:nowrap", label);
    b.type = "button";
    b._col = color;
    return b;
  }
  function setChip(b, on) {
    b.style.background = on ? b._col : "#fff";
    b.style.color = on ? "#fff" : "#222";
  }

  // Localized summary from the post: the list items "what it does" and "what is new" under heading #pd-NN.
  function pageSummary(n) {
    var h = document.getElementById("pd-" + (n < 10 ? "0" : "") + n);
    if (!h) return null;
    var node = h.nextElementSibling, guard = 0;
    while (node && guard < 6 && !/^H[1-3]$/.test(node.tagName)) {
      if (node.tagName === "UL") {
        var li = node.querySelectorAll(":scope > li");
        var parts = [];
        if (li[0]) parts.push(li[0].textContent.trim());
        if (li[2]) parts.push(li[2].textContent.trim());
        return parts.length ? parts.join(" ") : null;
      }
      node = node.nextElementSibling;
      guard++;
    }
    return null;
  }

  function build(root) {
    var lang = TXT[root.dataset.lang] ? root.dataset.lang : "en";
    var T = TXT[lang];
    root.innerHTML = "";
    var box = el("div", "background:#fff;color:#222;border:1px solid #ddd;border-radius:10px;padding:10px;" +
      "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;box-sizing:border-box;max-width:100%");
    root.appendChild(box);
    box.appendChild(el("div", "font-size:13px;color:#555;margin-bottom:8px", T.help));

    var catOn = [true, true, true, true, true, true];
    var tagSel = -1;
    var current = -1;

    var row1 = el("div", "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px");
    var allBtn = chip(T.all, "#444");
    row1.appendChild(allBtn);
    var catBtns = CATS.map(function (c, i) {
      var b = chip(T.cats[i], c.col);
      row1.appendChild(b);
      b.addEventListener("click", function () {
        var allOn = catOn.every(function (v) { return v; });
        if (allOn) { for (var j = 0; j < 6; j++) catOn[j] = (j === i); }
        else { catOn[i] = !catOn[i]; if (!catOn.some(function (v) { return v; })) catOn[i] = true; }
        refresh();
      });
      return b;
    });
    allBtn.addEventListener("click", function () { for (var j = 0; j < 6; j++) catOn[j] = true; tagSel = -1; refresh(); });
    box.appendChild(row1);

    var row2 = el("div", "display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px");
    row2.appendChild(el("span", "font-size:13px;color:#555", T.cg));
    var tagBtns = TAGS.map(function (t, i) {
      var b = chip(T.tags[i], "#555");
      row2.appendChild(b);
      b.addEventListener("click", function () { tagSel = (tagSel === i) ? -1 : i; refresh(); });
      return b;
    });
    box.appendChild(row2);

    var svgWrap = el("div", "width:100%;touch-action:pan-y;user-select:none;-webkit-user-select:none");
    box.appendChild(svgWrap);
    var count = el("div", "font-size:12px;color:#666;margin:2px 0 6px");
    box.appendChild(count);
    var card = el("div", "border-left:4px solid #9467bd;background:#faf8fd;padding:8px 10px;border-radius:6px;min-height:60px;margin-bottom:8px");
    box.appendChild(card);
    var list = el("div", "max-height:220px;overflow-y:auto;border-top:1px solid #eee;padding-top:4px");
    box.appendChild(list);

    var d0 = dayIndex(ISSUE.start), d1 = dayIndex(ISSUE.end);
    var dots = [];

    function visible(p) {
      if (!catOn[p.c]) return false;
      if (tagSel >= 0 && p.g.indexOf(TAGS[tagSel]) < 0) return false;
      return true;
    }

    function drawTimeline() {
      var W = Math.max(280, svgWrap.clientWidth || 600);
      var laneH = W < 500 ? 34 : 38, left = W < 500 ? 40 : 48, right = 14, top = 8;
      var H = top + 6 * laneH + 26;
      svgWrap.innerHTML = "";
      var s = sv("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H });
      s.style.display = "block";
      svgWrap.appendChild(s);
      function xOf(d) { return left + (W - left - right) * (d - d0) / (d1 - d0); }
      for (var c = 0; c < 6; c++) {
        var y = top + c * laneH;
        s.appendChild(sv("rect", { x: left, y: y + 2, width: W - left - right, height: laneH - 4, fill: c % 2 ? "#f7f7f7" : "#fcfcfc" }));
        var lt = sv("text", { x: left - 6, y: y + laneH / 2 + 4, "text-anchor": "end", "font-size": 12, fill: CATS[c].col, "font-weight": "bold" });
        lt.textContent = CATS[c].k;
        s.appendChild(lt);
      }
      var ticks = ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"];
      ticks.forEach(function (t) {
        var x = xOf(dayIndex(t));
        s.appendChild(sv("line", { x1: x, x2: x, y1: top, y2: top + 6 * laneH, stroke: "#ddd", "stroke-width": 1 }));
        var tt = sv("text", { x: x, y: top + 6 * laneH + 16, "text-anchor": "middle", "font-size": 11, fill: "#555" });
        tt.textContent = t.slice(5).replace("-", "/");
        s.appendChild(tt);
      });
      dots = [];
      // Papers of one category on the same day form a small cluster: 2 stacked vertically,
      // 3 or 4 on a 2 x 2 grid, so that no dot hides another.
      var nsame = {}, seen = {};
      P.forEach(function (p) { var key = p.c + ":" + p.d; nsame[key] = (nsame[key] || 0) + 1; });
      var OFF = {
        1: [[0, 0]], 2: [[0, -7], [0, 7]],
        3: [[-5.5, -7], [5.5, -7], [0, 7]], 4: [[-5.5, -7], [5.5, -7], [-5.5, 7], [5.5, 7]]
      };
      P.forEach(function (p, i) {
        var key = p.c + ":" + p.d;
        var k = seen[key] || 0;
        seen[key] = k + 1;
        var m = Math.min(nsame[key], 4), o = OFF[m][Math.min(k, 3)];
        var x = xOf(dayIndex(p.d)) + o[0], y = top + p.c * laneH + laneH / 2 + o[1];
        var circ = sv("circle", { cx: x, cy: y, r: m > 1 ? 5 : 6 });
        circ._r = m > 1 ? 5 : 6;
        s.appendChild(circ);
        dots.push({ x: x, y: y, i: i, on: visible(p), e: circ });
      });
      styleDots();
      function pick(ev) {
        var r = s.getBoundingClientRect();
        var px = (ev.clientX - r.left) * W / r.width, py = (ev.clientY - r.top) * H / r.height;
        var best = -1, bd = 32 * 32;
        dots.forEach(function (o) {
          if (!o.on) return;
          var dd = (o.x - px) * (o.x - px) + (o.y - py) * (o.y - py);
          if (dd < bd) { bd = dd; best = o.i; }
        });
        if (best >= 0 && best !== current) { current = best; select(); }
      }
      var dragging = false;
      s.addEventListener("pointerdown", function (ev) {
        dragging = true;
        if (s.setPointerCapture) { try { s.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } }
        pick(ev);
      });
      s.addEventListener("pointermove", function (ev) { if (dragging) pick(ev); });
      s.addEventListener("pointerup", function () { dragging = false; });
      s.addEventListener("pointercancel", function () { dragging = false; });
      s.addEventListener("pointerleave", function () { dragging = false; });
    }

    function styleDots() {
      dots.forEach(function (o) {
        var p = P[o.i], sel = o.i === current;
        o.e.setAttribute("r", sel ? o.e._r + 2.5 : o.e._r);
        o.e.setAttribute("fill", o.on ? CATS[p.c].col : "#ccc");
        o.e.setAttribute("fill-opacity", o.on ? 0.9 : 0.35);
        o.e.setAttribute("stroke", sel ? "#111" : "#fff");
        o.e.setAttribute("stroke-width", sel ? 2.5 : 1.2);
        if (sel && o.e.parentNode) o.e.parentNode.appendChild(o.e);
      });
    }

    function select() {
      styleDots();
      drawCard();
      drawList();
    }

    function link(label, href) {
      var a = el("a", "margin-right:12px;font-size:13px", label);
      a.href = href;
      if (href.charAt(0) !== "#") { a.target = "_blank"; a.rel = "noopener"; }
      return a;
    }

    function drawCard() {
      card.innerHTML = "";
      if (current < 0 || !P[current]) {
        card.style.borderLeftColor = "#ccc";
        card.appendChild(el("div", "color:#777;font-size:13px", T.help));
        return;
      }
      var p = P[current];
      card.style.borderLeftColor = CATS[p.c].col;
      card.appendChild(el("div", "font-size:12px;color:" + CATS[p.c].col + ";font-weight:bold", T.cats[p.c] + DOT +
        p.g.split("").map(function (g) { return T.tags[TAGS.indexOf(g)]; }).join(", ")));
      card.appendChild(el("div", "font-weight:bold;margin:2px 0", p.t));
      card.appendChild(el("div", "font-size:12px;color:#555;margin-bottom:4px", p.a + DOT + p.v + DOT + p.d));
      card.appendChild(el("div", "font-size:13px;line-height:1.45;margin-bottom:6px", pageSummary(p.n) || p.s));
      var links = el("div", "");
      links.appendChild(link(T.paper, p.u));
      if (p.code) links.appendChild(link(T.code, p.code));
      if (p.proj) links.appendChild(link(T.proj, p.proj));
      if (document.getElementById("pd-" + (p.n < 10 ? "0" : "") + p.n)) links.appendChild(link(T.jump, "#pd-" + (p.n < 10 ? "0" : "") + p.n));
      card.appendChild(links);
    }

    function drawList() {
      var keep = list.scrollTop;
      list.innerHTML = "";
      setTimeout(function () { list.scrollTop = keep; }, 0);
      var k = 0;
      P.forEach(function (p, i) {
        if (!visible(p)) return;
        k++;
        var b = el("button", "display:flex;gap:8px;align-items:flex-start;width:100%;text-align:left;background:" +
          (i === current ? "#f1ecf8" : "transparent") + ";border:0;border-bottom:1px solid #f0f0f0;padding:5px 2px;" +
          "font:inherit;font-size:13px;color:#222;cursor:pointer;touch-action:manipulation");
        b.type = "button";
        var dot = el("span", "flex:0 0 10px;height:10px;border-radius:5px;margin-top:4px;background:" + CATS[p.c].col);
        b.appendChild(dot);
        b.appendChild(el("span", "flex:1 1 auto;min-width:0", p.t));
        b.appendChild(el("span", "flex:0 0 auto;color:#888;font-size:12px", p.d.slice(5).replace("-", "/")));
        b.addEventListener("click", function () { current = i; select(); });
        list.appendChild(b);
      });
      count.textContent = k ? (k + " / " + P.length + " " + T.shown) : T.none;
    }

    function refresh() {
      var allOn = catOn.every(function (v) { return v; });
      setChip(allBtn, allOn && tagSel < 0);
      catBtns.forEach(function (b, i) { setChip(b, !allOn && catOn[i]); });
      tagBtns.forEach(function (b, i) { setChip(b, tagSel === i); });
      if (current >= 0 && !visible(P[current])) current = -1;
      drawTimeline();
      drawCard();
      drawList();
    }

    refresh();
    var lastW = svgWrap.clientWidth;
    window.addEventListener("resize", function () {
      if (svgWrap.clientWidth !== lastW) { lastW = svgWrap.clientWidth; drawTimeline(); }
    });
  }

  function init() {
    var roots = document.querySelectorAll('[data-widget="paper-digest-explorer"]');
    for (var i = 0; i < roots.length; i++) build(roots[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
