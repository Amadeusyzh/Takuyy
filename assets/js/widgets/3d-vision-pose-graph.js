/* Pose-graph SLAM playground (3d-vision post 06).
^ * A robot drives a figure-eight and a quarter. Its odometry (noisy relative poses between consecutive poses) is
 * chained into a drifting dead-reckoning estimate. Loop closures are extra relative-pose edges between
 * revisited places. Gauss-Newton on SE(2) (pose 0 fixed: the gauge) minimizes
 *   sum_e w_e * e_e^T Omega_e e_e,  e_ij = t2v(Z_ij^-1 X_i^-1 X_j),
 * with optional Cauchy weights w = 1 / (1 + e^T Omega e / c^2), c = 3. Tap a pose, then another pose,
 * to add a loop closure between them; "false loop" adds a wrong edge between two distant places.
 */
(function () {
  "use strict";

  var TEXT = {
    en: {
      sth: "heading noise", sd: "distance noise", noise: "new noise", auto: "add loop closures", wrong: "add false loop",
      clear: "remove loops", step: "GN step", run: "optimize", reset: "back to odometry", kernel: "kernel",
      iter: "iteration", cost: "cost", ate: "ATE (RMS position error)", loops: "loop closures", falses: "false",
      truth: "ground truth", est: "estimate", loopL: "loop closure", falseL: "false loop",
      tapped: "selected pose", hint: "Tap a pose, then another one, to add a loop closure between them. Pose 0 (black) is fixed.",
      chart: "cost per iteration (log)", per: "per step", wmin: "smallest loop weight", converged: "converged"
    },
    zh: {
      sth: "\u822a\u5411\u566a\u58f0", sd: "\u8ddd\u79bb\u566a\u58f0", noise: "\u91cd\u65b0\u91c7\u6837\u566a\u58f0", auto: "\u6dfb\u52a0\u56de\u73af", wrong: "\u6dfb\u52a0\u9519\u8bef\u56de\u73af",
      clear: "\u5220\u9664\u56de\u73af", step: "\u9ad8\u65af-\u725b\u987f\u4e00\u6b65", run: "\u4f18\u5316", reset: "\u56de\u5230\u91cc\u7a0b\u8ba1", kernel: "\u6838\u51fd\u6570",
      iter: "\u8fed\u4ee3", cost: "\u4ee3\u4ef7", ate: "ATE\uff08\u4f4d\u7f6e\u8bef\u5dee RMS\uff09", loops: "\u56de\u73af", falses: "\u9519\u8bef",
      truth: "\u771f\u503c", est: "\u4f30\u8ba1", loopL: "\u56de\u73af", falseL: "\u9519\u8bef\u56de\u73af",
      tapped: "\u5df2\u9009\u4f4d\u59ff", hint: "\u70b9\u51fb\u4e00\u4e2a\u4f4d\u59ff\uff0c\u518d\u70b9\u51fb\u53e6\u4e00\u4e2a\u4f4d\u59ff\uff0c\u5373\u53ef\u5728\u4e24\u8005\u4e4b\u95f4\u6dfb\u52a0\u56de\u73af\u3002\u4f4d\u59ff 0\uff08\u9ed1\u8272\uff09\u56fa\u5b9a\u3002",
      chart: "\u6bcf\u6b21\u8fed\u4ee3\u7684\u4ee3\u4ef7\uff08\u5bf9\u6570\uff09", per: "\u6bcf\u6b65", wmin: "\u6700\u5c0f\u56de\u73af\u6743\u91cd", converged: "\u5df2\u6536\u655b"
    },
    ja: {
      sth: "\u65b9\u4f4d\u30ce\u30a4\u30ba", sd: "\u8ddd\u96e2\u30ce\u30a4\u30ba", noise: "\u30ce\u30a4\u30ba\u3092\u518d\u751f\u6210", auto: "\u30eb\u30fc\u30d7\u9589\u3058\u8fbc\u307f\u3092\u8ffd\u52a0", wrong: "\u8aa4\u3063\u305f\u30eb\u30fc\u30d7\u3092\u8ffd\u52a0",
      clear: "\u30eb\u30fc\u30d7\u3092\u524a\u9664", step: "GN \u3092 1 \u56de", run: "\u6700\u9069\u5316", reset: "\u30aa\u30c9\u30e1\u30c8\u30ea\u306b\u623b\u3059", kernel: "\u30ab\u30fc\u30cd\u30eb",
      iter: "\u53cd\u5fa9", cost: "\u30b3\u30b9\u30c8", ate: "ATE\uff08\u4f4d\u7f6e\u8aa4\u5dee\u306e RMS\uff09", loops: "\u30eb\u30fc\u30d7\u9589\u3058\u8fbc\u307f", falses: "\u8aa4\u308a",
      truth: "\u771f\u5024", est: "\u63a8\u5b9a", loopL: "\u30eb\u30fc\u30d7\u9589\u3058\u8fbc\u307f", falseL: "\u8aa4\u3063\u305f\u30eb\u30fc\u30d7",
      tapped: "\u9078\u629e\u3057\u305f\u59ff\u52e2", hint: "\u59ff\u52e2\u3092\u30bf\u30c3\u30d7\u3057\u3001\u7d9a\u3051\u3066\u5225\u306e\u59ff\u52e2\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u3001\u305d\u306e\u9593\u306b\u30eb\u30fc\u30d7\u9589\u3058\u8fbc\u307f\u3092\u8ffd\u52a0\u3057\u307e\u3059\u3002\u59ff\u52e2 0\uff08\u9ed2\uff09\u306f\u56fa\u5b9a\u3067\u3059\u3002",
      chart: "\u53cd\u5fa9\u3054\u3068\u306e\u30b3\u30b9\u30c8\uff08\u5bfe\u6570\uff09", per: "1 \u30b9\u30c6\u30c3\u30d7\u3042\u305f\u308a", wmin: "\u30eb\u30fc\u30d7\u306e\u6700\u5c0f\u306e\u91cd\u307f", converged: "\u53ce\u675f"
    }
  };
  var COL = { truth: "rgba(0,0,0,0.13)", est: "#9467bd", loop: "#2ca02c", bad: "#d62728", odo: "#9467bd", sel: "#ff7f0e" };
  var N = 100, LAPS = 1.25, CAUCHY_C = 3.0, SIG_LOOP_T = 0.05, SIG_LOOP_R = 1.0 * Math.PI / 180;

  // ---------- SE(2) helpers ----------
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function compose(a, b) {           // a * b
    var c = Math.cos(a.th), s = Math.sin(a.th);
    return { x: a.x + c * b.x - s * b.y, y: a.y + s * b.x + c * b.y, th: wrap(a.th + b.th) };
  }
  function between(a, b) {           // a^-1 * b
    var c = Math.cos(a.th), s = Math.sin(a.th), dx = b.x - a.x, dy = b.y - a.y;
    return { x: c * dx + s * dy, y: -s * dx + c * dy, th: wrap(b.th - a.th) };
  }
  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  // error and Jacobians of one edge (Grisetti et al., "A tutorial on graph-based SLAM")
  function edgeError(Xi, Xj, Z) {
    var ci = Math.cos(Xi.th), si = Math.sin(Xi.th), cz = Math.cos(Z.th), sz = Math.sin(Z.th);
    var dx = Xj.x - Xi.x, dy = Xj.y - Xi.y;
    var ux = ci * dx + si * dy - Z.x, uy = -si * dx + ci * dy - Z.y;   // R_i^T (t_j - t_i) - t_ij
    var e = [cz * ux + sz * uy, -sz * ux + cz * uy, wrap(Xj.th - Xi.th - Z.th)];
    // d/d theta_i of R_i^T (t_j - t_i)
    var gx = -si * dx + ci * dy, gy = -ci * dx - si * dy;
    var A = [
      [-(cz * ci - sz * si), -(cz * si + sz * ci), cz * gx + sz * gy],
      [-(-sz * ci - cz * si), -(-sz * si + cz * ci), -sz * gx + cz * gy],
      [0, 0, -1]
    ];
    var B = [
      [cz * ci - sz * si, cz * si + sz * ci, 0],
      [-sz * ci - cz * si, -sz * si + cz * ci, 0],
      [0, 0, 1]
    ];
    return { e: e, A: A, B: B };
  }
  function cholSolve(H, g, n) {      // solve H x = g, H symmetric positive definite (dense)
    var L = new Float64Array(n * n), i, j, k, s;
    for (i = 0; i < n; i++) {
      for (j = 0; j <= i; j++) {
        s = H[i * n + j];
        for (k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
        if (i === j) { if (s <= 1e-12) return null; L[i * n + i] = Math.sqrt(s); }
        else L[i * n + j] = s / L[j * n + j];
      }
    }
    var y = new Float64Array(n), x = new Float64Array(n);
    for (i = 0; i < n; i++) { s = g[i]; for (k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
    for (i = n - 1; i >= 0; i--) { s = y[i]; for (k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
    return x;
  }

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.innerHTML = "";
    root.style.background = "#fbfbfd";
    root.style.color = "#222";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.fontSize = "14px";

    var S = { sth: 1.0, sd: 3, kernel: "l2" };
    var truth = [], odo = [], est = [], loops = [], hist = [], iter = 0, sel = -1, running = false, conv = false;

    // ---------- controls ----------
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:8px 10px 4px";
    root.appendChild(bar);
    function btn(txt, cb, parent) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = txt;
      b.style.cssText = "font:inherit;padding:3px 9px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222;cursor:pointer;touch-action:manipulation";
      b.addEventListener("click", cb);
      (parent || bar).appendChild(b);
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
    slider(T.sth, 0, 3, 0.1, S.sth, function (v) { return v.toFixed(1) + "\u00b0"; }, function (v) { S.sth = v; newOdometry(false); });
    slider(T.sd, 0, 10, 0.5, S.sd, function (v) { return v.toFixed(1) + " cm"; }, function (v) { S.sd = v; newOdometry(false); });
    btn(T.noise, function () { newOdometry(true); });
    var kl = document.createElement("label");
    kl.style.cssText = "display:flex;align-items:center;gap:5px";
    kl.appendChild(document.createTextNode(T.kernel));
    var sel_ = document.createElement("select");
    sel_.style.cssText = "font:inherit;padding:2px 4px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222";
    [["l2", "L2"], ["cauchy", "Cauchy (c = 3)"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; sel_.appendChild(op);
    });
    sel_.addEventListener("change", function () { S.kernel = sel_.value; resetEstimate(); });
    kl.appendChild(sel_); bar.appendChild(kl);
    var bar2 = document.createElement("div");
    bar2.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;padding:2px 10px 4px";
    root.appendChild(bar2);
    btn(T.auto, function () { addAutoLoops(); }, bar2);
    btn(T.wrong, function () { addFalseLoop(); }, bar2);
    btn(T.clear, function () { loops = []; sel = -1; resetEstimate(); }, bar2);
    btn(T.step, function () { running = false; gnStep(); draw(); }, bar2);
    var runBtn = btn(T.run, function () { if (!running) { running = true; loop(); } }, bar2);
    btn(T.reset, function () { resetEstimate(); }, bar2);

    // ---------- canvases ----------
    var leg = document.createElement("div");
    leg.style.cssText = "display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center;padding:2px 10px;font-size:12px;color:#333";
    [[COL.truth, T.truth, 6, "solid"], [COL.est, T.est, 2, "solid"], [COL.loop, T.loopL, 2, "solid"], [COL.bad, T.falseL, 2, "dashed"]].forEach(function (it) {
      var s = document.createElement("span");
      s.style.cssText = "display:inline-flex;align-items:center;gap:5px";
      var sw = document.createElement("span");
      sw.style.cssText = "display:inline-block;width:20px;border-top:" + it[2] + "px " + it[3] + " " + it[0];
      s.appendChild(sw); s.appendChild(document.createTextNode(it[1]));
      leg.appendChild(s);
    });
    root.appendChild(leg);
    var row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;padding:4px 10px 10px;align-items:flex-start";
    root.appendChild(row);
    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;touch-action:none;cursor:pointer;border-radius:6px;background:#fff;box-shadow:0 0 0 1px #ddd";
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
    var W = 300, H = 200, CW = 300, CH = 110, lastW = -1;

    function resize() {
      var w = Math.max(260, root.clientWidth - 20);
      if (w === lastW) return;
      lastW = w;
      var wide = w >= 680;
      W = wide ? Math.round(w * 0.62) : w;
      H = Math.round(W * 0.5);
      CW = wide ? w - W - 8 : w;
      CH = wide ? Math.round(H * 0.45) : 110;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.width = W + "px"; cv.style.height = H + "px";
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ch.style.width = CW + "px"; ch.style.height = CH + "px";
      ch.width = Math.round(CW * dpr); ch.height = Math.round(CH * dpr);
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    // view: fit the truth and the current estimate (at least x in [-12, 12], y in [-5.5, 5.5] metres)
    var view = { cx: 0, cy: 0, s: 20 };
    function fitView() {
      var x0 = -12, x1 = 12, y0 = -5.5, y1 = 5.5, k, P = truth.concat(est);
      for (k = 0; k < P.length; k++) {
        x0 = Math.min(x0, P[k].x - 0.8); x1 = Math.max(x1, P[k].x + 0.8);
        y0 = Math.min(y0, P[k].y - 0.8); y1 = Math.max(y1, P[k].y + 0.8);
      }
      view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
      view.s = Math.min((W - 16) / (x1 - x0), (H - 16) / (y1 - y0));
    }
    function PX(x) { return W / 2 + (x - view.cx) * view.s; }
    function PY(y) { return H / 2 - (y - view.cy) * view.s; }

    // ---------- data ----------
    function makeTruth() {
      truth = [];
      for (var k = 0; k < N; k++) {
        var t = 2 * Math.PI * LAPS * k / N;
        var x = 10 * Math.sin(t), y = 8 * Math.sin(t) * Math.cos(t);
        var dx = 10 * Math.cos(t), dy = 8 * Math.cos(2 * t);
        truth.push({ x: x, y: y, th: Math.atan2(dy, dx) });
      }
    }
    var noiseSeed = [];
    function newOdometry(resample) {
      if (resample || noiseSeed.length !== N - 1) {
        noiseSeed = [];
        for (var k = 0; k < N - 1; k++) noiseSeed.push([gauss(), gauss(), gauss()]);
      }
      var sd = Math.max(S.sd, 0.1) / 100, st = Math.max(S.sth, 0.05) * Math.PI / 180;
      odo = [];
      for (var i = 0; i < N - 1; i++) {
        var Z = between(truth[i], truth[i + 1]), n = noiseSeed[i];
        odo.push({ i: i, j: i + 1, Z: { x: Z.x + n[0] * S.sd / 100, y: Z.y + n[1] * S.sd / 100, th: wrap(Z.th + n[2] * S.sth * Math.PI / 180) },
                   om: [1 / (sd * sd), 1 / (sd * sd), 1 / (st * st)], bad: false });
      }
      resetEstimate();
    }
    function resetEstimate() {
      est = [{ x: truth[0].x, y: truth[0].y, th: truth[0].th }];
      for (var i = 0; i < odo.length; i++) est.push(compose(est[i], odo[i].Z));
      hist = []; iter = 0; running = false; conv = false;
      hist.push(totalCost());
      draw();
    }
    function loopEdge(i, j, bad) {
      var Z;
      if (bad) Z = { x: 0.3, y: 0, th: 0 };                // "these two places look the same"
      else {
        Z = between(truth[i], truth[j]);
        Z = { x: Z.x + gauss() * SIG_LOOP_T, y: Z.y + gauss() * SIG_LOOP_T, th: wrap(Z.th + gauss() * SIG_LOOP_R) };
      }
      return { i: Math.min(i, j), j: Math.max(i, j), Z: Z, om: [1 / (SIG_LOOP_T * SIG_LOOP_T), 1 / (SIG_LOOP_T * SIG_LOOP_T), 1 / (SIG_LOOP_R * SIG_LOOP_R)], bad: bad };
    }
    function hasLoop(i, j) {
      for (var k = 0; k < loops.length; k++) if (loops[k].i === Math.min(i, j) && loops[k].j === Math.max(i, j)) return true;
      return false;
    }
    function addAutoLoops() {
      for (var j = 0; j < N; j++) {
        for (var i = 0; i < j - 8; i++) {
          var d = Math.hypot(truth[i].x - truth[j].x, truth[i].y - truth[j].y);
          if (d < 0.8 && j % 3 === 0 && !hasLoop(i, j)) loops.push(loopEdge(i, j, false));
        }
      }
      resetEstimate();
    }
    function addFalseLoop() {
      for (var tries = 0; tries < 200; tries++) {
        var i = Math.floor(Math.random() * N), j = Math.floor(Math.random() * N);
        if (Math.abs(i - j) < 10) continue;
        if (Math.hypot(truth[i].x - truth[j].x, truth[i].y - truth[j].y) < 6) continue;
        if (hasLoop(i, j)) continue;
        loops.push(loopEdge(i, j, true));
        break;
      }
      resetEstimate();
    }
    function allEdges() { return odo.concat(loops); }
    function edgeWeight(e2) { return S.kernel === "cauchy" ? 1 / (1 + e2 / (CAUCHY_C * CAUCHY_C)) : 1; }
    function edgeCost(e2) { return S.kernel === "cauchy" ? CAUCHY_C * CAUCHY_C * Math.log(1 + e2 / (CAUCHY_C * CAUCHY_C)) : e2; }
    function maha(ed) {
      var r = edgeError(est[ed.i], est[ed.j], ed.Z).e;
      return r[0] * r[0] * ed.om[0] + r[1] * r[1] * ed.om[1] + r[2] * r[2] * ed.om[2];
    }
    function totalCost() {
      var E = allEdges(), c = 0;
      for (var k = 0; k < E.length; k++) c += edgeCost(maha(E[k]));
      return c;
    }
    function gnStep() {
      var n = 3 * (N - 1), Hm = new Float64Array(n * n), g = new Float64Array(n), E = allEdges();
      for (var k = 0; k < E.length; k++) {
        var ed = E[k], r = edgeError(est[ed.i], est[ed.j], ed.Z), om = ed.om;
        var e2 = r.e[0] * r.e[0] * om[0] + r.e[1] * r.e[1] * om[1] + r.e[2] * r.e[2] * om[2];
        var w = edgeWeight(e2);
        var blocks = [[ed.i, r.A], [ed.j, r.B]];
        for (var a = 0; a < 2; a++) {
          var va = blocks[a][0]; if (va === 0) continue;            // pose 0 is fixed
          var Ja = blocks[a][1], oa = 3 * (va - 1);
          for (var p = 0; p < 3; p++) {
            var s = 0;
            for (var q = 0; q < 3; q++) s += Ja[q][p] * om[q] * r.e[q];
            g[oa + p] -= w * s;
          }
          for (var b = 0; b < 2; b++) {
            var vb = blocks[b][0]; if (vb === 0) continue;
            var Jb = blocks[b][1], ob = 3 * (vb - 1);
            for (p = 0; p < 3; p++) for (var m = 0; m < 3; m++) {
              var t = 0;
              for (q = 0; q < 3; q++) t += Ja[q][p] * om[q] * Jb[q][m];
              Hm[(oa + p) * n + ob + m] += w * t;
            }
          }
        }
      }
      var dx = cholSolve(Hm, g, n);
      if (!dx) return;
      var norm = 0;
      for (var v = 1; v < N; v++) {
        var o = 3 * (v - 1);
        est[v] = { x: est[v].x + dx[o], y: est[v].y + dx[o + 1], th: wrap(est[v].th + dx[o + 2]) };
        norm += dx[o] * dx[o] + dx[o + 1] * dx[o + 1];
      }
      iter++;
      var c = totalCost();
      conv = Math.sqrt(norm) < 1e-4 || (hist.length && Math.abs(hist[hist.length - 1] - c) < 1e-6 * Math.max(1, c));
      hist.push(c);
    }
    var lastT = 0;
    function loop(ts) {
      if (!running) return;
      if (!ts || ts - lastT > 260) {
        lastT = ts || 0;
        gnStep(); draw();
        if (conv || iter >= 40) { running = false; draw(); return; }
      }
      requestAnimationFrame(loop);
    }
    function ate() {
      var s = 0;
      for (var k = 0; k < N; k++) s += Math.pow(est[k].x - truth[k].x, 2) + Math.pow(est[k].y - truth[k].y, 2);
      return Math.sqrt(s / N);
    }

    // ---------- drawing ----------
    function poly(P, color, lw) {
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
      for (var k = 0; k < P.length; k++) { if (k) ctx.lineTo(PX(P[k].x), PY(P[k].y)); else ctx.moveTo(PX(P[k].x), PY(P[k].y)); }
      ctx.stroke();
    }
    function draw() {
      if (!est.length) return;
      fitView();
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#f0f0f0"; ctx.lineWidth = 1;
      var gxa = 2 * Math.floor((view.cx - W / 2 / view.s) / 2), gya = 2 * Math.floor((view.cy - H / 2 / view.s) / 2);
      for (var gx = gxa; PX(gx) <= W; gx += 2) { ctx.beginPath(); ctx.moveTo(PX(gx), 0); ctx.lineTo(PX(gx), H); ctx.stroke(); }
      for (var gy = gya; PY(gy) >= 0; gy += 2) { ctx.beginPath(); ctx.moveTo(0, PY(gy)); ctx.lineTo(W, PY(gy)); ctx.stroke(); }
      poly(truth, COL.truth, 7);
      for (var k = 0; k < loops.length; k++) {
        var L = loops[k];
        ctx.strokeStyle = L.bad ? COL.bad : COL.loop; ctx.lineWidth = L.bad ? 2.5 : 2;
        ctx.setLineDash(L.bad ? [6, 4] : []);
        ctx.beginPath(); ctx.moveTo(PX(est[L.i].x), PY(est[L.i].y)); ctx.lineTo(PX(est[L.j].x), PY(est[L.j].y)); ctx.stroke();
        ctx.setLineDash([]);
      }
      poly(est, COL.est, 2);
      for (k = 0; k < N; k++) {
        var p = est[k], r = k === 0 ? 4.5 : 2.6;
        ctx.fillStyle = k === 0 ? "#000" : COL.est;
        ctx.beginPath(); ctx.arc(PX(p.x), PY(p.y), r, 0, 2 * Math.PI); ctx.fill();
        if (k % 4 === 0) {           // heading tick
          ctx.strokeStyle = COL.est; ctx.lineWidth = 1.3; ctx.beginPath();
          ctx.moveTo(PX(p.x), PY(p.y)); ctx.lineTo(PX(p.x + 0.6 * Math.cos(p.th)), PY(p.y + 0.6 * Math.sin(p.th))); ctx.stroke();
        }
      }
      if (sel >= 0) {
        ctx.strokeStyle = COL.sel; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(PX(est[sel].x), PY(est[sel].y), 8, 0, 2 * Math.PI); ctx.stroke();
      }
      drawChart();
      writeInfo();
    }
    function drawChart() {
      cctx.clearRect(0, 0, CW, CH);
      cctx.fillStyle = "#fff"; cctx.fillRect(0, 0, CW, CH);
      var l = 36, rt = 8, tp = 18, b = 18;
      cctx.fillStyle = "#555"; cctx.font = "11px system-ui, sans-serif"; cctx.textBaseline = "top"; cctx.textAlign = "left";
      cctx.fillText(T.chart, l, 3);
      if (!hist.length) return;
      var lo = Infinity, hi = -Infinity, k;
      for (k = 0; k < hist.length; k++) { var v = Math.log10(Math.max(hist[k], 1e-3)); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      lo = Math.floor(lo); hi = Math.max(Math.ceil(hi), lo + 1);
      var xmax = Math.max(8, hist.length - 1);
      function cx(i) { return l + i / xmax * (CW - l - rt); }
      function cy(v) { return CH - b - (Math.log10(Math.max(v, 1e-3)) - lo) / (hi - lo) * (CH - tp - b); }
      cctx.strokeStyle = "#999"; cctx.lineWidth = 1;
      cctx.beginPath(); cctx.moveTo(l, tp); cctx.lineTo(l, CH - b); cctx.lineTo(CW - rt, CH - b); cctx.stroke();
      cctx.textAlign = "right"; cctx.textBaseline = "middle";
      cctx.fillText("1e" + hi, l - 3, tp); cctx.fillText("1e" + lo, l - 3, CH - b);
      cctx.textAlign = "center"; cctx.textBaseline = "top";
      cctx.fillText("0", cx(0), CH - b + 3); cctx.fillText(String(xmax), cx(xmax), CH - b + 3);
      cctx.strokeStyle = COL.est; cctx.lineWidth = 2; cctx.beginPath();
      for (k = 0; k < hist.length; k++) { if (k) cctx.lineTo(cx(k), cy(hist[k])); else cctx.moveTo(cx(k), cy(hist[k])); }
      cctx.stroke();
      cctx.fillStyle = COL.est;
      for (k = 0; k < hist.length; k++) { cctx.beginPath(); cctx.arc(cx(k), cy(hist[k]), 2.5, 0, 2 * Math.PI); cctx.fill(); }
    }
    function fmt(v) { return v >= 1e4 ? v.toExponential(2) : v.toFixed(1); }
    function writeInfo() {
      var nb = 0, wmin = 1;
      for (var k = 0; k < loops.length; k++) {
        if (loops[k].bad) nb++;
        wmin = Math.min(wmin, edgeWeight(maha(loops[k])));
      }
      info.innerHTML =
        "<b>" + T.iter + " " + iter + "</b>" + (conv ? ' <span style="color:#2ca02c">(' + T.converged + ")</span>" : "") + "<br>" +
        T.cost + " = " + fmt(hist[hist.length - 1]) + "<br>" +
        T.ate + " = <b>" + ate().toFixed(3) + " m</b><br>" +
        T.loops + ": " + (loops.length - nb) + (nb ? ' + <span style="color:#d62728">' + nb + " " + T.falses + "</span>" : "") + "<br>" +
        (S.kernel === "cauchy" && loops.length ? T.wmin + " = " + wmin.toExponential(1) + "<br>" : "") +
        (sel >= 0 ? T.tapped + ": " + sel + "<br>" : "") +
        '<span style="color:#777">' + T.hint + "</span>";
    }

    // ---------- pointer ----------
    cv.addEventListener("pointerdown", function (e) {
      var rc = cv.getBoundingClientRect(), qx = e.clientX - rc.left, qy = e.clientY - rc.top, best = -1, bd = 16;
      for (var k = 0; k < N; k++) {
        var d = Math.hypot(PX(est[k].x) - qx, PY(est[k].y) - qy);
        if (d < bd) { bd = d; best = k; }
      }
      if (best < 0) { sel = -1; draw(); return; }
      if (sel < 0 || sel === best) { sel = best === sel ? -1 : best; draw(); return; }
      if (Math.abs(sel - best) >= 2 && !hasLoop(sel, best)) {
        loops.push(loopEdge(sel, best, false));
        sel = -1;
        resetEstimate();
      } else { sel = best; draw(); }
      e.preventDefault();
    });

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    makeTruth();
    newOdometry(true);
    resize();
  }

  function init() {
    document.querySelectorAll('[data-widget="3d-vision-pose-graph"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
