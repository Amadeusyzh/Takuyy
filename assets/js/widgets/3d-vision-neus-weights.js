/* From an SDF to volume rendering weights (3d-vision post 09).
 * Along one ray t, the scene is a plane met at incidence angle theta (f(t) = -cos(theta) (t - t*), t* = 2),
 * or a 0.3 m slab followed by a second surface at t = 3. Two ways to turn f into weights w(t) = T(t) sigma(t):
 *   naive: sigma = phi_s(f) (the logistic density), alpha_i = 1 - exp(-sigma_i dt);
 *   NeuS:  alpha_i = max((Phi_s(f_i) - Phi_s(f_{i+1})) / Phi_s(f_i), 0), Phi_s the sigmoid of s f.
 * Curves use 2000 samples; the bars show the NeuS weights computed from only n samples, as a renderer would.
 * The readout compares the naive peak with the closed-form bias -ln(P/(1-P)) / (s cos theta),
 * P = (1 - 2c + sqrt(4c^2 + 1)) / 2, derived in the post.
 */
(function () {
  "use strict";

  var TEXT = {
    en: {
      plane: "one plane", slab: "slab + surface", s: "sharpness s", th: "incidence \u03b8", n: "samples n",
      naive: "naive \u03c3 = \u03c6_s(f)", neus: "NeuS", disc: "NeuS, n samples", sdf: "f(t)",
      peakN: "naive peak \u2212 t*", theory: "theory", peakS: "NeuS peak \u2212 t*", opac: "opacity \u03a3w (naive / NeuS)",
      hint: "Drag on the plot left/right to change s, up/down to change \u03b8."
    },
    zh: {
      plane: "\u5355\u4e2a\u5e73\u9762", slab: "\u677f + \u8868\u9762", s: "\u9510\u5ea6 s", th: "\u5165\u5c04\u89d2 \u03b8", n: "\u91c7\u6837\u6570 n",
      naive: "\u6734\u7d20 \u03c3 = \u03c6_s(f)", neus: "NeuS", disc: "NeuS\uff0cn \u4e2a\u91c7\u6837", sdf: "f(t)",
      peakN: "\u6734\u7d20\u5cf0\u503c \u2212 t*", theory: "\u7406\u8bba\u503c", peakS: "NeuS \u5cf0\u503c \u2212 t*", opac: "\u4e0d\u900f\u660e\u5ea6 \u03a3w\uff08\u6734\u7d20 / NeuS\uff09",
      hint: "\u5728\u56fe\u4e0a\u5de6\u53f3\u62d6\u52a8\u6539\u53d8 s\uff0c\u4e0a\u4e0b\u62d6\u52a8\u6539\u53d8 \u03b8\u3002"
    },
    ja: {
      plane: "\u5e73\u9762 1 \u679a", slab: "\u677f + \u8868\u9762", s: "\u92ed\u3055 s", th: "\u5165\u5c04\u89d2 \u03b8", n: "\u30b5\u30f3\u30d7\u30eb\u6570 n",
      naive: "\u7d20\u6734 \u03c3 = \u03c6_s(f)", neus: "NeuS", disc: "NeuS\u3001n \u30b5\u30f3\u30d7\u30eb", sdf: "f(t)",
      peakN: "\u7d20\u6734\u306a\u30d4\u30fc\u30af \u2212 t*", theory: "\u7406\u8ad6\u5024", peakS: "NeuS \u306e\u30d4\u30fc\u30af \u2212 t*", opac: "\u4e0d\u900f\u660e\u5ea6 \u03a3w\uff08\u7d20\u6734 / NeuS\uff09",
      hint: "\u56f3\u3092\u5de6\u53f3\u306b\u30c9\u30e9\u30c3\u30b0\u3059\u308b\u3068 s\u3001\u4e0a\u4e0b\u3067 \u03b8 \u304c\u5909\u308f\u308a\u307e\u3059\u3002"
    }
  };
  var T0 = 1.0, T1 = 3.6, NDENSE = 2000;

  function sig(x) { return 0.5 * (1 + Math.tanh(0.5 * x)); }
  function sdfAt(mode, c, t) {
    if (mode === "plane") return -c * (t - 2.0);
    // slab [2.0, 2.3], second object from 3.0, head-on distances scaled by cos(theta)
    var slab = Math.max(2.0 - t, t - 2.3), wall = 3.0 - t;
    return c * (t < 3.0 ? Math.min(slab, wall) : wall);
  }
  function weights(fs, s, dt, kind) {
    var n = fs.length, w = new Float64Array(n - 1), T = 1;
    for (var i = 0; i < n - 1; i++) {
      var a;
      if (kind === "naive") {
        var p = sig(s * fs[i]), phi = s * p * (1 - p);
        a = 1 - Math.exp(-phi * dt);
      } else {
        var P0 = sig(s * fs[i]), P1 = sig(s * fs[i + 1]);
        a = Math.max((P0 - P1) / Math.max(P0, 1e-12), 0);
      }
      w[i] = T * a;
      T *= 1 - a;
    }
    return w;
  }

  function setup(root) {
    var L = TEXT[root.dataset.lang] || TEXT.en;
    root.innerHTML = "";
    root.style.background = "#fbfbfd";
    root.style.color = "#222";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.fontSize = "14px";
    var S = { mode: "plane", logs: Math.log(20), th: 0, n: 64 };

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:8px 10px 4px";
    root.appendChild(bar);
    function btn(txt, cb) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = txt;
      b.style.cssText = "font:inherit;padding:3px 9px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222;cursor:pointer;touch-action:manipulation";
      b.addEventListener("click", cb);
      bar.appendChild(b);
      return b;
    }
    var sliders = {};
    function slider(key, txt, min, max, step, val, fmt, cb) {
      var l = document.createElement("label");
      l.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap";
      var sp = document.createElement("span");
      var inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
      inp.style.width = "100px";
      function show() { sp.textContent = txt + " " + fmt(+inp.value); }
      inp.addEventListener("input", function () { show(); cb(+inp.value); draw(); });
      show();
      l.appendChild(sp); l.appendChild(inp); bar.appendChild(l);
      sliders[key] = { inp: inp, show: show };
    }
    var bP = btn(L.plane, function () { S.mode = "plane"; mark(); draw(); });
    var bS = btn(L.slab, function () { S.mode = "slab"; mark(); draw(); });
    function mark() { bP.style.fontWeight = S.mode === "plane" ? "600" : "400"; bS.style.fontWeight = S.mode === "slab" ? "600" : "400"; }
    slider("s", L.s, Math.log(4), Math.log(400), 0.01, S.logs, function (v) { return Math.exp(v).toFixed(0); }, function (v) { S.logs = v; });
    slider("th", L.th, 0, 85, 1, S.th, function (v) { return v.toFixed(0) + "\u00b0"; }, function (v) { S.th = v; });
    slider("n", L.n, 8, 256, 8, S.n, function (v) { return v.toFixed(0); }, function (v) { S.n = v; });

    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;margin:4px 10px;touch-action:none;cursor:ew-resize;border-radius:6px;background:#fff;box-shadow:0 0 0 1px #ddd";
    root.appendChild(cv);
    var info = document.createElement("div");
    info.style.cssText = "padding:4px 12px 10px;line-height:1.6;font-variant-numeric:tabular-nums";
    root.appendChild(info);
    var ctx = cv.getContext("2d"), CW = 600, CH = 300, lastW = -1;

    function resize() {
      var w = Math.max(260, root.clientWidth - 20);
      if (w === lastW) return;
      lastW = w;
      CW = w; CH = Math.round(Math.min(340, Math.max(230, w * 0.48)));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.width = CW + "px"; cv.style.height = CH + "px";
      cv.width = Math.round(CW * dpr); cv.height = Math.round(CH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function draw() {
      var s = Math.exp(S.logs), c = Math.cos(S.th * Math.PI / 180);
      var dt = (T1 - T0) / (NDENSE - 1), fs = new Float64Array(NDENSE), i;
      for (i = 0; i < NDENSE; i++) fs[i] = sdfAt(S.mode, c, T0 + i * dt);
      var wN = weights(fs, s, dt, "naive"), wS = weights(fs, s, dt, "neus");
      var nS = S.n, dts = (T1 - T0) / (nS - 1), fd = new Float64Array(nS);
      for (i = 0; i < nS; i++) fd[i] = sdfAt(S.mode, c, T0 + i * dts);
      var wD = weights(fd, s, dts, "neus");
      // densities w / dt for plotting
      var ymax = 0;
      for (i = 0; i < NDENSE - 1; i++) ymax = Math.max(ymax, wN[i] / dt, wS[i] / dt);
      for (i = 0; i < nS - 1; i++) ymax = Math.max(ymax, wD[i] / dts);
      ymax *= 1.12;
      var padL = 40, padR = 40, padT = 14, padB = 30;
      function X(t) { return padL + (t - T0) / (T1 - T0) * (CW - padL - padR); }
      function Y(v) { return CH - padB - v / ymax * (CH - padT - padB); }
      function Yf(f) { return padT + (0.5 - f / 1.6) * (CH - padT - padB); }
      ctx.clearRect(0, 0, CW, CH);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, CW, CH);
      // axes and grid
      ctx.strokeStyle = "#e5e5e5"; ctx.lineWidth = 1; ctx.fillStyle = "#555"; ctx.font = "12px system-ui, sans-serif";
      for (var tt = 1.0; tt <= 3.61; tt += 0.5) {
        ctx.beginPath(); ctx.moveTo(X(tt), padT); ctx.lineTo(X(tt), CH - padB); ctx.stroke();
        ctx.fillText(tt.toFixed(1), X(tt) - 9, CH - padB + 16);
      }
      ctx.fillText("t (m)", CW - padR - 10, CH - 4);
      ctx.strokeStyle = "#999";
      ctx.beginPath(); ctx.moveTo(padL, CH - padB); ctx.lineTo(CW - padR, CH - padB); ctx.stroke();
      // surfaces
      var surf = S.mode === "plane" ? [2.0] : [2.0, 2.3, 3.0];
      ctx.strokeStyle = "#222"; ctx.setLineDash([4, 4]);
      surf.forEach(function (x) { ctx.beginPath(); ctx.moveTo(X(x), padT); ctx.lineTo(X(x), CH - padB); ctx.stroke(); });
      ctx.setLineDash([]);
      // the SDF (right axis), clipped to the plot area
      ctx.save();
      ctx.beginPath(); ctx.rect(padL, padT, CW - padL - padR, CH - padT - padB); ctx.clip();
      ctx.strokeStyle = "rgba(44,160,44,0.75)"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (i = 0; i < NDENSE; i += 4) { var xx = X(T0 + i * dt), yy = Yf(fs[i]); if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#2ca02c"; ctx.fillText(L.sdf, CW - padR + 4, Yf(0) + 4);
      // discrete NeuS bars
      ctx.fillStyle = "rgba(148,103,189,0.28)";
      var bw = Math.max(1, X(T0 + dts) - X(T0) - 1);
      for (i = 0; i < nS - 1; i++) {
        var v = wD[i] / dts;
        if (v <= 0) continue;
        ctx.fillRect(X(T0 + i * dts), Y(v), bw, CH - padB - Y(v));
      }
      function curve(w, col, width) {
        ctx.strokeStyle = col; ctx.lineWidth = width;
        ctx.beginPath();
        for (var k = 0; k < NDENSE - 1; k++) { var x = X(T0 + (k + 0.5) * dt), y = Y(w[k] / dt); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      }
      curve(wN, "#ff7f0e", 2.2);
      curve(wS, "#9467bd", 2.6);
      // legend
      var lg = [[L.naive, "#ff7f0e"], [L.neus, "#9467bd"], [L.disc, "rgba(148,103,189,0.4)"]];
      ctx.font = "13px system-ui, sans-serif";
      lg.forEach(function (e, k) {
        ctx.fillStyle = e[1]; ctx.fillRect(padL + 8, padT + 6 + 18 * k, 16, 8);
        ctx.fillStyle = "#222"; ctx.fillText(e[0], padL + 30, padT + 14 + 18 * k);
      });
      // readout
      function argmax(w) { var b = 0; for (var k = 1; k < w.length; k++) if (w[k] > w[b]) b = k; return b; }
      function sum(w) { var a = 0; for (var k = 0; k < w.length; k++) a += w[k]; return a; }
      var pN = T0 + (argmax(wN) + 0.5) * dt - 2.0, pS = T0 + (argmax(wS) + 0.5) * dt - 2.0;
      var P = (1 - 2 * c + Math.sqrt(4 * c * c + 1)) / 2, th = -Math.log(P / (1 - P)) / (s * c);
      var mm = function (v) { return (v >= 0 ? "+" : "\u2212") + Math.abs(1000 * v).toFixed(1) + " mm"; };
      info.innerHTML = "<div><b>" + L.peakN + ":</b> " + mm(pN) + (S.mode === "plane" ? " &nbsp;(" + L.theory + " " + mm(th) + ")" : "") + "</div>" +
        "<div><b>" + L.peakS + ":</b> " + mm(pS) + "</div>" +
        "<div><b>" + L.opac + ":</b> " + sum(wN).toFixed(3) + " / " + sum(wS).toFixed(3) + "</div>" +
        "<div style='color:#555;margin-top:4px'>" + L.hint + "</div>";
    }

    // drag: x -> s (log), y -> theta
    var drag = null;
    cv.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY, logs: S.logs, th: S.th };
      cv.setPointerCapture(e.pointerId); e.preventDefault();
    });
    cv.addEventListener("pointermove", function (e) {
      if (!drag) return;
      S.logs = Math.min(Math.log(400), Math.max(Math.log(4), drag.logs + (e.clientX - drag.x) / 120));
      S.th = Math.min(85, Math.max(0, Math.round(drag.th - (e.clientY - drag.y) / 3)));
      sliders.s.inp.value = S.logs; sliders.s.show();
      sliders.th.inp.value = S.th; sliders.th.show();
      draw();
    });
    function end() { drag = null; }
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);

    mark();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function init() {
    document.querySelectorAll('[data-widget="3d-vision-neus-weights"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
