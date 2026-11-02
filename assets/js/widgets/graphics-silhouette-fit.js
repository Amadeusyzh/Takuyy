/* Silhouette fitting, live (graphics post 12).
   A 32 x 32 image; target = a hard disc (pixel values = area coverage, 4 x 4 samples per pixel).
   Unknowns p = (cx, cy, r) of a disc, loss L = mean_j (I_j - T_j)^2, optimizer Adam.
   Three ways to get dL/dp (the three renderers of the post's Section 7):
     soft : I_j = sigmoid((r - d_j) / sigma), gradient by the chain rule (exact for this soft image)
     edge : I_j = hard coverage (2 x 2 samples), gradient = edge-sampling estimate of the boundary
            term, M uniform points on the circle: dL/dp ~ (2 pi r / M) sum_k dL/dI_{j(k)} (v . n)_k,
            with v . n = cos(phi), sin(phi), 1 for cx, cy, r
     hard : the same hard image differentiated by "autodiff": the step has zero derivative -> 0.
   The loss curve always shows the true loss (hard disc with 4 x 4 samples), so runs are comparable.
   Drag on the image to choose a new starting position. */
(function () {
  "use strict";
  var TXT = {
    en: { method: "Gradient", soft: "soft raster", edge: "hard + edge sampling", hard: "hard + autodiff",
          sigma: "\u03c3 (px)", m: "edge samples M", run: "Run", pause: "Pause", reset: "Reset",
          help: "Drag on the image to move the start disc, then press Run.", it: "iteration", loss: "true loss (log)",
          zero: "gradient = 0: nothing moves" },
    zh: { method: "\u68af\u5ea6", soft: "\u8f6f\u5149\u6805\u5316", edge: "\u786c\u5149\u6805 + \u8fb9\u7f18\u91c7\u6837", hard: "\u786c\u5149\u6805 + \u81ea\u52a8\u5fae\u5206",
          sigma: "\u03c3\uff08\u50cf\u7d20\uff09", m: "\u8fb9\u7f18\u6837\u672c\u6570 M", run: "\u8fd0\u884c", pause: "\u6682\u505c", reset: "\u91cd\u7f6e",
          help: "\u5728\u56fe\u50cf\u4e0a\u62d6\u52a8\u4ee5\u79fb\u52a8\u521d\u59cb\u5706\u76d8\uff0c\u7136\u540e\u70b9\u51fb\u201c\u8fd0\u884c\u201d\u3002", it: "\u8fed\u4ee3", loss: "\u771f\u5b9e\u635f\u5931\uff08\u5bf9\u6570\uff09",
          zero: "\u68af\u5ea6 = 0\uff1a\u53c2\u6570\u4e0d\u52a8" },
    ja: { method: "\u52fe\u914d", soft: "\u30bd\u30d5\u30c8\u30e9\u30b9\u30bf", edge: "\u30cf\u30fc\u30c9 + \u30a8\u30c3\u30b8\u30b5\u30f3\u30d7\u30ea\u30f3\u30b0", hard: "\u30cf\u30fc\u30c9 + \u81ea\u52d5\u5fae\u5206",
          sigma: "\u03c3\uff08\u753b\u7d20\uff09", m: "\u30a8\u30c3\u30b8\u30b5\u30f3\u30d7\u30eb\u6570 M", run: "\u5b9f\u884c", pause: "\u4e00\u6642\u505c\u6b62", reset: "\u30ea\u30bb\u30c3\u30c8",
          help: "\u753b\u50cf\u4e0a\u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u521d\u671f\u306e\u5186\u677f\u3092\u52d5\u304b\u3057\u3001\u300c\u5b9f\u884c\u300d\u3092\u62bc\u3057\u307e\u3059\u3002", it: "\u53cd\u5fa9", loss: "\u771f\u306e\u640d\u5931\uff08\u5bfe\u6570\uff09",
          zero: "\u52fe\u914d = 0\uff1a\u52d5\u304d\u307e\u305b\u3093" }
  };
  var N = 32, ITERS = 300, COL = { soft: "#9467bd", edge: "#ff7f0e", hard: "#7f7f7f" };
  var TARGET = [19.5, 13.0, 7.5];

  function coverage(cx, cy, r, ss) {
    var img = new Float32Array(N * N), r2 = r * r, inv = 1 / (ss * ss);
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var c = 0;
      for (var b = 0; b < ss; b++) for (var a = 0; a < ss; a++) {
        var x = i + (a + 0.5) / ss - cx, y = j + (b + 0.5) / ss - cy;
        if (x * x + y * y < r2) c++;
      }
      img[j * N + i] = c * inv;
    }
    return img;
  }
  function mse(a, b) { var s = 0; for (var k = 0; k < a.length; k++) { var d = a[k] - b[k]; s += d * d; } return s / a.length; }

  function setup(el) {
    var T = TXT[el.dataset.lang] || TXT.en;
    var tgt = coverage(TARGET[0], TARGET[1], TARGET[2], 4);
    var st = { method: "soft", sigma: 1.5, M: 128, start: [11.0, 21.0, 4.5], running: false };
    var p, m, v, it, img, path, raf = 0, curves = { soft: null, edge: null, hard: null };

    el.innerHTML = "";
    el.style.background = "#fff"; el.style.color = "#222";
    el.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif"; el.style.fontSize = "14px";
    var ui = document.createElement("div");
    ui.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 10px 2px";
    el.appendChild(ui);
    function btn(txt, col) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = txt;
      b.style.cssText = "border:1px solid " + (col || "#bbb") + ";border-radius:6px;padding:3px 9px;background:#fff;color:#222;cursor:pointer;font:inherit";
      return b;
    }
    var g1 = document.createElement("div"); g1.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;align-items:center";
    var lab = document.createElement("span"); lab.textContent = T.method; lab.style.color = "#555"; g1.appendChild(lab);
    var mb = {};
    ["soft", "edge", "hard"].forEach(function (k) {
      var b = btn(T[k]); b.addEventListener("click", function () { st.method = k; reset(); }); mb[k] = b; g1.appendChild(b);
    });
    ui.appendChild(g1);
    function slider(label, min, max, step, get, set, show) {
      var g = document.createElement("label"); g.style.cssText = "display:flex;align-items:center;gap:6px";
      var s = document.createElement("span"); s.textContent = label; s.style.color = "#555";
      var r = document.createElement("input"); r.type = "range"; r.min = min; r.max = max; r.step = step; r.value = get();
      r.style.cssText = "width:110px;accent-color:#9467bd";
      var o = document.createElement("span"); o.style.cssText = "min-width:2.6em;font-variant-numeric:tabular-nums"; o.textContent = show();
      r.addEventListener("input", function () { set(parseFloat(r.value)); o.textContent = show(); });
      g.appendChild(s); g.appendChild(r); g.appendChild(o); ui.appendChild(g); return g;
    }
    var gs = slider(T.sigma, 0.25, 4, 0.25, function () { return st.sigma; }, function (x) { st.sigma = x; }, function () { return st.sigma.toFixed(2); });
    var gm = slider(T.m, 4, 10, 1, function () { return Math.log2(st.M); }, function (x) { st.M = Math.pow(2, x); }, function () { return String(st.M); });
    var bRun = btn(T.run, "#9467bd"), bReset = btn(T.reset);
    bRun.addEventListener("click", function () {
      if (it >= ITERS) reset();
      st.running = !st.running; sync();
      cancelAnimationFrame(raf);
      if (st.running) loop();
    });
    bReset.addEventListener("click", function () { reset(); });
    ui.appendChild(bRun); ui.appendChild(bReset);
    var help = document.createElement("div"); help.textContent = T.help;
    help.style.cssText = "padding:2px 10px 4px;color:#666;font-size:13px"; el.appendChild(help);
    var cv = document.createElement("canvas"); cv.style.cssText = "display:block;width:100%;touch-action:none"; el.appendChild(cv);
    var ctx = cv.getContext("2d"), W = 0, H = 0, wide = true, IM = null, PL = null;

    function sync() {
      ["soft", "edge", "hard"].forEach(function (k) {
        var on = st.method === k, b = mb[k];
        b.style.background = on ? COL[k] : "#fff"; b.style.color = on ? "#fff" : "#222"; b.style.borderColor = on ? "transparent" : "#bbb";
      });
      gs.style.display = st.method === "soft" ? "flex" : "none";
      gm.style.display = st.method === "edge" ? "flex" : "none";
      bRun.textContent = st.running ? T.pause : T.run;
    }

    function reset() {
      p = st.start.slice(); m = [0, 0, 0]; v = [0, 0, 0]; it = 0; st.running = false;
      img = renderCurrent(); path = [[p[0], p[1]]];
      curves[st.method] = [mse(coverage(p[0], p[1], p[2], 4), tgt)];
      sync(); draw();
    }

    function renderCurrent() {
      if (st.method === "soft") {
        var out = new Float32Array(N * N);
        for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
          var d = Math.hypot(i + 0.5 - p[0], j + 0.5 - p[1]);
          out[j * N + i] = 1 / (1 + Math.exp(-(p[2] - d) / st.sigma));
        }
        return out;
      }
      return coverage(p[0], p[1], p[2], 2);
    }

    function gradient() {
      var g = [0, 0, 0], k, j, i;
      img = renderCurrent();
      if (st.method === "hard") return g;                          // d step / d p = 0 almost everywhere
      if (st.method === "soft") {
        for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
          k = j * N + i;
          var s = img[k], dLdI = 2 * (s - tgt[k]) / (N * N);
          var dx = i + 0.5 - p[0], dy = j + 0.5 - p[1], d = Math.hypot(dx, dy) + 1e-9;
          var ds = s * (1 - s) / st.sigma;                       // ds / d(r - d)
          g[0] += dLdI * ds * dx / d; g[1] += dLdI * ds * dy / d; g[2] += dLdI * ds;
        }
        return g;
      }
      var w = 2 * Math.PI * p[2] / st.M;                           // edge sampling
      for (k = 0; k < st.M; k++) {
        var phi = Math.random() * 2 * Math.PI, nx = Math.cos(phi), ny = Math.sin(phi);
        i = Math.floor(p[0] + p[2] * nx); j = Math.floor(p[1] + p[2] * ny);
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        var q = 2 * (img[j * N + i] - tgt[j * N + i]) / (N * N);  // dL/dI_j times (f_in - f_out) = 1
        g[0] += q * nx * w; g[1] += q * ny * w; g[2] += q * w;
      }
      return g;
    }

    function step() {
      var g = gradient(), lr = 0.25, b1 = 0.9, b2 = 0.999;
      it++;
      for (var k = 0; k < 3; k++) {
        m[k] = b1 * m[k] + (1 - b1) * g[k]; v[k] = b2 * v[k] + (1 - b2) * g[k] * g[k];
        var mh = m[k] / (1 - Math.pow(b1, it)), vh = v[k] / (1 - Math.pow(b2, it));
        p[k] -= lr * mh / (Math.sqrt(vh) + 1e-12);
      }
      p[2] = Math.max(0.5, p[2]);
      path.push([p[0], p[1]]);
      curves[st.method].push(mse(coverage(p[0], p[1], p[2], 4), tgt));
    }

    function loop() {
      if (!st.running) return;
      for (var s = 0; s < 2 && it < ITERS; s++) step();
      img = renderCurrent(); draw();
      if (it >= ITERS) { st.running = false; sync(); return; }
      raf = requestAnimationFrame(loop);
    }

    function layout() {
      W = el.clientWidth; wide = W >= 620;
      var dpr = window.devicePixelRatio || 1;
      if (wide) {
        var s = Math.min(W * 0.42, 330);
        IM = [14, 14, s]; PL = [s + 74, 14, W - s - 92, s - 30]; H = Math.round(s + 34);
      } else {
        var s2 = Math.min(W - 28, 340);
        IM = [(W - s2) / 2, 12, s2]; PL = [54, s2 + 34, W - 70, 150]; H = Math.round(s2 + 34 + 150 + 40);
      }
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      if (!IM) return;
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      var x0 = IM[0], y0 = IM[1], s = IM[2], c = s / N, i, j, k;
      for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
        var val = img[j * N + i], col = COL[st.method] === "#7f7f7f" ? [90, 90, 90] : st.method === "soft" ? [148, 103, 189] : [255, 127, 14];
        ctx.fillStyle = "rgb(" + Math.round(255 + (col[0] - 255) * val) + "," + Math.round(255 + (col[1] - 255) * val) + "," + Math.round(255 + (col[2] - 255) * val) + ")";
        ctx.fillRect(x0 + i * c, y0 + j * c, c + 0.5, c + 0.5);
      }
      ctx.strokeStyle = "#2ca02c"; ctx.lineWidth = 2.2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(x0 + TARGET[0] * c, y0 + TARGET[1] * c, TARGET[2] * c, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = "#222"; ctx.lineWidth = 1.6; ctx.beginPath();
      for (k = 0; k < path.length; k++) { var px = x0 + path[k][0] * c, py = y0 + path[k][1] * c; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.stroke();
      ctx.strokeStyle = "#222"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x0 + p[0] * c, y0 + p[1] * c, Math.max(1, p[2] * c), 0, 2 * Math.PI); ctx.stroke();
      ctx.strokeStyle = "#999"; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, s, s);
      if (st.method === "hard" && it > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(x0 + 6, y0 + s - 30, s - 12, 24);
        ctx.fillStyle = "#b00"; ctx.font = "bold 13px sans-serif"; ctx.fillText(T.zero, x0 + 12, y0 + s - 13);
      }
      // loss plot: log10 scale from 1e-4 to 1e-1
      var px0 = PL[0], py0 = PL[1], pw = PL[2], ph = PL[3];
      var Y = function (l) { var t = (Math.log(Math.max(l, 1e-5)) / Math.LN10 + 5) / 4; return py0 + ph - Math.max(0, Math.min(1, t)) * ph; };
      var X = function (n) { return px0 + n / ITERS * pw; };
      ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1; ctx.strokeRect(px0, py0, pw, ph);
      ctx.fillStyle = "#666"; ctx.font = "11px sans-serif";
      ["1e-5", "1e-4", "1e-3", "1e-2", "1e-1"].forEach(function (lb, q) {
        var yy = py0 + ph - q / 4 * ph; ctx.fillText(lb, px0 - 36, yy + 4);
        ctx.strokeStyle = "#eee"; ctx.beginPath(); ctx.moveTo(px0, yy); ctx.lineTo(px0 + pw, yy); ctx.stroke();
      });
      ctx.fillText("0", px0 - 3, py0 + ph + 14); ctx.fillText(String(ITERS), px0 + pw - 16, py0 + ph + 14);
      ctx.fillText(T.it, px0 + pw / 2 - 20, py0 + ph + 14);
      ctx.fillStyle = "#333"; ctx.font = "12px sans-serif"; ctx.fillText(T.loss, px0 + 6, py0 + 14);
      ["hard", "edge", "soft"].forEach(function (mth) {
        var cu = curves[mth]; if (!cu) return;
        ctx.strokeStyle = COL[mth]; ctx.lineWidth = mth === st.method ? 2.4 : 1.4; ctx.globalAlpha = mth === st.method ? 1 : 0.6;
        ctx.beginPath();
        for (var q = 0; q < cu.length; q++) { if (q) ctx.lineTo(X(q), Y(cu[q])); else ctx.moveTo(X(q), Y(cu[q])); }
        ctx.stroke(); ctx.globalAlpha = 1;
      });
    }

    var dragging = false;
    function setStart(e) {
      var b = cv.getBoundingClientRect(), c = IM[2] / N;
      var gx = (e.clientX - b.left - IM[0]) / c, gy = (e.clientY - b.top - IM[1]) / c;
      st.start = [Math.max(0, Math.min(N, gx)), Math.max(0, Math.min(N, gy)), st.start[2]];
      reset();
    }
    cv.addEventListener("pointerdown", function (e) {
      var b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      if (x < IM[0] || y < IM[1] || x > IM[0] + IM[2] || y > IM[1] + IM[2]) return;
      dragging = true; cv.setPointerCapture(e.pointerId); setStart(e); e.preventDefault();
    });
    cv.addEventListener("pointermove", function (e) { if (dragging) setStart(e); });
    function end() { dragging = false; }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);

    layout(); reset();
    var lastW = el.clientWidth;
    window.addEventListener("resize", function () { if (el.clientWidth !== lastW) { lastW = el.clientWidth; layout(); draw(); } });
  }

  function init() { document.querySelectorAll('[data-widget="graphics-silhouette-fit"]').forEach(setup); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
