/* Bundle adjustment lab (3d-vision post 05).
   A small version of the post's scene: 6 cameras on an arc (f = 500 px, 640 x 480 images) look at 42
   points on the ground and on two boxes. World and cameras are OpenCV-style (y down). Observations get
   Gaussian pixel noise and optionally gross outliers; the estimate starts from a perturbed copy of the
   truth. One "step" is one Levenberg-Marquardt iteration exactly as in the post: per-observation
   Jacobians (pose update R <- exp([dw]x) R, t <- exp([dw]x) t + dt), the normal equations block by block,
   the Schur complement on the cameras (camera 1 held fixed), back-substitution for the points, Marquardt
   damping lambda * diag, accept (lambda / 3) or reject (lambda * 4). Robust kernels use IRLS weights.
   The 3D view shows the estimate after the remaining scale gauge is removed (scaled about camera 1). */
(function () {
  "use strict";
  var W = 640, H = 480, F = 500, CX = 320, CY = 240;
  var TXT = {
    en: {
      step: "LM step", run: "run", pause: "pause", reset: "new start", noise: "new noise",
      sigma: "noise \u03c3", outl: "outliers", init: "start error", kernel: "kernel",
      cam: "image of camera", iter: "iteration", rms: "RMS reprojection error of the inliers", lam: "\u03bb",
      acc: "accepted", rej: "rejected steps", sizes: "unknowns", schur: "Schur system",
      errC: "camera-centre error", errX: "point error", conv: "converged",
      hint: "Drag the 3D view to orbit. Gray: truth; blue/purple: estimate; red: point errors. In the image: dots are observations (red rings = outliers), purple crosses are predictions, lines are residuals.",
      chartY: "RMS (px)", chartX: "iteration", nobs: "observations"
    },
    zh: {
      step: "LM \u5355\u6b65", run: "\u8fd0\u884c", pause: "\u6682\u505c", reset: "\u91cd\u65b0\u521d\u59cb\u5316", noise: "\u91cd\u65b0\u751f\u6210\u566a\u58f0",
      sigma: "\u566a\u58f0 \u03c3", outl: "\u5916\u70b9", init: "\u521d\u59cb\u8bef\u5dee", kernel: "\u6838\u51fd\u6570",
      cam: "\u76f8\u673a\u56fe\u50cf", iter: "\u8fed\u4ee3", rms: "\u5185\u70b9\u7684 RMS \u91cd\u6295\u5f71\u8bef\u5dee", lam: "\u03bb",
      acc: "\u63a5\u53d7", rej: "\u88ab\u62d2\u7edd\u7684\u6b65", sizes: "\u672a\u77e5\u91cf", schur: "Schur \u7cfb\u7edf",
      errC: "\u76f8\u673a\u4e2d\u5fc3\u8bef\u5dee", errX: "\u70b9\u8bef\u5dee", conv: "\u5df2\u6536\u655b",
      hint: "\u62d6\u52a8 3D \u89c6\u56fe\u53ef\u65cb\u8f6c\u3002\u7070\u8272\uff1a\u771f\u503c\uff1b\u84dd/\u7d2b\uff1a\u4f30\u8ba1\uff1b\u7ea2\u7ebf\uff1a\u70b9\u7684\u8bef\u5dee\u3002\u56fe\u50cf\u4e2d\uff1a\u5706\u70b9\u662f\u89c2\u6d4b\uff08\u7ea2\u5708 = \u5916\u70b9\uff09\uff0c\u7d2b\u8272\u53c9\u662f\u9884\u6d4b\uff0c\u8fde\u7ebf\u662f\u6b8b\u5dee\u3002",
      chartY: "RMS (px)", chartX: "\u8fed\u4ee3", nobs: "\u4e2a\u89c2\u6d4b"
    },
    ja: {
      step: "LM 1 \u30b9\u30c6\u30c3\u30d7", run: "\u5b9f\u884c", pause: "\u4e00\u6642\u505c\u6b62", reset: "\u521d\u671f\u5024\u3092\u4f5c\u308a\u76f4\u3059", noise: "\u30ce\u30a4\u30ba\u3092\u518d\u751f\u6210",
      sigma: "\u30ce\u30a4\u30ba \u03c3", outl: "\u30a2\u30a6\u30c8\u30e9\u30a4\u30a2", init: "\u521d\u671f\u8aa4\u5dee", kernel: "\u30ab\u30fc\u30cd\u30eb",
      cam: "\u30ab\u30e1\u30e9\u306e\u753b\u50cf", iter: "\u53cd\u5fa9", rms: "\u30a4\u30f3\u30e9\u30a4\u30a2\u306e RMS \u518d\u6295\u5f71\u8aa4\u5dee", lam: "\u03bb",
      acc: "\u63a1\u7528", rej: "\u68c4\u5374\u3057\u305f\u30b9\u30c6\u30c3\u30d7", sizes: "\u672a\u77e5\u6570", schur: "Schur \u7cfb",
      errC: "\u30ab\u30e1\u30e9\u4e2d\u5fc3\u306e\u8aa4\u5dee", errX: "\u70b9\u306e\u8aa4\u5dee", conv: "\u53ce\u675f",
      hint: "3D \u30d3\u30e5\u30fc\u306f\u30c9\u30e9\u30c3\u30b0\u3067\u56de\u8ee2\u3057\u307e\u3059\u3002\u7070\u8272\uff1a\u771f\u5024\u3001\u9752/\u7d2b\uff1a\u63a8\u5b9a\u5024\u3001\u8d64\u7dda\uff1a\u70b9\u306e\u8aa4\u5dee\u3002\u753b\u50cf\u3067\u306f\u3001\u70b9\u304c\u89b3\u6e2c\uff08\u8d64\u3044\u8f2a = \u30a2\u30a6\u30c8\u30e9\u30a4\u30a2\uff09\u3001\u7d2b\u306e \u00d7 \u304c\u4e88\u6e2c\u3001\u7dda\u304c\u6b8b\u5dee\u3067\u3059\u3002",
      chartY: "RMS (px)", chartX: "\u53cd\u5fa9", nobs: "\u89b3\u6e2c"
    }
  };
  var COL = { truth: "#9a9a9a", cam: "#1f77b4", pt: "#9467bd", err: "#d62728", grid: "#e6e6ee",
    obs: "#222", out: "#d62728", lam: "#ff7f0e", dark: "#222" };

  // ---------------- small linear algebra ----------------
  function rodrigues(w) {
    var th = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]);
    if (th < 1e-12) return [1, -w[2], w[1], w[2], 1, -w[0], -w[1], w[0], 1];
    var kx = w[0] / th, ky = w[1] / th, kz = w[2] / th, s = Math.sin(th), c = 1 - Math.cos(th);
    return [1 - c * (ky * ky + kz * kz), -s * kz + c * kx * ky, s * ky + c * kx * kz,
      s * kz + c * kx * ky, 1 - c * (kx * kx + kz * kz), -s * kx + c * ky * kz,
      -s * ky + c * kx * kz, s * kx + c * ky * kz, 1 - c * (kx * kx + ky * ky)];
  }
  function mm3(A, B) {
    var R = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++)
      R[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
    return R;
  }
  function mv3(A, v) {
    return [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
      A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
  }
  function mtv3(A, v) { // A^T v
    return [A[0] * v[0] + A[3] * v[1] + A[6] * v[2], A[1] * v[0] + A[4] * v[1] + A[7] * v[2],
      A[2] * v[0] + A[5] * v[1] + A[8] * v[2]];
  }
  function inv3(M) {
    var a = M[0], b = M[1], c = M[2], d = M[3], e = M[4], f = M[5], g = M[6], h = M[7], k = M[8];
    var A = e * k - f * h, B = -(d * k - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-300) return null;
    return [A / det, -(b * k - c * h) / det, (b * f - c * e) / det,
      B / det, (a * k - c * g) / det, -(a * f - c * d) / det,
      C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }
  function solve(A, b, n) { // Gaussian elimination with partial pivoting; A is n*n row-major (copied)
    var M = A.slice(), x = b.slice(), i, j, k;
    for (i = 0; i < n; i++) {
      var p = i, best = Math.abs(M[i * n + i]);
      for (j = i + 1; j < n; j++) if (Math.abs(M[j * n + i]) > best) { best = Math.abs(M[j * n + i]); p = j; }
      if (best < 1e-300) return null;
      if (p !== i) {
        for (k = 0; k < n; k++) { var t = M[i * n + k]; M[i * n + k] = M[p * n + k]; M[p * n + k] = t; }
        var tb = x[i]; x[i] = x[p]; x[p] = tb;
      }
      for (j = i + 1; j < n; j++) {
        var f = M[j * n + i] / M[i * n + i];
        if (f === 0) continue;
        for (k = i; k < n; k++) M[j * n + k] -= f * M[i * n + k];
        x[j] -= f * x[i];
      }
    }
    for (i = n - 1; i >= 0; i--) {
      var s = x[i];
      for (k = i + 1; k < n; k++) s -= M[i * n + k] * x[k];
      x[i] = s / M[i * n + i];
    }
    return x;
  }

  // ---------------- random numbers (seeded) ----------------
  function makeRng(seed) {
    var a = seed >>> 0;
    function u() {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      u: u,
      g: function () { var p = 1 - u(), q = u(); return Math.sqrt(-2 * Math.log(p)) * Math.cos(2 * Math.PI * q); }
    };
  }

  // ---------------- scene ----------------
  function lookAt(C, T) {
    var z = [T[0] - C[0], T[1] - C[1], T[2] - C[2]], L = Math.hypot(z[0], z[1], z[2]);
    z = [z[0] / L, z[1] / L, z[2] / L];
    var x = [-z[2], 0, z[0]]; // z x (0, -1, 0)
    L = Math.hypot(x[0], x[1], x[2]); x = [x[0] / L, x[1] / L, x[2] / L];
    var y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    var R = [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
    var t = mv3(R, C);
    return { R: R, t: [-t[0], -t[1], -t[2]] };
  }
  function boxPoints(lo, hi, n, rng, out) {
    for (var i = 0; i < n; i++) {
      var p = [lo[0] + rng.u() * (hi[0] - lo[0]), lo[1] + rng.u() * (hi[1] - lo[1]), lo[2] + rng.u() * (hi[2] - lo[2])];
      var ax = Math.floor(rng.u() * 3), side = rng.u() < 0.5;
      if (ax === 1 && side) side = false; // no points on the hidden bottom face
      p[ax] = side ? hi[ax] : lo[ax];
      out.push(p);
    }
  }
  function makeScene() {
    var rng = makeRng(5), X = [], i;
    for (i = 0; i < 14; i++) X.push([-2 + 4 * rng.u(), 0, -2 + 4 * rng.u()]);
    boxPoints([-1.3, -1.0, -0.6], [-0.3, 0.0, 0.4], 14, rng, X);
    boxPoints([0.3, -1.6, -0.9], [1.3, 0.0, 0.1], 14, rng, X);
    var cams = [];
    for (i = 0; i < 6; i++) {
      var a = (-60 + 24 * i) * Math.PI / 180;
      cams.push(lookAt([5 * Math.sin(a), -2, -5 * Math.cos(a)], [0, -0.5, 0]));
    }
    return { X: X, cams: cams };
  }
  var SCENE = makeScene();

  function projectJac(cam, X, wantJ) {
    var Xc = mv3(cam.R, X);
    Xc[0] += cam.t[0]; Xc[1] += cam.t[1]; Xc[2] += cam.t[2];
    var x = Xc[0], y = Xc[1], z = Xc[2];
    var res = { u: F * x / z + CX, v: F * y / z + CY, z: z };
    if (!wantJ) return res;
    var d = [F / z, 0, -F * x / (z * z), 0, F / z, -F * y / (z * z)]; // d pixel / d Xc (2 x 3)
    var S = [0, z, -y, -z, 0, x, y, -x, 0];                           // -[Xc]x
    var Jc = new Array(12), Jx = new Array(6), r, c;
    for (r = 0; r < 2; r++) {
      for (c = 0; c < 3; c++) {
        Jc[6 * r + c] = d[3 * r] * S[c] + d[3 * r + 1] * S[3 + c] + d[3 * r + 2] * S[6 + c];
        Jc[6 * r + 3 + c] = d[3 * r + c];
        Jx[3 * r + c] = d[3 * r] * cam.R[c] + d[3 * r + 1] * cam.R[3 + c] + d[3 * r + 2] * cam.R[6 + c];
      }
    }
    res.Jc = Jc; res.Jx = Jx;
    return res;
  }
  function kernelRhoW(s, kernel, delta) {
    if (kernel === "huber") {
      var r = Math.sqrt(s);
      return r <= delta ? [s, 1] : [2 * delta * r - delta * delta, delta / r];
    }
    if (kernel === "cauchy") return [delta * delta * Math.log(1 + s / (delta * delta)), 1 / (1 + s / (delta * delta))];
    return [s, 1];
  }

  function setup(root) {
    var T = TXT[root.dataset.lang] || TXT.en;
    root.innerHTML = "";
    root.style.background = "#fbfbfd";
    root.style.color = "#222";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.fontSize = "14px";

    var m = SCENE.cams.length, n = SCENE.X.length;
    var S = { sigma: 0.5, outl: 0, init: 1, kernel: "l2", camSel: 2 };
    var obs = [], est = null, hist = [], lam = 1e-3, k = 0, rejected = 0, running = false, converged = false;
    var noiseSeed = 11, initSeed = 3;
    var yaw = -0.5, pitch = 0.55, drag = null;

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
      inp.style.width = "88px";
      function show() { sp.textContent = txt + " " + fmt(+inp.value); }
      inp.addEventListener("input", function () { show(); cb(+inp.value); });
      show();
      l.appendChild(sp); l.appendChild(inp); bar.appendChild(l);
      return inp;
    }
    btn(T.step, function () { stopRun(); step(); draw(); });
    var runBtn = btn(T.run, function () {
      if (running) { stopRun(); return; }
      if (converged) restart(false);
      running = true; runBtn.textContent = T.pause; loop();
    });
    btn(T.reset, function () { initSeed++; restart(false); });
    btn(T.noise, function () { noiseSeed++; restart(true); });
    slider(T.sigma, 0, 3, 0.1, S.sigma, function (v) { return v.toFixed(1) + " px"; }, function (v) { S.sigma = v; restart(true); });
    slider(T.outl, 0, 0.3, 0.01, S.outl, function (v) { return Math.round(100 * v) + "%"; }, function (v) { S.outl = v; restart(true); });
    slider(T.init, 0, 3, 0.1, S.init, function (v) { return "\u00d7" + v.toFixed(1); }, function (v) { S.init = v; restart(false); });
    var kl = document.createElement("label");
    kl.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap";
    kl.appendChild(document.createTextNode(T.kernel));
    var sel = document.createElement("select");
    sel.style.cssText = "font:inherit;padding:2px 4px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222";
    [["l2", "L2"], ["huber", "Huber"], ["cauchy", "Cauchy"]].forEach(function (o) {
      var e = document.createElement("option"); e.value = o[0]; e.textContent = o[1]; sel.appendChild(e);
    });
    sel.addEventListener("change", function () { S.kernel = sel.value; restart(false); });
    kl.appendChild(sel); bar.appendChild(kl);

    // ---------- canvases ----------
    var row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;padding:4px 10px 10px;align-items:flex-start";
    root.appendChild(row);
    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;touch-action:none;cursor:grab;border-radius:6px;background:#fff;box-shadow:0 0 0 1px #ddd";
    row.appendChild(cv);
    var side = document.createElement("div");
    side.style.cssText = "flex:1 1 240px;min-width:0";
    row.appendChild(side);
    var camRow = document.createElement("div");
    camRow.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding-bottom:4px";
    side.appendChild(camRow);
    camRow.appendChild(document.createTextNode(T.cam + ":"));
    var camBtns = [];
    for (var ci = 0; ci < m; ci++) {
      (function (i) { camBtns.push(btn(String(i + 1), function () { S.camSel = i; draw(); }, camRow)); })(ci);
    }
    var iv = document.createElement("canvas");
    iv.style.cssText = "display:block;border-radius:6px;background:#fff;box-shadow:0 0 0 1px #ddd";
    side.appendChild(iv);
    var ch = document.createElement("canvas");
    ch.style.cssText = "display:block;margin-top:6px;border-radius:6px;background:#fff;box-shadow:0 0 0 1px #ddd";
    side.appendChild(ch);
    var info = document.createElement("div");
    info.style.cssText = "padding:6px 2px 0;line-height:1.55;font-variant-numeric:tabular-nums";
    side.appendChild(info);
    var hint = document.createElement("div");
    hint.style.cssText = "padding:2px 10px 8px;color:#666;font-size:13px;line-height:1.45";
    hint.textContent = T.hint;
    root.appendChild(hint);
    var ctx = cv.getContext("2d"), ictx = iv.getContext("2d"), cctx = ch.getContext("2d");
    var SW = 300, SH = 300, IW = 300, IH = 225, CW = 300, CH = 110, lastW = -1;

    function resize() {
      var w = Math.max(260, root.clientWidth - 20);
      if (w === lastW) return;
      lastW = w;
      var wide = w >= 640;
      SW = wide ? Math.round(w * 0.56) : w;
      SH = wide ? Math.round(SW * 0.86) : Math.round(w * 0.8);
      IW = wide ? w - SW - 8 : w;
      IH = Math.round(IW * 0.75);
      if (wide && IH > SH * 0.62) { IH = Math.round(SH * 0.62); }
      CW = IW; CH = wide ? 110 : 100;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      [[cv, ctx, SW, SH], [iv, ictx, IW, IH], [ch, cctx, CW, CH]].forEach(function (a) {
        a[0].style.width = a[2] + "px"; a[0].style.height = a[3] + "px";
        a[0].width = Math.round(a[2] * dpr); a[0].height = Math.round(a[3] * dpr);
        a[1].setTransform(dpr, 0, 0, dpr, 0, 0);
      });
      draw();
    }

    // ---------- data ----------
    function makeObs() {
      var rng = makeRng(1000 + noiseSeed);
      obs = [];
      for (var i = 0; i < m; i++) {
        for (var j = 0; j < n; j++) {
          var p = projectJac(SCENE.cams[i], SCENE.X[j], false);
          if (p.z <= 0 || p.u < 0 || p.u >= W || p.v < 0 || p.v >= H) continue;
          var o = { i: i, j: j, u: p.u + S.sigma * rng.g(), v: p.v + S.sigma * rng.g(), out: false };
          if (rng.u() < S.outl) {
            var a = rng.u() * 2 * Math.PI, d = 10 + 50 * rng.u();
            o.u += d * Math.cos(a); o.v += d * Math.sin(a); o.out = true;
          }
          obs.push(o);
        }
      }
    }
    function makeInit() {
      var rng = makeRng(500 + initSeed), s = S.init;
      var cams = SCENE.cams.map(function (c, i) {
        if (i === 0) return { R: c.R.slice(), t: c.t.slice() };
        var dR = rodrigues([rng.g() * 0.035 * s, rng.g() * 0.035 * s, rng.g() * 0.035 * s]);
        var C = mtv3(c.R, c.t);
        C = [-C[0] + 0.15 * s * rng.g(), -C[1] + 0.15 * s * rng.g(), -C[2] + 0.15 * s * rng.g()];
        var R = mm3(dR, c.R), t = mv3(R, C);
        return { R: R, t: [-t[0], -t[1], -t[2]] };
      });
      var X = SCENE.X.map(function (p) { return [p[0] + 0.15 * s * rng.g(), p[1] + 0.15 * s * rng.g(), p[2] + 0.15 * s * rng.g()]; });
      est = { cams: cams, X: X };
    }
    function cost(e) {
      var c = 0, sq = 0, cnt = 0;
      for (var q = 0; q < obs.length; q++) {
        var o = obs[q], p = projectJac(e.cams[o.i], e.X[o.j], false);
        var du = p.u - o.u, dv = p.v - o.v, s2 = du * du + dv * dv;
        if (p.z <= 0) s2 = 1e8;
        c += kernelRhoW(s2, S.kernel, 1.0)[0];
        if (!o.out) { sq += s2; cnt++; }
      }
      return { c: c, rmsIn: Math.sqrt(sq / Math.max(cnt, 1)) };
    }
    function restart(newObs) {
      stopRun();
      if (newObs || !obs.length) makeObs();
      makeInit();
      lam = 1e-3; k = 0; rejected = 0; converged = false;
      var c0 = cost(est);
      hist = [{ c: c0.c, rms: Math.sqrt(c0.c / obs.length), rmsIn: c0.rmsIn, lam: lam }];
      draw();
    }

    // ---------- one LM iteration with the Schur complement ----------
    function trialStep(e, lamv) {
      var nc = 6 * m, i, j, a, b, q;
      var B = [], gc = [], C = [], gp = [], Eb = [];
      for (i = 0; i < m; i++) { B.push(new Float64Array(36)); gc.push(new Float64Array(6)); }
      for (j = 0; j < n; j++) { C.push(new Float64Array(9)); gp.push(new Float64Array(3)); }
      for (q = 0; q < obs.length; q++) {
        var o = obs[q], p = projectJac(e.cams[o.i], e.X[o.j], true);
        var r0 = p.u - o.u, r1 = p.v - o.v, w = kernelRhoW(r0 * r0 + r1 * r1, S.kernel, 1.0)[1];
        var Jc = p.Jc, Jx = p.Jx, Bi = B[o.i], Cj = C[o.j], E = new Float64Array(18);
        for (a = 0; a < 6; a++) {
          for (b = 0; b < 6; b++) Bi[6 * a + b] += w * (Jc[a] * Jc[b] + Jc[6 + a] * Jc[6 + b]);
          gc[o.i][a] += w * (Jc[a] * r0 + Jc[6 + a] * r1);
          for (b = 0; b < 3; b++) E[3 * a + b] = w * (Jc[a] * Jx[b] + Jc[6 + a] * Jx[3 + b]);
        }
        for (a = 0; a < 3; a++) {
          for (b = 0; b < 3; b++) Cj[3 * a + b] += w * (Jx[a] * Jx[b] + Jx[3 + a] * Jx[3 + b]);
          gp[o.j][a] += w * (Jx[a] * r0 + Jx[3 + a] * r1);
        }
        Eb.push(E);
      }
      for (i = 0; i < m; i++) for (a = 0; a < 6; a++) B[i][7 * a] *= 1 + lamv;
      var Ci = [];
      for (j = 0; j < n; j++) {
        for (a = 0; a < 3; a++) C[j][4 * a] *= 1 + lamv;
        Ci.push(inv3(Array.prototype.slice.call(C[j])));
        if (!Ci[j]) return null;
      }
      // S = B - sum_j E_j C_j^-1 E_j^T,  rhs = -g_c + sum_j E_j C_j^-1 g_pj
      var Sm = new Float64Array(nc * nc), rhs = new Float64Array(nc);
      for (i = 0; i < m; i++) for (a = 0; a < 6; a++) {
        for (b = 0; b < 6; b++) Sm[(6 * i + a) * nc + 6 * i + b] = B[i][6 * a + b];
        rhs[6 * i + a] = -gc[i][a];
      }
      var byPt = [];
      for (j = 0; j < n; j++) byPt.push([]);
      for (q = 0; q < obs.length; q++) byPt[obs[q].j].push(q);
      var ECi = new Array(obs.length);
      for (q = 0; q < obs.length; q++) {
        var Ej = Eb[q], Cv = Ci[obs[q].j], M = new Float64Array(18);
        for (a = 0; a < 6; a++) for (b = 0; b < 3; b++)
          M[3 * a + b] = Ej[3 * a] * Cv[b] + Ej[3 * a + 1] * Cv[3 + b] + Ej[3 * a + 2] * Cv[6 + b];
        ECi[q] = M;
        var g = gp[obs[q].j], io = obs[q].i;
        for (a = 0; a < 6; a++) rhs[6 * io + a] += M[3 * a] * g[0] + M[3 * a + 1] * g[1] + M[3 * a + 2] * g[2];
      }
      for (j = 0; j < n; j++) {
        var L = byPt[j];
        for (var x1 = 0; x1 < L.length; x1++) {
          var q1 = L[x1], M1 = ECi[q1], i1 = obs[q1].i;
          for (var x2 = 0; x2 < L.length; x2++) {
            var q2 = L[x2], E2 = Eb[q2], i2 = obs[q2].i;
            for (a = 0; a < 6; a++) for (b = 0; b < 6; b++)
              Sm[(6 * i1 + a) * nc + 6 * i2 + b] -= M1[3 * a] * E2[3 * b] + M1[3 * a + 1] * E2[3 * b + 1] + M1[3 * a + 2] * E2[3 * b + 2];
          }
        }
      }
      // camera 1 is held fixed: solve for the other 6(m-1) camera parameters
      var nf = nc - 6, Sf = new Array(nf * nf), bf = new Array(nf);
      for (a = 0; a < nf; a++) {
        bf[a] = rhs[6 + a];
        for (b = 0; b < nf; b++) Sf[a * nf + b] = Sm[(6 + a) * nc + 6 + b];
      }
      var dcf = solve(Sf, bf, nf);
      if (!dcf) return null;
      var dc = [0, 0, 0, 0, 0, 0].concat(dcf);
      // back-substitution: dX_j = C_j^-1 (-g_pj - sum_i E_ij^T dc_i)
      var newX = [];
      for (j = 0; j < n; j++) {
        var v = [-gp[j][0], -gp[j][1], -gp[j][2]];
        for (x1 = 0; x1 < byPt[j].length; x1++) {
          q = byPt[j][x1];
          var Eq = Eb[q], ii = obs[q].i;
          for (b = 0; b < 3; b++) for (a = 0; a < 6; a++) v[b] -= Eq[3 * a + b] * dc[6 * ii + a];
        }
        var dX = mv3(Ci[j], v);
        newX.push([e.X[j][0] + dX[0], e.X[j][1] + dX[1], e.X[j][2] + dX[2]]);
      }
      var newC = e.cams.map(function (c, i2) {
        var d = dc.slice(6 * i2, 6 * i2 + 6), dR = rodrigues([d[0], d[1], d[2]]), t = mv3(dR, c.t);
        return { R: mm3(dR, c.R), t: [t[0] + d[3], t[1] + d[4], t[2] + d[5]] };
      });
      return { cams: newC, X: newX };
    }
    function step() {
      if (converged) return;
      var c0 = hist[hist.length - 1].c;
      for (var tries = 0; tries < 30; tries++) {
        var e = trialStep(est, lam);
        if (e) {
          var c1 = cost(e);
          if (c1.c < c0) {
            converged = c0 - c1.c < 1e-9 * c0;
            est = e; lam /= 3; k++;
            hist.push({ c: c1.c, rms: Math.sqrt(c1.c / obs.length), rmsIn: c1.rmsIn, lam: lam });
            return;
          }
        }
        lam *= 4; rejected++;
        if (lam > 1e10) break;
      }
      converged = true;
    }
    function stopRun() { running = false; runBtn.textContent = T.run; }
    var lastT = 0;
    function loop(ts) {
      if (!running) return;
      if (!ts || ts - lastT > 450) {
        lastT = ts || 0;
        step(); draw();
        if (converged || k >= 60) { stopRun(); draw(); return; }
      }
      requestAnimationFrame(loop);
    }

    // ---------- display gauge: scale about camera 1 ----------
    function centre(c) { var v = mtv3(c.R, c.t); return [-v[0], -v[1], -v[2]]; }
    function displayEstimate() {
      var C0 = centre(SCENE.cams[0]), num = 0, den = 0, j, a;
      for (j = 0; j < n; j++) {
        for (a = 0; a < 3; a++) {
          num += (est.X[j][a] - C0[a]) * (SCENE.X[j][a] - C0[a]);
          den += (est.X[j][a] - C0[a]) * (est.X[j][a] - C0[a]);
        }
      }
      var s = den > 0 ? num / den : 1;
      function f(p) { return [C0[0] + s * (p[0] - C0[0]), C0[1] + s * (p[1] - C0[1]), C0[2] + s * (p[2] - C0[2])]; }
      return {
        X: est.X.map(f),
        cams: est.cams.map(function (c) { return { R: c.R, C: f(centre(c)) }; }),
        s: s
      };
    }

    // ---------- drawing ----------
    function view3() {
      var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      var dist = 12, sc = Math.min(SW, SH) * 1.6;
      return function (p) { // world (y down) -> screen
        var x = p[0], y = -p[1] - 0.5, z = p[2];
        var x1 = cy * x + sy * z, z1 = -sy * x + cy * z;
        var y2 = cp * y - sp * z1, z2 = sp * y + cp * z1;
        var d = dist - z2;
        return [SW / 2 + sc * x1 / d, SH * 0.6 - sc * y2 / d, d];
      };
    }
    function line3(P, a, b, col, lw, dash) {
      var p = P(a), q = P(b);
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      ctx.setLineDash([]);
    }
    function frustum(P, R, C, col, lw, label) {
      var dep = 0.9, cs = [[0, 0], [W, 0], [W, H], [0, H]].map(function (uv) {
        var d = [(uv[0] - CX) / F * dep, (uv[1] - CY) / F * dep, dep], w = mtv3(R, d);
        return [C[0] + w[0], C[1] + w[1], C[2] + w[2]];
      });
      for (var a = 0; a < 4; a++) { line3(P, C, cs[a], col, lw); line3(P, cs[a], cs[(a + 1) % 4], col, lw); }
      if (label) {
        var p = P([C[0], C[1] - 0.35, C[2]]);
        ctx.fillStyle = col; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(label, p[0], p[1]);
      }
    }
    function draw3d() {
      ctx.clearRect(0, 0, SW, SH);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, SW, SH);
      var P = view3(), g;
      for (g = -3; g <= 3; g++) {
        line3(P, [g, 0, -3], [g, 0, 3], COL.grid, 1);
        line3(P, [-3, 0, g], [3, 0, g], COL.grid, 1);
      }
      var D = displayEstimate(), i, j;
      for (i = 0; i < m; i++) frustum(P, SCENE.cams[i].R, centre(SCENE.cams[i]), COL.truth, 1.2);
      for (i = 0; i < m; i++) frustum(P, D.cams[i].R, D.cams[i].C, i === S.camSel ? "#0b4f8a" : COL.cam, i === S.camSel ? 2.4 : 1.6, String(i + 1));
      for (j = 0; j < n; j++) line3(P, SCENE.X[j], D.X[j], COL.err, 1.4);
      for (j = 0; j < n; j++) {
        var p = P(SCENE.X[j]);
        ctx.fillStyle = COL.truth; ctx.beginPath(); ctx.arc(p[0], p[1], 2.4, 0, 2 * Math.PI); ctx.fill();
        var q = P(D.X[j]);
        ctx.fillStyle = COL.pt; ctx.beginPath(); ctx.arc(q[0], q[1], 3.2, 0, 2 * Math.PI); ctx.fill();
      }
    }
    function drawImage() {
      ictx.clearRect(0, 0, IW, IH);
      ictx.fillStyle = "#fff"; ictx.fillRect(0, 0, IW, IH);
      var sc = Math.min((IW - 8) / W, (IH - 8) / H), ox = (IW - W * sc) / 2, oy = (IH - H * sc) / 2;
      ictx.strokeStyle = "#bbb"; ictx.lineWidth = 1; ictx.strokeRect(ox, oy, W * sc, H * sc);
      var cam = est.cams[S.camSel];
      ictx.save(); ictx.beginPath(); ictx.rect(ox, oy, W * sc, H * sc); ictx.clip();
      for (var q = 0; q < obs.length; q++) {
        var o = obs[q];
        if (o.i !== S.camSel) continue;
        var p = projectJac(cam, est.X[o.j], false);
        var ux = ox + o.u * sc, vy = oy + o.v * sc, px = ox + p.u * sc, py = oy + p.v * sc;
        ictx.strokeStyle = COL.err; ictx.lineWidth = 1.3;
        ictx.beginPath(); ictx.moveTo(ux, vy); ictx.lineTo(px, py); ictx.stroke();
        ictx.fillStyle = COL.obs; ictx.beginPath(); ictx.arc(ux, vy, 2.4, 0, 2 * Math.PI); ictx.fill();
        if (o.out) { ictx.strokeStyle = COL.out; ictx.lineWidth = 1.6; ictx.beginPath(); ictx.arc(ux, vy, 6, 0, 2 * Math.PI); ictx.stroke(); }
        ictx.strokeStyle = COL.pt; ictx.lineWidth = 1.6;
        ictx.beginPath(); ictx.moveTo(px - 3.5, py - 3.5); ictx.lineTo(px + 3.5, py + 3.5);
        ictx.moveTo(px - 3.5, py + 3.5); ictx.lineTo(px + 3.5, py - 3.5); ictx.stroke();
      }
      ictx.restore();
      ictx.fillStyle = "#555"; ictx.font = "12px system-ui, sans-serif"; ictx.textAlign = "left";
      ictx.fillText(T.cam + " " + (S.camSel + 1), ox + 4, oy + 14);
      camBtns.forEach(function (b, i) { b.style.fontWeight = i === S.camSel ? "700" : "400"; b.style.borderColor = i === S.camSel ? "#1f77b4" : "#bbb"; });
    }
    function drawChart() {
      cctx.clearRect(0, 0, CW, CH);
      cctx.fillStyle = "#fff"; cctx.fillRect(0, 0, CW, CH);
      var l = 40, r = 30, tp = 8, b = 22, kmax = Math.max(8, hist.length - 1);
      var lo = -1, hi = 2;
      function X(i) { return l + i / kmax * (CW - l - r); }
      function Y(v) { var t = (Math.log(Math.max(v, 1e-3)) / Math.LN10 - lo) / (hi - lo); return CH - b - Math.max(0, Math.min(1, t)) * (CH - tp - b); }
      cctx.strokeStyle = "#999"; cctx.lineWidth = 1;
      cctx.beginPath(); cctx.moveTo(l, tp); cctx.lineTo(l, CH - b); cctx.lineTo(CW - r, CH - b); cctx.stroke();
      cctx.fillStyle = "#555"; cctx.font = "11px system-ui, sans-serif"; cctx.textAlign = "right"; cctx.textBaseline = "middle";
      [0.1, 1, 10, 100].forEach(function (v) {
        cctx.fillText(String(v), l - 4, Y(v));
        cctx.strokeStyle = "#eee"; cctx.beginPath(); cctx.moveTo(l + 1, Y(v)); cctx.lineTo(CW - r, Y(v)); cctx.stroke();
      });
      cctx.textAlign = "center"; cctx.textBaseline = "top";
      cctx.fillText(T.chartX, (l + CW - r) / 2, CH - b + 6);
      cctx.fillText(String(kmax), CW - r, CH - b + 6);
      cctx.save(); cctx.translate(9, (tp + CH - b) / 2); cctx.rotate(-Math.PI / 2); cctx.textBaseline = "middle";
      cctx.fillText(T.chartY, 0, 0); cctx.restore();
      // expected RMS of the inliers at the optimum, about sigma * sqrt(2 dof / (2L))
      var dof = 2 * obs.length - (6 * m + 3 * n - 7), ex = S.sigma * Math.sqrt(dof / obs.length);
      if (ex > 0.1) {
        cctx.setLineDash([4, 3]); cctx.strokeStyle = COL.dark;
        cctx.beginPath(); cctx.moveTo(l, Y(ex)); cctx.lineTo(CW - r, Y(ex)); cctx.stroke(); cctx.setLineDash([]);
      }
      cctx.strokeStyle = COL.pt; cctx.lineWidth = 2; cctx.beginPath();
      hist.forEach(function (h, i) { if (i) cctx.lineTo(X(i), Y(h.rmsIn)); else cctx.moveTo(X(i), Y(h.rmsIn)); });
      cctx.stroke();
      cctx.fillStyle = COL.pt;
      hist.forEach(function (h, i) { cctx.beginPath(); cctx.arc(X(i), Y(h.rmsIn), 2.6, 0, 2 * Math.PI); cctx.fill(); });
    }
    function rmsErr(D) {
      var ec = 0, ex = 0, i, j, a;
      for (i = 0; i < m; i++) { var Ct = centre(SCENE.cams[i]); for (a = 0; a < 3; a++) ec += Math.pow(D.cams[i].C[a] - Ct[a], 2); }
      for (j = 0; j < n; j++) for (a = 0; a < 3; a++) ex += Math.pow(D.X[j][a] - SCENE.X[j][a], 2);
      return [Math.sqrt(ec / m), Math.sqrt(ex / n)];
    }
    function writeInfo() {
      var h = hist[hist.length - 1], D = displayEstimate(), e = rmsErr(D);
      info.innerHTML =
        "<b>" + T.iter + " k = " + k + "</b>" + (converged ? ' &nbsp;<b style="color:#2ca02c">' + T.conv + "</b>" : "") +
        " &nbsp; " + T.lam + " = " + h.lam.toExponential(1) + " &nbsp; " + T.rej + ": " + rejected + "<br>" +
        T.rms + ": <b>" + h.rmsIn.toFixed(3) + " px</b><br>" +
        T.errC + ": " + e[0].toFixed(4) + " &nbsp; " + T.errX + ": " + e[1].toFixed(4) + "<br>" +
        '<span style="color:#666">' + T.sizes + " 6m + 3n = " + (6 * m + 3 * n) + ", " + T.schur + " " +
        (6 * m - 6) + "\u00d7" + (6 * m - 6) + ", " + obs.length + " " + T.nobs + "</span>";
    }
    function draw() {
      if (!est) return;
      draw3d(); drawImage(); drawChart(); writeInfo();
    }

    // ---------- pointer: orbit ----------
    cv.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch };
      cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing";
      e.preventDefault();
    });
    cv.addEventListener("pointermove", function (e) {
      if (!drag) return;
      yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
      pitch = Math.max(-0.2, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * 0.01));
      draw3d();
    });
    function end() { drag = null; cv.style.cursor = "grab"; }
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    restart(true);
    resize();
  }

  function init() {
    document.querySelectorAll('[data-widget="3d-vision-bundle-adjustment"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
