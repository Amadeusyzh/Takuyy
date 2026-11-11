// Interactive lab: 2D materials with the Moving Least Squares Material Point Method
// (MLS-MPM, Hu et al., SIGGRAPH 2018), running entirely on the GPU in WebGL 2.
//
// State. Every particle p carries a position x_p, a velocity v_p, the affine velocity
// matrix C_p of APIC (Jiang et al. 2015), the deformation gradient F_p and, for snow, the
// plastic volume ratio J_p. They live in four RGBA32F textures (one texel per particle)
// that are ping-ponged between substeps:
//   T0 = (x, v)   T1 = affine matrix A_p (see below)   T2 = F   T3 = (J_p, material, colour, seed)
// The background grid stores, per node, momentum and mass (P2G target) and then velocity.
//
// One substep (dt is about 1e-4 s; ~16 substeps per displayed frame):
//  1. P2G. Each particle scatters to the 3x3 nodes around it with quadratic B-spline
//     weights w_ip:  m_i += w_ip m_p,  (m v)_i += w_ip (m_p v_p + A_p (x_i - x_p)),
//     where A_p = m_p C_p - dt V_p 4/dx^2 * tau_p (MLS-MPM folds the stress force into the
//     affine momentum; tau_p is the Kirchhoff stress). WebGL has no atomic adds, so the
//     scatter draws each particle as a 3x3-pixel point sprite into a float texture with
//     additive blending; the fragment shader evaluates the weight of its own node.
//  2. Grid update. v_i = (m v)_i / m_i, add gravity, the pointer's force, collider and
//     wall boundary conditions (remove the velocity component into the solid).
//  3. G2P. Each particle gathers v_p = sum w_ip v_i and C_p = 4/dx^2 sum w_ip v_i (x_i - x_p)^T,
//     moves x_p += dt v_p, updates F_p <- (I + dt C_p) F_p, applies plasticity and
//     evaluates the stress for the next P2G (so step 1 needs no SVD).
//
// Materials differ only in the constitutive model (Lame parameters mu, lambda from E, nu=0.2):
//   water: only J = det F is kept (F is reset to sqrt(J) I), tau = lambda J (J - 1) I,
//          a weakly compressible fluid;
//   jelly: fixed corotated tau = 2 mu (F - R) F^T + lambda J (J - 1) I (R from the polar
//          decomposition F = R S), or Neo-Hookean tau = mu (F F^T - I) + lambda ln(J) I;
//   snow:  the same elasticity plus plasticity in the style of Stomakhin et al. 2013: the
//          singular values of F are clamped to [1 - 2.5e-2, 1 + 4.5e-3], the excess goes
//          into J_p, and the Lame parameters harden by exp(10 (1 - J_p)).
// Parameters follow the classic mpm99 example of the Taichi language (Hu et al.).
(function () {
  "use strict";

  var panel = document.getElementById("lab-mpm");
  if (!panel) return;
  var canvas = panel.querySelector("canvas");

  // ------------------------------------------------------------------ text
  var I18N = {
    en: {
      aria: "MLS-MPM simulation of water, jelly and snow",
      nogl: "This demo needs WebGL 2 with floating-point render targets, which this browser does not provide.",
      tool: "Tool", push: "Push", attract: "Attract", add: "Add",
      water: "Water", jelly: "Jelly", snow: "Snow",
      scene: "Scene", s0: "Dam break", s1: "Three materials", s2: "Snowballs", s3: "Jelly rain",
      reset: "Reset", pause: "Pause", resume: "Resume",
      model: "Elasticity", m0: "Fixed corotated", m1: "Neo-Hookean",
      stiff: "Stiffness E",
      view: "View", v0: "Surface", v1: "Particles", v2: "Volume J", v3: "Grid",
      hintPush: "Drag to push \u00b7 tap to blast",
      hintAttract: "Hold and drag to attract",
      hintAdd: "Tap to drop {mat} \u00b7 drag to pour",
      stats: "{n} particles \u00b7 grid {gx}\u00d7{gy} \u00b7 {s} substeps/frame \u00b7 {fps} fps",
      full: "particle budget full: Reset",
      more: "Background:",
      link1: "Physically based simulation (graphics 07)",
      link2: "Physics and simulation engines (engine 05)",
      caption:
        "A 2D Moving Least Squares Material Point Method (MLS-MPM, Hu et al., SIGGRAPH 2018) that runs entirely on your GPU. " +
        "Each particle carries mass, velocity, an affine velocity matrix C (as in APIC) and a deformation gradient F. " +
        "Every substep scatters the particles\u2019 momentum to a background grid with quadratic B-spline weights (P2G), " +
        "applies gravity, walls, colliders and your pointer on the grid, gathers the new velocity and C back to the particles (G2P), " +
        "moves them and updates F \u2190 (I + \u0394t C) F. WebGL has no atomic adds, so P2G draws every particle as a 3\u00d73-pixel point " +
        "into a floating-point texture with additive blending. The three materials differ only in their constitutive model: " +
        "water keeps just the volume ratio J = det F and resists compression with the pressure \u03bbJ(J \u2212 1); jelly is elastic " +
        "(fixed corotated or Neo-Hookean); snow adds plasticity in the style of Stomakhin et al. (2013), clamping the singular values of F " +
        "to [1 \u2212 2.5%, 1 + 0.45%] and hardening as it is compacted. Volume J colours the particles by ln J " +
        "(blue compressed, red expanded): water near the floor is slightly compressed by the weight above it, and broken snow turns red as it loosens. Grid shows the node velocities through which the particles interact."
    },
    zh: {
      aria: "\u6c34\u3001\u679c\u51bb\u4e0e\u96ea\u7684 MLS-MPM \u6a21\u62df",
      nogl: "\u672c\u6f14\u793a\u9700\u8981\u652f\u6301\u6d6e\u70b9\u6e32\u67d3\u76ee\u6807\u7684 WebGL 2\uff0c\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u3002",
      tool: "\u5de5\u5177", push: "\u63a8", attract: "\u5438\u5f15", add: "\u6dfb\u52a0",
      water: "\u6c34", jelly: "\u679c\u51bb", snow: "\u96ea",
      scene: "\u573a\u666f", s0: "\u6e83\u575d", s1: "\u4e09\u79cd\u6750\u6599", s2: "\u96ea\u7403", s3: "\u679c\u51bb\u96e8",
      reset: "\u91cd\u7f6e", pause: "\u6682\u505c", resume: "\u7ee7\u7eed",
      model: "\u5f39\u6027\u6a21\u578b", m0: "\u56fa\u5b9a\u5171\u65cb", m1: "Neo-Hookean",
      stiff: "\u521a\u5ea6 E",
      view: "\u89c6\u56fe", v0: "\u8868\u9762", v1: "\u7c92\u5b50", v2: "\u4f53\u79ef J", v3: "\u7f51\u683c",
      hintPush: "\u62d6\u52a8\u63a8\u52a8 \u00b7 \u70b9\u51fb\u7206\u51b2",
      hintAttract: "\u6309\u4f4f\u62d6\u52a8\u4ee5\u5438\u5f15",
      hintAdd: "\u70b9\u51fb\u6295\u653e{mat} \u00b7 \u62d6\u52a8\u503e\u5012",
      stats: "{n} \u4e2a\u7c92\u5b50 \u00b7 \u7f51\u683c {gx}\u00d7{gy} \u00b7 \u6bcf\u5e27 {s} \u5b50\u6b65 \u00b7 {fps} fps",
      full: "\u7c92\u5b50\u5df2\u6ee1\uff0c\u8bf7\u91cd\u7f6e",
      more: "\u80cc\u666f\u9605\u8bfb\uff1a",
      link1: "\u57fa\u4e8e\u7269\u7406\u7684\u6a21\u62df\uff08\u56fe\u5f62\u5b66 07\uff09",
      link2: "\u7269\u7406\u4e0e\u4eff\u771f\u5f15\u64ce\uff08\u5f15\u64ce 05\uff09",
      caption:
        "\u5b8c\u5168\u5728 GPU \u4e0a\u8fd0\u884c\u7684\u4e8c\u7ef4\u79fb\u52a8\u6700\u5c0f\u4e8c\u4e58\u7269\u8d28\u70b9\u6cd5\uff08Moving Least Squares Material Point Method\uff0cMLS-MPM\uff0cHu \u7b49\uff0cSIGGRAPH 2018\uff09\u3002" +
        "\u6bcf\u4e2a\u7c92\u5b50\u643a\u5e26\u8d28\u91cf\u3001\u901f\u5ea6\u3001\u4eff\u5c04\u901f\u5ea6\u77e9\u9635 C\uff08\u540c APIC\uff09\u548c\u5f62\u53d8\u68af\u5ea6\uff08deformation gradient\uff09F\u3002" +
        "\u6bcf\u4e2a\u5b50\u6b65\u5148\u7528\u4e8c\u6b21 B \u6837\u6761\u6743\u91cd\u628a\u7c92\u5b50\u52a8\u91cf\u6563\u5c04\u5230\u80cc\u666f\u7f51\u683c\uff08P2G\uff09\uff0c" +
        "\u5728\u7f51\u683c\u4e0a\u65bd\u52a0\u91cd\u529b\u3001\u5899\u58c1\u3001\u969c\u788d\u7269\u548c\u4f60\u7684\u6307\u9488\uff0c\u518d\u628a\u65b0\u7684\u901f\u5ea6\u548c C \u6536\u96c6\u56de\u7c92\u5b50\uff08G2P\uff09\uff0c" +
        "\u79fb\u52a8\u7c92\u5b50\u5e76\u66f4\u65b0 F \u2190 (I + \u0394t C) F\u3002WebGL \u6ca1\u6709\u539f\u5b50\u52a0\u6cd5\uff0c\u6240\u4ee5 P2G \u628a\u6bcf\u4e2a\u7c92\u5b50\u753b\u6210 3\u00d73 \u50cf\u7d20\u7684\u70b9\uff0c" +
        "\u7528\u52a0\u6cd5\u6df7\u5408\u5199\u5165\u6d6e\u70b9\u7eb9\u7406\u3002\u4e09\u79cd\u6750\u6599\u53ea\u5728\u672c\u6784\u6a21\u578b\uff08constitutive model\uff09\u4e0a\u4e0d\u540c\uff1a" +
        "\u6c34\u53ea\u4fdd\u7559\u4f53\u79ef\u6bd4 J = det F\uff0c\u7528\u538b\u529b \u03bbJ(J \u2212 1) \u62b5\u6297\u538b\u7f29\uff1b\u679c\u51bb\u662f\u5f39\u6027\u4f53\uff08\u56fa\u5b9a\u5171\u65cb\u6216 Neo-Hookean\uff09\uff1b" +
        "\u96ea\u6309 Stomakhin \u7b49\uff082013\uff09\u7684\u601d\u8def\u52a0\u5165\u5851\u6027\uff0c\u628a F \u7684\u5947\u5f02\u503c\u9650\u5236\u5728 [1 \u2212 2.5%, 1 + 0.45%] \u5185\uff0c" +
        "\u5e76\u5728\u88ab\u538b\u5b9e\u65f6\u786c\u5316\u3002\u300c\u4f53\u79ef J\u300d\u89c6\u56fe\u6309 ln J \u7ed9\u7c92\u5b50\u7740\u8272\uff08\u84dd\u4e3a\u538b\u7f29\uff0c\u7ea2\u4e3a\u81a8\u80c0\uff09\uff0c" +
        "\u9760\u8fd1\u5e95\u90e8\u7684\u6c34\u88ab\u4e0a\u65b9\u7684\u91cd\u91cf\u7565\u5fae\u538b\u7f29\uff0c\u788e\u88c2\u7684\u96ea\u53d8\u677e\u540e\u5448\u7ea2\u8272\uff1b\u300c\u7f51\u683c\u300d\u89c6\u56fe\u663e\u793a\u7c92\u5b50\u4e4b\u95f4\u501f\u4ee5\u76f8\u4e92\u4f5c\u7528\u7684\u8282\u70b9\u901f\u5ea6\u3002"
    },
    ja: {
      aria: "\u6c34\u30fb\u30bc\u30ea\u30fc\u30fb\u96ea\u306e MLS-MPM \u30b7\u30df\u30e5\u30ec\u30fc\u30b7\u30e7\u30f3",
      nogl: "\u3053\u306e\u30c7\u30e2\u306b\u306f\u6d6e\u52d5\u5c0f\u6570\u70b9\u30ec\u30f3\u30c0\u30fc\u30bf\u30fc\u30b2\u30c3\u30c8\u306b\u5bfe\u5fdc\u3057\u305f WebGL 2 \u304c\u5fc5\u8981\u3067\u3059\u304c\u3001\u3053\u306e\u30d6\u30e9\u30a6\u30b6\u3067\u306f\u4f7f\u3048\u307e\u305b\u3093\u3002",
      tool: "\u30c4\u30fc\u30eb", push: "\u62bc\u3059", attract: "\u5f15\u304d\u5bc4\u305b", add: "\u8ffd\u52a0",
      water: "\u6c34", jelly: "\u30bc\u30ea\u30fc", snow: "\u96ea",
      scene: "\u30b7\u30fc\u30f3", s0: "\u30c0\u30e0\u5d29\u58ca", s1: "3 \u3064\u306e\u6750\u6599", s2: "\u96ea\u7389", s3: "\u30bc\u30ea\u30fc\u306e\u96e8",
      reset: "\u30ea\u30bb\u30c3\u30c8", pause: "\u4e00\u6642\u505c\u6b62", resume: "\u518d\u958b",
      model: "\u5f3e\u6027\u30e2\u30c7\u30eb", m0: "\u56fa\u5b9a\u5171\u56de\u8ee2", m1: "Neo-Hookean",
      stiff: "\u525b\u6027 E",
      view: "\u8868\u793a", v0: "\u8868\u9762", v1: "\u7c92\u5b50", v2: "\u4f53\u7a4d J", v3: "\u683c\u5b50",
      hintPush: "\u30c9\u30e9\u30c3\u30b0\u3067\u62bc\u3059 \u00b7 \u30bf\u30c3\u30d7\u3067\u7206\u98a8",
      hintAttract: "\u62bc\u3057\u305f\u307e\u307e\u30c9\u30e9\u30c3\u30b0\u3067\u5f15\u304d\u5bc4\u305b",
      hintAdd: "\u30bf\u30c3\u30d7\u3067{mat}\u3092\u843d\u3068\u3059 \u00b7 \u30c9\u30e9\u30c3\u30b0\u3067\u6ce8\u3050",
      stats: "\u7c92\u5b50 {n} \u500b \u00b7 \u683c\u5b50 {gx}\u00d7{gy} \u00b7 {s} \u30b5\u30d6\u30b9\u30c6\u30c3\u30d7/\u30d5\u30ec\u30fc\u30e0 \u00b7 {fps} fps",
      full: "\u7c92\u5b50\u6570\u304c\u4e0a\u9650\u3067\u3059\uff1a\u30ea\u30bb\u30c3\u30c8\u3057\u3066\u304f\u3060\u3055\u3044",
      more: "\u95a2\u9023\u8a18\u4e8b\uff1a",
      link1: "\u7269\u7406\u30d9\u30fc\u30b9\u30b7\u30df\u30e5\u30ec\u30fc\u30b7\u30e7\u30f3\uff08\u30b0\u30e9\u30d5\u30a3\u30c3\u30af\u30b9 07\uff09",
      link2: "\u7269\u7406\u30fb\u30b7\u30df\u30e5\u30ec\u30fc\u30b7\u30e7\u30f3\u30a8\u30f3\u30b8\u30f3\uff08\u30a8\u30f3\u30b8\u30f3 05\uff09",
      caption:
        "GPU \u4e0a\u3060\u3051\u3067\u52d5\u304f 2 \u6b21\u5143\u306e\u79fb\u52d5\u6700\u5c0f\u4e8c\u4e57\u7269\u8cea\u70b9\u6cd5\uff08Moving Least Squares Material Point Method\u3001MLS-MPM\u3001Hu \u3089\u3001SIGGRAPH 2018\uff09\u3067\u3059\u3002" +
        "\u5404\u7c92\u5b50\u306f\u8cea\u91cf\u3001\u901f\u5ea6\u3001\u30a2\u30d5\u30a3\u30f3\u901f\u5ea6\u884c\u5217 C\uff08APIC \u3068\u540c\u3058\uff09\u3001\u5909\u5f62\u52fe\u914d\uff08deformation gradient\uff09F \u3092\u6301\u3061\u307e\u3059\u3002" +
        "\u5404\u30b5\u30d6\u30b9\u30c6\u30c3\u30d7\u3067\u306f\u3001\u4e8c\u6b21 B \u30b9\u30d7\u30e9\u30a4\u30f3\u306e\u91cd\u307f\u3067\u7c92\u5b50\u306e\u904b\u52d5\u91cf\u3092\u80cc\u666f\u683c\u5b50\u3078\u914d\u308a\uff08P2G\uff09\u3001" +
        "\u683c\u5b50\u4e0a\u3067\u91cd\u529b\u30fb\u58c1\u30fb\u969c\u5bb3\u7269\u30fb\u30dd\u30a4\u30f3\u30bf\u30fc\u3092\u9069\u7528\u3057\u3001\u65b0\u3057\u3044\u901f\u5ea6\u3068 C \u3092\u7c92\u5b50\u3078\u96c6\u3081\u76f4\u3057\uff08G2P\uff09\u3001" +
        "\u7c92\u5b50\u3092\u52d5\u304b\u3057\u3066 F \u2190 (I + \u0394t C) F \u3068\u66f4\u65b0\u3057\u307e\u3059\u3002WebGL \u306b\u306f\u30a2\u30c8\u30df\u30c3\u30af\u52a0\u7b97\u304c\u306a\u3044\u305f\u3081\u3001P2G \u3067\u306f\u5404\u7c92\u5b50\u3092 3\u00d73 \u30d4\u30af\u30bb\u30eb\u306e\u70b9\u3068\u3057\u3066" +
        "\u52a0\u7b97\u30d6\u30ec\u30f3\u30c9\u3067\u6d6e\u52d5\u5c0f\u6570\u70b9\u30c6\u30af\u30b9\u30c1\u30e3\u306b\u63cf\u304d\u307e\u3059\u30023 \u3064\u306e\u6750\u6599\u306e\u9055\u3044\u306f\u69cb\u6210\u5247\uff08constitutive model\uff09\u3060\u3051\u3067\u3059\u3002" +
        "\u6c34\u306f\u4f53\u7a4d\u6bd4 J = det F \u3060\u3051\u3092\u6301\u3061\u3001\u5727\u529b \u03bbJ(J \u2212 1) \u3067\u5727\u7e2e\u306b\u62b5\u6297\u3057\u307e\u3059\u3002\u30bc\u30ea\u30fc\u306f\u5f3e\u6027\u4f53\uff08\u56fa\u5b9a\u5171\u56de\u8ee2\u307e\u305f\u306f Neo-Hookean\uff09\u3067\u3059\u3002" +
        "\u96ea\u306f Stomakhin \u3089\uff082013\uff09\u306e\u8003\u3048\u65b9\u3067\u5851\u6027\u3092\u52a0\u3048\u3001F \u306e\u7279\u7570\u5024\u3092 [1 \u2212 2.5%, 1 + 0.45%] \u306b\u5236\u9650\u3057\u3001\u62bc\u3057\u56fa\u3081\u3089\u308c\u308b\u3068\u786c\u5316\u3057\u307e\u3059\u3002" +
        "\u300c\u4f53\u7a4d J\u300d\u8868\u793a\u306f\u7c92\u5b50\u3092 ln J \u3067\u8272\u5206\u3051\u3057\u307e\u3059\uff08\u9752\u304c\u5727\u7e2e\u3001\u8d64\u304c\u81a8\u5f35\uff09\u3002\u5e95\u306b\u8fd1\u3044\u6c34\u306f\u4e0a\u306e\u91cd\u307f\u3067\u308f\u305a\u304b\u306b\u5727\u7e2e\u3055\u308c\u3001\u7815\u3051\u305f\u96ea\u306f\u307b\u3050\u308c\u3066\u8d64\u304f\u306a\u308a\u307e\u3059\u3002" +
        "\u300c\u683c\u5b50\u300d\u8868\u793a\u306f\u7c92\u5b50\u3069\u3046\u3057\u304c\u3084\u308a\u53d6\u308a\u3059\u308b\u7bc0\u70b9\u306e\u901f\u5ea6\u3092\u793a\u3057\u307e\u3059\u3002"
    }
  };
  var lang = (panel.dataset.lang || "en").slice(0, 2);
  var L = I18N[lang] || I18N.en;
  var MAT_NAMES = [L.water, L.jelly, L.snow];

  Array.prototype.forEach.call(panel.querySelectorAll("[data-t]"), function (el) {
    var k = el.getAttribute("data-t");
    if (L[k] !== undefined) el.textContent = L[k];
  });
  canvas.setAttribute("aria-label", L.aria);
  var hintEl = panel.querySelector(".lab-hint");
  var statsEl = panel.querySelector(".lab-stats");

  function fail() {
    var stage = panel.querySelector(".lab-stage");
    stage.textContent = L.nogl;
    stage.style.padding = "2rem 1rem";
    stage.style.color = "#ddd";
    stage.style.textAlign = "center";
    Array.prototype.forEach.call(panel.querySelectorAll(".lab-controls"), function (c) {
      c.style.display = "none";
    });
  }

  // ------------------------------------------------------------- constants
  var B = 3; // boundary width in cells (slip walls)
  var PW = 256, PH = 128, MAXP = PW * PH; // particle texture: up to 32768 particles
  // grid sizes per quality level: the visible inner region (NX - 2B) x (NY - 2B) is ~16:9
  var QUALITY = [
    { nx: 187, ny: 108, dpr: 2 },
    { nx: 145, ny: 84, dpr: 1.5 },
    { nx: 107, ny: 63, dpr: 1 }
  ];
  var SIM_RATE = 0.12; // simulated seconds per real second (as in mpm99: 2e-3 s per 60 Hz frame)
  var MAX_SUB = 48;
  var GRAVITY = 50;
  var NU = 0.2;
  var E_WATER = 5000;
  var PALETTE = [
    [1.0, 0.36, 0.55], [1.0, 0.62, 0.22], [0.55, 0.92, 0.32], [0.62, 0.48, 1.0]
  ];

  // ------------------------------------------------------------------ shaders
  var HEAD = "#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n";
  var VS_FULL = HEAD + [
    "out vec2 vUv;",
    "void main() {",
    "  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));",
    "  vUv = p;",
    "  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);",
    "}"
  ].join("\n");

  // quadratic B-spline weight for a node at signed distance r (in cells)
  var KERNEL = [
    "float bspline(float r) {",
    "  r = abs(r);",
    "  return r < 0.5 ? 0.75 - r * r : 0.5 * (1.5 - r) * (1.5 - r);",
    "}"
  ].join("\n");

  // P2G: one 3x3 point sprite per particle, centred on node base + 1
  var VS_P2G = HEAD + [
    "uniform sampler2D uT0, uT1, uT3;",
    "uniform vec2 uGrid;",
    "uniform float uInvDx;",
    "flat out vec4 vVF;", // v.xy, fx.xy
    "flat out vec4 vAff;",
    "flat out vec2 vBase;",
    "void main() {",
    "  ivec2 tc = ivec2(gl_VertexID % " + PW + ", gl_VertexID / " + PW + ");",
    "  if (texelFetch(uT3, tc, 0).x < 0.0) { gl_Position = vec4(-2.0, -2.0, 0.0, 1.0); gl_PointSize = 1.0; return; }", // candidate or dead: outside the clip volume
    "  vec4 a = texelFetch(uT0, tc, 0);",
    "  vec2 xg = a.xy * uInvDx;",
    "  vec2 base = floor(xg - 0.5);",
    "  vVF = vec4(a.zw, xg - base);",
    "  vAff = texelFetch(uT1, tc, 0);",
    "  vBase = base;",
    "  gl_Position = vec4((base + 1.5) / uGrid * 2.0 - 1.0, 0.0, 1.0);",
    "  gl_PointSize = 3.0;",
    "}"
  ].join("\n");

  var FS_P2G = HEAD + KERNEL + "\n" + [
    "uniform float uDx;",
    "flat in vec4 vVF;",
    "flat in vec4 vAff;",
    "flat in vec2 vBase;",
    "out vec4 o;",
    "void main() {",
    "  vec2 off = floor(gl_FragCoord.xy) - vBase;", // 0, 1 or 2 in each axis
    "  vec2 d = off - vVF.zw;", // x_i - x_p in cells
    "  float w = bspline(d.x) * bspline(d.y);",
    "  mat2 A = mat2(vAff.xy, vAff.zw);",
    // unit particle mass: momentum w (v + A (x_i - x_p)), mass w
    "  o = vec4(w * (vVF.xy + A * (d * uDx)), w, 0.0);",
    "}"
  ].join("\n");

  // grid update: momentum -> velocity, gravity, pointer, colliders, walls
  var FS_GRID = HEAD + [
    "uniform sampler2D uAcc;",
    "uniform vec2 uGrid;",
    "uniform float uDx, uDt, uGravity, uVmax;",
    "uniform vec4 uPtr;", // x, y, radius, mode (0 none, 1 push, 2 attract)
    "uniform vec4 uPtrV;", // vx, vy, blast impulse, -
    "uniform vec4 uCol[4];", // capsule a.xy, b.xy
    "uniform vec4 uColR;",
    "uniform int uNumCol;",
    "out vec4 o;",
    "float capsule(vec2 p, vec4 s, float r, out vec2 n) {",
    "  vec2 ab = s.zw - s.xy;",
    "  float h = clamp(dot(p - s.xy, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);",
    "  vec2 q = p - (s.xy + h * ab);",
    "  float l = length(q);",
    "  n = l > 1e-9 ? q / l : vec2(0.0, 1.0);",
    "  return l - r;",
    "}",
    "void main() {",
    "  ivec2 ij = ivec2(gl_FragCoord.xy);",
    "  vec4 a = texelFetch(uAcc, ij, 0);",
    "  float m = a.z;",
    "  vec2 v = vec2(0.0);",
    "  if (m > 1e-7) {",
    "    v = a.xy / m;",
    "    v.y -= uDt * uGravity;",
    "    vec2 p = vec2(ij) * uDx;",
    "    if (uPtr.w > 0.5) {",
    "      vec2 dp = p - uPtr.xy;",
    "      float dist = length(dp);",
    "      if (dist < uPtr.z) {",
    "        float k = 1.0 - dist / uPtr.z; k *= k;",
    "        vec2 dir = dist > 1e-6 ? dp / dist : vec2(0.0, 1.0);",
    "        if (uPtr.w < 1.5) {", // push: a paddle that drags material along and repels it
    "          v += (uPtrV.xy - v) * min(1.0, uDt * 60.0 * k);",
    "          v += dir * (uDt * 140.0 * k + uPtrV.z * k);",
    "        } else {", // attract: a spring towards the pointer with damping relative to it
    "          v += -dir * (uDt * 320.0 * k) * min(1.0, dist / (0.25 * uPtr.z));",
    "          v += (uPtrV.xy - v) * min(1.0, uDt * 30.0 * k);",
    "        }",
    "      }",
    "    }",
    "    for (int c = 0; c < 4; c++) {",
    "      if (c >= uNumCol) break;",
    "      vec2 n;",
    "      float sd = capsule(p, uCol[c], uColR[c], n);",
    "      if (sd < 0.5 * uDx) {",
    "        float vn = dot(v, n);",
    "        if (vn < 0.0) {",
    "          vec2 vt = v - vn * n;", // remove the normal component, Coulomb friction on the rest
    "          float lt = length(vt);",
    "          v = lt > 1e-9 ? vt * max(0.0, 1.0 - 0.3 * (-vn) / lt) : vec2(0.0);",
    "        }",
    "      }",
    "    }",
    "    if (ij.x < " + B + " && v.x < 0.0) v.x = 0.0;",
    "    if (ij.x > int(uGrid.x) - " + (B + 1) + " && v.x > 0.0) v.x = 0.0;",
    "    if (ij.y < " + B + " && v.y < 0.0) v.y = 0.0;",
    "    if (ij.y > int(uGrid.y) - " + (B + 1) + " && v.y > 0.0) v.y = 0.0;",
    "    float s = length(v);",
    "    if (s > uVmax) v *= uVmax / s;",
    "  }",
    "  o = vec4(v, m, 0.0);",
    "}"
  ].join("\n");

  // G2P + particle update + stress for the next P2G
  var FS_G2P = HEAD + KERNEL + "\n" + [
    "uniform sampler2D uT0, uT1, uT2, uT3, uVel;",
    "uniform int uN;",
    "uniform float uDx, uInvDx, uDt;",
    "uniform vec2 uLo, uHi;",
    "uniform float uMu0, uLa0, uLaW, uHmax;",
    "uniform int uModel;",
    "layout(location = 0) out vec4 o0;",
    "layout(location = 1) out vec4 o1;",
    "layout(location = 2) out vec4 o2;",
    "layout(location = 3) out vec4 o3;",
    // Polar decomposition F = R S, then S = V diag(sig) V^T, so F = U diag(sig) V^T with U = R V.
    // No trigonometry: GPU sin/cos approximations leave R slightly non-orthonormal, which acts
    // like a spurious volume change (and, for snow, triggers plastic flow every substep).
    "void svd2(mat2 F, out mat2 R, out mat2 U, out vec2 sig, out mat2 V) {",
    "  vec2 q = vec2(F[0][0] + F[1][1], F[0][1] - F[1][0]);", // (cos, sin) of the rotation angle, unnormalised
    "  float l = length(q);",
    "  q = l > 1e-12 ? q / l : vec2(1.0, 0.0);",
    "  R = mat2(q.x, q.y, -q.y, q.x);",
    "  mat2 S = transpose(R) * F;",
    "  float s00 = S[0][0], s11 = S[1][1], s01 = 0.5 * (S[1][0] + S[0][1]);",
    "  float ex = s00 - s11, ey = 2.0 * s01, r = sqrt(ex * ex + ey * ey);",
    "  float c = 1.0, s = 0.0;",
    "  if (r > 1e-12) {", // half-angle formulas for the eigenvector angle phi, tan(2 phi) = ey / ex
    "    c = sqrt(max(0.0, 0.5 * (1.0 + ex / r)));",
    "    s = sqrt(max(0.0, 0.5 * (1.0 - ex / r)));",
    "    if (ey < 0.0) s = -s;",
    "  }",
    "  V = mat2(c, s, -s, c);",
    "  float m = 0.5 * (s00 + s11);",
    "  sig = vec2(m + 0.5 * r, m - 0.5 * r);",
    "  U = R * V;",
    "}",
    "void main() {",
    "  ivec2 tc = ivec2(gl_FragCoord.xy);",
    "  if (tc.y * " + PW + " + tc.x >= uN) { o0 = vec4(0.0); o1 = vec4(0.0); o2 = vec4(1.0, 0.0, 0.0, 1.0); o3 = vec4(1.0, 0.0, 0.0, 0.0); return; }",
    "  vec4 a = texelFetch(uT0, tc, 0);",
    "  mat2 F = mat2(texelFetch(uT2, tc, 0));",
    "  vec4 st = texelFetch(uT3, tc, 0);",
    "  if (st.x < 0.0) {", // -2: dead, kept unchanged; -1: candidate, accepted only into empty space
    "    float m = st.x < -1.5 ? 1e9 : texelFetch(uVel, ivec2(floor(a.xy * uInvDx + 0.5)), 0).z;",
    "    o0 = a; o1 = vec4(0.0); o2 = vec4(1.0, 0.0, 0.0, 1.0);",
    "    o3 = vec4(m < 1.2 ? 1.0 : -2.0, st.yzw);",
    "    return;",
    "  }",
    "  vec2 xg = a.xy * uInvDx;",
    "  ivec2 base = ivec2(floor(xg - 0.5));",
    "  vec2 fx = xg - vec2(base);",
    "  vec2 nv = vec2(0.0);",
    "  mat2 Bm = mat2(0.0);",
    "  for (int i = 0; i < 3; i++) {",
    "    for (int j = 0; j < 3; j++) {",
    "      vec2 d = vec2(float(i), float(j)) - fx;",
    "      float w = bspline(d.x) * bspline(d.y);",
    "      vec2 gv = texelFetch(uVel, base + ivec2(i, j), 0).xy;",
    "      nv += w * gv;",
    "      Bm += w * outerProduct(gv, d);",
    "    }",
    "  }",
    "  mat2 C = (4.0 * uInvDx) * Bm;", // D^-1 = 4/dx^2 for quadratic B-splines; d is in cells
    "  vec2 x = clamp(a.xy + uDt * nv, uLo, uHi);",
    "  F = (mat2(1.0) + uDt * C) * F;",
    "  float Jp = st.x;",
    "  int mat = int(st.y + 0.5);",
    "  mat2 tau;",
    "  if (mat == 0) {", // water: weakly compressible, keep only J
    "    float J = clamp(determinant(F), 0.2, 3.0);",
    "    F = mat2(sqrt(J));",
    "    tau = mat2(uLaW * J * (J - 1.0));",
    "  } else {",
    "    float h = mat == 1 ? 0.3 : min(exp(10.0 * (1.0 - Jp)), uHmax);",
    "    float mu = uMu0 * h, la = uLa0 * h;",
    "    mat2 R, U, V; vec2 sig;",
    "    svd2(F, R, U, sig, V);",
    "    if (mat == 2) {", // snow plasticity: clamp the singular values, push the rest into Jp
    "      vec2 sc = clamp(sig, vec2(1.0 - 2.5e-2), vec2(1.0 + 4.5e-3));",
    "      Jp = clamp(Jp * (sig.x * sig.y) / (sc.x * sc.y), 0.3, 20.0);",
    "      F = U * mat2(sc.x, 0.0, 0.0, sc.y) * transpose(V);",
    "    }",
    "    float J = determinant(F);",
    "    if (uModel == 0) {",
    "      tau = 2.0 * mu * (F - R) * transpose(F) + mat2(la * J * (J - 1.0));",
    "    } else {",
    "      float Jc = max(J, 0.05);",
    "      tau = mu * (F * transpose(F) - mat2(1.0)) + mat2(la * log(Jc));",
    "    }",
    "  }",
    // A_p = C_p - dt (V_p / m_p) 4/dx^2 tau_p, with V_p / m_p = 1 / rho = 1
    "  mat2 A = C - (uDt * 4.0 * uInvDx * uInvDx) * tau;",
    "  o0 = vec4(x, nv);",
    "  o1 = vec4(A[0], A[1]);",
    "  o2 = vec4(F[0], F[1]);",
    "  o3 = vec4(Jp, st.yzw);",
    "}"
  ].join("\n");

  // particles as point sprites: splat (surface view) or dots (particle / volume / grid views)
  var VS_PTS = HEAD + [
    "uniform sampler2D uT0, uT2, uT3;",
    "uniform vec2 uOrigin;", // domain coords of the view's lower-left corner
    "uniform vec2 uSpan;", // domain size of the view
    "uniform float uSize;",
    "uniform int uMode;", // 0 splat, 1 material colours, 2 volume, 3 faint dots
    "uniform vec3 uPal[4];",
    "out vec4 vA;",
    "out vec4 vB;",
    "vec3 diverging(float t) {",
    "  vec3 neg = vec3(0.15, 0.55, 1.0), mid = vec3(0.62, 0.64, 0.7), pos = vec3(1.0, 0.38, 0.2);",
    "  return t < 0.0 ? mix(mid, neg, -t) : mix(mid, pos, t);",
    "}",
    "void main() {",
    "  ivec2 tc = ivec2(gl_VertexID % " + PW + ", gl_VertexID / " + PW + ");",
    "  vec4 a = texelFetch(uT0, tc, 0);",
    "  vec4 st = texelFetch(uT3, tc, 0);",
    "  int mat = int(st.y + 0.5);",
    "  vec2 uv = (a.xy - uOrigin) / uSpan;",
    "  gl_Position = st.x < -1.5 ? vec4(-2.0, -2.0, 0.0, 1.0) : vec4(uv * 2.0 - 1.0, 0.0, 1.0);",
    "  gl_PointSize = uSize;",
    "  vec3 jc = uPal[int(st.z + 0.5) & 3];",
    "  float speed = length(a.zw);",
    "  if (uMode == 0) {",
    "    vA = vec4(mat == 0 ? 1.0 : 0.0, mat == 1 ? 1.0 : 0.0, mat == 2 ? 1.0 : 0.0, speed);",
    "    vB = vec4(mat == 1 ? jc : vec3(0.0), mat == 2 ? clamp(1.0 - st.x, 0.0, 0.6) * 1.6 : 0.0);",
    "  } else {",
    "    vec3 c = mat == 0 ? vec3(0.28, 0.62, 1.0) : (mat == 1 ? jc : vec3(0.93, 0.96, 1.0));",
    "    c *= 0.8 + 0.25 * fract(st.w * 13.7);",
    "    if (uMode == 2) {",
    "      float J = determinant(mat2(texelFetch(uT2, tc, 0))) * st.x;",
    "      c = diverging(tanh(log(max(J, 1e-3)) / 0.025));",
    "    }",
    "    vA = vec4(c, uMode == 3 ? 0.35 : 0.95);",
    "    vB = vec4(0.0);",
    "  }",
    "}"
  ].join("\n");

  var FS_SPLAT = HEAD + [
    "uniform float uNorm;",
    "in vec4 vA;",
    "in vec4 vB;",
    "layout(location = 0) out vec4 o0;",
    "layout(location = 1) out vec4 o1;",
    "void main() {",
    "  vec2 q = gl_PointCoord * 2.0 - 1.0;",
    "  float r2 = dot(q, q);",
    "  if (r2 >= 1.0) discard;",
    "  float k = (1.0 - r2) * (1.0 - r2) * uNorm;",
    "  o0 = vA * k;",
    "  o1 = vB * k;",
    "}"
  ].join("\n");

  var FS_DOT = HEAD + [
    "in vec4 vA;",
    "in vec4 vB;",
    "out vec4 o;",
    "void main() {",
    "  vec2 q = gl_PointCoord * 2.0 - 1.0;",
    "  float r2 = dot(q, q);",
    "  if (r2 >= 1.0) discard;",
    "  float a = vA.a * smoothstep(1.0, 0.55, r2);",
    "  o = vec4(vA.rgb * a, a);", // premultiplied
    "}"
  ].join("\n");

  // composite: background, MPM grid, fluid surface, colliders, pointer ring
  var FS_COMP = HEAD + [
    "uniform sampler2D uDen0, uDen1, uVel;",
    "uniform int uView;",
    "uniform vec2 uOrigin, uSpan, uGrid;",
    "uniform float uDx;",
    "uniform vec2 uTexel;",
    "uniform float uCellPx;",
    "uniform float uLod;", // mip level whose texels are about one particle spacing
    "uniform vec4 uCol[4];",
    "uniform vec4 uColR;",
    "uniform int uNumCol;",
    "uniform vec4 uPtr;", // x, y, radius, mode (0 hidden, 1 push, 2 attract, 3 add)
    "uniform vec3 uMatCol;",
    "in vec2 vUv;",
    "out vec4 o;",
    "float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }",
    "vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }",
    "float capsule(vec2 p, vec4 s, float r) {",
    "  vec2 ab = s.zw - s.xy;",
    "  float h = clamp(dot(p - s.xy, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);",
    "  return length(p - (s.xy + h * ab)) - r;",
    "}",
    "vec3 background(vec2 uv, vec2 p) {",
    "  vec3 c = mix(vec3(0.085, 0.1, 0.135), vec3(0.035, 0.045, 0.07), uv.y);",
    "  vec2 g = p / uDx;", // grid coordinates: nodes sit on integers
    "  vec2 f = abs(fract(g + 0.5) - 0.5) * uCellPx;", // distance to the nearest node line in pixels
    "  float line = 1.0 - smoothstep(0.0, 1.0, min(f.x, f.y));",
    "  vec2 f8 = abs(fract(g / 8.0 + 0.5) - 0.5) * uCellPx * 8.0;",
    "  float line8 = 1.0 - smoothstep(0.0, 1.2, min(f8.x, f8.y));",
    "  float gl = uView == 3 ? 0.07 : 0.022;",
    "  c += vec3(0.55, 0.7, 1.0) * (line * gl + line8 * 0.035);",
    "  vec2 vg = uv - 0.5;",
    "  c *= 1.0 - 0.35 * dot(vg, vg);",
    "  return c;",
    "}",
    "float total(vec2 uv, float lod) { vec4 d = textureLod(uDen0, uv, lod); return d.r + d.g + d.b; }",
    "void main() {",
    "  vec2 uv = vUv;",
    "  vec2 p = uOrigin + uv * uSpan;",
    "  vec3 col;",
    "  if (uView == 0) {",
    // slightly blurred density for the coverage, more blur for normals and for the depth tint
    "    vec4 d0 = textureLod(uDen0, uv, 0.7);",
    "    vec4 d1 = textureLod(uDen1, uv, 0.7);",
    "    vec4 b0 = textureLod(uDen0, uv, uLod + 1.5);", // blurred: fills sub-cell holes inside the material
    "    vec4 b1 = textureLod(uDen1, uv, uLod + 1.5);",
    "    float tot = d0.r + d0.g + d0.b, totB = b0.r + b0.g + b0.b;",
    "    float cov = max(smoothstep(0.17, 0.36, tot), smoothstep(0.5, 0.78, totB));",
    "    float inner = smoothstep(0.6, 0.95, totB);",
    "    float keep = smoothstep(0.04, 0.2, tot);",
    "    d0 = mix(b0, d0, keep); d1 = mix(b1, d1, keep);",
    "    tot = max(d0.r + d0.g + d0.b, 1e-5);",
    "    vec2 e = uTexel * exp2(uLod) * 1.5;",
    "    vec2 grad = vec2(total(uv + vec2(e.x, 0.0), uLod) - total(uv - vec2(e.x, 0.0), uLod), total(uv + vec2(0.0, e.y), uLod) - total(uv - vec2(0.0, e.y), uLod));",
    "    vec3 n = normalize(vec3(-grad * 1.1 * (1.0 - 0.7 * inner), 1.0));",
    "    vec3 Ld = normalize(vec3(-0.45, 0.65, 0.62));",
    "    float diff = max(dot(n, Ld), 0.0);",
    "    float spec = pow(max(dot(reflect(-Ld, n), vec3(0.0, 0.0, 1.0)), 0.0), 36.0);",
    "    float rim = (1.0 - n.z) * cov;",
    "    float sw = max(tot, 1e-5);",
    "    float fw = d0.r / sw, fj = d0.g / sw, fs = d0.b / sw;",
    // water: refracted background, depth tint, foam where it moves fast
    "    vec2 ruv = clamp(uv - n.xy * 0.02, 0.0, 1.0);",
    "    vec3 refr = background(ruv, uOrigin + ruv * uSpan);",
    "    float deep = smoothstep(0.45, 0.95, textureLod(uDen0, uv, 3.5).r);",
    "    vec3 cw = mix(refr * 0.6 + vec3(0.05, 0.32, 0.62), vec3(0.02, 0.13, 0.36), deep * 0.75);",
    "    float speed = d0.a / sw;",
    // foam only where the water is fast *and* thin (spray, sheets, breaking crests), not in a falling bulk
    "    float foam = smoothstep(2.5, 6.0, speed) * (1.0 - inner) * (0.55 + 0.45 * hash(floor(gl_FragCoord.xy * 0.5)));",
    "    cw = mix(cw, vec3(0.82, 0.92, 1.0), foam * 0.75) + vec3(0.35, 0.65, 1.0) * rim * 0.6;",
    // jelly: per-blob colour, lit like a soft gel with a bright rim
    "    vec3 jc = d1.rgb / max(d0.g, 1e-5);",
    "    vec3 cj = jc * (0.38 + 0.62 * diff) + jc * rim * 0.9 + refr * 0.12;",
    // snow: diffuse white with blue shade, packed snow turns icy, glints
    "    float pack = clamp(d1.a / max(d0.b, 1e-5), 0.0, 1.0);",
    "    vec3 cs = mix(vec3(0.93, 0.96, 1.0), vec3(0.62, 0.78, 0.95), pack) * (0.55 + 0.45 * diff);",
    "    cs *= 0.92 + 0.08 * hash(floor(p / uDx * 4.0));",
    "    cs += step(0.985, hash(floor(gl_FragCoord.xy))) * spec * 2.0;",
    "    vec3 cm = fw * cw + fj * cj + fs * cs;",
    "    cm += spec * (fw * 0.9 + fj * 0.7 + fs * 0.25);",
    "    float alpha = cov * (fw * 0.9 + fj * 0.95 + fs);",
    "    col = mix(background(uv, p), cm, alpha);",
    "  } else {",
    "    col = background(uv, p);",
    "    if (uView == 3) {", // node velocities: hue = direction, brightness = speed, opacity = mass
    "      ivec2 node = ivec2(floor(p / uDx + 0.5));",
    "      vec4 g = texelFetch(uVel, clamp(node, ivec2(0), ivec2(uGrid) - 1), 0);",
    "      vec2 lp = abs(p / uDx - vec2(node)) * uCellPx;",
    "      float cell = 1.0 - smoothstep(0.5 * uCellPx - 1.5, 0.5 * uCellPx - 0.5, max(lp.x, lp.y));",
    "      float sp = length(g.xy);",
    "      vec3 hc = hsv(atan(g.y, g.x) / 6.2831853 + 0.5, 0.75, 0.25 + 0.75 * clamp(sp / 2.0, 0.0, 1.0));",
    "      col = mix(col, hc, cell * clamp(g.z / 2.5, 0.0, 0.85));",
    "    }",
    "  }",
    "  for (int c = 0; c < 4; c++) {",
    "    if (c >= uNumCol) break;",
    "    float sd = capsule(p, uCol[c], uColR[c]) * uCellPx / uDx;", // in pixels
    "    if (sd < 1.0) {",
    "      vec3 cc = vec3(0.2, 0.23, 0.29) + vec3(0.18, 0.2, 0.24) * smoothstep(-6.0, 0.0, sd);",
    "      col = mix(col, cc, clamp(1.0 - sd, 0.0, 1.0));",
    "    }",
    "  }",
    "  if (uPtr.w > 0.5) {",
    "    float rp = abs(length(p - uPtr.xy) - uPtr.z) * uCellPx / uDx;",
    "    vec3 pc = uPtr.w < 1.5 ? vec3(1.0, 0.8, 0.4) : (uPtr.w < 2.5 ? vec3(0.5, 0.85, 1.0) : uMatCol);",
    "    col = mix(col, pc, (1.0 - smoothstep(0.6, 1.8, rp)) * 0.7);",
    "  }",
    "  o = vec4(col, 1.0);",
    "}"
  ].join("\n");

  // ------------------------------------------------------------------ setup
  function start() {
    var gl = null;
    try {
      gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false });
    } catch (e) {
      gl = null;
    }
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) {
      fail();
      return;
    }
    var floatBlend = !!gl.getExtension("EXT_float_blend");
    try {
      run(gl, floatBlend);
    } catch (e) {
      fail();
      if (window.console && console.warn) console.warn("lab-mpm:", e && e.message);
    }
  }

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {};
    for (var i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
      var info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
    }
    return { p: p, u: u };
  }

  function run(gl, floatBlend) {
    var P = {
      p2g: program(gl, VS_P2G, FS_P2G),
      grid: program(gl, VS_FULL, FS_GRID),
      g2p: program(gl, VS_FULL, FS_G2P),
      splat: program(gl, VS_PTS, FS_SPLAT),
      dot: program(gl, VS_PTS, FS_DOT),
      comp: program(gl, VS_FULL, FS_COMP)
    };
    var vao = gl.createVertexArray(); // all geometry comes from gl_VertexID

    function tex(w, h, ifmt, type, linear, levels) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, levels || 1, ifmt, w, h);
      var f = linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function fbo(texs) {
      var f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      var bufs = [];
      for (var i = 0; i < texs.length; i++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, texs[i], 0);
        bufs.push(gl.COLOR_ATTACHMENT0 + i);
      }
      gl.drawBuffers(bufs);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("incomplete framebuffer");
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return f;
    }
    function bindTex(u, name, unit, t) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(u[name], unit);
    }

    // particle state, ping-ponged
    var S = [0, 1].map(function () {
      var t = [0, 1, 2, 3].map(function () { return tex(PW, PH, gl.RGBA32F, gl.FLOAT, false); });
      return { t: t, f: fbo(t) };
    });
    var cur = 0;

    // grid (re)allocated per quality level
    var G = null;
    var accFormat = floatBlend ? gl.RGBA32F : gl.RGBA16F;
    function allocGrid(nx, ny) {
      if (G) {
        gl.deleteTexture(G.acc); gl.deleteTexture(G.vel);
        gl.deleteFramebuffer(G.accF); gl.deleteFramebuffer(G.velF);
      }
      var acc = tex(nx, ny, accFormat, gl.FLOAT, false);
      var vel = tex(nx, ny, gl.RGBA32F, gl.FLOAT, false);
      G = { nx: nx, ny: ny, acc: acc, vel: vel, accF: fbo([acc]), velF: fbo([vel]) };
    }

    // density targets for the surface view
    var D = null;
    function allocDensity(w, h) {
      if (D && D.w === w && D.h === h) return;
      if (D) {
        gl.deleteTexture(D.t0); gl.deleteTexture(D.t1); gl.deleteFramebuffer(D.f);
      }
      // a short mip chain: the composite reads blurred density for smooth surfaces and normals
      var lv = Math.min(5, Math.floor(Math.log2(Math.min(w, h))) + 1);
      var t0 = tex(w, h, gl.RGBA16F, gl.HALF_FLOAT, true, lv);
      var t1 = tex(w, h, gl.RGBA16F, gl.HALF_FLOAT, true, lv);
      D = { w: w, h: h, t0: t0, t1: t1, f: fbo([t0, t1]) };
    }

    // ------------------------------------------------------------- state
    var forcedQ = parseInt(panel.dataset.quality, 10);
    var mobile = Math.min(window.innerWidth, window.screen ? window.screen.width : 9999) < 700;
    var q = isNaN(forcedQ) ? (mobile ? 1 : 0) : Math.max(0, Math.min(2, forcedQ));
    var NX, NY, DX, INV_DX, WI; // grid size, cell size, inner width (domain units; inner height is 1)
    function setQuality(level) {
      q = level;
      NX = QUALITY[q].nx;
      NY = QUALITY[q].ny;
      DX = 1 / (NY - 2 * B);
      INV_DX = 1 / DX;
      WI = (NX - 2 * B) * DX;
      allocGrid(NX, NY);
    }
    setQuality(q);

    var st = { tool: "push", mat: 0, scene: 0, model: 0, E: 5000, view: 0, paused: false };
    var n = 0;
    var full = false;
    var colliders = [];
    var colorCursor = 0;

    function rng(seed) {
      var s = seed >>> 0;
      return function () {
        s = (s + 0x6d2b79f5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    var rand = rng(7);

    // uploads particles [n, n + k) into the current state textures
    function addParticles(list, candidate) {
      var k = Math.min(list.length, MAXP - n);
      if (k < list.length) full = true;
      if (k <= 0) return;
      var a0 = new Float32Array(k * 4), a1 = new Float32Array(k * 4), a2 = new Float32Array(k * 4), a3 = new Float32Array(k * 4);
      for (var i = 0; i < k; i++) {
        var p = list[i];
        a0[i * 4] = p[0]; a0[i * 4 + 1] = p[1]; a0[i * 4 + 2] = p[2]; a0[i * 4 + 3] = p[3];
        a2[i * 4] = 1; a2[i * 4 + 3] = 1;
        a3[i * 4] = candidate ? -1 : 1; a3[i * 4 + 1] = p[4]; a3[i * 4 + 2] = p[5]; a3[i * 4 + 3] = rand();
      }
      var arrs = [a0, a1, a2, a3];
      var done = 0;
      while (done < k) {
        var idx = n + done;
        var x = idx % PW, y = (idx / PW) | 0;
        var cnt = Math.min(PW - x, k - done);
        for (var t = 0; t < 4; t++) {
          gl.bindTexture(gl.TEXTURE_2D, S[cur].t[t]);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, cnt, 1, gl.RGBA, gl.FLOAT, arrs[t].subarray(done * 4, (done + cnt) * 4));
        }
        done += cnt;
      }
      n += k;
    }

    // stratified samples of a shape given in inner coordinates (u in [0, WI], v in [0, 1])
    function fill(list, inside, u0, v0, u1, v1, mat, vx, vy, color) {
      var s = DX * 0.5; // 4 particles per cell, the particle volume V_p = (dx / 2)^2
      for (var v = v0 + s * 0.5; v < v1; v += s) {
        for (var u = u0 + s * 0.5; u < u1; u += s) {
          var pu = u + (rand() - 0.5) * s * 0.7, pv = v + (rand() - 0.5) * s * 0.7;
          if (!inside(pu, pv)) continue;
          var x = B * DX + pu, y = B * DX + pv;
          list.push([x, y, vx, vy, mat, color]);
        }
      }
    }
    function box(list, u0, v0, u1, v1, mat, vx, vy, color) {
      fill(list, function () { return true; }, u0, v0, u1, v1, mat, vx || 0, vy || 0, color || 0);
    }
    function disc(list, cu, cv, r, mat, vx, vy, color, r0) {
      var ri = r0 || 0;
      fill(list, function (u, v) {
        var d = Math.sqrt((u - cu) * (u - cu) + (v - cv) * (v - cv));
        return d < r && d >= ri;
      }, cu - r, Math.max(0.002, cv - r), cu + r, cv + r, mat, vx || 0, vy || 0, color || 0);
    }
    function capsule(au, av, bu, bv, r) {
      colliders.push([B * DX + au, B * DX + av, B * DX + bu, B * DX + bv, r]);
    }

    var SCENES = [
      function (l) { // dam break against two jelly blocks
        box(l, 0.01, 0.003, 0.56, 0.74, 0);
        box(l, 1.16, 0.003, 1.34, 0.17, 1, 0, 0, 0);
        box(l, 1.42, 0.003, 1.56, 0.3, 1, 0, 0, 2);
      },
      function (l) { // the classic three blocks (after Taichi's mpm99), over a shallow pool and a peg
        box(l, 0.0, 0.003, WI, 0.07, 0);
        box(l, 0.16, 0.45, 0.46, 0.75, 0);
        box(l, 0.74, 0.28, 1.02, 0.56, 1, 0, 0, 1);
        box(l, 1.28, 0.55, 1.56, 0.83, 2);
        capsule(1.42, 0.3, 1.42, 0.3, 0.07);
      },
      function (l) { // two snowballs collide in mid-air above fresh snow; a third hits a ramp
        box(l, 0.0, 0.003, WI, 0.06, 2);
        disc(l, 0.33, 0.55, 0.13, 2, 3.2, 0.6);
        disc(l, 1.45, 0.5, 0.13, 2, -3.2, 1.0);
        disc(l, 0.9, 0.86, 0.09, 2, 0, -1.5);
        capsule(1.25, 0.42, 1.65, 0.28, 0.022);
      },
      function (l) { // jelly blobs and a jelly ring dropped into a pool
        box(l, 0.0, 0.003, WI, 0.27, 0);
        disc(l, 0.3, 0.62, 0.075, 1, 0, 0, 0);
        disc(l, 0.72, 0.8, 0.09, 1, 0, -1, 1, 0.045);
        box(l, 1.0, 0.5, 1.16, 0.66, 1, 0, 0, 2);
        disc(l, 1.45, 0.72, 0.08, 1, 0, 0, 3);
        disc(l, 0.55, 0.45, 0.05, 1, 0, 0, 2);
        disc(l, 1.25, 0.38, 0.055, 1, 0, 0, 0);
      }
    ];

    function loadScene(i) {
      st.scene = i;
      n = 0;
      full = false;
      colliders = [];
      rand = rng(11 + i * 101);
      var l = [];
      SCENES[i](l);
      addParticles(l);
      simAcc = 0;
    }

    function inColl(x, y, pad) {
      for (var c = 0; c < colliders.length; c++) {
        var s = colliders[c];
        var abx = s[2] - s[0], aby = s[3] - s[1];
        var h = Math.max(0, Math.min(1, ((x - s[0]) * abx + (y - s[1]) * aby) / Math.max(abx * abx + aby * aby, 1e-12)));
        var dx = x - (s[0] + h * abx), dy = y - (s[1] + h * aby);
        if (Math.sqrt(dx * dx + dy * dy) < s[4] + pad) return true;
      }
      return false;
    }
    // Added particles start as candidates (J_p = -1): the next G2P keeps only those whose
    // nearest grid node holds (almost) no mass, so new material fills empty space only and never
    // overlaps existing material (which would create a huge pressure spike). No GPU readback needed.
    function spawn(x, y, r, vx, vy) {
      if (n >= MAXP) { full = true; return; }
      var l = [];
      disc(l, x - B * DX, y - B * DX, r, st.mat, vx, vy, colorCursor);
      l = l.filter(function (p) {
        return p[0] > B * DX && p[0] < B * DX + WI && p[1] > B * DX && p[1] < B * DX + 1 && !inColl(p[0], p[1], DX);
      });
      addParticles(l, true);
    }

    // ------------------------------------------------------------- controls
    function setPressed(attr, val) {
      Array.prototype.forEach.call(panel.querySelectorAll("[" + attr + "]"), function (b) {
        b.setAttribute("aria-pressed", b.getAttribute(attr) === String(val) ? "true" : "false");
      });
    }
    function syncUI() {
      setPressed("data-tool", st.tool);
      setPressed("data-mat", st.mat);
      setPressed("data-scene", st.scene);
      setPressed("data-model", st.model);
      setPressed("data-view", st.view);
      var pb = panel.querySelector('[data-action="pause"]');
      if (pb) {
        pb.textContent = st.paused ? L.resume : L.pause;
        pb.setAttribute("aria-pressed", st.paused ? "true" : "false");
      }
      var h = st.tool === "push" ? L.hintPush : st.tool === "attract" ? L.hintAttract : L.hintAdd.replace("{mat}", MAT_NAMES[st.mat]);
      hintEl.textContent = h;
    }
    function on(attr, fn) {
      Array.prototype.forEach.call(panel.querySelectorAll("[" + attr + "]"), function (b) {
        b.addEventListener("click", function () {
          fn(b.getAttribute(attr));
          syncUI();
        });
      });
    }
    on("data-tool", function (v) { st.tool = v; flashHint(); });
    on("data-mat", function (v) { st.mat = +v; st.tool = "add"; flashHint(); });
    on("data-scene", function (v) { loadScene(+v); });
    on("data-model", function (v) { st.model = +v; });
    on("data-view", function (v) { st.view = +v; });
    on("data-action", function (v) {
      if (v === "reset") loadScene(st.scene);
      else if (v === "pause") st.paused = !st.paused;
    });
    var stiffIn = panel.querySelector('[data-input="stiff"]');
    var stiffOut = panel.querySelector(".mpm-e");
    function readStiff() {
      // slider is logarithmic: 10^3 ... 2 * 10^4
      st.E = Math.round(Math.pow(10, parseFloat(stiffIn.value)) / 100) * 100;
      if (stiffOut) stiffOut.textContent = st.E >= 10000 ? (st.E / 1000).toFixed(0) + "k" : (st.E / 1000).toFixed(1) + "k";
    }
    if (stiffIn) {
      stiffIn.value = String(Math.log10(5000));
      stiffIn.addEventListener("input", readStiff);
      readStiff();
    }
    var hintTimer = 0;
    function flashHint() {
      hintEl.style.opacity = "1";
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { hintEl.style.opacity = "0"; }, 2500);
    }
    syncUI();

    // ------------------------------------------------------------- pointer
    var ptr = { down: false, x: 0, y: 0, vx: 0, vy: 0, hover: false, t: 0, sx: 0, sy: 0, t0: 0, moved: false, lastSpawnX: 0, lastSpawnY: 0, blast: 0, id: -1 };
    function toDomain(e) {
      var r = canvas.getBoundingClientRect();
      return [B * DX + ((e.clientX - r.left) / r.width) * WI, B * DX + (1 - (e.clientY - r.top) / r.height)];
    }
    canvas.addEventListener("pointerdown", function (e) {
      if (ptr.down) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
      var p = toDomain(e);
      ptr.down = true;
      ptr.id = e.pointerId;
      ptr.x = p[0]; ptr.y = p[1];
      ptr.vx = 0; ptr.vy = 0;
      ptr.t = performance.now();
      ptr.t0 = ptr.t;
      ptr.sx = e.clientX; ptr.sy = e.clientY;
      ptr.moved = false;
      ptr.lastSpawnX = p[0]; ptr.lastSpawnY = p[1];
      hintEl.style.opacity = "0";
    });
    canvas.addEventListener("pointermove", function (e) {
      var p = toDomain(e);
      ptr.hover = e.pointerType === "mouse";
      if (!ptr.down) { ptr.x = p[0]; ptr.y = p[1]; return; }
      if (e.pointerId !== ptr.id) return;
      var now = performance.now();
      var dtr = Math.max((now - ptr.t) / 1000, 1 / 240);
      // pointer velocity in simulated units: real speed / SIM_RATE, smoothed and clamped
      var vx = (p[0] - ptr.x) / dtr / SIM_RATE, vy = (p[1] - ptr.y) / dtr / SIM_RATE;
      ptr.vx = ptr.vx * 0.5 + vx * 0.5;
      ptr.vy = ptr.vy * 0.5 + vy * 0.5;
      var s = Math.sqrt(ptr.vx * ptr.vx + ptr.vy * ptr.vy);
      if (s > 9) { ptr.vx *= 9 / s; ptr.vy *= 9 / s; }
      ptr.x = p[0]; ptr.y = p[1]; ptr.t = now;
      if (Math.abs(e.clientX - ptr.sx) + Math.abs(e.clientY - ptr.sy) > 6) ptr.moved = true;
    });
    function up(e) {
      if (!ptr.down || e.pointerId !== ptr.id) return;
      var tap = !ptr.moved && performance.now() - ptr.t0 < 350;
      ptr.down = false;
      ptr.hover = e.pointerType === "mouse";
      if (tap && e.type === "pointerup") {
        if (st.tool === "push") ptr.blast = 1;
        else if (st.tool === "add") {
          spawn(ptr.x, ptr.y, st.mat === 0 ? 0.08 : 0.07, 0, 0);
          colorCursor = (colorCursor + 1) % PALETTE.length;
        }
      } else if (st.tool === "add") {
        colorCursor = (colorCursor + 1) % PALETTE.length;
      }
    }
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") ptr.hover = false; });

    function ptrRadius() {
      return st.tool === "push" ? 0.1 : st.tool === "attract" ? 0.13 : 0.035;
    }

    // ------------------------------------------------------------- simulation
    var simAcc = 0;
    var lastSubsteps = 0;
    function stepParams() {
      // explicit MPM needs dt ~ dx / c with the elastic wave speed c ~ sqrt(E): scale mpm99's
      // dt = 1e-4 (dx = 1/128, E = 5e3) to this grid and stiffness
      var Emax = Math.max(E_WATER, st.E * 1.0);
      return 1e-4 * (DX * 128) * Math.sqrt(5000 / Emax);
    }

    function substep(dt, blast) {
      gl.bindVertexArray(vao);
      // 1. P2G
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.accF);
      gl.viewport(0, 0, NX, NY);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      var u = P.p2g.u;
      gl.useProgram(P.p2g.p);
      bindTex(u, "uT0", 0, S[cur].t[0]);
      bindTex(u, "uT1", 1, S[cur].t[1]);
      bindTex(u, "uT3", 2, S[cur].t[3]);
      gl.uniform2f(u.uGrid, NX, NY);
      gl.uniform1f(u.uInvDx, INV_DX);
      gl.uniform1f(u.uDx, DX);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.disable(gl.BLEND);

      // 2. grid update
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.velF);
      u = P.grid.u;
      gl.useProgram(P.grid.p);
      bindTex(u, "uAcc", 0, G.acc);
      gl.uniform2f(u.uGrid, NX, NY);
      gl.uniform1f(u.uDx, DX);
      gl.uniform1f(u.uDt, dt);
      gl.uniform1f(u.uGravity, GRAVITY);
      gl.uniform1f(u.uVmax, 0.45 * DX / dt);
      var mode = ptr.down && st.tool !== "add" ? (st.tool === "push" ? 1 : 2) : 0;
      if (blast) mode = 1;
      gl.uniform4f(u.uPtr, ptr.x, ptr.y, blast ? 0.2 : ptrRadius(), mode);
      gl.uniform4f(u.uPtrV, ptr.down ? ptr.vx : 0, ptr.down ? ptr.vy : 0, blast ? 6.0 : 0, 0);
      setColliders(u);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 3. G2P into the other state set
      var nxt = cur ^ 1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, S[nxt].f);
      var rows = Math.max(1, Math.ceil(n / PW));
      gl.viewport(0, 0, PW, rows);
      u = P.g2p.u;
      gl.useProgram(P.g2p.p);
      for (var t = 0; t < 4; t++) bindTex(u, "uT" + t, t, S[cur].t[t]);
      bindTex(u, "uVel", 4, G.vel);
      gl.uniform1i(u.uN, n);
      gl.uniform1f(u.uDx, DX);
      gl.uniform1f(u.uInvDx, INV_DX);
      gl.uniform1f(u.uDt, dt);
      gl.uniform2f(u.uLo, 2 * DX, 2 * DX);
      gl.uniform2f(u.uHi, (NX - 2) * DX - 1e-4, (NY - 2) * DX - 1e-4);
      var E = st.E;
      gl.uniform1f(u.uMu0, E / (2 * (1 + NU)));
      gl.uniform1f(u.uLa0, (E * NU) / ((1 + NU) * (1 - 2 * NU)));
      gl.uniform1f(u.uLaW, (E_WATER * NU) / ((1 + NU) * (1 - 2 * NU)));
      gl.uniform1f(u.uHmax, 2.5);
      gl.uniform1i(u.uModel, st.model);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      for (t = 0; t < 5; t++) {
        gl.activeTexture(gl.TEXTURE0 + t);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
      cur = nxt;
    }

    var colData = new Float32Array(16), colR = new Float32Array(4);
    function setColliders(u) {
      colData.fill(0);
      colR.fill(0);
      for (var c = 0; c < colliders.length && c < 4; c++) {
        for (var k = 0; k < 4; k++) colData[c * 4 + k] = colliders[c][k];
        colR[c] = colliders[c][4];
      }
      gl.uniform4fv(u.uCol, colData);
      gl.uniform4fv(u.uColR, colR);
      gl.uniform1i(u.uNumCol, Math.min(4, colliders.length));
    }

    // ------------------------------------------------------------- rendering
    var W = 0, H = 0;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, QUALITY[q].dpr);
      var cw = canvas.clientWidth || 640, ch = canvas.clientHeight || 360;
      var scale = dpr;
      if (cw * ch * scale * scale > 1.6e6) scale = Math.sqrt(1.6e6 / (cw * ch));
      var w = Math.max(16, Math.round(cw * scale)), h = Math.max(16, Math.round(ch * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      W = w; H = h;
    }

    var palData = new Float32Array(12);
    PALETTE.forEach(function (c, i) { palData[i * 3] = c[0]; palData[i * 3 + 1] = c[1]; palData[i * 3 + 2] = c[2]; });
    var MATCOL = [[0.35, 0.7, 1.0], [1.0, 0.5, 0.7], [0.95, 0.97, 1.0]];

    function pointsUniforms(prog, mode, size) {
      var u = prog.u;
      gl.useProgram(prog.p);
      bindTex(u, "uT0", 0, S[cur].t[0]);
      bindTex(u, "uT2", 1, S[cur].t[2]);
      bindTex(u, "uT3", 2, S[cur].t[3]);
      gl.uniform2f(u.uOrigin, B * DX, B * DX);
      gl.uniform2f(u.uSpan, WI, 1);
      gl.uniform1f(u.uSize, size);
      gl.uniform1i(u.uMode, mode);
      gl.uniform3fv(u.uPal, palData);
    }

    function render(time) {
      gl.bindVertexArray(vao);
      var cellPx = H * DX; // pixels per grid cell
      var spacingPx = cellPx * 0.5;
      if (st.view === 0) {
        allocDensity(W, H);
        gl.bindFramebuffer(gl.FRAMEBUFFER, D.f);
        gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        var hpx = Math.max(2.5, spacingPx * 1.7); // kernel radius in pixels
        pointsUniforms(P.splat, 0, hpx * 2);
        // normalise so that a uniformly filled region has density ~1: sum of k * s^2 / (pi h^2 / 3)
        gl.uniform1f(P.splat.u.uNorm, (3 * spacingPx * spacingPx) / (Math.PI * hpx * hpx));
        gl.drawArrays(gl.POINTS, 0, n);
        gl.disable(gl.BLEND);
        gl.bindTexture(gl.TEXTURE_2D, D.t0);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindTexture(gl.TEXTURE_2D, D.t1);
        gl.generateMipmap(gl.TEXTURE_2D);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      var u = P.comp.u;
      gl.useProgram(P.comp.p);
      if (D) {
        bindTex(u, "uDen0", 0, D.t0);
        bindTex(u, "uDen1", 1, D.t1);
      }
      bindTex(u, "uVel", 2, G.vel);
      gl.uniform1i(u.uView, st.view);
      gl.uniform2f(u.uOrigin, B * DX, B * DX);
      gl.uniform2f(u.uSpan, WI, 1);
      gl.uniform2f(u.uGrid, NX, NY);
      gl.uniform1f(u.uDx, DX);
      gl.uniform2f(u.uTexel, 1 / W, 1 / H);
      gl.uniform1f(u.uCellPx, cellPx);
      gl.uniform1f(u.uLod, Math.max(1, Math.log2(spacingPx * 1.5)));
      setColliders(u);
      var pm = 0;
      if (ptr.down || ptr.hover) pm = st.tool === "push" ? 1 : st.tool === "attract" ? 2 : 3;
      gl.uniform4f(u.uPtr, ptr.x, ptr.y, ptrRadius(), pm);
      var mc = MATCOL[st.mat];
      if (st.mat === 1) mc = PALETTE[colorCursor];
      gl.uniform3f(u.uMatCol, mc[0], mc[1], mc[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (st.view > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        var size = st.view === 3 ? Math.max(1.5, spacingPx * 0.8) : Math.max(2, spacingPx * 1.25);
        pointsUniforms(P.dot, st.view === 3 ? 3 : st.view, size);
        gl.drawArrays(gl.POINTS, 0, n);
        gl.disable(gl.BLEND);
      }
      for (var t = 0; t < 3; t++) {
        gl.activeTexture(gl.TEXTURE0 + t);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    }

    // ------------------------------------------------------------- frame loop
    var lastT = 0, fps = 0, frameNo = 0, times = [], adapted = 0;
    function frame(now) {
      var rdt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 1 / 60;
      lastT = now;
      frameNo++;
      resize();

      // the Add tool pours while dragging: a small disc per pointer movement of ~0.9 radii
      // (candidates that overlap the previous disc are rejected on the GPU, so the stream is continuous)
      if (ptr.down && st.tool === "add" && ptr.moved) {
        var r = 0.032;
        var ddx = ptr.x - ptr.lastSpawnX, ddy = ptr.y - ptr.lastSpawnY;
        if (ddx * ddx + ddy * ddy > (0.9 * r) * (0.9 * r)) {
          spawn(ptr.x, ptr.y, r, ptr.vx * 0.6, ptr.vy * 0.6);
          ptr.lastSpawnX = ptr.x; ptr.lastSpawnY = ptr.y;
        }
      }

      var dt = stepParams();
      var ns = 0;
      if (!st.paused && n > 0) {
        simAcc += Math.min(rdt, 1 / 30) * SIM_RATE;
        ns = Math.min(MAX_SUB, Math.floor(simAcc / dt));
        simAcc -= ns * dt;
        if (simAcc > dt) simAcc = 0; // could not keep up: run in slow motion instead of piling up work
        for (var i = 0; i < ns; i++) {
          substep(dt, i === 0 && ptr.blast > 0);
          if (i === 0) ptr.blast = 0;
        }
      }
      if (ptr.blast && (st.paused || n === 0)) ptr.blast = 0;
      lastSubsteps = ns || lastSubsteps;
      render(now);

      fps = fps ? fps * 0.92 + (1 / rdt) * 0.08 : 1 / rdt;
      // scale the cost down once or twice if the frame rate is low: coarser grid, fewer particles
      if (adapted < 2 && q < 2 && isNaN(forcedQ) && frameNo > 10 && !st.paused) {
        times.push(rdt);
        if (times.length === 40) {
          var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
          times = [];
          adapted++;
          if (avg > 1 / 40) {
            setQuality(q + 1);
            loadScene(st.scene);
          }
        }
      }
      if (frameNo % 10 === 1) {
        var txt = L.stats
          .replace("{n}", String(n))
          .replace("{gx}", String(NX - 2 * B))
          .replace("{gy}", String(NY - 2 * B))
          .replace("{s}", String(lastSubsteps))
          .replace("{fps}", String(Math.round(fps)));
        if (full) txt += " \u00b7 " + L.full;
        statsEl.textContent = txt;
      }
    }

    loadScene(0);

    var visible = false, raf = 0;
    function tick(now) {
      raf = 0;
      frame(now);
      if (visible && !document.hidden) raf = requestAnimationFrame(tick);
      else lastT = 0;
    }
    function kick() {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
    }
    new IntersectionObserver(function (e) {
      visible = e[0].isIntersecting;
      kick();
    }).observe(canvas);
    document.addEventListener("visibilitychange", kick);
    flashHint();
  }

  // initialise lazily, the first time the panel is shown
  if (!("IntersectionObserver" in window)) {
    fail();
    return;
  }
  new IntersectionObserver(function (e, obs) {
    if (e[0].isIntersecting) {
      obs.disconnect();
      start();
    }
  }).observe(canvas);
})();
