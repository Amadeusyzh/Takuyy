/* Structure tensor and Lucas-Kanade (3d-vision post 03).
 * A synthetic 160 x 100 image (soft-edged shapes, optional noise). Drag the window over it. For the pixels
 * in the (2h+1)^2 window the widget shows the image gradients (Ix, Iy) as a scatter plot with the ellipse of
 * M = mean(g g^T), its eigenvalues, the Harris response R = det M - k tr(M)^2 (k = 0.05) and the class.
 * The second image J is the first one shifted by the motion d; the right plot shows every pixel's flow
 * constraint Ix u + Iy v + It = 0 as a line in the (u, v) plane, the true d and the Lucas-Kanade estimate
 * (5 Gauss-Newton iterations). On an edge all lines are parallel: only the normal flow is determined.
 */
(function () {
  "use strict";

  var TEXT = {
    en: {
      win: "window h", noise: "noise", u: "motion u", v: "motion v", heat: "Harris map",
      flat: "flat", edge: "edge", corner: "corner", grads: "gradients (Ix, Iy)", flow: "flow constraints in (u, v)",
      lk: "Lucas-Kanade", truth: "true", normal: "normal flow only (aperture problem)", none: "no gradient: the flow is undetermined",
      hint: "Drag on the image to move the window."
    },
    zh: {
      win: "\u7a97\u53e3 h", noise: "\u566a\u58f0", u: "\u8fd0\u52a8 u", v: "\u8fd0\u52a8 v", heat: "Harris \u54cd\u5e94\u56fe",
      flat: "\u5e73\u5766", edge: "\u8fb9\u7f18", corner: "\u89d2\u70b9", grads: "\u68af\u5ea6 (Ix, Iy)", flow: "(u, v) \u5e73\u9762\u4e2d\u7684\u5149\u6d41\u7ea6\u675f",
      lk: "Lucas-Kanade", truth: "\u771f\u503c", normal: "\u53ea\u80fd\u786e\u5b9a\u6cd5\u5411\u5149\u6d41\uff08\u5b54\u5f84\u95ee\u9898\uff09", none: "\u6ca1\u6709\u68af\u5ea6\uff1a\u5149\u6d41\u65e0\u6cd5\u786e\u5b9a",
      hint: "\u5728\u56fe\u50cf\u4e0a\u62d6\u52a8\u4ee5\u79fb\u52a8\u7a97\u53e3\u3002"
    },
    ja: {
      win: "\u7a93 h", noise: "\u30ce\u30a4\u30ba", u: "\u52d5\u304d u", v: "\u52d5\u304d v", heat: "Harris \u5fdc\u7b54",
      flat: "\u5e73\u5766", edge: "\u30a8\u30c3\u30b8", corner: "\u30b3\u30fc\u30ca\u30fc", grads: "\u52fe\u914d (Ix, Iy)", flow: "(u, v) \u5e73\u9762\u306e\u30d5\u30ed\u30fc\u62d8\u675f",
      lk: "Lucas-Kanade", truth: "\u771f\u5024", normal: "\u6cd5\u7dda\u65b9\u5411\u306e\u30d5\u30ed\u30fc\u306e\u307f\uff08\u958b\u53e3\u554f\u984c\uff09", none: "\u52fe\u914d\u304c\u306a\u3044\u305f\u3081\u30d5\u30ed\u30fc\u306f\u6c7a\u307e\u308a\u307e\u305b\u3093",
      hint: "\u753b\u50cf\u4e0a\u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u7a93\u3092\u52d5\u304b\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
    }
  };

  var IW = 160, IH = 100, KH = 0.05;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function cover(sd) { return clamp(0.5 - sd / 0.9, 0, 1); }   // soft edge about one pixel wide
  function boxSD(x, y, cx, cy, hx, hy) { return Math.max(Math.abs(x - cx) - hx, Math.abs(y - cy) - hy); }
  var TRI = [[118, 60], [154, 90], [106, 92]];
  function triSD(x, y) {
    var d = -Infinity;
    for (var i = 0; i < 3; i++) {
      var a = TRI[i], b = TRI[(i + 1) % 3], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey);
      // outward normal for a clockwise-in-screen (counter-clockwise in math) ordering
      var nx = ey / L, ny = -ex / L;
      d = Math.max(d, nx * (x - a[0]) + ny * (y - a[1]));
    }
    return d;
  }
  // the analytic image, (x, y) in pixels, y down
  function f(x, y) {
    var v = 0.55 + 0.08 * Math.sin(x / 23) * Math.cos(y / 17), a;
    a = cover(boxSD(x, y, 37, 28, 20, 14)); v += (0.12 - v) * a;
    a = cover(Math.hypot(x - 100, y - 30) - 16); v += (0.92 - v) * a;
    a = cover(triSD(x, y)); v += (0.18 - v) * a;
    var c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6), rx = c * (x - 80) + s * (y - 74), ry = -s * (x - 80) + c * (y - 74);
    a = cover(boxSD(rx, ry, 0, 0, 11, 11)); v += (0.86 - v) * a;
    a = cover(boxSD(x, y, 36, 76, 20, 15));
    if (a > 0) {
      var sx = clamp(Math.sin(Math.PI * (x - 16) / 10) * 4, -1, 1), sy = clamp(Math.sin(Math.PI * (y - 61) / 10) * 4, -1, 1);
      v += (0.5 + 0.38 * sx * sy - v) * a;
    }
    return v;
  }

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.innerHTML = "";
    root.style.background = "#fbfbfd";
    root.style.color = "#222";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.fontSize = "14px";

    var S = { h: 6, noise: 0.0, u: 1.2, v: -0.7, heat: false, cx: 57, cy: 42 };
    function tau() { return 0.0006 + S.noise * S.noise; }   // eigenvalue threshold (per pixel)
    var N1 = new Float32Array(IW * IH), N2 = new Float32Array(IW * IH), i;
    for (i = 0; i < IW * IH; i++) {
      N1[i] = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
      N2[i] = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
    }
    var I = new Float32Array(IW * IH), J = new Float32Array(IW * IH), GX = new Float32Array(IW * IH), GY = new Float32Array(IW * IH);
    var heatR = null;

    // ---------- controls ----------
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 10px 4px";
    root.appendChild(bar);
    function slider(txt, min, max, step, val, fmt, cb) {
      var l = document.createElement("label");
      l.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap";
      var sp = document.createElement("span"), inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val; inp.style.width = "90px";
      function show() { sp.textContent = txt + " " + fmt(+inp.value); }
      inp.addEventListener("input", function () { show(); cb(+inp.value); });
      show(); l.appendChild(sp); l.appendChild(inp); bar.appendChild(l);
    }
    slider(T.win, 2, 12, 1, S.h, function (v) { return v + " (" + (2 * v + 1) + "\u00d7" + (2 * v + 1) + ")"; }, function (v) { S.h = v; heatR = null; draw(); });
    slider(T.noise, 0, 0.1, 0.005, S.noise, function (v) { return v.toFixed(3); }, function (v) { S.noise = v; build(); draw(); });
    slider(T.u, -4, 4, 0.1, S.u, function (v) { return v.toFixed(1); }, function (v) { S.u = v; build(); draw(); });
    slider(T.v, -4, 4, 0.1, S.v, function (v) { return v.toFixed(1); }, function (v) { S.v = v; build(); draw(); });
    var hl = document.createElement("label");
    hl.style.cssText = "display:flex;align-items:center;gap:4px";
    var hc = document.createElement("input"); hc.type = "checkbox";
    hc.addEventListener("change", function () { S.heat = hc.checked; draw(); });
    hl.appendChild(hc); hl.appendChild(document.createTextNode(T.heat)); bar.appendChild(hl);

    var row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;padding:4px 10px 10px;align-items:flex-start";
    root.appendChild(row);
    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;touch-action:none;cursor:move;border-radius:6px;box-shadow:0 0 0 1px #ddd";
    row.appendChild(cv);
    var side = document.createElement("div");
    side.style.cssText = "flex:1 1 240px;min-width:0";
    row.appendChild(side);
    var plots = document.createElement("div");
    plots.style.cssText = "display:flex;gap:8px";
    side.appendChild(plots);
    var pg = document.createElement("canvas"), pf = document.createElement("canvas");
    [pg, pf].forEach(function (c) { c.style.cssText = "display:block;border-radius:6px;background:#fff;box-shadow:0 0 0 1px #ddd"; plots.appendChild(c); });
    var info = document.createElement("div");
    info.style.cssText = "padding:6px 2px 0;line-height:1.55;font-variant-numeric:tabular-nums";
    side.appendChild(info);
    var ctx = cv.getContext("2d"), gctx = pg.getContext("2d"), fctx = pf.getContext("2d");
    var off = document.createElement("canvas"); off.width = IW; off.height = IH;
    var octx = off.getContext("2d");
    var SC = 3, CWd = 480, CHt = 300, PS = 160, lastW = -1;

    function build() {
      for (var y = 0; y < IH; y++) for (var x = 0; x < IW; x++) {
        var k = y * IW + x;
        I[k] = f(x + 0.5, y + 0.5) + S.noise * N1[k];
        J[k] = f(x + 0.5 - S.u, y + 0.5 - S.v) + S.noise * N2[k];
      }
      for (y = 0; y < IH; y++) for (x = 0; x < IW; x++) {
        k = y * IW + x;
        GX[k] = x > 0 && x < IW - 1 ? 0.5 * (I[k + 1] - I[k - 1]) : 0;
        GY[k] = y > 0 && y < IH - 1 ? 0.5 * (I[k + IW] - I[k - IW]) : 0;
      }
      var img = octx.createImageData(IW, IH);
      for (k = 0; k < IW * IH; k++) {
        var g = clamp(Math.round(I[k] * 255), 0, 255);
        img.data[4 * k] = img.data[4 * k + 1] = img.data[4 * k + 2] = g; img.data[4 * k + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      heatR = null;
    }
    function sampleJ(x, y) {   // bilinear, pixel centres at integer coordinates
      x = clamp(x, 0, IW - 1.001); y = clamp(y, 0, IH - 1.001);
      var x0 = Math.floor(x), y0 = Math.floor(y), ax = x - x0, ay = y - y0, k = y0 * IW + x0;
      return (1 - ay) * ((1 - ax) * J[k] + ax * J[k + 1]) + ay * ((1 - ax) * J[k + IW] + ax * J[k + IW + 1]);
    }
    function tensorAt(cx, cy, h) {
      var a = 0, b = 0, c = 0, n = 0;
      for (var y = cy - h; y <= cy + h; y++) for (var x = cx - h; x <= cx + h; x++) {
        var k = y * IW + x; a += GX[k] * GX[k]; b += GX[k] * GY[k]; c += GY[k] * GY[k]; n++;
      }
      a /= n; b /= n; c /= n;
      var tr = a + c, q = Math.sqrt((a - c) * (a - c) / 4 + b * b);
      var l1 = tr / 2 + q, l2 = tr / 2 - q, th = 0.5 * Math.atan2(2 * b, a - c);
      return { a: a, b: b, c: c, l1: l1, l2: Math.max(l2, 0), th: th, R: a * c - b * b - KH * tr * tr, n: n };
    }
    function heatmap() {
      // Harris R for every pixel with the current window (box sums via integral images)
      var W1 = IW + 1, A = new Float64Array(W1 * (IH + 1)), B = new Float64Array(W1 * (IH + 1)), Cc = new Float64Array(W1 * (IH + 1));
      for (var y = 0; y < IH; y++) for (var x = 0; x < IW; x++) {
        var k = y * IW + x, q = (y + 1) * W1 + x + 1;
        A[q] = GX[k] * GX[k] + A[q - 1] + A[q - W1] - A[q - W1 - 1];
        B[q] = GX[k] * GY[k] + B[q - 1] + B[q - W1] - B[q - W1 - 1];
        Cc[q] = GY[k] * GY[k] + Cc[q - 1] + Cc[q - W1] - Cc[q - W1 - 1];
      }
      var h = S.h, R = new Float32Array(IW * IH), mx = 1e-12;
      function box(T_, x0, y0, x1, y1) { return T_[y1 * W1 + x1] - T_[y0 * W1 + x1] - T_[y1 * W1 + x0] + T_[y0 * W1 + x0]; }
      for (y = 0; y < IH; y++) for (x = 0; x < IW; x++) {
        var x0 = Math.max(0, x - h), y0 = Math.max(0, y - h), x1 = Math.min(IW, x + h + 1), y1 = Math.min(IH, y + h + 1);
        var n = (x1 - x0) * (y1 - y0), a = box(A, x0, y0, x1, y1) / n, b = box(B, x0, y0, x1, y1) / n, c = box(Cc, x0, y0, x1, y1) / n;
        var r = a * c - b * b - KH * (a + c) * (a + c);
        R[y * IW + x] = r; if (Math.abs(r) > mx) mx = Math.abs(r);
      }
      var img = octx.createImageData(IW, IH);
      for (var k2 = 0; k2 < IW * IH; k2++) {
        var t = Math.sign(R[k2]) * Math.sqrt(Math.abs(R[k2]) / mx), g = clamp(Math.round(I[k2] * 255), 0, 255);
        var rr = g, gg = g, bb = g, al = Math.min(1, Math.abs(t) * 1.6);
        if (t > 0) { rr = g + (214 - g) * al; gg = g + (39 - g) * al; bb = g + (40 - g) * al; }
        else { rr = g + (31 - g) * al; gg = g + (119 - g) * al; bb = g + (180 - g) * al; }
        img.data[4 * k2] = rr; img.data[4 * k2 + 1] = gg; img.data[4 * k2 + 2] = bb; img.data[4 * k2 + 3] = 255;
      }
      heatR = img;
    }
    function lucasKanade(cx, cy, h, M) {
      var det = M.a * M.c - M.b * M.b, d = [0, 0], it, x, y;
      var flat = M.l1 < tau(), ill = flat || M.l2 / M.l1 < 0.01;
      for (it = 0; it < 5; it++) {
        var bx = 0, by = 0;
        for (y = cy - h; y <= cy + h; y++) for (x = cx - h; x <= cx + h; x++) {
          var k = y * IW + x, e = sampleJ(x + d[0], y + d[1]) - I[k];
          bx -= GX[k] * e; by -= GY[k] * e;
        }
        bx /= M.n; by /= M.n;
        var sx, sy;
        if (!ill) { sx = (M.c * bx - M.b * by) / det; sy = (-M.b * bx + M.a * by) / det; }
        else if (!flat) {
          // keep only the component along the dominant eigenvector e1: normal flow
          var ex = Math.cos(M.th), ey = Math.sin(M.th), p = (ex * bx + ey * by) / M.l1;
          sx = p * ex; sy = p * ey;
        } else { sx = 0; sy = 0; }
        d[0] += sx; d[1] += sy;
        if (Math.hypot(sx, sy) < 1e-4) break;
      }
      return { d: d, ill: ill, flat: flat };
    }

    function resize() {
      var w = Math.max(260, root.clientWidth - 20);
      if (w === lastW) return;
      lastW = w;
      var wide = w >= 640;
      CWd = wide ? Math.round(w * 0.56) : w;
      SC = CWd / IW; CHt = Math.round(IH * SC);
      PS = wide ? Math.floor((w - CWd - 8 - 8) / 2) : Math.floor((w - 8) / 2);
      PS = Math.max(120, Math.min(PS, 260));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.width = CWd + "px"; cv.style.height = CHt + "px";
      cv.width = Math.round(CWd * dpr); cv.height = Math.round(CHt * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      [[pg, gctx], [pf, fctx]].forEach(function (p) {
        p[0].style.width = PS + "px"; p[0].style.height = PS + "px";
        p[0].width = Math.round(PS * dpr); p[0].height = Math.round(PS * dpr);
        p[1].setTransform(dpr, 0, 0, dpr, 0, 0);
      });
      draw();
    }

    function ellipse(c, x, y, rx, ry, th) {
      c.beginPath();
      c.ellipse(x, y, Math.max(rx, 0.5), Math.max(ry, 0.5), th, 0, 2 * Math.PI);
    }
    function frame(c, title) {
      c.clearRect(0, 0, PS, PS); c.fillStyle = "#fff"; c.fillRect(0, 0, PS, PS);
      c.strokeStyle = "#e3e3e3"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(PS / 2, 18); c.lineTo(PS / 2, PS - 4); c.moveTo(4, (PS + 14) / 2); c.lineTo(PS - 4, (PS + 14) / 2); c.stroke();
      c.fillStyle = "#444"; c.font = "11.5px system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "top";
      c.fillText(title, PS / 2, 3);
    }

    function draw() {
      var h = S.h, cx = clamp(S.cx, h + 1, IW - h - 2), cy = clamp(S.cy, h + 1, IH - h - 2);
      S.cx = cx; S.cy = cy;
      ctx.imageSmoothingEnabled = false;
      if (S.heat) {
        if (!heatR) heatmap();
        octx.putImageData(heatR, 0, 0);
      } else {
        var img = octx.createImageData(IW, IH);
        for (var k = 0; k < IW * IH; k++) {
          var g = clamp(Math.round(I[k] * 255), 0, 255);
          img.data[4 * k] = img.data[4 * k + 1] = img.data[4 * k + 2] = g; img.data[4 * k + 3] = 255;
        }
        octx.putImageData(img, 0, 0);
      }
      ctx.drawImage(off, 0, 0, CWd, CHt);
      var M = tensorAt(cx, cy, h);
      // flat if both eigenvalues are tiny, otherwise the sign of the Harris response decides
      var TAU = tau(), cls = M.l1 < TAU ? T.flat : (M.R > 0 ? T.corner : T.edge);
      var clsCol = M.l1 < TAU ? "#7f7f7f" : (M.R > 0 ? "#d62728" : "#1f77b4");
      // window
      ctx.strokeStyle = "#f2b134"; ctx.lineWidth = 2.5;
      ctx.strokeRect((cx - h) * SC, (cy - h) * SC, (2 * h + 1) * SC, (2 * h + 1) * SC);
      // ellipse glyph of M at the window centre (axes proportional to sqrt(lambda))
      var px = (cx + 0.5) * SC, py = (cy + 0.5) * SC, s = (h + 0.5) * SC * 0.9 / Math.sqrt(Math.max(M.l1, 1e-9));
      ctx.fillStyle = "rgba(242,177,52,0.25)"; ctx.strokeStyle = clsCol; ctx.lineWidth = 2.5;
      ellipse(ctx, px, py, Math.sqrt(M.l1) * s, Math.sqrt(M.l2) * s, M.th); ctx.fill(); ctx.stroke();
      // gradient scatter
      frame(gctx, T.grads);
      var gmax = 0.05, x, y;
      for (y = cy - h; y <= cy + h; y++) for (x = cx - h; x <= cx + h; x++) gmax = Math.max(gmax, Math.abs(GX[y * IW + x]), Math.abs(GY[y * IW + x]));
      var gs = (PS / 2 - 10) / gmax, oy = (PS + 14) / 2;
      gctx.fillStyle = "rgba(148,103,189,0.6)";
      for (y = cy - h; y <= cy + h; y++) for (x = cx - h; x <= cx + h; x++) {
        var kk = y * IW + x;
        gctx.fillRect(PS / 2 + GX[kk] * gs - 1.5, oy + GY[kk] * gs - 1.5, 3, 3);
        // M does not distinguish g from -g: show the mirrored gradient too, lighter
        gctx.fillStyle = "rgba(148,103,189,0.22)";
        gctx.fillRect(PS / 2 - GX[kk] * gs - 1.5, oy - GY[kk] * gs - 1.5, 3, 3);
        gctx.fillStyle = "rgba(148,103,189,0.6)";
      }
      gctx.strokeStyle = clsCol; gctx.lineWidth = 2;
      // semi-axes proportional to sqrt(lambda_1), sqrt(lambda_2); the major one reaches the largest gradient
      var ra = gmax * gs, rb = M.l1 > 1e-12 ? ra * Math.sqrt(M.l2 / M.l1) : 0;
      if (M.l1 >= TAU) { ellipse(gctx, PS / 2, oy, ra, rb, M.th); gctx.stroke(); }
      // flow constraints
      frame(fctx, T.flow);
      var R = 4, fs = (PS / 2 - 8) / R;
      function U(u) { return PS / 2 + u * fs; }
      function V(v) { return oy + v * fs; }
      fctx.save(); fctx.beginPath(); fctx.rect(0, 16, PS, PS - 16); fctx.clip();
      var list = [];
      for (y = cy - h; y <= cy + h; y++) for (x = cx - h; x <= cx + h; x++) {
        var k3 = y * IW + x;
        list.push([GX[k3], GY[k3], sampleJ(x, y) - I[k3]]);
      }
      list.sort(function (a, b) { return (b[0] * b[0] + b[1] * b[1]) - (a[0] * a[0] + a[1] * a[1]); });
      fctx.strokeStyle = "rgba(148,103,189,0.45)"; fctx.lineWidth = 1;
      for (var q = 0; q < Math.min(70, list.length); q++) {
        var gx = list[q][0], gy = list[q][1], it = list[q][2], gn = Math.hypot(gx, gy);
        if (gn < 1e-3) break;
        // points on the line gx u + gy v = -it: foot of the perpendicular plus/minus the tangent
        var fu = -it * gx / (gn * gn), fv = -it * gy / (gn * gn), tu = -gy / gn, tv = gx / gn;
        fctx.beginPath(); fctx.moveTo(U(fu - 12 * tu), V(fv - 12 * tv)); fctx.lineTo(U(fu + 12 * tu), V(fv + 12 * tv)); fctx.stroke();
      }
      var lk = lucasKanade(cx, cy, h, M);
      if (lk.ill && !lk.flat) {
        var ex = -Math.sin(M.th), ey = Math.cos(M.th);
        fctx.strokeStyle = "#2ca02c"; fctx.lineWidth = 2; fctx.setLineDash([5, 4]);
        fctx.beginPath(); fctx.moveTo(U(lk.d[0] - 12 * ex), V(lk.d[1] - 12 * ey)); fctx.lineTo(U(lk.d[0] + 12 * ex), V(lk.d[1] + 12 * ey)); fctx.stroke();
        fctx.setLineDash([]);
      }
      fctx.fillStyle = "#d62728";
      fctx.beginPath(); fctx.arc(U(S.u), V(S.v), 5.5, 0, 2 * Math.PI); fctx.fill();
      fctx.strokeStyle = "#2ca02c"; fctx.lineWidth = 2.5;
      fctx.beginPath(); fctx.arc(U(lk.d[0]), V(lk.d[1]), 8, 0, 2 * Math.PI); fctx.stroke();
      fctx.restore();
      fctx.fillStyle = "#666"; fctx.font = "11px system-ui, sans-serif"; fctx.textAlign = "right"; fctx.textBaseline = "bottom";
      fctx.fillText("\u00b1" + R + " px", PS - 4, PS - 3);
      // text
      var err = Math.hypot(lk.d[0] - S.u, lk.d[1] - S.v);
      info.innerHTML =
        "\u03bb\u2081 = " + M.l1.toFixed(4) + ", \u03bb\u2082 = " + M.l2.toFixed(4) +
        ", \u03bb\u2082/\u03bb\u2081 = " + (M.l1 > 1e-9 ? (M.l2 / M.l1).toFixed(3) : "\u2013") + "<br>" +
        "R = " + M.R.toExponential(2) + " &nbsp; \u2192 <b style=\"color:" + clsCol + "\">" + cls + "</b><br>" +
        '<span style="color:#2ca02c">\u25ef</span> ' + T.lk + ": (" + lk.d[0].toFixed(2) + ", " + lk.d[1].toFixed(2) + ") &nbsp; " +
        '<span style="color:#d62728">\u25cf</span> ' + T.truth + ": (" + S.u.toFixed(1) + ", " + S.v.toFixed(1) + ")" +
        (lk.ill ? "<br><b>" + (lk.flat ? T.none : T.normal) + "</b>" : " &nbsp; |\u0394| = " + err.toFixed(2) + " px") + "<br>" +
        '<span style="color:#777">' + T.hint + "</span>";
    }

    function move(e) {
      var rc = cv.getBoundingClientRect();
      S.cx = Math.round((e.clientX - rc.left) / SC - 0.5);
      S.cy = Math.round((e.clientY - rc.top) / SC - 0.5);
      draw();
    }
    var dragging = false;
    cv.addEventListener("pointerdown", function (e) { dragging = true; cv.setPointerCapture(e.pointerId); e.preventDefault(); move(e); });
    cv.addEventListener("pointermove", function (e) { if (dragging) move(e); });
    cv.addEventListener("pointerup", function () { dragging = false; });
    cv.addEventListener("pointercancel", function () { dragging = false; });

    build();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function init() {
    document.querySelectorAll('[data-widget="3d-vision-structure-tensor"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
