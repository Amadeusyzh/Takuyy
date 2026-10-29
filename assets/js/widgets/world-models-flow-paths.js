// Flow matching vs diffusion sampling paths (world-models post 02).
// Same toy data as the post (8 Gaussians, radius 2, std 0.1). Both fields are EXACT for this mixture:
//  - flow matching (noise at t = 0, data at t = 1, x_t = (1 - t) x0 + t x1):
//      v(x, t) = sum_k w_k(x) [mu_k + (t s^2 - (1 - t)) / V_t (x - t mu_k)],  V_t = t^2 s^2 + (1 - t)^2
//  - diffusion: DDPM linear schedule, deterministic DDIM (probability-flow ODE) with eps = -sqrt(1 - ab) * score.
// Drag the noise sample; the slider sets the number of solver steps N (Euler for flow matching, DDIM for diffusion).
// Both exact ODEs end at the same data point: with x_vp = a x1 + b eps, x_fm = x_vp / (a + b) at t = a / (a + b),
// so the two flows differ only by a rescaling of space and time. The speed along the path is what differs.
(function () {
  "use strict";
  var T = 1000, S = 0.1, LIM = 3.0;
  var AB = new Float64Array(T);
  (function () { var p = 1; for (var t = 0; t < T; t++) { p *= 1 - (1e-4 + (0.02 - 1e-4) * t / (T - 1)); AB[t] = p; } })();
  var MU = [];
  for (var k = 0; k < 8; k++) MU.push([2 * Math.cos(k * Math.PI / 4), 2 * Math.sin(k * Math.PI / 4)]);
  var CD = "#ff7f0e", CF = "#9467bd";

  var TXT = {
    en: { steps: "solver steps N", diff: "diffusion (DDIM)", flow: "flow matching (Euler)", drag: "drag the noise sample",
      fine: "thin: exact ODE path (dots = equal time steps); thick: N-step solver", dist: "distance to nearest mode" },
    zh: { steps: "\u6c42\u89e3\u6b65\u6570 N", diff: "\u6269\u6563\uff08DDIM\uff09", flow: "\u6d41\u5339\u914d\uff08Euler\uff09",
      drag: "\u62d6\u52a8\u566a\u58f0\u6837\u672c", fine: "\u7ec6\u7ebf\uff1a\u7cbe\u786e ODE \u8def\u5f84\uff08\u70b9 = \u7b49\u95f4\u9694\u65f6\u95f4\u6b65\uff09\uff1b\u7c97\u7ebf\uff1aN \u6b65\u6c42\u89e3\u5668",
      dist: "\u5230\u6700\u8fd1\u6a21\u5f0f\u7684\u8ddd\u79bb" },
    ja: { steps: "\u30bd\u30eb\u30d0\u306e\u30b9\u30c6\u30c3\u30d7\u6570 N", diff: "\u62e1\u6563\uff08DDIM\uff09",
      flow: "\u30d5\u30ed\u30fc\u30de\u30c3\u30c1\u30f3\u30b0\uff08Euler\uff09", drag: "\u30ce\u30a4\u30ba\u30b5\u30f3\u30d7\u30eb\u3092\u30c9\u30e9\u30c3\u30b0",
      fine: "\u7d30\u7dda\uff1a\u53b3\u5bc6\u306a ODE \u7d4c\u8def\uff08\u70b9 = \u7b49\u9593\u9694\u306e\u6642\u523b\uff09\u3001\u592a\u7dda\uff1aN \u30b9\u30c6\u30c3\u30d7\u306e\u30bd\u30eb\u30d0",
      dist: "\u6700\u3082\u8fd1\u3044\u30e2\u30fc\u30c9\u307e\u3067\u306e\u8ddd\u96e2" }
  };

  function weights(x, y, cx, cy, v) {
    var lw = [], m = -Infinity, k;
    for (k = 0; k < 8; k++) { var dx = x - cx * MU[k][0], dy = y - cy * MU[k][1]; lw.push(-0.5 * (dx * dx + dy * dy) / v); if (lw[k] > m) m = lw[k]; }
    var Z = 0; for (k = 0; k < 8; k++) { lw[k] = Math.exp(lw[k] - m); Z += lw[k]; }
    for (k = 0; k < 8; k++) lw[k] /= Z;
    return lw;
  }
  function vel(p, t) {
    var V = t * t * S * S + (1 - t) * (1 - t), c = (t * S * S - (1 - t)) / V;
    var w = weights(p[0], p[1], t, t, V), vx = 0, vy = 0;
    for (var k = 0; k < 8; k++) {
      vx += w[k] * (MU[k][0] + c * (p[0] - t * MU[k][0]));
      vy += w[k] * (MU[k][1] + c * (p[1] - t * MU[k][1]));
    }
    return [vx, vy];
  }
  function epsHat(p, t) {
    var ab = AB[t], s = Math.sqrt(ab), v = ab * S * S + 1 - ab;
    var w = weights(p[0], p[1], s, s, v), gx = 0, gy = 0;
    for (var k = 0; k < 8; k++) { gx += w[k] * -(p[0] - s * MU[k][0]) / v; gy += w[k] * -(p[1] - s * MU[k][1]) / v; }
    var c = Math.sqrt(1 - ab);
    return [-c * gx, -c * gy];
  }
  function flowPath(p0, n) {
    var p = p0.slice(), out = [p.slice()];
    for (var i = 0; i < n; i++) { var v = vel(p, i / n); p = [p[0] + v[0] / n, p[1] + v[1] / n]; out.push(p.slice()); }
    return out;
  }
  function ddimPath(p0, n) {
    var ts = [];
    for (var i = 0; i < n; i++) ts.push(n === 1 ? T - 1 : Math.round((T - 1) - (T - 1) * i / (n - 1)));
    var p = p0.slice(), out = [p.slice()];
    for (i = 0; i < n; i++) {
      var ab = AB[ts[i]], abp = i + 1 < n ? AB[ts[i + 1]] : 1, e = epsHat(p, ts[i]);
      var x0 = [(p[0] - Math.sqrt(1 - ab) * e[0]) / Math.sqrt(ab), (p[1] - Math.sqrt(1 - ab) * e[1]) / Math.sqrt(ab)];
      p = [Math.sqrt(abp) * x0[0] + Math.sqrt(1 - abp) * e[0], Math.sqrt(abp) * x0[1] + Math.sqrt(1 - abp) * e[1]];
      out.push(p.slice());
    }
    return out;
  }
  function nearest(p) {
    var bd = 1e9; for (var k = 0; k < 8; k++) bd = Math.min(bd, Math.hypot(p[0] - MU[k][0], p[1] - MU[k][1]));
    return bd;
  }

  function init(el) {
    var L = TXT[el.dataset.lang] || TXT.en;
    el.innerHTML = ""; el.style.background = "#fff"; el.style.color = "#222";
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;margin:0 auto;touch-action:none;cursor:crosshair";
    el.appendChild(canvas);
    var ctrl = document.createElement("div");
    ctrl.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:8px 12px 10px;font:14px sans-serif";
    el.appendChild(ctrl);
    var lab = document.createElement("span"); lab.style.cssText = "white-space:nowrap;min-width:130px";
    var sl = document.createElement("input"); sl.type = "range"; sl.min = 1; sl.max = 40; sl.step = 1; sl.value = 4; sl.style.cssText = "flex:1;min-width:100px";
    var info = document.createElement("div"); info.style.cssText = "flex:1 1 100%;font-variant-numeric:tabular-nums;line-height:1.5";
    ctrl.appendChild(lab); ctrl.appendChild(sl); ctrl.appendChild(info);

    var ctx = canvas.getContext("2d"), size = 300, start = [-1.1, 0.7], dragging = false, lastW = -1;
    function toPx(x, y) { return [(x + LIM) / (2 * LIM) * size, (LIM - y) / (2 * LIM) * size]; }
    function layout() {
      var w = el.clientWidth || 400; if (w === lastW) return false; lastW = w;
      size = Math.max(240, Math.min(w - 24, 440));
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
      canvas.style.width = size + "px"; canvas.style.height = size + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }
    function poly(pts, col, lw, dash) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.beginPath();
      pts.forEach(function (p, i) { var q = toPx(p[0], p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    function dots(pts, every, col) {
      ctx.fillStyle = col;
      for (var i = 0; i < pts.length; i += every) { var q = toPx(pts[i][0], pts[i][1]); ctx.beginPath(); ctx.arc(q[0], q[1], 2.3, 0, 2 * Math.PI); ctx.fill(); }
    }
    function draw() {
      var n = parseInt(sl.value, 10);
      lab.textContent = L.steps + " = " + n;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = "#eee"; ctx.lineWidth = 1;
      for (var g = -3; g <= 3; g++) {
        var a = toPx(g, -LIM), b = toPx(g, LIM); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        a = toPx(-LIM, g); b = toPx(LIM, g); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5;
      MU.forEach(function (m) { var q = toPx(m[0], m[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 2 * S / (2 * LIM) * size, 0, 2 * Math.PI); ctx.stroke(); });
      var fineD = ddimPath(start, 200), fineF = flowPath(start, 200);
      ctx.globalAlpha = 0.45; poly(fineF, CF, 5); ctx.globalAlpha = 1; dots(fineF, 10, CF);
      poly(fineD, CD, 1.6); dots(fineD, 10, CD);
      var cD = ddimPath(start, n), cF = flowPath(start, n);
      poly(cD, CD, 3, [6, 4]); poly(cF, CF, 3, [6, 4]);
      [[cD, CD], [cF, CF]].forEach(function (pc) {
        var e = pc[0][pc[0].length - 1], q = toPx(e[0], e[1]);
        ctx.fillStyle = pc[1]; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.rect(q[0] - 5, q[1] - 5, 10, 10); ctx.fill(); ctx.stroke();
      });
      var q = toPx(start[0], start[1]);
      ctx.fillStyle = "#222"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#555"; ctx.font = "13px sans-serif"; ctx.textAlign = "left"; ctx.fillText(L.drag, 8, 18);
      var dD = nearest(cD[cD.length - 1]), dF = nearest(cF[cF.length - 1]);
      info.innerHTML = '<span style="color:' + CD + '">\u25a0 ' + L.diff + "</span>: " + L.dist + " " + dD.toFixed(2) +
        '<br><span style="color:' + CF + '">\u25a0 ' + L.flow + "</span>: " + L.dist + " " + dF.toFixed(2) +
        '<br><span style="color:#666;font-size:12px">' + L.fine + "</span>";
    }
    function pointer(ev) {
      var r = canvas.getBoundingClientRect();
      var x = (ev.clientX - r.left) / size * 2 * LIM - LIM, y = LIM - (ev.clientY - r.top) / size * 2 * LIM;
      start = [Math.max(-LIM, Math.min(LIM, x)), Math.max(-LIM, Math.min(LIM, y))];
      draw();
    }
    canvas.addEventListener("pointerdown", function (ev) { dragging = true; canvas.setPointerCapture(ev.pointerId); pointer(ev); ev.preventDefault(); });
    canvas.addEventListener("pointermove", function (ev) { if (dragging) pointer(ev); });
    canvas.addEventListener("pointerup", function () { dragging = false; });
    canvas.addEventListener("pointercancel", function () { dragging = false; });
    sl.addEventListener("input", draw);
    function resize() { if (layout()) draw(); }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el); else window.addEventListener("resize", resize);
    resize();
  }

  function boot() {
    var els = document.querySelectorAll('[data-widget="world-models-flow-paths"]');
    for (var i = 0; i < els.length; i++) init(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
