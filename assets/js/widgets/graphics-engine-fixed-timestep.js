/* Fixed versus variable timestep (graphics-engine post 01).
   A frictionless spring x'' = -w^2 x is simulated three ways while the "game" presents frames
   at jittered times: (1) one semi-implicit Euler step with dt = frame time, (2) a fixed step
   with an accumulator, drawing the newest state, (3) the same fixed step drawing the state
   interpolated between the last two steps. Sliders set the frame-time jitter and the physics
   rate; a button injects one long frame. Bottom: energy E/E0 of the variable and fixed runs. */
(function () {
  "use strict";
  var TXT = {
    en: { jit: "frame-time jitter", rate: "physics rate", hitch: "inject a 200 ms hitch",
          v: "variable dt = frame time", raw: "fixed dt, no interpolation", lerp: "fixed dt + interpolation",
          ghost: "dashed circle: exact solution", energy: "energy E/E0 (should stay 1)",
          hint: "drag a ball to restart", steps: "steps" },
    zh: { jit: "\u5e27\u65f6\u95f4\u6296\u52a8", rate: "\u7269\u7406\u9891\u7387", hitch: "\u6ce8\u5165 200 ms \u5361\u987f",
          v: "\u53ef\u53d8 dt = \u5e27\u65f6\u95f4", raw: "\u56fa\u5b9a dt\uff0c\u65e0\u63d2\u503c", lerp: "\u56fa\u5b9a dt + \u63d2\u503c",
          ghost: "\u865a\u7ebf\u5706\uff1a\u7cbe\u786e\u89e3", energy: "\u80fd\u91cf E/E0\uff08\u5e94\u4fdd\u6301\u4e3a 1\uff09",
          hint: "\u62d6\u52a8\u5c0f\u7403\u91cd\u65b0\u5f00\u59cb", steps: "\u6b65\u6570" },
    ja: { jit: "\u30d5\u30ec\u30fc\u30e0\u6642\u9593\u306e\u3086\u3089\u304e", rate: "\u7269\u7406\u30ec\u30fc\u30c8",
          hitch: "200 ms \u306e\u30d2\u30c3\u30c1\u3092\u5165\u308c\u308b",
          v: "\u53ef\u5909 dt = \u30d5\u30ec\u30fc\u30e0\u6642\u9593", raw: "\u56fa\u5b9a dt\u30fb\u88dc\u9593\u306a\u3057",
          lerp: "\u56fa\u5b9a dt + \u88dc\u9593", ghost: "\u7834\u7dda\u306e\u5186\uff1a\u53b3\u5bc6\u89e3",
          energy: "\u30a8\u30cd\u30eb\u30ae\u30fc E/E0\uff081 \u306e\u307e\u307e\u304c\u6b63\u3057\u3044\uff09",
          hint: "\u30dc\u30fc\u30eb\u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u518d\u30b9\u30bf\u30fc\u30c8", steps: "\u30b9\u30c6\u30c3\u30d7" }
  };
  // Non-ASCII text is written as \u escapes so that this file stays ASCII-only.
  var COL = { v: "#d62728", raw: "#ff7f0e", lerp: "#1f77b4", text: "#222", grid: "#e6e6e6", spring: "#999" };

  function setup(el) {
    var lang = TXT[el.dataset.lang] ? el.dataset.lang : "en";
    var T = {};
    for (var key in TXT[lang]) T[key] = (TXT[lang][key]);
    el.style.background = "#fcfcfd";

    // ---- controls (native inputs: keyboard and touch friendly)
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;padding:6px 8px;font:13px sans-serif;color:#222";
    el.appendChild(bar);
    function slider(label, min, max, step, val, unit) {
      var lab = document.createElement("label");
      lab.style.cssText = "display:flex;align-items:center;gap:6px;white-space:nowrap";
      var span = document.createElement("span");
      var inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
      inp.style.width = "110px";
      var out = document.createElement("b");
      function upd() { out.textContent = inp.value + " " + unit; }
      inp.addEventListener("input", upd); upd();
      span.textContent = label;
      lab.appendChild(span); lab.appendChild(inp); lab.appendChild(out);
      bar.appendChild(lab);
      return inp;
    }
    var jitIn = slider(T.jit, 0, 40, 1, 12, "ms");
    var rateIn = slider(T.rate, 10, 240, 5, 30, "Hz");
    var btn = document.createElement("button");
    btn.type = "button"; btn.textContent = T.hitch;
    btn.style.cssText = "font:13px sans-serif;padding:3px 8px;border:1px solid #bbb;border-radius:4px;background:#fff;cursor:pointer";
    bar.appendChild(btn);

    var cv = document.createElement("canvas");
    cv.style.display = "block"; cv.style.width = "100%"; cv.style.touchAction = "pan-y";
    el.appendChild(cv);
    var ctx = cv.getContext("2d");
    var W = 0, H = 0;

    // ---- simulation state
    var w = 2 * Math.PI * 0.8, k = w * w;
    var X0, E0, V, F, Fp, acc, simT, hist, shown, lastPresent, nextPresent, hitch = false, drag = false;
    function energy(s) { return 0.5 * s.v * s.v + 0.5 * k * s.x * s.x; }
    function reset(x0) {
      X0 = x0; E0 = Math.max(energy({ x: x0, v: 0 }), 1e-9);
      V = { x: x0, v: 0 }; F = { x: x0, v: 0 }; Fp = { x: x0, v: 0 };
      acc = 0; simT = 0; hist = [];
      shown = { v: x0, raw: x0, lerp: x0, exact: x0, dt: 0, steps: 0, alpha: 0 };
    }
    reset(1);

    function present(now) {
      var dt = (now - lastPresent) / 1000;
      lastPresent = now;
      dt = Math.min(dt, 0.5);                      // safety net only
      // (1) variable step: one semi-implicit Euler step of length dt
      V.v -= k * V.x * dt; V.x += V.v * dt;
      simT += dt;
      // (2, 3) fixed step with accumulator (frame time clamped to avoid the spiral of death)
      var DT = 1 / parseFloat(rateIn.value), n = 0;
      acc += Math.min(dt, 0.25);
      while (acc >= DT) {
        Fp.x = F.x; Fp.v = F.v;
        F.v -= k * F.x * DT; F.x += F.v * DT;
        acc -= DT; n++;
      }
      var a = acc / DT;
      shown = { v: V.x, raw: F.x, lerp: Fp.x + a * (F.x - Fp.x), exact: X0 * Math.cos(w * simT),
                dt: dt, steps: n, alpha: a };
      hist.push([simT, energy(V) / E0, energy(F) / E0]);
      while (hist.length && hist[0][0] < simT - 10) hist.shift();
    }

    function resize() {
      W = el.clientWidth || 600;
      var total = Math.max(parseInt(el.style.minHeight, 10) || 440, 360);
      H = Math.max(total - bar.offsetHeight, 8 + 3 * 62 + 36 + 54 + 130 + 24);
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function geom() {
      var laneH = 62, top = 8;
      var x0 = 14, cx = x0 + (W - x0) * 0.5, A = (W - x0) * 0.36;
      return { laneH: laneH, top: top, x0: x0, cx: cx, A: A, plotTop: top + 3 * laneH + 36 };
    }

    function lane(i, x, col, title, g) {
      var yc = g.top + g.laneH * (i + 0.62);
      ctx.fillStyle = col; ctx.font = "12px sans-serif";
      ctx.fillText(title, g.x0 + 6, g.top + g.laneH * i + 13);
      // wall and rest line
      ctx.fillStyle = "#bbb"; ctx.fillRect(g.x0 - 6, yc - 14, 6, 28);
      ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(g.cx, yc - 16); ctx.lineTo(g.cx, yc + 16); ctx.stroke();
      var bx = g.cx + x * g.A;
      // spring zig-zag from the wall to the ball
      var n = 14, sx = g.x0, len = bx - 11 - sx;
      ctx.strokeStyle = COL.spring; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx, yc);
      for (var j = 1; j < n; j++) ctx.lineTo(sx + len * j / n, yc + (j % 2 ? -7 : 7));
      ctx.lineTo(bx - 11, yc); ctx.stroke();
      // exact solution (dashed ghost)
      var gx = g.cx + shown.exact * g.A;
      ctx.setLineDash([3, 3]); ctx.strokeStyle = "#555"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(gx, yc, 11, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx, yc, 10, 0, 2 * Math.PI); ctx.fill();
      return yc;
    }

    function draw() {
      if (!W) return;
      ctx.clearRect(0, 0, W, H);
      var g = geom();
      lane(0, shown.v, COL.v, T.v, g);
      lane(1, shown.raw, COL.raw, T.raw, g);
      lane(2, shown.lerp, COL.lerp, T.lerp, g);
      ctx.fillStyle = "#555"; ctx.font = "12px sans-serif";
      var info = "dt = " + (shown.dt * 1000).toFixed(1) + " ms   " + T.steps + " = " + shown.steps +
                 "   " + ("\u03b1") + " = " + shown.alpha.toFixed(2);
      ctx.fillText(T.ghost, g.x0, g.plotTop - 22);
      ctx.fillText(info, g.x0, g.plotTop - 6);

      // energy plot
      var px0 = 46, px1 = W - 10, py0 = g.plotTop + 56, py1 = H - 24;
      if (py1 - py0 < 40) return;
      var lo = 0.9, hi = 1.1;
      hist.forEach(function (h) { lo = Math.min(lo, h[1], h[2]); hi = Math.max(hi, h[1], h[2]); });
      lo = Math.max(lo, 0); hi = Math.min(hi, 3);
      var tEnd = Math.max(simT, 10), tBeg = tEnd - 10;
      function X(t) { return px0 + (t - tBeg) / 10 * (px1 - px0); }
      function Y(e) { return py1 - (Math.min(Math.max(e, lo), hi) - lo) / (hi - lo) * (py1 - py0); }
      ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1; ctx.strokeRect(px0, py0, px1 - px0, py1 - py0);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = "#888";
      ctx.beginPath(); ctx.moveTo(px0, Y(1)); ctx.lineTo(px1, Y(1)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#666"; ctx.font = "11px sans-serif";
      ctx.fillText(hi.toFixed(2), 4, py0 + 9); ctx.fillText(lo.toFixed(2), 4, py1); ctx.fillText("1", 30, Y(1) + 4);
      [[1, COL.v], [2, COL.lerp]].forEach(function (s) {
        ctx.strokeStyle = s[1]; ctx.lineWidth = 1.8; ctx.beginPath();
        hist.forEach(function (h, i) { var x = X(h[0]), y = Y(h[s[0]]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
      });
      var last = hist.length ? hist[hist.length - 1] : [0, 1, 1];
      ctx.font = "12px sans-serif";
      ctx.fillStyle = COL.text; ctx.fillText(T.energy, g.x0, g.plotTop + 14);
      ctx.fillStyle = COL.v; ctx.fillText(("\u25cf ") + T.v + ": " + last[1].toFixed(3), g.x0, g.plotTop + 30);
      ctx.fillStyle = COL.lerp; ctx.fillText(("\u25cf ") + T.lerp + ": " + last[2].toFixed(3), g.x0, g.plotTop + 46);
      ctx.fillStyle = "#888"; ctx.font = "12px sans-serif";
      var hw = ctx.measureText(T.hint).width;
      ctx.fillText(T.hint, W - hw - 8, H - 6);
    }

    // ---- loop: the "game" presents a new frame only at jittered times
    var visible = true;
    function loop(now) {
      if (lastPresent === undefined || now - lastPresent > 1000) { lastPresent = now; nextPresent = now; }
      if (!drag && now >= nextPresent) {
        present(now);
        var j = parseFloat(jitIn.value) * (2 * Math.random() - 1);
        if (hitch) { j += 200; hitch = false; }
        nextPresent = now + Math.max(4, 1000 / 60 + j);
        if (visible) draw();
      }
      requestAnimationFrame(loop);
    }
    btn.addEventListener("click", function () { hitch = true; });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(el);
    }

    // ---- drag a ball to set a new starting position
    function posX(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function setFromPointer(e) {
      var g = geom(), p = posX(e);
      var x = Math.max(-1.2, Math.min(1.2, (p[0] - g.cx) / g.A));
      if (Math.abs(x) < 0.05) x = 0.05;
      reset(x); draw();
    }
    cv.addEventListener("pointerdown", function (e) {
      var g = geom(), p = posX(e);
      if (p[1] > g.top + 3 * g.laneH) return;
      drag = true; setFromPointer(e); e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    });
    cv.addEventListener("pointermove", function (e) { if (drag) setFromPointer(e); });
    function up(e) {
      if (!drag) return;
      drag = false; lastPresent = performance.now(); nextPresent = lastPresent;
      try { cv.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(el); else window.addEventListener("resize", resize);
    resize();
    requestAnimationFrame(loop);
  }

  function init() {
    var els = document.querySelectorAll('[data-widget="graphics-engine-fixed-timestep"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; setup(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
