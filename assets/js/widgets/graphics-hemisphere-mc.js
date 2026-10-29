/* Monte Carlo hemisphere sampler (graphics post 05).
   Local shading frame: z = surface normal, the view direction lies in the x-z plane.
   Two integrands over the hemisphere:
     sky : E = int cos^2(theta) cos(theta) dw = pi / 2            (the post's irradiance example)
     ggx : A = int f_r(v, l) cos(theta_l) dl, Cook-Torrance GGX with F = 1 and
           height-correlated Smith G2 (directional albedo; reference by quadrature)
   Three sampling techniques: uniform (p = 1 / 2pi), cosine (p = cos / pi) and GGX VNDF
   (Heitz 2018, p = G1(v) D(m) / (4 cos theta_v)). Drag the hemisphere to rotate it. */
(function () {
  "use strict";
  var TXT = {
    en: { sampling: "Sampling", uniform: "Uniform", cosine: "Cosine", ggx: "GGX VNDF", integrand: "Integrand",
          sky: "Sky: L = cos\u00b2\u03b8", lobe: "GGX lobe (F = 1)", n: "Samples N", rough: "Roughness \u03b1",
          view: "View angle \u03b8o", resample: "New samples", est: "estimate", ref: "reference",
          rmse: "relative RMSE over 300 runs", drag: "drag to rotate", running: "running estimate" },
    zh: { sampling: "\u91c7\u6837", uniform: "\u5747\u5300", cosine: "\u4f59\u5f26", ggx: "GGX VNDF", integrand: "\u88ab\u79ef\u51fd\u6570",
          sky: "\u5929\u7a7a\uff1aL = cos\u00b2\u03b8", lobe: "GGX \u6ce2\u74e3\uff08F = 1\uff09", n: "\u6837\u672c\u6570 N", rough: "\u7c97\u7cd9\u5ea6 \u03b1",
          view: "\u89c6\u7ebf\u89d2 \u03b8o", resample: "\u91cd\u65b0\u91c7\u6837", est: "\u4f30\u8ba1\u503c", ref: "\u53c2\u8003\u503c",
          rmse: "\u76f8\u5bf9 RMSE\uff08300 \u6b21\u8fd0\u884c\uff09", drag: "\u62d6\u52a8\u65cb\u8f6c", running: "\u7d2f\u79ef\u4f30\u8ba1" },
    ja: { sampling: "\u30b5\u30f3\u30d7\u30ea\u30f3\u30b0", uniform: "\u4e00\u69d8", cosine: "\u30b3\u30b5\u30a4\u30f3", ggx: "GGX VNDF", integrand: "\u88ab\u7a4d\u5206\u95a2\u6570",
          sky: "\u7a7a\uff1aL = cos\u00b2\u03b8", lobe: "GGX \u30ed\u30fc\u30d6\uff08F = 1\uff09", n: "\u30b5\u30f3\u30d7\u30eb\u6570 N", rough: "\u7c97\u3055 \u03b1",
          view: "\u8996\u7dda\u89d2 \u03b8o", resample: "\u518d\u30b5\u30f3\u30d7\u30eb", est: "\u63a8\u5b9a\u5024", ref: "\u53c2\u7167\u5024",
          rmse: "\u76f8\u5bfe RMSE\uff08300 \u56de\uff09", drag: "\u30c9\u30e9\u30c3\u30b0\u3067\u56de\u8ee2", running: "\u7d2f\u7a4d\u63a8\u5b9a" }
  };
  var COL = { uniform: "#ff7f0e", cosine: "#1f77b4", ggx: "#17becf", a: "#9467bd", gray: "#7f7f7f", dark: "#222222" };
  var METHODS = ["uniform", "cosine", "ggx"];

  // --- small deterministic RNG (mulberry32) so "New samples" is reproducible per click
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- GGX helpers (same formulas as the post)
  function D(mz, a) { var d = mz * mz * (a * a - 1) + 1; return a * a / (Math.PI * d * d); }
  function Lam(cz, a) { var t2 = (1 - cz * cz) / (cz * cz); return (-1 + Math.sqrt(1 + a * a * t2)) / 2; }
  function G1(cz, a) { return 1 / (1 + Lam(cz, a)); }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

  function sampleVNDF(v, a, u1, u2) {
    var vh = norm([a * v[0], a * v[1], v[2]]);
    var lensq = vh[0] * vh[0] + vh[1] * vh[1];
    var t1 = lensq > 0 ? [-vh[1] / Math.sqrt(lensq), vh[0] / Math.sqrt(lensq), 0] : [1, 0, 0];
    var t2 = [vh[1] * t1[2] - vh[2] * t1[1], vh[2] * t1[0] - vh[0] * t1[2], vh[0] * t1[1] - vh[1] * t1[0]];
    var r = Math.sqrt(u1), phi = 2 * Math.PI * u2;
    var p1 = r * Math.cos(phi), p2 = r * Math.sin(phi);
    var s = 0.5 * (1 + vh[2]);
    p2 = (1 - s) * Math.sqrt(1 - p1 * p1) + s * p2;
    var p3 = Math.sqrt(Math.max(0, 1 - p1 * p1 - p2 * p2));
    var nh = [p1 * t1[0] + p2 * t2[0] + p3 * vh[0], p1 * t1[1] + p2 * t2[1] + p3 * vh[1], p1 * t1[2] + p2 * t2[2] + p3 * vh[2]];
    return norm([a * nh[0], a * nh[1], Math.max(0, nh[2])]);
  }

  // integrand f(l) for direction l (unit, local frame); 0 below the horizon
  function integrand(kind, l, v, a) {
    if (l[2] <= 0) return 0;
    if (kind === "sky") return l[2] * l[2] * l[2];
    var h = norm([v[0] + l[0], v[1] + l[1], v[2] + l[2]]);
    return D(h[2], a) / (1 + Lam(v[2], a) + Lam(l[2], a)) / (4 * v[2]);
  }

  // draw one direction with technique m; returns [l, pdf]
  function sample(m, v, a, R) {
    var u1 = R(), u2 = R(), ct, st, ph;
    if (m === "uniform") {
      ct = u1; st = Math.sqrt(1 - ct * ct); ph = 2 * Math.PI * u2;
      return [[st * Math.cos(ph), st * Math.sin(ph), ct], 1 / (2 * Math.PI)];
    }
    if (m === "cosine") {
      ct = Math.sqrt(1 - u1); st = Math.sqrt(u1); ph = 2 * Math.PI * u2;
      return [[st * Math.cos(ph), st * Math.sin(ph), ct], ct / Math.PI];
    }
    var mm = sampleVNDF(v, a, u1, u2), d = mm[0] * v[0] + mm[1] * v[1] + mm[2] * v[2];
    var l = [2 * d * mm[0] - v[0], 2 * d * mm[1] - v[1], 2 * d * mm[2] - v[2]];
    return [l, G1(v[2], a) * D(mm[2], a) / (4 * v[2])];
  }

  function reference(kind, v, a) {
    if (kind === "sky") return Math.PI / 2;
    var n = 400, sum = 0;                     // midpoint rule in (cos theta, phi), phi symmetric
    for (var i = 0; i < n; i++) {
      var cz = (i + 0.5) / n, sz = Math.sqrt(1 - cz * cz);
      for (var j = 0; j < n; j++) {
        var ph = (j + 0.5) / n * Math.PI;
        sum += integrand(kind, [sz * Math.cos(ph), sz * Math.sin(ph), cz], v, a);
      }
    }
    return sum * (1 / n) * (Math.PI / n) * 2;
  }

  function setup(el) {
    var T = TXT[el.dataset.lang] || TXT.en;
    var st = { method: "cosine", kind: "sky", N: 64, a: 0.3, thetaO: 1.0, seed: 1, yaw: -0.9, pitch: 0.42 };
    el.innerHTML = "";
    el.style.background = "#fff"; el.style.color = "#222";
    el.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif"; el.style.fontSize = "14px";
    var ui = document.createElement("div");
    ui.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 10px 4px";
    el.appendChild(ui);
    function group(label) {
      var g = document.createElement("div"); g.style.cssText = "display:flex;align-items:center;gap:4px;flex-wrap:wrap";
      var s = document.createElement("span"); s.textContent = label; s.style.cssText = "color:#555;margin-right:2px";
      g.appendChild(s); ui.appendChild(g); return g;
    }
    function buttons(g, items, get, set) {
      var bs = items.map(function (it) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = it[1];
        b.style.cssText = "border:1px solid #bbb;border-radius:6px;padding:3px 8px;background:#fff;color:#222;cursor:pointer;font:inherit";
        b.addEventListener("click", function () { set(it[0]); refresh(); });
        g.appendChild(b); return [it[0], b];
      });
      return function () {
        bs.forEach(function (p) {
          var on = get() === p[0];
          p[1].style.background = on ? (COL[p[0]] || "#9467bd") : "#fff";
          p[1].style.color = on ? "#fff" : "#222"; p[1].style.borderColor = on ? "transparent" : "#bbb";
        });
      };
    }
    function slider(g, min, max, step, get, set, fmt) {
      var r = document.createElement("input"); r.type = "range"; r.min = min; r.max = max; r.step = step;
      r.style.cssText = "width:110px;accent-color:#9467bd";
      var o = document.createElement("span"); o.style.cssText = "min-width:3.2em;font-variant-numeric:tabular-nums";
      r.addEventListener("input", function () { set(parseFloat(r.value)); o.textContent = fmt(); refresh(); });
      g.appendChild(r); g.appendChild(o);
      return function () { r.value = get(); o.textContent = fmt(); };
    }
    var syncs = [];
    syncs.push(buttons(group(T.sampling), [["uniform", T.uniform], ["cosine", T.cosine], ["ggx", T.ggx]],
      function () { return st.method; }, function (m) { st.method = m; }));
    syncs.push(buttons(group(T.integrand), [["sky", T.sky], ["lobe", T.lobe]],
      function () { return st.kind === "sky" ? "sky" : "lobe"; }, function (k) { st.kind = k === "sky" ? "sky" : "ggx"; stale = true; }));
    var gN = group(T.n);
    syncs.push(slider(gN, 0, 10, 1, function () { return Math.round(Math.log2(st.N)); },
      function (x) { st.N = Math.pow(2, x); stale = true; }, function () { return String(st.N); }));
    syncs.push(slider(group(T.rough), 0.1, 1, 0.05, function () { return st.a; },
      function (x) { st.a = x; stale = true; refOK = false; }, function () { return st.a.toFixed(2); }));
    syncs.push(slider(group(T.view), 0, 85, 1, function () { return Math.round(st.thetaO * 180 / Math.PI); },
      function (x) { st.thetaO = x * Math.PI / 180; stale = true; refOK = false; },
      function () { return Math.round(st.thetaO * 180 / Math.PI) + "\u00b0"; }));
    var rb = document.createElement("button"); rb.type = "button"; rb.textContent = T.resample;
    rb.style.cssText = "border:1px solid #9467bd;color:#9467bd;background:#fff;border-radius:6px;padding:3px 10px;cursor:pointer;font:inherit";
    rb.addEventListener("click", function () { st.seed++; refresh(); });
    ui.appendChild(rb);

    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;width:100%;touch-action:none;cursor:grab";
    el.appendChild(cv);
    var ctx = cv.getContext("2d");

    var stale = true, refOK = false, refs = { sky: Math.PI / 2 }, rmse = {}, samples = [], W = 0, H = 0, wide = true;

    function view() { return [Math.sin(st.thetaO), 0, Math.max(Math.cos(st.thetaO), 1e-3)]; }

    function compute() {
      var v = view();
      if (!refOK) { refs.ggx = reference("ggx", v, st.a); refOK = true; }
      var ref = refs[st.kind];
      if (stale) {                       // RMSE of each technique over 300 independent runs
        METHODS.forEach(function (m, k) {
          var R = rng(9001 + k * 7919), se = 0;
          for (var t = 0; t < 300; t++) {
            var s = 0;
            for (var i = 0; i < st.N; i++) {
              var p = sample(m, v, st.a, R);
              if (p[1] > 0) s += integrand(st.kind, p[0], v, st.a) / p[1];
            }
            var e = s / st.N - ref; se += e * e;
          }
          rmse[m] = Math.sqrt(se / 300) / ref;
        });
        stale = false;
      }
      var R = rng(st.seed * 104729 + 17);
      samples = [];
      for (var i = 0; i < st.N; i++) {
        var p = sample(st.method, v, st.a, R);
        var f = integrand(st.kind, p[0], v, st.a);
        samples.push({ l: p[0], w: p[1] > 0 ? f / p[1] : 0 });
      }
    }

    function resize() {
      var w = el.clientWidth;
      wide = w >= 620;
      W = w; H = wide ? Math.round(Math.min(380, w * 0.5)) : Math.round(w * 0.78 + 230);
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // orthographic view of the local frame: yaw about z, then pitch
    function proj(p, cx, cy, R) {
      var cy_ = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      var x = cy_ * p[0] - sy * p[1], y = sy * p[0] + cy_ * p[1], z = p[2];
      var sx = x, depth = y * cp - z * sp, syy = -(z * cp + y * sp);
      return [cx + R * sx, cy + R * syy, depth];
    }

    function arrow(a, b, col, lw) {
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = 8;
      ctx.beginPath(); ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] - s * Math.cos(ang - 0.4), b[1] - s * Math.sin(ang - 0.4));
      ctx.lineTo(b[0] - s * Math.cos(ang + 0.4), b[1] - s * Math.sin(ang + 0.4)); ctx.fill();
    }

    function drawHemi(x0, y0, w, h) {
      var R = Math.min(w * 0.4, h * 0.5), cx = x0 + w / 2, cy = y0 + h * 0.6, i, k;
      ctx.lineWidth = 1;
      // meridians and parallels, back half lighter
      function curve(fn, n) {
        for (var s = 0; s < n; s++) {
          var a = proj(fn(s / n), cx, cy, R), b = proj(fn((s + 1) / n), cx, cy, R);
          ctx.strokeStyle = (a[2] + b[2]) > 0 ? "rgba(127,127,127,0.25)" : "rgba(127,127,127,0.6)";
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
      }
      [0, 30, 60].forEach(function (el_) {
        var e = el_ * Math.PI / 180;
        curve(function (t) { var p = 2 * Math.PI * t; return [Math.cos(e) * Math.cos(p), Math.cos(e) * Math.sin(p), Math.sin(e)]; }, 72);
      });
      for (k = 0; k < 4; k++) {
        (function (phi) {
          curve(function (t) { var s = Math.PI * t; return [Math.cos(s) * Math.cos(phi), Math.cos(s) * Math.sin(phi), Math.sin(s)]; }, 36);
        })(k * Math.PI / 4);
      }
      var o = proj([0, 0, 0], cx, cy, R);
      arrow(o, proj([0, 0, 1.25], cx, cy, R), COL.dark, 2);
      ctx.fillStyle = COL.dark; ctx.font = "bold 14px sans-serif";
      var nt = proj([0, 0, 1.33], cx, cy, R); ctx.fillText("n", nt[0] + 4, nt[1]);
      if (st.kind === "ggx" || st.method === "ggx") {
        var v = view(); arrow(o, proj([1.3 * v[0], 1.3 * v[1], 1.3 * v[2]], cx, cy, R), COL.a, 2.5);
        var vt = proj([1.42 * v[0], 0, 1.42 * v[2]], cx, cy, R);
        ctx.fillStyle = COL.a; ctx.font = "italic 15px serif"; ctx.fillText("\u03c9o", vt[0], vt[1]);
      }
      // samples, coloured by their weight f/p relative to the reference value
      var ref = refs[st.kind], pts = samples.map(function (s) { return [proj(s.l, cx, cy, R), s]; });
      pts.sort(function (a, b) { return b[0][2] - a[0][2]; });
      var rad = st.N > 256 ? 2.2 : st.N > 64 ? 3 : 4;
      for (i = 0; i < pts.length; i++) {
        var p = pts[i][0], s = pts[i][1];
        if (s.l[2] <= 0) { ctx.strokeStyle = "#d62728"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(p[0] - 3, p[1] - 3); ctx.lineTo(p[0] + 3, p[1] + 3);
          ctx.moveTo(p[0] + 3, p[1] - 3); ctx.lineTo(p[0] - 3, p[1] + 3); ctx.stroke(); continue; }
        var t = Math.max(0, Math.min(1, Math.log(Math.max(s.w / ref, 1e-3)) / Math.log(10) / 2 + 0.5)); // 0.1x..10x
        var r = Math.round(31 + t * (255 - 31)), g = Math.round(119 + t * (127 - 119)), b = Math.round(180 + t * (14 - 180));
        ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + (p[2] > 0 ? 0.45 : 0.95) + ")";
        ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 2 * Math.PI); ctx.fill();
      }
      ctx.fillStyle = "#888"; ctx.font = "12px sans-serif"; ctx.fillText(T.drag, x0 + 8, y0 + h - 8);
      // weight colour key: 0.1x .. 10x of the reference value
      var kx = x0 + w - 118, ky = y0 + h - 22;
      for (i = 0; i < 100; i++) {
        var tt = i / 99;
        ctx.fillStyle = "rgb(" + Math.round(31 + tt * 224) + "," + Math.round(119 + tt * 8) + "," + Math.round(180 - tt * 166) + ")";
        ctx.fillRect(kx + i, ky, 1.2, 8);
      }
      ctx.fillStyle = "#555"; ctx.font = "11px sans-serif";
      ctx.fillText("f/p: 0.1\u00d7", kx - 4, ky - 4); ctx.fillText("10\u00d7", kx + 86, ky - 4);
    }

    function drawPlots(x0, y0, w, h) {
      var ref = refs[st.kind], i;
      // (1) running estimate of the current sample set
      var ph = h * 0.55, px = x0 + 46, pw = w - 60, py = y0 + 24, pih = ph - 50;
      var run = [], s = 0;
      for (i = 0; i < samples.length; i++) { s += samples[i].w; run.push(s / (i + 1)); }
      var lo = ref * 0.4, hi = ref * 1.6;
      run.forEach(function (r) { lo = Math.min(lo, r); hi = Math.max(hi, r); });
      lo = Math.max(lo, 0); hi = Math.min(hi, ref * 3);
      var X = function (n) { return px + (samples.length > 1 ? Math.log(n) / Math.log(samples.length) : 0) * pw; };
      var Y = function (v) { return py + pih - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * pih; };
      ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1; ctx.strokeRect(px, py, pw, pih);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = COL.dark;
      ctx.beginPath(); ctx.moveTo(px, Y(ref)); ctx.lineTo(px + pw, Y(ref)); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = COL[st.method]; ctx.lineWidth = 2; ctx.beginPath();
      for (i = 0; i < run.length; i++) { var xx = X(i + 1), yy = Y(run[i]); if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
      ctx.stroke();
      ctx.fillStyle = "#333"; ctx.font = "13px sans-serif";
      var est = run.length ? run[run.length - 1] : 0;
      ctx.fillText(T.running + " (log n)", px, y0 + 14);
      ctx.fillStyle = COL[st.method]; ctx.font = "bold 13px sans-serif";
      ctx.fillText(T.est + " " + est.toFixed(3), px, py + pih + 18);
      ctx.fillStyle = COL.dark; ctx.font = "13px sans-serif";
      ctx.fillText(T.ref + " " + ref.toFixed(3), px + Math.min(150, pw * 0.5), py + pih + 18);
      ctx.fillStyle = "#666"; ctx.font = "11px sans-serif";
      ctx.fillText(hi.toFixed(2), x0 + 4, py + 10); ctx.fillText(lo.toFixed(2), x0 + 4, py + pih);
      // (2) relative RMSE of the three techniques at this N (bars, log scale 0.001 .. 10)
      var by = y0 + ph + 8, bh = h - ph - 12, bx = x0 + 74, bw = w - 90;
      ctx.fillStyle = "#333"; ctx.font = "13px sans-serif"; ctx.fillText(T.rmse + ", N = " + st.N, bx, by + 12);
      var rowH = (bh - 22) / 3;
      var L = function (v) { return Math.max(0, Math.min(1, (Math.log(Math.max(v, 1e-3)) / Math.LN10 + 3) / 4)); };
      METHODS.forEach(function (m, k) {
        var yy = by + 20 + k * rowH, val = rmse[m];
        ctx.fillStyle = COL[m]; ctx.globalAlpha = m === st.method ? 1 : 0.55;
        ctx.fillRect(bx, yy + 3, L(val) * bw, rowH - 8); ctx.globalAlpha = 1;
        ctx.fillStyle = "#333"; ctx.font = (m === st.method ? "bold " : "") + "12px sans-serif";
        ctx.fillText(T[m], x0 + 2, yy + rowH / 2 + 2);
        var txt = val < 1e-4 ? "0" : val.toPrecision(2);
        var tx = bx + L(val) * bw + 4; if (tx > bx + bw - 30) tx = bx + L(val) * bw - 34;
        ctx.fillText(txt, tx, yy + rowH / 2 + 2);
      });
      ctx.fillStyle = "#888"; ctx.font = "10px sans-serif";
      ["0.001", "0.01", "0.1", "1", "10"].forEach(function (s_, k) { ctx.fillText(s_, bx + k / 4 * bw - 8, by + bh + 4); });
    }

    function draw() {
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      if (wide) { drawHemi(0, 0, W * 0.5, H); drawPlots(W * 0.5, 0, W * 0.5, H - 8); }
      else { var hh = Math.round(W * 0.78); drawHemi(0, 0, W, hh); drawPlots(0, hh, W, H - hh - 8); }
    }

    function refresh() { syncs.forEach(function (f) { f(); }); compute(); draw(); }

    var drag = null;
    cv.addEventListener("pointerdown", function (e) { drag = [e.clientX, e.clientY, st.yaw, st.pitch]; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; });
    cv.addEventListener("pointermove", function (e) {
      if (!drag) return;
      st.yaw = drag[2] + (e.clientX - drag[0]) * 0.01;
      st.pitch = Math.max(-0.1, Math.min(1.45, drag[3] + (e.clientY - drag[1]) * 0.01));
      draw();
    });
    function end() { drag = null; cv.style.cursor = "grab"; }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);

    resize(); refresh();
    var lastW = el.clientWidth;
    window.addEventListener("resize", function () { if (el.clientWidth !== lastW) { lastW = el.clientWidth; resize(); draw(); } });
  }

  function init() { document.querySelectorAll('[data-widget="graphics-hemisphere-mc"]').forEach(setup); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
