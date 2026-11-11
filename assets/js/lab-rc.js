// Interactive lab: 2D global illumination with radiance cascades (WebGL 2).
//
// The user paints light emitters and walls into a scene texture. Every frame:
//   1. Jump flooding (Rong and Tan, I3D 2006) turns the occupied pixels into a
//      distance field: a seed pass, log2(N) flood passes, a distance pass.
//   2. An emission pass gives every occupied pixel its outgoing radiance:
//      emitters their colour times a power, walls the light they reflect (an
//      estimate from last frame's fluence just outside the wall; see below).
//   3. Radiance cascades (A. Sannikov, 2023). Cascade i stores probes with
//      spacing s_i = 2 * 2^i scene pixels and N_i = 4^(i+1) directions, and
//      each of its rays only marches the distance interval [a_i, b_i] with
//      a_i = L0 (4^i - 1) / 3 and b_i = L0 (4^(i+1) - 1) / 3: one level up, the
//      spacing doubles, the angular resolution and the interval length grow by
//      4, so the penumbra condition (spatial step ~ distance, angular step ~
//      1 / distance) holds and each level costs the same memory. The layout
//      is "direction first": the texture of cascade i is a D_i x D_i grid of
//      tiles (D_i = 2^(i+1)), one tile per direction, each tile holding all
//      probes. Cascades are computed from the top down: the radiance of a ray
//      of cascade i is its own interval radiance plus its transmittance times
//      the upper cascade's radiance, averaged over the 4 child directions and
//      interpolated bilinearly between the 4 upper probes around it.
//      Vanilla merge: one ray per texel, then interpolate the upper result.
//      Bilinear fix: one ray per upper probe, from this probe's interval start
//      to that probe's interval start, so the two rays join up; this removes
//      most of the light leaking through thin walls.
//   4. The fluence (mean radiance over directions) at every pixel is
//      interpolated from cascade 0; a composite pass tone-maps it.
//
// Bounce light. For a Lambertian wall in flatland the outgoing radiance is
// rho * mean incoming radiance over the front half circle. Just outside the
// wall the fluence phi averages the front half (incoming) and the back half,
// which sees the wall itself (its outgoing radiance L). Hence the front mean
// is about 2 phi - L, and the wall emits rho * (2 phi - L) with phi and L from
// the previous frame: one more bounce per frame, an approximation.
(function () {
  "use strict";

  var panel = document.getElementById("lab-rc");
  if (!panel) return;
  var canvas = panel.querySelector("canvas");

  // ------------------------------------------------------------- UI strings
  var STR = {
    en: {
      title: "2D global illumination with radiance cascades",
      hint: "Drag to paint. Pick a tool below.",
      hintProbe: "Drag or hover to move the probe.",
      light: "Light", wall: "Wall", erase: "Erase", brush: "Brush",
      vGI: "Lighting", vSDF: "Distance field", vProbes: "Probes", vRaw: "Cascade texture",
      level: "Level", cascades: "Cascades", auto: "auto",
      fix: "Bilinear fix", bounce: "Bounce light", orbit: "Moving light", exposure: "Exposure",
      pRooms: "Rooms", pPenumbra: "Penumbra", pNeon: "Neon", pPinhole: "Pinhole", clear: "Clear",
      stats: "{res} \u00b7 {n} cascades \u00b7 reach {reach} px ({pct}% of diagonal) \u00b7 {rays} rays/frame \u00b7 {fps} fps",
      statsShort: "{res} \u00b7 {n} cascades \u00b7 {rays} rays \u00b7 {fps} fps",
      raw: "cascade {k}: {px}\u00d7{py} probes \u00b7 {dirs} directions \u00b7 spacing {s} px \u00b7 interval [{a}, {b}] px",
      caption: "Paint lights and walls, and every pixel gets real-time 2D global illumination: soft shadows whose penumbrae widen with distance, and color bleeding from lit walls. A jump-flooding pass (Rong and Tan 2006) turns the scene into a distance field. Radiance cascades (Sannikov 2023) then store radiance on probe grids: from one level to the next the probe spacing doubles, the number of ray directions quadruples, and each ray marches only its own distance interval, which is four times longer, so every level costs the same. The levels are merged from coarse to fine, and the finest one is interpolated to the pixels. Switch the view to Probes or Cascade texture to see the data structure, and turn off the bilinear fix to see the leaks that appear when the rays of two levels do not join up. Bounce light re-emits part of the previous frame's light from the walls (one bounce per frame).",
      link: "Theory: real-time global illumination in graphics 11 \u2192",
      nogl: "This demo needs WebGL 2 with floating-point render targets, which your browser does not support."
    },
    zh: {
      title: "\u57fa\u4e8e\u8f90\u5c04\u7ea7\u8054\u7684\u4e8c\u7ef4\u5168\u5c40\u5149\u7167",
      hint: "\u62d6\u52a8\u4ee5\u7ed8\u5236\uff0c\u5728\u4e0b\u65b9\u9009\u62e9\u5de5\u5177\u3002",
      hintProbe: "\u62d6\u52a8\u6216\u60ac\u505c\u4ee5\u79fb\u52a8\u63a2\u9488\u3002",
      light: "\u5149\u6e90", wall: "\u5899", erase: "\u64e6\u9664", brush: "\u7b14\u5237",
      vGI: "\u5149\u7167", vSDF: "\u8ddd\u79bb\u573a", vProbes: "\u63a2\u9488", vRaw: "\u7ea7\u8054\u7eb9\u7406",
      level: "\u5c42\u7ea7", cascades: "\u7ea7\u8054\u6570", auto: "\u81ea\u52a8",
      fix: "\u53cc\u7ebf\u6027\u4fee\u6b63", bounce: "\u53cd\u5f39\u5149", orbit: "\u79fb\u52a8\u5149\u6e90", exposure: "\u66dd\u5149",
      pRooms: "\u623f\u95f4", pPenumbra: "\u534a\u5f71", pNeon: "\u9713\u8679", pPinhole: "\u5c0f\u5b54", clear: "\u6e05\u7a7a",
      stats: "{res} \u00b7 {n} \u7ea7\u7ea7\u8054 \u00b7 \u8986\u76d6 {reach} px\uff08\u5bf9\u89d2\u7ebf\u7684 {pct}%\uff09\u00b7 \u6bcf\u5e27 {rays} \u6761\u5149\u7ebf \u00b7 {fps} fps",
      statsShort: "{res} \u00b7 {n} \u7ea7\u7ea7\u8054 \u00b7 {rays} \u6761\u5149\u7ebf \u00b7 {fps} fps",
      raw: "\u7b2c {k} \u7ea7\uff1a{px}\u00d7{py} \u4e2a\u63a2\u9488 \u00b7 {dirs} \u4e2a\u65b9\u5411 \u00b7 \u95f4\u8ddd {s} px \u00b7 \u533a\u95f4 [{a}, {b}] px",
      caption: "\u753b\u51fa\u5149\u6e90\u548c\u5899\uff0c\u6bcf\u4e2a\u50cf\u7d20\u90fd\u4f1a\u5f97\u5230\u5b9e\u65f6\u7684\u4e8c\u7ef4\u5168\u5c40\u5149\u7167\uff1a\u534a\u5f71\u968f\u8ddd\u79bb\u53d8\u5bbd\u7684\u8f6f\u9634\u5f71\uff0c\u4ee5\u53ca\u88ab\u7167\u4eae\u7684\u5899\u9762\u5e26\u6765\u7684\u989c\u8272\u6e17\u900f\uff08color bleeding\uff09\u3002\u5148\u7528\u8df3\u8dc3\u6cdb\u6d2a\uff08jump flooding\uff0cRong \u4e0e Tan 2006\uff09\u628a\u573a\u666f\u53d8\u6210\u8ddd\u79bb\u573a\uff1b\u518d\u7528\u8f90\u5c04\u7ea7\u8054\uff08radiance cascades\uff0cSannikov 2023\uff09\u628a\u8f90\u5c04\u5ea6\u5b58\u653e\u5728\u63a2\u9488\u7f51\u683c\u4e0a\uff1a\u6bcf\u5347\u4e00\u7ea7\uff0c\u63a2\u9488\u95f4\u8ddd\u52a0\u500d\uff0c\u5149\u7ebf\u65b9\u5411\u6570\u53d8\u4e3a 4 \u500d\uff0c\u6bcf\u6761\u5149\u7ebf\u53ea\u6b65\u8fdb\u5c5e\u4e8e\u81ea\u5df1\u7684\u8ddd\u79bb\u533a\u95f4\uff0c\u800c\u533a\u95f4\u957f\u5ea6\u4e5f\u53d8\u4e3a 4 \u500d\uff0c\u56e0\u6b64\u6bcf\u4e00\u7ea7\u7684\u5f00\u9500\u76f8\u540c\u3002\u5404\u7ea7\u4ece\u7c97\u5230\u7ec6\u5408\u5e76\uff0c\u6700\u7ec6\u7684\u4e00\u7ea7\u518d\u63d2\u503c\u5230\u50cf\u7d20\u3002\u628a\u89c6\u56fe\u5207\u6362\u5230\u201c\u63a2\u9488\u201d\u6216\u201c\u7ea7\u8054\u7eb9\u7406\u201d\u53ef\u4ee5\u770b\u5230\u6570\u636e\u7ed3\u6784\uff1b\u5173\u95ed\u53cc\u7ebf\u6027\u4fee\u6b63\uff0c\u53ef\u4ee5\u770b\u5230\u4e24\u7ea7\u5149\u7ebf\u8854\u63a5\u4e0d\u4e0a\u65f6\u51fa\u73b0\u7684\u6f0f\u5149\u3002\u53cd\u5f39\u5149\u8ba9\u5899\u9762\u91cd\u65b0\u53d1\u51fa\u4e0a\u4e00\u5e27\u5149\u7167\u7684\u4e00\u90e8\u5206\uff08\u6bcf\u5e27\u4e00\u6b21\u53cd\u5f39\uff09\u3002",
      link: "\u539f\u7406\uff1agraphics 11 \u4e2d\u7684\u5b9e\u65f6\u5168\u5c40\u5149\u7167 \u2192",
      nogl: "\u6b64\u6f14\u793a\u9700\u8981\u652f\u6301\u6d6e\u70b9\u6e32\u67d3\u76ee\u6807\u7684 WebGL 2\uff0c\u4f60\u7684\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u3002"
    },
    ja: {
      title: "Radiance Cascades \u306b\u3088\u308b 2D \u30b0\u30ed\u30fc\u30d0\u30eb\u30a4\u30eb\u30df\u30cd\u30fc\u30b7\u30e7\u30f3",
      hint: "\u30c9\u30e9\u30c3\u30b0\u3067\u63cf\u753b\u3002\u30c4\u30fc\u30eb\u306f\u4e0b\u3067\u9078\u3079\u307e\u3059\u3002",
      hintProbe: "\u30c9\u30e9\u30c3\u30b0\u307e\u305f\u306f\u30db\u30d0\u30fc\u3067\u30d7\u30ed\u30fc\u30d6\u3092\u52d5\u304b\u305b\u307e\u3059\u3002",
      light: "\u5149\u6e90", wall: "\u58c1", erase: "\u6d88\u53bb", brush: "\u30d6\u30e9\u30b7",
      vGI: "\u7167\u660e", vSDF: "\u8ddd\u96e2\u5834", vProbes: "\u30d7\u30ed\u30fc\u30d6", vRaw: "\u30ab\u30b9\u30b1\u30fc\u30c9",
      level: "\u30ec\u30d9\u30eb", cascades: "\u30ab\u30b9\u30b1\u30fc\u30c9\u6570", auto: "\u81ea\u52d5",
      fix: "\u30d0\u30a4\u30ea\u30cb\u30a2\u88dc\u6b63", bounce: "\u53cd\u5c04\u5149", orbit: "\u52d5\u304f\u5149\u6e90", exposure: "\u9732\u51fa",
      pRooms: "\u90e8\u5c4b", pPenumbra: "\u534a\u5f71", pNeon: "\u30cd\u30aa\u30f3", pPinhole: "\u30d4\u30f3\u30db\u30fc\u30eb", clear: "\u30af\u30ea\u30a2",
      stats: "{res} \u00b7 \u30ab\u30b9\u30b1\u30fc\u30c9 {n} \u6bb5 \u00b7 \u5230\u9054\u8ddd\u96e2 {reach} px\uff08\u5bfe\u89d2\u7dda\u306e {pct}%\uff09\u00b7 \u6bce\u30d5\u30ec\u30fc\u30e0 {rays} \u672c\u306e\u30ec\u30a4 \u00b7 {fps} fps",
      statsShort: "{res} \u00b7 \u30ab\u30b9\u30b1\u30fc\u30c9 {n} \u6bb5 \u00b7 {rays} \u672c\u306e\u30ec\u30a4 \u00b7 {fps} fps",
      raw: "\u30ab\u30b9\u30b1\u30fc\u30c9 {k}\uff1a\u30d7\u30ed\u30fc\u30d6 {px}\u00d7{py} \u00b7 \u65b9\u5411 {dirs} \u00b7 \u9593\u9694 {s} px \u00b7 \u533a\u9593 [{a}, {b}] px",
      caption: "\u5149\u6e90\u3068\u58c1\u3092\u63cf\u304f\u3068\u3001\u3059\u3079\u3066\u306e\u30d4\u30af\u30bb\u30eb\u306b\u30ea\u30a2\u30eb\u30bf\u30a4\u30e0\u306e 2D \u30b0\u30ed\u30fc\u30d0\u30eb\u30a4\u30eb\u30df\u30cd\u30fc\u30b7\u30e7\u30f3\u304c\u304b\u304b\u308a\u307e\u3059\u3002\u8ddd\u96e2\u3068\u3068\u3082\u306b\u534a\u5f71\u304c\u5e83\u304c\u308b\u30bd\u30d5\u30c8\u30b7\u30e3\u30c9\u30a6\u3084\u3001\u7167\u3089\u3055\u308c\u305f\u58c1\u304b\u3089\u306e\u8272\u306e\u306b\u3058\u307f\uff08color bleeding\uff09\u304c\u898b\u3089\u308c\u307e\u3059\u3002\u307e\u305a\u30b8\u30e3\u30f3\u30d7\u30d5\u30e9\u30c3\u30c7\u30a3\u30f3\u30b0\uff08jump flooding\u3001Rong \u3068 Tan 2006\uff09\u3067\u30b7\u30fc\u30f3\u3092\u8ddd\u96e2\u5834\u306b\u5909\u63db\u3057\u3001\u6b21\u306b Radiance Cascades\uff08Sannikov 2023\uff09\u304c\u30d7\u30ed\u30fc\u30d6\u306e\u30b0\u30ea\u30c3\u30c9\u306b\u653e\u5c04\u8f1d\u5ea6\u3092\u4fdd\u5b58\u3057\u307e\u3059\u3002\u30ec\u30d9\u30eb\u304c\u4e00\u3064\u4e0a\u304c\u308b\u3054\u3068\u306b\u30d7\u30ed\u30fc\u30d6\u9593\u9694\u306f 2 \u500d\u3001\u30ec\u30a4\u306e\u65b9\u5411\u6570\u306f 4 \u500d\u306b\u306a\u308a\u3001\u5404\u30ec\u30a4\u306f\u81ea\u5206\u306e\u62c5\u5f53\u3059\u308b\u8ddd\u96e2\u533a\u9593\u3060\u3051\u3092\u30ec\u30a4\u30de\u30fc\u30c1\u3057\u307e\u3059\u3002\u533a\u9593\u306e\u9577\u3055\u3082 4 \u500d\u306b\u306a\u308b\u306e\u3067\u3001\u3069\u306e\u30ec\u30d9\u30eb\u3082\u30b3\u30b9\u30c8\u306f\u540c\u3058\u3067\u3059\u3002\u30ec\u30d9\u30eb\u306f\u7c97\u3044\u3082\u306e\u304b\u3089\u7d30\u304b\u3044\u3082\u306e\u3078\u3068\u30de\u30fc\u30b8\u3055\u308c\u3001\u6700\u3082\u7d30\u304b\u3044\u30ec\u30d9\u30eb\u304c\u30d4\u30af\u30bb\u30eb\u3078\u88dc\u9593\u3055\u308c\u307e\u3059\u3002\u8868\u793a\u3092\u300c\u30d7\u30ed\u30fc\u30d6\u300d\u3084\u300c\u30ab\u30b9\u30b1\u30fc\u30c9\u300d\u306b\u5207\u308a\u66ff\u3048\u308b\u3068\u30c7\u30fc\u30bf\u69cb\u9020\u304c\u898b\u3048\u3001\u30d0\u30a4\u30ea\u30cb\u30a2\u88dc\u6b63\u3092\u30aa\u30d5\u306b\u3059\u308b\u3068\u30012 \u3064\u306e\u30ec\u30d9\u30eb\u306e\u30ec\u30a4\u304c\u3064\u306a\u304c\u3089\u306a\u3044\u3068\u304d\u306b\u751f\u3058\u308b\u5149\u6f0f\u308c\u304c\u898b\u3048\u307e\u3059\u3002\u53cd\u5c04\u5149\u306f\u3001\u524d\u306e\u30d5\u30ec\u30fc\u30e0\u306e\u5149\u306e\u4e00\u90e8\u3092\u58c1\u304b\u3089\u518d\u653e\u5c04\u3057\u307e\u3059\uff081 \u30d5\u30ec\u30fc\u30e0\u306b 1 \u56de\u306e\u30d0\u30a6\u30f3\u30b9\uff09\u3002",
      link: "\u89e3\u8aac\uff1agraphics 11 \u306e\u30ea\u30a2\u30eb\u30bf\u30a4\u30e0 GI \u2192",
      nogl: "\u3053\u306e\u30c7\u30e2\u306b\u306f\u6d6e\u52d5\u5c0f\u6570\u70b9\u30ec\u30f3\u30c0\u30fc\u30bf\u30fc\u30b2\u30c3\u30c8\u306b\u5bfe\u5fdc\u3057\u305f WebGL 2 \u304c\u5fc5\u8981\u3067\u3059\u304c\u3001\u304a\u4f7f\u3044\u306e\u30d6\u30e9\u30a6\u30b6\u306f\u5bfe\u5fdc\u3057\u3066\u3044\u307e\u305b\u3093\u3002"
    }
  };
  var lang = panel.dataset.lang;
  var S = STR[lang] || STR.en;

  Array.prototype.forEach.call(panel.querySelectorAll("[data-t]"), function (el) {
    el.textContent = S[el.dataset.t];
  });
  panel.querySelector(".rc-caption").textContent = S.caption;
  panel.querySelector(".rc-link").textContent = S.link;
  canvas.setAttribute("aria-label", S.title);
  var hintEl = panel.querySelector(".lab-hint");
  var statsEl = panel.querySelector(".lab-stats");
  hintEl.textContent = S.hint;

  function fail() {
    panel.querySelector(".lab-stage").textContent = S.nogl;
    Array.prototype.forEach.call(panel.querySelectorAll(".lab-controls"), function (c) {
      c.style.display = "none";
    });
  }

  // --------------------------------------------------------------- constants
  var MAXC = 7; // maximum number of cascades
  var S0 = 2; // probe spacing of cascade 0, in scene pixels
  var L0 = 4; // interval length of cascade 0, in scene pixels
  var POWER = 3; // radiance of a painted emitter with colour 1
  function intervalStart(i) { return (L0 * (Math.pow(4, i) - 1)) / 3; }
  function reachOf(n) { return intervalStart(n); }

  // colours are sRGB in [0, 1]
  var PAL = [
    [1.0, 0.9, 0.74], // warm white
    [1.0, 0.52, 0.16], // orange
    [1.0, 0.22, 0.3], // red
    [0.78, 0.36, 1.0], // violet
    [0.2, 0.75, 1.0], // cyan
    [0.3, 0.92, 0.42], // green
    [0.76, 0.78, 0.82], // light grey
    [0.3, 0.31, 0.34] // dark grey
  ];

  // -------------------------------------------------------------- presets
  // Designed on a 16 x 9 board with y pointing down; radii in board units.
  function B(x, y) { return [x / 16, 1 - y / 9]; }
  function stroke(list, t, c, r, pts) {
    var flat = [];
    pts.forEach(function (p) { var q = B(p[0], p[1]); flat.push(q[0], q[1]); });
    list.push({ t: t, c: c, r: r / 9, pts: flat });
  }
  function circlePts(cx, cy, rad, n, a0, a1) {
    var out = [];
    for (var k = 0; k <= n; k++) {
      var a = a0 + ((a1 - a0) * k) / n;
      out.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
    }
    return out;
  }
  var GREY = [0.74, 0.76, 0.8], RED = [0.85, 0.2, 0.2], GREEN = [0.25, 0.78, 0.32], WHITE = [0.92, 0.92, 0.92];
  var PRESETS = {
    rooms: function (L) {
      var w = 0.13;
      stroke(L, 1, GREY, w, [[5.5, -0.5], [5.5, 3.4]]);
      stroke(L, 1, GREY, w, [[5.5, 5.0], [5.5, 9.5]]);
      stroke(L, 1, RED, w, [[10.5, -0.5], [10.5, 5.2]]);
      stroke(L, 1, GREEN, w, [[10.5, 6.7], [10.5, 9.5]]);
      stroke(L, 1, GREY, w, [[10.5, 3.9], [12.9, 3.9]]);
      stroke(L, 1, GREY, w, [[14.3, 3.9], [16.5, 3.9]]);
      stroke(L, 1, GREY, 0.42, [[2.6, 2.6], [3.1, 2.6]]);
      stroke(L, 1, GREY, 0.3, [[13.3, 6.6]]);
      stroke(L, 2, PAL[0], 0.33, [[1.6, 6.9]]);
      stroke(L, 2, PAL[4], 0.26, [[14.6, 1.6]]);
      stroke(L, 2, PAL[3], 0.2, [[15.2, 8.0]]);
      return { orbit: true, exp: -0.7, path: [8, 4.6, 1.4, 2.9] };
    },
    penumbra: function (L) {
      stroke(L, 2, PAL[0], 0.16, [[4.5, 0.7], [11.5, 0.7]]);
      stroke(L, 1, WHITE, 0.32, [[4.2, 3.6]]);
      stroke(L, 1, WHITE, 0.22, [[7.4, 2.6]]);
      stroke(L, 1, WHITE, 0.12, [[9.6, 3.0], [10.8, 3.0]]);
      stroke(L, 1, WHITE, 0.4, [[12.6, 4.4]]);
      stroke(L, 1, WHITE, 0.1, [[6.2, 5.6], [7.6, 6.4]]);
      return { orbit: false, exp: -0.4, path: [8, 4.5, 5.5, 2.8] };
    },
    neon: function (L) {
      stroke(L, 2, PAL[4], 0.07, circlePts(3.6, 4.5, 1.9, 40, 0.3, 2 * Math.PI - 0.3));
      stroke(L, 1, PAL[7], 0.55, [[3.6, 4.5]]);
      stroke(L, 2, PAL[3], 0.07, [[6.6, 1.7], [7.6, 2.7], [8.6, 1.7], [9.6, 2.7], [10.6, 1.7], [11.6, 2.7], [12.6, 1.7]]);
      stroke(L, 2, PAL[1], 0.08, [[7.2, 7.6], [12.4, 7.6]]);
      stroke(L, 2, PAL[5], 0.08, [[14.6, 3.0], [14.6, 6.2]]);
      stroke(L, 2, PAL[2], 0.08, [[1.2, 0.8], [2.6, 0.8]]);
      stroke(L, 1, PAL[7], 0.45, [[9.0, 4.7], [10.2, 4.7]]);
      stroke(L, 1, PAL[6], 0.25, [[12.4, 4.4]]);
      return { orbit: false, exp: -1.3, path: [9.5, 4.8, 4.0, 1.4] };
    },
    pinhole: function (L) {
      var w = 0.14;
      stroke(L, 1, GREY, w, [[7.0, -0.5], [7.0, 4.15]]);
      stroke(L, 1, GREY, w, [[7.0, 4.85], [7.0, 9.5]]);
      stroke(L, 1, WHITE, 0.1, [[12.8, 0.8], [12.8, 8.2]]);
      stroke(L, 2, PAL[2], 0.32, [[2.6, 2.2]]);
      stroke(L, 2, PAL[5], 0.32, [[2.0, 4.5]]);
      stroke(L, 2, [0.25, 0.45, 1.0], 0.32, [[2.6, 6.8]]);
      return { orbit: false, exp: 0.3, path: [3.5, 4.5, 2.2, 3.2] };
    }
  };

  // --------------------------------------------------------------- shaders
  var VS_FULL = [
    "#version 300 es",
    "void main() {",
    "  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));",
    "  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);",
    "}"
  ].join("\n");

  var HEAD = [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    "precision highp isampler2D;",
    "const float TAU = 6.28318530718;",
    "vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }",
    ""
  ].join("\n");

  // The painted scene lives in a texture at canvas resolution: rgb = sRGB
  // colour, a = 0 empty, 0.5 wall, 1 emitter. The moving light is analytic.
  var SCENE = [
    "uniform sampler2D uScene;",
    "uniform vec2 uHi;", // scene texture size
    "uniform vec4 uOrb;", // centre (uv), radius (in heights), on
    "uniform vec3 uOrbCol;",
    "uniform float uAspect;",
    "vec4 sceneUV(vec2 uv) {",
    "  if (uOrb.w > 0.5) {",
    "    vec2 d = (uv - uOrb.xy) * vec2(uAspect, 1.0);",
    "    if (dot(d, d) < uOrb.z * uOrb.z) return vec4(uOrbCol, 1.0);",
    "  }",
    "  return texelFetch(uScene, ivec2(clamp(uv, 0.0, 0.9999) * uHi), 0);",
    "}",
    ""
  ].join("\n");

  var FS_SEED = HEAD + SCENE + [
    "uniform vec2 uS;",
    "layout(location = 0) out ivec4 o;",
    "void main() {",
    "  ivec2 px = ivec2(gl_FragCoord.xy);",
    "  vec4 s = sceneUV((vec2(px) + 0.5) / uS);",
    "  o = s.a > 0.25 ? ivec4(px, 0, 0) : ivec4(-1, -1, 0, 0);",
    "}"
  ].join("\n");

  var FS_JFA = HEAD + [
    "uniform isampler2D uIn;",
    "uniform int uStep;",
    "uniform ivec2 uSize;",
    "layout(location = 0) out ivec4 o;",
    "void main() {",
    "  ivec2 px = ivec2(gl_FragCoord.xy);",
    "  ivec2 best = ivec2(-1);",
    "  float bd = 1e20;",
    "  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {",
    "    ivec2 q = px + ivec2(i, j) * uStep;",
    "    if (q.x < 0 || q.y < 0 || q.x >= uSize.x || q.y >= uSize.y) continue;",
    "    ivec2 s = texelFetch(uIn, q, 0).xy;",
    "    if (s.x < 0) continue;",
    "    vec2 d = vec2(s - px);",
    "    float dd = dot(d, d);",
    "    if (dd < bd) { bd = dd; best = s; }",
    "  }",
    "  o = ivec4(best, 0, 0);",
    "}"
  ].join("\n");

  var FS_DIST = HEAD + [
    "uniform isampler2D uIn;",
    "out vec4 o;",
    "void main() {",
    "  ivec2 px = ivec2(gl_FragCoord.xy);",
    "  ivec2 s = texelFetch(uIn, px, 0).xy;",
    "  o = vec4(s.x < 0 ? 1e4 : length(vec2(s - px)), 0.0, 0.0, 1.0);",
    "}"
  ].join("\n");

  // outgoing radiance of every occupied scene pixel; a = 1 emitter, 0.5 wall
  var FS_EMIT = HEAD + SCENE + [
    "uniform vec2 uS;",
    "uniform sampler2D uDist;",
    "uniform sampler2D uGIPrev;",
    "uniform sampler2D uEPrev;",
    "uniform float uPower;",
    "uniform float uBounce;",
    "out vec4 o;",
    "void main() {",
    "  ivec2 px = ivec2(gl_FragCoord.xy);",
    "  vec4 s = sceneUV((vec2(px) + 0.5) / uS);",
    "  if (s.a > 0.75) { o = vec4(lin(s.rgb) * uPower, 1.0); return; }",
    "  if (s.a < 0.25) { o = vec4(0.0); return; }",
    "  ivec2 sz = ivec2(uS);",
    "  vec3 acc = vec3(0.0);",
    "  float n = 0.0;",
    "  for (int k = 0; k < 24; k++) {",
    "    float a = float(k) * (TAU / 8.0) + float(k / 8) * (TAU / 24.0);",
    "    float r = 2.5 + 2.75 * float(k / 8);",
    "    ivec2 q = px + ivec2(floor(vec2(cos(a), sin(a)) * r + 0.5));",
    "    if (q.x < 0 || q.y < 0 || q.x >= sz.x || q.y >= sz.y) continue;",
    "    if (texelFetch(uDist, q, 0).r < 0.5) continue;",
    "    acc += texelFetch(uGIPrev, q, 0).rgb;",
    "    n += 1.0;",
    "  }",
    "  vec3 phi = n > 0.0 ? acc / n : vec3(0.0);",
    "  vec3 lprev = texelFetch(uEPrev, px, 0).rgb;",
    "  vec3 R = lin(s.rgb) * max(2.0 * phi - uBounce * lprev, 0.0);",
    "  o = vec4(min(R, vec3(64.0)), 0.5);",
    "}"
  ].join("\n");

  // one cascade; see the header comment
  var FS_CASCADE = HEAD + [
    "uniform sampler2D uDist;",
    "uniform sampler2D uEmit;",
    "uniform sampler2D uUpper;",
    "uniform vec2 uS;", // scene size in pixels
    "uniform ivec2 uP;", // probes of this cascade
    "uniform int uD;", // direction tiles per axis
    "uniform ivec2 uUP;", // probes of the upper cascade
    "uniform float uSp;", // probe spacing
    "uniform float uA;", // interval start
    "uniform float uB;", // interval end
    "uniform int uHasUpper;",
    "uniform int uFix;",
    "uniform float uBounce;",
    "out vec4 o;",
    // sphere tracing over the distance field from 'from' to 'to'.
    // rgb = radiance gathered, a = transmittance (1 if nothing was hit)
    "vec4 march(vec2 from, vec2 to) {",
    "  vec2 d = to - from;",
    "  float len = length(d);",
    "  vec2 dir = d / max(len, 1e-6);",
    "  float t = 0.0;",
    "  for (int k = 0; k < 64; k++) {",
    "    vec2 p = from + dir * t;",
    "    if (p.x < 0.0 || p.y < 0.0 || p.x >= uS.x || p.y >= uS.y) break;",
    "    ivec2 ip = ivec2(p);",
    "    float sd = texelFetch(uDist, ip, 0).r;",
    "    if (sd < 0.5) {",
    "      vec4 e = texelFetch(uEmit, ip, 0);",
    "      return vec4(e.rgb * (e.a > 0.75 ? 1.0 : uBounce), 0.0);",
    "    }",
    // the distance is measured between pixel centres: stepping sd - 1 can enter
    // an occupied cell by a fraction of a pixel (it is then detected) but never
    // jump over one
    "    t += max(sd - 1.0, 0.8);",
    "    if (t >= len) break;",
    "  }",
    "  return vec4(0.0, 0.0, 0.0, 1.0);",
    "}",
    // upper radiance in the 4 child directions of k, at upper probe q
    "vec3 upperAvg(ivec2 q, int k) {",
    "  int du = uD * 2;",
    "  vec3 s = vec3(0.0);",
    "  for (int j = 0; j < 4; j++) {",
    "    int c = 4 * k + j;",
    "    s += texelFetch(uUpper, ivec2(c % du, c / du) * uUP + q, 0).rgb;",
    "  }",
    "  return s * 0.25;",
    "}",
    "void main() {",
    "  ivec2 tc = ivec2(gl_FragCoord.xy);",
    "  ivec2 tile = tc / uP;",
    "  ivec2 pr = tc - tile * uP;",
    "  int k = tile.y * uD + tile.x;",
    "  float ang = (float(k) + 0.5) * TAU / float(uD * uD);",
    "  vec2 dir = vec2(cos(ang), sin(ang));",
    "  vec2 pos = (vec2(pr) + 0.5) * uSp;",
    "  if (uHasUpper == 0) {",
    "    o = vec4(march(pos + dir * uA, pos + dir * uB).rgb, 1.0);",
    "    return;",
    "  }",
    "  vec2 g = pos / (2.0 * uSp) - 0.5;",
    "  vec2 fl = floor(g);",
    "  vec2 f = g - fl;",
    "  ivec2 b = ivec2(fl);",
    "  vec4 r0 = uFix == 0 ? march(pos + dir * uA, pos + dir * uB) : vec4(0.0);",
    "  vec3 acc = vec3(0.0);",
    "  for (int j = 0; j < 4; j++) {",
    "    ivec2 off = ivec2(j & 1, j >> 1);",
    "    ivec2 q = clamp(b + off, ivec2(0), uUP - 1);",
    "    float w = (off.x == 1 ? f.x : 1.0 - f.x) * (off.y == 1 ? f.y : 1.0 - f.y);",
    "    vec4 r = r0;",
    "    if (uFix == 1) {",
    "      vec2 qpos = (vec2(q) + 0.5) * (2.0 * uSp);",
    "      r = march(pos + dir * uA, qpos + dir * uB);",
    "    }",
    "    vec3 up = r.a > 0.0 ? upperAvg(q, k) : vec3(0.0);",
    "    acc += w * (r.rgb + r.a * up);",
    "  }",
    "  o = vec4(acc, 1.0);",
    "}"
  ].join("\n");

  // fluence at each scene pixel: bilinear over cascade-0 probes, mean of their 4 directions
  var FS_GI = HEAD + [
    "uniform sampler2D uC0;",
    "uniform sampler2D uDist;",
    "uniform ivec2 uP0;",
    "uniform float uSp0;",
    "out vec4 o;",
    "void main() {",
    "  vec2 g = gl_FragCoord.xy / uSp0 - 0.5;",
    "  vec2 fl = floor(g);",
    "  vec2 f = g - fl;",
    "  ivec2 b = ivec2(fl);",
    "  vec3 acc = vec3(0.0), accAll = vec3(0.0);",
    "  float ws = 0.0;",
    "  bool self = texelFetch(uDist, ivec2(gl_FragCoord.xy), 0).r < 0.5;",
    "  for (int j = 0; j < 4; j++) {",
    "    ivec2 off = ivec2(j & 1, j >> 1);",
    "    ivec2 q = clamp(b + off, ivec2(0), uP0 - 1);",
    "    float w = (off.x == 1 ? f.x : 1.0 - f.x) * (off.y == 1 ? f.y : 1.0 - f.y);",
    "    vec3 s = texelFetch(uC0, q, 0).rgb + texelFetch(uC0, q + ivec2(uP0.x, 0), 0).rgb",
    "           + texelFetch(uC0, q + ivec2(0, uP0.y), 0).rgb + texelFetch(uC0, q + uP0, 0).rgb;",
    // a probe inside a wall or an emitter only sees that surface; leave it out
    // unless this pixel is itself occupied, or every probe around is
    "    float inside = texelFetch(uDist, ivec2((vec2(q) + 0.5) * uSp0), 0).r < 0.5 ? 1.0 : 0.0;",
    "    if (self || inside < 0.5) { acc += w * 0.25 * s; ws += w; }",
    "    accAll += w * 0.25 * s;",
    "  }",
    "  o = vec4(ws > 0.0 ? acc / ws : accAll, 1.0);",
    "}"
  ].join("\n");

  var FS_SHOW = HEAD + SCENE + [
    "uniform vec2 uCanvas;",
    "uniform vec2 uS;",
    "uniform int uView;",
    "uniform float uExposure;",
    "uniform float uPower;",
    "uniform sampler2D uGI;",
    "uniform sampler2D uEmit;",
    "uniform sampler2D uDist;",
    "uniform sampler2D uCasc;",
    "uniform ivec2 uCascSize;",
    "uniform ivec2 uCascP;",
    "uniform vec4 uCursor;", // canvas px, radius px, on
    "out vec4 o;",
    "vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }",
    "vec3 tone(vec3 x) { return pow(aces(x * uExposure), vec3(1.0 / 2.2)); }",
    "float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }",
    // reflected radiance of walls, interpolated only between wall texels
    "vec3 wallLight(vec2 uv) {",
    "  vec2 g = uv * uS - 0.5;",
    "  vec2 fl = floor(g);",
    "  vec2 f = g - fl;",
    "  vec3 acc = vec3(0.0);",
    "  float ws = 0.0;",
    "  for (int j = 0; j < 4; j++) {",
    "    ivec2 off = ivec2(j & 1, j >> 1);",
    "    ivec2 q = clamp(ivec2(fl) + off, ivec2(0), ivec2(uS) - 1);",
    "    vec4 e = texelFetch(uEmit, q, 0);",
    "    float w = (off.x == 1 ? f.x : 1.0 - f.x) * (off.y == 1 ? f.y : 1.0 - f.y);",
    "    if (e.a > 0.25 && e.a < 0.75) { acc += w * e.rgb; ws += w; }",
    "  }",
    "  return ws > 0.0 ? acc / ws : vec3(0.0);",
    "}",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / uCanvas;",
    "  vec4 s = sceneUV(uv);",
    "  vec3 col;",
    "  if (uView == 3) {",
    "    ivec2 t = ivec2(uv * vec2(uCascSize));",
    "    col = tone(texelFetch(uCasc, t, 0).rgb);",
    "    ivec2 m = t - (t / uCascP) * uCascP;",
    "    vec2 e = fwidth(uv * vec2(uCascSize));",
    "    if (float(m.x) < e.x || float(m.y) < e.y) col = mix(col, vec3(0.45, 0.55, 0.7), 0.7);",
    "  } else if (uView == 1) {",
    "    float d = texture(uDist, uv).r;",
    "    if (s.a > 0.25) col = s.rgb * (s.a > 0.75 ? 1.0 : 0.75);",
    "    else {",
    "      vec3 base = mix(vec3(0.03, 0.05, 0.1), vec3(0.22, 0.45, 0.85), 1.0 - exp(-d / (0.2 * uS.y)));",
    "      float k = d / 6.0;",
    "      float fw = max(fwidth(k), 1e-3);",
    "      float ln = 1.0 - smoothstep(0.0, 1.5 * fw, abs(fract(k + 0.5) - 0.5));",
    "      float major = 1.0 - smoothstep(0.0, 1.5 * fw, abs(fract(k / 4.0 + 0.5) - 0.5) * 4.0);",
    "      col = pow(base, vec3(1.0 / 2.2)) + vec3(0.16) * ln + vec3(0.25) * major;",
    "    }",
    "  } else {",
    "    vec3 c;",
    "    if (s.a > 0.75) c = lin(s.rgb) * uPower;",
    "    else if (s.a > 0.25) c = lin(s.rgb) * 0.025 + wallLight(uv);",
    "    else c = texture(uGI, uv).rgb;",
    "    col = tone(c);",
    "  }",
    "  if (uCursor.w > 0.5) {",
    "    float r = length(gl_FragCoord.xy - uCursor.xy);",
    "    col = mix(col, vec3(1.0), 0.55 * (1.0 - smoothstep(0.0, 1.2, abs(r - uCursor.z))));",
    "  }",
    "  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;",
    "  o = vec4(col, 1.0);",
    "}"
  ].join("\n");

  // painting: one instanced quad per capsule segment
  var VS_BRUSH = [
    "#version 300 es",
    "in vec2 aCorner;",
    "in vec4 aSeg;", // p0, p1 in uv
    "in float aRad;", // radius in heights
    "in vec4 aCol;", // rgb, type code
    "uniform vec2 uRes;",
    "uniform float uMinR;",
    "flat out vec4 vSeg;",
    "flat out float vR;",
    "flat out vec4 vCol;",
    "void main() {",
    "  vec2 p0 = aSeg.xy * uRes, p1 = aSeg.zw * uRes;",
    "  float r = max(aRad * uRes.y, uMinR);",
    "  vec2 lo = min(p0, p1) - r - 2.0, hi = max(p0, p1) + r + 2.0;",
    "  vec2 p = mix(lo, hi, aCorner);",
    "  vSeg = vec4(p0, p1); vR = r; vCol = aCol;",
    "  gl_Position = vec4(p / uRes * 2.0 - 1.0, 0.0, 1.0);",
    "}"
  ].join("\n");
  var FS_BRUSH = [
    "#version 300 es",
    "precision highp float;",
    "flat in vec4 vSeg;",
    "flat in float vR;",
    "flat in vec4 vCol;",
    "out vec4 o;",
    "void main() {",
    "  vec2 p = gl_FragCoord.xy, a = vSeg.xy, b = vSeg.zw;",
    "  vec2 ba = b - a;",
    "  float h = clamp(dot(p - a, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);",
    "  if (length(p - a - ba * h) > vR) discard;",
    "  o = vCol;",
    "}"
  ].join("\n");

  // probe overlay: each vertex is a ray start or a ray end; ends are marched
  // through the distance field so the intervals stop at walls
  var VS_LINE = HEAD + [
    "in vec2 aProbe;", // scene px
    "in vec4 aRay;", // angle, start, end, kind (0 start, 1 marched end, 2 plain end)
    "in float aLevel;",
    "uniform sampler2D uDist;",
    "uniform vec2 uS;",
    "out vec4 vCol;",
    "vec3 levelCol(float l) {",
    "  vec3 c[7] = vec3[7](vec3(1.0, 0.3, 0.3), vec3(1.0, 0.62, 0.2), vec3(0.98, 0.92, 0.3), vec3(0.4, 0.95, 0.45), vec3(0.3, 0.85, 1.0), vec3(0.5, 0.55, 1.0), vec3(0.95, 0.45, 1.0));",
    "  return c[int(l)];",
    "}",
    "void main() {",
    "  vec2 dir = vec2(cos(aRay.x), sin(aRay.x));",
    "  vec2 p = aProbe + dir * (aRay.w > 1.5 ? aRay.z : aRay.y);",
    "  float a = 0.8;",
    "  if (aRay.w > 0.5 && aRay.w < 1.5) {",
    "    vec2 from = aProbe + dir * aRay.y;",
    "    float len = aRay.z - aRay.y, t = 0.0;",
    "    for (int k = 0; k < 96; k++) {",
    "      vec2 q = from + dir * t;",
    "      if (q.x < 0.0 || q.y < 0.0 || q.x >= uS.x || q.y >= uS.y) break;",
    "      float sd = texelFetch(uDist, ivec2(q), 0).r;",
    "      if (sd < 0.5) break;",
    "      t += max(sd - 1.0, 0.8);",
    "      if (t >= len) { t = len; break; }",
    "    }",
    "    p = from + dir * min(t, len);",
    "    a = 0.35;",
    "  }",
    "  vCol = vec4(levelCol(aLevel), a);",
    "  gl_Position = vec4(p / uS * 2.0 - 1.0, 0.0, 1.0);",
    "}"
  ].join("\n");
  var FS_LINE = "#version 300 es\nprecision highp float;\nin vec4 vCol;\nout vec4 o;\nvoid main() { o = vCol; }";

  // ----------------------------------------------------------------- GL utils
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
    var out = { p: p, u: {}, a: {} };
    var i, info;
    for (i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
      info = gl.getActiveUniform(p, i);
      out.u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
    }
    for (i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++) {
      info = gl.getActiveAttrib(p, i);
      out.a[info.name] = gl.getAttribLocation(p, info.name);
    }
    return out;
  }

  // ------------------------------------------------------------------ start
  function start() {
    var gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return fail();
    var P;
    try {
      P = {
        seed: program(gl, VS_FULL, FS_SEED),
        jfa: program(gl, VS_FULL, FS_JFA),
        dist: program(gl, VS_FULL, FS_DIST),
        emit: program(gl, VS_FULL, FS_EMIT),
        casc: program(gl, VS_FULL, FS_CASCADE),
        gi: program(gl, VS_FULL, FS_GI),
        show: program(gl, VS_FULL, FS_SHOW),
        brush: program(gl, VS_BRUSH, FS_BRUSH),
        line: program(gl, VS_LINE, FS_LINE)
      };
    } catch (err) {
      if (window.console) console.warn(err);
      return fail();
    }

    // ---------------------------------------------------------- state
    var st = {
      tool: 2, view: 0, fix: true, bounce: true, orbit: true, exposure: 0,
      brush: 0.016, userN: 0, level: 0,
      color: { 2: 0, 1: 6 } // palette index per tool
    };
    var strokes = [];
    var orbPath = [8, 4.6, 1.4, 2.9];
    var orbT = 0;
    var probeAt = [0.5, 0.5];
    var cursor = null; // [x, y] uv, mouse hover only

    // ------------------------------------------------------- resources
    var emptyVao = gl.createVertexArray();
    function makeTex(w, h, ifmt, fmt, type, filter) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) throw new Error("incomplete framebuffer");
      return { t: t, fb: fb, w: w, h: h };
    }
    function freeTex(x) {
      if (!x) return;
      gl.deleteTexture(x.t);
      gl.deleteFramebuffer(x.fb);
    }
    function f16(w, h, filter) { return makeTex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, filter); }

    // brush geometry: unit quad corners + one instance per segment
    var brushVao = gl.createVertexArray();
    gl.bindVertexArray(brushVao);
    var cornerBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(P.brush.a.aCorner);
    gl.vertexAttribPointer(P.brush.a.aCorner, 2, gl.FLOAT, false, 0, 0);
    var instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    [["aSeg", 4, 0], ["aRad", 1, 16], ["aCol", 4, 20]].forEach(function (d) {
      var loc = P.brush.a[d[0]];
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, d[1], gl.FLOAT, false, 36, d[2]);
      gl.vertexAttribDivisor(loc, 1);
    });
    gl.bindVertexArray(null);

    var lineVao = gl.createVertexArray();
    gl.bindVertexArray(lineVao);
    var lineBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    [["aProbe", 2, 0], ["aRay", 4, 8], ["aLevel", 1, 24]].forEach(function (d) {
      var loc = P.line.a[d[0]];
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, d[1], gl.FLOAT, false, 28, d[2]);
    });
    gl.bindVertexArray(null);

    var R = null; // all size-dependent resources
    var CW = 0, CH = 0; // canvas pixels
    var SW = 0, SH = 0; // scene (lighting) pixels
    var qf = canvas.clientWidth < 500 ? 1.0 : 0.8; // scene pixels per CSS pixel
    var pending = []; // segments waiting to be painted into the scene texture
    var repaintAll = true;

    function cascadeDims(i) {
      var sp = S0 * Math.pow(2, i), d = Math.pow(2, i + 1);
      var px = Math.ceil(SW / sp), py = Math.ceil(SH / sp);
      return { sp: sp, d: d, px: px, py: py, w: px * d, h: py * d, a: intervalStart(i), b: intervalStart(i + 1) };
    }
    function autoN() {
      var diag = Math.sqrt(SW * SW + SH * SH);
      for (var n = 1; n < MAXC; n++) if (reachOf(n) >= diag) return n;
      return MAXC;
    }
    function nCasc() { return st.userN || autoN(); }

    function allocCanvas(w, h) {
      CW = w;
      CH = h;
      if (R && R.scene) freeTex(R.scene);
      R = R || {};
      R.scene = makeTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
      repaintAll = true;
    }
    function allocScene() {
      var w = Math.max(96, Math.round(canvas.clientWidth * qf));
      var h = Math.max(54, Math.round((w * CH) / CW));
      if (w === SW && h === SH && R.dist) return;
      SW = w;
      SH = h;
      ["jfa0", "jfa1", "dist", "e0", "e1", "g0", "g1"].forEach(function (k) { freeTex(R[k]); });
      (R.casc || []).forEach(freeTex);
      R.jfa0 = makeTex(w, h, gl.RG16I, gl.RG_INTEGER, gl.SHORT, gl.NEAREST);
      R.jfa1 = makeTex(w, h, gl.RG16I, gl.RG_INTEGER, gl.SHORT, gl.NEAREST);
      R.dist = makeTex(w, h, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
      R.e0 = f16(w, h, gl.NEAREST);
      R.e1 = f16(w, h, gl.NEAREST);
      R.g0 = f16(w, h, gl.LINEAR);
      R.g1 = f16(w, h, gl.LINEAR);
      R.casc = [];
      for (var i = 0; i < MAXC; i++) {
        var c = cascadeDims(i);
        R.casc.push(f16(c.w, c.h, gl.NEAREST));
      }
      syncCascUI();
    }

    // ------------------------------------------------------------ painting
    function segData(list) {
      var out = new Float32Array(list.length * 9);
      list.forEach(function (s, i) {
        out.set(s, i * 9);
      });
      return out;
    }
    function strokeSegs(sk, from) {
      var pts = sk.pts, out = [];
      var code = sk.t === 2 ? 1 : sk.t === 1 ? 0.5 : 0;
      var c = sk.t === 0 ? [0, 0, 0] : sk.c;
      var n = pts.length / 2;
      for (var i = Math.max(from, 0); i < n; i++) {
        var j = Math.max(i - 1, 0);
        out.push([pts[2 * j], pts[2 * j + 1], pts[2 * i], pts[2 * i + 1], sk.r, c[0], c[1], c[2], code]);
      }
      return out;
    }
    function rasterize(segs, clear) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.scene.fb);
      gl.viewport(0, 0, CW, CH);
      if (clear) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      if (!segs.length) return;
      gl.useProgram(P.brush.p);
      gl.uniform2f(P.brush.u.uRes, CW, CH);
      gl.uniform1f(P.brush.u.uMinR, (0.9 * CH) / SH);
      gl.bindVertexArray(brushVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      gl.bufferData(gl.ARRAY_BUFFER, segData(segs), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segs.length);
      gl.bindVertexArray(null);
    }
    function flushPaint() {
      if (repaintAll) {
        var all = [];
        strokes.forEach(function (sk) { all = all.concat(strokeSegs(sk, 0)); });
        rasterize(all, true);
        repaintAll = false;
        pending = [];
      } else if (pending.length) {
        rasterize(pending, false);
        pending = [];
      }
    }

    // ------------------------------------------------------------- frame
    var cur = 0; // ping-pong index for emission and fluence
    var dirty = 60;
    var needShow = true;

    function bindTex(prog, name, unit, tex) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex.t);
      gl.uniform1i(prog.u[name], unit);
    }
    function target(tex, prog) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, tex ? tex.fb : null);
      if (tex) gl.viewport(0, 0, tex.w, tex.h);
      else gl.viewport(0, 0, CW, CH);
      gl.useProgram(prog.p);
    }
    function orbUV() {
      var t = orbT;
      return B(orbPath[0] + orbPath[2] * Math.sin(t * 0.53), orbPath[1] + orbPath[3] * Math.sin(t * 0.71 + 1.0));
    }
    function sceneUniforms(prog) {
      bindTex(prog, "uScene", 0, R.scene);
      gl.uniform2f(prog.u.uHi, CW, CH);
      var o = orbUV();
      gl.uniform4f(prog.u.uOrb, o[0], o[1], 0.24 / 9, st.orbit ? 1 : 0);
      gl.uniform3f(prog.u.uOrbCol, 1.0, 0.86, 0.66);
      gl.uniform1f(prog.u.uAspect, CW / CH);
    }

    function compute() {
      var n = nCasc();
      gl.bindVertexArray(emptyVao);
      gl.disable(gl.BLEND);
      var prev = cur ^ 1;
      var u;

      // 1. distance field by jump flooding
      target(R.jfa0, P.seed);
      sceneUniforms(P.seed);
      gl.uniform2f(P.seed.u.uS, SW, SH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      var src = R.jfa0, dst = R.jfa1;
      var step = Math.pow(2, Math.ceil(Math.log(Math.max(SW, SH)) / Math.LN2) - 1);
      for (; step >= 1; step = step / 2) {
        target(dst, P.jfa);
        bindTex(P.jfa, "uIn", 1, src);
        gl.uniform1i(P.jfa.u.uStep, step);
        gl.uniform2i(P.jfa.u.uSize, SW, SH);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        var tmp = src;
        src = dst;
        dst = tmp;
      }
      target(R.dist, P.dist);
      bindTex(P.dist, "uIn", 1, src);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 2. emission and wall reflection
      var eCur = cur ? R.e1 : R.e0, ePrev = cur ? R.e0 : R.e1;
      var gCur = cur ? R.g1 : R.g0, gPrev = cur ? R.g0 : R.g1;
      u = P.emit;
      target(eCur, u);
      sceneUniforms(u);
      gl.uniform2f(u.u.uS, SW, SH);
      bindTex(u, "uDist", 1, R.dist);
      bindTex(u, "uGIPrev", 2, gPrev);
      bindTex(u, "uEPrev", 3, ePrev);
      gl.uniform1f(u.u.uPower, POWER);
      gl.uniform1f(u.u.uBounce, st.bounce ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 3. cascades, top down
      u = P.casc;
      for (var i = n - 1; i >= 0; i--) {
        var c = cascadeDims(i);
        target(R.casc[i], u);
        bindTex(u, "uDist", 1, R.dist);
        bindTex(u, "uEmit", 2, eCur);
        bindTex(u, "uUpper", 3, i + 1 < MAXC ? R.casc[i + 1] : R.dist); // never the render target
        gl.uniform2f(u.u.uS, SW, SH);
        gl.uniform2i(u.u.uP, c.px, c.py);
        gl.uniform1i(u.u.uD, c.d);
        var cu = cascadeDims(i + 1);
        gl.uniform2i(u.u.uUP, cu.px, cu.py);
        gl.uniform1f(u.u.uSp, c.sp);
        gl.uniform1f(u.u.uA, c.a);
        gl.uniform1f(u.u.uB, c.b);
        gl.uniform1i(u.u.uHasUpper, i < n - 1 ? 1 : 0);
        gl.uniform1i(u.u.uFix, st.fix ? 1 : 0);
        gl.uniform1f(u.u.uBounce, st.bounce ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // 4. fluence per scene pixel
      u = P.gi;
      target(gCur, u);
      var c0 = cascadeDims(0);
      bindTex(u, "uC0", 1, R.casc[0]);
      bindTex(u, "uDist", 2, R.dist);
      gl.uniform2i(u.u.uP0, c0.px, c0.py);
      gl.uniform1f(u.u.uSp0, c0.sp);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      R.eShow = eCur;
      R.gShow = gCur;
      cur = prev;
    }

    var lineCount = 0;
    function buildLines() {
      var n = nCasc(), v = [];
      var px = probeAt[0] * SW, py = probeAt[1] * SH;
      for (var i = 0; i < n; i++) {
        var c = cascadeDims(i);
        var jx = Math.min(c.px - 1, Math.max(0, Math.floor(px / c.sp)));
        var jy = Math.min(c.py - 1, Math.max(0, Math.floor(py / c.sp)));
        var ox = (jx + 0.5) * c.sp, oy = (jy + 0.5) * c.sp;
        var N = c.d * c.d, stride = Math.max(1, Math.round(N / 64));
        for (var k = 0; k < N; k += stride) {
          var ang = ((k + 0.5) * 2 * Math.PI) / N;
          v.push(ox, oy, ang, c.a, c.b, 0, i, ox, oy, ang, c.a, c.b, 1, i);
        }
        var cs = Math.max(1.5, c.sp * 0.25);
        v.push(ox, oy, 0, -cs, cs, 0, i, ox, oy, 0, -cs, cs, 2, i);
        v.push(ox, oy, Math.PI / 2, -cs, cs, 0, i, ox, oy, Math.PI / 2, -cs, cs, 2, i);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
      lineCount = v.length / 7;
    }

    function show() {
      gl.bindVertexArray(emptyVao);
      var u = P.show;
      target(null, u);
      sceneUniforms(u);
      gl.uniform2f(u.u.uCanvas, CW, CH);
      gl.uniform2f(u.u.uS, SW, SH);
      gl.uniform1i(u.u.uView, st.view);
      gl.uniform1f(u.u.uExposure, Math.pow(2, st.exposure));
      gl.uniform1f(u.u.uPower, POWER);
      bindTex(u, "uGI", 1, R.gShow || R.g0);
      bindTex(u, "uEmit", 2, R.eShow || R.e0);
      bindTex(u, "uDist", 3, R.dist);
      var lv = Math.min(st.level, nCasc() - 1);
      var c = cascadeDims(lv);
      bindTex(u, "uCasc", 4, R.casc[lv]);
      gl.uniform2i(u.u.uCascSize, c.w, c.h);
      gl.uniform2i(u.u.uCascP, c.px, c.py);
      if (cursor && st.view !== 2 && st.view !== 3)
        gl.uniform4f(u.u.uCursor, cursor[0] * CW, cursor[1] * CH, st.brush * CH, 1);
      else gl.uniform4f(u.u.uCursor, 0, 0, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (st.view === 2) {
        buildLines();
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(P.line.p);
        bindTex(P.line, "uDist", 0, R.dist);
        gl.uniform2f(P.line.u.uS, SW, SH);
        gl.bindVertexArray(lineVao);
        gl.drawArrays(gl.LINES, 0, lineCount);
        gl.disable(gl.BLEND);
      }
      gl.bindVertexArray(null);
    }

    // ------------------------------------------------------ stats, adaptivity
    var fps = 0, times = [], adapted = 0, frameNo = 0, warm = 0, slow = 0;
    function fmtNum(x) {
      return x >= 1e6 ? (x / 1e6).toFixed(1) + "M" : x >= 1e3 ? Math.round(x / 1e3) + "k" : String(x);
    }
    function fill(tpl, vals) {
      return tpl.replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; });
    }
    function updateStats() {
      var n = nCasc();
      if (st.view === 3) {
        var lv = Math.min(st.level, n - 1), c = cascadeDims(lv);
        statsEl.textContent = fill(S.raw, { k: lv, px: c.px, py: c.py, dirs: c.d * c.d, s: c.sp, a: Math.round(c.a), b: Math.round(c.b) });
        return;
      }
      var rays = 0;
      for (var i = 0; i < n; i++) {
        var c2 = cascadeDims(i);
        rays += c2.w * c2.h * (st.fix && i < n - 1 ? 4 : 1);
      }
      var diag = Math.sqrt(SW * SW + SH * SH), reach = reachOf(n);
      statsEl.textContent = fill(canvas.clientWidth < 560 ? S.statsShort : S.stats, {
        res: SW + "\u00d7" + SH, n: n, reach: Math.round(reach),
        pct: Math.min(100, Math.round((100 * reach) / diag)), rays: fmtNum(rays), fps: dirty > 0 || st.orbit ? Math.round(fps) : "\u2013"
      });
    }

    var lastT = 0, lastComputed = false;
    function render(now) {
      var dt = lastT ? Math.min((now - lastT) / 1000, 0.25) : 0;
      lastT = now;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(16, Math.min(1600, Math.round(canvas.clientWidth * dpr)));
      var h = Math.max(9, Math.round((w * canvas.clientHeight) / Math.max(1, canvas.clientWidth)));
      if (w !== CW || h !== CH || !R) {
        canvas.width = w;
        canvas.height = h;
        allocCanvas(w, h);
        allocScene();
        dirty = 60;
        needShow = true;
      }
      flushPaint();
      if (st.orbit) {
        orbT += dt;
        dirty = Math.max(dirty, 2);
      }
      var computed = false;
      if (dirty > 0) {
        compute();
        dirty--;
        computed = true;
        needShow = true;
      }
      if (needShow) {
        show();
        needShow = false;
      }
      if (computed && lastComputed && dt > 0) {
        fps = fps ? fps * 0.9 + (1 / dt) * 0.1 : 1 / dt;
        if (adapted < 5 && panel.dataset.rcQuality !== "fixed") {
          // very slow GPU: three frames in a row over 100 ms step down at once, without waiting
          // for the 30-frame average below
          slow = warm >= 3 && dt > 0.1 ? slow + 1 : 0;
          if (slow >= 3 && SW > 160) {
            adapted++;
            qf *= 0.7;
            allocScene();
            dirty = 60;
            slow = 0;
            warm = 0;
            times = [];
          }
          if (warm++ >= 12) times.push(dt); // skip the first frames (shader warm-up)
          if (times.length === 30) {
            var avg = times.reduce(function (x, y) { return x + y; }, 0) / times.length;
            times = [];
            // below about 40 fps: 20% fewer scene pixels per axis
            if (avg > 1 / 40 && SW > 160) {
              adapted++;
              qf *= 0.8;
              allocScene();
              dirty = 60;
            }
          }
        }
      }
      lastComputed = computed;
      if (frameNo++ % 12 === 0 || needStats) {
        updateStats();
        needStats = false;
      }
    }
    var needStats = true;

    // ------------------------------------------------------------- input
    function uvOf(e) {
      var r = canvas.getBoundingClientRect();
      return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))];
    }
    var drawing = null, probing = false;
    function changed() {
      dirty = st.bounce ? 60 : 3;
      needShow = true;
      needStats = true;
      kick();
    }
    canvas.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      hintEl.style.opacity = "0";
      var p = uvOf(e);
      if (st.view === 2) {
        probing = true;
        probeAt = p;
        needShow = true;
        kick();
        return;
      }
      drawing = { t: st.tool, c: PAL[st.color[st.tool === 0 ? 2 : st.tool]].slice(), r: st.brush, pts: [p[0], p[1]] };
      strokes.push(drawing);
      pending = pending.concat(strokeSegs(drawing, 0));
      changed();
    });
    canvas.addEventListener("pointermove", function (e) {
      var p = uvOf(e);
      if (e.pointerType === "mouse") {
        cursor = p;
        needShow = true;
      }
      if (probing || (st.view === 2 && e.pointerType === "mouse")) {
        probeAt = p;
        needShow = true;
      }
      if (drawing) {
        var n = drawing.pts.length;
        var dx = (p[0] - drawing.pts[n - 2]) * CW / CH, dy = p[1] - drawing.pts[n - 1];
        if (dx * dx + dy * dy > 0.003 * 0.003) {
          drawing.pts.push(p[0], p[1]);
          pending = pending.concat(strokeSegs(drawing, drawing.pts.length / 2 - 1));
          changed();
        }
      }
      kick();
    });
    function endPointer() {
      drawing = null;
      probing = false;
    }
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", function () {
      cursor = null;
      needShow = true;
      kick();
    });

    // ------------------------------------------------------------- controls
    function q(sel) { return panel.querySelector(sel); }
    function qa(sel) { return panel.querySelectorAll(sel); }
    function pressGroup(attr, val) {
      Array.prototype.forEach.call(qa("[" + attr + "]"), function (b) {
        b.setAttribute("aria-pressed", b.getAttribute(attr) === String(val) ? "true" : "false");
      });
    }
    var swWrap = q(".rc-swatches");
    var swatches = PAL.map(function (c, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pt-swatch";
      b.setAttribute("aria-label", "rgb(" + c.map(function (v) { return Math.round(v * 255); }).join(", ") + ")");
      b.style.background = "rgb(" + c.map(function (v) { return Math.round(v * 255); }).join(",") + ")";
      b.addEventListener("click", function () {
        if (st.tool === 0) setTool(2);
        st.color[st.tool] = i;
        syncSwatches();
      });
      swWrap.appendChild(b);
      return b;
    });
    function syncSwatches() {
      var sel = st.color[st.tool === 0 ? 2 : st.tool];
      swatches.forEach(function (b, i) {
        var on = i === sel && st.tool !== 0;
        b.style.boxShadow = on ? "0 0 0 2px var(--global-bg-color, #fff), 0 0 0 4px var(--global-theme-color, #b509ac)" : "none";
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      swWrap.style.opacity = st.tool === 0 ? "0.4" : "1";
    }
    function setTool(t) {
      st.tool = t;
      pressGroup("data-tool", t);
      syncSwatches();
    }
    Array.prototype.forEach.call(qa("[data-tool]"), function (b) {
      b.addEventListener("click", function () { setTool(+b.dataset.tool); });
    });
    var levelLabel = q(".rc-level"), levelIn = q('[data-input="level"]'), levelV = q(".rc-level-v");
    function setView(v) {
      st.view = v;
      pressGroup("data-view", v);
      levelLabel.style.display = v === 3 ? "" : "none";
      hintEl.textContent = v === 2 ? S.hintProbe : S.hint;
      hintEl.style.opacity = "1";
      canvas.style.cursor = v === 2 ? "move" : "crosshair";
      needShow = true;
      needStats = true;
      kick();
    }
    Array.prototype.forEach.call(qa("[data-view]"), function (b) {
      b.addEventListener("click", function () { setView(+b.dataset.view); });
    });
    levelIn.addEventListener("input", function () {
      st.level = +levelIn.value;
      levelV.textContent = levelIn.value;
      needShow = true;
      needStats = true;
      kick();
    });
    var brushIn = q('[data-input="brush"]');
    brushIn.value = st.brush;
    brushIn.addEventListener("input", function () {
      st.brush = +brushIn.value;
      needShow = true;
      kick();
    });
    var cascIn = q('[data-input="cascades"]'), cascV = q(".rc-casc-v");
    cascIn.max = MAXC;
    function syncCascUI() {
      var n = nCasc();
      cascIn.value = n;
      cascV.textContent = st.userN ? String(n) : n + " (" + S.auto + ")";
      levelIn.max = n - 1;
      if (st.level > n - 1) st.level = n - 1;
      levelIn.value = st.level;
      levelV.textContent = String(st.level);
    }
    cascIn.addEventListener("input", function () {
      var v = +cascIn.value;
      st.userN = SW && v === autoN() ? 0 : v;
      syncCascUI();
      changed();
    });
    function setToggle(name, on) {
      st[name] = on;
      var b = q('[data-toggle="' + name + '"]');
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    Array.prototype.forEach.call(qa("[data-toggle]"), function (b) {
      setToggle(b.dataset.toggle, st[b.dataset.toggle]);
      b.addEventListener("click", function () {
        setToggle(b.dataset.toggle, !st[b.dataset.toggle]);
        changed();
      });
    });
    var expIn = q('[data-input="exposure"]');
    expIn.value = st.exposure;
    expIn.addEventListener("input", function () {
      st.exposure = +expIn.value;
      needShow = true;
      kick();
    });
    function loadPreset(name) {
      strokes = [];
      var cfg = PRESETS[name](strokes);
      orbPath = cfg.path;
      orbT = 0;
      setToggle("orbit", cfg.orbit);
      st.exposure = cfg.exp;
      expIn.value = cfg.exp;
      repaintAll = true;
      pressGroup("data-preset", name);
      changed();
    }
    Array.prototype.forEach.call(qa("[data-preset]"), function (b) {
      b.addEventListener("click", function () { loadPreset(b.dataset.preset); });
    });
    q('[data-action="clear"]').addEventListener("click", function () {
      strokes = [];
      repaintAll = true;
      pressGroup("data-preset", "");
      changed();
    });

    setTool(2);
    setView(0);
    loadPreset("rooms");
    syncCascUI();

    // ------------------------------------------- run only while visible
    var visible = false, raf = 0;
    function tick(now) {
      raf = 0;
      if (gl.isContextLost()) return;
      render(now);
      if (visible && !document.hidden) raf = requestAnimationFrame(tick);
      else lastT = 0;
    }
    function kick() {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) {
        visible = e[0].isIntersecting;
        kick();
      }).observe(canvas);
    } else {
      visible = true;
      kick();
    }
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("resize", function () {
      needShow = true;
      kick();
    });
  }

  // initialise lazily, the first time the panel is on screen
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e, obs) {
      if (e[0].isIntersecting) {
        obs.disconnect();
        start();
      }
    }).observe(canvas);
  } else start();
})();
