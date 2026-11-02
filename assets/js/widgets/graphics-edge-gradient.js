/* Edge gradient explorer (graphics post 12).
   An 8 x 8 pixel grid in pixel units; pixel (i, j) covers [i, i+1] x [j, j+1]. The scene is a
   half-plane n . x <= t (foreground value 1) over a background of value 0. Each pixel value is the
   area average of the scene over the pixel, either exactly (polygon clipping) or estimated with
   N stratified samples per pixel (1 sample = pixel centre, like a classic rasterizer).
   We differentiate every pixel with respect to theta, the offset of the edge along its normal:
     finite difference  (I(t + h) - I(t)) / h  of the chosen renderer, and
     analytic boundary term  dI/dtheta = (f_in - f_out) (v . n) * length(edge inside pixel) = length.
   Drag the purple dot to move the edge and the ring to rotate it. */
(function () {
  "use strict";
  var TXT = {
    en: { help: "Drag the purple dot to move the edge, the ring to rotate it.", spp: "Samples / pixel", exact: "exact area",
          h: "FD step h", cov: "coverage I", fd: "finite difference", an: "boundary term (edge length)",
          sumfd: "\u03a3 FD", suman: "\u03a3 boundary", nz: "pixels with FD \u2260 0" },
    zh: { help: "\u62d6\u52a8\u7d2b\u8272\u5706\u70b9\u5e73\u79fb\u8fb9\u7f18\uff0c\u62d6\u52a8\u5706\u73af\u65cb\u8f6c\u8fb9\u7f18\u3002", spp: "\u6bcf\u50cf\u7d20\u6837\u672c\u6570", exact: "\u7cbe\u786e\u9762\u79ef",
          h: "\u5dee\u5206\u6b65\u957f h", cov: "\u8986\u76d6\u7387 I", fd: "\u6709\u9650\u5dee\u5206", an: "\u8fb9\u754c\u9879\uff08\u8fb9\u957f\uff09",
          sumfd: "\u03a3 \u5dee\u5206", suman: "\u03a3 \u8fb9\u754c\u9879", nz: "\u5dee\u5206\u975e\u96f6\u7684\u50cf\u7d20" },
    ja: { help: "\u7d2b\u306e\u70b9\u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u30a8\u30c3\u30b8\u3092\u79fb\u52d5\u3001\u30ea\u30f3\u30b0\u3067\u56de\u8ee2\u3057\u307e\u3059\u3002", spp: "\u753b\u7d20\u3042\u305f\u308a\u30b5\u30f3\u30d7\u30eb\u6570", exact: "\u53b3\u5bc6\u306a\u9762\u7a4d",
          h: "\u5dee\u5206\u306e\u523b\u307f h", cov: "\u88ab\u8986\u7387 I", fd: "\u6709\u9650\u5dee\u5206", an: "\u5883\u754c\u9805\uff08\u30a8\u30c3\u30b8\u9577\uff09",
          sumfd: "\u03a3 \u5dee\u5206", suman: "\u03a3 \u5883\u754c\u9805", nz: "\u5dee\u5206\u304c 0 \u3067\u306a\u3044\u753b\u7d20" }
  };
  var G = 8, SPP = [1, 4, 16, 64, 0], VMAX = 1.5;   // 0 = exact area

  function hash(a, b, c) {
    var h = Math.imul(a + 1, 73856093) ^ Math.imul(b + 7, 19349663) ^ Math.imul(c + 13, 83492791);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  // exact area of pixel [x0, x0+1] x [y0, y0+1] with nx*x + ny*y <= t (Sutherland-Hodgman + shoelace)
  function clipArea(nx, ny, t, x0, y0) {
    var P = [[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1]], R = [], k;
    for (k = 0; k < 4; k++) {
      var a = P[k], b = P[(k + 1) % 4], da = nx * a[0] + ny * a[1] - t, db = nx * b[0] + ny * b[1] - t;
      if (da <= 0) R.push(a);
      if (da * db < 0) { var s = da / (da - db); R.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]); }
    }
    var A = 0;
    for (k = 0; k < R.length; k++) { var p = R[k], q = R[(k + 1) % R.length]; A += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(A) / 2;
  }

  // length of the line nx*x + ny*y = t inside the pixel (slab clipping of p = t n + s d, |d| = 1)
  function edgeLen(nx, ny, t, x0, y0) {
    var lo = -1e9, hi = 1e9;
    function slab(p, d, a, b) {
      if (Math.abs(d) < 1e-12) { if (p < a || p > b) { lo = 1; hi = 0; } return; }
      var s1 = (a - p) / d, s2 = (b - p) / d;
      if (s1 > s2) { var tt = s1; s1 = s2; s2 = tt; }
      lo = Math.max(lo, s1); hi = Math.min(hi, s2);
    }
    slab(t * nx, -ny, x0, x0 + 1); slab(t * ny, nx, y0, y0 + 1);
    return Math.max(0, hi - lo);
  }

  function samplePos(i, j, k, n) {          // stratified, jittered (n = 1: pixel centre)
    var a = k % n, b = Math.floor(k / n);
    if (n === 1) return [i + 0.5, j + 0.5];
    return [i + (a + hash(i, j, 2 * k)) / n, j + (b + hash(i, j, 2 * k + 1)) / n];
  }

  function cover(nx, ny, t, i, j, spp) {
    if (!spp) return clipArea(nx, ny, t, i, j);
    var n = Math.round(Math.sqrt(spp)), c = 0;
    for (var k = 0; k < spp; k++) { var p = samplePos(i, j, k, n); if (nx * p[0] + ny * p[1] <= t) c++; }
    return c / spp;
  }

  function fmt(v) {
    var a = Math.abs(v);
    if (a < 5e-4) return "0";
    if (a >= 100) return v.toExponential(0).replace("e+", "e");
    return a >= 10 ? v.toFixed(0) : v.toFixed(2);
  }

  function setup(el) {
    var T = TXT[el.dataset.lang] || TXT.en;
    var st = { px: 3.6, py: 4.3, ang: 0.45, sppIdx: 0, lh: -1 };   // h = 10^lh
    el.innerHTML = "";
    el.style.background = "#fff"; el.style.color = "#222";
    el.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif"; el.style.fontSize = "14px";
    var ui = document.createElement("div");
    ui.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;padding:8px 10px 2px";
    el.appendChild(ui);
    function slider(label, min, max, step, get, set, show) {
      var g = document.createElement("label"); g.style.cssText = "display:flex;align-items:center;gap:6px";
      var s = document.createElement("span"); s.textContent = label; s.style.color = "#555";
      var r = document.createElement("input"); r.type = "range"; r.min = min; r.max = max; r.step = step; r.value = get();
      r.style.cssText = "width:120px;accent-color:#9467bd";
      var o = document.createElement("span"); o.style.cssText = "min-width:5.5em;font-variant-numeric:tabular-nums";
      o.textContent = show();
      r.addEventListener("input", function () { set(parseFloat(r.value)); o.textContent = show(); draw(); });
      g.appendChild(s); g.appendChild(r); g.appendChild(o); ui.appendChild(g);
    }
    slider(T.spp, 0, 4, 1, function () { return st.sppIdx; }, function (v) { st.sppIdx = v; },
      function () { return SPP[st.sppIdx] ? String(SPP[st.sppIdx]) : T.exact; });
    slider(T.h, -3, 0, 0.05, function () { return st.lh; }, function (v) { st.lh = v; },
      function () { var h = Math.pow(10, st.lh); return h < 0.01 ? h.toFixed(4) : h < 0.1 ? h.toFixed(3) : h.toFixed(2); });
    var help = document.createElement("div"); help.textContent = T.help;
    help.style.cssText = "padding:2px 10px 4px;color:#666;font-size:13px"; el.appendChild(help);

    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;width:100%;touch-action:none";
    el.appendChild(cv);
    var ctx = cv.getContext("2d"), W = 0, H = 0, L = null;

    function layout() {
      W = el.clientWidth;
      if (W >= 620) {
        var s = Math.min((W - 60) / 3, 300);
        L = { A: [16, 24, s], B: [16 + s + 14, 24, s], C: [16 + 2 * (s + 14), 24, s] };
        H = Math.round(24 + s + 64);
      } else {
        var s1 = Math.min(W - 24, 340), s2 = (W - 36) / 2;
        L = { A: [(W - s1) / 2, 22, s1], B: [12, 22 + s1 + 26, s2], C: [24 + s2, 22 + s1 + 26, s2] };
        H = Math.round(22 + s1 + 26 + s2 + 62);
      }
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function lineDir() { return [-Math.sin(st.ang), Math.cos(st.ang)]; }
    function ringPos() { var d = lineDir(); return [st.px + 2.2 * d[0], st.py + 2.2 * d[1]]; }

    function covColor(v) {
      var r = Math.round(255 + (148 - 255) * v), g = Math.round(255 + (103 - 255) * v), b = Math.round(255 + (189 - 255) * v);
      return "rgb(" + r + "," + g + "," + b + ")";
    }
    function gradColor(v) {
      var t = Math.max(0, Math.min(1, v / VMAX));
      if (v > VMAX) return "#a33f00";
      return "rgb(" + Math.round(255 + (255 - 255) * t) + "," + Math.round(255 + (127 - 255) * t) + "," + Math.round(255 + (14 - 255) * t) + ")";
    }

    function panel(R, title, vals, colorFn, numbers, edge) {
      var x0 = R[0], y0 = R[1], s = R[2], c = s / G, i, j;
      ctx.fillStyle = "#333"; ctx.font = (s < 200 ? "bold 11px" : "bold 13px") + " sans-serif";
      ctx.fillText(title, x0, y0 - 7, s);                                    // maxWidth = panel width
      for (j = 0; j < G; j++) for (i = 0; i < G; i++) {
        ctx.fillStyle = colorFn(vals[j * G + i]); ctx.fillRect(x0 + i * c, y0 + j * c, c + 0.5, c + 0.5);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1;
      for (i = 0; i <= G; i++) {
        ctx.beginPath(); ctx.moveTo(x0 + i * c, y0); ctx.lineTo(x0 + i * c, y0 + s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x0, y0 + i * c); ctx.lineTo(x0 + s, y0 + i * c); ctx.stroke();
      }
      if (numbers && c >= 30) {
        ctx.font = (c >= 38 ? 11 : 10) + "px sans-serif"; ctx.textAlign = "center";
        for (j = 0; j < G; j++) for (i = 0; i < G; i++) {
          var v = vals[j * G + i]; if (Math.abs(v) < 5e-4) continue;
          ctx.fillStyle = v > 0.9 * VMAX ? "#fff" : "#222";
          ctx.fillText(fmt(v), x0 + (i + 0.5) * c, y0 + (j + 0.5) * c + 4);
        }
        ctx.textAlign = "left";
      }
      if (edge) {
        var d = lineDir();
        ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, s, s); ctx.clip();
        ctx.strokeStyle = "#9467bd"; ctx.lineWidth = edge === 2 ? 2.6 : 1.4;
        ctx.beginPath();
        ctx.moveTo(x0 + (st.px - 20 * d[0]) * c, y0 + (st.py - 20 * d[1]) * c);
        ctx.lineTo(x0 + (st.px + 20 * d[0]) * c, y0 + (st.py + 20 * d[1]) * c); ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = "#555"; ctx.lineWidth = 1.2; ctx.strokeRect(x0, y0, s, s);
    }

    function draw() {
      if (!L) return;
      var nx = Math.cos(st.ang), ny = Math.sin(st.ang), t = nx * st.px + ny * st.py;
      var spp = SPP[st.sppIdx], h = Math.pow(10, st.lh), cov = [], fd = [], an = [], i, j, sfd = 0, san = 0, nz = 0;
      for (j = 0; j < G; j++) for (i = 0; i < G; i++) {
        var c0 = cover(nx, ny, t, i, j, spp), c1 = cover(nx, ny, t + h, i, j, spp), e = edgeLen(nx, ny, t, i, j);
        cov.push(c0); fd.push((c1 - c0) / h); an.push(e);
        sfd += (c1 - c0) / h; san += e; if (c1 !== c0) nz++;
      }
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      panel(L.A, T.cov, cov, covColor, false, 2);
      panel(L.B, T.fd + " (h)", fd, gradColor, true, 1);
      panel(L.C, T.an, an, gradColor, true, 1);
      // sample points and handles in panel A
      var A = L.A, cs = A[2] / G;
      if (spp && spp <= 16) {
        var n = Math.round(Math.sqrt(spp));
        for (j = 0; j < G; j++) for (i = 0; i < G; i++) for (var k = 0; k < spp; k++) {
          var p = samplePos(i, j, k, n), inside = nx * p[0] + ny * p[1] <= t;
          ctx.fillStyle = inside ? "#3b1f66" : "#9a9a9a";
          ctx.beginPath(); ctx.arc(A[0] + p[0] * cs, A[1] + p[1] * cs, spp === 1 ? 3 : 2, 0, 2 * Math.PI); ctx.fill();
        }
      }
      var hp = [A[0] + st.px * cs, A[1] + st.py * cs], rp = ringPos(), rr = [A[0] + rp[0] * cs, A[1] + rp[1] * cs];
      ctx.fillStyle = "#9467bd"; ctx.beginPath(); ctx.arc(hp[0], hp[1], 8, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = "#9467bd"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(rr[0], rr[1], 9, 0, 2 * Math.PI); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hp[0], hp[1]);
      ctx.lineTo(hp[0] + nx * 0.9 * cs, hp[1] + ny * 0.9 * cs); ctx.stroke();       // normal arrow (outward)
      ctx.font = "italic 14px serif"; ctx.fillStyle = "#9467bd";
      ctx.fillText("n", hp[0] + nx * 1.05 * cs - 3, hp[1] + ny * 1.05 * cs + 4);
      // readouts
      var yb = Math.max(L.B[1] + L.B[2], L.A[1] + L.A[2]) + 22;
      ctx.font = "13px sans-serif"; ctx.fillStyle = "#a34f00";
      ctx.fillText(T.sumfd + " = " + fmt(sfd), 14, yb);
      ctx.fillStyle = "#333"; ctx.fillText(T.suman + " = " + san.toFixed(3), 14 + Math.min(170, W * 0.42), yb);
      ctx.fillStyle = "#666"; ctx.fillText(T.nz + ": " + nz + " / " + G * G, 14, yb + 20);
    }

    // pointer interaction on panel A
    var drag = null;
    function toGrid(e) {
      var b = cv.getBoundingClientRect(), A = L.A, cs = A[2] / G;
      return [(e.clientX - b.left - A[0]) / cs, (e.clientY - b.top - A[1]) / cs];
    }
    cv.addEventListener("pointerdown", function (e) {
      var g = toGrid(e), rp = ringPos(), cs = L.A[2] / G;
      if (g[0] < -0.5 || g[1] < -0.5 || g[0] > G + 0.5 || g[1] > G + 0.5) return;
      var dr = Math.hypot(g[0] - rp[0], g[1] - rp[1]) * cs;
      drag = dr < 22 ? { mode: "rot" } : { mode: "move", ox: st.px - g[0], oy: st.py - g[1] };
      cv.setPointerCapture(e.pointerId); e.preventDefault();
    });
    cv.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var g = toGrid(e);
      if (drag.mode === "rot") {
        var dx = g[0] - st.px, dy = g[1] - st.py;
        if (Math.hypot(dx, dy) > 0.2) st.ang = Math.atan2(-dx, dy);     // line direction (-sin, cos) points to the ring
      } else {
        st.px = Math.max(0, Math.min(G, g[0] + drag.ox)); st.py = Math.max(0, Math.min(G, g[1] + drag.oy));
      }
      draw();
    });
    function end() { drag = null; }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);

    layout(); draw();
    var lastW = el.clientWidth;
    window.addEventListener("resize", function () { if (el.clientWidth !== lastW) { lastW = el.clientWidth; layout(); draw(); } });
  }

  function init() { document.querySelectorAll('[data-widget="graphics-edge-gradient"]').forEach(setup); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
