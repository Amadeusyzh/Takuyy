/* 2D TSDF fusion (3d-vision post 09).
 * The flatland scene of the post (a disk, a rotated box and a thin bar) is scanned by a 1D depth camera
 * (160 pixels, f = 160 px, OpenCV-style: x right, z forward) with Gaussian depth noise sigma. Every scan
 * is fused into a truncated signed distance grid with the running weighted average
 *   F <- (W F + f) / (W + 1),  W <- W + 1,  f = min(1, (d(u) - z) / mu),  skipped where d(u) - z < -mu.
 * The zero crossings are extracted with marching squares (linear interpolation on the edges).
 * Drag on the plot to move the camera (it always looks at the centre), release to take a scan.
 */
(function () {
  "use strict";

  var TEXT = {
    en: {
      scan: "scan", orbit: "orbit", pause: "pause", reset: "reset", noise: "noise \u03c3", trunc: "truncation \u03bc",
      voxel: "voxel", showW: "show weights", truth: "truth", scans: "scans", acc: "accuracy (mean |SDF| of the curve)",
      rec: "recall at 2 cm", hint: "Drag on the plot to move the camera, release to take a scan.",
      field: "colour: F (blue = free space, red = behind the surface, gray = unobserved)",
      wfield: "colour: weight W (number of scans that updated the voxel)"
    },
    zh: {
      scan: "\u626b\u63cf", orbit: "\u73af\u7ed5", pause: "\u6682\u505c", reset: "\u91cd\u7f6e", noise: "\u566a\u58f0 \u03c3", trunc: "\u622a\u65ad \u03bc",
      voxel: "\u4f53\u7d20", showW: "\u663e\u793a\u6743\u91cd", truth: "\u771f\u503c", scans: "\u626b\u63cf\u6b21\u6570", acc: "\u51c6\u786e\u5ea6\uff08\u66f2\u7ebf\u7684\u5e73\u5747 |SDF|\uff09",
      rec: "2 cm \u5185\u7684\u53ec\u56de\u7387", hint: "\u5728\u56fe\u4e0a\u62d6\u52a8\u53ef\u79fb\u52a8\u76f8\u673a\uff0c\u677e\u5f00\u5373\u6267\u884c\u4e00\u6b21\u626b\u63cf\u3002",
      field: "\u989c\u8272\uff1aF\uff08\u84dd = \u81ea\u7531\u7a7a\u95f4\uff0c\u7ea2 = \u8868\u9762\u4e4b\u540e\uff0c\u7070 = \u672a\u89c2\u6d4b\uff09",
      wfield: "\u989c\u8272\uff1a\u6743\u91cd W\uff08\u66f4\u65b0\u8fc7\u8be5\u4f53\u7d20\u7684\u626b\u63cf\u6b21\u6570\uff09"
    },
    ja: {
      scan: "\u30b9\u30ad\u30e3\u30f3", orbit: "\u5468\u56de", pause: "\u4e00\u6642\u505c\u6b62", reset: "\u30ea\u30bb\u30c3\u30c8", noise: "\u30ce\u30a4\u30ba \u03c3", trunc: "\u6253\u3061\u5207\u308a \u03bc",
      voxel: "\u30dc\u30af\u30bb\u30eb", showW: "\u91cd\u307f\u3092\u8868\u793a", truth: "\u771f\u5024", scans: "\u30b9\u30ad\u30e3\u30f3\u6570", acc: "\u7cbe\u5ea6\uff08\u66f2\u7dda\u306e\u5e73\u5747 |SDF|\uff09",
      rec: "2 cm \u4ee5\u5185\u306e\u518d\u73fe\u7387", hint: "\u56f3\u3092\u30c9\u30e9\u30c3\u30b0\u3059\u308b\u3068\u30ab\u30e1\u30e9\u304c\u52d5\u304d\u3001\u6307\u3092\u96e2\u3059\u3068 1 \u56de\u30b9\u30ad\u30e3\u30f3\u3057\u307e\u3059\u3002",
      field: "\u8272\uff1aF\uff08\u9752 = \u7a7a\u9593\u3001\u8d64 = \u8868\u9762\u306e\u5965\u3001\u7070 = \u672a\u89b3\u6e2c\uff09",
      wfield: "\u8272\uff1a\u91cd\u307f W\uff08\u305d\u306e\u30dc\u30af\u30bb\u30eb\u3092\u66f4\u65b0\u3057\u305f\u30b9\u30ad\u30e3\u30f3\u306e\u6570\uff09"
    }
  };

  var W = 160, FOC = 160, CX = (W - 1) / 2, EXT = 1.6, VIEW = 2.75;

  // ---------- scene (identical to the post) ----------
  function sdBox(x, z, cx, cz, hx, hz, ang) {
    var ca = Math.cos(ang), sa = Math.sin(ang), dx = x - cx, dz = z - cz;
    var qx = Math.abs(ca * dx + sa * dz) - hx, qz = Math.abs(-sa * dx + ca * dz) - hz;
    var ox = Math.max(qx, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(qx, qz), 0);
  }
  var D20 = 20 * Math.PI / 180, DM10 = -10 * Math.PI / 180;
  function sceneSdf(x, z) {
    var disk = Math.hypot(x + 0.55, z - 0.25) - 0.45;
    var box = sdBox(x, z, 0.5, -0.4, 0.45, 0.28, D20);
    var bar = sdBox(x, z, 0.45, 0.65, 0.38, 0.04, DM10);
    return Math.min(disk, box, bar);
  }
  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // camera at C looking at the origin: R rows = (right, forward)
  function camAt(cx, cz) {
    var fx = -cx, fz = -cz, L = Math.hypot(fx, fz) || 1;
    fx /= L; fz /= L;
    return { cx: cx, cz: cz, r00: fz, r01: -fx, r10: fx, r11: fz };
  }
  function renderDepth(cam, sigma) {
    var d = new Float64Array(W);
    for (var u = 0; u < W; u++) {
      var a = (u - CX) / FOC, nrm = Math.sqrt(a * a + 1);
      var dcx = a / nrm, dcz = 1 / nrm;
      var dx = cam.r00 * dcx + cam.r10 * dcz, dz = cam.r01 * dcx + cam.r11 * dcz;   // R^T d
      var s = 0, hit = false;
      for (var k = 0; k < 160; k++) {
        var dist = sceneSdf(cam.cx + s * dx, cam.cz + s * dz);
        if (dist < 1e-5) { hit = true; break; }
        s += dist;
        if (s > 8) break;
      }
      d[u] = hit ? s / nrm + sigma * gauss() : NaN;
    }
    return d;
  }

  // ---------- truth samples (marching squares on the exact SDF, once) ----------
  function marching(F, valid, n, h, x0) {
    var segs = [];
    for (var i = 0; i < n - 1; i++) {
      for (var j = 0; j < n - 1; j++) {
        var id = [i * n + j, i * n + j + 1, (i + 1) * n + j + 1, (i + 1) * n + j];
        if (valid && !(valid[id[0]] && valid[id[1]] && valid[id[2]] && valid[id[3]])) continue;
        var v = [F[id[0]], F[id[1]], F[id[2]], F[id[3]]];
        var neg = (v[0] < 0) + (v[1] < 0) + (v[2] < 0) + (v[3] < 0);
        if (neg === 0 || neg === 4) continue;
        var px = [x0 + j * h, x0 + (j + 1) * h, x0 + (j + 1) * h, x0 + j * h];
        var pz = [x0 + i * h, x0 + i * h, x0 + (i + 1) * h, x0 + (i + 1) * h];
        var pts = [];
        for (var e = 0; e < 4; e++) {
          var a = e, b = (e + 1) % 4;
          if ((v[a] < 0) !== (v[b] < 0)) {
            var s = v[a] / (v[a] - v[b]);
            pts.push([px[a] + s * (px[b] - px[a]), pz[a] + s * (pz[b] - pz[a]), e]);
          } else pts.push(null);
        }
        var got = pts.filter(function (p) { return p; });
        if (got.length === 2) segs.push([got[0][0], got[0][1], got[1][0], got[1][1]]);
        else if (got.length === 4) {
          var mean = (v[0] + v[1] + v[2] + v[3]) / 4;
          if ((mean < 0) === (v[0] < 0)) {
            segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
            segs.push([pts[2][0], pts[2][1], pts[3][0], pts[3][1]]);
          } else {
            segs.push([pts[3][0], pts[3][1], pts[0][0], pts[0][1]]);
            segs.push([pts[1][0], pts[1][1], pts[2][0], pts[2][1]]);
          }
        }
      }
    }
    return segs;
  }
  var TRUTH_SEGS, TRUTH_PTS;
  (function () {
    var n = 321, h = 2 * EXT / (n - 1), F = new Float64Array(n * n);
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) F[i * n + j] = sceneSdf(-EXT + j * h, -EXT + i * h);
    TRUTH_SEGS = marching(F, null, n, h, -EXT);
    TRUTH_PTS = TRUTH_SEGS.map(function (s) { return [(s[0] + s[2]) / 2, (s[1] + s[3]) / 2]; });
  })();

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.innerHTML = "";
    root.style.background = "#fbfbfd";
    root.style.color = "#222";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.fontSize = "14px";

    var S = { sigma: 0.02, mu: 0.06, n: 128, showW: false, truth: true };
    var cam = camAt(2.6, 0), lastDepth = null, scans = [], running = false, orbitA = 0;
    var Fg, Wg, segs = [], stats = null;

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
    function check(txt, val, cb) {
      var l = document.createElement("label");
      l.style.cssText = "display:flex;align-items:center;gap:4px;white-space:nowrap";
      var c = document.createElement("input"); c.type = "checkbox"; c.checked = val;
      c.addEventListener("change", function () { cb(c.checked); });
      l.appendChild(c); l.appendChild(document.createTextNode(txt)); bar.appendChild(l);
    }
    btn(T.scan, function () { takeScan(); });
    var runBtn = btn(T.orbit, function () {
      running = !running; runBtn.textContent = running ? T.pause : T.orbit;
      if (running) { orbitA = Math.atan2(cam.cz, cam.cx); requestAnimationFrame(loop); }
    });
    btn(T.reset, function () { scans = []; lastDepth = null; refuse(); });
    slider(T.noise, 0, 0.06, 0.005, S.sigma, function (v) { return (100 * v).toFixed(1) + " cm"; }, function (v) { S.sigma = v; });
    slider(T.trunc, 0.01, 0.25, 0.005, S.mu, function (v) { return (100 * v).toFixed(1) + " cm"; }, function (v) { S.mu = v; refuse(); });
    var vl = document.createElement("label");
    vl.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap";
    vl.appendChild(document.createTextNode(T.voxel + " "));
    var sel = document.createElement("select");
    sel.style.cssText = "font:inherit;padding:2px 4px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222";
    [[32, "10 cm"], [64, "5 cm"], [128, "2.5 cm"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
    });
    sel.value = "128";
    sel.addEventListener("change", function () { S.n = +sel.value; refuse(); });
    vl.appendChild(sel); bar.appendChild(vl);
    check(T.showW, false, function (v) { S.showW = v; draw(); });
    check(T.truth, true, function (v) { S.truth = v; draw(); });

    var row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px 14px;padding:4px 10px 10px;align-items:flex-start";
    root.appendChild(row);
    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;touch-action:none;cursor:crosshair;border-radius:6px;background:#fff;box-shadow:0 0 0 1px #ddd";
    row.appendChild(cv);
    var info = document.createElement("div");
    info.style.cssText = "flex:1 1 200px;min-width:0;line-height:1.6;font-variant-numeric:tabular-nums";
    row.appendChild(info);
    var ctx = cv.getContext("2d");
    var off = document.createElement("canvas"), octx = off.getContext("2d");
    var SZ = 400, lastW = -1;

    function resize() {
      var w = Math.max(260, root.clientWidth - 20);
      if (w === lastW) return;
      lastW = w;
      SZ = w >= 700 ? Math.min(520, Math.round(w * 0.62)) : Math.min(w, 520);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.width = SZ + "px"; cv.style.height = SZ + "px";
      cv.width = Math.round(SZ * dpr); cv.height = Math.round(SZ * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function X(x) { return (x + VIEW) / (2 * VIEW) * SZ; }
    function Y(z) { return (VIEW - z) / (2 * VIEW) * SZ; }
    function invX(px) { return px / SZ * 2 * VIEW - VIEW; }
    function invY(py) { return VIEW - py / SZ * 2 * VIEW; }

    // ---------- fusion ----------
    function integrate(sc) {
      var n = S.n, h = 2 * EXT / n, mu = S.mu, c = sc.cam, d = sc.depth;
      for (var i = 0; i < n; i++) {
        var z0 = -EXT + h * (i + 0.5);
        for (var j = 0; j < n; j++) {
          var x0 = -EXT + h * (j + 0.5);
          var px = x0 - c.cx, pz = z0 - c.cz;
          var xc = c.r00 * px + c.r01 * pz, zc = c.r10 * px + c.r11 * pz;
          if (zc <= 1e-6) continue;
          var u = Math.round(FOC * xc / zc + CX);
          if (u < 0 || u >= W) continue;
          var dd = d[u];
          if (!(dd === dd)) continue;            // NaN: no return
          var sdf = dd - zc;
          if (sdf <= -mu) continue;
          var f = Math.min(1, sdf / mu), k = i * n + j;
          Fg[k] = (Wg[k] * Fg[k] + f) / (Wg[k] + 1);
          Wg[k] += 1;
        }
      }
    }
    function refuse() {
      var n = S.n;
      Fg = new Float64Array(n * n).fill(1); Wg = new Float64Array(n * n);
      for (var k = 0; k < scans.length; k++) integrate(scans[k]);
      extract();
      draw();
    }
    function extract() {
      var n = S.n, h = 2 * EXT / n, valid = new Uint8Array(n * n);
      for (var k = 0; k < n * n; k++) valid[k] = Wg[k] > 0 ? 1 : 0;
      segs = marching(Fg, valid, n, h, -EXT + h / 2);
      // accuracy: mean |SDF| along the curve (length-weighted); recall: truth points within 2 cm
      var accSum = 0, len = 0, i;
      var pts = [];
      for (i = 0; i < segs.length; i++) {
        var s = segs[i], L = Math.hypot(s[2] - s[0], s[3] - s[1]);
        var mx = (s[0] + s[2]) / 2, mz = (s[1] + s[3]) / 2;
        accSum += L * Math.abs(sceneSdf(mx, mz)); len += L;
        pts.push(mx, mz);
      }
      // bucket the reconstructed points for the recall query
      var B = 64, cell = 2 * EXT / B, grid = {};
      for (i = 0; i < pts.length; i += 2) {
        var key = Math.floor((pts[i] + EXT) / cell) + "," + Math.floor((pts[i + 1] + EXT) / cell);
        (grid[key] = grid[key] || []).push(pts[i], pts[i + 1]);
      }
      var hit = 0;
      for (i = 0; i < TRUTH_PTS.length; i++) {
        var tx = TRUTH_PTS[i][0], tz = TRUTH_PTS[i][1], gi = Math.floor((tx + EXT) / cell), gj = Math.floor((tz + EXT) / cell), ok = false;
        for (var a = -1; a <= 1 && !ok; a++) for (var b = -1; b <= 1 && !ok; b++) {
          var arr = grid[(gi + a) + "," + (gj + b)];
          if (!arr) continue;
          for (var q = 0; q < arr.length; q += 2) if (Math.hypot(arr[q] - tx, arr[q + 1] - tz) < 0.02) { ok = true; break; }
        }
        if (ok) hit++;
      }
      stats = { acc: len > 0 ? accSum / len : NaN, rec: hit / TRUTH_PTS.length };
    }
    function takeScan() {
      lastDepth = renderDepth(cam, S.sigma);
      var sc = { cam: cam, depth: lastDepth };
      scans.push(sc);
      integrate(sc);
      extract();
      draw();
    }

    // ---------- drawing ----------
    function colF(f) {      // RdBu: -1 red, 0 white, +1 blue
      var r, g, b, t;
      if (f < 0) { t = Math.min(1, -f); r = 255 + t * (178 - 255); g = 255 + t * (24 - 255); b = 255 + t * (43 - 255); }
      else { t = Math.min(1, f); r = 255 + t * (33 - 255); g = 255 + t * (102 - 255); b = 255 + t * (172 - 255); }
      return [r, g, b];
    }
    function draw() {
      if (!Fg) return;
      var n = S.n;
      ctx.clearRect(0, 0, SZ, SZ);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, SZ, SZ);
      off.width = n; off.height = n;
      var img = octx.createImageData(n, n), maxW = 1, k;
      for (k = 0; k < n * n; k++) if (Wg[k] > maxW) maxW = Wg[k];
      for (var i = 0; i < n; i++) {
        for (var j = 0; j < n; j++) {
          k = i * n + j;
          var o = ((n - 1 - i) * n + j) * 4, c;
          if (Wg[k] === 0) c = [236, 236, 236];
          else if (S.showW) { var t = Wg[k] / maxW; c = [255 - t * 160, 255 - t * 150, 255 - t * 50]; }
          else c = colF(Fg[k]);
          img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, X(-EXT), Y(EXT), X(EXT) - X(-EXT), Y(-EXT) - Y(EXT));
      ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1;
      ctx.strokeRect(X(-EXT), Y(EXT), X(EXT) - X(-EXT), Y(-EXT) - Y(EXT));
      var s, q;
      if (S.truth) {
        ctx.strokeStyle = "#2ca02c"; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]);
        ctx.beginPath();
        for (q = 0; q < TRUTH_SEGS.length; q++) { s = TRUTH_SEGS[q]; ctx.moveTo(X(s[0]), Y(s[1])); ctx.lineTo(X(s[2]), Y(s[3])); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.strokeStyle = "#111"; ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (q = 0; q < segs.length; q++) { s = segs[q]; ctx.moveTo(X(s[0]), Y(s[1])); ctx.lineTo(X(s[2]), Y(s[3])); }
      ctx.stroke();
      // past cameras
      ctx.fillStyle = "rgba(148,103,189,0.55)";
      for (q = 0; q < scans.length; q++) { ctx.beginPath(); ctx.arc(X(scans[q].cam.cx), Y(scans[q].cam.cz), 2.5, 0, 2 * Math.PI); ctx.fill(); }
      // current camera, field of view and last scan
      var half = CX / FOC, edges = [-half, half];
      ctx.strokeStyle = "rgba(255,127,14,0.8)"; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (q = 0; q < 2; q++) {
        var a = edges[q], dx = cam.r00 * a + cam.r10, dz = cam.r01 * a + cam.r11, L = Math.hypot(dx, dz);
        ctx.moveTo(X(cam.cx), Y(cam.cz)); ctx.lineTo(X(cam.cx + 4.5 * dx / L), Y(cam.cz + 4.5 * dz / L));
      }
      ctx.stroke();
      if (lastDepth && scans.length && scans[scans.length - 1].cam === cam) {
        ctx.fillStyle = "#d62728";
        for (var u = 0; u < W; u += 1) {
          var d = lastDepth[u];
          if (!(d === d)) continue;
          var xc = (u - CX) / FOC * d, zc = d;
          var xw = cam.r00 * xc + cam.r10 * zc + cam.cx, zw = cam.r01 * xc + cam.r11 * zc + cam.cz;
          ctx.fillRect(X(xw) - 1.5, Y(zw) - 1.5, 3, 3);
        }
      }
      ctx.fillStyle = "#ff7f0e";
      ctx.beginPath(); ctx.arc(X(cam.cx), Y(cam.cz), 7, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
      var acc = stats && isFinite(stats.acc) ? (1000 * stats.acc).toFixed(1) + " mm" : "\u2013";
      var rec = stats ? (100 * stats.rec).toFixed(1) + "%" : "\u2013";
      info.innerHTML = "<div><b>" + T.scans + ":</b> " + scans.length + "</div>" +
        "<div><b>" + T.acc + ":</b> " + acc + "</div>" +
        "<div><b>" + T.rec + ":</b> " + rec + "</div>" +
        "<div style='margin-top:6px;color:#555'>" + (S.showW ? T.wfield : T.field) + "</div>" +
        "<div style='margin-top:6px;color:#555'>" + T.hint + "</div>";
    }

    // ---------- interaction ----------
    var dragging = false;
    function evPos(e) {
      var r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function moveCam(e) {
      var q = evPos(e), x = invX(q.x), z = invY(q.y);
      var r = Math.hypot(x, z);
      if (r < 1.25) { x *= 1.25 / (r || 1); z *= 1.25 / (r || 1); }     // stay outside the objects
      cam = camAt(x, z);
      draw();
    }
    cv.addEventListener("pointerdown", function (e) {
      dragging = true; cv.setPointerCapture(e.pointerId); moveCam(e); e.preventDefault();
    });
    cv.addEventListener("pointermove", function (e) { if (dragging) moveCam(e); });
    cv.addEventListener("pointerup", function () { if (dragging) { dragging = false; takeScan(); } });
    cv.addEventListener("pointercancel", function () { dragging = false; });

    var lastT = 0;
    function loop(ts) {
      if (!running) return;
      if (ts - lastT > 110) {
        lastT = ts;
        orbitA += 2 * Math.PI / 48;
        cam = camAt(2.6 * Math.cos(orbitA), 2.6 * Math.sin(orbitA));
        takeScan();
      }
      requestAnimationFrame(loop);
    }

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    refuse();
    takeScan();
    resize();
  }

  function init() {
    document.querySelectorAll('[data-widget="3d-vision-tsdf-fusion"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
