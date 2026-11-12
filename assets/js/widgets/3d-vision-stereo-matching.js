/* Stereo matching lab (3d-vision post 04).
   A rectified pair is ray-cast in the page (camera 2 is camera 1 moved by the baseline b along x):
   a slanted textured wall, a floor, a textured box, a slanted panel and a box whose texture strength you
   choose. Disparity d = f b / Z. Matching cost: mean absolute difference over a win x win window (SAD),
   C(x, y, d) = mean |L(x, y) - R(x - d, y)|. Block matching takes argmin_d C; SGM first aggregates
   L_r(p, d) = C(p, d) + min(L_r(p-r, d), L_r(p-r, d+-1) + P1, min_k L_r(p-r, k) + P2) - min_k L_r(p-r, k)
   along 4 directions and takes argmin_d of the sum. The left-right check invalidates pixels whose right-image
   disparity disagrees by more than 1. Tap a pixel to see its cost curve. */
(function () {
  "use strict";
  var TXT = {
    en: {
      bm: "Block matching", sgm: "SGM", win: "window", p1: "P1", p2: "P2", tex: "texture of the box", noise: "noise \u03c3",
      lr: "left-right check", left: "left image", disp: "disparity", err: "errors > 1 px (red)",
      bad: "bad pixels", rejected: "rejected by the check", curve: "cost at the selected pixel", truth: "true d",
      raw: "C(d): window cost", agg: "S(d): after SGM (scaled)", occl: "occluded in the right image",
      hint: "Tap or drag on any of the three images to pick a pixel; the chart shows its matching cost against the disparity. Try a 3 x 3 window on the plain box, then switch to SGM, and raise P2 to see the smoothness take over."
    },
    zh: {
      bm: "\u5757\u5339\u914d", sgm: "SGM", win: "\u7a97\u53e3", p1: "P1", p2: "P2", tex: "\u65b9\u5757\u7684\u7eb9\u7406\u5f3a\u5ea6", noise: "\u566a\u58f0 \u03c3",
      lr: "\u5de6\u53f3\u4e00\u81f4\u6027\u68c0\u67e5", left: "\u5de6\u56fe", disp: "\u89c6\u5dee", err: "\u8bef\u5dee > 1 \u50cf\u7d20\uff08\u7ea2\u8272\uff09",
      bad: "\u9519\u8bef\u50cf\u7d20", rejected: "\u88ab\u68c0\u67e5\u5254\u9664", curve: "\u6240\u9009\u50cf\u7d20\u7684\u4ee3\u4ef7", truth: "\u771f\u5b9e d",
      raw: "C(d)\uff1a\u7a97\u53e3\u4ee3\u4ef7", agg: "S(d)\uff1aSGM \u805a\u5408\u540e\uff08\u5df2\u7f29\u653e\uff09", occl: "\u5728\u53f3\u56fe\u4e2d\u88ab\u906e\u6321",
      hint: "\u5728\u4e09\u5e45\u56fe\u7684\u4efb\u610f\u4e00\u5e45\u4e0a\u70b9\u51fb\u6216\u62d6\u52a8\u4ee5\u9009\u62e9\u50cf\u7d20\uff1b\u4e0b\u65b9\u66f2\u7ebf\u663e\u793a\u5b83\u7684\u5339\u914d\u4ee3\u4ef7\u968f\u89c6\u5dee\u7684\u53d8\u5316\u3002\u5148\u5728\u65e0\u7eb9\u7406\u7684\u65b9\u5757\u4e0a\u8bd5 3 \u00d7 3 \u7a97\u53e3\uff0c\u518d\u5207\u6362\u5230 SGM\uff0c\u7136\u540e\u589e\u5927 P2\uff0c\u89c2\u5bdf\u5e73\u6ed1\u9879\u5982\u4f55\u8d77\u4e3b\u5bfc\u4f5c\u7528\u3002"
    },
    ja: {
      bm: "\u30d6\u30ed\u30c3\u30af\u30de\u30c3\u30c1\u30f3\u30b0", sgm: "SGM", win: "\u7a93", p1: "P1", p2: "P2", tex: "\u7bb1\u306e\u30c6\u30af\u30b9\u30c1\u30e3", noise: "\u30ce\u30a4\u30ba \u03c3",
      lr: "\u5de6\u53f3\u6574\u5408\u6027\u30c1\u30a7\u30c3\u30af", left: "\u5de6\u753b\u50cf", disp: "\u8996\u5dee", err: "\u8aa4\u5dee > 1 px\uff08\u8d64\uff09",
      bad: "\u8aa4\u308a\u753b\u7d20", rejected: "\u30c1\u30a7\u30c3\u30af\u3067\u9664\u5916", curve: "\u9078\u3093\u3060\u753b\u7d20\u306e\u30b3\u30b9\u30c8", truth: "\u771f\u306e d",
      raw: "C(d)\uff1a\u7a93\u306e\u30b3\u30b9\u30c8", agg: "S(d)\uff1aSGM \u96c6\u7d04\u5f8c\uff08\u30b9\u30b1\u30fc\u30eb\u6e08\u307f\uff09", occl: "\u53f3\u753b\u50cf\u3067\u906e\u853d",
      hint: "3 \u679a\u306e\u753b\u50cf\u306e\u3069\u308c\u304b\u3092\u30bf\u30c3\u30d7\u307e\u305f\u306f\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u753b\u7d20\u3092\u9078\u3076\u3068\u3001\u305d\u306e\u30de\u30c3\u30c1\u30f3\u30b0\u30b3\u30b9\u30c8\u3092\u8996\u5dee\u306e\u95a2\u6570\u3068\u3057\u3066\u8868\u793a\u3057\u307e\u3059\u3002\u7121\u5730\u306e\u7bb1\u3067 3 \u00d7 3 \u7a93\u3092\u8a66\u3057\u3001\u6b21\u306b SGM \u306b\u5207\u308a\u66ff\u3048\u3001P2 \u3092\u4e0a\u3052\u308b\u3068\u5e73\u6ed1\u5316\u304c\u652f\u914d\u7684\u306b\u306a\u308b\u69d8\u5b50\u304c\u898b\u3048\u307e\u3059\u3002"
    }
  };
  var COL = { a: "#9467bd", b: "#ff7f0e", z: "#1f77b4", red: "#d62728", gray: "#7f7f7f", dark: "#222222", bg: "#fbfbfd" };
  var SW = 200, SH = 150, F = 167, B = 0.12, D = 24, CXs = (SW - 1) / 2, CYs = (SH - 1) / 2;

  // ---------- value noise ----------
  function hash(i, j, k) {
    var h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise(s, t, k) {
    var i = Math.floor(s), j = Math.floor(t), fs = s - i, ft = t - j;
    fs = fs * fs * (3 - 2 * fs); ft = ft * ft * (3 - 2 * ft);
    var a = hash(i, j, k), b = hash(i + 1, j, k), c = hash(i, j + 1, k), d = hash(i + 1, j + 1, k);
    return a + (b - a) * fs + (c - a) * ft + (a - b - c + d) * fs * ft;
  }
  function surfaces(texAmp) {
    return [
      { n: [0.25, 0, 1], c: 3.4, tex: function (P) { return 85 + 70 * noise(P[0] / 0.06, P[1] / 0.06, 1) + 30 * noise(P[0] / 0.015, P[1] / 0.015, 2); } },
      { n: [0, 1, 0], c: 0.55, tex: function (P) { return 90 + 90 * noise(P[0] / 0.05, P[2] / 0.05, 3); } },
      { n: [0, 0, 1], c: 1.5, lim: [-0.75, -0.25, -0.15, 0.55], tex: function (P) { return 60 + 150 * noise(P[0] / 0.02, P[1] / 0.02, 4); } },
      { n: [-0.9, 0, 1], c: 1.73, lim: [0.15, 0.6, -0.35, 0.3], tex: function (P) { return noise(P[0] / 0.03, P[1] / 0.03, 5) > 0.5 ? 220 : 40; } },
      { n: [0, 0, 1], c: 1.1, lim: [-0.05, 0.3, 0.2, 0.55], tex: function (P) { return 190 + texAmp * (noise(P[0] / 0.02, P[1] / 0.02, 6) - 0.5); } }
    ];
  }
  function cast(srf, camx, u, v) {
    var d = [(u - CXs) / F, (v - CYs) / F, 1], best = Infinity, shade = 0;
    for (var i = 0; i < srf.length; i++) {
      var s = srf[i], den = s.n[0] * d[0] + s.n[1] * d[1] + s.n[2] * d[2];
      if (Math.abs(den) < 1e-9) continue;
      var lam = (s.c - s.n[0] * camx) / den;
      if (!(lam > 0 && lam < best)) continue;
      var P = [camx + lam * d[0], lam * d[1], lam];
      if (s.lim && (P[0] < s.lim[0] || P[0] > s.lim[1] || P[1] < s.lim[2] || P[1] > s.lim[3])) continue;
      best = lam; shade = s.tex(P);
    }
    return [shade, best];
  }
  function render(texAmp, sigma) {
    var srf = surfaces(texAmp), Lr = new Float32Array(SW * SH), Rr = new Float32Array(SW * SH);
    var gt = new Float32Array(SW * SH), gtr = new Float32Array(SW * SH), seed = 1;
    function gauss() {   // deterministic noise
      seed = (seed * 16807) % 2147483647; var u1 = seed / 2147483647;
      seed = (seed * 16807) % 2147483647; var u2 = seed / 2147483647;
      return Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(6.2831853 * u2);
    }
    for (var y = 0; y < SH; y++) for (var x = 0; x < SW; x++) {
      var i = y * SW + x, a = 0, b = 0;
      for (var dy = -0.25; dy <= 0.25; dy += 0.5) for (var dx = -0.25; dx <= 0.25; dx += 0.5) {
        a += cast(srf, 0, x + dx, y + dy)[0]; b += cast(srf, B, x + dx, y + dy)[0];
      }
      Lr[i] = a / 4 + sigma * gauss(); Rr[i] = b / 4 + sigma * gauss();
      gt[i] = F * B / cast(srf, 0, x, y)[1]; gtr[i] = F * B / cast(srf, B, x, y)[1];
    }
    var vis = new Uint8Array(SW * SH);
    for (y = 0; y < SH; y++) for (x = 0; x < SW; x++) {
      i = y * SW + x;
      var xm = x - Math.round(gt[i]);
      vis[i] = xm >= 0 && Math.abs(gtr[y * SW + xm] - gt[i]) <= 1 ? 1 : 0;
    }
    return { L: Lr, R: Rr, gt: gt, vis: vis };
  }

  // ---------- matching ----------
  function boxFilter(src, win) {   // mean over a win x win window, clamped borders
    var r = (win - 1) >> 1, tmp = new Float32Array(SW * SH), out = new Float32Array(SW * SH), x, y, k, s;
    for (y = 0; y < SH; y++) for (x = 0; x < SW; x++) {
      s = 0; for (k = -r; k <= r; k++) s += src[y * SW + Math.min(SW - 1, Math.max(0, x + k))];
      tmp[y * SW + x] = s;
    }
    for (y = 0; y < SH; y++) for (x = 0; x < SW; x++) {
      s = 0; for (k = -r; k <= r; k++) s += tmp[Math.min(SH - 1, Math.max(0, y + k)) * SW + x];
      out[y * SW + x] = s / (win * win);
    }
    return out;
  }
  function costVolume(L, R, win, right) {   // C[(y*SW + x)*D + d]; right: costs for the right image
    var C = new Float32Array(SW * SH * D), diff = new Float32Array(SW * SH), d, x, y, i;
    for (d = 0; d < D; d++) {
      for (y = 0; y < SH; y++) for (x = 0; x < SW; x++) {
        i = y * SW + x;
        if (!right) diff[i] = x - d >= 0 ? Math.abs(L[i] - R[i - d]) : 255;
        else diff[i] = x + d < SW ? Math.abs(R[i] - L[i + d]) : 255;
      }
      var f = boxFilter(diff, win);
      for (i = 0; i < SW * SH; i++) C[i * D + d] = f[i];
    }
    return C;
  }
  function sgm(C, P1, P2) {
    var S = new Float32Array(C.length), prev = new Float32Array(D), cur = new Float32Array(D);
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    dirs.forEach(function (dv) {
      var lines = dv[0] !== 0 ? SH : SW, len = dv[0] !== 0 ? SW : SH;
      for (var ln = 0; ln < lines; ln++) {
        for (var s = 0; s < len; s++) {
          var x, y;
          if (dv[0] !== 0) { y = ln; x = dv[0] > 0 ? s : SW - 1 - s; } else { x = ln; y = dv[1] > 0 ? s : SH - 1 - s; }
          var base = (y * SW + x) * D, d;
          if (s === 0) { for (d = 0; d < D; d++) cur[d] = C[base + d]; }
          else {
            var m = Infinity;
            for (d = 0; d < D; d++) if (prev[d] < m) m = prev[d];
            for (d = 0; d < D; d++) {
              var v = prev[d];
              if (d > 0 && prev[d - 1] + P1 < v) v = prev[d - 1] + P1;
              if (d < D - 1 && prev[d + 1] + P1 < v) v = prev[d + 1] + P1;
              if (m + P2 < v) v = m + P2;
              cur[d] = C[base + d] + v - m;
            }
          }
          for (d = 0; d < D; d++) { S[base + d] += cur[d]; prev[d] = cur[d]; }
        }
      }
    });
    return S;
  }
  function wta(V) {
    var out = new Float32Array(SW * SH);
    for (var i = 0; i < SW * SH; i++) {
      var b = i * D, bd = 0, bv = V[b];
      for (var d = 1; d < D; d++) if (V[b + d] < bv) { bv = V[b + d]; bd = d; }
      var off = 0;
      if (bd > 0 && bd < D - 1) {
        var c0 = V[b + bd - 1], c2 = V[b + bd + 1], den = c0 - 2 * bv + c2;
        if (den > 0) off = 0.5 * (c0 - c2) / den;
      }
      out[i] = bd + off;
    }
    return out;
  }

  function el(tag, css, parent) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (parent) parent.appendChild(e); return e; }
  function viridis(t) {
    var stops = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
    t = Math.max(0, Math.min(1, t)) * 4; var i = Math.min(3, Math.floor(t)), f = t - i, a = stops[i], b = stops[i + 1];
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])];
  }

  function init(root) {
    var lang = TXT[root.dataset.lang] ? root.dataset.lang : "en", T = TXT[lang];
    root.innerHTML = "";
    root.style.background = COL.bg; root.style.padding = "8px"; root.style.boxSizing = "border-box";
    var S = { method: "sgm", win: 5, p1: 2, p2: 16, tex: 6, noise: 1.5, lr: false, px: 140, py: 115 };
    var bar = el("div", "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;", root), mbtn = {};
    ["bm", "sgm"].forEach(function (k) {
      var b = el("button", "padding:3px 10px;border:1px solid #bbb;border-radius:4px;background:#fff;color:#222;cursor:pointer;font-size:13px;touch-action:manipulation;", bar);
      b.type = "button"; b.textContent = T[k]; mbtn[k] = b;
      b.addEventListener("click", function () { S.method = k; recompute(false); });
    });
    var canvas = el("canvas", "display:block;width:100%;touch-action:none;cursor:crosshair;", root);
    var panel = el("div", "display:flex;flex-wrap:wrap;gap:2px 18px;margin-top:6px;font-size:13.5px;color:#222;", root);
    var inputs = {};
    function slider(key, min, max, step, digits, rerender) {
      var wrap = el("label", "display:flex;align-items:center;gap:8px;flex:1 1 200px;min-width:0;", panel);
      el("span", "white-space:nowrap;flex:none;min-width:5em;", wrap).textContent = T[key];
      var inp = el("input", "flex:1;min-width:70px;", wrap);
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step;
      var val = el("span", "font-family:monospace;flex:none;min-width:2.6em;text-align:right;", wrap);
      inp.addEventListener("change", function () { S[key] = parseFloat(inp.value); recompute(rerender); });
      inp.addEventListener("input", function () { val.textContent = (+inp.value).toFixed(digits); });
      inputs[key] = { inp: inp, val: val, digits: digits };
    }
    slider("win", 1, 15, 2, 0, false); slider("p1", 0, 20, 0.5, 1, false); slider("p2", 0, 120, 1, 0, false);
    slider("tex", 0, 120, 1, 0, true); slider("noise", 0, 8, 0.1, 1, true);
    var opt = el("label", "display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13.5px;margin-top:4px;color:#222;", root);
    var cb = el("input", "", opt); cb.type = "checkbox"; el("span", "", opt).textContent = T.lr;
    cb.addEventListener("change", function () { S.lr = cb.checked; recompute(false); });
    var readout = el("div", "font-family:monospace;font-size:12.5px;line-height:1.5;margin-top:6px;color:#222;white-space:pre-wrap;", root);
    el("div", "font-size:12.5px;color:#666;margin-top:4px;", root).textContent = T.hint;

    var summary = "", data = null, C = null, Sagg = null, Dmap = null, ok = null, ctx = canvas.getContext("2d"), Lw = 0, Lay = null;
    var imgs = { left: null, disp: null, err: null };
    function toCanvas(fn) {
      var c = document.createElement("canvas"); c.width = SW; c.height = SH;
      var cx = c.getContext("2d"), id = cx.createImageData(SW, SH);
      for (var i = 0; i < SW * SH; i++) { var p = fn(i); id.data[4 * i] = p[0]; id.data[4 * i + 1] = p[1]; id.data[4 * i + 2] = p[2]; id.data[4 * i + 3] = 255; }
      cx.putImageData(id, 0, 0); return c;
    }
    function recompute(rerender) {
      for (var k in inputs) { inputs[k].inp.value = S[k]; inputs[k].val.textContent = (+S[k]).toFixed(inputs[k].digits); }
      for (k in mbtn) { mbtn[k].style.background = S.method === k ? "#ece4f7" : "#fff"; mbtn[k].style.borderColor = S.method === k ? COL.a : "#bbb"; }
      if (rerender || !data) data = render(S.tex, S.noise);
      C = costVolume(data.L, data.R, S.win, false);
      Sagg = S.method === "sgm" ? sgm(C, S.p1, S.p2) : null;
      Dmap = wta(Sagg || C);
      ok = new Uint8Array(SW * SH).fill(1);
      var nrej = 0;
      if (S.lr) {
        var Cr = costVolume(data.L, data.R, S.win, true), Dr = wta(S.method === "sgm" ? sgm(Cr, S.p1, S.p2) : Cr);
        for (var y = 0; y < SH; y++) for (var x = 0; x < SW; x++) {
          var i = y * SW + x, xr = Math.round(x - Dmap[i]);
          if (xr < 0 || xr >= SW || Math.abs(Dr[y * SW + xr] - Dmap[i]) > 1) { ok[i] = 0; nrej++; }
        }
      }
      var nb = 0, nv = 0;
      for (i = 0; i < SW * SH; i++) {
        var xx = i % SW, yy = (i / SW) | 0;
        if (!data.vis[i] || !ok[i] || xx < 6 || yy < 6 || xx >= SW - 6 || yy >= SH - 6) continue;
        nv++; if (Math.abs(Dmap[i] - data.gt[i]) > 1) nb++;
      }
      imgs.left = toCanvas(function (i) { var g = Math.max(0, Math.min(255, data.L[i])); return [g, g, g]; });
      imgs.disp = toCanvas(function (i) { return ok[i] ? viridis((Dmap[i] - 4) / 18) : [217, 217, 217]; });
      imgs.err = toCanvas(function (i) {
        var g = 115 + 0.55 * Math.max(0, Math.min(255, data.L[i]));
        if (!data.vis[i]) return [140, 140, 140];
        if (!ok[i]) return [217, 217, 217];
        return Math.abs(Dmap[i] - data.gt[i]) > 1 ? [214, 39, 40] : [g, g, g];
      });
      summary = T.bad + ": " + (100 * nb / Math.max(1, nv)).toFixed(1) + "%" +
        (S.lr ? "   " + T.rejected + ": " + (100 * nrej / (SW * SH)).toFixed(1) + "%" : "");
      draw();
    }
    function resize() {
      var w = root.clientWidth - 16; if (w < 10) return;
      var narrow = w < 560, gap = 8, iw, ih, ch;
      if (narrow) {
        iw = (w - gap) / 2; ih = iw * SH / SW; ch = Math.round(w * 0.45);
        var cy0 = 18 + 2 * ih + 22 + 16;
        Lay = { imgs: [[0, 18, iw, ih], [iw + gap, 18, iw, ih], [0, 18 + ih + 22, iw, ih]], chart: [30, cy0, w - 38, ch], h: cy0 + ch + 30 };
      }
      else { iw = (w - 2 * gap) / 3; ih = iw * SH / SW; ch = Math.round(Math.min(220, w * 0.3)); Lay = { imgs: [[0, 18, iw, ih], [iw + gap, 18, iw, ih], [2 * (iw + gap), 18, iw, ih]], chart: [44, 18 + ih + 30, w - 60, ch], h: 18 + ih + 30 + ch + 30 }; }
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.height = Lay.h + "px"; canvas.width = Math.round(w * dpr); canvas.height = Math.round(Lay.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); Lw = w; draw();
    }
    function draw() {
      if (!Lw || !Lay || !imgs.left) return;
      ctx.clearRect(0, 0, Lw, Lay.h);
      ctx.imageSmoothingEnabled = false;
      var names = [T.left, T.disp, T.err];
      [imgs.left, imgs.disp, imgs.err].forEach(function (im, k) {
        var r = Lay.imgs[k];
        ctx.drawImage(im, r[0], r[1], r[2], r[3]);
        ctx.fillStyle = COL.dark; ctx.font = "12px sans-serif"; ctx.fillText(names[k], r[0] + 1, r[1] - 5);
        var sx = r[0] + (S.px + 0.5) * r[2] / SW, sy = r[1] + (S.py + 0.5) * r[3] / SH;
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 7); ctx.stroke();
        ctx.strokeStyle = COL.b; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 7); ctx.stroke();
      });
      // cost chart
      var c = Lay.chart, i = S.py * SW + S.px, base = i * D, d, mx = 0, mn = Infinity, smx = 0, smn = Infinity;
      for (d = 0; d < D; d++) { mx = Math.max(mx, C[base + d]); mn = Math.min(mn, C[base + d]); if (Sagg) { smx = Math.max(smx, Sagg[base + d]); smn = Math.min(smn, Sagg[base + d]); } }
      mx = Math.max(mx, 1);
      ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1; ctx.strokeRect(c[0], c[1], c[2], c[3]);
      var X = function (dd) { return c[0] + dd / (D - 1) * c[2]; }, Y = function (v) { return c[1] + c[3] - v / mx * c[3] * 0.95; };
      ctx.fillStyle = COL.gray; ctx.font = "11px sans-serif";
      for (d = 0; d < D; d += 4) ctx.fillText(String(d), X(d) - 3, c[1] + c[3] + 13);
      ctx.fillText("d", c[0] + c[2] - 8, c[1] + c[3] + 25);
      ctx.fillText(mx.toFixed(0), c[0] - 26, c[1] + 10); ctx.fillText("0", c[0] - 12, c[1] + c[3]);
      if (data.vis[i]) { ctx.strokeStyle = COL.dark; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(data.gt[i]), c[1]); ctx.lineTo(X(data.gt[i]), c[1] + c[3]); ctx.stroke(); ctx.setLineDash([]); }
      ctx.strokeStyle = COL.b; ctx.lineWidth = 2; ctx.beginPath();
      for (d = 0; d < D; d++) { if (d === 0) ctx.moveTo(X(d), Y(C[base + d])); else ctx.lineTo(X(d), Y(C[base + d])); }
      ctx.stroke();
      if (Sagg && smx > smn) {
        ctx.strokeStyle = COL.a; ctx.beginPath();
        for (d = 0; d < D; d++) { var v = mn + (Sagg[base + d] - smn) / (smx - smn) * (mx - mn); if (d === 0) ctx.moveTo(X(d), Y(v)); else ctx.lineTo(X(d), Y(v)); }
        ctx.stroke();
      }
      ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(X(Dmap[i]), c[1] + c[3] - 4, 4, 0, 7); ctx.fill();
      var lx = c[0] + 6, ly = c[1] + 14;
      ctx.font = "11.5px sans-serif";
      ctx.fillStyle = COL.b; ctx.fillText(T.raw, lx, ly);
      if (Sagg) { ctx.fillStyle = COL.a; ctx.fillText(T.agg, lx, ly + 14); }
      readout.textContent = summary + "\n(x, y) = (" + S.px + ", " + S.py + ")   d = " + Dmap[i].toFixed(2) + "   " +
        (data.vis[i] ? T.truth + " = " + data.gt[i].toFixed(2) : T.occl);
    }
    var drag = false;
    function pick(e) {
      var bx = canvas.getBoundingClientRect(), x = e.clientX - bx.left, y = e.clientY - bx.top;
      for (var k = 0; k < 3; k++) {
        var r = Lay.imgs[k];
        if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) {
          S.px = Math.max(0, Math.min(SW - 1, Math.floor((x - r[0]) / r[2] * SW)));
          S.py = Math.max(0, Math.min(SH - 1, Math.floor((y - r[1]) / r[3] * SH)));
          draw(); return true;
        }
      }
      return false;
    }
    canvas.addEventListener("pointerdown", function (e) { if (pick(e)) { drag = true; canvas.setPointerCapture(e.pointerId); e.preventDefault(); } });
    canvas.addEventListener("pointermove", function (e) { if (drag) pick(e); });
    canvas.addEventListener("pointerup", function () { drag = false; });
    canvas.addEventListener("pointercancel", function () { drag = false; });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(root); else window.addEventListener("resize", resize);
    recompute(true);
    resize();
  }
  function boot() {
    var els = document.querySelectorAll('[data-widget="3d-vision-stereo-matching"]');
    for (var i = 0; i < els.length; i++) init(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
