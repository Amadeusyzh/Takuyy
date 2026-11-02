/* Marching squares on a live SDF (graphics post 08).
 * f(p) = smooth-min of three circle SDFs (k = smoothing radius). The grid samples f at cell corners;
 * each cell with a sign change gets one segment (two for saddles, decided by the cell centre).
 * Crossing points use linear interpolation t = f_a / (f_a - f_b), or edge midpoints when the
 * interpolation box is unticked. The dashed curve is a fine-grid reference of the true zero set.
 */
(function () {
  "use strict";

  var TEXT = {
    en: { res: "Cells", field: "show field", interp: "linear interpolation", segs: "segments",
      hint: "Drag the three circle centres." },
    zh: { res: "单元数", field: "显示场", interp: "线性插值", segs: "条线段",
      hint: "拖动三个圆心。" },
    ja: { res: "セル数", field: "場を表示", interp: "線形補間", segs: "本の線分",
      hint: "3 つの円の中心をドラッグしてください。" },
  };

  function smin(a, b, k) {
    var h = Math.min(1, Math.max(0, 0.5 + 0.5 * (b - a) / k));
    return b * (1 - h) + a * h - k * h * (1 - h);
  }

  // marching squares over an (nx+1) x (ny+1) corner grid with spacing cs; returns segments in px
  function march(f, nx, ny, cs, interp) {
    var G = [], i, j;
    for (i = 0; i <= nx; i++) { G.push([]); for (j = 0; j <= ny; j++) G[i].push(f(i * cs, j * cs)); }
    var segs = [];
    for (i = 0; i < nx; i++) {
      for (j = 0; j < ny; j++) {
        var cx = [i, i + 1, i + 1, i], cy = [j, j, j + 1, j + 1];
        var v = [G[i][j], G[i + 1][j], G[i + 1][j + 1], G[i][j + 1]];
        var pts = {}, n = 0;
        for (var e = 0; e < 4; e++) {
          var a = e, b = (e + 1) % 4;
          if ((v[a] < 0) !== (v[b] < 0)) {
            var t = interp ? v[a] / (v[a] - v[b]) : 0.5;
            pts[e] = [(cx[a] + t * (cx[b] - cx[a])) * cs, (cy[a] + t * (cy[b] - cy[a])) * cs];
            n++;
          }
        }
        if (n === 2) {
          var ks = Object.keys(pts);
          segs.push([pts[ks[0]], pts[ks[1]]]);
        } else if (n === 4) {
          var c = f((i + 0.5) * cs, (j + 0.5) * cs);
          if ((c < 0) === (v[0] < 0)) { segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
          else { segs.push([pts[3], pts[0]]); segs.push([pts[1], pts[2]]); }
        }
      }
    }
    return { G: G, segs: segs };
  }

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.style.background = "#fbfbfd";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.color = "#222";
    root.innerHTML = "";
    var nCells = 12, showField = true, interp = true, drag = -1;
    var C = [[0.33, 0.45], [0.62, 0.38], [0.55, 0.68]]; // centres in units of the canvas size
    var R = [0.16, 0.12, 0.1], K = 0.08;

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:8px 10px 0;font-size:14px";
    var lab = document.createElement("label");
    lab.style.cssText = "display:flex;align-items:center;gap:6px";
    var resTxt = document.createElement("span");
    var slider = document.createElement("input");
    slider.type = "range"; slider.min = "4"; slider.max = "48"; slider.step = "1"; slider.value = String(nCells);
    slider.style.width = "130px";
    slider.addEventListener("input", function () { nCells = +slider.value; draw(); });
    lab.appendChild(resTxt); lab.appendChild(slider); bar.appendChild(lab);
    function check(txt, val, cb) {
      var l = document.createElement("label");
      l.style.cssText = "display:flex;align-items:center;gap:4px";
      var b = document.createElement("input"); b.type = "checkbox"; b.checked = val;
      b.addEventListener("change", function () { cb(b.checked); draw(); });
      l.appendChild(b); l.appendChild(document.createTextNode(txt)); bar.appendChild(l);
    }
    check(T.field, showField, function (v) { showField = v; });
    check(T.interp, interp, function (v) { interp = v; });
    root.appendChild(bar);

    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;margin:6px auto 0;touch-action:none;cursor:grab";
    root.appendChild(canvas);
    var info = document.createElement("div");
    info.style.cssText = "padding:4px 10px 10px;font-size:14px;line-height:1.5;font-variant-numeric:tabular-nums";
    root.appendChild(info);
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, U = 1, lastW = -1;

    function resize() {
      var w = Math.max(260, root.clientWidth);
      if (w === lastW) return;
      lastW = w;
      W = w; H = Math.min(340, Math.max(220, Math.round(w * 0.62)));
      U = Math.min(W, H * 1.3);
      var dpr = window.devicePixelRatio || 1;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function cpx(k) { return [(W - U) / 2 + C[k][0] * U, (H - U * 0.75) / 2 + C[k][1] * U * 0.75]; }
    function f(x, y) {
      var d = Infinity;
      for (var k = 0; k < 3; k++) {
        var p = cpx(k), dk = Math.hypot(x - p[0], y - p[1]) - R[k] * U;
        d = k === 0 ? dk : smin(d, dk, K * U);
      }
      return d;
    }

    function drawField() {
      var step = 4, cols = Math.ceil(W / step), rows = Math.ceil(H / step);
      var scale = 0.25 * U;
      for (var i = 0; i < cols; i++) {
        for (var j = 0; j < rows; j++) {
          var v = f((i + 0.5) * step, (j + 0.5) * step) / scale;
          var t = Math.max(-1, Math.min(1, v)), r, g, b;
          if (t < 0) { r = 255 + t * 180; g = 255 + t * 130; b = 255; } else { r = 255; g = 255 - t * 140; b = 255 - t * 160; }
          var band = Math.abs((v * 6) % 1) < 0.08 ? 0.9 : 1; // faint level-set bands
          ctx.fillStyle = "rgb(" + Math.round(r * band) + "," + Math.round(g * band) + "," + Math.round(b * band) + ")";
          ctx.fillRect(i * step, j * step, step, step);
        }
      }
    }

    function draw() {
      resTxt.textContent = T.res + " " + nCells;
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      if (showField) drawField();
      var cs = W / nCells, ny = Math.ceil(H / cs);
      var M = march(f, nCells, ny, cs, interp);
      // grid
      ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 0; i <= nCells; i++) { ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, ny * cs); }
      for (var j = 0; j <= ny; j++) { ctx.moveTo(0, j * cs); ctx.lineTo(W, j * cs); }
      ctx.stroke();
      // reference zero set from a fine grid
      var fine = march(f, Math.round(W / 3), Math.ceil(H / 3), 3, true);
      ctx.strokeStyle = "rgba(60,60,60,0.7)"; ctx.lineWidth = 1.3; ctx.setLineDash([4, 3]);
      ctx.beginPath();
      fine.segs.forEach(function (s) { ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); });
      ctx.stroke(); ctx.setLineDash([]);
      // corner samples
      if (nCells <= 24) {
        var rad = Math.max(2, Math.min(5, cs * 0.14));
        for (i = 0; i <= nCells; i++) for (j = 0; j <= ny; j++) {
          ctx.beginPath(); ctx.arc(i * cs, j * cs, rad, 0, 2 * Math.PI);
          if (M.G[i][j] < 0) { ctx.fillStyle = "#1f77b4"; ctx.fill(); }
          else { ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#d62728"; ctx.lineWidth = 1.2; ctx.stroke(); }
        }
      }
      // extracted segments
      ctx.strokeStyle = "#9467bd"; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath();
      M.segs.forEach(function (s) { ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); });
      ctx.stroke();
      // handles
      for (var k = 0; k < 3; k++) {
        var p = cpx(k);
        ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, 2 * Math.PI);
        ctx.fillStyle = k === drag ? "#9467bd" : "#222"; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
      }
      info.innerHTML = nCells + " × " + ny + ": " + M.segs.length + " " + T.segs +
        ' &nbsp; <span style="color:#777">' + T.hint + "</span>";
    }

    function pick(e) {
      var rc = canvas.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top, best = -1, bd = 30;
      for (var k = 0; k < 3; k++) { var p = cpx(k), d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = k; } }
      return best;
    }
    canvas.addEventListener("pointerdown", function (e) {
      drag = pick(e);
      if (drag < 0) return;
      canvas.setPointerCapture(e.pointerId); e.preventDefault(); draw();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (drag < 0) return;
      var rc = canvas.getBoundingClientRect();
      var x = e.clientX - rc.left, y = e.clientY - rc.top;
      C[drag] = [Math.min(1, Math.max(0, (x - (W - U) / 2) / U)), Math.min(1, Math.max(0, (y - (H - U * 0.75) / 2) / (U * 0.75)))];
      draw();
    });
    function end() { if (drag >= 0) { drag = -1; draw(); } }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function init() {
    document.querySelectorAll('[data-widget="graphics-marching-squares"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
