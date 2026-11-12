/* Plane-sweep stereo (3d-vision post 07).
 * A small ray-cast scene (textured wall with a flat poster and stripes, floor, box, sphere) is seen
 * by a reference camera and one source camera that sits B metres to its right and looks at the same
 * point. For D = 64 fronto-parallel planes z = 1/w (uniform in w = 1/z between 2.5 m and 8 m) the
 * source image is warped into the reference view by the plane-induced homography
 * H = K (R + t n^T / d) K^-1 and compared with the reference image in a (2r+1)^2 window
 * (1 - NCC or SAD). The slider picks one plane; the chart shows the cost curves C(z) of three probe
 * pixels; the depth view shows the winner-take-all depth with parabola refinement.
 * Tap or drag on an image to move the active probe, drag on the chart to choose the plane.
 */
(function () {
  "use strict";

  var TEXT = {
    en: {
      plane: "plane z", win: "window", cost: "cost", base: "baseline B", show: "show",
      warp: "warped source", diff: "|difference|", slice: "cost slice", depth: "WTA depth",
      ref: "reference image (tap: move probe)", probe: "probe", truth: "true z", est: "WTA z",
      atz: "cost here", acc: "WTA depth vs truth", within: "within", chartX: "z (m), spaced in 1/z",
      hint: "Drag on the chart or use the slider to sweep the plane. Pixels whose depth equals the plane line up (dark difference, low cost).",
      busy: "computing\u2026", sep: ", "
    },
    zh: {
      plane: "\u5e73\u9762 z", win: "\u7a97\u53e3", cost: "\u4ee3\u4ef7", base: "\u57fa\u7ebf B", show: "\u663e\u793a",
      warp: "\u53d8\u6362\u540e\u7684\u6e90\u56fe\u50cf", diff: "|\u5dee\u503c|", slice: "\u4ee3\u4ef7\u5207\u7247", depth: "WTA \u6df1\u5ea6",
      ref: "\u53c2\u8003\u56fe\u50cf\uff08\u70b9\u51fb\u79fb\u52a8\u63a2\u9488\uff09", probe: "\u63a2\u9488", truth: "\u771f\u5b9e z", est: "WTA z",
      atz: "\u5f53\u524d\u4ee3\u4ef7", acc: "WTA \u6df1\u5ea6\u4e0e\u771f\u503c\u5bf9\u6bd4", within: "\u8bef\u5dee\u5c0f\u4e8e", chartX: "z\uff08\u7c73\uff09\uff0c\u6309 1/z \u7b49\u95f4\u8ddd",
      hint: "\u5728\u66f2\u7ebf\u56fe\u4e0a\u62d6\u52a8\u6216\u7528\u6ed1\u5757\u626b\u63cf\u5e73\u9762\u3002\u6df1\u5ea6\u7b49\u4e8e\u8be5\u5e73\u9762\u7684\u50cf\u7d20\u4f1a\u5bf9\u9f50\uff08\u5dee\u503c\u53d8\u6697\u3001\u4ee3\u4ef7\u53d8\u4f4e\uff09\u3002",
      busy: "\u8ba1\u7b97\u4e2d\u2026", sep: "\uff0c"
    },
    ja: {
      plane: "\u5e73\u9762 z", win: "\u7a93", cost: "\u30b3\u30b9\u30c8", base: "\u57fa\u7dda\u9577 B", show: "\u8868\u793a",
      warp: "\u5909\u63db\u3057\u305f\u30bd\u30fc\u30b9\u753b\u50cf", diff: "|\u5dee\u5206|", slice: "\u30b3\u30b9\u30c8\u65ad\u9762", depth: "WTA \u5965\u884c\u304d",
      ref: "\u53c2\u7167\u753b\u50cf\uff08\u30bf\u30c3\u30d7\u3067\u30d7\u30ed\u30fc\u30d6\u3092\u79fb\u52d5\uff09", probe: "\u30d7\u30ed\u30fc\u30d6", truth: "\u771f\u306e z", est: "WTA z",
      atz: "\u3053\u306e\u5e73\u9762\u3067\u306e\u30b3\u30b9\u30c8", acc: "WTA \u5965\u884c\u304d\u3068\u771f\u5024\u306e\u6bd4\u8f03", within: "\u8aa4\u5dee", chartX: "z\uff08m\uff09\u30011/z \u3067\u7b49\u9593\u9694",
      hint: "\u30b0\u30e9\u30d5\u4e0a\u3092\u30c9\u30e9\u30c3\u30b0\u3059\u308b\u304b\u30b9\u30e9\u30a4\u30c0\u30fc\u3067\u5e73\u9762\u3092\u52d5\u304b\u3057\u307e\u3059\u3002\u5965\u884c\u304d\u304c\u305d\u306e\u5e73\u9762\u3068\u7b49\u3057\u3044\u753b\u7d20\u304c\u305d\u308d\u3044\u307e\u3059\uff08\u5dee\u5206\u304c\u6697\u304f\u3001\u30b3\u30b9\u30c8\u304c\u5c0f\u3055\u304f\u306a\u308a\u307e\u3059\uff09\u3002",
      busy: "\u8a08\u7b97\u4e2d\u2026", sep: "\u3001"
    }
  };

  var W = 160, H = 120, F = 150, CX = (W - 1) / 2, CY = (H - 1) / 2;
  var D = 64, ZN = 2.5, ZF = 8.0;
  var PCOL = ["#d62728", "#1f77b4", "#2ca02c"];
  var VIR = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
  var MAG = [[0, 0, 4], [59, 15, 112], [140, 41, 129], [222, 73, 104], [254, 159, 109], [252, 253, 191]];

  function lut(stops, t) {
    t = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    var i = Math.min(stops.length - 2, Math.floor(t)), f = t - i, a = stops[i], b = stops[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  // ---------- small vector helpers ----------
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)); return [a[0] / l, a[1] / l, a[2] / l]; }
  function lookAt(C, T) {          // world-to-camera R (rows = camera axes), t = -R C; OpenCV axes
    var z = norm(sub(T, C)), x = norm(cross(z, [0, -1, 0])), y = cross(z, x);
    var R = [x, y, z];
    return { R: R, t: [-dot(x, C), -dot(y, C), -dot(z, C)], C: C };
  }
  function mulMV(R, v) { return [dot(R[0], v), dot(R[1], v), dot(R[2], v)]; }
  function transpose(R) { return [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]]; }
  function mulMM(A, B) {
    var Bt = transpose(B);
    return [[dot(A[0], Bt[0]), dot(A[0], Bt[1]), dot(A[0], Bt[2])],
            [dot(A[1], Bt[0]), dot(A[1], Bt[1]), dot(A[1], Bt[2])],
            [dot(A[2], Bt[0]), dot(A[2], Bt[1]), dot(A[2], Bt[2])]];
  }

  // ---------- texture: seeded lattice value noise ----------
  var LAT = (function () {
    var s = 12345, a = new Float32Array(64 * 64);
    for (var i = 0; i < a.length; i++) {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      a[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return a;
  })();
  function vnoise(u, v) {
    var out = 0, oct = [[3, 0.3], [8, 0.35], [18, 0.35]];
    for (var k = 0; k < 3; k++) {
      var x = u * oct[k][0], y = v * oct[k][0], x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      var i = ((x0 % 64) + 64) % 64, j = ((y0 % 64) + 64) % 64, i1 = (i + 1) % 64, j1 = (j + 1) % 64;
      var a = LAT[j * 64 + i], b = LAT[j * 64 + i1], c = LAT[j1 * 64 + i], d = LAT[j1 * 64 + i1];
      out += oct[k][1] * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy);
    }
    return Math.max(0, Math.min(1, 0.5 + 2 * (out - 0.5)));
  }
  var LIGHT = norm([-0.4, -0.7, -0.6]);

  // ray-cast the scene: returns [t, shade]
  function trace(o, d) {
    var best = Infinity, n = null, alb = 0, t, P;
    // wall z = 6.5
    t = (6.5 - o[2]) / d[2];
    if (t > 1e-6 && t < best) {
      P = [o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2]];
      best = t; n = [0, 0, -1];
      alb = 0.15 + 0.8 * vnoise(0.5 * P[0] + 3.1, 0.5 * P[1] + 5.3);
      if (P[0] > 0.2 && P[0] < 2.2 && P[1] > -1.8 && P[1] < -0.7) alb = 0.62;
      if (P[0] > -3.0 && P[0] < -1.1 && P[1] > -1.8 && P[1] < -0.4) alb = Math.sin(2 * Math.PI * P[0] / 0.3) > 0 ? 0.7 : 0.3;
    }
    // floor y = 1.2
    t = (1.2 - o[1]) / d[1];
    if (t > 1e-6 && t < best) {
      P = [o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2]];
      best = t; n = [0, -1, 0]; alb = 0.2 + 0.7 * vnoise(0.5 * P[0] + 11, 0.5 * P[2]);
    }
    // box
    var lo = [-1.6, 0.2, 3.2], hi = [-0.5, 1.2, 4.3], tn = -Infinity, tf = Infinity, ax = 0;
    for (var k = 0; k < 3; k++) {
      var t1 = (lo[k] - o[k]) / d[k], t2 = (hi[k] - o[k]) / d[k];
      var a = Math.min(t1, t2), b = Math.max(t1, t2);
      if (a > tn) { tn = a; ax = k; }
      if (b < tf) tf = b;
    }
    if (tn < tf && tn > 0 && tn < best) {
      P = [o[0] + tn * d[0], o[1] + tn * d[1], o[2] + tn * d[2]];
      best = tn; n = [0, 0, 0]; n[ax] = d[ax] > 0 ? -1 : 1;
      alb = 0.15 + 0.8 * vnoise(P[0] + P[2] + 20, P[1] + 0.6 * P[2]);
    }
    // sphere
    var c = [1.0, 0.4, 3.6], oc = sub(o, c), bb = dot(d, oc), disc = bb * bb - (dot(oc, oc) - 0.64);
    if (disc > 0) {
      t = -bb - Math.sqrt(disc);
      if (t > 1e-6 && t < best) {
        P = [o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2]];
        best = t; n = [(P[0] - c[0]) / 0.8, (P[1] - c[1]) / 0.8, (P[2] - c[2]) / 0.8];
        alb = 0.2 + 0.75 * vnoise(1.2 * Math.atan2(P[0] - c[0], P[2] - c[2]) + 30, 1.5 * P[1]);
      }
    }
    if (!n) return [Infinity, 0.5];
    return [best, alb * (0.35 + 0.65 * Math.max(0, dot(n, LIGHT)))];
  }

  function gauss(rng) {
    var u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function mkRng(seed) {
    var s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // render image (2x2 supersampled) and z-depth at pixel centres
  function render(cam, seed, wantDepth) {
    var img = new Float32Array(W * H), dep = wantDepth ? new Float32Array(W * H) : null;
    var Rt = transpose(cam.R), rng = mkRng(seed);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var acc = 0;
        for (var sy = 0; sy < 2; sy++) {
          for (var sx = 0; sx < 2; sx++) {
            var r = [(x - 0.25 + 0.5 * sx - CX) / F, (y - 0.25 + 0.5 * sy - CY) / F, 1];
            acc += trace(cam.C, norm(mulMV(Rt, r)))[1];
          }
        }
        img[y * W + x] = acc / 4 + 0.01 * gauss(rng);
        if (wantDepth) {
          var rc = [(x - CX) / F, (y - CY) / F, 1], L = Math.sqrt(dot(rc, rc));
          dep[y * W + x] = trace(cam.C, norm(mulMV(Rt, rc)))[0] / L;      // z = t cos(theta)
        }
      }
    }
    return { img: img, dep: dep };
  }

  // integral image with a zero border: (W+1) x (H+1)
  function integral(a, out) {
    var W1 = W + 1;
    for (var x = 0; x <= W; x++) out[x] = 0;
    for (var y = 0; y < H; y++) {
      var row = 0;
      out[(y + 1) * W1] = 0;
      for (var x2 = 0; x2 < W; x2++) {
        row += a[y * W + x2];
        out[(y + 1) * W1 + x2 + 1] = out[y * W1 + x2 + 1] + row;
      }
    }
  }
  function boxAt(I, x, y, r) {    // window sum, clamped to the image; returns [sum, count]
    var x0 = Math.max(0, x - r), x1 = Math.min(W - 1, x + r), y0 = Math.max(0, y - r), y1 = Math.min(H - 1, y + r);
    var W1 = W + 1;
    return I[(y1 + 1) * W1 + x1 + 1] - I[y0 * W1 + x1 + 1] - I[(y1 + 1) * W1 + x0] + I[y0 * W1 + x0];
  }
  function cnt(x, y, r) {
    return (Math.min(W - 1, x + r) - Math.max(0, x - r) + 1) * (Math.min(H - 1, y + r) - Math.max(0, y - r) + 1);
  }

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.innerHTML = "";
    root.style.background = "#fbfbfd";
    root.style.color = "#222";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.fontSize = "14px";

    var S = { plane: 30, r: 2, cost: "ncc", B: 0.4, mode: "diff", active: 0 };
    var refCam = lookAt([0, -0.6, 0], [0, 0.4, 4.5]);
    var REF = render(refCam, 1, true);
    var invZ = new Float32Array(D);
    for (var i = 0; i < D; i++) invZ[i] = 1 / ZN + (1 / ZF - 1 / ZN) * i / (D - 1);

    function project(Pw) {
      var c = mulMV(refCam.R, Pw);
      c = [c[0] + refCam.t[0], c[1] + refCam.t[1], c[2] + refCam.t[2]];
      return [Math.round(F * c[0] / c[2] + CX), Math.round(F * c[1] / c[2] + CY)];
    }
    // default probes: textured wall, the flat poster, the stripes
    var probes = [project([0.0, -0.3, 6.5]), project([1.2, -1.25, 6.5]), project([-2.0, -1.0, 6.5])];

    var SRC = null, CV = null, wtaZ = null, curWarp = new Float32Array(W * H);
    var Hcur = null;

    // ---------- controls ----------
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:8px 10px 4px";
    root.appendChild(bar);
    function slider(txt, min, max, step, val, fmt, cb) {
      var l = document.createElement("label");
      l.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap";
      var sp = document.createElement("span"), inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
      inp.style.width = "110px";
      function show() { sp.textContent = txt + " " + fmt(+inp.value); }
      inp.addEventListener("input", function () { show(); cb(+inp.value); });
      show();
      l.appendChild(sp); l.appendChild(inp); bar.appendChild(l);
      return { inp: inp, show: show };
    }
    function select(txt, opts, val, cb) {
      var l = document.createElement("label");
      l.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap";
      l.appendChild(document.createTextNode(txt));
      var s = document.createElement("select");
      s.style.cssText = "font:inherit;padding:2px 4px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222";
      opts.forEach(function (o) { var e = document.createElement("option"); e.value = o[0]; e.textContent = o[1]; s.appendChild(e); });
      s.value = val;
      s.addEventListener("change", function () { cb(s.value); });
      l.appendChild(s); bar.appendChild(l);
      return s;
    }
    var plSl = slider(T.plane, 0, D - 1, 1, S.plane, function (v) { return (1 / invZ[v]).toFixed(2) + " m"; },
      function (v) { S.plane = v; updatePlane(); });
    select(T.win, [["1", "3\u00d73"], ["2", "5\u00d75"], ["3", "7\u00d77"], ["4", "9\u00d79"]], "2",
      function (v) { S.r = +v; recompute(); });
    select(T.cost, [["ncc", "1 \u2212 NCC"], ["sad", "SAD"]], "ncc", function (v) { S.cost = v; recompute(); });
    slider(T.base, 0.1, 0.8, 0.05, S.B, function (v) { return v.toFixed(2) + " m"; }, function (v) { S.B = v; newSource(); });
    select(T.show, [["warp", T.warp], ["diff", T.diff], ["slice", T.slice], ["depth", T.depth]], S.mode,
      function (v) { S.mode = v; draw(); });

    var chips = document.createElement("div");
    chips.style.cssText = "display:flex;gap:6px;align-items:center;padding:2px 10px";
    root.appendChild(chips);
    var chipEls = [];
    ["A", "B", "C"].forEach(function (nm, k) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = T.probe + " " + nm;
      b.style.cssText = "font:inherit;padding:2px 9px;border-radius:5px;background:#fff;cursor:pointer;touch-action:manipulation;border:2px solid " + PCOL[k] + ";color:" + PCOL[k];
      b.addEventListener("click", function () { S.active = k; styleChips(); });
      chips.appendChild(b); chipEls.push(b);
    });
    function styleChips() {
      chipEls.forEach(function (b, k) { b.style.background = k === S.active ? PCOL[k] : "#fff"; b.style.color = k === S.active ? "#fff" : PCOL[k]; });
    }
    styleChips();

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;padding:6px 10px 0;align-items:flex-start";
    root.appendChild(row);
    function mkCanvas(parent, label) {
      var box = document.createElement("div");
      box.style.cssText = "flex:1 1 0;min-width:0";
      var cap = document.createElement("div");
      cap.style.cssText = "font-size:12px;color:#555;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
      cap.textContent = label;
      var cv = document.createElement("canvas");
      cv.style.cssText = "display:block;width:100%;touch-action:none;cursor:crosshair;border-radius:5px;box-shadow:0 0 0 1px #ddd;image-rendering:pixelated";
      box.appendChild(cap); box.appendChild(cv); parent.appendChild(box);
      return { cv: cv, cap: cap };
    }
    var refC = mkCanvas(row, T.ref), mainC = mkCanvas(row, "");
    var chart = document.createElement("canvas");
    chart.style.cssText = "display:block;margin:8px 10px 0;touch-action:none;cursor:ew-resize;border-radius:5px;background:#fff;box-shadow:0 0 0 1px #ddd";
    root.appendChild(chart);
    var info = document.createElement("div");
    info.style.cssText = "padding:6px 10px 10px;line-height:1.55;font-variant-numeric:tabular-nums";
    root.appendChild(info);

    var off = document.createElement("canvas");
    off.width = W; off.height = H;
    var octx = off.getContext("2d"), oimg = octx.createImageData(W, H);
    var CW = 300, CH = 170, IMW = 160;

    // ---------- geometry of the source view ----------
    var relR, relT;
    function newSource() {
      info.textContent = T.busy;
      var srcCam = lookAt([S.B, -0.6, 0], [0, 0.4, 4.5]);
      SRC = render(srcCam, 2, false).img;
      relR = mulMM(srcCam.R, transpose(refCam.R));                   // R = R_s R_r^T
      var rt = mulMV(relR, refCam.t);
      relT = [srcCam.t[0] - rt[0], srcCam.t[1] - rt[1], srcCam.t[2] - rt[2]];   // t = t_s - R t_r
      recompute();
    }
    function homography(z) {       // K (R + t n^T / d) K^-1 for n = (0, 0, 1), d = z
      var M = [[relR[0][0], relR[0][1], relR[0][2] + relT[0] / z],
               [relR[1][0], relR[1][1], relR[1][2] + relT[1] / z],
               [relR[2][0], relR[2][1], relR[2][2] + relT[2] / z]];
      var Kd = [[F, 0, CX], [0, F, CY], [0, 0, 1]], Ki = [[1 / F, 0, -CX / F], [0, 1 / F, -CY / F], [0, 0, 1]];
      return mulMM(mulMM(Kd, M), Ki);
    }
    function warpInto(Hm, out) {
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var w = Hm[2][0] * x + Hm[2][1] * y + Hm[2][2];
          var u = (Hm[0][0] * x + Hm[0][1] * y + Hm[0][2]) / w, v = (Hm[1][0] * x + Hm[1][1] * y + Hm[1][2]) / w;
          var x0 = Math.floor(u), y0 = Math.floor(v);
          if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) { out[y * W + x] = NaN; continue; }
          var fx = u - x0, fy = v - y0, i = y0 * W + x0;
          out[y * W + x] = (SRC[i] * (1 - fx) + SRC[i + 1] * fx) * (1 - fy) + (SRC[i + W] * (1 - fx) + SRC[i + W + 1] * fx) * fy;
        }
      }
    }

    // ---------- cost volume ----------
    var N1 = (W + 1) * (H + 1);
    var Ia = new Float64Array(N1), Iaa = new Float64Array(N1);
    var Ib = new Float64Array(N1), Ibb = new Float64Array(N1), Iab = new Float64Array(N1), Iout = new Float64Array(N1), Isad = new Float64Array(N1);
    var tb = new Float32Array(W * H), tbb = new Float32Array(W * H), tab = new Float32Array(W * H), tout = new Float32Array(W * H), tsad = new Float32Array(W * H);
    (function () {
      var a2 = new Float32Array(W * H);
      for (var k = 0; k < W * H; k++) a2[k] = REF.img[k] * REF.img[k];
      integral(REF.img, Ia); integral(a2, Iaa);
    })();
    function costSlice(i, warped, out) {
      warpInto(homography(1 / invZ[i]), warped);
      for (var k = 0; k < W * H; k++) {
        var b = warped[k], bad = b !== b;
        if (bad) b = 0;
        tb[k] = b; tbb[k] = b * b; tab[k] = REF.img[k] * b; tout[k] = bad ? 1 : 0; tsad[k] = bad ? 0 : Math.abs(REF.img[k] - b);
      }
      integral(tout, Iout);
      var r = S.r;
      if (S.cost === "sad") {
        integral(tsad, Isad);
        for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
          out[y * W + x] = boxAt(Iout, x, y, r) > 0 ? 1 : boxAt(Isad, x, y, r) / cnt(x, y, r);
        }
        return;
      }
      integral(tb, Ib); integral(tbb, Ibb); integral(tab, Iab);
      for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
        if (boxAt(Iout, x2, y2, r) > 0) { out[y2 * W + x2] = 2; continue; }
        var n = cnt(x2, y2, r);
        var ma = boxAt(Ia, x2, y2, r) / n, mb = boxAt(Ib, x2, y2, r) / n;
        var va = Math.max(0, boxAt(Iaa, x2, y2, r) / n - ma * ma), vb = Math.max(0, boxAt(Ibb, x2, y2, r) / n - mb * mb);
        var cab = boxAt(Iab, x2, y2, r) / n - ma * mb;
        out[y2 * W + x2] = 1 - cab / Math.sqrt((va + 1e-5) * (vb + 1e-5));
      }
    }
    var tmpWarp = new Float32Array(W * H), tmpCost = new Float32Array(W * H);
    function recompute() {
      CV = new Float32Array(D * W * H);
      for (var i = 0; i < D; i++) {
        costSlice(i, tmpWarp, tmpCost);
        CV.set(tmpCost, i * W * H);
      }
      // winner-take-all with parabola refinement
      wtaZ = new Float32Array(W * H);
      for (var k = 0; k < W * H; k++) {
        var bi = 0, bc = Infinity;
        for (var j = 0; j < D; j++) { var c = CV[j * W * H + k]; if (c < bc) { bc = c; bi = j; } }
        var o = 0;
        if (bi > 0 && bi < D - 1) {
          var c0 = CV[(bi - 1) * W * H + k], c2 = CV[(bi + 1) * W * H + k], den = c0 - 2 * bc + c2;
          if (den > 1e-9) o = Math.max(-0.5, Math.min(0.5, 0.5 * (c0 - c2) / den));
        }
        var f = bi + o, i0 = Math.max(0, Math.min(D - 2, Math.floor(f))), fr = f - i0;
        wtaZ[k] = 1 / (invZ[i0] * (1 - fr) + invZ[i0 + 1] * fr);
      }
      updatePlane();
    }
    function updatePlane() {
      Hcur = homography(1 / invZ[S.plane]);
      warpInto(Hcur, curWarp);
      draw();
    }

    // ---------- drawing ----------
    var lastAvail = -1;
    function resize() {
      var avail = Math.max(260, root.clientWidth - 20);
      if (avail === lastAvail) return;
      lastAvail = avail;
      IMW = Math.floor((avail - 8) / 2);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      [refC.cv, mainC.cv].forEach(function (cv) {
        cv.width = Math.round(IMW * dpr); cv.height = Math.round(IMW * 0.75 * dpr);
        cv.style.height = Math.round(IMW * 0.75) + "px";
      });
      CW = avail; CH = Math.max(150, Math.min(230, Math.round(avail * 0.3)));
      chart.width = Math.round(CW * dpr); chart.height = Math.round(CH * dpr);
      chart.style.width = CW + "px"; chart.style.height = CH + "px";
      draw();
    }
    function paint(cv, fn) {
      var d = oimg.data;
      for (var k = 0; k < W * H; k++) {
        var c = fn(k);
        d[4 * k] = c[0]; d[4 * k + 1] = c[1]; d[4 * k + 2] = c[2]; d[4 * k + 3] = 255;
      }
      octx.putImageData(oimg, 0, 0);
      var ctx = cv.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(off, 0, 0, cv.width, cv.height);
      return ctx;
    }
    function gray(v) { v = Math.max(0, Math.min(255, v * 255)); return [v, v, v]; }
    function drawProbes(cv, ctx) {
      var s = cv.width / W;
      probes.forEach(function (p, k) {
        ctx.beginPath(); ctx.arc((p[0] + 0.5) * s, (p[1] + 0.5) * s, Math.max(6, (S.r + 0.5) * s), 0, 2 * Math.PI);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 4 * (cv.width / IMW) / 1.5; ctx.stroke();
        ctx.strokeStyle = PCOL[k]; ctx.lineWidth = 2.2 * (cv.width / IMW) / 1.5; ctx.stroke();
      });
    }
    function draw() {
      if (!CV) return;
      var ref = REF.img, zc = 1 / invZ[S.plane], slice = S.plane * W * H;
      var ctxR = paint(refC.cv, function (k) { return gray(ref[k]); });
      drawProbes(refC.cv, ctxR);
      var maxC = S.cost === "ncc" ? 2 : 0.4;
      var fn;
      if (S.mode === "warp") fn = function (k) { var v = curWarp[k]; return v !== v ? [200, 200, 230] : gray(v); };
      else if (S.mode === "diff") fn = function (k) { var v = curWarp[k]; return v !== v ? [200, 200, 230] : lut(MAG, Math.abs(ref[k] - v) / 0.5); };
      else if (S.mode === "slice") fn = function (k) { return lut(MAG, 1 - CV[slice + k] / maxC); };
      else fn = function (k) { return lut(VIR, 1 - (wtaZ[k] - 2.5) / 4.5); };
      var ctxM = paint(mainC.cv, fn);
      if (S.mode !== "depth") {        // outline the pixels whose true depth is within 3% of the plane
        var s = mainC.cv.width / W;
        ctxM.fillStyle = "rgba(23,190,207,0.95)";
        for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
          var k = y * W + x, inb = Math.abs(REF.dep[k] - zc) < 0.03 * zc;
          if (!inb) continue;
          var edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 ||
            Math.abs(REF.dep[k - 1] - zc) >= 0.03 * zc || Math.abs(REF.dep[k + 1] - zc) >= 0.03 * zc ||
            Math.abs(REF.dep[k - W] - zc) >= 0.03 * zc || Math.abs(REF.dep[k + W] - zc) >= 0.03 * zc;
          if (edge) ctxM.fillRect(x * s, y * s, s, s);
        }
      }
      drawProbes(mainC.cv, ctxM);
      mainC.cap.textContent = { warp: T.warp, diff: T.diff, slice: T.slice, depth: T.depth }[S.mode] +
        (S.mode === "depth" ? "" : " @ z = " + zc.toFixed(2) + " m");
      drawChart();
      writeInfo();
    }
    function cx(w) { return 40 + (w - invZ[0]) / (invZ[D - 1] - invZ[0]) * (CW - 52); }
    function drawChart() {
      var dpr = chart.width / CW, ctx = chart.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, CW, CH); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, CW, CH);
      var top = 10, bot = CH - 30, maxC = S.cost === "ncc" ? 2 : 0.4;
      function cy(v) { return bot - Math.min(1, v / maxC) * (bot - top); }
      ctx.strokeStyle = "#eee"; ctx.lineWidth = 1; ctx.fillStyle = "#555"; ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      [2.5, 3, 4, 5, 6, 8].forEach(function (z) {
        var X = cx(1 / z);
        ctx.beginPath(); ctx.moveTo(X, top); ctx.lineTo(X, bot); ctx.stroke();
        ctx.fillText(String(z), X, bot + 3);
      });
      ctx.fillText(T.chartX, (40 + CW - 12) / 2, bot + 15);
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      [0, maxC / 2, maxC].forEach(function (v) {
        ctx.beginPath(); ctx.moveTo(40, cy(v)); ctx.lineTo(CW - 12, cy(v)); ctx.stroke();
        ctx.fillText(String(v), 35, cy(v));
      });
      // current plane
      ctx.strokeStyle = "#9467bd"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx(invZ[S.plane]), top); ctx.lineTo(cx(invZ[S.plane]), bot); ctx.stroke();
      probes.forEach(function (p, k) {
        var idx = p[1] * W + p[0];
        ctx.strokeStyle = PCOL[k]; ctx.lineWidth = k === S.active ? 2.6 : 1.6; ctx.setLineDash([]);
        ctx.beginPath();
        for (var j = 0; j < D; j++) {
          var X = cx(invZ[j]), Y = cy(CV[j * W * H + idx]);
          if (j) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        ctx.stroke();
        ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4;
        var zt = REF.dep[idx];
        if (zt > ZN * 0.98 && zt < ZF) { ctx.beginPath(); ctx.moveTo(cx(1 / zt), top); ctx.lineTo(cx(1 / zt), bot); ctx.stroke(); }
        ctx.setLineDash([]);
        var X2 = cx(1 / wtaZ[idx]);
        ctx.fillStyle = PCOL[k];
        ctx.beginPath(); ctx.moveTo(X2, bot - 1); ctx.lineTo(X2 - 6, bot - 11); ctx.lineTo(X2 + 6, bot - 11); ctx.closePath(); ctx.fill();
      });
    }
    function writeInfo() {
      var ok1 = 0, ok5 = 0, n = W * H;
      for (var k = 0; k < n; k++) {
        var e = Math.abs(wtaZ[k] - REF.dep[k]) / REF.dep[k];
        if (e < 0.01) ok1++;
        if (e < 0.05) ok5++;
      }
      var html = "";
      probes.forEach(function (p, k) {
        var idx = p[1] * W + p[0];
        html += '<span style="color:' + PCOL[k] + ';font-weight:600">' + T.probe + " " + "ABC"[k] + "</span> (" + p[0] + ", " + p[1] + "): " +
          T.truth + " " + REF.dep[idx].toFixed(2) + " m" + T.sep + T.est + " " + wtaZ[idx].toFixed(2) + " m" + T.sep +
          T.atz + " " + CV[S.plane * W * H + idx].toFixed(2) + "<br>";
      });
      html += "<b>" + T.acc + "</b>: " + T.within + " 1%: " + (100 * ok1 / n).toFixed(1) + "%" + T.sep + T.within + " 5%: " + (100 * ok5 / n).toFixed(1) + "%<br>";
      html += '<span style="color:#777">' + T.hint + "</span>";
      info.innerHTML = html;
    }

    // ---------- pointer ----------
    function imgPointer(cv) {
      var down = false;
      function setFrom(e) {
        var rc = cv.getBoundingClientRect();
        var x = Math.floor((e.clientX - rc.left) / rc.width * W), y = Math.floor((e.clientY - rc.top) / rc.height * H);
        probes[S.active] = [Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y))];
        draw();
      }
      cv.addEventListener("pointerdown", function (e) { down = true; cv.setPointerCapture(e.pointerId); setFrom(e); e.preventDefault(); });
      cv.addEventListener("pointermove", function (e) { if (down) setFrom(e); });
      cv.addEventListener("pointerup", function () { down = false; });
      cv.addEventListener("pointercancel", function () { down = false; });
    }
    imgPointer(refC.cv); imgPointer(mainC.cv);
    (function () {
      var down = false;
      function setFrom(e) {
        var rc = chart.getBoundingClientRect(), X = e.clientX - rc.left;
        var w = invZ[0] + (X - 40) / (CW - 52) * (invZ[D - 1] - invZ[0]);
        var i = Math.round((w - invZ[0]) / (invZ[D - 1] - invZ[0]) * (D - 1));
        S.plane = Math.max(0, Math.min(D - 1, i));
        plSl.inp.value = S.plane; plSl.show();
        updatePlane();
      }
      chart.addEventListener("pointerdown", function (e) { down = true; chart.setPointerCapture(e.pointerId); setFrom(e); e.preventDefault(); });
      chart.addEventListener("pointermove", function (e) { if (down) setFrom(e); });
      chart.addEventListener("pointerup", function () { down = false; });
      chart.addEventListener("pointercancel", function () { down = false; });
    })();

    newSource();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function init() {
    document.querySelectorAll('[data-widget="3d-vision-plane-sweep"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
