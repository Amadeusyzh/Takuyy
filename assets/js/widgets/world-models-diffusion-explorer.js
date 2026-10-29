// 2D diffusion explorer (world-models post 02).
// Data: the post's mixture of 8 Gaussians (radius 2, std 0.1); DDPM linear schedule
// beta = linspace(1e-4, 0.02, 1000). Everything uses the EXACT score of the noised mixture,
//   grad log p_t(x) = sum_k w_k(x) * -(x - sqrt(ab) mu_k) / (ab std^2 + 1 - ab),
// i.e. what a perfectly trained denoiser would output (eps = -sqrt(1 - ab) * score).
// Forward mode: x_t = sqrt(ab) x_0 + sqrt(1 - ab) eps for fixed samples. Reverse mode: DDIM
// (eta = 0, 100 steps) from pure noise. Drag the probe to see its score and its ODE path to t = 0.
(function () {
  "use strict";
  var T = 1000, STD = 0.1, LIM = 3.2, N = 500;
  var AB = new Float64Array(T);
  (function () { var p = 1; for (var t = 0; t < T; t++) { p *= 1 - (1e-4 + (0.02 - 1e-4) * t / (T - 1)); AB[t] = p; } })();
  var MU = [];
  for (var k = 0; k < 8; k++) MU.push([2 * Math.cos(k * Math.PI / 4), 2 * Math.sin(k * Math.PI / 4)]);
  var COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f"];

  var TXT = {
    en: { fwd: "forward: noise the data", rev: "reverse: DDIM from noise", field: "score field", play: "play",
      pause: "pause", probe: "drag the black probe", snr: "SNR" },
    zh: { fwd: "\u524d\u5411\uff1a\u7ed9\u6570\u636e\u52a0\u566a", rev: "\u53cd\u5411\uff1a\u4ece\u566a\u58f0\u7528 DDIM \u91c7\u6837",
      field: "score \u573a", play: "\u64ad\u653e", pause: "\u6682\u505c", probe: "\u62d6\u52a8\u9ed1\u8272\u63a2\u9488", snr: "\u4fe1\u566a\u6bd4" },
    ja: { fwd: "\u9806\u65b9\u5411\uff1a\u30c7\u30fc\u30bf\u306b\u30ce\u30a4\u30ba\u3092\u52a0\u3048\u308b",
      rev: "\u9006\u65b9\u5411\uff1a\u30ce\u30a4\u30ba\u304b\u3089 DDIM", field: "\u30b9\u30b3\u30a2\u5834", play: "\u518d\u751f",
      pause: "\u505c\u6b62", probe: "\u9ed2\u3044\u30d7\u30ed\u30fc\u30d6\u3092\u30c9\u30e9\u30c3\u30b0", snr: "SNR" }
  };

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // exact score of q(x_t) at integer step t (0-based, as in the post's code)
  function score(x, y, t) {
    var ab = AB[t], s = Math.sqrt(ab), v = ab * STD * STD + 1 - ab;
    var lw = new Array(8), m = -Infinity;
    for (var k = 0; k < 8; k++) {
      var dx = x - s * MU[k][0], dy = y - s * MU[k][1];
      lw[k] = -0.5 * (dx * dx + dy * dy) / v; if (lw[k] > m) m = lw[k];
    }
    var Z = 0, gx = 0, gy = 0;
    for (k = 0; k < 8; k++) {
      var w = Math.exp(lw[k] - m); Z += w;
      gx += w * -(x - s * MU[k][0]) / v; gy += w * -(y - s * MU[k][1]) / v;
    }
    return [gx / Z, gy / Z];
  }
  function ddimStep(p, t, tPrev) {
    var ab = AB[t], abp = tPrev < 0 ? 1 : AB[tPrev];
    var sc = score(p[0], p[1], t), c = Math.sqrt(1 - ab);
    var ex = -c * sc[0], ey = -c * sc[1];
    var x0x = (p[0] - c * ex) / Math.sqrt(ab), x0y = (p[1] - c * ey) / Math.sqrt(ab);
    return [Math.sqrt(abp) * x0x + Math.sqrt(1 - abp) * ex, Math.sqrt(abp) * x0y + Math.sqrt(1 - abp) * ey];
  }
  function schedule(from, steps) { // integer timesteps from `from` down to 0, like torch.linspace(...).long()
    var ts = [];
    for (var i = 0; i < steps; i++) ts.push(Math.round(from - from * i / (steps - 1)));
    return ts;
  }

  // precomputed samples
  var R = rng(7), X0 = [], EPS = [], LAB = [], Z = [];
  for (var i = 0; i < N; i++) {
    var kk = Math.floor(R() * 8); LAB.push(kk);
    X0.push([MU[kk][0] + STD * gauss(R), MU[kk][1] + STD * gauss(R)]);
    EPS.push([gauss(R), gauss(R)]);
    Z.push([gauss(R), gauss(R)]);
  }
  var REV_TS = schedule(T - 1, 100), REV = [Z.map(function (p) { return p.slice(); })];
  for (var s = 0; s < REV_TS.length; s++) {
    var tn = s + 1 < REV_TS.length ? REV_TS[s + 1] : -1;
    REV.push(REV[s].map(function (p) { return ddimStep(p, REV_TS[s], tn); }));
  }
  // nearest mode of each reverse sample, to colour it by where it ends
  var REV_LAB = REV[REV.length - 1].map(function (p) {
    var best = 0, bd = 1e9;
    for (var k = 0; k < 8; k++) { var d = Math.hypot(p[0] - MU[k][0], p[1] - MU[k][1]); if (d < bd) { bd = d; best = k; } }
    return best;
  });

  function init(el) {
    var L = TXT[el.dataset.lang] || TXT.en;
    el.innerHTML = ""; el.style.background = "#fff"; el.style.color = "#222";
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;margin:0 auto;touch-action:none;cursor:crosshair";
    el.appendChild(canvas);
    var ctrl = document.createElement("div");
    ctrl.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:8px 12px 10px;font:14px sans-serif";
    el.appendChild(ctrl);
    function radio(name, text, checked) {
      var lab = document.createElement("label"); lab.style.cssText = "display:flex;align-items:center;gap:4px;white-space:nowrap";
      var r = document.createElement("input"); r.type = "radio"; r.name = name; r.checked = checked;
      lab.appendChild(r); lab.appendChild(document.createTextNode(text)); ctrl.appendChild(lab); return r;
    }
    var gname = "wm-diff-" + Math.random().toString(36).slice(2);
    var rF = radio(gname, L.fwd, true), rR = radio(gname, L.rev, false);
    var cbl = document.createElement("label"); cbl.style.cssText = "display:flex;align-items:center;gap:4px";
    var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true;
    cbl.appendChild(cb); cbl.appendChild(document.createTextNode(L.field)); ctrl.appendChild(cbl);
    var row = document.createElement("div"); row.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;flex:1 1 100%";
    var btn = document.createElement("button"); btn.textContent = L.play;
    btn.style.cssText = "font:14px sans-serif;padding:2px 10px;border:1px solid #999;border-radius:4px;background:#f6f6f6;color:#222";
    var sl = document.createElement("input"); sl.type = "range"; sl.min = 0; sl.max = T - 1; sl.step = 1; sl.value = 200; sl.style.cssText = "flex:1 1 140px;min-width:80px";
    var info = document.createElement("span"); info.style.cssText = "white-space:nowrap;font-variant-numeric:tabular-nums";
    row.appendChild(btn); row.appendChild(sl); row.appendChild(info); ctrl.appendChild(row);

    var ctx = canvas.getContext("2d"), size = 300, probe = [1.0, -0.6], dragging = false, timer = null, lastW = -1;
    function toPx(x, y) { return [(x + LIM) / (2 * LIM) * size, (LIM - y) / (2 * LIM) * size]; }
    function fromPx(px, py) { return [px / size * 2 * LIM - LIM, LIM - py / size * 2 * LIM]; }

    function layout() {
      var w = el.clientWidth || 400; if (w === lastW) return false; lastW = w;
      size = Math.max(240, Math.min(w - 24, 460));
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
      canvas.style.width = size + "px"; canvas.style.height = size + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }
    function arrowTo(x0, y0, x1, y1, col, lw) {
      var a = Math.atan2(y1 - y0, x1 - x0), h = 5 + lw;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45));
      ctx.lineTo(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45)); ctx.fill();
    }

    function draw() {
      var t = parseInt(sl.value, 10), ab = AB[t];
      info.textContent = "t = " + t + ",  \u0101 = " + ab.toFixed(3) + ",  " + L.snr + " = " + (ab / (1 - ab)).toPrecision(2);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
      // grid
      ctx.strokeStyle = "#eee"; ctx.lineWidth = 1;
      for (var g = -3; g <= 3; g++) {
        var a = toPx(g, -LIM), b = toPx(g, LIM); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        a = toPx(-LIM, g); b = toPx(LIM, g); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.fillStyle = "#999"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("-3", 2, toPx(0, -3)[1] - 3); ctx.fillText("3", toPx(3, 0)[0] - 10, toPx(0, 0)[1] - 3);
      // score field (direction only)
      if (cb.checked) {
        for (var gx = -3; gx <= 3.01; gx += 0.5) for (var gy = -3; gy <= 3.01; gy += 0.5) {
          var sc = score(gx, gy, t), n = Math.hypot(sc[0], sc[1]) + 1e-12;
          var p0 = toPx(gx, gy), p1 = toPx(gx + 0.32 * sc[0] / n, gy + 0.32 * sc[1] / n);
          arrowTo(p0[0], p0[1], p1[0], p1[1], "rgba(148,103,189,0.55)", 1.2);
        }
      }
      // particles
      var pts, labs;
      if (rF.checked) {
        var sa = Math.sqrt(ab), sb = Math.sqrt(1 - ab);
        pts = X0.map(function (p, i) { return [sa * p[0] + sb * EPS[i][0], sa * p[1] + sb * EPS[i][1]]; });
        labs = LAB;
      } else {
        var idx = 0; while (idx < REV_TS.length && REV_TS[idx] > t) idx++;
        pts = REV[idx]; labs = REV_LAB;
      }
      for (var i = 0; i < pts.length; i++) {
        var q = toPx(pts[i][0], pts[i][1]);
        ctx.fillStyle = COLORS[labs[i]]; ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(q[0], q[1], 2.2, 0, 2 * Math.PI); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // modes
      ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5;
      MU.forEach(function (m) { var q = toPx(m[0], m[1]); ctx.beginPath(); ctx.moveTo(q[0] - 6, q[1]); ctx.lineTo(q[0] + 6, q[1]); ctx.moveTo(q[0], q[1] - 6); ctx.lineTo(q[0], q[1] + 6); ctx.stroke(); });
      // probe: ODE path from (probe, t) to t = 0 and the vector -E[eps | x_t] = sqrt(1 - ab) * score
      var ts = schedule(t, Math.max(2, Math.min(60, t + 1))), p = probe.slice();
      ctx.strokeStyle = "#ff7f0e"; ctx.lineWidth = 2.4; ctx.beginPath();
      var q0 = toPx(p[0], p[1]); ctx.moveTo(q0[0], q0[1]);
      for (var s2 = 0; s2 < ts.length; s2++) {
        p = ddimStep(p, ts[s2], s2 + 1 < ts.length ? ts[s2 + 1] : -1);
        var qq = toPx(p[0], p[1]); ctx.lineTo(qq[0], qq[1]);
      }
      ctx.stroke();
      var qe = toPx(p[0], p[1]); ctx.fillStyle = "#ff7f0e"; ctx.fillRect(qe[0] - 4, qe[1] - 4, 8, 8);
      var sp = score(probe[0], probe[1], t), c = Math.sqrt(1 - ab);
      var pa = toPx(probe[0], probe[1]), pb = toPx(probe[0] + 0.5 * c * sp[0], probe[1] + 0.5 * c * sp[1]);
      arrowTo(pa[0], pa[1], pb[0], pb[1], "#222", 2.4);
      ctx.fillStyle = "#222"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pa[0], pa[1], 7, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#555"; ctx.font = "13px sans-serif"; ctx.textAlign = "left";
      ctx.fillText(L.probe, 8, 18);
    }

    function pointer(ev) {
      var r = canvas.getBoundingClientRect();
      var p = fromPx(ev.clientX - r.left, ev.clientY - r.top);
      probe = [Math.max(-LIM, Math.min(LIM, p[0])), Math.max(-LIM, Math.min(LIM, p[1]))];
      draw();
    }
    canvas.addEventListener("pointerdown", function (ev) { dragging = true; canvas.setPointerCapture(ev.pointerId); pointer(ev); ev.preventDefault(); });
    canvas.addEventListener("pointermove", function (ev) { if (dragging) pointer(ev); });
    canvas.addEventListener("pointerup", function () { dragging = false; });
    canvas.addEventListener("pointercancel", function () { dragging = false; });
    sl.addEventListener("input", draw); cb.addEventListener("change", draw);
    rF.addEventListener("change", draw); rR.addEventListener("change", draw);
    btn.addEventListener("click", function () {
      if (timer) { clearInterval(timer); timer = null; btn.textContent = L.play; return; }
      btn.textContent = L.pause;
      var dir = rF.checked ? 1 : -1;
      if (dir > 0 && +sl.value >= T - 1) sl.value = 0;
      if (dir < 0 && +sl.value <= 0) sl.value = T - 1;
      timer = setInterval(function () {
        var v = +sl.value + dir * 10;
        if (v >= T - 1 || v <= 0) { v = Math.max(0, Math.min(T - 1, v)); clearInterval(timer); timer = null; btn.textContent = L.play; }
        sl.value = v; draw();
      }, 40);
    });
    function resize() { if (layout()) draw(); }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el); else window.addEventListener("resize", resize);
    resize();
  }

  function boot() {
    var els = document.querySelectorAll('[data-widget="world-models-diffusion-explorer"]');
    for (var i = 0; i < els.length; i++) init(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
