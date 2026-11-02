/* Delta tracking vs ratio tracking (graphics post 10). Plain JS + Canvas 2D, no dependencies.
   The medium is the post's 1D extinction sigma_t(t) on [0, 10]. Top: tentative collisions of one
   delta-tracking walk drawn at height xi * majorant, so a point under the density curve is a real
   collision (the walk stops) and a point above it is a null collision. Bottom: the exact
   transmittance T(t) and the running product of one ratio-tracking walk. Statistics accumulate
   over many walks in the background.
   Embedded with _includes/widget.liquid, name "graphics-volume-tracking". */
(function () {
  "use strict";
  var TXT = {
    en: { maj: "majorant \u03c3\u0304 / max \u03c3t", ray: "new ray", auto: "auto", delta: "delta tracking",
          ratio: "ratio tracking", real: "real", nul: "null", n: "estimates", mean: "mean", exact: "exact",
          look: "lookups/ray", tap: "tap or click the plot for a new ray" },
    zh: { maj: "\u4e0a\u754c \u03c3\u0304 / max \u03c3t", ray: "\u65b0\u5149\u7ebf", auto: "\u81ea\u52a8",
          delta: "delta tracking", ratio: "ratio tracking", real: "\u771f\u5b9e\u78b0\u649e", nul: "\u7a7a\u78b0\u649e",
          n: "\u4f30\u8ba1\u6b21\u6570", mean: "\u5747\u503c", exact: "\u7cbe\u786e\u503c",
          look: "\u6bcf\u6761\u5149\u7ebf\u67e5\u8be2\u6b21\u6570", tap: "\u70b9\u51fb\u56fe\u4e2d\u751f\u6210\u65b0\u5149\u7ebf" },
    ja: { maj: "\u4e0a\u754c \u03c3\u0304 / max \u03c3t", ray: "\u65b0\u3057\u3044\u30ec\u30a4", auto: "\u81ea\u52d5",
          delta: "delta tracking", ratio: "ratio tracking", real: "\u672c\u7269\u306e\u885d\u7a81", nul: "\u30cc\u30eb\u885d\u7a81",
          n: "\u63a8\u5b9a\u56de\u6570", mean: "\u5e73\u5747", exact: "\u53b3\u5bc6\u5024",
          look: "\u30ec\u30a4\u3042\u305f\u308a\u306e\u53c2\u7167\u56de\u6570", tap: "\u56f3\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u65b0\u3057\u3044\u30ec\u30a4" }
  };
  var COL = { dens: "#9467bd", fill: "rgba(148,103,189,0.18)", maj: "#222", real: "#d62728", nul: "#9a9a9a",
              exact: "#222", ratio: "#1f77b4", grid: "#e2e2e2" };
  var D = 10, SMAX = 1.7003, NT = 400;

  function sigma(t) {
    var a = (t - 2.0) / 0.45, b = (t - 5.2) / 0.8, c = (t - 7.4) / 0.25;
    return 0.1 + 1.0 * Math.exp(-a * a) + 0.6 * Math.exp(-b * b) + 1.6 * Math.exp(-c * c);
  }
  // exact optical depth table (trapezoid rule)
  var TAU = [0], TT = [0];
  (function () {
    var n = 4000, h = D / n, acc = 0, prev = sigma(0);
    for (var i = 1; i <= n; i++) { var s = sigma(i * h); acc += 0.5 * (prev + s) * h; prev = s; if (i % 10 === 0) { TAU.push(acc); TT.push(i * h); } }
  })();
  var T_EXACT = Math.exp(-TAU[TAU.length - 1]);

  function freeFlight(sb) { return -Math.log(1 - Math.random()) / sb; }
  function deltaWalk(sb, record) {
    var t = 0, pts = [], n = 0;
    for (;;) {
      t += freeFlight(sb);
      if (t >= D) return { est: 1, pts: pts, n: n };
      var u = Math.random(), s = sigma(t); n++;
      if (record) pts.push([t, u * sb, u * sb < s]);
      if (u * sb < s) return { est: 0, pts: pts, n: n };
    }
  }
  function ratioWalk(sb, record) {
    var t = 0, T = 1, pts = [[0, 1]], n = 0;
    for (;;) {
      t += freeFlight(sb);
      if (t >= D) { if (record) pts.push([D, T]); return { est: T, pts: pts, n: n }; }
      T *= 1 - sigma(t) / sb; n++;
      if (record) pts.push([t, T]);
    }
  }

  function init(el) {
    var L = TXT[el.dataset.lang] || TXT.en;
    var st = { k: 1.5, auto: true };
    var stats, shownDelta = null, shownRatio = null, timer = 0;
    el.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.style.cssText = "background:#fff;color:#222;padding:8px 10px 10px;font-family:inherit";
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;touch-action:manipulation;cursor:pointer";
    var info = document.createElement("div");
    info.style.cssText = "font-size:13px;margin:4px 0 6px;color:#333;line-height:1.45;min-height:4.4em;font-variant-numeric:tabular-nums";
    var controls = document.createElement("div");
    controls.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;font-size:14px";
    wrap.appendChild(canvas); wrap.appendChild(info); wrap.appendChild(controls);
    el.appendChild(wrap);
    var ctx = canvas.getContext("2d");

    var row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:8px;flex:1 1 260px;min-width:0";
    var name = document.createElement("span"); name.textContent = L.maj; name.style.whiteSpace = "nowrap";
    var inp = document.createElement("input");
    inp.type = "range"; inp.min = 1; inp.max = 8; inp.step = 0.05; inp.value = st.k; inp.style.cssText = "flex:1;min-width:60px";
    var val = document.createElement("span"); val.style.cssText = "width:3em;text-align:right";
    row.appendChild(name); row.appendChild(inp); row.appendChild(val);
    var btn = document.createElement("button"); btn.type = "button"; btn.textContent = L.ray; btn.style.cssText = "font-size:14px;padding:2px 10px";
    var autoLab = document.createElement("label");
    var autoBox = document.createElement("input"); autoBox.type = "checkbox"; autoBox.checked = true;
    autoLab.appendChild(autoBox); autoLab.appendChild(document.createTextNode(" " + L.auto));
    controls.appendChild(row); controls.appendChild(btn); controls.appendChild(autoLab);

    function resetStats() { stats = { n: 0, d: 0, d2: 0, r: 0, r2: 0, ld: 0, lr: 0 }; }
    function sb() { return st.k * SMAX; }
    function newRay() { shownDelta = deltaWalk(sb(), true); shownRatio = ratioWalk(sb(), true); draw(); }
    function accumulate(m) {
      for (var i = 0; i < m; i++) {
        var a = deltaWalk(sb(), false), b = ratioWalk(sb(), false);
        stats.n++; stats.d += a.est; stats.d2 += a.est * a.est; stats.r += b.est; stats.r2 += b.est * b.est;
        stats.ld += a.n; stats.lr += b.n;
      }
    }
    inp.addEventListener("input", function () { st.k = +inp.value; val.textContent = st.k.toFixed(2); resetStats(); newRay(); });
    btn.addEventListener("click", newRay);
    autoBox.addEventListener("change", function () { st.auto = autoBox.checked; if (st.auto) loop(); });
    canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); newRay(); });
    val.textContent = st.k.toFixed(2);

    var W = 0, H = 0;
    function resize() {
      var w = wrap.clientWidth - 20;
      if (w <= 0) return;
      var h = Math.round(Math.min(Math.max(w * 0.62, 280), 380));
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w; H = h; draw();
    }

    function draw() {
      if (!W) return;
      var left = 34, right = W - 10, i;
      var gap = 26, top1 = 22, h1 = Math.round((H - top1 - gap - 22) * 0.55), top2 = top1 + h1 + gap, h2 = H - top2 - 22;
      function X(t) { return left + (right - left) * t / D; }
      var ymax1 = Math.max(sb(), SMAX) * 1.05;
      function Y1(s) { return top1 + h1 - h1 * s / ymax1; }
      function Y2(T) { return top2 + h2 - h2 * T; }
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      ctx.font = "12px sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = "#444";
      ctx.fillText(L.delta + ":  \u25cf " + L.real + "   \u25cb " + L.nul, left, top1 - 8);
      ctx.fillText(L.ratio, left, top2 - 8);
      ctx.textAlign = "right"; ctx.fillStyle = "#777"; ctx.fillText(L.tap, right, top1 - 8);
      // panel 1: density, majorant, tentative collisions
      ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
      ctx.strokeRect(left, top1, right - left, h1); ctx.strokeRect(left, top2, right - left, h2);
      ctx.beginPath(); ctx.moveTo(X(0), Y1(0));
      for (i = 0; i <= NT; i++) { var t = D * i / NT; ctx.lineTo(X(t), Y1(sigma(t))); }
      ctx.lineTo(X(D), Y1(0)); ctx.closePath(); ctx.fillStyle = COL.fill; ctx.fill();
      ctx.beginPath();
      for (i = 0; i <= NT; i++) { var t2 = D * i / NT; if (i === 0) ctx.moveTo(X(t2), Y1(sigma(t2))); else ctx.lineTo(X(t2), Y1(sigma(t2))); }
      ctx.strokeStyle = COL.dens; ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([6, 4]); ctx.strokeStyle = COL.maj; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(X(0), Y1(sb())); ctx.lineTo(X(D), Y1(sb())); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COL.maj; ctx.textAlign = "right"; ctx.fillText("\u03c3\u0304", left - 4, Y1(sb()) + 4);
      ctx.fillStyle = COL.dens; ctx.fillText("\u03c3t", left - 4, Y1(SMAX * 0.5) + 4);
      if (shownDelta) {
        var pts = shownDelta.pts, endT = pts.length && pts[pts.length - 1][2] ? pts[pts.length - 1][0] : D;
        ctx.strokeStyle = "#555"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(X(0), top1 + h1); ctx.lineTo(X(endT), top1 + h1); ctx.stroke();
        for (i = 0; i < pts.length; i++) {
          var p = pts[i];
          ctx.beginPath(); ctx.arc(X(p[0]), Y1(p[1]), p[2] ? 5 : 3.5, 0, 2 * Math.PI);
          if (p[2]) { ctx.fillStyle = COL.real; ctx.fill(); } else { ctx.strokeStyle = COL.nul; ctx.lineWidth = 1.5; ctx.stroke(); }
        }
        ctx.fillStyle = shownDelta.est ? COL.ratio : COL.real; ctx.textAlign = "right"; ctx.font = "bold 13px sans-serif";
        ctx.fillText("\u27e8T\u27e9 = " + shownDelta.est, right - 4, top1 + 16);
        ctx.font = "12px sans-serif";
      }
      // panel 2: exact T(t) and running ratio-tracking product
      ctx.beginPath();
      for (i = 0; i < TT.length; i++) { var x = X(TT[i]), y = Y2(Math.exp(-TAU[i])); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = COL.exact; ctx.lineWidth = 2; ctx.stroke();
      if (shownRatio) {
        var q = shownRatio.pts;
        ctx.beginPath(); ctx.moveTo(X(q[0][0]), Y2(q[0][1]));
        for (i = 1; i < q.length; i++) { ctx.lineTo(X(q[i][0]), Y2(q[i - 1][1])); ctx.lineTo(X(q[i][0]), Y2(q[i][1])); }
        ctx.strokeStyle = COL.ratio; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = COL.ratio;
        for (i = 1; i < q.length - 1; i++) { ctx.beginPath(); ctx.arc(X(q[i][0]), Y2(q[i][1]), 2.5, 0, 2 * Math.PI); ctx.fill(); }
        ctx.textAlign = "right"; ctx.font = "bold 13px sans-serif";
        ctx.fillText("\u27e8T\u27e9 = " + shownRatio.est.toFixed(4), right - 4, top2 + 16);
        ctx.font = "12px sans-serif";
      }
      ctx.fillStyle = COL.exact; ctx.textAlign = "right"; ctx.fillText("T(t)", right - 4, top2 + 32);
      ctx.fillStyle = "#444"; ctx.textAlign = "right";
      ctx.fillText("1", left - 4, Y2(1) + 4); ctx.fillText("0", left - 4, Y2(0) + 4);
      ctx.textAlign = "center";
      for (i = 0; i <= 10; i += 2) ctx.fillText(String(i), X(i), H - 6);
      // statistics
      if (stats.n > 1) {
        var n = stats.n, md = stats.d / n, mr = stats.r / n;
        var sd = Math.sqrt(Math.max(stats.d2 / n - md * md, 0)), sr = Math.sqrt(Math.max(stats.r2 / n - mr * mr, 0));
        info.innerHTML = L.n + " " + n + " \u00b7 " + L.exact + " T = " + T_EXACT.toFixed(4) + "<br>" +
          "<span style='color:" + COL.real + "'>" + L.delta + "</span>: " + L.mean + " " + md.toFixed(4) + " \u00b1 " + (sd / Math.sqrt(n)).toFixed(4) +
          ", std " + sd.toFixed(3) + ", " + L.look + " " + (stats.ld / n).toFixed(1) + "<br>" +
          "<span style='color:" + COL.ratio + "'>" + L.ratio + "</span>: " + L.mean + " " + mr.toFixed(4) + " \u00b1 " + (sr / Math.sqrt(n)).toFixed(4) +
          ", std " + sr.toFixed(3) + ", " + L.look + " " + (stats.lr / n).toFixed(1);
      }
    }

    function loop() {
      if (timer) return;
      function step() {
        timer = 0;
        if (!st.auto) return;
        if (stats.n < 200000) accumulate(300);
        newRay();
        timer = setTimeout(step, 450);
      }
      step();
    }

    resetStats();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);
    else window.addEventListener("resize", resize);
    resize();
    newRay();
    loop();
  }

  function start() {
    var els = document.querySelectorAll('[data-widget="graphics-volume-tracking"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; init(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
