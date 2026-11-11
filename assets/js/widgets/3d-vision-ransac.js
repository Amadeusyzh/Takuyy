/* RANSAC playground (3d-vision post 03).
 * Points come from a line or a circle (inliers, Gaussian noise sigma) plus uniform outliers (ratio eps).
 * Each iteration draws a minimal sample (s = 2 for a line, 3 for a circle), fits a hypothesis, and scores
 * it by the inlier count (RANSAC) or the truncated quadratic sum min(e^2, t^2) (MSAC). LO optionally
 * re-fits every new best model to its inliers. The adaptive stopping rule N = log(1-p)/log(1-w^s) uses
 * the inlier ratio w of the best model so far (p = 0.99). Tap the plot to add an outlier, drag a point
 * to move it.
 */
(function () {
  "use strict";

  var TEXT = {
    en: {
      line: "line (s=2)", circle: "circle (s=3)", eps: "outliers \u03b5", noise: "noise \u03c3", thr: "threshold t",
      lo: "LO", step: "step", run: "run", pause: "pause", reset: "restart", data: "new data",
      iter: "iteration", needed: "needed", best: "best model", inl: "inliers", cur: "current sample",
      degen: "degenerate sample", theory: "theory for the true \u03b5", pfound: "P(an all-inlier sample so far)",
      stopped: "stopped: k \u2265 N", hint: "Tap the plot to add an outlier, drag a point to move it.",
      ls: "least squares", gt: "truth", chartY: "inliers", chartX: "iteration k"
    },
    zh: {
      line: "\u76f4\u7ebf\uff08s=2\uff09", circle: "\u5706\uff08s=3\uff09", eps: "\u5916\u70b9 \u03b5", noise: "\u566a\u58f0 \u03c3", thr: "\u9608\u503c t",
      lo: "LO", step: "\u5355\u6b65", run: "\u8fd0\u884c", pause: "\u6682\u505c", reset: "\u91cd\u65b0\u5f00\u59cb", data: "\u65b0\u6570\u636e",
      iter: "\u8fed\u4ee3", needed: "\u6240\u9700", best: "\u6700\u4f73\u6a21\u578b", inl: "\u5185\u70b9", cur: "\u5f53\u524d\u6837\u672c",
      degen: "\u9000\u5316\u6837\u672c", theory: "\u6309\u771f\u5b9e \u03b5 \u7684\u7406\u8bba\u503c", pfound: "P\uff08\u5230\u76ee\u524d\u4e3a\u6b62\u62bd\u5230\u5168\u5185\u70b9\u6837\u672c\uff09",
      stopped: "\u5df2\u505c\u6b62\uff1ak \u2265 N", hint: "\u70b9\u51fb\u56fe\u4e2d\u7a7a\u767d\u5904\u6dfb\u52a0\u5916\u70b9\uff0c\u62d6\u52a8\u70b9\u53ef\u79fb\u52a8\u5b83\u3002",
      ls: "\u6700\u5c0f\u4e8c\u4e58", gt: "\u771f\u503c", chartY: "\u5185\u70b9\u6570", chartX: "\u8fed\u4ee3\u6b21\u6570 k"
    },
    ja: {
      line: "\u76f4\u7dda\uff08s=2\uff09", circle: "\u5186\uff08s=3\uff09", eps: "\u30a2\u30a6\u30c8\u30e9\u30a4\u30a2 \u03b5", noise: "\u30ce\u30a4\u30ba \u03c3", thr: "\u95be\u5024 t",
      lo: "LO", step: "1 \u30b9\u30c6\u30c3\u30d7", run: "\u5b9f\u884c", pause: "\u4e00\u6642\u505c\u6b62", reset: "\u3084\u308a\u76f4\u3059", data: "\u65b0\u3057\u3044\u30c7\u30fc\u30bf",
      iter: "\u53cd\u5fa9", needed: "\u5fc5\u8981\u56de\u6570", best: "\u6700\u826f\u30e2\u30c7\u30eb", inl: "\u30a4\u30f3\u30e9\u30a4\u30a2", cur: "\u73fe\u5728\u306e\u30b5\u30f3\u30d7\u30eb",
      degen: "\u9000\u5316\u30b5\u30f3\u30d7\u30eb", theory: "\u771f\u306e \u03b5 \u3067\u306e\u7406\u8ad6\u5024", pfound: "P\uff08\u3053\u308c\u307e\u3067\u306b\u5168\u30a4\u30f3\u30e9\u30a4\u30a2\u306e\u30b5\u30f3\u30d7\u30eb\u3092\u5f15\u3044\u305f\uff09",
      stopped: "\u505c\u6b62\uff1ak \u2265 N", hint: "\u56f3\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u30a2\u30a6\u30c8\u30e9\u30a4\u30a2\u3092\u8ffd\u52a0\u3001\u70b9\u3092\u30c9\u30e9\u30c3\u30b0\u3059\u308b\u3068\u79fb\u52d5\u3057\u307e\u3059\u3002",
      ls: "\u6700\u5c0f\u4e8c\u4e57", gt: "\u771f\u5024", chartY: "\u30a4\u30f3\u30e9\u30a4\u30a2\u6570", chartX: "\u53cd\u5fa9\u56de\u6570 k"
    }
  };

  var COL = { inl: "#2ca02c", out: "#8a8a8a", hyp: "#9467bd", best: "#2ca02c", ls: "#d62728", sample: "#d62728", gt: "#222" };
  var P_CONF = 0.99, NPTS = 100;

  // ---------- geometry ----------
  function lineFrom2(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    if (L < 1e-9) return null;
    var nx = -dy / L, ny = dx / L;
    return { kind: "line", nx: nx, ny: ny, d: nx * a.x + ny * a.y };
  }
  function circleFrom3(a, b, c) {
    var d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-6) return null;
    var a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
    var ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
    var uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
    var r = Math.hypot(a.x - ux, a.y - uy);
    if (r > 400) return null;
    return { kind: "circle", cx: ux, cy: uy, r: r };
  }
  function resid(m, p) {
    if (m.kind === "line") return Math.abs(m.nx * p.x + m.ny * p.y - m.d);
    return Math.abs(Math.hypot(p.x - m.cx, p.y - m.cy) - m.r);
  }
  // total least squares line through a set of points
  function fitLine(P) {
    if (P.length < 2) return null;
    var mx = 0, my = 0, i;
    for (i = 0; i < P.length; i++) { mx += P[i].x; my += P[i].y; }
    mx /= P.length; my /= P.length;
    var sxx = 0, sxy = 0, syy = 0;
    for (i = 0; i < P.length; i++) {
      var dx = P[i].x - mx, dy = P[i].y - my;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }
    // normal = eigenvector of the smaller eigenvalue of the scatter matrix
    var th = 0.5 * Math.atan2(2 * sxy, sxx - syy); // direction of the larger eigenvalue
    var nx = -Math.sin(th), ny = Math.cos(th);
    return { kind: "line", nx: nx, ny: ny, d: nx * mx + ny * my };
  }
  // algebraic (Kasa) circle fit: x^2 + y^2 + A x + B y + C = 0
  function fitCircle(P) {
    if (P.length < 3) return null;
    var S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0], i, j, k;
    for (i = 0; i < P.length; i++) {
      var r = [P[i].x, P[i].y, 1], z = -(P[i].x * P[i].x + P[i].y * P[i].y);
      for (j = 0; j < 3; j++) { v[j] += r[j] * z; for (k = 0; k < 3; k++) S[j][k] += r[j] * r[k]; }
    }
    var sol = solve3(S, v);
    if (!sol) return null;
    var cx = -sol[0] / 2, cy = -sol[1] / 2, r2 = cx * cx + cy * cy - sol[2];
    if (!(r2 > 0)) return null;
    return { kind: "circle", cx: cx, cy: cy, r: Math.sqrt(r2) };
  }
  function solve3(A, b) {
    var M = A.map(function (row, i) { return row.concat([b[i]]); }), i, j, k;
    for (i = 0; i < 3; i++) {
      var p = i;
      for (j = i + 1; j < 3; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j;
      if (Math.abs(M[p][i]) < 1e-12) return null;
      var t = M[i]; M[i] = M[p]; M[p] = t;
      for (j = i + 1; j < 3; j++) {
        var f = M[j][i] / M[i][i];
        for (k = i; k < 4; k++) M[j][k] -= f * M[i][k];
      }
    }
    var x = [0, 0, 0];
    for (i = 2; i >= 0; i--) {
      var s = M[i][3];
      for (j = i + 1; j < 3; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }
  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function iterationsNeeded(w, s) {
    if (w <= 0) return Infinity;
    var q = Math.pow(w, s);
    if (q >= 1) return 1;
    return Math.ceil(Math.log(1 - P_CONF) / Math.log(1 - q));
  }

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.innerHTML = "";
    root.style.background = "#fbfbfd";
    root.style.color = "#222";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.fontSize = "14px";

    var S = { kind: "line", eps: 0.5, sigma: 1.5, t: 4, score: "ransac", lo: false };
    var pts = [], truth = null, run = null, running = false, drag = -1;

    // ---------- controls ----------
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
    function slider(txt, min, max, step, val, fmt, cb) {
      var l = document.createElement("label");
      l.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap";
      var sp = document.createElement("span");
      var inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
      inp.style.width = "92px";
      function show() { sp.textContent = txt + " " + fmt(+inp.value); }
      inp.addEventListener("input", function () { show(); cb(+inp.value); });
      show();
      l.appendChild(sp); l.appendChild(inp); bar.appendChild(l);
      return inp;
    }
    var bLine = btn(T.line, function () { S.kind = "line"; newData(); });
    var bCirc = btn(T.circle, function () { S.kind = "circle"; newData(); });
    var sel = document.createElement("select");
    sel.style.cssText = "font:inherit;padding:2px 4px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222";
    ["RANSAC", "MSAC"].forEach(function (n) { var o = document.createElement("option"); o.value = n.toLowerCase(); o.textContent = n; sel.appendChild(o); });
    sel.addEventListener("change", function () { S.score = sel.value; restart(); });
    bar.appendChild(sel);
    var loL = document.createElement("label");
    loL.style.cssText = "display:flex;align-items:center;gap:4px";
    var loC = document.createElement("input"); loC.type = "checkbox";
    loC.addEventListener("change", function () { S.lo = loC.checked; restart(); });
    loL.appendChild(loC); loL.appendChild(document.createTextNode(T.lo)); bar.appendChild(loL);
    slider(T.eps, 0, 0.9, 0.05, S.eps, function (v) { return v.toFixed(2); }, function (v) { S.eps = v; newData(); });
    slider(T.noise, 0.3, 4, 0.1, S.sigma, function (v) { return v.toFixed(1); }, function (v) { S.sigma = v; newData(true); });
    slider(T.thr, 0.5, 12, 0.5, S.t, function (v) { return v.toFixed(1); }, function (v) { S.t = v; restart(); });
    btn(T.step, function () { running = false; runBtn.textContent = T.run; doStep(); draw(); });
    var runBtn = btn(T.run, function () {
      if (run.k >= run.N) restart();
      running = !running; runBtn.textContent = running ? T.pause : T.run; if (running) loop();
    });
    btn(T.reset, function () { restart(); });
    btn(T.data, function () { newData(); });

    // ---------- canvases ----------
    var row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;padding:4px 10px 10px;align-items:flex-start";
    root.appendChild(row);
    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;touch-action:none;cursor:crosshair;border-radius:6px;background:#fff;box-shadow:0 0 0 1px #ddd";
    row.appendChild(cv);
    var side = document.createElement("div");
    side.style.cssText = "flex:1 1 220px;min-width:0";
    row.appendChild(side);
    var ch = document.createElement("canvas");
    ch.style.cssText = "display:block;border-radius:6px;background:#fff;box-shadow:0 0 0 1px #ddd";
    side.appendChild(ch);
    var info = document.createElement("div");
    info.style.cssText = "padding:6px 2px 0;line-height:1.55;font-variant-numeric:tabular-nums";
    side.appendChild(info);
    var ctx = cv.getContext("2d"), cctx = ch.getContext("2d");
    var SZ = 300, CW = 300, CH = 120, lastW = -1;

    function resize() {
      var w = Math.max(260, root.clientWidth - 20);
      if (w === lastW) return;
      lastW = w;
      var wide = w >= 620;
      SZ = wide ? Math.min(420, Math.round(w * 0.56)) : Math.min(w, 420);
      CW = wide ? w - SZ - 8 : w;
      CH = wide ? Math.round(SZ * 0.5) : 120;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.width = SZ + "px"; cv.style.height = SZ + "px";
      cv.width = Math.round(SZ * dpr); cv.height = Math.round(SZ * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ch.style.width = CW + "px"; ch.style.height = CH + "px";
      ch.width = Math.round(CW * dpr); ch.height = Math.round(CH * dpr);
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function X(x) { return 8 + x / 100 * (SZ - 16); }
    function Y(y) { return SZ - 8 - y / 100 * (SZ - 16); }
    function invX(px) { return (px - 8) / (SZ - 16) * 100; }
    function invY(py) { return (SZ - 8 - py) / (SZ - 16) * 100; }

    // ---------- data ----------
    function newData(keepModel) {
      if (!keepModel || !truth || truth.kind !== S.kind) {
        if (S.kind === "line") {
          var a = (Math.random() - 0.5) * 2.2, cx = 50 + (Math.random() - 0.5) * 20, cy = 50 + (Math.random() - 0.5) * 20;
          var nx = -Math.sin(a), ny = Math.cos(a);
          truth = { kind: "line", nx: nx, ny: ny, d: nx * cx + ny * cy, ox: cx, oy: cy, dx: Math.cos(a), dy: Math.sin(a) };
        } else {
          truth = { kind: "circle", cx: 50 + (Math.random() - 0.5) * 16, cy: 50 + (Math.random() - 0.5) * 16, r: 24 + Math.random() * 12 };
        }
      }
      pts = [];
      var nIn = Math.round(NPTS * (1 - S.eps)), i = 0, guard = 0;
      while (i < nIn && guard++ < 5000) {
        var p;
        if (truth.kind === "line") {
          var s = (Math.random() - 0.5) * 140;
          p = { x: truth.ox + s * truth.dx + gauss() * S.sigma, y: truth.oy + s * truth.dy + gauss() * S.sigma };
        } else {
          var th = Math.random() * 2 * Math.PI, rr = truth.r + gauss() * S.sigma;
          p = { x: truth.cx + rr * Math.cos(th), y: truth.cy + rr * Math.sin(th) };
        }
        if (p.x < 1 || p.x > 99 || p.y < 1 || p.y > 99) continue;
        p.out = false; pts.push(p); i++;
      }
      while (pts.length < NPTS) pts.push({ x: 1 + Math.random() * 98, y: 1 + Math.random() * 98, out: true });
      restart();
    }
    function sDim() { return S.kind === "line" ? 2 : 3; }
    function fitAll(P) { return S.kind === "line" ? fitLine(P) : fitCircle(P); }
    function cost(m) {
      var c = 0, n = 0;
      for (var i = 0; i < pts.length; i++) {
        var e = resid(m, pts[i]);
        if (e < S.t) n++;
        c += S.score === "ransac" ? (e < S.t ? 0 : 1) : Math.min(e * e, S.t * S.t);
      }
      return { c: c, n: n };
    }
    function inliersOf(m) { return pts.filter(function (p) { return resid(m, p) < S.t; }); }
    function restart() {
      run = { k: 0, best: null, bestC: Infinity, bestN: 0, cur: null, hist: [], bestHist: [], N: Infinity };
      running = false; runBtn.textContent = T.run;
      draw();
    }
    function doStep() {
      if (pts.length < sDim()) return;
      var s = sDim(), idx = [];
      while (idx.length < s) {
        var j = Math.floor(Math.random() * pts.length);
        if (idx.indexOf(j) < 0) idx.push(j);
      }
      var m = s === 2 ? lineFrom2(pts[idx[0]], pts[idx[1]]) : circleFrom3(pts[idx[0]], pts[idx[1]], pts[idx[2]]);
      run.k++;
      if (!m) {
        run.cur = { idx: idx, m: null, n: 0 };
      } else {
        var sc = cost(m);
        run.cur = { idx: idx, m: m, n: sc.n };
        if (sc.c < run.bestC && S.lo) {
          for (var it = 0; it < 5; it++) {
            var m2 = fitAll(inliersOf(m));
            if (!m2) break;
            var sc2 = cost(m2);
            if (sc2.c >= sc.c) break;
            m = m2; sc = sc2;
          }
        }
        if (sc.c < run.bestC) {
          run.best = m; run.bestC = sc.c; run.bestN = sc.n;
          run.N = iterationsNeeded(sc.n / pts.length, s);
        }
      }
      if (run.hist.length < 5000) { run.hist.push(run.cur.n); run.bestHist.push(run.bestN); }
    }
    var lastT = 0;
    function loop(ts) {
      if (!running) return;
      if (!ts || ts - lastT > 110) {
        lastT = ts || 0;
        var per = Math.max(1, Math.floor(Math.min(run.N, 3000) / 60));
        for (var i = 0; i < per && run.k < run.N && run.k < 5000; i++) doStep();
        if (run.k >= run.N || run.k >= 5000) { running = false; runBtn.textContent = T.run; }
        draw();
      }
      if (running) requestAnimationFrame(loop);
    }

    // ---------- drawing ----------
    function drawModel(m, color, lw, dash, band) {
      if (!m) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, SZ, SZ); ctx.clip();
      if (band) {
        ctx.fillStyle = "rgba(148,103,189,0.13)";
        ctx.beginPath();
        if (m.kind === "line") {
          var tx = m.ny, ty = -m.nx, L = 200, x0 = m.nx * m.d, y0 = m.ny * m.d, t = S.t;
          ctx.moveTo(X(x0 + tx * -L + m.nx * t), Y(y0 + ty * -L + m.ny * t));
          ctx.lineTo(X(x0 + tx * L + m.nx * t), Y(y0 + ty * L + m.ny * t));
          ctx.lineTo(X(x0 + tx * L - m.nx * t), Y(y0 + ty * L - m.ny * t));
          ctx.lineTo(X(x0 + tx * -L - m.nx * t), Y(y0 + ty * -L - m.ny * t));
          ctx.closePath(); ctx.fill();
        } else {
          var k = (SZ - 16) / 100;
          ctx.arc(X(m.cx), Y(m.cy), (m.r + S.t) * k, 0, 2 * Math.PI, false);
          ctx.arc(X(m.cx), Y(m.cy), Math.max(0, m.r - S.t) * k, 0, 2 * Math.PI, true);
          ctx.fill();
        }
      }
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash || []);
      ctx.beginPath();
      if (m.kind === "line") {
        var tx2 = m.ny, ty2 = -m.nx, x1 = m.nx * m.d, y1 = m.ny * m.d;
        ctx.moveTo(X(x1 - 300 * tx2), Y(y1 - 300 * ty2)); ctx.lineTo(X(x1 + 300 * tx2), Y(y1 + 300 * ty2));
      } else {
        ctx.arc(X(m.cx), Y(m.cy), m.r * (SZ - 16) / 100, 0, 2 * Math.PI);
      }
      ctx.stroke();
      ctx.restore();
    }
    function draw() {
      if (!run) return;
      ctx.clearRect(0, 0, SZ, SZ);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, SZ, SZ);
      ctx.strokeStyle = "#eee"; ctx.lineWidth = 1;
      for (var g = 0; g <= 100; g += 20) {
        ctx.beginPath(); ctx.moveTo(X(g), Y(0)); ctx.lineTo(X(g), Y(100)); ctx.moveTo(X(0), Y(g)); ctx.lineTo(X(100), Y(g)); ctx.stroke();
      }
      var refit = run.best ? fitAll(inliersOf(run.best)) || run.best : null;
      drawModel(fitAll(pts), COL.ls, 1.8, [6, 4], false);
      if (run.cur && run.cur.m) drawModel(run.cur.m, COL.hyp, 2, null, true);
      if (refit) drawModel(refit, COL.best, 3, null, false);
      var bestM = refit;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], isIn = bestM && resid(bestM, p) < S.t;
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 3.6, 0, 2 * Math.PI);
        ctx.fillStyle = isIn ? COL.inl : COL.out; ctx.fill();
      }
      if (run.cur) {
        run.cur.idx.forEach(function (j) {
          var q = pts[j]; if (!q) return;
          ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), 8, 0, 2 * Math.PI);
          ctx.strokeStyle = COL.sample; ctx.lineWidth = 2.2; ctx.stroke();
        });
      }
      // legend
      ctx.font = "12px system-ui, sans-serif"; ctx.textBaseline = "middle";
      var lx = 12, ly = 14;
      [[COL.best, T.best, []], [COL.hyp, T.cur, []], [COL.ls, T.ls, [6, 4]]].forEach(function (L) {
        ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(lx - 4, ly - 8, ctx.measureText(L[1]).width + 34, 16);
        ctx.strokeStyle = L[0]; ctx.lineWidth = 2.5; ctx.setLineDash(L[2]);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 20, ly); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#333"; ctx.fillText(L[1], lx + 26, ly);
        ly += 17;
      });
      drawChart();
      writeInfo();
    }
    function drawChart() {
      cctx.clearRect(0, 0, CW, CH);
      cctx.fillStyle = "#fff"; cctx.fillRect(0, 0, CW, CH);
      var l = 34, r = 8, tp = 8, b = 22, n = pts.length;
      var nTrue = pts.filter(function (p) { return !p.out; }).length;
      var Nth = iterationsNeeded(nTrue / n, sDim());
      var xmax = Math.max(10, run.k, isFinite(run.N) ? run.N : 0, isFinite(Nth) ? Math.min(Nth, 3000) : 0) * 1.08;
      function cx(k) { return l + k / xmax * (CW - l - r); }
      function cy(v) { return CH - b - v / n * (CH - tp - b); }
      cctx.strokeStyle = "#999"; cctx.lineWidth = 1;
      cctx.beginPath(); cctx.moveTo(l, tp); cctx.lineTo(l, CH - b); cctx.lineTo(CW - r, CH - b); cctx.stroke();
      cctx.fillStyle = "#555"; cctx.font = "11px system-ui, sans-serif"; cctx.textBaseline = "middle"; cctx.textAlign = "right";
      cctx.fillText(String(n), l - 4, cy(n)); cctx.fillText("0", l - 4, cy(0));
      cctx.textAlign = "center"; cctx.textBaseline = "top";
      cctx.fillText(T.chartX, (l + CW - r) / 2, CH - b + 6);
      cctx.fillText(String(Math.round(xmax)), CW - r - 10, CH - b + 6);
      cctx.save(); cctx.translate(10, (tp + CH - b) / 2); cctx.rotate(-Math.PI / 2); cctx.textBaseline = "middle";
      cctx.fillText(T.chartY, 0, 0); cctx.restore();
      // true inlier count and the two iteration counts
      cctx.setLineDash([4, 3]); cctx.strokeStyle = "#222";
      cctx.beginPath(); cctx.moveTo(l, cy(nTrue)); cctx.lineTo(CW - r, cy(nTrue)); cctx.stroke();
      if (isFinite(Nth) && Nth <= xmax) {
        cctx.strokeStyle = "#999"; cctx.beginPath(); cctx.moveTo(cx(Nth), tp); cctx.lineTo(cx(Nth), CH - b); cctx.stroke();
      }
      if (isFinite(run.N)) {
        cctx.strokeStyle = COL.hyp; cctx.beginPath(); cctx.moveTo(cx(run.N), tp); cctx.lineTo(cx(run.N), CH - b); cctx.stroke();
      }
      cctx.setLineDash([]);
      cctx.fillStyle = "rgba(148,103,189,0.55)";
      var H = run.hist, B = run.bestHist, i;
      for (i = 0; i < H.length; i++) cctx.fillRect(cx(i + 1) - 1.2, cy(H[i]) - 1.2, 2.4, 2.4);
      cctx.strokeStyle = COL.best; cctx.lineWidth = 2;
      cctx.beginPath(); cctx.moveTo(cx(0), cy(0));
      for (i = 0; i < B.length; i++) { cctx.lineTo(cx(i + 1), cy(i ? B[i - 1] : 0)); cctx.lineTo(cx(i + 1), cy(B[i])); }
      cctx.stroke();
    }
    function fmtN(v) { return isFinite(v) ? (v > 99999 ? v.toExponential(1) : String(v)) : "\u221e"; }
    function writeInfo() {
      var n = pts.length, s = sDim();
      var nTrue = pts.filter(function (p) { return !p.out; }).length, w = nTrue / n;
      var Nth = iterationsNeeded(w, s);
      var pf = 1 - Math.pow(1 - Math.pow(w, s), run.k);
      var cur = run.cur ? (run.cur.m ? T.cur + ": " + run.cur.n + " " + T.inl : T.degen) : "";
      var stop = run.k > 0 && run.k >= run.N ? ' <b style="color:#9467bd">' + T.stopped + "</b>" : "";
      info.innerHTML =
        "<b>" + T.iter + " k = " + run.k + "</b> &nbsp; " + T.needed + ' <span style="color:#9467bd">N = ' + fmtN(run.N) + "</span>" + stop + "<br>" +
        T.best + ": " + run.bestN + " / " + n + " " + T.inl + " (w\u0302 = " + (run.bestN / n).toFixed(2) + ")<br>" +
        cur + "<br>" +
        T.theory + " (" + nTrue + "/" + n + ", s = " + s + "): N = " + fmtN(Nth) + "<br>" +
        T.pfound + " = " + pf.toFixed(3) + "<br>" +
        '<span style="color:#777">' + T.hint + "</span>";
    }

    // ---------- pointer ----------
    function evPos(e) {
      var rc = cv.getBoundingClientRect();
      return { x: e.clientX - rc.left, y: e.clientY - rc.top };
    }
    cv.addEventListener("pointerdown", function (e) {
      var q = evPos(e), best = -1, bd = 14;
      for (var i = 0; i < pts.length; i++) {
        var d = Math.hypot(X(pts[i].x) - q.x, Y(pts[i].y) - q.y);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) {
        pts.push({ x: Math.min(99, Math.max(1, invX(q.x))), y: Math.min(99, Math.max(1, invY(q.y))), out: true });
        restart();
        return;
      }
      drag = best;
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    cv.addEventListener("pointermove", function (e) {
      if (drag < 0) return;
      var q = evPos(e);
      pts[drag].x = Math.min(99, Math.max(1, invX(q.x)));
      pts[drag].y = Math.min(99, Math.max(1, invY(q.y)));
      restart();
    });
    function end() { drag = -1; }
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    newData();
    doStep();                       // show one hypothesis from the start
    resize();
    bLine.style.fontWeight = "600";
    bLine.addEventListener("click", function () { bLine.style.fontWeight = "600"; bCirc.style.fontWeight = "400"; });
    bCirc.addEventListener("click", function () { bCirc.style.fontWeight = "600"; bLine.style.fontWeight = "400"; });
  }

  function init() {
    document.querySelectorAll('[data-widget="3d-vision-ransac"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
